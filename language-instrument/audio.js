
let ctx = null, master = null, wet = null, busSpeech = null, busTone = null;

function audio(){
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  master = ctx.createGain();
  master.gain.value = P.master.v;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  // a short room, so sustained letters can hear each other
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c=0; c<2; c++){
    const d = buf.getChannelData(c);
    for (let i=0; i<len; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 2.6);
  }
  conv.buffer = buf;
  wet = ctx.createGain();
  wet.gain.value = 0.16;

  busSpeech = ctx.createGain(); busSpeech.gain.value = P.speechLevel.v;
  busTone   = ctx.createGain(); busTone.gain.value   = P.toneLevel.v;
  busSpeech.connect(master); busTone.connect(master);

  master.connect(limiter);
  master.connect(wet); wet.connect(conv); conv.connect(limiter);
  limiter.connect(ctx.destination);
  return ctx;
}

const TIMBRE = {
  // cut   = where the filter lands by the end of the note (x fundamental)
  // open  = how far ABOVE that it starts, then sweeps down. This is the
  //         single thing that makes a voice read as an instrument instead
  //         of a tone: real sounds get darker as they decay.
  // hit   = filtered noise transient at onset — the finger, the tongue,
  //         the hammer. Short, but it is most of what identifies a voice.
  // sub   = octave below, for weight
  // drift = slow vibrato depth in cents, so held notes are not dead
  reed:   { types:['sawtooth','triangle'], cut:2.2, q:3.5, gain:0.22, part:2, ptype:'sine',
            open:5.0, hit:0.22, hitHz:2200, sub:0.18, drift:7 },
  glass:  { types:['sine','sine'],         cut:6.0, q:1.0, gain:0.24, part:3, ptype:'sine',
            open:2.2, hit:0.30, hitHz:7000, sub:0.05, drift:3 },
  pluck:  { types:['triangle','square'],   cut:3.0, q:2.0, gain:0.24, part:2, ptype:'triangle',
            open:7.0, hit:0.42, hitHz:3200, sub:0.22, drift:0 },
  choir:  { types:['sawtooth','sawtooth'], cut:1.5, q:5.0, gain:0.20, part:2, ptype:'sine',
            open:3.4, hit:0.10, hitHz:1200, sub:0.26, drift:12 },
  code:   { types:['square','square'],     cut:4.0, q:1.5, gain:0.18, part:4, ptype:'square',
            open:3.0, hit:0.26, hitHz:4200, sub:0.10, drift:0 },
  wood:   { types:['triangle','triangle'], cut:2.0, q:2.5, gain:0.24, part:2, ptype:'sine',
            open:8.0, hit:0.50, hitHz:1800, sub:0.30, drift:0 },
  hollow: { types:['square','triangle'],   cut:1.8, q:4.0, gain:0.20, part:3, ptype:'sine',
            open:4.0, hit:0.18, hitHz:900,  sub:0.24, drift:9 },
  voice:  { types:['sawtooth','sawtooth'], cut:2.4, q:6.0, gain:0.20, part:2, ptype:'sine',
            open:3.0, hit:0.08, hitHz:1500, sub:0.14, drift:14 }
};

// one shared noise buffer — transients are cheap this way
let NOISE = null;
function noiseBuf(){
  if (NOISE) return NOISE;
  const n = Math.floor(ctx.sampleRate * 0.25);
  NOISE = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i=0; i<n; i++) d[i] = Math.random()*2 - 1;
  return NOISE;
}

// live tone voices, newest last — the coupling pool
const ringing = [];

function panner(ch){
  const p = ctx.createStereoPanner
    ? ctx.createStereoPanner()
    : null;
  if (!p) return null;
  const jitter = (Math.random()*2 - 1) * 0.22;
  p.pan.value = LAYERS.space.on
    ? Math.max(-1, Math.min(1, ((keyPos(ch).x*2 - 1) + jitter) * P.width.v))
    : 0;
  return p;
}

