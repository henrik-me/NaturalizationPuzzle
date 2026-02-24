import { useState, useEffect, useCallback } from 'react';
import { StateSelector } from '../components/StateSelector';
import { useAppContext } from '../context/AppContext';
import { getVacantSeats, updateRepresentative, resetRepresentatives } from '../services/representativeService';
import { getStateById } from '../services/stateService';
import type { VacantSeatDto } from '../types/api';

export function SettingsPage(): React.ReactNode {
  const { state, dispatch } = useAppContext();
  const [vacantSeats, setVacantSeats] = useState<readonly VacantSeatDto[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const fetchVacantSeats = useCallback(async (): Promise<void> => {
    if (!state.selectedStateId) return;
    const seats = await getVacantSeats(state.selectedStateId);
    setVacantSeats(seats);
  }, [state.selectedStateId]);

  useEffect(() => {
    void fetchVacantSeats();
  }, [fetchVacantSeats]);

  const handleUpdate = async (id: number): Promise<void> => {
    if (!newName.trim()) return;
    setUpdateStatus(null);
    const updated = await updateRepresentative(id, newName.trim());
    if (updated) {
      setUpdateStatus(`Updated ${updated.district} district to ${updated.name}`);
      setEditingId(null);
      setNewName('');
      await fetchVacantSeats();
      // Refresh selected state data so the representative list updates
      if (state.selectedStateId) {
        const refreshed = await getStateById(state.selectedStateId);
        if (refreshed) {
          dispatch({ type: 'SET_STATE', stateId: state.selectedStateId, state: refreshed });
        }
      }
    } else {
      setUpdateStatus('Failed to update representative.');
    }
  };

  const handleReset = async (): Promise<void> => {
    setUpdateStatus(null);
    const count = await resetRepresentatives();
    if (count > 0) {
      setUpdateStatus(`Reset ${count} representative(s) to default values.`);
      await fetchVacantSeats();
      if (state.selectedStateId) {
        const refreshed = await getStateById(state.selectedStateId);
        if (refreshed) {
          dispatch({ type: 'SET_STATE', stateId: state.selectedStateId, state: refreshed });
        }
      }
    } else {
      setUpdateStatus('All representatives already match default values.');
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

      <div className="bg-white rounded-xl shadow-md p-6 space-y-6">
        <section>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Your State</h3>
          <StateSelector />
          {state.selectedState && (
            <div className="mt-4 bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
              <p><strong>Capital:</strong> {state.selectedState.capital}</p>
              <p><strong>Governor:</strong> {state.selectedState.governor}</p>
              <p><strong>Senators:</strong> {state.selectedState.senatorOne}, {state.selectedState.senatorTwo}</p>
              <p><strong>Representative{state.selectedState.representatives.length !== 1 ? 's' : ''}:</strong>{' '}
                {state.selectedState.representatives.length <= 3
                  ? state.selectedState.representatives.join(', ')
                  : `${state.selectedState.representatives.length} members`}
              </p>
              {state.selectedState.representatives.length > 3 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600 hover:underline text-xs">
                    Show all {state.selectedState.representatives.length} representatives
                  </summary>
                  <ul className="mt-1 list-disc list-inside text-xs">
                    {state.selectedState.representatives.map((rep, i) => (
                      <li key={i}>{rep}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        {vacantSeats.length > 0 && (
          <section aria-labelledby="vacant-seats-heading">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 id="vacant-seats-heading" className="text-lg font-semibold text-amber-800 mb-2">
                ⚠️ Vacant Seats Detected
              </h3>
              <p className="text-sm text-amber-700 mb-3">
                {vacantSeats.length === 1
                  ? 'There is 1 vacant House seat for your state. Would you like to update it?'
                  : `There are ${vacantSeats.length} vacant House seats for your state. Would you like to update them?`}
              </p>
              <ul className="space-y-2">
                {vacantSeats.map(seat => (
                  <li key={seat.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-amber-900">{seat.district} District:</span>
                    {editingId === seat.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={e => { e.preventDefault(); void handleUpdate(seat.id); }}
                      >
                        <label htmlFor={`rep-name-${seat.id}`} className="sr-only">
                          Representative name for {seat.district} district
                        </label>
                        <input
                          id={`rep-name-${seat.id}`}
                          type="text"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          placeholder="Enter representative name"
                          className="border border-amber-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700 focus:ring-2 focus:ring-amber-400"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setNewName(''); }}
                          className="text-amber-800 text-sm hover:underline"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setEditingId(seat.id); setNewName(''); }}
                        className="text-amber-800 text-sm hover:underline focus:ring-2 focus:ring-amber-400 rounded"
                      >
                        Update
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {updateStatus && (
                <p className="mt-2 text-sm text-green-700" aria-live="polite">{updateStatus}</p>
              )}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Representative Data</h3>
          <p className="text-sm text-gray-600 mb-3">
            If representative data has been modified, you can reset all entries back to the latest known values from the seed data.
          </p>
          <button
            onClick={() => void handleReset()}
            className="bg-gray-600 text-white px-4 py-2 rounded text-sm hover:bg-gray-700 focus:ring-2 focus:ring-gray-400"
          >
            Reset to defaults
          </button>
          {updateStatus && vacantSeats.length === 0 && (
            <p className="mt-2 text-sm text-green-700" aria-live="polite">{updateStatus}</p>
          )}
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Study Mode</h3>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="6520-mode"
              checked={state.is6520Mode}
              onChange={e => dispatch({ type: 'SET_6520_MODE', enabled: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="6520-mode" className="text-gray-700">
              Enable 65/20 mode (20 designated questions only)
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            For applicants 65 or older with 20+ years of permanent residency.
            Only 20 designated questions, 10 asked, 6 needed to pass.
          </p>
        </section>
      </div>
    </main>
  );
}
