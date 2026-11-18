import { useCallback, useEffect, useMemo, useState } from 'react'
import Ticket from './Ticket.jsx'
import KitchenMark from './KitchenMark.jsx'
import KdsSettings from './KdsSettings.jsx'
import KdsLogin from './KdsLogin.jsx'
import { useArrivals, useBoard, useClock, useKdsTheme, useKdsLogin, useRestaurant, useSound, useWakeLock } from './hooks.js'
import './kds.css'

const TABS = [
  ['cooking', 'In progress'],
  ['ready', 'Ready'],
  ['on_the_way', 'On the way'],
  ['served', 'Served'],
  ['all', 'All'],
]

// what the empty tab says: a title and a line
const EMPTY = {
  cooking: ['All clear', 'New orders appear here the moment a table places them.'],
  ready: ['Nothing ready yet', 'Dishes marked Ready by the kitchen show up here.'],
  on_the_way: ['Nothing on the way', 'Orders being taken to a table show up here.'],
  served: ['Nothing served yet', 'Orders the waiters have served move here.'],
  all: ['No tickets yet', 'Every order of the day will be listed here.'],
}

// The Kitchen Display Screen: a full-screen card in the app. Light by default. Tickets arrive live.
// (Waiter calls are not shown here: they live on their own screen, /waiter.)
export default function KitchenScreen({ onClose }) {
  const { tickets, loaded, online, error, clearError, move } = useBoard()
  const arrived = useArrivals(tickets, loaded)
  const sound = useSound()
  const name = useRestaurant()
  const [theme, toggleTheme] = useKdsTheme()
  const clock = useClock()
  const auth = useKdsLogin()
  const [tab, setTab] = useState('cooking')
  const [leaving, setLeaving] = useState(false)
  useWakeLock()

  const close = useCallback(() => {
    if (!onClose) return
    setLeaving(true)
    setTimeout(onClose, 220)
  }, [onClose])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const cooking = useMemo(() => tickets.filter((t) => t.status === 'new' || t.status === 'preparing').sort((a, b) => a.id - b.id), [tickets])
  const ready = useMemo(() => tickets.filter((t) => t.status === 'ready').sort((a, b) => b.id - a.id), [tickets])
  const onWay = useMemo(() => tickets.filter((t) => t.status === 'on_the_way').sort((a, b) => b.id - a.id), [tickets])
  const served = useMemo(() => tickets.filter((t) => t.status === 'served').sort((a, b) => b.id - a.id), [tickets])
  const shown = tab === 'cooking' ? cooking : tab === 'ready' ? ready : tab === 'on_the_way' ? onWay : tab === 'served' ? served : [...cooking, ...ready, ...onWay, ...served]
  const counts = { cooking: cooking.length, ready: ready.length, on_the_way: onWay.length, served: served.length, all: tickets.length }
  const fresh = useMemo(() => new Set(arrived.map((t) => t.id)), [arrived])

  useEffect(() => {
    if (arrived.length && sound.on && auth.loggedIn) sound.beep() // silent on the login page
  }, [arrived]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const n = cooking.length
    document.title = n ? `(${n}) Kitchen · ${name}` : `Kitchen · ${name}`
    return () => {
      if (onClose) document.title = 'The Captain'
    }
  }, [cooking.length, name])

  return (
    <div className={`kds kitchen-app solid-bar${leaving ? ' leaving' : ''}${onClose ? '' : ' standalone'}`} data-theme={theme} role="dialog" aria-label={`${name} kitchen`}>
      <header className="kds-bar">
        <div className="kds-brand">
          <span className="kds-mark" aria-hidden="true">
            <KitchenMark />
          </span>
          <div>
            <h1>{name}</h1>
            <p>Kitchen display</p>
          </div>
        </div>
        <time className="kds-clock" dateTime={clock.toISOString()}>
          <span>{clock.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <strong>{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
        </time>
        <div className="kds-tools">
          <span className={`kds-link${online ? ' on' : ''}`} role="status">
            <i aria-hidden="true" />
            {online ? 'Live' : 'Reconnecting'}
          </span>
          {auth.loggedIn && (
            <button type="button" className="kds-chip" onClick={auth.logout}>
              Log out
            </button>
          )}
          <KdsSettings sound={sound} theme={theme} onToggleTheme={toggleTheme} />
          {onClose && (
            <button type="button" className="kds-close" onClick={close} aria-label="Close the kitchen screen">
              ✕
            </button>
          )}
        </div>
      </header>

      {!auth.loggedIn ? (
        <KdsLogin restaurant={name} onLogin={auth.login} />
      ) : (
        <>
        <nav className="kds-tabs" role="tablist" aria-label="Show tickets">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" data-tab={key} aria-selected={tab === key} onClick={() => setTab(key)}>
              {label} <span className="kds-count">{counts[key]}</span>
            </button>
          ))}
        </nav>

        {error && (
          <div className="kds-alert" role="alert">
            <span>{error}</span>
            <button type="button" className="kds-chip" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}

        <main className="kds-main" role="tabpanel">
          {!loaded ? (
            <p className="kds-empty">Loading tickets…</p>
          ) : shown.length ? (
            <div className="kds-wall">
              {shown.map((t) => (
                <Ticket key={t.id} ticket={t} fresh={fresh.has(t.id)} onMove={move} />
              ))}
            </div>
          ) : (
            <div className="kds-clear">
              <span className="kds-clear-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 14.2A3.9 3.9 0 1 1 8.6 6.7a3.9 3.9 0 0 1 6.8 0A3.9 3.9 0 1 1 17 14.2" />
                  <path d="M7 14.2V19.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V14.2" />
                  <path d="M7 17h10" />
                </svg>
              </span>
              <h2>{EMPTY[tab][0]}</h2>
              <p>{EMPTY[tab][1]}</p>
            </div>
          )}
        </main>

        </>
      )}

      {/* read out by screen readers when a ticket arrives */}
      <p className="kds-sr" aria-live="polite">
        {arrived.length ? `New ticket: ${arrived.map((t) => (t.table_no ? `table ${t.table_no}` : 'no table')).join(', ')}` : ''}
      </p>
    </div>
  )
}
