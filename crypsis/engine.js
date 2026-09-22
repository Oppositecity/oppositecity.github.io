// CRYPSIS engine — runs in a module worker.
// Rank steganography after Norelli & Bronstein, "LLMs can hide text in other text of the same length"
// (arXiv 2510.20075, the Calgacus protocol), extended with a bytes mode for arbitrary files.
//
// Every model call goes through model.generate() with a logits processor that forces the next
// token. Hiding and revealing therefore run the exact same computation (same prefill, same
// incremental KV steps), which is what makes the ranks reproducible on the other side.

export const TJ_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// ───────────────────────── ordering ─────────────────────────
// Order = logit descending, ties broken by lower token id. Both sides must agree exactly.

export function better(d, a, b) {
  return d[a] > d[b] || (d[a] === d[b] && a < b);
}

export function rawRank(d, t) {
  const v = d[t];
  let r = 0;
  for (let j = 0; j < d.length; j++) {
    const x = d[j];
    if (x > v || (x === v && j < t)) r++;
  }
  return r;
}

// indices strictly ahead of t in the order
function ahead(d, t) {
  const v = d[t], out = [];
  for (let j = 0; j < d.length; j++) {
    const x = d[j];
    if (x > v || (x === v && j < t)) out.push(j);
  }
  return out;
}

// top-k indices in order (k small), by insertion into a sorted buffer
function topK(d, k) {
  const idx = [];
  for (let j = 0; j < d.length; j++) {
    const n = idx.length;
    if (n === k && !better(d, j, idx[n - 1])) continue;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (better(d, idx[m], j)) lo = m + 1; else hi = m; }
    idx.splice(lo, 0, j);
    if (idx.length > k) idx.pop();
  }
  return idx;
}

function fullOrder(d) {
  const idx = new Uint32Array(d.length);
  for (let j = 0; j < d.length; j++) idx[j] = j;
  idx.sort((a, b) => (d[b] - d[a]) || (a - b));
  return idx;
}

// the r-th (0-based) token in order that passes ok(); null if none
export function pickRank(d, r, ok) {
  if (!ok) {
    if (r < 256) return topK(d, r + 1)[r];
    return fullOrder(d)[r];
  }
  if (r < 64) {
    const cand = topK(d, Math.min(d.length, (r + 1) * 4 + 64));
    let c = 0;
    for (const j of cand) if (ok(j)) { if (c === r) return j; c++; }
  }
  const ord = fullOrder(d);
  let c = 0;
  for (const j of ord) if (ok(j)) { if (c === r) return j; c++; }
  return null;
}

// rank of t among tokens passing ok()
export function filteredRank(d, t, ok) {
  let r = 0;
  for (const j of ahead(d, t)) if (ok(j)) r++;
  return r;
}

// ───────────────────────── cover-side token filter ─────────────────────────
// A cover must survive being copied as plain text and re-tokenized, so each cover token must
// keep the running cover canonical. Decisions depend only on the prefix, so revealing makes
// the identical decisions and ranks agree.

export function makeFilter(tok) {
  const cache = new Int8Array(tok.vocabSize + 8); // 0 unknown, 1 ok, 2 bad
  const piece = new Map();
  const special = new Set(tok.specialIds);
  function text(j) {
    let s = piece.get(j);
    if (s === undefined) { s = tok.decode([j]); piece.set(j, s); }
    return s;
  }
  function staticOk(j) {
    if (j >= tok.vocabSize) return false;
    let c = cache[j];
    if (c === 0) {
      const s = text(j);
      c = (!special.has(j) && s.length > 0 && !s.includes('\uFFFD') && !s.includes('\r')) ? 1 : 2;
      cache[j] = c;
    }
    return c === 1;
  }
  return function okFor(prefix, isFirst, isLast) {
    const tail = prefix.slice(-8);
    return (j) => {
      if (!staticOk(j)) return false;
      const s = text(j);
      if (isFirst && /^\s/.test(s)) return false;
      if (isLast && /\s$/.test(s)) return false;
      const seq = tail.concat(j);
      const re = tok.encode(tok.decode(seq));
      if (re.length !== seq.length) return false;
      for (let i = 0; i < seq.length; i++) if (re[i] !== seq[i]) return false;
      return true;
    };
  };
}

