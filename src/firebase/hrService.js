import { getHrIndex } from './hrIndex';
import { findHrDuplicates } from '../utils/hrValidation.mjs';

/**
 * Checks duplicate HR email/mobile across all HRs, from the HR index (no reads beyond its one per page load).
 * The hrs function checks again when saving.
 * @returns {{ errors: Record<string, string>, existingHrForEmail: object|null, existingHrForMobile: object|null }}
 */
export async function checkHrDuplicates({ email, mobile, excludeFirestoreId = null } = {}) {
  if (!String(email || '').trim() && !String(mobile || '').trim()) {
    return { errors: {}, existingHrForEmail: null, existingHrForMobile: null };
  }
  const { errors, byEmail, byMobile } = findHrDuplicates(await getHrIndex(), { email, mobile }, String(excludeFirestoreId || '').trim() || null);
  return { errors, existingHrForEmail: byEmail, existingHrForMobile: byMobile };
}
