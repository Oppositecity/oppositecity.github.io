// Query + place -> one product line, with a confidence and a shortlist.
// Tokenising must match pipeline/search.py.
(function (root) {
  "use strict";

  var GUESS_BELOW = 0.6;
  var ALCOHOL = { l100: 1, l101: 1, l102: 1 };
  var EATING_OUT = { l242: 1, l243: 1, l244: 1 };
  // What a store with nothing else said most likely means.
  var STORE_DEFAULT = { "445000": "l900" };

  function stem(w) {
    if (w.length > 4 && w.slice(-3) === "ies") return w.slice(0, -3) + "y";
    if (w.length > 3 && w.slice(-1) === "s" && w.slice(-2) !== "ss") return w.slice(0, -1);
    return w;
  }

  function Search(index, merchants) {
    this.index = index;
    this.stop = {};
    for (var i = 0; i < index.stop.length; i++) this.stop[index.stop[i]] = 1;
    this.keys = Object.keys(index.terms);
    this.byId = {};
    for (var j = 0; j < index.products.length; j++) this.byId[index.products[j].id] = j;
    this.places = (merchants || []).map(function (m) {
      var p = {}; for (var k in m) p[k] = m[k];
      p.re = new RegExp(m.pattern, "i");
      return p;
    });
  }

  Search.prototype.tokens = function (text) {
    var stop = this.stop;
    return String(text || "").toLowerCase().replace(/&/g, " and ").replace(/'/g, "")
      .split(/[^a-z0-9]+/).filter(function (w) { return w && !stop[w]; }).map(stem);
  };

  // Ranked product lines for a query: [{id, label, kind, confidence}]
  Search.prototype.search = function (query, limit) {
    limit = limit || 6;
    var idx = this.index, qt = this.tokens(query);
    if (!qt.length) return [];
    var out = [], i;

    var ph = idx.phrases[qt.join(" ")];
    if (ph) {
      var conf = ph.length === 1 ? 0.95 : 0.5;
      for (i = 0; i < ph.length; i++) out.push({ i: ph[i][0], score: ph[i][1] });
      out.sort(function (a, b) { return b.score - a.score; });
      return out.slice(0, limit).map(function (h) { return this.hit(h.i, conf); }, this);
    }

    var maxIdf = Math.log(1 + idx.products.length), total = 0, scores = {}, matched = {};
    for (var t = 0; t < qt.length; t++) {
      var tok = qt[t], entries = idx.terms[tok], w = idx.idf[tok];
      if (!entries && t === qt.length - 1 && tok.length >= 3) {
        // Typing: let the last word match as a prefix.
        var best = null;
        for (i = 0; i < this.keys.length; i++) {
          var k = this.keys[i];
          if (k.lastIndexOf(tok, 0) === 0 && (!best || idx.idf[k] > idx.idf[best])) best = k;
        }
        if (best) { entries = idx.terms[best]; w = idx.idf[best]; }
      }
      total += w || maxIdf;
      if (!entries) continue;
      for (i = 0; i < entries.length; i++) {
        var p = entries[i][0];
        scores[p] = (scores[p] || 0) + w * entries[i][1];
        matched[p] = (matched[p] || 0) + w;
      }
    }
    for (var key in scores) out.push({ i: +key, score: scores[key], cover: matched[key] / total });
    out.sort(function (a, b) { return b.score - a.score; });
    if (!out.length) return [];
    var top = out[0].score;
    return out.slice(0, limit).map(function (h, n) {
      var next = n === 0 ? (out[1] ? out[1].score : 0) : top;
      var sep = 1 - next / h.score;
      var c = (h.score / total) * (0.7 + 0.3 * Math.max(sep, 0));
      return this.hit(h.i, Math.min(Math.max(c, 0), 0.9) * (0.5 + 0.5 * h.cover));
    }, this);
  };

  Search.prototype.hit = function (i, confidence) {
    var p = this.index.products[i];
    return { id: p.id, label: p.label, kind: p.kind, confidence: Math.round(confidence * 100) / 100 };
  };

  Search.prototype.place = function (text) {
    if (!text) return null;
    for (var i = 0; i < this.places.length; i++) {
      if (this.places[i].re.test(text)) return this.places[i];
    }
    return null;
  };

  // {query, place} -> {product, confidence, label, store, place, shortlist, why}
  Search.prototype.resolve = function (q) {
    var place = this.place(q.place) || (q.place ? null : this.place(q.query));
    var hits = this.search(q.query);
    var top = hits[0] || null;
    var r = { place: place, shortlist: hits, store: null, why: "" };

    if (place && place.product) {
      var pk = this.index.products[this.byId[place.product]].kind;
      if (!top) {
        r.product = place.product; r.confidence = place.confidence; r.why = "place";
      } else if (pk === "service" && top.kind === "good") {
        // A good bought where it is served: the purchase is the service.
        r.product = EATING_OUT[place.product] && ALCOHOL[top.id] ? "l245" : place.product;
        r.confidence = Math.min(place.confidence, Math.max(top.confidence, 0.6));
        r.why = "served";
      } else if (top.confidence < 0.6 && top.id !== place.product) {
        r.product = place.product; r.confidence = place.confidence; r.why = "place";
      } else {
        r.product = top.id; r.confidence = top.confidence; r.why = "query";
      }
    } else if (top) {
      r.product = top.id; r.confidence = top.confidence; r.why = "query";
    } else if (place && place.store && STORE_DEFAULT[place.store] && this.byId[STORE_DEFAULT[place.store]] !== undefined) {
      r.product = STORE_DEFAULT[place.store]; r.confidence = place.confidence * 0.8; r.why = "store";
    } else {
      r.product = null; r.confidence = 0;
      return r;
    }
    var prod = this.index.products[this.byId[r.product]];
    r.label = prod.label; r.kind = prod.kind;
    if (place && place.store && prod.kind === "good") r.store = place.store;
    if (place) r.confidence = Math.min(r.confidence, Math.max(place.confidence, r.confidence * 0.9));
    r.guessed = r.confidence < GUESS_BELOW;
    return r;
  };

  var api = { Search: Search, GUESS_BELOW: GUESS_BELOW, stem: stem };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MWSearch = api;
})(this);
