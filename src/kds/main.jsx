// Entry for the standalone Kitchen Display (its own port: npm run kds). Same screen as the Kitchen
// button in the tablet app, but on its own: no close button, nothing of the tablet app loaded.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import KitchenScreen from './KitchenScreen.jsx'
import ErrorBoundary from '../ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <KitchenScreen />
    </ErrorBoundary>
  </StrictMode>
)
