import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { acknowledgeCall, arriveCall, releaseCall, fetchBoard, fetchCalls, fetchRestaurant, finishCall, setTicketStatus, STREAM_URL, WAITER_STREAM_URL } from './api.js'
import { checkKdsLogin } from './kdsAuth.js'

// ---- one shared clock: every timer on screen ticks from a single interval ----
const listeners = new Set()
let clock = Date.now()
let clockTimer = null
const subscribeClock = (fn) => {
  listeners.add(fn)
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clock = Date.now()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(fn)
    if (!listeners.size) (clearInterval(clockTimer), (clockTimer = null))
  }
}
export const useNow = () => useSyncExternalStore(subscribeClock, () => clock)

// ---- the board: loaded, kept live by the server's event stream, bumped with optimistic updates ----
const FALLBACK_POLL_MS = 30000

export function useBoard() {
  const [tickets, setTickets] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(false) // the live stream is connected
  const [error, setError] = useState('')
  const busy = useRef(new Set()) // tickets with a change in flight: a refresh must not undo them

  const refresh = useCallback(async () => {
    try {
      const next = await fetchBoard()
      setTickets((cur) => next.map((t) => (busy.current.has(t.id) ? cur.find((c) => c.id === t.id) || t : t)))
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(e.name === 'TimeoutError' ? 'The server is not answering.' : e.message || 'Could not load tickets.')
    }
  }, [])

  useEffect(() => {
    refresh()
    const es = new EventSource(STREAM_URL) // reconnects by itself; every (re)connect starts with an event
    es.addEventListener('kitchen', refresh)
    es.onopen = () => setOnline(true)
    es.onerror = () => setOnline(false)
    const poll = setInterval(refresh, FALLBACK_POLL_MS) // a safety net if the stream is blocked
    const wake = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', refresh)
    return () => {
      es.close()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  // move a ticket to another stage (new, preparing, ready, served): the card moves at once, and moves
  // back with a message if the server refuses. A served ticket leaves the board.
  const move = useCallback(async (id, status, extra = {}) => {
    let before = null
    busy.current.add(id)
    setTickets((cur) => {
      before = cur.find((t) => t.id === id) || null
      return cur.map((t) => (t.id === id ? { ...t, status, ready_at: status === 'ready' ? new Date().toISOString() : t.ready_at, delivered_by: status === 'on_the_way' ? extra.by || null : status === 'served' ? t.delivered_by : null, delivered_photo: status === 'on_the_way' ? extra.photo || null : status === 'served' ? t.delivered_photo : null } : t))
    })
    try {
      await setTicketStatus(id, status, extra)
      setError('')
      return true
    } catch (e) {
      if (before) setTickets((cur) => cur.map((t) => (t.id === id ? before : t)))
      setError(`Could not update the ticket: ${e.message}`)
      return false // so the screen can drop the "status changed" toast
    } finally {
      busy.current.delete(id)
    }
  }, [])

  return { tickets, loaded, online, error, clearError: () => setError(''), move }
}

// ---- new-ticket detection: which tickets just arrived (empty on the first load) ----
export function useArrivals(tickets, loaded) {
  const seen = useRef(null)
  const [arrived, setArrived] = useState([])
  useEffect(() => {
    if (!loaded) return
    const ids = new Set(tickets.map((t) => t.id))
    if (seen.current) {
      const fresh = tickets.filter((t) => !seen.current.has(t.id))
      if (fresh.length) {
        setArrived(fresh)
        const t = setTimeout(() => setArrived([]), 2500)
        seen.current = ids
        return () => clearTimeout(t)
      }
    }
    seen.current = ids
  }, [tickets, loaded])
  return arrived
}

// ---- a short double beep; browsers allow sound only after a tap, hence a toggle ----
export function useSound() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('kds-sound') === '1'
    } catch {
      return false
    }
  })
  const ctx = useRef(null)
  const beep = useCallback(() => {
    try {
      const c = (ctx.current ??= new AudioContext())
      for (const at of [0, 0.18]) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.frequency.value = 880
        g.gain.setValueAtTime(0.12, c.currentTime + at)
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + at + 0.14)
        o.connect(g).connect(c.destination)
        o.start(c.currentTime + at)
        o.stop(c.currentTime + at + 0.15)
      }
    } catch { /* no audio on this device */ }
  }, [])
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem('kds-sound', v ? '0' : '1')
      } catch { /* private window */ }
      if (!v) setTimeout(beep, 0)
      return !v
    })
  }, [beep])
  return { on, toggle, beep }
}

