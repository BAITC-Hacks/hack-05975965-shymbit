import type { Application, AssistantPlan, ChallengeTask, ClarificationQuestion, Team, TeamMember, TeamReview, TaskStatus } from '../types'

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
    ownerId: text(item.ownerId) || undefined,
    etag: text(item.__etag) || undefined,
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
    updatedAt: text(item.updatedAt, item.updated_at),
    publishedAt: text(item.publishedAt, item.published_at),
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
    teamId: text(item.teamId, item.team_id) || undefined,
  }
}

export const normalizeApplicationList = (raw: unknown): Application[] => {
  const value = unwrap(raw, ['applications', 'items', 'results', 'data'])
  return Array.isArray(value) ? value.map(normalizeApplication) : []
}

const objectList = (value: unknown): UnknownRecord[] => Array.isArray(value) ? value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object') : []

const normalizeMember = (raw: unknown): TeamMember => {
  const item = (raw || {}) as UnknownRecord
  return { name: text(item.name), role: text(item.role), skills: list(item.skills) }
}

export const normalizeTeam = (raw: unknown): Team => {
  const item = (unwrap(raw, ['team', 'data']) || {}) as UnknownRecord
  const rating = (item.rating && typeof item.rating === 'object' ? item.rating : {}) as UnknownRecord
  return {
    id: text(item.id, item._id), name: text(item.name, item.teamName), description: text(item.description, item.summary),
    ownerId: text(item.ownerId) || undefined,
    etag: text(item.__etag) || undefined,
    members: objectList(item.members).map(normalizeMember), skills: list(item.skills, item.teamSkills), technologies: list(item.technologies, item.techStack),
    projects: objectList(item.projects).map((project) => ({ name: text(project.name), description: text(project.description), url: text(project.url) })),
    githubUrls: list(item.githubUrls, item.github_urls, item.githubLinks),
    rating: { average: Number(rating.average ?? 0), reviewsCount: Number(rating.reviewsCount ?? 0) },
  }
}

export const normalizeTeamList = (raw: unknown): Team[] => {
  const value = unwrap(raw, ['teams', 'items', 'results', 'data'])
  return Array.isArray(value) ? value.map(normalizeTeam) : []
}

export const normalizeTeamReview = (raw: unknown): TeamReview => {
  const item = (unwrap(raw, ['review', 'data']) || {}) as UnknownRecord
  return { id: text(item.id), teamId: text(item.teamId), taskId: text(item.taskId), authorName: text(item.authorName), score: Number(item.score ?? 0), text: text(item.text), createdAt: text(item.createdAt) || undefined }
}
export const normalizeTeamReviews = (raw: unknown): TeamReview[] => {
  const value = unwrap(raw, ['reviews', 'items', 'results', 'data'])
  return Array.isArray(value) ? value.map(normalizeTeamReview) : []
}

export const normalizeAssistantPlan = (raw: unknown): AssistantPlan => {
  const item = (unwrap(raw, ['data']) || {}) as UnknownRecord
  const plan = (item.plan || {}) as UnknownRecord
  const architecture = (plan.architecture || {}) as UnknownRecord
  const level = (value: unknown): 'low' | 'medium' | 'high' => value === 'high' || value === 'low' ? value : 'medium'
  return {
    id: text(item.id), taskId: text(item.taskId), teamId: text(item.teamId), createdAt: text(item.createdAt) || undefined,
    plan: {
      summary: text(plan.summary),
      architecture: { overview: text(architecture.overview), components: objectList(architecture.components).map((part) => ({ name: text(part.name), responsibility: text(part.responsibility), technologies: list(part.technologies) })) },
      milestones: objectList(plan.milestones).map((part) => ({ title: text(part.title), description: text(part.description), deliverable: text(part.deliverable), estimatedHours: Number(part.estimatedHours ?? 0), tasks: list(part.tasks) })),
      assignments: objectList(plan.assignments).map((part) => ({ memberName: text(part.memberName), role: text(part.role), tasks: list(part.tasks) })),
      risks: objectList(plan.risks).map((part) => ({ title: text(part.title), probability: level(part.probability), impact: text(part.impact), mitigation: text(part.mitigation) })),
      firstTasks: objectList(plan.firstTasks).map((part) => ({ title: text(part.title), description: text(part.description), priority: level(part.priority) })),
      questionsForBusiness: list(plan.questionsForBusiness),
    },
  }
}
export const normalizeAssistantPlanList = (raw: unknown): AssistantPlan[] => {
  const value = unwrap(raw, ['plans', 'items', 'results', 'data'])
  return Array.isArray(value) ? value.map(normalizeAssistantPlan) : []
}
