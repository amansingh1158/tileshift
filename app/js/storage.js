// Thin localStorage persistence wrapper for game state, settings and stats.

const SETTINGS_KEY = 'tileshift:settings';
const STATS_KEY = 'tileshift:stats';

export const DEFAULT_SETTINGS = {
  rows: 4,
  cols: 4,
  theme: 'tileshift',
  mode: 'classic',
};

export const DEFAULT_STATS = {
  games: 0,
  moves: 0,
  merges: 0,
  bestTile: 0,
  bestScore: 0,
};

function stateKey(game) {
  const mode = game.mode || 'classic';
  const daily = game.dailyKey ? `:${game.dailyKey}` : '';
  return `tileshift:state:${mode}${daily}`;
}

export function saveState(game) {
  try {
    localStorage.setItem(stateKey(game), JSON.stringify(game.serialize()));
  } catch (e) {
    // Storage may be unavailable (private mode) — game still works in memory.
  }
}

export function loadState(game) {
  try {
    const raw = localStorage.getItem(stateKey(game));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.cells)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearState(game) {
  try {
    localStorage.removeItem(stateKey(game));
  } catch (e) {
    // ignore
  }
}

export function bestScoreFor(game) {
  try {
    const raw = localStorage.getItem(`tileshift:best:${game.mode || 'classic'}`);
    return raw ? Number(raw) || 0 : 0;
  } catch (e) {
    return 0;
  }
}

export function saveBestScore(game) {
  try {
    localStorage.setItem(`tileshift:best:${game.mode || 'classic'}`, String(game.best));
  } catch (e) {
    // ignore
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // ignore
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    // ignore
  }
}