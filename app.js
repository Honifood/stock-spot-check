/* Honi Poke Stock Spot Check - operations manager app */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var cfg = null, sc = null, saveTimer = null, pdfBlob = null, pdfName = "";
  var urls = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function fmtDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200); }

  function modal(html, onMount) {
    var m = $("#modal"); $("#modal-card").innerHTML = html; m.hidden = false;
    if (onMount) onMount($("#modal-card"));
  }
  function closeModal() { $("#modal").hidden = true; }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      modal("<h3>" + esc(title) + "</h3><p>" + text + "</p><div class='actions'><button class='btn " + (danger ? "danger" : "") + " small' id='m-ok'>" + esc(okLabel) + "</button><button class='btn light small' id='m-cancel'>Cancel</button></div>", function (c) {
        $("#m-ok", c).onclick = function () { closeModal(); resolve(true); };
        $("#m-cancel", c).onclick = function () { closeModal(); resolve(false); };
      });
    });
  }
  function infoBox(title, html) {
    return new Promise(function (resolve) {
      modal("<h3>" + esc(title) + "</h3>" + html + "<div class='actions'><button class='btn small' id='m-ok'>OK</button></div>", function (c) {
        $("#m-ok", c).onclick = function () { closeModal(); resolve(); };
      });
    });
  }

  function show(name) {
    ["home", "form", "done"].forEach(function (n) { $("#screen-" + n).hidden = n !== name; });
    $("#btn-home").hidden = name === "home";
    window.scrollTo(0, 0);
  }

  /* ---------------- model ---------------- */
  function blankLines(names) {
    var out = [], n = Math.max(cfg.mandatoryLines || 3, names.length);
    for (var i = 0; i < n; i++) out.push({ id: SC.uid(), name: names[i] || "", system: "", counted: "" });
    return out;
  }
  function newCheck() {
    var ops = ""; try { ops = localStorage.getItem("sc_ops") || ""; } catch (e) {}
    return {
      id: SC.uid(), createdAt: Date.now(), updatedAt: Date.now(), status: "draft",
      store: "", opsManager: ops, date: today(), period: "", totalStock: "", sales: "", gp: "",
      calc: { opening: "", purchases: "", tin: "", tout: "", closing: "" }, gpNotes: "",
      categories: (cfg.categories || []).map(function (c) { return { id: SC.uid(), name: c.name, custom: false, lines: blankLines(c.lines || []), photos: [] }; }),
      wastage: { amount: "", notes: "", photos: [] }, generalPhotos: [],
      actions: "", storeManager: "", sigOps: null, sigStore: null
    };
  }
  function saveBanner(msg) { var b = $("#save-banner"); if (!b) return; if (msg) { b.textContent = msg; b.hidden = false; } else b.hidden = true; }
  // Resolves true when saved, false when NOT saved (the user is always told).
  function persist(target) {
    target = target || sc; if (!target) return Promise.resolve(true);
    target.updatedAt = Date.now();
    return SC.store.put(target).then(function () {
      saveBanner(null); var s = $("#saved"); if (s) { s.textContent = "Saved \u2713"; s.style.color = ""; } return true;
    }).catch(function (err) {
      var quota = err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message || err)));
      saveBanner(quota ? "NOT SAVED - this phone's storage is full. Export and delete old spot checks or remove photos." : "NOT SAVED - could not write to this phone's storage. Do not close the app; export the PDF now.");
      var s = $("#saved"); if (s) { s.textContent = "NOT SAVED"; s.style.color = "#d33b3b"; }
      return false;
    });
  }
  function queueSave() { var s = $("#saved"); if (s) { s.textContent = "Saving\u2026"; s.style.color = ""; } if (sc && sc.status === "exported") sc.status = "draft"; clearTimeout(saveTimer); saveTimer = setTimeout(function () { persist(); }, 150); }
  function flush() { if (sc && !$("#screen-form").hidden) { clearTimeout(saveTimer); persist(); } }
  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);

  function progress(c) {
    var need = cfg.mandatoryLines || 3, total = 0, done = 0;
    c.categories.forEach(function (cat) {
      if (cat.na) { total += need; done += need; return; }
      for (var i = 0; i < need; i++) { total++; var l = cat.lines[i]; if (l && l.name.trim() && SC.num(l.system) !== null && SC.num(l.counted) !== null) done++; }
    });
    return { total: total, done: done };
  }

  /* ---------------- home ---------------- */
  function homeError(err) {
    $("#screen-home").innerHTML = "<div class='card'><h3 style='color:#d33b3b;margin-top:0'>Cannot open saved spot checks</h3><p>This browser is blocking storage (private browsing, or storage is full/disabled). Open the app in a normal (non-private) tab, or free up space, then try again.</p><button class='btn' id='btn-retry'>Try again</button></div>";
    $("#btn-retry").onclick = function () { location.reload(); };
  }
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; if ($("#screen-home") && !$("#screen-home").hidden) renderHome(); });
  window.addEventListener("appinstalled", function () { deferredInstall = null; try { localStorage.setItem("sc_installed", "1"); } catch (e) {} if (!$("#screen-home").hidden) renderHome(); });
  function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
  function isIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function iosTip() {
    var dismissed = false; try { dismissed = localStorage.getItem("sc_installed") === "1" || Date.now() - Number(localStorage.getItem("sc_instdismiss") || 0) < 7 * 864e5; } catch (e) {}
    if (isStandalone() || dismissed) return "";
    if (!deferredInstall && !isIos()) return "";   // browsers that cannot install: show nothing
    return "<div class='card install'><b>Add Spot Check to your " + (isIos() ? "Home Screen" : "device") + "</b><p class='muted' style='margin:6px 0'>Opens like an app, works offline" + (isIos() ? " and keeps your drafts safe." : ".") + "</p>" +
      "<div class='actions'><button class='btn pink small' id='btn-install'>Install app</button><button class='btn light small' id='btn-tipx'>Not now</button></div></div>";
  }
  function installNow() {
    if (deferredInstall) {
      var p = deferredInstall; deferredInstall = null; p.prompt();
      p.userChoice.then(function (r) { if (r.outcome === "accepted") { try { localStorage.setItem("sc_installed", "1"); } catch (e) {} } renderHome(); });
      return;
    }
    infoBox("Add to Home Screen", "<p style='margin:0 0 4px'><b>1.</b> Tap <b>Share</b> at the bottom of <b>Safari</b> (top right on iPad).</p>" + "<svg viewBox='0 0 300 70' width='100%' role='img' aria-label='Safari bottom bar with the Share button highlighted'><rect x='1' y='14' width='298' height='52' rx='14' fill='#f2f2f7' stroke='#d0d3dc'/><g fill='none' stroke='#8a90a2' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M38 40l8-8m-8 8l8 8m-8-8h16'/><path d='M92 32l8 8-8 8M100 40H84' transform='translate(0 0)'/><path d='M232 32h10v18h-24V32h10' transform='translate(-4 -2)'/><rect x='262' y='30' width='16' height='16' rx='3'/></g><circle cx='150' cy='40' r='21' fill='#F04C86' opacity='.18'/><circle cx='150' cy='40' r='21' fill='none' stroke='#F04C86' stroke-width='2.5'/><g fill='none' stroke='#1E408C' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='M150 46V29m-6 5l6-6 6 6'/><path d='M141 36h-3v13h24V36h-3'/></g><path d='M150 3v10m-5-5l5 5 5-5' stroke='#F04C86' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>" + "<p style='margin:12px 0 4px'><b>2.</b> Scroll down and tap <b>Add to Home Screen</b>.</p>" + "<svg viewBox='0 0 300 120' width='100%' role='img' aria-label='Share menu with Add to Home Screen highlighted'><rect x='1' y='1' width='298' height='118' rx='14' fill='#f2f2f7' stroke='#d0d3dc'/><rect x='14' y='12' width='272' height='28' rx='8' fill='#fff'/><text x='26' y='31' font-size='13' fill='#555' font-family='sans-serif'>Add Bookmark</text><rect x='10' y='46' width='280' height='34' rx='9' fill='#F04C86' opacity='.16' stroke='#F04C86' stroke-width='2.5'/><text x='26' y='68' font-size='14' font-weight='700' fill='#1E408C' font-family='sans-serif'>Add to Home Screen</text><g fill='none' stroke='#1E408C' stroke-width='2.2' stroke-linecap='round'><rect x='256' y='54' width='18' height='18' rx='4'/><path d='M265 58v10m-5-5h10'/></g><rect x='14' y='86' width='272' height='24' rx='8' fill='#fff'/><text x='26' y='103' font-size='13' fill='#555' font-family='sans-serif'>Find on Page</text></svg>" + "<p style='margin:12px 0 4px'><b>3.</b> Tap <b>Add</b>, then open the app from the new icon.</p>" + "<svg viewBox='0 0 300 56' width='100%' role='img' aria-label='Add button at the top right'><rect x='1' y='1' width='298' height='54' rx='14' fill='#f2f2f7' stroke='#d0d3dc'/><text x='18' y='34' font-size='14' fill='#8a90a2' font-family='sans-serif'>Cancel</text><text x='78' y='33' font-size='12' font-weight='700' fill='#333' font-family='sans-serif'>Add to Home Screen</text><rect x='236' y='12' width='52' height='32' rx='16' fill='#F04C86' opacity='.16' stroke='#F04C86' stroke-width='2.5'/><text x='250' y='34' font-size='14' font-weight='700' fill='#1E408C' font-family='sans-serif'>Add</text></svg>" + "<p class='muted' style='margin-top:10px'>It must be Safari &mdash; Chrome on iPhone cannot add apps to the Home Screen.</p>");
  }
  function renderHome() {
    SC.store.all().then(function (list) {
      var max = cfg.maxSaved || 10;
      var h = iosTip() + "<h2>Spot checks on this phone <span class='muted'>(" + list.length + "/" + max + ")</span></h2>";
      h += "<button class='btn pink' id='btn-new'>+ New spot check</button><div style='height:14px'></div>";
      if (!list.length) h += "<div class='empty'>Nothing saved yet.<br>Start a spot check &mdash; it is saved automatically as you type, so you can leave and come back.</div>";
      list.forEach(function (c) {
        var p = progress(c);
        h += "<div class='card draft' data-open='" + c.id + "'><div class='info'><div class='store'>" + esc(c.store || "No shop selected") + "</div>" +
          "<div class='meta'>" + esc(fmtDate(c.date)) + (c.opsManager ? " &middot; " + esc(c.opsManager) : "") + "</div>" +
          "<div style='margin-top:6px'>" + (c.status === "exported" ? "<span class='badge ok'>PDF exported</span> " : "") + "<span class='badge'>" + p.done + "/" + p.total + " required lines</span></div></div>" +
          "<button class='x' data-del='" + c.id + "' aria-label='Delete'>&#10005;</button></div>";
      });
      h += "<p class='muted center' style='margin-top:20px'>Everything is stored on this phone only. Export the PDF, send it, then delete the spot check.</p>";
      h += "<div class='ver'><div class='muted'>Version " + SC.BUILD + "</div><button id='btn-checkupd'>Check for the latest version</button></div>";
      $("#screen-home").innerHTML = h;
      $("#btn-checkupd").onclick = checkUpdate;
      var tx = $("#btn-tipx"); if (tx) tx.onclick = function () { try { localStorage.setItem("sc_instdismiss", String(Date.now())); } catch (e) {} renderHome(); };
      var ib = $("#btn-install"); if (ib) ib.onclick = installNow;
      $("#btn-new").onclick = function () {
        if (list.length >= max) { infoBox("Storage full", "<p>You can keep up to <b>" + max + "</b> spot checks on this phone. Export or delete one first.</p>"); return; }
        sc = newCheck(); persist().then(function (ok) { if (ok) openForm(); else { infoBox("Cannot start a spot check", "<p>Nothing can be saved on this phone right now (storage full or blocked). Free up space and try again.</p>"); sc = null; } });
      };
      Array.prototype.forEach.call(document.querySelectorAll("[data-open]"), function (el) {
        el.onclick = function (e) {
          if (e.target.closest("[data-del]")) return;
          SC.store.get(el.getAttribute("data-open")).then(function (c) { if (!c) { renderHome(); return; } sc = c; openForm(); }).catch(homeError);
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-del]"), function (el) {
        el.onclick = function () {
          var id = el.getAttribute("data-del");
          confirmBox("Delete spot check?", "This permanently removes it (and its photos) from this phone.", "Delete", true).then(function (ok) { if (ok) SC.store.del(id).then(renderHome, function () { infoBox("Could not delete", "<p>Try again.</p>"); }); });
        };
      });
    }).catch(homeError);
    show("home");
  }

  /* ---------------- form ---------------- */
  function photoUrl(p) { if (!urls[p.id]) urls[p.id] = URL.createObjectURL(p.blob); return urls[p.id]; }
  function photosHtml(key, arr) {
    var h = "<div class='photos'>";
    arr.forEach(function (p, i) {
      h += "<div class='ph'><img src='" + photoUrl(p) + "' alt=''><button class='rm' data-rmph='" + key + "' data-i='" + i + "' aria-label='Remove photo'>&#10005;</button>" +
        "<input type='text' placeholder='Note' value='" + esc(p.caption || "") + "' data-cap='" + key + "' data-i='" + i + "'></div>";
    });
    h += "</div><label class='addphoto'>&#128247; Add photos<input type='file' accept='image/*' multiple data-addph='" + key + "'></label>";
    return h;
  }
  function photoArrOf(d, key) {
    if (key === "general") return d.generalPhotos;
    if (key === "wastage") return d.wastage.photos;
    return d.categories[parseInt(key.slice(1), 10)].photos;
  }
  function photoArr(key) { return photoArrOf(sc, key); }
  function lineHtml(ci, li, l) {
    var need = cfg.mandatoryLines || 3, req = li < need, v = SC.variance(l);
    return "<div class='line'><div class='row'>" +
      "<div class='nm'><input type='text' placeholder='Item' maxlength='60' value='" + esc(l.name) + "' data-ci='" + ci + "' data-li='" + li + "' data-k='name' data-req='" + (req ? 1 : 0) + "'></div>" +
      "<div class='numwrap'><input class='num' type='text' inputmode='decimal' placeholder='System' value='" + esc(l.system) + "' data-ci='" + ci + "' data-li='" + li + "' data-k='system' data-req='" + (req ? 1 : 0) + "'><button type='button' class='neg' tabindex='-1' data-neg='" + ci + "," + li + ",system' aria-label='Toggle minus'>&plusmn;</button></div>" +
      "<div class='numwrap'><input class='num' type='text' inputmode='decimal' placeholder='Counted' value='" + esc(l.counted) + "' data-ci='" + ci + "' data-li='" + li + "' data-k='counted' data-req='" + (req ? 1 : 0) + "'><button type='button' class='neg' tabindex='-1' data-neg='" + ci + "," + li + ",counted' aria-label='Toggle minus'>&plusmn;</button></div>" +
      "<div class='var " + (v < 0 ? "neg" : v > 0 ? "pos" : "") + "' id='var-" + ci + "-" + li + "'>" + (v === null ? "&ndash;" : SC.fmtVar(v)) + "</div></div>" +
      (req ? "" : "<div style='text-align:right'><button class='x' style='font-size:13px' data-rmline='" + ci + "," + li + "'>Remove line</button></div>") + "</div>";
  }
  function calcInputs() {
    var c = sc.calc, closingRaw = String(c.closing).trim() ? c.closing : sc.totalStock;
    var v = { opening: SC.num(c.opening), purchases: SC.num(c.purchases), tin: SC.num(c.tin), tout: SC.num(c.tout), closing: SC.num(closingRaw), sales: SC.num(sc.sales) };
    var missing = [];
    if (v.opening === null) missing.push("Opening stock *");
    if (v.purchases === null) missing.push("Purchases *");
    if (v.closing === null) missing.push("Closing stock * (type it here or fill Total closing stock value above)");
    if (v.sales === null || v.sales === 0) missing.push("Vitamojo gross sales (field above, must be more than 0)");
    return { v: v, missing: missing };
  }
  function calcResult() {
    var i = calcInputs(); if (i.missing.length) return null;
    var v = i.v, cost = v.opening + v.purchases + (v.tin || 0) - (v.tout || 0) - v.closing, coi = cost / v.sales * 100;
    return { cost: cost, coi: coi, gp: 100 - coi };
  }
  function calcText() {
    var r = calcResult();
    if (r) return "Cost of sales &pound;" + SC.fmtNum(r.cost) + " &middot; COI " + SC.fmtNum(r.coi) + "% &middot; <b>GP " + SC.fmtNum(r.gp) + "%</b>" + (sc.gpManual ? "" : " &mdash; filled in above");
    return "<b>To calculate GP you are missing:</b><ul style='margin:6px 0 0;padding-left:20px'><li>" + calcInputs().missing.join("</li><li>") + "</li></ul>";
  }
  function updateCalc() {
    var out = $("#calc-out"); if (out) out.innerHTML = calcText();
    var ci = $("[data-calc=closing]"); if (ci) ci.placeholder = String(sc.totalStock).trim() ? sc.totalStock + " (from above)" : "";
    var r = calcResult();
    if (r && !sc.gpManual) {
      sc.gp = SC.fmtNum(r.gp); var gi = $("[data-f=gp]"); if (gi) gi.value = sc.gp;
    }
  }

  function renderForm() {
    var y = window.scrollY, c = sc, h = "";
    var shops = (cfg.shops || []).slice();
    if (c.store && shops.indexOf(c.store) < 0) shops.push(c.store);
    h += "<div class='card'><label class='f'>Store<select data-f='store' data-req='1'><option value=''>Select shop&hellip;</option>" +
      shops.map(function (s) { return "<option" + (s === c.store ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select></label>" +
      "<label class='f'>Ops manager<input type='text' data-f='opsManager' maxlength='40' data-req='1' value='" + esc(c.opsManager) + "' placeholder='Your name' autocomplete='name'></label>" +
      "<label class='f'>Store manager<input type='text' data-f='storeManager' maxlength='40' value='" + esc(c.storeManager) + "' placeholder='Store manager name'></label>" +
      "<div class='grid2'><label class='f'>Date<input type='date' data-f='date' data-req='1' value='" + esc(c.date) + "'></label>" +
      "<label class='f'>Period<input type='text' data-f='period' maxlength='20' value='" + esc(c.period) + "' placeholder='e.g. Wk 47'></label></div></div>";

    h += "<div class='sec'><span class='num'>1</span><h3>Stock value, Vitamojo sales and GP</h3><span class='rule'></span></div>";
    h += "<div class='card'><div class='grid2'>" +
      "<label class='f'>Total closing stock value<div class='money'><span>&pound;</span><input type='text' inputmode='decimal' data-f='totalStock' value='" + esc(c.totalStock) + "'></div></label>" +
      "<label class='f'>Vitamojo gross sales<div class='money'><span>&pound;</span><input type='text' inputmode='decimal' data-f='sales' value='" + esc(c.sales) + "'></div></label></div>" +
      "<label class='f'>GP %<div class='money'><input type='text' inputmode='decimal' data-f='gp' value='" + esc(c.gp) + "' style='padding-left:12px'></div></label>" +
      "<div class='gpbox'><b>How to calculate GP</b><br>1. Cost of sales = Opening stock + Purchases + Transfers in &minus; Transfers out &minus; Closing stock<br>2. COI % = Cost of sales / Sales &times; 100<br>3. GP % = 100 &minus; COI %<br>Example: cost 30% &rarr; GP 70%</div>" +
      "<details class='calc'><summary>GP calculator (optional)</summary><p class='muted' style='margin:8px 0 0'><b>*</b> Required if you use the calculator. Sales and Closing stock are also taken from the fields above. Transfers are optional (blank = 0).</p><div class='grid2' style='margin-top:10px'>" +
      ["opening:Opening stock *", "purchases:Purchases *", "tin:Transfers in", "tout:Transfers out", "closing:Closing stock *"].map(function (s) {
        var p = s.split(":"), ph = p[0] === "closing" && String(c.totalStock).trim() ? " placeholder='" + esc(c.totalStock) + " (from above)'" : (p[0] === "tin" || p[0] === "tout" ? " placeholder='0'" : "");
        return "<label class='f'>" + p[1] + " &pound;<input type='text' inputmode='decimal' data-calc='" + p[0] + "' value='" + esc(c.calc[p[0]]) + "'" + ph + "></label>";
      }).join("") + "</div><div id='calc-out' class='muted' style='margin:10px 0'>" + calcText() + "</div><button class='btn light small' id='btn-usegp'>Recalculate &amp; fill GP %</button></details>" +
      "<label class='f'>GP discussed with the team (notes)<textarea data-f='gpNotes'>" + esc(c.gpNotes) + "</textarea></label></div>";

    h += "<div class='sec'><span class='num'>2</span><h3>Line-by-line check: " + (cfg.mandatoryLines || 3) + " lines per category</h3><span class='rule'></span></div>";
    c.categories.forEach(function (cat, ci) {
      h += "<div class='card blue'><div class='card-head'><span class='t'>" + esc(cat.name) + "</span><span class='cols'><span>System</span><span>Counted</span><span>Var.</span></span></div><div class='card-body'>";
      h += "<label class='na'><input type='checkbox' data-na='" + ci + "'" + (cat.na ? " checked" : "") + "> Not used in this shop</label>";
      if (cat.na) h += "<p class='muted' style='margin:4px 0 10px'>Marked as not applicable &mdash; no lines needed. Untick to count it.</p>";
      else cat.lines.forEach(function (l, li) { h += lineHtml(ci, li, l); });
      h += "<div class='actions'>" + (cat.na ? "" : "<button class='btn light small' data-addline='" + ci + "'>+ Add line</button>") + (cat.custom ? "<button class='btn danger small' data-rmcat='" + ci + "'>Remove category</button>" : "") + "</div>" + photosHtml("c" + ci, cat.photos) + "</div></div>";
    });
    if (cfg.wastage !== false) {
      h += "<div class='card blue'><div class='card-head pink'><span class='t'>Weekly wastage (shop visit)</span></div><div class='card-body'>" +
        "<label class='f'>Wastage value<div class='money'><span>&pound;</span><input type='text' inputmode='decimal' data-w='amount' value='" + esc(c.wastage.amount) + "'></div></label>" +
        "<label class='f'>Notes<textarea data-w='notes'>" + esc(c.wastage.notes) + "</textarea></label>" + photosHtml("wastage", c.wastage.photos) + "</div></div>";
    }
    h += "<button class='btn light' id='btn-addcat'>+ Add category</button>";
    h += "<div class='card' style='margin-top:12px'><div class='tag'>Other photos</div>" + photosHtml("general", c.generalPhotos) + "</div>";

    h += "<div class='sec'><span class='num'>3</span><h3>Actions and sign-off</h3><span class='rule'></span></div>";
    h += "<div class='card'><label class='f'>Actions<textarea data-f='actions' style='min-height:110px'>" + esc(c.actions) + "</textarea></label>" +
      "<div class='tag'>Ops manager signature</div><canvas class='sig' id='sig-ops'></canvas><button class='btn light small' data-clearsig='sigOps' style='margin:6px 0 14px'>Clear</button>" +
      "<div class='tag'>Store manager signature</div><canvas class='sig' id='sig-store'></canvas><button class='btn light small' data-clearsig='sigStore' style='margin-top:6px'>Clear</button></div>";

    h += "<div class='sticky-bar'><span class='saved' id='saved'>Saved &#10003;</span><button class='btn light' id='btn-save' style='flex:1'>Save &amp; close</button><button class='btn pink' id='btn-export' style='flex:1.4'>Export PDF</button></div>";
    var root = $("#screen-form"); root.innerHTML = h;
    initSig("sig-ops", "sigOps"); initSig("sig-store", "sigStore");
    window.scrollTo(0, y);
  }

  function initSig(id, key) {
    var cv = document.getElementById(id), dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.parentNode.clientWidth || 300, hh = cv.clientHeight || 130; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
    var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#16316d";
    if (sc[key]) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, w, hh); }; im.src = sc[key]; }
    var drawing = false, lx = 0, ly = 0;
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener("pointerdown", function (e) { drawing = true; cv.setPointerCapture(e.pointerId); var p = pos(e); lx = p[0]; ly = p[1]; ctx.beginPath(); ctx.arc(lx, ly, 1, 0, 6.3); ctx.stroke(); e.preventDefault(); });
    cv.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p[0], p[1]); ctx.stroke(); lx = p[0]; ly = p[1]; e.preventDefault(); });
    function end() { if (!drawing) return; drawing = false; if (!cv.width || !cv.height) return; var d = cv.toDataURL("image/png"); if (d && d.length > 200) { sc[key] = d; queueSave(); } }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  function processPhoto(file) {
    return new Promise(function (resolve, reject) {
      function draw(src, w, h) {
        var s = Math.min(1, 1600 / Math.max(w, h)), cw = Math.round(w * s), ch = Math.round(h * s);
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
        cv.toBlob(function (b) { b ? resolve({ id: SC.uid(), blob: b, w: cw, h: ch, caption: "" }) : reject(new Error("blob")); }, "image/jpeg", 0.85);
      }
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: "from-image" }).then(function (b) { try { draw(b, b.width, b.height); } finally { if (b.close) b.close(); } }, fallback);
      } else fallback();
      function fallback() {
        var im = new Image(), u = URL.createObjectURL(file);
        im.onload = function () { draw(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); };
        im.onerror = reject; im.src = u;
      }
    });
  }

  function setupFormEvents() {
    var root = $("#screen-form");
    root.addEventListener("input", function (e) {
      var t = e.target; t.classList.remove("invalid");
      if (t.dataset.f) { sc[t.dataset.f] = t.value; if (t.dataset.f === "opsManager") { try { localStorage.setItem("sc_ops", t.value); } catch (er) {} } if (t.dataset.f === "gp") sc.gpManual = true; if (t.dataset.f === "sales" || t.dataset.f === "totalStock") updateCalc(); }
      else if (t.dataset.calc) { sc.calc[t.dataset.calc] = t.value; updateCalc(); }
      else if (t.dataset.w) { sc.wastage[t.dataset.w] = t.value; }
      else if (t.dataset.k) {
        var ci = +t.dataset.ci, li = +t.dataset.li, l = sc.categories[ci].lines[li]; l[t.dataset.k] = t.value;
        var v = SC.variance(l), el = $("#var-" + ci + "-" + li);
        el.textContent = v === null ? "–" : SC.fmtVar(v); el.className = "var " + (v < 0 ? "neg" : v > 0 ? "pos" : "");
      } else if (t.dataset.cap) { photoArr(t.dataset.cap)[+t.dataset.i].caption = t.value; }
      else return;
      queueSave();
    });
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset.f === "store" || t.dataset.f === "date") { sc[t.dataset.f] = t.value; t.classList.remove("invalid"); queueSave(); }
      if (t.dataset.na !== undefined) { sc.categories[+t.dataset.na].na = t.checked; queueSave(); renderForm(); return; }
      if (t.dataset.addph) {
        var files = Array.prototype.slice.call(t.files), key = t.dataset.addph, target = sc, added = 0, failed = 0;
        if (!files.length) return;
        toast("Adding photos\u2026");
        files.reduce(function (p, f) {
          return p.then(function () {
            return processPhoto(f).then(function (ph) { photoArrOf(target, key).push(ph); added++; }, function () { failed++; });
          });
        }, Promise.resolve()).then(function () { return persist(target); }).then(function (saved) {
          if (sc === target && !$("#screen-form").hidden) renderForm();
          if (failed) toast(added + " of " + files.length + " added - " + failed + " could not be read");
          else if (saved) toast(added + (added === 1 ? " photo added" : " photos added"));
        });
      }
    });
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.neg) {
        var np = t.dataset.neg.split(","), nl = sc.categories[+np[0]].lines[+np[1]], cur = String(nl[np[2]] || "");
        nl[np[2]] = cur.charAt(0) === "-" ? cur.slice(1) : "-" + cur;
        var ni = root.querySelector("[data-ci='" + np[0] + "'][data-li='" + np[1] + "'][data-k='" + np[2] + "']"); ni.value = nl[np[2]];
        var nv = SC.variance(nl), nel = $("#var-" + np[0] + "-" + np[1]); nel.textContent = nv === null ? "\u2013" : SC.fmtVar(nv); nel.className = "var " + (nv < 0 ? "neg" : nv > 0 ? "pos" : "");
        queueSave(); return;
      }
      if (t.dataset.addline !== undefined) { sc.categories[+t.dataset.addline].lines.push({ id: SC.uid(), name: "", system: "", counted: "" }); persist(); renderForm(); }
      else if (t.dataset.rmline) {
        var p = t.dataset.rmline.split(","); sc.categories[+p[0]].lines.splice(+p[1], 1); persist(); renderForm();
      } else if (t.dataset.rmcat !== undefined) {
        confirmBox("Remove category?", "This removes the category, its lines and photos.", "Remove", true).then(function (ok) { if (ok) { sc.categories.splice(+t.dataset.rmcat, 1); persist(); renderForm(); } });
      } else if (t.dataset.rmph) {
        photoArr(t.dataset.rmph).splice(+t.dataset.i, 1); persist(); renderForm();
      } else if (t.dataset.clearsig) { sc[t.dataset.clearsig] = null; persist(); renderForm(); }
      else if (t.id === "btn-addcat") {
        modal("<h3>Add category</h3><label class='f'>Category name<input type='text' id='m-cat' placeholder='e.g. Dry store'></label><div class='actions'><button class='btn small' id='m-ok'>Add</button><button class='btn light small' id='m-cancel'>Cancel</button></div>", function (c) {
          $("#m-cat", c).focus();
          $("#m-cancel", c).onclick = closeModal;
          $("#m-ok", c).onclick = function () {
            var n = $("#m-cat", c).value.trim(); if (!n) return;
            sc.categories.push({ id: SC.uid(), name: n, custom: true, lines: blankLines([]), photos: [] }); closeModal(); persist(); renderForm();
          };
        });
      } else if (t.id === "btn-usegp") {
        var r = calcResult(); if (!r) { toast("Fill the calculator first"); return; }
        sc.gpManual = false; updateCalc(); queueSave(); toast("GP % updated");
      } else if (t.id === "btn-save") { clearTimeout(saveTimer); persist().then(function () { sc = null; renderHome(); }); }
      else if (t.id === "btn-export") exportPdf();
    });
  }

  function openForm() {
    // old drafts: pad lines up to the current "mandatory lines" setting
    var need = cfg.mandatoryLines || 3;
    sc.categories.forEach(function (cat) { while (cat.lines.length < need) cat.lines.push({ id: SC.uid(), name: "", system: "", counted: "" }); });
    show("form"); renderForm();   // show first: canvases need a real size to measure
  }

  /* ---------------- validation + export ---------------- */
  function validate() {
    var errs = [], need = cfg.mandatoryLines || 3;
    if (!sc.store) errs.push({ m: "Select the store", q: "[data-f=store]" });
    if (!sc.opsManager.trim()) errs.push({ m: "Enter the ops manager name", q: "[data-f=opsManager]" });
    if (!sc.date) errs.push({ m: "Enter the date", q: "[data-f=date]" });
    sc.categories.forEach(function (cat, ci) {
      if (cat.na) return;
      var miss = 0, first = null;
      for (var i = 0; i < need; i++) {
        var l = cat.lines[i] || { name: "", system: "", counted: "" };
        ["name", "system", "counted"].forEach(function (k) {
          var bad = k === "name" ? !l.name.trim() : SC.num(l[k]) === null;
          if (bad) { miss++; var q = "[data-ci='" + ci + "'][data-li='" + i + "'][data-k='" + k + "']"; var el = $(q); if (el) el.classList.add("invalid"); if (!first) first = q; }
        });
      }
      if (miss) errs.push({ m: cat.name + ": " + need + " lines need item, system and counted", q: first });
    });
    return errs;
  }
  function warnings() {
    var w = [];
    if (!String(sc.totalStock).trim()) w.push("Total closing stock value is empty");
    if (!String(sc.sales).trim()) w.push("Vitamojo gross sales is empty");
    if (!String(sc.gp).trim()) w.push("GP % is empty");
    if (!sc.sigOps) w.push("Ops manager signature is missing");
    if (!sc.sigStore) w.push("Store manager signature is missing");
    var texts = [sc.store, sc.opsManager, sc.storeManager, sc.period, sc.gpNotes, sc.actions, sc.wastage.notes, sc.wastage.amount];
    sc.categories.forEach(function (c) { texts.push(c.name); c.lines.forEach(function (l) { texts.push(l.name, l.system, l.counted); }); c.photos.forEach(function (p) { texts.push(p.caption); }); });
    sc.wastage.photos.concat(sc.generalPhotos).forEach(function (p) { texts.push(p.caption); });
    if (texts.some(function (x) { return /[^\u0000-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2192\u2212]/.test(String(x || "")); })) w.push("Some characters (emoji or non-Latin letters) cannot be printed in the PDF and will appear as ?");
    return w;
  }
  function exportPdf() {
    Array.prototype.forEach.call(document.querySelectorAll(".invalid"), function (el) { el.classList.remove("invalid"); });
    var errs = validate();
    if (errs.length) {
      Array.prototype.forEach.call(document.querySelectorAll("[data-f=store],[data-f=opsManager],[data-f=date]"), function (el) { if (!el.value) el.classList.add("invalid"); });
      infoBox("Complete these first", "<ul>" + errs.map(function (e) { return "<li>" + esc(e.m) + "</li>"; }).join("") + "</ul>").then(function () {
        var el = $(errs[0].q); if (el) { el.scrollIntoView({ block: "center" }); }
      });
      return;
    }
    var w = warnings(), go = w.length ? confirmBox("Export anyway?", "<ul>" + w.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>", "Export anyway") : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      toast("Building PDF…");
      return persist().then(function () { return SC.buildPdf(sc, cfg); }).then(function (blob) {
        pdfBlob = blob; pdfName = "HoniPoke_SpotCheck_" + sc.store.replace(/[^A-Za-z0-9]+/g, "") + "_" + sc.date + ".pdf";
        sc.status = "exported"; sc.exportedAt = Date.now(); return persist();
      }).then(renderDone).catch(function (err) { console.error(err); infoBox("Could not build the PDF", "<p>" + esc(err && err.message || err) + "</p>"); });
    });
  }

  function renderDone() {
    $("#screen-done").innerHTML =
      "<h2>PDF ready &#10003;</h2><div class='card'><b>" + esc(pdfName) + "</b><div class='muted'>" + (pdfBlob.size / 1024 / 1024).toFixed(2) + " MB &middot; " + esc(sc.store) + " &middot; " + esc(fmtDate(sc.date)) + "</div></div>" +
      "<button class='btn pink' id='d-share'>Share / save PDF</button><div style='height:10px'></div>" +
      "<button class='btn light' id='d-open'>Open PDF</button><div style='height:10px'></div>" +
      "<button class='btn light' id='d-back'>&larr; Back to spot check</button><div style='height:10px'></div>" +
      "<button class='btn danger' id='d-del'>Delete this spot check from the phone</button>" +
      "<p class='muted center'>After you save or share the PDF you will be asked whether to delete the spot check.</p>";
    $("#d-share").onclick = sharePdf;
    if (window.navigator.standalone === true) $("#d-open").hidden = true;   // iOS home-screen apps cannot navigate back from a PDF tab
    $("#d-open").onclick = function () { window.open(URL.createObjectURL(pdfBlob), "_blank"); };
    $("#d-back").onclick = function () { openForm(); };
    $("#d-del").onclick = function () { askDelete(); };
    show("done");
  }
  function sharePdf() {
    var file = new File([pdfBlob], pdfName, { type: "application/pdf" });
    function download() {
      var a = document.createElement("a"); a.href = URL.createObjectURL(pdfBlob); a.download = pdfName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { askDelete(true); }, 1200);
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: pdfName }).then(function () { askDelete(); }).catch(function (e) { if (e && e.name !== "AbortError") download(); });
    } else download();
  }
  function askDelete(afterDownload) {
    var q = afterDownload === true
      ? confirmBox("Did the PDF save?", "Check your Downloads or Files app. Only delete the spot check if you can see the PDF there. This removes the spot check and its photos from this phone.", "Yes, I have the PDF - delete", true)
      : confirmBox("Delete from this phone?", "Only delete if you have saved or sent the PDF. This removes the spot check and its photos from this phone.", "Yes, delete", true);
    q.then(function (ok) {
      if (!ok) return;
      SC.store.del(sc.id).then(function () { sc = null; pdfBlob = null; toast("Deleted"); renderHome(); });
    });
  }

  /* ---------------- updates (drafts live in IndexedDB and survive an update) ---------------- */
  var swReg = null, reloading = false;
  function showUpdate() { $("#update-banner").hidden = false; }
  function applyUpdate() {
    clearTimeout(saveTimer);
    var done = function () {
      if (swReg && swReg.waiting) swReg.waiting.postMessage("SKIP_WAITING"); else location.reload();
    };
    (sc ? persist() : Promise.resolve()).then(done, done);
  }
  function checkUpdate() {
    if (!swReg) { toast("Updates not available in this browser"); return; }
    toast("Checking\u2026");
    swReg.update().then(function () {
      setTimeout(function () {
        if (swReg.waiting) { showUpdate(); toast("New version found"); } else toast("You have the latest version");
      }, 1500);
    }).catch(function () { toast("No connection - try again later"); });
  }
  function initSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
      reg.addEventListener("updatefound", function () {
        var w = reg.installing;
        w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(); });
      });
      reg.update().catch(function () {});
    }).catch(function () {});
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (hadController && !reloading) { reloading = true; location.reload(); } });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && swReg) swReg.update().catch(function () {}); });
  }
  $("#btn-update-now").onclick = applyUpdate;

  $("#btn-home").onclick = function () { flush(); setTimeout(function () { sc = null; renderHome(); }, 80); };

  SC.loadConfig().then(function (c) {
    cfg = c; setupFormEvents(); renderHome(); initSW();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  });
  window.__sc = { get sc() { return sc; }, get cfg() { return cfg; } };
})();
