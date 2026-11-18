// How long a ticket has been waiting, and how urgent that is. Pure, so it is easy to test.
export const WARN_MINUTES = 10
export const LATE_MINUTES = 20

export const ageSeconds = (createdAt, now) => Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000))

// 7:05, or 1:02:09 once a ticket is more than an hour old
export function formatAge(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// 'ok' | 'warn' | 'late'
export function urgency(seconds) {
  if (seconds >= LATE_MINUTES * 60) return 'late'
  if (seconds >= WARN_MINUTES * 60) return 'warn'
  return 'ok'
}
