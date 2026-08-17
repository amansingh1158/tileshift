// Facebook sign-in: native Facebook Login -> Firebase token exchange (REST).
// The resulting Firebase idToken + player id are stored in the same keys the
// leaderboard uses, so scores automatically switch to the Facebook identity.
import { Capacitor } from '../vendor/@capacitor/core/index.js';
import { FacebookLogin } from '../vendor/@capacitor-community/facebook-login/index.js';
import { getFirebaseConfig } from './firebase-config.js';
import { setPlayerId } from './leaderboard.js';

const IDENTITY_KEY = 'tileshift:fb-identity';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export function getIdentity() {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

export async function exchangeFacebookToken(fbAccessToken) {
  const cfg = getFirebaseConfig();
  const requestUri = `https://${cfg.projectId}.firebaseapp.com/__/auth/handler`;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(fbAccessToken)}&providerId=facebook.com`,
        requestUri,
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`facebook exchange failed (${res.status})`);
  const data = await res.json();
  localStorage.setItem(
    IDENTITY_KEY,
    JSON.stringify({
      uid: data.localId || '',
      name: data.displayName || '',
      photo: data.photoUrl || '',
    })
  );
  localStorage.setItem(
    'tileshift:fb-token',
    JSON.stringify({
      idToken: data.idToken,
      exp: Date.now() + Number(data.expiresIn || 3600) * 1000,
    })
  );
  setPlayerId(data.localId || '');
  return data;
}

export async function signInWithFacebook() {
  const res = await FacebookLogin.login({ permissions: ['public_profile', 'email'] });
  return exchangeFacebookToken(res.accessToken.token);
}

export async function signOutFacebook() {
  try {
    await FacebookLogin.logout();
  } catch (e) {
    // ignore
  }
  localStorage.removeItem(IDENTITY_KEY);
}