// parcel.js — you.
//
// You are a parcel of air, not a pilot. You get three things:
//
//   trim      a weak lateral lean, about a third of a strong gradient force
//   climb     vertical velocity — the real control, because altitude sets
//             your heading via the Ekman spiral
//   converge  squeeze your cross-section. Mass flux is conserved, so you
//             speed up and hit harder, and your field of view narrows to a
//             slot. Spreading out is how you see. Costs reserve.

import { pgf, F_CORIOLIS, frictionAt, verticalAt } from './field.js';
import { heightAt, slopeAt } from './terrain.js';

const TRIM_ACCEL = 1.15;
const CLIMB_RATE = 5.2;

export const parcel = {
  x: 0, y: 24, z: 0,
  vx: 0, vy: 0, vz: 0,
  yaw: 0, pitch: 0,
  spread: 1,        // 1 = spread wide and slow, 0 = converged
  reserve: 1,
  speed: 0,
  agl: 20,
  trim: 0,          // -1..1 from input
  climb: 0,         // -1..1 from input
  converging: false,
};

const _a = [0, 0];

export function stepParcel(dt) {
  const p = parcel;
  const ground = heightAt(p.x, p.z);
  p.agl = Math.max(0, p.y - ground);

  // --- converge / spread -------------------------------------------------
  const canConverge = p.converging && p.reserve > 0.01;
  p.spread += ((canConverge ? 0 : 1) - p.spread) * Math.min(1, 2.2 * dt);
  p.reserve = Math.max(0, Math.min(1,
    canConverge ? p.reserve - 0.27 * dt : p.reserve + 0.155 * dt));
  const conv = 1 - p.spread;

  // --- horizontal forces -------------------------------------------------
  pgf(p.x, p.z, _a);
  let ax = _a[0], az = _a[1];

  // Coriolis: deflects to the right of motion
  ax += F_CORIOLIS * p.vz;
  az -= F_CORIOLIS * p.vx;

  // friction with the surface, strongest in the first few metres
  const C = frictionAt(p.agl);
  ax -= C * p.vx;
  az -= C * p.vz;

  // your lean: perpendicular to travel, and it is not much
  const sp = Math.hypot(p.vx, p.vz) + 1e-4;
  const rx = p.vz / sp, rz = -p.vx / sp;
  ax += rx * p.trim * TRIM_ACCEL;
  az += rz * p.trim * TRIM_ACCEL;

  p.vx += ax * dt;
  p.vz += az * dt;

  // --- vertical ----------------------------------------------------------
  const air = verticalAt(p.x, p.y, p.z, p.vx, p.vz);
  const target = air + p.climb * CLIMB_RATE;
  p.vy += (target - p.vy) * Math.min(1, 2.4 * dt);

  // --- terrain: you cannot go through a hill, you go over it -------------
  if (p.agl < 7) {
    const s = slopeAt(p.x, p.z);
    let nx = -s[0], ny = 1, nz = -s[1];
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const into = p.vx * nx + p.vy * ny + p.vz * nz;
    if (into < 0) {
      const k = 1 - p.agl / 7;
      p.vx -= nx * into * k;
      p.vy -= ny * into * k;
      p.vz -= nz * into * k;
    }
  }

  // --- advect ------------------------------------------------------------
  const rush = 1 + conv * 0.9;   // converged air moves faster through the same gap
  p.x += p.vx * rush * dt;
  p.y += p.vy * rush * dt;
  p.z += p.vz * rush * dt;

  const g2 = heightAt(p.x, p.z);
  if (p.y < g2 + 0.35) { p.y = g2 + 0.35; if (p.vy < 0) p.vy *= -0.15; }
  if (p.y > 240) { p.y = 240; if (p.vy > 0) p.vy = 0; }

  p.agl = Math.max(0, p.y - g2);
  p.speed = Math.hypot(p.vx, p.vz) * rush;

  // --- the camera is the velocity vector. wind has no head. --------------
  const wantYaw = Math.atan2(p.vx, p.vz);
  let d = wantYaw - p.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  p.yaw += d * Math.min(1, 3.5 * dt);
  const wantPitch = Math.atan2(p.vy, Math.max(0.6, Math.hypot(p.vx, p.vz)));
  p.pitch += (wantPitch - p.pitch) * Math.min(1, 2.6 * dt);
}

// How hard you hit the world at a point. Falls off with distance, with
// altitude, and rises sharply when you converge.
export function influence(dx, dz) {
  const p = parcel;
  const conv = 1 - p.spread;
  const reach = 105 + conv * 95;
  return p.speed * Math.exp(-(dx * dx + dz * dz) / reach)
                 * Math.exp(-p.agl / 6.4)
                 * (0.45 + conv * 0.9);
}
