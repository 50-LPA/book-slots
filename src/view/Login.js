import React, { useState } from 'react';
import { useNavigate } from "react-router-dom";

const ADMIN_MOBILE = '9999999999';
const ADMIN_PASSWORD = '9999';
const ADMIN_AUTH_KEY = 'sb_admin_authed';

export default function Login() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  const handleLogin = () => {
    console.log('Login with:', { mobileNumber, password });
    // Admin hardcoded login
    if (mobileNumber === ADMIN_MOBILE && password === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_AUTH_KEY, 'true');
      navigate('/admin');
      return;
    }

    // Candidate login
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-16 sm:pt-24 p-4">
      {/* Home button outside card, centered */}
      <button
        type="button"
        onClick={handleGoHome}
        className="mb-4 text-purple-600 text-sm font-medium hover:underline"
      >
        Home
      </button>

      {/* Card Container */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {/* Heading */}
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">
          Slot Booking
        </h1>

        {/* Mobile Number Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-purple-600 mb-2">
            Mobile
          </label>
          <input
            type="tel"
            placeholder="Enter mobile number"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            className="w-full px-5 py-4 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Password Input */}
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
              className="w-full px-5 py-4 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
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

        {/* Login Button */}

        <button
          onClick={handleLogin}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm py-5 rounded-lg transition duration-200 ease-in-out"
        >
          Login
        </button>

      </div>

      <a
        href="https://virajkadam.in"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
      >
        VirajKadam.in
      </a>
    </div>
  );
}
