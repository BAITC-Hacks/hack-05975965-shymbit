import { Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

export function TagInput({ label, value, onChange, placeholder, required }: { label: string; value: string[]; onChange: (next: string[]) => void; placeholder: string; required?: boolean }) {
  const [input, setInput] = useState('')
  const add = () => {
    const tags = input.split(',').map((item) => item.trim()).filter(Boolean)
    if (!tags.length) return
    onChange(Array.from(new Set([...value, ...tags])))
    setInput('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() }
  }
  return (
    <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>
      <div className="tag-input">
        <div className="chip-list">{value.map((tag) => <span className="chip chip--removable" key={tag}>{tag}<button type="button" onClick={() => onChange(value.filter((item) => item !== tag))} aria-label={`Удалить ${tag}`}><X size={13} /></button></span>)}</div>
        <div className="tag-input__control"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} onBlur={add} placeholder={placeholder} /><button type="button" onClick={add} aria-label="Добавить"><Plus size={18} /></button></div>
      </div>
    </label>
  )
}
