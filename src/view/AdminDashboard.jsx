import React, { Suspense, lazy, useMemo, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { mayLeave, navigated } from '../profile/unsaved.js';
import StatCounts from '../Components/StatCounts';
import PageHeader, { Breadcrumbs, PageTitle, SetTrail } from '../Components/PageHeader';
import { friendlyMessage } from '../utils/quota';
import { db, auth, adminSetCandidateAuth, adminDeleteCandidateAuth, normalizeMobile } from '../firebase/firebase';
import {
  updateSlotStatus,
  deleteSlot,
  slotsSnapshotToUI,
  getLeaves,
  addLeave as addLeaveToFirestore,
  deleteLeave as deleteLeaveFromFirestore,
  formatDateDDMMYYYY,
  syncCandidateDisplayNameOnEvents,
  getCollectionDocs,
  getCandidatesById,
} from '../firebase/slotsService';
import { forgetSyncedDoc, clearSyncedCollections } from '../firebase/syncedCollection';
import {
  subscribeToSlotSettings,
  saveSlotSettings,
  getStoredSlotSettings,
  normalizeSlotSettings,
  formatHourToLabel,
  formatHourTo24,
  parseHourFromLabel,
  START_TIME_OPTIONS,
  END_TIME_OPTIONS,
  DEFAULT_SLOT_SETTINGS,
} from '../firebase/settingsService';
import { getHrDuplicateFieldErrors } from '../firebase/hrService';
import {
  normalizeCandidateMobile,
  slotMatchesCandidate,
  statsSlotCandidateKey,
} from '../utils/candidateIdentity';
import {
  getLastInterviewInfo,
  isCandidateInterviewOlderThanTwoWeeks,
  getCandidateAccountStatus,
} from '../utils/candidateStatus';
import { parseISOToDate } from '../calendar';
import WeekCalendar from '../Components/WeekCalendar';
import ConfirmDeleteModal from '../Components/ConfirmDeleteModal';
import { downloadWithSaveAs } from '../utils/downloadUtils';
import { synced as syncProfiles, useCandidates as useProfiles } from '../profile/data.js';
import { saveAs } from 'file-saver';
import {
  SelectedFields,
  SelectedToggle,
  TechMultiSelect,
  selectionFormFromDoc,
  selectionPayload,
  validateSelection,
  SelectedDetailsView,
} from '../Components/CandidateSelectionFields';
import PaginationBar from '../Components/PaginationBar';

function escapeCsvCell(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Digits only, max 10, must start with 6–9 */
function sanitizeCandidateMobileInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (!/^[6-9]/.test(digits)) return '';
  return digits.slice(0, 10);
}

function isValidCandidateMobile(mobile) {
  return /^[6-9]\d{9}$/.test(String(mobile || '').trim());
}



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

// Normalise legacy technology labels for admin dropdowns
function normaliseTechLabelAdmin(raw) {
  const v = String(raw || '').trim();
  const lower = v.toLowerCase();
  if (lower === '.net devloper' || lower === 'dot net' || lower === '.net') {
    return '.Net';
  }
  if (lower === 'devops(awg)' || lower === 'devops awg') {
    return 'DevOps (AWS)';
  }
  return v;
}

const CANDIDATE_TECH_OPTIONS = [
  'PHP',
  '.Net',
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
  'DevOps (AWS)',
  'DevOps (Azure)',
  'Data Analysts',
  'AEM',
  'Power BI',
  'Security',
  'Other',
];

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getRelativeSlotDayLabel(slotDateValue) {
  const slotDate =
    slotDateValue instanceof Date ? slotDateValue : parseISOToDate(String(slotDateValue || ''));
  if (!(slotDate instanceof Date) || Number.isNaN(slotDate.getTime())) return '';

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfLocalDay(slotDate).getTime() - startOfLocalDay(new Date()).getTime()) / dayMs,
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tommarow';
  return '';
}


