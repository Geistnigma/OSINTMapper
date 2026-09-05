import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveTheme } from '../lib/theme.jsx';
import { getLocale, useT } from '../i18n';
import { messageErreur } from '../lib/api';

const API = '/api/users';
const ROLES = ['ADMIN', 'ANALYST', 'VIEWER'];
const ROLE_COLORS = { ADMIN: '#ef4444', ANALYST: '#3b82f6', VIEWER: '#10b981' };
const ROLE_LABELS = { ADMIN: 'Admin', ANALYST: 'Analyste', VIEWER: 'Lecteur' };

function fmtDate(d) { if (!d) return '-'; return new Date(d).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function fmtSize(b) { if (b > 1e9) return (b / 1e9).toFixed(1) + ' Go'; if (b > 1e6) return (b / 1e6).toFixed(1) + ' Mo'; if (b > 1e3) return (b / 1e3).toFixed(1) + ' Ko'; return b + ' o'; }

export default function AdminPage() {
  const tr = useT();
  const navigate = useNavigate();
  const [themeName] = useState(() => localStorage.getItem('om_theme') || 'dark');
  const t = resolveTheme(themeName);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState({ logs: [], total: 0, page: 1, pages: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', displayName: '', email: '', role: 'ANALYST' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetPw, setResetPw] = useState(null); // userId
  const [newPw, setNewPw] = useState('');

  // Session par cookie : plus d'en-tête Authorization, mais `credentials`
  // devient obligatoire sur CHAQUE appel (cf. lib/api.js).
  const headers = { 'Content-Type': 'application/json' };
  const avecSession = (opts = {}) => ({ credentials: 'include', headers, ...opts });

  const fetchUsers = useCallback(async () => {
    try { const r = await fetch(API, avecSession()); setUsers(await r.json()); } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try { const r = await fetch(`${API}/stats`, avecSession()); setStats(await r.json()); } catch {}
  }, []);

  const fetchAudit = useCallback(async (page = 1) => {
    try { const r = await fetch(`${API}/audit?page=${page}&limit=30`, avecSession()); const d = await r.json(); setAudit(d); } catch {}
  }, []);

  useEffect(() => { fetchUsers(); fetchStats(); fetchAudit(); }, []);

  const flash = (msg, isError) => { if (isError) { setError(msg); setTimeout(() => setError(''), 3000); } else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); } };

  const createUser = async () => {
    if (!createForm.username || !createForm.password) { flash(tr('admin.msg.champsRequis'), true); return; }
    const r = await fetch(API, avecSession({ method: 'POST', body: JSON.stringify(createForm) }));
    const d = await r.json();
    if (!r.ok) { flash(messageErreur(d), true); return; }
    flash(tr('admin.msg.utilisateurCree', { nom: d.username }));
    setShowCreate(false); setCreateForm({ username: '', password: '', displayName: '', email: '', role: 'ANALYST' });
    fetchUsers(); fetchStats();
  };

  // Les réponses d'erreur du serveur n'étaient pas lues : un refus (dernier
  // administrateur, auto-rétrogradation) passait inaperçu et l'interface
  // annonçait quand même « Rôle mis à jour ».
  const appliquer = async (url, opts, succes, apres) => {
    try {
      const r = await fetch(url, opts);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { flash(messageErreur(d) || tr('admin.msg.refuse'), true); return null; }
      flash(typeof succes === 'function' ? succes(d) : succes);
      apres?.();
      return d;
    } catch (e) { flash(tr('admin.msg.erreurReseau', { message: e.message }), true); return null; }
  };

  const changeRole = async (id, role) => {
    const u = users.find(x => x.id === id);
    // Aucune confirmation n'existait dans toute la page, alors que le reste de
    // l'application en demande une pour des actions bien moins lourdes.
    if (!confirm(tr('admin.confirm.role', { nom: u?.displayName || u?.username, role: tr('admin.role.' + role) }))) { fetchUsers(); return; }
    await appliquer(`${API}/${id}/role`, avecSession({ method: 'PUT', body: JSON.stringify({ role }) }),
      tr('admin.msg.roleMisAJour'));
    fetchUsers(); // resynchronise le <select>, y compris après un refus
  };

  const toggleUser = async (id) => {
    const u = users.find(x => x.id === id);
    if (!confirm(tr(u?.active ? 'admin.confirm.desactiver' : 'admin.confirm.reactiver', { nom: u?.displayName || u?.username }))) return;
    await appliquer(`${API}/${id}/toggle`, avecSession({ method: 'PUT' }),
      d => tr(d.active ? 'admin.msg.reactive' : 'admin.msg.desactive'),
      () => { fetchUsers(); fetchStats(); });
  };

  /**
   * Suppression définitive d'un compte.
   *
   * À distinguer de la désactivation, qui laisse la ligne en base et se
   * réversible. Le serveur refuse le compte d'installation (409) et le dernier
   * administrateur actif ; l'écran ne propose donc pas le bouton pour le
   * premier, et affiche le refus pour le second.
   */
  const deleteUser = async (id, nom) => {
    if (!confirm(tr('admin.confirm.supprimer', { nom }))) return;
    await appliquer(`${API}/${id}`, avecSession({ method: 'DELETE' }), tr('admin.msg.compteSupprime'),
      () => { fetchUsers(); fetchStats(); });
  };

  const resetPassword = async (id) => {
    // Doit rester aligné sur MIN_PASSWORD_LENGTH (server/routes/auth.js) :
    // sinon l'écran accepte une saisie que le serveur refusera.
    if (!newPw || newPw.length < 12) { flash(tr('dashboard.creer.motDePasseCourt', { n: 12 }), true); return; }
    const u = users.find(x => x.id === id);
    if (!confirm(tr('admin.confirm.reinitialiser', { nom: u?.displayName || u?.username }))) return;
    const ok = await appliquer(`${API}/${id}/password`, avecSession({ method: 'PUT', body: JSON.stringify({ password: newPw }) }),
      tr('admin.msg.mdpReinitialise'));
    if (ok) { setResetPw(null); setNewPw(''); }
  };

  const inp = { padding: '8px 12px', fontSize: 13, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, width: '100%', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', background: t.surface, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Retour</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{tr('admin.titre')}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{tr('admin.sousTitre')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['users', 'stats', 'audit'].map(tb => (
            <button key={tb} onClick={() => { setTab(tb); if (tb === 'audit') fetchAudit(); }}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                background: tab === tb ? t.accent : t.surfaceAlt, color: tab === tb ? '#fff' : t.textSecondary,
                border: `1px solid ${tab === tb ? t.accent : t.border}` }}>
              {tr('admin.onglet.' + tb)}
            </button>
          ))}
        </div>
      </div>

      {/* Flash messages */}
      {error && <div style={{ padding: '10px 24px', background: '#ef444420', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>{error}</div>}
      {success && <div style={{ padding: '10px 24px', background: '#10b98120', color: '#10b981', fontSize: 13, fontWeight: 600 }}>{success}</div>}

      <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>

        {/* ═══ USERS TAB ═══ */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{users.length} utilisateur{users.length > 1 ? 's' : ''}</div>
              <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '8px 20px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                + Créer un utilisateur
              </button>
            </div>

            {/* Create form */}
            {showCreate && (
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{tr('admin.nouvelUtilisateur')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <input placeholder={tr('admin.champIdentifiant')} value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} style={inp} />
                  <input placeholder={tr('admin.champMotDePasse')} type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} style={inp} />
                  <input placeholder={tr('admin.champNomAffichage')} value={createForm.displayName} onChange={e => setCreateForm({ ...createForm, displayName: e.target.value })} style={inp} />
                  <input placeholder={tr('admin.champEmail')} value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} style={inp} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{tr('admin.role')}</span>
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setCreateForm({ ...createForm, role: r })} style={{
                      padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                      background: createForm.role === r ? ROLE_COLORS[r] + '20' : t.surfaceAlt,
                      color: createForm.role === r ? ROLE_COLORS[r] : t.textSecondary,
                      border: `1px solid ${createForm.role === r ? ROLE_COLORS[r] + '60' : t.border}`,
                    }}>{ROLE_LABELS[r]}</button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <button onClick={createUser} style={{ padding: '8px 24px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{tr('commun.creer')}</button>
                  <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSecondary, cursor: 'pointer', fontSize: 13 }}>{tr('commun.annuler')}</button>
                </div>
              </div>
            )}

            {/* User list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map(u => (
                <div key={u.id} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, opacity: u.active ? 1 : 0.5 }}>
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: ROLE_COLORS[u.role] + '20', color: ROLE_COLORS[u.role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                    {(u.displayName || u.username).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{u.displayName || u.username}</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>@{u.username}</span>
                      {!u.active && <span style={{ fontSize: 10, background: '#ef444420', color: '#ef4444', padding: '1px 8px', borderRadius: 4, fontWeight: 600 }}>{tr('admin.desactive')}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted }}>
                      Créé {fmtDate(u.createdAt)} · Dernière connexion {fmtDate(u.lastLogin)}
                    </div>
                  </div>
                  {/* Role selector */}
                  {/* Compte d'installation : rôle verrouillé, ni désactivable
                      ni supprimable. Le serveur refuse ces trois opérations
                      (409) ; l'écran ne doit donc pas les proposer. */}
                  <select value={u.role} disabled={u.protected} onChange={e => changeRole(u.id, e.target.value)}
                    style={{ padding: '5px 10px', fontSize: 12, background: t.surfaceAlt, color: ROLE_COLORS[u.role], border: `1px solid ${ROLE_COLORS[u.role]}40`, borderRadius: 6, fontWeight: 700 }}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  {/* Actions */}
                  <button onClick={() => { setResetPw(resetPw === u.id ? null : u.id); setNewPw(''); }}
                    style={{ padding: '5px 10px', fontSize: 11, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: '#f59e0b', cursor: 'pointer', fontWeight: 600 }}>{tr('admin.motDePasse')}</button>
                  {!u.protected && <button onClick={() => deleteUser(u.id, u.displayName || u.username)}
                    style={{ padding: '5px 10px', fontSize: 11, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                    title={tr('admin.supprimerTitre')}>{tr('commun.supprimer')}</button>}
                  {u.protected && <span title={tr('admin.compteInstallationAide')} style={{ padding: '5px 10px', fontSize: 11, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{tr('admin.compteInstallation')}</span>}
                  {!u.protected && <button onClick={() => toggleUser(u.id)}
                    style={{ padding: '5px 10px', fontSize: 11, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: u.active ? '#ef4444' : '#10b981', cursor: 'pointer', fontWeight: 600 }}>
                    {u.active ? 'Désactiver' : 'Réactiver'}
                  </button>}

                  {/* Reset password inline */}
                  {resetPw === u.id && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="password" placeholder={tr('admin.champNouveauMdp')} value={newPw} onChange={e => setNewPw(e.target.value)}
                        style={{ ...inp, width: 140, padding: '5px 8px', fontSize: 12 }} />
                      <button onClick={() => resetPassword(u.id)} style={{ padding: '5px 10px', fontSize: 11, background: '#f59e0b20', border: '1px solid #f59e0b60', borderRadius: 6, color: '#f59e0b', cursor: 'pointer', fontWeight: 700 }}>OK</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STATS TAB ═══ */}
        {tab === 'stats' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: tr('admin.stat.utilisateurs'), value: stats.activeUsers, sub: tr('admin.stat.total', { n: stats.userCount }), color: '#3b82f6' },
                { label: tr('admin.stat.enquetes'), value: stats.caseCount, sub: fmtSize(stats.diskUsage), color: '#10b981' },
                { label: tr('admin.stat.actions7j'), value: stats.recentActions, sub: tr('admin.stat.connexions', { n: stats.recentLogins }), color: '#a855f7' },
                { label: tr('admin.stat.auditTotal'), value: stats.auditCount, sub: tr('admin.stat.entrees'), color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{tr('admin.repartitionRoles')}</div>
              {ROLES.map(r => {
                const count = users.filter(u => u.role === r && u.active).length;
                const pct = users.length ? (count / users.filter(u => u.active).length) * 100 : 0;
                return (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ width: 100, fontSize: 12, fontWeight: 600, color: ROLE_COLORS[r] }}>{ROLE_LABELS[r]}</span>
                    <div style={{ flex: 1, height: 8, background: t.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ROLE_COLORS[r], borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary, width: 30 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ AUDIT TAB ═══ */}
        {tab === 'audit' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Journal d'audit ({audit.total} entrées)</div>
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: t.textMuted }}>{tr('admin.table.date')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: t.textMuted }}>{tr('admin.table.action')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: t.textMuted }}>{tr('admin.table.utilisateur')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: t.textMuted }}>{tr('admin.table.details')}</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: t.textMuted }}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <td style={{ padding: '8px 14px', color: t.textSecondary, whiteSpace: 'nowrap' }}>{fmtDate(log.createdAt)}</td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: log.action.startsWith('admin') ? '#ef444420' : log.action.startsWith('auth') ? '#3b82f620' : '#10b98120',
                          color: log.action.startsWith('admin') ? '#ef4444' : log.action.startsWith('auth') ? '#3b82f6' : '#10b981',
                        }}>{log.action}</span>
                      </td>
                      <td style={{ padding: '8px 14px', color: t.text }}>{log.user?.displayName || log.user?.username || '-'}</td>
                      <td style={{ padding: '8px 14px', color: t.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details || '-'}</td>
                      <td style={{ padding: '8px 14px', color: t.textMuted, fontFamily: 'monospace', fontSize: 11 }}>{log.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {audit.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                {Array.from({ length: audit.pages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => fetchAudit(p)} style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                    background: audit.page === p ? t.accent : t.surfaceAlt, color: audit.page === p ? '#fff' : t.textSecondary,
                    border: `1px solid ${audit.page === p ? t.accent : t.border}`,
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
