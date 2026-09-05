import { useT } from '../i18n';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { buildReplay, prochaineEtape, compteA } from '../lib/replay.js';
import { getLocale } from '../i18n';

/**
 * Barre de rejeu chronologique.
 *
 * Rejoue la construction de l'enquête à partir de la date d'ajout des éléments,
 * pour voir comment le raisonnement s'est bâti.
 *
 * L'avance se fait par **étapes** - les instants où quelque chose apparaît - et
 * non par pas de temps constant : une enquête menée sur six mois avec trois
 * journées actives se rejouerait sinon en six mois de vide.
 */

const VITESSES = [0.5, 1, 2, 4];
const PAS_MS = 900; // durée d'affichage d'une étape à vitesse 1

const fmt = (ms) => new Date(ms).toLocaleString(getLocale(), {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function ReplayBar({ graphe, instant, setInstant, theme: t, onClose }) {
  const tr = useT();
  const infos = useMemo(() => buildReplay(graphe), [graphe]);
  const { debut, fin, etapes, sansDate, total } = infos;

  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(1);
  const minuteur = useRef(null);

  // Repli : si l'instant sort de la période (le graphe a changé pendant le
  // rejeu), on se recale sur le début plutôt que d'afficher un graphe vide.
  useEffect(() => {
    if (etapes.length && (instant == null || instant < debut)) setInstant(debut);
  }, [debut, etapes.length, instant, setInstant]);

  // Boucle de lecture. `instant` figure dans les dépendances : chaque étape
  // reprogramme la suivante, ce qui laisse la vitesse changer en cours de route.
  useEffect(() => {
    clearTimeout(minuteur.current);
    if (!lecture || instant == null) return;
    const suivant = prochaineEtape(etapes, instant);
    if (suivant == null) { setLecture(false); return; }   // fin atteinte
    minuteur.current = setTimeout(() => setInstant(suivant), PAS_MS / vitesse);
    return () => clearTimeout(minuteur.current);
  }, [lecture, instant, vitesse, etapes, setInstant]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const btn = {
    background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.text,
    borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  };

  if (!etapes.length) {
    return (
      <div style={socle(t)}>
        <span style={{ fontSize: 18 }}>🎬</span>
        <div style={{ flex: 1, fontSize: 12, color: t.textSecondary }}>
          <b style={{ color: t.text }}>{tr('replay.impossible')}</b> - {tr('replay.impossibleDetail')}
          <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 2 }}>
            {tr('replay.impossibleAide')}
          </div>
        </div>
        <button onClick={onClose} style={btn}>{tr('replay.fermer')}</button>
      </div>
    );
  }

  const iEtape = Math.max(0, etapes.findIndex(x => x >= (instant ?? debut)));
  const vus = compteA(graphe, instant ?? debut);
  const fini = instant != null && prochaineEtape(etapes, instant) == null;

  return (
    <div style={socle(t)}>
      <button
        onClick={() => { if (fini) setInstant(debut); setLecture(l => !l); }}
        title={lecture ? tr('replay.pause') : (fini ? tr('replay.recommencer') : tr('replay.lecture'))}
        style={{ ...btn, background: t.accent, borderColor: t.accent, color: '#fff', fontSize: 14, padding: '6px 12px' }}>
        {lecture ? '⏸' : (fini ? '↻' : '▶')}
      </button>

      <div style={{ flex: 1, minWidth: 160 }}>
        <input
          type="range" min={0} max={etapes.length - 1} step={1} value={iEtape}
          onChange={e => { setLecture(false); setInstant(etapes[Number(e.target.value)]); }}
          style={{ width: '100%', accentColor: t.accent, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: t.textMuted, marginTop: -2 }}>
          <span>{fmt(debut)}</span>
          <span style={{ color: t.textSecondary, fontWeight: 600 }}>{fmt(instant ?? debut)}</span>
          <span>{fmt(fin)}</span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: t.textSecondary, whiteSpace: 'nowrap' }}>
        <b style={{ color: t.text }}>{vus}</b> / {total} élément{total > 1 ? 's' : ''}
        <div style={{ fontSize: 9.5, color: t.textMuted }}>étape {iEtape + 1} / {etapes.length}</div>
      </div>

      <div style={{ display: 'flex', gap: 2 }}>
        {VITESSES.map(v => (
          <button key={v} onClick={() => setVitesse(v)}
            style={{ ...btn, padding: '4px 7px', fontSize: 10.5,
              background: vitesse === v ? t.accent : t.surfaceAlt,
              color: vitesse === v ? '#fff' : t.textSecondary,
              borderColor: vitesse === v ? t.accent : t.border }}>×{v}</button>
        ))}
      </div>

      {sansDate > 0 && (
        <span title={tr('replay.socle')}
          style={{ fontSize: 10, color: t.warning, background: t.warning + '18', border: `1px solid ${t.warning}40`, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>
          ⚠ {tr('replay.sansDate', { n: sansDate })}
        </span>
      )}

      <button onClick={onClose} style={btn} title={tr('replay.quitter')}>✕</button>
    </div>
  );
}

const socle = (t) => ({
  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
  width: 'min(860px, calc(100% - 32px))', zIndex: 20,
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
  padding: '10px 14px', boxShadow: `0 8px 32px ${t.shadow}`,
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
});
