import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const emptyDatabase = () => ({
  tasks: [],
  applications: [],
  teams: [],
  reviews: [],
  assistantPlans: [],
  users: [],
  sessions: [],
  ownershipMigrations: []
});

const clone = (value) => structuredClone(value);

export async function createJsonStore(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let database;
  let needsMigration = false;
  try {
    database = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    database = emptyDatabase();
    needsMigration = true;
  }

  for (const collection of Object.keys(emptyDatabase())) {
    if (database[collection] === undefined) {
      database[collection] = [];
      needsMigration = true;
    } else if (!Array.isArray(database[collection])) {
      throw new Error("Повреждена коллекция базы данных. Восстановите её из резервной копии.");
    }
  }

  const persist = async () => {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(database, null, 2), { flag: "wx" });
      await fs.rename(temporaryPath, filePath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  };
  if (needsMigration) await persist();

  let writeQueue = Promise.resolve();
  const mutate = (operation) => {
    const pending = writeQueue.then(async () => {
      const previousState = JSON.stringify(database);
      try {
        const result = operation();
        await persist();
        return result == null ? result : clone(result);
      } catch (error) {
        database = JSON.parse(previousState);
        throw error;
      }
    });
    writeQueue = pending.catch(() => {});
    return pending;
  };
  const read = async (operation) => {
    await writeQueue;
    return clone(operation());
  };

  return {
    createUser(data) {
      return mutate(() => {
        if (database.users.some((user) => user.email === data.email)) {
          throw Object.assign(new Error("Аккаунт с такой почтой уже существует."), { status: 409 });
        }
        const user = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
        database.users.push(user);
        return user;
      });
    },
    getUser(id) { return read(() => database.users.find((user) => user.id === id) || null); },
    findUserByEmail(email) { return read(() => database.users.find((user) => user.email === email) || null); },
    createSession(data) {
      return mutate(() => {
        database.sessions = database.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
        database.sessions.push(data);
        return data;
      });
    },
    getSession(hash) { return read(() => database.sessions.find((session) => session.tokenHash === hash) || null); },
    deleteSession(hash) {
      return mutate(() => { database.sessions = database.sessions.filter((session) => session.tokenHash !== hash); });
    },
    assignLegacyOwner(collection, id, ownerId) {
      return mutate(() => {
        const role = { tasks: "business", teams: "student", applications: "student" }[collection];
        const user = database.users.find((item) => item.id === ownerId);
        const item = role && database[collection].find((item) => item.id === id);
        if (!user || user.role !== role || !item || item.ownerId) {
          throw Object.assign(new Error("Проверьте объект без владельца и роль аккаунта."), { status: 409 });
        }
        item.ownerId = ownerId;
        item.updatedAt = new Date().toISOString();
        database.ownershipMigrations.push({ collection, id, ownerId, createdAt: item.updatedAt });
        return item;
      });
    },
    createTask(data) {
      return mutate(() => {
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
        return task;
      });
    },

    listTasks() {
      return read(() => database.tasks);
    },

    getTask(id) {
      return read(() => database.tasks.find((task) => task.id === id) || null);
    },

    updateTask(id, patch, expectedTask) {
      return mutate(() => {
        const task = database.tasks.find((item) => item.id === id);
        if (!task) return null;
        // Проверяем снимок внутри очереди, чтобы долгий запрос AI не затёр новые данные.
        if (expectedTask && !isDeepStrictEqual(task, expectedTask)) {
          const error = new Error("Задача была изменена другим запросом. Обновите данные и повторите действие.");
          error.status = 409;
          throw error;
        }
        const changes = typeof patch === "function" ? patch(clone(task)) : patch;
        if (changes) Object.assign(task, changes, { updatedAt: new Date().toISOString() });
        return task;
      });
    },

    createApplication(data) {
      return mutate(() => {
        if (database.tasks.find((task) => task.id === data.taskId)?.status !== "published") {
          throw Object.assign(new Error("Задача больше не опубликована."), { status: 409 });
        }
        const now = new Date().toISOString();
        const application = {
          id: randomUUID(),
          ...data,
          status: "submitted",
          createdAt: now,
          updatedAt: now
        };
        database.applications.push(application);
        return application;
      });
    },

    listApplications(taskId) {
      return read(() => database.applications.filter((application) => !taskId || application.taskId === taskId));
    },

    getApplication(id) {
      return read(() => database.applications.find((application) => application.id === id) || null);
    },

    updateApplication(id, patch) {
      return mutate(() => {
        const application = database.applications.find((item) => item.id === id);
        if (!application) return null;
        Object.assign(application, patch, { updatedAt: new Date().toISOString() });
        return application;
      });
    },

    createTeam(data) {
      return mutate(() => {
        const now = new Date().toISOString();
        const team = {
          id: randomUUID(),
          ...data,
          rating: { average: 0, reviewsCount: 0 },
          createdAt: now,
          updatedAt: now
        };
        database.teams.push(team);
        return team;
      });
    },

    listTeams() {
      return read(() => database.teams);
    },

    getTeam(id) {
      return read(() => database.teams.find((team) => team.id === id) || null);
    },

    updateTeam(id, patch, expectedTeam) {
      return mutate(() => {
        const team = database.teams.find((item) => item.id === id);
        if (!team) return null;
        if (expectedTeam && !isDeepStrictEqual(team, expectedTeam)) {
          throw Object.assign(new Error("Профиль изменился. Обновите данные."), { status: 409 });
        }
        Object.assign(team, patch, { updatedAt: new Date().toISOString() });
        return team;
      });
    },

    listReviews(teamId) {
      return read(() => database.reviews
        .filter((review) => review.teamId === teamId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },

    createReview(data) {
      return mutate(() => {
        if (!database.applications.some((item) => item.teamId === data.teamId
          && item.taskId === data.taskId && item.status === "accepted")) {
          throw Object.assign(new Error("Для отзыва нужен принятый отклик."), { status: 409 });
        }
        const normalizedAuthor = data.authorName.trim().toLocaleLowerCase();
        const duplicate = database.reviews.some((review) => review.teamId === data.teamId
          && review.taskId === data.taskId
          && ((data.authorId && review.authorId === data.authorId)
            || review.authorName.trim().toLocaleLowerCase() === normalizedAuthor));
        if (duplicate) return null;

        const review = { id: randomUUID(), ...data, createdAt: new Date().toISOString() };
        database.reviews.push(review);
        const team = database.teams.find((item) => item.id === data.teamId);
        const teamReviews = database.reviews.filter((item) => item.teamId === data.teamId);
        const average = teamReviews.reduce((total, item) => total + item.score, 0) / teamReviews.length;
        team.rating = {
          average: Math.round(average * 10) / 10,
          reviewsCount: teamReviews.length
        };
        team.updatedAt = new Date().toISOString();
        return review;
      });
    },

    hasAcceptedApplication(taskId, teamId) {
      return read(() => database.applications.some((application) => application.taskId === taskId
        && application.teamId === teamId
        && application.status === "accepted"));
    },

    hasApplicationReview(teamId, taskId, authorName) {
      const normalizedAuthor = authorName.trim().toLocaleLowerCase();
      return read(() => database.reviews.some((review) => review.teamId === teamId
        && review.taskId === taskId
        && review.authorName.trim().toLocaleLowerCase() === normalizedAuthor));
    },

    createAssistantPlan(data) {
      return mutate(() => {
        const assistantPlan = {
          id: randomUUID(),
          ...data,
          createdAt: new Date().toISOString()
        };
        database.assistantPlans.push(assistantPlan);
        return assistantPlan;
      });
    },

    listAssistantPlans(taskId, teamId) {
      return read(() => database.assistantPlans
        .filter((plan) => plan.taskId === taskId && (!teamId || plan.teamId === teamId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },

    getAssistantPlan(id) {
      return read(() => database.assistantPlans.find((plan) => plan.id === id) || null);
    }
  };
}
