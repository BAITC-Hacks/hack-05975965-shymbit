import { ArrowRight, Bot, CheckCircle2, Clock3, Layers3, ListChecks, RefreshCw, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import type { AssistantPlan, Team } from '../types'
import { EmptyState, ErrorState, Loader } from './AsyncState'
import { Chips } from './TeamUI'

const levels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }
const dateLabel = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Сохранённый план'
function PlanView({ saved }: { saved: AssistantPlan }) {
  const { plan } = saved
  return <div className="plan-result">
    <div className="plan-summary"><span className="pill"><CheckCircle2 size={15} />План готов</span><h3>От задачи к первому результату</h3><p>{plan.summary}</p><small>{dateLabel(saved.createdAt)}</small></div>
    <section className="plan-section"><h3><Layers3 size={21} />Архитектура решения</h3><p>{plan.architecture.overview}</p><div className="plan-grid">{plan.architecture.components.map((part, index) => <article className="plan-card" key={index}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><h4>{part.name}</h4><p>{part.responsibility}</p><Chips values={part.technologies} /></article>)}</div></section>
    <section className="plan-section"><h3><ListChecks size={21} />Этапы разработки</h3><div className="milestone-list">{plan.milestones.map((stage, index) => <article className="milestone" key={index}><span className="milestone-index">{index + 1}</span><div><div className="section-toolbar"><h4>{stage.title}</h4><span className="chip"><Clock3 size={14} />{stage.estimatedHours} ч · оценка AI</span></div><p>{stage.description}</p><ul>{stage.tasks.map((task, i) => <li key={i}>{task}</li>)}</ul><div className="deliverable"><CheckCircle2 size={16} /><span>{stage.deliverable}</span></div></div></article>)}</div></section>
    <section className="plan-section"><h3><Users size={21} />Кто за что отвечает</h3><div className="plan-grid">{plan.assignments.map((assignment, index) => <article className="plan-card" key={index}><span className="member-avatar">{assignment.memberName.slice(0, 1)}</span><h4>{assignment.memberName}</h4><small>{assignment.role}</small><ul>{assignment.tasks.map((task, i) => <li key={i}>{task}</li>)}</ul></article>)}</div></section>
    <section className="plan-section"><h3><ShieldAlert size={21} />Риски и решения</h3>{plan.risks.length ? plan.risks.map((risk, index) => <article className="risk-card" key={index}><div className="section-toolbar"><h4>{risk.title}</h4><span className="chip">Вероятность: {levels[risk.probability]}</span></div><p>{risk.impact}</p><strong>Как уменьшить риск</strong><p>{risk.mitigation}</p></article>) : <p className="muted">AI не указал конкретных рисков.</p>}</section>
    <section className="plan-section"><h3><ArrowRight size={21} />С чего начать</h3><div className="plan-grid">{plan.firstTasks.map((task, index) => <article className="plan-card" key={index}><span className="chip">Приоритет: {levels[task.priority]}</span><h4>{task.title}</h4><p>{task.description}</p></article>)}</div></section>
    <section className="plan-section business-questions"><h3>Уточните у бизнеса</h3>{plan.questionsForBusiness.length ? <ol>{plan.questionsForBusiness.map((question, index) => <li key={index}>{question}</li>)}</ol> : <p>Дополнительные вопросы не указаны.</p>}</section>
  </div>
}

