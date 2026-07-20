import React from 'react';

/**
 * Error Boundary for plugins.
 * Catches render errors and shows a fallback instead of crashing the entire app.
 */
export class PluginErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[Plugin "${this.props.pluginId}"] Crash:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const t = this.props.theme || {};
      return (
        <div style={{
          padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, height: '100%', background: t.bg || '#0d1117', color: t.text || '#e2e4ed',
          fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        }}>
          <span style={{ fontSize: 36 }}>💥</span>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Le plugin "{this.props.pluginName || this.props.pluginId}" a crashé</div>
          <code style={{
            fontSize: 11, color: '#ef4444', background: (t.surfaceAlt || '#1c2333'),
            padding: '8px 14px', borderRadius: 8, maxWidth: 400, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {this.state.error?.message || 'Erreur inconnue'}
          </code>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
            background: t.accent || '#58a6ff', color: '#fff', cursor: 'pointer',
          }}>
            🔄 Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