// ---- keep the screen awake: a kitchen display must not dim ----
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock = null
    let alive = true
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (!alive) lock.release()
      } catch { /* refused (battery saver): nothing to do */ }
    }
    const again = () => document.visibilityState === 'visible' && take()
    take()
    document.addEventListener('visibilitychange', again)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', again)
      lock?.release().catch(() => {})
    }
  }, [])
}

// ---- the restaurant's name for the title ----
export function useRestaurant() {
  const [name, setName] = useState('Oasys Restaurant')
  useEffect(() => {
    let alive = true
    fetchRestaurant().then((n) => alive && n && setName(n)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return name
}

// ---- light by default; the choice is remembered on this device ----
export function useKdsTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('kds-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem('kds-theme', next)
      } catch { /* private window */ }
      return next
    })
  }, [])
  return [theme, toggle]
}

// the clock in the title bar (shares the one-second ticker)
export const useClock = () => new Date(useNow())

// ---- waiter calls: every active call, kept live by the server's stream; acknowledge and finish update at once ----
export function useWaiterCalls() {
  const [calls, setCalls] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(false) // the live stream is connected
  const [error, setError] = useState('')
  const busy = useRef(new Set())

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCalls()
      setCalls((cur) => next.map((c) => (busy.current.has(c.id) ? cur.find((x) => x.id === c.id) || c : c)))
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(e.name === 'TimeoutError' ? 'The server is not answering.' : e.message || 'Could not load waiter calls.')
    }
  }, [])

  useEffect(() => {
    refresh()
    const es = new EventSource(WAITER_STREAM_URL) // reconnects by itself; each (re)connect starts with an event
    es.addEventListener('waiter', refresh)
    es.onopen = () => setOnline(true)
    es.onerror = () => setOnline(false)
    const poll = setInterval(refresh, 20000) // a safety net if the stream is blocked
    return () => {
      es.close()
      clearInterval(poll)
    }
  }, [refresh])

  // 'ack' ("on my way") keeps the call on the screen, marked; 'done' takes it off. Both move at once and move back if refused.
  const act = useCallback(async (id, kind, by, photo) => {
    let before = null
    busy.current.add(id)
    setCalls((cur) => {
      before = cur.find((c) => c.id === id) || null
      if (kind === 'release') {
        // back to open, nobody on it: the other waiters see it again
        return cur.map((c) => (c.id === id ? { ...c, status: 'open', acknowledged_by: null, acknowledged_photo: null, acknowledged_at: null, arrived_at: null, declined_by: [...new Set([...(c.declined_by || '').split(', ').filter(Boolean), by || c.acknowledged_by].filter(Boolean))].join(', ') || null } : c))
      }
      return kind === 'done' ? cur.filter((c) => c.id !== id) : cur.map((c) => (c.id === id ? { ...c, status: kind === 'arrive' ? 'arrived' : 'acknowledged', acknowledged_by: c.acknowledged_by || by || null, acknowledged_photo: c.acknowledged_photo || photo || null, acknowledged_at: c.acknowledged_at || new Date().toISOString() } : c))
    })
    try {
      await (kind === 'done' ? finishCall(id) : kind === 'release' ? releaseCall(id, by) : kind === 'arrive' ? arriveCall(id, by, photo) : acknowledgeCall(id, by, photo))
      setError('')
    } catch (e) {
      if (before) setCalls((cur) => (cur.some((c) => c.id === id) ? cur.map((c) => (c.id === id ? before : c)) : [...cur, before].sort((a, b) => a.id - b.id)))
      setError(`Could not update the call: ${e.message}`)
    } finally {
      busy.current.delete(id)
    }
  }, [])

  return { calls, loaded, online, error, clearError: () => setError(''), acknowledge: (id, by, photo) => act(id, 'ack', by, photo), arrive: (id, by, photo) => act(id, 'arrive', by, photo), release: (id, by) => act(id, 'release', by), finish: (id) => act(id, 'done') }
}

