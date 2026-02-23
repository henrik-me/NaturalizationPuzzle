import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';
import { AppProvider } from '../context/AppContext';

describe('OfflineBanner', () => {
  it('does not render when online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

    render(
      <AppProvider>
        <OfflineBanner />
      </AppProvider>
    );

    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });
});
