import type { CSSProperties } from 'react'

export function ReadinessScore({ score = 0, explanation }: { score?: number; explanation?: string }) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0
  return (
    <section className="readiness">
      <div className="readiness__score" role="img" aria-label={`Полнота карточки: ${safeScore} из 100`} style={{ '--score': safeScore } as CSSProperties}>
        <span>{safeScore}</span><small>из 100</small>
      </div>
      <div><span className="eyebrow">Полнота карточки</span><h3>{safeScore >= 75 ? 'Достаточно данных для публикации' : 'Добавьте недостающие детали'}</h3><p>{explanation || 'Заполните ключевые поля, чтобы командам было понятно, какую задачу решать.'}</p><small>Учитывается заполненность 8 полей, а не качество решения. Порог публикации — 75 из 100.</small></div>
    </section>
  )
}
