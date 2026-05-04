/**
 * Status copy + cadence for `SlowConnectionBanner`.
 *
 * Lives in its own module so the banner component file only exports a
 * React component (keeps fast-refresh happy), while tests can still
 * import the canonical constants instead of duplicating them.
 */

export const SLOW_BANNER_MESSAGES = [
  'Waking up the server…',
  'Spinning up a fresh container…',
  'Brewing some democracy ☕',
  'Reviewing 128 civics questions…',
  'Counting all 50 states…',
  'Polling 435 House representatives…',
  'Almost there — thanks for your patience!',
] as const;

export const MESSAGE_ROTATION_MS = 3000;

export const TICK_MS = 1000;
