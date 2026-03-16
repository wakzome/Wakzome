// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser  v4  (triple-engine cross-check)
// ══════════════════════════════════════════════════════════════
(function() {

  /* ── Drag & drop ── */
  var upLabel = document.getElementById('tam-upload-label');
  if (!upLabel) return;
  upLabel.addEventListener('dragover', function(e){ e.preventDefault(); upLabel.classList.add('drag-over'); });
  upLabel.addEventListener('dragleave', function(){ upLabel.classList.remove('drag-over'); });
  upLabel.addEventListener('drop', function(e){
    e.preventDefault(); upLabel.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') tamHandleFile(f);
  });
  document.getElementById('tam-file-input').addEventListener('change', function(e){
    if (e.target.files[0]) tamHandleFile(e.target.files[0]);
  });

  var tamCurrentResult = null;

  /* ════════════════════════════════════════════════════════════
     MAIN HANDLER
  ════════════════════════════════════════════════════════════ */
  async function tamHandleFile(file) {
    document.getElementById('tam-file-name').textContent = file.name;
    document.getElementById('tam-status-msg').textContent = 'a processar…';
    document.getElementById('tam-results-wrap').innerHTML = '';
    document.getElementById('tam-invoice-meta').className = '';
    document.getElementById('tam-invoice-meta').innerHTML = '';
    document.getElementById('tam-validation-banner').className = '';
    document.getElementById('tam-validation-banner').innerHTML = '';
    document.getElementById('tam-export-btn').classList.remove('show');
    tamCurrentResult = null;

    try {
      var buf = await file.arrayBuffer();
      var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      var allRows = [];

      for (var p = 1; p <= pdf.numPages; p++) {
        var page    = await pdf.getPage(p);
        var content = await page.getTextContent();
        allRows.push.apply(allRows, tamGroupByRows(content.items));
      }

      var resA = tamEngineA(allRows);
      var resB = tamEngineB(allRows);
      var resC = tamEngineC(allRows);

      var result = tamCrossValidate(resA, resB, resC);

      if (!result.grouped.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      document.getElementById('tam-status-msg').textContent =
        result.grouped.length + ' referências · ' + result.totalPieces + ' unidades';

      document.getElementById('tam-upload-label').classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

      tamEnsureStyles();
      tamRenderMeta(result);
      tamRenderValidation(result);
      tamRenderTable(result);

      tamCurrentResult = result;
      document.getElementById('tam-export-btn').classList.add('show');
    } catch(err) {
      console.error(err);
      document.getElementById('tam-status-msg').textContent = 'erro: ' + err.message;
    }
  }

  /* ════════════════════════════════════════════════════════════
     SHARED UTILITIES
  ════════════════════════════════════════════════════════════ */

  // REF_RE: accepts hyphen AND underscore (e.g. JUS-24268_2)
  var REF_RE = /^[A-Z]{2,5}([-_][A-Z0-9]+){1,6}$/;
  var HS_RE  = /\b(6[0-3]\d{6})\b/;

  function tamParseEU(s) { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
  function tamRound2(n)  { return Math.round(n * 100) / 100; }
  function tamFmtEU(n)   {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-PT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function tamEsc(s)      { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function tamCleanName(n){ return String(n||'').replace(/44/g,''); }

  var GARMENT_WORDS = new Set([
    'Blouse','Dress','Skirt','Top','Trouser','Trousers','Cardigan','Pullover','Pullunder',
    'Culotte','Scarf','Jacket','Coat','Shirt','Leggings','Vest','Jumper','Sweater',
    'Blazer','Shorts','Pants','Tee','Tunic','Cape','Poncho','Bodysuit','Overall',
    'Jumpsuit','Romper','Light'
  ]);
  var BRANDS_SET = new Set(['hailys','zabaione']);

  function tamExtractTypeAndName(beforeHS) {
    var words = beforeHS.trim().split(/\s+/).filter(Boolean);
    var start = 0;
    while (start < words.length && BRANDS_SET.has(words[start].toLowerCase())) start++;
    var relevant = words.slice(start);
    if (!relevant.length) return { type:'', name:'' };
    if (relevant.length === 1) return { type:'', name: tamCleanName(relevant[0]) };
    var modelName   = tamCleanName(relevant[relevant.length - 1]);
    var typeWords   = relevant.slice(0, relevant.length - 1);
    var realGarment = typeWords.find(function(w){ return GARMENT_WORDS.has(w); });
    var abbrevs     = typeWords.filter(function(w){ return !GARMENT_WORDS.has(w); });
    var typeLabel   = realGarment
      ? (abbrevs.length ? realGarment + ' ' + abbrevs.join(' ') : realGarment)
      : typeWords.join(' ');
    return { type: typeLabel.trim(), name: modelName };
  }

  function tamGroupByRows(items) {
    if (!items.length) return [];
    var sorted = items.slice().sort(function(a,b){ return b.transform[5] - a.transform[5]; });
    var rows = [], cur = [sorted[0]], lastY = sorted[0].transform[5];
    for (var i = 1; i < sorted.length; i++) {
      var y = sorted[i].transform[5];
      if (Math.abs(y - lastY) > 3.5) {
        var row = cur.slice().sort(function(a,b){ return a.transform[4]-b.transform[4]; })
                     .map(function(x){ return x.str.trim(); }).filter(Boolean);
        if (row.length) rows.push(row);
        cur = [sorted[i]]; lastY = y;
      } else { cur.push(sorted[i]); }
    }
    var last = cur.slice().sort(function(a,b){ return a.transform[4]-b.transform[4]; })
                  .map(function(x){ return x.str.trim(); }).filter(Boolean);
    if (last.length) rows.push(last);
    return rows;
  }

  function tamBuildGrouped(rawItems) {
    var map = {};
    rawItems.forEach(function(item) {
      if (!map[item.ref]) map[item.ref] = {
        ref:item.ref, garmentType:item.garmentType, name:item.name,
        pieces:0, totalCost:0, lines:[]
      };
      var g = map[item.ref];
      g.pieces    += item.pieces;
      g.totalCost  = tamRound2(g.totalCost + item.total);
      g.lines.push(item);
      if (item.name)        g.name = item.name;
      if (item.garmentType) g.garmentType = item.garmentType;
    });
    return Object.values(map);
  }

  function tamFinalise(rawItems, tagged) {
    var grouped        = tamBuildGrouped(rawItems);
    var totalPieces    = grouped.reduce(function(s,g){ return s+g.pieces; }, 0);
    var subtotalGoods  = tamRound2(grouped.reduce(function(s,g){ return s+g.totalCost; }, 0));
    var shipRow        = tagged.find(function(r){ return r.type==='SHIP'; });
    var shipping       = shipRow ? shipRow.cost     : 0;
    var shipPkgs       = shipRow ? shipRow.packages : 0;
    var shipPerPiece   = totalPieces > 0 ? shipping / totalPieces : 0;

    grouped.forEach(function(g) {
      var base = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
    });

    var subtotalRows    = tagged.filter(function(r){ return r.type==='SUBTOTAL'; });
    var invoiceSubtotal = subtotalRows.length ? subtotalRows[0].value : null;
    var invNoRow        = tagged.find(function(r){ return r.type==='INVOICENO'; });
    var invDateRow      = tagged.find(function(r){ return r.type==='DATE'; });

    return {
      rawItems, grouped, totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods + shipping),
      invoiceSubtotal,
      invoiceNo:   invNoRow   ? invNoRow.value   : '—',
      invoiceDate: invDateRow ? invDateRow.value : '—'
    };
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE A — HS-code anchor, backward search
     For each row with HS code + numbers, looks backwards
     up to 20 rows for the nearest REF.
  ════════════════════════════════════════════════════════════ */
  function tamEngineA(allRows) {
    var tagged = allRows.map(function(tokens, idx) {
      var joined = tokens.join(' ');

      if (tokens[0] && REF_RE.test(tokens[0]))
        return { idx:idx, type:'REF', ref:tokens[0] };

      var hsM = joined.match(HS_RE);
      if (hsM) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos + 8).trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces    = parseInt(numM[1]);
          var unitPrice = tamParseEU(numM[2]);
          var total     = tamParseEU(numM[3]);
          var tn        = tamExtractTypeAndName(joined.slice(0, hsPos));
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name,
                   pieces:pieces, unitPrice:unitPrice, total:total };
        }
      }
      if (/Versandkosten|Transportation costs/i.test(joined)) {
        var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
        if (anzM) return { idx:idx, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) };
      }
      if (/Zwischensumme.*Subtotal/i.test(joined)) {
        var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
        if (nM) return { idx:idx, type:'SUBTOTAL', value:tamParseEU(nM[1]) };
      }
      if (/^ZY-\d+/.test(tokens[0]||'')) return { idx:idx, type:'INVOICENO', value:tokens[0] };
      if (joined.includes('Datum/Date')) {
        var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dM) return { idx:idx, type:'DATE', value:dM[1] };
      }
      return { idx:idx, type:'OTHER' };
    });

    var rawItems = [];
    tagged.forEach(function(row) {
      if (row.type !== 'DATA') return;
      for (var j = row.idx - 1; j >= Math.max(0, row.idx - 20); j--) {
        if (tagged[j] && tagged[j].type === 'REF') {
          rawItems.push({
            ref:tagged[j].ref, garmentType:row.garmentType, name:row.name,
            pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
            valid: Math.abs(row.pieces * row.unitPrice - row.total) < 0.02
          });
          break;
        }
      }
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE B — forward state-machine
     Scans rows top-to-bottom. REF row sets currentRef.
     DATA row (HS + numbers) uses currentRef directly.
  ════════════════════════════════════════════════════════════ */
  function tamEngineB(allRows) {
    var tagged = [], currentRef = null, currentType = '', currentName = '';

    for (var i = 0; i < allRows.length; i++) {
      var tokens = allRows[i];
      var joined = tokens.join(' ');

      if (/^ZY-\d+/.test(tokens[0]||'')) {
        tagged.push({ idx:i, type:'INVOICENO', value:tokens[0] }); continue;
      }
      if (joined.includes('Datum/Date')) {
        var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dM) { tagged.push({ idx:i, type:'DATE', value:dM[1] }); continue; }
      }
      if (/Versandkosten|Transportation costs/i.test(joined)) {
        var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
        if (anzM) { tagged.push({ idx:i, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) }); continue; }
      }
      if (/Zwischensumme.*Subtotal/i.test(joined)) {
        var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
        if (nM) { tagged.push({ idx:i, type:'SUBTOTAL', value:tamParseEU(nM[1]) }); continue; }
      }
      // REF: first token is ref, no HS code, second token (if any) is pure digits
      if (tokens[0] && REF_RE.test(tokens[0]) && !HS_RE.test(joined)) {
        var sec = tokens[1] || '';
        if (!sec || /^\d+$/.test(sec)) {
          currentRef = tokens[0]; currentType = ''; currentName = '';
          tagged.push({ idx:i, type:'REF', ref:currentRef }); continue;
        }
      }
      // DATA: HS code + numbers
      var hsM = joined.match(HS_RE);
      if (hsM && currentRef) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos + 8).replace(/\s*\*\s*$/, '').trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces = parseInt(numM[1]), unitPrice = tamParseEU(numM[2]), total = tamParseEU(numM[3]);
          var tn = tamExtractTypeAndName(joined.slice(0, hsPos));
          if (tn.name) currentName = tn.name;
          if (tn.type) currentType = tn.type;
          tagged.push({ idx:i, type:'DATA', ref:currentRef, garmentType:currentType, name:currentName,
                        pieces:pieces, unitPrice:unitPrice, total:total });
          continue;
        }
      }
      tagged.push({ idx:i, type:'OTHER' });
    }

    var rawItems = [];
    tagged.forEach(function(row) {
      if (row.type !== 'DATA') return;
      rawItems.push({ ref:row.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
        valid: Math.abs(row.pieces * row.unitPrice - row.total) < 0.02 });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE C — math-first / numeric triplet strategy
     Completely ignores HS codes. Instead, scans every row for
     numeric triplets that satisfy:  pieces × unitPrice ≈ total
     (EU number format: e.g. "22 1,69 37,18" or "16 6,67 106,72")
     Then matches each triplet to the nearest preceding REF row
     using a sliding window of up to 25 rows.
     This is robust to layout changes between invoice formats
     because it relies purely on the arithmetic relationship,
     not on the position or presence of the HS code.
  ════════════════════════════════════════════════════════════ */
  function tamEngineC(allRows) {
    // EU number: optional thousands dot + comma decimal
    var NUM_RE = /\b(\d{1,4})\s+([\d]{1,3}(?:\.\d{3})*,\d{2})\s+([\d]{1,3}(?:\.\d{3})*,\d{2})\b/g;
    var tagged = [];

    // First pass: tag REF rows and find numeric triplets
    for (var i = 0; i < allRows.length; i++) {
      var tokens = allRows[i];
      var joined = tokens.join(' ');

      if (/^ZY-\d+/.test(tokens[0]||'')) {
        tagged.push({ idx:i, type:'INVOICENO', value:tokens[0] }); continue;
      }
      if (joined.includes('Datum/Date')) {
        var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dM) { tagged.push({ idx:i, type:'DATE', value:dM[1] }); continue; }
      }
      if (/Versandkosten|Transportation costs/i.test(joined)) {
        var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
        if (anzM) { tagged.push({ idx:i, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) }); continue; }
      }
      if (/Zwischensumme.*Subtotal/i.test(joined)) {
        var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
        if (nM) { tagged.push({ idx:i, type:'SUBTOTAL', value:tamParseEU(nM[1]) }); continue; }
      }

      // Skip header / footer rows
      if (/Kunden|Konto|Versand|Datum|Seite|TAM FASHION|Wakzome|Hauptsitz|IBAN|Fon|Fax|eMail/i.test(joined)) {
        tagged.push({ idx:i, type:'OTHER' }); continue;
      }

      // REF detection — same guard as engines A/B
      if (tokens[0] && REF_RE.test(tokens[0]) && !HS_RE.test(joined)) {
        var sec = tokens[1] || '';
        if (!sec || /^\d+$/.test(sec)) {
          tagged.push({ idx:i, type:'REF', ref:tokens[0] }); continue;
        }
      }

      // Numeric triplet scan: find all valid pieces×unit=total in this row
      // Exclude rows that are Zwischensumme-like (only 1-2 numbers, large values)
      var rowStr = joined.replace(/\s*\*\s*/g, ' ');
      NUM_RE.lastIndex = 0;
      var m, foundTriplets = [];
      while ((m = NUM_RE.exec(rowStr)) !== null) {
        var pieces    = parseInt(m[1]);
        var unitPrice = tamParseEU(m[2]);
        var total     = tamParseEU(m[3]);
        // Guard: pieces must be plausible (1-999) and unit price < 100€
        if (pieces < 1 || pieces > 999) continue;
        if (unitPrice <= 0 || unitPrice >= 100) continue;
        if (total <= 0 || total > 5000) continue;
        var calc = tamRound2(pieces * unitPrice);
        if (Math.abs(calc - total) < 0.02) {
          // Extract type/name from text before this match
          var before = rowStr.slice(0, m.index);
          var tn = tamExtractTypeAndName(before);
          foundTriplets.push({ pieces:pieces, unitPrice:unitPrice, total:total, tn:tn });
        }
      }
      if (foundTriplets.length > 0) {
        foundTriplets.forEach(function(t) {
          tagged.push({ idx:i, type:'DATA_C', garmentType:t.tn.type, name:t.tn.name,
                        pieces:t.pieces, unitPrice:t.unitPrice, total:t.total });
        });
        continue;
      }

      tagged.push({ idx:i, type:'OTHER' });
    }

    // Second pass: assign each DATA_C row to nearest preceding REF (window 25)
    var rawItems = [];
    tagged.forEach(function(row) {
      if (row.type !== 'DATA_C') return;
      for (var j = row.idx - 1; j >= Math.max(0, row.idx - 25); j--) {
        var t = tagged.find(function(x){ return x.idx === j; });
        if (t && t.type === 'REF') {
          rawItems.push({ ref:t.ref, garmentType:row.garmentType, name:row.name,
            pieces:row.pieces, unitPrice:row.unitPrice, total:row.total, valid:true });
          break;
        }
      }
    });

    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     CROSS-VALIDATION (3 engines)
     Picks the engine whose subtotal is closest to the invoice
     declared subtotal. Per-ref: CONFIRMED if all agreeing
     engines match, CONFLICT if they differ, SOLO_X if only
     one engine found it.
  ════════════════════════════════════════════════════════════ */
  function tamCrossValidate(resA, resB, resC) {
    function score(res) {
      if (!res.grouped.length) return 9999;
      if (res.invoiceSubtotal == null) return 5000 - res.grouped.length; // prefer more refs
      return Math.abs(res.invoiceSubtotal - res.subtotalGoods);
    }

    // Rank engines by score (lowest = best)
    var engines = [
      { label:'A', res:resA, score:score(resA) },
      { label:'B', res:resB, score:score(resB) },
      { label:'C', res:resC, score:score(resC) }
    ].sort(function(a,b){ return a.score - b.score });

    var best = engines[0].res;

    // Build per-ref maps
    var maps = { A:{}, B:{}, C:{} };
    resA.grouped.forEach(function(g){ maps.A[g.ref]=g; });
    resB.grouped.forEach(function(g){ maps.B[g.ref]=g; });
    resC.grouped.forEach(function(g){ maps.C[g.ref]=g; });

    var allRefs = {};
    [resA,resB,resC].forEach(function(r){ r.grouped.forEach(function(g){ allRefs[g.ref]=true; }); });
    allRefs = Object.keys(allRefs);

    var confirmed=0, conflicts=[], onlyInBest=[], onlyInOther=[];

    var mergedGrouped = allRefs.map(function(ref) {
      var a = maps.A[ref], b = maps.B[ref], c = maps.C[ref];
      var present = [a,b,c].filter(Boolean);
      if (present.length === 0) return null;

      // Check if all present engines agree
      var pieces0 = present[0].pieces, total0 = present[0].totalCost;
      var allAgree = present.every(function(g){
        return g.pieces === pieces0 && Math.abs(g.totalCost - total0) < 0.02;
      });

      if (allAgree && present.length > 1) {
        confirmed++;
        return Object.assign({}, present[0], { confidence:'CONFIRMED', enginesCount: present.length });
      }

      // Find majority or use best-engine value
      var fromBest = maps[engines[0].label][ref];
      if (!fromBest) fromBest = present[0];

      var detailParts = [];
      if (a) detailParts.push('A: '+a.pieces+'un/'+tamFmtEU(a.totalCost)+'€');
      if (b) detailParts.push('B: '+b.pieces+'un/'+tamFmtEU(b.totalCost)+'€');
      if (c) detailParts.push('C: '+c.pieces+'un/'+tamFmtEU(c.totalCost)+'€');

      if (present.length === 1) {
        var lbl = a ? 'SOLO_A' : b ? 'SOLO_B' : 'SOLO_C';
        return Object.assign({}, present[0], { confidence:lbl, enginesCount:1 });
      }

      conflicts.push({ ref:ref, detail:detailParts.join(' · ') });
      return Object.assign({}, fromBest, {
        confidence:'CONFLICT',
        conflictDetail: detailParts.join(' · '),
        enginesCount: present.length
      });
    }).filter(Boolean);

    var totalPieces   = mergedGrouped.reduce(function(s,g){ return s+g.pieces; }, 0);
    var subtotalGoods = tamRound2(mergedGrouped.reduce(function(s,g){ return s+g.totalCost; }, 0));
    var shipping      = best.shipping || resA.shipping || resB.shipping || resC.shipping;
    var shipPkgs      = best.shipPkgs || resA.shipPkgs || resB.shipPkgs || resC.shipPkgs;
    var shipPerPiece  = totalPieces > 0 ? shipping / totalPieces : 0;

    mergedGrouped.forEach(function(g) {
      var base = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
    });

    var meta = [resA,resB,resC].find(function(r){ return r.invoiceNo !== '—'; }) || resA;

    return {
      grouped: mergedGrouped, rawItems: best.rawItems,
      totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods + shipping),
      invoiceSubtotal: meta.invoiceSubtotal,
      invoiceNo:       meta.invoiceNo,
      invoiceDate:     meta.invoiceDate,
      xv: {
        confirmed, conflicts,
        fullyAgree: conflicts.length === 0 &&
                    mergedGrouped.every(function(g){ return g.confidence==='CONFIRMED'; }),
        bestEngine: engines[0].label,
        engines: engines.map(function(e){
          return { label:e.label, refs:e.res.grouped.length, units:e.res.totalPieces,
                   sub:e.res.subtotalGoods, score:tamRound2(e.score) };
        })
      }
    };
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: META  — includes invoice number in status bar
  ════════════════════════════════════════════════════════════ */
  function tamRenderMeta(r) {
    // Update status msg to include invoice number
    document.getElementById('tam-status-msg').textContent =
      (r.invoiceNo !== '—' ? r.invoiceNo + '  ·  ' : '') +
      r.grouped.length + ' referências · ' + r.totalPieces + ' unidades';

    var el = document.getElementById('tam-invoice-meta');
    el.innerHTML =
      '<div class="tam-mi"><em>fatura nº</em><strong>'+tamEsc(r.invoiceNo)+'</strong></div>' +
      '<div class="tam-mi"><em>data</em><strong>'+tamEsc(r.invoiceDate)+'</strong></div>' +
      '<div class="tam-mi"><em>fornecedor</em><strong>TAM Fashion GmbH</strong></div>' +
      '<div class="tam-mi"><em>cliente</em><strong>Wakzome LDA</strong></div>' +
      '<div class="tam-mi"><em>referências</em><strong>'+r.grouped.length+'</strong></div>' +
      '<div class="tam-mi"><em>total unidades</em><strong>'+r.totalPieces+'</strong></div>' +
      '<div class="tam-mi"><em>envio (pacotes)</em><strong>'+r.shipPkgs+'</strong></div>';
    el.classList.add('show');
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: VALIDATION BANNER
  ════════════════════════════════════════════════════════════ */
  function tamRenderValidation(r) {
    var el  = document.getElementById('tam-validation-banner');
    var xv  = r.xv;
    var subOk = r.invoiceSubtotal != null ? Math.abs(r.invoiceSubtotal - r.subtotalGoods) < 0.05 : true;
    var allOk = xv.fullyAgree && subOk;

    var subLine = r.invoiceSubtotal != null
      ? 'fatura: <strong>'+tamFmtEU(r.invoiceSubtotal)+' €</strong> · calculado: <strong>'+tamFmtEU(r.subtotalGoods)+' €</strong>'
      : 'calculado: <strong>'+tamFmtEU(r.subtotalGoods)+' €</strong>';

    var cvHtml = '';
    if (allOk) {
      cvHtml = '<div class="tam-vi" style="color:#2a7a2a"><em>tripla verificação</em>' +
               '<span>✅ todos os motores coincidem — <strong>'+xv.confirmed+' referências confirmadas</strong></span></div>';
    } else {
      // Engine comparison table
      var engLines = xv.engines.map(function(e){
        var star = e.label === xv.bestEngine ? ' ★' : '';
        return '<strong>Motor '+e.label+star+'</strong>: '+e.refs+' refs · '+e.units+' un · '+tamFmtEU(e.sub)+' €';
      }).join('<br>');
      cvHtml += '<div class="tam-vi"><em>motores</em><span>'+engLines+'</span></div>';
      if (xv.confirmed > 0)
        cvHtml += '<div class="tam-vi"><em>coincidências</em><span><strong>'+xv.confirmed+'</strong> refs confirmadas por múltiplos motores</span></div>';
      if (xv.conflicts.length) {
        var cLines = xv.conflicts.map(function(c){
          return '<span class="tam-conflict-ref">'+tamEsc(c.ref)+'</span> ('+tamEsc(c.detail)+')';
        }).join('<br>');
        cvHtml += '<div class="tam-vi"><em style="color:#c00">⚠️ conflitos ('+xv.conflicts.length+')</em><span>'+cLines+'</span></div>';
      }
    }

    var badLines = r.rawItems.filter(function(i){ return !i.valid; });
    el.innerHTML =
      '<div class="tam-vi"><em>estado</em><span>'+(allOk?'✅ fatura correcta':'⚠️ verificar itens marcados')+'</span></div>' +
      '<div class="tam-vi"><em>subtotal mercadoria</em><span>'+subLine+'</span></div>' +
      '<div class="tam-vi"><em>linhas verificadas</em><span><strong>'+(r.rawItems.length-badLines.length)+'/'+r.rawItems.length+'</strong> correctas'+
        (badLines.length?' · <strong style="color:#c00">'+badLines.length+' com erro</strong>':'')+'</span></div>' +
      cvHtml +
      '<div class="tam-vi"><em>transporte por unidade</em><span><strong>'+tamFmtEU(r.shipping)+' €</strong> ÷ '+r.totalPieces+' un = <strong>'+tamFmtEU(r.shipPerPiece)+' €/un</strong></span></div>';

    el.className = allOk ? 'ok' : 'err';
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: TABLE
     — removed ✓ column
     — UND for units (narrow)
     — P.Unit/T for price (narrow)
     — Total (narrow)
     — table-layout:fixed with explicit widths
  ════════════════════════════════════════════════════════════ */
  function tamRenderTable(r) {
    if (!r.grouped.length) return;

    var html = '<table class="tam-table"><colgroup>' +
      '<col style="width:32px">' +       // #
      '<col style="width:160px">' +      // referência
      '<col>' +                          // tipo · nome (fills remaining)
      '<col style="width:46px">' +       // UND
      '<col style="width:84px">' +       // P.Unit/T
      '<col style="width:84px">' +       // Total
      '</colgroup><thead><tr>' +
      '<th class="tam-row-num">#</th>' +
      '<th>referência</th>' +
      '<th>tipo · nome</th>' +
      '<th class="tam-num-col">UND</th>' +
      '<th class="tam-num-col">P.Unit/T</th>' +
      '<th class="tam-num-col">Total</th>' +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i) {
      var conf     = g.confidence || 'CONFIRMED';
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      var rowCls   = conf==='CONFLICT' ? ' class="tam-row-conflict"'
                   : (conf==='SOLO_A'||conf==='SOLO_B'||conf==='SOLO_C') ? ' class="tam-row-solo"' : '';
      var tooltip  = conf==='CONFLICT' ? ' title="'+tamEsc(g.conflictDetail||'')+'"' : '';
      var badge    = conf!=='CONFIRMED'
        ? '<span class="tam-badge tam-badge-'+conf.toLowerCase()+'">'+conf+'</span>' : '';

      html += '<tr'+rowCls+tooltip+'>' +
        '<td class="tam-row-num">'+(i+1)+'</td>' +
        '<td><strong>'+tamEsc(g.ref)+'</strong>'+badge+'</td>' +
        '<td>'+tamEsc(typeNome)+'</td>' +
        '<td class="tam-num-col">'+g.pieces+'</td>' +
        '<td class="tam-num-col">'+tamFmtEU(g.unitPriceWithShip)+'</td>' +
        '<td class="tam-num-col"><strong>'+tamFmtEU(g.grandTotal)+'</strong></td>' +
        '</tr>';
    });

    html += '</tbody><tfoot>' +
      '<tr>' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2"><strong>subtotal mercadoria</strong></td>' +
        '<td class="tam-num-col"><strong>'+r.totalPieces+'</strong></td>' +
        '<td></td>' +
        '<td class="tam-num-col"><strong>'+tamFmtEU(r.subtotalGoods)+'</strong></td>' +
      '</tr>' +
      '<tr class="tam-tr-ship">' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2">transporte · '+r.shipPkgs+' pacotes × 17,50 €</td>' +
        '<td></td><td></td>' +
        '<td class="tam-num-col">'+tamFmtEU(r.shipping)+'</td>' +
      '</tr>' +
      '<tr class="tam-tr-grand">' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2"><strong>total geral</strong></td>' +
        '<td class="tam-num-col"><strong>'+r.totalPieces+'</strong></td>' +
        '<td></td>' +
        '<td class="tam-num-col"><strong>'+tamFmtEU(r.grandTotal)+'</strong></td>' +
      '</tr>' +
      '</tfoot></table>';

    document.getElementById('tam-results-wrap').innerHTML = html;
  }

  /* ════════════════════════════════════════════════════════════
     INJECT STYLES
  ════════════════════════════════════════════════════════════ */
  function tamEnsureStyles() {
    if (document.getElementById('tam-xv-styles')) return;
    var s = document.createElement('style');
    s.id  = 'tam-xv-styles';
    s.textContent = [
      // Table layout
      '.tam-table{table-layout:fixed;width:100%}',
      '.tam-num-col{text-align:right;white-space:nowrap;padding-right:8px}',
      // Row states
      '.tam-row-conflict td{background:#fff8e1!important}',
      '.tam-row-solo td{background:#f5f5f5!important}',
      // Badges
      '.tam-badge{display:inline-block;margin-left:5px;font-size:.58rem;padding:1px 4px;border-radius:3px;vertical-align:middle;font-weight:bold;color:#fff;letter-spacing:.02em}',
      '.tam-badge-conflict{background:#e67e00}',
      '.tam-badge-solo_a,.tam-badge-solo_b,.tam-badge-solo_c{background:#999}',
      // Conflict ref highlight in banner
      '.tam-conflict-ref{font-weight:bold;color:#c00}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════
     EXPORT CSV
  ════════════════════════════════════════════════════════════ */
  document.getElementById('tam-export-btn').addEventListener('click', function() {
    if (!tamCurrentResult) return;
    var r = tamCurrentResult;
    var lines = ['\uFEFF'+['Referência','Tipo · Nome','UND','P.Unit c/ Envio (€)','Total (€)','Verificação'].join(';')];
    r.grouped.forEach(function(g) {
      var tn = (g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+( g.name||'');
      lines.push([g.ref, tn, g.pieces, tamFmtEU(g.unitPriceWithShip), tamFmtEU(g.grandTotal), g.confidence||'CONFIRMED'].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','',r.totalPieces,'',tamFmtEU(r.subtotalGoods),''].join(';'));
    lines.push(['Transporte ('+r.shipPkgs+' × 17,50 €)','','','',tamFmtEU(r.shipping),''].join(';'));
    lines.push(['Total geral','',r.totalPieces,'',tamFmtEU(r.grandTotal),''].join(';'));
    var blob = new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href=url; a.download='TAM_'+(r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  });

})();
