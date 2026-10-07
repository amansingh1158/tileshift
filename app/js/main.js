import { Capacitor } from '../vendor/@capacitor/core/index.js';
import { Haptics, ImpactStyle, NotificationType } from '../vendor/@capacitor/haptics/index.js';
import { COMBO_BONUS, DIRECTIONS, MODES, Game, highestTile } from './engine.js';
import { isConfigured as lbConfigured } from './firebase-config.js';
import { submitScore, deleteMyAccountData, clearLocalIdentity, getPlayerId, purgeExpiredScores } from './leaderboard.js';
import { getDisplayName, validateName, claimName, setDisplayNameLocal, hasProfile } from './profile.js';
import { playGamesSignOut } from './play-games.js';
import { playMerge, playMove, playWin, playLose, unlockAudio } from './sfx.js';
import { bestScoreFor, loadSettings, loadState, loadStats, saveBestScore, saveSettings, saveState, saveStats } from './storage.js';
import { BoardView, THEMES } from './ui.js';
import { showBanner } from './ads.js';

const $ = (s) => document.querySelector(s), isNative = Capacitor.isNativePlatform();
const scoreEl = $('#score'), bestEl = $('#best'), undoBtn = $('#undo');
const TIME_LIMIT = 18e4, MOVES_LIMIT = 100;
const BOARD_SIZES = [
  { rows: 4, cols: 4, label: 'Classic 4×4' }, { rows: 3, cols: 3, label: '3×3' }, { rows: 5, cols: 5, label: '5×5' },
  { rows: 6, cols: 6, label: '6×6' }, { rows: 7, cols: 7, label: '7×7' }, { rows: 8, cols: 8, label: '8×8' },
  { rows: 3, cols: 5, label: '3×5' }, { rows: 4, cols: 6, label: '4×6' }, { rows: 5, cols: 7, label: '5×7' }, { rows: 6, cols: 9, label: '6×9' },
];

const settings = loadSettings();
const modeFromUrl = () => {
  try { const m = new URLSearchParams(window.location.search).get('mode'); return Object.values(MODES).includes(m) ? m : MODES.CLASSIC; } catch { return MODES.CLASSIC; }
};
settings.mode = modeFromUrl();
saveSettings(settings);
try { localStorage.setItem('tileshift:hasEnteredBoard', '1'); } catch {}
let game = null, stats = loadStats(), prevOver = false, prevWon = false, timerId = null, toastTimer = null;
const boardView = new BoardView($('#board'));
boardView.setTheme(settings.theme);

const dailyKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const createGame = () => new Game({
  rows: settings.mode === MODES.DAILY ? 4 : settings.rows,
  cols: settings.mode === MODES.DAILY ? 4 : settings.cols,
  mode: settings.mode, movesLimit: MOVES_LIMIT, timeLimit: TIME_LIMIT,
  dailyKey: settings.mode === MODES.DAILY ? dailyKey() : null,
});

// --- Haptics + SFX (compact dispatcher) ---
const haptic = async (kind, val) => {
  if (!isNative || !settings.vibration) return;
  try { kind === 'impact' ? await Haptics.impact({ style: val }) : await Haptics.notification({ type: val }); } catch {}
};
const sfx = (fn) => settings.sound && fn();

