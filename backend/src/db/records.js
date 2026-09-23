// Все идентификаторы SQL берутся только из этого закрытого списка.
const common = ['id', 'createdAt', 'updatedAt', 'ownerId'];
export const recordVersion = Symbol('taskVersion');
export const fields = {
  tasks: [...common, 'title', 'shortDescription', 'organization', 'contactPerson', 'desiredResult', 'availableData', 'constraints', 'deadline', 'skills', 'technologies', 'status', 'clarificationQuestions', 'card', 'readinessScore', 'readinessExplanation', 'publishedAt'],
  teams: [...common, 'name', 'description', 'members', 'skills', 'technologies', 'projects', 'githubUrls'],
  applications: [...common, 'taskId', 'teamId', 'teamName', 'members', 'solutionDescription', 'technologies', 'contact', 'comment', 'status'],
  reviews: ['id', 'taskId', 'teamId', 'authorId', 'authorName', 'normalizedAuthor', 'score', 'text', 'createdAt'],
  assistant_plans: ['id', 'taskId', 'teamId', 'plan', 'createdAt'],
  users: ['id', 'name', 'email', 'role', 'passwordHash', 'createdAt'],
  sessions: ['tokenHash', 'userId', 'expiresAt'],
  ownership_migrations: ['collection', 'id', 'ownerId', 'createdAt']
};
const jsonFields = new Set(['skills', 'technologies', 'clarificationQuestions', 'card', 'members', 'projects', 'githubUrls', 'plan']);
export const column = (key) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const encode = (key, value) => value == null ? null : jsonFields.has(key) ? JSON.stringify(value) : value;

export function decode(table, row) {
  if (!row) return null;
  const result = {};
  for (const key of fields[table]) {
    if (key === 'normalizedAuthor') continue;
    const value = row[column(key)];
    if (value != null) result[key] = value instanceof Date ? value.toISOString() : value;
    else if (key === 'card' || key === 'publishedAt') result[key] = null;
  }
  if (table === 'teams') result.rating = { average: Number(row.rating_average || 0), reviewsCount: Number(row.reviews_count || 0) };
  if (table === 'tasks') Object.defineProperty(result, recordVersion, { value: row.version });
  return result;
}

export async function insertRecord(client, table, data) {
  const keys = fields[table].filter((key) => data[key] !== undefined);
  const result = await client.query(`INSERT INTO ${table} (${keys.map(column).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map((key) => encode(key, data[key])));
  return decode(table, result.rows[0]);
}

export async function updateRecord(client, table, id, patch) {
  const keys = fields[table].filter((key) => !['id', 'createdAt'].includes(key) && patch[key] !== undefined);
  const assignments = keys.map((key, i) => `${column(key)}=$${i + 2}`);
  if (table === 'tasks') assignments.push('version=version+1');
  const result = await client.query(`UPDATE ${table} SET ${assignments.join(',')} WHERE id=$1 RETURNING *`, [id, ...keys.map((key) => encode(key, patch[key]))]);
  return decode(table, result.rows[0]);
}
