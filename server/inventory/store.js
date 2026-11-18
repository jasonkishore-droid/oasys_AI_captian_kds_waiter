// The inventory's menu, stock and billing, ported from Stock Management (server/src/services)
// to work straight on its SQLite database with node:sqlite. A bill placed here is the same as
// one rung up on the till: priced from the database, numbered gap-free per financial year, and
// its recipe ingredients deducted from stock, all in one transaction.
//
// The till keeps running against the same file. SQLite's WAL mode lets both read at once, and
// BEGIN IMMEDIATE plus a busy timeout makes the two writers take turns.
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { computeTotals, financialYear, formatBillNo, round2, round3 } from './billing.js'

export class InventoryError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    if (details) this.details = details
  }
}

const bool = (v) => v === true || v === 1 || v === '1'
const marks = (n) => Array(n).fill('?').join(', ')

export function openStore(config) {
  if (!existsSync(config.dbFile)) {
    throw new InventoryError(503, `The inventory database was not found at ${config.dbFile}. Run "npm run setup" in Stock Management, or set INVENTORY_DB.`)
  }
  const db = new DatabaseSync(config.dbFile)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')

  const all = (sql, ...p) => db.prepare(sql).all(...p)
  const get = (sql, ...p) => db.prepare(sql).get(...p) ?? null
  const run = (sql, ...p) => db.prepare(sql).run(...p)

  // Restaurant-local calendar date, so "today" means today in the restaurant's timezone.
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const businessDate = (d = new Date()) => dayFmt.format(d)

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  // ---- menu ----
  function recipesFor(dishIds) {
    const where = dishIds ? `WHERE r.dish_id IN (${marks(dishIds.length)})` : ''
    const rows = dishIds && !dishIds.length ? [] : all(
      `SELECT r.dish_id, r.ingredient_id, r.quantity, i.name, i.unit, i.quantity AS on_hand, i.avg_cost
       FROM recipe_lines r JOIN ingredients i ON i.id = r.ingredient_id ${where} ORDER BY r.id`,
      ...(dishIds || [])
    )
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.dish_id)) map.set(r.dish_id, [])
      map.get(r.dish_id).push({
        ingredient_id: r.ingredient_id, name: r.name, unit: r.unit,
        quantity: Number(r.quantity), on_hand: Number(r.on_hand), avg_cost: Number(r.avg_cost),
      })
    }
    return map
  }

  // How many portions the current stock can still make (limited by the scarcest ingredient).
  function portionsLeft(recipe = []) {
    let portions = null
    for (const r of recipe) {
      if (r.quantity <= 0) continue
      const can = Math.max(0, Math.floor(r.on_hand / r.quantity + 1e-9))
      if (portions === null || can < portions) portions = can
    }
    return portions // null = no recipe, so not stock-tracked
  }

  function listDishes() {
    const rows = all(
      `SELECT d.*, s.name AS section FROM dishes d JOIN menu_sections s ON s.id = d.section_id
       WHERE d.active = 1 ORDER BY s.sort_order, d.sort_order, d.name`
    )
    const recipes = recipesFor()
    return rows.map((d) => ({
      id: d.id, section: d.section, name: d.name, price: Number(d.price), diet: d.diet,
      description: d.description, available: bool(d.available), portions: portionsLeft(recipes.get(d.id)),
    }))
  }

  // ---- stock: the only code here that changes ingredient quantities, always with a ledger row ----
  // use: ingredient id -> amount to take off (a negative amount puts it back). type/refType/refId/note go on the ledger row.
  function applyUse(use, { type = 'sale', refType = 'bill', refId, note, at }) {
    const day = businessDate(new Date(at))
    for (const [ingredientId, q] of use) {
      const delta = round3(-q)
      if (delta === 0) continue
      const before = get('SELECT id, name, unit, quantity, avg_cost FROM ingredients WHERE id = ?', ingredientId)
      if (!before) throw new InventoryError(400, `Ingredient ${ingredientId} not found`)
      run('UPDATE ingredients SET quantity = ROUND(quantity + ?, 3), updated_at = ? WHERE id = ?', delta, at, ingredientId)
      const balance = Number(get('SELECT quantity FROM ingredients WHERE id = ?', ingredientId).quantity)
      if (delta < 0 && balance < 0 && !config.billing.allowNegativeStock) {
        throw new InventoryError(409, `Not enough ${before.name}: need ${round3(-delta)} ${before.unit}, have ${round3(before.quantity)} ${before.unit}`)
      }
      run(
        `INSERT INTO stock_movements (ingredient_id, type, quantity, balance_after, unit_cost, ref_type, ref_id, note, user_id, business_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        ingredientId, type, delta, balance, Number(before.avg_cost), refType, refId, note, day, at
      )
    }
  }
  const applySale = (use, { billId, billNo, at }) => applyUse(use, { type: 'sale', refType: 'bill', refId: billId, note: billNo, at })

  // the kitchen started a round (Preparing): its recipe ingredients come off the shelf now, not when the tab is paid.
  // reverse: true puts them back (the ticket was recalled to New). The ledger rows are ref_type 'round'.
  function roundStock(items, { roundId, note, reverse = false }) {
    const lines = new Map()
    for (const l of items) lines.set(l.dish_id, (lines.get(l.dish_id) || 0) + l.quantity)
    const ids = [...lines.keys()]
    if (!ids.length) return
    const at = new Date().toISOString()
    transaction(() => {
      const recipes = recipesFor(ids)
      const use = new Map()
      for (const [dishId, q] of lines) {
        for (const r of recipes.get(dishId) || []) use.set(r.ingredient_id, (use.get(r.ingredient_id) || 0) + r.quantity * q * (reverse ? -1 : 1))
      }
      applyUse(use, { type: reverse ? 'void' : 'sale', refType: 'round', refId: roundId, note, at })
    })
  }

  // ---- bills ----
  function nextNumber(name) {
    run('INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING', name)
    return Number(get('UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value', name).value)
  }

  function peekNextBillNo(at = new Date()) {
    const fy = financialYear(businessDate(at))
    const row = get('SELECT value FROM counters WHERE name = ?', `bill:${fy}`)
    return formatBillNo(config.billing.prefix, fy, Number(row?.value || 0) + 1)
  }

  const MONEY = ['subtotal', 'discount', 'service_rate', 'service_charge', 'taxable', 'tax_rate', 'cgst', 'sgst', 'round_off', 'total', 'food_cost']
  function getBill(id) {
    const b = get(
      `SELECT b.*, u.name AS cashier, v.name AS voided_by_name FROM bills b
       LEFT JOIN users u ON u.id = b.created_by LEFT JOIN users v ON v.id = b.voided_by WHERE b.id = ?`,
      id
    )
    if (!b) return null
    const bill = { ...b }
    for (const k of MONEY) if (bill[k] !== undefined && bill[k] !== null) bill[k] = Number(bill[k])
    bill.tax = round2(bill.cgst + bill.sgst)
    const items = all('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', id).map((l) => ({
      ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), line_total: Number(l.line_total), cost: Number(l.cost),
    }))
    return { ...bill, items }
  }

  function getBillByNo(billNo) {
    const row = get('SELECT id FROM bills WHERE bill_no = ?', billNo)
    return row ? getBill(row.id) : null
  }

  /**
   * order: { items: [{ dish_id, quantity }], order_type, table_no, customer, customer_phone,
   *          customer_email, payment_mode }  (already checked by the caller)
   * returns the new bill id
   */
  // tab: true closes an open tab, whose dishes were checked when they were ordered and may have
  // been marked unavailable since (they were eaten all the same), so that check is skipped
  // taken: dish id -> portions whose ingredients the kitchen already took off the shelf (see roundStock): not taken again here
  function createBill(order, { source = 'ai-captain', tab = false, taken = new Map() } = {}) {
    const at = new Date().toISOString()
    const day = businessDate(new Date(at))
    const fy = financialYear(day)
    const qty = new Map()
    for (const l of order.items) qty.set(l.dish_id, (qty.get(l.dish_id) || 0) + l.quantity)
    const ids = [...qty.keys()]

    return transaction(() => {
      const dishes = all(`SELECT id, name, price, diet, available, active FROM dishes WHERE id IN (${marks(ids.length)})`, ...ids)
      const byId = new Map(dishes.map((d) => [d.id, d]))
      for (const id of ids) {
        const d = byId.get(id)
        if (!d || !bool(d.active)) throw new InventoryError(400, `Dish ${id} is not on the menu`)
        if (!tab && !bool(d.available)) throw new InventoryError(409, `${d.name} is marked unavailable today`)
      }
      const recipes = recipesFor(ids)
      const lines = ids.map((id) => {
        const d = byId.get(id)
        const q = qty.get(id)
        const unitCost = (recipes.get(id) || []).reduce((s, r) => s + r.quantity * r.avg_cost, 0)
        return { dish_id: id, name: d.name, diet: d.diet, quantity: q, unit_price: Number(d.price), line_total: round2(q * Number(d.price)), cost: round2(q * unitCost) }
      })
      const serviceRate = config.billing.serviceRate
      const t = computeTotals(lines.map((l) => l.line_total), { service_rate: serviceRate, tax_rate: config.billing.taxRate })
      const billNo = formatBillNo(config.billing.prefix, fy, nextNumber(`bill:${fy}`))

      const { id } = get(
        `INSERT INTO bills (bill_no, financial_year, business_date, status, source, order_type, table_no, customer, customer_phone,
           customer_email, payment_mode, subtotal, discount, service_rate, service_charge, taxable, tax_rate, cgst, sgst,
           round_off, total, food_cost, note, created_by, created_at)
         VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?) RETURNING id`,
        billNo, fy, day, source, order.order_type, order.table_no, order.customer, order.customer_phone,
        order.customer_email, order.payment_mode, t.subtotal, t.discount, serviceRate, t.service_charge, t.taxable,
        config.billing.taxRate, t.cgst, t.sgst, t.round_off, t.total, round2(lines.reduce((s, l) => s + l.cost, 0)), at
      )
      const insertLine = db.prepare(
        'INSERT INTO bill_items (bill_id, dish_id, name, diet, quantity, unit_price, line_total, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      for (const l of lines) insertLine.run(id, l.dish_id, l.name, l.diet, l.quantity, l.unit_price, l.line_total, l.cost)

      // sum recipe usage per ingredient, then take it off the shelf
      const use = new Map()
      for (const l of lines) {
        const left = l.quantity - (taken.get(l.dish_id) || 0)
        if (left <= 0) continue
        for (const r of recipes.get(l.dish_id) || []) use.set(r.ingredient_id, (use.get(r.ingredient_id) || 0) + r.quantity * left)
      }
      applySale(use, { billId: id, billNo, at })
      return id
    })
  }

  function markEmailed(billId, to) {
    run('UPDATE bills SET customer_email = ?, emailed_at = ? WHERE id = ?', to, new Date().toISOString(), billId)
  }

  // Paid bills after an id, with their lines (the kitchen ticket feed).
  function ordersSince(sinceId) {
    const bills = all(
      `SELECT id, bill_no, order_type, table_no, source, note, created_at FROM bills
       WHERE id > ? AND status = 'paid' ORDER BY id LIMIT 50`,
      sinceId
    )
    const items = bills.length
      ? all(`SELECT bill_id, dish_id, name, diet, quantity FROM bill_items WHERE bill_id IN (${marks(bills.length)})`, ...bills.map((b) => b.id))
      : []
    return {
      orders: bills.map((b) => ({ ...b, items: items.filter((i) => i.bill_id === b.id).map(({ bill_id, ...i }) => i) })),
      last_id: bills.length ? bills[bills.length - 1].id : sinceId,
    }
  }

  // The UPI collection settings the till stores (Stock Management > Settings): the payee's ID and name.
  function getUpi() {
    try {
      const row = get("SELECT value FROM app_settings WHERE key = 'upi'")
      const v = row ? JSON.parse(row.value) : {}
      const id = String(v.upi_id || '').trim()
      return { enabled: !!v.enabled && !!id, upi_id: id, payee_name: String(v.payee_name || '').trim() }
    } catch {
      return { enabled: false, upi_id: '', payee_name: '' } // an older database without the settings table
    }
  }

  return { getUpi, listDishes, roundStock, createBill, getBill, getBillByNo, peekNextBillNo, markEmailed, ordersSince, close: () => db.close() }
}
