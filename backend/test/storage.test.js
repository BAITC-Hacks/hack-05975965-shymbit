import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDriver, createStore } from '../src/stores/index.js';
import { createPool, databaseError } from '../src/db/pool.js';
import { validateImport } from '../src/db/importJson.js';
import { createApp } from '../src/app.js';
import { once } from 'node:events';

test('production не переключается на JSON при ошибке конфигурации', async () => {
  assert.equal(resolveDriver({}), 'json');
  assert.equal(resolveDriver({ databaseUrl: 'postgresql://example/db' }), 'postgres');
  assert.throws(() => resolveDriver({ nodeEnv: 'production' }), /production/);
  assert.throws(() => resolveDriver({ nodeEnv: 'production', storageDriver: 'json', databaseUrl: 'postgresql://example/db' }), /production/);
  assert.throws(() => resolveDriver({ storageDriver: 'postgres' }), /DATABASE_URL/);
  await assert.rejects(() => createStore({ databaseUrl: 'postgresql://user:secret@127.0.0.1:1/db', dbSslMode: 'disable', dbConnectTimeoutMs: 100 }), (error) => !error.message.includes('secret'));
});

test('TLS задаётся явно, URL и ошибки не раскрывают секреты', async () => {
  const pool = createPool({ databaseUrl: 'postgresql://user:secret@localhost/db?sslmode=disable', dbSslMode: 'verify-full' });
  assert.deepEqual(pool.options.ssl, { rejectUnauthorized: true });
  assert.ok(!pool.options.connectionString.includes('sslmode'));
  await pool.end();
  assert.throws(() => createPool({ databaseUrl: 'SECRET' }), (error) => !error.message.includes('SECRET'));
  assert.equal(databaseError({ message: 'secret', code: '23505' }).status, 409);
  assert.ok(!databaseError({ message: 'secret' }).message.includes('secret'));
});

test('импорт проверяет структуру без доступа к БД', () => {
  assert.deepEqual(validateImport({}), { tasks: [], teams: [], applications: [], reviews: [], assistantPlans: [], users: [], sessions: [], ownershipMigrations: [] });
  assert.throws(() => validateImport({ tasks: [{ contactPerson: 'SECRET' }] }), (error) => !error.message.includes('SECRET'));
  assert.throws(() => validateImport({ unknown: [] }));
});

test('readiness и CORS не раскрывают ошибку хранилища', async (t) => {
  const app = createApp({ store: { async checkHealth() { throw new Error('postgresql://secret'); } }, aiService: {}, production: true, allowedOrigins: ['https://site.example'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/ready`);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret'));
  const allowed = await fetch(`${url}/health`, { headers: { Origin: 'https://site.example' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://site.example');
  assert.equal((await fetch(`${url}/health`, { headers: { Origin: 'https://other.example' } })).status, 403);
});
