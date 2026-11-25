import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { applySalary } from './salary.js'
import { toast } from './toast.jsx'
import { useUnsaved } from './unsaved.js'
import { ADVANCE_DUE, PHASES, TECH, advance, latestPassOut, titleCase, withPassOuts } from './options.js'
import { ICONS, Icon } from './icons.jsx'
import { Button, Card, CardHeader, Segmented } from './ui.jsx'
import { CareerFields, CareerTimeline } from './Career.jsx'
import { gapTotal, span, totalMonths } from './career.js'
const SignaturePad = lazy(() => import('./SignaturePad.jsx')) // only downloaded when someone signs

const DOC_CHARGES = [
  ['Documentation', '', '12,000  /  Yr.'],
  ['PF', '(1800 + 1800 + 400)', '4000  /  Mo.'],
  ['Form 16', '', '4000  /  Qtr'],
  ['Sal. Rotation', '(< 60,000)', '3000  /  Mo.'],
  ['Sal. Rotation', '(> 60,000)', '5000  /  Mo.'],
]

const ROUNDS = [
  ['< 7  Rounds', 'Rs. 80,000/-'],
  ['7 - 15  Rounds', 'Rs. 1,00,000/-'],
  ['15 - 20  Rounds', 'Rs. 1,30,000/-'],
  ['> 20  Rounds', 'Rs. 1,50,000/-'],
]

const TERMS = [
  ['No Post-Placement Support:', 'No job, technical, or other support after placement.'],
  ['Min. 1 Mock Interview:', 'Mandatory before live interviews.'],
  ['₹20,000 Advance:', 'Non-refundable, even if no interview is attended.'],
  ['Resume:', 'Prepared by us; Naukri profile will only be consulted & reviewed only, not created from our end.'],
  ['Advance is Separate:', 'It is not part of the final payment.'],
  [
    'Final Payment:',
    <>Must be paid within <u>7 days of receiving the offer letter</u>. Cannot be delayed until salary or joining.</>,
  ],
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`

// One object holds the whole form; this is exactly what gets saved as a record.
const newForm = (today = fmtDate(new Date())) => ({
  name: '', phone: '', visitDates: [today], reference: '',
  parentsNo: '', parentsRel: '', spouseNo: '', spouseRel: '',
  tech: [], expYears: '', expMonths: '',
  ctc: '', varPay: '', fixPay: '', inHand: '',
  advanceAmount: '', // rupees paid towards the advance (digits); status is worked out from it
  phase: 'inquiry', // 'inquiry' | 'confirmed'
  passOuts: [], // { type: PASS_OUTS value, date: 'YYYY-MM' }
  passOut: '', // latest pass-out 'YYYY-MM' (timeline, gaps, resume); set from passOuts
  companies: [], // { name, from: 'YYYY-MM', to: 'YYYY-MM', present: bool }
  signature: '', // PNG data URL drawn on the signature pad
  signedAt: '', // ISO time the candidate saved the signature
  signDate: today,
})

const digits = (s) => s.replace(/\D/g, '')

function Field({ label, children }) {
  return (
    <label className="flex items-baseline gap-[1.5mm] font-bold">
      <span className="whitespace-nowrap">{label} :</span>
      {children}
    </label>
  )
}

function Text({ value, onChange, className = '', ...rest }) {
  return <input className={`field ${className}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}

// "03-NOV-2026" <-> "2026-11-03" for the native date picker.
const toIso = (v) => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v.trim())
  const mi = m ? MONTHS.indexOf(m[2].toUpperCase()) : -1
  return mi < 0 ? '' : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

// Text date (still typeable) plus a calendar button that opens the browser's date picker.
function DateText({ value, onChange, className }) {
  const picker = useRef(null)
  return (
    <>
      <Text value={value} onChange={onChange} className={className} />
      <span className="relative flex-none self-center">
        <button type="button" tabIndex={-1} aria-label="Pick a date" title="Pick a date"
          onClick={() => (picker.current.showPicker ? picker.current.showPicker() : picker.current.click())}
          className="flex h-[6mm] w-[6mm] items-center justify-center rounded text-gray-400 hover:bg-brand-50 hover:text-brand-600">
          <Icon d={ICONS.calendar} className="h-[4mm] w-[4mm]" />
        </button>
        <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={toIso(value)}
          onChange={(e) => e.target.value && onChange(fmtDate(new Date(e.target.value + 'T00:00')))}
          className="pointer-events-none absolute inset-0 opacity-0" />
      </span>
    </>
  )
}

