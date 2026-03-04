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

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';

// Firebase config is now read from environment variables (.env)
// Make sure these are defined in your .env file.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();

// If your Firestore rules require `request.auth != null`, we need a Firebase Auth user.
// This signs in anonymously once (if enabled in Firebase Console). If disabled, we warn once and continue.
let __triedAnonymous = false;
onAuthStateChanged(auth, async (user) => {
  if (user || __triedAnonymous) return;
  __triedAnonymous = true;
  try {
    await signInAnonymously(auth);
  } catch (error) {
    const code = error?.code || "";
    // Common when Anonymous provider is disabled: auth/admin-restricted-operation or auth/operation-not-allowed
    console.warn(
      "[firebase] Anonymous auth failed. If Firestore rules require auth, enable Anonymous sign-in in Firebase Console → Authentication → Sign-in method.",
      code,
    );
  }
});

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
