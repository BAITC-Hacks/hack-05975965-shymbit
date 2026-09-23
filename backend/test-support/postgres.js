import { randomUUID } from 'node:crypto';
import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { createPostgresStore } from '../src/stores/postgresStore.js';

export async function postgresFixture() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Для PostgreSQL-тестов задайте TEST_DATABASE_URL отдельной тестовой БД.');
  if (!/(_test|_tests)$/.test(new URL(url).pathname)) throw new Error('Имя тестовой БД должно оканчиваться на _test или _tests.');
  const config = { databaseUrl: url, dbSslMode: process.env.TEST_DB_SSL_MODE || 'disable' };
  const admin = createPool(config);
  const schema = `sana_test_${randomUUID().replaceAll('-', '')}`;
  const pools = [];
  const stores = [];
  let created = false;
  const fixture = {
    config: { ...config, dbSchema: schema },
    pool() { const pool = createPool(fixture.config); pools.push(pool); return pool; },
    async store() { const store = await createPostgresStore(fixture.config); stores.push(store); return store; },
    async close() {
      await Promise.all(stores.map((store) => store.close()));
      await Promise.all(pools.map((pool) => pool.end()));
      // Имя создано здесь, не взято из окружения. public никогда не удаляется.
      if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await migrate(fixture.pool());
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}
