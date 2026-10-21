
const line = document.getElementById('line');
const caret = document.getElementById('caret');

function paint(raw){
  const el = document.createElement('span');
  el.textContent = raw === ' ' ? '\u00a0' : raw;
  line.insertBefore(el, caret);
  while (line.childNodes.length > 260) line.removeChild(line.firstChild);
  line.scrollTop = line.scrollHeight;
  return el;
}

function unpaint(){
  const prev = caret.previousSibling;
  if (prev) line.removeChild(prev);
}

/* letters that are still sounding lean toward whoever they're coupled to
   and shiver at the difference between their frequencies                */
function frame(){
  if (ctx){
    const now = ctx.currentTime;
    for (const v of ringing){
      if (!v.el) continue;
      const life = v.until - now;
      if (life <= 0){
        if (v.el.dataset.live){
          v.el.style.transform = `translate(0px, ${(-(v.semi||0) * 0.55 * P.scatter.v).toFixed(2)}px)`;
          v.el.style.color = '';
          delete v.el.dataset.live;
        }
        continue;
      }
      v.el.dataset.live = '1';
      const base = -(v.semi || 0) * 0.55 * P.scatter.v;
      const strength = Math.min(1, life / Math.max(0.2, P.sustain.v));

      let wob = 0, lean = 0;
      if (v.partners){
        for (const p of v.partners){
          if (p.other.until <= now) continue;
          const beat = Math.abs(v.freq - p.other.freq) * 0.02;
          wob += Math.sin(now * (2 + beat) * 3 + v.phase) * p.amount;
          lean += p.amount * Math.sign(p.other.freq - v.freq);
        }
      }
      const dx = wob * 5 * strength + lean * 2.4 * strength;
      const dy = base - strength * 3 - Math.abs(wob) * 2;
      v.el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      v.el.style.color = wob !== 0 ? 'var(--couple)' : 'var(--tone)';
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- input, one path for phone and desktop ---------------- */

const feed = document.getElementById('feed');
let seen = '';

feed.addEventListener('input', () => {
  const val = feed.value;
  if (val.length > seen.length){
    const added = val.slice(seen.length);
    for (const c of added) strike(c);
  } else if (val.length < seen.length){
    for (let i=0; i<seen.length-val.length; i++) unpaint();
  }
  seen = val;
  if (val.length > 700){ feed.value = ''; seen = ''; }
});

feed.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); strike(' '); seen += ' '; feed.value = seen; }
});

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#layers, #params')) { audio(); feed.focus(); }
});
window.addEventListener('load', () => feed.focus());

/* ---------------- controls ---------------- */

const layersEl = document.getElementById('layers');
const paramsEl = document.getElementById('params');

Object.entries(LAYERS).forEach(([key, L]) => {
  const b = document.createElement('button');
  b.className = 'layer';
  b.textContent = L.label;
  b.style.setProperty('--c', L.color);
  b.dataset.on = L.on ? '1' : '0';
  b.setAttribute('aria-pressed', L.on);
  b.addEventListener('click', () => {
    L.on = !L.on;
    b.dataset.on = L.on ? '1' : '0';
    b.setAttribute('aria-pressed', L.on);
    buildParams();
  });
  layersEl.appendChild(b);
});

function row(labelText, control, valueEl){
  const r = document.createElement('div');
  r.className = 'row';
  const n = document.createElement('div');
  n.className = 'name'; n.textContent = labelText;
  r.appendChild(n); r.appendChild(control);
  if (valueEl) r.appendChild(valueEl);
  return r;
}

const PRESETS = {
  'Legible': () => {
    // one point per letter, nothing bending anything, code mapping on.
    SEL.mapping.v='cipher'; P.grain.v=1; P.spray.v=0; P.sustain.v=1.4;
    P.scatter.v=1; P.air.v=0.22;
    LAYERS.couple.on=false; LAYERS.tone.on=true; LAYERS.speech.on=true;
    LAYERS.pulse.on=false; LAYERS.space.on=true;
  },
  'Musical': () => {
    SEL.mapping.v='phonetic'; P.grain.v=3; P.spray.v=0.5; P.sustain.v=1.6;
    P.spread.v=3.4; P.scatter.v=0.85;
    LAYERS.couple.on=true; LAYERS.tone.on=true; LAYERS.speech.on=true;
    LAYERS.pulse.on=true; LAYERS.space.on=true;
  }
};

