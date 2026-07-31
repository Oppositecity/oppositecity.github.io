// input.js — three actuators. None of them is a steering wheel.

import { parcel } from './parcel.js';

const keys = { l: 0, r: 0, u: 0, d: 0 };
let ptr = null, lastX = 0, lastY = 0;
let dragX = 0, dragY = 0;
let onFirst = () => {};

export function setFirstInput(fn) { onFirst = fn; }

export function bindInput(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    onFirst();
    ptr = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    parcel.converging = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptr !== e.pointerId) return;
    dragX += (e.clientX - lastX) * 0.010;
    dragY += (e.clientY - lastY) * 0.012;
    dragX = Math.max(-1, Math.min(1, dragX));
    dragY = Math.max(-1, Math.min(1, dragY));
    lastX = e.clientX; lastY = e.clientY;
  });
  const up = (e) => { if (ptr === e.pointerId) { ptr = null; parcel.converging = false; } };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === ' ') { onFirst(); parcel.converging = true; e.preventDefault(); }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.l = 1; onFirst(); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.r = 1; onFirst(); }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { keys.u = 1; onFirst(); e.preventDefault(); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { keys.d = 1; onFirst(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === ' ') parcel.converging = false;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 0;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 0;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.u = 0;
    if (k === 'ArrowDown' || k === 's' || k === 'S') keys.d = 0;
  });
}

export function stepInput(dt) {
  // drag is a held lean; it bleeds back to neutral when you let go
  if (ptr === null) {
    const k = Math.pow(0.06, dt);
    dragX *= k; dragY *= k;
  }
  const kx = (keys.r - keys.l);
  const ky = (keys.u - keys.d);
  parcel.trim = Math.max(-1, Math.min(1, dragX + kx));
  parcel.climb = Math.max(-1, Math.min(1, -dragY + ky));
}
