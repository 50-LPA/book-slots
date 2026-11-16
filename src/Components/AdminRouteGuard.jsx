import React from 'react';
import { Navigate } from 'react-router-dom';
import AdminDashboard from '../view/AdminDashboard';

/**
 * Route-level guard for /admin-dashboard.
 * Runs synchronously before AdminDashboard mounts, so candidates never see admin UI
 * when using browser back/forward (avoids flash and ensures redirect with replace).
 */
export default function AdminRouteGuard() {
  try {
    const raw = sessionStorage.getItem('sb_user');
    const parsed = raw ? JSON.parse(raw) : null;
    const role = (parsed?.role || '').trim().toLowerCase();

    if (!parsed?.mobile) {
      return <Navigate to="/login" replace />;
    }
    if (role !== 'admin') {
      return <Navigate to="/candidate-dashboard" replace />;
    }
    return <AdminDashboard />;
  } catch {
    return <Navigate to="/login" replace />;
  }
}
