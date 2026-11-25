// Candidate's own admission profile ("Admission Profile" tab of the candidate dashboard): the A4 sheet the admin
// fills in, view only. Linked by mobile: admissionProfiles.phone == the login mobile (read once per page load, shared with My Resume).
import { Suspense, lazy, useEffect, useState } from 'react'
import { normalizeMobile } from '../firebase/firebase'
import { getMine } from './data.js'
import { Card, Loading } from './ui.jsx'
import { isQuotaError } from '../utils/quota'
const ProfileForm = lazy(() => import('./ProfileForm.jsx'))

export default function MyAdmissionProfile({ mobile, onBack }) {
  const phone = normalizeMobile(mobile).slice(-10)
  const [record, setRecord] = useState() // undefined = loading, null = none yet
  const [error, setError] = useState('')

  useEffect(() => {
    getMine(phone)
      .then(setRecord)
      .catch((err) => setError(isQuotaError(err) ? 'quota' : err.message))
  }, [phone])

  return (
    <div className="sp-root font-lato text-sm">
      {/* The daily database limit is an admin matter: no error wording for candidates. */}
      {error === 'quota' ? <Card><p className="text-sm text-slate-500">Your admission profile will be available shortly. Please check back later.</p></Card>
        : error ? <Card><p className="text-sm text-red-600">Could not load your admission profile: {error}</p></Card>
        : record === undefined ? <Loading />
        : record === null ? <Card><p className="text-sm text-slate-500">Your admission profile hasn't been created yet. Please contact admin.</p></Card>
        : (
          <Suspense fallback={<Loading />}>
            <ProfileForm record={record} readOnly mine onBack={onBack} />
          </Suspense>
        )}
    </div>
  )
}
