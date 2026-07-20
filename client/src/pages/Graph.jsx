import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { api, getToken } from '../lib/api';
import { themes } from '../lib/theme';
import OSINTMapper from '../legacy/OSINTMapper';

export default function Graph() {
  const { id: caseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const t = themes.dark;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [caseData, setCaseData] = useState(null);

  useEffect(() => {
    api(`/api/cases/${caseId}`)
      .then(data => {
        if (data.needsUnlock) {
          setNeedsUnlock(true);
          setLoading(false);
        } else {
          setCaseData(data);
          setLoading(false);
        }
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [caseId]);

  const handleUnlock = async () => {
    setUnlockError('');
    try {
      const data = await api(`/api/cases/${caseId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      // Reload full case data now that we have a session key
      const fullData = await api(`/api/cases/${caseId}`);
      setCaseData(fullData);
      setNeedsUnlock(false);
    } catch (e) {
      setUnlockError(e.message || 'Mot de passe incorrect');
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${t.border}`, borderTopColor: t.accent, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: t.textSecondary }}>Chargement de l'enquête...</div>
        </div>
      </div>
    );
  }

  if (needsUnlock) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 40, maxWidth: 400, width: '90%' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Enquête chiffrée</h2>
          <p style={{ color: t.textSecondary, fontSize: 13, marginBottom: 20 }}>
            Cette investigation est protégée par chiffrement AES-256.<br />
            Entrez le mot de passe pour y accéder.
          </p>
          <input
            type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Mot de passe de chiffrement"
            style={{ width: '100%', padding: '10px 14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 14, marginBottom: 12, outline: 'none', boxSizing: 'border-box' }}
            autoFocus
          />
          {unlockError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{unlockError}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSecondary, cursor: 'pointer', fontSize: 13 }}>
              Retour
            </button>
            <button onClick={handleUnlock} disabled={!password} style={{ padding: '10px 20px', background: password ? t.accent : t.border, color: password ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: password ? 'pointer' : 'not-allowed' }}>
              Déverrouiller
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 40, maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Erreur</h2>
          <p style={{ color: t.textSecondary, fontSize: 13, marginBottom: 20 }}>{error}</p>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 24px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Retour au dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <OSINTMapper
      caseId={caseId}
      authToken={getToken()}
      userName={user?.displayName || user?.username || 'User'}
      userRole={user?.role || 'ANALYST'}
      onQuit={() => navigate('/dashboard')}
    />
  );
}
