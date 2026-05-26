import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}))

vi.mock('web-vitals', () => mocks)

import { __resetWebVitalsForTests, initWebVitals } from './webVitals'

describe('initWebVitals', () => {
  beforeEach(() => {
    __resetWebVitalsForTests()
    mocks.onCLS.mockClear()
    mocks.onFCP.mockClear()
    mocks.onINP.mockClear()
    mocks.onLCP.mockClear()
    mocks.onTTFB.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes to all five Core Web Vitals on first call', () => {
    initWebVitals()
    expect(mocks.onCLS).toHaveBeenCalledTimes(1)
    expect(mocks.onFCP).toHaveBeenCalledTimes(1)
    expect(mocks.onINP).toHaveBeenCalledTimes(1)
    expect(mocks.onLCP).toHaveBeenCalledTimes(1)
    expect(mocks.onTTFB).toHaveBeenCalledTimes(1)
  })

  it('skips subscription in non-browser environments (no window/document)', () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    // @ts-expect-error - simulating non-browser env
    delete globalThis.window
    // @ts-expect-error - simulating non-browser env
    delete globalThis.document
    try {
      initWebVitals()
      expect(mocks.onCLS).not.toHaveBeenCalled()
      expect(mocks.onLCP).not.toHaveBeenCalled()
    } finally {
      globalThis.window = originalWindow
      globalThis.document = originalDocument
    }
  })

  it('forwards the reporter callback to every subscription', () => {
    const reporter = vi.fn()
    initWebVitals(reporter)
    for (const sub of [mocks.onCLS, mocks.onFCP, mocks.onINP, mocks.onLCP, mocks.onTTFB]) {
      expect(sub).toHaveBeenCalledWith(reporter)
    }
  })

  it('is idempotent — repeat calls do not double-subscribe', () => {
    initWebVitals()
    initWebVitals()
    initWebVitals()
    expect(mocks.onCLS).toHaveBeenCalledTimes(1)
    expect(mocks.onLCP).toHaveBeenCalledTimes(1)
  })

  it('default reporter logs the metric to console.info', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    initWebVitals()
    // Grab the reporter the module installed onto onLCP and invoke it with
    // a synthetic metric — this is what web-vitals would do at runtime.
    const installed = mocks.onLCP.mock.calls[0][0] as (m: unknown) => void
    installed({
      name: 'LCP',
      value: 1234.567,
      rating: 'good',
      id: 'v3-1',
      delta: 0,
      entries: [],
      navigationType: 'navigate',
    })
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0][0]).toMatch(/\[web-vitals\] LCP=1234\.57 rating=good id=v3-1/)
  })
})
