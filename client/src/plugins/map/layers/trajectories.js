import { haversine, fmtDist, fmtDate, bearingDeg, arrowIcon } from '../utils.js';

/**
 * Render trajectories layer.
 * @param {object} opts - { segments, datedPoints, trajColor, animating, animStep }
 */
export function renderTrajectories(L, map, { segments, datedPoints, trajColor, animating, animStep }) {
  const layer = L.layerGroup();
  const visibleSegments = animating ? segments.slice(0, animStep + 1) : segments;

  visibleSegments.forEach(seg => {
    const color = trajColor || seg.color;
    const line = L.polyline(
      [[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]],
      { color, weight: 3, opacity: 0.8, dashArray: '8 4' }
    ).addTo(layer);

    // Arrow at midpoint
    const midLat = (seg.from.lat + seg.to.lat) / 2;
    const midLng = (seg.from.lng + seg.to.lng) / 2;
    const ang = bearingDeg(seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng);
    L.marker([midLat, midLng], { icon: arrowIcon(L, color, ang), interactive: false }).addTo(layer);

    // Tooltip with distance
    const dist = haversine(seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng);
    line.bindTooltip(`${fmtDate(seg.from.date)} → ${fmtDate(seg.to.date)}<br/>${fmtDist(dist)}`, { sticky: true, className: 'traj-tooltip' });
  });

  // Animated pulsing marker
  if (animating && datedPoints.length > 0) {
    const pt = datedPoints[Math.min(animStep, datedPoints.length - 1)];
    const pulseIcon = L.divIcon({
      className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      html: `<div style="width:24px;height:24px;border-radius:50%;background:${pt.color};border:3px solid #fff;box-shadow:0 0 12px ${pt.color},0 0 24px ${pt.color}80;animation:pulse 1s infinite"></div>`,
    });
    L.marker([pt.lat, pt.lng], { icon: pulseIcon, zIndexOffset: 1000 }).addTo(layer);
  }

  return layer;
}