const presetsEl = document.getElementById('presets');
Object.entries(PRESETS).forEach(([name, fn]) => {
  const b = document.createElement('button');
  b.className = 'layer';
  b.textContent = name;
  b.addEventListener('click', () => {
    fn();
    if (busTone) busTone.gain.value = P.toneLevel.v;
    if (busSpeech) busSpeech.gain.value = P.speechLevel.v;
    syncLayers();
    buildParams();
  });
  presetsEl.appendChild(b);
});

function syncLayers(){
  layersEl.querySelectorAll('.layer').forEach((b, i) => {
    const key = Object.keys(LAYERS)[i];
    b.dataset.on = LAYERS[key].on ? '1' : '0';
    b.setAttribute('aria-pressed', LAYERS[key].on);
  });
}

/* ================= TAPE =================
   Keystrokes with their timing, so a performance can be replayed or looped.
   This is also the exchange format a keystroke-capture platform would want. */
/* The tape is always running. An instrument does not ask to be armed —
   whatever you just played is already there to hear again. */
let tape = [], tapeStart = 0, loopOn = false, loopTimers = [], replaying = false;

function tapeStop(){
  loopTimers.forEach(clearTimeout); loopTimers = [];
  replaying = false;
}

function tapePlay(){
  tapeStop();
  if (!tape.length) return;
  replaying = true;
  const t0 = tape[0].t;
  const span = tape[tape.length-1].t - t0 + 900;
  // re-sound only: the letters are already on screen, so playing back
  // means hearing the poem you can see, not typing it again
  tape.forEach(ev => loopTimers.push(setTimeout(() => sound(ev.ch, ev.vel), ev.t - t0)));
  loopTimers.push(setTimeout(() => {
    if (loopOn) tapePlay(); else replaying = false;
  }, span));
}

/* ================= LEARNING ================= */

/* Levels introduce one family at a time. A level's words use only the
   letters unlocked so far, so a wrong answer is always a discrimination
   you have actually been taught. */
const LEVELS = [
  { name:'1 · hum', letters:'aeiouymn',
    words:['no','on','in','me','my','man','moon','mine','name','noon','omen','money',
           'nine','amen','mean','moan','main','menu','many','union','immune','anemone',
           'minimum','yeoman'] },
  { name:'2 · flow', letters:'aeiouymnlr',
    words:['learn','roll','alarm','rail','moral','rumour','online','lemon','mural',
           'normal','lion','mirror','runner','male','role','rely','marine','million',
           'lunar','manner','realm','rural','yearly','normally'] },
  { name:'3 · strike', letters:'aeiouymnlrptkbdg',
    words:['problem','tablet','garden','pilot','dragon','bandit','marble','tunnel',
           'ripple','kettle','pebble','gentle','trumpet','plumber','garland','bulletin',
           'template','melodrama','airport','planet','kingdom','painted','tremble','magnet'] },
  { name:'4 · breath', letters:'aeiouymnlrptkbdgfvszh',
    words:['harvest','silver','flavour','shelter','fossil','history','massive','thimble',
           'hospital','forest','festival','several','elevator','vanish','hazel','stubborn',
           'transfer','sunlight','daughter','feather','shoulder','thousand','breakfast',
           'elephant','identify','saturday'] },
  { name:'5 · all', letters:'abcdefghijklmnopqrstuvwxyz',
    words:['jigsaw','oxygen','quiver','jacket','complex','wizard','joyful','anxious',
           'question','journey','excavate','quicksand','jukebox','waxwork','conjure',
           'equinox','jazz','wavelength','sequoia','clockwise','exchange','vocabulary'] },
  { name:"6 · don't", letters:"abcdefghijklmnopqrstuvwxyz'",
    words:["don't","it's","we're","can't","won't","i'm","you've","let's","that's",
           "they'll","she'd","isn't","couldn't","wouldn't","haven't","there's","who's",
           "we'll","i've","doesn't","shouldn't","o'clock","aren't","you'll","weren't","he'd"] },
  { name:'7 · phrases', letters:"abcdefghijklmnopqrstuvwxyz' ",
    words:["it's time","don't stop","we're here","let's go","who's there","that's mine",
           "i can't hear you","she'd know","hold the line","one more word",
           "you've done it","they'll wait"] },
  { name:'8 · full stop', letters:"abcdefghijklmnopqrstuvwxyz' .,?!",
    words:["don't stop.","who's there?","it's mine!","let's begin.","we're late, again.",
           "can you hear it?","that's the whole language.","listen, then write.",
           "i'm ready.","no, not yet."] }
];

let level = 0, target = '', asked = 0, right = 0, revealed = false;
const PACE = { Slow:1100, Steady:640, Brisk:380, Fast:210 };
let pace = 'Steady';
const misses = {};                    // per-letter, drives what you get asked

