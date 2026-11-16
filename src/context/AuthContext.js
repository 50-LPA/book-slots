import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// Session lives in sessionStorage 'sb_user' (written by Login); index.js drops it when Firebase Auth has no user.
function readSessionUser() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('sb_user') || 'null');
    const mobile = String(parsed?.mobile || '').trim();
    return mobile ? { uid: mobile, mobile, displayName: parsed.name || '' } : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [value] = useState(() => ({ currentUser: readSessionUser() }));
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
