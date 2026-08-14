import {
  isCandidateInterviewOlderThanTwoWeeks,
  getLastInterviewSlot,
  getLastInterviewInfo,
  getCandidateAccountStatus,
  TWO_WEEKS_MS,
} from './candidateStatus';

describe('Candidate Inactivity based on Last Interview', () => {
  const candidate = {
    id: 'cand1',
    firestoreId: 'cand1',
    mobile: '9876543210',
    isActive: true,
    status: 'Active',
  };

  test('candidate with no slots is not older than two weeks and remains Active', () => {
    const slots = [];
    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(false);
    expect(getCandidateAccountStatus(candidate, slots)).toBe('Active');
  });

  test('candidate with interview less than two weeks ago (e.g. 5 days ago) is Active', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const slots = [
      {
        id: 'slot1',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: fiveDaysAgo,
        startHour: 10,
        startMinute: 0,
        duration: 30,
        status: 'Approved',
      },
    ];

    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(false);
    expect(getCandidateAccountStatus(candidate, slots)).toBe('Active');
    const info = getLastInterviewInfo(slots, candidate);
    expect(info).not.toBeNull();
    expect(info.isOlderThanTwoWeeks).toBe(false);
  });

  test('candidate with interview more than two weeks ago (e.g. 15 days ago) is automatically Inactive', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const slots = [
      {
        id: 'slot1',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: fifteenDaysAgo,
        startHour: 10,
        startMinute: 0,
        duration: 30,
        status: 'Approved',
      },
    ];

    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(true);
    expect(getCandidateAccountStatus(candidate, slots)).toBe('Inactive');
    const info = getLastInterviewInfo(slots, candidate);
    expect(info).not.toBeNull();
    expect(info.isOlderThanTwoWeeks).toBe(true);
    expect(info.daysAgo).toBeGreaterThanOrEqual(14);
  });

  test('candidate with multiple slots uses the most recent completed interview', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const slots = [
      {
        id: 'slotOld',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: twentyDaysAgo,
        startHour: 10,
        startMinute: 0,
        duration: 30,
        status: 'Approved',
      },
      {
        id: 'slotNew',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: threeDaysAgo,
        startHour: 14,
        startMinute: 0,
        duration: 45,
        status: 'Approved',
      },
    ];

    const lastSlot = getLastInterviewSlot(slots, candidate);
    expect(lastSlot.id).toBe('slotNew');
    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(false);
    expect(getCandidateAccountStatus(candidate, slots)).toBe('Active');
  });

  test('future slots do not count as completed interviews', () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const slots = [
      {
        id: 'slotFuture',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: futureDate,
        startHour: 11,
        startMinute: 0,
        duration: 30,
        status: 'Approved',
      },
    ];

    expect(getLastInterviewSlot(slots, candidate)).toBeNull();
    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(false);
    expect(getCandidateAccountStatus(candidate, slots)).toBe('Active');
  });

  test('rejected slots do not count as completed interviews', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const slots = [
      {
        id: 'slotRejected',
        candidateId: 'cand1',
        candidateMobile: '9876543210',
        date: twentyDaysAgo,
        startHour: 10,
        startMinute: 0,
        duration: 30,
        status: 'Rejected',
      },
    ];

    expect(getLastInterviewSlot(slots, candidate)).toBeNull();
    expect(isCandidateInterviewOlderThanTwoWeeks(slots, candidate)).toBe(false);
  });

  test('explicitly inactive candidate remains Inactive even without old slots', () => {
    const inactiveCandidate = { ...candidate, isActive: false, status: 'Inactive' };
    expect(getCandidateAccountStatus(inactiveCandidate, [])).toBe('Inactive');
  });
});
