// Connectivity gate — the game now requires an active internet connection.
// On boot we check navigator.onLine plus a lightweight reachability probe.
// While offline the app shows a blocker overlay and login/gameplay are halted.

// Detect test/headless environments (Node test runner or jsdom) so the
// reachability probe never fires real network requests during the test suite.
function isTestEnv() {
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) return true;
    return /jsdom/.test(navigator.userAgent);
  } catch (e) {
    return false;
  }
}

export function isOnline() {
  try {
    return navigator.onLine !== false;
  } catch (e) {
    return true;
  }
}

const PROBE_URL = 'https://firestore.googleapis.com/';

// Returns true when real network reachability is confirmed (any HTTP response
// counts — even 4xx/5xx proves a route exists). Fails fast on dead networks.
export async function hasInternet(timeoutMs = 4000) {
  if (isTestEnv()) return isOnline();
  if (typeof fetch === 'undefined') return isOnline();
  if (!isOnline()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROBE_URL}?probe=${Date.now()}`, {
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const OVERLAY_ID = 'offline-overlay';

export function showOffline() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.classList.remove('hidden');
}

export function hideOffline() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.classList.add('hidden');
}

// Boot helper: when offline this returns false and shows the blocker overlay.
// On regaining connectivity the page reloads so the app boots fresh online.
export async function gateOnline() {
  const online = await hasInternet();
  if (online) {
    hideOffline();
    return true;
  }
  showOffline();

  const reload = () => window.location.reload();
  window.addEventListener('online', reload, { once: true });
  const retry = document.getElementById('offline-retry');
  if (retry) retry.addEventListener('click', reload);
  return false;
}

export function gateOnlineSync() {
  if (isOnline()) {
    hideOffline();
    return true;
  }
  showOffline();
  return false;
}