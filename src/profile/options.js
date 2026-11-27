// "rohan  DESHMUKH" → "Rohan Deshmukh". Candidate names are always shown and saved this way.
export const titleCase = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())

// When the candidate's resume was last saved: "17 Nov 2026", or '' when never.
export const resumeSaved = (r) => r.resumeAt?.toDate?.().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) ?? ''

// Order = 7×2 grid on the sheet, filled column by column (first 7 left, rest right).
export const TECH = ['Python', 'JAVA', '.NET', 'Node.JS', 'PHP', 'ReactJS', 'Cyber Security', 'Other', 'Tech Supp', 'BA', 'Data Engg', 'UI/UX', 'DevOps (AWS, GCP, AZURE)', 'Testing (Auto, Manual)']
export const PHASES = [['inquiry', 'Inquiry'], ['confirmed', 'Confirmed']]
// Pass-outs: any number of { type, date: 'YYYY-MM', start? }. `passOut` (career start for the timeline, gaps, resume) is
// the one marked start (if its date is complete), else the latest complete one. A record from before the list had one passOut: it opens as that Graduation.
export const PASS_OUTS = [['hsc', 'HSC'], ['diploma', 'Diploma'], ['graduation', 'Graduation', 'B.E., B.Tech, B.Sc, BCA, BCS, B.Com, BBA, BA'],
  ['postgraduation', 'Post Graduation', 'M.E., M.Tech, M.Sc, MCA, MCS, M.Com, MA'], ['mba', 'MBA'], ['phd', 'PhD']] // [value, label, dropdown hint]
export const passOutLabel = (type) => PASS_OUTS.find(([v]) => v === type)?.[1] ?? ''
const fullDate = (d) => /^\d{4}-\d{2}$/.test(d ?? '')
export const startPassOut = (list) => { const s = list.find((p) => p.start)?.date; return fullDate(s) ? s : list.map((p) => p.date).filter(fullDate).sort().at(-1) ?? '' }
export function withPassOuts(r) {
  const passOuts = Array.isArray(r.passOuts) ? r.passOuts : r.passOut ? [{ type: 'graduation', date: r.passOut }] : []
  return { ...r, passOuts, passOut: startPassOut(passOuts) || (Array.isArray(r.passOuts) ? '' : r.passOut || '') }
}
export const phaseLabel = (r) => PHASES.find(([v]) => v === r.phase)?.[1]
export const PHASE_TONE = { inquiry: 'amber', confirmed: 'green' } // Pill tones
// Visit dates ("03-NOV-2026"), as entered; a cleared box is skipped.
export const visitsOf = (r) => r.visitDates.filter(Boolean)

// Advance payment: the amount paid decides the status.
export const ADVANCE_DUE = 20000
export const ADVANCE_STATUS = [['paid', 'Fully Paid'], ['partial', 'Partially Paid'], ['unpaid', 'Unpaid']]
export function advance(r) {
  const paid = Number(r.advanceAmount) || 0
  const status = paid >= ADVANCE_DUE ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  return { paid, due: Math.max(ADVANCE_DUE - paid, 0), status }
}
