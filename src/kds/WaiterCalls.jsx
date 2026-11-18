import { memo } from 'react'
import { ageSeconds, formatAge } from './age.js'
import { useNow } from './hooks.js'

// what the guest asked for (the reasons the call_waiter tool and the tablet button use)
const REASON = {
  help: ['Needs help', 'The guest would like someone to come over'],
  water: ['Water', 'Drinking water for the table'],
  bill: ['Bill, please', 'Ready to pay'],
  cutlery: ['Cutlery', 'Spoons, forks or napkins'],
  clean: ['Clean the table', 'The table needs wiping or clearing'],
  other: ['Something else', 'See the note'],
}

// how long a call may wait before it turns amber and then red
const WARN_S = 60
const LATE_S = 180
// the three steps, one after another: On my way -> On table 7 -> Done
const tableLabel = (t) => (/^table\b/i.test(String(t)) ? String(t) : `table ${t}`)

const Call = memo(function Call({ call, fresh, canAnswer, by, photo, onAck, onArrive, onRelease, onDone }) {
  const now = useNow()
  const seconds = ageSeconds(call.created_at, now)
  const arrived = call.status === 'arrived' // the waiter is at the table
  const coming = call.status === 'acknowledged' || arrived
  const level = coming ? 'coming' : seconds >= LATE_S ? 'late' : seconds >= WARN_S ? 'warn' : 'new'
  const [name, hint] = REASON[call.reason] || REASON.other
  const who = call.acknowledged_by && call.acknowledged_by !== 'Kitchen screen' ? call.acknowledged_by : ''
  return (
    <article className={`wc${fresh ? ' fresh' : ''}`} data-level={level} aria-label={`Table ${call.table_no} is calling: ${name}`}>
      <div className="wc-table">
        <small>Table</small>
        <strong style={{ fontSize: String(call.table_no).length <= 2 ? 34 : String(call.table_no).length === 3 ? 28 : 21 }}>{call.table_no}</strong>
      </div>
      <div className="wc-main">
        <div className="wc-top">
          <h3>{name}</h3>
          <time>{formatAge(seconds)}</time>
        </div>
        <p className="wc-hint">{hint}</p>
        <div className="wc-chips">
          {call.note && <span className="wc-note">“{call.note}”</span>}
          {call.repeats > 0 && <span className="wc-again">Called again ×{call.repeats}</span>}
          {call.declined_by && !coming && <span className="wc-again">{call.declined_by} could not attend</span>}
          <span className="wc-source">{call.source === 'voice' ? 'By voice' : 'By button'}</span>
        </div>
        <p className="wc-state">{arrived ? `${who || 'A waiter'} is at the table` : coming ? `${who || 'A waiter'} is on the way` : call.declined_by ? 'Waiting for another waiter' : 'Waiting for a waiter'}</p>
      </div>
      <div className="wc-action">
        {arrived ? (
          <button type="button" className="done" onClick={() => onDone(call.id)}>
            Done
          </button>
        ) : coming ? (
          <>
            <button type="button" className="arrive" onClick={() => onArrive(call.id, by, photo)}>
              On {tableLabel(call.table_no)}
            </button>
            <button type="button" className="decline" onClick={() => onRelease(call.id, by)} title="Hand this table back so another waiter can take it">
              Sorry, can&apos;t attend
            </button>
          </>
        ) : (
          <button type="button" className="go" disabled={!canAnswer} onClick={() => onAck(call.id, by, photo)}>
            On my way
          </button>
        )}
      </div>
    </article>
  )
})

export default function WaiterCalls({ calls, loaded, fresh, onAck, onArrive, onRelease, onDone, duty }) {
  return (
    <div className="wc-page">
      {!loaded ? (
        <p className="kds-empty">Loading waiter calls…</p>
      ) : !calls.length ? (
        <p className="kds-empty">No tables are calling. A call appears here the moment a guest taps Call waiter.</p>
      ) : (
        <div className="wc-list">
          {calls.map((c) => (
            <Call key={c.id} call={c} fresh={fresh.has(c.id)} canAnswer={!!duty.full} by={duty.full} photo={duty.photo} onAck={onAck} onArrive={onArrive} onRelease={onRelease} onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  )
}
