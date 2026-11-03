import React from 'react';
import { Link } from 'react-router-dom';

function Header({ fullWidth = false }) {
  return (
    <header className="w-full bg-slate-100">
      <div
        className={
          fullWidth
            ? 'w-full px-4 py-2 sm:py-3 min-h-14 sm:min-h-16 flex items-center'
            : 'mx-auto max-w-6xl px-4 py-2 sm:py-3 min-h-14 sm:min-h-16 flex items-center'
        }
      >
        <div className="flex items-center justify-between w-full gap-2">
          {/* Left: app title */}
          <div className="flex items-center">
            <span className="text-lg sm:text-2xl font-bold text-black truncate">
              <i className="fa-solid fa-calendar-check mr-2 text-purple-600" aria-hidden="true" />
              Book Slots
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center">
          </div>

          {/* Right: Login button */}
          <Link
            to="/login"
            className="min-w-[120px] sm:min-w-[180px] h-10 sm:h-12 inline-flex items-center justify-center rounded-xl bg-purple-600 px-6 sm:px-12 text-sm sm:text-base font-bold text-white shadow-md hover:bg-purple-700 hover:shadow-lg transition active:scale-95"
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;

