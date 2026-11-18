import { useState } from 'react'
import KitchenMark from './KitchenMark.jsx'

const KITCHEN_POINTS = ['Live orders from every table', 'Move each ticket through the stages', 'Never miss a late order']

// The login page for the Kitchen Display and the Waiter screen: a brand panel on the left, the form on the right (stacked on a phone).
// The waiter screen passes its own role, logo and points; the panel's colour comes from the screen (navy, or teal on .waiter-app).
const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export default function KdsLogin({ restaurant, onLogin, role = 'Kitchen display', mark = <KitchenMark size={34} />, points = KITCHEN_POINTS, subtitle = "Sign in to see today's orders.", label = 'Kitchen login' }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // onLogin gives back true, false, or a message to show (the waiter login asks the server, so it may take a moment)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const r = await onLogin(user, pass)
    setBusy(false)
    if (r !== true) {
      setError(typeof r === 'string' ? r : 'Wrong username or password. Please try again.')
      setPass('')
    }
  }
  return (
    <main className="lg-page">
      <div className="lg-card">
        <aside className="lg-side">
          <span className="lg-logo" aria-hidden="true">
            {mark}
          </span>
          <h1>{restaurant}</h1>
          <p className="lg-role">{role}</p>
          <ul>
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </aside>

        <form className="lg-form" onSubmit={submit} aria-label={label}>
          <h2>Welcome back</h2>
          <p className="lg-sub">{subtitle}</p>

          <label className="lg-field">
            <span>Username</span>
            <div className="lg-input">
              <Icon>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </Icon>
              <input
                value={user}
                placeholder="Enter your username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                onChange={(e) => {
                  setUser(e.target.value)
                  setError('')
                }}
              />
            </div>
          </label>

          <label className="lg-field">
            <span>Password</span>
            <div className="lg-input">
              <Icon>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </Icon>
              <input
                type={show ? 'text' : 'password'}
                value={pass}
                placeholder="Enter your password"
                autoComplete="current-password"
                onChange={(e) => {
                  setPass(e.target.value)
                  setError('')
                }}
              />
              <button type="button" className="lg-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                <Icon>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {show && <path d="M4 4l16 16" />}
                </Icon>
              </button>
            </div>
          </label>

          {error && (
            <p className="lg-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="lg-submit" disabled={!user.trim() || !pass || busy}>
            {busy ? 'Checking…' : 'Log in'}
            <Icon>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </Icon>
          </button>
        </form>
      </div>
    </main>
  )
}
