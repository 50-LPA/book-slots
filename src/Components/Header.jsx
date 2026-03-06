import React from 'react';
import { Link } from 'react-router-dom';

function Header({ fullWidth = false }) {
  return (
    <header className="w-full bg-slate-100">
      <div
        className={
          fullWidth
            ? 'w-full px-4 py-2 h-14 flex items-center'
            : 'mx-auto max-w-6xl px-4 py-2 h-14 flex items-center'
        }
      >
        <div className="flex items-center justify-between w-full">
          {/* Left: app title */}
          <div className="flex items-center">
            <span className="text-2xl font-bold text-black truncate">
              Slot Booking
            </span>
          </div>

          {/* Center: VirajKadam.in hyperlink */}
          <div className="flex-1 flex items-center justify-center">
            <a
              href="https://virajkadam.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
            >
              VirajKadam.in
            </a>
          </div>

          {/* Right: Login button */}
          <Link
            to="/login"
            className="min-w-[150px] text-center rounded-lg bg-purple-600 px-10 py-1.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-purple-700 transition"
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;

