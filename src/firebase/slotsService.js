import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { getSyncedDocs, forgetSyncedDoc } from './syncedCollection';
import { getHrIndex } from './hrIndex';
import {
  getCandidateMatchKeys,
  normalizeCandidateMobile,
  slotMatchesCandidateKeys,
} from '../utils/candidateIdentity';

// Use the same collection as the existing app so both UIs
// operate on the shared events data.
const SLOTS_COLLECTION = 'events';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format date as DD MMM YYYY (e.g. 15 Sep 2026). Use everywhere for consistent display.
 */
export function formatDateDDMMYYYY(dateVal) {
  if (!dateVal) return '';
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Returns slot end Date object based on end ISO, start ISO + duration, or date + time + duration.
 */
export function getSlotEndTime(slot) {
  if (!slot) return null;

  if (slot.end) {
    const endVal = slot.end?.toDate ? slot.end.toDate() : new Date(slot.end);
    if (!Number.isNaN(endVal.getTime())) {
      return endVal;
    }
  }

  let startTime = null;
  if (slot.start) {
    const startVal = slot.start?.toDate ? slot.start.toDate() : new Date(slot.start);
    if (!Number.isNaN(startVal.getTime())) {
      startTime = startVal;
    }
  }

  const dur = parseInt(slot.duration, 10) || 30;

  if (startTime) {
    return new Date(startTime.getTime() + dur * 60000);
  }

  // Parse slot.date
  let year = null;
  let month = null;
  let day = null;

  if (slot.date?.toDate) {
    const d = slot.date.toDate();
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  } else if (slot.date instanceof Date) {
    year = slot.date.getFullYear();
    month = slot.date.getMonth();
    day = slot.date.getDate();
  } else if (typeof slot.date === 'string') {
    const trimmed = slot.date.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.slice(0, 10).split('-').map((v) => parseInt(v, 10));
      year = parts[0];
      month = parts[1] - 1;
      day = parts[2];
    } else if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(trimmed)) {
      const parts = trimmed.split(/[-/]/).map((v) => parseInt(v, 10));
      day = parts[0];
      month = parts[1] - 1;
      year = parts[2];
    } else {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        year = parsed.getFullYear();
        month = parsed.getMonth();
        day = parsed.getDate();
      }
    }
  }

  if (year == null || month == null || day == null) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  }

  let hh = null;
  let mm = null;

  if (slot.startHour != null && slot.startMinute != null) {
    hh = parseInt(slot.startHour, 10);
    mm = parseInt(slot.startMinute, 10);
  } else if (slot.time) {
    const rawTime = String(slot.time).trim();
    const isPM = /pm/i.test(rawTime);
    const isAM = /am/i.test(rawTime);
    const cleanTime = rawTime.replace(/am|pm/gi, '').trim();
    const [th, tm] = cleanTime.split(':').map((v) => parseInt(v, 10));
    if (!Number.isNaN(th) && !Number.isNaN(tm)) {
      hh = th;
      mm = tm;
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
    }
  }

  if (hh == null || mm == null) {
    hh = 23;
    mm = 59;
  }

  const base = new Date(year, month, day, hh, mm, 0, 0);
  return new Date(base.getTime() + dur * 60000);
}

/**
 * Returns true if the slot end time is in the past.
 */
export function isSlotPast(slot) {
  const endTime = getSlotEndTime(slot);
  if (!endTime) return false;
  return endTime.getTime() <= Date.now();
}

/**
 * Convert an approved slot to calendar event format for SlotCalendar.
 * Expects slot with: date (Date), startHour, startMinute, duration, candidateName, company.
 */
export function slotToCalendarEvent(slot) {
  const candidateId = String(slot.candidateId || '').trim();
  const candidateMobile = normalizeCandidateMobile(
    slot.candidateMobile || slot.mobile || candidateId,
  );
  const extendedProps = {
    company: slot.company || slot.companyName || '',
    technology: slot.technology || '',
    candidateName: slot.candidateName || slot.name || '',
    candidateMobile,
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
      candidateMobile,
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
    candidateMobile,
    referredBy: slot.referredBy || slot.refereedBy || '',
    extendedProps,
  };
}

// Whole collections (candidates, hrs, events) come from the device copy in ./syncedCollection,
// which re-reads only changed docs. Public visitors / candidates may not list candidates
// (firestore.rules): remember a denial per signed-in uid so we don't retry; names then come from the event docs.
const deniedFor = {};
const currentUid = () => auth.currentUser?.uid ?? null;

