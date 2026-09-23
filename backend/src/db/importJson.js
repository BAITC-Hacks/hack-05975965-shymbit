import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { taskCreateSchema, teamCreateSchema, applicationCreateSchema, teamReviewCreateSchema, assistantPlanSchema } from '../validation.js';
import { decode, insertRecord } from './records.js';
import { storageError, transaction } from './pool.js';

const uuid = z.string().uuid();
const date = z.string().datetime({ offset: true });
const identity = { id: uuid, createdAt: date };
const schemas = {
  tasks: taskCreateSchema.extend({ ...identity, updatedAt: date,
    status: z.enum(['draft', 'needs_clarification', 'ready', 'published', 'archived']),
    skills: z.array(z.string()).default([]), technologies: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.object({ id: z.string().min(1), question: z.string(), answer: z.string() }).strict()).default([]),
    card: z.record(z.unknown()).nullable().default(null), readinessScore: z.number().int().min(0).max(100),
    readinessExplanation: z.string(), publishedAt: date.nullable().default(null)
  }).strict(),
  teams: teamCreateSchema.extend({ ...identity, updatedAt: date, rating: z.object({ average: z.number(), reviewsCount: z.number().int() }).optional() }).strict(),
  applications: applicationCreateSchema.extend({ ...identity, taskId: uuid, updatedAt: date, status: z.enum(['submitted', 'reviewed', 'accepted', 'rejected']) }).strict(),
  reviews: teamReviewCreateSchema.extend({ ...identity, teamId: uuid }).strict(),
  assistantPlans: z.object({ ...identity, taskId: uuid, teamId: uuid, plan: assistantPlanSchema }).strict()
};
const tables = { tasks: 'tasks', teams: 'teams', applications: 'applications', reviews: 'reviews', assistantPlans: 'assistant_plans' };

export function validateImport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !schemas[key])) throw storageError('Неизвестная структура JSON-хранилища.', 400);
  const result = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const parsed = z.array(schema).safeParse(raw[name] ?? []);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw storageError(`Некорректные данные: ${name}, поле ${issue.path.join('.')}. Импорт отменён.`, 400);
    }
    result[name] = parsed.data;
    if (new Set(parsed.data.map((row) => row.id)).size !== parsed.data.length) throw storageError(`Повторяющиеся ID в ${name}.`, 400);
  }
  const tasks = new Set(result.tasks.map((row) => row.id));
  const teams = new Set(result.teams.map((row) => row.id));
  for (const name of ['applications', 'reviews', 'assistantPlans']) {
    for (const row of result[name]) {
      if (!tasks.has(row.taskId) || (row.teamId && !teams.has(row.teamId))) throw storageError(`Нарушена связь в ${name}. Импорт отменён.`, 400);
    }
  }
  const reviews = new Set();
  for (const row of result.reviews) {
    const key = JSON.stringify([row.teamId, row.taskId, row.authorName.trim().toLocaleLowerCase()]);
    if (reviews.has(key)) throw storageError('Дублирующиеся отзывы. Импорт отменён.', 400);
    reviews.add(key);
  }
  // Приводим даты к тому же виду, который возвращает API PostgreSQL.
  for (const rows of Object.values(result)) for (const row of rows) {
    for (const key of ['createdAt', 'updatedAt', 'publishedAt']) if (row[key]) row[key] = new Date(row[key]).toISOString();
    if ('rating' in row) delete row.rating;
  }
  return result;
}

export async function importJson(pool, raw, { apply = false } = {}) {
  const data = validateImport(raw);
  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));
  if (!apply) return { applied: false, counts };
  return transaction(pool, async (client) => {
    // Разовый перенос: не допускаем параллельных записей между проверкой и вставкой.
    await client.query('LOCK TABLE tasks, teams, applications, reviews, assistant_plans IN SHARE ROW EXCLUSIVE MODE');
    let inserted = 0;
    for (const [name, table] of Object.entries(tables)) {
      for (const source of data[name]) {
        const existing = await client.query(`SELECT * FROM ${table} WHERE id=$1`, [source.id]);
        if (existing.rowCount) {
          const current = decode(table, existing.rows[0]);
          delete current.rating;
          if (!isDeepStrictEqual(current, source)) throw storageError(`Конфликт существующей записи в ${name}. Весь импорт отменён.`);
          continue;
        }
        await insertRecord(client, table, name === 'reviews' ? { ...source, normalizedAuthor: source.authorName.trim().toLocaleLowerCase() } : source);
        inserted++;
      }
    }
    return { applied: true, counts, inserted };
  });
}
