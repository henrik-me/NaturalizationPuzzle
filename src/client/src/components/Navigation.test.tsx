import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Navigation } from './Navigation';

describe('Navigation', () => {
  it('renders all navigation menu items', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    expect(screen.getByRole('menuitem', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Quiz' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Stories' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders the app title', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    expect(screen.getByText(/Naturalization Puzzle/)).toBeInTheDocument();
  });

  it('has an accessible navigation landmark', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('menu items point to correct routes', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    expect(screen.getByRole('menuitem', { name: 'Study' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('menuitem', { name: 'Quiz' })).toHaveAttribute('href', '/quiz');
    expect(screen.getByRole('menuitem', { name: 'Stories' })).toHaveAttribute('href', '/stories');
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});
