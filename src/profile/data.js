// Candidate records in Firestore, plus one local copy shared by every page.
//
// Fewer reads: the copy is kept in IndexedDB, so a reload or a new session doesn't re-read every record.
// A sync (once per session after login, and on Refresh) fetches only records changed since the last sync,
// plus a count of all records (1 read). Deletes made on another device don't show up as changes, so a count
// that doesn't match the copy triggers one full reload; a full reload also runs once a week as a safety net.
// Cost per sync: 2 reads + 1 per changed record (was: 1 per record, on every page load and every Refresh).
import { useEffect, useState } from 'react'
import {
  Timestamp, addDoc, collection, doc, getCount, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore/lite'
import { db, withTimeout } from './firebase.js'
import { auth } from '../firebase/firebase'
import { confirmAsk, toast } from './toast.jsx'
import { mergeRows } from './list.js'
import { titleCase } from './options.js'

// Admission profile records (collection admissionProfiles); linked to book-slots candidates by `phone` == candidates.mobile.
const candidates = collection(db, 'admissionProfiles')
// One resume per candidate, same id. Kept out of the candidate record so list syncs never download resumes;
// the candidate only carries `hasResume: true` (set on the first save) for the Resumes tab.
const resumes = collection(db, 'resumes')
const KEY = 'admission-profile:candidates'
const FULL_EVERY = 7 * 24 * 60 * 60 * 1000 // full reload at least weekly (ms): deltas + the count check cover the rest

// lastSync = newest updatedAt the server has sent us (server time, so device clocks don't matter).
// Local saves are stamped with the device time and don't move it, so the next sync re-reads them from the server.
let cache = null, lastSync = null, lastFull = 0
let state = { rows: null, refreshing: false, error: '' }
const subscribers = new Set()
const emit = (patch) => { state = { ...state, ...patch }; subscribers.forEach((fn) => fn(state)) }
const publish = (rows) => { cache = rows; persist(); emit({ rows }) }
export const cached = (id) => cache?.find((r) => r.id === id)

// The copy lives in IndexedDB as one JSON string: no ~5 MB cap like localStorage, which signed records outgrow.
// Blocked (private mode) → memory only: everything is re-read once per session.
let idbp
const idb = () => (idbp ??= new Promise((resolve, reject) => {
  const r = indexedDB.open('admission-profile', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('kv')
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error)
}))
const kv = (mode, fn) => idb().then((d) => new Promise((resolve, reject) => {
  const t = d.transaction('kv', mode)
  const req = fn(t.objectStore('kv'))
  t.oncomplete = () => resolve(req.result)
  t.onerror = () => reject(t.error)
}))
// Timestamps are stored as { seconds, nanoseconds } and turned back into Timestamps on load.
const restored = (async () => {
  let json = await kv('readonly', (s) => s.get(KEY)).catch(() => undefined), legacy = false
  if (json == null) try { json = localStorage.getItem(KEY); legacy = json != null; localStorage.removeItem(KEY) } catch { /* none */ }
  try {
    const saved = JSON.parse(json, (_k, v) => (v?.seconds != null && v?.nanoseconds != null ? new Timestamp(v.seconds, v.nanoseconds) : v))
    if (!saved?.rows || cache) return // nothing saved, or a sync already filled the copy
    ;({ lastSync = null, lastFull = 0 } = saved)
    cache = saved.rows.map(named) // copies saved before names were title-cased
    if (legacy) persist() // moved over from localStorage
    emit({ rows: cache })
  } catch { /* unreadable copy: the first sync reloads everything */ }
})()
function persist() {
  kv('readwrite', (s) => s.put(JSON.stringify({ rows: cache, lastSync, lastFull }), KEY)).catch(() => {})
}
export function clearCache() { // on logout: the copy holds candidate details, so it doesn't stay on the device
  cache = lastSync = null; lastFull = 0; firstSync = null; firstDone = false
  resumeCache.clear(); mine.clear()
  state = { rows: null, refreshing: false, error: '' }
  kv('readwrite', (s) => s.delete(KEY)).catch(() => {})
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(DRAFT)).forEach((k) => localStorage.removeItem(k)) // unsaved resume drafts
  } catch { /* nothing stored */ }
}
// Unsaved resume edits are kept on the device under this prefix + candidate id (see ResumeEditor).
export const DRAFT = 'admission-profile:resume-draft:'

