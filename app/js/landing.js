import { isConfigured } from './firebase-config.js';
import { getIdentity, isNative, signInWithFacebook, signOutFacebook } from './fb-auth.js';
import { fetchTopScores, flushQueue, getPlayerId } from './leaderboard.js';
import { showBanner } from './ads.js';

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

function playerLabel(row) {
  if (row.player === getPlayerId()) return 'You';
  return row.name || `Player #${row.player.slice(-4)}`;
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

// ---- Facebook sign-in ----
const fbArea = document.getElementById('fb-area');
const fbBtn = document.getElementById('fb-btn');
const fbStatus = document.getElementById('fb-status');

function renderFbArea() {
  const identity = getIdentity();
  if (identity && identity.name) {
    fbBtn.textContent = 'Sign out';
    fbBtn.onclick = async () => {
      await signOutFacebook();
      renderFbArea();
      render();
    };
    fbStatus.textContent = `Signed in as ${identity.name}`;
  } else {
    fbBtn.textContent = 'Sign in with Facebook';
    fbBtn.onclick = async () => {
      fbStatus.textContent = 'Connecting\u2026';
      try {
        await signInWithFacebook();
        fbStatus.textContent = `Signed in as ${getIdentity().name || 'Facebook user'}`;
        renderFbArea();
        render();
      } catch (e) {
        fbStatus.textContent = 'Sign-in failed. Check Facebook setup and try again.';
      }
    };
    fbStatus.textContent = '';
  }
}

if (isNative()) {
  fbArea.classList.remove('hidden');
  renderFbArea();
}

buildTabs();
render();
window.addEventListener('online', render);
showBanner();