import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { initWebVitals } from './perf/webVitals'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Core Web Vitals instrumentation. Scaffold only — logs to console.info in
// every environment; a production telemetry sink (App Insights / custom
// endpoint) is a follow-up tracked under issue #97 (Layer 1.5).
initWebVitals()
