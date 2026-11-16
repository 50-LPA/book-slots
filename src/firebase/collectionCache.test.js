import { getDocs } from 'firebase/firestore';
import { getCollectionDocs, invalidateCollection } from './slotsService';

jest.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
}));

beforeEach(() => {
  getDocs.mockReset();
  invalidateCollection('hrs');
});

test('reuses one read until fresh/invalidate; failed reads are not cached', async () => {
  getDocs.mockResolvedValue({ docs: ['a'] });
  expect(await getCollectionDocs('hrs')).toEqual(['a']);
  await getCollectionDocs('hrs');
  expect(getDocs).toHaveBeenCalledTimes(1);

  await getCollectionDocs('hrs', { fresh: true });
  expect(getDocs).toHaveBeenCalledTimes(2);

  invalidateCollection('hrs');
  getDocs.mockRejectedValueOnce(new Error('offline'));
  await expect(getCollectionDocs('hrs')).rejects.toThrow('offline');
  expect(await getCollectionDocs('hrs')).toEqual(['a']);
  expect(getDocs).toHaveBeenCalledTimes(4);
});
