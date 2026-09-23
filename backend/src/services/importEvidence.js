// Только типографические различия. Числа, слова и знаки не удаляются.
export const normalizeEvidence = (text) => text.normalize('NFKC')
  .replace(/\u00ad/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[«»“”„]/g, '"').replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const word = /[\p{L}\p{N}_]/u;
function occurrence(text, value) {
  let index = text.indexOf(value);
  while (index !== -1) {
    const before = text[index - 1] || '';
    const after = text[index + value.length] || '';
    if (!(word.test(value[0]) && word.test(before))
      && !(word.test(value.at(-1)) && word.test(after))) return index;
    index = text.indexOf(value, index + 1);
  }
  return -1;
}
export function includesEvidence(text, value) {
  const needle = normalizeEvidence(value);
  return Boolean(needle) && occurrence(normalizeEvidence(text), needle) >= 0;
}

// Если AI сократил цитату/ошибся в номере страницы, восстанавливаем источник
// только по полному дословному значению (без семантического или нечёткого поиска).
export function recoverSource(document, values, preferredPage) {
  const matches = document.pages.flatMap((page) => {
    const text = normalizeEvidence(page.text);
    const needles = values.map(normalizeEvidence);
    const positions = needles.map((needle) => needle ? occurrence(text, needle) : -1);
    if (positions.some((position) => position < 0)) return [];
    const start = Math.min(...positions);
    const end = Math.max(...positions.map((position, index) => position + needles[index].length));
    if (end - start > 10000) return [];
    return [{ page: page.page, excerpt: text.slice(start, end) }];
  });
  return matches.find((match) => match.page === preferredPage) || (matches.length === 1 ? matches[0] : null);
}

const taskLabels = {
  'название задачи': 'title', 'краткое описание': 'shortDescription',
  'организация': 'organization', 'контактное лицо': 'contactPerson',
  'желаемый результат': 'desiredResult', 'доступные данные': 'availableData',
  'ограничения': 'constraints', 'сроки': 'deadline',
  'необходимые навыки': 'skills', 'технологии': 'technologies'
};
const teamLabels = { 'название команды': 'name', 'описание команды': 'description',
  'навыки команды': 'skills', 'технологии': 'technologies', 'github': 'githubUrls' };
const arrays = new Set(['skills', 'technologies', 'githubUrls']);
const paragraphs = new Set(['shortDescription', 'desiredResult', 'availableData', 'constraints', 'description']);

// Структурированный бриф уже содержит подписи полей. Для него не нужно
// заставлять модель перефразировать готовые значения. Не разбираем вложенные
// объекты участников/проектов и не угадываем поля без явных подписей.
export function labeledSuggestions(document, targetType) {
  const labels = targetType === 'task' ? taskLabels : teamLabels;
  const result = [];
  for (const page of document.pages) {
    const lines = page.text.split(/\r?\n/);
    const headings = [];
    lines.forEach((line, index) => {
      const colon = line.indexOf(':');
      const label = normalizeEvidence(colon >= 0 ? line.slice(0, colon) : line);
      if (labels[label]) headings.push({ index, field: labels[label], inline: colon >= 0 ? line.slice(colon + 1).trim() : '' });
    });
    headings.forEach((heading, index) => {
      const end = headings[index + 1]?.index ?? lines.length;
      const parts = [heading.inline, ...lines.slice(heading.index + 1, end)].map((line) => line.trim());
      while (parts.length && !parts[0]) parts.shift();
      const blank = parts.indexOf('');
      const block = parts.slice(0, blank < 0 ? parts.length : blank);
      const content = paragraphs.has(heading.field) ? block.join(' ') : block[0] || '';
      if (!content) return;
      result.push({ field: heading.field, value: arrays.has(heading.field) ? content.split(/[,;]+/).map((item) => item.trim()).filter(Boolean) : content,
        source: { page: page.page, excerpt: content }, warnings: ['Значение извлечено из подписанного поля документа. Проверьте перед применением.'] });
    });
  }
  // Не выбираем за пользователя между несколькими одноимёнными разделами.
  return result.filter((item) => result.filter((other) => other.field === item.field).length === 1);
}
