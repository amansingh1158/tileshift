import { isConfigured } from './firebase-config.js';
import { fetchTopScores, flushQueue, getPlayerId } from './leaderboard.js';
import { showBanner } from './ads.js';
import { getPlayGamesName, playGamesAvailable, playGamesAuthenticated, playGamesSignIn, playGamesSignOut, setPlayGamesName } from './play-games.js';
import { claimName, getDisplayName, setDisplayNameLocal, hasProfile, validateName } from './profile.js';
import { loadSettings, saveSettings } from './storage.js';

const MODES = [
  { id: 'classic', label: 'Classic' },
  { id: 'time', label: 'Time' },
  { id: 'moves', label: 'Moves' },
  { id: 'daily', label: 'Daily' },
];

const tabsEl = document.getElementById('lb-tabs');
const listEl = document.getElementById('lb-list');
const statusEl = document.getElementById('lb-status');
let currentMode = 'classic';

// ---- Profile / login UI ----
const userSectionEl = document.getElementById('user-section');
const userChipEl = document.getElementById('user-chip');
const userChipNameEl = document.getElementById('user-chip-name');
const loginScreenEl = document.getElementById('login-screen');
const loginPgWrapEl = document.getElementById('login-pg-wrap');
const loginPgBtnEl = document.getElementById('login-pg-btn');
const loginNameInputEl = document.getElementById('login-name-input');
const loginNameBtnEl = document.getElementById('login-name-btn');
const loginNameMsgEl = document.getElementById('login-name-msg');
const loginSkipEl = document.getElementById('login-skip');
const profileModalEl = document.getElementById('profile-modal');
const profileCurrentEl = document.getElementById('profile-current');
const profileNameInputEl = document.getElementById('profile-name-input');
const profileMsgEl = document.getElementById('profile-msg');
const profileSaveEl = document.getElementById('profile-save');
const profileCloseEl = document.getElementById('profile-close');
const profileSignoutEl = document.getElementById('profile-signout');
const settings = loadSettings();

function showError(el, text) {
  el.textContent = text;
  el.classList.add('err');
}

function clearMsg(el) {
  el.textContent = '';
  el.classList.remove('err');
}

function refreshUserChip() {
  const name = getDisplayName();
  if (hasProfile()) {
    userSectionEl.hidden = false;
    userChipNameEl.textContent = name;
  } else {
    userSectionEl.hidden = true;
  }
}

async function handleLoginName(raw) {
  clearMsg(loginNameMsgEl);
  const v = validateName(raw);
  if (!v.ok) {
    showError(loginNameMsgEl, v.reason);
    return;
  }
  const res = await claimName(v.name);
  if (!res.ok) {
    showError(loginNameMsgEl, res.reason);
    return;
  }
  if (res.local) {
    loginNameMsgEl.textContent = 'Saved on this device (offline name).';
  }
  closeLogin();
  refreshUserChip();
  render();
}

async function handlePlayGamesSignIn() {
  clearMsg(loginNameMsgEl);
  const res = await playGamesSignIn();
  if (res && res.signedIn && res.displayName) {
    setPlayGamesName(res.displayName);
    const claimed = await claimName(res.displayName);
    if (!claimed.ok) {
      showError(loginNameMsgEl, `${claimed.reason} You can still type a different name.`);
    } else {
      loginNameMsgEl.textContent = `Signed in as ${res.displayName}.`;
      closeLogin();
      refreshUserChip();
      render();
    }
  } else {
    showError(loginNameMsgEl, 'Sign-in cancelled. You can type a name instead.');
  }
}

function openLogin() {
  refreshUserChip();
  clearMsg(loginNameMsgEl);
  loginNameInputEl.value = '';
  loginScreenEl.classList.remove('hidden');
}

function closeLogin() {
  loginScreenEl.classList.add('hidden');
}

function openProfile() {
  clearMsg(profileMsgEl);
  profileNameInputEl.value = getDisplayName();
  profileCurrentEl.textContent = hasProfile() ? `Signed in as ${getDisplayName()}` : 'Not signed in';
  profileSignoutEl.hidden = !((playGamesState && playGamesState.authenticated) || hasProfile());
  profileModalEl.classList.remove('hidden');
}