const modesEl   = document.getElementById('modes');
const levelsEl  = document.getElementById('levels');
const statusEl  = document.getElementById('learn-status');
const ctrlEl    = document.getElementById('learn-controls');
const answerEl  = document.getElementById('answer');
const verdictEl = document.getElementById('verdict');
const scoreEl   = document.getElementById('score');
const keychartEl= document.getElementById('keychart');

function button(label, fn, parent){
  const b = document.createElement('button');
  b.className = 'layer';
  b.textContent = label;
  b.addEventListener('click', fn);
  parent.appendChild(b);
  return b;
}

/* --- views --- */
const VIEWS = { Play:'view-play', Key:'view-key', Learn:'view-learn', Encode:'view-encode' };
let view = 'Play';
function showView(name){
  view = name;
  Object.entries(VIEWS).forEach(([n,id]) => {
    document.getElementById(id).hidden = (n !== name);
  });
  modesEl.querySelectorAll('.layer').forEach(b => {
    b.dataset.on = b.textContent === name ? '1' : '0';
  });
  if (name === 'Play') feed.focus();
  if (name === 'Learn') answerEl.focus();
}
Object.keys(VIEWS).forEach(n => {
  const b = button(n, () => { audio(); showView(n); }, modesEl);
  b.style.setProperty('--c', 'var(--ink)');
});

/* --- the key --- */
const FAMILY_NOTE = {
  nasal:'hummed and low — the longest, darkest sounds',
  glide:'hollow and soft',
  liquid:'warm and ringing',
  plosive:'plucked dots — the shortest sounds',
  vowel:'sung — the only letters that hold',
  affricate:'buzzy and square',
  fricative:'glassy and high — airy'
};

function playLetter(ch){
  audio();
  const keep = SEL.mapping.v;
  SEL.mapping.v = 'cipher';
  sound(ch, 1);
  SEL.mapping.v = keep;
}

function buildKey(){
  keychartEl.innerHTML = '';
  const order = ['nasal','glide','liquid','plosive','vowel','affricate','fricative'];
  order.forEach(fam => {
    const set = fam === 'vowel' ? VOWELS : ARTIC[fam];
    const wrap = document.createElement('div');
    wrap.className = 'fam';
    const h = document.createElement('h2');
    h.textContent = fam + ' — ' + CIPHER_FAMILY[fam].timbre + ' — ' + FAMILY_NOTE[fam];
    wrap.appendChild(h);
    const g = document.createElement('div');
    g.className = 'glyphs';
    [...set].forEach(ch => {
      const k = cipher(ch);
      const b = document.createElement('button');
      b.className = 'glyph';
      b.innerHTML = '<b>' + ch + '</b><i>' + notate(ch) + '</i><i>' +
        Math.round(P.root.v * Math.pow(2, k.semi/12)) + 'Hz</i>';
      b.addEventListener('click', () => playLetter(ch));
      g.appendChild(b);
    });
    wrap.appendChild(g);
    keychartEl.appendChild(wrap);
  });

  // marks
  const wrap = document.createElement('div');
  wrap.className = 'fam';
  const h = document.createElement('h2');
  h.textContent = "marks — wood — never a letter. ' is the elision tick";
  wrap.appendChild(h);
  const g = document.createElement('div');
  g.className = 'glyphs';
  Object.keys(MARKS).forEach(ch => {
    const b = document.createElement('button');
    b.className = 'glyph';
    b.innerHTML = '<b>' + ch + '</b><i>' +
      Math.round(P.root.v * Math.pow(2, MARKS[ch].semi/12)) + 'Hz</i>';
    b.addEventListener('click', () => playLetter(ch));
    g.appendChild(b);
  });
  wrap.appendChild(g); wrap.appendChild(document.createElement('div'));
  keychartEl.appendChild(wrap);
}

/* --- encode view: three faces of the same thing --- */
const encText = document.getElementById('enc-text');
const encCode = document.getElementById('enc-code');
const encCtrl = document.getElementById('enc-controls');
const encNote = document.getElementById('enc-note');

