import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { access } from 'node:fs/promises';
import { config } from '../src/config.js';
import { createPool } from '../src/db/pool.js';

let pool;
try {
  const { values } = parseArgs({ options: { file: { type: 'string' }, apply: { type: 'boolean' } } });
  const target = process.env.RESTORE_DATABASE_URL;
  if (!values.file || !values.apply || !target) throw new Error();
  await access(values.file);
  const url = new URL(target);
  if (config.databaseUrl) {
    const source = new URL(config.databaseUrl);
    if (url.hostname === source.hostname && url.port === source.port && url.pathname === source.pathname) throw new Error();
  }
  const mode = process.env.RESTORE_DB_SSL_MODE || 'verify-full';
  pool = createPool({ ...config, databaseUrl: target, dbSslMode: mode });
  const tables = await pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1");
  if (tables.rowCount) throw new Error();
  await pool.end();
  pool = null;
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: mode, PGCONNECT_TIMEOUT: '10' };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  const child = spawn('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', env.PGDATABASE, values.file], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error()));
  });
  console.log('Копия восстановлена в отдельную БД. Проверьте данные до переключения приложения.');
} catch {
  console.error('Восстановление не выполнено. Нужны --file, --apply, pg_restore и RESTORE_DATABASE_URL отдельной пустой БД. Проверьте TLS и доступ.');
  process.exitCode = 1;
} finally { await pool?.end(); }
