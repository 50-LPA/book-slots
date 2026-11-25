import React, { Suspense, lazy, useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import Navbar from '../Components/Navbar';
import AddHRModal from '../Components/AddHRModal';
import BookSlot from './BookSlot';
import WeekCalendar from '../Components/WeekCalendar';
import PlacedCandidatesMarquee from '../Components/PlacedCandidatesMarquee';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import {
  formatDateDDMMYYYY,
  subscribeToCandidateSlots,
  isSlotPast,
} from '../firebase/slotsService';
import { clearSyncedCollections } from '../firebase/syncedCollection';
import { getMyHrs, saveHr, forgetHrIndex } from '../firebase/hrIndex';
import PageHeader, { Breadcrumbs, PageTitle } from '../Components/PageHeader';
import {
  getCandidateMatchKeys,
  normalizeCandidateMobile,
  slotMatchesCandidateKeys,
} from '../utils/candidateIdentity';
import { isCandidateInterviewOlderThanTwoWeeks } from '../utils/candidateStatus';
import { parseISOToDate } from '../calendar';
import { downloadWithSaveAs } from '../utils/downloadUtils';
import { CandidateProfileEditForm } from '../pages/CandidateProfileEdit';
import { useAuth } from '../context/AuthContext';
import { mayLeave, navigated } from '../profile/unsaved.js';
import PaginationBar from '../Components/PaginationBar';

// Candidate's own resume (editor + preview), from src/profile; loaded only when the tab opens.
const MyResume = lazy(() => import('../profile/MyResume.jsx'));
const MyAdmissionProfile = lazy(() => import('../profile/MyAdmissionProfile.jsx'));


// Normalise legacy round labels for candidate views (calendar + lists)
const ROUND_LABELS = [
  'Screening Round',
  'Technical Round 1',
  'Technical Round 2',
  'Technical Round 3',
  'Manageral Round',
  'HR Round',
  'Task Assesment',
];

function normaliseRoundLabel(raw) {
  const r = String(raw || '').trim();
  if (!r) return '';
  const lower = r.toLowerCase();
  if (lower === 'screening' || lower === 'screening round') return 'Screening Round';
  if (lower === 'round 1') return 'Technical Round 1';
  if (lower === 'round 2') return 'Technical Round 2';
  if (lower === 'round 3') return 'Technical Round 3';
  if (lower === 'manager round' || lower === 'managerial round') return 'Manageral Round';
  if (lower === 'technical discussion round') return 'Technical Round 2';
  if (lower === 'last technical round') return 'Technical Round 3';
  return r;
}


function getInitials(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'C';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase() || 'C';
}



function formatSlotTimeRange(slot) {
  if (!slot) return '';
  let startLabel = '';
  let endLabel = '';
  const dur = parseInt(slot.duration, 10) || 30;

  if (slot.start && slot.end) {
    const sDate = slot.start?.toDate ? slot.start.toDate() : new Date(slot.start);
    const eDate = slot.end?.toDate ? slot.end.toDate() : new Date(slot.end);
    if (!Number.isNaN(sDate.getTime()) && !Number.isNaN(eDate.getTime())) {
      startLabel = sDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      endLabel = eDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }
  if (!startLabel) {
    let sh = slot.startHour;
    let sm = slot.startMinute;
    if (sh == null && slot.time) {
      const [h, m] = String(slot.time).split(':').map((v) => parseInt(v, 10));
      sh = h;
      sm = m;
    }
    if (sh != null) {
      const sDate = new Date();
      sDate.setHours(sh, sm || 0, 0, 0);
      const eDate = new Date(sDate.getTime() + dur * 60000);
      startLabel = sDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      endLabel = eDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }
  return startLabel && endLabel ? `${startLabel} - ${endLabel} (${dur} mins)` : '';
}

function FeedbackRequiredModal({
  isOpen,
  onClose,
  pendingSlots = [],
  onFeedbackSubmitted,
}) {
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (pendingSlots.length > 0) {
      const current = pendingSlots.find((s) => s.id === selectedSlotId);
      if (!current) {
        const pastSlot = pendingSlots.find((s) => isSlotPast(s));
        setSelectedSlotId(pastSlot ? pastSlot.id : pendingSlots[0].id);
        setFeedbackText('');
      }
    } else {
      setSelectedSlotId(null);
      setFeedbackText('');
    }
    setError('');
  }, [pendingSlots, selectedSlotId]);

  if (!isOpen || pendingSlots.length === 0) return null;

  const currentSlot = pendingSlots.find((s) => s.id === selectedSlotId) || pendingSlots[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentSlot?.id) return;
    if (!feedbackText.trim()) {
      setError('Please enter your interview feedback before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const ref = doc(db, 'events', currentSlot.id);
      await updateDoc(ref, {
        feedback: feedbackText.trim(),
        updatedAt: serverTimestamp(),
      });
      setFeedbackText('');
      if (typeof onFeedbackSubmitted === 'function') {
        onFeedbackSubmitted(currentSlot.id);
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setError('Failed to save feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
        {/* Header with Lock icon & warning */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-lock text-lg" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {isSlotPast(currentSlot) ? 'Feedback Required First' : 'Active Slot in Progress'}
              </h3>
              <p className="text-xs text-slate-500">
                {isSlotPast(currentSlot)
                  ? 'Please fill the feedback of completed slot to unlock booking.'
                  : 'You have an active slot. Feedback unlocks after the interview ends.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-full p-1 transition"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-base" aria-hidden="true" />
          </button>
        </div>

        {/* Slot details card */}
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs sm:text-sm text-slate-700">
          {pendingSlots.length > 1 && (
            <div className="mb-2 pb-2 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-amber-700">
                {pendingSlots.length} slot(s) awaiting feedback
              </span>
              <select
                value={currentSlot?.id}
                onChange={(e) => {
                  setSelectedSlotId(e.target.value);
                  setFeedbackText('');
                  setError('');
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 max-w-[200px] truncate"
              >
                {pendingSlots.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    Slot #{idx + 1}: {s.company || s.companyName || 'Company'} ({formatDateDDMMYYYY(s.date)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Company</span>
              <span className="font-semibold text-slate-800 truncate block">
                {currentSlot?.company || currentSlot?.companyName || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Round</span>
              <span className="font-semibold text-slate-800 truncate block">
                {normaliseRoundLabel(currentSlot?.round || currentSlot?.interviewRound) || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Date</span>
              <span className="font-semibold text-slate-800">
                {formatDateDDMMYYYY(currentSlot?.date)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Time</span>
              <span className="font-semibold text-slate-800">
                {formatSlotTimeRange(currentSlot) || '-'}
              </span>
            </div>
          </div>
        </div>

        {isSlotPast(currentSlot) ? (
          /* Feedback Input Form when slot time has passed */
          <form onSubmit={handleSubmit} className="mt-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1"><i className="fa-solid fa-comment-dots mr-1.5 text-purple-500" aria-hidden="true" />
              Your Interview Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                if (error) setError('');
              }}
              placeholder="Write what questions were asked, interview difficulty, topics covered, or your feedback..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            {error && <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-full px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !feedbackText.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-floppy-disk text-xs" aria-hidden="true" />
                {submitting ? 'Saving Feedback...' : 'Save Feedback & Unlock'}
              </button>
            </div>
          </form>
        ) : (
          /* Notice when slot time has NOT passed yet */
          <div className="mt-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-center">
              <div className="w-8 h-8 mx-auto mb-1.5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <i className="fa-solid fa-clock text-sm" aria-hidden="true" />
              </div>
              <h4 className="text-xs sm:text-sm font-semibold text-amber-900"><i className="fa-solid fa-hourglass-half mr-1.5" aria-hidden="true" />
                Interview Not Completed Yet
              </h4>
              <p className="mt-1 text-[11px] sm:text-xs text-amber-700 leading-relaxed">
                You cannot create multiple slots simultaneously without giving feedback for your existing slot. Feedback will unlock automatically after the interview time ends.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-slate-800 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-900"
              ><i className="fa-solid fa-check mr-1.5" aria-hidden="true" />
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const NAV_LABELS = { slots: 'Slots', hrs: 'My HRs', profile: 'My Profile', admission: 'Admission Profile', myprofile: 'My Resume' };
// Same icons as the navigation and page titles.
const CRUMB_ICONS = { Home: 'fa-house', Slots: 'fa-calendar-days', 'My HRs': 'fa-user-tie', 'My Profile': 'fa-id-card', 'Admission Profile': 'fa-file-signature', 'My Resume': 'fa-file-lines', 'Add New Slot': 'fa-calendar-plus' };


function Header({
  userName,
  onLogout,
  activeNav,
  onChangeNav,
  onDownloadForm,
  onEditProfile,
  totalSlotsCount = 0,
  totalHrsCount = 0,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Header counts; a zero count is hidden.
  const counts = [
    [totalSlotsCount, 'Total Slots', 'fa-calendar-days', 'text-blue-600', 'text-blue-400'],
    [totalHrsCount, 'My HRs', 'fa-user-tie', 'text-emerald-600', 'text-emerald-400'],
  ].filter(([n]) => n > 0);
  const [navOpen, setNavOpen] = useState(false);
  const initials = useMemo(() => getInitials(userName), [userName]);

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar-days' },
    { id: 'hrs', label: 'My HRs', icon: 'fa-solid fa-user-tie' },
    { id: 'admission', label: 'Admission Profile', icon: 'fa-solid fa-file-signature' },
    { id: 'myprofile', label: 'My Resume', icon: 'fa-solid fa-file-lines' },
  ];

  const handleNavClick = (id) => {
    if (typeof onChangeNav === 'function') {
      onChangeNav(id);
    }
    setNavOpen(false);
  };

  return (
    <>
      <div className="bg-blue-100 px-2 sm:px-4 md:px-8 py-2 sm:py-3 md:py-4 flex items-center justify-between gap-2 sm:gap-3 relative print:hidden">
        {/* Left Section: hamburger + title */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 max-w-[38%] sm:max-w-none">
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-white/70 text-slate-700 hover:bg-blue-200 shadow-sm md:hidden flex-shrink-0"
            aria-label="Toggle navigation"
          >
            <i className="fa-solid fa-bars w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
          </button>
          <p className="text-xs sm:text-base md:text-xl font-bold text-gray-900 truncate">
            <i className="fa-solid fa-calendar-check mr-1 sm:mr-2 text-purple-600" aria-hidden="true" />
            Book Slots
          </p>
        </div>

        {/* Center Section: summary cards (Total Slots, My HRs), visible on mobile and desktop */}
        {counts.length > 0 && (
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center gap-1.5 sm:gap-2 pointer-events-none z-10">
            {counts.map(([n, label, icon, tone]) => (
              <div key={label} className="flex flex-col items-center justify-center bg-white/95 border border-blue-200/90 rounded-lg sm:rounded-xl px-2.5 sm:px-4 py-0.5 sm:py-1 shadow-sm min-w-[68px] sm:min-w-[90px]">
                <span className="text-xs sm:text-base font-bold text-slate-800 leading-tight">{n}</span>
                <span className="text-[9px] sm:text-[11px] text-slate-500 font-medium whitespace-nowrap">
                  <i className={`fa-solid ${icon} mr-1 ${tone}`} aria-hidden="true" />{label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Right Section: user info */}
        <div className="relative flex items-center gap-1.5 sm:gap-3 md:gap-4 ml-auto max-w-[32%] sm:max-w-none">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 sm:gap-2 focus:outline-none"
          >
            {/* Mobile: show name + role beside avatar, like desktop */}
            <div className="flex flex-col items-end sm:hidden min-w-0">
              <p className="font-semibold text-[10px] text-gray-900 max-w-[65px] truncate">
                {userName || 'Candidate'}
              </p>
              <p className="text-[9px] text-gray-500">Candidate</p>
            </div>
            {/* Desktop / tablet: existing name + role */}
            <div className="text-right hidden sm:block">
              <p className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
                {userName || 'Candidate'}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500">Candidate</p>
            </div>
            <div className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] sm:text-sm md:text-base font-semibold text-white">
                {initials}
              </span>
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
                  <p className="text-sm font-semibold text-slate-900">
                    {userName || 'Candidate'}
                  </p>
                  <p className="text-[11px] text-slate-500">Candidate</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditProfile?.();
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 inline-flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-id-card text-xs" aria-hidden="true" />
                  My Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout?.();
                  }}
                  className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2"
                ><i className="fa-solid fa-right-from-bracket mr-1.5" aria-hidden="true" />
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile sidebar navigation */}
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
              {/* Summary cards in mobile drawer */}
              {counts.length > 0 && (
                <div className="mx-1 mb-2 flex gap-2">
                  {counts.map(([n, label, icon, , darkTone]) => (
                    <div key={label} className="flex-1 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center">
                      <span className={`text-base font-bold leading-tight ${darkTone}`}>{n}</span>
                      <span className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
                        <i className={`fa-solid ${icon} mr-1`} aria-hidden="true" />{label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left ${
                    activeNav === item.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <i className={`${item.icon} w-4 h-4`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
              {typeof onDownloadForm === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    onDownloadForm();
                    setNavOpen(false);
                  }}
                  className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <i className="fa-solid fa-file-arrow-down w-4 h-4" aria-hidden="true" />
                  <span>Download Personal Detail Form 3.0</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

// Candidate calendar area: other slots show "Slot Booked" + blue; own slots show name + referrer color
// Red caption under a locked "Add New Slot" button: which slots need feedback to unlock booking.
function LockNote({ text, className = '' }) {
  return text ? <p className={`mt-1 text-[11px] leading-tight text-red-600 ${className}`}>{text}</p> : null;
}

function CandidateCalendarArea({ onOpenAddHR, onOpenBookSlot, candidateIds = [], ownSlots = [], hasPendingFeedback = false, lockNote = '' }) {
  const headerDate = new Date();
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarSelectedEvent, setCalendarSelectedEvent] = useState(null);

  const candidateTodayLabel = headerDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="overflow-hidden bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Title + candidate actions (Download, Add HR, Book Slot) */}
      <div className="border-b border-slate-200 pb-3 sm:pb-4">
        {/* Mobile: centered, stacked layout like admin */}
        <div className="flex flex-col items-center gap-2 mb-4 sm:hidden text-center">
          {/* Today's date */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-700">
            <span className="font-medium">Today {candidateTodayLabel}</span>
          </div>
          {/* Title + reload */}
          <div className="flex items-center justify-center gap-2">
            {/* Mobile heading without 'Calendar' */}
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
          {/* Actions stacked */}
          <div className="w-full flex flex-col items-center gap-2">
            <div className="flex w-full max-w-xs gap-2">
              <button
                type="button"
                onClick={onOpenAddHR}
                className="btn-pill flex-1 bg-emerald-500"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
                  <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                </span>
                <span>Add New HR</span>
              </button>
              <button
                type="button"
                onClick={onOpenBookSlot}
                title={hasPendingFeedback ? 'Feedback required for completed slot to unlock booking' : 'Add New Slot'}
                className={`btn-pill flex-1 justify-center ${
                  hasPendingFeedback ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
                  <i className={`fa-solid ${hasPendingFeedback ? 'fa-lock' : 'fa-calendar-plus'} text-xs`} aria-hidden="true" />
                </span>
                <span className="hidden sm:inline">{hasPendingFeedback ? 'Add New Slot (Locked)' : 'Add New Slot'}</span>
              </button>
            </div>
            {hasPendingFeedback && <LockNote text={lockNote} className="w-full max-w-xs text-center" />}
          </div>
        </div>

        {/* Desktop / tablet layout (unchanged) */}
        <div className="hidden sm:block">
          <div className="flex md:flex-col lg:flex-row sm:items-center sm:justify-between md:justify-center lg:justify-between gap-3 mb-0 relative">
            {/* Left: Today's date */}
            <div className="flex items-center gap-2 md:justify-center">
              <span className="text-xs sm:text-sm text-gray-700 font-medium">
                Today {candidateTodayLabel}
              </span>
            </div>

            {/* Center: Title + reload - iPad: static; desktop: absolute */}
            <div className="absolute md:relative md:left-0 md:translate-x-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex items-center gap-2 md:justify-center">
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

            {/* Right: Action buttons */}
            <div className="flex flex-wrap gap-2 sm:gap-3 ml-auto md:ml-0 md:justify-center lg:ml-auto">
              <button
                type="button"
                onClick={onOpenAddHR}
                className="btn-pill bg-emerald-500"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
                  <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                </span>
                <span>Add New HR</span>
              </button>
              <div className="flex flex-col items-end">
              <button
                type="button"
                onClick={onOpenBookSlot}
                title={hasPendingFeedback ? 'Feedback required for completed slot to unlock booking' : 'Add New Slot'}
                className={`btn-pill ${
                  hasPendingFeedback ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
                  <i className={`fa-solid ${hasPendingFeedback ? 'fa-lock' : 'fa-calendar-plus'} text-xs`} aria-hidden="true" />
                </span>
                <span className="hidden sm:inline">{hasPendingFeedback ? 'Add New Slot (Locked)' : 'Add New Slot'}</span>
              </button>
              {hasPendingFeedback && <LockNote text={lockNote} className="max-w-[16rem] text-right" />}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <WeekCalendar
            key={calendarRefreshKey}
            candidateIds={candidateIds}
            ownSlots={ownSlots}
            onEventClick={(event) => {
              if (Array.isArray(candidateIds) && slotMatchesCandidateKeys(event, candidateIds)) {
                setCalendarSelectedEvent(event);
              }
            }}
          />
        </div>
      </div>
      {/* Calendar slot details popup (candidate calendar, only own slots) */}
      {calendarSelectedEvent && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setCalendarSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white shadow-lg px-5 py-4 max-h-[90dvh] overflow-y-auto"
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
                          <div className="break-words">{normaliseRoundLabel(round)}</div>
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
    </div>
  );
}

// My Slots Component - shows user's booked slots
// slots: the dashboard's live listener on this candidate's slots (no second listener here).
function MySlots({ slots = [], onBookNewSlot, onBackToHome, hrList = [], hasPendingFeedback = false, lockNote = '' }) {
  const [slotSearch, setSlotSearch] = useState('');
  const [feedbackSlot, setFeedbackSlot] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);


  const todayStr = new Date().toISOString().slice(0, 10);
  const totalSlots = slots.length;
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const roundCounts = useMemo(() => {
    const counts = {};
    slots.forEach((slot) => {
      const round = normaliseRoundLabel(slot.round || slot.interviewRound);
      if (!round) return;
      counts[round] = (counts[round] || 0) + 1;
    });
    return counts;
  }, [slots]);

  const filteredSlots = useMemo(() => {
    if (!slotSearch.trim()) return slots;
    const q = slotSearch.toLowerCase();
    return slots.filter((slot) => {
      return (
        String(slot.company || slot.companyName || '').toLowerCase().includes(q) ||
        String(slot.technology || '').toLowerCase().includes(q)
      );
    });
  }, [slots, slotSearch]);

  const formatTimeLabel = (slot) => {
    let timeStr = slot.time;
    let durationStr = slot.duration;
    if (!timeStr && (slot.startHour != null && slot.startMinute != null)) {
      timeStr = `${String(slot.startHour).padStart(2, '0')}:${String(slot.startMinute).padStart(2, '0')}`;
    }
    if (!timeStr && slot.start) {
      const startVal = slot.start?.toDate ? slot.start.toDate() : new Date(slot.start);
      if (!Number.isNaN(startVal.getTime())) {
        timeStr = `${String(startVal.getHours()).padStart(2, '0')}:${String(startVal.getMinutes()).padStart(2, '0')}`;
        if (!durationStr && slot.end) {
          const endVal = slot.end?.toDate ? slot.end.toDate() : new Date(slot.end);
          durationStr = String(Math.round((endVal.getTime() - startVal.getTime()) / 60000));
        }
      }
    }
    if (!timeStr) return '';
    const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
    const dur = parseInt(durationStr, 10);
    const start = new Date();
    start.setHours(hh, mm, 0, 0);
    const opts = { hour: 'numeric', minute: '2-digit' };
    const startLabel = start.toLocaleTimeString(undefined, opts);
    if (!dur || Number.isNaN(dur)) return startLabel;
    const end = new Date(start.getTime() + dur * 60000);
    const endLabel = end.toLocaleTimeString(undefined, opts);
    let durLabel;
    if (dur % 60 === 0) {
      const hours = dur / 60;
      durLabel = `${hours} Hour${hours === 1 ? '' : 's'}`;
    } else {
      durLabel = `${dur} mins`;
    }
    return `${startLabel} - ${endLabel} (${durLabel})`;
  };


  const totalItems = filteredSlots.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedSlots = filteredSlots.slice(startIdx, startIdx + itemsPerPage);

  // Per-slot pieces shared by the desktop table and the phone cards.
  const getSlotParts = (slot) => {
    const slotDate = slot.date?.toDate ? slot.date.toDate() : (slot.date ? new Date(slot.date) : null);
    const slotDateStr = slotDate ? slotDate.toISOString().slice(0, 10) : '';
    const isToday = slotDateStr === todayStr;
    const displayDate = formatDateDDMMYYYY(slot.date);
    const timeLabel = formatTimeLabel(slot);
    const hrCell = (() => {
                        const rawHrName = slot.hrName || '';
                        const rawHrMobile = slot.hrMobile || '';
                        const rawHrEmail = slot.hrEmail || '';

                        // Fallback to HR master list for older slots that only have hrId stored
                        const hrFromList =
                          hrList.find((h) => String(h.id || '').trim() === String(slot.hrId || '').trim()) ||
                          hrList.find(
                            (h) =>
                              rawHrName &&
                              String(h.name || '').trim().toLowerCase() === rawHrName.trim().toLowerCase(),
                          ) ||
                          null;

                        const hrName = rawHrName || hrFromList?.name || '';
                        const hrMobile = rawHrMobile || hrFromList?.mobile || '';
                        const hrEmail = rawHrEmail || hrFromList?.email || '';

                        if (!hrName && !hrMobile && !hrEmail) {
                          return <span className="text-slate-400">-</span>;
                        }

                        return (
                          <div className="flex flex-col gap-1">
                            {hrName && (
                              <div className="flex items-center gap-1.5">
                                <i className="fa-solid fa-user-tie text-slate-500 w-3.5" aria-hidden="true" />
                                <span>{hrName}</span>
                              </div>
                            )}
                            {hrMobile && (
                              <div className="flex items-center gap-1.5">
                                <i className="fa-solid fa-mobile-screen text-slate-500 w-3.5" aria-hidden="true" />
                                <span>{hrMobile}</span>
                              </div>
                            )}
                            {hrEmail && (
                              <div className="flex items-center gap-1.5">
                                <i className="fa-solid fa-envelope text-slate-500 w-3.5" aria-hidden="true" />
                                <span className="truncate max-w-[180px]" title={hrEmail}>
                                  {hrEmail}
                                </span>
                              </div>
                            )}
                          </div>
                        );
    })();
    const feedbackCell = slot.feedback ? (
                        <span className="block max-w-[260px] whitespace-pre-wrap break-words">
                          {String(slot.feedback)}
                        </span>
                      ) : (() => {
                        const past = isSlotPast(slot);
                        if (!past) {
                          return (
                            <div className="inline-flex flex-col items-start">
                              <button
                                type="button"
                                disabled
                                title="Feedback can only be submitted after the slot time has passed"
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-400 bg-slate-50 cursor-not-allowed"
                              >
                                <i className="fa-solid fa-lock text-[10px]" aria-hidden="true" />
                                Add Feedback
                              </button>
                              <span className="mt-0.5 text-[10px] leading-tight text-orange-600">Opens after the slot time ends.</span>
                            </div>
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setFeedbackSlot(slot);
                              setFeedbackText('');
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-3 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100"
                          >
                            <i className="fa-solid fa-comment-dots text-xs" aria-hidden="true" />
                            Add Feedback
                          </button>
                        );
    })();
    return { isToday, displayDate, timeLabel, hrCell, feedbackCell };
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-calendar-days"
        title="My Slots"
        onBack={onBackToHome}
        backLabel="Back to home"
        actions={
          <div className="flex flex-col items-end">
          <button
            type="button"
            onClick={onBookNewSlot}
            title={hasPendingFeedback ? 'Feedback required for completed slot to unlock booking' : 'Add New Slot'}
            aria-label={hasPendingFeedback ? 'Add New Slot (locked)' : 'Add New Slot'}
            className={`btn-pill ${hasPendingFeedback ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className={`fa-solid ${hasPendingFeedback ? 'fa-lock' : 'fa-calendar-plus'} text-xs`} aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">{hasPendingFeedback ? 'Add New Slot (Locked)' : 'Add New Slot'}</span>
          </button>
          {hasPendingFeedback && <LockNote text={lockNote} className="max-w-[16rem] text-right" />}
          </div>
        }
      />

      {/* Metrics + search row */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {totalSlots > 0 && (
        <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm text-slate-700">
          {/* Total slots card */}
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {totalSlots}
            </span>
            <span className="text-[11px] text-slate-500"><i className="fa-solid fa-calendar-days mr-1" aria-hidden="true" />Total Slots</span>
          </div>

          {/* Per-round cards, same style as total */}
          {ROUND_LABELS.map((label) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-sm sm:text-base font-semibold text-slate-800">
                {roundCounts[label] || 0}
              </span>
              <span className="text-[11px] text-slate-500 text-center whitespace-nowrap">
                {label}
              </span>
            </div>
          ))}
        </div>
        )}
        <div className="flex items-center justify-end gap-3 sm:ml-auto">
          <div className="relative w-28 sm:w-36">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search slots..."
              value={slotSearch}
              onChange={(e) => setSlotSearch(e.target.value)}
              className="filter-search"
            />
            {slotSearch && (
              <button
                type="button"
                onClick={() => setSlotSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table content */}
      {filteredSlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-16">
          <p className="text-sm sm:text-base text-gray-500">No slots found</p>
        </div>
      ) : (
        <>
        {/* Phones: one card per slot instead of an 8-column table */}
        <ul className="sm:hidden space-y-3">
          {paginatedSlots.map((slot) => {
            const { isToday, displayDate, timeLabel, hrCell, feedbackCell } = getSlotParts(slot);
            const round = normaliseRoundLabel(slot.round || slot.interviewRound);
            return (
              <li key={slot.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      <i className="fa-solid fa-building mr-1.5 text-purple-500" aria-hidden="true" />
                      {slot.company || slot.companyName || '-'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[slot.technology, round].filter(Boolean).join(' · ') || '-'}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  <i className="fa-solid fa-calendar-day mr-1.5 text-slate-400" aria-hidden="true" />
                  {displayDate || '-'}
                  {isToday && <span className="ml-1 font-semibold text-emerald-600">(Today)</span>}
                  {timeLabel && <span className="ml-2 text-slate-500">{timeLabel}</span>}
                </p>
                <div className="mt-2 text-xs text-slate-700">{hrCell}</div>
                <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-700">{feedbackCell}</div>
              </li>
            );
          })}
        </ul>
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full border-collapse text-xs sm:text-sm border border-slate-200">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-center font-semibold border-b border-r border-slate-200 w-10">
                  Sr.
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Company Name
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Technology
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  HR
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Round
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Date
                </th>
                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                  Feedback
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedSlots.map((slot, index) => {
                const { isToday, displayDate, timeLabel, hrCell, feedbackCell } = getSlotParts(slot);

                return (
                  <tr
                    key={slot.id}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700 text-center border-r border-slate-200">
                      {startIdx + index + 1}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {slot.company || slot.companyName || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {slot.technology || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {hrCell}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {normaliseRoundLabel(slot.round || slot.interviewRound) || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      <div className="flex flex-col">
                        <span>
                          {displayDate || '-'}
                          {isToday && (
                            <span className="text-emerald-600 font-semibold ml-1">
                              (Today)
                            </span>
                          )}
                        </span>
                        {timeLabel && (
                          <span className="text-[11px] text-slate-500">{timeLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {feedbackCell}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {/* Add Feedback modal */}
      {feedbackSlot && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onClick={() => {
            if (!savingFeedback) {
              setFeedbackSlot(null);
              setFeedbackText('');
            }
          }}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white shadow-lg px-5 py-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800"><i className="fa-solid fa-comment-dots mr-1.5" aria-hidden="true" />
                Add Feedback
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!savingFeedback) {
                    setFeedbackSlot(null);
                    setFeedbackText('');
                  }
                }}
                className="btn-circle"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-3 text-xs text-slate-600">
              <div>
                <span className="font-semibold">Company:</span>{' '}
                {feedbackSlot.company || feedbackSlot.companyName || '-'}
              </div>
              <div>
                <span className="font-semibold">Date:</span>{' '}
                {formatDateDDMMYYYY(feedbackSlot.date)}
              </div>
              {formatTimeLabel(feedbackSlot) && (
                <div>
                  <span className="font-semibold">Time:</span>{' '}
                  {formatTimeLabel(feedbackSlot)}
                </div>
              )}
            </div>

            <textarea
              rows={4}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              placeholder="Enter feedback for this slot"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!savingFeedback) {
                    setFeedbackSlot(null);
                    setFeedbackText('');
                  }
                }}
                disabled={savingFeedback}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-70"
              ><i className="fa-solid fa-xmark mr-1.5" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                disabled={savingFeedback || !feedbackText.trim()}
                onClick={async () => {
                  if (!feedbackSlot?.id) return;
                  try {
                    setSavingFeedback(true);
                    const ref = doc(db, 'events', feedbackSlot.id);
                    await updateDoc(ref, { feedback: feedbackText.trim(), updatedAt: serverTimestamp() }); // the live listener shows it
                    setFeedbackSlot(null);
                    setFeedbackText('');
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to save feedback:', err);
                  } finally {
                    setSavingFeedback(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
              ><i className="fa-solid fa-floppy-disk mr-1.5" aria-hidden="true" />
                {savingFeedback ? 'Saving...' : 'Save Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
      {filteredSlots.length > 0 && totalItems > itemsPerPage && (
        <div className="mt-3 flex justify-end">
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
        </div>
      )}
    </div>
  );
}

function CandidateHrsList({
  hrs = [],
  loading = false,
  refreshing = false,
  error = null,
  onAddNewHR,
  onBackToHome,
  onReload,
}) {
  const formatCreatedOn = (value) => {
    if (!value) return '-';
    try {
      const d = value?.toDate ? value.toDate() : new Date(value);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        icon="fa-user-tie"
        title="My HRs"
        onBack={onBackToHome}
        backLabel="Back to home"
        extra={
          <button type="button" onClick={onReload} className="btn-circle" aria-label="Reload HR list" title="Reload HR list">
            <i className={`fa-solid fa-rotate-right text-sm ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        }
        actions={
          <button type="button" onClick={onAddNewHR} className="btn-pill bg-emerald-500" aria-label="Add New HR">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 border border-white/40">
              <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Add New HR</span>
          </button>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading HRs...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : hrs.length === 0 ? (
        <p className="text-sm text-slate-500">No HRs added by you yet.</p>
      ) : (
        <>
        {/* Phones: one card per HR */}
        <ul className="sm:hidden space-y-3">
          {hrs.map((hr) => (
            <li key={hr.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-sm text-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    <i className="fa-solid fa-user-tie mr-1.5 text-purple-500" aria-hidden="true" />
                    {hr.name || '-'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {[hr.company, hr.technology, hr.jobType].filter(Boolean).join(' · ') || '-'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                  {hr.interviewCount ?? 0} interviews
                </span>
              </div>
              {hr.mobile && (
                <a href={`tel:${hr.mobile}`} className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
                  <i className="fa-solid fa-mobile-screen w-3.5 text-slate-400" aria-hidden="true" />
                  {hr.mobile}
                </a>
              )}
              {hr.email && (
                <a href={`mailto:${hr.email}`} className="mt-1 flex items-center gap-1.5 text-xs text-slate-700 break-all">
                  <i className="fa-solid fa-envelope w-3.5 text-slate-400" aria-hidden="true" />
                  {hr.email}
                </a>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Added {formatCreatedOn(hr.createdAt)}</p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-3 font-semibold">Sr. No</th>
                <th className="py-2 pr-3 font-semibold">Hr Name</th>
                <th className="py-2 pr-3 font-semibold">Hr Mobile</th>
                <th className="py-2 pr-3 font-semibold">Hr Email</th>
                <th className="py-2 pr-3 font-semibold">Company</th>
                <th className="py-2 pr-3 font-semibold">Technology</th>
                <th className="py-2 pr-3 font-semibold">Job Type</th>
                <th className="py-2 pr-3 font-semibold">Interview Count</th>
                <th className="py-2 pr-3 font-semibold">Created On</th>
              </tr>
            </thead>
            <tbody>
              {hrs.map((hr, idx) => (
                <tr key={hr.id} className="border-b border-slate-100 text-slate-800">
                  <td className="py-2 pr-3 tabular-nums">{idx + 1}</td>
                  <td className="py-2 pr-3">{hr.name || '-'}</td>
                  <td className="py-2 pr-3">{hr.mobile || '-'}</td>
                  <td className="py-2 pr-3">{hr.email || '-'}</td>
                  <td className="py-2 pr-3">{hr.company || '-'}</td>
                  <td className="py-2 pr-3">{hr.technology || '-'}</td>
                  <td className="py-2 pr-3">{hr.jobType || '-'}</td>
                  <td className="py-2 pr-3 tabular-nums">{hr.interviewCount ?? 0}</td>
                  <td className="py-2 pr-3">{formatCreatedOn(hr.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {!loading && refreshing && (
        <p className="mt-2 text-xs text-slate-500">Refreshing data...</p>
      )}
    </div>
  );
}

// Main Dashboard Component
export default function CandidateDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [showAddHR, setShowAddHR] = useState(false);
  const [showBookSlot, setShowBookSlot] = useState(false);
  const [bookSlotSelectHrId, setBookSlotSelectHrId] = useState(null);
  // Remember last opened tab across refreshes for candidate.
  // If coming from a successful booking with openSlots, prefer "slots" once.
  const [bookFrom, setBookFrom] = useState('home');
  const [activeNav, setActiveNav] = useState(() => {
    try {
      const stored = sessionStorage.getItem('sb_candidate_active_nav');
      if (stored) return stored;
      return location.state?.openSlots ? 'slots' : 'home';
    } catch {
      return location.state?.openSlots ? 'slots' : 'home';
    }
  });
  const [userName, setUserName] = useState('');
  const [candidateTechnologies, setCandidateTechnologies] = useState([]);

  const candidateUser = (() => {
    try {
      const raw = sessionStorage.getItem('sb_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [candidateProfile, setCandidateProfile] = useState(() => candidateUser);

  // Candidate match keys for calendar: mobile is primary, Firestore id is legacy fallback
  const candidateIds = (() => {
    const userOrProfile = candidateProfile || candidateUser;
    return userOrProfile ? getCandidateMatchKeys(userOrProfile) : [];
  })();

  const [showFeedbackRequiredModal, setShowFeedbackRequiredModal] = useState(false);
  const [candidateSlots, setCandidateSlots] = useState([]);
  const candidateIdsKey = candidateIds.join(',');

  // Subscribe to candidate slots in real-time to track feedback lock status
  useEffect(() => {
    if (candidateIds.length === 0) return undefined;
    const unsub = subscribeToCandidateSlots(candidateIds, setCandidateSlots);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIdsKey]);

  // Check if candidate account is inactive due to last interview > 2 weeks ago
  const isCandidateInactive = useMemo(() => {
    const candidateObj = candidateProfile || candidateUser || candidateIds;
    return isCandidateInterviewOlderThanTwoWeeks(candidateSlots, candidateObj);
  }, [candidateSlots, candidateProfile, candidateUser, candidateIdsKey]);

  // Compute pending feedback slots: any existing slot (latest/last slot) that is not rejected and has no feedback
  const pendingFeedbackSlots = useMemo(() => {
    return candidateSlots.filter((slot) => {
      const hasFeedback = Boolean(slot.feedback && String(slot.feedback).trim());
      const isRejected = String(slot.status || '').trim().toLowerCase() === 'rejected';
      return !isRejected && !hasFeedback;
    });
  }, [candidateSlots]);

  // A candidate may hold up to 2 slots without feedback; at 3, booking locks until feedback is given.
  const hasPendingFeedback = pendingFeedbackSlots.length >= 3;
  // Caption under the locked buttons: the slots whose interview ended and still need feedback
  // (all pending ones when none has ended yet, since feedback opens only after an interview).
  const lockNote = useMemo(() => {
    if (!hasPendingFeedback) return '';
    const ended = pendingFeedbackSlots.filter((s) => isSlotPast(s));
    const list = (ended.length ? ended : pendingFeedbackSlots)
      .map((s) => `${s.company || s.companyName || 'Slot'} (${formatDateDDMMYYYY(s.date)})`)
      .join(', ');
    return ended.length ? `Give feedback for ${list} to unlock.` : `Unlocks after feedback for ${list}, once each interview ends.`;
  }, [hasPendingFeedback, pendingFeedbackSlots]);

  const handleOpenBookSlot = async () => {
    let currentProfile = candidateProfile;
    // If state indicates inactive, do a fast live check against Firestore in case
    // admin recently activated the candidate and state/snapshot is propagating
    if (isCandidateInactive) {
      try {
        const candId = String(currentProfile?.id || currentProfile?.firestoreId || candidateUser?.id || '').trim();
        const candMobile = normalizeCandidateMobile(currentProfile?.mobile || candidateUser?.mobile);
        let freshDoc = null;
        if (candId) {
          const snap = await getDoc(doc(db, 'candidates', candId));
          if (snap.exists()) freshDoc = { id: snap.id, firestoreId: snap.id, ...snap.data() };
        }
        if (!freshDoc && candMobile) {
          const q = query(collection(db, 'candidates'), where('mobile', '==', candMobile));
          const snap = await getDocs(q);
          if (!snap.empty) freshDoc = { id: snap.docs[0].id, firestoreId: snap.docs[0].id, ...snap.docs[0].data() };
        }
        if (freshDoc) {
          currentProfile = freshDoc;
          setCandidateProfile(freshDoc);
          try {
            const raw = sessionStorage.getItem('sb_user');
            const parsed = raw ? JSON.parse(raw) : {};
            sessionStorage.setItem('sb_user', JSON.stringify({ ...parsed, ...freshDoc }));
          } catch {
            // ignore
          }
        }
      } catch (checkErr) {
        console.warn('Could not re-verify candidate status from Firestore:', checkErr);
      }
    }

    const candidateObj = currentProfile || candidateUser || candidateIds;
    const stillInactive = isCandidateInterviewOlderThanTwoWeeks(candidateSlots, candidateObj);
    if (stillInactive) {
      alert('Your account is currently inactive because your last interview was more than two weeks ago. Please contact the administrator.');
      return;
    }
    if (hasPendingFeedback) {
      setShowFeedbackRequiredModal(true);
      return;
    }
    setBookFrom(activeNav); // breadcrumb: the page Book Slot was opened from
    setShowBookSlot(true);
    setActiveNav('slots');
  };

  // Auth guard: redirect if not candidate. Send admins to their dashboard (so back button works correctly)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sb_user');
      const parsed = raw ? JSON.parse(raw) : null;
      const role = (parsed?.role || '').trim().toLowerCase();
      if (!parsed?.mobile) {
        navigate('/login', { replace: true });
        return;
      }
      if (role === 'admin') {
        navigate('/admin-dashboard', { replace: true });
      }
    } catch {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // HR list shared state - fetched from Firestore
  const [hrListRaw, setHrList] = useState([]);
  // Interview count per HR comes from this candidate's live slots (no full events read).
  const hrList = useMemo(() => {
    const countByHr = {};
    candidateSlots.forEach((ev) => {
      const id = String(ev.hrId || '').trim();
      if (id) countByHr[id] = (countByHr[id] || 0) + 1;
    });
    return hrListRaw.map((hr) => ({ ...hr, interviewCount: countByHr[hr.id] || 0 }));
  }, [hrListRaw, candidateSlots]);
  const hrsLoadedKeyRef = useRef(-1);
  const [hrsLoading, setHrsLoading] = useState(true);
  const [hrsRefreshing, setHrsRefreshing] = useState(false);
  const [hrsError, setHrsError] = useState(null);
  const [hrsRefreshKey, setHrsRefreshKey] = useState(0);

  // Fetch HRs once per refresh, when the dashboard opens (the header shows the My HRs count).
  // HR index: 1 read per page load for every HR (was the whole hrs collection on every login).
  useEffect(() => {
    if (hrsLoadedKeyRef.current === hrsRefreshKey) return undefined;

    const fetchHRs = async () => {
      hrsLoadedKeyRef.current = hrsRefreshKey;
      try {
        const hasExistingRows = Array.isArray(hrList) && hrList.length > 0;
        if (hasExistingRows) {
          setHrsRefreshing(true);
        } else {
          setHrsLoading(true);
        }
        setHrsError(null);
        setHrList(await getMyHrs({ fresh: hrsRefreshKey > 0 })); // only the HRs this candidate added
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch HRs:', err);
        hrsLoadedKeyRef.current = -1; // allow retry
        setHrsError('Failed to load HR list. Please try again.');
      } finally {
        setHrsLoading(false);
        setHrsRefreshing(false);
      }
    };

    fetchHRs();
    return undefined;
  }, [activeNav, hrsRefreshKey, showBookSlot]);

  useEffect(() => {
    let cancelled = false;
    let unsubSnapshot = null;

    const normaliseTechnologies = (data) => {
      if (!data) return [];
      if (Array.isArray(data.technologies)) {
        return data.technologies.map((t) => String(t || '').trim()).filter(Boolean);
      }
      if (Array.isArray(data.technology)) {
        return data.technology.map((t) => String(t || '').trim()).filter(Boolean);
      }
      if (typeof data.technology === 'string' && data.technology.trim()) {
        return data.technology
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
      return [];
    };

    const loadUserName = async () => {
      try {
        const raw = sessionStorage.getItem('sb_user');
        const parsed = raw ? JSON.parse(raw) : null;
        const cachedName = (parsed?.name || '').trim();
        const cachedTechs = Array.isArray(parsed?.technologies)
          ? parsed.technologies.map((t) => String(t || '').trim()).filter(Boolean)
          : [];
        if (cachedTechs.length) setCandidateTechnologies(cachedTechs);
        if (cachedName) {
          setUserName(cachedName);
        }

        const candidateId = String(parsed?.id || parsed?.firestoreId || '').trim();
        const mobile = String(parsed?.mobile || '').trim();
        if (!candidateId && !mobile) return;

        const applyCandidateData = (docId, data) => {
          if (!data) return;
          const profile = {
            id: docId,
            firestoreId: docId,
            mobile: mobile || data.mobile,
            ...data,
          };
          setCandidateProfile(profile);

          const name = String(data?.name || cachedName || '').trim();
          if (name) {
            setUserName(name);
          }
          const techs = normaliseTechnologies(data);
          if (techs.length) setCandidateTechnologies(techs);

          try {
            sessionStorage.setItem(
              'sb_user',
              JSON.stringify({
                ...parsed,
                ...profile,
                name: name || cachedName,
                technologies: techs,
              }),
            );
          } catch {
            // ignore
          }
        };

        // Real-time listener: subscribe directly to the candidate document in candidates collection
        if (candidateId) {
          unsubSnapshot = onSnapshot(
            doc(db, 'candidates', candidateId),
            (snap) => {
              if (cancelled) return;
              if (snap.exists()) {
                applyCandidateData(snap.id, snap.data());
              }
            },
            (err) => {
              console.warn('Candidate doc snapshot error:', err);
            },
          );
        } else if (mobile) {
          const candQ = query(collection(db, 'candidates'), where('mobile', '==', mobile));
          unsubSnapshot = onSnapshot(
            candQ,
            (candSnap) => {
              if (cancelled) return;
              if (!candSnap.empty) {
                applyCandidateData(candSnap.docs[0].id, candSnap.docs[0].data());
              }
            },
            (err) => {
              console.warn('Candidate query snapshot error:', err);
            },
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load candidate name:', err);
      }
    };

    loadUserName();

    return () => {
      cancelled = true;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [currentUser]);

  const handleUseExistingHrOnBookSlot = async (existingHr) => {
    const hrId = String(existingHr?.id || '').trim();
    if (!hrId) return;
    setShowAddHR(false);
    // The matched HR (contact only) joins this candidate's list, so Book Slot can select it.
    setHrList((prev) => (prev.some((h) => h.id === hrId) ? prev : [existingHr, ...prev]));

    let currentProfile = candidateProfile;
    if (isCandidateInactive) {
      try {
        const candId = String(currentProfile?.id || currentProfile?.firestoreId || candidateUser?.id || '').trim();
        const candMobile = normalizeCandidateMobile(currentProfile?.mobile || candidateUser?.mobile);
        let freshDoc = null;
        if (candId) {
          const snap = await getDoc(doc(db, 'candidates', candId));
          if (snap.exists()) freshDoc = { id: snap.id, firestoreId: snap.id, ...snap.data() };
        }
        if (!freshDoc && candMobile) {
          const q = query(collection(db, 'candidates'), where('mobile', '==', candMobile));
          const snap = await getDocs(q);
          if (!snap.empty) freshDoc = { id: snap.docs[0].id, firestoreId: snap.docs[0].id, ...snap.docs[0].data() };
        }
        if (freshDoc) {
          currentProfile = freshDoc;
          setCandidateProfile(freshDoc);
        }
      } catch {
        // ignore
      }
    }

    const candidateObj = currentProfile || candidateUser || candidateIds;
    if (isCandidateInterviewOlderThanTwoWeeks(candidateSlots, candidateObj)) {
      alert('Your account is currently inactive because your last interview was more than two weeks ago. Please contact the administrator.');
      return;
    }
    if (hasPendingFeedback) {
      setShowFeedbackRequiredModal(true);
      return;
    }
    setBookFrom(activeNav); // breadcrumb: the page Book Slot was opened from
    setShowBookSlot(true);
    setActiveNav('slots');
    setBookSlotSelectHrId(hrId);
  };

  // Duplicates: checked by the pop-up (HR index) and again by the hrs function.
  const handleAddHR = async (hr) => {
    try {
      // The hrs function saves it with "Added By" from this candidate's record and updates the HR index.
      const { hr: saved } = await saveHr('create', { hr });
      setHrList((prev) => [saved, ...prev.filter((h) => h.id !== saved.id)]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save HR to Firestore:', err);
      throw err; // Re-throw so modal can handle error
    }
  };

  // Persist candidate active nav so refresh keeps the same section
  useEffect(() => {
    try {
      sessionStorage.setItem('sb_candidate_active_nav', activeNav);
    } catch {
      // ignore
    }
  }, [activeNav]);

  const handleNavClick = async (navId) => {
    if (activeNav === 'myprofile' && navId !== 'myprofile') {
      if (!(await mayLeave())) return; // unsaved resume edits
      navigated();
    }
    setActiveNav(navId);
    if (navId === 'home') {
      setShowBookSlot(false);
    }
  };

  const myHrList = hrList; // the server already returns only this candidate's HRs

  const handleLogout = () => {
    sessionStorage.removeItem('sb_user');
    clearSyncedCollections();
    forgetHrIndex();
    signOut(auth).catch(() => {});
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={userName}
        activeNav={activeNav}
        onChangeNav={handleNavClick}
        totalSlotsCount={candidateSlots.length}
        totalHrsCount={myHrList.length}
        onEditProfile={() => handleNavClick('profile')}
        onDownloadForm={() =>
          downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')
        }
        onLogout={handleLogout}
      />
      <Navbar 
        onOpenAddHR={() => handleNavClick('hrs')}
        onDownloadForm={() =>
          downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')
        }
        onEditProfile={() => handleNavClick('profile')}
        onNavChange={handleNavClick}
        activeNav={activeNav}
      />
      {/* Home screen: no breadcrumb (it would only say "Home"); every other screen starts its trail at Home. */}
      {(activeNav !== 'home' || showBookSlot) && <Breadcrumbs
        items={[
          ['Home', () => handleNavClick('home')],
          ...(showBookSlot
            ? [...(bookFrom !== 'home' && NAV_LABELS[bookFrom] ? [[NAV_LABELS[bookFrom], () => { setShowBookSlot(false); setActiveNav(bookFrom); }]] : []), ['Add New Slot']]
            : activeNav !== 'home' && NAV_LABELS[activeNav]
            ? [[NAV_LABELS[activeNav]]]
            : []),
        ].map(([label, onClick]) => ({ label, onClick, icon: CRUMB_ICONS[label] }))}
      />}
      {!showBookSlot && activeNav === 'home' && (
        <div className="px-2 pt-2 sm:px-4 md:px-8 print:hidden">
          <PlacedCandidatesMarquee />
        </div>
      )}
      <main
        className={`px-2 pb-2 sm:px-4 sm:pb-4 md:px-8 md:pb-8 print:p-0 ${
          !showBookSlot && activeNav === 'home'
            ? 'pt-0 sm:pt-0 md:pt-0'
            : 'pt-1 sm:pt-2'
        }`}
      >
        {showBookSlot ? (
          <BookSlot
            candidateProfile={candidateProfile}
            candidateSlots={candidateSlots}
            onClose={() => setShowBookSlot(false)}
            onOpenAddHR={() => setShowAddHR(true)}
            onBookSuccess={() => {
              setShowBookSlot(false);
              setActiveNav('slots');
            }}
            hrList={hrList}
            candidateTechnologies={candidateTechnologies}
            selectHrId={bookSlotSelectHrId}
            onSelectHrApplied={() => setBookSlotSelectHrId(null)}
          />
        ) : activeNav === 'profile' ? (
          <CandidateProfileEditForm
            userName={userName}
            hrs={myHrList}
            profile={candidateProfile?.firestoreId ? candidateProfile : null}
            onBack={() => setActiveNav('home')}
            onLogout={handleLogout}
          />
        ) : activeNav === 'admission' ? (
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Loading…</div>}>
            <MyAdmissionProfile mobile={candidateUser?.mobile || candidateProfile?.mobile} onBack={() => handleNavClick('home')} />
          </Suspense>
        ) : activeNav === 'myprofile' ? (
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Loading…</div>}>
            <MyResume mobile={candidateUser?.mobile || candidateProfile?.mobile} candidate={candidateProfile} onBack={() => handleNavClick('home')} />
          </Suspense>
        ) : activeNav === 'slots' ? (
          <MySlots
            slots={candidateSlots}
            onBookNewSlot={handleOpenBookSlot}
            onBackToHome={() => setActiveNav('home')}
            hrList={hrList}
            hasPendingFeedback={hasPendingFeedback}
            lockNote={lockNote}
          />
        ) : activeNav === 'hrs' ? (
          <CandidateHrsList
            hrs={myHrList}
            loading={hrsLoading}
            refreshing={hrsRefreshing}
            error={hrsError}
            onAddNewHR={() => setShowAddHR(true)}
            onBackToHome={() => setActiveNav('home')}
            onReload={() => setHrsRefreshKey((k) => k + 1)}
          />
        ) : (
          <CandidateCalendarArea
            candidateIds={candidateIds}
            ownSlots={candidateSlots}
            onOpenAddHR={() => {
              setActiveNav('hrs');
              setShowAddHR(true);
            }}
            onOpenBookSlot={handleOpenBookSlot}
            hasPendingFeedback={hasPendingFeedback}
            lockNote={lockNote}
          />
        )}
      </main>

      <AddHRModal
        isOpen={showAddHR}
        onClose={() => {
          setShowAddHR(false);
          if (activeNav === 'hrs') {
            setActiveNav('home');
          }
        }}
        onAdd={handleAddHR}
        onUseExistingHR={showBookSlot ? handleUseExistingHrOnBookSlot : null}
        technologyOptions={candidateTechnologies}
      />
      
      <FeedbackRequiredModal
        isOpen={showFeedbackRequiredModal}
        onClose={() => setShowFeedbackRequiredModal(false)}
        pendingSlots={pendingFeedbackSlots}
        onFeedbackSubmitted={() => setShowFeedbackRequiredModal(false)}
      />
    </div>
  );
}
