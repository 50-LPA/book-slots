import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../context/AuthContext';
import { getSlotsForDate, isSlotAvailable, getLeaves, formatDateDDMMYYYY } from '../firebase/slotsService';

function normaliseKey(value) {
  return String(value || '').trim().toLowerCase();
}

export default function BookSlot({
  onClose,
  onOpenAddHR,
  onBookSuccess,
  hrList = [],
  candidateTechnologies = [],
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [form, setForm] = useState({
    date: '',
    dateDisplay: '',
    hour: '',
    minute: '00',
    duration: '',
    technology: '',
    round: '',
    hr: '',
  });
  const dateRef = useRef(null);
  const calendarRef = useRef(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [errors, setErrors] = useState({});
  const [availabilityState, setAvailabilityState] = useState('idle'); // 'idle' | 'needs_fields' | 'available' | 'unavailable'
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [meetingEndTime, setMeetingEndTime] = useState('');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [leaveDates, setLeaveDates] = useState([]); // YYYY-MM-DD strings

  useEffect(() => {
    getLeaves().then((list) => setLeaveDates(list.map((l) => l.date).filter(Boolean)));
  }, []);

  const techOptions = useMemo(() => {
    const list = Array.isArray(candidateTechnologies)
      ? candidateTechnologies.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    return [...new Set(list)];
  }, [candidateTechnologies]);
  const isTechnologyRestricted = techOptions.length > 0;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      const updated = { ...f, [name]: value };
      // Auto-update AM/PM based on hour selection
      if (name === 'hour' && value) {
        const hourNum = parseInt(value, 10);
        // AM/PM will be calculated dynamically in render
      }
      if (name === 'technology') {
        // Technology controls which HRs are shown; clear selection when it changes.
        updated.hr = '';
      }
      return updated;
    });
    if (name === 'technology') {
      setHrQuery('');
      setShowHrDropdown(false);
    }
  };

  // If date/time/duration changes, force re-check availability
  useEffect(() => {
    setAvailabilityState('idle');
    setAvailabilityMessage('');
    setMeetingEndTime('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.hour, form.minute, form.duration]);

  const handleClose = () => {
    setAvailabilityState('idle');
    setAvailabilityMessage('');
    setMeetingEndTime('');
    if (onClose) {
      onClose();
    }
  };

  // Calculate AM/PM based on selected hour
  const getAmPm = () => {
    if (!form.hour) return 'AM';
    const hourNum = parseInt(form.hour, 10);
    return hourNum >= 12 ? 'PM' : 'AM';
  };

  // Format date for shortcuts (internal: YYYY-MM-DD)
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // YYYY-MM-DD -> DD-MMM-YYYY for display (e.g. 21-Feb-2026)
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (Number.isNaN(d.getTime())) return dateStr;
      return formatDateDDMMYYYY(d);
    } catch {
      return dateStr;
    }
  };

  // DD-MMM-YYYY (e.g. 21-Feb-2026) -> YYYY-MM-DD for storage
  const parseDDMMYYYY = (str) => {
    if (!str || typeof str !== 'string') return '';
    const cleaned = str.trim().replace(/\s/g, '');
    const match = cleaned.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{4})$/);
    if (!match) return '';
    const [, dayStr, monthStr, yearStr] = match;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.indexOf(monthStr.toLowerCase());
    if (mi < 0) return '';
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    if (day < 1 || day > 31) return '';
    const date = new Date(year, mi, day);
    if (Number.isNaN(date.getTime())) return '';
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const formatShortcutDate = (date) => formatDateDDMMYYYY(date);

  const handleDateShortcut = (type) => {
    const today = new Date();
    let targetDate;

    if (type === 'today') {
      targetDate = today;
    } else if (type === 'tomorrow') {
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + 1);
    } else if (type === 'next2') {
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + 2);
    } else if (type === 'next3') {
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + 3);
    }

    if (targetDate) {
      const yyyymmdd = formatDateForInput(targetDate);
      setForm((f) => ({ ...f, date: yyyymmdd, dateDisplay: formatDateForDisplay(yyyymmdd) }));
    }
  };

  const today = new Date();
  const dateIn2Days = new Date(today);
  dateIn2Days.setDate(today.getDate() + 2);
  const dateIn3Days = new Date(today);
  dateIn3Days.setDate(today.getDate() + 3);

  // Small calendar popover helpers
  const getCalendarDays = (year, month) => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };
  const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isSundayDate = (d) => d && d.getDay() === 0;
  const isLeaveDayDate = (d) => {
    if (!d) return false;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return leaveDates.includes(`${y}-${m}-${day}`);
  };

  // HR search state for searchable dropdown
  const [hrQuery, setHrQuery] = useState('');
  const [showHrDropdown, setShowHrDropdown] = useState(false);
  const hrDropdownRefDesktop = useRef(null);
  const hrDropdownRefMobile = useRef(null);
  const selectedHR = hrList.find((h) => String(h.id) === String(form.hr));
  const filteredHR = hrList.filter((h) => {
    if (isTechnologyRestricted && form.technology) {
      if (normaliseKey(h.technology) !== normaliseKey(form.technology)) return false;
    }
    if (!hrQuery) return true;
    const q = hrQuery.toLowerCase();
    return (h.name || '').toLowerCase().includes(q) || (h.company || '').toLowerCase().includes(q);
  });

  // Close HR dropdown when clicking outside (check both desktop and mobile refs)
  useEffect(() => {
    if (!showHrDropdown) return;

    const handleClickOutside = (event) => {
      const inDesktop = hrDropdownRefDesktop.current?.contains(event.target);
      const inMobile = hrDropdownRefMobile.current?.contains(event.target);
      if (!inDesktop && !inMobile) {
        setShowHrDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showHrDropdown]);

  const isSunday = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return d.getDay() === 0; // 0 = Sunday
  };

  const isLeaveDay = (dateStr) => {
    if (!dateStr) return false;
    return leaveDates.includes(dateStr);
  };

  const checkAvailability = async () => {
    const ok = validate(['date', 'hour', 'minute', 'duration']);
    if (!ok) {
      setAvailabilityState('needs_fields');
      setAvailabilityMessage(
        'Please select date, start time, and meeting duration.',
      );
      return;
    }

    if (isSunday(form.date)) {
      setAvailabilityState('unavailable');
      setAvailabilityMessage('Slot cannot be booked on Sunday.');
      return;
    }
    if (isLeaveDay(form.date)) {
      setAvailabilityState('unavailable');
      setAvailabilityMessage('Slot cannot be booked on admin leave day.');
      return;
    }

    setCheckingAvailability(true);
    setAvailabilityState('idle');
    setAvailabilityMessage('');

    try {
      const existingSlots = await getSlotsForDate(form.date);
      const available = isSlotAvailable(
        existingSlots,
        form.hour,
        form.minute,
        form.duration,
      );

      if (!available) {
        setMeetingEndTime('');
        setAvailabilityState('unavailable');
        setAvailabilityMessage('This slot is not available.');
        setCheckingAvailability(false);
        return;
      }

      // Compute meeting end time label
      let endLabel = '';
      try {
        const [hh, mm] = String(form.hour || '')
          .split(':')
          .map((v) => parseInt(v, 10));
        const minuteVal = parseInt(form.minute, 10);
        const dur = parseInt(form.duration, 10);
        const start = new Date();
        start.setHours(hh, Number.isNaN(minuteVal) ? 0 : minuteVal, 0, 0);
        const end = new Date(start.getTime() + (Number.isNaN(dur) ? 0 : dur) * 60000);
        endLabel = end.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
      } catch {
        endLabel = '';
      }

      setMeetingEndTime(endLabel);
      setAvailabilityState('available');
      setAvailabilityMessage('');
    } catch (err) {
      console.error('Availability check failed:', err);
      setAvailabilityState('unavailable');
      setAvailabilityMessage('Could not check availability. Please try again.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const bookSlot = async () => {
    const required = ['date', 'hour', 'minute', 'duration', 'round', 'hr'];
    if (isTechnologyRestricted) required.splice(4, 0, 'technology');
    const ok = validate(required);
    if (!ok) return;

    if (isSunday(form.date)) {
      setAvailabilityState('unavailable');
      setAvailabilityMessage('Slot cannot be booked on Sunday.');
      alert('Slot cannot be booked on Sunday. Please choose a different day.');
      return;
    }
    if (isLeaveDay(form.date)) {
      setAvailabilityState('unavailable');
      setAvailabilityMessage('Slot cannot be booked on admin leave day.');
      alert('Slot cannot be booked on admin leave day. Please choose a different day.');
      return;
    }

    // Re-check availability right before saving to prevent double-booking
    try {
      const existingSlots = await getSlotsForDate(form.date);
      const available = isSlotAvailable(
        existingSlots,
        form.hour,
        form.minute,
        form.duration,
      );
      if (!available) {
        setAvailabilityState('unavailable');
        setAvailabilityMessage('This slot is not available.');
        alert('This slot has already been booked. Please choose a different time.');
        return;
      }
    } catch (err) {
      console.error('Availability re-check failed:', err);
      alert('Could not verify slot availability. Please try again.');
      return;
    }

    // Determine candidate identity from current sb_user session only
    // Events will store candidateId as either Firestore doc id or mobile
    let candidateId = '';
    let candidateName = 'Candidate';
    try {
      const raw = sessionStorage.getItem('sb_user');
      const parsed = raw ? JSON.parse(raw) : null;
      const firestoreId = String(parsed?.id || '').trim();
      const mobile = String(parsed?.mobile || '').trim();
      const name = (parsed?.name || '').trim();
      candidateId = firestoreId || mobile;
      if (name) candidateName = name;
    } catch {
      // ignore sessionStorage errors
    }

    if (!candidateId) {
      // eslint-disable-next-line no-alert
      alert('Please log in again to book a slot.');
      return;
    }

    const hr = selectedHR || {};
    const company = hr.company || '';
    const technology = hr.technology || '';
    const hrName = hr.name || '';
    const hrEmail = hr.email || '';
    const hrMobile = hr.mobile || '';
    const startHour24 = parseInt(form.hour, 10) || 0;
    const startMinute = parseInt(form.minute, 10) || 0;
    const duration = parseInt(form.duration, 10) || 30;

    // Construct start/end Date objects in local time, then store as ISO strings
    const dateStr = form.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const startDateTime = new Date(`${dateStr}T${String(startHour24).padStart(2, '0')}:${String(
      startMinute,
    ).padStart(2, '0')}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const payload = {
      company,
      technology: form.technology || technology || '',
      interviewRound: form.round,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString(),
      date: dateStr,
      status: 'Pending Approval',
      feedback: '',
      createdAt: new Date().toISOString(),
      candidateId,
      isApproved: false,
      hrId: hr.id || '',
      // Extra fields are safe for the existing app to ignore
      hrName,
      hrEmail,
      hrMobile,
      candidateName,
    };

    try {
      await addDoc(collection(db, 'events'), payload);
      if (onBookSuccess) {
        onBookSuccess();
      }
      navigate('/candidate-dashboard', { state: { openSlots: true }, replace: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to book slot:', err);
      // eslint-disable-next-line no-alert
      alert('Failed to book slot. Please try again.');
    }
  };

  function isTimeInRange(hour, minute, min = '11:00', max = '19:00') {
    if (!hour || minute == null) return false;
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const time = `${hh}:${mm}`;
    return time >= min && time <= max;
  }

  function validate(fields = []) {
    const e = {};
    const require = (name) => {
      if (!form[name]) e[name] = 'This field is required';
    };

    fields.forEach((f) => {
      if (f === 'hour' || f === 'minute') {
        // require both hour and minute if either is in the list
        if (!form.hour) e.hour = 'Hour is required';
        if (!form.minute) e.minute = 'Minute is required';
        if (form.hour && form.minute && !isTimeInRange(form.hour, form.minute)) {
          e.time = 'Time must be between 11:00 and 19:00';
        }
      } else {
        require(f);
      }
    });

    // Disallow booking within 5 minutes of current time (only for today)
    if (form.date && form.hour && form.minute) {
      const hh = String(form.hour).padStart(2, '0');
      const mm = String(form.minute).padStart(2, '0');
      const startDateTime = new Date(`${form.date}T${hh}:${mm}:00`);

      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;

      if (form.date === todayLocal) {
        const minAllowed = Date.now() + 5 * 60 * 1000;
        if (!Number.isNaN(startDateTime.getTime()) && startDateTime.getTime() < minAllowed) {
          e.time = 'You cannot book a slot within 5 minutes of the current time.';
        }
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="w-full">
      {/* Card same width as My Slots list */}
      <div className="bg-white rounded-lg sm:rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6 w-full">
          <div className="flex items-center mb-6">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-100"
            >
              <i className="fa-solid fa-arrow-left w-4 h-4" aria-hidden="true" />
            </button>
            <h2 className="mx-auto text-purple-600 font-semibold text-sm md:text-base">Book Slot</h2>
          </div>

          {/* iPad (md): 2 cols to prevent overlap; desktop (lg): 4 cols; mobile: 1 col */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch overflow-visible">
            {/* COLUMN 1 (Left) */}
            <div className="flex flex-col gap-3">
              {/* Date field */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  <span className="text-red-500">*</span> Date
                </label>
                <div className="mt-1 relative">
                  {/* Desktop: text input DD-MMM-YYYY format */}
                  <div className="hidden sm:block relative w-full">
                    <input
                      ref={dateRef}
                      type="text"
                      name="date"
                      placeholder="DD-MMM-YYYY"
                      value={form.dateDisplay !== undefined ? form.dateDisplay : formatDateForDisplay(form.date)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const parsed = parseDDMMYYYY(raw);
                        if (parsed) {
                          setForm((f) => ({ ...f, date: parsed, dateDisplay: formatDateForDisplay(parsed) }));
                        } else if (raw === '') {
                          setForm((f) => ({ ...f, date: '', dateDisplay: '' }));
                        } else {
                          setForm((f) => ({ ...f, date: '', dateDisplay: raw }));
                        }
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const parsed = parseDDMMYYYY(raw);
                        if (parsed) {
                          setForm((f) => ({ ...f, date: parsed, dateDisplay: formatDateForDisplay(parsed) }));
                        } else if (raw === '') {
                          setForm((f) => ({ ...f, date: '', dateDisplay: '' }));
                        }
                      }}
                      className="w-full border border-gray-200 rounded-md pl-3 pr-10 py-2 text-sm h-9 placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                      if (!showCalendar && form.date) {
                        const d = new Date(form.date + 'T12:00:00');
                        setCalendarView({ year: d.getFullYear(), month: d.getMonth() });
                      }
                      setShowCalendar((v) => !v);
                    }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer bg-transparent border-0"
                      aria-label="Open calendar"
                    >
                      <i className="fa-solid fa-calendar text-sm" aria-hidden="true" />
                    </button>
                  </div>
                  {/* Mobile: tap-to-open with icon */}
                  <div className="sm:hidden relative w-full">
                    <button
                      type="button"
                      className="w-full text-left border border-gray-200 rounded-md pl-3 pr-10 py-2 text-sm h-9 bg-white"
                      onClick={() => {
                      if (!showCalendar && form.date) {
                        const d = new Date(form.date + 'T12:00:00');
                        setCalendarView({ year: d.getFullYear(), month: d.getMonth() });
                      }
                      setShowCalendar((v) => !v);
                    }}
                    >
                      {form.date ? formatDateForDisplay(form.date) : 'DD-MMM-YYYY'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                      if (!showCalendar && form.date) {
                        const d = new Date(form.date + 'T12:00:00');
                        setCalendarView({ year: d.getFullYear(), month: d.getMonth() });
                      }
                      setShowCalendar((v) => !v);
                    }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer bg-transparent border-0"
                      aria-label="Open calendar"
                    >
                      <i className="fa-solid fa-calendar text-sm" aria-hidden="true" />
                    </button>
                  </div>
                  {/* Small calendar popover - positioned below input */}
                  {showCalendar && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setShowCalendar(false)}
                    />
                    <div
                      ref={calendarRef}
                      className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => setCalendarView((v) => ({ ...v, month: v.month - 1 < 0 ? 11 : v.month - 1, year: v.month - 1 < 0 ? v.year - 1 : v.year }))}
                          className="p-1 rounded hover:bg-gray-100 text-gray-600"
                        >
                          <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        </button>
                        <span className="text-sm font-medium">
                          {new Date(calendarView.year, calendarView.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCalendarView((v) => ({ ...v, month: v.month + 1 > 11 ? 0 : v.month + 1, year: v.month + 1 > 11 ? v.year + 1 : v.year }))}
                          className="p-1 rounded hover:bg-gray-100 text-gray-600"
                        >
                          <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                          <div key={d} className="py-1 text-gray-500 font-medium">{d}</div>
                        ))}
                        {getCalendarDays(calendarView.year, calendarView.month).map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={!day || isSundayDate(day) || isLeaveDayDate(day)}
                            onClick={() => {
                              if (day && !isSundayDate(day) && !isLeaveDayDate(day)) {
                                const yyyymmdd = formatDateForInput(day);
                                setForm((f) => ({ ...f, date: yyyymmdd, dateDisplay: formatDateForDisplay(yyyymmdd) }));
                                setShowCalendar(false);
                              }
                            }}
                            className={`py-1.5 rounded text-sm ${
                              !day
                                ? 'invisible'
                                : isSundayDate(day) || isLeaveDayDate(day)
                                ? 'text-gray-300 cursor-not-allowed'
                                : isSameDay(day, form.date ? new Date(form.date + 'T12:00:00') : null)
                                ? 'bg-purple-600 text-white'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {day ? day.getDate() : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                  )}
                </div>
                {/* Quick date links - now clickable */}
                <div className="mt-2 text-xs text-purple-600 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => handleDateShortcut('today')}
                    className="text-purple-600 hover:text-purple-800 cursor-pointer"
                  >
                    Today
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleDateShortcut('tomorrow')}
                    className="text-purple-600 hover:text-purple-800 cursor-pointer"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateShortcut('next2')}
                    className="text-purple-600 hover:text-purple-800 cursor-pointer"
                  >
                    {formatShortcutDate(dateIn2Days)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateShortcut('next3')}
                    className="text-purple-600 hover:text-purple-800 cursor-pointer"
                  >
                    {formatShortcutDate(dateIn3Days)}
                  </button>
                </div>
              </div>

              {/* Technology dropdown - visible only after availability confirmed (desktop lg only; iPad gets it in row below) */}
              {availabilityState === 'available' && (
                <div className="hidden lg:block">
                  <label className="block text-xs font-medium text-gray-600 mt-6">
                    {isTechnologyRestricted ? (
                      <>
                        <span className="text-red-500">*</span> Technology
                      </>
                    ) : (
                      <>Technology</>
                    )}
                  </label>
                  <select
                    name="technology"
                    value={form.technology}
                    onChange={handleChange}
                    disabled={!isTechnologyRestricted}
                    className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    {isTechnologyRestricted ? (
                      <option value="">Select Technology</option>
                    ) : (
                      <option value="">No technology assigned</option>
                    )}
                    {techOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {errors.technology && (
                    <p className="text-xs text-red-500 mt-1">{errors.technology}</p>
                  )}
                  {!isTechnologyRestricted && (
                    <p className="text-xs text-slate-500 mt-1">
                      Your profile has no technology assigned. Please contact admin.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* COLUMN 2 (Middle) - Start Time stretches full column */}
            <div className="flex flex-col gap-3 min-w-0">
              {/* Start Time */}
              <div className="w-full min-w-0">
                <label className="block text-xs font-medium text-gray-600">
                  <span className="text-red-500">*</span> Start Time
                </label>
                <div className="mt-1 flex gap-2 items-center w-full">
                  <select
                    name="hour"
                    value={form.hour}
                    onChange={handleChange}
                    className="flex-1 min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                  >
                    <option value="">Hour</option>
                    {Array.from({ length: 9 }).map((_, i) => {
                      const hh = 11 + i; // 11..19
                      const displayHour = hh % 12 === 0 ? 12 : hh % 12;
                      return (
                        <option key={hh} value={String(hh).padStart(2, '0')}>
                          {displayHour}
                        </option>
                      );
                    })}
                  </select>

                  <select
                    name="minute"
                    value={form.minute}
                    onChange={handleChange}
                    className="flex-1 min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                  >
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>

                  {/* AM/PM indicator box (dynamic) */}
                  <div className="flex-shrink-0 w-12 h-9 border border-gray-200 rounded-md flex items-center justify-center text-sm text-gray-500 bg-gray-50">
                    {getAmPm()}
                  </div>
                </div>
                {errors.time && <p className="text-xs text-red-500 mt-1">{errors.time}</p>}
                {errors.hour && <p className="text-xs text-red-500 mt-1">{errors.hour}</p>}
                {errors.minute && <p className="text-xs text-red-500 mt-1">{errors.minute}</p>}
                <p className="text-xs text-red-500 mt-1">Book slots between 11 AM to 7 PM</p>
              </div>

              {/* Round dropdown - visible only after availability confirmed (desktop lg only; iPad gets it in row below) */}
              {availabilityState === 'available' && (
                <div className="hidden lg:block">
                  <label className="block text-xs font-medium text-gray-600 mt-6">
                    <span className="text-red-500">*</span> Round
                  </label>
                  <select
                    name="round"
                    value={form.round}
                    onChange={handleChange}
                    className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                  >
                    <option value="">Select Round</option>
                    <option>Technical Round 1</option>
                    <option>Technical Round 2</option>
                    <option>Technical Round 3</option>
                    <option>Manageral Round</option>
                    <option>HR Round</option>
                    <option>Task Assesment</option>
                  </select>
                  {errors.round && <p className="text-xs text-red-500 mt-1">{errors.round}</p>}
                </div>
              )}
            </div>

            {/* COLUMN 3 - Meeting Duration + Select HR */}
            <div className="flex flex-col gap-3 overflow-visible">
              {/* Meeting Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  <span className="text-red-500">*</span> Meeting Duration
                </label>
                <select
                  name="duration"
                  value={form.duration}
                  onChange={handleChange}
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                >
                  <option value="">Select Duration</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">1 Hour</option>
                  <option value="120">2 Hours</option>
                  <option value="180">3 Hours</option>
                  <option value="240">4 Hours</option>
                </select>
                {errors.duration && <p className="text-xs text-red-500 mt-1">{errors.duration}</p>}
              </div>

              {availabilityState === 'needs_fields' && (
                <p className="text-xs text-red-500 text-center">
                  {availabilityMessage || 'Please select date, start time, and meeting duration.'}
                </p>
              )}

              {availabilityState === 'unavailable' && (
                <p className="text-xs text-red-600 font-semibold text-center">
                  {availabilityMessage || 'This slot is not available.'}
                </p>
              )}

              {availabilityState === 'available' && (
                <div className="hidden md:block text-center">
                  {meetingEndTime && (
                    <p className="text-xs text-red-500">
                      Meeting End Time: {meetingEndTime}
                    </p>
                  )}
                  <p className="text-xs text-green-600 font-semibold">
                    Time slot is available.
                  </p>
                </div>
              )}

              {/* Select HR + Add New HR (same row) - visible only after availability confirmed (desktop/tablet) */}
              {availabilityState === 'available' && (
                <div className="hidden md:block md:min-w-0">
                  <label className="block text-xs font-medium text-gray-600">
                    <span className="text-red-500">*</span> Select HR
                  </label>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="relative flex-1 min-w-0 isolate" ref={hrDropdownRefDesktop}>
                      <input
                        type="text"
                        name="hr_search"
                        value={showHrDropdown ? hrQuery : selectedHR ? selectedHR.name : hrQuery}
                        onChange={(e) => {
                          setHrQuery(e.target.value);
                          setShowHrDropdown(true);
                        }}
                        onFocus={() => {
                          if (isTechnologyRestricted && !form.technology) return;
                          setShowHrDropdown(true);
                        }}
                        placeholder={
                          isTechnologyRestricted && !form.technology
                            ? 'Select technology first'
                            : 'Click to select HR'
                        }
                        disabled={isTechnologyRestricted && !form.technology}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                      {showHrDropdown && (
                      <ul className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-md mt-1 shadow-lg max-h-48 overflow-auto z-[100] overscroll-contain">
                        {filteredHR.length > 0 ? (
                          filteredHR.map((h) => (
                            <li key={h.id} className="list-none">
                              <button
                                type="button"
                                role="option"
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 cursor-pointer flex justify-between items-center touch-manipulation border-0 bg-transparent"
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                                onTouchEnd={(ev) => {
                                  ev.preventDefault();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                              >
                                <div>
                                  <div className="text-sm font-medium text-gray-800">{h.name}</div>
                                  <div className="text-xs text-gray-500">{h.company}</div>
                                </div>
                              </button>
                            </li>
                          ))
                        ) : (
                          <li className="px-3 py-2 text-sm text-gray-600">
                            No HR found.
                            <button
                              type="button"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                setShowHrDropdown(false);
                                onOpenAddHR();
                              }}
                              className="ml-2 text-purple-600 underline"
                            >
                              Create new HR
                            </button>
                          </li>
                        )}
                      </ul>
                      )}
                    </div>
                    <button type="button" onClick={onOpenAddHR} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-purple-100 text-purple-700 text-sm h-9 flex-shrink-0">
                      + Add New HR
                    </button>
                  </div>

                  {errors.hr && <p className="text-xs text-red-500 mt-1">{errors.hr}</p>}
                  {/* helper text */}
                  <div className="mt-1">
                    <p className="text-xs text-red-500">• Create new HR if not listed.</p>
                    <p className="text-xs text-green-600">• Search HR name or Company name.</p>
                  </div>
                </div>
              )}
            </div>

            {/* COLUMN 4 - Check Availability + Book My Slot at corner */}
            <div className="flex flex-col gap-3 h-full">
              {form.date && (
                <button
                  type="button"
                  onClick={checkAvailability}
                  disabled={checkingAvailability}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-yellow-200 hover:bg-yellow-300 text-sm h-9 w-full disabled:opacity-70 disabled:cursor-not-allowed mt-6"
                >
                  {checkingAvailability ? 'Checking…' : 'Check Availability'}
                </button>
              )}
              {/* iPad-only: Technology + Round between Check Availability and Book My Slot */}
              {availabilityState === 'available' && (
                <div className="hidden md:grid lg:hidden grid-cols-2 gap-3">
                  <div className="col-start-1">
                    <label className="block text-xs font-medium text-gray-600">
                      {isTechnologyRestricted ? (
                        <>
                          <span className="text-red-500">*</span> Technology
                        </>
                      ) : (
                        <>Technology</>
                      )}
                    </label>
                    <select
                      name="technology"
                      value={form.technology}
                      onChange={handleChange}
                      disabled={!isTechnologyRestricted}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {isTechnologyRestricted ? (
                        <option value="">Select Technology</option>
                      ) : (
                        <option value="">No technology assigned</option>
                      )}
                      {techOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {errors.technology && (
                      <p className="text-xs text-red-500 mt-1">{errors.technology}</p>
                    )}
                    {!isTechnologyRestricted && (
                      <p className="text-xs text-slate-500 mt-1">
                        Your profile has no technology assigned. Please contact admin.
                      </p>
                    )}
                  </div>
                  <div className="col-start-2">
                    <label className="block text-xs font-medium text-gray-600">
                      <span className="text-red-500">*</span> Round
                    </label>
                    <select
                      name="round"
                      value={form.round}
                      onChange={handleChange}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                    >
                      <option value="">Select Round</option>
                      <option>Technical Round 1</option>
                      <option>Technical Round 2</option>
                      <option>Technical Round 3</option>
                      <option>Manageral Round</option>
                      <option>HR Round</option>
                      <option>Task Assesment</option>
                    </select>
                    {errors.round && <p className="text-xs text-red-500 mt-1">{errors.round}</p>}
                  </div>
                </div>
              )}
              {availabilityState === 'available' && (
                <button
                  type="button"
                  onClick={bookSlot}
                  className="hidden md:inline-flex mt-auto items-center justify-center gap-2 px-3 py-2 rounded bg-emerald-400 hover:bg-emerald-500 text-white font-semibold h-9 w-full"
                >
                  Book My Slot
                </button>
              )}
            </div>
          </div>

          {/* Mobile-only stacked fields shown AFTER Check Availability */}
          {availabilityState === 'available' && (
            <div className="mt-4 space-y-3 md:hidden">
              {/* Technology */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  {isTechnologyRestricted ? (
                    <>
                      <span className="text-red-500">*</span> Technology
                    </>
                  ) : (
                    <>Technology</>
                  )}
                </label>
                <select
                  name="technology"
                  value={form.technology}
                  onChange={handleChange}
                  disabled={!isTechnologyRestricted}
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {isTechnologyRestricted ? (
                    <option value="">Select Technology</option>
                  ) : (
                    <option value="">No technology assigned</option>
                  )}
                  {techOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.technology && (
                  <p className="text-xs text-red-500 mt-1">{errors.technology}</p>
                )}
                {!isTechnologyRestricted && (
                  <p className="text-xs text-slate-500 mt-1">
                    Your profile has no technology assigned. Please contact admin.
                  </p>
                )}
              </div>

              {/* Round */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  <span className="text-red-500">*</span> Round
                </label>
                <select
                  name="round"
                  value={form.round}
                  onChange={handleChange}
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 bg-white"
                >
                  <option value="">Select Round</option>
                  <option>Technical Round 1</option>
                  <option>Technical Round 2</option>
                  <option>Technical Round 3</option>
                  <option>Manageral Round</option>
                  <option>HR Round</option>
                  <option>Task Assesment</option>
                </select>
                {errors.round && <p className="text-xs text-red-500 mt-1">{errors.round}</p>}
              </div>

              {/* Select HR */}
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  <span className="text-red-500">*</span> Select HR
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <div className="relative flex-1 min-w-0" ref={hrDropdownRefMobile}>
                    <input
                      type="text"
                      name="hr_search"
                      value={showHrDropdown ? hrQuery : selectedHR ? selectedHR.name : hrQuery}
                      onChange={(e) => {
                        setHrQuery(e.target.value);
                        setShowHrDropdown(true);
                      }}
                      onFocus={() => {
                        if (isTechnologyRestricted && !form.technology) return;
                        setShowHrDropdown(true);
                      }}
                      placeholder={
                        isTechnologyRestricted && !form.technology
                          ? 'Select technology first'
                          : 'Click to select HR'
                      }
                      disabled={isTechnologyRestricted && !form.technology}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm h-9 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    {showHrDropdown && (
                      <ul className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-md mt-1 shadow-lg max-h-48 overflow-auto z-[100] overscroll-contain">
                        {filteredHR.length > 0 ? (
                          filteredHR.map((h) => (
                            <li key={h.id} className="list-none">
                              <button
                                type="button"
                                role="option"
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 cursor-pointer flex justify-between items-center touch-manipulation border-0 bg-transparent"
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                                onTouchEnd={(ev) => {
                                  ev.preventDefault();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setForm((f) => ({ ...f, hr: h.id }));
                                  setHrQuery('');
                                  setShowHrDropdown(false);
                                }}
                              >
                                <div>
                                  <div className="text-sm font-medium text-gray-800">{h.name}</div>
                                  <div className="text-xs text-gray-500">{h.company}</div>
                                </div>
                              </button>
                            </li>
                          ))
                        ) : (
                          <li className="px-3 py-2 text-sm text-gray-600">
                            No HR found.
                            <button
                              type="button"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                setShowHrDropdown(false);
                                onOpenAddHR();
                              }}
                              className="ml-2 text-purple-600 underline"
                            >
                              Create new HR
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAddHR}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded bg-purple-100 text-purple-700 text-sm h-9 flex-shrink-0"
                  >
                    + Add New HR
                  </button>
                </div>
                {errors.hr && <p className="text-xs text-red-500 mt-1">{errors.hr}</p>}
              </div>

              {/* Availability status + Book button */}
              <div className="space-y-2">
                <div className="text-center">
                  {availabilityState === 'available' && meetingEndTime && (
                    <p className="text-xs text-red-500">
                      Meeting End Time: {meetingEndTime}
                    </p>
                  )}
                  {availabilityState === 'available' && (
                    <p className="text-xs text-green-600 font-semibold">
                      Time slot is available.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={bookSlot}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-emerald-400 hover:bg-emerald-500 text-white font-semibold h-9 w-full"
                >
                  Book My Slot
                </button>
              </div>
            </div>
          )}

          {/* (removed duplicate mobile book button - layout now uses the grid above) */}

          {/* Desktop corner buttons removed to avoid duplicates; using in-grid controls instead */}
        </div>
      </div>
  );
}

