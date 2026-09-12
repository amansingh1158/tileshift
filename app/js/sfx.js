// Tiny synthesized sound effects using the Web Audio API.
// No audio files required — everything is generated on the fly.
// All calls are safe no-ops when AudioContext is unavailable (jsdom, old webviews).

let audioCtx = null;
let lastMoveAt = 0;

function ctx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Play a short tone. freqHz, duration, envelope shape, volume.
function tone(freqStart, freqEnd, duration, type, volume, delay = 0) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t0 = ac.currentTime + delay;

  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freqStart, t0);
  if (freqEnd && freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  }

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// Throttle so rapid multi-tile moves don't blast a full clip.
function throttleMove(hz) {
  const now = performance.now();
  if (now - lastMoveAt < 55) return;
  lastMoveAt = now;
  tone(hz, hz * 0.7, 0.05, 'triangle', 0.05);
}

export function unlockAudio() {
  ctx();
}

export function playMove() {
  throttleMove(320);
}

export function playSpawn() {
  if (!ctx()) return;
  tone(520, 660, 0.06, 'sine', 0.04);
}

export function playMerge() {
  if (!ctx()) return;
  tone(392, 523, 0.09, 'triangle', 0.08);
  tone(523, 659, 0.11, 'sine', 0.06, 0.05);
}

export function playWin() {
  if (!ctx()) return;
  tone(523, 523, 0.1, 'triangle', 0.09);
  tone(659, 659, 0.1, 'triangle', 0.09, 0.1);
  tone(784, 784, 0.12, 'triangle', 0.09, 0.2);
  tone(1047, 1047, 0.2, 'sine', 0.08, 0.3);
}

export function playLose() {
  if (!ctx()) return;
  tone(300, 240, 0.14, 'sawtooth', 0.05);
  tone(200, 150, 0.22, 'sawtooth', 0.05, 0.12);
}