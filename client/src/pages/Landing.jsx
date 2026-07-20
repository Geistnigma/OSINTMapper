import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

// SVG illustration components (inline, no external deps)
function GraphIllustration() {
  return <svg viewBox="0 0 400 300" style={{width:'100%',height:'auto'}}>
    <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="400" height="300" rx="12" fill="#0d1117" stroke="#1e293b" strokeWidth="1"/>
    {/* Grid */}
    {[...Array(20)].map((_,i)=><line key={`h${i}`} x1="0" y1={i*15} x2="400" y2={i*15} stroke="#1e293b" strokeWidth="0.3"/>)}
    {[...Array(27)].map((_,i)=><line key={`v${i}`} x1={i*15} y1="0" x2={i*15} y2="300" stroke="#1e293b" strokeWidth="0.3"/>)}
    {/* Links */}
    <line x1="100" y1="80" x2="200" y2="140" stroke="#3b82f6" strokeWidth="2" opacity="0.6"/>
    <line x1="200" y1="140" x2="300" y2="90" stroke="#3b82f6" strokeWidth="2" opacity="0.6"/>
    <line x1="200" y1="140" x2="160" y2="220" stroke="#8b5cf6" strokeWidth="2" opacity="0.6"/>
    <line x1="160" y1="220" x2="280" y2="210" stroke="#06b6d4" strokeWidth="2" opacity="0.6"/>
    <line x1="300" y1="90" x2="280" y2="210" stroke="#10b981" strokeWidth="2" opacity="0.6"/>
    <line x1="100" y1="80" x2="60" y2="180" stroke="#f59e0b" strokeWidth="2" opacity="0.6"/>
    {/* Nodes */}
    {[{x:100,y:80,c:'#6366f1',l:'👤',n:'John D.'},{x:200,y:140,c:'#3b82f6',l:'📧',n:'j@mail.com'},{x:300,y:90,c:'#10b981',l:'🏢',n:'Acme Corp'},{x:160,y:220,c:'#f59e0b',l:'📱',n:'+33 6 12...'},{x:280,y:210,c:'#06b6d4',l:'🌐',n:'acme.com'},{x:60,y:180,c:'#8b5cf6',l:'📍',n:'Paris'}].map((n,i)=><g key={i} filter="url(#glow)">
      <rect x={n.x-50} y={n.y-18} width="100" height="36" rx="8" fill="#161b22" stroke={n.c} strokeWidth="1.5"/>
      <text x={n.x-35} y={n.y+5} fontSize="14">{n.l}</text>
      <text x={n.x-22} y={n.y+5} fontSize="10" fill="#e2e4ed" fontFamily="sans-serif">{n.n}</text>
    </g>)}
    {/* Cursor */}
    <polygon points="320,170 320,188 325,184 330,194 333,192 328,182 334,180" fill="#10b981" stroke="#fff" strokeWidth="0.5"/>
    <rect x="336" y="174" width="45" height="14" rx="3" fill="#10b981"/><text x="340" y="184" fontSize="8" fill="#fff" fontFamily="sans-serif" fontWeight="600">Alice</text>
  </svg>;
}

