// Builds hrIndex/all from the hrs collection (the hrs function keeps it current afterwards; it also rebuilds it
// itself if the doc is ever missing). Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… REACT_APP_FIREBASE_PROJECT_ID=…
// node scripts/build-hr-index.mjs. Cost: 1 read per HR + 1 write.
import { initializeApp, cert } from 'firebase-admin/app';
import { rebuildIndex } from '../netlify/functions/hrs.mjs';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  projectId,
});
console.log(`HR index built with ${await rebuildIndex()} HRs.`);
