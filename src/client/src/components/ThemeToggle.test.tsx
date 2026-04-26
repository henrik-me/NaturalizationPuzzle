import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../context/ThemeContext';
import { ThemeToggle } from './ThemeToggle';

function renderToggle(): void {
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
}

describe('ThemeToggle', () => {
  it('renders three options with radiogroup semantics', () => {
    renderToggle();
    const group = screen.getByRole('radiogroup', { name: /color theme/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /system/i })).toBeInTheDocument();
  });

  it('marks the System option as checked by default', () => {
    renderToggle();
    expect(screen.getByRole('radio', { name: /system/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('switches selection and applies dark class when Dark is chosen', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('radio', { name: /dark/i }));
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /system/i })).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('themePreference')).toBe('dark');
  });

  it('removes the dark class when Light is chosen', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('radio', { name: /dark/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(screen.getByRole('radio', { name: /light/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('themePreference')).toBe('light');
  });

  it('uses roving tabIndex on the selected option', () => {
    renderToggle();
    expect(screen.getByRole('radio', { name: /system/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('tabindex', '-1');
  });

  it('navigates options with arrow keys (radio-group semantics)', async () => {
    const user = userEvent.setup();
    renderToggle();
    const system = screen.getByRole('radio', { name: /system/i });
    system.focus();
    await user.keyboard('{ArrowRight}');
    // wraps from System (last) to Light (first)
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: /system/i })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'true');
  });
});
