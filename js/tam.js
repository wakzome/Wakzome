// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser  v6
//  · Triple engine cross-check
//  · Fixed: invoice number (ZY-) detection anywhere in row
//  · Fixed: nome column always visible with proper width
//  · Persistent motor selector — always shown on divergence,
//    click any motor to switch, active motor stays highlighted
// ══════════════════════════════════════════════════════════════
(function () {

  /* ── drag & drop ─────────────────────────────────────────── */
  var upLabel = document.getElementById('tam-upload-label');
  if (!upLabel) return;
  upLabel.addEventListener('dragover',  function(e){ e.preventDefault(); upLabel.classList.add('drag-over'); });
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
  var tamEngineResults = {};      // { A, B, C } — kept across renders
  var tamActiveEngine  = null;    // 'A'|'B'|'C'|null (null = auto)

  /* ════════════════════════════════════════════════════════════
     MAIN HANDLER
  ════════════════════════════════════════════════════════════ */
  async function tamHandleFile(file) {
    ['tam-results-wrap','tam-invoice-meta','tam-validation-banner'].forEach(function(id){
      var el = document.getElementById(id);
      el.className = ''; el.innerHTML = '';
    });
    document.getElementById('tam-file-name').textContent = file.name;
    document.getElementById('tam-status-msg').textContent = 'a processar…';
    document.getElementById('tam-export-btn').classList.remove('show');
    tamCurrentResult = null; tamEngineResults = {}; tamActiveEngine = null;

    try {
      var buf = await file.arrayBuffer();
      var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      var allRows = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        var page = await pdf.getPage(p);
        allRows.push.apply(allRows, tamGroupByRows((await page.getTextContent()).items));
      }

      var resA = tamEngineA(allRows);
      var resB = tamEngineB(allRows);
      var resC = tamEngineC(allRows);
      tamEngineResults = { A:resA, B:resB, C:resC };

      var result = tamCrossValidate(resA, resB, resC, null);
      if (!result.grouped.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      document.getElementById('tam-upload-label').classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

      tamEnsureStyles();
      tamApplyResult(result);
    } catch(err) {
      console.error(err);
      document.getElementById('tam-status-msg').textContent = 'erro: ' + err.message;
    }
  }

  function tamApplyResult(result) {
    tamCurrentResult = result;
    tamRenderMeta(result);
    tamRenderValidation(result);
    tamRenderTable(result);
    document.getElementById('tam-export-btn').classList.add('show');
  }

  /* ════════════════════════════════════════════════════════════
     SHARED UTILITIES
  ════════════════════════════════════════════════════════════ */
  var REF_RE = /^[A-Z]{2,5}([-_][A-Z0-9]+){1,6}$/;
  var HS_RE  = /\b(6[0-3]\d{6})\b/;
  // ZY invoice number — can appear anywhere in a row
  var ZY_RE  = /\b(ZY-\d{7,})\b/;

  function tamParseEU(s) { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
  function tamRound2(n)  { return Math.round(n*100)/100; }
  function tamFmtEU(n) {
    if (n==null||isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function tamEsc(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function tamCleanName(n) { return String(n||'').replace(/44/g,''); }

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
    if (relevant.length === 1) return { type:'', name:tamCleanName(relevant[0]) };
    var modelName   = tamCleanName(relevant[relevant.length-1]);
    var typeWords   = relevant.slice(0, relevant.length-1);
    var realGarment = typeWords.find(function(w){ return GARMENT_WORDS.has(w); });
    var abbrevs     = typeWords.filter(function(w){ return !GARMENT_WORDS.has(w); });
    var typeLabel   = realGarment
      ? (abbrevs.length ? realGarment+' '+abbrevs.join(' ') : realGarment)
      : typeWords.join(' ');
    return { type:typeLabel.trim(), name:modelName };
  }

  function tamGroupByRows(items) {
    if (!items.length) return [];
    var sorted = items.slice().sort(function(a,b){ return b.transform[5]-a.transform[5]; });
    var rows=[],cur=[sorted[0]],lastY=sorted[0].transform[5];
    for (var i=1;i<sorted.length;i++) {
      var y = sorted[i].transform[5];
      if (Math.abs(y-lastY)>3.5) {
        var row = cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];})
                     .map(function(x){return x.str.trim();}).filter(Boolean);
        if (row.length) rows.push(row);
        cur=[sorted[i]]; lastY=y;
      } else { cur.push(sorted[i]); }
    }
    var last = cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];})
                  .map(function(x){return x.str.trim();}).filter(Boolean);
    if (last.length) rows.push(last);
    return rows;
  }

  function tamBuildGrouped(rawItems) {
    var map={};
    rawItems.forEach(function(item){
      if (!map[item.ref]) map[item.ref]={
        ref:item.ref, garmentType:item.garmentType, name:item.name,
        pieces:0, totalCost:0, lines:[]
      };
      var g=map[item.ref];
      g.pieces    += item.pieces;
      g.totalCost  = tamRound2(g.totalCost+item.total);
      g.lines.push(item);
      if (item.name)        g.name=item.name;
      if (item.garmentType) g.garmentType=item.garmentType;
    });
    return Object.values(map);
  }

  function tamFinalise(rawItems, tagged) {
    var grouped       = tamBuildGrouped(rawItems);
    var totalPieces   = grouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(grouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipRow       = tagged.find(function(r){return r.type==='SHIP';});
    var shipping      = shipRow ? shipRow.cost     : 0;
    var shipPkgs      = shipRow ? shipRow.packages : 0;
    var shipPerPiece  = totalPieces>0 ? shipping/totalPieces : 0;
    grouped.forEach(function(g){
      var base=g.pieces>0?g.totalCost/g.pieces:0;
      g.unitPriceWithShip = tamRound2(base+shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip*g.pieces);
    });
    var subtotalRows    = tagged.filter(function(r){return r.type==='SUBTOTAL';});
    var invoiceSubtotal = subtotalRows.length ? subtotalRows[0].value : null;
    // Invoice number: first INVOICENO tag found
    var invNoRow   = tagged.find(function(r){return r.type==='INVOICENO';});
    var invDateRow = tagged.find(function(r){return r.type==='DATE';});
    return {
      rawItems, grouped, totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods+shipping),
      invoiceSubtotal,
      invoiceNo:   invNoRow   ? invNoRow.value   : '—',
      invoiceDate: invDateRow ? invDateRow.value : '—'
    };
  }

  /* ────────────────────────────────────────────────────────────
     Common metadata tagger — used by all three engines
     Returns tagged rows array with INVOICENO / DATE / SHIP /
     SUBTOTAL / REF / OTHER.  DATA rows are engine-specific.
  ──────────────────────────────────────────────────────────── */
  function tamTagMeta(joined, tokens, idx) {
    // Invoice number — ZY- anywhere in the row, first occurrence
    var zyM = joined.match(ZY_RE);
    if (zyM) return { idx:idx, type:'INVOICENO', value:zyM[1] };

    if (joined.includes('Datum/Date')) {
      var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (dM) return { idx:idx, type:'DATE', value:dM[1] };
    }
    if (/Versandkosten|Transportation costs/i.test(joined)) {
      var anzM = joined.match(/Anzahl\s+(\d+)\s+([\d.]*\d+,\d{2})/);
      if (anzM) return { idx:idx, type:'SHIP', packages:parseInt(anzM[1]), cost:tamParseEU(anzM[2]) };
    }
    if (/Zwischensumme.*Subtotal/i.test(joined)) {
      var nM = joined.match(/([\d.]*\d+,\d{2})\s*$/);
      if (nM) return { idx:idx, type:'SUBTOTAL', value:tamParseEU(nM[1]) };
    }
    return null; // not a meta row
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE A — HS-code anchor + backward REF search
  ════════════════════════════════════════════════════════════ */
  function tamEngineA(allRows) {
    var tagged = allRows.map(function(tokens, idx){
      var joined = tokens.join(' ');
      var meta   = tamTagMeta(joined, tokens, idx);
      if (meta) return meta;

      if (tokens[0] && REF_RE.test(tokens[0]))
        return { idx:idx, type:'REF', ref:tokens[0] };

      var hsM = joined.match(HS_RE);
      if (hsM) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos+8).trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces=parseInt(numM[1]), unitPrice=tamParseEU(numM[2]), total=tamParseEU(numM[3]);
          var tn=tamExtractTypeAndName(joined.slice(0,hsPos));
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name, pieces, unitPrice, total };
        }
      }
      return { idx:idx, type:'OTHER' };
    });

    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      for (var j=row.idx-1; j>=Math.max(0,row.idx-20); j--) {
        if (tagged[j] && tagged[j].type==='REF') {
          rawItems.push({ ref:tagged[j].ref, garmentType:row.garmentType, name:row.name,
            pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
            valid:Math.abs(row.pieces*row.unitPrice-row.total)<0.02 });
          break;
        }
      }
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE B — forward state-machine
  ════════════════════════════════════════════════════════════ */
  function tamEngineB(allRows) {
    var tagged=[], currentRef=null, currentType='', currentName='';
    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }

      if (tokens[0] && REF_RE.test(tokens[0]) && !HS_RE.test(joined)) {
        var sec=tokens[1]||'';
        if (!sec || /^\d+$/.test(sec)) {
          currentRef=tokens[0]; currentType=''; currentName='';
          tagged.push({ idx:i, type:'REF', ref:currentRef }); continue;
        }
      }
      var hsM=joined.match(HS_RE);
      if (hsM && currentRef) {
        var hsPos=joined.indexOf(hsM[1]);
        var after=joined.slice(hsPos+8).replace(/\s*\*\s*$/,'').trim();
        var numM=after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces=parseInt(numM[1]), unitPrice=tamParseEU(numM[2]), total=tamParseEU(numM[3]);
          var tn=tamExtractTypeAndName(joined.slice(0,hsPos));
          if (tn.name) currentName=tn.name;
          if (tn.type) currentType=tn.type;
          tagged.push({ idx:i, type:'DATA', ref:currentRef, garmentType:currentType,
                        name:currentName, pieces, unitPrice, total }); continue;
        }
      }
      tagged.push({ idx:i, type:'OTHER' });
    }
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      rawItems.push({ ref:row.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
        valid:Math.abs(row.pieces*row.unitPrice-row.total)<0.02 });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE C — math-first triplet strategy
     Finds numeric triplets where pieces×unit≈total.
     Guards: pieces 1–500, unit 0.01–99.99, total>0.
     On multiple matches in same row, takes largest total.
     REF assignment: nearest preceding REF within 30 rows.
  ════════════════════════════════════════════════════════════ */
  function tamEngineC(allRows) {
    var NOISE_RE=/Kunden|Konto|Datum|Seite|TAM FASHION|Wakzome|Hauptsitz|IBAN|Fon|Fax|eMail|Liefer|steuer|Paket|Bruttogewicht|Netto/i;
    var NUM_RE=/\b(\d{1,3})\s+([\d]{1,2}(?:\.\d{3})*,\d{2})\s+([\d]{1,3}(?:\.\d{3})*,\d{2})\b/g;
    var tagged=[];

    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }
      if (NOISE_RE.test(joined)) { tagged.push({ idx:i, type:'OTHER' }); continue; }

      if (tokens[0] && REF_RE.test(tokens[0]) && !HS_RE.test(joined)) {
        var sec=tokens[1]||'';
        if (!sec||/^\d+$/.test(sec)) { tagged.push({ idx:i, type:'REF', ref:tokens[0] }); continue; }
      }

      var rowStr=joined.replace(/\s*\*\s*/g,' ');
      NUM_RE.lastIndex=0;
      var m, best=null;
      while ((m=NUM_RE.exec(rowStr))!==null) {
        var pieces=parseInt(m[1]), unitPrice=tamParseEU(m[2]), total=tamParseEU(m[3]);
        if (pieces<1||pieces>500)    continue;
        if (unitPrice<=0||unitPrice>=100) continue;
        if (total<=0)                continue;
        if (Math.abs(tamRound2(pieces*unitPrice)-total)>=0.02) continue;
        if (!best||total>best.total) {
          var tn=tamExtractTypeAndName(rowStr.slice(0,m.index));
          best={ pieces, unitPrice, total, tn };
        }
      }
      if (best) {
        tagged.push({ idx:i, type:'DATA_C', garmentType:best.tn.type, name:best.tn.name,
                      pieces:best.pieces, unitPrice:best.unitPrice, total:best.total }); continue;
      }
      tagged.push({ idx:i, type:'OTHER' });
    }

    var refPositions=tagged.filter(function(t){return t.type==='REF';});
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA_C') return;
      var nearest=null, minDist=999;
      refPositions.forEach(function(r){
        var dist=row.idx-r.idx;
        if (dist>0&&dist<30&&dist<minDist){ minDist=dist; nearest=r; }
      });
      if (!nearest) { // try forward (≤5)
        refPositions.forEach(function(r){
          var dist=r.idx-row.idx;
          if (dist>0&&dist<=5&&dist<minDist){ minDist=dist; nearest=r; }
        });
      }
      if (nearest) rawItems.push({ ref:nearest.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total, valid:true });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ════════════════════════════════════════════════════════════
     CROSS-VALIDATION (3 engines)
     manualLabel: 'A'|'B'|'C'|null  — forces a specific engine
  ════════════════════════════════════════════════════════════ */
  function tamCrossValidate(resA, resB, resC, manualLabel) {
    function score(res){
      if (!res.grouped.length) return 9999;
      if (res.invoiceSubtotal==null) return 5000-res.grouped.length;
      return Math.abs(res.invoiceSubtotal-res.subtotalGoods);
    }
    var engines=[
      {label:'A',res:resA,score:score(resA)},
      {label:'B',res:resB,score:score(resB)},
      {label:'C',res:resC,score:score(resC)}
    ].sort(function(a,b){return a.score-b.score;});

    var autoLabel  = engines[0].label;
    var activeLabel= manualLabel || autoLabel;
    var activeRes  = {A:resA,B:resB,C:resC}[activeLabel];

    var mapA={},mapB={},mapC={};
    resA.grouped.forEach(function(g){mapA[g.ref]=g;});
    resB.grouped.forEach(function(g){mapB[g.ref]=g;});
    resC.grouped.forEach(function(g){mapC[g.ref]=g;});

    var allRefs={};
    [resA,resB,resC].forEach(function(r){r.grouped.forEach(function(g){allRefs[g.ref]=true;});});
    allRefs=Object.keys(allRefs);

    var confirmed=0, conflicts=[];
    var mergedGrouped=allRefs.map(function(ref){
      var a=mapA[ref],b=mapB[ref],c=mapC[ref];
      var present=[a,b,c].filter(Boolean);
      if (!present.length) return null;

      var p0=present[0].pieces, t0=present[0].totalCost;
      var allAgree=present.every(function(g){
        return g.pieces===p0 && Math.abs(g.totalCost-t0)<0.02;
      });
      if (allAgree && present.length>1) {
        confirmed++;
        return Object.assign({},present[0],{confidence:'CONFIRMED',enginesCount:present.length});
      }

      // Use active engine's value for this ref (or best engine if active doesn't have it)
      var maps={A:mapA,B:mapB,C:mapC};
      var chosen=maps[activeLabel][ref]||(maps[autoLabel][ref])||present[0];

      var detailParts=[];
      if(a) detailParts.push('A: '+a.pieces+' un / '+tamFmtEU(a.totalCost)+'€');
      if(b) detailParts.push('B: '+b.pieces+' un / '+tamFmtEU(b.totalCost)+'€');
      if(c) detailParts.push('C: '+c.pieces+' un / '+tamFmtEU(c.totalCost)+'€');

      if (present.length===1) {
        var lbl=a?'SOLO_A':b?'SOLO_B':'SOLO_C';
        return Object.assign({},present[0],{confidence:lbl,enginesCount:1});
      }
      conflicts.push({ref, detail:detailParts.join(' · ')});
      return Object.assign({},chosen,{
        confidence:'CONFLICT',
        conflictDetail:detailParts.join(' · '),
        enginesCount:present.length
      });
    }).filter(Boolean);

    // Recalculate shipping distribution based on merged totals
    var totalPieces   = mergedGrouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(mergedGrouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipping  = activeRes.shipping  || resA.shipping  || resB.shipping  || resC.shipping;
    var shipPkgs  = activeRes.shipPkgs  || resA.shipPkgs  || resB.shipPkgs  || resC.shipPkgs;
    var shipPerPiece = totalPieces>0 ? shipping/totalPieces : 0;
    mergedGrouped.forEach(function(g){
      var base=g.pieces>0?g.totalCost/g.pieces:0;
      g.unitPriceWithShip=tamRound2(base+shipPerPiece);
      g.grandTotal=tamRound2(g.unitPriceWithShip*g.pieces);
    });

    var meta=[resA,resB,resC].find(function(r){return r.invoiceNo!=='—';})||resA;
    var fullyAgree=conflicts.length===0 &&
                   mergedGrouped.every(function(g){return g.confidence==='CONFIRMED';});

    return {
      grouped:mergedGrouped, rawItems:activeRes.rawItems,
      totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods+shipping),
      invoiceSubtotal: meta.invoiceSubtotal,
      invoiceNo:       meta.invoiceNo,
      invoiceDate:     meta.invoiceDate,
      xv:{
        confirmed, conflicts, fullyAgree,
        autoEngine:  autoLabel,
        activeEngine:activeLabel,
        isManual:    !!manualLabel,
        engines: engines.map(function(e){
          return { label:e.label, refs:e.res.grouped.length,
                   units:e.res.totalPieces, sub:e.res.subtotalGoods, score:tamRound2(e.score) };
        })
      }
    };
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: META
  ════════════════════════════════════════════════════════════ */
  function tamRenderMeta(r) {
    document.getElementById('tam-status-msg').textContent=
      (r.invoiceNo!=='—' ? r.invoiceNo+'  ·  ' : '')+
      r.grouped.length+' referências · '+r.totalPieces+' unidades';

    var el=document.getElementById('tam-invoice-meta');
    el.innerHTML=
      '<div class="tam-mi"><em>fatura nº</em><strong>'+tamEsc(r.invoiceNo)+'</strong></div>'+
      '<div class="tam-mi"><em>data</em><strong>'+tamEsc(r.invoiceDate)+'</strong></div>'+
      '<div class="tam-mi"><em>fornecedor</em><strong>TAM Fashion GmbH</strong></div>'+
      '<div class="tam-mi"><em>cliente</em><strong>Wakzome LDA</strong></div>'+
      '<div class="tam-mi"><em>referências</em><strong>'+r.grouped.length+'</strong></div>'+
      '<div class="tam-mi"><em>total unidades</em><strong>'+r.totalPieces+'</strong></div>'+
      '<div class="tam-mi"><em>envio (pacotes)</em><strong>'+r.shipPkgs+'</strong></div>';
    el.classList.add('show');
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: VALIDATION BANNER
     Motor selector is ALWAYS shown when there is divergence,
     regardless of whether user already chose one.
     Clicking a motor button rebuilds from that engine.
  ════════════════════════════════════════════════════════════ */
  function tamRenderValidation(r) {
    var el  = document.getElementById('tam-validation-banner');
    var xv  = r.xv;
    var subOk = r.invoiceSubtotal!=null ? Math.abs(r.invoiceSubtotal-r.subtotalGoods)<0.05 : true;
    var allOk = xv.fullyAgree && subOk;

    var subLine = r.invoiceSubtotal!=null
      ? 'fatura: <strong>'+tamFmtEU(r.invoiceSubtotal)+'€</strong> · calculado: <strong>'+tamFmtEU(r.subtotalGoods)+'€</strong>'
      : 'calculado: <strong>'+tamFmtEU(r.subtotalGoods)+'€</strong>';

    var cvHtml='';

    if (allOk) {
      cvHtml='<div class="tam-vi" style="color:#2a7a2a"><em>tripla verificação</em>'+
             '<span>✅ todos os motores coincidem · <strong>'+xv.confirmed+' refs confirmadas</strong></span></div>';
    } else {
      // Engine stats row
      var engLines=xv.engines.map(function(e){
        var star = e.label===xv.autoEngine ? ' ★' : '';
        return 'Motor <strong>'+e.label+star+'</strong>: '+e.refs+' refs / '+e.units+' un / '+tamFmtEU(e.sub)+'€';
      }).join('&emsp;&emsp;');
      cvHtml+='<div class="tam-vi"><em>motores</em><span style="white-space:nowrap">'+engLines+'</span></div>';

      if (xv.confirmed>0)
        cvHtml+='<div class="tam-vi"><em>coincidências</em><span><strong>'+xv.confirmed+'</strong> refs iguais em vários motores</span></div>';

      if (xv.conflicts.length) {
        var cLines=xv.conflicts.map(function(c){
          return '<span class="tam-conflict-ref">'+tamEsc(c.ref)+'</span> ('+tamEsc(c.detail)+')';
        }).join('<br>');
        cvHtml+='<div class="tam-vi"><em style="color:#c00">⚠️ conflitos ('+xv.conflicts.length+')</em><span>'+cLines+'</span></div>';
      }

      // ── Motor selector — always visible on divergence ──
      var selectorBtns=xv.engines.map(function(e, rank){
        var er=tamEngineResults[e.label];
        var refs=er?er.grouped.length:0, units=er?er.totalPieces:0;
        var sub=er?tamFmtEU(er.subtotalGoods):'—';
        var isActive = e.label===xv.activeEngine;
        var isBest   = e.label===xv.autoEngine;
        var cls='tam-ebtn'+(isActive?' tam-ebtn-active':'');
        return '<button class="'+cls+'" data-engine="'+e.label+'">'+
                 '<span class="tam-ebtn-label">'+(rank+1)+'. Motor '+e.label+(isBest?' ★':'')+'</span>'+
                 '<span class="tam-ebtn-detail">'+refs+' refs · '+units+' un<br>'+sub+' €</span>'+
               '</button>';
      }).join('');

      cvHtml+=
        '<div class="tam-vi tam-engine-sel-wrap">'+
          '<em>'+(xv.isManual ? 'motor activo (manual)' : 'seleccionar motor')+'</em>'+
          '<span class="tam-engine-btns">'+selectorBtns+'</span>'+
        '</div>';
    }

    var badLines=r.rawItems.filter(function(i){return !i.valid;});
    el.innerHTML=
      '<div class="tam-vi"><em>estado</em><span>'+(allOk?'✅ fatura correcta':'⚠️ verificar itens marcados')+'</span></div>'+
      '<div class="tam-vi"><em>subtotal mercadoria</em><span>'+subLine+'</span></div>'+
      '<div class="tam-vi"><em>linhas verificadas</em><span>'+
        '<strong>'+(r.rawItems.length-badLines.length)+'/'+r.rawItems.length+'</strong> correctas'+
        (badLines.length?' · <strong style="color:#c00">'+badLines.length+' com erro</strong>':'')+'</span></div>'+
      cvHtml+
      '<div class="tam-vi"><em>transporte/unidade</em><span>'+
        '<strong>'+tamFmtEU(r.shipping)+'€</strong> ÷ '+r.totalPieces+' = '+
        '<strong>'+tamFmtEU(r.shipPerPiece)+'€/un</strong></span></div>';

    el.className = allOk ? 'ok' : 'err';

    // Bind motor buttons
    el.querySelectorAll('.tam-ebtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var label = btn.getAttribute('data-engine');
        tamActiveEngine = label;
        var newResult = tamCrossValidate(
          tamEngineResults.A, tamEngineResults.B, tamEngineResults.C, label
        );
        tamApplyResult(newResult);
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     RENDER: TABLE
     · table-layout:fixed with explicit pixel widths on <col>
     · nome column: fixed width 220px, text truncates with ellipsis
     · numeric columns: right-aligned, no wrap, padding for breathing room
  ════════════════════════════════════════════════════════════ */
  function tamRenderTable(r) {
    if (!r.grouped.length) return;

    var html=
      '<table class="tam-table">'+
      '<thead><tr>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">#</th>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">referência</th>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">tipo · nome</th>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">UND</th>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">P.Unit/T</th>'+
        '<th style="text-align:center;white-space:nowrap;padding:4px 10px">Total</th>'+
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var conf    = g.confidence||'CONFIRMED';
      var typeNome= (g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+( g.name||'—');
      var rowCls  = conf==='CONFLICT'  ? ' class="tam-row-conflict"' :
                   (conf==='SOLO_A'||conf==='SOLO_B'||conf==='SOLO_C') ? ' class="tam-row-solo"' : '';
      var tooltip = conf==='CONFLICT' ? ' title="'+tamEsc(g.conflictDetail||'')+'"' : '';
      var badge   = conf!=='CONFIRMED'
        ? '<span class="tam-badge tam-badge-'+conf.toLowerCase()+'">'+conf+'</span>' : '';

      html+=
        '<tr'+rowCls+tooltip+'>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px;color:#aaa;font-size:.72rem">'+(i+1)+'</td>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px">'+
          '<strong>'+tamEsc(g.ref)+'</strong>'+badge+'</td>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px">'+
          tamEsc(typeNome)+'</td>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px">'+g.pieces+'</td>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px">'+tamFmtEU(g.unitPriceWithShip)+'</td>'+
        '<td style="text-align:center;white-space:nowrap;padding:4px 10px"><strong>'+tamFmtEU(g.grandTotal)+'</strong></td>'+
        '</tr>';
    });

    html+=
      '</tbody><tfoot>'+
      '<tr>'+
        '<td></td>'+
        '<td colspan="2" style="text-align:center;padding:4px 10px"><strong>subtotal mercadoria</strong></td>'+
        '<td style="text-align:center;padding:4px 10px"><strong>'+r.totalPieces+'</strong></td>'+
        '<td></td>'+
        '<td style="text-align:center;padding:4px 10px"><strong>'+tamFmtEU(r.subtotalGoods)+'</strong></td>'+
      '</tr>'+
      '<tr class="tam-tr-ship">'+
        '<td></td>'+
        '<td colspan="2" style="text-align:center;padding:4px 10px">transporte · '+r.shipPkgs+' pac. × 17,50 €</td>'+
        '<td></td><td></td>'+
        '<td style="text-align:center;padding:4px 10px">'+tamFmtEU(r.shipping)+'</td>'+
      '</tr>'+
      '<tr class="tam-tr-grand">'+
        '<td></td>'+
        '<td colspan="2" style="text-align:center;padding:4px 10px"><strong>total geral</strong></td>'+
        '<td style="text-align:center;padding:4px 10px"><strong>'+r.totalPieces+'</strong></td>'+
        '<td></td>'+
        '<td style="text-align:center;padding:4px 10px"><strong>'+tamFmtEU(r.grandTotal)+'</strong></td>'+
      '</tr>'+
      '</tfoot></table>';

    document.getElementById('tam-results-wrap').innerHTML=html;
  }

  /* ════════════════════════════════════════════════════════════
     STYLES (injected once)
  ════════════════════════════════════════════════════════════ */
  function tamEnsureStyles(){
    if (document.getElementById('tam-xv-styles')) return;
    var s=document.createElement('style');
    s.id='tam-xv-styles';
    s.textContent=[
      /* Auto layout so columns fit their content exactly */
      '.tam-table{table-layout:auto!important;width:auto!important;min-width:100%;border-collapse:collapse}',
      '.tam-table th,.tam-table td{white-space:nowrap!important}',
      /* Row states */
      '.tam-row-conflict td{background:#fff8e1!important}',
      '.tam-row-solo td{background:#f5f5f5!important}',
      /* Badges */
      '.tam-badge{display:inline-block;margin-left:4px;font-size:.58rem;padding:1px 4px;border-radius:3px;vertical-align:middle;font-weight:bold;color:#fff}',
      '.tam-badge-conflict{background:#e67e00}',
      '.tam-badge-solo_a,.tam-badge-solo_b,.tam-badge-solo_c{background:#999}',
      '.tam-conflict-ref{font-weight:bold;color:#c00}',
      /* Invoice meta panel — always visible when populated */
      '#tam-invoice-meta.show{display:flex!important;flex-wrap:wrap;gap:10px 20px;padding:10px 0}',
      '#tam-invoice-meta .tam-mi{display:flex;flex-direction:column;gap:2px;min-width:120px}',
      '#tam-invoice-meta .tam-mi em{font-style:normal;font-size:.65rem;text-transform:uppercase;letter-spacing:.04em;color:#888}',
      '#tam-invoice-meta .tam-mi strong{font-size:.88rem;color:#111}',
      '.tam-engine-sel-wrap{grid-column:1/-1;width:100%;margin-top:2px}',
      '.tam-engine-btns{display:flex;gap:8px;margin-top:5px;justify-content:center;flex-wrap:wrap}',
      '.tam-ebtn{border:1px solid #ccc;background:#fafafa;padding:6px 18px;border-radius:8px;'+
                'cursor:pointer;font-family:inherit;font-size:.78rem;line-height:1.4;text-align:center;'+
                'transition:background .15s,border-color .15s,color .15s;min-width:100px}',
      '.tam-ebtn:hover{background:#f0f0f0;border-color:#777}',
      '.tam-ebtn-active{background:#222!important;color:#fff!important;border-color:#222!important}',
      '.tam-ebtn-active:hover{background:#444!important}',
      '.tam-ebtn-label{display:block;font-weight:bold;font-size:.82rem}',
      '.tam-ebtn-detail{display:block;font-size:.68rem;opacity:.75;margin-top:1px}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════
     EXPORT CSV
  ════════════════════════════════════════════════════════════ */
  document.getElementById('tam-export-btn').addEventListener('click', function(){
    if (!tamCurrentResult) return;
    var r=tamCurrentResult;
    var lines=['\uFEFF'+['Referência','Tipo · Nome','UND','P.Unit c/ Envio (€)','Total (€)','Verificação'].join(';')];
    r.grouped.forEach(function(g){
      var tn=(g.garmentType||'')+(g.garmentType&&g.name?' · ':'')+(g.name||'');
      lines.push([g.ref,tn,g.pieces,tamFmtEU(g.unitPriceWithShip),tamFmtEU(g.grandTotal),g.confidence||'CONFIRMED'].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','',r.totalPieces,'',tamFmtEU(r.subtotalGoods),''].join(';'));
    lines.push(['Transporte ('+r.shipPkgs+' × 17,50 €)','','','',tamFmtEU(r.shipping),''].join(';'));
    lines.push(['Total geral','',r.totalPieces,'',tamFmtEU(r.grandTotal),''].join(';'));
    var blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='TAM_'+(r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  });

})();
