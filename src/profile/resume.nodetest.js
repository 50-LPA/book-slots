// Run: npm run test:profile
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalMonths } from './career.js'
import { readyProjects, adysunDates, applyStack, appendLine, stackOf, moveItem, emailProblem, phoneProblem, datesProblem, pullChanges, designationFor, skillIdeas, techSkills, dobIso, emailIdeas, expText, formatDob, formatMonthYear, formatScore, fromProfile, normalize, parseMonthYear, parseScore, pullProfile, sections, stackLine, toggleInList } from './resume.js'

const candidate = {
  name: 'Asha Patil', phone: '9876543210', tech: ['Python', 'ReactJS'], passOut: '2019-06',
  companies: [
    { name: 'Old Co', from: '2019-08', to: '2021-12', present: false },
    { name: 'New Co', from: '2022-01', to: '', present: true },
  ],
}

test('new resume is prefilled from the profile', () => {
  const r = fromProfile(candidate)
  assert.equal(r.name, 'Asha Patil')
  assert.equal(r.phone, '9876543210')
  assert.deepEqual(r.experience.map((e) => [e.company, e.start, e.end]), [['New Co', 'Jan 2022', 'Present'], ['Old Co', 'Aug 2019', 'Dec 2021']])
  const cat = (c) => r.skills.find((s) => s.cat === c)?.items
  assert.equal(cat('Programming'), 'Python 3, SQL, JavaScript (ES6+), TypeScript') // Python + ReactJS merged
  assert.match(cat('Frameworks'), /Django/)
  assert.match(cat('Frontend'), /React\.js/)
  assert.equal(cat('Version Control'), 'GitHub, GitLab')
  assert.equal(r.education[0].year, 'Jun 2019')
  assert.equal(r.designation, 'Full Stack Python Developer')
  assert.equal(r.experience[0].role, 'Full Stack Python Developer') // latest job only
  assert.equal(r.experience[1].role, undefined)
  assert.match(r.summary[0], /^Full Stack Python Developer with \d+ years?( \d+ months?)? of experience\.$/)
  assert.equal(r.summary.length, 5)
  assert.match(r.summary[1], /Python, Django/)
  assert.match(r.summary[2], /React\.js/)
  assert.equal(r.languages, 'English, Hindi, Marathi')
})

test('pulling again keeps resume-only writing and replaces profile fields', () => {
  const r = fromProfile(candidate)
  r.experience[0].role = 'Lead'
  r.experience[0].bullets = 'Did things'
  r.experience.push({ company: 'Freelance', start: '2018', end: '2019' })
  r.skills.push({ cat: 'Cloud', items: 'AWS' })
  r.education[0].degree = 'B.E.'
  r.summary = ['a', 'b', 'c']
  r.designation = 'Tech Lead'
  r.skills = r.skills.filter((s) => s.cat !== 'ORM')
  r.skills.find((s) => s.cat === 'Frameworks').items = 'Django'
  const next = pullProfile(r, { ...candidate, name: 'Asha P.', tech: ['Python', '.NET'] })
  assert.equal(next.designation, 'Tech Lead') // kept once written
  assert.equal(next.name, 'Asha P.')
  assert.deepEqual(next.experience.map((e) => e.company), ['New Co', 'Old Co', 'Freelance'])
  assert.equal(next.experience[0].role, 'Lead')
  assert.equal(next.experience[0].bullets, 'Did things')
  assert.equal(next.skills.find((s) => s.cat === 'Frameworks').items, 'Django') // edit kept
  assert.ok(next.skills.some((s) => s.cat === 'Cloud')) // resume-only group kept
  assert.match(next.skills.find((s) => s.cat === 'ORM').items, /SQLAlchemy/) // missing group of the resume's stack added back
  assert.ok(!next.skills.some((s) => s.cat === 'Microsoft Azure')) // the profile's tech doesn't change the resume's chosen stack
  assert.equal(next.education[0].degree, 'B.E.') // not overwritten
  assert.deepEqual(next.summary, ['a', 'b', 'c'])
})

test('normalize fills missing fields and fixes unknown colours', () => {
  const r = normalize({ name: 'X', accent: '#123456', summary: ['one'] })
  assert.equal(r.accent, '#0369a1')
  assert.equal(r.summary.length, 3)
  assert.deepEqual(r.projects, [])
})

test('sections escape text and skip empty ones', () => {
  const r = normalize({ name: 'X', summary: ['<b>hi</b>', '', ''], hobbies: '', strengths: '', languages: '' })
  const s = sections(r)
  assert.deepEqual(s.map((x) => x.id), ['summary'])
  assert.match(s[0].blocks[0], /&lt;b&gt;hi&lt;\/b&gt;/)
})

