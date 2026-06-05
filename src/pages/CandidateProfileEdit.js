import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';

function normaliseTechs(value) {
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function CandidateProfileEditForm({ userName = '', onBack }) {
  const session = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('sb_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const mobile = String(session?.mobile || '').trim();
  const displayName = userName || session?.name || 'Candidate';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [candidateDocId, setCandidateDocId] = useState('');
  const [form, setForm] = useState({
    experience: '',
    technologyInput: '',
  });

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError('');
        if (!mobile) return;

        const q = query(collection(db, 'candidates'), where('mobile', '==', mobile));
        const snap = await getDocs(q);
        if (snap.empty) {
          if (!cancelled) setError('Candidate profile not found.');
          return;
        }

        const d = snap.docs[0];
        const data = d.data() || {};
        const techs = Array.isArray(data.technologies)
          ? data.technologies
          : Array.isArray(data.technology)
            ? data.technology
            : String(data.technology || '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);

        if (!cancelled) {
          setCandidateDocId(d.id);
          setForm({
            experience: String(data.experience || '').trim(),
            technologyInput: techs.join(', '),
          });
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [mobile, session?.name]);

  const onSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      if (!candidateDocId) throw new Error('Candidate profile not found.');

      const technologies = normaliseTechs(form.technologyInput);
      await updateDoc(doc(db, 'candidates', candidateDocId), {
        experience: form.experience.trim(),
        technologies,
        technology: technologies.join(', '),
      });

      try {
        sessionStorage.setItem(
          'sb_user',
          JSON.stringify({
            ...session,
            technologies,
          }),
        );
      } catch {
        // ignore session write errors
      }

      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSave}
      className="bg-white rounded-2xl shadow-md border border-slate-200 px-4 py-4 sm:px-6 sm:py-6"
    >
      <div className="mb-3 flex items-center justify-between">
        {typeof onBack === 'function' ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Back to dashboard"
          >
            <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
          </button>
        ) : (
          <div className="w-8" />
        )}
        <h1 className="text-sm sm:text-base font-semibold text-purple-600 text-center">
          Edit {displayName}
        </h1>
        <div className="w-8" />
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Loading profile...</p>
      ) : (
        <>
          {error ? <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {success ? <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 mt-10">
            <div className="flex flex-col gap-1 md:col-span-1">
              <label className="text-xs sm:text-sm font-semibold text-slate-700">
                <span className="text-red-500">*</span> Technology
              </label>
              <input
                type="text"
                value={form.technologyInput}
                onChange={(e) => setForm((prev) => ({ ...prev, technologyInput: e.target.value }))}
                className="w-full rounded border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-1">
              <label className="text-xs sm:text-sm font-semibold text-slate-700">
                <span className="text-red-500">*</span> Experience
              </label>
              <input
                type="text"
                value={form.experience}
                onChange={(e) => setForm((prev) => ({ ...prev, experience: e.target.value }))}
                className="w-full rounded border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className="fa-solid fa-pen-to-square text-[11px]" aria-hidden="true" />
              {saving ? 'Updating...' : 'Update Candidate'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function CandidateProfileEdit() {
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-4 sm:px-5">
      <CandidateProfileEditForm />
    </div>
  );
}
