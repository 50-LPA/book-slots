import { initializeApp } from 'firebase/app';

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  getDoc,
  where,
} from 'firebase/firestore';

import { initializeAuth, browserSessionPersistence } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase config is read from environment variables (.env / Netlify env).
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
  throw new Error(`[firebase] Missing env config: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Per-tab session (matches the app's sessionStorage 'sb_user' model).
export const auth = initializeAuth(app, { persistence: browserSessionPersistence });

// Must match REGION in functions/index.js.
const functions = getFunctions(app, 'asia-south1');
export const adminSetCandidateAuth = httpsCallable(functions, 'adminSetCandidateAuth');
export const adminDeleteCandidateAuth = httpsCallable(functions, 'adminDeleteCandidateAuth');

// Users log in with mobile + password. Firebase Auth needs an email, so each mobile maps
// to a synthetic address. Must match emailFor() in functions/index.js and functions/migrate-auth.js.
export const normalizeMobile = (m) => String(m ?? '').replace(/\D/g, '');
export const mobileToAuthEmail = (m) =>
  `${normalizeMobile(m)}@${firebaseConfig.projectId}.firebaseapp.com`;

// ponytail: 33 legacy passwords are < 6 chars (Firebase minimum). They were migrated as
// password + suffix so those users keep logging in unchanged. Suffix must match
// functions/migrate-auth.js. Drop once every short password has been reset.
const LEGACY_PW_SUFFIX = '#slots-legacy';
export const toAuthPassword = (pw) => (pw.length < 6 ? pw + LEGACY_PW_SUFFIX : pw);

export {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  getDoc,
  where,
};
