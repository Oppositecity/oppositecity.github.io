// render.js — a small voxel-space renderer writing straight into a pixel
// buffer, with a depth value per pixel. Nothing needs sorting: the depth
// buffer decides. Everything is drawn at a fraction of screen resolution and
// scaled up with nearest-neighbour, so the whole world is honestly pixels.

import { heightFast, colourAt, heightAt } from './terrain.js';
import { TERRAIN_LUTS, SKY_RAMPS, HAZE_BANDS, SKY_N, WEATHERS, RAMPS, applyWeather, buildLUTs } from './palette.js';
import { parcel } from './parcel.js';
import { flowAt, getWeather } from './field.js';
import { sampleWake } from './wake.js';
import { GRASS_CELL, PROP_CELL, hash, sownAt } from './scatter.js';
import { propAt, particles } from './life.js';

export let LW = 0, LH = 0, PXS = 3;
let cv, ctx, img, pix, depth, halfW, horizon = 0, focal = 100;
let LUT = null, SKY = null;   // swapped per frame by the weather
let sa = 0, ca = 1;

const ZFAR = 178;
const HAZE_IDX = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  let v = (Math.pow(i / 511, 0.72) * HAZE_BANDS) | 0;
  HAZE_IDX[i] = v > HAZE_BANDS - 1 ? HAZE_BANDS - 1 : v;
}
const ZQ = 511 / ZFAR;
const GRASS_VIEW = 54;
// The raycast quantises depth to its march step, so anything standing *on* the
// ground would lose the depth test against the ground it stands on. Sprites are
// biased a few percent toward the eye — more than the step error, less than
// anything that should genuinely be hidden behind a ridge.
const DZ = 0.93;

// Converged you see through a slot; spread you see wide. Not so wide that the
// resting view becomes a fisheye — 98 degrees, not 126.
const FOV_NARROW = 52, FOV_WIDE = 98;
export const fovOf = (spread) => (FOV_NARROW + spread * (FOV_WIDE - FOV_NARROW)) * Math.PI / 180;

export function initRender(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d', { alpha: false });
  buildLUTs();
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  PXS = Math.max(2, Math.round(Math.min(W, H) / 150));
  LW = Math.ceil(W / PXS); LH = Math.ceil(H / PXS);
  cv.width = LW; cv.height = LH;
  cv.style.width = (LW * PXS) + 'px';
  cv.style.height = (LH * PXS) + 'px';
  ctx.imageSmoothingEnabled = false;
  img = ctx.createImageData(LW, LH);
  pix = new Uint32Array(img.data.buffer);
  depth = new Float32Array(LW * LH);
  halfW = LW / 2;
}

// ── pixel primitives ────────────────────────────────────────
function put(x, y, c, d) {
  if (x < 0 || x >= LW || y < 0 || y >= LH) return;
  const o = y * LW + x;
  if (d < depth[o]) { pix[o] = c; depth[o] = d; }
}
function seg(x0, y0, x1, y1, c, d) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = x1 - x0, dy = y1 - y0;
  let n = Math.max(Math.abs(dx), Math.abs(dy));
  if (n === 0) { put(x0, y0, c, d); return; }
  if (n > 260) n = 260;
  const ix = dx / n, iy = dy / n;
  let x = x0 + 0.5, y = y0 + 0.5;
  for (let i = 0; i <= n; i++) { put(x | 0, y | 0, c, d); x += ix; y += iy; }
}
function bar(x, y0, y1, w, c, d) {
  if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
  if (y1 < 0 || y0 >= LH) return;
  if (y0 < 0) y0 = 0; if (y1 >= LH) y1 = LH - 1;
  let xa = x - (w >> 1), xb = xa + w - 1;
  if (xb < 0 || xa >= LW) return;
  if (xa < 0) xa = 0; if (xb >= LW) xb = LW - 1;
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * LW;
    for (let xx = xa; xx <= xb; xx++) {
      const o = row + xx;
      if (d < depth[o]) { pix[o] = c; depth[o] = d; }
    }
  }
}
function blob(x, y, r, c, d, wob) {
  let ya = y - r, yb = y + r;
  if (yb < 0 || ya >= LH) return;
  if (ya < 0) ya = 0; if (yb >= LH) yb = LH - 1;
  const ir = 1 / (r + 0.5);
  for (let yy = ya; yy <= yb; yy++) {
    const dy = yy - y;
    const t = dy * ir;
    const q = 1 - t * t;
    if (q <= 0) continue;
    let hw = Math.sqrt(q) * r * (wob ? 0.86 + 0.24 * Math.sin(dy * 0.81 + wob) : 1);
    if (hw < 0.4) continue;
    let xa = (x - hw) | 0, xb = (x + hw) | 0;
    if (xb < 0 || xa >= LW) continue;
    if (xa < 0) xa = 0; if (xb >= LW) xb = LW - 1;
    const row = yy * LW;
    for (let xx = xa; xx <= xb; xx++) {
      const o = row + xx;
      if (d < depth[o]) { pix[o] = c; depth[o] = d; }
    }
  }
}

