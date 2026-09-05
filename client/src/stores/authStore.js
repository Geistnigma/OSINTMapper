import { create } from 'zustand';
import { api } from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,

  /**
   * La session vit dans un cookie `HttpOnly` : le client ne peut pas la lire,
   * donc il DEMANDE au serveur. L'ancien code court-circuitait cet appel quand
   * `localStorage` était vide - commentaire d'époque : « don't try cookies ».
   * Avec le cookie pour seule source, ce raccourci déconnectait tout le monde.
   */
  checkAuth: async () => {
    try {
      const data = await api('/api/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      // Le jeton renvoyé dans le corps n'est volontairement PAS conservé : le
      // cookie posé par la réponse suffit, et rien de lisible en JS ne subsiste.
      set({ user: data.user, error: null });
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
      set({ user: data.user, error: null });
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },

  logout: async () => {
    // C'est le serveur qui efface le cookie (mêmes options qu'à la pose,
    // sinon il survit à la déconnexion).
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
