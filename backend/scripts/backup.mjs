import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { open, unlink } from 'node:fs/promises';
import { config } from '../src/config.js';

// URL и пароль передаются дочерней утилите только через окружение, не argv.
let handle;
let ownedFile;
try {
  const { values } = parseArgs({ options: { file: { type: 'string' } } });
  if (!values.file || !config.databaseUrl) throw new Error();
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  const mode = config.dbSslMode;
  if (!['disable', 'require', 'verify-full'].includes(mode)) throw new Error();
  handle = await open(values.file, 'wx', 0o600);
  ownedFile = values.file;
  const env = {
    ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: mode, PGCONNECT_TIMEOUT: '10'
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], { env, stdio: ['ignore', handle.fd, 'pipe'] });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error()));
  });
  await handle.close();
  handle = null;
  ownedFile = null;
  console.log('Резервная копия создана. Храните её вне репозитория и проверьте восстановление.');
} catch {
  await handle?.close();
  if (ownedFile) await unlink(ownedFile).catch(() => {});
  console.error('Копия не создана: проверьте DATABASE_URL, DB_SSL_MODE, наличие pg_dump и новый путь --file. Существующие файлы не перезаписываются.');
  process.exitCode = 1;
}
