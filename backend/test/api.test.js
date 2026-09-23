import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createJsonStore } from "../src/store.js";

const fakeAI = {
  async generateQuestions() {
    return [
      { question: "Какие данные доступны для решения задачи?" },
      { question: "Как выглядит успешный результат?" }
    ];
  },
  async generateCard(task) {
    return {
      title: task.title,
      problem: "Бизнесу нужно быстрее обрабатывать обращения.",
      goal: "Создать рабочий прототип решения.",
      expectedResult: "Веб-прототип для обработки обращений.",
      description: task.shortDescription,
      requirements: "Нужен веб-интерфейс и API.",
      skills: ["JavaScript"],
      availableData: "Тестовые обращения клиентов.",
      constraints: "Решение должно быть понятным пользователям.",
      deadline: task.deadline || "5 часов",
      successCriteria: "Пользователь может создать и обработать обращение.",
      technologies: ["Node.js"]
    };
  },
  async generateAssistantPlan(task, team) {
    return assistantPlan(team.members[0]);
  }
};

function assistantPlan(member) {
  return {
    summary: "Создать веб-прототип с проверкой на тестовых данных.",
    architecture: {
      overview: "Клиент обращается к API, которое сохраняет и проверяет данные.",
      components: [{
        name: "API приложения",
        responsibility: "Обрабатывает запросы и хранит результаты.",
        technologies: ["Node.js"]
      }]
    },
    milestones: [{
      title: "Рабочий прототип",
      description: "Собрать основной пользовательский сценарий.",
      tasks: ["Подготовить API", "Проверить сценарий"],
      deliverable: "Запускаемый прототип",
      estimatedHours: 6
    }],
    assignments: [{
      memberName: member.name,
      role: member.role,
      tasks: ["Подготовить API"]
    }],
    risks: [{
      title: "Недостаточно тестовых данных",
      probability: "medium",
      impact: "Нельзя проверить качество результата на реальных случаях.",
      mitigation: "Согласовать обезличенную выборку с бизнесом."
    }],
    firstTasks: [{
      title: "Уточнить формат данных",
      description: "Согласовать входные данные и ожидаемый ответ.",
      priority: "high"
    }],
    questionsForBusiness: ["Какая тестовая выборка доступна команде?"]
  };
}

async function createTestServer(aiService = fakeAI) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-sana-"));
  const store = await createJsonStore(path.join(directory, "db.json"));
  const server = createApp({ store, aiService }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    store,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  };
}

async function createTask(baseUrl, overrides = {}) {
  const { response, data } = await request(baseUrl, "POST", "/api/tasks", {
    title: "Командный проект",
    shortDescription: "Нужно разработать понятный прототип решения бизнес-задачи.",
    organization: "Организация заказчика",
    contactPerson: "Айдана",
    ...overrides
  });
  assert.equal(response.status, 201);
  return data;
}

async function createTeam(baseUrl, overrides = {}) {
  const { response, data } = await request(baseUrl, "POST", "/api/teams", {
    name: "Команда Sana",
    description: "Студенческая команда, создающая образовательные веб-проекты.",
    members: [{ name: "Алия", role: "Backend-разработчик", skills: ["Node.js"] }],
    skills: ["Backend", "AI"],
    technologies: ["Node.js", "React"],
    projects: [{
      name: "Учебный помощник",
      description: "Прототип поиска ответов на учебные вопросы.",
      url: "https://github.com/example/study-helper"
    }],
    githubUrls: ["https://github.com/example"],
    ...overrides
  });
  return { response, data };
}

