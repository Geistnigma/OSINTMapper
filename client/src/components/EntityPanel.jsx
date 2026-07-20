import React, { useState, useMemo } from 'react';
import { searchNATINF } from '../lib/natinf.js';
import { PluginErrorBoundary } from '../plugins/core/ErrorBoundary.jsx';

/**
 * EntityPanel — Right panel for entity and link editing.
 * Extracted from OSINTMapper monolith + enriched with OSINT fields.
 */

// ═══ CONSTANTS ═══
const RELIABILITY = [
  { id: 'A', label: 'Fiable', desc: 'Aucune raison de douter de la source', color: '#10b981' },
  { id: 'B', label: 'Habituellement fiable', desc: 'Source vérifiée dans le passé', color: '#3b82f6' },
  { id: 'C', label: 'Assez fiable', desc: 'Source pas toujours vérifiable', color: '#06b6d4' },
  { id: 'D', label: 'Pas toujours fiable', desc: 'Source avec échecs passés', color: '#f59e0b' },
  { id: 'E', label: 'Non fiable', desc: 'Source à fiabilité douteuse', color: '#ef4444' },
  { id: 'F', label: 'Non évalué', desc: 'Fiabilité de la source inconnue', color: '#64748b' },
];

const CREDIBILITY = [
  { id: '1', label: 'Confirmée', desc: 'Confirmée par d\'autres sources indépendantes', color: '#10b981' },
  { id: '2', label: 'Probablement vraie', desc: 'Cohérente avec d\'autres infos connues', color: '#3b82f6' },
  { id: '3', label: 'Peut-être vraie', desc: 'Pas confirmée mais plausible', color: '#06b6d4' },
  { id: '4', label: 'Douteuse', desc: 'Incohérente avec d\'autres infos', color: '#f59e0b' },
  { id: '5', label: 'Improbable', desc: 'Contredite par d\'autres sources', color: '#ef4444' },
  { id: '6', label: 'Non évaluée', desc: 'Véracité impossible à déterminer', color: '#64748b' },
];

const STATUSES = [
  { id: 'unverified', label: 'À vérifier', icon: '❓', color: '#f59e0b' },
  { id: 'confirmed', label: 'Confirmé', icon: '✅', color: '#10b981' },
  { id: 'denied', label: 'Infirmé', icon: '❌', color: '#ef4444' },
  { id: 'archived', label: 'Archivé', icon: '📦', color: '#64748b' },
];

const COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#eab308', '#64748b'];

// ═══ HELPERS ═══
function Fl({ label, t, children }) {
  return <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>{children}</div>;
}

