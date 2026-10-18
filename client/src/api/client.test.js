import { beforeEach, expect, it, vi } from 'vitest';
import { api, setAuthHandlers, registerTokenAccessor } from './client.js';

const httpError = (config, status, data) => Object.assign(new Error('http'), { config, response: { status, data, config, headers: {} } });
// Stand in for the network: answer by a status table, and record each request.
function respondWith(table) {
  const calls = [];
  api.defaults.adapter = async (config) => {
    calls.push(config.url);
    const hit = table[config.url];
    if (hit.status >= 400) throw httpError(config, hit.status, hit.data);
    return { data: hit.data, status: hit.status, statusText: 'OK', headers: {}, config };
  };
  return calls;
}

const handlers = { onRefreshed: vi.fn(), onLogout: vi.fn(), onForbidden: vi.fn() };
beforeEach(() => {
  Object.values(handlers).forEach((fn) => fn.mockReset());
  setAuthHandlers(handlers);
  registerTokenAccessor(() => 'tok');
});

it('reports a 403 with a known code to the app, and does not refresh or log out', async () => {
  const calls = respondWith({ '/doubts': { status: 403, data: { code: 'FORBIDDEN_ROLE', error: 'no' } } });
  await expect(api.get('/doubts')).rejects.toMatchObject({ response: { status: 403 } });
  expect(handlers.onForbidden).toHaveBeenCalledWith({ code: 'FORBIDDEN_ROLE', error: 'no' });
  expect(handlers.onLogout).not.toHaveBeenCalled();
  expect(handlers.onRefreshed).not.toHaveBeenCalled();
  expect(calls).toEqual(['/doubts']); // no /auth/refresh, no retry
});

it('leaves a 403 without a code to the page that asked', async () => {
  respondWith({ '/x': { status: 403, data: { error: 'nope' } }, '/y': { status: 403, data: undefined } });
  await expect(api.get('/x')).rejects.toBeTruthy();
  await expect(api.get('/y')).rejects.toBeTruthy();
  expect(handlers.onForbidden).not.toHaveBeenCalled();
  expect(handlers.onLogout).not.toHaveBeenCalled();
});
