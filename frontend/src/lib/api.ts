import { mockApi } from './mockApi'
import { normalizeApplication, normalizeApplicationList, normalizeQuestions, normalizeTask, normalizeTaskList } from './normalizers'
import type { Application, ApplicationDraft, ChallengeTask, ClarificationQuestion, TaskDraft } from '../types'

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
  500: 'Сервис временно недоступен. Попробуйте позже.',
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.')
  }

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const backendMessage = typeof body === 'object' && body
      ? (body.message || body.detail || body.error)
      : undefined
    throw new ApiError(response.status, String(backendMessage || errorMessages[response.status] || 'Произошла непредвиденная ошибка.'))
  }
  return body as T
}

export const api = {
  async getTasks(status: ChallengeTask['status'] | 'all' = 'published'): Promise<ChallengeTask[]> {
    if (USE_MOCK) return mockApi.getTasks()
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
  async updateTask(id: string, draft: Partial<TaskDraft>): Promise<ChallengeTask> {
    if (USE_MOCK) return mockApi.updateTask(id, draft)
    return normalizeTask(await request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(draft) }))
  },
  async clarifyTask(id: string): Promise<ClarificationQuestion[]> {
    if (USE_MOCK) return mockApi.clarifyTask(id)
    return normalizeQuestions(await request(`/api/tasks/${id}/clarify`, { method: 'POST' }))
  },
  async saveAnswers(id: string, answers: Record<string, string>): Promise<void> {
    if (USE_MOCK) { await mockApi.saveAnswers(); return }
    await request(`/api/tasks/${id}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) }),
    })
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
  async createApplication(taskId: string, draft: ApplicationDraft): Promise<Application> {
    if (USE_MOCK) return mockApi.createApplication(taskId, draft)
    return normalizeApplication(await request(`/api/tasks/${taskId}/applications`, {
      method: 'POST',
      body: JSON.stringify({
        teamName: draft.teamName,
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
}

export const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Произошла непредвиденная ошибка.'
