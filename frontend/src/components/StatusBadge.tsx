import type { ApplicationStatus, TaskStatus } from '../types'

export const taskStatusLabels: Record<TaskStatus, string> = {
  draft: 'Черновик',
  needs_clarification: 'Требуется уточнение',
  ready: 'Готово к публикации',
  published: 'Опубликовано',
  archived: 'В архиве',
}

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  submitted: 'Новый',
  reviewed: 'На рассмотрении',
  accepted: 'Принят',
  rejected: 'Отклонён',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge--${status}`}>{taskStatusLabels[status] || status}</span>
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`badge badge--${status}`}>{applicationStatusLabels[status] || status}</span>
}
