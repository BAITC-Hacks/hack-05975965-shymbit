import { Archive, ArrowLeft, Check, ClipboardList, Edit3, RefreshCw, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/AsyncState'
import { ApplicationForm } from '../components/ApplicationForm'
import { ReadinessScore } from '../components/ReadinessScore'
import { TaskStatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import type { ChallengeTask } from '../types'

const blocks: Array<{ key: keyof ChallengeTask; title: string }> = [
  { key: 'problem', title: 'Проблема' }, { key: 'goal', title: 'Цель' },
  { key: 'expectedResult', title: 'Ожидаемый результат' }, { key: 'description', title: 'Описание задачи' },
  { key: 'requirements', title: 'Требования' }, { key: 'availableData', title: 'Доступные данные' },
  { key: 'constraints', title: 'Ограничения' }, { key: 'deadline', title: 'Сроки' },
  { key: 'successCriteria', title: 'Критерии успеха' },
]

export function TaskPage() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const [task, setTask] = useState<ChallengeTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [showApplication, setShowApplication] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTask(await api.getTask(id)) } catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const run = async (kind: 'generate' | 'publish' | 'archive') => {
    const messages = { generate: 'Сформировать карточку заново?', publish: 'Опубликовать задачу в общем каталоге?', archive: 'Переместить задачу в архив?' }
    if (!window.confirm(messages[kind])) return
    setAction(kind)
    try {
      const updated = kind === 'generate' ? await api.generateTask(id) : kind === 'publish' ? await api.publishTask(id) : await api.archiveTask(id)
      setTask(updated); showToast(kind === 'publish' ? 'Задача опубликована.' : kind === 'archive' ? 'Задача перемещена в архив.' : 'Карточка обновлена.', 'success')
    } catch (actionError) { showToast(getErrorMessage(actionError), 'error') }
    finally { setAction('') }
  }

  if (loading) return <div className="container page"><Loader label="Загружаем карточку…" /></div>
  if (error || !task) return <div className="container page"><ErrorState message={error || 'Задача не найдена.'} retry={load} /></div>
  const isPublic = task.status === 'published'

  return <div className="page"><div className="container container--content">
    <Link className="back-link" to={isPublic ? '/tasks' : '/my-tasks'}><ArrowLeft size={17} />{isPublic ? 'К каталогу' : 'К моим задачам'}</Link>
    <header className="task-header"><div><div className="task-header__meta"><span>{task.organization}</span><TaskStatusBadge status={task.status} /></div><h1>{task.title}</h1><p>{task.shortDescription}</p></div>{isPublic && <button className="button button--primary" onClick={() => setShowApplication(true)} disabled={showApplication}><Send size={18} />Откликнуться на задачу</button>}</header>
    {!isPublic && <div className="owner-actions"><Link className="button button--secondary" to={`/tasks/${id}/edit`}><Edit3 size={17} />Редактировать</Link><button className="button button--secondary" onClick={() => run('generate')} disabled={Boolean(action)}><RefreshCw size={17} />{action === 'generate' ? 'Формируем…' : 'Сформировать заново'}</button><Link className="button button--secondary" to={`/tasks/${id}/clarify`}><ClipboardList size={17} />Вернуться к вопросам</Link>{task.status === 'ready' && <button className="button button--primary" onClick={() => run('publish')} disabled={Boolean(action)}><Check size={18} />{action === 'publish' ? 'Публикуем…' : 'Опубликовать'}</button>}<Link className="button button--ghost" to={`/tasks/${id}/applications`}><Users size={17} />Отклики</Link>{task.status !== 'archived' && <button className="button button--danger-ghost" onClick={() => run('archive')} disabled={Boolean(action)}><Archive size={17} />В архив</button>}</div>}
    <ReadinessScore score={task.readinessScore} explanation={task.readinessExplanation} />
    <div className="detail-layout"><div className="detail-main">{blocks.filter(({ key }) => Boolean(task[key])).map(({ key, title }) => <section className="detail-block" key={key}><h2>{title}</h2><p>{String(task[key])}</p></section>)}</div><aside className="detail-aside"><section><h3>Необходимые навыки</h3><div className="chip-list">{task.skills.length ? task.skills.map((item) => <span className="chip" key={item}>{item}</span>) : <p className="muted">Не указаны</p>}</div></section><section><h3>Технологии</h3><div className="chip-list">{task.technologies.length ? task.technologies.map((item) => <span className="chip chip--accent" key={item}>{item}</span>) : <p className="muted">Не указаны</p>}</div></section></aside></div>
    {showApplication && <ApplicationForm taskId={id} onClose={() => setShowApplication(false)} />}
  </div></div>
}
