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
  // Browser guard: the `web-vitals` subscriptions touch `document` /
  // `performance` internally, so a direct caller from a non-browser
  // context (e.g. a Vitest case that imports this module without the
  // jsdom environment) would throw. Skip silently instead. Note: this
  // does NOT make `main.tsx` itself non-browser-safe — `main.tsx`
  // dereferences `document.getElementById('root')` before this is even
  // called. The guard exists for direct callers of `initWebVitals`.
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
