import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import CandidateDashboard from '../view/CandidateDashboard';
import {
  fetchCandidateEventsFromFirestore,
  isCandidateInterviewOlderThanTwoWeeks,
} from '../utils/candidateStatus';

/**
 * Route-level guard for /candidate-dashboard (and /candidate-event-list).
 * Verifies session and that candidate is still active (admin may have deactivated,
 * or last interview was > 2 weeks ago).
 */
export default function CandidateRouteGuard() {
  const [state, setState] = useState('checking'); // 'checking' | 'allow' | 'redirect'
  const [redirectTo, setRedirectTo] = useState('/login');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const raw = sessionStorage.getItem('sb_user');
        const parsed = raw ? JSON.parse(raw) : null;
        const role = (parsed?.role || '').trim().toLowerCase();

        if (!parsed?.mobile) {
          if (!cancelled) setRedirectTo('/login');
          if (!cancelled) setState('redirect');
          return;
        }
        if (role === 'admin') {
          if (!cancelled) setRedirectTo('/admin-dashboard');
          if (!cancelled) setState('redirect');
          return;
        }

        // For candidates: verify they are still active (admin deactivated or last interview > 2 weeks ago)
        const candidateId = String(parsed?.id || '').trim();
        const candidateMobile = String(parsed?.mobile || '').trim();
        if (candidateId || candidateMobile) {
          let candidateRef = candidateId ? doc(db, 'candidates', candidateId) : null;
          let snap = candidateRef ? await getDoc(candidateRef) : null;
          if ((!snap || !snap.exists()) && candidateMobile) {
            const q = query(collection(db, 'candidates'), where('mobile', '==', candidateMobile));
            const mobSnap = await getDocs(q);
            if (!mobSnap.empty) {
              snap = mobSnap.docs[0];
              candidateRef = doc(db, 'candidates', snap.id);
            }
          }

          if (snap && snap.exists()) {
            const data = snap.data();
            const candidateInfo = {
              id: snap.id,
              firestoreId: snap.id,
              mobile: candidateMobile,
              ...data,
            };
            const candidateSlots = await fetchCandidateEventsFromFirestore(candidateInfo, db);
            const isMoreThanTwoWeeks = isCandidateInterviewOlderThanTwoWeeks(
              candidateSlots,
              candidateInfo,
            );

            if (data.isActive === false || data.status === 'Inactive' || isMoreThanTwoWeeks) {
              if (data.isActive !== false && isMoreThanTwoWeeks && candidateRef) {
                try {
                  await updateDoc(candidateRef, { isActive: false, status: 'Inactive' });
                } catch (err) {
                  // ignore
                }
              }
              sessionStorage.removeItem('sb_user');
              localStorage.removeItem('candidates');
              localStorage.removeItem('name');
              localStorage.removeItem('email');
              localStorage.removeItem('uid');
              if (!cancelled) setRedirectTo('/login');
              if (!cancelled) setState('redirect');
              return;
            }

            // Candidate is active; update session with fresh activation status from Firestore
            try {
              sessionStorage.setItem(
                'sb_user',
                JSON.stringify({
                  ...parsed,
                  id: snap.id,
                  firestoreId: snap.id,
                  mobile: candidateMobile,
                  name: (data.name || parsed?.name || '').trim(),
                  isActive: data.isActive !== false,
                  status: data.status || 'Active',
                  lastActivatedAt: data.lastActivatedAt || data.reactivatedAt || null,
                }),
              );
            } catch {
              // ignore
            }
          }
        }

        if (!cancelled) setState('allow');
      } catch {
        if (!cancelled) setRedirectTo('/login');
        if (!cancelled) setState('redirect');
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  if (state === 'redirect') {
    return <Navigate to={redirectTo} replace />;
  }
  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-purple-600 font-medium">Loading…</span>
      </div>
    );
  }
  return <CandidateDashboard />;
}
