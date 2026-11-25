# Slot Booking

React (CRA) + Firebase app for booking interview slots. Hosted on Netlify (admin-only work runs in `netlify/functions`); Firestore rules deploy with the Firebase CLI.

- `npm start` – dev server (needs the `REACT_APP_FIREBASE_*` keys in `.env`)
- `npm test` – tests; `npm run test:profile` – admission profile/resume tests (node --test)
- `npm run build` – production build, then a size/request budget check (`scripts/check-build-size.js`)
- `firebase deploy --only firestore:rules` – security rules

Login email = `<mobile>@<projectId>.firebaseapp.com` (never emailed). Doc ids in `admin/` and `candidates/` equal the Auth uid; `firestore.rules` rely on that. Admins are managed only in the Firebase Console: create the Auth user with uid = the `admin/` doc id.
