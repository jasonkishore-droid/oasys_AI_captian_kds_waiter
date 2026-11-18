// The logo on the kitchen and waiter screens: a chef's hat, drawn in the current text colour.
export default function KitchenMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 14.2A3.9 3.9 0 1 1 8.6 6.7a3.9 3.9 0 0 1 6.8 0A3.9 3.9 0 1 1 17 14.2" />
      <path d="M7 14.2V19.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V14.2" />
      <path d="M7 17h10" />
    </svg>
  )
}
