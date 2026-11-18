import { useEffect, useRef, useState } from 'react'

// the stages a ticket goes through, in order: [value, name, hint]
export const STAGES = [
  ['new', 'New', 'Just in'],
  ['preparing', 'Preparing', 'Being cooked'],
  ['ready', 'Ready', 'Ready to take out'],
  ['on_the_way', 'On the way', 'Taking it to the table'],
  ['served', 'Served', 'On the table'],
]

// The status dropdown on a ticket: a button showing the stage with its colour, and a styled menu of the five
// stages (colour dot, name, hint, a tick on the current one). Keyboard: Up/Down/Home/End move, Enter/Space
// choose, Escape closes. It opens upward, over the ticket.
export default function StatusMenu({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const items = useRef([])
  const current = STAGES.find(([v]) => v === value) || STAGES[0]

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', away)
    items.current[STAGES.findIndex(([v]) => v === value)]?.focus() // the menu opens on the current stage
    return () => document.removeEventListener('pointerdown', away)
  }, [open, value])

  const focusButton = () => box.current?.querySelector('.status-btn')?.focus()
  const choose = (v) => {
    setOpen(false)
    if (v !== value) onChange(v)
    focusButton()
  }
  const onKeyDown = (e) => {
    if (!open) return
    const at = items.current.findIndex((el) => el === document.activeElement)
    const go = (i) => {
      e.preventDefault()
      items.current[(i + STAGES.length) % STAGES.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(STAGES.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      focusButton()
    }
  }

  return (
    <div className="status-menu" ref={box} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="status-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current[1]}. Change status`}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="status-dot" data-stage={current[0]} aria-hidden="true" />
        <span>{current[1]}</span>
        <svg className="status-chev" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M1 7l5-5 5 5" />
        </svg>
      </button>
      {open && (
        <ul className="status-list" role="listbox" aria-label={label}>
          {STAGES.map(([v, name, hint], i) => (
            <li key={v} role="presentation">
              <button type="button" role="option" aria-selected={v === value} ref={(el) => (items.current[i] = el)} onClick={() => choose(v)}>
                <i className="status-dot" data-stage={v} aria-hidden="true" />
                <span className="status-name">
                  {name}
                  <small>{hint}</small>
                </span>
                {v === value && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