function closeProfile() {
  profileModalEl.classList.add('hidden');
}

async function saveProfile() {
  clearMsg(profileMsgEl);
  const v = validateName(profileNameInputEl.value);
  if (!v.ok) {
    showError(profileMsgEl, v.reason);
    return;
  }
  const res = await claimName(v.name);
  if (!res.ok) {
    showError(profileMsgEl, res.reason);
    return;
  }
  profileMsgEl.textContent = res.local ? 'Saved on this device (offline name).' : `Name "${v.name}" is yours!`;
  closeProfile();
  refreshUserChip();
  render();
}

const playGamesState = { available: false, authenticated: false };

function bindProfileUI() {
  if (userChipEl) {
    userChipEl.addEventListener('click', openProfile);
    userChipEl.style.cursor = 'pointer';
  }
  if (loginSkipEl) loginSkipEl.addEventListener('click', closeLogin);
  if (loginNameBtnEl) {
    loginNameBtnEl.addEventListener('click', () => handleLoginName(loginNameInputEl.value));
  }
  if (loginNameInputEl) {
    loginNameInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLoginName(loginNameInputEl.value);
    });
  }
  if (loginPgBtnEl) loginPgBtnEl.addEventListener('click', handlePlayGamesSignIn);
  if (profileSaveEl) profileSaveEl.addEventListener('click', saveProfile);
  if (profileCloseEl) profileCloseEl.addEventListener('click', closeProfile);
  if (profileSignoutEl) {
    profileSignoutEl.addEventListener('click', async () => {
      setDisplayNameLocal('');
      try {
        await playGamesSignOut();
      } catch (e) {
        // ignore
      }
      closeProfile();
      refreshUserChip();
      render();
    });
  }
}

// ---- Leaderboard ----
function playerLabel(row) {
  if (row.player === getPlayerId()) return 'You';
  return row.name || getDisplayName() || `Player #${row.player.slice(-4)}`;
}

function renderNote(text) {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'lb-note';
  li.textContent = text;
  listEl.appendChild(li);
}

function renderRows(rows) {
  listEl.innerHTML = '';
  if (!rows.length) {
    renderNote('No scores yet — be the first!');
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'lb-row';
    const rank = document.createElement('span');
    rank.className = `lb-rank${i < 3 ? ` top${i + 1}` : ''}`;
    rank.textContent = String(i + 1);
    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = playerLabel(row);
    const score = document.createElement('span');
    score.className = 'lb-score';
    score.textContent = String(row.score);
    li.append(rank, name, score);
    listEl.appendChild(li);
  });
}

async function render() {
  if (!isConfigured()) {
    renderNote('Leaderboard is disabled — set up Firebase to play online.');
    statusEl.textContent = '';
    return;
  }
  renderNote('Loading\u2026');
  statusEl.textContent = '';
  try {
    await flushQueue();
    const rows = await fetchTopScores(currentMode, 10);
    renderRows(rows);
  } catch (e) {
    renderNote('Could not reach the leaderboard. Check your connection.');
    statusEl.textContent = '';
  }
}

function buildTabs() {
  tabsEl.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.addEventListener('click', () => {
      currentMode = m.id;
      tabsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
    tabsEl.appendChild(b);
  }
  tabsEl.firstChild.classList.add('active');
}

const playGamesState = { available: false, authenticated: false };

async function initPlayGames() {
  try {
    playGamesState.available = await playGamesAvailable();
    playGamesState.authenticated = await playGamesAuthenticated();
    if (playGamesState.available) loginPgWrapEl.hidden = false;
  } catch (e) {
    // Play Games unavailable — login screen still allows a typed name
  }
}

buildTabs();
bindProfileUI();
render();
window.addEventListener('online', render);
showBanner();

(async () => {
  await initPlayGames();
  refreshUserChip();
  // Existing users without a saved identity get a dedicated login screen once.
  if (!hasProfile() && !playGamesState.authenticated) openLogin();
})();