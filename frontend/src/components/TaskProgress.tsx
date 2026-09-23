const steps = ['Черновик', 'Уточнение с AI', 'Карточка']

export function TaskProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="task-progress" aria-label="Этапы подготовки задачи">
      {steps.map((label, index) => {
        const number = index + 1
        return <li key={label} className={number === step ? 'is-current' : number < step ? 'is-complete' : undefined} aria-current={number === step ? 'step' : undefined}>
          <span className="task-progress__number" aria-hidden="true">{number}</span>
          <span>{label}</span>
        </li>
      })}
    </ol>
  )
}
