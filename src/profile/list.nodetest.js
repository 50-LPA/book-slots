// Run: npm run test:profile
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FILTERS, filterRows, gapOf, paginate, lastVisit, mergeRows, sortRows, visitNum } from './list.js'

const rows = [
  { id: 'a', name: 'Asha', visitDates: ['05-OCT-2026', '12-SEP-2026'], phase: 'confirmed', advanceAmount: '20000', ctc: '900000', tech: ['JAVA'],
    passOut: '2019-06', companies: [{ from: '2019-07', to: '2022-03' }, { from: '2022-06', present: true }], updatedAt: { toDate: () => new Date(2026, 9, 1) } },
  { id: 'b', name: 'bharat', visitDates: ['20-NOV-2026'], phase: 'inquiry', advanceAmount: '5000', tech: ['JAVA', 'PHP'], updatedAt: { toDate: () => new Date(2026, 10, 2) } },
  { id: 'c', name: 'Chetan', visitDates: [''], phase: 'inquiry', expYears: '3', advanceAmount: '' }, // cleared date box
]
const f = (over) => ({ ...DEFAULT_FILTERS, ...over })
const ids = (rs) => rs.map((r) => r.id).join('')

test('visit dates read as sortable numbers', () => {
  assert.equal(visitNum('05-OCT-2026'), 20261005)
  assert.equal(visitNum('5-oct-2026'), 20261005)
  assert.equal(visitNum(''), null)
  assert.equal(lastVisit(rows[0]), '05-OCT-2026') // latest, not last entered
  assert.equal(lastVisit(rows[1]), '20-NOV-2026')
  assert.equal(lastVisit(rows[2]), '')
})

test('filters: phase, gap', () => {
  assert.equal(ids(filterRows(rows, f({}))), 'a') // default: Confirmed
  assert.equal(ids(filterRows(rows, f({ phase: 'all' }))), 'abc')
  assert.equal(ids(filterRows(rows, f({ phase: 'inquiry' }))), 'bc')
  assert.equal(ids(filterRows(rows, f({ phase: 'confirmed' }))), 'a')
  assert.equal(gapOf(rows[0]), 2) // Apr–May 2022
  assert.equal(gapOf(rows[1]), null) // no career data
  assert.equal(ids(filterRows(rows, f({ phase: 'all', gap: 'any' }))), 'a')
  assert.equal(ids(filterRows(rows, f({ phase: 'all', gap: '6' }))), '')
  assert.equal(ids(filterRows(rows, f({ phase: 'all', q: 'BHA' }))), 'b')
})

test('sorting puts blanks last in both directions, names ignore case', () => {
  assert.equal(ids(sortRows(rows, 'name', 'asc')), 'abc')
  assert.equal(ids(sortRows(rows, 'name', 'desc')), 'cba')
  assert.equal(ids(sortRows(rows, 'visit', 'asc')), 'abc')
  assert.equal(ids(sortRows(rows, 'visit', 'desc')), 'bac')
  assert.equal(ids(sortRows(rows, 'ctc', 'desc')), 'abc')
  assert.equal(ids(sortRows(rows, 'phase', 'desc')), 'abc')
  assert.equal(ids(sortRows(rows, 'updated', 'desc')), 'bac')
})

test('pagination clamps the page and reports the range', () => {
  const list = Array.from({ length: 53 }, (_, i) => i)
  assert.deepEqual({ ...paginate(list, 3, 25), items: undefined }, { items: undefined, page: 3, pages: 3, first: 51, last: 53 })
  assert.equal(paginate(list, 9, 25).page, 3)
  assert.deepEqual({ ...paginate([], 1, 25), items: undefined }, { items: undefined, page: 1, pages: 1, first: 0, last: 0 })
})


test('sync merge: changed rows replace cached ones, new ones join, newest first', () => {
  const at = (d) => ({ toDate: () => new Date(2026, 10, d) })
  const cache = [{ id: 'x', name: 'old', updatedAt: at(5) }, { id: 'y', updatedAt: at(3) }]
  const merged = mergeRows(cache, [{ id: 'x', name: 'new', updatedAt: at(9) }, { id: 'z', updatedAt: at(4) }])
  assert.equal(ids(merged), 'xzy')
  assert.equal(merged[0].name, 'new')
  assert.equal(mergeRows(cache, []).length, 2)
})

