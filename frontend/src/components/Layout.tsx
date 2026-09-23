import { ArrowUpRight, Menu, Network, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { usePageMotion } from '../lib/usePageMotion'

import { api } from '../lib/api'
import { useSession } from '../lib/session'

const links = [
  { to: '/tasks', label: 'Задачи' },
  { to: '/teams', label: 'Команды' },

]

export function Layout() {
  const session = useSession()
  const personal = session?.user.role === 'student' ? '/my-teams' : '/my-tasks'
  const create = session?.user.role === 'student' ? '/teams/new' : '/tasks/new'
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const motionRef = usePageMotion(pathname)
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [pathname])
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>
      <header className="header">
        <div className="container header__inner">
          <Link className="brand" to="/" aria-label="AI Sana — главная" onClick={() => setOpen(false)}>
            <span className="brand__mark"><Network size={28} strokeWidth={1.5} /></span>
            <span><strong>AI SANA<span className="brand__dot">.</span></strong><small>Challenge Hub</small></span>
          </Link>
          <div className="header__actions">
            <nav id="main-nav" className={`nav ${open ? 'nav--open' : ''}`} aria-label="Основная навигация">
              {links.map(({ to, label }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav__link nav__link--active' : 'nav__link'}>{label}</NavLink>)}
              {session && <NavLink className="nav__link" to={personal} onClick={() => setOpen(false)}>{session.user.role === 'student' ? 'Мои команды' : 'Мои задачи'}</NavLink>}
            <Link className="button button--outline button--small" to={create} onClick={() => setOpen(false)}>{session?.user.role === 'student' ? 'Создать команду' : 'Создать задачу'}<ArrowUpRight size={16} /></Link>
            {session && <Link className="nav__link" to="/account" onClick={() => setOpen(false)}>Аккаунт</Link>}
            {session ? <button className="button button--ghost button--small" title={session.user.email} onClick={() => { void api.logout().catch(() => {}); setOpen(false) }}>Выйти</button> : <Link className="nav__link" to="/login" onClick={() => setOpen(false)}>Войти</Link>}
            </nav>
            <ThemeToggle />
            <button className="menu-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="main-nav" aria-label={open ? 'Закрыть меню' : 'Открыть меню'}>{open ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>
      {import.meta.env.VITE_USE_MOCK_API === 'true' && <div className="demo-banner" role="status">Демонстрационный режим · тестовые данные и AI-планы · изменения сохраняются до перезагрузки страницы</div>}
      <main id="main-content" tabIndex={-1} ref={motionRef}><Outlet /></main>
      <footer className="footer">
        <div className="container footer__top">
          <div><Link className="brand brand--footer" to="/"><Network size={25} strokeWidth={1.5} /><strong>AI SANA.</strong></Link><p>У каждой идеи есть будущее.<br />Найдите тех, кто создаст его вместе с вами.</p></div>
          <div className="footer__links"><Link to="/tasks">Найти проект<ArrowUpRight size={14} /></Link><Link to="/teams">Найти команду<ArrowUpRight size={14} /></Link><Link to="/tasks/new">Разместить задачу<ArrowUpRight size={14} /></Link></div>
        </div>
        <div className="container footer__bottom"><span>AI Sana Challenge Hub © 2026</span><span>Казахстан · Образование через практику</span></div>
      </footer>
    </div>
  )
}
