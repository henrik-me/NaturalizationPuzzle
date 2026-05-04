import { useEffect, useState, useSyncExternalStore } from 'react';
import { connectionStatus } from '../services/connectionStatus';
import { SLOW_BANNER_MESSAGES, MESSAGE_ROTATION_MS, TICK_MS } from './slowConnectionMessages';

/**
 * Renders an animated banner whenever at least one API request has been
 * in-flight for longer than `SLOW_REQUEST_THRESHOLD_MS`. The most common
 * trigger is the Azure Container Apps cold start (replica scaled to 0
 * after a few minutes of idle traffic) — the first visit after a quiet
 * period waits ~20–25 seconds for the container to spin up. Without
 * this banner the UI looks frozen.
 *
 * Sighted users see a pulsing dot, a rotating set of friendly status
 * messages, and an elapsed-seconds counter. Screen-reader users get a
 * single stable announcement (the rotating copy is `aria-hidden`) so
 * assistive tech doesn't yell new text every 3 seconds.
 */
export function SlowConnectionBanner(): React.ReactNode {
  const slowCount = useSyncExternalStore(
    connectionStatus.subscribe,
    connectionStatus.getSnapshot,
    () => 0,
  );
  const isVisible = slowCount > 0;
  // Counts ticks of the 1s setInterval below. Naming the state by what it
  // measures (ticks) rather than what it usually displays (seconds) avoids
  // a misleading variable name if TICK_MS is ever retuned. Display seconds
  // and the rotating message index are derived from `tickCount * TICK_MS`.
  const [tickCount, setTickCount] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      // Resetting state when becoming hidden ensures the next slow run starts
      // back at the first message and 0s. The lint rule flags the synchronous
      // setState in an effect — that's the intended behavior here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTickCount(0);
      return;
    }
    const interval = setInterval(() => {
      setTickCount(t => t + 1);
    }, TICK_MS);
    return () => {
      clearInterval(interval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const elapsedMs = tickCount * TICK_MS;
  const displaySeconds = Math.floor(elapsedMs / 1000);
  const messageIndex = Math.min(
    Math.floor(elapsedMs / MESSAGE_ROTATION_MS),
    SLOW_BANNER_MESSAGES.length - 1,
  );
  const message = SLOW_BANNER_MESSAGES[messageIndex];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="slow-connection-banner"
      className="bg-amber-500 dark:bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium"
    >
      <span className="sr-only">
        Waking up the server. This can take 20 to 30 seconds. Please wait.
      </span>
      <span aria-hidden="true" className="inline-flex items-center justify-center gap-3">
        <span
          data-testid="slow-connection-pulse"
          className="inline-block h-2.5 w-2.5 rounded-full bg-white animate-pulse"
        />
        <span data-testid="slow-connection-message">{message}</span>
        <span data-testid="slow-connection-elapsed" className="opacity-70 tabular-nums text-xs">
          ({displaySeconds}s)
        </span>
      </span>
    </div>
  );
}
