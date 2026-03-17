// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser + receção de mercadoria  v9
//  · v9: Autoguardado fiable (localStorage + Supabase)
//        Biblioteca de referências aprendida automaticamente
//        Sticky ref column fix (background sólido)
// ══════════════════════════════════════════════════════════════
(function () {

  /* ══════════════════════════════════════════════════════════════
     ESTADO GLOBAL
  ══════════════════════════════════════════════════════════════ */
  var tamInvoices      = [];
  var tamEngineCache   = {};
  var tamActiveEngines = {};
  var tamSession       = null;
  var tamAutoSaveTimer = null;
  var tamSaveInFlight  = false;   // evita guardados simultáneos en Supabase

  /* ── Supabase: tabla tam_sessions, bucket/tabla tam_refs ── */
  var TAM_SESSIONS_TABLE = 'tam_sessions';
  var TAM_REFS_TABLE     = 'tam_refs';

  /* Obtener cliente Supabase del sistema (definido en supabase-config.js como sbClient) */
  function tamSB() {
    return (typeof sbClient !== 'undefined') ? sbClient : null;
  }

  /* ══════════════════════════════════════════════════════════════
     DRAG & DROP + FILE INPUT
  ══════════════════════════════════════════════════════════════ */
  var upLabel = document.getElementById('tam-upload-label') || document.getElementById('upload-label');
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

  /* ══════════════════════════════════════════════════════════════
     MAIN HANDLER — procesa uno o varios PDFs
  ══════════════════════════════════════════════════════════════ */
  async function tamHandleFiles(files) {
    document.getElementById('tam-status-msg').textContent = 'a processar…';
    tamEnsureStyles();

    try {
      // Parse all PDFs first to get their invoice numbers
      var parsed = [];
      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        var globalIdx = tamInvoices.length + parsed.length + fi;
        var key = file.name + '_' + globalIdx;
        if (tamEngineCache[key]) continue;

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
        tamEngineCache[key] = { A: resA, B: resB, C: resC };
        var result = tamCrossValidate(resA, resB, resC, null);
        result._fileKey  = key;
        result._fileName = file.name;
        parsed.push(result);
        tamLearnRefsFromResult(result);
      }

      if (!parsed.length) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      // ── Decide: add to current session or create new? ─────
      if (tamSession && tamInvoices.length > 0) {
        // Check if any new invoice number is already in the current session
        var existingNos = tamInvoices.map(function(r){ return r.invoiceNo; });
        var allAlreadyIn = parsed.every(function(r){ return existingNos.indexOf(r.invoiceNo) >= 0; });
        var noneIn       = parsed.every(function(r){ return existingNos.indexOf(r.invoiceNo) < 0; });

        if (noneIn) {
          // Entirely new invoices — ask the user
          var choice = await tamAskSessionChoice(parsed.map(function(r){ return r.invoiceNo; }));
          if (choice === 'new') {
            tamStartNewSession(parsed);
            return;
          }
          // choice === 'add' → fall through to add normally
        }
        // allAlreadyIn or mixed → add normally (skip duplicates)
      }

      // Add parsed invoices to current state
      parsed.forEach(function(r){ tamInvoices.push(r); });

      if (!tamInvoices.some(function(r){ return r.grouped.length; })) {
        document.getElementById('tam-status-msg').textContent = 'nenhum artigo encontrado.';
        return;
      }

      var lbl = document.getElementById('upload-label') || document.getElementById('tam-upload-label');
      if (lbl) lbl.classList.add('loaded');
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');

      if (!tamSession) {
        // Check if a session with this week's name already exists in storage
        var weekName = tamGetWeekSessionName();
        var existing = tamLoadAllSessionsLocal()[weekName];
        if (existing && existing.invoices && existing.invoices.length > 0) {
          // Session exists with same name — ask what to do
          var choiceNew = await tamAskSessionChoiceOnLoad(weekName, parsed.map(function(r){ return r.invoiceNo; }));
          if (choiceNew === 'new') {
            // Archive existing as (1), new session becomes (2)
            var all2 = tamLoadAllSessionsLocal();
            var baseName2 = weekName.replace(/ \(\d+\)$/, '');
            var existingCopy2 = Object.assign({}, existing, { name: baseName2 + ' (1)' });
            delete all2[weekName];
            all2[baseName2 + ' (1)'] = existingCopy2;
            var suffix2 = 2;
            while (all2[baseName2 + ' (' + suffix2 + ')']) suffix2++;
            localStorage.setItem('tam_sessions', JSON.stringify(all2));
            // Create session with next number
            var totalBoxesNew = tamInvoices.reduce(function(s,r){ return s+(r.shipPkgs||0); },0);
            if (totalBoxesNew < 1) totalBoxesNew = 1;
            var boxesNew = [];
            for (var bni = 0; bni < totalBoxesNew; bni++) boxesNew.push({ total:null, refs:{}, locked:false });
            tamSession = { name: baseName2 + ' (' + suffix2 + ')', boxes: boxesNew, createdAt: Date.now() };
          } else {
            // Load existing session and add new invoices to it
            tamLoadSession(weekName, existing);
            // Add the newly parsed invoices on top
            var newInvNos = existing.invoices ? existing.invoices.map(function(i){ return i.invoiceNo; }) : [];
            parsed.forEach(function(r){
              if (newInvNos.indexOf(r.invoiceNo) < 0) tamInvoices.push(r);
            });
            tamSyncSessionBoxes();
            tamRenderAll();
            document.getElementById('tam-export-btn').classList.add('show');
            tamStartAutoSave();
            return;
          }
        } else {
          tamInitSession();
        }
      } else {
        tamSyncSessionBoxes();
      }

      tamRenderAll();
      document.getElementById('tam-export-btn').classList.add('show');
      tamStartAutoSave();

    } catch(err) {
      console.error(err);
      document.getElementById('tam-status-msg').textContent = 'erro: ' + err.message;
    }
  }

  /* Prompt: add to session or start new */
  function tamAskSessionChoice(newInvoiceNos) {
    return new Promise(function(resolve){
      // Remove any existing dialog
      var old = document.getElementById('tam-session-dialog');
      if (old) old.parentNode.removeChild(old);

      var dialog = document.createElement('div');
      dialog.id = 'tam-session-dialog';
      dialog.innerHTML =
        '<div id="tam-session-dialog-box">' +
          '<div class="tam-dialog-title">nova fatura detetada</div>' +
          '<div class="tam-dialog-body">' +
            'A fatura <strong>' + newInvoiceNos.join(', ') + '</strong> não pertence à sessão atual.<br>' +
            'O que pretende fazer?' +
          '</div>' +
          '<div class="tam-dialog-btns">' +
            '<button class="tam-dialog-btn tam-dialog-btn-add">➕ adicionar à sessão atual</button>' +
            '<button class="tam-dialog-btn tam-dialog-btn-new">🆕 criar nova sessão</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dialog);

      dialog.querySelector('.tam-dialog-btn-add').addEventListener('click', function(){
        dialog.parentNode.removeChild(dialog);
        resolve('add');
      });
      dialog.querySelector('.tam-dialog-btn-new').addEventListener('click', function(){
        dialog.parentNode.removeChild(dialog);
        resolve('new');
      });
    });
  }

  /* Start a brand new session, archiving the current one with numbered suffix */
  function tamStartNewSession(parsedInvoices) {
    if (tamSession && tamInvoices.length > 0) {
      var all = tamLoadAllSessionsLocal();
      var baseName = tamSession.name.replace(/ \(\d+\)$/, '');

      // If current session has no suffix yet, rename it to (1) first
      var currentKey = tamSession.name;
      var currentPayload = {
        name:    baseName + ' (1)',
        savedAt: Date.now(),
        boxes:   tamSession.boxes,
        invoices: tamInvoices.map(function(r){
          return { invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate, fileName: r._fileName,
                   totalPieces: r.totalPieces, shipPkgs: r.shipPkgs, shipping: r.shipping,
                   subtotalGoods: r.subtotalGoods, grandTotal: r.grandTotal,
                   invoiceSubtotal: r.invoiceSubtotal, grouped: r.grouped };
        })
      };
      // Remove old unsuffixed entry, save as (1)
      delete all[currentKey];
      all[baseName + ' (1)'] = currentPayload;

      // New session gets (2), (3), etc.
      var suffix = 2;
      while (all[baseName + ' (' + suffix + ')']) suffix++;
      localStorage.setItem('tam_sessions', JSON.stringify(all));

      // Build new session name
      tamInvoices = parsedInvoices;
      tamEngineCache = {};
      tamActiveEngines = {};
      tamSession = null;
      // Force the new session name to use the next suffix
      var totalBoxes = parsedInvoices.reduce(function(s,r){ return s+(r.shipPkgs||0); },0);
      if (totalBoxes < 1) totalBoxes = 1;
      var boxes = [];
      for (var i = 0; i < totalBoxes; i++) boxes.push({ total:null, refs:{}, locked:false });
      tamSession = { name: baseName + ' (' + suffix + ')', boxes: boxes, createdAt: Date.now() };
    } else {
      tamInvoices = parsedInvoices;
      tamEngineCache = {};
      tamActiveEngines = {};
      tamSession = null;
      tamInitSession();
    }

    var lbl = document.getElementById('upload-label') || document.getElementById('tam-upload-label');
    if (lbl) lbl.classList.add('loaded');
    document.getElementById('tab-tam').classList.add('tam-loaded');
    document.getElementById('admin-app').classList.add('tam-loaded');
    document.getElementById('tam-export-btn').classList.add('show');

    tamRenderAll();
    tamStartAutoSave();
    tamSaveSession(false);
  }

  /* Sync session boxes when new invoices are added — add missing boxes */
  function tamSyncSessionBoxes() {
    var totalBoxes = tamInvoices.reduce(function(s, r){ return s + (r.shipPkgs || 0); }, 0);
    if (totalBoxes < 1) totalBoxes = 1;
    while (tamSession.boxes.length < totalBoxes) {
      tamSession.boxes.push({ total: null, refs: {}, locked: false });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     INICIALIZAR SESIÓN
  ══════════════════════════════════════════════════════════════ */
  function tamGetWeekSessionName() {
    var d = new Date();
    var day = d.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    var monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    var dd = String(monday.getDate()).padStart(2,'0');
    var mm = String(monday.getMonth()+1).padStart(2,'0');
    var yyyy = monday.getFullYear();
    return 'Sessão TAM ' + dd + '/' + mm + '/' + yyyy;
  }

  function tamInitSession() {
    var sessionName = tamGetWeekSessionName();
    var totalBoxes = tamInvoices.reduce(function(s, r){ return s + (r.shipPkgs || 0); }, 0);
    if (totalBoxes < 1) totalBoxes = 1;
    var boxes = [];
    for (var i = 0; i < totalBoxes; i++) {
      boxes.push({ total: null, refs: {}, locked: false });
    }
    tamSession = { name: sessionName, boxes: boxes, createdAt: Date.now() };
  }

  /* Dialog: existing session found on fresh load */
  function tamAskSessionChoiceOnLoad(existingName, newInvoiceNos) {
    return new Promise(function(resolve){
      var old = document.getElementById('tam-session-dialog');
      if (old) old.parentNode.removeChild(old);

      var dialog = document.createElement('div');
      dialog.id = 'tam-session-dialog';
      dialog.innerHTML =
        '<div id="tam-session-dialog-box">' +
          '<div class="tam-dialog-title">sessão existente detetada</div>' +
          '<div class="tam-dialog-body">' +
            'Já existe trabalho guardado em <strong>' + tamEsc(existingName) + '</strong>.<br>' +
            'A fatura <strong>' + newInvoiceNos.join(', ') + '</strong> é nova.<br><br>' +
            'O que pretende fazer?' +
          '</div>' +
          '<div class="tam-dialog-btns">' +
            '<button class="tam-dialog-btn tam-dialog-btn-add">➕ continuar na sessão existente</button>' +
            '<button class="tam-dialog-btn tam-dialog-btn-new">🆕 arquivar sessão anterior e criar nova</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dialog);

      dialog.querySelector('.tam-dialog-btn-add').addEventListener('click', function(){
        dialog.parentNode.removeChild(dialog);
        resolve('add');
      });
      dialog.querySelector('.tam-dialog-btn-new').addEventListener('click', function(){
        dialog.parentNode.removeChild(dialog);
        resolve('new');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER COMPLETO
  ══════════════════════════════════════════════════════════════ */
  function tamRenderAll() {
    var totalPieces = tamInvoices.reduce(function(s,r){ return s+r.totalPieces; },0);
    var totalRefs   = tamConsolidatedRefs().length;
    document.getElementById('tam-status-msg').textContent =
      tamInvoices.length + ' fatura(s) · ' + totalRefs + ' referências · ' + totalPieces + ' unidades';
    document.getElementById('tam-file-name').textContent =
      tamInvoices.map(function(r){ return r._fileName; }).join(' · ');

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
      tamRenderInvoiceBanner(tamInvoices[0], ban);
      ban.classList.add(tamInvoices[0].xv.fullyAgree ? 'ok' : 'err');
      // Add X button for single invoice too
      var singleRemove = document.createElement('button');
      singleRemove.className = 'tam-inv-remove-btn';
      singleRemove.title = 'remover fatura da sessão';
      singleRemove.textContent = '✕ remover fatura';
      singleRemove.addEventListener('click', function(){ tamConfirmRemoveInvoice(0); });
      meta.appendChild(singleRemove);
      tamRenderInvoiceTable(tamInvoices[0], wrap, 0);
    } else {
      meta.style.display = 'none';
      ban.style.display  = 'none';
      tamInvoices.forEach(function(r, idx) {
        var block = document.createElement('div');
        block.className = 'tam-invoice-block';
        block.id = 'tam-invoice-block-' + idx;

        // ── Header row ──────────────────────────────────────
        var hdr = document.createElement('div');
        hdr.className = 'tam-invoice-block-header';
        hdr.innerHTML =
          '<span class="tam-inv-num">' + tamEsc(r.invoiceNo) + '</span>' +
          '<span class="tam-inv-meta">' + tamEsc(r.invoiceDate) + ' · ' +
          r.grouped.length + ' refs · ' + r.totalPieces + ' un · ' +
          r.shipPkgs + ' pac.</span>' +
          '<span class="tam-inv-total">' + tamFmtEU(r.grandTotal) + ' €</span>' +
          '<button class="tam-inv-export-btn" data-inv="' + idx + '">⬇ exportar</button>' +
          '<button class="tam-inv-remove-btn" data-inv="' + idx + '" title="remover fatura da sessão">✕</button>';
        block.appendChild(hdr);
        hdr.querySelector('.tam-inv-export-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-export-btn').getAttribute('data-inv'));
          tamExportInvoiceCSV(tamInvoices[i]);
        });
        hdr.querySelector('.tam-inv-remove-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-remove-btn').getAttribute('data-inv'));
          tamConfirmRemoveInvoice(i);
        });

        // ── Validation banner per invoice ──────────────────
        var banEl = document.createElement('div');
        banEl.className = 'tam-inv-banner';
        tamRenderInvoiceBanner(r, banEl);
        block.appendChild(banEl);

        // ── Table ──────────────────────────────────────────
        var tWrap = document.createElement('div');
        tWrap.className = 'tam-inv-table-wrap';
        tamRenderInvoiceTable(r, tWrap, idx);
        block.appendChild(tWrap);
        wrap.appendChild(block);

        if (idx < tamInvoices.length - 1) {
          var sep = document.createElement('div');
          sep.className = 'tam-inv-separator';
          wrap.appendChild(sep);
        }
      });
    }
  }

  /* Confirm and remove an invoice from the session */
  function tamConfirmRemoveInvoice(idx) {
    var r = tamInvoices[idx];
    if (!r) return;
    var confirmDialog = document.createElement('div');
    confirmDialog.id = 'tam-session-dialog';
    confirmDialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">remover fatura</div>' +
        '<div class="tam-dialog-body">' +
          'Tem a certeza que quer remover a fatura <strong>' + tamEsc(r.invoiceNo) + '</strong> da sessão?<br>' +
          '<small style="color:#888">Os dados de distribuição desta fatura serão apagados.</small>' +
        '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-new">🗑 sim, remover</button>' +
          '<button class="tam-dialog-btn tam-dialog-btn-add">cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(confirmDialog);

    confirmDialog.querySelector('.tam-dialog-btn-new').addEventListener('click', function(){
      confirmDialog.parentNode.removeChild(confirmDialog);
      tamRemoveInvoice(idx);
    });
    confirmDialog.querySelector('.tam-dialog-btn-add').addEventListener('click', function(){
      confirmDialog.parentNode.removeChild(confirmDialog);
    });
  }

  function tamRemoveInvoice(idx) {
    var removed = tamInvoices.splice(idx, 1)[0];
    // Remove the engine cache for this invoice
    delete tamEngineCache[removed._fileKey];

    // Recalculate session boxes: remove boxes that came from this invoice's packages
    // and clean up any refs that only existed in this invoice
    if (tamSession) {
      var remainingRefs = new Set();
      tamInvoices.forEach(function(r){
        r.grouped.forEach(function(g){ remainingRefs.add(g.ref); });
      });
      // Clean refs from boxes that no longer exist
      tamSession.boxes.forEach(function(box){
        Object.keys(box.refs).forEach(function(ref){
          if (!remainingRefs.has(ref)) delete box.refs[ref];
        });
      });
      // Remove excess boxes beyond what remaining invoices need
      var neededBoxes = tamInvoices.reduce(function(s,r){ return s+(r.shipPkgs||0); },0);
      if (neededBoxes < 1) neededBoxes = 1;
      while (tamSession.boxes.length > neededBoxes) tamSession.boxes.pop();
    }

    if (!tamInvoices.length) {
      // No invoices left — clear everything
      tamSession = null;
      tamEngineCache = {};
      tamActiveEngines = {};
      ['tam-results-wrap','tam-invoice-meta','tam-validation-banner'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) { el.className = ''; el.innerHTML = ''; }
      });
      var ra = document.getElementById('tam-reception-area');
      if (ra) ra.innerHTML = '';
      document.getElementById('tam-export-btn').classList.remove('show');
      document.getElementById('tam-status-msg').textContent = '';
      document.getElementById('tam-file-name').textContent = '';
      return;
    }

    tamRenderAll();
    tamSaveSession(false);
  }
  function tamRenderInvoiceBanner(r, el) {
    var xv    = r.xv;
    var subOk = r.invoiceSubtotal != null ? Math.abs(r.invoiceSubtotal - r.subtotalGoods) < 0.05 : true;
    var allOk = xv.fullyAgree && subOk;

    var subLine = r.invoiceSubtotal != null
      ? 'fatura: <strong>' + tamFmtEU(r.invoiceSubtotal) + '€</strong> · calculado: <strong>' + tamFmtEU(r.subtotalGoods) + '€</strong>'
      : 'calculado: <strong>' + tamFmtEU(r.subtotalGoods) + '€</strong>';

    var cvHtml = '<div class="tam-vi"><em>subtotal</em><span>' + subLine + '</span></div>';

    if (allOk) {
      cvHtml += '<div class="tam-vi" style="color:#2a7a2a"><em>verificação</em><span>✅ ' + xv.confirmed + ' refs confirmadas</span></div>';
    } else {
      var engA = xv.engines[0], engB = xv.engines[1];
      function _eKey(e){ return e.refs+'|'+e.units; }
      var abAgree = _eKey(engA) === _eKey(engB);

      if (abAgree) {
        cvHtml += '<div class="tam-vi"><em>motores</em><span>A+B ★: ' + engA.refs + ' refs / ' + engA.units + ' un</span></div>';
      } else {
        cvHtml += '<div class="tam-vi"><em>motores</em><span>' +
          'A' + (engA.label===xv.autoEngine?' ★':'') + ': ' + engA.refs + ' refs / ' + engA.units + ' un' +
          ' &emsp; B' + (engB.label===xv.autoEngine?' ★':'') + ': ' + engB.refs + ' refs / ' + engB.units + ' un' +
          '</span></div>';
      }

      if (xv.conflicts && xv.conflicts.length) {
        cvHtml += '<div class="tam-vi"><em style="color:#c00">⚠️ conflitos (' + xv.conflicts.length + ')</em><span>' +
          xv.conflicts.map(function(c){ return '<span class="tam-conflict-ref">' + tamEsc(c.ref) + '</span>'; }).join(' · ') +
          '</span></div>';
      }

      if (!abAgree && tamEngineCache[r._fileKey]) {
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

    el.innerHTML = cvHtml;
    el.className = 'tam-inv-banner ' + (allOk ? 'ok' : 'err');

    el.querySelectorAll('.tam-ebtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var label   = btn.getAttribute('data-engine');
        var fileKey = btn.getAttribute('data-filekey');
        tamActiveEngines[fileKey] = label;
        var cache = tamEngineCache[fileKey];
        if (!cache) return;
        var newResult = tamCrossValidate(cache.A, cache.B, cache.C, label);
        var i = tamInvoices.findIndex(function(inv){ return inv._fileKey === fileKey; });
        if (i >= 0) {
          newResult._fileKey  = tamInvoices[i]._fileKey;
          newResult._fileName = tamInvoices[i]._fileName;
          tamInvoices[i] = newResult;
          tamRenderAll();
        }
      });
    });
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

    // ── ÚNICA SECCIÓN: tabla de cajas con refs y totales ──────
    var boxesHtml =
      '<div class="tam-rec-area">' +
      '<div class="tam-rec-area-title">receção de mercadoria · ' + tamInvoices.length + ' fatura(s) · ' + consolidated.length + ' referências</div>' +
      '<div class="tam-rec-boxes-scroll">' +
      '<table class="tam-rec-boxes-table">' +
      '<thead>' +
      '<tr class="tam-boxes-hdr-row">' +
      '<th class="tam-rec-ref-col">referência</th>' +
      '<th class="tam-rec-total-col">total</th>' +
      '<th class="tam-rec-total-col tam-th-funchal">F</th>' +
      '<th class="tam-rec-total-col tam-th-porto">PS</th>';

    boxes.forEach(function(box, bi){
      var received = 0;
      if (box.total) {
        Object.values(box.refs).forEach(function(v){ received += (v.f||0) + (v.p||0); });
      }
      var boxComplete = box.total && received >= box.total;
      var boxClass = boxComplete ? 'tam-box-col-complete' : '';
      boxesHtml += '<th colspan="2" class="tam-box-header ' + boxClass + '">' +
        'Caixa ' + (bi+1) +
        (box.locked ? ' <span class="tam-box-lock">🔒</span>' : '') +
        '</th>';
    });

    boxesHtml += '</tr><tr class="tam-boxes-sub-hdr">' +
      '<th class="tam-rec-ref-col"></th>' +
      '<th class="tam-rec-total-col"></th>' +
      '<th class="tam-rec-total-col"></th>' +
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
        (isLocked ? '<button class="tam-box-edit-btn" data-box="' + bi + '" title="editar">✏️</button>' : '') +
        '</div>' +
        '<div class="tam-box-sub-labels">' +
        '<span class="tam-sub-f">F</span>' +
        '<span class="tam-sub-p">PS</span>' +
        '</div>' +
        '</th>';
    });

    boxesHtml += '</tr></thead><tbody>';

    // Filas de referencias
    consolidated.forEach(function(c){
      var totals  = tamGetRefTotals(c.ref);
      var received = totals.f + totals.p;
      var isDone  = received >= c.totalPieces && c.totalPieces > 0;
      var isOver  = received > c.totalPieces && c.totalPieces > 0;
      var rowCls  = isOver ? 'tam-ref-over' : (isDone ? 'tam-ref-complete' : '');
      var safeRef = c.ref.replace(/[^a-z0-9]/gi,'_');

      boxesHtml += '<tr class="' + rowCls + '" data-ref="' + tamEsc(c.ref) + '">' +
        '<td class="tam-rec-ref-col"><strong>' + tamEsc(c.ref) + '</strong></td>' +
        '<td class="tam-rec-total-col tam-td-num">' + c.totalPieces + '</td>' +
        '<td class="tam-rec-total-col tam-td-num tam-cell-funchal" id="tam-sum-f-' + safeRef + '">' + (totals.f > 0 ? totals.f : '—') + '</td>' +
        '<td class="tam-rec-total-col tam-td-num tam-cell-porto"  id="tam-sum-p-' + safeRef + '">' + (totals.p > 0 ? totals.p : '—') + '</td>';

      boxes.forEach(function(box, bi){
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

    area.innerHTML = boxesHtml;

    // ── BIND EVENTOS ──────────────────────────────────────────

    // Input total de caja
    area.querySelectorAll('.tam-box-total-input').forEach(function(inp){
      inp.addEventListener('change', function(){
        var bi  = parseInt(inp.getAttribute('data-box'));
        var val = parseInt(inp.value);
        if (!isNaN(val) && val > 0) {
          tamSession.boxes[bi].total = val;
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

        // Actualizar fila de alerta en tiempo real sin rerenderizar
        tamUpdateRefRowAlert(ref);
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
     Actualizar clase de alerta de una fila de ref en tiempo real
  ──────────────────────────────────────────────────────────────── */
  function tamUpdateRefRowAlert(ref) {
    var consolidated = tamConsolidatedRefs();
    var c = consolidated.find(function(x){ return x.ref === ref; });
    if (!c) return;
    var totals   = tamGetRefTotals(ref);
    var received = totals.f + totals.p;
    var isDone   = received >= c.totalPieces && c.totalPieces > 0;
    var isOver   = received > c.totalPieces && c.totalPieces > 0;

    // Update row in reception table
    var area = document.getElementById('tam-reception-area');
    if (area) {
      var row = area.querySelector('tr[data-ref="' + ref.replace(/"/g,'\\"') + '"]');
      if (row) {
        row.classList.toggle('tam-ref-over', isOver);
        row.classList.toggle('tam-ref-complete', isDone && !isOver);
      }
    }
  }

  /* Actualizar celdas F/P del resumen en la tabla de cajas */
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
    if (!bar) return;
    // Always visible — no longer hidden until session loads
    bar.style.display = 'flex';
    var nameEl = document.getElementById('tam-session-name');
    if (nameEl && tamSession) nameEl.value = tamSession.name;
    var stEl = document.getElementById('tam-session-status');
    if (stEl) stEl.textContent = '';
  }

  /* ══════════════════════════════════════════════════════════════
     AUTOGUARDADO — localStorage (inmediato) + Supabase (async)
  ══════════════════════════════════════════════════════════════ */
  function tamStartAutoSave() {
    if (tamAutoSaveTimer) clearInterval(tamAutoSaveTimer);
    // Guardar cada 15s de forma incondicional
    tamAutoSaveTimer = setInterval(function(){ tamSaveSession(false); }, 15000);
  }

  function tamScheduleSave() {
    // Guardado inmediato en localStorage + Supabase en cuanto cambia algo
    tamSaveSession(false);
  }

  function tamSaveSession(silent) {
    if (!tamSession || !tamInvoices.length) return;

    var payload = {
      name:     tamSession.name,
      savedAt:  Date.now(),
      boxes:    tamSession.boxes,
      invoices: tamInvoices.map(function(r){
        return {
          invoiceNo:     r.invoiceNo,
          invoiceDate:   r.invoiceDate,
          fileName:      r._fileName,
          totalPieces:   r.totalPieces,
          shipPkgs:      r.shipPkgs,
          shipping:      r.shipping      || 0,
          subtotalGoods: r.subtotalGoods || 0,
          grandTotal:    r.grandTotal    || 0,
          invoiceSubtotal: r.invoiceSubtotal || null,
          grouped:       r.grouped
        };
      })
    };

    /* 1 — localStorage: siempre, síncrono, instantáneo */
    try {
      var all = tamLoadAllSessionsLocal();
      all[payload.name] = payload;
      localStorage.setItem('tam_sessions', JSON.stringify(all));
      console.log('TAM: sessão guardada em localStorage —', payload.name, new Date().toLocaleTimeString());
    } catch(e) { console.warn('TAM localStorage save error', e); }

    /* 2 — Supabase: asíncrono, sin bloquear UI */
    tamSaveSessionSupabase(payload);

    /* Indicador visual */
    if (!silent) {
      var stEl = document.getElementById('tam-session-status');
      if (stEl) {
        stEl.textContent = '✓ guardado';
        stEl.classList.add('saved');
        clearTimeout(stEl._hideTimer);
        stEl._hideTimer = setTimeout(function(){
          stEl.textContent = '';
          stEl.classList.remove('saved');
        }, 2500);
      }
    }
  }

  async function tamSaveSessionSupabase(payload) {
    var sb = tamSB();
    if (!sb || tamSaveInFlight) return;
    tamSaveInFlight = true;
    try {
      await sb.from(TAM_SESSIONS_TABLE).upsert({
        session_name: payload.name,
        saved_at:     new Date(payload.savedAt).toISOString(),
        data:         JSON.stringify(payload)
      }, { onConflict: 'session_name' });
    } catch(e) { /* Supabase opcional — localStorage es el fallback */ }
    tamSaveInFlight = false;
  }

  /* Cargar desde localStorage */
  function tamLoadAllSessionsLocal() {
    try {
      var raw = localStorage.getItem('tam_sessions');
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }

  /* Cargar fusionando localStorage + Supabase */
  async function tamLoadAllSessionsMerged() {
    var local = tamLoadAllSessionsLocal();
    var sb = tamSB();
    if (!sb) return local;
    try {
      var res = await sb.from(TAM_SESSIONS_TABLE).select('session_name, saved_at, data').order('saved_at', { ascending: false });
      if (res.data && res.data.length) {
        res.data.forEach(function(row){
          try {
            var parsed = JSON.parse(row.data);
            var localEntry = local[parsed.name];
            // Usar el más reciente entre local y remoto
            if (!localEntry || (parsed.savedAt > (localEntry.savedAt || 0))) {
              local[parsed.name] = parsed;
            }
          } catch(e) {}
        });
        // Actualizar localStorage con versión fusionada
        localStorage.setItem('tam_sessions', JSON.stringify(local));
      }
    } catch(e) {}
    return local;
  }

  function tamLoadAllSessions() {
    return tamLoadAllSessionsLocal();
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL DE SESIONES
  ══════════════════════════════════════════════════════════════ */
  function tamOpenSessionsModal() {
    var dd = document.getElementById('tam-sessions-dropdown');
    if (!dd) return;
    var isOpen = dd.classList.contains('open');
    dd.classList.toggle('open', !isOpen);
    if (!isOpen) {
      dd.innerHTML = '<div class="tam-dd-header">a carregar sessões…</div>';
      tamLoadAllSessionsMerged().then(function(sessions){
        tamRenderSessionsList(sessions);
      });
    }
  }

  function tamCloseSessionsModal() {
    var dd = document.getElementById('tam-sessions-dropdown');
    if (dd) dd.classList.remove('open');
  }

  function tamRenderSessionsList(sessions) {
    var dd = document.getElementById('tam-sessions-dropdown');
    if (!dd) return;
    if (!sessions) sessions = tamLoadAllSessionsLocal();
    var keys = Object.keys(sessions).sort(function(a,b){ return (sessions[b].savedAt||0) - (sessions[a].savedAt||0); });

    if (!keys.length) {
      dd.innerHTML = '<div class="tam-dd-header">sessões guardadas</div><div class="tam-sessions-empty">nenhuma sessão guardada</div>';
      return;
    }

    dd.innerHTML =
      '<div class="tam-dd-header">sessões guardadas · ' + keys.length + '</div>' +
      keys.map(function(k){
        var s = sessions[k];
        var date = s.savedAt ? new Date(s.savedAt).toLocaleString('pt-PT') : '—';
        var invInfo = s.invoices ? s.invoices.length + ' fat.' : '';

        // ── Compute completion status ──────────────────────
        var dot = '<span class="tam-dd-dot tam-dd-dot-grey"></span>';
        if (s.invoices && s.invoices.length && s.boxes) {
          // Build ref totals from boxes
          var refTotals = {};
          var anyFilled = false;
          s.boxes.forEach(function(box){
            Object.keys(box.refs || {}).forEach(function(ref){
              var f = box.refs[ref].f || 0;
              var p = box.refs[ref].p || 0;
              if (f > 0 || p > 0) {
                anyFilled = true;
                if (!refTotals[ref]) refTotals[ref] = { f:0, p:0 };
                refTotals[ref].f += f;
                refTotals[ref].p += p;
              }
            });
          });
          if (anyFilled) {
            // Build consolidated ref totals needed from invoices
            var refNeeded = {};
            s.invoices.forEach(function(inv){
              (inv.grouped || []).forEach(function(g){
                refNeeded[g.ref] = (refNeeded[g.ref] || 0) + g.pieces;
              });
            });
            var allDone = Object.keys(refNeeded).length > 0 &&
              Object.keys(refNeeded).every(function(ref){
                var got = refTotals[ref] ? (refTotals[ref].f + refTotals[ref].p) : 0;
                return got >= refNeeded[ref];
              });
            dot = allDone
              ? '<span class="tam-dd-dot tam-dd-dot-green" title="distribuição completa"></span>'
              : '<span class="tam-dd-dot tam-dd-dot-red"   title="distribuição incompleta"></span>';
          }
          // if !anyFilled → stays grey
        }

        return '<div class="tam-dd-item" data-key="' + tamEsc(k) + '">' +
          dot +
          '<div class="tam-dd-item-info">' +
            '<div class="tam-dd-item-name">' + tamEsc(s.name) + '</div>' +
            '<div class="tam-dd-item-meta">' + date + (invInfo ? ' · ' + invInfo : '') + '</div>' +
          '</div>' +
          '<button class="tam-dd-load-btn" data-key="' + tamEsc(k) + '">carregar</button>' +
          '<button class="tam-dd-del-btn"  data-key="' + tamEsc(k) + '" title="apagar">✕</button>' +
          '</div>';
      }).join('');

    dd.querySelectorAll('.tam-dd-load-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var key = btn.getAttribute('data-key');
        tamLoadSession(key, sessions[key]);
        tamCloseSessionsModal();
      });
    });

    dd.querySelectorAll('.tam-dd-del-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        tamDeleteSession(btn.getAttribute('data-key'));
        var updatedSessions = tamLoadAllSessionsLocal();
        tamRenderSessionsList(updatedSessions);
      });
    });
  }

  function tamLoadSession(key, sessionData) {
    var s = sessionData || tamLoadAllSessionsLocal()[key];
    if (!s) return;
    tamSession = { name: s.name, boxes: s.boxes, createdAt: s.savedAt };
    if (s.invoices && s.invoices.length) {
      tamInvoices = s.invoices.map(function(inv, idx){
        // Recalculate shipPerPiece for restored grouped items
        var shipping      = inv.shipping      || (inv.shipPkgs || 0) * 17.5;
        var subtotalGoods = inv.subtotalGoods || 0;
        var grandTotal    = inv.grandTotal    || tamRound2(subtotalGoods + shipping);
        var totalPieces   = inv.totalPieces   || 0;
        var shipPerPiece  = totalPieces > 0 ? shipping / totalPieces : 0;

        // Restore unitPriceWithShip and grandTotal on each grouped item if missing
        var grouped = (inv.grouped || []).map(function(g){
          if (!g.unitPriceWithShip && g.totalCost && g.pieces) {
            var base = g.pieces > 0 ? g.totalCost / g.pieces : 0;
            g.unitPriceWithShip = tamRound2(base + shipPerPiece);
            g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
          }
          return g;
        });

        return {
          invoiceNo:      inv.invoiceNo,
          invoiceDate:    inv.invoiceDate,
          _fileName:      inv.fileName,
          _fileKey:       inv.fileName + '_' + idx,
          totalPieces:    totalPieces,
          shipPkgs:       inv.shipPkgs      || 0,
          shipping:       shipping,
          subtotalGoods:  subtotalGoods,
          grandTotal:     grandTotal,
          invoiceSubtotal: inv.invoiceSubtotal || null,
          grouped:        grouped,
          xv: { fullyAgree: true, confirmed: grouped.length, conflicts: [],
                engines: [{label:'A',refs:grouped.length,units:totalPieces},
                          {label:'B',refs:grouped.length,units:totalPieces}],
                autoEngine:'A', activeEngine:'A', isManual:false }
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
    // localStorage
    var all = tamLoadAllSessionsLocal();
    delete all[key];
    localStorage.setItem('tam_sessions', JSON.stringify(all));
    // Supabase async
    var sb = tamSB();
    if (sb) {
      sb.from(TAM_SESSIONS_TABLE).delete().eq('session_name', key).then(function(){});
    }
  }

  /* ══════════════════════════════════════════════════════════════
     BIBLIOTECA DE REFERÊNCIAS — aprendizagem automática
     Cada vez que se parsea uma fatura, as refs novas são guardadas
     em Supabase (tam_refs) e em localStorage como fallback.
     Na próxima fatura, essas refs são carregadas e adicionadas ao
     KNOWN_REFS para melhorar a deteção.
  ══════════════════════════════════════════════════════════════ */
  var tamLearnedRefs = new Set(); // Carregado ao iniciar

  async function tamLoadLearnedRefs() {
    // 1. localStorage primeiro (rápido)
    try {
      var local = localStorage.getItem('tam_learned_refs');
      if (local) {
        JSON.parse(local).forEach(function(r){ tamLearnedRefs.add(r.toUpperCase()); });
      }
    } catch(e) {}

    // 2. Supabase (mais completo, assíncrono)
    var sb = tamSB();
    if (!sb) return;
    try {
      var res = await sb.from(TAM_REFS_TABLE).select('ref');
      if (res.data && res.data.length) {
        var remoteRefs = res.data.map(function(row){ return row.ref.toUpperCase(); });
        remoteRefs.forEach(function(r){ tamLearnedRefs.add(r); });
        // Actualizar localStorage con la versión fusionada
        localStorage.setItem('tam_learned_refs', JSON.stringify(Array.from(tamLearnedRefs)));
        // Incorporar al KNOWN_REFS para mejorar detección en esta sesión
        tamLearnedRefs.forEach(function(r){ KNOWN_REFS.add(r); });
      }
    } catch(e) {}
  }

  async function tamLearnRefsFromResult(result) {
    if (!result || !result.grouped || !result.grouped.length) return;
    var newRefs = result.grouped
      .map(function(g){ return g.ref; })
      .filter(function(r){ return r && !tamLearnedRefs.has(r.toUpperCase()); });

    if (!newRefs.length) return;

    // Añadir a memoria local
    newRefs.forEach(function(r){ tamLearnedRefs.add(r.toUpperCase()); KNOWN_REFS.add(r.toUpperCase()); });
    try {
      localStorage.setItem('tam_learned_refs', JSON.stringify(Array.from(tamLearnedRefs)));
    } catch(e) {}

    // Supabase: upsert en lote
    var sb = tamSB();
    if (!sb) return;
    try {
      var rows = newRefs.map(function(r){
        return { ref: r.toUpperCase(), first_seen: new Date().toISOString(), source: 'auto' };
      });
      await sb.from(TAM_REFS_TABLE).upsert(rows, { onConflict: 'ref', ignoreDuplicates: true });
    } catch(e) {}
  }

  // Cargar referencias aprendidas al inicializar el módulo
  tamLoadLearnedRefs();
  function tamExportInvoiceCSV(r) {
    var lines = ['\uFEFF' + ['Referência','Tipo · Nome','UND','P.Unit c/ Envio (€)','Total (€)','Funchal','Porto Santo'].join(';')];
    var invIdx = tamInvoices.indexOf(r);
    r.grouped.forEach(function(g){
      var tn = (g.garmentType||'') + (g.garmentType&&g.name?' · ':'') + (g.name||'');
      var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
      lines.push([g.ref, tn, g.pieces, tamFmtEU(g.unitPriceWithShip), tamFmtEU(g.grandTotal), distrib.f || 0, distrib.p || 0].join(';'));
    });
    lines.push('');
    lines.push(['Subtotal mercadoria','',r.totalPieces,'',tamFmtEU(r.subtotalGoods),'',''].join(';'));
    lines.push(['Transporte (' + r.shipPkgs + ' × 17,50 €)','','','',tamFmtEU(r.shipping),'',''].join(';'));
    lines.push(['Total geral','',r.totalPieces,'',tamFmtEU(r.grandTotal),'',''].join(';'));
    var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = 'TAM_' + (r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_') + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT CSV — todas las facturas (botón global)
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
    // Always remove any existing TAM style block so we always get the latest CSS
    ['tam-v8-styles','tam-v9-styles','tam-xv-styles'].forEach(function(id){
      var old = document.getElementById(id);
      if (old) old.parentNode.removeChild(old);
    });
    var s = document.createElement('style');
    s.id = 'tam-v9-styles';
    s.textContent = [
      /* ── Upload zone compacto cuando ya hay facturas ── */
      '#tam-upload-label.loaded, #upload-label.loaded { min-height:0!important; padding:8px 16px!important; }',
      '#tam-upload-label.loaded .upload-icon, #upload-label.loaded .upload-icon { display:none!important; }',

      /* ── Session choice dialog ── */
      '#tam-session-dialog { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:800; display:flex; align-items:center; justify-content:center; }',
      '#tam-session-dialog-box { background:#fff; border-radius:16px; padding:28px 28px 22px; width:420px; max-width:92vw; font-family:MontserratLight,sans-serif; box-shadow:0 20px 60px rgba(0,0,0,.15); }',
      '.tam-dialog-title { font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; margin-bottom:12px; }',
      '.tam-dialog-body { font-size:.9rem; font-weight:600; color:#333; line-height:1.6; margin-bottom:22px; }',
      '.tam-dialog-btns { display:flex; flex-direction:column; gap:8px; }',
      '.tam-dialog-btn { padding:11px 16px; font-size:.88rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:10px; border:1px solid #ccc; background:#fff; text-align:left; transition:background .15s,border-color .15s; }',
      '.tam-dialog-btn:hover { background:#f5f5f5; border-color:#999; }',
      '.tam-dialog-btn-new { border-color:#555; }',
      '.tam-dialog-btn-new:hover { background:#555; color:#fff; }',
      '@media(prefers-color-scheme:dark){',
      '#tam-session-dialog-box{background:#1a1a1a!important;}',
      '.tam-dialog-title{color:#555!important;}',
      '.tam-dialog-body{color:#ccc!important;}',
      '.tam-dialog-btn{background:#111!important;border-color:#333!important;color:#ccc!important;}',
      '.tam-dialog-btn:hover{background:#222!important;border-color:#666!important;}',
      '.tam-dialog-btn-new:hover{background:#555!important;color:#fff!important;}',
      '}',
      '#tam-session-bar { display:flex!important; align-items:center; gap:12px; width:100%; max-width:960px; padding:8px 14px; margin-bottom:12px; border:1px solid #e6e6e6; border-radius:12px; background:#fafafa; flex-wrap:wrap; }',
      '#tam-session-name { font-size:.88rem; font-weight:bold; flex:1; border:none; background:transparent; outline:none; color:#000; min-width:200px; font-family:MontserratLight,sans-serif; }',
      '#tam-session-status { font-size:.72rem; font-weight:bold; color:#aaa; }',
      '#tam-session-status.saved { color:#2a8a2a; }',
      '.tam-session-btn { padding:5px 14px; font-size:.75rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #ccc; border-radius:8px; background:#fff; transition:background .15s,color .15s; }',
      '.tam-session-btn:hover { background:#555; color:#fff; border-color:#555; }',

      /* ── Sessions dropdown ── */
      '.tam-sessions-dropdown-wrap { position:relative; }',
      '#tam-sessions-dropdown { display:none; position:absolute; top:calc(100% + 6px); right:0; width:400px; max-width:90vw; max-height:360px; overflow-y:auto; background:#fff; border:1px solid #e6e6e6; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,.12); z-index:700; font-family:MontserratLight,sans-serif; }',
      '#tam-sessions-dropdown.open { display:block; }',
      '.tam-dd-header { padding:10px 14px; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.06em; color:#aaa; border-bottom:1px solid #f0f0f0; background:#fafafa; border-radius:14px 14px 0 0; }',
      '.tam-dd-item { display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid #f5f5f5; transition:background .12s; }',
      /* Status dot */
      '.tam-dd-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }',
      '.tam-dd-dot-green { background:#2a8a2a; }',
      '.tam-dd-dot-red   { background:#c03000; }',
      '.tam-dd-dot-grey  { background:#ccc; }',
      '.tam-dd-item:last-child { border-bottom:none; border-radius:0 0 14px 14px; }',
      '.tam-dd-item:hover { background:#f8f8f8; }',
      '.tam-dd-item-info { flex:1; min-width:0; }',
      '.tam-dd-item-name { font-size:.84rem; font-weight:bold; color:#000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
      '.tam-dd-item-meta { font-size:.7rem; color:#aaa; margin-top:1px; }',
      '.tam-dd-load-btn { padding:4px 12px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1px solid #555; border-radius:7px; background:#fff; text-transform:lowercase; transition:background .15s,color .15s; white-space:nowrap; flex-shrink:0; }',
      '.tam-dd-load-btn:hover { background:#555; color:#fff; }',
      '.tam-dd-del-btn { background:none; border:none; cursor:pointer; font-size:.88rem; color:#ccc; padding:2px 6px; border-radius:6px; flex-shrink:0; transition:color .15s,background .15s; }',
      '.tam-dd-del-btn:hover { color:#c00; background:rgba(192,0,0,.06); }',
      '.tam-sessions-empty { color:#aaa; text-align:center; padding:28px 0; font-size:.84rem; font-weight:bold; }',

      /* ── Dark mode dropdown ── */
      '@media(prefers-color-scheme:dark){',
      '#tam-sessions-dropdown{background:#1a1a1a!important;border-color:#2a2a2a!important;box-shadow:0 8px 32px rgba(0,0,0,.4)!important;}',
      '.tam-dd-header{background:#161616!important;border-color:#2a2a2a!important;}',
      '.tam-dd-item{border-color:#1e1e1e!important;}',
      '.tam-dd-item:hover{background:#222!important;}',
      '.tam-dd-item-name{color:#e8e8e8!important;}',
      '.tam-dd-load-btn{background:#111!important;border-color:#555!important;color:#aaa!important;}',
      '.tam-dd-load-btn:hover{background:#555!important;color:#fff!important;}',
      '}',

      /* ── Tabla de factura con columnas F/P ── */
      '#tam-results-wrap { width:100%; max-width:960px; overflow-x:auto; }',
      '.tam-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:15px; overflow:visible; font-family:MontserratLight,sans-serif; }',
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
      /* Ref completada — sin opacity, solo color más claro */
      '.tam-ref-complete td { color:#bbb!important; }',
      '.tam-ref-complete td strong { color:#bbb!important; }',
      '.tam-ref-complete .tam-rec-ref-col { background-color:#fafafa!important; background:#fafafa!important; }',
      '.tam-table tfoot td { background:#f2f2f2; font-weight:bold; border-top:2px solid #ccc; padding:4px 12px; text-align:center; line-height:1.2; }',
      '.tam-table tfoot tr.tam-tr-ship td { background:#fafafa; font-weight:600; font-size:.82rem; color:#666; border-top:1px solid #e8e8e8; padding:3px 12px; }',
      '.tam-table tfoot tr.tam-tr-grand td { background:#e4e4e4; font-size:.94rem; border-top:2px solid #bbb; }',
      '.tam-row-conflict td { background:#fff8e1!important; }',
      '.tam-badge { display:inline-block; margin-left:5px; font-size:.6rem; padding:1px 5px; border-radius:3px; vertical-align:middle; font-weight:bold; color:#fff; }',
      '.tam-badge-conflict { background:#e67e00; }',
      '.tam-conflict-ref { font-weight:bold; color:#c00; }',

      /* ── Multi-factura: bloques ── */
      '.tam-invoice-block { width:100%; max-width:960px; margin-bottom:8px; border:1px solid #e6e6e6; border-radius:14px; overflow:visible; }',
      '.tam-invoice-block-header { display:flex; align-items:center; gap:16px; padding:10px 16px; background:#f8f8f8; border-bottom:1px solid #e6e6e6; flex-wrap:wrap; }',
      '.tam-inv-num { font-size:.88rem; font-weight:bold; color:#000; }',
      '.tam-inv-meta { font-size:.75rem; color:#aaa; font-weight:600; flex:1; }',
      '.tam-inv-total { font-size:.88rem; font-weight:bold; color:#000; margin-left:auto; }',
      '.tam-inv-table-wrap { overflow-x:auto; }',
      '.tam-inv-separator { height:1px; background:#e6e6e6; margin:6px 0; width:100%; max-width:960px; }',
      /* Validation banner inside block */
      '.tam-inv-banner { display:flex; flex-wrap:wrap; gap:4px 20px; padding:7px 16px; font-size:.78rem; font-weight:600; font-family:MontserratLight,sans-serif; border-bottom:1px solid #e6e6e6; }',
      '.tam-inv-banner.ok  { background:#f0faf0; color:#2a6a2a; }',
      '.tam-inv-banner.err { background:#fff8f0; color:#994400; }',
      '.tam-inv-banner .tam-vi { display:flex; align-items:center; gap:6px; }',
      '.tam-inv-banner .tam-vi em { font-style:normal; font-size:.63rem; color:#999; text-transform:uppercase; letter-spacing:.06em; }',
      '.tam-inv-banner .tam-engine-sel-wrap { width:100%; margin-top:2px; }',
      '.tam-inv-banner .tam-engine-btns { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }',

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
      '#tam-validation-banner .tam-vi em { font-style:normal; font-size:.64rem; color:#999; text-transform:uppercase; letter-spacing:.06em; }',
      '.tam-engine-sel-wrap { grid-column:1/-1; width:100%; margin-top:4px; }',
      '.tam-engine-btns { display:flex; gap:8px; margin-top:6px; justify-content:center; flex-wrap:wrap; }',
      '.tam-ebtn { border:1px solid #ccc; background:#fafafa; padding:7px 20px; border-radius:8px; cursor:pointer; font-family:MontserratLight,sans-serif; font-size:.78rem; line-height:1.45; text-align:center; transition:background .15s,border-color .15s; min-width:110px; }',
      '.tam-ebtn:hover { background:#f0f0f0; border-color:#777; }',
      '.tam-ebtn-active { background:#222!important; color:#fff!important; border-color:#222!important; }',
      '.tam-ebtn-label { display:block; font-weight:bold; font-size:.82rem; }',
      '.tam-ebtn-detail { display:block; font-size:.68rem; color:#999; margin-top:2px; }',
      '.tam-chk-ok { color:#2a6a2a; }',
      '.tam-chk-err { color:#c00; }',

      /* ══════════════════════════
         ÁREA DE RECEPCIÓN
      ══════════════════════════ */
      '#tam-reception-area { width:100%; max-width:1600px; margin-top:20px; }',

      '.tam-rec-area { border:1px solid #e6e6e6; border-radius:16px; overflow:visible; background:#fff; }',
      '.tam-rec-area-title { padding:10px 18px; font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; border-bottom:1px solid #e6e6e6; background:#fafafa; }',

      '.tam-th-funchal { background:#e3f2fd!important; color:#1565c0!important; }',
      '.tam-th-porto   { background:#fce4ec!important; color:#880e4f!important; }',

      /* Scroll contenedor */
      '.tam-rec-boxes-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }',

      '.tam-rec-boxes-table { border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.82rem; white-space:nowrap; }',
      '.tam-rec-boxes-table th, .tam-rec-boxes-table td { border:1px solid #f0f0f0; text-align:center; vertical-align:middle; }',

      /* Cabecera caja */
      '.tam-boxes-hdr-row th { padding:6px 8px; background:#f8f8f8; font-size:.7rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#888; white-space:nowrap; }',
      '.tam-box-header { min-width:120px; background:#f2f2f2!important; }',
      '.tam-box-header.tam-box-col-complete { background:#f0fdf0!important; color:#2a6a2a!important; }',
      '.tam-box-lock { font-size:.75rem; }',

      /* Sub-header (input total + F/PS labels) */
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

      /* Columnas fijas — sticky con background OPACO forzado */
      '.tam-rec-ref-col { min-width:130px; padding:4px 10px!important; background-color:#fafafa!important; background:#fafafa!important; border-right:2px solid #e6e6e6!important; text-align:left!important; position:sticky; left:0; z-index:2; box-shadow:2px 0 6px rgba(0,0,0,.07); will-change:transform; }',
      '.tam-rec-total-col { min-width:46px; padding:4px 8px!important; background-color:#fafafa!important; background:#fafafa!important; border-right:1px solid #e6e6e6!important; font-variant-numeric:tabular-nums; }',
      /* Sticky header cells */
      '.tam-boxes-hdr-row .tam-rec-ref-col { position:sticky; left:0; z-index:4; background-color:#f8f8f8!important; background:#f8f8f8!important; box-shadow:2px 0 6px rgba(0,0,0,.09); }',
      '.tam-boxes-sub-hdr .tam-rec-ref-col { position:sticky; left:0; z-index:4; background-color:#fafafa!important; background:#fafafa!important; box-shadow:2px 0 6px rgba(0,0,0,.07); }',
      /* Override sticky bg per row state */
      '.tam-ref-over .tam-rec-ref-col { background-color:#ffe0e0!important; background:#ffe0e0!important; }',
      '.tam-ref-complete .tam-rec-ref-col { background-color:#fafafa!important; background:#fafafa!important; }',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-ref-col { background-color:#f0f0f0!important; background:#f0f0f0!important; }',

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
      '.tam-rec-boxes-table .tam-ref-complete td { color:#bbb!important; }',
      '.tam-rec-boxes-table .tam-ref-complete td strong { color:#bbb!important; }',

      /* ── Fila en rojo: F+P >= total ref ── */
      '.tam-ref-over td { background:#fff0f0!important; }',
      '.tam-ref-over .tam-rec-ref-col { background:#ffe0e0!important; }',
      '.tam-ref-over .tam-rec-total-col { background:#ffe0e0!important; }',
      '.tam-ref-over td strong { color:#c00!important; }',

      /* ── Remove button per invoice ── */
      '.tam-inv-remove-btn { padding:4px 10px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #c03000; border-radius:8px; background:#fff; color:#c03000; transition:background .15s,color .15s; white-space:nowrap; flex-shrink:0; }',
      '.tam-inv-remove-btn:hover { background:#c03000; color:#fff; }',
      '@media(prefers-color-scheme:dark){.tam-inv-remove-btn{background:#111!important;}.tam-inv-remove-btn:hover{background:#c03000!important;color:#fff!important;}}',

      /* ── Export button per invoice ── */
      '.tam-inv-export-btn { padding:4px 12px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #555; border-radius:8px; background:#fff; transition:background .15s,color .15s; white-space:nowrap; flex-shrink:0; }',
      '.tam-inv-export-btn:hover { background:#555; color:#fff; }',

      /* ── Dark mode receção ── */
      '@media(prefers-color-scheme:dark){',
      '.tam-rec-area{background:#111!important;border-color:#2a2a2a!important;}',
      '.tam-rec-area-title{background:#161616!important;border-color:#2a2a2a!important;}',
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
      '.tam-rec-ref-col,.tam-rec-total-col{background-color:#161616!important;background:#161616!important;border-color:#2a2a2a!important;}',
      '.tam-boxes-hdr-row .tam-rec-ref-col{background-color:#1a1a1a!important;background:#1a1a1a!important;}',
      '.tam-boxes-sub-hdr .tam-rec-ref-col{background-color:#161616!important;background:#161616!important;}',
      '.tam-ref-over .tam-rec-ref-col{background-color:#3a0a0a!important;background:#3a0a0a!important;}',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-ref-col{background-color:#222!important;background:#222!important;}',
      '.tam-rec-boxes-table th,.tam-rec-boxes-table td{border-color:#1e1e1e!important;color:#e8e8e8!important;}',
      '.tam-rec-boxes-table tbody tr:hover td{background:#1a1a1a!important;}',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-f{background:#112233!important;}',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-cell-p{background:#2a1020!important;}',
      '.tam-ref-over td{background:#2a0808!important;}',
      '.tam-ref-over .tam-rec-ref-col,.tam-ref-over .tam-rec-total-col{background:#3a0a0a!important;}',
      '.tam-ref-over td strong{color:#f48!important;}',
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

    // Session bar — shown immediately, always visible
    if (!document.getElementById('tam-session-bar')) {
      var bar = document.createElement('div');
      bar.id = 'tam-session-bar';
      bar.style.cssText = 'display:flex!important;';   // visible desde el inicio
      bar.innerHTML =
        '<input type="text" id="tam-session-name" placeholder="nome da sessão">' +
        '<span id="tam-session-status"></span>' +
        '<button class="tam-session-btn" id="tam-save-btn" title="guardar sessão">💾 guardar</button>' +
        '<div class="tam-sessions-dropdown-wrap">' +
          '<button class="tam-session-btn" id="tam-sessions-btn">📋 sessões ▾</button>' +
          '<div id="tam-sessions-dropdown"></div>' +
        '</div>';

      // Insertar ANTES del upload-zone para que aparezca en la parte superior
      var uz = document.getElementById('tam-upload-zone');
      if (uz) uz.parentNode.insertBefore(bar, uz);
      else tab.insertBefore(bar, tab.firstChild);

      bar.querySelector('#tam-session-name').addEventListener('change', function(e){
        if (tamSession) tamSession.name = e.target.value;
        tamScheduleSave();
      });

      var saveBtn = bar.querySelector('#tam-save-btn');
      if (saveBtn) saveBtn.addEventListener('click', function(){ tamSaveSession(false); });

      // Bind sessions button here, not in the separate listener block above
      var sesBtn2 = bar.querySelector('#tam-sessions-btn');
      if (sesBtn2) sesBtn2.addEventListener('click', function(e){
        e.stopPropagation();
        tamOpenSessionsModal();
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', function(e){
        var dd = document.getElementById('tam-sessions-dropdown');
        var btn = document.getElementById('tam-sessions-btn');
        if (dd && !dd.contains(e.target) && e.target !== btn) {
          dd.classList.remove('open');
        }
      });
    }

    // Reception area
    if (!document.getElementById('tam-reception-area')) {
      var ra = document.createElement('div');
      ra.id = 'tam-reception-area';
      var rw = document.getElementById('tam-results-wrap');
      if (rw && rw.nextSibling) rw.parentNode.insertBefore(ra, rw.nextSibling);
      else if (rw) rw.parentNode.appendChild(ra);
      else tab.appendChild(ra);
    }

    // Inject styles immediately — always fresh
    tamEnsureStyles();
  })();

})();
