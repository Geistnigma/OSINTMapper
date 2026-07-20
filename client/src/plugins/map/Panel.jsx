import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { extractGeoPoints, buildTrajectories, haversine, fmtDist, fmtDate, loadLeaflet, TILES, RADIUS_OPTIONS } from './utils.js';
import { renderMarkers } from './layers/markers.js';
import { renderTrajectories } from './layers/trajectories.js';
import { renderRadiusCircles, renderDistanceLine, renderFreehand } from './layers/tools.js';
import { EXPORT_FORMATS } from './export.js';

// ═══ SMALL COMPONENTS ═══
// Theme-aware button
function Btn({ active, color, children, onClick, style, t }) {
  return <button onClick={onClick} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
    background: active ? (color || t?.accent || '#3b82f6') + '20' : (t?.surfaceAlt || '#1e293b'),
    color: active ? (color || t?.accent || '#3b82f6') : (t?.textSecondary || '#94a3b8'),
    border: `1px solid ${active ? (color || t?.accent || '#3b82f6') + '60' : (t?.border || '#334155')}`,
    cursor: 'pointer', whiteSpace: 'nowrap', ...style }}>
    {children}
  </button>;
}

const TRAJ_COLORS = [
  { id: 'auto', label: 'Auto (gradient)', value: null },
  { id: 'red', label: 'Rouge', value: '#ef4444' },
  { id: 'blue', label: 'Bleu', value: '#3b82f6' },
  { id: 'green', label: 'Vert', value: '#10b981' },
  { id: 'orange', label: 'Orange', value: '#f59e0b' },
  { id: 'purple', label: 'Violet', value: '#a855f7' },
  { id: 'white', label: 'Blanc', value: '#ffffff' },
];

