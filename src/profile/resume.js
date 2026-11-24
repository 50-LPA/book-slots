// Resume content: defaults, profile → resume mapping, and the HTML blocks the preview paginates.
// No React/Firebase, so `node --test` runs it. Ported from the standalone resume-builder.
import { monthLabel, toIdx, totalMonths } from './career.js'
import { TECH, titleCase } from './options.js'
// Suggestion data (technology profiles, skill sets, ready lines, cities, degrees…) lives in resumeData.js.
import {
  ACHIEVEMENTS, BACKEND_TECH, BOARD, CONTRIBUTIONS, DEFAULT_SKILLS, DEGREES, DESIGNATIONS, FRONTEND_TECH, INSTITUTES, RESPONSIBILITIES,
  SCHOOL, SKILL_SETS, SUMMARY_LINES, TECH_PROFILES, READY_PROJECTS, PROJECT_COMPANY, PROJECT_TECH, PROJECT_ROLE_TEXT,
} from './resumeData.js'

export const TEMPLATES = { classic: 'Classic', minimal: 'Minimal', modern: 'Modern', executive: 'Executive' }
export const COLORS = { '#0369a1': 'Ocean', '#0d9488': 'Teal', '#059669': 'Emerald', '#4f46e5': 'Indigo', '#7c3aed': 'Violet', '#e11d48': 'Rose', '#475569': 'Slate' }
export const FONTS = { '': 'Template font', Lato: 'Lato', Poppins: 'Poppins' } // '' = the template's own font

export * from './resumeData.js' // the editor imports everything resume-related from here

// Stack picker: exactly the candidate profile's technologies that have skills mapped (all but "Other"), in the profile's order.
export const STACK_OPTIONS = TECH.filter((t) => TECH_PROFILES[t])
const profilesOf = (tech = []) => tech.map((t) => TECH_PROFILES[t]).filter(Boolean)

// Repeatable sections. Field: { k, label, type, ph, list, insert, fill }
//   type: 'ta' textarea | 'full' wide input | 'month' month+year | 'to' month+year or Present | 'score' number + unit | '' half input
//   list: suggestions (datalist) · insert: lines a picker appends to a textarea · fill(value, item): extra fields set when this one changes
export const LISTS = {
  skills: { title: 'Skills', one: 'skill group', fields: [
    { k: 'cat', label: 'Category', ph: 'Backend', list: Object.keys(SKILL_SETS),
      fill: (v, item) => (!item.items?.trim() && SKILL_SETS[v] ? { items: SKILL_SETS[v][0] } : {}) },
    { k: 'items', label: 'Skills', ph: 'Python, Django, FastAPI', list: (item) => SKILL_SETS[item.cat] ?? [] },
  ] },
  experience: { title: 'Experience', one: 'job', fields: [
    { k: 'company', label: 'Company', type: 'full', ph: 'Northwind Systems Pvt. Ltd.', list: 'companies' },
    { k: 'role', label: 'Role', type: 'full', ph: 'Sr. Software Engineer', list: DESIGNATIONS },
    { k: 'start', label: 'From', type: 'month' },
    { k: 'end', label: 'To', type: 'to' },
    { k: 'bullets', label: 'Responsibilities (one per line)', type: 'ta', ph: 'Developed new projects from scratch.\nLed API development using Django and FastAPI.', insert: RESPONSIBILITIES },
  ] },
  projects: { title: 'Projects', one: 'project', fields: [
    { k: 'name', label: 'Project name', ph: 'HealthOne' },
    { k: 'company', label: 'Company', ph: 'Northwind Systems', list: 'companies' },
    { k: 'start', label: 'From', type: 'month' },
    { k: 'end', label: 'To', type: 'to' },
    { k: 'stack', label: 'Tech & details — one "Key: value" per line', type: 'ta', ph: 'Frontend: React.js\nBackend: Python, Django\nDatabase: MySQL\nTeam Size: 5', insert: 'keys' },
    { k: 'bullets', label: 'Contribution (one per line)', type: 'ta', ph: 'Built REST APIs and authentication.\nImplemented appointment workflows.', insert: CONTRIBUTIONS },
  ] },
  education: { title: 'Education', one: 'qualification', fields: [
    { k: 'degree', label: 'Degree / Class', ph: 'B.Sc. (CS)', list: DEGREES,
      fill: (v, item) => (!item.institute?.trim() && SCHOOL.includes(v) ? { institute: BOARD } : {}) },
    { k: 'institute', label: 'University / Board', ph: 'SPPU University', list: INSTITUTES },
    { k: 'year', label: 'Passing year', type: 'month' },
    { k: 'score', label: 'CGPA / %', type: 'score' },
  ] },
}
// Single-line point lists. `min` rows always shown; `required` rows must be filled before download.
export const POINTS = {
  summary: { min: 3, required: 3, label: 'Point', list: SUMMARY_LINES },
  achievements: { min: 1, required: 0, label: 'Achievement', list: ACHIEVEMENTS },
}
// Resume sections, in their default order. Each resume can reorder or hide them (sectionOrder, hiddenSections).
export const SECTIONS = { summary: 'Summary', skills: 'Skills', experience: 'Experience', projects: 'Projects', education: 'Education',
  achievements: 'Achievements', about: 'About Myself', personal: 'Personal Details' }
