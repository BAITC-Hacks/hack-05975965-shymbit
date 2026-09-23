import { mockApi } from './mockApi'
import { getSession, setSession, type Session, type User } from './session'
import type { ImportResult } from '../types'
import { normalizeApplication, normalizeApplicationList, normalizeAssistantPlan, normalizeAssistantPlanList, normalizeQuestions, normalizeTask, normalizeTaskList, normalizeTeam, normalizeTeamList, normalizeTeamReview, normalizeTeamReviews } from './normalizers'
import type { Application, ApplicationDraft, AssistantPlan, ChallengeTask, ClarificationQuestion, Team, TeamDraft, TeamReview, TeamReviewDraft, TaskDraft } from '../types'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const errorMessages: Record<number, string> = {
  400: 'Проверьте заполненные данные и попробуйте снова.',
  401: 'Необходимо войти в систему.',
  403: 'У вас нет доступа к этому действию.',
  404: 'Запрошенные данные не найдены.',
  409: 'Это действие сейчас недоступно. Проверьте условия и попробуйте снова.',
  500: 'Сервис временно недоступен. Попробуйте позже.',
  502: 'AI вернул неполный план. Попробуйте ещё раз.',
  503: 'AI-помощник временно недоступен. Повторите запрос позже.',
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(getSession() ? { Authorization: `Bearer ${getSession()!.token}` } : {}), ...options.headers },
    })
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.')
  }

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/login')) setSession(null)
    const backendMessage = typeof body === 'object' && body
      ? (body.message || body.detail || body.error)
      : undefined
    throw new ApiError(response.status, String(backendMessage || errorMessages[response.status] || 'Произошла непредвиденная ошибка.'))
  }
  if (body && typeof body === 'object' && response.headers.get('etag')) {
    body.__etag = response.headers.get('etag')
    if (body.task) body.task.__etag = body.__etag
  }
  return body as T
}

