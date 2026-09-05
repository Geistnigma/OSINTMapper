import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { traduire } from '../i18n';

/**
 * useCollaboration - Yjs-powered, subscriber pattern.
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

// Les traces de synchronisation sont très bavardes (une ligne par mutation et
// par observer). On les garde disponibles via localStorage.om_debug = '1'.
const DEBUG = (() => { try { return localStorage.getItem('om_debug') === '1'; } catch { return false; } })();
const log = (...a) => { if (DEBUG) console.log(...a); };

// Bail des verrous d'édition : renouvelé toutes les 8 s, considéré périmé au
// bout de 25 s. Un client qui plante libère donc l'entité en moins de 25 s.
const LOCK_RENEW_MS = 8000;
const LOCK_TTL_MS = 25000;

/**
 * Convertit un élément (entité, lien…) en Y.Map dont chaque champ est une clé.
 *
 * Les éléments étaient stockés comme objets JS opaques : Yjs ne voyait qu'une
 * valeur atomique, donc deux clients modifiant des champs différents de la même
 * entité s'écrasaient mutuellement (le dernier écrivait tout l'objet). Avec une
 * Y.Map par élément, la fusion se fait champ par champ.
 *
 * Les valeurs imbriquées (metadata, comments) restent des objets opaques : la
 * granularité s'arrête au premier niveau, ce qui suffit aux conflits courants
 * (label vs notes vs position).
 */
function toYItem(obj) {
  const m = new Y.Map();
  for (const [k, v] of Object.entries(obj || {})) m.set(k, v);
  return m;
}

/** Lit un élément, qu'il soit une Y.Map ou un objet simple (tolérance au format). */
function plain(v) {
  if (v instanceof Y.Map) return v.toJSON();
  return v;
}

/**
 * @param {boolean} [collabMode=true] - en mode solo, aucune socket n'est
 *   ouverte (ni Yjs ni /ws-custom) : l'état initial est simplement chargé en
 *   HTTP. Auparavant le hook se connectait toujours, si bien que deux sessions
 *   « solo » sur la même enquête se synchronisaient partiellement.
 */
