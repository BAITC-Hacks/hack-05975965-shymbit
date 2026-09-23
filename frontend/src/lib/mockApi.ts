import type { Application, ApplicationDraft, ChallengeTask, ClarificationQuestion, TaskDraft } from '../types'
import { createMockTeamsApi } from './mockTeams'

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms))

const tasks: ChallengeTask[] = [
  {
    id: 'demo-1',
    title: 'Интеллектуальный помощник для первокурсников',
    shortDescription: 'Сервис, который помогает студентам ориентироваться в учебном процессе и быстро находить ответы.',
    organization: 'AI Sana Lab',
    skills: ['Python', 'UX-исследования', 'NLP'],
    technologies: ['React', 'FastAPI', 'LLM'],
    deadline: '15 декабря 2026',
    status: 'published',
    problem: 'Первокурсники теряют время при поиске информации об учебном процессе.',
    goal: 'Сократить время получения ответа на типовой вопрос до одной минуты.',
    expectedResult: 'Рабочий веб-сервис с базой знаний и AI-поиском.',
    description: 'Команде предстоит собрать частые вопросы студентов, разработать интерфейс и подключить поиск по базе знаний.',
    requirements: 'Адаптивный интерфейс, журналирование ответов и безопасная работа с данными.',
    availableData: 'Обезличенные вопросы студентов и открытые регламенты.',
    constraints: 'Нельзя передавать персональные данные внешним сервисам.',
    successCriteria: 'Не менее 80% полезных ответов в пилотном тестировании.',
    readinessScore: 88,
    readinessExplanation: 'Цель, данные и критерии успеха определены. Требуется уточнить формат пилота.',
  },
  {
    id: 'demo-2',
    title: 'Аналитика образовательных траекторий',
    shortDescription: 'Панель для анализа прогресса и раннего выявления учебных затруднений.',
    organization: 'Университет будущего',
    skills: ['Аналитика данных', 'Data Science'],
    technologies: ['Python', 'PostgreSQL', 'React'],
    deadline: '3 месяца',
    status: 'published',
    readinessScore: 74,
    readinessExplanation: 'Данные доступны, но критерии пилотирования требуют уточнения.',
  },
]

const applications: Application[] = []
const makeDraft = (draft: TaskDraft): ChallengeTask => ({
  ...draft,
  id: crypto.randomUUID(),
  status: 'draft',
})

export const mockApi = {
  async getTasks() { await wait(); return [...tasks] },
  async getTask(id: string) { await wait(); return tasks.find((task) => task.id === id) ?? null },
  async createTask(draft: TaskDraft) { const task = makeDraft(draft); tasks.unshift(task); await wait(); return task },
  async updateTask(id: string, patch: Partial<ChallengeTask>) {
    const index = tasks.findIndex((task) => task.id === id)
    if (index < 0) throw new Error('Задача не найдена')
    tasks[index] = { ...tasks[index], ...patch }
    await wait(); return tasks[index]
  },
  async clarifyTask(id: string): Promise<ClarificationQuestion[]> {
    await wait(700)
    const task = tasks.find((item) => item.id === id)
    if (task) task.status = 'needs_clarification'
    return [
      { id: 'goal', text: 'Какой измеримый результат должна получить организация?', required: true },
      { id: 'users', text: 'Кто будет основным пользователем решения?', required: true },
      { id: 'data', text: 'В каком формате и объёме доступны исходные данные?', required: true },
      { id: 'success', text: 'По каким критериям вы будете оценивать успех проекта?', required: true },
    ]
  },
  async saveAnswers() { await wait(); return true },
  async generateTask(id: string) {
    const task = tasks.find((item) => item.id === id)
    if (!task) throw new Error('Задача не найдена')
    Object.assign(task, {
      status: 'ready',
      problem: task.shortDescription,
      goal: task.desiredResult || 'Создать и протестировать решение для целевой аудитории.',
      expectedResult: task.desiredResult || 'Работающий прототип и отчёт о результатах пилота.',
      description: `${task.shortDescription} Команде необходимо исследовать потребности пользователей, реализовать прототип и провести проверку гипотез.`,
      requirements: 'Адаптивность, понятный интерфейс, документированный код и безопасная обработка данных.',
      successCriteria: 'Работающий прототип, положительная обратная связь пилотной группы и достижение согласованных метрик.',
      readinessScore: 84,
      readinessExplanation: 'Определены проблема, цель и ожидаемый результат. Детали пилотирования можно уточнить совместно с выбранной командой.',
    })
    await wait(900); return task
  },
  async publishTask(id: string) { return this.updateTask(id, { status: 'published' }) },
  async archiveTask(id: string) { return this.updateTask(id, { status: 'archived' }) },
  async createApplication(taskId: string, draft: ApplicationDraft) {
    const application: Application = { ...draft, id: crypto.randomUUID(), taskId, createdAt: new Date().toISOString(), status: 'submitted' }
    applications.unshift(application); await wait(); return application
  },
  async getApplications(taskId: string) { await wait(); return applications.filter((item) => item.taskId === taskId) },
  async updateApplication(id: string, status: Application['status']) {
    const item = applications.find((application) => application.id === id)
    if (!item) throw new Error('Отклик не найден')
    item.status = status; await wait(); return item
  },
  ...createMockTeamsApi(tasks, applications),
}