/** Resolves to the collection's docs ([{ id, data() }]). Rejects on error. */
export function getCollectionDocs(name, options) {
  if (deniedFor[name] !== undefined && deniedFor[name] === currentUid()) {
    return Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
  }
  return getSyncedDocs(name, options).catch((err) => {
    if (err?.code === 'permission-denied') deniedFor[name] = currentUid();
    throw err;
  });
}

/** Map of candidate doc id AND mobile -> raw doc data. Empty on error. */
export async function getCandidatesById() {
  const map = new Map();
  try {
    (await getCollectionDocs('candidates')).forEach((d) => {
      const data = d.data() || {};
      map.set(d.id, data);
      const raw = String(data.mobile ?? data.phone ?? '').trim();
      if (raw) map.set(raw, data);
      const mob = normalizeCandidateMobile(raw);
      if (mob) map.set(mob, data);
    });
  } catch (err) {
    if (err?.code !== 'permission-denied') console.error('Error loading candidates:', err);
  }
  return map;
}

let globalCandidatesCache = null;
let globalHrCache = null;

function fetchCandidatesCache() {
  return getCandidatesById().then((byId) => {
    const map = {};
    byId.forEach((data, key) => {
      const name = (data.name || '').trim();
      if (!name) return;
      map[key] = {
        name,
        referredBy: (data.referredBy || data.refereedBy || '').trim(),
        mobile: normalizeCandidateMobile(data.mobile || data.phone),
      };
    });
    globalCandidatesCache = map;
    return map;
  });
}

// HR names for slots that lack them: from the HR index (1 read per page load, shared with the dashboards).
function fetchHrCache() {
  return getHrIndex()
    .then((items) => {
      const map = {};
      items.forEach((h) => {
        map[h.id] = {
          name: (h.name || '').trim(),
          email: (h.email || '').trim(),
          mobile: (h.mobile || '').trim(),
        };
      });
      globalHrCache = map;
      return map;
    })
    .catch((err) => {
      if (err?.code !== 'permission-denied') console.error('Error loading HR cache:', err);
      return {};
    });
}

