// The ordering API behind Greeny's voice ordering tools (get_menu, place_order, confirm_order,
// send_receipt, print_receipt). The browser calls /api/oasys/*.
//
// Menu, orders and e-receipts are answered here, by the inventory code in server/inventory,
// working straight on the Stock Management database: no second server or API key needed.
// Printing still goes through the Stock Management app, because its Bluetooth printer is
// reached from that app's signed-in browser tab; those calls are relayed to
// INVENTORY_API_URL/api/integrations/* with the shared ORDER_API_KEY.
//
//   GET  /api/oasys/menu/stream   (server-sent events: a "menu" event whenever stock or the till changes what is sold out)
//   GET  /api/oasys/ping   GET /api/oasys/menu?search=&section=&diet=&filter=&avoid=   POST /api/oasys/orders
//   GET  /api/oasys/orders?since_id=   (paid bills after an id: the kitchen ticket feed)
//   POST /api/oasys/orders/email { bill_no, to }   (e-receipt after the guest confirmed the address)
//   Open tabs (a table's dining session: order in rounds, pay once at the end):
//   GET  /api/oasys/tab?session_id= | ?table_no=        POST /api/oasys/tab/add { session_id?, table_no, items }
//   POST /api/oasys/tab/close { session_id, payment_mode, customer_email? }   POST /api/oasys/tab/cancel { session_id }
//   GET  /api/oasys/kitchen?since_id=   (each round as it is ordered, with its table)
//   POST /api/oasys/print-test   POST /api/oasys/print-receipt { bill_no }   GET /api/oasys/print-jobs/:id
//   GET  /api/oasys/printer   (is the Bluetooth printer connected in a Stock Management tab?)
//   Call waiter (server/inventory/waiter.js; needs only the tabs database, not the till's):
//   POST /api/oasys/waiter/call { table_no, reason?, note? }   GET /api/oasys/waiter?table_no=
//   POST /api/oasys/waiter/cancel { id } | { table_no }   GET /api/oasys/waiter/calls (staff screen)
//   POST /api/oasys/waiter/ack { id, by? }   POST /api/oasys/waiter/arrive { id, by? }   POST /api/oasys/waiter/done { id }
//   POST /api/oasys/waiter/photo { name?, photo }   saves a waiter's profile picture in assets/waiters/ and returns { url }
//   GET  /assets/waiters/<file>                    that picture
//   Waiter accounts (server/inventory/waiters.js): POST /api/oasys/waiters/login { username, password }, GET|PUT /api/oasys/waiters/me, POST /api/oasys/waiters/logout
//   Feedback after payment (server/inventory/feedback.js; tabs database only):
//   POST /api/oasys/feedback { bill_no, rating, liked?, improve?, comment? }   GET /api/oasys/feedback?since_id=&limit=
import { inventoryConfig } from './inventory/config.js'
import { inventoryApi } from './inventory/orders.js'
import { openStore } from './inventory/store.js'
import { openTabs } from './inventory/tabs.js'
import { waiterApi } from './inventory/waiter.js'
import { waitersApi } from './inventory/waiters.js'
import { feedbackApi } from './inventory/feedback.js'
import { dietarySource } from './inventory/dietary.js'
import { PHOTO_URL_PREFIX, readPhoto, savePhoto } from './waiterPhotos.js'

const LOCAL = /^\/api\/oasys\/(ping|menu|upi|orders|orders\/email|tab|tab\/add|tab\/close|tab\/cancel|kitchen|kitchen\/board|kitchen\/status)$/
const WAITER = /^\/api\/oasys\/waiter(?:\/(call|cancel|calls|ack|arrive|release|done))?$/
const FEEDBACK = /^\/api\/oasys\/feedback$/
const PRINT = /^\/api\/oasys\/(printer|print-test|print-receipt|print-jobs\/\d+)$/

