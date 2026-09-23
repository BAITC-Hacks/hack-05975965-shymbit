import { useSyncExternalStore } from 'react'

export interface User { id: string; name: string; email: string; role: 'business' | 'student' }
export interface Session { user: User; token: string; expiresAt: string }
const key = 'sana-session'
function read(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null')
    return value?.user?.id && ['business', 'student'].includes(value.user.role)
      && /^[a-f0-9]{64}$/.test(value.token) && Date.parse(value.expiresAt) > Date.now() ? value : null
  } catch { return null }
}
let session = read()
const listeners = new Set<() => void>()
export const getSession = () => session
export function setSession(value: Session | null) {
  session = value
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key) } catch { /* Приватный режим: сессия остаётся в памяти. */ }
  listeners.forEach((notify) => notify())
}
export function useSession() {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify) } }, getSession, () => null)
}
