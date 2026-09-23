export class AIServiceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "AIServiceError";
    this.status = status;
  }
}

const cardFields = [
  "title", "problem", "goal", "expectedResult", "description", "requirements",
  "skills", "availableData", "constraints", "deadline", "successCriteria", "technologies"
];

function parseJson(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part.text || part.content || "").join("")
    : String(content || "");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AIServiceError("AI вернул ответ в неподдерживаемом формате.");
  }
}

export function createAIService(config) {
  async function requestJson(instruction, payload) {
    if (!config.aiApiKey) {
      throw new AIServiceError("AI API не настроен. Добавьте AI_API_KEY в файл окружения.");
    }

    let response;
    try {
      response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.aiApiKey}`
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: JSON.stringify(payload) }
          ]
        }),
        signal: AbortSignal.timeout(config.aiTimeoutMs)
      });
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw new AIServiceError("AI не ответил вовремя. Попробуйте ещё раз.");
      }
      throw new AIServiceError("Не удалось подключиться к AI API.");
    }

    if (!response.ok) {
      throw new AIServiceError("AI API вернул ошибку. Попробуйте ещё раз.");
    }

    const body = await response.json().catch(() => null);
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new AIServiceError("AI API вернул пустой ответ.");
    return parseJson(content);
  }

  return {
    async generateQuestions(task) {
      const result = await requestJson(
        "Ты помогаешь уточнить бизнес-задачу для студенческой команды. Верни JSON вида {\"questions\":[{\"question\":\"...\"}]}. Задай от 4 до 8 конкретных вопросов на русском языке. Не добавляй Markdown и лишний текст.",
        task
      );
      if (!Array.isArray(result.questions) || result.questions.length === 0) {
        throw new AIServiceError("AI не сформировал список уточняющих вопросов.");
      }
      return result.questions
        .map((item) => ({ question: String(item.question || "").trim() }))
        .filter((item) => item.question.length > 0)
        .slice(0, 8);
    },

    async generateCard(task) {
      const result = await requestJson(
        `Ты превращаешь ответы бизнеса в понятную карточку проекта для студентов. Верни только JSON с полями: ${cardFields.join(", ")}. Поля skills и technologies должны быть массивами строк. Остальные поля должны быть строками. Пиши на русском языке, не выдумывай факты и не добавляй Markdown.`,
        {
          ...task,
          clarificationQuestions: task.clarificationQuestions
        }
      );
      return Object.fromEntries(cardFields.map((field) => {
        const value = result[field];
        if (field === "skills" || field === "technologies") {
          return [field, Array.isArray(value) ? value.map(String).filter(Boolean) : []];
        }
        return [field, typeof value === "string" ? value.trim() : ""];
      }));
    }
  };
}
