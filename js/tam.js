// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser + receção de mercadoria  v8
//  · v8: Sistema multi-fatura com receção de caixas
//        Distribuição Funchal / Porto Santo por caixa
//        Resumo consolidado com scroll horizontal
//        Autoguardado de sessão a cada 20s
//        Gestão de sessões (carregar / apagar)
// ══════════════════════════════════════════════════════════════
(function () {

  /* ══════════════════════════════════════════════════════════════
     ESTADO GLOBAL
  ══════════════════════════════════════════════════════════════ */
  var tamInvoices     = [];          // array de resultados parseados
  var tamEngineCache  = {};          // { fileKey: {A,B,C} }
  var tamActiveEngines = {};         // { fileKey: 'A'|'B'|null }
  var tamSession      = null;        // { name, boxes: [{total, refs:{refKey:{f,p}}}, ...] }
  var tamAutoSaveTimer = null;

  /* ══════════════════════════════════════════════════════════════
     DRAG & DROP + FILE INPUT
  ══════════════════════════════════════════════════════════════ */
  var upLabel = document.getElementById('tam-upload-label');
  if (!upLabel) return;

  upLabel.addEventListener('dragover',  function(e){ e.preventDefault(); upLabel.classList.add('drag-over'); });
  upLabel.addEventListener('dragleave', function(){ upLabel.classList.remove('drag-over'); });
  upLabel.addEventListener('drop', function(e){
    e.preventDefault(); upLabel.classList.remove('drag-over');
    var files = Array.from(e.dataTransfer.files).filter(function(f){ return f.type==='application/pdf'; });
    if (files.length) tamHandleFiles(files);
  });
  document.getElementById('tam-file-input').addEventListener('change', function(e){
    var files = Array.from(e.target.files);
    if (files.length) tamHandleFiles(files);
    e.target.value = '';
  });

  /* ══════════════════════════════════════════════════════════════
     BOTONES PRINCIPALES
  ══════════════════════════════════════════════════════════════ */
  document.getElementById('tam-export-btn').addEventListener('click', tamExportCSV);

  // Botón sesiones
  var sesBtn = document.getElementById('tam-sessions-btn');
  if (sesBtn) sesBtn.addEventListener('click', tamOpenSessionsModal);

  // Modal sesiones — cerrar
  var modalOverlay = document.getElementById('tam-sessions-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function(e){
      if (e.target === modalOverlay) tamCloseSessionsModal();
    });
    var closeBtn = document.getElementById('tam-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', tamCloseSessionsModal);
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN HANDLER — procesa uno o varios PDFs
  ══════════════════════════════════════════════════════════════ */
  async function tamHandleFiles(files) {
    tamInvoices = [];
    tamEngineCache = {};
    tamActiveEngines = {};

    // Limpiar UI anterior
    ['tam-results-wrap','tam-invoice-meta','tam-validation-banner'].forEach(function(id){
      var el = document.getElementById(id);
      el.className = ''; el.innerHTML = '';
    });
    document.getElementById('tam-reception-area').innerHTML = '';
    document.getElementById('tam-export-btn').classList.remove('show');
    document.getElementById('tam-file-name').textContent = files.length + ' fatura(s) selecionada(s)';
    document.getElementById('tam-status-msg').textContent = 'a processar…';

    document.getElementById('upload-label').classList.add('loaded');
    document.getElementById('tab-tam').classList.add('tam-loaded');
    document.getElementById('admin-app').classList.add('tam-loaded');

    tamEnsureStyles();

    try {
      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        var buf  = await file.arrayBuffer();
        var pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
        var allRows = [];
        for (var p = 1; p <= pdf.numPages; p++) {
          var page = await pdf.getPage(p);
          allRows.push.apply(allRows, tamGroupByRows((await page.getTextContent()).items));
        }
        var resA = tamEngineA(allRows);
        var resB = tamEngineB(allRows);
        var resC = tamEngineC(allRows);
        var key  = file.name + '_' + fi;
        tamEngineCache[key] = { A: resA, B: resB, C: resC };
        var result = tamCrossValidate(resA, resB, resC, null);
        result._fileKey  = key;
        result._fileName = file.name;
        tamInvoices.push(result);
      }

      if (!tamInvoices.some(function(r){ return r.grouped.length; })) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      // Inicializar sesión si no hay una activa
      if (!tamSession) tamInitSession();

      tamRenderAll();
      document.getElementById('tam-export-btn').classList.add('show');
      tamStartAutoSave();

    } catch(err) {
      console.error(err);
      document.getElementById('tam-status-msg').textContent = 'erro: ' + err.message;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     INICIALIZAR SESIÓN
  ══════════════════════════════════════════════════════════════ */
  function tamInitSession() {
    var d = new Date();
    // Calcular lunes de la semana actual
    var day = d.getDay(); // 0=dom, 1=lun...
    var diff = (day === 0) ? -6 : 1 - day;
    var monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    var dd = String(monday.getDate()).padStart(2,'0');
    var mm = String(monday.getMonth()+1).padStart(2,'0');
    var yyyy = monday.getFullYear();
    var sessionName = 'Sessão TAM ' + dd + '/' + mm + '/' + yyyy;

    // Contar total de cajas de todas las facturas
    var totalBoxes = tamInvoices.reduce(function(s, r){ return s + (r.shipPkgs || 0); }, 0);
    if (totalBoxes < 1) totalBoxes = 1;

    var boxes = [];
    for (var i = 0; i < totalBoxes; i++) {
      boxes.push({ total: null, refs: {}, locked: false });
    }

    tamSession = { name: sessionName, boxes: boxes, createdAt: Date.now() };
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER COMPLETO
  ══════════════════════════════════════════════════════════════ */
  function tamRenderAll() {
    var totalPieces = tamInvoices.reduce(function(s,r){ return s+r.totalPieces; },0);
    var totalRefs   = tamConsolidatedRefs().length;
    document.getElementById('tam-status-msg').textContent =
      tamInvoices.length + ' fatura(s) · ' + totalRefs + ' referências · ' + totalPieces + ' unidades';

    tamRenderInvoices();
    tamRenderReception();
    tamRenderSessionBar();
  }

  /* ──────────────────────────────────────────────────────────────
     RENDER: Facturas arriba (una por una)
  ──────────────────────────────────────────────────────────────── */
  function tamRenderInvoices() {
    var wrap = document.getElementById('tam-results-wrap');
    var meta = document.getElementById('tam-invoice-meta');
    var ban  = document.getElementById('tam-validation-banner');
    wrap.innerHTML = '';
    meta.innerHTML = '';
    meta.className = '';
    ban.innerHTML  = '';
    ban.className  = '';

    if (tamInvoices.length === 1) {
      tamRenderSingleMeta(tamInvoices[0], meta);
      tamRenderSingleValidation(tamInvoices[0], ban);
      tamRenderInvoiceTable(tamInvoices[0], wrap, 0);
    } else {
      meta.style.cssText = 'display:flex!important;flex-wrap:wrap;gap:10px 20px;padding:10px 0;';
      meta.className = 'show';
      tamInvoices.forEach(function(r, idx) {
        var block = document.createElement('div');
        block.className = 'tam-invoice-block';
        block.id = 'tam-invoice-block-' + idx;
        var hdr = document.createElement('div');
        hdr.className = 'tam-invoice-block-header';
        hdr.innerHTML =
          '<span class="tam-inv-num">' + tamEsc(r.invoiceNo) + '</span>' +
          '<span class="tam-inv-meta">' + tamEsc(r.invoiceDate) + ' · ' +
          r.grouped.length + ' refs · ' + r.totalPieces + ' un · ' +
          r.shipPkgs + ' pac.</span>' +
          '<span class="tam-inv-total">' + tamFmtEU(r.grandTotal) + ' €</span>';
        block.appendChild(hdr);
        var tWrap = document.createElement('div');
        tWrap.className = 'tam-inv-table-wrap';
        tamRenderInvoiceTable(r, tWrap, idx);
        block.appendChild(tWrap);
        wrap.appendChild(block);

        // Separador entre facturas
        if (idx < tamInvoices.length - 1) {
          var sep = document.createElement('div');
          sep.className = 'tam-inv-separator';
          wrap.appendChild(sep);
        }
      });
    }
  }

  function tamRenderSingleMeta(r, el) {
    el.innerHTML =
      '<div class="tam-mi"><em>fatura nº</em><strong>' + tamEsc(r.invoiceNo) + '</strong></div>' +
      '<div class="tam-mi"><em>data</em><strong>'      + tamEsc(r.invoiceDate) + '</strong></div>' +
      '<div class="tam-mi"><em>referências</em><strong>' + r.grouped.length + '</strong></div>' +
      '<div class="tam-mi"><em>unidades</em><strong>'  + r.totalPieces + '</strong></div>' +
      '<div class="tam-mi"><em>pacotes</em><strong>'   + r.shipPkgs + '</strong></div>';
    el.className = 'show';
    el.style.cssText = 'display:flex!important;flex-wrap:wrap;gap:10px 20px;padding:10px 0;';
  }

  function tamRenderSingleValidation(r, el) {
    var xv = r.xv;
    var subOk = r.invoiceSubtotal != null ? Math.abs(r.invoiceSubtotal - r.subtotalGoods) < 0.05 : true;
    var allOk = xv.fullyAgree && subOk;
    var subLine = r.invoiceSubtotal != null
      ? 'fatura: <strong>' + tamFmtEU(r.invoiceSubtotal) + '€</strong> · calculado: <strong>' + tamFmtEU(r.subtotalGoods) + '€</strong>'
      : 'calculado: <strong>' + tamFmtEU(r.subtotalGoods) + '€</strong>';
    var cvHtml = '';
    if (allOk) {
      cvHtml = '<div class="tam-vi" style="color:#2a7a2a"><em>verificação</em><span>✅ ' + xv.confirmed + ' refs confirmadas</span></div>';
    } else {
      var engA = xv.engines[0], engB = xv.engines[1];
      cvHtml += '<div class="tam-vi"><em>motores</em><span>A: ' + engA.refs + ' refs / ' + engA.units + ' un &emsp; B: ' + engB.refs + ' refs / ' + engB.units + ' un</span></div>';
      if (!xv.fullyAgree) {
        var selectorBtns = xv.engines.map(function(e, rank){
          var isActive = e.label === xv.activeEngine;
          var cls = 'tam-ebtn' + (isActive ? ' tam-ebtn-active' : '');
          var star = e.label === xv.autoEngine ? ' ★' : '';
          var er = tamEngineCache[r._fileKey][e.label];
          return '<button class="' + cls + '" data-engine="' + e.label + '" data-filekey="' + tamEsc(r._fileKey) + '">' +
            '<span class="tam-ebtn-label">' + (rank+1) + '. Motor ' + e.label + star + '</span>' +
            '<span class="tam-ebtn-detail">' + e.refs + ' refs · ' + e.units + ' un · ' + tamFmtEU(er ? er.subtotalGoods : 0) + ' €</span>' +
            '</button>';
        }).join('');
        cvHtml += '<div class="tam-vi tam-engine-sel-wrap"><em>seleccionar motor</em><span class="tam-engine-btns">' + selectorBtns + '</span></div>';
      }
    }
    el.innerHTML = '<div class="tam-vi"><em>subtotal</em><span>' + subLine + '</span></div>' + cvHtml;
    el.className = allOk ? 'ok' : 'err';

    el.querySelectorAll('.tam-ebtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var label   = btn.getAttribute('data-engine');
        var fileKey = btn.getAttribute('data-filekey');
        tamActiveEngines[fileKey] = label;
        var cache = tamEngineCache[fileKey];
        var newResult = tamCrossValidate(cache.A, cache.B, cache.C, label);
        var idx = tamInvoices.findIndex(function(r){ return r._fileKey === fileKey; });
        if (idx >= 0) {
          newResult._fileKey  = tamInvoices[idx]._fileKey;
          newResult._fileName = tamInvoices[idx]._fileName;
          tamInvoices[idx] = newResult;
          tamRenderAll();
        }
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────
     RENDER: Tabla de factura individual (con columnas Funchal/Porto Santo)
  ──────────────────────────────────────────────────────────────── */
  function tamRenderInvoiceTable(r, container, invIdx) {
    var consolidated = tamConsolidatedRefs();

    var html =
      '<table class="tam-table">' +
      '<thead><tr>' +
        '<th class="tam-th">#</th>' +
        '<th class="tam-th">referência</th>' +
        '<th class="tam-th">tipo · nome</th>' +
        '<th class="tam-th">UND</th>' +
        '<th class="tam-th">P.Unit/T</th>' +
        '<th class="tam-th">Total</th>' +
        '<th class="tam-th tam-th-funchal">Funchal</th>' +
        '<th class="tam-th tam-th-porto">Porto Santo</th>' +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var conf     = g.confidence || 'CONFIRMED';
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      var rowCls   = conf === 'CONFLICT' ? ' class="tam-row-conflict"' : '';
      var badge    = conf === 'CONFLICT' ? '<span class="tam-badge tam-badge-conflict">⚠</span>' : '';

      // Calcular cuánto de este ref ha sido distribuido en esta factura
      var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
      var fVal = distrib.f || 0;
      var pVal = distrib.p || 0;
      var refDone = (fVal + pVal >= g.pieces) && g.pieces > 0;

      var trClass = 'tam-inv-row' + (refDone ? ' tam-ref-complete' : '');

      html +=
        '<tr class="' + trClass + '"' + (conf==='CONFLICT' ? ' title="' + tamEsc(g.conflictDetail||'') + '"' : '') + '>' +
        '<td class="tam-td tam-td-num">' + (i+1) + '</td>' +
        '<td class="tam-td"><strong>' + tamEsc(g.ref) + '</strong>' + badge + '</td>' +
        '<td class="tam-td">' + tamEsc(typeNome) + '</td>' +
        '<td class="tam-td tam-td-num">' + g.pieces + '</td>' +
        '<td class="tam-td tam-td-num">' + tamFmtEU(g.unitPriceWithShip) + '</td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(g.grandTotal) + '</strong></td>' +
        '<td class="tam-td tam-td-num tam-cell-funchal">' + (fVal > 0 ? fVal : '—') + '</td>' +
        '<td class="tam-td tam-td-num tam-cell-porto">'   + (pVal > 0 ? pVal : '—') + '</td>' +
        '</tr>';
    });

    html +=
      '</tbody><tfoot>' +
      '<tr class="tam-tr-sub">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2"><strong>subtotal mercadoria</strong></td>' +
        '<td class="tam-td tam-td-num"><strong>' + r.totalPieces + '</strong></td>' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(r.subtotalGoods) + '</strong></td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' +
      '</tr>' +
      '<tr class="tam-tr-ship">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2">transporte · ' + r.shipPkgs + ' pac. × 17,50 €</td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num">' + tamFmtEU(r.shipping) + '</td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' +
      '</tr>' +
      '<tr class="tam-tr-grand">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2"><strong>total geral</strong></td>' +
        '<td class="tam-td tam-td-num"><strong>' + r.totalPieces + '</strong></td>' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(r.grandTotal) + '</strong></td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' +
      '</tr>' +
      '</tfoot></table>';

    container.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════
     REFERENCIAS CONSOLIDADAS (todas las facturas combinadas)
  ══════════════════════════════════════════════════════════════ */
  function tamConsolidatedRefs() {
    var map = {};
    tamInvoices.forEach(function(r, invIdx){
      r.grouped.forEach(function(g){
        if (!map[g.ref]) {
          map[g.ref] = {
            ref: g.ref,
            garmentType: g.garmentType,
            name: g.name,
            totalPieces: 0,
            invoices: []   // [{invIdx, pieces}]
          };
        }
        map[g.ref].totalPieces += g.pieces;
        map[g.ref].invoices.push({ invIdx: invIdx, pieces: g.pieces });
        if (g.name)        map[g.ref].name = g.name;
        if (g.garmentType) map[g.ref].garmentType = g.garmentType;
      });
    });
    return Object.values(map);
  }

  /* ══════════════════════════════════════════════════════════════
     DISTRIBUCIÓN: obtener F/P totales de un ref a partir de cajas
  ══════════════════════════════════════════════════════════════ */
  function tamGetRefTotals(ref) {
    if (!tamSession) return { f: 0, p: 0 };
    var f = 0, p = 0;
    tamSession.boxes.forEach(function(box){
      if (box.refs[ref]) {
        f += (box.refs[ref].f || 0);
        p += (box.refs[ref].p || 0);
      }
    });
    return { f: f, p: p };
  }

  /* Distribuir F/P de un ref a una factura específica (llenando en orden) */
  function tamGetRefDistribForInvoice(ref, invIdx) {
    var totals = tamGetRefTotals(ref);
    var fRem = totals.f, pRem = totals.p;
    // Llenar facturas en orden hasta llegar a invIdx
    for (var i = 0; i <= invIdx; i++) {
      var inv = tamInvoices[i];
      var grp = inv.grouped.find(function(g){ return g.ref === ref; });
      if (!grp) continue;
      if (i === invIdx) {
        return { f: Math.min(fRem, grp.pieces), p: Math.min(pRem, grp.pieces - Math.min(fRem, grp.pieces)) };
      }
      var fUsed = Math.min(fRem, grp.pieces);
      var pUsed = Math.min(pRem, grp.pieces - fUsed);
      fRem -= fUsed;
      pRem -= pUsed;
    }
    return { f: 0, p: 0 };
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER: ÁREA DE RECEPCIÓN
  ══════════════════════════════════════════════════════════════ */
  function tamRenderReception() {
    if (!tamSession) return;
    var area = document.getElementById('tam-reception-area');
    if (!area) return;

    var consolidated = tamConsolidatedRefs();
    var boxes = tamSession.boxes;

    // ── SECCIÓN IZQUIERDA: resumen de referencias ──────────────
    var summaryHtml =
      '<div class="tam-rec-summary">' +
      '<div class="tam-rec-summary-title">resumen de referências</div>' +
      '<table class="tam-rec-sum-table">' +
      '<thead><tr>' +
        '<th>#</th><th>referência</th><th>total</th>' +
        '<th class="tam-th-funchal">Funchal</th>' +
        '<th class="tam-th-porto">Porto Santo</th>' +
      '</tr></thead><tbody>';

    consolidated.forEach(function(c, i){
      var totals = tamGetRefTotals(c.ref);
      var received = totals.f + totals.p;
      var isDone = received >= c.totalPieces && c.totalPieces > 0;
      var rowCls = isDone ? 'tam-ref-complete' : '';
      summaryHtml +=
        '<tr class="' + rowCls + '" data-ref="' + tamEsc(c.ref) + '">' +
        '<td class="tam-td-num">' + (i+1) + '</td>' +
        '<td><strong>' + tamEsc(c.ref) + '</strong></td>' +
        '<td class="tam-td-num">' + c.totalPieces + '</td>' +
        '<td class="tam-td-num tam-cell-funchal" id="tam-sum-f-' + tamEsc(c.ref).replace(/[^a-z0-9]/gi,'_') + '">' +
          (totals.f > 0 ? totals.f : '—') + '</td>' +
        '<td class="tam-td-num tam-cell-porto"  id="tam-sum-p-' + tamEsc(c.ref).replace(/[^a-z0-9]/gi,'_') + '">' +
          (totals.p > 0 ? totals.p : '—') + '</td>' +
        '</tr>';
    });

    summaryHtml += '</tbody></table></div>';

    // ── SECCIÓN DERECHA: columnas de cajas ────────────────────
    var boxesHtml =
      '<div class="tam-rec-boxes-wrap">' +
      '<div class="tam-rec-boxes-title">receção por caixa</div>' +
      '<div class="tam-rec-boxes-scroll">' +
      '<table class="tam-rec-boxes-table">' +
      '<thead>' +
      // Fila 1: cabeceras de caja
      '<tr class="tam-boxes-hdr-row">' +
      '<th class="tam-rec-ref-col">referência</th>' +
      '<th class="tam-rec-total-col">total</th>';

    boxes.forEach(function(box, bi){
      var received = 0;
      if (box.total) {
        Object.values(box.refs).forEach(function(v){ received += (v.f||0) + (v.p||0); });
      }
      var boxComplete = box.total && received >= box.total;
      var boxClass = boxComplete ? 'tam-box-col-complete' : '';
      boxesHtml += '<th colspan="2" class="tam-box-header ' + boxClass + '" data-box="' + bi + '">' +
        'Caixa ' + (bi+1) +
        (box.locked ? ' <span class="tam-box-lock">🔒</span>' : '') +
        '</th>';
    });

    boxesHtml += '</tr>' +
      // Fila 2: subheaders F / P y total de caja
      '<tr class="tam-boxes-sub-hdr">' +
      '<th class="tam-rec-ref-col"></th>' +
      '<th class="tam-rec-total-col"></th>';

    boxes.forEach(function(box, bi){
      var received = 0;
      if (box.total) {
        Object.values(box.refs).forEach(function(v){ received += (v.f||0) + (v.p||0); });
      }
      var pctLabel = box.total ? received + '/' + box.total : '';
      var isLocked = box.locked;
      var inputCls = box.total ? 'tam-box-total-input tam-box-declared' : 'tam-box-total-input';
      boxesHtml +=
        '<th class="tam-box-sub-th" colspan="2">' +
        '<div class="tam-box-sub-inner">' +
        '<input type="number" class="' + inputCls + '" ' +
          'id="tam-box-total-' + bi + '" ' +
          'value="' + (box.total || '') + '" ' +
          'placeholder="total caixa" ' +
          (isLocked ? 'disabled ' : '') +
          'min="1" data-box="' + bi + '">' +
        (pctLabel ? '<span class="tam-box-pct">' + pctLabel + '</span>' : '') +
        (isLocked
          ? '<button class="tam-box-edit-btn" data-box="' + bi + '" title="editar">✏️</button>'
          : '') +
        '</div>' +
        '<div class="tam-box-sub-labels">' +
        '<span class="tam-sub-f">Funchal</span>' +
        '<span class="tam-sub-p">Porto Santo</span>' +
        '</div>' +
        '</th>';
    });

    boxesHtml += '</tr></thead><tbody>';

    // Filas de referencias
    consolidated.forEach(function(c){
      var totals = tamGetRefTotals(c.ref);
      var received = totals.f + totals.p;
      var isDone = received >= c.totalPieces && c.totalPieces > 0;
      var rowCls = isDone ? 'tam-ref-complete' : '';
      var safeRef = c.ref.replace(/[^a-z0-9]/gi,'_');

      boxesHtml += '<tr class="' + rowCls + '" data-ref="' + tamEsc(c.ref) + '">' +
        '<td class="tam-rec-ref-col"><strong>' + tamEsc(c.ref) + '</strong></td>' +
        '<td class="tam-rec-total-col tam-td-num">' + c.totalPieces + '</td>';

      boxes.forEach(function(box, bi){
        var isActive = box.total && !box.locked;
        var fVal = (box.refs[c.ref] && box.refs[c.ref].f) || '';
        var pVal = (box.refs[c.ref] && box.refs[c.ref].p) || '';
        var inputAttrs = (!box.total || box.locked) ? 'disabled ' : '';
        boxesHtml +=
          '<td class="tam-rec-cell-f">' +
          '<input type="number" class="tam-rec-input tam-rec-input-f" ' +
            'id="tam-inp-f-' + bi + '-' + safeRef + '" ' +
            'data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-city="f" ' +
            'value="' + fVal + '" min="0" ' + inputAttrs + 'placeholder="—">' +
          '</td>' +
          '<td class="tam-rec-cell-p">' +
          '<input type="number" class="tam-rec-input tam-rec-input-p" ' +
            'id="tam-inp-p-' + bi + '-' + safeRef + '" ' +
            'data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-city="p" ' +
            'value="' + pVal + '" min="0" ' + inputAttrs + 'placeholder="—">' +
          '</td>';
      });

      boxesHtml += '</tr>';
    });

    boxesHtml += '</tbody></table></div></div>';

    area.innerHTML =
      '<div class="tam-rec-area">' +
      '<div class="tam-rec-area-title">receção de mercadoria</div>' +
      '<div class="tam-rec-layout">' +
      summaryHtml +
      boxesHtml +
      '</div>' +
      '</div>';

    // ── BIND EVENTOS ──────────────────────────────────────────

    // Input total de caja
    area.querySelectorAll('.tam-box-total-input').forEach(function(inp){
      inp.addEventListener('change', function(){
        var bi  = parseInt(inp.getAttribute('data-box'));
        var val = parseInt(inp.value);
        if (!isNaN(val) && val > 0) {
          tamSession.boxes[bi].total = val;
          inp.classList.add('tam-box-declared');
          // Habilitar inputs de esa caja
          area.querySelectorAll('[data-box="' + bi + '"]').forEach(function(el){
            if (el.tagName === 'INPUT' && el.classList.contains('tam-rec-input')) {
              el.disabled = false;
            }
          });
        } else {
          tamSession.boxes[bi].total = null;
        }
        tamRenderAll();
        tamScheduleSave();
      });
    });

    // Input de distribución F/P
    area.querySelectorAll('.tam-rec-input').forEach(function(inp){
      inp.addEventListener('input', function(){
        var bi   = parseInt(inp.getAttribute('data-box'));
        var ref  = inp.getAttribute('data-ref');
        var city = inp.getAttribute('data-city');
        var val  = parseInt(inp.value) || 0;
        if (!tamSession.boxes[bi].refs[ref]) tamSession.boxes[bi].refs[ref] = { f: 0, p: 0 };
        tamSession.boxes[bi].refs[ref][city] = val;

        // Verificar si la caja se completó
        tamCheckBoxLock(bi);
        tamUpdateSummaryRow(ref);
        tamUpdateInvoicesRows(ref);
        tamScheduleSave();
      });
    });

    // Botón editar (desbloquear caja)
    area.querySelectorAll('.tam-box-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var bi = parseInt(btn.getAttribute('data-box'));
        tamSession.boxes[bi].locked = false;
        tamRenderAll();
        tamScheduleSave();
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────
     Verificar si una caja alcanzó el total → bloquear
  ──────────────────────────────────────────────────────────────── */
  function tamCheckBoxLock(bi) {
    var box = tamSession.boxes[bi];
    if (!box.total) return;
    var received = 0;
    Object.values(box.refs).forEach(function(v){ received += (v.f||0) + (v.p||0); });
    if (received >= box.total) {
      box.locked = true;
      tamRenderAll();
    }
  }

  /* ──────────────────────────────────────────────────────────────
     Actualizar fila del resumen sin rerenderizar todo
  ──────────────────────────────────────────────────────────────── */
  function tamUpdateSummaryRow(ref) {
    var safeRef = ref.replace(/[^a-z0-9]/gi,'_');
    var totals = tamGetRefTotals(ref);
    var fEl = document.getElementById('tam-sum-f-' + safeRef);
    var pEl = document.getElementById('tam-sum-p-' + safeRef);
    if (fEl) fEl.textContent = totals.f > 0 ? totals.f : '—';
    if (pEl) pEl.textContent = totals.p > 0 ? totals.p : '—';
  }

  /* Actualizar filas de facturas superiores para un ref */
  function tamUpdateInvoicesRows(ref) {
    tamRenderInvoices();
  }

  /* ══════════════════════════════════════════════════════════════
     SESSION BAR
  ══════════════════════════════════════════════════════════════ */
  function tamRenderSessionBar() {
    var bar = document.getElementById('tam-session-bar');
    if (!bar || !tamSession) return;
    bar.style.display = 'flex';
    var nameEl = document.getElementById('tam-session-name');
    if (nameEl) nameEl.value = tamSession.name;
    var stEl = document.getElementById('tam-session-status');
    if (stEl) stEl.textContent = '';
  }

  /* ══════════════════════════════════════════════════════════════
     AUTOGUARDADO
  ══════════════════════════════════════════════════════════════ */
  function tamStartAutoSave() {
    if (tamAutoSaveTimer) clearInterval(tamAutoSaveTimer);
    tamAutoSaveTimer = setInterval(tamSaveSession, 20000);
  }

  function tamScheduleSave() {
    // Guardar en < 1s después de un cambio
    clearTimeout(tamSession._saveDebounce);
    tamSession._saveDebounce = setTimeout(tamSaveSession, 800);
  }

  function tamSaveSession() {
    if (!tamSession) return;
    try {
      var sessions = tamLoadAllSessions();
      sessions[tamSession.name] = {
        name:      tamSession.name,
        savedAt:   Date.now(),
        boxes:     tamSession.boxes,
        invoices:  tamInvoices.map(function(r){ return { invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate, fileName: r._fileName, totalPieces: r.totalPieces, shipPkgs: r.shipPkgs, grouped: r.grouped }; })
      };
      localStorage.setItem('tam_sessions', JSON.stringify(sessions));
      var stEl = document.getElementById('tam-session-status');
      if (stEl) {
        stEl.textContent = 'guardado';
        stEl.classList.add('saved');
        setTimeout(function(){ stEl.textContent = ''; stEl.classList.remove('saved'); }, 2000);
      }
    } catch(e) { console.warn('TAM: erro ao guardar sessão', e); }
  }

  function tamLoadAllSessions() {
    try {
      var raw = localStorage.getItem('tam_sessions');
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL DE SESIONES
  ══════════════════════════════════════════════════════════════ */
  function tamOpenSessionsModal() {
    var modal = document.getElementById('tam-sessions-modal');
    if (!modal) return;
    tamRenderSessionsList();
    modal.classList.add('open');
  }

  function tamCloseSessionsModal() {
    var modal = document.getElementById('tam-sessions-modal');
    if (modal) modal.classList.remove('open');
  }

  function tamRenderSessionsList() {
    var list = document.getElementById('tam-sessions-list');
    if (!list) return;
    var sessions = tamLoadAllSessions();
    var keys = Object.keys(sessions).sort(function(a,b){ return (sessions[b].savedAt||0) - (sessions[a].savedAt||0); });

    if (!keys.length) {
      list.innerHTML = '<div class="tam-sessions-empty">nenhuma sessão guardada</div>';
      return;
    }

    list.innerHTML = keys.map(function(k){
      var s = sessions[k];
      var date = s.savedAt ? new Date(s.savedAt).toLocaleString('pt-PT') : '—';
      var invInfo = s.invoices ? s.invoices.length + ' fatura(s)' : '';
      return '<div class="tam-session-item" data-key="' + tamEsc(k) + '">' +
        '<div class="tam-session-item-info">' +
          '<div class="tam-session-item-name">' + tamEsc(s.name) + '</div>' +
          '<div class="tam-session-item-meta">' + date + (invInfo ? ' · ' + invInfo : '') + '</div>' +
        '</div>' +
        '<button class="tam-session-load-btn" data-key="' + tamEsc(k) + '">carregar</button>' +
        '<button class="tam-session-del-btn"  data-key="' + tamEsc(k) + '">✕</button>' +
        '</div>';
    }).join('');

    list.querySelectorAll('.tam-session-load-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        tamLoadSession(btn.getAttribute('data-key'));
        tamCloseSessionsModal();
      });
    });

    list.querySelectorAll('.tam-session-del-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        tamDeleteSession(btn.getAttribute('data-key'));
        tamRenderSessionsList();
      });
    });
  }

  function tamLoadSession(key) {
    var sessions = tamLoadAllSessions();
    var s = sessions[key];
    if (!s) return;
    tamSession = { name: s.name, boxes: s.boxes, createdAt: s.savedAt };
    // Reconstruir tamInvoices desde los datos guardados (sin pdf)
    if (s.invoices && s.invoices.length) {
      tamInvoices = s.invoices.map(function(inv, idx){
        return {
          invoiceNo:    inv.invoiceNo,
          invoiceDate:  inv.invoiceDate,
          _fileName:    inv.fileName,
          _fileKey:     inv.fileName + '_' + idx,
          totalPieces:  inv.totalPieces,
          shipPkgs:     inv.shipPkgs,
          shipping:     (inv.shipPkgs || 0) * 17.5,
          subtotalGoods: 0,
          grandTotal:   0,
          grouped:      inv.grouped || [],
          xv: { fullyAgree: true, confirmed: (inv.grouped||[]).length, conflicts: [], engines: [{label:'A',refs:0,units:0},{label:'B',refs:0,units:0}], autoEngine:'A', activeEngine:'A', isManual:false }
        };
      });
      tamEnsureStyles();
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');
      document.getElementById('tam-export-btn').classList.add('show');
      document.getElementById('tam-file-name').textContent = s.invoices.length + ' fatura(s) — sessão carregada';
      document.getElementById('tam-status-msg').textContent = 'sessão: ' + s.name;
      tamRenderAll();
      tamStartAutoSave();
    }
  }

  function tamDeleteSession(key) {
    var sessions = tamLoadAllSessions();
    delete sessions[key];
    localStorage.setItem('tam_sessions', JSON.stringify(sessions));
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT CSV
  ══════════════════════════════════════════════════════════════ */
  function tamExportCSV() {
    if (!tamInvoices.length) return;
    var lines = ['\uFEFF' + ['Fatura','Referência','Tipo · Nome','UND','P.Unit c/ Envio (€)','Total (€)','Funchal','Porto Santo'].join(';')];

    tamInvoices.forEach(function(r){
      r.grouped.forEach(function(g){
        var tn = (g.garmentType||'') + (g.garmentType&&g.name?' · ':'') + (g.name||'');
        var totals = tamGetRefTotals(g.ref);
        lines.push([r.invoiceNo, g.ref, tn, g.pieces, tamFmtEU(g.unitPriceWithShip), tamFmtEU(g.grandTotal), totals.f || 0, totals.p || 0].join(';'));
      });
    });

    var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = 'TAM_receção_' + (tamSession ? tamSession.name.replace(/[^a-z0-9]/gi,'_') : 'export') + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  /* ══════════════════════════════════════════════════════════════
     SHARED UTILITIES
  ══════════════════════════════════════════════════════════════ */
  var REF_RE = /^(?!ZY-)(?:[A-Za-z]{1,5}(?:-[A-Za-z]{1,3})*)[-_.](?=[A-Za-z0-9]*\d)[A-Za-z0-9]+((?:[-_.])[A-Za-z0-9]+){0,5}$/;
  var HS_RE  = /\b(\d{8})\b/;
  var ZY_RE  = /\b(ZY-[2][\d]{7,})\b/;

  var KNOWN_REFS_ARR = [
    'HFA-62502025','JUS-25562','JY-20765PTY','MOR-20125','NK-2412046','QJG-2504049',
    'SJA-2501019','BK-148-035','BK-148-037','BK-148-124-2','BK-148-205','DA-251-0282',
    'DO-6353ASAT','NO-801-0278','SYF-251-0418','AY-P-D424-LZ','BK-108-728','BK-133-154',
    'BK-133-156','BK-133-163','BK-144-171','BK-147-085','BK-147-102','BK-148-038',
    'BK-148-047','BK-148-049','BK-148-055','BK-148-057','BK-150-038','BK-150-039',
    'BK-156-017','BK-165-016','BK-165-017','BK-165-020','DA-1911019-3','DA-2211026-A',
    'DA-2302028','DCH-TO2412072','DF-5366-A','DO-6522-1','DO-6683','EB-2302032',
    'EB-801-0197','JIA-TO2402015PTY','JUS-24600','JUS-24757PTY','KY-2211084','LA-2302036',
    'LF-2180','LF-27880','LP-2311010','LP-2311012','LP-2311040','LTF-62509007',
    'MAN-2409030','NK-201-0118-1','NK-2402018','NO-2002076-A','NO-2402002','NO-2402003',
    'QJG-TO2310127','SN-301-0235','SYF-2211088','SYF-2309038','SYF-351-0121','UNF-5021',
    'UNF-5188','YAM-2403022','YU-1911057-2A','YU-201-0334','DF-65106','KY-201-0317',
    'SYF-2311035','SYF-351-0113','SY-PO-401-0167','XIE-62404029','YU-401-0151',
    'BK-108-698','BK-108-725','BK-133-164','BK-133-165','COK-2311032','DF-3910',
    'KY-201-0140','SYF-2301004-1','SYF-251-0199','SYF-251-0298','UNF-3305','UNF-5013',
    'UNF-5043','UNF-5213','UNF-5220','VM-231305-1','VM-TO250201','WAL-251-0281',
    'WAL-251-0290','YKK-1811038-2','YKK-2011001-2','YS-2402024','YS-301-0291',
    'YS-301-0294','YU-251-0208','AY-HS-D-D6175-B','AY-HS-P-D292','AY-HS-P-D6439-B',
    'BAT-C-301-0243','BK-108-566','BK-108-581','BK-108-690','BK-108-716','BK-108-719',
    'BK-123-162','BK-133-129','BK-133-176','BK-134-147','BK-144-150','BK-148-029',
    'BK-148-031','BK-148-033','BK-148-048','BK-153-002','BK-165-019','COK-251-0093-4',
    'DA-2309019','DCH-2302013','DO-6651SAT','DO-6654PLI','DO-6682','EB-201-0390',
    'EMK-BW063','HFA-62304016-1','HFA-659163-1','HFA-659168-2','HFA-659337-1',
    'HFA-72212012','HFA-72301002','HFA-72304014','HFA-72404010','JIA-2402013PTY',
    'JUS-23513','JY-20651','JY-20662-1PTY','JY-20730','JY-20763PTY','KY-2112045-1',
    'KY-2302016','LA-2303084','LA-301-0213','LA-751-0056-1','LF-2022283','LF-22572-A1',
    'LP-801-0155','LT-151-0257','NK-1702038-3A','NO-801-0151','NW-2211049','NX-2203012-1',
    'NX-2211052-1','PMG-5553PTY','QF-2409001','SN-151-0200','SN-751-0051','SN-801-0126',
    'SP-2302023','SXS-301-0293','TIP-22508MUS','UNF-2064','UNF-3172','UNF-3222',
    'UNF-5011','UNF-5019','VM-243301','VM-TO240325','VM-TO250301','YS-301-0298',
    'YU-236-0235-1','EMK-24055','HFA-72212014','HFA-62211001','HFA-62211002',
    'WAL-M0920214','WAL-M0920215','CJ-M0120228','LT-1902026-1','HM-889A','UNI-C159',
    'DCH-2205005','WAL-PO20080052-1','WI-2205015','APP-M0820220','APP-M0820221',
    'APP-M0820222','BUE-2205108','NK-1702038-1B','SYF-2205031','WAL-M0120222',
    'YKK-2205030','DA-2205020','HM-1556-A','HM-2218','JY-20533-T','NK-2205002',
    'NT-2202024','SJI-2107036','YKK-2106021','YKK-2205029','UNI-C356','YG-ZB156-1',
    'YG-ZB156-1Z1','LT-2206043-C','DO-6353SAT','HM-203Z1','COF-2008025','DO-6302',
    'JY-20262','JY-20282','JY-20302','KES-15754','ND-2107033','ND-2108002','NT-2107012',
    'QI-0916525','SKT-2108022','SN-2108038','SS-21825','SYN-2008052-1','SYN-2108047',
    'TD-2108006','VM-230306SET1','WAL-1906018','WAL-20080052-1','WAL-2108052',
    'WB-2007003','WI-2008048-A','MIK-6383A','MIK-9336','SP-2202023','WI-201-0059Z1',
    'KY-201-0132','WS-C-301-0183','HF-301-0187','APP-C-101-0083','KY-201-0088',
    'SXS-151-0114','SN-C-301-0144','SJI-301-0107-1','WAL-201-0157','SP-1907021A',
    'WS-C-751-0045','HM-6983','LT-2108018','KY-201-0127-1','KY-201-0140-1',
    'LT-801-0107','WI-C-101-0084','SP-301-0109-1','SKT-801-0068-1','LT-301-0190',
    'LP-201-0230','SYN-C-241-0240','BK-108-379','LT-2008005','DO-6239','WIN-0915222B',
    'DO-6252','LT-0616471-1','AIM-PO2206037','HM-792Z1','DO-6353Z1SAT','HF-1909005',
    'HF-751-0042','JY-10930A','KY-201-0219','SJI-151-0069-1','SN-C-301-0209',
    'WAL-1908009-1','HM-1971','LA-2206085','NK-701-0024','SN-C-801-0118','TD-2105003',
    'HM-19721','KY-2208046Z1','SP-1907021A-Z1','SP-1907021Z1','WI-2206014','HM-1927',
    'HM-1984','TD-2107001','WAL-1908009','BOX-C-301-0204','SYN-2008041','JY-20352',
    'HF-2208012','SN-2208110-C','APP-2208040','LF-22572','HM-2220','JY-20392SAT',
    'DA-2205022','QI-0915258','LP-151-0140','KY-201-0240','KY-201-0249',
    'SJA-201-0069-2','WAL-1906039-1','TD-2105004','NT-301-0103-1','SJA-101-0069',
    'SJA-201-0232','SN-801-0105','SP-201-0225','WAL-201-0149','WAL-201-0229',
    'YU-201-0227','AIM-2206074','AIM-M0920230','BK-123-037','BK-139-013','DA-2107001',
    'DF-5217','HL-2208001','HRT-M0220232','JY-20387','KY-2206061','LC-22298',
    'NT-2107019','SJA-101-0078','SN-2108038Z1','SN-301-0182','SN-751-0040',
    'SP-1907021-1','SXS-C-301-0184','WAL-1908009-5242','WIN-0616455A','WIN-2008044-1',
    'WS-201-0234','JY-20538MES','LP-2208022Z1','TD-2008064-1','WAL-1908009-5238Z1',
    'JX-1808088','JY-20386','LP-201-0228','LP-2208049','NT-2107019NO.5192',
    'QI-2106031','WIN-1908010A','KI-62205102','BK-108-454','BK-123-039','DO-3748C',
    'LA-0915222A-Z1','LA-801-0046-1','SN-2206034','SP-2208019','SP-2208024',
    'SXS-2208016','WAL-1909005NO.5014','WAL-2008056-1','BK-148-050','BK-123-133',
    'BK-148-051','LT-301-0221','NO-201-0408','AFM-90566','BFA-5561','BFA-9590',
    'BFA-9722','BFA-9945','BIQ-2403010','BK-108-673','BK-108-704','BK-108-724',
    'BK-133-171','BK-134-179','BK-144-185','BK-144-186','BK-144-189','BK-144-190',
    'BK-144-191','BK-144-203','BK-148-005-1','BK-148-013-1','BK-148-028','BK-150-037',
    'BK-156-018','BK-163-010','BUE-2211015','BUE-2311005','COK-2211035','DA-2211023',
    'DA-2309061','DA-2309090','DA-2311031','DA-351-0110','DCH-2211013','EB-2302033',
    'EB-2311009','EBB-2402027','EBB-2402032','EBB-TO2402035','EMK-24787PTY',
    'EMK-BW24003','HFA-62211097','HFA-62508010','HFA-62508011','HFA-62508012',
    'HFA-62508013','HFA-62509003','JG-2302039','JIA-2402001','JIA-C-301-0227',
    'KY-2002064-2','KY-2209028','KY-2311007','KY-2311014','KY-2311016','KY-2412048',
    'KY-251-0292','KY-751-0081','KY-C-201-0322','KY-C-251-0291','LA-751-0037-1',
    'LA-851-0018-1','LF-2179','LP-2309025','LP-2311006','LP-2311013','LT-2309055',
    'LT-301-0288','NK-2209098','NK-2209123-A','NK-2210011','NO-2402040','NO-TO2402005',
    'QJG-2311015','QJG-251-0289','QJG-251-0297','SJA-2302018','YKK-2306014-A',
    'YU-C-201-0293','FAYA-2307002C','BK-156-014','KY-2308034','YU-2202015'
  ];
  var KNOWN_REFS = new Set(KNOWN_REFS_ARR.map(function(r){ return r.toUpperCase(); }));

  function tamIsRef(token) {
    if (!token) return false;
    return REF_RE.test(token) || KNOWN_REFS.has(token.toUpperCase());
  }

  function tamFindRefInRow(tokens) {
    if (tamIsRef(tokens[0])) return tokens[0];
    for (var i = 0; i < tokens.length - 1; i++) {
      var j1 = tokens[i] + ' ' + tokens[i+1];
      if (KNOWN_REFS.has(j1.toUpperCase())) return j1;
      var j2 = tokens[i] + '-' + tokens[i+1];
      if (KNOWN_REFS.has(j2.toUpperCase())) return j2;
    }
    for (var i = 1; i < tokens.length; i++) {
      if (tamIsRef(tokens[i])) return tokens[i];
    }
    return null;
  }

  function tamParseEU(s) { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
  function tamRound2(n)  { return Math.round(n*100)/100; }
  function tamFmtEU(n) {
    if (n==null||isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function tamEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function tamCleanName(n) {
    return String(n||'').replace(/\bModell\s*:\s*/gi,'').replace(/\b\d{8}\b/g,'').replace(/44/g,'').replace(/\s{2,}/g,' ').trim();
  }

  var GARMENT_WORDS = new Set(['Blouse','Dress','Skirt','Top','Trouser','Trousers','Cardigan','Pullover','Pullunder','Culotte','Scarf','Jacket','Coat','Shirt','Leggings','Vest','Jumper','Sweater','Blazer','Shorts','Pants','Tee','Tunic','Cape','Poncho','Bodysuit','Overall','Jumpsuit','Romper','Light']);
  var BRANDS_SET = new Set(['hailys','zabaione']);

  function tamExtractTypeAndName(beforeHS) {
    var cleaned = beforeHS.replace(/\bModell\s*:\s*/gi,'').replace(/\b\d{8}\b/g,'').replace(/\b\d{4,}\b/g,'').trim();
    var words = cleaned.split(/\s+/).filter(Boolean);
    var start = 0;
    while (start < words.length && BRANDS_SET.has(words[start].toLowerCase())) start++;
    var relevant = words.slice(start);
    if (!relevant.length) return { type:'', name:'' };
    if (relevant.length === 1) return { type:'', name:tamCleanName(relevant[0]) };
    var modelName = tamCleanName(relevant[relevant.length-1]);
    var typeWords = relevant.slice(0, relevant.length-1);
    var realGarment = typeWords.find(function(w){ return GARMENT_WORDS.has(w); });
    var abbrevs     = typeWords.filter(function(w){ return !GARMENT_WORDS.has(w); });
    var typeLabel   = realGarment ? (abbrevs.length ? realGarment+' '+abbrevs.join(' ') : realGarment) : typeWords.join(' ');
    return { type:typeLabel.trim(), name:modelName };
  }

  function tamGroupByRows(items) {
    if (!items.length) return [];
    var sorted = items.slice().sort(function(a,b){ return b.transform[5]-a.transform[5]; });
    var rows=[],cur=[sorted[0]],lastY=sorted[0].transform[5];
    for (var i=1;i<sorted.length;i++) {
      var y=sorted[i].transform[5];
      if (Math.abs(y-lastY)>3.5) {
        var row=cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];}).map(function(x){return x.str.trim();}).filter(Boolean);
        if (row.length) rows.push(row);
        cur=[sorted[i]]; lastY=y;
      } else { cur.push(sorted[i]); }
    }
    var last=cur.slice().sort(function(a,b){return a.transform[4]-b.transform[4];}).map(function(x){return x.str.trim();}).filter(Boolean);
    if (last.length) rows.push(last);
    return rows;
  }

  function tamTagMeta(joined, tokens, idx) {
    var zyM = joined.match(ZY_RE);
    if (zyM) {
      var dateOnRow = null;
      if (joined.includes('Datum/Date')) {
        var dSame = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dSame) dateOnRow = dSame[1];
      }
      return { idx:idx, type:'INVOICENO', value:zyM[1], date:dateOnRow };
    }
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
    return null;
  }

  function tamBuildGrouped(rawItems) {
    var map = {};
    rawItems.forEach(function(item){
      if (!map[item.ref]) map[item.ref] = { ref:item.ref, garmentType:item.garmentType, name:item.name, pieces:0, totalCost:0, lines:[] };
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
    var grouped       = tamBuildGrouped(rawItems);
    var totalPieces   = grouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(grouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipRow       = tagged.find(function(r){return r.type==='SHIP';});
    var shipping      = shipRow ? shipRow.cost     : 0;
    var shipPkgs      = shipRow ? shipRow.packages : 0;
    var shipPerPiece  = totalPieces > 0 ? shipping/totalPieces : 0;
    grouped.forEach(function(g){
      var base = g.pieces>0 ? g.totalCost/g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
    });
    var subtotalRows    = tagged.filter(function(r){return r.type==='SUBTOTAL';});
    var invoiceSubtotal = subtotalRows.length ? subtotalRows[0].value : null;
    var invNoRows  = tagged.filter(function(r){return r.type==='INVOICENO';});
    var invNoRow   = invNoRows.find(function(r){return r.date;}) || invNoRows[0] || null;
    var invDateRow = tagged.find(function(r){return r.type==='DATE';});
    var invoiceDate = (invNoRow && invNoRow.date) ? invNoRow.date : invDateRow ? invDateRow.value : '—';
    return { rawItems, grouped, totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
             grandTotal:tamRound2(subtotalGoods+shipping), invoiceSubtotal,
             invoiceNo:invNoRow ? invNoRow.value : '—', invoiceDate };
  }

  /* ── ENGINES ─────────────────────────────────────────────── */
  function tamEngineA(allRows) {
    var tagged = allRows.map(function(tokens, idx){
      var joined = tokens.join(' ');
      var meta = tamTagMeta(joined, tokens, idx);
      if (meta) return meta;
      if (tamIsRef(tokens[0])) return { idx:idx, type:'REF', ref:tokens[0] };
      var _refA = tamFindRefInRow(tokens);
      if (_refA) return { idx:idx, type:'REF', ref:_refA };
      var hsM = joined.match(HS_RE);
      if (hsM) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos+8).trim();
        var numM  = after.match(/^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})/);
        if (numM) {
          var pieces=parseInt(numM[1]), unitPrice=tamParseEU(numM[2]), total=tamParseEU(numM[3]);
          var tn = tamExtractTypeAndName(joined.slice(0,hsPos));
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name, pieces, unitPrice, total };
        }
      }
      return { idx:idx, type:'OTHER' };
    });
    var refByIdx = {};
    tagged.forEach(function(t){ if (t.type==='REF') refByIdx[t.idx]=t; });
    var refIdxList = Object.keys(refByIdx).map(Number).sort(function(a,b){return a-b;});
    var rawItems = [];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      var found = null;
      for (var j=row.idx-1; j>=Math.max(0,row.idx-40); j--) {
        if (tagged[j] && tagged[j].type==='REF') { found=tagged[j]; break; }
      }
      if (!found) {
        for (var k=refIdxList.length-1; k>=0; k--) {
          if (refIdxList[k] < row.idx) { found=refByIdx[refIdxList[k]]; break; }
        }
      }
      if (found) rawItems.push({ ref:found.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
        valid:Math.abs(row.pieces*row.unitPrice-row.total)<0.02 });
    });
    return tamFinalise(rawItems, tagged);
  }

  function tamEngineB(allRows) {
    var tagged=[], currentRef=null, currentType='', currentName='';
    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }
      var _refB = tamIsRef(tokens[0]) ? tokens[0] : (!HS_RE.test(joined) ? tamFindRefInRow(tokens) : null);
      if (_refB) { currentRef=_refB; currentType=''; currentName=''; tagged.push({ idx:i, type:'REF', ref:currentRef }); continue; }
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
          tagged.push({ idx:i, type:'DATA', ref:currentRef, garmentType:currentType, name:currentName, pieces, unitPrice, total }); continue;
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

  function tamEngineC(allRows) {
    var NOISE_RE=/Kunden|Konto|Datum|Seite|TAM FASHION|Wakzome|Hauptsitz|IBAN|Fon|Fax|eMail|Liefer|steuer|Paket|Bruttogewicht|Netto/i;
    var NUM_RE=/\b(\d{1,3})\s+([\d]{1,2}(?:\.\d{3})*,\d{2})\s+([\d]{1,3}(?:\.\d{3})*,\d{2})\b/g;
    var tagged=[];
    for (var i=0; i<allRows.length; i++) {
      var tokens=allRows[i], joined=tokens.join(' ');
      var meta=tamTagMeta(joined, tokens, i);
      if (meta) { tagged.push(meta); continue; }
      if (NOISE_RE.test(joined)) { tagged.push({ idx:i, type:'OTHER' }); continue; }
      var _refC = tamIsRef(tokens[0]) ? tokens[0] : (!HS_RE.test(joined) ? tamFindRefInRow(tokens) : null);
      if (_refC) { tagged.push({ idx:i, type:'REF', ref:_refC }); continue; }
      if (HS_RE.test(joined)) { tagged.push({ idx:i, type:'OTHER' }); continue; }
      var rowStr=joined.replace(/\s*\*\s*/g,' ');
      NUM_RE.lastIndex=0;
      var m, best=null;
      while ((m=NUM_RE.exec(rowStr))!==null) {
        var pieces=parseInt(m[1]), unitPrice=tamParseEU(m[2]), total=tamParseEU(m[3]);
        if (pieces<1||pieces>500)    continue;
        if (unitPrice<=0||unitPrice>=100) continue;
        if (total<=0) continue;
        if (Math.abs(tamRound2(pieces*unitPrice)-total)>=0.02) continue;
        if (!best||total>best.total) { var tn=tamExtractTypeAndName(rowStr.slice(0,m.index)); best={ pieces, unitPrice, total, tn }; }
      }
      if (best) { tagged.push({ idx:i, type:'DATA_C', garmentType:best.tn.type, name:best.tn.name, pieces:best.pieces, unitPrice:best.unitPrice, total:best.total }); continue; }
      tagged.push({ idx:i, type:'OTHER' });
    }
    var refPositions=tagged.filter(function(t){return t.type==='REF';});
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA_C') return;
      var nearest=null, minDist=999;
      refPositions.forEach(function(r){ var dist=row.idx-r.idx; if (dist>0&&dist<30&&dist<minDist){ minDist=dist; nearest=r; } });
      if (!nearest) refPositions.forEach(function(r){ var dist=r.idx-row.idx; if (dist>0&&dist<=5&&dist<minDist){ minDist=dist; nearest=r; } });
      if (nearest) rawItems.push({ ref:nearest.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total, valid:true });
    });
    return tamFinalise(rawItems, tagged);
  }

  /* ── CROSS VALIDATE ──────────────────────────────────────── */
  function tamCrossValidate(resA, resB, resC, manualLabel) {
    function score(res){ if (!res.grouped.length) return 9999; if (res.invoiceSubtotal==null) return 5000-res.grouped.length; return Math.abs(res.invoiceSubtotal-res.subtotalGoods); }
    var scoreA=score(resA), scoreB=score(resB);
    var autoLabel   = scoreA<=scoreB ? 'A' : 'B';
    var activeLabel = (manualLabel==='A'||manualLabel==='B') ? manualLabel : autoLabel;
    var activeRes   = activeLabel==='A' ? resA : resB;
    var mapA={}, mapB={};
    resA.grouped.forEach(function(g){ mapA[g.ref]=g; });
    resB.grouped.forEach(function(g){ mapB[g.ref]=g; });
    var confirmed=0, conflicts=[];
    var activeGrouped = activeRes.grouped.map(function(g){
      var a=mapA[g.ref], b=mapB[g.ref];
      if (a && b) {
        if (a.pieces===b.pieces && Math.abs(a.totalCost-b.totalCost)<0.02) { confirmed++; return Object.assign({},g,{confidence:'CONFIRMED'}); }
        else {
          var detailParts=['A: '+a.pieces+' un / '+tamFmtEU(a.totalCost)+'€','B: '+b.pieces+' un / '+tamFmtEU(b.totalCost)+'€'];
          conflicts.push({ref:g.ref, detail:detailParts.join(' · ')});
          return Object.assign({},g,{confidence:'CONFLICT', conflictDetail:detailParts.join(' · ')});
        }
      }
      confirmed++;
      return Object.assign({},g,{confidence:'CONFIRMED'});
    });
    var totalPieces   = activeGrouped.reduce(function(s,g){return s+g.pieces;},0);
    var subtotalGoods = tamRound2(activeGrouped.reduce(function(s,g){return s+g.totalCost;},0));
    var shipping      = activeRes.shipping  || resA.shipping  || resB.shipping;
    var shipPkgs      = activeRes.shipPkgs  || resA.shipPkgs  || resB.shipPkgs;
    var shipPerPiece  = totalPieces>0 ? shipping/totalPieces : 0;
    activeGrouped.forEach(function(g){
      var base=g.pieces>0?g.totalCost/g.pieces:0;
      g.unitPriceWithShip=tamRound2(base+shipPerPiece);
      g.grandTotal=tamRound2(g.unitPriceWithShip*g.pieces);
    });
    var meta = resA.invoiceNo!=='—' ? resA : resB;
    var fullyAgree = conflicts.length===0 && activeGrouped.every(function(g){return g.confidence==='CONFIRMED';});
    var enginesInfo = [{label:'A',res:resA,score:scoreA},{label:'B',res:resB,score:scoreB}];
    return {
      grouped:activeGrouped, rawItems:activeRes.rawItems,
      totalPieces, subtotalGoods, shipping, shipPkgs, shipPerPiece,
      grandTotal:      tamRound2(subtotalGoods+shipping),
      invoiceSubtotal: meta.invoiceSubtotal,
      invoiceNo:       meta.invoiceNo,
      invoiceDate:     meta.invoiceDate,
      xv:{ confirmed, conflicts, fullyAgree, autoEngine:autoLabel, activeEngine:activeLabel, isManual:!!manualLabel,
           engines: enginesInfo.map(function(e){ return { label:e.label, refs:e.res.grouped.length, units:e.res.totalPieces, sub:e.res.subtotalGoods, score:tamRound2(e.score) }; }) }
    };
  }

  /* ══════════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════════ */
  function tamEnsureStyles() {
    if (document.getElementById('tam-v8-styles')) return;
    var s = document.createElement('style');
    s.id = 'tam-v8-styles';
    s.textContent = [
      /* ── Upload zone compacto cuando ya hay facturas ── */
      '#tam-upload-label.loaded { min-height:0!important; padding:8px 16px!important; }',
      '#tam-upload-label.loaded .upload-icon { display:none!important; }',

      /* ── Session bar ── */
      '#tam-session-bar { display:none; align-items:center; gap:12px; width:100%; max-width:960px; padding:8px 14px; margin-bottom:12px; border:1px solid #e6e6e6; border-radius:12px; background:#fafafa; flex-wrap:wrap; }',
      '#tam-session-name { font-size:.88rem; font-weight:bold; flex:1; border:none; background:transparent; outline:none; color:#000; min-width:200px; font-family:MontserratLight,sans-serif; }',
      '#tam-session-status { font-size:.72rem; font-weight:bold; color:#aaa; }',
      '#tam-session-status.saved { color:#2a8a2a; }',
      '.tam-session-btn { padding:5px 14px; font-size:.75rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #ccc; border-radius:8px; background:#fff; transition:background .15s,color .15s; }',
      '.tam-session-btn:hover { background:#555; color:#fff; border-color:#555; }',

      /* ── Sessions modal ── */
      '#tam-sessions-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:600; justify-content:center; align-items:center; }',
      '#tam-sessions-modal.open { display:flex!important; }',
      '#tam-sessions-box { background:#fff; border-radius:18px; padding:28px 28px 22px; width:520px; max-width:95vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.14); font-family:MontserratLight,sans-serif; }',
      '#tam-sessions-box .tam-modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }',
      '#tam-sessions-box .tam-modal-title { font-size:.78rem; font-weight:bold; text-transform:uppercase; letter-spacing:.06em; color:#aaa; }',
      '#tam-modal-close { background:none; border:none; font-size:1.2rem; cursor:pointer; color:#aaa; padding:0 4px; line-height:1; }',
      '#tam-modal-close:hover { color:#000; }',
      '#tam-sessions-list { overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; min-height:0; }',
      '.tam-sessions-empty { color:#aaa; text-align:center; padding:40px 0; font-size:.88rem; font-weight:bold; }',
      '.tam-session-item { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid #efefef; border-radius:12px; transition:border-color .15s; }',
      '.tam-session-item:hover { border-color:#ccc; }',
      '.tam-session-item-info { flex:1; }',
      '.tam-session-item-name { font-size:.88rem; font-weight:bold; color:#000; }',
      '.tam-session-item-meta { font-size:.72rem; color:#aaa; margin-top:2px; }',
      '.tam-session-load-btn { padding:5px 14px; font-size:.75rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1px solid #555; border-radius:8px; background:#fff; text-transform:lowercase; transition:background .15s,color .15s; }',
      '.tam-session-load-btn:hover { background:#555; color:#fff; }',
      '.tam-session-del-btn { background:none; border:none; cursor:pointer; font-size:.95rem; color:#ccc; padding:2px 6px; border-radius:6px; transition:color .15s,background .15s; }',
      '.tam-session-del-btn:hover { color:#c00; background:rgba(192,0,0,.06); }',

      /* ── Dark mode sessions ── */
      '@media(prefers-color-scheme:dark){',
      '#tam-session-bar{background:#111!important;border-color:#2a2a2a!important;}',
      '#tam-session-name{color:#e8e8e8!important;}',
      '#tam-sessions-box{background:#1a1a1a!important;}',
      '.tam-session-item{border-color:#2a2a2a!important;background:#111!important;}',
      '.tam-session-item:hover{border-color:#444!important;}',
      '.tam-session-item-name{color:#e8e8e8!important;}',
      '.tam-session-load-btn{background:#111!important;border-color:#555!important;color:#aaa!important;}',
      '.tam-session-load-btn:hover{background:#555!important;color:#fff!important;}',
      '}',

      /* ── Tabla de factura con columnas F/P ── */
      '#tam-results-wrap { width:100%; max-width:960px; overflow-x:auto; }',
      '.tam-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:15px; overflow:hidden; font-family:MontserratLight,sans-serif; }',
      '.tam-th { background:#e0e0e0; padding:5px 12px; text-align:center; font-size:.73rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; border:1px solid #e6e6e6; white-space:nowrap; line-height:1.2; }',
      '.tam-th-funchal { background:#e3f2fd!important; color:#1565c0!important; }',
      '.tam-th-porto   { background:#fce4ec!important; color:#880e4f!important; }',
      '.tam-td { padding:3px 12px; border:1px solid #efefef; font-size:.86rem; font-weight:bold; vertical-align:middle; text-align:center; line-height:1.2; white-space:nowrap; }',
      '.tam-td-num { font-variant-numeric:tabular-nums; }',
      '.tam-cell-funchal { background:#f0f8ff; color:#1565c0; font-weight:bold; }',
      '.tam-cell-porto   { background:#fff0f5; color:#880e4f; font-weight:bold; }',
      '.tam-table tbody tr:hover td { background:#f5f5f5; }',
      '.tam-table tbody tr:hover .tam-cell-funchal { background:#ddf0ff; }',
      '.tam-table tbody tr:hover .tam-cell-porto   { background:#ffe0ef; }',
      '.tam-ref-complete td { opacity:.4; }',
      '.tam-table tfoot td { background:#f2f2f2; font-weight:bold; border-top:2px solid #ccc; padding:4px 12px; text-align:center; line-height:1.2; }',
      '.tam-table tfoot tr.tam-tr-ship td { background:#fafafa; font-weight:600; font-size:.82rem; color:#666; border-top:1px solid #e8e8e8; padding:3px 12px; }',
      '.tam-table tfoot tr.tam-tr-grand td { background:#e4e4e4; font-size:.94rem; border-top:2px solid #bbb; }',
      '.tam-row-conflict td { background:#fff8e1!important; }',
      '.tam-badge { display:inline-block; margin-left:5px; font-size:.6rem; padding:1px 5px; border-radius:3px; vertical-align:middle; font-weight:bold; color:#fff; }',
      '.tam-badge-conflict { background:#e67e00; }',
      '.tam-conflict-ref { font-weight:bold; color:#c00; }',

      /* ── Multi-factura: bloques ── */
      '.tam-invoice-block { width:100%; max-width:960px; margin-bottom:8px; border:1px solid #e6e6e6; border-radius:14px; overflow:hidden; }',
      '.tam-invoice-block-header { display:flex; align-items:center; gap:16px; padding:10px 16px; background:#f8f8f8; border-bottom:1px solid #e6e6e6; flex-wrap:wrap; }',
      '.tam-inv-num { font-size:.88rem; font-weight:bold; color:#000; }',
      '.tam-inv-meta { font-size:.75rem; color:#aaa; font-weight:600; flex:1; }',
      '.tam-inv-total { font-size:.88rem; font-weight:bold; color:#000; margin-left:auto; }',
      '.tam-inv-table-wrap { overflow-x:auto; }',
      '.tam-inv-separator { height:1px; background:#e6e6e6; margin:6px 0; width:100%; max-width:960px; }',

      /* ── Meta banner ── */
      '#tam-invoice-meta { display:none; width:100%; max-width:960px; background:#f8f8f8; border-radius:14px; padding:10px 20px; margin-bottom:12px; font-size:.85rem; font-weight:600; color:#444; flex-wrap:wrap; gap:6px 28px; }',
      '#tam-invoice-meta.show { display:flex; }',
      '#tam-invoice-meta .tam-mi { display:flex; flex-direction:column; gap:1px; align-items:center; text-align:center; }',
      '#tam-invoice-meta .tam-mi em { font-style:normal; font-size:.65rem; color:#aaa; text-transform:uppercase; letter-spacing:.07em; }',

      /* ── Validation banner ── */
      '#tam-validation-banner { display:none; width:100%; max-width:960px; border-radius:14px; padding:10px 20px; margin-bottom:14px; font-size:.82rem; font-weight:600; flex-wrap:wrap; gap:6px 24px; }',
      '#tam-validation-banner.ok  { display:flex; background:#f0faf0; color:#2a6a2a; }',
      '#tam-validation-banner.err { display:flex; background:#fff0f0; color:#a00; }',
      '#tam-validation-banner .tam-vi { display:flex; flex-direction:column; gap:0; align-items:center; text-align:center; }',
      '#tam-validation-banner .tam-vi em { font-style:normal; font-size:.64rem; opacity:.6; text-transform:uppercase; letter-spacing:.06em; }',
      '.tam-engine-sel-wrap { grid-column:1/-1; width:100%; margin-top:4px; }',
      '.tam-engine-btns { display:flex; gap:8px; margin-top:6px; justify-content:center; flex-wrap:wrap; }',
      '.tam-ebtn { border:1px solid #ccc; background:#fafafa; padding:7px 20px; border-radius:8px; cursor:pointer; font-family:MontserratLight,sans-serif; font-size:.78rem; line-height:1.45; text-align:center; transition:background .15s,border-color .15s; min-width:110px; }',
      '.tam-ebtn:hover { background:#f0f0f0; border-color:#777; }',
      '.tam-ebtn-active { background:#222!important; color:#fff!important; border-color:#222!important; }',
      '.tam-ebtn-label { display:block; font-weight:bold; font-size:.82rem; }',
      '.tam-ebtn-detail { display:block; font-size:.68rem; opacity:.75; margin-top:2px; }',
      '.tam-chk-ok { color:#2a6a2a; }',
      '.tam-chk-err { color:#c00; }',

      /* ══════════════════════════
         ÁREA DE RECEPCIÓN
      ══════════════════════════ */
      '#tam-reception-area { width:100%; max-width:1400px; margin-top:20px; }',

      '.tam-rec-area { border:1px solid #e6e6e6; border-radius:16px; overflow:hidden; background:#fff; }',
      '.tam-rec-area-title { padding:12px 18px; font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; border-bottom:1px solid #e6e6e6; background:#fafafa; }',
      '.tam-rec-layout { display:flex; gap:0; align-items:flex-start; }',

      /* Resumen izquierdo */
      '.tam-rec-summary { flex-shrink:0; min-width:320px; max-width:420px; border-right:1px solid #e6e6e6; }',
      '.tam-rec-summary-title { padding:10px 14px; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.06em; color:#bbb; border-bottom:1px solid #f0f0f0; background:#fafafa; }',
      '.tam-rec-sum-table { width:100%; border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.82rem; }',
      '.tam-rec-sum-table th { padding:5px 10px; background:#f2f2f2; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; color:#888; border-bottom:1px solid #e6e6e6; text-align:center; white-space:nowrap; }',
      '.tam-rec-sum-table td { padding:4px 10px; border-bottom:1px solid #f5f5f5; text-align:center; font-weight:bold; vertical-align:middle; }',
      '.tam-rec-sum-table tbody tr:hover td { background:#f5f5f5; }',
      '.tam-rec-sum-table .tam-ref-complete td { opacity:.4; }',
      '.tam-th-funchal { background:#e3f2fd!important; color:#1565c0!important; }',
      '.tam-th-porto   { background:#fce4ec!important; color:#880e4f!important; }',

      /* Cajas derecha */
      '.tam-rec-boxes-wrap { flex:1; overflow:hidden; min-width:0; }',
      '.tam-rec-boxes-title { padding:10px 14px; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.06em; color:#bbb; border-bottom:1px solid #f0f0f0; background:#fafafa; }',
      '.tam-rec-boxes-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }',

      '.tam-rec-boxes-table { border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.82rem; white-space:nowrap; }',
      '.tam-rec-boxes-table th, .tam-rec-boxes-table td { border:1px solid #f0f0f0; text-align:center; vertical-align:middle; }',

      /* Cabecera caja */
      '.tam-boxes-hdr-row th { padding:6px 8px; background:#f8f8f8; font-size:.7rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#888; white-space:nowrap; }',
      '.tam-box-header { min-width:120px; background:#f2f2f2!important; }',
      '.tam-box-header.tam-box-col-complete { background:#f0fdf0!important; color:#2a6a2a!important; }',
      '.tam-box-lock { font-size:.75rem; }',

      /* Sub-header (input total + F/P labels) */
      '.tam-boxes-sub-hdr th { padding:4px 6px; background:#fafafa; }',
      '.tam-box-sub-th { min-width:120px; padding:4px 6px!important; }',
      '.tam-box-sub-inner { display:flex; align-items:center; gap:4px; justify-content:center; margin-bottom:3px; }',
      '.tam-box-total-input { width:68px; padding:3px 6px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; border:1.5px solid #ddd; border-radius:7px; text-align:center; outline:none; background:#fff; transition:border-color .2s; }',
      '.tam-box-total-input:focus { border-color:#555; }',
      '.tam-box-total-input.tam-box-declared { border-color:#2a8a2a; color:#2a8a2a; }',
      '.tam-box-total-input:disabled { background:#f8f8f8; color:#888; border-color:#e0e0e0; }',
      '.tam-box-pct { font-size:.68rem; font-weight:bold; color:#888; white-space:nowrap; }',
      '.tam-box-edit-btn { background:none; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:.75rem; padding:1px 5px; transition:background .15s; }',
      '.tam-box-edit-btn:hover { background:#eee; }',
      '.tam-box-sub-labels { display:flex; justify-content:space-around; }',
      '.tam-sub-f { font-size:.65rem; font-weight:bold; color:#1565c0; letter-spacing:.03em; }',
      '.tam-sub-p { font-size:.65rem; font-weight:bold; color:#880e4f; letter-spacing:.03em; }',

      /* Columnas refs en tabla de cajas */
      '.tam-rec-ref-col { min-width:130px; padding:4px 10px!important; background:#fafafa!important; border-right:2px solid #e6e6e6!important; text-align:left!important; }',
      '.tam-rec-total-col { min-width:50px; padding:4px 8px!important; background:#fafafa!important; border-right:2px solid #e6e6e6!important; font-variant-numeric:tabular-nums; }',

      /* Celdas input */
      '.tam-rec-cell-f { background:#f0f8ff; padding:2px 4px!important; min-width:52px; }',
      '.tam-rec-cell-p { background:#fff0f5; padding:2px 4px!important; min-width:52px; border-right:2px solid #e0e0e0!important; }',
      '.tam-rec-input { width:48px; padding:2px 4px; font-size:.8rem; font-weight:bold; font-family:MontserratLight,sans-serif; border:1px solid #ddd; border-radius:6px; text-align:center; outline:none; background:transparent; transition:border-color .15s; }',
      '.tam-rec-input-f { color:#1565c0; }',
      '.tam-rec-input-p { color:#880e4f; }',
      '.tam-rec-input:focus { border-color:#555; background:#fff; }',
      '.tam-rec-input:disabled { background:#f5f5f5; color:#bbb; border-color:#eee; }',
      '.tam-rec-boxes-table tbody tr:hover td { background:#f9f9f9; }',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-f { background:#e3f2fd; }',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-p { background:#fce4ec; }',
      '.tam-rec-boxes-table .tam-ref-complete td { opacity:.4; }',

      /* ── Dark mode receção ── */
      '@media(prefers-color-scheme:dark){',
      '.tam-rec-area{background:#111!important;border-color:#2a2a2a!important;}',
      '.tam-rec-area-title,.tam-rec-summary-title,.tam-rec-boxes-title{background:#161616!important;border-color:#2a2a2a!important;}',
      '.tam-rec-summary{border-color:#2a2a2a!important;}',
      '.tam-rec-sum-table th{background:#1a1a1a!important;border-color:#2a2a2a!important;}',
      '.tam-rec-sum-table td{border-color:#1e1e1e!important;color:#e8e8e8!important;}',
      '.tam-rec-sum-table tbody tr:hover td{background:#1a1a1a!important;}',
      '.tam-boxes-hdr-row th,.tam-box-header{background:#1a1a1a!important;}',
      '.tam-boxes-sub-hdr th{background:#161616!important;}',
      '.tam-box-total-input{background:#111!important;border-color:#333!important;color:#ccc!important;}',
      '.tam-box-total-input:focus{border-color:#888!important;}',
      '.tam-box-total-input.tam-box-declared{border-color:#4caf50!important;color:#4caf50!important;}',
      '.tam-rec-cell-f{background:#0d1f2e!important;}',
      '.tam-rec-cell-p{background:#2e0d1a!important;border-color:#2a2a2a!important;}',
      '.tam-rec-input{border-color:#2a2a2a!important;background:transparent!important;}',
      '.tam-rec-input-f{color:#64b5f6!important;}',
      '.tam-rec-input-p{color:#f48fb1!important;}',
      '.tam-rec-input:focus{border-color:#888!important;background:#111!important;}',
      '.tam-rec-ref-col,.tam-rec-total-col{background:#161616!important;border-color:#2a2a2a!important;}',
      '.tam-rec-boxes-table th,.tam-rec-boxes-table td{border-color:#1e1e1e!important;color:#e8e8e8!important;}',
      '.tam-rec-boxes-table tbody tr:hover td{background:#1a1a1a!important;}',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-f{background:#112233!important;}',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-p{background:#2a1020!important;}',
      '.tam-invoice-block{border-color:#2a2a2a!important;background:#111!important;}',
      '.tam-invoice-block-header{background:#161616!important;border-color:#2a2a2a!important;}',
      '.tam-inv-num,.tam-inv-total{color:#e8e8e8!important;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════
     INYECTAR HTML necesario en #tab-tam si no existe
  ══════════════════════════════════════════════════════════════ */
  (function tamInjectHTML() {
    var tab = document.getElementById('tab-tam');
    if (!tab) return;

    // Renombrar upload-label para que no colisione
    var ul = document.getElementById('tam-upload-label');
    if (ul) ul.id = 'upload-label';

    // Session bar
    if (!document.getElementById('tam-session-bar')) {
      var bar = document.createElement('div');
      bar.id = 'tam-session-bar';
      bar.innerHTML =
        '<input type="text" id="tam-session-name" placeholder="nome da sessão">' +
        '<span id="tam-session-status"></span>' +
        '<button class="tam-session-btn" id="tam-sessions-btn">📋 sessões</button>';
      // Insertar después de tam-upload-zone
      var uz = document.getElementById('tam-upload-zone');
      if (uz && uz.nextSibling) uz.parentNode.insertBefore(bar, uz.nextSibling);
      else if (uz) uz.parentNode.appendChild(bar);
      else tab.insertBefore(bar, tab.firstChild);

      // Bind: cambio de nombre de sesión
      bar.querySelector('#tam-session-name').addEventListener('change', function(e){
        if (tamSession) tamSession.name = e.target.value;
        tamScheduleSave();
      });
    }

    // Reception area
    if (!document.getElementById('tam-reception-area')) {
      var ra = document.createElement('div');
      ra.id = 'tam-reception-area';
      // Insertar después de tam-results-wrap
      var rw = document.getElementById('tam-results-wrap');
      if (rw && rw.nextSibling) rw.parentNode.insertBefore(ra, rw.nextSibling);
      else if (rw) rw.parentNode.appendChild(ra);
      else tab.appendChild(ra);
    }

    // Sessions modal
    if (!document.getElementById('tam-sessions-modal')) {
      var modal = document.createElement('div');
      modal.id = 'tam-sessions-modal';
      modal.innerHTML =
        '<div id="tam-sessions-box">' +
          '<div class="tam-modal-header">' +
            '<span class="tam-modal-title">sessões guardadas</span>' +
            '<button id="tam-modal-close">✕</button>' +
          '</div>' +
          '<div id="tam-sessions-list"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.addEventListener('click', function(e){
        if (e.target === modal) tamCloseSessionsModal();
      });
      modal.querySelector('#tam-modal-close').addEventListener('click', tamCloseSessionsModal);
    }
  })();

})();
