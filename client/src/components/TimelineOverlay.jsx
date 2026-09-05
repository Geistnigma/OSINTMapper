import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { buildGroups } from '../lib/timelineGroups.js';
import { getLocale, useT } from '../i18n';

/**
 * Timeline horizontale plein écran, bâtie sur vis-timeline.
 *
 * La vue historique est une liste verticale de 300 px : elle répond à « qu'est-ce
 * qui s'est passé en dernier ? », pas à « comment ces faits s'ordonnent-ils dans
 * le temps ? ». Une vraie frise donne l'espacement réel entre les événements,
 * les regroupements et les trous - ce qui est précisément le raisonnement d'une
 * enquête.
 *
 * vis-timeline est chargé par `import()` dynamique : le bundle est volumineux
 * (il embarque moment), il ne doit peser que sur qui ouvre la frise.
 */

/**
 * Libellé d'un item, sous forme de nœud DOM.
 *
 * vis-timeline traite une chaîne comme du HTML (`element.innerHTML = xss(...)`,
 * cf. son ItemSet) ; un `Element`, lui, est simplement appendu - sans analyse
 * HTML et sans passer par son filtre. Or ces libellés viennent des données
 * d'enquête : nom d'entité, texte de commentaire. On les pose donc en
 * `textContent`, ce qui garantit à la fois l'inertie du contenu et l'affichage
 * littéral (un nom comme « Dupont & Fils <SARL> » reste lisible tel quel).
 */
function labelNode(text) {
  const span = document.createElement('span');
  span.textContent = text ?? '';
  return span;
}

/** Le tooltip, lui, est une chaîne HTML : on y met en forme, donc on échappe. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Surcharge du thème de vis-timeline (sa feuille par défaut est claire). */
function visTheme(t) {
  return `
.om-tl .vis-timeline { border: none; font-family: inherit; font-size: 12px; }
.om-tl .vis-panel, .om-tl .vis-labelset .vis-label,
.om-tl .vis-panel.vis-bottom, .om-tl .vis-panel.vis-top,
.om-tl .vis-panel.vis-left, .om-tl .vis-panel.vis-right { border-color: ${t.border}; }
.om-tl .vis-time-axis .vis-text { color: ${t.textSecondary}; padding-top: 4px; }
.om-tl .vis-time-axis .vis-text.vis-major { color: ${t.text}; font-weight: 700; }
.om-tl .vis-time-axis .vis-grid.vis-minor { border-color: ${t.border}; }
.om-tl .vis-time-axis .vis-grid.vis-major { border-color: ${t.border}; }
.om-tl .vis-labelset .vis-label { color: ${t.text}; font-weight: 600; }
.om-tl .vis-labelset .vis-label .vis-inner { padding: 8px 12px; }
.om-tl .vis-foreground .vis-group { border-color: ${t.border}; }
.om-tl .vis-item {
  border-width: 1px; border-radius: 6px; color: #fff;
  font-size: 11px; line-height: 1.4;
}
.om-tl .vis-item.vis-selected { box-shadow: 0 0 0 2px ${t.accent}; z-index: 3; }
.om-tl .vis-item .vis-item-content { padding: 3px 8px; }
.om-tl .vis-item.vis-dot { border-width: 5px; border-radius: 50%; }
.om-tl .vis-item.vis-point .vis-item-content { color: ${t.text}; }
.om-tl .vis-current-time { background-color: ${t.accent}; width: 1px; }
.om-tl .vis-tooltip {
  background: ${t.surfaceAlt} !important; color: ${t.text} !important;
  border: 1px solid ${t.border} !important; border-radius: 8px !important;
  font-family: inherit !important; font-size: 11px !important;
  box-shadow: 0 8px 24px ${t.shadow} !important; padding: 8px 10px !important;
}
`;
}

