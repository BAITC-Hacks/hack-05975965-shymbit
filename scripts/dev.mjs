import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const children = [
  spawn(process.execPath, ['--watch', 'src/server.js'], {
    cwd: fileURLToPath(new URL('backend/', root)), stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--strictPort'], {
    cwd: fileURLToPath(new URL('frontend/', root)), stdio: 'inherit',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => {
    console.error('Не удалось запустить приложение. Установите зависимости в backend и frontend.');
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