// ── projection (forward-distance parameterised, same as the raycast) ──
const P = { x: 0, y: 0, z: 0 };
let wx = 0.5;   // current weather, 0 storm .. 1 clear
function project(dx, dy, dz) {
  const rz = dx * sa + dz * ca;
  if (rz < 0.30) return false;
  const iv = focal / rz;
  P.x = halfW + (dx * ca - dz * sa) * iv;
  P.y = horizon - dy * iv;
  P.z = rz;
  return true;
}
const bandOf = (z, n) => {
  const i = ((1 - z / GRASS_VIEW) * n) | 0;
  return i < 0 ? 0 : (i >= n ? n - 1 : i);
};
// props stand much further off than grass, so they fade over the whole view
const bandFar = (z, n) => {
  const i = ((1 - z / ZFAR) * n) | 0;
  return i < 0 ? 0 : (i >= n ? n - 1 : i);
};

// ── clouds ────────────────────────────────────────────────
const clouds = [];
for (let i = 0; i < 110; i++) clouds.push({
  x: (Math.random() - 0.5) * 1400, z: (Math.random() - 0.5) * 1400,
  y: 130 + Math.random() * 120, r: 26 + Math.random() * 60, s: Math.random(),
  thresh: 0.10 + Math.random() * 0.98,
});
const _cf = [0, 0];
export function stepClouds(dt) {
  const p = parcel;
  for (const c of clouds) {
    flowAt(c.x, c.y, c.z, _cf);
    c.x += _cf[0] * 1.5 * dt;
    c.z += _cf[1] * 1.5 * dt;
    const dx = c.x - p.x, dz = c.z - p.z;
    if (dx * dx + dz * dz > 780 * 780) {
      const a = Math.random() * 6.283, r = 400 + Math.random() * 300;
      c.x = p.x + Math.sin(a) * r; c.z = p.z + Math.cos(a) * r;
      c.y = 130 + Math.random() * 120;
    }
  }
}

// ── frame ────────────────────────────────────────────────
export function drawFrame() {
  const p = parcel;
  sa = Math.sin(p.yaw); ca = Math.cos(p.yaw);

  // the sky, the haze and every sprite ramp follow the local pressure
  wx = getWeather();
  let wv = (wx * (WEATHERS - 1) + 0.5) | 0;
  if (wv < 0) wv = 0; else if (wv > WEATHERS - 1) wv = WEATHERS - 1;
  applyWeather(wv);
  LUT = TERRAIN_LUTS[wv]; SKY = SKY_RAMPS[wv];

  // field of view is a function of how spread out you are
  focal = halfW / Math.tan(fovOf(p.spread) / 2);
  horizon = LH * 0.5 + Math.tan(p.pitch) * focal;

  sky();
  drawClouds();
  raycast();
  drawGrass();
  drawProps();
  drawParticles();
  drawMotes();

  ctx.putImageData(img, 0, 0);
}