let syncing = false;
function describe(t){
  const n = [...t].filter(c => /[a-z0-9'.,\-?!]/.test(c)).length;
  encNote.textContent = n ? n + ' signs' : '';
}
encText.addEventListener('input', () => {
  if (syncing) return;
  syncing = true; encCode.value = encode(encText.value); describe(encText.value); syncing = false;
});
encCode.addEventListener('input', () => {
  if (syncing) return;
  syncing = true; encText.value = decode(encCode.value); describe(encText.value); syncing = false;
});

button('Play', () => playWord(encText.value, PACE[pace]), encCtrl);
button('Copy notation', () => {
  if (navigator.clipboard) navigator.clipboard.writeText(encCode.value)
    .then(() => encNote.textContent = 'Notation copied')
    .catch(() => encNote.textContent = 'Select and copy by hand');
  else encNote.textContent = 'Select and copy by hand';
}, encCtrl);
button('Clear', () => { encText.value=''; encCode.value=''; encNote.textContent=''; }, encCtrl);

/* --- play a word as beeps --- */
let playing = false, playTimers = [];
function stopWord(){
  playTimers.forEach(clearTimeout); playTimers = []; playing = false;
}
function playWord(word, gap){
  audio();
  stopWord();
  if (!word) return;
  playing = true;
  const keep = SEL.mapping.v;
  SEL.mapping.v = 'cipher';
  const chars = [...word.toLowerCase()];
  let t = 0;
  chars.forEach((ch, i) => {
    playTimers.push(setTimeout(() => sound(ch, 1), t));
    // a space is a real pause, not a beep with a gap after it
    t += (ch === ' ') ? gap * 1.5 : gap;
    if (i === chars.length - 1){
      playTimers.push(setTimeout(() => { SEL.mapping.v = keep; playing = false; }, t + 400));
    }
  });
}

function weight(w){
  let s = 0;
  for (const ch of w) s += (misses[ch] || 0);
  return s;
}

function newWord(){
  const L = LEVELS[level];
  // sample a few and take whichever contains most of your weak letters,
  // so practice drifts toward what you actually get wrong
  let best = null, bestScore = -1;
  for (let i=0; i<5; i++){
    const cand = L.words[Math.floor(Math.random() * L.words.length)];
    if (cand === target) continue;
    const sc = weight(cand) + Math.random() * 0.5;
    if (sc > bestScore){ bestScore = sc; best = cand; }
  }
  target = best || L.words[Math.floor(Math.random() * L.words.length)];
  revealed = false;
  answerEl.value = '';
  verdictEl.innerHTML = '';
  const signs = [...target].filter(c => c !== ' ').length;
  statusEl.textContent = 'Listen. ' + signs + ' sounds' +
    (target.includes(' ') ? ', ' + target.split(' ').length + ' words' : '') + '.';
  playWord(target, PACE[pace]);
  answerEl.focus();
}

function check(){
  if (!target) { statusEl.textContent = 'Play a word first.'; return; }
  const given = answerEl.value.trim().toLowerCase();
  if (!given) return;

  const line = document.createElement('div');
  line.className = 'vline';
  const notes = [];
  const n = Math.max(given.length, target.length);
  let hits = 0;

  for (let i = 0; i < n; i++){
    const want = target[i], got = given[i];
    const el = document.createElement('span');
    if (want && got === want){ el.className = 'hit'; el.textContent = want; hits++; }
    else {
      el.className = 'miss';
      el.textContent = got || '·';
      if (want){
        notes.push(explain(want, got));
        misses[want] = (misses[want] || 0) + 1;
      }
    }
    line.appendChild(el);
  }
  verdictEl.innerHTML = '';
  verdictEl.appendChild(line);

  const correct = given === target;
  asked++; if (correct) right++;
  statusEl.textContent = correct
    ? 'Yes — ' + target
    : 'It was ' + target;

  notes.slice(0, 3).forEach(t => {
    const p = document.createElement('div');
    p.className = 'why';
    p.textContent = t;
    verdictEl.appendChild(p);
  });
  const code = document.createElement('div');
  code.className = 'why';
  code.textContent = 'written: ' + encode(target);
  verdictEl.appendChild(code);

  const weak = Object.keys(misses).sort((a,b) => misses[b]-misses[a]).slice(0,3);
  scoreEl.textContent = right + ' of ' + asked +
    (weak.length ? '  ·  weakest: ' + weak.join(' ') : '');
  revealed = true;
}

/* say WHY it was missed, in the terms the cipher is taught in */
function explain(want, got){
  const mkW = markOf(want);
  if (mkW) return want === "'"
    ? "' is the tick — the shortest, highest sound. It marks a letter that isn't there."
    : "' " + want + "' is a mark, not a letter: wood timbre, which no letter uses.";
  const w = cipher(want);
  const hzW = Math.round(P.root.v * Math.pow(2, w.semi/12));
  if (!got) return want + ' — ' + w.family + ', ' + w.timbre + ', ' + hzW + 'Hz. You stopped early.';
  const g = markOf(got) ? null : (/[a-z]/.test(got) ? cipher(got) : null);
  if (!g) return want + ' — ' + w.family + ', ' + w.timbre + ', ' + hzW + 'Hz.';
  if (g.family === w.family){
    const step = w.semi - g.semi;
    return want + '/' + got + ' — same family (' + w.family + '), so the timbre was right. ' +
      want + ' is ' + Math.abs(step) + ' semitones ' + (step > 0 ? 'higher' : 'lower') + '.';
  }
  return want + ' is ' + w.family + ' (' + w.timbre + '), you heard ' + g.family +
    ' (' + g.timbre + '). Listen for the timbre before the pitch.';
}

function buildLevels(){
  levelsEl.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = button(L.name, () => {
      level = i; asked = 0; right = 0; scoreEl.textContent = '';
      buildLevels();
      newWord();
    }, levelsEl);
    b.dataset.on = i === level ? '1' : '0';
    b.style.setProperty('--c', 'var(--ink)');
  });
}

