/* Shared helpers: config loading, IndexedDB storage, number helpers */
(function () {
  var DEFAULT_CONFIG = {
    version: 1, appTitle: "Stock Spot Check", mandatoryLines: 3, maxSaved: 10, wastage: true, adminPinHash: "",
    shops: [], categories: [{ id: "protein", name: "Protein", lines: ["Salmon"] }]
  };

  function loadConfig() {
    return fetch("config.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("config " + r.status); return r.json(); })
      .then(function (c) { try { localStorage.setItem("sc_config", JSON.stringify(c)); } catch (e) {} return c; })
      .catch(function () {
        try { var s = localStorage.getItem("sc_config"); if (s) return JSON.parse(s); } catch (e) {}
        return DEFAULT_CONFIG;
      });
  }

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
  var store = {
    all: function () { return tx("readonly", function (s) { return s.getAll(); }).then(function (r) { return (r || []).sort(function (a, b) { return b.updatedAt - a.updatedAt; }); }); },
    get: function (id) { return tx("readonly", function (s) { return s.get(id); }); },
    put: function (obj) { return tx("readwrite", function (s) { return s.put(obj); }); },
    del: function (id) { return tx("readwrite", function (s) { return s.delete(id); }); }
  };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function num(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    var n = parseFloat(String(v).replace(/,/g, ".").replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "";
    var r = Math.round(n * 100) / 100;
    return String(r);
  }
  function variance(line) {
    var s = num(line.system), c = num(line.counted);
    if (s === null || c === null) return null;
    return Math.round((c - s) * 100) / 100;
  }
  function fmtVar(v) { return v === null ? "" : (v > 0 ? "+" : "") + fmtNum(v); }

  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  window.SC = { BUILD: "1.0.0", loadConfig: loadConfig, store: store, uid: uid, num: num, fmtNum: fmtNum, variance: variance, fmtVar: fmtVar, sha256: sha256 };
})();