export const api = {
  async register(data: { name: string; email: string; password: string; role: User['role'] }) {
    const session = await request<Session>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) })
    setSession(session); return session.user
  },
  async login(email: string, password: string) {
    const session = await request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setSession(session); return session.user
  },
  async logout() { try { await request('/api/auth/logout', { method: 'POST' }) } finally { setSession(null) } },
  async me() { return (await request<{ user: User }>('/api/auth/me')).user },
  async getMyTeams(): Promise<Team[]> { return normalizeTeamList(await request('/api/me/teams')) },
  async getMyApplications(): Promise<Application[]> { return normalizeApplicationList(await request('/api/me/applications')) },
  async extractDocument(file: File, targetType: 'task' | 'team', targetId?: string): Promise<ImportResult> {
    const body = new FormData(); body.append('file', file); body.append('targetType', targetType)
    if (targetId) body.append('targetId', targetId)
    return request('/api/imports/extract', { method: 'POST', body })
  },
  async getTasks(status: ChallengeTask['status'] | 'all' = 'published'): Promise<ChallengeTask[]> {
    if (USE_MOCK) return mockApi.getTasks(status)
    return normalizeTaskList(await request(`/api/tasks?status=${encodeURIComponent(status)}`))
  },
  async getTask(id: string): Promise<ChallengeTask> {
    if (USE_MOCK) {
      const task = await mockApi.getTask(id)
      if (!task) throw new ApiError(404, 'Задача не найдена.')
      return task
    }
    return normalizeTask(await request(`/api/tasks/${id}`))
  },
  async createTask(draft: TaskDraft): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.createTask(draft)
    return normalizeTask(await request('/api/tasks', { method: 'POST', body: JSON.stringify(draft) }))
  },
  async updateTask(id: string, draft: Partial<TaskDraft>, etag?: string): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.updateTask(id, draft)
    return normalizeTask(await request(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'If-Match': etag || '' }, body: JSON.stringify(draft) }))
  },
  async clarifyTask(id: string): Promise<ClarificationQuestion[] & { etag?: string }> {
    if (USE_MOCK) return mockApi.clarifyTask(id)
    const data = await request<{ __etag?: string }>(`/api/tasks/${id}/clarify`, { method: 'POST' })
    return Object.assign(normalizeQuestions(data), { etag: data.__etag })
  },
  async saveAnswers(id: string, answers: Record<string, string>, etag?: string): Promise<ChallengeTask | undefined> {
    if (USE_MOCK) { await mockApi.saveAnswers(); return }
    return normalizeTask(await request(`/api/tasks/${id}/answers`, {
      method: 'POST',
      headers: { 'If-Match': etag || '' },
      body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) }),
    }))
  },
  async generateTask(id: string): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.generateTask(id)
    return normalizeTask(await request(`/api/tasks/${id}/generate`, { method: 'POST' }))
  },
  async publishTask(id: string): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.publishTask(id)
    return normalizeTask(await request(`/api/tasks/${id}/publish`, { method: 'POST', body: JSON.stringify({ confirm: true }) }))
  },
  async archiveTask(id: string): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.archiveTask(id)
    return normalizeTask(await request(`/api/tasks/${id}/archive`, { method: 'POST' }))
  },
  async restoreTask(id: string): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.restoreTask(id)
    return normalizeTask(await request(`/api/tasks/${id}/restore`, { method: 'POST' }))
  },
  async createApplication(taskId: string, draft: ApplicationDraft): Promise<Application> {
    if (USE_MOCK) return mockApi.createApplication(taskId, draft)
    return normalizeApplication(await request(`/api/tasks/${taskId}/applications`, {
      method: 'POST',
      body: JSON.stringify({
        teamName: draft.teamName,
        ...(draft.teamId ? { teamId: draft.teamId } : {}),
        members: draft.members.split(/[\n,;]+/).map((member) => member.trim()).filter(Boolean),
        solutionDescription: draft.solution,
        technologies: draft.technologies,
        contact: draft.contact,
        comment: draft.comment || undefined,
      }),
    }))
  },
  async getApplications(taskId: string): Promise<Application[]> {
    if (USE_MOCK) return mockApi.getApplications(taskId)
    return normalizeApplicationList(await request(`/api/tasks/${taskId}/applications`))
  },
  async updateApplication(id: string, status: Application['status']): Promise<Application> {
    if (USE_MOCK) return mockApi.updateApplication(id, status)
    return normalizeApplication(await request(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }))
  },
  async getTeams(): Promise<Team[]> {
    if (USE_MOCK) return mockApi.getTeams()
    return normalizeTeamList(await request('/api/teams'))
  },
  async getTeam(id: string): Promise<Team> {
    if (USE_MOCK) { const team = await mockApi.getTeam(id); if (!team) throw new ApiError(404, 'Команда не найдена.'); return team }
    return normalizeTeam(await request(`/api/teams/${id}`))
  },
  async createTeam(draft: TeamDraft): Promise<Team> {
    if (USE_MOCK) return mockApi.createTeam(draft)
    return normalizeTeam(await request('/api/teams', { method: 'POST', body: JSON.stringify(draft) }))
  },
  async updateTeam(id: string, draft: TeamDraft, etag?: string): Promise<Team> {
    if (USE_MOCK) return mockApi.updateTeam(id, draft)
    return normalizeTeam(await request(`/api/teams/${id}`, { method: 'PATCH', headers: { 'If-Match': etag || '' }, body: JSON.stringify(draft) }))
  },
  async getTeamReviews(teamId: string): Promise<TeamReview[]> {
    if (USE_MOCK) return mockApi.getTeamReviews(teamId)
    return normalizeTeamReviews(await request(`/api/teams/${teamId}/reviews`))
  },
  async createTeamReview(teamId: string, review: TeamReviewDraft): Promise<TeamReview> {
    if (USE_MOCK) return mockApi.createTeamReview(teamId, review)
    return normalizeTeamReview(await request(`/api/teams/${teamId}/reviews`, { method: 'POST', body: JSON.stringify(review) }))
  },
  async generateAssistantPlan(taskId: string, teamId: string, focus?: string): Promise<AssistantPlan> {
    if (USE_MOCK) return mockApi.generateAssistantPlan(taskId, teamId, focus)
    return normalizeAssistantPlan(await request(`/api/tasks/${taskId}/assistant/plan`, { method: 'POST', body: JSON.stringify({ teamId, ...(focus ? { focus } : {}) }) }))
  },
  async getAssistantPlans(taskId: string, teamId: string): Promise<AssistantPlan[]> {
    if (USE_MOCK) return mockApi.getAssistantPlans(taskId, teamId)
    return normalizeAssistantPlanList(await request(`/api/tasks/${taskId}/assistant/plans?teamId=${encodeURIComponent(teamId)}`))
  },
  async getAssistantPlan(id: string): Promise<AssistantPlan> {
    if (USE_MOCK) return mockApi.getAssistantPlan(id)
    return normalizeAssistantPlan(await request(`/api/assistant-plans/${id}`))
  },
}

export const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Произошла непредвиденная ошибка.'
