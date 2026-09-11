// Play Games Services bridge — fully guarded.
// When Play Games is not configured (no games-ids.xml), every function here
// resolves to a safe default and the game behaves exactly as before.
import { Capacitor, registerPlugin } from '../vendor/@capacitor/core/index.js';

const PlayGames = registerPlugin('PlayGames');

const PG_NAME_KEY = 'tileshift:pg-name';

export function getPlayGamesName() {
  try {
    return localStorage.getItem(PG_NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setPlayGamesName(name) {
  try {
    if (name) localStorage.setItem(PG_NAME_KEY, name);
    else localStorage.removeItem(PG_NAME_KEY);
  } catch (e) {
    // ignore storage errors
  }
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

export async function playGamesAvailable() {
  try {
    if (!isNative()) return false;
    const res = await PlayGames.isAvailable();
    return Boolean(res && res.available);
  } catch (e) {
    return false;
  }
}

export async function playGamesAuthenticated() {
  try {
    if (!isNative()) return false;
    const res = await PlayGames.isAvailable();
    return Boolean(res && res.authenticated);
  } catch (e) {
    return false;
  }
}

export async function playGamesSignIn() {
  try {
    if (!isNative()) return null;
    return await PlayGames.signIn();
  } catch (e) {
    return null;
  }
}

export async function playGamesSignOut() {
  try {
    if (!isNative()) return;
    await PlayGames.signOut();
  } catch (e) {
    // ignore
  }
}