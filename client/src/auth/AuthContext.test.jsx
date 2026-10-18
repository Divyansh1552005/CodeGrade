import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { api, refreshAccessToken, setAuthHandlers } from '../api/client.js';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/useCachedQuery.js', () => ({ invalidate: vi.fn() }));
const client = vi.hoisted(() => ({ handlers: {} }));
vi.mock('../api/client.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  refreshAccessToken: vi.fn(),
  registerTokenAccessor: vi.fn(),
  setAuthHandlers: vi.fn((h) => { client.handlers = h; }),
}));

const Probe = () => { const { user, notice } = useAuth(); return <output>{user ? `${user.role}` : 'signed-out'}|{notice}</output>; };
const mount = async (user) => {
  refreshAccessToken.mockResolvedValue('t');
  api.get.mockResolvedValue({ data: { user } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(user.role));
};

beforeEach(() => { vi.clearAllMocks(); });

describe('global 403 handling', () => {
  it('reloads the stored role on FORBIDDEN_ROLE, tells the user, and keeps the session', async () => {
    await mount({ _id: '1', role: 'teacher' });
    api.get.mockResolvedValue({ data: { user: { _id: '1', role: 'student' } } });
    act(() => client.handlers.onForbidden({ code: 'FORBIDDEN_ROLE' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('student|'));
    expect(toast.error).toHaveBeenCalledWith('Your access to that page changed.');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('moves an applicant-turned-pending user without a toast on TEACHER_PENDING', async () => {
    await mount({ _id: '1', role: 'teacher' });
    api.get.mockResolvedValue({ data: { user: { _id: '1', role: 'teacher_applicant' } } });
    act(() => client.handlers.onForbidden({ code: 'TEACHER_PENDING' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('teacher_applicant'));
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('signs a suspended account out with a message', async () => {
    await mount({ _id: '1', role: 'student' });
    act(() => client.handlers.onForbidden({ code: 'ACCOUNT_SUSPENDED' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('signed-out|suspended'));
    expect(toast.error).toHaveBeenCalledWith('This account is suspended.');
  });
  it('does not loop: a burst of 403s causes one reload, and a failed reload neither logs out nor retries', async () => {
    await mount({ _id: '1', role: 'teacher' });
    api.get.mockClear();
    let reject; api.get.mockReturnValue(new Promise((_, r) => { reject = r; }));
    act(() => { client.handlers.onForbidden({ code: 'FORBIDDEN_ROLE' }); client.handlers.onForbidden({ code: 'FORBIDDEN_ROLE' }); client.handlers.onForbidden({ code: 'TEACHER_PENDING' }); });
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error('down')); });
    expect(screen.getByRole('status')).toHaveTextContent('teacher|');
    // The guard resets afterwards, so a later 403 is handled again.
    api.get.mockResolvedValue({ data: { user: { _id: '1', role: 'student' } } });
    act(() => client.handlers.onForbidden({ code: 'FORBIDDEN_ROLE' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('student'));
  });
  it('ignores an unknown code', async () => {
    await mount({ _id: '1', role: 'student' });
    api.get.mockClear();
    act(() => client.handlers.onForbidden({ code: 'SOMETHING_ELSE' }));
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('student|');
  });
});
