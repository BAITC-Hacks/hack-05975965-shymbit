import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databaseError, storageError } from './pool.js';

const directory = new URL('../../migrations/', import.meta.url);
async function migrations(source = directory) {
  return Promise.all((await readdir(source)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map(async (name) => {
    const sql = await readFile(new URL(name, source), 'utf8');
    // Перенос Windows -> Linux не должен менять контрольную сумму SQL.
    const normalized = sql.replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(normalized).digest('hex');
    const legacyChecksum = createHash('sha256').update(normalized.replace(/\n/g, '\r\n')).digest('hex');
    return { name, sql, checksum, checksums: [checksum, legacyChecksum] };
  }));
}

export async function migrate(pool, source = directory) {
  const files = await migrations(source);
  let client;
  try {
    client = await pool.connect();
    // Одна сессия удерживает блокировку, в том числе между транзакциями миграций.
    await client.query("SELECT pg_advisory_lock(hashtext(current_database()), hashtext(current_schema() || ':sana-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of files) {
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [file.name]);
      if (existing.rowCount) {
        if (!file.checksums.includes(existing.rows[0].checksum)) throw storageError('Изменена ранее применённая миграция. Создайте новую миграцию.', 500);
        continue;
      }
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [file.name, file.checksum]);
      await client.query('COMMIT');
    }
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw databaseError(error);
  } finally {
    if (client) {
      let broken = false;
      try { await client.query('SELECT pg_advisory_unlock_all()'); } catch { broken = true; }
      client.release(broken);
    }
  }
}

export async function checkSchema(pool) {
  try {
    const applied = await pool.query('SELECT name, checksum FROM schema_migrations');
    for (const file of await migrations()) {
      if (!applied.rows.some((row) => row.name === file.name && file.checksums.includes(row.checksum))) throw new Error();
    }
  } catch { throw storageError('База данных недоступна или схема не готова. Проверьте подключение и выполните npm run db:migrate.', 503); }
}
