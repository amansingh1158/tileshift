import { isConfigured } from './firebase-config.js';
import { fetchTopScores, flushQueue, getPlayerId, weekEndsAt, purgeExpiredScores } from './leaderboard.js';
import { showBanner } from './ads.js';
import { playGamesAvailable, playGamesAuthenticated, playGamesSignIn, playGamesSignOut, setPlayGamesName } from './play-games.js';
import { claimName, getDisplayName, setDisplayNameLocal, hasProfile, validateName } from './profile.js';
import { loadSettings, saveSettings } from './storage.js';

const MODES = [{ id: 'classic', label: 'Classic' }, { id: 'time', label: 'Time' }, { id: 'moves', label: 'Moves' }, { id: 'daily', label: 'Daily' }];
const $ = (s) => document.getElementById(s);
const tabsEl = $('lb-tabs'), listEl = $('lb-list'), statusEl = $('lb-status');
let currentMode = 'classic';

// --- Shared state ---
const HAS_ENTERED_KEY = 'tileshift:hasEnteredBoard';
const hasEnteredBoard = () => { try { return localStorage.getItem(HAS_ENTERED_KEY) === '1'; } catch { return false; } };
const settings = loadSettings();
const playGamesState = { available: false, authenticated: false };

// --- DOM refs (landing + auth) ---
const userSectionEl = $('user-section'), userChipEl = $('user-chip'), userChipNameEl = $('user-chip-name');
const loginScreenEl = $('login-screen'), loginPgWrapEl = $('login-pg-wrap'), loginPgBtnEl = $('login-pg-btn');
const loginNameInputEl = $('login-name-input'), loginNameBtnEl = $('login-name-btn'), loginNameMsgEl = $('login-name-msg'), loginSkipEl = $('login-skip');
const profileModalEl = $('profile-modal'), profileCurrentEl = $('profile-current'), profileNameInputEl = $('profile-name-input');
const profileMsgEl = $('profile-msg'), profileSaveEl = $('profile-save'), profileCloseEl = $('profile-close'), profileSignoutEl = $('profile-signout');

// --- Utils ---
const setMsg = (el, text, isErr = false) => { el.textContent = text; el.classList.toggle('err', isErr); };
const clearMsg = (el) => setMsg(el, '', false);
const refreshUserChip = () => {
  const n = getDisplayName();
  userSectionEl.hidden = !hasProfile();
  if (hasProfile()) userChipNameEl.textContent = n;
};

// --- Auth flow ---
const closeLogin = () => loginScreenEl.classList.add('hidden');
const openLogin = () => { refreshUserChip(); clearMsg(loginNameMsgEl); loginNameInputEl.value = ''; loginScreenEl.classList.remove('hidden'); };
const closeProfile = () => profileModalEl.classList.add('hidden');
const openProfile = () => {
  clearMsg(profileMsgEl);
  profileNameInputEl.value = getDisplayName();
  profileCurrentEl.textContent = hasProfile() ? `Signed in as ${getDisplayName()}` : 'Not signed in';
  profileSignoutEl.hidden = !((playGamesState?.authenticated) || hasProfile());
  profileModalEl.classList.remove('hidden');
};

async function handleLoginName(raw) {
  clearMsg(loginNameMsgEl);
  const v = validateName(raw);
  if (!v.ok) return setMsg(loginNameMsgEl, v.reason, true);
  const r = await claimName(v.name);
  if (!r.ok) return setMsg(loginNameMsgEl, r.reason, true);
  if (r.local) setMsg(loginNameMsgEl, 'Saved on this device (offline name).');
  closeLogin(); refreshUserChip(); render();
}

async function handlePlayGamesSignIn() {
  clearMsg(loginNameMsgEl);
  const r = await playGamesSignIn();
  if (r?.signedIn && r.displayName) {
    setPlayGamesName(r.displayName);
    const c = await claimName(r.displayName);
    if (!c.ok) return setMsg(loginNameMsgEl, `${c.reason} You can still type a different name.`, true);
    setMsg(loginNameMsgEl, `Signed in as ${r.displayName}.`); closeLogin(); refreshUserChip(); render();
  } else setMsg(loginNameMsgEl, `Sign-in failed${r?.error ? ` (${r.error})` : ''}. You can type a name instead.`, true);
}

async function saveProfile() {
  clearMsg(profileMsgEl);
  const v = validateName(profileNameInputEl.value);
  if (!v.ok) return setMsg(profileMsgEl, v.reason, true);
  const r = await claimName(v.name);
  if (!r.ok) return setMsg(profileMsgEl, r.reason, true);
  setMsg(profileMsgEl, r.local ? 'Saved on this device (offline name).' : `Name "${v.name}" is yours!`);
  closeProfile(); refreshUserChip(); render();
}

