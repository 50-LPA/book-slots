// Profiles use the book-slots Firebase app and login. Lite Firestore (plain fetch, no realtime/IndexedDB cache):
// data.js keeps its own localStorage copy and delta sync, so the full SDK's cache isn't needed here.
import { getFirestore } from 'firebase/firestore/lite'
import { app } from '../firebase/firebase'
import { isQuotaError, quotaMessage, reportQuota } from '../utils/quota'

export const db = getFirestore(app)

// Firestore retries silently forever when it can't reach the database; fail with a clear message instead.
// A quota error comes back as the plain "daily limit" message (and shows the banner), so every screen shows that text.
export const withTimeout = (promise, ms = 15000) =>
  Promise.race([
    promise.catch((e) => {
      throw isQuotaError(reportQuota(e)) ? Object.assign(new Error(quotaMessage()), { code: 'resource-exhausted' }) : e
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('No response from the database. Check the internet connection.')), ms),
    ),
  ])
