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
  return { ok: false, status: 404, json: async () => ({}) };
};

const profile = await import('../app/js/profile.js');

const namedFetch = (url) => String(url).includes('/users/');

function configuredWindow() {
  global.window = { TILESHIFT_FIREBASE: { apiKey: 'KEY', projectId: 'PROJ' } };
}

beforeEach(() => {
  store.clear();
  fetchLog = [];
  fetchImpl = null;
  global.window = { TILESHIFT_FIREBASE: { apiKey: '', projectId: '' } };
});

test('validateName rejects too-short, too-long and invalid characters', () => {
  assert.equal(profile.validateName('ab').ok, false, '2 chars rejected');
  assert.equal(profile.validateName('a'.repeat(21)).ok, false, '21 chars rejected');
  assert.equal(profile.validateName('bad@name').ok, false, 'symbols rejected');
  assert.equal(profile.validateName('  Cool  Player ').ok, true, 'trim + collapse spaces');
  assert.equal(profile.validateName('  Cool  Player ').name, 'Cool Player');
});

test('claimName without config saves locally and marks local', async () => {
  global.window = { TILESHIFT_FIREBASE: { apiKey: '', projectId: '' } };
  const res = await profile.claimName('Luna');
  assert.equal(res.ok, true);
  assert.equal(res.local, true);
  assert.equal(profile.getDisplayName(), 'Luna');
  assert.equal(fetchLog.length, 0, 'no network calls without backend');
});

test('claimName claims a free name to Firestore users collection', async () => {
  configuredWindow();
  let userDocs = 0;
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't', localId: 'player-1', expiresIn: '3600' }) };
    }
    if (namedFetch(u)) {
      userDocs += 1;
      if (userDocs === 1) return { ok: false, status: 404, json: async () => ({}) }; // free name check
      return { ok: true, status: 200, json: async () => ({}) }; // claim succeeds
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = await profile.claimName('Astra');
  assert.equal(res.ok, true);
  assert.equal(res.local, false);
  assert.equal(profile.getDisplayName(), 'Astra');
  const writes = fetchLog.filter(([u]) => namedFetch(String(u)) && String(u).startsWith('http'));
  assert.equal(writes.length, 2, 'one check read + one claim write for the users doc');
  const body = JSON.parse(writes[1][1].body);
  assert.equal(body.fields.player.stringValue, 'player-1');
  assert.equal(body.fields.name.stringValue, 'Astra');
});

test('claimName rejects a name owned by another player', async () => {
  configuredWindow();
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't', localId: 'player-1', expiresIn: '3600' }) };
    }
    if (namedFetch(u)) {
      return { ok: true, status: 200, json: async () => ({ fields: { player: { stringValue: 'player-9' } } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const res = await profile.claimName('Astra');
  assert.equal(res.ok, false);
  assert.match(res.reason, /already taken/);
});

test('claimName lets the owner reclaim their own name', async () => {
  configuredWindow();
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('identitytoolkit')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 't', localId: 'player-1', expiresIn: '3600' }) };
    }
    if (namedFetch(u)) {
      return { ok: true, status: 200, json: async () => ({ fields: { player: { stringValue: 'player-1' } } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const res = await profile.claimName('Astra');
  assert.equal(res.ok, true);
  assert.equal(profile.getDisplayName(), 'Astra');
});

test('claimName falls back to device-local when the backend write fails', async () => {
  configuredWindow();
  fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const res = await profile.claimName('Orion');
  assert.equal(res.ok, true);
  assert.equal(res.local, true, 'name survives on the device');
  assert.equal(profile.getDisplayName(), 'Orion');
});