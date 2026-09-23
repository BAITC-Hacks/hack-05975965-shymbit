import { ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { TeamCard } from '../components/TeamUI'
import { api, getErrorMessage } from '../lib/api'
import type { Team } from '../types'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [skill, setSkill] = useState('')
  const [technology, setTechnology] = useState('')
  const [rating, setRating] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTeams(await api.getTeams()) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const allSkills = (team: Team) => [...team.skills, ...team.members.flatMap((member) => member.skills)]
  const skills = useMemo(() => Array.from(new Set(teams.flatMap(allSkills))).sort(), [teams])
  const technologies = useMemo(() => Array.from(new Set(teams.flatMap((team) => team.technologies))).sort(), [teams])
  const filtered = teams.filter((team) => (!query || `${team.name} ${team.description}`.toLowerCase().includes(query.trim().toLowerCase())) && (!skill || allSkills(team).includes(skill)) && (!technology || team.technologies.includes(technology)) && (!rating || team.rating.average >= Number(rating)))
  const reset = () => { setQuery(''); setSkill(''); setTechnology(''); setRating('') }
  return <div className="page directory-page directory-page--teams"><div className="container">
    <header className="directory-heading"><div><span className="directory-kicker">Сообщество создателей <span /> AI Sana</span><h1>Хорошие идеи.<br /><em>Сильные команды.</em></h1><p>За каждым решением стоят люди. Найдите тех, кто превратит вашу задачу в работающий продукт.</p></div><div className="directory-heading__aside"><span className="directory-overline">Ваши навыки нужны</span><p>Расскажите о команде, покажите проекты и найдите свой следующий вызов.</p><Link className="button button--primary" to="/teams/new">Представить команду<ArrowUpRight size={18} /></Link></div></header>
    <section className="directory-filters" aria-label="Фильтры команд"><label className="directory-search"><Search size={21} /><input aria-label="Поиск команды" placeholder="Найти команду или направление" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={18} /></button>}</label><div className="directory-selects">
      <span className="directory-filter-label"><SlidersHorizontal size={16} />Уточнить поиск</span>
      <select aria-label="Навык команды" value={skill} onChange={(event) => setSkill(event.target.value)}><option value="">Все навыки</option>{skills.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Технология команды" value={technology} onChange={(event) => setTechnology(event.target.value)}><option value="">Все технологии</option>{technologies.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Минимальный рейтинг" value={rating} onChange={(event) => setRating(event.target.value)}><option value="">Любой рейтинг</option><option value="3">От 3 звёзд</option><option value="4">От 4 звёзд</option><option value="4.5">От 4,5 звёзд</option></select>
      {(query || skill || technology || rating) && <button className="directory-reset" onClick={reset}>Сбросить<X size={14} /></button>}
    </div></section>
    {loading ? <Loader label="Загружаем команды…" /> : error ? <ErrorState message={error} retry={load} /> : filtered.length ? <><div className="directory-results"><h2>Команды сообщества</h2><span aria-live="polite">{filtered.length} из {teams.length}</span></div><div className="directory-team-grid">{filtered.map((team) => <TeamCard key={team.id} team={team} />)}</div></> : <EmptyState title={teams.length ? 'Подходящих команд пока нет' : 'Станьте первой командой'} text={teams.length ? 'Измените фильтры, чтобы увидеть больше команд.' : 'Расскажите о навыках и проектах своей команды.'} action={teams.length ? <button className="button button--secondary" onClick={reset}>Сбросить фильтры</button> : <Link className="button button--primary" to="/teams/new">Создать профиль</Link>} />}
  </div></div>
}