function sky() {
  depth.fill(1e9);
  const hI = horizon | 0;
  const invF = 1 / focal;
  const span = Math.PI * 0.38;   // 68 degrees of elevation spans the whole ramp
  for (let y = 0; y < LH; y++) {
    let c;
    if (y >= hI) c = SKY[0];
    else {
      let b = ((Math.atan((hI - y) * invF) / span) * SKY_N) | 0;
      if (b < 0) b = 0; else if (b >= SKY_N) b = SKY_N - 1;
      c = SKY[b];
    }
    pix.fill(c, y * LW, y * LW + LW);
  }
}

function drawClouds() {
  const p = parcel;
  for (const c of clouds) {
    if (wx > c.thresh) continue;          // high pressure burns the cloud off
    const dx = c.x - p.x, dz = c.z - p.z;
    if (!project(dx, c.y - p.y, dz)) continue;
    if (P.z < 60) continue;
    const iv = focal / P.z;
    const r = c.r * iv;
    if (r < 0.6) continue;
    if (P.x + r * 2 < 0 || P.x - r * 2 > LW) continue;
    let ci = ((1 - P.z / 820) * 7 * (0.55 + c.s * 0.6)) | 0;
    if (ci < 0) ci = 0; else if (ci > 7) ci = 7;
    const shade = RAMPS.CLOUD[ci];
    const xi = P.x | 0, yi = P.y | 0;
    for (let k = 0; k < 4; k++) {
      const rr = r * (0.75 - k * 0.13);
      if (rr < 0.5) continue;
      const ox = Math.sin(k * 2.3 + c.s * 11) * r * 0.75;
      const oy = -k * r * 0.20;
      blob((xi + ox) | 0, (yi + oy) | 0, Math.max(1, rr | 0), shade, P.z, c.s * 9);
    }
  }
}

function raycast() {
  const p = parcel;
  const camY = p.y;
  for (let sx = 0; sx < LW; sx++) {
    const t = (sx + 0.5 - halfW) / focal;
    const dx = sa + ca * t;
    const dz = ca - sa * t;
    let ybuf = LH;
    let z = 0.7, step = 0.34;
    while (z < ZFAR && ybuf > 0) {
      const rx = p.x + dx * z, rz2 = p.z + dz * z;
      const h = heightFast(rx, rz2);
      let sy = (horizon - (h - camY) * focal / z) | 0;
      if (sy < ybuf) {
        if (sy < 0) sy = 0;
        const hb = HAZE_IDX[(z * ZQ) | 0];
        const c = LUT[colourAt(rx, rz2) * HAZE_BANDS + hb];
        for (let y = sy; y < ybuf; y++) {
          const o = y * LW + sx;
          pix[o] = c; depth[o] = z;
        }
        ybuf = sy;
      }
      z += step; step *= 1.028;
    }
  }
}

