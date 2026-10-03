// Senior audio engine: single AudioContext + master gain, compressed ADSR, throttled moves.
let ac = null, master = null, lastMove = 0;
const VOL = { move: 0.22, spawn: 0.18, mergeA: 0.28, mergeB: 0.22, win: 0.30, winTail: 0.26, lose: 0.20 };

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ac) {
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 1;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
};

const tone = (f0, f1, dur, type, vol, delay = 0) => {
  const a = getCtx();
  if (!a) return;
  const t0 = a.currentTime + delay, osc = a.createOscillator(), g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
};

const throttled = (hz) => {
  const now = performance.now();
  if (now - lastMove < 55) return;
  lastMove = now;
  tone(hz, hz * 0.7, 0.05, 'triangle', VOL.move);
};

export const unlockAudio = () => getCtx();
export const playMove = () => throttled(320);
export const playSpawn = () => { if (getCtx()) tone(520, 660, 0.06, 'sine', VOL.spawn); };
export const playMerge = () => { if (!getCtx()) return; tone(392, 523, 0.09, 'triangle', VOL.mergeA); tone(523, 659, 0.11, 'sine', VOL.mergeB, 0.05); };
export const playWin = () => {
  if (!getCtx()) return;
  tone(523, 523, 0.1, 'triangle', VOL.win);
  tone(659, 659, 0.1, 'triangle', VOL.win, 0.1);
  tone(784, 784, 0.12, 'triangle', VOL.win, 0.2);
  tone(1047, 1047, 0.2, 'sine', VOL.winTail, 0.3);
};
export const playLose = () => {
  if (!getCtx()) return;
  tone(300, 240, 0.14, 'sawtooth', VOL.lose);
  tone(200, 150, 0.22, 'sawtooth', VOL.lose, 0.12);
};
