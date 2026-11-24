import React, { useState, useEffect } from 'react';

// Navigation Bar Component
export default function Navbar({
  onOpenAddHR,
  onNavChange,
  activeNav: activeNavProp,
  onDownloadForm,
  onEditProfile,
}) {
  const [active, setActive] = useState(activeNavProp || 'home');

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar-days' },
    { id: 'hrs', label: 'My HRs', icon: 'fa-solid fa-user-tie' },
    { id: 'admission', label: 'Admission Profile', icon: 'fa-solid fa-file-signature' },
    { id: 'myprofile', label: 'My Resume', icon: 'fa-solid fa-file-lines' },
  ];

  // Sync internal state with prop
  useEffect(() => {
    if (activeNavProp !== undefined) {
      setActive(activeNavProp);
    }
  }, [activeNavProp]);

  const handleNavClick = (id) => {
    setActive(id);
    if (typeof onNavChange === 'function') {
      onNavChange(id);
    }
  };

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden md:flex bg-white px-3 sm:px-6 py-2 items-center gap-2 shadow-sm border-b border-purple-100 print:hidden">
        {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                handleNavClick(item.id);
                if (item.id === 'hrs' && typeof onOpenAddHR === 'function') {
                  onOpenAddHR();
                }
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                active === item.id
                  ? 'bg-purple-100 text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className={`${item.icon} w-4 h-4`} aria-hidden="true" />
              <span className="font-medium text-xs sm:text-sm">{item.label}</span>
            </button>
          ))}
        {typeof onEditProfile === 'function' && (
          <button
            type="button"
            onClick={onEditProfile}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
              activeNavProp === 'profile'
                ? 'bg-purple-100 text-purple-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800 hover:bg-purple-50'
            }`}
          >
            <i className="fa-solid fa-id-card w-4 h-4" aria-hidden="true" />
            <span className="font-medium text-xs sm:text-sm">My Profile</span>
          </button>
        )}
        {typeof onDownloadForm === 'function' && (
          <button
            type="button"
            onClick={onDownloadForm}
            className="sb-attention ml-auto inline-flex items-center gap-1.5 rounded-lg border-2 border-blue-500 bg-transparent px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 sm:text-sm"
          >
            <i className="fa-solid fa-file-arrow-down w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>Download Personal Detail Form 3.0</span>
          </button>
        )}
      </div>

      {/* Mobile nav is handled by the header hamburger; hide Navbar mobile UI */}
    </>
  );
}