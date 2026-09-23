import express from "express";
import { randomUUID } from "node:crypto";
import { calculateReadiness } from "./readiness.js";
import {
  answersSchema,
  applicationCreateSchema,
  applicationPatchSchema,
  parseBody,
  taskCreateSchema,
  taskPatchSchema
} from "./validation.js";

const statuses = new Set(["draft", "needs_clarification", "ready", "published", "archived"]);
const applicationStatuses = new Set(["submitted", "reviewed", "accepted", "rejected"]);

const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function requireTask(store, id) {
  return store.getTask(id).then((task) => {
    if (!task) throw notFound("Задача не найдена.");
    return task;
  });
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function includesAny(values, filters) {
  if (filters.length === 0) return true;
  return filters.some((filter) => values.some((value) => String(value).toLowerCase().includes(filter)));
}

export function createApp({ store, aiService }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/tasks", asyncHandler(async (request, response) => {
    const data = parseBody(taskCreateSchema, request.body);
    const task = await store.createTask({
      ...data,
      skills: data.skills || [],
      technologies: data.technologies || [],
      status: "draft"
    });
    response.status(201).json(task);
  }));

  app.get("/api/tasks", asyncHandler(async (request, response) => {
    const requestedStatus = request.query.status || "published";
    if (requestedStatus !== "all" && !statuses.has(requestedStatus)) {
      const error = new Error("Неизвестный статус задачи.");
      error.status = 400;
      throw error;
    }

    const skillFilters = parseList(request.query.skill || request.query.skills);
    const technologyFilters = parseList(request.query.technology || request.query.technologies);
    const deadlineBefore = request.query.deadlineBefore ? String(request.query.deadlineBefore) : null;
    const tasks = await store.listTasks();
    const result = tasks.filter((task) => {
      if (requestedStatus !== "all" && task.status !== requestedStatus) return false;
      const card = task.card || {};
      if (!includesAny(card.skills || task.skills || [], skillFilters)) return false;
      if (!includesAny(card.technologies || task.technologies || [], technologyFilters)) return false;
      if (deadlineBefore && (!card.deadline || card.deadline > deadlineBefore)) return false;
      return true;
    });
    response.json({ items: result, total: result.length });
  }));

  app.get("/api/tasks/:id", asyncHandler(async (request, response) => {
    response.json(await requireTask(store, request.params.id));
  }));

  app.patch("/api/tasks/:id", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (["published", "archived"].includes(task.status)) {
      const error = new Error("Опубликованную или архивную задачу нельзя изменить.");
      error.status = 409;
      throw error;
    }
    const patch = parseBody(taskPatchSchema, request.body);
    response.json(await store.updateTask(task.id, patch));
  }));

  app.post("/api/tasks/:id/clarify", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (task.status === "published" || task.status === "archived") {
      const error = new Error("Для этой задачи нельзя создать новые вопросы.");
      error.status = 409;
      throw error;
    }
    const questions = await aiService.generateQuestions(task);
    const clarificationQuestions = questions.map((item) => ({
      id: randomUUID(),
      question: item.question,
      answer: ""
    }));
    const updated = await store.updateTask(task.id, {
      clarificationQuestions,
      status: "needs_clarification"
    });
    response.json({ questions: updated.clarificationQuestions, task: updated });
  }));

  app.post("/api/tasks/:id/answers", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    const data = parseBody(answersSchema, request.body);
    const answersById = new Map(data.answers.map((item) => [item.questionId, item.answer]));
    const knownIds = new Set(task.clarificationQuestions.map((item) => item.id));
    if (data.answers.some((item) => !knownIds.has(item.questionId))) {
      const error = new Error("Один или несколько вопросов не найдены.");
      error.status = 400;
      throw error;
    }
    const clarificationQuestions = task.clarificationQuestions.map((item) => ({
      ...item,
      answer: answersById.has(item.id) ? answersById.get(item.id) : item.answer
    }));
    const updated = await store.updateTask(task.id, { clarificationQuestions });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/generate", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (task.status === "published" || task.status === "archived") {
      const error = new Error("Для этой задачи нельзя сформировать новую карточку.");
      error.status = 409;
      throw error;
    }
    const card = await aiService.generateCard(task);
    const readiness = calculateReadiness(task, card);
    const updated = await store.updateTask(task.id, {
      card,
      readinessScore: readiness.score,
      readinessExplanation: readiness.explanation,
      status: readiness.status
    });
    response.json({
      task: updated,
      card: updated.card,
      readiness: {
        score: updated.readinessScore,
        explanation: updated.readinessExplanation,
        status: updated.status
      }
    });
  }));

  app.post("/api/tasks/:id/publish", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (request.body?.confirm !== true) {
      const error = new Error("Для публикации нужно передать confirm: true.");
      error.status = 400;
      throw error;
    }
    if (task.status !== "ready" || !task.card || task.readinessScore < 75) {
      const error = new Error("Задача ещё недостаточно готова к публикации.");
      error.status = 409;
      throw error;
    }
    const updated = await store.updateTask(task.id, {
      status: "published",
      publishedAt: new Date().toISOString()
    });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/archive", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    const updated = await store.updateTask(task.id, { status: "archived" });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/applications", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (task.status !== "published") {
      const error = new Error("Отклик можно отправить только на опубликованную задачу.");
      error.status = 409;
      throw error;
    }
    const data = parseBody(applicationCreateSchema, request.body);
    const application = await store.createApplication({ taskId: task.id, ...data });
    response.status(201).json(application);
  }));

  app.get("/api/tasks/:id/applications", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    const applications = await store.listApplications(task.id);
    response.json({ items: applications, total: applications.length });
  }));

  app.patch("/api/applications/:id", asyncHandler(async (request, response) => {
    const data = parseBody(applicationPatchSchema, request.body);
    if (!applicationStatuses.has(data.status)) {
      const error = new Error("Неизвестный статус отклика.");
      error.status = 400;
      throw error;
    }
    const application = await store.getApplication(request.params.id);
    if (!application) throw notFound("Отклик не найден.");
    response.json(await store.updateApplication(application.id, data));
  }));

  app.use((request, response, next) => next(notFound("Маршрут не найден.")));

  app.use((error, request, response, next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error.message);
    response.status(status).json({
      error: error.message || "Внутренняя ошибка сервера.",
      ...(error.details ? { details: error.details } : {})
    });
  });

  return app;
}
