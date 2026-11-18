import { useEffect, useRef, useState } from 'react'
import PrefixPicker from './PrefixPicker.jsx'

// After login, the waiter's name in the title bar opens this small panel: change the title (Mr., Mrs., Ms.) and the name
// the guest hears ("Mr. Ravi is on the way"). Changes save as they are typed. Escape or a click outside closes it.
export default function ProfileEdit({ duty }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const key = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div className="pe" ref={box}>
      <button type="button" className="pe-btn" aria-haspopup="dialog" aria-expanded={open} title="Edit your name" onClick={() => setOpen((o) => !o)}>
        <span className="kds-who">{duty.full}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="pe-panel" role="dialog" aria-label="Edit your name">
          <div className="od-fields">
            <div className="od-field">
              <span>Title</span>
              <PrefixPicker value={duty.prefix} onChange={duty.setPrefix} />
            </div>
            <label className="od-field">
              <span>Your name</span>
              <input value={duty.name} maxLength={24} placeholder="e.g. Ravi" autoComplete="off" autoFocus onChange={(e) => duty.setName(e.target.value)} />
            </label>
          </div>
          <p className="pe-hint">The guest hears: “{duty.full || '…'} is on the way.”</p>
        </div>
      )}
    </div>
  )
}
