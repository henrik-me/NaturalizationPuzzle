import { useRef } from 'react';
import { useTheme, type ThemePreference } from '../context/ThemeContext';

interface Option {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: string;
}

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '🖥️' },
];

export function ThemeToggle(): React.ReactNode {
  const { theme, setTheme } = useTheme();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const focusOption = (index: number): void => {
    const target = buttonsRef.current[index];
    if (target) {
      target.focus();
      setTheme(OPTIONS[index].value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = OPTIONS.length - 1;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusOption(index === last ? 0 : index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusOption(index === 0 ? last : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(last);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-100 dark:bg-slate-800 p-1"
    >
      {OPTIONS.map((opt, index) => {
        const isSelected = theme === opt.value;
        return (
          <button
            key={opt.value}
            ref={el => { buttonsRef.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => setTheme(opt.value)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isSelected
                ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            data-testid={`theme-option-${opt.value}`}
          >
            <span aria-hidden="true" className="mr-1">{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
