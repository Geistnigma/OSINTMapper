import { describe, it, expect, beforeEach } from 'vitest';
import { createPluginEngine } from './engine.js';

/**
 * Plugins recommandés par une enquête.
 *
 * L'activation d'un plugin est une préférence **par utilisateur** (localStorage
 * pour les natifs, table PluginPreference pour ceux installés à l'exécution).
 * Une enquête ne peut donc pas l'imposer : elle *recommande*, et
 * `applyCaseDefaults` ne comble que l'absence de décision - exactement la règle
 * de `defaultEnabled`.
 *
 * Sans cette nuance, ouvrir une enquête réactiverait des plugins que
 * l'utilisateur a délibérément désactivés, à chaque ouverture.
 */
const Panel = () => null;
const manifeste = (id) => ({
  id, name: id, version: '1.0.0', sdkVersion: '2.1.0',
  hooks: { 'toolbar-button': { label: id } },
});

const moteurAvec = (...ids) => {
  const e = createPluginEngine();
  for (const id of ids) e.register(manifeste(id), { Panel });
  return e;
};

beforeEach(() => localStorage.clear());

describe('applyCaseDefaults', () => {
  it('active un plugin sur lequel l’utilisateur ne s’est jamais prononcé', () => {
    const e = moteurAvec('demo-a', 'demo-b');
    expect(e.applyCaseDefaults(['demo-a'])).toEqual(['demo-a']);
    expect(e.getByHook('toolbar-button').map(p => p.id)).toEqual(['demo-a']);
  });

  it('respecte une désactivation explicite', () => {
    // Le cas qui compte : l'utilisateur a dit non, l'enquête ne doit pas
    // revenir dessus à chaque ouverture.
    const e = moteurAvec('demo-a');
    e.disable('demo-a');
    expect(e.applyCaseDefaults(['demo-a'])).toEqual([]);
    expect(e.getByHook('toolbar-button')).toHaveLength(0);
  });

  it('ne réactive pas non plus après un cycle activer → désactiver', () => {
    const e = moteurAvec('demo-a');
    e.enable('demo-a');
    e.disable('demo-a');
    expect(e.applyCaseDefaults(['demo-a'])).toEqual([]);
  });

  it('ignore un plugin absent de ce poste', () => {
    // L'enquête peut recommander un plugin que ce navigateur n'a pas.
    const e = moteurAvec('demo-a');
    expect(e.applyCaseDefaults(['inexistant'])).toEqual([]);
  });

  it('n’a aucun effet si le plugin est déjà activé', () => {
    const e = moteurAvec('demo-a');
    e.enable('demo-a');
    expect(e.applyCaseDefaults(['demo-a'])).toEqual([]);
    expect(e.getByHook('toolbar-button')).toHaveLength(1);
  });

  it('tolère une liste vide ou absente', () => {
    const e = moteurAvec('demo-a');
    expect(e.applyCaseDefaults([])).toEqual([]);
    expect(e.applyCaseDefaults()).toEqual([]);
  });

  it('active plusieurs plugins et rend ceux qui l’ont été', () => {
    const e = moteurAvec('demo-a', 'demo-b', 'demo-c');
    e.disable('demo-b');
    expect(e.applyCaseDefaults(['demo-a', 'demo-b', 'demo-c']).sort())
      .toEqual(['demo-a', 'demo-c']);
  });

  it('persiste le choix pour la session suivante', () => {
    moteurAvec('demo-a').applyCaseDefaults(['demo-a']);
    // Un nouveau moteur relit localStorage : le plugin doit rester actif.
    expect(moteurAvec('demo-a').getByHook('toolbar-button').map(p => p.id)).toEqual(['demo-a']);
  });
});
