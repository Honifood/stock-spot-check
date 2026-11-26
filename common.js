/* Shared helpers: config loading, IndexedDB storage, number helpers */
(function () {
  var DEFAULT_CONFIG = {
    version: 0, appTitle: "Stock Spot Check", mandatoryLines: 3, maxSaved: 10, wastage: true, adminPinHash: "",
    shops: [
      "HP02 Fenchurch Honi Poke",
      "HP03 Margaret Honi Poke",
      "HP04 Chancery Honi Poke",
      "HP05 Angel Honi Poke",
      "HP05 Angel Sushi",
      "HP06 Fleet Honi Poke",
      "HP07 Victoria Honi Poke",
      "HP08 Westfield Honi Poke",
      "HP09 Selfridges Honi Poke",
      "HP10 Jerdan Place Honi Poke",
      "HP10 Jerdan Place Sushi",
      "HP11 South Bank Honi Poke",
      "HP11 South Bank Sushi",
      "HP12 Bishopsgate Honi Poke",
      "HP13 Paddington Honi Poke",
      "HP14 Farringdon Honi Poke",
      "HP14 Farringdon Sushi",
      "HP15 Battersea Honi Poke",
      "HP15 Battersea Sushi",
      "HP16 Manchester Honi Poke",
      "HP17 St Paul Honi Poke",
      "HP18 Moorgate Honi Poke",
      "HP19 Leeds Honi Poke",
      "HP20 Banksite Honi Poke",
      "HP21 New Street Honi Poke",
      "HP21 New Street Sushi",
      "HP23 High Holborn Honi Poke",
      "HP24 St Mary Axe Honi Poke",
      "HP26 Fitzrovia Honi Poke",
      "HP27 Canary Wharf Honi Poke",
      "HP28 Kingly Honi Poke",
      "HP28 Kingly Sushi",
      "HP29 Shoreditch Honi Poke",
      "HP29 Shoreditch Sushi",
      "HP30 Broadgate Honi Poke",
      "HP31 Victoria 2 Honi Poke",
      "HP32 Fenchurch 2 Honi Poke"
],
    categories: [
      { id: "protein", name: "Protein", lines: ["Salmon"] }, { id: "drinks", name: "Drinks", lines: [] },
      { id: "chemicals", name: "Chemicals", lines: [] }, { id: "packaging", name: "Packaging", lines: [] },
      { id: "batch-sauces", name: "Batch sauces", lines: [] }
    ]
  };

  function validCfg(c) {
    return !!c && typeof c === "object" && !Array.isArray(c) &&
      Array.isArray(c.shops) && c.shops.length > 0 && c.shops.every(function (s) { return typeof s === "string" && s.trim(); }) &&
      Array.isArray(c.categories) && c.categories.length > 0 && c.categories.every(function (k) { return k && typeof k.name === "string" && k.name.trim(); });
  }
  function normCfg(c) {
    var n = JSON.parse(JSON.stringify(c));
    n.shops = n.shops.map(function (s) { return s.replace(/\s+/g, " ").trim(); });
    n.categories = n.categories.map(function (k, i) {
      return { id: k.id || ("cat-" + i), name: k.name.trim(), lines: Array.isArray(k.lines) ? k.lines.filter(function (l) { return typeof l === "string" && l.trim(); }) : [] };
    });
    n.mandatoryLines = Math.min(10, Math.max(1, parseInt(n.mandatoryLines, 10) || 3));
    n.maxSaved = Math.min(30, Math.max(1, parseInt(n.maxSaved, 10) || 10));
    n.wastage = n.wastage !== false;
    return n;
  }
  function cachedConfig() { try { var c = JSON.parse(localStorage.getItem("sc_config")); if (validCfg(c)) return normCfg(c); } catch (e) {} return null; }
  function fetchConfig() {
    return fetch("config.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("config " + r.status); return r.json(); })
      .then(function (c) { if (!validCfg(c)) throw new Error("invalid config"); try { localStorage.setItem("sc_config", JSON.stringify(c)); } catch (e) {} return c; });
  }
  // Never blocks the app: waits at most 3 s for the network (shop floors have poor signal), then uses the last good copy.
  function loadConfig() {
    var net = fetchConfig().then(normCfg, function () { return null; });
    var timer = new Promise(function (res) { setTimeout(function () { res(null); }, 3000); });
    return Promise.race([net, timer]).then(function (c) { return c || cachedConfig() || normCfg(DEFAULT_CONFIG); });
  }
  // Admin must edit the real, current config: no silent fallback to defaults.
  function loadConfigStrict() { return fetchConfig(); }

  // ---- IndexedDB (drafts incl. photo blobs) ----
  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open("honi-spot-check", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("checks", { keyPath: "id" }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction("checks", mode);
        var res = fn(t.objectStore("checks"));
        t.oncomplete = function () { resolve(res && res.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  // Photos are stored as raw bytes (ArrayBuffer): Safari/WebKit refuses Blobs in IndexedDB in private tabs and when storage is tight.
  var blobCache = {};
  function photoBlob(p) {
    if (p.blob instanceof Blob) return p.blob;
    if (!blobCache[p.id]) blobCache[p.id] = new Blob([p.data], { type: p.type || "image/jpeg" });
    return blobCache[p.id];
  }
  function allPhotos(d) {
    var out = []; (d.categories || []).forEach(function (c) { (c.photos || []).forEach(function (p) { out.push(p); }); });
    ((d.wastage && d.wastage.photos) || []).forEach(function (p) { out.push(p); }); (d.generalPhotos || []).forEach(function (p) { out.push(p); });
    return out;
  }
  function prepare(d) {
    return Promise.all(allPhotos(d).filter(function (p) { return p.blob instanceof Blob; }).map(function (p) {
      var b = p.blob;
      return b.arrayBuffer().then(function (ab) { blobCache[p.id] = b; p.data = ab; p.type = b.type || "image/jpeg"; delete p.blob; });
    }));
  }
  var store = {
    all: function () { return tx("readonly", function (s) { return s.getAll(); }).then(function (r) { return (r || []).sort(function (a, b) { return b.updatedAt - a.updatedAt; }); }); },
    get: function (id) { return tx("readonly", function (s) { return s.get(id); }); },
    put: function (obj) { return prepare(obj).then(function () { return tx("readwrite", function (s) { return s.put(obj); }); }); },
    del: function (id) { return tx("readwrite", function (s) { return s.delete(id); }); }
  };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function num(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/[\u00A3\s]/g, "").replace(/[\u2212\u2013\u2014]/g, "-");
    if (s === "") return null;
    var m = s.match(/^(-?(?:[0-9]|\.[0-9])[0-9,.]*)([A-Za-z%]*)$/);   // number with optional unit (12kg); anything else is invalid
    if (!m) return null;
    var n = m[1];
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) n = n.replace(/,/g, "");  // UK thousands: 4,200
    else n = n.replace(/,/g, ".");                                            // decimal comma: 4,5
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(n)) return null;
    var x = parseFloat(n);
    return isNaN(x) ? null : x;
  }
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "";
    var r = Math.round(n * 1000) / 1000;
    return String(r);
  }
  function variance(line) {
    var s = num(line.system), c = num(line.counted);
    if (s === null || c === null) return null;
    return Math.round((c - s) * 1000) / 1000;
  }
  function fmtVar(v) { return v === null ? "" : (v > 0 ? "+" : "") + fmtNum(v); }

  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  var UNITS = ['g', 'kg', 'each'];
  window.SC = { photoBlob: photoBlob, UNITS: UNITS, BUILD: "1.6.1", loadConfig: loadConfig, loadConfigStrict: loadConfigStrict, validCfg: validCfg, normCfg: normCfg, store: store, uid: uid, num: num, fmtNum: fmtNum, variance: variance, fmtVar: fmtVar, sha256: sha256 };
})();
