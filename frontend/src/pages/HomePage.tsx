import { ArrowRight, Bot, Building2, CheckCircle2, Search, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

const steps = [
  { number: '01', title: 'Опишите задачу', text: 'Расскажите о проблеме и желаемом результате в простой форме.' },
  { number: '02', title: 'Уточните с AI', text: 'Помощник задаст важные вопросы и соберёт полноценную карточку.' },
  { number: '03', title: 'Найдите команду', text: 'Опубликуйте задачу и выберите подходящую студенческую команду.' },
]

export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__content">
            <span className="pill"><Sparkles size={16} />Платформа реальных образовательных проектов</span>
            <h1>Идеи бизнеса.<br /><span>Энергия студентов.</span><br />Результат вместе.</h1>
            <p>AI Sana Challenge Hub помогает организациям превращать идеи в понятные задачи, а студенческим командам — находить проекты с реальным влиянием.</p>
            <div className="hero__actions">
              <Link className="button button--primary" to="/tasks/new">Создать задачу<ArrowRight size={19} /></Link>
              <Link className="button button--secondary" to="/tasks"><Search size={19} />Найти задачу</Link>
            </div>
            <div className="hero__trust"><CheckCircle2 size={18} /><span>AI помогает сделать задачу ясной и выполнимой</span></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-visual__glow" />
            <div className="preview-card preview-card--main">
              <div className="preview-card__head"><span className="preview-icon"><Bot /></span><div><small>AI-анализ задачи</small><strong>Готовность к публикации</strong></div></div>
              <div className="preview-score"><span>87</span><small>/ 100</small></div>
              <div className="progress"><i style={{ width: '87%' }} /></div>
              <p>Описание содержит цель, данные и измеримые критерии успеха.</p>
            </div>
            <div className="floating-card floating-card--one"><Building2 size={19} /><span><strong>42</strong> задачи от бизнеса</span></div>
            <div className="floating-card floating-card--two"><Users size={19} /><span><strong>120+</strong> студенческих команд</span></div>
          </div>
        </div>
      </section>

      <section className="section section--tinted">
        <div className="container">
          <div className="section-heading"><span className="eyebrow">Как это работает</span><h2>От идеи до сильной команды — три шага</h2><p>AI берёт на себя структуру, чтобы вы сосредоточились на результате.</p></div>
          <div className="steps">{steps.map((step) => <article className="step-card" key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
        </div>
      </section>

      <section className="section">
        <div className="container audience-grid">
          <article className="audience-card audience-card--business"><Building2 size={30} /><span className="eyebrow">Для организаций</span><h2>Решайте реальные задачи с мотивированными командами</h2><p>Сформулируйте вызов, получите отклики и выберите команду для пилотного проекта.</p><Link className="text-link" to="/tasks/new">Разместить задачу<ArrowRight size={17} /></Link></article>
          <article className="audience-card audience-card--students"><Users size={30} /><span className="eyebrow">Для студентов</span><h2>Работайте над проектами, которые имеют значение</h2><p>Соберите команду, примените знания на практике и покажите результат индустрии.</p><Link className="text-link" to="/tasks">Смотреть задачи<ArrowRight size={17} /></Link></article>
        </div>
      </section>
    </>
  )
}
