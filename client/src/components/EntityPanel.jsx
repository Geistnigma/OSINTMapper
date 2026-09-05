import React, { useState, useMemo } from 'react';
import { buildPluginContext } from '../plugins/core/context.js';
import { PluginErrorBoundary } from '../plugins/core/ErrorBoundary.jsx';
import { getLocale, traduire, useT } from '../i18n';
import { libellePlugin } from '../lib/constantesTraduites.js';

/**
 * EntityPanel - Right panel for entity and link editing.
 * Extracted from OSINTMapper monolith + enriched with OSINT fields.
 */

// ═══ CONSTANTS ═══
// Libellés et descriptions dans le dictionnaire (`otan.fiab.<id>`, `otan.cred.<id>`) :
// la cotation est une échelle normalisée, ses identifiants ne bougent pas.
const RELIABILITY = [
  { id: 'A', color: '#10b981' },
  { id: 'B', color: '#3b82f6' },
  { id: 'C', color: '#06b6d4' },
  { id: 'D', color: '#f59e0b' },
  { id: 'E', color: '#ef4444' },
  { id: 'F', color: '#64748b' },
];

const CREDIBILITY = [
  { id: '1', color: '#10b981' },
  { id: '2', color: '#3b82f6' },
  { id: '3', color: '#06b6d4' },
  { id: '4', color: '#f59e0b' },
  { id: '5', color: '#ef4444' },
  { id: '6', color: '#64748b' },
];

// Libellé dans le dictionnaire (`statut.<id>`) : le monolithe et ce panneau
// affichaient le même statut depuis deux listes distinctes.
const STATUSES = [
  { id: 'unverified', icon: '❓', color: '#f59e0b' },
  { id: 'confirmed', icon: '✅', color: '#10b981' },
  { id: 'denied', icon: '❌', color: '#ef4444' },
  { id: 'archived', icon: '📦', color: '#64748b' },
];

const COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#eab308', '#64748b'];

// ═══ HELPERS ═══
function Fl({ label, t, children }) {
  return <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>{children}</div>;
}

/**
 * Groupe de champs du panneau d'entité.
 *
 * Tout est visible en permanence : le regroupement sert de repère de lecture,
 * pas de mécanisme de masquage. L'intitulé est volontairement discret - plus
 * clair que les libellés de champs - pour structurer sans capter l'œil.
 *
 * (Une version repliable a été essayée : elle obligeait à un clic pour saisir
 * une donnée, ce qui coûte plus cher que le défilement qu'elle économisait.)
 */
function Section({ title, icon, t, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 10, fontWeight: 700, color: t.textMuted, opacity: 0.75,
        textTransform: 'uppercase', letterSpacing: '.07em',
        paddingTop: 4,
      }}>
        <span style={{ fontSize: 11, opacity: 0.9 }}>{icon}</span>
        <span>{title}</span>
        <span style={{ flex: 1, height: 1, background: t.border, marginLeft: 2 }} />
      </div>
      {children}
    </div>
  );
}

/**
 * Curseur de confiance d'un lien.
 *
 * Les pseudo-éléments d'un `input[type=range]` (::-webkit-slider-thumb,
 * ::-moz-range-thumb) ne sont pas atteignables en style inline : il faut une
 * feuille, d'où le <style> local. `accentColor` seul ne permettait ni de
 * dimensionner la poignée ni de peindre la piste.
 *
 * La piste porte les paliers de LINK_STRENGTHS (rouge < 30 ≤ ambre < 70 ≤ vert) :
 * les seuils qui font basculer la couleur du lien deviennent visibles, au lieu
 * de se deviner en déplaçant le curseur. Ils doivent rester alignés sur
 * `getStrengthFromConfidence`, sinon la poignée annonce une couleur que le
 * graphe ne trace pas.
 */
