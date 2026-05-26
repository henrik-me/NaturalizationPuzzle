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
// the browser; non-browser entry points (tests, future SSR) no-op via the
// guard in initWebVitals. A production telemetry sink (App Insights /
// custom endpoint) is a follow-up tracked under issue #97 (Layer 1.5).
initWebVitals()
