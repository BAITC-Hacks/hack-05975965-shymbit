import { ArrowLeft, Check, Clock3, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { ApplicationStatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { api, getErrorMessage } from '../lib/api'
import type { Application, ApplicationStatus } from '../types'

export function ApplicationsPage() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setApplications(await api.getApplications(id)) } catch (loadError) { setError(getErrorMessage(loadError)) }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const update = async (applicationId: string, status: ApplicationStatus) => {
    setUpdating(applicationId)
    try { const updated = await api.updateApplication(applicationId, status); setApplications((current) => current.map((item) => item.id === applicationId ? updated : item)); showToast('Статус отклика обновлён.', 'success') }
    catch (updateError) { showToast(getErrorMessage(updateError), 'error') }
    finally { setUpdating('') }
  }

  return <div className="page"><div className="container container--content"><Link className="back-link" to={`/tasks/${id}`}><ArrowLeft size={17} />К карточке задачи</Link><div className="page-title-row"><div><span className="eyebrow">Работа с командами</span><h1>Отклики на задачу</h1><p>Сравните предложения и выберите подходящую команду.</p></div><div className="catalog-count"><strong>{applications.length}</strong><span>откликов</span></div></div>{loading ? <Loader label="Загружаем отклики…" /> : error ? <ErrorState message={error} retry={load} /> : applications.length ? <div className="application-list">{applications.map((application) => <article className="application-card" key={application.id}><div className="application-card__heading"><div><h2>{application.teamName}</h2><span>{application.createdAt ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(application.createdAt)) : 'Дата не указана'}</span></div><ApplicationStatusBadge status={application.status} /></div><dl><div><dt>Участники</dt><dd>{application.members}</dd></div><div><dt>Предлагаемое решение</dt><dd>{application.solution}</dd></div><div><dt>Технологии</dt><dd><span className="chip-list">{application.technologies.map((item) => <span className="chip" key={item}>{item}</span>)}</span></dd></div><div><dt>Контакт</dt><dd>{application.contact}</dd></div>{application.comment && <div><dt>Комментарий</dt><dd>{application.comment}</dd></div>}</dl><div className="application-card__actions"><button className="button button--secondary" onClick={() => update(application.id, 'reviewing')} disabled={updating === application.id}><Clock3 size={17} />На рассмотрение</button><button className="button button--success" onClick={() => update(application.id, 'accepted')} disabled={updating === application.id}><Check size={17} />Принять</button><button className="button button--danger-ghost" onClick={() => update(application.id, 'rejected')} disabled={updating === application.id}><X size={17} />Отклонить</button></div></article>)}</div> : <EmptyState title="Откликов пока нет" text="Когда студенческие команды отправят предложения, они появятся на этой странице." />}</div></div>
}
