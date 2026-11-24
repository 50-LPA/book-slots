// Firestore "Quota exceeded" (free Spark plan: 50,000 reads a day) → one plain message, everywhere.
// Detected from: errors the app catches (friendlyMessage / reportQuota), Firebase SDK logs, console errors/warnings
// (calls whose errors the app only logs), and unhandled promise rejections. Any hit shows <QuotaBanner /> on every page.
import { useEffect, useState } from 'react';
import { onLog } from 'firebase/app';
import { useLocation } from 'react-router-dom';

export const isQuotaError = (e) =>
  e?.code === 'resource-exhausted' || /quota exceeded|resource[_ -]?exhausted|daily database limit/i.test(String(e?.message ?? e ?? ''));

// The free quota resets at midnight Pacific time; shown in the viewer's own time ("1:30 PM" in India).
export function quotaResetAt(now = new Date()) {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value; // "GMT-8" / "GMT-7"
  const hours = -Number(/GMT([+-]\d+)/.exec(offset ?? '')?.[1] ?? -8); // Pacific midnight = 08:00 / 07:00 UTC
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours));
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}
export const quotaResetTime = (now) => quotaResetAt(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const quotaMessage = () =>
  `Daily database limit reached. Data will be available again after ${quotaResetTime()}. Nothing is lost.`;

let hit = false;
const subscribers = new Set();
// Shows the banner when `e` is a quota error. Returns e, so it can wrap a rethrow.
export function reportQuota(e) {
  if (!hit && isQuotaError(e)) {
    hit = true;
    queueMicrotask(() => subscribers.forEach((fn) => fn(true))); // never set state mid-render (errors can be logged during one)
    // The limit is lifted at reset time: hide the banner then, so an open tab doesn't keep showing it.
    setTimeout(() => { hit = false; subscribers.forEach((fn) => fn(false)); }, quotaResetAt() - Date.now() + 60e3);
  }
  return e;
}

// Text for an error shown to the user: the quota message, or the error's own text / fallback.
export function friendlyMessage(e, fallback = 'Something went wrong. Please try again.') {
  if (isQuotaError(reportQuota(e))) return quotaMessage();
  return e?.message || fallback;
}

export function useQuotaHit() {
  const [value, setValue] = useState(hit);
  useEffect(() => {
    subscribers.add(setValue);
    setValue(hit);
    return () => subscribers.delete(setValue);
  }, []);
  return value;
}

// Firebase SDK logs (e.g. a snapshot listener refused for quota) and promise rejections nobody caught.
onLog(({ message, args }) => reportQuota([message, ...(args ?? [])].map(String).join(' ')), { level: 'warn' });
if (typeof window !== 'undefined') window.addEventListener('unhandledrejection', (e) => reportQuota(e.reason));
// Many slot-dashboard calls catch errors and only console.error them; look at those too (logging itself is unchanged).
// ponytail: console wrap, swap for explicit reportQuota() calls in each catch if this ever gets in the way.
for (const level of ['error', 'warn']) {
  const original = console[level];
  console[level] = (...args) => { args.forEach(reportQuota); original.apply(console, args); };
}

// Banner at the top of the admin dashboard once the quota is hit. Candidates never see it (nor the quota wording).
export function QuotaBanner() {
  const show = useQuotaHit();
  const [closed, setClosed] = useState(false);
  const { pathname } = useLocation();
  if (!show || closed || !pathname.startsWith('/admin-dashboard')) return null;
  return (
    <div role="alert" className="sticky top-0 z-[100] flex items-start justify-center gap-2 bg-amber-100 px-3 py-2 text-xs sm:text-sm text-amber-900 shadow print:hidden">
      <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-600" aria-hidden="true" />
      <span className="font-medium">{quotaMessage()}</span>
      <button type="button" onClick={() => setClosed(true)} aria-label="Close" className="ml-1 rounded px-1.5 text-amber-700 hover:bg-amber-200">
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}
