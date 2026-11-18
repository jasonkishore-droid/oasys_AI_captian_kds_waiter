import { useEffect, useMemo, useRef, useState } from 'react'
import WaiterCalls from '../kds/WaiterCalls.jsx'
import WaiterMark from '../kds/WaiterMark.jsx'
import KdsSettings from '../kds/KdsSettings.jsx'
import WaiterLogin from '../kds/WaiterLogin.jsx'
import WaiterOrders from '../kds/WaiterOrders.jsx'
import ProfilePhoto from '../kds/ProfilePhoto.jsx'
import ProfileEdit from '../kds/ProfileEdit.jsx'
import { useArrivals, useBoard, useClock, useKdsTheme, useRestaurant, useSound, useWaiterCalls, useWaiterName, useWakeLock } from '../kds/hooks.js'
import '../kds/kds.css'

// The Waiter Calls screen on its own port (npm run waiter): every table asking for a waiter, live. It shares its
// look and its calls with the Kitchen Display's Waiter calls tab, but needs nothing else from it.
export default function WaiterScreen() {
  const { calls, loaded, online, error, clearError, acknowledge, arrive, release, finish } = useWaiterCalls()
  const arrived = useArrivals(calls, loaded) // tables that just called
  const board = useBoard() // the kitchen's tickets: the ones that are ready are for a waiter to collect
  const toServe = useMemo(() => board.tickets.filter((t) => t.status === 'ready' || t.status === 'on_the_way').sort((a, b) => a.id - b.id), [board.tickets])
  const readyNow = useMemo(() => board.tickets.filter((t) => t.status === 'ready'), [board.tickets])
  const readyArrived = useArrivals(readyNow, board.loaded) // orders that just came out of the kitchen
  const sound = useSound()
  const name = useRestaurant()
  const [theme, toggleTheme] = useKdsTheme()
  const clock = useClock()
  const duty = useWaiterName() // who is logged in on this device
  useWakeLock()

  const waiting = calls.filter((c) => c.status === 'open').length // nobody has answered yet
  const coming = calls.length - waiting // a waiter is on the way

  // a table handed back by another waiter ("sorry, can't attend") is a new alert for everyone: beep and flash it again
  const was = useRef(new Map())
  const [handedBack, setHandedBack] = useState([])
  const fresh = useMemo(() => new Set([...arrived.map((c) => c.id), ...handedBack]), [arrived, handedBack])
  useEffect(() => {
    const back = calls.filter((c) => c.status === 'open' && ['acknowledged', 'arrived'].includes(was.current.get(c.id)))
    was.current = new Map(calls.map((c) => [c.id, c.status]))
    if (!back.length) return
    setHandedBack(back.map((c) => c.id))
    if (sound.on) sound.beep()
    const t = setTimeout(() => setHandedBack([]), 6000)
    return () => clearTimeout(t)
  }, [calls]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((arrived.length || readyArrived.length) && sound.on) sound.beep()
  }, [arrived, readyArrived]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.title = waiting ? `(${waiting}) Waiter calls · ${name}` : `Waiter calls · ${name}`
  }, [waiting, name])

  return (
    <div className="kds standalone waiter-app solid-bar" data-theme={theme} role="main" aria-label={`${name} waiter calls`}>
      <header className="kds-bar">
        {/* left: the waiter's own picture, big, and the time */}
        <div className="ws-left">
          {duty.loggedIn && <ProfilePhoto photo={duty.photo} onChange={duty.setPhoto} size={76} />}
          <time className="kds-clock" dateTime={clock.toISOString()}>
            <span>{clock.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <strong>{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
          </time>
        </div>
        <div className="kds-brand">
          <span className="kds-mark" aria-hidden="true">
            <WaiterMark />
          </span>
          <div>
            <h1>{name}</h1>
            <p>Waiter calls</p>
          </div>
        </div>
        <div className="kds-tools">
          <span className={`kds-link${online ? ' on' : ''}`} role="status">
            <i aria-hidden="true" />
            {online ? 'Live' : 'Reconnecting'}
          </span>
          {duty.loggedIn && (
            <>
              <ProfileEdit duty={duty} />
              <button type="button" className="kds-chip" onClick={duty.logout}>
                Log out
              </button>
            </>
          )}
          <KdsSettings sound={sound} theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </header>

      {!duty.loggedIn ? (
        <WaiterLogin duty={duty} restaurant={name} />
      ) : (
        <>
        {/* how many are waiting and how many are being answered */}
        {/* two big counts, not tabs: this screen is a live list, so nothing here switches views */}
        <div className="ws-stats" aria-label="Summary">
          <div className={`ws-stat${waiting ? ' alert' : ''}`}>
            <strong>{waiting}</strong>
            <span>Waiting</span>
          </div>
          <div className="ws-stat">
            <strong>{coming}</strong>
            <span>On the way or at a table</span>
          </div>
          <div className={`ws-stat${readyNow.length ? ' ready' : ''}`}>
            <strong>{readyNow.length}</strong>
            <span>Orders ready</span>
          </div>
        </div>

        {(error || board.error) && (
          <div className="kds-alert" role="alert">
            <span>{error || board.error}</span>
            <button type="button" className="kds-chip" onClick={error ? clearError : board.clearError}>
              Dismiss
            </button>
          </div>
        )}

        <main className="kds-main">
          <WaiterOrders tickets={toServe} duty={duty} onCollect={(id, by, photo) => board.move(id, 'on_the_way', { by, photo })} onServe={(id) => board.move(id, 'served')} />
          <WaiterCalls calls={calls} loaded={loaded} fresh={fresh} onAck={acknowledge} onArrive={arrive} onRelease={release} onDone={finish} duty={duty} />
        </main>

        </>
      )}

      {/* read out by screen readers when a table calls */}
      <p className="kds-sr" aria-live="polite">
        {arrived.length ? `Table ${arrived.map((c) => c.table_no).join(', ')} is calling for a waiter` : ''}
      </p>
    </div>
  )
}
