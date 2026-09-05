import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { themes, Icons } from '../lib/theme';
import { useT } from '../i18n';
import SelecteurLangue from '../components/SelecteurLangue';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, login, register, error, clearError, loading } = useAuthStore();
  // `t` reste la PALETTE, comme partout dans ce dépôt ; la traduction est
  // `tr`. Les intervertir casse silencieusement tous les styles du fichier.
  const t = themes.dark;
  const tr = useT();

  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });

  const redirectTo = params.get('redirect') || '/dashboard';

  useEffect(() => { if (user) navigate(redirectTo); }, [user]);
  useEffect(() => { clearError(); }, []);

  // L'inscription est désactivée côté serveur (l'administrateur crée les
  // comptes) et `isRegister` n'avait pas de setter : toute cette branche était
  // inatteignable.
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (await login(form.username, form.password)) navigate(redirectTo);
  };

  const inp = { width: '100%', padding: '10px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 14, outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 40, width: 400, boxShadow: `0 24px 64px ${t.shadow}` }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: t.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{Icons.bolt}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: t.text }}>
            OSINT<span style={{ color: t.accent }}>Mapper</span>
          </h1>
          <p style={{ color: t.textSecondary, fontSize: 13, marginTop: 4 }}>
            {tr('login.sousTitre')}
          </p>
          {/* Le seul écran accessible sans compte : si le choix de langue n'est
              pas ici, personne ne peut le faire avant de s'être connecté. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <SelecteurLangue t={t} />
          </div>
        </div>

        {/* Form */}
        {/* Un vrai <form> : la soumission était gérée à la main sur onKeyDown,
            et sans attributs autoComplete les gestionnaires de mots de passe
            ne savaient ni remplir ni enregistrer les identifiants. */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>{tr('login.identifiant')}</label>
            <input name="username" autoComplete="username" autoFocus value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="johndoe" style={inp} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>


          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>{tr('login.motDePasse')}</label>
            <input type="password" name="password" autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" style={inp} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!form.username || !form.password}
            style={{
              padding: '12px 20px',
              background: (form.username && form.password) ? t.accent : t.border,
              color: (form.username && form.password) ? '#fff' : t.textMuted,
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: (form.username && form.password) ? 'pointer' : 'not-allowed',
              marginTop: 4,
            }}
          >
            {tr('login.bouton')}
          </button>
        </form>
      </div>
    </div>
  );
}
