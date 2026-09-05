/**
 * Comportement de la saisie d'étiquettes en bulles.
 *
 * Le projet n'embarque pas @testing-library : on monte le composant avec
 * react-dom et on pilote de vrais événements DOM. C'est plus verbeux, mais ça
 * évite une dépendance de plus pour un seul composant, et ça teste exactement
 * ce que fait le navigateur.
 */
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TagInput from './TagInput.jsx';
import { I18nProvider } from '../i18n';

const t = { bg: '#000', border: '#333', accent: '#58a6ff', text: '#fff', textMuted: '#888' };

let conteneur, racine;
beforeEach(() => {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { act(() => racine.unmount()); conteneur.remove(); });

const monter = (tags, onChange) => act(() => {
  racine.render(<I18nProvider><TagInput tags={tags} onChange={onChange} t={t} /></I18nProvider>);
});
const champ = () => conteneur.querySelector('input');
const bulles = () => [...conteneur.querySelectorAll('span')].filter(s => s.querySelector('button'));

function saisir(valeur) {
  const input = champ();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, valeur); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function toucher(key) {
  act(() => champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

describe('TagInput', () => {
  it('affiche une bulle par étiquette', () => {
    monter(['fraude', 'lyon'], () => {});
    expect(bulles()).toHaveLength(2);
    expect(conteneur.textContent).toContain('fraude');
    expect(conteneur.textContent).toContain('lyon');
  });

  it('la virgule valide l\'étiquette en cours', () => {
    const onChange = vi.fn();
    monter([], onChange);
    saisir('fraude');
    toucher(',');
    expect(onChange).toHaveBeenCalledWith(['fraude']);
  });

  it('Entrée valide aussi', () => {
    const onChange = vi.fn();
    monter([], onChange);
    saisir('lyon');
    toucher('Enter');
    expect(onChange).toHaveBeenCalledWith(['lyon']);
  });

  it('une virgule collée découpe la saisie', () => {
    const onChange = vi.fn();
    monter([], onChange);
    saisir('fraude, lyon, crypto');
    expect(onChange).toHaveBeenCalledWith(['fraude', 'lyon', 'crypto']);
  });

  it('la croix retire l\'étiquette visée', () => {
    const onChange = vi.fn();
    monter(['fraude', 'lyon'], onChange);
    act(() => bulles()[0].querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalledWith(['lyon']);
  });

  it('retour arrière sur un champ vide retire la dernière', () => {
    const onChange = vi.fn();
    monter(['a', 'b'], onChange);
    toucher('Backspace');
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('retour arrière ne retire rien tant qu\'on écrit', () => {
    const onChange = vi.fn();
    monter(['a'], onChange);
    saisir('en cours');
    toucher('Backspace');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('un doublon ne crée pas de seconde bulle', () => {
    const onChange = vi.fn();
    monter(['fraude'], onChange);
    saisir('FRAUDE');
    toucher(',');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chaque croix porte un libellé accessible', () => {
    monter(['fraude'], () => {});
    expect(conteneur.querySelector('button').getAttribute('aria-label')).toBe("Retirer l'étiquette fraude");   // dictionnaire FR par défaut
  });
});
