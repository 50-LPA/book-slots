import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { auth } from './firebase/firebase';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Wait for Firebase Auth to restore the session so Firestore rules see the user on first query.
// A UI session without a Firebase user is stale -> drop it so guards send the user to /login.
auth.authStateReady().then(() => {
  if (!auth.currentUser) sessionStorage.removeItem('sb_user');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

if (process.env.NODE_ENV === 'development') {
  import('./reportWebVitals').then(({ default: reportWebVitals }) => reportWebVitals(console.log));
}
