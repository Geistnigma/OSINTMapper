import React, { useState, useEffect } from 'react';

export default function Panel({ theme: t, settings }) {
  const localPath = settings?.localPath || '/cyberchef/index.html';
  const [available, setAvailable] = useState(null); // null = loading, true/false

  // Check if local CyberChef is available
  useEffect(() => {
    fetch(localPath, { method: 'HEAD' })
      .then(r => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, [localPath]);

  if (available === null) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.textMuted, fontSize: 14 }}>
        Chargement de CyberChef...
      </div>
    );
  }

  if (!available) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
        <div style={{ maxWidth: 500, padding: 32, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧑‍🍳</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 8 }}>CyberChef non installé</div>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.7, marginBottom: 16 }}>
            Le fichier <code style={{ background: t.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>{localPath}</code> est introuvable.
          </div>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.8, textAlign: 'left', background: t.surfaceAlt, padding: 16, borderRadius: 10 }}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: 8 }}>Installation :</div>
            <div>1. Télécharger le dernier release sur</div>
            <div style={{ marginLeft: 16 }}>
              <a href="https://github.com/gchq/CyberChef/releases" target="_blank" rel="noopener" style={{ color: t.accent }}>github.com/gchq/CyberChef/releases</a>
            </div>
            <div style={{ marginTop: 6 }}>2. Télécharger le fichier <code style={{ background: t.bg, padding: '1px 4px', borderRadius: 3 }}>CyberChef_vXX.XX.XX.zip</code></div>
            <div style={{ marginTop: 6 }}>3. Extraire le ZIP dans :</div>
            <div style={{ marginLeft: 16 }}>
              <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginTop: 4 }}>client/public/cyberchef/</code>
            </div>
            <div style={{ marginTop: 6 }}>4. Vérifier que le fichier existe :</div>
            <div style={{ marginLeft: 16 }}>
              <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginTop: 4 }}>client/public/cyberchef/index.html</code>
            </div>
            <div style={{ marginTop: 6 }}>5. Relancer le serveur Vite</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={localPath}
      title="CyberChef"
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
