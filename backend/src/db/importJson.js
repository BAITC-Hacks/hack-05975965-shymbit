import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { taskCreateSchema, teamCreateSchema, applicationCreateSchema, teamReviewCreateSchema, assistantPlanSchema } from '../validation.js';
import { decode, insertRecord } from './records.js';
import { storageError, transaction } from './pool.js';

const uuid = z.string().uuid();
const date = z.string().datetime({ offset: true });
const identity = { id: uuid, createdAt: date };
const owner = { ownerId: uuid.optional() };
const schemas = {
  users: z.object({ ...identity, name: z.string().min(2), email: z.string().email().transform((v) => v.toLowerCase()),
    role: z.enum(['business', 'student']), passwordHash: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/) }).strict(),
  sessions: z.object({ tokenHash: z.string().regex(/^[a-f0-9]{64}$/), userId: uuid, expiresAt: date }).strict(),
  tasks: taskCreateSchema.extend({ ...identity, ...owner, updatedAt: date,
    status: z.enum(['draft', 'needs_clarification', 'ready', 'published', 'archived']),
    skills: z.array(z.string()).default([]), technologies: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.object({ id: z.string().min(1), question: z.string(), answer: z.string() }).strict()).default([]),
    card: z.record(z.unknown()).nullable().default(null), readinessScore: z.number().int().min(0).max(100),
    readinessExplanation: z.string(), publishedAt: date.nullable().default(null)
  }).strict(),
  teams: teamCreateSchema.extend({ ...identity, ...owner, updatedAt: date, rating: z.object({ average: z.number(), reviewsCount: z.number().int() }).optional() }).strict(),
  applications: applicationCreateSchema.extend({ ...identity, ...owner, taskId: uuid, updatedAt: date, status: z.enum(['submitted', 'reviewed', 'accepted', 'rejected']) }).strict(),
  reviews: teamReviewCreateSchema.extend({ ...identity, authorId: uuid.optional(), teamId: uuid }).strict(),
  assistantPlans: z.object({ ...identity, taskId: uuid, teamId: uuid, plan: assistantPlanSchema }).strict(),
  ownershipMigrations: z.object({ ...identity, collection: z.enum(['tasks', 'teams', 'applications']), ownerId: uuid }).strict()
};
const tables = { users: 'users', sessions: 'sessions', tasks: 'tasks', teams: 'teams', applications: 'applications', reviews: 'reviews', assistantPlans: 'assistant_plans', ownershipMigrations: 'ownership_migrations' };

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
    if (new Set(parsed.data.map((row) => name === 'sessions' ? row.tokenHash : name === 'ownershipMigrations' ? `${row.collection}:${row.id}` : row.id)).size !== parsed.data.length) throw storageError(`Повторяющиеся ID в ${name}.`, 400);
  }
  const tasks = new Set(result.tasks.map((row) => row.id));
  const teams = new Set(result.teams.map((row) => row.id));
  const users = new Map(result.users.map((row) => [row.id, row]));
  if (new Set(result.users.map((row) => row.email)).size !== result.users.length) throw storageError('Повторяющиеся почтовые адреса.', 400);
  for (const [name, role] of Object.entries({ tasks: 'business', teams: 'student', applications: 'student', reviews: 'business' })) {
    for (const row of result[name]) {
      const ownerId = row.ownerId || row.authorId;
      if (ownerId && users.get(ownerId)?.role !== role) throw storageError(`Некорректный владелец в ${name}.`, 400);
    }
  }
  for (const row of result.sessions) if (!users.has(row.userId)) throw storageError('Сессия без аккаунта.', 400);
  for (const row of result.ownershipMigrations) {
    if (!result[row.collection].some((item) => item.id === row.id && item.ownerId === row.ownerId)) throw storageError('Некорректный журнал владельцев.', 400);
  }
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
    for (const key of ['createdAt', 'updatedAt', 'publishedAt', 'expiresAt']) if (row[key]) row[key] = new Date(row[key]).toISOString();
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
    await client.query('LOCK TABLE users, sessions, tasks, teams, applications, reviews, assistant_plans, ownership_migrations IN SHARE ROW EXCLUSIVE MODE');
    let inserted = 0;
    for (const [name, table] of Object.entries(tables)) {
      for (const source of data[name]) {
        const existing = await client.query(`SELECT * FROM ${table} WHERE ${name === 'sessions' ? 'token_hash' : 'id'}=$1${name === 'ownershipMigrations' ? ' AND collection=$2' : ''}`,
          name === 'ownershipMigrations' ? [source.id, source.collection] : [name === 'sessions' ? source.tokenHash : source.id]);
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
