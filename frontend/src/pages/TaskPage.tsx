import { Archive, ArrowLeft, ArrowUpRight, CalendarDays, Check, ClipboardList, Edit3, RefreshCw, Send, Sparkles, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
  { key: 'constraints', title: 'Ограничения' },
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
  const visibleBlocks = blocks.filter(({ key }) => Boolean(task[key]))

  return <div className="page task-detail-page"><div className="container container--content">
    <Link className="back-link" to={isPublic ? '/tasks' : '/my-tasks'}><ArrowLeft size={17} />{isPublic ? 'К каталогу' : 'К моим задачам'}</Link>
    {!isPublic && task.status !== 'archived' && <TaskProgress step={3} />}
    <header className="task-header"><div><div className="task-header__meta"><span>{task.organization}</span><TaskStatusBadge status={task.status} /></div><h1>{task.title}</h1><p>{task.shortDescription}</p></div></header>
    <details className="task-owner-panel" open={!isPublic}><summary>Управление задачей</summary><div className="owner-actions">
      {!isPublic && task.status !== 'archived' && <>
        <Link className="button button--secondary" to={`/tasks/${id}/edit`}><Edit3 size={17} />Редактировать</Link>
        <button className="button button--secondary" onClick={() => run('generate')} disabled={Boolean(action)}><RefreshCw size={17} />{action === 'generate' ? 'Формируем…' : 'Сформировать заново'}</button>
        <Link className="button button--secondary" to={`/tasks/${id}/clarify`}><ClipboardList size={17} />Вернуться к вопросам</Link>
      </>}
      {task.status === 'ready' && <button className="button button--primary" onClick={() => run('publish')} disabled={Boolean(action)}><Check size={18} />{action === 'publish' ? 'Публикуем…' : 'Опубликовать'}</button>}
      <Link className="button button--ghost" to={`/tasks/${id}/applications`}><Users size={17} />Отклики</Link>
      {task.status !== 'archived' && <button className="button button--danger-ghost" onClick={() => run('archive')} disabled={Boolean(action)}><Archive size={17} />В архив</button>}
    </div></details>
    <div className="task-detail-layout">
      <div className="task-detail-content">
        {visibleBlocks.map(({ key, title }, index) => <section className="task-detail-section" key={key}><h2><span className="task-detail-number">{String(index + 1).padStart(2, '0')}</span>{title}</h2><p>{String(task[key])}</p></section>)}
        {(task.skills.length > 0 || task.technologies.length > 0) && <section className="task-detail-section"><h2><span className="task-detail-number">{String(visibleBlocks.length + 1).padStart(2, '0')}</span>Что пригодится команде</h2>{task.skills.length > 0 && <><h3>Навыки</h3><div className="chip-list">{task.skills.map(item => <span className="chip" key={item}>{item}</span>)}</div></>}{task.technologies.length > 0 && <><h3>Технологии</h3><div className="chip-list">{task.technologies.map(item => <span className="chip chip--accent" key={item}>{item}</span>)}</div></>}</section>}
      </div>
      <aside className="task-detail-sidebar">
        <section className="task-brief-panel">
          <ReadinessScore score={task.readinessScore} explanation={task.readinessExplanation} compact />
          <div className="task-brief-meta"><div><span>Статус задачи</span><TaskStatusBadge status={task.status} /></div>{task.deadline && <div><span><CalendarDays size={15} />Сроки</span><strong>{task.deadline}</strong></div>}</div>
          {isPublic && <button className="button button--primary" onClick={() => setShowApplication(true)} disabled={showApplication}><Send size={18} />Откликнуться командой</button>}
          {isPublic && <p className="task-brief-note">Расскажите о команде и своём подходе. Бизнес рассмотрит ваш отклик.</p>}
        </section>
        {isPublic && <a className="task-ai-teaser" href="#assistant-plan"><span className="task-ai-teaser__icon"><Sparkles size={21} /></span><h3>С чего начать?</h3><p>AI поможет разобрать задачу и составить первый план решения.</p><span className="task-ai-teaser__link">Составить план с AI <ArrowUpRight size={17} /></span></a>}
      </aside>
    </div>
    {showApplication && <ApplicationForm taskId={id} onClose={() => setShowApplication(false)} />}
    {isPublic && <AssistantPlanner key={id} taskId={id} />}
  </div></div>
}
