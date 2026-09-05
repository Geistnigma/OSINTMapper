import React, { useEffect, useState, useCallback } from 'react';
import { getLocale, traduire, useT } from '../../i18n';

/**
 * Historique de versions - partie cliente.
 *
 * L'annulation (Ctrl+Z) vit dans le Y.UndoManager, en mémoire : elle meurt au
 * rechargement de la page. Ce panneau consomme les points de restauration
 * produits par le serveur, qui sont le seul filet au-delà de la session.
 *
 * La création des instantanés, elle, ne peut PAS être un plugin : elle se
 * déclenche à la sauvegarde côté serveur et manipule le fichier d'enquête.
 * Le système de plugins est purement client - ce panneau n'est que l'interface
 * de `GET|POST /api/cases/:id/snapshots`.
 */

function fmt(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const heure = d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  return sameDay
    ? traduire('hist.aujourdhui', { heure })
    : traduire('hist.dateEtHeure', {
      date: d.toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' }),
      heure,
    });
}

const fmtSize = n => (n >= 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} ${traduire('commun.mo')}`
  : `${Math.max(1, Math.round(n / 1024))} ${traduire('commun.ko')}`);

export default function Panel(ctx) {
  const tr = useT();
  const { api, caseId, theme: t, collab } = ctx;

  const [snaps, setSnaps] = useState(null); // null = chargement en cours
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [newLabel, setNewLabel] = useState('');

  // En collaboratif seul le propriétaire peut restaurer ; en solo, le compte qui
  // a ouvert l'enquête y a forcément accès. Le serveur tranche dans les deux cas
  // (403 sinon) - ceci ne sert qu'à ne pas proposer un bouton voué à l'échec.
  const canRestore = !collab || collab.isOwner !== false;

  const load = useCallback(async () => {
    if (!caseId) return;
    setError('');
    try {
      setSnaps(await api.get(`/cases/${caseId}/snapshots`));
    } catch (e) {
      setError(e.message || tr('hist.indisponible'));
      setSnaps([]);
    }
  }, [api, caseId]);

  useEffect(() => { load(); }, [load]);

  const createPoint = async () => {
    setBusy(true); setError('');
    try {
      await api.post(`/cases/${caseId}/snapshots`, { label: newLabel.trim() || null });
      setNewLabel('');
      await load();
    } catch (e) { setError(e.message || tr('hist.creationImpossible')); }
    setBusy(false);
  };

  const restore = async (id) => {
    setBusy(true); setError('');
    try {
      await api.post(`/cases/${caseId}/snapshots/${id}/restore`);
      // Le serveur a fermé la salle de synchronisation : l'état de cet onglet
      // est périmé. On recharge pour repartir du fichier restauré.
      window.location.reload();
    } catch (e) {
      setError(e.message || tr('hist.restaurationImpossible'));
      setBusy(false); setConfirming(null);
    }
  };

  const btn = {
    background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.text,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  };

  if (!caseId) {
    return <div style={{ padding: 28, color: t.textMuted, fontSize: 13 }}>{tr('hist.aucuneEnquete')}</div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: t.text, fontSize: 13 }}>

      {/* Création d'un point manuel */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) createPoint(); }}
          placeholder={tr('hist.champNom')}
          style={{ flex: 1, minWidth: 220, padding: '7px 12px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={createPoint} disabled={busy} style={{ ...btn, background: t.accent, borderColor: t.accent, color: '#fff', opacity: busy ? .5 : 1 }}>
          {tr('hist.creerPoint')}
        </button>
        <button onClick={load} disabled={busy} style={{ ...btn, opacity: busy ? .5 : 1 }}>{tr('hist.actualiser')}</button>
      </div>

      {error && <div style={{ padding: '10px 20px', background: '#ef444418', color: '#ef4444', fontSize: 12 }}>{error}</div>}

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {snaps === null && <div style={{ padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>{tr('hist.chargement')}</div>}

        {snaps?.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🕓</div>
            <div style={{ color: t.text, fontWeight: 600, marginBottom: 6 }}>{tr('hist.aucunPoint')}</div>
            {tr('hist.premierAuto')}
          </div>
        )}

        {snaps?.map(s => (
          <div key={s.id} style={{ padding: '11px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              title={s.auto ? tr('hist.pointAuto') : tr('hist.pointManuel')}
              style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: s.auto ? t.textMuted : t.accent }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label || fmt(s.createdAt)}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>
                {s.label ? `${fmt(s.createdAt)} · ` : ''}
                {s.encrypted
                  ? tr('hist.contenuChiffre')
                  : tr('hist.contenu', { e: s.entities ?? 0, l: s.links ?? 0 })}
                {' · '}{fmtSize(s.size)}
              </div>
            </div>

            {confirming === s.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>{tr('hist.remplacer')}</span>
                <button onClick={() => restore(s.id)} disabled={busy} style={{ ...btn, background: '#ef4444', borderColor: '#ef4444', color: '#fff' }}>
                  {busy ? '…' : tr('hist.confirmer')}
                </button>
                <button onClick={() => setConfirming(null)} style={btn}>{tr('hist.annuler')}</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(s.id)}
                disabled={!canRestore || busy}
                title={canRestore ? tr('hist.revenir') : tr('hist.reserveProprietaire')}
                style={{ ...btn, opacity: canRestore ? 1 : .4, cursor: canRestore ? 'pointer' : 'not-allowed' }}>
                Restaurer
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 20px', borderTop: `1px solid ${t.border}`, fontSize: 10.5, color: t.textMuted }}>
        Un point automatique est créé au plus toutes les 5 minutes, et l'état courant est archivé avant
        toute restauration - se tromper de version reste rattrapable. Ctrl+Z, lui, ne survit pas à un rechargement.
      </div>
    </div>
  );
}
