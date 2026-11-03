# Auth migration runbook (plaintext passwords → Firebase Auth)

Order matters. Doing a step early breaks logins.

| # | Where | Step |
|---|-------|------|
| 1 | Google Cloud Console → APIs & Services → Credentials | The current key is **expired**. Create a new browser key. Restrict it: *Application restrictions* = Websites (your Netlify domain, `localhost:3002`); *API restrictions* = Identity Toolkit API, Cloud Firestore API, Token Service API, Cloud Functions API (Firebase installations too if used). Delete the old keys afterwards. |
| 2 | Local `.env` + Netlify → Site configuration → Environment variables | Set every `REACT_APP_*` from `.env.example`, using the new key. Netlify builds fail fast if any are missing. |
| 3 | Firebase Console → Authentication → Sign-in method | Enable **Email/Password**. Disable **Anonymous** (no longer used). |
| 4 | Firebase Console → Usage and billing | Switch to the **Blaze** plan (needed for Cloud Functions; cost is ~₹0 at this scale). Set a budget alert. |
| 5 | Terminal | `npm i -g firebase-tools && firebase login`, then `firebase deploy --only functions`. |
| 6 | Firebase Console → Project settings → Service accounts | Generate a private key. Save it **outside** the repo. |
| 7 | Terminal | `cd functions && npm install && export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json`, then `node migrate-auth.js` (dry run, read the output), then `node migrate-auth.js --create`. The old site keeps working. |
| 8 | Netlify | Deploy this branch. Test admin and candidate login. |
| 9 | Terminal | `node migrate-auth.js --purge`. This deletes plaintext passwords from Firestore and can't be undone. |
| 10 | Terminal | `firebase deploy --only firestore:rules`. The database is now closed. |
| 11 | — | Delete the service-account key file (and revoke it in the console). |

Rollback: before step 9, redeploy the previous Netlify build. Rules can be rolled back from
Firebase Console → Firestore → Rules → history.

Notes
- Login email = `<mobile>@<projectId>.firebaseapp.com` (never emailed). Doc ids in `admin/` and
  `candidates/` equal the Auth uid; `firestore.rules` rely on that.
- Admins are managed only in the Console: create the Auth user (email as above) **with uid = the
  `admin/` doc id**, or run `migrate-auth.js --create` after adding the doc.
- Passwords < 6 chars were migrated with a suffix (`LEGACY_PW_SUFFIX`) so those users log in unchanged.
