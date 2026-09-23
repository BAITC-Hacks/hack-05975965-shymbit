import type { CSSProperties } from 'react'

export function ReadinessScore({ score = 0, explanation, compact = false }: { score?: number; explanation?: string; compact?: boolean }) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0
  return (
    <section className={`readiness${compact ? ' readiness--compact' : ''}`}>
      <div className="readiness__score" role="img" aria-label={`Полнота карточки: ${safeScore} из 100`} style={{ '--score': safeScore } as CSSProperties}>
        <span>{safeScore}</span><small>из 100</small>
      </div>
      <div><span className="eyebrow">Полнота карточки</span><h3>{safeScore >= 75 ? 'Можно браться за решение' : 'Нужно уточнить детали'}</h3>{compact ? <details className="readiness__details"><summary>Что означает оценка</summary><p>{explanation || 'Заполните ключевые поля, чтобы командам было понятно, какую задачу решать.'}</p><small>Учитывается заполненность 8 полей, а не качество решения. Порог публикации — 75 из 100.</small></details> : <><p>{explanation || 'Заполните ключевые поля, чтобы командам было понятно, какую задачу решать.'}</p><small>Учитывается заполненность 8 полей, а не качество решения. Порог публикации — 75 из 100.</small></>}</div>
    </section>
  )
}
