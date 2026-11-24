import React, { Suspense, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { QuotaBanner } from './utils/quota';

const Login = React.lazy(() => import('./pages/Login'));
const AdminRouteGuard = React.lazy(() => import('./Components/AdminRouteGuard'));
const CandidateRouteGuard = React.lazy(() => import('./Components/CandidateRouteGuard'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));

// When a logged-in user lands on "/", send them to the correct dashboard
function RootRoute() {
  try {
    const raw = sessionStorage.getItem('sb_user');
    const parsed = raw ? JSON.parse(raw) : null;
    const role = (parsed?.role || '').trim().toLowerCase();

    if (parsed?.mobile) {
      if (role === 'admin') {
        return <Navigate to="/admin-dashboard" replace />;
      }
      if (role === 'candidate') {
        return <Navigate to="/candidate-dashboard" replace />;
      }
    }
  } catch {
    // ignore parse errors and fall through to public calendar
  }

  return <CalendarPage />;
}

function NoDashboardViaBackForward({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const arrivedViaPopstate = useRef(false);

  useEffect(() => {
    const onPopstate = () => {
      arrivedViaPopstate.current = true;
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, []);

  const lastPath = useRef(location.pathname);
  useEffect(() => {
    const isDashboard =
      location.pathname === '/admin-dashboard' || location.pathname === '/candidate-dashboard';
    const viaBackForward = arrivedViaPopstate.current;
    arrivedViaPopstate.current = false; // per navigation: hash changes (profile pages) fire popstate too
    const pathChanged = lastPath.current !== location.pathname; // hash-only moves stay on the dashboard
    lastPath.current = location.pathname;
    if (isDashboard && viaBackForward && pathChanged) {
      navigate('/login', { replace: true });
    }
  }, [location, navigate]);

  return children;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <QuotaBanner />
        <NoDashboardViaBackForward>
          <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center"><span className="text-purple-600 font-medium">Loading…</span></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin-dashboard" element={<AdminRouteGuard />} />
            <Route path="/candidate-dashboard" element={<CandidateRouteGuard />} />
            <Route path="/" element={<RootRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <span className="fixed bottom-1 right-2 text-[10px] text-slate-400 pointer-events-none select-none print:hidden">v1</span>
        </NoDashboardViaBackForward>
      </AuthProvider>
    </Router>
  );
}

export default App;
