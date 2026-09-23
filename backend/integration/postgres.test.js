import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { postgresFixture } from '../test-support/postgres.js';
import { migrate, checkSchema } from '../src/db/migrate.js';
import { importJson } from '../src/db/importJson.js';
import { createApp } from '../src/app.js';

const draft = { title: 'Проверка базы', shortDescription: 'Описание задачи для проверки PostgreSQL.', organization: 'Университет', contactPerson: 'Координатор', status: 'draft', skills: ['React'], technologies: [], deadline: '2026-12-01' };
const teamDraft = { name: 'Команда', description: 'Разработка учебных проектов', members: [{ name: 'Алия', role: 'Разработчик', skills: ['React'] }], skills: ['React'], technologies: ['React'], projects: [], githubUrls: [] };
const application = (taskId, teamId) => ({ taskId, ...(teamId ? { teamId } : {}), teamName: 'Команда', members: ['Алия'], solutionDescription: 'Создадим прототип решения задачи.', contact: 'test@example.com', technologies: [] });
const makeReady = (task) => ({ title: task.title, problem: 'Проблема', goal: 'Цель', expectedResult: 'Результат', availableData: 'Данные', constraints: 'Ограничения', deadline: '2026-12-01', successCriteria: 'Критерии', skills: ['React'], technologies: [] });

