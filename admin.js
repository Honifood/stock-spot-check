/* Admin panel: edit shops, categories and settings; publish config.json to GitHub */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var cfg = null, root = $("#root");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || SC.uid(); }
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem("scadm_" + k) || ""; localStorage.setItem("scadm_" + k, v); } catch (e) { return ""; } }

  /* ---- PIN gate ---- */
  function gate() {
    var hash = cfg.adminPinHash;
    root.innerHTML = "<h2>" + (hash ? "Enter admin PIN" : "Create an admin PIN") + "</h2><div class='card'>" +
      "<label class='f'>" + (hash ? "PIN" : "Choose a PIN (min 4 characters)") + "<input type='password' id='pin' autocomplete='off'></label>" +
      "<button class='btn' id='go'>" + (hash ? "Unlock" : "Create PIN") + "</button><p class='muted' id='msg'></p></div>" +
      (hash ? "" : "<p class='muted'>The PIN is saved in config.json when you publish. Publish straight after creating it.</p>");
    $("#go").onclick = function () {
      var v = $("#pin").value;
      if (v.length < 4) { $("#msg").textContent = "Too short."; return; }
      SC.sha256(v).then(function (h) {
        if (!hash) { cfg.adminPinHash = h; sessionStorage.setItem("sc_adm", "1"); main(); }
        else if (h === hash) { sessionStorage.setItem("sc_adm", "1"); main(); }
        else $("#msg").textContent = "Wrong PIN.";
      });
    };
  }

  /* ---- main editor ---- */
  function main() {
    var h = "<h2>Shops <span class='muted'>(" + cfg.shops.length + ")</span></h2><div class='card'><p class='muted' style='margin-top:0'>This is the exact order managers see in the dropdown. Use the arrows to reorder.</p>";
    cfg.shops.forEach(function (sh, i) {
      h += "<div class='row2'><input type='text' value='" + esc(sh) + "' data-sname='" + i + "'>" +
        "<button class='x' data-sup='" + i + "'>&uarr;</button><button class='x' data-sdown='" + i + "'>&darr;</button><button class='x' data-rmshop='" + i + "'>&#10005;</button></div>";
    });
    h += "<div class='row2' style='margin-top:12px'><textarea id='newshop' style='min-height:48px;margin:0' placeholder='Add shop (or paste several, one per line)'></textarea><button class='btn small' id='addshop'>Add</button></div></div>";

    h += "<h2>Categories</h2>";
    cfg.categories.forEach(function (c, i) {
      h += "<div class='card'><div class='row2'><input type='text' value='" + esc(c.name) + "' data-cname='" + i + "'>" +
        "<button class='x' data-up='" + i + "'>&uarr;</button><button class='x' data-down='" + i + "'>&darr;</button><button class='x' data-rmcat='" + i + "'>&#10005;</button></div>" +
        "<label class='f'>Pre-filled item names (one per line, optional)<textarea data-clines='" + i + "' style='min-height:60px'>" + esc((c.lines || []).join("\n")) + "</textarea></label></div>";
    });
    h += "<button class='btn light' id='addcat'>+ Add category</button>";

    h += "<h2 style='margin-top:24px'>Settings</h2><div class='card'>" +
      "<label class='f'>Mandatory lines per category<input type='number' min='1' max='10' id='s-mand' value='" + cfg.mandatoryLines + "'></label>" +
      "<label class='f'>Max spot checks stored per phone<input type='number' min='1' max='30' id='s-max' value='" + cfg.maxSaved + "'></label>" +
      "<label class='f' style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='s-waste' style='width:auto;margin:0' " + (cfg.wastage !== false ? "checked" : "") + "> Include weekly wastage section</label>" +
      "<button class='btn light small' id='chpin'>Change admin PIN</button></div>";

    h += "<h2>Publish</h2><div class='card'><p class='muted'>Publishing saves config.json to GitHub. Phones pick up shop/category changes the next time they open the app (no update button needed).</p>" +
      "<label class='f'>GitHub owner<input type='text' id='g-owner' value='" + esc(pref("owner") || "Honifood") + "'></label>" +
      "<label class='f'>Repository<input type='text' id='g-repo' value='" + esc(pref("repo") || "stock-spot-check") + "'></label>" +
      "<label class='f'>Branch<input type='text' id='g-branch' value='" + esc(pref("branch") || "main") + "'></label>" +
      "<label class='f'>GitHub token - paste it here<input type='password' id='g-token' value='" + esc(pref("token")) + "' placeholder='github_pat_...'></label>" +
      "<p class='muted'>Create it at github.com/settings/personal-access-tokens/new: repository access = only this repo, permission Contents = Read and write. It is stored only in this browser; use it only on your own device.</p>" +
      "<div class='actions'><button class='btn pink' id='publish'>Publish to GitHub</button><button class='btn light' id='download'>Download config.json</button></div><div id='status'></div></div>";
    root.innerHTML = h;
    bind();
  }

  function addShops(txt) {
    txt.split(/\n|;/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) {
      if (!cfg.shops.some(function (x) { return x.toLowerCase() === s.toLowerCase(); })) cfg.shops.push(s);
    });
  }
  function readSettings() {
    if (!$("#s-mand")) return;
    cfg.mandatoryLines = Math.max(1, parseInt($("#s-mand").value, 10) || 3);
    cfg.maxSaved = Math.max(1, parseInt($("#s-max").value, 10) || 10);
    cfg.wastage = $("#s-waste").checked;
  }
  function bind() {
    root.onclick = function (e) {
      var t = e.target.closest("button"); if (!t) return;
      readSettings();
      if (t.dataset.rmshop) { var si = +t.dataset.rmshop; if (confirm("Remove " + cfg.shops[si] + "?")) { cfg.shops.splice(si, 1); main(); } }
      else if (t.dataset.sup) { var a = +t.dataset.sup; if (a > 0) { cfg.shops.splice(a - 1, 0, cfg.shops.splice(a, 1)[0]); main(); } }
      else if (t.dataset.sdown) { var b2 = +t.dataset.sdown; if (b2 < cfg.shops.length - 1) { cfg.shops.splice(b2 + 1, 0, cfg.shops.splice(b2, 1)[0]); main(); } }
      else if (t.id === "addshop") { addShops($("#newshop").value); main(); }
      else if (t.dataset.rmcat) { if (confirm("Remove category " + cfg.categories[+t.dataset.rmcat].name + "?")) { cfg.categories.splice(+t.dataset.rmcat, 1); main(); } }
      else if (t.dataset.up) { var i = +t.dataset.up; if (i > 0) { cfg.categories.splice(i - 1, 0, cfg.categories.splice(i, 1)[0]); main(); } }
      else if (t.dataset.down) { var j = +t.dataset.down; if (j < cfg.categories.length - 1) { cfg.categories.splice(j + 1, 0, cfg.categories.splice(j, 1)[0]); main(); } }
      else if (t.id === "addcat") { var n = prompt("Category name"); if (n && n.trim()) { cfg.categories.push({ id: slug(n) + "-" + SC.uid().slice(-3), name: n.trim(), lines: [] }); main(); } }
      else if (t.id === "chpin") { var p = prompt("New PIN (min 4 characters)"); if (p && p.length >= 4) SC.sha256(p).then(function (h) { cfg.adminPinHash = h; status("PIN changed - publish to save it.", true); }); }
      else if (t.id === "download") { download(); }
      else if (t.id === "publish") { publish(); }
    };
    root.oninput = function (e) {
      var t = e.target;
      if (t.dataset.sname) cfg.shops[+t.dataset.sname] = t.value;
      else if (t.dataset.cname) cfg.categories[+t.dataset.cname].name = t.value;
      else if (t.dataset.clines) cfg.categories[+t.dataset.clines].lines = t.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    };
  }
  function status(msg, ok) { var s = $("#status"); s.textContent = msg; s.style.color = ok ? "var(--green)" : "var(--red)"; }
  function json() { readSettings(); cfg.version = (cfg.version || 1) + 1; return JSON.stringify(cfg, null, 2) + "\n"; }
  function download() {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json()], { type: "application/json" })); a.download = "config.json"; a.click();
    status("Downloaded. Upload it to the repo root to publish.", true);
  }
  function b64(str) { var b = new TextEncoder().encode(str), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function publish() {
    var o = $("#g-owner").value.trim(), r = $("#g-repo").value.trim(), b = $("#g-branch").value.trim() || "main", tk = $("#g-token").value.trim();
    if (!o || !r || !tk) { status("Owner, repository and token are required.", false); return; }
    pref("owner", o); pref("repo", r); pref("branch", b); pref("token", tk);
    var url = "https://api.github.com/repos/" + o + "/" + r + "/contents/config.json", hd = { Authorization: "Bearer " + tk, Accept: "application/vnd.github+json" };
    status("Publishing…", true);
    fetch(url + "?ref=" + encodeURIComponent(b), { headers: hd }).then(function (res) { return res.ok ? res.json() : (res.status === 404 ? {} : Promise.reject(new Error("GitHub " + res.status))); })
      .then(function (cur) {
        var body = { message: "Update spot check config", content: b64(json()), branch: b }; if (cur.sha) body.sha = cur.sha;
        return fetch(url, { method: "PUT", headers: hd, body: JSON.stringify(body) });
      })
      .then(function (res) { if (!res.ok) return res.text().then(function (t) { throw new Error("GitHub " + res.status + " " + t.slice(0, 120)); }); status("Published ✓ Phones will see it in about a minute.", true); })
      .catch(function (err) { status("Failed: " + err.message, false); });
  }

  SC.loadConfig().then(function (c) {
    cfg = c; cfg.shops = cfg.shops || []; cfg.categories = cfg.categories || [];
    if (sessionStorage.getItem("sc_adm") && cfg.adminPinHash) main(); else gate();
  });
})();
