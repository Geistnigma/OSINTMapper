import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useCollaboration } from "./useCollaboration.js";
import Whiteboard from "./Whiteboard.jsx";
import { getTransformsForEntity } from "./transforms.js";
import { parseOSINTExport, generateEntities as genOSINTEntities } from "./osintImport.js";
import { initPluginEngine } from "../plugins/registry.js";
import PluginStore from "../plugins/core/PluginStore.jsx";
import EntityPanel from "../components/EntityPanel.jsx";
import { PluginErrorBoundary } from "../plugins/core/ErrorBoundary.jsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// Initialize plugin engine once (singleton)
const pluginEngine = initPluginEngine();

// ============================================================================
import { CATEGORIES, ALL_ITEMS } from "../lib/constants.jsx";

const LINK_TYPES = [
  { id: "related", label: "est lié à", color: "#94a3b8", dash: "", icon: "🔗" },
  { id: "owns", label: "propriétaire de", color: "#6366f1", dash: "", icon: "🔑" },
  { id: "located", label: "localisé à", color: "#10b981", dash: "", icon: "📍" },
  { id: "uses", label: "utilise", color: "#3b82f6", dash: "", icon: "⚡" },
  { id: "knows", label: "connaît", color: "#f59e0b", dash: "", icon: "🤝" },
  { id: "member", label: "membre de", color: "#ef4444", dash: "", icon: "👥" },
  { id: "alias", label: "alias de", color: "#8b5cf6", dash: "6 3", icon: "🎭" },
  { id: "contacted", label: "a contacté", color: "#ec4899", dash: "", icon: "📞" },
  { id: "suspected", label: "suspecté de", color: "#f97316", dash: "4 4", icon: "⚠️" },
  { id: "custom", label: "personnalisé", color: "#94a3b8", dash: "", icon: "🔗" },
];

// Entity card dimensions
const ENT_W = 220, ENT_H = 88, ENT_HW = 110, ENT_HH = 44;

// Bezier curve for links
const bezierLink = (x1, y1, x2, y2) => {
  const dx=x2-x1, dy=y2-y1, d=Math.sqrt(dx*dx+dy*dy);
  if(d===0)return{path:`M ${x1} ${y1} L ${x2} ${y2}`,mx:x1,my:y1};
  const c=Math.min(d*0.18,40), mx=(x1+x2)/2, my=(y1+y2)/2;
  const nx=-dy/d, ny=dx/d, cx2=mx+nx*c, cy2=my+ny*c;
  return{path:`M ${x1} ${y1} Q ${cx2} ${cy2} ${x2} ${y2}`,mx:(x1+2*cx2+x2)/4,my:(y1+2*cy2+y2)/4};
};

const STATUS_DOT = {
  confirmed: { icon: "✓", color: "#10b981" },
  unverified: { icon: "?", color: "#f59e0b" },
  denied: { icon: "✕", color: "#ef4444" },
  archived: { icon: "◼", color: "#64748b" },
};

// PHONE PREFIX → FLAG
const PHONE_FLAGS={"+33":"🇫🇷","+1":"🇺🇸","+44":"🇬🇧","+49":"🇩🇪","+34":"🇪🇸","+39":"🇮🇹","+32":"🇧🇪","+41":"🇨🇭","+31":"🇳🇱","+351":"🇵🇹","+7":"🇷🇺","+86":"🇨🇳","+81":"🇯🇵","+82":"🇰🇷","+91":"🇮🇳","+55":"🇧🇷","+52":"🇲🇽","+61":"🇦🇺","+971":"🇦🇪","+966":"🇸🇦","+90":"🇹🇷","+48":"🇵🇱","+46":"🇸🇪","+47":"🇳🇴","+45":"🇩🇰","+358":"🇫🇮","+30":"🇬🇷","+420":"🇨🇿","+36":"🇭🇺","+40":"🇷🇴","+380":"🇺🇦","+212":"🇲🇦","+213":"🇩🇿","+216":"🇹🇳","+20":"🇪🇬","+27":"🇿🇦","+234":"🇳🇬","+254":"🇰🇪","+62":"🇮🇩","+66":"🇹🇭","+84":"🇻🇳","+63":"🇵🇭","+65":"🇸🇬","+60":"🇲🇾","+852":"🇭🇰","+886":"🇹🇼","+972":"🇮🇱","+98":"🇮🇷","+92":"🇵🇰","+880":"🇧🇩","+94":"🇱🇰","+353":"🇮🇪","+352":"🇱🇺","+377":"🇲🇨","+376":"🇦🇩"};
function getPhoneFlag(label){if(!label)return null;const m=label.match(/^\+\d+/);if(!m)return null;const num=m[0];const sorted=Object.keys(PHONE_FLAGS).sort((a,b)=>b.length-a.length);for(const prefix of sorted){if(num.startsWith(prefix))return PHONE_FLAGS[prefix];}return null;}

// ADDRESS NORMALIZATION (FR abbreviations)
const ADDR_ABBR={"imp.":"impasse","imp ":"impasse ","bd ":"boulevard ","bd.":"boulevard","bld ":"boulevard ","bld.":"boulevard","av.":"avenue","av ":"avenue ","pl.":"place","pl ":"place ","rte ":"route ","rte.":"route","chem.":"chemin","chem ":"chemin ","all.":"allée","all ":"allée ","sq.":"square","sq ":"square ","fg.":"faubourg","fg ":"faubourg ","pass.":"passage","pass ":"passage ","res.":"résidence","res ":"résidence ","lot.":"lotissement","lot ":"lotissement ","zac ":"zone d'aménagement ","zi ":"zone industrielle ","crs ":"cours ","crs.":"cours","quai ":"quai ","r.":"rue","r ":"rue "};
function normalizeAddress(addr){let s=addr;for(const[ab,full]of Object.entries(ADDR_ABBR)){s=s.replace(new RegExp("\\b"+ab.replace(".","\\."),"gi"),full);}return s;}

// DATE FORMATTER FR
function fmtDate(d){if(!d)return"";try{const dt=new Date(d);return dt.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+dt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
function fmtDateShort(d){if(!d)return"";try{return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});}catch{return"";}}

const LINK_STRENGTHS = [
  { id: "confirmed", label: "✓ Confirmé", desc: "70% et plus", width: 2.5, dash: "", opacity: 1, badge: "✓", badgeColor: "#10b981", min: 70 },
  { id: "probable", label: "~ Probable", desc: "30% à 69%", width: 1.8, dash: "", opacity: 0.8, badge: "~", badgeColor: "#f59e0b", min: 30 },
  { id: "possible", label: "? Possible", desc: "1% à 29%", width: 1.2, dash: "6 4", opacity: 0.5, badge: "?", badgeColor: "#ef4444", min: 1 },
  { id: "unknown", label: "— Non qualifié", desc: "0%", width: 1.5, dash: "2 3", opacity: 0.6, badge: "—", badgeColor: "#64748b", min: 0 },
];
function getStrengthFromConfidence(conf) {
  if (conf >= 70) return LINK_STRENGTHS[0];
  if (conf >= 30) return LINK_STRENGTHS[1];
  if (conf >= 1) return LINK_STRENGTHS[2];
  return LINK_STRENGTHS[3];
}

// STICKERS
const STICKERS = [
  { id: "thumbsup", emoji: "👍", label: "Validé" },
  { id: "thumbsdown", emoji: "👎", label: "Rejeté" },
  { id: "question", emoji: "❓", label: "À vérifier" },
  { id: "exclamation", emoji: "❗", label: "Important" },
  { id: "warning", emoji: "⚠️", label: "Attention" },
  { id: "check", emoji: "✅", label: "Confirmé" },
  { id: "cross", emoji: "❌", label: "Faux / Éliminé" },
  { id: "star", emoji: "⭐", label: "Prioritaire" },
  { id: "fire", emoji: "🔥", label: "Urgent" },
  { id: "eye", emoji: "👁️", label: "Sous surveillance" },
  { id: "lock", emoji: "🔒", label: "Confidentiel" },
  { id: "flag", emoji: "🚩", label: "Red flag" },
  { id: "target", emoji: "🎯", label: "Cible" },
  { id: "clock2", emoji: "⏰", label: "En attente" },
  { id: "skull", emoji: "💀", label: "Dangereux" },
  { id: "money", emoji: "💰", label: "Flux financier" },
];

const POSTIT_COLORS = ["#fef08a","#bbf7d0","#bfdbfe","#fecaca","#e9d5ff","#fed7aa","#d1d5db"];


// PLUGINS: now loaded from registry (see plugins/registry.js)
const themes = {
  dark: { bg:"#0d1117",surface:"#161b22",surfaceAlt:"#1c2333",border:"#2a3140",borderHover:"#3d4868",text:"#e2e4ed",textSecondary:"#8b8fa8",textMuted:"#4e5568",accent:"#58a6ff",accentHover:"#79b8ff",canvasBg:"#0d1117",canvasGrid:"#1a2030",shadow:"rgba(0,0,0,0.6)",danger:"#f85149",success:"#3fb950",catHover:"#1f2937",itemBg:"#172030",itemHover:"#1e2d42",itemBorder:"#253044",tooltip:"#1e293b",tooltipBorder:"#334155" },
  light: { bg:"#f6f8fa",surface:"#ffffff",surfaceAlt:"#f1f3f9",border:"#d8dee4",borderHover:"#bcc3ce",text:"#1f2328",textSecondary:"#656d76",textMuted:"#9ca3af",accent:"#0969da",accentHover:"#0550ae",canvasBg:"#f0f2f8",canvasGrid:"#dfe2e8",shadow:"rgba(0,0,0,0.08)",danger:"#cf222e",success:"#1a7f37",catHover:"#e8ebf0",itemBg:"#ffffff",itemHover:"#f0f3f9",itemBorder:"#e2e5f0",tooltip:"#ffffff",tooltipBorder:"#d1d5db" },
};

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
};

const HOLD_DELAY = 300, MOVE_THRESHOLD = 5;

// Tooltip component