async function request(baseUrl, method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

test("полный сценарий задачи и отклика команды", async (t) => {
  const server = await createTestServer();
  t.after(server.close);

  const created = await request(server.baseUrl, "POST", "/api/tasks", {
    title: "Умный помощник для обращений",
    shortDescription: "Нужно создать прототип помощника для обработки обращений клиентов.",
    organization: "Тестовая компания",
    contactPerson: "Айдана",
    desiredResult: "Рабочий веб-прототип",
    availableData: "История обращений",
    constraints: "Нужно уложиться в 5 часов",
    deadline: "2026-09-23",
    skills: ["JavaScript"],
    technologies: ["Node.js"]
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.status, "draft");

  const clarified = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/clarify`, {});
  assert.equal(clarified.response.status, 200);
  assert.equal(clarified.data.questions.length, 2);

  const answered = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/answers`, {
    answers: clarified.data.questions.map((question) => ({
      questionId: question.id,
      answer: "Данные и критерии будут предоставлены бизнесом."
    }))
  });
  assert.equal(answered.response.status, 200);

  const generated = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/generate`, {});
  assert.equal(generated.response.status, 200);
  assert.equal(generated.data.readiness.score, 100);
  assert.equal(generated.data.readiness.status, "ready");

  const published = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/publish`, { confirm: true });
  assert.equal(published.response.status, 200);
  assert.equal(published.data.status, "published");

  const catalog = await request(server.baseUrl, "GET", "/api/tasks");
  assert.equal(catalog.data.total, 1);

  const application = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/applications`, {
    teamName: "Команда AI",
    members: ["Алия", "Данияр"],
    solutionDescription: "Сделаем прототип помощника с поиском по обращениям.",
    technologies: ["React", "Node.js"],
    contact: "team@example.com",
    comment: "Готовы показать промежуточный результат через неделю."
  });
  assert.equal(application.response.status, 201);
  assert.equal(application.data.status, "submitted");
  assert.equal(application.data.comment, "Готовы показать промежуточный результат через неделю.");

  const applications = await request(server.baseUrl, "GET", `/api/tasks/${created.data.id}/applications`);
  assert.equal(applications.data.total, 1);

  const accepted = await request(server.baseUrl, "PATCH", `/api/applications/${application.data.id}`, { status: "accepted" });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.status, "accepted");
});

test("черновики не попадают в публичный каталог и публикация требует подтверждения", async (t) => {
  const server = await createTestServer();
  t.after(server.close);

  const created = await request(server.baseUrl, "POST", "/api/tasks", {
    title: "Черновая задача",
    shortDescription: "Описание задачи для проверки публичного каталога.",
    organization: "Организация",
    contactPerson: "Контакт"
  });
  assert.equal(created.response.status, 201);

  const catalog = await request(server.baseUrl, "GET", "/api/tasks");
  assert.equal(catalog.data.total, 0);

  const unpublished = await request(server.baseUrl, "POST", `/api/tasks/${created.data.id}/publish`, { confirm: true });
  assert.equal(unpublished.response.status, 409);
});

test("профили команд, фильтрация, принятые отклики, отзывы и рейтинг", async (t) => {
  const server = await createTestServer();
  t.after(server.close);
  const task = await createTask(server.baseUrl);
  await server.store.updateTask(task.id, { status: "published", card: { title: task.title } });

  const invalidTeam = await request(server.baseUrl, "POST", "/api/teams", {
    name: "Некорректная команда",
    description: "Описание достаточно длинное для создания профиля.",
    members: [{ name: "", role: "Разработчик" }],
    githubUrls: ["https://example.com/not-github"]
  });
  assert.equal(invalidTeam.response.status, 400);

  const invalidGithubLink = await request(server.baseUrl, "POST", "/api/teams", {
    name: "Команда со ссылкой вне GitHub",
    description: "Описание команды для проверки валидации GitHub-ссылок.",
    members: [{ name: "Алия", role: "Разработчик" }],
    githubUrls: ["https://example.com/not-github"]
  });
  assert.equal(invalidGithubLink.response.status, 400);

  const created = await createTeam(server.baseUrl);
  assert.equal(created.response.status, 201);
  assert.equal(created.data.rating.average, 0);
  assert.equal(created.data.rating.reviewsCount, 0);

  const filtered = await request(server.baseUrl, "GET", "/api/teams?skill=node&technology=react&minimumRating=0");
  assert.equal(filtered.data.total, 1);
  const tooHighlyRated = await request(server.baseUrl, "GET", "/api/teams?minimumRating=4");
  assert.equal(tooHighlyRated.data.total, 0);

  const earlyReview = await request(server.baseUrl, "POST", `/api/teams/${created.data.id}/reviews`, {
    taskId: task.id,
    authorName: "Организация заказчика",
    score: 5,
    text: "Команда отлично справилась с проектом."
  });
  assert.equal(earlyReview.response.status, 409);

  const application = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/applications`, {
    teamId: created.data.id,
    teamName: "Подменённое имя",
    members: ["Подменённый участник"],
    solutionDescription: "Создадим проверяемый прототип с понятным сценарием.",
    technologies: ["Подменённая технология"],
    contact: "team@example.com"
  });
  assert.equal(application.response.status, 201);
  assert.equal(application.data.teamId, created.data.id);
  assert.equal(application.data.teamName, created.data.name);
  assert.deepEqual(application.data.members, ["Алия"]);
  assert.deepEqual(application.data.technologies, ["Node.js", "React"]);

  const accepted = await request(server.baseUrl, "PATCH", `/api/applications/${application.data.id}`, { status: "accepted" });
  assert.equal(accepted.response.status, 200);

  const reviewBody = {
    taskId: task.id,
    authorName: "Организация заказчика",
    score: 5,
    text: "Команда отлично справилась с проектом."
  };
  const concurrentReviews = await Promise.all([
    request(server.baseUrl, "POST", `/api/teams/${created.data.id}/reviews`, reviewBody),
    request(server.baseUrl, "POST", `/api/teams/${created.data.id}/reviews`, reviewBody)
  ]);
  assert.deepEqual(concurrentReviews.map(({ response }) => response.status).sort(), [201, 409]);

  const secondReview = await request(server.baseUrl, "POST", `/api/teams/${created.data.id}/reviews`, {
    ...reviewBody,
    authorName: "Другой заказчик",
    score: 4
  });
  assert.equal(secondReview.response.status, 201);
  assert.deepEqual(secondReview.data.rating, { average: 4.5, reviewsCount: 2 });

  const profile = await request(server.baseUrl, "GET", `/api/teams/${created.data.id}`);
  assert.deepEqual(profile.data.rating, { average: 4.5, reviewsCount: 2 });
  const updatedTeam = await request(server.baseUrl, "PATCH", `/api/teams/${created.data.id}`, {
    description: "Обновлённое описание команды для проверки редактирования профиля."
  });
  assert.equal(updatedTeam.response.status, 200);
  assert.match(updatedTeam.data.description, /^Обновлённое описание/);
  const reviews = await request(server.baseUrl, "GET", `/api/teams/${created.data.id}/reviews`);
  assert.equal(reviews.data.total, 2);

  const ratingOverride = await request(server.baseUrl, "PATCH", `/api/teams/${created.data.id}`, {
    rating: { average: 5, reviewsCount: 100 }
  });
  assert.equal(ratingOverride.response.status, 400);
});

