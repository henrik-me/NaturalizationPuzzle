import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateSelector } from './StateSelector';
import { AppProvider } from '../context/AppContext';
import type { UsStateDto } from '../types/api';

const mockStates: UsStateDto[] = [
  { id: 1, name: 'Alabama', abbreviation: 'AL', capital: 'Montgomery', governor: 'Kay Ivey', senatorOne: 'Tommy Tuberville', senatorTwo: 'Katie Britt', representatives: ['Rep A'] },
  { id: 2, name: 'Alaska', abbreviation: 'AK', capital: 'Juneau', governor: 'Mike Dunleavy', senatorOne: 'Lisa Murkowski', senatorTwo: 'Dan Sullivan', representatives: ['Mary Peltola'] },
];

vi.mock('../services/stateService', () => ({
  getAllStates: vi.fn(),
  getStateById: vi.fn().mockResolvedValue(null),
}));

import { getAllStates } from '../services/stateService';
const mockedGetAllStates = vi.mocked(getAllStates);

describe('StateSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    mockedGetAllStates.mockResolvedValue(mockStates);
  });

  it('shows loading text while fetching states', () => {
    mockedGetAllStates.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <AppProvider>
        <StateSelector />
      </AppProvider>
    );

    expect(screen.getByText('Loading states...')).toBeInTheDocument();
  });

  it('renders all states in the dropdown after loading', async () => {
    render(
      <AppProvider>
        <StateSelector />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const options = screen.getAllByRole('option');
    // "Choose a state..." + 2 states
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent('Alabama');
    expect(options[2]).toHaveTextContent('Alaska');
  });

  it('dispatches SET_STATE when a state is selected', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <StateSelector />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), '1');

    expect(localStorage.getItem('selectedStateId')).toBe('1');
  });

  it('has an accessible label', async () => {
    render(
      <AppProvider>
        <StateSelector />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Select your state')).toBeInTheDocument();
    });
  });
});
