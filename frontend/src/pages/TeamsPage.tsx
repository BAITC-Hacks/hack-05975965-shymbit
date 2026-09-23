import { Plus, Search, Users } from 'lucide-react'
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
  return <div className="page"><div className="container">
    <header className="hub-heading"><div><span className="pill"><Users size={15} />Сообщество создателей</span><h1>Сильные команды.<br /><span>Реальные решения.</span></h1><p>Найдите студентов с нужными навыками — от первой идеи до работающего продукта.</p></div><Link className="button button--primary" to="/teams/new"><Plus size={18} />Создать профиль команды</Link></header>
    <section className="filters" aria-label="Фильтры команд"><label className="search-field"><Search size={20} /><input aria-label="Поиск команды" placeholder="Название команды или направление" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="filter-row">
      <select aria-label="Навык команды" value={skill} onChange={(event) => setSkill(event.target.value)}><option value="">Все навыки</option>{skills.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Технология команды" value={technology} onChange={(event) => setTechnology(event.target.value)}><option value="">Все технологии</option>{technologies.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Минимальный рейтинг" value={rating} onChange={(event) => setRating(event.target.value)}><option value="">Любой рейтинг</option><option value="3">От 3 звёзд</option><option value="4">От 4 звёзд</option><option value="4.5">От 4,5 звёзд</option></select>
      {(query || skill || technology || rating) && <button className="reset-button" onClick={reset}>Сбросить</button>}
    </div></section>
    {loading ? <Loader label="Загружаем команды…" /> : error ? <ErrorState message={error} retry={load} /> : filtered.length ? <><div className="results-line">Найдено команд: <strong>{filtered.length}</strong></div><div className="team-grid">{filtered.map((team) => <TeamCard key={team.id} team={team} />)}</div></> : <EmptyState title={teams.length ? 'Подходящих команд пока нет' : 'Станьте первой командой'} text={teams.length ? 'Измените фильтры, чтобы увидеть больше команд.' : 'Расскажите о навыках и проектах своей команды.'} action={<Link className="button button--primary" to="/teams/new">Создать профиль</Link>} />}
  </div></div>
}
