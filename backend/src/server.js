import { createApp } from "./app.js";
import { config } from "./config.js";
import { createAIService } from "./services/aiService.js";
import { createStore } from "./stores/index.js";

try {
  const store = await createStore(config);
  const app = createApp({ store, aiService: createAIService(config), allowedOrigins: config.allowedOrigins,
    production: config.nodeEnv === 'production', importLimits: config.importLimits,
    aiRequestLimit: config.aiRequestLimit, aiConcurrency: config.aiConcurrency, trustProxy: config.trustProxy });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`AI Sana Challenge Hub backend запущен на порту ${config.port}.`);
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    clearTimeout(timeout);
  };
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Порт ${config.port} занят. Запустите npm run dev из корня проекта.`
      : 'Не удалось запустить backend. Проверьте настройки сервера.');
    process.exitCode = 1;
    void stop();
  });
} catch (error) {
  console.error(error.safeDatabaseError ? error.message : 'Не удалось запустить сервер. Проверьте конфигурацию и доступность хранилища.');
  process.exitCode = 1;
}
