import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createJsonStore } from "../src/store.js";

const draft = {
  title: "Учебный помощник",
  shortDescription: "Создать помощника для проверки учебных заданий.",
  organization: "Учебный центр",
  contactPerson: "Айдана"
};
const card = {
  title: draft.title,
  description: draft.shortDescription,
  problem: "Преподаватели тратят много времени на проверку.",
  goal: "Ускорить проверку заданий.",
  expectedResult: "Работающий прототип проверки.",
  requirements: "Веб-интерфейс с проверкой результата преподавателем.",
  availableData: "Обезличенные учебные задания.",
  constraints: "Не передавать персональные данные.",
  deadline: "2026-10-01",
  successCriteria: "Преподаватель может проверить задание.",
  skills: ["JavaScript"],
  technologies: ["Node.js"]
};
const fakeAI = { generateCard: async () => structuredClone(card) };

async function fixture(t, aiService = fakeAI) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-sana-catalog-"));
  const filePath = path.join(directory, "db.json");
  let server;
  let baseUrl;
  const context = {
    filePath,
    async start() {
      context.store = await createJsonStore(filePath);
      server = createApp({ store: context.store, aiService }).listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    },
    async stop() {
      if (!server?.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    async request(method, route, body, expectedStatus = 200) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const data = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(data));
      return data;
    },
    async create() {
      return context.request("POST", "/api/tasks", draft, 201);
    },
    async ready() {
      const task = await context.create();
      return (await context.request("POST", `/api/tasks/${task.id}/generate`, {})).task;
    },
    publish(id, expectedStatus = 200) {
      return context.request("POST", `/api/tasks/${id}/publish`, { confirm: true }, expectedStatus);
    }
  };
  t.after(async () => {
    await context.stop();
    await rm(directory, { recursive: true, force: true });
  });
  await context.start();
  return context;
}

test("генерация, публикация, каталог и перезапуск сохраняют одну карточку", async (t) => {
  const app = await fixture(t);
  const created = await app.create();
  const generated = await app.request("POST", `/api/tasks/${created.id}/generate`, {});
  assert.equal(generated.task.id, created.id);
  assert.deepEqual(generated.card, card);
  assert.equal(generated.readiness.score, 100);
  assert.equal(generated.readiness.status, "ready");
  assert.deepEqual(await app.store.getTask(created.id), generated.task);
  assert.deepEqual(await app.request("GET", "/api/tasks"), { items: [], total: 0 });

  const published = await app.publish(created.id);
  assert.equal(published.status, "published");
  assert.ok(Number.isFinite(Date.parse(published.publishedAt)));
  assert.equal(published.organization, draft.organization);
  assert.deepEqual(published.card, card);
  assert.equal(published.readinessScore, 100);
  assert.equal(published.readinessExplanation, generated.readiness.explanation);
  const catalog = { items: [published], total: 1 };
  assert.deepEqual(await app.request("GET", "/api/tasks"), catalog);
  assert.deepEqual(await app.request("GET", "/api/tasks?skill=JavaScript&technology=Node.js&deadlineBefore=2026-10-02"), catalog);
  const disk = JSON.parse(await readFile(app.filePath, "utf8"));
  assert.deepEqual(disk.tasks, [published]);

  await app.stop();
  await app.start();
  assert.deepEqual(await app.request("GET", "/api/tasks"), catalog);
  assert.deepEqual(await app.request("GET", `/api/tasks/${created.id}`), published);
});

