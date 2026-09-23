import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { ApplicationStatusBadge } from '../components/StatusBadge'
import type { Application, Team } from '../types'

export function StudentDashboard() {
  const [teams, setTeams] = useState<Team[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const [a, b] = await Promise.all([api.getMyTeams(), api.getMyApplications()]); setTeams(a); setApplications(b) }
    catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <div className="page container"><div className="section-toolbar"><h1>Мои команды и отклики</h1><Link className="button button--primary" to="/teams/new">Создать команду</Link></div>{loading ? <Loader /> : error ? <ErrorState message={error} retry={load} /> : <>
    <section className="hub-panel"><h2>Команды</h2>{teams.length ? teams.map((team) => <article className="project-item" key={team.id}><h3><Link to={`/teams/${team.id}`}>{team.name}</Link></h3><p>{team.description}</p><Link to={`/teams/${team.id}/edit`}>Редактировать профиль</Link></article>) : <EmptyState title="Создайте первую команду" text="Профиль позволит отправлять отклики и получать персональные AI-планы." />}</section>
    <section className="hub-panel"><h2>Мои отклики</h2>{applications.length ? applications.map((item) => <article className="project-item" key={item.id}><h3>{item.teamName}</h3><ApplicationStatusBadge status={item.status} /><p>{item.solution}</p><Link to={`/tasks/${item.taskId}`}>Открыть задачу (если она опубликована)</Link></article>) : <EmptyState title="Откликов пока нет" text="Найдите задачу в каталоге и предложите решение." />}</section>
  </>}</div>
}
