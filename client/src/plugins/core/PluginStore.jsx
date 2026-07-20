import React, { useState, useMemo } from 'react';
import DocViewer from './DocViewer.jsx';

/**
 * PluginStore — Full-screen page for browsing, managing, and reading plugin docs.
 * Layout: sidebar (categories) | main (grid or doc)
 */
export default function PluginStore({ engine, theme: t, onClose, onPluginToggle }) {
  const [activeCat, setActiveCat] = useState('Tout');
  const [docPlugin, setDocPlugin] = useState(null);
  const [search, setSearch] = useState('');

  const allPlugins = engine.getAll();
  const categories = useMemo(() => {
    const cats = new Set(allPlugins.map(p => p.category));
    return ['Tout', ...Array.from(cats)];
  }, [allPlugins]);

  const filtered = useMemo(() => {
    let list = activeCat === 'Tout' ? allPlugins : allPlugins.filter(p => p.category === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.id.includes(q));
    }
    return list;
  }, [allPlugins, activeCat, search]);

  const { total, enabled } = engine.stats();

  return (
    <div style={{ position: 'fixed', inset: 0, background: t.bg, zIndex: 200, display: 'flex', flexDirection: 'column', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: t.surface, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>🧩</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>Plugins</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{enabled} activé{enabled > 1 ? 's' : ''} sur {total}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un plugin..."
            style={{ padding: '7px 14px', fontSize: 12, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, width: 220, outline: 'none' }} />
          <button onClick={() => { engine.enableAll(); onPluginToggle?.(); }}
            style={{ padding: '7px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Tout activer
          </button>
          <button onClick={() => { engine.disableAll(); onPluginToggle?.(); }}
            style={{ padding: '7px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Tout désactiver
          </button>
          <button onClick={onClose} style={{ padding: '7px 18px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            ← Retour au graphe
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══ LEFT SIDEBAR — categories ═══ */}
        <div style={{ width: 200, borderRight: `1px solid ${t.border}`, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, background: t.surface, overflowY: 'auto' }}>
          {categories.map(cat => {
            const count = cat === 'Tout' ? allPlugins.length : allPlugins.filter(p => p.category === cat).length;
            const isAct = activeCat === cat && !docPlugin;
            return (
              <button key={cat} onClick={() => { setActiveCat(cat); setDocPlugin(null); }} style={{
                width: '100%', padding: '9px 14px', background: isAct ? t.accent + '15' : 'transparent',
                border: 'none', borderRadius: 8, color: isAct ? t.accent : t.text, fontSize: 13,
                fontWeight: isAct ? 700 : 500, cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{cat}</span>
                <span style={{ fontSize: 11, color: t.textMuted }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ═══ MAIN AREA ═══ */}
        {docPlugin ? (
          /* ── DOC VIEW ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Doc header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', borderBottom: `1px solid ${t.border}`, background: t.surface, flexShrink: 0 }}>
              <button onClick={() => setDocPlugin(null)} style={{ padding: '6px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ← Plugins
              </button>
              <span style={{ fontSize: 22 }}>{docPlugin.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{docPlugin.name}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>v{docPlugin.version || '1.0.0'} · {docPlugin.author || 'Core'} · Documentation</div>
              </div>
              <button onClick={() => { engine.toggle(docPlugin.id); onPluginToggle?.(); setDocPlugin({ ...docPlugin, enabled: !docPlugin.enabled }); }} style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: docPlugin.enabled ? t.accent : t.surfaceAlt, color: docPlugin.enabled ? '#fff' : t.textSecondary,
              }}>
                {docPlugin.enabled ? '✓ Activé' : 'Activer'}
              </button>
            </div>
            {/* Doc content */}
            <DocViewer plugin={docPlugin} theme={t} />
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: t.text }}>{activeCat === 'Tout' ? 'Tous les plugins' : activeCat}</span>
              <span style={{ fontSize: 13, color: t.textMuted, marginLeft: 12 }}>{filtered.length} plugin{filtered.length > 1 ? 's' : ''}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260, 1fr))', gap: 16 }}>
              {filtered.map(pl => {
                const on = pl.enabled;
                return (
                  <div key={pl.id} style={{
                    background: t.surface, border: `1px solid ${on ? t.accent + '60' : t.border}`,
                    borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ padding: '16px 16px 10px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 26 }}>{pl.icon}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{pl.name}</div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>v{pl.version || '1.0.0'} · {pl.author || 'Core'}</div>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, margin: 0 }}>{pl.description}</p>
                      <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {pl.hasPanel && <span style={{ fontSize: 9, background: t.accent + '20', color: t.accent, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>PANEL</span>}
                        {pl.hasToolbar && <span style={{ fontSize: 9, background: '#10b98120', color: '#10b981', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>TOOLBAR</span>}
                        {pl.docs && <span style={{ fontSize: 9, background: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>DOC</span>}
                      </div>
                    </div>
                    <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      {pl.docs && (
                        <button onClick={() => setDocPlugin(pl)} style={{
                          padding: '6px 14px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600,
                          background: t.surfaceAlt, color: t.textSecondary, cursor: 'pointer',
                        }}>📖 Doc</button>
                      )}
                      <button onClick={() => { engine.toggle(pl.id); onPluginToggle?.(); }} style={{
                        padding: '6px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                        background: on ? t.accent : t.surfaceAlt, color: on ? '#fff' : t.textSecondary,
                        cursor: 'pointer',
                      }}>
                        {on ? '✓ Activé' : 'Activer'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
