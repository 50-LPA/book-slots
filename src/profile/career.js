// Month math for the career timeline. Dates are "YYYY-MM" strings (what <input type="month"> gives).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const toIdx = (ym) => (/^\d{4}-\d{2}$/.test(ym ?? '') ? Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5)) - 1 : null)
const nowIdx = (d = new Date()) => d.getFullYear() * 12 + d.getMonth()
export const monthLabel = (i) => `${MON[i % 12]} ${Math.floor(i / 12)}`
export const span = (months) =>
  [Math.floor(months / 12) && `${Math.floor(months / 12)}y`, months % 12 && `${months % 12}mo`].filter(Boolean).join(' ') || '0mo'

// Months are counted inclusively: joining Feb and exit Jul = 6 months (Feb..Jul), and a "Present" job counts this month.
// Internally a span is [from, end) where end = the month after the last worked one.

// Companies with a joining date, as month indexes: to = last worked month (for labels), end = to + 1.
// A missing or bad exit (before joining) gives a zero-length job.
const datedJobs = (companies, now) => companies
  .map((c) => {
    const from = toIdx(c.from)
    if (from === null) return null
    const to = c.present ? now : toIdx(c.to)
    return to === null || to < from ? { ...c, from, to: from, end: from } : { ...c, from, to, end: to + 1 }
  })
  .filter(Boolean)

// Months not covered by any job: pass-out → first job, between jobs, and last exit → now when nothing is "Present".
// Exit, joining and pass-out months count as busy: exit Jul, join Sep = 1 month gap (Aug). Overlapping jobs count once.
// Each gap: { from, to } = where it sits on the drawing, { first, last } = the idle months, months, ongoing (still idle today).
export function gaps(passOut, companies = [], now = nowIdx()) {
  const jobs = datedJobs(companies, now).sort((a, b) => a.from - b.from)
  const out = []
  const p = toIdx(passOut)
  let cursor = p === null ? null : p + 1 // first month not yet accounted for
  for (const j of jobs) {
    if (cursor !== null && j.from > cursor) out.push({ from: cursor, to: j.from, first: cursor, last: j.from - 1, months: j.from - cursor, ongoing: false })
    cursor = Math.max(cursor ?? -Infinity, j.end, j.from + 1) // the joining month is busy even without an exit date
  }
  if (cursor !== null && !jobs.some((j) => j.present) && now >= cursor) out.push({ from: cursor, to: now + 1, first: cursor, last: now, months: now - cursor + 1, ongoing: true })
  return out
}

// Total idle months (0 when there's no career data).
export const gapTotal = (passOut, companies) => gaps(passOut, companies).reduce((sum, g) => sum + g.months, 0)

// "Aug 2026" for a one-month gap, "Apr 2023 – Now" while ongoing, else "Jun 2018 – Feb 2019". fmt formats a month index.
export const gapDates = (g, fmt = monthLabel) =>
  g.ongoing ? `${fmt(g.first)} – Now` : g.first === g.last ? fmt(g.first) : `${fmt(g.first)} – ${fmt(g.last)}`

// Turns the form's passOut + companies into positioned pieces (left/width in %) for drawing.
// passOuts = every { type, date } pass-out (each gets a pin); gaps still start at passOut (the latest).
export function layout(passOut, companies = [], now = nowIdx(), passOuts = []) {
  const jobs = datedJobs(companies, now)
  const breaks = gaps(passOut, companies, now)
  const p = toIdx(passOut)
  const pins = (passOuts.length ? passOuts : [{ type: '', date: passOut }])
    .map((x) => ({ type: x.type, at: toIdx(x.date) }))
    .filter((x) => x.at !== null)
    .sort((a, b) => a.at - b.at)
  const points = [p, ...pins.map((x) => x.at), ...jobs.flatMap((j) => [j.from, j.end]), ...breaks.map((g) => g.to)].filter((x) => x !== null)
  if (!points.length) return null
  const start = Math.min(...points)
  const end = Math.max(...points, start + 12) // at least a year wide
  const pct = (i) => ((i - start) / (end - start)) * 100
  const step = end - start > 15 * 12 ? 2 : 1
  const years = []
  for (let y = Math.ceil(start / 12); y * 12 <= end; y += step) years.push({ year: y, left: pct(y * 12) })
  return {
    passOut: p === null ? null : { label: monthLabel(p), left: pct(p) },
    passOuts: pins.map((x) => ({ type: x.type, label: monthLabel(x.at), left: pct(x.at) })),
    jobs: jobs.map((j) => ({ ...j, left: pct(j.from), width: pct(j.end) - pct(j.from), months: j.end - j.from })),
    gaps: breaks.map((g) => ({ ...g, left: pct(g.from), width: pct(g.to) - pct(g.from) })),
    years,
  }
}

// Total months worked across companies (inclusive, overlaps counted once). Jobs without a valid exit (and not Present)
// count nothing. null when no company has a joining date.
export function totalMonths(companies = [], now = nowIdx()) {
  if (!companies.some((c) => toIdx(c.from) !== null)) return null
  const spans = datedJobs(companies, now).filter((j) => j.end > j.from).sort((a, b) => a.from - b.from)
  let total = 0, end = -Infinity
  for (const j of spans) {
    if (j.end <= end) continue
    total += j.end - Math.max(j.from, end)
    end = j.end
  }
  return total
}
