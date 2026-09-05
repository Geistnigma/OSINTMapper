import React, { useState, useMemo } from 'react';
import DocViewer from './DocViewer.jsx';
// `readPluginBundle` et `installPlugin` ne sont plus appelés : le dépôt de
// bundle a été retiré de l'interface. La route serveur, elle, existe encore.
import { uninstallPlugin, setPluginPreference } from '../runtime.js';
import { useT, traduire } from '../../i18n';
import { nomPlugin } from '../../lib/constantesTraduites.js';

// `nomPlugin` vient de lib/constantesTraduites.js : le même libellé doit
// sortir ici, dans la barre d'outils et dans l'onglet d'entité.
const descPlugin = (p) => traduire(`plugin.${p.id}.description`, null, p.description);
/** Catégorie du filtre : sentinelle stable, jamais un libellé traduit. */
const TOUTES = '__toutes';

/**
 * PluginStore - Full-screen page for browsing, managing, and reading plugin docs.
 * Layout: sidebar (categories) | main (grid or doc)
 */
export default function PluginStore({ engine, theme: t, onClose, onPluginToggle, userRole }) {
  const tr = useT();
  const isAdmin = userRole === 'ADMIN';
  const [busy, setBusy] = useState(false);
  const [activeCat, setActiveCat] = useState(TOUTES);
  const [docPlugin, setDocPlugin] = useState(null);
  const [search, setSearch] = useState('');

  const allPlugins = engine.getAll();
  const categories = useMemo(() => {
    const cats = new Set(allPlugins.map(p => p.category));
    // Sentinelle stable : un libellé traduit comme valeur d'état rendrait le
    // filtre incohérent au changement de langue.
    return [TOUTES, ...Array.from(cats)];
  }, [allPlugins]);

  const filtered = useMemo(() => {
    let list = activeCat === TOUTES ? allPlugins : allPlugins.filter(p => p.category === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => nomPlugin(p).toLowerCase().includes(q) || descPlugin(p)?.toLowerCase().includes(q) || p.id.includes(q));
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
            <div style={{ fontSize: 11, color: t.textMuted }}>{tr('store.compteur', { n: enabled, total })}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('store.rechercher')}
            style={{ padding: '7px 14px', fontSize: 12, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, width: 220, outline: 'none' }} />
          <button onClick={() => { engine.enableAll(); onPluginToggle?.(); }}
            style={{ padding: '7px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {tr('store.toutActiver')}
          </button>
          <button onClick={() => { engine.disableAll(); onPluginToggle?.(); }}
            style={{ padding: '7px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {tr('store.toutDesactiver')}
          </button>
          <button onClick={onClose} style={{ padding: '7px 18px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {tr('store.retourGraphe')}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══ LEFT SIDEBAR - categories ═══ */}
        <div style={{ width: 200, borderRight: `1px solid ${t.border}`, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, background: t.surface, overflowY: 'auto' }}>
          {categories.map(cat => {
            const count = cat === TOUTES ? allPlugins.length : allPlugins.filter(p => p.category === cat).length;
            const isAct = activeCat === cat && !docPlugin;
            return (
              <button key={cat} onClick={() => { setActiveCat(cat); setDocPlugin(null); }} style={{
                width: '100%', padding: '9px 14px', background: isAct ? t.accent + '15' : 'transparent',
                border: 'none', borderRadius: 8, color: isAct ? t.accent : t.text, fontSize: 13,
                fontWeight: isAct ? 700 : 500, cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{cat === TOUTES ? tr('store.tout') : traduire(`plugin.cat.${cat}`, null, cat)}</span>
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
                {docPlugin.enabled ? tr('store.active') : tr('store.activer')}
              </button>
            </div>
            {/* Doc content */}
            <DocViewer plugin={docPlugin} theme={t} />
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: t.text }}>{activeCat === TOUTES ? tr('store.tousPlugins') : traduire(`plugin.cat.${activeCat}`, null, activeCat)}</span>
              <span style={{ fontSize: 13, color: t.textMuted, marginLeft: 12 }}>{tr('store.nbPlugins', { n: filtered.length })}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, alignItems: 'stretch' }}>
              {filtered.map(pl => {
                const on = pl.enabled;
                return (
                  <div key={pl.id} style={{
                    background: t.surface, border: `1px solid ${on ? t.accent + '60' : t.border}`,
                    borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    transition: 'border-color .15s, transform .15s', minHeight: 170,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = on ? t.accent + '60' : t.border; e.currentTarget.style.transform = 'none'; }}>
                    {/* Bandeau d'état : un plugin actif doit se repérer sans lire le bouton */}
                    <div style={{ height: 3, background: on ? t.accent : 'transparent', flexShrink: 0 }} />
                    <div style={{ padding: '12px 14px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{pl.icon}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div title={nomPlugin(pl)} style={{ fontSize: 13.5, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomPlugin(pl)}</div>
                          <div style={{ fontSize: 9.5, color: t.textMuted }}>v{pl.version || '1.0.0'} · {pl.author || 'Core'}{pl.category ? ` · ${traduire(`plugin.cat.${pl.category}`, null, pl.category)}` : ''}</div>
                        </div>
                      </div>
                      <p style={{
                        fontSize: 11.5, color: t.textSecondary, lineHeight: 1.45, margin: 0,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{descPlugin(pl)}</p>
                      <div style={{ marginTop: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {pl.hasPanel && <span style={{ fontSize: 9, background: t.accent + '20', color: t.accent, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>PANEL</span>}
                        {pl.hasToolbar && <span style={{ fontSize: 9, background: '#10b98120', color: '#10b981', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>TOOLBAR</span>}
                        {pl.docs && <span style={{ fontSize: 9, background: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>DOC</span>}
                        {pl.source === 'runtime' && <span title={`SHA-256 ${pl.bundleHash || ''}`} style={{ fontSize: 9, background: '#a78bfa20', color: '#a78bfa', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{tr('store.installe')} · {(pl.bundleHash || '').slice(0, 8)}</span>}
                        {(pl.problems || []).some(x => x.level === 'warn') && <span title={(pl.problems || []).map(x => x.message).join('\n')} style={{ fontSize: 9, background: '#f9731620', color: '#f97316', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{tr('store.manifesteDouteux')}</span>}
                      </div>
                    </div>
                    <div style={{ padding: '0 14px 12px', display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                      {isAdmin && pl.source === 'runtime' && (
                        <button onClick={async () => {
                          if (!confirm(tr('store.confirmDesinstaller', { nom: nomPlugin(pl) }))) return;
                          try { await uninstallPlugin(pl.id); onPluginToggle?.(); alert(tr('store.desinstalle')); }
                          catch (e) { alert(e.message); }
                        }} style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #ef444440', fontSize: 12,
                          fontWeight: 600, background: 'transparent', color: '#ef4444', cursor: 'pointer',
                        }}>🗑 {tr('store.desinstaller')}</button>
                      )}
                      {pl.docs && (
                        <button onClick={() => setDocPlugin(pl)} style={{
                          padding: '6px 14px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 600,
                          background: t.surfaceAlt, color: t.textSecondary, cursor: 'pointer',
                        }}>📖 Doc</button>
                      )}
                      <button onClick={async () => {
                        const nowOn = engine.toggle(pl.id);
                        // Les plugins runtime ont leur activation stockée en base
                        // (elle suit l'utilisateur d'un poste à l'autre), les
                        // plugins natifs restent en localStorage.
                        if (pl.source === 'runtime') {
                          try { await setPluginPreference(pl.id, nowOn); }
                          catch { engine.toggle(pl.id); alert(tr('store.activationNonEnregistree')); }
                        }
                        onPluginToggle?.();
                      }} style={{
                        padding: '6px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                        background: on ? t.accent : t.surfaceAlt, color: on ? '#fff' : t.textSecondary,
                        cursor: 'pointer',
                      }}>
                        {on ? tr('store.active') : tr('store.activer')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══ CONFIRMATION D'INSTALLATION ═══ */}
    </div>
  );
}
