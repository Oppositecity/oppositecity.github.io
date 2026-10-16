// The house player: writes one Strudel line for a room from rules alone. No model, no tokens.
// Used by the bridge (node web/housemate.mjs < ctx.json) and by the page ("ask the house player").
// Every line it makes starts with /* house player */ so it is always labelled as generated.
//
// ctx: { key: "D minor"|null, bpm, lanes: [{ name, pitchRange: [lo,hi]|null, drums: bool }],
//        seed: string, last?: { lane, pitchClasses?: {pc: count} }, degrees?: "0 ~ 4 ~ 3 ~ 2 ~" }
// `degrees` lets a model vary the melody; it is cleaned to digits, spaces, ~ and <> and
// replaced by the rules' own line when it does not fit, so it can never carry code.

const TAG = '/* house player */ ';
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const MODES = { minor: 'minor', major: 'major', dorian: 'dorian', mixolydian: 'mixolydian', phrygian: 'phrygian', lydian: 'lydian' };
const STEPS = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
const PCNAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

export function parseKey(key, last) {
  const m = /^\s*([A-Ga-g])([#b]?)\s*(minor|major|dorian|mixolydian|phrygian|lydian|min|maj)?/i.exec(key || '');
  if (m) {
    let pc = NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const mode = /^maj/i.test(m[3] || '') ? 'major' : /^min/i.test(m[3] || '') ? 'minor' : (MODES[(m[3] || 'minor').toLowerCase()] || 'minor');
    return { pc: (pc + 12) % 12, mode };
  }
  const pcs = last?.pitchClasses;                       // no key given: lean on what was just played
  if (pcs && Object.keys(pcs).length) {
    const top = Object.entries(pcs).sort((a, b) => b[1] - a[1])[0][0] | 0;
    const minorThird = (pcs[(top + 3) % 12] || 0) > (pcs[(top + 4) % 12] || 0);
    return { pc: top, mode: minorThird ? 'minor' : 'major' };
  }
  return { pc: 2, mode: 'minor' };                       // D minor, the rehearsal room's key
}

const scaleName = (k, oct) => `${PCNAME[k.pc]}${oct}:${k.mode}`;
const clean = (d) => (typeof d === 'string' && /^[0-9 ~<>]{3,40}$/.test(d.trim()) && /[0-9]/.test(d) ? d.trim() : null);

function has(lanes, re, test) {
  return lanes.some((l) => re.test(l.name || '') || (l.pitchRange && test(l.pitchRange)));
}

export function plan(ctx) {
  const r = rng(String(ctx.seed || 'house'));
  const key = parseKey(ctx.key, ctx.last), lanes = ctx.lanes || [];
  const drums = lanes.some((l) => l.drums || /drum|perc|beat|kick|rhythm/i.test(l.name || ''));
  const bass = has(lanes, /bass|sub/i, (p) => p[1] <= 52);
  const high = has(lanes, /lead|melod|arp|high|top|voice|bell|pluck/i, (p) => p[1] >= 72);
  const used = new Set(lanes.map((l) => (l.name || '').toLowerCase()));
  const free = (n) => (used.has(n) ? `${n}2` : n);
  let lane, code, why;

  if (!drums) {
    lane = free('drums');
    const kick = pick(r, ['bd(3,8)', 'bd(5,8,2)', 'bd ~ ~ bd ~ ~ bd ~', 'bd ~ bd ~']);
    const hats = pick(r, ['hh*8', 'hh*4', '[~ hh]*4', 'hh(7,8)']);
    code = `stack(s("${kick}"), s("~ sd ~ sd"), s("${hats}").gain(.45))`;
    why = 'the room has no drums';
  } else if (!bass) {
    lane = free('bass');
    const own = clean(ctx.degrees);
    const deg = own || pick(r, ['0 ~ 4 ~ 3 ~ 2 ~', '0 ~ ~ 4 ~ 3 ~ ~', '0 0 ~ 4 ~ 2 ~ 3', '<0 3> ~ <4 5> ~ 0 ~ 2 ~']);
    code = `n("${deg}").scale("${scaleName(key, 2)}").s("sawtooth").lpf(500).lpenv(2).gain(.8)`;
    why = 'nothing in the room sits below C3';
  } else if (!high) {
    lane = free('lead');
    const own = clean(ctx.degrees);
    const deg = own || pick(r, ['~ 2 ~ 4 ~ ~ 3 ~', '4 ~ ~ 2 ~ 3 ~ ~', '~ ~ 4 ~ 6 ~ 4 ~', '<2 4> ~ ~ 3 ~ ~ 0 ~']);
    code = `n("${deg}").scale("${scaleName(key, 5)}").s("triangle").delay(.35).delaytime(.375).delayfeedback(.35).room(.4).gain(.6)`;
    why = 'nothing in the room sits above C5';
  } else {
    lane = free('counter');
    const own = clean(ctx.degrees);
    const deg = own || pick(r, ['~ 0 ~ ~ 2 ~ ~ ~', '~ ~ 2 ~ ~ 4 ~ ~', '<0 2> ~ ~ ~ <4 3> ~ ~ ~']);
    code = `n("${deg}").scale("${scaleName(key, 4)}").s("sine").attack(.02).release(.6).room(.5).gain(.45)`;
    why = 'every register has someone, so a quiet counter-line in the middle';
  }
  return { lane, code: TAG + code, why, key: `${PCNAME[key.pc]} ${key.mode}` };
}

// node web/housemate.mjs < ctx.json  ->  plan as one line of JSON
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('housemate.mjs')) {
  let s = '';
  process.stdin.on('data', (d) => (s += d)).on('end', () => console.log(JSON.stringify(plan(JSON.parse(s || '{}')))));
}
