import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

// Use the same collection as the existing app so both UIs
// operate on the shared events data.
const SLOTS_COLLECTION = 'events';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format date as DD-MMM-YYYY (e.g. 21-Feb-2026). Use everywhere for consistent display.
 */
export function formatDateDDMMYYYY(dateVal) {
  if (!dateVal) return '';
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Convert an approved slot to calendar event format for SlotCalendar.
 * Expects slot with: date (Date), startHour, startMinute, duration, candidateName, company.
 */
export function slotToCalendarEvent(slot) {
  const candidateId = String(slot.candidateId || '').trim();
  const extendedProps = {
    company: slot.company || slot.companyName || '',
    technology: slot.technology || '',
    candidateName: slot.candidateName || slot.name || '',
    status: slot.status || '',
    interviewRound: slot.round || slot.interviewRound || '',
    referredBy: slot.referredBy || slot.refereedBy || '',
    hrName: slot.hrName || '',
    hrEmail: slot.hrEmail || '',
    hrMobile: slot.hrMobile || '',
  };

  // Prefer explicit start/end ISO timestamps when present (events schema).
  if (slot.startISO && slot.endISO) {
    const title = slot.candidateName || slot.name || 'Slot';
    return {
      id: slot.id || slot.firestoreId,
      start: slot.startISO,
      end: slot.endISO,
      title: title || 'Interview',
      candidateId,
      referredBy: slot.referredBy || slot.refereedBy || '',
      extendedProps,
    };
  }

  // Fallback to date + startHour/startMinute + duration (slots schema).
  const d = slot.date?.toDate ? slot.date.toDate() : new Date(slot.date);
  const start = new Date(d);
  start.setHours(slot.startHour ?? 0, slot.startMinute ?? 0, 0, 0);
  const end = new Date(start.getTime() + (slot.duration || 30) * 60 * 1000);
  const title = slot.candidateName || slot.name || 'Slot';
  return {
    id: slot.id || slot.firestoreId,
    start: start.toISOString(),
    end: end.toISOString(),
    title: title || 'Interview',
    candidateId,
    referredBy: slot.referredBy || slot.refereedBy || '',
    extendedProps,
  };
}

/**
 * Subscribe to approved slots and call callback with calendar events.
 * Loads all slots and filters client-side to avoid Firestore query/index issues.
 */
export function subscribeToApprovedSlots(callback) {
  const slotsRef = collection(db, SLOTS_COLLECTION);

  // Cache of candidateId -> { name, referredBy } so calendar can show
  // candidate name and color slots by referrer, even for legacy events.
  let candidatesCache = null;
  // Cache of hrId -> { name, email, mobile } for enriching HR details
  let hrCache = null;

  const ensureCandidatesCache = async () => {
    if (candidatesCache) return candidatesCache;
    const snap = await getDocs(collection(db, 'candidates'));
    const map = {};
    snap.forEach((d) => {
      const data = d.data() || {};
      const name = (data.name || '').trim();
      const referredBy = (data.referredBy || data.refereedBy || '').trim();
      if (name) {
        map[d.id] = { name, referredBy };
      }
    });
    candidatesCache = map;
    return candidatesCache;
  };

  const processSnapshot = async (snapshot) => {
    try {
      await ensureCandidatesCache();
      if (!hrCache) {
        const snap = await getDocs(collection(db, 'hrs'));
        const map = {};
        snap.forEach((d) => {
          const data = d.data() || {};
          map[d.id] = {
            name: (data.name || '').trim(),
            email: (data.email || '').trim(),
            mobile: (data.mobile || '').trim(),
          };
        });
        hrCache = map;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error loading candidates for calendar:', err);
    }

    const allSlots = snapshot.docs.map((d) => {
      const slot = slotDocToUI(d);
      const id = (slot.candidateId || '').trim();
      const cacheEntry = id && candidatesCache ? candidatesCache[id] : null;
      const hrId = (slot.hrId || '').trim();
      const hrEntry = hrId && hrCache ? hrCache[hrId] : null;

      let candidateName = (slot.candidateName || slot.name || '').trim();
      let referredBy = (slot.referredBy || slot.refereedBy || '').trim();
      let hrName = (slot.hrName || '').trim();
      let hrEmail = (slot.hrEmail || '').trim();
      let hrMobile = (slot.hrMobile || '').trim();

      if (!candidateName && cacheEntry?.name) {
        candidateName = cacheEntry.name;
      }
      if (!referredBy && cacheEntry?.referredBy) {
        referredBy = cacheEntry.referredBy;
      }
      if (hrEntry) {
        if (!hrName && hrEntry.name) hrName = hrEntry.name;
        if (!hrEmail && hrEntry.email) hrEmail = hrEntry.email;
        if (!hrMobile && hrEntry.mobile) hrMobile = hrEntry.mobile;
      }

      return {
        ...slot,
        candidateName,
        referredBy,
        hrName,
        hrEmail,
        hrMobile,
      };
    });

    // Filter to approved only (handle both 'Approved' and 'approved')
    const approvedSlots = allSlots.filter((slot) => {
      const s = String(slot.status || '').trim();
      return s === 'Approved' || s === 'approved';
    });

    const events = approvedSlots.map(slotToCalendarEvent);
    callback(events);
  };

  // Subscribe to ALL events (no status filter) - avoids index/query issues
  return onSnapshot(
    slotsRef,
    (snapshot) => {
      processSnapshot(snapshot);
    },
    (err) => {
      console.error('Error subscribing to slots for calendar:', err);
      callback([]);
    },
  );
}

/**
 * Subscribe to a candidate's own slots (any status: pending, approved, etc.).
 * Use for candidate dashboard calendar so they see their booked slots.
 * candidateIds: array of ids to match (Firestore doc ID, mobile, or Firebase UID).
 */
export function subscribeToCandidateSlots(candidateIds, callback) {
  const ids = (candidateIds || []).filter(Boolean);
  if (ids.length === 0) {
    callback([]);
    return () => {};
  }

  const slotsRef = collection(db, SLOTS_COLLECTION);
  const q =
    ids.length === 1
      ? query(slotsRef, where('candidateId', '==', ids[0]))
      : query(slotsRef, where('candidateId', 'in', ids));

  return onSnapshot(
    q,
    (snapshot) => {
      const slots = snapshot.docs.map((d) => slotDocToUI(d));
      const events = slots.map(slotToCalendarEvent);
      callback(events);
    },
    (err) => {
      console.error('Error subscribing to candidate slots:', err);
      callback([]);
    },
  );
}

/**
 * Subscribe to all slots (any status) and call callback with calendar events.
 * Returns unsubscribe function.
 */
export function subscribeToAllSlots(callback) {
  const slotsRef = collection(db, SLOTS_COLLECTION);
  return onSnapshot(
    slotsRef,
    (snapshot) => {
      const slots = snapshot.docs.map((d) => slotDocToUI(d));
      const events = slots.map(slotToCalendarEvent);
      callback(events);
    },
    (err) => {
      console.error('Error subscribing to all slots:', err);
      callback([]);
    },
  );
}

/**
 * Format timestamp to readable date label
 */
function formatDateLabel(date) {
  const now = new Date();
  const slotDate = date.toDate ? date.toDate() : new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slotDay = new Date(
    slotDate.getFullYear(),
    slotDate.getMonth(),
    slotDate.getDate(),
  );

  if (slotDay.getTime() === today.getTime()) {
    return 'Today';
  } else if (slotDay.getTime() === tomorrow.getTime()) {
    return 'Upcoming (Tomorrow)';
  } else if (slotDay > now) {
    const daysDiff = Math.ceil((slotDay - today) / (1000 * 60 * 60 * 24));
    return `Upcoming (In ${daysDiff} days)`;
  } else {
    return formatDateDDMMYYYY(slotDate);
  }
}

/**
 * Format timestamp to readable time label
 */
function formatTimeLabel(hour, minute, duration) {
  const startHour = parseInt(hour, 10);
  const startMin = parseInt(minute, 10);
  const durationMins = parseInt(duration, 10);

  const startHour12 = startHour % 12 === 0 ? 12 : startHour % 12;
  const startAmPm = startHour < 12 ? 'AM' : 'PM';
  const startMinStr = String(startMin).padStart(2, '0');

  const endTime = new Date();
  endTime.setHours(startHour, startMin + durationMins, 0, 0);
  const endHour = endTime.getHours();
  const endHour12 = endHour % 12 === 0 ? 12 : endHour % 12;
  const endAmPm = endHour < 12 ? 'AM' : 'PM';
  const endMinStr = String(endTime.getMinutes()).padStart(2, '0');

  let durationLabel = '';
  if (durationMins < 60) {
    durationLabel = `${durationMins} mins`;
  } else {
    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    durationLabel =
      mins > 0 ? `${hours} Hour ${mins} mins` : `${hours} Hour`;
  }

  return `${startHour12}:${startMinStr} ${startAmPm} – ${endHour12}:${endMinStr} ${endAmPm} (${durationLabel})`;
}

/**
 * Format createdAt to exact date and time (e.g. "21 Feb 2026, 3:45 PM")
 */
function formatCreatedAtExact(timestamp) {
  if (!timestamp) return '–';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const dateStr = formatDateDDMMYYYY(date);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateStr}, ${timeStr}`;
}

/**
 * Format slot date to exact date (e.g. "21 Feb 2026")
 */
function formatDateExact(date) {
  if (!date) return '–';
  const d = date.toDate ? date.toDate() : new Date(date);
  const str = formatDateDDMMYYYY(d);
  return str || '–';
}

/**
 * Format createdAt timestamp to readable string
 */
function formatCreatedAt(timestamp) {
  if (!timestamp) return 'Recently';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `Recently, ${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `Recently, ${timeStr}`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDateDDMMYYYY(date);
}

/**
 * Convert Firestore slot document to UI format.
 * Supports both admin format (startHour, startMinute, company) and legacy candidate format (time string, companyName).
 */
function slotDocToUI(docSnapshot) {
  const data = docSnapshot.data();
  const id = docSnapshot.id;

  // Parse date: Timestamp, Date, or ISO/date string (events store YYYY-MM-DD).
  let slotDate;
  if (data.date?.toDate) {
    slotDate = data.date.toDate();
  } else if (data.date instanceof Date) {
    slotDate = data.date;
  } else if (typeof data.date === 'string' && data.date) {
    slotDate = new Date(data.date + 'T00:00:00');
  } else if (data.start) {
    // Fallback: infer from start timestamp/ISO string
    const startVal = data.start?.toDate ? data.start.toDate() : new Date(data.start);
    slotDate = Number.isNaN(startVal.getTime()) ? new Date() : startVal;
  } else {
    slotDate = new Date();
  }

  // Derive start/end and duration:
  // 1) Prefer explicit startHour/startMinute/duration (slots schema)
  // 2) Otherwise, compute from start/end (events schema)
  let startHour = data.startHour;
  let startMinute = data.startMinute;
  let duration = data.duration != null ? Number(data.duration) : undefined;
  let startISO;
  let endISO;

  // Events schema: start/end stored as ISO strings or Timestamps
  if (!data.startHour && data.start) {
    const startVal = data.start?.toDate ? data.start.toDate() : new Date(data.start);
    const endVal = data.end?.toDate ? data.end.toDate() : new Date(data.end);
    if (!Number.isNaN(startVal.getTime()) && !Number.isNaN(endVal.getTime())) {
      startHour = startVal.getHours();
      startMinute = startVal.getMinutes();
      const diffMs = endVal.getTime() - startVal.getTime();
      const diffMins = Math.max(0, Math.round(diffMs / (1000 * 60)));
      duration = Number.isFinite(diffMins) && diffMins > 0 ? diffMins : 30;
      startISO = startVal.toISOString();
      endISO = endVal.toISOString();
    }
  }

  // Legacy time string support (e.g. "14:30")
  if (startHour == null && data.time) {
    const parts = String(data.time).trim().split(':');
    startHour = parseInt(parts[0], 10) || 0;
    startMinute = parseInt(parts[1], 10) || 0;
  }

  startHour = startHour != null ? startHour : 0;
  startMinute = startMinute != null ? startMinute : 0;
  const finalDuration = duration != null ? duration : 30;

  const company = data.company || data.companyName || '';

  return {
    id,
    firestoreId: id,
    candidateId: data.candidateId || '',
    candidateName: data.candidateName || '',
    hrId: data.hrId || '',
    hrName: data.hrName || '',
    hrEmail: data.hrEmail || '',
    hrMobile: data.hrMobile || '',
    company,
    technology: data.technology || '',
    round: data.round || data.interviewRound || '',
    date: slotDate,
    startHour,
    startMinute,
    duration: finalDuration,
    feedback: data.feedback || '',
    status: data.status || 'Pending',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    // Preserve original start/end when present so calendar can use them directly
    startISO,
    endISO,
    // Formatted labels for UI
    dateLabel: formatDateLabel(slotDate),
    dateExactLabel: formatDateExact(slotDate),
    timeLabel: formatTimeLabel(startHour, startMinute, finalDuration),
    createdAtLabel: formatCreatedAt(data.createdAt),
    createdAtExactLabel: formatCreatedAtExact(data.createdAt),
    updatedAtLabel: formatCreatedAt(data.updatedAt),
    updatedAtExactLabel: formatCreatedAtExact(data.updatedAt),
  };
}

/** Convert a Firestore query snapshot of slots to UI format (for real-time listener). */
export function slotsSnapshotToUI(snapshot) {
  return snapshot.docs.map((d) => slotDocToUI(d));
}

/**
 * Fetch slots for a given date (YYYY-MM-DD) for availability check.
 * Returns minimal time info: startHour, startMinute, duration (in minutes from midnight).
 */
export async function getSlotsForDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return [];
  try {
    const slotsRef = collection(db, SLOTS_COLLECTION);

    // Events schema stores date as a YYYY-MM-DD string. Prefer that path.
    let qRef;
    qRef = query(slotsRef, where('date', '==', dateStr));

    const snapshot = await getDocs(qRef);

    const result = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Derive startHour/startMinute/duration similarly to slotDocToUI
      let startHour = data.startHour;
      let startMinute = data.startMinute;
      let duration = data.duration != null ? Number(data.duration) : undefined;

      if (!data.startHour && data.start) {
        const startVal = data.start?.toDate ? data.start.toDate() : new Date(data.start);
        const endVal = data.end?.toDate ? data.end.toDate() : new Date(data.end);
        if (!Number.isNaN(startVal.getTime()) && !Number.isNaN(endVal.getTime())) {
          startHour = startVal.getHours();
          startMinute = startVal.getMinutes();
          const diffMs = endVal.getTime() - startVal.getTime();
          const diffMins = Math.max(0, Math.round(diffMs / (1000 * 60)));
          duration = Number.isFinite(diffMins) && diffMins > 0 ? diffMins : 30;
        }
      }

      if (startHour == null && data.time) {
        const parts = String(data.time).trim().split(':');
        startHour = parseInt(parts[0], 10) || 0;
        startMinute = parseInt(parts[1], 10) || 0;
      }

      startHour = startHour != null ? startHour : 0;
      startMinute = startMinute != null ? startMinute : 0;
      const finalDuration = duration != null ? duration : 30;

      result.push({ startHour, startMinute, duration: finalDuration });
    });
    return result;
  } catch (error) {
    console.error('Error fetching slots for date:', error);
    return [];
  }
}

