import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  getCandidateMatchKeys,
  normalizeCandidateMobile,
  slotMatchesCandidateKeys,
} from './candidateIdentity';
import {
  formatDateDDMMYYYY,
  getSlotEndTime,
  slotDocToUI,
} from '../firebase/slotsService';

export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

/**
 * Returns all completed/past interview slots for a given candidate.
 * Excludes rejected slots.
 *
 * @param {Array} slots - List of slot objects (UI format or Firestore format)
 * @param {Object|Array} candidateOrKeys - Candidate object or match keys
 * @returns {Array} completedSlots
 */
export function getCompletedCandidateSlots(slots, candidateOrKeys) {
  if (!Array.isArray(slots) || slots.length === 0 || !candidateOrKeys) {
    return [];
  }

  const matchKeys = Array.isArray(candidateOrKeys)
    ? candidateOrKeys
    : getCandidateMatchKeys(candidateOrKeys);

  const now = Date.now();

  return slots.filter((slot) => {
    if (!slotMatchesCandidateKeys(slot, matchKeys)) {
      return false;
    }

    // Exclude rejected slots
    const status = String(slot.status || '').trim().toLowerCase();
    if (status === 'rejected') {
      return false;
    }

    // Slot must have ended in the past to count as a completed interview
    const endTime = getSlotEndTime(slot);
    if (!endTime || Number.isNaN(endTime.getTime())) {
      return false;
    }

    return endTime.getTime() <= now;
  });
}

/**
 * Returns the most recent completed interview slot for a candidate, or null.
 *
 * @param {Array} slots - List of slot objects
 * @param {Object|Array} candidateOrKeys - Candidate object or match keys
 * @returns {Object|null} The latest completed slot
 */
export function getLastInterviewSlot(slots, candidateOrKeys) {
  const completedSlots = getCompletedCandidateSlots(slots, candidateOrKeys);
  if (completedSlots.length === 0) {
    return null;
  }

  // Sort descending by end time
  const sorted = [...completedSlots].sort((a, b) => {
    const endA = getSlotEndTime(a)?.getTime() || 0;
    const endB = getSlotEndTime(b)?.getTime() || 0;
    return endB - endA;
  });

  return sorted[0] || null;
}

/**
 * Returns detailed info about candidate's last completed interview.
 *
 * @param {Array} slots - List of slot objects
 * @param {Object|Array} candidateOrKeys - Candidate object or match keys
 * @returns {Object|null}
 */
export function getLastInterviewInfo(slots, candidateOrKeys) {
  const lastSlot = getLastInterviewSlot(slots, candidateOrKeys);
  if (!lastSlot) {
    return null;
  }

  const endTime = getSlotEndTime(lastSlot);
  const now = Date.now();
  const timeDiff = endTime ? now - endTime.getTime() : 0;
  const isOlderThanTwoWeeks = timeDiff > TWO_WEEKS_MS;

  const dateLabel =
    lastSlot.dateExactLabel ||
    lastSlot.dateLabel ||
    (lastSlot.date ? formatDateDDMMYYYY(lastSlot.date) : '-');

  return {
    slot: lastSlot,
    endTime,
    date: dateLabel,
    time: lastSlot.timeLabel || '',
    isOlderThanTwoWeeks,
    daysAgo: Math.max(0, Math.floor(timeDiff / (24 * 60 * 60 * 1000))),
  };
}

/**
 * Returns true if the candidate has a completed interview and the last interview
 * took place more than 2 weeks (14 days) ago.
 *
 * @param {Array} slots - List of slot objects
 * @param {Object|Array} candidateOrKeys - Candidate object or match keys
 * @returns {boolean}
 */
export function isCandidateInterviewOlderThanTwoWeeks(slots, candidateOrKeys) {
  const info = getLastInterviewInfo(slots, candidateOrKeys);
  if (!info) {
    return false;
  }
  return Boolean(info.isOlderThanTwoWeeks);
}

/**
 * Returns the effective account status ('Active' or 'Inactive') for a candidate.
 * If the last interview was more than 2 weeks ago or candidate.isActive === false, returns 'Inactive'.
 *
 * @param {Object} candidate - Candidate object (with isActive property)
 * @param {Array} slots - List of slot objects
 * @returns {'Active'|'Inactive'}
 */
export function getCandidateAccountStatus(candidate, slots = []) {
  if (!candidate) return 'Inactive';
  if (candidate.isActive === false || candidate.status === 'Inactive') {
    return 'Inactive';
  }

  if (Array.isArray(slots) && slots.length > 0) {
    if (isCandidateInterviewOlderThanTwoWeeks(slots, candidate)) {
      return 'Inactive';
    }
  }

  return 'Active';
}

/**
 * Fetch candidate slots directly from Firestore events collection.
 *
 * @param {Object} candidateOrSession - Candidate object with id/mobile
 * @param {Object} [firestoreDb] - Firestore instance
 * @returns {Promise<Array>} List of UI slot objects
 */
export async function fetchCandidateEventsFromFirestore(candidateOrSession, firestoreDb) {
  const dbInstance = firestoreDb || db;
  const keys = getCandidateMatchKeys(candidateOrSession);
  if (!keys || keys.length === 0) return [];

  const slotsRef = collection(dbInstance, 'events');
  const results = [];
  const seenIds = new Set();

  // Query by candidateId
  for (const key of keys) {
    try {
      const q = query(slotsRef, where('candidateId', '==', key));
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          results.push(slotDocToUI(docSnap));
        }
      });
    } catch {
      // ignore
    }
  }

  // Query by candidateMobile
  const mobile = normalizeCandidateMobile(
    candidateOrSession?.mobile || candidateOrSession?.phone || keys[0],
  );
  if (mobile) {
    try {
      const qMobile = query(slotsRef, where('candidateMobile', '==', mobile));
      const snapMobile = await getDocs(qMobile);
      snapMobile.forEach((docSnap) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          results.push(slotDocToUI(docSnap));
        }
      });
    } catch {
      // ignore
    }
  }

  return results;
}

/**
 * Checks if candidate's last interview was > 2 weeks ago, and if so,
 * automatically deactivates their account in Firestore if not already inactive.
 *
 * @param {Object} candidate - Candidate object or doc data
 * @param {Object} [firestoreDb] - Firestore instance
 * @param {Array} [optionalSlots] - Pre-fetched slots, or null to fetch from Firestore
 * @returns {Promise<{ isInactive: boolean, lastInterview: Object|null }>}
 */
export async function checkAndSyncCandidateInactivity(candidate, firestoreDb, optionalSlots = null) {
  const dbInstance = firestoreDb || db;
  const slots =
    optionalSlots || (await fetchCandidateEventsFromFirestore(candidate, dbInstance));
  const isOlder = isCandidateInterviewOlderThanTwoWeeks(slots, candidate);
  const lastInterview = getLastInterviewInfo(slots, candidate);

  if (isOlder) {
    const docId = candidate.firestoreId || candidate.id;
    const collectionName = candidate.sourceCollection || 'candidates';
    if (docId && candidate.isActive !== false) {
      try {
        await updateDoc(doc(dbInstance, collectionName, docId), { isActive: false });
      } catch (err) {
        console.error('Failed to auto-deactivate candidate in Firestore:', err);
      }
    }
    return {
      isInactive: true,
      lastInterview,
    };
  }

  const isInactive = candidate.isActive === false;
  return {
    isInactive,
    lastInterview,
  };
}
