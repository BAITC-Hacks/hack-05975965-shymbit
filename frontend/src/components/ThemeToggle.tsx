import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { applyTheme, changeThemeWithTransition, getStoredTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState(getStoredTheme)
  const [changing, setChanging] = useState(false)
  const locked = useRef(false)

  useEffect(() => { applyTheme(theme) }, [theme])

  const changeTheme = async () => {
    if (locked.current) return
    locked.current = true
    setChanging(true)
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    try {
      await changeThemeWithTransition(nextTheme, () => {
        flushSync(() => setTheme(nextTheme))
      })
    } finally {
      locked.current = false
      setChanging(false)
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={changeTheme}
      disabled={changing}
      aria-busy={changing}
      aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
      title={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
    >
      {theme === 'light' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span>{theme === 'light' ? 'Светлая' : 'Тёмная'}</span>
    </button>
  )
}
