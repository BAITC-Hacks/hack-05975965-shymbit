import { ArrowDown, ArrowRight, ArrowUpRight, Building2, Sparkles, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from '../components/AsyncState'
import { TaskCard } from '../components/TaskCard'
import { api, getErrorMessage } from '../lib/api'
import type { ChallengeTask } from '../types'

const steps = [
  { number: '01', label: 'Идея', title: 'Начните с проблемы', text: 'Расскажите, что хочется изменить. Достаточно черновика — остальное уточним вместе.' },
  { number: '02', label: 'Ясность', title: 'Дайте идее форму', text: 'AI задаст вопросы, соберёт описание и покажет, чего не хватает для публикации.' },
  { number: '03', label: 'Действие', title: 'Найдите свою команду', text: 'Студенты предложат решения. Выберите команду, с которой начнёте проект.' },
]

export function HomePage() {
  const [tasks, setTasks] = useState<ChallengeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.getTasks('published').then((items) => {
      if (active) setTasks(items.filter((item) => item.status === 'published'))
    }).catch((reason) => {
      if (active) setError(getErrorMessage(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [attempt])

  return (
    <>
      <section className="sana-hero" aria-labelledby="hero-title">
        <img className="sana-hero__image" src="/images/sana-studio.png" alt="" fetchPriority="high" />
        <div className="sana-hero__shade" />
        <div className="container sana-hero__inner">
          <div className="sana-hero__copy">
            <span className="editorial-label"><i />Образование × реальные задачи</span>
            <h1 id="hero-title">Большие идеи.<br />Ваша <em>точка<br className="hero-line-break" /> отсчёта.</em></h1>
            <p>Бизнесу — решения. Студентам — опыт.<br />AI помогает превратить короткую идею<br className="desktop-break" /> в понятную задачу для сильной команды.</p>
            <div className="sana-hero__actions">
              <Link className="button button--primary" to="/tasks">Найти свой проект<ArrowUpRight size={19} /></Link>
              <Link className="hero-secondary" to="/tasks/new">Разместить задачу<ArrowUpRight size={17} /></Link>
            </div>
            <span className="sana-hero__caption">От первого вопроса — к реальному результату.</span>
          </div>
          <div className="sana-hero__foot">
            <a href="#how-it-works" className="hero-scroll"><ArrowDown size={17} /><span>Узнайте, как это работает</span></a>
            <div className="hero-signature"><span>МНВО · AI SANA</span><p>Знания становятся <em>действием.</em></p></div>
          </div>
        </div>
      </section>

      <section className="editorial-section journey-section" id="how-it-works">
        <div className="container">
          <div className="editorial-heading">
            <div><span className="editorial-label">01 / От идеи к проекту</span><h2>Всё начинается<br />с <em>хорошего вопроса.</em></h2></div>
            <p>Не нужно приходить с готовым техническим заданием. Мы поможем разобраться с самым важным.</p>
          </div>
          <div className="journey-grid">{steps.map((step) => <article className="journey-step" key={step.number}>
            <div className="journey-step__top"><span>{step.number}</span><span>{step.label}</span><ArrowUpRight size={19} /></div>
            <h3>{step.title}</h3><p>{step.text}</p>
          </article>)}</div>
          <div className="ai-footnote"><Sparkles size={16} /><span>AI помогает уточнить задачу. Решение о публикации и выборе команды остаётся за вами.</span></div>
        </div>
      </section>

      <section className="editorial-section featured-section">
        <div className="container">
          <div className="editorial-heading">
            <div><span className="editorial-label">02 / Открытые возможности</span><h2>Ваш следующий<br /><em>большой шаг.</em></h2></div>
            <Link className="hero-secondary" to="/tasks">Все задачи<ArrowUpRight size={19} /></Link>
          </div>
          {loading ? <Loader label="Ищем задачи для вашего следующего проекта…" /> : error ? <ErrorState message={error} retry={retry} /> : tasks.length ? <div className="task-grid">{tasks.slice(0, 3).map((task, index) => <TaskCard key={task.id} task={task} index={index + 1} />)}</div> : <EmptyState title="Первый вызов может стать вашим" text="Опубликованные задачи появятся здесь. Расскажите о проблеме, которую поможет решить студенческая команда." action={<Link className="button button--primary" to="/tasks/new">Создать задачу<ArrowRight size={17} /></Link>} />}
        </div>
      </section>

      <section className="editorial-section pathways-section">
        <div className="container">
          <span className="editorial-label">03 / Две стороны одной идеи</span>
          <div className="pathways-grid">
            <article className="pathway"><Building2 size={24} strokeWidth={1.5} /><span className="eyebrow">Для бизнеса</span><h2>Ваша задача.<br /><em>Новый взгляд.</em></h2><p>Превратите проблему в понятный вызов. Получайте отклики и выбирайте команду по навыкам, портфолио и предложенному решению.</p><Link className="hero-secondary" to="/tasks/new">Рассказать о задаче<ArrowUpRight size={19} /></Link></article>
            <article className="pathway"><Users size={24} strokeWidth={1.5} /><span className="eyebrow">Для студентов</span><h2>Ваши знания.<br /><em>Настоящий опыт.</em></h2><p>Соберите команду, найдите интересный проект и предложите решение. AI поможет составить план и распределить первые шаги.</p><Link className="hero-secondary" to="/teams/new">Создать команду<ArrowUpRight size={19} /></Link></article>
          </div>
        </div>
      </section>
    </>
  )
}
