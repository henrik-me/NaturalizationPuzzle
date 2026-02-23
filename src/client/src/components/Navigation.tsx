import { NavLink } from 'react-router-dom';

export function Navigation(): React.ReactNode {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <nav aria-label="Main navigation" className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-blue-800">
          🇺🇸 Naturalization Puzzle
        </h1>
        <div className="flex gap-2" role="menubar">
          <NavLink to="/" className={linkClass} role="menuitem">Study</NavLink>
          <NavLink to="/quiz" className={linkClass} role="menuitem">Quiz</NavLink>
          <NavLink to="/settings" className={linkClass} role="menuitem">Settings</NavLink>
        </div>
      </div>
    </nav>
  );
}
