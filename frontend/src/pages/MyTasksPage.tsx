import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { TaskCard } from '../components/TaskCard'
import { api, getErrorMessage } from '../lib/api'
import type { ChallengeTask } from '../types'

export function MyTasksPage() {
  const [tasks, setTasks] = useState<ChallengeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTasks(await api.getTasks('all')) } catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <div className="page"><div className="container"><div className="page-title-row"><div><span className="eyebrow">Личный раздел бизнеса</span><h1>Мои задачи</h1><p>Управляйте черновиками, публикациями и откликами команд.</p></div><Link className="button button--primary" to="/tasks/new"><Plus size={18} />Создать задачу</Link></div>{loading ? <Loader /> : error ? <ErrorState message={error} retry={load} /> : tasks.length ? <div className="task-grid">{tasks.map((task) => <TaskCard task={task} showStatus key={task.id} />)}</div> : <EmptyState title="У вас пока нет задач" text="Создайте первую задачу — AI поможет сделать описание полным." action={<Link className="button button--primary" to="/tasks/new"><Plus size={18} />Создать задачу</Link>} />}</div></div>
}
