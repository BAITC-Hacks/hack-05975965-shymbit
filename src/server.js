import { createApp } from "./app.js";
import { config } from "./config.js";
import { createAIService } from "./services/aiService.js";
import { createJsonStore } from "./store.js";

const store = await createJsonStore(config.dbFile);
const app = createApp({ store, aiService: createAIService(config) });

app.listen(config.port, () => {
  console.log(`AI Sana Challenge Hub backend запущен на http://localhost:${config.port}`);
});
