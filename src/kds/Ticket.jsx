import { memo } from 'react'
import { ageSeconds, formatAge, urgency } from './age.js'
import { useNow } from './hooks.js'
import StatusMenu from './StatusMenu.jsx'

const DIET_LABEL = { veg: 'Vegetarian', nonveg: 'Non-vegetarian', egg: 'Contains egg' }
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

// one round of an order: a coloured header (its colour is how long it has waited), the dishes, one button
function Ticket({ ticket, fresh, onMove }) {
  const now = useNow() // the shared clock: the timer and the header colour tick together
  const cooking = ticket.status === 'new' || ticket.status === 'preparing'
  const seconds = ageSeconds(ticket.created_at, now)
  const level = cooking ? urgency(seconds) : ticket.status === 'on_the_way' ? 'way' : 'done'
  const place = ticket.table_no ? `Table ${ticket.table_no}` : 'No table'
  const count = ticket.items.reduce((n, i) => n + i.quantity, 0)
  return (
    <article className={`kds-ticket${fresh ? ' fresh' : ''}`} data-level={level} aria-label={`${place}, round ${ticket.round_no}`}>
      <header>
        <div className="top">
          <h3>{place}</h3>
          <time className="age" title={level === 'late' ? 'Waiting over 20 minutes' : level === 'warn' ? 'Waiting over 10 minutes' : undefined}>
            {cooking ? formatAge(seconds) : ticket.status === 'served' ? 'Served' : ticket.status === 'on_the_way' ? 'On the way' : 'Ready'}
          </time>
        </div>
        <div className="meta">
          <span>#{ticket.id}</span>
          <span>Round {ticket.round_no}</span>
          <span>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <span className="at">{hhmm(ticket.created_at)}</span>
        </div>
      </header>
      {ticket.kitchen_note && (
        <p className="note">
          <small>Kitchen note</small>
          {ticket.kitchen_note}
        </p>
      )}
      <ul>
        {ticket.items.map((i, k) => (
          <li key={`${i.dish_id}-${k}`}>
            <span className="qty">{i.quantity}</span>
            <span className="name">
              <i className={`diet ${i.diet || ''}`} role="img" aria-label={DIET_LABEL[i.diet] || 'Diet not set'} />
              {i.name}
            </span>
            {i.note && <span className="req">{i.note}</span>}
          </li>
        ))}
      </ul>
      {ticket.status === 'on_the_way' && ticket.delivered_by && <p className="note"><small>Taking it to the table</small>{ticket.delivered_by}</p>}
      <div className="stage">
        <span className="stage-label">Status</span>
        <StatusMenu value={ticket.status} onChange={(v) => onMove(ticket.id, v)} label={`Status of ${place}, round ${ticket.round_no}`} />
      </div>
    </article>
  )
}

export default memo(Ticket)