function CollabIllustration() {
  return <svg viewBox="0 0 400 300" style={{width:'100%',height:'auto'}}>
    <rect width="400" height="300" rx="12" fill="#0d1117" stroke="#1e293b" strokeWidth="1"/>
    {/* Two cursor zones */}
    <rect x="20" y="20" width="175" height="260" rx="8" fill="#161b22" stroke="#1e293b"/>
    <rect x="205" y="20" width="175" height="260" rx="8" fill="#161b22" stroke="#1e293b"/>
    {/* Left user */}
    <circle cx="60" cy="50" r="14" fill="#6366f1"/><text x="55" y="55" fontSize="12" fill="#fff" fontWeight="700">A</text>
    <text x="80" y="54" fontSize="11" fill="#e2e4ed" fontFamily="sans-serif">Administrateur</text>
    <rect x="35" y="70" width="145" height="24" rx="6" fill="#6366f120" stroke="#6366f140"/><text x="45" y="86" fontSize="9" fill="#6366f1" fontFamily="sans-serif">🔍 Édite "Suspect #1"</text>
    <rect x="35" y="100" width="145" height="24" rx="6" fill="#10b98120" stroke="#10b98140"/><text x="45" y="116" fontSize="9" fill="#10b981" fontFamily="sans-serif">✓ Lien créé → Banque</text>
    <rect x="35" y="130" width="145" height="24" rx="6" fill="#3b82f620" stroke="#3b82f640"/><text x="45" y="146" fontSize="9" fill="#3b82f6" fontFamily="sans-serif">📧 Email identifié</text>
    {/* Chat */}
    <rect x="35" y="170" width="145" height="95" rx="8" fill="#0d1117" stroke="#1e293b"/>
    <text x="45" y="188" fontSize="9" fill="#8b8fa8" fontFamily="sans-serif" fontWeight="600">💬 Chat</text>
    <rect x="42" y="195" width="100" height="18" rx="4" fill="#6366f120"/><text x="48" y="208" fontSize="8" fill="#c4b5fd" fontFamily="sans-serif">A: Regarde ce lien</text>
    <rect x="62" y="218" width="110" height="18" rx="4" fill="#06b6d420"/><text x="68" y="231" fontSize="8" fill="#67e8f9" fontFamily="sans-serif">B: Bien vu, j'ajoute</text>
    <rect x="42" y="241" width="90" height="18" rx="4" fill="#6366f120"/><text x="48" y="254" fontSize="8" fill="#c4b5fd" fontFamily="sans-serif">A: 👍</text>
    {/* Right user */}
    <circle cx="245" cy="50" r="14" fill="#06b6d4"/><text x="240" y="55" fontSize="12" fill="#fff" fontWeight="700">B</text>
    <text x="265" y="54" fontSize="11" fill="#e2e4ed" fontFamily="sans-serif">Analyste</text>
    <rect x="220" y="70" width="145" height="24" rx="6" fill="#06b6d420" stroke="#06b6d440"/><text x="230" y="86" fontSize="9" fill="#06b6d4" fontFamily="sans-serif">📱 Ajout téléphone</text>
    <rect x="220" y="100" width="145" height="24" rx="6" fill="#f59e0b20" stroke="#f59e0b40"/><text x="230" y="116" fontSize="9" fill="#f59e0b" fontFamily="sans-serif">🔒 Entity verrouillée</text>
    <rect x="220" y="130" width="145" height="24" rx="6" fill="#ec489920" stroke="#ec489940"/><text x="230" y="146" fontSize="9" fill="#ec4899" fontFamily="sans-serif">🗺️ Géolocalisation</text>
    {/* Sync indicator */}
    <rect x="220" y="170" width="145" height="40" rx="8" fill="#10b98110" stroke="#10b98130"/>
    <text x="240" y="195" fontSize="10" fill="#10b981" fontFamily="sans-serif" fontWeight="600">⚡ Sync temps réel</text>
    <rect x="220" y="220" width="145" height="45" rx="8" fill="#0d1117" stroke="#1e293b"/>
    <text x="230" y="240" fontSize="9" fill="#8b8fa8" fontFamily="sans-serif">👁️ Curseurs live</text>
    <polygon points="240,248 240,258 243,256 246,262 248,260 245,254 249,252" fill="#6366f1"/><text x="253" y="258" fontSize="7" fill="#6366f1" fontFamily="sans-serif">Admin</text>
  </svg>;
}

function PluginIllustration() {
  return <svg viewBox="0 0 400 300" style={{width:'100%',height:'auto'}}>
    <rect width="400" height="300" rx="12" fill="#0d1117" stroke="#1e293b" strokeWidth="1"/>
    {/* Plugin cards */}
    {[
      {x:20,y:20,icon:'🔍',name:'Email Lookup',desc:'HIBP, Hunter.io',c:'#3b82f6',on:true},
      {x:210,y:20,icon:'🌐',name:'IP Geolocation',desc:'MaxMind, IPInfo',c:'#10b981',on:true},
      {x:20,y:100,icon:'📱',name:'Phone Lookup',desc:'Truecaller API',c:'#f59e0b',on:true},
      {x:210,y:100,icon:'🔗',name:'Social OSINT',desc:'Username search',c:'#8b5cf6',on:false},
      {x:20,y:180,icon:'📄',name:'PDF Report',desc:'Export complet',c:'#ec4899',on:true},
      {x:210,y:180,icon:'🗺️',name:'Carte live',desc:'Leaflet.js',c:'#06b6d4',on:true},
    ].map((p,i)=><g key={i}>
      <rect x={p.x} y={p.y} width="170" height="65" rx="10" fill="#161b22" stroke={p.on?p.c+'40':'#1e293b'} strokeWidth="1.5"/>
      <text x={p.x+12} y={p.y+28} fontSize="20">{p.icon}</text>
      <text x={p.x+38} y={p.y+25} fontSize="11" fill="#e2e4ed" fontFamily="sans-serif" fontWeight="600">{p.name}</text>
      <text x={p.x+38} y={p.y+40} fontSize="9" fill="#6b7084" fontFamily="sans-serif">{p.desc}</text>
      <rect x={p.x+125} y={p.y+16} width="32" height="16" rx="8" fill={p.on?p.c:'#374151'}/>
      <circle cx={p.on?p.x+149:p.x+133} cy={p.y+24} r="6" fill="#fff"/>
    </g>)}
    {/* Bottom bar */}
    <rect x="20" y="260" width="360" height="25" rx="6" fill="#161b22" stroke="#1e293b"/>
    <text x="35" y="277" fontSize="9" fill="#10b981" fontFamily="sans-serif">✓ 5 plugins actifs · 1 désactivé · API ready</text>
  </svg>;
}

