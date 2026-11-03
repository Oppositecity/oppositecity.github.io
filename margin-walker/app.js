// Margin Walker page: ask, match, show, say what it is.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var KEY = "margin-walker";
  var data, states, search, scanner;
  var pick = null;      // product id the user chose from the shortlist
  var scanned = null;   // {record, product, origin} from a barcode

  // --- storage (wage, state, recent queries; all optional) -----------------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(patch) {
    try {
      var s = load();
      for (var k in patch) s[k] = patch[k];
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* storage blocked: nothing is remembered */ }
  }

  // --- formatting ----------------------------------------------------------
  function money(x) {
    if (x > 0 && x < 0.005) return "<$0.01";
    var neg = x < 0; x = Math.abs(x);
    var s = x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : x.toFixed(2);
    return (neg ? "−$" : "$") + s;
  }
  function amount(text) {
    var v = parseFloat(String(text || "").replace(/[$,\s]/g, ""));
    return isFinite(v) && v > 0 ? v : null;
  }
  function duration(hours) {
    if (hours < 1 / 60) return Math.round(hours * 3600) + " seconds";
    if (hours < 1) {
      var m = hours * 60;
      return (m < 10 ? m.toFixed(1) : Math.round(m)) + " minutes";
    }
    return hours.toFixed(1) + " hours";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  // --- render --------------------------------------------------------------
  function render() {
    var query = $("product").value.trim();
    var placeText = $("place").value.trim();
    var out = $("result");
    if (MWScan.isBarcode(query) && (!scanned || scanned.record.code !== query.replace(/\s+/g, ""))) {
      lookupBarcode(query.replace(/\s+/g, ""));
      return;
    }
    var r = scanned && scanned.product && !pick
      ? scannedResolve(placeText)
      : search.resolve({ query: query, place: placeText });
    if (pick) {
      var hit = r.shortlist.filter(function (h) { return h.id === pick; })[0];
      if (hit || query) {
        var label = (hit || {}).label;
        r.product = pick; r.confidence = Math.max(r.confidence || 0, 0.9); r.guessed = false;
        r.why = "picked"; r.label = label || r.label;
        var kind = data.products.filter(function (p) { return p.id === pick; })[0].kind;
        r.store = r.place && r.place.store && kind === "good" ? r.place.store : null;
      }
    }
    showPicks(r, query);
    if (!r.product) {
      out.classList.toggle("hidden", !query && !placeText);
      out.innerHTML = query || placeText
        ? "<p>No match for that yet. Try a plainer word (\"coffee\", \"tv\", \"haircut\") or pick a place.</p>"
        : "";
      return;
    }
    var price = amount($("price").value) || 1;
    var state = $("state").value || null;
    var c = MWCompute.compute(data, states, {
      product: r.product, price: price, store: r.store, state: state,
      origin: scanned && !pick ? scanned.origin : null,
    });
    var d = c.dollars, label = r.guessed ? "guessed" : "derived";
    var wage = amount($("wage").value);

    var html = "";
    html += '<p class="big"><span class="profit">' + money(d.profit_gross) + "</span> of your " +
      money(price) + " is profit for owners.</p>";
    html += '<p><span class="profit">' + money(d.profit_net) + "</span> after their equipment wears out.</p>";
    html += '<div class="split">' +
      row("wages", d.wages) + row("taxes", d.taxes) + row("left the country", d.imports) +
      (Math.abs(d.unallocated) >= 0.005 ? row("used goods changing hands", d.unallocated) : "") +
      "</div>";
    if (wage) {
      html += "<p>That profit is " + duration(d.profit_gross / wage) + " of your work (" +
        duration(d.profit_net / wage) + " net).</p>";
    }
    html += '<p class="tag">' + label + "</p>";

    html += "<h2>where the profit was made</h2><div class=\"trail\">";
    c.trail.forEach(function (t) {
      if (t.dollars < 0.005) return;
      html += '<div><span class="amt profit">' + money(t.dollars) + "</span><span>" +
        esc(lower(t.label)) + (t.store ? " (the store's cut)" : "") + "</span></div>";
    });
    html += "</div>";

    html += "<h2>what this is</h2><div class=\"what\">";
    html += "<p>The average for <strong>" + esc(lower(c.product.label)) + "</strong>";
    if (c.product.label !== c.product.bea_label) html += " (BEA: " + esc(lower(c.product.bea_label)) + ")";
    html += c.state ? ", with the seller's own split as in " + esc(c.state) : ", US average";
    html += ". Not any one company's books.</p>";
    var how = [];
    if (r.why === "served") how.push("bought where it is served, so this is the meal or drink, not the groceries");
    if (r.place) how.push("place matched: " + esc(r.place.name));
    if (c.store) {
      how.push("store: " + esc(lower(c.store)) +
        (c.typical_store ? " (typical for this product; name a place to change it)" : ""));
    } else if (c.retail_share > 0) how.push("store: the usual mix of stores for this product");
    if (c.retail_share > 0) how.push("the store's margin is " + Math.round(c.retail_share * 100) + "% of the price");
    if (c.origin === "abroad") how.push("made outside the US, per the product record");
    if (c.origin === "here") how.push("made in the US, per the product record");
    how.push("match confidence " + Math.round(r.confidence * 100) + "%");
    html += "<p>" + how.join("; ") + ".</p>";
    html += "<p>BEA " + c.years.detail + " detail tables brought forward to " + c.years.data +
      (c.state ? "; state shares " + c.years.state : "") + ". Gross profit includes owners' depreciation; " +
      "net removes it.</p></div>";

    out.innerHTML = html;
    out.classList.remove("hidden");
    remember(query, placeText);
  }

  function row(name, v) {
    return "<div><span>" + name + "</span><span>" + money(v) + "</span></div>";
  }

  function showPicks(r, query) {
    var el = $("picks");
    var list = (r.shortlist || []).filter(function (h) { return h.id !== r.product; }).slice(0, 4);
    var show = query && list.length && (r.guessed || r.confidence < 0.8 || pick);
    el.classList.toggle("hidden", !show);
    if (!show) { el.innerHTML = ""; return; }
    el.innerHTML = "or did you mean: " + list.map(function (h) {
      return '<button type="button" class="word" data-id="' + h.id + '">' + esc(lower(h.label)) + "</button>";
    }).join(" ");
  }

  function remember(query, place) {
    if (!query && !place) return;
    var recent = (load().recent || []).filter(function (x) { return x[0] !== query || x[1] !== place; });
    recent.unshift([query, place]);
    save({ recent: recent.slice(0, 5) });
  }

  // --- barcodes ------------------------------------------------------------
  function scannedResolve(placeText) {
    var r = search.resolve({ query: "", place: placeText });
    var prod = data.products.filter(function (p) { return p.id === scanned.product; })[0];
    r.product = prod.id; r.label = prod.label; r.kind = prod.kind;
    r.confidence = scanned.confidence; r.guessed = scanned.confidence < MWSearch.GUESS_BELOW;
    r.why = "scan"; r.shortlist = scanned.shortlist || [];
    r.store = r.place && r.place.store && prod.kind === "good" ? r.place.store : null;
    return r;
  }

  function lookupBarcode(code) {
    var note = $("scanned");
    note.textContent = "Looking up " + code + "…";
    note.classList.remove("hidden");
    MWScan.lookup(code).then(function (rec) {
      if (!rec) {
        scanned = null;
        note.textContent = "No database knows barcode " + code + ". Type what it is instead.";
        $("result").classList.add("hidden");
        return;
      }
      var best = null, shortlist = [];
      var ph = MWScan.phrases(rec);
      for (var i = 0; i < ph.length; i++) {
        var hits = search.search(ph[i]);
        if (!shortlist.length) shortlist = hits;
        if (hits[0] && hits[0].confidence >= 0.6) { best = hits[0]; shortlist = hits; break; }
        if (hits[0] && (!best || hits[0].confidence > best.confidence)) best = hits[0];
      }
      var name = [rec.product_name, rec.brands].filter(Boolean).join(", ");
      var made = rec.manufacturing_places ? " Made in: " + rec.manufacturing_places + "." : "";
      note.innerHTML = "Scanned: " + esc(name || code) + "." + esc(made) + ' <a href="' +
        esc(rec.source_url) + '">' + esc(rec.source) + "</a>";
      scanned = best ? { record: rec, product: best.id, confidence: best.confidence,
                         origin: MWScan.origin(rec), shortlist: shortlist } : { record: rec };
      if (!best) note.innerHTML += ". It isn't clear what kind of product this is; type it instead.";
      render();
    });
  }

  function openCamera() {
    $("camera").classList.remove("hidden");
    $("camera-msg").textContent = "Opening the camera…";
    scanner = new MWScan.Scanner($("video"), function (m) { $("camera-msg").textContent = m; });
    scanner.start().then(function (code) {
      closeCamera();
      if (code) { $("product").value = code; pick = null; render(); }
    }, function (err) {
      $("camera-msg").textContent = err.message || "The camera could not be opened.";
    });
  }
  function closeCamera() {
    if (scanner) scanner.stop();
    $("camera").classList.add("hidden");
  }

  // --- wiring --------------------------------------------------------------
  var timer = null;
  function soon() { clearTimeout(timer); timer = setTimeout(render, 120); }

  function init() {
    var saved = load();
    var sel = $("state");
    Object.keys(states.states).filter(function (f) {
      return f !== states.us && +f < 90000;
    }).sort(function (a, b) {
      return states.states[a].name.localeCompare(states.states[b].name);
    }).forEach(function (f) {
      var o = document.createElement("option");
      o.value = f; o.textContent = states.states[f].name; sel.appendChild(o);
    });
    if (saved.state) sel.value = saved.state;
    if (saved.wage) $("wage").value = saved.wage;

    $("ask").addEventListener("submit", function (e) { e.preventDefault(); render(); });
    $("product").addEventListener("input", function () { pick = null; scanned = null; $("scanned").classList.add("hidden"); soon(); });
    $("place").addEventListener("input", soon);
    $("price").addEventListener("input", soon);
    $("state").addEventListener("change", function () { save({ state: sel.value }); render(); });
    $("wage").addEventListener("input", function () { save({ wage: $("wage").value }); soon(); });
    $("picks").addEventListener("click", function (e) {
      var id = e.target.getAttribute("data-id");
      if (id) { pick = id; render(); }
    });
    $("scan").addEventListener("click", openCamera);
    $("camera-close").addEventListener("click", closeCamera);
    $("forget").addEventListener("click", function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ }
      $("wage").value = ""; sel.value = ""; $("forgot").classList.remove("hidden");
      setTimeout(function () { $("forgot").classList.add("hidden"); }, 2000);
      render();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCamera(); });
  }

  Promise.all(["data/products.json", "data/states.json", "data/search.json", "data/merchants.json"]
    .map(function (u) { return fetch(u).then(function (r) { return r.json(); }); }))
    .then(function (all) {
      data = all[0]; states = all[1];
      search = new MWSearch.Search(all[2], all[3].merchants);
      init();
      render();
    }, function () {
      $("result").classList.remove("hidden");
      $("result").textContent = "The data files did not load. Reload the page to try again.";
    });
})();
