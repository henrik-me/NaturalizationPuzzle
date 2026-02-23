import { useAppContext } from '../context/AppContext';

export function OfflineBanner(): React.ReactNode {
  const { state } = useAppContext();

  if (state.isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium"
    >
      You are offline — studying from cached data
    </div>
  );
}
