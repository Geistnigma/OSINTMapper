import { describe, it, expect, beforeEach } from 'vitest';
import { createPluginEngine, REQUIRED_THEME_KEYS } from './engine.js';

const paletteComplete = Object.fromEntries(REQUIRED_THEME_KEYS.map(k => [k, '#000000']));
const manifesteValide = {
  id: 'demo', name: 'Démo', version: '1.0.0', sdkVersion: '2.1.0',
  category: 'Visualisation', hooks: { 'toolbar-button': { label: 'Démo' } },
};
const Panel = () => null;

beforeEach(() => localStorage.clear());

describe('validation des manifestes', () => {
  it('accepte un manifeste conforme', () => {
    const r = createPluginEngine().register(manifesteValide, { Panel });
    expect(r.ok).toBe(true);
    expect(r.problems).toHaveLength(0);
  });

  it('refuse un hook déclaré sans Panel', () => {
    // Sinon le bouton apparaît et ne fait rien.
    const r = createPluginEngine().register(manifesteValide, {});
    expect(r.ok).toBe(false);
  });

  it('signale une catégorie inconnue', () => {
    const r = createPluginEngine().register({ ...manifesteValide, category: 'Bidon' }, { Panel });
    expect(r.problems.some(p => /catégorie/.test(p.message))).toBe(true);
  });

  it('accepte les permissions api:* apparues avec ctx.api', () => {
    const r = createPluginEngine().register(
      { ...manifesteValide, permissions: ['api:read', 'api:write'] }, { Panel });
    expect(r.problems).toHaveLength(0);
  });
});

describe('thèmes déclaratifs', () => {
  const avecTheme = {
    id: 'th', name: 'Thèmes', version: '1.0.0', sdkVersion: '2.1.0',
    themes: [{ id: 'cafe', name: 'Café', icon: '☕', colors: paletteComplete }],
  };

  it("n'exige ni hook ni Panel quand le plugin n'apporte que des thèmes", () => {
    const r = createPluginEngine().register(avecTheme, {});
    expect(r.ok).toBe(true);
    expect(r.problems).toHaveLength(0);
  });

  it('refuse un thème auquel il manque des couleurs', () => {
    // Une couleur indéfinie ne casse pas un coin de l'écran : elle se propage
    // partout où la clé est lue.
    const r = createPluginEngine().register(
      { ...avecTheme, themes: [{ id: 'x', name: 'X', colors: { bg: '#000' } }] }, {});
    expect(r.ok).toBe(false);
    expect(r.problems.some(p => /couleur\(s\) manquante/.test(p.message))).toBe(true);
  });

  it("n'expose les thèmes qu'une fois le plugin activé", () => {
    const e = createPluginEngine();
    e.register(avecTheme, {});
    expect(Object.keys(e.getThemes())).toHaveLength(0);
    e.enable('th');
    expect(Object.keys(e.getThemes())).toEqual(['th:cafe']);
  });

  it("préfixe les identifiants pour qu'aucun plugin n'en écrase un autre", () => {
    const e = createPluginEngine();
    e.register(avecTheme, {});
    e.register({ ...avecTheme, id: 'autre' }, {});
    e.enable('th'); e.enable('autre');
    expect(Object.keys(e.getThemes()).sort()).toEqual(['autre:cafe', 'th:cafe']);
  });
});

describe('activation', () => {
  it('active par défaut un plugin qui remplace une fonction du cœur', () => {
    const e = createPluginEngine();
    e.register({ ...manifesteValide, defaultEnabled: true }, { Panel });
    expect(e.getByHook('toolbar-button').some(p => p.id === 'demo')).toBe(true);
  });

  it("ne réécrit jamais un choix explicite de l'utilisateur", () => {
    // `disable` écrit `false` ; seule l'ABSENCE de clé vaut « pas encore décidé ».
    const e1 = createPluginEngine();
    e1.register({ ...manifesteValide, defaultEnabled: true }, { Panel });
    e1.disable('demo');
    const e2 = createPluginEngine();
    e2.register({ ...manifesteValide, defaultEnabled: true }, { Panel });
    expect(e2.getByHook('toolbar-button').some(p => p.id === 'demo')).toBe(false);
  });

  it('ne liste pas un plugin désactivé dans les hooks', () => {
    const e = createPluginEngine();
    e.register(manifesteValide, { Panel });
    expect(e.getByHook('toolbar-button')).toHaveLength(0);
  });
});
