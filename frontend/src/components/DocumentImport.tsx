import { useState } from 'react'
import { api, getErrorMessage } from '../lib/api'
import type { ImportResult } from '../types'

const labels: Record<string, string> = { title: 'Название задачи', shortDescription: 'Краткое описание', organization: 'Организация', contactPerson: 'Контактное лицо', desiredResult: 'Желаемый результат', availableData: 'Доступные данные', constraints: 'Ограничения', deadline: 'Сроки', skills: 'Навыки', technologies: 'Технологии', name: 'Название команды', description: 'Описание команды', members: 'Участники', projects: 'Проекты', githubUrls: 'GitHub' }
export function DocumentImport({ targetType, targetId, disabled, onApply }: { targetType: 'task' | 'team'; targetId?: string; disabled?: boolean; onApply: (values: Record<string, ImportResult['suggestions'][number]['value']>) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  async function extract() {
    if (!file || !consent || busy) return
    setBusy(true); setError(''); setResult(null); setSelected([])
    try { setResult(await api.extractDocument(file, targetType, targetId)) }
    catch (err) { setError(getErrorMessage(err)) } finally { setBusy(false) }
  }
  if (import.meta.env.VITE_USE_MOCK_API === 'true') return null
  return <section className="form-card document-import"><h2>Заполнить из документа с AI</h2><p>PDF с текстом, DOCX или TXT, до 10 МБ. AI предложит значения, но не сохранит форму за вас.</p>
    <label className="field"><span>Документ</span><input type="file" accept=".pdf,.docx,.txt" disabled={busy || disabled} onChange={(e) => { const next = e.target.files?.[0] || null; setFile(next); setResult(null); setSelected([]); setError(next && next.size > 10 * 1024 * 1024 ? 'Файл превышает 10 МБ.' : '') }} /></label>
    <label className="import-consent"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={(e) => setConsent(e.target.checked)} />Разрешаю отправить текст внешнему AI-сервису. В документе нет секретов или лишних персональных данных.</label>
    <button type="button" className="button button--secondary" disabled={busy || disabled || !consent || !file || file.size > 10 * 1024 * 1024} onClick={extract}>{busy ? 'Читаем документ и проверяем предложения…' : 'Получить предложения'}</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {result && <div aria-live="polite"><h3>Проверьте предложения перед применением</h3><p>Отметьте нужные поля. Их текущие значения в форме будут заменены.</p>{result.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
      {!result.suggestions.length && <p>Подтверждённые значения не найдены. Заполните поля вручную.</p>}
      {result.suggestions.map((item) => <article className="repeat-card" key={item.field}><label className="import-consent"><input type="checkbox" disabled={disabled} checked={selected.includes(item.field)} onChange={(e) => setSelected((items) => e.target.checked ? [...items, item.field] : items.filter((field) => field !== item.field))} /><strong>{labels[item.field] || item.field}</strong></label><pre>{typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)}</pre><details><summary>Источник: {item.source.fileName}{item.source.page ? `, стр. ${item.source.page}` : ''}</summary><blockquote>{item.source.excerpt}</blockquote></details>{item.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</article>)}
      {result.missingFields.length > 0 && <p className="muted">Не найдены: {result.missingFields.map((field) => labels[field] || field).join(', ')}.</p>}
      <button type="button" className="button button--primary" disabled={disabled || !selected.length} onClick={() => { onApply(Object.fromEntries(result.suggestions.filter((item) => selected.includes(item.field)).map((item) => [item.field, item.value]))); setResult(null); setSelected([]) }}>Применить выбранные поля</button>
    </div>}
  </section>
}
