import React, { useEffect, useMemo, useState } from 'react';

function formatTechLabel(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  // Keep existing case for non-trivial strings, but make simple lowercase keys readable.
  if (/^[a-z0-9]+$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

export default function AddHRModal({
  isOpen,
  onClose,
  onAdd,
  technologyOptions = null,
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    technology: '',
    mobile: '',
    jobType: '',
    company: '',
  });
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [errors, setErrors] = useState({});

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
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const validate = () => {
    const e = {};
    const name = String(form.name || '').trim();
    const email = String(form.email || '').trim();
    const jobType = String(form.jobType || '').trim();
    const company = String(form.company || '').trim();
    const technology = String(form.technology || '').trim();
    const mobile = String(form.mobile || '').trim();

    if (!name) e.name = 'HR name is required.';
    if (!email) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Please enter a valid email.';
    if (!jobType) e.jobType = 'Job type is required.';
    if (!company) e.company = 'Company name is required.';
    if (!technology) e.technology = 'Technology is required.';
    if (mobile && !/^\d{10}$/.test(mobile)) e.mobile = 'Mobile must be 10 digits.';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Call parent handler if provided
    if (onAdd) {
      try {
        // create an id for the HR
        const newHR = {
          id: Date.now(),
          ...form,
          name: String(form.name || '').trim(),
          email: String(form.email || '').trim(),
          company: String(form.company || '').trim(),
          technology: String(form.technology || '').trim(),
          jobType: String(form.jobType || '').trim(),
          mobile: String(form.mobile || '').trim(),
        };
        await onAdd(newHR);
        
        // Show success toast in form header
        setShowSuccessToast(true);
        
        // Hide toast after 2 seconds and close modal
        setTimeout(() => {
          setShowSuccessToast(false);
          // reset form
          setForm({
            name: '',
            email: '',
            technology: '',
            mobile: '',
            jobType: '',
            company: '',
          });
          onClose();
        }, 2000);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to add HR:', err);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('Add HR', form);
      // reset form (optional)
      setForm({
        name: '',
        email: '',
        technology: '',
        mobile: '',
        jobType: '',
        company: '',
      });
      onClose();
    }
  };

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
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 z-10">
        <div className="px-6 py-4 border-b flex items-center justify-between relative">
          <h3 className="text-base font-semibold text-gray-800">Add New HR</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
          </button>
          
          {/* Success Toast in Form Header */}
          {showSuccessToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300">
              <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-semibold text-xs">HR Created Successfully</span>
              </div>
            </div>
          )}
        </div>

        <form className="p-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  <span className="text-red-500">*</span> HR Name
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
                  placeholder="Enter HR Name"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  <span className="text-red-500">*</span> Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
                  placeholder="Enter Email"
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  <span className="text-red-500">*</span> Job Type
                </label>
                <select
                  name="jobType"
                  value={form.jobType}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
                >
                  <option value="">Select Job Type</option>
                  <option value="onsite">Onsite</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                {errors.jobType && <p className="mt-1 text-xs text-red-500">{errors.jobType}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  <span className="text-red-500">*</span> Company Name
                </label>
                <input
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
                  placeholder="Enter Company Name"
                />
                {errors.company && <p className="mt-1 text-xs text-red-500">{errors.company}</p>}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  <span className="text-red-500">*</span> Technology
                </label>
                <select
                  name="technology"
                  value={form.technology}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
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
                <label className="block text-xs font-semibold text-gray-700">Mobile</label>
                <input
                  name="mobile"
                  value={form.mobile}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white h-9"
                  placeholder="Enter 10 digit number"
                />
                {errors.mobile && <p className="mt-1 text-xs text-red-500">{errors.mobile}</p>}
                <ul className="mt-2 text-xs text-red-500 list-disc list-inside">
                  <li>Don't include +91</li>
                  <li>Don't use your own mobile number.</li>
                </ul>
              </div>

              <div className="h-12" /> {/* spacer to align with left column */}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-sm text-gray-700 bg-white h-9"
            >
              ✕ Close
            </button>

            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 h-9"
            >
              + Add New HR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

