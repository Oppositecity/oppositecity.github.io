// field.js — the atmosphere.
//
// You do not steer. You fall down pressure gradients and get bent by the
// rotation of the earth. Everything in this file is a force acting on you.
//
//   pressure gradient force   air accelerates from high pressure to low
//   Coriolis                  moving air is deflected right (northern hemisphere)
//   surface friction          strong at the ground, gone by ~40m up
//
// The consequence of those three is the Ekman spiral: near the ground friction
// weakens Coriolis, so air crosses the isobars and pours *into* a low. High up,
// friction vanishes and the balance is geostrophic — air circles the low
// instead of entering it. Altitude is therefore a heading control. That is the
// entire game.

import { heightAt, slopeAt } from './terrain.js';

export const P_BASE   = 1013;   // hPa
export const F_CORIOLIS = 0.38; // 1/s  (inertial period ~16s — earth, sped up)
const K_PGF   = 66;             // gradient force gain
const C_SURF  = 0.64;           // friction coefficient at the surface
const H_BL    = 10.5;           // boundary layer scale height

// Four pressure centres. They orbit a slowly-lagging anchor so that weather is
// always present wherever you drift to, but lags you by minutes — you can still
// fly into a low and sit in its eye.
const CENTRES = [
  { a: -19, s: 210, r: 195, b: 0.4, br:  0.024, pulse: 0.0 },
  { a: -14, s: 175, r: 350, b: 2.2, br:  0.017, pulse: 1.9 },
  { a: -11, s: 240, r: 470, b: 4.4, br:  0.012, pulse: 3.1 },
  { a:  13, s: 265, r: 265, b: 3.3, br: -0.020, pulse: 3.4 },
  { a:  11, s: 300, r: 410, b: 5.4, br: -0.014, pulse: 5.1 },
  { a:   9, s: 225, r: 520, b: 1.1, br: -0.009, pulse: 2.2 },
];

let anchorX = 0, anchorZ = 0, clock = 0;
let weather = 0.5;   // 0 = deep low, storm. 1 = strong high, clear.
const cs = CENTRES.map(c => ({ ...c, x: 0, z: 0 }));

// Weather is not decoration — it is the same pressure field that pushes you.
// Lows are dark, cloudy and windy because a low IS those things. Fly toward
// blue sky and you are flying toward calm.
export function getWeather() { return weather; }

export function stepField(dt, px, pz) {
  clock += dt;
  // anchor lags hard — time constant ~180s
  const k = Math.min(1, dt / 180);
  anchorX += (px - anchorX) * k;
  anchorZ += (pz - anchorZ) * k;
  for (const c of cs) {
    c.b += c.br * dt;
    const r = c.r * (1 + 0.14 * Math.sin(clock * 0.031 + c.pulse));
    c.x = anchorX + Math.sin(c.b) * r;
    c.z = anchorZ + Math.cos(c.b) * r;
    c.amp = c.a * (1 + 0.22 * Math.sin(clock * 0.047 + c.pulse * 1.7));
  }
  const target = Math.max(0, Math.min(1, (pressureAt(px, pz) - 994) / 24));
  weather += (target - weather) * Math.min(1, 0.32 * dt);
}

export function pressureAt(x, z) {
  let p = P_BASE;
  for (const c of cs) {
    const dx = x - c.x, dz = z - c.z;
    p += c.amp * Math.exp(-(dx * dx + dz * dz) / (2 * c.s * c.s));
  }
  return p;
}

// analytic gradient of the pressure field
export function pressureGrad(x, z, out) {
  let gx = 0, gz = 0;
  for (const c of cs) {
    const dx = x - c.x, dz = z - c.z, s2 = c.s * c.s;
    const e = c.amp * Math.exp(-(dx * dx + dz * dz) / (2 * s2));
    gx -= e * dx / s2;
    gz -= e * dz / s2;
  }
  out[0] = gx; out[1] = gz;
  return out;
}

// friction coefficient at altitude-above-ground y
export function frictionAt(y) {
  return C_SURF * Math.exp(-Math.max(0, y) / H_BL);
}

const _g = [0, 0];

// The pressure gradient force, as an acceleration.
export function pgf(x, z, out) {
  pressureGrad(x, z, _g);
  out[0] = -K_PGF * _g[0];
  out[1] = -K_PGF * _g[1];
  return out;
}

// Steady-state wind at a point and altitude: the velocity at which the
// gradient force, Coriolis and friction cancel. Grass, clouds and seeds ride
// this. You do not — you have inertia, so you overshoot it and oscillate.
const _a = [0, 0];
export function flowAt(x, y, z, out) {
  pgf(x, z, _a);
  const agl = Math.max(0, y - heightAt(x, z));
  const C = frictionAt(agl);
  const f = F_CORIOLIS;
  const det = C * C + f * f;
  out[0] = (C * _a[0] + f * _a[1]) / det;
  out[1] = (C * _a[1] - f * _a[0]) / det;
  return out;
}

// Vertical motion of the air itself: lift on the windward face of a slope,
// plus slow thermal cells over open ground.
export function verticalAt(x, y, z, vx, vz) {
  const s = slopeAt(x, z);                    // [dh/dx, dh/dz]
  const agl = Math.max(0, y - heightAt(x, z));
  const orographic = (vx * s[0] + vz * s[1]) * Math.exp(-agl / 26);
  const thermal =
    1.15 * Math.sin(x * 0.0121 + clock * 0.05) *
           Math.sin(z * 0.0107 - clock * 0.037) *
           Math.exp(-agl / 55);
  return orographic + thermal;
}

// Where the nearest low is, for the compass of last resort.
export function nearestLow(x, z) {
  let best = null, bd = Infinity;
  for (const c of cs) {
    if (c.amp >= 0) continue;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best ? { x: best.x, z: best.z, d: bd } : null;
}