// Every record entering the app (server, local copy, single fetch) gets its name in title case, so every screen shows it so.
// Lists and filters read visitDates/companies as arrays: minimal profiles (created by a candidate's first resume save) have neither.
function named(r) { return r && { visitDates: [], companies: [], ...r, name: titleCase(r.name) } }
const toRow = (d) => named({ id: d.id, ...d.data() })
const newest = (rows, since) => rows.reduce((m, r) => (r.updatedAt && (!m || r.updatedAt.valueOf() > m.valueOf()) ? r.updatedAt : m), since)

async function full() {
  const rows = (await withTimeout(getDocs(query(candidates, orderBy('updatedAt', 'desc'))))).docs.map(toRow)
  lastSync = newest(rows, null); lastFull = Date.now()
  resumeCache.clear()
  publish(rows)
}
async function delta() {
  const [snap, count] = await withTimeout(Promise.all([getDocs(query(candidates, where('updatedAt', '>', lastSync))), getCount(candidates)]))
  const changed = snap.docs.map(toRow)
  changed.forEach((r) => resumeCache.delete(r.id)) // changed elsewhere (or by us): its resume may be newer
  const rows = mergeRows(cache, changed) // merged into the current copy, so a save made meanwhile isn't lost
  if (rows.length !== count.data().count) return full() // deleted (or added) somewhere the change list can't show
  lastSync = newest(changed, lastSync)
  if (changed.length) publish(rows); else persist()
}

// One sync at a time; callers share the one in flight.
let running = null
export function sync() {
  running ??= (async () => {
    emit({ refreshing: true })
    try {
      await restored
      await auth.authStateReady() // after a reload, Lite Firestore would otherwise send the first read without the login
      await (cache && lastSync && Date.now() - lastFull < FULL_EVERY ? delta() : full())
      emit({ error: '' })
    } catch (err) {
      emit({ error: err.message })
      throw err
    } finally {
      running = null
      emit({ refreshing: false })
    }
  })()
  return running
}
// The session's first sync: started after login; candidate pages wait for it so they never edit an out-of-date copy.
let firstSync = null
let firstDone = false
export const synced = () => (firstSync ??= sync().catch(() => {}).finally(() => { firstDone = true }))
export const firstSyncDone = () => firstDone

// { rows, error, refreshing, refresh }: rows are null only before the very first load on this device.
export function useCandidates() {
  const [s, setS] = useState(state)
  useEffect(() => {
    subscribers.add(setS)
    setS(state)
    return () => subscribers.delete(setS)
  }, [])
  return { ...s, refresh: () => sync().catch(() => {}) }
}

export const getCandidate = (id) => withTimeout(getDoc(doc(candidates, id))).then((d) => (d.exists() ? named(d.data()) : null))

// Another saved candidate with this phone, or null. Checked in the synced copy (no read); queried only without one.
export async function findByPhone(phone, exceptId) {
  if (cache && firstDone) return cache.find((r) => r.phone === phone && r.id !== exceptId) ?? null
  const snap = await withTimeout(getDocs(query(candidates, where('phone', '==', phone))))
  const other = snap.docs.find((d) => d.id !== exceptId)
  return other ? named({ id: other.id, ...other.data() }) : null
}

// Saves the form. Only form fields are written: the list's `id` and the timestamps are never copied into the record.
// merge keeps createdAt. Resolves the record's id.
export async function saveCandidate(id, form) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = form
  const data = { ...rest, name: titleCase(rest.name) }
  const now = Timestamp.now()
  if (id) {
    await withTimeout(setDoc(doc(candidates, id), { ...data, updatedAt: serverTimestamp() }, { merge: true }))
  } else {
    id = (await withTimeout(addDoc(candidates, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))).id
  }
  if (cache) {
    const old = cached(id)
    publish([{ ...old, ...data, id, createdAt: old?.createdAt ?? now, updatedAt: now }, ...cache.filter((r) => r.id !== id)])
  }
  return id
}

