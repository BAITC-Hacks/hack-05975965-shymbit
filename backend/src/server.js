import { createApp } from "./app.js";
import { config } from "./config.js";
import { createAIService } from "./services/aiService.js";
import { createJsonStore } from "./store.js";

const store = await createJsonStore(config.dbFile);
const app = createApp({ store, aiService: createAIService(config), importLimits: config.importLimits,
  aiRequestLimit: config.aiRequestLimit, aiConcurrency: config.aiConcurrency });

const server = app.listen(config.port, () => {
  console.log(`AI Sana Challenge Hub backend запущен на http://localhost:${config.port}`);
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Порт ${config.port} занят. Запустите npm run dev из корня проекта: свободный порт будет выбран автоматически.`
    : 'Не удалось запустить backend. Проверьте настройки сервера.');
  process.exitCode = 1;
});
