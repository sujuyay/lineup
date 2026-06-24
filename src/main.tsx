import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics, track } from './analytics.ts'

// The standalone (GitHub Pages) build configures its own Umami via env vars and
// feeds events to <App> through onTrack. Package consumers pass their own.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App onTrack={track} />
  </StrictMode>,
)