function mapDocsToEvents(docs, cCache = globalCandidatesCache, hCache = globalHrCache) {
  const allSlots = docs.map((d) => {
    const slot = slotDocToUI(d);
    const id = (slot.candidateId || '').trim();
    const mobileKey = normalizeCandidateMobile(
      slot.candidateMobile || slot.mobile || id,
    );
    const cacheEntry =
      (mobileKey && cCache ? cCache[mobileKey] : null) ||
      (id && cCache ? cCache[id] : null);
    const hrId = (slot.hrId || '').trim();
    const hrEntry = hrId && hCache ? hCache[hrId] : null;

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

  return approvedSlots.map(slotToCalendarEvent);
}

/**
 * Subscribe to approved slots and call callback with calendar events.
 * Emits immediately on first snapshot without waiting for candidates/hrs collections,
 * eliminating the 3-4s blocking delay. Enriches asynchronously if needed.
 */
const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Time + status of every slot in [fromYMD, toYMD), from netlify/functions/public-slots.mjs (events are not
// publicly readable). As [{ id, data() }] so the usual slot parsing applies. fresh skips the 30 s edge cache.
async function fetchPublicSlotDocs(fromYMD, toYMD, fresh = false) {
  const res = await fetch(`/.netlify/functions/public-slots?from=${fromYMD}&to=${toYMD}${fresh ? '&fresh=1' : ''}`);
  if (!res.ok) throw new Error(`Could not load slots (${res.status}).`);
  return (await res.json()).map(({ id, ...d }) => ({ id, data: () => d }));
}

/** Public calendar / candidate calendar: approved slots of the range as "Slot Booked" events, no personal details. */
export function subscribeToPublicSlots(from, toExclusive, callback) {
  let live = true;
  fetchPublicSlotDocs(toYMD(from), toYMD(toExclusive))
    .then((docs) => live && callback(mapDocsToEvents(docs, null, null)))
    .catch((err) => {
      console.error('Error loading slots for calendar:', err);
      if (live) callback([]);
    });
  return () => {
    live = false;
  };
}

/** A candidate's own event docs (raw data with id) → Map(id → full calendar event), approved ones only. */
export function slotOwnEvents(ownSlots) {
  const events = mapDocsToEvents(ownSlots.map(({ id, ...d }) => ({ id, data: () => d })), null, null);
  return new Map(events.map((e) => [e.id, e]));
}

/** Admin calendar: live, with names and contacts (admin-only read in firestore.rules). */
export function subscribeToApprovedSlots(from, toExclusive, callback) {
  // Only the visible week is read (date is a YYYY-MM-DD string). Single-field range = no composite
  // index; non-approved docs in the week are dropped client-side by mapDocsToEvents.
  const slotsRef = query(
    collection(db, SLOTS_COLLECTION),
    where('date', '>=', toYMD(from)),
    where('date', '<', toYMD(toExclusive)),
  );
  let isSubscribed = true;

  const unsubscribe = onSnapshot(
    slotsRef,
    (snapshot) => {
      if (!isSubscribed) return;

      // 1. FAST PATH: Emit events immediately with current doc data and existing cache
      const immediateEvents = mapDocsToEvents(snapshot.docs, globalCandidatesCache, globalHrCache);
      callback(immediateEvents);

      // 2. BACKGROUND PATH: only when some slot lacks a name, load the lists and re-emit enriched events
      const needCandidate = !globalCandidatesCache && snapshot.docs.some((d) => !String(d.data().candidateName || d.data().name || '').trim());
      const needHr = !globalHrCache && snapshot.docs.some((d) => String(d.data().hrId || '').trim() && !String(d.data().hrName || '').trim());
      if (needCandidate || needHr) {
        Promise.all([
          needCandidate ? fetchCandidatesCache() : globalCandidatesCache,
          needHr ? fetchHrCache() : globalHrCache,
        ]).then(([cCache, hCache]) => {
          if (!isSubscribed) return;
          const enrichedEvents = mapDocsToEvents(snapshot.docs, cCache, hCache);
          callback(enrichedEvents);
        });
      }
    },
    (err) => {
      console.error('Error subscribing to slots for calendar:', err);
      callback([]);
    },
  );

  return () => {
    isSubscribed = false;
    unsubscribe();
  };
}

/**
 * Subscribe to a candidate's own slots (any status).
 * Matches candidateId, candidateMobile, and legacy Firestore doc ids.
 */
export function subscribeToCandidateSlots(matchKeys, callback) {
  const keys = [...new Set((matchKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (keys.length === 0) {
    callback([]);
    return () => {};
  }

  const mobile = keys.map(normalizeCandidateMobile).find((m) => /^[6-9]\d{9}$/.test(m)) || '';
  const slotsRef = collection(db, SLOTS_COLLECTION);
  const latestSnaps = {};

  const mergeAndEmit = () => {
    const merged = new Map();
    Object.values(latestSnaps).forEach((snap) => {
      snap.docs.forEach((d) => {
        merged.set(d.id, { id: d.id, ...d.data() });
      });
    });

    const items = [...merged.values()]
      .filter((item) => slotMatchesCandidateKeys(item, keys))
      .sort((a, b) => {
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

    callback(items);
  };

  const unsubs = [];
  const attach = (q, key) => {
    unsubs.push(
      onSnapshot(
        q,
        (snapshot) => {
          latestSnaps[key] = snapshot;
          mergeAndEmit();
        },
        (err) => {
          console.error('Error subscribing to candidate slots:', err);
          callback([]);
        },
      ),
    );
  };

  // Every event carries candidateMobile (scripts/backfill-event-mobiles.mjs; bookings must set it), so one query
  // on mobile is enough. The candidateId query was a second read of the same docs; kept only without a mobile.
  if (mobile) {
    attach(query(slotsRef, where('candidateMobile', '==', mobile)), 'candidateMobile');
  } else if (keys.length <= 10) {
    const q =
      keys.length === 1
        ? query(slotsRef, where('candidateId', '==', keys[0]))
        : query(slotsRef, where('candidateId', 'in', keys));
    attach(q, 'candidateId');
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
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
export function slotDocToUI(docSnapshot) {
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
    candidateMobile:
      normalizeCandidateMobile(data.candidateMobile || data.mobile || '') ||
      (/^[6-9]\d{9}$/.test(normalizeCandidateMobile(data.candidateId))
        ? normalizeCandidateMobile(data.candidateId)
        : ''),
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
    // Every slot that day except rejected ones (time fields only), uncached: this check guards a booking.
    const next = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const docs = await fetchPublicSlotDocs(dateStr.slice(0, 10), toYMD(next), true);

    const result = [];
    docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (String(data.status || '').trim().toLowerCase() === 'rejected') return; // a rejected request frees its time

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
    return true;
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
    forgetSyncedDoc(SLOTS_COLLECTION, slotId);
    return true;
  } catch (error) {
    console.error('Error deleting slot:', error);
    throw error;
  }
}

// --- Admin Leaves (block slot booking on these dates) ---
// Reuse the existing adminLeaves collection so leave days are shared.
const LEAVES_COLLECTION = 'adminLeaves';

// In-memory cache for leaves to eliminate redundant Firestore queries
let globalLeavesCache = null;
let globalLeavesPromise = null;
let lastLeavesFetchTime = 0;
const LEAVES_TTL_MS = 10 * 60 * 1000; // leaves change rarely; admin writes invalidate

/**
 * Get all leave dates from Firestore. Returns array of { id, date } where date is YYYY-MM-DD.
 * Cached in memory to accelerate calendar loads to sub-second speeds.
 */
export async function getLeaves(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && globalLeavesCache && now - lastLeavesFetchTime < LEAVES_TTL_MS) {
    return globalLeavesCache;
  }
  if (globalLeavesPromise) {
    return globalLeavesPromise;
  }

  globalLeavesPromise = (async () => {
    try {
      const ref = collection(db, LEAVES_COLLECTION);
      const snapshot = await getDocs(ref);
      const list = snapshot.docs
        .filter((d) => d.id !== 'slotSettings')
        .map((d) => ({
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
      globalLeavesCache = list;
      lastLeavesFetchTime = Date.now();
      return list;
    } catch (err) {
      console.error('Error loading leaves:', err);
      return globalLeavesCache || [];
    } finally {
      globalLeavesPromise = null;
    }
  })();

  return globalLeavesPromise;
}

/**
 * Add a leave day. dateStr should be YYYY-MM-DD, dateLabel is for display.
 * Prevents adding duplicate leaves on the same date.
 */
export async function addLeave(dateStr, dateLabel) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) {
    throw new Error('Date is required');
  }

  // Check if leave already exists for this date
  const currentLeaves = await getLeaves(true);
  const exists = currentLeaves.some((l) => String(l.date || '').trim() === cleanDate);
  if (exists) {
    throw new Error('Leave for this date already exists.');
  }

  globalLeavesCache = null; // Invalidate cache
  const ref = collection(db, LEAVES_COLLECTION);
  const docRef = await addDoc(ref, {
    date: cleanDate,
    dateLabel: dateLabel || cleanDate,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Delete a leave by Firestore document id.
 */
export async function deleteLeave(id) {
  globalLeavesCache = null; // Invalidate cache
  await deleteDoc(doc(db, LEAVES_COLLECTION, id));
}

/**
 * Update display-only candidateName on events linked to a candidate (by mobile / legacy ids).
 */
export async function syncCandidateDisplayNameOnEvents({
  mobile,
  firestoreId,
  candidateName,
} = {}) {
  const trimmedName = String(candidateName || '').trim();
  const matchKeys = getCandidateMatchKeys({ mobile, id: firestoreId, firestoreId });
  if (!trimmedName || matchKeys.length === 0) return;

  const slotsRef = collection(db, SLOTS_COLLECTION);
  const seen = new Set();
  const updates = [];

  const collectDocs = (snap) => {
    snap.docs.forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      updates.push(
        updateDoc(doc(db, SLOTS_COLLECTION, docSnap.id), {
          candidateName: trimmedName,
          updatedAt: serverTimestamp(),
        }),
      );
    });
  };

  const normalizedMobile = normalizeCandidateMobile(mobile);
  if (normalizedMobile) {
    const mobileSnap = await getDocs(
      query(slotsRef, where('candidateMobile', '==', normalizedMobile)),
    );
    collectDocs(mobileSnap);
  }

  if (matchKeys.length <= 10) {
    const idSnap = await getDocs(
      matchKeys.length === 1
        ? query(slotsRef, where('candidateId', '==', matchKeys[0]))
        : query(slotsRef, where('candidateId', 'in', matchKeys)),
    );
    collectDocs(idSnap);
  }

  await Promise.all(updates);
}

export * from './settingsService';