/**
 * Check if a requested time range overlaps any existing slots on the same date.
 * Requested: startHour, startMinute, duration (minutes).
 * Returns true if slot is available (no overlap).
 */
export function isSlotAvailable(existingSlots, startHour, startMinute, durationMins) {
  const reqStart = parseInt(startHour, 10) * 60 + parseInt(startMinute, 10);
  const reqEnd = reqStart + parseInt(durationMins, 10);

  for (const slot of existingSlots) {
    const sh = slot.startHour != null ? slot.startHour : 0;
    const sm = slot.startMinute != null ? slot.startMinute : 0;
    const dur = slot.duration != null ? slot.duration : 30;
    const exStart = sh * 60 + sm;
    const exEnd = exStart + dur;
    if (reqStart < exEnd && reqEnd > exStart) return false;
  }
  return true;
}

/**
 * Fetch all slots from Firestore
 */
export async function getAllSlots() {
  try {
    const slotsRef = collection(db, SLOTS_COLLECTION);
    const q = query(slotsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const slots = [];
    querySnapshot.forEach((doc) => {
      slots.push(slotDocToUI(doc));
    });

    return slots;
  } catch (error) {
    console.error('Error fetching slots:', error);
    throw error;
  }
}

/**
 * Fetch slots by status
 */
export async function getSlotsByStatus(status) {
  try {
    const slotsRef = collection(db, SLOTS_COLLECTION);
    const q = query(
      slotsRef,
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
    );
    const querySnapshot = await getDocs(q);

    const slots = [];
    querySnapshot.forEach((doc) => {
      slots.push(slotDocToUI(doc));
    });

    return slots;
  } catch (error) {
    console.error('Error fetching slots by status:', error);
    throw error;
  }
}

/**
 * Fetch slots by candidate ID
 */
export async function getSlotsByCandidate(candidateId) {
  try {
    const slotsRef = collection(db, SLOTS_COLLECTION);
    const q = query(
      slotsRef,
      where('candidateId', '==', candidateId),
      orderBy('createdAt', 'desc'),
    );
    const querySnapshot = await getDocs(q);

    const slots = [];
    querySnapshot.forEach((doc) => {
      slots.push(slotDocToUI(doc));
    });

    return slots;
  } catch (error) {
    console.error('Error fetching slots by candidate:', error);
    throw error;
  }
}

/**
 * Fetch slots by candidate name (for search)
 */
export async function getSlotsByCandidateName(candidateName) {
  try {
    const slotsRef = collection(db, SLOTS_COLLECTION);
    const q = query(
      slotsRef,
      where('candidateName', '>=', candidateName),
      where('candidateName', '<=', candidateName + '\uf8ff'),
      orderBy('candidateName'),
      orderBy('createdAt', 'desc'),
    );
    const querySnapshot = await getDocs(q);

    const slots = [];
    querySnapshot.forEach((doc) => {
      slots.push(slotDocToUI(doc));
    });

    return slots;
  } catch (error) {
    console.error('Error fetching slots by candidate name:', error);
    // Fallback: fetch all and filter client-side
    const allSlots = await getAllSlots();
    return allSlots.filter((slot) =>
      slot.candidateName.toLowerCase().includes(candidateName.toLowerCase()),
    );
  }
}

/**
 * Create a new slot booking
 */
export async function createSlot(slotData) {
  try {
    const {
      candidateId,
      candidateName,
      hrId,
      hrName,
      company,
      technology,
      round,
      date, // Date object or string
      startHour,
      startMinute,
      duration,
    } = slotData;

    // Convert date to Firestore Timestamp
    let dateTimestamp;
    if (date instanceof Date) {
      dateTimestamp = Timestamp.fromDate(date);
    } else if (typeof date === 'string') {
      dateTimestamp = Timestamp.fromDate(new Date(date));
    } else {
      throw new Error('Invalid date format');
    }

    const slotRef = collection(db, SLOTS_COLLECTION);
    const newSlot = {
      candidateId: candidateId || '',
      candidateName: candidateName || '',
      hrId: hrId || '',
      hrName: hrName || '',
      company: company || '',
      technology: technology || '',
      round: round || '',
      date: dateTimestamp,
      startHour: parseInt(startHour, 10),
      startMinute: parseInt(startMinute, 10),
      duration: parseInt(duration, 10),
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(slotRef, newSlot);
    console.log('Slot created with ID:', docRef.id);

    // Fetch and return the created slot
    const docSnapshot = await getDoc(docRef);
    return slotDocToUI(docSnapshot);
  } catch (error) {
    console.error('Error creating slot:', error);
    throw error;
  }
}

/**
 * Update slot status (Approve/Reject)
 */
export async function updateSlotStatus(slotId, status) {
  try {
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      throw new Error('Invalid status. Must be Pending, Approved, or Rejected');
    }

    const slotRef = doc(db, SLOTS_COLLECTION, slotId);
    await updateDoc(slotRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    // Fetch and return updated slot
    const docSnapshot = await getDoc(slotRef);
    return slotDocToUI(docSnapshot);
  } catch (error) {
    console.error('Error updating slot status:', error);
    throw error;
  }
}

/**
 * Delete a slot
 */
export async function deleteSlot(slotId) {
  try {
    const slotRef = doc(db, SLOTS_COLLECTION, slotId);
    await deleteDoc(slotRef);
    console.log('Slot deleted:', slotId);
    return true;
  } catch (error) {
    console.error('Error deleting slot:', error);
    throw error;
  }
}

/**
 * Get slot statistics
 */
export async function getSlotStatistics() {
  try {
    const allSlots = await getAllSlots();
    const now = new Date();

    // Normalize to start of today
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Define calendar weeks starting on Monday
    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMonday = (day + 6) % 7; // 0 if Monday, 1 if Tuesday, etc.
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const getSlotDateOnly = (slot) => {
      const d = slot.date?.toDate ? slot.date.toDate() : new Date(slot.date);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    // Only consider approved slots for statistics
    const approvedSlots = allSlots.filter((slot) => slot.status === 'Approved');

    // Last Week: previous calendar week (Mon–Sun)
    const lastWeekSlots = allSlots.filter((slot) => {
      const slotDate = getSlotDateOnly(slot);
      return slotDate >= startOfLastWeek && slotDate < startOfWeek;
    });

    // This Week: current calendar week (full Mon–Sun)
    const thisWeekSlots = allSlots.filter((slot) => {
      const slotDate = getSlotDateOnly(slot);
      return slotDate >= startOfWeek && slotDate < startOfNextWeek;
    });

    // Average per week over the last 4 calendar weeks (including this week)
    const startOfFourWeeksAgo = new Date(startOfWeek);
    startOfFourWeeksAgo.setDate(startOfFourWeeksAgo.getDate() - 21); // 3 weeks before current week

    const fourWeekSlots = approvedSlots.filter((slot) => {
      const slotDate = getSlotDateOnly(slot);
      return slotDate >= startOfFourWeeksAgo && slotDate < startOfNextWeek;
    });
    const avgPerWeek = fourWeekSlots.length / 4;

    // Average per day over the last 30 days (including today)
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const dailySlots = approvedSlots.filter((slot) => {
      const slotDate = getSlotDateOnly(slot);
      return slotDate >= thirtyDaysAgo && slotDate < endOfToday;
    });
    const avgPerDay = dailySlots.length / 30;

    return {
      total: approvedSlots.length,
      lastWeek: lastWeekSlots.filter((s) => s.status === 'Approved').length,
      thisWeek: thisWeekSlots.filter((s) => s.status === 'Approved').length,
      avgPerWeek: Math.round(avgPerWeek * 10) / 10,
      avgPerDay: Math.round(avgPerDay * 10) / 10,
      pending: allSlots.filter((s) => s.status === 'Pending').length,
      approved: allSlots.filter((s) => s.status === 'Approved').length,
      rejected: allSlots.filter((s) => s.status === 'Rejected').length,
    };
  } catch (error) {
    console.error('Error calculating slot statistics:', error);
    throw error;
  }
}

// --- Admin Leaves (block slot booking on these dates) ---
// Reuse the existing adminLeaves collection so leave days are shared.
const LEAVES_COLLECTION = 'adminLeaves';

/**
 * Get all leave dates from Firestore. Returns array of { id, date } where date is YYYY-MM-DD.
 */
export async function getLeaves() {
  try {
    const ref = collection(db, LEAVES_COLLECTION);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((d) => ({
      id: d.id,
      // Normalise to YYYY-MM-DD string for consumers like BookSlot/WeekCalendar.
      date: (() => {
        const raw = d.data().date;
        if (raw?.toDate) {
          const dt = raw.toDate();
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const day = String(dt.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
        if (typeof raw === 'string') return raw;
        return '';
      })(),
      dateLabel: d.data().dateLabel || (d.data().date?.toDate ? formatDateDDMMYYYY(d.data().date.toDate()) : ''),
    }));
  } catch (err) {
    console.error('Error loading leaves:', err);
    return [];
  }
}

/**
 * Add a leave day. dateStr should be YYYY-MM-DD, dateLabel is for display.
 */
export async function addLeave(dateStr, dateLabel) {
  const ref = collection(db, LEAVES_COLLECTION);
  const docRef = await addDoc(ref, {
    date: dateStr,
    dateLabel: dateLabel || dateStr,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Delete a leave by Firestore document id.
 */
export async function deleteLeave(id) {
  await deleteDoc(doc(db, LEAVES_COLLECTION, id));
}