/* --- SPEECH: the letter as an articulation --- */
function speak(ch, vel){
  const now = ctx.currentTime;
  const out = ctx.createGain();
  const pan = panner(ch);
  if (pan){ out.connect(pan); pan.connect(busSpeech); } else out.connect(busSpeech);

  if (isVowel(ch)){
    const f = VOWEL_FORMANTS[ch] || VOWEL_FORMANTS.a;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = P.voicePitch.v;

    const mix = ctx.createGain();
    [[f.f1,0.5],[f.f2,0.34]].forEach(([hz,amt]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = hz/90;
      const g = ctx.createGain(); g.gain.value = amt;
      osc.connect(bp); bp.connect(g); g.connect(mix);
    });

    const dur = P.vowelLen.v;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vel*0.34, now+0.03);
    env.gain.setTargetAtTime(0, now+dur*0.6, dur*0.25);
    mix.connect(env); env.connect(out);
    osc.start(now); osc.stop(now + dur + 0.4);
  } else {
    const kind = articOf(ch);
    const n = Math.floor(ctx.sampleRate * 0.09);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i=0; i<n; i++) d[i] = Math.random()*2 - 1;
    const src = ctx.createBufferSource(); src.buffer = b;

    const bp = ctx.createBiquadFilter();
    const shape = {
      plosive:  { type:'highpass', hz:1800, q:1,  len:0.045 },
      fricative:{ type:'bandpass', hz:5600, q:1.4,len:0.11  },
      affricate:{ type:'bandpass', hz:3400, q:2.4,len:0.08  },
      nasal:    { type:'lowpass',  hz:900,  q:4,  len:0.13  },
      liquid:   { type:'bandpass', hz:1400, q:5,  len:0.12  },
      glide:    { type:'lowpass',  hz:1600, q:2,  len:0.14  }
    }[kind];
    bp.type = shape.type;
    bp.frequency.value = shape.hz;
    bp.Q.value = shape.q * (0.5 + P.bite.v);

    const env = ctx.createGain();
    const amp = vel * 0.3 * (0.4 + P.bite.v*0.8);
    env.gain.setValueAtTime(amp, now);
    env.gain.exponentialRampToValueAtTime(0.0008, now + shape.len);

    src.connect(bp); bp.connect(env); env.connect(out);
    src.start(now);
  }
}

/* how long a point rings, by what kind of sound the letter is.
   plosives are dots, liquids and nasals are dashes — the texture needs
   different grain sizes or every point masks its neighbour. */
const GRAIN_LEN = {
  vowel:1.0, plosive:0.13, affricate:0.28, fricative:0.42,
  nasal:1.35, liquid:1.5, glide:1.1
};

/* register offset from letter rarity: common letters hold the middle,
   rare letters are flung to the edges, alternating up and down so the
   whole range fills in. Formal, and it is what stops the pile-up. */
function stratum(ch){
  const i = FREQ_ORDER.indexOf(ch);
  if (i < 0) return 0;
  const rarity = i / 25;
  const dir = (i % 2) ? 1 : -1;
  return dir * rarity * P.spread.v * 6;
}

/* ---------------- the beep cipher ----------------
   Nobody learns 26 arbitrary pitches. They learn feature bundles — which
   is how phonemes are learned in the first place. So a letter is:

       FAMILY  -> timbre + register band   (heard first, 7 of them)
       MEMBER  -> step within that family  (heard second, at most 6)

   Two cues, both small enough to hold in a head, and a third cue comes
   free from grain length. No scale quantizing here: quantizing collapses
   different letters onto the same pitch, which is fine for music and
   fatal for a code. Every letter must be recoverable by ear.          */

const CIPHER_FAMILY = {
  nasal:     { timbre:'choir',  base:-12 },
  glide:     { timbre:'hollow', base:-7  },
  liquid:    { timbre:'reed',   base:-5  },
  plosive:   { timbre:'pluck',  base:0   },
  vowel:     { timbre:'voice',  base:3   },
  affricate: { timbre:'code',   base:7   },
  fricative: { timbre:'glass',  base:12  }
};

// Steps inside a family, always spread across a full octave. A family of
// two gets its members an octave apart, not a whole tone — small families
// should be the EASY ones. Snapped to a pentatonic set so any two letters
// sounding together still agree.
const STEPS = [0, 2, 4, 7, 9, 12];

function stepFor(i, n){
  if (n <= 1) return 0;
  return STEPS[Math.round(i * (STEPS.length - 1) / (n - 1))];
}

function cipher(ch){
  const fam = isVowel(ch) ? 'vowel' : articOf(ch);
  const set = fam === 'vowel' ? VOWELS : ARTIC[fam];
  const idx = set.indexOf(ch);
  const f = CIPHER_FAMILY[fam];
  return { semi: f.base + stepFor(idx, set.length), timbre: f.timbre, family: fam };
}

/* Marks are not letters and should never be mistaken for one, so they get
   the one timbre no letter uses (wood) and their own registers. The
   apostrophe is the exception: it marks an ELISION — a letter that isn't
   there — so it is the shortest, highest thing in the language, a tick. */
