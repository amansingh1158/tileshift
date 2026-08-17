// Firebase Web configuration for the online leaderboard.
//
// 1. Create a free project at https://console.firebase.google.com
// 2. Add a Web app: Project settings > Your apps > Web app
// 3. Copy the "apiKey" and "projectId" values below
// 4. Set the Firestore security rules from docs/FIREBASE.md
//
// The game works fully offline without this — the leaderboard just stays
// disabled and scores are not submitted.
export const firebaseConfig = {
  apiKey: 'AIzaSyCwtXi6ENesA1Tug8tBqm5kRQETFSvkwsI',
  projectId: 'tileshift-6dba1',
};

// Runtime override hook (used by tests and custom builds).
export function getFirebaseConfig() {
  if (typeof window !== 'undefined' && window.TILESHIFT_FIREBASE) {
    return window.TILESHIFT_FIREBASE;
  }
  return firebaseConfig;
}

export function isConfigured() {
  const c = getFirebaseConfig();
  return Boolean(c.apiKey && c.projectId);
}