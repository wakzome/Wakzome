// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser  v3  (dual-engine cross-check)
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
      var allRows = [];  // rows in reading order, page by page

      for (var p = 1; p <= pdf.numPages; p++) {
        var page    = await pdf.getPage(p);
        var content = await page.getTextContent();
        allRows.push.apply(allRows, tamGroupByRows(content.items));
      }

      // Both engines receive the same allRows — same input, different strategy
      var resA = tamEngineA(allRows);
      var resB = tamEngineB(allRows);

      var result = tamCrossValidate(resA, resB);

      if (!result.grouped.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      document.getElementById('tam-status-msg').textContent =
        result.grouped.length + ' referências · ' + result.totalPieces + ' unidades';

      document.getElementById('tam-upload-label').classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

      tamRenderMeta(result);
      tamRenderValidation(result);
      tamRenderTable(result);
      tamEnsureStyles();

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

  // Fixed REF_RE: accepts hyphen AND underscore (e.g. JUS-24268_2)
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

  /* Group PDF text items by Y coordinate into ordered rows */
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

  /* Build grouped summary from raw line items */
  function tamBuildGrouped(rawItems) {
    var map = {};
    rawItems.forEach(function(item) {
      if (!map[item.ref]) map[item.ref] = {
        ref: item.ref, garmentType: item.garmentType, name: item.name,
        pieces: 0, totalCost: 0, lines: []
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

  /* Finalise result object */
  function tamFinalise(rawItems, tagged) {
    var grouped        = tamBuildGrouped(rawItems);
    var totalPieces    = grouped.reduce(function(s,g){ return s+g.pieces; }, 0);
    var subtotalGoods  = tamRound2(grouped.reduce(function(s,g){ return s+g.totalCost; }, 0));
    var shipRow        = tagged.find(function(r){ return r.type==='SHIP'; });
    var shipping       = shipRow ? shipRow.cost     : 0;
    var shipPkgs       = shipRow ? shipRow.packages : 0;
    var shipPerPiece   = totalPieces > 0 ? shipping / totalPieces : 0;

    grouped.forEach(function(g) {
      var baseUnit        = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(baseUnit + shipPerPiece);
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
     ENGINE A — HS-code anchor strategy (original, fixed)
     For each row containing an HS code + numeric data,
     looks backwards up to 20 rows for the nearest REF row.
     Fix applied: REF_RE now accepts underscores (JUS-24268_2).
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
            ref: tagged[j].ref, garmentType: row.garmentType, name: row.name,
            pieces: row.pieces, unitPrice: row.unitPrice, total: row.total,
            valid: Math.abs(row.pieces * row.unitPrice - row.total) < 0.02
          });
          break;
        }
      }
    });

    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE B — forward state-machine strategy
     Scans rows top-to-bottom maintaining currentRef state.
     When a REF row is found, it updates currentRef.
     When a DATA row (HS + numbers) is found, it emits a line
     using currentRef WITHOUT looking backwards.
     This is fundamentally different from Engine A:
       - Engine A:  DATA row → search back for REF
       - Engine B:  REF row  → hold state → DATA row uses it
     Both break on different edge cases, so discrepancies
     between them reveal parsing errors reliably.
  ════════════════════════════════════════════════════════════ */
  function tamEngineB(allRows) {
    var tagged     = [];
    var currentRef = null;
    var currentType= '';
    var currentName= '';

    for (var i = 0; i < allRows.length; i++) {
      var tokens = allRows[i];
      var joined = tokens.join(' ');

      // ── INVOICENO ──
      if (/^ZY-\d+/.test(tokens[0]||'')) {
        tagged.push({ idx:i, type:'INVOICENO', value:tokens[0] });
        continue;
      }

      // ── DATE ──
      if (joined.includes('Datum/Date')) {
        var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dM) { tagged.push({ idx:i, type:'DATE', value:dM[1] }); continue; }
      }

      // ── SHIP ──
      if (/Versandkosten|Transportation costs/i.test(joined)) {
        var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
        if (anzM) { tagged.push({ idx:i, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) }); continue; }
      }

      // ── SUBTOTAL ──
      if (/Zwischensumme.*Subtotal/i.test(joined)) {
        var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
        if (nM) { tagged.push({ idx:i, type:'SUBTOTAL', value:tamParseEU(nM[1]) }); continue; }
      }

      // ── REF row ──
      // A row is a REF if:
      //   1. First token matches REF_RE
      //   2. Row has at most 2 tokens (ref + optional colour code)
      //   3. There is NO HS code on this row (avoids misclassifying data rows)
      if (tokens[0] && REF_RE.test(tokens[0]) && !HS_RE.test(joined)) {
        var secondToken = tokens[1] || '';
        // Second token (if any) must be a pure colour code (digits only) or empty
        if (!secondToken || /^\d+$/.test(secondToken)) {
          currentRef  = tokens[0];
          currentType = '';
          currentName = '';
          tagged.push({ idx:i, type:'REF', ref:currentRef });
          continue;
        }
      }

      // ── DATA row (HS code + quantities) ──
      var hsM = joined.match(HS_RE);
      if (hsM && currentRef) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos + 8).replace(/\s*\*\s*$/, '').trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces    = parseInt(numM[1]);
          var unitPrice = tamParseEU(numM[2]);
          var total     = tamParseEU(numM[3]);
          var tn        = tamExtractTypeAndName(joined.slice(0, hsPos));
          if (tn.name)        currentName = tn.name;
          if (tn.type)        currentType = tn.type;
          tagged.push({ idx:i, type:'DATA', ref:currentRef,
                        garmentType:currentType, name:currentName,
                        pieces:pieces, unitPrice:unitPrice, total:total });
          continue;
        }
      }

      tagged.push({ idx:i, type:'OTHER' });
    }

    // Build rawItems directly from tagged DATA (ref already embedded)
    var rawItems = [];
    tagged.forEach(function(row) {
      if (row.type !== 'DATA') return;
      rawItems.push({
        ref: row.ref, garmentType: row.garmentType, name: row.name,
        pieces: row.pieces, unitPrice: row.unitPrice, total: row.total,
        valid: Math.abs(row.pieces * row.unitPrice - row.total) < 0.02
      });
    });

    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     CROSS-VALIDATION
  ════════════════════════════════════════════════════════════ */
  function tamCrossValidate(resA, resB) {
    var mapA = {}, mapB = {};
    resA.grouped.forEach(function(g){ mapA[g.ref] = g; });
    resB.grouped.forEach(function(g){ mapB[g.ref] = g; });

    var allRefs = Object.keys(Object.assign({}, mapA, mapB));
    var confirmed = 0, conflicts = [], onlyA = [], onlyB = [];

    function scoreEngine(res) {
      if (res.invoiceSubtotal == null || res.grouped.length === 0) return 9999;
      return Math.abs(res.invoiceSubtotal - res.subtotalGoods);
    }
    var primary   = (resB.grouped.length > 0 && scoreEngine(resB) < scoreEngine(resA)) ? resB : resA;
    var secondary = primary === resA ? resB : resA;

    var mergedGrouped = allRefs.map(function(ref) {
      var a = mapA[ref], b = mapB[ref];
      if (a && b) {
        var pOk = a.pieces === b.pieces;
        var tOk = Math.abs(a.totalCost - b.totalCost) < 0.02;
        if (pOk && tOk) {
          confirmed++;
          return Object.assign({}, a, { confidence:'CONFIRMED' });
        } else {
          conflicts.push({ ref:ref, pA:a.pieces, tA:a.totalCost, pB:b.pieces, tB:b.totalCost });
          var aValid = a.lines.every(function(l){ return l.valid; });
          var bValid = b.lines.every(function(l){ return l.valid; });
          var chosen = (bValid && !aValid) ? b : a;
          return Object.assign({}, chosen, {
            confidence:'CONFLICT',
            conflictDetail:'A: '+a.pieces+'un/'+tamFmtEU(a.totalCost)+'€ · B: '+b.pieces+'un/'+tamFmtEU(b.totalCost)+'€'
          });
        }
      } else if (a) {
        onlyA.push(ref);
        return Object.assign({}, a, { confidence:'SOLO_A' });
      } else {
        onlyB.push(ref);
        return Object.assign({}, b, { confidence:'SOLO_B' });
      }
    });

    var totalPieces   = mergedGrouped.reduce(function(s,g){ return s+g.pieces; }, 0);
    var subtotalGoods = tamRound2(mergedGrouped.reduce(function(s,g){ return s+g.totalCost; }, 0));
    var shipping      = primary.shipping  || secondary.shipping;
    var shipPkgs      = primary.shipPkgs  || secondary.shipPkgs;
    var shipPerPiece  = totalPieces > 0 ? shipping / totalPieces : 0;

    mergedGrouped.forEach(function(g) {
      var base = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
    });

    var meta = primary.invoiceNo !== '—' ? primary : secondary;

    return {
      grouped: mergedGrouped, rawItems: primary.rawItems,
      totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods + shipping),
      invoiceSubtotal: meta.invoiceSubtotal,
      invoiceNo:       meta.invoiceNo,
      invoiceDate:     meta.invoiceDate,
      xv: {
        confirmed, conflicts, onlyA, onlyB,
        fullyAgree: conflicts.length === 0 && onlyA.length === 0 && onlyB.length === 0,
        refsA:  resA.grouped.length, unitsA: resA.totalPieces, subA: resA.subtotalGoods,
        refsB:  resB.grouped.length, unitsB: resB.totalPieces, subB: resB.subtotalGoods
      }
    };
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: META
  ════════════════════════════════════════════════════════════ */
  function tamRenderMeta(r) {
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
      cvHtml = '<div class="tam-vi" style="color:#2a7a2a"><em>dupla verificação</em>' +
               '<span>✅ motores A e B coincidem em <strong>'+xv.confirmed+' referências</strong></span></div>';
    } else {
      cvHtml += '<div class="tam-vi"><em>motor A</em><span>'+xv.refsA+' refs · '+xv.unitsA+' un · '+tamFmtEU(xv.subA)+' €</span></div>';
      cvHtml += '<div class="tam-vi"><em>motor B</em><span>'+xv.refsB+' refs · '+xv.unitsB+' un · '+tamFmtEU(xv.subB)+' €</span></div>';
      if (xv.confirmed > 0)
        cvHtml += '<div class="tam-vi"><em>coincidências</em><span><strong>'+xv.confirmed+'</strong> refs iguais nos dois motores</span></div>';
      if (xv.conflicts.length) {
        var cLines = xv.conflicts.map(function(c){
          return '<span class="tam-conflict-ref">'+tamEsc(c.ref)+'</span> (A: '+c.pA+'un/'+tamFmtEU(c.tA)+'€ · B: '+c.pB+'un/'+tamFmtEU(c.tB)+'€)';
        }).join('<br>');
        cvHtml += '<div class="tam-vi"><em style="color:#c00">⚠️ conflitos ('+xv.conflicts.length+')</em><span>'+cLines+'</span></div>';
      }
      if (xv.onlyA.length) cvHtml += '<div class="tam-vi"><em>só em A</em><span>'+xv.onlyA.map(tamEsc).join(', ')+'</span></div>';
      if (xv.onlyB.length) cvHtml += '<div class="tam-vi"><em>só em B</em><span>'+xv.onlyB.map(tamEsc).join(', ')+'</span></div>';
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
  ════════════════════════════════════════════════════════════ */
  function tamRenderTable(r) {
    if (!r.grouped.length) return;
    var html = '<table class="tam-table"><thead><tr>' +
      '<th class="tam-row-num">#</th><th>referência</th><th>tipo · nome</th>' +
      '<th>unidades</th><th>p. unit. c/ envio</th><th>total</th><th>✓</th>' +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i) {
      var allValid = g.lines ? g.lines.every(function(l){ return l.valid; }) : true;
      var conf     = g.confidence || 'CONFIRMED';
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      var rowCls   = conf==='CONFLICT' ? ' class="tam-row-conflict"' : (conf==='SOLO_A'||conf==='SOLO_B') ? ' class="tam-row-solo"' : '';
      var checkIcon= conf==='CONFLICT' ? '⚠' : (conf==='SOLO_A'||conf==='SOLO_B') ? '?' : (allValid?'✓':'✗');
      var checkCls = conf==='CONFLICT' ? 'tam-chk-warn' : (conf==='SOLO_A'||conf==='SOLO_B') ? 'tam-chk-solo' : (allValid?'tam-chk-ok':'tam-chk-err');
      var tooltip  = conf==='CONFLICT' ? ' title="'+tamEsc(g.conflictDetail||'')+'"' : '';
      var badge    = conf!=='CONFIRMED' ? '<span class="tam-badge tam-badge-'+conf.toLowerCase()+'">'+conf+'</span>' : '';

      html += '<tr'+rowCls+tooltip+'>' +
        '<td class="tam-row-num">'+(i+1)+'</td>' +
        '<td><strong>'+tamEsc(g.ref)+'</strong>'+badge+'</td>' +
        '<td>'+tamEsc(typeNome)+'</td>' +
        '<td>'+g.pieces+'</td>' +
        '<td>'+tamFmtEU(g.unitPriceWithShip)+' €</td>' +
        '<td><strong>'+tamFmtEU(g.grandTotal)+' €</strong></td>' +
        '<td class="'+checkCls+'">'+checkIcon+'</td>' +
        '</tr>';
    });

    html += '</tbody><tfoot>' +
      '<tr><td class="tam-row-num"></td><td colspan="2"><strong>subtotal mercadoria</strong></td>' +
      '<td><strong>'+r.totalPieces+' un</strong></td><td></td><td><strong>'+tamFmtEU(r.subtotalGoods)+' €</strong></td><td></td></tr>' +
      '<tr class="tam-tr-ship"><td class="tam-row-num"></td><td colspan="2">transporte · '+r.shipPkgs+' pacotes × 17,50 €</td>' +
      '<td></td><td></td><td>'+tamFmtEU(r.shipping)+' €</td><td></td></tr>' +
      '<tr class="tam-tr-grand"><td class="tam-row-num"></td><td colspan="2"><strong>total geral</strong></td>' +
      '<td><strong>'+r.totalPieces+' un</strong></td><td></td><td><strong>'+tamFmtEU(r.grandTotal)+' €</strong></td><td></td></tr>' +
      '</tfoot></table>';

    document.getElementById('tam-results-wrap').innerHTML = html;
  }

  /* ════════════════════════════════════════════════════════════
     INJECT STYLES (once)
  ════════════════════════════════════════════════════════════ */
  function tamEnsureStyles() {
    if (document.getElementById('tam-xv-styles')) return;
    var s = document.createElement('style');
    s.id  = 'tam-xv-styles';
    s.textContent =
      '.tam-row-conflict td{background:#fff8e1!important}' +
      '.tam-row-solo td{background:#f5f5f5!important}' +
      '.tam-chk-warn{color:#e67e00;font-weight:bold;text-align:center}' +
      '.tam-chk-solo{color:#999;font-weight:bold;text-align:center}' +
      '.tam-badge{display:inline-block;margin-left:5px;font-size:.6rem;padding:1px 4px;border-radius:3px;vertical-align:middle;font-weight:bold;color:#fff}' +
      '.tam-badge-conflict{background:#e67e00}' +
      '.tam-badge-solo_a,.tam-badge-solo_b{background:#999}' +
      '.tam-conflict-ref{font-weight:bold;color:#c00}';
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════
     EXPORT CSV
  ════════════════════════════════════════════════════════════ */
  document.getElementById('tam-export-btn').addEventListener('click', function() {
    if (!tamCurrentResult) return;
    var r = tamCurrentResult;
    var lines = ['\uFEFF'+['Referência','Tipo · Nome','Unidades','P.Unit c/ Envio (€)','Total (€)','OK','Verificação'].join(';')];
    r.grouped.forEach(function(g) {
      var ok = g.lines ? g.lines.every(function(l){ return l.valid; }) : true;
      var tn = (g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+( g.name||'');
      lines.push([g.ref, tn, g.pieces, tamFmtEU(g.unitPriceWithShip), tamFmtEU(g.grandTotal), ok?'SIM':'NÃO', g.confidence||'CONFIRMED'].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','',r.totalPieces,'',tamFmtEU(r.subtotalGoods),'',''].join(';'));
    lines.push(['Transporte ('+r.shipPkgs+' × 17,50 €)','','','',tamFmtEU(r.shipping),'',''].join(';'));
    lines.push(['Total geral','',r.totalPieces,'',tamFmtEU(r.grandTotal),'',''].join(';'));
    var blob = new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href=url; a.download='TAM_'+(r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  });

})();
