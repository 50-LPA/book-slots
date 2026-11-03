import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, mobileToAuthEmail, normalizeMobile, toAuthPassword } from '../firebase/firebase';
import {
  fetchCandidateEventsFromFirestore,
  isCandidateInterviewOlderThanTwoWeeks,
} from '../utils/candidateStatus';

export default function Login() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const togglePasswordVisibility = () => {
    setPasswordVisible((v) => !v);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    // Trim input values
    const trimmedMobile = mobile.trim();
    const trimmedPassword = password.trim();

    if (!trimmedMobile || !trimmedPassword) {
      setLocalError('Please enter both mobile number and password.');
      setLoading(false);
      return;
    }

    if (!/^[6-9]\d{9}$/.test(trimmedMobile)) {
      setLocalError('Mobile must be 10 digits starting with 6, 7, 8 or 9.');
      setLoading(false);
      return;
    }

    if (!/^[^a-zA-Z\s]{6}$/.test(trimmedPassword)) {
      setLocalError('Password must be exactly 6 characters (numbers and symbols only).');
      setLoading(false);
      return;
    }

    // Any early return below must also sign out of Firebase Auth.
    const reject = async (msg) => {
      await signOut(auth).catch(() => {});
      setLocalError(msg);
    };

    try {
      const normalizedMobile = normalizeMobile(trimmedMobile);

      // Password is verified by Firebase Auth; Firestore never stores or exposes it.
      let cred;
      try {
        cred = await signInWithEmailAndPassword(
          auth,
          mobileToAuthEmail(normalizedMobile),
          toAuthPassword(trimmedPassword),
        );
      } catch (authErr) {
        const code = authErr?.code || '';
        if (code === 'auth/too-many-requests') {
          setLocalError('Too many attempts. Please wait a few minutes and try again.');
        } else if (
          ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)
        ) {
          setLocalError('Invalid mobile number or password.');
        } else {
          throw authErr;
        }
        return;
      }
      const uid = cred.user.uid;

      // --- Admin login (admin/{uid}) ---
      const adminDoc = await getDoc(doc(db, 'admin', uid));
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const adminSession = {
          id: adminDoc.id,
          name: adminData.name || 'Admin',
          role: 'admin',
          phone: adminData.phone,
          loginTime: Date.now(),
          isAdmin: true,
        };

        // Preserve original app’s admin session keys for compatibility
        localStorage.setItem('user', JSON.stringify(adminSession));
        localStorage.setItem('adminToken', Date.now().toString());
        localStorage.setItem('adminAuth', 'true');

        // Use sessionStorage so pasting URL in another tab/browser opens login page
        sessionStorage.setItem(
          'sb_user',
          JSON.stringify({
            mobile: normalizedMobile,
            role: 'admin',
            name: (adminData.name || '').trim(),
          }),
        );

        navigate('/admin-dashboard', { replace: true });
        return;
      }

      // --- Candidate login (candidates/{uid}) ---
      const candidateDoc = await getDoc(doc(db, 'candidates', uid));
      if (!candidateDoc.exists()) {
        await reject('No account found with this mobile number.');
        return;
      }
      const candidateData = candidateDoc.data();

      if (!candidateData.approvedByAdmin) {
        await reject('Your account has not been approved by the admin.');
        return;
      }

      // Check if candidate's last interview was more than 2 weeks ago
      const candidateInfo = {
        id: candidateDoc.id,
        firestoreId: candidateDoc.id,
        mobile: normalizedMobile,
        ...candidateData,
      };
      const candidateSlots = await fetchCandidateEventsFromFirestore(candidateInfo, db);
      const isMoreThanTwoWeeks = isCandidateInterviewOlderThanTwoWeeks(candidateSlots, candidateInfo);

      if (candidateData.isActive === false || candidateData.status === 'Inactive' || isMoreThanTwoWeeks) {
        if (candidateData.isActive !== false && isMoreThanTwoWeeks) {
          try {
            await updateDoc(doc(db, 'candidates', candidateDoc.id), { isActive: false, status: 'Inactive' });
          } catch (updateErr) {
            console.error('Failed to auto-update candidate inactive status on login:', updateErr);
          }
        }
        await reject('Your account is currently inactive. Please contact the administrator.');
        return;
      }

      if (candidateData.isSelected) {
        await reject('Selected candidates cannot login to the system.');
        return;
      }

      const candidateSession = {
        ...candidateData,
        id: candidateDoc.id,
        role: 'candidate',
      };

      // Original app’s candidate session keys
      localStorage.setItem('candidates', JSON.stringify(candidateSession));
      localStorage.setItem('name', candidateSession.name);
      localStorage.setItem('email', candidateSession.email);
      localStorage.setItem('uid', candidateSession.id);

      // Also set sb_user for this app’s guards and dashboards
      sessionStorage.setItem(
        'sb_user',
        JSON.stringify({
          id: candidateDoc.id,
          firestoreId: candidateDoc.id,
          mobile: normalizedMobile,
          role: 'candidate',
          name: (candidateSession.name || '').trim(),
          isActive: candidateData.isActive !== false,
          status: candidateData.status || 'Active',
          lastActivatedAt: candidateData.lastActivatedAt || candidateData.reactivatedAt || null,
        }),
      );

      navigate('/candidate-dashboard', { replace: true });
    } catch (err) {
      console.error(err);
      await signOut(auth).catch(() => {});
      setLocalError('Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-16 sm:pt-24 p-4">
      <button
        type="button"
        onClick={handleGoHome}
        className="mb-4 text-purple-600 text-sm font-medium hover:underline"
      >
        <i className="fa-solid fa-house mr-1" aria-hidden="true" />
        Home
      </button>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2"><i className="fa-solid fa-calendar-check mr-1.5" aria-hidden="true" />
          Book Slots
        </h1>
        <p className="text-center text-sm text-gray-500 mb-1">
          Welcome back!
        </p>
        <p className="text-center text-sm text-gray-500 mb-6">
          Enter your number &amp; password and book your slot asap
        </p>

        {localError ? (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {localError}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
              Mobile
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-lock mr-1.5 text-purple-500" aria-hidden="true" />
              Password
            </label>
            <div className="relative">
              <input
                type={passwordVisible ? 'text' : 'password'}
                maxLength={6}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {passwordVisible ? (
                  <i className="fa-solid fa-eye-slash w-5 h-5" aria-hidden="true" />
                ) : (
                  <i className="fa-solid fa-eye w-5 h-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold py-3 rounded-lg transition duration-200 ease-in-out"
          >
            <i className="fa-solid fa-lock mr-2" aria-hidden="true" />
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

