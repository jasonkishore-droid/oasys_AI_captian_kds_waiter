// Waiter accounts (the floor staff who answer "Call waiter"): a username and password to log in, and the profile the
// guest sees when they are on the way: title, name and picture. Kept in the tabs database (tabs.js).
//
//   POST /api/oasys/waiters/login  { username, password }              -> { ok, token, waiter }
//   GET  /api/oasys/waiters/me                                         -> { ok, waiter }          (Authorization: Bearer <token>)
//   PUT  /api/oasys/waiters/me     { prefix?, name?, photo? }          -> { ok, waiter }          (same header)
//   POST /api/oasys/waiters/logout                                     -> { ok }                  (same header)
//
// Passwords are stored as a salted scrypt hash, never as text. A login returns a random session token that the
// waiter's screen keeps; it is checked on every profile call. Five wrong passwords for one username lock it for a minute.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { InventoryError } from './store.js'

export const WAITER_PREFIXES = ['', 'Mr.', 'Mrs.', 'Ms.']
const PHOTO_PATH = /^\/assets\/waiters\/[a-z0-9-]{1,40}-[0-9a-f]{8}\.(jpg|png|webp)$/
const NAME_MAX = 24
const MAX_FAILS = 5
const LOCK_MS = 60_000

const bad = (msg, status = 400) => {
  throw new InventoryError(status, msg)
}

export const hashPassword = (password) => {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(String(password), salt, 32).toString('hex')}`
}
export const checkPassword = (password, stored) => {
  const [kind, saltHex, hashHex] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false
  const want = Buffer.from(hashHex, 'hex')
  const got = scryptSync(String(password), Buffer.from(saltHex, 'hex'), want.length)
  return got.length === want.length && timingSafeEqual(got, want)
}

const cleanName = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s) bad('name is required')
  if (s.length > NAME_MAX) bad(`name: at most ${NAME_MAX} characters`)
  return s
}

// what the waiter's screen and the guest's tablet may see: never the hash
export const waiterView = (w) => w && { id: w.id, username: w.username, prefix: w.prefix || '', name: w.name, photo: w.photo || '' }

// add (or replace the password and profile of) an account: used by the first-run seed and by `npm run waiter:add`
export function addWaiter(tabs, { username, password, name, prefix = '', photo = '' }) {
  const u = String(username || '').trim()
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(u)) bad('username: 2 to 32 letters, digits, dots, dashes or underscores')
  if (String(password || '').length < 4) bad('password: at least 4 characters')
  if (!WAITER_PREFIXES.includes(prefix)) bad('title: Mr., Mrs. or Ms.')
  return tabs.saveWaiter({ username: u, password_hash: hashPassword(password), prefix, name: cleanName(name || u), photo: photo || '' })
}

export function waitersApi(tabs) {
  const ok = (body, status = 200) => ({ status, body })
  const fails = new Map() // username (lower case) -> { n, until }

  // the first account, so a new database can log in. Change the password with `npm run waiter:add`.
  if (!tabs.waiterCount()) addWaiter(tabs, { username: 'Shankar', password: 's123', name: 'Shankar', prefix: 'Mr.' })

  const who = (token) => {
    const w = token ? tabs.waiterBySession(String(token)) : null
    if (!w || !w.active) bad('Please log in again.', 401)
    return w
  }

  return {
    login(body = {}) {
      const username = String(body.username || '').trim()
      const key = username.toLowerCase()
      const f = fails.get(key)
      if (f && f.n >= MAX_FAILS && Date.now() < f.until) bad('Too many wrong passwords. Try again in a minute.', 429)
      const w = username ? tabs.waiterByUsername(username) : null
      // the hash check also runs for an unknown username, so a wrong name and a wrong password take the same time
      const good = checkPassword(body.password, w?.password_hash ?? 'scrypt$00$00') && !!w && !!w.active
      if (!good) {
        const n = (f && Date.now() < f.until ? f.n : 0) + 1
        fails.set(key, { n, until: Date.now() + LOCK_MS })
        bad('Wrong username or password.', 401)
      }
      fails.delete(key)
      return ok({ ok: true, token: tabs.createWaiterSession(w.id), waiter: waiterView(w) })
    },

    me: (token) => ok({ ok: true, waiter: waiterView(who(token)) }),

    update(token, body = {}) {
      const w = who(token)
      const patch = {}
      if (body.name !== undefined) patch.name = cleanName(body.name)
      if (body.prefix !== undefined) {
        if (!WAITER_PREFIXES.includes(body.prefix)) bad('title: Mr., Mrs. or Ms.')
        patch.prefix = body.prefix
      }
      if (body.photo !== undefined) {
        if (body.photo !== '' && !PHOTO_PATH.test(String(body.photo))) bad('photo: must be a picture saved in assets/waiters')
        patch.photo = String(body.photo)
      }
      return ok({ ok: true, waiter: waiterView(tabs.updateWaiter(w.id, patch)) })
    },

    logout(token) {
      if (token) tabs.deleteWaiterSession(String(token))
      return ok({ ok: true })
    },
  }
}
