import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { themes, Icons } from '../lib/theme';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, login, register, error, clearError, loading } = useAuthStore();
  const t = themes.dark;

  const [isRegister] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });

  const redirectTo = params.get('redirect') || '/dashboard';

  useEffect(() => { if (user) navigate(redirectTo); }, [user]);
  useEffect(() => { clearError(); }, [isRegister]);

  const handleSubmit = async () => {
    if (isRegister) {
      const ok = await register(form.username, form.email || null, form.password, form.displayName || form.username);
      if (ok) navigate(redirectTo);
    } else {
      const ok = await login(form.username, form.password);
      if (ok) navigate(redirectTo);
    }
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
            {isRegister ? 'Créer un compte' : 'Se connecter'}
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>Identifiant</label>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="johndoe" style={inp} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {isRegister && (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>Nom affiché <span style={{ color: t.textMuted }}>(optionnel)</span></label>
                <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="John Doe" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>Email <span style={{ color: t.textMuted }}>(optionnel)</span></label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" style={inp} />
              </div>
            </>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: t.textSecondary, display: 'block', marginBottom: 6 }}>Mot de passe</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" style={inp} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
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
            {isRegister ? 'Créer le compte' : 'Se connecter'}
          </button>
        </div>

        {/* Back to landing */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 11 }}>
            ← Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
