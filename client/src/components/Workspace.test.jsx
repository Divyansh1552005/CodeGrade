import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './AppShell.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';

const auth = vi.hoisted(() => ({ role: 'student', logout: vi.fn() }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ isAuthed: true, user: { _id: 'user', name: 'Alex', role: auth.role }, logout: auth.logout }) }));
vi.mock('../api/useCachedQuery.js', () => ({ useCachedQuery: () => ({ data: null }) }));
vi.mock('../theme/ThemeContext.jsx', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
beforeEach(() => { auth.role = 'student'; auth.logout.mockReset(); });

it('opens the mobile drawer, keeps role-specific links scoped, and closes it after navigation', async () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const drawer = await screen.findByRole('dialog');
  const navigation = within(drawer).getByRole('navigation', { name: 'Main navigation' });
  expect(within(navigation).queryByRole('link', { name: 'Review queue' })).not.toBeInTheDocument();
  fireEvent.click(within(navigation).getByRole('link', { name: 'Problems' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('includes teacher review and import tools in the navigation', () => {
  auth.role = 'teacher';
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(within(navigation).getByRole('link', { name: 'Review queue' })).toHaveAttribute('href', '/review');
  expect(within(navigation).getByRole('link', { name: 'Imports and reports' })).toHaveAttribute('href', '/bulk-jobs');
});
it('reports logout failure without stranding the control in a loading state', async () => {
  auth.logout.mockRejectedValue(new Error('Network unavailable'));
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));
  await waitFor(() => expect(auth.logout).toHaveBeenCalled());
  fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
  expect(await screen.findByRole('menuitem', { name: 'Log out' })).not.toHaveAttribute('aria-disabled', 'true');
});
function DialogHarness({ busy = false }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Delete item</button><ConfirmDialog open={open} busy={busy} onClose={() => setOpen(false)} onConfirm={vi.fn()} title="Delete problem?" message="This action removes the problem." confirmLabel="Delete" /></>;
}
it('starts on Cancel, supports Escape and restores focus to its trigger', async () => {
  render(<DialogHarness />);
  const trigger = screen.getByRole('button', { name: 'Delete item' });
  trigger.focus(); fireEvent.click(trigger);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('does not allow Escape to dismiss a confirmation while its action is running', async () => {
  render(<DialogHarness busy />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }));
  await screen.findByRole('dialog');
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
it('labels markdown input and exposes the selected write/preview state', () => {
  render(<MarkdownEditor label="Question details" value="**Important**" onChange={vi.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Question details' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Important')).toBeInTheDocument();
});
