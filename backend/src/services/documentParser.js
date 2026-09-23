import { Worker } from "node:worker_threads";
import path from "node:path";
import { httpError } from "../security.js";

export const documentDefaults = {
  maxBytes: 10 * 1024 * 1024, maxPages: 50, maxChars: 50000,
  timeoutMs: 10000, maxExpandedBytes: 20 * 1024 * 1024, maxEntries: 1000
};

export function documentType(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const types = {
    ".txt": "text/plain", ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
  if (!types[extension] || file.mimetype !== types[extension]) {
    throw httpError(415, "Поддерживаются только PDF, DOCX и TXT с соответствующим MIME-типом.");
  }
  return extension.slice(1);
}

export async function parseDocument(file, options = {}) {
  const limits = { ...documentDefaults, ...options };
  const type = documentType(file);
  if (file.buffer.length > limits.maxBytes) throw httpError(413, "Файл превышает допустимый размер.");
  if (!file.buffer.length) throw httpError(422, "Документ пуст.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./documentWorker.js", import.meta.url), {
      workerData: { bytes: file.buffer, type, limits },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
      stdout: true, stderr: true
    });
    // Вывод парсеров может содержать фрагменты документа; не передаём его в журнал.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(httpError(504, "Время обработки документа истекло.")), limits.timeoutMs);
    worker.once("message", (message) => {
      if (message.error) finish(httpError(message.status, message.error));
      else finish(null, message);
    });
    worker.once("error", () => finish(httpError(422, "Документ повреждён или слишком сложен для обработки.")));
    worker.once("exit", () => { if (!settled) finish(httpError(422, "Не удалось обработать документ.")); });
  });
}
