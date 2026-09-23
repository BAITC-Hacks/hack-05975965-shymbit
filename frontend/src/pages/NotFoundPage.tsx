import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <div className="page"><div className="container"><div className="not-found"><span>404</span><h1>Страница не найдена</h1><p>Возможно, ссылка устарела или адрес введён с ошибкой.</p><Link className="button button--primary" to="/"><ArrowLeft size={18} />На главную</Link></div></div></div>
}
