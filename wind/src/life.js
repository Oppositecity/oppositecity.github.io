// life.js — the things that answer.
//
// Props are derived from cell hashes, but the ones near you get a little
// mutable state so a chime can keep ringing and a mill can keep its spin.
// State beyond 260 units is discarded; the world forgets it, and rebuilds it
// identically when you come back.

import { PROP_CELL, propKind, rngFor, isBurst, markBurst, sowAt, ageBurst } from './scatter.js';
import { heightAt } from './terrain.js';
import { flowAt } from './field.js';
import { parcel, influence } from './parcel.js';
import { sampleWake } from './wake.js';

export const props = new Map();     // key -> state
export const particles = [];
export const stats = { chimes: 0, burst: 0, carried: 0, sown: 0 };

const key = (ix, iz) => (ix & 0xffff) * 65536 + (iz & 0xffff);
const PENT = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

let onChime = () => {};
export function setChimeHandler(fn) { onChime = fn; }

export function propAt(ix, iz) {
  const k = key(ix, iz);
  let s = props.get(k);
  if (s) return s;
  const kind = propKind(ix, iz);
  if (!kind) { props.set(k, null); return null; }
  const r = rngFor(ix, iz, 17);
  const x = (ix + 0.15 + r() * 0.7) * PROP_CELL;
  const z = (iz + 0.15 + r() * 0.7) * PROP_CELL;
  s = {
    kind, ix, iz, x, z, y: heightAt(x, z),
    h: 0, rad: 0, a: 0, v: 0, cool: 0, ang: r() * 6.28, av: 0,
    sx: 0, sz: 0, dvx: 0, dvz: 0, note: (r() * 10) | 0,
    heads: null,
  };
  if (kind === 1) { s.h = 5.2 + r() * 5.5; s.rad = 2.2 + r() * 2.0; }
  if (kind === 2) { s.h = 3.2 + r() * 1.6; }
  if (kind === 3) { s.h = 7.0 + r() * 3.4; s.rad = 2.4 + r() * 1.1; }
  if (kind === 4) {
    s.heads = [];
    const n = 4 + ((r() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const hx = x + (r() - 0.5) * PROP_CELL * 0.6;
      const hz = z + (r() - 0.5) * PROP_CELL * 0.6;
      s.heads.push({ x: hx, z: hz, y: heightAt(hx, hz), h: 0.85 + r() * 0.5, alive: !isBurst(ix, iz), t: 0 });
    }
  }
  props.set(k, s);
  return s;
}

const _f = [0, 0], _w = [0, 0];

export function stepLife(dt) {
  ageBurst(dt);
  const p = parcel;

  // prune distant state
  if (Math.random() < dt * 0.4) {
    for (const [k, s] of props) {
      if (!s) { if (Math.random() < 0.02) props.delete(k); continue; }
      if (Math.hypot(s.x - p.x, s.z - p.z) > 300) props.delete(k);
    }
  }

  const r = 6;
  const ci = Math.floor(p.x / PROP_CELL), cj = Math.floor(p.z / PROP_CELL);
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      const s = propAt(i, j);
      if (!s) continue;
      const dx = s.x - p.x, dz = s.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 200 * 200) continue;
      const f = influence(dx, dz);
      const d = Math.sqrt(d2) + 1e-3;

      if (s.kind === 1) {                       // tree
        const ax = f * (p.vx / (p.speed + 1e-3) * 0.7 + dx / d * 0.35) * 0.30;
        const az = f * (p.vz / (p.speed + 1e-3) * 0.7 + dz / d * 0.35) * 0.30;
        s.dvx += (ax - s.sx * 3.2) * dt * 7; s.dvz += (az - s.sz * 3.2) * dt * 7;
        s.dvx *= Math.pow(0.2, dt); s.dvz *= Math.pow(0.2, dt);
        s.sx += s.dvx * dt; s.sz += s.dvz * dt;
        if (f > 1.9 && Math.random() < f * 0.05) {
          spawn(s.x + (Math.random() - 0.5) * s.rad * 2, s.y + s.h + (Math.random() - 0.5) * s.rad,
                s.z + (Math.random() - 0.5) * s.rad * 2, 1);
        }
      } else if (s.kind === 2) {                // chime pole
        s.v += ((f * 0.26) - s.a) * 34 * dt - s.v * 3.0 * dt;
        s.a += s.v * dt;
        s.cool -= dt;
        if (Math.abs(s.v) > 0.58 && s.cool <= 0) {
          s.cool = 0.30 + Math.random() * 0.24;
          onChime(PENT[(s.note + ((Math.random() * 3) | 0)) % PENT.length],
                  Math.min(1, 0.35 + Math.abs(s.v) * 0.4), d);
          stats.chimes++;
        }
      } else if (s.kind === 3) {                // windmill
        s.av += (f * 1.5 - s.av * 1.1) * dt;
        s.ang += s.av * dt;
      } else if (s.kind === 4) {                // seed heads
        for (const h of s.heads) {
          if (!h.alive) continue;
          const hf = influence(h.x - p.x, h.z - p.z);
          if (hf > 2.1) {
            h.alive = false;
            markBurst(i, j, 40 + Math.random() * 40);
            stats.burst++;
            for (let n = 0; n < 12; n++) {
              spawn(h.x + (Math.random() - 0.5) * 0.4, h.y + h.h,
                    h.z + (Math.random() - 0.5) * 0.4, 0);
            }
          }
        }
        if (!s.heads.some(h => h.alive) && !isBurst(i, j)) {
          for (const h of s.heads) h.alive = true;
        }
      }
    }
  }

  stepParticles(dt);
}

function spawn(x, y, z, kind) {
  if (particles.length > 520) particles.splice(0, 40);
  particles.push({
    x, y, z, kind,
    vx: parcel.vx * 0.4 + (Math.random() - 0.5) * 2,
    vy: 0.9 + Math.random() * 1.3,
    vz: parcel.vz * 0.4 + (Math.random() - 0.5) * 2,
    life: kind ? 16 : 34, age: 0, sown: false,
  });
}

function stepParticles(dt) {
  let carried = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    flowAt(q.x, q.y, q.z, _f);
    sampleWake(q.x, q.z, _w);
    const tvx = _f[0] + _w[0] * 7.5, tvz = _f[1] + _w[1] * 7.5;
    const drag = q.kind ? 2.0 : 3.4;   // seeds couple to the air harder than leaves
    q.vx += (tvx - q.vx) * Math.min(1, drag * dt);
    q.vz += (tvz - q.vz) * Math.min(1, drag * dt);

    const ground = heightAt(q.x, q.z);
    const agl = q.y - ground;
    const lift = (Math.hypot(_w[0], _w[1]) * 0.95) + (q.kind ? 0 : 0.25);
    q.vy += (-(q.kind ? 1.35 : 0.62) + lift) * dt;
    q.vy *= Math.pow(0.6, dt);

    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    q.age += dt;

    if (agl > 0.6) carried++;

    if (q.y <= ground + 0.12) {
      q.y = ground + 0.12;
      if (!q.sown && q.kind === 0) { sowAt(q.x, q.z, 0.55); q.sown = true; stats.sown++; }
      q.vx *= Math.pow(0.02, dt); q.vz *= Math.pow(0.02, dt); q.vy = 0;
      q.life -= dt * 5;
    }
    q.life -= dt;
    if (q.life <= 0 || Math.hypot(q.x - parcel.x, q.z - parcel.z) > 230) particles.splice(i, 1);
  }
  stats.carried = carried;
}
