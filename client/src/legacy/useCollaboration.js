import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

/**
 * useCollaboration — Yjs-powered, subscriber pattern.
 * 
 * ARCHITECTURE:
 *   - Component state is THE source of truth for rendering.
 *   - Yjs is the sync transport.
 *   - LOCAL changes: component.setState() + Y.Map.set() (observer suppressed)
 *   - REMOTE changes: Y.Map observer fires → dispatches to ALL subscribers
 *
 * SUBSCRIBER PATTERN:
 *   addListener('entity:add', fn) → returns unsubscribe function
 *   Multiple components (Graph, Whiteboard) can listen without overwriting.
 */
const LOCAL_ORIGIN = 'local';

export function useCollaboration({ roomId, userName, password, isCreator, wsUrl, authToken }) {
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [initialState, setInitialState] = useState(null);
  const [collaborators, setCollaborators] = useState({});

  const [isOwner, setIsOwner] = useState(false);
  const [collabRole, setCollabRole] = useState('editor'); // viewer | editor
  const [collabRoles, setCollabRoles] = useState({}); // userId → role
  const [joinStatus, setJoinStatus] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [kicked, setKicked] = useState(false);
  const [ownerDisconnected, setOwnerDisconnected] = useState(false);

  const docRef = useRef(null);
  const providerRef = useRef(null);
  const customWsRef = useRef(null);
  const listenersRef = useRef({}); // event → Set<fn>
  const initializedRef = useRef(false);
  const reconnectTimer = useRef(null);
  const userColor = useRef(`hsl(${Math.random() * 360}, 70%, 60%)`);

  const host = wsUrl ? new URL(wsUrl).hostname : window.location.hostname;
  const isSecure = window.location.protocol === 'https:';
  const wsProto = isSecure ? 'wss' : 'ws';
  const httpProto = isSecure ? 'https' : 'http';
  // In production (port 80/443 via nginx), use same host without port
  // In dev, use explicit ports
  const isDev = window.location.port && !['80','443'].includes(window.location.port);
  const yjsUrl = isDev ? `ws://${host}:1234` : `${wsProto}://${host}/yjs`;
  const apiBase = isDev ? `http://${host}:4444` : `${httpProto}://${host}`;
  const customWsUrl2 = isDev ? `ws://${host}:4444/ws-custom` : `${wsProto}://${host}/ws-custom`;

  // ═══ SUBSCRIBER SYSTEM ═══
  const dispatch = useCallback((event, ...args) => {
    const fns = listenersRef.current[event];
    console.log(`[collab] dispatch '${event}' → ${fns?.size || 0} listeners`);
    if (fns) fns.forEach(fn => { try { fn(...args); } catch(e) { console.error(`[collab] listener error ${event}:`, e); } });
  }, []);

  const addListener = useCallback((event, fn) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = new Set();
    listenersRef.current[event].add(fn);
    console.log(`[collab] addListener '${event}' → now ${listenersRef.current[event].size} listener(s). Total events: ${Object.keys(listenersRef.current).join(', ')}`);
    return () => listenersRef.current[event]?.delete(fn);
  }, []);

  // Legacy compat: onRemote({onEntityAdd, ...}) → registers each as listener
  const onRemote = useCallback((handlers) => {
    const unsubs = [];
    for (const [key, fn] of Object.entries(handlers)) {
      // Convert onEntityAdd → entity:add, onWbElementAdd → wb:element:add etc.
      const event = key.replace(/^on/, '').replace(/([A-Z])/g, ':$1').toLowerCase().replace(/^:/, '');
      unsubs.push(addListener(event, fn));
    }
    // Return unsub function
    return () => unsubs.forEach(u => u());
  }, [addListener]);

  // ═══ YJS CONNECTION ═══
  useEffect(() => {
    if (!roomId || !userName) return;

    const doc = new Y.Doc();
    docRef.current = doc;
    const entMap = doc.getMap('entities');
    const linkMap = doc.getMap('links');
    const stickerMap = doc.getMap('stickers');
    const postitMap = doc.getMap('postits');
    const timelineArray = doc.getArray('timeline');

    // Generic observer: dispatches events for remote changes
    function observeMap(map, prefix) {
      map.observe((event, transaction) => {
        console.log(`[collab] Y.Map '${prefix}' observer: ${event.changes.keys.size} changes, origin=${transaction.origin}, isLocal=${transaction.origin === LOCAL_ORIGIN}`);
        if (transaction.origin === LOCAL_ORIGIN) return;
        if (transaction.origin === 'init') return;

        event.changes.keys.forEach((change, key) => {
          const val = map.get(key);
          if (change.action === 'add' && val) dispatch(`${prefix}:add`, val);
          else if (change.action === 'update' && val) dispatch(`${prefix}:update`, key, val);
          else if (change.action === 'delete') dispatch(`${prefix}:delete`, key);
        });
      });
    }

    observeMap(entMap, 'entity');
    observeMap(linkMap, 'link');
    observeMap(stickerMap, 'sticker');
    observeMap(postitMap, 'postit');

    // Timeline observer (Y.Array — different from Y.Map)
    timelineArray.observe((event, transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      if (transaction.origin === 'init') return;
      // Get newly added items
      let idx = 0;
      event.changes.delta.forEach(d => {
        if (d.retain) idx += d.retain;
        if (d.insert) {
          d.insert.forEach(item => dispatch('timeline:add', item));
        }
      });
    });

    // Provider
    const provider = new WebsocketProvider(yjsUrl, roomId, doc, {
      params: { token: authToken || '' },
    });
    providerRef.current = provider;

    provider.on('status', ({ status }) => { console.log(`[collab] Yjs status: ${status}`); setConnected(status === 'connected'); });
    provider.on('sync', (isSynced) => {
      console.log(`[collab] Yjs sync: ${isSynced}, entities in doc: ${entMap.size}`);
      setSynced(isSynced);
      if (isSynced && !initializedRef.current) {
        initializedRef.current = true;
        if (true) {
          const token = authToken || localStorage.getItem('om_token');
          fetch(`${apiBase}/api/yjs-state/${roomId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data) { setInitialState({ entities: [], links: [], stickers: [], postits: [], timeline: [], caseInfo: {} }); return; }
              doc.transact(() => {
                if (data.entities) for (const [id, ent] of Object.entries(data.entities)) entMap.set(id, ent);
                if (data.links) for (const [id, lk] of Object.entries(data.links)) linkMap.set(id, lk);
                if (data.stickers) for (const [id, s] of Object.entries(data.stickers)) stickerMap.set(id, s);
                if (data.postits) for (const [id, p] of Object.entries(data.postits)) postitMap.set(id, p);
                if (data.timeline && Array.isArray(data.timeline)) timelineArray.push(data.timeline);
              }, 'init');
              setInitialState({
                entities: Object.values(data.entities || {}),
                links: Object.values(data.links || {}),
                stickers: Object.values(data.stickers || {}),
                postits: Object.values(data.postits || {}),
                timeline: data.timeline || [],
                caseInfo: data.meta || {},
              });
            })
            .catch(() => setInitialState({ entities: [], links: [], stickers: [], postits: [], timeline: [], caseInfo: {} }));
        } else {
          setInitialState({
            entities: Array.from(entMap.values()),
            links: Array.from(linkMap.values()),
            stickers: Array.from(stickerMap.values()),
            postits: Array.from(postitMap.values()),
            timeline: timelineArray.toArray(),
            caseInfo: {},
          });
        }
      }
    });

    // Awareness
    const awareness = provider.awareness;
    awareness.setLocalState({ user: { name: userName, color: userColor.current }, cursor: null });
    awareness.on('change', () => {
      const states = awareness.getStates();
      const collabs = {};
      states.forEach((state, clientId) => {
        if (clientId === doc.clientID || !state?.user) return;
        collabs[clientId] = {
          id: clientId, name: state.user.name, color: state.user.color,
          cursor: state.cursor || null, selection: state.selection || null,
        };
      });
      setCollaborators(collabs);
    });

    return () => {
      provider.destroy();
      doc.destroy();
      docRef.current = null;
      providerRef.current = null;
      initializedRef.current = false;
    };
  }, [roomId, userName, yjsUrl, apiBase, authToken, dispatch]);

  // ═══ CUSTOM WS ═══
  useEffect(() => {
    if (!roomId || !userName) return;
    let alive = true;
    const connect = () => {
      if (!alive || kicked) return;
      const ws = new WebSocket(customWsUrl2);
      customWsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', caseId: roomId, token: authToken || localStorage.getItem('om_token'), color: userColor.current }));
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'custom:init': setIsOwner(!!msg.isOwner); setCollabRole(msg.collabRole || 'editor'); setJoinStatus(null); break;
          case 'join:pending': setJoinStatus('pending'); break;
          case 'join:denied': setJoinStatus(`denied:${msg.reason}`); break;
          case 'join:request': setJoinRequests(p => [...p.filter(r => r.user.id !== msg.user.id), { user: msg.user }]); break;
          case 'user:joined:notify': setJoinRequests(p => [...p.filter(r => r.user.id !== msg.user.id), { user: msg.user, autoJoined: true }]); break;
          case 'role:changed': setCollabRole(msg.collabRole); break;
          case 'roles:update': setCollabRoles(msg.roles || {}); break;
          case 'roster': setCollabRoles(msg.roles || {}); break;
          case 'chat': setChatMessages(p => [...p.slice(-99), msg.message]); break;
          case 'kicked': setKicked(true); break;
          case 'owner:disconnected': setOwnerDisconnected(true); break;
        }
      };
      ws.onclose = () => { customWsRef.current = null; if (alive && !kicked) reconnectTimer.current = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { alive = false; clearTimeout(reconnectTimer.current); customWsRef.current?.close(); };
  }, [roomId, userName, customWsUrl2, authToken, kicked]);

  // ═══ MUTATE Y.Map with LOCAL_ORIGIN ═══
  const mutate = useCallback((mapName, fn) => {
    const doc = docRef.current;
    console.log(`[collab] mutate '${mapName}' doc=${!!doc}`);
    if (!doc) return;
    doc.transact(() => fn(doc.getMap(mapName)), LOCAL_ORIGIN);
  }, []);

  const sendEntityAdd = useCallback((ent) => { console.log('[collab] sendEntityAdd', ent.id); mutate('entities', m => m.set(ent.id, { ...ent })); }, [mutate]);
  const sendEntityUpdate = useCallback((id, u) => mutate('entities', m => { const e = m.get(id); if (e) m.set(id, { ...e, ...u }); }), [mutate]);
  const sendEntityDelete = useCallback((id) => mutate('entities', m => m.delete(id)), [mutate]);
  const sendLinkAdd = useCallback((lk) => mutate('links', m => m.set(lk.id, { ...lk })), [mutate]);
  const sendLinkUpdate = useCallback((id, u) => mutate('links', m => { const l = m.get(id); if (l) m.set(id, { ...l, ...u }); }), [mutate]);
  const sendLinkDelete = useCallback((id) => mutate('links', m => m.delete(id)), [mutate]);
  const sendStickerAdd = useCallback((s) => mutate('stickers', m => m.set(s.id, { ...s })), [mutate]);
  const sendStickerDelete = useCallback((id) => mutate('stickers', m => m.delete(id)), [mutate]);
  const sendPostitAdd = useCallback((p) => mutate('postits', m => m.set(p.id, { ...p })), [mutate]);
  const sendPostitUpdate = useCallback((id, u) => mutate('postits', m => { const p = m.get(id); if (p) m.set(id, { ...p, ...u }); }), [mutate]);
  const sendPostitDelete = useCallback((id) => mutate('postits', m => m.delete(id)), [mutate]);

  const sendTimelineEvent = useCallback((event) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => { doc.getArray('timeline').push([event]); }, LOCAL_ORIGIN);
  }, []);

  const sendCursor = useCallback((pos) => providerRef.current?.awareness.setLocalStateField('cursor', pos), []);
  const sendSelection = useCallback((sel) => providerRef.current?.awareness.setLocalStateField('selection', sel), []);

  const customSend = useCallback((msg) => { if (customWsRef.current?.readyState === 1) customWsRef.current.send(JSON.stringify(msg)); }, []);
  const sendChat = useCallback((text) => customSend({ type: 'chat', text }), [customSend]);
  const approveJoin = useCallback((uid) => { customSend({ type: 'join:approve', userId: uid }); setJoinRequests(p => p.filter(r => r.user.id !== uid)); }, [customSend]);
  const denyJoin = useCallback((uid) => { customSend({ type: 'join:deny', userId: uid }); setJoinRequests(p => p.filter(r => r.user.id !== uid)); }, [customSend]);
  const kickUser = useCallback((uid) => customSend({ type: 'kick', targetUserId: uid }), [customSend]);
  const setUserRole = useCallback((uid, role) => customSend({ type: 'role:set', targetUserId: uid, role }), [customSend]);
  const dismissJoinNotif = useCallback((uid) => setJoinRequests(p => p.filter(r => r.user.id !== uid)), []);

  return {
    connected, synced, userId: null, userColor: userColor.current,
    isOwner, collabRole, collabRoles, joinStatus, joinRequests, kicked, ownerDisconnected,
    collaborators, chatMessages, initialState,
    onRemote, addListener,
    sendEntityAdd, sendEntityUpdate, sendEntityDelete,
    sendLinkAdd, sendLinkUpdate, sendLinkDelete,
    sendStickerAdd, sendStickerDelete,
    sendPostitAdd, sendPostitUpdate, sendPostitDelete,
    sendTimelineEvent,
    sendCursor, sendSelection,
    sendChat, approveJoin, denyJoin, kickUser, setUserRole, dismissJoinNotif,
    lockEntity: () => {}, unlockEntity: () => {}, isLockedByOther: () => null, locks: {},
    sendCaseInfo: () => {}, remoteHistory: [],
  };
}
