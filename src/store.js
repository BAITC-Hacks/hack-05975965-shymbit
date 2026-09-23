import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const emptyDatabase = () => ({ tasks: [], applications: [] });

export async function createJsonStore(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let database;
  try {
    database = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    database = emptyDatabase();
    await fs.writeFile(filePath, JSON.stringify(database, null, 2));
  }

  database.tasks ??= [];
  database.applications ??= [];

  const persist = async () => {
    await fs.writeFile(filePath, JSON.stringify(database, null, 2));
  };

  return {
    async createTask(data) {
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        ...data,
        clarificationQuestions: [],
        card: null,
        readinessScore: 0,
        readinessExplanation: "Задача ещё не прошла уточнение.",
        createdAt: now,
        updatedAt: now,
        publishedAt: null
      };
      database.tasks.push(task);
      await persist();
      return task;
    },

    async listTasks() {
      return [...database.tasks];
    },

    async getTask(id) {
      return database.tasks.find((task) => task.id === id) || null;
    },

    async updateTask(id, patch) {
      const task = database.tasks.find((item) => item.id === id);
      if (!task) return null;
      Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      await persist();
      return task;
    },

    async createApplication(data) {
      const now = new Date().toISOString();
      const application = {
        id: randomUUID(),
        ...data,
        status: "submitted",
        createdAt: now,
        updatedAt: now
      };
      database.applications.push(application);
      await persist();
      return application;
    },

    async listApplications(taskId) {
      return database.applications.filter((application) => application.taskId === taskId);
    },

    async getApplication(id) {
      return database.applications.find((application) => application.id === id) || null;
    },

    async updateApplication(id, patch) {
      const application = database.applications.find((item) => item.id === id);
      if (!application) return null;
      Object.assign(application, patch, { updatedAt: new Date().toISOString() });
      await persist();
      return application;
    }
  };
}
