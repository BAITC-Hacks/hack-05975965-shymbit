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

  return <div className="page directory-page"><div className="container">
    <header className="directory-heading"><div><span className="directory-kicker">Каталог вызовов <span /> AI Sana</span><h1>Ваш следующий<br /><em>большой проект.</em></h1><p>Реальные задачи бизнеса. Понятные цели. Возможность создать то, чем будут пользоваться.</p></div><div className="directory-heading__aside"><span className="directory-overline">От идеи к действию</span><p>Выберите вызов по силам вашей команды — и предложите своё решение.</p>{!loading && !error && <span className="directory-available"><i />Опубликовано задач: {tasks.length}</span>}</div></header>
    <section className="directory-filters" aria-label="Фильтры задач">
      <label className="directory-search"><Search size={21} /><input aria-label="Поиск задачи" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти задачу, организацию или навык" />{search && <button onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={18} /></button>}</label>
      <div className="directory-selects"><span className="directory-filter-label"><SlidersHorizontal size={16} />Уточнить поиск</span><select value={skill} onChange={(event) => setSkill(event.target.value)} aria-label="Навык"><option value="">Все навыки</option>{skills.map((item) => <option key={item}>{item}</option>)}</select><select value={technology} onChange={(event) => setTechnology(event.target.value)} aria-label="Технология"><option value="">Все технологии</option>{technologies.map((item) => <option key={item}>{item}</option>)}</select><input value={deadline} onChange={(event) => setDeadline(event.target.value)} placeholder="Срок выполнения" aria-label="Срок" />{hasFilters && <button className="directory-reset" onClick={reset}>Сбросить<X size={14} /></button>}</div>
    </section>
    {loading ? <Loader label="Загружаем каталог…" /> : error ? <ErrorState message={error} retry={load} /> : filtered.length ? <><div className="directory-results"><h2>{hasFilters ? 'Подходящие вызовы' : 'Открытые вызовы'}</h2><span aria-live="polite">{filtered.length} из {tasks.length}</span></div><div className="directory-task-grid">{filtered.map((task, index) => <TaskCard task={task} key={task.id} index={index + 1} />)}</div></> : <EmptyState title={hasFilters ? 'По вашему запросу ничего не найдено' : 'Опубликованных задач пока нет'} text={hasFilters ? 'Попробуйте изменить или сбросить фильтры.' : 'Новые задачи от организаций скоро появятся.'} action={hasFilters && <button className="button button--secondary" onClick={reset}>Сбросить фильтры</button>} />}
  </div></div>
}
