// ============================================================
// SYLLABABBLER v3 — ENGINE
// ============================================================

// Index keeps EVERY class a surface can play (v2 deduped by surface
// and lost alternatives — "a" could only ever be a prefix, etc.)
function buildIndex(M) {
  const all = [];
  for (const cls of ["prefixes", "roots", "suffixes"]) {
    for (const m of M[cls]) {
      const forms = [m.form, ...(m.variants || [])];
      for (const f of forms) {
        if (!f) continue;
        all.push({
          surface: f.toLowerCase().replace(/\d+$/, ""),
          canon: m.form.replace(/\d+$/, ""),
          cls, meaning: m.meaning, origin: m.origin, tags: m.tags || []
        });
      }
    }
  }
  const seen = new Set(), out = [];
  for (const e of all) {
    const k = e.surface + "|" + e.cls + "|" + e.meaning;
    if (seen.has(k)) continue;
    seen.add(k); out.push(e);
  }
  return out.sort((a, b) => b.surface.length - a.surface.length);
}

function byPrefixTable(INDEX) {
  const t = new Map();
  for (const e of INDEX) {
    const k = e.surface[0];
    if (!t.has(k)) t.set(k, []);
    t.get(k).push(e);
  }
  return t;
}

// ---------- SEGMENTATION ----------
// v2 maximized letters covered, which always preferred many tiny
// fragments (syl-l-ab-ab-ble-r). This scores whole coverings with a
// quadratic length reward, so a 3-morpheme parse beats a 7-piece one,
// and walks a phase machine (prefix* root+ suffix*) so morphemes land
// where they can actually occur.
const PHASE = { pre: 0, root: 1, suf: 2 };

function segScore(len, cls) {
  if (len >= 3) return len * len + (cls === "roots" ? 2 : 0);
  if (len === 2) return 1;
  return -3; // single-letter morphemes must earn their place
}
const UNKNOWN_PENALTY = -2.2;

function segment(word, INDEX, TABLE) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return [];
  const memo = new Map();

  function best(pos, phase) {
    if (pos >= word.length) {
      return { segs: [], score: phase === PHASE.pre ? -6 : 0 }; // no root found
    }
    const key = pos + ":" + phase;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, { segs: [], score: -1e9 }); // cycle guard

    let winner = null;
    const cands = TABLE.get(word[pos]) || [];
    for (const e of cands) {
      if (!word.startsWith(e.surface, pos)) continue;
      let next;
      // a prefix may also open a NEW stem mid-word (photo-syn-thesis),
      // which is why v2's flat scan lost the internal "syn"
      if (e.cls === "prefixes" && phase <= PHASE.root) next = PHASE.pre;
      else if (e.cls === "roots" && phase <= PHASE.root) next = PHASE.root;
      else if (e.cls === "suffixes" && phase >= PHASE.root) next = PHASE.suf;
      else continue;
      const rest = best(pos + e.surface.length, next);
      const s = segScore(e.surface.length, e.cls) + rest.score;
      if (!winner || s > winner.score) {
        winner = { segs: [{ ...e, matched: e.surface }, ...rest.segs], score: s };
      }
    }
    // skip a letter
    const restU = best(pos + 1, phase);
    const su = UNKNOWN_PENALTY + restU.score;
    if (!winner || su > winner.score) {
      winner = {
        segs: [{ cls: "unknown", matched: word[pos] }, ...restU.segs],
        score: su
      };
    }
    memo.set(key, winner);
    return winner;
  }

  const raw = best(0, PHASE.pre).segs;
  const merged = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    if (s.cls === "unknown" && last && last.cls === "unknown") last.matched += s.matched;
    else merged.push({ ...s });
  }
  return merged;
}

