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
  assert.equal(await connectivity.hasInternet(50), true, 'test env resolves online');
});