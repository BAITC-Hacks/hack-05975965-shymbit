// Изолированный стенд для ручной проверки UI: нет рабочих данных и платных AI-запросов.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createApp } from '../../backend/src/app.js';
import { createJsonStore } from '../../backend/src/store.js';

const directory = await mkdtemp(join(tmpdir(), 'sana-ui-test-'));
const store = await createJsonStore(join(directory, 'db.json'));
const aiService = {
  async generateQuestions() { return [{ question: 'Как измерить успешность учебного помощника?' }]; },
  async generateCard(task) { return { title: task.title, description: task.shortDescription, problem: task.shortDescription,
    goal: task.desiredResult, expectedResult: task.desiredResult, availableData: task.availableData,
    constraints: task.constraints, deadline: task.deadline, skills: task.skills, technologies: task.technologies,
    requirements: 'Работающий веб-интерфейс', successCriteria: 'Проверить прототип на тестовых вопросах' }; },
  async extractFields(type, document) { return { suggestions: [{ field: type === 'task' ? 'shortDescription' : 'description',
    value: document.pages[0].text, source: { page: document.pages[0].page, excerpt: document.pages[0].text }, warnings: [] }], warnings: [] }; }
};
const server = createApp({ store, aiService }).listen(0, '127.0.0.1');
await once(server, 'listening');
const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`http://127.0.0.1:${server.address().port}`), 'import.meta.env.VITE_USE_MOCK_API': JSON.stringify('false') } });
await vite.listen();
console.log('ТЕСТОВЫЙ СТЕНД: временная база, ответы AI имитируются, данные будут удалены при остановке.');
vite.printUrls();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(directory, { recursive: true, force: true });
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