const paceBtn = button('Pace: Steady', () => {
  const keys = Object.keys(PACE);
  pace = keys[(keys.indexOf(pace) + 1) % keys.length];
  paceBtn.textContent = 'Pace: ' + pace;
}, ctrlEl);

button('Show notation', () => {
  if (!target) return;
  const d = document.createElement('div');
  d.className = 'why';
  d.textContent = encode(target);
  verdictEl.innerHTML = '';
  verdictEl.appendChild(d);
  statusEl.textContent = 'Read it by eye, then type the word.';
}, ctrlEl);

button('New word', newWord, ctrlEl);
button('Hear again', () => target && playWord(target, PACE[pace]), ctrlEl);
button('Slower', () => target && playWord(target, PACE.Slow), ctrlEl);
button('Check', check, ctrlEl);
button('Give up', () => {
  if (!target) return;
  answerEl.value = target;
  check();
}, ctrlEl);

answerEl.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); revealed ? newWord() : check(); }
});

buildLevels();
buildKey();

const tapeEl = document.getElementById('tape');
const rackEl = document.getElementById('rack');

const rackBtn = button('Controls', () => {
  rackEl.hidden = !rackEl.hidden;
  rackBtn.dataset.on = rackEl.hidden ? '0' : '1';
}, tapeEl);

button('Play', tapePlay, tapeEl);
const loopBtn = button('Loop', () => {
  loopOn = !loopOn;
  loopBtn.dataset.on = loopOn ? '1' : '0';
  if (loopOn) tapePlay(); else tapeStop();
}, tapeEl);
button('Clear', () => {
  tapeStop(); loopOn = false; loopBtn.dataset.on = '0';
  tape = []; tapeStart = 0;
  while (line.firstChild !== caret) line.removeChild(line.firstChild);
  feed.value = ''; seen = ''; feed.focus();
}, tapeEl);
tapeEl.querySelectorAll('.layer').forEach(b => b.style.setProperty('--c','var(--ink)'));

function buildParams(){
  paramsEl.innerHTML = '';

  const groups = [null, ...Object.keys(LAYERS).filter(k => LAYERS[k].on)];

  groups.forEach(g => {
    const sliders = Object.entries(P).filter(([,p]) => p.group === g);
    const selects = Object.entries(SEL).filter(([,s]) => s.group === g);
    if (!sliders.length && !selects.length) return;

    if (g){
      const h = document.createElement('div');
      h.className = 'group-name';
      h.textContent = LAYERS[g].label;
      h.style.setProperty('--c', LAYERS[g].color);
      paramsEl.appendChild(h);
    }

    selects.forEach(([key, s]) => {
      const sel = document.createElement('select');
      Object.entries(s.opts).forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        if (v === s.v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { s.v = sel.value; });
      paramsEl.appendChild(row(s.name, sel));
    });

    sliders.forEach(([key, p]) => {
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = p.v;
      if (g) inp.style.setProperty('--c', LAYERS[g].color);
      const val = document.createElement('div');
      val.className = 'val';
      const show = () => val.textContent = (p.step >= 1 ? p.v : p.v.toFixed(2)) + (p.unit ? ' '+p.unit : '');
      show();
      inp.addEventListener('input', () => {
        p.v = parseFloat(inp.value);
        show();
        if (key === 'master'      && master)    master.gain.value = p.v;
        if (key === 'speechLevel' && busSpeech) busSpeech.gain.value = p.v;
        if (key === 'toneLevel'   && busTone)   busTone.gain.value   = p.v;
      });
      paramsEl.appendChild(row(p.name, inp, val));
    });
  });
}
buildParams();
