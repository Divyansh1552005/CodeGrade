import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// withCredentials so the browser sends the httpOnly refresh cookie on
// /auth/refresh (and receives the rotated Set-Cookie).
export const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

// A bare client (no interceptors) for the refresh call itself, so a failing
// refresh doesn't recurse back through the refresh logic.
const bare = axios.create({ baseURL: BASE_URL, withCredentials: true });

// --- Bridge to React state ---------------------------------------------------
// The access token is owned by React state (AuthContext). The interceptors run
// outside React, so AuthContext registers a getter (to read the current token)
// and handlers (to push a refreshed token back into state, or to log out). No
// token is stored in this module — these are just function references.
let getToken = () => null;
let onRefreshed = () => {};
let onLogout = () => {};

export function registerTokenAccessor(fn) {
  getToken = fn;
}

export function setAuthHandlers({ onRefreshed: refreshed, onLogout: logout }) {
  if (refreshed) onRefreshed = refreshed;
  if (logout) onLogout = logout;
}

// --- Request interceptor: attach the current access token as a Bearer. -------
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Exchange the refresh cookie for a new access token. Hands the token to React
// state via onRefreshed and returns it for the retry.
export async function refreshAccessToken() {
  const { data } = await bare.post('/auth/refresh');
  onRefreshed(data.accessToken);
  return data.accessToken;
}

// --- Response interceptor: on a 401, refresh once and retry. ------------------
// Single-flight: concurrent 401s share one refresh request.
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isAuthCall =
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/login');

    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = refreshAccessToken().finally(() => {
            refreshing = null;
          });
        }
        const newToken = await refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        onLogout();
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
