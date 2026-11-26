import { initializeApp } from 'firebase/app';

import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';

import { initializeAuth, browserSessionPersistence } from 'firebase/auth';

// Firebase config is read from .env (on Netlify: the same keys under Site configuration → Environment variables).
// NOTE: REACT_APP_* values are bundled into public JS. That is fine for Firebase web
// config; real protection comes from firestore.rules + Firebase Auth.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !firebaseConfig[k]);
if (missing.length) {
  throw new Error(`[firebase] Missing env config: ${missing.join(', ')}. Add the REACT_APP_FIREBASE_* keys to .env.`);
}

export const app = initializeApp(firebaseConfig);

// IndexedDB cache keeps docs + resume tokens across page reloads and tabs, so re-opening a
// screen within ~30 min only bills changed docs instead of re-reading whole collections
// (memory cache re-read everything on every refresh and blew the 50K/day Spark quota).
// Single-tab: auth is per tab (session persistence), and a multi-tab cache sends every tab's reads through
// the primary tab's login, so a login in a second tab was denied. Extra tabs fall back to memory cache.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: false }) }),
});

// Per-tab session (matches the app's sessionStorage 'sb_user' model).
export const auth = initializeAuth(app, { persistence: browserSessionPersistence });

// Netlify Functions (netlify/functions/*.mjs): admin-auth (logins), hrs (HR writes + HR index).
// Resolves { data } like the old httpsCallable so callers are unchanged. A failure carries the server's
// fieldErrors / existingHrFor* (HR duplicates) for the form to show.
export const callFunction = (name, action) => async (payload) => {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...extra } = data;
    throw Object.assign(new Error(error || `Request failed (${res.status}).`), extra);
  }
  return { data };
};
const callAdminAuth = (action) => callFunction('admin-auth', action);
export const adminSetCandidateAuth = callAdminAuth('set');
export const adminDeleteCandidateAuth = callAdminAuth('delete');
export const adminGetCandidatePassword = callAdminAuth('get');

// Users log in with mobile + password. Firebase Auth needs an email, so each mobile maps
// to a synthetic address. Must match emailFor() in netlify/functions/admin-auth.mjs.
export const normalizeMobile = (m) => String(m ?? '').replace(/\D/g, '');
export const mobileToAuthEmail = (m) =>
  `${normalizeMobile(m)}@${firebaseConfig.projectId}.firebaseapp.com`;

// ponytail: 33 legacy passwords are < 6 chars (Firebase minimum). They were migrated as
// password + suffix so those users keep logging in unchanged. Drop once every short password
// has been reset.
const LEGACY_PW_SUFFIX = '#slots-legacy';
export const toAuthPassword = (pw) => (pw.length < 6 ? pw + LEGACY_PW_SUFFIX : pw);