export default function OSINTMapper({ caseId: propCaseId, authToken, userName: propUserName, userRole: propUserRole, onQuit, collabMode: propCollabMode }) {
  // Permissions
  const canEdit = propUserRole === 'ADMIN' || propUserRole === 'ANALYST';
  // ============================================================
  // SESSION: sessionStorage survives F5, stores {name, room, mode}
  // ============================================================
  const P_KEY = "om_pseudo";
  const S_KEY = "om_session";

  // v2: Props-driven — no URL parsing, no session storage for routing
  const urlInfo = null;
  const session = { name: propUserName || "User", room: propCaseId, mode: "solo" };

  const [theme, setTheme] = useState(() => localStorage.getItem('om_theme') || "dark");
  const t = themes[theme];

  // v2: Auth comes from props
  const [authUser, setAuthUser] = useState({ id: propCaseId, username: propUserName, displayName: propUserName, role: propUserRole || "ANALYST" });
  const [authTokenState, setAuthToken] = useState(authToken);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  const serverUrl = (window.location.port && !['80','443',''].includes(window.location.port)) ? `http://${window.location.hostname}:4444` : '';

  // v2: Auth is handled by the wrapper — no need to check token here

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
    password: lobbyMode === "collab" ? (lobbyPassword || undefined) : undefined,
    isCreator: isCreatorRef.current,
    authToken: authToken,
  });
  const isViewer = false; // v0.2.1: viewer mode disabled for production — all users are editors

  const [caseInfo, setCaseInfo] = useState({ title: "", description: "", tags: "" });
  const [caseCreated, setCaseCreated] = useState(!!session);
  const [entities, setEntities] = useState([]);
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [postits, setPostits] = useState([]);
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
  const [showTimeline, setShowTimeline] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [ownerBannerVisible, setOwnerBannerVisible] = useState(false);
  const ownerBannerTimer = useRef(null);
  const chatInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  // Map is now a plugin (see plugins/map/Panel.jsx)
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [osintImport, setOsintImport] = useState(null); // { preview, foundModules, targetName }
  const [showPlugins, setShowPlugins] = useState(false);
  const [pluginTick, setPluginTick] = useState(0);
  const [activePlugin, setActivePlugin] = useState(null);
  const [filterTypes, setFilterTypes] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectionBox, setSelectionBox] = useState(null); // {x1,y1,x2,y2} in canvas coords
  const selBoxStart = useRef(null);
  const [timeline, setTimeline] = useState([]);
  const [showCollaborators, setShowCollaborators] = useState(true);
  const [showCollabDropdown, setShowCollabDropdown] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const collabList = useMemo(()=>Object.entries(collab.collaborators).map(([id,c])=>({id,...c})),[collab.collaborators]);

  // Auto-switch to collab mode when someone joins the room
  useEffect(()=>{
    if(collabList.length>0&&lobbyMode==="solo") setLobbyMode("collab");
  },[collabList.length]);
  const [copiedEntity, setCopiedEntity] = useState(null);


  const selectedEntity = entities.find(e=>e.id===selectedId);
  const selectedLink = links.find(l=>l.id===selectedLinkId);
  const logAction = useCallback(a => {
    const event = {id:genId(),action:a,timestamp:new Date().toISOString(),user:lobbyName||"Vous"};
    setTimeline(p=>[event,...p.slice(0,99)]);
    if(collab.connected) collab.sendTimelineEvent(event);
  },[lobbyName,collab.connected,collab.sendTimelineEvent]);
  const screenToCanvas = useCallback((sx,sy)=>{const r=canvasRef.current?.getBoundingClientRect();if(!r)return{x:sx,y:sy};return{x:(sx-r.left-pan.x)/zoom,y:(sy-r.top-pan.y)/zoom};},[pan,zoom]);

  const norm=useCallback(s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(),[]);
  const findDuplicate=useCallback((label,excludeId)=>{if(!label||label.length<2)return null;const n=norm(label);return entities.find(e=>e.id!==excludeId&&norm(e.label)===n)||null;},[entities,norm]);
  const addEntity = useCallback((subItemId, dx, dy)=>{
    if(isViewer) return;
    const info=ALL_ITEMS[subItemId]; if(!info)return;
    const ent={id:genId(),type:info.category,subtype:subItemId,label:info.label,description:info.desc||"",notes:"",x:dx??(300+Math.random()*200-pan.x/zoom),y:dy??(200+Math.random()*200-pan.y/zoom),color:info.color,metadata:{},comments:[],author:lobbyName||"Vous",createdAt:new Date().toISOString()};
    setEntities(p=>[...p,ent]); logAction(`"${info.label}" ajoutée`);
    if(collab.connected)collab.sendEntityAdd(ent);
    console.log('[graph] addEntity', ent.id, 'connected=', collab.connected);
  },[pan,zoom,logAction,lobbyMode,collab.connected,collab.sendEntityAdd]);
  // Anti-overlap: push overlapping entities apart
  const resolveOverlaps = useCallback((movedId)=>{
    const EW=ENT_W+10,EH=ENT_H+10,MIN_GAP=10;// entity bbox + gap
    setEntities(prev=>{
      const next=[...prev];
      const mi=next.findIndex(e=>e.id===movedId);if(mi<0)return prev;
      const moved=next[mi];
      let changed=false;
      for(let i=0;i<next.length;i++){
        if(i===mi)continue;
        const o=next[i];
        const overlapX=Math.max(0,(EW)-(Math.abs(moved.x-o.x)));
        const overlapY=Math.max(0,(EH)-(Math.abs(moved.y-o.y)));
        if(overlapX>0&&overlapY>0){
          const dx=o.x-moved.x||1,dy=o.y-moved.y||1;
          const pushX=Math.sign(dx)*(overlapX/2+MIN_GAP);
          const pushY=Math.sign(dy)*(overlapY/2+MIN_GAP);
          next[i]={...o,x:Math.round(o.x+pushX),y:Math.round(o.y+pushY)};
          changed=true;
        }
      }
      return changed?next:prev;
    });
  },[]);

  const updateEntity = useCallback((id,u)=>{if(isViewer)return;
    setEntities(p=>p.map(e=>e.id===id?{...e,...u}:e));
    if(collab.connected) collab.sendEntityUpdate(id,u);
  },[collab.connected, collab.sendEntityUpdate]);
  const renameEntity=useCallback((id,newLabel)=>{updateEntity(id,{label:newLabel});return true;},[updateEntity]);

  const deleteEntity = useCallback(id=>{if(isViewer)return;const ent=entities.find(e=>e.id===id);setEntities(p=>p.filter(e=>e.id!==id));setLinks(p=>p.filter(l=>l.from!==id&&l.to!==id));if(selectedId===id){setSelectedId(null);setRightPanelOpen(false);}logAction(`"${ent?.label}" supprimée`);if(collab.connected)collab.sendEntityDelete(id);},[entities,selectedId,logAction,lobbyMode,collab.connected,collab.sendEntityDelete]);
  const duplicateEntity = useCallback(id=>{const s=entities.find(e=>e.id===id);if(!s)return;setEntities(p=>[...p,{...s,id:genId(),x:s.x+30,y:s.y+30,label:s.label+" (copie)",metadata:{...s.metadata}}]);logAction(`"${s.label}" dupliquée`);},[entities,logAction]);
  const copyEntity = useCallback(id=>{const s=entities.find(e=>e.id===id);if(s)setCopiedEntity({...s});},[entities]);
  const pasteEntity = useCallback((cx,cy)=>{if(!copiedEntity)return;setEntities(p=>[...p,{...copiedEntity,id:genId(),x:cx,y:cy,label:copiedEntity.label+" (copie)",metadata:{...copiedEntity.metadata}}]);logAction(`"${copiedEntity.label}" collée`);},[copiedEntity,logAction]);
  const addLink = useCallback((from,to)=>{if(isViewer)return;if(from===to)return;if(links.find(l=>(l.from===from&&l.to===to)||(l.from===to&&l.to===from)))return;const lk={id:genId(),from,to,type:"related",label:"",color:LINK_TYPES[0].color,strength:"unknown",confidence:50,date:"",comments:[]};setLinks(p=>[...p,lk]);logAction("Lien créé");if(collab.connected)collab.sendLinkAdd(lk);},[links,logAction,lobbyMode,collab.connected,collab.sendLinkAdd]);
  const updateLink = useCallback((id,u)=>{if(isViewer)return;setLinks(p=>p.map(l=>l.id===id?{...l,...u}:l));if(collab.connected)collab.sendLinkUpdate(id,u);},[lobbyMode,collab.connected,collab.sendLinkUpdate]);
  const deleteLink = useCallback(id=>{if(isViewer)return;setLinks(p=>p.filter(l=>l.id!==id));if(selectedLinkId===id)setSelectedLinkId(null);logAction("Lien supprimé");if(collab.connected)collab.sendLinkDelete(id);},[selectedLinkId,logAction,lobbyMode,collab.connected,collab.sendLinkDelete]);


  // Sticker CRUD
  const addSticker=useCallback((emoji,label,cx,cy)=>{if(isViewer)return;const s={id:genId(),emoji,label,x:cx??(400-pan.x/zoom+Math.random()*100),y:cy??(300-pan.y/zoom+Math.random()*100)};setStickers(p=>[...p,s]);logAction("Sticker \""+label+"\" ajouté");if(collab.connected)collab.sendStickerAdd(s);},[pan,zoom,logAction,lobbyMode,collab.connected,collab.sendStickerAdd]);
  const deleteSticker=useCallback(id=>{setStickers(p=>p.filter(s=>s.id!==id));setSelectedStickerId(null);if(collab.connected)collab.sendStickerDelete(id);},[lobbyMode,collab.connected,collab.sendStickerDelete]);

  // Post-it CRUD
  const addPostit=useCallback((color,cx,cy)=>{if(isViewer)return;const p={id:genId(),text:"",color:color||"#fef08a",x:cx??(350-pan.x/zoom+Math.random()*100),y:cy??(250-pan.y/zoom+Math.random()*100),w:140,h:100};setPostits(prev=>[...prev,p]);logAction("Post-it ajouté");if(collab.connected)collab.sendPostitAdd(p);},[pan,zoom,logAction,lobbyMode,collab.connected,collab.sendPostitAdd]);
  const updatePostit=useCallback((id,u)=>{setPostits(p=>p.map(n=>n.id===id?{...n,...u}:n));if(collab.connected)collab.sendPostitUpdate(id,u);},[lobbyMode,collab.connected,collab.sendPostitUpdate]);
  const deletePostit=useCallback(id=>{setPostits(p=>p.filter(n=>n.id!==id));setLinks(p=>p.filter(l=>l.from!=="postit_"+id&&l.to!=="postit_"+id));setSelectedPostitId(null);if(collab.connected)collab.sendPostitDelete(id);},[lobbyMode,collab.connected,collab.sendPostitDelete]);

  // Sticker drag
  const handleStickerDown=useCallback((e,sid)=>{e.stopPropagation();if(e.button!==0)return;const pos=screenToCanvas(e.clientX,e.clientY);const s=stickers.find(st=>st.id===sid);mouseDownInfo.current={eid:sid,sx:e.clientX,sy:e.clientY,ox:pos.x-s.x,oy:pos.y-s.y,moved:false,linking:false,kind:"sticker"};setSelectedStickerId(sid);setSelectedId(null);setSelectedLinkId(null);setSelectedPostitId(null);},[screenToCanvas,stickers]);

  // Postit drag
  const handlePostitDown=useCallback((e,pid)=>{e.stopPropagation();if(e.button!==0)return;const pos=screenToCanvas(e.clientX,e.clientY);const p=postits.find(pt=>pt.id===pid);mouseDownInfo.current={eid:pid,sx:e.clientX,sy:e.clientY,ox:pos.x-p.x,oy:pos.y-p.y,moved:false,linking:false,kind:"postit"};if(e.ctrlKey||e.metaKey){mouseDownInfo.current.linking=true;setLinkingFrom("postit_"+pid);setHoldActive(true);setSelectedPostitId(pid);return;}holdTimer.current=setTimeout(()=>{if(mouseDownInfo.current&&!mouseDownInfo.current.moved&&mouseDownInfo.current.kind==="postit"){mouseDownInfo.current.linking=true;setLinkingFrom("postit_"+pid);setHoldActive(true);}},HOLD_DELAY);setSelectedPostitId(pid);setSelectedId(null);setSelectedLinkId(null);setSelectedStickerId(null);},[screenToCanvas,postits]);

  // Hover logic

  const handleEntityPointerDown = useCallback((e,eid)=>{e.stopPropagation();if(e.button!==0)return;
    if(isViewer)return; // Viewers cannot interact with entities
    // Check if entity is locked by another user
    const lockInfo=collab.isLockedByOther(eid);if(lockInfo)return;
    // Acquire lock
    if(collab.connected)collab.lockEntity(eid);
    const pos=screenToCanvas(e.clientX,e.clientY);const ent=entities.find(en=>en.id===eid);const ox=pos.x-ent.x,oy=pos.y-ent.y;mouseDownInfo.current={eid,sx:e.clientX,sy:e.clientY,ox,oy,moved:false,linking:false,kind:"entity"};if(e.ctrlKey||e.metaKey){mouseDownInfo.current.linking=true;setLinkingFrom(eid);setHoldActive(true);return;}holdTimer.current=setTimeout(()=>{if(mouseDownInfo.current&&!mouseDownInfo.current.moved){mouseDownInfo.current.linking=true;setLinkingFrom(eid);setHoldActive(true);}},HOLD_DELAY);dragOffset.current={x:ox,y:oy};setSelectedId(eid);setSelectedLinkId(null);setRightPanelOpen(true);setCtxMenu(null);},[screenToCanvas,entities,collab.isLockedByOther,collab.lockEntity,collab.connected,lobbyMode]);

  const handlePointerMove = useCallback(e=>{if(selBoxStart.current){const pos=screenToCanvas(e.clientX,e.clientY);setSelectionBox({x1:selBoxStart.current.x,y1:selBoxStart.current.y,x2:pos.x,y2:pos.y});return;}if(isPanning){setPan({x:panStart.current.px+(e.clientX-panStart.current.x),y:panStart.current.py+(e.clientY-panStart.current.y)});
    // Track movement for stamp mode
    if(mouseDownInfo.current?.kind==="stamp"){const dx=e.clientX-mouseDownInfo.current.sx,dy=e.clientY-mouseDownInfo.current.sy;if(Math.sqrt(dx*dx+dy*dy)>MOVE_THRESHOLD)mouseDownInfo.current.moved=true;}
    return;}const info=mouseDownInfo.current;if(!info)return;const dx=e.clientX-info.sx,dy=e.clientY-info.sy;if(Math.sqrt(dx*dx+dy*dy)>MOVE_THRESHOLD&&!info.moved){info.moved=true;if(!info.linking){clearTimeout(holdTimer.current);setDragging(info.eid);}}const pos2=screenToCanvas(e.clientX,e.clientY);if(info.kind==="entity"){if(info.linking){setLinkMousePos(pos2);}else if(info.moved){if(multiSelection.includes(info.eid)&&multiSelection.length>1){const ddx=pos2.x-info.ox-(entities.find(e=>e.id===info.eid)?.x||0);const ddy=pos2.y-info.oy-(entities.find(e=>e.id===info.eid)?.y||0);setEntities(prev=>prev.map(e=>multiSelection.includes(e.id)?{...e,x:e.x+ddx,y:e.y+ddy}:e));}else{updateEntity(info.eid,{x:pos2.x-info.ox,y:pos2.y-info.oy});}}}else if(info.kind==="sticker"&&info.moved){setStickers(p=>p.map(s=>s.id===info.eid?{...s,x:pos2.x-info.ox,y:pos2.y-info.oy}:s));}else if(info.kind==="postit"){if(info.linking){setLinkMousePos(pos2);}else if(info.moved){setPostits(p=>p.map(n=>n.id===info.eid?{...n,x:pos2.x-info.ox,y:pos2.y-info.oy}:n));}}},[isPanning,screenToCanvas,updateEntity]);

  const handlePointerUp = useCallback(e=>{clearTimeout(holdTimer.current);const wasDragging=dragging;setIsPanning(false);setDragging(null);setHoldActive(false);
    // Send final position to Yjs after drag
    if(wasDragging && collab.connected){
      const ent = entities.find(en => en.id === wasDragging);
      if(ent) collab.sendEntityUpdate(wasDragging, { x: ent.x, y: ent.y });
    }
    // Release entity lock after drag
    if(wasDragging&&collab.connected)collab.unlockEntity(wasDragging);
    // Resolve overlaps after drag
    if(wasDragging)resolveOverlaps(wasDragging);
    // Stamp mode: place sticker only if no drag movement
    if(mouseDownInfo.current?.kind==="stamp"&&!mouseDownInfo.current.moved&&stampSticker){const pos=screenToCanvas(e.clientX,e.clientY);addSticker(stampSticker.emoji,stampSticker.label,pos.x-20,pos.y-20);mouseDownInfo.current=null;return;}
    if(selBoxStart.current){const pos=screenToCanvas(e.clientX,e.clientY);const bx1=Math.min(selBoxStart.current.x,pos.x),by1=Math.min(selBoxStart.current.y,pos.y),bx2=Math.max(selBoxStart.current.x,pos.x),by2=Math.max(selBoxStart.current.y,pos.y);const sel=entities.filter(ent=>ent.x+ENT_W>=bx1&&ent.x<=bx2&&ent.y+ENT_H>=by1&&ent.y<=by2).map(e=>e.id);setMultiSelection(sel);selBoxStart.current=null;setSelectionBox(null);mouseDownInfo.current=null;return;}if(linkingFrom){const pos=screenToCanvas(e.clientX,e.clientY);const fromId=linkingFrom;const targetEnt=entities.find(ent=>pos.x>=ent.x&&pos.x<=ent.x+ENT_W&&pos.y>=ent.y&&pos.y<=ent.y+ENT_H);const targetPostit=postits.find(p=>pos.x>=p.x&&pos.x<=p.x+p.w&&pos.y>=p.y&&pos.y<=p.y+p.h);let targetId=null;if(targetEnt)targetId=targetEnt.id;else if(targetPostit)targetId="postit_"+targetPostit.id;if(targetId&&targetId!==fromId)addLink(fromId,targetId);setLinkingFrom(null);setLinkMousePos(null);}mouseDownInfo.current=null;},[linkingFrom,screenToCanvas,entities,postits,addLink,stampSticker,addSticker,dragging,resolveOverlaps]);

  const handleCanvasDown = useCallback(e=>{if(e.target===canvasRef.current||e.target.tagName==="svg"||e.target.classList?.contains("canvas-bg")){if(e.button===0){if(e.shiftKey){const pos=screenToCanvas(e.clientX,e.clientY);selBoxStart.current=pos;setSelectionBox({x1:pos.x,y1:pos.y,x2:pos.x,y2:pos.y});return;}if(stampSticker){// Start tracking for stamp — we'll place on mouseUp only if no movement
        mouseDownInfo.current={kind:"stamp",sx:e.clientX,sy:e.clientY,moved:false};
        // Also allow panning: start pan tracking
        setIsPanning(true);panStart.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
        return;}setIsPanning(true);panStart.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};setSelectedId(null);setSelectedLinkId(null);setSelectedStickerId(null);setSelectedPostitId(null);setMultiSelection([]);setRightPanelOpen(false);setCtxMenu(null);}}},[pan,stampSticker,screenToCanvas,addSticker]);

  // Zoom with scroll - centered on mouse
  const doWheel = useCallback(e=>{if(showPlugins||activePlugin)return;e.preventDefault();e.stopPropagation();const r=canvasWrapRef.current?.getBoundingClientRect();if(!r)return;const mx=e.clientX-r.left,my=e.clientY-r.top;const factor=e.deltaY>0?0.9:1.1;setZoom(z=>{const nz=clamp(z*factor,0.1,4);const ratio=nz/z;setPan(p=>({x:mx-ratio*(mx-p.x),y:my-ratio*(my-p.y)}));return nz;});},[showPlugins,activePlugin]);
  useEffect(()=>{const el=canvasWrapRef.current;if(!el)return;el.addEventListener("wheel",doWheel,{passive:false});return()=>el.removeEventListener("wheel",doWheel);},[doWheel]);
  useEffect(()=>{const h=e=>{
    if(e.key==="Escape")setStampSticker(null);
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
  };window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[selectedId,selectedLinkId,selectedStickerId,selectedPostitId,editingLabel,editingPostit,entities,deleteEntity,deleteLink,deleteSticker,deletePostit]);

  const handleDrop = useCallback(e=>{e.preventDefault();if(isViewer)return;const subId=e.dataTransfer.getData("subItemId");if(!subId)return;const pos=screenToCanvas(e.clientX,e.clientY);const stickerEmoji=e.dataTransfer.getData("stickerEmoji");const stickerLabel=e.dataTransfer.getData("stickerLabel");const postitColor=e.dataTransfer.getData("postitColor");if(subId)addEntity(subId,pos.x-ENT_HW,pos.y-ENT_HH);else if(stickerEmoji)addSticker(stickerEmoji,stickerLabel,pos.x-20,pos.y-20);else if(postitColor)addPostit(postitColor,pos.x-70,pos.y-50);},[screenToCanvas,addEntity]);

  const zoomIn=()=>setZoom(z=>clamp(z*1.2,0.1,4));
  const zoomOut=()=>setZoom(z=>clamp(z*0.8,0.1,4));
  const fitView=()=>{if(!entities.length)return;const r=canvasRef.current?.getBoundingClientRect();if(!r)return;const xs=entities.map(e=>e.x),ys=entities.map(e=>e.y);const[mx,my,Mx,My]=[Math.min(...xs)-120,Math.min(...ys)-120,Math.max(...xs)+280,Math.max(...ys)+180];const nz=clamp(Math.min(r.width/(Mx-mx),r.height/(My-my)),0.1,2);setZoom(nz);setPan({x:-mx*nz+(r.width-(Mx-mx)*nz)/2,y:-my*nz+(r.height-(My-my)*nz)/2});};

  // === FORCE-DIRECTED GRAPH LAYOUT ===
  const autoLayout = useCallback((centerId)=>{
    if(entities.length<2)return;
    // Build adjacency
    const nodes=entities.map(e=>({id:e.id,x:e.x+ENT_HW,y:e.y+ENT_HH,vx:0,vy:0}));
    const nodeMap={};nodes.forEach((n,i)=>nodeMap[n.id]=i);
    const edgeList=links.filter(l=>nodeMap[l.from]!==undefined&&nodeMap[l.to]!==undefined).map(l=>({s:nodeMap[l.from],t:nodeMap[l.to]}));

    // If centerId, place it at center
    const ci=centerId?nodeMap[centerId]:null;
    const cx=500,cy=400;
    if(ci!==null&&ci!==undefined){nodes[ci].x=cx;nodes[ci].y=cy;}

    // Initial circular layout for disconnected nodes
    const connected=new Set();
    edgeList.forEach(e=>{connected.add(e.s);connected.add(e.t);});
    let angle=0;
    nodes.forEach((n,i)=>{
      if(ci!==null&&i===ci)return;
      if(!connected.has(i)){
        n.x=cx+Math.cos(angle)*500;
        n.y=cy+Math.sin(angle)*500;
        angle+=0.7;
      }
    });

    // Force simulation: 80 iterations
    const REPULSION=8000,ATTRACTION=0.005,DAMPING=0.85,IDEAL_DIST=220;
    for(let iter=0;iter<80;iter++){
      // Repulsion between all pairs
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          let dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y;
          let dist=Math.sqrt(dx*dx+dy*dy)||1;
          let force=REPULSION/(dist*dist);
          let fx=dx/dist*force,fy=dy/dist*force;
          if(ci!==null&&i===ci){nodes[j].vx+=fx*2;nodes[j].vy+=fy*2;}
          else if(ci!==null&&j===ci){nodes[i].vx-=fx*2;nodes[i].vy-=fy*2;}
          else{nodes[i].vx-=fx;nodes[i].vy-=fy;nodes[j].vx+=fx;nodes[j].vy+=fy;}
        }
      }
      // Attraction along edges
      edgeList.forEach(e=>{
        const a=nodes[e.s],b=nodes[e.t];
        let dx=b.x-a.x,dy=b.y-a.y;
        let dist=Math.sqrt(dx*dx+dy*dy)||1;
        let force=(dist-IDEAL_DIST)*ATTRACTION;
        let fx=dx/dist*force,fy=dy/dist*force;
        if(ci!==null&&e.s===ci){b.vx-=fx;b.vy-=fy;}
        else if(ci!==null&&e.t===ci){a.vx+=fx;a.vy+=fy;}
        else{a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;}
      });
      // Apply velocities
      nodes.forEach((n,i)=>{
        if(ci!==null&&i===ci)return;
        n.x+=n.vx;n.y+=n.vy;
        n.vx*=DAMPING;n.vy*=DAMPING;
      });
    }

    // Apply positions back
    const updates={};
    nodes.forEach(n=>{updates[n.id]={x:Math.round(n.x-80),y:Math.round(n.y-30)};});
    setEntities(prev=>prev.map(e=>updates[e.id]?{...e,...updates[e.id]}:e));
    logAction("Graphe réarrangé"+(centerId?" (centré)":""));
    setTimeout(fitView,50);
  },[entities,links,logAction,fitView]);

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [transformLoading, setTransformLoading] = useState(null); // transform id being executed

  // === RUN TRANSFORM ===
  const runTransform = useCallback(async (transformDef, entityId) => {
    const ent = entities.find(e => e.id === entityId);
    if (!ent) return;
    setTransformLoading(transformDef.id);
    setCtxMenu(null);
    try {
      const results = await transformDef.fn(ent);
      if (!results || results.length === 0) { alert("Aucun résultat"); return; }

      // Check for errors or info
      const errors = results.filter(r => r.error);
      if (errors.length > 0 && results.every(r => r.error)) {
        alert("⚠️ " + errors.map(e => e.error).join("\n"));
        return;
      }
      const infos = results.filter(r => r.info);
      if (infos.length > 0 && results.every(r => r.info)) {
        alert("ℹ️ " + infos.map(i => i.info).join("\n"));
        return;
      }

      // Handle rename
      const renames = results.filter(r => r.rename);
      if (renames.length > 0) {
        updateEntity(entityId, { label: renames[0].rename });
        if (renames[0].info) logAction(renames[0].info);
        return;
      }

      // Create new entities from results
      const validResults = results.filter(r => r.label && r.subtype);
      let angle = 0;
      const angleStep = (Math.PI * 2) / Math.max(validResults.length, 1);
      const dist = 250;

      validResults.forEach(res => {
        // Check if entity with same label already exists
        const existing = entities.find(e => e.label.toLowerCase() === res.label.toLowerCase());
        if (existing) {
          // Just link if not already linked
          const alreadyLinked = links.find(l => (l.from === entityId && l.to === existing.id) || (l.from === existing.id && l.to === entityId));
          if (!alreadyLinked) {
            const lk = {
              id: genId(), from: entityId, to: existing.id,
              type: "related", label: res.linkLabel || "", color: "#64748b",
              strength: "probable", confidence: 70, date: "", comments: [], bidirectional: false,
            };
            setLinks(p => [...p, lk]);
            if (lobbyMode === "collab") collab.sendLinkAdd(lk);
          }
          return;
        }

        const itemInfo = ALL_ITEMS[res.subtype] || {};
        const newEnt = {
          id: genId(),
          label: res.label,
          type: itemInfo.category || res.subtype.split("_")[0],
          subtype: res.subtype,
          color: itemInfo.color || "#64748b",
          x: Math.round(ent.x + Math.cos(angle) * dist),
          y: Math.round(ent.y + Math.sin(angle) * dist),
          description: res.description || "",
          notes: res.notes || "",
          metadata: res.metadata || {},
          comments: [],
        };
        setEntities(p => [...p, newEnt]);
        if (collab.connected) collab.sendEntityAdd(newEnt);

        // Create link
        const lk = {
          id: genId(), from: entityId, to: newEnt.id,
          type: "related", label: res.linkLabel || "", color: itemInfo.color || "#64748b",
          strength: "probable", confidence: 70, date: "", comments: [], bidirectional: false,
        };
        setLinks(p => [...p, lk]);
        if (lobbyMode === "collab") collab.sendLinkAdd(lk);

        angle += angleStep;
      });

      logAction(`Transform: ${transformDef.label} sur ${ent.label} (${validResults.length} résultats)`);
    } catch (e) {
      alert("Erreur transform: " + e.message);
    } finally {
      setTransformLoading(null);
    }
  }, [entities, links, updateEntity, logAction, lobbyMode, collab, setEntities, setLinks]);

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
      collab.addListener('sticker:delete', (id)=>setStickers(p=>p.filter(s=>s.id!==id))),
      collab.addListener('postit:add', (pt)=>setPostits(p=>{if(p.find(x=>x.id===pt.id))return p;return[...p,pt];})),
      collab.addListener('postit:update', (id,full)=>setPostits(p=>p.map(n=>n.id===id?{...n,...full}:n))),
      collab.addListener('postit:delete', (id)=>setPostits(p=>p.filter(n=>n.id!==id))),
      collab.addListener('timeline:add', (event)=>setTimeline(p=>[event,...p.slice(0,99)])),
    ];
    return ()=>unsubs.forEach(u=>u());
  },[collab.addListener]);// eslint-disable-line

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

  // Save function — HTTP POST to server
  const doSave = useCallback(()=>{
    if(!activeRoom||stateHash===lastSaveHashRef.current)return;
    
    setSaveStatus("saving");
    const _authToken = authToken || localStorage.getItem('om_token');
    fetch(`${serverUrl}/api/save/${encodeURIComponent(activeRoom)}`,{
      method:"POST",
      headers:{"Content-Type":"application/json",...(_authToken?{Authorization:`Bearer ${_authToken}`}:{})},
      body:JSON.stringify({entities,links,stickers,postits,timeline,caseInfo,user:lobbyName}),
    }).then(r=>{
      if(r.ok){lastSaveHashRef.current=stateHash;setSaveStatus("saved");setTimeout(()=>setSaveStatus(s=>s==="saved"?"idle":s),2000);}
      else{setSaveStatus("error");}
    }).catch(e=>{setSaveStatus("error");});
  },[activeRoom,entities,links,stickers,postits,timeline,caseInfo,lobbyName,stateHash,serverUrl]);

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
    // Mark init as loaded — auto-save can now safely run
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
    collab.sendSelection(selectedId||selectedLinkId||null);
  },[selectedId,selectedLinkId,lobbyMode,collab.connected,collab.sendSelection]);

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

  // Leaflet map is now a plugin (see plugins/map/Panel.jsx)
  const exportJSON=()=>{const d={version:"5.0",caseInfo,entities,links,stickers,postits,exportedAt:new Date().toISOString()};const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${caseInfo.title||"osintmapper"}.json`;a.click();};

  // === PDF EXPORT ===
  const exportPDF = useCallback(async ()=>{
    const pdf = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const W=210, H=297, M=15, CW=W-2*M; // A4 dims + margins
    const now=new Date();
    const fmtD=d=>d?new Date(d).toLocaleDateString("fr",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
    let y=0;

    // HELPERS
    const addPage=()=>{pdf.addPage();y=M;};
    const checkPage=(need)=>{if(y+need>H-M)addPage();};
    const setC=(hex)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);pdf.setTextColor(r,g,b);return[r,g,b];};
    const setF=(hex)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);pdf.setFillColor(r,g,b);};
    const gray=(v)=>pdf.setTextColor(v,v,v);
    const black=()=>pdf.setTextColor(30,30,30);
    const muted=()=>pdf.setTextColor(120,120,130);
    const wrapText=(text,maxW,fontSize)=>{pdf.setFontSize(fontSize);return pdf.splitTextToSize(text||"",maxW);};
    // Footer on every page
    const addFooter=(pageNum)=>{pdf.setFontSize(7);muted();pdf.text(`OSINTMapper v0.2.1 — ${caseInfo.title||"Export"} — ${fmtD(now)}`,M,H-8);pdf.text(`${pageNum}`,W-M,H-8,{align:"right"});};

    // ═══ PAGE 1: COVER + GRAPH CAPTURE ═══
    // Background
    pdf.setFillColor(13,17,23);pdf.rect(0,0,W,H,"F");

    // Title block
    pdf.setFontSize(28);pdf.setTextColor(88,166,255);
    pdf.text("OSINT",W/2-25,40);pdf.setTextColor(226,228,237);pdf.text("Mapper",W/2+8,40);
    pdf.setFontSize(10);pdf.setTextColor(120,130,150);
    pdf.text("Rapport d'investigation",W/2,50,{align:"center"});

    // Case info
    pdf.setFontSize(18);pdf.setTextColor(226,228,237);
    pdf.text(caseInfo.title||"Sans titre",W/2,70,{align:"center"});
    if(caseInfo.description){pdf.setFontSize(10);pdf.setTextColor(140,150,168);const descLines=wrapText(caseInfo.description,CW,10);pdf.text(descLines,W/2,80,{align:"center"});}
    
    pdf.setFontSize(9);pdf.setTextColor(100,110,130);
    pdf.text(`Date: ${fmtD(now)}`,W/2,95,{align:"center"});
    pdf.text(`${entities.length} entites  |  ${links.length} liens  |  ${stickers.length} stickers`,W/2,101,{align:"center"});

    // Graph capture
    try{
      const svgEl=canvasRef.current?.querySelector("svg");
      if(svgEl){
        const canvas=await html2canvas(canvasRef.current,{backgroundColor:"#0d1117",scale:1.5,useCORS:true,logging:false});
        const imgData=canvas.toDataURL("image/jpeg",0.85);
        const imgW=CW, imgH=Math.min((canvas.height/canvas.width)*imgW, 150);
        pdf.addImage(imgData,"JPEG",M,110,imgW,imgH);
      }
    }catch(e){console.warn("Graph capture failed:",e);}

    addFooter(1);
    let pageNum=1;

    // ═══ PAGE 2: RESUME GLOBAL ═══
    addPage(); pageNum++;
    // Header bar
    pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
    pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.text("RESUME GLOBAL",M+3,y+6);y+=14;

    // Stats par categorie
    const catStats={};
    entities.forEach(e=>{const cat=CATEGORIES.find(c=>c.id===e.type);const label=cat?.label||e.type;catStats[label]=(catStats[label]||0)+1;});
    
    pdf.setFontSize(10);black();pdf.setFont(undefined,"bold");pdf.text("Entites par categorie",M,y);y+=6;
    pdf.setFont(undefined,"normal");pdf.setFontSize(9);
    Object.entries(catStats).sort((a,b)=>b[1]-a[1]).forEach(([cat,n])=>{
      checkPage(5);
      const cat2=CATEGORIES.find(c=>c.label===cat);
      if(cat2){setF(cat2.color);pdf.rect(M,y-3,3,3,"F");}
      black();pdf.text(`${cat} : ${n}`,M+6,y);y+=5;
    });
    y+=6;

    // Link type stats
    const linkStats={};
    links.forEach(l=>{const lt=LINK_TYPES.find(t=>t.id===l.type)||LINK_TYPES[0];linkStats[lt.label]=(linkStats[lt.label]||0)+1;});
    checkPage(10);
    pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text("Liens par type",M,y);y+=6;
    pdf.setFont(undefined,"normal");pdf.setFontSize(9);
    Object.entries(linkStats).sort((a,b)=>b[1]-a[1]).forEach(([type,n])=>{
      checkPage(5);black();pdf.text(`${type} : ${n}`,M+6,y);y+=5;
    });
    y+=6;

    // Confidence distribution
    const confBuckets={"90-100%":0,"70-89%":0,"40-69%":0,"< 40%":0};
    links.forEach(l=>{const c=l.confidence||0;if(c>=90)confBuckets["90-100%"]++;else if(c>=70)confBuckets["70-89%"]++;else if(c>=40)confBuckets["40-69%"]++;else confBuckets["< 40%"]++;});
    checkPage(10);
    pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text("Distribution de confiance",M,y);y+=6;
    pdf.setFont(undefined,"normal");pdf.setFontSize(9);
    const confColors={"90-100%":"#10b981","70-89%":"#3b82f6","40-69%":"#f59e0b","< 40%":"#ef4444"};
    Object.entries(confBuckets).forEach(([range,n])=>{
      checkPage(5);setF(confColors[range]);pdf.rect(M,y-3,3,3,"F");black();pdf.text(`${range} : ${n} lien${n>1?"s":""}`,M+6,y);y+=5;
    });

    // Compact entity table
    y+=8;checkPage(20);
    pdf.setFontSize(10);pdf.setFont(undefined,"bold");black();pdf.text("Synthese des entites",M,y);y+=6;
    // Table header
    pdf.setFillColor(30,40,55);pdf.rect(M,y-4,CW,6,"F");
    pdf.setFontSize(7);pdf.setTextColor(200,210,230);pdf.setFont(undefined,"bold");
    pdf.text("TYPE",M+2,y);pdf.text("LABEL",M+30,y);pdf.text("DESCRIPTION",M+85,y);pdf.text("LIENS",M+150,y);pdf.text("AUTEUR",M+163,y);y+=4;

    pdf.setFont(undefined,"normal");
    entities.forEach((ent,i)=>{
      checkPage(6);
      if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
      const cat=CATEGORIES.find(c=>c.id===ent.type);
      const info=ALL_ITEMS[ent.subtype]||{};
      const lc=links.filter(l=>l.from===ent.id||l.to===ent.id).length;
      pdf.setFontSize(7);
      muted();pdf.text((cat?.icon||"")+" "+(cat?.label||ent.type).slice(0,12),M+2,y);
      black();pdf.text((ent.label||"—").slice(0,28),M+30,y);
      muted();pdf.text((ent.description||info.desc||"—").slice(0,35),M+85,y);
      black();pdf.text(String(lc),M+153,y);
      muted();pdf.text((ent.author||"—").slice(0,12),M+163,y);
      y+=5;
    });
    addFooter(pageNum);

    // ═══ FICHES DETAILLEES PAR ENTITE ═══
    entities.forEach(ent=>{
      addPage();pageNum++;
      const cat=CATEGORIES.find(c=>c.id===ent.type);
      const info=ALL_ITEMS[ent.subtype]||{label:ent.label,desc:"",color:ent.color};
      const eColor=ent.color||info.color||"#6366f1";
      const inLinks=links.filter(l=>l.to===ent.id);
      const outLinks=links.filter(l=>l.from===ent.id);

      // Entity header bar
      const [cr,cg,cb]=setC(eColor);pdf.setFillColor(cr,cg,cb);pdf.rect(M,y,CW,10,"F");
      pdf.setFontSize(13);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
      pdf.text(`${cat?.icon||""} ${ent.label}`,M+3,y+7);
      pdf.setFontSize(8);pdf.text((cat?.label||ent.type)+" / "+(info.label||ent.subtype),M+CW-2,y+7,{align:"right"});
      y+=14;

      // Status + meta row
      pdf.setFontSize(9);pdf.setFont(undefined,"normal");
      const st=ent.metadata?.status||"unverified";
      const stLabel={confirmed:"Confirme",unverified:"A verifier",denied:"Infirme",archived:"Archive"}[st]||st;
      muted();pdf.text("Statut:",M,y);black();pdf.text(stLabel,M+20,y);
      muted();pdf.text("Auteur:",M+55,y);black();pdf.text(ent.author||"—",M+75,y);
      muted();pdf.text("Cree le:",M+110,y);black();pdf.text(fmtD(ent.createdAt),M+130,y);
      y+=7;

      // Description
      if(ent.description){
        checkPage(12);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text("Description",M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8.5);
        const dl=wrapText(ent.description,CW-4,8.5);
        dl.forEach(line=>{checkPage(4);gray(60);pdf.text(line,M+2,y);y+=4;});
        y+=3;
      }

      // Notes
      if(ent.notes){
        checkPage(12);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text("Notes",M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8.5);
        const nl=wrapText(ent.notes,CW-4,8.5);
        nl.forEach(line=>{checkPage(4);gray(60);pdf.text(line,M+2,y);y+=4;});
        y+=3;
      }

      // Metadata
      const meta=ent.metadata||{};
      const metaEntries=Object.entries(meta).filter(([k,v])=>v&&!["status","photo"].includes(k));
      if(metaEntries.length>0){
        checkPage(10);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();pdf.text("Metadata",M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8);
        metaEntries.forEach(([k,v])=>{
          checkPage(5);
          muted();pdf.text(k+":",M+2,y);black();pdf.text(String(v).slice(0,60),M+30,y);y+=4.5;
        });
        y+=3;
      }

      // Incoming links
      if(inLinks.length>0){
        checkPage(10);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
        pdf.text(`Liens entrants (${inLinks.length})`,M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8);
        inLinks.forEach(lk=>{
          checkPage(5);
          const fromEnt=entities.find(e=>e.id===lk.from);
          const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
          const conf=lk.confidence||0;
          const confCol=conf>=70?"#10b981":conf>=40?"#f59e0b":"#ef4444";
          setF(confCol);pdf.rect(M+2,y-2.5,2,2,"F");
          black();pdf.text(`${fromEnt?.label||"?"} → ${lt.label} → ${ent.label}`,M+6,y);
          muted();pdf.text(`${conf}%`,M+CW-10,y);
          if(lk.label){pdf.text(`(${lk.label})`,M+CW-30,y);}
          y+=4.5;
        });
        y+=3;
      }

      // Outgoing links
      if(outLinks.length>0){
        checkPage(10);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
        pdf.text(`Liens sortants (${outLinks.length})`,M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8);
        outLinks.forEach(lk=>{
          checkPage(5);
          const toEnt=entities.find(e=>e.id===lk.to);
          const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
          const conf=lk.confidence||0;
          const confCol=conf>=70?"#10b981":conf>=40?"#f59e0b":"#ef4444";
          setF(confCol);pdf.rect(M+2,y-2.5,2,2,"F");
          black();pdf.text(`${ent.label} → ${lt.label} → ${toEnt?.label||"?"}`,M+6,y);
          muted();pdf.text(`${conf}%`,M+CW-10,y);
          y+=4.5;
        });
        y+=3;
      }

      // Comments
      if(ent.comments?.length>0){
        checkPage(10);
        pdf.setFontSize(9);pdf.setFont(undefined,"bold");black();
        pdf.text(`Commentaires (${ent.comments.length})`,M,y);y+=5;
        pdf.setFont(undefined,"normal");pdf.setFontSize(8);
        ent.comments.forEach(c=>{
          checkPage(8);
          muted();pdf.text(`${c.author||"?"} — ${fmtD(c.date)}`,M+2,y);y+=4;
          black();const cl=wrapText(c.text,CW-8,8);
          cl.forEach(line=>{checkPage(4);pdf.text(line,M+4,y);y+=3.5;});
          y+=3;
        });
      }

      addFooter(pageNum);
    });

    // ═══ TABLEAU RECAPITULATIF DES LIENS ═══
    if(links.length>0){
      addPage();pageNum++;
      pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
      pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
      pdf.text(`TABLEAU DES LIENS (${links.length})`,M+3,y+6);y+=14;

      // Table header
      pdf.setFillColor(30,40,55);pdf.rect(M,y-4,CW,6,"F");
      pdf.setFontSize(7);pdf.setTextColor(200,210,230);pdf.setFont(undefined,"bold");
      pdf.text("DE",M+2,y);pdf.text("TYPE",M+50,y);pdf.text("VERS",M+90,y);pdf.text("CONF.",M+140,y);pdf.text("LABEL",M+155,y);y+=4;

      pdf.setFont(undefined,"normal");
      links.forEach((lk,i)=>{
        checkPage(6);
        if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
        const fromEnt=entities.find(e=>e.id===lk.from);
        const toEnt=entities.find(e=>e.id===lk.to);
        const lt=LINK_TYPES.find(t=>t.id===lk.type)||LINK_TYPES[0];
        const conf=lk.confidence||0;
        const confCol=conf>=70?"#10b981":conf>=40?"#f59e0b":"#ef4444";
        
        pdf.setFontSize(7);
        black();pdf.text((fromEnt?.label||"?").slice(0,25),M+2,y);
        muted();pdf.text((lt.icon+" "+lt.label).slice(0,20),M+50,y);
        black();pdf.text((toEnt?.label||"?").slice(0,25),M+90,y);
        setC(confCol);pdf.text(`${conf}%`,M+143,y);
        muted();pdf.text((lk.label||"").slice(0,15),M+155,y);
        y+=5;
      });
      addFooter(pageNum);
    }

    // ═══ TIMELINE ═══
    if(timeline.length>0){
      addPage();pageNum++;
      pdf.setFillColor(88,166,255);pdf.rect(M,y,CW,8,"F");
      pdf.setFontSize(12);pdf.setTextColor(255,255,255);pdf.setFont(undefined,"bold");
      pdf.text(`TIMELINE (${Math.min(timeline.length,80)} derniers evenements)`,M+3,y+6);y+=14;

      pdf.setFont(undefined,"normal");
      timeline.slice(0,80).forEach((ev,i)=>{
        checkPage(6);
        if(i%2===0){pdf.setFillColor(22,27,34);pdf.rect(M,y-3.5,CW,5,"F");}
        pdf.setFontSize(7);
        muted();pdf.text(fmtD(ev.timestamp),M+2,y);
        black();pdf.text((ev.action||"—").slice(0,60),M+40,y);
        muted();pdf.text((ev.user||"—").slice(0,15),M+CW-20,y);
        y+=5;
      });
      addFooter(pageNum);
    }

    // Save
    pdf.save(`${(caseInfo.title||"osintmapper").replace(/[^a-zA-Z0-9]/g,"_")}_${now.toISOString().slice(0,10)}.pdf`);
  },[entities,links,stickers,timeline,caseInfo,canvasRef]);

  // === OSINT INDUSTRIES IMPORT ===
  const handleOSINTFile = useCallback((e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        const targetGuess = f.name.replace(/^export_/, "").replace(/\.json$/, "");
        const { preview, foundModules } = parseOSINTExport(data, targetGuess);
        setOsintImport({ preview, foundModules, targetName: targetGuess });
      } catch (err) { alert("Erreur de parsing: " + err.message); }
    };
    r.readAsText(f);
    e.target.value = "";
  }, []);

  const confirmOSINTImport = useCallback(() => {
    if (!osintImport) return;
    const { foundModules, preview, targetName } = osintImport;
    const selectedNames = preview.platforms.filter(p => p.selected).map(p => p.name);

    // Find empty zone: offset to the right of existing entities
    const maxX = entities.length > 0 ? Math.max(...entities.map(e => e.x)) + 400 : 200;
    const originY = entities.length > 0 ? entities.reduce((s, e) => s + e.y, 0) / entities.length : 300;
    const origin = { x: maxX + 300, y: originY };

    const { entities: newEnts, links: newLinks } = genOSINTEntities(foundModules, selectedNames, targetName, origin);

    setEntities(prev => [...prev, ...newEnts]);
    setLinks(prev => [...prev, ...newLinks]);
    logAction(`Import OSINT Industries: ${newEnts.length} entités, ${newLinks.length} liens`);
    setOsintImport(null);
    setTimeout(fitView, 100);
  }, [osintImport, entities, logAction, fitView]);
  const importJSON=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.caseInfo)setCaseInfo(d.caseInfo);if(d.entities)setEntities(d.entities);if(d.links)setLinks(d.links);if(d.stickers)setStickers(d.stickers);if(d.postits)setPostits(d.postits);setCaseCreated(true);logAction("Projet importé");}catch{}};r.readAsText(f);};
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
    const hdrs = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const url = authToken ? `${serverUrl}/api/cases` : `${serverUrl}/rooms`;
    const f=()=>fetch(url, { headers: hdrs }).then(r=>r.json()).then(setActiveSessions).catch(()=>setActiveSessions([]));
    f(); const iv=setInterval(f,3000); return()=>clearInterval(iv);
  },[screen, authToken]);

  const myCases = useMemo(()=>activeSessions.filter(s=>s.id.startsWith("solo_"+lobbyName.replace(/\s+/g,"_")+"_")||s.userRole==="owner"),[activeSessions,lobbyName]);
  const collabSessions = useMemo(()=>activeSessions.filter(s=>!s.id.startsWith("solo_")),[activeSessions]);

  // Send caseInfo to server once connected
  useEffect(()=>{if(collab.connected&&caseCreated&&caseInfo.title)collab.sendCaseInfo(caseInfo);},[collab.connected,caseCreated]);

  const shellSt = {width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text,...noSelect};
  const cardSt = {background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,padding:48,width:560,maxWidth:"90vw",boxShadow:`0 24px 64px ${t.shadow}`,maxHeight:"90vh",overflowY:"auto"};
  const hdrBlock = <div style={{textAlign:"center",marginBottom:32}}><div style={{width:48,height:48,borderRadius:12,background:"#58a6ff",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>{I.bolt}</div><h1 style={{fontSize:22,fontWeight:700,margin:0}}>OSINT<span style={{color:t.accent}}>Mapper</span></h1><p style={{color:t.textSecondary,fontSize:13,marginTop:4}}>Plateforme OSINT collaborative <span style={{fontSize:10,color:t.textMuted}}>v0.2.1</span></p></div>;
  const themeBtn = <div style={{textAlign:"center",marginTop:20}}><button onClick={()=>setTheme(theme==="dark"?"light":"dark")} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:12,display:"inline-flex",alignItems:"center",gap:6}}>{theme==="dark"?I.sun:I.moon} {theme==="dark"?"Mode clair":"Mode sombre"}</button></div>;

  // ── SCREEN: LOGIN ──
  // Kicked screen
  if(collab.kicked){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:"1px solid #ef4444",borderRadius:16,padding:48,width:400,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{fontSize:48,marginBottom:16}}>🚫</div>
        <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 8px"}}>Expulsé</h2>
        <p style={{color:t.textMuted,fontSize:13}}>L'administrateur vous a retiré de la salle.</p>
        <button onClick={()=>{clearSession();window.location.reload();}} style={{marginTop:20,padding:"10px 24px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Retour au menu</button>
      </div>
    </div>
  );}


  // Waiting for approval (collab join pending)
  if(collab.joinStatus==="pending"){return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text}}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,padding:48,width:400,textAlign:"center",boxShadow:`0 24px 64px ${t.shadow}`}}>
        <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${t.accent}`,borderTopColor:"transparent",margin:"0 auto 20px",animation:"spin 1s linear infinite"}}/>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 8px"}}>En attente d'approbation</h2>
        <p style={{color:t.textMuted,fontSize:13}}>L'administrateur de la salle doit accepter votre demande.</p>
        <p style={{color:t.textMuted,fontSize:11,marginTop:12}}>Salle : <b>{activeRoom}</b></p>
        <button onClick={()=>{clearSession();}} style={{marginTop:20,padding:"8px 20px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.textMuted,fontSize:12,cursor:"pointer"}}>Annuler</button>
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
        <button onClick={()=>{clearSession();}} style={{marginTop:20,padding:"10px 24px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Retour</button>
      </div>
    </div>
  );}

  return(
    <div style={{width:"100vw",height:"100vh",background:t.bg,display:"flex",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:t.text,overflow:"hidden",...noSelect}} onClick={()=>{setCtxMenu(null);setShowCollabDropdown(false);setLayoutMenuOpen(false);}}>

      {/* Admin disconnected banner */}
      {ownerBannerVisible&&lobbyMode==="collab"&&<div style={{position:"fixed",top:16,right:16,zIndex:100,background:"#f59e0b",color:"#000",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.3)",maxWidth:400}}>
        <span>⚠️ L'administrateur a quitté la salle</span>
        <span style={{fontSize:11,fontWeight:400}}>— Le graphe reste accessible</span>
        <button onClick={()=>setOwnerBannerVisible(false)} style={{background:"none",border:"none",color:"#000",cursor:"pointer",fontSize:16,fontWeight:700,marginLeft:8,opacity:0.6}}>×</button>
      </div>}

      {/* LEFT PANEL */}
      <div style={{width:leftCollapsed?48:280,minWidth:leftCollapsed?48:280,height:"100vh",background:t.surface,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",transition:"all 0.25s",overflow:"hidden",zIndex:10}}>
        <div style={{padding:leftCollapsed?"14px 8px":"14px 16px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:leftCollapsed?"center":"space-between",minHeight:56}}>
          {!leftCollapsed&&<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:8,background:"#58a6ff",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.bolt}</div><div><div style={{fontSize:14,fontWeight:700}}>OSINT<span style={{color:t.accent}}>Mapper</span> <span style={{fontSize:9,color:t.textMuted,fontWeight:400}}>v0.2.1</span></div><div style={{fontSize:10,color:t.textMuted}}>{caseInfo.title}{isViewer&&<span style={{marginLeft:6,padding:"1px 6px",borderRadius:4,background:"#f59e0b20",color:"#f59e0b",fontSize:9,fontWeight:700}}>👁️ LECTURE SEULE</span>}</div><div style={{fontSize:10,color:saveStatus==="error"?"#ef4444":saveStatus==="saving"?"#f59e0b":saveStatus==="saved"?"#10b981":collab.connected?"#10b981":t.textMuted,display:"flex",alignItems:"center",gap:4,marginTop:2}}>{saveStatus==="saving"?<><svg width="10" height="10" viewBox="0 0 24 24" style={{animation:"spin 1s linear infinite"}}><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" strokeLinecap="round"/></svg> Sauvegarde...</>:saveStatus==="saved"?<><div style={{width:5,height:5,borderRadius:3,background:"#10b981"}}/>✓ Sauvegardé</>:saveStatus==="error"?<><div style={{width:5,height:5,borderRadius:3,background:"#ef4444"}}/>⚠ Erreur de sauvegarde</>:<><div style={{width:5,height:5,borderRadius:3,background:collab.connected?"#10b981":"#ef4444"}}/>{collab.connected?(lobbyMode==="collab"?`Salle: ${lobbyRoom}`:"Connecté"):activeRoom?"Sauvegarde auto":"Déconnecté"}</>}{lobbyMode==="collab"&&collabList.length>0&&` · ${collabList.length} autre${collabList.length>1?"s":""}`}</div></div></div>}
          <button onClick={()=>setLeftCollapsed(!leftCollapsed)} style={sBtn(t)}>{leftCollapsed?"→":"←"}</button>
        </div>
        {!leftCollapsed&&<>
          {!isViewer ? <>
          <div style={{padding:"14px 16px 6px",display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:t.textMuted}}><span style={{color:t.accent}}>{I.bolt}</span> Blocs</div>
          <div style={{padding:"6px 16px 10px"}}><div style={{display:"flex",alignItems:"center",gap:8,background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px"}}><span style={{color:t.textMuted}}>{I.search}</span><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Rechercher..." style={{background:"none",border:"none",color:t.text,fontSize:13,outline:"none",width:"100%",fontFamily:"inherit"}}/></div></div>
          <div style={{flex:1,overflowY:"auto",padding:"0 10px 16px"}}>
            {(favItems.length>0||recentItems.length>0)&&<div style={{marginBottom:6}}>
              {recentItems.length>0&&<><button onClick={()=>toggleCat("_recent")} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}}>{I.chev(openCats.has("_recent"))}<span>🕐</span><span>Récents</span><span style={{marginLeft:"auto",fontSize:11,color:"#f59e0b",background:"#f59e0b18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{recentItems.length}</span></button>
              {openCats.has("_recent")&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{recentItems.map(it=><div key={it.id} draggable onDragStart={e=>e.dataTransfer.setData("subItemId",it.id)} onClick={()=>addEntity(it.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",fontSize:12,color:t.text}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{width:8,height:8,borderRadius:4,background:it.color,flexShrink:0}}/><span style={{flex:1}}>{it.label}</span><span style={{fontSize:10,color:t.textMuted,background:t.surfaceAlt,padding:"1px 6px",borderRadius:8}}>×{it.count}</span></div>)}</div>}</>}
              {favItems.length>0&&<><button onClick={()=>toggleCat("_fav")} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}}>{I.chev(openCats.has("_fav"))}<span>⭐</span><span>Favoris</span><span style={{marginLeft:"auto",fontSize:11,color:t.accent,background:t.accent+"18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{favItems.length}</span></button>
              {openCats.has("_fav")&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{favItems.map(it=><SidebarItem key={it.id} item={it} t={t} fav={true} onAdd={()=>addEntity(it.id)} onToggleFav={()=>toggleFav(it.id)} onDragStart={e=>e.dataTransfer.setData("subItemId",it.id)}/>)}</div>}</>}
            </div>}
            {filteredCats.map(cat=><div key={cat.id} style={{marginBottom:2}}>
              <button onClick={()=>toggleCat(cat.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 6px",background:"none",border:"none",cursor:"pointer",color:t.text,fontSize:13,fontWeight:600,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=t.catHover} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                {I.chev(openCats.has(cat.id))}<span>{cat.icon}</span><span style={{flex:1,textAlign:"left"}}>{cat.label}</span><span style={{fontSize:11,color:t.accent,background:t.accent+"18",padding:"1px 8px",borderRadius:10,fontWeight:700}}>{cat.items.length}</span>
              </button>
              {openCats.has(cat.id)&&<div style={{display:"flex",flexDirection:"column",gap:2,paddingLeft:4,marginTop:2}}>{cat.items.map(item=><SidebarItem key={item.id} item={item} t={t} fav={favorites.has(item.id)} onAdd={()=>addEntity(item.id)} onToggleFav={()=>toggleFav(item.id)} onDragStart={e=>e.dataTransfer.setData("subItemId",item.id)}/>)}</div>}
            </div>)}
          </div>
          </> : <>
            {/* Viewer mode — read-only sidebar */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,gap:12}}>
              <span style={{fontSize:40}}>👁️</span>
              <div style={{fontSize:14,fontWeight:700,color:"#f59e0b",textAlign:"center"}}>Mode lecture seule</div>
              <div style={{fontSize:11,color:t.textMuted,textAlign:"center",lineHeight:1.6}}>Vous ne pouvez pas modifier ce graphe. Demandez à l'administrateur de passer votre rôle en éditeur.</div>
              <div style={{marginTop:8,fontSize:11,color:t.textSecondary}}>◆ {entities.length} entités · ⟶ {links.length} liens</div>
            </div>
          </>}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:16,fontSize:11,color:t.textSecondary}}>
            <span>◆ {entities.length}</span><span>⟶ {links.length}</span><span>📌 {stickers.length+postits.length}</span>
            {authUser&&<span style={{fontSize:10,color:t.textMuted,display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}><span style={{width:6,height:6,borderRadius:3,background:authUser.role==="admin"?"#f59e0b":authUser.role==="analyst"?"#10b981":"#6366f1"}}/>{authUser.displayName||authUser.username} ({authUser.role})</span>}
            <button onClick={()=>{if(confirm("Quitter l'enquête ?")){if(onQuit)onQuit();}}} style={{padding:"3px 10px",background:"none",border:`1px solid ${t.border}`,borderRadius:6,color:t.textMuted,cursor:"pointer",fontSize:10,...(authUser?{}:{marginLeft:"auto"})}} title="Retour au menu">⏏ Quitter</button>
          </div>
        </>}
      </div>

      {/* CANVAS */}
      <div ref={canvasWrapRef} style={{flex:1,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:12,left:12,right:12,display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:5,pointerEvents:"none"}}>
          <div style={{display:"flex",gap:4,pointerEvents:"all",background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:3,boxShadow:`0 4px 12px ${t.shadow}`}}>
            <button onClick={zoomIn} style={tb(t)}>{I.zoomIn}</button><span style={{fontSize:11,color:t.textSecondary,padding:"0 6px",display:"flex",alignItems:"center",fontWeight:600}}>{Math.round(zoom*100)}%</span><button onClick={zoomOut} style={tb(t)}>{I.zoomOut}</button><div style={{width:1,background:t.border,margin:"4px 1px"}}/><button onClick={fitView} style={tb(t)}>{I.fit}</button><div style={{width:1,background:t.border,margin:"4px 1px"}}/><button onClick={()=>setShowGrid(!showGrid)} style={{...tb(t),color:showGrid?t.accent:t.textMuted}} title={showGrid?"Masquer la grille":"Afficher la grille"}>{I.grid}</button>
          </div>
          <div style={{display:"flex",gap:6,pointerEvents:"all"}}>
            <div style={{position:"relative"}}><button onClick={e=>{e.stopPropagation();setShowCollabDropdown(!showCollabDropdown);}} style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 12px",gap:8,boxShadow:`0 4px 12px ${t.shadow}`,display:"flex",alignItems:"center"}}>{I.users}<span style={{fontSize:12}}>{collabList.length+(screen==="graph"?1:0)}</span>{collab.connected&&<div style={{width:6,height:6,borderRadius:3,background:"#10b981"}}/>}{collabList.length>0&&<div style={{display:"flex",marginLeft:2}}>{collabList.slice(0,5).map(c=><div key={c.id} style={{width:20,height:20,borderRadius:"50%",background:c.color,border:`2px solid ${t.surface}`,marginLeft:-5,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700}}>{c.name?.[0]}</div>)}</div>}</button>
              {showCollabDropdown&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",right:0,marginTop:6,background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:8,boxShadow:`0 8px 24px ${t.shadow}`,width:240,zIndex:20}}>
                <div style={{padding:"6px 10px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,borderBottom:`1px solid ${t.border}`,marginBottom:4}}>Collaborateurs ({collabList.length+1})</div>
                {/* Self */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,background:t.surfaceAlt}}>
                  <div style={{width:28,height:28,borderRadius:14,background:collab.userColor||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{lobbyName?.[0]?.toUpperCase()}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:t.text}}>{lobbyName} <span style={{fontSize:10,color:t.textMuted}}>(vous)</span></div><div style={{fontSize:10,color:"#10b981",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:3,background:"#10b981"}}/>En ligne</div></div>
                </div>
                {/* Others */}
                {collabList.map(c=>{const role=collab.collabRoles?.[c.id]||'viewer';return<div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,marginTop:2}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{width:28,height:28,borderRadius:14,background:c.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{c.name?.[0]?.toUpperCase()}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:t.text}}>{c.name}</div><div style={{fontSize:10,color:role==='editor'?'#10b981':'#f59e0b',display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:3,background:role==='editor'?'#10b981':'#f59e0b'}}/>{role==='editor'?'Éditeur':'Lecteur'}</div></div>
                  {collab.isOwner&&<button onClick={e=>{e.stopPropagation();collab.setUserRole(c.id,role==='editor'?'viewer':'editor');}} style={{padding:"3px 6px",background:role==='editor'?'#f59e0b20':'#10b98120',border:`1px solid ${role==='editor'?'#f59e0b40':'#10b98140'}`,borderRadius:4,color:role==='editor'?'#f59e0b':'#10b981',cursor:"pointer",fontSize:12}} title={role==='editor'?'Passer en lecteur':'Passer en éditeur'}>{role==='editor'?'👁️':'✏️'}</button>}
                  {collab.isOwner&&<button onClick={e=>{e.stopPropagation();if(confirm(`Expulser ${c.name} ?`))collab.kickUser(c.id);}} style={{padding:"3px 6px",background:"#ef444420",border:"1px solid #ef444440",borderRadius:4,color:"#ef4444",cursor:"pointer",fontSize:10}} title="Expulser">✕</button>}
                </div>})}
                {collabList.length===0&&lobbyMode==="collab"&&<div style={{padding:"12px 10px",fontSize:11,color:t.textMuted,textAlign:"center"}}>Personne d'autre dans la salle<br/><span style={{fontSize:10}}>Code : <b>{lobbyRoom}</b></span></div>}
                {lobbyMode==="solo"&&<div style={{padding:"12px 10px",fontSize:11,color:t.textMuted,textAlign:"center"}}>Mode solo — pas de collaboration</div>}
                <div style={{borderTop:`1px solid ${t.border}`,marginTop:4,paddingTop:6,display:"flex",gap:6}}>
                  <button onClick={()=>{setShowCollaborators(!showCollaborators);setShowCollabDropdown(false);}} style={{flex:1,padding:"6px 10px",background:showCollaborators?t.accent+"20":t.surfaceAlt,border:`1px solid ${showCollaborators?t.accent:t.border}`,borderRadius:6,color:t.text,cursor:"pointer",fontSize:11}}>{showCollaborators?"🙈 Masquer curseurs":"👁️ Afficher curseurs"}</button>
                </div>
              </div>}
            </div>
            <button onClick={()=>{setShowInviteModal(true);setInviteCopied(false);}} style={{...tb(t),background:"linear-gradient(135deg,#6366f1,#58a6ff)",border:"none",borderRadius:10,padding:"6px 14px",display:"flex",alignItems:"center",gap:6,boxShadow:"0 4px 12px rgba(88,166,255,0.2)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>📨 Inviter</button>
            <button onClick={()=>setShowTimeline(!showTimeline)} style={{...tb(t),background:showTimeline?t.accent:t.surface,color:showTimeline?"#fff":t.text,border:`1px solid ${showTimeline?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}>{I.clock}<span style={{fontSize:12}}>Timeline</span></button>
            {lobbyMode==="collab"&&<button onClick={()=>{setShowChat(!showChat);setTimeout(()=>chatEndRef.current?.scrollIntoView(),50);}} style={{...tb(t),background:showChat?t.accent:t.surface,color:showChat?"#fff":t.text,border:`1px solid ${showChat?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span style={{fontSize:12}}>Chat</span>{collab.chatMessages.length>0&&<span style={{fontSize:10,background:"#ef4444",color:"#fff",borderRadius:8,padding:"0 5px",fontWeight:700}}>{collab.chatMessages.length}</span>}</button>}
            {!isViewer&&<>{/* Whiteboard disabled for production */}
            {<div style={{position:"relative"}}><button onClick={e=>{e.stopPropagation();setLayoutMenuOpen(!layoutMenuOpen);}} style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}><span style={{fontSize:14}}>🔀</span><span style={{fontSize:12}}>Arranger</span></button>
              {layoutMenuOpen&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:"100%",left:0,marginBottom:6,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:8,boxShadow:`0 8px 24px ${t.shadow}`,width:220,zIndex:20}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:t.textMuted,padding:"4px 8px",marginBottom:4}}>Réarranger le graphe</div>
                <button onClick={()=>{autoLayout(null);setLayoutMenuOpen(false);}} style={{width:"100%",padding:"8px 10px",background:"none",border:"none",color:t.text,fontSize:12,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="none"}>🔀 Auto-layout (force)</button>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:t.textMuted,padding:"8px 8px 4px",borderTop:`1px solid ${t.border}`,marginTop:4}}>Centrer sur une cible</div>
                <div style={{maxHeight:150,overflowY:"auto"}}>{entities.map(ent=><button key={ent.id} onClick={()=>{autoLayout(ent.id);setLayoutMenuOpen(false);}} style={{width:"100%",padding:"6px 10px",background:"none",border:"none",color:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="none"}><div style={{width:8,height:8,borderRadius:4,background:ent.color,flexShrink:0}}/>{ent.label}</button>)}</div>
              </div>}
            </div>}
            {/* FILTER */}
            {<div style={{position:"relative"}}><button onClick={()=>{if(filterTypes){setFilterTypes(null);}else{setFilterTypes(new Set(CATEGORIES.map(c=>c.id)));}}} style={{...tb(t),background:filterTypes?t.accent:t.surface,color:filterTypes?"#fff":t.text,border:`1px solid ${filterTypes?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}><span style={{fontSize:14}}>🔍</span><span style={{fontSize:12}}>Filtres</span></button>
              {filterTypes&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:"100%",left:0,marginBottom:6,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:8,boxShadow:`0 8px 24px ${t.shadow}`,width:200,zIndex:20,maxHeight:300,overflowY:"auto"}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:t.textMuted,padding:"4px 8px",marginBottom:4}}>Types affichés</div>
                {CATEGORIES.map(cat=>{const count=entities.filter(e=>e.type===cat.id).length;if(count===0)return null;return<label key={cat.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                  <input type="checkbox" checked={filterTypes.has(cat.id)} onChange={()=>{const nf=new Set(filterTypes);if(nf.has(cat.id))nf.delete(cat.id);else nf.add(cat.id);setFilterTypes(nf);}}/>
                  <span>{cat.icon}</span><span style={{flex:1}}>{cat.label}</span><span style={{fontSize:10,color:t.textMuted}}>{count}</span>
                </label>;})}
                <div style={{borderTop:`1px solid ${t.border}`,marginTop:4,paddingTop:4,display:"flex",gap:4}}>
                  <button onClick={()=>setFilterTypes(new Set(CATEGORIES.map(c=>c.id)))} style={{flex:1,padding:"4px",background:"none",border:`1px solid ${t.border}`,borderRadius:4,color:t.text,cursor:"pointer",fontSize:10}}>Tout</button>
                  <button onClick={()=>setFilterTypes(new Set())} style={{flex:1,padding:"4px",background:"none",border:`1px solid ${t.border}`,borderRadius:4,color:t.text,cursor:"pointer",fontSize:10}}>Rien</button>
                  <button onClick={()=>setFilterTypes(null)} style={{flex:1,padding:"4px",background:t.accent,border:"none",borderRadius:4,color:"#fff",cursor:"pointer",fontSize:10}}>Fermer</button>
                </div>
              </div>}
            </div>}
            {/* ANONYMIZE */}
            {<button onClick={()=>setShowLabels(!showLabels)} style={{...tb(t),background:!showLabels?t.accent:t.surface,color:!showLabels?"#fff":t.text,border:`1px solid ${!showLabels?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}><span style={{fontSize:14}}>🔒</span><span style={{fontSize:12}}>{showLabels?"Anonymiser":"Visible"}</span></button>}
            {/* RESET */}
            <button onClick={()=>{if(confirm("⚠️ ATTENTION ⚠️\n\nCette action va supprimer TOUTES les entités, liens, stickers et post-its du graphe.\n\nCette action est IRRÉVERSIBLE.\n\nVoulez-vous vraiment tout effacer ?")){setEntities([]);setLinks([]);setStickers([]);setPostits([]);logAction("Graphe réinitialisé");}}} style={{...tb(t),background:t.surface,border:`1px solid #ef444440`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`,color:"#ef4444"}}><span style={{fontSize:14}}>🗑️</span><span style={{fontSize:12}}>Reset</span></button>
            {/* PLUGINS */}
            <button onClick={()=>setShowPlugins(true)} style={{...tb(t),background:t.accent+"20",border:`1px solid ${t.accent}40`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`,color:t.accent}}><span style={{fontSize:14}}>🧩</span><span style={{fontSize:12}}>Plugins</span></button>

            {/* Dynamic plugin toolbar buttons */}
            {pluginEngine.getByHook('toolbar-button').map(pl=>(
              <button key={pl.id} onClick={()=>setActivePlugin(prev=>prev===pl.id?null:pl.id)} style={{...tb(t),background:activePlugin===pl.id?t.accent:t.surface,color:activePlugin===pl.id?"#fff":t.text,border:`1px solid ${activePlugin===pl.id?t.accent:t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}>
                <span style={{fontSize:14}}>{pl.hookConfig.icon||pl.manifest.icon}</span>
                <span style={{fontSize:12}}>{pl.hookConfig.label||pl.manifest.name}</span>
              </button>
            ))}

            {<label style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`,cursor:"pointer"}}><span style={{fontSize:14}}>🔎</span><span style={{fontSize:12}}>OSINT</span><input type="file" accept=".json" onChange={handleOSINTFile} style={{display:"none"}}/></label>}
            </>}
            <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 10px",boxShadow:`0 4px 12px ${t.shadow}`}}>{theme==="dark"?I.sun:I.moon}</button>
            {isViewer&&<div style={{background:"#f59e0b20",border:"1px solid #f59e0b40",borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12}}>👁️</span><span style={{fontSize:11,fontWeight:700,color:"#f59e0b"}}>Lecture seule</span></div>}
            <div style={{position:"relative"}}><button onClick={()=>setShowExport(!showExport)} style={{...tb(t),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 12px ${t.shadow}`}}>{I.download}<span style={{fontSize:12}}>Export</span></button>
              {showExport&&<div style={{position:"absolute",top:"100%",right:0,marginTop:6,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,boxShadow:`0 8px 24px ${t.shadow}`,width:200,zIndex:20}}>{[{l:"📄 PDF (rapport complet)",fn:exportPDF},{l:"📦 JSON (données brutes)",fn:exportJSON}].map(it=><button key={it.l} onClick={()=>{it.fn();setShowExport(false);}} style={{width:"100%",padding:"8px 12px",background:"none",border:"none",color:t.text,fontSize:12,cursor:"pointer",borderRadius:6,textAlign:"left"}} onMouseEnter={e=>e.target.style.background=t.surfaceAlt} onMouseLeave={e=>e.target.style.background="none"}>{it.l}</button>)}</div>}
            </div>
          </div>
        </div>

        {(holdActive||linkingFrom)&&<div style={{position:"absolute",bottom:100,left:"50%",transform:"translateX(-50%)",background:t.accent,color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,fontWeight:600,boxShadow:`0 4px 16px ${t.accent}60`,zIndex:15,display:"flex",alignItems:"center",gap:8}}>{I.link} Relâchez sur une entité cible<button onClick={()=>{setLinkingFrom(null);setLinkMousePos(null);setHoldActive(false);}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:12}}>Annuler</button></div>}

        {/* Join Notifications (for room owner — user auto-joined as viewer) */}
        {collab.joinRequests.length>0&&<div style={{position:"absolute",top:60,right:16,zIndex:20,display:"flex",flexDirection:"column",gap:8}}>
          {collab.joinRequests.map(jr=><div key={jr.user.id} style={{background:t.surface,border:`1px solid ${t.accent}`,borderRadius:12,padding:14,boxShadow:`0 8px 24px ${t.shadow}`,width:300,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:18,background:jr.user.color||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:700}}>{jr.user.name?.[0]?.toUpperCase()}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:t.text}}>{jr.user.name}</div>
              <div style={{fontSize:11,color:t.textMuted}}>a rejoint en <span style={{color:'#f59e0b',fontWeight:600}}>lecture seule</span></div>
            </div>
            <button onClick={()=>{collab.setUserRole(jr.user.id,'editor');collab.dismissJoinNotif(jr.user.id);}} style={{padding:"5px 8px",background:"#10b98120",border:"1px solid #10b98140",borderRadius:6,color:"#10b981",fontSize:11,fontWeight:600,cursor:"pointer"}} title="Passer en éditeur">✏️</button>
            <button onClick={()=>collab.dismissJoinNotif(jr.user.id)} style={{padding:"5px 8px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.textMuted,fontSize:11,cursor:"pointer"}} title="Fermer">✕</button>
          </div>)}
        </div>}
        {stampSticker&&<div style={{position:"absolute",top:60,left:"50%",transform:"translateX(-50%)",background:t.accent,color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,fontWeight:600,boxShadow:`0 4px 16px ${t.accent}60`,zIndex:15,display:"flex",alignItems:"center",gap:8}}>🖱️ Mode tampon : {stampSticker.emoji} {stampSticker.label} — Cliquez pour placer<button onClick={()=>setStampSticker(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:12}}>Echap</button></div>}
        {entities.length>0&&<div style={{position:"absolute",bottom:12,right:rightPanelOpen?336:16,fontSize:10,color:t.textMuted,zIndex:5,pointerEvents:"none",textAlign:"right"}}>Scroll = zoom · Drag = déplacer · Maintenir / Shift+Drag = lien · Double-clic = renommer</div>}

        <div ref={canvasRef} onMouseDown={handleCanvasDown} onMouseMove={e=>{handlePointerMove(e);broadcastCursor(e);}} onMouseUp={handlePointerUp} onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onContextMenu={e=>{if(e.target===canvasRef.current||e.target.tagName==="svg"||e.target.classList?.contains("canvas-bg")||e.target.tagName==="rect"||e.target.tagName==="line"){e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,canvas:true,canvasPos:screenToCanvas(e.clientX,e.clientY)});}}} style={{width:"100%",height:"100%",background:t.canvasBg,cursor:stampSticker?"copy":isPanning?"grabbing":holdActive?"crosshair":"default"}}>
          <svg ref={svgRef} width="100%" height="100%" style={{position:"absolute",top:0,left:0}}>
            <defs><pattern id="grid" width={20*zoom} height={20*zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x%(20*zoom)},${pan.y%(20*zoom)})`}><circle cx={1} cy={1} r={0.6} fill={t.canvasGrid}/></pattern><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 1 1 L 9 4 L 1 7" fill="none" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/></marker><marker id="arrowRev" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse"><path d="M 9 1 L 1 4 L 9 7" fill="none" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/></marker></defs>
            <rect className="canvas-bg" width="100%" height="100%" fill={showGrid?"url(#grid)":t.canvasBg}/>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {links.map(lk=>{const getNode=(id)=>{if(id?.startsWith("postit_")){const p=postits.find(pt=>pt.id===id.slice(7));return p?{x:p.x+p.w/2,y:p.y+p.h/2,hw:p.w/2,hh:p.h/2}:null;}const e=entities.find(en=>en.id===id);return e?{x:e.x+ENT_HW,y:e.y+ENT_HH,hw:ENT_HW,hh:ENT_HH}:null;};const fn=getNode(lk.from),tn=getNode(lk.to);if(!fn||!tn)return null;const p1=getEdge(fn,tn,fn.hw,fn.hh),p2=getEdge(tn,fn,tn.hw,tn.hh);const isSel=lk.id===selectedLinkId;const lt=LINK_TYPES.find(l=>l.id===lk.type)||LINK_TYPES[0];const conf=lk.confidence||0;const cColor=conf>=70?"#10b981":conf>=40?"#f59e0b":"#ef4444";const cWidth=conf>=70?2.2:conf>=40?1.5:conf>=20?1:0.7;const cDash=conf>=40?"":conf>=20?"6 4":"4 4";const cOp=conf>=70?0.9:conf>=40?0.7:conf>=20?0.5:0.35;const bz=bezierLink(p1.x,p1.y,p2.x,p2.y);const lColor=isSel?t.accent:cColor;return<g key={lk.id} opacity={isSel?1:cOp}><path d={bz.path} fill="none" stroke="transparent" strokeWidth={14} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelectedLinkId(lk.id);setSelectedId(null);setRightPanelOpen(true);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,linkId:lk.id});}}/><path d={bz.path} fill="none" stroke={lColor} strokeWidth={isSel?2.5:cWidth} strokeDasharray={isSel?"":cDash} strokeLinecap="round" markerEnd="url(#arrow)" markerStart={lk.bidirectional?"url(#arrowRev)":undefined}/><g style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelectedLinkId(lk.id);setSelectedId(null);setRightPanelOpen(true);}}><rect x={bz.mx-44} y={bz.my-10} width={88} height={20} rx={6} fill={t.surface} fillOpacity={0.95} stroke={isSel?t.accent:t.border} strokeWidth={0.5}/><text x={bz.mx-18} y={bz.my+3.5} textAnchor="middle" fontSize={8.5} fill={isSel?t.accent:t.textSecondary} fontFamily="inherit">{lt.icon||"🔗"} {lk.label||lt.label}</text><rect x={bz.mx+22} y={bz.my-7} width={18} height={14} rx={4} fill={cColor+"20"}/><text x={bz.mx+31} y={bz.my+3} textAnchor="middle" fontSize={7} fill={cColor} fontWeight={700} fontFamily="inherit">{conf}</text></g>{lk.comments?.length>0&&<><circle cx={bz.mx-48} cy={bz.my} r={6} fill={t.accent} opacity={0.8}/><text x={bz.mx-48} y={bz.my+3} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={700} fontFamily="inherit">{lk.comments.length}</text></>}</g>;})}
              {linkingFrom&&linkMousePos&&(()=>{let fc;if(linkingFrom.startsWith("postit_")){const p=postits.find(pt=>pt.id===linkingFrom.slice(7));if(!p)return null;fc={x:p.x+p.w/2,y:p.y+p.h/2};}else{const fe=entities.find(e=>e.id===linkingFrom);if(!fe)return null;fc=getCenter(fe);}return<line x1={fc.x} y1={fc.y} x2={linkMousePos.x} y2={linkMousePos.y} stroke={t.accent} strokeWidth={2} strokeDasharray="6 4" opacity={0.7}/>;})()}
              {selectionBox&&<rect x={Math.min(selectionBox.x1,selectionBox.x2)} y={Math.min(selectionBox.y1,selectionBox.y2)} width={Math.abs(selectionBox.x2-selectionBox.x1)} height={Math.abs(selectionBox.y2-selectionBox.y1)} fill={t.accent+"15"} stroke={t.accent} strokeWidth={1} strokeDasharray="6 3" rx={4}/>}
              {entities.filter(ent=>!filterTypes||filterTypes.has(ent.type)).map(ent=>{const info=ALL_ITEMS[ent.subtype]||{label:ent.label,desc:"",color:ent.color};const eColor=ent.color||info.color;const isSel=ent.id===selectedId||multiSelection.includes(ent.id);const lc=linkCount[ent.id]||0;const remoteUser=collabList.find(c=>c.selection===ent.id);const lockInfo=collab.isLockedByOther?.(ent.id);const st=STATUS_DOT[ent.metadata?.status]||STATUS_DOT.unverified;const hasPhoto=ent.metadata?.photo;const catIcon=CATEGORIES.find(c=>c.id===ent.type)?.icon||"";const desc=ent.description||info.desc||"";const timeStr=ent.createdAt?new Date(ent.createdAt).toLocaleTimeString("fr",{hour:"2-digit",minute:"2-digit"}):"";return<g key={ent.id} onMouseDown={e=>handleEntityPointerDown(e,ent.id)} onDoubleClick={e=>{e.stopPropagation();if(isViewer||lockInfo)return;setEditingLabel(ent.id);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();if(!isViewer)setCtxMenu({x:e.clientX,y:e.clientY,entityId:ent.id});}} style={{cursor:isViewer?"default":lockInfo?"not-allowed":dragging===ent.id?"grabbing":"grab"}}>
                {/* Collab lock overlay */}
                {lockInfo&&<><rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={14} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" opacity={0.7}/><rect x={ent.x+ENT_W-40} y={ent.y-14} width={Math.max(40,(lockInfo.userName?.length||3)*6+20)} height={16} rx={4} fill="#ef4444"/><text x={ent.x+ENT_W-35} y={ent.y-2} fontSize={8} fill="#fff" fontWeight={600} fontFamily="inherit">🔒 {lockInfo.userName}</text></>}
                {/* Collab remote selection */}
                {remoteUser&&!lockInfo&&<><rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={14} fill="none" stroke={remoteUser.color} strokeWidth={2} strokeDasharray="4 2" opacity={0.8}/><rect x={ent.x+ENT_W-10} y={ent.y-12} width={Math.max(30,remoteUser.name?.length*6)} height={14} rx={4} fill={remoteUser.color}/><text x={ent.x+ENT_W-7} y={ent.y-2} fontSize={8} fill="#fff" fontWeight={600} fontFamily="inherit">{remoteUser.name}</text></>}
                {/* Selection glow */}
                {isSel&&<rect x={ent.x-3} y={ent.y-3} width={ENT_W+6} height={ENT_H+6} rx={15} fill="none" stroke={eColor} strokeWidth={1.5} opacity={0.4}/>}
                {/* Shadow */}
                <rect x={ent.x+2} y={ent.y+3} width={ENT_W} height={ENT_H} rx={12} fill="#000" opacity={0.12}/>
                {/* Card bg */}
                <rect x={ent.x} y={ent.y} width={ENT_W} height={ENT_H} rx={12} fill={t.itemBg} stroke={isSel?eColor:t.itemBorder} strokeWidth={isSel?1.5:1}/>
                {/* Left color band */}
                <clipPath id={`ec-${ent.id}`}><rect x={ent.x} y={ent.y} width={ENT_W} height={ENT_H} rx={12}/></clipPath>
                <rect x={ent.x} y={ent.y} width={5} height={ENT_H} fill={eColor} clipPath={`url(#ec-${ent.id})`}/>
                {/* === LINE 1: Icon/Photo + Label + Status === */}
                {hasPhoto?(<><clipPath id={`ph-${ent.id}`}><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7}/></clipPath><image href={ent.metadata.photo} x={ent.x+14} y={ent.y+10} width={24} height={24} clipPath={`url(#ph-${ent.id})`} preserveAspectRatio="xMidYMid slice"/><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7} fill="none" stroke={eColor+"40"} strokeWidth={1}/></>):(<><rect x={ent.x+14} y={ent.y+10} width={24} height={24} rx={7} fill={eColor+"18"} stroke={eColor+"30"} strokeWidth={0.8}/><text x={ent.x+26} y={ent.y+27} textAnchor="middle" fontSize={13} fontFamily="inherit">{catIcon}</text></>)}
                {editingLabel===ent.id?(<foreignObject x={ent.x+46} y={ent.y+11} width={ENT_W-84} height={22}><input autoFocus defaultValue={ent.label} onBlur={e=>{renameEntity(ent.id,e.target.value);setEditingLabel(null);}} onKeyDown={e=>{if(e.key==="Enter"){renameEntity(ent.id,e.target.value);setEditingLabel(null);}if(e.key==="Escape")setEditingLabel(null);}} style={{width:"100%",background:t.surfaceAlt,border:`1px solid ${t.accent}`,borderRadius:4,color:t.text,fontSize:12,padding:"2px 4px",outline:"none",fontFamily:"inherit",userSelect:"text"}}/></foreignObject>):(<text x={ent.x+46} y={ent.y+26} fontSize={12.5} fontWeight={700} fill={t.text} fontFamily="inherit">{showLabels?(ent.label.length>17?ent.label.slice(0,17)+"…":ent.label):"••••••"}</text>)}
                {/* Status dot */}
                <circle cx={ent.x+ENT_W-16} cy={ent.y+22} r={5} fill={st.color+"25"} stroke={st.color+"50"} strokeWidth={0.8}/>
                <text x={ent.x+ENT_W-16} y={ent.y+25} textAnchor="middle" fontSize={7} fill={st.color} fontWeight={800} fontFamily="inherit">{st.icon}</text>
                {/* === LINE 2: Description === */}
                <text x={ent.x+14} y={ent.y+50} fontSize={10} fill={t.textMuted} fontFamily="inherit">{desc?(desc.length>28?desc.slice(0,28)+"…":desc):<tspan fontStyle="italic" opacity={0.4}>Aucune description</tspan>}</text>
                {/* === LINE 3: separator + time + author === */}
                <line x1={ent.x+12} y1={ent.y+60} x2={ent.x+ENT_W-10} y2={ent.y+60} stroke={t.itemBorder} strokeWidth={0.8}/>
                <text x={ent.x+14} y={ent.y+76} fontSize={9} fill={t.textMuted} fontFamily="inherit" opacity={0.6}>🕐 {timeStr||"—"}</text>
                <text x={ent.x+ENT_W-12} y={ent.y+76} textAnchor="end" fontSize={9} fill={t.textMuted} fontFamily="inherit" opacity={0.6}>{ent.author||"—"}</text>
              </g>;})}
              
              {/* Post-its */}
              {postits.map(p=>{const isSel=p.id===selectedPostitId;return<g key={p.id} onMouseDown={e=>handlePostitDown(e,p.id)} onDoubleClick={e=>{e.stopPropagation();setEditingPostit(p.id);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,postitId:p.id});}} style={{cursor:"grab"}}>
                {isSel&&<rect x={p.x-3} y={p.y-3} width={p.w+6} height={p.h+6} rx={5} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.5}/>}
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={3} fill={p.color} stroke={isSel?t.accent:"rgba(0,0,0,0.1)"} strokeWidth={1}/>
                <rect x={p.x} y={p.y} width={p.w} height={6} rx={3} fill="rgba(0,0,0,0.08)"/>
                {editingPostit===p.id?<foreignObject x={p.x+6} y={p.y+12} width={p.w-12} height={p.h-18}><textarea autoFocus defaultValue={p.text} onBlur={e=>{updatePostit(p.id,{text:e.target.value});setEditingPostit(null);}} onKeyDown={e=>{if(e.key==="Escape")setEditingPostit(null);}} style={{width:"100%",height:"100%",background:"transparent",border:"none",color:"#1a1a1a",fontSize:11,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:"1.3",userSelect:"text"}}/></foreignObject>:<text x={p.x+8} y={p.y+22} fontSize={11} fill="#1a1a1a" fontFamily="inherit">{p.text?p.text.split("\n").slice(0,5).map((line,i)=><tspan key={i} x={p.x+8} dy={i===0?0:14}>{line.slice(0,20)}</tspan>):<tspan fill="#666" fontStyle="italic">Double-clic...</tspan>}</text>}
              </g>;})}
              {/* Stickers */}
              {stickers.map(s=>{const isSel=s.id===selectedStickerId;return<g key={s.id} onMouseDown={e=>handleStickerDown(e,s.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,stickerId:s.id});}} style={{cursor:"grab"}}>
                {isSel&&<circle cx={s.x+20} cy={s.y+20} r={25} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.5}/>}
                <text x={s.x+20} y={s.y+28} fontSize={32} textAnchor="middle" dominantBaseline="middle" style={{filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.3))"}}>{s.emoji}</text>
              </g>;})}

              {showCollaborators&&collabList.filter(c=>c.cursor).map(c=><g key={c.id}><polygon points="0,0 0,18 5,14 10,20 13,18 8,12 14,10" fill={c.color} stroke="#fff" strokeWidth={0.5} transform={`translate(${c.cursor.x},${c.cursor.y})`}/><rect x={c.cursor.x+16} y={c.cursor.y+12} width={Math.max(50,c.name?.length*7||50)} height={16} rx={4} fill={c.color}/><text x={c.cursor.x+22} y={c.cursor.y+23} fontSize={9} fill="#fff" fontWeight={600} fontFamily="inherit">{c.name}</text></g>)}
            </g>
          </svg>
          {entities.length===0&&stickers.length===0&&postits.length===0&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",color:t.textMuted,pointerEvents:"none"}}><div style={{fontSize:48,marginBottom:12,opacity:0.4}}>🔍</div><div style={{fontSize:16,fontWeight:600}}>Canvas vide</div><div style={{fontSize:13,marginTop:4}}>Ouvrez une catégorie et glissez un bloc</div></div>}
        </div>

        
        {/* BOTTOM TOOLBAR */}
        {!isViewer&&<div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          {toolbarOpen&&<div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:12,boxShadow:`0 8px 32px ${t.shadow}`,width:420,maxWidth:"80vw"}}>
            <div style={{display:"flex",gap:4,marginBottom:10}}>{[{id:"stickers",l:"😀 Stickers"},{id:"postits",l:"📝 Post-it"},{id:"shapes",l:"⬡ Formes"}].map(tab=><button key={tab.id} onClick={()=>setToolbarTab(tab.id)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:toolbarTab===tab.id?t.accent+"20":"none",color:toolbarTab===tab.id?t.accent:t.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>{tab.l}</button>)}</div>
            {toolbarTab==="stickers"&&<div><div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>{stampSticker?<span>🔵 Mode tampon : <b>{stampSticker.emoji} {stampSticker.label}</b> — Cliquez sur le canvas. <button onClick={()=>setStampSticker(null)} style={{background:"none",border:"none",color:t.accent,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Annuler</button></span>:"Cliquez un sticker pour activer le tampon"}</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{STICKERS.map(s=><div key={s.id} draggable onDragStart={e=>{e.dataTransfer.setData("stickerEmoji",s.emoji);e.dataTransfer.setData("stickerLabel",s.label);}} onClick={()=>setStampSticker(stampSticker?.id===s.id?null:s)} title={s.label} style={{width:40,height:40,borderRadius:8,background:stampSticker?.id===s.id?t.accent+"30":t.surfaceAlt,border:`1px solid ${stampSticker?.id===s.id?t.accent:t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",transition:"all 0.15s",boxShadow:stampSticker?.id===s.id?`0 0 0 2px ${t.accent}`:""}} onMouseEnter={e=>{if(stampSticker?.id!==s.id){e.currentTarget.style.background=t.itemHover||t.surfaceAlt;e.currentTarget.style.transform="scale(1.15)";}}} onMouseLeave={e=>{if(stampSticker?.id!==s.id){e.currentTarget.style.background=t.surfaceAlt;e.currentTarget.style.transform="scale(1)";}}}>{s.emoji}</div>)}</div></div>}
            {toolbarTab==="postits"&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{POSTIT_COLORS.map(c=><div key={c} draggable onDragStart={e=>e.dataTransfer.setData("postitColor",c)} onClick={()=>addPostit(c)} style={{width:48,height:48,borderRadius:6,background:c,cursor:"grab",border:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#00000030";e.currentTarget.style.transform="scale(1.1)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="transparent";e.currentTarget.style.transform="scale(1)";}}>📝</div>)}</div>}
            {toolbarTab==="shapes"&&<div style={{color:t.textMuted,fontSize:12,padding:16,textAlign:"center"}}>Formes — Bientôt disponible</div>}
          </div>}
          <button onClick={()=>setToolbarOpen(!toolbarOpen)} style={{background:toolbarOpen?"#58a6ff":t.surface,border:`1px solid ${toolbarOpen?t.accent:t.border}`,borderRadius:12,padding:"10px 24px",color:toolbarOpen?"#fff":t.text,fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:`0 4px 16px ${t.shadow}`,display:"flex",alignItems:"center",gap:8,transition:"all 0.2s"}}>{toolbarOpen?"✕ Fermer":"🧰 Outils — Stickers & Notes"}</button>
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
            {collab.chatMessages.length===0&&<div style={{color:t.textMuted,fontSize:12,padding:16,textAlign:"center"}}>Aucun message</div>}
            {collab.chatMessages.map(m=><div key={m.id} style={{display:"flex",gap:8,alignItems:m.userId===collab.userId?"flex-end":"flex-start",flexDirection:m.userId===collab.userId?"row-reverse":"row"}}>
              <div style={{width:24,height:24,borderRadius:12,background:m.userColor||t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,flexShrink:0}}>{m.userName?.[0]?.toUpperCase()}</div>
              <div style={{maxWidth:"80%"}}>
                <div style={{fontSize:10,color:t.textMuted,marginBottom:2}}>{m.userId===collab.userId?"Vous":m.userName} · {m.ts?new Date(m.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):""}</div>
                <div style={{padding:"8px 12px",borderRadius:12,background:m.userId===collab.userId?t.accent+"20":t.surfaceAlt,fontSize:12,color:t.text,wordBreak:"break-word"}}>{m.text}</div>
              </div>
            </div>)}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:"8px 12px",borderTop:`1px solid ${t.border}`,display:"flex",gap:8}}>
            <input ref={chatInputRef} placeholder="Message..." style={{flex:1,padding:"8px 12px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:12,outline:"none",fontFamily:"inherit"}} onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){collab.sendChat(e.target.value);e.target.value="";setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);}}}/>
            <button onClick={()=>{const inp=chatInputRef.current;if(inp?.value.trim()){collab.sendChat(inp.value);inp.value="";setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);}}} style={{padding:"8px 14px",background:t.accent,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>→</button>
          </div>
        </div>}

        {showTimeline&&(()=>{const allEvents=[...timeline.map(it=>({...it,kind:"action",sortDate:it.timestamp})),...(lobbyMode==="collab"?collab.remoteHistory:[]).map(it=>({...it,kind:"remote",sortDate:it.timestamp,color:"#58a6ff"})),...entities.flatMap(e=>(e.comments||[]).map(c=>({id:c.id,kind:"comment",action:`💬 ${e.label}: "${c.text.slice(0,40)}"`,user:c.author||"Vous",timestamp:c.date,sortDate:c.date,color:e.color}))),...entities.filter(e=>e.metadata?.date).map(e=>({id:e.id+"_date",kind:"date",action:`📅 ${e.label}`,user:"Date",timestamp:new Date(e.metadata.date).toISOString(),sortDate:new Date(e.metadata.date).toISOString(),color:e.color})),...links.flatMap(l=>(l.comments||[]).map(c=>({id:c.id,kind:"comment",action:`💬 Lien: "${c.text.slice(0,40)}"`,user:c.author||"Vous",timestamp:c.date,sortDate:c.date,color:"#58a6ff"}))),...links.filter(l=>l.date).map(l=>({id:l.id+"_date",kind:"date",action:`📅 Lien: ${l.label||LINK_TYPES.find(lt=>lt.id===l.type)?.label||"lien"}`,user:"Date",timestamp:new Date(l.date).toISOString(),sortDate:new Date(l.date).toISOString(),color:"#58a6ff"}))];allEvents.sort((a,b)=>new Date(b.sortDate)-new Date(a.sortDate));return<div style={{position:"absolute",bottom:30,right:rightPanelOpen?336:16,width:300,maxHeight:360,background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,boxShadow:`0 8px 24px ${t.shadow}`,zIndex:5,overflow:"hidden"}}><div style={{padding:"12px 16px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{I.clock} Timeline ({allEvents.length})</span><button onClick={()=>setShowTimeline(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer"}}>{I.x}</button></div><div style={{maxHeight:300,overflowY:"auto",padding:"8px 16px"}}>{allEvents.length===0?<div style={{color:t.textMuted,fontSize:12,padding:"16px 0",textAlign:"center"}}>Aucun événement</div>:allEvents.map(it=><div key={it.id} style={{padding:"8px 0",borderBottom:`1px solid ${t.border}`,display:"flex",gap:10}}><div style={{width:6,height:6,borderRadius:"50%",background:it.color||t.accent,marginTop:5,flexShrink:0}}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.action}</div><div style={{fontSize:10,color:t.textMuted}}>{it.user} · {it.timestamp?fmtDate(it.timestamp):""}</div></div></div>)}</div></div>;})()}

        {/* Context menu */}
        {ctxMenu&&!isViewer&&<div onClick={e=>{e.stopPropagation();setCtxMenu(null);}} style={{position:"fixed",top:ctxMenu.y,left:Math.min(ctxMenu.x,window.innerWidth-220),background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,boxShadow:`0 8px 24px ${t.shadow}`,zIndex:50,minWidth:200}}>
          {/* Canvas right-click */}
          {ctxMenu.canvas&&<>{[
            {l:"👤 Ajouter Personne",fn:()=>addEntity("person_male",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"🏢 Ajouter Organisation",fn:()=>addEntity("org_company",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"📧 Ajouter Email",fn:()=>addEntity("email_gmail",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"📱 Ajouter Téléphone",fn:()=>addEntity("phone_mobile",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"🔗 Ajouter Domaine/URL",fn:()=>addEntity("domain_site",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"💬 Ajouter Réseau social",fn:()=>addEntity("other_social",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
            {l:"📍 Ajouter Lieu",fn:()=>addEntity("loc_address",ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)},
          ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            {[
              {l:"📝 Ajouter un post-it",fn:()=>addPostit("#fef08a",ctxMenu.canvasPos.x-70,ctxMenu.canvasPos.y-50)},
              ...(copiedEntity?[{l:"📋 Coller \""+copiedEntity.label+"\"",fn:()=>pasteEntity(ctxMenu.canvasPos.x-80,ctxMenu.canvasPos.y-30)}]:[]),
            ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            {[
              {l:"🔍 Zoom 100%",fn:()=>{setZoom(1);setPan({x:0,y:0});}},
              {l:"⊞ Ajuster la vue",fn:fitView},
              ...[{l:"🔀 Réarranger le graphe",fn:()=>autoLayout(null)}],
            ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
          </>}
          {/* Entity right-click */}
          {ctxMenu.entityId&&<>{[
            {l:"✏️ Renommer",fn:()=>setEditingLabel(ctxMenu.entityId)},
            {l:"🔗 Créer un lien",fn:()=>{setLinkingFrom(ctxMenu.entityId);setHoldActive(true);}},
            {l:"📋 Copier",fn:()=>copyEntity(ctxMenu.entityId)},
            {l:"📄 Dupliquer",fn:()=>duplicateEntity(ctxMenu.entityId)},
          ].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <div style={{padding:"4px 12px",fontSize:10,color:t.textMuted,fontWeight:600}}>Fiabilité des liens</div>
            {LINK_STRENGTHS.map(s=>{const el=links.filter(l=>(l.from===ctxMenu.entityId||l.to===ctxMenu.entityId));return<button key={s.id} onClick={()=>{el.forEach(l=>updateLink(l.id,{strength:s.id}));setCtxMenu(null);}} style={{width:"100%",padding:"6px 12px",background:"none",border:"none",color:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="none"}><div style={{width:14,height:14,borderRadius:7,background:s.badgeColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{s.badge}</div>{s.label} ({el.length} liens)</button>;})}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            {<CtxBtn t={t} l="🔀 Centrer le graphe ici" fn={()=>autoLayout(ctxMenu.entityId)}/>}
            {(()=>{const ent=entities.find(e=>e.id===ctxMenu.entityId);if(!ent)return null;const trs=getTransformsForEntity(ent);if(trs.length===0)return null;return<>
              <div style={{borderTop:`1px solid ${t.border}`,margin:"4px 0"}}/>
              <div style={{padding:"4px 12px",fontSize:10,fontWeight:700,color:t.textMuted,textTransform:"uppercase"}}>🔬 Transforms</div>
              {trs.map(tr=><button key={tr.id} onClick={()=>runTransform(tr,ctxMenu.entityId)} disabled={transformLoading===tr.id} style={{width:"100%",padding:"7px 12px",background:"none",border:"none",color:t.text,fontSize:12,cursor:transformLoading===tr.id?"wait":"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6,opacity:transformLoading===tr.id?0.5:1}} onMouseEnter={e=>{if(transformLoading!==tr.id)e.currentTarget.style.background=t.surfaceAlt;}} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                <span>{tr.icon||"🔬"}</span>
                <span style={{flex:1}}>{tr.label}</span>
                {!tr.local&&<span style={{fontSize:9,color:t.accent,background:t.accent+"18",padding:"1px 5px",borderRadius:4}}>API</span>}
                {transformLoading===tr.id&&<span style={{fontSize:10}}>⏳</span>}
              </button>)}
            </>;})()}
            <CtxBtn t={t} l="🗑️ Supprimer" fn={()=>deleteEntity(ctxMenu.entityId)} d/>
          </>}
          {/* Link right-click */}
          {ctxMenu.linkId&&(()=>{const lk=links.find(l=>l.id===ctxMenu.linkId);if(!lk)return null;return<>
            <div style={{padding:"6px 12px",fontSize:10,color:t.textMuted,fontWeight:600}}>Type de relation</div>
            {LINK_TYPES.map(lt=><button key={lt.id} onClick={()=>{updateLink(ctxMenu.linkId,{type:lt.id,color:lt.color});setCtxMenu(null);}} style={{width:"100%",padding:"6px 12px",background:lk.type===lt.id?t.accent+"15":"none",border:"none",color:lk.type===lt.id?t.accent:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background=lk.type===lt.id?t.accent+"15":"none"}><div style={{width:8,height:8,borderRadius:4,background:lt.color}}/>{lt.label}</button>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <div style={{padding:"6px 12px",fontSize:10,color:t.textMuted,fontWeight:600}}>Fiabilité</div>
            {LINK_STRENGTHS.map(s=><button key={s.id} onClick={()=>{updateLink(ctxMenu.linkId,{strength:s.id});setCtxMenu(null);}} style={{width:"100%",padding:"6px 12px",background:lk.strength===s.id?s.badgeColor+"15":"none",border:"none",color:lk.strength===s.id?s.badgeColor:t.text,fontSize:11,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background=lk.strength===s.id?s.badgeColor+"15":"none"}><div style={{width:14,height:14,borderRadius:7,background:s.badgeColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>{s.badge}</div>{s.label}</button>)}
            <div style={{height:1,background:t.border,margin:"4px 0"}}/>
            <CtxBtn t={t} l="✏️ Propriétés" fn={()=>{setSelectedLinkId(ctxMenu.linkId);setSelectedId(null);setRightPanelOpen(true);}}/>
            <CtxBtn t={t} l={lk.bidirectional?"↔️ Rendre unidirectionnel":"↔️ Rendre bidirectionnel"} fn={()=>updateLink(ctxMenu.linkId,{bidirectional:!lk.bidirectional})}/>
            <CtxBtn t={t} l="🗑️ Supprimer" fn={()=>deleteLink(ctxMenu.linkId)} d/>
          </>;})()}
          {/* Sticker right-click */}
          {ctxMenu.stickerId&&<CtxBtn t={t} l="🗑️ Supprimer sticker" fn={()=>deleteSticker(ctxMenu.stickerId)} d/>}
          {/* Post-it right-click */}
          {ctxMenu.postitId&&[{l:"✏️ Éditer",fn:()=>setEditingPostit(ctxMenu.postitId)},{l:"🔗 Créer un lien",fn:()=>{setLinkingFrom("postit_"+ctxMenu.postitId);setHoldActive(true);}},{l:"🗑️ Supprimer",fn:()=>deletePostit(ctxMenu.postitId),d:true}].map(it=><CtxBtn key={it.l} t={t} {...it}/>)}
        </div>}



        {/* PLUGIN STORE — FULLSCREEN */}
        {showPlugins&&<PluginStore engine={pluginEngine} theme={t} onClose={()=>setShowPlugins(false)} onPluginToggle={()=>setPluginTick(k=>k+1)}/>}

        {/* Active plugin fullscreen panel */}
        {activePlugin&&(()=>{
          const pl = pluginEngine.get(activePlugin);
          if(!pl||!pl.Panel) return null;
          const PanelComp = pl.Panel;
          return <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",flexDirection:"column",background:t.bg}}>
            <div style={{padding:"10px 20px",borderBottom:`1px solid ${t.border}`,background:t.surface,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <span style={{fontSize:18}}>{pl.icon}</span>
              <span style={{fontSize:14,fontWeight:700,flex:1}}>{pl.name}</span>
              <button onClick={()=>setActivePlugin(null)} style={{padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:8,border:`1px solid ${t.border}`,background:t.surfaceAlt,color:t.text,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✕ Fermer</button>
            </div>
            <div style={{flex:1,overflow:"hidden"}}>
              <PluginErrorBoundary pluginId={activePlugin} pluginName={pl.name} theme={t}>
              <PanelComp
                entities={entities} links={links} stickers={stickers} postits={postits}
                addEntity={addEntity} updateEntity={updateEntity} deleteEntity={deleteEntity}
                addLink={addLink} updateLink={updateLink} deleteLink={deleteLink}
                selectedId={selectedId} setSelectedId={setSelectedId}
                theme={t} onClose={()=>setActivePlugin(null)}
                settings={pl.settings} updateSettings={(k,v)=>pluginEngine.updateSetting(activePlugin,k,v)}
                pluginEngine={pluginEngine}
                caseId={propCaseId} userName={propUserName} collab={collab}
              />
              </PluginErrorBoundary>
            </div>
          </div>;
        })()}


        {/* OSINT Industries Import Modal */}
        {osintImport&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setOsintImport(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,width:560,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:`0 16px 48px ${t.shadow}`}}>
            <div style={{padding:"20px 24px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>🔎</span>
              <div style={{flex:1}}><div style={{fontSize:16,fontWeight:700,color:t.text}}>Import OSINT Industries</div><div style={{fontSize:12,color:t.textMuted}}>Cible : <b>{osintImport.targetName}</b></div></div>
              <button onClick={()=>setOsintImport(null)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18}}>✕</button>
            </div>

            <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
              {/* Stats */}
              <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                {[
                  {label:"Modules",value:osintImport.preview.foundModules,color:"#6366f1"},
                  {label:"Emails",value:osintImport.preview.emails.length,color:"#f43f5e"},
                  {label:"Alias",value:osintImport.preview.names.length,color:"#a78bfa"},
                  {label:"Lieux",value:osintImport.preview.locations.length,color:"#10b981"},
                ].map(s=><div key={s.label} style={{background:s.color+"15",border:`1px solid ${s.color}30`,borderRadius:10,padding:"10px 16px",flex:1,minWidth:100,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:11,color:t.textMuted}}>{s.label}</div>
                </div>)}
              </div>

              {/* Emails found */}
              {osintImport.preview.emails.length>0&&<div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:t.textMuted,marginBottom:6}}>📧 Emails trouvés</div>
                {osintImport.preview.emails.map(e=><div key={e} style={{fontSize:12,color:t.text,padding:"4px 8px",background:t.surfaceAlt,borderRadius:4,marginBottom:2}}>{e}</div>)}
              </div>}

              {/* Locations */}
              {osintImport.preview.locations.length>0&&<div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:t.textMuted,marginBottom:6}}>📍 Localisations</div>
                {osintImport.preview.locations.map(l=><div key={l.text} style={{fontSize:12,color:t.text,padding:"4px 8px",background:t.surfaceAlt,borderRadius:4,marginBottom:2}}>{l.text} <span style={{color:t.textMuted,fontSize:10}}>({l.source})</span></div>)}
              </div>}

              {/* Platforms — selectable */}
              <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:t.textMuted,marginBottom:6}}>📱 Plateformes ({osintImport.preview.platforms.filter(p=>p.selected).length}/{osintImport.preview.platforms.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:220,overflowY:"auto"}}>
                {osintImport.preview.platforms.map((p,i)=><label key={p.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:p.selected?t.surfaceAlt:"transparent",cursor:"pointer",fontSize:12,border:`1px solid ${p.selected?t.border:"transparent"}`}}>
                  <input type="checkbox" checked={p.selected} onChange={()=>{
                    const np=[...osintImport.preview.platforms];
                    np[i]={...np[i],selected:!np[i].selected};
                    setOsintImport({...osintImport,preview:{...osintImport.preview,platforms:np}});
                  }}/>
                  <span style={{flex:1,fontWeight:p.selected?600:400,color:p.selected?t.text:t.textMuted}}>{p.name}</span>
                  {p.username&&<span style={{fontSize:10,color:t.textMuted}}>{p.username}</span>}
                  {p.reliable&&<span style={{fontSize:9,color:"#10b981",background:"#10b98118",padding:"1px 5px",borderRadius:4}}>fiable</span>}
                </label>)}
              </div>

              {/* Target name edit */}
              <div style={{marginTop:16}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:t.textMuted,marginBottom:6}}>👤 Nom de la cible</div>
                <input value={osintImport.targetName} onChange={e=>setOsintImport({...osintImport,targetName:e.target.value})} style={{...inp(t),fontSize:14}}/>
              </div>
            </div>

            <div style={{padding:"16px 24px",borderTop:`1px solid ${t.border}`,display:"flex",gap:10}}>
              <button onClick={()=>setOsintImport(null)} style={{flex:1,padding:"10px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:"pointer",fontSize:13}}>Annuler</button>
              <button onClick={()=>{
                const n=osintImport.targetName.trim();
                if(!n){alert("Entrez un nom de cible");return;}
                confirmOSINTImport();
              }} style={{flex:2,padding:"10px",background:t.accent,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>
                🔎 Importer {osintImport.preview.platforms.filter(p=>p.selected).length} plateformes
              </button>
            </div>
          </div>
        </div>}

        {/* Whiteboard */}
        <Whiteboard show={showWhiteboard} onClose={()=>setShowWhiteboard(false)} theme={t} collab={lobbyMode==="collab"?collab:null}/>

        {/* Map Modal */}
        {/* Map now rendered by plugin engine (see plugins/map/Panel.jsx) */}

        {/* Duplicate Alert Modal */}
      </div>

      {/* RIGHT PANEL */}
      <EntityPanel
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
            <h3 style={{fontSize:18,fontWeight:700,margin:0}}>📨 Inviter des collaborateurs</h3>
            <button onClick={()=>setShowInviteModal(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,display:"block",marginBottom:6}}>Lien de collaboration</label>
            <div style={{display:"flex",gap:8}}>
              <input readOnly value={`${window.location.origin}/room/${encodeURIComponent(propCaseId)}`} style={{flex:1,padding:"10px 14px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,outline:"none",fontFamily:"monospace"}} onClick={e=>e.target.select()} />
              <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/room/${encodeURIComponent(propCaseId)}`);setInviteCopied(true);setTimeout(()=>setInviteCopied(false),2000);}} style={{padding:"10px 16px",background:inviteCopied?"#10b981":t.accent,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap",transition:"background 0.2s"}}>{inviteCopied?"✓ Copié":"Copier"}</button>
            </div>
          </div>
          <div style={{background:t.surfaceAlt,borderRadius:10,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.text,marginBottom:8}}>Comment ça marche :</div>
            <div style={{fontSize:11,color:t.textSecondary,lineHeight:1.6}}>
              1. Copiez le lien ci-dessus<br/>
              2. Envoyez-le à vos collaborateurs<br/>
              3. Ils se connectent (ou créent un compte) et rejoignent l'enquête<br/>
              4. Vous verrez leurs curseurs en temps réel
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:`${t.accent}10`,border:`1px solid ${t.accent}25`,borderRadius:8}}>
            <div style={{fontSize:16}}>💡</div>
            <div style={{fontSize:11,color:t.accent}}>Les collaborateurs auront le rôle <b>Analyste</b> par défaut.</div>
          </div>
          {collabList.length>0&&<div style={{marginTop:16,borderTop:`1px solid ${t.border}`,paddingTop:12}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textMuted,marginBottom:8}}>ACTUELLEMENT CONNECTÉS ({collabList.length+1})</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <div style={{padding:"4px 10px",background:t.accent+"15",border:`1px solid ${t.accent}30`,borderRadius:6,fontSize:11,color:t.accent,fontWeight:600}}>{lobbyName} (vous)</div>
              {collabList.map(c=><div key={c.id} style={{padding:"4px 10px",background:c.color+"15",border:`1px solid ${c.color}30`,borderRadius:6,fontSize:11,color:c.color,fontWeight:600}}>{c.name}</div>)}
            </div>
          </div>}
        </div>
      </div>}

    </div>
  );
}

function CtxBtn({t,l,fn,d,onClose}){return<button onClick={()=>{fn();if(onClose)onClose();}} style={{width:"100%",padding:"7px 12px",background:"none",border:"none",color:d?t.danger:t.text,fontSize:12,cursor:"pointer",borderRadius:6,textAlign:"left",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background=t.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="none"}>{l}</button>;}

function SidebarItem({item,t,fav,onAdd,onToggleFav,onDragStart}){return(
  <div draggable onDragStart={onDragStart} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,cursor:"grab",border:`1px solid ${t.itemBorder}`,background:t.itemBg,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=t.itemHover;e.currentTarget.style.borderColor=item.color+"50";}} onMouseLeave={e=>{e.currentTarget.style.background=t.itemBg;e.currentTarget.style.borderColor=t.itemBorder;}} onClick={onAdd}>
    <div style={{width:28,height:28,borderRadius:14,background:item.color+"20",border:`2px solid ${item.color}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:8,height:8,borderRadius:4,background:item.color}}/></div>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:t.text}}>{item.label}</div>{item.desc&&<div style={{fontSize:10,color:t.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.desc}</div>}</div>
    <button onClick={e=>{e.stopPropagation();onToggleFav();}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:fav?"#f59e0b":t.textMuted,opacity:fav?1:0.4,transition:"all 0.15s",padding:"2px"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity=fav?"1":"0.4"}>{fav?"★":"☆"}</button>
  </div>
);}

function Fl({label,t,children}){return<div><label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:t.textMuted,display:"block",marginBottom:5}}>{label}</label>{children}</div>;}
const inp=(t)=>({width:"100%",padding:"10px 14px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.text,fontSize:14,outline:"none",boxSizing:"border-box"});
const tb=(t)=>({background:"none",border:"none",color:t.text,cursor:"pointer",padding:"6px 8px",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"});
const sBtn=(t)=>({background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:6,color:t.textSecondary,cursor:"pointer",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0});
