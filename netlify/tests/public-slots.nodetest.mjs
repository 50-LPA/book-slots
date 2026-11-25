import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublic } from '../functions/public-slots.mjs';

test('public slot carries time + status only', () => {
  const ts = { toDate: () => new Date('2026-11-25T05:30:00Z') };
  const out = toPublic('e1', {
    date: '2026-11-25', start: ts, end: '2026-11-25T06:30:00.000Z', duration: '60', status: 'Approved',
    candidateName: 'A', candidateMobile: '9876543210', candidateId: 'u1', hrName: 'H', hrEmail: 'h@x.com', hrMobile: '9000000000',
    company: 'TCS', technology: 'Java', feedback: 'ok', referredBy: 'R',
  });
  assert.deepEqual(out, {
    id: 'e1', date: '2026-11-25', start: '2026-11-25T05:30:00.000Z', end: '2026-11-25T06:30:00.000Z',
    startHour: null, startMinute: null, duration: 60, time: null, status: 'Approved',
  });
});