const MARKS = {
  "'": { semi:31, timbre:'glass',  len:0.06 },   // elision tick
  '.': { semi:-17,timbre:'wood',   len:0.60 },   // full stop, the long low one
  ',': { semi:-10,timbre:'wood',   len:0.18 },
  '-': { semi:-12,timbre:'wood',   len:0.12 },
  '?': { semi:19, timbre:'wood',   len:0.38 },
  '!': { semi:21, timbre:'wood',   len:0.20 }
};
function digitMark(ch){
  return { semi:24 + (+ch)*2, timbre:'wood', len:0.16 };
}
function markOf(ch){
  if (MARKS[ch]) return MARKS[ch];
  if (/[0-9]/.test(ch)) return digitMark(ch);
  return null;
}

/* ---------------- written notation ----------------
   Sound and text are two of the three faces. This is the third: a written
   form you can pass on paper. Family letter + step number, so the notation
   says out loud what the ear is meant to do — find the family, then count
   the step. N1 is the first nasal. F5 is the fifth fricative.            */
const FAMILY_TAG = {
  nasal:'N', glide:'G', liquid:'L', plosive:'P',
  vowel:'V', affricate:'A', fricative:'F'
};
const MARK_TAG = { "'":"'", '.':'.', ',':',', '-':'-', '?':'?', '!':'!' };

function notate(ch){
  ch = ch.toLowerCase();
  if (ch === ' ') return '/';
  if (MARK_TAG[ch]) return MARK_TAG[ch];
  if (/[0-9]/.test(ch)) return '#' + ch;
  if (!/[a-z]/.test(ch)) return '';
  const fam = isVowel(ch) ? 'vowel' : articOf(ch);
  const set = fam === 'vowel' ? VOWELS : ARTIC[fam];
  return FAMILY_TAG[fam] + (set.indexOf(ch) + 1);
}

const FROM_TAG = (() => {
  const m = {};
  for (let i=0;i<26;i++){ const c = String.fromCharCode(97+i); m[notate(c)] = c; }
  Object.keys(MARK_TAG).forEach(c => m[MARK_TAG[c]] = c);
  for (let d=0; d<10; d++) m['#'+d] = String(d);
  m['/'] = ' ';
  return m;
})();

function encode(text){
  return [...text.toLowerCase()].map(notate).filter(Boolean).join(' ');
}

function decode(str){
  return str.trim().split(/\s+/).map(tok => FROM_TAG[tok] !== undefined ? FROM_TAG[tok] : '')
    .join('');
}

/* --- TONE: the letter as a pitch --- */
const CODE_OFFSET = {
  '(':-12,')':-12,'[':-10,']':-10,'{':-8,'}':-8,'<':-5,'>':-5,
  '=':7,'+':9,'-':5,'*':11,'/':4,'%':14,'!':16,'&':2,'|':3,
  ';':-2,':':0,',':-4,'.':-7,'"':19,"'":21,'_':-9,'#':12,'@':17,'$':13,'\\':6,'`':23,'?':18,'^':20,'~':15
};

function tone(ch, vel){
  let tName = SEL.timbre.v;
  const coded = SEL.mapping.v === 'cipher' && /[a-z]/.test(ch);
  /* marks are handled below and are live in cipher mode only */

  let semi, markLen = null;
  const mk = coded || SEL.mapping.v === 'cipher' ? markOf(ch) : null;

  if (coded) {
    const c = cipher(ch);
    semi = c.semi;
    tName = c.timbre;               // the family IS the timbre — that is the cue
  } else if (mk) {
    semi = mk.semi; tName = mk.timbre; markLen = mk.len;
  } else if (/[a-z]/.test(ch)) {
    semi = quantize(MAPPINGS[SEL.mapping.v](ch), SEL.scale.v)
         + quantize(Math.round(stratum(ch)), SEL.scale.v);
  } else if (/[0-9]/.test(ch)) {
    semi = quantize(+ch * 2, SEL.scale.v);
  } else if (SEL.timbre.v === 'code' && CODE_OFFSET[ch] !== undefined) {
    semi = CODE_OFFSET[ch];               // punctuation keeps its own intervals
  } else if (CODE_OFFSET[ch] !== undefined) {
    semi = quantize(((CODE_OFFSET[ch]%12)+12)%12, SEL.scale.v);
  } else {
    return null;
  }

  const t = TIMBRE[tName];
  const kind = /[a-z]/.test(ch) ? (isVowel(ch) ? 'vowel' : articOf(ch)) : 'plosive';
  let dur = markLen !== null ? markLen : P.sustain.v * (GRAIN_LEN[kind] || 1);
  if (tName === 'pluck') dur = Math.min(dur, 0.9);

  const freq = P.root.v * Math.pow(2, semi/12 + P.octave.v);

  // one letter is not one note. It is a small cloud of points, sprayed in
  // time and detuned against itself — the letter's own internal clutter.
  const count = Math.round(P.grain.v);
  let primary = null;

  for (let g = 0; g < count; g++){
    const late  = g === 0 ? 0 : (g * 0.012 + Math.random() * 0.05) * P.spray.v;
    const det   = g === 0 ? 0 : (Math.random() * 2 - 1) * 22 * P.spray.v;
    const amp   = g === 0 ? 1 : 0.55 / Math.sqrt(g + 1);
    const life  = g === 0 ? dur : dur * (0.4 + Math.random() * 0.5);
    const v = point(ch, freq, vel * amp, late, det, life, t, tName);
    if (g === 0) { v.semi = semi; primary = v; }
  }

  const now = ctx.currentTime;
  if (LAYERS.couple.on) coupleTo(primary, now, dur);

  ringing.push(primary);
  while (ringing.length > 28) ringing.shift();
  return primary;
}