test("повторная и параллельная публикация не меняют дату и не создают дубликаты", async (t) => {
  const app = await fixture(t);
  const ready = await app.ready();
  const results = await Promise.all(Array.from({ length: 8 }, () => app.publish(ready.id)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(await app.publish(ready.id), results[0]);
  assert.deepEqual(await app.request("GET", "/api/tasks"), { items: [results[0]], total: 1 });
  assert.equal((await app.store.listTasks()).length, 1);
});

test("каталог исключает черновики, уточняемые, готовые и архивные задачи", async (t) => {
  const app = await fixture(t);
  await app.create();
  await app.ready();
  const clarification = await app.create();
  await app.store.updateTask(clarification.id, { status: "needs_clarification" });
  const archived = await app.ready();
  await app.publish(archived.id);
  await app.request("POST", `/api/tasks/${archived.id}/archive`, {});
  const published = await app.publish((await app.ready()).id);
  assert.deepEqual(await app.request("GET", "/api/tasks"), { items: [published], total: 1 });
  assert.equal((await app.request("GET", "/api/tasks?status=all")).total, 5);
  await app.publish(archived.id);
  assert.equal((await app.request("GET", "/api/tasks")).total, 2);
});

test("публикация требует подтверждения, но доступна без AI и порога готовности", async (t) => {
  const app = await fixture(t);
  const ready = await app.ready();
  for (const body of [undefined, {}, { confirm: false }, { confirm: "true" }]) {
    await app.request("POST", `/api/tasks/${ready.id}/publish`, body, 400);
  }
  assert.equal((await app.store.getTask(ready.id)).status, "ready");
  const draftTask = await app.create();
  const publishedDraft = await app.publish(draftTask.id);
  assert.equal(publishedDraft.status, "published");
  assert.equal(publishedDraft.card, null);
  assert.equal(publishedDraft.title, draft.title);
  for (const patch of [{ readinessScore: 74 }, { readinessScore: 100, card: null }]) {
    await app.store.updateTask(ready.id, { ...patch, status: "ready" });
    assert.equal((await app.publish(ready.id)).status, "published");
  }
  await app.store.updateTask(ready.id, { card, readinessScore: 75 });
  await app.publish(ready.id);
  await app.request("POST", `/api/tasks/${ready.id}/publish`, {}, 400);
  await app.publish("unknown", 404);
});

test("неполную карточку можно опубликовать вручную без повышения рейтинга", async (t) => {
  const app = await fixture(t, {
    generateCard: async () => ({ ...card, availableData: "", constraints: "", successCriteria: "" })
  });
  const task = await app.create();
  const generated = await app.request("POST", `/api/tasks/${task.id}/generate`, {});
  assert.equal(generated.readiness.score, 63);
  assert.equal(generated.task.status, "needs_clarification");
  assert.deepEqual(await app.request("GET", "/api/tasks"), { items: [], total: 0 });
  assert.deepEqual(await app.store.getTask(task.id), generated.task);
  const published = await app.publish(task.id);
  assert.equal(published.readinessScore, 63);
  assert.deepEqual(published.card, generated.card);
  assert.deepEqual(await app.request("GET", "/api/tasks"), { items: [published], total: 1 });
});

test("архив восстанавливается без потери данных и повторно публикуется после перезапуска", async (t) => {
  const app = await fixture(t);
  const task = await app.ready();
  await app.publish(task.id);
  const application = await app.store.createApplication({ taskId: task.id, teamName: "Команда" });
  await app.request("POST", `/api/tasks/${task.id}/archive`, {});
  const restored = await app.request("POST", `/api/tasks/${task.id}/restore`, {});
  assert.equal(restored.status, "ready");
  assert.deepEqual(restored.card, task.card);
  assert.equal((await app.request("GET", "/api/tasks")).total, 0);
  assert.deepEqual(await app.request("POST", `/api/tasks/${task.id}/restore`, {}), restored);
  assert.deepEqual((await app.request("GET", `/api/tasks/${task.id}/applications`)).items, [application]);
  await app.request("PATCH", `/api/tasks/${task.id}`, { contactPerson: "Новый контакт" });
  await app.request("POST", `/api/tasks/${task.id}/archive`, {});
  const published = await app.publish(task.id);
  assert.equal(published.contactPerson, "Новый контакт");
  assert.deepEqual(await app.request("POST", `/api/tasks/${task.id}/restore`, {}), published);
  await app.stop();
  await app.start();
  assert.deepEqual((await app.request("GET", "/api/tasks")).items, [published]);
  assert.deepEqual((await app.request("GET", `/api/tasks/${task.id}/applications`)).items, [application]);
  await app.request("POST", "/api/tasks/unknown/restore", {}, 404);
});

test("восстановление черновика, вопросов и неполной карточки сохраняет этап подготовки", async (t) => {
  const app = await fixture(t);
  for (const [patch, expectedStatus] of [
    [{}, "draft"],
    [{ clarificationQuestions: [{ id: "q", question: "Вопрос", answer: "Ответ" }] }, "needs_clarification"],
    [{ card: { title: "Неполная карточка" }, readinessScore: 100 }, "needs_clarification"]
  ]) {
    const task = await app.create();
    await app.store.updateTask(task.id, { ...patch, status: "archived" });
    const restored = await app.request("POST", `/api/tasks/${task.id}/restore`, {});
    assert.equal(restored.status, expectedStatus);
    if (patch.card) assert.equal(restored.readinessScore, 13);
    if (patch.clarificationQuestions) assert.deepEqual(restored.clarificationQuestions, patch.clarificationQuestions);
    assert.equal((await app.request("GET", "/api/tasks")).total, 0);
  }
});

test("новые публикации идут первыми, одинаковые даты имеют стабильный порядок", async (t) => {
  const app = await fixture(t);
  const first = await app.ready();
  const second = await app.ready();
  const third = await app.ready();
  for (const task of [first, second, third]) await app.publish(task.id);
  await app.store.updateTask(first.id, { publishedAt: "2026-09-20T10:00:00.000Z" });
  await app.store.updateTask(second.id, { publishedAt: "2026-09-22T10:00:00.000Z" });
  await app.store.updateTask(third.id, { publishedAt: "2026-09-22T10:00:00.000Z" });
  const expected = [second.id, third.id].sort().concat(first.id);
  const ids = async () => (await app.request("GET", "/api/tasks")).items.map((item) => item.id);
  assert.deepEqual(await ids(), expected);
  await app.publish(first.id);
  assert.deepEqual(await ids(), expected);
  await app.stop();
  await app.start();
  assert.deepEqual(await ids(), expected);
});

test("параллельные генерации и публикации разных задач сохраняются на диск", async (t) => {
  const app = await fixture(t);
  const ready = await Promise.all(Array.from({ length: 10 }, () => app.ready()));
  const published = await Promise.all(ready.map((task) => app.publish(task.id)));
  const disk = await createJsonStore(app.filePath);
  assert.equal((await disk.listTasks()).length, 10);
  for (const task of published) assert.deepEqual(await disk.getTask(task.id), task);
  assert.equal((await app.request("GET", "/api/tasks")).total, 10);
});

test("ошибка замены файла не повреждает базу, очередь продолжает работу", async (t) => {
  const app = await fixture(t);
  const task = await app.ready();
  const originalFile = await readFile(app.filePath, "utf8");
  const rename = t.mock.method(fs, "rename", async () => {
    throw Object.assign(new Error("Тестовый отказ записи"), { code: "EACCES" });
  });
  await assert.rejects(app.store.updateTask(task.id, { title: "Несохранённое изменение" }), { code: "EACCES" });
  rename.mock.restore();
  assert.equal(await readFile(app.filePath, "utf8"), originalFile);
  assert.deepEqual(await app.store.getTask(task.id), task);
  assert.deepEqual(await fs.readdir(path.dirname(app.filePath)), ["db.json"]);
  const published = await app.publish(task.id);
  assert.deepEqual(JSON.parse(await readFile(app.filePath, "utf8")).tasks, [published]);
});

test("конкурирующие изменения одного снимка не затирают друг друга", async (t) => {
  const app = await fixture(t);
  const task = await app.create();
  const results = await Promise.allSettled([
    app.store.updateTask(task.id, { title: "Первое изменение" }, task),
    app.store.updateTask(task.id, { title: "Второе изменение" }, task)
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.status, 409);
  assert.deepEqual(await app.store.getTask(task.id), results[0].value);
});

test("запоздавшая генерация не отменяет публикацию, архивирование или правки", async (t) => {
  for (const action of ["publish", "archive", "edit"]) {
    await t.test(action, async (t) => {
      let waitForAI = false;
      const started = Promise.withResolvers();
      const release = Promise.withResolvers();
      const app = await fixture(t, {
        async generateCard() {
          if (waitForAI) {
            started.resolve();
            await release.promise;
          }
          return structuredClone(card);
        }
      });
      const task = await app.ready();
      waitForAI = true;
      const pending = app.request("POST", `/api/tasks/${task.id}/generate`, {}, 409);
      await started.promise;
      let expected;
      try {
        expected = action === "edit"
          ? await app.request("PATCH", `/api/tasks/${task.id}`, { title: "Обновлённая задача" })
          : await app.request("POST", `/api/tasks/${task.id}/${action}`, { confirm: true });
      } finally {
        release.resolve();
      }
      await pending;
      assert.deepEqual(await app.store.getTask(task.id), expected);
    });
  }
});
