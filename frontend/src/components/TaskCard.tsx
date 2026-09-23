import { ArrowUpRight, CalendarDays, Code2, GraduationCap, Network, PenTool } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChallengeTask } from '../types'
import { getTaskDirections, taskDirections } from '../lib/taskDirections'
import { TaskStatusBadge } from './StatusBadge'

export function TaskCard({ task, showStatus = false }: { task: ChallengeTask; showStatus?: boolean; index?: number }) {
  const readiness = Math.max(0, Math.min(100, Math.round(task.readinessScore || 0)))
  const tags = Array.from(new Set([...task.skills, ...task.technologies])).slice(0, 4)
  const direction = getTaskDirections(task)[0]
  const DirectionIcon = direction === 'ai' ? Network : direction === 'web' ? Code2 : direction === 'design' ? PenTool : GraduationCap
  const category = taskDirections.find((item) => item.value === direction)?.label || 'Междисциплинарная'
  return (
    <article className="challenge-card">
      <div className="challenge-card__top">
        <span className="challenge-card__icon" aria-hidden="true"><DirectionIcon size={22} /></span>
        <span className="challenge-card__category">{category}</span>
        {showStatus && <TaskStatusBadge status={task.status} />}
      </div>
      <span className="challenge-card__organization">{task.organization}</span>
      <h3><Link to={`/tasks/${task.id}`}>{task.title}</Link></h3>
      <p className="challenge-card__description">{task.shortDescription || task.description || 'Описание задачи скоро появится.'}</p>
      <div className="challenge-card__tags" aria-label="Навыки и технологии">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="challenge-card__meta">
        <span><CalendarDays size={15} />{task.deadline || 'Срок уточняется'}</span>
        <span title="Заполненность брифа задачи">Бриф готов на <strong>{readiness}%</strong></span>
      </div>
      <Link className="challenge-card__link" to={`/tasks/${task.id}`}>{showStatus ? 'Открыть задачу' : 'Посмотреть задачу'}<ArrowUpRight size={19} /></Link>
    </article>
  )
}
