import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createApp } from '../../backend/src/app.js';
import { createJsonStore } from '../../backend/src/store.js';

const teamDraft = {
  name: 'Команда проверки', description: 'Создаём образовательные веб-приложения.',
  members: [{ name: 'Алия', role: 'Разработчик', skills: ['React'] }],
  skills: ['UX'], technologies: ['React'],
  projects: [{ name: 'Учебный проект', description: 'Описание проекта', url: 'https://example.com' }],
  githubUrls: ['https://github.com/example'],
};
const taskDraft = {
  title: 'Помощник первокурсника', shortDescription: 'Нужен помощник для поиска учебной информации.',
  organization: 'Учебный университет', contactPerson: 'Координатор', desiredResult: 'Веб-прототип',
  availableData: 'Тестовые документы', constraints: 'Без персональных данных', deadline: '5 часов',
  skills: ['React'], technologies: ['Node.js'],
};
const fakeAI = {
  async generateQuestions() { return [{ question: 'Как проверить результат?' }]; },
  async generateCard(task) {
    return { ...taskDraft, title: task.title, problem: task.shortDescription, goal: 'Помочь студентам',
      expectedResult: 'Рабочий прототип', description: 'Описание решения', requirements: 'Веб-интерфейс', successCriteria: '24 верных ответа из 30' };
  },
  async generateAssistantPlan(task, team) {
    return {
      summary: `Решение задачи ${task.title}`,
      architecture: { overview: 'Клиент и сервер', components: [{ name: 'Клиент', responsibility: 'Показ ответов', technologies: ['React'] }] },
      milestones: [{ title: 'Прототип', description: 'Первый этап', tasks: ['Создать интерфейс'], deliverable: 'Рабочий чат', estimatedHours: 3 }],
      assignments: team.members.map((m) => ({ memberName: m.name, role: m.role, tasks: ['Создать интерфейс'] })),
      risks: [{ title: 'Нехватка данных', probability: 'medium', impact: 'Неточный ответ', mitigation: 'Проверить документы' }],
      firstTasks: [{ title: 'Сбор данных', description: 'Получить документы', priority: 'high' }],
      questionsForBusiness: ['Какие документы актуальны?'],
    };
  },
};