// ---------- GLOSS ----------
// v2 grabbed the last meaning as a head noun even when it was a
// prefix, which produced "A capable of concerning together, away
// from". Suffixes carry grammar; this reads it off the meaning text
// and builds an actual English definition around it.
function suffixGrammar(meaning) {
  const m = meaning.toLowerCase();
  if (/one who|voyager|agent|practices|dweller|inhabitant/.test(m)) return "agent";
  if (/place for/.test(m)) return "place";
  if (/instrument|device|measuring/.test(m)) return "instrument";
  if (/study of|writing about|art, science|doctrine|rule by|rule, gov/.test(m)) return "field";
  if (/to make|to become/.test(m)) return "verb";
  if (/full of|relating to|tending to|capable of|resembling|like|-ish/.test(m)) return "adj";
  if (/fear of/.test(m)) return "fear";
  if (/love of/.test(m)) return "love";
  return "noun";
}

const head = s => s.split(",")[0].trim();

// group prefixes onto the root they modify: hyper+photo → "excessive light"
function clusters(known) {
  const out = [];
  let pend = [];
  for (const s of known) {
    if (s.cls === "prefixes") { pend.push(head(s.meaning)); continue; }
    if (s.cls === "roots") { out.push([...pend, head(s.meaning)].join(" ")); pend = []; }
  }
  if (pend.length) out.push(pend.join(" "));
  return out;
}

function joinList(a) {
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  if (a.length === 2) return a[0] + " and " + a[1];
  return a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
}

function decode(word, INDEX, TABLE) {
  const segs = segment(word, INDEX, TABLE);
  const known = segs.filter(s => s.cls !== "unknown");
  const residue = segs.some(s => s.cls === "unknown");
  const tail = residue ? " Some letters unmatched." : "";

  // below half-coverage the parse is noise dressed as insight —
  // better to say so than to gloss three stray letters
  const letters = segs.reduce((n, s) => n + s.matched.length, 0);
  const cov = known.reduce((n, s) => n + s.matched.length, 0) / (letters || 1);
  if (known.length && cov < 0.5) {
    return { segs, coverage: cov, definition: "Too little matched to read. Fragments found: " +
      joinList(known.map(s => head(s.meaning))) + "." };
  }

  if (!known.length) {
    return { segs, coverage: 0, definition: "No morphemes recognized." };
  }

  const subject = joinList(clusters(known)) || head(known[0].meaning);
  const sufs = known.filter(s => s.cls === "suffixes");
  let def;

  if (!sufs.length) {
    def = `${cap(subject)}.`;
  } else {
    const last = sufs[sufs.length - 1];
    const g = suffixGrammar(last.meaning);
    if (g === "agent") def = `One who works in ${subject}.`;
    else if (g === "place") def = `A place given over to ${subject}.`;
    else if (g === "instrument") def = `An instrument for reading ${subject}.`;
    else if (g === "field") def = `The study of ${subject}.`;
    else if (g === "verb") def = `To bring about ${subject}.`;
    else if (g === "adj") def = `Marked by ${subject}.`;
    else if (g === "fear") def = `Dread of ${subject}.`;
    else if (g === "love") def = `An appetite for ${subject}.`;
    else def = `The ${head(last.meaning)} of ${subject}.`;
  }
  return { segs, coverage: cov, definition: def + tail };
}

// ---------- CONCEPTS ----------
const STOP = new Set(("the a an and or but of to in on at for with by from as is are was were be been being " +
  "this that these those it its we you they he she i our your their has have had will would can could do does " +
  "not no so if then than there here what which who when while all any some more most very just also").split(" "));

function extractConcepts(text) {
  const raw = text.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const freq = {}, first = {};
  raw.forEach((w, i) => {
    if (STOP.has(w) || w.length < 3) return;
    freq[w] = (freq[w] || 0) + 1;
    if (!(w in first)) first[w] = i;
  });
  // in a short phrase every word occurs once, so frequency alone is
  // no signal — weight length (content words are longer) and order.
  return Object.keys(freq).sort((a, b) => {
    const sa = freq[a] * 3 + Math.min(a.length, 9) / 3 - first[a] / 40;
    const sb = freq[b] * 3 + Math.min(b.length, 9) / 3 - first[b] / 40;
    return sb - sa;
  });
}

