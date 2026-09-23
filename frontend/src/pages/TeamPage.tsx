import { ArrowLeft, Edit3, Code2, Star, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { Chips, Rating, SafeLink } from '../components/TeamUI'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import type { Team, TeamReview, TeamReviewDraft } from '../types'

export function TeamPage() {
  const { id = '' } = useParams()
  const [team, setTeam] = useState<Team | null>(null)
  const [reviews, setReviews] = useState<TeamReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const { showToast } = useToast()
  const [draft, setDraft] = useState<TeamReviewDraft>({ taskId: '', authorName: '', score: 5, text: '' })
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const [value, items] = await Promise.all([api.getTeam(id), api.getTeamReviews(id)]); setTeam(value); setReviews(items) }
    catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setReviewError('')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.taskId.trim())) return setReviewError('Укажите идентификатор задачи (UUID из адреса её страницы).')
    if (!Number.isInteger(draft.score) || draft.score < 1 || draft.score > 5) return setReviewError('Оценка должна быть целым числом от 1 до 5.')
    busy.current = true; setSaving(true)
    try {
      const review = await api.createTeamReview(id, { ...draft, taskId: draft.taskId.trim() })
      setReviews((current) => [review, ...current]); setDraft({ taskId: '', authorName: '', score: 5, text: '' })
      showToast('Отзыв опубликован.', 'success')
      try { setTeam(await api.getTeam(id)) } catch { showToast('Отзыв сохранён. Обновите страницу, чтобы увидеть новый рейтинг.', 'info') }
    } catch (err) { setReviewError(getErrorMessage(err)) } finally { busy.current = false; setSaving(false) }
  }
  if (loading) return <div className="container page"><Loader /></div>
  if (error || !team) return <div className="container page"><ErrorState message={error || 'Команда не найдена.'} retry={load} /></div>
  return <div className="page"><div className="container">
    <Link className="back-link" to="/teams"><ArrowLeft size={16} />Все команды</Link>
    <header className="team-profile-header"><span className="team-avatar team-avatar--large">{team.name.slice(0, 2).toUpperCase()}</span><div><span className="eyebrow">Студенческая команда</span><h1>{team.name}</h1><Rating rating={team.rating} /></div><Link className="button button--secondary" to={`/teams/${id}/edit`}><Edit3 size={17} />Редактировать профиль</Link></header>
    <div className="profile-layout"><div className="profile-main">
      <section className="hub-panel"><h2>О команде</h2><p className="preserve-text">{team.description}</p></section>
      <section className="hub-panel"><h2><Users size={21} />Люди за проектами</h2><div className="member-grid">{team.members.map((member, index) => <article className="member-card" key={index}><span className="member-avatar">{member.name.slice(0, 1)}</span><h3>{member.name}</h3><p>{member.role}</p><Chips values={member.skills} /></article>)}</div></section>
      <section className="hub-panel"><h2>Прошлые проекты</h2>{team.projects.length ? team.projects.map((project, index) => <article className="project-item" key={index}><h3>{project.name}</h3><p>{project.description}</p><SafeLink url={project.url} label="Открыть проект" /></article>) : <p className="muted">Команда ещё не добавила проекты.</p>}</section>
      <section className="hub-panel"><div className="section-toolbar"><h2>Отзывы бизнеса</h2><Rating rating={team.rating} /></div>{reviews.length ? reviews.map((review) => <article className="review-item" key={review.id}><div className="section-toolbar"><strong>{review.authorName}</strong><span className="team-rating"><Star size={15} fill="currentColor" />{review.score} / 5</span></div><p className="preserve-text">{review.text}</p><Link className="text-link" to={`/tasks/${review.taskId}`}>Задача, над которой работали</Link></article>) : <EmptyState title="Пока без отзывов" text="Отзывы появятся после совместной работы с организациями." />}</section>
      <section className="hub-panel"><h2>Поделитесь опытом работы</h2><p className="muted">Отзыв может оставить организация после принятия отклика этой команды на задачу.</p>
        <form onSubmit={submit} className="review-form"><fieldset disabled={saving}><div className="form-grid">
          <label className="field"><span>Идентификатор задачи *</span><input required value={draft.taskId} onChange={(e) => setDraft({ ...draft, taskId: e.target.value })} placeholder="UUID из адреса задачи" /></label>
          <label className="field"><span>Название организации *</span><input required minLength={2} maxLength={200} value={draft.authorName} onChange={(e) => setDraft({ ...draft, authorName: e.target.value })} /></label>
          <label className="field"><span>Оценка *</span><select value={draft.score} onChange={(e) => setDraft({ ...draft, score: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} из 5</option>)}</select></label>
          <label className="field field--wide"><span>Комментарий *</span><textarea required minLength={3} maxLength={3000} rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Что получилось хорошо? Как команда работала с задачей?" /></label>
        </div>{reviewError && <p className="inline-error" role="alert">{reviewError}</p>}<div className="form-actions"><button className="button button--primary" disabled={saving}>{saving ? 'Публикуем…' : 'Опубликовать отзыв'}</button></div></fieldset></form>
      </section>
    </div><aside className="profile-aside"><section className="hub-panel"><h2>Навыки команды</h2><Chips values={team.skills} /><h3>Технологии</h3><Chips values={team.technologies} /></section><section className="hub-panel"><h2><Code2 size={20} />Открытый код</h2>{team.githubUrls.length ? team.githubUrls.map((url, index) => <SafeLink key={index} url={url} />) : <p className="muted">GitHub-ссылки пока не добавлены.</p>}</section><div className="team-cta"><span className="eyebrow">Следующий шаг</span><h3>Найдите свой следующий вызов</h3><p>Выберите задачу и получите AI-план для вашей команды.</p><Link className="button button--primary" to="/tasks">Открыть каталог</Link></div></aside></div>
  </div></div>
}
