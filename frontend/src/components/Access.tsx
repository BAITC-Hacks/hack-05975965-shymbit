import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession, type User } from '../lib/session'

export function Access({ role, children }: { role: User['role']; children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (import.meta.env.VITE_USE_MOCK_API === 'true') return children
  if (session?.user.role === role) return children
  return <div className="page container container--narrow"><section className="form-card"><h1>{session ? 'Другой раздел' : 'Войдите в аккаунт'}</h1><p>Этот раздел доступен для роли «{role === 'business' ? 'Бизнес' : 'Студент'}».</p>{!session && <Link className="button button--primary" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Войти или зарегистрироваться</Link>}<Link className="button button--ghost" to="/tasks">В каталог</Link></section></div>
}
