/**
 * Rendu réel des écrans, dans les trois langues.
 *
 * Deux pannes d'affilée ont échappé aux tests ET au build :
 *   - `useT` appelé sans import  → page blanche au chargement ;
 *   - `tr` appelé dans `EntityView`, composant voisin de `EntityPanel`, sans
 *     déclaration → page blanche au clic sur une entité.
 *
 * Les deux ne se manifestent qu'au RENDU. Les contrôles statiques attrapent la
 * classe d'erreurs ; monter les écrans prouve qu'ils fonctionnent.
 */
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { I18nProvider } from './index.jsx';
import EntityPanel from '../components/EntityPanel.jsx';
import ToolbarMenu from '../components/ToolbarMenu.jsx';
import ReplayBar from '../components/ReplayBar.jsx';
import { useConstantes } from '../lib/constantesTraduites.js';
import fr from './fr.js';
import en from './en.js';
import de from './de.js';

const theme = {
  bg: '#0d1117', surface: '#161b22', surfaceAlt: '#1c2333', border: '#2a3140', borderHi: '#3d4868',
  text: '#e2e4ed', textSecondary: '#8b8fa8', textMuted: '#626a80', accent: '#58a6ff',
  success: '#10b981', warning: '#f59e0b', danger: '#ef4444', shadow: '#0008', itemHover: '#222',
};

const entite = {
  id: 'e1', type: 'person', subtype: 'person_male', label: 'Thomas L.',
  description: '', notes: '', x: 10, y: 10, color: '#6366f1',
  metadata: { status: 'unverified' }, comments: [], author: 'moi', createdAt: new Date().toISOString(),
};

let conteneur, racine;
beforeEach(() => {
  conteneur = document.createElement('div'); document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
});
afterEach(() => { act(() => racine.unmount()); conteneur.remove(); localStorage.clear(); });

async function monter(element, langue = 'fr') {
  localStorage.setItem('om_lang', langue);
  // Racine neuve à chaque montage : le fournisseur lit la langue UNE FOIS, au
  // premier rendu. Re-rendre dans la même racine garderait la langue
  // précédente - ce qui simulerait mal un chargement de page.
  await act(async () => racine.unmount());
  racine = createRoot(conteneur);
  await act(async () => {
    racine.render(<I18nProvider><MemoryRouter>{element}</MemoryRouter></I18nProvider>);
  });
  await act(async () => { await Promise.resolve(); });
}

/**
 * Reproduit le câblage réel : le monolithe passe `useConstantes()`, dont les
 * libellés suivent la langue du fournisseur. Fabriquer les constantes hors du
 * contexte les figerait, et le test ne verrait pas la traduction opérer.
 */
function Panneau(props) {
  const cst = useConstantes();
  return (
  <EntityPanel
    open entity={entite} link={null} t={theme}
    caseId="c1" userName="moi" collab={{ connected: false, send: () => {} }}
    stickers={[]} postits={[]} setSelectedId={() => {}} selectedId="e1" selectedLinkId={null}
    onClose={() => {}} onCloseLink={() => {}}
    updateEntity={() => {}} deleteEntity={() => {}} duplicateEntity={() => {}}
    updateLink={() => {}} deleteLink={() => {}} addEntity={() => {}} addLink={() => {}}
    links={[]} entities={[entite]} linkCount={() => 0}
    setLinkingFrom={() => {}} setHoldActive={() => {}} logAction={() => {}} genId={() => 'x'}
    CATEGORIES={cst.CATEGORIES} ALL_ITEMS={cst.ALL_ITEMS} LINK_TYPES={cst.LINK_TYPES}
    Icons={{}} isViewer={false} normalizeAddress={(a) => a} getStrengthFromConfidence={() => 'confirmed'}
    pluginEngine={null} {...props}
  />
  );
}

const panneau = (props = {}) => <Panneau {...props} />;

