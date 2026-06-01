import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMobile(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

function docToHr(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    name: data.name || '',
    email: data.email || '',
    mobile: data.mobile || '',
    company: data.company || '',
    technology: data.technology || '',
    jobType: data.jobType || '',
  };
}

/**
 * Checks duplicate HR email/mobile across the hrs collection.
 * @returns {{ errors: Record<string, string>, existingHrForEmail: object|null, existingHrForMobile: object|null }}
 */
export async function checkHrDuplicates({
  email,
  mobile,
  excludeFirestoreId = null,
} = {}) {
  const errors = {};
  let existingHrForEmail = null;
  let existingHrForMobile = null;
  const emailNorm = normalizeEmail(email);
  const mobileNorm = normalizeMobile(mobile);

  if (!emailNorm && !mobileNorm) {
    return { errors, existingHrForEmail, existingHrForMobile };
  }

  const snap = await getDocs(collection(db, 'hrs'));
  const excludeId = String(excludeFirestoreId || '').trim();

  for (const docSnap of snap.docs) {
    if (excludeId && docSnap.id === excludeId) continue;

    const data = docSnap.data() || {};
    const existingEmail = normalizeEmail(data.email);
    const existingMobile = normalizeMobile(data.mobile);

    if (emailNorm && existingEmail === emailNorm && !errors.email) {
      errors.email = 'This Email already exist';
      existingHrForEmail = docToHr(docSnap);
    }
    if (mobileNorm && existingMobile === mobileNorm && !errors.mobile) {
      errors.mobile = 'Mobile is already exist';
      existingHrForMobile = docToHr(docSnap);
    }
  }

  return { errors, existingHrForEmail, existingHrForMobile };
}

/**
 * Returns field errors for duplicate HR email/mobile across the hrs collection.
 * @param {{ email?: string, mobile?: string, excludeFirestoreId?: string }} params
 */
export async function getHrDuplicateFieldErrors({
  email,
  mobile,
  excludeFirestoreId = null,
} = {}) {
  const { errors } = await checkHrDuplicates({ email, mobile, excludeFirestoreId });
  return errors;
}
