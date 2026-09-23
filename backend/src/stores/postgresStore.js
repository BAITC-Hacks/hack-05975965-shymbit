import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createPool, databaseError, storageError, transaction } from '../db/pool.js';
import { checkSchema } from '../db/migrate.js';
import { decode, insertRecord, updateRecord, recordVersion } from '../db/records.js';

const validId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const now = () => new Date().toISOString();
const teamSelect = `SELECT t.*, COALESCE(r.average,0) AS rating_average, COALESCE(r.count,0) AS reviews_count
  FROM teams t LEFT JOIN (SELECT team_id, round(avg(score),1) AS average, count(*) AS count FROM reviews GROUP BY team_id) r ON r.team_id=t.id`;

export async function createPostgresStore(config) {
  const pool = createPool(config);
  try { await checkSchema(pool); } catch (error) { await pool.end(); throw error; }
  const query = async (sql, values = []) => {
    try { return await pool.query(sql, values); } catch (error) { throw databaseError(error); }
  };
  const rowTask = (row) => {
    const value = decode('tasks', row);
    return value;
  };
  const get = async (table, id) => {
    if (!validId(id)) return null;
    const result = await query(table === 'teams' ? `${teamSelect} WHERE t.id=$1` : `SELECT * FROM ${table} WHERE id=$1`, [id]);
    return table === 'tasks' ? rowTask(result.rows[0]) : decode(table, result.rows[0]);
  };
  const list = async (table, where = '', args = [], order = 'created_at, id') => {
    const result = await query(`SELECT * FROM ${table} ${where} ORDER BY ${order}`, args);
    return result.rows.map((row) => table === 'tasks' ? rowTask(row) : decode(table, row));
  };
  const lockTask = async (client, id, published = false) => {
    const result = await client.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [id]);
    if (!result.rowCount) throw storageError('Задача не найдена.', 404);
    if (published && result.rows[0].status !== 'published') throw storageError('Действие доступно только для опубликованной задачи.');
    return result.rows[0];
  };
  return {
    close: () => pool.end(),
    async checkHealth() { await query('SELECT 1'); },
    createUser(data) {
      return transaction(pool, async (client) => {
        const result = await client.query(`INSERT INTO users(id,name,email,role,password_hash,created_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING RETURNING *`,
        [randomUUID(), data.name, data.email, data.role, data.passwordHash, now()]);
        if (!result.rowCount) throw storageError('Аккаунт с такой почтой уже существует.', 409);
        return decode('users', result.rows[0]);
      });
    },
    getUser: (id) => get('users', id),
    async findUserByEmail(email) { return decode('users', (await query('SELECT * FROM users WHERE email=$1', [email])).rows[0]); },
    createSession(data) {
      return transaction(pool, async (client) => {
        await client.query('DELETE FROM sessions WHERE expires_at <= now()');
        return insertRecord(client, 'sessions', data);
      });
    },
    async getSession(hash) { return decode('sessions', (await query('SELECT * FROM sessions WHERE token_hash=$1', [hash])).rows[0]); },
    async deleteSession(hash) { await query('DELETE FROM sessions WHERE token_hash=$1', [hash]); },
    assignLegacyOwner(collection, id, ownerId) {
      const role = { tasks: 'business', teams: 'student', applications: 'student' }[collection];
      if (!role || !validId(id) || !validId(ownerId)) throw storageError('Некорректный объект или владелец.');
      return transaction(pool, async (client) => {
        const user = await client.query('SELECT role FROM users WHERE id=$1', [ownerId]);
        if (user.rows[0]?.role !== role) throw storageError('Роль аккаунта не соответствует объекту.');
        const result = await client.query(`UPDATE ${collection} SET owner_id=$2, updated_at=$3
          ${collection === 'tasks' ? ', version=version+1' : ''} WHERE id=$1 AND owner_id IS NULL RETURNING *`, [id, ownerId, now()]);
        if (!result.rowCount) throw storageError('Объект не найден или уже имеет владельца.');
        await insertRecord(client, 'ownership_migrations', { collection, id, ownerId, createdAt: now() });
        return decode(collection, result.rows[0]);
      });
    },
    createTask(data) {
      const date = now();
      return transaction(pool, (client) => insertRecord(client, 'tasks', {
        ...data, id: randomUUID(), status: data.status || 'draft', skills: data.skills || [], technologies: data.technologies || [],
        clarificationQuestions: [], card: null, readinessScore: 0,
        readinessExplanation: 'Задача ещё не прошла уточнение.', createdAt: date, updatedAt: date, publishedAt: null
      }));
    },
    listTasks: () => list('tasks'),
    getTask: (id) => get('tasks', id),
    async updateTask(id, patch, expectedTask) {
      if (!validId(id)) return null;
      return transaction(pool, async (client) => {
        const { rows } = await client.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [id]);
        if (!rows.length) return null;
        const current = rowTask(rows[0]);
        if (expectedTask && (!isDeepStrictEqual(current, expectedTask)
          || (expectedTask[recordVersion] !== undefined && expectedTask[recordVersion] !== rows[0].version))) {
          throw storageError('Задача была изменена другим запросом. Обновите данные и повторите действие.');
        }
        const changes = typeof patch === 'function' ? patch(structuredClone(current)) : patch;
        if (!changes) return current;
        return updateRecord(client, 'tasks', id, { ...changes, updatedAt: now() });
      });
    },
    createApplication(data) {
      return transaction(pool, async (client) => {
        await lockTask(client, data.taskId, true);
        const date = now();
        return insertRecord(client, 'applications', { ...data, id: randomUUID(), status: 'submitted', createdAt: date, updatedAt: date });
      });
    },
    listApplications: (taskId) => !taskId ? list('applications') : validId(taskId) ? list('applications', 'WHERE task_id=$1', [taskId]) : Promise.resolve([]),
    getApplication: (id) => get('applications', id),
    async updateApplication(id, patch) {
      if (!validId(id)) return null;
      return transaction(pool, async (client) => {
        const existing = await client.query('SELECT task_id FROM applications WHERE id=$1', [id]);
        if (!existing.rowCount) return null;
        // Общий порядок блокировок с отзывами и архивированием: задача, затем связанные записи.
        await lockTask(client, existing.rows[0].task_id);
        return updateRecord(client, 'applications', id, { status: patch.status, updatedAt: now() });
      });
    },
    createTeam(data) {
      const date = now();
      return transaction(pool, (client) => insertRecord(client, 'teams', { ...data, id: randomUUID(), createdAt: date, updatedAt: date }));
    },
    async listTeams() { return (await query(`${teamSelect} ORDER BY t.created_at, t.id`)).rows.map((row) => decode('teams', row)); },
    getTeam: (id) => get('teams', id),
    async updateTeam(id, patch, expectedTeam) {
      if (!validId(id)) return null;
      return transaction(pool, async (client) => {
        const locked = await client.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
        if (!locked.rowCount) return null;
        const current = decode('teams', (await client.query(`${teamSelect} WHERE t.id=$1`, [id])).rows[0]);
        if (expectedTeam && !isDeepStrictEqual(current, expectedTeam)) throw storageError('Профиль изменился. Обновите данные.');
        const updated = await updateRecord(client, 'teams', id, { ...patch, updatedAt: now() });
        if (!updated) return null;
        return decode('teams', (await client.query(`${teamSelect} WHERE t.id=$1`, [id])).rows[0]);
      });
    },
    listReviews: (teamId) => validId(teamId) ? list('reviews', 'WHERE team_id=$1', [teamId], 'created_at DESC, id') : Promise.resolve([]),
    createReview(data) {
      return transaction(pool, async (client) => {
        await lockTask(client, data.taskId);
        const accepted = await client.query("SELECT id FROM applications WHERE task_id=$1 AND team_id=$2 AND status='accepted'", [data.taskId, data.teamId]);
        if (!accepted.rowCount) throw storageError('Оставить отзыв можно после принятия отклика этой команды.');
        const normalizedAuthor = data.authorName.trim().toLocaleLowerCase();
        const result = await client.query(`INSERT INTO reviews(id,task_id,team_id,author_name,normalized_author,score,text,created_at,author_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *`,
        [randomUUID(), data.taskId, data.teamId, data.authorName, normalizedAuthor, data.score, data.text, now(), data.authorId || null]);
        if (!result.rowCount) return null;
        await client.query('UPDATE teams SET updated_at=$2 WHERE id=$1', [data.teamId, now()]);
        return decode('reviews', result.rows[0]);
      });
    },
    async hasAcceptedApplication(taskId, teamId) {
      if (!validId(taskId) || !validId(teamId)) return false;
      return Boolean((await query("SELECT 1 FROM applications WHERE task_id=$1 AND team_id=$2 AND status='accepted' LIMIT 1", [taskId, teamId])).rowCount);
    },
    async hasApplicationReview(teamId, taskId, authorName) {
      if (!validId(taskId) || !validId(teamId)) return false;
      return Boolean((await query('SELECT 1 FROM reviews WHERE team_id=$1 AND task_id=$2 AND normalized_author=$3', [teamId, taskId, authorName.trim().toLocaleLowerCase()])).rowCount);
    },
    createAssistantPlan(data) {
      return transaction(pool, async (client) => {
        await lockTask(client, data.taskId, true);
        return insertRecord(client, 'assistant_plans', { ...data, id: randomUUID(), createdAt: now() });
      });
    },
    listAssistantPlans(taskId, teamId) {
      if (!validId(taskId) || (teamId && !validId(teamId))) return Promise.resolve([]);
      return list('assistant_plans', `WHERE task_id=$1${teamId ? ' AND team_id=$2' : ''}`, teamId ? [taskId, teamId] : [taskId], 'created_at DESC, id');
    },
    getAssistantPlan: (id) => get('assistant_plans', id)
  };
}