function SecurityIllustration() {
  return <svg viewBox="0 0 400 300" style={{width:'100%',height:'auto'}}>
    <rect width="400" height="300" rx="12" fill="#0d1117" stroke="#1e293b" strokeWidth="1"/>
    {/* Shield */}
    <path d="M200,40 L260,70 L260,150 Q260,210 200,240 Q140,210 140,150 L140,70 Z" fill="#10b98115" stroke="#10b981" strokeWidth="2"/>
    <text x="182" y="155" fontSize="40">🔐</text>
    {/* Role cards */}
    {[
      {y:50,role:'ADMIN',desc:'Gestion complète',c:'#ef4444',icon:'👑'},
      {y:105,role:'ANALYST',desc:'Édition + Investigation',c:'#f59e0b',icon:'🔍'},
      {y:160,role:'READER',desc:'Lecture seule',c:'#3b82f6',icon:'👁️'},
    ].map((r,i)=><g key={i}>
      <rect x="280" y={r.y} width="105" height="42" rx="8" fill="#161b22" stroke={r.c+'40'}/>
      <text x="290" y={r.y+18} fontSize="12">{r.icon}</text>
      <text x="306" y={r.y+17} fontSize="10" fill={r.c} fontFamily="sans-serif" fontWeight="700">{r.role}</text>
      <text x="290" y={r.y+33} fontSize="8" fill="#6b7084" fontFamily="sans-serif">{r.desc}</text>
    </g>)}
    {/* Self-hosted badge */}
    <rect x="15" y="230" width="370" height="50" rx="10" fill="#161b22" stroke="#1e293b"/>
    <text x="35" y="253" fontSize="11" fill="#e2e4ed" fontFamily="sans-serif" fontWeight="600">🏠 100% Self-hosted</text>
    <text x="35" y="270" fontSize="9" fill="#6b7084" fontFamily="sans-serif">Vos données ne quittent jamais votre infrastructure. Déploiement Docker ou natif.</text>
  </svg>;
}

