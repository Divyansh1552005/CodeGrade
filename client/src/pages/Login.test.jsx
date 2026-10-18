import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock router navigation and the auth hook.
const navigate = vi.fn();
const login = vi.fn().mockResolvedValue({ role: 'student' });

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../api/client.js', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { emailVerification: false, passwordReset: false } }), post: vi.fn() } }));

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ login }),
}));

import Login from './Login.jsx';

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockClear();
  login.mockClear();
});

describe('Login page', () => {
  it('renders the email and password fields and submit button', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('submits credentials and navigates home on success (happy path)', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.com', 'password123'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
  });
});