// v2 scored a tag hit if any tag-word merely STARTED with the first
// four letters of the concept — so "worst" matched theo's "worship"
// tag and every text came out with -the- in it. Now: exact, then
// contained-whole-word, then a long shared prefix, with a floor.
// a set of plausible stems rather than one guess — a single regex
// turned "times" into "tim" and missed the tag "time" entirely
function stems(w) {
  const out = new Set([w]);
  const cut = (suf, add = "") => { if (w.length > suf.length + 2 && w.endsWith(suf)) out.add(w.slice(0, -suf.length) + add); };
  cut("s"); cut("es"); cut("s", "e"); cut("ies", "y"); cut("ied", "y");
  cut("ing"); cut("ing", "e"); cut("ed"); cut("ed", "e"); cut("er"); cut("ers"); cut("ly"); cut("al");
  return out;
}
function overlap(a, b) { for (const x of a) if (b.has(x)) return true; return false; }

function morphemesForConcept(concept, INDEX, role) {
  const c = concept.toLowerCase();
  const cs = stems(c);
  const scored = [];
  for (const e of INDEX) {
    if (role && e.cls !== role) continue;
    let score = 0;
    for (const t of e.tags) {
      const tw = t.split(/[\s-]+/);
      if (t === c) score += 6;
      else if (tw.includes(c)) score += 4;
      else if (c.length >= 4 && tw.some(x => overlap(stems(x), cs))) score += 3.5;
      else if (c.length >= 6 && t.length >= 6 && (t.startsWith(c.slice(0, 5)) || c.startsWith(t.slice(0, 5)))) score += 2;
    }
    // last resort: the concept appears in the morpheme's own gloss
    if (score === 0 && c.length >= 4 && e.meaning.split(/[,\s]+/).some(x => overlap(stems(x), cs))) score += 3;
    if (e.canon === c) score += 3;
    if (score >= 2) {
      score += e.surface.length >= 3 ? 1 : -1;
      if (e.surface === e.canon) score += 1.5; // prefer the full form over a clipped variant
      scored.push({ entry: e, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.entry.surface.length - a.entry.surface.length);
  // one entry per meaning
  const seen = new Set(), out = [];
  for (const s of scored) {
    if (seen.has(s.entry.meaning)) continue;
    seen.add(s.entry.meaning); out.push(s.entry);
  }
  return out;
}

// ---------- JOIN ----------
const LINKING = { gk: "o", la: "i" };

function applyContraction(s) {
  return s
    .replace(/([aeiou])\1+/g, "$1")
    .replace(/([bcdfghjklmnpqrstvwxyz])\1{2,}/g, "$1$1")
    .replace(/oo+/g, "o")
    .replace(/(.)\1\1+/g, "$1$1");
}

// returns the word plus the span each morpheme occupies, so the
// letters can be stained by stratum in the UI
function joinMorphemes(entries) {
  let out = "";
  const spans = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    let piece = e.surface;
    let link = "";
    if (i > 0) {
      const prev = out[out.length - 1];
      const prevV = "aeiou".includes(prev);
      const curV = "aeiou".includes(piece[0]);
      if (!prevV && !curV) link = LINKING[e.origin] || "o";
      else if (prevV && curV) out = out.slice(0, -1), spans[spans.length - 1].end -= 1;
    }
    const start = out.length + link.length;
    out += link + piece;
    spans.push({ start, end: out.length, entry: e });
  }
  const before = out;
  const after = applyContraction(out);
  if (after !== before) { // contraction shifted things; fall back to proportional spans
    const r = after.length / before.length;
    spans.forEach(s => { s.start = Math.round(s.start * r); s.end = Math.round(s.end * r); });
  }
  return { word: after, spans };
}

// ---------- MODES ----------
function compress(text, INDEX) {
  const concepts = extractConcepts(text);
  const chain = [];
  const usedSurface = new Set(), usedMeaning = new Set();
  for (const c of concepts) {
    if (chain.length >= 4) break;
    const pool = morphemesForConcept(c, INDEX, null)
      .filter(e => e.cls !== "suffixes" || chain.length >= 2)
      .filter(e => !usedSurface.has(e.surface) && !usedMeaning.has(e.meaning));
    if (!pool.length) continue;
    const pick = pool[0];
    usedSurface.add(pick.surface); usedMeaning.add(pick.meaning);
    chain.push({ concept: c, ...pick });
  }
  if (!chain.length) return { word: "", spans: [], chain: [], concepts, missed: concepts.slice(0, 6) };
  chain.sort((a, b) => (a.cls === "prefixes" ? 0 : a.cls === "roots" ? 1 : 2) - (b.cls === "prefixes" ? 0 : b.cls === "roots" ? 1 : 2));
  const { word, spans } = joinMorphemes(chain);
  const matched = new Set(chain.map(c => c.concept));
  return { word: cap(word), spans, chain, concepts, missed: concepts.filter(c => !matched.has(c)).slice(0, 6) };
}

function generateNames(seed, INDEX, n = 8) {
  const concepts = extractConcepts(seed);
  const lead = concepts[0] || seed.toLowerCase().trim();
  const second = concepts[1] || null;
  const out = [], seen = new Set();

  const leadRoots = morphemesForConcept(lead, INDEX, "roots").slice(0, 6);
  const leadPre = morphemesForConcept(lead, INDEX, "prefixes").slice(0, 5);
  const secondRoots = second ? morphemesForConcept(second, INDEX, "roots").slice(0, 5) : [];
  const secondPre = second ? morphemesForConcept(second, INDEX, "prefixes").slice(0, 3) : [];
  const suffixes = INDEX.filter(e => e.cls === "suffixes" && e.surface === e.canon);

  function add(parts) {
    const clean = parts.filter(Boolean);
    if (clean.length < 2) return;
    const { word, spans } = joinMorphemes(clean);
    const w = cap(word);
    if (w.length < 5 || w.length > 17 || seen.has(w.toLowerCase())) return;
    seen.add(w.toLowerCase());
    out.push({ name: w, spans, parts: clean, gloss: clean.map(p => head(p.meaning)).join(" · ") });
  }

  for (const pre of leadPre) for (const r of (secondRoots.length ? secondRoots : leadRoots)) add([pre, r]);
  for (const r of leadRoots) for (const suf of sample(suffixes, 4)) add([r, suf]);
  for (const r of leadRoots) for (const r2 of secondRoots) add([r, r2]);
  for (const r of secondRoots) for (const r2 of leadRoots) add([r, r2]);
  for (const pre of sample(secondPre.concat(leadPre), 2)) for (const r of leadRoots) for (const suf of sample(suffixes, 2)) add([pre, r, suf]);
  for (const r of leadRoots) for (const r2 of secondRoots) for (const suf of sample(suffixes, 2)) add([r, r2, suf]);

  // a narrow seed (one matching root) was returning three or four
  // candidates — widen the suffix sweep rather than hand back a stub
  if (out.length < n) {
    for (const r of leadRoots.concat(secondRoots)) for (const suf of suffixes) { if (out.length >= n * 3) break; add([r, suf]); }
  }
  if (out.length < n) {
    for (const pre of leadPre.concat(secondPre)) for (const r of leadRoots.concat(secondRoots)) for (const suf of sample(suffixes, 3)) add([pre, r, suf]);
  }

  return shuffle(out).slice(0, n);
}

function discover(INDEX, n = 1) {
  const pre = INDEX.filter(e => e.cls === "prefixes" && e.surface === e.canon);
  const roots = INDEX.filter(e => e.cls === "roots" && e.surface === e.canon);
  const suf = INDEX.filter(e => e.cls === "suffixes" && e.surface === e.canon);
  const res = [];
  let guard = 0;
  while (res.length < n && guard++ < n * 40) {
    const parts = [];
    if (Math.random() < 0.55) parts.push(pick(pre));
    parts.push(pick(roots));
    if (Math.random() < 0.45) parts.push(pick(roots));
    if (Math.random() < 0.7) parts.push(pick(suf));
    if (parts.length < 2) continue;
    const { word, spans } = joinMorphemes(parts);
    if (word.length < 6 || word.length > 20) continue;
    if (res.some(r => r.word.toLowerCase() === word)) continue;
    res.push({ word: cap(word), spans, parts, gloss: parts.map(p => head(p.meaning)).join(" · ") });
  }
  return res;
}

// ---------- utils ----------
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function sample(a, k) { return shuffle([...a]).slice(0, k); }
function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

// ============================================================
// UI
// ============================================================
const INDEX = buildIndex(MORPHEMES);
const TABLE = byPrefixTable(INDEX);

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const stainOf = e => e && e.cls !== "unknown" ? (e.origin === "gk" ? "gk" : "la") : "un";

// stain a built word letter by letter, using the spans the joiner returned
function stainWord(word, spans, animate) {
  const at = i => spans.find(s => i >= s.start && i < s.end);
  let html = "", n = 0;
  for (let i = 0; i < word.length; i++) {
    const s = at(i);
    const cls = s ? stainOf(s.entry) : "un";
    const d = animate ? ` style="animation-delay:${(n++ * 26)}ms"` : ' style="opacity:1;animation:none"';
    html += `<span class="${cls}"${d}>${esc(word[i])}</span>`;
  }
  return html;
}

// stain a decoded word using its segmentation
function stainSegs(segs, animate) {
  let html = "", n = 0;
  for (const s of segs) {
    const cls = stainOf(s);
    for (const ch of s.matched) {
      const d = animate ? ` style="animation-delay:${(n++ * 26)}ms"` : ' style="opacity:1;animation:none"';
      html += `<span class="${cls}"${d}>${esc(ch)}</span>`;
    }
  }
  return html;
}

const CLSNAME = { prefixes: "prefix", roots: "root", suffixes: "suffix" };

function partsList(entries) {
  return `<div class="parts">` + entries.map(e => {
    if (e.cls === "unknown") return `<div class="part"><b class="un">${esc(e.matched)}</b><i class="un">unparsed</i></div>`;
    const stain = stainOf(e);
    return `<div class="part"><b class="${stain}">${esc(e.matched || e.surface)}</b><i>${esc(e.meaning)}</i>` +
      `<em>${e.origin === "gk" ? "greek" : "latin"} ${CLSNAME[e.cls]}</em></div>`;
  }).join("") + `</div>`;
}

// masthead: the tool parses its own name on load
(function selfParse() {
  const segs = segment("syllababbler", INDEX, TABLE);
  $("mast").innerHTML = stainSegs(segs, false);
  const known = segs.filter(s => s.cls !== "unknown");
  $("selfparse").innerHTML =
    known.map(s => `<span class="${stainOf(s)}">${esc(s.matched)}</span> ${esc(s.meaning.split(",")[0])}`).join(" &middot; ") +
    ". Greek is blue, Latin rose, unmatched letters grey.";
})();

// ---------- state ----------
const KEY = "syllababbler.kept.v3";
let kept = [];
try { kept = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { kept = []; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch (e) { } }

function keep(word, gloss) {
  if (kept.some(k => k.word === word)) return;
  kept.unshift({ word, gloss });
  kept = kept.slice(0, 60);
  persist(); renderKept();
}
function renderKept() {
  $("keptWrap").hidden = kept.length === 0;
  $("kept").innerHTML = kept.map((k, i) =>
    `<div class="row">${esc(k.word)} <span>${esc(k.gloss)}</span><button class="drop" data-i="${i}" aria-label="Remove ${esc(k.word)}">drop</button></div>`
  ).join("");
}
$("kept").addEventListener("click", e => {
  const b = e.target.closest(".drop"); if (!b) return;
  kept.splice(+b.dataset.i, 1); persist(); renderKept();
});

// ---------- modes ----------
const DESCS = {
  compress: "Enter a phrase. Returns one word built from the concepts in it.",
  name: "Enter one or two concepts. Returns eight candidate names with their morpheme glosses.",
  decode: "Enter any word, real or invented. Returns its morphemes and a definition read off them.",
  discover: "No input. Returns six random morpheme combinations."
};

let mode = "compress";

$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  mode = b.dataset.mode;
  [...$("tabs").children].forEach(c => c.setAttribute("aria-selected", String(c === b)));
  render();
});

function render() {
  $("desc").textContent = DESCS[mode];
  $("out").innerHTML = "";
  const A = $("inputArea");
  if (mode === "compress") A.innerHTML =
    `<textarea id="in" placeholder="all language is sacrament"></textarea>
     <button class="go" id="run">compress &rarr;</button>
     <p class="hint">A sentence or a fragment. Concepts are ranked by weight, not order.</p>`;
  else if (mode === "name") A.innerHTML =
    `<input type="text" id="in" placeholder="tide, percussion">
     <button class="go" id="run">generate &rarr;</button>
     <p class="hint">Run again for a different batch.</p>`;
  else if (mode === "decode") A.innerHTML =
    `<input type="text" id="in" placeholder="necropolis">
     <button class="go" id="run">decode &rarr;</button>
     <p class="hint">Real words work too.</p>`;
  else A.innerHTML =
    `<button class="go" id="run">roll &rarr;</button>
     <p class="hint">Tap any to keep it.</p>`;

  $("run").addEventListener("click", run);
  const inp = $("in");
  if (inp) inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && (inp.tagName === "INPUT" || e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  });
}

