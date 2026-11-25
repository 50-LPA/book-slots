import React, { useEffect, useMemo, useState } from 'react';
import { checkHrDuplicates } from '../firebase/hrService';
import { JOB_TYPES, validateHr } from '../utils/hrValidation.mjs';

function formatTechLabel(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  // Keep existing case for non-trivial strings, but make simple lowercase keys readable.
  if (/^[a-z0-9]+$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

function DuplicateFieldMessage({ message, existingHr, onUseExistingHR }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-500">
      {message}
      {existingHr && onUseExistingHR ? (
        <>
          {' '}
          <button
            type="button"
            className="text-purple-600 underline font-medium hover:text-purple-800"
            onClick={() => onUseExistingHR(existingHr)}
          ><i className="fa-solid fa-user-check mr-1.5" aria-hidden="true" />
            Use this HR
          </button>
        </>
      ) : null}
    </p>
  );
}

const BLANK = { name: '', email: '', technology: '', mobile: '', jobType: '', company: '' };
const fromHr = (hr) => {
  const jobType = String(hr.jobType || '').trim().toLowerCase();
  return {
    name: hr.name || '',
    email: hr.email || '',
    technology: hr.technology || '',
    mobile: String(hr.mobile || '').replace(/\D/g, '').slice(-10),
    jobType: JOB_TYPES.includes(jobType) ? jobType : '',
    company: hr.company || '',
  };
};

// The one Add HR pop-up (candidate dashboard, slot booking, admin HRs). Given `hr`, it edits that HR instead;
// callers remount it per HR (key), so the form starts from that HR's details.
export default function AddHRModal({
  isOpen,
  onClose,
  onAdd,
  hr = null,
  onUseExistingHR = null,
  technologyOptions = null,
}) {
  const editing = Boolean(hr);
  const [form, setForm] = useState(() => (hr ? fromHr(hr) : BLANK));
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [errors, setErrors] = useState({});
  const [existingHrForEmail, setExistingHrForEmail] = useState(null);
  const [existingHrForMobile, setExistingHrForMobile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const techOptions = useMemo(() => {
    const opts = Array.isArray(technologyOptions)
      ? technologyOptions.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    if (opts.length) return [...new Set(opts)];
    return ['react', 'node', 'java'];
  }, [technologyOptions]);

  // If options are restricted, ensure selected value stays valid (on open / when options load)
  useEffect(() => {
    if (!isOpen) return;
    setForm((f) => {
      if (!f.technology) return f;
      return techOptions.includes(f.technology) ? f : { ...f, technology: '' };
    });
    setExistingHrForEmail(null);
    setExistingHrForMobile(null);
  }, [isOpen, techOptions]);

  // Escape key + scroll lock
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;

    if (name === 'mobile') {
      // Allow digits only, max 10
      value = value.replace(/\D/g, '').slice(0, 10);
    }

    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      // Typing in email or mobile meets "email or mobile", so the other field's "enter one" error goes too.
      const pair = name === 'email' ? 'mobile' : name === 'mobile' ? 'email' : null;
      if (pair && value.trim() && !String(form[pair] || '').trim()) delete next[pair];
      return next;
    });
    if (name === 'email') setExistingHrForEmail(null);
    if (name === 'mobile') setExistingHrForMobile(null);
  };

  const validate = () => {
    const e = validateHr(form);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { errors: duplicateErrors, existingHrForEmail: hrByEmail, existingHrForMobile: hrByMobile } =
        await checkHrDuplicates({
          email: form.email,
          mobile: form.mobile,
          excludeFirestoreId: editing ? String(hr.firestoreId || '').trim() || null : null,
        });
      if (Object.keys(duplicateErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...duplicateErrors }));
        setExistingHrForEmail(hrByEmail);
        setExistingHrForMobile(hrByMobile);
        return;
      }
      setExistingHrForEmail(null);
      setExistingHrForMobile(null);

      if (!onAdd) {
        setForm(BLANK);
        onClose();
        return;
      }

      const newHR = {
        ...(editing ? {} : { id: Date.now() }),
        ...form,
        name: String(form.name || '').trim(),
        email: String(form.email || '').trim(),
        company: String(form.company || '').trim(),
        technology: String(form.technology || '').trim(),
        jobType: String(form.jobType || '').trim(),
        mobile: String(form.mobile || '').trim(),
      };
      await onAdd(newHR);

      setShowSuccessToast(true);
      setTimeout(() => {
        setShowSuccessToast(false);
        setForm(BLANK);
        onClose();
      }, 2000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save HR:', err);
      if (err?.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
        if (err.existingHrForEmail) setExistingHrForEmail(err.existingHrForEmail);
        if (err.existingHrForMobile) setExistingHrForMobile(err.existingHrForMobile);
      } else {
        setErrors((prev) => ({
          ...prev,
          email: prev.email || 'Could not save HR. Please try again.',
        }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9';
  const req = <span className="text-red-500">*</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/20"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 z-10 max-h-[90dvh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between relative">
          <h3 className="text-base font-semibold text-gray-800">{editing ? 'Edit HR' : 'Add New HR'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-circle"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
          </button>

          {/* Success Toast in Form Header */}
          {showSuccessToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300">
              <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                <i className="fa-solid fa-circle-check text-sm" aria-hidden="true" />
                <span className="font-semibold text-xs">{editing ? 'HR Updated Successfully' : 'HR Created Successfully'}</span>
              </div>
            </div>
          )}
        </div>

        <form className="p-6" onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-user-tie mr-1.5 text-purple-500" aria-hidden="true" />
                  {req} HR Name
                </label>
                <input
                  name="name"
                  maxLength={80}
                  value={form.name}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Enter HR Name"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-envelope mr-1.5 text-purple-500" aria-hidden="true" />
                  Email <span className="font-normal text-gray-400">(email or mobile, any one required)</span>
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  name="email"
                  maxLength={100}
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Enter Email"
                />
                <DuplicateFieldMessage
                  message={errors.email}
                  existingHr={existingHrForEmail}
                  onUseExistingHR={onUseExistingHR}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-business-time mr-1.5 text-purple-500" aria-hidden="true" />
                  {req} Job Type
                </label>
                <select
                  name="jobType"
                  value={form.jobType}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Job Type</option>
                  <option value="onsite">Onsite</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                {errors.jobType && <p className="mt-1 text-xs text-red-500">{errors.jobType}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-building mr-1.5 text-purple-500" aria-hidden="true" />
                  {req} Company Name
                </label>
                <input
                  name="company"
                  maxLength={100}
                  value={form.company}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Enter Company Name"
                />
                {errors.company && <p className="mt-1 text-xs text-red-500">{errors.company}</p>}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-code mr-1.5 text-purple-500" aria-hidden="true" />
                  {req} Technology
                </label>
                <select
                  name="technology"
                  value={form.technology}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Technology</option>
                  {techOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {formatTechLabel(opt)}
                    </option>
                  ))}
                </select>
                {errors.technology && <p className="mt-1 text-xs text-red-500">{errors.technology}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
                  Mobile <span className="font-normal text-gray-400">(mobile or email, any one required)</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  name="mobile"
                  maxLength={10}
                  value={form.mobile}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Enter 10 digit number"
                />
                <DuplicateFieldMessage
                  message={errors.mobile}
                  existingHr={existingHrForMobile}
                  onUseExistingHR={onUseExistingHR}
                />
                <ul className="mt-2 text-xs text-red-500 list-disc list-inside">
                  <li>Don't include +91</li>
                  <li>Don't use your own mobile number.</li>
                </ul>
              </div>

              <div className="hidden md:block h-12" /> {/* spacer to align with left column on desktop/tablet only */}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-sm text-gray-700 bg-white h-9"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
              Close
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 h-9 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={`fa-solid ${editing ? 'fa-pen' : 'fa-plus'} w-3 h-3 sm:w-4 sm:h-4`} aria-hidden="true" />
              <span>{editing ? 'Update HR' : 'Create HR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
