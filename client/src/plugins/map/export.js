import { fmtDate } from './utils.js';

/** Trigger file download in browser */
function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Escape XML special chars */
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ═══════════════════════════════════════════
// KML — Google Earth / Google Maps / QGIS
// ═══════════════════════════════════════════
export function exportKML(geoPoints, segments, title = 'OSINTMapper') {
  const placemarks = geoPoints.map(p => `
    <Placemark>
      <name>${esc(p.label)}</name>
      <description>${esc(p.source)}${p.date ? ' — ' + fmtDate(p.date) : ''}</description>
      <Style><IconStyle><color>ff${p.color.slice(5, 7)}${p.color.slice(3, 5)}${p.color.slice(1, 3)}</color><scale>1.0</scale></IconStyle></Style>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
      ${p.date ? `<TimeStamp><when>${new Date(p.date).toISOString()}</when></TimeStamp>` : ''}
    </Placemark>`).join('\n');

  const trajectoryLine = segments.length > 0 ? `
    <Placemark>
      <name>Trajectoire</name>
      <Style><LineStyle><color>ff0000ff</color><width>3</width></LineStyle></Style>
      <LineString>
        <coordinates>${[segments[0].from, ...segments.map(s => s.to)].map(p => `${p.lng},${p.lat},0`).join(' ')}</coordinates>
      </LineString>
    </Placemark>` : '';

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(title)}</name>
    <description>Exporté depuis OSINTMapper</description>
    <Folder>
      <name>Points</name>
      ${placemarks}
    </Folder>
    ${trajectoryLine ? `<Folder><name>Trajectoires</name>${trajectoryLine}</Folder>` : ''}
  </Document>
</kml>`;

  download(kml, `${title}.kml`, 'application/vnd.google-earth.kml+xml');
}

// ═══════════════════════════════════════════
// GeoJSON — Leaflet / Mapbox / QGIS / Kepler
// ═══════════════════════════════════════════
export function exportGeoJSON(geoPoints, segments, title = 'OSINTMapper') {
  const features = [];

  // Points
  geoPoints.forEach(p => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        name: p.label, color: p.color, source: p.source,
        date: p.date || null, type: p.type, subtype: p.subtype, entityId: p.id,
      },
    });
  });

  // Trajectory as LineString
  if (segments.length > 0) {
    const coords = [segments[0].from, ...segments.map(s => s.to)].map(p => [p.lng, p.lat]);
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { name: 'Trajectoire', type: 'trajectory', pointCount: coords.length },
    });
  }

  const geojson = { type: 'FeatureCollection', properties: { name: title, exported: new Date().toISOString(), source: 'OSINTMapper' }, features };
  download(JSON.stringify(geojson, null, 2), `${title}.geojson`, 'application/geo+json');
}

// ═══════════════════════════════════════════
// GPX — GPS devices / Strava / Komoot / OsmAnd
// ═══════════════════════════════════════════
export function exportGPX(geoPoints, segments, title = 'OSINTMapper') {
  const wpts = geoPoints.map(p => `
  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${esc(p.label)}</name>
    <desc>${esc(p.source)}${p.date ? ' — ' + fmtDate(p.date) : ''}</desc>
    ${p.date ? `<time>${new Date(p.date).toISOString()}</time>` : ''}
  </wpt>`).join('\n');

  let track = '';
  if (segments.length > 0) {
    const trkpts = [segments[0].from, ...segments.map(s => s.to)].map(p =>
      `      <trkpt lat="${p.lat}" lon="${p.lng}">${p.date ? `<time>${new Date(p.date).toISOString()}</time>` : ''}</trkpt>`
    ).join('\n');
    track = `
  <trk>
    <name>Trajectoire</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>`;
  }

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OSINTMapper"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${esc(title)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
${track}
</gpx>`;

  download(gpx, `${title}.gpx`, 'application/gpx+xml');
}

// ═══════════════════════════════════════════
// CSV — Excel / Google Sheets / tout
// ═══════════════════════════════════════════
export function exportCSV(geoPoints, segments) {
  const header = 'label,latitude,longitude,date,type,subtype,source,color,entityId';
  const rows = geoPoints.map(p =>
    `"${(p.label || '').replace(/"/g, '""')}",${p.lat},${p.lng},"${p.date || ''}","${p.type || ''}","${p.subtype || ''}","${p.source || ''}","${p.color || ''}","${p.id || ''}"`
  );
  download([header, ...rows].join('\n'), 'osintmapper_points.csv', 'text/csv');
}

// ═══════════════════════════════════════════
// EXPORT FORMATS LIST (for UI)
// ═══════════════════════════════════════════
export const EXPORT_FORMATS = [
  { id: 'kml', label: 'KML', desc: 'Google Earth / Maps', icon: '🌍', fn: exportKML },
  { id: 'geojson', label: 'GeoJSON', desc: 'Leaflet / Mapbox / QGIS', icon: '📐', fn: exportGeoJSON },
  { id: 'gpx', label: 'GPX', desc: 'GPS / Strava / OsmAnd', icon: '📡', fn: exportGPX },
  { id: 'csv', label: 'CSV', desc: 'Excel / Sheets', icon: '📊', fn: exportCSV },
];
