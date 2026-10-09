import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavBar from './NavBar.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';

const auth = vi.hoisted(() => ({ role: 'student', logout: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ isAuthed: true, user: { _id: 'user', name: 'Alex', role: auth.role }, logout: auth.logout }) }));
vi.mock('../theme/ThemeContext.jsx', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
beforeEach(() => { auth.role = 'student'; auth.logout.mockReset(); });

it('opens mobile navigation, keeps role-specific links scoped, and closes it after navigation', async () => {
  render(<MemoryRouter><NavBar /></MemoryRouter>);
  const toggle = screen.getByRole('button', { name: 'Open navigation' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  const navigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(navigation).queryByRole('link', { name: 'Review queue' })).not.toBeInTheDocument();
  fireEvent.click(within(navigation).getByRole('link', { name: 'Problem library' }));
  await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument());
});
it('includes teacher review and import tools in the mobile menu', () => {
  auth.role = 'teacher';
  render(<MemoryRouter><NavBar /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const navigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(within(navigation).getByRole('link', { name: 'Review queue' })).toHaveAttribute('href', '/review');
  expect(within(navigation).getByRole('link', { name: 'Imports & reports' })).toHaveAttribute('href', '/bulk-jobs');
});
it('reports logout failure without stranding the control in a loading state', async () => {
  auth.logout.mockRejectedValue(new Error('Network unavailable'));
  render(<MemoryRouter><NavBar /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled());
});
function DialogHarness({ busy = false }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Delete item</button><ConfirmDialog open={open} busy={busy} onClose={() => setOpen(false)} onConfirm={vi.fn()} title="Delete problem?" message="This action removes the problem." confirmLabel="Delete" /></>;
}
it('traps dialog focus, supports Escape and restores focus to its trigger', async () => {
  render(<DialogHarness />);
  const trigger = screen.getByRole('button', { name: 'Delete item' });
  trigger.focus(); fireEvent.click(trigger);
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  const confirm = screen.getByRole('button', { name: 'Delete' });
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(confirm).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe('hidden');
});
it('does not allow Escape to dismiss a confirmation while its action is running', () => {
  render(<DialogHarness busy />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
it('labels markdown input and exposes the selected write/preview state', () => {
  render(<MarkdownEditor label="Question details" value="**Important**" onChange={vi.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Question details' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Important')).toBeInTheDocument();
});
