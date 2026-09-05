import React, { useRef, useState } from 'react';
import { ajouterTags, retirerTag, TAGS_MAX } from '../lib/tags';
import { useT } from '../i18n';

/**
 * Chip-style tag input.
 *
 * A comma commits the tag being typed, as do Enter and Tab. Backspace on an
 * empty field removes the last one - the expected gesture, and without it you
 * would have to aim at a 12-pixel cross to fix a typo.
 *
 * The border is carried by the container, not by the `<input>`: chips and
 * caret then share the same box, which grows over several lines.
 */
export default function TagInput({ tags, onChange, t, placeholder }) {
  const tr = useT();
  const [saisie, setSaisie] = useState('');
  const [focus, setFocus] = useState(false);
  const champ = useRef(null);

  const valider = (texte) => {
    const { liste } = ajouterTags(tags, texte);
    if (liste.length !== tags.length) onChange(liste);
    setSaisie('');
  };

  const surTouche = (e) => {
    if (e.key === ',' || e.key === 'Enter' || e.key === 'Tab') {
      if (!saisie.trim()) return;            // Tab keeps its navigation role
      e.preventDefault();
      valider(saisie);
    } else if (e.key === 'Backspace' && !saisie && tags.length) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  // A comma can also arrive by paste or by voice input, without going through
  // keydown: we therefore handle it on change as well.
  const surSaisie = (e) => {
    const v = e.target.value;
    if (/[,\n\r\t;]/.test(v)) valider(v);
    else setSaisie(v.slice(0, 64));
  };

  const plein = tags.length >= TAGS_MAX;

  return (
    <div>
      <div
        onClick={() => champ.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          padding: '7px 10px', minHeight: 38, cursor: 'text',
          background: t.bg, borderRadius: 8, fontSize: 13,
          border: `1px solid ${focus ? t.accent : t.border}`,
          transition: 'border-color .15s',
        }}
      >
        {tags.map(tag => (
          <span key={tag.toLocaleLowerCase()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 9px',
            background: `${t.accent}18`, border: `1px solid ${t.accent}45`, borderRadius: 999,
            color: t.accent, fontSize: 11.5, fontWeight: 600, maxWidth: '100%',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(retirerTag(tags, tag)); champ.current?.focus(); }}
              aria-label={tr('tags.retirerCelle', { tag })}
              title={tr('commun.retirer')}
              style={{
                display: 'grid', placeContent: 'center', width: 16, height: 16, flexShrink: 0,
                border: 0, borderRadius: 999, background: 'transparent', color: t.accent,
                cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, fontFamily: 'inherit',
              }}
            >×</button>
          </span>
        ))}

        <input
          ref={champ}
          value={saisie}
          onChange={surSaisie}
          onKeyDown={surTouche}
          onFocus={() => setFocus(true)}
          onBlur={() => { setFocus(false); if (saisie.trim()) valider(saisie); }}
          placeholder={tags.length ? '' : (placeholder ?? tr('tags.ajouter'))}
          disabled={plein}
          aria-label={tr('tags.ajouter')}
          style={{
            flex: '1 1 120px', minWidth: 90, border: 0, outline: 'none', padding: '2px 0',
            background: 'transparent', color: t.text, fontSize: 13, fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 5 }}>
        {plein ? tr('tags.maximum', { n: TAGS_MAX }) : tr('tags.aide')}
      </div>
    </div>
  );
}
