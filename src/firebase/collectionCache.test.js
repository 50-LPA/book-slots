import { Timestamp, getCountFromServer, getDocs } from 'firebase/firestore';
import { getSyncedDocs, forgetSyncedDoc } from './syncedCollection';

jest.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  collection: jest.fn(() => ({ kind: 'all' })),
  query: jest.fn(() => ({ kind: 'delta' })),
  where: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
}));

const ts = (s) => new Timestamp(s, 0);
const d = (id, updatedAt, extra = {}) => ({ id, data: () => ({ updatedAt, ...extra }) });
const ids = (docs) => docs.map((x) => x.id).sort();
const count = (n) => ({ data: () => ({ count: n }) });

test('first load reads all; later syncs read only changes; deletes elsewhere force one full reload', async () => {
  getDocs.mockResolvedValueOnce({ docs: [d('a', ts(10)), d('b', undefined)] }); // full
  expect(ids(await getSyncedDocs('hrs'))).toEqual(['a', 'b']);

  // Within 5 minutes: served from memory, no reads.
  await getSyncedDocs('hrs');
  expect(getDocs).toHaveBeenCalledTimes(1);

  // Reload: delta (one changed, one new) + count.
  getDocs.mockResolvedValueOnce({ docs: [d('a', ts(20), { name: 'x' }), d('c', ts(21))] });
  getCountFromServer.mockResolvedValueOnce(count(3));
  const after = await getSyncedDocs('hrs', { fresh: true });
  expect(ids(after)).toEqual(['a', 'b', 'c']);
  expect(after.find((x) => x.id === 'a').data().name).toBe('x');
  expect(getDocs).toHaveBeenCalledTimes(2);

  // Deleted here: dropped locally, count still matches, no full reload.
  forgetSyncedDoc('hrs', 'c');
  getDocs.mockResolvedValueOnce({ docs: [] });
  getCountFromServer.mockResolvedValueOnce(count(2));
  expect(ids(await getSyncedDocs('hrs', { fresh: true }))).toEqual(['a', 'b']);
  expect(getDocs).toHaveBeenCalledTimes(3);

  // Deleted on another device: count mismatch → one full reload.
  getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [d('a', ts(20))] });
  getCountFromServer.mockResolvedValueOnce(count(1));
  expect(ids(await getSyncedDocs('hrs', { fresh: true }))).toEqual(['a']);
  expect(getDocs).toHaveBeenCalledTimes(5);

  // Server unreachable (quota, offline): the copy is still served.
  getDocs.mockRejectedValueOnce(new Error('quota'));
  getCountFromServer.mockResolvedValueOnce(count(1));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(ids(await getSyncedDocs('hrs', { fresh: true }))).toEqual(['a']);
});

test('no copy yet and the server fails: the error reaches the caller', async () => {
  getDocs.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await expect(getSyncedDocs('candidates')).rejects.toThrow('denied');
});