// --- HUD ---
const renderHudExtra = () => {
  const w = $('#hud-extra');
  const tpl = {
    [MODES.TIME]: `<div class="timer-bar"><div id="timer-fill" class="timer-fill"></div></div><span class="chip" id="time-chip">3:00</span>`,
    [MODES.MOVES]: `<span class="chip">Moves <b id="moves-left">${game.movesLeft}</b></span><span class="chip">Target ${game.target}</span>`,
    [MODES.DAILY]: `<span class="chip daily-chip">Daily ${game.dailyKey}</span><span class="chip">Target ${game.target}</span>`,
  };
  w.innerHTML = tpl[game.mode] || `<span class="chip">Target ${game.target}</span>`;
  if (game.mode === MODES.TIME) updateTimerHud();
};
const updateTimerHud = () => {
  const f = $('#timer-fill'), c = $('#time-chip');
  if (!f || !c) return;
  f.style.width = `${Math.max(0, (game.timeLeft / game.timeLimit) * 100)}%`;
  f.classList.toggle('low', game.timeLeft / game.timeLimit < 0.25);
  const s = Math.ceil(game.timeLeft / 1000);
  c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const updateHud = () => {
  scoreEl.textContent = game.score;
  bestEl.textContent = Math.max(game.best, bestScoreFor(game));
  undoBtn.disabled = !game.canUndo();
  const ml = $('#moves-left'); if (ml) ml.textContent = game.movesLeft;
  if (game.best > bestScoreFor(game)) saveBestScore(game);
};

// --- Overlays ---
const hideOverlays = () => { $('#win-overlay').classList.add('hidden'); $('#game-over-overlay').classList.add('hidden'); };
const showWin = () => {
  const isMoves = game.mode === MODES.MOVES;
  $('#win-title').textContent = isMoves ? 'Level Complete!' : 'You win!';
  $('#win-subtitle').textContent = isMoves ? `Reached the ${game.target} tile in ${MOVES_LIMIT - game.movesLeft} moves!` : `You reached the ${game.target} tile.`;
  $('#win-continue').classList.toggle('hidden', isMoves);
  $('#win-overlay').classList.remove('hidden');
  haptic('notify', NotificationType.Success); sfx(playWin);
};
const showGameOver = () => {
  $('#over-title').textContent = ({ [MODES.MOVES]: 'Out of Moves!', [MODES.TIME]: "Time's Up!" }[game.mode] || 'Game Over');
  $('#over-score').textContent = game.score;
  $('#game-over-overlay').classList.remove('hidden');
  haptic('notify', NotificationType.Warning); sfx(playLose);
};
const recordEnd = () => {
  stats.games++; stats.bestTile = Math.max(stats.bestTile, highestTile(game.board)); stats.bestScore = Math.max(stats.bestScore, game.score);
  saveStats(stats);
  if (lbConfigured() && game.score > 0) submitScore(game.mode, { score: game.score, tile: stats.bestTile, name: getDisplayName() }).catch(() => {});
};
const checkEnd = () => {
  if (game.won && !prevWon) { prevWon = true; showWin(); }
  if (game.over && !prevOver) { prevOver = true; recordEnd(); showGameOver(); }
};

// --- Combo toast ---
const toast = $('#combo-toast');
toast.addEventListener('animationend', (e) => e.animationName === 'combo-pop' && (toast.classList.add('hidden'), toast.classList.remove('pop')));
const showCombo = (count, bonus) => {
  toast.textContent = `COMBO x${count}  +${bonus}`;
  toast.classList.remove('hidden', 'pop'); void toast.offsetWidth; toast.classList.add('pop');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 900);
};

// --- Game flow ---
const newGame = () => {
  clearTimer(); game = createGame(); game.reset(); prevOver = prevWon = false;
  boardView.setSize(game.rows, game.cols); boardView.render(game, { spawnAll: true });
  hideOverlays(); renderHudExtra(); updateHud(); saveState(game);
  $('#board-size').disabled = settings.mode === MODES.DAILY;
  if (game.mode === MODES.TIME) startTimer();
};
const tryMove = (dir) => {
  if (!game || game.over) return;
  if (!game.attemptMove(dir)) return;
  stats.moves++; stats.merges += game.lastCombo; saveStats(stats);
  boardView.applyMove(game, game.lastSpawnIndex); updateHud(); saveState(game);
  haptic('impact', ImpactStyle.Light);
  if (game.lastCombo >= 1) { haptic('impact', game.lastCombo >= 3 ? ImpactStyle.Medium : ImpactStyle.Light); sfx(playMerge); } else sfx(playMove);
  if (game.lastCombo >= 2) showCombo(game.lastCombo, (game.lastCombo - 1) * COMBO_BONUS);
  checkEnd();
};
const doUndo = () => {
  if (!game?.canUndo()) return;
  game.undo(); boardView.render(game); hideOverlays(); prevOver = prevWon = false;
  updateHud(); if (game.mode === MODES.TIME) updateTimerHud(); saveState(game);
};
const startTimer = () => { clearTimer(); timerId = setInterval(() => { game.tick(250); updateTimerHud(); saveState(game); if (game.over) { clearTimer(); checkEnd(); } }, 250); };
const clearTimer = () => { if (timerId) clearInterval(timerId); timerId = null; };
window.addEventListener('pagehide', clearTimer);
window.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && game?.mode === MODES.TIME && !game.over && !game.won && startTimer());

// --- Stats ---
const renderStats = () => {
  $('#stat-games').textContent = stats.games; $('#stat-moves').textContent = stats.moves;
  $('#stat-merges').textContent = stats.merges; $('#stat-tile').textContent = stats.bestTile; $('#stat-best').textContent = stats.bestScore;
};
$('#stats-btn').addEventListener('click', () => { renderStats(); $('#stats-modal').classList.remove('hidden'); });
$('#stats-close').addEventListener('click', () => $('#stats-modal').classList.add('hidden'));
$('#stats-modal').addEventListener('click', (e) => e.target === e.currentTarget && $('#stats-modal').classList.add('hidden'));