test("AI-план проверяется, сохраняется и доступен в истории", async (t) => {
  const server = await createTestServer();
  t.after(server.close);
  const task = await createTask(server.baseUrl);
  const team = await createTeam(server.baseUrl);

  const beforePublication = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/assistant/plan`, {
    teamId: team.data.id
  });
  assert.equal(beforePublication.response.status, 409);

  await server.store.updateTask(task.id, {
    status: "published",
    card: { title: task.title, problem: "Упростить выполнение бизнес-процесса." }
  });

  const generated = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/assistant/plan`, {
    teamId: team.data.id,
    focus: "Сначала подготовить небольшой демонстрационный прототип"
  });
  assert.equal(generated.response.status, 201);
  assert.equal(generated.data.plan.assignments[0].memberName, "Алия");
  assert.equal(generated.data.plan.architecture.components.length, 1);

  const history = await request(server.baseUrl, "GET", `/api/tasks/${task.id}/assistant/plans?teamId=${team.data.id}`);
  assert.equal(history.data.total, 1);
  assert.equal(history.data.items[0].id, generated.data.id);

  const detailed = await request(server.baseUrl, "GET", `/api/assistant-plans/${generated.data.id}`);
  assert.equal(detailed.data.taskId, task.id);

  const unknownTask = await request(server.baseUrl, "POST", "/api/tasks/00000000-0000-4000-8000-000000000000/assistant/plan", {
    teamId: team.data.id
  });
  assert.equal(unknownTask.response.status, 404);

  const unknownTeam = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/assistant/plan`, {
    teamId: "00000000-0000-4000-8000-000000000000"
  });
  assert.equal(unknownTeam.response.status, 404);
});

test("неполный или распределённый на неизвестных участников AI-план не сохраняется", async (t) => {
  let generatedPlan = { summary: "Неполный ответ" };
  const invalidAI = {
    ...fakeAI,
    async generateAssistantPlan() {
      return generatedPlan;
    }
  };
  const server = await createTestServer(invalidAI);
  t.after(server.close);
  const task = await createTask(server.baseUrl);
  await server.store.updateTask(task.id, { status: "published" });
  const team = await createTeam(server.baseUrl);

  const generated = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/assistant/plan`, {
    teamId: team.data.id
  });
  assert.equal(generated.response.status, 502);

  generatedPlan = assistantPlan({ name: "Вымышленный участник", role: "Архитектор" });
  const unknownMember = await request(server.baseUrl, "POST", `/api/tasks/${task.id}/assistant/plan`, {
    teamId: team.data.id
  });
  assert.equal(unknownMember.response.status, 502);
  assert.equal((await server.store.listAssistantPlans(task.id, team.data.id)).length, 0);
});

test("старое JSON-хранилище мигрирует без потери данных и последовательные записи сохраняются", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-sana-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "legacy.json");
  const legacyData = {
    tasks: [{ id: "old-task", title: "Сохранённая задача" }],
    applications: [{ id: "old-application", taskId: "old-task" }]
  };
  await writeFile(filePath, JSON.stringify(legacyData));

  const store = await createJsonStore(filePath);
  const createdTeams = await Promise.all(Array.from({ length: 12 }, (_, index) => store.createTeam({
    name: `Команда ${index}`,
    description: "Описание команды для проверки параллельных записей.",
    members: [{ name: "Участник", role: "Разработчик", skills: [] }],
    skills: [],
    technologies: [],
    projects: [],
    githubUrls: []
  })));
  assert.equal(createdTeams.length, 12);

  const persisted = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(persisted.tasks[0].id, "old-task");
  assert.equal(persisted.applications[0].id, "old-application");
  assert.equal(persisted.teams.length, 12);
  assert.deepEqual(persisted.reviews, []);
  assert.deepEqual(persisted.assistantPlans, []);
});
