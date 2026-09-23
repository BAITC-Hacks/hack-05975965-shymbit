import type { CSSProperties } from 'react'

export function ReadinessScore({ score = 0, explanation }: { score?: number; explanation?: string }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <section className="readiness">
      <div className="readiness__score" style={{ '--score': safeScore } as CSSProperties}>
        <span>{safeScore}</span><small>из 100</small>
      </div>
      <div><span className="eyebrow">Рейтинг готовности</span><h3>{safeScore >= 80 ? 'Задача хорошо подготовлена' : safeScore >= 60 ? 'Задачу можно улучшить' : 'Нужно больше деталей'}</h3><p>{explanation || 'AI оценил полноту описания задачи.'}</p></div>
    </section>
  )
}
