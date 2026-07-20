import { fmtDate } from '../utils.js';

/**
 * Render markers layer. Call on data/selection change.
 * Returns the layer group (caller manages add/remove).
 */
export function renderMarkers(L, map, geoPoints, { selectedId, setSelectedId, showLabels, openStreetView }) {
  const layer = L.layerGroup();
  const bounds = [];

  geoPoints.forEach(p => {
    const isSel = p.id === selectedId;
    const hasDt = !!p.timestamp;
    const r = isSel ? 12 : hasDt ? 9 : 7;
    const mk = L.circleMarker([p.lat, p.lng], {
      radius: r, fillColor: p.color, color: isSel ? '#fff' : '#000',
      weight: isSel ? 3 : 1.5, fillOpacity: 0.9, opacity: 0.8,
    }).addTo(layer);

    let html = `<div style="min-width:140px"><b style="font-size:13px">${p.label}</b><br/><small style="color:#888">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small>`;
    if (p.date) html += `<br/><small style="color:#60a5fa">📅 ${fmtDate(p.date)}</small>`;
    html += `<br/><a href="#" class="sv-link" data-lat="${p.lat}" data-lng="${p.lng}" style="font-size:11px;color:#f59e0b;text-decoration:none;font-weight:600">🛣️ Street View</a>`;
    html += '</div>';
    mk.bindPopup(html);

    // Street View click handler via event delegation
    mk.on('popupopen', () => {
      setTimeout(() => {
        const svLink = document.querySelector('.sv-link');
        if (svLink) svLink.onclick = (e) => { e.preventDefault(); openStreetView?.(+svLink.dataset.lat, +svLink.dataset.lng); };
      }, 50);
    });

    if (showLabels) mk.bindTooltip(p.label, { permanent: false, direction: 'top', offset: [0, -8], className: 'map-label-tooltip' });
    mk.on('click', () => setSelectedId?.(p.id));
    bounds.push([p.lat, p.lng]);
  });

  return { layer, bounds };
}
