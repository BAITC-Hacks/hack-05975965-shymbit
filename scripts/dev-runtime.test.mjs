import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { findAvailablePort, superviseBackend, waitForHealth } from './dev-runtime.mjs';

async function reserve() {
  const server = net.createServer();
  server.listen(0);
  await once(server, 'listening');
  return server;
}

test('Занятый порт не требует завершать чужой процесс', async (t) => {
  const existing = await reserve();
  t.after(() => new Promise((resolve) => existing.close(resolve)));
  const preferred = existing.address().port;
  const free = await findAvailablePort(preferred);
  assert.notEqual(free, preferred);
  assert.equal(existing.listening, true);
  await assert.rejects(() => findAvailablePort(NaN), /PORT/);
});

test('Изменения исходников и .env перезапускают backend; остановка освобождает порт', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sana-startup-'));
  let supervisor;
  const failures = [];
  try {
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    const script = `import http from 'node:http';
      http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({status:'ok', service:'ai-sana-challenge-hub', pid:process.pid}));
      }).listen(Number(process.env.PORT));`;
    await writeFile(join(directory, 'src/server.js'), script);
    const reservation = await reserve();
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const url = `http://127.0.0.1:${port}`;
    supervisor = superviseBackend({ directory, port, onFailure: (e) => failures.push(e), stdio: 'ignore' });
    await waitForHealth(url);
    const pid = async () => (await (await fetch(`${url}/health`)).json()).pid;
    async function waitForRestart(previous) {
      for (let i = 0; i < 50; i++) {
        try { const current = await pid(); if (current !== previous) return current; } catch { /* Перезапуск. */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail('Сервер не перезапустился');
    }
    const first = await pid();
    await writeFile(join(directory, 'src/server.js'), `${script}\n// Изменение кода`);
    const second = await waitForRestart(first);
    await writeFile(join(directory, '.env'), 'AI_MODEL=test-model\n');
    await waitForRestart(second);
    await supervisor.stop();
    assert.deepEqual(failures, []);
    assert.equal(await findAvailablePort(port), port);
    await assert.rejects(() => fetch(`${url}/health`));
  } finally {
    await supervisor?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Падение сервера передаётся управляющему процессу', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sana-crash-'));
  let supervisor;
  try {
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'src/server.js'), 'process.exit(1)');
    const failure = new Promise((resolve) => {
      supervisor = superviseBackend({ directory, port: 3000, onFailure: resolve, stdio: 'ignore' });
    });
    assert.match((await failure).message, /код 1/);
  } finally {
    await supervisor?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Единый запуск связывает Vite с новым backend при занятом порте', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sana-launch-'));
  const existing = await reserve();
  let child, closed, apiUrl;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL('./dev.mjs', import.meta.url))], {
      cwd: directory,
      env: { ...process.env, PORT: String(existing.address().port), DB_FILE: join(directory, 'db.json'), NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    closed = once(child, 'exit');
    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });
    let frontendUrl;
    for (let i = 0; i < 150; i++) {
      apiUrl = output.match(/Backend готов: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      frontendUrl = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (apiUrl && frontendUrl) break;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(frontendUrl && apiUrl, output);
    assert.notEqual(Number(new URL(apiUrl).port), existing.address().port);
    assert.equal((await fetch(`${apiUrl}/api/teams`)).status, 200);
    const moduleText = await (await fetch(`${frontendUrl}/src/lib/api.ts`)).text();
    assert.ok(moduleText.includes(apiUrl), 'Frontend должен обращаться к backend этого запуска');
    child.send('stop');
    assert.equal((await closed)[0], 0);
    assert.equal(await findAvailablePort(Number(new URL(apiUrl).port)), Number(new URL(apiUrl).port));
    assert.equal(existing.listening, true);
  } finally {
    if (child && child.exitCode === null && child.connected) { child.send('stop'); await closed; }
    await new Promise((resolve) => existing.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
