import test from 'node:test';
import assert from 'node:assert/strict';
import { addedBy, forCandidate } from '../functions/hrs.mjs';

const me = { uid: 'u1', mobile: '9876543210', ownName: 'Raj Patil' };

test('a candidate sees only HRs they added', () => {
  assert.equal(addedBy(me, { addedById: '9876543210' }), true);
  assert.equal(addedBy(me, { addedById: '+91 98765 43210' }), true);
  assert.equal(addedBy(me, { addedById: 'u1' }), true); // old rows: uid
  assert.equal(addedBy(me, { addedById: '9000000000' }), false);
  assert.equal(addedBy(me, { addedById: '9000000000', addedBy: 'Raj Patil' }), false); // id wins over name
  assert.equal(addedBy(me, { addedBy: 'raj patil' }), true); // no id: exact name only
  assert.equal(addedBy(me, { addedBy: 'Viraj Patil' }), false); // no partial matches
  assert.equal(addedBy({ ...me, ownName: '' }, { addedBy: '' }), false);
});

test('candidates never get who else added an HR', () => {
  const out = forCandidate({ id: 'h', name: 'N', email: 'e', mobile: 'm', company: 'c', technology: 't', jobType: 'j', addedBy: 'X', addedById: '9000000000', createdAt: 1 });
  assert.deepEqual(Object.keys(out).sort(), ['company', 'createdAt', 'email', 'id', 'jobType', 'mobile', 'name', 'technology']);
});
