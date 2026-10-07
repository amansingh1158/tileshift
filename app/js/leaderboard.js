// Firebase leaderboard client — zero dependencies, talks to the Firebase REST API.
// Anonymous auth via Identity Toolkit, scores in Firestore, offline queue in localStorage.
import { getFirebaseConfig, isConfigured } from './firebase-config.js';

const TOKEN_KEY = 'tileshift:fb-token';
const PLAYER_KEY = 'tileshift:fb-player';
const QUEUE_KEY = 'tileshift:fb-queue';
const IDENTITY_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';

function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout')), ms)),
  ]);
}

async function fetchWithTimeout(url, init = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function firestoreRoot(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function writeQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function queueLength() {
  return readQueue().length;
}

export function getPlayerId() {
  return localStorage.getItem(PLAYER_KEY) || '';
}

export function setPlayerId(uid) {
  localStorage.setItem(PLAYER_KEY, uid);
}

// --- Weekly rotation -------------------------------------------------------
// Scores belong to an ISO-8601 week (UTC) and expire 7 days later, so the
// leaderboard starts fresh every week and Firestore TTL can delete old rows.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4DayNum + 3); // Thursday of ISO week 1
  const week = 1 + Math.round((date.getTime() - jan4.getTime()) / WEEK_MS);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// Next Monday 00:00 UTC — when this week's leaderboard is replaced.
export function weekEndsAt(d = new Date()) {
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayNum = (d.getUTCDay() + 6) % 7;
  return new Date(midnight + (7 - dayNum) * 24 * 60 * 60 * 1000);
}

export async function getToken() {
  const cfg = getFirebaseConfig();
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch (e) {
    // ignore
  }
  if (cached && cached.exp > Date.now() + 60000) return cached.idToken;
  const res = await fetchWithTimeout(`${IDENTITY_ENDPOINT}?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`anonymous auth failed (${res.status})`);
  const data = await res.json();
  localStorage.setItem(PLAYER_KEY, data.localId || '');
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      idToken: data.idToken,
      exp: Date.now() + Number(data.expiresIn || 3600) * 1000,
    })
  );
  return data.idToken;
}

async function postScore(cfg, token, mode, entry) {
  const fields = {
    mode: { stringValue: mode },
    player: { stringValue: entry.player },
    name: { stringValue: entry.name || '' },
    score: { integerValue: String(entry.score) },
    tile: { integerValue: String(entry.tile) },
    at: { timestampValue: entry.at },
  };
  // Weekly fields always land on the server: entries queued before the
  // rotation existed are stamped from their original score time.
  fields.week = { stringValue: entry.week || weekKey(new Date(entry.at)) };
  fields.expiresAt = {
    timestampValue: entry.expiresAt || new Date(Date.parse(entry.at) + WEEK_MS).toISOString(),
  };
  const res = await fetchWithTimeout(`${firestoreRoot(cfg.projectId)}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`score post failed (${res.status})`);
}

function enqueue(mode, entry) {
  const q = readQueue();
  q.push({ mode, entry });
  writeQueue(q);
}

export async function submitScore(mode, { score, tile, name }) {
  const cfg = getFirebaseConfig();
  const now = Date.now();
  const entry = () => ({
    player: getPlayerId() || 'guest',
    name: name || '',
    score,
    tile,
    at: new Date(now).toISOString(),
    week: weekKey(new Date(now)),
    expiresAt: new Date(now + WEEK_MS).toISOString(),
  });
  if (!isConfigured()) {
    enqueue(mode, entry());
    return;
  }
  try {
    const token = await getToken();
    await postScore(cfg, token, mode, entry());
  } catch (e) {
    enqueue(mode, entry());
  }
}

export async function flushQueue() {
  const cfg = getFirebaseConfig();
  if (!isConfigured()) return 0;
  const q = readQueue();
  if (!q.length) return 0;
  let token;
  try {
    token = await getToken();
  } catch (e) {
    return 0;
  }
  const remaining = [];
  let flushed = 0;
  for (const item of q) {
    try {
      await postScore(cfg, token, item.mode, item.entry);
      flushed += 1;
    } catch (e) {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return flushed;
}

export async function fetchTopScores(mode, limit = 10) {
  const cfg = getFirebaseConfig();
  if (!isConfigured()) return [];
  const token = await getToken();
  const res = await fetchWithTimeout(`${firestoreRoot(cfg.projectId)}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'scores' }],
        // Two equality filters — Firestore merges single-field indexes, so no
        // composite index is required. Rows from older weeks never match.
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'mode' },
                  op: 'EQUAL',
                  value: { stringValue: mode },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'week' },
                  op: 'EQUAL',
                  value: { stringValue: weekKey() },
                },
              },
            ],
          },
        },
        limit: 500,
      },
    }),
  });
  if (!res.ok) throw new Error(`query failed (${res.status})`);
  const data = await res.json();
  const best = new Map();
  for (const item of Array.isArray(data) ? data : []) {
    if (!item.document) continue;
    const f = item.document.fields || {};
    const player = f.player?.stringValue || 'unknown';
    const score = Number(f.score?.integerValue || 0);
    const prev = best.get(player);
    const name = f.name?.stringValue || '';
    if (prev && prev.score >= score) {
      // Keep the best score, but backfill a missing name from a lower entry
      // so opponents don't render as anonymous.
      if (!prev.name && name) prev.name = name;
      continue;
    }
    best.set(player, {
      player,
      name,
      score,
      tile: Number(f.tile?.integerValue || 0),
      at: f.at?.timestampValue || '',
    });
  }
  const rows = [...best.values()];
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}

// Removes scores whose 7-day expiry has passed — the free, client-side
// stand-in for a Firestore TTL policy (rules only allow deleting docs whose
// expiresAt is already in the past, see firestore.rules). Fire-and-forget:
// failures are swallowed; some other client will clean up next session.
export async function purgeExpiredScores() {
  const cfg = getFirebaseConfig();
  if (!isConfigured()) return 0;
  let token;
  try {
    token = await getToken();
  } catch (e) {
    return 0;
  }
  const root = firestoreRoot(cfg.projectId);
  try {
    const res = await fetchWithTimeout(`${root}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'scores' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'expiresAt' },
              op: 'LESS_THAN',
              value: { timestampValue: new Date().toISOString() },
            },
          },
          limit: 500,
        },
      }),
    });
    if (!res.ok) throw new Error(`purge query failed (${res.status})`);
    const data = await res.json();
    const names = (Array.isArray(data) ? data : [])
      .map((item) => item.document?.name)
      .filter(Boolean);
    if (!names.length) return 0;
    const del = await fetchWithTimeout(`${root}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ writes: names.map((name) => ({ delete: name })) }),
    });
    // A 403 here just means a concurrent client deleted some docs first.
    return del.ok ? names.length : 0;
  } catch (e) {
    return 0;
  }
}

// --- Account & data deletion (Play data-safety) ---

const ACCOUNT_DELETE_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:delete';

async function findPlayerDocs(token, root, uid) {
  const found = [];
  for (const collectionId of ['scores', 'users']) {
    const res = await fetchWithTimeout(`${root}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'player' },
              op: 'EQUAL',
              value: { stringValue: uid },
            },
          },
          limit: 500,
        },
      }),
    });
    if (!res.ok) throw new Error(`find ${collectionId} failed (${res.status})`);
    const data = await res.json();
    for (const item of Array.isArray(data) ? data : []) {
      if (item.document?.name) found.push(item.document.name);
    }
  }
  return found;
}

