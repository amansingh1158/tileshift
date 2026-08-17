import { Capacitor } from '../vendor/@capacitor/core/index.js';
import { Haptics, ImpactStyle, NotificationType } from '../vendor/@capacitor/haptics/index.js';
import { COMBO_BONUS, DIRECTIONS, MODES, Game, highestTile } from './engine.js';
import { isConfigured as leaderboardConfigured } from './firebase-config.js';
import { submitScore } from './leaderboard.js';
import {
  bestScoreFor,
  loadSettings,
  loadState,
  loadStats,
  saveBestScore,
  saveSettings,
  saveState,
  saveStats,
} from './storage.js';
import { BoardView, THEMES } from './ui.js';

const $ = (sel) => document.querySelector(sel);
const isNative = Capacitor.isNativePlatform();

const scoreEl = $('#score');
const bestEl = $('#best');
const undoBtn = $('#undo');

const TIME_LIMIT_MS = 180000; // 3 minutes
const MOVES_LIMIT = 100;

const BOARD_SIZES = [
  { rows: 4, cols: 4, label: 'Classic 4×4' },
  { rows: 3, cols: 3, label: '3×3' },
  { rows: 5, cols: 5, label: '5×5' },
  { rows: 6, cols: 6, label: '6×6' },
  { rows: 7, cols: 7, label: '7×7' },
  { rows: 8, cols: 8, label: '8×8' },
  { rows: 3, cols: 5, label: '3×5' },
  { rows: 4, cols: 6, label: '4×6' },
  { rows: 5, cols: 7, label: '5×7' },
  { rows: 6, cols: 9, label: '6×9' },
];

const settings = loadSettings();
settings.mode = modeFromUrl();
saveSettings(settings);
let game = null;
let stats = loadStats();
let prevOver = false;
let prevWon = false;
let timerId = null;
let toastTimer = null;

const boardView = new BoardView($('#board'));
boardView.setTheme(settings.theme);

function dailyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createGame() {
  const isDaily = settings.mode === MODES.DAILY;
  return new Game({
    rows: isDaily ? 4 : settings.rows,
    cols: isDaily ? 4 : settings.cols,
    mode: settings.mode,
    movesLimit: MOVES_LIMIT,
    timeLimit: TIME_LIMIT_MS,
    dailyKey: isDaily ? dailyKey() : null,
  });
}

// ---- Haptics (Android only) ----
async function hapticImpact(style) {
  if (!isNative) return;
  try {
    await Haptics.impact({ style });
  } catch (e) {
    // ignore
  }
}

async function hapticNotify(type) {
  if (!isNative) return;
  try {
    await Haptics.notification({ type });
  } catch (e) {
    // ignore
  }
}

// ---- Mode from URL ----
function modeFromUrl() {
  const m = new URLSearchParams(window.location.search).get('mode');
  return Object.values(MODES).includes(m) ? m : MODES.CLASSIC;
}

// ---- HUD ----
function renderHudExtra() {
  const wrap = $('#hud-extra');
  if (game.mode === MODES.TIME) {
    wrap.innerHTML = `
      <div class="timer-bar"><div id="timer-fill" class="timer-fill"></div></div>
      <span class="chip" id="time-chip">3:00</span>`;
    updateTimerHud();
  } else if (game.mode === MODES.MOVES) {
    wrap.innerHTML = `
      <span class="chip">Moves <b id="moves-left">${game.movesLeft}</b></span>
      <span class="chip">Target ${game.target}</span>`;
  } else if (game.mode === MODES.DAILY) {
    wrap.innerHTML = `<span class="chip daily-chip">Daily ${game.dailyKey}</span><span class="chip">Target ${game.target}</span>`;
  } else {
    wrap.innerHTML = `<span class="chip">Target ${game.target}</span>`;
  }
}