// ───────────────────────── forced-generation driver ─────────────────────────
// step(i, d, prefixIds) returns the token id to force at step i.

export async function drive(model, promptIds, n, step, T) {
  const gen = [];
  let i = 0;
  const proc = (input_ids, logits) => {
    const d = logits.data;
    const t = step(i, d, gen);
    if (t === null || t === undefined || t < 0 || t >= d.length) throw new Error('no token at step ' + i);
    d.fill(-Infinity);
    d[t] = 0;
    gen.push(t);
    i++;
    return logits;
  };
  if (n === 0) return gen;
  const ids = BigInt64Array.from(promptIds.map(BigInt));
  const input_ids = new T.Tensor('int64', ids, [1, ids.length]);
  const attention_mask = new T.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]);
  await model.generate({
    input_ids, attention_mask,
    max_new_tokens: n, min_new_tokens: null, min_length: 0,
    do_sample: false, repetition_penalty: 1.0, no_repeat_ngram_size: 0,
    logits_processor: [proc],
  });
  if (gen.length !== n) throw new Error('generation stopped at ' + gen.length + ' of ' + n);
  return gen;
}

// ───────────────────────── bytes ↔ ranks (canonical Huffman over a Zipf prior) ─────────────────────────
// Arbitrary bits are parsed as a Huffman stream whose symbol probabilities imitate the rank
// statistics of real prose, so a file comes out looking like text-derived ranks.

export const ALPHA = 64;

export function huffman() {
  const p = [];
  for (let r = 0; r < ALPHA; r++) p.push(1 / Math.pow(r + 1, 1.25));
  // code lengths, deterministic tie-breaks
  let nodes = p.map((w, s) => ({ w, syms: [s], id: s }));
  const len = new Array(ALPHA).fill(0);
  let nid = ALPHA;
  while (nodes.length > 1) {
    nodes.sort((a, b) => (a.w - b.w) || (a.id - b.id));
    const [a, b] = nodes.splice(0, 2);
    for (const s of a.syms) len[s]++;
    for (const s of b.syms) len[s]++;
    nodes.push({ w: a.w + b.w, syms: a.syms.concat(b.syms), id: nid++ });
  }
  // canonical codes by (length, symbol)
  const order = [...Array(ALPHA).keys()].sort((a, b) => (len[a] - len[b]) || (a - b));
  const code = new Array(ALPHA);
  let c = 0, prev = len[order[0]];
  for (let k = 0; k < order.length; k++) {
    const s = order[k];
    if (k > 0) { c = (c + 1) << (len[s] - prev); prev = len[s]; }
    code[s] = c;
  }
  const lookup = new Map(); // "len:code" -> symbol
  for (let s = 0; s < ALPHA; s++) lookup.set(len[s] + ':' + code[s], s);
  const mean = p.reduce((a, w, s) => a + w * len[s], 0) / p.reduce((a, w) => a + w, 0);
  return { len, code, lookup, meanBits: mean, maxLen: Math.max(...len) };
}

export function bytesToRanks(bytes, H) {
  const ranks = [];
  const totalBits = bytes.length * 8;
  let acc = 0, l = 0, bit = 0;
  while (bit < totalBits || l > 0) {
    const b = bit < totalBits ? (bytes[bit >> 3] >> (7 - (bit & 7))) & 1 : 0;
    bit++;
    acc = (acc << 1) | b; l++;
    const s = H.lookup.get(l + ':' + acc);
    if (s !== undefined) { ranks.push(s); acc = 0; l = 0; if (bit >= totalBits) break; }
    if (l > H.maxLen) throw new Error('huffman parse failed');
  }
  return ranks;
}

export function ranksToBytes(ranks, H) {
  const bits = [];
  for (const r of ranks) {
    if (r < 0 || r >= ALPHA) throw new Error('rank out of alphabet');
    for (let k = H.len[r] - 1; k >= 0; k--) bits.push((H.code[r] >> k) & 1);
  }
  const out = new Uint8Array(bits.length >> 3);
  for (let i = 0; i < out.length * 8; i++) out[i >> 3] |= bits[i] << (7 - (i & 7));
  return out;
}

