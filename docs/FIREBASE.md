# Firebase setup for the TileShift leaderboard

The leaderboard uses Firebase anonymous auth + Firestore via the REST API
(no SDK, no native plugin — works in browser, PWA and the Capacitor app).

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a project (free Spark plan is fine).
2. Add a **Web app**: Project settings > Your apps > Add app > Web.
3. Copy the `apiKey` and `projectId` from the config snippet.

## 2. Paste the config into the app

Edit `app/js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: 'AIzaSy...',
  projectId: 'tileshift-12345',
};
```

That's it — the app detects the config and enables the leaderboard.
Without it the game still works fully offline (scores simply aren't submitted).

## 3. Set Firestore security rules

Firestore > Rules — replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{doc} {
      allow read: if true;
      allow create: if request.resource.data.score is int
        && request.resource.data.score >= 0
        && request.resource.data.score < 100000000
        && request.resource.data.mode in ['classic', 'time', 'moves', 'daily']
        && request.resource.data.player is string
        && request.resource.data.tile is int
        && request.resource.data.at is timestamp;
      allow update, delete: if false;
    }
  }
}
```

Publish the rules (select "production" mode). The default "test mode" also works
but expires after 30 days.

## 4. How it works

- On first score submit the app signs in anonymously (Identity Toolkit REST) and
  caches the token in localStorage (refreshes hourly).
- Finished games post `{ mode, player, score, tile, at }` to the `scores`
  collection. If offline, the entry is queued in localStorage and flushed on the
  next successful connection (or on the landing page load).
- The landing page leaderboard queries the top 10 scores per mode.