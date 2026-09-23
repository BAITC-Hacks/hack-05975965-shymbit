import { config } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

let pool;
try {
  pool = createPool(config);
  await migrate(pool);
  console.log('Миграции PostgreSQL применены.');
} catch (error) {
  console.error(error.safeDatabaseError ? error.message : 'Не удалось применить миграции. Проверьте конфигурацию БД.');
  process.exitCode = 1;
} finally { await pool?.end(); }
