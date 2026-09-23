import type { Application, ChallengeTask, ClarificationQuestion, TaskStatus } from '../types'

type UnknownRecord = Record<string, unknown>

export const unwrap = (value: unknown, keys: string[]): unknown => {
  if (!value || typeof value !== 'object') return value
  const record = value as UnknownRecord
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return value
}

const text = (...values: unknown[]): string => {
  const value = values.find((item) => typeof item === 'string' || typeof item === 'number')
  return value === undefined ? '' : String(value)
}

const list = (...values: unknown[]): string[] => {
  const value = values.find((item) => Array.isArray(item) || typeof item === 'string')
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

export const normalizeTask = (raw: unknown): ChallengeTask => {
  const item = (unwrap(raw, ['task', 'data']) || {}) as UnknownRecord
  const card = item.card && typeof item.card === 'object' ? item.card as UnknownRecord : {}
  return {
    id: text(item.id, item._id, item.task_id),
    title: text(card.title, item.title, item.name, 'Без названия'),
    shortDescription: text(item.shortDescription, item.short_description, item.summary, card.description, item.description),
    organization: text(item.organization, item.company, 'Организация не указана'),
    contactPerson: text(item.contactPerson, item.contact_person),
    desiredResult: text(item.desiredResult, item.desired_result),
    availableData: text(card.availableData, item.availableData, item.available_data),
    constraints: text(card.constraints, item.constraints, item.limitations),
    deadline: text(card.deadline, item.deadline, item.due_date, item.timeline),
    skills: list(card.skills, item.skills, item.required_skills),
    technologies: list(card.technologies, item.technologies, item.tech_stack),
    status: text(item.status, 'draft') as TaskStatus,
    problem: text(card.problem, item.problem),
    goal: text(card.goal, item.goal),
    expectedResult: text(card.expectedResult, item.expectedResult, item.expected_result),
    description: text(card.description, item.description, item.detailed_description),
    requirements: text(card.requirements, item.requirements),
    successCriteria: text(card.successCriteria, item.successCriteria, item.success_criteria),
    readinessScore: Number(item.readinessScore ?? item.readiness_score ?? item.readiness_rating ?? 0),
    readinessExplanation: text(item.readinessExplanation, item.readiness_explanation, item.rating_explanation),
    createdAt: text(item.createdAt, item.created_at),
    clarificationQuestions: normalizeQuestions(item.clarificationQuestions),
  }
}

export const normalizeTaskList = (raw: unknown): ChallengeTask[] => {
  const value = unwrap(raw, ['tasks', 'items', 'results', 'data'])
  const array = Array.isArray(value) ? value : []
  return array.map(normalizeTask)
}

export const normalizeQuestions = (raw: unknown): ClarificationQuestion[] => {
  const value = unwrap(raw, ['questions', 'items', 'data'])
  if (!Array.isArray(value)) return []
  return value.map((question, index) => {
    if (typeof question === 'string') return { id: String(index + 1), text: question, required: true }
    const item = question as UnknownRecord
    return {
      id: text(item.id, item.question_id, index + 1),
      text: text(item.text, item.question, item.title),
      required: item.required !== false,
      answer: text(item.answer),
    }
  })
}

export const normalizeApplication = (raw: unknown): Application => {
  const item = (unwrap(raw, ['application', 'data']) || {}) as UnknownRecord
  return {
    id: text(item.id, item._id),
    taskId: text(item.taskId, item.task_id),
    teamName: text(item.teamName, item.team_name),
    members: Array.isArray(item.members) ? item.members.join(', ') : text(item.members, item.participants),
    solution: text(item.solution, item.solutionDescription, item.solution_description),
    technologies: list(item.technologies, item.tech_stack),
    contact: text(item.contact),
    comment: text(item.comment, item.additional_comment),
    createdAt: text(item.createdAt, item.created_at),
    status: text(item.status, 'submitted') as Application['status'],
  }
}

export const normalizeApplicationList = (raw: unknown): Application[] => {
  const value = unwrap(raw, ['applications', 'items', 'results', 'data'])
  return Array.isArray(value) ? value.map(normalizeApplication) : []
}
