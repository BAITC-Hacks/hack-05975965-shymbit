import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { TaskCard } from '../components/TaskCard'
import { api, getErrorMessage } from '../lib/api'
import { getTaskDirections, taskDirections, type TaskDirection } from '../lib/taskDirections'
import type { ChallengeTask } from '../types'

export function CatalogPage() {
  const [tasks, setTasks] = useState<ChallengeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [skill, setSkill] = useState('')
  const [technology, setTechnology] = useState('')
  const [deadline, setDeadline] = useState('')
  const [direction, setDirection] = useState<TaskDirection>('all')

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
      const matchesDirection = direction === 'all' || getTaskDirections(task).includes(direction)
      return matchesSearch && matchesSkill && matchesTechnology && matchesDeadline && matchesDirection
    })
  }, [tasks, search, skill, technology, deadline, direction])
  const hasFilters = Boolean(search || skill || technology || deadline || direction !== 'all')
  const extraFilterCount = [skill, technology, deadline].filter(Boolean).length
  const reset = () => { setSearch(''); setSkill(''); setTechnology(''); setDeadline(''); setDirection('all') }

  return <div className="page directory-page catalog-refresh"><div className="container">
    <header className="directory-heading"><div><span className="directory-kicker">Знания, которые работают</span><h1>Найдите свой<br />следующий вызов.</h1><p>Реальные задачи. Понятные цели. Ваш первый шаг к проекту, который имеет значение.</p></div><div className="directory-heading__stamp">МНВО · AI SANA<br />Образование через практику</div></header>
    <section className="directory-filters" aria-label="Фильтры задач">
      <label className="directory-search"><Search size={21} /><input type="search" aria-label="Поиск задачи" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, технология или направление…" />{search && <button onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={18} /></button>}</label>
      <div className="directory-directions" role="group" aria-label="Направления задач">{taskDirections.map((item) => <button key={item.value} className="directory-direction" aria-pressed={direction === item.value} onClick={() => setDirection(item.value)}>{item.label}</button>)}{hasFilters && <button className="directory-reset" onClick={reset}>Сбросить<X size={14} /></button>}</div>
      <details className="directory-extra-filters"><summary className="directory-extra-filters__summary"><SlidersHorizontal size={16} />Дополнительные фильтры{extraFilterCount > 0 && <span>{extraFilterCount}</span>}<ChevronDown size={16} /></summary><div className="directory-selects"><select value={skill} onChange={(event) => setSkill(event.target.value)} aria-label="Навык"><option value="">Все навыки</option>{skills.map((item) => <option key={item}>{item}</option>)}</select><select value={technology} onChange={(event) => setTechnology(event.target.value)} aria-label="Технология"><option value="">Все технологии</option>{technologies.map((item) => <option key={item}>{item}</option>)}</select><input value={deadline} onChange={(event) => setDeadline(event.target.value)} placeholder="Срок выполнения" aria-label="Срок" /></div></details>
    </section>
    {loading ? <Loader label="Загружаем каталог…" /> : error ? <ErrorState message={error} retry={load} /> : filtered.length ? <><div className="directory-results"><h2>{hasFilters ? 'Подходящие возможности' : 'Открытые возможности'}</h2><span aria-live="polite">{filtered.length} из {tasks.length}</span></div><div className="directory-task-grid">{filtered.map((task, index) => <TaskCard task={task} key={task.id} index={index + 1} />)}</div></> : <EmptyState title={hasFilters ? 'По вашему запросу ничего не найдено' : 'Опубликованных задач пока нет'} text={hasFilters ? 'Попробуйте изменить или сбросить фильтры.' : 'Новые задачи от организаций скоро появятся.'} action={hasFilters && <button className="button button--secondary" onClick={reset}>Сбросить фильтры</button>} />}
  </div></div>
}
