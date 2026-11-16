# Slot Booking

React (CRA) + Firebase app for booking interview slots. Hosted on Netlify; Firestore rules and Cloud Functions deploy with the Firebase CLI.

- `npm start` – dev server (needs the `REACT_APP_FIREBASE_*` keys in `.env`)
- `npm test` – tests
- `npm run build` – production build, then a size/request budget check (`scripts/check-build-size.js`)
- `firebase deploy --only firestore:rules` / `--only functions` – backend

Login email = `<mobile>@<projectId>.firebaseapp.com` (never emailed). Doc ids in `admin/` and `candidates/` equal the Auth uid; `firestore.rules` rely on that. Admins are managed only in the Firebase Console: create the Auth user with uid = the `admin/` doc id.
