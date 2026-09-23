import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('Направления каталога определяются по реальным полям задачи', async (t) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => server.close());
  const { getTaskDirections } = await server.ssrLoadModule('/src/lib/taskDirections.ts');
  const task = { title: 'Учебный проект', shortDescription: '', skills: [], technologies: [] };
  assert.deepEqual(getTaskDirections(task), []);
  assert.deepEqual(getTaskDirections({ ...task, title: 'AI-помощник', technologies: ['React'], skills: ['UX'] }), ['ai', 'web', 'design']);
  assert.deepEqual(getTaskDirections({ ...task, shortDescription: 'Анализ данных' }), ['ai']);
  assert.deepEqual(getTaskDirections({ ...task, technologies: ['Figma'] }), ['design']);
  assert.deepEqual(getTaskDirections({ ...task, title: 'Веб-сайт университета' }), ['web']);
  assert.deepEqual(getTaskDirections({ ...task, title: 'Chair repairs' }), []);
});
