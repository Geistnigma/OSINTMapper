import { create } from 'zustand';
import { api, setToken, getToken } from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: getToken(),
  loading: true,
  error: null,

  checkAuth: async () => {
    const token = getToken();
    if (!token) {
      // No localStorage token — don't try cookies, just mark as unauthenticated
      set({ loading: false, user: null });
      return;
    }
    try {
      const data = await api('/api/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      setToken(null);
      set({ user: null, token: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      set({ user: data.user, token: data.token, error: null });
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },

  register: async (username, email, password, displayName) => {
    set({ error: null });
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, displayName }),
      });
      setToken(data.token);
      set({ user: data.user, token: data.token, error: null });
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },

  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