// Header copied from CandidateDashboard, adjusted for Admin, with mobile sidebar nav
function AdminHeader({ activeTab, onChangeTab }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  // Name of the signed-in admin (set by Login.js).
  const adminName = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('sb_user') || '{}').name || 'Admin';
    } catch {
      return 'Admin';
    }
  })();
  const adminInitials = adminName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    sessionStorage.removeItem('sb_user');
    // Profile pages keep a local copy of candidate profiles and resume drafts (src/profile/data.js): don't leave it on the device.
    Object.keys(localStorage).filter((k) => k.startsWith('admission-profile:') || k.startsWith('slot-profile:')).forEach((k) => localStorage.removeItem(k));
    clearSyncedCollections(); // device copies of candidates / HRs / events
    signOut(auth).catch(() => {});
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'candidates', label: 'Candidates', icon: 'fa-solid fa-users' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar-days' },
    { id: 'leaves', label: 'Admin Leaves', icon: 'fa-solid fa-umbrella-beach' },
    { id: 'hrs', label: 'HRs', icon: 'fa-solid fa-user-tie' },
    { id: 'stats', label: 'Statistics', icon: 'fa-solid fa-chart-column' },
    { id: 'profiles', label: 'Admission Profiles', icon: 'fa-solid fa-file-signature' },
    { id: 'resumes', label: 'Resumes', icon: 'fa-solid fa-file-lines' },
  ];

  const handleNavClick = (id) => {
    if (typeof onChangeTab === 'function') {
      onChangeTab(id);
    }
    setNavOpen(false);
  };

  return (
    <>
      <div className="bg-pink-100 px-2 sm:px-4 md:px-8 py-2 sm:py-3 md:py-4 flex items-center justify-between gap-2 sm:gap-3 relative print:hidden">
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
        <p className="text-sm sm:text-base md:text-xl font-bold text-gray-900 truncate">
          <i className="fa-solid fa-calendar-check mr-2 text-purple-600" aria-hidden="true" />
          Book Slots
        </p>
      </div>

              <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2">
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
              {adminName}
            </p>
            <p className="text-[10px] text-gray-500">Admin</p>
          </div>
          {/* Desktop / tablet: existing name + role */}
          <div className="text-right hidden sm:block">
            <p className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
              {adminName}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">Admin</p>
          </div>
          <div className="w-8 sm:w-9 md:w-10 h-8 sm:h-9 md:h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
            <span className="text-xs sm:text-sm md:text-base font-semibold text-white">{adminInitials}</span>
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
                <p className="text-sm font-semibold text-slate-900">{adminName}</p>
                <p className="text-[11px] text-slate-500">Admin</p>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); handleNavClick('settings'); }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium border-t border-slate-100 ${activeTab === 'settings' ? 'bg-purple-100 text-purple-600' : 'text-slate-700 hover:bg-purple-50'}`}
              ><i className="fa-solid fa-gear" aria-hidden="true" />
                Settings
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2"
              ><i className="fa-solid fa-right-from-bracket mr-1.5" aria-hidden="true" />
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
    <div className="hidden md:flex bg-white px-4 py-2 items-center gap-2 shadow-sm border-b border-purple-100 print:hidden">
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
        <i className="fa-solid fa-calendar-days w-4 h-4" aria-hidden="true" />
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
        <i className="fa-solid fa-umbrella-beach w-4 h-4" aria-hidden="true" />
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
        <i className="fa-solid fa-user-tie w-4 h-4" aria-hidden="true" />
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
        <i className="fa-solid fa-chart-column w-4 h-4" aria-hidden="true" />
        <span>Statistics</span>
      </button>

      {/* Profiles & resumes (src/profile) */}
      {[['profiles', 'Admission Profiles', 'fa-file-signature'], ['resumes', 'Resumes', 'fa-file-lines']].map(([id, label, icon]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`${baseBtn} ${
            activeTab === id
              ? 'bg-purple-100 text-purple-600 shadow-sm'
              : 'text-gray-700 hover:text-gray-900'
          }`}
        >
          <i className={`fa-solid ${icon} w-4 h-4`} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}

      <div className="ml-auto hidden sm:flex items-center text-[11px] font-semibold text-slate-600">
        Pending Approvals:&nbsp;
        <span className="text-red-600">{pendingApprovals}</span>
      </div>
    </div>
  );
}

function toTitleCase(value) {
  const str = String(value || '').toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function AdminCandidatesTable({
  candidates,
  slots = [],
  selectionFilter,
  technologyFilter = 'all',
  referredByFilter,
  statusFilter,
  search,
  techOptions = CANDIDATE_TECH_OPTIONS,
  onBackToHome,
  onOpenAddForm,
  onChangeSelectionFilter,
  onChangeTechnologyFilter,
  onChangeReferredByFilter,
  onChangeStatusFilter,
  onChangeSearch,
  onToggleStatus,
  onDeleteCandidate,
  onViewCandidate,
  onEditCandidate,
}) {
  const getLastInterview = (candidate) => {
    const info = getLastInterviewInfo(slots, candidate);
    if (!info) return null;
    return {
      date: info.date,
      time: info.time,
      isOlderThanTwoWeeks: info.isOlderThanTwoWeeks,
      daysAgo: info.daysAgo,
    };
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalItems = candidates.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedCandidates = candidates.slice(startIdx, startIdx + itemsPerPage);
  const [confirmDeleteCandidateId, setConfirmDeleteCandidateId] = useState(null);
  const [confirmDeleteCandidateName, setConfirmDeleteCandidateName] = useState('');

  const getScheduledCount = (candidate) => {
    return slots.filter((s) => slotMatchesCandidate(s, candidate)).length;
  };

  // Reset to page 1 when data/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [candidates.length, selectionFilter, technologyFilter, referredByFilter, statusFilter, search]);

  // Row pieces shared by the desktop table and the phone cards.
  const refIcon = (c) => {
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
  };
  const lastInterview = (c) => {
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
  };
  // Profile / resume created? Coloured = yes, grey = not yet. From the profiles' device copy (synced by updatedAt).
  const { rows: profiles } = useProfiles();
  useEffect(() => { syncProfiles(); }, []);
  const profileByMobile = useMemo(
    () => new Map((profiles ?? []).map((r) => [String(r.phone || '').replace(/\D/g, '').slice(-10), r])),
    [profiles],
  );
  const docIcons = (c) => {
    if (!profiles) return null;
    const p = profileByMobile.get(normalizeMobile(c.mobile).slice(-10));
    // Same round tinted chip as the referrer icon (refIcon); grey = not created yet.
    const icon = (fa, on, label, tone) => (
      <span role="img" aria-label={label} title={label}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${on ? tone : 'bg-slate-100 text-slate-300'}`}>
        <i className={`fa-solid ${fa}`} aria-hidden="true" />
      </span>
    );
    return (
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 pl-2">
        {icon('fa-file-signature', p, p ? 'Admission profile created' : 'No admission profile yet', 'bg-indigo-100 text-indigo-600')}
        {icon('fa-file-lines', p?.hasResume, p?.hasResume ? 'Resume created' : 'No resume yet', 'bg-emerald-100 text-emerald-600')}
      </span>
    );
  };
  const statusOf = (c) => (c.selected || c.isSelected)
    ? (c.status ? c.status : (c.isActive !== false ? 'Active' : 'Inactive'))
    : getCandidateAccountStatus(c, slots);
  const activeCount = candidates.filter((c) => statusOf(c) === 'Active').length;
  const statusPill = (c) => {
    const effectiveStatus = statusOf(c);
    return (
      <button
        type="button"
        onClick={() => onToggleStatus(c.id)}
        title={`Click to set as ${effectiveStatus === 'Active' ? 'Inactive' : 'Active'}`}
        className={`inline-flex rounded-full px-3 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors ${
          effectiveStatus === 'Active'
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-red-500 text-white hover:bg-red-600'
        }`}
      >
        {effectiveStatus}
      </button>
    );
  };
  const rowActions = (c) => (
    <div className="inline-flex gap-2">
      <button
        onClick={() => onViewCandidate(c.id)}
        className="btn-action bg-sky-500"
      >
        <i className="fa-solid fa-eye" aria-hidden="true" />
      </button>
      {statusOf(c) === 'Active' && /^\d{10}$/.test(normalizeMobile(c.mobile).slice(-10)) && (
        <a
          href={`#/m/${normalizeMobile(c.mobile).slice(-10)}`}
          title="Admission Profile"
          aria-label="Admission Profile"
          className="btn-action bg-indigo-500"
        >
          <i className="fa-solid fa-file-signature" aria-hidden="true" />
        </a>
      )}
      {statusOf(c) === 'Active' && /^\d{10}$/.test(normalizeMobile(c.mobile).slice(-10)) && (
        <a
          href={`#/m/${normalizeMobile(c.mobile).slice(-10)}/resume`}
          title="Resume"
          aria-label="Resume"
          className="btn-action bg-emerald-500"
        >
          <i className="fa-solid fa-file-lines" aria-hidden="true" />
        </a>
      )}
      <button
        onClick={() => onEditCandidate(c.id)}
        className="btn-action bg-amber-400"
      >
        <i className="fa-solid fa-pen" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirmDeleteCandidateId(c.id);
          setConfirmDeleteCandidateName(c.name || '');
        }}
        className="btn-action bg-red-500"
      >
        <i className="fa-solid fa-trash" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-users"
        title="Candidates"
        onBack={onBackToHome}
        backLabel="Back to home"
        extra={
          <button
            type="button"
            onClick={() => {
              onChangeSelectionFilter('unselected');
              if (onChangeTechnologyFilter) onChangeTechnologyFilter('all');
              onChangeReferredByFilter('all');
              onChangeStatusFilter('active');
              onChangeSearch('');
            }}
            className="btn-circle"
            aria-label="Reset filters"
            title="Reset filters"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        }
        actions={
          <button type="button" onClick={onOpenAddForm} className="btn-pill bg-emerald-500" aria-label="Add New Candidate">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Add New Candidate</span>
          </button>
        }
      />

      {/* Filters row under Add Candidate */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Left: total candidates (stacked like screenshot) */}
        <StatCounts items={[['Total', candidates.length], ['Active', activeCount, 'green'], ['Inactive', candidates.length - activeCount, 'red']]} />

        {/* Right: filters grouped and right-aligned */}
        <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
          {/* Selected / Unselected filter */}
          <select
            value={selectionFilter}
            onChange={(e) => onChangeSelectionFilter(e.target.value)}
            className="filter-select w-auto"
          >
            <option value="unselected">Unselected</option>
            <option value="selected">Selected</option>
          </select>

          {/* Technology filter dropdown */}
          <select
            value={technologyFilter}
            onChange={(e) => onChangeTechnologyFilter && onChangeTechnologyFilter(e.target.value)}
            className="filter-select w-auto"
          >
            <option value="all">All Technologies</option>
            {techOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {/* Referred By filter dropdown */}
          <select
            value={referredByFilter}
            onChange={(e) => onChangeReferredByFilter(e.target.value)}
            className="filter-select w-auto"
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
            className="filter-select w-auto"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Search */}
          <div className="relative w-32 sm:w-40">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="filter-search"
            />
          </div>
        </div>
      </div>

      {/* Phones: one card per candidate (same data and actions as the table) */}
      <div className="md:hidden space-y-3">
        {paginatedCandidates.length === 0 && (
          <p className="rounded-lg border border-slate-200 px-4 py-6 text-center text-xs text-slate-500">No candidates found.</p>
        )}
        {paginatedCandidates.map((c) => (
          <div key={c.firestoreId || c.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-2">
              {refIcon(c)}
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="truncate">{c.name}</span>
                  {(c.selected || c.isSelected) && <span className="shrink-0 text-xs font-bold text-blue-600">- Selected</span>}
                  {docIcons(c)}
                </p>
                {c.mobile && <a href={`tel:${c.mobile}`} className="inline-flex items-center gap-1 py-1 text-xs text-purple-600"><i className="fa-solid fa-mobile-screen" aria-hidden="true" />{c.mobile}</a>}
              </div>
              {statusPill(c)}
            </div>
            {Array.isArray(c.technologies) && c.technologies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.technologies.map((t) => (
                  <span key={t} className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">{t}</span>
                ))}
              </div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-slate-400">Experience</p><p className="text-slate-700">{(c.experience && String(c.experience).trim()) || '0'} yrs</p></div>
              <div><p className="text-slate-400"><i className="fa-solid fa-calendar-days mr-1" aria-hidden="true" />Total Slots</p><p className="text-slate-700">{getScheduledCount(c)}</p></div>
              <div><p className="text-slate-400">Last Interview</p><div className="text-slate-700">{lastInterview(c)}</div></div>
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{rowActions(c)}</div>
          </div>
        ))}
      </div>

      {/* Table with grid (column borders) */}
      <div className="hidden md:block overflow-x-auto">
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
                <i className="fa-solid fa-calendar-days mr-1" aria-hidden="true" />Total Slots
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
                    {refIcon(c)}
                    <span className="truncate">{c.name}</span>
                    {(c.selected || c.isSelected) && (
                      <span className="ml-1 text-xs font-bold text-blue-600 whitespace-nowrap">
                        - Selected
                      </span>
                    )}
                    {docIcons(c)}
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
                    {(Array.isArray(c.technologies) ? c.technologies : []).map((t) => (
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
                  {getScheduledCount(c)}
                </td>
                <td className="px-3 py-2 text-slate-700 text-center text-xs border-r border-slate-200">
                  {lastInterview(c)}
                </td>
                <td className="px-3 py-2 text-center border-r border-slate-200">
                  {statusPill(c)}
                </td>
                <td className="px-3 py-2 text-center">
                  {rowActions(c)}
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
              <h3 className="text-sm font-semibold text-slate-900"><i className="fa-solid fa-triangle-exclamation text-amber-500 mr-1.5" aria-hidden="true" />
                Are you sure you want to delete this candidate?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteCandidateId(null);
                  setConfirmDeleteCandidateName('');
                }}
                className="btn-circle"
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
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
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
              ><i className="fa-solid fa-trash mr-1.5" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fresh random 6-digit password per candidate; admin shares it with them.
const randomPassword = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

function AdminAddCandidateForm({ onBack, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    experience: '',
    password: randomPassword(),
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
    '.Net',
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
    'DevOps (AWS)',
    'DevOps (Azure)',
    'Data Analysts',
    'AEM',
    'Power BI',
    'Security',
    'Other',
  ];

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'mobile') {
      value = sanitizeCandidateMobileInput(value);
    } else if (field === 'password') {
      // Allow digits and symbols, max 6 characters (no letters)
      value = value.replace(/[a-zA-Z]/g, '').slice(0, 6);
    } else if (field === 'experience') {
      value = value.replace(/[^\d.]/g, '');
      let parts = value.split('.');
      if (parts.length > 2) {
        parts = [parts[0], parts.slice(1).join('')];
      }
      if (parts.length === 2 && parts[1].length > 2) {
        parts[1] = parts[1].slice(0, 2);
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
    if (!isValidCandidateMobile(trimmedMobile)) {
      setError('Enter valid 10-digit mobile number starting with 6-9.');
      return;
    }
    if (!trimmedPassword) {
      setError('Password is required and must be exactly 6 characters.');
      return;
    }
    if (!/^[^a-zA-Z\s]{6}$/.test(trimmedPassword)) {
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
    const validExpPattern = /^\d+(\.\d{1,2})?$/;
    if (!validExpPattern.test(trimmedExperience)) {
      setError('Experience must be a number between 0 and 20 with at most two decimal places.');
      return;
    }
    const expNum = parseFloat(trimmedExperience);
    if (Number.isNaN(expNum) || expNum < 0 || expNum > 20) {
      setError('Experience must be a number between 0 and 20 with at most two decimal places.');
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
        approvedByAdmin: true,
        technology: techString,
        // store both spellings for compatibility with existing data
        refereedBy: form.referredBy.trim(),
        referredBy: form.referredBy.trim(),
        experience: form.experience?.trim() || '',
        isActive: true,
        status: 'Active',
        lastActivatedAt: Date.now(),
        isSelected: false,
        selectedDate: '',
        selectedCompany: '',
        selectedPackage: '',
        joiningDate: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        regimeType: 'new-70',
      };

      // Password lives only in Firebase Auth. Candidate doc id === Auth uid (firestore.rules rely on it).
      const { data: authRes } = await adminSetCandidateAuth({ mobile: trimmedMobile, password: trimmedPassword });
      const docRef = doc(db, 'candidates', authRes.uid);
      try {
        await setDoc(docRef, candidateData);
      } catch (writeErr) {
        await adminDeleteCandidateAuth({ uid: authRes.uid }).catch(() => {});
        throw writeErr;
      }

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
        password: randomPassword(),
        technology: [],
        referredBy: '',
      });
      setShowPassword(true);
      setShowTechDropdown(false);
      setTechSearch('');
    } catch (err) {
      console.error(err);
      setError(friendlyMessage(err, 'Failed to add candidate.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6"
    >
      <PageHeader
        icon="fa-user-plus"
        title="Add New Candidate"
        onBack={onBack}
        backLabel="Back to candidates"
        parents={[{ label: 'Candidates', onClick: onBack }]}
      />

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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user mr-1.5 text-purple-500" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
            <span className="text-red-500">*</span> Mobile
          </label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={handleChange('mobile')}
            placeholder="10 digit number (6-9)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Password with random generator + show/hide icon - 6 chars (numbers/symbols) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-lock mr-1.5 text-purple-500" aria-hidden="true" />
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
            ><i className="fa-solid fa-shuffle mr-1.5" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-code mr-1.5 text-purple-500" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user-group mr-1.5 text-purple-500" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-briefcase mr-1.5 text-purple-500" aria-hidden="true" />
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

function AdminEditCandidateForm({ candidate, hrs = [], onBack, onSubmit }) {
  const [error, setError] = useState('');
  // HRs this candidate added (matched by addedById, else by addedBy name).
  const candidateHrs = useMemo(() => {
    const ids = new Set(
      [candidate?.firestoreId, candidate?.id, candidate?.mobile]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean),
    );
    const name = String(candidate?.name || '').trim().toLowerCase();
    return hrs.filter(
      (h) =>
        h.name &&
        (ids.has(String(h.addedById ?? '').trim()) ||
          (name && String(h.addedBy || '').trim().toLowerCase() === name)),
    );
  }, [hrs, candidate]);
  const [form, setForm] = useState({
    name: candidate?.name || '',
    mobile: candidate?.mobile || '',
    experience: candidate?.experience || '',
    password: '',
    technology: Array.isArray(candidate?.technologies)
      ? candidate.technologies.map((t) => normaliseTechLabelAdmin(t))
      : [],
    referredBy: candidate?.referredBy || 'Viraj Kadam Sir',
    ...selectionFormFromDoc(candidate || {}),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');

  // Current password from the admin-only copy (none for candidates whose password predates it).
  const candidateUid = candidate?.firestoreId;
  useEffect(() => {
    setSavedPassword('');
    setForm((prev) => ({ ...prev, password: '' }));
    if (!candidateUid) return undefined;
    let live = true;
    getDoc(doc(db, 'candidateSecrets', candidateUid))
      .then((snap) => {
        const pw = live && snap.exists() ? String(snap.data().password || '') : '';
        if (!pw) return;
        setSavedPassword(pw);
        setForm((prev) => ({ ...prev, password: pw }));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [candidateUid]);

  useEffect(() => {
    if (candidate) {
      setForm((prev) => ({
        name: candidate.name || '',
        mobile: candidate.mobile || '',
        experience: candidate.experience || '',
        password: prev.password,
        technology: Array.isArray(candidate.technologies)
          ? candidate.technologies.map((t) => normaliseTechLabelAdmin(t))
          : [],
        referredBy: candidate.referredBy || 'Viraj Kadam Sir',
        ...selectionFormFromDoc(candidate || {}),
      }));
    }
  }, [candidate]);

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'mobile') {
      value = sanitizeCandidateMobileInput(value);
    } else if (field === 'password') {
      // Allow digits and symbols, max 6 characters (no letters)
      value = value.replace(/[a-zA-Z]/g, '').slice(0, 6);
    } else if (field === 'experience') {
      value = value.replace(/[^\d.]/g, '');
      let parts = value.split('.');
      if (parts.length > 2) {
        parts = [parts[0], parts.slice(1).join('')];
      }
      if (parts.length === 2 && parts[1].length > 2) {
        parts[1] = parts[1].slice(0, 2);
      }
      value = parts.join('.');
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedMobile = form.mobile.trim();
    if (!trimmedMobile) {
      setError('Mobile number is required.');
      return;
    }
    if (!isValidCandidateMobile(trimmedMobile)) {
      setError('Enter valid 10-digit mobile number starting with 6-9.');
      return;
    }

    // Blank or unchanged = keep current password.
    const typedPassword = form.password?.trim();
    const trimmedPassword = typedPassword !== savedPassword ? typedPassword : '';
    if (trimmedPassword && !/^[^a-zA-Z\s]{6}$/.test(trimmedPassword)) {
      setError('Password must be exactly 6 characters (numbers and symbols only).');
      return;
    }

    const trimmedExperience = form.experience?.trim();
    if (!trimmedExperience) {
      setError('Experience is required.');
      return;
    }
    const validExpPattern = /^\d+(\.\d{1,2})?$/;
    if (!validExpPattern.test(trimmedExperience)) {
      setError('Experience must be a number between 0 and 20 with at most two decimal places.');
      return;
    }
    const expNum = parseFloat(trimmedExperience);
    if (Number.isNaN(expNum) || expNum < 0 || expNum > 20) {
      setError('Experience must be a number between 0 and 20 with at most two decimal places.');
      return;
    }

    if (form.selected) {
      const selectionError = validateSelection(form);
      if (selectionError) {
        setError(selectionError);
        return;
      }
    }

    try {
      const techString = form.technology.join(', ');

      const candidateData = {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        password: deleteField(), // purge any legacy plaintext password
        updatedAt: serverTimestamp(),
        approvedByAdmin: true,
        technology: techString,
        refereedBy: form.referredBy,
        referredBy: form.referredBy,
        experience: form.experience?.trim() || '',
        isActive: candidate?.status ? candidate.status === 'Active' : (candidate?.isActive !== false),
        status: candidate?.status ? candidate.status : (candidate?.isActive !== false ? 'Active' : 'Inactive'),
        lastActivatedAt:
          candidate?.lastActivatedAt ||
          ((candidate?.status === 'Active' || candidate?.isActive !== false) ? Date.now() : null),
        ...selectionPayload(form),
      };

      if (candidate?.firestoreId) {
        const mobileChanged = trimmedMobile !== String(candidate.mobile ?? '').trim();
        if (trimmedPassword || mobileChanged) {
          try {
            await adminSetCandidateAuth({
              uid: candidate.firestoreId,
              mobile: trimmedMobile,
              ...(trimmedPassword && { password: trimmedPassword }),
            });
          } catch (authErr) {
            setError(authErr?.message || 'Failed to update login details.');
            return;
          }
        }
        await updateDoc(doc(db, 'candidates', candidate.firestoreId), candidateData);
        await syncCandidateDisplayNameOnEvents({
          mobile: trimmedMobile,
          firestoreId: candidate.firestoreId,
          candidateName: form.name.trim(),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to update candidate in Firestore:', err);
    }

    onSubmit(form);
  };


  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6"
    >
      <PageHeader
        icon="fa-user-pen"
        title={`Edit ${form.name || 'Candidate'}`}
        onBack={onBack}
        backLabel="Back to candidates"
        parents={[{ label: 'Candidates', onClick: onBack }]}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* Name of Candidate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user mr-1.5 text-purple-500" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
            <span className="text-red-500">*</span> Mobile
          </label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={handleChange('mobile')}
            placeholder="10 digit number (6-9)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* Password with show/hide toggle - 6 digits only (mandatory) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-key mr-1.5 text-purple-500" aria-hidden="true" />
            Password
          </label>
          <div className="flex items-stretch">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange('password')}
              maxLength={6}
              placeholder={savedPassword ? '' : 'Not on record - type to set'}
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-code mr-1.5 text-purple-500" aria-hidden="true" />
            <span className="text-red-500">*</span> Technology
          </label>
          <TechMultiSelect value={form.technology} onChange={(technology) => setForm((prev) => ({ ...prev, technology }))} />
        </div>

        {/* Referred By dropdown - always visible in main form */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user-group mr-1.5 text-purple-500" aria-hidden="true" />
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
          <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-briefcase mr-1.5 text-purple-500" aria-hidden="true" />
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
        <SelectedToggle checked={form.selected} onChange={(selected) => setForm((prev) => ({ ...prev, selected }))} />
      </div>

      {/* Selected form: extra fields - only when Selected is ON */}
      {form.selected && <SelectedFields form={form} setForm={setForm} hrs={candidateHrs} />}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 justify-center rounded-full bg-sky-500 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-sky-600"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 border border-white/40">
            <i className="fa-solid fa-floppy-disk text-[10px]" aria-hidden="true" />
          </span>
          <span>Update Candidate</span>
        </button>
      </div>
    </form>
  );
}

// Slot reads are bounded: the Slots list loads only the week on screen, pending requests load on their own, and the full
// history is read once, only for the screens that need it (Candidates, Statistics, "All", a candidate's slots).
const NO_SLOTS = [];
const PENDING_STATUSES = ['pending', 'Pending', 'Pending Approval'];
const createdMs = (v) => v?.toMillis?.() ?? (v ? new Date(v).getTime() || 0 : 0);
const byNewest = (a, b) => createdMs(b.createdAt) - createdMs(a.createdAt);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// [Monday, next Monday) as YYYY-MM-DD; offset -1 = last week.
function weekBounds(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  const end = new Date(d);
  end.setDate(end.getDate() + 7);
  return [ymd(d), ymd(end)];
}

// Older events may carry only ids: fill candidate/HR names from one shared cached read of candidates/hrs.
async function enrichSlotNames(uiSlots) {
  const needCandidate = uiSlots.some((s) => !String(s.candidateName || s.name || '').trim() && String(s.candidateId || '').trim());
  const needHr = uiSlots.some((s) => !String(s.hrName || '').trim() && String(s.hrId || '').trim());
  if (!needCandidate && !needHr) return uiSlots;
  const [candidatesById, hrDocs] = await Promise.all([
    getCandidatesById(),
    needHr ? getCollectionDocs('hrs').catch(() => []) : [],
  ]);
  const hrById = new Map(hrDocs.map((d) => [d.id, d.data()]));
  return uiSlots.map((s) => {
    const candidateId = String(s.candidateId || '').trim();
    const candidateMobile = normalizeCandidateMobile(s.candidateMobile || s.mobile || candidateId);
    const hrId = String(s.hrId || '').trim();
    let candidateDoc = null;
    for (const key of [candidateMobile, candidateId].filter(Boolean)) {
      candidateDoc = candidatesById.get(key);
      if (candidateDoc) break;
    }
    const hrDoc = hrId ? hrById.get(hrId) : null;
    const candidateName = String(candidateDoc?.name || '').trim() || String(s.candidateName || s.name || '').trim();
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
}

// Live slots for one query, newest first, names filled in. Returns the unsubscribe function.
function listenSlots(q, onSlots, onError) {
  let live = true;
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const uiSlots = slotsSnapshotToUI(snapshot).sort(byNewest);
      onSlots(uiSlots);
      enrichSlotNames(uiSlots).then((e) => live && e !== uiSlots && onSlots(e)).catch(() => {});
    },
    onError,
  );
  return () => {
    live = false;
    unsubscribe();
  };
}
// Every event from the device copy (first load reads all; later only changed docs).
const fetchAllSlots = async (fresh) => enrichSlotNames(slotsSnapshotToUI({ docs: await getCollectionDocs('events', { fresh }) }).sort(byNewest));

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
  timeRange = 'thisWeek', // owned by the dashboard: it decides which week is read from Firestore
  onChangeTimeRange,
}) {
  const [companyFilter, setCompanyFilter] = useState('');
  const [hrFilter, setHrFilter] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showHrDropdown, setShowHrDropdown] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
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
      if (hrFilter && hrName !== hrFilter) return false;
      return true;
    });
  }, [slots, companyFilter, hrFilter, timeRange]);

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

  // Per-slot pieces shared by the desktop table and the phone cards.
  const slotInfo = (slot) => {
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

    const relativeDayLabel = getRelativeSlotDayLabel(slot.date);

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
    return { isPending, isApproved, statusIconClass, statusTextClass, statusLabel, relativeDayLabel, createdDatePart, createdTimePart, approvedDatePart, approvedTimePart, slotId };
  };
  const hrBlock = (slot) => {
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
              className="fa-solid fa-mobile-screen text-slate-500 w-3.5"
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
  };
  const slotActions = (slot, slotId, isPending) => (
    isPending ? (
      <div className="flex gap-2">
        <button
          onClick={() => onApproveSlot(slotId)}
          className="btn-action-label bg-emerald-500"
        >
          <i className="fa-solid fa-check" aria-hidden="true" />
          Approve
        </button>
        <button
          onClick={() => onRejectSlot(slotId)}
          className="btn-action-label bg-red-500"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
          Reject
        </button>
        <button
          type="button"
          className="btn-action bg-red-500"
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
          className="btn-action bg-red-500"
          onClick={() => {
            setConfirmDeleteSlotId(slotId);
            setConfirmDeleteSlotName(slot.candidateName || slot.company || '');
          }}
          aria-label="Delete"
        >
          <i className="fa-solid fa-trash" aria-hidden="true" />
        </button>
      </div>
    )
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-calendar-days"
        title="Slots"
        onBack={onBackToHome}
        backLabel="Back to home"
        extra={
          <button
            type="button"
            onClick={() => {
              onChangeFilter('all');
              onChangeSearch('');
              onChangeTimeRange('thisWeek');
              setCompanyFilter('');
              setHrFilter('');
              setCompanySearch('');
              setHrSearch('');
            }}
            className="btn-circle"
            aria-label="Reset filters"
            title="Reset filters"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        }
      />

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Metrics + Filters: single row */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {/* Left: metrics */}
        <div className="flex flex-wrap gap-6 text-xs sm:text-sm text-slate-700">
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {approvedFilteredSlots.length}
            </span>
            <span className="text-[11px] text-slate-500"><i className="fa-solid fa-calendar-days mr-1" aria-hidden="true" />Total Slots</span>
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
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-auto" ref={filtersRef}>
          <select
            value={timeRange}
            onChange={(e) => onChangeTimeRange(e.target.value)}
            className="filter-select w-auto"
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
                setShowHrDropdown(false);
              }}
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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

          {/* HR searchable dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowHrDropdown((v) => !v);
                setShowCompanyDropdown(false);
              }}
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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
            className="filter-select w-auto"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <div className="relative w-28 sm:w-36">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search slot"
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="filter-search"
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
        <>
        {/* Phones: one card per slot (same data and actions as the table) */}
        <div className="md:hidden space-y-3">
          {paginatedSlots.map((slot) => {
            const { isPending, isApproved, statusIconClass, statusTextClass, statusLabel, relativeDayLabel, approvedDatePart, approvedTimePart, slotId } = slotInfo(slot);
            const who = slot.candidateName || slot.name;
            return (
              <div key={slotId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {who ? (
                      <button type="button" onClick={() => onOpenCandidateSlots && onOpenCandidateSlots(who.trim())}
                        className="text-left text-sm font-semibold text-purple-600 hover:underline">{who}</button>
                    ) : <span className="text-sm text-slate-400">-</span>}
                    <p className="text-xs text-slate-600">
                      {[slot.company || slot.companyName, slot.technology, normaliseRoundLabelAdmin(slot.round)].filter(Boolean).join(' · ') || '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <i className={statusIconClass} aria-hidden="true" />
                    <span className={`text-[11px] font-semibold ${statusTextClass}`}>{statusLabel}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-700">
                  <i className="fa-solid fa-calendar-day mr-1.5 text-slate-400" aria-hidden="true" />
                  {slot.dateExactLabel || slot.dateLabel || '-'}
                  {relativeDayLabel && <span className="ml-1 font-semibold text-emerald-600">({relativeDayLabel})</span>}
                  {slot.timeLabel && <span className="text-slate-500"> · {slot.timeLabel}</span>}
                </p>
                {isApproved && (approvedDatePart || approvedTimePart) && (
                  <p className="text-[11px] text-slate-500">Approved {approvedDatePart}{approvedTimePart && `, ${approvedTimePart}`}</p>
                )}
                <div className="mt-2 text-xs text-slate-700">{hrBlock(slot)}</div>
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{slotActions(slot, slotId, isPending)}</div>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
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
                  <i className="fa-solid fa-calendar-days mr-1" aria-hidden="true" />Slot Date Time
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
                const { isPending, isApproved, statusIconClass, statusTextClass, statusLabel, relativeDayLabel, createdDatePart, createdTimePart, approvedDatePart, approvedTimePart, slotId } = slotInfo(slot);
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
                      {hrBlock(slot)}
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
                          {relativeDayLabel && (
                            <span className="text-emerald-600 font-semibold ml-1">
                              ({relativeDayLabel})
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
                      {slotActions(slot, slotId, isPending)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
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
              <h3 className="text-sm font-semibold text-slate-900"><i className="fa-solid fa-triangle-exclamation text-amber-500 mr-1.5" aria-hidden="true" />
                Are you sure you want to delete this slot?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotName('');
                }}
                className="btn-circle"
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
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
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
              ><i className="fa-solid fa-trash mr-1.5" aria-hidden="true" />
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
  search,
  onBackToHome,
  onReload,
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

  const handleDownloadCsv = () => {
    if (!filteredRows.length) {
      window.alert('No HR data found to export');
      return;
    }

    const headers = ['Sr No', 'HR Name', 'Email', 'Mobile', 'Company', 'Technology'];
    const rows = filteredRows.map((hr, index) => [
      index + 1,
      String(hr.name || '').trim(),
      String(hr.email || '').trim(),
      String(hr.mobile || '').trim(),
      String(hr.company || '').trim(),
      String(hr.technology || '').trim(),
    ]);

    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ];
    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], {
      type: 'text/csv;charset=utf-8',
    });
    saveAs(blob, 'hr-data.csv');
  };

  const handleSubmit = async (e) => {
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

    const excludeFirestoreId =
      modalMode === 'edit' && editingId != null
        ? String(hrs.find((h) => h.id === editingId)?.firestoreId || '').trim() || null
        : null;

    try {
      const duplicateErrors = await getHrDuplicateFieldErrors({
        email,
        mobile,
        excludeFirestoreId,
      });
      if (Object.keys(duplicateErrors).length > 0) {
        setHrFormErrors((prev) => ({ ...prev, ...duplicateErrors }));
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to verify HR duplicates:', err);
      setHrFormErrors((prev) => ({
        ...prev,
        email: prev.email || 'Could not verify HR details. Please try again.',
      }));
      return;
    }

    try {
      if (modalMode === 'edit' && onUpdateHR && editingId != null) {
        await onUpdateHR(editingId, form);
      } else if (onAddHR) {
        await onAddHR(form);
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
    } catch (err) {
      if (err?.fieldErrors) {
        setHrFormErrors((prev) => ({ ...prev, ...err.fieldErrors }));
      }
    }
  };

  // Row pieces shared by the desktop table and the phone cards.
  const addedBy = (hr) => {
    const addedByRaw = String(hr.addedBy || '').trim();
    if (!addedByRaw) return '–';

    // Hide internal ids/uids/mobiles in "Added By" column
    const looksLikeIdOrMobile = (val) => {
      const s = String(val || '').trim();
      if (!s) return false;
      if (/^\d{8,}$/.test(s)) return true; // mobile-like
      if (/^[A-Za-z0-9_-]{15,}$/.test(s) && !/\s/.test(s)) return true; // uid/firestore-like
      return false;
    };
    if (looksLikeIdOrMobile(addedByRaw)) return '–';

    const isAdminAdded = addedByRaw.toLowerCase() === 'admin';
    const hasCandidate =
      !isAdminAdded &&
      Array.isArray(candidateNames) &&
      candidateNames.includes(addedByRaw.toLowerCase());

    if (isAdminAdded) {
      return addedByRaw;
    }

    // If it's a known candidate, allow opening candidate view.
    if (hasCandidate && onOpenCandidateView) {
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
  };
  const hrActions = (hr) => (
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
        className="btn-action bg-amber-400"
        aria-label="Edit HR"
      >
        <i className="fa-solid fa-pen" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="btn-action bg-red-500"
        onClick={() => {
          setConfirmDeleteId(hr.id);
          setConfirmDeleteName(hr.name || '');
        }}
        aria-label="Delete HR"
      >
        <i className="fa-solid fa-trash" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-user-tie"
        title="HRs"
        onBack={onBackToHome}
        backLabel="Back"
        extra={
          <button type="button" onClick={onReload} className="btn-circle" aria-label="Reload HRs" title="Reload HRs">
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        }
        actions={
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
            className="btn-pill bg-emerald-500"
            aria-label="Add New HR"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Add New HR</span>
          </button>
        }
      />

      {/* Filters + total count row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Left: total HRs */}
        <StatCounts items={[['Total', filteredRows.length]]} gap="gap-2 sm:gap-3" />

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
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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
              className="flex items-center h-8 w-32 sm:w-40 rounded-full border border-slate-200 bg-white px-3 text-[11px] sm:text-xs text-slate-700 justify-between"
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
              <div className="absolute z-20 mt-1 w-full min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto text-[11px] sm:text-xs">
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
          <div className="relative w-28 sm:w-36">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search HRs"
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              className="filter-search"
            />
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 h-8 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] sm:text-xs font-semibold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap"
          >
            <i className="fa-solid fa-file-arrow-down text-emerald-600" aria-hidden="true" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Phones: one card per HR (same data and actions as the table) */}
      <div className="md:hidden space-y-3">
        {paginatedRows.length === 0 && (
          <p className="rounded-lg border border-slate-200 px-4 py-6 text-center text-xs text-slate-500">No HRs found.</p>
        )}
        {paginatedRows.map((hr) => (
          <div key={hr.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  <i className="fa-solid fa-user-tie mr-1.5 text-purple-500" aria-hidden="true" />
                  {toTitleCase(hr.name || '')}
                </p>
                <p className="text-xs text-slate-600">
                  {[toTitleCase(hr.company || ''), toTitleCase(hr.technology || ''), toTitleCase(hr.jobType || '')].filter(Boolean).join(' · ') || '-'}
                </p>
              </div>
              {hrActions(hr)}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-700">
              {hr.mobile && <a href={`tel:${hr.mobile}`} className="flex items-center gap-1.5 py-1.5"><i className="fa-solid fa-mobile-screen w-3.5 text-slate-400" aria-hidden="true" />{hr.mobile}</a>}
              {hr.email && <a href={`mailto:${hr.email}`} className="flex items-center gap-1.5 break-all py-1.5"><i className="fa-solid fa-envelope w-3.5 text-slate-400" aria-hidden="true" />{hr.email}</a>}
              <p className="text-slate-400">Added by: <span className="text-slate-700">{addedBy(hr)}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* HRs table - styled like Candidates table card */}
      <div className="hidden md:block overflow-x-auto">
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
                  {addedBy(hr)}
                </td>
                <td className="px-3 py-2">
                  {hrActions(hr)}
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
              <h3 className="text-sm font-semibold text-slate-900"><i className="fa-solid fa-triangle-exclamation text-amber-500 mr-1.5" aria-hidden="true" />
                Are you sure you want to delete?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setConfirmDeleteName('');
                }}
                className="btn-circle"
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
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
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
              ><i className="fa-solid fa-trash mr-1.5" aria-hidden="true" />
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
                className="btn-circle"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            {/* Fields grid - arranged like reference screenshot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Row 1: HR Name | Technology */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user-tie mr-1.5 text-purple-500" aria-hidden="true" />
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
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-code mr-1.5 text-purple-500" aria-hidden="true" />
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
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-envelope mr-1.5 text-purple-500" aria-hidden="true" />
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
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
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
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-business-time mr-1.5 text-purple-500" aria-hidden="true" />
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
                <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-building mr-1.5 text-purple-500" aria-hidden="true" />
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
function AdminCandidateSlotsView({ data, onBack, parent = 'Candidates' }) {
  const { name, candidate, slots } = data;

  const experience =
    candidate?.experience && String(candidate.experience).trim() && candidate.experience !== '-'
      ? candidate.experience
      : '0';
  const referredBy = candidate?.referredBy || 'Viraj Kadam Sir';
  const totalCount = slots.length || 0;
  const isSelectedCandidate = !!(candidate?.selected || candidate?.isSelected);
  const formatCandidateDateDisplay = (raw) => {
    if (!raw || raw === '-') return '-';
    const formatted = formatDateDDMMYYYY(raw);
    return formatted || String(raw);
  };

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

  const getSlotBookingTime = (slot) => {
    if (slot?.createdAt) {
      if (typeof slot.createdAt.toDate === 'function') {
        return slot.createdAt.toDate().getTime();
      }
      if (typeof slot.createdAt.toMillis === 'function') {
        return slot.createdAt.toMillis();
      }
      if (slot.createdAt.seconds != null) {
        return slot.createdAt.seconds * 1000 + (slot.createdAt.nanoseconds || 0) / 1e6;
      }
      const parsed = new Date(slot.createdAt).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (slot?.startISO) {
      const parsed = new Date(slot.startISO).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (slot?.date) {
      const baseDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
      const time = baseDate.getTime();
      if (!Number.isNaN(time)) {
        const sh = slot.startHour || 0;
        const sm = slot.startMinute || 0;
        return time + (sh * 60 + sm) * 60000;
      }
    }
    return 0;
  };

  // Sort chronologically ascending (first slot booked -> latest slot booked)
  const chronologicalSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      const timeDiff = getSlotBookingTime(a) - getSlotBookingTime(b);
      if (timeDiff !== 0) return timeDiff;
      const idA = String(a.id || a.firestoreId || '');
      const idB = String(b.id || b.firestoreId || '');
      return idA.localeCompare(idB);
    });
  }, [slots]);

  // The first 5 slots originally booked by the candidate (placed in the last row)
  const firstFiveSlots = useMemo(() => {
    const initialFive = chronologicalSlots.slice(0, 5);
    return [...initialFive].sort((a, b) => getSlotBookingTime(b) - getSlotBookingTime(a));
  }, [chronologicalSlots]);

  // Newly created slots booked after the first 5 slots (placed at the top, sorted newest first)
  const newlyCreatedSlots = useMemo(() => {
    const extra = chronologicalSlots.slice(5);
    return [...extra].sort((a, b) => getSlotBookingTime(b) - getSlotBookingTime(a));
  }, [chronologicalSlots]);

  const renderSlotCard = (slot, isFirstFive, key) => {
    const isApproved = slot.status === 'Approved';
    const isRejected = slot.status === 'Rejected';
    const timeLabelPlain = String(slot.timeLabel || '').split('(')[0].trim();
    const hasFiveOrMore = slots.length >= 5;
    const highlightFirstFive = isFirstFive && hasFiveOrMore;

    return (
      <div
        key={slot.id || key}
        className={`rounded-xl bg-white shadow-sm px-4 py-3 text-xs sm:text-sm text-slate-700 flex flex-col gap-1.5 ${
          highlightFirstFive
            ? 'border-2 border-red-500'
            : 'border border-slate-200'
        }`}
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
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-calendar-check"
        title={`Slots · ${name}`}
        onBack={onBack}
        backLabel={`Back to ${parent}`}
        parents={[{ label: parent, onClick: onBack }]}
        actions={
          <div className="text-[11px] sm:text-xs text-slate-600 whitespace-nowrap">
            Referred By: <span className="font-semibold text-slate-800">{referredBy}</span>
          </div>
        }
      />

      {/* Summary row: always one line; cells share the width and text shrinks on small screens */}
      <div className="mb-2 flex flex-nowrap items-start justify-between gap-1 sm:gap-3 text-slate-700">
        {[
          [`${experience} yrs`, 'Experience', 'Exp yrs', experience],
          [totalCount, 'Total Slots Booked', 'Total'],
          ...[
            ['Technical Round 1', 'Tech 1'],
            ['Screening Round', 'Screen'],
            ['Technical Round 2', 'Tech 2'],
            ['Technical Round 3', 'Tech 3'],
            ['Manageral Round', 'Mgr'],
            ['HR Round', 'HR'],
            ['Task Assesment', 'Task'],
          ].map(([round, short]) => [roundCounts[round] || 0, round, short]),
        ].map(([value, label, short, shortValue = value]) => (
          <div key={label} title={label} className="flex flex-1 min-w-0 flex-col items-center text-center">
            <span className="text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
              <span className="md:hidden">{shortValue}</span>
              <span className="hidden md:inline">{value}</span>
            </span>
            <span className="text-[10px] sm:text-[11px] leading-tight text-slate-500">
              <span className="md:hidden whitespace-nowrap">{short}</span>
              <span className="hidden md:inline">{label}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Summary row 2: selected candidate details */}
      {isSelectedCandidate && (
        <SelectedDetailsView candidate={candidate} formatDate={formatCandidateDateDisplay} />
      )}

      {/* Top section: Newly created slots (from 6th slot onwards, newest first) */}
      {newlyCreatedSlots.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {newlyCreatedSlots.map((slot, idx) => {
              const showSeparator =
                (idx + 1) % 5 === 0 && idx < newlyCreatedSlots.length - 1;
              return (
                <React.Fragment key={slot.id || `new-${idx}`}>
                  {renderSlotCard(slot, false, slot.id || `new-${idx}`)}
                  {showSeparator && (
                    <hr className="col-span-full border-t border-slate-300 my-2" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <hr className="border-t border-slate-300 my-4" />
        </>
      )}

      {/* Last row: Candidate's initial 5 slots (always 5 slots in one line in the last row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {firstFiveSlots.map((slot, idx) =>
          renderSlotCard(slot, true, slot.id || `first-${idx}`),
        )}
      </div>
    </div>
  );
}

function AdminLeavesTable({ onBackToHome }) {
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [savingLeave, setSavingLeave] = useState(false);
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
    if (!leaveDate) {
      setLeaveError('Please select a date.');
      return;
    }
    const cleanDate = String(leaveDate).trim();
    const alreadyExists = leaves.some(
      (l) => String(l.date || '').trim() === cleanDate,
    );
    if (alreadyExists) {
      setLeaveError('Leave for this date already exists.');
      return;
    }

    const dateLabel = formatLeaveDate(cleanDate);
    try {
      setSavingLeave(true);
      setLeaveError('');
      const id = await addLeaveToFirestore(cleanDate, dateLabel);
      setLeaves((prev) => [...prev, { id, date: cleanDate, dateLabel }]);
      setLeaveDate('');
      setShowAddLeave(false);
    } catch (err) {
      console.error('Failed to add leave:', err);
      setLeaveError(friendlyMessage(err, 'Failed to add leave. Please try again.'));
    } finally {
      setSavingLeave(false);
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
      <PageHeader
        icon="fa-umbrella-beach"
        title="Admin Leaves"
        onBack={onBackToHome}
        backLabel="Back to home"
        extra={
          <button
            type="button"
            className="btn-circle"
            aria-label="Reload leaves"
            title="Reload leaves"
            onClick={() => {
              getLeaves(true).then((list) => setLeaves(list));
            }}
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        }
        actions={
          <button
            type="button"
            onClick={() => {
              setLeaveDate('');
              setLeaveError('');
              setShowAddLeave(true);
            }}
            className="btn-pill bg-emerald-500"
            aria-label="Add New Leave"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Add New Leave</span>
          </button>
        }
      />

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
                      className="btn-action bg-red-500"
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
              <h3 className="text-sm font-semibold text-slate-900"><i className="fa-solid fa-triangle-exclamation text-amber-500 mr-1.5" aria-hidden="true" />
                Are you sure you want to delete this leave?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteLeaveId(null);
                  setConfirmDeleteLeaveLabel('');
                }}
                className="btn-circle"
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
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
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
              ><i className="fa-solid fa-trash mr-1.5" aria-hidden="true" />
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
              <h3 className="text-sm font-semibold text-slate-800"><i className="fa-solid fa-umbrella-beach mr-1.5" aria-hidden="true" />
                Add New Leave
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

            {/* Date field with single calendar icon */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1"><i className="fa-solid fa-calendar-day mr-1.5 text-purple-500" aria-hidden="true" />
                Date
              </label>
              <input
                type="date"
                ref={leaveDateInputRef}
                value={leaveDate}
                onChange={(e) => {
                  setLeaveError('');
                  setLeaveDate(e.target.value);
                }}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 cursor-pointer"
              />
              {leaveError && (
                <div className="mt-2 text-xs text-red-600 font-medium">
                  {leaveError}
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex justify-between mt-2">
              <button
                type="button"
                onClick={() => setShowAddLeave(false)}
                className="rounded-md border border-slate-200 px-4 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
                Close
              </button>
              <button
                type="button"
                disabled={savingLeave}
                onClick={handleSaveLeave}
                className="rounded-md bg-lime-500 disabled:opacity-50 px-5 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-lime-600"
              ><i className="fa-solid fa-floppy-disk mr-1.5" aria-hidden="true" />
                {savingLeave ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSettingsTab({
  slotSettings,
  onToggleSaturday,
  onUpdateStartTime,
  onUpdateEndTime,
  isSavingSlotSettings,
  settingsSavedMessage,
  onBackToHome,
}) {
  return (
    <div className="w-full min-h-[70vh] bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-gear"
        title="Settings"
        onBack={onBackToHome}
        backLabel="Back to home"
        actions={
          <>
            {settingsSavedMessage && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <i className="fa-solid fa-circle-check text-xs" /> {settingsSavedMessage}
              </span>
            )}
            {isSavingSlotSettings && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">
                <i className="fa-solid fa-circle-notch fa-spin text-xs" /> Saving...
              </span>
            )}
          </>
        }
      />
      <div className="space-y-4">

      {/* Option 1: Saturday Show / Hide Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm sm:text-base font-bold text-gray-900"><i className="fa-solid fa-calendar-days mr-1.5" aria-hidden="true" />
              Saturday Calendar & Slot Booking
            </h3>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                slotSettings.showSaturday
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {slotSettings.showSaturday ? 'Active / Show' : 'Hidden'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Default: Active / Show. When disabled, Saturday is hidden across all three calendars and locked in slot booking.
          </p>
        </div>

        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleSaturday}
            className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              slotSettings.showSaturday ? 'bg-purple-600' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={slotSettings.showSaturday}
            title={slotSettings.showSaturday ? 'Click to hide Saturday' : 'Click to show Saturday'}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                slotSettings.showSaturday ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Option 2: Slot Start Time setting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-gray-900"><i className="fa-solid fa-clock mr-1.5" aria-hidden="true" />
            Slot Start Time
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Default: 11:00 AM. Sets the earliest hour for slots across all calendars and slot booking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="settings-start-time-select" className="text-xs font-semibold text-slate-700 whitespace-nowrap"><i className="fa-solid fa-clock mr-1.5 text-purple-500" aria-hidden="true" />
            Start Time:
          </label>
          <select
            id="settings-start-time-select"
            value={
              START_TIME_OPTIONS.some((opt) => opt.value === slotSettings.startHour)
                ? slotSettings.startHour
                : DEFAULT_SLOT_SETTINGS.startHour
            }
            onChange={(e) => onUpdateStartTime(parseInt(e.target.value, 10))}
            className="text-xs sm:text-sm font-bold text-purple-800 bg-white border border-purple-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-400 focus:outline-none cursor-pointer transition-colors shadow-2xs"
          >
            {START_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Option 3: Slot End Time setting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-gray-900"><i className="fa-solid fa-hourglass-end mr-1.5" aria-hidden="true" />
            Slot End Time
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Default: 7:00 PM. Sets the latest hour for slots across all calendars and slot booking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="settings-end-time-select" className="text-xs font-semibold text-slate-700 whitespace-nowrap"><i className="fa-solid fa-hourglass-end mr-1.5 text-purple-500" aria-hidden="true" />
            End Time:
          </label>
          <select
            id="settings-end-time-select"
            value={
              END_TIME_OPTIONS.some((opt) => opt.value === slotSettings.endHour)
                ? slotSettings.endHour
                : DEFAULT_SLOT_SETTINGS.endHour
            }
            onChange={(e) => onUpdateEndTime(parseInt(e.target.value, 10))}
            className="text-xs sm:text-sm font-bold text-purple-800 bg-white border border-purple-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-400 focus:outline-none cursor-pointer transition-colors shadow-2xs"
          >
            {END_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      </div>
    </div>
  );
}

// Bar graph for Statistics tab – Y-axis rotated "Total Slots", fixed 0–80 scale, grid, x-axis month labels
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHART_BODY_HEIGHT = 320;
const Y_AXIS_MAX = 80; // Fixed scale 0–80 when showing all candidates

function statsCandidateRecordKey(candidate) {
  const mobile = normalizeCandidateMobile(candidate?.mobile);
  if (mobile) return `mobile:${mobile}`;
  const id = String(candidate?.firestoreId || candidate?.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(candidate?.name || '').trim();
  if (!name) return '';
  return `name:${name.toLowerCase()}`;
}

function AdminStatisticsChart({ slots = [], candidates = [], onReload, onBackToHome }) {
  const int = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const parseAnyDate = (value) => {
    if (!value) return null;
    try {
      if (value?.toDate) {
        const d = value.toDate();
        return Number.isNaN(d.getTime()) ? null : d;
      }
    } catch {
      // ignore
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const raw = String(value).trim();
    if (!raw) return null;
    // Supports yyyy-mm-dd, mm/dd/yyyy, dd/mm/yyyy (best-effort)
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const a = int(m[1]);
      const b = int(m[2]);
      const y = int(m[3]);
      // If day > 12, treat as dd/mm/yyyy; else default to mm/dd/yyyy
      const isDMY = a > 12;
      const mm = isDMY ? b : a;
      const dd = isDMY ? a : b;
      const d = new Date(y, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const [statsCandidateKey, setStatsCandidateKey] = useState('');
  const [candidatePickerOpen, setCandidatePickerOpen] = useState(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const statsCandidatePickerRef = useRef(null);

  useEffect(() => {
    const onDocDown = (e) => {
      if (!statsCandidatePickerRef.current?.contains(e.target)) {
        setCandidatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const candidateOptions = useMemo(() => {
    const byKey = new Map();
    for (const s of slots) {
      const key = statsSlotCandidateKey(s);
      if (!key) continue;
      const id = String(s.candidateId || '').trim();
      const name = String(s.candidateName || s.name || '').trim() || 'Unknown';
      if (!byKey.has(key)) {
        byKey.set(key, { key, name, id });
      } else {
        const cur = byKey.get(key);
        if (cur.name === 'Unknown' && name !== 'Unknown') cur.name = name;
      }
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [slots]);

  const selectedCandidate = useMemo(
    () => candidateOptions.find((c) => c.key === statsCandidateKey) || null,
    [candidateOptions, statsCandidateKey],
  );

  const filteredCandidateOptions = useMemo(() => {
    const q = candidateSearchQuery.trim().toLowerCase();
    if (!q) return candidateOptions;
    return candidateOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.id && c.id.toLowerCase().includes(q)),
    );
  }, [candidateOptions, candidateSearchQuery]);

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
      const totalSlots = slots.filter((s) => {
        if (statsCandidateKey && statsSlotCandidateKey(s) !== statsCandidateKey) return false;
        const slotD = getSlotDate(s);
        return slotD && slotD.getFullYear() === year && slotD.getMonth() === month;
      }).length;

      // Selected candidates count is based on candidate.selectedDate (from Selected view)
      const selectedCandidates = candidates.filter((c) => {
        const isSelected = !!(c?.selected || c?.isSelected);
        if (!isSelected) return false;
        if (statsCandidateKey && statsCandidateRecordKey(c) !== statsCandidateKey) return false;
        const sd = parseAnyDate(c?.selectedDate);
        return sd && sd.getFullYear() === year && sd.getMonth() === month;
      }).length;

      months.push({
        label: `${MONTH_LABELS[month]} ${year}`,
        totalSlots,
        selectedCandidates,
      });
    }
    return months;
  }, [slots, candidates, statsCandidateKey]);

  const peak = useMemo(
    () =>
      Math.max(
        0,
        ...monthlyStats.map((m) => (statsCandidateKey ? m.totalSlots : Math.max(m.totalSlots, m.selectedCandidates))),
      ),
    [monthlyStats, statsCandidateKey],
  );
  const yAxisMax = useMemo(() => {
    if (peak === 0) return Y_AXIS_MAX;
    const dynamic = Math.max(8, Math.ceil((peak * 1.15) / 4) * 4);
    return Math.max(Y_AXIS_MAX, dynamic);
  }, [peak]);

  const yTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => Math.round((yAxisMax * i) / n));
  }, [yAxisMax]);

  const searchFieldValue = candidatePickerOpen
    ? candidateSearchQuery
    : selectedCandidate
      ? selectedCandidate.name
      : 'All candidates';

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hoveredGreenIndex, setHoveredGreenIndex] = useState(null);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-chart-column"
        title="Statistics"
        onBack={onBackToHome}
        backLabel="Back to home"
        extra={
          typeof onReload === 'function' && (
            <button type="button" onClick={onReload} className="btn-circle" aria-label="Reload statistics" title="Reload statistics">
              <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
            </button>
          )
        }
      />

      <div className="max-w-lg mx-auto w-full relative" ref={statsCandidatePickerRef}>
        <label htmlFor="stats-candidate-search" className="block text-xs font-medium text-slate-600 mb-1"><i className="fa-solid fa-user mr-1.5 text-purple-500" aria-hidden="true" />
          Candidate
        </label>
        <div className="relative">
          <input
            id="stats-candidate-search"
            type="text"
            autoComplete="off"
            value={searchFieldValue}
            onChange={(e) => {
              setCandidateSearchQuery(e.target.value);
              setCandidatePickerOpen(true);
            }}
            onFocus={() => {
              setCandidatePickerOpen(true);
              setCandidateSearchQuery(selectedCandidate ? selectedCandidate.name : '');
            }}
            placeholder="Search candidate, then pick a name…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-expanded={candidatePickerOpen}
            aria-controls="stats-candidate-listbox"
            aria-autocomplete="list"
          />
          {(statsCandidateKey || candidateSearchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatsCandidateKey('');
                setCandidateSearchQuery('');
                setCandidatePickerOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Clear candidate filter"
            >
              <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
            </button>
          )}
        </div>
        {candidatePickerOpen && (
          <ul
            id="stats-candidate-listbox"
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={!statsCandidateKey}
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50"
                onClick={() => {
                  setStatsCandidateKey('');
                  setCandidateSearchQuery('');
                  setCandidatePickerOpen(false);
                }}
              ><i className="fa-solid fa-users mr-1.5" aria-hidden="true" />
                All candidates
              </button>
            </li>
            {filteredCandidateOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
            ) : (
              filteredCandidateOptions.map((c) => (
                <li key={c.key} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={statsCandidateKey === c.key}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
                      statsCandidateKey === c.key ? 'bg-indigo-50 font-medium text-indigo-900' : 'text-slate-800'
                    }`}
                    onClick={() => {
                      setStatsCandidateKey(c.key);
                      setCandidateSearchQuery(c.name);
                      setCandidatePickerOpen(false);
                    }}
                  >
                    {c.name}
                    {c.id ? <span className="ml-2 text-xs text-slate-400 tabular-nums">{c.id}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        {selectedCandidate ? (
          <p className="mt-2 text-center text-xs text-slate-600">
            Showing slots booked for <span className="font-semibold text-slate-800">{selectedCandidate.name}</span>
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-slate-500">All candidates — bar chart uses every slot</p>
        )}
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[720px] flex gap-0">
          {/* Y-axis: rotated "Total Slots" + tick labels */}
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
                className="text-xs sm:text-sm text-slate-600 font-semibold whitespace-nowrap"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center center',
                }}
              >
                Total Slots
              </span>
            </div>
            <div
              className="flex flex-col justify-between py-0 shrink-0 pl-1"
              style={{ height: CHART_BODY_HEIGHT }}
            >
              {[...yTicks].reverse().map((tick) => (
                <span key={tick} className="text-xs sm:text-sm text-slate-500 tabular-nums">
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
              <div className="absolute inset-0 flex flex-col pointer-events-none">
                {yTicks.slice(1).reverse().map((_, i) => (
                  <div key={i} className="flex-1 border-t border-slate-200" />
                ))}
                <div className="flex-shrink-0 border-t border-slate-200" style={{ height: 0 }} />
              </div>

              <div
                className="relative z-10 flex h-full items-end gap-0.5 w-full"
                style={{ height: CHART_BODY_HEIGHT }}
              >
                {monthlyStats.map((item, index) => {
                  const totalBarHeight =
                    yAxisMax > 0 ? (item.totalSlots / yAxisMax) * CHART_BODY_HEIGHT : 0;
                  const selectedBarHeight =
                    yAxisMax > 0 ? (item.selectedCandidates / yAxisMax) * CHART_BODY_HEIGHT : 0;
                  const isHovered = hoveredIndex === index;
                  const showSelectedCandidatesBar = !statsCandidateKey;
                return (
                  <div
                    key={item.label}
                    className="flex-1 min-w-0 flex flex-col items-center justify-end relative group"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                      {isHovered && hoveredGreenIndex !== index && (
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-1.5 rounded-md bg-slate-800/95 text-white text-xs font-medium whitespace-nowrap z-50 shadow-lg pointer-events-none"
                          role="tooltip"
                        >
                          {item.label}: {item.totalSlots} slot{item.totalSlots !== 1 ? 's' : ''}
                          {showSelectedCandidatesBar && item.selectedCandidates
                            ? ` · Selected candidates: ${item.selectedCandidates}`
                            : ''}
                        </div>
                      )}
                      <div
                        className="w-full max-w-[22px] flex flex-col-reverse"
                        style={{ minWidth: 14 }}
                      >
                        {/* Blue = slots */}
                        <div
                          className={`w-full rounded-t bg-indigo-500 ${isHovered ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                          style={{ height: `${Math.max(2, totalBarHeight)}px` }}
                        />
                        {/* Green = selected candidates (from selectedDate) shown ABOVE blue */}
                        {showSelectedCandidatesBar && item.selectedCandidates > 0 ? (
                          <div
                            className="mb-[2px] w-full rounded-t bg-green-500"
                            style={{ height: `${Math.max(3, selectedBarHeight)}px` }}
                            title={`Selected candidates: ${item.selectedCandidates}`}
                            onMouseEnter={() => setHoveredGreenIndex(index)}
                            onMouseLeave={() => setHoveredGreenIndex(null)}
                          />
                        ) : null}
                      </div>
                      {showSelectedCandidatesBar && hoveredGreenIndex === index && (
                        <div
                          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[120%] px-2 py-1 rounded-md bg-green-600 text-white text-xs font-semibold whitespace-nowrap z-50 shadow-lg pointer-events-none"
                          role="tooltip"
                        >
                          Selected candidates: {item.selectedCandidates}
                        </div>
                      )}
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
                  className="flex-1 min-w-0 text-[10px] leading-tight sm:text-sm text-slate-500 text-center sm:whitespace-nowrap"
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

const ProfileApp = lazy(() => import('../profile/App.jsx'));
const profileTabFor = (hash) => (/^#\/(resumes|r\/)/.test(hash) ? 'resumes' : 'profiles');

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
  // Profiles / Resumes tabs keep their page in the URL hash (#/…, see src/profile/App.jsx); the hash picks the tab,
  // so links like /admin-dashboard#/m/<mobile> and Back/Forward between profile pages land on the right tab.
  const location = useLocation();
  useEffect(() => {
    if (location.hash.startsWith('#/')) setActiveTab(profileTabFor(location.hash));
  }, [location.hash]);
  const changeTab = async (tab) => {
    if (tab === 'profiles' || tab === 'resumes') {
      window.location.hash = tab === 'resumes' ? '#/resumes' : '#/candidates'; // profile pages ask about unsaved edits themselves
    } else if (window.location.hash) {
      if (!(await mayLeave())) return; // unsaved profile / resume edits
      navigated();
      window.history.replaceState(window.history.state, '', window.location.pathname); // leave the profile page address
    }
    setActiveTab(tab);
    // When user navigates via main tabs, default HR back to home
    if (tab === 'hrs') {
      setHrBackTab('home');
    }
  };
  const [showAddForm, setShowAddForm] = useState(false);
  // Breadcrumbs above every page card: Home (closes any open sub-page) › what the page's header reports.
  const [trail, setTrail] = useState(null);
  const homeCrumb = {
    label: 'Home',
    icon: 'fa-house',
    onClick: () => {
      setShowAddForm(false);
      setEditingCandidate(null);
      setSelectedViewCandidate(null);
      setSelectedSlotsCandidate(null);
      changeTab('home');
    },
  };
  // Default to showing Unselected candidates, matching your other project
  const [candidateSelectionFilter, setCandidateSelectionFilter] = useState('unselected'); // 'selected' | 'unselected'
  const [candidateTechnologyFilter, setCandidateTechnologyFilter] = useState('all');
  const [candidateReferredByFilter, setCandidateReferredByFilter] = useState('all'); // 'all' | 'anil_sir' | 'viraj_sir' | 'nilesh_sir' | 'vishal_sir'
  const [candidateStatusFilter, setCandidateStatusFilter] = useState('active'); // 'all' | 'active' | 'inactive'
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [showHrSuccessToast, setShowHrSuccessToast] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarSelectedEvent, setCalendarSelectedEvent] = useState(null);
  const [showDeleteCalendarSlotConfirm, setShowDeleteCalendarSlotConfirm] = useState(false);
  const [isDeletingCalendarSlot, setIsDeletingCalendarSlot] = useState(false);
  const adminTodayLabel = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const [slotSettings, setSlotSettings] = useState(() => getStoredSlotSettings());
  const [isSavingSlotSettings, setIsSavingSlotSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToSlotSettings((settings) => {
      setSlotSettings(settings);
    });
    return () => unsubscribe();
  }, []);

  const handleToggleSaturday = async () => {
    const nextValue = !slotSettings.showSaturday;
    const updated = normalizeSlotSettings({ ...slotSettings, showSaturday: nextValue });
    setSlotSettings(updated);
    setIsSavingSlotSettings(true);
    try {
      await saveSlotSettings(updated);
      setSettingsSavedMessage('Saved');
      setTimeout(() => setSettingsSavedMessage(''), 2500);
    } catch (err) {
      console.error('Failed to save Saturday setting:', err);
    } finally {
      setIsSavingSlotSettings(false);
    }
  };

  const handleUpdateStartTime = async (newVal) => {
    const hour =
      typeof newVal === 'number'
        ? newVal
        : parseHourFromLabel(newVal);
    if (hour == null || Number.isNaN(hour)) return;

    let eHour = slotSettings.endHour ?? 19;
    if (eHour <= hour) {
      eHour = Math.min(23, hour + 1);
    }
    const updated = normalizeSlotSettings({
      ...slotSettings,
      startHour: hour,
      endHour: eHour,
      slotStartTime: formatHourToLabel(hour),
      slotEndTime: formatHourToLabel(eHour),
      startTime: formatHourTo24(hour),
      endTime: formatHourTo24(eHour),
    });
    setSlotSettings(updated);
    setIsSavingSlotSettings(true);
    try {
      await saveSlotSettings(updated);
      setSettingsSavedMessage('Saved');
      setTimeout(() => setSettingsSavedMessage(''), 2500);
    } catch (err) {
      console.error('Failed to save start time setting:', err);
    } finally {
      setIsSavingSlotSettings(false);
    }
  };

  const handleUpdateEndTime = async (newVal) => {
    const hour =
      typeof newVal === 'number'
        ? newVal
        : parseHourFromLabel(newVal);
    if (hour == null || Number.isNaN(hour)) return;

    let sHour = slotSettings.startHour ?? 11;
    if (hour <= sHour) {
      sHour = Math.max(0, hour - 1);
    }
    const updated = normalizeSlotSettings({
      ...slotSettings,
      startHour: sHour,
      endHour: hour,
      slotStartTime: formatHourToLabel(sHour),
      slotEndTime: formatHourToLabel(hour),
      startTime: formatHourTo24(sHour),
      endTime: formatHourTo24(hour),
    });
    setSlotSettings(updated);
    setIsSavingSlotSettings(true);
    try {
      await saveSlotSettings(updated);
      setSettingsSavedMessage('Saved');
      setTimeout(() => setSettingsSavedMessage(''), 2500);
    } catch (err) {
      console.error('Failed to save end time setting:', err);
    } finally {
      setIsSavingSlotSettings(false);
    }
  };

  // Load candidates from Firestore on mount.
  // Mirrors the working project logic: read directly from "candidates" only.
  useEffect(() => {
    const loadCandidatesFromFirestore = async () => {
      try {
        const docs = await getCollectionDocs('candidates');
        if (docs.length === 0) {
          setCandidates([]);
          return;
        }

        const createdSec = {};
        const list = docs.map((docSnap) => {
          const d = docSnap.data() || {};

          // Normalise technology into array for this UI
          let technologies = [];
          if (Array.isArray(d.technologies)) {
            technologies = d.technologies;
          } else if (Array.isArray(d.technology)) {
            technologies = d.technology;
          } else if (typeof d.technologies === 'string' && d.technologies.trim()) {
            technologies = d.technologies.split(',').map((t) => t.trim()).filter(Boolean);
          } else if (typeof d.technology === 'string' && d.technology.trim()) {
            technologies = d.technology.split(',').map((t) => t.trim()).filter(Boolean);
          }

          // Keep both spellings so filters work
          const referredBy = d.referredBy || d.refereedBy || '';
          createdSec[docSnap.id] = d.createdAt?.seconds || 0;

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
            status: d.isActive === false ? 'Inactive' : (d.status || 'Active'),
            isActive: d.isActive !== false,
            lastActivatedAt: d.lastActivatedAt || d.reactivatedAt || null,
            selected: !!(d.isSelected || d.selected),
            isSelected: !!(d.isSelected || d.selected),
            referredBy,
            password: String(d.password ?? '').trim(),
            // Selected candidate details (if present from Firestore)
            selectedDate: d.selectedDate || '',
            joiningDate: d.joiningDate || '',
            selectedCompany: d.selectedCompany || '',
            package: d.selectedPackage || d.package || '',
            hrName: d.hrName || '',
            hrMobile: d.hrMobile || '',
            hrEmail: d.hrEmail || '',
            hrLinkedin: d.hrLinkedin || '',
            candidateEmail: d.candidateEmail || d.email || '',
            candidateMobile: d.candidateMobile || '',
            motherName: d.motherName || '',
            motherMobile: d.motherMobile || '',
            fatherName: d.fatherName || '',
            fatherMobile: d.fatherMobile || '',
            brotherName: d.brotherName || '',
            brotherMobile: d.brotherMobile || '',
            sisterName: d.sisterName || '',
            sisterMobile: d.sisterMobile || '',
            aadhar: d.aadhar || '',
            pan: d.pan || '',
            familyMemberName: d.familyMemberName || '',
            familyMemberMobile: d.familyMemberMobile || '',
            permanentAddress: d.permanentAddress || d.permAddress || '',
            temporaryAddress: d.temporaryAddress || d.tempAddress || '',
            permAddress: d.permanentAddress || d.permAddress || '',
            tempAddress: d.temporaryAddress || d.tempAddress || '',
          };
        });

        // Sort newest first by createdAt if present, otherwise by id
        list.sort((a, b) => {
          const aSec = createdSec[a.id];
          const bSec = createdSec[b.id];
          if (aSec !== bSec) return bSec - aSec;
          return String(b.id).localeCompare(String(a.id));
        });

        setCandidates(list);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading candidates from Firestore:', err);
        setCandidates([]);
      } finally {
        setCandidatesLoaded(true);
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

  // HRs from the device copy (only changed docs are read); bumped after each HR write to pick it up.
  const [hrsReloadKey, setHrsReloadKey] = useState(0);
  const reloadHrs = () => setHrsReloadKey((k) => k + 1);
  useEffect(() => {
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
    
    getCollectionDocs('hrs', { fresh: hrsReloadKey > 0 }).then(
      async (hrDocs) => {
        const firestoreHRs = [];

        hrDocs.forEach((doc) => {
          const data = doc.data();
          firestoreHRs.push({
            id: doc.id, // stable key; numbering per snapshot made local handlers hit the wrong row
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

        // Resolve from the shared candidates list (one cached read) instead of a getDoc per HR.
        const candidatesById = needAddedByIds.length ? await getCandidatesById() : new Map();

        if (cancelled) return;

        const enrichedFirestoreHRs = firestoreHRs.map((h) => {
          const rawAddedBy = String(h.addedBy || '').trim();
          // If addedBy is a real name, keep it.
          if (rawAddedBy && rawAddedBy.toLowerCase() !== 'candidate' && rawAddedBy.toLowerCase() !== 'admin' && !looksLikeIdOrMobile(rawAddedBy)) {
            return { ...h, addedBy: rawAddedBy };
          }

          const key = String(h.addedById || '').trim() || (looksLikeIdOrMobile(rawAddedBy) ? rawAddedBy : '');
          const candidateDoc = key ? candidatesById.get(key) : null;
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

        setHrs(enrichedFirestoreHRs);
      },
      (err) => {
        console.error('Error loading HRs:', err);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [hrsReloadKey]);

  const [slotFilter, setSlotFilter] = useState('all');
  const [slotSearch, setSlotSearch] = useState('');
  const [slotRange, setSlotRange] = useState('thisWeek'); // Slots tab: This Week / Last Week (live) or All (history)
  const [weekSlots, setWeekSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(null);

  // Slots list: only the week on screen, live (candidate bookings appear here as pending requests).
  useEffect(() => {
    if (slotRange === 'all') return undefined;
    setSlotsLoading(true);
    setSlotsError(null);
    const [from, to] = weekBounds(slotRange === 'lastWeek' ? -1 : 0);
    return listenSlots(
      query(collection(db, 'events'), where('date', '>=', from), where('date', '<', to)),
      (list) => {
        setWeekSlots(list);
        setSlotsLoading(false);
      },
      (err) => {
        console.error('Error loading slots:', err);
        setSlotsError(err);
        setSlotsLoading(false);
      },
    );
  }, [slotRange]);

  // Pending requests (header count + approval cards), any date, live.
  const [pendingSlots, setPendingSlots] = useState([]);
  useEffect(
    () => listenSlots(query(collection(db, 'events'), where('status', 'in', PENDING_STATUSES)), setPendingSlots, (err) => console.error('Error loading pending slots:', err)),
    [],
  );

  // Full history: read once (not live), only when a screen needs it; Statistics' Reload reads it again.
  const [allSlots, setAllSlots] = useState(null);
  const slots = allSlots ?? NO_SLOTS;
  const historyRef = useRef(null);
  const loadHistory = (fresh = false) => {
    if (fresh || !historyRef.current) {
      const run = fetchAllSlots(fresh);
      historyRef.current = run;
      run.then(
        (list) => historyRef.current === run && setAllSlots(list),
        (err) => {
          if (historyRef.current === run) historyRef.current = null;
          console.error('Error loading slots:', err);
          setSlotsError(err);
        },
      );
    }
    return historyRef.current.catch(() => allSlots ?? []);
  };
  const needsHistory = ['candidates', 'stats', 'slots', 'profiles', 'resumes'].includes(activeTab); // profiles/resumes: active status
  useEffect(() => {
    if (needsHistory) loadHistory();
  }, [needsHistory]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (slotRange === 'all') setSlotsLoading(!allSlots);
  }, [slotRange, allSlots]);

  // Slots tab summary (this/last week, averages over 4 weeks / 30 days): slots from 30 days ago onwards,
  // taken from the history copy (no extra reads).
  const recentSlots = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);
    return slots.filter((s) => s.date instanceof Date && s.date >= since);
  }, [slots]);

  // Profiles / Resumes list only Active candidates (same status as the Candidates list), matched by mobile.
  // null until candidates and slot history are in, so the lists never flash inactive candidates.
  const activeMobiles = useMemo(() => {
    if (!candidatesLoaded || (!allSlots && !slotsError)) return null;
    const active = candidates.filter((c) => ((c.selected || c.isSelected)
      ? (c.status ? c.status : (c.isActive !== false ? 'Active' : 'Inactive'))
      : getCandidateAccountStatus(c, slots)) === 'Active');
    return new Set(active.map((c) => normalizeMobile(c.mobile).slice(-10)).filter((m) => m.length === 10));
  }, [candidatesLoaded, candidates, allSlots, slotsError, slots]);

  // Automatically sync candidate account inactivity to Firestore if their last interview was > 2 weeks ago
  // Each doc is written once per session and mirrored into local state; previously every slots
  // snapshot re-wrote the same docs because local status stayed 'Active'.
  const autoDeactivatedRef = useRef(new Set());
  useEffect(() => {
    if (!slots || slots.length === 0 || !candidates || candidates.length === 0) return;

    candidates.forEach(async (c) => {
      const docId = c.firestoreId || c.id;
      if (!docId || c.status !== 'Active' || autoDeactivatedRef.current.has(docId)) return;
      if (!isCandidateInterviewOlderThanTwoWeeks(slots, c)) return;
      autoDeactivatedRef.current.add(docId);
      try {
        await updateDoc(doc(db, c.sourceCollection || 'candidates', docId), { isActive: false, status: 'Inactive', updatedAt: serverTimestamp() });
        setCandidates((prev) =>
          prev.map((x) => ((x.firestoreId || x.id) === docId ? { ...x, isActive: false, status: 'Inactive' } : x)),
        );
      } catch (err) {
        console.error('Failed to auto-update candidate inactive status in Firestore:', err);
      }
    });
  }, [slots, candidates]);

  const [selectedSlotsCandidate, setSelectedSlotsCandidate] = useState(null);
  const [selectedViewCandidate, setSelectedViewCandidate] = useState(null);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [hrs, setHrs] = useState([]);
  const [hrSearch, setHrSearch] = useState('');
  const filteredSlots = useMemo(() => {
    return (slotRange === 'all' ? slots : weekSlots).filter((slot) => {
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
        const candidateMobile = normalizeCandidateMobile(
          slot.candidateMobile || slot.candidateId || '',
        );
        const company = (slot.company || '').toLowerCase();
        if (
          !candidateName.includes(q) &&
          !company.includes(q) &&
          !candidateMobile.includes(q.replace(/\D/g, ''))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [slots, weekSlots, slotRange, slotFilter, slotSearch]);

  const candidateTechOptions = useMemo(() => {
    const seen = new Set();
    CANDIDATE_TECH_OPTIONS.forEach((t) => {
      const norm = normaliseTechLabelAdmin(t).trim();
      if (norm) seen.add(norm);
    });
    candidates.forEach((c) => {
      const cTechs = (
        Array.isArray(c.technologies)
          ? c.technologies
          : Array.isArray(c.technology)
          ? c.technology
          : typeof c.technology === 'string'
          ? c.technology.split(',')
          : typeof c.technologies === 'string'
          ? c.technologies.split(',')
          : []
      );
      cTechs.forEach((t) => {
        const norm = normaliseTechLabelAdmin(String(t).trim()).trim();
        if (norm) seen.add(norm);
      });
    });
    return Array.from(seen).sort((a, b) => {
      if (a.toLowerCase() === 'other') return 1;
      if (b.toLowerCase() === 'other') return -1;
      return a.localeCompare(b);
    });
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter((c) => {
      const isSelected = !!(c.selected || c.isSelected);
      if (candidateSelectionFilter === 'selected' && !isSelected) return false;
      if (candidateSelectionFilter === 'unselected' && isSelected) return false;

      const effectiveStatus = isSelected
        ? (c.status ? c.status : (c.isActive !== false ? 'Active' : 'Inactive'))
        : getCandidateAccountStatus(c, slots);

      if (candidateStatusFilter === 'active' && effectiveStatus !== 'Active') return false;
      if (candidateStatusFilter === 'inactive' && effectiveStatus !== 'Inactive') return false;

      if (candidateTechnologyFilter && candidateTechnologyFilter !== 'all') {
        const candidateTechs = (
          Array.isArray(c.technologies)
            ? c.technologies
            : Array.isArray(c.technology)
            ? c.technology
            : typeof c.technology === 'string'
            ? c.technology.split(',')
            : typeof c.technologies === 'string'
            ? c.technologies.split(',')
            : []
        )
          .map((t) => normaliseTechLabelAdmin(String(t).trim()).toLowerCase())
          .filter(Boolean);

        const target = normaliseTechLabelAdmin(candidateTechnologyFilter).trim().toLowerCase();
        if (!candidateTechs.includes(target)) {
          return false;
        }
      }

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
  }, [candidates, slots, candidateSelectionFilter, candidateTechnologyFilter, candidateReferredByFilter, candidateStatusFilter, candidateSearch]);

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

  const pendingApprovals = pendingSlots.length;

  const handleToggleStatus = async (id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    const isSelected = !!(candidate.selected || candidate.isSelected);
    const currentEffective = isSelected
      ? (candidate.status ? candidate.status : (candidate.isActive !== false ? 'Active' : 'Inactive'))
      : getCandidateAccountStatus(candidate, slots);
    const newStatus = currentEffective === 'Active' ? 'Inactive' : 'Active';
    const isActive = newStatus === 'Active';
    const lastActivatedAt = isActive ? Date.now() : null;

    // Optimistic UI update
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: newStatus,
              isActive,
              lastActivatedAt,
            }
          : c,
      ),
    );

    // Persist to Firestore so inactive candidates cannot log in
    try {
      const docId = candidate.firestoreId || candidate.id;
      const collectionName = candidate.sourceCollection || 'candidates';
      const updatePayload = {
        isActive,
        status: newStatus,
        lastActivatedAt,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, collectionName, docId), updatePayload);
    } catch (err) {
      // Revert on failure
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: candidate.status,
                isActive: candidate.isActive,
                lastActivatedAt: candidate.lastActivatedAt,
              }
            : c,
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
        await adminDeleteCandidateAuth({ uid: candidate.firestoreId });
        await deleteDoc(doc(db, collectionName, candidate.firestoreId));
        forgetSyncedDoc(collectionName, candidate.firestoreId);
      } else if (candidate.mobile) {
        // Fallback: look up by mobile if we don't have firestoreId
        const q = query(
          collection(db, collectionName),
          where('mobile', '==', candidate.mobile),
        );
        const snap = await getDocs(q);
        const batchDeletions = [];
        snap.forEach((docSnap) => {
          batchDeletions.push(
            adminDeleteCandidateAuth({ uid: docSnap.id })
              .then(() => deleteDoc(doc(db, collectionName, docSnap.id)))
              .then(() => forgetSyncedDoc(collectionName, docSnap.id)),
          );
        });
        await Promise.all(batchDeletions);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete candidate:', err);
    }
  };

  const handleViewCandidate = async (id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (candidate) {
      const candidateSlots = (await loadHistory()).filter((s) => slotMatchesCandidate(s, candidate));
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
          hrName: d.hrName || candidate.hrName || '',
          hrMobile: d.hrMobile || candidate.hrMobile || '',
          hrEmail: d.hrEmail || candidate.hrEmail || '',
          hrLinkedin: d.hrLinkedin || candidate.hrLinkedin || '',
          candidateEmail: d.candidateEmail || d.email || candidate.candidateEmail || candidate.email || '',
          candidateMobile: d.candidateMobile || candidate.candidateMobile || String(d.mobile ?? d.phone ?? '').trim(),
          motherName: d.motherName || candidate.motherName || '',
          motherMobile: d.motherMobile || candidate.motherMobile || '',
          fatherName: d.fatherName || candidate.fatherName || '',
          fatherMobile: d.fatherMobile || candidate.fatherMobile || '',
          brotherName: d.brotherName || candidate.brotherName || '',
          brotherMobile: d.brotherMobile || candidate.brotherMobile || '',
          sisterName: d.sisterName || candidate.sisterName || '',
          sisterMobile: d.sisterMobile || candidate.sisterMobile || '',
          aadhar: d.aadhar || candidate.aadhar || '',
          pan: d.pan || candidate.pan || '',
          familyMemberName: d.familyMemberName || candidate.familyMemberName || '',
          familyMemberMobile: d.familyMemberMobile || candidate.familyMemberMobile || '',
          permanentAddress: d.permanentAddress || d.permAddress || candidate.permanentAddress || candidate.permAddress || '',
          temporaryAddress: d.temporaryAddress || d.tempAddress || candidate.temporaryAddress || candidate.tempAddress || '',
          permAddress: d.permanentAddress || d.permAddress || candidate.permanentAddress || candidate.permAddress || '',
          tempAddress: d.temporaryAddress || d.tempAddress || candidate.temporaryAddress || candidate.tempAddress || '',
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

    const lastWeek = recentSlots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= oneWeekAgo && d < now;
    }).length;
    const thisWeek = recentSlots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= startOfToday;
    }).length;
    const recentFourWeeks = recentSlots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= fourWeeksAgo;
    }).length;
    const recentThirtyDays = recentSlots.filter((s) => {
      const d = getSlotDate(s);
      return d && d >= thirtyDaysAgo;
    }).length;

    const total = recentSlots.length;
    const pending = recentSlots.filter((s) => s.status === 'pending' || s.status === 'Pending').length;
    const approved = recentSlots.filter((s) => s.status === 'Approved').length;
    const rejected = recentSlots.filter((s) => s.status === 'Rejected').length;
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
  }, [recentSlots]);

  const handleDeleteHR = async (id) => {
    try {
      // Find the HR to check if it has a Firestore ID
      const hrToDelete = hrs.find((h) => h.id === id);
      
      // If HR has a Firestore ID, delete from Firestore
      if (hrToDelete?.firestoreId) {
        await deleteDoc(doc(db, 'hrs', hrToDelete.firestoreId));
        forgetSyncedDoc('hrs', hrToDelete.firestoreId);
      }
      reloadHrs();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete HR:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader activeTab={activeTab} onChangeTab={changeTab} />
      <AdminTopNav
        activeTab={activeTab}
        onChange={changeTab}
        pendingApprovals={pendingApprovals}
      />
      <SetTrail.Provider value={setTrail}>
      {/* Home screen: no breadcrumb (it would only say "Home"); every other screen starts its trail at Home. */}
      {!(activeTab === 'home' && !trail?.length) && <Breadcrumbs items={[homeCrumb, ...(trail ?? [])]} />}
      {/* Same gutter as the candidate dashboard: breadcrumbs sit just above the page card. */}
      <main className="px-2 pb-2 pt-1 sm:px-4 sm:pb-4 sm:pt-2 md:px-8 md:pb-8 print:p-0">
        {pendingSlots.length > 0 && (
          <div className="print:hidden mb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-3">
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
                  isActive: true,
                  lastActivatedAt: Date.now(),
                  selected: false,
                };
                setCandidates((prev) => [newCandidate, ...prev]);
                setShowAddForm(false);
              }}
            />
          ) : editingCandidate ? (
            <AdminEditCandidateForm
              candidate={editingCandidate}
              hrs={hrs}
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
                          isSelected: data.selected ?? c.selected,
                          password: data.password,
                          ...(data.selected && {
                            selectedDate: data.selectedDate,
                            joiningDate: data.joiningDate,
                            selectedCompany: data.selectedCompany,
                            package: data.package,
                            hrName: data.hrName,
                            hrMobile: data.hrMobile,
                            hrEmail: data.hrEmail,
                            aadhar: data.aadhar,
                            pan: data.pan,
                            familyMemberName: data.familyMemberName,
                            familyMemberMobile: data.familyMemberMobile,
                            permanentAddress: data.permanentAddress,
                            permAddress: data.permanentAddress,
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
              technologyFilter={candidateTechnologyFilter}
              techOptions={candidateTechOptions}
              referredByFilter={candidateReferredByFilter}
              statusFilter={candidateStatusFilter}
              search={candidateSearch}
              onBackToHome={() => setActiveTab('home')}
              onOpenAddForm={() => setShowAddForm(true)}
              onChangeSelectionFilter={(newFilter) => {
                setCandidateSelectionFilter(newFilter);
                if (newFilter === 'selected') {
                  setCandidateStatusFilter('all');
                } else if (newFilter === 'unselected') {
                  setCandidateStatusFilter('active');
                }
              }}
              onChangeTechnologyFilter={setCandidateTechnologyFilter}
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
              parent="Slots"
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
              timeRange={slotRange}
              onChangeTimeRange={setSlotRange}
              onOpenCandidateSlots={async (candidateName) => {
                const candidate = candidates.find(
                  (c) => (c.name || '').trim() === (candidateName || '').trim(),
                );
                const candidateSlots = candidate
                  ? (await loadHistory()).filter((s) => slotMatchesCandidate(s, candidate))
                  : [];
                setSelectedSlotsCandidate({
                  name: candidate?.name || candidateName,
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
              parent="HRs"
            />
          ) : (
            <AdminHRsTable
              hrs={filteredHRs}
              search={hrSearch}
              onBackToHome={() => setActiveTab(hrBackTab)}
              onReload={reloadHrs}
              onChangeSearch={setHrSearch}
              onDeleteHR={handleDeleteHR}
              candidateNames={candidates.map((c) => (c.name || '').trim().toLowerCase()).filter(Boolean)}
              onOpenCandidateView={async (addedByName) => {
                const candidate = candidates.find(
                  (c) => (c.name || '').trim().toLowerCase() === (addedByName || '').trim().toLowerCase(),
                );
                if (candidate) {
                  const candidateSlots = (await loadHistory()).filter((s) => slotMatchesCandidate(s, candidate));
                  setSelectedViewCandidate({
                    name: candidate.name,
                    candidate,
                    slots: candidateSlots,
                  });
                }
              }}
              onAddHR={async (data) => {
              const duplicateErrors = await getHrDuplicateFieldErrors({
                email: data.email,
                mobile: data.mobile,
              });
              if (Object.keys(duplicateErrors).length > 0) {
                const err = new Error('Duplicate HR');
                err.fieldErrors = duplicateErrors;
                throw err;
              }

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
                name: data.name || '',
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
                  updatedAt: serverTimestamp(),
                });
                reloadHrs();
                
                // Show success toast
                setShowHrSuccessToast(true);
                setTimeout(() => {
                  setShowHrSuccessToast(false);
                }, 2000);

              } catch (err) {
                console.error('Failed to save HR to Firestore:', err);
              }
            }}
            onUpdateHR={async (id, data) => {
              const current = hrs.find((h) => h.id === id);
              const duplicateErrors = await getHrDuplicateFieldErrors({
                email: data.email,
                mobile: data.mobile,
                excludeFirestoreId: current?.firestoreId || null,
              });
              if (Object.keys(duplicateErrors).length > 0) {
                const err = new Error('Duplicate HR');
                err.fieldErrors = duplicateErrors;
                throw err;
              }

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
                const firestoreId = current?.firestoreId;
                if (firestoreId) {
                  const payload = {
                    name: data.name ?? current.name ?? '',
                    email: data.email ?? current.email ?? '',
                    mobile: data.mobile ?? current.mobile ?? '',
                    company: data.company ?? current.company ?? '',
                    technology: data.technology ?? current.technology ?? '',
                    jobType: data.jobType ?? current.jobType ?? '',
                    updatedAt: serverTimestamp(),
                  };
                  await updateDoc(doc(db, 'hrs', firestoreId), payload);
                  reloadHrs();
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to update HR in Firestore:', err);
              }
            }}
          />
          )
        ) : activeTab === 'profiles' || activeTab === 'resumes' ? (
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Loading…</div>}>
            <ProfileApp activeMobiles={activeMobiles} />
          </Suspense>
        ) : activeTab === 'stats' ? (
          <AdminStatisticsChart
            slots={slots}
            candidates={candidates}
            onReload={() => loadHistory(true)}
            onBackToHome={() => setActiveTab('home')}
          />
        ) : activeTab === 'leaves' ? (
          <AdminLeavesTable onBackToHome={() => setActiveTab('home')} />
        ) : activeTab === 'settings' ? (
          <AdminSettingsTab
            slotSettings={slotSettings}
            onToggleSaturday={handleToggleSaturday}
            onUpdateStartTime={handleUpdateStartTime}
            onUpdateEndTime={handleUpdateEndTime}
            isSavingSlotSettings={isSavingSlotSettings}
            settingsSavedMessage={settingsSavedMessage}
            onBackToHome={() => setActiveTab('home')}
          />
        ) : (
          <>
            <div className="min-h-[70vh] overflow-hidden bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
              {/* Admin calendar header */}
              <div className="border-b border-slate-200 pb-3 sm:pb-4">
                {/* Mobile: match screenshot layout (all centered, stacked) */}
                <div className="flex flex-col items-center gap-2 sm:hidden">
                  {/* Today's date with calendar icon */}
                  <div className="flex items-center gap-2 text-xs text-purple-600">
                    <i className="fa-solid fa-calendar-day" aria-hidden="true" />
                    <span className="font-semibold">
                      Today: {adminTodayLabel}
                    </span>
                  </div>
                  {/* Slot Booking / Slot Booking Calendar + reload */}
                  <div className="flex items-center justify-center gap-2">
                    {/* Mobile text without 'Calendar' */}
                    <PageTitle icon="fa-calendar-days">Slot Booking</PageTitle>
                    <button
                      type="button"
                      onClick={() => setCalendarRefreshKey((k) => k + 1)}
                      className="btn-circle"
                      aria-label="Reload calendar"
                    >
                      <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
                    </button>
                  </div>
                  {/* Download button full-width-ish */}
                  <div className="w-full flex justify-center">
                    <button
                      type="button"
                      onClick={() => downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')}
                      className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-600"
                    >
                      <i className="fa-solid fa-file-arrow-down text-sm" aria-hidden="true" />
                      <span>Download Personal Detail Form 3.0</span>
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
                      <PageTitle icon="fa-calendar-days">Slot Booking</PageTitle>
                      <button
                        type="button"
                        onClick={() => setCalendarRefreshKey((k) => k + 1)}
                        className="btn-circle"
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
                      <i className="fa-solid fa-file-arrow-down text-sm" aria-hidden="true" />
                      <span>Download Personal Detail Form 3.0</span>
                    </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <WeekCalendar
                    key={calendarRefreshKey}
                    settings={slotSettings}
                    onEventClick={(event) => {
                      setCalendarSelectedEvent(event);
                    }}
                  />
                </div>
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
              <h3 className="text-sm font-semibold text-slate-800"><i className="fa-solid fa-calendar-days mr-1.5" aria-hidden="true" />
                Slot Details
              </h3>
              <button
                type="button"
                onClick={() => setCalendarSelectedEvent(null)}
                className="btn-circle"
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

                  {/* Actions row: Delete Button */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteCalendarSlotConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600 shadow-sm transition"
                    >
                      <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Calendar slot delete confirmation modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteCalendarSlotConfirm && Boolean(calendarSelectedEvent)}
        title="Are you sure you want to delete this slot?"
        itemType="Slot for"
        itemName={
          (() => {
            const ev = calendarSelectedEvent;
            if (!ev) return '';
            const cName = ev.candidateName || ev.extendedProps?.candidateName || '';
            const comp = ev.extendedProps?.company || ev.company || '';
            return [cName, comp].filter(Boolean).join(' - ') || 'Candidate / Company';
          })()
        }
        onCancel={() => setShowDeleteCalendarSlotConfirm(false)}
        onConfirm={async () => {
          const slotId = calendarSelectedEvent?.id || calendarSelectedEvent?.firestoreId;
          if (slotId) {
            try {
              setIsDeletingCalendarSlot(true);
              await deleteSlot(slotId);
              setCalendarRefreshKey((k) => k + 1);
            } catch (err) {
              console.error('Failed to delete calendar slot:', err);
            } finally {
              setIsDeletingCalendarSlot(false);
            }
          }
          setShowDeleteCalendarSlotConfirm(false);
          setCalendarSelectedEvent(null);
        }}
        isDeleting={isDeletingCalendarSlot}
        cancelButtonText="Cancel"
        deleteButtonText="Delete"
      />

      </main>
      </SetTrail.Provider>

      {/* HR Success Toast Notification */}
      {showHrSuccessToast && (
        <div className="fixed top-4 right-4 z-50 transition-opacity duration-300">
          <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-base" aria-hidden="true" />
            <span className="font-semibold text-sm">HR Created Successfully</span>
          </div>
        </div>
      )}
    </div>
  );
}

