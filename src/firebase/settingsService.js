import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_SLOT_SETTINGS = {
  showSaturday: true, // Default: Active / Show
  slotStartTime: '11:00 AM', // Default: 11:00 AM
  slotEndTime: '07:00 PM', // Default: 7:00 PM
  startHour: 11,
  endHour: 19,
  startTime: '11:00',
  endTime: '19:00',
};

export const START_TIME_OPTIONS = [
  { value: 6, label: '06:00 AM', time24: '06:00' },
  { value: 7, label: '07:00 AM', time24: '07:00' },
  { value: 8, label: '08:00 AM', time24: '08:00' },
  { value: 9, label: '09:00 AM', time24: '09:00' },
  { value: 10, label: '10:00 AM', time24: '10:00' },
  { value: 11, label: '11:00 AM', time24: '11:00' },
  { value: 12, label: '12:00 PM', time24: '12:00' },
  { value: 13, label: '01:00 PM', time24: '13:00' },
  { value: 14, label: '02:00 PM', time24: '14:00' },
  { value: 15, label: '03:00 PM', time24: '15:00' },
  { value: 16, label: '04:00 PM', time24: '16:00' },
  { value: 17, label: '05:00 PM', time24: '17:00' },
  { value: 18, label: '06:00 PM', time24: '18:00' },
  { value: 19, label: '07:00 PM', time24: '19:00' },
  { value: 20, label: '08:00 PM', time24: '20:00' },
  { value: 21, label: '09:00 PM', time24: '21:00' },
  { value: 22, label: '10:00 PM', time24: '22:00' },
];

export const END_TIME_OPTIONS = [
  { value: 7, label: '07:00 AM', time24: '07:00' },
  { value: 8, label: '08:00 AM', time24: '08:00' },
  { value: 9, label: '09:00 AM', time24: '09:00' },
  { value: 10, label: '10:00 AM', time24: '10:00' },
  { value: 11, label: '11:00 AM', time24: '11:00' },
  { value: 12, label: '12:00 PM', time24: '12:00' },
  { value: 13, label: '01:00 PM', time24: '13:00' },
  { value: 14, label: '02:00 PM', time24: '14:00' },
  { value: 15, label: '03:00 PM', time24: '15:00' },
  { value: 16, label: '04:00 PM', time24: '16:00' },
  { value: 17, label: '05:00 PM', time24: '17:00' },
  { value: 18, label: '06:00 PM', time24: '18:00' },
  { value: 19, label: '07:00 PM', time24: '19:00' },
  { value: 20, label: '08:00 PM', time24: '20:00' },
  { value: 21, label: '09:00 PM', time24: '21:00' },
  { value: 22, label: '10:00 PM', time24: '22:00' },
  { value: 23, label: '11:00 PM', time24: '23:00' },
];

const SETTINGS_COLLECTION = 'adminLeaves';
const SETTINGS_DOC_ID = 'slotSettings';
const LOCAL_STORAGE_KEY = 'sb_slot_settings';

export function parseHourFromLabel(label) {
  if (!label) return null;
  const trimmed = String(label).trim().toUpperCase();
  const match12 = trimmed.match(/^0?(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const isPM = match12[3] === 'PM';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    return hour;
  }
  const match24 = trimmed.match(/^0?(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10);
  }
  const num = parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num >= 0 && num <= 23) {
    return num;
  }
  return null;
}

export function formatHourToLabel(hour24) {
  const isPM = hour24 >= 12;
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${String(hour12).padStart(2, '0')}:00 ${isPM ? 'PM' : 'AM'}`;
}

export function formatHourTo24(hour24) {
  return `${String(hour24).padStart(2, '0')}:00`;
}

export function normalizeSlotSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SLOT_SETTINGS };

  const showSaturday =
    raw.showSaturday !== undefined ? Boolean(raw.showSaturday) : true;

  let startHour = null;
  if (typeof raw.startHour === 'number' && !Number.isNaN(raw.startHour)) {
    startHour = raw.startHour;
  } else if (raw.slotStartTime) {
    startHour = parseHourFromLabel(raw.slotStartTime);
  } else if (raw.startTime) {
    startHour = parseHourFromLabel(raw.startTime);
  }

  // If slotStartTime was explicitly provided and startHour was not a number
  if (raw.slotStartTime && typeof raw.startHour !== 'number') {
    const parsed = parseHourFromLabel(raw.slotStartTime);
    if (parsed != null && !Number.isNaN(parsed)) {
      startHour = parsed;
    }
  }

  if (
    startHour == null ||
    Number.isNaN(startHour) ||
    startHour < 0 ||
    startHour > 23
  ) {
    startHour = DEFAULT_SLOT_SETTINGS.startHour;
  }

  let endHour = null;
  if (typeof raw.endHour === 'number' && !Number.isNaN(raw.endHour)) {
    endHour = raw.endHour;
  } else if (raw.slotEndTime) {
    endHour = parseHourFromLabel(raw.slotEndTime);
  } else if (raw.endTime) {
    endHour = parseHourFromLabel(raw.endTime);
  }

  // If slotEndTime was explicitly provided and endHour was not a number
  if (raw.slotEndTime && typeof raw.endHour !== 'number') {
    const parsed = parseHourFromLabel(raw.slotEndTime);
    if (parsed != null && !Number.isNaN(parsed)) {
      endHour = parsed;
    }
  }

  if (
    endHour == null ||
    Number.isNaN(endHour) ||
    endHour < 0 ||
    endHour > 23
  ) {
    endHour = DEFAULT_SLOT_SETTINGS.endHour;
  }

  if (endHour <= startHour) {
    endHour = Math.min(23, startHour + 1);
  }

  const slotStartTime = formatHourToLabel(startHour);
  const slotEndTime = formatHourToLabel(endHour);
  const startTime = formatHourTo24(startHour);
  const endTime = formatHourTo24(endHour);

  return {
    showSaturday,
    slotStartTime,
    slotEndTime,
    startHour,
    endHour,
    startTime,
    endTime,
  };
}

export function getStoredSlotSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return normalizeSlotSettings(JSON.parse(raw));
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SLOT_SETTINGS };
}

let activeSettingsCache = getStoredSlotSettings();

export async function fetchSlotSettings() {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const normalized = normalizeSlotSettings(snap.data());
      activeSettingsCache = normalized;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore
      }
      return normalized;
    }
  } catch (err) {
    console.warn('Error fetching slot settings:', err);
  }
  return activeSettingsCache;
}

export function subscribeToSlotSettings(callback) {
  if (typeof callback !== 'function') return () => {};

  // Immediately emit cached settings so UI doesn't delay
  callback(activeSettingsCache);

  const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const normalized = normalizeSlotSettings(snap.data());
        activeSettingsCache = normalized;
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
        } catch {
          // ignore
        }
        callback(normalized);
      } else {
        callback(activeSettingsCache);
      }
    },
    (err) => {
      console.warn('Error in slot settings subscription:', err);
      callback(activeSettingsCache);
    }
  );

  return unsubscribe;
}

export async function saveSlotSettings(newSettings) {
  const normalized = normalizeSlotSettings(newSettings);
  activeSettingsCache = normalized;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore
  }

  const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      showSaturday: normalized.showSaturday,
      slotStartTime: normalized.slotStartTime,
      slotEndTime: normalized.slotEndTime,
      startHour: normalized.startHour,
      endHour: normalized.endHour,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return normalized;
}
