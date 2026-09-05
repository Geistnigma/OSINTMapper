/**
 * Contenu des fichiers exportés par le plugin carte.
 *
 * Les libellés (« Points », « Trajectoire ») partent dans le KML ou le GPX et
 * s'affichent dans Google Earth ou Garmin. Ils suivent donc la langue de qui
 * exporte : le fichier accompagne l'analyste, pas l'instance.
 *
 * Ce test vérifie surtout qu'aucun gabarit `${…}` ne sort non interpolé - une
 * traduction insérée dans une chaîne simple au lieu d'un littéral de gabarit
 * produirait un fichier contenant le code source à la place du mot.
 */
import { describe, it, expect } from 'vitest';
import { exportKML, exportGeoJSON, exportGPX } from './export.js';
import fr from '../../i18n/fr.js';

const points = [
  { label: 'A', lat: 48.85, lng: 2.35, color: '#ff0000', type: 'person' },
  { label: 'B', lat: 45.76, lng: 4.83, color: '#00ff00', type: 'person' },
];
const segments = [{ from: points[0], to: points[1] }];

/** Capture le contenu passé au téléchargement, sans toucher au DOM. */
function contenu(fn) {
  const vrai = globalThis.URL?.createObjectURL;
  let texte = '';
  globalThis.URL = globalThis.URL || {};
  globalThis.URL.createObjectURL = (blob) => { texte = blob._texte || ''; return 'blob:x'; };
  const VraiBlob = globalThis.Blob;
  globalThis.Blob = class { constructor(parts) { this._texte = parts.join(''); texte = this._texte; } };
  try { fn(); } catch { /* le téléchargement lui-même n'a pas d'importance ici */ }
  globalThis.Blob = VraiBlob;
  if (vrai) globalThis.URL.createObjectURL = vrai;
  return texte;
}

describe('export de la carte', () => {
  it('le KML porte les libellés traduits, sans gabarit résiduel', () => {
    const kml = contenu(() => exportKML(points, segments));
    expect(kml).toContain(fr['carte.export.points']);
    expect(kml).toContain(fr['carte.export.depuis']);
    expect(kml).not.toContain('${');
  });

  it('le GPX ne laisse pas de gabarit non interpolé', () => {
    const gpx = contenu(() => exportGPX(points, segments));
    expect(gpx).not.toContain('${');
  });

  it('le GeoJSON nomme la trajectoire dans la langue courante', () => {
    const geo = contenu(() => exportGeoJSON(points, segments));
    expect(geo).toContain(fr['carte.export.trajectoire']);
    expect(geo).not.toContain('${');
  });
});