// Every visit date, one small date box each; + adds today's date (a repeat visit is usually logged the day it happens).
function VisitDates({ value, onChange }) {
  const today = fmtDate(new Date())
  const put = (i, v) => onChange(value.map((d, j) => (j === i ? v : d)))
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[2mm] gap-y-[1mm]">
      {value.map((d, i) => (
        <span key={i} className="flex items-baseline">
          <DateText value={d} onChange={(v) => put(i, v)} className="w-[24mm] flex-none mobile:w-[34mm]" />
          {value.length > 1 && (
            <button type="button" tabIndex={-1} aria-label={`Remove visit ${d}`} title="Remove this visit" onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="self-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 mobile:p-1.5">
              <Icon d={ICONS.close} className="h-[3.5mm] w-[3.5mm]" />
            </button>
          )}
        </span>
      ))}
      <button type="button" tabIndex={-1} aria-label="Add a visit" title="Add a visit (today)" onClick={() => onChange([...value, today])}
        className="self-center rounded-full border border-brand-300 px-[1.5mm] text-[8pt] font-normal text-brand-600 hover:bg-brand-50 mobile:px-3 mobile:py-1 mobile:text-sm">+ Visit</button>
    </span>
  )
}

// Digits only, max 10; pasted "+91 98765 43210" / "098765..." are trimmed to 10.
function Phone({ value, onChange }) {
  const short = value.length > 0 && value.length < 10
  return (
    <>
      <input
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const d = digits(e.target.value)
          onChange((d.length > 10 ? d.replace(/^(91|0)/, '') : d).slice(0, 10))
        }}
        className={`field ${short ? '!border-solid !border-red-500' : ''}`}
      />
      {short && <span className="text-[8pt] font-normal text-red-500">{value.length}/10</span>}
    </>
  )
}