function ConfidenceSlider({ t, color, value, disabled, onChange }) {
  // Composant distinct : sa propre traduction, comme EntityView.
  const tr = useT();
  const css = `
.om-conf { -webkit-appearance:none; appearance:none; width:100%; height:22px; background:transparent; cursor:pointer; margin:2px 0; }
.om-conf:disabled { cursor:default; opacity:.45; }
.om-conf:focus { outline:none; }

.om-conf::-webkit-slider-runnable-track {
  height:6px; border-radius:99px; border:1px solid ${t.border};
  background:linear-gradient(to right, ${t.danger} 0 30%, ${t.warning} 30% 70%, ${t.success} 70% 100%);
}
.om-conf::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none;
  width:16px; height:16px; border-radius:50%; margin-top:-6px;
  background:var(--c); border:2px solid ${t.surface};
  box-shadow:0 0 0 1px var(--c), 0 2px 6px ${t.shadow};
  transition:transform .12s ease;
}
.om-conf:not(:disabled):hover::-webkit-slider-thumb { transform:scale(1.12); }
.om-conf:not(:disabled):active::-webkit-slider-thumb { transform:scale(1.22); }
.om-conf:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 1px var(--c), 0 0 0 4px ${t.accent}55; }

.om-conf::-moz-range-track {
  height:6px; border-radius:99px; border:1px solid ${t.border};
  background:linear-gradient(to right, ${t.danger} 0 30%, ${t.warning} 30% 70%, ${t.success} 70% 100%);
}
.om-conf::-moz-range-thumb {
  width:14px; height:14px; border-radius:50%;
  background:var(--c); border:2px solid ${t.surface};
  box-shadow:0 0 0 1px var(--c), 0 2px 6px ${t.shadow};
  transition:transform .12s ease;
}
.om-conf:not(:disabled):hover::-moz-range-thumb { transform:scale(1.12); }
.om-conf:not(:disabled):active::-moz-range-thumb { transform:scale(1.22); }
.om-conf:focus-visible::-moz-range-thumb { box-shadow:0 0 0 1px var(--c), 0 0 0 4px ${t.accent}55; }
`;
  return (
    <div>
      <style>{css}</style>
      <input
        type="range" min={0} max={100} step={1} className="om-conf"
        value={value} disabled={disabled}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{ '--c': color }}
      />
      {/* Repères des seuils : la couleur du lien bascule exactement là. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: t.textMuted, marginTop: -2, letterSpacing: '.02em' }}>
        <span>0 · {tr('panneau.nonQualifie')}</span><span>30</span><span>70</span><span>{tr('panneau.confiance')} · 100</span>
      </div>
    </div>
  );
}

function inp(t) { return { width: '100%', padding: '8px 10px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 12, outline: 'none' }; }
function sBtn(t) { return { background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }; }

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

/** Tag chip with remove button */
function Tag({ label, color, onRemove, t }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: (color || t.accent) + '20', border: `1px solid ${(color || t.accent)}40`, borderRadius: 6, fontSize: 10, fontWeight: 600, color: color || t.accent }}>
      {label}
      {onRemove && <button onClick={onRemove} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>✕</button>}
    </span>
  );
}

