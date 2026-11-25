// Public view of interview slots: time + status only, for the public calendar, candidates' calendars and the
// booking availability check. Events themselves are readable only by the admin and the slot's own candidate
// (firestore.rules), so names, mobiles, HR contacts and companies never reach other browsers.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (to exclusive, at most 14 days). Cached at Netlify's edge for 30 s, so
// many visitors share one read of the week; pass &fresh=1 (availability check before booking) to skip the cache.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
const init = () => getApps().length || initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 14;
const iso = (v) => (v?.toDate ? v.toDate().toISOString() : typeof v === 'string' ? v : null);
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// The only fields that leave the server.
export const toPublic = (id, d) => ({
  id,
  date: typeof d.date === 'string' ? d.date : iso(d.date),
  start: iso(d.start),
  end: iso(d.end),
  startHour: num(d.startHour),
  startMinute: num(d.startMinute),
  duration: num(d.duration),
  time: typeof d.time === 'string' ? d.time : null,
  status: String(d.status || ''),
});

export default async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (!YMD.test(from) || !YMD.test(to) || !(days > 0 && days <= MAX_DAYS)) {
    return Response.json({ error: `from/to must be YYYY-MM-DD, 1–${MAX_DAYS} days apart.` }, { status: 400 });
  }
  try {
    init();
    const snap = await getFirestore().collection('events').where('date', '>=', from).where('date', '<', to)
      .select('date', 'start', 'end', 'startHour', 'startMinute', 'duration', 'time', 'status').get();
    const fresh = url.searchParams.has('fresh');
    return Response.json(snap.docs.map((d) => toPublic(d.id, d.data())), {
      headers: fresh
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
};
