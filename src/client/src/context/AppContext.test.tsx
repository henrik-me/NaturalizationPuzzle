import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { UsStateDto } from '../types/api';

const mockState: UsStateDto = {
  id: 5,
  name: 'California',
  abbreviation: 'CA',
  capital: 'Sacramento',
  governor: 'Gavin Newsom',
  senatorOne: 'Alex Padilla',
  senatorTwo: 'Adam Schiff',
  representatives: ['Rep One'],
};

const mockedGetStateById = vi.fn();

vi.mock('../services/stateService', () => ({
  getStateById: (...args: unknown[]) => mockedGetStateById(...args),
}));

// Import after mock setup
import { AppProvider, useAppContext } from './AppContext';

function TestConsumer(): React.ReactNode {
  const { state, dispatch } = useAppContext();
  return (
    <div>
      <span data-testid="state-id">{state.selectedStateId ?? 'none'}</span>
      <span data-testid="state-name">{state.selectedState?.name ?? 'none'}</span>
      <span data-testid="is6520">{String(state.is6520Mode)}</span>
      <span data-testid="online">{String(state.isOnline)}</span>
      <span data-testid="loading">{String(state.isLoading)}</span>
      <button onClick={() => dispatch({ type: 'SET_STATE', stateId: mockState.id, state: mockState })}>
        set state
      </button>
      <button onClick={() => dispatch({ type: 'SET_6520_MODE', enabled: true })}>
        enable 6520
      </button>
      <button onClick={() => dispatch({ type: 'SET_LOADING', loading: true })}>
        set loading
      </button>
    </div>
  );
}

describe('AppContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    mockedGetStateById.mockResolvedValue(null);
  });

  it('provides default state when no persisted stateId', () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    expect(screen.getByTestId('state-id')).toHaveTextContent('none');
    expect(screen.getByTestId('state-name')).toHaveTextContent('none');
    expect(screen.getByTestId('is6520')).toHaveTextContent('false');
  });

  it('throws when useAppContext is used outside AppProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAppContext must be used within AppProvider');
    spy.mockRestore();
  });

  it('dispatches SET_STATE and persists stateId to localStorage', async () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    await act(async () => {
      screen.getByText('set state').click();
    });

    expect(screen.getByTestId('state-id')).toHaveTextContent('5');
    expect(screen.getByTestId('state-name')).toHaveTextContent('California');
    expect(localStorage.getItem('selectedStateId')).toBe('5');
  });

  it('dispatches SET_6520_MODE', async () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    await act(async () => {
      screen.getByText('enable 6520').click();
    });

    expect(screen.getByTestId('is6520')).toHaveTextContent('true');
  });

  it('dispatches SET_LOADING', async () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    await act(async () => {
      screen.getByText('set loading').click();
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('hydrates selectedState from API when persisted stateId exists', async () => {
    // SET_STATE is dispatched via the hydration effect, which re-persists to localStorage
    localStorage.setItem('selectedStateId', '5');
    mockedGetStateById.mockResolvedValue(mockState);

    // Need fresh module to pick up localStorage at initialState time
    vi.resetModules();
    const { AppProvider: FreshProvider, useAppContext: freshUseAppContext } = await import('./AppContext');

    function FreshConsumer(): React.ReactNode {
      const { state } = freshUseAppContext();
      return (
        <div>
          <span data-testid="state-id">{state.selectedStateId ?? 'none'}</span>
          <span data-testid="state-name">{state.selectedState?.name ?? 'none'}</span>
        </div>
      );
    }

    render(
      <FreshProvider>
        <FreshConsumer />
      </FreshProvider>
    );

    expect(screen.getByTestId('state-id')).toHaveTextContent('5');

    await waitFor(() => {
      expect(screen.getByTestId('state-name')).toHaveTextContent('California');
    });

    expect(mockedGetStateById).toHaveBeenCalledWith(5);
  });

  it('does not hydrate when no persisted stateId', async () => {
    // Ensure clean state — the statically-imported AppProvider reads localStorage at module init,
    // where localStorage was empty (beforeEach clears it before module load).
    mockedGetStateById.mockClear();

    vi.resetModules();
    const { AppProvider: FreshProvider, useAppContext: freshUseAppContext } = await import('./AppContext');

    function FreshConsumer(): React.ReactNode {
      const { state } = freshUseAppContext();
      return (
        <div>
          <span data-testid="state-name">{state.selectedState?.name ?? 'none'}</span>
        </div>
      );
    }

    render(
      <FreshProvider>
        <FreshConsumer />
      </FreshProvider>
    );

    await act(async () => {});

    expect(mockedGetStateById).not.toHaveBeenCalled();
    expect(screen.getByTestId('state-name')).toHaveTextContent('none');
  });

  it('handles hydration failure gracefully', async () => {
    localStorage.setItem('selectedStateId', '999');
    mockedGetStateById.mockResolvedValue(null);

    vi.resetModules();
    const { AppProvider: FreshProvider, useAppContext: freshUseAppContext } = await import('./AppContext');

    function FreshConsumer(): React.ReactNode {
      const { state } = freshUseAppContext();
      return (
        <div>
          <span data-testid="state-id">{state.selectedStateId ?? 'none'}</span>
          <span data-testid="state-name">{state.selectedState?.name ?? 'none'}</span>
        </div>
      );
    }

    render(
      <FreshProvider>
        <FreshConsumer />
      </FreshProvider>
    );

    await waitFor(() => {
      expect(mockedGetStateById).toHaveBeenCalledWith(999);
    });

    expect(screen.getByTestId('state-id')).toHaveTextContent('999');
    expect(screen.getByTestId('state-name')).toHaveTextContent('none');
  });

  it('responds to online/offline window events', async () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('online')).toHaveTextContent('false');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByTestId('online')).toHaveTextContent('true');
  });
});
