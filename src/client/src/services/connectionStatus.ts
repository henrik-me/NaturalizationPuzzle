/**
 * Module-level pub/sub store that tracks how many in-flight API requests
 * have exceeded the "slow" threshold. The UI subscribes via
 * `useSyncExternalStore` to render a "server is waking up" banner when
 * the count is non-zero.
 *
 * This lives outside React context on purpose: it must be reachable from
 * `apiClient.ts` (a plain module, not a hook) without dependency
 * injection. It's a singleton because there's only ever one network
 * surface per app instance.
 */

export const SLOW_REQUEST_THRESHOLD_MS = 3000;

let slowCount = 0;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

export const connectionStatus = {
  subscribe(cb: () => void): () => void {
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  },

  getSnapshot(): number {
    return slowCount;
  },

  markSlow(): void {
    slowCount += 1;
    notify();
  },

  markDone(): void {
    if (slowCount > 0) {
      slowCount -= 1;
      notify();
    }
  },
};

/**
 * @internal Test-only escape hatch. Resets the singleton's internal state
 * so tests don't leak across each other. Intentionally NOT a member of
 * `connectionStatus` — keeping it as a separate, explicitly-named export
 * makes accidental production usage hard (you have to import this exact
 * symbol by name, which any reviewer will flag).
 *
 * Tests import this directly from this module. Production code never
 * imports it; tree-shaking should drop it from the production bundle.
 */
export function __resetConnectionStatusForTests(): void {
  slowCount = 0;
  subscribers.clear();
}
