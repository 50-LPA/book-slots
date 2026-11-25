// Every HR from one doc (hrIndex/all, kept by netlify/functions/hrs.mjs): 1 read per page load instead of the
// whole hrs collection. Saves go through the function, which returns the saved entry, so the list is updated
// here without reading again.
import { doc, getDoc } from 'firebase/firestore';
import { db, callFunction } from './firebase';

let list = null; // Promise<items>, newest first
export function getHrIndex({ fresh = false } = {}) {
  if (fresh || !list) {
    list = getDoc(doc(db, 'hrIndex', 'all'))
      .then((s) => (s.exists() ? JSON.parse(s.data().json || '[]') : []))
      .catch((err) => {
        list = null;
        throw err;
      });
  }
  return list;
}

const patch = (fn) => {
  if (list) list = list.then(fn, () => { list = null; return []; }); // a failed load is simply read again next time
};

// action: 'create' { hr } | 'update' { id, hr } | 'delete' { id }. Resolves the server's answer ({ hr } or { ok }).
export async function saveHr(action, payload) {
  const { data } = await callFunction('hrs', action)(payload);
  if (action === 'create') {
    patch((items) => [data.hr, ...items.filter((h) => h.id !== data.hr.id)]);
    if (mineList) mineList = mineList.then((items) => [data.hr, ...items.filter((h) => h.id !== data.hr.id)], () => { mineList = null; return []; });
  }
  if (action === 'update') patch((items) => items.map((h) => (h.id === data.hr.id ? data.hr : h)));
  if (action === 'delete') patch((items) => items.filter((h) => h.id !== payload.id));
  return data;
}

// Candidate: only the HRs they added, from the hrs function (they can't read the index). Cached per page load.
let mineList = null;
export function getMyHrs({ fresh = false } = {}) {
  if (fresh || !mineList) {
    mineList = callFunction('hrs', 'mine')({}).then(({ data }) => data.hrs || []).catch((err) => {
      mineList = null;
      throw err;
    });
  }
  return mineList;
}

export const forgetHrIndex = () => { list = null; mineList = null; }; // logout
