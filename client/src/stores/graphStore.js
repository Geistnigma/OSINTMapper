import { create } from 'zustand';

const genId = () => Math.random().toString(36).slice(2, 10);

const useGraphStore = create((set, get) => ({
  // Data
  entities: [],
  links: [],
  stickers: [],
  postits: [],
  caseInfo: { title: '', description: '', tags: '' },
  timeline: [],

  // Selection
  selectedId: null,
  selectedLinkId: null,
  selectedStickerId: null,
  selectedPostitId: null,

  // Canvas
  pan: { x: 0, y: 0 },
  zoom: 1,

  // UI state
  rightPanelOpen: false,
  editingLabel: null,
  editingPostit: null,

  // ═══ LOAD STATE (from server init) ═══
  loadState: (state) => set({
    entities: state.entities || [],
    links: state.links || [],
    stickers: state.stickers || [],
    postits: state.postits || [],
    caseInfo: state.caseInfo || { title: '', description: '', tags: '' },
  }),

  // ═══ ENTITIES ═══
  addEntity: (entity) => {
    set(s => ({ entities: [...s.entities, entity] }));
    get()._logAction(`"${entity.label}" ajoutée`);
    return entity;
  },
  updateEntity: (id, updates) => set(s => ({ entities: s.entities.map(e => e.id === id ? { ...e, ...updates } : e) })),
  deleteEntity: (id) => set(s => {
    const ent = s.entities.find(e => e.id === id);
    return {
      entities: s.entities.filter(e => e.id !== id),
      links: s.links.filter(l => l.from !== id && l.to !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      rightPanelOpen: s.selectedId === id ? false : s.rightPanelOpen,
    };
  }),

  // ═══ LINKS ═══
  addLink: (link) => {
    set(s => {
      if (link.from === link.to) return s;
      if (s.links.find(l => (l.from === link.from && l.to === link.to) || (l.from === link.to && l.to === link.from))) return s;
      return { links: [...s.links, link] };
    });
  },
  updateLink: (id, updates) => set(s => ({ links: s.links.map(l => l.id === id ? { ...l, ...updates } : l) })),
  deleteLink: (id) => set(s => ({
    links: s.links.filter(l => l.id !== id),
    selectedLinkId: s.selectedLinkId === id ? null : s.selectedLinkId,
  })),

  // ═══ STICKERS ═══
  addSticker: (sticker) => set(s => ({ stickers: [...s.stickers, sticker] })),
  updateSticker: (id, updates) => set(s => ({ stickers: s.stickers.map(st => st.id === id ? { ...st, ...updates } : st) })),
  deleteSticker: (id) => set(s => ({ stickers: s.stickers.filter(st => st.id !== id), selectedStickerId: s.selectedStickerId === id ? null : s.selectedStickerId })),

  // ═══ POSTITS ═══
  addPostit: (postit) => set(s => ({ postits: [...s.postits, postit] })),
  updatePostit: (id, updates) => set(s => ({ postits: s.postits.map(p => p.id === id ? { ...p, ...updates } : p) })),
  deletePostit: (id) => set(s => ({ postits: s.postits.filter(p => p.id !== id), selectedPostitId: s.selectedPostitId === id ? null : s.selectedPostitId })),

  // ═══ SELECTION ═══
  select: (id) => set({ selectedId: id, selectedLinkId: null, selectedStickerId: null, selectedPostitId: null }),
  selectLink: (id) => set({ selectedLinkId: id, selectedId: null, selectedStickerId: null, selectedPostitId: null, rightPanelOpen: true }),
  selectSticker: (id) => set({ selectedStickerId: id, selectedId: null, selectedLinkId: null, selectedPostitId: null }),
  selectPostit: (id) => set({ selectedPostitId: id, selectedId: null, selectedLinkId: null, selectedStickerId: null }),
  clearSelection: () => set({ selectedId: null, selectedLinkId: null, selectedStickerId: null, selectedPostitId: null }),

  // ═══ CANVAS ═══
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom }),

  // ═══ CASE INFO ═══
  setCaseInfo: (info) => set({ caseInfo: info }),

  // ═══ TIMELINE ═══
  _logAction: (action) => {
    const entry = { id: genId(), action, timestamp: new Date().toISOString(), user: 'Vous' };
    set(s => ({ timeline: [entry, ...s.timeline].slice(0, 200) }));
  },

  // ═══ IMPORT (replace all state) ═══
  importState: (state) => set({
    entities: state.entities || [],
    links: state.links || [],
    stickers: state.stickers || [],
    postits: state.postits || [],
  }),

  // ═══ HASH (for auto-save change detection) ═══
  getStateHash: () => {
    const { entities, links, stickers, postits, caseInfo } = get();
    return JSON.stringify({ e: entities.length, l: links.length, s: stickers.length, p: postits.length, ci: caseInfo.title }).length + '_' + entities.map(e => e.id + e.x + e.y).join('');
  },
}));

export default useGraphStore;
