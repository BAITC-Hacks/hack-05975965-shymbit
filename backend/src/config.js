import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(backendDirectory, '.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
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
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000)
};
