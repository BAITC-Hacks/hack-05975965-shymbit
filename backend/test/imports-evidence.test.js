import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSuggestions } from '../src/imports.js';
import { parseDocument } from '../src/services/documentParser.js';
import { taskCreateSchema } from '../src/validation.js';

const item = (field, value, excerpt = value, page = 1) => ({ field, value, source: { page, excerpt }, warnings: [] });
const validate = (suggestions, text, pages = [{ page: 1, text }]) => validateSuggestions({ suggestions, warnings: [] }, 'task', { pages }, 'brief.pdf');

test('импорт сохраняет подтверждённые поля, пропускает выдуманные и не путает числа', () => {
  const result = validate([
    item('title', 'Учебный помощник'),
    item('organization', 'Выдуманная организация'),
    item('constraints', '50 долларов', 'Бюджет: 150 долларов'),
  ], 'Учебный помощник. Бюджет: 150 долларов.');
  assert.deepEqual(result.suggestions.map((value) => value.field), ['title']);
  assert.ok(result.missingFields.includes('organization'));
  assert.equal(result.warnings.length, 2);
});

test('типографика, пробелы и переносы не делают достоверную цитату ошибочной', () => {
  const result = validate([item('title', 'AI-помощник «Студент»', 'AI-помощник «Студент»')], 'AI‑помощник “Студент”\n');
  assert.equal(result.suggestions.length, 1);
  const wrapped = validate([item('shortDescription', 'Помощник ищет ответы по учебным документам.')], 'Помощник ищет\nответы по учебным\u00a0документам.');
  assert.equal(wrapped.suggestions.length, 1);
});

test('сокращённая цитата и неправильная страница восстанавливаются по полному значению', () => {
  const text = 'Помощник ищет ответы по учебным документам.';
  const result = validate([item('shortDescription', text, 'Помощник ищет…', null)], text);
  assert.equal(result.suggestions[0].source.page, 1);
  assert.equal(result.suggestions[0].source.excerpt, text.toLowerCase());
  assert.ok(result.suggestions[0].warnings.length);
  const ambiguous = validate([item('title', 'Учебный помощник', 'Нет цитаты', null)], '', [
    { page: 1, text: 'Учебный помощник' }, { page: 2, text: 'Учебный помощник' }
  ]);
  assert.equal(ambiguous.suggestions.length, 0);
});

test('структурированный PDF пользователя: все десять полей доступны без выдумывания AI', async () => {
  const buffer = await readFile(new URL('./fixtures/task-brief.pdf', import.meta.url));
  const document = await parseDocument({ buffer, originalname: 'task.pdf', mimetype: 'application/pdf' });
  assert.match(document.pages[0].text, /Название задачи\s*\n/);
  // Модель сократила описание и пересказала результат: используем исходные подписанные поля.
  const result = validateSuggestions({ suggestions: [item('desiredResult', 'Сделать удобный сервис', 'Краткий пересказ', null)], warnings: [] }, 'task', document, 'task.pdf');
  assert.equal(result.suggestions.length, 10);
  assert.equal(result.missingFields.length, 0);
  const values = Object.fromEntries(result.suggestions.map((value) => [value.field, value.value]));
  assert.ok(taskCreateSchema.safeParse(values).success);
  assert.equal(values.title, 'AI-помощник для адаптации первокурсников');
  assert.deepEqual(values.technologies, ['React', 'TypeScript', 'Node.js', 'PostgreSQL']);
  assert.ok(values.desiredResult.includes('не менее 24 правильных ответов на 30 контрольных вопросов'));
  assert.ok(result.suggestions.every((value) => value.source.page === 1));
});

test('повторяющиеся подписи не выбираются автоматически, технические поля запрещены', () => {
  assert.equal(validate([], 'Название задачи\nПервый вариант\nНазвание задачи\nВторой вариант').suggestions.length, 0);
  assert.throws(() => validate([item('ownerId', '123')], '123'), { status: 502 });
});
