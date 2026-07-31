// audio.js — the sound of a pressure gradient.

let AC = null, master = null, ng, bp, lp, subg;
let muted = false, ready = false;

export function initAudio() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { return; }
  master = AC.createGain();
  master.gain.value = muted ? 0 : 0.85;
  master.connect(AC.destination);

  const len = (AC.sampleRate * 3) | 0;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
  const src = AC.createBufferSource();
  src.buffer = buf; src.loop = true;

  bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.5;
  lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  ng = AC.createGain(); ng.gain.value = 0.0001;
  src.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(master);
  src.start();

  const sub = AC.createOscillator(); sub.type = 'sine'; sub.frequency.value = 46;
  subg = AC.createGain(); subg.gain.value = 0.0001;
  sub.connect(subg); subg.connect(master); sub.start();
  ready = true;
}

export function resumeAudio() { if (AC && AC.state === 'suspended') AC.resume(); }

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, AC.currentTime, 0.05);
}
export function isMuted() { return muted; }

export function updateAudio(speed, agl, conv) {
  if (!ready || !AC) return;
  // iOS sometimes hands back a context that is still suspended even though it
  // was created inside a gesture. Keep trying rather than going silent forever.
  if (AC.state !== 'running') { AC.resume && AC.resume(); return; }
  const t = AC.currentTime;
  const f = Math.min(1, speed / 13);
  ng.gain.setTargetAtTime(0.028 + f * 0.32 + conv * 0.05, t, 0.2);
  bp.frequency.setTargetAtTime(240 + f * 820 + conv * 380, t, 0.25);
  bp.Q.setTargetAtTime(0.42 + conv * 1.3, t, 0.3);
  lp.frequency.setTargetAtTime(700 + f * 2600, t, 0.3);
  subg.gain.setTargetAtTime(0.02 + f * 0.085 * Math.exp(-agl / 40), t, 0.35);
}

export function chime(semitone, amp, dist) {
  if (!ready || !AC || AC.state !== 'running') return;
  const base = 392 * Math.pow(2, semitone / 12);
  const t = AC.currentTime;
  const far = Math.max(0.08, 1 - dist / 190);
  [[1, 1], [2.76, 0.4], [5.41, 0.15]].forEach(([r, g]) => {
    const o = AC.createOscillator(), gn = AC.createGain();
    o.type = 'sine'; o.frequency.value = base * r;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.15 * amp * g * far, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / r + 0.4);
    o.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + 3.2);
  });
}
