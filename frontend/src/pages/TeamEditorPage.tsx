import { ArrowLeft, Plus, Save, Trash2, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loader } from '../components/AsyncState'
import { TagInput } from '../components/TagInput'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import { DocumentImport } from '../components/DocumentImport'
import { getSession } from '../lib/session'
import type { TeamDraft } from '../types'

const empty: TeamDraft = { name: '', description: '', members: [{ name: '', role: '', skills: [] }], skills: [], technologies: [], projects: [], githubUrls: [] }
const validUrl = (value: string, github = false) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && (!github || ['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) } catch { return false }
}

export function TeamEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [etag, setEtag] = useState<string>()
  const [draft, setDraft] = useState<TeamDraft>(empty)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    if (!id) { setDraft(empty); setLoading(false); return }
    setLoading(true); setLoadError('')
    api.getTeam(id).then(({ name, description, members, skills, technologies, projects, githubUrls, ownerId, etag }) => { if (active) {
      if (ownerId !== getSession()?.user.id && import.meta.env.VITE_USE_MOCK_API !== 'true') throw new Error('Редактировать команду может только её владелец.')
      setEtag(etag); setDraft({ name, description, members, skills, technologies, projects, githubUrls })
    } }).catch((err) => { if (active) setLoadError(getErrorMessage(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])
  const set = <K extends keyof TeamDraft>(key: K, value: TeamDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setError('')
    if (draft.name.trim().length < 2 || draft.description.trim().length < 10) return setError('Введите название от 2 символов и описание от 10 символов.')
    if (!draft.members.length || draft.members.some((member) => !member.name.trim() || !member.role.trim())) return setError('Добавьте хотя бы одного участника и заполните имя и роль каждого.')
    if (draft.projects.some((project) => !project.name.trim() || !project.description.trim() || !validUrl(project.url))) return setError('У каждого проекта должны быть название, описание и корректная ссылка http:// или https://.')
    if (draft.githubUrls.some((url) => !validUrl(url, true))) return setError('Проверьте ссылки GitHub: например, https://github.com/ваша-команда.')
    const tagLists = [...draft.members.map((member) => member.skills), draft.skills, draft.technologies]
    if (tagLists.some((tags) => tags.some((tag) => tag.length > 100)) || draft.skills.length > 50 || draft.technologies.length > 50 || draft.members.some((member) => member.skills.length > 30)) return setError('До 50 навыков и технологий команды, до 30 навыков участника. Значение — до 100 символов.')
    busy.current = true; setSaving(true)
    try { const team = id ? await api.updateTeam(id, draft, etag) : await api.createTeam(draft); showToast('Профиль команды сохранён.', 'success'); navigate(`/teams/${team.id}`) }
    catch (err) { setError(getErrorMessage(err)) }
    finally { busy.current = false; setSaving(false) }
  }
  if (loading) return <div className="container page"><Loader /></div>
  if (loadError) return <div className="container page"><ErrorState message={loadError} /></div>
  return <div className="page"><div className="container container--narrow">
    <Link className="back-link" to={id ? `/teams/${id}` : '/teams'}><ArrowLeft size={16} />К командам</Link>
    <div className="page-heading"><span className="pill"><Users size={15} />Профиль команды</span><h1>{id ? 'Ваша команда, в деталях' : 'Начните с вашей команды'}</h1><p>Покажите, что вы умеете. AI учтёт навыки каждого участника при составлении плана.</p></div>
    <DocumentImport targetType="team" targetId={id} disabled={saving} onApply={(values) => setDraft((current) => ({ ...current, ...values }) as TeamDraft)} />
    <form className="form-card team-editor" onSubmit={submit}><fieldset disabled={saving}>
      <section className="form-section"><h2>01 · О команде</h2><div className="form-grid"><label className="field field--wide"><span>Название *</span><input required minLength={2} maxLength={200} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Например, Sana Makers" /></label><label className="field field--wide"><span>Описание *</span><textarea required minLength={10} maxLength={3000} rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Что вас объединяет и какие задачи вы хотите решать?" /></label></div></section>
      <section className="form-section"><div className="section-toolbar"><h2>02 · Участники</h2><button type="button" className="button button--secondary button--small" disabled={draft.members.length >= 30} onClick={() => set('members', [...draft.members, { name: '', role: '', skills: [] }])}><Plus size={16} />Добавить участника</button></div>
        {draft.members.map((member, index) => <div className="repeat-card" key={index}><div className="section-toolbar"><strong>Участник {index + 1}</strong><button type="button" className="icon-button remove-button" aria-label={`Удалить участника ${index + 1}`} onClick={() => set('members', draft.members.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div><div className="form-grid">
          <label className="field"><span>Имя *</span><input required maxLength={200} value={member.name} onChange={(e) => set('members', draft.members.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /></label>
          <label className="field"><span>Роль *</span><input required maxLength={200} placeholder="Frontend-разработчик" value={member.role} onChange={(e) => set('members', draft.members.map((item, i) => i === index ? { ...item, role: e.target.value } : item))} /></label>
          <div className="field--wide"><TagInput label="Навыки участника" placeholder="React, аналитика…" value={member.skills} onChange={(skills) => set('members', draft.members.map((item, i) => i === index ? { ...item, skills } : item))} /></div>
        </div></div>)}
      </section>
      <section className="form-section"><h2>03 · Компетенции</h2><div className="form-grid"><TagInput label="Навыки команды" placeholder="UX, машинное обучение…" value={draft.skills} onChange={(value) => set('skills', value)} /><TagInput label="Технологии" placeholder="React, Python…" value={draft.technologies} onChange={(value) => set('technologies', value)} /></div></section>
      <section className="form-section"><div className="section-toolbar"><h2>04 · Прошлые проекты</h2><button type="button" className="button button--secondary button--small" disabled={draft.projects.length >= 50} onClick={() => set('projects', [...draft.projects, { name: '', description: '', url: '' }])}><Plus size={16} />Добавить проект</button></div>
        {!draft.projects.length && <p className="muted">Первый проект ещё впереди? Этот раздел можно пропустить.</p>}
        {draft.projects.map((project, index) => <div className="repeat-card" key={index}><div className="section-toolbar"><strong>Проект {index + 1}</strong><button type="button" className="icon-button remove-button" aria-label={`Удалить проект ${index + 1}`} onClick={() => set('projects', draft.projects.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div><div className="form-grid">
          {(['name', 'url', 'description'] as const).map((key) => <label className={`field ${key === 'description' ? 'field--wide' : ''}`} key={key}><span>{{ name: 'Название *', url: 'Ссылка на проект *', description: 'Описание *' }[key]}</span><input required type={key === 'url' ? 'url' : 'text'} maxLength={key === 'name' ? 200 : key === 'url' ? 1000 : 2000} value={project[key]} onChange={(e) => set('projects', draft.projects.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item))} /></label>)}
        </div></div>)}
      </section>
      <section className="form-section"><div className="section-toolbar"><h2>05 · GitHub</h2><button type="button" className="button button--secondary button--small" disabled={draft.githubUrls.length >= 30} onClick={() => set('githubUrls', [...draft.githubUrls, ''])}><Plus size={16} />Добавить ссылку</button></div>
        {draft.githubUrls.map((url, index) => <div className="url-row" key={index}><label className="field"><span>GitHub-ссылка {index + 1}</span><input required type="url" maxLength={500} placeholder="https://github.com/…" value={url} onChange={(e) => set('githubUrls', draft.githubUrls.map((item, i) => i === index ? e.target.value : item))} /></label><button type="button" className="icon-button remove-button" aria-label={`Удалить ссылку ${index + 1}`} onClick={() => set('githubUrls', draft.githubUrls.filter((_, i) => i !== index))}><Trash2 size={18} /></button></div>)}
      </section>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="form-actions"><Link className="button button--ghost" to="/teams">Отмена</Link><button className="button button--primary" disabled={saving}><Save size={18} />{saving ? 'Сохраняем…' : 'Сохранить профиль'}</button></div>
    </fieldset></form>
  </div></div>
}
