import React, { useEffect, useMemo, useRef, useState } from 'react';

export const EDIT_TECH_OPTIONS = [
  'PHP',
  '.Net',
  'Python',
  'Data Science',
  'MERN Stack',
  'MEAN Stack',
  'Java',
  'React Devloper',
  'App Support',
  'Busness Analyst',
  'Manual Testing',
  'Automation Testing',
  'DevOps (AWS)',
  'DevOps (Azure)',
  'Data Analysts',
  'AEM',
  'Power BI',
  'Security',
  'Other',
];

function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);
  return ref;
}

function DateInputWithCalendarIcon({ value, onChange }) {
  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200 cursor-pointer"
    />
  );
}

export function TechMultiSelect({ value = [], onChange, options = EDIT_TECH_OPTIONS }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useDismiss(open, setOpen);
  const allOptions = useMemo(() => [...new Set([...value, ...options])], [value, options]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allOptions.filter((t) => String(t).toLowerCase().includes(q)) : allOptions;
  }, [allOptions, search]);
  const toggle = (opt) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  return (
    <div ref={ref} className="relative">
      <div
        className="w-full flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 cursor-pointer focus-within:ring-2 focus-within:ring-purple-200"
        onClick={() => {
          setOpen((v) => !v);
          setSearch('');
        }}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-h-[30px] items-center">
          {value.length ? (
            value.map((tech) => (
              <button
                key={tech}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(tech);
                }}
                className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-800"
              >
                <span>{tech}</span>
                <span className="text-slate-500 text-[10px]">×</span>
              </button>
            ))
          ) : (
            <span className="text-slate-400 text-xs sm:text-sm">
              Choose Technologies...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 pl-2">
          {value.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-slate-500 text-sm font-semibold hover:text-slate-700 px-1"
              aria-label="Clear technologies"
            >
              ×
            </button>
          )}
          <i className="fa-solid fa-chevron-down text-slate-400 text-xs" aria-hidden="true" />
        </div>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search technology..."
              autoFocus
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          {filtered.length ? (
            filtered.map((opt) => {
              const selected = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full text-left px-3 py-1.5 text-xs sm:text-sm border-b border-slate-100 last:border-b-0 ${
                    selected
                      ? 'bg-sky-100 text-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">
              No matching technologies
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SelectedToggle({ checked, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-circle-check mr-1.5 text-purple-500" aria-hidden="true" />
        Selected
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-purple-200 focus:ring-offset-2 ${
            checked ? 'bg-purple-500' : 'bg-slate-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-[11px] text-slate-600">
          {checked ? 'Selected' : 'Not Selected'}
        </span>
      </div>
    </div>
  );
}

// Fields shown when "Selected" is ON. `hrs` = HRs this candidate added.
export function SelectedFields({ form, setForm, hrs = [] }) {
  const [showHrDropdown, setShowHrDropdown] = useState(false);
  const [hrSearch, setHrSearch] = useState('');
  const hrDropdownRef = useDismiss(showHrDropdown, setShowHrDropdown);
  const hrLabel = (h) => `${h.name}${h.company ? ` (${h.company})` : ''}`;
  const selectedHr = hrs.find((h) => h.name === form.hrName);
  const filteredHrs = useMemo(() => {
    const q = hrSearch.trim().toLowerCase();
    if (!q) return hrs;
    return hrs.filter((h) => `${h.name} ${h.company || ''}`.toLowerCase().includes(q));
  }, [hrs, hrSearch]);
  const typedHr = hrSearch.trim();
  const customHrName =
    typedHr && !hrs.some((h) => h.name.trim().toLowerCase() === typedHr.toLowerCase()) ? typedHr : '';

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'hrMobile' || field === 'familyMemberMobile') value = value.replace(/\D/g, '').slice(0, 10);
    else if (field === 'aadhar') value = value.replace(/\D/g, '').slice(0, 12);
    else if (field === 'pan') value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start mt-4 pt-4 border-t border-slate-200">
      {/* Selected Date */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-calendar-day mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Selected Date
        </label>
        <div className="relative">
          <DateInputWithCalendarIcon
            value={form.selectedDate}
            onChange={handleChange('selectedDate')}
          />
        </div>
      </div>

      {/* Joining Date */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-calendar-check mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Joining Date
        </label>
        <div className="relative">
          <DateInputWithCalendarIcon
            value={form.joiningDate}
            onChange={handleChange('joiningDate')}
          />
        </div>
      </div>

      {/* Selected Company */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-building-circle-check mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Selected Company
        </label>
        <input
          type="text"
          value={form.selectedCompany}
          onChange={handleChange('selectedCompany')}
          placeholder="Enter company name"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Package */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-indian-rupee-sign mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Package
        </label>
        <input
          type="text"
          value={form.package}
          onChange={handleChange('package')}
          placeholder="Enter package amount"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* HR Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user-tie mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> HR Name
        </label>
        <div ref={hrDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setShowHrDropdown((v) => !v);
              setHrSearch('');
            }}
            className="w-full flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-left focus:outline-none focus:ring-2 focus:ring-purple-200"
          >
            <span className={form.hrName ? 'text-slate-800 truncate' : 'text-slate-400'}>
              {form.hrName ? hrLabel(selectedHr || { name: form.hrName }) : 'Select HR...'}
            </span>
            <i className="fa-solid fa-chevron-down text-slate-400 text-xs pl-2" aria-hidden="true" />
          </button>
          {showHrDropdown && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
              <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-2">
                <input
                  type="text"
                  value={hrSearch}
                  onChange={(e) => setHrSearch(e.target.value)}
                  placeholder="Search or type HR name..."
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault(); // don't submit the form
                    if (customHrName) {
                      setForm((prev) => ({ ...prev, hrName: customHrName }));
                      setShowHrDropdown(false);
                    }
                  }}
                  autoFocus
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              {filteredHrs.length ? (
                filteredHrs.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        hrName: h.name,
                        hrMobile: String(h.mobile || '').replace(/\D/g, '').slice(0, 10),
                        hrEmail: h.email || '',
                        selectedCompany: h.company || prev.selectedCompany,
                      }));
                      setShowHrDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs sm:text-sm border-b border-slate-100 last:border-b-0 ${
                      selectedHr?.id === h.id ? 'bg-sky-100 text-slate-900' : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {hrLabel(h)}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500">
                  {hrs.length ? 'No matching HRs' : 'No HRs added by this candidate'}
                </div>
              )}
              {customHrName && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, hrName: customHrName }));
                    setShowHrDropdown(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs sm:text-sm font-semibold text-purple-600 bg-white hover:bg-purple-50 border-t border-slate-100"
                >
                  <i className="fa-solid fa-plus mr-1.5" aria-hidden="true" />
                  Use &ldquo;{customHrName}&rdquo;
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HR Mobile */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-mobile-screen mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> HR Mobile
        </label>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={form.hrMobile}
          onChange={handleChange('hrMobile')}
          placeholder="Enter HR mobile"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* HR Email */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-envelope mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> HR Email
        </label>
        <input
          type="email"
          value={form.hrEmail}
          onChange={handleChange('hrEmail')}
          placeholder="Enter HR email"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Aadhar */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-id-card mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Aadhar
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={12}
          value={form.aadhar}
          onChange={handleChange('aadhar')}
          placeholder="12 digit Aadhar"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* PAN */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-id-card-clip mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> PAN
        </label>
        <input
          type="text"
          maxLength={10}
          value={form.pan}
          onChange={handleChange('pan')}
          placeholder="10 character PAN"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 uppercase focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Family Member Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-user mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Family member name
        </label>
        <input
          type="text"
          value={form.familyMemberName}
          onChange={handleChange('familyMemberName')}
          placeholder="Enter family member name"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Family Member Mobile */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-phone mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Family member contact number
        </label>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={form.familyMemberMobile}
          onChange={handleChange('familyMemberMobile')}
          placeholder="Enter family member mobile"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Aadhar Card Address */}
      <div className="flex flex-col gap-1 md:col-span-2">
        <label className="text-xs font-semibold text-slate-700"><i className="fa-solid fa-house mr-1.5 text-purple-500" aria-hidden="true" />
          <span className="text-red-500">*</span> Aadhar Card Address
        </label>
        <input
          type="text"
          value={form.permanentAddress}
          onChange={handleChange('permanentAddress')}
          placeholder="Enter Aadhar card address"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>

    </div>
  );
}

const SELECTION_TEXT_FIELDS = [
  'selectedDate', 'joiningDate', 'selectedCompany', 'package',
  'hrName', 'hrMobile', 'hrEmail', 'aadhar', 'pan',
  'familyMemberName', 'familyMemberMobile', 'permanentAddress',
];

// Form state for the selection fields, from a candidate doc.
export function selectionFormFromDoc(c = {}) {
  const f = { selected: !!(c.selected ?? c.isSelected) };
  SELECTION_TEXT_FIELDS.forEach((k) => {
    f[k] = String(c[k] || '');
  });
  f.package = String(c.package || c.selectedPackage || '');
  f.permanentAddress = String(c.permanentAddress || c.permAddress || '');
  return f;
}

// Firestore fields to write for the selection section (cleared when not selected).
export function selectionPayload(form) {
  const on = !!form.selected;
  const p = { isSelected: on, selected: on };
  SELECTION_TEXT_FIELDS.forEach((k) => {
    p[k] = on ? String(form[k] || '').trim() : '';
  });
  p.selectedPackage = p.package;
  p.permAddress = p.permanentAddress;
  return p;
}

export const SELECTION_FIELD_LABELS = [
  ['selectedDate', 'Selected Date'],
  ['joiningDate', 'Joining Date'],
  ['selectedCompany', 'Selected Company'],
  ['package', 'Package'],
  ['hrName', 'HR Name'],
  ['hrMobile', 'HR Mobile'],
  ['hrEmail', 'HR Email'],
  ['aadhar', 'Aadhar'],
  ['pan', 'PAN'],
  ['familyMemberName', 'Family member name'],
  ['familyMemberMobile', 'Family member contact number'],
  ['permanentAddress', 'Aadhar Card Address'],
];

// All selection fields required, with format checks. Returns an error message or ''.
export function validateSelection(form) {
  const missing = SELECTION_FIELD_LABELS.filter(([k]) => !String(form[k] || '').trim()).map(([, l]) => l);
  if (missing.length) return `Please fill: ${missing.join(', ')}.`;
  if (!/^\d{10}$/.test(form.hrMobile)) return 'HR Mobile must be 10 digits.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.hrEmail.trim())) return 'Enter a valid HR Email.';
  if (!/^\d{12}$/.test(form.aadhar)) return 'Aadhar must be 12 digits.';
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.pan)) return 'Enter a valid PAN (e.g. ABCDE1234F).';
  if (!/^\d{10}$/.test(form.familyMemberMobile)) return 'Family member contact number must be 10 digits.';
  if (form.joiningDate < form.selectedDate) return 'Joining Date cannot be before Selected Date.';
  return '';
}

