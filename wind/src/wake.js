// wake.js — air remembers you for about six seconds.
//
// A torus of disturbance in world space. You stamp into it every frame; it
// decays. Grass, seeds and leaves read from it, which is why the field stays
// bent behind you after you have gone.
//
// Stored value is a direction times an intensity in 0..~1.6 — dimensionless,
// so consumers scale it into whatever units they need.

const N = 160;          // cells per side
const CELL = 1.7;       // world units
const SPAN = N * CELL;  // ~272 units before it wraps
const TAU = 6.2;        // seconds

const wx = new Float32Array(N * N);
const wz = new Float32Array(N * N);

const wrapc = (i) => ((i % N) + N) % N;

export function decayWake(dt) {
  const k = Math.exp(-dt / TAU);
  for (let i = 0; i < wx.length; i++) { wx[i] *= k; wz[i] *= k; }
}

// Not additive — you don't pump energy in forever. Where you are, the air is
// doing what you are doing; the cell relaxes toward that and then decays.
export function stampWake(x, z, dirx, dirz, strength, radius, dt) {
  const r = Math.ceil(radius / CELL);
  const ci = Math.round(x / CELL), cj = Math.round(z / CELL);
  const inv = 1 / (radius * radius);
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const dx = i * CELL, dz = j * CELL;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      const kern = (1 - d2 * inv) * strength;
      const rate = Math.min(1, kern * 9 * dt);
      const o = wrapc(cj + j) * N + wrapc(ci + i);
      wx[o] += (dirx * kern - wx[o]) * rate;
      wz[o] += (dirz * kern - wz[o]) * rate;
    }
  }
}

export function sampleWake(x, z, out) {
  const o = wrapc(Math.round(z / CELL)) * N + wrapc(Math.round(x / CELL));
  out[0] = wx[o]; out[1] = wz[o];
  return out;
}
