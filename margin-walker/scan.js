// Camera -> barcode -> product record from the Open Food Facts family of databases.
// Only the barcode number leaves the device.
(function (root) {
  "use strict";

  var ZXING = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
  var ZXING_SRI = "sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB";
  var DATABASES = [
    ["Open Food Facts", "https://world.openfoodfacts.org"],
    ["Open Beauty Facts", "https://world.openbeautyfacts.org"],
    ["Open Products Facts", "https://world.openproductsfacts.org"],
  ];
  var FIELDS = "product_name,generic_name,brands,categories_tags,manufacturing_places,origins";
  var US = /\b(usa|u\.s\.a?\.?|united states|etats-unis|états-unis|estados unidos|vereinigte staaten)\b/i;

  function isBarcode(text) {
    return /^\d{8,14}$/.test(String(text || "").replace(/\s+/g, ""));
  }

  function loadScript(src, integrity) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; }
      s.src = src; s.onload = ok; s.onerror = function () { fail(new Error("could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  // Where the product was made, when the record says so: "here", "abroad" or null.
  function origin(record) {
    var made = String(record.manufacturing_places || "").trim();
    if (!made) return null;
    return US.test(made) ? "here" : "abroad";
  }

  // Search phrases from a record, most specific first.
  function phrases(record) {
    var out = [];
    var tags = (record.categories_tags || []).slice().reverse();
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i]);
      if (t.indexOf("en:") !== 0) continue;
      out.push(t.slice(3).replace(/-/g, " "));
    }
    if (record.generic_name) out.push(record.generic_name);
    if (record.product_name) out.push(record.product_name);
    return out;
  }

  function lookup(code) {
    code = String(code).replace(/\s+/g, "");
    var i = 0;
    function next() {
      if (i >= DATABASES.length) return Promise.resolve(null);
      var db = DATABASES[i++];
      return fetch(db[1] + "/api/v2/product/" + encodeURIComponent(code) + ".json?fields=" + FIELDS,
                   { credentials: "omit", referrerPolicy: "no-referrer" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.status === 1 && j.product) {
            var p = j.product;
            p.code = code; p.source = db[0]; p.source_url = db[1] + "/product/" + code;
            return p;
          }
          return next();
        }, next);
    }
    return next();
  }

  // Opens the camera and resolves with the first barcode read, or null if closed.
  function Scanner(video, onMessage) {
    this.video = video;
    this.say = onMessage || function () {};
    this.stream = null;
    this.stopped = false;
  }

  Scanner.prototype.start = function () {
    var self = this;
    this.stopped = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("This browser cannot open the camera. Type the barcode number instead."));
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(function (stream) {
        self.stream = stream;
        self.video.srcObject = stream;
        return self.video.play();
      })
      .then(function () {
        if ("BarcodeDetector" in root) return self.native();
        self.say("Loading the barcode reader…");
        return loadScript(ZXING, ZXING_SRI).then(function () { return self.zxing(); });
      });
  };

  Scanner.prototype.native = function () {
    var self = this;
    var detector = new root.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    this.say("Point the camera at a barcode.");
    return new Promise(function (ok) {
      (function tick() {
        if (self.stopped) return ok(null);
        detector.detect(self.video).then(function (codes) {
          if (codes.length) return ok(codes[0].rawValue);
          setTimeout(tick, 150);
        }, function () { setTimeout(tick, 300); });
      })();
    });
  };

  Scanner.prototype.zxing = function () {
    var self = this, Z = root.ZXing;
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8,
      Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    var reader = new Z.BrowserMultiFormatReader(hints);
    this.reader = reader;
    this.say("Point the camera at a barcode.");
    return new Promise(function (ok) {
      reader.decodeFromStream(self.stream, self.video, function (result) {
        if (result && !self.stopped) { ok(result.getText()); }
      });
      self.onStop = function () { ok(null); };
    });
  };

  Scanner.prototype.stop = function () {
    this.stopped = true;
    if (this.reader) { try { this.reader.reset(); } catch (e) { /* already stopped */ } }
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    if (this.onStop) this.onStop();
  };

  var api = { isBarcode: isBarcode, lookup: lookup, origin: origin, phrases: phrases, Scanner: Scanner };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MWScan = api;
})(this);
