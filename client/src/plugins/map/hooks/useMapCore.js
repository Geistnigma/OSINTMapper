import { useEffect, useRef, useState, useCallback } from 'react';
import { loadLeaflet, TILES } from '../utils.js';

/**
 * Core map hook — creates the Leaflet map once and manages tiles.
 * Returns: { map, L, ready, setTile, tile }
 * The map is NEVER destroyed and recreated on state changes — only layers are updated.
 */
export function useMapCore(mapRef, initialTile = 'dark') {
  const mapInst = useRef(null);
  const tileLayerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [tile, setTileState] = useState(initialTile);
  const LRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || mapInst.current) return;
      LRef.current = L;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([46.6, 2.3], 5);
      L.control.zoom({ position: 'topright' }).addTo(map);
      const t = TILES[initialTile] || TILES.dark;
      tileLayerRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map);
      mapInst.current = map;
      setTimeout(() => map.invalidateSize(), 100);
      setReady(true);
    });
    return () => { cancelled = true; if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; } };
  }, []);

  // Change tiles without re-creating map
  const setTile = useCallback((t) => {
    setTileState(t);
    if (!mapInst.current || !LRef.current || !tileLayerRef.current) return;
    const spec = TILES[t] || TILES.dark;
    mapInst.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = LRef.current.tileLayer(spec.url, { attribution: spec.attr, maxZoom: 19 }).addTo(mapInst.current);
  }, []);

  return { map: mapInst.current, L: LRef.current, ready, tile, setTile };
}
