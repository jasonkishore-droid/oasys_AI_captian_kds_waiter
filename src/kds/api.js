// The Kitchen Display's calls to the ordering server (server/oasysApi.js).
const BASE = '/api/oasys/kitchen'
const TIMEOUT_MS = 8000

async function call(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS), ...init })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || `The server answered ${r.status}`)
  }
  return r.json()
}

// tickets still cooking, plus those bumped in the last 30 minutes
export const fetchBoard = async () => (await call('/board')).tickets

// status: 'ready' (bump) or 'new' (recall)
// extra: { by, photo } when a waiter collects a ready order (on_the_way): who is taking it to the table
export const setTicketStatus = (id, status, extra = {}) =>
  call('/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...(extra.by && { by: extra.by }), ...(extra.photo && { photo: extra.photo }) }) })

export const STREAM_URL = `${BASE}/stream`

// the restaurant's name, for the screen's title
export const fetchRestaurant = async () => {
  const r = await fetch('/api/oasys/ping', { signal: AbortSignal.timeout(TIMEOUT_MS) })
  return r.ok ? (await r.json()).restaurant || '' : ''
}

// ---- waiter calls (server/inventory/waiter.js) ----
const WAITER = '/api/oasys/waiter'
const waiterCall = async (path, init = {}) => {
  const r = await fetch(`${WAITER}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS), ...init })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `The server answered ${r.status}`)
  return r.json()
}
const postCall = (path, body) => waiterCall(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fetchCalls = async () => (await waiterCall('/calls')).calls
export const acknowledgeCall = (id, by, photo) => postCall('/ack', { id, by, ...(photo && { photo }) })
export const releaseCall = (id, by) => postCall('/release', { id, by })
export const arriveCall = (id, by, photo) => postCall('/arrive', { id, by, ...(photo && { photo }) })
export const finishCall = (id) => postCall('/done', { id })
export const WAITER_STREAM_URL = `${WAITER}/stream`
