import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUiStore from '../stores/uiStore';
import { resolveTheme, pluginPalettes, Icons } from '../lib/theme';
import { api } from '../lib/api';
import TagInput from '../components/TagInput';
import SelecteurLangue from '../components/SelecteurLangue';
import { useT, useLangue } from '../i18n';
// Le moteur est instancié une fois au chargement du module (cf. registry.js).
// Il ne sert plus ici qu'à résoudre un thème apporté par un plugin.
import { initPluginEngine } from '../plugins/registry.js';

const pluginEngine = initPluginEngine();

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useUiStore();
  const navigate = useNavigate();
  // Le tableau de bord connaît déjà le moteur de plugins : autant honorer un
  // thème de plugin ici aussi, plutôt que de retomber sur « dark » et d'afficher
  // deux apparences différentes entre le tableau de bord et le graphe.
  const t = resolveTheme(theme, pluginPalettes(pluginEngine));
  // `t` est la palette (convention du dépôt), `tr` la traduction.
  const tr = useT();
  const { langue } = useLangue();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCase, setNewCase] = useState({ title: '', description: '', tags: [], encrypted: false, encryptionPassword: '' });

  const fetchCases = async () => {
    try {
      const data = await api('/api/cases');
      setCases(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchCases(); }, []);

  const handleCreate = async () => {
    if (!newCase.title.trim()) return;
    // Aligné sur MIN_PASSWORD_LENGTH (server/routes/auth.js) - le serveur
    // refuse en dessous, autant le dire avant d'envoyer.
    if (newCase.encrypted && (!newCase.encryptionPassword || newCase.encryptionPassword.length < 12)) {
      alert(tr('dashboard.creer.motDePasseCourt', { n: 12 }));
      return;
    }
    try {
      const data = await api('/api/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: newCase.title, description: newCase.description,
          tags: newCase.tags,
          encrypted: newCase.encrypted, encryptionPassword: newCase.encryptionPassword,
        }),
      });
      setShowCreate(false);
      setNewCase({ title: '', description: '', tags: [], encrypted: false, encryptionPassword: '' });
      navigate(`/room/${data.id}`);
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id, title) => {
    if (!confirm(tr('dashboard.supprimer.confirmation', { titre: title }))) return;
    await api(`/api/cases/${id}`, { method: 'DELETE' });
    fetchCases();
  };

  const inp = { width: '100%', padding: '10px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 14, outline: 'none', fontFamily: 'inherit' };
  const roleColors = { ADMIN: '#f59e0b', ANALYST: '#10b981', READER: '#6366f1', OWNER: '#58a6ff' };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 32px', borderBottom: `1px solid ${t.border}`, background: t.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>OSINT<span style={{ color: t.accent }}>Mapper</span> <span style={{ fontSize: 9, color: t.textMuted, fontWeight: 400 }}>v0.1 alpha</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textSecondary }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: roleColors[user.role] }} />
            {user.displayName || user.username}
            <span style={{ color: t.textMuted }}>({user.role.toLowerCase()})</span>
          </div>
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer' }}>
            {theme === 'dark' ? Icons.sun : Icons.moon}
          </button>
          {user.role === 'ADMIN' && (
            <button onClick={() => navigate('/admin')} style={{ padding: '5px 12px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              ⚙ Admin
            </button>
          )}
          {user?.role === 'ADMIN' && (
            <button onClick={() => navigate('/admin')} style={{ padding: '5px 12px', background: '#ef444420', border: `1px solid #ef444440`, borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              🛡️ {tr('commun.admin')}
            </button>
          )}
          <SelecteurLangue t={t} compact />
          <button onClick={() => { logout(); navigate('/'); }} style={{ padding: '5px 12px', background: 'none', border: `1px solid #ef444440`, borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>
            {tr('commun.deconnexion')}
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{tr('dashboard.titre')}</h1>
            <p style={{ color: t.textSecondary, fontSize: 13, marginTop: 4 }}>{tr('dashboard.compte', { n: cases.length })}</p>
          </div>
          {(user.role === 'ADMIN' || user.role === 'ANALYST') && (
            <button onClick={() => setShowCreate(true)} style={{ padding: '10px 20px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {Icons.plus} {tr('dashboard.nouvelle')}
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: `0 8px 24px ${t.shadow}` }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{tr('dashboard.creer.titre')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={newCase.title} onChange={e => setNewCase({ ...newCase, title: e.target.value })} placeholder={tr('dashboard.creer.champTitre')} style={inp} onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus />
              <textarea value={newCase.description} onChange={e => setNewCase({ ...newCase, description: e.target.value })} placeholder={tr('dashboard.creer.champDescription')} rows={2} style={{ ...inp, resize: 'vertical' }} />
              <TagInput
                tags={newCase.tags}
                onChange={tags => setNewCase(c => ({ ...c, tags }))}
                t={t}
                placeholder={tr('dashboard.creer.champEtiquettes')}
              />

              {/* Preset disabled */}

              {/* Encryption */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.textSecondary, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={newCase.encrypted} onChange={e => setNewCase({ ...newCase, encrypted: e.target.checked })} style={{ accentColor: t.accent }} />
                🔐 {tr('dashboard.creer.chiffrer')}
              </label>
              {newCase.encrypted && (
                <input type="password" value={newCase.encryptionPassword} onChange={e => setNewCase({ ...newCase, encryptionPassword: e.target.value })} placeholder={tr('dashboard.creer.champMotDePasse', { n: 12 })} style={inp} />
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSecondary, cursor: 'pointer', fontSize: 13 }}>{tr('commun.annuler')}</button>
                <button onClick={handleCreate} disabled={!newCase.title.trim()} style={{ padding: '8px 16px', background: newCase.title.trim() ? t.accent : t.border, color: newCase.title.trim() ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newCase.title.trim() ? 'pointer' : 'not-allowed' }}>{tr('commun.creer')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Cases list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>{tr('commun.chargement')}</div>
        ) : cases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{tr('dashboard.vide.titre')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{tr('dashboard.vide.aide')}</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            // Cartes de 260 px minimum qui se répartissent sur la largeur : la
            // liste occupait toute la ligne pour trois informations, on voyait
            // cinq enquêtes par écran au lieu de quinze.
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}>
            {cases.map(c => {
              const createur = c.collaborators?.find(u => u.role === 'OWNER');
              const nomCreateur = createur?.displayName || createur?.username || '-';
              const autres = (c.collaborators?.length || 1) - 1;
              return (
              <div
                key={c.id}
                onClick={() => navigate(`/room/${c.id}`)}
                style={{
                  background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
                  padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  gap: 10, minHeight: 150, position: 'relative', transition: 'border-color .15s, transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'none'; }}
              >
                {/* En-tête : pictogramme + actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${t.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {c.encrypted ? '🔐' : '🔗'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div title={c.title} style={{
                      fontSize: 14, fontWeight: 700, lineHeight: 1.3,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', wordBreak: 'break-word',
                    }}>{c.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/room/${c.id}`); const b = e.currentTarget; b.textContent = '✓'; setTimeout(() => { b.textContent = '📨'; }, 1200); }}
                      title={tr('dashboard.carte.copierLien')}
                      style={{ background: 'none', border: 'none', color: t.textSecondary, cursor: 'pointer', opacity: .55, padding: 2, fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = .55}
                    >📨</button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(c.id, c.title); }}
                      title={tr('commun.supprimer')}
                      style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', opacity: .5, padding: 2 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = .5}
                    >{Icons.trash}</button>
                  </div>
                </div>

                {/* Description, si elle existe */}
                {c.description && (
                  <div style={{
                    fontSize: 11.5, color: t.textSecondary, lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{c.description}</div>
                )}

                {/* Étiquettes */}
                {c.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {c.tags.slice(0, 3).map(tag => (
                      <span key={tag} style={{ padding: '1px 7px', background: `${t.accent}15`, border: `1px solid ${t.accent}30`, borderRadius: 6, fontSize: 9.5, color: t.accent, fontWeight: 600 }}>{tag}</span>
                    ))}
                    {c.tags.length > 3 && (
                      <span style={{ fontSize: 9.5, color: t.textMuted, alignSelf: 'center' }}>+{c.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Pied : créateur, participants, date. `marginTop:auto` cale le
                    pied en bas quelles que soient les lignes du dessus. */}
                <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div title={tr('dashboard.carte.creePar', { nom: nomCreateur })} style={{
                    width: 22, height: 22, borderRadius: '50%', background: `${t.accent}25`, color: t.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>{nomCreateur[0]?.toUpperCase() || '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: t.textSecondary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomCreateur}</div>
                    <div style={{ fontSize: 9.5, color: t.textMuted }}>
                      {new Date(c.updatedAt).toLocaleDateString(langue, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {autres > 0 && (
                    <span title={tr('dashboard.carte.autres', { n: autres })}
                      style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>👥 {autres + 1}</span>
                  )}
                  <span title={c.fileSize ? tr('dashboard.carte.tailleFichier') : tr('dashboard.carte.enqueteVide')} style={{ fontSize: 9.5, color: t.textMuted, flexShrink: 0 }}>
                    {c.fileSize ? `${(c.fileSize / 1024).toFixed(0)} ${tr('commun.ko')}` : tr('commun.vide')}
                  </span>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
