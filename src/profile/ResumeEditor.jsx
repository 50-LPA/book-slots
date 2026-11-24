import { useDeferredValue, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { paginate } from './ResumeView.jsx'
import { Chips, Input, InsertPicker, MonthYear, Score, Section, TODAY, addBtn, inp, lbl } from './fields.jsx'
import {
  CITIES, COLORS, COMMON_STACK_KEYS, DESIGNATIONS, FONTS, HOBBIES, LANGUAGES, LISTS, MARITAL, POINTS,
  STACK_KEYS, STACK_OPTIONS, STRENGTHS, TEMPLATES, appendLine, applyStack, profileTech, stackOf, skillCategories, skillIdeas, techDuties, techSkills, designationFor, dobIso, emailIdeas, experienceLine, filledSummary, formatDob,
  fromProfile, lines, normalize, pullProfile, stackLine, readyProjects, adysunDates,
  SECTIONS, datesProblem, emailProblem, moveItem, phoneProblem, pullChanges,
} from './resume.js'
import { totalMonths } from './career.js'
import { titleCase } from './options.js'
import { Button, CardHeader, CircleButton } from './ui.jsx'
import { ICONS, Icon } from './icons.jsx'
import { confirmAsk, toast } from './toast.jsx'
import { useUnsaved } from './unsaved.js'

const SUMMARY_MIN = POINTS.summary.required
const ALL_KEYS = '★ All common keys'
const JUMPS = [['stack', 'Stack'], ['header', 'Header'], ['summary', 'Summary'], ['skills', 'Skills'], ['experience', 'Experience'], ['projects', 'Projects'],
  ['education', 'Education'], ['achievements', 'Achievements'], ['about', 'About'], ['personal', 'Personal']]
const jump = (id) => {
  const el = document.getElementById('rb-' + id)
  el.open = true
  el.scrollIntoView({ block: 'start' })
}
const pill = 'h-7 min-w-0 shrink-0 rounded-full border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none hover:bg-gray-50 focus:border-brand-400'
const iconBtn = 'h-6 w-6 rounded-md text-sm leading-none text-gray-500 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent'

// `resume` = the saved resume, or null for a new one (then prefilled from `candidate`). onSave(resume) resolves when saved.
// draftKey: where unsaved edits are kept on this device.
export default function ResumeEditor({ candidate, resume, onSave, onBack, draftKey }) {
  // Resumes saved before the stack picker existed take the profile's technologies as their stack.
  const [init] = useState(() => {
    if (!resume) return normalize(fromProfile(candidate))
    const { primary, secondary: _s, ...r } = resume // earlier primary/secondary picker → one stack list
    return normalize({ ...r, tech: resume.tech ?? (primary !== undefined ? stackOf(resume) : profileTech(candidate)) })
  })
  const [d, setD] = useState(init)
  const [saved, setSaved] = useState(resume ? init : null) // new resume: unsaved until the first Save
  const [saving, setSaving] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0) // preview shows one page at a time
  const [fontTick, setFontTick] = useState(0)
  const [pane, setPane] = useState('edit') // phones: editor or preview
  const dirty = JSON.stringify(d) !== JSON.stringify(saved) // a new, prefilled resume counts as unsaved (Save is enabled)
  const edited = JSON.stringify(d) !== JSON.stringify(saved ?? init) // …but only real edits warn on leaving or keep a draft
  const shown = useDeferredValue(d) // the preview catches up without slowing typing
  const pagesRef = useRef(null), stageRef = useRef(null), previewRef = useRef(null)

  const set = (k) => (v) => setD((p) => ({ ...p, [k]: v }))
  const setAt = (k, i, v) => setD((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }))
  const add = (k, v) => setD((p) => ({ ...p, [k]: [...p[k], v] }))
  const del = (k, i) => setD((p) => ({ ...p, [k]: p[k].filter((_, j) => j !== i) }))
  const move = (k, i, dir) => setD((p) => ({ ...p, [k]: moveItem(p[k], i, dir) }))

  // Shows the current page at the full width of the panel. On wide screens the panel sticks: when it is taller than
  // the window it scrolls with the form until its bottom is in view, then stays (negative sticky top).
  const layoutPreview = () => {
    const root = pagesRef.current, box = previewRef.current, stage = stageRef.current
    if (!root || !box) return
    const pages = [...root.children]
    const cur = Math.min(page, pages.length - 1)
    pages.forEach((p, i) => (p.style.display = i === cur ? '' : 'none'))
    const pw = root.offsetWidth, ph = pages[cur]?.offsetHeight || 1
    const s = Math.max(0.2, (box.clientWidth - 24) / pw) // the page always fills the panel's width
    root.style.transform = `scale(${s})`
    stage.style.width = pw * s + 'px'
    stage.style.height = ph * s + 'px'
    box.style.top = window.matchMedia('(min-width: 1024px)').matches ? `${Math.min(12, window.innerHeight - box.offsetHeight - 12)}px` : ''
  }
  useLayoutEffect(() => {
    const n = paginate(pagesRef.current, shown)
    setPageCount(n)
    if (page > n - 1) setPage(n - 1)
    layoutPreview()
  }, [shown, fontTick, pane]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(layoutPreview, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Next frame: resizing inside the observer callback would trigger the browser's "ResizeObserver loop" error.
    const ro = new ResizeObserver(() => requestAnimationFrame(layoutPreview))
    ro.observe(previewRef.current)
    const onResize = () => layoutPreview()
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeprint', showPreview) // printing from the browser menu
    document.fonts.ready.then(() => setFontTick((t) => t + 1))
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); window.removeEventListener('beforeprint', showPreview) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Page breaks depend on font metrics: re-paginate once the chosen web font has loaded.
  useEffect(() => { if (d.font) document.fonts.load(`400 10pt '${d.font}'`).then(() => setFontTick((t) => t + 1), () => {}) }, [d.font])

  useUnsaved(edited) // leaving the page (tab, link, Back, closing) with unsaved edits asks first

  // Unsaved edits are kept on this device, so a crash or a closed tab doesn't lose them; leaving inside the app
  // (after "Leave without saving") drops them.
  useEffect(() => {
    let draft
    try { draft = JSON.parse(localStorage.getItem(draftKey)) } catch { /* none */ }
    if (!draft || JSON.stringify(normalize(draft)) === JSON.stringify(init)) return
    confirmAsk({ title: 'Restore unsaved changes?', message: 'This resume has edits that were never saved (the page was closed or reloaded).', ok: 'Restore' })
      .then((yes) => (yes ? setD(normalize(draft)) : localStorage.removeItem(draftKey)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { if (edited) localStorage.setItem(draftKey, JSON.stringify(d)); else localStorage.removeItem(draftKey) } catch { /* storage full or blocked */ }
  }, [d, edited, draftKey])
  useEffect(() => () => { try { localStorage.removeItem(draftKey) } catch { /* none */ } }, [draftKey])

  const save = async () => {
    setSaving(true)
    try {
      const r = { ...d, name: titleCase(d.name) }
      await onSave(r)
      setD(r)
      setSaved(r)
      toast(`Resume of ${titleCase(d.name) || 'candidate'} saved.`)
    } catch (err) {
      toast('Could not save: ' + err.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }
  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && !saving) save() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  // Shows exactly what would change before pulling.
  const pull = async () => {
    const next = pullProfile(d, candidate)
    const changes = pullChanges(d, next)
    if (!changes.length) return toast('The resume already matches the candidate profile.')
    if (await confirmAsk({ title: 'Pull these from the profile?', message: changes.map((c) => '• ' + c).join('\n') + '\n\nEverything else stays as it is.', ok: 'Pull' })) setD(next)
  }
  // The PDF file name comes from the page title.
  // Page breaks are measured on screen: a hidden preview (phones, Edit view) would print as one clipped page.
  const showPreview = () => { if (previewRef.current && !previewRef.current.offsetParent) flushSync(() => setPane('preview')) }
  const pdf = () => {
    const title = document.title
    document.title = `${titleCase(d.name) || 'Candidate'} Resume`
    window.addEventListener('afterprint', () => (document.title = title), { once: true })
    showPreview()
    window.print()
  }

  const filled = filledSummary(d)
  const ok = filled >= SUMMARY_MIN
  const tech = stackOf(d) // the chosen stack drives every technical suggestion
  const months = totalMonths(candidate.companies ?? []) ?? 0
  const setStack = (next) => setD((p) => applyStack(p, next, months))
  const profileStack = profileTech(candidate)
  const isProfileStack = profileStack.join() === tech.join()
  // Standard Adysun projects for this stack that the resume doesn't have yet.
  const readyProjectList = readyProjects(tech, adysunDates(d)).filter((p) => !d.projects.some((x) => x.name?.trim().toLowerCase() === p.name.toLowerCase()))
  const readyGroups = techSkills(tech).concat(skillCategories(tech).map((cat) => ({ cat, items: skillIdeas(cat, tech)[0] })))
    .filter((g, i, all) => all.findIndex((x) => x.cat === g.cat) === i && !d.skills.some((s) => s.cat.toLowerCase() === g.cat.toLowerCase()))
  // Company suggestions: the profile's companies and the resume's own jobs.
  const companies = [...(candidate.companies ?? []).map((c) => c.name?.trim()), ...d.experience.map((e) => e.company?.trim())]

  // One field of a repeatable card (see LISTS in resume.js for the field kinds).
  const field = (list, i, item, f) => {
    const v = item[f.k] ?? ''
    // Skill category picked while its skills are empty → filled with what this candidate's technologies use.
    const fill = list === 'skills' && f.k === 'cat' ? (x) => (!item.items?.trim() && skillIdeas(x, tech)[0] ? { items: skillIdeas(x, tech)[0] } : {}) : f.fill
    const put = (x) => setAt(list, i, { ...item, [f.k]: x, ...fill?.(x, item) })
    const wide = f.type === 'full' ? 'col-span-2 xl:col-span-1' : '' // 2 columns, 4 on wide screens: one row of short fields
    if (f.type === 'month' || f.type === 'to') return <MonthYear key={f.k} label={f.label} value={v} onChange={put} present={f.type === 'to'} />
    if (f.type === 'score') return <Score key={f.k} label={f.label} value={v} onChange={put} />
    if (f.type === 'ta') {
      const has = lines(v)
      const keys = (txt) => lines(txt).map((l) => l.split(':')[0].trim())
      const insert = f.insert === 'keys'
        ? [...(COMMON_STACK_KEYS.some((k) => !keys(v).includes(k)) ? [ALL_KEYS] : []), ...STACK_KEYS.filter((k) => !keys(v).includes(k))]
        : [...(list === 'experience' ? techDuties(tech) : []), ...f.insert].filter((l) => !has.includes(l))
      const pick = (x) => put(f.insert !== 'keys' ? appendLine(v, x)
        : x === ALL_KEYS ? COMMON_STACK_KEYS.filter((k) => !keys(v).includes(k)).reduce((t, k) => appendLine(t, stackLine(k, d)), v)
        : appendLine(v, stackLine(x, d)))
      return (
        <div key={f.k} className={LISTS[list].fields.filter((x) => x.type === 'ta').length > 1 ? 'col-span-2' : 'col-span-full'}>
          <label className={lbl}>{f.label}
            <textarea rows={3} placeholder={f.ph} className={`${inp} resize-y`} value={v} onChange={(e) => put(e.target.value)} />
          </label>
          <InsertPicker options={insert} onPick={pick} label={f.insert === 'keys' ? '+ Insert a detail (filled from your skills)…' : undefined} />
        </div>
      )
    }
    const options = f.list === 'companies' ? companies
      : list === 'skills' ? (f.k === 'cat' ? skillCategories(tech) : skillIdeas(item.cat, tech))
      : f.list
    return <Input key={f.k} className={wide} label={f.label} aria-label={f['aria-label']} placeholder={f.ph} value={v} onChange={put} options={options} />
  }
  // ↑ ↓ × for a list item.
  const itemTools = (list, i, one) => (
    <>
      <button type="button" onClick={() => move(list, i, -1)} disabled={i === 0} aria-label={`Move ${one} ${i + 1} up`} title="Move up" className={iconBtn}>↑</button>
      <button type="button" onClick={() => move(list, i, 1)} disabled={i === d[list].length - 1} aria-label={`Move ${one} ${i + 1} down`} title="Move down" className={iconBtn}>↓</button>
      <button type="button" onClick={() => del(list, i)} aria-label={`Remove ${one} ${i + 1}`} title={`Remove ${one}`} className={`${iconBtn} text-base text-red-600 hover:bg-red-50`}>×</button>
    </>
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 print:border-0 print:p-0 print:shadow-none">
      <div className="print:hidden">
        <CardHeader
          onBack={onBack}
          backLabel="Back"
          icon={ICONS.document}
          title={`Resume · ${candidate.name || 'Candidate'}`}
          actions={<>
            <span className="px-1 text-xs text-gray-500" title="Ctrl/Cmd + S saves">{dirty ? '● Unsaved changes' : '✓ Saved'}</span>
            <Button variant="plain" icon={ICONS.refresh} onClick={pull}>Pull from profile</Button>
            <Button variant="dark" icon={ICONS.download} onClick={pdf} disabled={!ok} title={ok ? '' : `Add at least ${SUMMARY_MIN} summary points`}>Download PDF</Button>
            <Button icon={ICONS.save} onClick={save} disabled={saving || !dirty} title="Save (Ctrl/Cmd + S)">{saving ? 'Saving…' : 'Save'}</Button>
          </>}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2 print:mt-0 print:block">
        {/* Editor */}
        <form onSubmit={(e) => e.preventDefault()} className={`min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm print:hidden ${pane === 'preview' ? 'max-lg:hidden' : ''}`}>
          {/* Jump bar: stays at the top while the form scrolls */}
          <nav aria-label="Resume sections" className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex flex-wrap gap-1 rounded-t-xl border-b border-gray-100 bg-white px-3 py-2">
            {JUMPS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => jump(id)} className="rounded-full px-2 py-0.5 text-[11px] font-bold text-gray-600 hover:bg-brand-50 hover:text-brand-700">{label}</button>
            ))}
          </nav>

          <Section id="rb-stack" title="Technology stack" count={tech.length}>
            <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-2.5">
              <div role="group" aria-label="Technology stack" className="flex flex-wrap gap-1">
                {STACK_OPTIONS.map((t) => {
                  const on = tech.includes(t)
                  return (
                    <button key={t} type="button" aria-pressed={on} onClick={() => setStack(on ? tech.filter((x) => x !== t) : [...tech, t])}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-600 font-bold text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-brand-300'}`}>
                      {on ? '✓' : '+'} {t}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Pick any; the technical skill groups, designation, summary and suggestions follow. Anything you edited by hand stays.
                {!isProfileStack && <> <button type="button" onClick={() => setStack(profileStack)} className="font-bold text-brand-600 hover:underline">Use profile’s ({profileStack.join(', ') || 'none'})</button></>}
              </p>
            </div>
          </Section>

          <Section id="rb-header" title="Header">
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 2xl:grid-cols-4">
              <Input label="Full name" value={d.name} onChange={set('name')} onBlur={() => set('name')(titleCase(d.name))} placeholder="Rohan Deshmukh" autoComplete="off" />
              <Input label="Designation" value={d.designation} onChange={set('designation')} placeholder="Sr. Software Engineer"
                options={[designationFor(tech), ...DESIGNATIONS]} />
              <Input label="Phone" type="tel" inputMode="tel" value={d.phone} onChange={set('phone')} placeholder="9876543210" options={[candidate.phone]} problem={phoneProblem(d.phone)} />
              <Input label="Email" type="email" value={d.email} onChange={set('email')} placeholder="rohan.deshmukh@gmail.com" options={emailIdeas(d.name)} problem={emailProblem(d.email)} />
            </div>
          </Section>

          <Points k="summary" id="rb-summary" title="Summary" hint={`minimum ${SUMMARY_MIN} points`} addLabel="+ Add point" extra={[experienceLine(d.designation, months)]} {...{ d, setAt, add, del }} />

          {Object.entries(LISTS).map(([list, { title, one, fields }]) => (
            <Section key={list} id={'rb-' + list} title={title} count={d[list].length}>
              {list === 'skills' && d.skills.length > 0 && (
                <div className="grid gap-x-4 2xl:grid-cols-2">
                  {[0, 1].map((n) => <div key={n} className={`mb-1 grid grid-cols-[2fr_3fr_4.75rem] gap-1.5 text-xs text-gray-600 ${n ? 'hidden 2xl:grid' : ''}`}><span>Category</span><span>Skills</span></div>)}
                </div>
              )}
              <div className={list === 'skills' ? 'grid gap-x-4 2xl:grid-cols-2' : ''}>
                {d[list].map((item, i) => list === 'skills'
                  // one line per skill group: category · skills · ↑ ↓ ×
                  ? <div key={i} className="mb-1.5 grid grid-cols-[2fr_3fr_4.75rem] items-center gap-1.5 [&_input]:mt-0">
                      {fields.map((f) => field(list, i, item, { ...f, label: undefined, 'aria-label': f.label }))}
                      <span className="flex">{itemTools(list, i, one)}</span>
                    </div>
                  : <div key={i} className="relative mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 pr-11">
                      <span className="absolute right-1 top-1 flex flex-col items-center">{itemTools(list, i, one)}</span>
                      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 xl:grid-cols-4">{fields.map((f) => field(list, i, item, f))}</div>
                      {datesProblem(item.start, item.end) && <p className="mt-1 text-[11px] text-red-600">⚠ {datesProblem(item.start, item.end)}: check From and To.</p>}
                    </div>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={addBtn} onClick={() => add(list, {})}>+ Add {one}</button>
                {list === 'skills' && (
                  <select value="" aria-label="Add a ready skill group" onChange={(e) => e.target.value && add('skills', readyGroups.find((g) => g.cat === e.target.value))}
                    className="h-7 min-w-0 max-w-full rounded-md border border-dashed border-gray-300 bg-white px-1.5 text-xs text-gray-600 mobile:h-9">
                    <option value="">+ Add a ready group…</option>
                    {readyGroups.map((g) => <option key={g.cat} value={g.cat}>{g.cat} — {g.items}</option>)}
                  </select>
                )}
                {list === 'projects' && readyProjectList.length > 0 && (
                  <select value="" aria-label="Add a ready project" onChange={(e) => e.target.value && add('projects', readyProjectList.find((p) => p.name === e.target.value))}
                    className="h-7 min-w-0 max-w-full rounded-md border border-dashed border-gray-300 bg-white px-1.5 text-xs text-gray-600 mobile:h-9">
                    <option value="">+ Add a ready project…</option>
                    {readyProjectList.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </Section>
          ))}

          <Points k="achievements" id="rb-achievements" title="Achievements" hint="optional" addLabel="+ Add achievement" {...{ d, setAt, add, del }} />

          <Section id="rb-about" title="About myself">
            <div className="grid gap-2.5 xl:grid-cols-2">
              <Chips label="Hobbies" value={d.hobbies} onChange={set('hobbies')} options={HOBBIES} placeholder="Reading, Coding, Traveling" />
              <Chips label="Strengths" value={d.strengths} onChange={set('strengths')} options={STRENGTHS} placeholder="Self-motivated, Problem-Solving" />
            </div>
          </Section>

          <Section id="rb-personal" title="Personal details">
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 xl:grid-cols-4">
              <label className={lbl}>Date of birth
                <input type="date" className={inp} value={dobIso(d.dob)} max={TODAY} onChange={(e) => set('dob')(formatDob(e.target.value))} />
                {d.dob && !dobIso(d.dob) && <span className="text-[11px] text-gray-400">Saved as “{d.dob}”</span>}
              </label>
              <label className={lbl}>Marital status
                <select className={inp} value={d.marital} onChange={(e) => set('marital')(e.target.value)}>
                  <option value="">Leave blank (not shown)</option>
                  {[...new Set([...MARITAL, d.marital].filter(Boolean))].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <Input label="Hometown (optional)" value={d.hometown} onChange={set('hometown')} placeholder="Nashik, Maharashtra" options={CITIES} />
              <Input label="Current location" value={d.location} onChange={set('location')} placeholder="Pune, Maharashtra" options={[d.hometown, ...CITIES]} />
              <div className="col-span-full mt-1"><Chips label="Languages" value={d.languages} onChange={set('languages')} options={LANGUAGES} placeholder="English, Hindi, Marathi" /></div>
            </div>
          </Section>
        </form>

        {/* Preview: its own panel, look controls on top, one page at a time; stays in view on wide screens. */}
        <div ref={previewRef} className={`min-w-0 rounded-xl border border-slate-200 bg-slate-100 p-3 lg:sticky lg:top-3 print:!static print:!block print:border-0 print:bg-transparent print:p-0 ${pane === 'edit' ? 'max-lg:hidden' : ''}`}>
          {/* Look controls, one line: template · font · colour · sections */}
          <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 rounded-lg bg-white p-2 shadow-sm xl:flex-nowrap print:hidden">
            <select aria-label="Resume type" title="Resume type" value={d.template} onChange={(e) => set('template')(e.target.value)} className={pill}>
              {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select aria-label="Font" title="Font" value={d.font} onChange={(e) => set('font')(e.target.value)} className={pill}>
              {Object.entries(FONTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div role="radiogroup" aria-label="Accent colour" className="flex shrink-0 items-center gap-1 px-1">
              {Object.entries(COLORS).map(([c, n]) => (
                <button key={c} type="button" role="radio" aria-checked={d.accent === c} aria-label={n} title={n} onClick={() => set('accent')(c)}
                  style={{ background: c }} className={`h-4 w-4 rounded-full ${d.accent === c ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`} />
              ))}
            </div>
            <SectionsMenu d={d} setD={setD} />
          </div>
          <p role="status" className="mb-2 text-center text-xs font-bold text-red-600 empty:hidden print:hidden">
            {ok ? '' : `Add at least ${SUMMARY_MIN} summary points to download (${filled}/${SUMMARY_MIN})`}
          </p>
          <div ref={stageRef} className="rb-stage relative mx-auto overflow-hidden print:overflow-visible"><div ref={pagesRef} className="rb-pages" /></div>
          {pageCount > 1 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-600 print:hidden">
              <CircleButton icon={ICONS.back} label="Previous page" disabled={page === 0} dim={page === 0} onClick={() => setPage((p) => p - 1)} />
              <span>Page <b>{Math.min(page, pageCount - 1) + 1}</b> of {pageCount}</span>
              <CircleButton icon={ICONS.arrow} label="Next page" disabled={page >= pageCount - 1} dim={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} />
            </div>
          )}
        </div>
      </div>

      {/* Phones: switch between the form and the preview */}
      <button type="button" onClick={() => { setPane((p) => (p === 'edit' ? 'preview' : 'edit')); window.scrollTo(0, 0) }}
        className="fixed bottom-4 left-4 z-40 flex h-10 items-center gap-1.5 rounded-full bg-gray-900 px-4 text-sm font-bold text-white shadow-lg lg:hidden print:hidden">
        <Icon d={pane === 'edit' ? ICONS.eye : ICONS.pencil} className="h-4 w-4" /> {pane === 'edit' ? 'Preview' : 'Edit'}
      </button>
    </section>
  )
}

// Which resume sections show, and in what order.
function SectionsMenu({ d, setD }) {
  const toggle = (k) => setD((p) => ({ ...p, hiddenSections: p.hiddenSections.includes(k) ? p.hiddenSections.filter((x) => x !== k) : [...p.hiddenSections, k] }))
  const shift = (i, dir) => setD((p) => ({ ...p, sectionOrder: moveItem(p.sectionOrder, i, dir) }))
  return (
    <details className="relative">
      <summary className="flex h-7 shrink-0 cursor-pointer list-none items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-2.5 text-xs text-gray-700 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
        Sections{d.hiddenSections.length ? ` (${d.hiddenSections.length} hidden)` : ''} ▾
      </summary>
      <ul className="absolute left-1/2 z-20 mt-1 w-56 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-1.5 text-xs shadow-lg">
        {d.sectionOrder.map((k, i) => (
          <li key={k} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-gray-50">
            <label className="flex flex-1 cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={!d.hiddenSections.includes(k)} onChange={() => toggle(k)} className="accent-brand-600" />
              <span className={d.hiddenSections.includes(k) ? 'text-gray-400 line-through' : ''}>{SECTIONS[k]}</span>
            </label>
            <button type="button" onClick={() => shift(i, -1)} disabled={i === 0} aria-label={`Move ${SECTIONS[k]} up`} className={iconBtn}>↑</button>
            <button type="button" onClick={() => shift(i, 1)} disabled={i === d.sectionOrder.length - 1} aria-label={`Move ${SECTIONS[k]} down`} className={iconBtn}>↓</button>
          </li>
        ))}
      </ul>
    </details>
  )
}

// Single-line point list (summary, achievements): `min` rows always shown, the first `required` ones must be filled.
function Points({ k, id: sectionId, title, hint, addLabel, extra = [], d, setAt, add, del }) {
  const { min, required, label, list } = POINTS[k]
  const id = useId()
  const unused = [...extra, ...list].filter((l) => l && !d[k].includes(l))
  return (
    <Section id={sectionId} title={title} hint={hint} count={d[k].filter((x) => x.trim()).length}>
      {d[k].map((v, i) => (
        <div key={i} className="mb-1.5 flex gap-1.5">
          <input value={v} onChange={(e) => setAt(k, i, e.target.value)} aria-label={`${label} ${i + 1}`} list={id}
            placeholder={`${label} ${i + 1}${i < required ? ' (required)' : ''}`} className={`${inp} mt-0`} />
          <button type="button" onClick={() => del(k, i)} disabled={d[k].length <= min} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            className="w-8 flex-none rounded-md border border-gray-200 bg-white text-base text-red-600 disabled:cursor-not-allowed disabled:opacity-30">×</button>
        </div>
      ))}
      <datalist id={id}>{unused.map((o) => <option key={o} value={o} />)}</datalist>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={addBtn} onClick={() => add(k, '')}>{addLabel}</button>
        <InsertPicker options={unused} label="+ Add a ready point…" onPick={(x) => {
          const empty = d[k].findIndex((p) => !p.trim()) // fills the first empty row, else adds one
          if (empty < 0) add(k, x)
          else setAt(k, empty, x)
        }} />
      </div>
    </Section>
  )
}
