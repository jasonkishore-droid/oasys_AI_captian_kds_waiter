// Feedback and rating (F8): after the tab is paid, the guest rates the meal 1 to 5 stars (half stars
// allowed: the INTEGER column keeps 4.5 as a real, as SQLite does), picks what
// they liked or what could be better, and may leave a comment (by voice). One row per bill.
//
// Like orders.js, each handler takes the query or body and returns { status, body }.
// Only the tabs database is needed: the bill must be one closed through a tab on this app.
//
//   POST /api/oasys/feedback  { bill_no, rating, liked?, improve?, comment?, source? }  -> 201 new, 200 updated
//   GET  /api/oasys/feedback?since_id=&limit=   newest first, with the count and average (manager screens)
import { InventoryError } from './store.js'

export const FEEDBACK_TAGS = ['food', 'service', 'speed', 'value', 'ambience', 'cleanliness']
export const FEEDBACK_COMMENT_MAX = 500

const bad = (msg) => {
  throw new InventoryError(400, msg)
}
const text = (v, max, field) => {
  if (v === undefined || v === null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  if (s.length > max) bad(`${field}: at most ${max} characters`)
  return s || null
}
// undefined: not given (keep what is saved); otherwise a clean list of known tags
const tags = (v, field) => {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) bad(`${field}: a list of ${FEEDBACK_TAGS.join(', ')}`)
  const out = [...new Set(v.map((t) => String(t).toLowerCase().trim()))]
  const unknown = out.filter((t) => !FEEDBACK_TAGS.includes(t))
  if (unknown.length) bad(`${field}: unknown ${unknown.join(', ')} (use ${FEEDBACK_TAGS.join(', ')})`)
  return out
}

export function parseFeedback(b = {}) {
  const bill_no = text(b.bill_no, 16, 'bill_no') || bad('bill_no is required')
  const rating = Number(b.rating)
  if (!(rating >= 1 && rating <= 5 && Number.isInteger(rating * 2))) bad('rating is required: 1 to 5, in half steps (e.g. 4.5)')
  const source = b.source === undefined || b.source === null ? 'tap' : String(b.source)
  if (!['tap', 'voice'].includes(source)) bad('source: tap or voice')
  return {
    bill_no, rating, source,
    liked: tags(b.liked, 'liked'),
    improve: tags(b.improve, 'improve'),
    comment: text(b.comment, FEEDBACK_COMMENT_MAX, 'comment'),
  }
}

export function feedbackApi(tabs) {
  const ok = (body, status = 200) => ({ status, body })
  return {
    save(body = {}) {
      const f = parseFeedback(body)
      const s = tabs.sessionByBill(f.bill_no)
      if (!s) throw new InventoryError(404, 'No paid tab with that bill number')
      const existed = !!tabs.feedbackFor(f.bill_no)
      const saved = tabs.saveFeedback({ ...f, session_id: s.id, table_no: s.table_no })
      return ok({ ok: true, updated: existed, feedback: saved }, existed ? 200 : 201)
    },

    list(query = {}) {
      const sinceId = Math.max(0, Number(query.since_id) || 0)
      const limit = Math.min(500, Math.max(1, Number(query.limit) || 100))
      const rows = tabs.feedbackList({ sinceId, limit })
      const average = rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : null
      return ok({ ok: true, count: rows.length, average, feedback: rows })
    },
  }
}
