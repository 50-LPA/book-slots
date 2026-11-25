// Form inputs that cut down typing: suggestion boxes, month/year and score pickers, tap-to-add chips, "insert a line" pickers.
// Values stay plain text (see the format helpers in resume.js).
import { useId } from 'react'
import { MON, SCORE_UNITS, formatMonthYear, formatScore, parseMonthYear, parseScore, splitList, toggleInList } from './resume.js'

export const inp = 'mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
export const sel = 'rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-sm text-gray-800 outline-none focus:border-brand-400'
export const lbl = 'block text-xs text-gray-600'
export const addBtn = 'rounded-md border border-green-600 bg-white px-2.5 py-1 text-xs font-bold text-green-700 hover:bg-green-50 mobile:py-2'
// Collapsible form section (native <details>), with an optional count and hint. `id` is the jump-bar target.
export function Section({ id, title, count, hint, children }) {
  return (
    <details id={id} open className="group scroll-mt-16 border-t border-gray-100 pt-3 mt-4 first-of-type:mt-0 first-of-type:border-0 first-of-type:pt-0">
      <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block text-gray-400 group-open:rotate-90">▸</span>
        {title}
        {count !== undefined && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tracking-normal text-gray-600">{count}</span>}
        {hint && <span className="font-normal normal-case tracking-normal text-gray-400">{hint}</span>}
      </summary>
      {children}
    </details>
  )
}
// Free-text box; `options` adds a suggestion list (pick or keep typing); `problem` shows a gentle red hint under it.
export function Input({ label, value, onChange, options, problem, className = '', ...rest }) {
  const id = useId()
  const list = options?.filter(Boolean)
  return (
    <label className={`${lbl} ${className}`}>{label}
      <input className={inp} value={value ?? ''} onChange={(e) => onChange(e.target.value)} list={list?.length ? id : undefined} {...rest} />
      {list?.length > 0 && <datalist id={id}>{[...new Set(list)].map((o) => <option key={o} value={o} />)}</datalist>}
      {problem && <span className="text-[11px] text-red-600">{problem}</span>}
    </label>
  )
}
// "+ Insert …" picker under a textarea: choosing a line appends it.
export function InsertPicker({ options, onPick, label = '+ Insert a common line…' }) {
  if (!options.length) return null
  return (
    <select value="" onChange={(e) => e.target.value && onPick(e.target.value)} aria-label={label}
      className="mt-1 h-7 w-full rounded-md border border-dashed border-green-600 bg-white px-1.5 text-xs text-green-700 outline-none hover:bg-green-50 mobile:h-9">
      <option value="">{label}</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}
export const THIS_YEAR = new Date().getFullYear()
export const TODAY = new Date().toISOString().slice(0, 10)
export const YEARS = Array.from({ length: 50 }, (_, i) => String(THIS_YEAR + 1 - i))
// Month + year dropdowns ("Jan 2024", or just "2024"); `present` adds a Present tick for end dates.
// A value typed some other way before (e.g. "Summer 2019") shows as a text box with a reset.
export function MonthYear({ label, value, onChange, present, className = '' }) {
  const p = parseMonthYear(value)
  if (!p) return (
    <div className={`${lbl} ${className}`}>{label} <button type="button" onClick={() => onChange('')} className="text-brand-600 hover:underline">(use pickers)</button>
      <input className={inp} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
  return (
    <div className={`${lbl} ${className}`}>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {present && (
          <label className="flex items-center gap-1 font-bold text-gray-700">
            <input type="checkbox" checked={!!p.present} onChange={(e) => onChange(e.target.checked ? 'Present' : '')} className="accent-brand-600" /> Present
          </label>
        )}
      </div>
      {p.present
        ? <div className={`${inp} bg-gray-50 text-gray-500`}>Present</div>
        : <div className="mt-0.5 flex gap-1">
            <select aria-label={`${label} month`} value={p.m} onChange={(e) => onChange(formatMonthYear(e.target.value, p.y || (e.target.value ? String(THIS_YEAR) : '')))} className={`${sel} min-w-0 flex-1`}>
              <option value="">Month</option>
              {MON.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select aria-label={`${label} year`} value={p.y} onChange={(e) => onChange(formatMonthYear(e.target.value && p.m, e.target.value))} className={`${sel} min-w-0 flex-1`}>
              <option value="">Year</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>}
    </div>
  )
}
// Number + unit; the unit is guessed while typing (≤ 10 → CGPA, above → %) and can be changed.
export function Score({ label, value, onChange, className = '' }) {
  const p = parseScore(value)
  if (!p) return <Input label={label} value={value} onChange={onChange} className={className} />
  const typed = (n) => onChange(formatScore(n, !n ? '' : Number(n) > 10 ? '%' : p.unit || 'CGPA'))
  return (
    <div className={`${lbl} ${className}`}>{label}
      <div className="mt-0.5 flex gap-1">
        <input inputMode="decimal" placeholder="7.8 / 72" aria-label={label} value={p.n} onChange={(e) => typed(e.target.value.replace(/[^\d.]/g, ''))} className={`${inp} mt-0 min-w-0 flex-1`} />
        <select aria-label={`${label} unit`} value={p.unit} onChange={(e) => onChange(formatScore(p.n, e.target.value))} className={sel}>
          <option value="">—</option>
          {SCORE_UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
    </div>
  )
}
// Comma list with tap-to-toggle chips; the box above still takes anything typed.
export function Chips({ label, value, onChange, options, placeholder }) {
  const chosen = splitList(value).map((x) => x.toLowerCase())
  return (
    <div className={lbl}>{label}
      <input className={inp} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="mt-1 flex flex-wrap gap-1 mobile:gap-1.5">
        {options.map((o) => {
          const on = chosen.includes(o.toLowerCase())
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(toggleInList(value, o))}
              className={`rounded-full border px-2 py-0.5 text-[11px] mobile:px-3 mobile:py-1.5 mobile:text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-brand-300'}`}>
              {on ? '✓' : '+'} {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}
