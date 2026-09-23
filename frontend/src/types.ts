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

export type ApplicationStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected'

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
}

export interface ApplicationDraft {
  teamName: string
  members: string
  solution: string
  technologies: string[]
  contact: string
  comment: string
}
