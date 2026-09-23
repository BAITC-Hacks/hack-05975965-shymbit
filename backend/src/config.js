import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(backendDirectory, '.env') });

function positiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Некорректная настройка ${name}.`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: process.env.TRUST_PROXY_HOPS ? positiveInteger('TRUST_PROXY_HOPS', 1, 5) : false,
  storageDriver: process.env.STORAGE_DRIVER || '',
  databaseUrl: process.env.DATABASE_URL || '',
  dbSslMode: process.env.DB_SSL_MODE || 'verify-full',
  dbPoolMax: process.env.DB_POOL_MAX || 5,
  dbConnectTimeoutMs: process.env.DB_CONNECT_TIMEOUT_MS || 5000,
  dbStatementTimeoutMs: process.env.DB_STATEMENT_TIMEOUT_MS || 10000,
  allowedOrigins: (process.env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
  port: Number(process.env.PORT || 3000),
  dbFile: path.resolve(backendDirectory, process.env.DB_FILE || "./data/db.json"),
  aiApiKey: process.env.AI_API_KEY || "",
  aiBaseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  aiTimeoutMs: positiveInteger("AI_TIMEOUT_MS", 30000, 120000),
  aiRequestLimit: positiveInteger("AI_REQUEST_LIMIT", 10, 100),
  aiConcurrency: positiveInteger("AI_CONCURRENCY", 2, 4),
  importLimits: {
    maxBytes: positiveInteger("IMPORT_MAX_BYTES", 10 * 1024 * 1024, 20 * 1024 * 1024),
    maxPages: positiveInteger("IMPORT_MAX_PAGES", 50, 100),
    maxChars: positiveInteger("IMPORT_MAX_CHARS", 50000, 100000),
    timeoutMs: positiveInteger("IMPORT_TIMEOUT_MS", 10000, 30000)
  }
};