const DETAIL_SECTIONS = [
  {
    title: 'Offer',
    icon: 'fa-briefcase',
    fields: [
      ['selectedDate', 'Selected Date', 'date'],
      ['joiningDate', 'Joining Date', 'date'],
      ['selectedCompany', 'Selected Company'],
      ['package', 'Package', 'lpa'],
    ],
  },
  {
    title: 'HR Contact',
    icon: 'fa-user-tie',
    fields: [
      ['hrName', 'HR Name'],
      ['hrMobile', 'HR Mobile', 'tel'],
      ['hrEmail', 'HR Email', 'mail'],
    ],
  },
  {
    title: 'Identity',
    icon: 'fa-id-card',
    fields: [
      ['aadhar', 'Aadhar'],
      ['pan', 'PAN'],
    ],
  },
  {
    title: 'Family & Address',
    icon: 'fa-house-user',
    fields: [
      ['familyMemberName', 'Family member name'],
      ['familyMemberMobile', 'Family member contact number', 'tel'],
      ['permanentAddress', 'Aadhar Card Address', 'wide'],
    ],
  },
];

// Read-only view of a selected candidate's details (admin candidate view).
export function SelectedDetailsView({ candidate = {}, formatDate = (v) => v }) {
  const data = selectionFormFromDoc(candidate);
  const render = (value, kind) => {
    if (!value) return <span className="text-slate-400">—</span>;
    if (kind === 'date') return formatDate(value);
    if (kind === 'lpa') return `${value} LPA`;
    if (kind === 'tel') return <a href={`tel:${value}`} className="text-sky-600 hover:underline">{value}</a>;
    if (kind === 'mail') return <a href={`mailto:${value}`} className="text-sky-600 hover:underline break-all">{value}</a>;
    return value;
  };

  return (
    <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-white">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          Selected
        </span>
        {data.selectedCompany && (
          <span className="text-sm text-slate-700">
            at <span className="font-semibold">{data.selectedCompany}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {DETAIL_SECTIONS.map((section) => (
          <section key={section.title} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-600">
              <i className={`fa-solid ${section.icon}`} aria-hidden="true" />
              {section.title}
            </h4>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {section.fields.map(([key, label, kind]) => (
                <div key={key} className={`min-w-0 ${kind === 'wide' ? 'sm:col-span-2' : ''}`}>
                  <dt className="text-[11px] text-slate-500">{label}</dt>
                  <dd className={`text-sm font-medium text-slate-800 break-words ${key === 'pan' ? 'uppercase' : ''}`}>
                    {render(data[key], kind)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
