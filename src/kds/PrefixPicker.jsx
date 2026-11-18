import { useEffect, useRef, useState } from 'react'

const PREFIXES = ['Mr.', 'Mrs.', 'Ms.']

// A custom drop-down (not the browser's own select): a button that opens a short list of titles.
// Arrow keys move, Enter or Space picks, Escape or a click outside closes.
export default function PrefixPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef(null)
  const options = ['', ...PREFIXES] // '' = no title
  const pick = (v) => {
    onChange(v)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const onKey = (e) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setActive(Math.max(0, options.indexOf(value)))
        return setOpen(true)
      }
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      pick(options[active])
    }
  }
  return (
    <div className="od-pick" ref={box} onKeyDown={onKey}>
      <button
        type="button"
        className="od-pick-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(Math.max(0, options.indexOf(value)))
          setOpen((o) => !o)
        }}
      >
        <span className={value ? '' : 'none'}>{value || 'Title'}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <ul className="od-pick-list" role="listbox" aria-label="Title">
          {options.map((o, i) => (
            <li key={o || 'none'} role="option" aria-selected={o === value} className={i === active ? 'active' : ''} onPointerEnter={() => setActive(i)} onClick={() => pick(o)}>
              {o || 'None'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
