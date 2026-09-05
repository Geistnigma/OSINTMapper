import { haversine, fmtDist } from '../utils.js';
import { traduire } from '../../../i18n';

/**
 * Render radius circles with individual delete on click.
 */
export function renderRadiusCircles(L, map, circles, onRemove) {
  const layer = L.layerGroup();
  circles.forEach(c => {
    const circle = L.circle([c.lat, c.lng], {
      radius: c.radius, color: '#f59e0b', fillColor: '#f59e0b',
      fillOpacity: 0.08, weight: 2, dashArray: '6 3',
    }).addTo(layer);

    // Label
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: '', iconSize: [0, 0],
        html: `<div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer" title="${traduire('carte.clicSupprimer')}">${fmtDist(c.radius)} ✕</div>`,
      }),
    }).addTo(layer).on('click', () => onRemove(c.id));

    // Click on circle edge to remove too
    circle.on('click', () => onRemove(c.id));
  });
  return layer;
}

/**
 * Render distance measurement line + live preview.
 * @param {Array} points - confirmed points [{lat,lng}]
 * @param {object|null} cursor - current mouse position {lat,lng} for live preview
 */
export function renderDistanceLine(L, map, points, cursor) {
  const layer = L.layerGroup();
  const allPts = [...points];
  if (allPts.length === 1 && cursor) allPts.push(cursor);

  if (allPts.length >= 2) {
    // Polyline through all points
    L.polyline(allPts.map(p => [p.lat, p.lng]), { color: '#ef4444', weight: 3, dashArray: '4 6' }).addTo(layer);

    // Point markers
    allPts.forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 5, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1,
      }).addTo(layer);
    });

    // Segment distances
    let totalDist = 0;
    for (let i = 0; i < allPts.length - 1; i++) {
      const a = allPts[i], b = allPts[i + 1];
      const d = haversine(a.lat, a.lng, b.lat, b.lng);
      totalDist += d;
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      L.marker([mid.lat, mid.lng], {
        icon: L.divIcon({
          className: '', iconSize: [0, 0],
          html: `<div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap">${fmtDist(d)}</div>`,
        }),
      }).addTo(layer);
    }

    // Total if more than 2 points
    if (allPts.length > 2) {
      const last = allPts[allPts.length - 1];
      L.marker([last.lat, last.lng], {
        icon: L.divIcon({
          className: '', iconSize: [0, 0],
          html: `<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap">Total: ${fmtDist(totalDist)}</div>`,
        }),
      }).addTo(layer);
    }
  } else if (allPts.length === 1) {
    L.circleMarker([allPts[0].lat, allPts[0].lng], {
      radius: 5, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1,
    }).addTo(layer);
  }

  return { layer, totalDist: allPts.length >= 2 ? (() => { let d = 0; for (let i = 0; i < allPts.length - 1; i++) d += haversine(allPts[i].lat, allPts[i].lng, allPts[i + 1].lat, allPts[i + 1].lng); return d; })() : null };
}

/**
 * Render freehand drawing shape (polygon outline with area/perimeter).
 */
export function renderFreehand(L, map, points) {
  const layer = L.layerGroup();
  if (points.length < 2) return layer;

  L.polyline(points.map(p => [p.lat, p.lng]), { color: '#a855f7', weight: 2, opacity: 0.8 }).addTo(layer);

  // Calculate perimeter
  let perim = 0;
  for (let i = 0; i < points.length - 1; i++) {
    perim += haversine(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }

  const last = points[points.length - 1];
  L.marker([last.lat, last.lng], {
    icon: L.divIcon({
      className: '', iconSize: [0, 0],
      html: `<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#a855f7;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap">${fmtDist(perim)}</div>`,
    }),
  }).addTo(layer);

  return layer;
}
