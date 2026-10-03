// User profile: local display name + optional Play Games identity.
// Display names are claimed as unique via a Firestore `users` collection
// (doc id = lower-cased name), validated against existing users when the
// leaderboard backend is configured. Falls back to device-local save when
// the backend is unreachable or disabled, so the game still works.
import { isConfigured as fbConfigured, getFirebaseConfig } from './firebase-config.js';
import { firestoreRoot, getToken, getPlayerId } from './leaderboard.js';
import { getPlayGamesName } from './play-games.js';

const NAME_KEY = 'tileshift:display-name';

export function getDisplayName() {
  try {
    const local = localStorage.getItem(NAME_KEY) || '';
    return local || getPlayGamesName() || '';
  } catch (e) {
    return getPlayGamesName() || '';
  }
}

export function setDisplayNameLocal(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch (e) {
    // ignore storage errors
  }
}

export function hasProfile() {
  return Boolean(getDisplayName());
}

export function clearProfile() {
  setDisplayNameLocal('');
}

function normalizeName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

export function validateName(raw) {
  const name = normalizeName(raw);
  if (name.length < 3) return { ok: false, reason: 'Name must be at least 3 characters.' };
  if (name.length > 20) return { ok: false, reason: 'Name must be at most 20 characters.' };
  if (/[^\p{L}\p{N} _.-]/u.test(name)) {
    return { ok: false, reason: 'Use letters, numbers, spaces, dots, dashes or underscores.' };
  }
  return { ok: true, name };
}

// Returns { ok, reason, local }. `local: true` means the name was only saved
// on this device (backend unreachable/disabled); `false` means it was claimed
// globally against existing users.
export async function claimName(raw) {
  const check = validateName(raw);
  if (!check.ok) return check;
  const name = check.name;
  const lower = name.toLowerCase();

  if (!fbConfigured()) {
    setDisplayNameLocal(name);
    return { ok: true, name, local: true };
  }

  let player = getPlayerId();
  if (!player) {
    try {
      await getToken();
      player = getPlayerId();
    } catch (e) {
      player = '';
    }
  }

  const docId = `${firestoreRoot(getFirebaseConfig().projectId)}/users/${encodeURIComponent(lower)}`;

  try {
    // 1. Check whether another player already owns this name.
    const existing = await fetch(docId, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (existing.ok) {
      const body = await existing.json().catch(() => null);
      const owner = body?.fields?.player?.stringValue;
      if (owner && owner !== player) {
        return { ok: false, reason: `Name "${name}" is already taken by another player.`, local: false };
      }
      if (owner === player) {
        setDisplayNameLocal(name);
        return { ok: true, name, local: false };
      }
    }
    // 2. Claim it (doc id = lower cased name).
    const res = await fetch(docId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        fields: {
          player: { stringValue: player || 'guest' },
          name: { stringValue: name },
          at: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    if (!res.ok) throw new Error(`claim write failed: ${res.status}`);
    setDisplayNameLocal(name);
    return { ok: true, name, local: false };
  } catch (e) {
    // Offline or rules not updated: keep the name on this device.
    setDisplayNameLocal(name);
    return { ok: true, name, local: true };
  }
}