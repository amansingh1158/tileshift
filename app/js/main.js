import { DIRECTIONS, Game } from './engine.js';
import { loadState, loadSettings, saveSettings, saveState } from './storage.js';
import { BoardView, THEMES } from './ui.js';

const $ = (sel) => document.querySelector(sel);

const scoreEl = $('#score');
const bestEl = $('#best');
const winOverlay = $('#win-overlay');
const overOverlay = $('#game-over-overlay');
const winScore = $('#win-score');
const overScore = $('#over-score');
const undoBtn = $('#undo');

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
let game = null;
let currentBest = 0;

const boardView = new BoardView($('#board'));
boardView.setTheme(settings.theme);

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

function updateHud() {
  scoreEl.textContent = game.score;
  bestEl.textContent = Math.max(game.best, currentBest);
  undoBtn.disabled = !game.canUndo();
}

function hideOverlays() {
  winOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
}

function showWin() {
  winScore.textContent = game.score;
  winOverlay.classList.remove('hidden');
}

function showGameOver() {
  overScore.textContent = game.score;
  overOverlay.classList.remove('hidden');
}

function newGame() {
  game = new Game({ rows: settings.rows, cols: settings.cols });
  game.reset();
  currentBest = game.best;
  boardView.setSize(settings.rows, settings.cols);
  boardView.render(game, { spawnAll: true });
  hideOverlays();
  updateHud();
  saveState(game);
}

function tryMove(dir) {
  if (game.over) return;
  const moved = game.attemptMove(dir);
  if (!moved) return;
  currentBest = Math.max(currentBest, game.best);
  boardView.applyMove(game, game.lastSpawnIndex);
  updateHud();
  saveState(game);
  if (game.won) {
    showWin();
  } else if (game.over) {
    showGameOver();
  }
}

function doUndo() {
  if (!game.canUndo()) return;
  game.undo();
  boardView.render(game);
  hideOverlays();
  updateHud();
  saveState(game);
}

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
  updateHud();
  saveState(game);
});

$('#win-new').addEventListener('click', newGame);
$('#over-new').addEventListener('click', newGame);

// ---- Boot ----
buildSizeOptions();
buildThemeOptions();

const saved = loadState();
if (saved && saved.rows === settings.rows && saved.cols === settings.cols) {
  game = Game.deserialize(saved);
  currentBest = game.best;
  boardView.setSize(game.rows, game.cols);
  boardView.render(game);
  if (game.won && !game.continued) showWin();
  else if (game.over) showGameOver();
} else {
  newGame();
}
updateHud();