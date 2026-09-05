import { useT } from '../i18n';
import React, { useEffect, useRef, useState } from 'react';

/**
 * Menu déroulant de la barre d'outils.
 *
 * La barre alignait une dizaine de boutons de même poids visuel : « Reset »,
 * qui vide le graphe, voisinait avec la bascule d'anonymisation, et chaque
 * plugin activé en ajoutait un de plus - sans limite. Ce composant permet de
 * regrouper par fréquence d'usage et d'éloigner les actions destructrices.
 *
 * items : { id, icon, label, onClick, active?, danger?, section?, hint?, disabled? }
 *
 * `section` insère un intitulé de catégorie au-dessus de l'item - le menu des
 * réglages en aligne plusieurs (Affichage, Export, Zone de danger) et une liste
 * plate y devenait illisible.
 */
export default function ToolbarMenu({ label, icon, items, theme: t, badge, title, align = 'right' }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Un bouton sans texte visible DOIT porter une infobulle et un nom
  // accessible : le bouton ⚙️ n'avait ni l'un ni l'autre (`title={label}` avec
  // un label vide), c'était le seul élément non identifiable de la barre.
  const nom = title || label;

  // Fermeture au clic extérieur et à Échap : sans cela le menu reste ouvert
  // au-dessus du canvas et intercepte le premier clic destiné au graphe.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = items.filter(Boolean);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={nom}
        aria-label={nom}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: open ? t.surfaceAlt : t.surface,
          color: t.text,
          border: `1px solid ${open ? t.borderHover || t.border : t.border}`,
          borderRadius: 10, padding: '6px 12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: `0 4px 12px ${t.shadow}`, fontFamily: 'inherit',
        }}>
        {icon && <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>}
        {label && <span style={{ fontSize: 12 }}>{label}</span>}
        {badge > 0 && (
          <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 5px', fontWeight: 700 }}>{badge}</span>
        )}
        <span style={{ fontSize: 9, opacity: .6, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <div role="menu" aria-label={nom} style={{
          position: 'absolute', top: '100%', [align]: 0, marginTop: 6,
          background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
          padding: 6, boxShadow: `0 8px 24px ${t.shadow}`, minWidth: 220, zIndex: 30,
          maxHeight: '70vh', overflowY: 'auto',
        }}>
          {visible.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: t.textMuted }}>{tr('toolbar.aucunElement')}</div>
          )}
          {visible.map((it, i) => (
            <React.Fragment key={it.id}>
              {it.section && (
                <div style={{
                  padding: '8px 10px 4px', fontSize: 9.5, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '.07em', color: t.textMuted,
                  borderTop: i === 0 ? 'none' : `1px solid ${t.border}`,
                  marginTop: i === 0 ? 0 : 4,
                }}>{it.section}</div>
              )}
              {!it.section && it.separatorBefore && (
                <div style={{ height: 1, background: t.border, margin: '6px 4px' }} />
              )}
              <button
                onClick={() => { setOpen(false); it.onClick?.(); }}
                disabled={it.disabled}
                title={it.hint || ''}
                role="menuitem"
                aria-checked={it.active ? true : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: it.disabled ? 'not-allowed' : 'pointer',
                  background: it.active ? t.surfaceAlt : 'none',
                  color: it.danger ? '#ef4444' : t.text,
                  opacity: it.disabled ? .4 : 1,
                  fontSize: 12, textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = it.danger ? '#ef444418' : t.surfaceAlt; }}
                onMouseLeave={e => { e.currentTarget.style.background = it.active ? t.surfaceAlt : 'none'; }}>
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{it.icon}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.active && <span style={{ fontSize: 11, color: t.accent }}>●</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
