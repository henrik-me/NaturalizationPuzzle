import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SlowConnectionBanner } from './SlowConnectionBanner';
import { SLOW_BANNER_MESSAGES, MESSAGE_ROTATION_MS } from './slowConnectionMessages';
import { connectionStatus } from '../services/connectionStatus';

describe('SlowConnectionBanner', () => {
  beforeEach(() => {
    connectionStatus.__reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no slow requests are in flight', () => {
    const { container } = render(<SlowConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner with the first message + pulse + 0s counter when a slow request appears', () => {
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
    });
    const banner = screen.getByTestId('slow-connection-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByTestId('slow-connection-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('slow-connection-message').textContent).toBe(
      SLOW_BANNER_MESSAGES[0],
    );
    expect(screen.getByTestId('slow-connection-elapsed').textContent).toBe('(0s)');
  });

  it('exposes a stable screen-reader-only announcement (no rotating chatter)', () => {
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
    });
    const banner = screen.getByTestId('slow-connection-banner');
    const sr = banner.querySelector('.sr-only');
    expect(sr?.textContent).toMatch(/waking up the server/i);
    expect(sr?.textContent).toMatch(/20 to 30 seconds/);
  });

  it('rotates messages on the documented cadence and sticks on the last one', () => {
    vi.useFakeTimers();
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
    });

    // Walk through every message in the sequence by advancing past each rotation boundary.
    for (let i = 1; i < SLOW_BANNER_MESSAGES.length; i++) {
      act(() => {
        vi.advanceTimersByTime(MESSAGE_ROTATION_MS);
      });
      expect(screen.getByTestId('slow-connection-message').textContent).toBe(
        SLOW_BANNER_MESSAGES[i],
      );
    }

    // Advance well past the end — message stays on the last one.
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ROTATION_MS * 5);
    });
    expect(screen.getByTestId('slow-connection-message').textContent).toBe(
      SLOW_BANNER_MESSAGES[SLOW_BANNER_MESSAGES.length - 1],
    );
  });

  it('increments the elapsed-seconds counter every second', () => {
    vi.useFakeTimers();
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
    });
    expect(screen.getByTestId('slow-connection-elapsed').textContent).toBe('(0s)');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('slow-connection-elapsed').textContent).toBe('(1s)');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId('slow-connection-elapsed').textContent).toBe('(5s)');
  });

  it('hides the banner once all slow requests complete', () => {
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
    });
    expect(screen.getByTestId('slow-connection-banner')).toBeInTheDocument();
    act(() => {
      connectionStatus.markDone();
    });
    expect(screen.queryByTestId('slow-connection-banner')).not.toBeInTheDocument();
  });

  it('stays visible while at least one slow request remains in flight', () => {
    render(<SlowConnectionBanner />);
    act(() => {
      connectionStatus.markSlow();
      connectionStatus.markSlow();
    });
    expect(screen.getByTestId('slow-connection-banner')).toBeInTheDocument();
    act(() => {
      connectionStatus.markDone();
    });
    expect(screen.getByTestId('slow-connection-banner')).toBeInTheDocument();
    act(() => {
      connectionStatus.markDone();
    });
    expect(screen.queryByTestId('slow-connection-banner')).not.toBeInTheDocument();
  });

  it('resets the elapsed counter and message when a new slow run starts after a quiet period', () => {
    vi.useFakeTimers();
    render(<SlowConnectionBanner />);

    // First slow run — let the elapsed counter climb past the first message.
    act(() => {
      connectionStatus.markSlow();
    });
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ROTATION_MS * 2);
    });
    expect(screen.getByTestId('slow-connection-elapsed').textContent).not.toBe('(0s)');
    expect(screen.getByTestId('slow-connection-message').textContent).not.toBe(
      SLOW_BANNER_MESSAGES[0],
    );

    // Run finishes — banner unmounts.
    act(() => {
      connectionStatus.markDone();
    });
    expect(screen.queryByTestId('slow-connection-banner')).not.toBeInTheDocument();

    // Brand new slow run — counter and message must be back at the start.
    act(() => {
      connectionStatus.markSlow();
    });
    expect(screen.getByTestId('slow-connection-elapsed').textContent).toBe('(0s)');
    expect(screen.getByTestId('slow-connection-message').textContent).toBe(
      SLOW_BANNER_MESSAGES[0],
    );
  });
});
