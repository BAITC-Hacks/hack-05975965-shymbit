import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function Loader({ label = 'Загружаем данные…' }: { label?: string }) {
  return <div className="state-card"><LoaderCircle className="spin" size={34} /><strong>{label}</strong><span>Это займёт совсем немного времени.</span></div>
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-card state-card--error"><AlertTriangle size={34} /><strong>Не удалось загрузить данные</strong><span>{message}</span>{retry && <button className="button button--secondary" onClick={retry}>Попробовать снова</button>}</div>
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="state-card"><Inbox size={36} /><strong>{title}</strong><span>{text}</span>{action}</div>
}
