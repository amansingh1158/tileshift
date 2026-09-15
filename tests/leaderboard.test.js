import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let fetchLog = [];
let fetchImpl = null;
global.fetch = async (...args) => {
  fetchLog.push(args);
  if (fetchImpl) return fetchImpl(...args);
  return { ok: false, status: 500, json: async () => ({}) };
};

const lb = await import('../app/js/leaderboard.js');

beforeEach(() => {
  store.clear();
  fetchLog = [];
  fetchImpl = null;
  global.window = { TILESHIFT_FIREBASE: { apiKey: '', projectId: '' } };
});

test('without config, submitScore queues locally and never fetches', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: '', projectId: '' } };
  await lb.submitScore('classic', { score: 42, tile: 8 });
  assert.equal(lb.queueLength(), 1, 'score queued');
  assert.equal(fetchLog.length, 0, 'no network calls');
});

test('with config, submitScore signs in anonymously then posts, caching the token', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: 'KEY', projectId: 'PROJ' } };
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'tok-1', localId: 'uid-1', expiresIn: '3600' }) };
    }
    if (u.includes('documents/scores')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await lb.submitScore('time', { score: 100, tile: 16 });
  await lb.submitScore('time', { score: 200, tile: 32 });
  const authCalls = fetchLog.filter(([u]) => String(u).includes('identitytoolkit'));
  assert.equal(authCalls.length, 1, 'token cached after first sign-in');
  const posts = fetchLog.filter(([u]) => String(u).includes('documents/scores'));
  assert.equal(posts.length, 2, 'two score posts');
  assert.equal(lb.queueLength(), 0, 'nothing queued');
  const body = JSON.parse(posts[0][1].body);
  assert.equal(body.fields.score.integerValue, '100');
  assert.equal(body.fields.mode.stringValue, 'time');
  assert.equal(body.fields.player.stringValue, 'uid-1');
});

test('failed submits are queued and flushed by the next successful attempt', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: 'KEY', projectId: 'PROJ' } };
  fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await lb.submitScore('classic', { score: 5, tile: 4 });
  assert.equal(lb.queueLength(), 1, 'failed post queued');

  fetchImpl = async (url) => {
    if (String(url).includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't2', localId: 'uid-2', expiresIn: '3600' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const flushed = await lb.flushQueue();
  assert.equal(flushed, 1, 'queued score sent');
  assert.equal(lb.queueLength(), 0, 'queue empty after flush');
});

test('fetchTopScores parses runQuery results, keeping one best score per player', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: 'KEY', projectId: 'PROJ' } };
  fetchImpl = async (url) => {
    if (String(url).includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't3', localId: 'u3', expiresIn: '3600' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'abc123' }, score: { integerValue: '900' }, tile: { integerValue: '128' }, at: { timestampValue: '2026-08-17T00:00:00Z' } } } },
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'abc123' }, score: { integerValue: '1200' }, tile: { integerValue: '256' }, at: { timestampValue: '2026-08-18T00:00:00Z' } } } },
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'def456' }, score: { integerValue: '500' }, tile: { integerValue: '64' }, at: { timestampValue: '2026-08-16T00:00:00Z' } } } },
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'def456' }, score: { integerValue: '300' }, tile: { integerValue: '32' }, at: { timestampValue: '2026-08-15T00:00:00Z' } } } },
      ],
    };
  };
  const rows = await lb.fetchTopScores('classic', 10);
  assert.equal(rows.length, 2, 'one entry per player');
  assert.equal(rows[0].score, 1200, 'highest score per player wins');
  assert.equal(rows[0].player, 'abc123');
  assert.equal(rows[1].player, 'def456');
  assert.equal(rows[1].score, 500, 'only the higher def456 score is kept');
  assert.equal(rows[1].tile, 64);
  const query = fetchLog[fetchLog.length - 1];
  assert.ok(String(query[0]).includes('runQuery'));
  const body = JSON.parse(query[1].body);
  assert.equal(body.structuredQuery.where.fieldFilter.value.stringValue, 'classic');
  assert.equal(body.structuredQuery.limit, 500);
  assert.equal(body.structuredQuery.orderBy, undefined, 'sorting happens client-side (no composite index needed)');
});

test('fetchTopScores backfills a missing name from a lower entry', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: 'KEY', projectId: 'PROJ' } };
  fetchImpl = async (url) => {
    if (String(url).includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't4', localId: 'u4', expiresIn: '3600' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'abc123' }, name: { stringValue: '' }, score: { integerValue: '1200' }, tile: { integerValue: '256' }, at: { timestampValue: '2026-08-18T00:00:00Z' } } } },
        { document: { fields: { mode: { stringValue: 'classic' }, player: { stringValue: 'abc123' }, name: { stringValue: 'Ravi' }, score: { integerValue: '900' }, tile: { integerValue: '128' }, at: { timestampValue: '2026-08-17T00:00:00Z' } } } },
      ],
    };
  };
  const rows = await lb.fetchTopScores('classic', 10);
  assert.equal(rows.length, 1, 'one entry per player');
  assert.equal(rows[0].score, 1200, 'best score kept');
  assert.equal(rows[0].name, 'Ravi', 'name backfilled from lower entry');
});

test('top scores also work without any config (offline, empty list)', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: '', projectId: '' } };
  const rows = await lb.fetchTopScores('classic', 10);
  assert.deepEqual(rows, []);
});