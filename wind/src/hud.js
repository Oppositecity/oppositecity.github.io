// hud.js — words in space. The readouts are the actual state variables of the
// atmosphere, not a score.

import { parcel } from './parcel.js';
import { pressureAt, P_BASE, frictionAt, F_CORIOLIS } from './field.js';
import { stats } from './life.js';
import { sownCount } from './scatter.js';

const L = document.getElementById('hud-l');
const R = document.getElementById('hud-r');
const B = document.getElementById('hud-b');
const lineEl = document.getElementById('line');

let t = 0, lineTimer = null;
const said = {};

export function say(txt) {
  lineEl.textContent = txt;
  lineEl.classList.add('on');
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => lineEl.classList.remove('on'), 5200);
}
export function once(k, txt) { if (said[k]) return; said[k] = 1; say(txt); }

export function stepHud(dt) {
  t -= dt;
  if (t > 0) return;
  t = 0.12;
  const p = parcel;
  const hPa = pressureAt(p.x, p.z);
  // cross-isobar angle: how far your flow deviates from along the isobars
  const C = frictionAt(p.agl);
  const cross = Math.round(Math.atan2(C, F_CORIOLIS) * 180 / Math.PI);

  L.innerHTML =
    'pressure ' + hPa.toFixed(1) + '<br>' +
    'altitude ' + Math.round(p.agl) + '<br>' +
    'speed ' + p.speed.toFixed(1);
  R.innerHTML =
    'inflow ' + cross + '&deg;<br>' +
    'carried ' + stats.carried + '<br>' +
    'sown ' + sownCount();
  B.innerHTML = 'reserve ' + Math.round(p.reserve * 100);

  // the field talks back
  if (hPa < P_BASE - 11) once('low', 'you are falling into the low. everything here is.');
  if (p.agl > 55) once('high', 'up here nothing can reach you, and you reach nothing.');
  if (p.agl < 2 && p.speed > 9) once('scrape', 'the ground is taking your speed and giving it to the grass.');
  if (cross > 40) once('cross', 'friction is turning you. down here you cross the isobars.');
  if (cross < 8) once('geo', 'no friction. you are circling now, not arriving.');
  if (stats.chimes > 0) once('chime', 'something out there answered.');
  if (sownCount() > 40) once('sown', 'you are how this field moves.');
  if (stats.burst > 0) once('burst', 'nothing you touch stays where you found it.');
}
