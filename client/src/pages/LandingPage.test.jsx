import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage.jsx';

const session = vi.hoisted(() => ({ isAuthed: false, loading: false }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => session }));
beforeEach(() => Object.assign(session, { isAuthed: false, loading: false }));
const renderHome = () => render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<LandingPage />} /><Route path="/dashboard" element={<p>Dashboard page</p>} /></Routes></MemoryRouter>);

it('explains the platform and why to join, with sign up and log in links', () => {
  renderHome();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  for (const name of ['What you can do', 'Why join', 'Get started']) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'If you are learning' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'If you are teaching' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Log in' }).every((link) => link.getAttribute('href') === '/login')).toBe(true);
  const start = within(screen.getByRole('region', { name: 'Get started' }));
  expect(start.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
});
it('sends signed-in visitors to the dashboard', () => {
  session.isAuthed = true;
  renderHome();
  expect(screen.getByText('Dashboard page')).toBeInTheDocument();
});
