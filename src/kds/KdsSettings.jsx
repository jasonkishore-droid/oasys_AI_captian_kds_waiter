import { useEffect, useRef, useState } from 'react'

// The gear in the title bar: one button that opens a small panel with the Sound, Dark mode and Full screen switches.
// Escape or a click outside closes it.
export default function KdsSettings({ sound, theme, onToggleTheme }) {
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
  const dark = theme === 'dark'
  // full screen: follows the browser, so pressing Esc or F11 outside the panel keeps the switch right
  const canFull = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
  const [full, setFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleFull = () => {
    const go = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    go?.catch(() => {}) // the browser may refuse (e.g. not triggered by a tap): the switch just stays as it was
  }
  return (
    <div className="kds-gear" ref={box}>
      <button type="button" className="kds-gear-btn" aria-label="Settings" aria-haspopup="true" aria-expanded={open} title="Settings" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="kds-gear-panel" role="menu" aria-label="Settings">
          <button type="button" role="menuitemcheckbox" aria-checked={sound.on} className="kds-gear-row" onClick={sound.toggle}>
            <span>Sound</span>
            <i className="kds-switch" data-on={sound.on ? 'true' : undefined} aria-hidden="true" />
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={dark} className="kds-gear-row" onClick={onToggleTheme}>
            <span>Dark mode</span>
            <i className="kds-switch" data-on={dark ? 'true' : undefined} aria-hidden="true" />
          </button>
          {canFull && (
            <button type="button" role="menuitemcheckbox" aria-checked={full} className="kds-gear-row" onClick={toggleFull}>
              <span>Full screen</span>
              <i className="kds-switch" data-on={full ? 'true' : undefined} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