describe("panneau d'entité", () => {
  it('rend la fiche sans erreur — le clic sur une entité', async () => {
    await monter(panneau());
    expect(conteneur.textContent).toContain(fr['panneau.champ.nom']);
    expect(conteneur.textContent).toContain('Thomas L.');
  });

  it('rend en anglais', async () => {
    await monter(panneau(), 'en');
    expect(conteneur.textContent).toContain(en['panneau.champ.nom']);
  });

  it("rend aussi en lecture seule", async () => {
    await monter(panneau({ isViewer: true }));
    expect(conteneur.textContent).toContain(fr['panneau.champ.nom']);
  });

  it("n'affiche aucune clé brute", async () => {
    for (const l of ['fr', 'en', 'de']) {
      await monter(panneau(), l);
      expect(conteneur.textContent).not.toMatch(/\b(panneau|otan|commun|entites|liens)\.[a-zA-Z]/);
    }
  });
});

describe('autres composants', () => {
  it('ToolbarMenu rend son menu vide', async () => {
    await monter(<ToolbarMenu label="Test" icon="⚙️" items={[]} theme={theme} />);
    expect(conteneur.textContent).toBeTruthy();
  });

  it('ReplayBar rend le cas « aucune date »', async () => {
    await monter(<ReplayBar graphe={{ entities: [], links: [], stickers: [], postits: [] }}
      instant={0} setInstant={() => {}} theme={theme} onClose={() => {}} />);
    expect(conteneur.textContent).toContain(fr['replay.impossible']);
  });
});

/**
 * Le monolithe — l'écran du graphe, 1 873 lignes.
 *
 * En mode solo il n'ouvre aucune socket (`collabMode={false}`), on peut donc le
 * monter tel quel. C'est le seul moyen de prouver que ses ~200 appels à `tr`
 * s'exécutent : les deux pannes précédentes n'étaient visibles qu'au rendu.
 */