// Small "Relation" line under a family number; hidden on paper if left empty.
function Relation({ value, onChange, options }) {
  return (
    <label className="mt-[1mm] flex gap-[1.5mm] text-[9.5pt]">
      <span className="text-gray-500">Relation :</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer appearance-none bg-transparent outline-none ${value ? '' : 'text-gray-400'}`}
      >
        <option value="">Select ▾</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

function SmallNum({ value, onChange, max }) {
  return (
    <input
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        const d = digits(e.target.value).slice(0, 2)
        if (d === '' || Number(d) <= max) onChange(d)
      }}
      className="field w-[9mm] flex-none text-center"
    />
  )
}

// Shows "₹ 6,50,000" with a unit line under it: "6.5 LPA" (or "80K" below a lakh) for yearly amounts, "per month" for in-hand.
// A small number (e.g. 6.5) is read as LPA and turned into rupees when leaving the box.
function Money({ value, onChange, monthly = false }) {
  const n = Number(value)
  const shown = value === '' ? '' : '₹ ' + (value.includes('.') ? value : n.toLocaleString('en-IN'))
  const rupees = n < 100 ? n * 100000 : n
  const unit =
    !value || isNaN(n) ? '' : monthly ? 'per month'
    : rupees < 100000 ? `${Number((rupees / 1000).toFixed(1))}K` // 80,000 → 80K
    : `${Number((rupees / 100000).toFixed(2))} LPA`
  return (
    <div className="flex h-full flex-col justify-center">
      <input
        inputMode="decimal"
        placeholder={monthly ? '₹ / month' : '₹ or LPA'}
        value={shown}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '')
          if (/^\d*\.?\d*$/.test(v)) onChange(v)
        }}
        onBlur={() => {
          if (value && n > 0 && n < 100) onChange(String(Math.round(rupees)))
          else if (value.endsWith('.')) onChange(value.slice(0, -1))
        }}
        className={cellInput}
      />
      {unit && <span className="text-[8.5pt] leading-none text-gray-500">{unit}</span>}
    </div>
  )
}

// Amount paid towards the ₹20,000 advance, with the worked-out status (Unpaid / Partially paid · ₹x due / Fully paid).
function AdvancePaid({ value, onChange }) {
  const a = advance({ advanceAmount: value })
  const tone = { paid: 'text-emerald-700', partial: 'text-amber-700', unpaid: 'text-red-600' }[a.status]
  return (
    <div className="mt-[2.5mm] text-[10pt]">
      <label className="inline-flex items-baseline gap-[1.5mm]">
        Paid : ₹
        <input inputMode="numeric" value={value ? Number(value).toLocaleString('en-IN') : ''} placeholder="0"
          onChange={(e) => onChange(digits(e.target.value).slice(0, 6))} aria-label="Advance amount paid"
          className="field w-[20mm] flex-none text-center font-bold" />
        / {ADVANCE_DUE.toLocaleString('en-IN')}
      </label>
      <button type="button" onClick={() => onChange(String(ADVANCE_DUE))}
        className="ml-[2mm] rounded-full border border-gray-300 px-2 text-[8pt] text-gray-600 hover:bg-gray-50">Full</button>
      <p className={`mt-[1mm] text-[9.5pt] font-bold ${tone}`}>
        {a.status === 'paid' ? '✓ Fully paid' : a.status === 'partial' ? `Partially paid · ₹ ${a.due.toLocaleString('en-IN')} due` : 'Unpaid'}
      </p>
    </div>
  )
}

// Enter jumps to the next field instead of doing nothing.
function nextOnEnter(e) {
  if (e.key !== 'Enter' || !['INPUT', 'SELECT'].includes(e.target.tagName)) return
  e.preventDefault()
  const els = [...e.currentTarget.querySelectorAll('input, select')]
  els[els.indexOf(e.target) + 1]?.focus()
}

const cellInput = 'w-full bg-transparent text-[10.5pt] text-center outline-none placeholder:text-[9pt] placeholder:text-gray-300'

// Companies drive Total Experience (years + months); with no dated company the typed values stay.
// Also run on open, so a "Present" job keeps counting up month by month.
function withExperience(form) {
  const m = totalMonths(form.companies)
  return m === null ? form : { ...form, expYears: String(Math.floor(m / 12)), expMonths: String(m % 12) }
}


// Candidate's own view: quick facts above the sheet.
function MyStats({ f }) {
  const a = advance(f)
  const gap = f.passOut ? gapTotal(f.passOut, f.companies) : null
  const exp = (Number(f.expYears) || 0) * 12 + (Number(f.expMonths) || 0)
  const stats = [
    ['Status', f.phase === 'confirmed' ? 'Confirmed' : 'Inquiry', f.phase === 'confirmed' ? 'text-emerald-700' : 'text-gray-700'],
    ['Advance', a.status === 'paid' ? '✓ Fully paid' : a.status === 'partial' ? `Partially paid · ₹${a.due.toLocaleString('en-IN')} due` : 'Unpaid',
      { paid: 'text-emerald-700', partial: 'text-amber-700', unpaid: 'text-red-600' }[a.status]],
    ['Total experience', exp ? span(exp) : '—', 'text-gray-800'],
    ['Total gap', gap === null ? '—' : gap ? span(gap) : 'No gaps', gap ? 'text-red-600' : 'text-emerald-700'],
  ]
  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(([k, v, tone]) => (
        <div key={k} className="flex flex-col-reverse rounded-xl border border-gray-200 px-4 py-3">
          <dt className="text-xs text-gray-500">{k}</dt>
          <dd className={`mb-0.5 font-bold ${tone}`}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// `record` is a saved candidate (or undefined for a new one). `onSave(form)` resolves true when saved.
// prefill: fields for a new record (e.g. phone from the book-slots candidate list); counts as unsaved.
// mine: the candidate's own view (candidate dashboard): the A4 sheet only, read-only.
export default function ProfileForm({ record, prefill, readOnly, mine, onEdit, onSave, onBack, onDelete, onResume }) {
  const [f, setF] = useState(() => withExperience(withPassOuts({ ...newForm(), ...record, ...prefill })))
  const [saved, setSaved] = useState(() => (prefill ? withExperience(withPassOuts({ ...newForm(), ...record })) : f))
  const [saving, setSaving] = useState(false)
  const [signing, setSigning] = useState(false)
  const dirty = JSON.stringify(f) !== JSON.stringify(saved)
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const setSalary = (k) => (v) => setF((p) => applySalary(p, k, v))
  const setCompanies = (companies) => setF((p) => withExperience({ ...p, companies }))
  const setPassOuts = (passOuts) => setF((p) => ({ ...p, passOuts, passOut: latestPassOut(passOuts) }))
  const toggleTech = (t) => set('tech')(f.tech.includes(t) ? f.tech.filter((x) => x !== t) : [...f.tech, t])

  useUnsaved(dirty) // leaving the page (tab, link, Back, closing) with unsaved edits asks first

  const save = async () => {
    if (!f.name.trim()) return toast('Please enter the candidate name before saving.', { tone: 'error' })
    if (!f.passOuts.some((p) => p.type && /^\d{4}-\d{2}$/.test(p.date))) return toast('Please add at least one pass-out (type, month and year) before saving.', { tone: 'error' })
    setSaving(true)
    try {
      if (await onSave(f)) setSaved(f)
    } catch (err) {
      toast('Could not save: ' + err.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!readOnly && dirty && !saving) save() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })


  return (
    <Card>
      <CardHeader
        onBack={onBack}
        backLabel={mine ? 'Back' : 'Back to admission profiles'}
        icon={readOnly ? ICONS.profile : record ? ICONS.pencil : ICONS.plus}
        title={mine ? 'My Admission Profile' : readOnly ? 'View Admission' : record ? 'Update Admission' : 'New Admission'}
        parents={mine ? undefined : [{ label: 'Admission Profiles', href: '#/candidates' }]}
        actions={<>
          <Segmented label="Admission profile phase" options={PHASES} value={f.phase} onChange={set('phase')} disabled={readOnly}
            border="border-gray-300" idle="text-gray-500 enabled:hover:bg-gray-50"
            activeClass={(v) => (v === 'confirmed' ? 'bg-emerald-500' : 'bg-gray-500') + ' text-white'} />
          <span className="px-1 text-xs text-gray-500">{readOnly ? 'View only' : dirty ? '● Unsaved changes' : record ? '✓ Saved' : ''}</span>
          {onDelete && <Button variant="danger" icon={ICONS.trash} onClick={onDelete}>Delete</Button>}
          {onResume && <Button variant="plain" icon={ICONS.document} onClick={onResume}>Resume</Button>}
          {readOnly
            ? onEdit && <Button variant="warning" icon={ICONS.pencil} onClick={onEdit}>Update</Button>
            : <Button icon={ICONS.save} onClick={save} disabled={saving || !dirty} title="Save (Ctrl/Cmd + S)">{saving ? 'Saving…' : 'Save'}</Button>}
        </>}
      />

      {mine && <MyStats f={f} />}

      {/* Inner card, split: A4 sheet left | career fields right (stacked on smaller screens). Only two cards in total. */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 xl:flex-row">
      {!mine && <>
      <aside inert={readOnly} className="min-w-0 flex-1 border-b border-gray-200 p-4 xl:border-b-0">
        <div className="xl:sticky xl:top-4">
          <CareerFields passOuts={f.passOuts} passOut={f.passOut} companies={f.companies} onPassOuts={setPassOuts} onCompanies={setCompanies} />
        </div>
      </aside>
      <div className="hidden w-px bg-gray-200 xl:block" />
      </>}
      <div className={`overflow-x-auto xl:shrink-0 ${mine ? 'mx-auto' : ''}`}>
      <form
        onKeyDown={nextOnEnter}
        onSubmit={(e) => e.preventDefault()}
        inert={readOnly}
        className="mx-auto xl:mx-0 flex h-[297mm] w-[210mm] flex-col justify-between overflow-hidden bg-white p-[6mm] font-lato text-[11.5pt] leading-tight text-black mobile:h-auto mobile:w-full mobile:gap-7 mobile:p-4"
      >
        {/* Candidate details */}
        <section className="grid grid-cols-[102mm_minmax(0,1fr)] gap-y-[4.5mm] text-[11.5pt] mobile:grid-cols-1 mobile:gap-y-5">
          <Field label="CANDIDATE NAME">
            <Text value={f.name} onChange={set('name')} onBlur={() => set('name')(titleCase(f.name))} autoFocus />
          </Field>
          <Field label="CANDIDATE MOBILE">
            <Phone value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="VISIT DATES">
            <VisitDates value={f.visitDates} onChange={set('visitDates')} />
          </Field>
          <Field label="REFERENCE NAME">
            <Text value={f.reference} onChange={set('reference')} />
          </Field>
          <div>
            <Field label="PARENTS NUMBER">
              <Phone value={f.parentsNo} onChange={set('parentsNo')} />
            </Field>
            <Relation value={f.parentsRel} onChange={set('parentsRel')} options={['Father', 'Mother']} />
          </div>
          <div>
            <Field label="SPOUSE / SIBLINGS NUMBER">
              <Phone value={f.spouseNo} onChange={set('spouseNo')} />
            </Field>
            <Relation value={f.spouseRel} onChange={set('spouseRel')} options={['Spouse', 'Brother', 'Sister']} />
          </div>
        </section>

        {/* Former free space (41mm): now the career timeline */}
        <CareerTimeline passOut={f.passOut} companies={f.companies} />

        {/* Technology + Experience */}
        <section className="flex mobile:flex-col mobile:gap-7">
          <div className="w-[78mm] mobile:w-full">
            <h2 className="mb-[2.6mm] font-bold underline underline-offset-2">CAREER TECHNOLOGY</h2>
            {/* 7 rows × 2 columns, filled top-to-bottom then left-to-right */}
            <ul className="grid grid-flow-col grid-cols-[auto_auto] grid-rows-7 justify-start gap-x-[6mm] gap-y-[3.5mm]">
              {TECH.map((t) => (
                <li key={t}>
                  <label className="flex items-center gap-[2mm] whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={f.tech.includes(t)}
                      onChange={() => toggleTech(t)}
                      className="h-[3.4mm] w-[3.4mm] flex-none accent-black"
                    />
                    <span>
                      {t.replace(/ \(.*\)$/, '')}
                      {/ \(.*\)$/.test(t) && <span className="text-[10.5px] text-gray-600"> {t.match(/\(.*\)$/)[0]}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1">
            <h2 className="mb-[2.6mm] font-bold underline underline-offset-2">EXPERIENCE SUMMARY</h2>
            <div className="flex items-baseline gap-[1.5mm]">
              Total Experience :
              <SmallNum value={f.expYears} onChange={set('expYears')} max={50} /> Yrs
              <SmallNum value={f.expMonths} onChange={set('expMonths')} max={11} /> Months
            </div>

            <table className="mt-[3.5mm] w-[120mm] table-fixed border-collapse border-[1.5px] border-black text-center mobile:w-full">
              <colgroup>
                <col className="w-[32mm] mobile:w-auto" />
                <col className="w-[23mm] mobile:w-auto" />
                <col className="w-[24mm] mobile:w-auto" />
                <col />
              </colgroup>
              <tbody>
                <tr className="h-[14.5mm]">
                  <td className="border border-black"><Money value={f.ctc} onChange={setSalary('ctc')} /></td>
                  <td className="border-y border-l border-black border-r border-r-gray-400 [border-right-style:dashed]"><Money value={f.varPay} onChange={setSalary('varPay')} /></td>
                  <td className="border-y border-r border-black"><Money value={f.fixPay} onChange={setSalary('fixPay')} /></td>
                  <td className="border border-black"><Money value={f.inHand} onChange={setSalary('inHand')} monthly /></td>
                </tr>
                <tr className="h-[9mm]">
                  <td className="border border-black">CTC</td>
                  <td className="border-y border-l border-black border-r border-r-gray-400 [border-right-style:dashed]">VAR Pay</td>
                  <td className="border-y border-r border-black">FIX Pay</td>
                  <td className="border border-black">inHand</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-[6mm] w-[120mm] text-center mobile:w-full">
              <p className="text-[12pt]">Rs. 20,000/-&nbsp; Advance</p>
              <p className="mt-[3mm] text-[14pt] font-bold">NON REFUNDABLE</p>
              <AdvancePaid value={f.advanceAmount} onChange={set('advanceAmount')} />
            </div>
          </div>
        </section>

        {/* Charges tables */}
        <section className="flex justify-between mobile:flex-col mobile:gap-7">
          <div>
            <h2 className="mb-[5mm] text-center font-bold underline underline-offset-2">DOCUMENTATION&nbsp; CHARGES</h2>
            <table className="w-[97mm] table-fixed border-collapse border border-gray-400 mobile:w-full">
              <colgroup>
                <col className="w-[56mm] mobile:w-1/2" />
                <col />
              </colgroup>
              <tbody>
                {DOC_CHARGES.map(([name, note, price], i) => (
                  <tr key={i} className="h-[10.2mm]">
                    <td className="border border-gray-400 px-[1.8mm]">
                      {name} {note && <span className="text-[9.5pt] text-gray-600">{note}</span>}
                    </td>
                    <td className="whitespace-pre border border-gray-400 text-center">{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-[5mm] text-center font-bold underline underline-offset-2">INTERVIEW&nbsp; ROUNDS</h2>
            <table className="w-[94mm] table-fixed border-collapse border border-gray-400 text-center mobile:w-full">
              <colgroup>
                <col className="w-[48mm] mobile:w-1/2" />
                <col />
              </colgroup>
              <thead>
                <tr className="h-[7.5mm] font-bold">
                  <td className="border border-gray-400">ROUND</td>
                  <td className="border border-gray-400">PAYMENT</td>
                </tr>
              </thead>
              <tbody>
                {ROUNDS.map(([r, p]) => (
                  <tr key={r} className="h-[9.8mm] align-top">
                    <td className="whitespace-pre border border-gray-400 pt-[1mm]">{r}</td>
                    <td className="border border-gray-400 pt-[1mm]">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-[0.5mm] -ml-[0.6mm] text-[10pt] text-gray-600">- These are interview rounds &amp; not company.</p>
          </div>
        </section>

        {/* Terms & conditions */}
        <ol className="list-decimal pl-[5mm] text-[11pt] leading-[5.6mm] marker:font-normal">
          {TERMS.map(([title, text], i) => (
            <li key={i} className="pl-[2.2mm]">
              <b>{title}</b> {text}
            </li>
          ))}
        </ol>

        {/* Signature */}
        <section className="grid grid-cols-[102mm_minmax(0,1fr)] items-end pb-[4mm] text-[11.5pt] mobile:grid-cols-1 mobile:gap-y-6">
          <div className="flex flex-col-reverse gap-[4mm] font-bold">
            <span className="whitespace-nowrap">CANDIDATE SIGNATURE :</span>
            <div className={`relative flex h-[20mm] min-w-0 items-end border-b border-dashed border-gray-300 ${readOnly ? '' : 'pr-[7mm]'}`}>
              {f.signature && <img src={f.signature} alt="Candidate signature" className="h-full max-w-full object-contain object-left" />}
              {f.signedAt && (
                <span className="absolute -bottom-[3.6mm] left-0 whitespace-nowrap text-[7pt] font-normal text-gray-500">
                  Signed {new Date(f.signedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              )}
              {!readOnly && (
                <button type="button" onClick={() => setSigning(true)}
                  aria-label={f.signature ? 'Re-sign' : 'Sign here'} title={f.signature ? 'Re-sign' : 'Sign here'}
                  className="group absolute inset-0 cursor-pointer rounded-sm hover:bg-brand-50/40">
                  <span className="absolute right-0 bottom-[1mm] flex h-[6mm] w-[6mm] items-center justify-center rounded-full border border-brand-300 bg-white text-brand-600 shadow-sm group-hover:bg-brand-50">
                    <Icon d={ICONS.signature} className="h-[3.5mm] w-[3.5mm]" />
                  </span>
                </button>
              )}
            </div>
          </div>
          <Field label="DATE OF SIGNATURE">
            <DateText value={f.signDate} onChange={set('signDate')} />
          </Field>
        </section>

        <p className="text-center font-arial text-[10pt] text-gray-500">
          Attach candidate <b>Aadhar card</b>, <b>Bank Passbook</b> Hard copy.
        </p>
      </form>
      </div>
      </div>
      {signing && (
        <Suspense fallback={null}>
        <SignaturePad
          onClose={() => setSigning(false)}
          onSave={(png) => {
            setF((p) => ({ ...p, signature: png, signedAt: new Date().toISOString(), signDate: fmtDate(new Date()) }))
            setSigning(false)
          }}
        />
        </Suspense>
      )}
    </Card>
  )
}
