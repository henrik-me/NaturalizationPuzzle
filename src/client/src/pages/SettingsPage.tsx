import { StateSelector } from '../components/StateSelector';
import { useAppContext } from '../context/AppContext';

export function SettingsPage(): React.ReactNode {
  const { state, dispatch } = useAppContext();

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
              <p><strong>Representative:</strong> {state.selectedState.representative}</p>
            </div>
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