// ───────────────────────── payload framing for bytes mode ─────────────────────────
// [flags][len:3][nameLen:1][name][mimeLen:1][mime][data]   flags: 1 = file, 0x80 = deflated

const te = new TextEncoder(), td = new TextDecoder();

async function pump(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function frame({ data, name = '', mime = '', isFile = false }) {
  let flags = isFile ? 1 : 0, body = data;
  if (typeof CompressionStream !== 'undefined') {
    const z = await pump(data, new CompressionStream('deflate-raw'));
    if (z.length < data.length) { body = z; flags |= 0x80; }
  }
  const n = te.encode(name).slice(0, 255), m = te.encode(mime).slice(0, 255);
  if (body.length > 0xffffff) throw new Error('too large');
  const out = new Uint8Array(4 + 1 + n.length + 1 + m.length + body.length);
  let o = 0;
  out[o++] = flags;
  out[o++] = body.length >> 16; out[o++] = (body.length >> 8) & 255; out[o++] = body.length & 255;
  out[o++] = n.length; out.set(n, o); o += n.length;
  out[o++] = m.length; out.set(m, o); o += m.length;
  out.set(body, o);
  return out;
}

export async function unframe(buf) {
  if (buf.length < 6) throw new Error('short');
  let o = 0;
  const flags = buf[o++];
  if (flags & 0x7e) throw new Error('bad flags');
  const len = (buf[o++] << 16) | (buf[o++] << 8) | buf[o++];
  const nl = buf[o++]; const name = td.decode(buf.slice(o, o + nl)); o += nl;
  const ml = buf[o++]; const mime = td.decode(buf.slice(o, o + ml)); o += ml;
  if (o + len > buf.length) throw new Error('truncated');
  let data = buf.slice(o, o + len);
  if (flags & 0x80) data = await pump(data, new DecompressionStream('deflate-raw'));
  return { isFile: !!(flags & 1), name, mime, data };
}

// ───────────────────────── protocol ─────────────────────────
// mode 'w' (language, Calgacus): cover has the same token length as the secret.
// mode 'b' (bytes): any bytes, via the Huffman parse above.

export async function hide(ctx, { mode, keyText, contextText, reverse, secretText, secretBytes, name, mime, isFile }, emit) {
  const { tok, model, T, okFor, H } = ctx;
  const kIds = tok.encode(keyText);
  if (!kIds.length) throw new Error('The key needs at least one word.');
  let ranks, secretIds = null;
  if (mode === 'w') {
    secretIds = tok.encode(secretText);
    const cIds = tok.encode(contextText);
    ranks = new Array(secretIds.length);
    await drive(model, cIds, secretIds.length, (i, d) => {
      ranks[i] = rawRank(d, secretIds[i]);
      emit({ type: 'progress', phase: 'reading', i: i + 1, n: secretIds.length, piece: tok.decode([secretIds[i]]) });
      return secretIds[i];
    }, T);
    if (reverse) ranks.reverse();
  } else {
    const framed = await frame({ data: secretBytes, name, mime, isFile });
    ranks = bytesToRanks(framed, H);
  }
  const n = ranks.length;
  const coverIds = await drive(model, kIds, n, (i, d, prefix) => {
    const t = pickRank(d, ranks[i], okFor(prefix, i === 0, i === n - 1));
    if (t === null) throw new Error('unlikely');
    emit({ type: 'progress', phase: 'writing', i: i + 1, n, piece: tok.decode([t]) });
    return t;
  }, T);
  const cover = tok.decode(coverIds);
  const re = tok.encode(cover);
  const canonical = re.length === coverIds.length && re.every((x, i) => x === coverIds[i]);
  // seam: cover token ↔ what it carries
  const seam = coverIds.map((id, i) => {
    const r = ranks[i];
    let carries;
    if (mode === 'w') carries = tok.decode([secretIds[reverse ? n - 1 - i : i]]);
    else { let s = ''; for (let k = H.len[r] - 1; k >= 0; k--) s += (H.code[r] >> k) & 1; carries = s; }
    return { cover: tok.decode([id]), carries, rank: r };
  });
  return { cover, canonical, tokens: n, seam };
}

export async function reveal(ctx, { mode, keyText, contextText, reverse, coverText }, emit) {
  const { tok, model, T, okFor, H } = ctx;
  const kIds = tok.encode(keyText);
  const coverIds = tok.encode(coverText);
  const n = coverIds.length;
  let ranks = new Array(n);
  await drive(model, kIds, n, (i, d, prefix) => {
    const t = coverIds[i];
    const ok = okFor(prefix, i === 0, i === n - 1);
    if (!ok(t)) throw new Error('altered');
    ranks[i] = filteredRank(d, t, ok);
    emit({ type: 'progress', phase: 'reading', i: i + 1, n, piece: tok.decode([t]) });
    return t;
  }, T);
  if (mode === 'w') {
    if (reverse) ranks = ranks.slice().reverse();
    const cIds = tok.encode(contextText);
    const outIds = await drive(model, cIds, n, (i, d) => {
      const t = pickRank(d, ranks[i], null);
      emit({ type: 'progress', phase: 'writing', i: i + 1, n, piece: tok.decode([t]) });
      return t;
    }, T);
    return { kind: 'text', text: tok.decode(outIds) };
  }
  if (ranks.some(r => r >= ALPHA)) throw new Error('mismatch');
  const got = await unframe(ranksToBytes(ranks, H));
  return { kind: got.isFile ? 'file' : 'text', ...got, text: got.isFile ? null : td.decode(got.data) };
}

// ───────────────────────── worker glue ─────────────────────────

const IN_WORKER = typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined';

if (IN_WORKER) {
  let ctx = null, cancel = false;
  const post = (m) => self.postMessage(m);
  const emit = (m) => { if (cancel) throw new Error('cancelled'); post(m); };

  async function load(modelId, prefer) {
    const T = await import(TJ_URL);
    T.env.allowLocalModels = false;
    T.env.backends.onnx.wasm.numThreads = 1; // deterministic, and phones survive it
    const files = new Map();
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        files.set(p.file, [p.loaded, p.total]);
        let a = 0, b = 0; for (const [x, y] of files.values()) { a += x; b += y; }
        post({ type: 'loading', loaded: a, total: b });
      }
    };
    const tk = await T.AutoTokenizer.from_pretrained(modelId, { progress_callback });
    let model = null, dtype = null, lastErr = null;
    for (const dt of [...new Set([prefer, 'q4', 'q8'].filter(Boolean))]) {
      try { model = await T.AutoModelForCausalLM.from_pretrained(modelId, { dtype: dt, device: 'wasm', progress_callback }); dtype = dt; break; }
      catch (e) { lastErr = e; }
    }
    if (!model) throw lastErr;
    const vocabSize = tk.model.vocab.length ?? Object.keys(tk.model.tokens_to_ids ?? {}).length;
    const tok = {
      vocabSize: Math.max(vocabSize, ...(tk.all_special_ids || [0])) + 1,
      specialIds: tk.all_special_ids || [],
      encode: (s) => tk.encode(s, { add_special_tokens: false }),
      decode: (ids) => tk.decode(ids, { skip_special_tokens: false, clean_up_tokenization_spaces: false }),
    };
    ctx = { T, model, tok, okFor: makeFilter(tok), H: huffman(), modelId, dtype };
    return { modelId, dtype, meanBits: ctx.H.meanBits };
  }

  self.onmessage = async (ev) => {
    const m = ev.data;
    if (m.type === 'cancel') { cancel = true; return; }
    cancel = false;
    try {
      if (m.type === 'load') post({ type: 'loaded', ...(await load(m.modelId, m.dtype)) });
      else if (m.type === 'count') post({ type: 'count', tokens: ctx.tok.encode(m.text).length });
      else if (m.type === 'hide') post({ type: 'hidden', ...(await hide(ctx, m, emit)) });
      else if (m.type === 'reveal') post({ type: 'revealed', ...(await reveal(ctx, m, emit)) });
    } catch (e) {
      post({ type: 'error', message: String(e && e.message || e), op: m.type });
    }
  };
}