// Asks, deletes, then offers Undo for a few seconds (puts the same record back under the same id).
// Resolves true if deleted.
export async function removeCandidate(id, name) {
  if (!(await confirmAsk({ title: `Delete ${name || 'this candidate'}?`, message: 'The record is removed for good. You can undo for a few seconds after.', ok: 'Delete', danger: true }))) return false
  let row, resume
  try {
    row = cached(id) ?? { ...(await getCandidate(id)), id } // kept for Undo
    resume = row.hasResume ? await getResume(id) : null
    const batch = writeBatch(db)
    batch.delete(doc(candidates, id))
    batch.delete(doc(resumes, id)) // also when hasResume is missing: deleting nothing is fine
    await withTimeout(batch.commit())
    resumeCache.delete(id)
  } catch (err) {
    toast('Could not delete: ' + err.message, { tone: 'error' })
    return false
  }
  if (cache) publish(cache.filter((r) => r.id !== id))
  toast(`Deleted ${name || 'candidate'}.`, {
    action: {
      label: 'Undo',
      run: async () => {
        const { id: _id, ...data } = row
        try {
          const batch = writeBatch(db)
          batch.set(doc(candidates, id), { ...data, createdAt: data.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() })
          if (resume) batch.set(doc(resumes, id), { ...resume, updatedAt: serverTimestamp() })
          await withTimeout(batch.commit())
          if (resume) resumeCache.set(id, resume)
          if (cache) publish(mergeRows(cache, [{ ...row, updatedAt: Timestamp.now() }]))
          toast(`${name || 'Candidate'} restored.`)
        } catch (err) {
          toast('Could not restore: ' + err.message, { tone: 'error' })
        }
      },
    },
  })
  return true
}

// The logged-in candidate's own profile (Admission Profile and My Resume tabs): read once per page load and shared,
// so switching tabs costs no reads. The query must filter on phone: firestore.rules let a candidate read only their own.
const mine = new Map() // phone -> Promise<profile | null>
export function getMine(phone) {
  if (!mine.has(phone)) {
    mine.set(phone, withTimeout(getDocs(query(candidates, where('phone', '==', phone), limit(1))))
      .then((s) => (s.docs[0] ? toRow(s.docs[0]) : null))
      .catch((err) => { mine.delete(phone); throw err }))
  }
  return mine.get(phone)
}
export const rememberMine = (phone, profile) => mine.set(phone, Promise.resolve(profile))

// Resumes read this session, so reopening one (or copying its look, or Undo after delete) costs no read.
// An entry is dropped when a sync brings a change to that candidate.
const resumeCache = new Map()
export async function getResume(id) {
  if (resumeCache.has(id)) return resumeCache.get(id)
  const d = await withTimeout(getDoc(doc(resumes, id)))
  const r = d.exists() ? d.data() : null
  resumeCache.set(id, r)
  return r
}

// Saves a candidate's resume and, in the same write, stamps the candidate (hasResume, resumeAt) so lists show
// the resume status and when it was last saved without reading any resume.
export async function saveResume(id, resume) {
  const { updatedAt: _u, ...data } = resume
  const batch = writeBatch(db)
  batch.set(doc(resumes, id), { ...data, updatedAt: serverTimestamp() })
  batch.set(doc(candidates, id), { hasResume: true, resumeAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
  await withTimeout(batch.commit())
  resumeCache.set(id, { ...data, updatedAt: Timestamp.now() })
  if (cache) publish(cache.map((r) => (r.id === id ? { ...r, hasResume: true, resumeAt: Timestamp.now() } : r)))
}

// Phase button in the list: the pill changes at once, and the phase is written once clicks stop for a moment, so
// rapid clicks make one save. The row keeps its place on screen (cache updatedAt untouched); the DB gets the new time.
const phaseTimers = new Map()
export function setPhase(id, phase) {
  const before = cached(id)
  if (!before) return
  publish(cache.map((r) => (r.id === id ? { ...r, phase } : r)))
  clearTimeout(phaseTimers.get(id)?.timer)
  const was = phaseTimers.get(id)?.was ?? before.phase // phase last saved, for putting back on failure
  phaseTimers.set(id, {
    was,
    timer: setTimeout(async () => {
      phaseTimers.delete(id)
      try {
        await withTimeout(setDoc(doc(candidates, id), { phase, updatedAt: serverTimestamp() }, { merge: true }))
      } catch (err) {
        if (cache) publish(cache.map((r) => (r.id === id ? { ...r, phase: was } : r)))
        toast(`Phase not saved for ${before.name || 'candidate'}: ${err.message}`, { tone: 'error' })
      }
    }, 600),
  })
}