// ---- the waiter's own account: log in with a username and password, then the title, name and picture come from the
// server (the waiters table) and every change is saved there. A copy is kept on this device so the screen opens at once. ----
const TOKEN_KEY = 'waiter-token'
const PROFILE_KEY = 'waiter-profile'
const readSaved = (k) => {
  try {
    return localStorage.getItem(k) || ''
  } catch {
    return ''
  }
}
const writeSaved = (k, v) => {
  try {
    if (v) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  } catch { /* private window: it just isn't remembered */ }
}
const readProfile = () => {
  try {
    return JSON.parse(readSaved(PROFILE_KEY)) || null
  } catch {
    return null
  }
}
const WAITERS = '/api/oasys/waiters'
export function useWaiterName() {
  const [token, setToken] = useState(() => readSaved(TOKEN_KEY))
  const [profile, setProfileState] = useState(() => (readSaved(TOKEN_KEY) ? readProfile() : null))
  const [photoBusy, setPhotoBusy] = useState(false)
  const pending = useRef({}) // changes waiting to be sent to the server
  const timer = useRef(null)

  const setProfile = useCallback((p) => {
    setProfileState(p)
    writeSaved(PROFILE_KEY, p ? JSON.stringify(p) : '')
  }, [])
  const clear = useCallback(() => {
    clearTimeout(timer.current)
    pending.current = {}
    setToken('')
    writeSaved(TOKEN_KEY, '')
    setProfile(null)
  }, [setProfile])
  const call = useCallback(
    (method, path, tok, body) =>
      fetch(`${WAITERS}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(tok && { Authorization: `Bearer ${tok}` }) },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000),
      }),
    []
  )

  // on opening: check the saved login is still good and refresh the profile (another device may have changed it)
  useEffect(() => {
    if (!token) return
    call('GET', 'me', token)
      .then(async (r) => {
        if (r.status === 401) return clear()
        const j = await r.json()
        if (r.ok && j.waiter) setProfile(j.waiter)
      })
      .catch(() => {}) // offline: keep the saved copy
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // returns true, or a message to show (wrong password, too many tries, server not answering)
  const login = async (user, pass) => {
    try {
      const r = await call('POST', 'login', '', { username: user.trim(), password: pass })
      const j = await r.json()
      if (!r.ok || !j.token) return j.error || 'Wrong username or password.'
      setToken(j.token)
      writeSaved(TOKEN_KEY, j.token)
      setProfile(j.waiter)
      return true
    } catch {
      return 'The server is not answering.'
    }
  }
  const logout = () => {
    if (token) call('POST', 'logout', token).catch(() => {})
    clear()
  }

  // title, name and picture: shown at once, sent to the server a moment after the last change
  const save = (patch) => {
    setProfileState((cur) => {
      const next = { ...cur, ...patch }
      writeSaved(PROFILE_KEY, JSON.stringify(next))
      return next
    })
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const body = { ...pending.current }
      pending.current = {}
      if ('name' in body && !String(body.name).trim()) delete body.name // the server needs a name; the box may just be empty while typing
      if (!Object.keys(body).length) return
      try {
        const r = await call('PUT', 'me', token, body)
        if (r.status === 401) clear()
      } catch { /* offline: it stays on this screen and goes with the next change */ }
    }, 500)
  }

  // a new picture is saved on the server (in assets/waiters) and its short path kept on the account
  const setPhoto = async (dataUrl) => {
    setPhotoBusy(true)
    let value = dataUrl
    try {
      const r = await fetch('/api/oasys/waiter/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profile?.name || 'waiter', photo: dataUrl }) })
      const j = await r.json()
      if (r.ok && j.url) value = j.url
    } catch { /* offline: the picture stays on this screen only */ }
    if (value === dataUrl) setProfileState((cur) => ({ ...cur, photo: dataUrl })) // not saved on the account, but shown and sent with "On my way"
    else save({ photo: value })
    setPhotoBusy(false)
  }

  const name = profile?.name || ''
  const prefix = profile?.prefix || ''
  const full = name.trim() ? [prefix.trim(), name.trim()].filter(Boolean).join(' ') : '' // what is sent with "On my way" and what Greeny says
  return {
    username: profile?.username || '',
    name,
    prefix,
    photo: profile?.photo || '',
    photoBusy,
    setPhoto,
    full,
    loggedIn: !!token && !!profile,
    login,
    logout,
    setName: (v) => save({ name: v }),
    setPrefix: (v) => save({ prefix: v }),
  }
}

// ---- the Kitchen Display login: remembered on this device until Log out ----
const KDS_SESSION_KEY = 'kds-session'
export function useKdsLogin() {
  const [loggedIn, setLoggedIn] = useState(() => readSaved(KDS_SESSION_KEY) === '1')
  const store = (v) => {
    try {
      localStorage.setItem(KDS_SESSION_KEY, v ? '1' : '0')
    } catch { /* private window: it just isn't remembered */ }
  }
  const login = (user, pass) => {
    if (!checkKdsLogin(user, pass)) return false
    setLoggedIn(true)
    store(true)
    return true
  }
  const logout = () => {
    setLoggedIn(false)
    store(false)
  }
  return { loggedIn, login, logout }
}
