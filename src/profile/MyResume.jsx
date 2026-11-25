// Candidate's own resume ("My Resume" tab of the candidate dashboard): the same editor and preview the admin uses,
// filled in for the logged-in candidate. Linked by mobile: admissionProfiles.phone == the login mobile; resumes/{profile id}.
import { Suspense, lazy, useEffect, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore/lite'
import { normalizeMobile } from '../firebase/firebase'
import { db, withTimeout } from './firebase.js'
import { getMine, getResume, rememberMine, saveResume } from './data.js'
import { TECH, titleCase } from './options.js'
import { Card, Loading } from './ui.jsx'
import { Toaster } from './toast.jsx'
import { isQuotaError } from '../utils/quota'
const ResumeEditor = lazy(() => import('./ResumeEditor.jsx'))

const DRAFT = 'admission-profile:my-resume-draft:'
// Book-slots technology names → the resume's ("Java" → "JAVA", ".Net" → ".NET"); unknown ones are left out.
const toTech = (list = []) => [...new Set(list.map((t) => TECH.find((x) => x.toLowerCase() === String(t).trim().toLowerCase())).filter(Boolean))]

// candidate: the book-slots candidate record (name, mobile, technologies), used when no profile exists yet.
export default function MyResume({ mobile, candidate, onBack }) {
  const phone = normalizeMobile(mobile).slice(-10)
  const [data, setData] = useState(null) // { profile, resume }; profile null = not created yet
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      // Shared with the Admission Profile tab, and resumes are kept once read: reopening this tab costs no reads.
      const profile = await getMine(phone)
      setData({ profile, resume: profile?.hasResume ? await getResume(profile.id) : null })
    })().catch((err) => setError(isQuotaError(err) ? 'quota' : err.message))
  }, [phone])

  // First save without a profile: create a minimal one (name + mobile) so the resume is linked and the admin sees it.
  // Confirmed, since only candidates whose admission was confirmed get a login account (Candidates list).
  const save = (resume) => saveMine(resume).catch((err) => {
    throw isQuotaError(err) ? new Error('Please try again later.') : err // no limit wording for candidates
  })
  const saveMine = async (resume) => {
    let profile = data.profile
    if (!profile) {
      const name = titleCase(resume.name || candidate?.name || 'Candidate')
      const id = (await withTimeout(addDoc(collection(db, 'admissionProfiles'), { name, phone, phase: 'confirmed', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))).id
      profile = { id, name, phone, phase: 'confirmed', visitDates: [], companies: [] }
      setData((v) => ({ ...v, profile }))
    }
    await saveResume(profile.id, resume)
    rememberMine(phone, { ...profile, hasResume: true }) // reopening the tab shows this resume from the session copy
  }

  // The logged-in candidate's own details (book-slots login record) on top of their saved profile (jobs, pass-out year).
  // "Pull from profile" in the editor copies these into the resume, including email and technology stack.
  const loginTech = toTech(candidate?.technologies)
  const person = data && {
    companies: [],
    ...data.profile,
    name: titleCase(candidate?.name || data.profile?.name),
    phone,
    email: String(candidate?.email ?? '').trim(),
    tech: loginTech.length ? loginTech : data.profile?.tech,
    syncStack: true,
  }
  return (
    <div className="sp-root font-lato text-sm">
      {/* The daily database limit is an admin matter: no error wording for candidates. */}
      {error === 'quota' ? <Card><p className="text-sm text-slate-500">Your resume will be available shortly. Please check back later.</p></Card>
        : error ? <Card><p className="text-sm text-red-600">Could not load your resume: {error}</p></Card>
        : !data ? <Loading />
        : (
          <Suspense fallback={<Loading />}>
            <ResumeEditor candidate={person} resume={data.resume} onSave={save} onBack={onBack} draftKey={DRAFT + phone} />
          </Suspense>
        )}
      <Toaster />
    </div>
  )
}
