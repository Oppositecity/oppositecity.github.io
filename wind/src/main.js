// main.js

import { bake, heightAt } from './terrain.js';
import { stepField, flowAt } from './field.js';
import { parcel, stepParcel } from './parcel.js';
import { initRender, drawFrame, stepClouds, stepMotes } from './render.js';
import { decayWake, stampWake } from './wake.js';
import { stepLife, setChimeHandler } from './life.js';
import { initAudio, resumeAudio, updateAudio, chime, setMuted, isMuted } from './audio.js';
import { bindInput, stepInput, setFirstInput } from './input.js';
import { stepHud, say } from './hud.js';

const canvas = document.getElementById('c');
const intro = document.getElementById('intro');
const snd = document.getElementById('hud-s');

bake();
initRender(canvas);
setChimeHandler(chime);

// drop in somewhere with a gradient worth having
parcel.x = 0; parcel.z = 0;
parcel.y = heightAt(0, 0) + 26;
{
  const f = [0, 0];
  stepField(0.016, 0, 0);
  flowAt(parcel.x, parcel.y, parcel.z, f);
  parcel.vx = f[0]; parcel.vz = f[1];
  parcel.yaw = Math.atan2(f[0], f[1]);
}

let started = false;
function begin() {
  if (started) return;
  started = true;
  intro.classList.add('off');
  initAudio();
  resumeAudio();
  setTimeout(() => say('you are not driving. you are being pushed.'), 2600);
}
setFirstInput(begin);
bindInput(canvas);

snd.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); begin();
  setMuted(!isMuted());
  snd.textContent = isMuted() ? 'sound off' : 'sound on';
});
snd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); e.stopPropagation(); begin();
    setMuted(!isMuted());
    snd.textContent = isMuted() ? 'sound off' : 'sound on';
  }
});

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;

  stepInput(dt);
  stepField(dt, parcel.x, parcel.z);
  stepParcel(dt);

  decayWake(dt);
  const conv = 1 - parcel.spread;
  const sp = Math.hypot(parcel.vx, parcel.vz) + 1e-4;
  stampWake(parcel.x, parcel.z,
            parcel.vx / sp, parcel.vz / sp,
            Math.min(1.7, sp / 5.5) * Math.exp(-parcel.agl / 6.4) * (0.42 + conv * 1.25),
            10 + conv * 8, dt);

  stepLife(dt);
  stepClouds(dt);
  stepMotes(dt);
  drawFrame();
  stepHud(dt);
  updateAudio(parcel.speed, parcel.agl, conv);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { last = performance.now(); });
