import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

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

    try {
      const normalizedMobile = trimmedMobile;

      // --- Admin login (admin collection) ---
      const adminsRef = collection(db, 'admin');
      const adminQuery = query(adminsRef, where('phone', '==', normalizedMobile));
      const adminSnapshot = await getDocs(adminQuery);

      if (!adminSnapshot.empty) {
        const adminDoc = adminSnapshot.docs[0];
        const adminData = adminDoc.data();

        if (trimmedPassword === String(adminData.password || '').trim()) {
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

        setLocalError('Invalid password');
        return;
      }

      // --- Candidate login (candidates collection) ---
      const candidatesRef = collection(db, 'candidates');
      const candidateQuery = query(candidatesRef, where('mobile', '==', normalizedMobile));
      const candidateSnapshot = await getDocs(candidateQuery);

      if (candidateSnapshot.empty) {
        setLocalError('No account found with this mobile number.');
        return;
      }

      const candidateDoc = candidateSnapshot.docs[0];
      const candidateData = candidateDoc.data();

      if (!candidateData.approvedByAdmin) {
        setLocalError('Your account has not been approved by the admin.');
        return;
      }

      if (candidateData.isActive === false) {
        setLocalError(
          'Your account is currently inactive. Please contact the administrator.',
        );
        return;
      }

      if (candidateData.isSelected) {
        setLocalError('Selected candidates cannot login to the system.');
        return;
      }

      if (trimmedPassword !== String(candidateData.password || '').trim()) {
        setLocalError('Invalid password');
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
          mobile: normalizedMobile,
          role: 'candidate',
          name: (candidateSession.name || '').trim(),
        }),
      );

      navigate('/candidate-dashboard', { replace: true });
    } catch (err) {
      console.error(err);
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
        Home
      </button>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          Slot Booking
        </h1>
        <p className="text-center text-sm text-gray-500 mb-6">
          Login with your registered mobile number and password.
        </p>

        {localError ? (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {localError}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-600 mb-2">
              Mobile
            </label>
            <input
              type="tel"
              placeholder="Enter mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-600 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={passwordVisible ? 'text' : 'password'}
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
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

