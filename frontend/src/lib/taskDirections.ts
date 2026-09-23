import type { ChallengeTask } from '../types'

export type TaskDirection = 'all' | 'ai' | 'web' | 'design'

export const taskDirections: { value: TaskDirection; label: string }[] = [
  { value: 'all', label: 'Все задачи' },
  { value: 'ai', label: 'AI и данные' },
  { value: 'web', label: 'Веб-разработка' },
  { value: 'design', label: 'Дизайн' },
]

const patterns = {
  ai: /\b(ai|ml|nlp|llm|data|pytorch|tensorflow)\b|искусственн|машинн.{0,8}обуч|нейросет|анализ.{0,8}данн|аналитик|данные/iu,
  web: /\b(react|vue|angular|next|html|css|javascript|typescript|frontend|backend|web|django|flask)\b|веб|сайт|фронтенд|бэкенд/iu,
  design: /\b(figma|ux|ui|design)\b|дизайн|прототип|интерфейс/iu,
}

export function getTaskDirections(task: ChallengeTask): Exclude<TaskDirection, 'all'>[] {
  const text = [task.title, task.shortDescription, ...task.skills, ...task.technologies].join(' ')
  return (['ai', 'web', 'design'] as const).filter((direction) => patterns[direction].test(text))
}
