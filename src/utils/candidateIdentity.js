/** Shared candidate ↔ slot linking helpers (mobile is the canonical key). */

export function normalizeCandidateMobile(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

export function getCandidateMatchKeys(candidateOrSession) {
  if (!candidateOrSession) return [];
  const firestoreId = String(
    candidateOrSession.firestoreId || candidateOrSession.id || '',
  ).trim();
  const mobile = normalizeCandidateMobile(
    candidateOrSession.mobile || candidateOrSession.phone,
  );
  const keys = [];
  if (mobile) keys.push(mobile);
  if (firestoreId && firestoreId !== mobile) keys.push(firestoreId);
  return [...new Set(keys.filter(Boolean))];
}

export function getPrimaryCandidateLinkId({ mobile, firestoreId } = {}) {
  const normalizedMobile = normalizeCandidateMobile(mobile);
  if (normalizedMobile) return normalizedMobile;
  return String(firestoreId || '').trim();
}

export function getSlotCandidateLinkValues(slot) {
  if (!slot) return [];
  const values = [];
  const candidateMobile = normalizeCandidateMobile(
    slot.candidateMobile || slot.mobile || '',
  );
  const candidateId = String(slot.candidateId || '').trim();
  const candidateIdAsMobile = normalizeCandidateMobile(candidateId);

  if (candidateMobile) values.push(candidateMobile);
  if (candidateId) values.push(candidateId);
  if (candidateIdAsMobile && candidateIdAsMobile !== candidateId) {
    values.push(candidateIdAsMobile);
  }
  return [...new Set(values.filter(Boolean))];
}

export function slotMatchesCandidateKeys(slot, matchKeys) {
  if (!Array.isArray(matchKeys) || matchKeys.length === 0) return false;
  const keySet = new Set(matchKeys.map((k) => String(k || '').trim()).filter(Boolean));
  return getSlotCandidateLinkValues(slot).some((value) => keySet.has(value));
}

export function slotMatchesCandidate(slot, candidate) {
  return slotMatchesCandidateKeys(slot, getCandidateMatchKeys(candidate));
}

export function statsSlotCandidateKey(slot) {
  const mobile = normalizeCandidateMobile(
    slot?.candidateMobile || slot?.mobile || slot?.candidateId || '',
  );
  if (mobile && mobile.length >= 10) return `mobile:${mobile}`;
  const id = String(slot?.candidateId || '').trim();
  if (id) return `id:${id}`;
  const name = String(slot?.candidateName || slot?.name || '').trim();
  if (!name) return '';
  return `name:${name.toLowerCase()}`;
}
