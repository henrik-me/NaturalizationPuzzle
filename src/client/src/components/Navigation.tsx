import { NavLink } from 'react-router-dom';

export function Navigation(): React.ReactNode {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center justify-center text-center min-h-[44px] px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`;

  return (
    <nav aria-label="Main navigation" className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold text-blue-800 dark:text-blue-300 truncate">
          🇺🇸 Naturalization Puzzle
        </h1>
        <div className="grid grid-cols-4 gap-1 w-full sm:flex sm:gap-2 sm:w-auto" role="menubar">
          <NavLink to="/" className={linkClass} role="menuitem">Study</NavLink>
          <NavLink to="/quiz" className={linkClass} role="menuitem">Quiz</NavLink>
          <NavLink to="/history" className={linkClass} role="menuitem">History</NavLink>
          <NavLink to="/settings" className={linkClass} role="menuitem">Settings</NavLink>
        </div>
      </div>
    </nav>
  );
}
