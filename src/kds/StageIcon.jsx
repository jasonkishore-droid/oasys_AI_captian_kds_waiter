// The animated picture for each ticket stage (pot with steam, bell, a dish on its way, plate with a tick, recall arrow). The animations are
// in kds.css (.ico-*). Used by the tablet's order-status toasts.
export function StageIcon({ stage }) {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (stage === 'preparing') {
    // a pot on the heat, with steam rising
    return (
      <svg {...p} className="ico ico-preparing">
        <path className="steam s1" d="M8 8c-1-1.2 1-2 0-3.5" />
        <path className="steam s2" d="M12 8c-1-1.2 1-2 0-3.5" />
        <path className="steam s3" d="M16 8c-1-1.2 1-2 0-3.5" />
        <path className="pot" d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3z" />
        <path className="pot" d="M2.5 12h19" />
      </svg>
    )
  }
  if (stage === 'ready') {
    // a service bell that rings
    return (
      <svg {...p} className="ico ico-ready">
        <g className="bell">
          <path d="M6 16a6 6 0 0 1 12 0z" />
          <path d="M12 7V5M10 5h4" />
          <path d="M4 19h16" />
        </g>
      </svg>
    )
  }
  if (stage === 'on_the_way') {
    // a covered dish on its way, with speed lines behind it
    return (
      <svg {...p} className="ico ico-on_the_way">
        <g className="lines">
          <path d="M2 11h3M1 14.5h4" />
        </g>
        <g className="go">
          <path d="M7 18h14" />
          <path d="M9 18a5 5 0 0 1 10 0" />
          <path d="M14 11.5V10" />
        </g>
      </svg>
    )
  }
  if (stage === 'served') {
    // a plate under a cloche, and a tick that draws itself
    return (
      <svg {...p} className="ico ico-served">
        <path d="M3 19h18" />
        <path d="M5 19a7 7 0 0 1 14 0" />
        <path className="tick" d="M8.8 14.2l2.3 2.3 4.2-4.6" />
      </svg>
    )
  }
  return (
    <svg {...p} className="ico ico-new">
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  )
}
