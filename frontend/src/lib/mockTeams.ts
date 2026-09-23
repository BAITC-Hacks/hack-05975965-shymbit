import type { Application, AssistantPlan, ChallengeTask, Team, TeamDraft, TeamReview, TeamReviewDraft } from '../types'

const wait = () => new Promise((resolve) => setTimeout(resolve, 250))
const demoTeamId = '05975965-1111-4111-8111-000000000001'

export function createMockTeamsApi(tasks: ChallengeTask[], applications: Application[]) {
  const teams: Team[] = [{
    id: demoTeamId, name: 'Sana Makers', description: 'Создаём понятные AI-сервисы для образования. Объединяем продуктовый дизайн, разработку и аналитику.',
    members: [{ name: 'Алия Серик', role: 'Frontend-разработчик', skills: ['React', 'UX'] }, { name: 'Данияр Омар', role: 'Backend-разработчик', skills: ['Node.js', 'Python'] }],
    skills: ['UX', 'AI-интеграции'], technologies: ['React', 'TypeScript', 'Node.js'],
    projects: [{ name: 'Навигатор первокурсника', description: 'Демонстрационный проект с ответами на частые вопросы студентов.', url: 'https://github.com' }],
    githubUrls: ['https://github.com'], rating: { average: 5, reviewsCount: 1 },
  }, {
    id: '05975965-1111-4111-8111-000000000002', name: 'Data Qadam', description: 'Изучаем данные и превращаем их в полезные инструменты. Интересуемся персональными образовательными траекториями.',
    members: [{ name: 'Мадина Али', role: 'Аналитик данных', skills: ['Python', 'Аналитика'] }],
    skills: ['Аналитика', 'Машинное обучение'], technologies: ['Python', 'PostgreSQL'],
    projects: [], githubUrls: [], rating: { average: 0, reviewsCount: 0 },
  }]
  const reviews: TeamReview[] = [{ id: 'review-demo', teamId: demoTeamId, taskId: 'demo-1', authorName: 'Учебная организация · демо', score: 5, text: 'Команда внимательно разобрала задачу и подготовила понятный прототип.', createdAt: '2026-09-20T10:00:00.000Z' }]
  const plans: AssistantPlan[] = []
  const requireTeam = (id: string) => { const team = teams.find((value) => value.id === id); if (!team) throw new Error('Команда не найдена.'); return team }
  return {
    async getTeams() { await wait(); return structuredClone(teams) },
    async getTeam(id: string) { await wait(); return structuredClone(requireTeam(id)) },
    async createTeam(draft: TeamDraft) {
      await wait()
      const team: Team = { ...structuredClone(draft), id: crypto.randomUUID(), rating: { average: 0, reviewsCount: 0 } }
      teams.unshift(team); return structuredClone(team)
    },
    async updateTeam(id: string, draft: TeamDraft) { await wait(); const team = requireTeam(id); Object.assign(team, structuredClone(draft)); return structuredClone(team) },
    async getTeamReviews(teamId: string) { await wait(); requireTeam(teamId); return structuredClone(reviews.filter((review) => review.teamId === teamId)) },
    async createTeamReview(teamId: string, draft: TeamReviewDraft) {
      await wait()
      const team = requireTeam(teamId)
      if (!applications.some((item) => item.teamId === teamId && item.taskId === draft.taskId && item.status === 'accepted')) throw new Error('Оставить отзыв можно после принятия отклика этой команды.')
      if (reviews.some((item) => item.teamId === teamId && item.taskId === draft.taskId && item.authorName.trim().toLowerCase() === draft.authorName.trim().toLowerCase())) throw new Error('Эта организация уже оставила отзыв по данной задаче.')
      const review: TeamReview = { ...draft, teamId, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      reviews.unshift(review)
      const own = reviews.filter((item) => item.teamId === teamId)
      team.rating = { average: Math.round(own.reduce((sum, item) => sum + item.score, 0) / own.length * 10) / 10, reviewsCount: own.length }
      return structuredClone(review)
    },
    async generateAssistantPlan(taskId: string, teamId: string, focus?: string): Promise<AssistantPlan> {
      await wait()
      const team = requireTeam(teamId)
      const task = tasks.find((item) => item.id === taskId)
      if (!task) throw new Error('Задача не найдена.')
      if (task.status !== 'published') throw new Error('AI-план можно создать только для опубликованной задачи.')
      const value: AssistantPlan = {
        id: crypto.randomUUID(), taskId, teamId, createdAt: new Date().toISOString(),
        plan: {
          summary: `Демонстрационный план для «${task.title}». Команда «${team.name}» исследует потребности пользователей, соберёт прототип и проверит его на пилоте.${focus ? ' Дополнительный акцент: ' + focus : ''}`,
          architecture: { overview: 'Веб-интерфейс обращается к серверному API, которое обрабатывает данные и вызывает AI.', components: [{ name: 'Интерфейс', responsibility: 'Пользовательские сценарии, формы и отображение результатов.', technologies: ['React', 'TypeScript'] }, { name: 'Серверный API', responsibility: 'Валидация, хранение и безопасный вызов AI.', technologies: ['Node.js'] }] },
          milestones: [{ title: 'Уточнение задачи', description: 'Согласовать один основной сценарий.', tasks: ['Обсудить проблему', 'Нарисовать прототип'], deliverable: 'Согласованный прототип', estimatedHours: 1 }, { title: 'Разработка и проверка', description: 'Реализовать сквозной сценарий и проверить с пользователями.', tasks: ['Разработать интерфейс', 'Подключить API', 'Провести тестирование'], deliverable: 'Рабочий MVP', estimatedHours: 4 }],
          assignments: team.members.map((member) => ({ memberName: member.name, role: member.role, tasks: [`Подготовить часть решения по роли: ${member.role}`, 'Участвовать в проверке общего сценария'] })),
          risks: [{ title: 'Неполные исходные данные', probability: 'medium', impact: 'AI может давать неточные ответы.', mitigation: 'Согласовать проверенный набор материалов и тестовых вопросов.' }],
          firstTasks: [{ title: 'Выбрать главный сценарий', description: 'Зафиксировать путь пользователя и критерий успеха.', priority: 'high' }],
          questionsForBusiness: ['Какие материалы доступны для пилота?', 'Как измерить полезность решения?'],
        },
      }
      plans.unshift(value); return structuredClone(value)
    },
    async getAssistantPlans(taskId: string, teamId: string) { await wait(); return structuredClone(plans.filter((plan) => plan.taskId === taskId && plan.teamId === teamId)) },
    async getAssistantPlan(id: string) { await wait(); const plan = plans.find((item) => item.id === id); if (!plan) throw new Error('План не найден.'); return structuredClone(plan) },
  }
}
