import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { config } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { checkSchema } from '../src/db/migrate.js';
import { importJson } from '../src/db/importJson.js';

let pool;
try {
  const { values } = parseArgs({ options: { file: { type: 'string' }, apply: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
  if (!values.file || (values.apply && values['dry-run'])) throw new Error();
  const raw = JSON.parse(await readFile(values.file, 'utf8'));
  // Сначала проверяем источник; dry-run никогда не подключается к БД.
  const preview = await importJson(null, raw);
  if (values.apply) {
    pool = createPool(config);
    await checkSchema(pool);
    console.log(JSON.stringify(await importJson(pool, raw, { apply: true }), null, 2));
    console.log('Перенос завершён. Исходный JSON не изменён.');
  } else {
    console.log(JSON.stringify(preview, null, 2));
    console.log('Проверен только исходный файл. Для записи и проверки конфликтов целевой БД нужен --apply.');
  }
} catch (error) {
  console.error(error.safeDatabaseError ? error.message : 'Импорт не выполнен. Проверьте JSON и аргументы: --file <путь> [--dry-run | --apply].');
  process.exitCode = 1;
} finally { await pool?.end(); }