export default function TimelineOverlay({ events, entities = [], theme: t, onMinimize, onClose, onSelectEntity }) {
  const tr = useT();
  // « nature » regroupe par type d'événement, « acteur » par entité concernée.
  // Sur une enquête complexe, la seconde lecture est celle qu'on cherche :
  // qui fait quoi, et quand.
  const [groupage, setGroupage] = useState('nature');
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const dataRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [libError, setLibError] = useState('');

  // Gardé en ref, et hors des dépendances de l'effet de création : l'appelant
  // passe une lambda, dont l'identité change à chaque rendu. Dans les
  // dépendances, elle détruirait et reconstruirait la frise en continu.
  const onSelectRef = useRef(onSelectEntity);
  useEffect(() => { onSelectRef.current = onSelectEntity; }, [onSelectEntity]);

  // Un événement sans date exploitable n'a pas de place sur une frise : le
  // panneau réduit, lui, les affiche encore (il n'ordonne que par récence).
  const dated = useMemo(() => events
    .map(e => ({ evt: e, when: new Date(e.sortDate || e.timestamp) }))
    .filter(({ when }) => !isNaN(when.getTime())), [events]);

  // Voies de la frise - logique dans lib/timelineGroups.js, où elle est
  // testable sans monter vis-timeline ni le DOM.
  const { groups, itemGroupe } = useMemo(
    () => buildGroups(dated, groupage, entities, tr),
    // `tr` change d'identité au changement de langue : sans lui dans les
    // dépendances, les voies resteraient dans la langue précédente.
    [dated, groupage, entities, tr],
  );

  const items = useMemo(() => dated.map(({ evt, when }, i) => {
    const color = evt.color || '#58a6ff';
    return {
      id: evt.id ?? `evt_${i}`,
      group: itemGroupe(evt),
      start: when,
      content: labelNode(evt.action),
      title: `${esc(evt.action || '')}<br><b>${esc(evt.user || '')}</b> - ${esc(when.toLocaleString(getLocale()))}`,
      style: `background-color:${color}; border-color:${color};`,
      _entityId: evt.entityId || null,
    };
  }), [dated, itemGroupe]);

  // ═══ Création de l'instance (une fois) ═══
  useEffect(() => {
    let cancelled = false;
    let timeline = null;

    (async () => {
      try {
        const [vis] = await Promise.all([
          import('vis-timeline/standalone'),
          import('vis-timeline/styles/vis-timeline-graph2d.min.css'),
        ]);
        if (cancelled || !containerRef.current) return;

        const data = new vis.DataSet([]);
        const groupSet = new vis.DataSet([]);
        dataRef.current = { data, groupSet, vis };

        timeline = new vis.Timeline(containerRef.current, data, groupSet, {
          orientation: 'top',
          stack: true,
          // Molette = zoom, glisser = défiler : le même geste que sur le canvas
          // du graphe. `horizontalScroll` n'a volontairement pas été activé - il
          // n'a d'effet que si `zoomKey` est défini, et réserverait alors la
          // molette au défilement en exigeant une touche pour zoomer.
          zoomKey: '',
          zoomMin: 1000 * 60,             // 1 minute
          zoomMax: 1000 * 60 * 60 * 24 * 365 * 30, // 30 ans
          margin: { item: { horizontal: 6, vertical: 6 }, axis: 10 },
          tooltip: { followMouse: true, overflowMethod: 'cap' },
          selectable: true,
          multiselect: false,
          // Locale française : le moment embarqué dans le bundle standalone
          // inclut bien les locales (vérifié), sans quoi l'axe resterait anglais.
          moment: date => vis.moment(date).locale(getLocale()),
        });

        timeline.on('select', ({ items: sel }) => {
          if (!sel?.length) return;
          const it = data.get(sel[0]);
          if (it?._entityId) onSelectRef.current?.(it._entityId);
        });

        timelineRef.current = timeline;
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.error('[timeline] chargement de vis-timeline échoué :', e);
        if (!cancelled) { setLibError(e.message || tr('frise.erreurInconnue')); setStatus('error'); }
      }
    })();

    return () => {
      cancelled = true;
      try { timelineRef.current?.destroy(); } catch { /* déjà démonté */ }
      timelineRef.current = null;
      dataRef.current = null;
    };
  }, []); // instance créée une seule fois : les données sont poussées par l'effet suivant

  // ═══ Alimentation / mise à jour des données ═══
  useEffect(() => {
    if (status !== 'ready' || !dataRef.current) return;
    const { data, groupSet } = dataRef.current;
    groupSet.clear(); groupSet.add(groups);
    data.clear(); data.add(items);
    if (items.length) timelineRef.current?.fit({ animation: false });
  }, [status, items, groups]);

  const fit = useCallback(() => timelineRef.current?.fit({ animation: true }), []);
  const zoomIn = useCallback(() => timelineRef.current?.zoomIn(0.5), []);
  const zoomOut = useCallback(() => timelineRef.current?.zoomOut(0.5), []);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const btn = {
    background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.text,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: t.bg, zIndex: 150,
      display: 'flex', flexDirection: 'column',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <style>{visTheme(t)}</style>

      {/* ═══ EN-TÊTE ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: t.surface, borderBottom: `1px solid ${t.border}`,
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🕐</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{tr('frise.titre')}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              {tr('frise.compteDates', { n: dated.length })}
              {events.length > dated.length && ` · ${tr('frise.sansDate', { n: events.length - dated.length })}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Regroupement : par nature d'événement, ou par entité concernée. */}
          <div style={{ display: 'flex', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2 }}>
            {[['nature', '📚', tr('frise.parNature')], ['acteur', '👤', tr('frise.parActeur')]].map(([id, ic, lab]) => (
              <button key={id} onClick={() => setGroupage(id)}
                title={tr(id === 'acteur' ? 'frise.aideParActeur' : 'frise.aideParNature')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                  background: groupage === id ? t.accent : 'transparent',
                  color: groupage === id ? '#fff' : t.textSecondary,
                }}>{ic} {lab}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 22, background: t.border, margin: '0 2px' }} />
          <button onClick={zoomOut} style={btn} title={tr('frise.dezoomer')}>−</button>
          <button onClick={zoomIn} style={btn} title={tr('frise.zoomer')}>+</button>
          <button onClick={fit} style={btn} title={tr('frise.toutePeriode')}>{tr('frise.toutAfficher')}</button>
          <div style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
          <button onClick={onMinimize} style={btn} title={tr('frise.reduireTitre')}>▾ {tr('frise.reduire')}</button>
          <button onClick={onClose} style={{ ...btn, background: t.surface }} title={tr('frise.fermer')}>✕</button>
        </div>
      </div>

      {/* ═══ FRISE ═══ */}
      <div className="om-tl" style={{ flex: 1, minHeight: 0, position: 'relative', background: t.bg }}>
        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>
            {tr('frise.chargement')}
          </div>
        )}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>⚠️</div>
            <div style={{ color: t.text, fontWeight: 600 }}>{tr('frise.indisponible')}</div>
            <div style={{ maxWidth: 420 }}>{libError}</div>
            <button onClick={onMinimize} style={btn}>{tr('frise.revenirCompact')}</button>
          </div>
        )}
        {status === 'ready' && dated.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13, padding: 24, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 28 }}>📅</div>
            <div style={{ color: t.text, fontWeight: 600 }}>{tr('frise.aucunEvenement')}</div>
            <div style={{ maxWidth: 460 }}>
              {tr('frise.aideRenseignerDebut')}<b>{tr('frise.date')}</b>{tr('frise.aideRenseignerFin')}
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>

      {/* ═══ PIED ═══ */}
      <div style={{
        padding: '6px 16px', background: t.surface, borderTop: `1px solid ${t.border}`,
        fontSize: 10, color: t.textMuted, display: 'flex', gap: 16, flexWrap: 'wrap',
      }}>
        <span>{tr('frise.aideMolette')}</span>
        <span>{tr('frise.aideGlisser')}</span>
        <span>{tr('frise.astuceClic')}</span>
      </div>
    </div>
  );
}
