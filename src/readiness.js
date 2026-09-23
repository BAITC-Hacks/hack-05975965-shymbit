const readinessFields = [
  ["problem", "понятной проблемы"],
  ["goal", "конкретной цели"],
  ["expectedResult", "ожидаемого результата"],
  ["availableData", "описания доступных данных"],
  ["constraints", "ограничений"],
  ["deadline", "сроков"],
  ["successCriteria", "критериев успеха"],
  ["contactPerson", "контактной информации"]
];

const hasValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
};

export function calculateReadiness(task, card) {
  const source = { ...task, ...card };
  const missing = readinessFields.filter(([field]) => !hasValue(source[field])).map(([, label]) => label);
  const score = Math.round(((readinessFields.length - missing.length) / readinessFields.length) * 100);
  const explanation = missing.length === 0
    ? "Все основные элементы задачи заполнены."
    : `Нужно уточнить: ${missing.join(", ")}.`;

  return {
    score,
    explanation,
    status: score >= 75 ? "ready" : "needs_clarification"
  };
}
