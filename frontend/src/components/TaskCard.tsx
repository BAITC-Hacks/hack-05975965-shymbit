import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChallengeTask } from '../types'
import { TaskStatusBadge } from './StatusBadge'

export function TaskCard({ task, showStatus = false, index }: { task: ChallengeTask; showStatus?: boolean; index?: number }) {
  const readiness = Math.max(0, Math.min(100, Math.round(task.readinessScore || 0)))
  const tags = Array.from(new Set([...task.skills, ...task.technologies])).slice(0, 4)
  return (
    <article className="challenge-card">
      <div className="challenge-card__top">
        <span className="challenge-card__category">{index !== undefined && <span>{String(index).padStart(2, '0')}</span>}{task.skills[0] || 'Междисциплинарная задача'}</span>
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
      <Link className="challenge-card__link" to={`/tasks/${task.id}`}>{showStatus ? 'Открыть задачу' : 'Изучить вызов'}<span><ArrowUpRight size={19} /></span></Link>
    </article>
  )
}
