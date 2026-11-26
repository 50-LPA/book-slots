import { Component, Suspense, lazy, useEffect, useState } from 'react'
import CandidateList from './CandidateList.jsx'
import { Loading, Page } from './ui.jsx'
import { Toaster, ask, toast } from './toast.jsx'
import { titleCase } from './options.js'
import { leaveFreely, mayLeave, navigated } from './unsaved.js'
import { DRAFT, cached, findByPhone, firstSyncDone, getCandidate, getResume, removeCandidate, saveCandidate, saveResume, synced, useCandidates } from './data.js'

// Profile page (form, timeline, signature pad) loads in its own file; fetched in the background when the app opens.
const loadForm = () => import('./ProfileForm.jsx')
const ProfileForm = lazy(loadForm)
const ResumeEditor = lazy(() => import('./ResumeEditor.jsx')) // resume builder: own file, loaded on first open

// Pages live in the URL hash: #/ or #/candidates[?filters] (list), #/new, #/c/<id> (edit), #/c/<id>/view, #/r/<id> (resume)
const go = (hash) => (window.location.hash = hash)
// A page change away from unsaved edits asks first (unsaved.js); "Stay" puts the old address back.
function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    let current = window.location.hash || '#/'
    const on = async () => {
      const next = window.location.hash || '#/'
      if (next === current) return
      if (!(await mayLeave())) return window.history.replaceState(null, '', current)
      navigated()
      current = next
      setHash(next)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// Pages load their code in separate files. After a new deploy an open tab may ask for files that no longer exist,
// and any render error would otherwise leave a blank screen: show a message with a Reload button instead.
class PageError extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const updated = /dynamically imported module|module script|Loading chunk/i.test(error.message)
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center font-lato shadow-sm">
        <p className="text-base font-bold text-gray-900">{updated ? 'The app was updated' : 'Something went wrong on this page'}</p>
        <p className="mt-1 text-sm text-gray-500">{updated ? 'Reload to get the latest version.' : error.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 h-9 rounded-full bg-gray-800 px-5 text-sm font-bold text-white hover:bg-gray-900">Reload</button>
      </div>
    )
  }
}

// Loads a saved candidate (id) or starts a blank one (id undefined), and saves it.
function CandidatePage({ id, view, prefill }) {
  const [record, setRecord] = useState(() => (id ? (firstSyncDone() && cached(id)) || null : undefined))
  const [error, setError] = useState('')

  // From the synced copy (no read); fetched on its own only when the copy doesn't have it (e.g. the sync failed).
  useEffect(() => {
    if (!id || record) return
    synced()
      .then(() => cached(id) ?? getCandidate(id))
      .then((r) => (r ? setRecord(r) : setError('This candidate was not found.')))
      .catch((err) => setError(err.message))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolves true when saved (the form then shows "Saved"), false when the user chose something else.
  const save = async (f) => {
    // Same phone number already saved for someone else? Offer to open that record instead.
    const other = f.phone && (await findByPhone(f.phone, id))
    if (other) {
      const choice = await ask({
        title: 'Phone number already saved',
        message: `${other.name || 'Another candidate'} is already saved with phone ${f.phone}.`,
        buttons: [{ label: 'Open that record', value: 'open' }, { label: 'Save anyway', value: 'save', tone: 'plain' }, { label: 'Cancel', value: null, tone: 'plain' }],
      })
      if (choice === 'open') go(`#/c/${other.id}`)
      if (choice !== 'save') return false
    }
    const newId = await saveCandidate(id, f)
    toast(`${titleCase(f.name)} saved.`)
    if (!id) { leaveFreely(); window.location.replace(`#/c/${newId}`) }
    return true
  }

  if (error) return <p className="p-6 font-lato text-red-600">{error} <a href="#/candidates" className="underline">Back to list</a></p>
  if (record === null) return <Loading />
  return (
    <Page>
      <Suspense fallback={<Loading />}>
      <ProfileForm
        record={record}
        prefill={prefill}
        readOnly={view}
        onEdit={() => go(`#/c/${id}`)}
        onSave={save}
        onBack={() => window.history.length > 1 ? window.history.back() : go('#/candidates')}
        onDelete={id && (async () => { if (await removeCandidate(id, record.name)) { leaveFreely(); go('#/candidates') } })}
        onResume={id && record.phase === 'confirmed' && (() => go(`#/r/${id}`))} // resumes only after admission is confirmed
      />
      </Suspense>
    </Page>
  )
}

// A candidate's resume: the candidate comes from the synced copy; the resume is read only if one was saved.
function ResumePage({ id }) {
  const [data, setData] = useState(null) // { candidate, resume }
  const [error, setError] = useState('')
  useEffect(() => {
    synced()
      .then(() => cached(id) ?? getCandidate(id))
      .then(async (candidate) => (candidate ? setData({ candidate, resume: candidate.hasResume ? await getResume(id) : null }) : setError('This candidate was not found.')))
      .catch((err) => setError(err.message))
  }, [id])
  if (error) return <p className="p-6 font-lato text-red-600">{error} <a href="#/candidates" className="underline">Back to profiles</a></p>
  if (!data) return <Loading />
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <ResumeEditor candidate={data.candidate} resume={data.resume} onSave={(r) => saveResume(id, r)} draftKey={DRAFT + id}
          onBack={() => (window.history.length > 1 ? window.history.back() : go('#/candidates'))} />
      </Suspense>
    </Page>
  )
}

// Admission profiles (inquiries and confirmed admissions) stand on their own: no login account is needed to be listed.
function ListPage() {
  return <Page><CandidateList {...useCandidates()} /></Page>
}

// The Admission Profiles tab of the admin dashboard (AdminDashboard picks the tab from the hash; its header,
// navigation and logout are used here). Pages live in the URL hash, as listed at the top of this file.
export default function ProfileApp() {
  const hash = useHash()
  useEffect(() => { synced(); loadForm() }, []) // sync once per session; warm the profile page
  const [, id, view] = hash.match(/^#\/c\/([^/]+)(\/view)?/) ?? []
  const [, resumeId] = hash.match(/^#\/r\/([^/?]+)/) ?? []
  const [, newPhone] = hash.match(/^#\/new\?phone=(\d{10})$/) ?? []
  const [, mobile, toResume] = hash.match(/^#\/m\/(\d{10})(\/resume)?/) ?? []
  const page = mobile ? <ByMobile key={hash} mobile={mobile} resume={!!toResume} />
    : resumeId ? <ResumePage key={hash} id={resumeId} />
    : id || hash.startsWith('#/new') ? <CandidatePage key={hash} id={id} view={!!view} prefill={newPhone && { phone: newPhone }} />
    : <ListPage />
  return (
    <div className="sp-root font-lato text-sm">
      <PageError key={hash}>{page}</PageError>
      <Toaster />
    </div>
  )
}

// #/m/<mobile>[/resume] (links from the book-slots candidate list): edits the profile saved with that mobile, or its
// resume once admission is confirmed; no profile yet → a new one with that mobile.
function ByMobile({ mobile, resume }) {
  useEffect(() => {
    synced().then(() => findByPhone(mobile)).then((r) => window.location.replace(
      !r ? `#/new?phone=${mobile}` : resume && r.phase === 'confirmed' ? `#/r/${r.id}` : `#/c/${r.id}`))
  }, [mobile, resume])
  return <Loading />
}
