import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import { resolveOverlapPositions } from "../lib/layout.js";
import { themes, resolveTheme } from "../lib/theme.jsx";
import { useCollaboration } from "./useCollaboration.js";
import { initPluginEngine } from "../plugins/registry.js";
import { registerRuntimePlugins } from "../plugins/runtime.js";
import PluginStore from "../plugins/core/PluginStore.jsx";
import EntityPanel from "../components/EntityPanel.jsx";
import TimelineOverlay from "../components/TimelineOverlay.jsx";
import ReplayBar from "../components/ReplayBar.jsx";
import { visibleAt, buildReplay } from "../lib/replay.js";
import { apiDownload } from "../lib/api.js";
import ToolbarMenu from "../components/ToolbarMenu.jsx";
import { exporterPdf } from "../lib/exportPdf.js";
import { PluginErrorBoundary } from "../plugins/core/ErrorBoundary.jsx";
import { buildPluginContext } from "../plugins/core/context.js";

// Initialize plugin engine once (singleton)
const pluginEngine = initPluginEngine();

// Les plugins installés à l'exécution arrivent après coup (requête réseau) :
// on force un rendu quand ils sont prêts, via le compteur pluginTick.
let runtimePluginsReady = false;

// ============================================================================
import { LINK_STRENGTHS, getStrengthFromConfidence } from "../lib/constants.jsx";
import { useConstantes, libellePlugin, nomPlugin } from "../lib/constantesTraduites.js";
import { useT, useLangue, getLocale, traduire, LANGUES } from "../i18n";


// Entity card dimensions
const ENT_W = 220, ENT_H = 88, ENT_HW = 110, ENT_HH = 44;

/**
 * Tracé d'un lien : un segment droit, et son milieu pour y poser l'étiquette.
 *
 * C'était auparavant une courbe quadratique décalée sur la normale (18 % de la
 * distance, plafonnée à 40 px). Deux raisons de l'avoir retirée, au-delà du
 * goût : les extrémités sont calculées par `getEdge` le long de la droite
 * reliant les DEUX centres, alors que la flèche s'oriente sur la tangente de la
 * courbe (`orient="auto"`) - elle arrivait donc de biais, sans jamais désigner
 * le centre de la cible. Et l'étiquette, posée au milieu de la courbe, était
 * décalée du même côté pour tous les liens, ce qui déséquilibrait le graphe.
 */
const linkPath = (x1, y1, x2, y2) => ({
  path: `M ${x1} ${y1} L ${x2} ${y2}`,
  mx: (x1 + x2) / 2,
  my: (y1 + y2) / 2,
});

/** Ordre et libellés des statuts dans les menus (STATUS_DOT porte icône et couleur). */
// Ordre des statuts. Le libellé vient du dictionnaire (`statut.<id>`) :
// le garder ici en dur imposerait de le traduire deux fois.
const STATUS_ORDER = ["confirmed", "unverified", "denied", "archived"];

// `tone` : jeton du thème, résolu au rendu (cf. LINK_STRENGTHS).
const STATUS_DOT = {
  confirmed: { icon: "✓", tone: "success" },
  unverified: { icon: "?", tone: "warning" },
  denied: { icon: "✕", tone: "danger" },
  archived: { icon: "◼", tone: "textMuted" },
};

// PHONE PREFIX → FLAG
const PHONE_FLAGS={"+33":"🇫🇷","+1":"🇺🇸","+44":"🇬🇧","+49":"🇩🇪","+34":"🇪🇸","+39":"🇮🇹","+32":"🇧🇪","+41":"🇨🇭","+31":"🇳🇱","+351":"🇵🇹","+7":"🇷🇺","+86":"🇨🇳","+81":"🇯🇵","+82":"🇰🇷","+91":"🇮🇳","+55":"🇧🇷","+52":"🇲🇽","+61":"🇦🇺","+971":"🇦🇪","+966":"🇸🇦","+90":"🇹🇷","+48":"🇵🇱","+46":"🇸🇪","+47":"🇳🇴","+45":"🇩🇰","+358":"🇫🇮","+30":"🇬🇷","+420":"🇨🇿","+36":"🇭🇺","+40":"🇷🇴","+380":"🇺🇦","+212":"🇲🇦","+213":"🇩🇿","+216":"🇹🇳","+20":"🇪🇬","+27":"🇿🇦","+234":"🇳🇬","+254":"🇰🇪","+62":"🇮🇩","+66":"🇹🇭","+84":"🇻🇳","+63":"🇵🇭","+65":"🇸🇬","+60":"🇲🇾","+852":"🇭🇰","+886":"🇹🇼","+972":"🇮🇱","+98":"🇮🇷","+92":"🇵🇰","+880":"🇧🇩","+94":"🇱🇰","+353":"🇮🇪","+352":"🇱🇺","+377":"🇲🇨","+376":"🇦🇩"};
function getPhoneFlag(label){if(!label)return null;const m=label.match(/^\+\d+/);if(!m)return null;const num=m[0];const sorted=Object.keys(PHONE_FLAGS).sort((a,b)=>b.length-a.length);for(const prefix of sorted){if(num.startsWith(prefix))return PHONE_FLAGS[prefix];}return null;}

// ADDRESS NORMALIZATION (FR abbreviations)
const ADDR_ABBR={"imp.":"impasse","imp ":"impasse ","bd ":"boulevard ","bd.":"boulevard","bld ":"boulevard ","bld.":"boulevard","av.":"avenue","av ":"avenue ","pl.":"place","pl ":"place ","rte ":"route ","rte.":"route","chem.":"chemin","chem ":"chemin ","all.":"allée","all ":"allée ","sq.":"square","sq ":"square ","fg.":"faubourg","fg ":"faubourg ","pass.":"passage","pass ":"passage ","res.":"résidence","res ":"résidence ","lot.":"lotissement","lot ":"lotissement ","zac ":"zone d'aménagement ","zi ":"zone industrielle ","crs ":"cours ","crs.":"cours","quai ":"quai ","r.":"rue","r ":"rue "};
function normalizeAddress(addr){let s=addr;for(const[ab,full]of Object.entries(ADDR_ABBR)){s=s.replace(new RegExp("\\b"+ab.replace(".","\\."),"gi"),full);}return s;}