function updateTimerHud() {
  const fill = $('#timer-fill');
  const chip = $('#time-chip');
  if (!fill || !chip) return;
  fill.style.width = `${Math.max(0, (game.timeLeft / game.timeLimit) * 100)}%`;
  fill.classList.toggle('low', game.timeLeft / game.timeLimit < 0.25);
  const s = Math.ceil(game.timeLeft / 1000);
  chip.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud() {
  scoreEl.textContent = game.score;
  bestEl.textContent = Math.max(game.best, bestScoreFor(game));
  undoBtn.disabled = !game.canUndo();
  if (game.mode === MODES.MOVES) {
    const el = $('#moves-left');
    if (el) el.textContent = game.movesLeft;
  }
  saveBest();
}

function saveBest() {
  if (game.best > bestScoreFor(game)) saveBestScore(game);
}

// ---- Overlays ----
function hideOverlays() {
  $('#win-overlay').classList.add('hidden');
  $('#game-over-overlay').classList.add('hidden');
}

function showWin() {
  const movesMode = game.mode === MODES.MOVES;
  $('#win-title').textContent = movesMode ? 'Level Complete!' : 'You win!';
  $('#win-subtitle').textContent = movesMode
    ? `Reached the ${game.target} tile in ${MOVES_LIMIT - game.movesLeft} moves!`
    : `You reached the ${game.target} tile.`;
  $('#win-continue').classList.toggle('hidden', movesMode);
  $('#win-overlay').classList.remove('hidden');
  hapticNotify(NotificationType.Success);
}

function showGameOver() {
  const titles = {
    [MODES.MOVES]: 'Out of Moves!',
    [MODES.TIME]: "Time's Up!",
  };
  $('#over-title').textContent = titles[game.mode] || 'Game Over';
  $('#over-score').textContent = game.score;
  $('#game-over-overlay').classList.remove('hidden');
}

function recordGameEnd() {
  stats.games += 1;
  stats.bestTile = Math.max(stats.bestTile, highestTile(game.board));
  stats.bestScore = Math.max(stats.bestScore, game.score);
  saveStats(stats);
  if (leaderboardConfigured() && game.score > 0) {
    submitScore(game.mode, { score: game.score, tile: stats.bestTile }).catch(() => {});
  }
}

function checkEnd() {
  if (game.won && !prevWon) {
    prevWon = true;
    showWin();
  }
  if (game.over && !prevOver) {
    prevOver = true;
    recordGameEnd();
    showGameOver();
  }
}

// ---- Combo toast ----
const toast = $('#combo-toast');

toast.addEventListener('animationend', (e) => {
  if (e.animationName !== 'combo-pop') return;
  toast.classList.add('hidden');
  toast.classList.remove('pop');
});

function showCombo(count, bonus) {
  toast.textContent = `COMBO x${count}  +${bonus}`;
  toast.classList.remove('hidden');
  toast.classList.remove('pop');
  void toast.offsetWidth; // restart animation
  toast.classList.add('pop');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('pop');
  }, 900);
}

// ---- Game flow ----
function newGame() {
  clearTimer();
  game = createGame();
  game.reset();
  prevOver = false;
  prevWon = false;
  boardView.setSize(game.rows, game.cols);
  boardView.render(game, { spawnAll: true });
  hideOverlays();
  renderHudExtra();
  updateHud();
  saveState(game);
  $('#board-size').disabled = settings.mode === MODES.DAILY;
  if (game.mode === MODES.TIME) startTimer();
}

function tryMove(dir) {
  if (!game || game.over) return;
  const moved = game.attemptMove(dir);
  if (!moved) return;
  stats.moves += 1;
  stats.merges += game.lastCombo;
  saveStats(stats);
  boardView.applyMove(game, game.lastSpawnIndex);
  updateHud();
  saveState(game);
  if (game.lastCombo >= 1) hapticImpact(game.lastCombo >= 3 ? ImpactStyle.Medium : ImpactStyle.Light);
  if (game.lastCombo >= 2) showCombo(game.lastCombo, (game.lastCombo - 1) * COMBO_BONUS);
  checkEnd();
}

function doUndo() {
  if (!game || !game.canUndo()) return;
  game.undo();
  boardView.render(game);
  hideOverlays();
  prevOver = false;
  prevWon = false;
  updateHud();
  if (game.mode === MODES.TIME) updateTimerHud();
  saveState(game);
}

function startTimer() {
  clearTimer();
  timerId = setInterval(() => {
    game.tick(250);
    updateTimerHud();
    saveState(game);
    if (game.over) {
      clearTimer();
      checkEnd();
    }
  }, 250);
}

function clearTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

// Pause the clock when the app goes to the background.
window.addEventListener('pagehide', clearTimer);
window.addEventListener('visibilitychange', () => {
  if (
    document.visibilityState === 'visible' &&
    game &&
    game.mode === MODES.TIME &&
    !game.over &&
    !game.won
  ) {
    startTimer();
  }
});

