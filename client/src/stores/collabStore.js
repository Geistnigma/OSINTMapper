import { create } from 'zustand';

const useCollabStore = create((set, get) => ({
  connected: false,
  userId: null,
  isOwner: false,
  collaborators: {},
  locks: {},
  chatMessages: [],
  joinStatus: null,
  joinRequests: [],
  ownerDisconnected: false,
  kicked: false,

  // Setters (called by useCollab hook)
  setConnected: (v) => set({ connected: v }),
  setUserId: (v) => set({ userId: v }),
  setIsOwner: (v) => set({ isOwner: v }),
  setCollaborators: (v) => set({ collaborators: v }),
  addCollaborator: (id, user) => set(s => ({ collaborators: { ...s.collaborators, [id]: user } })),
  removeCollaborator: (id) => set(s => {
    const c = { ...s.collaborators };
    delete c[id];
    return { collaborators: c };
  }),
  setLocks: (v) => set({ locks: v }),
  addLock: (entityId, userId, userName) => set(s => ({ locks: { ...s.locks, [entityId]: { userId, userName } } })),
  removeLock: (entityId) => set(s => {
    const l = { ...s.locks };
    delete l[entityId];
    return { locks: l };
  }),
  addChatMessage: (msg) => set(s => ({ chatMessages: [...s.chatMessages, msg] })),
  setJoinStatus: (v) => set({ joinStatus: v }),
  addJoinRequest: (req) => set(s => ({ joinRequests: [...s.joinRequests, req] })),
  removeJoinRequest: (uid) => set(s => ({ joinRequests: s.joinRequests.filter(r => r.user.id !== uid) })),
  setOwnerDisconnected: (v) => set({ ownerDisconnected: v }),
  setKicked: (v) => set({ kicked: v }),

  reset: () => set({
    connected: false, userId: null, isOwner: false, collaborators: {},
    locks: {}, chatMessages: [], joinStatus: null, joinRequests: [],
    ownerDisconnected: false, kicked: false,
  }),
}));

export default useCollabStore;