/* a single point of sound */
function point(ch, freq, vel, late, detune, dur, t, tName){
  const now = ctx.currentTime + late;

  const out = ctx.createGain();
  const pan = panner(ch);
  if (pan){ out.connect(pan); pan.connect(busTone); } else out.connect(busTone);

  const osc  = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc.type = t.types[0]; osc2.type = t.types[1];
  osc.frequency.value = freq;
  osc2.frequency.value = freq;
  osc.detune.value = detune;
  osc2.detune.value = detune + (tName === 'choir' ? 9 : 4);

  // octave below, for weight
  let sub = null;
  if (t.sub > 0.01){
    sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    sub.detune.value = detune;
  }

  // slow drift, so a held note is alive
  let lfo = null, lfoGain = null;
  if (t.drift > 0 && dur > 0.4){
    lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.2 + Math.random() * 1.6;
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, now);
    lfoGain.gain.linearRampToValueAtTime(t.drift, now + dur * 0.5);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune); lfoGain.connect(osc2.detune);
    lfo.start(now); lfo.stop(now + dur + 0.1);
  }

  // THE FILTER SWEEP — starts open, closes as the note decays.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = t.q;
  const landing = Math.min(13000, freq * t.cut);
  const opening = Math.min(15000, landing * t.open);
  lp.frequency.setValueAtTime(opening, now);
  lp.frequency.exponentialRampToValueAtTime(Math.max(90, landing), now + Math.min(dur, 0.55));

  const env = ctx.createGain();
  const peak = vel * t.gain / Math.sqrt(Math.max(1, P.grain.v));
  const atk = tName === 'pluck' || tName === 'wood'
    ? 0.003
    : Math.min(0.035, dur * 0.18);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + atk);
  env.gain.exponentialRampToValueAtTime(0.0008, now + dur);

  osc.connect(lp); osc2.connect(lp);
  if (sub){
    const sg = ctx.createGain();
    sg.gain.value = t.sub;
    sub.connect(sg); sg.connect(lp);
    sub.start(now); sub.stop(now + dur + 0.1);
  }
  lp.connect(env); env.connect(out);

  // the transient: the finger, the tongue, the hammer. 25ms of filtered
  // noise at the onset, which is most of what tells voices apart.
  if (t.hit > 0.01){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(12000, t.hitHz * (0.7 + freq / 900));
    bp.Q.value = 1.1;
    const hg = ctx.createGain();
    const hitPeak = peak * t.hit * 1.5;
    hg.gain.setValueAtTime(hitPeak, now);
    hg.gain.exponentialRampToValueAtTime(0.0006, now + 0.028);
    src.connect(bp); bp.connect(hg); hg.connect(out);
    src.start(now); src.stop(now + 0.06);
  }

  // the top partial bypasses the filter entirely — this is what keeps the
  // tone layer audible on a laptop or phone speaker, which have no low end
  if (P.air.v > 0.01){
    const osc3 = ctx.createOscillator();
    osc3.type = t.ptype;
    osc3.frequency.value = freq * t.part;
    osc3.detune.value = detune;
    const ag = ctx.createGain();
    ag.gain.value = P.air.v * 0.45;
    osc3.connect(ag); ag.connect(env);
    osc3.start(now); osc3.stop(now + dur + 0.1);
  }

  osc.start(now); osc2.start(now);
  osc.stop(now + dur + 0.1); osc2.stop(now + dur + 0.1);

  return { ch, osc, osc2, freq, until: now + dur, links: [], el: null,
           phase: Math.random()*6.28 };
}