export function useCollaboration({ roomId, userName, wsUrl, collabMode = true }) {
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [initialState, setInitialState] = useState(null);
  const [collaborators, setCollaborators] = useState({});

  const [isOwner, setIsOwner] = useState(false);
  const [collabRole, setCollabRole] = useState('editor'); // viewer | editor
  const [collabRoles, setCollabRoles] = useState({}); // userId → role
  const [roleError, setRoleError] = useState(null); // refus du serveur, à afficher
  const [joinStatus, setJoinStatus] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [kicked, setKicked] = useState(false);
  const [ownerDisconnected, setOwnerDisconnected] = useState(false);
  const [syncError, setSyncError] = useState(null); // null | 'unauthorized' | 'forbidden'
  const [userId, setUserId] = useState(null); // renseigné par custom:init
  const [roomUsers, setRoomUsers] = useState([]); // membres présents (via /ws-custom)
  const [chatThrottled, setChatThrottled] = useState(0); // secondes avant réessai
  // Un seul client écrit le fichier de sauvegarde (voir élection dans awareness)
  const [isSaveLeader, setIsSaveLeader] = useState(true);

  // Le doc est exposé en state (et pas seulement en ref) pour que les effets
  // qui en dépendent - provider, chargement solo - se relancent quand il est
  // recréé. Une ref ne déclencherait aucune ré-exécution.
  const [doc, setDoc] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoRef = useRef(null);
  const docRef = useRef(null);
  const providerRef = useRef(null);
  const customWsRef = useRef(null);
  const listenersRef = useRef({}); // event → Set<fn>
  const initializedRef = useRef(false);
  const reconnectTimer = useRef(null);
  const userColor = useRef(`hsl(${Math.random() * 360}, 70%, 60%)`);

  /**
   * Toutes les URLs dérivent de l'ORIGINE DE LA PAGE, jamais d'un port écrit
   * en dur.
   *
   * L'ancienne règle était : « port ∉ {80, 443} ⇒ développement ⇒ tout pointe
   * sur :4444 en clair ». Elle ne tenait que dans deux cas - le poste de dev et
   * une instance servie exactement sur 4444. Partout ailleurs elle cassait la
   * collaboration en silence, et elle seule : `lib/api.js` travaille en
   * relatif, donc l'application se chargeait, affichait l'enquête, et seule la
   * couche temps réel bouclait sur « Reconnexion… ».
   *
   * Les cas qu'elle cassait :
   *   - instance derrière un proxy sur un autre port (8080, 8443…) : le
   *     navigateur tentait `ws://hôte:4444`, port fermé de l'extérieur ;
   *   - site en HTTPS servi sur un port non standard : `ws://` en page `https:`
   *     est du contenu mixte, le navigateur refuse la connexion sans même
   *     l'ouvrir ;
   *   - accès par un nom d'hôte différent de celui de l'API.
   *
   * `window.location.host` inclut le port quand il y en a un, et l'omet sur 80
   * et 443 - c'est exactement la règle voulue, sans condition.
   */
  const isSecure = window.location.protocol === 'https:';
  const wsProto = isSecure ? 'wss' : 'ws';
  const wsHost = wsUrl ? new URL(wsUrl).host : window.location.host;

  const yjsUrl = `${wsProto}://${wsHost}/yjs`;
  const customWsUrl2 = `${wsProto}://${wsHost}/ws-custom`;
  // Chaîne vide = chemin relatif, donc même origine que la page : le même
  // choix que `lib/api.js`, et ce qui fait que le proxy Vite fonctionne en dev.
  const apiBase = '';

  // ═══ SUBSCRIBER SYSTEM ═══
  const dispatch = useCallback((event, ...args) => {
    const fns = listenersRef.current[event];
    log(`[collab] dispatch '${event}' → ${fns?.size || 0} listeners`);
    if (fns) fns.forEach(fn => { try { fn(...args); } catch(e) { console.error(`[collab] listener error ${event}:`, e); } });
  }, []);

  const addListener = useCallback((event, fn) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = new Set();
    listenersRef.current[event].add(fn);
    log(`[collab] addListener '${event}' → now ${listenersRef.current[event].size} listener(s). Total events: ${Object.keys(listenersRef.current).join(', ')}`);
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

  // ═══ DOCUMENT LOCAL (les deux modes) ═══
  //
  // Le doc Yjs n'était créé qu'en collaboratif. Il l'est maintenant dans les
  // deux modes - en solo il n'a simplement pas de provider. Deux bénéfices :
  //   - l'annulation (Y.UndoManager) fonctionne à l'identique en solo et en
  //     collaboratif, au lieu de n'exister que dans /room ;
  //   - en collaboratif, les modifications faites avant la connexion ou pendant
  //     une coupure entrent quand même dans le doc et se synchronisent au
  //     retour du réseau, alors qu'elles étaient auparavant perdues (les
  //     appelants les filtraient sur `collab.connected`).
  useEffect(() => {
    if (!roomId) return;

    const doc = new Y.Doc();
    docRef.current = doc;
    const entMap = doc.getMap('entities');
    const linkMap = doc.getMap('links');
    const stickerMap = doc.getMap('stickers');
    const postitMap = doc.getMap('postits');
    const timelineArray = doc.getArray('timeline');

    // Observer profond : les éléments sont des Y.Map imbriquées (cf. toYItem),
    // donc une modification de champ se produit un niveau plus bas que la map
    // de collection. `observe` seul ne la verrait pas.
    function observeMap(map, prefix) {
      map.observeDeep((events, transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return;
        if (transaction.origin === 'init') return;

        for (const event of events) {
          if (event.path.length === 0) {
            // Ajout / suppression / remplacement d'un élément entier
            event.changes.keys.forEach((change, key) => {
              const val = plain(map.get(key));
              if (change.action === 'add' && val) dispatch(`${prefix}:add`, val);
              else if (change.action === 'update' && val) dispatch(`${prefix}:update`, key, val);
              else if (change.action === 'delete') dispatch(`${prefix}:delete`, key);
            });
          } else {
            // Modification de champs à l'intérieur d'un élément : on republie
            // l'objet reconstruit, qui reflète déjà la fusion faite par Yjs.
            const key = event.path[0];
            const val = plain(map.get(key));
            if (val) dispatch(`${prefix}:update`, key, val);
          }
        }
      });
    }

    observeMap(entMap, 'entity');
    observeMap(linkMap, 'link');
    observeMap(stickerMap, 'sticker');
    observeMap(postitMap, 'postit');

    // Timeline observer (Y.Array - different from Y.Map)
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

    // ═══ ANNULATION ═══
    // `trackedOrigins` ne retient que LOCAL_ORIGIN : on n'annule donc jamais le
    // travail d'un collaborateur - c'est précisément ce qu'une pile maison
    // aurait fait, en défaisant la dernière modification quel qu'en soit
    // l'auteur - ni le chargement initial ('init').
    //
    // L'origine d'une transaction n'est pas transmise sur le réseau : une
    // modification distante arrive avec le provider pour origine, jamais
    // LOCAL_ORIGIN, même si son auteur l'a produite localement chez lui.
    //
    // Les transactions d'annulation portent l'UndoManager pour origine : elles
    // ne sont donc pas filtrées par les observers ci-dessus et remontent au
    // composant par le même chemin qu'une modification distante.
    const undoManager = new Y.UndoManager([entMap, linkMap, stickerMap, postitMap], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 400, // regroupe les rafales (frappe, déplacement) en un seul pas
    });
    undoRef.current = undoManager;
    const refreshStacks = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };
    undoManager.on('stack-item-added', refreshStacks);
    undoManager.on('stack-item-popped', refreshStacks);

    setDoc(doc);

    return () => {
      // Le provider est débranché ICI, avant le doc. React exécute les nettoyages
      // dans l'ordre de déclaration des effets : celui-ci passe donc avant celui
      // de l'effet provider. Détruire le doc en premier laisserait le provider
      // travailler sur un document mort le temps de son `disconnect()`.
      // Le nettoyage de l'effet provider devient alors un no-op (ref à null).
      providerRef.current?.destroy();
      providerRef.current = null;
      undoManager.destroy();
      doc.destroy();
      docRef.current = null;
      undoRef.current = null;
      setDoc(null);
      setCanUndo(false);
      setCanRedo(false);
    };
  }, [roomId, dispatch]);

  // ═══ MODE SOLO : chargement HTTP, aucune socket ═══
  useEffect(() => {
    if (collabMode || !roomId || !doc) return;
    let alive = true;
    fetch(`${apiBase}/api/yjs-state/${roomId}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        const d = data || {};
        // En solo le rôle vient de la réponse HTTP : sans socket, il n'y a pas
        // de custom:init pour l'apporter.
        if (d.role) setCollabRole(d.role === 'VIEWER' ? 'viewer' : 'editor');
        // Chargé sous l'origine 'init' : ni rediffusé aux listeners (le
        // composant reçoit l'état via setInitialState), ni empilé dans
        // l'historique - on ne doit pas pouvoir « annuler » l'ouverture.
        doc.transact(() => {
          for (const [id, e] of Object.entries(d.entities || {})) doc.getMap('entities').set(id, toYItem(e));
          for (const [id, l] of Object.entries(d.links || {})) doc.getMap('links').set(id, toYItem(l));
          for (const [id, s] of Object.entries(d.stickers || {})) doc.getMap('stickers').set(id, toYItem(s));
          for (const [id, p] of Object.entries(d.postits || {})) doc.getMap('postits').set(id, toYItem(p));
          if (Array.isArray(d.timeline) && d.timeline.length) doc.getArray('timeline').push(d.timeline);
        }, 'init');
        setInitialState({
          entities: Object.values(d.entities || {}),
          links: Object.values(d.links || {}),
          stickers: Object.values(d.stickers || {}),
          postits: Object.values(d.postits || {}),
          timeline: d.timeline || [],
          caseInfo: d.meta || {},
        });
      })
      .catch(() => { if (alive) setInitialState({ entities: [], links: [], stickers: [], postits: [], timeline: [], caseInfo: {} }); });
    return () => { alive = false; };
  }, [collabMode, roomId, doc, apiBase]);

  // ═══ YJS CONNECTION ═══
  useEffect(() => {
    if (!collabMode || !roomId || !userName || !doc) return;

    const entMap = doc.getMap('entities');
    const linkMap = doc.getMap('links');
    const stickerMap = doc.getMap('stickers');
    const postitMap = doc.getMap('postits');
    const timelineArray = doc.getArray('timeline');
    // Métadonnées de session (non persistées dans le fichier) : sert à savoir
    // si un client a déjà chargé l'état initial depuis le serveur.
    const metaMap = doc.getMap('_session');

    // Provider - on se connecte avec un ticket éphémère plutôt qu'avec le JWT
    // de session : l'URL d'un WebSocket finit dans les logs du reverse proxy.
    // Le ticket est demandé de façon synchrone au montage ; en cas d'échec on
    // retombe sur le token pour ne pas casser la collaboration.
    let provider = null;
    const startProvider = (params) => {
      if (cancelled) return;
      provider = new WebsocketProvider(yjsUrl, roomId, doc, { params });
      providerRef.current = provider;
      attachProviderHandlers(provider);
    };

    let cancelled = false;
    // Le ticket éphémère est la SEULE voie : il n'existe plus de jeton lisible
    // en JS à mettre en repli dans l'URL. Sans ticket, le serveur retombe sur le
    // cookie de session envoyé au handshake (ws/yjs.js).
    fetch(`${apiBase}/api/cases/${roomId}/ws-ticket`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => startProvider(d?.ticket ? { ticket: d.ticket } : {}))
      .catch(() => startProvider({}));

    function attachProviderHandlers(provider) {
    provider.on('status', ({ status }) => { log(`[collab] Yjs status: ${status}`); setConnected(status === 'connected'); });

    // Le serveur ferme avec 4401 (token invalide) ou 4403 (pas d'accès à
    // l'enquête). Inutile de laisser le provider boucler sur la reconnexion :
    // on coupe et on remonte l'erreur à l'UI.
    provider.on('connection-close', (event) => {
      if (event?.code === 4401 || event?.code === 4403) {
        setSyncError(event.code === 4401 ? 'unauthorized' : 'forbidden');
        provider.shouldConnect = false;
        provider.disconnect();
      }
    });
    provider.on('sync', (isSynced) => {
      log(`[collab] Yjs sync: ${isSynced}, entities in doc: ${entMap.size}`);
      setSynced(isSynced);
      if (isSynced && !initializedRef.current) {
        initializedRef.current = true;

        // Le fichier JSON n'est chargé QUE par le premier client de la session.
        // Attention : « document vide » ne suffit pas comme critère - un doc
        // peut être vide parce que tout vient d'être supprimé. Un second client
        // rechargerait alors le JSON et ressusciterait les entités effacées.
        // D'où ce marqueur explicite, partagé par Yjs comme le reste du doc.
        const alreadyInitialized = metaMap.get('initialized') === true;

        if (!alreadyInitialized) {
          metaMap.set('initialized', true);
          fetch(`${apiBase}/api/yjs-state/${roomId}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data) { setInitialState({ entities: [], links: [], stickers: [], postits: [], timeline: [], caseInfo: {} }); return; }
              doc.transact(() => {
                if (data.entities) for (const [id, ent] of Object.entries(data.entities)) entMap.set(id, toYItem(ent));
                if (data.links) for (const [id, lk] of Object.entries(data.links)) linkMap.set(id, toYItem(lk));
                if (data.stickers) for (const [id, s] of Object.entries(data.stickers)) stickerMap.set(id, toYItem(s));
                if (data.postits) for (const [id, p] of Object.entries(data.postits)) postitMap.set(id, toYItem(p));
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
          // Session déjà initialisée par un autre client : on adopte l'état
          // partagé tel quel, même s'il est vide (suppressions légitimes).
          log(`[collab] session déjà initialisée (${entMap.size} entités) - pas de rechargement JSON`);
          setInitialState({
            entities: Array.from(entMap.values()).map(plain),
            links: Array.from(linkMap.values()).map(plain),
            stickers: Array.from(stickerMap.values()).map(plain),
            postits: Array.from(postitMap.values()).map(plain),
            timeline: timelineArray.toArray(),
            caseInfo: {},
          });
        }
      }
    });

    // Awareness
    const awareness = provider.awareness;
    awareness.setLocalState({ user: { name: userName, color: userColor.current }, cursor: null, editing: null });
    awareness.on('change', () => {
      const states = awareness.getStates();
      const collabs = {};
      states.forEach((state, clientId) => {
        if (clientId === doc.clientID || !state?.user) return;
        collabs[clientId] = {
          // `id` reste le clientID Yjs : il identifie une CONNEXION, et sert
          // de clé de rendu pour les curseurs. `userId` est l'identifiant de
          // COMPTE - le seul que comprennent `role:set`, `kick` et la route
          // de retrait. Les confondre faisait échouer les trois en silence :
          // aucune ligne CaseAccess ne correspond à « 445371012 ».
          id: clientId, userId: state.user.userId || null,
          name: state.user.name, color: state.user.color,
          cursor: state.cursor || null, selection: state.selection || null,
          editing: state.editing || null,
        };
      });
      setCollaborators(collabs);

      // Élection du client sauvegardeur : le plus petit clientID connecté.
      // Critère déterministe, identique pour tous, sans arbitrage serveur.
      // Sans cela, chaque client écrivait le fichier avec SON état local, et le
      // dernier à écrire gagnait - en écrasant potentiellement plus récent.
      //
      // Les VIEWER sont exclus : leur POST /save est refusé (403), donc élire
      // l'un d'eux suffirait à ce que plus personne ne sauvegarde l'enquête.
      // `canWrite` absent = rôle pas encore connu : on ne l'écarte pas.
      const ids = Array.from(states.keys()).filter(id => {
        const s = states.get(id);
        return s?.user && s.canWrite !== false;
      });
      setIsSaveLeader(ids.length === 0 || Math.min(...ids) === doc.clientID);
    });
    }

    return () => {
      cancelled = true;
      providerRef.current?.destroy();
      providerRef.current = null;
      initializedRef.current = false;
      // Le doc n'est PAS détruit ici : il appartient à l'effet « document
      // local », qui vit aussi en solo. Le détruire couperait l'annulation et
      // laisserait `docRef` pointer sur un doc mort.
    };
  }, [collabMode, roomId, userName, doc, yjsUrl, apiBase]);

  // ═══ CUSTOM WS ═══
  useEffect(() => {
    if (!collabMode || !roomId || !userName) return;
    let alive = true;

    // Ticket éphémère, obtenu en HTTP (où le cookie de session circule sans
    // difficulté) puis passé dans l'URL du handshake.
    //
    // Ne pas revenir à « le navigateur enverra le cookie au handshake » : en
    // production le cookie porte l'attribut `Secure`, donc il n'est PAS envoyé
    // sur une socket `ws://`. Une instance servie en HTTP perdait toute la
    // couche temps réel - présence, curseurs, chat - pendant que le reste de
    // l'application fonctionnait. Le ticket est réutilisable pendant 2 h, donc
    // il est obtenu une fois et rejoué à chaque reconnexion.
    let ticket = null;

    const connect = () => {
      if (!alive || kicked) return;
      const url = ticket ? `${customWsUrl2}?ticket=${encodeURIComponent(ticket)}` : customWsUrl2;
      const ws = new WebSocket(url);
      customWsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', caseId: roomId, color: userColor.current }));
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'custom:init': setUserId(msg.userId || null); setIsOwner(!!msg.isOwner); setCollabRole(msg.collabRole || 'editor'); setJoinStatus(null); break;
          case 'join:pending': setJoinStatus('pending'); break;
          case 'join:denied': setJoinStatus(`denied:${msg.reason}`); break;
          case 'join:request': setJoinRequests(p => [...p.filter(r => r.user.id !== msg.user.id), { user: msg.user }]); break;
          case 'user:joined:notify': setJoinRequests(p => [...p.filter(r => r.user.id !== msg.user.id), { user: msg.user, autoJoined: true }]); break;
          case 'role:changed': setCollabRole(msg.collabRole); break;
          // Le serveur refuse un changement de rôle (propriétaire immuable,
          // ADMIN plateforme non inscrit…). Ce message n'était écouté nulle
          // part : le bouton restait sans effet ET sans explication.
          case 'role:denied': setRoleError(msg.message || traduire('collab.roleRefuseDefaut')); break;
          case 'roles:update': setCollabRoles(msg.roles || {}); break;
          // Le serveur diffuse la liste des membres et les entrées/sorties :
          // ces messages étaient tous ignorés, et roster.users jeté.
          case 'roster':
            setCollabRoles(msg.roles || {});
            setRoomUsers(msg.users || []);
            break;
          case 'user:joined':
            if (msg.user) setRoomUsers(p => [...p.filter(u => u.id !== msg.user.id), msg.user]);
            break;
          case 'user:left':
            if (msg.userId) setRoomUsers(p => p.filter(u => u.id !== msg.userId));
            break;
          case 'user:kicked':
            if (msg.userId) setRoomUsers(p => p.filter(u => u.id !== msg.userId));
            break;
          case 'chat': setChatMessages(p => [...p.slice(-99), msg.message]); break;
          case 'chat:throttled': setChatThrottled(Math.ceil((msg.retryInMs || 0) / 1000)); break;
          case 'kicked': setKicked(true); break;
          case 'owner:disconnected': setOwnerDisconnected(true); break;
        }
      };
      ws.onclose = () => { customWsRef.current = null; if (alive && !kicked) reconnectTimer.current = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    };

    // On se connecte même si le ticket échoue : le serveur retombe alors sur le
    // cookie du handshake, ce qui reste valable en `wss://`.
    fetch(`${apiBase}/api/cases/${roomId}/ws-ticket`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) { ticket = d?.ticket || null; connect(); } })
      .catch(() => { if (alive) connect(); });

    return () => { alive = false; clearTimeout(reconnectTimer.current); customWsRef.current?.close(); };
  }, [collabMode, roomId, userName, customWsUrl2, apiBase, kicked]);

  // ═══ MUTATE Y.Map with LOCAL_ORIGIN ═══
  const mutate = useCallback((mapName, fn) => {
    const doc = docRef.current;
    log(`[collab] mutate '${mapName}' doc=${!!doc}`);
    if (!doc) return;
    doc.transact(() => fn(doc.getMap(mapName)), LOCAL_ORIGIN);
  }, []);

  /**
   * Applique une mise à jour partielle CHAMP PAR CHAMP sur la Y.Map de l'élément.
   * C'est le cœur de la fusion : deux clients qui touchent des champs différents
   * de la même entité ne s'écrasent plus. Réécrire l'objet entier (l'ancien
   * comportement) faisait perdre la modification concurrente.
   */
  const patchItem = useCallback((mapName, id, updates) => {
    mutate(mapName, m => {
      const cur = m.get(id);
      if (cur instanceof Y.Map) {
        for (const [k, v] of Object.entries(updates)) cur.set(k, v);
      } else if (cur) {
        // Élément au format hérité (objet simple) : on le convertit au passage.
        m.set(id, toYItem({ ...cur, ...updates }));
      }
    });
  }, [mutate]);

  /**
   * Regroupe plusieurs mutations en UNE transaction Yjs, donc en UN seul pas
   * d'annulation. Sans cela, supprimer une entité et ses liens produirait
   * autant d'entrées dans la pile que d'éléments, et une annulation ne
   * restituerait qu'un morceau de la suppression.
   */
  const batch = useCallback((fn) => {
    const doc = docRef.current;
    if (!doc) { fn(); return; }
    // Les transactions imbriquées fusionnent dans celle-ci : les appels à
    // sendXxxDelete faits dans `fn` ne créent pas de transaction séparée.
    doc.transact(() => fn(), LOCAL_ORIGIN);
  }, []);

  const sendEntityAdd = useCallback((ent) => { log('[collab] sendEntityAdd', ent.id); mutate('entities', m => m.set(ent.id, toYItem(ent))); }, [mutate]);
  const sendEntityUpdate = useCallback((id, u) => patchItem('entities', id, u), [patchItem]);
  const sendEntityDelete = useCallback((id) => mutate('entities', m => m.delete(id)), [mutate]);
  const sendLinkAdd = useCallback((lk) => mutate('links', m => m.set(lk.id, toYItem(lk))), [mutate]);
  const sendLinkUpdate = useCallback((id, u) => patchItem('links', id, u), [patchItem]);
  const sendLinkDelete = useCallback((id) => mutate('links', m => m.delete(id)), [mutate]);
  const sendStickerAdd = useCallback((s) => mutate('stickers', m => m.set(s.id, toYItem(s))), [mutate]);
  // Les stickers n'avaient qu'add/delete : les déplacer ne partait donc nulle
  // part - ni chez les collaborateurs, ni dans l'historique d'annulation.
  const sendStickerUpdate = useCallback((id, u) => patchItem('stickers', id, u), [patchItem]);
  const sendStickerDelete = useCallback((id) => mutate('stickers', m => m.delete(id)), [mutate]);
  const sendPostitAdd = useCallback((p) => mutate('postits', m => m.set(p.id, toYItem(p))), [mutate]);
  const sendPostitUpdate = useCallback((id, u) => patchItem('postits', id, u), [patchItem]);
  const sendPostitDelete = useCallback((id) => mutate('postits', m => m.delete(id)), [mutate]);

  const sendTimelineEvent = useCallback((event) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => { doc.getArray('timeline').push([event]); }, LOCAL_ORIGIN);
  }, []);

  // ═══ ANNULER / RÉTABLIR ═══
  // Ne défait que les modifications de l'utilisateur courant (cf. trackedOrigins).
  // Le changement résultant repasse par les observers et met à jour l'état du
  // composant par le même chemin qu'une modification distante - rien à
  // réappliquer à la main ici.
  const undo = useCallback(() => { undoRef.current?.undo(); }, []);
  const redo = useCallback(() => { undoRef.current?.redo(); }, []);

  const sendCursor = useCallback((pos) => providerRef.current?.awareness.setLocalStateField('cursor', pos), []);
  // La sélection diffusée était un identifiant unique : un collaborateur qui
  // sélectionnait douze entités n'en montrait qu'une. On envoie la liste.
  const sendSelection = useCallback((sel) => {
    const ids = sel == null ? [] : (Array.isArray(sel) ? sel : [sel]).filter(Boolean);
    providerRef.current?.awareness.setLocalStateField('selection', ids);
  }, []);

  // ═══ VERROUS D'ÉDITION (bail à renouvellement) ═══
  // Le verrou porte un horodatage et doit être rafraîchi périodiquement par son
  // détenteur. On ne peut pas se fier à la seule disparition de l'état
  // d'awareness : quand un client se coupe brutalement, les autres conservent
  // son état en cache et le rediffusent même aux nouveaux arrivants - le verrou
  // resterait alors éternel. Un bail non renouvelé expire de lui-même.
  const lockEntity = useCallback((idOrIds) => {
    const aw = providerRef.current?.awareness;
    if (!aw) return;
    // Accepte un identifiant seul ou une liste : lors d'un déplacement de
    // groupe, seule l'entité saisie était verrouillée et un collaborateur
    // pouvait attraper une des autres pendant le geste.
    const ids = idOrIds == null ? [] : (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    aw.setLocalStateField('editing', ids.length ? { ids, ts: Date.now() } : null);
  }, []);
  const unlockEntity = useCallback(() => {
    providerRef.current?.awareness.setLocalStateField('editing', null);
  }, []);

  // Le rôle arrive par /ws-custom, après la création du provider Yjs : on le
  // publie dans l'awareness dès qu'il est connu, pour que l'élection du client
  // sauvegardeur puisse écarter les lecteurs seuls.
  useEffect(() => {
    providerRef.current?.awareness?.setLocalStateField('canWrite', collabRole !== 'viewer');
  }, [collabRole, connected]);

  // L'identifiant de compte arrive par `custom:init`, sur l'AUTRE socket, donc
  // après l'ouverture de l'awareness. On le republie dès qu'il est connu.
  useEffect(() => {
    const aw = providerRef.current?.awareness;
    if (!aw || !userId) return;
    const actuel = aw.getLocalState()?.user || {};
    aw.setLocalStateField('user', { ...actuel, name: userName, color: userColor.current, userId });
  }, [userId, userName, connected]);

  // Décompte de la limitation du chat jusqu'à réouverture
  useEffect(() => {
    if (chatThrottled <= 0) return;
    const iv = setInterval(() => setChatThrottled(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(iv);
  }, [chatThrottled]);

  // Renouvellement du bail tant que l'édition est en cours
  useEffect(() => {
    const iv = setInterval(() => {
      const aw = providerRef.current?.awareness;
      const cur = aw?.getLocalState()?.editing;
      if (cur?.ids?.length) aw.setLocalStateField('editing', { ids: cur.ids, ts: Date.now() });
    }, LOCK_RENEW_MS);
    return () => clearInterval(iv);
  }, []);

  /** @returns {{name,color}|null} le collaborateur qui édite cette entité, le cas échéant */
  const isLockedByOther = useCallback((id) => {
    if (!id) return null;
    const now = Date.now();
    for (const c of Object.values(collaborators)) {
      const e = c.editing;
      if (e?.ids?.includes(id) && now - e.ts < LOCK_TTL_MS) return { name: c.name, color: c.color };
    }
    return null;
  }, [collaborators]);

  const customSend = useCallback((msg) => { if (customWsRef.current?.readyState === 1) customWsRef.current.send(JSON.stringify(msg)); }, []);
  const sendChat = useCallback((text) => customSend({ type: 'chat', text }), [customSend]);
  const approveJoin = useCallback((uid) => { customSend({ type: 'join:approve', userId: uid }); setJoinRequests(p => p.filter(r => r.user.id !== uid)); }, [customSend]);
  const denyJoin = useCallback((uid) => { customSend({ type: 'join:deny', userId: uid }); setJoinRequests(p => p.filter(r => r.user.id !== uid)); }, [customSend]);
  const kickUser = useCallback((uid) => customSend({ type: 'kick', targetUserId: uid }), [customSend]);
  const setUserRole = useCallback((uid, role) => customSend({ type: 'role:set', targetUserId: uid, role }), [customSend]);
  const dismissJoinNotif = useCallback((uid) => setJoinRequests(p => p.filter(r => r.user.id !== uid)), []);

  return {
    connected, synced, userId, userColor: userColor.current,
    isOwner, collabRole, collabRoles, roleError, clearRoleError: () => setRoleError(null), joinStatus, joinRequests, kicked, ownerDisconnected, syncError,
    collaborators, chatMessages, initialState, roomUsers, chatThrottled,
    onRemote, addListener,
    sendEntityAdd, sendEntityUpdate, sendEntityDelete,
    sendLinkAdd, sendLinkUpdate, sendLinkDelete,
    sendStickerAdd, sendStickerUpdate, sendStickerDelete,
    sendPostitAdd, sendPostitUpdate, sendPostitDelete,
    sendTimelineEvent, batch,
    sendCursor, sendSelection,
    undo, redo, canUndo, canRedo,
    sendChat, approveJoin, denyJoin, kickUser, setUserRole, dismissJoinNotif,
    lockEntity, unlockEntity, isLockedByOther, isSaveLeader,
    sendCaseInfo: () => {}, remoteHistory: [],
  };
}
