// palette.js — eight weather states, from a deep low to a strong high.
//
// Nothing here is a mood choice. The variant index is the local pressure. A low
// is dark and heavy and grey-green because that is what low pressure looks
// like; a high is pale and blue and still. So the sky is a readable instrument:
// you can see the gradient you are falling down before you get there.
//
// All eight variants are baked once at startup, so weather costs nothing per
// frame beyond picking an index.

export const rgb = (r, g, b) =>
  (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

const hx = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pack = (c) => rgb(c[0] | 0, c[1] | 0, c[2] | 0);

function stops(list, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < list.length - 1; i++) {
    if (t <= list[i + 1][0]) {
      const s = (t - list[i][0]) / (list[i + 1][0] - list[i][0] || 1);
      return lerp(list[i][1], list[i + 1][1], s);
    }
  }
  return list[list.length - 1][1];
}

export const WEATHERS = 8;
export const HAZE_BANDS = 16;
export const SKY_N = 18;

const STORM = {
  haze: hx('#68777c'), zenith: hx('#0a0f16'),
  ground: [
    [0.00, hx('#16241f')], [0.30, hx('#1f322b')], [0.55, hx('#2c4235')],
    [0.75, hx('#3f5546')], [0.90, hx('#5f7168')], [1.00, hx('#8b9a92')],
  ],
  grassFar: '#6f7f80', grassNear: '#6f9280',
  cloudLo: '#141d26', cloudHi: '#7e8f96', lift: 0.90,
};
const CLEAR = {
  haze: hx('#d6dfd6'), zenith: hx('#2c74ae'),
  ground: [
    [0.00, hx('#24382a')], [0.30, hx('#33523c')], [0.55, hx('#4a6a4c')],
    [0.75, hx('#688260')], [0.90, hx('#9aa88f')], [1.00, hx('#ccd6c6')],
  ],
  grassFar: '#a3b5aa', grassNear: '#9ed49b',
  cloudLo: '#5d7686', cloudHi: '#eef3ee', lift: 1.10,
};

const mixStops = (a, b, t) => a.map((s, i) => [s[0], lerp(s[1], b[i][1], t)]);

export const TERRAIN_LUTS = [];
export const SKY_RAMPS = [];
export const HAZES = [];

// Live sprite ramps. A stable object whose fields are swapped, rather than
// reassigned `export let` bindings — those are live under real ESM but get
// snapshotted by the bundler, which would silently ship undefined.
export const RAMPS = {
  GRASS: null, GRASS_SOWN: null, DARKS: null,
  CANOPY: null, PALE: null, CLOUD: null, MOTE: 0,
};

function ramp(from, to, n) {
  const a = typeof from === 'string' ? hx(from) : from;
  const b = typeof to === 'string' ? hx(to) : to;
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = pack(lerp(a, b, i / (n - 1)));
  return out;
}

const variants = [];

export function buildLUTs() {
  for (let w = 0; w < WEATHERS; w++) {
    const t = w / (WEATHERS - 1);
    const haze = lerp(STORM.haze, CLEAR.haze, t);
    const zen = lerp(STORM.zenith, CLEAR.zenith, t);
    const ground = mixStops(STORM.ground, CLEAR.ground, t);
    const lift = STORM.lift + (CLEAR.lift - STORM.lift) * t;

    const lut = new Uint32Array(64 * HAZE_BANDS);
    for (let hb = 0; hb < 8; hb++) {
      for (let lb = 0; lb < 8; lb++) {
        const base = stops(ground, (hb + 0.5) / 8);
        const k = (0.66 + (lb / 7) * 0.62) * lift;
        const c = [base[0] * k, base[1] * k, base[2] * k];
        const idx = (hb << 3) | lb;
        for (let d = 0; d < HAZE_BANDS; d++) {
          const f = Math.pow(d / (HAZE_BANDS - 1), 1.25) * 0.94;
          lut[idx * HAZE_BANDS + d] = pack(lerp(c, haze, f));
        }
      }
    }
    TERRAIN_LUTS.push(lut);

    const sky = new Uint32Array(SKY_N);
    for (let i = 0; i < SKY_N; i++) sky[i] = pack(lerp(haze, zen, Math.pow(i / (SKY_N - 1), 0.82)));
    SKY_RAMPS.push(sky);
    HAZES.push(haze);

    variants.push({
      GRASS: ramp(lerp(hx(STORM.grassFar), hx(CLEAR.grassFar), t),
                  lerp(hx(STORM.grassNear), hx(CLEAR.grassNear), t), 10),
      GRASS_SOWN: ramp(lerp(hx(STORM.grassFar), hx(CLEAR.grassFar), t),
                       lerp(hx('#b6dcae'), hx('#c8ecab'), t), 10),
      DARKS: ramp(haze, lerp(hx('#0f1b18'), hx('#1b2f21'), t), 10),
      CANOPY: ramp(haze, lerp(hx('#1d332a'), hx('#2a4a30'), t), 10),
      PALE: ramp(haze, lerp(hx('#eef4ee'), hx('#ffffff'), t), 10),
      CLOUD: ramp(lerp(hx(STORM.cloudLo), hx(CLEAR.cloudLo), t),
                  lerp(hx(STORM.cloudHi), hx(CLEAR.cloudHi), t), 8),
      MOTE: pack(lerp(hx('#dfe9e4'), hx('#ffffff'), t)),
    });
  }
  applyWeather(0);
}

let current = -1;
export function applyWeather(v) {
  if (v === current) return false;
  current = v;
  Object.assign(RAMPS, variants[v]);
  return true;
}
