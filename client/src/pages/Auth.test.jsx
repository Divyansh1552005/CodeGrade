import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login.jsx';
import Register from './Register.jsx';
import AuthCard, { AuthChallenge } from '../components/AuthCard.jsx';

const navigate = vi.fn();
const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => auth }));
beforeEach(() => { navigate.mockClear(); auth.login.mockReset(); auth.register.mockReset(); });

it('shows the server error under the form and re-enables the button after a failed login', async () => {
  auth.login.mockRejectedValue({ response: { data: { error: 'Invalid email or password' } } });
  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());
  expect(navigate).not.toHaveBeenCalled();
});
it('registers with the chosen role and goes to the dashboard', async () => {
  auth.register.mockResolvedValue({});
  render(<MemoryRouter><Register /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 's@x.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'teacher' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(auth.register).toHaveBeenCalledWith({ name: 'Sam', email: 's@x.com', password: 'secret1', role: 'teacher' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
  expect(screen.getByText('At least 6 characters.')).toBeInTheDocument();
});
it('renders provider buttons above the form with a divider, and reserves room for a challenge widget', () => {
  render(<AuthCard title="Log in" providers={<button>Continue with Google</button>}><form><AuthChallenge><div>widget</div></AuthChallenge></form></AuthCard>);
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  expect(screen.getByRole('separator')).toBeInTheDocument();
  expect(screen.getByText('widget').parentElement).toHaveClass('min-h-16');
});
