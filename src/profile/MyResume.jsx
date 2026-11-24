// Candidate's own resume ("My Resume" tab of the candidate dashboard): the same editor and preview the admin uses,
// filled in for the logged-in candidate. Linked by mobile: profiles.phone == the login mobile; resumes/{profile id}.
import { Suspense, lazy, useEffect, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore/lite'
import { normalizeMobile } from '../firebase/firebase'
import { db, withTimeout } from './firebase.js'
import { saveResume } from './data.js'
import { TECH, titleCase } from './options.js'
import { Card, Loading } from './ui.jsx'
import { Toaster } from './toast.jsx'
import { isQuotaError } from '../utils/quota'
const ResumeEditor = lazy(() => import('./ResumeEditor.jsx'))

const DRAFT = 'slot-profile:my-resume-draft:'
// Book-slots technology names → the resume's ("Java" → "JAVA", ".Net" → ".NET"); unknown ones are left out.
const toTech = (list = []) => [...new Set(list.map((t) => TECH.find((x) => x.toLowerCase() === String(t).trim().toLowerCase())).filter(Boolean))]

// candidate: the book-slots candidate record (name, mobile, technologies), used when no profile exists yet.
export default function MyResume({ mobile, candidate, onBack }) {
  const phone = normalizeMobile(mobile).slice(-10)
  const [data, setData] = useState(null) // { profile, resume }; profile null = not created yet
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      // The query must filter on phone: firestore.rules let a candidate read only their own profile.
      const snap = await withTimeout(getDocs(query(collection(db, 'profiles'), where('phone', '==', phone), limit(1))))
      const d = snap.docs[0]
      if (!d) return setData({ profile: null, resume: null })
      const r = d.data().hasResume ? await withTimeout(getDoc(doc(db, 'resumes', d.id))) : null
      setData({ profile: { id: d.id, ...d.data(), name: titleCase(d.data().name) }, resume: r?.exists() ? r.data() : null })
    })().catch((err) => setError(isQuotaError(err) ? 'quota' : err.message))
  }, [phone])

  // First save without a profile: create a minimal one (name + mobile) so the resume is linked and the admin sees it.
  const save = (resume) => saveMine(resume).catch((err) => {
    throw isQuotaError(err) ? new Error('Please try again later.') : err // no limit wording for candidates
  })
  const saveMine = async (resume) => {
    let id = data.profile?.id
    if (!id) {
      const name = titleCase(resume.name || candidate?.name || 'Candidate')
      id = (await withTimeout(addDoc(collection(db, 'profiles'), { name, phone, phase: 'inquiry', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))).id
      setData((v) => ({ ...v, profile: { id, name, phone, phase: 'inquiry' } }))
    }
    await saveResume(id, resume)
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
