import { ArrowUpRight, Star, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Team, TeamRating } from '../types'

export function Rating({ rating }: { rating: TeamRating }) {
  return <span className="team-rating"><Star size={16} fill="currentColor" />{rating.reviewsCount ? rating.average.toFixed(1) : 'Нет оценок'}<small>· отзывов: {rating.reviewsCount}</small></span>
}

export function Chips({ values }: { values: string[] }) {
  return <div className="chip-list">{Array.from(new Set(values)).map((value) => <span className="chip" key={value}>{value}</span>)}</div>
}

export function TeamCard({ team }: { team: Team }) {
  return <article className="team-card">
    <div className="team-card__top"><span className="team-avatar">{team.name.slice(0, 2).toUpperCase()}</span><Rating rating={team.rating} /></div>
    <h2><Link to={`/teams/${team.id}`}>{team.name}</Link></h2><p>{team.description}</p>
    <div className="team-members-line"><Users size={16} /><span>{team.members.map((member) => member.name).join(', ')}</span></div>
    <Chips values={team.skills} /><Chips values={team.technologies} />
    <Link className="text-link" to={`/teams/${team.id}`}>Профиль команды<ArrowUpRight size={17} /></Link>
  </article>
}

export function SafeLink({ url, label }: { url: string; label?: string }) {
  let safe = false
  try { safe = ['http:', 'https:'].includes(new URL(url).protocol) } catch { /* Invalid links stay plain text. */ }
  return safe ? <a className="text-link external-link" href={url} target="_blank" rel="noopener noreferrer">{label || url}<ArrowUpRight size={15} /></a> : <span>{label || url}</span>
}
