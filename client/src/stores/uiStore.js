import { create } from 'zustand';

const useUiStore = create((set) => ({
  theme: localStorage.getItem('om_theme') || 'dark',
  rightPanelOpen: false,
  chatOpen: false,
  contextMenu: null,
  toasts: [],

  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('om_theme', next);
    return { theme: next };
  }),

  setContextMenu: (menu) => set({ contextMenu: menu }),
  setRightPanel: (open) => set({ rightPanelOpen: open }),
  setChatOpen: (open) => set({ chatOpen: open }),

  showToast: (message, type = 'info') => set(s => ({
    toasts: [...s.toasts, { id: Date.now(), message, type }],
  })),

  removeToast: (id) => set(s => ({
    toasts: s.toasts.filter(t => t.id !== id),
  })),
}));

export default useUiStore;
