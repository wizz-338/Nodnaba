import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Old links to the in-app check route open the standalone dev page instead,
// as a real navigation so the address bar (and any copied link) updates.
if (location.hash.startsWith('#/visitor/check')) {
  location.replace('./check.html')
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