// ── grass: bent by the general circulation, plus your wake ───────────
const _amb = [0, 0], _wk = [0, 0];
function drawGrass() {
  const p = parcel;
  flowAt(p.x, heightAt(p.x, p.z) + 1.0, p.z, _amb);
  const ambS = Math.hypot(_amb[0], _amb[1]) + 1e-3;
  const ax = _amb[0] / ambS, az = _amb[1] / ambS;
  const ambBend = Math.min(1, ambS / 7.5);
  const now = performance.now() * 0.001;

  const r = Math.ceil(GRASS_VIEW / GRASS_CELL);
  const ci = Math.floor(p.x / GRASS_CELL), cj = Math.floor(p.z / GRASS_CELL);
  const spreadTan = Math.tan(fovOf(p.spread) / 2) + 0.25;

  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      const bx = (i + 0.5) * GRASS_CELL - p.x;
      const bz = (j + 0.5) * GRASS_CELL - p.z;
      const rz = bx * sa + bz * ca;
      if (rz < -GRASS_CELL || rz > GRASS_VIEW) continue;
      const rx = bx * ca - bz * sa;
      if (Math.abs(rx) > rz * spreadTan + GRASS_CELL * 2) continue;

      const sown = sownAt(i, j);
      const n = sown > 0.2 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const k4 = k << 2;
        const gx = (i + hash(i, j, k4)) * GRASS_CELL;
        const gz = (j + hash(i, j, k4 + 1)) * GRASS_CELL;
        const gh = (0.55 + hash(i, j, k4 + 2) * 0.75) * (1 + sown * 0.75);
        const dx = gx - p.x, dz = gz - p.z;
        const z = dx * sa + dz * ca;
        if (z < 0.5 || z > GRASS_VIEW) continue;

        // gust fronts travelling across the field
        const gustw = 0.72 + 0.36 * Math.sin(gx * 0.045 + gz * 0.031 - now * 1.9);
        sampleWake(gx, gz, _wk);
        const wkS = Math.hypot(_wk[0], _wk[1]);
        const bxx = (ax * ambBend * gustw + _wk[0] * 1.15) * gh * 0.42;
        const bzz = (az * ambBend * gustw + _wk[1] * 1.15) * gh * 0.42;
        const lean = Math.min(0.85, Math.hypot(bxx, bzz) / (gh * 0.42));

        const gy = heightFast(gx, gz);
        if (!project(dx, gy - p.y, dz)) continue;
        const x0 = P.x | 0, y0 = P.y | 0;
        if (x0 < -22 || x0 > LW + 22) continue;
        if (!project(dx + bxx, gy + gh * (1 - lean * 0.32) - p.y, dz + bzz)) continue;
        const x1 = P.x | 0, y1 = P.y | 0;

        const pal = sown > 0.25 ? RAMPS.GRASS_SOWN : RAMPS.GRASS;
        let bnd = bandOf(z, pal.length);
        if (wkS > 0.5) bnd = Math.min(pal.length - 1, bnd + 1);
        const c = pal[bnd];
        const sp = Math.max(1, Math.min(4, (20 / z) | 0));
        const mx = ((x0 + x1) * 0.5 + (x1 - x0) * 0.16) | 0;
        const my = ((y0 + y1) * 0.5) | 0;
        const zbias = z * DZ;
        for (let b = -1; b <= 1; b++) {
          if (b !== 0 && z > 15) continue;
          seg(x0 + ((b * sp * 0.4) | 0), y0, mx + ((b * sp * 0.8) | 0), my, c, zbias);
          seg(mx + ((b * sp * 0.8) | 0), my, x1 + b * sp * 2, y1 + (b ? 1 : 0), c, zbias);
        }
      }
    }
  }
}

// ── props ────────────────────────────────────────────────
function drawProps() {
  const p = parcel;
  const r = 6;
  const ci = Math.floor(p.x / PROP_CELL), cj = Math.floor(p.z / PROP_CELL);
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      const s = propAt(i, j);
      if (!s) continue;
      const dx = s.x - p.x, dz = s.z - p.z;
      const z = dx * sa + dz * ca;
      if (z < 0.6 || z > ZFAR) continue;
      if (s.kind === 1) tree(s, dx, dz, z);
      else if (s.kind === 2) pole(s, dx, dz, z);
      else if (s.kind === 3) mill(s, dx, dz, z);
      else if (s.kind === 4) heads(s, dx, dz);
    }
  }
}

function tree(s, dx, dz, z) {
  const p = parcel, iv = focal / z;
  const b = bandFar(z, RAMPS.DARKS.length);
  if (!project(dx, s.y - p.y, dz)) return;
  const x0 = P.x | 0, y0 = P.y | 0;
  if (x0 < -220 || x0 > LW + 220) return;
  if (!project(dx + s.sx * 0.45, s.y + s.h * 0.62 - p.y, dz + s.sz * 0.45)) return;
  const x1 = P.x | 0, y1 = P.y | 0;
  const w = Math.max(1, Math.min(22, (0.42 * iv) | 0));
  const steps = Math.max(1, Math.min(220, Math.abs(y1 - y0)));
  for (let k = 0; k <= steps; k++) {
    const q = k / steps;
    const ww = Math.max(1, (w * (1 - q * 0.5)) | 0);
    bar((x0 + (x1 - x0) * q) | 0, (y0 + (y1 - y0) * q) | 0, (y0 + (y1 - y0) * q) | 0, ww, RAMPS.DARKS[b], z * DZ);
  }
  if (!project(dx + s.sx, s.y + s.h - p.y, dz + s.sz)) return;
  const rr = Math.min(140, Math.max(1, s.rad * focal / P.z));
  blob(P.x | 0, P.y | 0, rr | 0, RAMPS.CANOPY[bandFar(z, RAMPS.CANOPY.length)], P.z * DZ, s.h * 3.7);
}

