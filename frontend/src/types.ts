export type TaskStatus = 'draft' | 'needs_clarification' | 'ready' | 'published' | 'archived'

export interface ChallengeTask {
  id: string
  title: string
  shortDescription: string
  organization: string
  contactPerson?: string
  desiredResult?: string
  availableData?: string
  constraints?: string
  deadline?: string
  skills: string[]
  technologies: string[]
  status: TaskStatus
  problem?: string
  goal?: string
  expectedResult?: string
  description?: string
  requirements?: string
  successCriteria?: string
  readinessScore?: number
  readinessExplanation?: string
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
  clarificationQuestions?: ClarificationQuestion[]
}

export interface TaskDraft {
  title: string
  shortDescription: string
  organization: string
  contactPerson: string
  desiredResult: string
  availableData: string
  constraints: string
  deadline: string
  skills: string[]
  technologies: string[]
}

export interface ClarificationQuestion {
  id: string
  text: string
  required?: boolean
  answer?: string
}

export type ApplicationStatus = 'submitted' | 'reviewed' | 'accepted' | 'rejected'

export interface Application {
  id: string
  taskId: string
  teamName: string
  members: string
  solution: string
  technologies: string[]
  contact: string
  comment?: string
  createdAt: string
  status: ApplicationStatus
  teamId?: string
}

export interface ApplicationDraft {
  teamId?: string
  teamName: string
  members: string
  solution: string
  technologies: string[]
  contact: string
  comment: string
}

export interface TeamMember { name: string; role: string; skills: string[] }
export interface TeamProject { name: string; description: string; url: string }
export interface TeamRating { average: number; reviewsCount: number }
export interface TeamReview { id: string; teamId: string; taskId: string; authorName: string; score: number; text: string; createdAt?: string }
export type TeamReviewDraft = Omit<TeamReview, 'id' | 'teamId' | 'createdAt'>
export interface Team {
  id: string
  name: string
  description: string
  members: TeamMember[]
  skills: string[]
  technologies: string[]
  projects: TeamProject[]
  githubUrls: string[]
  rating: TeamRating
}
export type TeamDraft = Omit<Team, 'id' | 'rating'>

export interface ArchitectureComponent { name: string; responsibility: string; technologies: string[] }
export interface Milestone { title: string; description: string; deliverable: string; estimatedHours: number; tasks: string[] }
export interface Assignment { memberName: string; role: string; tasks: string[] }
export interface Risk { title: string; probability: 'low' | 'medium' | 'high'; impact: string; mitigation: string }
export interface FirstTask { title: string; description: string; priority: 'low' | 'medium' | 'high' }
export interface AssistantPlan {
  id: string
  taskId: string
  teamId: string
  plan: {
    summary: string
    architecture: { overview: string; components: ArchitectureComponent[] }
    milestones: Milestone[]
    assignments: Assignment[]
    risks: Risk[]
    firstTasks: FirstTask[]
    questionsForBusiness: string[]
  }
  createdAt?: string
}
