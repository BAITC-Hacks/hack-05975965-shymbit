import { createJsonStore } from '../store.js';
import { createPostgresStore } from './postgresStore.js';
import { storageError } from '../db/pool.js';

export function resolveDriver(config) {
  const driver = config.storageDriver || (config.databaseUrl ? 'postgres' : 'json');
  if (!['postgres', 'json'].includes(driver)) throw storageError('STORAGE_DRIVER должен быть json или postgres.', 500);
  if (config.nodeEnv === 'production' && driver !== 'postgres') throw storageError('В production требуется PostgreSQL и DATABASE_URL. JSON-хранилище запрещено.', 500);
  if (driver === 'postgres' && !config.databaseUrl) throw storageError('Для PostgreSQL необходимо задать DATABASE_URL.', 500);
  return driver;
}

export function createStore(config) {
  return resolveDriver(config) === 'postgres' ? createPostgresStore(config) : createJsonStore(config.dbFile);
}
