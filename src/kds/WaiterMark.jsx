// The logo on the waiter screen: a service bell, drawn in the current text colour.
export default function WaiterMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5V3.5M10 3.5h4" />
      <path d="M4.5 17a7.5 7.5 0 0 1 15 0z" />
      <path d="M3 20.5h18" />
    </svg>
  )
}
