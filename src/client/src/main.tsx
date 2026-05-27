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

// Core Web Vitals instrumentation. Scaffold only — the default reporter
// logs each metric to `console.info`. `initWebVitals()` itself short-
// circuits when `window` / `document` are missing (see the guard inside
// the module) so direct unit-test imports of the perf module are safe;
// `main.tsx` itself still requires a browser (it mounts React above).
// A production telemetry sink (App Insights / custom endpoint) is a
// follow-up tracked under issue #97 (Layer 1.5).
initWebVitals()
