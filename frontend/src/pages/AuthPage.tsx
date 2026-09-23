import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { useSession, type User } from '../lib/session'

export function AuthPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<User['role']>('business')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const user = register ? await api.register({ name, email, password, role }) : await api.login(email, password)
      setPassword('')
      const next = params.get('next') || ''
      navigate(next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.startsWith('/login') ? next : user.role === 'business' ? '/my-tasks' : '/my-teams', { replace: true })
    } catch (err) { setError(getErrorMessage(err)) } finally { setBusy(false) }
  }
  if (import.meta.env.VITE_USE_MOCK_API === 'true') return <div className="container page"><h1>Демонстрационный режим</h1><p>Для аккаунтов и импорта документов отключите VITE_USE_MOCK_API и запустите backend.</p></div>
  if (session) return <div className="container page"><h1>Вы вошли как {session.user.name}</h1><p>{session.user.email} · {session.user.role === 'business' ? 'Бизнес' : 'Студент'}</p><p>ID аккаунта: <code>{session.user.id}</code></p><Link to={session.user.role === 'business' ? '/my-tasks' : '/my-teams'}>Перейти в личный раздел</Link></div>
  return <div className="page"><div className="container container--narrow"><h1>{register ? 'Создать аккаунт' : 'С возвращением'}</h1><p>Бизнес публикует задачи, студенты создают команды и предлагают решения.</p><form className="form-card" onSubmit={submit}><fieldset disabled={busy}>
    <div className="form-grid">
      {register && <><label className="field"><span>Ваше имя</span><input required minLength={2} maxLength={200} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>Роль (после регистрации не меняется)</span><select value={role} onChange={(e) => setRole(e.target.value as User['role'])}><option value="business">Бизнес</option><option value="student">Студент</option></select></label></>}
      <label className="field"><span>Электронная почта</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>Пароль (12–128 символов)</span><input required type="password" minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    </div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button button--ghost" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Уже есть аккаунт' : 'Регистрация'}</button><button className="button button--primary">{busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти'}</button></div>
    <p className="muted">Сессия действует до 24 часов и хранится в этой вкладке. Не используйте общий компьютер без выхода из аккаунта.</p>
  </fieldset></form></div></div>
}
