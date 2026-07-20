import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './stores/authStore';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Graph from './pages/Graph';
import Room from './pages/Room';
import Admin from './pages/Admin';

// Auth guard component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1117', color: '#e2e4ed' }}>Chargement...</div>;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`} replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1117', color: '#e2e4ed' }}>Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  const checkAuth = useAuthStore(s => s.checkAuth);

  useEffect(() => { checkAuth(); }, []);

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Protected */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/case/:id" element={<ProtectedRoute><Graph /></ProtectedRoute>} />
      <Route path="/room/:id" element={<ProtectedRoute><Room /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
