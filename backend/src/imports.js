import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseBody, taskCreateSchema, teamCreateSchema } from "./validation.js";
import { documentDefaults, documentType, parseDocument } from "./services/documentParser.js";
import { httpError, requireRole, requireOwner } from "./security.js";

const schemas = { task: taskCreateSchema, team: teamCreateSchema };
export const importFields = Object.fromEntries(Object.entries(schemas).map(([type, schema]) => [type, Object.keys(schema.shape)]));
const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const leaves = (value) => typeof value === "string" ? [value]
  : Array.isArray(value) ? value.flatMap(leaves) : Object.values(value).flatMap(leaves);

export function validateSuggestions(result, targetType, document, fileName) {
  const allowed = importFields[targetType];
  const suggestion = z.object({
    field: z.enum(allowed), value: z.unknown(),
    source: z.object({ page: z.number().int().positive().nullable(), excerpt: z.string().trim().min(1).max(10000) }).strict(),
    warnings: z.array(z.string().max(1000)).max(10)
  }).strict();
  const parsed = z.object({ suggestions: z.array(suggestion).max(allowed.length),
    warnings: z.array(z.string().max(1000)).max(20) }).strict().safeParse(result);
  if (!parsed.success) throw httpError(502, "AI вернул некорректный набор предложений.");
  const seen = new Set();
  const suggestions = parsed.data.suggestions.map((item) => {
    const value = schemas[targetType].shape[item.field].safeParse(item.value);
    const page = document.pages.find((page) => page.page === item.source.page);
    const excerpt = normalize(item.source.excerpt);
    if (seen.has(item.field) || !value.success || value.data === undefined || !page
      || !normalize(page.text).includes(excerpt) || !leaves(value.data).length
      || leaves(value.data).some((text) => !normalize(text) || !excerpt.includes(normalize(text)))) {
      throw httpError(502, "AI предложил данные без подтверждения в документе. Заполните поля вручную или повторите запрос.");
    }
    seen.add(item.field);
    return { ...item, value: value.data, source: { ...item.source, fileName } };
  });
  return { importId: randomUUID(), targetType, suggestions,
    missingFields: allowed.filter((field) => !seen.has(field)), warnings: parsed.data.warnings };
}

export function installImports(app, { store, aiService, asyncHandler, aiLimits, runAI, importLimits = {} }) {
  const limits = { ...documentDefaults, ...importLimits };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limits.maxBytes,
    files: 1, fields: 2, parts: 3, fieldSize: 200, fieldNameSize: 50 },
    fileFilter: (req, file, done) => { try { documentType(file); done(null, true); } catch (error) { done(error); } }
  }).single("file");
  app.post("/api/imports/extract", (req, res, next) => {
    try { requireRole(req); next(); } catch (error) { next(error); }
  }, aiLimits, asyncHandler(async (req, res) => runAI(async () => {
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(httpError(408, "Время загрузки файла истекло."));
          req.destroy();
        }, 30000);
        upload(req, res, (error) => { clearTimeout(timer); if (error) reject(error); else resolve(); });
      });
      const { targetType, targetId } = parseBody(z.object({
        targetType: z.enum(["task", "team"]), targetId: z.string().uuid().optional()
      }).strict(), req.body);
      requireRole(req, targetType === "task" ? "business" : "student");
      if (targetId) {
        const entity = await (targetType === "task" ? store.getTask(targetId) : store.getTeam(targetId));
        requireOwner(req, entity, targetType === "task" ? "business" : "student");
        if (targetType === "task" && ["published", "archived"].includes(entity.status)) {
          throw httpError(409, "Нельзя импортировать данные в опубликованную или архивную задачу.");
        }
      }
      if (!req.file) throw httpError(400, "Прикрепите один документ в поле file.");
      const document = await parseDocument(req.file, limits);
      const result = await aiService.extractFields(targetType, document);
      // Имя используется только как подпись источника, никогда как путь на диске.
      const fileName = req.file.originalname.split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, "").slice(0, 200);
      res.json(validateSuggestions(result, targetType, document, fileName));
    } finally {
      if (req.file?.buffer) req.file.buffer.fill(0);
      delete req.file;
    }
  })));
}