test('PostgreSQL: миграции, API, конкуренция, импорт и сохранность', async (t) => {
  const fixture = await postgresFixture();
  t.after(() => fixture.close());
  const pool = fixture.pool();
  const store = await fixture.store();
  const second = await fixture.store();

  await t.test('повторные и параллельные миграции, контрольная сумма', async () => {
    await Promise.all([migrate(pool), migrate(fixture.pool())]);
    assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '1');
    await pool.query("UPDATE schema_migrations SET checksum='wrong'");
    await assert.rejects(() => migrate(pool), /миграци/);
    await assert.rejects(() => checkSchema(pool));
    // Восстанавливаем только тестовую схему, повторно применяя неизменённую миграцию.
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
    await pool.query('UPDATE schema_migrations SET checksum=$1', [createHash('sha256').update(sql).digest('hex')]);
    await checkSchema(pool);
  });

  await t.test('неудачная миграция откатывает DDL и не попадает в журнал', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sana-migration-test-'));
    try {
      await writeFile(path.join(directory, '002_broken.sql'), 'CREATE TABLE rollback_probe (id integer); SELECT * FROM missing_probe;');
      await assert.rejects(() => migrate(pool, pathToFileURL(directory + path.sep)));
      assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS name")).rows[0].name, null);
      assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '1');
      await migrate(pool);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  let task, team, savedApplication;
  await t.test('HTTP: черновик, AI, публикация, профиль, отклик, архив и восстановление', async () => {
    const server = createApp({ store, aiService: { async generateCard(value) { return makeReady(value); }, async generateQuestions() { return [{ question: 'Какие данные?' }]; } } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = async (method, route, body, status = 200) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    };
    try {
      const { status, ...input } = draft;
      task = await request('POST', '/api/tasks', input, 201);
      assert.equal((await request('GET', '/api/tasks')).total, 0);
      const questions = await request('POST', `/api/tasks/${task.id}/clarify`);
      await request('POST', `/api/tasks/${task.id}/answers`, { answers: [{ questionId: questions.questions[0].id, answer: 'Учебные документы' }] });
      await request('POST', `/api/tasks/${task.id}/generate`);
      await request('POST', `/api/tasks/${task.id}/publish`, {}, 400);
      task = await request('POST', `/api/tasks/${task.id}/publish`, { confirm: true });
      assert.equal((await request('GET', '/api/tasks?skill=React&deadlineBefore=2026-12-31')).total, 1);
      team = await request('POST', '/api/teams', teamDraft, 201);
      const { taskId, ...appInput } = application(task.id, team.id);
      savedApplication = await request('POST', `/api/tasks/${task.id}/applications`, appInput, 201);
      await request('PATCH', `/api/applications/${savedApplication.id}`, { status: 'accepted' });
      await request('POST', `/api/tasks/${task.id}/archive`);
      assert.equal((await request('GET', '/api/tasks')).total, 0);
      assert.equal((await request('POST', `/api/tasks/${task.id}/restore`)).status, 'ready');
      task = await request('POST', `/api/tasks/${task.id}/publish`, { confirm: true });
      assert.equal((await request('GET', `/api/tasks/${task.id}/applications`)).items[0].status, 'accepted');
      await request('GET', '/api/tasks/unknown', undefined, 404);
      await request('GET', '/ready');
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  await t.test('два адаптера: конкурентная публикация, снимки и отзывы', async () => {
    const current = await store.getTask(task.id);
    const values = await Promise.all([store, second].map((adapter) => adapter.updateTask(task.id, (value) => value.status === 'published' ? null : { status: 'published' })));
    assert.deepEqual(values, [current, current]);
    await second.updateTask(task.id, { title: 'Новая версия' });
    await assert.rejects(() => store.updateTask(task.id, { status: 'ready' }, current), (error) => error.status === 409);
    const review = { taskId: task.id, teamId: team.id, authorName: 'Университет', score: 5, text: 'Отличная работа команды.' };
    const reviews = await Promise.all([store.createReview(review), second.createReview({ ...review, authorName: ' УНИВЕРСИТЕТ ' })]);
    assert.equal(reviews.filter(Boolean).length, 1);
    assert.deepEqual((await second.getTeam(team.id)).rating, { average: 5, reviewsCount: 1 });
    await store.createReview({ ...review, authorName: 'Другой автор', score: 4 });
    assert.deepEqual((await store.updateTeam(team.id, { name: 'Новая команда' })).rating, { average: 4.5, reviewsCount: 2 });
    await store.updateApplication(savedApplication.id, { status: 'rejected' });
    await assert.rejects(() => second.createReview({ ...review, authorName: 'Третий' }), (error) => error.status === 409);
  });

  await t.test('отклик без профиля, план и повторная проверка архива', async () => {
    const value = await store.createApplication(application(task.id));
    assert.equal(value.teamId, undefined);
    const plan = await store.createAssistantPlan({ taskId: task.id, teamId: team.id, plan: { summary: 'Сохранённый план' } });
    assert.deepEqual(await second.getAssistantPlan(plan.id), plan);
    assert.equal((await store.listAssistantPlans(task.id, team.id)).length, 1);
    await second.updateTask(task.id, { status: 'archived' });
    await assert.rejects(() => store.createApplication(application(task.id)), (error) => error.status === 409);
    await assert.rejects(() => store.createAssistantPlan({ taskId: task.id, teamId: team.id, plan: {} }), (error) => error.status === 409);
  });

  await t.test('импорт: dry-run, повтор, конфликт и полный откат', async () => {
    const id = randomUUID();
    const date = new Date().toISOString();
    const source = { tasks: [{ ...draft, id, createdAt: date, updatedAt: date, publishedAt: null, clarificationQuestions: [], card: null, readinessScore: 0, readinessExplanation: 'Черновик' }] };
    assert.equal((await importJson(null, source)).applied, false);
    assert.equal(await store.getTask(id), null);
    assert.equal((await importJson(pool, source, { apply: true })).inserted, 1);
    assert.equal((await importJson(pool, source, { apply: true })).inserted, 0);
    assert.deepEqual(await store.getTask(id), source.tasks[0]);
    const newId = randomUUID();
    const bad = { tasks: [{ ...source.tasks[0], id: newId }, { ...source.tasks[0], title: 'Конфликт' }] };
    await assert.rejects(() => importJson(pool, bad, { apply: true }), /Конфликт/);
    assert.equal(await store.getTask(newId), null);
    const invalid = { ...source, applications: [{ ...application(randomUUID()), id: randomUUID(), createdAt: date, updatedAt: date, status: 'submitted' }] };
    await assert.rejects(() => importJson(null, invalid), /связь/);
    const teamId = randomUUID();
    const full = {
      ...source,
      teams: [{ ...teamDraft, id: teamId, createdAt: date, updatedAt: date, rating: { average: 1, reviewsCount: 100 } }],
      applications: [{ ...application(id, teamId), id: randomUUID(), createdAt: date, updatedAt: date, status: 'accepted' }],
      reviews: [{ id: randomUUID(), teamId, taskId: id, authorName: 'Заказчик', score: 5, text: 'Полезный результат', createdAt: date }],
      assistantPlans: [{ id: randomUUID(), teamId, taskId: id, createdAt: date, plan: {
        summary: 'План', architecture: { overview: 'Описание', components: [{ name: 'API', responsibility: 'Запись', technologies: [] }] },
        milestones: [{ title: 'Этап', description: 'Прототип', tasks: ['Создать'], deliverable: 'Прототип', estimatedHours: 2 }],
        assignments: [{ memberName: 'Алия', role: 'Разработчик', tasks: ['Создать'] }], risks: [],
        firstTasks: [{ title: 'Начало', description: 'Проверить', priority: 'high' }], questionsForBusiness: []
      } }]
    };
    assert.equal((await importJson(pool, full, { apply: true })).inserted, 4);
    assert.equal((await importJson(pool, full, { apply: true })).inserted, 0);
    assert.deepEqual((await store.getTeam(teamId)).rating, { average: 5, reviewsCount: 1 });
    assert.deepEqual(await store.getAssistantPlan(full.assistantPlans[0].id), full.assistantPlans[0]);
  });

  await t.test('новый процесс читает сохранённую запись после закрытия своего пула', async () => {
    const expected = await store.getTask(task.id);
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { createPostgresStore } from './src/stores/postgresStore.js';
      const store = await createPostgresStore(JSON.parse(process.env.SANA_TEST_CONFIG));
      const task = await store.getTask(process.env.SANA_TEST_TASK);
      await store.close();
      console.log(JSON.stringify(task));
    `], { cwd: new URL('../', import.meta.url), env: { ...process.env, SANA_TEST_CONFIG: JSON.stringify(fixture.config), SANA_TEST_TASK: task.id }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.resume();
    assert.equal((await once(child, 'exit'))[0], 0);
    assert.deepEqual(JSON.parse(output), expected);
  });
});