// DATE FORMATTER FR
// Les dates suivaient « fr-FR » en dur : elles suivent la langue choisie.
function fmtDate(d){if(!d)return"";try{const dt=new Date(d);const l=getLocale();return dt.toLocaleDateString(l,{day:"2-digit",month:"2-digit",year:"numeric"})+" "+dt.toLocaleTimeString(l,{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
function fmtDateShort(d){if(!d)return"";try{return new Date(d).toLocaleDateString(getLocale(),{day:"2-digit",month:"2-digit",year:"numeric"});}catch{return"";}}


// STICKERS - le libellé vient du dictionnaire (`sticker.<id>`).
const STICKERS = [
  { id: "thumbsup", emoji: "👍" },
  { id: "thumbsdown", emoji: "👎" },
  { id: "question", emoji: "❓" },
  { id: "exclamation", emoji: "❗" },
  { id: "warning", emoji: "⚠️" },
  { id: "check", emoji: "✅" },
  { id: "cross", emoji: "❌" },
  { id: "star", emoji: "⭐" },
  { id: "fire", emoji: "🔥" },
  { id: "eye", emoji: "👁️" },
  { id: "lock", emoji: "🔒" },
  { id: "flag", emoji: "🚩" },
  { id: "target", emoji: "🎯" },
  { id: "clock2", emoji: "⏰" },
  { id: "skull", emoji: "💀" },
  { id: "money", emoji: "💰" },
];

const POSTIT_COLORS = ["#fef08a","#bbf7d0","#bfdbfe","#fecaca","#e9d5ff","#fed7aa","#d1d5db"];


// PLUGINS: now loaded from registry (see plugins/registry.js)

const genId = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const getCenter = (e) => ({ x: e.x + 80, y: e.y + 30 });
const getEdge = (c, tgt, hw = 80, hh = 30) => { const dx=tgt.x-c.x,dy=tgt.y-c.y; if(!dx&&!dy)return c; const s=Math.abs(dx)/hw>Math.abs(dy)/hh?hw/Math.abs(dx):hh/Math.abs(dy); return{x:c.x+dx*s,y:c.y+dy*s}; };

const I = {
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  x:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  trash:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  link:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  sun:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  moon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  download:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  zoomIn:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>,
  zoomOut:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/></svg>,
  fit:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  users:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  clock:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  copy:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  chev:(o)=><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:o?"rotate(90deg)":"rotate(0)",transition:"transform 0.2s"}}><polyline points="9 18 15 12 9 6"/></svg>,
  bolt:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  grid:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  undo:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 13"/></svg>,
  redo:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 13"/></svg>,
};

const HOLD_DELAY = 300, MOVE_THRESHOLD = 5;
// Cadence de diffusion des positions (identique à celle du curseur).
const POS_THROTTLE_MS = 50;

// Tooltip component

export default function OSINTMapper({ caseId: propCaseId, userName: propUserName, userRole: propUserRole, onQuit, collabMode: propCollabMode }) {
  // Libellés d'entités et de liens dans la langue courante. `t` reste la
  // PALETTE dans tout ce fichier ; la traduction est `tr`.
  const { CATEGORIES, ALL_ITEMS, LINK_TYPES } = useConstantes();
  const tr = useT();
  const { langue, changerLangue } = useLangue();
  // Permissions
  const canEdit = propUserRole === 'ADMIN' || propUserRole === 'ANALYST';
  // ============================================================
  // SESSION: sessionStorage survives F5, stores {name, room, mode}
  // ============================================================
  const P_KEY = "om_pseudo";
  const S_KEY = "om_session";

  // v2: Props-driven - no URL parsing, no session storage for routing
  const urlInfo = null;
  const session = { name: propUserName || "User", room: propCaseId, mode: "solo" };

  const [theme, setTheme] = useState(() => localStorage.getItem('om_theme') || "dark");
  const [pluginTick, setPluginTick] = useState(0);

  // Thèmes intégrés + ceux apportés par les plugins activés. Le repli sur
  // "dark" n'est pas cosmétique : si le plugin qui fournit le thème courant est
  // désactivé, `t` serait indéfini et toute l'interface planterait à la
  // première lecture de couleur.
  const availableThemes = useMemo(() => {
    const fromPlugins = {};
    for (const [id, th] of Object.entries(pluginEngine.getThemes())) fromPlugins[id] = th.colors;
    return { ...themes, ...fromPlugins };
  }, [pluginTick]);
  const themeMeta = useMemo(() => pluginEngine.getThemes(), [pluginTick]);
  const t = resolveTheme(theme, availableThemes);
  // Couleurs possibles d'un lien : trois paliers de confiance + la sélection.
  const ARROW_COLORS = useMemo(()=>[...LINK_STRENGTHS.map(s=>[s.id,t[s.tone]]),["sel",t.accent]],[t]);

  // `om_theme` était lu au démarrage mais jamais écrit : le choix de thème
  // était perdu à chaque rechargement. On conserve l'id même s'il vient d'un
  // plugin désactivé depuis - le thème revient si le plugin est réactivé.
  useEffect(() => { try { localStorage.setItem('om_theme', theme); } catch { /* stockage indisponible */ } }, [theme]);

  // v2: Auth comes from props
  const [authUser, setAuthUser] = useState({ id: propCaseId, username: propUserName, displayName: propUserName, role: propUserRole || "ANALYST" });
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // Chemin RELATIF, comme `lib/api.js` et `useCollaboration.js`.
  //
  // Cette ligne gardait sa propre copie de la règle « port ∉ {80,443} ⇒ tout
  // sur :4444 en clair ». En développement, la page est servie par Vite sur
  // 5173 : les appels partaient donc en direct sur :4444, hors du proxy, en
  // cross-origin - d'où des `DELETE http://localhost:4444/…` dans la console
  // au lieu de `/api/…`. Et sur une instance servie ailleurs que sur 4444, ils
  // visaient un port fermé.
  const serverUrl = '';

  // v2: Auth is handled by the wrapper - no need to check token here

  // Screen: "graph" (always, since we're inside the Graph page)
  const [screen, setScreen] = useState("graph");

  const [lobbyName, setLobbyName] = useState(propUserName || "User");
  const [lobbyMode, setLobbyMode] = useState(propCollabMode ? "collab" : "solo");
  const [lobbyRoom, setLobbyRoom] = useState(propCaseId || "");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [activeRoom, setActiveRoom] = useState(propCaseId || null);

  // Navigate to a room/case (updates URL + state)
  const navigateTo = useCallback((room, mode) => {
    const path = mode === "collab" ? `/room/${encodeURIComponent(room)}` : `/case/${encodeURIComponent(room)}`;
    window.history.pushState({}, "", path);
  }, []);

  const saveSession = useCallback((name, room, mode) => {
    sessionStorage.setItem(S_KEY, JSON.stringify({ name, room, mode }));
    localStorage.setItem(P_KEY, name);
  }, []);

  const clearSession = useCallback(() => {
    if (onQuit) onQuit();
  }, [onQuit]);

  const doLogout = useCallback(() => {
    if (onQuit) onQuit();
  }, [onQuit]);

  // Enter a case
  const isCreatorRef = useRef(false);
  const enterCase = useCallback((name, room, mode, creator=false) => {
    isCreatorRef.current = creator;
    setActiveRoom(room);
    setLobbyMode(mode);
    saveSession(name, room, mode);
    navigateTo(room, mode);
    setScreen("graph");
  }, [saveSession, navigateTo]);

  // === COLLAB HOOK ===
  const collab = useCollaboration({
    roomId: activeRoom,
    userName: lobbyName,
    collabMode: lobbyMode === "collab",
  });
  // Lecture seule = rôle VIEWER sur l'enquête. Le drapeau était codé à `false`
  // « le temps de la production » : l'interface proposait donc toutes les
  // actions d'édition à un lecteur seul, qui se faisait refuser à l'écriture.
  // La source de vérité reste le serveur (403 sur /save, écritures Yjs
  // filtrées) ; ceci ne fait que cesser de promettre ce qui sera refusé.
  // Rejeu chronologique : instant de coupe, ou null hors rejeu.
  const [replayAt, setReplayAt] = useState(null);
  const enRejeu = replayAt !== null;
  const isViewer = collab.collabRole === "viewer" || enRejeu;

  /**
   * Le même drapeau, lu à travers une ref.
   *
   * Les gardes d'écriture vivent dans des `useCallback` dont AUCUN ne listait
   * `isViewer` dans ses dépendances. Or `collabRole` vaut « editor » au premier
   * rendu et ne devient « viewer » qu'à l'arrivée de `custom:init`, quelques
   * centaines de millisecondes plus tard : les callbacks étaient déjà figés
   * avec `isViewer === false`. Un lecteur voyait donc l'interface l'annoncer en
   * lecture seule et pouvait quand même créer des entités - que le filtre du
   * socket Yjs rejetait ensuite en silence, et qu'aucun save-leader ne
   * persistait. Le travail semblait pris en compte, et disparaissait au
   * rechargement.
   *
   * Une ref rend la garde immunisée à l'oubli : elle lit toujours la valeur
   * courante, y compris depuis un callback créé avant le changement de rôle.
   * Ne pas revenir à une lecture directe de `isViewer` dans un callback sans
   * l'ajouter à ses dépendances.
   */
  const isViewerRef = useRef(isViewer);
  isViewerRef.current = isViewer;


  const [caseInfo, setCaseInfo] = useState({ title: "", description: "", tags: "" });
  const [caseCreated, setCaseCreated] = useState(!!session);
  const [entities, setEntities] = useState([]);

  /**
   * Miroir de `entities`, pour les callbacks qui doivent partir de l'état
   * COURANT et non de celui figé à leur création.
   *
   * `addEntity` et `pasteEntity` faisaient `[...entities, nouvelle]` en lisant
   * `entities` dans leur fermeture, sans le lister dans leurs dépendances. Le
   * callback n'était donc recréé que si `pan` ou `zoom` changeait - jamais à
   * l'arrivée d'entités par le réseau. Un client qui venait de rejoindre une
   * salle, recevait le graphe par Yjs puis déposait une entité sans avoir bougé
   * la vue écrasait tout : `[...[], nouvelle]`. À l'écran il ne restait que la
   * dernière, et s'il était save-leader le fichier était réécrit ainsi.
   *
   * `duplicateEntity` listait bien `entities`, mais passe par la ref lui aussi :
   * une seule règle vaut mieux que deux, dont une à retenir.
   *
   * Ne pas remplacer par une lecture directe de `entities` sans l'ajouter aux
   * dépendances - c'est exactement ce qui a produit la perte de données.
   */
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [postits, setPostits] = useState([]);

  // Vue du graphe rendue à l'écran. Hors rejeu elle vaut le graphe complet ;
  // pendant un rejeu elle est filtrée à l'instant courant. Le filtrage ne
  // touche QUE le rendu : l'état et le document Yjs restent intacts.
  const grapheComplet = useMemo(()=>({entities,links,stickers,postits}),[entities,links,stickers,postits]);
  const vue = useMemo(()=>visibleAt(grapheComplet,replayAt),[grapheComplet,replayAt]);
  const [selectedStickerId, setSelectedStickerId] = useState(null);
  const [selectedPostitId, setSelectedPostitId] = useState(null);
  const [editingPostit, setEditingPostit] = useState(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [toolbarTab, setToolbarTab] = useState("stickers");
  const [stampSticker, setStampSticker] = useState(null);
  const [expandedEntities, setExpandedEntities] = useState(new Set());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x:0,y:0,px:0,py:0 });
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const dragOffset = useRef({ x:0,y:0 });
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [linkMousePos, setLinkMousePos] = useState(null);
  const holdTimer = useRef(null);
  const mouseDownInfo = useRef(null);
  const [holdActive, setHoldActive] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [multiSelection, setMultiSelection] = useState([]);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openCats, setOpenCats] = useState(new Set());
  const [favorites, setFavorites] = useState(new Set());
  // null = fermée, 'full' = frise plein écran, 'mini' = panneau compact.
  // Le bouton ouvre désormais la frise ; « Réduire » ramène à l'ancien panneau.
  const [timelineView, setTimelineView] = useState(null);
  const showTimeline = timelineView !== null;
  const [showChat, setShowChat] = useState(false);
  const [ownerBannerVisible, setOwnerBannerVisible] = useState(false);
  const ownerBannerTimer = useRef(null);
  const chatInputRef = useRef(null);
  const chatEndRef = useRef(null);
  // Map is now a plugin (see plugins/map/Panel.jsx)
  const [showPlugins, setShowPlugins] = useState(false);

  // Chargement des plugins installés à l'exécution (une seule fois par session)
  useEffect(()=>{
    if(runtimePluginsReady)return;
    runtimePluginsReady = true;
    registerRuntimePlugins(pluginEngine)
      .then(({loaded,failed})=>{
        if(loaded.length||failed.length){
          console.info(`[plugins] runtime - ${loaded.length} chargé(s)${failed.length?`, ${failed.length} en échec`:''}`);
          setPluginTick(k=>k+1);
        }
      })
      .catch(()=>{});
  },[]);

  // Plugins recommandés par l'enquête (réglés à sa création).
  // C'est une RECOMMANDATION, pas une contrainte : `applyCaseDefaults` ne
  // comble que l'absence de décision - un plugin désactivé volontairement ne se
  // réactive pas parce qu'on ouvre une enquête qui le suggère.
  const [membres, setMembres] = useState([]);
  useEffect(()=>{
    if(!activeRoom)return;
    let vivant=true;
    fetch(`${serverUrl}/api/cases/${encodeURIComponent(activeRoom)}`,{credentials:"include"})
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(!vivant)return;
        // Les membres de l'enquête, connectés ou non. Le panneau Personnes ne
        // listait que les présents : un compte invité puis jamais revenu
        // restait inscrit sans aucun moyen de le retirer depuis l'interface.
        setMembres(Array.isArray(d?.collaborators)?d.collaborators:[]);
        const reco=d?.settings?.plugins;
        if(!Array.isArray(reco)||!reco.length)return;
        const actives=pluginEngine.applyCaseDefaults(reco);
        if(actives.length){
          console.info(`[plugins] activés pour cette enquête : ${actives.join(", ")}`);
          setPluginTick(k=>k+1);
        }
      })
      .catch(()=>{});
    return()=>{vivant=false;};
  },[activeRoom,serverUrl]);
  const [activePlugin, setActivePlugin] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectionBox, setSelectionBox] = useState(null); // {x1,y1,x2,y2} in canvas coords
  const selBoxStart = useRef(null);
  const [timeline, setTimeline] = useState([]);
  const [showCollaborators, setShowCollaborators] = useState(true);
  const [showCollabDropdown, setShowCollabDropdown] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  // Lien d'invitation signé par le serveur (valable 7 jours). Sans ce token,
  // ouvrir /room/<id> ne donne plus aucun accès à l'enquête.
  const [inviteLink, setInviteLink] = useState("");
  const [inviteError, setInviteError] = useState("");
  const collabList = useMemo(()=>Object.entries(collab.collaborators).map(([id,c])=>({id,...c})),[collab.collaborators]);

  // Auto-switch to collab mode when someone joins the room
  useEffect(()=>{
    if(collabList.length>0&&lobbyMode==="solo") setLobbyMode("collab");
  },[collabList.length]);
  const [copiedEntity, setCopiedEntity] = useState(null);


  const selectedEntity = entities.find(e=>e.id===selectedId);
  const selectedLink = links.find(l=>l.id===selectedLinkId);
  const logAction = useCallback(a => {
    const event = {id:genId(),action:a,timestamp:new Date().toISOString(),user:lobbyName||traduire('commun.vous')};
    setTimeline(p=>[event,...p.slice(0,99)]);
    collab.sendTimelineEvent(event);
  },[lobbyName,collab.sendTimelineEvent]);
  const screenToCanvas = useCallback((sx,sy)=>{const r=canvasRef.current?.getBoundingClientRect();if(!r)return{x:sx,y:sy};return{x:(sx-r.left-pan.x)/zoom,y:(sy-r.top-pan.y)/zoom};},[pan,zoom]);

  const norm=useCallback(s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(),[]);
  const findDuplicate=useCallback((label,excludeId)=>{if(!label||label.length<2)return null;const n=norm(label);return entities.find(e=>e.id!==excludeId&&norm(e.label)===n)||null;},[entities,norm]);
  /**
   * Retire définitivement un membre de l'enquête.
   *
   * À ne pas confondre avec « expulser » (`kickUser`), qui ne ferme que la
   * socket : l'intéressé revient d'un simple rechargement. Ici l'accès est
   * révoqué en base, et le serveur coupe ses sockets dans la foulée.
   */
  const retirerMembre = useCallback(async (userId, nom)=>{
    if(!activeRoom) return;
    if(!confirm(tr('collab.confirm.retirer',{nom}))) return;
    try{
      const r = await fetch(`${serverUrl}/api/cases/${encodeURIComponent(activeRoom)}/access/${encodeURIComponent(userId)}`,{method:"DELETE",credentials:"include"});
      const d = await r.json().catch(()=>({}));
      if(!r.ok){ alert(d.error||tr('graphe.retraitImpossible')); return; }
      logAction(`${nom} retiré de l'enquête`);
      setMembres(p=>p.filter(m=>m.id!==userId));
    }catch(e){ alert(tr('graphe.erreurReseau',{message:e.message})); }
  },[activeRoom,serverUrl,logAction]);

  const addEntity = useCallback((subItemId, dx, dy)=>{
    if(isViewerRef.current) return;
    const info=ALL_ITEMS[subItemId]; if(!info)return;
    const ent={id:genId(),type:info.category,subtype:subItemId,label:info.label,description:info.desc||"",notes:"",x:dx??(300+Math.random()*200-pan.x/zoom),y:dy??(200+Math.random()*200-pan.y/zoom),color:info.color,metadata:{},comments:[],author:lobbyName||traduire('commun.vous'),createdAt:new Date().toISOString()};
    const suivant=[...entitiesRef.current,ent];
    setEntities(suivant); logAction(`"${info.label}" ajoutée`);
    collab.sendEntityAdd(ent);
    // La position de départ est aléatoire : sans ceci, une nouvelle entité
    // pouvait apparaître empilée sur une autre. L'entité créée reste fixe.
    resolveOverlaps([ent.id],suivant);
    // Retourné pour que l'appelant (notamment un plugin) puisse enchaîner sur
    // un addLink : sans l'id, impossible de relier ce qu'on vient de créer.
    return ent;
  },[pan,zoom,logAction,lobbyMode,collab.sendEntityAdd]);
  /**
   * Écarte les entités qui se chevauchent. La géométrie vit dans lib/layout.js
   * - arithmétique pure, donc testable sans monter le composant.
   *
   * @param figees ids à ne pas bouger (entité saisie, ou tout un lot).
   * @param liste  état à considérer ; nécessaire juste après une création, où
   *               le `entities` capturé est encore périmé.
   */
  const resolveOverlaps = useCallback((figees, liste)=>{
    const items = liste || entities;
    if(items.length<2) return;
    const { positions, moved } = resolveOverlapPositions(items, figees);
    if(!moved.length) return;
    setEntities(items.map(e=>{const p=positions.get(e.id);return (p.x===e.x&&p.y===e.y)?e:{...e,x:p.x,y:p.y};}));
    // Une transaction : le désentassement est UN pas d'annulation, et il
    // fusionne avec le déplacement qui l'a provoqué (captureTimeout).
    collab.batch(()=>moved.forEach(m=>collab.sendEntityUpdate(m.id,{x:m.x,y:m.y})));
  },[entities,collab.batch,collab.sendEntityUpdate]);

  const updateEntity = useCallback((id,u)=>{if(isViewerRef.current)return;
    setEntities(p=>p.map(e=>e.id===id?{...e,...u}:e));
    collab.sendEntityUpdate(id,u);
  },[collab.sendEntityUpdate]);
  const renameEntity=useCallback((id,newLabel)=>{updateEntity(id,{label:newLabel});return true;},[updateEntity]);

  // Les liens de l'entité étaient retirés de l'état local sans jamais l'être du
  // doc partagé : chaque client les filtrait de son côté, mais ils y survivaient.
  // On les supprime explicitement, dans la MÊME transaction que l'entité - ainsi
  // une annulation restitue l'entité avec ses liens, et pas une entité isolée.
  const deleteEntity = useCallback(id=>{if(isViewerRef.current)return;const ent=entities.find(e=>e.id===id);const dead=links.filter(l=>l.from===id||l.to===id);setEntities(p=>p.filter(e=>e.id!==id));setLinks(p=>p.filter(l=>l.from!==id&&l.to!==id));if(selectedId===id){setSelectedId(null);setRightPanelOpen(false);}logAction(`"${ent?.label}" supprimée`);collab.batch(()=>{dead.forEach(l=>collab.sendLinkDelete(l.id));collab.sendEntityDelete(id);});},[entities,links,selectedId,logAction,lobbyMode,collab.batch,collab.sendEntityDelete,collab.sendLinkDelete]);
  // Dupliquer et coller n'écrivaient que l'état local : la copie n'existait pour
  // personne d'autre, n'était pas annulable, et disparaissait à la première
  // resynchronisation venue d'un collaborateur.
  const duplicateEntity = useCallback(id=>{if(isViewerRef.current)return;const s=entitiesRef.current.find(e=>e.id===id);if(!s)return;const copy={...s,id:genId(),x:s.x+30,y:s.y+30,label:s.label+" (copie)",metadata:{...s.metadata}};const apres=[...entitiesRef.current,copy];setEntities(apres);logAction(`"${s.label}" dupliquée`);collab.sendEntityAdd(copy);resolveOverlaps([copy.id],apres);},[entities,logAction,collab.sendEntityAdd]);
  const copyEntity = useCallback(id=>{const s=entities.find(e=>e.id===id);if(s)setCopiedEntity({...s});},[entities]);
  const pasteEntity = useCallback((cx,cy)=>{if(isViewerRef.current)return;if(!copiedEntity)return;const copy={...copiedEntity,id:genId(),x:cx,y:cy,label:copiedEntity.label+" (copie)",metadata:{...copiedEntity.metadata}};const apres=[...entitiesRef.current,copy];setEntities(apres);logAction(`"${copiedEntity.label}" collée`);collab.sendEntityAdd(copy);resolveOverlaps([copy.id],apres);},[copiedEntity,logAction,collab.sendEntityAdd]);
  const addLink = useCallback((from,to)=>{if(isViewerRef.current)return;if(from===to)return;if(links.find(l=>(l.from===from&&l.to===to)||(l.from===to&&l.to===from)))return;const lk={id:genId(),from,to,type:"related",label:"",color:LINK_TYPES[0].color,strength:"unknown",confidence:50,date:"",comments:[],author:lobbyName||traduire('commun.vous'),createdAt:new Date().toISOString()};setLinks(p=>[...p,lk]);logAction("Lien créé");collab.sendLinkAdd(lk);return lk;},[links,logAction,lobbyMode,collab.sendLinkAdd]);
  const updateLink = useCallback((id,u)=>{if(isViewerRef.current)return;setLinks(p=>p.map(l=>l.id===id?{...l,...u}:l));collab.sendLinkUpdate(id,u);},[lobbyMode,collab.sendLinkUpdate]);
  const deleteLink = useCallback(id=>{if(isViewerRef.current)return;setLinks(p=>p.filter(l=>l.id!==id));if(selectedLinkId===id)setSelectedLinkId(null);logAction("Lien supprimé");collab.sendLinkDelete(id);},[selectedLinkId,logAction,lobbyMode,collab.sendLinkDelete]);

  /**
   * Insertion en masse - exposée aux plugins par `ctx.bulkAdd` (SDK 2.2).
   *
   * Un import n'est pas une rafale de créations. Boucler sur `addEntity` /
   * `addLink` coûterait un pas d'annulation par élément, rejouerait
   * `resolveOverlaps` à chaque entité - donc défairait la disposition importée
   * pendant qu'on la pose - et obligerait l'appelant à récupérer les
   * identifiants un par un pour créer les liens.
   *
   * Ici : une seule transaction (`collab.batch`), un seul `setEntities`, un
   * seul passage d'anti-chevauchement à la fin. Les descripteurs de liens
   * désignent leurs extrémités par le `ref` du descripteur d'entité - les
   * identifiants du fichier source, que l'appelant est seul à connaître - ou
   * par l'id d'une entité déjà présente sur le graphe.
   *
   * @param entities descripteurs {ref, subtype, label, description, notes, x, y,
   *                 color, metadata, comments, createdAt}
   * @param links    descripteurs {from, to, type, label, confidence, strength,
   *                 bidirectional, date, metadata, comments, createdAt}
   * @returns {{entities, links, idByRef, ignored}}
   */
  const bulkAdd = useCallback((payload)=>{if(isViewerRef.current)return{entities:[],links:[],idByRef:{},ignored:[{raison:traduire('bulk.lectureSeule')}]};
    if(isViewer) return null;
    const descE = Array.isArray(payload?.entities) ? payload.entities : [];
    const descL = Array.isArray(payload?.links) ? payload.links : [];
    const maintenant = new Date().toISOString();
    const auteur = lobbyName || traduire('commun.vous');
    const idByRef = {};
    const ignored = [];
    const nouvellesEnt = [];

    descE.forEach((d,i)=>{
      const info = ALL_ITEMS[d?.subtype];
      // Un sous-type inconnu est signalé, pas deviné : choisir un type à la
      // place de l'appelant produirait une entité fausse dans une enquête.
      if(!info){ ignored.push(traduire('bulk.sousTypeInconnu',{i,sousType:d?.subtype})); return; }
      const ent={
        id:genId(), type:info.category, subtype:d.subtype,
        label:d.label||info.label, description:d.description||"", notes:d.notes||"",
        x:Number.isFinite(d.x)?d.x:(300+Math.random()*200-pan.x/zoom),
        y:Number.isFinite(d.y)?d.y:(200+Math.random()*200-pan.y/zoom),
        color:d.color||info.color, metadata:d.metadata||{}, comments:d.comments||[],
        author:auteur, createdAt:d.createdAt||maintenant,
      };
      if(d.ref!=null) idByRef[d.ref]=ent.id;
      nouvellesEnt.push(ent);
    });

    const resoudre = r => (r!=null && idByRef[r]) || r;
    const dejaLie = new Set(links.map(l=>[l.from,l.to].sort().join("|")));
    const nouveauxLiens=[];

    descL.forEach((d,i)=>{
      const from=resoudre(d?.from), to=resoudre(d?.to);
      if(!from||!to||from===to){ ignored.push(traduire('bulk.extremiteManquante',{i})); return; }
      // Même règle que addLink : un seul lien par paire, sens indifférent.
      const cle=[from,to].sort().join("|");
      if(dejaLie.has(cle)){ ignored.push(traduire('bulk.doublon',{i})); return; }
      dejaLie.add(cle);
      const lt = LINK_TYPES.find(t=>t.id===d.type) || LINK_TYPES[0];
      nouveauxLiens.push({
        id:genId(), from, to, type:lt.id, label:d.label||"", color:lt.color,
        strength:d.strength||"unknown", confidence:Number.isFinite(d.confidence)?d.confidence:0,
        bidirectional:!!d.bidirectional, date:d.date||"",
        ...(d.metadata?{metadata:d.metadata}:{}),
        comments:d.comments||[], author:auteur, createdAt:d.createdAt||maintenant,
      });
    });

    if(!nouvellesEnt.length && !nouveauxLiens.length) return {entities:[],links:[],idByRef,ignored};

    const apresE=[...entities,...nouvellesEnt];
    const apresL=[...links,...nouveauxLiens];
    setEntities(apresE); setLinks(apresL);
    // Une seule transaction : annuler un import entier tient en un Ctrl+Z.
    collab.batch(()=>{
      nouvellesEnt.forEach(e=>collab.sendEntityAdd(e));
      nouveauxLiens.forEach(l=>collab.sendLinkAdd(l));
    });
    logAction(`Import : ${nouvellesEnt.length} entité(s), ${nouveauxLiens.length} lien(s)`);
    // Les entités DÉJÀ présentes sont figées : l'import s'insère autour d'elles
    // au lieu de bousculer un graphe existant. Un seul passage, à la fin.
    if(nouvellesEnt.length) resolveOverlaps(entities.map(e=>e.id),apresE);

    return {entities:nouvellesEnt, links:nouveauxLiens, idByRef, ignored};
  },[entities,links,pan,zoom,logAction,lobbyMode,collab.batch,collab.sendEntityAdd,collab.sendLinkAdd,resolveOverlaps]);


  // Sticker CRUD
  const addSticker=useCallback((emoji,label,cx,cy)=>{if(isViewerRef.current)return;const s={id:genId(),emoji,label,x:cx??(400-pan.x/zoom+Math.random()*100),y:cy??(300-pan.y/zoom+Math.random()*100),author:lobbyName||traduire('commun.vous'),createdAt:new Date().toISOString()};setStickers(p=>[...p,s]);logAction("Sticker \""+label+"\" ajouté");collab.sendStickerAdd(s);},[pan,zoom,logAction,lobbyMode,collab.sendStickerAdd]);
  const deleteSticker=useCallback(id=>{if(isViewerRef.current)return;setStickers(p=>p.filter(s=>s.id!==id));setSelectedStickerId(null);collab.sendStickerDelete(id);},[lobbyMode,collab.sendStickerDelete]);

  // Post-it CRUD
  const addPostit=useCallback((color,cx,cy)=>{if(isViewerRef.current)return;const p={id:genId(),text:"",color:color||"#fef08a",x:cx??(350-pan.x/zoom+Math.random()*100),y:cy??(250-pan.y/zoom+Math.random()*100),w:140,h:100,author:lobbyName||traduire('commun.vous'),createdAt:new Date().toISOString()};setPostits(prev=>[...prev,p]);logAction("Post-it ajouté");collab.sendPostitAdd(p);},[pan,zoom,logAction,lobbyMode,collab.sendPostitAdd]);
  const updatePostit=useCallback((id,u)=>{if(isViewerRef.current)return;setPostits(p=>p.map(n=>n.id===id?{...n,...u}:n));collab.sendPostitUpdate(id,u);},[lobbyMode,collab.sendPostitUpdate]);
  const deletePostit=useCallback(id=>{if(isViewerRef.current)return;const pid="postit_"+id;const dead=links.filter(l=>l.from===pid||l.to===pid);setPostits(p=>p.filter(n=>n.id!==id));setLinks(p=>p.filter(l=>l.from!==pid&&l.to!==pid));setSelectedPostitId(null);collab.batch(()=>{dead.forEach(l=>collab.sendLinkDelete(l.id));collab.sendPostitDelete(id);});},[links,lobbyMode,collab.batch,collab.sendPostitDelete,collab.sendLinkDelete]);

  // Sticker drag
  const handleStickerDown=useCallback((e,sid)=>{if(isViewerRef.current)return;e.stopPropagation();if(e.button!==0)return;const pos=screenToCanvas(e.clientX,e.clientY);const s=stickers.find(st=>st.id===sid);mouseDownInfo.current={eid:sid,sx:e.clientX,sy:e.clientY,ox:pos.x-s.x,oy:pos.y-s.y,moved:false,linking:false,kind:"sticker"};setSelectedStickerId(sid);setSelectedId(null);setSelectedLinkId(null);setSelectedPostitId(null);},[screenToCanvas,stickers]);

  // Postit drag
  const handlePostitDown=useCallback((e,pid)=>{if(isViewerRef.current)return;e.stopPropagation();if(e.button!==0)return;const pos=screenToCanvas(e.clientX,e.clientY);const p=postits.find(pt=>pt.id===pid);mouseDownInfo.current={eid:pid,sx:e.clientX,sy:e.clientY,ox:pos.x-p.x,oy:pos.y-p.y,moved:false,linking:false,kind:"postit"};if(e.ctrlKey||e.metaKey){mouseDownInfo.current.linking=true;setLinkingFrom("postit_"+pid);setHoldActive(true);setSelectedPostitId(pid);return;}holdTimer.current=setTimeout(()=>{if(mouseDownInfo.current&&!mouseDownInfo.current.moved&&mouseDownInfo.current.kind==="postit"){mouseDownInfo.current.linking=true;setLinkingFrom("postit_"+pid);setHoldActive(true);}},HOLD_DELAY);setSelectedPostitId(pid);setSelectedId(null);setSelectedLinkId(null);setSelectedStickerId(null);},[screenToCanvas,postits]);

  // Hover logic

  const handleEntityPointerDown = useCallback((e,eid)=>{e.stopPropagation();if(e.button!==0)return;
    if(isViewerRef.current)return; // Viewers cannot interact with entities
    // Check if entity is locked by another user
    const lockInfo=collab.isLockedByOther(eid);if(lockInfo)return;
    // Le verrou est posé par l'effet ci-dessous (drag / édition / panneau),
    // pas ici : un simple clic sans déplacement laissait sinon un verrou
    // permanent, jamais relâché.
    const pos=screenToCanvas(e.clientX,e.clientY);const ent=entities.find(en=>en.id===eid);const ox=pos.x-ent.x,oy=pos.y-ent.y;
    // Shift+clic : ajoute ou retire l'entité du lot, sans rien déplacer.
    // Ctrl/Cmd est déjà pris par la création de lien, c'est donc Shift ou rien.
    // Seule façon jusqu'ici de composer une sélection : la boîte - impossible de
    // prendre trois entités éparpillées sans embarquer tout ce qui les sépare.
    if(e.shiftKey){
      mouseDownInfo.current=null;
      setMultiSelection(prev=>prev.includes(eid)?prev.filter(x=>x!==eid):[...prev,eid]);
      setSelectedId(eid);setSelectedLinkId(null);setCtxMenu(null);
      return;
    }
    mouseDownInfo.current={eid,sx:e.clientX,sy:e.clientY,ox,oy,moved:false,linking:false,kind:"entity"};if(e.ctrlKey||e.metaKey){mouseDownInfo.current.linking=true;setLinkingFrom(eid);setHoldActive(true);return;}holdTimer.current=setTimeout(()=>{if(mouseDownInfo.current&&!mouseDownInfo.current.moved){mouseDownInfo.current.linking=true;setLinkingFrom(eid);setHoldActive(true);}},HOLD_DELAY);dragOffset.current={x:ox,y:oy};
    // La sélection se fait dès l'appui (l'entité doit être mise en évidence
    // pendant le déplacement), mais PAS l'ouverture du panneau : elle attend le
    // relâchement, et seulement si le pointeur n'a pas bougé. Ouvrir ici faisait
    // surgir le panneau à chaque tentative de déplacement.
    // Cliquer une entité HORS du lot le dissout : l'écran annonçait cinq
    // entités sélectionnées alors qu'une seule allait bouger.
    setMultiSelection(prev=>prev.includes(eid)?prev:[]);
    setSelectedId(eid);setSelectedLinkId(null);setCtxMenu(null);},[screenToCanvas,entities,collab.isLockedByOther,collab.lockEntity,collab.connected,lobbyMode]);

  // Régulateur de diffusion des positions. L'état local reste à 60 Hz - c'est
  // ce qu'on voit soi-même - mais on n'émet qu'un message toutes les 50 ms,
  // comme le curseur. Sans lui, un glissé émettait ~60 messages par seconde et
  // par utilisateur ; un groupe de cinq entités montait à 8 ko/s.
  // La position finale exacte est renvoyée au relâchement, hors régulation.
  const posThrottle = useRef(0);
  const diffuserPositions = useCallback((envoi)=>{
    const now=Date.now();
    if(now-posThrottle.current<POS_THROTTLE_MS)return;
    posThrottle.current=now;
    envoi();
  },[]);

  const handlePointerMove = useCallback(e=>{if(selBoxStart.current){const pos=screenToCanvas(e.clientX,e.clientY);setSelectionBox({x1:selBoxStart.current.x,y1:selBoxStart.current.y,x2:pos.x,y2:pos.y});return;}if(isPanning){setPan({x:panStart.current.px+(e.clientX-panStart.current.x),y:panStart.current.py+(e.clientY-panStart.current.y)});
    // Track movement for stamp mode
    if(mouseDownInfo.current?.kind==="stamp"){const dx=e.clientX-mouseDownInfo.current.sx,dy=e.clientY-mouseDownInfo.current.sy;if(Math.sqrt(dx*dx+dy*dy)>MOVE_THRESHOLD)mouseDownInfo.current.moved=true;}
    return;}const info=mouseDownInfo.current;if(!info)return;const dx=e.clientX-info.sx,dy=e.clientY-info.sy;if(Math.sqrt(dx*dx+dy*dy)>MOVE_THRESHOLD&&!info.moved){info.moved=true;if(!info.linking){clearTimeout(holdTimer.current);setDragging(info.eid);}}const pos2=screenToCanvas(e.clientX,e.clientY);if(isViewerRef.current)return;if(info.kind==="entity"){
      if(info.linking){setLinkMousePos(pos2);}
      else if(info.moved){
        if(multiSelection.includes(info.eid)&&multiSelection.length>1){
          // Déplacement de GROUPE. L'état local suit chaque image (fluide pour
          // soi) ; la diffusion est régulée (fluide pour les autres sans
          // saturer le réseau). Auparavant rien ne partait avant le relâcher :
          // pour un collaborateur, le groupe restait figé puis se téléportait.
          const cur=entities.find(e=>e.id===info.eid);
          const ddx=pos2.x-info.ox-(cur?.x||0), ddy=pos2.y-info.oy-(cur?.y||0);
          const suivant=entities.map(e=>multiSelection.includes(e.id)?{...e,x:e.x+ddx,y:e.y+ddy}:e);
          setEntities(suivant);
          diffuserPositions(()=>collab.batch(()=>suivant.forEach(e=>{
            if(multiSelection.includes(e.id))collab.sendEntityUpdate(e.id,{x:e.x,y:e.y});
          })));
        }else{
          const nx=pos2.x-info.ox, ny=pos2.y-info.oy;
          setEntities(p=>p.map(e=>e.id===info.eid?{...e,x:nx,y:ny}:e));
          diffuserPositions(()=>collab.sendEntityUpdate(info.eid,{x:nx,y:ny}));
        }
      }
    }
    else if(info.kind==="sticker"&&info.moved){
      const nx=pos2.x-info.ox, ny=pos2.y-info.oy;
      setStickers(p=>p.map(s=>s.id===info.eid?{...s,x:nx,y:ny}:s));
      diffuserPositions(()=>collab.sendStickerUpdate(info.eid,{x:nx,y:ny}));
    }
    else if(info.kind==="postit"){
      if(info.linking){setLinkMousePos(pos2);}
      else if(info.moved){
        const nx=pos2.x-info.ox, ny=pos2.y-info.oy;
        setPostits(p=>p.map(n=>n.id===info.eid?{...n,x:nx,y:ny}:n));
        diffuserPositions(()=>collab.sendPostitUpdate(info.eid,{x:nx,y:ny}));
      }
    }},[isPanning,screenToCanvas,multiSelection,entities,diffuserPositions,collab.batch,collab.sendEntityUpdate,collab.sendStickerUpdate,collab.sendPostitUpdate]);

  const handlePointerUp = useCallback(e=>{clearTimeout(holdTimer.current);const wasDragging=dragging;setIsPanning(false);setDragging(null);setHoldActive(false);
    // Clic net sur une entité (aucun mouvement, ni création de lien) : c'est là
    // qu'on ouvre le panneau. Le seuil MOVE_THRESHOLD absorbe le tremblement de
    // main qui, sinon, transformerait un clic en déplacement d'un pixel.
    {
      const info=mouseDownInfo.current;
      if(info?.kind==="entity"&&!info.moved&&!info.linking) setRightPanelOpen(true);
    }
    // Fin de déplacement. Seule l'entité déplacée SEULE était propagée : un
    // déplacement de groupe, un sticker ou un post-it ne partaient nulle part
    // - invisibles pour les collaborateurs, et absents de l'annulation.
    if(wasDragging){
      const kind = mouseDownInfo.current?.kind;
      if(kind==="sticker"){
        const s = stickers.find(x => x.id === wasDragging);
        if(s) collab.sendStickerUpdate(wasDragging, { x: s.x, y: s.y });
      }else if(kind==="postit"){
        const n = postits.find(x => x.id === wasDragging);
        if(n) collab.sendPostitUpdate(wasDragging, { x: n.x, y: n.y });
      }else if(multiSelection.length>1 && multiSelection.includes(wasDragging)){
        // Déplacement de groupe : toutes les entités bougées, en une seule
        // transaction, donc un seul Ctrl+Z pour tout remettre en place.
        collab.batch(()=>multiSelection.forEach(id=>{
          const en = entities.find(x => x.id === id);
          if(en) collab.sendEntityUpdate(id, { x: en.x, y: en.y });
        }));
      }else{
        const ent = entities.find(en => en.id === wasDragging);
        if(ent) collab.sendEntityUpdate(wasDragging, { x: ent.x, y: ent.y });
      }
    }
    // Resolve overlaps after drag
    // Anti-chevauchement, y compris après un déplacement de GROUPE : on fige
    // TOUT le lot, si bien que son agencement interne est préservé et que seules
    // les entités extérieures sur lesquelles il a été posé s'écartent.
    // (Il était désactivé dans ce cas tant que l'algorithme ne savait figer
    // qu'une seule entité : il disloquait alors le lot qu'on venait de composer.)
    if(wasDragging){
      const enGroupe = multiSelection.length>1 && multiSelection.includes(wasDragging);
      resolveOverlaps(enGroupe ? multiSelection : wasDragging);
    }
    // Stamp mode: place sticker only if no drag movement
    if(mouseDownInfo.current?.kind==="stamp"&&!mouseDownInfo.current.moved&&stampSticker){const pos=screenToCanvas(e.clientX,e.clientY);addSticker(stampSticker.emoji,stampSticker.label,pos.x-20,pos.y-20);mouseDownInfo.current=null;return;}
    if(selBoxStart.current){const pos=screenToCanvas(e.clientX,e.clientY);const bx1=Math.min(selBoxStart.current.x,pos.x),by1=Math.min(selBoxStart.current.y,pos.y),bx2=Math.max(selBoxStart.current.x,pos.x),by2=Math.max(selBoxStart.current.y,pos.y);const sel=entities.filter(ent=>ent.x+ENT_W>=bx1&&ent.x<=bx2&&ent.y+ENT_H>=by1&&ent.y<=by2).map(e=>e.id);setMultiSelection(sel);selBoxStart.current=null;setSelectionBox(null);mouseDownInfo.current=null;return;}if(linkingFrom){const pos=screenToCanvas(e.clientX,e.clientY);const fromId=linkingFrom;const targetEnt=entities.find(ent=>pos.x>=ent.x&&pos.x<=ent.x+ENT_W&&pos.y>=ent.y&&pos.y<=ent.y+ENT_H);const targetPostit=postits.find(p=>pos.x>=p.x&&pos.x<=p.x+p.w&&pos.y>=p.y&&pos.y<=p.y+p.h);let targetId=null;if(targetEnt)targetId=targetEnt.id;else if(targetPostit)targetId="postit_"+targetPostit.id;if(targetId&&targetId!==fromId)addLink(fromId,targetId);setLinkingFrom(null);setLinkMousePos(null);}mouseDownInfo.current=null;},[linkingFrom,screenToCanvas,entities,postits,stickers,multiSelection,addLink,stampSticker,addSticker,dragging,resolveOverlaps,collab.batch,collab.sendEntityUpdate,collab.sendStickerUpdate,collab.sendPostitUpdate]);

  const handleCanvasDown = useCallback(e=>{if(e.target===canvasRef.current||e.target.tagName==="svg"||e.target.classList?.contains("canvas-bg")){if(e.button===0){if(e.shiftKey){const pos=screenToCanvas(e.clientX,e.clientY);selBoxStart.current=pos;setSelectionBox({x1:pos.x,y1:pos.y,x2:pos.x,y2:pos.y});return;}if(stampSticker){// Start tracking for stamp - we'll place on mouseUp only if no movement
        mouseDownInfo.current={kind:"stamp",sx:e.clientX,sy:e.clientY,moved:false};
        // Also allow panning: start pan tracking
        setIsPanning(true);panStart.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
        return;}setIsPanning(true);panStart.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};setSelectedId(null);setSelectedLinkId(null);setSelectedStickerId(null);setSelectedPostitId(null);setMultiSelection([]);setRightPanelOpen(false);setCtxMenu(null);}}},[pan,stampSticker,screenToCanvas,addSticker]);

  // Zoom with scroll - centered on mouse
  // L'écouteur vit sur canvasWrapRef, qui englobe non seulement le canvas mais
  // TOUS les panneaux flottants (chronologie, chat, menu contextuel, barre
  // d'outils…). Leur molette remontait jusqu'ici : faire défiler la liste de la
  // chronologie zoomait le graphe, et sur la frise plein écran les deux zooms
  // se déclenchaient ensemble. On ne zoome donc que si le pointeur est
  // réellement sur le canvas, et pas sur quelque chose posé par-dessus.
  const doWheel = useCallback(e=>{if(!canvasRef.current?.contains(e.target))return;if(showPlugins||activePlugin)return;e.preventDefault();e.stopPropagation();const r=canvasWrapRef.current?.getBoundingClientRect();if(!r)return;const mx=e.clientX-r.left,my=e.clientY-r.top;const factor=e.deltaY>0?0.9:1.1;setZoom(z=>{const nz=clamp(z*factor,0.1,4);const ratio=nz/z;setPan(p=>({x:mx-ratio*(mx-p.x),y:my-ratio*(my-p.y)}));return nz;});},[showPlugins,activePlugin]);
  useEffect(()=>{const el=canvasWrapRef.current;if(!el)return;el.addEventListener("wheel",doWheel,{passive:false});return()=>el.removeEventListener("wheel",doWheel);},[doWheel]);
  useEffect(()=>{const h=e=>{
    if(e.key==="Escape"){
      setStampSticker(null);setCtxMenu(null);
      // Sortie du mode « lot » : il n'existait aucun moyen de le dissoudre
      // autrement qu'en cliquant dans le vide.
      if(multiSelection.length>0)setMultiSelection([]);
    }
    // Delete key
    if(e.key==="Delete"&&!editingLabel&&!editingPostit){
      if(selectedId){deleteEntity(selectedId);return;}
      if(selectedLinkId){deleteLink(selectedLinkId);return;}
      if(selectedStickerId){deleteSticker(selectedStickerId);return;}
      if(selectedPostitId){deletePostit(selectedPostitId);return;}
    }
    // Ctrl+A select all
    if(e.key==="a"&&(e.ctrlKey||e.metaKey)){
      e.preventDefault();
      setMultiSelection(entities.map(ent=>ent.id));
    }
    // Annuler / rétablir. Écarté pendant une saisie : dans un <input> ou un
    // <textarea>, Ctrl+Z doit annuler la frappe, pas une entité du graphe.
    if((e.key==="z"||e.key==="Z"||e.key==="y")&&(e.ctrlKey||e.metaKey)){
      const tag=e.target?.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA"||e.target?.isContentEditable)return;
      if(editingLabel||editingPostit)return;
      e.preventDefault();
      if(isViewerRef.current)return;
      // Ctrl+Y et Ctrl+Maj+Z rétablissent, Ctrl+Z annule.
      if(e.key==="y"||e.shiftKey)collab.redo(); else collab.undo();
    }
  };window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[selectedId,selectedLinkId,selectedStickerId,selectedPostitId,editingLabel,editingPostit,entities,multiSelection,deleteEntity,deleteLink,deleteSticker,deletePostit,collab.undo,collab.redo]);

  const handleDrop = useCallback(e=>{e.preventDefault();if(isViewerRef.current)return;const subId=e.dataTransfer.getData("subItemId");if(!subId)return;const pos=screenToCanvas(e.clientX,e.clientY);const stickerEmoji=e.dataTransfer.getData("stickerEmoji");const stickerLabel=e.dataTransfer.getData("stickerLabel");const postitColor=e.dataTransfer.getData("postitColor");if(subId)addEntity(subId,pos.x-ENT_HW,pos.y-ENT_HH);else if(stickerEmoji)addSticker(stickerEmoji,stickerLabel,pos.x-20,pos.y-20);else if(postitColor)addPostit(postitColor,pos.x-70,pos.y-50);},[screenToCanvas,addEntity]);

  const zoomIn=()=>setZoom(z=>clamp(z*1.2,0.1,4));
  const zoomOut=()=>setZoom(z=>clamp(z*0.8,0.1,4));
  const fitView=()=>{if(!entities.length)return;const r=canvasRef.current?.getBoundingClientRect();if(!r)return;const xs=entities.map(e=>e.x),ys=entities.map(e=>e.y);const[mx,my,Mx,My]=[Math.min(...xs)-120,Math.min(...ys)-120,Math.max(...xs)+280,Math.max(...ys)+180];const nz=clamp(Math.min(r.width/(Mx-mx),r.height/(My-my)),0.1,2);setZoom(nz);setPan({x:-mx*nz+(r.width-(Mx-mx)*nz)/2,y:-my*nz+(r.height-(My-my)*nz)/2});};



  // === Register remote handlers via addListener (subscriber pattern, no overwrite) ===
  useEffect(()=>{
    const unsubs = [
      collab.addListener('entity:add', (ent)=>setEntities(p=>{if(p.find(e=>e.id===ent.id))return p;return[...p,ent];})),
      collab.addListener('entity:update', (id,fullEnt)=>setEntities(p=>p.map(e=>e.id===id?{...e,...fullEnt}:e))),
      collab.addListener('entity:delete', (id)=>{setEntities(p=>p.filter(e=>e.id!==id));setLinks(p=>p.filter(l=>l.from!==id&&l.to!==id));}),
      collab.addListener('link:add', (lk)=>setLinks(p=>{if(p.find(l=>l.id===lk.id))return p;return[...p,lk];})),
      collab.addListener('link:update', (id,fullLk)=>setLinks(p=>p.map(l=>l.id===id?{...l,...fullLk}:l))),
      collab.addListener('link:delete', (id)=>setLinks(p=>p.filter(l=>l.id!==id))),
      collab.addListener('sticker:add', (s)=>setStickers(p=>{if(p.find(x=>x.id===s.id))return p;return[...p,s];})),
      collab.addListener('sticker:update', (id,full)=>setStickers(p=>p.map(s=>s.id===id?{...s,...full}:s))),
      collab.addListener('sticker:delete', (id)=>setStickers(p=>p.filter(s=>s.id!==id))),
      collab.addListener('postit:add', (pt)=>setPostits(p=>{if(p.find(x=>x.id===pt.id))return p;return[...p,pt];})),
      collab.addListener('postit:update', (id,full)=>setPostits(p=>p.map(n=>n.id===id?{...n,...full}:n))),
      collab.addListener('postit:delete', (id)=>setPostits(p=>p.filter(n=>n.id!==id))),
      collab.addListener('timeline:add', (event)=>setTimeline(p=>[event,...p.slice(0,99)])),
    ];
    return ()=>unsubs.forEach(u=>u());
  },[collab.addListener]);// eslint-disable-line

  // === LIEN D'INVITATION ===
  const requestInviteLink = useCallback(async () => {
    if (!activeRoom) return;
    setInviteError(""); setInviteLink("");
    try {
      const r = await fetch(`${serverUrl}/api/cases/${encodeURIComponent(activeRoom)}/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ANALYST" }),
      });
      const d = await r.json();
      if (!r.ok) { setInviteError(d.error || tr('graphe.lienImpossible')); return; }
      setInviteLink(`${window.location.origin}/room/${encodeURIComponent(activeRoom)}?invite=${encodeURIComponent(d.token)}`);
    } catch {
      setInviteError("Serveur injoignable.");
    }
  }, [activeRoom, serverUrl]);

  // === AUTO-SAVE SYSTEM ===
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"

  // Inject spin animation CSS
  useEffect(()=>{
    if(document.getElementById("om-spin"))return;
    const s=document.createElement("style");s.id="om-spin";
    s.textContent="@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  },[]);
  const saveTimerRef = useRef(null);
  const lastSaveHashRef = useRef("");

  // Compute a quick hash of current state to detect changes
  const stateHash = useMemo(()=>{
    return `${entities.length}:${links.length}:${stickers.length}:${postits.length}:${timeline.length}:${entities.map(e=>e.id+e.x+e.y+e.label+(e.color||"")).join(",")}:${links.map(l=>l.id+l.type+l.label).join(",")}`;
  },[entities,links,stickers,postits,timeline]);

  // Save function - HTTP POST to server
  const doSave = useCallback(()=>{
    if(!activeRoom||stateHash===lastSaveHashRef.current)return;
    // Un compte sans droit d'écriture serait rejeté par le serveur (403) :
    // inutile de tenter, et il ne doit pas non plus bloquer l'élection.
    // `canEdit` porte sur le rôle PLATEFORME ; `isViewer` sur le rôle dans
    // CETTE enquête. Un analyste invité en lecture seule passait le premier
    // test, se faisait refuser par le serveur, et l'interface affichait
    // « Erreur de sauvegarde » alors que tout fonctionnait comme prévu.
    if(!canEdit||isViewer)return;
    // En session collaborative, un seul client écrit le fichier (le sauvegardeur
    // élu). Auparavant tous écrivaient en concurrence, chacun avec son propre
    // état local, et le dernier arrivé écrasait les autres.
    if(collab.connected&&!collab.isSaveLeader)return;

    setSaveStatus("saving");
    // Rend la promesse : l'archive est bâtie par le serveur à partir du fichier
    // SAUVEGARDÉ, elle doit donc pouvoir attendre la fin de l'écriture.
    return fetch(`${serverUrl}/api/save/${encodeURIComponent(activeRoom)}`,{
      method:"POST",
      credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({entities,links,stickers,postits,timeline,caseInfo,user:lobbyName}),
    }).then(r=>{
      if(r.ok){lastSaveHashRef.current=stateHash;setSaveStatus("saved");setTimeout(()=>setSaveStatus(s=>s==="saved"?"idle":s),2000);}
      else{setSaveStatus("error");}
    }).catch(e=>{setSaveStatus("error");});
  },[activeRoom,entities,links,stickers,postits,timeline,caseInfo,lobbyName,stateHash,serverUrl,collab.connected,collab.isSaveLeader,canEdit,isViewer]);

  // Immediate save on every state change (debounced 1s)
  // CRITICAL: don't save until init from server is processed (otherwise empty state overwrites real data)
  useEffect(()=>{
    if(!activeRoom||!caseCreated||!initLoadedRef.current)return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current=setTimeout(doSave,500);
    return()=>clearTimeout(saveTimerRef.current);
  },[stateHash,activeRoom,caseCreated,doSave]);

  // Save on page unload (F5, close tab)
  useEffect(()=>{const h=()=>{if(activeRoom&&initLoadedRef.current)doSave();};window.addEventListener('beforeunload',h);return()=>window.removeEventListener('beforeunload',h);},[doSave,activeRoom]);

  // Periodic auto-save every 30s as safety net
  useEffect(()=>{
    if(!activeRoom||!caseCreated)return;
    const iv=setInterval(()=>{if(initLoadedRef.current)doSave();},30000);
    return()=>clearInterval(iv);
  },[activeRoom,caseCreated,doSave]);

  // On init from server: load state
  const initLoadedRef = useRef(!session); // If no session (new case), allow saving immediately
  useEffect(()=>{
    if(!collab.initialState)return;
    const s=collab.initialState;
    
    if(s.caseInfo?.title){setCaseInfo(ci=>({...ci,...s.caseInfo}));setCaseCreated(true);}
    if(s.entities?.length||s.links?.length||s.stickers?.length||s.postits?.length){
      setEntities(s.entities||[]);setLinks(s.links||[]);setStickers(s.stickers||[]);setPostits(s.postits||[]);
      setCaseCreated(true);
    }
    if(s.timeline?.length) setTimeline(s.timeline.slice().reverse().slice(0,100));
    // Mark init as loaded - auto-save can now safely run
    initLoadedRef.current=true;
  },[collab.initialState]);

  // === Owner disconnect banner: show for 15s then auto-hide ===
  useEffect(()=>{
    if(collab.ownerDisconnected){
      setOwnerBannerVisible(true);
      clearTimeout(ownerBannerTimer.current);
      ownerBannerTimer.current=setTimeout(()=>setOwnerBannerVisible(false),15000);
    } else {
      setOwnerBannerVisible(false);
      clearTimeout(ownerBannerTimer.current);
    }
    return()=>clearTimeout(ownerBannerTimer.current);
  },[collab.ownerDisconnected]);

  // === COLLAB: verrou d'édition ===
  // Source unique du verrou : on tient l'entité que l'on est en train de
  // déplacer, de renommer, ou dont le panneau d'édition est ouvert. L'awareness
  // relâche automatiquement le verrou si le client se déconnecte.
  useEffect(()=>{
    if(!collab.connected)return;
    // Pendant un déplacement de GROUPE, tout le lot est verrouillé : seule
    // l'entité saisie l'était, un collaborateur pouvait attraper une des autres
    // en cours de geste et les deux mouvements se combinaient.
    const enGroupe = dragging && multiSelection.length>1 && multiSelection.includes(dragging);
    const target = enGroupe ? multiSelection
      : (editingLabel || dragging || (rightPanelOpen ? selectedId : null));
    collab.lockEntity(target);
  },[editingLabel,dragging,rightPanelOpen,selectedId,multiSelection,collab.connected,collab.lockEntity]);

  // === COLLAB: Broadcast cursor on move ===
  const collabCursorThrottle = useRef(0);
  const broadcastCursor = useCallback((e)=>{
    if(!collab.connected)return;
    const now=Date.now();if(now-collabCursorThrottle.current<50)return;collabCursorThrottle.current=now;
    const pos=screenToCanvas(e.clientX,e.clientY);
    collab.sendCursor(pos);
  },[lobbyMode,collab.connected,collab.sendCursor,screenToCanvas]);

  // === COLLAB: Broadcast selection ===
  useEffect(()=>{
    if(!collab.connected)return;
    // On diffuse le LOT quand il existe : un collaborateur qui sélectionnait
    // douze entités n'en montrait qu'une aux autres.
    collab.sendSelection(multiSelection.length>1?multiSelection:(selectedId?[selectedId]:[]));
  },[selectedId,multiSelection,collab.connected,collab.sendSelection]);

  // === GEO EXTRACTION ===
  const geoPoints=useMemo(()=>{
    const pts=[];
    const GPS_RE=/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/g;
    entities.forEach(ent=>{
      // 1. Any entity with lat/lng metadata (manual input)
      const mLat=ent.metadata?.lat,mLng=ent.metadata?.lng;
      if(mLat!==undefined&&mLat!==""&&mLng!==undefined&&mLng!==""){
        const la=parseFloat(mLat),lo=parseFloat(mLng);
        if(!isNaN(la)&&!isNaN(lo)&&Math.abs(la)<=90&&Math.abs(lo)<=180){
          pts.push({lat:la,lng:lo,label:ent.label,color:ent.color,id:ent.id,source:"coordonnées"});
          return;
        }
      }
      // 2. GPS coordinates in label (e.g. "48.8566, 2.3522")
      const lm=ent.label.match(/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/);
      if(lm){const la=+lm[1],lo=+lm[2];if(Math.abs(la)<=90&&Math.abs(lo)<=180){pts.push({lat:la,lng:lo,label:ent.label,color:ent.color,id:ent.id,source:"label"});return;}}
      // 3. GPS in description, notes, address
      const texts=[ent.description,ent.notes,ent.metadata?.address].filter(Boolean).join(" ");
      if(texts.length>0){GPS_RE.lastIndex=0;let mm;while((mm=GPS_RE.exec(texts))!==null){const la=+mm[1],lo=+mm[2];if(Math.abs(la)<=90&&Math.abs(lo)<=180)pts.push({lat:la,lng:lo,label:ent.label+" (GPS)",color:ent.color,id:ent.id,source:"description"});}}
    });
    return pts;
  },[entities]);

  // === GEOCODE addresses via Nominatim ===
  const [geocodedPoints, setGeocodedPoints] = useState([]);
  const geocodeCache = useRef({});
  useEffect(()=>{
    const toGeocode=entities.filter(ent=>{
      if(ent.metadata?.lat&&ent.metadata?.lng)return false;
      const isLoc=["loc_address","loc_city","loc_country","loc_gps","loc_poi"].includes(ent.subtype);
      const hasAddr=ent.metadata?.address||"";
      const hasDesc=ent.description||"";
      return isLoc&&(hasAddr.length>5||hasDesc.length>5);
    });
    if(toGeocode.length===0){setGeocodedPoints([]);return;}
    let alive=true;
    const doGeocode=async()=>{
      const results=[];
      for(const ent of toGeocode.slice(0,10)){
        const query=ent.metadata?.address||ent.description||"";
        if(query.length<5)continue;
        if(geocodeCache.current[query]){results.push({...geocodeCache.current[query],label:ent.label,color:ent.color,id:ent.id});continue;}
        try{
          const r=await fetch(`/api/geocode?q=${encodeURIComponent(normalizeAddress(query))}`);
          const d=await r.json();
          if(d[0]){const pt={lat:+d[0].lat,lng:+d[0].lon,source:"geocoded"};geocodeCache.current[query]=pt;results.push({...pt,label:ent.label,color:ent.color,id:ent.id});}
        }catch{}
        await new Promise(r=>setTimeout(r,1100)); // Nominatim rate limit
      }
      if(alive)setGeocodedPoints(results);
    };
    doGeocode();
    return()=>{alive=false;};
  },[entities]);

  const allGeoPoints=useMemo(()=>[...geoPoints,...geocodedPoints],[geoPoints,geocodedPoints]);

  // Événements de la timeline, agrégés depuis quatre sources. Le calcul était
  // écrit en ligne dans le JSX du panneau ; il est extrait ici parce que les
  // deux vues (plein écran et réduite) le consomment.
  //
  // `entityId` accompagne les événements rattachés à un élément du graphe :
  // c'est ce qui permet de sélectionner l'entité en cliquant sur l'événement.
  const timelineEvents=useMemo(()=>{
    const evts=[
      ...timeline.map(it=>({...it,kind:"action",sortDate:it.timestamp})),
      ...(lobbyMode==="collab"?collab.remoteHistory:[]).map(it=>({...it,kind:"remote",sortDate:it.timestamp,color:"#58a6ff"})),
      ...entities.flatMap(e=>(e.comments||[]).map(c=>({id:c.id,kind:"comment",entityId:e.id,action:`💬 ${e.label}: "${c.text.slice(0,40)}"`,user:c.author||traduire('commun.vous'),timestamp:c.date,sortDate:c.date,color:e.color}))),
      ...entities.filter(e=>e.metadata?.date).map(e=>({id:e.id+"_date",kind:"date",entityId:e.id,action:`📅 ${e.label}`,user:"Date",timestamp:new Date(e.metadata.date).toISOString(),sortDate:new Date(e.metadata.date).toISOString(),color:e.color})),
      ...links.flatMap(l=>(l.comments||[]).map(c=>({id:c.id,kind:"comment",acteurs:[l.from,l.to],action:`💬 Lien: "${c.text.slice(0,40)}"`,user:c.author||traduire('commun.vous'),timestamp:c.date,sortDate:c.date,color:"#58a6ff"}))),
      ...links.filter(l=>l.date).map(l=>({id:l.id+"_date",kind:"date",acteurs:[l.from,l.to],action:`📅 Lien: ${l.label||LINK_TYPES.find(lt=>lt.id===l.type)?.label||"lien"}`,user:"Date",timestamp:new Date(l.date).toISOString(),sortDate:new Date(l.date).toISOString(),color:"#58a6ff"})),
    ];
    evts.sort((a,b)=>new Date(b.sortDate)-new Date(a.sortDate));
    return evts;
  },[timeline,entities,links,lobbyMode,collab.remoteHistory]);

  // Leaflet map is now a plugin (see plugins/map/Panel.jsx)
  const exportJSON=()=>{const d={version:"5.0",caseInfo,entities,links,stickers,postits,exportedAt:new Date().toISOString()};const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${caseInfo.title||"OSINTMapper"}.json`;a.click();};

  // Archive complète : contrairement à l'export JSON, elle est bâtie par le
  // serveur - lui seul détient les pièces jointes, que le client ne connaît que
  // par leur URL. Elle repart donc du fichier SAUVEGARDÉ, pas de l'état à
  // l'écran : on force une sauvegarde avant pour ne pas archiver une version
  // antérieure aux dernières modifications.
  const exportArchive=useCallback(async()=>{
    const id=activeRoom||propCaseId;
    if(!id){alert(tr('graphe.export.archiveIndisponible'));return;}
    try{
      await doSave();
      const {uploads,missing}=await apiDownload(`/api/cases/${id}/archive`,"enquete.omcase");
      logAction(`Archive exportée (${uploads} pièce${uploads>1?"s":""} jointe${uploads>1?"s":""})`);
      // Un fichier manquant sur le disque du serveur ne doit pas passer
      // inaperçu : l'archive est incomplète et rien ne le montrerait.
      if(missing>0) alert(tr('graphe.export.archiveIncomplete',{n:missing}));
    }catch(e){alert(tr('graphe.export.impossible',{message:e.message}));}
  },[activeRoom,propCaseId,doSave,logAction]);

  // === PDF EXPORT ===
  // La mise en page vit dans lib/exportPdf.js : 300 lignes qui ne partageaient
  // aucun état avec le graphe, et qu'on ne pouvait ni lire ni modifier sans
  // traverser le monolithe.
  const exportPDF = useCallback(
    () => exporterPdf({ entities, links, stickers, timeline, caseInfo, canvasEl: canvasRef.current, theme: t, tr }),
    [entities, links, stickers, timeline, caseInfo, t, tr],
  );

  // L'import remplaçait l'état local sans jamais toucher au doc : en
  // collaboratif, les autres ne voyaient rien arriver et le doc conservait
  // l'ancien graphe, qui revenait à la première resynchronisation. Le
  // remplacement complet tient en une transaction : un Ctrl+Z le défait.
  const importJSON=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{
    const d=JSON.parse(ev.target.result);
    const nE=d.entities||[],nL=d.links||[],nS=d.stickers||[],nP=d.postits||[];
    if(d.caseInfo)setCaseInfo(d.caseInfo);
    collab.batch(()=>{
      entities.forEach(x=>collab.sendEntityDelete(x.id));
      links.forEach(x=>collab.sendLinkDelete(x.id));
      stickers.forEach(x=>collab.sendStickerDelete(x.id));
      postits.forEach(x=>collab.sendPostitDelete(x.id));
      nE.forEach(x=>collab.sendEntityAdd(x));
      nL.forEach(x=>collab.sendLinkAdd(x));
      nS.forEach(x=>collab.sendStickerAdd(x));
      nP.forEach(x=>collab.sendPostitAdd(x));
    });
    if(isViewerRef.current)return;setEntities(nE);setLinks(nL);setStickers(nS);setPostits(nP);
    setCaseCreated(true);logAction("Projet importé");
    // Un fichier importé peut contenir des positions superposées.
    resolveOverlaps(null,nE);
  }catch{}};r.readAsText(f);};
  const linkCount = useMemo(()=>{const m={};links.forEach(l=>{m[l.from]=(m[l.from]||0)+1;m[l.to]=(m[l.to]||0)+1;});return m;},[links]);
  const toggleCat=cid=>setOpenCats(p=>{const n=new Set(p);n.has(cid)?n.delete(cid):n.add(cid);return n;});
  const toggleFav=iid=>setFavorites(p=>{const n=new Set(p);n.has(iid)?n.delete(iid):n.add(iid);return n;});
  const favItems=useMemo(()=>[...favorites].map(id=>ALL_ITEMS[id]).filter(Boolean),[favorites]);
  const recentItems=useMemo(()=>{const freq={};entities.forEach(e=>{if(e.subtype)freq[e.subtype]=(freq[e.subtype]||0)+1;});return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,count])=>({...ALL_ITEMS[id],count})).filter(Boolean);},[entities]);
  const filteredCats=useMemo(()=>{if(!searchQuery)return CATEGORIES;const q=searchQuery.toLowerCase();return CATEGORIES.map(c=>({...c,items:c.items.filter(it=>it.label.toLowerCase().includes(q)||it.desc?.toLowerCase().includes(q)||c.label.toLowerCase().includes(q))})).filter(c=>c.items.length>0);},[searchQuery]);

  // No text selection style
  const noSelect = { userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none" };


  // === SCREENS: LOBBY → CASES → CREATE → GRAPH ===
  const [activeSessions, setActiveSessions] = useState([]);
  useEffect(()=>{
    if(screen!=="lobby"&&screen!=="cases")return;
    // `/rooms` était l'autre branche quand aucun jeton n'était disponible :
    // cette route n'existe pas côté serveur, elle renvoyait l'index.html du
    // client et `r.json()` échouait. La session vient du cookie, il n'y a plus
    // qu'un seul chemin.
    const f=()=>fetch(`${serverUrl}/api/cases`, { credentials: "include" }).then(r=>r.json()).then(setActiveSessions).catch(()=>setActiveSessions([]));
    f(); const iv=setInterval(f,3000); return()=>clearInterval(iv);
  },[screen, serverUrl]);

  const myCases = useMemo(()=>activeSessions.filter(s=>s.id.startsWith("solo_"+lobbyName.replace(/\s+/g,"_")+"_")||s.userRole==="owner"),[activeSessions,lobbyName]);
  const collabSessions = useMemo(()=>activeSessions.filter(s=>!s.id.startsWith("solo_")),[activeSessions]);

  // Send caseInfo to server once connected
  useEffect(()=>{if(collab.connected&&caseCreated&&caseInfo.title)collab.sendCaseInfo(caseInfo);},[collab.connected,caseCreated]);

  const shellSt = {width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text,...noSelect};
  const cardSt = {background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,padding:48,width:560,maxWidth:"90vw",boxShadow:`0 24px 64px ${t.shadow}`,maxHeight:"90vh",overflowY:"auto"};
  const hdrBlock = <div style={{textAlign:"center",marginBottom:32}}><div style={{width:48,height:48,borderRadius:12,background:"#58a6ff",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>{I.bolt}</div><h1 style={{fontSize:22,fontWeight:700,margin:0}}>OSINT<span style={{color:t.accent}}>Mapper</span></h1><p style={{color:t.textSecondary,fontSize:13,marginTop:4}}>{tr('graphe.plateforme')} <span style={{fontSize:10,color:t.textMuted}}>v0.1 alpha</span></p></div>;
  const themeBtn = <div style={{textAlign:"center",marginTop:20}}><button onClick={()=>setTheme(theme==="dark"?"light":"dark")} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:12,display:"inline-flex",alignItems:"center",gap:6}}>{theme==="dark"?I.sun:I.moon} {theme==="dark"?"Mode clair":"Mode sombre"}</button></div>;

  // ── SCREEN: LOGIN ──
  // Kicked screen
  if(collab.kicked){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:"1px solid #ef4444",borderRadius:16,padding:48,width:400,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{fontSize:48,marginBottom:16}}>🚫</div>
        <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 8px"}}>{tr('collab.expulse')}</h2>
        <p style={{color:t.textMuted,fontSize:13}}>{tr('collab.retireParAdmin')}</p>
        <button onClick={()=>{clearSession();window.location.reload();}} style={{marginTop:20,padding:"10px 24px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>{tr('graphe.retourMenu')}</button>
      </div>
    </div>
  );}


  // Le serveur Yjs a refusé la connexion (token invalide ou pas d'accès à
  // l'enquête). Sans ce bandeau l'utilisateur ne verrait qu'un "Déconnecté" muet.
  if(collab.syncError){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:"1px solid #f59e0b",borderRadius:16,padding:48,width:440,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{fontSize:48,marginBottom:16}}>{collab.syncError==="unauthorized"?"🔑":"🔒"}</div>
        <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 8px"}}>{collab.syncError==="unauthorized"?"Session expirée":"Accès refusé"}</h2>
        <p style={{color:t.textMuted,fontSize:13,lineHeight:1.6}}>
          {collab.syncError==="unauthorized"
            ? "Votre session n'est plus valide. Reconnectez-vous pour reprendre la collaboration."
            : "Vous n'avez pas accès à cette enquête. Demandez un lien d'invitation à son propriétaire."}
        </p>
        <button onClick={()=>{if(collab.syncError==="unauthorized"){clearSession();window.location.href="/login";}else{window.location.href="/dashboard";}}} style={{marginTop:20,padding:"10px 24px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          {collab.syncError==="unauthorized"?"Se reconnecter":"Retour au tableau de bord"}
        </button>
      </div>
    </div>
  );}

  // Waiting for approval (collab join pending)
  if(collab.joinStatus==="pending"){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,padding:48,width:400,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${t.accent}`,borderTopColor:"transparent",margin:"0 auto 20px",animation:"spin 1s linear infinite"}}/>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 8px"}}>{tr('collab.attenteApprobation')}</h2>
        <p style={{color:t.textMuted,fontSize:13}}>{tr('collab.attenteAide')}</p>
        <p style={{color:t.textMuted,fontSize:11,marginTop:12}}>{tr('graphe.salle')}<b>{activeRoom}</b></p>
        <button onClick={()=>{clearSession();}} style={{marginTop:20,padding:"8px 20px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.textMuted,fontSize:12,cursor:"pointer"}}>{tr('commun.annuler')}</button>
      </div>
    </div>
  );}

  // Join denied
  if(collab.joinStatus?.startsWith("denied")){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:"1px solid #ef4444",borderRadius:16,padding:48,width:400,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{fontSize:48,marginBottom:16}}>🚫</div>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 8px"}}>{collab.joinStatus==="denied:wrong_password"?"Mot de passe incorrect":"Demande refusée"}</h2>
        <p style={{color:t.textMuted,fontSize:13}}>{collab.joinStatus==="denied:wrong_password"?"Vérifiez le mot de passe de la salle.":"L'administrateur a refusé votre demande."}</p>
        <button onClick={()=>{clearSession();}} style={{marginTop:20,padding:"10px 24px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>{tr('graphe.retour')}</button>
      </div>
    </div>
  );}

  return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text,overflow:"hidden",...noSelect}} onClick={()=>{setCtxMenu(null);setShowCollabDropdown(false);}}>

      {/* Admin disconnected banner */}
      {ownerBannerVisible&&lobbyMode==="collab"&&<div style={{position:"fixed",top:16,right:16,zIndex:100,background:t.warning,color:"#000",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.3)",maxWidth:400}}>
        <span>{tr('graphe.adminParti')}</span>
        <span style={{fontSize:11,fontWeight:400}}>{tr('graphe.grapheAccessible')}</span>
        <button onClick={()=>setOwnerBannerVisible(false)} style={{background:"none",border:"none",color:"#000",cursor:"pointer",fontSize:16,fontWeight:700,marginLeft:8,opacity:0.6}}>×</button>
      </div>}

      {/* LEFT PANEL */}
      <div style={{width:leftCollapsed?48:280,minWidth:leftCollapsed?48:280,height:"100vh",background:t.surface,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",transition:"all 0.25s",overflow:"hidden",zIndex:10}}>
        <div style={{padding:leftCollapsed?"14px 8px":"14px 16px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:leftCollapsed?"center":"space-between",minHeight:56}}>
          {!leftCollapsed&&<div style={{display:"flex",alignItems:"center",gap:10}}><div><div style={{fontSize:14,fontWeight:700}}>OSINT<span style={{color:t.accent}}>Mapper</span> <span style={{fontSize:9,color:t.textMuted,fontWeight:400}}>v0.1 alpha</span></div><div style={{fontSize:10,color:t.textMuted}}>{caseInfo.title}{isViewer&&<span style={{marginLeft:6,padding:"1px 6px",borderRadius:4,background:t.warning+"20",color:t.warning,fontSize:9,fontWeight:700}}>👁️ LECTURE SEULE</span>}</div><div style={{fontSize:10,color:saveStatus==="error"?"#ef4444":saveStatus==="saving"?"#f59e0b":saveStatus==="saved"?"#10b981":collab.connected?"#10b981":t.textMuted,display:"flex",alignItems:"center",gap:4,marginTop:2}}>{saveStatus==="saving"?<><svg width="10" height="10" viewBox="0 0 24 24" style={{animation:"spin 1s linear infinite"}}><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" strokeLinecap="round"/></svg> {tr('graphe.etat.sauvegardeEnCours')}</>:saveStatus==="saved"?<><div style={{width:5,height:5,borderRadius:3,background:t.success}}/>✓ {tr('graphe.etat.sauvegarde')}</>:saveStatus==="error"?<><div style={{width:5,height:5,borderRadius:3,background:t.danger}}/>⚠ {tr('graphe.etat.erreurSauvegarde')}</>:<><div style={{width:5,height:5,borderRadius:3,background:!activeRoom?t.textMuted:(lobbyMode==="collab"&&!collab.connected)?"#ef4444":t.success}}/>{!activeRoom?tr('graphe.etat.deconnecte'):lobbyMode==="collab"?(collab.connected?(isViewer?tr('graphe.etat.lectureSeuleSalle',{nom:lobbyRoom}):tr('graphe.etat.salle',{nom:lobbyRoom})):tr('graphe.etat.reconnexion')):isViewer?tr('graphe.lectureSeule'):tr('graphe.etat.sauvegardeAuto')}</>}{lobbyMode==="collab"&&collabList.length>0&&` · ${tr('graphe.etat.autres',{n:collabList.length})}`}</div></div></div>}
          <button onClick={()=>setLeftCollapsed(!leftCollapsed)} style={sBtn(t)}>{leftCollapsed?"→":"←"}</button>
        </div>
        {!leftCollapsed&&<>
          {!isViewer ? <>
          <div style={{padding:"14px 16px 6px",display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:t.textMuted}}>{tr('graphe.entites')}</div>
          <div style={{padding:"6px 16px 10px"}}><div style={{display:"flex",alignItems:"center",gap:8,background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px"}}><span style={{color:t.textMuted}}>{I.search}</span><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder={tr('graphe.rechercher')} style={{background:"none",border:"none",color:t.text,fontSize:13,outline:"none",width:"100%",fontFamily:"inherit"}}/></div></div>
          <div style={{flex:1,overflowY:"auto",padding:"0 10px 16px"}}>
            {(favItems.length>0||recentItems.length>0)&&<div style={{marginBottom:6}}>
              {recentItems.length>0&&<><button onClick={()=>toggleCat("_recent")} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}}>{I.chev(openCats.has("_recent"))}<span>🕐</span><span>{tr('graphe.recents')}</span><span style={{marginLeft:"auto",fontSize:11,color:t.warning,background:t.warning+"18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{recentItems.length}</span></button>
              {openCats.has("_recent")&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{recentItems.map(it=><div key={it.id} draggable onDragStart={e=>e.dataTransfer.setData("subItemId",it.id)} onClick={()=>addEntity(it.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",fontSize:12,color:t.text}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{width:8,height:8,borderRadius:4,background:it.color,flexShrink:0}}/><span style={{flex:1}}>{it.label}</span><span style={{fontSize:10,color:t.textMuted,background:t.surfaceAlt,padding:"1px 6px",borderRadius:8}}>×{it.count}</span></div>)}</div>}</>}
              {favItems.length>0&&<><button onClick={()=>toggleCat("_fav")} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}}>{I.chev(openCats.has("_fav"))}<span>⭐</span><span>{tr('graphe.favoris')}</span><span style={{marginLeft:"auto",fontSize:11,color:t.accent,background:t.accent+"18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{favItems.length}</span></button>
              {openCats.has("_fav")&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{favItems.map(it=><SidebarItem key={it.id} item={it} t={t} fav={true} onAdd={()=>addEntity(it.id)} onToggleFav={()=>toggleFav(it.id)} onDragStart={e=>e.dataTransfer.setData("subItemId",it.id)} lectureSeule={isViewer}/>)}</div>}</>}
            </div>}
            {filteredCats.map(cat=><div key={cat.id} style={{marginBottom:2}}>
              <button onClick={()=>toggleCat(cat.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=t.catHover} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                {I.chev(openCats.has(cat.id))}<span>{cat.icon}</span><span style={{flex:1,textAlign:"left"}}>{cat.label}</span><span style={{fontSize:11,color:t.accent,background:t.accent+"18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{cat.items.length}</span>
              </button>
              {openCats.has(cat.id)&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{cat.items.map(item=><SidebarItem key={item.id} item={item} t={t} fav={favorites.has(item.id)} onAdd={()=>addEntity(item.id)} lectureSeule={isViewer} onToggleFav={()=>toggleFav(item.id)} onDragStart={e=>e.dataTransfer.setData("subItemId",item.id)}/>)}</div>}
            </div>)}
          </div>
          </> : <>
            {/* Viewer mode - read-only sidebar */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,gap:12}}>
              <span style={{fontSize:40}}>👁️</span>
              <div style={{fontSize:14,fontWeight:700,color:t.warning,textAlign:"center"}}>{tr('graphe.modeLectureSeule')}</div>
              <div style={{fontSize:11,color:t.textMuted,textAlign:"center",lineHeight:1.6}}>{tr('graphe.lectureSeuleAide')}</div>
              <div style={{marginTop:8,fontSize:11,color:t.textSecondary}}>◆ {entities.length} entités · ⟶ {links.length} liens</div>
            </div>
          </>}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:16,fontSize:11,color:t.textSecondary}}>
            <span>◆ {entities.length}</span><span>⟶ {links.length}</span><span>📌 {stickers.length+postits.length}</span>
            {authUser&&<span style={{fontSize:10,color:t.textMuted,display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}><span style={{width:6,height:6,borderRadius:3,background:authUser.role==="admin"?"#f59e0b":authUser.role==="analyst"?"#10b981":"#6366f1"}}/>{authUser.displayName||authUser.username} ({authUser.role})</span>}
            <button onClick={()=>{if(confirm("Quitter l'enquête ?")){if(onQuit)onQuit();}}} style={{padding:"3px 10px",background:"none",border:`1px solid ${t.border}`,borderRadius:6,color:t.textMuted,cursor:"pointer",fontSize:10,...(authUser?{}:{marginLeft:"auto"})}} title={tr('graphe.retourMenu')}>⏏ {tr('graphe.quitter')}</button>
          </div>
        </>}
      </div>

      {/* CANVAS */}
      <div ref={canvasWrapRef} style={{flex:1,position:"relative",overflow:"hidden"}}>
        {/* zIndex 25 : au-dessus des notifications d'arrivée (20), qui sont un
            FRÈRE de ce conteneur. Un élément positionné avec z-index crée un
            contexte d'empilement - le z-index des menus déroulants ne vaut qu'à
            l'intérieur. À 5, un menu ouvert passait sous les notifications, qui
            s'affichent précisément là où il se déploie (top:60, right:16). */}
        <div style={{position:"absolute",top:12,left:12,right:12,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,zIndex:25,pointerEvents:"none"}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",pointerEvents:"all",background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:3,boxShadow:`0 4px 12px ${t.shadow}`}}>
            <button onClick={zoomIn} title={tr('graphe.outil.zoomer')} style={tb(t)}>{I.zoomIn}</button><span style={{fontSize:11,color:t.textSecondary,padding:"0 6px",display:"flex",alignItems:"center",fontWeight:600}}>{Math.round(zoom*100)}%</span><button onClick={zoomOut} title={tr('graphe.outil.dezoomer')} style={tb(t)}>{I.zoomOut}</button><div style={{width:1,background:t.border,margin:"4px 1px"}}/><button onClick={fitView} title={tr('graphe.outil.ajuster')} style={tb(t)}>{I.fit}</button><div style={{width:1,background:t.border,margin:"4px 1px"}}/><button onClick={()=>setShowGrid(!showGrid)} style={{...tb(t),color:showGrid?t.accent:t.textMuted}} title={showGrid?"Masquer la grille":"Afficher la grille"}>{I.grid}</button><div style={{width:1,background:t.border,margin:"4px 1px"}}/><button onClick={collab.undo} disabled={!collab.canUndo||isViewer} style={{...tb(t),color:(collab.canUndo&&!isViewer)?t.textSecondary:t.textMuted,opacity:(collab.canUndo&&!isViewer)?1:0.4,cursor:(collab.canUndo&&!isViewer)?"pointer":"default"}} title={tr('graphe.outil.annuler')}>{I.undo}</button><button onClick={collab.redo} disabled={!collab.canRedo||isViewer} style={{...tb(t),color:(collab.canRedo&&!isViewer)?t.textSecondary:t.textMuted,opacity:(collab.canRedo&&!isViewer)?1:0.4,cursor:(collab.canRedo&&!isViewer)?"pointer":"default"}} title={tr('graphe.outil.retablir')}>{I.redo}</button>
          </div>
          <div style={{display:"flex",gap:6,rowGap:6,flexWrap:"wrap",justifyContent:"flex-end",pointerEvents:"all"}}>
            {/* ═══ Personnes ═══ (le menu contient la liste + « Inviter » en pied) */}
            <div style={{position:"relative"}}><button onClick={e=>{e.stopPropagation();setShowCollabDropdown(!showCollabDropdown);}} style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 12px",gap:8,boxShadow:`0 4px 12px ${t.shadow}`,display:"flex",alignItems:"center"}}>{I.users}<span style={{fontSize:12}}>{collabList.length+(screen==="graph"?1:0)}</span>{collab.connected&&<div style={{width:6,height:6,borderRadius:3,background:t.success}}/>}{collabList.length>0&&<div style={{display:"flex",marginLeft:2}}>{collabList.slice(0,5).map(c=><div key={c.id} style={{width:20,height:20,borderRadius:"50%",background:c.color,border:`2px solid ${t.surface}`,marginLeft:-5,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700}}>{c.name?.[0]}</div>)}</div>}</button>
              {showCollabDropdown&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",right:0,marginTop:6,background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:8,boxShadow:`0 8px 24px ${t.shadow}`,width:240,zIndex:20}}>
                <div style={{padding:"6px 10px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,borderBottom:`1px solid ${t.border}`,marginBottom:4}}>Collaborateurs ({collabList.length+1})</div>
                {/* Self */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,background:t.surfaceAlt}}>
                  <div style={{width:28,height:28,borderRadius:14,background:collab.userColor||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{lobbyName?.[0]?.toUpperCase()}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:t.text}}>{lobbyName} <span style={{fontSize:10,color:t.textMuted}}>(vous)</span></div><div style={{fontSize:10,color:t.success,display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:3,background:t.success}}/>{tr('collab.enLigne')}</div></div>
                </div>
                {/* Others */}
                {collabList.map(c=>{/* Le rôle vient du roster ; à défaut, celui porté par le membre. Retomber sur 'viewer' affichait « lecteur » pour un éditeur, et le bouton proposait alors de le « passer en éditeur » - ce qu'il était déjà. */const role=collab.collabRoles?.[c.userId]||c.collabRole||'editor';return<div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,marginTop:2}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{width:28,height:28,borderRadius:14,background:c.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{c.name?.[0]?.toUpperCase()}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:t.text}}>{c.name}</div><div style={{fontSize:10,color:role==='editor'?'#10b981':'#f59e0b',display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:3,background:role==='editor'?'#10b981':'#f59e0b'}}/>{role==='editor'?tr('collab.editeur'):tr('collab.lecteur')}</div></div>
                  {collab.isOwner&&c.userId&&<button onClick={e=>{e.stopPropagation();collab.setUserRole(c.userId,role==='editor'?'viewer':'editor');}} style={{padding:"3px 6px",background:role==='editor'?'#f59e0b20':'#10b98120',border:`1px solid ${role==='editor'?'#f59e0b40':'#10b98140'}`,borderRadius:4,color:role==='editor'?'#f59e0b':'#10b981',cursor:"pointer",fontSize:12}} title={tr(role==='editor'?'collab.titre.passerLecteur':'collab.titre.passerEditeur')}>{tr(role==='editor'?'collab.lecteur':'collab.editeur')}</button>}
                  {collab.isOwner&&c.userId&&<button onClick={e=>{e.stopPropagation();retirerMembre(c.userId,c.name);}} style={{padding:"3px 6px",background:t.danger+"20",border:`1px solid ${t.danger}40`,borderRadius:5,color:t.danger,fontSize:11,cursor:"pointer"}} title={tr('collab.titre.retirer')}>{tr('collab.retirer')}</button>}
                  {collab.isOwner&&c.userId&&<button onClick={e=>{e.stopPropagation();if(confirm(tr('collab.confirm.expulser',{nom:c.name})))collab.kickUser(c.userId);}} style={{padding:"3px 6px",background:t.danger+"20",border:"1px solid #ef444440",borderRadius:4,color:t.danger,cursor:"pointer",fontSize:10}} title={tr('collab.titre.expulser')}>{tr('collab.expulser')}</button>}
                </div>})}
                {collabList.length===0&&lobbyMode==="collab"&&<div style={{padding:"12px 10px",fontSize:11,color:t.textMuted,textAlign:"center"}}>{tr('collab.personneDautre')}<br/><span style={{fontSize:10}}>{tr('graphe.code')}<b>{lobbyRoom}</b></span></div>}
                {lobbyMode==="solo"&&<div style={{padding:"12px 10px",fontSize:11,color:t.textMuted,textAlign:"center"}}>{tr('graphe.modeSolo')}</div>}
                {/* Membres inscrits mais absents. Le panneau ne listait que les
                    connectés : un compte invité puis jamais revenu restait
                    inscrit sans aucun moyen de le retirer depuis l'interface. */}
                {(()=>{const presents=new Set([collab.userId,...collabList.map(c=>c.userId)].filter(Boolean));
                  const absents=membres.filter(m=>!presents.has(m.id)&&m.role!=='OWNER');
                  if(!absents.length)return null;
                  return <>
                    <div style={{padding:"8px 10px 4px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,borderTop:`1px solid ${t.border}`,marginTop:6}}>Membres absents ({absents.length})</div>
                    {absents.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:6,opacity:0.75}}>
                      <div style={{width:24,height:24,borderRadius:12,background:t.surfaceAlt,border:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:t.textMuted,fontWeight:700}}>{(m.displayName||m.username||'?')[0].toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.displayName||m.username}</div>
                        <div style={{fontSize:10,color:m.role==='ANALYST'?'#10b981':'#f59e0b'}}>{m.role==='ANALYST'?'éditeur':'lecteur'} · hors ligne</div>
                      </div>
                      {collab.isOwner&&<button onClick={e=>{e.stopPropagation();retirerMembre(m.id,m.displayName||m.username);}} style={{padding:"3px 6px",background:t.danger+"20",border:`1px solid ${t.danger}40`,borderRadius:5,color:t.danger,fontSize:11,cursor:"pointer"}} title={tr('collab.titre.retirer')}>{tr('collab.retirer')}</button>}
                    </div>)}
                  </>;})()}
                <div style={{borderTop:`1px solid ${t.border}`,marginTop:4,paddingTop:6,display:"flex",flexDirection:"column",gap:6}}>
                  <button onClick={()=>{setShowInviteModal(true);setInviteCopied(false);requestInviteLink();setShowCollabDropdown(false);}} style={{width:"100%",padding:"8px 10px",background:"linear-gradient(135deg,#6366f1,#58a6ff)",border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"inherit"}}>📨 {tr('graphe.inviterQuelquun')}</button>
                  <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setShowCollaborators(!showCollaborators);setShowCollabDropdown(false);}} style={{flex:1,padding:"6px 10px",background:showCollaborators?t.accent+"20":t.surfaceAlt,border:`1px solid ${showCollaborators?t.accent:t.border}`,borderRadius:6,color:t.text,cursor:"pointer",fontSize:11}}>{showCollaborators?"Masquer curseurs":"Afficher curseurs"}</button>
                  </div>
                </div>
              </div>}
            </div>
            {lobbyMode==="collab"&&<button onClick={()=>{setShowChat(!showChat);setTimeout(()=>chatEndRef.current?.scrollIntoView(),50);}} style={{...tb(t),background:showChat?t.accent:t.surface,color:showChat?"#fff":t.text,border:`1px solid ${showChat?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span style={{fontSize:12}}>{tr('collab.chat')}</span>{collab.chatMessages.length>0&&<span style={{fontSize:10,background:t.danger,color:"#fff",borderRadius:8,padding:"0 5px",fontWeight:700}}>{collab.chatMessages.length}</span>}</button>}
            <div style={{width:1,alignSelf:"stretch",background:t.border,margin:"2px 4px",opacity:.7}}/>
            {/* ═══ Timeline ═══ */}
            {/* Retirée en lecture seule, comme les plugins et l'export : un
                lecteur consulte le graphe, il n'a pas à disposer de l'outillage
                d'analyse ni à emporter le dossier. */}
            {!isViewer && <button onClick={()=>setTimelineView(v=>v?null:"full")} title={tr('graphe.outil.chronologie')} style={{...tb(t),background:showTimeline?t.accent:t.surface,color:showTimeline?"#fff":t.text,border:`1px solid ${showTimeline?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}>{I.clock}<span style={{fontSize:12}}>{tr('collab.timeline')}</span></button>}

            {/* ═══ Plugins ═══ */}
            {/* Un item par plugin activé : chacun avait son bouton dans la
                barre, qui débordait dès quatre ou cinq plugins installés. */}
            {!isViewer && <ToolbarMenu
              theme={t} icon="🧩" label="Plugins"
              items={[
                ...pluginEngine.getByHook('toolbar-button').map(pl=>({
                  id: pl.id,
                  icon: pl.hookConfig.icon||pl.manifest.icon,
                  label: libellePlugin(pl, 'toolbar-button'),
                  active: activePlugin===pl.id,
                  onClick: ()=>setActivePlugin(prev=>prev===pl.id?null:pl.id),
                })),
                { id:'store', icon:'⚙️', label:tr('menu.gererPlugins'), separatorBefore:true, onClick:()=>setShowPlugins(true) },
              ]}
            />}

            {/* ═══ Réglages ═══ */}
            {isViewer&&<div style={{background:t.warning+"20",border:"1px solid #f59e0b40",borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12}}>👁️</span><span style={{fontSize:11,fontWeight:700,color:t.warning}}>{tr('graphe.lectureSeule')}</span></div>}
            <ToolbarMenu
              theme={t} icon="⚙️" label="" title={tr('graphe.outil.reglages')}
              items={[
                // Thèmes intégrés, puis ceux des plugins activés. La liste
                // n'est plus une bascule clair/sombre : le plugin « Thèmes »
                // en ajoute autant qu'il en déclare, sans toucher à ce code.
                { id:'th-dark', section:tr('menu.section.theme'), icon:'🌙', label:tr('menu.themeSombre'), active:theme==='dark', onClick:()=>setTheme('dark') },
                { id:'th-light', icon:'☀️', label:tr('menu.themeClair'), active:theme==='light', onClick:()=>setTheme('light') },
                ...Object.entries(themeMeta).map(([id,th])=>({
                  id:`th-${id}`, icon:th.icon||'🎨', label:th.name||th.id,
                  active:theme===id, onClick:()=>setTheme(id),
                })),
                // Le choix de langue vit aussi ici : le graphe est l'écran où
                // l'on passe le plus de temps, et rien n'y permettait d'en
                // changer sans repasser par le tableau de bord.
                ...LANGUES.map(l=>({
                  id:`lang-${l.code}`, section:l.code===LANGUES[0].code?tr('menu.section.langue'):undefined,
                  icon:l.drapeau, label:l.nom, active:langue===l.code, onClick:()=>changerLangue(l.code),
                })),
                { id:'anon', icon:'🔒', label:showLabels?tr('graphe.anonymiser'):tr('graphe.reafficher'), active:!showLabels, onClick:()=>setShowLabels(!showLabels) },
                { id:'replay', section:tr('menu.section.lecture'), icon:'🎬', label:enRejeu?tr('graphe.quitterRejeu'):tr('graphe.rejouer'),
                  hint:tr('menu.hint.rejeu'),
                  active:enRejeu, onClick:()=>setReplayAt(v=>{
                    if(v!==null)return null;
                    const {debut,etapes}=buildReplay(grapheComplet);
                    return etapes.length?debut:0;   // 0 : rejeu impossible, la barre l'explique
                  }) },
                !isViewer && { id:'pdf', section:tr('menu.section.export'), icon:'📄', label:tr('menu.rapportPdf'), onClick:exportPDF },
                !isViewer && { id:'json', icon:'📦', label:tr('menu.donneesJson'), hint:tr('menu.hint.json'), onClick:exportJSON },
                !isViewer && { id:'archive', icon:'🗄️', label:tr('menu.archiveComplete'), hint:tr('menu.hint.archive'), onClick:exportArchive },
                // Action destructrice : dernière catégorie, en rouge - elle
                // voisinait la bascule d'anonymisation dans l'ancienne barre.
                !isViewer && { id:'reset', section:tr('menu.section.danger'), icon:'🗑️', label:tr('menu.toutEffacer'), danger:true,
                  hint:tr('menu.hint.reset'),
                  onClick:()=>{if(confirm(tr('graphe.confirm.toutEffacer'))){
                    collab.batch(()=>{
                      entities.forEach(x=>collab.sendEntityDelete(x.id));
                      links.forEach(x=>collab.sendLinkDelete(x.id));
                      stickers.forEach(x=>collab.sendStickerDelete(x.id));
                      postits.forEach(x=>collab.sendPostitDelete(x.id));
                    });
                    if(isViewerRef.current)return;setEntities([]);setLinks([]);setStickers([]);setPostits([]);logAction("Graphe réinitialisé");}},
                },
              ]}
            />
          </div>
        </div>

        {(holdActive||linkingFrom)&&<div style={{position:"absolute",bottom:100,left:"50%",transform:"translateX(-50%)",background:t.accent,color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,fontWeight:600,boxShadow:`0 4px 16px ${t.accent}60`,zIndex:15,display:"flex",alignItems:"center",gap:8}}>{I.link} {tr('graphe.relachezCible')}<button onClick={()=>{setLinkingFrom(null);setLinkMousePos(null);setHoldActive(false);}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:12}}>{tr('commun.annuler')}</button></div>}

        {/* Join Notifications (for room owner - user auto-joined as viewer) */}
        {/* Refus du serveur sur un changement de rôle : sans cet affichage, le
            bouton 👁️ paraissait simplement cassé. */}
        {collab.roleError&&<div onClick={()=>collab.clearRoleError()} style={{position:"absolute",top:60,left:"50%",transform:"translateX(-50%)",zIndex:60,maxWidth:460,background:t.surface,border:`1px solid ${t.danger}`,borderRadius:10,padding:"10px 14px",fontSize:12,color:t.text,boxShadow:`0 8px 24px ${t.shadow}`,cursor:"pointer"}}>
          <span style={{color:t.danger,fontWeight:700}}>{tr('collab.roleRefuse')}</span>{collab.roleError}
          <span style={{color:t.textMuted,fontSize:10}}> {tr('graphe.fermerCliquer')}</span>
        </div>}
        {collab.joinRequests.length>0&&<div style={{position:"absolute",top:60,right:16,zIndex:20,display:"flex",flexDirection:"column",gap:8}}>
          {collab.joinRequests.map(jr=><div key={jr.user.id} style={{background:t.surface,border:`1px solid ${t.accent}`,borderRadius:12,padding:14,boxShadow:`0 8px 24px ${t.shadow}`,width:300,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:18,background:jr.user.color||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:700}}>{jr.user.name?.[0]?.toUpperCase()}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:t.text}}>{jr.user.name}</div>
              {/* Deux cartes distinctes : une DEMANDE d'entrée, qu'il faut
                  trancher, et une simple notification d'arrivée (admission
                  automatique quand aucun modérateur n'était connecté). */}
              {/* Le rôle vient du serveur (`user:joined:notify`). Il était écrit
                  EN DUR à « lecture seule » : la notification annonçait un
                  lecteur même quand l'arrivant entrait avec les droits
                  d'écriture - d'où l'impression d'une lecture seule qui ne
                  bloquait rien. */}
              <div style={{fontSize:11,color:t.textMuted}}>{jr.autoJoined
                ? (jr.user.collabRole==='viewer'
                    ? <>{tr('collab.aRejointEn')}<span style={{color:'#f59e0b',fontWeight:600}}>{tr('graphe.lectureSeule')}</span></>
                    : <>{tr('collab.aRejointAvec')}<span style={{color:'#10b981',fontWeight:600}}>{tr('collab.droitsEcriture')}</span></>)
                : <>{tr('collab.souhaiteRejoindre')}</>}</div>
            </div>
            {jr.autoJoined ? <>
              <button onClick={e=>{e.stopPropagation();collab.setUserRole(jr.user.id,'editor');collab.dismissJoinNotif(jr.user.id);}} style={{padding:"5px 8px",background:t.success+"20",border:"1px solid #10b98140",borderRadius:6,color:t.success,fontSize:11,fontWeight:600,cursor:"pointer"}} title={role==='editor'?tr('collab.titre.passerLecteur'):tr('collab.titre.passerEditeur')}>{tr('collab.editeur')}</button>
              <button onClick={e=>{e.stopPropagation();collab.dismissJoinNotif(jr.user.id);}} style={{padding:"5px 8px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.textMuted,fontSize:11,cursor:"pointer"}} title={tr('graphe.fermer')}>{tr('graphe.fermer')}</button>
            </> : <>
              {/* Accepter admet en LECTURE SEULE : donner l'écriture reste un
                  second geste, délibéré (bouton ✏️ du panneau Personnes). */}
              <button onClick={e=>{e.stopPropagation();collab.approveJoin(jr.user.id);}} style={{padding:"5px 10px",background:t.success+"20",border:"1px solid #10b98140",borderRadius:6,color:t.success,fontSize:11,fontWeight:700,cursor:"pointer"}} title={tr('collab.titre.accepterLecture')}>{tr('collab.accepter')}</button>
              <button onClick={e=>{e.stopPropagation();collab.denyJoin(jr.user.id);}} style={{padding:"5px 10px",background:t.danger+"20",border:`1px solid ${t.danger}40`,borderRadius:6,color:t.danger,fontSize:11,fontWeight:700,cursor:"pointer"}} title={tr('collab.titre.refuserEntree')}>{tr('collab.refuser')}</button>
            </>}
          </div>)}
        </div>}
        {stampSticker&&<div style={{position:"absolute",top:60,left:"50%",transform:"translateX(-50%)",background:t.accent,color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,fontWeight:600,boxShadow:`0 4px 16px ${t.accent}60`,zIndex:15,display:"flex",alignItems:"center",gap:8}}>🖱️ {tr('graphe.modeTamponPlacer',{emoji:stampSticker.emoji,nom:tr('sticker.'+stampSticker.id)})}<button onClick={()=>setStampSticker(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:12}}>Echap</button></div>}
        {entities.length>0&&<div style={{position:"absolute",bottom:12,right:rightPanelOpen?336:16,fontSize:10,color:t.textMuted,zIndex:5,pointerEvents:"none",textAlign:"right"}}>{tr('graphe.aideCanvas')}</div>}

        <div ref={canvasRef} onMouseDown={handleCanvasDown} onMouseMove={e=>{handlePointerMove(e);broadcastCursor(e);}} onMouseUp={handlePointerUp} onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onContextMenu={e=>{if(e.target===canvasRef.current||e.target.tagName==="svg"||e.target.classList?.contains("canvas-bg")||e.target.tagName==="rect"||e.target.tagName==="line"){e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,canvas:true,canvasPos:screenToCanvas(e.clientX,e.clientY)});}}} style={{width:"100%",height:"100%",background:t.canvasBg,cursor:stampSticker?"copy":isPanning?"grabbing":holdActive?"crosshair":"default"}}>
          <svg ref={svgRef} width="100%" height="100%" style={{position:"absolute",top:0,left:0}}>
            <defs><pattern id="grid" width={20*zoom} height={20*zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x%(20*zoom)},${pan.y%(20*zoom)})`}><circle cx={1} cy={1} r={0.6} fill={t.canvasGrid}/></pattern>{/* Un jeu de marqueurs par couleur de lien : un <marker> n'hérite PAS du
                 stroke du chemin qui le référence, toutes les flèches restaient
                 donc grises quelles que soient la confiance et la sélection. */}
              {ARROW_COLORS.map(([key,color])=>(<Fragment key={key}>
                <marker id={`arrow-${key}`} markerWidth="11" markerHeight="9" refX="9.5" refY="4.5" orient="auto">
                  <path d="M 1.5 1 L 9 4.5 L 1.5 8" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
                {/* MÊME tracé et MÊME refX que ci-dessus : seul orient change.
                    L'ancien marqueur inversait AUSSI le tracé à la main, ce qui
                    annulait la rotation - la flèche de départ pointait le long
                    du trait et s'y confondait au lieu de sortir vers l'entité. */}
                <marker id={`arrowStart-${key}`} markerWidth="11" markerHeight="9" refX="9.5" refY="4.5" orient="auto-start-reverse">
                  <path d="M 1.5 1 L 9 4.5 L 1.5 8" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </Fragment>))}</defs>
            <rect className="canvas-bg" width="100%" height="100%" fill={showGrid?"url(#grid)":t.canvasBg}/>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {vue.links.map(lk=>{const getNode=(id)=>{if(id?.startsWith("postit_")){const p=postits.find(pt=>pt.id===id.slice(7));return p?{x:p.x+p.w/2,y:p.y+p.h/2,hw:p.w/2,hh:p.h/2}:null;}const e=entities.find(en=>en.id===id);return e?{x:e.x+ENT_HW,y:e.y+ENT_HH,hw:ENT_HW,hh:ENT_HH}:null;};const fn=getNode(lk.from),tn=getNode(lk.to);if(!fn||!tn)return null;const p1=getEdge(fn,tn,fn.hw,fn.hh),p2=getEdge(tn,fn,tn.hw,tn.hh);const isSel=lk.id===selectedLinkId;const lt=LINK_TYPES.find(l=>l.id===lk.type)||LINK_TYPES[0];const conf=lk.confidence||0;// Couleur et pointillé viennent de LINK_STRENGTHS, seule source de
                 // vérité - le canvas appliquait ses propres seuils (70/40) alors que
                 // le panneau latéral utilisait ceux des paliers (70/30/1) : à 35 %
                 // le panneau annonçait « probable » en ambre et le graphe traçait en
                 // rouge. La largeur et l'opacité des paliers ne sont volontairement
                 // PAS reprises : un lien peu fiable reste une information de
                 // l'enquête et doit rester lisible, pas devenir un fantôme.
                 const st=getStrengthFromConfidence(conf);const cColor=t[st.tone];const cWidth=2.2;const cDash=st.dash;const bz=linkPath(p1.x,p1.y,p2.x,p2.y);const lColor=isSel?t.accent:cColor;const aKey=isSel?"sel":st.id;return<g key={lk.id}><path d={bz.path} fill="none" stroke="transparent" strokeWidth={14} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelectedLinkId(lk.id);setSelectedId(null);setRightPanelOpen(true);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,linkId:lk.id});}}/><path d={bz.path} fill="none" stroke={lColor} strokeWidth={isSel?2.5:cWidth} strokeDasharray={isSel?"":cDash} strokeLinecap="round" markerEnd={`url(#arrow-${aKey})`} markerStart={lk.bidirectional?`url(#arrowStart-${aKey})`:undefined}/><g style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelectedLinkId(lk.id);setSelectedId(null);setRightPanelOpen(true);}}><rect x={bz.mx-44} y={bz.my-10} width={88} height={20} rx={6} fill={t.surface} fillOpacity={0.95} stroke={isSel?t.accent:t.border} strokeWidth={0.5}/><text x={bz.mx-18} y={bz.my+3.5} textAnchor="middle" fontSize={8.5} fill={isSel?t.accent:t.textSecondary} fontFamily="inherit">{lt.icon||"🔗"} {lk.label||lt.label}</text><rect x={bz.mx+22} y={bz.my-7} width={18} height={14} rx={4} fill={cColor+"20"}/><text x={bz.mx+31} y={bz.my+3} textAnchor="middle" fontSize={7} fill={cColor} fontWeight={700} fontFamily="inherit">{conf}</text></g>{lk.comments?.length>0&&<><circle cx={bz.mx-48} cy={bz.my} r={6} fill={t.accent} opacity={0.8}/><text x={bz.mx-48} y={bz.my+3} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={700} fontFamily="inherit">{lk.comments.length}</text></>}</g>;})}
              {linkingFrom&&linkMousePos&&(()=>{let fc;if(linkingFrom.startsWith("postit_")){const p=postits.find(pt=>pt.id===linkingFrom.slice(7));if(!p)return null;fc={x:p.x+p.w/2,y:p.y+p.h/2};}else{const fe=entities.find(e=>e.id===linkingFrom);if(!fe)return null;fc=getCenter(fe);}return<line x1={fc.x} y1={fc.y} x2={linkMousePos.x} y2={linkMousePos.y} stroke={t.accent} strokeWidth={2} strokeDasharray="6 4" opacity={0.7}/>;})()}
              {selectionBox&&<rect x={Math.min(selectionBox.x1,selectionBox.x2)} y={Math.min(selectionBox.y1,selectionBox.y2)} width={Math.abs(selectionBox.x2-selectionBox.x1)} height={Math.abs(selectionBox.y2-selectionBox.y1)} fill={t.accent+"15"} stroke={t.accent} strokeWidth={1} strokeDasharray="6 3" rx={4}/>}
              {/* Lots des COLLABORATEURS : on voyait leurs entités surlignées
                  une à une, sans percevoir qu'elles formaient un ensemble. */}
              {showCollaborators&&collabList.filter(c=>Array.isArray(c.selection)&&c.selection.length>1).map(c=>{
                const sel=entities.filter(e=>c.selection.includes(e.id));
                if(sel.length<2)return null;
                const M=10;
                const x1=Math.min(...sel.map(e=>e.x))-M, y1=Math.min(...sel.map(e=>e.y))-M;
                const x2=Math.max(...sel.map(e=>e.x+ENT_W))+M, y2=Math.max(...sel.map(e=>e.y+ENT_H))+M;
                return <g key={"lot-"+c.id} style={{pointerEvents:"none"}}>
                  <rect x={x1} y={y1} width={x2-x1} height={y2-y1} rx={12} fill={c.color} fillOpacity={0.05} stroke={c.color} strokeWidth={1.2} strokeDasharray="6 4" opacity={0.5}/>
                  <rect x={x1} y={y2+3} width={Math.max(70,(c.name?.length||4)*6+38)} height={16} rx={4} fill={c.color}/>
                  <text x={x1+6} y={y2+14.5} fontSize={9.5} fontWeight={700} fill="#fff" fontFamily="inherit">{c.name} · {sel.length}</text>
                </g>;
              })}
              {/* Cadre englobant du lot : rien n'indiquait combien d'entités
                  étaient prises, ni jusqu'où s'étendait la sélection. */}
              {multiSelection.length>1&&(()=>{
                const sel=entities.filter(e=>multiSelection.includes(e.id));
                if(sel.length<2)return null;
                const M=14;
                const x1=Math.min(...sel.map(e=>e.x))-M, y1=Math.min(...sel.map(e=>e.y))-M;
                const x2=Math.max(...sel.map(e=>e.x+ENT_W))+M, y2=Math.max(...sel.map(e=>e.y+ENT_H))+M;
                return <g style={{pointerEvents:"none"}}>
                  <rect x={x1} y={y1} width={x2-x1} height={y2-y1} rx={14} fill={t.accent} fillOpacity={0.04} stroke={t.accent} strokeWidth={1.2} strokeDasharray="8 5" opacity={0.55}/>
                  <rect x={x1} y={y1-20} width={Math.max(96,String(sel.length).length*8+86)} height={19} rx={5} fill={t.accent}/>
                  <text x={x1+8} y={y1-6.5} fontSize={10.5} fontWeight={700} fill="#fff" fontFamily="inherit">{sel.length} entités · Échap</text>
                </g>;
              })()}
              {vue.entities.map(ent=>{const info=ALL_ITEMS[ent.subtype]||{label:ent.label,desc:"",color:ent.color};const eColor=ent.color||info.color;const estActive=ent.id===selectedId;const estDansLot=multiSelection.includes(ent.id);const isSel=estActive||estDansLot;const lc=linkCount[ent.id]||0;const remoteUser=collabList.find(c=>Array.isArray(c.selection)?c.selection.includes(ent.id):c.selection===ent.id);const lockInfo=collab.isLockedByOther?.(ent.id);const st=STATUS_DOT[ent.metadata?.status]||STATUS_DOT.unverified;const hasPhoto=ent.metadata?.photo;const catIcon=CATEGORIES.find(c=>c.id===ent.type)?.icon||"";const desc=ent.description||info.desc||"";const timeStr=ent.createdAt?new Date(ent.createdAt).toLocaleTimeString(getLocale(),{hour:"2-digit",minute:"2-digit"}):"";return<g key={ent.id} onMouseDown={e=>handleEntityPointerDown(e,ent.id)} onDoubleClick={e=>{e.stopPropagation();if(isViewer||lockInfo)return;setEditingLabel(ent.id);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,entityId:ent.id});}} style={{cursor:isViewer?"default":lockInfo?"not-allowed":dragging===ent.id?"grabbing":"grab"}}>
                {/* Collab lock overlay */}
                {lockInfo&&<><rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={14} fill="none" stroke={t.danger} strokeWidth={2} strokeDasharray="6 3" opacity={0.7}/><rect x={ent.x+ENT_W-40} y={ent.y-14} width={Math.max(40,(lockInfo.userName?.length||3)*6+20)} height={16} rx={4} fill={t.danger}/><text x={ent.x+ENT_W-35} y={ent.y-2} fontSize={8} fill="#fff" fontWeight={600} fontFamily="inherit">🔒 {lockInfo.userName}</text></>}
                {/* Collab remote selection */}
                {remoteUser&&!lockInfo&&<><rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={14} fill="none" stroke={remoteUser.color} strokeWidth={2} strokeDasharray="4 2" opacity={0.8}/><rect x={ent.x+ENT_W-10} y={ent.y-12} width={Math.max(30,remoteUser.name?.length*6)} height={14} rx={4} fill={remoteUser.color}/><text x={ent.x+ENT_W-7} y={ent.y-2} fontSize={8} fill="#fff" fontWeight={600} fontFamily="inherit">{remoteUser.name}</text></>}
                {/* Selection glow */}
                {/* Halo de sélection : plein pour l'entité ACTIVE (celle du panneau),
                    pointillé pour les autres membres du lot. Les deux étaient
                    identiques - impossible de savoir laquelle pilotait le panneau. */}
                {isSel&&<rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={15} fill="none" stroke={estActive?eColor:t.accent} strokeWidth={estActive?1.5:2} strokeDasharray={estActive?"":"5 3"} opacity={estActive?0.45:0.75}/>}
                {/* Shadow */}
                <rect x={ent.x+2} y={ent.y+3} width={ENT_W} height={ENT_H} rx={12} fill="#000" opacity={0.12}/>
                {/* Card bg */}
                <rect x={ent.x} y={ent.y} width={ENT_W} height={ENT_H} rx={12} fill={t.itemBg} stroke={isSel?eColor:t.itemBorder} strokeWidth={isSel?1.5:1}/>
                {/* Left color band */}
                <clipPath id={`ec-${ent.id}`}><rect x={ent.x} y={ent.y} width={ENT_W} height={ENT_H} rx={12}/></clipPath>
                <rect x={ent.x} y={ent.y} width={5} height={ENT_H} fill={eColor} clipPath={`url(#ec-${ent.id})`}/>
                {/* === LINE 1: Icon/Photo + Label + Status === */}
                {hasPhoto?(<><clipPath id={`ph-${ent.id}`}><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7}/></clipPath><image href={ent.metadata.photo} x={ent.x+14} y={ent.y+10} width={24} height={24} clipPath={`url(#ph-${ent.id})`} preserveAspectRatio="xMidYMid slice"/><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7} fill="none" stroke={eColor+"40"} strokeWidth={1}/></>):(<><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7} fill={eColor+"18"} stroke={eColor+"30"} strokeWidth={0.8}/><text x={ent.x+26} y={ent.y+27} textAnchor="middle" fontSize={13} fontFamily="inherit">{catIcon}</text></>)}
                {editingLabel===ent.id?(<foreignObject x={ent.x+46} y={ent.y+11} width={ENT_W-84} height={22}><input autoFocus defaultValue={ent.label} onBlur={e=>{renameEntity(ent.id,e.target.value);setEditingLabel(null);}} onKeyDown={e=>{if(e.key==="Enter"){renameEntity(ent.id,e.target.value);setEditingLabel(null);}if(e.key==="Escape")setEditingLabel(null);}} style={{width:"100%",background:t.surfaceAlt,border:`1px solid ${t.accent}`,borderRadius:4,color:t.text,fontSize:12,padding:"2px 4px",outline:"none",fontFamily:"inherit",userSelect:"text"}}/></foreignObject>):(<text x={ent.x+46} y={ent.y+26} fontSize={12.5} fontWeight={700} fill={t.text} fontFamily="inherit">{showLabels?(ent.label.length>21?ent.label.slice(0,21)+"…":ent.label):"••••••"}</text>)}
                {/* Status dot */}
                <circle cx={ent.x+ENT_W-16} cy={ent.y+22} r={5} fill={t[st.tone]+"25"} stroke={t[st.tone]+"50"} strokeWidth={0.8}/>
                <text x={ent.x+ENT_W-16} y={ent.y+25} textAnchor="middle" fontSize={7} fill={t[st.tone]} fontWeight={800} fontFamily="inherit">{st.icon}</text>
                {/* === LINE 2: Description === */}
                <text x={ent.x+14} y={ent.y+50} fontSize={10} fill={t.textMuted} fontFamily="inherit">{desc?(desc.length>36?desc.slice(0,36)+"…":desc):<tspan fontStyle="italic" opacity={0.4}>{tr('graphe.aucuneDescription')}</tspan>}</text>
                {/* === LIGNE 3 : pastilles de contenu ===
                    Remplace la date de création et l'auteur, qui occupaient 32 % de
                    la hauteur pour de la métadonnée d'édition - reléguée en infobulle
                    (<title> ci-dessous). Ces pastilles disent ce que la fiche CONTIENT :
                    le nombre de liens était déjà calculé et jamais affiché. */}
                <line x1={ent.x+12} y1={ent.y+60} x2={ent.x+ENT_W-10} y2={ent.y+60} stroke={t.itemBorder} strokeWidth={0.8}/>
                {(()=>{
                  const pastilles=[];
                  if(lc>0) pastilles.push({k:"lien",ic:"🔗",v:lc,c:t.accent});
                  if(ent.metadata?.photo) pastilles.push({k:"photo",ic:"🖼️",v:"",c:t.textSecondary});
                  const nbCom=ent.comments?.length||0;
                  if(nbCom>0) pastilles.push({k:"com",ic:"💬",v:nbCom,c:t.textSecondary});
                  const geo=ent.metadata?.lat!==undefined&&ent.metadata?.lat!==""&&ent.metadata?.lng!==undefined&&ent.metadata?.lng!=="";
                  if(geo) pastilles.push({k:"geo",ic:"📍",v:"",c:"#22c55e"});
                  if(ent.metadata?.date) pastilles.push({k:"date",ic:"📅",v:"",c:t.textSecondary});
                  let cx=ent.x+14;
                  return <>{pastilles.map(b=>{
                    const w=b.v!==""&&b.v!==undefined?26:16;
                    const el=<g key={b.k} transform={`translate(${cx},0)`}>
                      <rect x={0} y={ent.y+66} width={w} height={15} rx={4} fill={b.c+"18"}/>
                      <text x={4} y={ent.y+77} fontSize={8.5} fontFamily="inherit">{b.ic}</text>
                      {b.v!==""&&b.v!==undefined&&<text x={16} y={ent.y+77} fontSize={8.5} fontWeight={700} fill={b.c} fontFamily="inherit">{b.v}</text>}
                    </g>;
                    cx+=w+4;
                    return el;
                  })}</>;
                })()}
                {/* Cotation OTAN (A-F fiabilité de la source, 1-6 crédibilité de
                    l'information) : c'est la classification réellement saisie dans le
                    panneau. Le champ `metadata.classification` n'existe pas. */}
                {(ent.metadata?.reliability||ent.metadata?.credibility)&&(()=>{
                  const code=`${ent.metadata.reliability||"?"}${ent.metadata.credibility||"?"}`;
                  const sur=ent.metadata.reliability&&ent.metadata.reliability<="B"&&ent.metadata.credibility&&ent.metadata.credibility<="2";
                  const col=sur?"#10b981":t.warning;
                  return <g>
                    <rect x={ent.x+ENT_W-42} y={ent.y+66} width={30} height={15} rx={4} fill={col+"20"} stroke={col+"55"} strokeWidth={0.7}/>
                    <text x={ent.x+ENT_W-27} y={ent.y+77} textAnchor="middle" fontSize={9} fontWeight={800} fill={col} fontFamily="inherit" letterSpacing="0.05em">{code}</text>
                  </g>;
                })()}
                {/* Métadonnée d'édition : au survol, plus dans le corps de la carte. */}
                <title>{`${ent.label}${ent.author?` - créée par ${ent.author}`:""}${timeStr?` à ${timeStr}`:""}`}</title>
              </g>;})}
              
              {/* Post-its */}
              {vue.postits.map(p=>{const isSel=p.id===selectedPostitId;return<g key={p.id} onMouseDown={e=>handlePostitDown(e,p.id)} onDoubleClick={e=>{e.stopPropagation();setEditingPostit(p.id);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,postitId:p.id});}} style={{cursor:"grab"}}>
                {isSel&&<rect x={p.x-3} y={p.y-3} width={p.w+6} height={p.h+6} rx={5} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.5}/>}
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={3} fill={p.color} stroke={isSel?t.accent:"rgba(0,0,0,0.1)"} strokeWidth={1}/>
                <rect x={p.x} y={p.y} width={p.w} height={6} rx={3} fill="rgba(0,0,0,0.08)"/>
                {editingPostit===p.id?<foreignObject x={p.x+6} y={p.y+12} width={p.w-12} height={p.h-18}><textarea autoFocus defaultValue={p.text} onBlur={e=>{updatePostit(p.id,{text:e.target.value});setEditingPostit(null);}} onKeyDown={e=>{if(e.key==="Escape")setEditingPostit(null);}} style={{width:"100%",height:"100%",background:"transparent",border:"none",color:"#1a1a1a",fontSize:11,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:"1.3",userSelect:"text"}}/></foreignObject>:<text x={p.x+8} y={p.y+22} fontSize={11} fill="#1a1a1a" fontFamily="inherit">{p.text?p.text.split("\n").slice(0,5).map((line,i)=><tspan key={i} x={p.x+8} dy={i===0?0:14}>{line.slice(0,20)}</tspan>):<tspan fill="#666" fontStyle="italic">{tr('graphe.doubleClic')}</tspan>}</text>}
              </g>;})}
              {/* Stickers */}
              {vue.stickers.map(s=>{const isSel=s.id===selectedStickerId;return<g key={s.id} onMouseDown={e=>handleStickerDown(e,s.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,stickerId:s.id});}} style={{cursor:"grab"}}>
                {isSel&&<circle cx={s.x+20} cy={s.y+20} r={25} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.5}/>}
                <text x={s.x+20} y={s.y+28} fontSize={32} textAnchor="middle" dominantBaseline="middle" style={{filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.3))"}}>{s.emoji}</text>
              </g>;})}

              {showCollaborators&&collabList.filter(c=>c.cursor).map(c=><g key={c.id}><polygon points="0,0 0,18 5,14 10,20 13,18 8,12 14,10" fill={c.color} stroke="#fff" strokeWidth={0.5} transform={`translate(${c.cursor.x},${c.cursor.y})`}/><rect x={c.cursor.x+16} y={c.cursor.y+12} width={Math.max(50,c.name?.length*7||50)} height={16} rx={4} fill={c.color}/><text x={c.cursor.x+22} y={c.cursor.y+23} fontSize={9} fill="#fff" fontWeight={600} fontFamily="inherit">{c.name}</text></g>)}
            </g>
          </svg>
          {entities.length===0&&stickers.length===0&&postits.length===0&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",color:t.textMuted,pointerEvents:"none"}}><div style={{fontSize:48,marginBottom:12,opacity:0.4}}>🔍</div><div style={{fontSize:16,fontWeight:600}}>{tr('graphe.canvasVide')}</div><div style={{fontSize:13,marginTop:4}}>{tr('graphe.canvasVideAide')}</div></div>}
        </div>

        
        {/* BOTTOM TOOLBAR */}
        {!isViewer&&<div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          {toolbarOpen&&<div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:12,boxShadow:`0 8px 32px ${t.shadow}`,width:420,maxWidth:"80vw"}}>
            <div style={{display:"flex",gap:4,marginBottom:10}}>{[{id:"stickers",l:`😀 ${tr('ctx.stickers')}`},{id:"postits",l:`📝 ${tr('ctx.postit')}`}].map(tab=><button key={tab.id} onClick={()=>setToolbarTab(tab.id)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:toolbarTab===tab.id?t.accent+"20":"none",color:toolbarTab===tab.id?t.accent:t.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>{tab.l}</button>)}</div>
            {toolbarTab==="stickers"&&<div><div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>{stampSticker?<span>🔵 {tr('graphe.modeTampon')} <b>{stampSticker.emoji} {tr("sticker."+stampSticker.id)}</b> {tr('graphe.cliquezCanvas')} <button onClick={()=>setStampSticker(null)} style={{background:"none",border:"none",color:t.accent,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>{tr('commun.annuler')}</button></span>:tr('graphe.cliquezSticker')}</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{STICKERS.map(s=><div key={s.id} draggable onDragStart={e=>{e.dataTransfer.setData("stickerEmoji",s.emoji);e.dataTransfer.setData("stickerLabel",tr("sticker."+s.id));}} onClick={()=>setStampSticker(stampSticker?.id===s.id?null:s)} title={tr("sticker."+s.id)} style={{width:40,height:40,borderRadius:8,background:stampSticker?.id===s.id?t.accent+"30":t.surfaceAlt,border:`1px solid ${stampSticker?.id===s.id?t.accent:t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",transition:"all 0.15s",boxShadow:stampSticker?.id===s.id?`0 0 0 2px ${t.accent}`:""}} onMouseEnter={e=>{if(stampSticker?.id!==s.id){e.currentTarget.style.background=t.itemHover||t.surfaceAlt;e.currentTarget.style.transform="scale(1.15)";}}} onMouseLeave={e=>{if(stampSticker?.id!==s.id){e.currentTarget.style.background=t.surfaceAlt;e.currentTarget.style.transform="scale(1)";}}}>{s.emoji}</div>)}</div></div>}
            {toolbarTab==="postits"&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{POSTIT_COLORS.map(c=><div key={c} draggable onDragStart={e=>e.dataTransfer.setData("postitColor",c)} onClick={()=>addPostit(c)} style={{width:48,height:48,borderRadius:6,background:c,cursor:"grab",border:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#00000030";e.currentTarget.style.transform="scale(1.1)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="transparent";e.currentTarget.style.transform="scale(1)";}}>📝</div>)}</div>}
          </div>}
          <button onClick={()=>setToolbarOpen(!toolbarOpen)} style={{background:toolbarOpen?"#58a6ff":t.surface,border:`1px solid ${toolbarOpen?t.accent:t.border}`,borderRadius:12,padding:"10px 24px",color:toolbarOpen?"#fff":t.text,fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:`0 4px 16px ${t.shadow}`,display:"flex",alignItems:"center",gap:8,transition:"all 0.2s"}}>{toolbarOpen?"✕ {tr('graphe.fermer')}":"🧰 Outils - Stickers & Notes"}</button>
        </div>}

        {/* Minimap */}
        <div style={{position:"absolute",bottom:30,left:16,width:180,height:110,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,overflow:"hidden",boxShadow:`0 4px 12px ${t.shadow}`,zIndex:5}}><svg width="180" height="110">{entities.map(e=>{const info=ALL_ITEMS[e.subtype];return<rect key={e.id} x={90+e.x*0.06} y={55+e.y*0.06} width={13} height={5} rx={2} fill={info?.color||e.color} opacity={0.8}/>;})}{links.map(l=>{const f=entities.find(e=>e.id===l.from),to2=entities.find(e=>e.id===l.to);if(!f||!to2)return null;return<line key={l.id} x1={90+(f.x+ENT_HW)*0.06} y1={55+(f.y+ENT_HH)*0.06} x2={90+(to2.x+ENT_HW)*0.06} y2={55+(to2.y+ENT_HH)*0.06} stroke={t.textMuted} strokeWidth={0.5} opacity={0.4}/>;})}</svg></div>

        {/* Timeline */}
        {/* CHAT PANEL */}
        {showChat&&lobbyMode==="collab"&&<div style={{position:"absolute",bottom:30,right:rightPanelOpen?336:16,width:320,maxHeight:420,background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,boxShadow:`0 8px 24px ${t.shadow}`,zIndex:6,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>💬 Chat ({collabList.length+1})</span>
            <button onClick={()=>setShowChat(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer"}}>{I.x}</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 12px",maxHeight:300,display:"flex",flexDirection:"column",gap:6}}>
            {collab.chatMessages.length===0&&<div style={{color:t.textMuted,fontSize:12,padding:16,textAlign:"center"}}>{tr('collab.aucunMessage')}</div>}
            {collab.chatMessages.map(m=><div key={m.id} style={{display:"flex",gap:8,alignItems:m.userId===collab.userId?"flex-end":"flex-start",flexDirection:m.userId===collab.userId?"row-reverse":"row"}}>
              <div style={{width:24,height:24,borderRadius:12,background:m.userColor||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,flexShrink:0}}>{m.userName?.[0]?.toUpperCase()}</div>
              <div style={{maxWidth:"80%"}}>
                <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>{m.userId===collab.userId?tr('commun.vous'):m.userName} · {m.ts?new Date(m.ts).toLocaleTimeString(getLocale(),{hour:"2-digit",minute:"2-digit"}):""}</div>
                <div style={{padding:"8px 12px",borderRadius:12,background:m.userId===collab.userId?t.accent+"20":t.surfaceAlt,fontSize:12,color:t.text,wordBreak:"break-word"}}>{m.text}</div>
              </div>
            </div>)}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:"8px 12px",borderTop:`1px solid ${t.border}`,display:"flex",gap:8}}>
            <input ref={chatInputRef} placeholder={tr('collab.message')} style={{flex:1,padding:"8px 12px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:12,outline:"none",fontFamily:"inherit"}} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){collab.sendChat(e.target.value);e.target.value="";setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);}}}/>
            <button onClick={()=>{const inp=chatInputRef.current;if(inp?.value.trim()){collab.sendChat(inp.value);inp.value="";setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);}}} style={{padding:"8px 14px",background:t.accent,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>→</button>
          </div>
        </div>}

        {/* Rejeu chronologique */}
        {enRejeu&&(
          <ReplayBar
            graphe={grapheComplet}
            instant={replayAt}
            setInstant={setReplayAt}
            theme={t}
            onClose={()=>setReplayAt(null)}
          />
        )}

        {/* Chronologie - vue réduite : le panneau compact historique */}
        {timelineView==="mini"&&(
          <div style={{position:"absolute",bottom:30,right:rightPanelOpen?336:16,width:300,maxHeight:360,background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,boxShadow:`0 8px 24px ${t.shadow}`,zIndex:5,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{I.clock} Timeline ({timelineEvents.length})</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setTimelineView("full")} title={tr('graphe.outil.frise')} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>⤢</button>
                <button onClick={()=>setTimelineView(null)} title={tr('graphe.fermer')} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer"}}>{I.x}</button>
              </div>
            </div>
            <div style={{maxHeight:300,overflowY:"auto",padding:"8px 16px"}}>
              {timelineEvents.length===0
                ?<div style={{color:t.textMuted,fontSize:12,padding:"16px 0",textAlign:"center"}}>{tr('collab.aucunEvenement')}</div>
                :timelineEvents.map(it=>(
                  <div key={it.id} style={{padding:"8px 0",borderBottom:`1px solid ${t.border}`,display:"flex",gap:10}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:it.color||t.accent,marginTop:5,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.action}</div>
                      <div style={{fontSize:10,color:t.textMuted}}>{it.user} · {it.timestamp?fmtDate(it.timestamp):""}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Chronologie - frise horizontale plein écran */}
        {timelineView==="full"&&(
          <TimelineOverlay
            events={timelineEvents}
            theme={t}
            entities={entities}
            onMinimize={()=>setTimelineView("mini")}
            onClose={()=>setTimelineView(null)}
            onSelectEntity={id=>{setSelectedId(id);setSelectedLinkId(null);setRightPanelOpen(true);}}
          />
        )}

        {/* Context menu */}
        {ctxMenu&&(()=>{
          // Un clic droit dans le bas de l'écran poussait les dernières entrées
          // hors de la fenêtre : seule l'horizontale était bornée. Sous la
          // moitié basse, le menu s'ancre par le BAS sur le point cliqué -
  // comportement usuel, et sans avoir à mesurer sa hauteur.
          const versLeHaut = ctxMenu.y > window.innerHeight/2;
          const pos = versLeHaut
            ? { bottom: Math.max(8, window.innerHeight-ctxMenu.y), maxHeight: ctxMenu.y-16 }
            : { top: ctxMenu.y, maxHeight: window.innerHeight-ctxMenu.y-16 };
          return <div onClick={e=>{e.stopPropagation();setCtxMenu(null);}} style={{position:"fixed",...pos,left:Math.min(ctxMenu.x,window.innerWidth-220),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,boxShadow:`0 8px 24px ${t.shadow}`,zIndex:50,minWidth:200,overflowY:"auto"}}>
          {/* Canvas right-click */}
          {ctxMenu.canvas&&<>
            {!isViewer&&<>{[
            {l:`👤 ${tr('ctx.ajouterPersonne')}`,fn:()=>addEntity("person_male",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`🏢 ${tr('ctx.ajouterOrganisation')}`,fn:()=>addEntity("org_company",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`📧 ${tr('ctx.ajouterEmail')}`,fn:()=>addEntity("email_gmail",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`📱 ${tr('ctx.ajouterTelephone')}`,fn:()=>addEntity("phone_mobile",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`🔗 ${tr('ctx.ajouterDomaine')}`,fn:()=>addEntity("domain_site",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`💬 ${tr('ctx.ajouterReseau')}`,fn:()=>addEntity("other_social",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:`📍 ${tr('ctx.ajouterLieu')}`,fn:()=>addEntity("loc_address",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
          ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            {[
              {l:`📝 ${tr('ctx.ajouterPostit')}`,fn:()=>addPostit("#fef08a",ctxMenu.canvasPos.x-70,ctxMenu.canvasPos.y-50)},
              ...(copiedEntity?[{l:`📋 ${tr('ctx.coller',{label:copiedEntity.label})}`,fn:()=>pasteEntity(ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)}]:[]),
            ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            </>}
            {/* Zoom et cadrage : purement consultatifs, donc ouverts aux lecteurs.
                Tout le menu leur était fermé, y compris ces deux entrées. */}
            {[
              {l:`🔍 ${tr('ctx.zoom100')}`,fn:()=>{setZoom(1);setPan({x:0,y:0});}},
              {l:`⊞ ${tr('ctx.ajusterVue')}`,fn:fitView},
            ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
          </>}
          {/* Entity right-click */}
          {/* Sélection multiple : le clic droit ne proposait que les actions de
              l'entité SOUS le curseur, alors que c'est précisément le moment où
              l'on veut agir sur le lot. */}
          {ctxMenu.entityId&&!isViewer&&multiSelection.length>1&&multiSelection.includes(ctxMenu.entityId)&&<>
            <div style={{padding:"6px 12px",fontSize:10,color:t.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>{multiSelection.length} entités sélectionnées</div>
            {STATUS_ORDER.map(id=>{const lab=tr('statut.'+id);const d=STATUS_DOT[id];const dc=t[d.tone];return(
              <CtxBtn key={"grp-"+id} t={t} l={`${d.icon} Marquer « ${lab} »`} fn={()=>{
                collab.batch(()=>multiSelection.forEach(eid=>{
                  const e=entities.find(x=>x.id===eid); if(!e) return;
                  updateEntity(eid,{metadata:{...(e.metadata||{}),status:id}});
                }));
                logAction(`${multiSelection.length} entités → ${lab}`);
              }}/>);})}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <CtxBtn t={t} l={`↔️ ${tr('ctx.alignerH')}`} fn={()=>{
              const sel=entities.filter(e=>multiSelection.includes(e.id)); if(sel.length<2)return;
              const y=Math.round(sel.reduce((a,e)=>a+e.y,0)/sel.length);
              collab.batch(()=>sel.forEach(e=>updateEntity(e.id,{y})));
              logAction("Alignement horizontal");
            }}/>
            <CtxBtn t={t} l={`↕️ ${tr('ctx.alignerV')}`} fn={()=>{
              const sel=entities.filter(e=>multiSelection.includes(e.id)); if(sel.length<2)return;
              const x=Math.round(sel.reduce((a,e)=>a+e.x,0)/sel.length);
              collab.batch(()=>sel.forEach(e=>updateEntity(e.id,{x})));
              logAction("Alignement vertical");
            }}/>
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <CtxBtn t={t} l={`🗑️ Supprimer les ${multiSelection.length} entités`} d fn={()=>{
              if(!confirm(tr('graphe.confirm.supprimerLot',{n:multiSelection.length})))return;
              // Une seule transaction : un Ctrl+Z remet tout le lot.
              collab.batch(()=>multiSelection.forEach(eid=>deleteEntity(eid)));
              setMultiSelection([]);
            }}/>
          </>}

          {ctxMenu.entityId&&(multiSelection.length<=1||!multiSelection.includes(ctxMenu.entityId))&&<>
            {!isViewer&&<>{[
            {l:`✏️ ${tr('ctx.renommer')}`,fn:()=>setEditingLabel(ctxMenu.entityId)},
            {l:`🔗 ${tr('ctx.creerLien')}`,fn:()=>{setLinkingFrom(ctxMenu.entityId);setHoldActive(true);}},
            {l:`📄 ${tr('ctx.dupliquer')}`,fn:()=>duplicateEntity(ctxMenu.entityId)},
          ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            {/* Statut : l'action la plus fréquente d'une enquête, qui exigeait
                d'ouvrir le panneau et de dérouler jusqu'à Classification. */}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <div style={{padding:"4px 12px",fontSize:10,color:t.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>{tr('graphe.statut')}</div>
            {(()=>{const e=entities.find(x=>x.id===ctxMenu.entityId);const cur=e?.metadata?.status||"unverified";
              return STATUS_ORDER.map(id=>{const lab=tr('statut.'+id);const d=STATUS_DOT[id];const dc=t[d.tone];const actif=cur===id;return(
                <button key={"st-"+id} onClick={()=>{updateEntity(ctxMenu.entityId,{metadata:{...(e?.metadata||{}),status:id}});setCtxMenu(null);}}
                  style={{width:"100%",padding:"6px 12px",background:actif?dc+"18":"none",border:"none",color:actif?dc:t.text,fontSize:12,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit",fontWeight:actif?700:400}}>
                  <span style={{color:dc,fontWeight:800}}>{d.icon}</span><span style={{flex:1}}>{lab}</span>{actif&&<span style={{fontSize:10}}>●</span>}
                </button>);});})()}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            </>}
            {/* Copier reste accessible en lecture seule : rien n'est écrit. */}
            <CtxBtn t={t} l={`📋 ${tr('ctx.copier')}`} fn={()=>copyEntity(ctxMenu.entityId)}/>
            <CtxBtn t={t} l={`✏️ ${tr('ctx.proprietes')}`} fn={()=>{setSelectedId(ctxMenu.entityId);setSelectedLinkId(null);setRightPanelOpen(true);}}/>
            {!isViewer&&<>
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <CtxBtn t={t} l={`🗑️ ${tr('ctx.supprimer')}`} fn={()=>deleteEntity(ctxMenu.entityId)} d/>
            </>}
          </>}
          {/* Link right-click */}
          {ctxMenu.linkId&&(()=>{const lk=links.find(l=>l.id===ctxMenu.linkId);if(!lk)return null;return<>
            {!isViewer&&<>
            <div style={{padding:"6px 12px",fontSize:10,color:t.textMuted,fontWeight:600}}>{tr('graphe.typeRelation')}</div>
            {LINK_TYPES.map(lt=><button key={lt.id} onClick={()=>{updateLink(ctxMenu.linkId,{type:lt.id,color:lt.color});setCtxMenu(null);}} style={{width:"100%",padding:"6px 12px",background:lk.type===lt.id?t.accent+"15":"none",border:"none",color:lk.type===lt.id?t.accent:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background=lk.type===lt.id?t.accent+"15":"none"}><div style={{width:8,height:8,borderRadius:4,background:lt.color}}/>{lt.label}</button>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <div style={{padding:"6px 12px",fontSize:10,color:t.textMuted,fontWeight:600}}>{tr('graphe.fiabilite')}</div>
            {LINK_STRENGTHS.map(s=>{const sc=t[s.tone];return <button key={s.id} onClick={()=>{updateLink(ctxMenu.linkId,{strength:s.id});setCtxMenu(null);}} style={{width:"100%",padding:"6px 12px",background:lk.strength===s.id?sc+"15":"none",border:"none",color:lk.strength===s.id?sc:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background=lk.strength===s.id?sc+"15":"none"}><div style={{width:14,height:14,borderRadius:7,background:sc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{s.badge}</div>{tr('confiance.'+s.id)}</button>;})}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            </>}
            <CtxBtn t={t} l={`✏️ ${tr('ctx.proprietes')}`} fn={()=>{setSelectedLinkId(ctxMenu.linkId);setSelectedId(null);setRightPanelOpen(true);}}/>
            {!isViewer&&<>
            <CtxBtn t={t} l={lk.bidirectional?"↔️ Rendre unidirectionnel":"↔️ Rendre bidirectionnel"} fn={()=>updateLink(ctxMenu.linkId,{bidirectional:!lk.bidirectional})}/>
            <CtxBtn t={t} l={`🗑️ ${tr('ctx.supprimer')}`} fn={()=>deleteLink(ctxMenu.linkId)} d/>
            </>}
          </>;})()}
          {/* Sticker right-click */}
          {ctxMenu.stickerId&&!isViewer&&<CtxBtn t={t} l={`🗑️ ${tr('ctx.supprimerSticker')}`} fn={()=>deleteSticker(ctxMenu.stickerId)} d/>}
          {/* Post-it right-click */}
          {ctxMenu.postitId&&!isViewer&&[{l:`✏️ ${tr('ctx.editer')}`,fn:()=>setEditingPostit(ctxMenu.postitId)},{l:`🔗 ${tr('ctx.creerLien')}`,fn:()=>{setLinkingFrom("postit_"+ctxMenu.postitId);setHoldActive(true);}},{l:`🗑️ ${tr('ctx.supprimer')}`,fn:()=>deletePostit(ctxMenu.postitId),d:true}].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
        </div>;})()}



        {/* PLUGIN STORE - FULLSCREEN */}
        {showPlugins&&<PluginStore engine={pluginEngine} theme={t} userRole={propUserRole} onClose={()=>setShowPlugins(false)} onPluginToggle={()=>setPluginTick(k=>k+1)}/>}

        {/* Active plugin fullscreen panel */}
        {activePlugin&&(()=>{
          const pl = pluginEngine.get(activePlugin);
          if(!pl||!pl.Panel) return null;
          const PanelComp = pl.Panel;
          return <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",background:t.bg}}>
            <div style={{padding:"10px 20px",borderBottom:`1px solid ${t.border}`,background:t.surface,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <span style={{fontSize:18}}>{pl.icon}</span>
              <span style={{fontSize:14,fontWeight:700,flex:1}}>{nomPlugin(pl)}</span>
              <button onClick={()=>setActivePlugin(null)} style={{padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:8,border:`1px solid ${t.border}`,background:t.surfaceAlt,color:t.text,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✕ {tr('graphe.fermer')}</button>
            </div>
            <div style={{flex:1,overflow:"hidden"}}>
              <PluginErrorBoundary pluginId={activePlugin} pluginName={nomPlugin(pl)} theme={t}>
              <PanelComp {...buildPluginContext({
                mode: 'fullscreen', pluginId: activePlugin,
                entities, links, stickers, postits,
                addEntity, updateEntity, deleteEntity,
                addLink, updateLink, deleteLink, bulkAdd,
                selectedId, setSelectedId,
                theme: t, onClose: ()=>setActivePlugin(null),
                settings: pl.settings, updateSettings: (k,v)=>pluginEngine.updateSetting(activePlugin,k,v),
                // activeRoom d'abord : en entrant par le lobby, propCaseId est
                // nul alors que l'enquête est bien ouverte - un plugin qui
                // appelle l'API n'aurait eu aucun identifiant à lui donner.
                caseId: activeRoom || propCaseId, userName: propUserName, collab,
                isViewer,
              })} />
              </PluginErrorBoundary>
            </div>
          </div>;
        })()}




        {/* Map Modal */}
        {/* Map now rendered by plugin engine (see plugins/map/Panel.jsx) */}

        {/* Duplicate Alert Modal */}
      </div>

      {/* RIGHT PANEL */}
      <EntityPanel
        caseId={activeRoom}
        userName={propUserName}
        collab={collab}
        stickers={stickers}
        postits={postits}
        setSelectedId={setSelectedId}
        open={rightPanelOpen}
        entity={selectedEntity}
        link={selectedLink}
        t={t}
        selectedId={selectedId}
        selectedLinkId={selectedLinkId}
        onClose={() => { setRightPanelOpen(false); setSelectedId(null); }}
        onCloseLink={() => { setRightPanelOpen(false); setSelectedLinkId(null); }}
        updateEntity={updateEntity}
        deleteEntity={deleteEntity}
        duplicateEntity={duplicateEntity}
        updateLink={updateLink}
        deleteLink={deleteLink}
        links={links}
        entities={entities}
        linkCount={linkCount}
        setLinkingFrom={setLinkingFrom}
        setHoldActive={setHoldActive}
        logAction={logAction}
        genId={genId}
        addEntity={addEntity}
        addLink={addLink}
        CATEGORIES={CATEGORIES}
        ALL_ITEMS={ALL_ITEMS}
        LINK_TYPES={LINK_TYPES}
        Icons={I}
        isViewer={isViewer}
        normalizeAddress={normalizeAddress}
        getStrengthFromConfidence={getStrengthFromConfidence}
        pluginEngine={pluginEngine}
      />

      {/* ═══ INVITE MODAL ═══ */}
      {showInviteModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowInviteModal(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,padding:32,width:440,maxWidth:"90vw",boxShadow:`0 24px 64px ${t.shadow}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <h3 style={{fontSize:18,fontWeight:700,margin:0}}>📨 {tr('graphe.inviterCollaborateurs')}</h3>
            <button onClick={()=>setShowInviteModal(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,display:"block",marginBottom:6}}>{tr('collab.lienCollaboration')}</label>
            <div style={{display:"flex",gap:8}}>
              <input readOnly value={inviteError?"":(inviteLink||tr('graphe.genererLien'))} style={{flex:1,padding:"10px 14px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:inviteLink?t.text:t.textMuted,fontSize:13,outline:"none",fontFamily:"monospace",textOverflow:"ellipsis"}} onClick={e=>e.target.select()} />
              <button disabled={!inviteLink} onClick={()=>{navigator.clipboard.writeText(inviteLink);setInviteCopied(true);setTimeout(()=>setInviteCopied(false),2000);}} style={{padding:"10px 16px",background:inviteCopied?"#10b981":inviteLink?t.accent:t.border,border:"none",borderRadius:8,color:"#fff",cursor:inviteLink?"pointer":"not-allowed",fontSize:12,fontWeight:600,whiteSpace:"nowrap",transition:"background 0.2s"}}>{inviteCopied?"✓ Copié":"Copier"}</button>
            </div>
            {inviteError&&<div style={{marginTop:8,fontSize:11,color:t.danger}}>⚠ {inviteError}</div>}
          </div>
          <div style={{background:t.surfaceAlt,borderRadius:10,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.text,marginBottom:8}}>{tr('collab.invite.commentCaMarche')}</div>
            <div style={{fontSize:11,color:t.textSecondary,lineHeight:1.6}}>
              1. {tr('collab.invite.etape1')}<br/>
              2. {tr('collab.invite.etape2')}<br/>
              3. {tr('collab.invite.etape3')}<br/>
              4. {tr('collab.invite.etape4')}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:`${t.accent}10`,border:`1px solid ${t.accent}25`,borderRadius:8}}>
            <div style={{fontSize:16}}>💡</div>
            <div style={{fontSize:11,color:t.accent}}>{tr('collab.invite.roleAide')} <b>{tr('collab.analyste')}</b>{tr('graphe.invitation7j')} <b>{tr('graphe.septJours')}</b> {tr('graphe.nePartagezPas')}</div>
          </div>
          {collabList.length>0&&<div style={{marginTop:16,borderTop:`1px solid ${t.border}`,paddingTop:12}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textMuted,marginBottom:8}}>{tr('collab.connectes',{n:collabList.length+1})}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <div style={{padding:"4px 10px",background:t.accent+"15",border:`1px solid ${t.accent}30`,borderRadius:6,fontSize:11,color:t.accent,fontWeight:600}}>{lobbyName} {tr('collab.vous')}</div>
              {collabList.map(c=><div key={c.id} style={{padding:"4px 10px",background:c.color+"15",border:`1px solid ${c.color}30`,borderRadius:6,fontSize:11,color:c.color,fontWeight:600}}>{c.name}</div>)}
            </div>
          </div>}
        </div>
      </div>}

    </div>
  );
}

function CtxBtn({t,l,fn,d,onClose}){return<button onClick={()=>{fn();if(onClose)onClose();}} style={{width:"100%",padding:"7px 12px",background:"none",border:"none",color:d?t.danger:t.text,fontSize:12,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>;}

/**
 * `lectureSeule` grise l'élément et coupe le glisser-déposer.
 *
 * Sans cela, un lecteur voyait une palette pleinement active dont chaque clic
 * ne faisait rien - la garde s'appliquait bien, mais en silence. Un refus muet
 * se lit comme une panne.
 */
function SidebarItem({item,t,fav,onAdd,onToggleFav,onDragStart,lectureSeule}){return(
  <div draggable={!lectureSeule} onDragStart={lectureSeule?undefined:onDragStart} title={lectureSeule?traduire('graphe.lectureSeuleGlisser'):item.desc||item.label} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,opacity:lectureSeule?0.45:1,cursor:lectureSeule?"not-allowed":"grab",border:`1px solid ${t.itemBorder}`,background:t.itemBg,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=t.itemHover;e.currentTarget.style.borderColor=item.color+"50";}} onMouseLeave={e=>{e.currentTarget.style.background=t.itemBg;e.currentTarget.style.borderColor=t.itemBorder;}} onClick={onAdd}>
    <div style={{width:28,height:28,borderRadius:14,background:item.color+"20",border:`2px solid ${item.color}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:8,height:8,borderRadius:4,background:item.color}}/></div>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:t.text}}>{item.label}</div>{item.desc&&<div style={{fontSize:10,color:t.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.desc}</div>}</div>
    <button onClick={e=>{e.stopPropagation();onToggleFav();}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:fav?"#f59e0b":t.textMuted,opacity:fav?1:0.4,transition:"all 0.15s",padding:"2px"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity=fav?"1":"0.4"}>{fav?"★":"☆"}</button>
  </div>
);}

function Fl({label,t,children}){return<div><label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,display:"block",marginBottom:5}}>{label}</label>{children}</div>;}
const inp=(t)=>({width:"100%",padding:"10px 14px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.text,fontSize:14,outline:"none",boxSizing:"border-box"});
const tb=(t)=>({background:"none",border:"none",color:t.text,cursor:"pointer",padding:"6px 8px",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"});
const sBtn=(t)=>({background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.textSecondary,cursor:"pointer",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0});
