import express from "express";
import { randomUUID } from "node:crypto";
import { calculateReadiness } from "./readiness.js";
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
    response.json({ status: "ok", service: "ai-sana-challenge-hub" });
  });

  app.post("/api/teams", asyncHandler(async (request, response) => {
    const data = parseBody(teamCreateSchema, request.body);
    const team = await store.createTeam(data);
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
    response.json({ items, total: items.length });
  }));

  app.get("/api/teams/:id/reviews", asyncHandler(async (request, response) => {
    const team = await store.getTeam(request.params.id);
    if (!team) throw notFound("Команда не найдена.");
    const reviews = await store.listReviews(team.id);
    response.json({ items: reviews, total: reviews.length });
  }));

  app.post("/api/teams/:id/reviews", asyncHandler(async (request, response) => {
    const team = await store.getTeam(request.params.id);
    if (!team) throw notFound("Команда не найдена.");
    const data = parseBody(teamReviewCreateSchema, request.body);
    const task = await store.getTask(data.taskId);
    if (!task) throw notFound("Задача не найдена.");
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
    const review = await store.createReview({ teamId: team.id, ...data });
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
    response.json(team);
  }));

  app.patch("/api/teams/:id", asyncHandler(async (request, response) => {
    const existing = await store.getTeam(request.params.id);
    if (!existing) throw notFound("Команда не найдена.");
    const patch = parseBody(teamPatchSchema, request.body);
    if (Object.keys(patch).length === 0) throw badRequest("Укажите хотя бы одно поле для изменения.");
    response.json(await store.updateTeam(existing.id, patch));
  }));

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
      const deadline = card.deadline || task.deadline;
      if (deadlineBefore && (!deadline || deadline > deadlineBefore)) return false;
      return true;
    });
    if (requestedStatus === "published" || requestedStatus === "all") {
      const publicationTime = (task) => Date.parse(task.publishedAt) || 0;
      result.sort((left, right) => publicationTime(right) - publicationTime(left)
        || left.id.localeCompare(right.id));
    }
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
    response.json(await store.updateTask(task.id, patch, task));
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
    }, task);
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
    const updated = await store.updateTask(task.id, { clarificationQuestions }, task);
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
    if (request.body?.confirm !== true) {
      const error = new Error("Для публикации нужно передать confirm: true.");
      error.status = 400;
      throw error;
    }
    const updated = await store.updateTask(task.id, (current) => {
      if (current.status === "published") return null;
      // Готовность — рекомендация; решение о публикации подтверждает пользователь.
      return { status: "published", publishedAt: new Date().toISOString() };
    });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/archive", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    const updated = await store.updateTask(task.id, { status: "archived" });
    response.json(updated);
  }));

  app.post("/api/tasks/:id/restore", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.id);
    const updated = await store.updateTask(task.id, (current) => {
      if (current.status !== "archived") return null;
      // Восстановление не публикует задачу и не удаляет карточку или отклики.
      if (current.card) {
        const readiness = calculateReadiness(current, current.card);
        return { status: readiness.status, readinessScore: readiness.score, readinessExplanation: readiness.explanation };
      }
      return { status: current.clarificationQuestions?.length ? "needs_clarification" : "draft" };
    });
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
    let applicationData = data;
    if (data.teamId) {
      const team = await store.getTeam(data.teamId);
      if (!team) throw notFound("Команда не найдена.");
      applicationData = {
        ...data,
        teamName: team.name,
        members: team.members.map((member) => member.name),
        technologies: team.technologies
      };
    }
    const application = await store.createApplication({ taskId: task.id, ...applicationData });
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

  app.post("/api/tasks/:taskId/assistant/plan", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.taskId);
    if (task.status !== "published") {
      const error = new Error("AI-план можно создать только для опубликованной задачи.");
      error.status = 409;
      throw error;
    }
    const { teamId, focus } = parseBody(assistantPlanRequestSchema, request.body);
    const team = await store.getTeam(teamId);
    if (!team) throw notFound("Команда не найдена.");
    if (!team.members.length) {
      const error = new Error("Добавьте участников в профиль команды перед генерацией плана.");
      error.status = 409;
      throw error;
    }

    const plan = validateAssistantPlan(await aiService.generateAssistantPlan(task, team, focus), team);
    const savedPlan = await store.createAssistantPlan({ taskId: task.id, teamId: team.id, plan });
    response.status(201).json(savedPlan);
  }));

  app.get("/api/tasks/:taskId/assistant/plans", asyncHandler(async (request, response) => {
    const task = await requireTask(store, request.params.taskId);
    const teamId = request.query.teamId;
    if (typeof teamId !== "string") throw badRequest("Параметр teamId обязателен.");
    if (!teamIdSchema.safeParse(teamId).success) throw badRequest("Параметр teamId должен быть корректным UUID.");
    const team = await store.getTeam(teamId);
    if (!team) throw notFound("Команда не найдена.");
    const items = await store.listAssistantPlans(task.id, team.id);
    response.json({ items, total: items.length });
  }));

  app.get("/api/assistant-plans/:id", asyncHandler(async (request, response) => {
    const plan = await store.getAssistantPlan(request.params.id);
    if (!plan) throw notFound("План решения не найден.");
    response.json(plan);
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
