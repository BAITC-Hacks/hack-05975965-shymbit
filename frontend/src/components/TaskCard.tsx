import { ArrowUpRight, CalendarDays, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChallengeTask } from '../types'
import { TaskStatusBadge } from './StatusBadge'

export function TaskCard({ task, showStatus = false }: { task: ChallengeTask; showStatus?: boolean }) {
  return (
    <article className="task-card">
      <div className="task-card__top">
        <span className="eyebrow">{task.organization}</span>
        {showStatus && <TaskStatusBadge status={task.status} />}
      </div>
      <h3>{task.title}</h3>
      <p>{task.shortDescription || task.description || 'Описание задачи скоро появится.'}</p>
      <div className="chip-list" aria-label="Навыки и технологии">
        {[...task.skills, ...task.technologies].slice(0, 5).map((tag) => <span className="chip" key={tag}>{tag}</span>)}
      </div>
      <div className="task-card__meta">
        <span><CalendarDays size={16} />{task.deadline || 'Срок уточняется'}</span>
        <span><Gauge size={16} />Готовность {Math.round(task.readinessScore || 0)}%</span>
      </div>
      <Link className="text-link" to={`/tasks/${task.id}`}>{showStatus ? 'Открыть задачу' : 'Подробнее'}<ArrowUpRight size={17} /></Link>
    </article>
  )
}
