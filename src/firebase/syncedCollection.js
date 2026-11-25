// Whole-collection reads (candidates, hrs, events) from a copy kept on the device (IndexedDB).
// First load reads every doc once; after that a sync reads only docs whose `updatedAt` moved past the
// newest one we hold, plus one count read (1 read per 1000 docs) to notice deletions.
// So every write to these collections must set `updatedAt: serverTimestamp()`.
import { Timestamp, collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// ponytail: a delete made on another device shows up as a count mismatch and costs one full reload;
// add tombstones (soft delete) if that ever happens often.
const FULL_EVERY = 7 * 24 * 60 * 60 * 1000; // full reload at least weekly, to heal anything the deltas missed (a daily one costs N reads/day)
const FRESH_FOR = 5 * 60 * 1000; // within a page, reuse the copy this long before asking the server again
const EPOCH = Timestamp.fromMillis(0);

// --- tiny IndexedDB key-value store (missing or blocked → memory only) ---
let idbp;
const idb = () =>
  (idbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('sb-collections', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('c');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
const store = (mode, fn) =>
  idb().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction('c', mode);
        const req = fn(t.objectStore('c'));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
      }),
  );

// Timestamps survive the round trip; anything else non-plain is dropped (these collections hold none).
const pack = (v) => {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object') {
    if (v.constructor !== Object) return null;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pack(x)]));
  }
  return v;
};
const unpack = (v) => {
  if (Array.isArray(v)) return v.map(unpack);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__ts)) return new Timestamp(v.__ts[0], v.__ts[1]);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]));
  }
  return v;
};

const mem = {}; // name -> { rows: Map(id -> data) | null, lastSync, lastFull, checkedAt, running }
const entry = (name) => (mem[name] ??= { rows: null, lastSync: EPOCH, lastFull: 0, checkedAt: 0, running: null });

const newest = (docs, since) =>
  docs.reduce((m, d) => {
    const t = d.data().updatedAt;
    return t instanceof Timestamp && t.toMillis() > m.toMillis() ? t : m;
  }, since);

const persist = (name, m) =>
  store('readwrite', (s) =>
    s.put({ rows: pack([...m.rows]), lastSync: pack(m.lastSync), lastFull: m.lastFull }, name),
  ).catch(() => {});

async function sync(name) {
  const m = entry(name);
  if (!m.rows) {
    const saved = await store('readonly', (s) => s.get(name)).catch(() => undefined);
    if (saved) Object.assign(m, { rows: new Map(unpack(saved.rows)), lastSync: unpack(saved.lastSync), lastFull: saved.lastFull });
  }
  const ref = collection(db, name);
  if (m.rows && Date.now() - m.lastFull < FULL_EVERY) {
    const [changed, count] = await Promise.all([
      getDocs(query(ref, where('updatedAt', '>', m.lastSync))),
      getCountFromServer(ref),
    ]);
    changed.docs.forEach((d) => m.rows.set(d.id, d.data()));
    m.lastSync = newest(changed.docs, m.lastSync);
    if (m.rows.size === count.data().count) {
      if (changed.docs.length) persist(name, m);
      return;
    }
  }
  const all = await getDocs(ref);
  m.rows = new Map(all.docs.map((d) => [d.id, d.data()]));
  m.lastSync = newest(all.docs, EPOCH);
  m.lastFull = Date.now();
  persist(name, m);
}

const asDocs = (m) => [...m.rows].map(([id, data]) => ({ id, data: () => data }));

/**
 * The collection's docs as [{ id, data() }]. `fresh` asks the server now (Reload buttons).
 * If the server can't be reached (offline, quota) the device copy is returned when there is one.
 */
export function getSyncedDocs(name, { fresh = false } = {}) {
  const m = entry(name);
  if (!fresh && m.rows && Date.now() - m.checkedAt < FRESH_FOR) return Promise.resolve(asDocs(m));
  m.running ??= sync(name)
    .then(() => {
      m.checkedAt = Date.now();
    })
    .finally(() => {
      m.running = null;
    });
  return m.running.then(
    () => asDocs(m),
    (err) => {
      if (m.rows) {
        console.warn(`Using the saved copy of ${name}:`, err?.message || err);
        return asDocs(m);
      }
      throw err;
    },
  );
}

/** Drop a doc this device deleted, so the count still matches and no full reload follows. */
export function forgetSyncedDoc(name, id) {
  const m = mem[name];
  if (m?.rows?.delete(id)) persist(name, m);
}

/** On logout: the copies hold other people's details. */
export function clearSyncedCollections() {
  Object.keys(mem).forEach((k) => delete mem[k]);
  return store('readwrite', (s) => s.clear()).catch(() => {});
}
