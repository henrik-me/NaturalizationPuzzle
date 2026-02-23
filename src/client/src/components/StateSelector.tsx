import { useState, useEffect } from 'react';
import type { UsStateDto } from '../types/api';
import { getAllStates } from '../services/stateService';
import { useAppContext } from '../context/AppContext';

export function StateSelector(): React.ReactNode {
  const { state, dispatch } = useAppContext();
  const [states, setStates] = useState<readonly UsStateDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStates = async (): Promise<void> => {
      setIsLoading(true);
      const result = await getAllStates();
      setStates(result);
      setIsLoading(false);
    };
    void loadStates();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const id = Number(e.target.value);
    const selected = states.find(s => s.id === id);
    if (selected) {
      dispatch({ type: 'SET_STATE', stateId: id, state: selected });
    }
  };

  if (isLoading) {
    return <p className="text-gray-500">Loading states...</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="state-select" className="text-sm font-medium text-gray-700">
        Select your state
      </label>
      <select
        id="state-select"
        value={state.selectedStateId ?? ''}
        onChange={handleChange}
        className="border border-gray-300 rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
        aria-label="Select your U.S. state for state-specific questions"
      >
        <option value="" disabled>Choose a state...</option>
        {states.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
