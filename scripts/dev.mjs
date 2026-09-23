import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { findAvailablePort, superviseBackend, waitForHealth } from './dev-runtime.mjs';

const root = new URL('../', import.meta.url);
const backendDirectory = fileURLToPath(new URL('backend/', root));
const frontendDirectory = fileURLToPath(new URL('frontend/', root));
let backend;
let frontend;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (frontend && frontend.exitCode === null) frontend.kill();
  await backend?.stop();
  process.exitCode = code;
}

process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
if (process.send) process.on('message', (message) => {
  if (message === 'stop') { process.disconnect(); void stop(); }
});

try {
  for (const dependency of ['backend/node_modules/express/package.json', 'backend/node_modules/pg/package.json', 'frontend/node_modules/vite/bin/vite.js']) {
    await access(fileURLToPath(new URL(dependency, root))).catch(() => {
      throw new Error('Не установлены зависимости. Выполните npm run setup из корня проекта.');
    });
  }
  // Конфигурацию читаем в отдельном процессе backend; ключ не наследуется frontend.
  const { readBackendPort } = await import('./dev-runtime.mjs');
  const preferredPort = await readBackendPort(backendDirectory);
  const port = await findAvailablePort(preferredPort);
  if (stopping) process.exit(0);
  if (port !== preferredPort) console.log(`Порт ${preferredPort} занят. Backend будет запущен на свободном порту ${port}.`);
  const apiUrl = `http://127.0.0.1:${port}`;
  backend = superviseBackend({
    directory: backendDirectory,
    port,
    onFailure: (error) => {
      console.error(error.message);
      void stop(1);
    },
  });
  await waitForHealth(apiUrl);
  if (!stopping) {
    // В едином режиме frontend всегда подключается к запущенному здесь серверу.
    const frontendEnv = { ...process.env, VITE_API_URL: apiUrl, VITE_USE_MOCK_API: 'false' };
    for (const key of Object.keys(frontendEnv)) {
      if (key.startsWith('AI_') || key.startsWith('DB_') || key.startsWith('PG') || key.endsWith('DATABASE_URL')) delete frontendEnv[key];
    }
    frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
      cwd: frontendDirectory, env: frontendEnv, stdio: 'inherit',
    });
    frontend.on('error', () => {
      console.error('Не удалось запустить frontend. Проверьте установку зависимостей.');
      void stop(1);
    });
    frontend.on('exit', (code) => { void stop(code ?? 0); });
    console.log(`Backend готов: ${apiUrl}. Откройте адрес Local, который покажет Vite ниже.`);
    console.log('Изменения backend и backend/.env применяются автоматически. Ctrl+C останавливает обе части.');
  }
} catch (error) {
  if (!stopping) console.error(error.message);
  await stop(1);
}
