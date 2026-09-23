import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseBody, taskCreateSchema, teamCreateSchema } from "./validation.js";
import { documentDefaults, documentType, parseDocument } from "./services/documentParser.js";
import { httpError, requireRole, requireOwner } from "./security.js";
import { includesEvidence, recoverSource, labeledSuggestions } from './services/importEvidence.js';

const schemas = { task: taskCreateSchema, team: teamCreateSchema };
export const importFields = Object.fromEntries(Object.entries(schemas).map(([type, schema]) => [type, Object.keys(schema.shape)]));
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
  if (new Set(parsed.data.suggestions.map((item) => item.field)).size !== parsed.data.suggestions.length) {
    throw httpError(502, 'AI вернул повторяющиеся поля. Повторите запрос.');
  }
  const seen = new Set();
  const warnings = [...parsed.data.warnings];
  const suggestions = [];
  const candidates = [...labeledSuggestions(document, targetType), ...parsed.data.suggestions];
  for (const item of candidates) {
    if (seen.has(item.field)) continue;
    const value = schemas[targetType].shape[item.field].safeParse(item.value);
    if (!value.success || value.data === undefined || !leaves(value.data).length) {
      warnings.push(`Поле «${item.field}» пропущено: неподходящий тип или формат значения.`);
      continue;
    }
    const texts = leaves(value.data);
    const page = document.pages.find((page) => page.page === item.source.page);
    let source = item.source;
    const fieldWarnings = [...item.warnings];
    if (!page || !includesEvidence(page.text, source.excerpt)
      || texts.some((text) => !includesEvidence(source.excerpt, text))) {
      source = recoverSource(document, texts, item.source.page);
      if (!source) {
        warnings.push(`Поле «${item.field}» пропущено: значение не подтверждено текстом документа. Заполните его вручную.`);
        continue;
      }
      fieldWarnings.push('Цитата восстановлена по дословному значению в документе. Проверьте контекст.');
    }
    seen.add(item.field);
    suggestions.push({ ...item, value: value.data, warnings: fieldWarnings, source: { ...source, fileName } });
  }
  if (!suggestions.length) warnings.push('Подтверждённые поля не найдены. Используйте документ с явными подписями полей или заполните форму вручную.');
  return { importId: randomUUID(), targetType, suggestions,
    missingFields: allowed.filter((field) => !seen.has(field)), warnings };
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
