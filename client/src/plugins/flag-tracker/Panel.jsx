import React, { useState, useMemo, useEffect, useRef } from 'react';

/**
 * Flag Tracker Panel — works in TWO modes:
 * 
 * 1. ENTITY TAB (entity prop present): flag marking UI for a single entity
 * 2. FULLSCREEN (no entity): challenge tracker with flag listing, scoring, export
 */

const CATEGORIES = ['OSINT','Crypto','Web','Forensics','Stego','Misc','Rev','Pwn','Network','Mobile'];
const STATUSES = [
  { id: 'found', label: 'Trouvé', icon: '✅', color: '#10b981' },
  { id: 'progress', label: 'En cours', icon: '🔄', color: '#f59e0b' },
  { id: 'stuck', label: 'Bloqué', icon: '🧱', color: '#ef4444' },
  { id: 'skipped', label: 'Passé', icon: '⏭️', color: '#64748b' },
];

function genId() { return Math.random().toString(36).slice(2, 10); }
function storageKey(caseId) { return `om_flags_${caseId || 'default'}`; }
function loadFlags(caseId) { try { return JSON.parse(localStorage.getItem(storageKey(caseId))) || []; } catch { return []; } }
function saveFlags(caseId, flags) { localStorage.setItem(storageKey(caseId), JSON.stringify(flags)); }
function formatTimer(s) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?`${h}h${String(m).padStart(2,'0')}m`:m>0?`${m}m${String(sec).padStart(2,'0')}s`:`${sec}s`; }

/** Get all non-empty fields from an entity for flag source dropdown */
function getEntityFields(entity) {
  const fields = [];
  if (entity.label) fields.push({ key: 'label', label: 'Nom / Label', value: entity.label });
  if (entity.description) fields.push({ key: 'description', label: 'Description', value: entity.description });
  if (entity.notes) fields.push({ key: 'notes', label: 'Notes', value: entity.notes });
  const m = entity.metadata || {};
  if (m.lat && m.lng) fields.push({ key: 'gps', label: 'Coordonnées GPS', value: `${m.lat},${m.lng}` });
  if (m.address) fields.push({ key: 'address', label: 'Adresse', value: m.address });
  if (m.photo) fields.push({ key: 'photo', label: 'URL Photo', value: m.photo });
  if (m.natinf_code) fields.push({ key: 'natinf', label: `NATINF ${m.natinf_code}`, value: m.natinf_code });
  // Scan for any other string metadata
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'string' && v && !['status','reliability','credibility','photo','address','time','date'].includes(k) && !k.startsWith('_') && !k.startsWith('natinf')) {
      fields.push({ key: `meta_${k}`, label: k, value: v });
    }
  }
  return fields;
}

