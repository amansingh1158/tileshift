// Thin localStorage persistence wrapper for game state and settings.

const STATE_KEY = 't2048:state';
const SETTINGS_KEY = 't2048:settings';

export const DEFAULT_SETTINGS = {
  rows: 4,
  cols: 4,
  theme: 'classic',
};

export function saveState(game) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(game.serialize()));
  } catch (e) {
    // Storage may be unavailable (private mode) — game still works in memory.
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.cells)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STATE_KEY);
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