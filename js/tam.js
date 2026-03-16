// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser
// ══════════════════════════════════════════════════════════════
(function() {

  /* ── Drag & drop ── */
  const upLabel = document.getElementById('tam-upload-label');
  if (!upLabel) return;
  upLabel.addEventListener('dragover', function(e) { e.preventDefault(); upLabel.classList.add('drag-over'); });
  upLabel.addEventListener('dragleave', function()  { upLabel.classList.remove('drag-over'); });
  upLabel.addEventListener('drop', function(e) {
    e.preventDefault(); upLabel.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') tamHandleFile(f);
  });
  document.getElementById('tam-file-input').addEventListener('change', function(e) {
    if (e.target.files[0]) tamHandleFile(e.target.files[0]);
  });

  /* ── Main handler ── */
  var tamCurrentResult = null;

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
      var result = tamParseInvoice(allRows);
      if (!result.grouped.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }
      document.getElementById('tam-status-msg').textContent =
        result.grouped.length + ' referências · ' + result.totalPieces + ' unidades';

      // Shrink upload label + enable page-level scroll (mirrors s-loaded pattern)
      document.getElementById('tam-upload-label').classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

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

  /* ── Group PDF items by Y coordinate into text rows ── */
  function tamGroupByRows(items) {
    if (!items.length) return [];
    var sorted = items.slice().sort(function(a,b){ return b.transform[5] - a.transform[5]; });
    var rows = [], cur = [sorted[0]], lastY = sorted[0].transform[5];
    for (var i = 1; i < sorted.length; i++) {
      var y = sorted[i].transform[5];
      if (Math.abs(y - lastY) > 3.5) {
        var row = cur.slice().sort(function(a,b){ return a.transform[4]-b.transform[4]; })
                     .map(function(x){ return x.str.trim(); }).filter(function(s){ return s; });
        if (row.length) rows.push(row);
        cur = [sorted[i]]; lastY = y;
      } else { cur.push(sorted[i]); }
    }
    var last = cur.slice().sort(function(a,b){ return a.transform[4]-b.transform[4]; })
                  .map(function(x){ return x.str.trim(); }).filter(function(s){ return s; });
    if (last.length) rows.push(last);
    return rows;
  }

  /* ── Clean model name: remove embedded "44" ── */
  function tamCleanName(name) { return String(name||'').replace(/44/g,''); }

  /* ── Known garment words ── */
  var GARMENT_WORDS = new Set([
    'Blouse','Dress','Skirt','Top','Trouser','Trousers','Cardigan','Pullover',
    'Culotte','Scarf','Jacket','Coat','Shirt','Leggings','Vest','Jumper',
    'Sweater','Blazer','Shorts','Pants','Tee','Tunic','Cape','Poncho',
    'Bodysuit','Overall','Jumpsuit','Romper','Light'
  ]);
  var BRANDS_SET = new Set(['hailys','zabaione']);

  function tamExtractTypeAndName(beforeHS) {
    var words = beforeHS.trim().split(/\s+/).filter(function(w){ return w; });
    var start = 0;
    while (start < words.length && BRANDS_SET.has(words[start].toLowerCase())) start++;
    var relevant = words.slice(start);
    if (!relevant.length) return { type:'', name:'' };
    if (relevant.length === 1) return { type:'', name: tamCleanName(relevant[0]) };
    var modelName  = tamCleanName(relevant[relevant.length - 1]);
    var typeWords  = relevant.slice(0, relevant.length - 1);
    var realGarment = typeWords.find(function(w){ return GARMENT_WORDS.has(w); });
    var abbrevs     = typeWords.filter(function(w){ return !GARMENT_WORDS.has(w); });
    var typeLabel   = realGarment
      ? (abbrevs.length ? realGarment + ' ' + abbrevs.join(' ') : realGarment)
      : typeWords.join(' ');
    return { type: typeLabel.trim(), name: modelName };
  }

  /* ── Core invoice parser ── */
  function tamParseInvoice(allRows) {
    var HS_RE  = /\b(6[0-3]\d{6})\b/;
    var REF_RE = /^[A-Z]{2,5}(-[A-Z0-9]+){1,5}$/;

    var tagged = allRows.map(function(tokens, idx) {
      var joined = tokens.join(' ');
      if (tokens[0] && REF_RE.test(tokens[0]))
        return { idx:idx, type:'REF', ref:tokens[0] };
      var hsM = joined.match(HS_RE);
      if (hsM) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos+8).trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces    = parseInt(numM[1]);
          var unitPrice = tamParseEU(numM[2]);
          var total     = tamParseEU(numM[3]);
          var before    = joined.slice(0, hsPos);
          var tn        = tamExtractTypeAndName(before);
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name, pieces:pieces, unitPrice:unitPrice, total:total };
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
      var refRow = null;
      for (var j = row.idx-1; j >= Math.max(0, row.idx-12); j--) {
        if (tagged[j] && tagged[j].type === 'REF') { refRow = tagged[j]; break; }
      }
      if (refRow) rawItems.push({
        ref: refRow.ref, garmentType: row.garmentType, name: row.name,
        pieces: row.pieces, unitPrice: row.unitPrice, total: row.total,
        valid: Math.abs(row.pieces * row.unitPrice - row.total) < 0.02
      });
    });

    var groupMap = {};
    rawItems.forEach(function(item) {
      if (!groupMap[item.ref]) groupMap[item.ref] = { ref:item.ref, garmentType:item.garmentType, name:item.name, pieces:0, totalCost:0, lines:[] };
      var g = groupMap[item.ref];
      g.pieces    += item.pieces;
      g.totalCost  = tamRound2(g.totalCost + item.total);
      g.lines.push(item);
      if (item.name) g.name = item.name;
      if (item.garmentType) g.garmentType = item.garmentType;
    });
    var grouped = Object.values(groupMap);

    var totalPieces   = grouped.reduce(function(s,g){ return s+g.pieces; }, 0);
    var subtotalGoods = tamRound2(grouped.reduce(function(s,g){ return s+g.totalCost; }, 0));

    var shipRow      = tagged.find(function(r){ return r.type==='SHIP'; });
    var shipping     = shipRow ? shipRow.cost     : 0;
    var shipPkgs     = shipRow ? shipRow.packages : 0;
    var shipPerPiece = totalPieces > 0 ? shipping / totalPieces : 0;

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
      grandTotal: tamRound2(subtotalGoods + shipping),
      invoiceSubtotal,
      invoiceNo:   invNoRow   ? invNoRow.value   : '—',
      invoiceDate: invDateRow ? invDateRow.value : '—'
    };
  }

  /* ── Helpers ── */
  function tamParseEU(s)  { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
  function tamRound2(n)   { return Math.round(n*100)/100; }
  function tamFmtEU(n)    {
    if (n==null||isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function tamEsc(s)      { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Render meta ── */
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

  /* ── Render validation ── */
  function tamRenderValidation(r) {
    var el       = document.getElementById('tam-validation-banner');
    var badLines = r.rawItems.filter(function(i){ return !i.valid; });
    var subOk    = r.invoiceSubtotal !== null ? Math.abs(r.invoiceSubtotal - r.subtotalGoods) < 0.05 : true;
    var allOk    = badLines.length === 0 && subOk;
    var subLine  = r.invoiceSubtotal !== null
      ? 'fatura: <strong>'+tamFmtEU(r.invoiceSubtotal)+' €</strong> · calculado: <strong>'+tamFmtEU(r.subtotalGoods)+' €</strong>'
      : 'calculado: <strong>'+tamFmtEU(r.subtotalGoods)+' €</strong>';
    el.innerHTML =
      '<div class="tam-vi"><em>estado</em><span>'+(allOk?'✅ fatura correcta':'⚠️ divergência detectada')+'</span></div>' +
      '<div class="tam-vi"><em>subtotal mercadoria</em><span>'+subLine+'</span></div>' +
      '<div class="tam-vi"><em>linhas verificadas</em><span><strong>'+(r.rawItems.length-badLines.length)+'/'+r.rawItems.length+'</strong> correctas'+(badLines.length?' · <strong style="color:#c00">'+badLines.length+' com erro</strong>':'')+'</span></div>' +
      '<div class="tam-vi"><em>transporte por unidade</em><span><strong>'+tamFmtEU(r.shipping)+' €</strong> ÷ '+r.totalPieces+' un = <strong>'+tamFmtEU(r.shipPerPiece)+' €/un</strong></span></div>';
    el.className = allOk ? 'ok' : 'err';
  }

  /* ── Render table ── */
  function tamRenderTable(r) {
    if (!r.grouped.length) return;
    var html = '<table class="tam-table"><thead><tr>' +
      '<th class="tam-row-num">#</th>' +
      '<th>referência</th>' +
      '<th>tipo · nome</th>' +
      '<th>unidades</th>' +
      '<th>p. unit. c/ envio</th>' +
      '<th>total</th>' +
      '<th>✓</th>' +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i) {
      var allValid  = g.lines.every(function(l){ return l.valid; });
      var typeNome  = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      html += '<tr>' +
        '<td class="tam-row-num">'+(i+1)+'</td>' +
        '<td><strong>'+tamEsc(g.ref)+'</strong></td>' +
        '<td>'+tamEsc(typeNome)+'</td>' +
        '<td>'+g.pieces+'</td>' +
        '<td>'+tamFmtEU(g.unitPriceWithShip)+' €</td>' +
        '<td><strong>'+tamFmtEU(g.grandTotal)+' €</strong></td>' +
        '<td class="'+(allValid?'tam-chk-ok':'tam-chk-err')+'">'+(allValid?'✓':'✗')+'</td>' +
        '</tr>';
    });

    html += '</tbody><tfoot>' +
      '<tr>' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2"><strong>subtotal mercadoria</strong></td>' +
        '<td><strong>'+r.totalPieces+' un</strong></td>' +
        '<td></td>' +
        '<td><strong>'+tamFmtEU(r.subtotalGoods)+' €</strong></td>' +
        '<td></td>' +
      '</tr>' +
      '<tr class="tam-tr-ship">' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2">transporte · '+r.shipPkgs+' pacotes × 17,50 €</td>' +
        '<td></td><td></td>' +
        '<td>'+tamFmtEU(r.shipping)+' €</td>' +
        '<td></td>' +
      '</tr>' +
      '<tr class="tam-tr-grand">' +
        '<td class="tam-row-num"></td>' +
        '<td colspan="2"><strong>total geral</strong></td>' +
        '<td><strong>'+r.totalPieces+' un</strong></td>' +
        '<td></td>' +
        '<td><strong>'+tamFmtEU(r.grandTotal)+' €</strong></td>' +
        '<td></td>' +
      '</tr>' +
      '</tfoot></table>';

    document.getElementById('tam-results-wrap').innerHTML = html;
  }

  /* ── Excel (CSV) export ── */
  document.getElementById('tam-export-btn').addEventListener('click', function() {
    if (!tamCurrentResult) return;
    var r = tamCurrentResult;
    var BOM = '\uFEFF';
    var lines = [];
    lines.push(['Referência','Tipo · Nome','Unidades','P. Unit. c/ Envio (€)','Total (€)','OK'].join(';'));
    r.grouped.forEach(function(g) {
      var allValid = g.lines.every(function(l){ return l.valid; });
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'');
      lines.push([g.ref, typeNome, g.pieces, tamFmtEU(g.unitPriceWithShip), tamFmtEU(g.grandTotal), allValid?'SIM':'NÃO'].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','', r.totalPieces, '', tamFmtEU(r.subtotalGoods), ''].join(';'));
    lines.push(['Transporte ('+r.shipPkgs+' pacotes × 17,50 €)','','','', tamFmtEU(r.shipping),''].join(';'));
    lines.push(['Total geral','', r.totalPieces, '', tamFmtEU(r.grandTotal), ''].join(';'));
    var csv  = BOM + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = 'TAM_' + (r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_') + '.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });

})();
