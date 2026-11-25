import { gapDates, gaps, layout, monthLabel, span, toIdx, totalMonths } from './career.js'
import { ICONS, Icon } from './icons.jsx'
import { Button } from './ui.jsx'
import { PASS_OUTS } from './options.js'

const COLORS = [
  'border-brand-400 bg-brand-50 text-brand-900',
  'border-sky-400 bg-sky-50 text-sky-900',
  'border-emerald-400 bg-emerald-50 text-emerald-900',
  'border-amber-400 bg-amber-50 text-amber-900',
  'border-rose-400 bg-rose-50 text-rose-900',
]

const short = (i) => monthLabel(i).replace(/ \d\d(\d\d)$/, " '$1") // "Jul 2026" → "Jul '26"
// Gaps: red dashed outline over light red stripes, so they read as "nothing here" next to the solid company blocks.
const GAP = { backgroundImage: 'repeating-linear-gradient(135deg, #fee2e2 0 1.2mm, #fff 1.2mm 2.4mm)' }

const Chip = ({ className = 'border-gray-200 bg-gray-50 text-gray-700', children }) => (
  <span className={`whitespace-nowrap rounded-full border px-[2mm] py-[0.3mm] text-[7.5pt] ${className}`}>{children}</span>
)

// Drawn on the A4 sheet, in the 41mm free space: summary chips, then company/gap blocks on a line with years under it.
// Phones: full width (no sideways scroll) plus a list of every block, since blocks get too thin for their text.
export function CareerTimeline({ passOut, companies }) {
  const t = layout(passOut, companies)
  if (!t) return (
    <p className="flex h-[40mm] shrink-0 items-center justify-center text-center text-[9pt] text-gray-300 mobile:h-auto mobile:py-4">
      Add pass-out and company details to draw the career timeline here.
    </p>
  )
  const gapTotal = t.gaps.reduce((sum, g) => sum + g.months, 0)
  const exp = totalMonths(companies)
  const current = t.jobs.find((j) => j.present)
  const rows = [...t.jobs.map((j, i) => ({ ...j, color: COLORS[i % COLORS.length] })), ...t.gaps.map((g) => ({ ...g, gap: true }))]
    .sort((a, b) => a.from - b.from)
  return (
    <div className="flex h-[40mm] shrink-0 flex-col mobile:h-auto">
      <div className="flex flex-wrap items-center gap-[1.5mm]">
        <b className="mr-[1mm] text-[9pt]">CAREER TIMELINE</b>
        {t.passOut && <Chip className="border-brand-300 bg-brand-50 text-brand-800">🎓 Pass-out <b>{t.passOut.label}</b></Chip>}
        {exp !== null && <Chip>Experience <b>{span(exp)}</b> · {t.jobs.length} {t.jobs.length === 1 ? 'company' : 'companies'}</Chip>}
        {current && <Chip className="border-emerald-300 bg-emerald-50 text-emerald-800">Now at <b>{current.name || 'Company'}</b></Chip>}
        {gapTotal > 0
          ? <Chip className="border-red-300 bg-red-50 text-red-700">Career gap <b>{span(gapTotal)}</b>{t.gaps.length > 1 ? ` (${t.gaps.length} gaps)` : ''}</Chip>
          : <Chip className="border-emerald-300 bg-emerald-50 text-emerald-800">✓ No career gaps</Chip>}
      </div>

      {/* track: top margin leaves room for narrow-gap callouts; edge labels hang into the sheet padding */}
      <div className="relative mt-[7mm] h-[20mm] shrink-0">
        {t.passOut && (
          <div className="absolute top-0 h-[14mm] -translate-x-1/2 border-l-[0.4mm] border-dashed border-brand-500" style={{ left: `${t.passOut.left}%` }} />
        )}
        {t.gaps.map((g) => {
          const dates = gapDates(g, short)
          const narrow = g.width < 8 // too thin for text inside: label goes in a callout above the block
          const mid = g.left + g.width / 2
          // ponytail: callouts of two narrow gaps close together can overlap; stack them if that shows up in real data.
          return (
            <div key={`gap-${g.from}`}>
              <div
                title={`Gap · ${gapDates(g)} · ${span(g.months)}`}
                className="absolute top-0 flex h-[14mm] min-w-[3mm] flex-col justify-center overflow-hidden rounded-[1.5mm] border border-dashed border-red-400 px-[1.5mm] text-center leading-tight text-red-700 hover:border-solid hover:border-red-600"
                style={{ ...GAP, left: `${g.left}%`, width: `${g.width}%` }}
              >
                {!narrow && <>
                  <span className="truncate text-[8pt] font-bold">Gap · {span(g.months)}</span>
                  <span className="truncate text-[6.5pt]">{dates}</span>
                </>}
              </div>
              {narrow && (
                <span className="absolute -top-[5.5mm] whitespace-nowrap rounded-full border border-red-300 bg-red-50 px-[1.5mm] text-[7pt] leading-[4mm] text-red-700"
                  style={{ left: `${mid}%`, transform: `translateX(${mid > 85 ? '-100%' : mid < 15 ? '0' : '-50%'})` }}>
                  <b>Gap {span(g.months)}</b> · {dates}
                </span>
              )}
            </div>
          )
        })}
        {t.jobs.map((j, i) => (
          <div
            key={i}
            title={`${j.name} · ${monthLabel(j.from)} – ${j.present ? 'Present' : monthLabel(j.to)} · ${span(j.months)}`}
            className={`absolute top-0 flex h-[14mm] min-w-[3mm] flex-col justify-center overflow-hidden rounded-[1.5mm] border px-[1.5mm] text-center leading-tight ${COLORS[i % COLORS.length]}`}
            style={{ left: `${j.left}%`, width: `${j.width}%` }}
          >
            <span className="truncate text-[8.5pt] font-bold">{j.name || 'Company'}</span>
            <span className="truncate text-[6.5pt]">{short(j.from)} – {j.present ? 'Now' : short(j.to)}</span>
            <span className="truncate text-[6.5pt] font-bold opacity-70">{span(j.months)}</span>
          </div>
        ))}

        <div className="absolute inset-x-0 top-[15mm] h-[0.5mm] rounded bg-gray-800" />
        {t.years.map((y) => (
          <div key={y.year} className="absolute top-[15mm] -translate-x-1/2 text-center" style={{ left: `${y.left}%` }}>
            <div className="mx-auto h-[1.5mm] w-[0.3mm] bg-gray-800" />
            <span className="text-[7pt] leading-none text-gray-600">{y.year}</span>
          </div>
        ))}
        {t.passOut && (
          <div title={`Pass-out · ${t.passOut.label}`} className="absolute top-[13.25mm] z-10 h-[4mm] w-[4mm] -translate-x-1/2 rounded-full border-[0.8mm] border-white bg-brand-600 shadow-[0_0_0_0.5mm_theme(colors.purple.600),0_0_0_1.2mm_theme(colors.purple.200)]" style={{ left: `${t.passOut.left}%` }} />
        )}
      </div>

      <ol className="mt-3 hidden divide-y divide-gray-100 text-[13px] mobile:block">
        {rows.map((r) => (
          <li key={`${r.gap ? 'g' : 'j'}-${r.from}-${r.name ?? ''}`} className={`flex items-center gap-2 py-1.5 ${r.gap ? 'text-red-700' : ''}`}>
            <span className={`h-3 w-3 shrink-0 rounded-sm border ${r.gap ? 'border-dashed border-red-400' : r.color}`} style={r.gap ? GAP : undefined} />
            <span className="min-w-0 flex-1 truncate font-bold">{r.gap ? 'Gap' : r.name || 'Company'}</span>
            <span className="whitespace-nowrap text-gray-500">{r.gap ? gapDates(r, short) : `${short(r.from)} – ${r.present ? 'Now' : short(r.to)}`}</span>
            <span className="w-14 shrink-0 text-right font-bold">{span(r.months)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const input = 'h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400'
// Narrow: "# name ×" then "joining exit present" below. Wide (@xl): # · name · joining · exit · present · ×.
const row = 'grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-1.5 @xl:grid-cols-[20px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_44px_24px]'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const FIRST_YEAR = 1990 // HSC pass-outs of experienced candidates go back this far
const YEARS = Array.from({ length: new Date().getFullYear() - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i)) // 1990 → this year

// Month dropdown then year dropdown, stored as "YYYY-MM" (half-filled stays "YYYY-" / "-MM" and is ignored by the timeline).
function MonthYear({ value = '', onChange, label, disabled, invalid }) {
  const [y = '', m = ''] = value.split('-')
  const put = (yy, mm) => onChange(yy || mm ? `${yy}-${mm}` : '')
  const half = !disabled && !y !== !m // only one of month/year picked: not counted anywhere until both are set
  const cls = `${input} select-sm px-1.5 ${invalid || half ? 'border-red-400 text-red-600' : ''}`
  return (
    <span className="grid grid-cols-2 gap-1" title={half ? 'Pick both month and year' : invalid ? 'Exit date is before the joining date' : undefined}>
      <select value={disabled ? '' : m} disabled={disabled} onChange={(e) => put(y, e.target.value)} aria-label={`${label} month`} className={cls}>
        <option value="">{disabled ? '—' : 'Month'}</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
      </select>
      <select value={disabled ? '' : y} disabled={disabled} onChange={(e) => put(e.target.value, m)} aria-label={`${label} year`} className={cls}>
        <option value="">{disabled ? '—' : 'Year'}</option>
        {YEARS.map((yr) => <option key={yr}>{yr}</option>)}
      </select>
    </span>
  )
}

// Side panel next to the sheet: any number of pass-outs (type + month/year) and companies.
// passOut = the latest pass-out (worked out by the form), where the career timeline and gaps start.
export function CareerFields({ passOuts, passOut, companies, onPassOuts, onCompanies }) {
  const updatePassOut = (i, patch) => onPassOuts(passOuts.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const update = (i, patch) => onCompanies(companies.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  // Only one company can be the current one; clicking the selected radio again clears it.
  const setPresent = (i) => onCompanies(companies.map((c, j) => ({ ...c, present: j === i ? !c.present : false })))
  return (
    <div className="space-y-4 font-lato">
      {/* One pass-out is required, so the first row is always there (no ×); + on the last row adds another. */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-gray-600"><span className="text-red-500">*</span> Pass-outs</span>
        {(passOuts.length ? passOuts : [{ type: '', date: '' }]).map((p, i, rows) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] items-center gap-2">
            <select value={p.type} onChange={(e) => (passOuts.length ? updatePassOut(i, { type: e.target.value }) : onPassOuts([{ ...p, type: e.target.value }]))}
              aria-label={`Pass-out ${i + 1} type`} className={`${input} select-sm px-1.5 ${p.type ? '' : 'text-gray-400'}`}>
              <option value="">Type</option>
              {PASS_OUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <MonthYear value={p.date} onChange={(v) => (passOuts.length ? updatePassOut(i, { date: v }) : onPassOuts([{ ...p, date: v }]))} label={`Pass-out ${i + 1}`} />
            <button type="button" aria-label={`Remove pass-out ${i + 1}`} title="Remove" disabled={i === 0}
              onClick={() => onPassOuts(passOuts.filter((_, j) => j !== i))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:invisible">
              <Icon d={ICONS.close} className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Add a pass-out" title="Add a pass-out"
              onClick={() => onPassOuts([...(passOuts.length ? passOuts : [p]), { type: '', date: '' }])}
              className={`flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500 text-emerald-600 hover:bg-emerald-50 ${i === rows.length - 1 ? '' : 'invisible'}`}>
              <Icon d={ICONS.plus} className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-600">Company details ({companies.length})</span>
        <Button size="sm" icon={ICONS.plus} onClick={() => onCompanies([...companies, { name: '', from: '', to: '', present: false }])}>Add company</Button>
      </div>

      {companies.length === 0 && <p className="py-2 text-xs text-gray-400">No companies yet. Click “Add company”.</p>}

      {/* One compact row per company; column labels shown once. Falls back to three lines when the panel is narrow. */}
      {companies.length > 0 && (
        <div className="@container">
          <div className={`${row} hidden border-b border-gray-200 pb-1 text-[11px] font-bold text-gray-500 @xl:grid`}>
            <span>#</span><span>Company name</span><span>Joining</span><span>Exit</span><span className="text-center">Present</span><span />
          </div>
          <div>
            {companies.map((c, i) => {
              const badExit = !c.present && toIdx(c.to) !== null && toIdx(c.from) !== null && toIdx(c.to) < toIdx(c.from)
              return (
                <div key={i} className={`${row} border-b border-gray-100 py-2 ${badExit ? 'bg-red-50' : ''}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-600">{i + 1}</span>
                  <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Company name" aria-label={`Company ${i + 1} name`} className={`${input} col-span-2 @xl:col-span-1`} />
                  <span className="col-span-2 col-start-1 row-start-2 @xl:col-span-1 @xl:col-auto @xl:row-auto">
                    <span className="mb-0.5 block text-[11px] font-bold text-gray-500 @xl:hidden">Joining</span>
                    <MonthYear value={c.from} onChange={(v) => update(i, { from: v })} label={`Company ${i + 1} joining`} />
                  </span>
                  <span className="col-span-2 col-start-3 row-start-2 @xl:col-span-1 @xl:col-auto @xl:row-auto">
                    <span className="mb-0.5 block text-[11px] font-bold text-gray-500 @xl:hidden">Exit</span>
                    <MonthYear value={c.to} onChange={(v) => update(i, { to: v })} label={`Company ${i + 1} exit`} disabled={c.present} invalid={badExit} />
                  </span>
                  <label className="col-span-3 col-start-2 row-start-3 @xl:col-span-1 @xl:col-auto @xl:row-auto flex items-center gap-1 @xl:justify-center text-[11px] text-gray-600" title="Currently working here">
                    <input type="radio" name="present-company" checked={!!c.present} onChange={() => {}} onClick={() => setPresent(i)} className="accent-brand-600" />
                    <span className="@xl:hidden">Currently working here (Present)</span>
                  </label>
                  <button type="button" aria-label={`Remove company ${i + 1}`} title="Remove"
                    onClick={() => onCompanies(companies.filter((_, j) => j !== i))}
                    className="col-start-4 row-start-1 @xl:col-auto @xl:row-auto flex h-6 w-6 items-center justify-center justify-self-end rounded-md border border-red-500 bg-white text-red-500 hover:bg-red-50">
                    <Icon d={ICONS.trash} className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <GapList passOut={passOut} companies={companies} />
    </div>
  )
}

// Side-panel list of gaps with start, end and length (narrow gaps are hard to read on the timeline).
function GapList({ passOut, companies }) {
  const list = gaps(passOut, companies)
  if (!list.length) return passOut || companies.some((c) => c.from) ? <p className="text-xs text-emerald-700">✓ No career gaps</p> : null
  const total = list.reduce((sum, g) => sum + g.months, 0)
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
      <p className="mb-1.5 flex justify-between text-xs font-bold text-red-700">
        <span>Career gaps ({list.length})</span><span>Total {span(total)}</span>
      </p>
      {list.map((g, i) => (
        <p key={g.from} className="flex justify-between border-t border-red-100 py-1 text-[12px] text-red-700">
          <span>{i + 1}. {gapDates(g)}{g.ongoing ? ' (not working)' : ''}</span>
          <span className="font-bold">{span(g.months)}</span>
        </p>
      ))}
    </div>
  )
}
