import { memo } from 'react'
import { ageSeconds, formatAge } from './age.js'
import { useNow } from './hooks.js'

// Orders the kitchen has finished, for the waiters to carry to the table. "I'll collect" claims one (and tells the guest's
// tablet who is bringing it); "Served" closes it once it is on the table.
const tableLabel = (t) => (t ? (/^table\b/i.test(String(t)) ? String(t) : `Table ${t}`) : 'No table')

const Order = memo(function Order({ ticket, mine, name, photo, onCollect, onServe }) {
  const now = useNow()
  const out = ticket.status === 'on_the_way' // a waiter has collected it
  const seconds = ageSeconds(ticket.ready_at || ticket.created_at, now)
  const items = ticket.items.map((i) => `${i.quantity} × ${i.name}`)
  return (
    <article className="wc wo" data-level={out ? 'coming' : seconds >= 180 ? 'late' : seconds >= 60 ? 'warn' : 'new'} aria-label={`Order for ${tableLabel(ticket.table_no)} is ${out ? 'on the way' : 'ready'}`}>
      <div className="wc-table wo-table">
        <small>Order</small>
        <strong style={{ fontSize: ticketLabelLen(ticket) }}>{tableLabel(ticket.table_no)}</strong>
      </div>
      <div className="wc-main">
        <div className="wc-top">
          <h3>{out ? 'Order on the way' : `Order for ${tableLabel(ticket.table_no)} is ready`}</h3>
          <time>{formatAge(seconds)}</time>
        </div>
        <p className="wc-hint">
          Round {ticket.round_no} · {items.slice(0, 3).join(', ')}
          {items.length > 3 ? ` +${items.length - 3} more` : ''}
        </p>
        <p className="wc-state">{out ? `${ticket.delivered_by || 'A waiter'} is taking it to the table` : 'Waiting for a waiter to collect it'}</p>
      </div>
      <div className="wc-action">
        {out ? (
          <button type="button" className="done" onClick={() => onServe(ticket.id)}>
            Served
          </button>
        ) : (
          <button type="button" className="go" disabled={!name} onClick={() => onCollect(ticket.id, name, photo)}>
            I&apos;ll collect
          </button>
        )}
      </div>
    </article>
  )
})
const ticketLabelLen = (t) => {
  const n = tableLabel(t.table_no).length
  return n <= 7 ? 22 : n <= 10 ? 18 : 14
}

export default function WaiterOrders({ tickets, duty, onCollect, onServe }) {
  if (!tickets.length) return null
  return (
    <section className="wo-section" aria-label="Orders to serve">
      <h2 className="wo-title">Orders to serve <span>{tickets.length}</span></h2>
      <div className="wc-list">
        {tickets.map((t) => (
          <Order key={t.id} ticket={t} mine={!!duty.full && t.delivered_by === duty.full} name={duty.full} photo={duty.photo} onCollect={onCollect} onServe={onServe} />
        ))}
      </div>
    </section>
  )
}
