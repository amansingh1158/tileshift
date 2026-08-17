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

const fb = await import('../app/js/fb-auth.js');
const lb = await import('../app/js/leaderboard.js');

beforeEach(() => {
  store.clear();
  fetchLog = [];
  fetchImpl = null;
  global.window = {};
});

test('exchangeFacebookToken swaps a FB token for a Firebase identity', async () => {
  fetchImpl = async (url) => {
    assert.ok(String(url).includes('identitytoolkit.googleapis.com/v1/accounts:signInWithIdp'));
    assert.ok(String(url).includes('AIzaSyCwtXi6ENesA1Tug8tBqm5kRQETFSvkwsI'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        idToken: 'fb-id-token',
        localId: 'fb-uid-9',
        displayName: 'John Doe',
        photoUrl: 'https://graph.facebook.com/9/picture',
        expiresIn: '3600',
      }),
    };
  };
  const data = await fb.exchangeFacebookToken('fb-access-token-xyz');
  assert.equal(data.localId, 'fb-uid-9');
  assert.deepEqual(fb.getIdentity(), { uid: 'fb-uid-9', name: 'John Doe', photo: 'https://graph.facebook.com/9/picture' });
  assert.equal(lb.getPlayerId(), 'fb-uid-9', 'leaderboard player id switched to FB uid');
  const body = JSON.parse(fetchLog[0][1].body);
  assert.ok(body.postBody.includes('access_token=fb-access-token-xyz'));
  assert.ok(body.postBody.includes('providerId=facebook.com'));
  assert.ok(body.requestUri.endsWith('/__/auth/handler'));
});

test('a failed exchange throws and stores nothing', async () => {
  fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({}) });
  await assert.rejects(() => fb.exchangeFacebookToken('bad-token'));
  assert.equal(fb.getIdentity(), null);
  assert.equal(lb.getPlayerId(), '', 'player id unchanged');
});

test('subsequent score submissions use the Facebook identity', async () => {
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('signInWithIdp')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't', localId: 'fb-uid-9', displayName: 'John Doe', expiresIn: '3600' }) };
    }
    if (u.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'anon', localId: 'anon-1', expiresIn: '3600' }) };
    }
    if (u.includes('documents/scores')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await fb.exchangeFacebookToken('tok');
  fetchLog = [];
  await lb.submitScore('classic', { score: 300, tile: 64, name: 'John Doe' });
  const posts = fetchLog.filter(([u]) => String(u).includes('documents/scores'));
  assert.equal(posts.length, 1);
  const body = JSON.parse(posts[0][1].body);
  assert.equal(body.fields.player.stringValue, 'fb-uid-9');
  assert.equal(body.fields.name.stringValue, 'John Doe');
});