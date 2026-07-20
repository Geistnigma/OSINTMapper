import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { api, getToken } from '../lib/api';
import { themes } from '../lib/theme';
import OSINTMapper from '../legacy/OSINTMapper';

export default function Room() {
  const { id: caseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const t = themes.dark;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Connexion à la salle...');

  useEffect(() => {
    if (!user) return;

    const joinAndLoad = async () => {
      try {
        // Step 1: Always call /join first (idempotent — safe to call multiple times)
        setStatus('Rejoindre l\'enquête...');
        await api(`/api/cases/${caseId}/join`, { method: 'POST' });

        // Step 2: Verify we can load the case
        setStatus('Chargement du graphe...');
        await api(`/api/cases/${caseId}`);

        setLoading(false);
      } catch (e) {
        console.error('Room join error:', e.message);
        setError(e.message || 'Impossible de rejoindre cette enquête.');
        setLoading(false);
      }
    };
    joinAndLoad();
  }, [caseId, user?.id]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${t.border}`, borderTopColor: t.accent, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: t.textSecondary }}>{status}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 40, maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Impossible de rejoindre</h2>
          <p style={{ color: t.textSecondary, fontSize: 13, marginBottom: 20 }}>{error}</p>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 24px', background: t.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Aller au dashboard
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
      collabMode={true}
    />
  );
}
