/* ============================================================
   LANGUAGE INSTRUMENT
   Three simultaneous readings of the same keystroke:
     SPEECH  — the letter as a vocal gesture (formants, articulation)
     TONE    — the letter as a pitch (mapping + scale)
     COUPLE  — the letter bent by its neighbours (mutual FM)
   plus PULSE (typing rhythm) and SPACE (keyboard geography).
============================================================ */

/* ---------------- linguistic tables ---------------- */

const VOWELS = 'aeiouy';

const VOWEL_FORMANTS = {
  a:{f1:730,f2:1090}, e:{f1:530,f2:1840}, i:{f1:270,f2:2290},
  o:{f1:570,f2:840},  u:{f1:300,f2:870},  y:{f1:440,f2:1900}
};

const ARTIC = {
  plosive:   'ptkbdg',
  fricative: 'fvszh',
  affricate: 'cjx',
  nasal:     'mn',
  liquid:    'lr',
  glide:     'wq'
};

function articOf(ch){
  for (const k in ARTIC) if (ARTIC[k].includes(ch)) return k;
  return 'fricative';
}
const isVowel = ch => VOWELS.includes(ch);

// English letter frequency order, most common first
const FREQ_ORDER = 'etaoinshrdlcumwfgypbvkjxqz';

const ROWS = ['qwertyuiop','asdfghjkl','zxcvbnm'];

function keyPos(ch){
  for (let r=0; r<ROWS.length; r++){
    const c = ROWS[r].indexOf(ch);
    if (c >= 0) return { x:(c + r*0.4) / 10, y:r/2 };
  }
  return { x:0.5, y:0.5 };
}

// distance between two keys on the physical board, 0..1
function keyDistance(a,b){
  const p = keyPos(a), q = keyPos(b);
  return Math.min(1, Math.hypot(p.x-q.x, (p.y-q.y)*0.6) * 1.25);
}

/* ---------------- pitch mappings ---------------- */

const MAPPINGS = {
  phonetic: ch => {
    if (isVowel(ch)) return 7 + VOWELS.indexOf(ch) * 2;
    const order = ['plosive','affricate','fricative','nasal','liquid','glide'];
    const g = articOf(ch);
    return order.indexOf(g) * 3 + (ARTIC[g].indexOf(ch) + 1);
  },
  frequency: ch => {
    const i = FREQ_ORDER.indexOf(ch);
    return i < 0 ? 0 : [0,7,4,12,9,2,16,5,11,19,3,14,21,8,23,10,1,17,6,13,24,15,22,18,20,26][i];
  },
  split: ch => isVowel(ch) ? 12 + VOWELS.indexOf(ch)*2 : (ch.charCodeAt(0)-97) % 12,
  chromatic: ch => (ch.charCodeAt(0) - 97),
  qwerty: ch => { const p = keyPos(ch); return Math.round((1-p.y)*12 + p.x*12); },
  ascii: ch => (ch.charCodeAt(0) - 97) % 24
};

const SCALES = {
  free:      null,
  pentatonic:[0,2,4,7,9],
  dorian:    [0,2,3,5,7,9,10],
  wholetone: [0,2,4,6,8,10],
  fifths:    [0,7,2,9,4]
};

function quantize(semi, scaleName){
  const s = SCALES[scaleName];
  if (!s) return semi;
  const oct = Math.floor(semi/12), deg = ((semi%12)+12)%12;
  let best = s[0], gap = 99;
  for (const n of s){ const d = Math.abs(n-deg); if (d < gap){ gap = d; best = n; } }
  return oct*12 + best;
}

/* ---------------- state ---------------- */

const LAYERS = {
  speech: { label:'Speech', on:true,  color:'var(--speech)' },
  tone:   { label:'Tone',   on:true,  color:'var(--tone)'   },
  couple: { label:'Couple', on:true,  color:'var(--couple)' },
  pulse:  { label:'Pulse',  on:false, color:'var(--pulse)'  },
  space:  { label:'Space',  on:true,  color:'var(--space)'  }
};

const P = {
  master:   { v:0.55, min:0,   max:1,   step:0.01, name:'Volume',        group:null   },
  speechLevel:{v:0.8, min:0,   max:1,   step:0.01, name:'Level',         group:'speech' },
  voicePitch:{v:150,  min:80,  max:300, step:1,    name:'Voice pitch',   group:'speech', unit:'Hz' },
  vowelLen: { v:0.30, min:0.08,max:0.9, step:0.01, name:'Vowel length',  group:'speech', unit:'s' },
  bite:     { v:0.55, min:0,   max:1,   step:0.01, name:'Consonant bite',group:'speech' },
  toneLevel:{ v:0.9,  min:0,   max:1,   step:0.01, name:'Level',         group:'tone' },
  spread:   { v:2.6,  min:0.5, max:5,   step:0.1,  name:'Register spread',group:'tone', unit:'oct' },
  grain:    { v:1,    min:1,   max:5,   step:1,    name:'Grains / letter',group:'tone' },
  spray:    { v:0.4,  min:0,   max:1,   step:0.01, name:'Grain spray',    group:'tone' },
  scatter:  { v:0.85, min:0,   max:1,   step:0.01, name:'Visual scatter', group:'tone' },
  root:     { v:294,  min:80,  max:660, step:1,    name:'Root',          group:'tone', unit:'Hz' },
  octave:   { v:0,    min:-2,  max:2,   step:1,    name:'Register',      group:'tone', unit:'oct' },
  air:      { v:0.22, min:0,   max:1,   step:0.01, name:'Air (top partial)', group:'tone' },
  sustain:  { v:1.1,  min:0.15,max:5,   step:0.05, name:'Sustain',       group:'tone', unit:'s' },
  depth:    { v:0.45, min:0,   max:1,   step:0.01, name:'Coupling depth',group:'couple' },
  reach:    { v:3,    min:1,   max:6,   step:1,    name:'Reach (letters)',group:'couple' },
  nearBias: { v:0.6,  min:-1,  max:1,   step:0.01, name:'Near/far bias', group:'couple' },
  mutual:   { v:0.7,  min:0,   max:1,   step:0.01, name:'Mutual return', group:'couple' },
  swing:    { v:0.6,  min:0,   max:1,   step:0.01, name:'Rhythm depth',  group:'pulse' },
  width:    { v:0.85, min:0,   max:1,   step:0.01, name:'Stereo width',  group:'space' }
};

const SEL = {
  mapping: { v:'phonetic', name:'Mapping', group:'tone', opts:{
    phonetic:'Phonetic clusters', frequency:'Letter frequency', split:'Vowel / consonant',
    chromatic:'Chromatic', qwerty:'Keyboard geography', ascii:'ASCII',
    cipher:'Beep cipher (decodable)' } },
  scale:   { v:'pentatonic', name:'Scale', group:'tone', opts:{
    free:'Free (no scale)', pentatonic:'Pentatonic', dorian:'Dorian',
    wholetone:'Whole tone', fifths:'Stacked fifths' } },
  timbre:  { v:'reed', name:'Timbre', group:'tone', opts:{
    reed:'Reed', glass:'Glass', pluck:'Pluck', choir:'Choir',
    wood:'Wood', hollow:'Hollow', code:'Code-aware' } }
};

/* ---------------- audio ---------------- */
