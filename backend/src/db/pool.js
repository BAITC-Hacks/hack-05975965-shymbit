import pg from 'pg';

export function databaseError(error) {
  if (error?.safeDatabaseError) return error;
  let status = 503;
  let message = 'База данных временно недоступна. Повторите попытку позже.';
  if (error?.code === '23505') { status = 409; message = 'Такая запись уже существует.'; }
  if (error?.code === '23503') { status = 409; message = 'Связанная запись отсутствует или используется.'; }
  if (['23514', '23502', '22P02'].includes(error?.code)) { status = 400; message = 'Некорректные данные записи.'; }
  return Object.assign(new Error(message), { status, safeDatabaseError: true });
}

export function storageError(message, status = 409) {
  return Object.assign(new Error(message), { status, safeDatabaseError: true });
}

function positive(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 600000) throw storageError('Некорректная настройка пула БД.', 500);
  return number;
}

export function createPool(config) {
  let url;
  try {
    url = new URL(config.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch { throw storageError('Укажите корректный DATABASE_URL для PostgreSQL.', 500); }
  const mode = config.dbSslMode || 'verify-full';
  if (!['disable', 'require', 'verify-full'].includes(mode)) throw storageError('Неизвестный DB_SSL_MODE.', 500);
  // Единый источник TLS-настроек: параметры URL не должны отключать проверку сертификата.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'verify-full' },
    max: positive(config.dbPoolMax, 5),
    connectionTimeoutMillis: positive(config.dbConnectTimeoutMs, 5000),
    idleTimeoutMillis: 30000,
    statement_timeout: positive(config.dbStatementTimeoutMs, 10000),
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 15000,
    application_name: 'ai-sana-challenge-hub',
    ...(config.dbSchema ? { options: `-c search_path=${validateSchema(config.dbSchema)}` } : {})
  });
  pool.on('error', () => console.error('Потеряно простаивающее соединение с БД.'));
  return pool;
}

export function validateSchema(name) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw storageError('Недопустимое имя схемы БД.', 500);
  return name;
}

export async function transaction(pool, operation) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw databaseError(error);
  } finally { client?.release(); }
}
