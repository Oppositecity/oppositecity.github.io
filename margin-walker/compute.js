// One product line + price + place -> dollars to profit, wages, taxes and imports.
(function (root) {
  "use strict";

  var SLICES = ["profit_gross", "wages", "taxes", "imports", "unallocated"];

  // data: products.json; states: states.json (optional)
  // q: {product (id), price, store (retail code), state (FIPS), origin ("abroad"|"here"|null)}
  function compute(data, states, q) {
    var p = null;
    for (var i = 0; i < data.products.length; i++) {
      if (data.products[i].id === q.product) { p = data.products[i]; break; }
    }
    if (!p) throw new Error("unknown product " + q.product);
    var base = p.base;
    if (q.origin === "abroad" && p.base_made_abroad) base = p.base_made_abroad;
    if (q.origin === "here" && p.base_made_here) base = p.base_made_here;

    var mix = {};
    if (p.retail_share > 0) {
      if (q.store && data.retail[q.store]) mix[q.store] = 1;
      else mix = p.default_retail || data.household_retail_mix;
    }

    var s = {}, k, c;
    for (k = 0; k < SLICES.length; k++) {
      var key = SLICES[k], v = base[key];
      for (c in mix) v += p.retail_share * mix[c] * data.retail[c][key];
      s[key] = v;
    }

    // The seller's own value added, re-split by the state's shares for its industry.
    var local = {};
    for (c in p.local) local[c] = (local[c] || 0) + p.local[c];
    for (c in mix) {
      var rl = data.retail[c].local;
      for (var ind in rl) local[ind] = (local[ind] || 0) + p.retail_share * mix[c] * rl[ind];
    }
    var stateName = null;
    if (states && q.state && q.state !== states.us && states.states[q.state]) {
      var st = states.states[q.state], us = states.states[states.us];
      stateName = st.name;
      for (ind in local) {
        var a = st.shares[ind], b = us.shares[ind];
        if (!a || !b) continue;
        s.wages += local[ind] * (a[0] - b[0]);
        s.taxes += local[ind] * (a[1] - b[1]);
        s.profit_gross += local[ind] * (a[2] - b[2]);
      }
    }
    s.profit_net = s.profit_gross * (1 - data.depreciation_ratio);

    var price = q.price > 0 ? q.price : 1;
    var dollars = {};
    for (k in s) dollars[k] = s[k] * price;

    // Where the profit was made: upstream industries, plus the store's own cut.
    var trail = p.trail.map(function (t) {
      return { label: data.industries[t[0]] || t[0], code: t[0], dollars: t[1] * price };
    });
    for (c in mix) {
      trail.push({ label: data.retail[c].label, code: c, store: true,
                   dollars: p.retail_share * mix[c] * data.retail[c].profit_gross * price });
    }
    trail.sort(function (x, y) { return y.dollars - x.dollars; });

    var storeLabel = null, typical = false, codes = Object.keys(mix);
    if (codes.length === 1) {
      storeLabel = data.retail[codes[0]].label;
      typical = !(q.store && mix[q.store]);
    }

    return {
      product: p, price: price, shares: s, dollars: dollars, trail: trail.slice(0, 6),
      store: storeLabel, typical_store: typical, state: stateName, retail_share: p.retail_share,
      origin: base === p.base ? null : q.origin,
      years: { data: data.data_year, detail: data.benchmark_year, state: states ? states.year : null },
    };
  }

  var api = { compute: compute, SLICES: SLICES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MWCompute = api;
})(this);
