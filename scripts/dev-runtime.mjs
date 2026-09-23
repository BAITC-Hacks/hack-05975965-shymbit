import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

export async function readBackendPort(directory) {
  const require = createRequire(path.join(directory, 'package.json'));
  const { parse } = require('dotenv');
  let values = {};
  try { values = parse(await readFile(path.join(directory, '.env'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return Number(process.env.PORT || values.PORT || 3000);
}

export async function findAvailablePort(preferred) {
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65535) {
    throw new Error('PORT должен быть целым числом от 1 до 65535.');
  }
  for (let port = preferred; port <= Math.min(preferred + 30, 65535); port++) {
    const available = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', (error) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
        else reject(error);
      });
      probe.listen(port, () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('Не удалось найти свободный порт для backend. Измените PORT в backend/.env.');
}

export async function waitForHealth(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.service === 'ai-sana-challenge-hub') return;
    } catch { /* Сервер ещё запускается. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Backend не запустился вовремя. Проверьте сообщение сервера выше.');
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill();
  });
}

export function superviseBackend({ directory, port, onFailure, stdio = 'inherit' }) {
  let child;
  let stopped = false;
  let timer;
  let queue = Promise.resolve();
  const intentionalStops = new WeakSet();
  const launch = () => {
    if (stopped) return;
    const processChild = spawn(process.execPath, ['src/server.js'], {
      cwd: directory, env: { ...process.env, PORT: String(port) }, stdio,
    });
    child = processChild;
    processChild.on('error', () => onFailure(new Error('Не удалось запустить процесс backend.')));
    processChild.on('exit', (code) => {
      if (!stopped && !intentionalStops.has(processChild)) {
        onFailure(new Error(`Backend остановился (код ${code ?? 'сигнал'}). Проверьте сообщение сервера выше.`));
      }
    });
  };
  const changed = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      queue = queue.then(async () => {
        if (stopped) return;
        intentionalStops.add(child);
        await stopChild(child);
        if (!stopped) { console.log('Изменения backend обнаружены. Перезапускаем сервер…'); launch(); }
      }).catch(onFailure);
    }, 300);
  };
  const sourceWatcher = watch(path.join(directory, 'src'), { recursive: true }, changed);
  const envWatcher = watch(directory, (_, name) => {
    if (name?.toString() === '.env') changed();
  });
  sourceWatcher.on('error', onFailure);
  envWatcher.on('error', onFailure);
  launch();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      sourceWatcher.close();
      envWatcher.close();
      await queue;
      await stopChild(child);
    },
  };
}
