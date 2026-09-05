import React from 'react';
import { LANGUES, useLangue } from '../i18n';

/**
 * Flag-based language picker.
 *
 * The flags are emoji, as on the landing page: Windows has no glyph for
 * regional indicators and will spell out "FR", "GB", "DE" instead. Readable,
 * but not a flag - the trade-off we accept in order to depend on no image.
 *
 * The active state is marked by a background and a border, not by opacity
 * alone: the white of the French flag already creates a halo that would blur
 * the cue.
 */
export default function SelecteurLangue({ t: theme, compact = false }) {
  const { langue, changerLangue } = useLangue();
  return (
    <div role="group" aria-label="Langue / Language / Sprache"
      style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {LANGUES.map(l => {
        const actif = l.code === langue;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => changerLangue(l.code)}
            title={l.nom}
            aria-label={l.nom}
            aria-pressed={actif}
            style={{
              padding: compact ? '2px 5px' : '4px 7px',
              fontSize: compact ? 13 : 15,
              lineHeight: 1,
              cursor: 'pointer',
              borderRadius: 6,
              border: `1px solid ${actif ? theme.accent : 'transparent'}`,
              background: actif ? `${theme.accent}18` : 'transparent',
              opacity: actif ? 1 : 0.5,
              fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif',
              transition: 'opacity .15s, border-color .15s, background .15s',
            }}
          >{l.drapeau}</button>
        );
      })}
    </div>
  );
}
