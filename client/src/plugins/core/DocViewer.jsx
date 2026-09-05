import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useT, useLangue } from '../../i18n';

/**
 * Rendu de la documentation d'un plugin.
 *
 * Le contenu vient du champ `docs` d'un bundle déposé dans le Plugin Store :
 * c'est de la donnée d'origine externe, injectée en `dangerouslySetInnerHTML`.
 * Elle DOIT passer par DOMPurify. La version précédente construisait le HTML par
 * une chaîne de `replace()` sans échapper autre chose que les blocs de code -
 * un `<img src=x onerror=...>` dans une doc s'exécutait chez tout utilisateur
 * consultant la fiche du plugin.
 */

marked.setOptions({
  gfm: true,
  breaks: true, // un retour à la ligne simple reste un <br>, comme avant
});

/**
 * DOMPurify autorise `<form>` et ses champs par défaut : une documentation
 * pouvait donc afficher un formulaire postant vers un domaine externe, soit de
 * l'hameçonnage servi depuis l'application elle-même. Une documentation n'a
 * aucun besoin d'éléments interactifs.
 */
const PURIFY_OPTS = {
  FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'label'],
  FORBID_ATTR: ['formaction', 'action'],
};

// Les liens d'une doc pointent vers l'extérieur : nouvelle fenêtre, et `noopener`
// pour que la page ouverte ne puisse pas manipuler `window.opener`.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Feuille de style locale : le HTML produit par marked est nu, sans style inline. */
function styles(t) {
  return `
.om-md { line-height: 1.7; }
.om-md > *:first-child { margin-top: 0; }
.om-md h1 { font-size: 20px; font-weight: 800; margin: 0 0 12px; }
.om-md h2 { font-size: 17px; font-weight: 800; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 1px solid ${t.border}; }
.om-md h3 { font-size: 15px; font-weight: 700; margin: 20px 0 8px; }
.om-md h4 { font-size: 14px; font-weight: 700; margin: 16px 0 6px; }
.om-md p { margin: 8px 0; }
.om-md a { color: #58a6ff; text-decoration: none; }
.om-md a:hover { text-decoration: underline; }
.om-md ul, .om-md ol { padding-left: 22px; margin: 8px 0; }
.om-md li { margin: 3px 0; }
.om-md code { background: ${t.surfaceAlt}; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.om-md pre { background: ${t.bg}; border: 1px solid ${t.border}; border-radius: 8px; padding: 14px; overflow-x: auto; font-size: 12px; line-height: 1.6; }
.om-md pre code { background: none; padding: 0; }
.om-md blockquote { border-left: 3px solid #3b82f6; padding: 4px 12px; margin: 8px 0; opacity: .8; font-style: italic; }
.om-md hr { border: none; border-top: 1px solid ${t.border}; margin: 16px 0; }
.om-md table { border-collapse: collapse; width: 100%; margin: 12px 0; display: block; overflow-x: auto; }
.om-md th, .om-md td { padding: 6px 12px; border: 1px solid ${t.border}; font-size: 12px; text-align: left; }
.om-md th { font-weight: 700; background: ${t.surfaceAlt}; padding: 8px 12px; }
.om-md img { max-width: 100%; }
`;
}

export default function DocViewer({ plugin, theme: t }) {
  const tr = useT();
  const { langue } = useLangue();

  // Documentation dans la langue de l'interface, à défaut en français : une
  // traduction manquante vaut mieux qu'une page vide.
  const source = plugin.docsI18n?.[langue] || plugin.docsI18n?.fr || plugin.docs;

  const rendered = useMemo(
    () => DOMPurify.sanitize(marked.parse(source || `_${tr('plugins.aucuneDoc')}_`), PURIFY_OPTS),
    [source, tr],
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px', color: t.text, fontSize: 13, maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <style>{styles(t)}</style>
      <div className="om-md" dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  );
}