function inp(t) { return { width: '100%', padding: '8px 10px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 12, outline: 'none' }; }
function sBtn(t) { return { background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }; }

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
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
function EntityView({ entity, t, updateEntity, deleteEntity, duplicateEntity, links, entities, deleteLink, setLinkingFrom, setHoldActive, selectedId, logAction, genId, CATEGORIES, ALL_ITEMS, LINK_TYPES, linkCount, Icons, isViewer, normalizeAddress, getStrengthFromConfidence, onAttachProof, pluginEngine }) {
  const [activeTab, setActiveTab] = useState('info');
  const [showHistory, setShowHistory] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [natinfQuery, setNatinfQuery] = useState('');
  const [natinfOpen, setNatinfOpen] = useState(false);

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
      label: pl.hookConfig.label || pl.manifest.name,
      icon: pl.hookConfig.icon || pl.manifest.icon,
      Panel: pl.components.Panel,
      settings: pl.settings,
    }));
  }, [pluginEngine]);

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
      {(() => { const s = STATUSES.find(s => s.id === (meta.status || 'unverified')); return s ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: s.color + '20', color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span> : null; })()}
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
        <Fl label="Nom" t={t}><input value={entity.label} onChange={e => updateEntity(selectedId, { label: e.target.value })} style={inp(t)} readOnly={isViewer} /></Fl>
        <Fl label="Sous-type" t={t}><select value={entity.subtype} disabled={isViewer} onChange={e => { const ni = ALL_ITEMS[e.target.value]; if (ni) updateEntity(selectedId, { subtype: e.target.value, type: ni.category, color: ni.color }); }} style={inp(t)}>{cat?.items.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}</select></Fl>
        <Fl label="Description" t={t}><textarea value={entity.description} onChange={e => updateEntity(selectedId, { description: e.target.value })} rows={2} placeholder="Description..." readOnly={isViewer} style={{ ...inp(t), resize: 'vertical', fontFamily: 'inherit' }} /></Fl>

        {/* NATINF — shown for infraction entities */}
        {entity.type === 'infraction' && <>
          <Fl label={`Code NATINF${meta.natinf_code ? ` — ${meta.natinf_code}` : ''}`} t={t}>
            {meta.natinf_code && (
              <div style={{ padding: '8px 10px', background: t.surfaceAlt, borderRadius: 8, marginBottom: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: t.text }}>{meta.natinf_code} — {meta.natinf_label}</span>
                  {!isViewer && <button onClick={() => upMeta({ natinf_code: null, natinf_label: null, natinf_texte: null, natinf_categorie: null, natinf_quantum: null })} style={{ background: 'none', border: 'none', color: t.danger, cursor: 'pointer', fontSize: 10 }}>✕</button>}
                </div>
                <div style={{ color: t.textMuted, marginTop: 2 }}>{meta.natinf_texte}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: meta.natinf_categorie === 'crime' ? '#dc262620' : meta.natinf_categorie === 'délit' ? '#f59e0b20' : '#64748b20', color: meta.natinf_categorie === 'crime' ? '#dc2626' : meta.natinf_categorie === 'délit' ? '#f59e0b' : '#64748b' }}>
                    {(meta.natinf_categorie || '').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted }}>{meta.natinf_quantum}</span>
                </div>
              </div>
            )}
            {!isViewer && <div style={{ position: 'relative' }}>
              <input value={natinfQuery} onChange={e => { setNatinfQuery(e.target.value); setNatinfOpen(true); }} onFocus={() => setNatinfOpen(true)} placeholder="Rechercher par code ou libellé..." style={{ ...inp(t), fontSize: 11 }} />
              {natinfOpen && natinfQuery.length >= 2 && (() => {
                const results = searchNATINF(natinfQuery, entity.subtype !== 'inf_autre' ? entity.subtype : null);
                if (results.length === 0) return <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, fontSize: 11, color: t.textMuted, zIndex: 20, boxShadow: `0 4px 12px ${t.shadow || 'rgba(0,0,0,0.3)'}` }}>Aucun résultat</div>;
                return <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, zIndex: 20, boxShadow: `0 4px 12px ${t.shadow || 'rgba(0,0,0,0.3)'}` }}>
                  {results.map(n => (
                    <button key={n.code} onClick={() => { upMeta({ natinf_code: n.code, natinf_label: n.label, natinf_texte: n.texte, natinf_categorie: n.categorie, natinf_quantum: n.quantum }); setNatinfQuery(''); setNatinfOpen(false); updateEntity(selectedId, { description: n.label }); }} style={{ width: '100%', padding: '6px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${t.border}`, cursor: 'pointer', textAlign: 'left', color: t.text, fontSize: 11 }} onMouseEnter={e => e.currentTarget.style.background = t.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700 }}>{n.code}</span>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: n.categorie === 'crime' ? '#dc262620' : n.categorie === 'délit' ? '#f59e0b20' : '#64748b20', color: n.categorie === 'crime' ? '#dc2626' : n.categorie === 'délit' ? '#f59e0b' : '#64748b', fontWeight: 700 }}>{n.categorie}</span>
                      </div>
                      <div style={{ color: t.textSecondary, marginTop: 1 }}>{n.label}</div>
                      <div style={{ color: t.textMuted, fontSize: 10, marginTop: 1 }}>{n.texte} — {n.quantum}</div>
                    </button>
                  ))}
                </div>;
              })()}
            </div>}
          </Fl>
        </>}

        {/* Status */}
        <Fl label="Statut" t={t}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STATUSES.map(s => (
              <button key={s.id} disabled={isViewer} onClick={() => upMeta({ status: s.id })} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer',
                background: (meta.status || 'unverified') === s.id ? s.color + '20' : t.surfaceAlt,
                color: (meta.status || 'unverified') === s.id ? s.color : t.textSecondary,
                border: `1px solid ${(meta.status || 'unverified') === s.id ? s.color + '60' : t.border}`,
              }}>{s.icon} {s.label}</button>
            ))}
          </div>
        </Fl>

        {/* Reliability — NATO/Admiralty dual scale */}
        <Fl label="Classification OTAN (source)" t={t}>
          <div style={{ display: 'flex', gap: 3 }}>
            {RELIABILITY.map(r => (
              <button key={r.id} disabled={isViewer} onClick={() => upMeta({ reliability: r.id })} title={`${r.id} — ${r.label}: ${r.desc}`} style={{
                flex: 1, padding: '6px 0', fontSize: 13, fontWeight: 800, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', textAlign: 'center',
                background: (meta.reliability || 'F') === r.id ? r.color + '25' : t.surfaceAlt,
                color: (meta.reliability || 'F') === r.id ? r.color : t.textMuted,
                border: `1px solid ${(meta.reliability || 'F') === r.id ? r.color + '60' : t.border}`,
              }}>{r.id}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
            {(RELIABILITY.find(r => r.id === (meta.reliability || 'F')))?.id} — {(RELIABILITY.find(r => r.id === (meta.reliability || 'F')))?.label}
          </div>
        </Fl>

        <Fl label="Classification OTAN (information)" t={t}>
          <div style={{ display: 'flex', gap: 3 }}>
            {CREDIBILITY.map(r => (
              <button key={r.id} disabled={isViewer} onClick={() => upMeta({ credibility: r.id })} title={`${r.id} — ${r.label}: ${r.desc}`} style={{
                flex: 1, padding: '6px 0', fontSize: 13, fontWeight: 800, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', textAlign: 'center',
                background: (meta.credibility || '6') === r.id ? r.color + '25' : t.surfaceAlt,
                color: (meta.credibility || '6') === r.id ? r.color : t.textMuted,
                border: `1px solid ${(meta.credibility || '6') === r.id ? r.color + '60' : t.border}`,
              }}>{r.id}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
            {(CREDIBILITY.find(r => r.id === (meta.credibility || '6')))?.id} — {(CREDIBILITY.find(r => r.id === (meta.credibility || '6')))?.label}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, marginTop: 6, padding: '4px 8px', background: t.accent + '10', borderRadius: 6, textAlign: 'center' }}>
            Cotation : {meta.reliability || 'F'}{meta.credibility || '6'}
          </div>
        </Fl>

        {/* Tags */}
        <Fl label="Tags" t={t}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: (meta.tags?.length) ? 6 : 0 }}>
            {(meta.tags || []).map((tag, i) => <Tag key={i} label={tag} t={t} onRemove={isViewer ? null : () => upMeta({ tags: meta.tags.filter((_, j) => j !== i) })} />)}
          </div>
          {!isViewer && <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Ajouter un tag + Entrée" style={{ ...inp(t), fontSize: 11 }}
            onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { upMeta({ tags: [...(meta.tags || []), tagInput.trim()] }); setTagInput(''); } }} />}
        </Fl>

        {/* Aliases */}
        <Fl label="Alias / Noms alternatifs" t={t}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: (meta.aliases?.length) ? 6 : 0 }}>
            {(meta.aliases || []).map((a, i) => <Tag key={i} label={a} color="#a855f7" t={t} onRemove={isViewer ? null : () => upMeta({ aliases: meta.aliases.filter((_, j) => j !== i) })} />)}
          </div>
          {!isViewer && <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} placeholder="Ajouter un alias + Entrée" style={{ ...inp(t), fontSize: 11 }}
            onKeyDown={e => { if (e.key === 'Enter' && aliasInput.trim()) { upMeta({ aliases: [...(meta.aliases || []), aliasInput.trim()] }); setAliasInput(''); } }} />}
        </Fl>

        {/* Date + Time */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Fl label="Date" t={t}><input type="date" value={meta.date?.split('T')[0] || meta.date || ''} readOnly={isViewer} onChange={e => { const time = meta.time || ''; const val = time ? e.target.value + 'T' + time : e.target.value; upMeta({ date: val }); }} style={inp(t)} /></Fl>
          <Fl label="Heure" t={t}><input type="time" value={meta.time || ''} readOnly={isViewer} onChange={e => { const date = meta.date?.split('T')[0] || meta.date || ''; const val = date && e.target.value ? date + 'T' + e.target.value : date; upMeta({ time: e.target.value, date: val }); }} style={inp(t)} /></Fl>
        </div>

        {/* Photo */}
        <Fl label="Image / Photo (URL)" t={t}><input value={meta.photo?.startsWith('/api/') ? meta.photo : (meta.photo || '')} readOnly={isViewer} onChange={e => upMeta({ photo: e.target.value })} placeholder="https://..." style={inp(t)} /></Fl>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!isViewer && <button onClick={() => { const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { alert('Image trop lourde (max 10 Mo)'); return; } const r = new FileReader(); r.onload = async () => { try { const token = localStorage.getItem('om_token'); const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ data: r.result }) }); const json = await res.json(); if (json.url) upMeta({ photo: json.url }); else alert(json.error || 'Erreur upload'); } catch (err) { alert('Erreur: ' + err.message); } }; r.readAsDataURL(f); }; fi.click(); }} style={{ padding: '6px 12px', background: t.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>📷 Importer une image</button>}
          {meta.photo && !isViewer && <button onClick={() => upMeta({ photo: '' })} style={{ padding: '6px 8px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕ Supprimer</button>}
        </div>
        {meta.photo && <img src={meta.photo} style={{ width: '100%', borderRadius: 8, maxHeight: 150, objectFit: 'cover', marginTop: 6 }} onError={e => e.target.style.display = 'none'} />}

        {/* Attachments — creates linked proof entities */}
        <Fl label="Pièces jointes" t={t}>
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
          {!isViewer && onAttachProof && <button onClick={() => onAttachProof(selectedId, entity)} style={{ width: '100%', padding: '8px 12px', background: t.surfaceAlt, border: `1px dashed ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>📎 Attacher une preuve</button>}
        </Fl>

        {/* Location fields */}
        {entity.type === 'location' && <>
          <Fl label="GPS (lat, lng)" t={t}><input value={meta.lat && meta.lng ? `${meta.lat}, ${meta.lng}` : ''} readOnly={isViewer} onChange={e => { const v = e.target.value; const m = v.match(/(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)/); if (m) upMeta({ lat: m[1], lng: m[2] }); else if (!v) upMeta({ lat: '', lng: '' }); }} placeholder="43.1833, 5.7166" style={inp(t)} /></Fl>
          <div style={{ display: 'flex', gap: 8 }}>
            <Fl label="Latitude" t={t}><input value={meta.lat || ''} readOnly={isViewer} onChange={e => upMeta({ lat: e.target.value })} placeholder="48.8566" style={inp(t)} /></Fl>
            <Fl label="Longitude" t={t}><input value={meta.lng || ''} readOnly={isViewer} onChange={e => upMeta({ lng: e.target.value })} placeholder="2.3522" style={inp(t)} /></Fl>
          </div>
          <Fl label="Adresse" t={t}><input value={meta.address || ''} readOnly={isViewer} onChange={e => upMeta({ address: e.target.value })} placeholder="12 rue de la Paix, Paris" style={inp(t)} /></Fl>
          {!isViewer && <button onClick={async () => {
            const query = meta.address || entity.description || '';
            if (query.length < 5) { alert('Adresse trop courte (min 5 car.)'); return; }
            try {
              const r = await fetch(`/api/geocode?q=${encodeURIComponent(normalizeAddress(query))}`);
              const d = await r.json();
              if (d[0]) upMeta({ lat: d[0].lat, lng: d[0].lon });
              else alert('Adresse non trouvée.');
            } catch (err) { alert('Erreur réseau : ' + err.message); }
          }} style={{ width: '100%', padding: '8px 12px', background: '#10b98120', border: '1px solid #10b98140', borderRadius: 8, color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>📍 Géolocaliser depuis l'adresse</button>}
        </>}

        {/* Color */}
        <Fl label="Couleur" t={t}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{COLORS.map(c => <button key={c} disabled={isViewer} onClick={() => updateEntity(selectedId, { color: c })} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: entity.color === c ? '2px solid #fff' : '2px solid transparent', cursor: isViewer ? 'default' : 'pointer' }} />)}</div></Fl>

        {/* History button */}
        <button onClick={() => setShowHistory(!showHistory)} style={{ padding: '6px 10px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          🕐 {showHistory ? 'Masquer l\'historique' : 'Afficher l\'historique'}
        </button>
        {showHistory && (
          <div style={{ background: t.surfaceAlt, borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>HISTORIQUE DES MODIFICATIONS</div>
            {(meta._history || []).length === 0
              ? <div style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic' }}>Aucun historique enregistré</div>
              : (meta._history || []).slice().reverse().map((h, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${t.border}`, fontSize: 10 }}>
                  <span style={{ color: t.textMuted }}>{fmtDate(h.date)}</span> — <span style={{ color: t.text }}>{h.action}</span>
                  {h.user && <span style={{ color: t.textMuted }}> · {h.user}</span>}
                </div>
              ))
            }
          </div>
        )}
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
          {entityLinks.length === 0 && <div style={{ fontSize: 11, color: t.textMuted, padding: 8, textAlign: 'center' }}>Aucun lien</div>}
        </div>
        {!isViewer && <button onClick={() => { setLinkingFrom(selectedId); setHoldActive(true); }} style={{ padding: '8px 12px', background: t.surfaceAlt, border: `1px dashed ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{Icons.link} Créer un lien</button>}
      </>}

      {activeTab === 'notes' && <>
        <Fl label="Notes internes" t={t}><textarea value={entity.notes} onChange={e => updateEntity(selectedId, { notes: e.target.value })} rows={5} readOnly={isViewer} placeholder="Pistes, remarques..." style={{ ...inp(t), resize: 'vertical', fontFamily: 'inherit' }} /></Fl>
        <Fl label={`Commentaires (${entity.comments?.length || 0})`} t={t}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(entity.comments || []).map((c, i) => (
              <div key={c.id || i} style={{ padding: '6px 8px', background: t.surfaceAlt, borderRadius: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: t.textMuted, fontSize: 10 }}>{c.date ? fmtDate(c.date) : '—'} · {c.author || 'Vous'}</span>
                  {!isViewer && <button onClick={() => { const nc = [...(entity.comments || [])]; nc.splice(i, 1); updateEntity(selectedId, { comments: nc }); }} style={{ background: 'none', border: 'none', color: t.danger, cursor: 'pointer', fontSize: 10 }}>✕</button>}
                </div>
                <div style={{ color: t.text }}>{c.text}</div>
              </div>
            ))}
            {!isViewer && <input placeholder="Ajouter un commentaire + Entrée" style={{ ...inp(t), fontSize: 11 }} onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { const nc = [...(entity.comments || []), { id: genId(), text: e.target.value.trim(), date: new Date().toISOString(), author: 'Vous' }]; updateEntity(selectedId, { comments: nc }); e.target.value = ''; logAction('Commentaire ajouté'); } }} />}
          </div>
        </Fl>
      </>}

      {/* Plugin tabs */}
      {pluginTabs.map(pt => activeTab === pt.id && pt.Panel && (
        <PluginErrorBoundary key={pt.id} pluginId={pt.pluginId} pluginName={pt.label} theme={t}>
          <pt.Panel
            entity={entity}
            entities={entities}
            links={links}
            selectedId={selectedId}
            updateEntity={updateEntity}
            theme={t}
            settings={pt.settings}
            isViewer={isViewer}
          />
        </PluginErrorBoundary>
      ))}
    </div>

    {/* Footer */}
    {!isViewer && (
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8 }}>
        <button onClick={() => duplicateEntity(selectedId)} style={{ flex: 1, padding: 9, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.copy} Dupliquer</button>
        <button onClick={() => deleteEntity(selectedId)} style={{ flex: 1, padding: 9, background: t.danger + '15', border: `1px solid ${t.danger}30`, borderRadius: 8, color: t.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.trash} Supprimer</button>
      </div>
    )}
  </>;
}

// ═══ MAIN EXPORT ═══
export default function EntityPanel({ open, entity, link, t, selectedId, selectedLinkId, onClose, onCloseLink, updateEntity, deleteEntity, duplicateEntity, updateLink, deleteLink, links, entities, linkCount, setLinkingFrom, setHoldActive, logAction, genId, addEntity, addLink, CATEGORIES, ALL_ITEMS, LINK_TYPES, Icons, isViewer, normalizeAddress, getStrengthFromConfidence, pluginEngine }) {

  // Create a proof entity linked to the current entity
  const handleAttachProof = (entityId, ent) => {
    if (!addEntity || !addLink) return;
    const proofId = genId();
    const proofEnt = { id: proofId, type: 'data', subtype: 'document', label: `Preuve — ${ent.label}`, description: '', notes: '', x: ent.x + 200, y: ent.y + 50, color: '#64748b', metadata: { status: 'unverified', reliability: 'F' }, comments: [] };
    // We need to use the raw setters since addEntity expects a subItemId
    // Instead, directly call the mutations if available
    addEntity('document', ent.x + 200, ent.y + 50);
  };

  return (
    <div style={{ width: open ? 340 : 0, minWidth: open ? 340 : 0, height: '100vh', background: t.surface, borderLeft: open ? `1px solid ${t.border}` : 'none', transition: 'all 0.25s', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      {open && entity && <EntityView entity={entity} t={t} updateEntity={updateEntity} deleteEntity={deleteEntity} duplicateEntity={duplicateEntity} links={links} entities={entities} deleteLink={deleteLink} setLinkingFrom={setLinkingFrom} setHoldActive={setHoldActive} selectedId={selectedId} logAction={logAction} genId={genId} CATEGORIES={CATEGORIES} ALL_ITEMS={ALL_ITEMS} LINK_TYPES={LINK_TYPES} linkCount={linkCount} Icons={Icons} isViewer={isViewer} normalizeAddress={normalizeAddress} getStrengthFromConfidence={getStrengthFromConfidence} onAttachProof={handleAttachProof} pluginEngine={pluginEngine} />}

      {open && link && !entity && (() => {
        const ls = getStrengthFromConfidence(link.confidence || 0);
        return <>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 12, height: 12, borderRadius: 6, background: ls.badgeColor }} /><div style={{ fontSize: 13, fontWeight: 700 }}>Propriétés du lien</div></div>
            <button onClick={onCloseLink} style={sBtn(t)}>{Icons.x}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Fl label="Type de relation" t={t}><select value={link.type} disabled={isViewer} onChange={e => { const lt = LINK_TYPES.find(l => l.id === e.target.value); updateLink(selectedLinkId, { type: e.target.value, color: lt?.color }); }} style={inp(t)}>{LINK_TYPES.map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}</select></Fl>
            <Fl label="Direction" t={t}><button disabled={isViewer} onClick={() => updateLink(selectedLinkId, { bidirectional: !link.bidirectional })} style={{ width: '100%', padding: '8px 12px', background: link.bidirectional ? t.accent + '20' : t.surfaceAlt, border: `1px solid ${link.bidirectional ? t.accent : t.border}`, borderRadius: 6, cursor: isViewer ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 16 }}>{link.bidirectional ? '↔️' : '→'}</span>{link.bidirectional ? 'Bidirectionnel' : 'Unidirectionnel'}</button></Fl>
            <Fl label={`Confiance : ${link.confidence || 0}% — ${ls.label}`} t={t}>
              <input type="range" min={0} max={100} disabled={isViewer} value={link.confidence || 0} onChange={e => updateLink(selectedLinkId, { confidence: parseInt(e.target.value), strength: getStrengthFromConfidence(parseInt(e.target.value)).id })} style={{ width: '100%', accentColor: ls.badgeColor }} />
            </Fl>
            <Fl label="Label" t={t}><input value={link.label} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { label: e.target.value })} placeholder="Label optionnel..." style={inp(t)} /></Fl>
            <Fl label="Date" t={t}><input type="date" value={link.date || ''} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { date: e.target.value })} style={inp(t)} /></Fl>
            <Fl label="Source" t={t}><input value={link.source || ''} readOnly={isViewer} onChange={e => updateLink(selectedLinkId, { source: e.target.value })} placeholder="D'où vient cette info..." style={inp(t)} /></Fl>
            {!isViewer && <button onClick={() => deleteLink(selectedLinkId)} style={{ padding: 9, background: t.danger + '15', border: `1px solid ${t.danger}30`, borderRadius: 8, color: t.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{Icons.trash} Supprimer</button>}
          </div>
        </>;
      })()}
    </div>
  );
}
