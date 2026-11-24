import { onSnapshot } from 'firebase/firestore';
import { getCollectionDocs } from './slotsService';

jest.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  collection: jest.fn(() => ({})),
  onSnapshot: jest.fn(),
}));

const snap = (docs, fromCache = false) => ({ docs, metadata: { fromCache } });

test('one shared listener; waits for server data; live updates; errors are not cached', async () => {
  let emit;
  let fail;
  onSnapshot.mockImplementation((_q, _o, next, error) => {
    emit = next;
    fail = error;
    return jest.fn();
  });

  const first = getCollectionDocs('hrs');
  emit(snap(['stale'], true)); // cache-only copy is ignored
  emit(snap(['a']));
  expect(await first).toEqual(['a']);
  emit(snap(['a', 'b']));
  expect(await getCollectionDocs('hrs')).toEqual(['a', 'b']);
  expect(onSnapshot).toHaveBeenCalledTimes(1);

  const failing = getCollectionDocs('candidates');
  fail(new Error('offline'));
  await expect(failing).rejects.toThrow('offline');
  const retry = getCollectionDocs('candidates');
  emit(snap(['c']));
  expect(await retry).toEqual(['c']);
  expect(onSnapshot).toHaveBeenCalledTimes(3);
});
