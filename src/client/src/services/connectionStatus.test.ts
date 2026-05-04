import { describe, it, expect, beforeEach } from 'vitest';
import {
  connectionStatus,
  SLOW_REQUEST_THRESHOLD_MS,
  __resetConnectionStatusForTests,
} from './connectionStatus';

describe('connectionStatus', () => {
  beforeEach(() => {
    __resetConnectionStatusForTests();
  });

  it('starts with snapshot 0', () => {
    expect(connectionStatus.getSnapshot()).toBe(0);
  });

  it('exports a sensible threshold (≥1s, ≤10s)', () => {
    expect(SLOW_REQUEST_THRESHOLD_MS).toBeGreaterThanOrEqual(1000);
    expect(SLOW_REQUEST_THRESHOLD_MS).toBeLessThanOrEqual(10000);
  });

  it('markSlow increments and markDone decrements', () => {
    connectionStatus.markSlow();
    expect(connectionStatus.getSnapshot()).toBe(1);
    connectionStatus.markSlow();
    expect(connectionStatus.getSnapshot()).toBe(2);
    connectionStatus.markDone();
    expect(connectionStatus.getSnapshot()).toBe(1);
    connectionStatus.markDone();
    expect(connectionStatus.getSnapshot()).toBe(0);
  });

  it('markDone never goes below 0', () => {
    connectionStatus.markDone();
    connectionStatus.markDone();
    expect(connectionStatus.getSnapshot()).toBe(0);
  });

  it('notifies subscribers on changes', () => {
    let calls = 0;
    const unsub = connectionStatus.subscribe(() => {
      calls += 1;
    });
    connectionStatus.markSlow();
    connectionStatus.markSlow();
    connectionStatus.markDone();
    expect(calls).toBe(3);
    unsub();
  });

  it('does not notify after unsubscribe', () => {
    let calls = 0;
    const unsub = connectionStatus.subscribe(() => {
      calls += 1;
    });
    unsub();
    connectionStatus.markSlow();
    expect(calls).toBe(0);
  });

  it('does not notify when markDone is a no-op (already at 0)', () => {
    let calls = 0;
    const unsub = connectionStatus.subscribe(() => {
      calls += 1;
    });
    connectionStatus.markDone();
    expect(calls).toBe(0);
    unsub();
  });

  it('supports multiple independent subscribers', () => {
    const calls: string[] = [];
    const unsubA = connectionStatus.subscribe(() => calls.push('A'));
    const unsubB = connectionStatus.subscribe(() => calls.push('B'));
    connectionStatus.markSlow();
    expect(calls).toEqual(['A', 'B']);
    unsubA();
    connectionStatus.markDone();
    expect(calls).toEqual(['A', 'B', 'B']);
    unsubB();
  });
});