describe('écran du graphe', () => {
  it('se monte en mode solo sans erreur', async () => {
    const { default: OSINTMapper } = await import('../legacy/OSINTMapper.jsx');
    await monter(<OSINTMapper caseId="c1" userName="moi" userRole="ANALYST"
      onQuit={() => {}} collabMode={false} />);
    // Un rendu vide signifierait un composant qui a échoué en silence.
    expect(conteneur.textContent.length).toBeGreaterThan(50);
    expect(conteneur.textContent).not.toMatch(/\b(graphe|collab|menu|statut|sticker)\.[a-zA-Z]/);
  });

  it("propose le changement de langue depuis le menu ⚙️", async () => {
    const { default: OSINTMapper } = await import('../legacy/OSINTMapper.jsx');
    await monter(<OSINTMapper caseId="c1" userName="moi" userRole="ANALYST"
      onQuit={() => {}} collabMode={false} />);
    // Le menu est fermé au départ : on l'ouvre par son bouton.
    const reglages = [...conteneur.querySelectorAll('button')]
      .find(b => b.getAttribute('title') === fr['graphe.outil.reglages']);
    expect(reglages).toBeTruthy();
    await act(async () => { reglages.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(conteneur.textContent).toContain(fr['menu.section.langue']);
    for (const nom of ['Français', 'English', 'Deutsch']) expect(conteneur.textContent).toContain(nom);
  });

  it("affiche l'état « Sauvegarde auto » traduit, en haut à gauche", async () => {
    const { default: OSINTMapper } = await import('../legacy/OSINTMapper.jsx');
    await monter(<OSINTMapper caseId="c1" userName="moi" userRole="ANALYST"
      onQuit={() => {}} collabMode={false} />, 'en');
    expect(conteneur.textContent).toContain(en['graphe.etat.sauvegardeAuto']);
    expect(conteneur.textContent).not.toContain('Sauvegarde auto');
  });

  it('affiche la barre latérale traduite en anglais', async () => {
    const { default: OSINTMapper } = await import('../legacy/OSINTMapper.jsx');
    await monter(<OSINTMapper caseId="c1" userName="moi" userRole="ANALYST"
      onQuit={() => {}} collabMode={false} />, 'en');
    expect(conteneur.textContent).toContain(en['graphe.entites']);
  });
});

/** La documentation d'un plugin doit suivre la langue de l'interface. */
describe('documentation des plugins', () => {
  it('affiche la doc dans la langue courante, avec repli sur le français', async () => {
    const { default: DocViewer } = await import('../plugins/core/DocViewer.jsx');
    const plugin = {
      id: 'demo', name: 'Démo',
      docs: '# Titre français',
      docsI18n: { fr: '# Titre français', en: '# English title' },
    };
    await monter(<DocViewer plugin={plugin} theme={theme} />, 'en');
    expect(conteneur.textContent).toContain('English title');

    await monter(<DocViewer plugin={plugin} theme={theme} />, 'de');
    // Pas de version allemande : on retombe sur le français plutôt que sur du vide.
    expect(conteneur.textContent).toContain('Titre français');
  });

  it('annonce proprement une documentation absente', async () => {
    const { default: DocViewer } = await import('../plugins/core/DocViewer.jsx');
    await monter(<DocViewer plugin={{ id: 'x', name: 'X' }} theme={theme} />, 'en');
    expect(conteneur.textContent).toContain(en['plugins.aucuneDoc']);
  });
});

/** Le magasin d'extensions : métadonnées des plugins et filtre par catégorie. */
describe("magasin d'extensions", () => {
  const moteur = {
    getAll: () => ([
      { id: 'map', name: 'Carte géographique', description: 'Carte interactive…', category: 'Visualisation', version: '1.0.0', enabled: false, source: 'built-in' },
      { id: 'tiers', name: 'Third-party thing', description: 'Whatever it does', category: 'Enrichissement', version: '2.0.0', enabled: false, source: 'runtime' },
    ]),
    // Le magasin appelle aussi ces méthodes au rendu : un faux moteur
    // incomplet plante avant même d'afficher quoi que ce soit.
    stats: () => ({ total: 2, enabled: 0, withPanel: 1 }),
    toggle: () => {}, enableAll: () => {}, disableAll: () => {},
    isEnabled: () => false, enable: () => {}, disable: () => {},
  };

  it('traduit le nom des plugins natifs et laisse celui des autres', async () => {
    const { default: PluginStore } = await import('../plugins/core/PluginStore.jsx');
    await monter(<PluginStore engine={moteur} theme={theme} onClose={() => {}} isAdmin={false} />, 'en');
    expect(conteneur.textContent).toContain('Geographic map');       // natif : traduit
    expect(conteneur.textContent).toContain('Third-party thing');    // tiers : texte du manifeste
    expect(conteneur.textContent).not.toContain('Carte géographique');
  });

  it('traduit les catégories, sentinelle « tout » comprise', async () => {
    const { default: PluginStore } = await import('../plugins/core/PluginStore.jsx');
    await monter(<PluginStore engine={moteur} theme={theme} onClose={() => {}} isAdmin={false} />, 'en');
    expect(conteneur.textContent).toContain(en['store.tout']);
    expect(conteneur.textContent).toContain(en['plugin.cat.Enrichissement']);
    // La sentinelle ne doit jamais s'afficher telle quelle.
    expect(conteneur.textContent).not.toContain('__toutes');
  });
});

/** Les libellés de plugin doivent être identiques partout, et traduits. */
describe('libellés de plugin', () => {
  it('résout le libellé du hook, puis le nom, puis le manifeste', async () => {
    const { libellePlugin, nomPlugin } = await import('../lib/constantesTraduites.js');
    // Monter le fournisseur en anglais : `traduire` lit la langue courante.
    await monter(<span />, 'en');

    const carte = { id: 'map', manifest: { id: 'map', name: 'Carte géographique' }, hookConfig: { label: 'Carte' } };
    expect(libellePlugin(carte, 'toolbar-button')).toBe(en['plugin.map.hook.toolbar-button']);
    expect(nomPlugin(carte)).toBe(en['plugin.map.name']);

    // Plugin déposé à l'exécution : aucune clé, on garde son propre texte.
    const tiers = { id: 'zzz', manifest: { id: 'zzz', name: 'Third-party' }, hookConfig: { label: 'Custom tab' } };
    expect(libellePlugin(tiers, 'entity-tab')).toBe('Custom tab');
    expect(nomPlugin(tiers)).toBe('Third-party');
  });

  it("retombe sur le nom du plugin quand le hook n'a pas de libellé propre", async () => {
    const { libellePlugin } = await import('../lib/constantesTraduites.js');
    await monter(<span />, 'de');
    const hist = { id: 'history', manifest: { id: 'history', name: 'Historique de versions' }, hookConfig: {} };
    expect(libellePlugin(hist, 'toolbar-button')).toBe(de['plugin.history.hook.toolbar-button']);
  });
});
