import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

export type WebVitalsReporter = (metric: Metric) => void

const defaultReporter: WebVitalsReporter = (metric) => {
  console.info(
    `[web-vitals] ${metric.name}=${metric.value.toFixed(2)} rating=${metric.rating} id=${metric.id}`,
  )
}

let initialized = false

/**
 * Subscribe to Core Web Vitals and forward each measurement to `report`.
 *
 * Scaffold only: production reporting sink (App Insights / custom endpoint)
 * is intentionally deferred to a follow-up so the bundle stays lean and the
 * telemetry-sink design can be decided independently. See issue #97.
 *
 * Idempotent — subsequent calls are no-ops so repeated mounts (HMR,
 * `<StrictMode>` double-invoke, accidental double-init) don't double-subscribe.
 */
export function initWebVitals(report: WebVitalsReporter = defaultReporter): void {
  if (initialized) return
  // Browser guard: web-vitals subscriptions touch `document`/`performance`.
  // Calling this outside a browser (e.g. from a test that accidentally
  // imports main.tsx, or any future SSR path) would throw — silently skip
  // instead so non-browser entry points stay safe.
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  initialized = true
  onCLS(report)
  onFCP(report)
  onINP(report)
  onLCP(report)
  onTTFB(report)
}

/** Test-only hook to reset the init guard between Vitest cases. */
export function __resetWebVitalsForTests(): void {
  initialized = false
}
