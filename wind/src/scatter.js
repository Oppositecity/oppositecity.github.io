// scatter.js — the world is not stored, it is derived. Every tuft of grass is
// a function of its cell coordinates, so the field is infinite and identical
// every time you pass through it. What *is* stored is what you changed:
// the ground you sowed, and the heads you have already burst.

export const GRASS_CELL = 3.0;
export const PROP_CELL  = 34.0;

export function hash(ix, iz, s) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function rngFor(ix, iz, s) {
  let a = (Math.imul(ix | 0, 0x9e3779b1) ^ Math.imul(iz | 0, 0x85ebca6b) ^ Math.imul(s | 0, 0xc2b2ae35)) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- what you changed --------------------------------------------------
const sown = new Map();   // grass cell key -> 0..1 density added
const burst = new Map();  // prop cell key  -> time remaining before regrowth

const key = (ix, iz) => (ix & 0xffff) * 65536 + (iz & 0xffff);

export function sowAt(x, z, amount) {
  const ix = Math.floor(x / GRASS_CELL), iz = Math.floor(z / GRASS_CELL);
  const k = key(ix, iz);
  sown.set(k, Math.min(1.6, (sown.get(k) || 0) + amount));
}
export function sownAt(ix, iz) { return sown.get(key(ix, iz)) || 0; }
export function sownCount() { return sown.size; }

export function isBurst(ix, iz) { return (burst.get(key(ix, iz)) || 0) > 0; }
export function markBurst(ix, iz, secs) { burst.set(key(ix, iz), secs); }
export function ageBurst(dt) {
  for (const [k, v] of burst) {
    const n = v - dt;
    if (n <= 0) burst.delete(k); else burst.set(k, n);
  }
}

// --- props: one per PROP_CELL, kind decided by hash --------------------
// 0 nothing  1 tree  2 chime pole  3 windmill  4 dandelion cluster
export function propKind(ix, iz) {
  const r = hash(ix, iz, 91);
  if (r < 0.30) return 1;
  if (r < 0.42) return 2;
  if (r < 0.50) return 3;
  if (r < 0.86) return 4;
  return 0;
}