// ---- Stats modal ----
function renderStats() {
  $('#stat-games').textContent = stats.games;
  $('#stat-moves').textContent = stats.moves;
  $('#stat-merges').textContent = stats.merges;
  $('#stat-tile').textContent = stats.bestTile;
  $('#stat-best').textContent = stats.bestScore;
}

$('#stats-btn').addEventListener('click', () => {
  renderStats();
  $('#stats-modal').classList.remove('hidden');
});

$('#stats-close').addEventListener('click', () => {
  $('#stats-modal').classList.add('hidden');
});

$('#stats-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('#stats-modal').classList.add('hidden');
});

// ---- Input: keyboard ----
const KEY_DIRS = {
  ArrowUp: DIRECTIONS.UP,
  ArrowDown: DIRECTIONS.DOWN,
  ArrowLeft: DIRECTIONS.LEFT,
  ArrowRight: DIRECTIONS.RIGHT,
  w: DIRECTIONS.UP,
  s: DIRECTIONS.DOWN,
  a: DIRECTIONS.LEFT,
  d: DIRECTIONS.RIGHT,
  W: DIRECTIONS.UP,
  S: DIRECTIONS.DOWN,
  A: DIRECTIONS.LEFT,
  D: DIRECTIONS.RIGHT,
};

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.key];
  if (dir) {
    e.preventDefault();
    tryMove(dir);
  }
});

// ---- Input: pointer (swipe + mouse drag) ----
const boardEl = $('#board');
let ptrStart = null;
const SWIPE_THRESHOLD = 20;

boardEl.addEventListener('pointerdown', (e) => {
  ptrStart = { x: e.clientX, y: e.clientY };
  boardEl.setPointerCapture(e.pointerId);
});

boardEl.addEventListener('pointerup', (e) => {
  if (!ptrStart) return;
  const dx = e.clientX - ptrStart.x;
  const dy = e.clientY - ptrStart.y;
  ptrStart = null;
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    tryMove(dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
  } else {
    tryMove(dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
  }
});

// On-screen D-pad
document.querySelectorAll('.dpad button').forEach((btn) => {
  btn.addEventListener('click', () => tryMove(btn.dataset.dir));
});

// ---- Controls ----
$('#new-game').addEventListener('click', newGame);
undoBtn.addEventListener('click', doUndo);

$('#board-size').addEventListener('change', (e) => {
  const s = BOARD_SIZES[Number(e.target.value)];
  settings.rows = s.rows;
  settings.cols = s.cols;
  saveSettings(settings);
  newGame();
});

$('#theme').addEventListener('change', (e) => {
  settings.theme = e.target.value;
  boardView.setTheme(settings.theme);
  saveSettings(settings);
  boardView.render(game);
});

$('#win-continue').addEventListener('click', () => {
  game.continueAfterWin();
  hideOverlays();
  prevWon = false;
  updateHud();
  saveState(game);
});

$('#win-new').addEventListener('click', newGame);
$('#over-new').addEventListener('click', newGame);

// ---- Build selects ----
function buildSizeOptions() {
  const sel = $('#board-size');
  sel.innerHTML = '';
  BOARD_SIZES.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = s.label;
    sel.appendChild(opt);
  });
  const idx = BOARD_SIZES.findIndex((s) => s.rows === settings.rows && s.cols === settings.cols);
  sel.value = String(idx >= 0 ? idx : 0);
}

function buildThemeOptions() {
  const sel = $('#theme');
  sel.innerHTML = '';
  for (const [key, t] of Object.entries(THEMES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t.label;
    sel.appendChild(opt);
  }
  sel.value = settings.theme;
}

// ---- Boot ----
buildSizeOptions();
buildThemeOptions();
$('#board-size').disabled = settings.mode === MODES.DAILY;

game = createGame();
const saved = loadState(game);
if (
  saved &&
  saved.rows === game.rows &&
  saved.cols === game.cols &&
  saved.mode === game.mode &&
  saved.dailyKey === game.dailyKey
) {
  game = Game.deserialize(saved);
} else {
  game.reset();
}

prevOver = game.over;
prevWon = game.won;
boardView.setSize(game.rows, game.cols);
boardView.render(game);
if (game.won && !game.continued) showWin();
else if (game.over) showGameOver();
renderHudExtra();
updateHud();
if (game.mode === MODES.TIME) startTimer();