/* --- COUPLE: neighbours bend each other ---
   Each new letter frequency-modulates the letters still ringing behind it,
   and they modulate it back. How hard depends on
     (a) how many letters ago it was typed        — stream distance
     (b) how far apart the two keys are           — near/far bias
*/
function coupleTo(v, now, dur){
  const reach = Math.round(P.reach.v);
  const live = ringing.filter(o => o.until > now + 0.05);
  const partners = live.slice(-reach);

  partners.forEach((o, i) => {
    const back = partners.length - i;                 // 1 = immediately previous
    const streamFall = Math.pow(0.62, back - 1);

    const kd = keyDistance(o.ch, v.ch);               // 0 near .. 1 far
    const bias = P.nearBias.v;                        // +1 favours near keys
    const geo = bias >= 0
      ? (1 - kd) * bias + (1 - bias)
      : kd * (-bias) + (1 + bias);

    const amount = P.depth.v * streamFall * geo;
    if (amount < 0.005) return;

    // new letter -> old letter
    const g1 = ctx.createGain();
    g1.gain.value = 0;
    g1.gain.setTargetAtTime(amount * o.freq * 0.5, now, 0.05);
    g1.gain.setTargetAtTime(0, o.until - 0.15, 0.08);
    v.osc.connect(g1); g1.connect(o.osc.frequency); g1.connect(o.osc2.frequency);
    v.links.push(g1);

    // old letter -> new letter
    const back2 = P.mutual.v;
    if (back2 > 0.01){
      const g2 = ctx.createGain();
      g2.gain.value = 0;
      g2.gain.setTargetAtTime(amount * back2 * v.freq * 0.5, now, 0.05);
      g2.gain.setTargetAtTime(0, now + dur - 0.15, 0.08);
      o.osc.connect(g2); g2.connect(v.osc.frequency); g2.connect(v.osc2.frequency);
      v.links.push(g2);
      o.links.push(g2);
    }

    // record the pairing for the visual, newest few only — a long note
    // typed over would otherwise collect partners without limit and drag
    // the animation
    v.partners = v.partners || [];
    v.partners.push({ other:o, amount });
    if (v.partners.length > 6) v.partners.shift();
    o.partners = o.partners || [];
    o.partners.push({ other:v, amount });
    if (o.partners.length > 6) o.partners.shift();
  });
}

/* ---------------- keystroke ---------------- */

let lastTime = 0;

function sound(raw, vel){
  audio();
  const ch = raw.toLowerCase();
  if (ch === ' '){ if (LAYERS.speech.on) breath(vel || 1); return; }
  if (LAYERS.speech.on && /[a-z]/.test(ch)) speak(ch, vel || 1);
  if (LAYERS.tone.on) tone(ch, vel || 1);
}

function strike(raw){
  audio();
  const ch = raw.toLowerCase();
  const now = performance.now();
  const gap = lastTime ? now - lastTime : 400;
  lastTime = now;

  let vel = 1;
  if (LAYERS.pulse.on){
    // fast typing -> brighter, shorter; slow typing -> fuller
    const fast = Math.max(0, Math.min(1, 1 - gap/520));
    vel = 1 - P.swing.v * (fast*0.55 - 0.2);
    vel = Math.max(0.25, Math.min(1.4, vel));
  }

  if (!replaying){
    if (!tapeStart) tapeStart = performance.now();
    tape.push({ ch: raw, t: performance.now() - tapeStart, vel });
    while (tape.length > 600) tape.shift();
  }

  const el = paint(raw);

  if (ch === ' ' || ch === '\n'){
    if (LAYERS.speech.on) breath(vel);
    return;
  }

  if (LAYERS.speech.on && /[a-z]/.test(ch)) speak(ch, vel);
  if (LAYERS.tone.on){
    const v = tone(ch, vel);
    if (v) v.el = el;
  }
}

function breath(vel){
  const now = ctx.currentTime;
  const n = Math.floor(ctx.sampleRate * 0.16);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0; i<n; i++) d[i] = (Math.random()*2-1) * (1 - i/n);
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel*0.06, now);
  g.gain.exponentialRampToValueAtTime(0.0006, now + 0.17);
  s.connect(f); f.connect(g); g.connect(busSpeech);
  s.start(now);
}

/* ---------------- the visible line ---------------- */
