import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { TaskCard } from '../components/TaskCard'
import { api, getErrorMessage } from '../lib/api'
import type { ChallengeTask } from '../types'

export function CatalogPage() {
  const [tasks, setTasks] = useState<ChallengeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [skill, setSkill] = useState('')
  const [technology, setTechnology] = useState('')
  const [deadline, setDeadline] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTasks((await api.getTasks()).filter((task) => task.status === 'published')) }
    catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const skills = useMemo(() => Array.from(new Set(tasks.flatMap((task) => task.skills))).sort(), [tasks])
  const technologies = useMemo(() => Array.from(new Set(tasks.flatMap((task) => task.technologies))).sort(), [tasks])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const matchesSearch = !query || [task.title, task.organization, task.shortDescription, ...task.skills, ...task.technologies].join(' ').toLowerCase().includes(query)
      const matchesSkill = !skill || task.skills.includes(skill)
      const matchesTechnology = !technology || task.technologies.includes(technology)
      const matchesDeadline = !deadline || task.deadline?.toLowerCase().includes(deadline.toLowerCase())
      return matchesSearch && matchesSkill && matchesTechnology && matchesDeadline
    })
  }, [tasks, search, skill, technology, deadline])
  const hasFilters = Boolean(search || skill || technology || deadline)
  const reset = () => { setSearch(''); setSkill(''); setTechnology(''); setDeadline('') }

  return <div className="page"><div className="container">
    <div className="catalog-heading"><div><span className="eyebrow">Каталог проектов</span><h1>Найдите задачу для своей команды</h1><p>Реальные вызовы от организаций Казахстана — от аналитики до образовательных AI-продуктов.</p></div><div className="catalog-count"><strong>{tasks.length}</strong><span>опубликованных<br />задач</span></div></div>
    <section className="filters" aria-label="Фильтры задач">
      <label className="search-field"><Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию, организации или навыку" />{search && <button onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={17} /></button>}</label>
      <div className="filter-row"><span className="filter-label"><SlidersHorizontal size={17} />Фильтры</span><select value={skill} onChange={(event) => setSkill(event.target.value)} aria-label="Навык"><option value="">Все навыки</option>{skills.map((item) => <option key={item}>{item}</option>)}</select><select value={technology} onChange={(event) => setTechnology(event.target.value)} aria-label="Технология"><option value="">Все технологии</option>{technologies.map((item) => <option key={item}>{item}</option>)}</select><input className="filter-input" value={deadline} onChange={(event) => setDeadline(event.target.value)} placeholder="Срок" aria-label="Срок" />{hasFilters && <button className="reset-button" onClick={reset}>Сбросить</button>}</div>
    </section>
    {loading ? <Loader label="Загружаем каталог…" /> : error ? <ErrorState message={error} retry={load} /> : filtered.length ? <><div className="results-line">Найдено задач: <strong>{filtered.length}</strong></div><div className="task-grid">{filtered.map((task) => <TaskCard task={task} key={task.id} />)}</div></> : <EmptyState title={hasFilters ? 'По вашему запросу ничего не найдено' : 'Опубликованных задач пока нет'} text={hasFilters ? 'Попробуйте изменить или сбросить фильтры.' : 'Новые задачи от организаций скоро появятся.'} action={hasFilters && <button className="button button--secondary" onClick={reset}>Сбросить фильтры</button>} />}
  </div></div>
}
