// Small calendar utility module to help with week/day rendering

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Returns Monday of the week containing the given date
export function getWeekStart(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = (day + 6) % 7; // 0 if Monday, 1 if Tuesday, ...
  return new Date(d.getTime() - diffToMonday * MS_IN_DAY);
}

export function getWeekDays(weekStart, count = 5) {
  const start = startOfDay(weekStart);
  return Array.from({ length: count }, (_, idx) => {
    return new Date(start.getTime() + idx * MS_IN_DAY);
  });
}

/** End of the visible week (start of day after last visible day). Use with eventDate < end for inclusive Friday. */
export function getWeekEndExclusive(weekStart, dayCount = 5) {
  const days = getWeekDays(weekStart, dayCount);
  const lastDay = days[days.length - 1];
  const end = new Date(lastDay.getTime() + MS_IN_DAY);
  return end;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** DD-MMM-YYYY (e.g. 21-Feb-2026) */
function fmtDDMMMYYYY(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = SHORT_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatHeaderToday(date) {
  return fmtDDMMMYYYY(date);
}

export function formatWeekRangeLabel(weekStart, weekEnd) {
  return `${fmtDDMMMYYYY(weekStart)} – ${fmtDDMMMYYYY(weekEnd)}`;
}

export function formatDayHeader(date) {
  const weekday = WEEKDAY_NAMES[date.getDay()];
  return {
    weekday,
    label: `${weekday}, ${fmtDDMMMYYYY(date)}`,
  };
}

export function parseISOToDate(isoString) {
  return new Date(isoString);
}

