import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  }
};

async function createTestServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-sana-"));
  const store = await createJsonStore(path.join(directory, "db.json"));
  const server = createApp({ store, aiService: fakeAI }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  };
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
    contact: "team@example.com"
  });
  assert.equal(application.response.status, 201);
  assert.equal(application.data.status, "submitted");

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
