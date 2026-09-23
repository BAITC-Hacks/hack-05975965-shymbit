import { ArrowLeft, ArrowRight, Save, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/AsyncState'
import { TagInput } from '../components/TagInput'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import type { TaskDraft } from '../types'

const emptyDraft: TaskDraft = {
  title: '', shortDescription: '', organization: '', contactPerson: '', desiredResult: '',
  availableData: '', constraints: '', deadline: '', skills: [], technologies: [],
}

const fields: Array<{ key: keyof TaskDraft; label: string; placeholder: string; required?: boolean; area?: boolean; hint?: string }> = [
  { key: 'title', label: 'Название задачи', placeholder: 'Например: AI-помощник для первокурсников', required: true },
  { key: 'shortDescription', label: 'Краткое описание', placeholder: 'Какую проблему нужно решить и для кого?', required: true, area: true, hint: '2–4 предложения будет достаточно для начала.' },
  { key: 'organization', label: 'Организация', placeholder: 'Название компании или учреждения', required: true },
  { key: 'contactPerson', label: 'Контактное лицо', placeholder: 'Имя и должность', required: true },
  { key: 'desiredResult', label: 'Желаемый результат', placeholder: 'Что должно получиться в конце проекта?', required: true, area: true },
  { key: 'availableData', label: 'Доступные данные', placeholder: 'Какие данные, материалы или доступы вы можете предоставить?', area: true },
  { key: 'constraints', label: 'Ограничения', placeholder: 'Сроки, безопасность, законы, технические ограничения…', area: true },
  { key: 'deadline', label: 'Сроки', placeholder: 'Например: 8 недель или до 15 декабря', required: true },
]

export function CreateTaskPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof TaskDraft, string>>>({})
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getTask(id).then((task) => setDraft({
      title: task.title, shortDescription: task.shortDescription, organization: task.organization,
      contactPerson: task.contactPerson || '', desiredResult: task.desiredResult || task.expectedResult || '',
      availableData: task.availableData || '', constraints: task.constraints || '', deadline: task.deadline || '',
      skills: task.skills, technologies: task.technologies,
    })).catch((error) => setLoadError(getErrorMessage(error))).finally(() => setLoading(false))
  }, [id])

  const requiredKeys = useMemo(() => fields.filter((field) => field.required).map((field) => field.key), [])
  const validate = () => {
    const next: typeof errors = {}
    requiredKeys.forEach((key) => { if (!String(draft[key]).trim()) next[key] = 'Заполните это поле.' })
    if (!draft.skills.length) next.skills = 'Добавьте хотя бы один навык.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const update = (key: keyof TaskDraft, value: string | string[]) => {
    setDraft((current) => ({ ...current, [key]: value }) as TaskDraft)
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event?: FormEvent, clarify = true) => {
    event?.preventDefault()
    if (saving) return
    if (!validate()) { showToast('Проверьте обязательные поля.', 'error'); return }
    setSaving(true)
    try {
      const task = id ? await api.updateTask(id, draft) : await api.createTask(draft)
      showToast(id ? 'Изменения сохранены.' : 'Черновик задачи сохранён.', 'success')
      navigate(`/tasks/${task.id || id}${clarify ? '/clarify' : ''}`)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="container page"><Loader label="Загружаем задачу…" /></div>
  if (loadError) return <div className="container page"><ErrorState message={loadError} /></div>

  return (
    <div className="page page--form">
      <div className="container container--narrow">
        <Link className="back-link" to={id ? `/tasks/${id}` : '/'}><ArrowLeft size={17} />Назад</Link>
        <div className="page-heading"><span className="pill"><WandSparkles size={15} />Шаг 1 из 3</span><h1>{id ? 'Редактирование задачи' : 'Расскажите о вашей задаче'}</h1><p>Заполните основные поля. На следующем шаге AI поможет уточнить детали.</p></div>
        <form className="form-card" onSubmit={submit} noValidate>
          <div className="form-section"><div className="form-section__title"><span>1</span><div><h2>Основная информация</h2><p>Коротко обозначьте суть и владельца задачи.</p></div></div>
            <div className="form-grid">
              {fields.slice(0, 4).map((field) => <label className={`field ${field.area ? 'field--wide' : ''}`} key={field.key}><span>{field.label}{field.required && <b> *</b>}</span>{field.area ? <textarea rows={4} value={draft[field.key] as string} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} /> : <input value={draft[field.key] as string} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} />}{field.hint && <small>{field.hint}</small>}{errors[field.key] && <em>{errors[field.key]}</em>}</label>)}
            </div>
          </div>
          <div className="form-section"><div className="form-section__title"><span>2</span><div><h2>Контекст и результат</h2><p>Эти данные помогут AI подготовить точные вопросы.</p></div></div>
            <div className="form-grid">
              {fields.slice(4).map((field) => <label className={`field ${field.area ? 'field--wide' : ''}`} key={field.key}><span>{field.label}{field.required && <b> *</b>}</span>{field.area ? <textarea rows={4} value={draft[field.key] as string} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} /> : <input value={draft[field.key] as string} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} />}{errors[field.key] && <em>{errors[field.key]}</em>}</label>)}
            </div>
          </div>
          <div className="form-section"><div className="form-section__title"><span>3</span><div><h2>Команда и технологии</h2><p>Добавляйте значения клавишей Enter или через запятую.</p></div></div>
            <div className="form-grid"><div><TagInput label="Необходимые навыки *" value={draft.skills} onChange={(value) => update('skills', value)} placeholder="Аналитика данных, UX…" required />{errors.skills && <span className="field-error">{errors.skills}</span>}</div><TagInput label="Технологии, если известны" value={draft.technologies} onChange={(value) => update('technologies', value)} placeholder="Python, React…" /></div>
          </div>
          <p className="muted">Можно открыть карточку и опубликовать задачу сразу или сначала уточнить её с AI.</p>
          <div className="form-actions"><Link className="button button--ghost" to="/my-tasks">Отмена</Link><button className="button button--secondary" type="button" disabled={saving} onClick={() => submit(undefined, false)}>Сохранить и открыть карточку</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? <><span className="button-spinner" />Сохраняем…</> : <><Save size={18} />Сохранить и уточнить с AI<ArrowRight size={18} /></>}</button></div>
        </form>
      </div>
    </div>
  )
}
