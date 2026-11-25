import { getHrIndex } from './hrIndex';
import { findHrDuplicates } from '../utils/hrValidation.mjs';

/**
 * Checks duplicate HR email/mobile across all HRs, from the HR index (admin; no reads beyond its one per page load).
 * Candidates may not read the index: for them only the hrs function checks, when saving (409 with the match).
 * @returns {{ errors: Record<string, string>, existingHrForEmail: object|null, existingHrForMobile: object|null }}
 */
export async function checkHrDuplicates({ email, mobile, excludeFirestoreId = null } = {}) {
  if (!String(email || '').trim() && !String(mobile || '').trim()) {
    return { errors: {}, existingHrForEmail: null, existingHrForMobile: null };
  }
  const items = await getHrIndex().catch(() => null);
  if (!items) return { errors: {}, existingHrForEmail: null, existingHrForMobile: null };
  const { errors, byEmail, byMobile } = findHrDuplicates(items, { email, mobile }, String(excludeFirestoreId || '').trim() || null);
  return { errors, existingHrForEmail: byEmail, existingHrForMobile: byMobile };
}
