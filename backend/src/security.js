import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { parseBody } from "./validation.js";

const derive = promisify(scrypt);
export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
export const entityTag = (entity) => `"${tokenHash(JSON.stringify(entity))}"`;
export const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });

export function requireRole(request, role) {
  if (!request.user) throw httpError(401, "Войдите в аккаунт.");
  if (role && request.user.role !== role) throw httpError(403, "Это действие недоступно для вашей роли.");
}

export function requireOwner(request, entity, role) {
  requireRole(request, role);
  if (!entity) throw httpError(404, "Объект не найден.");
  if (!entity.ownerId || entity.ownerId !== request.user.id) throw httpError(403, "Нет доступа к этому объекту.");
}

export function requireVersion(request, entity) {
  if (!request.headers["if-match"]) throw httpError(428, "Передайте If-Match из последнего ответа GET.");
  if (request.headers["if-match"] !== entityTag(entity)) throw httpError(409, "Данные изменились. Обновите форму перед сохранением.");
}

export function publicTask(task) {
  const fields = ["id", "title", "organization", "status", "skills", "technologies", "deadline",
    "readinessScore", "readinessExplanation", "createdAt", "updatedAt", "publishedAt"];
  const cardFields = ["title", "problem", "goal", "expectedResult", "description", "requirements",
    "skills", "technologies", "availableData", "constraints", "deadline", "successCriteria"];
  const pick = (value, keys) => Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key]]));
  return { ...pick(task, fields), card: task.card ? pick(task.card, cardFields) : null };
}

export function publicTeam(team) {
  const fields = ["id", "name", "description", "skills", "technologies", "githubUrls", "rating", "createdAt", "updatedAt"];
  return { ...Object.fromEntries(fields.filter((field) => field in team).map((field) => [field, team[field]])),
    members: (team.members || []).map(({ name, role, skills }) => ({ name, role, skills })),
    projects: (team.projects || []).map(({ name, description, url }) => ({ name, description, url })) };
}

export function limitedRequests(limit, windowMs = 15 * 60 * 1000) {
  return rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: "Слишком много запросов. Попробуйте позже." }) });
}

export function concurrencyLimit(maximum) {
  let active = 0;
  return async (operation) => {
    if (active >= maximum) throw httpError(429, "Сервис занят. Повторите запрос позже.");
    active++;
    try { return await operation(); } finally { active--; }
  };
}

async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString("hex")}`;
}

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128)
}).strict();
const registerSchema = loginSchema.extend({ name: z.string().trim().min(2).max(200), role: z.enum(["business", "student"]) });

export function authentication(store) {
  return async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      if (req.headers.authorization) {
        const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization);
        if (!match) throw httpError(401, "Недействительная сессия.");
        req.sessionHash = tokenHash(match[1]);
        const session = await store.getSession(req.sessionHash);
        if (!session || Date.parse(session.expiresAt) <= Date.now()) throw httpError(401, "Сессия истекла. Войдите снова.");
        req.user = await store.getUser(session.userId);
        if (!req.user) throw httpError(401, "Недействительная сессия.");
      }
      next();
    } catch (error) { next(error); }
  };
}

export function authRouter(store, asyncHandler) {
  const router = Router();
  const run = concurrencyLimit(2);
  const limits = limitedRequests(20);
  async function sessionResponse(res, user, status) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await store.createSession({ tokenHash: tokenHash(token), userId: user.id, expiresAt });
    res.status(status).json({ user: publicUser(user), token, expiresAt });
  }
  router.post("/register", limits, asyncHandler(async (req, res) => run(async () => {
    const { password, ...data } = parseBody(registerSchema, req.body);
    const user = await store.createUser({ ...data, passwordHash: await passwordHash(password) });
    await sessionResponse(res, user, 201);
  })));
  router.post("/login", limits, asyncHandler(async (req, res) => run(async () => {
    const { email, password } = parseBody(loginSchema, req.body);
    const user = await store.findUserByEmail(email);
    const stored = user?.passwordHash || `${"0".repeat(32)}:${"0".repeat(128)}`;
    const actual = await passwordHash(password, stored.split(":")[0]);
    if (!timingSafeEqual(Buffer.from(stored), Buffer.from(actual)) || !user) {
      throw httpError(401, "Неверная почта или пароль.");
    }
    await sessionResponse(res, user, 200);
  })));
  router.get("/me", asyncHandler(async (req, res) => {
    requireRole(req);
    res.json({ user: publicUser(req.user) });
  }));
  router.post("/logout", asyncHandler(async (req, res) => {
    requireRole(req);
    await store.deleteSession(req.sessionHash);
    res.status(204).end();
  }));
  return router;
}
