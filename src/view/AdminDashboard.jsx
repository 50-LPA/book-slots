import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  updateSlotStatus,
  deleteSlot,
  slotsSnapshotToUI,
  getLeaves,
  addLeave as addLeaveToFirestore,
  deleteLeave as deleteLeaveFromFirestore,
  formatDateDDMMYYYY,
} from '../firebase/slotsService';
import { parseISOToDate } from '../calendar';
import WeekCalendar from '../Components/WeekCalendar';
import { downloadWithSaveAs } from '../utils/downloadUtils';

// Normalise legacy round labels to new naming
function normaliseRoundLabelAdmin(raw) {
  const r = String(raw || '').trim();
  if (!r) return '';
  const lower = r.toLowerCase();
  if (lower === 'round 1') return 'Technical Round 1';
  if (lower === 'round 2') return 'Technical Round 2';
  if (lower === 'round 3') return 'Technical Round 3';
  if (lower === 'manager round' || lower === 'managerial round') return 'Manageral Round';
  // Map legacy labels to the new detailed rounds
  if (lower === 'technical discussion round') return 'Technical Round 2';
  if (lower === 'last technical round') return 'Technical Round 3';
  return r;
}

// Reusable pagination bar: left = count label, right = « < pages > » + per-page selector
function PaginationBar({
  totalItems,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  label = 'Items',
  optionsPerPage = [10, 20, 25, 50],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const pageNumbers = [];
  const maxVisible = 5;
  let first = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let last = Math.min(totalPages, first + maxVisible - 1);
  if (last - first + 1 < maxVisible) {
    first = Math.max(1, last - maxVisible + 1);
  }
  for (let i = first; i <= last; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap px-3 py-2">
      {/* Left: count */}
      <div className="text-xs sm:text-sm text-slate-600">
        {totalItems} {label}
      </div>
      {/* Right: « < 1 2 3 ... > » + per page */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="First page"
        >
          &laquo;
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="Previous page"
        >
          &lsaquo;
        </button>
        {pageNumbers.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onPageChange(num)}
            className={`min-w-[28px] px-2 py-1 rounded text-sm font-medium ${
              num === currentPage
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="Next page"
        >
          &rsaquo;
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="Last page"
        >
          &raquo;
        </button>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-600"
        >
          {optionsPerPage.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Header copied from CandidateDashboard, adjusted for Admin, with mobile sidebar nav
function AdminHeader({ activeTab, onChangeTab }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('sb_user');
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'candidates', label: 'Candidates', icon: 'fa-solid fa-users' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar-days' },
    { id: 'leaves', label: 'Admin Leaves', icon: 'fa-solid fa-calendar-check' },
    { id: 'hrs', label: 'HRs', icon: 'fa-solid fa-user-group' },
    { id: 'stats', label: 'Statistics', icon: 'fa-solid fa-chart-line' },
  ];

  const handleNavClick = (id) => {
    if (typeof onChangeTab === 'function') {
      onChangeTab(id);
    }
    setNavOpen(false);
  };

  return (
    <>
      <div className="bg-pink-100 px-2 sm:px-4 md:px-8 py-2 sm:py-3 md:py-4 flex items-center justify-between gap-2 sm:gap-3 relative">
        {/* Left Section: mobile menu + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-slate-700 hover:bg-pink-200 shadow-sm md:hidden"
            aria-label="Toggle navigation"
          >
            <i className="fa-solid fa-bars w-4 h-4" aria-hidden="true" />
          </button>
        <h1 className="text-sm sm:text-base md:text-xl font-bold text-gray-900 truncate">
          Slot Booking
        </h1>
      </div>

        {/* Center Section - domain (hidden on small screens like screenshot) */}
      <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2">
        <a
          href="https://virajkadam.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
        >
          VirajKadam.in
        </a>
      </div>

        {/* Right Section: user info */}
      <div className="relative flex items-center gap-2 sm:gap-3 md:gap-4 ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 focus:outline-none"
        >
          {/* Mobile: show name + role beside avatar, like desktop */}
          <div className="flex flex-col items-end sm:hidden">
            <p className="font-semibold text-[11px] text-gray-900 max-w-[120px] truncate">
              Viraj Kadam
            </p>
            <p className="text-[10px] text-gray-500">Admin</p>
          </div>
          {/* Desktop / tablet: existing name + role */}
          <div className="text-right hidden sm:block">
            <p className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
              Viraj Kadam
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">Admin</p>
          </div>
          <div className="w-8 sm:w-9 md:w-10 h-8 sm:h-9 md:h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
            <span className="text-xs sm:text-sm md:text-base font-semibold text-white">VK</span>
          </div>
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setMenuOpen(false)}
              aria-label="Close profile menu"
            />
            <div className="absolute right-0 top-10 w-40 rounded-xl bg-white shadow-lg border border-slate-100 z-50 overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Viraj Kadam</p>
                <p className="text-[11px] text-slate-500">Admin</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2"
              >
                Log Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>

      {/* Mobile sidebar navigation (like screenshot) */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="relative h-full w-64 max-w-[80%] bg-slate-900 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <span className="text-sm font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="p-1.5 rounded hover:bg-slate-800"
                aria-label="Close menu"
              >
                <i className="fa-solid fa-xmark w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-2 py-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left ${
                    activeTab === item.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <i className={`${item.icon} w-4 h-4`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

// Top navigation row like screenshot
function AdminTopNav({ activeTab, onChange, pendingApprovals = 0 }) {
  const baseBtn =
    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all';

  return (
    <div className="hidden md:flex bg-white px-3 sm:px-6 py-2 items-center gap-2 shadow-sm border-b border-purple-100">
      {/* Home - active */}
      <button
        onClick={() => onChange('home')}
        className={`${baseBtn} ${
          activeTab === 'home'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-house w-4 h-4" aria-hidden="true" />
        <span>Home</span>
      </button>

      {/* Candidates */}
      <button
        onClick={() => onChange('candidates')}
        className={`${baseBtn} ${
          activeTab === 'candidates'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-users w-4 h-4" aria-hidden="true" />
        <span>Candidates</span>
      </button>

      {/* Slots */}
      <button
        onClick={() => onChange('slots')}
        className={`${baseBtn} ${
          activeTab === 'slots'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-calendar w-4 h-4" aria-hidden="true" />
        <span>Slots</span>
      </button>

      {/* Admin Leaves */}
      <button
        onClick={() => onChange('leaves')}
        className={`${baseBtn} ${
          activeTab === 'leaves'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-calendar w-4 h-4" aria-hidden="true" />
        <span>Admin Leaves</span>
      </button>

      {/* HRs */}
      <button
        onClick={() => onChange('hrs')}
        className={`${baseBtn} ${
          activeTab === 'hrs'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-users w-4 h-4" aria-hidden="true" />
        <span>HRs</span>
      </button>

      {/* Statistics */}
      <button
        onClick={() => onChange('stats')}
        className={`${baseBtn} ${
          activeTab === 'stats'
            ? 'bg-purple-100 text-purple-600 shadow-sm'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        <i className="fa-solid fa-chart-bar w-4 h-4" aria-hidden="true" />
        <span>Statistics</span>
      </button>

      <div className="ml-auto hidden sm:flex items-center text-[11px] font-semibold text-slate-600">
        Pending Approvals:&nbsp;
        <span className="text-red-600">{pendingApprovals}</span>
      </div>
    </div>
  );
}

// Placeholder events for admin calendar (no fixed dates; real data should come from backend)
const ADMIN_EVENTS = [];

function toTitleCase(value) {
  const str = String(value || '').toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Dummy data removed – use Firestore only
const MOCK_CANDIDATES = [];
const MOCK_SLOTS = [];
const MOCK_HRS = [];

function AdminCandidatesTable({
  candidates,
  slots = [],
  selectionFilter,
  referredByFilter,
  statusFilter,
  search,
  onBackToHome,
  onOpenAddForm,
  onChangeSelectionFilter,
  onChangeReferredByFilter,
  onChangeStatusFilter,
  onChangeSearch,
  onToggleStatus,
  onDeleteCandidate,
  onViewCandidate,
  onEditCandidate,
}) {
  const getLastInterview = (candidate) => {
    const candidateName = (candidate?.name || '').trim();
    const candidateSlots = slots.filter(
      (s) => (s.candidateName || s.name || '').trim() === candidateName,
    );
    if (candidateSlots.length === 0) return null;

    const now = new Date();

    // Only consider slots whose END time is in the past
    const completedSlots = candidateSlots.filter((slot) => {
      const baseDate =
        slot.date instanceof Date ? slot.date : new Date(slot.date || 0);
      const startHour = slot.startHour != null ? slot.startHour : 0;
      const startMinute = slot.startMinute != null ? slot.startMinute : 0;
      const durationMins =
        slot.duration != null ? Number(slot.duration) : 30;

      const start = new Date(baseDate);
      start.setHours(startHour, startMinute, 0, 0);
      const end = new Date(start.getTime() + durationMins * 60000);

      return end <= now;
    });

    if (completedSlots.length === 0) return null;

    // Latest completed slot by end time
    const sorted = [...completedSlots].sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date || 0);
      const db = b.date instanceof Date ? b.date : new Date(b.date || 0);
      const ta = da.getTime() + ((a.startHour || 0) * 60 + (a.startMinute || 0)) * 60000;
      const tb = db.getTime() + ((b.startHour || 0) * 60 + (b.startMinute || 0)) * 60000;
      return tb - ta;
    });

    const last = sorted[0];
    return {
      date: last.dateExactLabel || last.dateLabel || '-',
      time: last.timeLabel || '',
    };
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalItems = candidates.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedCandidates = candidates.slice(startIdx, startIdx + itemsPerPage);
  const [confirmDeleteCandidateId, setConfirmDeleteCandidateId] = useState(null);
  const [confirmDeleteCandidateName, setConfirmDeleteCandidateName] = useState('');

  const getScheduledCount = (candidateName) => {
    return slots.filter(
      (s) => (s.candidateName || s.name || '').trim() === (candidateName || '').trim(),
    ).length;
  };

  // Reset to page 1 when data/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [candidates.length]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header row - back + title + top-right buttons */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Left: back only */}
        <div className="flex items-start">
          <button
            onClick={onBackToHome}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title + refresh (refresh on right side of text) */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-purple-600">
            Candidate List
          </span>
          <button
            type="button"
            onClick={() => {
              onChangeSelectionFilter('unselected');
              onChangeReferredByFilter('all');
              onChangeSearch('');
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Refresh"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Right: Add Candidate */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Add Candidate */}
          <button
            onClick={onOpenAddForm}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 sm:px-4 py-1.5 text-[11px] sm:text-sm font-semibold text-white shadow hover:bg-emerald-600 whitespace-nowrap"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
            </span>
            <span>Add Candidate</span>
          </button>
        </div>
      </div>

      {/* Filters row under Add Candidate */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Left: total candidates (stacked like screenshot) */}
        <div className="flex flex-col items-center leading-snug">
          <span className="text-base font-semibold text-slate-800">
            {candidates.length}
          </span>
          <span className="text-[11px] text-slate-500">
            Total Candidates
          </span>
        </div>

        {/* Right: filters grouped and right-aligned */}
        <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
          {/* Selected / Unselected pill */}
          <div className="flex w-36 sm:w-48 rounded-full border border-purple-400 overflow-hidden text-[11px] sm:text-xs h-8">
            <button
              onClick={() => onChangeSelectionFilter('selected')}
              className={`flex-1 px-3 font-semibold flex items-center justify-center h-full ${
                selectionFilter === 'selected'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-purple-600'
              }`}
            >
                Selected
            </button>
            <button
              onClick={() => onChangeSelectionFilter('unselected')}
              className={`flex-1 px-3 font-semibold flex items-center justify-center h-full ${
                selectionFilter === 'unselected'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-purple-600'
              }`}
            >
                Unselected
            </button>
          </div>

          {/* Referred By filter dropdown */}
          <select
            value={referredByFilter}
            onChange={(e) => onChangeReferredByFilter(e.target.value)}
            className="h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700"
          >
            <option value="all">All</option>
            <option value="anil_sir">Anil sir</option>
            <option value="viraj_sir">Viraj sir</option>
            <option value="nilesh_sir">Nilesh sir</option>
            <option value="vishal_sir">Vishal sir</option>
          </select>

          {/* Active / Inactive filter */}
          <select
            value={statusFilter}
            onChange={(e) => onChangeStatusFilter(e.target.value)}
            className="h-8 w-28 sm:w-32 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Search */}
          <div className="relative w-36 sm:w-48">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white pl-7 pr-3 py-1.5 text-[11px] sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
        </div>
      </div>

      {/* Table with grid (column borders) */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs sm:text-sm border border-slate-200">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200 w-10">
                Sr.
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Name
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Mobile
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Experience
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Technologies
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Total Slots
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Last Interview
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Status
              </th>
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedCandidates.map((c, idx) => (
              <tr key={c.firestoreId || c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                  {startIdx + idx + 1}
                </td>
                <td className="px-3 py-2 text-slate-800 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const ref = (c.referredBy || '').toLowerCase();
                      let bg = 'bg-slate-100';
                      let text = 'text-slate-600';
                      if (ref.includes('anil')) {
                        bg = 'bg-blue-100';
                        text = 'text-blue-600';
                      } else if (ref.includes('viraj')) {
                        bg = 'bg-emerald-100';
                        text = 'text-emerald-600';
                      } else if (ref.includes('nilesh')) {
                        bg = 'bg-red-100';
                        text = 'text-red-600';
                      } else if (ref.includes('vishal')) {
                        bg = 'bg-orange-100';
                        text = 'text-orange-600';
                      }
                      return (
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${bg} ${text} text-[11px] flex-shrink-0`}
                        >
                          <i className="fa-solid fa-user text-xs" aria-hidden="true" />
                        </span>
                      );
                    })()}
                    <span className="truncate">{c.name}</span>
                    {c.selected && (
                      <span className="ml-1 text-xs font-bold text-blue-600 whitespace-nowrap">
                        - Selected
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                  {c.mobile}
                </td>
                <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                  {(c.experience && String(c.experience).trim()) || '0'} yrs
                </td>
                <td className="px-3 py-2 text-center border-r border-slate-200">
                  <div className="inline-flex flex-wrap gap-1 justify-center">
                    {c.technologies.map((t) => (
                      <span
                        key={t}
                        className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                  {getScheduledCount(c.name)}
                </td>
                <td className="px-3 py-2 text-slate-700 text-center text-xs border-r border-slate-200">
                  {(() => {
                    const last = getLastInterview(c);
                    if (last) {
                      return (
                        <div className="flex flex-col">
                          <span>{last.date}</span>
                          {last.time && (
                            <span className="text-[11px] text-slate-500">{last.time}</span>
                          )}
                        </div>
                      );
                    }
                    return '-';
                  })()}
                </td>
                <td className="px-3 py-2 text-center border-r border-slate-200">
                  <button
                    onClick={() => onToggleStatus(c.id)}
                    className={`inline-flex rounded-full px-3 py-0.5 text-[11px] font-semibold ${
                      c.status === 'Active'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-300 text-slate-800'
                    }`}
                  >
                    {c.status}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex gap-2">
                    <button
                      onClick={() => onViewCandidate(c.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-sky-500 text-white hover:bg-sky-600"
                    >
                      <i className="fa-solid fa-eye" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onEditCandidate(c.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-white hover:bg-amber-500"
                    >
                      <i className="fa-solid fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteCandidateId(c.id);
                        setConfirmDeleteCandidateName(c.name || '');
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalItems > itemsPerPage && (
        <PaginationBar
          totalItems={totalItems}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => {
            setItemsPerPage(n);
            setCurrentPage(1);
          }}
          label="Candidates"
        />
      )}
      {/* Delete candidate confirmation modal */}
      {confirmDeleteCandidateId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setConfirmDeleteCandidateId(null);
            setConfirmDeleteCandidateName('');
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-6 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete this candidate?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteCandidateId(null);
                  setConfirmDeleteCandidateName('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Candidate:{' '}
              <span className="font-semibold">
                {confirmDeleteCandidateName || 'Unnamed'}
              </span>
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteCandidateId(null);
                  setConfirmDeleteCandidateName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteCandidate && confirmDeleteCandidateId != null) {
                    onDeleteCandidate(confirmDeleteCandidateId);
                  }
                  setConfirmDeleteCandidateId(null);
                  setConfirmDeleteCandidateName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminAddCandidateForm({ onBack, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    experience: '',
    password: '123456',
    technology: [],
    referredBy: '',
  });
  const [showPassword, setShowPassword] = useState(true);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  const techDropdownRef = useRef(null);
  const [techSearch, setTechSearch] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const techOptions = [
    'PHP',
    '.net Devloper',
    'Python',
    'Data Science',
    'MERN Stack',
    'MEAN Stack',
    'Java',
    'React Devloper',
    'App Support',
    'Busness Analyst',
    'Manual Testing',
    'Automation Testing',
    'DevOps(AWG)',
    'DevOps(Azure)',
    'Data Analysts',
    'AEM',
    'Power BI',
    'Other',
  ];

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'mobile') {
      value = value.replace(/\D/g, '');
    } else if (field === 'password') {
      // Allow digits and symbols, max 6 characters (no letters)
      value = value.replace(/[a-zA-Z]/g, '').slice(0, 6);
    } else if (field === 'experience') {
      value = value.replace(/[^\d.]/g, '');
      let parts = value.split('.');
      if (parts.length > 2) {
        parts = [parts[0], parts.slice(1).join('')];
      }
      if (parts.length === 2 && parts[1].length > 1) {
        parts[1] = parts[1].slice(0, 1);
      }
      value = parts.join('.');
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTechOption = (value) => {
    setForm((prev) => {
      const exists = prev.technology.includes(value);
      return {
        ...prev,
        technology: exists
          ? prev.technology.filter((v) => v !== value)
          : [...prev.technology, value],
      };
    });
  };

  const filteredTechOptions = useMemo(() => {
    const q = techSearch.trim().toLowerCase();
    if (!q) return techOptions;
    return techOptions.filter((t) => String(t).toLowerCase().includes(q));
  }, [techOptions, techSearch]);

  useEffect(() => {
    if (!showTechDropdown) return;

    const onMouseDown = (event) => {
      if (techDropdownRef.current && !techDropdownRef.current.contains(event.target)) {
        setShowTechDropdown(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowTechDropdown(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showTechDropdown]);

  useEffect(() => {
    if (!showTechDropdown) setTechSearch('');
  }, [showTechDropdown]);

  const handleGeneratePassword = () => {
    const random = String(Math.floor(100000 + Math.random() * 900000));
    setForm((prev) => ({ ...prev, password: random }));
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const trimmedName = form.name.trim();
    const trimmedMobile = form.mobile.trim();
    const trimmedPassword = form.password.trim();

    if (!trimmedName) {
      setError('Candidate name is required.');
      return;
    }
    if (!trimmedMobile) {
      setError('Mobile number is required.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(trimmedMobile)) {
      setError('Enter valid 10-digit mobile number starting with 6-9.');
      return;
    }
    if (!trimmedPassword) {
      setError('Password is required and must be exactly 6 characters.');
      return;
    }
    if (/[a-zA-Z]/.test(trimmedPassword) || trimmedPassword.length !== 6) {
      setError('Password must be exactly 6 characters (numbers and symbols only).');
      return;
    }
    if (!form.technology || form.technology.length === 0) {
      setError('Please select at least one technology.');
      return;
    }
    if (!form.referredBy?.trim()) {
      setError('Referred By is required.');
      return;
    }
    const trimmedExperience = form.experience?.trim();
    if (!trimmedExperience) {
      setError('Experience is required.');
      return;
    }
    const validExpPattern = /^\d+(\.\d)?$/;
    if (!validExpPattern.test(trimmedExperience)) {
      setError('Experience must be a number between 0 and 20 with at most one decimal place.');
      return;
    }
    const expNum = parseFloat(trimmedExperience);
    if (Number.isNaN(expNum) || expNum < 0 || expNum > 20) {
      setError('Experience must be a number between 0 and 20 with at most one decimal place.');
      return;
    }
    setLoading(true);
    try {
      // Check if mobile already exists in candidates
      const candidateQueryRef = query(
        collection(db, 'candidates'),
        where('mobile', '==', trimmedMobile),
      );
      const existingCandidateSnapshot = await getDocs(candidateQueryRef);

      // Check if mobile already exists in admin collection (phone field)
      const adminQueryRef = query(
        collection(db, 'admin'),
        where('phone', '==', trimmedMobile),
      );
      const existingAdminSnapshot = await getDocs(adminQueryRef);

      if (!existingCandidateSnapshot.empty || !existingAdminSnapshot.empty) {
        setError('This mobile number is already registered as Admin or Candidate.');
        setLoading(false);
        return;
      }

      const techString = form.technology.join(', ');

      const candidateData = {
        name: trimmedName,
        mobile: trimmedMobile,
        password: trimmedPassword,
        approvedByAdmin: true,
        technology: techString,
        // store both spellings for compatibility with existing data
        refereedBy: form.referredBy.trim(),
        referredBy: form.referredBy.trim(),
        experience: form.experience?.trim() || '',
        isActive: true,
        isSelected: false,
        selectedDate: '',
        selectedCompany: '',
        selectedPackage: '',
        joiningDate: '',
        createdAt: serverTimestamp(),
        regimeType: 'new-70',
      };

      const docRef = await addDoc(collection(db, 'candidates'), candidateData);

      setSuccessMessage('Candidate added successfully.');
      
      // Pass full form data to parent for local state update
      if (typeof onSubmit === 'function') {
        onSubmit({
          firestoreId: docRef.id,
          name: trimmedName,
          mobile: trimmedMobile,
          experience: form.experience?.trim() || '',
          password: trimmedPassword,
          technology: form.technology || [],
          referredBy: form.referredBy?.trim() || '',
        });
      }
      
      setForm({
        name: '',
        mobile: '',
        experience: '',
        password: '123456',
        technology: [],
        referredBy: '',
      });
      setShowPassword(true);
      setShowTechDropdown(false);
      setTechSearch('');
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to add candidate.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6"
    >
      {/* Header: back button left, title centered like other pages */}
      <div className="flex items-center justify-between mb-4 gap-3">
        {/* Left: back button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4 text-slate-600" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title */}
        <div className="flex-1 text-center">
          <h2 className="text-sm sm:text-base font-semibold text-purple-600">
            Add New Candidate
          </h2>
        </div>

        {/* Right: spacer to balance layout */}
        <div className="w-10 sm:w-16" />
      </div>

      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* Name of Candidate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Name of Candidate
          </label>
          <input
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="Enter candidate name"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Mobile */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Mobile
          </label>
          <input
            type="tel"
            value={form.mobile}
            onChange={handleChange('mobile')}
            placeholder="Enter mobile number"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Password with random generator + show/hide icon - 6 chars (numbers/symbols) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Password
          </label>
          <div className="flex items-stretch">
            <input
              type={showPassword ? 'text' : 'password'}
              maxLength={6}
              value={form.password}
              onChange={handleChange('password')}
              placeholder="6 chars (0-9 or symbols)"
              className="flex-1 rounded-l-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="inline-flex items-center justify-center border-y border-slate-200 bg-slate-50 px-2 text-[11px] sm:text-xs text-slate-700 hover:bg-slate-100"
            >
              Random
            </button>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="inline-flex items-center justify-center rounded-r-md border border-l-0 border-slate-200 bg-slate-50 px-3 text-slate-500 hover:bg-slate-100"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <i className="fa-solid fa-eye-slash" aria-hidden="true" /> : <i className="fa-solid fa-eye" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Spacer to keep 3 fields on first row in 4-column layout */}
        <div className="hidden md:block" />

        {/* Technology (custom multi-select dropdown, tags inside input like screenshot) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Technology
          </label>
          <div ref={techDropdownRef} className="relative">
            {/* Visible input box with tags */}
            <div
              className="w-full flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 cursor-pointer focus-within:ring-2 focus-within:ring-purple-200"
              onClick={() => {
                setShowTechDropdown((v) => !v);
                setTechSearch('');
              }}
            >
              <div className="flex flex-wrap gap-1 flex-1 min-h-[30px] items-center">
                {form.technology.length ? (
                  form.technology.map((tech) => (
                    <button
                      key={tech}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTechOption(tech);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-800"
                    >
                      <span>{tech}</span>
                      <span className="text-slate-500 text-[10px]">×</span>
                    </button>
                  ))
                ) : (
                  <span className="text-slate-400 text-xs sm:text-sm">
                    Choose Technologies...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 pl-2">
                {form.technology.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm((prev) => ({ ...prev, technology: [] }));
                    }}
                    className="text-slate-500 text-sm font-semibold hover:text-slate-700 px-1"
                    aria-label="Clear technologies"
                  >
                    ×
                  </button>
                )}
                <i className="fa-solid fa-chevron-down text-slate-400 text-xs" aria-hidden="true" />
              </div>
            </div>
            {showTechDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
                <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-2">
                  <input
                    type="text"
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                    placeholder="Search technology..."
                    autoFocus
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                {filteredTechOptions.length ? (
                  filteredTechOptions.map((opt) => {
                    const selected = form.technology.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          toggleTechOption(opt);
                          setShowTechDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs sm:text-sm border-b border-slate-100 last:border-b-0 ${
                          selected
                            ? 'bg-sky-100 text-slate-900'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    No matching technologies
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Referred By (single-select) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Referred By
          </label>
          <select
            value={form.referredBy}
            onChange={handleChange('referredBy')}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
          >
            <option value="">Select Referred By</option>
            <option value="Anil Shinde Sir">Anil Shinde Sir</option>
            <option value="Viraj Kadam Sir">Viraj Kadam Sir</option>
            <option value="Nilesh Sir">Nilesh Sir</option>
            <option value="Vishal Sir">Vishal Sir</option>
          </select>
        </div>

        {/* Experience - required, 0–20, digits and decimal only */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Experience
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.experience}
            onChange={handleChange('experience')}
            placeholder="0–20 (e.g., 2 or 2.5)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 justify-center rounded-full bg-emerald-500 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-70"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
          </span>
          <span>{loading ? 'Adding…' : 'Add Candidate'}</span>
        </button>
      </div>
    </form>
  );
}

const EDIT_TECH_OPTIONS = [
  'PHP',
  '.net Devloper',
  'Python',
  'Data Science',
  'MERN Stack',
  'MEAN Stack',
  'Java',
  'React Devloper',
  'App Support',
  'Busness Analyst',
  'Manual Testing',
  'Automation Testing',
  'DevOps(AWG)',
  'DevOps(Azure)',
  'Data Analysts',
  'AEM',
  'Power BI',
  'Other',
];

function AdminEditCandidateForm({ candidate, onBack, onSubmit }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: candidate?.name || '',
    mobile: candidate?.mobile || '',
    experience: candidate?.experience || '',
    password: String(candidate?.password ?? '').trim(),
    technology: Array.isArray(candidate?.technologies) ? [...candidate.technologies] : [],
    referredBy: candidate?.referredBy || 'Viraj Kadam Sir',
    selected: candidate?.selected ?? false,
    selectedDate: candidate?.selectedDate || '',
    joiningDate: candidate?.joiningDate || '',
    selectedCompany: candidate?.selectedCompany || '',
    package: candidate?.package || '',
  });
  const [showPassword, setShowPassword] = useState(true);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  const techDropdownRef = useRef(null);
  const [techSearch, setTechSearch] = useState('');

  useEffect(() => {
    if (candidate) {
      setForm({
        name: candidate.name || '',
        mobile: candidate.mobile || '',
        experience: candidate.experience || '',
        password: String(candidate.password ?? '').trim(),
        technology: Array.isArray(candidate.technologies) ? [...candidate.technologies] : [],
        referredBy: candidate.referredBy || 'Viraj Kadam Sir',
        selected: candidate.selected ?? false,
        selectedDate: candidate.selectedDate || '',
        joiningDate: candidate.joiningDate || '',
        selectedCompany: candidate.selectedCompany || '',
        package: candidate.package || '',
      });
    }
  }, [candidate]);

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'mobile') {
      value = value.replace(/\D/g, '');
    } else if (field === 'password') {
      // Allow digits and symbols, max 6 characters (no letters)
      value = value.replace(/[a-zA-Z]/g, '').slice(0, 6);
    } else if (field === 'experience') {
      value = value.replace(/[^\d.]/g, '');
      let parts = value.split('.');
      if (parts.length > 2) {
        parts = [parts[0], parts.slice(1).join('')];
      }
      if (parts.length === 2 && parts[1].length > 1) {
        parts[1] = parts[1].slice(0, 1);
      }
      value = parts.join('.');
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTechOption = (value) => {
    setForm((prev) => {
      const exists = prev.technology.includes(value);
      return {
        ...prev,
        technology: exists
          ? prev.technology.filter((v) => v !== value)
          : [...prev.technology, value],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedPassword = form.password?.trim();
    if (!trimmedPassword) {
      setError('Password is required.');
      return;
    }
    if (/[a-zA-Z]/.test(trimmedPassword) || trimmedPassword.length !== 6) {
      setError('Password must be exactly 6 characters (numbers and symbols only).');
      return;
    }

    const trimmedExperience = form.experience?.trim();
    if (!trimmedExperience) {
      setError('Experience is required.');
      return;
    }
    const validExpPattern = /^\d+(\.\d)?$/;
    if (!validExpPattern.test(trimmedExperience)) {
      setError('Experience must be a number between 0 and 20 with at most one decimal place.');
      return;
    }
    const expNum = parseFloat(trimmedExperience);
    if (Number.isNaN(expNum) || expNum < 0 || expNum > 20) {
      setError('Experience must be a number between 0 and 20 with at most one decimal place.');
      return;
    }

    // Basic validation for selected fields
    if (form.selected) {
      if (!form.selectedDate || !form.joiningDate || !form.selectedCompany || !form.package) {
        // Rely on parent to show a generic error if needed; keep UI unchanged.
        // eslint-disable-next-line no-console
        console.warn('Selected candidate requires date, company, package, and joining date.');
        onSubmit(form);
        return;
      }
    }

    try {
      const techString = form.technology.join(', ');
      const selectedPackage = form.package || '';

      const candidateData = {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        password: trimmedPassword,
        approvedByAdmin: true,
        technology: techString,
        refereedBy: form.referredBy,
        referredBy: form.referredBy,
        experience: form.experience?.trim() || '',
        isActive: true,
        isSelected: !!form.selected,
        selectedDate: form.selected ? form.selectedDate : '',
        selectedCompany: form.selected ? form.selectedCompany : '',
        selectedPackage: form.selected ? (selectedPackage || '') : '',
        joiningDate: form.selected ? form.joiningDate : '',
      };

      if (candidate?.firestoreId) {
        await updateDoc(doc(db, 'candidates', candidate.firestoreId), candidateData);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to update candidate in Firestore:', err);
    }

    onSubmit(form);
  };

  const techOptions = [...new Set([...form.technology, ...EDIT_TECH_OPTIONS])];

  const filteredTechOptions = useMemo(() => {
    const q = techSearch.trim().toLowerCase();
    if (!q) return techOptions;
    return techOptions.filter((t) => String(t).toLowerCase().includes(q));
  }, [techOptions, techSearch]);

  useEffect(() => {
    if (!showTechDropdown) return;

    const onMouseDown = (event) => {
      if (techDropdownRef.current && !techDropdownRef.current.contains(event.target)) {
        setShowTechDropdown(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowTechDropdown(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showTechDropdown]);

  useEffect(() => {
    if (!showTechDropdown) setTechSearch('');
  }, [showTechDropdown]);

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6"
    >
      {/* Header: grey back button left, title centered */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 text-center">
          <h2 className="text-sm sm:text-base font-semibold text-purple-600">
            Edit {form.name ? form.name : 'Name of Candidate'}
          </h2>
        </div>

        <div className="w-10 sm:w-16" />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* Name of Candidate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Name of Candidate
          </label>
          <input
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="Enter candidate name"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Mobile */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Mobile
          </label>
          <input
            type="tel"
            value={form.mobile}
            onChange={handleChange('mobile')}
            placeholder="Enter mobile number"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Password with show/hide toggle - 6 digits only (mandatory) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Password
          </label>
          <div className="flex items-stretch">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange('password')}
              placeholder="Numbers and symbols only"
              className="flex-1 rounded-l-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 rounded-r-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="inline-flex items-center justify-center rounded-r-md border border-l-0 border-slate-200 bg-slate-50 px-3 text-slate-500 hover:bg-slate-100"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <i className="fa-solid fa-eye-slash" aria-hidden="true" /> : <i className="fa-solid fa-eye" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Spacer so first row is: Name, Mobile, Password */}
        <div className="hidden md:block" />

        {/* Technology (multi-select with tags) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Technology
          </label>
          <div ref={techDropdownRef} className="relative">
            <div
              className="w-full flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 cursor-pointer focus-within:ring-2 focus-within:ring-purple-200"
              onClick={() => {
                setShowTechDropdown((v) => !v);
                setTechSearch('');
              }}
            >
              <div className="flex flex-wrap gap-1 flex-1 min-h-[30px] items-center">
                {form.technology.length ? (
                  form.technology.map((tech) => (
                    <button
                      key={tech}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTechOption(tech);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-800"
                    >
                      <span>{tech}</span>
                      <span className="text-slate-500 text-[10px]">×</span>
                    </button>
                  ))
                ) : (
                  <span className="text-slate-400 text-xs sm:text-sm">
                    Choose Technologies...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 pl-2">
                {form.technology.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm((prev) => ({ ...prev, technology: [] }));
                    }}
                    className="text-slate-500 text-sm font-semibold hover:text-slate-700 px-1"
                    aria-label="Clear technologies"
                  >
                    ×
                  </button>
                )}
                <i className="fa-solid fa-chevron-down text-slate-400 text-xs" aria-hidden="true" />
              </div>
            </div>
            {showTechDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
                <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-2">
                  <input
                    type="text"
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                    placeholder="Search technology..."
                    autoFocus
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                {filteredTechOptions.length ? (
                  filteredTechOptions.map((opt) => {
                    const selected = form.technology.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleTechOption(opt)}
                        className={`w-full text-left px-3 py-1.5 text-xs sm:text-sm border-b border-slate-100 last:border-b-0 ${
                          selected
                            ? 'bg-sky-100 text-slate-900'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    No matching technologies
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Normal form: Referred By dropdown - only when NOT selected */}
        {!form.selected && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              <span className="text-red-500">*</span> Referred By
            </label>
            <select
              value={form.referredBy}
              onChange={handleChange('referredBy')}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              <option value="">Select Referred By</option>
              <option value="Anil Shinde Sir">Anil Shinde Sir</option>
              <option value="Viraj Kadam Sir">Viraj Kadam Sir</option>
              <option value="Nilesh Sir">Nilesh Sir</option>
              <option value="Vishal Sir">Vishal Sir</option>
            </select>
          </div>
        )}

        {/* Experience - required, 0–20, digits and decimal only */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            <span className="text-red-500">*</span> Experience
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.experience}
            onChange={handleChange('experience')}
            placeholder="0–20 (e.g., 2 or 2.5)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Selected toggle - always visible (placed last in second row) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700">
            Selected
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={form.selected}
              onClick={() => setForm((prev) => ({ ...prev, selected: !prev.selected }))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-purple-200 focus:ring-offset-2 ${
                form.selected ? 'bg-purple-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                  form.selected ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-[11px] text-slate-600">
              {form.selected ? 'Selected' : 'Not Selected'}
            </span>
          </div>
        </div>
      </div>

      {/* Selected form: extra fields - only when Selected is ON */}
      {form.selected && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start mt-4 pt-4 border-t border-slate-200">
          {/* Selected Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              <span className="text-red-500">*</span> Selected Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={form.selectedDate}
                onChange={handleChange('selectedDate')}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 pr-9 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          {/* Joining Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              <span className="text-red-500">*</span> Joining Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={form.joiningDate}
                onChange={handleChange('joiningDate')}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 pr-9 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          {/* Selected Company */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              Selected Company
            </label>
            <input
              type="text"
              value={form.selectedCompany}
              onChange={handleChange('selectedCompany')}
              placeholder="Enter company name"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          {/* Package */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              <span className="text-red-500">*</span> Package
            </label>
            <input
              type="text"
              value={form.package}
              onChange={handleChange('package')}
              placeholder="Enter package amount"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          {/* Referred By - in selected view */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              <span className="text-red-500">*</span> Referred By
            </label>
            <select
              value={form.referredBy}
              onChange={handleChange('referredBy')}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              <option value="">Select Referred By</option>
              <option value="Anil Shinde Sir">Anil Shinde Sir</option>
              <option value="Viraj Kadam Sir">Viraj Kadam Sir</option>
              <option value="Nilesh Sir">Nilesh Sir</option>
              <option value="Vishal Sir">Vishal Sir</option>
            </select>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 justify-center rounded-full bg-sky-500 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-sky-600"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 border border-white/40">
            <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
          </span>
          <span>Update Candidate</span>
        </button>
      </div>
    </form>
  );
}

function AdminSlotsTable({
  slots,
  filter,
  search,
  onChangeFilter,
  onChangeSearch,
  onBackToHome,
  onApproveSlot,
  onRejectSlot,
  onDeleteSlot,
  onOpenCandidateSlots,
  onOpenHRView,
  hrs = [],
  loading = false,
  error = null,
  stats = null,
}) {
  // Default to this week (dropdown default), matching your request
  const [timeRange, setTimeRange] = useState('thisWeek');
  const [companyFilter, setCompanyFilter] = useState('');
  const [technologyFilter, setTechnologyFilter] = useState('');
  const [roundFilter, setRoundFilter] = useState('');
  const [hrFilter, setHrFilter] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showTechnologyDropdown, setShowTechnologyDropdown] = useState(false);
  const [showRoundDropdown, setShowRoundDropdown] = useState(false);
  const [showHrDropdown, setShowHrDropdown] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [technologySearch, setTechnologySearch] = useState('');
  const [roundSearch, setRoundSearch] = useState('');
  const [hrSearch, setHrSearch] = useState('');
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState(null);
  const [confirmDeleteSlotName, setConfirmDeleteSlotName] = useState('');

  const companyOptions = useMemo(() => {
    const set = new Set();
    slots.forEach((slot) => {
      const company = String(slot.company || slot.companyName || '').trim();
      if (!company) return;
      set.add(company);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const technologyOptions = useMemo(() => {
    const set = new Set();
    slots.forEach((slot) => {
      const tech = String(slot.technology || '').trim();
      if (!tech) return;
      set.add(tech);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const roundOptions = useMemo(() => {
    const set = new Set();
    slots.forEach((slot) => {
      const round = normaliseRoundLabelAdmin(slot.round);
      if (!round) return;
      set.add(round);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const hrOptions = useMemo(() => {
    const set = new Set();
    slots.forEach((slot) => {
      const hrName = String(slot.hrName || '').trim();
      if (!hrName) return;
      set.add(hrName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const filtersRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
        setShowTechnologyDropdown(false);
        setShowRoundDropdown(false);
        setShowHrDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const filteredCompanyOptions = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companyOptions;
    return companyOptions.filter((c) => c.toLowerCase().includes(q));
  }, [companyOptions, companySearch]);

  const filteredTechnologyOptions = useMemo(() => {
    const q = technologySearch.trim().toLowerCase();
    if (!q) return technologyOptions;
    return technologyOptions.filter((t) => t.toLowerCase().includes(q));
  }, [technologyOptions, technologySearch]);

  const filteredRoundOptions = useMemo(() => {
    const q = roundSearch.trim().toLowerCase();
    if (!q) return roundOptions;
    return roundOptions.filter((r) => r.toLowerCase().includes(q));
  }, [roundOptions, roundSearch]);

  const filteredHrOptions = useMemo(() => {
    const q = hrSearch.trim().toLowerCase();
    if (!q) return hrOptions;
    return hrOptions.filter((h) => h.toLowerCase().includes(q));
  }, [hrOptions, hrSearch]);

  const dropdownFilteredSlots = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMonday = (day + 6) % 7; // days since Monday
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    return slots.filter((slot) => {
      const company = String(slot.company || slot.companyName || '').trim();
      const tech = String(slot.technology || '').trim();
      const round = normaliseRoundLabelAdmin(slot.round);
      const hrName = String(slot.hrName || '').trim();

      if (timeRange === 'thisWeek' || timeRange === 'lastWeek') {
        const d =
          slot.date instanceof Date
            ? slot.date
            : new Date(slot.date);
        if (Number.isNaN(d.getTime())) return false;
        const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

        if (timeRange === 'thisWeek') {
          // Full current calendar week (Mon–Sun)
          if (!(dateOnly >= startOfWeek && dateOnly < startOfNextWeek)) return false;
        } else if (timeRange === 'lastWeek') {
          if (!(dateOnly >= startOfLastWeek && dateOnly < startOfWeek)) return false;
        }
      }

      if (companyFilter && company !== companyFilter) return false;
      if (technologyFilter && tech !== technologyFilter) return false;
      if (roundFilter && round !== roundFilter) return false;
      if (hrFilter && hrName !== hrFilter) return false;
      return true;
    });
  }, [slots, companyFilter, technologyFilter, roundFilter, hrFilter, timeRange]);

  const approvedFilteredSlots = useMemo(
    () => dropdownFilteredSlots.filter((slot) => slot.status === 'Approved'),
    [dropdownFilteredSlots],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalItems = dropdownFilteredSlots.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedSlots = useMemo(
    () => dropdownFilteredSlots.slice(startIdx, startIdx + itemsPerPage),
    [dropdownFilteredSlots, startIdx, itemsPerPage],
  );

  const displayedLastWeek =
    timeRange === 'lastWeek'
      ? approvedFilteredSlots.length
      : stats?.lastWeek ?? 0;
  const displayedThisWeek =
    timeRange === 'thisWeek'
      ? approvedFilteredSlots.length
      : stats?.thisWeek ?? 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [dropdownFilteredSlots.length]);

  return (
    <div className="bg-white rounded-lg sm:rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header row with back + title */}
      <div className="flex items-center justify-between mb-2 gap-3">
        {/* Left: back button only */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title + refresh (refresh on right side of text) */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-purple-600">
            Slots
          </span>
          <button
            type="button"
            onClick={() => {
              onChangeFilter('all');
              onChangeSearch('');
              setTimeRange('thisWeek');
              setCompanyFilter('');
              setTechnologyFilter('');
              setRoundFilter('');
              setHrFilter('');
              setCompanySearch('');
              setTechnologySearch('');
              setRoundSearch('');
              setHrSearch('');
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Refresh"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Right: empty spacer */}
        <div className="w-32 sm:w-40" />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Metrics + Filters: always two rows — counts (row 1) and filters (row 2) */}
      <div className="mb-4 flex flex-col gap-3">
        {/* Left: metrics - stacked number + label like screenshot */}
        <div className="flex flex-wrap gap-6 text-xs sm:text-sm text-slate-700">
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {approvedFilteredSlots.length}
            </span>
            <span className="text-[11px] text-slate-500">Total Slots</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {displayedLastWeek}
            </span>
            <span className="text-[11px] text-slate-500">Last Week</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {displayedThisWeek}
            </span>
            <span className="text-[11px] text-slate-500">This Week</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {stats?.avgPerWeek ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">Avg/Week</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {stats?.avgPerDay ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">Avg/Day</span>
          </div>
        </div>

        {/* Right: filters */}
        <div
          className="flex flex-wrap items-center justify-end gap-2 sm:gap-3"
          ref={filtersRef}
        >
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-700"
            aria-label="Filter by time range"
          >
            <option value="thisWeek">This Week</option>
            <option value="lastWeek">Last Week</option>
            <option value="all">All</option>
          </select>

          {/* Company searchable dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowCompanyDropdown((v) => !v);
                setShowTechnologyDropdown(false);
                setShowRoundDropdown(false);
                setShowHrDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
              aria-label="Filter by company"
            >
              <span className="truncate">
                {companyFilter ? toTitleCase(companyFilter) : 'Company'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {companyFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompanyFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setCompanyFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear company filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showCompanyDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1 border-b border-slate-100 bg-slate-50">
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Search company..."
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                  />
                </div>
                {filteredCompanyOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setCompanyFilter(opt);
                      setShowCompanyDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      companyFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Technology searchable dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTechnologyDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowRoundDropdown(false);
                setShowHrDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
              aria-label="Filter by technology"
            >
              <span className="truncate">
                {technologyFilter ? toTitleCase(technologyFilter) : 'Technology'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {technologyFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTechnologyFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setTechnologyFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear technology filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showTechnologyDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1 border-b border-slate-100 bg-slate-50">
                  <input
                    type="text"
                    value={technologySearch}
                    onChange={(e) => setTechnologySearch(e.target.value)}
                    placeholder="Search tech..."
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                  />
                </div>
                {filteredTechnologyOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setTechnologyFilter(opt);
                      setShowTechnologyDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      technologyFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Round searchable dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowRoundDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowTechnologyDropdown(false);
                setShowHrDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
              aria-label="Filter by round"
            >
              <span className="truncate">
                {roundFilter ? toTitleCase(roundFilter) : 'Round'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {roundFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRoundFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setRoundFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear round filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showRoundDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1 border-b border-slate-100 bg-slate-50">
                  <input
                    type="text"
                    value={roundSearch}
                    onChange={(e) => setRoundSearch(e.target.value)}
                    placeholder="Search round..."
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                  />
                </div>
                {filteredRoundOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setRoundFilter(opt);
                      setShowRoundDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      roundFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* HR searchable dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowHrDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowTechnologyDropdown(false);
                setShowRoundDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
              aria-label="Filter by HR"
            >
              <span className="truncate">
                {hrFilter ? toTitleCase(hrFilter) : 'HR'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {hrFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHrFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setHrFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear HR filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showHrDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1 border-b border-slate-100 bg-slate-50">
                  <input
                    type="text"
                    value={hrSearch}
                    onChange={(e) => setHrSearch(e.target.value)}
                    placeholder="Search HR..."
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                  />
                </div>
                {filteredHrOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setHrFilter(opt);
                      setShowHrDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      hrFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={filter}
            onChange={(e) => onChangeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-700"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <div className="relative w-32 sm:w-40">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search slot"
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white pl-7 pr-3 py-1.5 text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
        </div>
      </div>

      {/* Slots table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Loading slots...</p>
          </div>
        </div>
      ) : dropdownFilteredSlots.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">No slots found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs sm:text-sm border border-slate-200">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200 w-10">
                  Sr.
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200 min-w-[90px]" style={{ textAlign: 'left' }}>
                  Name
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Company Name
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Technology
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200 min-w-[200px]">
                  HR
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Round
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Created At
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Slot Date Time
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Status
                </th>
                <th className="px-3 py-2 text-center font-semibold border-b border-slate-200">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedSlots.map((slot, index) => {
                const status = String(slot.status || '').trim();
                const isPending =
                  status === 'Pending' ||
                  status === 'pending' ||
                  status === 'Pending Approval';
                const isApproved = slot.status === 'Approved';
                const isRejected = slot.status === 'Rejected';

                const statusIconClass = isApproved
                  ? 'fa-solid fa-circle-check text-emerald-500'
                  : isRejected
                  ? 'fa-solid fa-circle-xmark text-red-500'
                  : 'fa-solid fa-clock text-amber-500';

                const statusTextClass = isApproved
                  ? 'text-emerald-600'
                  : isRejected
                  ? 'text-red-600'
                  : 'text-slate-800';
                
                const statusLabel = isApproved
                  ? 'Approved by Admin'
                  : isRejected
                  ? 'Rejected by Admin'
                  : 'Pending (Admin)';

                const slotDateStr =
                  slot.date instanceof Date ? slot.date.toISOString().slice(0, 10) : '';
                const isToday = slotDateStr === new Date().toISOString().slice(0, 10);

                const createdExactRaw = String(slot.createdAtExactLabel || '');
                const createdParts = createdExactRaw.split(',');
                const createdDatePart =
                  (createdParts[0] && createdParts[0].trim()) || slot.createdAtLabel || '-';
                const createdTimePart =
                  createdParts.length > 1 && createdParts[1] && createdParts[1].trim()
                    ? createdParts[1].trim()
                    : '';

                const approvedExactRaw = String(slot.updatedAtExactLabel || '');
                const approvedParts = approvedExactRaw.split(',');
                const approvedDatePart =
                  (approvedParts[0] && approvedParts[0].trim()) || slot.updatedAtLabel || '';
                const approvedTimePart =
                  approvedParts.length > 1 && approvedParts[1] && approvedParts[1].trim()
                    ? approvedParts[1].trim()
                    : '';

                const slotId = slot.firestoreId || slot.id;
                return (
                  <tr
                    key={slotId}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                      {startIdx + index + 1}
                    </td>
                    <td className="px-3 py-2 text-slate-700 text-left border-r border-slate-200 min-w-[90px]" style={{ textAlign: 'left' }}>
                      {slot.candidateName || slot.name ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCandidateSlots &&
                            onOpenCandidateSlots((slot.candidateName || slot.name || '').trim())
                          }
                          className="text-purple-600 font-semibold hover:text-purple-800 hover:underline focus:outline-none focus:underline text-left"
                          style={{ textAlign: 'left' }}
                        >
                          {slot.candidateName || slot.name}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {slot.company || slot.companyName || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {slot.technology || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {(() => {
                        const fallbackHrName = (slot.hrName || '').trim();
                        const fromList =
                          hrs.find(
                            (h) =>
                              (h.name || '').trim().toLowerCase() ===
                              fallbackHrName.toLowerCase(),
                          ) || null;

                        const hrName = fallbackHrName || (fromList?.name || '').trim();
                        const hrMobile =
                          (slot.hrMobile || '').trim() || (fromList?.mobile || '').trim();
                        const hrEmail =
                          (slot.hrEmail || '').trim() || (fromList?.email || '').trim();

                        if (!hrName && !hrMobile && !hrEmail) {
                          return <span className="text-slate-400">-</span>;
                        }

                        const hrLinkClass =
                          'text-purple-600 font-semibold hover:text-purple-800 hover:underline focus:outline-none focus:underline cursor-pointer';

                        const renderValue = (value, onClick) => {
                          if (!value) return null;
                          if (!onOpenHRView || value === '-') {
                            return <span>{value}</span>;
                          }
                          return (
                            <button
                              type="button"
                              onClick={onClick}
                              className={hrLinkClass}
                            >
                              {value}
                            </button>
                          );
                        };

                        return (
                          <div className="flex flex-col gap-1">
                            {hrName && (
                              <div className="flex items-center gap-1.5">
                                <i
                                  className="fa-solid fa-user-tie text-slate-500 w-3.5"
                                  aria-hidden="true"
                                />
                                {renderValue(hrName, () => onOpenHRView(hrName))}
                              </div>
                            )}
                            {hrMobile && (
                              <div className="flex items-center gap-1.5">
                                <i
                                  className="fa-solid fa-phone text-slate-500 w-3.5"
                                  aria-hidden="true"
                                />
                                {renderValue(hrMobile, () => onOpenHRView(hrMobile))}
                              </div>
                            )}
                            {hrEmail && (
                              <div className="flex items-center gap-1.5">
                                <i
                                  className="fa-solid fa-envelope text-slate-500 w-3.5"
                                  aria-hidden="true"
                                />
                                {hrEmail === '-' || !onOpenHRView ? (
                                  <span title={hrEmail}>{hrEmail}</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onOpenHRView(hrEmail)}
                                    className={hrLinkClass}
                                    title={hrEmail}
                                  >
                                    {hrEmail}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {normaliseRoundLabelAdmin(slot.round) || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      <div className="flex flex-col">
                        <span>{createdDatePart || '-'}</span>
                        {createdTimePart && (
                          <span className="text-[11px] text-slate-500">
                            {createdTimePart}
                          </span>
                        )}
                        </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      <div className="flex flex-col">
                        <span>
                          {slot.dateExactLabel || slot.dateLabel || '-'}
                          {isToday && (
                            <span className="text-emerald-600 font-semibold ml-1">
                              (Today)
                          </span>
                          )}
                        </span>
                        {slot.timeLabel && (
                          <span className="text-[11px] text-slate-500">{slot.timeLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <i className={statusIconClass} aria-hidden="true" />
                          <span className={`text-xs font-semibold ${statusTextClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {isApproved && (approvedDatePart || approvedTimePart) && (
                          <span className="text-[11px] text-slate-500">
                            {approvedDatePart}
                            {approvedTimePart && `, ${approvedTimePart}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isPending ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onApproveSlot(slotId)}
                            className="inline-flex items-center gap-2 rounded bg-emerald-500 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-600"
                          >
                            <i className="fa-solid fa-check" aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            onClick={() => onRejectSlot(slotId)}
                            className="inline-flex items-center gap-2 rounded bg-red-500 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-red-600"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                            Reject
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                            onClick={() => {
                              setConfirmDeleteSlotId(slotId);
                              setConfirmDeleteSlotName(slot.candidateName || slot.company || '');
                            }}
                            aria-label="Delete"
                          >
                            <i className="fa-solid fa-trash" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                            onClick={() => {
                              setConfirmDeleteSlotId(slotId);
                              setConfirmDeleteSlotName(slot.candidateName || slot.company || '');
                            }}
                            aria-label="Delete"
                          >
                            <i className="fa-solid fa-trash" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && dropdownFilteredSlots.length > 0 && totalItems > itemsPerPage && (
        <PaginationBar
          totalItems={totalItems}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => {
            setItemsPerPage(n);
            setCurrentPage(1);
          }}
          label="Slots"
        />
      )}
      {/* Delete slot confirmation modal */}
      {confirmDeleteSlotId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setConfirmDeleteSlotId(null);
            setConfirmDeleteSlotName('');
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-6 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete this slot?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotName('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Slot for:{' '}
              <span className="font-semibold">
                {confirmDeleteSlotName || 'Candidate / Company'}
              </span>
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteSlot && confirmDeleteSlotId != null) {
                    onDeleteSlot(confirmDeleteSlotId);
                  }
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminHRsTable({
  hrs,
  totalCount,
  search,
  onBackToHome,
  onChangeSearch,
  onAddHR,
  onUpdateHR,
  onDeleteHR,
  onOpenCandidateView,
  candidateNames = [],
}) {
  const [companyFilter, setCompanyFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [addedByFilter, setAddedByFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    company: '',
    technology: '',
    jobType: '',
  });
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  const [showJobTypeDropdown, setShowJobTypeDropdown] = useState(false);
  const [showAddedByDropdown, setShowAddedByDropdown] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState('');
  const [hrFormErrors, setHrFormErrors] = useState({});

  const filtersRef = useRef(null);

  // Close HR filter dropdowns when clicking outside the filters area
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
        setShowTechDropdown(false);
        setShowJobTypeDropdown(false);
        setShowAddedByDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const companyOptions = useMemo(() => {
    const values = hrs
      .map((h) => (h.company || '').trim())
      .filter((c) => c);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [hrs]);
  const techOptions = useMemo(() => {
    const values = hrs
      .map((h) => (h.technology || '').trim())
      .filter((t) => t);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [hrs]);
  const jobTypeOptions = useMemo(() => {
    const values = hrs
      .map((h) => (h.jobType || '').trim())
      .filter((j) => j);
    // Dedupe case-insensitive (e.g. Hybrid + hybrid -> one)
    const byLower = new Map();
    values.forEach((v) => {
      const k = v.toLowerCase();
      if (!byLower.has(k)) byLower.set(k, v);
    });
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  }, [hrs]);
  const addedByOptions = useMemo(() => {
    const values = hrs
      .map((h) => (h.addedBy || '').trim())
      .filter((v) => v && v.toLowerCase() !== 'admin');
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [hrs]);

  const [companySearch, setCompanySearch] = useState('');
  const [technologySearch, setTechnologySearch] = useState('');
  const [addedBySearch, setAddedBySearch] = useState('');

  const filteredCompanyOptions = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companyOptions;
    return companyOptions.filter((c) => c.toLowerCase().includes(q));
  }, [companyOptions, companySearch]);
  const filteredTechnologyOptions = useMemo(() => {
    const q = technologySearch.trim().toLowerCase();
    if (!q) return techOptions;
    return techOptions.filter((t) => t.toLowerCase().includes(q));
  }, [techOptions, technologySearch]);
  const filteredAddedByOptions = useMemo(() => {
    const q = addedBySearch.trim().toLowerCase();
    if (!q) return addedByOptions;
    return addedByOptions.filter((v) => v.toLowerCase().includes(q));
  }, [addedByOptions, addedBySearch]);

  const filteredRows = useMemo(() => {
    const norm = (v) => String(v || '').trim().toLowerCase();
    return hrs.filter((hr) => {
      if (companyFilter && norm(hr.company) !== norm(companyFilter)) return false;
      if (techFilter && norm(hr.technology) !== norm(techFilter)) return false;
      if (jobTypeFilter && norm(hr.jobType) !== norm(jobTypeFilter)) return false;
      if (addedByFilter && norm(hr.addedBy) !== norm(addedByFilter)) return false;
      return true;
    });
  }, [hrs, companyFilter, techFilter, jobTypeFilter, addedByFilter]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalItems = filteredRows.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedRows = useMemo(
    () => filteredRows.slice(startIdx, startIdx + itemsPerPage),
    [filteredRows, startIdx, itemsPerPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredRows.length]);

  const handleChange = (field) => (e) => {
    let { value } = e.target;

    if (field === 'mobile') {
      // Digits only, max 10
      value = value.replace(/\D/g, '').slice(0, 10);
    }

    setForm((prev) => ({ ...prev, [field]: value }));
    setHrFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    const name = String(form.name || '').trim();
    const email = String(form.email || '').trim();
    const technology = String(form.technology || '').trim();
    const jobType = String(form.jobType || '').trim();
    const company = String(form.company || '').trim();
    const mobile = String(form.mobile || '').trim();

    if (!name) errors.name = 'This is required.';
    if (!email) {
      errors.email = 'This is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email.';
    }
    if (!technology) errors.technology = 'This is required.';
    if (!jobType) errors.jobType = 'This is required.';
    if (!company) errors.company = 'This is required.';
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) {
      errors.mobile = 'Enter valid 10-digit mobile number starting with 6-9.';
    }
    setHrFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (modalMode === 'edit' && onUpdateHR && editingId != null) {
      onUpdateHR(editingId, form);
    } else if (onAddHR) {
      onAddHR(form);
    }
    setForm({
      name: '',
      email: '',
      mobile: '',
      company: '',
      technology: '',
      jobType: '',
    });
    setEditingId(null);
    setShowAddModal(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header row - back + title + top-right buttons */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Left: back only */}
        <div className="flex items-start">
          <button
            onClick={onBackToHome}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title + refresh (refresh on right side of text) */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-purple-600">
            Hrs List
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Refresh"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Right: Add New HR – match candidate dashboard style */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setModalMode('add');
              setEditingId(null);
              setForm({
                name: '',
                email: '',
                mobile: '',
                company: '',
                technology: '',
                jobType: '',
              });
              setShowAddModal(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-semibold whitespace-nowrap"
          >
            + Add New HR
          </button>
        </div>
      </div>

      {/* Filters + total count row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Left: total HRs */}
        <div className="flex flex-col items-center leading-snug">
          <span className="text-base font-semibold text-slate-800">
            {totalCount}
          </span>
          <span className="text-[11px] text-slate-500">Total HRs</span>
        </div>

        {/* Right: filters row */}
        <div
          className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto"
          ref={filtersRef}
        >
          {/* Company filter dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowCompanyDropdown((v) => !v);
                setShowTechDropdown(false);
                setShowJobTypeDropdown(false);
                setShowAddedByDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
            >
              <span className="truncate">
                {companyFilter ? toTitleCase(companyFilter) : 'Company'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {companyFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompanyFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setCompanyFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear company filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showCompanyDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1.5 border-b border-slate-100 sticky top-0 bg-white">
                  <input
                    type="text"
                    placeholder="Search company..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    className="w-full rounded-full border border-slate-200 px-2 py-1 text-[11px] sm:text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-200"
                  />
                </div>
                {filteredCompanyOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setCompanyFilter(opt);
                      setCompanySearch('');
                      setShowCompanyDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      companyFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Technology filter dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTechDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowJobTypeDropdown(false);
                setShowAddedByDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
            >
              <span className="truncate">
                {techFilter ? toTitleCase(techFilter) : 'Technology'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {techFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTechFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setTechFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear technology filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showTechDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1.5 border-b border-slate-100 sticky top-0 bg-white">
                  <input
                    type="text"
                    placeholder="Search technology..."
                    value={technologySearch}
                    onChange={(e) => setTechnologySearch(e.target.value)}
                    className="w-full rounded-full border border-slate-200 px-2 py-1 text-[11px] sm:text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-200"
                  />
                </div>
                {filteredTechnologyOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setTechFilter(opt);
                      setTechnologySearch('');
                      setShowTechDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      techFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Job Type filter dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowJobTypeDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowTechDropdown(false);
                setShowAddedByDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
            >
              <span className="truncate">
                {jobTypeFilter ? toTitleCase(jobTypeFilter) : 'Job Type'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {jobTypeFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setJobTypeFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setJobTypeFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear job type filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showJobTypeDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setJobTypeFilter('');
                    setShowJobTypeDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 ${
                    !jobTypeFilter
                      ? 'bg-sky-100 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  All
                </button>
                {jobTypeOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setJobTypeFilter(opt);
                      setShowJobTypeDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      jobTypeFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Added By filter dropdown pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAddedByDropdown((v) => !v);
                setShowCompanyDropdown(false);
                setShowTechDropdown(false);
                setShowJobTypeDropdown(false);
              }}
              className="flex items-center h-8 w-36 sm:w-48 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
            >
              <span className="truncate">
                {addedByFilter ? toTitleCase(addedByFilter) : 'Added By'}
              </span>
              <span className="flex items-center gap-1 ml-2">
                {addedByFilter && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddedByFilter('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setAddedByFilter('');
                      }
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-base font-semibold cursor-pointer"
                    aria-label="Clear added by filter"
                  >
                    ×
                  </span>
                )}
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true" />
              </span>
            </button>
            {showAddedByDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
                <div className="px-2 py-1.5 border-b border-slate-100 sticky top-0 bg-white">
                  <input
                    type="text"
                    placeholder="Search added by..."
                    value={addedBySearch}
                    onChange={(e) => setAddedBySearch(e.target.value)}
                    className="w-full rounded-full border border-slate-200 px-2 py-1 text-[11px] sm:text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-200"
                  />
                </div>
                {filteredAddedByOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setAddedByFilter(opt);
                      setAddedBySearch('');
                      setShowAddedByDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 ${
                      addedByFilter === opt
                        ? 'bg-sky-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {toTitleCase(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search box */}
          <div className="relative w-40 sm:w-52">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search HRs"
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white pl-7 pr-3 py-1.5 text-[11px] sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
        </div>
      </div>

      {/* HRs table - styled like Candidates table card */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs sm:text-sm border border-slate-200">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200 w-10">
                Sr.
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Name
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Email
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Mobile
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Company
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Technology
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Job Type
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                Added By
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((hr, index) => (
              <tr
                key={hr.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                  {startIdx + index + 1}
                </td>
                <td className="px-3 py-2 text-slate-800 border-r border-slate-200">
                  {toTitleCase(hr.name || '')}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {hr.email}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {hr.mobile}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {toTitleCase(hr.company || '')}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {toTitleCase(hr.technology || '')}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {toTitleCase(hr.jobType || '')}
                </td>
                <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                  {(() => {
                    const addedByRaw = String(hr.addedBy || '').trim();
                    if (!addedByRaw) return '–';

                    const isAdminAdded = addedByRaw.toLowerCase() === 'admin';
                    const hasCandidate =
                      !isAdminAdded &&
                      Array.isArray(candidateNames) &&
                      candidateNames.includes(addedByRaw.toLowerCase());

                    if (isAdminAdded) {
                      return addedByRaw;
                    }

                    if (!hasCandidate) {
                      return '–';
                    }

                    if (onOpenCandidateView) {
                      return (
                        <button
                          type="button"
                          onClick={() => onOpenCandidateView(addedByRaw)}
                          className="text-purple-600 font-semibold hover:text-purple-800 hover:underline focus:outline-none focus:underline"
                        >
                          {addedByRaw}
                        </button>
                      );
                    }

                    return addedByRaw;
                  })()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModalMode('edit');
                        setEditingId(hr.id);
                        setForm({
                          name: hr.name || '',
                          email: hr.email || '',
                          mobile: hr.mobile || '',
                          company: hr.company || '',
                          technology: hr.technology || '',
                          jobType: hr.jobType || '',
                        });
                        setShowAddModal(true);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-white hover:bg-amber-500"
                      aria-label="Edit HR"
                    >
                      <i className="fa-solid fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                      onClick={() => {
                        setConfirmDeleteId(hr.id);
                        setConfirmDeleteName(hr.name || '');
                      }}
                      aria-label="Delete HR"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalItems > itemsPerPage && (
        <PaginationBar
          totalItems={totalItems}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => {
            setItemsPerPage(n);
            setCurrentPage(1);
          }}
          label="HRs"
        />
      )}
      {/* Delete confirmation modal */}
      {confirmDeleteId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setConfirmDeleteId(null);
            setConfirmDeleteName('');
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-6 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setConfirmDeleteName('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              HR:{' '}
              <span className="font-semibold">
                {confirmDeleteName || 'Unnamed'}
              </span>
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setConfirmDeleteName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteHR && confirmDeleteId != null) {
                    onDeleteHR(confirmDeleteId);
                  }
                  setConfirmDeleteId(null);
                  setConfirmDeleteName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New HR modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => setShowAddModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowAddModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-xl bg-white shadow-lg px-6 py-5"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">
                {modalMode === 'edit' ? 'Edit HR' : 'Add New HR'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            {/* Fields grid - arranged like reference screenshot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Row 1: HR Name | Technology */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  <span className="text-red-500">*</span> HR Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={handleChange('name')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Enter HR Name"
                />
                {hrFormErrors.name && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  <span className="text-red-500">*</span> Technology
                </label>
                <select
                  value={form.technology}
                  onChange={handleChange('technology')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  <option value="">Select Technology</option>
                  {techOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {hrFormErrors.technology && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.technology}</p>
                )}
              </div>

              {/* Row 2: Email | Mobile */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  <span className="text-red-500">*</span> Email
                </label>
                <input
                  type="text"
                  value={form.email}
                  onChange={handleChange('email')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Enter Email"
                />
                {hrFormErrors.email && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.email}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  Mobile
                </label>
                <input
                  type="text"
                  value={form.mobile}
                  onChange={handleChange('mobile')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Enter 10 digit mobile number"
                />
                {hrFormErrors.mobile && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.mobile}</p>
                )}
              </div>

              {/* Row 3: Job Type (same as email field) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  <span className="text-red-500">*</span> Job Type
                </label>
                <select
                  value={form.jobType}
                  onChange={handleChange('jobType')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  <option value="">Select Job Type</option>
                  {jobTypeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {hrFormErrors.jobType && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.jobType}</p>
                )}
              </div>

              {/* Row 4: Company Name full width */}
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-semibold text-slate-700">
                  <span className="text-red-500">*</span> Company Name
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={handleChange('company')}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Enter Company Name"
                />
                {hrFormErrors.company && (
                  <p className="mt-1 text-[11px] text-red-500">{hrFormErrors.company}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex justify-between">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
              >
                <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                Close
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 sm:px-5 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                <i className={`fa-solid ${modalMode === 'edit' ? 'fa-pen' : 'fa-plus'} text-xs`} aria-hidden="true" />
                {modalMode === 'edit' ? 'Update HR' : 'Add New HR'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Detailed view: all slots booked by a specific candidate (from Slots tab)
function AdminCandidateSlotsView({ data, onBack }) {
  const { name, candidate, slots } = data;

  const experience =
    candidate?.experience && String(candidate.experience).trim() && candidate.experience !== '-'
      ? candidate.experience
      : '0';
  const referredBy = candidate?.referredBy || 'Viraj Kadam Sir';
  const totalCount = slots.length || 0;
  const isSelectedCandidate = !!candidate?.selected;
  const formatCandidateDateDisplay = (raw) => {
    if (!raw || raw === '-') return '-';
    const formatted = formatDateDDMMYYYY(raw);
    return formatted || String(raw);
  };
  const selectedDate = formatCandidateDateDisplay(candidate?.selectedDate || '-');
  const joiningDate = formatCandidateDateDisplay(candidate?.joiningDate || '-');
  const selectedCompany = candidate?.selectedCompany || '-';
  const selectedPackage = candidate?.package || '-';

const normaliseRoundLabelAdmin = (raw) => {
  const r = String(raw || '').trim();
  if (!r) return '';
  const lower = r.toLowerCase();
  if (lower === 'round 1') return 'Technical Round 1';
  if (lower === 'round 2') return 'Technical Round 2';
  if (lower === 'round 3') return 'Technical Round 3';
  if (lower === 'manager round' || lower === 'managerial round') return 'Manageral Round';
  if (lower === 'technical discussion round') return 'Technical Round 2';
  if (lower === 'last technical round') return 'Technical Round 3';
  return r;
};

  const roundCounts = useMemo(() => {
    const counts = {};
    slots.forEach((slot) => {
      const round = normaliseRoundLabelAdmin(slot.round);
      if (!round) return;
      counts[round] = (counts[round] || 0) + 1;
    });
    return counts;
  }, [slots]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header row: back, title + reload center, referred by right */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-purple-600">
            Slot Book By {name}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Reload candidate slots"
          >
            <i className="fa-solid fa-rotate-right text-xs" aria-hidden="true" />
          </button>
        </div>

        <div className="text-[11px] sm:text-xs text-slate-600 whitespace-nowrap">
          Referred By:{' '}
          <span className="font-semibold text-slate-800">{referredBy}</span>
        </div>
      </div>

      {/* Summary row 1: core stats + company/package */}
      <div className="mb-2 flex flex-row flex-wrap items-stretch gap-4 sm:gap-6 text-slate-700">
        <div className="flex flex-col items-center text-center min-w-[120px]">
          <span className="text-sm font-semibold text-slate-800">
            {experience} yrs
          </span>
          <span className="text-[11px] text-slate-500">Experience</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">{totalCount}</span>
          <span className="text-[11px] text-slate-500">Total Slots Booked</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['Technical Round 1'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">Technical Round 1</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['Technical Round 2'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">Technical Round 2</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['Technical Round 3'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">Technical Round 3</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['Manageral Round'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">Manageral Round</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['HR Round'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">HR Round</span>
        </div>
        <div className="flex flex-col items-center text-center min-w-[140px]">
          <span className="text-sm font-semibold text-slate-800">
            {roundCounts['Task Assesment'] || 0}
          </span>
          <span className="text-[11px] text-slate-500">Task Assesment</span>
        </div>
        {/* Selected candidate details moved to row 2 */}
      </div>

      {/* Summary row 2: selected/joining dates (only for selected candidates) */}
      {isSelectedCandidate && (
        <div className="mb-4 flex flex-row flex-wrap items-stretch gap-4 sm:gap-6 text-slate-700">
          <div className="flex flex-col items-center text-center min-w-[140px]">
            <span className="text-sm font-semibold text-slate-800">
              {selectedDate}
            </span>
            <span className="text-[11px] text-slate-500">Selected Date</span>
          </div>
          <div className="flex flex-col items-center text-center min-w-[140px]">
            <span className="text-sm font-semibold text-slate-800">
              {joiningDate}
            </span>
            <span className="text-[11px] text-slate-500">Joining Date</span>
          </div>
          <div className="flex flex-col items-center text-center min-w-[140px]">
            <span className="text-sm font-semibold text-slate-800">
              {selectedCompany}
            </span>
            <span className="text-[11px] text-slate-500">Selected Company</span>
          </div>
          <div className="flex flex-col items-center text-center min-w-[140px]">
            <span className="text-sm font-semibold text-slate-800">
              {selectedPackage} LPA
            </span>
            <span className="text-[11px] text-slate-500">Package</span>
          </div>
        </div>
      )}

      {/* Slots cards: 4-column grid on large screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {slots.map((slot) => {
          const isApproved = slot.status === 'Approved';
          const isRejected = slot.status === 'Rejected';
          const timeLabelPlain = String(slot.timeLabel || '').split('(')[0].trim();

          return (
            <div
              key={slot.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 text-xs sm:text-sm text-slate-700 flex flex-col gap-1.5"
            >
              <div className="flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div>
                    <div className="font-semibold text-slate-900">{slot.company}</div>
                    <div className="text-[11px] text-slate-500">Company</div>
                  </div>

                  <div className="mt-1">
                    <div className="text-slate-800">{slot.technology}</div>
                    <div className="text-[11px] text-slate-500">Technology</div>
                  </div>

                  <div className="mt-1">
                    <div className="text-slate-800">{normaliseRoundLabelAdmin(slot.round)}</div>
                    <div className="text-[11px] text-slate-500">Round</div>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-emerald-600 font-semibold">
                      {isApproved
                        ? 'Approved'
                        : isRejected
                        ? 'Rejected'
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Status</div>
                  <div className="mt-1">
                    <div className="text-slate-800">
                      {slot.dateExactLabel || slot.dateLabel}
                    </div>
                    <div className="text-[11px] text-slate-500">Date</div>
                  </div>
                  <div className="mt-1">
                    <div className="text-slate-800">{timeLabelPlain}</div>
                    <div className="text-[11px] text-slate-500">Time</div>
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-left">
                <div className="flex flex-col">
                  <span className="text-slate-800 text-xs sm:text-sm break-words">
                    {String(slot.feedback || '').trim() || '-'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Feedback
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminLeavesTable({ onBackToHome }) {
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaves, setLeaves] = useState([]);
  const leaveDateInputRef = useRef(null);
  const [confirmDeleteLeaveId, setConfirmDeleteLeaveId] = useState(null);
  const [confirmDeleteLeaveLabel, setConfirmDeleteLeaveLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    getLeaves().then((list) => {
      if (!cancelled) setLeaves(list);
    });
    return () => { cancelled = true; };
  }, []);

  const formatLeaveDate = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return isoDate;
    return formatDateDDMMYYYY(d);
  };

  const handleSaveLeave = async () => {
    if (!leaveDate) return;
    const dateLabel = formatLeaveDate(leaveDate);
    try {
      const id = await addLeaveToFirestore(leaveDate, dateLabel);
      setLeaves((prev) => [...prev, { id, date: leaveDate, dateLabel }]);
    setLeaveDate('');
    setShowAddLeave(false);
    } catch (err) {
      console.error('Failed to add leave:', err);
    }
  };

  const handleDeleteLeave = async (id) => {
    try {
      await deleteLeaveFromFirestore(id);
    setLeaves((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Failed to delete leave:', err);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalItems = leaves.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedLeaves = leaves.slice(startIdx, startIdx + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [leaves.length]);

  return (
    <div className="relative bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-3">
        {/* Left: back */}
        <div className="flex items-center">
          <button
            onClick={onBackToHome}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title + refresh (refresh on right side of text) */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs sm:text-sm font-semibold text-purple-600">
            Admin Leaves
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Refresh"
            onClick={() => {
              // simple refresh: no-op for now
            }}
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Right: add leave */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddLeave(true)}
            className="inline-flex items-center gap-2 rounded-md bg-lime-500 px-3 sm:px-4 py-2 text-[11px] sm:text-sm font-semibold text-white shadow hover:bg-lime-600 whitespace-nowrap"
          >
            <i className="fa-solid fa-plus w-4 h-4" aria-hidden="true" />
            Add Leave
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-indigo-50 text-slate-700">
              <th className="px-4 py-2 text-left font-semibold border-b border-slate-200">
                Date{' '}
                <span className="text-purple-500 text-xs align-middle">⇵</span>
              </th>
              <th className="px-4 py-2 text-right font-semibold border-b border-slate-200 w-28">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {leaves.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={2}>
                  No leaves found
                </td>
              </tr>
            ) : (
              paginatedLeaves.map((leave, index) => (
                <tr
                  key={leave.id}
                  className={`border-b border-slate-100 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3 text-slate-700">
                    {leave.dateLabel || leave.date}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteLeaveId(leave.id);
                        setConfirmDeleteLeaveLabel(leave.dateLabel || leave.date || '');
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-500 text-white text-xs hover:bg-red-600"
                      aria-label="Delete leave"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalItems > itemsPerPage && (
        <PaginationBar
          totalItems={totalItems}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => {
            setItemsPerPage(n);
            setCurrentPage(1);
          }}
          label="Leaves"
        />
      )}
      {/* Delete leave confirmation modal */}
      {confirmDeleteLeaveId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setConfirmDeleteLeaveId(null);
            setConfirmDeleteLeaveLabel('');
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-6 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete this leave?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteLeaveId(null);
                  setConfirmDeleteLeaveLabel('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Date:{' '}
              <span className="font-semibold">
                {confirmDeleteLeaveLabel || '-'}
              </span>
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteLeaveId(null);
                  setConfirmDeleteLeaveLabel('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = confirmDeleteLeaveId;
                  setConfirmDeleteLeaveId(null);
                  setConfirmDeleteLeaveLabel('');
                  if (id) {
                    await handleDeleteLeave(id);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Leave modal */}
      {showAddLeave && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => setShowAddLeave(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-5 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Add Leave
              </h3>
              <button
                type="button"
                onClick={() => setShowAddLeave(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            {/* Date field - native calendar icon only (right side) */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date
              </label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  ref={leaveDateInputRef}
                className="add-leave-date w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="mm/dd/yyyy"
                />
            </div>

            {/* Modal actions */}
            <div className="flex justify-between mt-2">
              <button
                type="button"
                onClick={() => setShowAddLeave(false)}
                className="rounded-md border border-slate-200 px-4 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveLeave}
                className="rounded-md bg-lime-500 px-5 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-lime-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bar graph for Statistics tab – Y-axis rotated "Total Slots", fixed 0–80 scale, grid, x-axis month labels
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHART_BODY_HEIGHT = 320;
const Y_AXIS_MAX = 80; // Fixed scale 0–80 so axis always matches requested range
const Y_TICKS = [0, 20, 40, 60, 80];

function AdminStatisticsChart({ slots = [], onReload }) {
  const monthlyStats = useMemo(() => {
    const getSlotDate = (slot) => {
      const raw = slot.date;
      if (!raw) return null;
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const now = new Date();
    const months = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const count = slots.filter((s) => {
        const slotD = getSlotDate(s);
        return slotD && slotD.getFullYear() === year && slotD.getMonth() === month;
      }).length;
      months.push({
        label: `${MONTH_LABELS[month]} ${year}`,
        value: count,
      });
    }
    return months;
  }, [slots]);

  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center justify-center gap-2">
        <h2 className="text-sm sm:text-base font-semibold text-slate-800">
          Statistic
        </h2>
        {typeof onReload === 'function' && (
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
            aria-label="Reload statistics"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[720px] flex gap-0">
          {/* Y-axis: rotated "Total Slots" + tick labels 0, 10, 20, ... 60 */}
          <div
            className="flex items-stretch shrink-0 pr-2"
            style={{ height: CHART_BODY_HEIGHT }}
          >
            {/* Rotated label – 90° counter-clockwise, vertical on left */}
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 28 }}
            >
              <span
                className="text-[11px] text-slate-600 font-medium whitespace-nowrap"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center center',
                }}
              >
                Total Slots
              </span>
            </div>
            {/* Tick labels aligned with grid: 0, 10, 20, 30, 40, 50, 60 */}
            <div
              className="flex flex-col justify-between py-0 shrink-0 pl-1"
              style={{ height: CHART_BODY_HEIGHT }}
            >
              {[...Y_TICKS].reverse().map((tick) => (
                <span key={tick} className="text-[10px] text-slate-500 tabular-nums">
                  {tick}
                </span>
              ))}
            </div>
            </div>

          {/* Chart area: horizontal grid lines at each tick + bars */}
          <div className="flex-1 min-w-0 flex flex-col border-l border-slate-200 pl-3">
            <div
              className="relative rounded-r-lg overflow-visible"
              style={{ height: CHART_BODY_HEIGHT }}
            >
              {/* Horizontal grid lines at 0, 10, 20, 30, 40, 50, 60 – light grey across full width */}
              <div className="absolute inset-0 flex flex-col pointer-events-none">
                {Y_TICKS.slice(1).reverse().map((_, i) => (
                  <div key={i} className="flex-1 border-t border-slate-200" />
                ))}
                <div className="flex-shrink-0 border-t border-slate-200" style={{ height: 0 }} />
              </div>

              {/* Bars – height scaled to fixed 0..60 scale + hover tooltip */}
              <div
                className="relative z-10 flex h-full items-end gap-0.5 w-full"
                style={{ height: CHART_BODY_HEIGHT }}
              >
                {monthlyStats.map((item, index) => {
                  const barHeight =
                    Y_AXIS_MAX > 0
                      ? (item.value / Y_AXIS_MAX) * CHART_BODY_HEIGHT
                      : 0;
                  const isHovered = hoveredIndex === index;
                return (
                  <div
                    key={item.label}
                      className="flex-1 min-w-0 flex flex-col items-center justify-end relative group"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {isHovered && (
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-1.5 rounded-md bg-slate-800/95 text-white text-xs font-medium whitespace-nowrap z-50 shadow-lg pointer-events-none"
                          role="tooltip"
                        >
                          {item.label}: {item.value} slot{item.value !== 1 ? 's' : ''}
                        </div>
                      )}
                      <div
                        className={`w-full max-w-[22px] rounded-t bg-indigo-500 ${isHovered ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                        style={{ height: `${Math.max(2, barHeight)}px`, minWidth: 14 }}
                      />
                  </div>
                );
              })}
            </div>
          </div>

            {/* X-axis: month labels centered under each bar, no axis label */}
            <div className="flex w-full pt-2 gap-0.5">
              {monthlyStats.map((item) => (
                <div
                  key={item.label}
                  className="flex-1 min-w-0 text-[10px] text-slate-500 text-center whitespace-nowrap"
                  style={{ minWidth: 14 }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  // Remember last opened tab across refreshes for admin
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = sessionStorage.getItem('sb_admin_active_tab');
      return stored || 'home';
    } catch {
      return 'home';
    }
  });
  const [hrBackTab, setHrBackTab] = useState('home');
  const [showAddForm, setShowAddForm] = useState(false);
  // Default to showing Unselected candidates, matching your other project
  const [candidateSelectionFilter, setCandidateSelectionFilter] = useState('unselected'); // 'selected' | 'unselected'
  const [candidateReferredByFilter, setCandidateReferredByFilter] = useState('all'); // 'all' | 'anil_sir' | 'viraj_sir' | 'nilesh_sir' | 'vishal_sir'
  const [candidateStatusFilter, setCandidateStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState(MOCK_CANDIDATES);
  const candidateByIdCacheRef = useRef(new Map());
  const hrByIdCacheRef = useRef(new Map());
  const [showHrSuccessToast, setShowHrSuccessToast] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarSelectedEvent, setCalendarSelectedEvent] = useState(null);
  const adminTodayLabel = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Load candidates from Firestore on mount.
  // Mirrors the working project logic: read directly from "candidates" only.
  useEffect(() => {
    const loadCandidatesFromFirestore = async () => {
      try {
        const snap = await getDocs(collection(db, 'candidates'));
        if (snap.empty) {
          setCandidates([]);
          return;
        }

        const list = snap.docs.map((docSnap) => {
          const d = docSnap.data() || {};

          // Normalise technology into array for this UI
          let technologies = [];
          if (Array.isArray(d.technology)) {
            technologies = d.technology;
          } else if (typeof d.technology === 'string' && d.technology.trim()) {
            technologies = d.technology.split(',').map((t) => t.trim()).filter(Boolean);
          }

          // Keep both spellings so filters work
          const referredBy = d.referredBy || d.refereedBy || '';

          return {
            id: docSnap.id,
            firestoreId: docSnap.id,
            sourceCollection: 'candidates',
            name: d.name || 'New Candidate',
            mobile: String(d.mobile ?? d.phone ?? '').trim(),
            experience: d.experience || d.totalExp || '0',
            technologies,
            totalScheduled: '0',
            lastInterview: '-',
            payment: typeof d.payment === 'number' ? `₹${d.payment}` : d.payment || '₹0',
            status: d.isActive === false ? 'Inactive' : 'Active',
            selected: !!d.isSelected,
            referredBy,
            password: String(d.password ?? '').trim(),
            // Selected candidate details (if present from Firestore)
            selectedDate: d.selectedDate || '',
            joiningDate: d.joiningDate || '',
            selectedCompany: d.selectedCompany || '',
            package: d.selectedPackage || d.package || '',
          };
        });

        // Sort newest first by createdAt if present, otherwise by id
        list.sort((a, b) => {
          const aCreated = snap.docs.find((d) => d.id === a.id)?.data()?.createdAt;
          const bCreated = snap.docs.find((d) => d.id === b.id)?.data()?.createdAt;
          const aSec = aCreated?.seconds || 0;
          const bSec = bCreated?.seconds || 0;
          if (aSec !== bSec) return bSec - aSec;
          return String(b.id).localeCompare(String(a.id));
        });

        setCandidates(list);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading candidates from Firestore:', err);
        setCandidates([]);
      }
    };

    loadCandidatesFromFirestore();
  }, []);

  // Persist admin active tab so refresh keeps the same section
  useEffect(() => {
    try {
      sessionStorage.setItem('sb_admin_active_tab', activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Load HRs from Firestore on mount and listen for real-time updates
  useEffect(() => {
    const q = query(collection(db, 'hrs'));
    let cancelled = false;

    const looksLikeIdOrMobile = (val) => {
      const s = String(val || '').trim();
      if (!s) return false;
      // mobile-like
      if (/^\d{8,}$/.test(s)) return true;
      // firestore id-like / uid-like
      if (/^[A-Za-z0-9_-]{15,}$/.test(s) && !/\s/.test(s)) return true;
      return false;
    };
    
    // Real-time listener for HRs collection
    const unsubscribe = onSnapshot(
      q,
      async (querySnapshot) => {
        const firestoreHRs = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          firestoreHRs.push({
            id: `firestore_${doc.id}`, // Prefix to distinguish from mock HRs
            firestoreId: doc.id, // Keep original Firestore ID
            name: data.name || '',
            email: data.email || '',
            mobile: data.mobile || '-',
            company: data.company || '',
            technology: data.technology || '',
            jobType: data.jobType || '',
            // Support multiple legacy field names from other projects
            addedBy: data.addedBy || data.addedByName || data.createdBy || '',
            addedById: data.addedById || data.createdById || data.createdByUid || null,
            createdAt: data.createdAt,
          });
        });

        // Enrich "Added By" with candidate name when only addedById is available
        const needAddedByIds = [
          ...new Set(
            firestoreHRs
              .map((h) => {
                const rawAddedBy = String(h.addedBy || '').trim();
                const rawAddedById = String(h.addedById || '').trim();
                // Prefer explicit id field, otherwise attempt to resolve when "addedBy" looks like an id/mobile.
                const key = rawAddedById || (looksLikeIdOrMobile(rawAddedBy) ? rawAddedBy : '');
                const displayLooksGeneric =
                  !rawAddedBy || rawAddedBy.toLowerCase() === 'candidate' || rawAddedBy.toLowerCase() === 'admin';
                return displayLooksGeneric && key ? key : key && looksLikeIdOrMobile(key) ? key : '';
              })
              .filter(Boolean),
          ),
        ];

        await Promise.all(
          needAddedByIds.map(async (addedById) => {
            if (!addedById || candidateByIdCacheRef.current.has(addedById)) return;
            try {
              // 1) Try direct doc id lookup
              const directSnap = await getDoc(doc(db, 'candidates', addedById));
              if (directSnap.exists()) {
                candidateByIdCacheRef.current.set(addedById, directSnap.data());
                return;
              }
            } catch {
              // ignore
            }

            // 2) Fallback: candidates where mobile == addedById (when we store mobile as uid)
            try {
              const mobileQ = query(collection(db, 'candidates'), where('mobile', '==', addedById));
              const mobileSnap = await getDocs(mobileQ);
              const first = mobileSnap.docs[0];
              if (first?.exists?.()) {
                candidateByIdCacheRef.current.set(addedById, first.data());
              }
            } catch {
              // ignore
            }
          }),
        );

        if (cancelled) return;

        const enrichedFirestoreHRs = firestoreHRs.map((h) => {
          const rawAddedBy = String(h.addedBy || '').trim();
          // If addedBy is a real name, keep it.
          if (rawAddedBy && rawAddedBy.toLowerCase() !== 'candidate' && rawAddedBy.toLowerCase() !== 'admin' && !looksLikeIdOrMobile(rawAddedBy)) {
            return { ...h, addedBy: rawAddedBy };
          }

          const key = String(h.addedById || '').trim() || (looksLikeIdOrMobile(rawAddedBy) ? rawAddedBy : '');
          const candidateDoc = key ? candidateByIdCacheRef.current.get(key) : null;
          const resolved = String(candidateDoc?.name || '').trim();
          return {
            ...h,
            addedBy: resolved || (rawAddedBy || 'Candidate'),
          };
        });
        
        // Sort by createdAt descending (newest first) - convert Timestamp to number for comparison
        enrichedFirestoreHRs.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
          return bTime - aTime; // Descending order (newest first)
        });

        // Merge Firestore HRs with mock HRs, avoiding duplicates by email
        setHrs((prev) => {
          const mockHRs = prev.filter((h) => !String(h.id).startsWith('firestore_'));
          
          // Filter out duplicates from Firestore HRs
          const uniqueFirestoreHRs = enrichedFirestoreHRs.filter(
            (h) => !mockHRs.some((m) => m.email?.toLowerCase() === h.email?.toLowerCase())
          );
          
          // Assign numeric IDs for display consistency (starting from max mock ID + 1)
          let maxMockId = mockHRs.length > 0 
            ? Math.max(...mockHRs.map((h) => (typeof h.id === 'number' ? h.id : 0))) 
            : 0;
          
          const numberedFirestoreHRs = uniqueFirestoreHRs.map((h, idx) => ({
            ...h,
            id: maxMockId + idx + 1, // Numeric ID for table display
          }));
          
          // Prepend Firestore HRs (newest first) before mock HRs to show new HRs at top
          return [...numberedFirestoreHRs, ...mockHRs];
        });
      },
      (err) => {
        console.error('Error listening to HRs collection:', err);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const [slotFilter, setSlotFilter] = useState('all');
  const [slotSearch, setSlotSearch] = useState('');
  const [slots, setSlots] = useState(MOCK_SLOTS);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(null);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  // Load slots from Firestore (candidate bookings appear here as pending requests)
  useEffect(() => {
    setSlotsLoading(true);
    setSlotsError(null);
    const slotsRef = collection(db, 'events');
    const q = query(slotsRef, orderBy('createdAt', 'desc'));
    let cancelled = false;

    const enrichSlotsWithNames = async (uiSlots) => {
      // Only enrich when name fields are missing (older events may have only ids)
      const needCandidate = uiSlots
        .filter((s) => !String(s.candidateName || s.name || '').trim() && String(s.candidateId || '').trim())
        .map((s) => String(s.candidateId).trim());
      const needHr = uiSlots
        .filter((s) => !String(s.hrName || '').trim() && String(s.hrId || '').trim())
        .map((s) => String(s.hrId).trim());

      const uniqueCandidateIds = [...new Set(needCandidate)].filter(
        (id) => id && !candidateByIdCacheRef.current.has(id),
      );
      const uniqueHrIds = [...new Set(needHr)].filter(
        (id) => id && !hrByIdCacheRef.current.has(id),
      );

      // Fetch missing candidate docs
      await Promise.all(
        uniqueCandidateIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'candidates', id));
            if (snap.exists()) candidateByIdCacheRef.current.set(id, snap.data());
          } catch {
            // ignore
          }
        }),
      );

      // Fetch missing HR docs
      await Promise.all(
        uniqueHrIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'hrs', id));
            if (snap.exists()) hrByIdCacheRef.current.set(id, snap.data());
          } catch {
            // ignore
          }
        }),
      );

      if (cancelled) return;

      const enriched = uiSlots.map((s) => {
        const candidateId = String(s.candidateId || '').trim();
        const hrId = String(s.hrId || '').trim();

        const candidateDoc = candidateId ? candidateByIdCacheRef.current.get(candidateId) : null;
        const hrDoc = hrId ? hrByIdCacheRef.current.get(hrId) : null;

        const candidateName =
          String(s.candidateName || s.name || '').trim() ||
          String(candidateDoc?.name || '').trim();

        const hrName = String(s.hrName || '').trim() || String(hrDoc?.name || '').trim();
        const hrEmail = String(s.hrEmail || '').trim() || String(hrDoc?.email || '').trim();
        const hrMobile = String(s.hrMobile || '').trim() || String(hrDoc?.mobile || '').trim();

        return {
          ...s,
          candidateName: candidateName || s.candidateName || '',
          hrName: hrName || s.hrName || '',
          hrEmail: hrEmail || s.hrEmail || '',
          hrMobile: hrMobile || s.hrMobile || '',
        };
      });

      setSlots(enriched);
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const uiSlots = slotsSnapshotToUI(snapshot);
        setSlots(uiSlots);
        enrichSlotsWithNames(uiSlots);
        setSlotsLoading(false);
      },
      (err) => {
        console.error('Error loading slots:', err);
        setSlotsError(err);
        setSlotsLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [statsRefreshKey]);
  const [selectedSlotsCandidate, setSelectedSlotsCandidate] = useState(null);
  const [selectedViewCandidate, setSelectedViewCandidate] = useState(null);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [hrs, setHrs] = useState(MOCK_HRS);
  const [hrSearch, setHrSearch] = useState('');
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      const status = String(slot.status || '').trim();
      if (
        slotFilter === 'pending' &&
        !(
          status === 'pending' ||
          status === 'Pending' ||
          status === 'Pending Approval'
        )
      ) {
        return false;
      }
      if (slotFilter === 'approved' && status !== 'Approved') return false;
      if (slotFilter === 'rejected' && status !== 'Rejected') return false;
      if (slotSearch.trim()) {
        const q = slotSearch.toLowerCase();
        const candidateName = (slot.candidateName || '').toLowerCase();
        const company = (slot.company || '').toLowerCase();
        if (!candidateName.includes(q) && !company.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [slots, slotFilter, slotSearch]);

  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter((c) => {
      if (candidateSelectionFilter === 'selected' && !c.selected) return false;
      if (candidateSelectionFilter === 'unselected' && c.selected) return false;
      if (candidateStatusFilter === 'active' && c.status !== 'Active') return false;
      if (candidateStatusFilter === 'inactive' && c.status !== 'Inactive') return false;
      if (candidateReferredByFilter === 'anil_sir') {
        const ref = (c.referredBy || '').toLowerCase();
        if (!ref.includes('anil')) return false;
      }
      if (candidateReferredByFilter === 'viraj_sir') {
        const ref = (c.referredBy || '').toLowerCase();
        if (!ref.includes('viraj')) return false;
      }
      if (candidateReferredByFilter === 'nilesh_sir') {
        const ref = (c.referredBy || '').toLowerCase();
        if (!ref.includes('nilesh')) return false;
      }
      if (candidateReferredByFilter === 'vishal_sir') {
        const ref = (c.referredBy || '').toLowerCase();
        if (!ref.includes('vishal')) return false;
      }
      if (candidateSearch.trim()) {
        const q = candidateSearch.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.mobile.includes(q)) {
          return false;
        }
      }
      return true;
    });
    // Sort by id descending so newly added candidates (higher id) appear on top
    return [...filtered].sort((a, b) => {
      const idA = typeof a.id === 'number' ? a.id : parseInt(a.id, 10) || 0;
      const idB = typeof b.id === 'number' ? b.id : parseInt(b.id, 10) || 0;
      return idB - idA;
    });
  }, [candidates, candidateSelectionFilter, candidateReferredByFilter, candidateStatusFilter, candidateSearch]);

  const filteredHRs = useMemo(() => {
    return hrs.filter((hr) => {
      if (!hrSearch.trim()) return true;
      const q = hrSearch.toLowerCase();
      const name = String(hr.name || '').toLowerCase();
      const email = String(hr.email || '').toLowerCase();
      const mobile = String(hr.mobile || '').toLowerCase();
      const company = String(hr.company || '').toLowerCase();
      const technology = String(hr.technology || '').toLowerCase();
      const addedBy = String(hr.addedBy || '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        mobile.includes(q) ||
        company.includes(q) ||
        technology.includes(q) ||
        addedBy.includes(q)
      );
    });
  }, [hrs, hrSearch]);

  const pendingApprovals = useMemo(
    () =>
      slots.filter((s) => {
        const status = String(s.status || '').trim();
        return status === 'pending' || status === 'Pending' || status === 'Pending Approval';
      }).length,
    [slots],
  );

  const pendingSlots = useMemo(
    () =>
      slots.filter((s) => {
        const status = String(s.status || '').trim();
        return status === 'pending' || status === 'Pending' || status === 'Pending Approval';
      }),
    [slots],
  );

  const handleToggleStatus = async (id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    const newStatus = candidate.status === 'Active' ? 'Inactive' : 'Active';
    const isActive = newStatus === 'Active';

    // Optimistic UI update
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: newStatus } : c,
      ),
    );

    // Persist to Firestore so inactive candidates cannot log in
    try {
      const docId = candidate.firestoreId || candidate.id;
      const collectionName = candidate.sourceCollection || 'candidates';
      await updateDoc(doc(db, collectionName, docId), { isActive });
    } catch (err) {
      // Revert on failure
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: candidate.status } : c,
        ),
      );
      console.error('Failed to update candidate status:', err);
    }
  };

  const handleDeleteCandidate = async (id) => {
    try {
      const candidate = candidates.find((c) => c.id === id);
      if (!candidate) {
        return;
      }

      // Remove from local state immediately
    setCandidates((prev) => prev.filter((c) => c.id !== id));

      // Delete from Firestore (correct collection based on source)
      const collectionName = candidate.sourceCollection || 'candidates';
      if (candidate.firestoreId) {
        await deleteDoc(doc(db, collectionName, candidate.firestoreId));
      } else if (candidate.mobile) {
        // Fallback: look up by mobile if we don't have firestoreId
        const q = query(
          collection(db, collectionName),
          where('mobile', '==', candidate.mobile),
        );
        const snap = await getDocs(q);
        const batchDeletions = [];
        snap.forEach((docSnap) => {
          batchDeletions.push(deleteDoc(doc(db, collectionName, docSnap.id)));
        });
        await Promise.all(batchDeletions);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete candidate:', err);
    }
  };

  const handleViewCandidate = (id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (candidate) {
      const candidateSlots = slots.filter((s) => s.candidateName === candidate.name);
      setSelectedViewCandidate({
        name: candidate.name,
        candidate,
        slots: candidateSlots,
      });
    }
  };

  const handleEditCandidate = async (id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    setEditingCandidate(candidate);
    try {
      const docSnap = await getDoc(doc(db, 'candidates', candidate.firestoreId || id));
      if (docSnap.exists()) {
        const d = docSnap.data() || {};
        let technologies = [];
        if (Array.isArray(d.technology)) {
          technologies = d.technology;
        } else if (typeof d.technology === 'string' && d.technology.trim()) {
          technologies = d.technology.split(',').map((t) => t.trim()).filter(Boolean);
        }
        const fullCandidate = {
          ...candidate,
          name: d.name || candidate.name,
          mobile: String(d.mobile ?? d.phone ?? '').trim() || candidate.mobile,
          experience: d.experience || d.totalExp || candidate.experience,
          technologies: technologies.length ? technologies : candidate.technologies || [],
          payment: typeof d.payment === 'number' ? `₹${d.payment}` : d.payment || candidate.payment,
          referredBy: d.referredBy || d.refereedBy || candidate.referredBy,
          password: String(d.password ?? '').trim(),
          selected: !!d.isSelected,
          selectedDate: d.selectedDate || '',
          joiningDate: d.joiningDate || '',
          selectedCompany: d.selectedCompany || '',
          package: d.selectedPackage || d.package || '',
        };
        setEditingCandidate(fullCandidate);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch candidate for edit:', err);
    }
  };

  const handleApproveSlot = async (id) => {
    try {
      await updateSlotStatus(id, 'Approved');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to approve slot:', err);
    }
  };

  const handleRejectSlot = async (id) => {
    try {
      await updateSlotStatus(id, 'Rejected');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to reject slot:', err);
    }
  };

  const handleDeleteSlot = async (id) => {
    try {
      await deleteSlot(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete slot:', err);
    }
  };

  const slotStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const getSlotDate = (slot) => {
      const raw = slot.date;
      if (!raw) return null;
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const lastWeek = slots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= oneWeekAgo && d < now;
    }).length;
    const thisWeek = slots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= startOfToday;
    }).length;
    const recentFourWeeks = slots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= fourWeeksAgo;
    }).length;
    const recentThirtyDays = slots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= thirtyDaysAgo;
    }).length;

    const total = slots.length;
    const pending = slots.filter((s) => s.status === 'pending' || s.status === 'Pending').length;
    const approved = slots.filter((s) => s.status === 'Approved').length;
    const rejected = slots.filter((s) => s.status === 'Rejected').length;
    return {
      total,
      lastWeek,
      thisWeek,
      avgPerWeek: Math.round((recentFourWeeks / 4) * 10) / 10,
      avgPerDay: Math.round((recentThirtyDays / 30) * 10) / 10,
      pending,
      approved,
      rejected,
    };
  }, [slots]);

  const handleDeleteHR = async (id) => {
    try {
      // Find the HR to check if it has a Firestore ID
      const hrToDelete = hrs.find((h) => h.id === id);
      
      // If HR has a Firestore ID, delete from Firestore
      if (hrToDelete?.firestoreId) {
        await deleteDoc(doc(db, 'hrs', hrToDelete.firestoreId));
      }
      
      // Remove from local state
      setHrs((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete HR:', err);
      // Still remove from local state even if Firestore delete fails
      setHrs((prev) => prev.filter((h) => h.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          // When user navigates via main tabs, default HR back to home
          if (tab === 'hrs') {
            setHrBackTab('home');
          }
        }}
      />
      <AdminTopNav
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'hrs') {
            setHrBackTab('home');
          }
        }}
        pendingApprovals={pendingApprovals}
      />
      <main className="p-2 sm:p-4 md:p-8">
        {pendingSlots.length > 0 && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-3">
            {pendingSlots.map((slot) => {
              const slotId = slot.firestoreId || slot.id;
              // Always show full date using shared formatter
              const fullDate =
                slot.date
                  ? formatDateDDMMYYYY(slot.date)
                  : slot.dateExactLabel || slot.dateLabel || '';
              const candidateName = slot.candidateName || slot.name || '';
              const timeLabel = slot.timeLabel || '';
              const hrName = slot.hrName || slot.hr || '';
              const hrMobile = slot.hrMobile || '';
              const hrEmail = slot.hrEmail || '';
              return (
                <div
                  key={slotId}
                  className="col-span-2 sm:col-span-4 lg:col-span-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 flex flex-col gap-2 text-xs sm:text-sm min-w-0"
                >
                  {/* Row 1: Name • Date • Time (wrap + full data) */}
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-slate-800 min-w-0">
                    {candidateName && (
                      <span className="font-semibold break-words" title={candidateName}>
                        {candidateName}
                      </span>
                    )}
                    {fullDate && (
                      <>
                        {candidateName && <span className="text-slate-500 flex-shrink-0">•</span>}
                        <span className="text-slate-700 break-words">{fullDate}</span>
                      </>
                    )}
                    {timeLabel && (
                      <>
                        {(candidateName || fullDate) && (
                          <span className="text-slate-500 flex-shrink-0">•</span>
                        )}
                        <span className="text-slate-700 break-words" title={timeLabel}>
                          {timeLabel}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Row 2: HR Name • Mobile • Email (wrap + full data) */}
                  {(hrName || hrMobile || hrEmail) && (
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-slate-700 min-w-0">
                      {hrName && (
                        <span className="font-medium break-words" title={hrName}>
                          {hrName}
                        </span>
                      )}
                      {hrMobile && (
                        <>
                          {hrName && <span className="text-slate-500 flex-shrink-0">•</span>}
                          <span className="break-words">{hrMobile}</span>
                        </>
                      )}
                      {hrEmail && (
                        <>
                          {(hrName || hrMobile) && (
                            <span className="text-slate-500 flex-shrink-0">•</span>
                          )}
                          <span className="break-all min-w-0" title={hrEmail}>
                            {hrEmail}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-auto">
                    <button
                      type="button"
                      onClick={() => handleApproveSlot(slotId)}
                      className="inline-flex items-center gap-2 rounded bg-emerald-500 px-3 py-2 text-[14px] font-semibold text-white hover:bg-emerald-600 flex-1 justify-center"
                    >
                      <i className="fa-solid fa-check" aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectSlot(slotId)}
                      className="inline-flex items-center gap-2 rounded bg-red-500 px-3 py-2 text-[14px] font-semibold text-white hover:bg-red-600 flex-1 justify-center"
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {activeTab === 'candidates' ? (
          showAddForm ? (
            <AdminAddCandidateForm
              onBack={() => setShowAddForm(false)}
              onSubmit={(data) => {
                const nextId = candidates.length
                  ? Math.max(...candidates.map((c) => (typeof c.id === 'number' ? c.id : 0))) + 1
                  : 1;
                const newCandidate = {
                  id: nextId,
                  firestoreId: data.firestoreId || null,
                  name: data.name || `New Candidate ${nextId}`,
                  mobile: data.mobile || '0000000000',
                  experience: data.experience || '0',
                  technologies: Array.isArray(data.technology)
                    ? data.technology
                    : data.technology
                    ? [data.technology]
                    : [],
                  totalScheduled: '0',
                  lastInterview: '-',
                  status: 'Active',
                  selected: false,
                };
                setCandidates((prev) => [newCandidate, ...prev]);
                setShowAddForm(false);
              }}
            />
          ) : editingCandidate ? (
            <AdminEditCandidateForm
              candidate={editingCandidate}
              onBack={() => setEditingCandidate(null)}
              onSubmit={(data) => {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.id === editingCandidate.id
                      ? {
                          ...c,
                          name: data.name || c.name,
                          mobile: data.mobile || c.mobile,
                          experience: data.experience || c.experience || '-',
                          technologies: Array.isArray(data.technology)
                            ? data.technology
                            : data.technology
                            ? [data.technology]
                            : c.technologies,
                          referredBy: data.referredBy || c.referredBy,
                          selected: data.selected ?? c.selected,
                          password: data.password,
                          ...(data.selected && {
                            selectedDate: data.selectedDate,
                            joiningDate: data.joiningDate,
                            selectedCompany: data.selectedCompany,
                            package: data.package,
                          }),
                        }
                      : c,
                  ),
                );
                setEditingCandidate(null);
              }}
            />
          ) : selectedViewCandidate ? (
            <AdminCandidateSlotsView
              data={selectedViewCandidate}
              onBack={() => setSelectedViewCandidate(null)}
            />
          ) : (
            <AdminCandidatesTable
              candidates={filteredCandidates}
              slots={slots}
              selectionFilter={candidateSelectionFilter}
              referredByFilter={candidateReferredByFilter}
              statusFilter={candidateStatusFilter}
              search={candidateSearch}
              onBackToHome={() => setActiveTab('home')}
              onOpenAddForm={() => setShowAddForm(true)}
              onChangeSelectionFilter={setCandidateSelectionFilter}
              onChangeReferredByFilter={setCandidateReferredByFilter}
              onChangeStatusFilter={setCandidateStatusFilter}
              onChangeSearch={setCandidateSearch}
              onToggleStatus={handleToggleStatus}
              onDeleteCandidate={handleDeleteCandidate}
              onViewCandidate={handleViewCandidate}
              onEditCandidate={handleEditCandidate}
            />
          )
        ) : activeTab === 'slots' ? (
          selectedSlotsCandidate ? (
            <AdminCandidateSlotsView
              data={selectedSlotsCandidate}
              onBack={() => setSelectedSlotsCandidate(null)}
            />
          ) : (
            <AdminSlotsTable
              slots={filteredSlots}
              filter={slotFilter}
              search={slotSearch}
              onChangeFilter={setSlotFilter}
              onChangeSearch={setSlotSearch}
              onBackToHome={() => setActiveTab('home')}
              onApproveSlot={handleApproveSlot}
              onRejectSlot={handleRejectSlot}
              onDeleteSlot={handleDeleteSlot}
              hrs={hrs}
              loading={slotsLoading}
              error={slotsError}
              stats={slotStats}
              onOpenCandidateSlots={(candidateName) => {
                const candidate = candidates.find(
                  (c) => c.name === candidateName,
                );
                const candidateSlots = slots.filter(
                  (s) => (s.candidateName || s.name) === candidateName,
                );
                setSelectedSlotsCandidate({
                  name: candidateName,
                  candidate: candidate || null,
                  slots: candidateSlots,
                });
              }}
              onOpenHRView={(value) => {
                setHrBackTab('slots');
                setActiveTab('hrs');
                setHrSearch(value || '');
              }}
            />
          )
        ) : activeTab === 'hrs' ? (
          selectedViewCandidate ? (
            <AdminCandidateSlotsView
              data={selectedViewCandidate}
              onBack={() => setSelectedViewCandidate(null)}
            />
          ) : (
            <AdminHRsTable
              hrs={filteredHRs}
              totalCount={hrs.length}
              search={hrSearch}
              onBackToHome={() => setActiveTab(hrBackTab)}
              onChangeSearch={setHrSearch}
              onDeleteHR={handleDeleteHR}
              candidateNames={candidates.map((c) => (c.name || '').trim().toLowerCase()).filter(Boolean)}
              onOpenCandidateView={(addedByName) => {
                const candidate = candidates.find(
                  (c) => (c.name || '').trim().toLowerCase() === (addedByName || '').trim().toLowerCase(),
                );
                if (candidate) {
                  const candidateSlots = slots.filter(
                    (s) => (s.candidateName || s.name || '').trim().toLowerCase() === (candidate.name || '').trim().toLowerCase(),
                  );
                  setSelectedViewCandidate({
                    name: candidate.name,
                    candidate,
                    slots: candidateSlots,
                  });
                }
              }}
              onAddHR={async (data) => {
              const nextId = hrs.length
                ? Math.max(...hrs.map((h) => (typeof h.id === 'number' ? h.id : 0))) + 1
                : 1;

              // Resolve admin identity for "Added By"
              let adminName = 'Admin';
              let adminId = null;
              try {
                const raw = sessionStorage.getItem('sb_user');
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed?.name) adminName = String(parsed.name).trim() || adminName;
                if (parsed?.mobile) adminId = String(parsed.mobile).trim() || adminId;
              } catch {
                // ignore
              }

              const newHr = {
                id: nextId,
                name: data.name || `HR ${nextId}`,
                email: data.email || '',
                mobile: data.mobile || '',
                company: data.company || '',
                technology: data.technology || '',
                jobType: data.jobType || '',
                addedBy: adminName,
                addedById: adminId,
              };
              
              // Save to Firestore
              try {
                await addDoc(collection(db, 'hrs'), {
                  name: newHr.name,
                  email: newHr.email,
                  mobile: newHr.mobile,
                  company: newHr.company,
                  technology: newHr.technology,
                  jobType: newHr.jobType,
                  addedBy: newHr.addedBy,
                  addedById: newHr.addedById,
                  createdAt: serverTimestamp(),
                });
                
                // Update local state immediately - prepend new HR at first position
                setHrs((prev) => [newHr, ...prev]);
                
                // Show success toast
                setShowHrSuccessToast(true);
                setTimeout(() => {
                  setShowHrSuccessToast(false);
                }, 2000);
                
                console.log('Saved HR to Firestore from Admin:', newHr);
              } catch (err) {
                console.error('Failed to save HR to Firestore:', err);
              }
            }}
            onUpdateHR={async (id, data) => {
              setHrs((prev) =>
                prev.map((hr) =>
                  hr.id === id
                    ? {
                        ...hr,
                        name: data.name ?? hr.name,
                        email: data.email ?? hr.email,
                        mobile: data.mobile ?? hr.mobile,
                        company: data.company ?? hr.company,
                        technology: data.technology ?? hr.technology,
                        jobType: data.jobType ?? hr.jobType,
                      }
                    : hr,
                ),
              );

              // Persist changes to Firestore when possible
              try {
                const current = hrs.find((h) => h.id === id);
                const firestoreId = current?.firestoreId;
                if (firestoreId) {
                  const payload = {
                    name: data.name ?? current.name ?? '',
                    email: data.email ?? current.email ?? '',
                    mobile: data.mobile ?? current.mobile ?? '',
                    company: data.company ?? current.company ?? '',
                    technology: data.technology ?? current.technology ?? '',
                    jobType: data.jobType ?? current.jobType ?? '',
                  };
                  await updateDoc(doc(db, 'hrs', firestoreId), payload);
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to update HR in Firestore:', err);
              }
            }}
          />
          )
        ) : activeTab === 'stats' ? (
          <AdminStatisticsChart slots={slots} onReload={() => setStatsRefreshKey((k) => k + 1)} />
        ) : activeTab === 'leaves' ? (
          <AdminLeavesTable onBackToHome={() => setActiveTab('home')} />
        ) : (
          <>
            <div className="min-h-[70vh] overflow-hidden rounded-lg sm:rounded-2xl bg-white shadow-sm px-4 py-6">
              {/* Admin calendar header */}
              <div className="border-b border-slate-200 pb-3 sm:pb-4">
                {/* Mobile: match screenshot layout (all centered, stacked) */}
                <div className="flex flex-col items-center gap-2 sm:hidden">
                  {/* Today's date with calendar icon */}
                  <div className="flex items-center gap-2 text-xs text-purple-600">
                    <i className="fa-regular fa-calendar-days" aria-hidden="true" />
                    <span className="font-semibold">
                      Today: {adminTodayLabel}
                    </span>
                  </div>
                  {/* Slot Booking / Slot Booking Calendar + reload */}
                  <div className="flex items-center justify-center gap-2">
                    {/* Mobile text without 'Calendar' */}
                    <span className="text-xs font-semibold text-purple-600">
                      Slot Booking
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalendarRefreshKey((k) => k + 1)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
                      aria-label="Reload calendar"
                    >
                      <i className="fa-solid fa-rotate-right text-xs" aria-hidden="true" />
                    </button>
                  </div>
                  {/* Download button full-width-ish */}
                  <div className="w-full flex justify-center">
                    <button
                      type="button"
                      onClick={() => downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')}
                      className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-600"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 3v12" />
                        <path d="M8 11l4 4 4-4" />
                        <rect x="4" y="17" width="16" height="3" rx="1" />
                      </svg>
                      <span>Download Personal Detail Form</span>
                    </button>
                  </div>
                </div>

                {/* Desktop / tablet: keep existing centered header layout */}
                <div className="hidden sm:block">
                <div className="relative flex md:flex-col lg:flex-row items-center justify-between md:justify-center lg:justify-between gap-3 md:gap-2">
                    {/* Left: Today's date */}
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-700 w-40 min-w-0 md:w-auto md:justify-center">
                      <span className="font-medium truncate md:truncate-none">
                        Today {adminTodayLabel}
                      </span>
                  </div>

                    {/* Center: Slot Booking + reload - iPad: static; desktop: absolute */}
                    <div className="absolute md:relative md:left-0 md:translate-x-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-purple-600">
                        Slot Booking
                  </span>
                      <button
                        type="button"
                        onClick={() => setCalendarRefreshKey((k) => k + 1)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
                        aria-label="Reload calendar"
                      >
                        <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
                      </button>
                    </div>

                  {/* Right: Download button only (stats are in CalendarToolbar below) */}
                  <div className="flex items-center justify-end md:justify-center lg:justify-end">
                    <button
                      type="button"
                      onClick={() => downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')}
                      className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-sky-600 whitespace-nowrap"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 3v12" />
                        <path d="M8 11l4 4 4-4" />
                        <rect x="4" y="17" width="16" height="3" rx="1" />
                      </svg>
                      <span>Download Personal Detail Form</span>
                    </button>
                    </div>
                  </div>
                </div>

                <WeekCalendar
                  key={calendarRefreshKey}
                  onEventClick={(event) => {
                    setCalendarSelectedEvent(event);
                  }}
                />
              </div>
            </div>
          </>
        )}
      {/* Calendar slot details popup (admin calendar) */}
      {calendarSelectedEvent && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => setCalendarSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white shadow-lg px-5 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Slot Details
              </h3>
              <button
                type="button"
                onClick={() => setCalendarSelectedEvent(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            {(() => {
              const ev = calendarSelectedEvent;
              const start =
                ev?.__startDate instanceof Date ? ev.__startDate : parseISOToDate(ev.start);
              const end =
                ev?.__endDate instanceof Date ? ev.__endDate : parseISOToDate(ev.end);
              const dateStr =
                start && !Number.isNaN(start.getTime())
                  ? formatDateDDMMYYYY(start)
                  : '';
              const timeStr =
                start &&
                end &&
                !Number.isNaN(start.getTime()) &&
                !Number.isNaN(end.getTime())
                  ? `${start.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })} - ${end.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}`
                  : '';
              const company = ev.extendedProps?.company || ev.company || '';
              const technology =
                ev.extendedProps?.technology || ev.technology || '';
              const candidateName =
                ev.candidateName || ev.extendedProps?.candidateName || '';
              const round =
                ev.extendedProps?.interviewRound ||
                ev.extendedProps?.round ||
                ev.round ||
                '';
              const hrName =
                ev.extendedProps?.hrName || ev.hrName || '';
              const hrEmail =
                ev.extendedProps?.hrEmail || ev.hrEmail || '';
              const hrMobile =
                ev.extendedProps?.hrMobile || ev.hrMobile || '';

              return (
                <div className="space-y-2 text-xs sm:text-sm text-slate-800 min-w-0">
                  {/* Row 1: Candidate Name + Round */}
                  {(candidateName || round) && (
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 min-w-0">
                      {candidateName && (
                        <div className="flex-1 min-w-0">
                          <div className="break-words">{candidateName}</div>
                          <div className="text-[11px] text-slate-500">Candidate</div>
                        </div>
                      )}
                      {round && (
                        <div className="flex-1 min-w-0 text-right">
                          <div className="break-words">{normaliseRoundLabelAdmin(round)}</div>
                          <div className="text-[11px] text-slate-500">Round</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 2: Company + Date */}
                  {(company || dateStr) && (
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 min-w-0">
                      {company && (
                        <div className="flex-1 min-w-0">
                          <div className="break-words">{company}</div>
                          <div className="text-[11px] text-slate-500">Company</div>
                        </div>
                      )}
                      {dateStr && (
                        <div className="flex-1 min-w-0 text-right">
                          <div className="break-words">{dateStr}</div>
                          <div className="text-[11px] text-slate-500">Date</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 3: Technology + Time */}
                  {(technology || timeStr) && (
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 min-w-0">
                      {technology && (
                        <div className="flex-1 min-w-0">
                          <div className="break-words">{technology}</div>
                          <div className="text-[11px] text-slate-500">Technology</div>
                        </div>
                      )}
                      {timeStr && (
                        <div className="flex-1 min-w-0 text-right">
                          <div className="break-words">{timeStr}</div>
                          <div className="text-[11px] text-slate-500">Time</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Separator line */}
                  <hr className="my-2 border-slate-400" />

                  {/* Row 4: HR Name + HR Mobile */}
                  {(hrName || hrMobile) && (
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 min-w-0">
                      {hrName && (
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] break-words">{hrName}</div>
                          <div className="text-[11px] text-slate-500">HR Name</div>
                        </div>
                      )}
                      {hrMobile && (
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-[14px] break-all">{hrMobile}</div>
                          <div className="text-[11px] text-slate-500">Mobile</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 5: HR Email */}
                  {hrEmail && (
                    <div>
                      <div className="text-[14px] break-all">
                        {hrEmail}
                      </div>
                      <div className="text-[11px] text-slate-500">Email</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      </main>

      {/* HR Success Toast Notification */}
      {showHrSuccessToast && (
        <div className="fixed top-4 right-4 z-50 transition-opacity duration-300">
          <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="font-semibold text-sm">HR Created Successfully</span>
          </div>
        </div>
      )}
    </div>
  );
}