// --- Tour (compact) ---
const TOUR_KEY = 'tileshift:tour-seen:2';
const tourEl = $('#tour'), tourRing = $('#tour-ring'), tourCard = $('#tour-card'), tourStep = $('#tour-step'), tourTitle = $('#tour-title'), tourDesc = $('#tour-desc'), tourNext = $('#tour-next');
const TOUR_STEPS = [
  { target: () => $('#board'), title: 'Slide & merge', desc: 'Swipe or drag to slide every tile. Equal numbers merge together — reach the target tile to win!' },
  { target: () => $('#board-size'), title: 'Grid size', desc: 'Change the board shape — from the classic 4×4 up to bigger grids.' },
  { target: () => $('#theme'), title: 'Themes', desc: 'Switch the whole look: TileShift, Retro, Dark, Ocean or Candy.' },
  { target: () => $('#undo'), title: 'Undo', desc: 'Made a wrong swipe? Step back one move.' },
  { target: () => $('#new-game'), title: 'New Game', desc: 'Restart the current board at any time.' },
  { target: () => $('#stats-btn'), title: 'Stats', desc: 'See your lifetime games, moves, merges and best tile.' },
];
let tourIndex = 0;
const positionCard = (r) => {
  const gap = 14, h = tourCard.offsetHeight || 120, w = tourCard.offsetWidth || 320;
  const vh = window.innerHeight || 800, vw = window.innerWidth || 400;
  let top = r.bottom + gap;
  if (top + h > vh - 12) top = Math.max(12, r.top - gap - h);
  if (top + h > vh - 12) top = vh - h - 12;
  const left = Math.max(12, Math.min((vw - w) / 2, vw - w - 12));
  tourCard.style.top = `${Math.max(12, top)}px`; tourCard.style.left = `${left}px`;
};
const showStep = (i) => {
  tourIndex = i; const s = TOUR_STEPS[i], el = s.target(); if (!el) return;
  const r = el.getBoundingClientRect();
  Object.assign(tourRing.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  tourStep.textContent = `${i + 1} / ${TOUR_STEPS.length}`; tourTitle.textContent = s.title; tourDesc.textContent = s.desc;
  tourNext.textContent = i === TOUR_STEPS.length - 1 ? 'Got it' : 'Next'; positionCard(r);
};
const startTour = () => { showStep(0); tourEl.classList.remove('hidden'); };
const endTour = () => { tourEl.classList.add('hidden'); try { localStorage.setItem(TOUR_KEY, '1'); } catch {} };
tourEl.addEventListener('click', () => tourIndex >= TOUR_STEPS.length - 1 ? endTour() : showStep(tourIndex + 1));
$('#howto-btn').addEventListener('click', startTour);
try { if (localStorage.getItem(TOUR_KEY) !== '1') (requestAnimationFrame || ((cb) => setTimeout(cb, 16)))(() => setTimeout(startTour, 250)); } catch {}

// --- Input: keyboard + advanced gesture (prevents scroll/bounce) ---
const KEY_DIRS = { ArrowUp: DIRECTIONS.UP, ArrowDown: DIRECTIONS.DOWN, ArrowLeft: DIRECTIONS.LEFT, ArrowRight: DIRECTIONS.RIGHT, w: DIRECTIONS.UP, s: DIRECTIONS.DOWN, a: DIRECTIONS.LEFT, d: DIRECTIONS.RIGHT, W: DIRECTIONS.UP, S: DIRECTIONS.DOWN, A: DIRECTIONS.LEFT, D: DIRECTIONS.RIGHT };
window.addEventListener('keydown', (e) => { if (settings.sound) unlockAudio(); const d = KEY_DIRS[e.key]; if (d) { e.preventDefault(); tryMove(d); } });

const boardEl = $('#board');
let ptr = null; const THRESH = 20;
const onBoard = (e, cb) => { if (e.cancelable) e.preventDefault(); cb?.(); };
boardEl.addEventListener('pointerdown', (e) => {
  if (settings.sound) unlockAudio(); onBoard(e, () => { ptr = { x: e.clientX, y: e.clientY }; try { boardEl.setPointerCapture(e.pointerId); } catch {} });
});
boardEl.addEventListener('pointermove', (e) => { if (ptr && e.cancelable) e.preventDefault(); }, { passive: false });
boardEl.addEventListener('pointerup', (e) => {
  if (!ptr) return; const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr = null; onBoard(e);
  if (Math.hypot(dx, dy) < THRESH) return;
  tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT) : (dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP));
});
boardEl.addEventListener('pointercancel', () => ptr = null);
boardEl.addEventListener('touchmove', (e) => ptr && e.cancelable && e.preventDefault(), { passive: false });

