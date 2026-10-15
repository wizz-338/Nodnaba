import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CheckPage from './visitor/CheckPage'
import './styles.css'

// Separate document for the developer system check (check.html), so leaving
// it is always a full page load and the browser's address really changes.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="fx" aria-hidden="true" />
    <CheckPage />
  </StrictMode>
)