// Deletes every stored document for this player (scores + claimed name), then
// best-effort removes the anonymous Firebase account. Firestore rules must
// allow delete on docs where player == auth.uid (see firestore.rules).
export async function deleteMyAccountData() {
  const cfg = getFirebaseConfig();
  const uid = getPlayerId();
  if (!isConfigured() || !uid) return { deleted: 0, account: false };
  const root = firestoreRoot(cfg.projectId);
  let token;
  try {
    token = await getToken();
  } catch (e) {
    return { deleted: 0, account: false, error: 'auth' };
  }
  const docs = await findPlayerDocs(token, root, uid);
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const res = await fetchWithTimeout(`${root}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ writes: chunk.map((name) => ({ delete: name })) }),
    });
    if (!res.ok) throw new Error(`delete commit failed (${res.status})`);
  }
  let account = false;
  try {
    const res = await fetchWithTimeout(`${ACCOUNT_DELETE_ENDPOINT}?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    account = res.ok;
  } catch (e) {
    // best-effort; the stored documents are already gone
  }
  return { deleted: docs.length, account };
}

// Drops the locally cached anonymous identity (token, player id, score queue)
// so the device no longer holds or can reuse the account.
export function clearLocalIdentity() {
  for (const key of [TOKEN_KEY, PLAYER_KEY, QUEUE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // ignore storage errors
    }
  }
}