function bindProfileUI() {
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  if (userChipEl) { userChipEl.style.cursor = 'pointer'; on(userChipEl, 'click', openProfile); }
  on(loginSkipEl, 'click', closeLogin);
  on(loginNameBtnEl, 'click', () => handleLoginName(loginNameInputEl.value));
  on(loginNameInputEl, 'keydown', (e) => e.key === 'Enter' && handleLoginName(loginNameInputEl.value));
  on(loginPgBtnEl, 'click', handlePlayGamesSignIn);
  on(profileSaveEl, 'click', saveProfile);
  on(profileCloseEl, 'click', closeProfile);
  on(profileSignoutEl, 'click', async () => { setDisplayNameLocal(''); try { await playGamesSignOut(); } catch {} closeProfile(); refreshUserChip(); render(); });
  for (const [id, key] of [['toggle-sound', 'sound'], ['toggle-vibration', 'vibration']]) {
    const el = $(id);
    if (!el) continue;
    el.checked = settings[key];
    on(el, 'change', () => { settings[key] = el.checked; saveSettings(settings); });
  }
}

// --- Leaderboard (compact + live) ---
const playerLabel = (row) => (row.player === getPlayerId() ? 'You' : (row.name || `Player #${String(row.player || '').slice(-4) || '????'}`));
const renderNote = (text) => { listEl.innerHTML = `<li class="lb-note">${text}</li>`; };
const renderRows = (rows) => {
  if (!rows.length) return renderNote('No scores yet — be the first!');
  const frag = document.createDocumentFragment();
  rows.forEach((r, i) => {
    const li = document.createElement('li'); li.className = 'lb-row';
    li.innerHTML = `<span class="lb-rank${i < 3 ? ` top${i + 1}` : ''}">${i + 1}</span><span class="lb-name"></span><span class="lb-score">${r.score}</span>`;
    li.querySelector('.lb-name').textContent = playerLabel(r);
    frag.appendChild(li);
  });
  listEl.innerHTML = ''; listEl.appendChild(frag);
};

async function render() {
  if (!isConfigured()) { renderNote('Leaderboard is disabled — set up Firebase to play online.'); statusEl.textContent = ''; return; }
  renderNote('Loading…'); statusEl.textContent = '';
  try { await flushQueue(); renderRows(await fetchTopScores(currentMode, 10)); }
  catch (e) { renderNote('Could not reach the leaderboard. Check your connection.'); statusEl.textContent = String(e?.message || e || ''); }
}

// Live 2-sec polling — senior logic: single timer, busy guard, visibility-aware, only after board visit
let pollId = null, busy = false;
const silentRefresh = async () => {
  if (busy || !isConfigured() || document.visibilityState !== 'visible' || !hasEnteredBoard()) return;
  busy = true;
  try { renderRows(await fetchTopScores(currentMode, 10)); statusEl.textContent = ''; } catch {} finally { busy = false; }
};
const startPolling = () => { if (pollId) return; pollId = setInterval(silentRefresh, 2000); };
const stopPolling = () => { if (pollId) clearInterval(pollId); pollId = null; };

function buildTabs() {
  tabsEl.innerHTML = '';
  MODES.forEach((m) => {
    const b = document.createElement('button'); b.textContent = m.label;
    b.addEventListener('click', () => { currentMode = m.id; tabsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); render(); });
    tabsEl.appendChild(b);
  });
  tabsEl.firstChild?.classList.add('active');
}

async function initPlayGames() {
  try {
    playGamesState.available = await playGamesAvailable();
    playGamesState.authenticated = await playGamesAuthenticated();
    if (playGamesState.available) loginPgWrapEl.hidden = false;
  } catch {}
}

// --- Boot ---
const weekNoteEl = $('lb-week');
function renderWeekNote() {
  if (!weekNoteEl) return;
  const ms = weekEndsAt().getTime() - Date.now();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000) % 24;
  weekNoteEl.textContent = days > 0 ? `Resets in ${days}d ${hours}h` : `Resets in ${Math.max(1, hours)}h`;
}
renderWeekNote();
setInterval(renderWeekNote, 60000);
buildTabs(); bindProfileUI(); render();
window.addEventListener('online', render);
window.addEventListener('focus', silentRefresh);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && silentRefresh());
startPolling(); window.addEventListener('pagehide', stopPolling);
showBanner();
purgeExpiredScores();

(async () => {
  await initPlayGames(); refreshUserChip();
  if (!hasProfile()) {
    if (playGamesState.available && !playGamesState.authenticated) await handlePlayGamesSignIn();
    if (!hasProfile()) openLogin();
  }
})();
