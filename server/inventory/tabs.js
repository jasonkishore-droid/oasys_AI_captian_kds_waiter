// Open tabs: a table's dining session, kept open while the guests eat.
//
// Each time the guests order (starters, then mains, then dessert, then tea) the items are added
// to the session as a new round and go to the kitchen feed straight away. Nothing is billed or
// taken out of stock until the tab is closed: then one bill is made for everything, in the
// Stock Management database, and paid in one go.
//
// The tabs live in The Captain's own database (data/tabs.sqlite3), not the till's, so the
// till's schema is untouched. A session is either open, closed (billed) or void (closed with
// nothing on it).
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { InventoryError } from './store.js'

export const KITCHEN_STAGES = ['new', 'preparing', 'ready', 'on_the_way', 'served']

export function openTabs(file) {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_no TEXT,
      customer TEXT,
      status TEXT NOT NULL DEFAULT 'open',           -- open | closed | void
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      payment_mode TEXT,
      bill_id INTEGER,
      bill_no TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_status ON sessions (status);
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions (id),
      round_no INTEGER NOT NULL,
      items TEXT NOT NULL,                            -- JSON: [{ dish_id, name, diet, quantity, unit_price, line_total }]
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rounds_session ON rounds (session_id);
  `)
  // a special request for the whole round ("serve the starters first"); added to older databases too.
  // Requests for one dish ride on its line in items: { ..., note: 'less oil' }.
  if (!db.prepare('PRAGMA table_info(rounds)').all().some((c) => c.name === 'note')) db.exec('ALTER TABLE rounds ADD COLUMN note TEXT')
  // the kitchen's view of a round: new (just in) -> preparing -> ready -> served
  if (!db.prepare('PRAGMA table_info(rounds)').all().some((c) => c.name === 'kitchen_status')) {
    db.exec("ALTER TABLE rounds ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'new'")
    db.exec('ALTER TABLE rounds ADD COLUMN ready_at TEXT')
  }
  // "Call waiter" alerts from the tables (see waiter.js). A table has at most one active call:
  // open (waiting), acknowledged (a waiter is on the way) or arrived (the waiter is at the table). Calling again only bumps `repeats`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiter_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_no TEXT NOT NULL,
      session_id INTEGER,
      reason TEXT NOT NULL DEFAULT 'help',            -- help | water | bill | cutlery | clean | other
      note TEXT,
      source TEXT NOT NULL DEFAULT 'button',          -- button | voice
      status TEXT NOT NULL DEFAULT 'open',            -- open | acknowledged | arrived | done | cancelled
      repeats INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS waiter_calls_active ON waiter_calls (status, table_no);
  `)
  // the waiter's profile picture (a small data URL), sent with "on my way" so the guest's tablet can show who is coming
  if (!db.prepare('PRAGMA table_info(waiter_calls)').all().some((c) => c.name === 'acknowledged_photo')) db.exec('ALTER TABLE waiter_calls ADD COLUMN acknowledged_photo TEXT')
  if (!db.prepare('PRAGMA table_info(waiter_calls)').all().some((c) => c.name === 'arrived_at')) db.exec('ALTER TABLE waiter_calls ADD COLUMN arrived_at TEXT')
  // Waiter accounts and their login sessions (see waiters.js). The password is only ever stored as a salted hash.
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',                -- '' | Mr. | Mrs. | Ms.
      name TEXT NOT NULL,
      photo TEXT NOT NULL DEFAULT '',                 -- path of the picture in assets/waiters, e.g. /assets/waiters/ravi-1a2b3c4d.jpg
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waiter_sessions (
      token TEXT PRIMARY KEY,
      waiter_id INTEGER NOT NULL REFERENCES waiters(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
  `)
  // waiters who said "sorry, can't attend" (names, comma separated): the call goes back to open for the others
  if (!db.prepare('PRAGMA table_info(waiter_calls)').all().some((c) => c.name === 'declined_by')) db.exec('ALTER TABLE waiter_calls ADD COLUMN declined_by TEXT')
  // the kitchen took this round's ingredients off the shelf when it started it (so the till does not take them again,
  // and the portions on open tabs are not counted twice)
  if (!db.prepare('PRAGMA table_info(rounds)').all().some((c) => c.name === 'stock_taken')) db.exec('ALTER TABLE rounds ADD COLUMN stock_taken INTEGER NOT NULL DEFAULT 0')
  // the waiter who collected a ready order and is taking it to the table (set with the stage "on the way")
  if (!db.prepare('PRAGMA table_info(rounds)').all().some((c) => c.name === 'delivered_by')) {
    db.exec('ALTER TABLE rounds ADD COLUMN delivered_by TEXT')
    db.exec('ALTER TABLE rounds ADD COLUMN delivered_photo TEXT')
  }
  // Feedback after payment (see feedback.js): one row per bill, updated if the guest rates again
  // (e.g. taps the stars, then adds a comment by voice). No guest name or face is stored with it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT NOT NULL UNIQUE,
      session_id INTEGER,
      table_no TEXT,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      liked TEXT NOT NULL DEFAULT '[]',              -- JSON: ['food', 'service', ...]
      improve TEXT NOT NULL DEFAULT '[]',
      comment TEXT,
      source TEXT NOT NULL DEFAULT 'tap',             -- tap | voice
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  const get = (sql, ...p) => db.prepare(sql).get(...p) ?? null
  const all = (sql, ...p) => db.prepare(sql).all(...p)
  const run = (sql, ...p) => db.prepare(sql).run(...p)
  const now = () => new Date().toISOString()

  const roundsOf = (id) =>
    all('SELECT id, round_no, items, note, created_at, kitchen_status, delivered_by FROM rounds WHERE session_id = ? ORDER BY round_no', id).map((r) => ({
      id: r.id, round_no: r.round_no, created_at: r.created_at, items: JSON.parse(r.items), ...(r.note && { kitchen_note: r.note }),
      kitchen_status: r.kitchen_status, ...(r.delivered_by && { delivered_by: r.delivered_by }),
    }))

  function session(id) {
    const s = get('SELECT * FROM sessions WHERE id = ?', Number(id) || 0)
    return s ? { ...s, rounds: roundsOf(s.id) } : null
  }

  // the open session for a table, if any (a table has at most one open tab)
  function openFor(tableNo) {
    const s = tableNo ? get("SELECT id FROM sessions WHERE status = 'open' AND table_no = ? ORDER BY id DESC LIMIT 1", tableNo) : null
    return s ? session(s.id) : null
  }

  function open({ table_no = null, customer = null } = {}) {
    const existing = openFor(table_no)
    if (existing) return existing
    const { id } = get("INSERT INTO sessions (table_no, customer, status, opened_at) VALUES (?, ?, 'open', ?) RETURNING id", table_no, customer, now())
    return session(id)
  }

  function addRound(id, items, note = null) {
    const s = session(id)
    if (!s) throw new InventoryError(404, 'Tab not found')
    if (s.status !== 'open') throw new InventoryError(409, `This tab is already ${s.status === 'closed' ? 'closed and billed' : 'closed'}`)
    const n = (s.rounds.at(-1)?.round_no || 0) + 1
    run('INSERT INTO rounds (session_id, round_no, items, note, created_at) VALUES (?, ?, ?, ?, ?)', s.id, n, JSON.stringify(items), note || null, now())
    return session(s.id)
  }

  function close(id, { payment_mode, bill_id, bill_no }) {
    run("UPDATE sessions SET status = 'closed', closed_at = ?, payment_mode = ?, bill_id = ?, bill_no = ? WHERE id = ? AND status = 'open'",
      now(), payment_mode, bill_id, bill_no, id)
    return session(id)
  }

  function voidSession(id) {
    run("UPDATE sessions SET status = 'void', closed_at = ? WHERE id = ? AND status = 'open'", now(), id)
    return session(id)
  }

  // dish quantities on every open tab: ordered and cooked, but not out of stock until the tab closes
  // a round's lines and whether its stock is already taken, for the kitchen's stage changes
  function roundForStock(id) {
    const r = get('SELECT r.id, r.round_no, r.items, r.stock_taken, s.table_no FROM rounds r JOIN sessions s ON s.id = r.session_id WHERE r.id = ?', Number(id) || 0)
    return r && { id: r.id, round_no: r.round_no, table_no: r.table_no, stock_taken: !!r.stock_taken, items: JSON.parse(r.items) }
  }
  const setStockTaken = (id, on) => run('UPDATE rounds SET stock_taken = ? WHERE id = ?', on ? 1 : 0, id)
  // dish id -> portions of a tab whose stock the kitchen already took
  function takenFor(sessionId) {
    const out = new Map()
    for (const r of all('SELECT items FROM rounds WHERE session_id = ? AND stock_taken = 1', sessionId)) {
      for (const i of JSON.parse(r.items)) out.set(i.dish_id, (out.get(i.dish_id) || 0) + i.quantity)
    }
    return out
  }

  function reserved() {
    const out = new Map()
    for (const r of all("SELECT r.items FROM rounds r JOIN sessions s ON s.id = r.session_id WHERE s.status = 'open' AND r.stock_taken = 0")) {
      for (const i of JSON.parse(r.items)) out.set(i.dish_id, (out.get(i.dish_id) || 0) + i.quantity)
    }
    return out
  }

  // the kitchen feed (each round is a kitchen ticket): rounds after an id, with their table
  // and the guests' special requests, per dish (note) and for the whole round (kitchen_note)
  function roundsSince(sinceId) {
    const rows = all(
      `SELECT r.id, r.session_id, r.round_no, r.items, r.note, r.created_at, s.table_no, s.customer FROM rounds r
       JOIN sessions s ON s.id = r.session_id WHERE r.id > ? ORDER BY r.id LIMIT 50`,
      sinceId
    )
    return {
      rounds: rows.map(({ note, ...r }) => ({
        ...r,
        kitchen_note: note || null,
        items: JSON.parse(r.items).map(({ dish_id, name, diet, quantity, note }) => ({ dish_id, name, diet, quantity, note: note || null })),
      })),
      last_id: rows.length ? rows.at(-1).id : sinceId,
    }
  }

  // the Kitchen Display and the waiters' screen: tickets from the last 12 hours that are still cooking, plus those ready, on the way to the table or served in the last 3 hours
  // (a ready order stays until it is served, so a waiter can still collect it)
  function board() {
    const cut = (ms) => new Date(Date.now() - ms).toISOString()
    const rows = all(
      `SELECT r.id, r.session_id, r.round_no, r.items, r.note, r.created_at, r.kitchen_status AS status, r.ready_at, r.delivered_by, r.delivered_photo, s.table_no, s.customer
       FROM rounds r JOIN sessions s ON s.id = r.session_id
       WHERE s.status != 'void' AND r.created_at > ? AND (r.kitchen_status IN ('new', 'preparing') OR (r.kitchen_status IN ('ready', 'on_the_way', 'served') AND r.ready_at > ?)) ORDER BY r.id`,
      cut(12 * 3600e3), cut(3 * 3600e3)
    )
    return {
      tickets: rows.map(({ note, items, ...r }) => ({
        ...r,
        kitchen_note: note || null,
        items: JSON.parse(items).map(({ dish_id, name, diet, quantity, note }) => ({ dish_id, name, diet, quantity, note: note || null })),
      })),
    }
  }

  function setKitchenStatus(roundId, status, by = null, photo = null) {
    if (!KITCHEN_STAGES.includes(status)) throw new InventoryError(400, `status must be one of: ${KITCHEN_STAGES.join(', ')}`)
    // the time it became ready is kept when it goes out to the table or is served (it is hidden later), and cleared if it goes back to cooking
    const readyAt = status === 'ready' ? now() : status === 'on_the_way' || status === 'served' ? get('SELECT ready_at FROM rounds WHERE id = ?', roundId)?.ready_at || now() : null
    // who is taking it to the table: set when a waiter collects it (on the way), kept when it is served, cleared if it goes back
    const old = get('SELECT delivered_by, delivered_photo FROM rounds WHERE id = ?', roundId)
    const who = status === 'on_the_way' ? [by, photo] : status === 'served' ? [old?.delivered_by ?? null, old?.delivered_photo ?? null] : [null, null]
    const r = run('UPDATE rounds SET kitchen_status = ?, ready_at = ?, delivered_by = ?, delivered_photo = ? WHERE id = ?', status, readyAt, who[0], who[1], roundId)
    if (!r.changes) throw new InventoryError(404, 'Ticket not found')
  }

  // ---- waiter calls ----
  const ACTIVE = "status IN ('open', 'acknowledged', 'arrived')"
  const call = (id) => get('SELECT * FROM waiter_calls WHERE id = ?', Number(id) || 0)
  const activeCallFor = (tableNo) => get(`SELECT * FROM waiter_calls WHERE ${ACTIVE} AND table_no = ? ORDER BY id DESC LIMIT 1`, tableNo)

  // a new call, or the table's active one again (repeats + 1, reason and note updated if given)
  function callWaiter({ table_no, session_id = null, reason = 'help', note = null, source = 'button' }) {
    const t = now()
    const existing = activeCallFor(table_no)
    if (existing) {
      // a plain "help" again keeps the more specific reason ("water") already on the call
      run("UPDATE waiter_calls SET repeats = repeats + 1, reason = CASE WHEN ? = 'help' THEN reason ELSE ? END, note = COALESCE(?, note), updated_at = ? WHERE id = ?",
        reason, reason, note, t, existing.id)
      return { call: call(existing.id), repeated: true }
    }
    const { id } = get(
      `INSERT INTO waiter_calls (table_no, session_id, reason, note, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?) RETURNING id`,
      table_no, session_id, reason, note, source, t, t
    )
    return { call: call(id), repeated: false }
  }

  // open -> acknowledged (on my way) -> arrived (at the table) -> done; any active call -> cancelled (the guest no longer needs it).
  // A waiter may skip a step (open -> arrived, or any -> done).
  function setCallStatus(id, status, by = null, photo = null) {
    const c = call(id)
    if (!c) throw new InventoryError(404, 'Waiter call not found')
    if (c.status === status) return c
    const allowed = { acknowledged: ['open'], arrived: ['open', 'acknowledged'], done: ['open', 'acknowledged', 'arrived'], cancelled: ['open', 'acknowledged', 'arrived'] }[status]
    if (!allowed?.includes(c.status)) throw new InventoryError(409, `This call is already ${c.status}`)
    const t = now()
    if (status === 'acknowledged') run("UPDATE waiter_calls SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?, acknowledged_photo = ?, updated_at = ? WHERE id = ?", t, by, photo, t, c.id)
    else if (status === 'arrived') {
      // keeps who is coming (and their picture) from "on my way"; fills them in if the waiter skipped that step
      run("UPDATE waiter_calls SET status = 'arrived', arrived_at = ?, acknowledged_at = COALESCE(acknowledged_at, ?), acknowledged_by = COALESCE(acknowledged_by, ?), acknowledged_photo = COALESCE(acknowledged_photo, ?), updated_at = ? WHERE id = ?", t, t, by, photo, t, c.id)
    } else run('UPDATE waiter_calls SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?', status, t, t, c.id)
    return call(c.id)
  }

  // "Sorry, can't attend": a waiter who was on the way hands the call back. It goes back to open, with nobody on it, so the
  // other waiters see it again; the name is kept on the call so they can see who could not come.
  function releaseCall(id, by = null) {
    const c = call(id)
    if (!c) throw new InventoryError(404, 'Waiter call not found')
    if (c.status === 'open') return c
    if (c.status !== 'acknowledged') throw new InventoryError(409, c.status === 'arrived' ? 'The waiter is already at the table' : `This call is already ${c.status}`)
    const names = (c.declined_by || '').split(', ').filter(Boolean)
    const who = by || c.acknowledged_by
    if (who && !names.includes(who)) names.push(who)
    run("UPDATE waiter_calls SET status = 'open', acknowledged_at = NULL, acknowledged_by = NULL, acknowledged_photo = NULL, arrived_at = NULL, declined_by = ?, updated_at = ? WHERE id = ?", names.join(', ') || null, now(), c.id)
    return call(c.id)
  }

  // for the staff screen (KDS / floor view): every active call, oldest first
  const activeCalls = () => all(`SELECT * FROM waiter_calls WHERE ${ACTIVE} ORDER BY id`)

  // ---- waiter accounts ----
  const waiterCount = () => get('SELECT COUNT(*) AS n FROM waiters').n
  const waiterByUsername = (u) => get('SELECT * FROM waiters WHERE username = ?', String(u))
  const waiterById = (id) => get('SELECT * FROM waiters WHERE id = ?', Number(id) || 0)
  // a new account, or (same username) a new password and profile
  function saveWaiter({ username, password_hash, prefix, name, photo }) {
    const t = now()
    const old = waiterByUsername(username)
    if (old) run('UPDATE waiters SET password_hash = ?, prefix = ?, name = ?, photo = ?, active = 1, updated_at = ? WHERE id = ?', password_hash, prefix, name, photo || old.photo, t, old.id)
    else run('INSERT INTO waiters (username, password_hash, prefix, name, photo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', username, password_hash, prefix, name, photo, t, t)
    return waiterByUsername(username)
  }
  function updateWaiter(id, { name, prefix, photo }) {
    run('UPDATE waiters SET name = COALESCE(?, name), prefix = COALESCE(?, prefix), photo = COALESCE(?, photo), updated_at = ? WHERE id = ?', name ?? null, prefix ?? null, photo ?? null, now(), id)
    return waiterById(id)
  }
  function createWaiterSession(waiterId) {
    const token = randomBytes(24).toString('hex')
    run('INSERT INTO waiter_sessions (token, waiter_id, created_at) VALUES (?, ?, ?)', token, waiterId, now())
    run("DELETE FROM waiter_sessions WHERE created_at < datetime('now', '-30 days')") // sessions last 30 days
    return token
  }
  const waiterBySession = (token) => get('SELECT w.* FROM waiter_sessions s JOIN waiters w ON w.id = s.waiter_id WHERE s.token = ?', token)
  const deleteWaiterSession = (token) => run('DELETE FROM waiter_sessions WHERE token = ?', token)

  // ---- feedback ----
  const feedbackRow = (r) => r && { ...r, liked: JSON.parse(r.liked), improve: JSON.parse(r.improve) }
  const sessionByBill = (billNo) => get('SELECT id, table_no FROM sessions WHERE bill_no = ?', billNo)
  const feedbackFor = (billNo) => feedbackRow(get('SELECT * FROM feedback WHERE bill_no = ?', billNo))

  // save the rating for a bill; rating again replaces it, and a comment or tags left out are kept
  function saveFeedback({ bill_no, session_id, table_no, rating, liked, improve, comment, source }) {
    const t = now()
    run(
      `INSERT INTO feedback (bill_no, session_id, table_no, rating, liked, improve, comment, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (bill_no) DO UPDATE SET rating = excluded.rating,
         liked = CASE WHEN ? THEN excluded.liked ELSE liked END,
         improve = CASE WHEN ? THEN excluded.improve ELSE improve END,
         comment = COALESCE(excluded.comment, comment), source = excluded.source, updated_at = excluded.updated_at`,
      bill_no, session_id, table_no, rating, JSON.stringify(liked || []), JSON.stringify(improve || []), comment, source, t, t,
      liked ? 1 : 0, improve ? 1 : 0
    )
    return feedbackFor(bill_no)
  }

  // newest first, for the manager's dashboard (F14)
  const feedbackList = ({ sinceId = 0, limit = 100 } = {}) =>
    all('SELECT * FROM feedback WHERE id > ? ORDER BY id DESC LIMIT ?', sinceId, limit).map(feedbackRow)

  return {
    session, openFor, open, addRound, close, voidSession, reserved, roundForStock, setStockTaken, takenFor, roundsSince, board, setKitchenStatus,
    call, activeCallFor, callWaiter, setCallStatus, releaseCall, activeCalls,
    sessionByBill, feedbackFor, saveFeedback, feedbackList,
    waiterCount, waiterByUsername, waiterById, saveWaiter, updateWaiter, createWaiterSession, waiterBySession, deleteWaiterSession,
    shutdown: () => db.close(),
  }
}
