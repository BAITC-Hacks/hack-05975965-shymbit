import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  dbFile: path.resolve(process.env.DB_FILE || "./data/db.json"),
  aiApiKey: process.env.AI_API_KEY || "",
  aiBaseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000)
};
