/**
 * Rendu réel dans les trois langues.
 *
 * Les tests de clés vérifient les dictionnaires, celui des imports vérifie les
 * fichiers ; ni l'un ni l'autre ne prouve que l'application s'affiche. Ce test
 * monte un écran complet et lit le texte rendu - c'est le seul niveau où une
 * panne comme « useT is not defined » se manifeste.
 */
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from './index.jsx';
import Login from '../pages/Login.jsx';
import fr from './fr.js';
import en from './en.js';
import de from './de.js';

let conteneur, racine;
beforeEach(() => {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { act(() => racine.unmount()); conteneur.remove(); localStorage.clear(); });

async function monter(langue) {
  localStorage.setItem('om_lang', langue);
  await act(async () => {
    racine.render(<I18nProvider><MemoryRouter><Login /></MemoryRouter></I18nProvider>);
  });
  // Les dictionnaires autres que le français arrivent par import() : on laisse
  // la micro-tâche se résoudre avant de lire le DOM.
  await act(async () => { await Promise.resolve(); });
}

describe("l'écran de connexion", () => {
  it('rend sans erreur en français', async () => {
    await monter('fr');
    expect(conteneur.textContent).toContain(fr['login.identifiant']);
    expect(conteneur.textContent).toContain(fr['login.motDePasse']);
  });

  it('rend en anglais', async () => {
    await monter('en');
    expect(conteneur.textContent).toContain(en['login.identifiant']);
    expect(conteneur.textContent).not.toContain(fr['login.motDePasse']);
  });

  it('rend en allemand', async () => {
    await monter('de');
    expect(conteneur.textContent).toContain(de['login.identifiant']);
  });

  it("n'affiche jamais une clé brute", async () => {
    for (const l of ['fr', 'en', 'de']) {
      await monter(l);
      expect(conteneur.textContent).not.toMatch(/\b(login|commun|erreurs)\.[a-zA-Z]/);
    }
  });

  it('propose les trois langues', async () => {
    await monter('fr');
    const drapeaux = [...conteneur.querySelectorAll('[aria-pressed]')];
    expect(drapeaux).toHaveLength(3);
    expect(drapeaux.filter(b => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});
