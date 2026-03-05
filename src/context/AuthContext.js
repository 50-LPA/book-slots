import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Derive auth state from localStorage-backed session (shared with bookmyslot).
  useEffect(() => {
    const loadSession = async () => {
      try {
        const raw = sessionStorage.getItem('sb_user');
        const parsed = raw ? JSON.parse(raw) : null;

        if (!parsed?.mobile) {
          setCurrentUser(null);
          setRole(null);
          setInitializing(false);
          return;
        }

        const mobile = String(parsed.mobile || '').trim();
        const localRole = (parsed.role || '').trim().toLowerCase();

        let resolvedRole = localRole || null;

        // Optionally look up candidate doc to confirm role.
        if (!resolvedRole && parsed.id) {
          try {
            const candidateRef = doc(db, 'candidates', parsed.id);
            const snap = await getDoc(candidateRef);
            if (snap.exists()) {
              resolvedRole = 'candidate';
            }
          } catch {
            // ignore
          }
        }

        const userLike = {
          uid: mobile,
          mobile,
          displayName: parsed.name || '',
        };

        setCurrentUser(userLike);
        setRole(resolvedRole);
        setError(null);
      } catch (err) {
        console.error('[AuthContext] Failed to load session:', err);
        setCurrentUser(null);
        setRole(null);
        setError(err);
      } finally {
        setInitializing(false);
      }
    };

    loadSession();
  }, []);

  // For now, registration and email/password Firebase Auth are unused
  // in favour of the Firestore + localStorage model. Expose no-op stubs
  // so existing callers don’t break.
  const register = useCallback(async () => {
    throw new Error('Email/password registration is not supported in this deployment.');
  }, []);

  const login = useCallback(async () => {
    throw new Error('Email/password Firebase Auth login is not supported; use mobile login.');
  }, []);

  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem('sb_user');
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setRole(null);
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      role,
      loading: initializing || actionLoading,
      initializing,
      actionLoading,
      error,
      login,
      register,
      logout,
    }),
    [currentUser, role, initializing, actionLoading, error, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

