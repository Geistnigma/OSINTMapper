import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUiStore from '../stores/uiStore';
import { themes, Icons } from '../lib/theme';
import { api } from '../lib/api';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useUiStore();
  const navigate = useNavigate();
  const t = themes[theme];

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newCase, setNewCase] = useState({ title: '', description: '', tags: '', encrypted: false, encryptionPassword: '', preset: 'general', autoLayout: 'manual', labelMode: 'full', maxNodes: 500 });

  const fetchCases = async () => {
    try {
      const data = await api('/api/cases');
      setCases(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchCases(); }, []);

  const handleCreate = async () => {
    if (!newCase.title.trim()) return;
    if (newCase.encrypted && (!newCase.encryptionPassword || newCase.encryptionPassword.length < 6)) {
      alert('Le mot de passe de chiffrement doit faire au moins 6 caractères');
      return;
    }
    try {
      const data = await api('/api/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: newCase.title, description: newCase.description,
          tags: newCase.tags.split(',').map(s => s.trim()).filter(Boolean),
          encrypted: newCase.encrypted, encryptionPassword: newCase.encryptionPassword,
        }),
      });
      setShowCreate(false);
      setNewCase({ title: '', description: '', tags: '', encrypted: false, encryptionPassword: '', preset: 'general', autoLayout: 'manual', labelMode: 'full', maxNodes: 500 });
      navigate(`/case/${data.id}`);
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id, title) => {
    if (!confirm(`Supprimer "${title}" ?`)) return;
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
          <div style={{ width: 28, height: 28, borderRadius: 6, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons.bolt}</div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>OSINT<span style={{ color: t.accent }}>Mapper</span> <span style={{ fontSize: 9, color: t.textMuted, fontWeight: 400 }}>v0.2.1</span></span>
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
              🛡️ Admin
            </button>
          )}
          <button onClick={() => { logout(); navigate('/'); }} style={{ padding: '5px 12px', background: 'none', border: `1px solid #ef444440`, borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>
            Déconnexion
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Mes investigations</h1>
            <p style={{ color: t.textSecondary, fontSize: 13, marginTop: 4 }}>{cases.length} enquête{cases.length !== 1 ? 's' : ''}</p>
          </div>
          {(user.role === 'ADMIN' || user.role === 'ANALYST') && (
            <button onClick={() => setShowCreate(true)} style={{ padding: '10px 20px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {Icons.plus} Nouvelle enquête
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: `0 8px 24px ${t.shadow}` }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Créer une investigation</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={newCase.title} onChange={e => setNewCase({ ...newCase, title: e.target.value })} placeholder="Titre de l'enquête *" style={inp} onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus />
              <textarea value={newCase.description} onChange={e => setNewCase({ ...newCase, description: e.target.value })} placeholder="Description (optionnel)" rows={2} style={{ ...inp, resize: 'vertical' }} />
              <input value={newCase.tags} onChange={e => setNewCase({ ...newCase, tags: e.target.value })} placeholder="Tags séparés par des virgules" style={inp} />

              {/* Preset disabled */}

              {/* Encryption */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.textSecondary, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={newCase.encrypted} onChange={e => setNewCase({ ...newCase, encrypted: e.target.checked })} style={{ accentColor: t.accent }} />
                🔐 Chiffrer cette enquête (AES-256-GCM)
              </label>
              {newCase.encrypted && (
                <input type="password" value={newCase.encryptionPassword} onChange={e => setNewCase({ ...newCase, encryptionPassword: e.target.value })} placeholder="Mot de passe de chiffrement (min. 6 car.)" style={inp} />
              )}

              {/* Advanced options */}
              <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
                <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                Options avancées
              </button>

              {showAdvanced && (
                <div style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>Disposition initiale</div>
                      <select value={newCase.autoLayout} onChange={e => setNewCase({ ...newCase, autoLayout: e.target.value })} style={{ ...inp, padding: '6px 10px' }}>
                        <option value="manual">Manuel (libre)</option>
                        <option value="force">Force-directed (auto)</option>
                        <option value="radial">Radial (centré)</option>
                        <option value="hierarchical">Hiérarchique</option>
                        <option value="grid">Grille</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>Affichage des labels</div>
                      <select value={newCase.labelMode} onChange={e => setNewCase({ ...newCase, labelMode: e.target.value })} style={{ ...inp, padding: '6px 10px' }}>
                        <option value="full">Complet (label + type)</option>
                        <option value="compact">Compact (label seul)</option>
                        <option value="icon">Icône seule</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>Limite de nœuds</div>
                      <select value={newCase.maxNodes} onChange={e => setNewCase({ ...newCase, maxNodes: +e.target.value })} style={{ ...inp, padding: '6px 10px' }}>
                        <option value={100}>100 (léger)</option>
                        <option value={250}>250</option>
                        <option value={500}>500 (défaut)</option>
                        <option value={1000}>1000</option>
                        <option value={5000}>5000 (avancé)</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>Couleur du fond</div>
                      <select value={newCase.canvasBg || 'default'} onChange={e => setNewCase({ ...newCase, canvasBg: e.target.value })} style={{ ...inp, padding: '6px 10px' }}>
                        <option value="default">Défaut (thème)</option>
                        <option value="dark">Sombre</option>
                        <option value="light">Clair</option>
                        <option value="blueprint">Blueprint (bleu)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.textSecondary, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newCase.snapToGrid ?? false} onChange={e => setNewCase({ ...newCase, snapToGrid: e.target.checked })} style={{ accentColor: t.accent }} />
                      Snap to grid
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.textSecondary, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newCase.autoSave ?? true} onChange={e => setNewCase({ ...newCase, autoSave: e.target.checked })} style={{ accentColor: t.accent }} />
                      Sauvegarde auto
                    </label>
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>
                    Ces paramètres pourront être modifiés après la création de l'enquête.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowCreate(false); setShowAdvanced(false); }} style={{ padding: '8px 16px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSecondary, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                <button onClick={handleCreate} disabled={!newCase.title.trim()} style={{ padding: '8px 16px', background: newCase.title.trim() ? t.accent : t.border, color: newCase.title.trim() ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newCase.title.trim() ? 'pointer' : 'not-allowed' }}>Créer</button>
              </div>
            </div>
          </div>
        )}

        {/* Cases list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>Chargement...</div>
        ) : cases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Aucune investigation</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre première enquête pour commencer.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cases.map(c => (
              <div
                key={c.id}
                onClick={() => navigate(`/case/${c.id}`)}
                style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  🔗
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.encrypted ? '🔐 ' : ''}{c.title}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, display: 'flex', gap: 12 }}>
                    <span>{c.fileSize ? `${(c.fileSize / 1024).toFixed(1)} Ko` : 'Vide'}</span>
                    <span>{c.encrypted ? 'Chiffré' : 'Non chiffré'}</span>
                    {c.collaborators?.length > 0 && <span>👥 {c.collaborators.length}</span>}
                    <span>{new Date(c.updatedAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {c.tags?.map(tag => (
                    <span key={tag} style={{ padding: '2px 8px', background: `${t.accent}15`, border: `1px solid ${t.accent}30`, borderRadius: 6, fontSize: 10, color: t.accent }}>{tag}</span>
                  ))}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/room/${c.id}`); const btn = e.currentTarget; btn.textContent = '✓'; setTimeout(() => btn.textContent = '📨', 1500); }}
                  style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, color: t.textSecondary, cursor: 'pointer', opacity: 0.6, padding: '3px 8px', fontSize: 11 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                  title="Copier le lien de collaboration"
                >📨</button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(c.id, c.title); }}
                  style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', opacity: 0.5, padding: 4 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                >
                  {Icons.trash}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
