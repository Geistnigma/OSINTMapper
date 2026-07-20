/** Haversine distance in meters */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fmtDist(m) { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }

export function fmtDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    const hasTime = String(d).includes('T') && String(d).split('T')[1];
    if (hasTime) return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dL);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

const GPS_RE = /(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/g;

export function extractGeoPoints(entities) {
  const pts = [];
  entities.forEach(ent => {
    const date = ent.metadata?.date || null;
    const timestamp = date ? new Date(date).getTime() : null;
    const base = { label: ent.label, color: ent.color, id: ent.id, date, timestamp, type: ent.type, subtype: ent.subtype };
    const mLat = ent.metadata?.lat, mLng = ent.metadata?.lng;
    if (mLat !== undefined && mLat !== '' && mLng !== undefined && mLng !== '') {
      const la = parseFloat(mLat), lo = parseFloat(mLng);
      if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { pts.push({ ...base, lat: la, lng: lo, source: 'coordonnées' }); return; }
    }
    const lm = ent.label.match(/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/);
    if (lm) { const la = +lm[1], lo = +lm[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) { pts.push({ ...base, lat: la, lng: lo, source: 'label' }); return; } }
    const texts = [ent.description, ent.notes, ent.metadata?.address].filter(Boolean).join(' ');
    if (texts.length > 0) { GPS_RE.lastIndex = 0; let mm; while ((mm = GPS_RE.exec(texts)) !== null) { const la = +mm[1], lo = +mm[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) pts.push({ ...base, lat: la, lng: lo, label: ent.label + ' (GPS)', source: 'description' }); } }
  });
  return pts;
}

export function buildTrajectories(points) {
  const dated = points.filter(p => p.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  if (dated.length < 2) return { dated, segments: [] };
  const segments = [];
  for (let i = 0; i < dated.length - 1; i++) {
    const from = dated[i], to = dated[i + 1];
    if (from.lat === to.lat && from.lng === to.lng) continue;
    segments.push({ from, to, index: i, color: `hsl(${(i / (dated.length - 1)) * 240}, 70%, 55%)` });
  }
  return { dated, segments };
}

export function arrowIcon(L, color, rot) {
  return L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    html: `<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(${rot}deg)"><polygon points="8,0 16,12 8,8 0,12" fill="${color}" stroke="#fff" stroke-width="1"/></svg>` });
}

export const TILES = {
  osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OSM' },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© CartoDB' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri' },
};

export const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10000];

// Leaflet loader
let leafletPromise = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const lk = document.createElement('link'); lk.rel = 'stylesheet';
      lk.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(lk);
    }
    if (window.L) { resolve(window.L); return; }
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => resolve(window.L); s.onerror = () => reject(new Error('Leaflet load failed'));
    document.head.appendChild(s);
  });
  return leafletPromise;
}
