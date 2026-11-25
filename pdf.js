/* PDF export replicating the physical "Honi Poke Stock Spot Check" template (A4 portrait) */
(function () {
  var BLUE = [30, 64, 140], PINK = [240, 76, 134], LPINK = [247, 184, 211], GREY = [95, 107, 133], RULE = [170, 180, 210];

  function t(s) {
    return String(s == null ? "" : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
      .replace(/→/g, "->").replace(/…/g, "...").replace(/[^\u0000-ÿ]/g, "?");
  }
  function fmtDate(iso) { var p = (iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso || ""; }
  function blobBytes(b) { return b.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }

  function build(sc, cfg) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    var W = 210, H = 297, M = 12, CW = W - 2 * M, BOT = H - 16, ROW = 9.5, HEAD = 8;
    var y = 0, first = true;

    function col(c, kind) { var a = c; if (kind === "fill") doc.setFillColor(a[0], a[1], a[2]); else if (kind === "draw") doc.setDrawColor(a[0], a[1], a[2]); else doc.setTextColor(a[0], a[1], a[2]); }
    function text(s, x, yy, size, bold, color, opt) { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); col(color || BLUE, "text"); doc.text(t(s), x, yy, opt); }
    function fit(s, maxW, size, bold) {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); s = t(s);
      while (s.length > 1 && doc.getTextWidth(s) > maxW) s = s.slice(0, -1);
      return s;
    }

    function header() {
      if (first) {
        col(BLUE, "fill"); doc.rect(0, 0, W, 32, "F"); col(PINK, "fill"); doc.rect(0, 32, W, 1.4, "F");
        text("HONI", M, 11.5, 15, true, [255, 255, 255]); text("POKE", M, 17.5, 15, true, [255, 255, 255]);
        text("Stock Spot Check", M, 28, 21, true, [255, 255, 255]);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); col(PINK, "text"); doc.setCharSpace(1.2);
        var otw = doc.getTextWidth("OPERATIONS TEAM") + 15 * 1.2 * 0.3528 * 0;
        doc.text("OPERATIONS TEAM", W - M - otw - 15 * 1.2 * 0.3528 * 2.0, 12); doc.setCharSpace(0);
        y = 43; first = false;
      } else {
        col(BLUE, "fill"); doc.rect(0, 0, W, 11, "F"); col(PINK, "fill"); doc.rect(0, 11, W, 0.9, "F");
        text("Stock Spot Check - " + sc.store + " - " + fmtDate(sc.date), M, 7.4, 9.5, true, [255, 255, 255]);
        y = 20;
      }
    }
    function newPage() { doc.addPage(); header(); }
    function need(h) { if (y + h > BOT) newPage(); }

    function section(n, title) {
      need(16); col(LPINK, "fill"); doc.circle(M + 3.6, y, 3.6, "F");
      text(String(n), M + 3.6, y + 1.5, 9.5, true, BLUE, { align: "center" });
      text(title, M + 11, y + 1.6, 12.5, true);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12.5);
      var tx = M + 11 + doc.getTextWidth(t(title)) + 4;
      col(LPINK, "draw"); doc.setLineWidth(0.5); doc.line(tx, y, W - M, y);
      y += 9;
    }

    function ruled(label, value, minLines) {
      need(14);
      if (label) { text(label, M, y, 7.5, true, GREY); y += 5.5; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      var lines = value ? doc.splitTextToSize(t(value), CW) : [];
      var n = Math.max(minLines || 2, lines.length);
      for (var i = 0; i < n; i++) {
        need(7.5);
        if (lines[i]) text(lines[i], M, y + 4.6, 10, false, [28, 34, 51]);
        col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(M, y + 6.5, W - M, y + 6.5);
        y += 7.5;
      }
    }

    function field(label, value, x, w) {
      text(label, x, y, 7.5, true, GREY);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      var lx = x + doc.getTextWidth(label) + 2.5;
      col(BLUE, "draw"); doc.setLineWidth(0.35); doc.line(lx, y + 0.8, x + w, y + 0.8);
      text(fit(value, x + w - lx - 1, 9.5, false), lx + 0.5, y - 0.4, 9.5, false, [28, 34, 51]);
    }

    function box(x, yy, w, h, label, prefix, value, suffix) {
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, yy, w, h, 2.4, 2.4, "S");
      text(label, x + 4, yy + 5.5, 7.5, true, GREY);
      if (prefix) text(prefix, x + 4, yy + h - 4, 12, true);
      var vx = x + (prefix ? 11 : 4), ve = x + w - (suffix ? 12 : 4);
      col(RULE, "draw"); doc.setLineWidth(0.3); doc.line(vx, yy + h - 3.4, ve, yy + h - 3.4);
      text(fit(value, ve - vx - 1, 11, false), vx + 1, yy + h - 4.4, 11, false, [28, 34, 51]);
      if (suffix) text(suffix, x + w - 4, yy + h - 4, 12, true, BLUE, { align: "right" });
    }

    /* ---------- category / wastage cards ---------- */
    function cardHeader(x, w, title, pink, withCols, roundTop) {
      col(pink ? LPINK : BLUE, "fill");
      doc.roundedRect(x, y, w, HEAD, 2.4, 2.4, "F"); doc.rect(x, y + 4, w, HEAD - 4, "F");
      text(fit(title, w - (withCols ? 58 : 8), 10.5, true), x + 3.5, y + 5.4, 10.5, true, pink ? BLUE : [255, 255, 255]);
      if (withCols) {
        var cw = 15;
        ["System", "Counted", "Var."].forEach(function (l, i) { text(l, x + w - cw * (3 - i) + cw / 2, y + 5.3, 7.2, true, [255, 255, 255], { align: "center" }); });
      }
    }
    function drawCatPart(cat, x, w, startRow, rows, forceRows) {
      // draws header + rows [startRow, startRow+rows); returns height used
      var cw = 15, nameW = w - cw * 3, n = forceRows || rows, top = y, h = HEAD + n * ROW;
      cardHeader(x, w, cat.name + (startRow > 0 ? " (cont.)" : ""), false, true);
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, top, w, h, 2.4, 2.4, "S");
      for (var r = 0; r < n; r++) {
        var ry = top + HEAD + r * ROW, l = cat.lines[startRow + r];
        if (r > 0) { col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x, ry, x + w, ry); }
        if (l) {
          text(fit(l.name, nameW - 4, 9.5, true), x + 3.5, ry + 6.1, 9.5, true, BLUE);
          text(fit(l.system, cw - 2, 9.5, false), x + nameW + cw * 0.5, ry + 6.1, 9.5, false, [28, 34, 51], { align: "center" });
          text(fit(l.counted, cw - 2, 9.5, false), x + nameW + cw * 1.5, ry + 6.1, 9.5, false, [28, 34, 51], { align: "center" });
          var v = SC.variance(l);
          if (v !== null) text(SC.fmtVar(v), x + nameW + cw * 2.5, ry + 6.1, 9.5, true, v < 0 ? [211, 59, 59] : [28, 34, 51], { align: "center" });
        }
      }
      col(RULE, "draw"); doc.setLineWidth(0.25);
      for (var k = 0; k < 3; k++) doc.line(x + nameW + cw * k, top + HEAD, x + nameW + cw * k, top + h);
      return h;
    }
    function drawWastage(x, w, rows) {
      var top = y, h = HEAD + rows * ROW;
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, top, w, h, 2.4, 2.4, "S");
      cardHeader(x, w, "Weekly wastage (shop visit)", true, false);
      col(BLUE, "draw"); doc.setLineWidth(0.5); doc.roundedRect(x, top, w, h, 2.4, 2.4, "S");
      text("£", x + 4, top + HEAD + 8, 13, true);
      col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x + 11, top + HEAD + 9, x + w - 4, top + HEAD + 9);
      text(fit(sc.wastage.amount, w - 18, 11, false), x + 12, top + HEAD + 7.8, 11, false, [28, 34, 51]);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      var ls = sc.wastage.notes ? doc.splitTextToSize(t(sc.wastage.notes), w - 8) : [];
      var avail = Math.floor((h - HEAD - 12) / 7);
      for (var i = 0; i < Math.max(2, avail); i++) {
        var ly = top + HEAD + 17 + i * 7; if (ly > top + h - 2) break;
        if (ls[i]) text(ls[i], x + 4, ly - 1.6, 9, false, [28, 34, 51]);
        col(RULE, "draw"); doc.setLineWidth(0.25); doc.line(x + 4, ly, x + w - 4, ly);
      }
      return h;
    }
    function wastageNeedsMore() { doc.setFont("helvetica", "normal"); doc.setFontSize(9); return sc.wastage.notes ? doc.splitTextToSize(t(sc.wastage.notes), 83).length : 0; }

    function categories() {
      var items = sc.categories.map(function (c, i) { return { type: "cat", cat: c, small: c.lines.length <= 8 }; });
      if (cfg.wastage !== false) items.push({ type: "waste", small: wastageNeedsMore() <= 6 });
      var gap = 4, hw = (CW - gap) / 2, i = 0;
      while (i < items.length) {
        var a = items[i], b = items[i + 1];
        if (a.small && b && b.small) {
          var rowsA = a.type === "cat" ? a.cat.lines.length : 3, rowsB = b.type === "cat" ? b.cat.lines.length : 3;
          var rows = Math.max(rowsA, rowsB, 3), h = HEAD + rows * ROW;
          need(h + 5);
          var y0 = y;
          if (a.type === "cat") drawCatPart(a.cat, M, hw, 0, a.cat.lines.length, rows); else drawWastage(M, hw, rows);
          y = y0;
          if (b.type === "cat") drawCatPart(b.cat, M + hw + gap, hw, 0, b.cat.lines.length, rows); else drawWastage(M + hw + gap, hw, rows);
          y = y0 + h + 5; i += 2;
        } else {
          if (a.type === "cat") {
            var idx = 0, total = a.cat.lines.length;
            while (idx < total) {
              need(HEAD + ROW * 2 + 5);
              var fits = Math.max(1, Math.floor((BOT - y - HEAD - 4) / ROW)), n = Math.min(fits, total - idx);
              var hh = drawCatPart(a.cat, M, CW, idx, n); y += hh + 5; idx += n;
              if (idx < total) newPage();
            }
          } else {
            var rowsW = Math.max(3, Math.ceil((wastageNeedsMore() * 7 + 16) / ROW)); need(HEAD + rowsW * ROW + 5);
            doc.setFont("helvetica", "normal"); y += drawWastage(M, CW, rowsW) + 5;
          }
          i += 1;
        }
      }
    }

    /* ---------- build ---------- */
    header();
    var fw = [46, 52, 34, 44], fx = [M, M + 50, M + 106, M + 144];
    field("STORE", sc.store, fx[0], fw[0] + 2); field("OPS MANAGER", sc.opsManager, fx[1] + 2, fw[1]); field("DATE", fmtDate(sc.date), fx[2] + 4, fw[2]); field("PERIOD", sc.period, fx[3] + 4, fw[3] - 6);
    y += 12;

    section(1, "Stock value, Vitamojo sales and GP");
    var y0 = y;
    box(M, y0, 52, 17, "TOTAL STOCK VALUE", "£", sc.totalStock, "");
    box(M + 56, y0, 52, 17, "VITAMOJO GROSS SALES", "£", sc.sales, "");
    box(M, y0 + 21, 108, 17, "GP %", "", sc.gp, "%");
    col(LPINK, "fill"); doc.roundedRect(M + 112, y0, CW - 112, 38, 2.6, 2.6, "F");
    text("How to calculate GP", M + 116, y0 + 7, 10, true);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); col([30, 40, 80], "text");
    var gpl = doc.splitTextToSize("1. Cost of sales = Opening stock + Purchases + Transfers in - Transfers out - Closing stock", CW - 120)
      .concat(["2. COI % = Cost of sales / Sales x 100", "3. GP % = 100 - COI %", "Example: cost 30% -> GP 70%"]);
    gpl.forEach(function (l, i) { doc.text(t(l), M + 116, y0 + 12.5 + i * 4.1); });
    y = y0 + 38 + 7;
    ruled("GP DISCUSSED WITH THE TEAM (NOTES)", sc.gpNotes, 2);
    y += 6;

    section(2, "Line-by-line check: " + (cfg.mandatoryLines || 3) + " lines per category");
    categories();

    need(50); section(3, "Actions and sign-off");
    ruled("", sc.actions, 2); y += 6;
    need(40);
    var sw = (CW - 10) / 2, sy = y;
    [["OPS MANAGER SIGNATURE", sc.sigOps, sc.opsManager, M], ["STORE MANAGER SIGNATURE", sc.sigStore, sc.storeManager, M + sw + 10]].forEach(function (s) {
      if (s[1]) { try { doc.addImage(s[1], "PNG", s[3] + 2, sy - 2, sw * 0.6, 17); } catch (e) {} }
      text(s[0], s[3], sy + 20.5, 7.5, true, GREY);
      col(BLUE, "draw"); doc.setLineWidth(0.35); doc.line(s[3], sy + 15.8, s[3] + sw, sy + 15.8);
      if (s[2]) text(fit(s[2], sw, 8.5, false), s[3] + sw, sy + 20.5, 8.5, false, [28, 34, 51], { align: "right" });
    });
    y = sy + 28;

    /* ---------- photos ---------- */
    var groups = sc.categories.map(function (c) { return { title: c.name, photos: c.photos }; });
    groups.push({ title: "Weekly wastage", photos: sc.wastage.photos }); groups.push({ title: "Other photos", photos: sc.generalPhotos });
    groups = groups.filter(function (g) { return g.photos.length; });
    var flat = []; groups.forEach(function (g) { g.photos.forEach(function (p, i) { flat.push({ g: g, p: p, i: i }); }); });

    return Promise.all(flat.map(function (f) { return blobBytes(f.p.blob).then(function (b) { f.bytes = b; }); })).then(function () {
      if (flat.length) {
        newPage(); section(4, "Photos"); y += 2;
        var cols = 4, gap = 4, cell = (CW - gap * (cols - 1)) / cols, ci = 0, lastGroup = null;
        flat.forEach(function (f) {
          if (f.g !== lastGroup) {
            if (ci % cols !== 0) { y += cell + 11; ci = 0; }
            need(cell + 22); text(f.g.title, M, y + 2, 10, true); y += 6; lastGroup = f.g; ci = 0;
          }
          if (ci === cols) { ci = 0; y += cell + 11; }
          need(cell + 10);
          var x = M + ci * (cell + gap), ar = f.p.w / f.p.h, iw = ar >= 1 ? cell : cell * ar, ih = ar >= 1 ? cell / ar : cell;
          col(RULE, "draw"); doc.setLineWidth(0.3); doc.rect(x, y, cell, cell, "S");
          try { doc.addImage(f.bytes, "JPEG", x + (cell - iw) / 2, y + (cell - ih) / 2, iw, ih, undefined, "FAST"); } catch (e) {}
          if (f.p.caption) text(fit(f.p.caption, cell, 7.5, false), x, y + cell + 4, 7.5, false, GREY);
          ci++;
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
