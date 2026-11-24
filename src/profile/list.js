// Candidate list maths: filters, sorting and paging. No React/Firebase, so `node --test` runs it.
import { totalMonths, gapTotal } from './career.js'
import { PHASES, advance, visitsOf } from './options.js'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// "03-NOV-2026" (how visit dates are saved) → 20261103, so dates sort and compare as numbers. null if unreadable.
export function visitNum(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s?.trim() ?? '')
  const mi = m ? MONTHS.indexOf(m[2].toUpperCase()) : -1
  return mi < 0 ? null : +m[3] * 10000 + (mi + 1) * 100 + +m[1]
}
// Latest readable visit date, or '' when there is none.
export const lastVisit = (r) => visitsOf(r).reduce((best, d) => ((visitNum(d) ?? -1) > (visitNum(best) ?? -1) ? d : best), '')

// Experience in months: from company dates when present (live for "Present" jobs), else the typed years/months.
export const expMonths = (r) => totalMonths(r.companies) ?? (Number(r.expYears) || 0) * 12 + (Number(r.expMonths) || 0)
// Total career-gap months, or null when the record has no pass-out / company dates to judge from.
export const gapOf = (r) => (r.passOut || r.companies?.some((c) => c.from) ? gapTotal(r.passOut, r.companies ?? []) : null)
const updatedMs = (r) => r.updatedAt?.toDate?.().getTime() ?? 0

// Local copy + records changed on the server → one list, the changed version winning, newest first.
export function mergeRows(rows, changed) {
  const ids = new Set(changed.map((r) => r.id))
  return [...changed, ...rows.filter((r) => !ids.has(r.id))].sort((a, b) => updatedMs(b) - updatedMs(a))
}

export const EXP_OPTIONS = [['all', 'All Experience'], ['0-2', '0 – 2 yrs'], ['2-5', '2 – 5 yrs'], ['5+', '5+ yrs']]
const EXP = { all: [0, Infinity], '0-2': [0, 2], '2-5': [2, 5], '5+': [5, Infinity] }
export const GAP_OPTIONS = [['none', 'No gap'], ['any', 'Any gap'], ['6', 'Gap > 6 mo'], ['12', 'Gap > 1 yr']]

// Every list filter, with its "show all" value. Kept in the URL (#/candidates?phase=confirmed) so Back keeps them.
export const DEFAULT_FILTERS = { q: '', paid: 'all', tech: '', exp: 'all', ref: '', phase: 'confirmed', gap: '', sort: 'updated', dir: 'desc', page: '1', size: '25' }

export function filterRows(rows, f) {
  const q = f.q.trim().toLowerCase()
  const [lo, hi] = EXP[f.exp] ?? EXP.all
  return rows.filter((r) => {
    const yrs = expMonths(r) / 12
    const gap = gapOf(r)
    return [r.name, r.phone, r.reference].some((v) => v?.toLowerCase().includes(q)) &&
      (f.paid === 'all' || advance(r).status === f.paid) &&
      (!f.tech || r.tech?.includes(f.tech)) &&
      (!f.ref || r.reference?.trim() === f.ref) &&
      (f.phase === 'all' || r.phase === f.phase) &&
      yrs >= lo && yrs < hi &&
      (!f.gap || (f.gap === 'none' ? gap === 0 : f.gap === 'any' ? gap > 0 : gap > Number(f.gap)))
  })
}

// Sortable columns → the value compared. Blank values always go last.
const SORT_VALUE = {
  name: (r) => r.name?.trim().toLowerCase() || null,
  visit: (r) => visitNum(lastVisit(r)),
  exp: (r) => expMonths(r) || null,
  ctc: (r) => Number(r.ctc) || null,
  phase: (r) => PHASES.findIndex(([v]) => v === r.phase),
  advance: (r) => advance(r).paid,
  gap: gapOf,
  updated: updatedMs,
}
export function sortRows(rows, key, dir) {
  const val = SORT_VALUE[key] ?? SORT_VALUE.updated
  const sign = dir === 'asc' ? 1 : -1
  return rows.map((r) => [val(r), r]).sort(([a], [b]) => {
    if (a === b) return 0
    if (a === null || a === undefined) return 1
    if (b === null || b === undefined) return -1
    return (a < b ? -1 : 1) * sign
  }).map(([, r]) => r)
}

// One page of rows plus what the pager shows. A page past the end falls back to the last page.
export function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(Math.max(1, page), pages)
  return { items: rows.slice((p - 1) * size, p * size), page: p, pages, first: rows.length ? (p - 1) * size + 1 : 0, last: Math.min(p * size, rows.length) }
}
