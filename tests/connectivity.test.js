import { test } from 'node:test';
import assert from 'node:assert/strict';

const connectivity = await import('../app/js/connectivity.js');

// In the Node test env the reachability probe must never touch the network —
// hasInternet resolves straight from navigator.onLine.
test('connectivity: isOnline reflects navigator.onLine', () => {
  Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
  assert.equal(connectivity.isOnline(), true);
  Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true });
  assert.equal(connectivity.isOnline(), false);
});

test('connectivity: hasInternet never fetches in the test environment', async () => {
  Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
  const fetchSpy = async () => { throw new Error('must not be called'); };
  const orig = global.fetch;
  global.fetch = fetchSpy;
  try {
    assert.equal(await connectivity.hasInternet(50), true, 'test env resolves online');
  } finally {
    global.fetch = orig;
  }
});

test('connectivity: probeReachable uses no-cors so CORS cannot block reachability', async () => {
  const seen = [];
  const orig = global.fetch;
  global.fetch = async (url, init) => {
    seen.push({ mode: init.mode, url });
    return { type: 'opaque' };
  };
  try {
    assert.equal(await connectivity.probeReachable(3000), true, 'first endpoint responds');
  } finally {
    global.fetch = orig;
  }
  assert.equal(seen.length > 0, true, 'probed at least one endpoint');
  assert.equal(seen[0].mode, 'no-cors');
});

test('connectivity: probeReachable falls through endpoints then reports offline', async () => {
  const orig = global.fetch;
  global.fetch = async () => { throw new TypeError('network failure'); };
  try {
    assert.equal(await connectivity.probeReachable(3000), false, 'all endpoints failed');
  } finally {
    global.fetch = orig;
  }
});