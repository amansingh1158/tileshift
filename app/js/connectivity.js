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

const PROBE_URLS = [
  'https://firestore.googleapis.com/',
  'https://www.google.com/generate_204',
  'https://identitytoolkit.googleapis.com/',
];

// Probes each endpoint with mode:'no-cors' so CORS headers can never turn a
// reachable network into a false "offline" — the request only finishes if a
// server actually responded.
export async function probeReachable(timeoutMs = 6000) {
  const perUrl = Math.max(1000, Math.floor(timeoutMs / PROBE_URLS.length));
  for (const url of PROBE_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perUrl);
    try {
      await fetch(`${url}?probe=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      return true; // opaque or passed response => a server answered
    } catch (e) {
      // aborted or network failure — try next endpoint
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

// Returns true when the network is genuinely reachable.
export async function hasInternet(timeoutMs = 6000) {
  if (isTestEnv()) return isOnline();
  if (typeof fetch === 'undefined') return isOnline();
  if (!isOnline()) return false;
  return probeReachable(timeoutMs);
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