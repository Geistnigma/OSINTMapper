const BASE = import.meta.env.VITE_API_URL || '';
const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:4444/ws`;

function getToken() {
  return localStorage.getItem('om_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('om_token', token);
  else localStorage.removeItem('om_token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    credentials: 'include',
  });

  if (res.status === 401) {
    // Token expired — clear and redirect
    setToken(null);
    if (window.location.pathname !== '/login') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function getWsUrl() {
  return WS_BASE;
}

export { getToken };