// ═══════════════════════════════════════════════════════════════════
// ENTITY TAB MODE — shown inside EntityPanel right sidebar
// ═══════════════════════════════════════════════════════════════════
function EntityTab({ entity, entities, selectedId, updateEntity, theme: t, settings, isViewer }) {
  const pattern = settings?.flagPattern || 'FLAG';
  const meta = entity.metadata || {};
  const isFlag = !!meta.isFlag;
  const fields = useMemo(() => getEntityFields(entity), [entity]);
  const [sourceKey, setSourceKey] = useState(meta.flagSourceKey || (fields[0]?.key || 'label'));

  const selectedField = fields.find(f => f.key === sourceKey) || fields[0];
  const generatedFlag = selectedField ? `${pattern}{${selectedField.value}}` : '';

  const upMeta = (patch) => updateEntity(selectedId, { metadata: { ...meta, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toggle flag */}
      <button disabled={isViewer} onClick={() => upMeta({ isFlag: !isFlag, flag: !isFlag ? generatedFlag : null, flagSourceKey: !isFlag ? sourceKey : null })} style={{
        width: '100%', padding: '10px 14px', borderRadius: 8, cursor: isViewer ? 'default' : 'pointer', fontSize: 12, fontWeight: 700,
        background: isFlag ? '#10b98120' : t.surfaceAlt, color: isFlag ? '#10b981' : t.textSecondary,
        border: `1px solid ${isFlag ? '#10b98160' : t.border}`, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{isFlag ? '🚩' : '⬜'}</span>
        {isFlag ? 'Cette entité est un flag' : 'Marquer comme flag'}
      </button>

      {isFlag && <>
        {/* Source field selector */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>Champ source du flag</div>
          <select value={sourceKey} disabled={isViewer} onChange={e => { setSourceKey(e.target.value); upMeta({ flagSourceKey: e.target.value }); }} style={{
            width: '100%', padding: '8px 10px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 12, outline: 'none',
          }}>
            {fields.map(f => <option key={f.key} value={f.key}>{f.label} — {f.value.length > 40 ? f.value.slice(0, 40) + '…' : f.value}</option>)}
          </select>
        </div>

        {/* Preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>Aperçu</div>
          <div style={{ padding: '10px 14px', background: '#10b98110', border: '1px solid #10b98130', borderRadius: 8, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#10b981', wordBreak: 'break-all' }}>
            {generatedFlag}
          </div>
        </div>

        {/* Generate + Copy */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={isViewer} onClick={() => upMeta({ flag: generatedFlag, flagSourceKey: sourceKey })} style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: t.accent, color: '#fff',
          }}>⚡ Générer</button>
          <button onClick={() => navigator.clipboard.writeText(meta.flag || generatedFlag)} style={{
            flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: t.surfaceAlt, color: t.text,
          }}>📋 Copier</button>
        </div>

        {/* Stored flag */}
        {meta.flag && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>Flag enregistré</div>
            <code style={{ display: 'block', padding: '8px 10px', background: t.surfaceAlt, borderRadius: 6, fontSize: 11, color: '#10b981', wordBreak: 'break-all' }}>{meta.flag}</code>
          </div>
        )}
      </>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// FULLSCREEN MODE — challenge tracker
// ═══════════════════════════════════════════════════════════════════
function FullscreenPanel({ entities, theme: t, settings, caseId }) {
  const [flags, setFlags] = useState(() => loadFlags(caseId));
  const [view, setView] = useState('list');
  const [filterCat, setFilterCat] = useState('Tout');
  const [filterStatus, setFilterStatus] = useState('Tout');
  const [editId, setEditId] = useState(null);
  const [timer, setTimer] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const timerRef = useRef(null);
  const [form, setForm] = useState({ challenge: '', flag: '', category: 'OSINT', points: 0, notes: '', status: 'progress', linkedEntityId: '' });

  const pattern = settings?.flagPattern || 'FLAG';
  const ctfName = settings?.ctfName || 'CTF';

  useEffect(() => { saveFlags(caseId, flags); }, [flags, caseId]);
  useEffect(() => { if (timerOn) { timerRef.current = setInterval(() => setTimer(t => t + 1), 1000); } else { clearInterval(timerRef.current); } return () => clearInterval(timerRef.current); }, [timerOn]);

  // All entities marked as flags
  const flagEntities = useMemo(() => (entities || []).filter(e => e.metadata?.isFlag), [entities]);

  const stats = useMemo(() => {
    const found = flags.filter(f => f.status === 'found').length;
    const points = flags.filter(f => f.status === 'found').reduce((s, f) => s + (f.points || 0), 0);
    return { found, total: flags.length, points, totalPoints: flags.reduce((s, f) => s + (f.points || 0), 0) };
  }, [flags]);

  const filtered = useMemo(() => {
    let list = flags;
    if (filterCat !== 'Tout') list = list.filter(f => f.category === filterCat);
    if (filterStatus !== 'Tout') list = list.filter(f => f.status === filterStatus);
    return list;
  }, [flags, filterCat, filterStatus]);

  const addFlag = () => {
    if (!form.challenge.trim()) return;
    // If linked to an entity flag, auto-fill the flag value
    let flagVal = form.flag;
    if (form.linkedEntityId) {
      const ent = flagEntities.find(e => e.id === form.linkedEntityId);
      if (ent?.metadata?.flag) flagVal = ent.metadata.flag;
    }
    setFlags(prev => [...prev, { id: genId(), ...form, flag: flagVal, createdAt: new Date().toISOString(), solvedAt: form.status === 'found' ? new Date().toISOString() : null }]);
    setForm({ challenge: '', flag: '', category: 'OSINT', points: 0, notes: '', status: 'progress', linkedEntityId: '' });
    setView('list');
  };

  const updateFlag = (id, patch) => setFlags(prev => prev.map(f => {
    if (f.id !== id) return f;
    const u = { ...f, ...patch };
    if (patch.status === 'found' && !f.solvedAt) u.solvedAt = new Date().toISOString();
    return u;
  }));
  const deleteFlag = (id) => setFlags(prev => prev.filter(f => f.id !== id));

  const exportWriteup = () => {
    const lines = [`# ${ctfName} — Writeup\n`, `**Date** : ${new Date().toLocaleDateString('fr-FR')}  \n`, `**Score** : ${stats.points}/${stats.totalPoints} pts — ${stats.found}/${stats.total} challenges  \n`, `**Temps** : ${formatTimer(timer)}\n`, `---\n`];
    const byCat = {};
    flags.forEach(f => { (byCat[f.category] = byCat[f.category] || []).push(f); });
    for (const [cat, list] of Object.entries(byCat)) {
      lines.push(`\n## ${cat}\n`);
      list.forEach(f => { const st = STATUSES.find(s => s.id === f.status); lines.push(`### ${st?.icon||''} ${f.challenge} — ${f.points} pts\n`, `**Statut** : ${st?.label}\n`); if (f.flag) lines.push(`**Flag** : \`${f.flag}\`\n`); if (f.notes) lines.push(`\n${f.notes}\n`); lines.push(''); });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${ctfName.replace(/\s/g, '_')}_writeup.md`; a.click();
  };

  const inp = { width: '100%', padding: '8px 10px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, color: t.text }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${t.border}`, background: t.surface, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: t.textMuted }}>{stats.found}/{stats.total} trouvés · {stats.points} pts · Pattern : <code style={{ background: t.surfaceAlt, padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>{pattern}{'{...}'}</code></div>
        </div>
        <span style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 700, color: timerOn ? '#10b981' : t.textSecondary }}>{formatTimer(timer)}</span>
        <button onClick={() => setTimerOn(!timerOn)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: timerOn ? '#ef444420' : '#10b98120', color: timerOn ? '#ef4444' : '#10b981' }}>{timerOn ? '⏸' : '▶'}</button>
        <button onClick={() => { setTimer(0); setTimerOn(false); }} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textSecondary, cursor: 'pointer' }}>↺</button>
        <button onClick={() => setView('add')} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', background: t.accent, color: '#fff' }}>+ Challenge</button>
        <button onClick={exportWriteup} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: `1px solid ${t.border}`, cursor: 'pointer', background: t.surfaceAlt, color: t.textSecondary }}>📝 Writeup</button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '6px 20px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ height: 5, background: t.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: stats.total ? `${(stats.found / stats.total) * 100}%` : '0%', background: 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Add form */}
      {view === 'add' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Ajouter un challenge</div>
            <button onClick={() => setView('list')} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, cursor: 'pointer' }}>← Retour</button>
          </div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>NOM *</div><input value={form.challenge} onChange={e => setForm({ ...form, challenge: e.target.value })} placeholder="Ex: Find the hidden server" style={inp} /></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>FLAG (manuel)</div><input value={form.flag} onChange={e => setForm({ ...form, flag: e.target.value })} placeholder={`${pattern}{...}`} style={{ ...inp, fontFamily: 'monospace' }} /></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>LIER À UN FLAG DU GRAPHE</div>
            <select value={form.linkedEntityId} onChange={e => setForm({ ...form, linkedEntityId: e.target.value })} style={inp}>
              <option value="">— Aucun —</option>
              {flagEntities.map(e => <option key={e.id} value={e.id}>🚩 {e.label} → {e.metadata?.flag || '(pas encore généré)'}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>CATÉGORIE</div><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div style={{ width: 80 }}><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>POINTS</div><input type="number" value={form.points} onChange={e => setForm({ ...form, points: parseInt(e.target.value) || 0 })} style={inp} /></div>
          </div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>STATUT</div>
            <div style={{ display: 'flex', gap: 4 }}>{STATUSES.map(s => <button key={s.id} onClick={() => setForm({ ...form, status: s.id })} style={{ flex: 1, padding: 6, fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${form.status === s.id ? s.color : t.border}`, background: form.status === s.id ? s.color + '20' : t.surfaceAlt, color: form.status === s.id ? s.color : t.textSecondary, cursor: 'pointer' }}>{s.icon} {s.label}</button>)}</div>
          </div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>NOTES</div><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Commandes, pistes..." style={{ ...inp, resize: 'vertical' }} /></div>
          <button onClick={addFlag} style={{ padding: 10, fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: t.accent, color: '#fff', cursor: 'pointer' }}>🚩 Ajouter</button>
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 20px', display: 'flex', gap: 6, borderBottom: `1px solid ${t.border}` }}>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '4px 8px', fontSize: 11, background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6 }}><option>Tout</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '4px 8px', fontSize: 11, background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6 }}><option>Tout</option>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}</select>
            <span style={{ fontSize: 11, color: t.textMuted, lineHeight: '24px' }}>{filtered.length} challenge{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px' }}>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: t.textMuted, fontSize: 12 }}>Aucun challenge. Cliquez "+ Challenge" pour commencer.</div>}
            {filtered.map(f => {
              const st = STATUSES.find(s => s.id === f.status);
              const linked = f.linkedEntityId ? (entities || []).find(e => e.id === f.linkedEntityId) : null;
              const isEdit = editId === f.id;
              return (
                <div key={f.id} style={{ padding: '10px 14px', background: t.surface, border: `1px solid ${f.status === 'found' ? '#10b98140' : t.border}`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { const order = ['progress','found','stuck','skipped']; updateFlag(f.id, { status: order[(order.indexOf(f.status)+1)%4] }); }} style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${st?.color}`, background: f.status === 'found' ? st.color + '20' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>{st?.icon}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{f.challenge}</span>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: t.surfaceAlt, color: t.textMuted, fontWeight: 600 }}>{f.category}</span>
                        {f.points > 0 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b', fontWeight: 700 }}>{f.points} pts</span>}
                        {linked && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#10b98115', color: '#10b981', fontWeight: 600 }}>🔗 {linked.label}</span>}
                      </div>
                      {(f.flag || linked?.metadata?.flag) && <code style={{ fontSize: 10, color: '#10b981', display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.flag || linked?.metadata?.flag}</code>}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(f.flag || linked?.metadata?.flag || ''); }} title="Copier" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: t.textMuted }}>📋</button>
                    <button onClick={() => setEditId(isEdit ? null : f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: t.textMuted }}>{isEdit ? '▲' : '▼'}</button>
                    <button onClick={() => deleteFlag(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}>✕</button>
                  </div>
                  {isEdit && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={f.challenge} onChange={e => updateFlag(f.id, { challenge: e.target.value })} style={{ ...inp, flex: 1 }} />
                        <input type="number" value={f.points} onChange={e => updateFlag(f.id, { points: parseInt(e.target.value) || 0 })} style={{ ...inp, width: 70 }} />
                      </div>
                      <input value={f.flag || ''} onChange={e => updateFlag(f.id, { flag: e.target.value })} style={{ ...inp, fontFamily: 'monospace' }} placeholder={`${pattern}{...}`} />
                      <select value={f.linkedEntityId || ''} onChange={e => updateFlag(f.id, { linkedEntityId: e.target.value })} style={inp}>
                        <option value="">— Aucun flag lié —</option>
                        {flagEntities.map(e => <option key={e.id} value={e.id}>🚩 {e.label} → {e.metadata?.flag || '?'}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 4 }}>{STATUSES.map(s => <button key={s.id} onClick={() => updateFlag(f.id, { status: s.id })} style={{ flex: 1, padding: 4, fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${f.status === s.id ? s.color : t.border}`, background: f.status === s.id ? s.color + '20' : 'transparent', color: f.status === s.id ? s.color : t.textSecondary, cursor: 'pointer' }}>{s.icon}</button>)}</div>
                      <textarea value={f.notes || ''} onChange={e => updateFlag(f.id, { notes: e.target.value })} rows={3} placeholder="Notes..." style={{ ...inp, resize: 'vertical', fontSize: 11 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// ROUTER — decides which mode to render based on props
// ═══════════════════════════════════════════════════════════════════
export default function Panel(props) {
  // If entity is provided → entity tab mode (inside right panel)
  if (props.entity) return <EntityTab {...props} />;
  // Otherwise → fullscreen challenge tracker
  return <FullscreenPanel {...props} />;
}