function empty(msg) { $("out").innerHTML = `<p class="def un">${esc(msg)}</p>`; }

function run() {
  const inp = $("in");
  const val = inp ? inp.value.trim() : "";
  if (inp && !val) { inp.focus(); return; }
  const O = $("out");

  if (mode === "compress") {
    const r = compress(val, INDEX);
    if (!r.word) return empty("No morphemes matched. The roots are Greek and Latin — concrete nouns work best.");
    O.innerHTML =
      `<div class="word">${stainWord(r.word, r.spans, true)}</div>` +
      `<p class="def">${esc(r.chain.map(c => c.concept).join(" · "))}</p>` +
      partsList(r.chain) +
      (r.missed.length ? `<p class="meta">no morpheme for: ${esc(r.missed.join(", "))}</p>` : "") +
      `<button class="go" id="keepBtn">keep it &rarr;</button>`;
    $("keepBtn").addEventListener("click", () => keep(r.word, r.chain.map(c => c.meaning.split(",")[0]).join(" · ")));
  }

  else if (mode === "name") {
    const list = generateNames(val, INDEX, 8);
    if (!list.length) return empty("No morphemes matched. Try a plainer synonym.");
    O.innerHTML = list.map((n, i) =>
      `<div class="cand" data-i="${i}" role="button" tabindex="0">
         <div class="n">${stainWord(n.name, n.spans, false)}</div>
         <div class="g">${esc(n.gloss)}</div>
       </div>`).join("") +
      `<p class="meta">tap to keep</p>`;
    O.querySelectorAll(".cand").forEach(el => {
      const pickIt = () => { const n = list[+el.dataset.i]; keep(n.name, n.gloss); el.querySelector(".g").textContent = n.gloss + " — kept"; };
      el.addEventListener("click", pickIt);
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickIt(); } });
    });
  }

  else if (mode === "decode") {
    const d = decode(val, INDEX, TABLE);
    O.innerHTML =
      `<div class="word">${stainSegs(d.segs, true)}</div>` +
      `<p class="def">${esc(d.definition)}</p>` +
      partsList(d.segs) +
      `<p class="meta">${Math.round((d.coverage || 0) * 100)}% of the letters accounted for</p>`;
  }

  else {
    const list = discover(INDEX, 6);
    O.innerHTML = list.map((n, i) =>
      `<div class="cand" data-i="${i}" role="button" tabindex="0">
         <div class="n">${stainWord(n.word, n.spans, false)}</div>
         <div class="g">${esc(n.gloss)}</div>
       </div>`).join("") +
      `<p class="meta">tap to keep</p>`;
    O.querySelectorAll(".cand").forEach(el => {
      const pickIt = () => { const n = list[+el.dataset.i]; keep(n.word, n.gloss); el.querySelector(".g").textContent = n.gloss + " — kept"; };
      el.addEventListener("click", pickIt);
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickIt(); } });
    });
  }
}

$("counts").textContent =
  MORPHEMES.prefixes.length + " prefixes · " + MORPHEMES.roots.length + " roots · " +
  MORPHEMES.suffixes.length + " suffixes · " + INDEX.length + " surface forms";

render();
renderKept();
