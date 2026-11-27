/* PDF export replicating the physical "Honi Poke Stock Spot Check" template (A4 portrait) */
(function () {
  var BLUE = [30, 64, 140], PINK = [240, 76, 134], LPINK = [247, 184, 211], GREY = [95, 107, 133], RULE = [170, 180, 210], INK = [28, 34, 51];

  function t(s) {
    return String(s == null ? "" : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-")
      .replace(/→/g, "->").replace(/…/g, "...").replace(/[^\u0000-ÿ]/g, "?");
  }
  function fmtDate(iso) { var p = (iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso || ""; }

  // Photos are re-encoded at <=1000px for the PDF (about 400 ppi at 60 mm): sharp but small enough to email.
  function pdfPhoto(p) {
    return new Promise(function (resolve) {
      function fallback() { SC.photoBlob(p).arrayBuffer().then(function (ab) { resolve({ bytes: new Uint8Array(ab), w: p.w, h: p.h }); }, function () { resolve(null); }); }
      function draw(src, w, h, done) {
        var s = Math.min(1, 1000 / Math.max(w, h)), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
        cv.toBlob(function (b) {
          if (!b) return fallback();
          b.arrayBuffer().then(function (ab) { done && done(); cv.width = cv.height = 1; resolve({ bytes: new Uint8Array(ab), w: cw, h: ch }); }, fallback);
        }, "image/jpeg", 0.82);
      }
      if (window.createImageBitmap) {
        createImageBitmap(SC.photoBlob(p)).then(function (bm) { draw(bm, bm.width, bm.height, function () { if (bm.close) bm.close(); }); }, fallback);
      } else {
        var im = new Image(), u = URL.createObjectURL(SC.photoBlob(p));
        im.onload = function () { draw(im, im.naturalWidth, im.naturalHeight, function () { URL.revokeObjectURL(u); }); };
        im.onerror = fallback; im.src = u;
      }
    });
  }

  var LOGO = null;
  function loadLogo() {
    if (LOGO) return Promise.resolve();
    return fetch("logo-white.png").then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
    }).then(function (d) {
      return new Promise(function (res) { var im = new Image(); im.onload = function () { LOGO = { data: d, w: im.naturalWidth, h: im.naturalHeight }; res(); }; im.onerror = res; im.src = d; });
    }).catch(function () {});
  }
  function build(sc, cfg) { return loadLogo().then(function () { return build2(sc, cfg); }); }
  function build2(sc, cfg) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    // extra lines the manager added but never filled in are not printed
    var mand = cfg.mandatoryLines || 3;
    sc = Object.assign({}, sc, { categories: sc.categories.map(function (c) {
      return Object.assign({}, c, { lines: c.lines.filter(function (l, i) { return i < mand || String(l.name).trim() || String(l.system).trim() || String(l.counted).trim(); }) });
    }) });
    var W = 210, H = 297, M = 12, CW = W - 2 * M, BOT = H - 14, ROW = 7.5, HEAD = 7;
    var y = 0, first = true;

    function col(c, kind) { if (kind === "fill") doc.setFillColor(c[0], c[1], c[2]); else if (kind === "draw") doc.setDrawColor(c[0], c[1], c[2]); else doc.setTextColor(c[0], c[1], c[2]); }
    function text(s, x, yy, size, bold, color, opt) { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); col(color || BLUE, "text"); doc.text(t(s), x, yy, opt); }
    // Never cut text silently: shrink the font first, only then truncate with "...".
    function fitText(s, maxW, size, bold, minSize) {
      s = t(s); var fs = size; minSize = minSize || size * 0.7;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      while (fs > minSize) { doc.setFontSize(fs); if (doc.getTextWidth(s) <= maxW) return { s: s, size: fs }; fs -= 0.5; }
      doc.setFontSize(fs);
      if (doc.getTextWidth(s) > maxW) { while (s.length > 1 && doc.getTextWidth(s + "...") > maxW) s = s.slice(0, -1); s += "..."; }
      return { s: s, size: fs };
    }
    function fitDraw(s, x, yy, maxW, size, bold, color, opt, minSize) { var f = fitText(s, maxW, size, bold, minSize); text(f.s, x, yy, f.size, bold, color, opt); }

    function header() {
      if (first) {
        col(BLUE, "fill"); doc.rect(0, 0, W, 26, "F"); col(PINK, "fill"); doc.rect(0, 26, W, 1.2, "F");
        var lg = LOGO && LOGO.w ? true : false;
        if (lg) { try { doc.addImage(LOGO.data, "PNG", M, 5, 36, 36 * LOGO.h / LOGO.w); } catch (e) { lg = false; } }
        if (!lg) { text("HONI", M, 9.5, 13, true, [255, 255, 255]); text("POKE", M, 15, 13, true, [255, 255, 255]); }
        text("Stock Spot Check", M, 23.5, 19, true, [255, 255, 255]);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); col(PINK, "text"); doc.setCharSpace(1.2);
        var otw = doc.getTextWidth("OPERATIONS TEAM") + 14 * 1.2;
        doc.text("OPERATIONS TEAM", W - M - otw, 11); doc.setCharSpace(0);
        y = 36; first = false;
      } else {
        col(BLUE, "fill"); doc.rect(0, 0, W, 11, "F"); col(PINK, "fill"); doc.rect(0, 11, W, 0.9, "F");
        fitDraw("Stock Spot Check - " + sc.store + " - " + fmtDate(sc.date), M, 7.4, CW, 9.5, true, [255, 255, 255]);
        y = 19;
      }
    }
    function newPage() { doc.addPage(); header(); }
    function need(h) { if (y + h > BOT) newPage(); }

    // nextNeed = height of the first block after the title, so a title is never left alone at the page bottom
    function section(n, title, nextNeed) {
      need(12 + (nextNeed || 8)); y += 4;
      col(LPINK, "fill"); doc.circle(M + 3.4, y, 3.4, "F");
      text(String(n), M + 3.4, y + 1.4, 9, true, BLUE, { align: "center" });
      text(title, M + 10.5, y + 1.5, 12, true);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      var tx = M + 10.5 + doc.getTextWidth(t(title)) + 4;
      col(LPINK, "draw"); doc.setLineWidth(0.5); doc.line(tx, y, W - M, y);
      y += 7;
    }

    function ruled(label, value, minLines) {
      need(12);
      if (label) { text(label, M, y, 7, true, GREY); y += 3.5; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      var lines = value ? doc.splitTextToSize(t(value), CW) : [];
      var n = Math.max(minLines || 2, lines.length);
      for (var i = 0; i < n; i++) {
        need(6.5);
        if (lines[i]) text(lines[i], M, y + 4.2, 9.5, false, INK);
        col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(M, y + 5.6, W - M, y + 5.6);
        y += 6.5;
      }
    }

    function field(label, value, x, w) {
      text(label, x, y, 7, true, GREY);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      var lx = x + doc.getTextWidth(label) + 2.5;
      col(BLUE, "draw"); doc.setLineWidth(0.35); doc.line(lx, y + 0.8, x + w, y + 0.8);
      fitDraw(value, lx + 0.5, y - 0.4, x + w - lx - 1, 9.5, false, INK, null, 6.5);
    }

    function box(x, yy, w, h, label, prefix, value, suffix) {
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, yy, w, h, 2.4, 2.4, "S");
      text(label, x + 4, yy + 5, 7, true, GREY);
      if (prefix) text(prefix, x + 4, yy + h - 3.4, 11, true);
      var vx = x + (prefix ? 10 : 4), ve = x + w - (suffix ? 12 : 4);
      col(RULE, "draw"); doc.setLineWidth(0.3); doc.line(vx, yy + h - 2.8, ve, yy + h - 2.8);
      fitDraw(value, vx + 1, yy + h - 3.8, ve - vx - 1, 10.5, false, INK, null, 7);
      if (suffix) text(suffix, x + w - 4, yy + h - 3.4, 11, true, BLUE, { align: "right" });
    }

    /* ---------- category / wastage cards ---------- */
    function cardHeader(x, w, title, pink, withCols) {
      col(pink ? LPINK : BLUE, "fill");
      doc.roundedRect(x, y, w, HEAD, 2.4, 2.4, "F"); doc.rect(x, y + 3.5, w, HEAD - 3.5, "F");
      fitDraw(title, x + 3.5, y + 4.9, w - (withCols ? 62 : 8), 10, true, pink ? BLUE : [255, 255, 255], null, 7.5);
      if (withCols) {
        var cw = 17;
        ["Staff input", "Your count", "Var."].forEach(function (l, i) { text(l, x + w - cw * (3 - i) + cw / 2, y + 4.8, 7, true, [255, 255, 255], { align: "center" }); });
      }
    }
    function drawCatPart(cat, x, w, startRow, rows, forceRows) {
      if (cat.na) { cat = { name: cat.name, lines: [{ name: "Not used in this shop", system: "", counted: "" }] }; }
      var cw = 17, nameW = w - cw * 3, n = forceRows || rows, top = y, h = HEAD + n * ROW, base = ROW * 0.68;
      cardHeader(x, w, cat.name + (startRow > 0 ? " (cont.)" : ""), false, true);
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, top, w, h, 2.4, 2.4, "S");
      for (var r = 0; r < n; r++) {
        var ry = top + HEAD + r * ROW, l = cat.lines[startRow + r];
        if (r > 0) { col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x, ry, x + w, ry); }
        if (l) {
          fitDraw(l.name, x + 3.5, ry + base, nameW - 5, 9, true, BLUE, null, 6.5);
          var us = l.unit ? " " + l.unit : "", has = function (v) { return String(v).trim() !== ""; };
          if (has(l.system)) fitDraw(l.system + us, x + nameW + cw * 0.5, ry + base, cw - 2, 9, false, INK, { align: "center" }, 5.5);
          if (has(l.counted)) fitDraw(l.counted + us, x + nameW + cw * 1.5, ry + base, cw - 2, 9, false, INK, { align: "center" }, 5.5);
          var v = SC.variance(l);
          if (v !== null) fitDraw(SC.fmtVar(v) + us, x + nameW + cw * 2.5, ry + base, cw - 2, 9, true, v < 0 ? [211, 59, 59] : INK, { align: "center" }, 6);
        }
      }
      col(RULE, "draw"); doc.setLineWidth(0.25);
      for (var k = 0; k < 3; k++) doc.line(x + nameW + cw * k, top + HEAD, x + nameW + cw * k, top + h);
      return h;
    }
    var NOTE_TOP = 14.5, NOTE_STEP = 6.5;
    function wasteLines(w) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); return sc.wastage.notes ? doc.splitTextToSize(t(sc.wastage.notes), w - 8) : []; }
    function wasteRows(n) { return Math.max(3, Math.ceil((NOTE_TOP + Math.max(0, n - 1) * NOTE_STEP + 2) / ROW)); }
    function drawWastage(x, w, rows) {
      var top = y, h = HEAD + rows * ROW;
      cardHeader(x, w, "Weekly wastage (shop visit)", true, false);
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, top, w, h, 2.4, 2.4, "S");
      text("£", x + 4, top + HEAD + 7, 12, true);
      col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x + 10, top + HEAD + 8, x + w - 4, top + HEAD + 8);
      fitDraw(sc.wastage.amount, x + 11, top + HEAD + 6.8, w - 17, 10.5, false, INK, null, 7);
      var ls = wasteLines(w), nl = Math.max(2, ls.length);
      for (var i = 0; i < nl; i++) {
        var ly = top + HEAD + NOTE_TOP + i * NOTE_STEP; if (ly > top + h - 1) break;
        if (ls[i]) text(ls[i], x + 4, ly - 1.6, 9, false, INK);
        col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x + 4, ly, x + w - 4, ly);
      }
      return h;
    }

    function categories() {
      var gap = 4, hw = (CW - gap) / 2;
      var items = sc.categories.map(function (c) { if (c.na) c = { name: c.name, na: true, lines: [{}], photos: c.photos }; return { type: "cat", cat: c, small: c.lines.length <= 8 }; });
      if (cfg.wastage !== false) items.push({ type: "waste", small: wasteLines(hw).length <= 2 });
      var i = 0;
      while (i < items.length) {
        var a = items[i], b = items[i + 1];
        if (a.small && b && b.small) {
          var rowsA = a.type === "cat" ? a.cat.lines.length : 3, rowsB = b.type === "cat" ? b.cat.lines.length : 3;
          var rows = Math.max(rowsA, rowsB, 3), h = HEAD + rows * ROW;
          need(h + 4);
          var y0 = y;
          if (a.type === "cat") drawCatPart(a.cat, M, hw, 0, a.cat.lines.length, rows); else drawWastage(M, hw, rows);
          y = y0;
          if (b.type === "cat") drawCatPart(b.cat, M + hw + gap, hw, 0, b.cat.lines.length, rows); else drawWastage(M + hw + gap, hw, rows);
          y = y0 + h + 3.5; i += 2;
        } else {
          if (a.type === "cat") {
            var idx = 0, total = a.cat.lines.length;
            while (idx < total) {
              need(HEAD + ROW * 2 + 4);
              var fits = Math.max(1, Math.floor((BOT - y - HEAD - 3) / ROW)), n = Math.min(fits, total - idx);
              var hh = drawCatPart(a.cat, M, CW, idx, n); y += hh + 3.5; idx += n;
              if (idx < total) newPage();
            }
          } else {
            var rowsW = wasteRows(wasteLines(CW).length); need(HEAD + rowsW * ROW + 4);
            y += drawWastage(M, CW, rowsW) + 3.5;
          }
          i += 1;
        }
      }
    }

    /* ---------- build ---------- */
    header();
    field("STORE", sc.store, M, 100); field("DATE", fmtDate(sc.date), M + 106, 40); field("PERIOD", sc.period, M + 152, 34);
    y += 7.5; field("OPS MANAGER", sc.opsManager, M, 93); field("STORE MANAGER", sc.storeManager, M + 99, 87);
    y += 8;

    section(1, "Stock value, Vitamojo sales and GP", 31);
    var y0 = y;
    box(M, y0, 52, 14, "TOTAL CLOSING STOCK VALUE", "£", sc.totalStock, "");
    box(M + 56, y0, 52, 14, "VITAMOJO GROSS SALES", "£", sc.sales, "");
    box(M, y0 + 17, 108, 14, "GP %", "", sc.gp, "%");
    col(LPINK, "fill"); doc.roundedRect(M + 112, y0, CW - 112, 31, 2.6, 2.6, "F");
    text("How to calculate GP", M + 116, y0 + 6, 9.5, true);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); col([30, 40, 80], "text");
    var gpl = doc.splitTextToSize("1. Cost of sales = Opening stock + Purchases + Transfers in - Transfers out - Credit notes - Closing stock", CW - 120)
      .concat(["2. COI % = Cost of sales / Sales x 100", "3. GP % = 100 - COI %", "Example: cost 30% -> GP 70%"]);
    gpl.forEach(function (l, i) { doc.text(t(l), M + 116, y0 + 10.5 + i * 3.7); });
    y = y0 + 31 + 4;
    ruled("GP DISCUSSED WITH THE TEAM (NOTES)", sc.gpNotes, 1);

    section(2, "Line-by-line check: " + (cfg.mandatoryLines || 3) + " lines per category", HEAD + 3 * ROW);
    categories();

    section(3, "Actions and sign-off", 40);
    ruled("", sc.actions, 2); y += 3;
    need(25);
    var sw = (CW - 10) / 2, sy = y;
    function validPng(d) { return typeof d === "string" && d.indexOf("data:image/png;base64,") === 0 && d.length > 200; }
    [["OPS MANAGER SIGNATURE", sc.sigOps, sc.opsManager, M], ["STORE MANAGER SIGNATURE", sc.sigStore, sc.storeManager, M + sw + 10]].forEach(function (s) {
      if (validPng(s[1])) {
        try {
          var pr = doc.getImageProperties(s[1]), bw = sw * 0.7, bh = 14, k = Math.min(bw / pr.width, bh / pr.height);
          doc.addImage(s[1], "PNG", s[3] + 2, sy + 13 - pr.height * k, pr.width * k, pr.height * k);
        } catch (e) {}
      }
      col(BLUE, "draw"); doc.setLineWidth(0.35); doc.line(s[3], sy + 13.5, s[3] + sw, sy + 13.5);
      text(s[0], s[3], sy + 17.5, 7, true, GREY);
      if (s[2]) fitDraw(s[2], s[3], sy + 21.5, sw, 8.5, false, INK, null, 6.5);
    });
    y = sy + 24;

    /* ---------- photos ---------- */
    var groups = sc.categories.map(function (c) { return { title: c.name, photos: c.photos }; });
    groups.push({ title: "Weekly wastage", photos: sc.wastage.photos }); groups.push({ title: "Other photos", photos: sc.generalPhotos });
    groups = groups.filter(function (g) { return g.photos.length; });
    var flat = []; groups.forEach(function (g) { g.photos.forEach(function (p) { flat.push({ g: g, p: p }); }); });

    // convert one at a time so phones with little memory never hold many decoded images at once
    return flat.reduce(function (chain, f) {
      return chain.then(function () { return pdfPhoto(f.p).then(function (r) { f.img = r; }); });
    }, Promise.resolve()).then(function () {
      if (flat.length) {
        newPage(); section(4, "Photos", 70);
        var cols = 3, gap = 4, cell = (CW - gap * (cols - 1)) / cols, rowH = cell + 11;
        groups.forEach(function (g) {
          var items = flat.filter(function (f) { return f.g === g; });
          need(rowH + 8); text(g.title, M, y + 2, 10, true); y += 6;
          for (var s = 0; s < items.length; s += cols) {
            if (y + rowH > BOT) { newPage(); text(g.title + " (cont.)", M, y + 2, 10, true); y += 6; }
            items.slice(s, s + cols).forEach(function (f, ci) {
              var x = M + ci * (cell + gap);
              col(RULE, "draw"); doc.setLineWidth(0.3); doc.rect(x, y, cell, cell, "S");
              if (f.img) {
                var ar = f.img.w / f.img.h, iw = ar >= 1 ? cell : cell * ar, ih = ar >= 1 ? cell / ar : cell;
                try { doc.addImage(f.img.bytes, "JPEG", x + (cell - iw) / 2, y + (cell - ih) / 2, iw, ih, undefined, "FAST"); } catch (e) { text("(photo not readable)", x + 2, y + cell / 2, 7, false, GREY); }
              }
              if (f.p.caption) {
                doc.setFont("helvetica", "normal"); doc.setFontSize(7);
                doc.splitTextToSize(t(f.p.caption), cell).slice(0, 2).forEach(function (ln, li) { text(ln, x, y + cell + 3.6 + li * 3.2, 7, false, GREY); });
              }
            });
            y += rowH;
          }
          y += 2;
        });
      }
      var n = doc.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p); col(RULE, "draw"); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
        text("Honi Poke Stock Spot check · Head of Food", M, H - 6.5, 8, false, GREY);
        text("Page " + p + " of " + n, W - M, H - 6.5, 8, false, GREY, { align: "right" });
      }
      return doc.output("blob");
    });
  }

  window.SC.buildPdf = build;
})();