function readBody(req, max = 20_000) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > max) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function oasysRoutes(env) {
  const config = inventoryConfig(env)
  let api = null
  let tabs = null
  let waiter = null
  const getTabs = () => (tabs ??= openTabs(config.tabsFile))
  const getApi = () => (api ??= inventoryApi(openStore(config), config, getTabs(), dietarySource(config.menuCardDir))) // opened on first use
  const getWaiter = () => (waiter ??= waiterApi(getTabs())) // works without the till's database
  let waiters
  const getWaiters = () => (waiters ??= waitersApi(getTabs()))
  let feedback = null
  const getFeedback = () => (feedback ??= feedbackApi(getTabs()))

  // Live sold-out sync. Stock Management is a separate process writing the same database, so this
  // watches the menu for changes (cheap: one small read every 2 s, only while a tablet is listening)
  // and pushes a "menu" event whenever any dish's sold-out state or portions left changes.
  // The Kitchen Display Screen (kds.html) uses the same kind of stream for its tickets.
  // channel(event, stamp): a stream that sends `event` whenever stamp() returns something new.
  const channel = (event, stamp) => {
    const watchers = new Set()
    let timer = null
    let last = ''
    const frame = () => `event: ${event}\ndata: ${Date.now()}\n\n`
    const poll = () => {
      let now
      try {
        now = stamp()
      } catch {
        return // the database is busy or missing for a moment: the next tick tries again
      }
      if (now === last) return
      last = now
      for (const w of watchers) w.write(frame())
    }
    return (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      res.write('retry: 3000\n: connected\n\n')
      if (!watchers.size) {
        try { last = stamp() } catch { last = '' }
        timer = setInterval(poll, 2000)
      }
      res.write(frame()) // the first event: "load it now"
      watchers.add(res)
      const beat = setInterval(() => res.write(': ping\n\n'), 20000)
      req.on('close', () => {
        clearInterval(beat)
        watchers.delete(res)
        if (!watchers.size) clearInterval(timer)
      })
    }
  }
  const watchMenu = channel('menu', () => {
    const { dishes = [] } = getApi().menu({ all: '1' }).body
    return JSON.stringify(dishes.map((d) => [d.id, d.sold_out ? 1 : 0, d.portions_left]))
  })
  const watchKitchen = channel('kitchen', () => JSON.stringify(getApi().kitchenBoard().body.tickets.map((t) => [t.id, t.status])))
  // the staff screen's waiter calls: an event whenever a call is made, repeated, acknowledged, finished or cancelled
  const watchWaiter = channel('waiter', () => JSON.stringify(getWaiter().active().body.calls.map((c) => [c.id, c.status, c.repeats])))

  const base = (env.INVENTORY_API_URL || 'http://127.0.0.1:4020').replace(/\/+$/, '')
  const key = env.ORDER_API_KEY || ''
  const send = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }

  return async (req, res, next) => {
    const u = new URL(req.url || '', 'http://x')
    // a waiter's saved profile picture
    if (req.method === 'GET' && u.pathname.startsWith(PHOTO_URL_PREFIX)) {
      const p = readPhoto(u.pathname.slice(PHOTO_URL_PREFIX.length))
      if (!p) return send(res, 404, { error: 'Not found' })
      res.statusCode = 200
      res.setHeader('Content-Type', p.type)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // the file name carries a hash of the picture
      return res.end(p.bytes)
    }
    if (!u.pathname.startsWith('/api/oasys/')) return next()
    const query = Object.fromEntries(u.searchParams)
    if (req.method === 'GET' && u.pathname === '/api/oasys/menu/stream') return watchMenu(req, res)
    if (req.method === 'GET' && u.pathname === '/api/oasys/kitchen/stream') return watchKitchen(req, res)
    if (req.method === 'GET' && u.pathname === '/api/oasys/waiter/stream') return watchWaiter(req, res)
    try {
      // waiter accounts: log in, read or edit the profile, log out. The profile calls need the token from login.
      const wa = u.pathname.match(/^\/api\/oasys\/waiters\/(login|me|logout)$/)
      if (wa) {
        const what = wa[1]
        const method = req.method
        const allowed = { login: ['POST'], me: ['GET', 'PUT'], logout: ['POST'] }[what]
        if (!allowed.includes(method)) return send(res, 405, { error: `Use ${allowed.join(' or ')}` })
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
        let body = {}
        if (method !== 'GET') {
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch (e) {
            if (e.status) throw e
            return send(res, 400, { error: 'Request body is not valid JSON' })
          }
        }
        const a = getWaiters()
        const r = what === 'login' ? a.login(body) : what === 'logout' ? a.logout(token) : method === 'PUT' ? a.update(token, body) : a.me(token)
        return send(res, r.status, r.body)
      }
      if (req.method === 'POST' && u.pathname === '/api/oasys/waiter/photo') {
        let body
        try {
          body = JSON.parse((await readBody(req, 80_000)) || '{}')
        } catch (e) {
          if (e.status) throw e
          return send(res, 400, { error: 'Request body is not valid JSON' })
        }
        return send(res, 201, { ok: true, ...savePhoto(body) })
      }
      const w = u.pathname.match(WAITER)
      if (w) {
        const what = w[1] || 'status'
        const post = req.method === 'POST'
        if (post !== ['call', 'cancel', 'ack', 'arrive', 'release', 'done'].includes(what)) return send(res, 405, { error: post ? 'Use GET' : 'Use POST' })
        let body = {}
        if (post) {
          try {
            body = JSON.parse((await readBody(req, 80_000)) || '{}') // room for the waiter's small profile picture on "ack"
          } catch (e) {
            if (e.status) throw e
            return send(res, 400, { error: 'Request body is not valid JSON' })
          }
        }
        const a = getWaiter()
        const r = what === 'status' ? a.status(query) : what === 'calls' ? a.active() : a[what](body)
        return send(res, r.status, r.body)
      }

      if (FEEDBACK.test(u.pathname)) {
        if (req.method !== 'POST') return send(res, 200, getFeedback().list(query).body)
        let body
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch (e) {
          if (e.status) throw e
          return send(res, 400, { error: 'Request body is not valid JSON' })
        }
        const r = getFeedback().save(body)
        return send(res, r.status, r.body)
      }

      const local = u.pathname.match(LOCAL)
      if (local) {
        const what = local[1]
        const post = req.method === 'POST'
        let body = {}
        if (post) {
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch (e) {
            if (e.status) throw e
            return send(res, 400, { error: 'Request body is not valid JSON' })
          }
        }
        const a = getApi()
        const r =
          what === 'ping' ? a.ping()
          : what === 'menu' ? (query.filter || query.avoid ? await a.dietaryMenu(query) : a.menu(query))
          : what === 'upi' ? a.upi()
          : what === 'orders' ? (post ? a.placeOrder(body) : a.ordersSince(query))
          : what === 'tab' ? a.tab(query)
          : what === 'kitchen' ? a.kitchen(query)
          : what === 'kitchen/board' ? a.kitchenBoard()
          : what === 'kitchen/status' && post ? a.kitchenStatus(body)
          : !post ? { status: 405, body: { error: 'Use POST' } }
          : what === 'tab/add' ? a.tabAdd(body)
          : what === 'tab/close' ? a.tabClose(body)
          : what === 'tab/cancel' ? a.tabCancel(body)
          : post ? await a.emailReceipt(body)
          : { status: 405, body: { error: 'Use POST' } }
        return send(res, r.status, r.body)
      }

      const print = u.pathname.match(PRINT)
      if (!print) return send(res, 404, { error: 'Not found' })
      if (!key) return send(res, 503, { error: 'Printing goes through the Stock Management app: set ORDER_API_KEY in this app\'s .env' })
      const body = req.method === 'POST' ? await readBody(req) : undefined
      try {
        const r = await fetch(`${base}/api/integrations/${print[1]}${u.search}`, {
          method: req.method,
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        return send(res, r.status, await r.text())
      } catch {
        return send(res, 502, { error: `Cannot reach the Stock Management app at ${base} for printing. Is it running?` })
      }
    } catch (e) {
      if (e.status) return send(res, e.status, { error: e.message, ...(e.details && { details: e.details }) })
      console.error('[inventory]', e)
      return send(res, 500, { error: 'The inventory could not handle that request' })
    }
  }
}