// ═══ ENTITY PANEL ═══
function EntityView({ entity, t, updateEntity, deleteEntity, duplicateEntity, links, entities, deleteLink,
  caseId, userName, collab, stickers, postits, setSelectedId, addEntity, addLink, updateLink, setLinkingFrom, setHoldActive, selectedId, logAction, genId, CATEGORIES, ALL_ITEMS, LINK_TYPES, linkCount, Icons, isViewer, normalizeAddress, getStrengthFromConfidence, onAttachProof, pluginEngine }) {
  // `EntityView` est un composant À PART de `EntityPanel` : il lui faut sa
  // propre traduction, la déclarer dans l'autre ne la porte pas ici.
  const tr = useT();
  const [activeTab, setActiveTab] = useState('info');
  const [showHistory, setShowHistory] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [aliasInput, setAliasInput] = useState('');

  const info = ALL_ITEMS[entity.subtype] || { label: entity.label, desc: '', color: entity.color };
  const cat = CATEGORIES.find(c => c.id === entity.type);
  const meta = entity.metadata || {};
  const entityLinks = links.filter(l => l.from === selectedId || l.to === selectedId);

  const upMeta = (patch) => updateEntity(selectedId, { metadata: { ...meta, ...patch } });

  // Plugin tabs (entity-tab hook)
  const pluginTabs = useMemo(() => {
    if (!pluginEngine) return [];
    return pluginEngine.getByHook('entity-tab').map(pl => ({
      id: `plugin_${pl.id}`,
      pluginId: pl.id,
      label: libellePlugin(pl, 'entity-tab'),
      icon: pl.hookConfig.icon || pl.manifest.icon,
      Panel: pl.components.Panel,
      settings: pl.settings,
    }));
    // `tr` change d'identité au changement de langue : sans lui, les onglets
    // resteraient dans la langue précédente.
  }, [pluginEngine, tr]);

  const tabs = [
    { id: 'info', label: 'Infos', icon: '📋' },
    { id: 'links', label: `Liens (${linkCount[selectedId] || 0})`, icon: '🔗' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    ...pluginTabs,
  ];

  return <>
    {/* Header */}
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: info.color + '18', border: `1px solid ${info.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: info.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity.label}</div>
        <div style={{ fontSize: 11, color: t.textMuted }}>{cat?.icon} {cat?.label} · {info.label}</div>
      </div>
      {/* Status badge */}
      {(() => { const s = STATUSES.find(s => s.id === (meta.status || 'unverified')); return s ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: s.color + '20', color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {tr('statut.' + s.id)}</span> : null; })()}
    </div>

    {/* Tabs */}
    <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '0 16px' }}>
      {tabs.map(tb => (
        <button key={tb.id} onClick={() => setActiveTab(tb.id)} style={{
          padding: '8px 14px', fontSize: 11, fontWeight: 600, background: 'none', border: 'none',
          borderBottom: activeTab === tb.id ? `2px solid ${t.accent}` : '2px solid transparent',
          color: activeTab === tb.id ? t.accent : t.textSecondary, cursor: 'pointer',
        }}>{tb.icon} {tb.label}</button>
      ))}
    </div>

    {/* Content */}
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {activeTab === 'info' && <>
                {/* Champs groupés par nature. Les intitulés sont de simples repères de
            lecture : tout reste visible, rien ne se replie. */}
        <Section t={t} title={tr('panneau.section.identite')} icon="🪪">
          <Fl label={tr('panneau.champ.nom')} t={t}><input value={entity.label} onChange={e => updateEntity(selectedId, { label: e.target.value })} style={inp(t)} readOnly={isViewer} /></Fl>
          <Fl label={tr('panneau.champ.sousType')} t={t}><select value={entity.subtype} disabled={isViewer} onChange={e => { const ni = ALL_ITEMS[e.target.value]; if (ni) updateEntity(selectedId, { subtype: e.target.value, type: ni.category, color: ni.color }); }} style={inp(t)}>{cat?.items.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}</select></Fl>
          <Fl label={tr('panneau.champ.description')} t={t}><textarea value={entity.description} onChange={e => updateEntity(selectedId, { description: e.target.value })} rows={2} placeholder={tr('panneau.ph.description')} readOnly={isViewer} style={{ ...inp(t), resize: 'vertical', fontFamily: 'inherit' }} /></Fl>

          {/* Tags */}
          <Fl label={tr('panneau.champ.tags')} t={t}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: (meta.tags?.length) ? 6 : 0 }}>
              {(meta.tags || []).map((tag, i) => <Tag key={i} label={tag} t={t} onRemove={isViewer ? null : () => upMeta({ tags: meta.tags.filter((_, j) => j !== i) })} />)}
            </div>
            {!isViewer && <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder={tr('panneau.ph.ajouterTag')} style={{ ...inp(t), fontSize: 11 }}
              onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { upMeta({ tags: [...(meta.tags || []), tagInput.trim()] }); setTagInput(''); } }} />}
          </Fl>

          {/* Aliases */}
          <Fl label={tr('panneau.champ.alias')} t={t}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: (meta.aliases?.length) ? 6 : 0 }}>
              {(meta.aliases || []).map((a, i) => <Tag key={i} label={a} color="#a855f7" t={t} onRemove={isViewer ? null : () => upMeta({ aliases: meta.aliases.filter((_, j) => j !== i) })} />)}
            </div>
            {!isViewer && <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} placeholder={tr('panneau.ph.ajouterAlias')} style={{ ...inp(t), fontSize: 11 }}
              onKeyDown={e => { if (e.key === 'Enter' && aliasInput.trim()) { upMeta({ aliases: [...(meta.aliases || []), aliasInput.trim()] }); setAliasInput(''); } }} />}
          </Fl>

        </Section>
        <Section t={t} title={tr('panneau.section.classification')} icon="🔒">
          {/* Status */}
          <Fl label={tr('panneau.champ.statut')} t={t}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s.id} disabled={isViewer} onClick={() => upMeta({ status: s.id })} style={{
                  padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer',
                  background: (meta.status || 'unverified') === s.id ? s.color + '20' : t.surfaceAlt,
                  color: (meta.status || 'unverified') === s.id ? s.color : t.textSecondary,
                  border: `1px solid ${(meta.status || 'unverified') === s.id ? s.color + '60' : t.border}`,
                }}>{s.icon} {tr('statut.' + s.id)}</button>
              ))}
            </div>
          </Fl>

          {/* Reliability - NATO/Admiralty dual scale */}
          <Fl label={tr('panneau.champ.otanSource')} t={t}>
            <div style={{ display: 'flex', gap: 3 }}>
              {RELIABILITY.map(r => (
                <button key={r.id} disabled={isViewer} onClick={() => upMeta({ reliability: r.id })} title={`${r.id} - ${tr('otan.fiab.' + r.id)}: ${tr('otan.fiab.' + r.id + '.desc')}`} style={{
                  flex: 1, padding: '6px 0', fontSize: 13, fontWeight: 800, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', textAlign: 'center',
                  background: (meta.reliability || 'F') === r.id ? r.color + '25' : t.surfaceAlt,
                  color: (meta.reliability || 'F') === r.id ? r.color : t.textMuted,
                  border: `1px solid ${(meta.reliability || 'F') === r.id ? r.color + '60' : t.border}`,
                }}>{r.id}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
              {meta.reliability || 'F'} - {tr('otan.fiab.' + (meta.reliability || 'F'))}
            </div>
          </Fl>

          <Fl label={tr('panneau.champ.otanInfo')} t={t}>
            <div style={{ display: 'flex', gap: 3 }}>
              {CREDIBILITY.map(r => (
                <button key={r.id} disabled={isViewer} onClick={() => upMeta({ credibility: r.id })} title={`${r.id} - ${tr('otan.cred.' + r.id)}: ${tr('otan.cred.' + r.id + '.desc')}`} style={{
                  flex: 1, padding: '6px 0', fontSize: 13, fontWeight: 800, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', textAlign: 'center',
                  background: (meta.credibility || '6') === r.id ? r.color + '25' : t.surfaceAlt,
                  color: (meta.credibility || '6') === r.id ? r.color : t.textMuted,
                  border: `1px solid ${(meta.credibility || '6') === r.id ? r.color + '60' : t.border}`,
                }}>{r.id}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
              {meta.credibility || '6'} - {tr('otan.cred.' + (meta.credibility || '6'))}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, marginTop: 6, padding: '4px 8px', background: t.accent + '10', borderRadius: 6, textAlign: 'center' }}>
              {tr('panneau.cotation', { note: `${meta.reliability || 'F'}${meta.credibility || '6'}` })}
            </div>
          </Fl>

        </Section>
        <Section t={t} title={tr('panneau.section.temporel')} icon="📅">
          {/* Date + Time */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Fl label={tr('panneau.champ.date')} t={t}><input type="date" value={meta.date?.split('T')[0] || meta.date || ''} readOnly={isViewer} onChange={e => { const time = meta.time || ''; const val = time ? e.target.value + 'T' + time : e.target.value; upMeta({ date: val }); }} style={inp(t)} /></Fl>
            <Fl label={tr('panneau.champ.heure')} t={t}><input type="time" value={meta.time || ''} readOnly={isViewer} onChange={e => { const date = meta.date?.split('T')[0] || meta.date || ''; const val = date && e.target.value ? date + 'T' + e.target.value : date; upMeta({ time: e.target.value, date: val }); }} style={inp(t)} /></Fl>
          </div>

        </Section>
        <Section t={t} title={tr('panneau.section.media')} icon="🖼️">
          {/* Photo */}
          <Fl label={tr('panneau.champ.photo')} t={t}><input value={meta.photo?.startsWith('/api/') ? meta.photo : (meta.photo || '')} readOnly={isViewer} onChange={e => upMeta({ photo: e.target.value })} placeholder={tr('panneau.ph.url')} style={inp(t)} /></Fl>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!isViewer && <button onClick={() => { const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { alert(tr('panneau.imageTropLourde')); return; } const r = new FileReader(); r.onload = async () => { try { const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: r.result, caseId }) }); const json = await res.json(); if (json.url) upMeta({ photo: json.url }); else alert(json.error || tr('panneau.erreurUpload')); } catch (err) { alert(tr('panneau.erreur', { message: err.message })); } }; r.readAsDataURL(f); }; fi.click(); }} style={{ padding: '6px 12px', background: t.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>📷 {tr('panneau.importerImage')}</button>}
            {meta.photo && !isViewer && <button onClick={() => upMeta({ photo: '' })} style={{ padding: '6px 8px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕ {tr('panneau.supprimer')}</button>}
          </div>
          {meta.photo && <img src={meta.photo} style={{ width: '100%', borderRadius: 8, maxHeight: 150, objectFit: 'cover', marginTop: 6 }} onError={e => e.target.style.display = 'none'} />}

          {/* Attachments - creates linked proof entities */}
          <Fl label={tr('panneau.champ.piecesJointes')} t={t}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
              {entityLinks.filter(l => {
                const oid = l.from === selectedId ? l.to : l.from;
                const other = entities.find(e => e.id === oid);
                return other?.subtype === 'document' || other?.subtype === 'evidence' || other?.subtype === 'photo';
              }).map(l => {
                const oid = l.from === selectedId ? l.to : l.from;
                const other = entities.find(e => e.id === oid);
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: t.surfaceAlt, borderRadius: 6, fontSize: 11 }}>
                    <span>📎</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text, fontWeight: 600 }}>{other?.label || '?'}</span>
                    <span style={{ fontSize: 9, color: t.textMuted }}>{other?.subtype}</span>
                  </div>
                );
              })}
            </div>
            {!isViewer && onAttachProof && <button onClick={() => onAttachProof(selectedId, entity)} style={{ width: '100%', padding: '8px 12px', background: t.surfaceAlt, border: `1px dashed ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>📎 {tr('panneau.attacherPreuve')}</button>}
          </Fl>

        </Section>
        {/* Réservée aux lieux : sur les autres entités, l'intitulé restait
            seul, sans un seul champ dessous. */}
        {entity.type === 'location' && (
        <Section t={t} title={tr('panneau.section.localisation')} icon="📍">
            <Fl label={tr('panneau.champ.gps')} t={t}><input value={meta.lat && meta.lng ? `${meta.lat}, ${meta.lng}` : ''} readOnly={isViewer} onChange={e => { const v = e.target.value; const m = v.match(/(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)/); if (m) upMeta({ lat: m[1], lng: m[2] }); else if (!v) upMeta({ lat: '', lng: '' }); }} placeholder="43.1833, 5.7166" style={inp(t)} /></Fl>
            <div style={{ display: 'flex', gap: 8 }}>
              <Fl label={tr('panneau.champ.latitude')} t={t}><input value={meta.lat || ''} readOnly={isViewer} onChange={e => upMeta({ lat: e.target.value })} placeholder="48.8566" style={inp(t)} /></Fl>
              <Fl label={tr('panneau.champ.longitude')} t={t}><input value={meta.lng || ''} readOnly={isViewer} onChange={e => upMeta({ lng: e.target.value })} placeholder="2.3522" style={inp(t)} /></Fl>
            </div>
            <Fl label={tr('panneau.champ.adresse')} t={t}><input value={meta.address || ''} readOnly={isViewer} onChange={e => upMeta({ address: e.target.value })} placeholder={tr('panneau.ph.adresse')} style={inp(t)} /></Fl>
            {!isViewer && <button onClick={async () => {
              const query = meta.address || entity.description || '';
              if (query.length < 5) { alert(tr('panneau.adresseCourte')); return; }
              try {
                const r = await fetch(`/api/geocode?q=${encodeURIComponent(normalizeAddress(query))}`);
                const d = await r.json();
                if (d[0]) upMeta({ lat: d[0].lat, lng: d[0].lon });
                else alert(tr('panneau.adresseIntrouvable'));
              } catch (err) { alert(tr('panneau.erreur', { message: err.message })); }
            }} style={{ width: '100%', padding: '8px 12px', background: '#10b98120', border: '1px solid #10b98140', borderRadius: 8, color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>📍 {tr('panneau.geolocaliser')}</button>}

        </Section>
        )}
        <Section t={t} title={tr('panneau.section.apparence')} icon="🎨">
          {/* Color */}
          <Fl label={tr('panneau.champ.couleur')} t={t}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{COLORS.map(c => <button key={c} disabled={isViewer} onClick={() => updateEntity(selectedId, { color: c })} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: entity.color === c ? '2px solid #fff' : '2px solid transparent', cursor: isViewer ? 'default' : 'pointer' }} />)}</div></Fl>

          {/* History button */}
          <button onClick={() => setShowHistory(!showHistory)} style={{ padding: '6px 10px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            🕐 {showHistory ? 'Masquer l\'historique' : 'Afficher l\'historique'}
          </button>
          {showHistory && (
            <div style={{ background: t.surfaceAlt, borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>{tr('panneau.historique')}</div>
              {(meta._history || []).length === 0
                ? <div style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic' }}>{tr('panneau.aucunHistorique')}</div>
                : (meta._history || []).slice().reverse().map((h, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${t.border}`, fontSize: 10 }}>
                    <span style={{ color: t.textMuted }}>{fmtDate(h.date)}</span> - <span style={{ color: t.text }}>{h.action}</span>
                    {h.user && <span style={{ color: t.textMuted }}> · {h.user}</span>}
                  </div>
                ))
              }
            </div>
          )}
        </Section>
      </>}

      {activeTab === 'links' && <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entityLinks.map(l => {
            const oid = l.from === selectedId ? l.to : l.from;
            const other = entities.find(e => e.id === oid);
            const lt = LINK_TYPES.find(x => x.id === l.type);
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: t.surfaceAlt, borderRadius: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: lt?.color || t.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other?.label || '?'}</div>
                  <div style={{ fontSize: 10, color: lt?.color || t.textMuted }}>{lt?.label || l.type}{l.bidirectional ? ' ↔' : ' →'}</div>
                </div>
                {!isViewer && <button onClick={() => deleteLink(l.id)} style={{ background: 'none', border: 'none', color: t.danger, cursor: 'pointer', padding: 2 }}>{Icons.trash}</button>}
              </div>
            );
          })}
          {entityLinks.length === 0 && <div style={{ fontSize: 11, color: t.textMuted, padding: 8, textAlign: 'center' }}>{tr('panneau.aucunLien')}</div>}
        </div>
        {!isViewer && <button onClick={() => { setLinkingFrom(selectedId); setHoldActive(true); }} style={{ padding: '8px 12px', background: t.surfaceAlt, border: `1px dashed ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{Icons.link} Créer un lien</button>}
      </>}

      {activeTab === 'notes' && <>
        <Fl label={tr('panneau.champ.notes')} t={t}><textarea value={entity.notes} onChange={e => updateEntity(selectedId, { notes: e.target.value })} rows={5} readOnly={isViewer} placeholder={tr('panneau.ph.notes')} style={{ ...inp(t), resize: 'vertical', fontFamily: 'inherit' }} /></Fl>
        <Fl label={`Commentaires (${entity.comments?.length || 0})`} t={t}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(entity.comments || []).map((c, i) => (
              <div key={c.id || i} style={{ padding: '6px 8px', background: t.surfaceAlt, borderRadius: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: t.textMuted, fontSize: 10 }}>{c.date ? fmtDate(c.date) : '-'} · {c.author || tr('commun.vous')}</span>
                  {!isViewer && <button onClick={() => { const nc = [...(entity.comments || [])]; nc.splice(i, 1); updateEntity(selectedId, { comments: nc }); }} style={{ background: 'none', border: 'none', color: t.danger, cursor: 'pointer', fontSize: 10 }}>✕</button>}
                </div>
                <div style={{ color: t.text }}>{c.text}</div>
              </div>
            ))}
            {!isViewer && <input placeholder={tr('panneau.ph.ajouterCommentaire')} style={{ ...inp(t), fontSize: 11 }} onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const nc = [...(entity.comments || []), { id: genId(), text: e.target.value.trim(), date: new Date().toISOString(), author: userName || tr('commun.vous') }]; updateEntity(selectedId, { comments: nc }); e.target.value = ''; logAction(tr('panneau.commentaireAjoute')); } }} />}
          </div>
        </Fl>
      </>}

      {/* Plugin tabs */}
      {pluginTabs.map(pt => activeTab === pt.id && pt.Panel && (
        <PluginErrorBoundary key={pt.id} pluginId={pt.pluginId} pluginName={pt.label} theme={t}>
          {/* Même contexte qu'en plein écran : un plugin déclarant les deux
              hooks ne doit pas perdre la moitié de ses capacités ici. */}
          <pt.Panel {...buildPluginContext({
            mode: 'entity-tab', pluginId: pt.pluginId,
            entity, entities, links, stickers, postits,
            addEntity, updateEntity, deleteEntity,
            addLink, updateLink, deleteLink,
            selectedId, setSelectedId,
            theme: t,
            settings: pt.settings,
            updateSettings: (k, v) => pluginEngine?.updateSetting(pt.pluginId, k, v),
            caseId, userName, collab,
            isViewer,
          })} />
        </PluginErrorBoundary>
      ))}
    </div>

    {/* Provenance de la fiche : qui l'a créée et quand.
        Retirée du corps de la carte sur le canvas - elle y occupait un tiers de
        la hauteur pour de la métadonnée d'édition. Elle a sa place ici, en pied,
        et reste visible en lecture seule (contrairement aux boutons d'action). */}
    {(entity.author || entity.createdAt) && (
      <div style={{
        padding: '8px 16px', borderTop: `1px solid ${t.border}`, background: t.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, fontSize: 10.5, color: t.textMuted, flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}
          title={entity.author ? tr('panneau.titre.creePar', { nom: entity.author }) : ''}>
          <span>👤</span>
          <span style={{ fontWeight: 600, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entity.author || tr('panneau.auteurInconnu')}
          </span>
        </span>
        {entity.createdAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={tr('panneau.titre.creeLe', { date: fmtDate(entity.createdAt) })}>
            <span>🕐</span>{fmtDate(entity.createdAt)}
          </span>
        )}
      </div>
    )}

    {/* Footer */}
    {!isViewer && (
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8 }}>
        <button onClick={() => duplicateEntity(selectedId)} style={{ flex: 1, padding: 9, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.copy} {tr('panneau.dupliquer')}</button>
        <button onClick={() => deleteEntity(selectedId)} style={{ flex: 1, padding: 9, background: t.danger + '15', border: `1px solid ${t.danger}30`, borderRadius: 8, color: t.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.trash} {tr('panneau.supprimer')}</button>
      </div>
    )}
  </>;
}

// ═══ MAIN EXPORT ═══
export default function EntityPanel({ caseId, userName, collab, stickers, postits, setSelectedId, open, entity, link, t, selectedId, selectedLinkId, onClose, onCloseLink, updateEntity, deleteEntity, duplicateEntity, updateLink, deleteLink, links, entities, linkCount, setLinkingFrom, setHoldActive, logAction, genId, addEntity, addLink, CATEGORIES, ALL_ITEMS, LINK_TYPES, Icons, isViewer, normalizeAddress, getStrengthFromConfidence, pluginEngine }) {
  const tr = useT();

  // Create a proof entity linked to the current entity
  const handleAttachProof = (entityId, ent) => {
    if (!addEntity || !addLink) return;
    const proofId = genId();
    const proofEnt = { id: proofId, type: 'data', subtype: 'document', label: traduire('panneau.preuveDe', { label: ent.label }), description: '', notes: '', x: ent.x + 200, y: ent.y + 50, color: '#64748b', metadata: { status: 'unverified', reliability: 'F' }, comments: [], author: userName || traduire('commun.vous'), createdAt: new Date().toISOString() };
    // We need to use the raw setters since addEntity expects a subItemId
    // Instead, directly call the mutations if available
    addEntity('document', ent.x + 200, ent.y + 50);
  };

  return (
    <div style={{ width: open ? 340 : 0, minWidth: open ? 340 : 0, height: '100vh', background: t.surface, borderLeft: open ? `1px solid ${t.border}` : 'none', transition: 'all 0.25s', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      {open && entity && <EntityView caseId={caseId} userName={userName} collab={collab} stickers={stickers} postits={postits} setSelectedId={setSelectedId} addEntity={addEntity} addLink={addLink} updateLink={updateLink} entity={entity} t={t} updateEntity={updateEntity} deleteEntity={deleteEntity} duplicateEntity={duplicateEntity} links={links} entities={entities} deleteLink={deleteLink} setLinkingFrom={setLinkingFrom} setHoldActive={setHoldActive} selectedId={selectedId} logAction={logAction} genId={genId} CATEGORIES={CATEGORIES} ALL_ITEMS={ALL_ITEMS} LINK_TYPES={LINK_TYPES} linkCount={linkCount} Icons={Icons} isViewer={isViewer} normalizeAddress={normalizeAddress} getStrengthFromConfidence={getStrengthFromConfidence} onAttachProof={handleAttachProof} pluginEngine={pluginEngine} />}

      {open && link && !entity && (() => {
        const ls = getStrengthFromConfidence(link.confidence || 0);
        return <>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 12, height: 12, borderRadius: 6, background: t[ls.tone] }} /><div style={{ fontSize: 13, fontWeight: 700 }}>{tr('panneau.proprietesLien')}</div></div>
            <button onClick={onCloseLink} style={sBtn(t)}>{Icons.x}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Fl label={tr('panneau.champ.typeRelation')} t={t}><select value={link.type} disabled={isViewer} onChange={e => { const lt = LINK_TYPES.find(l => l.id === e.target.value); updateLink(selectedLinkId, { type: e.target.value, color: lt?.color }); }} style={inp(t)}>{LINK_TYPES.map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}</select></Fl>
            <Fl label={tr('panneau.champ.direction')} t={t}><button disabled={isViewer} onClick={() => updateLink(selectedLinkId, { bidirectional: !link.bidirectional })} style={{ width: '100%', padding: '8px 12px', background: link.bidirectional ? t.accent + '20' : t.surfaceAlt, border: `1px solid ${link.bidirectional ? t.accent : t.border}`, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 16 }}>{link.bidirectional ? '↔️' : '→'}</span>{link.bidirectional ? tr('panneau.bidirectionnel') : 'Unidirectionnel'}</button></Fl>
            <Fl label={tr('panneau.confianceLabel', { n: link.confidence || 0, palier: tr('confiance.' + ls.id) })} t={t}>
              <ConfidenceSlider t={t} color={t[ls.tone]} value={link.confidence || 0} disabled={isViewer}
                onChange={v => updateLink(selectedLinkId, { confidence: v, strength: getStrengthFromConfidence(v).id })} />
            </Fl>
            <Fl label={tr('panneau.champ.label')} t={t}><input value={link.label} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { label: e.target.value })} placeholder={tr('panneau.ph.labelOptionnel')} style={inp(t)} /></Fl>
            <Fl label={tr('panneau.champ.date')} t={t}><input type="date" value={link.date || ''} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { date: e.target.value })} style={inp(t)} /></Fl>
            <Fl label={tr('panneau.champ.source')} t={t}><input value={link.source || ''} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { source: e.target.value })} placeholder={tr('panneau.ph.source')} style={inp(t)} /></Fl>
            {!isViewer && <button onClick={() => deleteLink(selectedLinkId)} style={{ padding: 9, background: t.danger + '15', border: `1px solid ${t.danger}30`, borderRadius: 8, color: t.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.trash} {tr('panneau.supprimer')}</button>}
          </div>
        </>;
      })()}
    </div>
  );
}
