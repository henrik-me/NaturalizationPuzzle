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

  /** Test-only reset. Not used in production paths. */
  __reset(): void {
    slowCount = 0;
    subscribers.clear();
  },
};