export function AssistantPlanner({ taskId }: { taskId: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [focus, setFocus] = useState('')
  const [plans, setPlans] = useState<AssistantPlan[]>([])
  const [selected, setSelected] = useState<AssistantPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const busy = useRef(false)
  const historyVersion = useRef(0)
  const loadTeams = useCallback(async () => {
    setLoading(true); setError('')
    try { setTeams(await api.getMyTeams()) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void loadTeams() }, [loadTeams])
  const loadHistory = useCallback(async () => {
    const version = ++historyVersion.current
    setSelected(null); setPlans([]); setActionError('')
    if (!teamId) { setHistoryLoading(false); return }
    setHistoryLoading(true)
    try {
      const items = await api.getAssistantPlans(taskId, teamId)
      if (version === historyVersion.current) setPlans(items)
    } catch (err) { if (version === historyVersion.current) setActionError(getErrorMessage(err)) }
    finally { if (version === historyVersion.current) setHistoryLoading(false) }
  }, [taskId, teamId])
  useEffect(() => { void loadHistory() }, [loadHistory])
  const generate = async (event: FormEvent) => {
    event.preventDefault()
    if (!teamId || busy.current) return
    busy.current = true; setGenerating(true); setActionError('')
    try { const value = await api.generateAssistantPlan(taskId, teamId, focus.trim()); setSelected(value); setPlans((items) => [value, ...items]) }
    catch (err) { setActionError(getErrorMessage(err)) } finally { busy.current = false; setGenerating(false) }
  }
  const openPlan = async (id: string) => {
    if (busy.current) return
    busy.current = true; setDetailLoading(true); setActionError(''); setSelected(null)
    try { setSelected(await api.getAssistantPlan(id)) } catch (err) { setActionError(getErrorMessage(err)) } finally { busy.current = false; setDetailLoading(false) }
  }
  const disabled = generating || detailLoading || historyLoading
  return <section className="assistant-hub" id="assistant-plan">
    <div className="assistant-heading"><span className="assistant-icon"><Bot size={30} /></span><div><span className="eyebrow">Ваш технический наставник</span><h2>Составить план решения с AI</h2><p>Архитектура, этапы и задачи для каждого участника вашей команды.</p></div><Sparkles className="assistant-spark" size={28} /></div>
    {loading ? <Loader label="Загружаем профили команд…" /> : error ? <ErrorState message={error} retry={loadTeams} /> : !teams.length ? <EmptyState title="Начните с профиля команды" text="AI нужны участники, роли и навыки, чтобы составить полезный план." action={<Link className="button button--primary" to="/teams/new">Создать команду</Link>} /> : <>
      <form onSubmit={generate} className="assistant-controls"><label className="field"><span>Для какой команды?</span><select required value={teamId} disabled={disabled} onChange={(e) => setTeamId(e.target.value)}><option value="">Выберите команду</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="field"><span>Дополнительный акцент <small>· необязательно</small></span><textarea rows={2} maxLength={1500} disabled={disabled} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Например, успеть собрать прототип за 5 часов" /></label><button className="button button--primary" disabled={!teamId || disabled}>{generating ? <><span className="button-spinner" />AI составляет план…</> : <><Sparkles size={17} />{plans.length ? 'Составить новый план' : 'Составить план'}</>}</button></form>
      {actionError && <div className="inline-error" role="alert">{actionError}<button className="button button--ghost button--small" type="button" disabled={disabled} onClick={loadHistory}><RefreshCw size={15} />Обновить историю</button></div>}
      {generating && <div aria-live="polite"><Loader label="AI изучает задачу и навыки команды…" /></div>}
      {historyLoading ? <Loader label="Загружаем историю…" /> : teamId && <div className="plan-history"><h3>История планов <span>{plans.length}</span></h3>{plans.length ? <div className="history-items">{plans.map((plan, index) => <button key={plan.id} type="button" className={`history-button ${selected?.id === plan.id ? 'is-selected' : ''}`} disabled={disabled} onClick={() => openPlan(plan.id)}><Clock3 size={16} /><span>План {plans.length - index}<small>{dateLabel(plan.createdAt)}</small></span><ArrowRight size={16} /></button>)}</div> : <p className="muted">Для этой команды план ещё не создавался. Выберите акцент и запустите AI-помощника.</p>}</div>}
      {detailLoading && <Loader label="Открываем сохранённый план…" />}
      {selected && !generating && <PlanView saved={selected} />}
    </>}
  </section>
}
