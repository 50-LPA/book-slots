import React, { useState, useEffect } from 'react';

// Navigation Bar Component
export default function Navbar({
  onOpenAddHR,
  onNavChange,
  activeNav: activeNavProp,
  onDownloadForm,
}) {
  const [active, setActive] = useState(activeNavProp || 'home');

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar' },
    { id: 'hrs', label: 'HRs', icon: 'fa-solid fa-users' },
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
      <div className="hidden md:flex bg-white px-3 sm:px-6 py-2 items-center gap-2 shadow-sm border-b border-purple-100">
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
        {typeof onDownloadForm === 'function' && (
          <button
            type="button"
            onClick={onDownloadForm}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 text-xs sm:text-sm font-semibold"
          >
            <i className="fa-solid fa-cloud-arrow-down w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>Download Personal Detail Form 3.0</span>
          </button>
        )}
      </div>

      {/* Mobile nav is handled by the header hamburger; hide Navbar mobile UI */}
    </>
  );
}