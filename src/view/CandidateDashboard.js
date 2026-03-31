import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import Navbar from '../Components/Navbar';
import AddHRModal from '../Components/AddHRModal';
import BookSlot from './BookSlot';
import WeekCalendar from '../Components/WeekCalendar';
import { db } from '../firebase/firebase';
import { formatDateDDMMYYYY } from '../firebase/slotsService';
import { parseISOToDate } from '../calendar';
import { downloadWithSaveAs } from '../utils/downloadUtils';
// import { formatDayHeader } from '../calendar';
import { useAuth } from '../context/AuthContext';

// const MOCK_EVENTS = [];

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

function getInitials(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'C';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase() || 'C';
}

// Header Component with mobile sidebar nav (like Admin)
function Header({ userName, onLogout, activeNav, onChangeNav }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const initials = useMemo(() => getInitials(userName), [userName]);

  const navItems = [
    { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
    { id: 'slots', label: 'Slots', icon: 'fa-solid fa-calendar-days' },
    { id: 'hrs', label: 'HRs', icon: 'fa-solid fa-user-group' },
  ];

  const handleNavClick = (id) => {
    if (typeof onChangeNav === 'function') {
      onChangeNav(id);
    }
    setNavOpen(false);
  };

  return (
    <>
      <div className="bg-blue-100 px-2 sm:px-4 md:px-8 py-2 sm:py-3 md:py-4 flex items-center justify-between gap-2 sm:gap-3 relative">
        {/* Left Section: hamburger + title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-slate-700 hover:bg-blue-200 shadow-sm md:hidden"
            aria-label="Toggle navigation"
          >
            <i className="fa-solid fa-bars w-4 h-4" aria-hidden="true" />
          </button>
          <h1 className="text-sm sm:text-base md:text-xl font-bold text-gray-900 truncate">
            Slot Booking
          </h1>
        </div>

        {/* Center Section - domain (hidden on small screens) */}
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
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 focus:outline-none"
          >
            {/* Mobile: show name + role beside avatar, like desktop */}
            <div className="flex flex-col items-end sm:hidden">
              <p className="font-semibold text-[11px] text-gray-900 max-w-[120px] truncate">
                {userName || 'Candidate'}
              </p>
              <p className="text-[10px] text-gray-500">Candidate</p>
            </div>
            {/* Desktop / tablet: existing name + role */}
            <div className="text-right hidden sm:block">
              <p className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
                {userName || 'Candidate'}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500">Candidate</p>
            </div>
            <div className="w-8 sm:w-9 md:w-10 h-8 sm:h-9 md:h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-xs sm:text-sm md:text-base font-semibold text-white">
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
                    onLogout?.();
                  }}
                  className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2"
                >
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
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

// Candidate calendar area: other slots show "Slot Booked" + blue; own slots show name + referrer color
function CandidateCalendarArea({ onOpenAddHR, onOpenBookSlot, candidateIds = [] }) {
  const headerDate = new Date();
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarSelectedEvent, setCalendarSelectedEvent] = useState(null);

  const candidateTodayLabel = headerDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="bg-white rounded-lg sm:rounded-2xl shadow-md overflow-hidden border border-slate-300">
      {/* Title + candidate actions (Download, Add HR, Book Slot) */}
      <div className="border-b border-slate-200 p-3 sm:p-4 md:p-6">
        {/* Mobile: centered, stacked layout like admin */}
        <div className="flex flex-col items-center gap-2 mb-4 sm:hidden text-center">
          {/* Today's date */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-700">
            <span className="font-medium">Today {candidateTodayLabel}</span>
          </div>
          {/* Title + reload */}
          <div className="flex items-center justify-center gap-2">
            {/* Mobile heading without 'Calendar' */}
            <h2 className="text-sm font-semibold text-purple-600">
              Slot Booking
            </h2>
            <button
              type="button"
              onClick={() => setCalendarRefreshKey((k) => k + 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
              aria-label="Reload calendar"
            >
              <i className="fa-solid fa-rotate-right text-xs" aria-hidden="true" />
            </button>
          </div>
          {/* Download + actions stacked */}
          <div className="w-full flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')}
              className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold shadow"
            >
              <i className="fa-solid fa-cloud-arrow-down w-3 h-3" aria-hidden="true" />
              <span>Download Personal Detail Form 3.0</span>
            </button>
            <div className="flex w-full max-w-xs gap-2">
              <button
                type="button"
                onClick={onOpenAddHR}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                + Add New HR
              </button>
              <button
                type="button"
                onClick={onOpenBookSlot}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
              >
                + Book New Slot
              </button>
            </div>
          </div>
        </div>

        {/* Desktop / tablet layout (unchanged) */}
        <div className="hidden sm:block">
          <div className="flex md:flex-col lg:flex-row sm:items-center sm:justify-between md:justify-center lg:justify-between gap-3 mb-4 relative">
            {/* Left: Today's date */}
            <div className="flex items-center gap-2 md:justify-center">
              <span className="text-xs sm:text-sm text-gray-700 font-medium">
                Today {candidateTodayLabel}
              </span>
            </div>

            {/* Center: Title + reload - iPad: static; desktop: absolute */}
            <div className="absolute md:relative md:left-0 md:translate-x-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex items-center gap-2 md:justify-center">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-purple-600 whitespace-nowrap">
                Slot Booking
              </h2>
              <button
                type="button"
                onClick={() => setCalendarRefreshKey((k) => k + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
                aria-label="Reload calendar"
              >
                <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
              </button>
            </div>

            {/* Right: Action buttons */}
            <div className="flex flex-wrap gap-2 sm:gap-3 ml-auto md:ml-0 md:justify-center lg:ml-auto">
              <button
                type="button"
                onClick={() => downloadWithSaveAs('/interview_process_candidate_details.pdf', 'Personal_Detail_Form.pdf')}
                className="bg-blue-500 hover:bg-blue-600 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1 inline-flex"
              >
                <i className="fa-solid fa-cloud-arrow-down w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Download Personal Detail Form 3.0</span>
                <span className="sm:hidden">Download</span>
              </button>
              <button
                type="button"
                onClick={onOpenAddHR}
                className="bg-green-600 hover:bg-green-700 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                + Add New HR
              </button>
              <button
                type="button"
                onClick={onOpenBookSlot}
                className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
              >
                + Book New Slot
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <WeekCalendar
            key={calendarRefreshKey}
            candidateIds={candidateIds}
            onEventClick={(event) => {
              if (
                event.candidateId &&
                Array.isArray(candidateIds) &&
                candidateIds.includes(event.candidateId)
              ) {
                setCalendarSelectedEvent(event);
              }
            }}
          />
        </div>
      </div>
      {/* Calendar slot details popup (candidate calendar, only own slots) */}
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
function MySlots({ onBookNewSlot, onBackToHome, hrList = [] }) {
  // We derive identity from sessionStorage (sb_user) only,
  // so switching candidates via login immediately changes the query.
  const [slots, setSlots] = useState([]);
  const [slotSearch, setSlotSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [feedbackSlot, setFeedbackSlot] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const sbSessionRaw =
    typeof window !== 'undefined' ? sessionStorage.getItem('sb_user') : null;

  useEffect(() => {
    // Resolve candidate identity from current session.
    // We use candidateId stored as Firestore id or mobile for this candidate.
    let candidateIds = [];
    try {
      const parsed = sbSessionRaw ? JSON.parse(sbSessionRaw) : null;
      const id = String(parsed?.id || '').trim();
      const mobile = String(parsed?.mobile || '').trim();
      candidateIds = [id, mobile].filter(Boolean);
      candidateIds = [...new Set(candidateIds)];
    } catch {
      candidateIds = [];
    }

    if (candidateIds.length === 0) return;

    const eventsRef = collection(db, 'events');
    const q =
      candidateIds.length === 1
        ? query(eventsRef, where('candidateId', '==', candidateIds[0]))
        : query(eventsRef, where('candidateId', 'in', candidateIds));

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          };
        })
        // Safety: only keep slots for the current candidate ids
        .filter((item) => {
          const cid = String(item.candidateId || '').trim();
          return cid && candidateIds.includes(cid);
        });

      // Sort so newest slots (by createdAt) appear at the top
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;
        const bTime = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;
        return bTime - aTime;
      });

      setSlots(items);
    });
    return () => unsub();
  }, [sbSessionRaw, refreshKey]);

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

  const getSlotEndTime = (slot) => {
    // Determine end time from slot.end or from date + time + duration
    let endTime = null;
    if (slot.end) {
      const endVal = slot.end?.toDate ? slot.end.toDate() : new Date(slot.end);
      if (!Number.isNaN(endVal.getTime())) {
        endTime = endVal;
      }
    }
    if (!endTime) {
      const dateBase =
        slot.date?.toDate ? slot.date.toDate() : slot.date ? new Date(slot.date) : new Date();
      let hh = null;
      let mm = null;
      if (slot.startHour != null && slot.startMinute != null) {
        hh = parseInt(slot.startHour, 10);
        mm = parseInt(slot.startMinute, 10);
      } else if (slot.time) {
        const [th, tm] = String(slot.time).split(':').map((v) => parseInt(v, 10));
        if (!Number.isNaN(th) && !Number.isNaN(tm)) {
          hh = th;
          mm = tm;
        }
      }
      const dur = parseInt(slot.duration, 10) || 30;
      if (hh != null && mm != null) {
        const start = new Date(dateBase);
        start.setHours(hh, mm, 0, 0);
        endTime = new Date(start.getTime() + dur * 60000);
      }
    }
    return endTime;
  };

  const isSlotPast = (slot) => {
    const endTime = getSlotEndTime(slot);
    if (!endTime) return false;
    return endTime.getTime() <= Date.now();
  };

  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState(null);
  const [confirmDeleteSlotLabel, setConfirmDeleteSlotLabel] = useState('');

  const handleDeleteSlot = async (id) => {
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete slot:', err);
    }
  };

  const totalItems = filteredSlots.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedSlots = filteredSlots.slice(startIdx, startIdx + itemsPerPage);

  return (
    <div className="bg-white rounded-lg sm:rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header: back button left, title centered, Book New Slot button right */}
      <div className="flex items-center justify-between mb-4 gap-3">
        {/* Left: back button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Center: title + reload button */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-purple-600">
            My Slots
          </h2>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Reload slots"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Right: Book New Slot button (always enabled) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBookNewSlot}
            className="inline-flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold shadow whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
          >
            <span className="text-lg">+</span>
            <span>Book New Slot</span>
          </button>
        </div>
      </div>

      {/* Metrics + search row */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm text-slate-700">
          {/* Total slots card */}
          <div className="flex flex-col items-center">
            <span className="text-sm sm:text-base font-semibold text-slate-800">
              {totalSlots}
            </span>
            <span className="text-[11px] text-slate-500">Total Slots</span>
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
        <div className="flex items-center justify-end gap-3">
          <div className="relative w-32 sm:w-40">
            <input
              type="text"
              placeholder="Search slots..."
              value={slotSearch}
              onChange={(e) => setSlotSearch(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
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
        <div className="overflow-x-auto">
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
                <th className="px-3 py-2 text-left font-semibold border-b border-r border-slate-200">
                  Feedback
                </th>
                <th className="px-3 py-2 text-center font-semibold border-b border-slate-200">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedSlots.map((slot, index) => {
                const slotDate = slot.date?.toDate ? slot.date.toDate() : (slot.date ? new Date(slot.date) : null);
                const slotDateStr = slotDate ? slotDate.toISOString().slice(0, 10) : '';
                const isToday = slotDateStr === todayStr;
                const displayDate = formatDateDDMMYYYY(slot.date);
                const timeLabel = formatTimeLabel(slot);

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
                      {(() => {
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
                                <i className="fa-solid fa-phone text-slate-500 w-3.5" aria-hidden="true" />
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
                      })()}
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
                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                      {slot.feedback ? (
                        <span className="block max-w-[260px] whitespace-pre-wrap break-words">
                          {String(slot.feedback)}
                        </span>
                      ) : (() => {
                        const past = isSlotPast(slot);
                        if (!past) {
                          return (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-400 bg-slate-50 cursor-not-allowed"
                            >
                              <i className="fa-solid fa-lock text-[10px]" aria-hidden="true" />
                              Add Feedback
                            </button>
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setFeedbackSlot(slot);
                              setFeedbackText('');
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50"
                          >
                            <i className="fa-solid fa-comment-dots text-xs" aria-hidden="true" />
                            Add Feedback
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-700 text-center">
                      {!isSlotPast(slot) && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteSlotId(slot.id);
                            setConfirmDeleteSlotLabel(
                              `${slot.company || slot.companyName || 'Slot'} - ${slot.dateLabel || ''}`,
                            );
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                          aria-label="Delete"
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Delete slot confirmation modal */}
      {confirmDeleteSlotId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => {
            setConfirmDeleteSlotId(null);
            setConfirmDeleteSlotLabel('');
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-5 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Are you sure you want to delete this slot?
              </h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotLabel('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              {confirmDeleteSlotLabel}
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotLabel('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = confirmDeleteSlotId;
                  setConfirmDeleteSlotId(null);
                  setConfirmDeleteSlotLabel('');
                  if (id) {
                    await handleDeleteSlot(id);
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

      {/* Add Feedback modal */}
      {feedbackSlot && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => {
            if (!savingFeedback) {
              setFeedbackSlot(null);
              setFeedbackText('');
            }
          }}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white shadow-lg px-5 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
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
              >
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
                    await updateDoc(ref, { feedback: feedbackText.trim() });
                    setSlots((prev) =>
                      prev.map((s) =>
                        s.id === feedbackSlot.id ? { ...s, feedback: feedbackText.trim() } : s,
                      ),
                    );
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
              >
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

// Main Dashboard Component
export default function CandidateDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [showAddHR, setShowAddHR] = useState(false);
  const [showBookSlot, setShowBookSlot] = useState(false);
  // Remember last opened tab across refreshes for candidate.
  // If coming from a successful booking with openSlots, prefer "slots" once.
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

  // Candidate ids for calendar: derive directly from current sb_user session
  const candidateIds = (() => {
    try {
      const raw = sessionStorage.getItem('sb_user');
      const parsed = raw ? JSON.parse(raw) : null;
      const id = String(parsed?.id || '').trim();
      const mobile = String(parsed?.mobile || '').trim();
      const ids = [id, mobile].filter(Boolean);
      return [...new Set(ids)];
    } catch {
      return [];
    }
  })();

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
  const [hrList, setHrList] = useState([]);
  const [hrsLoading, setHrsLoading] = useState(true);
  const [hrsError, setHrsError] = useState(null);

  // Fetch HRs from Firestore "hrs" collection
  useEffect(() => {
    const fetchHRs = async () => {
      try {
        setHrsLoading(true);
        setHrsError(null);
        const q = collection(db, 'hrs');
        const querySnapshot = await getDocs(q);
        const hrsData = querySnapshot.docs.map((doc) => ({
          id: doc.id, // Store Firestore document ID
          name: doc.data().name || '',
          email: doc.data().email || '',
          company: doc.data().company || '',
          technology: doc.data().technology || '',
          mobile: doc.data().mobile || '',
          jobType: doc.data().jobType || '',
        }));
        setHrList(hrsData);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch HRs:', err);
        setHrsError('Failed to load HR list. Please try again.');
      } finally {
        setHrsLoading(false);
      }
    };

    fetchHRs();
  }, []);

  useEffect(() => {
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
          if (cachedTechs.length) return;
        }

        const mobile = String(parsed?.mobile || '').trim();
        if (!mobile) return;

        // Prefer candidates profile (this is where technologies are assigned).
        let data = null;
        try {
          const candQ = query(collection(db, 'candidates'), where('mobile', '==', mobile));
          const candSnap = await getDocs(candQ);
          if (!candSnap.empty) data = candSnap.docs[0].data();
        } catch {
          // ignore and fall back
        }

        // Fallback to legacy users collection (kept for backward compatibility)
        if (!data) {
          const q = query(collection(db, 'users'), where('mobile', '==', mobile));
          const snap = await getDocs(q);
          if (!snap.empty) data = snap.docs[0].data();
        }

        if (!data) return;

        const name = String(data?.name || '').trim();
        const techs = normaliseTechnologies(data);
        if (name) setUserName(name);
        if (techs.length) setCandidateTechnologies(techs);

        sessionStorage.setItem(
          'sb_user',
          JSON.stringify({ ...parsed, name: name || cachedName, technologies: techs }),
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load candidate name:', err);
      }
    };

    loadUserName();
  }, []);

  const handleAddHR = async (hr) => {
    try {
      // Resolve candidate name at save time so admin "Added By" shows who added the HR
      let addedByName = userName?.trim();
      if (!addedByName) {
        try {
          const raw = sessionStorage.getItem('sb_user');
          const parsed = raw ? JSON.parse(raw) : null;
          addedByName = (parsed?.name || '').trim();
        } catch {
          // ignore
        }
      }
      if (!addedByName && currentUser?.displayName) addedByName = currentUser.displayName.trim();
      if (!addedByName && currentUser?.email) addedByName = currentUser.email.split('@')[0];
      if (!addedByName) addedByName = 'Candidate';

      // IMPORTANT: Admin dashboard resolves "Added By" using candidate Firestore id or mobile,
      // not Firebase Auth uid. So store an identifier that the admin can look up.
      let sbSessionRaw = '';
      let sbSession = null;
      try {
        sbSessionRaw = sessionStorage.getItem('sb_user') || '';
        sbSession = sbSessionRaw ? JSON.parse(sbSessionRaw) : null;
      } catch {
        sbSessionRaw = '';
        sbSession = null;
      }
      const sessionCandidateId = String(sbSession?.id || '').trim();
      const sessionMobile = String(sbSession?.mobile || '').trim();
      const addedByIdForAdmin =
        (Array.isArray(candidateIds) && candidateIds[0] ? String(candidateIds[0]).trim() : '') ||
        sessionCandidateId ||
        sessionMobile ||
        null;

      const docRef = await addDoc(collection(db, 'hrs'), {
        name: hr.name || '',
        email: hr.email || '',
        mobile: hr.mobile || '',
        company: hr.company || '',
        technology: hr.technology || '',
        jobType: hr.jobType || '',
        addedBy: addedByName,
        addedById: addedByIdForAdmin || null,
        createdAt: serverTimestamp(),
      });

      // Update local state with Firestore ID
      setHrList((prev) => [
        {
          id: docRef.id,
          name: hr.name || '',
          email: hr.email || '',
          company: hr.company || '',
          technology: hr.technology || '',
          mobile: hr.mobile || '',
          jobType: hr.jobType || '',
        },
        ...prev,
      ]);
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

  const handleNavClick = (navId) => {
    setActiveNav(navId);
    if (navId === 'hrs') {
      setShowAddHR(true);
    } else if (navId === 'home') {
      setShowBookSlot(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        userName={userName}
        activeNav={activeNav}
        onChangeNav={handleNavClick}
        onLogout={() => {
          sessionStorage.removeItem('sb_user');
          navigate('/login', { replace: true });
        }}
      />
      <Navbar 
        onOpenAddHR={() => {
          setActiveNav('hrs');
          setShowAddHR(true);
        }}
        onNavChange={handleNavClick}
        activeNav={activeNav}
      />
      <main className="p-2 sm:p-4 md:p-8">
        {showBookSlot ? (
          <BookSlot
            onClose={() => setShowBookSlot(false)}
            onOpenAddHR={() => setShowAddHR(true)}
            onBookSuccess={() => {
              setShowBookSlot(false);
              setActiveNav('slots');
            }}
            hrList={hrList}
            candidateTechnologies={candidateTechnologies}
          />
        ) : activeNav === 'slots' ? (
          <MySlots
            onBookNewSlot={() => setShowBookSlot(true)}
            onBackToHome={() => setActiveNav('home')}
            hrList={hrList}
          />
        ) : (
          <CandidateCalendarArea
            candidateIds={candidateIds}
            onOpenAddHR={() => {
              setActiveNav('hrs');
              setShowAddHR(true);
            }}
            onOpenBookSlot={() => {
              setShowBookSlot(true);
              setActiveNav('slots');
            }}
          />
        )}
      </main>

      {/* Add New HR modal (opens only when showAddHR=true) */}
      <AddHRModal
        isOpen={showAddHR}
        onClose={() => {
          setShowAddHR(false);
          if (activeNav === 'hrs') {
            setActiveNav('home');
          }
        }}
        onAdd={handleAddHR}
        technologyOptions={candidateTechnologies}
      />
    </div>
  );
}
