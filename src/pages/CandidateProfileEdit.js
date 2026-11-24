import { isQuotaError } from '../utils/quota';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  SelectedFields,
  SelectedToggle,
  TechMultiSelect,
  selectionFormFromDoc,
  selectionPayload,
  validateSelection,
  SELECTION_FIELD_LABELS,
} from '../Components/CandidateSelectionFields';

export function CandidateProfileEditForm({ userName = '', hrs = [], onBack, onLogout }) {
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
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    experience: '',
    technology: [],
    ...selectionFormFromDoc(),
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
            technology: techs,
            ...selectionFormFromDoc(data),
          });
        }
      } catch (err) {
        // The daily database limit is an admin matter: candidates see no error for it.
        if (!cancelled && !isQuotaError(err)) setError(err?.message || 'Failed to load profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [mobile, session?.name]);

  const validate = () => {
    if (!candidateDocId) return 'Candidate profile not found.';
    const experience = form.experience.trim();
    if (!form.technology.length) return 'Select at least one technology.';
    if (!/^\d+(\.\d{1,2})?$/.test(experience) || parseFloat(experience) > 20) {
      return 'Experience must be a number between 0 and 20 with at most two decimal places.';
    }
    return form.selected ? validateSelection(form) : '';
  };

  const persist = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const technologies = form.technology;
      await updateDoc(doc(db, 'candidates', candidateDocId), {
        experience: form.experience.trim(),
        technologies,
        technology: technologies.join(', '),
        ...selectionPayload(form),
        // Selected candidates are deactivated and can no longer log in.
        ...(form.selected && { isActive: false, status: 'Inactive' }),
        updatedAt: serverTimestamp(),
      });

      if (form.selected) {
        onLogout?.();
        return;
      }

      try {
        sessionStorage.setItem('sb_user', JSON.stringify({ ...session, technologies }));
      } catch {
        // ignore session write errors
      }
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setShowPreview(false);
      setError(isQuotaError(err) ? 'Failed to update profile. Please try again later.' : err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const onSave = (e) => {
    e.preventDefault();
    setSuccess('');
    const msg = validate();
    setError(msg);
    if (msg) return;
    if (form.selected) setShowPreview(true);
    else persist();
  };

  const previewRows = [
    ['Technology', form.technology.join(', ')],
    ['Experience', `${form.experience} years`],
    ...SELECTION_FIELD_LABELS.map(([k, label]) => {
      if (k === 'package') return [label, `${form[k]} LPA`];
      if (k === 'selectedDate' || k === 'joiningDate') {
        return [label, new Date(`${form[k]}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })];
      }
      return [label, form[k]];
    }),
  ];

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
            className="btn-circle"
            aria-label="Back to dashboard"
          >
            <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
          </button>
        ) : (
          <div className="w-8" />
        )}
        <h1 className="text-sm sm:text-base font-semibold text-purple-600 text-center"><i className="fa-solid fa-pen mr-1.5" aria-hidden="true" />
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
              <label className="text-xs sm:text-sm font-semibold text-slate-700"><i className="fa-solid fa-code mr-1.5 text-purple-500" aria-hidden="true" />
                <span className="text-red-500">*</span> Technology
              </label>
              <TechMultiSelect
                value={form.technology}
                onChange={(technology) => setForm((prev) => ({ ...prev, technology }))}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-1">
              <label className="text-xs sm:text-sm font-semibold text-slate-700"><i className="fa-solid fa-briefcase mr-1.5 text-purple-500" aria-hidden="true" />
                <span className="text-red-500">*</span> Experience
              </label>
              <input
                type="text"
                value={form.experience}
                onChange={(e) => setForm((prev) => ({ ...prev, experience: e.target.value.replace(/[^\d.]/g, '') }))}
                placeholder="0–20 (e.g., 2 or 2.5)"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <SelectedToggle
              checked={form.selected}
              onChange={(selected) => setForm((prev) => ({ ...prev, selected }))}
            />
          </div>

          {form.selected && <SelectedFields form={form} setForm={setForm} hrs={hrs} />}

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className="fa-solid fa-pen text-[11px]" aria-hidden="true" />
              {saving ? 'Updating...' : 'Update Candidate'}
            </button>
          </div>
        </>
      )}

      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3"
          onClick={() => !saving && setShowPreview(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-preview-title"
            className="w-full max-w-md md:max-w-5xl rounded-xl bg-white shadow-lg px-4 py-3 md:px-6 md:py-4 max-h-[96dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="selected-preview-title" className="text-sm md:text-base font-semibold text-purple-600">
                  <i className="fa-solid fa-circle-check mr-1.5" aria-hidden="true" />
                  Confirm your details
                </h3>
                <p className="text-[11px] md:text-xs text-slate-600">Please check everything carefully before saving.</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowPreview(false)}
                className="btn-circle"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>

            <dl className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
              {previewRows.map(([label, value]) => (
                <div
                  key={label}
                  className={`flex flex-col-reverse bg-white px-3 py-1 md:py-1.5 min-w-0 ${
                    label === 'Aadhar Card Address' ? 'col-span-2' : ''
                  }`}
                >
                  <dt className="text-[10px] md:text-[11px] text-slate-500">{label}</dt>
                  <dd className="text-xs md:text-sm font-semibold text-slate-800 break-words">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-[11px] md:text-sm font-semibold text-red-600">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />
              After saving, your account will be deactivated and marked as Selected. You will be logged out and won&apos;t be able to log in again.
            </p>

            <div className="mt-3 flex justify-between gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowPreview(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={persist}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
              >
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} aria-hidden="true" />
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
