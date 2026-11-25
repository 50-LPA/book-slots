// HR field rules, shared by the Add HR pop-up (src/Components/AddHRModal.jsx) and the hrs Netlify function,
// which re-checks them before saving. Email or mobile: at least one, each valid when given.
export const JOB_TYPES = ['onsite', 'remote', 'hybrid'];
export const normEmail = (v) => String(v ?? '').trim().toLowerCase();
export const normMobile = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

export function validateHr(form) {
  const e = {};
  const name = String(form.name || '').trim();
  const email = String(form.email || '').trim();
  const mobile = String(form.mobile || '').trim();
  const company = String(form.company || '').trim();
  if (!name) e.name = 'HR name is required.';
  else if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(name)) e.name = "Use 2-80 letters (spaces . ' - allowed).";
  if (!email && !mobile) {
    e.email = 'Enter email or mobile.';
    e.mobile = 'Enter mobile or email.';
  }
  if (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email))) e.email = 'Enter a valid email.';
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) e.mobile = 'Enter valid 10-digit mobile number starting with 6-9.';
  if (!String(form.jobType || '').trim()) e.jobType = 'Job type is required.';
  if (!company) e.company = 'Company name is required.';
  else if (company.length < 2 || company.length > 100) e.company = 'Use 2-100 characters.';
  const technology = String(form.technology || '').trim();
  if (!technology) e.technology = 'Technology is required.';
  else if (technology.length > 60) e.technology = 'Use at most 60 characters.';
  return e;
}

// Same-email / same-mobile HRs among `items` (index entries), ignoring `exceptId`.
export function findHrDuplicates(items, { email, mobile }, exceptId = null) {
  const em = normEmail(email);
  const mo = normMobile(mobile);
  const others = items.filter((h) => h.id !== exceptId);
  const byEmail = em ? others.find((h) => normEmail(h.email) === em) ?? null : null;
  const byMobile = mo ? others.find((h) => normMobile(h.mobile) === mo) ?? null : null;
  const errors = {};
  if (byEmail) errors.email = 'This Email already exist';
  if (byMobile) errors.mobile = 'Mobile is already exist';
  return { errors, byEmail, byMobile };
}
