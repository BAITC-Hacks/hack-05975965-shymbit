import { ArrowLeft, ArrowRight, Bot, RefreshCw, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/AsyncState'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import type { ClarificationQuestion } from '../types'

export function ClarifyPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const loadQuestions = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await api.clarifyTask(id)
      setQuestions(result)
      setAnswers(Object.fromEntries(result.map((question) => [question.id, question.answer || ''])))
    } catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { void loadQuestions() }, [loadQuestions])

  const save = async () => {
    setSaving(true)
    try { await api.saveAnswers(id, answers); showToast('Ответы сохранены.', 'success'); return true }
    catch (saveError) { showToast(getErrorMessage(saveError), 'error'); return false }
    finally { setSaving(false) }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const missing = questions.some((question) => question.required && !answers[question.id]?.trim())
    if (missing) { showToast('Ответьте на все обязательные вопросы.', 'error'); return }
    if (!await save()) return
    setGenerating(true)
    try { await api.generateTask(id); showToast('Карточка задачи сформирована.', 'success'); navigate(`/tasks/${id}`) }
    catch (generateError) { showToast(getErrorMessage(generateError), 'error') }
    finally { setGenerating(false) }
  }

  return <div className="page page--form"><div className="container container--narrow">
    <Link className="back-link" to={`/tasks/${id}/edit`}><ArrowLeft size={17} />Вернуться к описанию</Link>
    <div className="page-heading"><span className="pill"><Sparkles size={15} />Шаг 2 из 3</span><h1>Уточним важные детали</h1><p>AI проанализировал описание и подготовил вопросы. Ответы сделают карточку понятной для команд.</p></div>
    {loading ? <Loader label="AI анализирует задачу…" /> : error ? <ErrorState message={error} retry={loadQuestions} /> : (
      <form className="form-card clarification" onSubmit={submit}>
        <div className="ai-note"><span><Bot size={24} /></span><div><strong>Вопросы от AI-помощника</strong><p>Отвечайте конкретно, но можно коротко. Ответы сохраняются перед генерацией.</p></div></div>
        {questions.map((question, index) => <label className="question" key={question.id}><span className="question__number">{index + 1}</span><span className="question__body"><strong>{question.text}{question.required && <b> *</b>}</strong><textarea rows={3} value={answers[question.id] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Введите ваш ответ…" /></span></label>)}
        <div className="form-actions form-actions--spread"><button type="button" className="button button--ghost" onClick={loadQuestions} disabled={saving || generating}><RefreshCw size={18} />Обновить вопросы</button><div><button type="button" className="button button--secondary" onClick={save} disabled={saving || generating}><Save size={18} />{saving ? 'Сохраняем…' : 'Сохранить ответы'}</button><button className="button button--primary" type="submit" disabled={saving || generating}>{generating ? <><span className="button-spinner" />AI формирует карточку…</> : <>Сформировать карточку<ArrowRight size={18} /></>}</button></div></div>
      </form>
    )}
  </div></div>
}
