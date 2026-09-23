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
  teamName: z.string().trim().min(2).max(200),
  members: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  solutionDescription: z.string().trim().min(10).max(5000),
  technologies: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  contact: z.string().trim().min(2).max(300)
}).strict();

export const applicationPatchSchema = z.object({
  status: z.enum(["submitted", "reviewed", "accepted", "rejected"])
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
