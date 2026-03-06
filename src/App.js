import React, { Suspense, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';

const Login = React.lazy(() => import(/* webpackChunkName: "auth" */ './pages/Login'));
const Register = React.lazy(() => import(/* webpackChunkName: "auth" */ './pages/Register'));
const AdminRouteGuard = React.lazy(() => import(/* webpackChunkName: "dashboards" */ './Components/AdminRouteGuard'));
const CandidateRouteGuard = React.lazy(() => import(/* webpackChunkName: "dashboards" */ './Components/CandidateRouteGuard'));
const CalendarPage = React.lazy(() => import(/* webpackChunkName: "calendar" */ './pages/CalendarPage'));
const Calender = React.lazy(() => import(/* webpackChunkName: "calendar" */ './pages/Calender'));

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

  useEffect(() => {
    const isDashboard =
      location.pathname === '/admin-dashboard' || location.pathname === '/candidate-dashboard';
    if (isDashboard && arrivedViaPopstate.current) {
      arrivedViaPopstate.current = false;
      navigate('/login', { replace: true });
    }
  }, [location.pathname, navigate]);

  return children;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <NoDashboardViaBackForward>
          <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center"><span className="text-purple-600 font-medium">Loading…</span></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin-dashboard" element={<AdminRouteGuard />} />
            <Route path="/candidate-dashboard" element={<CandidateRouteGuard />} />
            <Route path="/candidate-event-list" element={<CandidateRouteGuard />} />
            <Route path="/" element={<RootRoute />} />
            <Route path="/calender" element={<Calender />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </NoDashboardViaBackForward>
      </AuthProvider>
    </Router>
  );
}

export default App;
