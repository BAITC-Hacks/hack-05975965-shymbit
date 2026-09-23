export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ai-sana-theme'

export function normalizeTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light'
}

export function getStoredTheme(): Theme {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101113' : '#f6f5f0')
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Переключение работает и при запрете сохранения в браузере.
  }
}

/** Меняет и DOM, и React-состояние внутри одного снимка новой темы. */
export async function changeThemeWithTransition(theme: Theme, onChange: () => void = () => {}) {
  const root = document.documentElement
  let applied = false
  const commit = () => {
    if (applied) return
    applied = true
    applyTheme(theme)
    onChange()
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    commit()
    return
  }

  if (typeof document.startViewTransition !== 'function') {
    root.dataset.themeMotion = 'fallback'
    commit()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 460))
    delete root.dataset.themeMotion
    return
  }

  root.dataset.themeMotion = 'native'
  try {
    const transition = document.startViewTransition(commit)
    // ready может отклониться, например, при уходе со вкладки: тема всё равно меняется.
    void transition.ready.catch(() => {})
    void transition.updateCallbackDone.catch(() => {})
    await transition.finished
  } catch {
    // Ошибка API не блокирует переключатель и сохранение выбранной темы.
  } finally {
    commit()
    delete root.dataset.themeMotion
  }
}
