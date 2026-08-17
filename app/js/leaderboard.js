// Firebase leaderboard client — zero dependencies, talks to the Firebase REST API.
// Anonymous auth via Identity Toolkit, scores in Firestore, offline queue in localStorage.
import { getFirebaseConfig, isConfigured } from './firebase-config.js';

const TOKEN_KEY = 'tileshift:fb-token';
const PLAYER_KEY = 'tileshift:fb-player';
const QUEUE_KEY = 'tileshift:fb-queue';
const IDENTITY_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';

function firestoreRoot(projectId) {
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

async function getToken() {
  const cfg = getFirebaseConfig();
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch (e) {
    // ignore
  }
  if (cached && cached.exp > Date.now() + 60000) return cached.idToken;
  const res = await fetch(`${IDENTITY_ENDPOINT}?key=${cfg.apiKey}`, {
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
  const res = await fetch(`${firestoreRoot(cfg.projectId)}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: {
        mode: { stringValue: mode },
        player: { stringValue: entry.player },
        name: { stringValue: entry.name || '' },
        score: { integerValue: String(entry.score) },
        tile: { integerValue: String(entry.tile) },
        at: { timestampValue: entry.at },
      },
    }),
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
  const entry = () => ({
    player: getPlayerId() || 'guest',
    name: name || '',
    score,
    tile,
    at: new Date().toISOString(),
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
  const res = await fetch(`${firestoreRoot(cfg.projectId)}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'scores' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'mode' },
            op: 'EQUAL',
            value: { stringValue: mode },
          },
        },
        limit: 100,
      },
    }),
  });
  if (!res.ok) throw new Error(`query failed (${res.status})`);
  const data = await res.json();
  const rows = [];
  for (const item of Array.isArray(data) ? data : []) {
    if (!item.document) continue;
    const f = item.document.fields || {};
    rows.push({
      player: f.player?.stringValue || 'unknown',
      name: f.name?.stringValue || '',
      score: Number(f.score?.integerValue || 0),
      tile: Number(f.tile?.integerValue || 0),
      at: f.at?.timestampValue || '',
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}