async function scenario(api) {
  const team = await api.createTeam(teamDraft);
  assert.ok(team.id);
  const edited = await api.updateTeam(team.id, { ...teamDraft, name: 'Обновлённая команда' });
  assert.equal(edited.name, 'Обновлённая команда');
  assert.equal((await api.getTeam(team.id)).projects[0].url, teamDraft.projects[0].url);
  assert.ok((await api.getTeams()).some((value) => value.id === team.id));
  const task = await api.createTask(taskDraft);
  await assert.rejects(() => api.publishTask(task.id));
  assert.ok(!(await api.getTasks()).some((value) => value.id === task.id));
  assert.ok((await api.getTasks('draft')).some((value) => value.id === task.id));
  assert.ok((await api.getTasks('all')).some((value) => value.id === task.id));
  const questions = await api.clarifyTask(task.id);
  await api.saveAnswers(task.id, Object.fromEntries(questions.map((q) => [q.id, 'По контрольным вопросам'])));
  const card = await api.generateTask(task.id);
  assert.ok(card.problem && card.goal && card.successCriteria);
  assert.ok(!(await api.getTasks()).some((value) => value.id === task.id));
  const published = await api.publishTask(task.id);
  assert.ok(Number.isFinite(Date.parse(published.publishedAt)));
  assert.ok(Number.isFinite(Date.parse(published.updatedAt)));
  assert.deepEqual(await api.publishTask(task.id), published);
  const catalog = await api.getTasks();
  assert.equal(catalog.filter((value) => value.id === task.id).length, 1);
  assert.equal(catalog[0].id, task.id);
  assert.equal(catalog[0].publishedAt, published.publishedAt);
  assert.ok(catalog.every((value) => value.status === 'published'));
  await assert.rejects(() => api.updateTask(task.id, { title: 'Изменённая задача' }));
  await assert.rejects(() => api.clarifyTask(task.id));
  await assert.rejects(() => api.generateTask(task.id));
  const review = { taskId: task.id, authorName: 'Университет', score: 5, text: 'Команда подготовила полезное решение.' };
  await assert.rejects(() => api.createTeamReview(team.id, review));
  const application = await api.createApplication(task.id, {
    teamId: team.id, teamName: edited.name, members: 'Алия', solution: 'Создадим веб-приложение для студентов.',
    technologies: ['React'], contact: 'team@example.com', comment: 'Готовы к пилоту',
  });
  assert.equal(application.teamId, team.id);
  assert.ok(application.solution);
  assert.equal((await api.getApplications(task.id))[0].teamId, team.id);
  await api.updateApplication(application.id, 'accepted');
  const savedReview = await api.createTeamReview(team.id, review);
  assert.equal(savedReview.score, 5);
  assert.equal((await api.getTeam(team.id)).rating.average, 5);
  assert.equal((await api.getTeamReviews(team.id)).length, 1);
  await assert.rejects(() => api.createTeamReview(team.id, review));
  assert.equal((await api.getAssistantPlans(task.id, team.id)).length, 0);
  const plan = await api.generateAssistantPlan(task.id, team.id, 'Успеть за 5 часов');
  for (const key of ['milestones', 'assignments', 'risks', 'firstTasks', 'questionsForBusiness']) assert.ok(plan.plan[key].length);
  assert.ok(plan.plan.architecture.components.length);
  assert.equal(plan.plan.assignments[0].memberName, 'Алия');
  assert.equal((await api.getAssistantPlan(plan.id)).id, plan.id);
  await api.generateAssistantPlan(task.id, team.id);
  assert.equal((await api.getAssistantPlans(task.id, team.id)).length, 2);
  await api.archiveTask(task.id);
  assert.ok(!(await api.getTasks()).some((value) => value.id === task.id));
  assert.ok((await api.getTasks('archived')).some((value) => value.id === task.id));
  await assert.rejects(() => api.publishTask(task.id));
  await assert.rejects(() => api.generateAssistantPlan(task.id, team.id));
}

test('Frontend-клиент и backend: команда, задача, отклик, отзыв и AI-планы; совместимость mock', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sana-integration-'));
  let server, vite;
  try {
    const store = await createJsonStore(join(directory, 'db.json'));
    const aiService = { ...fakeAI };
    server = createApp({ store, aiService }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    vite = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      server: { middlewareMode: true, watch: null },
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(`http://127.0.0.1:${server.address().port}`),
        'import.meta.env.VITE_USE_MOCK_API': JSON.stringify('false'),
      },
    });
    const { api } = await vite.ssrLoadModule('/src/lib/api.ts');
    await t.test('Реальный backend: публикация, каталог и основной сценарий', () => scenario(api));
    await assert.rejects(() => api.getTeam('00000000-0000-4000-8000-000000000000'), (e) => e.status === 404);
    await assert.rejects(() => api.createTeam({ ...teamDraft, githubUrls: ['https://example.com'] }), (e) => e.status === 400);
    await t.test('Конфликт AI-генерации возвращает 409 и сохраняет актуальную задачу', async () => {
      const task = await api.createTask(taskDraft);
      const started = Promise.withResolvers();
      const release = Promise.withResolvers();
      aiService.generateCard = async (draft) => {
        started.resolve();
        await release.promise;
        return fakeAI.generateCard(draft);
      };
      const conflict = assert.rejects(api.generateTask(task.id), (error) => error.status === 409 && error.message.includes('Обновите данные'));
      try {
        await started.promise;
        await api.updateTask(task.id, { title: 'Актуальное название после правки' });
      } finally {
        release.resolve();
      }
      await conflict;
      assert.equal((await api.getTask(task.id)).title, 'Актуальное название после правки');
      aiService.generateCard = fakeAI.generateCard;
    });
    const { mockApi } = await vite.ssrLoadModule('/src/lib/mockApi.ts');
    await t.test('Mock сохраняет правила публикации и каталога backend', () => scenario(mockApi));
  } finally {
    if (vite) await vite.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
