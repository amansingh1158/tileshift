import { isConfigured } from './firebase-config.js';
import { fetchTopScores, flushQueue, getPlayerId } from './leaderboard.js';

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

function playerLabel(player) {
  return player === getPlayerId() ? 'You' : `Player #${player.slice(-4)}`;
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
    name.textContent = playerLabel(row.player);
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
    statusEl.textContent = 'Scores sync to Firebase when a game ends.';
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

buildTabs();
render();
window.addEventListener('online', render);