// --- Controls ---
$('#new-game').addEventListener('click', newGame);
undoBtn.addEventListener('click', doUndo);
$('#board-size').addEventListener('change', (e) => { const s = BOARD_SIZES[Number(e.target.value)]; Object.assign(settings, { rows: s.rows, cols: s.cols }); saveSettings(settings); newGame(); });
$('#theme').addEventListener('change', (e) => { settings.theme = e.target.value; boardView.setTheme(settings.theme); saveSettings(settings); boardView.render(game); });
$('#win-continue').addEventListener('click', () => { game.continueAfterWin(); hideOverlays(); prevWon = false; updateHud(); saveState(game); });
$('#win-new').addEventListener('click', newGame); $('#over-new').addEventListener('click', newGame);

// --- Selects ---
const fillSelect = (sel, items, labelKey, valKey) => {
  const el = $(sel); el.innerHTML = '';
  items.forEach((it, i) => { const o = document.createElement('option'); o.value = valKey ? it[valKey] : i; o.textContent = it[labelKey] || it.label; el.appendChild(o); });
  return el;
};
fillSelect('#board-size', BOARD_SIZES, 'label').value = String(BOARD_SIZES.findIndex((s) => s.rows === settings.rows && s.cols === settings.cols) || 0);
const themeSel = fillSelect('#theme', Object.entries(THEMES).map(([k, v]) => ({ k, label: v.label })), 'label', 'k');
themeSel.value = settings.theme;

// --- Settings modal ---
const sModal = $('#settings-modal'), sName = $('#settings-name-input'), sMsg = $('#settings-msg'), sSave = $('#settings-save'), sClose = $('#settings-close'), sOut = $('#settings-signout'), sBtn = $('#settings-btn'), sSound = $('#settings-sound'), sVib = $('#settings-vibration'), sDel = $('#settings-delete');
const syncToggles = () => { if (sSound) { sSound.textContent = settings.sound ? 'ON' : 'OFF'; sSound.classList.toggle('on', settings.sound); } if (sVib) { sVib.textContent = settings.vibration ? 'ON' : 'OFF'; sVib.classList.toggle('on', settings.vibration); } };
const openSettings = () => { sName.value = getDisplayName(); sMsg.textContent = ''; sOut.hidden = !hasProfile(); sDel.hidden = !getPlayerId(); syncToggles(); sModal.classList.remove('hidden'); };
const closeSettings = () => sModal.classList.add('hidden');
const saveSM = async () => {
  sMsg.textContent = ''; const v = validateName(sName.value); if (!v.ok) return sMsg.textContent = v.reason;
  const r = await claimName(v.name); if (!r.ok) return sMsg.textContent = r.reason;
  sMsg.textContent = r.local ? 'Saved on this device (offline name).' : `Name "${v.name}" is yours!`; setTimeout(closeSettings, 700);
};
const outSM = async () => { setDisplayNameLocal(''); try { await playGamesSignOut(); } catch {} closeSettings(); };
const delSM = async () => {
  if (!window.confirm('Delete your account and all leaderboard data? This cannot be undone.')) return;
  sMsg.textContent = 'Deleting…'; sDel.disabled = true;
  const res = await deleteMyAccountData().catch(() => ({ deleted: 0, account: false, error: 'network' }));
  clearLocalIdentity(); setDisplayNameLocal('');
  try { await playGamesSignOut(); } catch {}
  sDel.disabled = false; sOut.hidden = true; sDel.hidden = true;
  sMsg.textContent = res.deleted > 0
    ? 'Your scores and name have been deleted from the leaderboard.'
    : 'No online data was found — this device has been cleared.';
};
sBtn?.addEventListener('click', openSettings); sClose?.addEventListener('click', closeSettings); sSave?.addEventListener('click', saveSM); sOut?.addEventListener('click', outSM);
sDel?.addEventListener('click', delSM);
sSound?.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(settings); syncToggles(); });
sVib?.addEventListener('click', () => { settings.vibration = !settings.vibration; saveSettings(settings); syncToggles(); });
sModal?.addEventListener('click', (e) => e.target === sModal && closeSettings());

// --- Boot ---
$('#board-size').disabled = settings.mode === MODES.DAILY;
syncToggles();
game = createGame();
const saved = loadState(game);
if (saved && saved.rows === game.rows && saved.cols === game.cols && saved.mode === game.mode && saved.dailyKey === game.dailyKey) game = Game.deserialize(saved); else game.reset();
prevOver = game.over; prevWon = game.won;
boardView.setSize(game.rows, game.cols); boardView.render(game);
if (game.won && !game.continued) showWin(); else if (game.over) showGameOver();
renderHudExtra(); updateHud(); if (game.mode === MODES.TIME) startTimer(); showBanner();
purgeExpiredScores();