test('new resume has default hobbies and strengths', () => {
  const r = fromProfile(candidate)
  assert.match(r.hobbies, /^Reading, Coding/)
  assert.match(r.strengths, /^Self-motivated/)
})

test('month/year, score and date-of-birth formats round-trip', () => {
  assert.deepEqual(parseMonthYear('Jan 2024'), { m: 'Jan', y: '2024' })
  assert.deepEqual(parseMonthYear('january 2024'), { m: 'Jan', y: '2024' })
  assert.deepEqual(parseMonthYear('2019'), { m: '', y: '2019' })
  assert.equal(parseMonthYear('Present').present, true)
  assert.equal(parseMonthYear('Summer 2019'), null) // shown as free text
  assert.equal(formatMonthYear('Mar', '2020'), 'Mar 2020')
  assert.equal(formatMonthYear('Mar', ''), '')
  assert.deepEqual(parseScore('7.8 CGPA'), { n: '7.8', unit: 'CGPA' })
  assert.deepEqual(parseScore('72%'), { n: '72', unit: '%' })
  assert.equal(parseScore('First class'), null)
  assert.equal(formatScore('72', '%'), '72%')
  assert.equal(formatScore('7.8', 'CGPA'), '7.8 CGPA')
  assert.equal(formatDob('2002-10-22'), '22nd Oct 2002')
  assert.equal(formatDob('2002-10-11'), '11th Oct 2002')
  assert.equal(formatDob('2002-10-01'), '1st Oct 2002')
  assert.equal(dobIso('26th Oct 2002'), '2002-10-26')
  assert.equal(dobIso('12th Aug 1999'), '1999-08-12')
  assert.equal(dobIso('someday'), '')
})

test('typing helpers', () => {
  assert.equal(toggleInList('Reading, Coding', 'coding'), 'Reading')
  assert.equal(toggleInList('Reading', 'Chess'), 'Reading, Chess')
  assert.equal(appendLine('', 'a'), 'a')
  assert.equal(appendLine('a\n\n', 'b'), 'a\nb')
  assert.deepEqual(emailIdeas('Rohan Deshmukh').slice(0, 2), ['rohan.deshmukh@gmail.com', 'rohandeshmukh@gmail.com'])
  assert.deepEqual(emailIdeas(''), [])
  assert.equal(expText(64), '5 years 4 months')
  assert.equal(expText(13), '1 year 1 month')
  const d = normalize({ designation: 'Python Developer', skills: [{ cat: 'Databases', items: 'MySQL' }, { cat: 'Project Mgmt', items: 'Jira, Trello' }, { cat: 'AWS', items: 'EC2' }] })
  assert.equal(stackLine('Database', d), 'Database: MySQL')
  assert.equal(stackLine('Ticketing Tool', d), 'Ticketing Tool: Jira')
  assert.equal(stackLine('Cloud', d), 'Cloud: AWS')
  assert.equal(stackLine('Role', d), 'Role: Python Developer')
  assert.equal(stackLine('Team Size', d), 'Team Size: ')
})

test('technology profiles', () => {
  const net = techSkills(['.NET'])
  assert.match(net.find((s) => s.cat === 'Microsoft Azure').items, /App Service/)
  assert.match(net.find((s) => s.cat === 'CI/CD').items, /Azure DevOps/)
  assert.ok(techSkills(['JAVA']).some((s) => s.cat === 'Build Tools'))
  assert.ok(!techSkills(['Tech Supp']).some((s) => s.cat === 'Version Control')) // not a coding role
  assert.ok(techSkills([]).some((s) => s.cat === 'SDLC'))
  assert.equal(designationFor(['JAVA']), 'Java Developer')
  assert.equal(designationFor(['ReactJS', '.NET']), 'Full Stack .NET Developer')
  assert.deepEqual(stackOf({ primary: 'JAVA', secondary: ['ReactJS'] }), ['JAVA', 'ReactJS']) // earlier picker
  assert.equal(designationFor(['Other']), '')
  assert.match(skillIdeas('ORM', ['JAVA'])[0], /Hibernate/)
})

