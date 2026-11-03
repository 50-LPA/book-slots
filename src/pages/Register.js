import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const togglePasswordVisibility = () => {
    setPasswordVisible((v) => !v);
  };

  const toggleConfirmPasswordVisibility = () => {
    setConfirmPasswordVisible((v) => !v);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!name || !email || !password || !confirmPassword) {
      setLocalError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      const user = await register({ name, email, password });
      console.log('[Register] Registration successful, uid:', user.uid);
      navigate('/candidate-dashboard', { replace: true });
    } catch (err) {
      console.error('[Register] Registration failed:', err);
      const code = err.code || '';
      if (code === 'auth/email-already-in-use') {
        setLocalError('This email is already registered.');
      } else if (code === 'auth/weak-password') {
        setLocalError('Password should be at least 6 characters.');
      } else {
        setLocalError('Failed to register. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-16 sm:pt-24 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2"><i className="fa-solid fa-calendar-days mr-1.5" aria-hidden="true" />
          Slot Booking
        </h1>
        <p className="text-center text-sm text-gray-500 mb-6">
          Create a candidate account to book interview slots.
        </p>

        {localError ? (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {localError}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-user mr-1.5 text-purple-500" aria-hidden="true" />
              Full Name
            </label>
            <input
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-envelope mr-1.5 text-purple-500" aria-hidden="true" />
              Email
            </label>
            <input
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-lock mr-1.5 text-purple-500" aria-hidden="true" />
              Password
            </label>
            <div className="relative">
              <input
                type={passwordVisible ? 'text' : 'password'}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
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

          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-600 mb-2"><i className="fa-solid fa-lock mr-1.5 text-purple-500" aria-hidden="true" />
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={confirmPasswordVisible ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
              />
              <button
                type="button"
                onClick={toggleConfirmPasswordVisibility}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {confirmPasswordVisible ? (
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
          ><i className="fa-solid fa-user-plus mr-1.5" aria-hidden="true" />
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-purple-600 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

