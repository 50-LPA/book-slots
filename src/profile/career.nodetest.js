// Run: npm run test:profile
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapDates, gaps, layout, span, toIdx, totalMonths } from './career.js'

test('places pass-out and companies on one scale', () => {
  const now = toIdx('2024-01')
  const t = layout('2018-06', [
    { name: 'A', from: '2019-01', to: '2021-01' },
    { name: 'B', from: '2022-01', present: true },
  ], now)
  assert.equal(t.passOut.left, 0)
  assert.equal(t.passOut.label, 'Jun 2018')
  const [a, b] = t.jobs
  assert.equal(a.months, 25) // Jan 2019..Jan 2021, both months counted
  assert.equal(b.months, 25) // present → this month
  assert.equal(Math.round(b.left + b.width), 100)
  assert.ok(a.left + a.width < b.left) // gap between jobs stays visible
})

test('skips companies without a joining date, empty input draws nothing', () => {
  assert.equal(layout('', []), null)
  assert.equal(layout('', [{ name: 'X', from: '' }]), null)
})

test('exit before joining is clamped to zero length', () => {
  const t = layout('', [{ name: 'X', from: '2020-05', to: '2019-01' }])
  assert.equal(t.jobs[0].months, 0)
})

test('span formats months', () => {
  assert.equal(span(27), '2y 3mo')
  assert.equal(span(12), '1y')
  assert.equal(span(0), '0mo')
})

test('total experience adds jobs, counts overlaps once, present runs to now', () => {
  const now = toIdx('2024-01')
  assert.equal(totalMonths([{ from: '2017-09', to: '2020-03' }], now), 31)
  assert.equal(totalMonths([{ from: '2026-02', to: '2026-07' }], now), 6) // Feb..Jul
  assert.equal(totalMonths([
    { from: '2017-09', to: '2020-03' }, // 31
    { from: '2020-06', to: '2023-01' }, // 32
    { from: '2023-04', present: true }, // 10 (Apr 2023..Jan 2024)
  ], now), 73)
  assert.equal(totalMonths([{ from: '2019-01', to: '2021-01' }, { from: '2020-01', to: '2022-01' }], now), 37)
  assert.equal(totalMonths([{ from: '2020-05', to: '2019-01' }], now), 0) // bad exit counts nothing
  assert.equal(totalMonths([{ name: 'x', from: '' }], now), null)
})

test('gaps: pass-out → first job, between jobs, after last exit; exit and joining months count as worked', () => {
  const now = toIdx('2026-11')
  const g = (passOut, companies) => gaps(passOut, companies, now).map((x) => [gapDates(x), x.months])
  // the screenshot case: exit Jul, join Sep → only Aug idle; Feb→Feb back to back; pass-out mid-job adds nothing
  assert.deepEqual(g('2024-05', [
    { from: '2021-01', to: '2026-02' }, { from: '2026-02', to: '2026-07' }, { from: '2026-09', present: true },
  ]), [['Aug 2026', 1]])
  assert.deepEqual(g('', [{ from: '2020-01', to: '2020-06' }, { from: '2020-07', to: '2021-01' }]).length, 1) // exit Jun, join Jul: no gap (only the ongoing one after Jan 2021)
  assert.deepEqual(g('2019-06', [{ from: '2020-01', to: '2022-01' }, { from: '2021-06', to: '2023-03' }]), [
    ['Jul 2019 – Dec 2019', 6], // pass-out Jun, joined Jan
    ['Apr 2023 – Now', 44], // not working since Mar 2023 exit
  ])
  assert.deepEqual(g('2026-05', []), [['Jun 2026 – Now', 6]]) // fresher, no job yet
  assert.deepEqual(g('', []), [])
  assert.deepEqual(g('', [{ from: '2024-01', present: true }]), [])
})

test('experience and gaps use the same month rule (screenshot candidate)', () => {
  const now = toIdx('2026-11')
  const jobs = [{ from: '2021-01', to: '2026-02' }, { from: '2026-02', to: '2026-07' }, { from: '2026-09', present: true }]
  assert.equal(totalMonths(jobs, now), 70) // Jan 2021..Jul 2026 = 67, Sep..Nov 2026 = 3 → 5y 10mo
  assert.equal(span(70), '5y 10mo')
  const t = layout('2024-05', jobs, now)
  assert.deepEqual(t.jobs.map((j) => j.months), [62, 6, 3])
  assert.equal(t.gaps[0].months, 1)
})

test('pins every pass-out on the same scale, earliest first; gaps start at the latest', () => {
  const now = toIdx('2024-01')
  const t = layout('2018-06', [{ name: 'A', from: '2019-01', present: true }], now, [
    { type: 'graduation', date: '2018-06' },
    { type: 'hsc', date: '2014-03' },
    { type: 'diploma', date: '2016-' }, // half-filled: no pin
  ])
  assert.deepEqual(t.passOuts.map((p) => [p.type, p.label]), [['hsc', 'Mar 2014'], ['graduation', 'Jun 2018']])
  assert.equal(t.passOuts[0].left, 0) // the scale now starts at HSC
  assert.equal(t.gaps[0].first, toIdx('2018-07'))
})
