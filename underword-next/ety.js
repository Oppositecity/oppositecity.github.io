/* UNDERWORD etymology layer.
   Any English word -> its chain of earlier forms, read live from Wiktionary.
   Each stage = [form, language, date, sense]. Results cached per browser. */
const ETY = (() => {
  const API = 'https://en.wiktionary.org/w/api.php';

  /* language code -> [name, rough date of attestation]. Dates are period
     labels, not claims about the individual word. */
  const LANG = {
    'en':['English','now'], 'enm':['Middle English','c.1300'], 'ang':['Old English','c.900'],
    'gmw-pro':['Proto-West Germanic','c.200'], 'gem-pro':['Proto-Germanic','c.500 BCE'],
    'ine-pro':['Proto-Indo-European','c.4000 BCE'], 'non':['Old Norse','c.900'],
    'frm':['Middle French','c.1450'], 'fro':['Old French','c.1150'], 'xno':['Anglo-Norman','c.1200'],
    'fr':['French','c.1600'], 'la':['Latin','c.100 BCE'], 'la-lat':['Late Latin','c.400'],
    'la-med':['Medieval Latin','c.1000'], 'la-new':['New Latin','c.1700'], 'la-vul':['Vulgar Latin','c.300'],
    'LL.':['Late Latin','c.400'], 'ML.':['Medieval Latin','c.1000'], 'VL.':['Vulgar Latin','c.300'],
    'itc-pro':['Proto-Italic','c.1000 BCE'], 'grc':['Ancient Greek','c.500 BCE'],
    'grc-koi':['Koine Greek','c.100'], 'gkm':['Byzantine Greek','c.900'], 'el':['Greek','now'],
    'grk-pro':['Proto-Hellenic','c.2000 BCE'], 'dum':['Middle Dutch','c.1300'], 'nl':['Dutch','c.1600'],
    'odt':['Old Dutch','c.900'], 'gml':['Middle Low German','c.1300'], 'osx':['Old Saxon','c.900'],
    'goh':['Old High German','c.900'], 'gmh':['Middle High German','c.1200'], 'de':['German','c.1700'],
    'it':['Italian','c.1500'], 'es':['Spanish','c.1500'], 'pt':['Portuguese','c.1500'],
    'ar':['Arabic','c.800'], 'fa':['Persian','c.1000'], 'pal':['Middle Persian','c.500'],
    'sa':['Sanskrit','c.1000 BCE'], 'hi':['Hindi','c.1800'], 'he':['Hebrew','c.500 BCE'],
    'hbo':['Biblical Hebrew','c.600 BCE'], 'arc':['Aramaic','c.500 BCE'], 'akk':['Akkadian','c.2000 BCE'],
    'sem-pro':['Proto-Semitic','c.3500 BCE'], 'egy':['Egyptian','c.2000 BCE'],
    'cel-pro':['Proto-Celtic','c.800 BCE'], 'ga':['Irish','c.1600'], 'sga':['Old Irish','c.800'],
    'cy':['Welsh','c.1600'], 'xcl':['Old Armenian','c.500'], 'sla-pro':['Proto-Slavic','c.500'],
    'cs':['Czech','c.1500'], 'ru':['Russian','c.1700'], 'yi':['Yiddish','c.1800'],
    'ja':['Japanese','c.1800'], 'zh':['Chinese','c.1000'], 'nci':['Classical Nahuatl','c.1500'],
    'sco':['Scots','c.1500'], 'nds':['Low German','c.1700'], 'sv':['Swedish','c.1700'],
    'da':['Danish','c.1700'], 'is':['Icelandic','c.1700'], 'got':['Gothic','c.350'],
    'en-US':['American English','c.1900'], 'mul':['Translingual','—'], 'ett':['Etruscan','c.500 BCE'],
    'gmq-pro':['Proto-Norse','c.300'], 'gmw-msc':['Middle Scots','c.1500'], 'trk-pro':['Proto-Turkic','c.0'],
    'ota':['Ottoman Turkish','c.1600'], 'tr':['Turkish','c.1900'], 'ms':['Malay','c.1600'],
  };
  const lang = c => LANG[c] || [c.endsWith('-pro') ? 'Proto-' + c.slice(0,-4) : c, '—'];

  /* templates that mean "this came from that" */
  const ANCESTRY = /^(inh|inh\+|inh-lite|der|der\+|der-lite|bor|bor\+|lbor|slbor|ubor|uder|obor|learned borrowing|semi-learned borrowing|inherited|derived|borrowed|calque|cal|clq|sl|semantic loan|psm|translit)$/;
  const FORMOF = /^(inflection of|infl of|plural of|past tense of|past participle of|present participle of|en-past of|en-ing form of|en-third-person singular of|en-third person singular of|en-simple past of|en-superlative of|en-comparative of|comparative of|superlative of|alternative form of|alt form|alternative spelling of|alt sp|obsolete spelling of|archaic spelling of|en-archaic third-person singular of|third-person singular of|misspelling of|nonstandard spelling of|eye dialect of|pronunciation spelling of|abbreviation of|clipping of|short for|contraction of)$/;

  /* split a template body on top-level pipes */
  function args(body){
    const out = []; let depth = 0, cur = '';
    for (let i = 0; i < body.length; i++){
      const ch = body[i], nx = body[i+1];
      if ((ch === '{' && nx === '{') || (ch === '[' && nx === '[')){ depth++; cur += ch + nx; i++; continue; }
      if ((ch === '}' && nx === '}') || (ch === ']' && nx === ']')){ depth--; cur += ch + nx; i++; continue; }
      if (ch === '|' && depth === 0){ out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    const pos = [], named = {};
    for (const a of out){
      const m = a.match(/^\s*([a-z0-9]+)\s*=(.*)$/s);
      if (m && isNaN(+m[1])) named[m[1]] = m[2].trim(); else if (m) named[m[1]] = m[2].trim();
      else pos.push(a.trim());
    }
    return { pos, named };
  }

  /* all top-level templates in order */
  function templates(text){
    const out = []; let i = 0;
    while ((i = text.indexOf('{{', i)) !== -1){
      let depth = 0, j = i;
      for (; j < text.length - 1; j++){
        if (text[j] === '{' && text[j+1] === '{'){ depth++; j++; }
        else if (text[j] === '}' && text[j+1] === '}'){ depth--; j++; if (!depth) break; }
      }
      const body = text.slice(i + 2, j - 1);
      const { pos, named } = args(body);
      out.push({ name: (pos.shift() || '').trim(), pos, named, at: i });
      i = j + 1;
    }
    return out;
  }

  const clean = s => (s || '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, '').replace(/'''?/g, '').trim();

  /* get the English section, and within it the first Etymology block */
  function englishSection(wt){
    const m = wt.split(/\n==(?!=)/);
    for (const part of m){
      if (/^\s*English\s*==/.test(part) || /^==\s*English\s*==/.test(part)) return part;
    }
    return /==English==/.test(wt) ? wt.slice(wt.indexOf('==English==')) : '';
  }
  function etymBlock(sec){
    const m = sec.match(/\n===+\s*Etymology[^=]*===+\s*\n([\s\S]*?)(?=\n===|\n==[^=]|$)/);
    return m ? m[1] : '';
  }

  function parseChain(word, wt){
    const sec = englishSection(wt);
    if (!sec) return { stages: [], lemma: null };
    // inflected form? follow to its lemma
    const defs = sec.match(/\n#[^:*][^\n]*/g) || [];
    if (defs.length){
      const first = templates(defs[0]);
      const f = first.find(t => FORMOF.test(t.name));
      if (f){
        const target = (f.name.startsWith('en-') ? f.pos[0] : f.pos[1]) || f.pos[0];
        const nonEty = !/Etymology/.test(sec) || defs.every(d => templates(d).some(t => FORMOF.test(t.name)));
        if (target && nonEty && clean(target) !== word) return { stages: [], lemma: clean(target) };
      }
    }
    const ety = etymBlock(sec);
    if (!ety) return { stages: [], lemma: null };
    // first sentence-ish run: stop at "Cognate", "Compare", "Doublet", "Related"
    const cut = ety.search(/\b(Cognate|Compare|Doublet|Related|Equivalent|Displaced|Replaced|Akin)\b|\{\{(cog|noncog|col-top|doublet|cog-lite)\|/);
    const head = cut > 0 ? ety.slice(0, cut) : ety;
    const ts = templates(head);
    const stages = [];
    const seen = new Set();
    for (const t of ts){
      if (!ANCESTRY.test(t.name)) continue;
      // inh|en|LANG|form|alt|gloss  (target lang is pos[0])
      const lc = t.pos[1], form = clean(t.pos[2]);
      if (!lc || !form || form === '-') continue;
      const key = lc + '|' + form;
      if (seen.has(key)) continue; seen.add(key);
      const gloss = clean(t.named.t || t.named.gloss || t.pos[4] || '');
      const [ln, dt] = lang(lc);
      stages.push([form, ln, dt, gloss, lc]);
    }
    // a {{root}} template names the deepest root even when the chain stops short
    const root = templates(ety).find(t => t.name === 'root' && t.pos[1]);
    if (root && root.pos[2]){
      const form = clean(root.pos[2]), lc = root.pos[1];
      if (!seen.has(lc + '|' + form)){ const [ln, dt] = lang(lc); stages.push([form, ln, dt, '', lc]); }
    }
    // compounds and affixed words: descend through the stem
    if (!stages.length){
      const af = ts.find(t => /^(af|affix|compound|com|suffix|suf|prefix|pre|confix|con|blend|univerbation)$/.test(t.name));
      if (af){
        const parts = af.pos.slice(1).map(clean).filter(p => p && !/^-|-$/.test(p));
        if (parts.length) return { stages: [], lemma: null, parts };
      }
    }
    return { stages, lemma: null };
  }

  /* ---------- fetching + cache ---------- */
  const mem = new Map();
  const LS = 'underword.ety.v1.';
  function cacheGet(w){
    if (mem.has(w)) return mem.get(w);
    try { const s = localStorage.getItem(LS + w); if (s){ const v = JSON.parse(s); mem.set(w, v); return v; } } catch(e){}
    return undefined;
  }
  function cachePut(w, v){
    mem.set(w, v);
    try { localStorage.setItem(LS + w, JSON.stringify(v)); } catch(e){}
  }

  /* batch: up to 50 titles per request; Wiktionary allows this anonymously */
  async function fetchPages(titles){
    const url = API + '?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*&redirects=1&titles=' +
      encodeURIComponent(titles.join('|'));
    const r = await fetch(url);
    if (!r.ok) throw new Error('wiktionary ' + r.status);
    const j = await r.json();
    const map = {};
    const norm = {};
    for (const n of (j.query.normalized || [])) norm[n.to] = n.from;
    for (const n of (j.query.redirects || [])) norm[n.to] = norm[n.from] || n.from;
    for (const p of (j.query.pages || [])){
      const t = norm[p.title] || p.title;
      map[t] = p.missing ? null : (p.revisions && p.revisions[0].slots.main.content) || null;
    }
    return map;
  }

  /* resolve words -> stages. Follows lemmas and compound stems one hop. */
  async function resolve(words, onEach){
    const want = [...new Set(words)].filter(w => cacheGet(w) === undefined);
    const pending = new Map();      // word -> page title we still need
    for (const w of want) pending.set(w, w);
    for (let hop = 0; hop < 3 && pending.size; hop++){
      const titles = [...new Set(pending.values())];
      const pages = {};
      for (let i = 0; i < titles.length; i += 50){
        try { Object.assign(pages, await fetchPages(titles.slice(i, i + 50))); }
        catch(e){ for (const t of titles.slice(i, i + 50)) pages[t] = undefined; }
      }
      const next = new Map();
      for (const [w, t] of pending){
        let wt = pages[t];
        if (wt === undefined && pages[t.toLowerCase()] !== undefined) wt = pages[t.toLowerCase()];
        if (!wt){
          // try lower case once, then give up
          if (hop === 0 && t !== t.toLowerCase()){ next.set(w, t.toLowerCase()); continue; }
          if (wt === undefined){ continue; }  // network failure: leave uncached, try later
          finish(w, []); continue;
        }
        const res = parseChain(t, wt);
        if (res.lemma && hop < 2){ next.set(w, res.lemma); continue; }
        if (res.parts && hop < 2){
          const stem = res.parts.slice().sort((a, b) => b.length - a.length)[0];
          next.set(w, stem); continue;
        }
        finish(w, res.stages, t !== w ? t : null);
      }
      pending.clear();
      for (const [k, v] of next) pending.set(k, v);
    }
    for (const [w] of pending) finish(w, []);

    function finish(w, stages, via){
      const top = [w, 'English', 'now', via ? 'as in ' + via : ''];
      const chain = [top, ...stages.map(s => s.slice(0, 4))];
      if (stages.length === 0) chain.push(['·no record·', 'unknown', '—', 'Wiktionary gives this word no history']);
      cachePut(w, chain);
      onEach && onEach(w, chain);
    }
    return words.map(w => cacheGet(w));
  }

  return { resolve, get: cacheGet, parseChain, templates };
})();
