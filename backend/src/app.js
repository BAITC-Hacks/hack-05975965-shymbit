import express from "express";
import { randomUUID } from "node:crypto";
import { calculateReadiness } from "./readiness.js";
import { rateLimit } from "express-rate-limit";
import { authentication, authRouter, requireRole, requireOwner, requireVersion, entityTag,
  publicTask, publicTeam, concurrencyLimit, httpError } from "./security.js";
import { installImports } from "./imports.js";
import {
  answersSchema,
  assistantPlanRequestSchema,
  assistantPlanSchema,
  applicationCreateSchema,
  applicationPatchSchema,
  parseBody,
  taskCreateSchema,
  taskPatchSchema,
  teamCreateSchema,
  teamIdSchema,
  teamPatchSchema,
  teamReviewCreateSchema
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

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateAssistantPlan(plan, team) {
  const result = assistantPlanSchema.safeParse(plan);
  if (!result.success) {
    const error = new Error("AI вернул неполный план. Попробуйте сгенерировать его ещё раз.");
    error.status = 502;
    throw error;
  }

  const memberNames = new Set(team.members.map((member) => member.name.trim().toLocaleLowerCase()));
  if (result.data.assignments.some((assignment) => !memberNames.has(assignment.memberName.trim().toLocaleLowerCase()))) {
    const error = new Error("AI распределил задачи между участниками, которых нет в профиле команды.");
    error.status = 502;
    throw error;
  }
  return result.data;
}

export function createApp({ store, aiService, importLimits, aiRequestLimit = 10, aiConcurrency = 2 }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, If-Match");
    response.setHeader("Access-Control-Expose-Headers", "ETag, Retry-After");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (request, response) => {
    response.json({ status: "ok", service: "ai-sana-challenge-hub" });
  });
  app.use("/api", authentication(store));
  app.use("/api/auth", authRouter(store, asyncHandler));
  const runAI = concurrencyLimit(aiConcurrency);
  const aiLimits = rateLimit({ windowMs: 15 * 60 * 1000, limit: aiRequestLimit,
    keyGenerator: (req) => req.user.id, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: "Лимит AI-запросов исчерпан. Попробуйте позже." }) });
  app.post(["/api/tasks/:id/clarify", "/api/tasks/:id/generate", "/api/tasks/:id/assistant/plan"], (req, res, next) => {
    try { requireRole(req); aiLimits(req, res, next); } catch (error) { next(error); }
  });
  installImports(app, { store, aiService, asyncHandler, aiLimits, runAI, importLimits });

  app.get("/api/me/teams", asyncHandler(async (req, res) => {
    requireRole(req, "student");
    const items = (await store.listTeams()).filter((team) => team.ownerId === req.user.id);
    res.json({ items, total: items.length });
  }));
  app.get("/api/me/applications", asyncHandler(async (req, res) => {
    requireRole(req, "student");
    const items = (await store.listApplications()).filter((item) => item.ownerId === req.user.id);
    res.json({ items, total: items.length });
  }));

  app.post("/api/teams", asyncHandler(async (request, response) => {
    requireRole(request, "student");
    const data = parseBody(teamCreateSchema, request.body);
    const team = await store.createTeam({ ...data, ownerId: request.user.id });
    response.set("ETag", entityTag(team));
    response.status(201).json(team);
  }));

  app.get("/api/teams", asyncHandler(async (request, response) => {
    const minimumRating = request.query.minimumRating === undefined ? null : Number(request.query.minimumRating);
    if (minimumRating !== null && (!Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 5)) {
      throw badRequest("Минимальный рейтинг должен быть числом от 0 до 5.");
    }

    const skillFilters = parseList(request.query.skill);
    const technologyFilters = parseList(request.query.technology);
    const teams = await store.listTeams();
    const items = teams.filter((team) => {
      const memberSkills = team.members.flatMap((member) => member.skills || []);
      if (!includesAny([...team.skills, ...memberSkills], skillFilters)) return false;
      if (!includesAny(team.technologies, technologyFilters)) return false;
      return minimumRating === null || team.rating.average >= minimumRating;
    });
    response.json({ items: items.map(publicTeam), total: items.length });
  }));

  app.get("/api/teams/:id/reviews", asyncHandler(async (request, response) => {
    const team = await store.getTeam(request.params.id);
    if (!team) throw notFound("Команда не найдена.");
    const reviews = await store.listReviews(team.id);
    response.json({ items: reviews.map(({ authorId, ...review }) => review), total: reviews.length });
  }));

  app.post("/api/teams/:id/reviews", asyncHandler(async (request, response) => {
    requireRole(request, "business");
    const team = await store.getTeam(request.params.id);
    if (!team) throw notFound("Команда не найдена.");
    const data = parseBody(teamReviewCreateSchema, request.body);
    const task = await store.getTask(data.taskId);
    if (!task) throw notFound("Задача не найдена.");
    requireOwner(request, task, "business");
    data.authorName = task.organization;
    if (!await store.hasAcceptedApplication(task.id, team.id)) {
      const error = new Error("Оставить отзыв можно после принятия отклика этой команды.");
      error.status = 409;
      throw error;
    }
    if (await store.hasApplicationReview(team.id, task.id, data.authorName)) {
      const error = new Error("Эта организация уже оставила отзыв по данной задаче.");
      error.status = 409;
      throw error;
    }
    const review = await store.createReview({ teamId: team.id, ...data, authorId: request.user.id });
    if (!review) {
      const error = new Error("Эта организация уже оставила отзыв по данной задаче.");
      error.status = 409;
      throw error;
    }
    response.status(201).json({ review, rating: (await store.getTeam(team.id)).rating });
  }));

  app.get("/api/teams/:id", asyncHandler(async (request, response) => {
    const team = await store.getTeam(request.params.id);
    if (!team) throw notFound("Команда не найдена.");
    response.set("ETag", entityTag(team));
    response.json(team.ownerId === request.user?.id ? team : publicTeam(team));
  }));

  app.patch("/api/teams/:id", asyncHandler(async (request, response) => {
    const existing = await store.getTeam(request.params.id);
    if (!existing) throw notFound("Команда не найдена.");
    requireOwner(request, existing, "student");
    requireVersion(request, existing);
    const patch = parseBody(teamPatchSchema, request.body);
    if (Object.keys(patch).length === 0) throw badRequest("Укажите хотя бы одно поле для изменения.");
    const updated = await store.updateTeam(existing.id, patch, existing);
    response.set("ETag", entityTag(updated)).json(updated);
  }));

  app.post("/api/tasks", asyncHandler(async (request, response) => {
    requireRole(request, "business");
    const data = parseBody(taskCreateSchema, request.body);
    const task = await store.createTask({
      ...data,
      ownerId: request.user.id,
      skills: data.skills || [],
      technologies: data.technologies || [],
      status: "draft"
    });
    response.set("ETag", entityTag(task)).status(201).json(task);
  }));

  app.get("/api/tasks", asyncHandler(async (request, response) => {
    const requestedStatus = request.query.status || "published";
    if (requestedStatus !== "all" && !statuses.has(requestedStatus)) {
      const error = new Error("Неизвестный статус задачи.");
      error.status = 400;
      throw error;
    }
    if (requestedStatus !== "published" || request.query.mine === "true") requireRole(request, "business");

    const skillFilters = parseList(request.query.skill || request.query.skills);
    const technologyFilters = parseList(request.query.technology || request.query.technologies);
    const deadlineBefore = request.query.deadlineBefore ? String(request.query.deadlineBefore) : null;
    const tasks = await store.listTasks();
    const result = tasks.filter((task) => {
      if ((requestedStatus !== "published" || request.query.mine === "true") && task.ownerId !== request.user.id) return false;
      if (requestedStatus !== "all" && task.status !== requestedStatus) return false;
      const card = task.card || {};
      if (!includesAny(card.skills || task.skills || [], skillFilters)) return false;
      if (!includesAny(card.technologies || task.technologies || [], technologyFilters)) return false;
      if (deadlineBefore && (!card.deadline || card.deadline > deadlineBefore)) return false;
      return true;
    });
    if (requestedStatus === "published" || requestedStatus === "all") {
      const publicationTime = (task) => Date.parse(task.publishedAt) || 0;
      result.sort((left, right) => publicationTime(right) - publicationTime(left)
        || left.id.localeCompare(right.id));
    }
    response.json({ items: result.map((task) => task.ownerId === request.user?.id ? task : publicTask(task)), total: result.length });
  }));

  app.get("/api/tasks/:id", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    if (task.status !== "published") requireOwner(request, task, "business");
    response.set("ETag", entityTag(task)).json(task.ownerId === request.user?.id ? task : publicTask(task));
  }));

  app.patch("/api/tasks/:id", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    if (["published", "archived"].includes(task.status)) {
      const error = new Error("Опубликованную или архивную задачу нельзя изменить.");
      error.status = 409;
      throw error;
    }
    const patch = parseBody(taskPatchSchema, request.body);
    requireVersion(request, task);
    const updated = await store.updateTask(task.id, { ...patch, card: null, readinessScore: 0,
      readinessExplanation: "Данные изменились. Сформируйте карточку заново.", status: "draft" }, task);
    response.set("ETag", entityTag(updated)).json(updated);
  }));

  app.post("/api/tasks/:id/clarify", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    if (task.status === "published" || task.status === "archived") {
      const error = new Error("Для этой задачи нельзя создать новые вопросы.");
      error.status = 409;
      throw error;
    }
    const questions = await runAI(() => aiService.generateQuestions(task));
    const clarificationQuestions = questions.map((item) => ({
      id: randomUUID(),
      question: item.question,
      answer: ""
    }));
    const updated = await store.updateTask(task.id, {
      clarificationQuestions,
      status: "needs_clarification"
    }, task);
    response.json({ questions: updated.clarificationQuestions, task: updated });
  }));

  app.post("/api/tasks/:id/answers", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    if (["published", "archived"].includes(task.status)) throw httpError(409, "Для этой задачи нельзя изменить ответы.");
    requireVersion(request, task);
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
    const updated = await store.updateTask(task.id, { clarificationQuestions, card: null, readinessScore: 0,
      readinessExplanation: "Ответы изменились. Сформируйте карточку заново.", status: "needs_clarification" }, task);
    response.set("ETag", entityTag(updated)).json(updated);
  }));

  app.post("/api/tasks/:id/generate", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    if (task.status === "published" || task.status === "archived") {
      const error = new Error("Для этой задачи нельзя сформировать новую карточку.");
      error.status = 409;
      throw error;
    }
    const card = await runAI(() => aiService.generateCard(task));
    const readiness = calculateReadiness(task, card);
    const updated = await store.updateTask(task.id, {
      card,
      readinessScore: readiness.score,
      readinessExplanation: readiness.explanation,
      status: readiness.status
    }, task);
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
    requireOwner(request, task, "business");
    if (request.body?.confirm !== true) {
      const error = new Error("Для публикации нужно передать confirm: true.");
      error.status = 400;
      throw error;
    }
    const updated = await store.updateTask(task.id, (current) => {
      if (current.status === "published") return null;
      if (current.status !== "ready" || !current.card || current.readinessScore < 75) {
        const error = new Error("Задача ещё недостаточно готова к публикации.");
        error.status = 409;
        throw error;
      }
      return { status: "published", publishedAt: new Date().toISOString() };
    });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/archive", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    const updated = await store.updateTask(task.id, { status: "archived" });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/applications", asyncHandler(async (request, response) => {
    requireRole(request, "student");
    const task = await requireTask(store, request.params.id);
    if (task.status !== "published") {
      const error = new Error("Отклик можно отправить только на опубликованную задачу.");
      error.status = 409;
      throw error;
    }
    const data = parseBody(applicationCreateSchema, request.body);
    let applicationData = data;
    if (data.teamId) {
      const team = await store.getTeam(data.teamId);
      if (!team) throw notFound("Команда не найдена.");
      requireOwner(request, team, "student");
      applicationData = {
        ...data,
        teamName: team.name,
        members: team.members.map((member) => member.name),
        technologies: team.technologies
      };
    }
    const application = await store.createApplication({ taskId: task.id, ...applicationData, ownerId: request.user.id });
    response.status(201).json(application);
  }));

  app.get("/api/tasks/:id/applications", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    requireOwner(request, task, "business");
    const applications = await store.listApplications(task.id);
    response.json({ items: applications, total: applications.length });
  }));

  app.patch("/api/applications/:id", asyncHandler(async (request, response) => {
    requireRole(request, "business");
    const data = parseBody(applicationPatchSchema, request.body);
    if (!applicationStatuses.has(data.status)) {
      const error = new Error("Неизвестный статус отклика.");
      error.status = 400;
      throw error;
    }
    const application = await store.getApplication(request.params.id);
    if (!application) throw notFound("Отклик не найден.");
    requireOwner(request, await store.getTask(application.taskId), "business");
    response.json(await store.updateApplication(application.id, data));
  }));

  app.post("/api/tasks/:taskId/assistant/plan", asyncHandler(async (request, response) => {
    requireRole(request, "student");
    const task = await requireTask(store, request.params.taskId);
    if (task.status !== "published") {
      const error = new Error("AI-план можно создать только для опубликованной задачи.");
      error.status = 409;
      throw error;
    }
    const { teamId, focus } = parseBody(assistantPlanRequestSchema, request.body);
    const team = await store.getTeam(teamId);
    if (!team) throw notFound("Команда не найдена.");
    requireOwner(request, team, "student");
    if (!team.members.length) {
      const error = new Error("Добавьте участников в профиль команды перед генерацией плана.");
      error.status = 409;
      throw error;
    }

    const plan = validateAssistantPlan(await runAI(() => aiService.generateAssistantPlan(publicTask(task), publicTeam(team), focus)), team);
    const savedPlan = await store.createAssistantPlan({ taskId: task.id, teamId: team.id, plan });
    response.status(201).json(savedPlan);
  }));

  app.get("/api/tasks/:taskId/assistant/plans", asyncHandler(async (request, response) => {
    requireRole(request, "student");
    const task = await requireTask(store, request.params.taskId);
    const teamId = request.query.teamId;
    if (typeof teamId !== "string") throw badRequest("Параметр teamId обязателен.");
    if (!teamIdSchema.safeParse(teamId).success) throw badRequest("Параметр teamId должен быть корректным UUID.");
    const team = await store.getTeam(teamId);
    if (!team) throw notFound("Команда не найдена.");
    requireOwner(request, team, "student");
    const items = await store.listAssistantPlans(task.id, team.id);
    response.json({ items, total: items.length });
  }));

  app.get("/api/assistant-plans/:id", asyncHandler(async (request, response) => {
    requireRole(request, "student");
    const plan = await store.getAssistantPlan(request.params.id);
    if (!plan) throw notFound("План решения не найден.");
    requireOwner(request, await store.getTeam(plan.teamId), "student");
    response.json(plan);
  }));

  app.use((request, response, next) => next(notFound("Маршрут не найден.")));

  app.use((error, request, response, next) => {
    const uploadError = error.name === "MulterError";
    const status = uploadError ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      : Number.isInteger(error.status) ? error.status : 500;
    response.status(status).json({
      error: uploadError ? "Ошибка загрузки. Проверьте размер файла и отправьте один документ."
        : status === 500 ? "Внутренняя ошибка сервера. Попробуйте позже."
          : error.type === "entity.parse.failed" ? "Некорректный JSON запроса."
            : error.type === "entity.too.large" ? "Тело запроса превышает допустимый размер." : error.message,
      ...(error.details ? { details: error.details } : {})
    });
  });

  return app;
}
