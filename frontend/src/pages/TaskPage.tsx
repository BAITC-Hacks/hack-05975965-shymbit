import { Archive, ArrowLeft, Check, ClipboardList, Edit3, RefreshCw, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/AsyncState'
import { ApplicationForm } from '../components/ApplicationForm'
import { AssistantPlanner } from '../components/AssistantPlanner'
import { ReadinessScore } from '../components/ReadinessScore'
import { TaskStatusBadge } from '../components/StatusBadge'
import { TaskProgress } from '../components/TaskProgress'
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
  const busy = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTask(await api.getTask(id)) } catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const run = async (kind: 'generate' | 'publish' | 'archive' | 'restore') => {
    if (busy.current) return
    const warning = (task?.readinessScore || 0) < 75 ? ' Описание ещё не доработано. Опубликовать текущие данные без AI-уточнения?' : ''
    const messages = { generate: 'Сформировать карточку заново?', publish: `Опубликовать задачу в общем каталоге?${warning}`, archive: 'Переместить задачу в архив?', restore: 'Восстановить задачу для редактирования? В каталог она попадёт только после публикации.' }
    if (!window.confirm(messages[kind])) return
    busy.current = true
    setAction(kind)
    try {
      const actions = { generate: api.generateTask, publish: api.publishTask, archive: api.archiveTask, restore: api.restoreTask }
      const updated = await actions[kind](id)
      setTask(updated); setShowApplication(false)
      const success = { generate: 'Карточка обновлена.', publish: 'Задача опубликована в каталоге.', archive: 'Задача перемещена в архив.', restore: 'Задача восстановлена. Можно редактировать или опубликовать.' }
      showToast(success[kind], 'success')
    } catch (actionError) { showToast(getErrorMessage(actionError), 'error') }
    finally { busy.current = false; setAction('') }
  }

  if (loading) return <div className="container page"><Loader label="Загружаем карточку…" /></div>
  if (error || !task) return <div className="container page"><ErrorState message={error || 'Задача не найдена.'} retry={load} /></div>
  const isPublic = task.status === 'published'

  return <div className="page"><div className="container container--content">
    <Link className="back-link" to={isPublic ? '/tasks' : '/my-tasks'}><ArrowLeft size={17} />{isPublic ? 'К каталогу' : 'К моим задачам'}</Link>
    {!isPublic && task.status !== 'archived' && <TaskProgress step={3} />}
    <header className="task-header"><div><div className="task-header__meta"><span>{task.organization}</span><TaskStatusBadge status={task.status} /></div><h1>{task.title}</h1><p>{task.shortDescription}</p></div>{isPublic && <button className="button button--primary" onClick={() => setShowApplication(true)} disabled={showApplication}><Send size={18} />Откликнуться на задачу</button>}</header>
    <div className="owner-actions">
      {!isPublic && task.status !== 'archived' && <>
        <Link className="button button--secondary" to={`/tasks/${id}/edit`}><Edit3 size={17} />Редактировать</Link>
        <button className="button button--secondary" onClick={() => run('generate')} disabled={Boolean(action)}><RefreshCw size={17} />{action === 'generate' ? 'Формируем…' : 'Сформировать заново'}</button>
        <Link className="button button--secondary" to={`/tasks/${id}/clarify`}><ClipboardList size={17} />Вернуться к вопросам</Link>
      </>}
      {task.status === 'archived' && <button className="button button--secondary" onClick={() => run('restore')} disabled={Boolean(action)}><RefreshCw size={17} />{action === 'restore' ? 'Восстанавливаем…' : 'Восстановить из архива'}</button>}
      {!isPublic && <button className="button button--primary" onClick={() => run('publish')} disabled={Boolean(action)}><Check size={18} />{action === 'publish' ? 'Публикуем…' : 'Опубликовать в каталоге'}</button>}
      <Link className="button button--ghost" to={`/tasks/${id}/applications`}><Users size={17} />Отклики</Link>
      {task.status !== 'archived' && <button className="button button--danger-ghost" onClick={() => run('archive')} disabled={Boolean(action)}><Archive size={17} />В архив</button>}
    </div>
    {task.status === 'archived' && <p className="muted">Задача скрыта из каталога. Восстановите её для редактирования или сразу опубликуйте снова. Карточка и отклики сохранятся.</p>}
    {!isPublic && <p className="muted">AI-уточнение и рейтинг готовности помогают улучшить описание, но не ограничивают публикацию.</p>}
    {isPublic && <Link className="text-link" to="/tasks">Посмотреть задачу в каталоге →</Link>}
    <ReadinessScore score={task.readinessScore} explanation={task.readinessExplanation} />
    {isPublic && <a className="button button--secondary assistant-jump" href="#assistant-plan">Составить план решения с AI ↓</a>}
    <div className="detail-layout"><div className="detail-main">{blocks.filter(({ key }) => Boolean(task[key])).map(({ key, title }) => <section className="detail-block" key={key}><h2>{title}</h2><p>{String(task[key])}</p></section>)}</div><aside className="detail-aside"><section><h3>Необходимые навыки</h3><div className="chip-list">{task.skills.length ? task.skills.map((item) => <span className="chip" key={item}>{item}</span>) : <p className="muted">Не указаны</p>}</div></section><section><h3>Технологии</h3><div className="chip-list">{task.technologies.length ? task.technologies.map((item) => <span className="chip chip--accent" key={item}>{item}</span>) : <p className="muted">Не указаны</p>}</div></section></aside></div>
    {showApplication && <ApplicationForm taskId={id} onClose={() => setShowApplication(false)} />}
    {isPublic && <AssistantPlanner key={id} taskId={id} />}
  </div></div>
}
