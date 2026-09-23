import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';

test('Темы: светлая по умолчанию, сохранение выбора и недоступное хранилище', async (t) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  t.after(async () => {
    await server.close();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  const { normalizeTheme, getStoredTheme, applyTheme, changeThemeWithTransition, THEME_STORAGE_KEY } = await server.ssrLoadModule('/src/lib/theme.ts');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  for (const saved of [null, 'light', 'dark', 'invalid']) {
    await t.test(`Сохранённая тема: ${saved}`, () => {
      let stored = saved;
      let color;
      const localStorage = {
        getItem: (key) => { assert.equal(key, THEME_STORAGE_KEY); return stored; },
        setItem: (key, value) => { assert.equal(key, THEME_STORAGE_KEY); stored = value; },
      };
      const document = {
        documentElement: { dataset: {}, style: {} },
        querySelector: () => ({ setAttribute: (key, value) => { assert.equal(key, 'content'); color = value; } }),
      };
      globalThis.window = { localStorage };
      globalThis.document = document;
      const expected = saved === 'dark' ? 'dark' : 'light';
      assert.equal(normalizeTheme(saved), expected);
      assert.equal(getStoredTheme(), expected);
      runInNewContext(bootstrap, { localStorage, document });
      assert.equal(document.documentElement.dataset.theme, expected);
      assert.equal(document.documentElement.style.colorScheme, expected);
      assert.equal(color, expected === 'dark' ? '#101113' : '#f6f5f0');
      applyTheme('dark');
      assert.equal(stored, 'dark');
      assert.equal(getStoredTheme(), 'dark');
      assert.equal(document.documentElement.dataset.theme, 'dark');
      assert.equal(color, '#101113');
      applyTheme('light');
      assert.equal(stored, 'light');
      assert.equal(document.documentElement.dataset.theme, 'light');
      assert.equal(color, '#f6f5f0');
    });
  }

  await t.test('Запрет localStorage не мешает смене темы', () => {
    const localStorage = {
      getItem() { throw new Error('Storage blocked'); },
      setItem() { throw new Error('Storage blocked'); },
    };
    const document = {
      documentElement: { dataset: {}, style: {} },
      querySelector: () => ({ setAttribute() {} }),
    };
    globalThis.window = { localStorage };
    globalThis.document = document;
    assert.equal(getStoredTheme(), 'light');
    runInNewContext(bootstrap, { localStorage, document });
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.doesNotThrow(() => applyTheme('dark'));
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.doesNotThrow(() => applyTheme('light'));
    assert.equal(document.documentElement.dataset.theme, 'light');
  });

  const motionEnvironment = ({ reduced = false, startViewTransition } = {}) => {
    let stored;
    let waits = 0;
    globalThis.window = {
      localStorage: { setItem: (_key, value) => { stored = value; } },
      matchMedia: () => ({ matches: reduced }),
      setTimeout: (callback, delay) => { assert.equal(delay, 460); waits++; callback(); },
    };
    globalThis.document = {
      documentElement: { dataset: {}, style: {} },
      querySelector: () => ({ setAttribute() {} }),
      startViewTransition,
    };
    return { stored: () => stored, waits: () => waits };
  };

  await t.test('Без View Transition применяется CSS-переход и снимается блокировка', async () => {
    const env = motionEnvironment();
    let callbacks = 0;
    await changeThemeWithTransition('dark', () => {
      callbacks++;
      assert.equal(document.documentElement.dataset.themeMotion, 'fallback');
    });
    assert.equal(callbacks, 1);
    assert.equal(env.stored(), 'dark');
    assert.equal(env.waits(), 1);
    assert.equal(document.documentElement.dataset.themeMotion, undefined);
  });

  await t.test('Reduced motion меняет тему сразу, без снимков и задержки', async () => {
    const env = motionEnvironment({ reduced: true, startViewTransition: () => assert.fail('Не должен вызываться') });
    await changeThemeWithTransition('light');
    assert.equal(env.stored(), 'light');
    assert.equal(env.waits(), 0);
    assert.equal(document.documentElement.dataset.themeMotion, undefined);
  });

  await t.test('Native View Transition обновляет DOM внутри callback ровно один раз', async () => {
    const env = motionEnvironment({ startViewTransition: (update) => {
      assert.equal(document.documentElement.dataset.themeMotion, 'native');
      const updateCallbackDone = Promise.resolve().then(update);
      return { ready: updateCallbackDone, updateCallbackDone, finished: updateCallbackDone };
    } });
    let callbacks = 0;
    await changeThemeWithTransition('dark', () => { callbacks++; });
    assert.equal(callbacks, 1);
    assert.equal(env.stored(), 'dark');
    assert.equal(document.documentElement.dataset.themeMotion, undefined);
  });

  await t.test('Синхронная ошибка View Transition не мешает смене темы', async () => {
    const env = motionEnvironment({ startViewTransition: () => { throw new Error('API unavailable'); } });
    await changeThemeWithTransition('dark');
    assert.equal(env.stored(), 'dark');
    assert.equal(document.documentElement.dataset.themeMotion, undefined);
  });

  await t.test('Отклонённые promises View Transition не оставляют заблокированную тему', async () => {
    const env = motionEnvironment({ startViewTransition: () => ({
      ready: Promise.reject(new Error('Skipped')),
      updateCallbackDone: Promise.reject(new Error('Skipped')),
      finished: Promise.reject(new Error('Skipped')),
    }) });
    let callbacks = 0;
    await changeThemeWithTransition('light', () => { callbacks++; });
    assert.equal(callbacks, 1);
    assert.equal(env.stored(), 'light');
    assert.equal(document.documentElement.dataset.themeMotion, undefined);
  });
});