export const SIDEBAR_TEMPLATES = ['modern', 'executive'] // two-column: these sections go in the side column
export const SIDE_SECTIONS = ['skills', 'education', 'about', 'personal']

const BLANK = {
  template: 'classic', accent: '#0369a1', font: '',
  name: '', designation: '', phone: '', email: '',
  summary: ['', '', ''], skills: [], experience: [], projects: [], education: [], achievements: [''],
  // Defaults for a new resume; editable like any other field.
  hobbies: 'Reading, Coding, Exploring Technology, Traveling, Singing',
  strengths: 'Self-motivated, Good Communication Skills, Problem-Solving, Adaptability',
  dob: '', languages: 'English, Hindi, Marathi', marital: '', hometown: '', location: '',
  sectionOrder: Object.keys(SECTIONS), hiddenSections: [],
}

/* ---------- value formats (resume fields stay plain text, so old resumes keep working) ---------- */
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "Jan 2024" → { m: 'Jan', y: '2024' }, "2024" → { m: '', y: '2024' }, "Present" → { present: true }; anything else → null.
export function parseMonthYear(v = '') {
  v = v.trim()
  if (!v) return { m: '', y: '' }
  if (/^present$/i.test(v)) return { m: '', y: '', present: true }
  const r = /^(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{4})$/.exec(v)
  const m = r?.[1] && MON.find((x) => x.toLowerCase() === r[1].toLowerCase())
  return r && (m || !r[1]) ? { m: m || '', y: r[2] } : null
}
export const formatMonthYear = (m, y) => (y ? (m ? `${m} ${y}` : y) : '')
// "7.8 CGPA" / "72%" / "72 %" → { n, unit }; unknown → null.
export function parseScore(v = '') {
  const r = /^\s*([\d.]*)\s*(%|cgpa)?\s*$/i.exec(v)
  return r ? { n: r[1], unit: r[2] ? (r[2] === '%' ? '%' : 'CGPA') : '' } : null
}
export const formatScore = (n, unit) => (n ? (unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n) : '')
// Date of birth: "2002-10-26" (date picker) ↔ "26th Oct 2002" (as printed).
const ordinal = (d) => d + (d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th')
export const formatDob = (iso) => {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return r ? `${ordinal(+r[3])} ${MON[+r[2] - 1]} ${r[1]}` : ''
}
export const dobIso = (s) => {
  const r = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s?.trim() ?? '')
  const mi = r ? MON.findIndex((x) => x.toLowerCase() === r[2].toLowerCase()) : -1
  return mi < 0 ? '' : `${r[3]}-${String(mi + 1).padStart(2, '0')}-${r[1].padStart(2, '0')}`
}
// Comma list helpers for chips: "Reading, Coding" ↔ ['Reading', 'Coding'].
export const splitList = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
export const toggleInList = (s, item) => {
  const l = splitList(s)
  return (l.some((x) => same(x, item)) ? l.filter((x) => !same(x, item)) : [...l, item]).join(', ')
}
// Email ideas from the name: "Rohan Deshmukh" → rohan.deshmukh@gmail.com, rohandeshmukh@gmail.com, …
export function emailIdeas(name) {
  const w = String(name ?? '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  if (!w.length) return []
  const first = w[0], last = w[w.length - 1]
  const users = [...new Set(w.length > 1 ? [`${first}.${last}`, `${first}${last}`, `${first}_${last}`, `${first[0]}${last}`] : [first])]
  return ['gmail.com', 'outlook.com', 'yahoo.com'].flatMap((d) => users.map((u) => `${u}@${d}`))
}
// "5 years 4 months" from a month count.
export const expText = (m) => [Math.floor(m / 12) && `${Math.floor(m / 12)} year${m >= 24 ? 's' : ''}`, m % 12 && `${m % 12} month${m % 12 > 1 ? 's' : ''}`].filter(Boolean).join(' ')
// Python → "Python Developer"; a backend technology with ReactJS → "Full Stack Python Developer".
export function designationFor(tech = []) {
  const back = tech.find((t) => BACKEND_TECH.includes(t))
  if (back && tech.some((t) => FRONTEND_TECH.includes(t))) return `Full Stack ${TECH_PROFILES[back].role}`
  return profilesOf(tech)[0]?.role ?? ''
}
// Skill groups for the profile's technologies, merged; plus the standard groups for coding roles (or no known technology).
export function techSkills(tech = []) {
  const ps = profilesOf(tech)
  const out = []
  const groups = [...ps.flatMap((p) => p.skills), ...(!ps.length || ps.some((p) => p.dev !== false) ? DEFAULT_SKILLS : [])]
  for (const { cat, items } of groups) {
    const have = out.find((o) => same(o.cat, cat))
    if (!have) out.push({ cat, items })
    else have.items = [...new Set([...splitList(have.items), ...splitList(items)])].join(', ')
  }
  return out
}
export const techSummary = (tech) => profilesOf(tech).map((p) => p.summary)
export const techDuties = (tech) => profilesOf(tech).flatMap((p) => p.duties)
// Suggestions for a skill category: what the candidate's technologies use first, then the general sets.
export const skillIdeas = (cat, tech) => [...techSkills(tech).filter((s) => same(s.cat, cat)).map((s) => s.items), ...(SKILL_SETS[cat] ?? [])]
// Every category worth offering for this candidate: theirs first, then the general ones.
export const skillCategories = (tech) => [...new Set([...techSkills(tech).map((s) => s.cat), ...Object.keys(SKILL_SETS)])]
// Ready summary point from the profile: "Python Developer with 5 years 4 months of experience."
export const experienceLine = (designation, months) => (months ? `${designation || 'Software professional'} with ${expText(months)} of experience.` : '')

// Adds a line to the end of a multi-line text.
export const appendLine = (text, line) => (String(text ?? '').trim() ? String(text).replace(/\s*$/, '\n') : '') + line
// Project detail line, filled from the resume's own skills where it can: "Database: MySQL 8+, PostgreSQL".
const STACK_FROM_SKILLS = {
  Frontend: ['Frontend', 'Design'], Backend: ['Backend', 'Frameworks'], Database: ['Databases', 'Data Warehouse'], ORM: ['ORM'], Cache: ['Cache & Queues'], APIs: ['APIs & Security'],
  DevOps: ['DevOps', 'Containers', 'CI/CD'], 'Unit Testing': ['Unit Testing'], 'API Testing': ['API Testing'], 'Version Control': ['Version Control'],
  'Data Processing': ['Data & Analytics'], Architecture: ['Architectures'], 'Ticketing Tool': ['Project Mgmt'],
}
const FIRST_ONLY = ['Architecture', 'Ticketing Tool'] // one value reads better: "Architecture: Monolithic"
export function stackLine(key, d) {
  const skill = (cat) => d.skills.find((s) => same(s.cat, cat))?.items?.trim() ?? ''
  let v = key === 'Role' ? d.designation
    : key === 'Cloud' ? skill('Cloud') || ['AWS', 'Microsoft Azure', 'GCP'].filter((c) => skill(c)).join(', ')
    : (STACK_FROM_SKILLS[key] ?? []).map(skill).filter(Boolean).join(', ')
  if (FIRST_ONLY.includes(key)) v = splitList(v)[0] ?? ''
  return `${key}: ${v ?? ''}`.trimEnd() + (v ? '' : ' ')
}

const ym = (v) => (toIdx(v) === null ? '' : monthLabel(toIdx(v))) // "2024-01" → "Jan 2024"
const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

// The resume's technology stack (`tech`): any of the profile's technologies, in the profile's order. Defaults to the candidate's.
const ordered = (tech = []) => STACK_OPTIONS.filter((t) => tech.includes(t))
export const profileTech = (c) => ordered(c.tech)
// Resumes saved with the earlier primary/secondary picker keep their choice.
export const stackOf = (r) => ordered(r.tech ?? [r.primary, ...(r.secondary ?? [])])

// Standard Adysun Ventures projects written for a stack (resumeData.js READY_PROJECTS). The stack's first backend technology
// leads (else Data Engg, ReactJS, then the rest); a backend with ReactJS gets React on the Frontend line.
// dates: { start, end } for every project (the candidate's Adysun job), '' when unknown.
const projectTech = (tech) => BACKEND_TECH.find((t) => tech.includes(t)) ?? ['Data Engg', 'ReactJS', ...Object.keys(PROJECT_ROLE_TEXT)].find((t) => tech.includes(t))
export function readyProjects(tech = [], dates = {}) {
  const t = projectTech(tech)
  if (!t) return []
  const x = PROJECT_TECH[t]
  return READY_PROJECTS.filter((p) => (p.only ? p.only.includes(t) : t !== 'Data Engg' || p.de)).map((p) => {
    let lines, bullets
    if (t === 'Data Engg') ({ stack: lines, bullets } = p.de)
    else if (x) {
      const fw = p.arch === 'Microservices' || p.python?.backend.includes('FastAPI') ? x.fast : x.fw // API-first projects
      const db = x.db || p.python?.db || 'PostgreSQL'
      const py = t === 'Python' ? p.python : null
      const front = tech.includes('ReactJS') ? 'React.js, Tailwind CSS' : x.front
      lines = [p.platform && `Platform: ${p.platform}`, `Frontend: ${front}`, `Backend: ${py ? py.backend : `${x.lang}, ${fw}${x.extra ? `, ${x.extra}` : ''}`}`,
        `Database: ${db}`, py?.data && `Data Processing: ${py.data}`, `Architecture: ${p.arch}`, 'Cache: Redis', `Auth: ${x.auth}`,
        `Cloud: ${p.cloud ?? x.cloud}`, `DevOps: ${x.devops}`, `Unit Testing: ${x.test}`, 'Version Control: GitHub'].filter(Boolean).join('\n')
      bullets = py ? py.bullets : [`Developed ${p.area} backend services using ${x.lang} and ${fw}.`, `Implemented ${p.features}.`,
        `Built ${fw} APIs, authentication, and ${db.split(',')[0]} operations.`]
    } else {
      const text = PROJECT_ROLE_TEXT[t]
      lines = text.stack
      bullets = text.bullets.map((b) => b.replace('{area}', p.area).replace('{features}', p.features))
    }
    const tail = `Client: ${p.client}\nTicketing Tool: Jira\nTeam Size: ${p.team}\nRole: ${TECH_PROFILES[t].role}\nDomain: ${p.domain}`
    return { name: p.name, company: PROJECT_COMPANY, start: dates.start ?? '', end: dates.end ?? '', stack: `${lines}\n${tail}`, bullets: bullets.join('\n') }
  })
}
// The candidate's job at Adysun Ventures (projects' dates), from the resume's experience.
export const adysunDates = (r) => {
  const job = (r.experience ?? []).find((e) => /adysun/i.test(e.company ?? ''))
  return job ? { start: job.start ?? '', end: job.end ?? '' } : {}
}

// Switches the stack. Generated content follows; anything written or edited by hand stays:
// - skill groups still exactly as generated for the old stack are replaced by the new stack's; edited/custom groups stay in place
// - designation and the latest job's role change only while they still match the old stack's designation (or are empty)
// - standard projects still exactly as generated for the old stack are rewritten for the new one (company and dates kept);
//   a resume without projects gets the new stack's set
// - summary: expertise lines of removed technologies go, lines of added ones come after the experience line,
//   and the experience line follows the designation. `months` = experience for that line.
export function applyStack(r, tech, months = 0) {
  const oldT = stackOf(r)
  const { primary: _p, secondary: _s, ...base } = r
  const next = { ...base, tech: ordered(tech) }
  const newT = stackOf(next)
  const oldGen = techSkills(oldT), newGen = techSkills(newT)
  const untouched = (s) => oldGen.some((o) => same(o.cat, s.cat) && o.items === s.items)
  const kept = r.skills.filter((s) => !untouched(s))
  next.skills = [...newGen.map((n) => kept.find((k) => same(k.cat, n.cat)) ?? n), ...kept.filter((k) => !newGen.some((n) => same(n.cat, k.cat)))]
  const oldD = designationFor(oldT), newD = designationFor(newT)
  if (!r.designation || r.designation === oldD) next.designation = newD
  next.experience = r.experience.map((e, i) => (i === 0 && (!e.role || e.role === oldD) ? { ...e, role: next.designation } : e))
  const oldExp = experienceLine(r.designation, months), newExp = experienceLine(next.designation, months)
  const gone = techSummary(oldT.filter((t) => !newT.includes(t))), added = techSummary(newT.filter((t) => !oldT.includes(t)))
  const rest = r.summary.filter((l) => !gone.includes(l)).map((l) => (oldExp && l === oldExp ? newExp : l))
  const at = rest.includes(newExp) && newExp ? rest.indexOf(newExp) + 1 : 0
  next.summary = [...rest.slice(0, at), ...added.filter((l) => !rest.includes(l)), ...rest.slice(at)]
  const newP = readyProjects(newT)
  if (!newP.length) return next // no technology picked (yet): projects stay as they are
  // Untouched = exactly as generated for the old stack or any single technology (dates and company may differ).
  const gen = [oldT, ...STACK_OPTIONS.map((t) => [t])].flatMap((t) => readyProjects(t))
  const generated = (p) => gen.some((g) => same(g.name, p.name) && g.stack === p.stack && g.bullets === p.bullets)
  next.projects = !r.projects?.length
    ? readyProjects(newT, adysunDates(r))
    : r.projects.flatMap((p) => {
      if (!generated(p)) return [p] // written or edited by hand
      const n = newP.find((g) => same(g.name, p.name))
      return n ? [{ ...n, company: p.company, start: p.start, end: p.end }] : [] // not part of the new stack's set
    })
  return next
}

// Copies name, phone, companies and pass-out from a candidate into a resume, and adds skill groups for the resume's stack
// that it doesn't have yet; everything else is kept.
// Jobs follow the profile (newest first) but keep the role/bullets already written for the same company;
// jobs added only in the resume stay after them. Education gets the pass-out year only when it has no entries.
// An empty designation is set from the technologies.
// c.syncStack (the candidate's own My Resume): their login record also sets the email and the technology stack.
export function pullProfile(r0, c) {
  const newStack = c.syncStack && c.tech?.length ? ordered(c.tech) : null
  const r = newStack && newStack.join() !== stackOf(r0).join() ? applyStack(r0, newStack, totalMonths(c.companies ?? []) ?? 0) : r0
  const old = r.experience ?? []
  const jobs = (c.companies ?? []).filter((j) => j.name?.trim())
    .sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))
    .map((j) => ({ ...old.find((e) => same(e.company, j.name)), company: j.name.trim(), start: ym(j.from), end: j.present ? 'Present' : ym(j.to) }))
  const skills = r.skills ?? []
  return {
    ...r,
    name: titleCase(c.name || r.name),
    phone: c.phone || r.phone,
    email: c.email || r.email,
    designation: r.designation || designationFor(stackOf(r)),
    experience: [...jobs, ...old.filter((e) => !jobs.some((j) => same(j.company, e.company)))],
    skills: [...skills, ...techSkills(stackOf(r)).filter((t) => !skills.some((s) => same(s.cat, t.cat)))], // missing groups only; edits stay
    education: r.education?.length || !ym(c.passOut) ? r.education : [{ degree: '', institute: '', year: ym(c.passOut), score: '' }],
  }
}
// New resume: profile details, technical skill groups and summary for the technologies, and the latest job's role.
export function fromProfile(c) {
  const r = pullProfile({ ...structuredClone(BLANK), tech: profileTech(c) }, c)
  if (r.experience[0] && !r.experience[0].role) r.experience[0].role = r.designation
  const exp = experienceLine(r.designation, totalMonths(c.companies ?? []))
  r.summary = [exp, ...techSummary(stackOf(r)), ...SUMMARY_LINES].filter(Boolean).slice(0, 5)
  r.projects = readyProjects(stackOf(r), adysunDates(r))
  return r
}
// Saved resume with any missing field filled in, and a colour from an older palette replaced.
export function normalize({ updatedAt: _u, ...r }) {
  const d = { ...structuredClone(BLANK), ...r }
  if (!COLORS[d.accent]) d.accent = BLANK.accent
  for (const [k, { min }] of Object.entries(POINTS)) while (d[k].length < min) d[k].push('')
  d.sectionOrder = [...d.sectionOrder.filter((k) => SECTIONS[k]), ...Object.keys(SECTIONS).filter((k) => !d.sectionOrder.includes(k))]
  return d
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
const join = (arr, sep) => arr.map((x) => String(x ?? '').trim()).filter(Boolean).map(esc).join(sep)
export const filledSummary = (d) => d.summary.filter((x) => x.trim()).length

// Content as an ordered list of sections, each split into blocks. Pagination never splits a block.
export function sections(d) {
  const bullets = (arr) => { const l = arr.map((x) => x.trim()).filter(Boolean); return l.length ? `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '' }
  const kv = (k, v) => (v ? `<div class="kv"><b>${esc(k)}:</b> ${esc(v)}</div>` : '')
  const dates = (a, b) => join([a, b], ' – ')
  // An item becomes several blocks so pages can break between bullets; the head stays with its first bullet.
  const item = (head, text) => {
    const [first, ...rest] = lines(text).map((x) => `<ul><li>${esc(x)}</li></ul>`)
    const blocks = [head + (first || ''), ...rest]
    blocks[blocks.length - 1] = `<div class="iend">${blocks[blocks.length - 1]}</div>`
    return blocks
  }
  // Two-column grids are split into one block per row, so a page break can fall between rows.
  const rows = (cells) => cells.filter(Boolean).reduce((out, c, i) => (i % 2 ? out[out.length - 1].push(c) : out.push([c]), out), [])
    .map((r) => `<div class="cols2">${r.join('')}</div>`)
  const skills = d.skills.filter((s) => s.cat || s.items).map((s) => kv(s.cat || 'Skills', s.items || ' '))
  const edu = d.education.filter((e) => e.degree || e.institute).map((e) => `<div class="item">
      <div class="row"><strong>${esc(e.degree)}</strong><span class="meta">${join([e.year, e.score], ' · ')}</span></div>
      <div class="sub">${esc(e.institute)}</div></div>`)
  const personal = [kv('Date of Birth', d.dob), kv('Languages', d.languages), kv('Marital Status', d.marital), kv('Hometown', d.hometown), kv('Location', d.location)]
  return [
    ['summary', '', [bullets(d.summary)]], // no heading: summary follows the header directly
    ['skills', 'Skills', rows(skills)],
    ['experience', 'Experience', d.experience.filter((e) => e.company || e.role).flatMap((e) => item(
      `<div class="row"><span><strong>${esc(e.role)}</strong>${e.role && e.company ? ' | ' : ''}${esc(e.company)}</span><span class="meta">${dates(e.start, e.end)}</span></div>`, e.bullets))],
    ['projects', 'Projects', d.projects.filter((p) => p.name).flatMap((p) => {
      const stack = lines(p.stack).map((l) => { const i = l.indexOf(':'); return i > 0 ? `<b>${esc(l.slice(0, i))}:</b>${esc(l.slice(i + 1))}` : esc(l) }).join(' | ')
      return item(`<div class="row"><strong>${esc(p.name)}</strong><span class="meta">${join([p.company, dates(p.start, p.end)], ' | ')}</span></div>
      ${stack ? `<div class="stack kv">${stack}</div>` : ''}`, p.bullets)
    })],
    ['education', 'Education', rows(edu)],
    ['achievements', 'Achievements', [bullets(d.achievements)]],
    ['about', 'About Myself', [kv('Hobbies', d.hobbies) + kv('Strengths', d.strengths)]],
    ['personal', 'Personal Details', rows(personal)],
  ].map(([id, title, blocks]) => ({ id, title, blocks: blocks.filter(Boolean) }))
    .filter((s) => s.blocks.length && !d.hiddenSections?.includes(s.id))
    .sort((a, b) => (d.sectionOrder ?? []).indexOf(a.id) - (d.sectionOrder ?? []).indexOf(b.id))
}

export const headerHTML = (d) => `<header><div class="hd"><div><h1>${esc(titleCase(d.name))}</h1><div class="desig">${esc(d.designation)}</div></div>
  <div class="contact">${[d.phone, d.email].filter(Boolean).map((c) => `<div>${esc(c)}</div>`).join('')}</div></div></header>`

/* ---------- editor helpers ---------- */
// Moves item i one place up (-1) or down (+1); out-of-range moves change nothing.
export function moveItem(arr, i, dir) {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const out = [...arr]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

// What "Pull from profile" would change, as readable lines (empty = nothing to change).
export function pullChanges(before, after) {
  const out = []
  const stack = (r) => stackOf(r).join(', ')
  if (stack(before) !== stack(after)) out.push(`Technology stack: “${stack(before) || '—'}” → “${stack(after) || '—'}”`)
  for (const [k, label] of [['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['designation', 'Designation']])
    if ((before[k] ?? '') !== (after[k] ?? '')) out.push(`${label}: “${before[k] || '—'}” → “${after[k] || '—'}”`)
  const dates = (e) => [e.start, e.end].filter(Boolean).join(' – ') || 'no dates'
  for (const e of after.experience) {
    const old = before.experience.find((b) => same(b.company, e.company))
    if (!old) out.push(`Add job: ${e.company} (${dates(e)})`)
    else if (dates(old) !== dates(e)) out.push(`${e.company}: ${dates(old)} → ${dates(e)}`)
  }
  const groups = after.skills.filter((g) => !before.skills.some((b) => same(b.cat, g.cat))).map((g) => g.cat)
  if (groups.length) out.push(`Add skill groups: ${groups.join(', ')}`)
  if (after.education.length > before.education.length) out.push(`Add education: passing year ${after.education[0].year}`)
  return out
}

// Gentle checks shown under fields ('' = fine). Nothing blocks saving.
export const emailProblem = (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Check the email format' : '')
export function phoneProblem(v) {
  const n = String(v ?? '').replace(/\D/g, '')
  return v && !(n.length === 10 || (n.length === 12 && n.startsWith('91'))) ? 'Phone should have 10 digits' : ''
}
// "Jan 2024" → month number; a bare year counts as January for a start and December for an end; Present → Infinity.
function monthIndex(v, end) {
  const p = parseMonthYear(v)
  if (!p || (!p.y && !p.present)) return null
  if (p.present) return Infinity
  return +p.y * 12 + (p.m ? MON.indexOf(p.m) : end ? 11 : 0)
}
export function datesProblem(start, end) {
  const a = monthIndex(start, false), b = monthIndex(end, true)
  return a !== null && b !== null && b < a ? 'Ends before it starts' : ''
}
