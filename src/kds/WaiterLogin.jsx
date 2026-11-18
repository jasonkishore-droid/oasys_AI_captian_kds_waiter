import KdsLogin from './KdsLogin.jsx'
import WaiterMark from './WaiterMark.jsx'

// The waiter's login page: the same split design as the kitchen's, in the waiter screen's teal. A username and a
// password only: the title, name and picture are edited after login (the title bar). "On my way" sends that name.
const POINTS = ['See every table that needs you', 'Tap On my way, On table, then Done', 'Guests see your name and picture']

export default function WaiterLogin({ duty, restaurant }) {
  return <KdsLogin restaurant={restaurant} onLogin={duty.login} role="Waiter calls" mark={<WaiterMark size={34} />} points={POINTS} subtitle="Sign in to answer your tables." label="Waiter login" />
}
