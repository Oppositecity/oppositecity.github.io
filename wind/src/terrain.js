// terrain.js — a baked heightfield. Nearest-sampled when drawn (so it reads as
// voxel terrain), bilinear when the physics asks, because air does not step.

export const MAP = 512;          // texels
export const SCALE = 2.2;        // world units per texel
export const SPAN = MAP * SCALE; // world wraps every ~1126 units
export const AMP = 46;           // metres of relief

export const height = new Float32Array(MAP * MAP);
export const cmap = new Uint8Array(MAP * MAP); // packed height-band + light

function h32(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);

function vnoise(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const m = (v) => ((v % per) + per) % per;
  const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
  const a = h32(x0, y0, s), b = h32(x1, y0, s);
  const c = h32(x0, y1, s), d = h32(x1, y1, s);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

export function bake() {
  // fBm, tileable across MAP texels
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      let v = 0, amp = 1, per = 4, norm = 0;
      for (let o = 0; o < 6; o++) {
        v += vnoise(i / MAP * per, j / MAP * per, per, o * 7 + 3) * amp;
        norm += amp; amp *= 0.5; per *= 2;
      }
      v /= norm;
      // ridge: push the upper half up, flatten the lower half into plains
      v = v < 0.5 ? v * 0.72 : 0.36 + Math.pow((v - 0.5) * 2, 1.35) * 0.64;
      height[j * MAP + i] = v;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
  }
  const inv = 1 / (hi - lo);
  for (let k = 0; k < height.length; k++) height[k] = (height[k] - lo) * inv * AMP;

  // shade map: 8 height bands x 8 light levels
  const L = [-0.55, 0.62, -0.56]; // sun, low and to the side
  const ln = Math.hypot(L[0], L[1], L[2]);
  L[0] /= ln; L[1] /= ln; L[2] /= ln;
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      const i0 = ((i - 1) + MAP) % MAP, i1 = (i + 1) % MAP;
      const j0 = ((j - 1) + MAP) % MAP, j1 = (j + 1) % MAP;
      const dx = (height[j * MAP + i1] - height[j * MAP + i0]) / (2 * SCALE);
      const dz = (height[j1 * MAP + i] - height[j0 * MAP + i]) / (2 * SCALE);
      let nx = -dx, ny = 1, nz = -dz;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      let lit = nx * L[0] + ny * L[1] + nz * L[2];
      lit = 0.30 + 0.70 * Math.max(0, lit);
      // height band is biased so that most of the world stays low grassland
      // and only genuine ridges go pale
      const hr = Math.pow(height[j * MAP + i] / AMP, 1.25);
      const hb = Math.min(7, (hr * 8) | 0);
      // a texel of dither so the ground has grain instead of flat facets
      const d = h32(i, j, 41);
      let lb = (lit * 8) | 0;
      if (d < 0.14) lb -= 1; else if (d > 0.86) lb += 1;
      lb = lb < 0 ? 0 : (lb > 7 ? 7 : lb);
      cmap[j * MAP + i] = (hb << 3) | lb;
    }
  }
}

const MASK = MAP - 1;            // MAP is a power of two
const INVS = 1 / SCALE;
const BIG = 1024 * MAP;          // keeps truncation aligned for negative coords
const wrapi = (i) => i & MASK;

// nearest — for the raycaster. Hot path: no modulo, no Math.round.
export function heightFast(x, z) {
  const i = ((x * INVS + 0.5 + BIG) | 0) & MASK;
  const j = ((z * INVS + 0.5 + BIG) | 0) & MASK;
  return height[j * MAP + i];
}
export function colourAt(x, z) {
  const i = ((x * INVS + 0.5 + BIG) | 0) & MASK;
  const j = ((z * INVS + 0.5 + BIG) | 0) & MASK;
  return cmap[j * MAP + i];
}

// bilinear — for physics and for standing things on the ground
export function heightAt(x, z) {
  const fx = x * INVS + BIG, fz = z * INVS + BIG;
  const i0 = fx | 0, j0 = fz | 0;
  const tx = fx - i0, tz = fz - j0;
  const a = wrapi(i0), b = wrapi(i0 + 1), c = wrapi(j0), d = wrapi(j0 + 1);
  const h00 = height[c * MAP + a], h10 = height[c * MAP + b];
  const h01 = height[d * MAP + a], h11 = height[d * MAP + b];
  return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
}

const _s = [0, 0];
export function slopeAt(x, z) {
  const e = SCALE;
  _s[0] = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  _s[1] = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return _s;
}
