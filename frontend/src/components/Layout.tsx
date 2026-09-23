import { BrainCircuit, Building2, Menu, Search, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'

const links = [
  { to: '/tasks', label: 'Каталог', icon: Search },
  { to: '/my-tasks', label: 'Мои задачи', icon: Building2 },
]

export function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="app-shell">
      <header className="header">
        <div className="container header__inner">
          <Link className="brand" to="/" onClick={() => setOpen(false)}>
            <span className="brand__mark"><BrainCircuit size={24} /></span>
            <span><strong>AI Sana</strong><small>Challenge Hub</small></span>
          </Link>
          <button className="menu-button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Закрыть меню' : 'Открыть меню'}>
            {open ? <X /> : <Menu />}
          </button>
          <nav className={`nav ${open ? 'nav--open' : ''}`} aria-label="Основная навигация">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav__link nav__link--active' : 'nav__link'}>
                <Icon size={17} />{label}
              </NavLink>
            ))}
            <Link className="button button--primary button--small" to="/tasks/new" onClick={() => setOpen(false)}>Создать задачу</Link>
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="container footer__inner">
          <div className="brand brand--footer"><span className="brand__mark"><BrainCircuit size={21} /></span><strong>AI Sana Challenge Hub</strong></div>
          <p>Объединяем реальные задачи бизнеса и талантливые студенческие команды Казахстана.</p>
          <span>AI Sana · 2026</span>
        </div>
      </footer>
    </div>
  )
}