export default function Landing() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const t = {
    bg: '#080a12', surface: '#0d1117', text: '#e2e4ed', muted: '#6b7084',
    accent: '#58a6ff', border: 'rgba(255,255,255,0.06)',
  };

  const sections = [
    {
      title: 'Graphe d\'investigation interactif',
      desc: 'Visualisez les connexions entre plus de 30 types d\'entités : personnes, emails, téléphones, adresses IP, entreprises, crypto-monnaies, véhicules... Drag & drop, zoom infini, liens typés avec couleurs, right-panel avec métadonnées.',
      image: <GraphIllustration />,
      reverse: false,
    },
    {
      title: 'Collaboration en temps réel',
      desc: 'Enquêtez à plusieurs simultanément. Curseurs live, verrouillage d\'entités, chat intégré, système d\'approbation des accès. Chaque action est synchronisée instantanément entre tous les enquêteurs.',
      image: <CollabIllustration />,
      reverse: true,
    },
    {
      title: 'Système de plugins extensible',
      desc: 'Enrichissez vos données avec des plugins OSINT : résolution d\'emails, géolocalisation IP, lookups téléphoniques, export PDF, carte interactive. Activez ou désactivez chaque plugin indépendamment.',
      image: <PluginIllustration />,
      reverse: false,
    },
    {
      title: 'Sécurité & contrôle d\'accès',
      desc: 'Trois niveaux de rôles — Admin, Analyste, Lecteur — avec permissions granulaires. Self-hosted : vos données restent sur votre infrastructure. Audit log complet pour la traçabilité de chaque action.',
      image: <SecurityIllustration />,
      reverse: true,
    },
  ];

  const S = {
    page: { minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif" },
    nav: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 32px', background: scrollY > 30 ? 'rgba(8,10,18,0.95)' : 'transparent', borderBottom: scrollY > 30 ? `1px solid ${t.border}` : '1px solid transparent', backdropFilter: 'blur(12px)', transition: 'all 0.3s' },
    btn: { padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  };

  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚡</div>
          <span style={{ fontSize: 17, fontWeight: 800 }}>OSINT<span style={{ color: t.accent }}>Mapper</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {user ? (
            <button onClick={() => navigate('/dashboard')} style={{ ...S.btn, background: t.accent, color: '#fff' }}>Dashboard →</button>
          ) : (
            <>
              <Link to="/login" style={{ ...S.btn, background: 'rgba(255,255,255,0.06)', color: t.text }}>Se connecter</Link>
              <Link to="/login" style={{ ...S.btn, background: t.accent, color: '#fff' }}>Démarrer</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ textAlign: 'center', padding: '140px 32px 80px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 16, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.15)', fontSize: 11, fontWeight: 600, color: t.accent, marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#3fb950', display: 'inline-block', marginRight: 6 }} />
          Open Source Intelligence Platform
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.1, marginBottom: 20 }}>
          Cartographiez les<br/>connexions invisibles
        </h1>
        <p style={{ fontSize: 16, color: t.muted, lineHeight: 1.7, marginBottom: 32 }}>
          Plateforme d'investigation OSINT collaborative. Créez des graphes relationnels,
          enrichissez vos données, enquêtez en équipe — déployé sur votre infrastructure.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to={user ? "/dashboard" : "/login"} style={{ ...S.btn, padding: '14px 32px', fontSize: 15, fontWeight: 700, background: t.accent, color: '#fff', boxShadow: '0 4px 20px rgba(88,166,255,0.25)' }}>
            Commencer gratuitement
          </Link>
          <a href="#features" style={{ ...S.btn, padding: '14px 32px', fontSize: 15, background: 'rgba(255,255,255,0.04)', color: t.text, border: '1px solid rgba(255,255,255,0.1)' }}>
            Voir les fonctionnalités ↓
          </a>
        </div>
      </section>

      {/* FEATURES — alternating text+image */}
      <div id="features" style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 32px 80px' }}>
        {sections.map((s, i) => (
          <section key={i} style={{
            display: 'flex', alignItems: 'center', gap: 48,
            flexDirection: s.reverse ? 'row-reverse' : 'row',
            marginBottom: 80,
          }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 14, lineHeight: 1.3 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: t.muted, lineHeight: 1.8 }}>{s.desc}</p>
            </div>
            <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              {s.image}
            </div>
          </section>
        ))}
      </div>

      {/* STATS */}
      <section style={{ display: 'flex', justifyContent: 'center', gap: 48, padding: '40px 32px', borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        {[
          { val: '30+', label: 'Types d\'entités' },
          { val: '15', label: 'Types de liens' },
          { val: '∞', label: 'Collaborateurs' },
          { val: '100%', label: 'Self-hosted' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: t.accent }}>{s.val}</div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '80px 32px' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>Prêt à investiguer ?</h2>
        <p style={{ color: t.muted, marginBottom: 28 }}>Créez votre compte en 30 secondes. Aucune carte bancaire.</p>
        <Link to={user ? "/dashboard" : "/login"} style={{ ...S.btn, padding: '14px 36px', fontSize: 15, fontWeight: 700, background: t.accent, color: '#fff', boxShadow: '0 4px 20px rgba(88,166,255,0.25)' }}>
          {user ? 'Aller au Dashboard →' : 'Commencer maintenant →'}
        </Link>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${t.border}`, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1000, margin: '0 auto' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#4e5568' }}>⚡ OSINTMapper</span>
        <span style={{ fontSize: 11, color: '#2a3040' }}>v2.0 — Self-hosted OSINT Platform</span>
      </footer>

      <style>{`html{scroll-behavior:smooth}::selection{background:rgba(88,166,255,0.3)}a:hover{opacity:0.9}`}</style>
    </div>
  );
}
