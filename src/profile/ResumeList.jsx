import { useState } from 'react'
import { ICONS } from './icons.jsx'
import { isQuotaError } from '../utils/quota'
import { Card, CardHeader, CircleButton, FilterSelect, IconAction, Pill, SearchInput } from './ui.jsx'
import { PHASE_TONE, phaseLabel, resumeSaved } from './options.js'
import { paginate } from './list.js'
import PaginationBar from '../Components/PaginationBar'
import StatCounts from '../Components/StatCounts'

const go = (hash) => (window.location.hash = hash)
const th = 'border border-slate-200 px-3 py-2 font-semibold text-slate-600'
const td = 'border border-slate-200 px-3 py-2'
const STATUS = [['all', 'All resumes'], ['ready', 'Ready'], ['none', 'Not started']]

// Resumes tab: only candidates whose admission is confirmed (phase "Confirmed" in their profile), with their resume
// status; opening one builds or edits their resume (#/r/<id>).
export default function ResumeList({ rows: allRows, error, refreshing, refresh }) {
  const rows = allRows && allRows.filter((r) => r.phase === 'confirmed')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const reset = (fn) => (v) => { fn(v); setPage(1) } // any filter change goes back to page 1
  const term = q.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) =>
    (!term || r.name?.toLowerCase().includes(term) || r.phone?.includes(term)) &&
    (status === 'all' || (status === 'ready') === !!r.hasResume))
  const pg = paginate(shown, page, size)
  const made = (rows ?? []).filter((r) => r.hasResume).length
  const badge = (r) => (r.hasResume ? <Pill tone="green">Ready</Pill> : <Pill tone="amber">Not started</Pill>)
  const open = (r) => <IconAction icon={r.hasResume ? ICONS.pencil : ICONS.plus} tone={r.hasResume ? 'amber' : 'emerald'} label={`${r.hasResume ? 'Edit' : 'Build'} resume of ${r.name}`} onClick={() => go(`#/r/${r.id}`)} />

  return (
    <Card>
      <CardHeader
        onBack={() => window.history.back()}
        icon={ICONS.document}
        title="Resume Builder"
        extra={<CircleButton icon={ICONS.refresh} label="Refresh list" onClick={refresh} disabled={refreshing} dim={refreshing} />}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatCounts gap="gap-2" className="mr-auto" items={[['Total', rows?.length], ['Ready', rows && made, 'green'], ['Not started', rows && rows.length - made, 'amber']]} />
        <FilterSelect label="Resume status" value={status} onChange={reset(setStatus)} options={STATUS} className="md:w-36" />
        <SearchInput label="Search candidates" value={q} onChange={reset(setQ)} placeholder="Name or phone..." className="md:w-52" />
      </div>

      {/* With the saved copy on screen, only a real problem is worth a red box; the quota banner covers the daily limit. */}
      {error && !(rows && isQuotaError(error)) && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">Could not load candidates: {error}</p>}
      {!rows && !error && <p className="mt-4 text-center text-sm text-gray-500">Loading…</p>}
      {rows && (
        <>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-center text-xs text-slate-700 sm:text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${th} w-10`}>Sr.</th>
                  <th className={`${th} text-left`}>Candidate Name</th>
                  <th className={th}>Phone</th>
                  <th className={th}>Career Technology</th>
                  <th className={th}>Phase</th>
                  <th className={th}>Resume</th>
                  <th className={th}>Last Saved</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-brand-50/30">
                    <td className={td}>{pg.first + i}</td>
                    <td className={`${td} text-left`}><a href={`#/c/${r.id}/view`} className="hover:text-brand-600 hover:underline">{r.name || '-'}</a></td>
                    <td className={td}>{r.phone || '-'}</td>
                    <td className={td}>{r.tech?.length ? r.tech.join(', ') : '-'}</td>
                    <td className={td}><Pill tone={PHASE_TONE[r.phase]}>{phaseLabel(r)}</Pill></td>
                    <td className={td}>{badge(r)}</td>
                    <td className={td}>{resumeSaved(r) || '-'}</td>
                    <td className={td}><div className="flex justify-center">{open(r)}</div></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} className={`${td} py-8 text-gray-500`}>{rows.length ? 'No candidate matches these filters.' : 'No confirmed candidates yet. Confirm a candidate\'s admission in the Profiles tab.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-2 md:hidden">
            {pg.items.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">{r.name || '-'}</p>
                  <p className="text-xs text-gray-500">{r.phone || 'No phone'}{r.tech?.length ? ` · ${r.tech.join(', ')}` : ''}</p>
                  {resumeSaved(r) && <p className="text-xs text-gray-400">Saved {resumeSaved(r)}</p>}
                </div>
                {badge(r)}
                {open(r)}
              </li>
            ))}
            {shown.length === 0 && <li className="py-8 text-center text-sm text-gray-500">{rows.length ? 'No candidate matches these filters.' : 'No confirmed candidates yet.'}</li>}
          </ul>

          {shown.length > 0 && (
            <PaginationBar totalItems={shown.length} currentPage={pg.page} itemsPerPage={size} label="candidates" optionsPerPage={[25, 50, 100]}
              onPageChange={setPage} onItemsPerPageChange={reset(setSize)} />
          )}
        </>
      )}
    </Card>
  )
}