function pole(s, dx, dz, z) {
  const p = parcel, iv = focal / z;
  const b = bandFar(z, RAMPS.DARKS.length);
  if (!project(dx, s.y - p.y, dz)) return;
  const x0 = P.x | 0, y0 = P.y | 0;
  if (x0 < -90 || x0 > LW + 90) return;
  if (!project(dx, s.y + s.h - p.y, dz)) return;
  const x1 = P.x | 0, y1 = P.y | 0;
  bar(x0, y0, y1, Math.max(1, Math.min(10, (0.20 * iv) | 0)), RAMPS.DARKS[b], z * DZ);
  const sw = Math.sin(s.a) * 0.6;
  const fx = p.vx / (p.speed + 1e-3), fz = p.vz / (p.speed + 1e-3);
  for (let k = 0; k < 5; k++) {
    const lat = (k - 2) * 0.20;
    const ox = dx + fz * lat + fx * sw * (0.6 + k * 0.11);
    const oz = dz - fx * lat + fz * sw * (0.6 + k * 0.11);
    const top = s.y + s.h * 0.93, len = 0.3 + k * 0.13;
    if (!project(ox, top - p.y, oz)) continue;
    const ax = P.x | 0, ay = P.y | 0;
    if (!project(ox, top - len - p.y, oz)) continue;
    bar(ax, ay, P.y | 0, Math.max(1, Math.min(5, (0.09 * iv) | 0)), RAMPS.PALE[Math.max(0, b - 1)], z * DZ);
  }
}

function mill(s, dx, dz, z) {
  const p = parcel, iv = focal / z;
  const b = bandFar(z, RAMPS.DARKS.length);
  if (!project(dx, s.y - p.y, dz)) return;
  const x0 = P.x | 0, y0 = P.y | 0;
  if (x0 < -260 || x0 > LW + 260) return;
  if (!project(dx, s.y + s.h - p.y, dz)) return;
  const hx = P.x | 0, hy = P.y | 0;
  bar(x0, y0, hy, Math.max(1, Math.min(12, (0.26 * iv) | 0)), RAMPS.DARKS[b], z * DZ);
  // the disc faces the wind, so it tells you which way the air is going
  const sp = Math.hypot(p.vx, p.vz) + 1e-3;
  const rvx = p.vz / sp, rvz = -p.vx / sp;
  for (let k = 0; k < 4; k++) {
    const a = s.ang + k * Math.PI / 2;
    const cs = Math.cos(a), sn = Math.sin(a);
    if (!project(dx + rvx * cs * s.rad, s.y + s.h + sn * s.rad - p.y, dz + rvz * cs * s.rad)) continue;
    seg(hx, hy, P.x | 0, P.y | 0, RAMPS.DARKS[Math.max(0, b - 1)], z * DZ);
    const sz = Math.max(1, Math.min(9, (0.26 * iv) | 0));
    bar(P.x | 0, (P.y - (sz >> 1)) | 0, (P.y + (sz >> 1)) | 0, sz, RAMPS.DARKS[Math.max(0, b - 1)], z * DZ);
  }
}