test('switching the stack swaps generated content and keeps hand edits', () => {
  const r = fromProfile({ ...candidate, tech: ['Python'] })
  assert.deepEqual(r.tech, ['Python'])
  r.skills.find((s) => s.cat === 'ORM').items = 'SQLAlchemy only' // hand edit
  r.skills.push({ cat: 'Hobby Tech', items: 'Arduino' })
  r.summary.push('My own line')
  const months = 0
  const n = applyStack(r, ['ReactJS', '.NET'], months)
  const cat = (c) => n.skills.find((s) => s.cat === c)?.items
  assert.equal(n.designation, 'Full Stack .NET Developer')
  assert.equal(n.experience[0].role, 'Full Stack .NET Developer')
  assert.deepEqual(n.tech, ['.NET', 'ReactJS']) // profile order
  assert.equal(cat('Programming'), 'C#, SQL, JavaScript (ES6+), TypeScript')
  assert.match(cat('Frontend'), /React\.js/)
  assert.match(cat('Microsoft Azure'), /App Service/)
  assert.equal(cat('ORM'), 'SQLAlchemy only') // edited: kept
  assert.equal(cat('Hobby Tech'), 'Arduino') // custom: kept
  assert.equal(cat('Cache & Queues'), undefined) // Python-only, untouched: gone
  assert.ok(!n.summary.some((l) => /Django/.test(l)))
  assert.ok(n.summary.some((l) => /ASP\.NET Core/.test(l)))
  assert.ok(n.summary.some((l) => /React\.js, Redux/.test(l)))
  assert.ok(n.summary.includes('My own line'))
  // a hand-written designation is not replaced
  const m = applyStack({ ...n, designation: 'Tech Lead' }, ['JAVA'], months)
  assert.equal(m.designation, 'Tech Lead')
  assert.deepEqual(applyStack(n, ['Other', 'Angular', 'JAVA']).tech, ['JAVA']) // only the profile's mapped technologies
  const none = applyStack(n, [], months)
  assert.ok(!none.skills.some((s) => s.cat === 'Microsoft Azure')) // deselecting removes untouched groups
  assert.equal(none.skills.find((s) => s.cat === 'ORM').items, 'SQLAlchemy only')
})

test('experience line follows a designation change', () => {
  const r = fromProfile({ ...candidate, tech: ['Python'] })
  const months = totalMonths(candidate.companies)
  const n = applyStack(r, ['JAVA'], months)
  assert.equal(n.summary[0], `Java Developer with ${expText(months)} of experience.`)
  assert.match(n.summary[1], /Spring Boot/)
})

test('section order and visibility', () => {
  const r = normalize({ name: 'X', summary: ['a', 'b', 'c'], skills: [{ cat: 'A', items: 'B' }], achievements: ['Won'], languages: '', hobbies: '', strengths: '' })
  assert.deepEqual(sections(r).map((s) => s.id), ['summary', 'skills', 'achievements'])
  r.sectionOrder = ['achievements', 'summary'] // incomplete order from an older save is completed by normalize
  const n = normalize(r)
  assert.equal(n.sectionOrder.length, 8)
  assert.deepEqual(sections(n).map((s) => s.id), ['achievements', 'summary', 'skills'])
  n.hiddenSections = ['skills']
  assert.deepEqual(sections(n).map((s) => s.id), ['achievements', 'summary'])
})

test('editor helpers', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b'])
  assert.equal(emailProblem('a@b.com'), '')
  assert.equal(emailProblem('a@b'), 'Check the email format')
  assert.equal(emailProblem(''), '')
  assert.equal(phoneProblem('9876543210'), '')
  assert.equal(phoneProblem('+91 98765 43210'), '')
  assert.equal(phoneProblem('98765'), 'Phone should have 10 digits')
  assert.equal(datesProblem('Jan 2024', 'Dec 2023'), 'Ends before it starts')
  assert.equal(datesProblem('Jun 2020', '2020'), '') // bare year = December for an end
  assert.equal(datesProblem('Jan 2024', 'Present'), '')
  assert.equal(datesProblem('', 'Dec 2023'), '')
})

test('pull preview lists what would change', () => {
  const r = fromProfile(candidate)
  assert.deepEqual(pullChanges(r, pullProfile(r, candidate)), [])
  const c2 = { ...candidate, name: 'Asha Patil-Rao', companies: [...candidate.companies, { name: 'Third Co', from: '2018-01', to: '2018-06' }] }
  const lines = pullChanges(r, pullProfile(r, c2))
  assert.ok(lines.some((l) => l.startsWith('Name:')))
  assert.ok(lines.includes('Add job: Third Co (Jan 2018 – Jun 2018)'))
})

test("candidate's own pull (syncStack) also takes email and technology stack; admin pull doesn't", () => {
  const r = fromProfile(candidate) // stack Python + ReactJS, no email
  const admin = pullProfile(r, { ...candidate, tech: ['JAVA'], email: 'x@y.com' })
  assert.deepEqual(stackOf(admin), stackOf(r)) // admin: stack untouched
  const own = pullProfile(r, { ...candidate, tech: ['JAVA'], email: 'asha@mail.com', syncStack: true })
  assert.deepEqual(stackOf(own), ['JAVA'])
  assert.equal(own.email, 'asha@mail.com')
  assert.ok(own.skills.some((s) => /Spring/.test(s.items))) // JAVA skill groups follow the new stack
  const changes = pullChanges(r, own)
  assert.ok(changes.some((c) => c.startsWith('Technology stack:')) && changes.some((c) => c.startsWith('Email:')))
  assert.deepEqual(pullChanges(own, pullProfile(own, { ...candidate, tech: ['JAVA'], email: 'asha@mail.com', syncStack: true })), []) // pulling again: nothing
})