export default function MapPanel({ entities, links, theme: t, onClose, settings, selectedId, setSelectedId }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);   // Leaflet map instance
  const LRef = useRef(null);     // Leaflet library
  const tileRef = useRef(null);  // current tile layer
  const layersRef = useRef({});  // named layer groups

  // State
  const [ready, setReady] = useState(false);
  const [tile, setTile] = useState(settings?.tileProvider || 'dark');
  const [showTraj, setShowTraj] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [trajColor, setTrajColor] = useState(null); // null = auto gradient

  // Tools
  const [tool, setTool] = useState(null); // 'radius' | 'distance' | 'freehand' | null
  const [radiusSize, setRadiusSize] = useState(1000);
  const [radiusCircles, setRadiusCircles] = useState([]);
  const [distPoints, setDistPoints] = useState([]);
  const [distCursor, setDistCursor] = useState(null);
  const [distMode, setDistMode] = useState('bird'); // 'bird' | 'road'
  const [freehandPts, setFreehandPts] = useState([]);
  const freehandDrawing = useRef(false);
  const [showExport, setShowExport] = useState(false);

  // Address search
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Street View
  const [streetView, setStreetView] = useState(null); // {lat,lng,label}

  // Animation
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState(0);
  const animTimer = useRef(null);

  // Date filter
  const [dateFilter, setDateFilter] = useState(false);
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');

  // Data
  const allGeoPoints = useMemo(() => extractGeoPoints(entities), [entities]);
  const geoPoints = useMemo(() => {
    if (!dateFilter || (!dateMin && !dateMax)) return allGeoPoints;
    const min = dateMin ? new Date(dateMin).getTime() : 0;
    const max = dateMax ? new Date(dateMax).getTime() : Infinity;
    return allGeoPoints.filter(p => !p.timestamp || (p.timestamp >= min && p.timestamp <= max));
  }, [allGeoPoints, dateFilter, dateMin, dateMax]);

  const { dated: datedPoints, segments } = useMemo(() => buildTrajectories(geoPoints), [geoPoints]);
  const undatedPoints = useMemo(() => geoPoints.filter(p => !p.timestamp), [geoPoints]);
  const dateRange = useMemo(() => {
    const dates = allGeoPoints.filter(p => p.timestamp).map(p => p.timestamp);
    if (!dates.length) return null;
    return { min: new Date(Math.min(...dates)).toISOString().split('T')[0], max: new Date(Math.max(...dates)).toISOString().split('T')[0] };
  }, [allGeoPoints]);

  // ═══ INIT MAP ONCE ═══
  useEffect(() => {
    if (!mapElRef.current) return;
    let dead = false;
    loadLeaflet().then(L => {
      if (dead || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapElRef.current, { zoomControl: false }).setView([46.6, 2.3], 5);
      L.control.zoom({ position: 'topright' }).addTo(map);
      const spec = TILES[tile] || TILES.dark;
      tileRef.current = L.tileLayer(spec.url, { attribution: spec.attr, maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
      setReady(true);
    });
    return () => { dead = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // ═══ TILE CHANGE (no re-create) ═══
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !tileRef.current) return;
    const spec = TILES[tile] || TILES.dark;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = LRef.current.tileLayer(spec.url, { attribution: spec.attr, maxZoom: 19 }).addTo(mapRef.current);
  }, [tile]);

  // ═══ LAYER: MARKERS ═══
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layersRef.current.markers) map.removeLayer(layersRef.current.markers);
    const { layer, bounds } = renderMarkers(L, map, geoPoints, { selectedId, setSelectedId, showLabels, openStreetView });
    layer.addTo(map);
    layersRef.current.markers = layer;
    if (bounds.length > 0 && !layersRef.current._fitted) { map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 }); layersRef.current._fitted = true; }
  }, [ready, geoPoints, selectedId, showLabels]);

  // ═══ LAYER: TRAJECTORIES ═══
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layersRef.current.traj) map.removeLayer(layersRef.current.traj);
    if (!showTraj || segments.length === 0) return;
    const layer = renderTrajectories(L, map, { segments, datedPoints, trajColor, animating, animStep });
    layer.addTo(map);
    layersRef.current.traj = layer;
  }, [ready, segments, datedPoints, showTraj, trajColor, animating, animStep]);

  // ═══ LAYER: RADIUS CIRCLES ═══
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layersRef.current.radius) map.removeLayer(layersRef.current.radius);
    if (radiusCircles.length === 0) return;
    const layer = renderRadiusCircles(L, map, radiusCircles, (id) => setRadiusCircles(prev => prev.filter(c => c.id !== id)));
    layer.addTo(map);
    layersRef.current.radius = layer;
  }, [ready, radiusCircles]);

  // ═══ LAYER: DISTANCE LINE ═══
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layersRef.current.dist) map.removeLayer(layersRef.current.dist);
    if (distPoints.length === 0 && !distCursor) return;
    const { layer } = renderDistanceLine(L, map, distPoints, distCursor);
    layer.addTo(map);
    layersRef.current.dist = layer;
  }, [ready, distPoints, distCursor]);

  // ═══ LAYER: FREEHAND ═══
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layersRef.current.freehand) map.removeLayer(layersRef.current.freehand);
    if (freehandPts.length < 2) return;
    const layer = renderFreehand(L, map, freehandPts);
    layer.addTo(map);
    layersRef.current.freehand = layer;
  }, [ready, freehandPts]);

  // ═══ MAP EVENT HANDLERS ═══
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;

    const onClick = (e) => {
      const { lat, lng } = e.latlng;
      if (tool === 'radius') {
        setRadiusCircles(prev => [...prev, { lat, lng, radius: radiusSize, id: Date.now() }]);
      } else if (tool === 'distance') {
        setDistPoints(prev => [...prev, { lat, lng }]);
      }
    };

    const onMouseMove = (e) => {
      const { lat, lng } = e.latlng;
      if (tool === 'distance' && distPoints.length > 0) {
        setDistCursor({ lat, lng });
      }
      if (tool === 'freehand' && freehandDrawing.current) {
        setFreehandPts(prev => [...prev, { lat, lng }]);
      }
    };

    const onMouseDown = (e) => {
      if (tool === 'freehand') {
        freehandDrawing.current = true;
        map.dragging.disable();
        const { lat, lng } = e.latlng;
        setFreehandPts([{ lat, lng }]);
      }
    };

    const onMouseUp = () => {
      if (tool === 'freehand' && freehandDrawing.current) {
        freehandDrawing.current = false;
        map.dragging.enable();
      }
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('mousedown', onMouseDown);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mousedown', onMouseDown);
      map.off('mouseup', onMouseUp);
    };
  }, [ready, tool, radiusSize, distPoints.length]);

  // ═══ ANIMATION TIMER ═══
  useEffect(() => {
    if (!animating) return;
    animTimer.current = setInterval(() => {
      setAnimStep(prev => { if (prev >= segments.length - 1) { setAnimating(false); return prev; } return prev + 1; });
    }, 1500);
    return () => clearInterval(animTimer.current);
  }, [animating, segments.length]);

  // ═══ TOOL ACTIONS ═══
  const selectTool = (t2) => {
    setTool(t2 === tool ? null : t2);
    setDistPoints([]); setDistCursor(null); setFreehandPts([]);
    if (mapRef.current) mapRef.current.dragging.enable();
  };
  const clearDist = () => { setDistPoints([]); setDistCursor(null); };
  const clearFreehand = () => setFreehandPts([]);
  const undoDistPoint = () => setDistPoints(prev => prev.slice(0, -1));

  // Address search via proxy
  const searchAddress = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      const data = await r.json();
      if (data.length > 0 && mapRef.current) {
        const { lat, lon, display_name } = data[0];
        mapRef.current.setView([+lat, +lon], 15);
        setSearchResults(data.slice(0, 5));
      } else {
        setSearchResults([]);
      }
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [searchQuery]);

  // PNG capture
  const captureMap = useCallback(async () => {
    if (!mapElRef.current) return;
    try {
      // Dynamic import html2canvas
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      await new Promise(r => { script.onload = r; });
      const canvas = await window.html2canvas(mapElRef.current, { useCORS: true, allowTaint: true });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'osintmapper_carte.png';
      a.click();
    } catch (e) { console.error('Capture error:', e); alert('Erreur de capture. Réessayez.'); }
  }, []);

  // Street View
  const openStreetView = useCallback((lat, lng) => {
    setStreetView({ lat, lng });
  }, []);
  const closeStreetView = () => setStreetView(null);

  const distTotal = useMemo(() => {
    if (distPoints.length < 2) return null;
    let d = 0; for (let i = 0; i < distPoints.length - 1; i++) d += haversine(distPoints[i].lat, distPoints[i].lng, distPoints[i + 1].lat, distPoints[i + 1].lng);
    return d;
  }, [distPoints]);

  // ═══ RENDER ═══
  return (
    <div style={{ position: 'fixed', inset: 0, background: t.bg, zIndex: 150, display: 'flex', flexDirection: 'column', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: t.surface, borderBottom: `1px solid ${t.border}`, zIndex: 2, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Carte géographique</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{geoPoints.length} pts · {datedPoints.length} datés · {segments.length} traj.</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {['osm', 'dark', 'satellite'].map(tp => (
            <Btn t={t} key={tp} active={tile === tp} onClick={() => setTile(tp)}>{tp === 'osm' ? '🗺️' : tp === 'dark' ? '🌑' : '🛰️'} {tp.charAt(0).toUpperCase() + tp.slice(1)}</Btn>
          ))}
          <div style={{ width: 1, height: 18, background: t.border }} />
          <Btn t={t} active={showTraj} color="#3b82f6" onClick={() => setShowTraj(!showTraj)}>→ Traj</Btn>
          <Btn t={t} active={showLabels} color="#10b981" onClick={() => setShowLabels(!showLabels)}>Aa</Btn>

          {/* Trajectory color */}
          {showTraj && segments.length > 0 && (
            <select value={trajColor || 'auto'} onChange={e => setTrajColor(e.target.value === 'auto' ? null : e.target.value)}
              style={{ padding: '3px 6px', fontSize: 10, background: t.surfaceAlt, color: trajColor || '#93c5fd', border: `1px solid ${t.border}`, borderRadius: 4 }}>
              {TRAJ_COLORS.map(c => <option key={c.id} value={c.id === 'auto' ? 'auto' : c.value}>{c.label}</option>)}
            </select>
          )}
          <div style={{ width: 1, height: 18, background: t.border }} />

          {/* Radius */}
          <Btn t={t} active={tool === 'radius'} color="#f59e0b" onClick={() => selectTool('radius')}>⊙ Rayon</Btn>
          {tool === 'radius' && (
            <select value={radiusSize} onChange={e => setRadiusSize(+e.target.value)} style={{ padding: '3px 6px', fontSize: 10, background: t.surfaceAlt, color: '#f59e0b', border: '1px solid #f59e0b60', borderRadius: 4 }}>
              {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{fmtDist(r)}</option>)}
            </select>
          )}
          {radiusCircles.length > 0 && <Btn t={t} onClick={() => setRadiusCircles([])} style={{ color: '#f59e0b' }}>✕ {radiusCircles.length}</Btn>}

          {/* Distance */}
          <Btn t={t} active={tool === 'distance'} color="#ef4444" onClick={() => selectTool('distance')}>📏 Distance</Btn>
          {tool === 'distance' && distPoints.length > 0 && <Btn t={t} onClick={undoDistPoint} style={{ color: '#ef4444' }}>↩</Btn>}
          {distTotal !== null && <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{fmtDist(distTotal)}</span>}
          {distPoints.length > 0 && <Btn t={t} onClick={clearDist} style={{ color: '#ef4444' }}>✕</Btn>}

          {/* Freehand */}
          <Btn t={t} active={tool === 'freehand'} color="#a855f7" onClick={() => selectTool('freehand')}>✏️ Libre</Btn>
          {freehandPts.length > 0 && <Btn t={t} onClick={clearFreehand} style={{ color: '#a855f7' }}>✕</Btn>}
          <div style={{ width: 1, height: 18, background: t.border }} />

          {/* Animation */}
          {datedPoints.length >= 2 && (
            animating
              ? <Btn t={t} active color="#a855f7" onClick={() => { setAnimating(false); setAnimStep(0); clearInterval(animTimer.current); }}>⏹ Stop</Btn>
              : <Btn t={t} color="#a855f7" onClick={() => { setAnimating(true); setAnimStep(0); }}>▶ Animer</Btn>
          )}

          {/* Date filter */}
          {dateRange && <Btn t={t} active={dateFilter} color="#06b6d4" onClick={() => { setDateFilter(!dateFilter); if (!dateFilter) { setDateMin(dateRange.min); setDateMax(dateRange.max); } }}>📅 Filtrer</Btn>}

          <div style={{ width: 1, height: 18, background: t.border }} />

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchAddress()}
              placeholder="🔍 Rechercher une adresse..."
              style={{ padding: '4px 10px', fontSize: 11, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, width: 180, outline: 'none' }} />
            <Btn t={t} onClick={searchAddress} style={{ padding: '4px 8px' }}>{searching ? '...' : '🔍'}</Btn>
          </div>

          {/* Capture PNG */}
          <Btn t={t} onClick={captureMap}>📸 PNG</Btn>

          {/* Export */}
          <div style={{ position: 'relative' }}>
            <Btn t={t} active={showExport} color="#10b981" onClick={() => setShowExport(!showExport)}>📥 Export</Btn>
            {showExport && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 10, minWidth: 220, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase' }}>Exporter {geoPoints.length} points</div>
                {EXPORT_FORMATS.map(fmt => (
                  <button key={fmt.id} onClick={() => { fmt.fn(geoPoints, segments, 'OSINTMapper'); setShowExport(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.border}`, color: t.text, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 18 }}>{fmt.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{fmt.label}</div>
                      <div style={{ fontSize: 10, color: t.textMuted }}>{fmt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Btn t={t} onClick={onClose}>✕ Fermer</Btn>
        </div>
      </div>

      {/* Date filter bar */}
      {dateFilter && dateRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', background: '#06b6d410', borderBottom: '1px solid #06b6d430' }}>
          <span style={{ fontSize: 11, color: '#06b6d4', fontWeight: 700 }}>📅</span>
          <input type="date" value={dateMin} onChange={e => setDateMin(e.target.value)} style={{ padding: '3px 8px', fontSize: 11, background: t.bg, color: '#06b6d4', border: '1px solid #06b6d440', borderRadius: 4 }} />
          <span style={{ color: '#06b6d4' }}>→</span>
          <input type="date" value={dateMax} onChange={e => setDateMax(e.target.value)} style={{ padding: '3px 8px', fontSize: 11, background: t.bg, color: '#06b6d4', border: '1px solid #06b6d440', borderRadius: 4 }} />
          <span style={{ fontSize: 10, color: t.textMuted }}>{geoPoints.filter(p => p.timestamp).length}/{allGeoPoints.filter(p => p.timestamp).length} visibles</span>
        </div>
      )}

      {/* Tool hint */}
      {tool && (
        <div style={{ padding: '5px 16px', background: tool === 'radius' ? '#f59e0b10' : tool === 'distance' ? '#ef444410' : '#a855f710', borderBottom: `1px solid ${tool === 'radius' ? '#f59e0b30' : tool === 'distance' ? '#ef444430' : '#a855f730'}` }}>
          <span style={{ fontSize: 11, color: tool === 'radius' ? '#f59e0b' : tool === 'distance' ? '#ef4444' : '#a855f7', fontWeight: 600 }}>
            {tool === 'radius' && `⊙ Cliquez pour poser un cercle de ${fmtDist(radiusSize)} — cliquez un label ✕ pour le supprimer`}
            {tool === 'distance' && `📏 Cliquez pour poser des points de mesure — multi-points supporté`}
            {tool === 'freehand' && '✏️ Maintenez le clic et dessinez sur la carte — la distance sera calculée'}
          </span>
        </div>
      )}

      {/* No points warning */}
      {geoPoints.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', fontSize: 12, color: '#f59e0b', background: '#f59e0b15', padding: '12px 20px', borderRadius: 10, border: '1px solid #f59e0b30', maxWidth: 500 }}>
            ⚠️ Aucun point géolocalisé. Ajoutez des coordonnées GPS à vos entités.
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        <div ref={mapElRef} style={{ flex: 1, cursor: tool ? 'crosshair' : undefined }} />

        {/* ═══ SIDEBAR ═══ */}
        {geoPoints.length > 0 && (
          <div style={{ width: 250, background: t.surface, borderLeft: `1px solid ${t.border}`, overflowY: 'auto', flexShrink: 0, fontSize: 11 }}>
            {/* Animation progress */}
            {animating && (
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}`, background: '#a855f710' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', marginBottom: 6 }}>▶ ANIMATION</div>
                <div style={{ background: t.bg, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${((animStep + 1) / Math.max(segments.length, 1)) * 100}%`, height: '100%', background: '#a855f7', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>Étape {animStep + 1}/{segments.length}</div>
              </div>
            )}

            {/* Chronology */}
            {datedPoints.length > 0 && (
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>📅 Chronologie ({datedPoints.length})</div>
                {datedPoints.map((p, i) => {
                  const isActive = animating && animStep >= i;
                  return (
                    <div key={p.id + '_' + i} onClick={() => setSelectedId?.(p.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', cursor: 'pointer', borderBottom: i < datedPoints.length - 1 ? `1px solid ${t.border}` : 'none', opacity: isActive || !animating ? 0.9 : 0.3 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0, paddingTop: 2 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, border: '2px solid #fff', boxShadow: isActive ? `0 0 6px ${p.color}` : 'none' }} />
                        {i < datedPoints.length - 1 && <div style={{ width: 2, height: 20, background: `linear-gradient(${p.color}, ${datedPoints[i + 1]?.color || t.border})`, marginTop: 1 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                        <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>{fmtDate(p.date)}</div>
                        {i > 0 && <div style={{ fontSize: 9, color: t.textMuted }}>↑ {fmtDist(haversine(datedPoints[i - 1].lat, datedPoints[i - 1].lng, p.lat, p.lng))}</div>}
                      </div>
                    </div>
                  );
                })}
                {datedPoints.length >= 2 && (
                  <div style={{ marginTop: 6, padding: '5px 8px', background: t.surfaceAlt, borderRadius: 6, fontSize: 10, color: t.textSecondary }}>
                    Total : <strong style={{ color: '#3b82f6' }}>{fmtDist(segments.reduce((s, seg) => s + haversine(seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng), 0))}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Undated */}
            {undatedPoints.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>📍 Sans date ({undatedPoints.length})</div>
                {undatedPoints.map((p, i) => (
                  <div key={p.id + '_u' + i} onClick={() => setSelectedId?.(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', borderBottom: i < undatedPoints.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                    <div style={{ width: 7, height: 7, borderRadius: 4, background: p.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                      <div style={{ fontSize: 9, color: t.textMuted }}>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <div style={{ position: 'absolute', top: 52, left: 16, zIndex: 10, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: 360, overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textMuted, fontWeight: 700 }}>RÉSULTATS</div>
          {searchResults.map((r, i) => (
            <button key={i} onClick={() => { mapRef.current?.setView([+r.lat, +r.lon], 16); setSearchResults([]); }}
              style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.border}`, color: t.text, cursor: 'pointer', textAlign: 'left', fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.background = t.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 600 }}>{r.display_name?.split(',').slice(0, 2).join(',')}</div>
              <div style={{ fontSize: 9, color: t.textMuted }}>{(+r.lat).toFixed(5)}, {(+r.lon).toFixed(5)}</div>
            </button>
          ))}
          <button onClick={() => setSearchResults([])} style={{ width: '100%', padding: '6px', background: t.surfaceAlt, border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 10 }}>Fermer</button>
        </div>
      )}

      {/* Street View panel */}
      {streetView && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', zIndex: 10, display: 'flex', flexDirection: 'column', borderTop: `2px solid ${t.accent}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: t.surface, borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>🛣️ Street View — {streetView.lat.toFixed(5)}, {streetView.lng.toFixed(5)}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${streetView.lat},${streetView.lng}`} target="_blank" rel="noopener"
                style={{ padding: '4px 12px', background: '#3b82f620', border: '1px solid #3b82f660', borderRadius: 6, color: '#3b82f6', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                Google Maps ↗
              </a>
              <a href={`https://maps.apple.com/?ll=${streetView.lat},${streetView.lng}&z=18&t=r`} target="_blank" rel="noopener"
                style={{ padding: '4px 12px', background: '#10b98120', border: '1px solid #10b98160', borderRadius: 6, color: '#10b981', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                Apple Maps ↗
              </a>
              <button onClick={closeStreetView} style={{ padding: '4px 12px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
            </div>
          </div>
          <iframe
            src={`https://maps.google.com/maps?q=${streetView.lat},${streetView.lng}&z=18&output=embed&layer=c&cbll=${streetView.lat},${streetView.lng}&cbp=11,0,0,0,0`}
            style={{ flex: 1, border: 'none', width: '100%' }}
            allowFullScreen
          />
        </div>
      )}

      <style>{`
        .map-label-tooltip{background:rgba(0,0,0,.85)!important;color:#fff!important;border:none!important;font-size:11px!important;font-weight:600!important;padding:3px 8px!important;border-radius:4px!important}
        .map-label-tooltip::before{border-top-color:rgba(0,0,0,.85)!important}
        .traj-tooltip{background:rgba(20,30,50,.95)!important;color:#93c5fd!important;border:1px solid #3b82f640!important;font-size:10px!important;font-weight:600!important;padding:4px 10px!important;border-radius:6px!important}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
      `}</style>
    </div>
  );
}
