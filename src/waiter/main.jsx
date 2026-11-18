// Entry for the standalone Waiter Calls screen (its own port: npm run waiter).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WaiterScreen from './WaiterScreen.jsx'
import ErrorBoundary from '../ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <WaiterScreen />
    </ErrorBoundary>
  </StrictMode>
)