test('standard Adysun projects follow the technology', () => {
  const py = readyProjects(['Python'], { start: 'Jun 2021', end: 'Present' })
  assert.deepEqual(py.map((p) => p.name), ['SCAUT', 'Newport Sports Management Inc', 'HealthOne', 'RELIABILITY - Absa Group'])
  const newport = py[1]
  assert.equal(newport.company, 'Adysun Ventures Pvt. Ltd.')
  assert.deepEqual([newport.start, newport.end], ['Jun 2021', 'Present'])
  assert.equal(newport.bullets.split('\n').length, 3)
  assert.match(newport.bullets, /^Developed backend services using Python and Django for sports management\./)
  assert.match(newport.stack, /Backend: Python, Django/)
  assert.match(newport.stack, /Role: Python Developer\nDomain: Sports Management$/)
  const net = readyProjects(['.NET'])
  for (const p of net) {
    assert.doesNotMatch(p.stack + p.bullets, /Python|Django|FastAPI|Pandas/)
    assert.match(p.stack, /Backend: C#, ASP\.NET Core/)
    assert.match(p.stack, /Role: \.NET Developer/)
    assert.equal(p.bullets.split('\n').length, 3)
  }
  assert.match(net.find((p) => p.name === 'SCAUT').bullets, /ASP\.NET Core Web API/) // API-first project
  assert.match(readyProjects(['JAVA', 'ReactJS'])[0].stack, /Frontend: React\.js/)
  const de = readyProjects(['Data Engg'])
  assert.equal(de[0].name, 'ALLEGRO')
  assert.match(de[0].stack, /Role: Data Engineer/)
  assert.ok(!py.some((p) => p.name === 'ALLEGRO'))
  assert.match(readyProjects(['BA'])[2].bullets, /requirements for health, appointment, and assessment workflows/)
  assert.deepEqual(readyProjects([]), [])
})

test('new resume gets the projects with the Adysun job dates; switching stack rewrites only untouched ones', () => {
  const c = { ...candidate, tech: ['Python'], companies: [{ name: 'Adysun Ventures', from: '2023-06', to: '', present: true }] }
  const r = fromProfile(c)
  assert.equal(r.projects.length, 4)
  assert.deepEqual(adysunDates(r), { start: 'Jun 2023', end: 'Present' })
  assert.ok(r.projects.every((p) => p.start === 'Jun 2023' && p.end === 'Present'))
  r.projects[1].bullets += '\nMy own line.' // edited by hand
  r.projects[2].start = 'Jan 2024' // only dates changed: still rewritten, dates kept
  const net = applyStack(r, ['.NET'], 30)
  assert.match(net.projects[0].stack, /C#/)
  assert.equal(net.projects[1].bullets, r.projects[1].bullets) // edited project kept as written
  assert.match(net.projects[2].bullets, /C# and ASP\.NET Core/)
  assert.equal(net.projects[2].start, 'Jan 2024')
  const back = applyStack(net, ['Python'], 30)
  assert.equal(back.projects[0].bullets, r.projects[0].bullets) // round trip returns the same text
  const empty = applyStack({ ...r, projects: [] }, ['JAVA'], 30)
  assert.equal(empty.projects.length, 4) // a resume without projects gets the set
  const none = applyStack(net, [], 30) // un-ticking every technology keeps the projects
  assert.deepEqual(none.projects, net.projects)
  const de = applyStack(none, ['Data Engg'], 30) // …and ticking a new one rewrites the untouched ones
  assert.match(de.projects[0].stack, /Role: Data Engineer/)
  assert.equal(de.projects[1].bullets, r.projects[1].bullets) // the hand-edited one still kept
})

test('education comes from the pass-outs, newest first, only when the resume has none', () => {
  const c = { name: 'asha', companies: [], passOut: '2021-06', passOuts: [{ type: 'hsc', date: '2014-03' }, { type: 'graduation', date: '2021-06' }, { type: 'phd', date: '2025-' }] }
  assert.deepEqual(fromProfile(c).education.map((e) => [e.degree, e.year]), [['Graduation', 'Jun 2021'], ['HSC', 'Mar 2014']])
  const written = normalize({ education: [{ degree: 'B.E.', institute: 'X', year: 'Jun 2021', score: '' }] })
  assert.equal(pullProfile(written, c).education, written.education) // entries already written stay
  assert.deepEqual(fromProfile({ name: 'old', companies: [], passOut: '2019-05' }).education.map((e) => e.year), ['May 2019']) // older single pass-out
})
