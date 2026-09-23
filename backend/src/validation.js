import { z } from "zod";

const optionalText = z.string().trim().max(5000).optional();

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  shortDescription: z.string().trim().min(10).max(5000),
  organization: z.string().trim().min(2).max(200),
  contactPerson: z.string().trim().min(2).max(200),
  desiredResult: optionalText,
  availableData: optionalText,
  constraints: optionalText,
  deadline: z.string().trim().max(100).optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  technologies: z.array(z.string().trim().min(1).max(100)).max(30).optional()
}).strict();

export const taskPatchSchema = taskCreateSchema.partial();

export const answersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(5000)
  }).strict()).min(1)
}).strict();

export const applicationCreateSchema = z.object({
  teamId: z.string().uuid().optional(),
  teamName: z.string().trim().min(2).max(200),
  members: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  solutionDescription: z.string().trim().min(10).max(5000),
  technologies: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  contact: z.string().trim().min(2).max(300),
  comment: z.string().trim().max(2000).optional()
}).strict();

export const applicationPatchSchema = z.object({
  status: z.enum(["submitted", "reviewed", "accepted", "rejected"])
}).strict();

const githubUrlSchema = z.string().trim().url().max(500).refine((value) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (hostname === "github.com" || hostname === "www.github.com")
      && ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Укажите корректную ссылку GitHub.");

const projectUrlSchema = z.string().trim().url().max(1000).refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Ссылка проекта должна начинаться с http:// или https://.");

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).default([])
}).strict();

export const teamProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  url: projectUrlSchema
}).strict();

export const teamCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(3000),
  members: z.array(teamMemberSchema).min(1).max(30),
  skills: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  technologies: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  projects: z.array(teamProjectSchema).max(50).default([]),
  githubUrls: z.array(githubUrlSchema).max(30).default([])
}).strict();

export const teamPatchSchema = teamCreateSchema.partial().strict();

export const teamReviewCreateSchema = z.object({
  taskId: z.string().uuid(),
  authorName: z.string().trim().min(2).max(200),
  score: z.number().int().min(1).max(5),
  text: z.string().trim().min(3).max(3000)
}).strict();

export const teamIdSchema = z.string().uuid();

export const assistantPlanRequestSchema = z.object({
  teamId: teamIdSchema,
  focus: z.string().trim().max(1500).optional().default("")
}).strict();

const nonEmptyText = z.string().trim().min(1).max(3000);

export const assistantPlanSchema = z.object({
  summary: nonEmptyText,
  architecture: z.object({
    overview: nonEmptyText,
    components: z.array(z.object({
      name: nonEmptyText,
      responsibility: nonEmptyText,
      technologies: z.array(z.string().trim().min(1).max(100)).max(30)
    }).strict()).min(1).max(30)
  }).strict(),
  milestones: z.array(z.object({
    title: nonEmptyText,
    description: nonEmptyText,
    tasks: z.array(nonEmptyText).min(1).max(30),
    deliverable: nonEmptyText,
    estimatedHours: z.number().positive().max(10000)
  }).strict()).min(1).max(30),
  assignments: z.array(z.object({
    memberName: nonEmptyText,
    role: nonEmptyText,
    tasks: z.array(nonEmptyText).min(1).max(30)
  }).strict()).min(1).max(30),
  risks: z.array(z.object({
    title: nonEmptyText,
    probability: z.enum(["low", "medium", "high"]),
    impact: nonEmptyText,
    mitigation: nonEmptyText
  }).strict()).max(30),
  firstTasks: z.array(z.object({
    title: nonEmptyText,
    description: nonEmptyText,
    priority: z.enum(["low", "medium", "high"])
  }).strict()).min(1).max(30),
  questionsForBusiness: z.array(nonEmptyText).max(30)
}).strict();

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error("Некорректные данные запроса.");
    error.status = 400;
    error.details = result.error.flatten();
    throw error;
  }
  return result.data;
}
