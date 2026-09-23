import { CheckCircle2, Send, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, getErrorMessage } from '../lib/api'
import type { ApplicationDraft } from '../types'
import { TagInput } from './TagInput'
import { useToast } from './Toast'

const initial: ApplicationDraft = { teamName: '', members: '', solution: '', technologies: [], contact: '', comment: '' }

export function ApplicationForm({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { showToast } = useToast()
  const [draft, setDraft] = useState(initial)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(() => localStorage.getItem(`application:${taskId}`) === 'sent')
  const update = (key: keyof ApplicationDraft, value: string | string[]) => setDraft((current) => ({ ...current, [key]: value }) as ApplicationDraft)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.teamName.trim() || !draft.members.trim() || !draft.solution.trim() || !draft.contact.trim()) { showToast('Заполните все обязательные поля.', 'error'); return }
    if (sent) return
    setSending(true)
    try { await api.createApplication(taskId, draft); localStorage.setItem(`application:${taskId}`, 'sent'); setSent(true); showToast('Отклик успешно отправлен.', 'success') }
    catch (error) { showToast(getErrorMessage(error), 'error') }
    finally { setSending(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="application-title"><button className="modal__close" onClick={onClose} aria-label="Закрыть"><X /></button>{sent ? <div className="success-state"><span><CheckCircle2 size={42} /></span><h2 id="application-title">Отклик уже отправлен</h2><p>Организация рассмотрит предложение вашей команды. Повторная отправка для этой задачи заблокирована.</p><button className="button button--primary" onClick={onClose}>Понятно</button></div> : <><div className="modal__heading"><span className="eyebrow">Отклик команды</span><h2 id="application-title">Предложите своё решение</h2><p>Расскажите об участниках и подходе к задаче.</p></div><form className="application-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>Название команды *</span><input value={draft.teamName} onChange={(e) => update('teamName', e.target.value)} placeholder="Название вашей команды" /></label><label className="field"><span>Контакт *</span><input value={draft.contact} onChange={(e) => update('contact', e.target.value)} placeholder="Email или телефон" /></label><label className="field field--wide"><span>Участники *</span><textarea rows={3} value={draft.members} onChange={(e) => update('members', e.target.value)} placeholder="Имена, роли и компетенции участников" /></label><label className="field field--wide"><span>Предлагаемое решение *</span><textarea rows={5} value={draft.solution} onChange={(e) => update('solution', e.target.value)} placeholder="Опишите ваш подход и ожидаемый результат" /></label><div className="field--wide"><TagInput label="Технологии" value={draft.technologies} onChange={(value) => update('technologies', value)} placeholder="Python, React, LLM…" /></div><label className="field field--wide"><span>Дополнительный комментарий</span><textarea rows={3} value={draft.comment} onChange={(e) => update('comment', e.target.value)} placeholder="Ссылка на портфолио, вопросы или важные детали" /></label></div><div className="form-actions"><button type="button" className="button button--ghost" onClick={onClose}>Отмена</button><button className="button button--primary" disabled={sending}>{sending ? <><span className="button-spinner" />Отправляем…</> : <><Send size={18} />Отправить отклик</>}</button></div></form></>}</div></div>
}