function heads(s, dx0, dz0) {
  const p = parcel;
  for (const h of s.heads) {
    const dx = h.x - p.x, dz = h.z - p.z;
    const z = dx * sa + dz * ca;
    if (z < 0.5 || z > 70) continue;
    const iv = focal / z;
    if (!project(dx, h.y - p.y, dz)) continue;
    const x0 = P.x | 0, y0 = P.y | 0;
    if (x0 < -20 || x0 > LW + 20) continue;
    sampleWake(h.x, h.z, _wk);
    const bx = _wk[0] * 0.30, bz = _wk[1] * 0.30;
    if (!project(dx + bx, h.y + h.h - p.y, dz + bz)) continue;
    seg(x0, y0, P.x | 0, P.y | 0, RAMPS.DARKS[Math.max(0, bandFar(z, RAMPS.DARKS.length) - 2)], z * DZ);
    if (!h.alive) continue;
    const rr = Math.max(1, Math.min(26, (0.22 * iv) | 0));
    blob(P.x | 0, P.y | 0, rr, RAMPS.PALE[bandFar(z, RAMPS.PALE.length)], z * DZ, 0);
  }
}

function drawParticles() {
  const p = parcel;
  for (const q of particles) {
    const dx = q.x - p.x, dz = q.z - p.z;
    if (!project(dx, q.y - p.y, dz)) continue;
    if (P.z > 90) continue;
    const iv = focal / P.z;
    const s = Math.max(1, Math.min(6, ((q.kind ? 0.14 : 0.11) * iv) | 0));
    const c = q.kind ? RAMPS.CANOPY[bandOf(P.z, RAMPS.CANOPY.length)]
                     : RAMPS.PALE[Math.min(RAMPS.PALE.length - 1, bandOf(P.z, RAMPS.PALE.length) + 2)];
    const x = P.x | 0, y = P.y | 0;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++)
      put(x - (s >> 1) + xx, y - (s >> 1) + yy, c, P.z * DZ);
  }
}

// ── motes: the only sign of yourself ─────────────────────────────
// Each is a speck of dust sitting in the ambient flow. What you see is the
// difference between where the air is going and where *you* are going — so
// the streaks only appear when you converge and outrun the field.
const motes = [];
for (let i = 0; i < 190; i++) motes.push({ x: 0, y: 0, z: 0, fx: 0, fz: 0, live: false, k: Math.random() });
const _mf = [0, 0];
export function stepMotes(dt) {
  const p = parcel;
  for (const m of motes) {
    const dx = m.x - p.x, dz = m.z - p.z;
    const rz = dx * sa + dz * ca;
    if (!m.live || rz < 0.8 || dx * dx + dz * dz > 620 || Math.abs(m.y - p.y) > 18) {
      const a = p.yaw + (Math.random() - 0.5) * 2.3, r = 3 + Math.random() * 19;
      m.x = p.x + Math.sin(a) * r; m.z = p.z + Math.cos(a) * r;
      m.y = p.y + (Math.random() - 0.5) * 11;
      m.live = true; continue;
    }
    flowAt(m.x, m.y, m.z, _mf);
    sampleWake(m.x, m.z, _wk);
    m.fx = _mf[0] + _wk[0] * 5.0;
    m.fz = _mf[1] + _wk[1] * 5.0;
    m.x += m.fx * dt;
    m.z += m.fz * dt;
  }
}
function drawMotes() {
  const p = parcel;
  const conv = 1 - p.spread;
  for (const m of motes) {
    if (!m.live) continue;
    const dx = m.x - p.x, dz = m.z - p.z;
    if (!project(dx, m.y - p.y, dz)) continue;
    const x0 = P.x | 0, y0 = P.y | 0, z0 = P.z;
    if (x0 < -30 || x0 > LW + 30) continue;
    const rel = 0.11 * (1 + m.k);
    const ex = dx - (p.vx * (1 + conv * 0.9) - m.fx) * rel;
    const ez = dz - (p.vz * (1 + conv * 0.9) - m.fz) * rel;
    if (!project(ex, m.y - p.y, ez)) continue;
    seg(x0, y0, P.x | 0, P.y | 0, RAMPS.MOTE, z0 * 0.90);
  }
}
