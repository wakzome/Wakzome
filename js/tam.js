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
  var tamSaveInFlight  = false;
  var tamEditMode      = {};   // { invIdx: true } — which invoices are in edit mode
  var tamBoxLockTimers      = {};         // { bi: timeoutId } - pending 3-second lock delays
  var tamBoxLockPending     = {};         // { bi: true }      - boxes in the 3s transition window
  var tamRefCompleting      = new Set();  // refs in the 3s green-flash window (just completed)
  var tamRefCompletingTimers = {};        // { ref: timeoutId } - per-ref 3s timers
  var tamRefDone            = new Set();  // refs that have ALREADY completed animation — no re-flash
  var tamUndoStack          = [];         // array of JSON snapshots of boxes+quickDistrib
  var tamDeliveryNotes      = {};         // ZY-code -> { zyCode, refs:[{ref,qty}], fileName }
  var tamDNtoInvIdx         = {};         // ZY-dn-code -> invIdx
  var tamRedoStack          = [];         // redo stack (cleared on new action)
  var tamDNVerifyState      = {};         // { zyCode: { dnConfirmed: bool } } — escalation state

  /* ── Motor D ── */
  var TAM_MOTOR_D_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co/functions/v1/Motor-D';
  var TAM_MOTOR_D_KEY = 'sb_publishable_Wx9SAdPR0kRX-KAsVIj02w_4Y37IyEU';
  var tamMotorDCost   = 0;

  var tamRedoStack          = [];         // redo stack (cleared on new action)
  var TAM_UNDO_MAX          = 50;         // max undo steps
  var tamCollapseState      = {};         // { inv_N: true (collapsed), distrib: true }

  /* ── Undo/Redo helpers ── */
  function tamSnapshotBoxes() {
    if (!tamSession) return null;
    return JSON.stringify({
      boxes:        tamSession.boxes,
      quickDistrib: tamSession.quickDistrib || {}
    });
  }

  function tamPushUndo() {
    var snap = tamSnapshotBoxes();
    if (!snap) return;
    // Don't push duplicate of the last state
    if (tamUndoStack.length && tamUndoStack[tamUndoStack.length - 1] === snap) return;
    tamUndoStack.push(snap);
    if (tamUndoStack.length > TAM_UNDO_MAX) tamUndoStack.shift();
    tamRedoStack = [];          // new action clears redo
    tamUpdateUndoButtons();
  }

  function tamApplySnapshot(snap) {
    if (!snap || !tamSession) return;
    try {
      var s = JSON.parse(snap);
      tamSession.boxes        = s.boxes;
      tamSession.quickDistrib = s.quickDistrib || {};
      // Clear animation state — snapshot restores may uncomplete refs
      tamRefCompleting.clear();
      tamRefDone.clear();
      Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
      Object.keys(tamBoxLockTimers).forEach(function(k){ clearTimeout(tamBoxLockTimers[k]); delete tamBoxLockTimers[k]; });
      tamBoxLockPending = {};
      tamRenderAll();
      tamScheduleSave();
    } catch(e) { console.error('TAM undo/redo error', e); }
  }

  function tamUndo() {
    if (!tamUndoStack.length) return;
    var current = tamSnapshotBoxes();
    if (current) { tamRedoStack.push(current); }
    tamApplySnapshot(tamUndoStack.pop());
    tamUpdateUndoButtons();
  }

  function tamRedo() {
    if (!tamRedoStack.length) return;
    var current = tamSnapshotBoxes();
    if (current) { tamUndoStack.push(current); }
    tamApplySnapshot(tamRedoStack.pop());
    tamUpdateUndoButtons();
  }

  function tamClearAll() {
    if (!tamSession) return;
    tamPushUndo();
    tamSession.boxes.forEach(function(box){
      box.refs   = {};
      box.locked = false;
      if (tamBoxLockTimers) {
        var bi = tamSession.boxes.indexOf(box);
        if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
        delete tamBoxLockPending[bi];
      }
    });
    tamSession.quickDistrib = {};
    tamRefCompleting.clear();
    tamRefDone.clear();
    Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
    tamRenderAll();
    tamScheduleSave();
  }

  function tamUpdateUndoButtons() {
    var undoBtn = document.getElementById('tam-undo-btn');
    var redoBtn = document.getElementById('tam-redo-btn');
    if (undoBtn) undoBtn.disabled = !tamUndoStack.length;
    if (redoBtn) redoBtn.disabled = !tamRedoStack.length;
  }

  /* ── Collapse / expand invoice blocks and distribution area ── */
  function tamApplyCollapseState() {
    if (tamInvoices.length === 1) {
      // Single invoice — toggle class on the results wrap (contains one table)
      var singleWrap = document.getElementById('tam-results-wrap');
      var singleToggleBtn = document.getElementById('tam-single-toggle-btn');
      if (singleWrap) {
        var sc = !!tamCollapseState['inv_0'];
        singleWrap.classList.toggle('tam-single-inv-collapsed', sc);
        if (singleToggleBtn) singleToggleBtn.innerHTML = sc ? '&#9654;' : '&#9660;';
      }
    } else {
      // Multi-invoice — each block is independent; ensure wrap never has single-mode class
      var wrap = document.getElementById('tam-results-wrap');
      if (wrap) wrap.classList.remove('tam-single-inv-collapsed');
      tamInvoices.forEach(function(_, idx) {
        var block = document.getElementById('tam-invoice-block-' + idx);
        if (!block) return;
        var collapsed = !!tamCollapseState['inv_' + idx];
        block.classList.toggle('tam-inv-collapsed', collapsed);
        var btn = block.querySelector('.tam-inv-toggle-btn');
        if (btn) btn.innerHTML = collapsed ? '&#9654;' : '&#9660;';
      });
    }
  }


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
  /* ══════════════════════════════════════════════════════════════
     MOTOR D — Claude API proxy
     Rules:
       invoice → only when A/B/C have conflicts
       dn      → only when verification detects divergence
       photo   → ALWAYS (reads ZY + manuscript F|PS columns)
     Falls back gracefully — never breaks the UI on failure.
  ══════════════════════════════════════════════════════════════ */
  async function tamMotorDCall(payload) {
    try {
      var res = await fetch(TAM_MOTOR_D_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + TAM_MOTOR_D_KEY,
          'apikey': TAM_MOTOR_D_KEY
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        /* Try to detect model deprecation from the response body */
        try {
          var errBody = await res.clone().json();
          var errTxt  = JSON.stringify(errBody).toLowerCase();
          if (/model_not_found|deprecated|not_supported|invalid_model|model.*retired/i.test(errTxt)) {
            tamMotorDSetDeprecated(true);
          }
        } catch(_) {}
        console.warn('TAM Motor D HTTP', res.status);
        return null;
      }
      var data = await res.json();
      if (!data.ok) {
        var rawTxt = (data.error || '') + (data.raw || '');
        if (/model_not_found|deprecated|not_supported|invalid_model|model.*retired/i.test(rawTxt)) {
          tamMotorDSetDeprecated(true);
        }
        console.warn('TAM Motor D error', data.error, data.raw || '');
        return null;
      }
      /* Success — clear any deprecation warning */
      tamMotorDSetDeprecated(false);
      /* Track cost */
      var cost = payload.mode === 'photo' ? 0.010 : payload.mode === 'invoice' ? 0.014 : 0.006;
      tamMotorDCost = Math.round((tamMotorDCost + cost) * 1000) / 1000;
      console.log('TAM Motor D coste acumulado: $' + tamMotorDCost.toFixed(3));
      var sb = tamSB();
      if (sb) sb.from('tam_motor_d_cost')
        .upsert({ id: 1, cost: tamMotorDCost, updated_at: new Date().toISOString() })
        .then(function(){}).catch(function(){});
      return data.result;
    } catch(e) {
      console.warn('TAM Motor D failed', e.message);
      return null;
    }
  }

  function tamMotorDSpinner(msg) {
    var el = document.getElementById('tam-motord-spin');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tam-motord-spin';
      document.body.appendChild(el);
    }
    if (msg) {
      el.textContent = '🤖 ' + msg;
      el.className = 'tam-motord-spin tam-motord-spin-on';
    } else {
      el.className = 'tam-motord-spin';
    }
  }

  /* Show/hide the "update Motor D model" badge in the session bar */
  function tamMotorDSetDeprecated(isDeprecated) {
    /* Persist state so the badge survives re-renders */
    try { localStorage.setItem('tam_motord_deprecated', isDeprecated ? '1' : '0'); } catch(_) {}
    var badge = document.getElementById('tam-motord-update-badge');
    if (isDeprecated) {
      if (!badge) {
        badge = document.createElement('button');
        badge.id = 'tam-motord-update-badge';
        badge.className = 'tam-motord-update-badge';
        badge.innerHTML = '⚠ Motor D · actualizar modelo';
        badge.title = 'O modelo Claude configurado foi descontinuado. Clica para instruções.';
        badge.addEventListener('click', tamMotorDShowUpdateInstructions);
        var bar = document.getElementById('tam-session-bar');
        if (bar) bar.appendChild(badge);
      }
      badge.style.display = 'inline-flex';
    } else {
      if (badge) badge.style.display = 'none';
    }
  }

  function tamMotorDShowUpdateInstructions() {
    var old = document.getElementById('tam-motord-update-modal');
    if (old) old.parentNode.removeChild(old);
    var modal = document.createElement('div');
    modal.id = 'tam-motord-update-modal';
    modal.innerHTML =
      '<div id="tam-motord-update-backdrop"></div>' +
      '<div id="tam-motord-update-panel">' +
        '<div id="tam-motord-update-hdr">' +
          '<span>🤖 Motor D · actualizar modelo</span>' +
          '<button id="tam-motord-update-close">&times;</button>' +
        '</div>' +
        '<div id="tam-motord-update-body">' +
          '<p>O modelo Claude configurado foi <strong>descontinuado</strong> pela Anthropic.</p>' +
          '<p>Para corrigir, segue estes passos:</p>' +
          '<ol>' +
            '<li>Abre <a href="https://supabase.com/dashboard" target="_blank">supabase.com/dashboard</a></li>' +
            '<li>Edge Functions → <strong>Motor-D</strong> → Code</li>' +
            '<li>Localiza a linha:<br><code>model: claude-sonnet-4-...</code></li>' +
            '<li>Substitui pelo modelo mais recente disponível em<br>' +
              '<a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> → Models</li>' +
            '<li>Clica <strong>Deploy function</strong></li>' +
          '</ol>' +
          '<p style="margin-top:12px;font-size:.78rem;color:#888;">Enquanto não for atualizado, os motores A/B/C continuam a funcionar normalmente.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-motord-update-visible'); });
    function close() {
      modal.classList.remove('tam-motord-update-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
    }
    modal.querySelector('#tam-motord-update-backdrop').addEventListener('click', close);
    modal.querySelector('#tam-motord-update-close').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  /* Restore badge state on load */
  (function() {
    try {
      if (localStorage.getItem('tam_motord_deprecated') === '1') {
        /* Wait for DOM to be ready */
        var t = setInterval(function() {
          if (document.getElementById('tam-session-bar')) {
            clearInterval(t);
            tamMotorDSetDeprecated(true);
          }
        }, 200);
      }
    } catch(_) {}
  })();

  /* Apply Motor D invoice result — resolves CONFLICT refs */
  function tamApplyMotorDInvoice(result, md) {
    if (!md || !md.refs || !md.refs.length) return result;
    var mdMap = {};
    md.refs.forEach(function(r) { mdMap[r.ref.toUpperCase()] = r; });
    var shipPerPiece = result.shipPerPiece || 0;
    var resolved = result.grouped.map(function(g) {
      if (g.confidence !== 'CONFLICT') return g;
      var mdr = mdMap[g.ref.toUpperCase()];
      if (!mdr) return g;
      var pieces    = mdr.pieces    || g.pieces;
      var totalCost = mdr.totalCost || g.totalCost;
      var base      = pieces > 0 ? totalCost / pieces : 0;
      return Object.assign({}, g, {
        pieces:            pieces,
        totalCost:         tamRound2(totalCost),
        unitPriceWithShip: tamRound2(base + shipPerPiece),
        grandTotal:        tamRound2((base + shipPerPiece) * pieces),
        confidence:        'MOTOR_D'
      });
    });
    var stillConflicts = resolved.filter(function(g) { return g.confidence === 'CONFLICT'; });
    var totalPieces    = resolved.reduce(function(s, g) { return s + g.pieces; }, 0);
    var subtotalGoods  = tamRound2(resolved.reduce(function(s, g) { return s + g.totalCost; }, 0));
    return Object.assign({}, result, {
      grouped:       resolved,
      totalPieces:   totalPieces,
      subtotalGoods: subtotalGoods,
      grandTotal:    tamRound2(subtotalGoods + (result.shipping || 0)),
      xv: Object.assign({}, result.xv, {
        conflicts:  stillConflicts.map(function(g) { return { ref: g.ref }; }),
        fullyAgree: stillConflicts.length === 0,
        motorDUsed: true
      })
    });
  }

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
        result.dnList = tamExtractDNListFromRows(allRows);

        /* ── Motor D: only if A/B/C have unresolved conflicts ── */
        if (!result.xv.fullyAgree && result.xv.conflicts && result.xv.conflicts.length > 0) {
          try {
            tamMotorDSpinner('a verificar fatura…');
            var invText = allRows.map(function(t) { return t.join(' '); }).join('\n');
            var mdInv = await tamMotorDCall({ mode: 'invoice', text: invText });
            if (mdInv) result = tamApplyMotorDInvoice(result, mdInv);
          } catch(emd) { console.warn('Motor D invoice', emd); }
          finally { tamMotorDSpinner(null); }
        }

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

      tamRebuildDNMap();
      tamRenderAll();
      document.getElementById('tam-export-btn').classList.add('show');
      tamShowDNBarButtons();
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
                   invoiceSubtotal: r.invoiceSubtotal, grouped: r.grouped,
                   shipPerPiece: r.shipPerPiece, _externalShipping: r._externalShipping || null };
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
      tamRefCompleting.clear();
      tamRefDone.clear();
      Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
      Object.keys(tamBoxLockTimers).forEach(function(k){ clearTimeout(tamBoxLockTimers[k]); delete tamBoxLockTimers[k]; });
      tamBoxLockPending = {};
      // Force the new session name to use the next suffix
      var totalBoxes = parsedInvoices.reduce(function(s,r){ return s+(r.shipPkgs||0); },0);
      if (totalBoxes < 1) totalBoxes = 1;
      var boxes = [];
      parsedInvoices.forEach(function(r, invIdx){
        var pkgs = r.shipPkgs || 1;
        for (var i = 0; i < pkgs; i++) boxes.push({ total:null, refs:{}, locked:false, invIdx:invIdx });
      });
      tamSession = { name: baseName + ' (' + suffix + ')', boxes: boxes, createdAt: Date.now(), quickDistrib: {} };
    } else {
      tamInvoices = parsedInvoices;
      tamEngineCache = {};
      tamActiveEngines = {};
      tamSession = null;
      tamRefCompleting.clear();
      tamRefDone.clear();
      Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
      Object.keys(tamBoxLockTimers).forEach(function(k){ clearTimeout(tamBoxLockTimers[k]); delete tamBoxLockTimers[k]; });
      tamBoxLockPending = {};
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
    if (!tamSession.quickDistrib) tamSession.quickDistrib = {};
    var totalBoxes = tamInvoices.reduce(function(s, r){ return s + (r.shipPkgs || 0); }, 0);
    if (totalBoxes < 1) totalBoxes = 1;
    while (tamSession.boxes.length < totalBoxes) {
      // Find which invIdx the new box belongs to
      var newInvIdx = tamInvoices.length - 1;
      tamSession.boxes.push({ total: null, refs: {}, locked: false, invIdx: newInvIdx });
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
    var baseName = tamGetWeekSessionName();
    var all = tamLoadAllSessionsLocal();

    // Find the right name: if base exists, use next available number
    var sessionName;
    if (all[baseName]) {
      // Base name taken — rename existing to (1) if it has no suffix yet
      var existing = all[baseName];
      if (existing) {
        var renamedExisting = Object.assign({}, existing, { name: baseName + ' (1)' });
        delete all[baseName];
        all[baseName + ' (1)'] = renamedExisting;
        localStorage.setItem('tam_sessions', JSON.stringify(all));
      }
      // Find next suffix
      var suffix = 2;
      while (all[baseName + ' (' + suffix + ')']) suffix++;
      sessionName = baseName + ' (' + suffix + ')';
    } else {
      sessionName = baseName;
    }

    var totalBoxes = tamInvoices.reduce(function(s, r){ return s + (r.shipPkgs || 0); }, 0);
    if (totalBoxes < 1) totalBoxes = 1;
    var boxes = [];
    var boxOffset = 0;
    tamInvoices.forEach(function(r, invIdx){
      var pkgs = r.shipPkgs || 1;
      for (var i = 0; i < pkgs; i++) {
        boxes.push({ total: null, refs: {}, locked: false, invIdx: invIdx });
      }
    });
    tamSession = { name: sessionName, boxes: boxes, createdAt: Date.now(), quickDistrib: {}, sentRefs: {} };
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
    tamRepairBoxInvIdx();
    var totalPieces = tamInvoices.reduce(function(s,r){ return s+r.totalPieces; },0);
    var totalRefs   = tamConsolidatedRefs().length;
    var statusMsgEl = document.getElementById('tam-status-msg');
    statusMsgEl.textContent = tamInvoices.length + ' fatura(s) · ' + totalRefs + ' referências · ' + totalPieces + ' unidades';
    statusMsgEl.style.setProperty('font-weight', 'bold', 'important');
    statusMsgEl.style.setProperty('font-size', '1rem', 'important');
    document.getElementById('tam-file-name').textContent =
      tamInvoices.map(function(r){ var m = r._fileName.match(/ZY-\d+/i); return m ? m[0] : r._fileName.replace(/\.pdf$/i, ''); }).join(' · ');

    tamRenderInvoices();
    tamRenderReception();
    tamRenderAnomalies();
    tamRenderDNVerification();
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

      // Quick distribution buttons for single invoice
      var qd0 = tamSession && tamSession.quickDistrib && tamSession.quickDistrib[0];
      var singleQuick = document.createElement('div');
      singleQuick.className = 'tam-inv-quick-wrap';
      singleQuick.style.marginTop = '6px';
      if (qd0) {
        singleQuick.innerHTML =
          '<span class="tam-inv-quick-active">' +
            (qd0 === 'funchal' ? '100% Funchal' : qd0 === 'porto' ? '100% Porto Santo' : '50/50') + ' ativo' +
          '</span>' +
          '<button class="tam-inv-quick-btn tam-inv-quick-undo" data-inv="0" data-mode="undo">↩ desfazer</button>';
      } else {
        singleQuick.innerHTML =
          '<span class="tam-quick-label">distribuição rápida:</span>' +
          '<button class="tam-inv-quick-btn" data-inv="0" data-mode="funchal">100% Funchal</button>' +
          '<button class="tam-inv-quick-btn" data-inv="0" data-mode="porto">100% Porto Santo</button>' +
          '<button class="tam-inv-quick-btn tam-inv-quick-split" data-inv="0" data-mode="split">50 / 50</button>';
      }
      singleQuick.querySelectorAll('[data-mode]').forEach(function(btn){
        btn.addEventListener('click', function(){
          tamQuickDistribInvoice(0, btn.getAttribute('data-mode'));
        });
      });
      meta.appendChild(singleQuick);

      var singleToggle = document.createElement('button');
      singleToggle.className = 'tam-inv-toggle-btn tam-single-toggle-btn';
      singleToggle.id = 'tam-single-toggle-btn';
      singleToggle.title = 'expandir / minimizar';
      singleToggle.innerHTML = tamCollapseState['inv_0'] ? '&#9654;' : '&#9660;';
      singleToggle.addEventListener('click', function(){
        tamCollapseState['inv_0'] = !tamCollapseState['inv_0'];
        tamApplyCollapseState();
      });
      meta.appendChild(singleToggle);

      var singleEdit = document.createElement('button');
      singleEdit.className = 'tam-inv-edit-btn' + (tamEditMode[0] ? ' active' : '');
      singleEdit.textContent = tamEditMode[0] ? '✓ fechar edição' : '✏ editar tabela';
      singleEdit.addEventListener('click', function(){ tamToggleEditMode(0); });
      meta.appendChild(singleEdit);
      var singleRemove = document.createElement('button');
      singleRemove.className = 'tam-inv-remove-btn';
      singleRemove.title = 'remover fatura da sessão';
      singleRemove.textContent = '✕ remover fatura';
      singleRemove.addEventListener('click', function(){ tamConfirmRemoveInvoice(0); });
      meta.appendChild(singleRemove);

      var singleStock = document.createElement('button');
      singleStock.className = 'tam-inv-stock-btn';
      singleStock.textContent = '📦 Ingreso de Stock';
      singleStock.addEventListener('click', function(){ tamShowStockModal(0); });
      meta.appendChild(singleStock);
      var singleGuia = document.createElement('button');
      singleGuia.className = 'tam-inv-guia-btn';
      singleGuia.textContent = '📋 Guía';
      singleGuia.addEventListener('click', function(){ tamShowGuiaModal(0); });
      meta.appendChild(singleGuia);
      if (tamEditMode[0]) {
        tamRenderEditTable(tamInvoices[0], wrap, 0);
      } else {
        tamRenderInvoiceTable(tamInvoices[0], wrap, 0);
      }
      tamApplyCollapseState();
    } else {
      meta.style.display = 'none';
      ban.style.display  = 'none';
      tamInvoices.forEach(function(r, idx) {
        var block = document.createElement('div');
        block.className = 'tam-invoice-block';
        block.id = 'tam-invoice-block-' + idx;

        // ── Header row ──────────────────────────────────────
        var hdr = document.createElement('div');
        var invColorIdx = idx % 6;
        hdr.className = 'tam-invoice-block-header tam-inv-color-' + invColorIdx;
        var qd = (tamSession && tamSession.quickDistrib && tamSession.quickDistrib[idx]);
        var quickBtnsHtml = qd
          ? '<div class="tam-inv-quick-wrap">' +
              '<span class="tam-inv-quick-active">' +
                (qd === 'funchal' ? '100%F' : qd === 'porto' ? '100%PS' : '50/50') + ' ativo' +
              '</span>' +
              '<button class="tam-inv-quick-btn tam-inv-quick-undo" data-inv="' + idx + '" data-mode="undo">↩ desfazer</button>' +
            '</div>'
          : '<div class="tam-inv-quick-wrap">' +
              '<button class="tam-inv-quick-btn" data-inv="' + idx + '" data-mode="funchal">100%F</button>' +
              '<button class="tam-inv-quick-btn" data-inv="' + idx + '" data-mode="porto">100%PS</button>' +
              '<button class="tam-inv-quick-btn tam-inv-quick-split" data-inv="' + idx + '" data-mode="split">50/50</button>' +
            '</div>';

        hdr.innerHTML =
          '<button class="tam-inv-toggle-btn" data-inv="' + idx + '" title="expandir / minimizar">&#9660;</button>' +
          '<span class="tam-inv-num">' + tamEsc(r.invoiceNo) + '</span>' +
          '<span class="tam-inv-meta">' + tamEsc(r.invoiceDate) + ' · ' +
          r.grouped.length + ' refs · ' + r.totalPieces + ' un · ' +
          r.shipPkgs + ' pac.</span>' +
          '<span class="tam-inv-total">' + tamFmtEU(r.grandTotal) + ' €</span>' +
          quickBtnsHtml +
          '<button class="tam-inv-edit-btn' + (tamEditMode[idx] ? ' active' : '') + '" data-inv="' + idx + '">' +
            (tamEditMode[idx] ? '✓ fechar edição' : '✏ editar') +
          '</button>' +
          '<button class="tam-inv-stock-btn" data-inv="' + idx + '">📦 Ingreso de Stock</button>' +
          '<button class="tam-inv-guia-btn" data-inv="' + idx + '">📋 Guía</button>' +
          '<button class="tam-inv-export-btn" data-inv="' + idx + '">⬇ exportar</button>' +
          '<button class="tam-inv-remove-btn" data-inv="' + idx + '" title="remover fatura da sessão">✕</button>';
        block.appendChild(hdr);
        hdr.querySelectorAll('.tam-inv-quick-btn').forEach(function(btn){
          btn.addEventListener('click', function(){
            var i    = parseInt(btn.getAttribute('data-inv'));
            var mode = btn.getAttribute('data-mode');
            tamQuickDistribInvoice(i, mode);
          });
        });
        hdr.querySelector('.tam-inv-toggle-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-toggle-btn').getAttribute('data-inv'));
          tamCollapseState['inv_' + i] = !tamCollapseState['inv_' + i];
          tamApplyCollapseState();
        });
        hdr.querySelector('.tam-inv-edit-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-edit-btn').getAttribute('data-inv'));
          tamToggleEditMode(i);
        });
        hdr.querySelector('.tam-inv-export-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-export-btn').getAttribute('data-inv'));
          tamExportInvoiceCSV(tamInvoices[i]);
        });
        hdr.querySelector('.tam-inv-stock-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-stock-btn').getAttribute('data-inv'));
          tamShowStockModal(i);
        });
        hdr.querySelector('.tam-inv-guia-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-guia-btn').getAttribute('data-inv'));
          tamShowGuiaModal(i);
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
        if (tamEditMode[idx]) {
          tamRenderEditTable(r, tWrap, idx);
        } else {
          tamRenderInvoiceTable(r, tWrap, idx);
        }
        block.appendChild(tWrap);
        wrap.appendChild(block);

        if (idx < tamInvoices.length - 1) {
          var sep = document.createElement('div');
          sep.className = 'tam-inv-separator';
          wrap.appendChild(sep);
        }
      });
      tamApplyCollapseState();
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
      tamRefCompleting.clear(); tamRefDone.clear();
      Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
      Object.keys(tamBoxLockTimers).forEach(function(k){ clearTimeout(tamBoxLockTimers[k]); delete tamBoxLockTimers[k]; });
      tamBoxLockPending = {};
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
  /* ══════════════════════════════════════════════════════════════
     MODO EDICIÓN DE TABLA
  ══════════════════════════════════════════════════════════════ */
  function tamToggleEditMode(invIdx) {
    if (tamEditMode[invIdx]) {
      delete tamEditMode[invIdx];
    } else {
      tamEditMode[invIdx] = true;
    }
    tamRenderInvoices();
  }

  function tamRenderEditTable(r, container, invIdx) {
    var html =
      '<div class="tam-edit-notice">modo edição — alterações aplicam-se apenas a esta sessão</div>' +
      '<table class="tam-table tam-table-edit">' +
      '<thead><tr>' +
        '<th class="tam-th" style="width:28px">#</th>' +
        '<th class="tam-th">referência</th>' +
        '<th class="tam-th">tipo · nome</th>' +
        '<th class="tam-th">UND</th>' +
        '<th class="tam-th">P.Unit c/ env.</th>' +
        '<th class="tam-th">Total</th>' +
        '<th class="tam-th" style="width:28px"></th>' +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var typeNameVal = (g.garmentType ? g.garmentType + (g.name ? ' · ' + g.name : '') : (g.name || ''));
      html +=
        '<tr class="tam-edit-row" data-idx="' + i + '">' +
        '<td class="tam-td tam-td-num" style="color:#aaa;font-size:.72rem">' + (i+1) + '</td>' +
        '<td class="tam-td"><input class="tam-edit-input" data-field="ref" value="' + tamEsc(g.ref) + '"></td>' +
        '<td class="tam-td"><input class="tam-edit-input tam-edit-wide" data-field="typeName" value="' + tamEsc(typeNameVal) + '"></td>' +
        '<td class="tam-td"><input class="tam-edit-input tam-edit-num" type="number" data-field="pieces" value="' + g.pieces + '" min="1"></td>' +
        '<td class="tam-td"><input class="tam-edit-input tam-edit-num" type="number" data-field="unitPrice" value="' + g.unitPriceWithShip + '" step="0.01" min="0"></td>' +
        '<td class="tam-td tam-td-num">' + tamFmtEU(g.grandTotal) + '</td>' +
        '<td class="tam-td"><button class="tam-edit-del-row" data-row="' + i + '" title="eliminar">✕</button></td>' +
        '</tr>';
    });

    html += '</tbody></table>' +
      '<div class="tam-edit-actions">' +
        '<button class="tam-edit-add-row">＋ adicionar referência</button>' +
        '<button class="tam-edit-save">✓ aplicar alterações</button>' +
        '<button class="tam-edit-cancel">cancelar</button>' +
      '</div>';

    container.innerHTML = html;

    // Delete row
    container.querySelectorAll('.tam-edit-del-row').forEach(function(btn){
      btn.addEventListener('click', function(){
        r.grouped.splice(parseInt(btn.getAttribute('data-row')), 1);
        tamRecalcInvoice(r);
        tamRenderEditTable(r, container, invIdx);
      });
    });

    // Add row
    container.querySelector('.tam-edit-add-row').addEventListener('click', function(){
      r.grouped.push({ ref:'NOVA-REF', garmentType:'', name:'', pieces:1,
        unitPriceWithShip:0, grandTotal:0, totalCost:0, confidence:'CONFIRMED' });
      tamRenderEditTable(r, container, invIdx);
      var last = container.querySelectorAll('[data-field="ref"]');
      if (last.length) { last[last.length-1].focus(); last[last.length-1].select(); }
    });

    // Save
    container.querySelector('.tam-edit-save').addEventListener('click', function(){
      var rows = container.querySelectorAll('.tam-edit-row');
      var newGrouped = [];
      rows.forEach(function(row, i){
        var refVal   = row.querySelector('[data-field="ref"]').value.trim();
        var tnVal    = row.querySelector('[data-field="typeName"]').value.trim();
        var pieces   = parseInt(row.querySelector('[data-field="pieces"]').value) || 1;
        var unitP    = parseFloat(row.querySelector('[data-field="unitPrice"]').value) || 0;
        var parts    = tnVal.split('·');
        var gType    = parts.length > 1 ? parts[0].trim() : '';
        var gName    = parts.length > 1 ? parts.slice(1).join('·').trim() : tnVal;
        newGrouped.push({
          ref: refVal, garmentType: gType, name: gName,
          pieces: pieces, unitPriceWithShip: unitP,
          grandTotal: tamRound2(unitP * pieces),
          totalCost:  tamRound2(unitP * pieces),
          confidence: (r.grouped[i] && r.grouped[i].confidence) || 'CONFIRMED'
        });
      });
      r.grouped = newGrouped;
      tamRecalcInvoice(r);
      delete tamEditMode[invIdx];
      tamRenderAll();
      tamSaveSession(false);
    });

    // Cancel
    container.querySelector('.tam-edit-cancel').addEventListener('click', function(){
      delete tamEditMode[invIdx];
      tamRenderInvoices();
    });
  }

  function tamRecalcInvoice(r) {
    r.totalPieces   = r.grouped.reduce(function(s,g){ return s + g.pieces; }, 0);
    r.subtotalGoods = tamRound2(r.grouped.reduce(function(s,g){ return s + g.grandTotal; }, 0));
    r.grandTotal    = tamRound2(r.subtotalGoods + (r.shipping || 0));
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

    // Freight alert — shown when shipping = 0 or external shipping was applied
    var _freightIdx = tamInvoices.findIndex(function(inv){ return inv === r; });
    if (_freightIdx >= 0 && (tamDetectMissingShipping(r) || r._externalShipping)) {
      tamRenderFreightAlert(_freightIdx, el);
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

    // Freight alert for single-invoice layout
    var _si = tamInvoices.findIndex(function(inv){ return inv === r; });
    if (_si >= 0 && (tamDetectMissingShipping(r) || r._externalShipping)) {
      tamRenderFreightAlert(_si, el);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     RENDER: Tabla de factura individual (con columnas Funchal/Porto Santo)
  ──────────────────────────────────────────────────────────────── */
  function tamRenderInvoiceTable(r, container, invIdx) {
    var consolidated = tamConsolidatedRefs();

    // Check if ANY ref in this invoice has distribution started
    var anyDistrib = r.grouped.some(function(g){
      var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
      return (distrib.f + distrib.p) > 0;
    });

    var showAnomalyCol = anyDistrib;

    var html =
      '<table class="tam-table">' +
      '<thead><tr>' +
        '<th class="tam-th">#</th>' +
        '<th class="tam-th">referência</th>' +
        '<th class="tam-th">tipo · nome</th>' +
        '<th class="tam-th">UND</th>' +
        '<th class="tam-th">P.Unit/T</th>' +
        '<th class="tam-th">Total</th>' +
        '<th class="tam-th tam-th-funchal" style="color:#ffffff!important">FNC</th>' +
        '<th class="tam-th tam-th-porto" style="color:#ffffff!important">PXO</th>' +
        (showAnomalyCol ? '<th class="tam-th tam-th-anomaly">±</th>' : '') +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var conf     = g.confidence || 'CONFIRMED';
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      var badge    = conf === 'CONFLICT' ? '<span class="tam-badge tam-badge-conflict">⚠</span>' : conf === 'MOTOR_D' ? '<span class="tam-badge tam-badge-motord" title="Resolvido pelo Motor D">🤖</span>' : '';

      var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
      var fVal    = distrib.f || 0;
      var pVal    = distrib.p || 0;
      var total   = fVal + pVal;
      var diff    = total - g.pieces;  // positive = more, negative = fewer
      var refDone = total === g.pieces && g.pieces > 0;

      var trClass = conf === 'CONFLICT' ? 'tam-row-conflict' : '';
      if (refDone) trClass += ' tam-ref-complete';

      // Anomaly cell
      var anomalyCell = '';
      if (showAnomalyCol) {
        if (total === 0) {
          anomalyCell = '<td class="tam-td tam-td-num tam-cell-anomaly-empty"></td>';
        } else if (diff === 0) {
          anomalyCell = '<td class="tam-td tam-td-num tam-cell-anomaly-ok" title="completo">✓</td>';
        } else if (diff < 0) {
          anomalyCell = '<td class="tam-td tam-td-num tam-cell-anomaly-low" title="faltam ' + Math.abs(diff) + ' peças">' + diff + '</td>';
        } else {
          anomalyCell = '<td class="tam-td tam-td-num tam-cell-anomaly-high" title="' + diff + ' peças a mais">+' + diff + '</td>';
        }
      }

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
        anomalyCell +
        '</tr>';
    });

    // Tfoot spans depend on anomaly col
    var extraTd = showAnomalyCol ? '<td class="tam-td"></td>' : '';
    var shipLabel;
    if (r._externalShipping) {
      var ext = r._externalShipping;
      var extPkgs = ext.pkgs || r.shipPkgs || 0;
      shipLabel = '🚚 transporte externo' + (extPkgs ? ' · ' + extPkgs + ' pac.' : '');
    } else {
      shipLabel = 'transporte · ' + r.shipPkgs + ' pac. × 17,50 €';
    }
    html +=
      '</tbody><tfoot>' +
      '<tr class="tam-tr-sub">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2"><strong>subtotal mercadoria</strong></td>' +
        '<td class="tam-td tam-td-num"><strong>' + r.totalPieces + '</strong></td>' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(r.subtotalGoods) + '</strong></td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' + extraTd +
      '</tr>' +
      '<tr class="tam-tr-ship' + (r._externalShipping ? ' tam-tr-ship-ext' : '') + '">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2">' + shipLabel + '</td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num">' + tamFmtEU(r.shipping) + '</td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' + extraTd +
      '</tr>' +
      '<tr class="tam-tr-grand">' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td" colspan="2"><strong>total geral</strong></td>' +
        '<td class="tam-td tam-td-num"><strong>' + r.totalPieces + '</strong></td>' +
        '<td class="tam-td"></td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(r.grandTotal) + '</strong></td>' +
        '<td class="tam-td"></td><td class="tam-td"></td>' + extraTd +
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

  /* Distribuir F/P de un ref para uma fatura — soma só as caixas dessa fatura */
  function tamGetRefDistribForInvoice(ref, invIdx) {
    if (!tamSession) return { f: 0, p: 0 };
    var f = 0, p = 0;
    tamSession.boxes.forEach(function(box){
      if (box.invIdx === invIdx && box.refs[ref]) {
        f += (box.refs[ref].f || 0);
        p += (box.refs[ref].p || 0);
      }
    });
    return { f: f, p: p };
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

    tamRepairBoxInvIdx();

    var quickDistrib = (tamSession.quickDistrib) || {};
    var quickCount   = Object.keys(quickDistrib).length;

    // Sort boxes: pending first, complete last, hidden removed
    var boxOrder = boxes.map(function(box, bi){
      var received = 0;
      if (box.total) Object.values(box.refs).forEach(function(v){ received += (v.f||0)+(v.p||0); });
      // A box in tamBoxLockPending is in the 3s transition window: treat as NOT yet complete
      var isComplete = box.total && received >= box.total && !tamBoxLockPending[bi];
      var isHidden   = box.invIdx !== undefined && quickDistrib[box.invIdx] !== undefined;
      return { bi:bi, box:box, received:received, isComplete:isComplete, isHidden:isHidden };
    }).filter(function(b){ return !b.isHidden; });

    var pendingBoxes   = boxOrder.filter(function(b){ return !b.isComplete; });
    var completedBoxes = boxOrder.filter(function(b){ return  b.isComplete; });
    var visiblePending = pendingBoxes.length > 0 ? [pendingBoxes[0]] : [];
    var sortedBoxes    = visiblePending.concat(completedBoxes);

    // Only refs needing manual work
    var manualInvoiceIdxs = tamInvoices.map(function(r,i){ return i; })
      .filter(function(i){ return quickDistrib[i] === undefined; });
    var consolidatedForSummary = consolidated.filter(function(c){
      return c.invoices.some(function(inv){ return manualInvoiceIdxs.indexOf(inv.invIdx) >= 0; });
    });

    // ── Build HTML ────────────────────────────────────────────
    // Header row 1: ref | total | F | PS | [for each box: F PS QUICK_BTNS]
    var hdr1 =
      '<th class="tam-rec-ref-col">referência</th>' +
      '<th class="tam-rec-total-col">total</th>' +
      '<th class="tam-rec-total-col tam-th-funchal">F</th>' +
      '<th class="tam-rec-total-col tam-th-porto">PS</th>';

    // Pre-compute per-box style info used in both hdr1 and hdr2
    var boxStyleInfo = sortedBoxes.map(function(bObj, boxPos){
      var isActiveBox    = (pendingBoxes[0] && bObj.bi === pendingBoxes[0].bi);
      var isCompletedBox = bObj.isComplete;
      var completedCount = sortedBoxes.slice(0, boxPos).filter(function(b){ return b.isComplete; }).length;
      var greyShade = isCompletedBox ? ((completedCount % 2 === 0) ? 'tam-box-col-grey-odd' : 'tam-box-col-grey-even') : '';
      var boxCls = isCompletedBox
        ? ('tam-box-col-complete ' + greyShade)
        : (isActiveBox ? 'tam-box-col-active' : 'tam-box-col-inactive');
      var colParity = (boxPos % 2 === 0) ? 'tam-col-odd' : 'tam-col-even';
      return { isActiveBox:isActiveBox, isCompletedBox:isCompletedBox, greyShade:greyShade, boxCls:boxCls, colParity:colParity };
    });

    sortedBoxes.forEach(function(bObj, boxPos){
      var bi  = bObj.bi;
      var info = boxStyleInfo[boxPos];
      var boxLabel = 'Caixa ' + (bi+1) + (bObj.box.locked ? ' \uD83D\uDD12' : '');
      var colSpan = info.isActiveBox ? 3 : 2;
      hdr1 += '<th colspan="' + colSpan + '" class="tam-box-header ' + info.boxCls + '">' + boxLabel + '</th>';
    });

    // Header row 2: sub-labels
    var hdr2 =
      '<th class="tam-rec-ref-col">' +
        '<input type="text" id="tam-ref-filter" class="tam-ref-filter-input" placeholder="\uD83D\uDD0D filtrar\u2026" autocomplete="off" spellcheck="false">' +
      '</th>' +
      '<th class="tam-rec-total-col tam-hdr-action-col">' +
        '<button class="tam-action-btn tam-undo-btn" id="tam-undo-btn" title="desfazer (\u21A9)" disabled>\u21A9</button>' +
      '</th>' +
      '<th class="tam-rec-total-col tam-hdr-action-col">' +
        '<button class="tam-action-btn tam-redo-btn" id="tam-redo-btn" title="refazer (\u21AA)" disabled>\u21AA</button>' +
      '</th>' +
      '<th class="tam-rec-total-col tam-hdr-action-col">' +
        '<button class="tam-action-btn tam-clear-btn" id="tam-clear-btn" title="borrar todo">\u{1F5D1}</button>' +
      '</th>';

    sortedBoxes.forEach(function(bObj, boxPos){
      var bi       = bObj.bi;
      var box      = bObj.box;
      var received = bObj.received;
      var pctLabel = box.total ? received + '/' + box.total : '';
      var isLocked = box.locked;
      var inputCls = box.total ? 'tam-box-total-input tam-box-declared' : 'tam-box-total-input';
      var info      = boxStyleInfo[boxPos];
      var isPending = info.isActiveBox;
      var colSpan   = isPending ? 3 : 2;
      // Sub-header gets both complete and grey shade classes
      var subCls = (bObj.isComplete ? ' tam-box-sub-complete' : '') + (info.greyShade ? ' ' + info.greyShade : '');

      hdr2 +=
        '<th class="tam-box-sub-th' + subCls + '" colspan="' + colSpan + '">' +
        '<div class="tam-box-sub-inner">' +
          '<input type="number" class="' + inputCls + '" id="tam-box-total-' + bi + '" ' +
            'value="' + (box.total||'') + '" placeholder="total" ' +
            (isLocked ? 'disabled ' : '') + 'min="1" data-box="' + bi + '">' +
          (pctLabel ? '<span class="tam-box-pct">' + pctLabel + '</span>' : '') +
          (isLocked ? '<button class="tam-box-edit-btn" data-box="' + bi + '">\u270F\uFE0F</button>' : '') +
        '</div>' +
        '<div class="tam-box-sub-labels">' +
          '<span class="tam-sub-f">F</span>' +
          '<span class="tam-sub-p">PS</span>' +
          (isPending && !isLocked ? '<span class="tam-sub-q">r\u00E1pido</span>' : '') +
        '</div>' +
        '</th>';
    });

    // Ref rows — keep original invoice order regardless of completion state
    var sortedRefs = consolidatedForSummary;

    var rowsHtml = '';
    sortedRefs.forEach(function(c){
      var totals  = tamGetRefTotals(c.ref);
      var recv    = totals.f + totals.p;
      var isDone  = recv >= c.totalPieces && c.totalPieces > 0;
      var isOver  = recv > c.totalPieces  && c.totalPieces > 0;
      var isCompleting = isDone && tamRefCompleting.has(c.ref);
      var rowCls  = isOver ? 'tam-ref-over' : (isCompleting ? 'tam-ref-completing' : (isDone ? 'tam-ref-complete' : ''));
      var safeRef = c.ref.replace(/[^a-z0-9]/gi,'_');

      rowsHtml +=
        '<tr class="' + rowCls + '" data-ref="' + tamEsc(c.ref) + '">' +
        '<td class="tam-rec-ref-col"><strong>' + tamEsc(c.ref) + '</strong></td>' +
        '<td class="tam-rec-total-col tam-td-num">' + c.totalPieces + '</td>' +
        '<td class="tam-rec-total-col tam-td-num tam-cell-funchal" id="tam-sum-f-' + safeRef + '">' + (totals.f > 0 ? totals.f : '—') + '</td>' +
        '<td class="tam-rec-total-col tam-td-num tam-cell-porto"  id="tam-sum-p-' + safeRef + '">' + (totals.p > 0 ? totals.p : '—') + '</td>';

      sortedBoxes.forEach(function(bObj, boxPos){
        var bi  = bObj.bi;
        var box = bObj.box;
        var info = boxStyleInfo[boxPos];
        var fVal = (box.refs[c.ref] && box.refs[c.ref].f) || '';
        var pVal = (box.refs[c.ref] && box.refs[c.ref].p) || '';
        var disabled = (!box.total || box.locked) ? 'disabled ' : '';
        var cellCls   = bObj.isComplete ? ' tam-box-cell-complete' : '';
        var colParity = ' ' + info.colParity;
        var greyCls   = info.greyShade ? (' ' + info.greyShade) : '';
        var compactCls = (!info.isActiveBox) ? ' tam-box-compact' : '';
        var isPending  = info.isActiveBox;

        // Quick buttons only in the active (first pending) box, only for pending/completing refs
        var quickCell = '';
        var boxHasTotal = !!(box.total);
        if (isPending && !isDone && !isOver) {
          var btnDisabled = boxHasTotal ? '' : ' disabled';
          var btnTitle    = boxHasTotal ? '' : ' title="introduza primeiro o total da caixa"';
          quickCell =
            '<td class="tam-rec-cell-quick' + colParity + (boxHasTotal ? '' : ' tam-quick-nototals') + '">' +
              '<div class="tam-row-quick">' +
                '<button class="tam-row-quick-btn"' + btnDisabled + btnTitle + ' data-ref="' + tamEsc(c.ref) + '" data-mode="funchal">F</button>' +
                '<button class="tam-row-quick-btn"' + btnDisabled + btnTitle + ' data-ref="' + tamEsc(c.ref) + '" data-mode="porto">PS</button>' +
                '<button class="tam-row-quick-btn tam-row-quick-split"' + btnDisabled + btnTitle + ' data-ref="' + tamEsc(c.ref) + '" data-mode="split">\xbd</button>' +
              '</div>' +
            '</td>';
        } else if (isPending && isCompleting) {
          quickCell = '<td class="tam-rec-cell-quick' + colParity + '"></td>';
        } else if (isPending) {
          quickCell = '<td class="tam-rec-cell-quick' + colParity + '"></td>';
        }
        // Non-active boxes: NO quick cell at all

        rowsHtml +=
          '<td class="tam-rec-cell-f' + cellCls + colParity + compactCls + greyCls + '">' +
            '<input type="number" class="tam-rec-input tam-rec-input-f" ' +
              'id="tam-inp-f-' + bi + '-' + safeRef + '" ' +
              'data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-city="f" ' +
              'value="' + fVal + '" min="0" ' + disabled + 'placeholder="\u2014">' +
          '</td>' +
          '<td class="tam-rec-cell-p' + cellCls + colParity + compactCls + greyCls + '">' +
            '<input type="number" class="tam-rec-input tam-rec-input-p" ' +
              'id="tam-inp-p-' + bi + '-' + safeRef + '" ' +
              'data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-city="p" ' +
              'value="' + pVal + '" min="0" ' + disabled + 'placeholder="\u2014">' +
          '</td>' +
          quickCell;
      });

      rowsHtml += '</tr>';
    });

    var tableHtml =
      '<div class="tam-rec-scroll-sync-wrap">' +
        '<div class="tam-rec-scroll-top-bar"><div class="tam-rec-scroll-top-inner"></div></div>' +
        '<div class="tam-rec-boxes-scroll">' +
        '<table class="tam-rec-boxes-table">' +
        '<thead>' +
          '<tr class="tam-boxes-hdr-row">' + hdr1 + '</tr>' +
          '<tr class="tam-boxes-sub-hdr">' + hdr2 + '</tr>' +
        '</thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '</table></div>' +
      '</div>';

    // Global quick buttons bar
    var globalBar =
      '<div class="tam-rec-quick-btns">' +
        '<span class="tam-quick-label">tudo:</span>' +
        '<button class="tam-quick-btn" id="tam-quick-funchal">100% Funchal</button>' +
        '<button class="tam-quick-btn" id="tam-quick-porto">100% Porto Santo</button>' +
        '<button class="tam-quick-btn tam-quick-btn-split" id="tam-quick-split">50 / 50</button>' +
        '<button class="tam-quick-btn tam-guia-all-btn" id="tam-guia-all-btn">📋 Guía consolidada</button>' +
      '</div>';

    var distribCollapsed = !!tamCollapseState['distrib'];
    area.innerHTML =
      '<div class="tam-rec-divider"><span>Distribuição</span></div>' +
      '<div class="tam-rec-area' + (distribCollapsed ? ' tam-rec-collapsed' : '') + '">' +
        '<div class="tam-rec-area-title">' +
          '<button class="tam-inv-toggle-btn" id="tam-rec-toggle-btn" title="expandir / minimizar" style="margin-right:8px;">' +
            (distribCollapsed ? '&#9654;' : '&#9660;') +
          '</button>' +
          tamInvoices.length + ' fatura(s) · ' + consolidatedForSummary.length + ' referências' +
          (quickCount > 0 ? ' · ' + quickCount + ' com distribuição rápida' : '') +
        '</div>' +
        '<div class="tam-rec-collapsible">' +
          globalBar +
          tableHtml +
        '</div>' +
      '</div>';

    // ── BIND DISTRIBUTION TOGGLE ─────────────────────────────────
    (function(){
      var recToggleBtn = area.querySelector('#tam-rec-toggle-btn');
      if (recToggleBtn) recToggleBtn.addEventListener('click', function(){
        tamCollapseState['distrib'] = !tamCollapseState['distrib'];
        var recArea2 = area.querySelector('.tam-rec-area');
        if (recArea2) recArea2.classList.toggle('tam-rec-collapsed', !!tamCollapseState['distrib']);
        recToggleBtn.innerHTML = tamCollapseState['distrib'] ? '&#9654;' : '&#9660;';
      });
    })();

    // ── BIND GUIA CONSOLIDADA ────────────────────────────────
    (function(){
      var guiaAllBtn = area.querySelector('#tam-guia-all-btn');
      if (guiaAllBtn) guiaAllBtn.addEventListener('click', function(){ tamShowGuiaModal(null); });
    })();

    // ── BIND UNDO / REDO / CLEAR BUTTONS ─────────────────────
    (function(){
      var undoBtn  = area.querySelector('#tam-undo-btn');
      var redoBtn  = area.querySelector('#tam-redo-btn');
      var clearBtn = area.querySelector('#tam-clear-btn');

      tamUpdateUndoButtons();   // sync disabled state on every render

      if (undoBtn)  undoBtn.addEventListener('click',  function(e){ e.stopPropagation(); tamUndo(); });
      if (redoBtn)  redoBtn.addEventListener('click',  function(e){ e.stopPropagation(); tamRedo(); });
      if (clearBtn) clearBtn.addEventListener('click', function(e){
        e.stopPropagation();
        // Confirm before clearing everything
        if (!confirm('Borrar toda la distribución?\n\nPuedes deshacer con el botón ↩')) return;
        tamClearAll();
      });
    })();

    // ── BIND PER-ROW QUICK BUTTONS ────────────────────────────
    area.querySelectorAll('.tam-row-quick-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref  = btn.getAttribute('data-ref');
        var mode = btn.getAttribute('data-mode');
        var c    = consolidatedForSummary.find(function(x){ return x.ref === ref; });
        if (!c) return;
        tamPushUndo();
        // Use only the first pending box
        var firstPending = pendingBoxes[0];
        var boxList = firstPending ? [firstPending.box] : sortedBoxes.map(function(b){ return b.box; });
        if (mode === 'funchal') {
          tamDistribToBoxesFiltered(ref, c.totalPieces, c.totalPieces, 0, boxList);
        } else if (mode === 'porto') {
          tamDistribToBoxesFiltered(ref, c.totalPieces, 0, c.totalPieces, boxList);
        } else if (mode === 'split') {
          var half  = Math.floor(c.totalPieces / 2);
          var isOdd = c.totalPieces % 2 !== 0;
          tamDistribToBoxesFiltered(ref, c.totalPieces, half, c.totalPieces - half - (isOdd ? 1 : 0), boxList);
          if (isOdd) {
            tamOddPieceDialogFiltered([{ ref:ref, totalPieces:c.totalPieces }], 0, boxList, function(){
              tamDetectRefCompletions();
              if (firstPending) tamCheckBoxLock(firstPending.bi);
              tamRenderAll(); tamSaveSession(false);
            });
            return;
          }
        }
        // Detect completions BEFORE re-render so 3s state is set
        tamDetectRefCompletions();
        if (firstPending) tamCheckBoxLock(firstPending.bi);
        tamRenderAll();
        tamSaveSession(false);
      });
    });

    // ── BIND GLOBAL QUICK BUTTONS ─────────────────────────────
    var qF = area.querySelector('#tam-quick-funchal');
    var qP = area.querySelector('#tam-quick-porto');
    var qS = area.querySelector('#tam-quick-split');
    if (qF) qF.addEventListener('click', function(){ tamQuickDistrib('funchal'); });
    if (qP) qP.addEventListener('click', function(){ tamQuickDistrib('porto'); });
    if (qS) qS.addEventListener('click', function(){ tamQuickDistrib('split'); });

    // ── BIND BOX TOTAL INPUT ──────────────────────────────────
    area.querySelectorAll('.tam-box-total-input').forEach(function(inp){
      inp.addEventListener('change', function(){
        var bi  = parseInt(inp.getAttribute('data-box'));
        var val = parseInt(inp.value);
        tamSession.boxes[bi].total = (!isNaN(val) && val > 0) ? val : null;
        tamRenderAll();
        tamScheduleSave();
      });
    });

    // ── BIND EDIT BOX BUTTON ──────────────────────────────────
    area.querySelectorAll('.tam-box-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var bi = parseInt(btn.getAttribute('data-box'));
        var box = tamSession.boxes[bi];
        if (box) {
          // Clear tamRefDone for all refs in this box so they can flash again after re-work
          Object.keys(box.refs).forEach(function(ref){ tamRefDone.delete(ref); });
          box.locked = false;
        }
        tamRenderAll(); tamScheduleSave();
      });
    });

    // ── BIND F/P INPUTS ───────────────────────────────────────
    area.querySelectorAll('.tam-rec-input').forEach(function(inp){
      // Push undo when the user starts editing a field (on focus)
      inp.addEventListener('focus', function(){
        tamPushUndo();
      });

      inp.addEventListener('input', function(){
        var bi   = parseInt(inp.getAttribute('data-box'));
        var ref  = inp.getAttribute('data-ref');
        var city = inp.getAttribute('data-city');
        var val  = parseInt(inp.value) || 0;
        if (!tamSession.boxes[bi].refs[ref]) tamSession.boxes[bi].refs[ref] = { f:0, p:0 };
        tamSession.boxes[bi].refs[ref][city] = val;
        tamUpdateSummaryRow(ref);
        // Detect completions on every keystroke (3s timers handle the deferred sort/lock)
        tamDetectRefCompletions();
        tamCheckBoxLock(bi);
        tamScheduleSave();
      });

      inp.addEventListener('keydown', function(e){
        if (e.key !== 'Tab' && e.key !== 'Enter') return;
        var bi  = parseInt(inp.getAttribute('data-box'));
        var ref = inp.getAttribute('data-ref');
        // Navigation only — detection already handled by input event
        var isF  = inp.classList.contains('tam-rec-input-f');
        var isPS = inp.classList.contains('tam-rec-input-p');
        var safeRef = ref.replace(/[^a-z0-9]/gi,'_');
        if (isF && e.key === 'Enter') {
          e.preventDefault();
          var ps = document.getElementById('tam-inp-p-' + inp.getAttribute('data-box') + '-' + safeRef);
          if (ps && !ps.disabled) { ps.focus(); ps.select(); }
          return;
        }
        if (isPS && (e.key === 'Tab' || e.key === 'Enter')) {
          e.preventDefault();
          var allF = Array.from(area.querySelectorAll('.tam-rec-input-f:not([disabled])'));
          var curF = document.getElementById('tam-inp-f-' + inp.getAttribute('data-box') + '-' + safeRef);
          var nxt  = allF[allF.indexOf(curF) + 1];
          if (nxt) { nxt.focus(); nxt.select(); }
        }
      });
    });

    // ── CLICK-TO-MODIFY on completed ref rows ─────────────────
    (function(){
      // ── Singleton tooltip — created once, reused across renders ──
      var tip = document.getElementById('tam-modify-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'tam-modify-tip';
        tip.innerHTML =
          '<span class="tam-tip-msg">\u00BFModificar esta referencia?</span>' +
          '<button class="tam-tip-btn" id="tam-tip-yes">S\u00ED</button>' +
          '<button class="tam-tip-cancel" id="tam-tip-cancel">No</button>';
        document.body.appendChild(tip);

        // ── Close on outside click ────────────────────────────────
        document.addEventListener('click', function(e){
          if (!tip.classList.contains('tam-tip-visible')) return;
          if (tip.contains(e.target)) return;
          tip.classList.remove('tam-tip-visible');
          window.tamTipState = null;
        }, true);

        // ── Cancel button ─────────────────────────────────────────
        tip.querySelector('#tam-tip-cancel').addEventListener('click', function(e){
          e.stopPropagation();
          tip.classList.remove('tam-tip-visible');
          window.tamTipState = null;
        });

        // ── "Sí" button ───────────────────────────────────────────
        tip.querySelector('#tam-tip-yes').addEventListener('click', function(e){
          e.stopPropagation();
          var state = window.tamTipState;
          if (!state || !state.ref || !tamSession) return;
          var ref = state.ref;

          tip.classList.remove('tam-tip-visible');
          window.tamTipState = null;

          // Find which boxes are locked AND contain this ref
          var unlockedBis = [];
          tamSession.boxes.forEach(function(box, bi){
            if (box.locked && box.refs[ref] !== undefined) {
              box.locked = false;
              if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
              delete tamBoxLockPending[bi];
              unlockedBis.push(bi);
            }
          });

          // Reset animation state so it can flash again when re-completed
          tamRefDone.delete(ref);
          tamRefCompleting.delete(ref);
          if (tamRefCompletingTimers[ref]) { clearTimeout(tamRefCompletingTimers[ref]); delete tamRefCompletingTimers[ref]; }

          if (!unlockedBis.length) return;
          tamScheduleSave();
          tamRenderAll();

          // After re-render: illuminate the unlocked column(s) and grey out ref cells
          requestAnimationFrame(function(){
            var recArea = document.getElementById('tam-reception-area');
            if (!recArea) return;

            // 1. Illuminate entire column for each unlocked box (white column highlight)
            unlockedBis.forEach(function(bi){
              recArea.querySelectorAll('.tam-rec-input[data-box="' + bi + '"]').forEach(function(inp){
                var td = inp.closest('td');
                if (td) td.classList.add('tam-col-unlocked');
              });
              // Also header cells
              var hdrInput = recArea.querySelector('#tam-box-total-' + bi);
              if (hdrInput) {
                var th = hdrInput.closest('th');
                if (th) th.classList.add('tam-col-unlocked-hdr');
              }
            });

            // 2. Grey-highlight (relieve) the specific ref cells
            recArea.querySelectorAll('.tam-rec-input[data-ref]').forEach(function(inp){
              if (inp.getAttribute('data-ref') === ref && !inp.disabled) {
                var td = inp.closest('td');
                if (td) td.classList.add('tam-cell-ref-edit');
              }
            });

            // 3. Focus first editable cell of this ref
            var first = recArea.querySelector('.tam-rec-input[data-ref]:not([disabled])');
            recArea.querySelectorAll('.tam-rec-input[data-ref]').forEach(function(inp){
              if (inp.getAttribute('data-ref') === ref && !inp.disabled && !first) first = inp;
              if (inp.getAttribute('data-ref') === ref && !inp.disabled) first = inp; // get last matched; use first
            });
            // Get actual first
            var allEditable = Array.from(recArea.querySelectorAll('.tam-rec-input[data-ref]'))
              .filter(function(inp){ return inp.getAttribute('data-ref') === ref && !inp.disabled; });
            if (allEditable[0]) { allEditable[0].focus(); allEditable[0].select(); }
          });
        });
      }

      // ── Event delegation: click on ref cell of completed rows ──
      var tbody = area.querySelector('.tam-rec-boxes-table tbody');
      if (!tbody) return;

      tbody.addEventListener('click', function(e){
        var row = e.target.closest('tr[data-ref]');
        if (!row) return;
        if (!row.classList.contains('tam-ref-complete') && !row.classList.contains('tam-ref-over')) return;

        var refCell = e.target.closest('.tam-rec-ref-col');
        if (!refCell) return;   // only clicking the ref cell triggers the tooltip

        e.stopPropagation();
        window.tamTipState = { ref: row.getAttribute('data-ref') };

        // Position to the RIGHT of the ref cell, vertically centered on the row
        var rect    = refCell.getBoundingClientRect();
        var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;

        tip.style.visibility = 'hidden';
        tip.classList.add('tam-tip-visible');
        requestAnimationFrame(function(){
          var tipH    = tip.offsetHeight;
          var rowRect = row.getBoundingClientRect();
          var leftPos = rect.right + scrollX + 12;
          var topPos  = rowRect.top + scrollY + (rowRect.height - tipH) / 2;
          // Clamp so it doesn't go off the right edge of the viewport
          var maxLeft = scrollX + window.innerWidth - tip.offsetWidth - 16;
          if (leftPos > maxLeft) leftPos = rect.left + scrollX - tip.offsetWidth - 12;
          tip.style.left = leftPos + 'px';
          tip.style.top  = topPos  + 'px';
          tip.style.visibility = '';
        });
      });
    })();

    // ── BIND REF FILTER INPUT ─────────────────────────────────
    (function(){
      var filterInp = area.querySelector('#tam-ref-filter');
      if (!filterInp) return;
      filterInp.addEventListener('input', function(){
        var q = filterInp.value.trim().toLowerCase();
        var tbody = area.querySelector('.tam-rec-boxes-table tbody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr[data-ref]');
        rows.forEach(function(row){
          if (!q) {
            row.style.display = '';
          } else {
            var ref = (row.getAttribute('data-ref') || '').toLowerCase();
            row.style.display = (ref.indexOf(q) >= 0) ? '' : 'none';
          }
        });
      });
      // Clear on Escape
      filterInp.addEventListener('keydown', function(e){
        if (e.key === 'Escape') {
          filterInp.value = '';
          filterInp.dispatchEvent(new Event('input'));
          filterInp.blur();
        }
      });
    })();

    // ── SYNC TOP + BOTTOM SCROLLBARS ─────────────────────────
    (function(){
      var topBar   = area.querySelector('.tam-rec-scroll-top-bar');
      var botScroll = area.querySelector('.tam-rec-boxes-scroll');
      var inner    = area.querySelector('.tam-rec-scroll-top-inner');
      if (!topBar || !botScroll || !inner) return;

      function syncInnerWidth(){
        inner.style.width = botScroll.scrollWidth + 'px';
        inner.style.height = '1px';
      }
      syncInnerWidth();

      var syncing = false;
      topBar.addEventListener('scroll', function(){
        if (syncing) return; syncing = true;
        botScroll.scrollLeft = topBar.scrollLeft;
        syncing = false;
      });
      botScroll.addEventListener('scroll', function(){
        if (syncing) return; syncing = true;
        topBar.scrollLeft = botScroll.scrollLeft;
        syncing = false;
      });
    })();
  }

  /* ──────────────────────────────────────────────────────────────
     Verificar si una caja alcanzó el total → bloquear
  ──────────────────────────────────────────────────────────────── */
  function tamCheckBoxLock(bi) {
    if (!tamSession) return;
    var box = tamSession.boxes[bi];
    if (!box || !box.total || box.locked) return;
    var received = 0;
    Object.values(box.refs).forEach(function(v){ received += (v.f||0) + (v.p||0); });

    if (received >= box.total) {
      // Mark as pending (keeps it shown as active during the 3s window)
      tamBoxLockPending[bi] = true;
      // Don't stack timers
      if (tamBoxLockTimers[bi]) return;
      tamBoxLockTimers[bi] = setTimeout(function(){
        delete tamBoxLockTimers[bi];
        delete tamBoxLockPending[bi];
        if (!tamSession) return;
        var box2 = tamSession.boxes[bi];
        if (!box2 || box2.locked) return;
        // Re-verify (user may have corrected a value during the 3s)
        var recv2 = 0;
        Object.values(box2.refs).forEach(function(v){ recv2 += (v.f||0) + (v.p||0); });
        if (recv2 >= box2.total) {
          box2.locked = true;
          // Clear any completing-ref animations for refs in this box
          Object.keys(box2.refs).forEach(function(ref){
            if (tamRefCompleting.has(ref)) {
              tamRefCompleting.delete(ref);
              if (tamRefCompletingTimers[ref]) {
                clearTimeout(tamRefCompletingTimers[ref]);
                delete tamRefCompletingTimers[ref];
              }
            }
          });
          tamRenderAll();
          tamScheduleSave();
        }
      }, 3000);
    } else {
      // No longer complete — cancel pending lock for this box
      if (tamBoxLockTimers[bi]) {
        clearTimeout(tamBoxLockTimers[bi]);
        delete tamBoxLockTimers[bi];
      }
      delete tamBoxLockPending[bi];
    }
  }

  /* ──────────────────────────────────────────────────────────────
     Actualizar clase de alerta de una fila de ref en tiempo real
  ──────────────────────────────────────────────────────────────── */
  /* Detect which refs just completed / uncompleted and update tamRefCompleting + DOM classes */
  function tamDetectRefCompletions() {
    if (!tamSession) return;
    var consolidated = tamConsolidatedRefs();
    var area = document.getElementById('tam-reception-area');

    consolidated.forEach(function(c){
      var totals = tamGetRefTotals(c.ref);
      var recv   = totals.f + totals.p;
      var isDone = recv >= c.totalPieces && c.totalPieces > 0;
      var isOver = recv >  c.totalPieces && c.totalPieces > 0;
      var alreadyCompleting = tamRefCompleting.has(c.ref);
      var alreadyDone       = tamRefDone.has(c.ref);

      if (isDone && !alreadyCompleting && !alreadyDone) {
        // Newly complete for the first time — start 3s green flash
        tamRefCompleting.add(c.ref);
        if (tamRefCompletingTimers[c.ref]) clearTimeout(tamRefCompletingTimers[c.ref]);
        (function(ref){
          tamRefCompletingTimers[ref] = setTimeout(function(){
            delete tamRefCompletingTimers[ref];
            tamRefCompleting.delete(ref);
            tamRefDone.add(ref);        // mark permanently done — no re-flash
            // Re-render reception so the ref sorts to the bottom
            tamRenderReception();
          }, 3000);
        })(c.ref);
      } else if (!isDone && (alreadyCompleting || alreadyDone)) {
        // Ref became incomplete again (user edited a value) — reset everything
        if (tamRefCompletingTimers[c.ref]) {
          clearTimeout(tamRefCompletingTimers[c.ref]);
          delete tamRefCompletingTimers[c.ref];
        }
        tamRefCompleting.delete(c.ref);
        tamRefDone.delete(c.ref);       // allow re-flash next time it completes
      }

      // Update DOM row classes in-place (no full rebuild needed)
      if (!area) return;
      var safeSelector = c.ref.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      var row = area.querySelector('tr[data-ref="' + safeSelector + '"]');
      if (!row) return;
      row.classList.remove('tam-ref-over', 'tam-ref-complete', 'tam-ref-completing');
      if (isOver) {
        row.classList.add('tam-ref-over');
      } else if (isDone) {
        if (tamRefCompleting.has(c.ref)) {
          row.classList.add('tam-ref-completing');
        } else {
          row.classList.add('tam-ref-complete');
        }
      }
    });
  }

  /* Legacy wrapper */
  function tamUpdateRefRowAlert(ref) {
    tamDetectRefCompletions();
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
     DISTRIBUIÇÃO RÁPIDA — global (área de resumen) y por factura
  ══════════════════════════════════════════════════════════════ */

  /* Repair: assign invIdx to boxes that don't have it (legacy sessions) */
  function tamRepairBoxInvIdx() {
    if (!tamSession || !tamSession.boxes) return;
    var offset = 0;
    tamInvoices.forEach(function(r, invIdx){
      var pkgs = r.shipPkgs || 1;
      for (var i = 0; i < pkgs; i++) {
        if (tamSession.boxes[offset + i] !== undefined) {
          tamSession.boxes[offset + i].invIdx = invIdx;
        }
      }
      offset += pkgs;
    });
    if (!tamSession.quickDistrib) tamSession.quickDistrib = {};
  }

  /* Per-invoice quick distribution */
  function tamQuickDistribInvoice(invIdx, mode) {
    if (!tamSession) return;
    tamRepairBoxInvIdx();  // ensure all boxes have invIdx
    var r = tamInvoices[invIdx];
    if (!r) return;

    // UNDO — clear quick distribution for this invoice
    if (mode === 'undo') {
      tamPushUndo();
      delete tamSession.quickDistrib[invIdx];
      var undoBoxes = tamSession.boxes.filter(function(box){ return box.invIdx === invIdx; });
      r.grouped.forEach(function(g){
        undoBoxes.forEach(function(box){ delete box.refs[g.ref]; });
      });
      tamRenderAll();
      tamSaveSession(false);
      return;
    }

    tamPushUndo();
    // Get boxes that belong to this invoice
    var invBoxes = tamSession.boxes.filter(function(box){ return box.invIdx === invIdx; });
    console.log('TAM: quick distrib invIdx=' + invIdx + ' mode=' + mode + ' boxes=' + invBoxes.length);

    if (mode === 'funchal' || mode === 'porto') {
      r.grouped.forEach(function(g){
        tamDistribToBoxesFiltered(g.ref, g.pieces, mode === 'funchal' ? g.pieces : 0, mode === 'porto' ? g.pieces : 0, invBoxes);
      });
      tamSession.quickDistrib[invIdx] = mode;
      tamDetectRefCompletions();
      invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
      tamRenderAll();
      tamSaveSession(false);
    } else if (mode === 'split') {
      var oddRefs = [];
      r.grouped.forEach(function(g){
        var half  = Math.floor(g.pieces / 2);
        var isOdd = g.pieces % 2 !== 0;
        tamDistribToBoxesFiltered(g.ref, g.pieces, half, g.pieces - half - (isOdd ? 1 : 0), invBoxes);
        if (isOdd) oddRefs.push({ ref: g.ref, totalPieces: g.pieces, invBoxes: invBoxes });
      });
      tamSession.quickDistrib[invIdx] = 'split';
      if (oddRefs.length) {
        tamOddPieceDialogFiltered(oddRefs, 0, invBoxes, function(){
          tamDetectRefCompletions();
          invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
          tamRenderAll();
          tamSaveSession(false);
        });
      } else {
        tamDetectRefCompletions();
        invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
        tamRenderAll();
        tamSaveSession(false);
      }
    }
  }

  /* Distribute only within a specific set of boxes */
  function tamDistribToBoxesFiltered(ref, totalPieces, fTotal, pTotal, boxList) {
    if (!boxList.length) return;
    var declaredBoxes = boxList.filter(function(b){ return b.total; });
    // No declared totals: put everything in first box to avoid rounding loss
    if (!declaredBoxes.length) {
      var fb = boxList[0];
      if (!fb.refs[ref]) fb.refs[ref] = { f:0, p:0 };
      fb.refs[ref].f = fTotal;
      fb.refs[ref].p = pTotal;
      for (var bi = 1; bi < boxList.length; bi++) {
        if (boxList[bi].refs[ref]) { boxList[bi].refs[ref].f = 0; boxList[bi].refs[ref].p = 0; }
      }
      return;
    }
    // Declared totals: distribute proportionally
    var fRem = fTotal, pRem = pTotal, pieceRem = totalPieces;
    declaredBoxes.forEach(function(box, i){
      if (!box.refs[ref]) box.refs[ref] = { f:0, p:0 };
      var isLast = (i === declaredBoxes.length - 1);
      var boxShare = isLast ? pieceRem : Math.min(pieceRem, box.total);
      var fShare   = isLast ? fRem : (totalPieces > 0 ? Math.round(fTotal * boxShare / totalPieces) : 0);
      var pShare   = boxShare - fShare;
      fShare = Math.max(0, Math.min(fShare, fRem));
      pShare = Math.max(0, Math.min(pShare, pRem));
      box.refs[ref].f = fShare;
      box.refs[ref].p = pShare;
      fRem -= fShare; pRem -= pShare; pieceRem -= boxShare;
    });
  }

  function tamOddPieceDialogFiltered(oddRefs, idx, invBoxes, onComplete) {
    if (idx >= oddRefs.length) { onComplete(); return; }
    var c    = oddRefs[idx];
    var half = Math.floor(c.totalPieces / 2);

    var old = document.getElementById('tam-session-dialog');
    if (old) old.parentNode.removeChild(old);

    var dialog = document.createElement('div');
    dialog.id = 'tam-session-dialog';
    dialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">peça impar — ' + (idx+1) + ' de ' + oddRefs.length + '</div>' +
        '<div class="tam-dialog-body">' +
          'Referência <strong>' + tamEsc(c.ref) + '</strong><br>' +
          'Total: <strong>' + c.totalPieces + ' peças</strong> · Funchal: ' + half + ' · Porto Santo: ' + half + '<br><br>' +
          'Sobra <strong>1 peça</strong>. Para onde vai?' +
        '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-add" id="tam-odd-f">→ Funchal (' + (half+1) + 'F / ' + half + 'PS)</button>' +
          '<button class="tam-dialog-btn tam-dialog-btn-add" id="tam-odd-p">→ Porto Santo (' + half + 'F / ' + (half+1) + 'PS)</button>' +
          '<button class="tam-dialog-btn" id="tam-odd-s">deixar pendente</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    function choose(f, p) {
      tamDistribToBoxesFiltered(c.ref, c.totalPieces, f, p, invBoxes);
      dialog.parentNode.removeChild(dialog);
      tamOddPieceDialogFiltered(oddRefs, idx + 1, invBoxes, onComplete);
    }
    dialog.querySelector('#tam-odd-f').addEventListener('click', function(){ choose(half+1, half); });
    dialog.querySelector('#tam-odd-p').addEventListener('click', function(){ choose(half, half+1); });
    dialog.querySelector('#tam-odd-s').addEventListener('click', function(){ choose(half, half); });
  }

  /* Global quick distribution (area de resumen buttons) */
  function tamQuickDistrib(mode) {
    if (!tamSession) return;
    tamPushUndo();
    tamRepairBoxInvIdx();
    var consolidated = tamConsolidatedRefs();

    function afterDistrib() {
      // Detect completions before re-render so 3s state is set
      tamDetectRefCompletions();
      tamSession.boxes.forEach(function(box, bi){ tamCheckBoxLock(bi); });
    }

    if (mode === 'funchal' || mode === 'porto') {
      consolidated.forEach(function(c){
        tamDistribToBoxes(c.ref, c.totalPieces,
          mode === 'funchal' ? c.totalPieces : 0,
          mode === 'porto'   ? c.totalPieces : 0);
      });
      afterDistrib();
      tamRenderAll();
      tamSaveSession(false);
      return;
    }

    if (mode === 'split') {
      var oddRefs = [];
      consolidated.forEach(function(c){
        var half  = Math.floor(c.totalPieces / 2);
        var isOdd = c.totalPieces % 2 !== 0;
        tamDistribToBoxes(c.ref, c.totalPieces, half, c.totalPieces - half - (isOdd ? 1 : 0));
        if (isOdd) oddRefs.push(c);
      });
      if (oddRefs.length) {
        tamOddPieceDialog(oddRefs, 0, function(){
          afterDistrib();
          tamRenderAll(); tamSaveSession(false);
        });
      } else {
        afterDistrib();
        tamRenderAll(); tamSaveSession(false);
      }
    }
  }

  /* Distribute f and p across ALL boxes — works without box.total declared */
  function tamDistribToBoxes(ref, totalPieces, fTotal, pTotal) {
    var boxes = tamSession.boxes;
    if (!boxes.length) return;
    var declared = boxes.filter(function(b){ return b.total; });
    var targets  = declared.length ? declared : boxes;
    var fRem = fTotal, pRem = pTotal, pieceRem = totalPieces;
    targets.forEach(function(box, i){
      if (!box.refs[ref]) box.refs[ref] = { f:0, p:0 };
      var isLast   = (i === targets.length - 1);
      var capacity = box.total || Math.ceil(totalPieces / targets.length);
      var share    = isLast ? pieceRem : Math.min(pieceRem, capacity);
      var fShare   = isLast ? fRem : Math.round(fTotal * share / (totalPieces || 1));
      var pShare   = share - fShare;
      fShare = Math.max(0, Math.min(fShare, fRem));
      pShare = Math.max(0, Math.min(pShare, pRem));
      box.refs[ref].f = fShare;
      box.refs[ref].p = pShare;
      fRem -= fShare; pRem -= pShare; pieceRem -= share;
    });
  }

  function tamGetBoxRefTotal(box, ref) {
    if (!box.refs[ref]) return 0;
    return (box.refs[ref].f || 0) + (box.refs[ref].p || 0);
  }

  /* Sequential dialog for odd-piece refs */
  function tamOddPieceDialog(oddRefs, idx, onComplete) {
    if (idx >= oddRefs.length) { onComplete(); return; }
    var c = oddRefs[idx];
    var half = Math.floor(c.totalPieces / 2);

    var old = document.getElementById('tam-session-dialog');
    if (old) old.parentNode.removeChild(old);

    var dialog = document.createElement('div');
    dialog.id = 'tam-session-dialog';
    dialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">peça impar — ' + (idx+1) + ' de ' + oddRefs.length + '</div>' +
        '<div class="tam-dialog-body">' +
          'Referência <strong>' + tamEsc(c.ref) + '</strong><br>' +
          'Total: <strong>' + c.totalPieces + ' peças</strong> · ' +
          'Funchal: ' + half + ' · Porto Santo: ' + half + '<br><br>' +
          'Sobra <strong>1 peça</strong>. Para onde vai?' +
        '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-add" id="tam-odd-funchal">→ Funchal (' + (half+1) + ' F / ' + half + ' PS)</button>' +
          '<button class="tam-dialog-btn tam-dialog-btn-add" id="tam-odd-porto">→ Porto Santo (' + half + ' F / ' + (half+1) + ' PS)</button>' +
          '<button class="tam-dialog-btn" id="tam-odd-skip">deixar pendente (não distribuir esta peça)</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    function choose(f, p) {
      tamDistribToBoxes(c.ref, c.totalPieces, f, p);
      dialog.parentNode.removeChild(dialog);
      tamOddPieceDialog(oddRefs, idx + 1, onComplete);
    }

    dialog.querySelector('#tam-odd-funchal').addEventListener('click', function(){ choose(half+1, half); });
    dialog.querySelector('#tam-odd-porto').addEventListener('click',   function(){ choose(half, half+1); });
    dialog.querySelector('#tam-odd-skip').addEventListener('click',    function(){ choose(half, half); }); // leaves 1 unassigned
  }
  function tamRenderAnomalies() {
    var area = document.getElementById('tam-anomaly-area');
    if (!area) return;

    // Build consolidated ref totals directly from boxes (raw, unfiltered)
    var boxTotals = {};
    if (tamSession) {
      tamSession.boxes.forEach(function(box){
        Object.keys(box.refs || {}).forEach(function(ref){
          if (!boxTotals[ref]) boxTotals[ref] = { f:0, p:0 };
          boxTotals[ref].f += (box.refs[ref].f || 0);
          boxTotals[ref].p += (box.refs[ref].p || 0);
        });
      });
    }

    // Build consolidated ref totals needed across all invoices
    var refNeeded = {};
    tamInvoices.forEach(function(r){
      r.grouped.forEach(function(g){
        refNeeded[g.ref] = (refNeeded[g.ref] || 0) + g.pieces;
      });
    });

    // Collect anomalies: any ref that has been touched and differs from expected
    var anomalies = [];
    Object.keys(boxTotals).forEach(function(ref){
      var got  = (boxTotals[ref].f || 0) + (boxTotals[ref].p || 0);
      if (got === 0) return; // nothing entered yet
      var expected = refNeeded[ref] || 0;
      var diff = got - expected;
      if (diff !== 0) {
        // Find which invoice(s) this ref belongs to
        var invoiceNos = tamInvoices
          .filter(function(r){ return r.grouped.some(function(g){ return g.ref === ref; }); })
          .map(function(r){ return r.invoiceNo; })
          .join(', ');
        anomalies.push({
          ref:       ref,
          invoiceNo: invoiceNos,
          expected:  expected,
          got:       got,
          diff:      diff,
          f:         boxTotals[ref].f || 0,
          p:         boxTotals[ref].p || 0
        });
      }
    });

    if (!anomalies.length) {
      area.innerHTML = '';
      return;
    }

    // Sort: most severe first (largest absolute diff)
    anomalies.sort(function(a,b){ return Math.abs(b.diff) - Math.abs(a.diff); });

    var btnHtml =
      '<div class="tam-anomaly-btn-wrap">' +
        '<button id="tam-anomaly-btn" class="tam-anomaly-btn">⚠ ' + anomalies.length + ' anomalia(s) — ver resumo</button>' +
      '</div>';

    var reportHtml =
      '<div id="tam-anomaly-report" style="display:none;">' +
        '<div class="tam-anomaly-title">resumo de anomalias</div>' +
        '<div class="tam-anomaly-scroll">' +
        '<table class="tam-anomaly-table">' +
        '<thead><tr>' +
          '<th>referência</th>' +
          '<th>fatura</th>' +
          '<th>esperado</th>' +
          '<th>funchal</th>' +
          '<th>porto santo</th>' +
          '<th>diferença</th>' +
        '</tr></thead><tbody>' +
        anomalies.map(function(a){
          var diffCls = a.diff < 0 ? 'tam-anom-low' : 'tam-anom-high';
          var diffTxt = a.diff < 0
            ? a.diff + ' <span style="font-weight:normal;font-size:.75rem">(faltam ' + Math.abs(a.diff) + ')</span>'
            : '+' + a.diff + ' <span style="font-weight:normal;font-size:.75rem">(a mais)</span>';
          return '<tr>' +
            '<td><strong>' + tamEsc(a.ref) + '</strong></td>' +
            '<td>' + tamEsc(a.invoiceNo) + '</td>' +
            '<td class="tam-td-num">' + a.expected + '</td>' +
            '<td class="tam-td-num tam-cell-funchal">' + a.f + '</td>' +
            '<td class="tam-td-num tam-cell-porto">'   + a.p + '</td>' +
            '<td class="tam-td-num ' + diffCls + '">' + diffTxt + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>' +
        '</div>' +
      '</div>';

    area.innerHTML = btnHtml + reportHtml;

    area.querySelector('#tam-anomaly-btn').addEventListener('click', function(){
      var report = document.getElementById('tam-anomaly-report');
      var btn    = document.getElementById('tam-anomaly-btn');
      if (report.style.display === 'none') {
        report.style.display = 'block';
        btn.textContent = '▲ ocultar resumo';
      } else {
        report.style.display = 'none';
        btn.textContent = '⚠ ' + anomalies.length + ' anomalia(s) — ver resumo';
      }
    });
  }
  function tamRenderSessionBar() {
    var bar = document.getElementById('tam-session-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    var nameEl = document.getElementById('tam-session-name');
    var saveBtn = document.getElementById('tam-save-btn');
    var closeBtn = document.getElementById('tam-close-session-btn');
    var stEl   = document.getElementById('tam-session-status');
    if (tamSession) {
      if (nameEl) nameEl.value = tamSession.name;
      if (saveBtn) saveBtn.classList.add('visible');
      if (closeBtn) closeBtn.style.display = 'inline-block';
    } else {
      if (nameEl) nameEl.value = '';
      if (saveBtn) saveBtn.classList.remove('visible');
      if (closeBtn) closeBtn.style.display = 'none';
    }
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
      boxes:         tamSession.boxes,
      sentRefs:      tamSession.sentRefs || {},
      deliveryNotes: tamDeliveryNotes || {},
      dnVerifyState: tamDNVerifyState  || {},
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
          dnList:        r.dnList        || [],
          grouped:       r.grouped,
          shipPerPiece:  r.shipPerPiece  || 0,
          _externalShipping: r._externalShipping || null
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
      var saveBtn = document.getElementById('tam-save-btn');
      var closeBtnVis = document.getElementById('tam-close-session-btn');
      if (saveBtn) saveBtn.classList.add('visible');
      if (closeBtnVis) closeBtnVis.style.display = 'inline-block';
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
      var row = {
        session_name: payload.name,
        saved_at:     new Date(payload.savedAt).toISOString(),
        data:         JSON.stringify(payload)
      };
      var check = await sb.from(TAM_SESSIONS_TABLE)
        .select('session_name').eq('session_name', payload.name).limit(1);
      if (check.error) { console.error('TAM sessions SELECT:', check.error); }
      var res;
      if (check.data && check.data.length > 0) {
        res = await sb.from(TAM_SESSIONS_TABLE)
          .update({ saved_at: row.saved_at, data: row.data })
          .eq('session_name', payload.name);
      } else {
        res = await sb.from(TAM_SESSIONS_TABLE).insert(row);
      }
      if (res && res.error) { console.error('TAM sessions WRITE:', res.error); }
      else { console.log('TAM sessions: guardado en Supabase OK —', payload.name); }
    } catch(e) { console.error('TAM sessions EXCEPTION:', e); }
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
      if (res.error) { console.error('TAM sessions READ:', res.error); }
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
        var key = btn.getAttribute('data-key');
        tamConfirmDeleteSession(key, function(){
          tamDeleteSession(key);
          var updatedSessions = tamLoadAllSessionsLocal();
          tamRenderSessionsList(updatedSessions);
        });
      });
    });
  }

  function tamLoadSession(key, sessionData) {
    var s = sessionData || tamLoadAllSessionsLocal()[key];
    if (!s) return;
    tamSession = { name: s.name, boxes: s.boxes, createdAt: s.savedAt, sentRefs: s.sentRefs || {} };
    tamDeliveryNotes  = s.deliveryNotes  || {};
    tamDNVerifyState  = s.dnVerifyState  || {};
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
          dnList:         inv.dnList         || [],
          grouped:        grouped,
          shipPerPiece:   inv.shipPerPiece   || (totalPieces > 0 ? tamRound2(shipping / totalPieces) : 0),
          _externalShipping: inv._externalShipping || null,
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
      tamRebuildDNMap();
      tamRenderAll();
      tamStartAutoSave();
      tamShowDNBarButtons();
    }
  }

  function tamConfirmDeleteSession(key, onConfirm) {
    var old = document.getElementById('tam-session-dialog');
    if (old) old.parentNode.removeChild(old);

    var dialog = document.createElement('div');
    dialog.id = 'tam-session-dialog';
    dialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">apagar sessão</div>' +
        '<div class="tam-dialog-body">' +
          'Tem a certeza que quer apagar a sessão<br><strong>' + tamEsc(key) + '</strong>?<br>' +
          '<small style="color:#888">Esta ação é irreversível.</small>' +
        '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-new">🗑 sim, apagar</button>' +
          '<button class="tam-dialog-btn tam-dialog-btn-add">cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    dialog.querySelector('.tam-dialog-btn-new').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
      onConfirm();
    });
    dialog.querySelector('.tam-dialog-btn-add').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
    });
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
      var rRes = await sb.from(TAM_REFS_TABLE).upsert(rows, { onConflict: 'ref', ignoreDuplicates: true });
      if (rRes && rRes.error) { console.error('TAM refs WRITE:', rRes.error); }
      else { console.log('TAM refs: guardado OK —', rows.length, 'refs'); }
    } catch(e) { console.error('TAM refs EXCEPTION:', e); }
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
     INGRESO DE STOCK — modal flotante con tabla Primavera
  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     GUIAS DE TRANSPORTE
     invIdx = null  → consolidado de toda a sessão
     invIdx = N     → guia de uma fatura específica
  ══════════════════════════════════════════════════════════════ */

  /* ── Chave única por ref+fatura para sentRefs ── */
  function tamSentKey(ref, invIdx) { return ref + '___' + invIdx; }

  /* ── Quantidade já enviada de uma ref+fatura ── */
  function tamSentQty(ref, invIdx) {
    if (!tamSession || !tamSession.sentRefs) return { f:0, p:0 };
    var key = tamSentKey(ref, invIdx);
    var lotes = tamSession.sentRefs[key] || [];
    var f = 0, p = 0;
    lotes.forEach(function(l){ f += (l.f||0); p += (l.p||0); });
    return { f:f, p:p };
  }

  /* ── Construir linhas da guia para uma fatura ── */
  function tamBuildGuiaRows(invIdx) {
    var r = tamInvoices[invIdx];
    if (!r) return [];
    var rows = [];
    r.grouped.forEach(function(g){
      var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
      var sent    = tamSentQty(g.ref, invIdx);
      var pendF   = Math.max(0, (distrib.f||0) - (sent.f||0));
      var pendP   = Math.max(0, (distrib.p||0) - (sent.p||0));
      var totalF  = distrib.f||0;
      var totalP  = distrib.p||0;
      if (totalF > 0 || totalP > 0) {
        rows.push({
          ref:    g.ref,
          invIdx: invIdx,
          pendF:  pendF,
          pendP:  pendP,
          sentF:  sent.f||0,
          sentP:  sent.p||0,
          totalF: totalF,
          totalP: totalP,
          done:   (pendF === 0 && pendP === 0)
        });
      }
    });
    return rows;
  }

  /* ── Construir linhas consolidadas de todas as faturas ── */
  function tamBuildGuiaRowsAll() {
    var map = {};
    tamInvoices.forEach(function(r, invIdx){
      var rows = tamBuildGuiaRows(invIdx);
      rows.forEach(function(row){
        // Key by ref only (not ref+invIdx) so same ref across invoices merges into one row
        var key = row.ref;
        if (!map[key]) {
          map[key] = {
            ref:    row.ref,
            invIdx: row.invIdx,   // kept for backward-compat (first invoice wins)
            pendF:  0, pendP:  0,
            sentF:  0, sentP:  0,
            totalF: 0, totalP: 0,
            done:   true,
            _sourceRows: []       // original per-invoice rows, needed for confirm
          };
        }
        map[key].pendF  += row.pendF;
        map[key].pendP  += row.pendP;
        map[key].sentF  += row.sentF;
        map[key].sentP  += row.sentP;
        map[key].totalF += row.totalF;
        map[key].totalP += row.totalP;
        map[key].done    = map[key].done && row.done;
        map[key]._sourceRows.push(row);
      });
    });
    return Object.values(map);
  }

  /* ── Confirmar envío: gravar lote com data ── */
  function tamConfirmGuiaEnvio(rows) {
    if (!tamSession) return;
    if (!tamSession.sentRefs) tamSession.sentRefs = {};
    var today = new Date().toISOString().slice(0,10);
    rows.forEach(function(row){
      if (row.done) return;
      if (row.pendF === 0 && row.pendP === 0) return;
      // Consolidated rows carry _sourceRows — confirm each contributing invoice separately
      if (row._sourceRows && row._sourceRows.length > 0) {
        row._sourceRows.forEach(function(srcRow){
          if (srcRow.done) return;
          if (srcRow.pendF === 0 && srcRow.pendP === 0) return;
          var key = tamSentKey(srcRow.ref, srcRow.invIdx);
          if (!tamSession.sentRefs[key]) tamSession.sentRefs[key] = [];
          tamSession.sentRefs[key].push({ data: today, f: srcRow.pendF, p: srcRow.pendP });
        });
      } else {
        var key = tamSentKey(row.ref, row.invIdx);
        if (!tamSession.sentRefs[key]) tamSession.sentRefs[key] = [];
        tamSession.sentRefs[key].push({ data: today, f: row.pendF, p: row.pendP });
      }
    });
    tamSaveSession(false);
  }

  /* ── Modal principal de guia ── */
  function tamShowGuiaModal(invIdx) {
    var isAll  = (invIdx === null);
    var rows   = isAll ? tamBuildGuiaRowsAll() : tamBuildGuiaRows(invIdx);
    var title  = isAll
      ? 'Guía Consolidada · ' + tamInvoices.length + ' fatura(s)'
      : 'Guía · ' + tamEsc(tamInvoices[invIdx].invoiceNo);

    var pendRows = rows.filter(function(r){ return !r.done; });
    var sentRows = rows.filter(function(r){ return  r.done; });

    var old = document.getElementById('tam-guia-modal');
    if (old) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'tam-guia-modal';

    /* ── Column copy helpers ── */
    var COL_G = ['Ref. Funchal','Qtd. F','Ref. Porto Santo','Qtd. PS'];

    function buildTableRows(rowList) {
      if (!rowList.length) return '<tr><td colspan="4" class="tam-guia-empty">Sem referências pendentes</td></tr>';
      return rowList.map(function(row, i){
        var cls = row.done ? ' tam-guia-row-sent' : (i%2===0 ? ' tam-guia-row-even' : ' tam-guia-row-odd');
        var fQty = row.done ? row.totalF : row.pendF;
        var pQty = row.done ? row.totalP : row.pendP;
        var fDisp = fQty > 0 ? fQty : '—';
        var pDisp = pQty > 0 ? pQty : '—';
        return '<tr class="tam-guia-tr' + cls + '">' +
          '<td class="tam-guia-td tam-guia-ref-f" data-gcol="0">' + (fQty>0 ? tamEsc(row.ref) : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-qty-f" data-gcol="1">' + (fQty>0 ? fDisp : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-sep"></td>' +
          '<td class="tam-guia-td tam-guia-ref-p" data-gcol="2">' + (pQty>0 ? tamEsc(row.ref) : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-qty-p" data-gcol="3">' + (pQty>0 ? pDisp : '') + '</td>' +
        '</tr>';
      }).join('');
    }

    var fPend = pendRows.reduce(function(s,r){ return s+r.pendF; },0);
    var pPend = pendRows.reduce(function(s,r){ return s+r.pendP; },0);
    var fSent = sentRows.reduce(function(s,r){ return s+r.totalF; },0);
    var pSent = sentRows.reduce(function(s,r){ return s+r.totalP; },0);

    var copyBar = '<div class="tam-guia-copy-bar">' +
      '<span class="tam-guia-copy-label">copiar coluna:</span>' +
      COL_G.map(function(lbl,ci){
        return '<button class="tam-guia-copy-btn" data-gcol="' + ci + '">⧉ ' + lbl + '</button>';
      }).join('') +
      '<span class="tam-guia-copy-msg" id="tam-guia-copy-msg"></span>' +
    '</div>';

    var sentSection = sentRows.length
      ? '<tr class="tam-guia-sent-hdr"><td colspan="5">✓ Já enviado (' + sentRows.length + ' refs · ' + fSent + ' F · ' + pSent + ' PS)</td></tr>' +
        buildTableRows(sentRows)
      : '';

    modal.innerHTML =
      '<div id="tam-guia-backdrop"></div>' +
      '<div id="tam-guia-panel">' +
        '<div id="tam-guia-header">' +
          '<div id="tam-guia-title">' +
            '<span id="tam-guia-title-main">' + title + '</span>' +
            '<span id="tam-guia-title-sub">Guía de transporte · TAM Fashion</span>' +
          '</div>' +
          '<div id="tam-guia-header-btns">' +
            '<button id="tam-guia-confirm-btn" class="tam-guia-action-btn tam-guia-confirm"' + (pendRows.length===0?' disabled':'') + '>✓ Confirmar envío</button>' +
            '<button id="tam-guia-export-btn" class="tam-guia-action-btn">⬇ Exportar CSV</button>' +
            '<button id="tam-guia-close-btn" class="tam-guia-close-btn">✕</button>' +
          '</div>' +
        '</div>' +
        copyBar +
        '<div id="tam-guia-scroll">' +
          '<table id="tam-guia-table">' +
            '<thead><tr>' +
              '<th class="tam-guia-th tam-guia-th-f" colspan="2">🔵 FUNCHAL (A4) · ' + fPend + ' uds pendentes</th>' +
              '<th class="tam-guia-th tam-guia-th-sep"></th>' +
              '<th class="tam-guia-th tam-guia-th-p" colspan="2">🔴 PORTO SANTO (A5) · ' + pPend + ' uds pendentes</th>' +
            '</tr>' +
            '<tr>' +
              '<th class="tam-guia-th2">Referência</th>' +
              '<th class="tam-guia-th2 tam-guia-th2-qty">Qtd.</th>' +
              '<th class="tam-guia-th-sep"></th>' +
              '<th class="tam-guia-th2">Referência</th>' +
              '<th class="tam-guia-th2 tam-guia-th2-qty">Qtd.</th>' +
            '</tr></thead>' +
            '<tbody>' + buildTableRows(pendRows) + sentSection + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-guia-footer">' +
          pendRows.length + ' refs pendentes · ' + fPend + ' uds Funchal · ' + pPend + ' uds Porto Santo' +
          (sentRows.length ? ' · ' + sentRows.length + ' já enviadas' : '') +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-guia-visible'); });

    /* ── Copy column ── */
    var copyMsg   = modal.querySelector('#tam-guia-copy-msg');
    var copyTimer = null;
    modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ci   = parseInt(btn.getAttribute('data-gcol'));
        var vals = Array.from(modal.querySelectorAll('td[data-gcol="'+ci+'"]'))
                       .map(function(td){ return td.textContent.trim(); })
                       .filter(function(v){ return v && v !== '—'; });
        if (!vals.length) return;
        modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
        btn.classList.add('tam-guia-copy-active');
        var text = vals.join('\n');
        function showMsg(ok){
          if (!copyMsg) return;
          copyMsg.textContent = ok ? '✓ ' + COL_G[ci] + ' copiado!' : '⚠ copie manualmente';
          copyMsg.style.color = ok ? '#2e7d32' : '#b05000';
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(function(){
            copyMsg.textContent = '';
            modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
          }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function(){ showMsg(true); }).catch(function(){ showMsg(false); });
        } else {
          try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); showMsg(true);
          } catch(e){ showMsg(false); }
        }
      });
    });

    /* ── Confirmar envío ── */
    modal.querySelector('#tam-guia-confirm-btn').addEventListener('click', function(){
      if (!pendRows.length) return;
      var confirmDiv = document.createElement('div');
      confirmDiv.id = 'tam-guia-confirm-overlay';
      confirmDiv.innerHTML =
        '<div id="tam-guia-confirm-box">' +
          '<div class="tam-gc-title">⚠ Confirmar envío</div>' +
          '<div class="tam-gc-body">' +
            'Vas a marcar <strong>' + pendRows.length + ' referencias</strong> como enviadas hoy (' + new Date().toLocaleDateString('pt-PT') + ').<br>' +
            '<strong>' + fPend + '</strong> uds Funchal · <strong>' + pPend + '</strong> uds Porto Santo<br><br>' +
            'Esta acción no se puede deshacer.' +
          '</div>' +
          '<div class="tam-gc-btns">' +
            '<button class="tam-gc-btn tam-gc-ok">✓ Confirmar</button>' +
            '<button class="tam-gc-btn tam-gc-cancel">Cancelar</button>' +
          '</div>' +
        '</div>';
      modal.querySelector('#tam-guia-panel').appendChild(confirmDiv);
      confirmDiv.querySelector('.tam-gc-cancel').addEventListener('click', function(){
        confirmDiv.parentNode.removeChild(confirmDiv);
      });
      confirmDiv.querySelector('.tam-gc-ok').addEventListener('click', function(){
        tamConfirmGuiaEnvio(pendRows);
        confirmDiv.parentNode.removeChild(confirmDiv);
        closeModal();
        // Re-open to show updated state
        setTimeout(function(){ tamShowGuiaModal(invIdx); }, 280);
      });
    });

    /* ── Export CSV ── */
    modal.querySelector('#tam-guia-export-btn').addEventListener('click', function(){
      var lines = ['\uFEFF' + 'Referencia;Qtd Funchal;Referencia;Qtd Porto Santo'];
      var maxLen = Math.max(
        pendRows.filter(function(r){ return r.pendF>0; }).length,
        pendRows.filter(function(r){ return r.pendP>0; }).length
      );
      var fRows2 = pendRows.filter(function(r){ return r.pendF>0; });
      var pRows2 = pendRows.filter(function(r){ return r.pendP>0; });
      for (var li = 0; li < Math.max(fRows2.length, pRows2.length); li++) {
        var fc = fRows2[li] ? fRows2[li].ref + ';' + fRows2[li].pendF : ';';
        var pc = pRows2[li] ? pRows2[li].ref + ';' + pRows2[li].pendP : ';';
        lines.push(fc + ';' + pc);
      }
      var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = 'Guia_' + (isAll ? 'Consolidada' : tamInvoices[invIdx].invoiceNo.replace(/[^a-zA-Z0-9_-]/g,'_')) + '_' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });

    /* ── Close ── */
    function closeModal() {
      modal.classList.remove('tam-guia-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
    }
    modal.querySelector('#tam-guia-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-guia-close-btn').addEventListener('click', closeModal);
    document.addEventListener('keydown', function escG(e){
      if (e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', escG); }
    });
  }

  function tamShowStockModal(invIdx) {
    var r = tamInvoices[invIdx];
    if (!r) return;

    // Build rows: first ALL Funchal (A4) refs, then ALL Porto Santo (A5) refs
    // Skip refs with 0 distribution
    var rows = [];
    ['f','p'].forEach(function(city){
      var cityCode = city === 'f' ? 'A4' : 'A5';
      r.grouped.forEach(function(g){
        var distrib = tamGetRefDistribForInvoice(g.ref, invIdx);
        var qty = city === 'f' ? (distrib.f || 0) : (distrib.p || 0);
        if (qty <= 0) return;
        rows.push({
          ref:      g.ref,
          city:     cityCode,
          iva:      '00',
          price:    g.unitPriceWithShip,
          qty:      qty
        });
      });
    });

    // ── Build modal HTML ──────────────────────────────────────
    var old = document.getElementById('tam-stock-modal');
    if (old) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'tam-stock-modal';

    var tableRows = rows.map(function(row, i){
      return '<tr class="' + (i % 2 === 0 ? 'tam-stock-row-even' : 'tam-stock-row-odd') + '">' +
        '<td class="tam-stock-td tam-stock-ref">' + tamEsc(row.ref) + '</td>' +
        '<td class="tam-stock-td tam-stock-city">' + row.city + '</td>' +
        '<td class="tam-stock-td tam-stock-iva">'  + row.iva   + '</td>' +
        '<td class="tam-stock-td tam-stock-price">' + tamFmtEU(row.price) + '</td>' +
        '<td class="tam-stock-td tam-stock-qty">'  + row.qty   + '</td>' +
        '</tr>';
    }).join('');

    var noData = rows.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa;font-style:italic;">Sem distribuição registada para esta fatura</td></tr>'
      : '';

    var COL_S = ['Referencia', 'Armaz\u00e9m', 'IVA', 'Pre\u00e7o', 'Qtd.'];
    var stockCopyBar =
      '<div class="tam-guia-copy-bar">' +
        '<span class="tam-guia-copy-label">copiar coluna:</span>' +
        COL_S.map(function(lbl, ci){
          return '<button class="tam-guia-copy-btn tam-stock-copy-btn" data-scol="' + ci + '">&#x29c9; ' + lbl + '</button>';
        }).join('') +
        '<span class="tam-guia-copy-msg" id="tam-stock-copy-msg"></span>' +
      '</div>';

    modal.innerHTML =
      '<div id="tam-stock-backdrop"></div>' +
      '<div id="tam-stock-panel">' +
        '<div id="tam-stock-header">' +
          '<div id="tam-stock-title">' +
            '<span id="tam-stock-inv-label">' + tamEsc(r.invoiceNo) + '</span>' +
            '<span id="tam-stock-sub-label">Ingreso de Stock · Primavera ERP</span>' +
          '</div>' +
          '<div id="tam-stock-actions">' +
            '<button id="tam-stock-export-btn" class="tam-stock-action-btn">⬇ Exportar Excel</button>' +
            '<button id="tam-stock-close-btn" class="tam-stock-close-btn" title="fechar">✕</button>' +
          '</div>' +
        '</div>' +
        stockCopyBar +
        '<div id="tam-stock-scroll">' +
          '<table id="tam-stock-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="tam-stock-th tam-stock-ref">Referencia</th>' +
                '<th class="tam-stock-th tam-stock-city">Armazém</th>' +
                '<th class="tam-stock-th tam-stock-iva">IVA</th>' +
                '<th class="tam-stock-th tam-stock-price">Preço</th>' +
                '<th class="tam-stock-th tam-stock-qty">Qtd.</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (noData || tableRows) + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-stock-footer">' +
          rows.length + ' linhas · ' +
          rows.filter(function(rw){ return rw.city==='A4'; }).reduce(function(s,rw){ return s+rw.qty; },0) + ' uds Funchal · ' +
          rows.filter(function(rw){ return rw.city==='A5'; }).reduce(function(s,rw){ return s+rw.qty; },0) + ' uds Porto Santo' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    // Animate in
    requestAnimationFrame(function(){ modal.classList.add('tam-stock-visible'); });

    // Close
    function closeModal() {
      modal.classList.remove('tam-stock-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
    }
    modal.querySelector('#tam-stock-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-stock-close-btn').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    /* -- Copy column (stock) -- */
    var stockCopyMsg = modal.querySelector('#tam-stock-copy-msg');
    var stockCopyTimer = null;
    var stockColKeys = ['ref','city','iva','price','qty'];
    modal.querySelectorAll('.tam-stock-copy-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ci = parseInt(btn.getAttribute('data-scol'));
        var key = stockColKeys[ci];
        var vals = rows.map(function(rw){
          if (key==='ref')   return rw.ref;
          if (key==='city')  return rw.city;
          if (key==='iva')   return rw.iva;
          if (key==='price') return tamFmtEU(rw.price);
          return String(rw.qty);
        });
        if (!vals.length) return;
        modal.querySelectorAll('.tam-stock-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
        btn.classList.add('tam-guia-copy-active');
        var text = vals.join('\n');
        function showMsg(ok){
          if (!stockCopyMsg) return;
          stockCopyMsg.textContent = ok ? '\u2713 ' + COL_S[ci] + ' copiado!' : '\u26a0 copie manualmente';
          stockCopyMsg.style.color = ok ? '#2e7d32' : '#b05000';
          if (stockCopyTimer) clearTimeout(stockCopyTimer);
          stockCopyTimer = setTimeout(function(){
            stockCopyMsg.textContent='';
            modal.querySelectorAll('.tam-stock-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
          }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function(){ showMsg(true); }).catch(function(){ showMsg(false); });
        } else {
          try {
            var ta=document.createElement('textarea'); ta.value=text;
            ta.style.cssText='position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); showMsg(true);
          } catch(e2){ showMsg(false); }
        }
      });
    });

    // Export to CSV (Excel-compatible)
    modal.querySelector('#tam-stock-export-btn').addEventListener('click', function(){
      var lines = ['\uFEFF' + ['Referencia','Armazem','IVA','Preco','Quantidade'].join(';')];
      rows.forEach(function(row){
        lines.push([row.ref, row.city, row.iva, String(row.price).replace('.',','), row.qty].join(';'));
      });
      var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'Stock_' + (r.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT CSV — todas las facturas (botón global)
  ══════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════
     DN MAP + DELIVERY NOTES FUNCTIONS
  ══════════════════════════════════════════════════════════════ */

  function tamExtractDNListFromRows(allRows) {
    /* The invoice ZY code appears in every page header (once per page).
       DN references appear only once each, at the invoice footer.
       Strategy: the most-frequent ZY is the invoice itself — exclude it. */
    var fullText = allRows.map(function(t){ return t.join(' '); }).join(' ');

    /* ── Repair ZY codes split by PDF line-wrap ──
       pdfjs joins each visual line with a space, fragmenting codes:
         Case B/C: "ZY -85015450" or "ZY- 85015450"  → ZY-85015450
         Case A:   "ZY-8501 5399" / "ZY-850154 85"   → ZY-85015399/85
       Run B/C first (8 digits already together), then A (split digits). */
    fullText = fullText.replace(/\bZY\s+-\s*(\d{8})\b/g, 'ZY-$1');
    fullText = fullText.replace(/\bZY-(\d{1,7})\s+(\d{1,7})\b/g, function(m, p1, p2) {
      var combined = p1 + p2;
      if (combined.length === 8) return 'ZY-' + combined;
      return m;
    });

    var matches = fullText.match(/ZY-\d{8}/g);
    if (!matches) return [];
    var freq = {};
    matches.forEach(function(zy){ freq[zy] = (freq[zy] || 0) + 1; });
    var invoiceZY = matches[0], maxFreq = 0;
    Object.keys(freq).forEach(function(zy) {
      if (freq[zy] > maxFreq) { maxFreq = freq[zy]; invoiceZY = zy; }
    });
    var seen = {}, codes = [];
    matches.forEach(function(zy) {
      if (zy !== invoiceZY && !seen[zy]) { seen[zy] = true; codes.push(zy); }
    });
    return codes;
  }

  function tamRebuildDNMap() {
    tamDNtoInvIdx = {};
    tamInvoices.forEach(function(inv, idx){
      (inv.dnList || []).forEach(function(zy){ tamDNtoInvIdx[zy] = idx; });
    });
  }

  function tamShowDNBarButtons() {
    var loadBtn = document.getElementById('tam-dn-load-bar-btn');
    var camBtn  = document.getElementById('tam-dn-cam-bar-btn');
    if (loadBtn) loadBtn.style.display = 'inline-flex';
    if (camBtn)  camBtn.style.display  = 'inline-flex';
    tamUpdateDNCount();
  }

  function tamUpdateDNCount() {
    var el = document.getElementById('tam-dn-count');
    if (!el) return;
    var n = Object.keys(tamDeliveryNotes).length;
    el.textContent = n > 0 ? n + ' DN' : '';
    el.style.display = n > 0 ? 'inline-block' : 'none';
    el.style.color = '#ffffff';
    el.style.fontWeight = '700';
  }

  async function tamHandleDeliveryNoteFiles(files) {
    var count = 0;
    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      try {
        var buf = await file.arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        /* Collect raw text items with page-adjusted Y (top-to-bottom) */
        var allPageItems = [];
        var PAGE_OFFSET = 1200; /* large enough to separate A4 pages (841pt) */
        for (var p = 1; p <= pdf.numPages; p++) {
          var page   = await pdf.getPage(p);
          var vp     = page.getViewport({ scale: 1 });
          var pageH  = vp.height;
          var offset = (p - 1) * PAGE_OFFSET;
          var tc     = await page.getTextContent();
          tc.items.forEach(function(item) {
            var s = (item.str || '').trim();
            if (!s) return;
            allPageItems.push({
              str: s,
              x: item.transform[4],
              y: pageH - item.transform[5] + offset   /* top-to-bottom, page-adjusted */
            });
          });
        }
        var dn = tamParseDNFromItems(allPageItems, file.name);
        if (dn) { tamDeliveryNotes[dn.zyCode] = dn; count++; }
      } catch(e) { console.warn('DN parse error', file.name, e); }
    }
    tamUpdateDNCount();
    tamScheduleSave();
    console.log('DN loaded:', count, Object.keys(tamDeliveryNotes));
  }


  /* ── Legacy text-based parser — used by camera OCR path (ZY code only) ── */
  function tamParseDNText(text, fileName) {
    var zyMatch = text.match(/ZY-\d{8}/);
    if (!zyMatch) return null;
    return { zyCode: zyMatch[0], refs: [], fileName: fileName, gesamtPcs: null };
  }

  /* ── Item-based DN parser v4 ─────────────────────────────────────────────
     Uses raw pdfjs text items with X/Y coordinates — no tamGroupByRows.
     Column layout verified on real TAM Lieferschein PDFs:
       REF  col : x ≈  71  (left column)
       EAN  col : x ≈ 266  (13-digit barcode)
       SIZE col : x ≈ 341  (XS/S/M/L/XL/XXL)
       QTY  col : x ≈ 392  (piece count per size, 1-99)
     Strategy:
       QTY items  = x ∈ [370,420]  AND  1-2 digit int 1-99  AND  EAN within 2pt in Y
       REF items  = x < 150        AND  tamIsRef            AND  not BAD/ADDR ref
       For each QTY → nearest preceding REF (largest y < qty.y) → accumulate.
  ─────────────────────────────────────────────────────────────────────────── */
  function tamParseDNFromItems(allPageItems, fileName) {
    var EAN_RE   = /^\d{13}$/;
    var BAD_REF  = /^(ZY-|B2B-|DE-|HRB|UST|IBAN|BIC|GLS|DHL|DPD)/i;
    /* Address-style codes: letter(s)+digits+dash+digits only, e.g. B15-17, A4-12 */
    var ADDR_REF = /^[A-Za-z]{1,2}\d+-\d+$/;
    var QTY_X_MIN = 370, QTY_X_MAX = 420, REF_X_MAX = 150, EAN_Y_TOL = 2;

    /* 1. ZY code */
    var zyCode = null;
    for (var i = 0; i < allPageItems.length; i++) {
      var m = allPageItems[i].str.match(/ZY-\d{8}/);
      if (m) { zyCode = m[0]; break; }
    }
    if (!zyCode) return null;

    /* 2. Gesamtstückzahl */
    var gesamtPcs = null;
    for (var i = 0; i < allPageItems.length; i++) {
      if (/Gesamtst/i.test(allPageItems[i].str)) {
        for (var j = i + 1; j < Math.min(i + 6, allPageItems.length); j++) {
          var n = parseInt(allPageItems[j].str);
          if (!isNaN(n) && n >= 10 && n <= 9999) { gesamtPcs = n; break; }
        }
        break;
      }
    }

    /* 3. Build EAN Y-position lookup for fast proximity check */
    var eanYList = allPageItems
      .filter(function(it){ return EAN_RE.test(it.str); })
      .map(function(it){ return it.y; });

    function hasNearbyEAN(y) {
      for (var k = 0; k < eanYList.length; k++) {
        if (Math.abs(eanYList[k] - y) <= EAN_Y_TOL) return true;
      }
      return false;
    }

    /* 4. Collect REF items (left column) */
    var refItems = allPageItems.filter(function(it) {
      return it.x <= REF_X_MAX
          && tamIsRef(it.str)
          && !BAD_REF.test(it.str)
          && !ADDR_REF.test(it.str);
    });

    /* 5. For each QTY item, find nearest preceding REF and accumulate */
    var refAccum = {}, refOrder = [];

    allPageItems.forEach(function(it) {
      if (it.x < QTY_X_MIN || it.x > QTY_X_MAX) return;
      if (!/^\d{1,2}$/.test(it.str)) return;
      var qty = parseInt(it.str);
      if (qty < 1 || qty > 99) return;
      if (!hasNearbyEAN(it.y)) return;

      /* Nearest REF = largest y that is still < (it.y - 2) */
      var nearRef = null, nearRefY = -Infinity;
      refItems.forEach(function(r) {
        if (r.y < it.y - 2 && r.y > nearRefY) {
          nearRefY = r.y;
          nearRef  = r.str;
        }
      });
      if (!nearRef) return;

      if (!refAccum.hasOwnProperty(nearRef)) {
        refAccum[nearRef] = 0;
        refOrder.push(nearRef);
      }
      refAccum[nearRef] += qty;
    });

    var refs = refOrder
      .map(function(ref){ return { ref:ref, qty:refAccum[ref] }; })
      .filter(function(r){ return r.qty > 0; });

    if (!refs.length) return null;

    var computedSum = refs.reduce(function(s,r){ return s + r.qty; }, 0);
    if (gesamtPcs !== null && computedSum !== gesamtPcs) {
      console.warn('TAM DN v4:', computedSum, 'computed vs', gesamtPcs, 'declared for', zyCode);
    }
    return { zyCode:zyCode, refs:refs, fileName:fileName, gesamtPcs:gesamtPcs };
  }

  async function tamHandleDNCameraPhoto(imageFile) {
    var lbl = document.getElementById('tam-dn-cam-bar-btn');
    if (lbl) { lbl.classList.add('tam-dn-loading'); lbl.childNodes[0].textContent = '\u23f3 Motor D...'; }
    try {
      /* Convert image to base64 */
      var base64 = await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload  = function() { resolve(reader.result.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      /* ── Call Motor D photo mode ── */
      tamMotorDSpinner('a ler foto...');
      var mdResult = await tamMotorDCall({
        mode:        'photo',
        imageBase64: base64,
        mediaType:   imageFile.type || 'image/jpeg',
        refs:        []
      });
      tamMotorDSpinner(null);

      /* Extract ZY code */
      var zyCode = mdResult && mdResult.zyCode ? mdResult.zyCode : null;

      /* ── Fallback to Tesseract if Motor D didn't find ZY ── */
      if (!zyCode) {
        if (lbl) lbl.childNodes[0].textContent = '\u23f3 OCR...';
        try {
          if (typeof Tesseract === 'undefined') {
            await new Promise(function(res, rej) {
              var s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
              s.onload = res; s.onerror = function() { rej(new Error('Tesseract n/d')); };
              document.head.appendChild(s);
            });
          }
          var bmp = await createImageBitmap(imageFile);
          var cv  = document.createElement('canvas');
          var sc  = Math.min(1, 1200 / bmp.width);
          cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
          var ctx = cv.getContext('2d');
          ctx.filter = 'grayscale(100%) contrast(180%)';
          ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
          var tr = await Tesseract.recognize(cv, 'eng', {});
          var tt = tr.data.text || '';
          var tm = tt.match(/ZY-\d{8}/);
          if (tm) zyCode = tm[0];
          if (!zyCode) {
            var tm2 = tt.replace(/[OI]/g, function(c) { return c==='O'?'0':'1'; }).match(/ZY-\d{8}/);
            if (tm2) zyCode = tm2[0];
          }
        } catch(eTess) { console.warn('Tesseract fallback', eTess); }
      }

      /* ── RULE 1: PDF must be loaded first ── */
      if (!zyCode) {
        tamShowDNError('C\u00f3digo ZY n\u00e3o encontrado. Tente com melhor ilumina\u00e7\u00e3o.');
        return;
      }
      var dn = tamDeliveryNotes[zyCode];
      if (!dn) {
        tamShowDNError(
          'Carrega primeiro o PDF da ' + zyCode + ' antes de fotografar.'
        );
        return;
      }

      /* ── RULE 2/3: Distribution present → pre-fill. Absent → empty modal ── */
      var distribution = mdResult && mdResult.distribution && mdResult.distribution.length
        ? mdResult.distribution : null;
      var confidence   = mdResult && mdResult.confidence ? mdResult.confidence : null;

      tamShowDNDistribModal(dn, distribution, confidence);

    } catch(e) {
      console.error('DN camera error', e);
      tamShowDNError('Erro ao processar imagem: ' + e.message);
    } finally {
      tamMotorDSpinner(null);
      if (lbl) {
        lbl.classList.remove('tam-dn-loading');
        lbl.childNodes[0].textContent = '\ud83d\udcf7 fotografar caixa';
      }
      tamUpdateDNCount();
    }
  }

    function tamShowDNError(msg) {
    var old = document.getElementById('tam-dn-toast');
    if (old) old.parentNode.removeChild(old);
    var t = document.createElement('div');
    t.id = 'tam-dn-toast';
    t.textContent = '\u26a0\ufe0f ' + msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('tam-dn-toast-show'); }, 10);
    setTimeout(function(){ t.classList.remove('tam-dn-toast-show'); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 400); }, 3500);
  }

  function tamShowDNDistribModal(dn, motorDDistrib, motorDConf) {
    var old = document.getElementById('tam-dn-modal');
    if (old) old.parentNode.removeChild(old);
    var modal = document.createElement('div');
    modal.id = 'tam-dn-modal';
    var invIdx = tamDNtoInvIdx.hasOwnProperty(dn.zyCode) ? tamDNtoInvIdx[dn.zyCode] : -1;
    var invLabel = (invIdx >= 0 && tamInvoices[invIdx]) ? ' \u2192 ' + tamInvoices[invIdx].invoiceNo : '';

    // ── Computed total vs declared (Gesamtstückzahl) ─────────────
    var computedTotal = dn.refs.reduce(function(s, r){ return s + r.qty; }, 0);
    var gesamtPcs     = dn.gesamtPcs || null;
    var totalMatch    = gesamtPcs !== null && gesamtPcs === computedTotal;
    var totalMismatch = gesamtPcs !== null && gesamtPcs !== computedTotal;
    var totalLabel    = '';
    if (gesamtPcs !== null) {
      if (totalMatch) {
        totalLabel = ' <span class="tam-dn-total-ok">\u2713 ' + computedTotal + ' pcs</span>';
      } else {
        totalLabel = ' <span class="tam-dn-total-err">\u26a0 ' + computedTotal + ' / declarado: ' + gesamtPcs + '</span>';
      }
    } else {
      totalLabel = ' <span class="tam-dn-total-neutral">' + computedTotal + ' pcs</span>';
    }

    var rowsHtml = dn.refs.map(function(r) {
      var safeRef = r.ref.replace(/[^a-z0-9]/gi,'_');
      return '<tr class="tam-dn-row">' +
        '<td class="tam-dn-ref">' + tamEsc(r.ref) + '</td>' +
        '<td class="tam-dn-total">' + r.qty + '</td>' +
        '<td class="tam-dn-cell"><input type="text" inputmode="numeric" class="tam-dn-inp tam-dn-inp-f" id="tam-dn-f-'+safeRef+'" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'" placeholder="0" autocomplete="off"></td>' +
        '<td class="tam-dn-cell"><input type="text" inputmode="numeric" class="tam-dn-inp tam-dn-inp-p" id="tam-dn-p-'+safeRef+'" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'" placeholder="0" autocomplete="off"></td>' +
        '<td class="tam-dn-btns">' +
          '<button class="tam-dn-qbtn tam-dn-f100" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'">F 100%</button>' +
          '<button class="tam-dn-qbtn tam-dn-p100" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'">PS 100%</button>' +
          '<button class="tam-dn-qbtn tam-dn-split" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'">&frac12;</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    modal.innerHTML =
      '<div id="tam-dn-backdrop"></div>' +
      '<div id="tam-dn-panel">' +
        '<div id="tam-dn-header">' +
          '<div id="tam-dn-title">' +
            '<span id="tam-dn-zy">' + tamEsc(dn.zyCode) + invLabel + totalLabel + '</span>' +
            '<span id="tam-dn-sub">Delivery Note &middot; distribuir por loja</span>' +
          '</div>' +
          '<button id="tam-dn-close-btn" class="tam-dn-close">&times;</button>' +
        '</div>' +
        '<div id="tam-dn-scroll">' +
          '<table id="tam-dn-table">' +
            '<thead><tr>' +
              '<th class="tam-dn-th">Refer\u00eancia</th>' +
              '<th class="tam-dn-th">Total</th>' +
              '<th class="tam-dn-th tam-dn-th-f">Funchal</th>' +
              '<th class="tam-dn-th tam-dn-th-p">Porto Santo</th>' +
              '<th class="tam-dn-th"></th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-dn-footer">' +
          '<button id="tam-dn-confirm-btn" class="tam-dn-action-btn">\u2713 Confirmar distribui\u00e7\u00e3o</button>' +
          '<button id="tam-dn-cancel-btn" class="tam-dn-cancel-btn">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-dn-visible'); });

    /* ── Motor D pre-fill ── */
    if (motorDDistrib && motorDDistrib.length) {
      /* Confidence banner */
      var subEl = modal.querySelector('#tam-dn-sub');
      if (subEl && motorDConf) {
        var confLabel = motorDConf === 'high'   ? '<span class="tam-dn-md-high">🤖 Motor D · alta confiança</span>'
                      : motorDConf === 'medium' ? '<span class="tam-dn-md-med">🤖 Motor D · verifica os valores</span>'
                      :                           '<span class="tam-dn-md-low">🤖 Motor D · verifica com atenção</span>';
        subEl.innerHTML = 'Delivery Note &middot; distribuir por loja &middot; ' + confLabel;
      }
      /* Fill inputs — null/undefined → empty + red border */
      motorDDistrib.forEach(function(d) {
        if (!d || !d.ref) return;
        var safe = d.ref.replace(/[^a-z0-9]/gi, '_');
        var fi = modal.querySelector('#tam-dn-f-' + safe);
        var pi = modal.querySelector('#tam-dn-p-' + safe);
        var row = fi ? fi.closest('tr') : null;
        if (fi) {
          if (d.f != null) {
            fi.value = d.f;
            fi.classList.add('tam-dn-inp-prefilled');
          } else {
            fi.value = '';
            fi.classList.add('tam-dn-inp-unclear');
          }
        }
        if (pi) {
          if (d.p != null) {
            pi.value = d.p;
            pi.classList.add('tam-dn-inp-prefilled');
          } else {
            pi.value = '';
            pi.classList.add('tam-dn-inp-unclear');
          }
        }
        if (row) row.classList.add('tam-dn-row-prefilled');
      });
    }

    function closeModal() {
      modal.classList.remove('tam-dn-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
    }
    modal.querySelector('#tam-dn-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-dn-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#tam-dn-cancel-btn').addEventListener('click', closeModal);

    modal.querySelectorAll('.tam-dn-f100').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref=btn.getAttribute('data-ref'), qty=parseInt(btn.getAttribute('data-qty'));
        var s=ref.replace(/[^a-z0-9]/gi,'_');
        var fi=modal.querySelector('#tam-dn-f-'+s), pi=modal.querySelector('#tam-dn-p-'+s);
        if(fi) fi.value=qty; if(pi) pi.value=0; tamDNHighlightRow(btn);
      });
    });
    modal.querySelectorAll('.tam-dn-p100').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref=btn.getAttribute('data-ref'), qty=parseInt(btn.getAttribute('data-qty'));
        var s=ref.replace(/[^a-z0-9]/gi,'_');
        var fi=modal.querySelector('#tam-dn-f-'+s), pi=modal.querySelector('#tam-dn-p-'+s);
        if(fi) fi.value=0; if(pi) pi.value=qty; tamDNHighlightRow(btn);
      });
    });

    /* ── Split ½ with odd-piece dialog ──────────────────────── */
    modal.querySelectorAll('.tam-dn-split').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref = btn.getAttribute('data-ref');
        var qty = parseInt(btn.getAttribute('data-qty'));
        var half = Math.floor(qty / 2);
        var isOdd = qty % 2 !== 0;
        var s = ref.replace(/[^a-z0-9]/gi,'_');
        var fi = modal.querySelector('#tam-dn-f-' + s);
        var pi = modal.querySelector('#tam-dn-p-' + s);

        if (!isOdd) {
          if (fi) fi.value = half;
          if (pi) pi.value = half;
          tamDNHighlightRow(btn);
          return;
        }

        // Odd qty — show inline dialog inside the modal
        var oldDlg = modal.querySelector('.tam-dn-odd-dlg');
        if (oldDlg) oldDlg.parentNode.removeChild(oldDlg);

        var dlg = document.createElement('div');
        dlg.className = 'tam-dn-odd-dlg';
        dlg.innerHTML =
          '<div class="tam-dn-odd-body">' +
            '<strong>' + tamEsc(ref) + '</strong> &mdash; ' + qty + ' pcs &middot; ' +
            'Sobra <strong>1 pe\u00e7a</strong>. Para onde vai?' +
          '</div>' +
          '<div class="tam-dn-odd-btns">' +
            '<button class="tam-dn-odd-btn tam-dn-odd-f">\u2192 Funchal (' + (half+1) + 'F / ' + half + 'PS)</button>' +
            '<button class="tam-dn-odd-btn tam-dn-odd-p">\u2192 Porto Santo (' + half + 'F / ' + (half+1) + 'PS)</button>' +
            '<button class="tam-dn-odd-btn tam-dn-odd-skip">deixar pendente</button>' +
          '</div>';

        function applyOdd(fVal, pVal) {
          if (fi) fi.value = fVal;
          if (pi) pi.value = pVal;
          tamDNHighlightRow(btn);
          dlg.parentNode.removeChild(dlg);
        }

        dlg.querySelector('.tam-dn-odd-f').addEventListener('click',    function(){ applyOdd(half+1, half); });
        dlg.querySelector('.tam-dn-odd-p').addEventListener('click',    function(){ applyOdd(half, half+1); });
        dlg.querySelector('.tam-dn-odd-skip').addEventListener('click', function(){ applyOdd(half, half); });

        // Insert dialog just below the current row
        var row = btn.closest('tr');
        var tbody = row ? row.parentNode : null;
        if (tbody) {
          var insertAfter = row.nextSibling;
          var dlgTr = document.createElement('tr');
          var dlgTd = document.createElement('td');
          dlgTd.colSpan = 5;
          dlgTd.className = 'tam-dn-odd-td';
          dlgTd.appendChild(dlg);
          dlgTr.className = 'tam-dn-odd-row';
          dlgTr.appendChild(dlgTd);
          tbody.insertBefore(dlgTr, insertAfter);
          // Auto-remove when clicking elsewhere
          setTimeout(function(){
            function outsideClick(e) {
              if (!dlg.contains(e.target) && e.target !== btn) {
                if (dlgTr.parentNode) dlgTr.parentNode.removeChild(dlgTr);
                document.removeEventListener('click', outsideClick);
              }
            }
            document.addEventListener('click', outsideClick);
          }, 50);
        }
      });
    });

    modal.querySelector('#tam-dn-confirm-btn').addEventListener('click', function(){
      if (!tamSession) { tamShowDNError('Sem sess\u00e3o activa.'); return; }
      var targetBox=null, targetBi=-1;
      var knownInvIdx = tamDNtoInvIdx.hasOwnProperty(dn.zyCode) ? tamDNtoInvIdx[dn.zyCode] : -1;
      if (knownInvIdx >= 0) {
        for (var bi=0; bi<tamSession.boxes.length; bi++) {
          var b=tamSession.boxes[bi];
          if (b.invIdx===knownInvIdx && !b.locked) { targetBox=b; targetBi=bi; break; }
        }
        if (!targetBox) {
          var invNo=(tamInvoices[knownInvIdx]&&tamInvoices[knownInvIdx].invoiceNo)||'';
          tamShowDNError('Todas as caixas da fatura ' + invNo + ' j\u00e1 est\u00e3o fechadas.');
          return;
        }
      } else {
        for (var bi=0; bi<tamSession.boxes.length; bi++) {
          var b=tamSession.boxes[bi];
          if (!b.locked) { targetBox=b; targetBi=bi; break; }
        }
        if (!targetBox) { tamShowDNError('N\u00e3o h\u00e1 caixas dispon\u00edveis.'); return; }
      }
      var totalQty = dn.refs.reduce(function(s,r){ return s+r.qty; }, 0);
      if (!targetBox.total) targetBox.total = totalQty;
      tamPushUndo();
      dn.refs.forEach(function(r){
        var safe=r.ref.replace(/[^a-z0-9]/gi,'_');
        var fi=modal.querySelector('#tam-dn-f-'+safe), pi=modal.querySelector('#tam-dn-p-'+safe);
        var fVal=fi?(parseInt(fi.value)||0):0, pVal=pi?(parseInt(pi.value)||0):0;
        if (fVal>0||pVal>0) {
          if (!targetBox.refs[r.ref]) targetBox.refs[r.ref]={f:0,p:0};
          targetBox.refs[r.ref].f=fVal; targetBox.refs[r.ref].p=pVal;
        }
      });
      /* Mark DN as user-confirmed (distribution is final) */
      if (tamDeliveryNotes[dn.zyCode]) tamDeliveryNotes[dn.zyCode].distribConfirmed = true;
      tamRenderAll();
      tamSaveSession(true);  // immediate silent save
      tamCheckBoxLock(targetBi);
      closeModal();
    });
  }

  function tamDNHighlightRow(btn) {
    var row = btn.closest('tr');
    if (!row) return;
    row.classList.add('tam-dn-row-filled');
    setTimeout(function(){ row.classList.remove('tam-dn-row-filled'); }, 600);
  }

  /* ══════════════════════════════════════════════════════════════
     DN CROSS-VALIDATION
     Compares parsed DN quantities (ref by ref) against invoice.
     Escalation: parser error → user correction → invoice error.
  ══════════════════════════════════════════════════════════════ */

  /* Build map: ref → total pieces across all DNs belonging to an invoice */
  function tamDNTotalsForInv(invIdx) {
    var inv = tamInvoices[invIdx];
    if (!inv) return {};
    var totals = {};
    (inv.dnList || []).forEach(function(zyCode) {
      var dn = tamDeliveryNotes[zyCode];
      if (!dn) return;
      (dn.refs || []).forEach(function(r) {
        totals[r.ref] = (totals[r.ref] || 0) + r.qty;
      });
    });
    return totals;
  }

  function tamRenderDNVerification() {
    var area = document.getElementById('tam-dn-verify-area');
    if (!area) return;

    var blocks = [];

    tamInvoices.forEach(function(inv, invIdx) {
      var dnList = inv.dnList || [];
      if (!dnList.length) return; // invoice has no associated DNs listed

      var totalDNs    = dnList.length;
      var expectedDNs = inv.shipPkgs || totalDNs;   // authoritative: packages declared in invoice
      var parsedShort = totalDNs < expectedDNs;      // fewer codes found than declared
      var loadedDNs   = dnList.filter(function(zy){ return tamDeliveryNotes[zy]; });
      var missingDNs  = dnList.filter(function(zy){ return !tamDeliveryNotes[zy]; });
      var allLoaded   = missingDNs.length === 0 && !parsedShort;

      /* ── Progress indicator ── */
      var progressHtml;

      /* ── Warning: invoice declares more packages than DN codes parsed ── */
      var parsedShortHtml = parsedShort
        ? '<div class="tam-dnv-progress tam-dnv-partial" style="background:#fff3cd;border-color:#e0a800;">'
            + '<span class="tam-dnv-prog-icon">⚠️</span>'
            + '<span class="tam-dnv-prog-text">'
            + tamEsc(inv.invoiceNo) + ' &mdash; a fatura declara <strong>' + expectedDNs + ' pacotes</strong>'
            + ' mas apenas <strong>' + totalDNs + ' códigos DN</strong> foram encontrados no PDF.'
            + ' Verifica se o ficheiro está completo.'
            + '</span></div>'
        : '';

      if (!allLoaded) {
        progressHtml = parsedShortHtml +
          '<div class="tam-dnv-progress tam-dnv-partial">' +
            '<span class="tam-dnv-prog-icon">📦</span>' +
            '<span class="tam-dnv-prog-text">' +
              tamEsc(inv.invoiceNo) + ' &mdash; ' +
              '<strong>' + loadedDNs.length + ' / ' + expectedDNs + '</strong> delivery notes carregadas' +
              (missingDNs.length ? ' &middot; falta: <span class="tam-dnv-missing">' + missingDNs.map(tamEsc).join(', ') + '</span>' : '') +
            '</span>' +
          '</div>';
      } else {
        /* All loaded — compare ref by ref */
        var dnTotals   = tamDNTotalsForInv(invIdx);
        var invTotals  = {};
        inv.grouped.forEach(function(g){ invTotals[g.ref] = g.pieces; });

        /* Union of all refs */
        var allRefs = Object.keys(invTotals);
        Object.keys(dnTotals).forEach(function(r){ if (allRefs.indexOf(r) < 0) allRefs.push(r); });

        var diffs = [];
        allRefs.forEach(function(ref) {
          var inv_qty = invTotals[ref] || 0;
          var dn_qty  = dnTotals[ref]  || 0;
          var diff    = dn_qty - inv_qty;
          if (diff !== 0) {
            /* Which DNs contain this ref? */
            var sourceDNs = dnList.filter(function(zy){
              var dn = tamDeliveryNotes[zy];
              return dn && dn.refs.some(function(r){ return r.ref === ref; });
            });
            diffs.push({ ref:ref, inv_qty:inv_qty, dn_qty:dn_qty, diff:diff, sourceDNs:sourceDNs });
          }
        });

        if (!diffs.length) {
          /* Perfect match */
          var dnTotal = Object.values ? Object.keys(dnTotals).reduce(function(s,k){return s+dnTotals[k];},0) : 0;
          progressHtml =
            '<div class="tam-dnv-progress tam-dnv-ok">' +
              '<span class="tam-dnv-prog-icon">✓</span>' +
              '<span class="tam-dnv-prog-text">' +
                tamEsc(inv.invoiceNo) + ' &mdash; todas as ' + expectedDNs + ' DNs carregadas &middot; ' +
                '<strong>quantidades confirmadas</strong> (' + inv.totalPieces + ' pcs)' +
              '</span>' +
            '</div>';
        } else {
          /* Build diff rows with escalation UI */
          var diffRows = diffs.map(function(d) {
            var diffTxt = d.diff > 0
              ? '+' + d.diff + ' (DN tem a mais)'
              : d.diff + ' (DN tem a menos)';
            var diffCls = 'tam-dnv-diff-' + (d.diff > 0 ? 'high' : 'low');
            var escalated = tamDNVerifyState[d.sourceDNs[0]] && tamDNVerifyState[d.sourceDNs[0]].dnConfirmed;

            var actionHtml;
            if (!escalated) {
              actionHtml =
                '<div class="tam-dnv-actions">' +
                  d.sourceDNs.map(function(zy){
                    return '<button class="tam-dnv-btn tam-dnv-btn-edit" ' +
                      'data-inv="'+invIdx+'" data-ref="'+tamEsc(d.ref)+'" data-zy="'+tamEsc(zy)+'">' +
                      '✏ Editar</button>' +
                      '<button class="tam-dnv-btn tam-dnv-btn-motord" ' +
                      'data-inv="'+invIdx+'" data-ref="'+tamEsc(d.ref)+'" data-zy="'+tamEsc(zy)+'">' +
                      '🤖 Motor D</button>';
                  }).join('') +
                  '<button class="tam-dnv-btn tam-dnv-btn-confirm-dn" ' +
                    'data-inv="'+invIdx+'" data-ref="'+tamEsc(d.ref)+'" ' +
                    'data-zys="'+d.sourceDNs.map(tamEsc).join(',')+'">' +
                    'DN está correcta →</button>' +
                '</div>';
            } else {
              actionHtml =
                '<div class="tam-dnv-invoice-alert">' +
                  '🔴 Verifica a fatura <strong>' + tamEsc(inv.invoiceNo) + '</strong> na referência <strong>' + tamEsc(d.ref) + '</strong>' +
                  ' &mdash; fatura diz ' + d.inv_qty + ' pcs, DNs somam ' + d.dn_qty + ' pcs' +
                  '<button class="tam-dnv-btn tam-dnv-btn-reopen" ' +
                    'data-inv="'+invIdx+'" data-ref="'+tamEsc(d.ref)+'" ' +
                    'data-zys="'+d.sourceDNs.map(tamEsc).join(',') + '">' +
                    '↩ rever DN</button>' +
                '</div>';
            }

            return '<tr class="tam-dnv-row">' +
              '<td class="tam-dnv-ref"><strong>' + tamEsc(d.ref) + '</strong></td>' +
              '<td class="tam-dnv-num">' + d.inv_qty + '</td>' +
              '<td class="tam-dnv-num">' + d.dn_qty + '</td>' +
              '<td class="tam-dnv-num ' + diffCls + '">' + diffTxt + '</td>' +
              '<td class="tam-dnv-action-cell">' + actionHtml + '</td>' +
              '</tr>';
          }).join('');

          progressHtml =
            '<div class="tam-dnv-block">' +
              '<div class="tam-dnv-block-hdr">' +
                '⚠ ' + tamEsc(inv.invoiceNo) + ' &mdash; ' + totalDNs + ' DNs carregadas &middot; ' +
                diffs.length + ' diferença(s) detectada(s)' +
              '</div>' +
              '<div class="tam-dnv-hint">Verifica visualmente as delivery notes assinaladas. Se a DN estiver correcta, clica em "DN está correcta →" para escalar o alerta para a fatura.</div>' +
              '<div class="tam-dnv-scroll">' +
              '<table class="tam-dnv-table">' +
              '<thead><tr>' +
                '<th>Referência</th>' +
                '<th>Fatura</th>' +
                '<th>DNs somam</th>' +
                '<th>Diferença</th>' +
                '<th>Acção</th>' +
              '</tr></thead>' +
              '<tbody>' + diffRows + '</tbody>' +
              '</table></div>' +
            '</div>';
        }
      }
      blocks.push(progressHtml);
    });

    if (!blocks.length) { area.innerHTML = ''; return; }
    area.innerHTML = '<div class="tam-dnv-area">' + blocks.join('') + '</div>';

    /* ── Bind actions ── */
    area.querySelectorAll('.tam-dnv-btn-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var zy = btn.getAttribute('data-zy');
        var dn = tamDeliveryNotes[zy];
        if (dn) tamShowDNEditModal(dn, parseInt(btn.getAttribute('data-inv')));
      });
    });

    area.querySelectorAll('.tam-dnv-btn-motord').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var zy     = btn.getAttribute('data-zy');
        var invIdx = parseInt(btn.getAttribute('data-inv'));
        var dn     = tamDeliveryNotes[zy];
        if (!dn) return;
        var origText = btn.textContent;
        btn.disabled    = true;
        btn.textContent = '🤖 a analisar…';
        try {
          var dnText = 'Delivery Note ' + zy + '\n' +
            (dn.refs || []).map(function(r) { return r.ref + ': ' + r.qty + ' pcs'; }).join('\n');
          tamMotorDSpinner('Motor D a reanalisar DN…');
          var mdRes = await tamMotorDCall({ mode: 'dn', text: dnText });
          if (mdRes && mdRes.refs && mdRes.refs.length) {
            dn.refs          = mdRes.refs;
            dn.userCorrected = true;
            if (mdRes.gesamtPcs) dn.gesamtPcs = mdRes.gesamtPcs;
            if (tamDNVerifyState[zy]) tamDNVerifyState[zy].dnConfirmed = false;
            tamRenderDNVerification();
            tamScheduleSave();
          } else {
            tamShowDNError('Motor D não encontrou dados. Usa ✏ Editar para corrigir.');
          }
        } catch(e) { tamShowDNError('Motor D: ' + e.message); }
        finally {
          tamMotorDSpinner(null);
          btn.disabled    = false;
          btn.textContent = origText;
        }
      });
    });

    area.querySelectorAll('.tam-dnv-btn-confirm-dn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var zys = btn.getAttribute('data-zys').split(',');
        zys.forEach(function(zy) {
          if (!tamDNVerifyState[zy]) tamDNVerifyState[zy] = {};
          tamDNVerifyState[zy].dnConfirmed = true;
        });
        tamRenderDNVerification();
        tamScheduleSave();
      });
    });

    area.querySelectorAll('.tam-dnv-btn-reopen').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var zys = btn.getAttribute('data-zys').split(',');
        zys.forEach(function(zy) {
          if (tamDNVerifyState[zy]) tamDNVerifyState[zy].dnConfirmed = false;
        });
        tamRenderDNVerification();
        tamScheduleSave();
      });
    });
  }

  /* Opens a DN for editing its parsed quantities (NOT the F/PS distribution) */
  function tamShowDNEditModal(dn, invIdx) {
    var old = document.getElementById('tam-dn-edit-modal');
    if (old) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'tam-dn-edit-modal';
    modal.className = 'tam-dn-edit-modal';

    var inv = tamInvoices[invIdx];
    var invRefs = {};
    if (inv) inv.grouped.forEach(function(g){ invRefs[g.ref] = g.pieces; });

    /* Merge: show all refs from both DN and invoice so user can add missing ones */
    var allRefs = [];
    var seen = {};
    (dn.refs || []).forEach(function(r){ if (!seen[r.ref]) { seen[r.ref]=true; allRefs.push(r.ref); } });
    Object.keys(invRefs).forEach(function(ref){ if (!seen[ref]) { seen[ref]=true; allRefs.push(ref); } });

    var rowsHtml = allRefs.map(function(ref) {
      var dnQty  = 0;
      var dnRef = (dn.refs || []).find(function(r){ return r.ref === ref; });
      if (dnRef) dnQty = dnRef.qty;
      var invQty = invRefs[ref] || 0;
      var mismatch = invQty > 0 && dnQty !== invQty;
      return '<tr class="' + (mismatch ? 'tam-dne-row-mismatch' : '') + '">' +
        '<td class="tam-dne-ref"><strong>' + tamEsc(ref) + '</strong></td>' +
        '<td class="tam-dne-inv">' + (invQty || '—') + '</td>' +
        '<td class="tam-dne-qty">' +
          '<input type="text" inputmode="numeric" class="tam-dne-inp" ' +
            'id="tam-dne-' + ref.replace(/[^a-z0-9]/gi,'_') + '" ' +
            'data-ref="' + tamEsc(ref) + '" value="' + dnQty + '" autocomplete="off">' +
        '</td>' +
        '</tr>';
    }).join('');

    modal.innerHTML =
      '<div id="tam-dn-edit-backdrop"></div>' +
      '<div id="tam-dn-edit-panel">' +
        '<div id="tam-dne-header">' +
          '<div id="tam-dne-title">' +
            '<span id="tam-dne-zy">' + tamEsc(dn.zyCode) + '</span>' +
            '<span id="tam-dne-sub">Correção manual de quantidades · DN</span>' +
          '</div>' +
          '<button id="tam-dne-close" class="tam-dn-close">&times;</button>' +
        '</div>' +
        '<div class="tam-dne-hint">Corrige as quantidades lidas da DN. A coluna <strong>Fatura</strong> mostra o esperado.</div>' +
        '<div id="tam-dne-scroll">' +
          '<table id="tam-dne-table">' +
            '<thead><tr>' +
              '<th class="tam-dn-th">Referência</th>' +
              '<th class="tam-dn-th">Fatura</th>' +
              '<th class="tam-dn-th">Qtd. DN</th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-dne-footer">' +
          '<button id="tam-dne-save" class="tam-dn-action-btn">✓ Guardar corrección</button>' +
          '<button id="tam-dne-cancel" class="tam-dn-cancel-btn">Cancelar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-dn-visible'); });

    function closeModal() {
      modal.classList.remove('tam-dn-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
    }
    modal.querySelector('#tam-dn-edit-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-dne-close').addEventListener('click', closeModal);
    modal.querySelector('#tam-dne-cancel').addEventListener('click', closeModal);

    modal.querySelector('#tam-dne-save').addEventListener('click', function() {
      /* Rebuild dn.refs from inputs */
      var newRefs = [];
      allRefs.forEach(function(ref) {
        var inp = modal.querySelector('#tam-dne-' + ref.replace(/[^a-z0-9]/gi,'_'));
        var qty = inp ? (parseInt(inp.value) || 0) : 0;
        if (qty > 0) newRefs.push({ ref:ref, qty:qty });
      });
      /* Update DN object — mark as user-corrected, clear escalation state */
      dn.refs = newRefs;
      dn.userCorrected = true;
      if (tamDNVerifyState[dn.zyCode]) tamDNVerifyState[dn.zyCode].dnConfirmed = false;
      tamRenderDNVerification();
      tamScheduleSave();
      closeModal();
    });
  }

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

  /* ══════════════════════════════════════════════════════════════
     TRANSPORTE EXTERNO — factura de frete separada
     Activado quando shipping === 0 após o parse normal.
     Conserva os motores A/B/C e o fluxo Versandkosten existente.
  ══════════════════════════════════════════════════════════════ */

  /* Detecta se uma fatura não tem transporte incluído */
  function tamDetectMissingShipping(r) {
    return r && r.totalPieces > 0 && (!r.shipping || r.shipping === 0) && !r._externalShipping;
  }

  /* Parseia uma factura de transporte separada (tipo 2979445).
     Estratégia: procura "Total Amount" seguido de valor,
     ou o último valor do documento como fallback.
     Devolve { cost, pkgs, pricePerPkg } ou null. */
  function tamParseFreightInvoice(allRows) {
    var allText = allRows.map(function(r){ return r.join(' '); }).join('\n');

    // 1. Padrão "Total Amount X.XXX,XX" ou "Total Amount X,XX"
    var totalM = allText.match(/Total\s+Amount\s+([\d.]*\d+[,.][\d]{2})/i);
    if (totalM) {
      var cost = tamParseEU(totalM[1]);
      if (cost > 0) {
        // Tenta extrair nº de pacotes: "19 pieces" ou "19 Stück"
        var pkgM = allText.match(/(\d+)\s+(?:pieces?|Stück|pcs?|boxes?|caixas?)/i);
        var pkgs = pkgM ? parseInt(pkgM[1]) : 0;
        // Tenta preço por pacote: "17,50" junto de pkgs
        var pppM = allText.match(/(\d+)\s+(?:pieces?|Stück|pcs?)\s+[\d]+\s+([\d.]*\d+[,.][\d]{2})/i);
        var ppp  = pppM ? tamParseEU(pppM[2]) : (pkgs > 0 ? tamRound2(cost/pkgs) : 0);
        return { cost: cost, pkgs: pkgs, pricePerPkg: ppp };
      }
    }

    // 2. Fallback: "Gesamt/Total" seguido de valor
    var gesM = allText.match(/(?:Gesamt|Total)\s*[€]?\s*([\d.]*\d+[,.][\d]{2})\s*$/im);
    if (gesM) {
      var cost2 = tamParseEU(gesM[1]);
      if (cost2 > 0) return { cost: cost2, pkgs: 0, pricePerPkg: 0 };
    }

    // 3. Último valor numérico do documento como último recurso
    var allNums = [];
    allText.replace(/([\d.]*\d+,\d{2})/g, function(_, n){ allNums.push(tamParseEU(n)); });
    var lastVal = allNums.filter(function(n){ return n > 0 && n < 99999; }).pop();
    if (lastVal) return { cost: lastVal, pkgs: 0, pricePerPkg: 0 };

    return null;
  }

  /* Aplica o custo de transporte externo a uma fatura:
     recalcula shipPerPiece, unitPriceWithShip e grandTotal para cada ref */
  function tamApplyExternalShipping(invIdx, shippingCost, pkgs, fileName) {
    var r = tamInvoices[invIdx];
    if (!r) return;
    var totalPieces = r.totalPieces;
    if (!totalPieces) return;

    var shipPerPiece = shippingCost / totalPieces;
    r.grouped.forEach(function(g) {
      var base            = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.unitPriceWithShip * g.pieces);
    });

    r.shipping         = shippingCost;
    r.shipPkgs         = pkgs || r.shipPkgs || 0;
    r.shipPerPiece     = tamRound2(shipPerPiece);
    r.grandTotal       = tamRound2(r.subtotalGoods + shippingCost);
    r._externalShipping = { cost: shippingCost, pkgs: pkgs, fileName: fileName };

    // Update engine cache shipping so engine-switch preserves it
    var cache = tamEngineCache[r._fileKey];
    if (cache) {
      ['A','B','C'].forEach(function(lbl){
        if (cache[lbl]) cache[lbl].shipping = shippingCost;
      });
    }

    tamRenderAll();
    tamScheduleSave();
  }

  /* Mostra o alerta de transporte em falta dentro do banner de fatura.
     Cria um input[type=file] oculto e um botão visível. */
  function tamRenderFreightAlert(invIdx, containerEl) {
    var r = tamInvoices[invIdx];
    if (!r) return;

    // Se já foi aplicado, mostra confirmação
    if (r._externalShipping) {
      var ext = r._externalShipping;
      var alertEl = document.createElement('div');
      alertEl.className = 'tam-freight-applied';
      alertEl.innerHTML =
        '🚚 <strong>transporte externo aplicado:</strong> ' + tamFmtEU(ext.cost) + ' € ' +
        '(' + (ext.pkgs || r.shipPkgs) + ' pac.) · ' +
        tamFmtEU(r.shipPerPiece) + ' €/un' +
        (ext.fileName ? ' · <em>' + tamEsc(ext.fileName) + '</em>' : '') +
        ' <button class="tam-freight-remove-btn" data-inv="' + invIdx + '">✕ remover</button>';
      containerEl.appendChild(alertEl);

      alertEl.querySelector('.tam-freight-remove-btn').addEventListener('click', function(){
        tamRemoveExternalShipping(invIdx);
      });
      return;
    }

    // Se transporte = 0 → mostra alerta com botão
    if (!tamDetectMissingShipping(r)) return;

    var alertEl = document.createElement('div');
    alertEl.className = 'tam-freight-alert';

    var fileInputId = 'tam-freight-input-' + invIdx;
    alertEl.innerHTML =
      '<span class="tam-freight-icon">🚚</span>' +
      '<span class="tam-freight-msg">Transporte não detetado na fatura · ' +
        '<strong>' + tamFmtEU(r.subtotalGoods) + ' €</strong> (só mercadoria)</span>' +
      '<label class="tam-freight-btn" for="' + fileInputId + '">' +
        '📎 Carregar fatura de transporte' +
        '<input type="file" id="' + fileInputId + '" accept="application/pdf" style="display:none">' +
      '</label>';

    containerEl.appendChild(alertEl);

    alertEl.querySelector('#' + fileInputId).addEventListener('change', async function(e){
      var file = e.target.files[0];
      if (!file) return;
      e.target.value = '';

      var btn = alertEl.querySelector('label.tam-freight-btn');
      if (btn) btn.textContent = '⏳ a processar…';

      try {
        var buf = await file.arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        var allRows = [];
        for (var p = 1; p <= pdf.numPages; p++) {
          var page = await pdf.getPage(p);
          allRows.push.apply(allRows, tamGroupByRows((await page.getTextContent()).items));
        }
        var freight = tamParseFreightInvoice(allRows);
        if (!freight || !freight.cost) {
          alertEl.querySelector('.tam-freight-msg').innerHTML =
            '<span style="color:#c00">⚠ Não foi possível extrair o valor do transporte. Tenta outro ficheiro.</span>';
          if (btn) btn.textContent = '📎 Carregar fatura de transporte';
          return;
        }

        // Se temos pkgs na fatura de frete, verificar consistência com shipPkgs da fatura principal
        var pkgs = freight.pkgs || r.shipPkgs || 0;
        tamApplyExternalShipping(invIdx, freight.cost, pkgs, file.name);
      } catch(err) {
        console.error('TAM freight parse error', err);
        if (btn) {
          btn.innerHTML =
            '<span style="color:#c00">⚠ Erro: ' + tamEsc(err.message) + '</span>';
        }
      }
    });
  }

  /* Remove o transporte externo e repõe shipping = 0 */
  function tamRemoveExternalShipping(invIdx) {
    var r = tamInvoices[invIdx];
    if (!r) return;
    delete r._externalShipping;
    r.shipping     = 0;
    r.shipPerPiece = 0;
    r.grandTotal   = r.subtotalGoods;
    r.grouped.forEach(function(g) {
      var base            = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base);
      g.grandTotal        = tamRound2(base * g.pieces);
    });
    // Restore engine cache
    var cache = tamEngineCache[r._fileKey];
    if (cache) {
      ['A','B','C'].forEach(function(lbl){
        if (cache[lbl]) cache[lbl].shipping = 0;
      });
    }
    tamRenderAll();
    tamScheduleSave();
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
      /* ── Freight alert — transporte não incluído ── */
      '.tam-freight-alert { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px; padding:8px 12px; background:#fff8e1; border:1.5px solid #ffc107; border-radius:9px; font-size:.8rem; color:#6d4c00; }',
      '.tam-freight-icon { font-size:1.1rem; }',
      '.tam-freight-msg { flex:1; min-width:180px; }',
      '.tam-freight-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 14px; background:linear-gradient(135deg,#e65100,#ff8f00); color:#fff; border:none; border-radius:8px; font-size:.78rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; white-space:nowrap; transition:background .14s,box-shadow .14s; box-shadow:0 2px 8px rgba(230,81,0,.35); letter-spacing:.02em; }',
      '.tam-freight-btn:hover { background:linear-gradient(135deg,#bf360c,#e65100); box-shadow:0 4px 14px rgba(230,81,0,.45); }',
      '.tam-freight-applied { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px; padding:7px 12px; background:#e8f5e9; border:1.5px solid #81c784; border-radius:9px; font-size:.78rem; color:#1b5e20; }',
      '.tam-freight-remove-btn { margin-left:auto; padding:3px 9px; background:transparent; border:1.5px solid #a5d6a7; border-radius:6px; font-size:.72rem; color:#388e3c; cursor:pointer; font-family:MontserratLight,sans-serif; transition:background .12s,color .12s; }',
      '.tam-freight-remove-btn:hover { background:#c8e6c9; color:#1b5e20; }',
      '.tam-tr-ship-ext td { color:#e65100!important; font-style:italic; }',
      '#tam-upload-label.loaded, #upload-label.loaded { min-height:0!important; padding:8px 16px!important; }',
      '#tam-upload-label.loaded .upload-icon, #upload-label.loaded .upload-icon { display:none!important; }',

      /* ── Session choice dialog ── */
      '#tam-session-dialog { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:800; display:flex; align-items:center; justify-content:center; }',
      '#tam-session-dialog-box { background:#fff; border-radius:16px; padding:28px 28px 22px; width:420px; max-width:92vw; font-family:MontserratLight,sans-serif; box-shadow:0 20px 60px rgba(0,0,0,.15); }',
      '.tam-dialog-title { font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; margin-bottom:12px; }',
      '.tam-dialog-body { font-size:.9rem; font-weight:600; color:#333; line-height:1.6; margin-bottom:22px; }',
      '.tam-dialog-btns { display:flex; flex-direction:column; gap:8px; }',
      '.tam-dialog-btn { padding:13px 18px; font-size:.88rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:12px; border:1.5px solid #e0e0e0; background:#fafafa; text-align:left; transition:background .15s,border-color .15s,box-shadow .15s; color:#222; }',
      '.tam-dialog-btn:hover { background:#f0f0f0; border-color:#aaa; box-shadow:0 3px 10px rgba(0,0,0,.08); }',
      '.tam-dialog-btn-new { border-color:#1a237e; background:linear-gradient(135deg,#1a237e,#283593); color:#fff; }',
      '.tam-dialog-btn-new:hover { background:linear-gradient(135deg,#0d1642,#1a237e); border-color:#0d1642; box-shadow:0 4px 14px rgba(26,35,126,.35); }',
      /* ── Session bar ── */
      '#tam-session-bar { display:flex!important; align-items:center; justify-content:center; gap:8px; width:100%; max-width:960px; padding:8px 14px; margin-bottom:12px; border:1px solid #2a2a3e!important; border-radius:10px; background:#1a1a2e!important; flex-wrap:wrap; box-sizing:border-box; }',
      '#tam-session-name { font-size:.82rem; font-weight:bold; flex:1; min-width:120px; max-width:240px; border:none; background:transparent!important; outline:none; color:rgba(255,255,255,.8)!important; font-family:MontserratLight,sans-serif; text-align:center; }',
      '#tam-session-name:focus { color:#fff!important; box-shadow:0 0 0 2px rgba(255,255,255,.25); border-radius:6px; }',
      '#tam-session-name::placeholder { color:rgba(255,255,255,.3)!important; }',
      '#tam-session-status { font-size:.68rem; font-weight:bold; color:rgba(255,255,255,.45)!important; white-space:nowrap; }',
      '#tam-status-msg { font-weight:bold!important; }',
      '#tam-dn-count { color:#ffffff!important; font-weight:700!important; }',
      '#tam-session-status.saved { color:#69f0ae!important; }',
      /* Save button hidden until session active */
      '#tam-save-btn { display:none; padding:6px 14px; font-size:.72rem; font-weight:700; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1.5px solid rgba(105,240,174,.7); border-radius:8px; background:rgba(105,240,174,.12)!important; color:#69f0ae!important; transition:background .15s,color .15s,border-color .15s,box-shadow .15s; white-space:nowrap; letter-spacing:.03em; }',
      '#tam-save-btn:hover { background:rgba(105,240,174,.25)!important; border-color:#69f0ae; box-shadow:0 0 10px rgba(105,240,174,.3); color:#69f0ae!important; }',
      '#tam-save-btn.visible { display:inline-block!important; }',
      '.tam-session-btn { padding:6px 14px; font-size:.75rem; font-weight:700; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1.5px solid rgba(255,255,255,.22); border-radius:8px; background:rgba(255,255,255,.08)!important; color:rgba(255,255,255,.85)!important; transition:background .15s,color .15s,border-color .15s,box-shadow .15s; white-space:nowrap; letter-spacing:.02em; }',
      '.tam-session-btn:hover { background:rgba(255,255,255,.18)!important; border-color:rgba(255,255,255,.5); color:#fff!important; box-shadow:0 2px 8px rgba(0,0,0,.2); }',
      '@media(max-width:600px){#tam-session-name{max-width:100%;text-align:left;}}',
      /* Dark mode */

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
      '.tam-dd-load-btn { padding:5px 13px; font-size:.72rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #1a237e; border-radius:7px; background:#1a237e; color:#ffffff!important; text-transform:lowercase; transition:background .15s,color .15s,box-shadow .15s; white-space:nowrap; flex-shrink:0; letter-spacing:.02em; }',
      '.tam-dd-load-btn:hover { background:#0d1642; box-shadow:0 2px 8px rgba(26,35,126,.4); }',
      '.tam-dd-del-btn { background:none; border:none; cursor:pointer; font-size:.88rem; color:#ccc; padding:2px 6px; border-radius:6px; flex-shrink:0; transition:color .15s,background .15s; }',
      '.tam-dd-del-btn:hover { color:#c00; background:rgba(192,0,0,.06); }',
      '.tam-sessions-empty { color:#aaa; text-align:center; padding:28px 0; font-size:.84rem; font-weight:bold; }',

      /* ── Dark mode dropdown ── */

      /* ── Tabla de factura con columnas F/P ── */
      '#tam-results-wrap { width:100%; max-width:960px; overflow-x:auto; }',
      '.tam-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:15px; overflow:visible; font-family:MontserratLight,sans-serif; }',
      '.tam-th { background:#e0e0e0; padding:5px 12px; text-align:center; font-size:.73rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; border:1px solid #e6e6e6; white-space:nowrap; line-height:1.2; }',
      '.tam-th-funchal { background:#1a237e!important; color:#ffffff!important; letter-spacing:.04em; font-weight:800!important; }',
      '.tam-th-porto   { background:#880e4f!important; color:#ffffff!important; letter-spacing:.04em; font-weight:800!important; }',
      '.tam-td { padding:3px 12px; border:1px solid #efefef; font-size:.86rem; font-weight:bold; vertical-align:middle; text-align:center; line-height:1.2; white-space:nowrap; }',
      '.tam-td-num { font-variant-numeric:tabular-nums; }',
      '.tam-cell-funchal { background:#e8eaf6; color:#1a237e; font-weight:bold; }',
      '.tam-cell-porto   { background:#fce4ec; color:#880e4f; font-weight:bold; }',
      '.tam-table tbody tr:hover td { background:#f5f5f5; }',
      '.tam-table tbody tr:hover .tam-cell-funchal { background:#ddf0ff; }',
      '.tam-table tbody tr:hover .tam-cell-porto   { background:#ffe0ef; }',
      /* Ref completada — fila suave, vai para o final */
      '.tam-ref-complete td { background-color:#e8e8e8!important; background:#e8e8e8!important; color:#999!important; }',
      '.tam-ref-complete td strong { color:#aaa!important; }',
      '.tam-ref-complete .tam-rec-ref-col { background-color:#e0e0e0!important; background:#e0e0e0!important; color:#aaa!important; }',
      '.tam-ref-complete .tam-rec-total-col { background-color:#e4e4e4!important; background:#e4e4e4!important; }',
      '.tam-ref-complete .tam-rec-cell-f { background-color:#ddeedd!important; background:#ddeedd!important; }',
      '.tam-ref-complete .tam-rec-cell-p { background-color:#eedded!important; background:#eedded!important; }',
      '.tam-ref-complete .tam-rec-input { color:#bbb!important; border-color:#ddd!important; }',
      /* Completed box column — slightly muted */
      '.tam-box-sub-complete { background:#f0f0f0!important; }',
      '.tam-box-cell-complete.tam-rec-cell-f { background-color:#eef4ee!important; background:#eef4ee!important; }',
      '.tam-box-cell-complete.tam-rec-cell-p { background-color:#f4eef4!important; background:#f4eef4!important; }',
      /* Dark mode completed rows */
      '.tam-table tfoot td { background:#f2f2f2; font-weight:bold; border-top:2px solid #ccc; padding:4px 12px; text-align:center; line-height:1.2; }',
      '.tam-table tfoot tr.tam-tr-ship td { background:#fafafa; font-weight:600; font-size:.82rem; color:#666; border-top:1px solid #e8e8e8; padding:3px 12px; }',
      '.tam-table tfoot tr.tam-tr-grand td { background:#e4e4e4; font-size:.94rem; border-top:2px solid #bbb; }',
      '.tam-row-conflict td { background:#fff8e1!important; }',
      '.tam-badge { display:inline-block; margin-left:5px; font-size:.6rem; padding:1px 5px; border-radius:3px; vertical-align:middle; font-weight:bold; color:#fff; }',
      '.tam-badge-conflict { background:#e67e00; }',
      '.tam-conflict-ref { font-weight:bold; color:#c00; }',

      /* ── Multi-factura: bloques ── */
            /* ── Collapse toggle button ── */
      '.tam-inv-toggle-btn { background:none; border:none; cursor:pointer!important; font-size:.8rem; color:#aaa; padding:0 6px 0 0; line-height:1; transition:color .15s; flex-shrink:0; user-select:none; }',
      '.tam-inv-toggle-btn:hover { color:#000; }',

      /* ── Invoice block collapsed state ── */
      '.tam-inv-collapsed .tam-inv-banner { display:none!important; }',
      '.tam-inv-collapsed .tam-inv-table-wrap thead { display:none!important; }',
      '.tam-inv-collapsed .tam-inv-table-wrap tbody { display:none!important; }',
      '.tam-inv-collapsed .tam-inv-table-wrap tfoot tr:first-child td { border-top:1px solid #e6e6e6; }',

      /* ── Single invoice collapsed state ── */
      '.tam-single-inv-collapsed thead { display:none!important; }',
      '.tam-single-inv-collapsed tbody { display:none!important; }',
      '.tam-single-inv-collapsed tfoot tr:first-child td { border-top:1px solid #e6e6e6; }',

      /* ── Distribution area collapsed state ── */
      '.tam-rec-area-title { display:flex; align-items:center; }',
      '.tam-rec-collapsed .tam-rec-collapsible { display:none!important; }',

'.tam-invoice-block { width:100%; max-width:960px; margin-bottom:8px; border:1px solid #e6e6e6; border-radius:14px; overflow:visible; }',
      '.tam-invoice-block-header { display:flex; align-items:center; gap:16px; padding:10px 16px; background:#f8f8f8; border-bottom:1px solid #e6e6e6; flex-wrap:wrap; }',
      /* ── Invoice header colour palette (6 variants, cycling) ── */
      '.tam-inv-color-0 { background:linear-gradient(90deg,#1a237e 0%,#283593 60%,#3949ab 100%)!important; border-bottom:1px solid #1a237e!important; }',
      '.tam-inv-color-1 { background:linear-gradient(90deg,#1b5e20 0%,#2e7d32 60%,#388e3c 100%)!important; border-bottom:1px solid #1b5e20!important; }',
      '.tam-inv-color-2 { background:linear-gradient(90deg,#4a148c 0%,#6a1b9a 60%,#7b1fa2 100%)!important; border-bottom:1px solid #4a148c!important; }',
      '.tam-inv-color-3 { background:linear-gradient(90deg,#b71c1c 0%,#c62828 60%,#d32f2f 100%)!important; border-bottom:1px solid #b71c1c!important; }',
      '.tam-inv-color-4 { background:linear-gradient(90deg,#e65100 0%,#ef6c00 60%,#f57c00 100%)!important; border-bottom:1px solid #e65100!important; }',
      '.tam-inv-color-5 { background:linear-gradient(90deg,#006064 0%,#00838f 60%,#0097a7 100%)!important; border-bottom:1px solid #006064!important; }',
      /* Text inside coloured headers: always white and legible */
      '.tam-inv-color-0 .tam-inv-num, .tam-inv-color-0 .tam-inv-meta, .tam-inv-color-0 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      '.tam-inv-color-1 .tam-inv-num, .tam-inv-color-1 .tam-inv-meta, .tam-inv-color-1 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      '.tam-inv-color-2 .tam-inv-num, .tam-inv-color-2 .tam-inv-meta, .tam-inv-color-2 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      '.tam-inv-color-3 .tam-inv-num, .tam-inv-color-3 .tam-inv-meta, .tam-inv-color-3 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      '.tam-inv-color-4 .tam-inv-num, .tam-inv-color-4 .tam-inv-meta, .tam-inv-color-4 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      '.tam-inv-color-5 .tam-inv-num, .tam-inv-color-5 .tam-inv-meta, .tam-inv-color-5 .tam-inv-total { color:#fff!important; text-shadow:0 1px 2px rgba(0,0,0,.35); }',
      /* Collapse toggle visible on coloured bg */
      '.tam-inv-color-0 .tam-inv-toggle-btn, .tam-inv-color-1 .tam-inv-toggle-btn, .tam-inv-color-2 .tam-inv-toggle-btn, .tam-inv-color-3 .tam-inv-toggle-btn, .tam-inv-color-4 .tam-inv-toggle-btn, .tam-inv-color-5 .tam-inv-toggle-btn { color:rgba(255,255,255,.7)!important; }',
      /* Buttons inside coloured headers: translucent white style */
      '.tam-invoice-block-header[class*="tam-inv-color-"] button:not(.tam-inv-toggle-btn):not(.tam-inv-quick-undo) { background:rgba(255,255,255,.15)!important; border-color:rgba(255,255,255,.4)!important; color:#fff!important; }',
      '.tam-invoice-block-header[class*="tam-inv-color-"] button:not(.tam-inv-toggle-btn):not(.tam-inv-quick-undo):hover { background:rgba(255,255,255,.30)!important; }',
      /* Undo button on coloured headers: always clearly visible */
      '.tam-invoice-block-header[class*="tam-inv-color-"] .tam-inv-quick-undo { background:#fff!important; border-color:#fff!important; color:#000!important; font-weight:700!important; }',
      '.tam-invoice-block-header[class*="tam-inv-color-"] .tam-inv-quick-undo:hover { background:#f0f0f0!important; color:#000!important; }',
      /* Quick wrap labels on coloured bg */
      '.tam-inv-color-0 .tam-inv-quick-active, .tam-inv-color-1 .tam-inv-quick-active, .tam-inv-color-2 .tam-inv-quick-active, .tam-inv-color-3 .tam-inv-quick-active, .tam-inv-color-4 .tam-inv-quick-active, .tam-inv-color-5 .tam-inv-quick-active { color:rgba(255,255,255,.9)!important; font-weight:700!important; text-shadow:0 1px 3px rgba(0,0,0,.4)!important; }',
      /* ── Close session button ── */
      '#tam-close-session-btn { display:none; padding:6px 14px; font-size:.72rem; font-weight:700; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1.5px solid rgba(239,83,80,.6); border-radius:8px; background:rgba(239,83,80,.1)!important; color:#ef9a9a!important; transition:background .15s,color .15s,border-color .15s,box-shadow .15s; white-space:nowrap; letter-spacing:.02em; }',
      '#tam-close-session-btn:hover { background:rgba(239,83,80,.25)!important; border-color:#ef5350; color:#ffcdd2!important; box-shadow:0 0 10px rgba(239,83,80,.3); }',
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
      '.tam-ebtn { border:1.5px solid #2a2a3e; background:#1a1a2e; padding:8px 20px; border-radius:10px; cursor:pointer; font-family:MontserratLight,sans-serif; font-size:.78rem; line-height:1.45; text-align:center; transition:background .18s,border-color .18s,box-shadow .18s; min-width:110px; color:rgba(255,255,255,.7); }',
      '.tam-ebtn:hover { background:#252540; border-color:#4a4a7a; box-shadow:0 4px 14px rgba(0,0,0,.25); color:#fff; }',
      '.tam-ebtn-active { background:linear-gradient(135deg,#1a237e,#283593)!important; color:#fff!important; border-color:#3949ab!important; box-shadow:0 4px 16px rgba(26,35,126,.4)!important; }',
      '.tam-ebtn-label { display:block; font-weight:700; font-size:.82rem; }',
      '.tam-ebtn-detail { display:block; font-size:.68rem; color:rgba(255,255,255,.45); margin-top:2px; }',
      '.tam-chk-ok { color:#2a6a2a; }',
      '.tam-chk-err { color:#c00; }',

      /* ══════════════════════════
         ÁREA DE RECEPCIÓN
      ══════════════════════════ */
      '#tam-reception-area { width:100%; max-width:1600px; margin-top:20px; }',

      /* Scroll contenedor */
      '.tam-rec-boxes-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%; }',
      '.tam-rec-area { border:1px solid #e6e6e6; border-radius:16px; overflow:visible; background:#fff; }',
      '.tam-rec-area-title { padding:10px 18px; font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; border-bottom:1px solid #e6e6e6; background:#fafafa; }',

      '.tam-th-funchal { background:#1a237e!important; color:#ffffff!important; letter-spacing:.04em; font-weight:800!important; }',
      '.tam-th-porto   { background:#880e4f!important; color:#ffffff!important; letter-spacing:.04em; font-weight:800!important; }',

      /* ── Quick distribution buttons ── */
      '.tam-rec-quick-btns { display:flex; align-items:center; gap:8px; padding:10px 18px; border-bottom:1px solid #e0e0e0; background:#1a1a2e!important; flex-wrap:wrap; border-radius:0; }',
      '.tam-quick-label { font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.5)!important; white-space:nowrap; }',
      '.tam-quick-btn { padding:6px 16px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1.5px solid #444!important; border-radius:8px; background:#333!important; color:#fff!important; transition:background .15s,color .15s,border-color .15s,box-shadow .15s; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,.18); }',
      '.tam-quick-btn:hover { background:#111!important; color:#fff!important; border-color:#111!important; box-shadow:0 4px 12px rgba(0,0,0,.28); }',
      '.tam-quick-btn-split { border-color:#3949ab!important; color:#c5cae9!important; background:#1a237e!important; }',
      '.tam-quick-btn-split:hover { background:#0d1642!important; color:#fff!important; border-color:#0d1642!important; }',

      /* ── Reception table: deep black text, no spinners ── */
      '.tam-rec-boxes-table { border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.82rem; white-space:nowrap; color:#000!important; }',
      '.tam-rec-boxes-table th, .tam-rec-boxes-table td { border:1px solid #f0f0f0; text-align:center; vertical-align:middle; color:#000!important; }',
      '.tam-rec-input { width:48px; padding:2px 4px; font-size:.8rem; font-weight:bold; font-family:MontserratLight,sans-serif; border:1px solid #ddd; border-radius:6px; text-align:center; outline:none; background:transparent; transition:border-color .15s; color:#000!important; -moz-appearance:textfield; appearance:textfield; }',
      '.tam-rec-input::-webkit-outer-spin-button, .tam-rec-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }',
      '.tam-rec-input-f { color:#1565c0!important; }',
      '.tam-rec-input-p { color:#880e4f!important; }',
      '.tam-rec-input:focus { border-color:#555; background:#fff; }',
      '.tam-rec-input:disabled { background:#f5f5f5; color:#bbb!important; border-color:#eee; }',

      /* ── Per-row quick buttons column ── */
      '.tam-rec-quick-col { min-width:100px; padding:2px 6px!important; background:#fafafa!important; border-left:2px solid #e6e6e6!important; }',
      '.tam-boxes-hdr-row .tam-rec-quick-col { font-size:.65rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#aaa; background:#f8f8f8!important; }',
      '.tam-row-quick { display:flex; gap:3px; justify-content:center; }',
      '.tam-row-quick-btn { padding:3px 8px; font-size:.68rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid rgba(255,255,255,.25); border-radius:6px; background:rgba(255,255,255,.12); color:rgba(255,255,255,.85); transition:background .12s,color .12s,border-color .12s; white-space:nowrap; line-height:1.4; }',
      '.tam-row-quick-btn:hover { background:rgba(255,255,255,.3); color:#fff; border-color:rgba(255,255,255,.6); }',
      '.tam-row-quick-split { border-color:rgba(100,181,246,.6)!important; color:#90caf9!important; }',
      '.tam-row-quick-split:hover { background:rgba(21,101,192,.5)!important; color:#fff!important; border-color:#90caf9!important; }',

      /* ── Distribuição divider banner ── */
      '.tam-rec-divider { display:flex; align-items:center; gap:0; margin-bottom:0; width:100%; max-width:1600px; }',
      '.tam-rec-divider::before { content:""; flex:1; height:2px; background:linear-gradient(to right, transparent, #c8c8c8); }',
      '.tam-rec-divider::after  { content:""; flex:1; height:2px; background:linear-gradient(to left,  transparent, #c8c8c8); }',
      '.tam-rec-divider span { font-family:MontserratLight,sans-serif; font-size:1rem; font-weight:bold; text-transform:uppercase; letter-spacing:.22em; color:#fff; background:#888; padding:9px 36px; border-radius:28px; white-space:nowrap; box-shadow:0 2px 10px rgba(0,0,0,.15); }',

      /* ── Box column alternating colors ── */
      /* Box headers alternate between two palettes */
      '.tam-box-header:nth-of-type(odd)  { background:linear-gradient(135deg,#1a237e,#283593)!important; color:#e8eaf6!important; border-top:3px solid #3949ab!important; }',
      '.tam-box-header:nth-of-type(even) { background:linear-gradient(135deg,#1b5e20,#2e7d32)!important; color:#e8f5e9!important; border-top:3px solid #43a047!important; }',
      '.tam-box-header.tam-box-col-complete { background:linear-gradient(135deg,#e8f8f0,#d0f0e0)!important; color:#1a7a3a!important; }',
      /* Sub-header alternates */
      '.tam-box-sub-th:nth-of-type(odd)  { background:#e8eaf6!important; border-top:2px solid #3949ab!important; }',
      '.tam-box-sub-th:nth-of-type(even) { background:#e8f5e9!important; border-top:2px solid #43a047!important; }',
      /* F/P cells inside odd box: blue tones */
      /* Even box: green-teal tones */
      /* We apply via JS-injected classes: .tam-box-odd-col and .tam-box-even-col */
      '.tam-rec-cell-f.tam-col-odd  { background:#e8eaf6!important; }',
      '.tam-rec-cell-p.tam-col-odd  { background:#f3e5f5!important; border-right:2px solid #ce93d8!important; }',
      '.tam-rec-cell-f.tam-col-even { background:#e8f5e9!important; }',
      '.tam-rec-cell-p.tam-col-even { background:#fff8e1!important; border-right:2px solid #ffe082!important; }',
      '.tam-rec-cell-quick.tam-col-odd  { background:#f4ecf7!important; border-left:1px dashed #d2b4de!important; }',
      '.tam-rec-cell-quick.tam-col-even { background:#fdfefe!important; border-left:1px dashed #a9dfbf!important; }',
      '.tam-box-col-active { background:rgba(21,101,192,0.10)!important; border-bottom:2px solid #1565c0!important; color:#1565c0!important; }',

      /* ── Completed box columns: alternating grey — 2-class selectors beat cell selectors ── */
      /* odd-grey: light grey */
      '.tam-box-header.tam-box-col-grey-odd  { background:#d0d0d0!important; color:#555!important; border-top:3px solid #aaa!important; }',
      '.tam-box-sub-th.tam-box-col-grey-odd  { background:#d8d8d8!important; border-top:2px solid #aaa!important; }',
      '.tam-rec-cell-f.tam-box-col-grey-odd  { background:#d8d8d8!important; }',
      '.tam-rec-cell-p.tam-box-col-grey-odd  { background:#d4d4d4!important; border-right:2px solid #bbb!important; }',
      '.tam-rec-cell-quick.tam-col-odd.tam-box-col-grey-odd  { background:#d0d0d0!important; border-left:1px solid #bbb!important; }',
      /* even-grey: darker grey */
      '.tam-box-header.tam-box-col-grey-even { background:#b8b8b8!important; color:#333!important; border-top:3px solid #999!important; }',
      '.tam-box-sub-th.tam-box-col-grey-even { background:#c4c4c4!important; border-top:2px solid #999!important; }',
      '.tam-rec-cell-f.tam-box-col-grey-even { background:#c4c4c4!important; }',
      '.tam-rec-cell-p.tam-box-col-grey-even { background:#bfbfbf!important; border-right:2px solid #aaa!important; }',
      '.tam-rec-cell-quick.tam-col-even.tam-box-col-grey-even { background:#bbb!important; border-left:1px solid #aaa!important; }',
      /* Sub-header complete */
      '.tam-box-sub-th.tam-box-sub-complete { background:#d0d0d0!important; border-top:2px solid #aaa!important; }',
      /* disabled inputs inside grey cols */
      '.tam-box-col-grey-odd .tam-rec-input:disabled, .tam-box-col-grey-even .tam-rec-input:disabled { background:transparent!important; border-color:#bbb!important; color:#888!important; }',

      /* ── Inactive (non-active, non-complete) box columns: compact ── */
      '.tam-box-col-inactive { background:#f4f4f4!important; color:#777!important; border-top:3px solid #ddd!important; }',
      '.tam-box-compact { width:1px!important; min-width:0!important; padding:2px 3px!important; }',
      '.tam-box-compact .tam-rec-input { width:34px!important; }',

      /* ── Quick column (rápido) — very dark grey background ── */
      '.tam-rec-cell-quick.tam-col-odd, .tam-rec-cell-quick.tam-col-even { background:#2e2e2e!important; border-left:1px solid #555!important; }',
      '.tam-rec-cell-quick.tam-col-odd .tam-row-quick-btn, .tam-rec-cell-quick.tam-col-even .tam-row-quick-btn { background:#444!important; border-color:#666!important; color:#e0e0e0!important; }',
      '.tam-rec-cell-quick.tam-col-odd .tam-row-quick-btn:hover, .tam-rec-cell-quick.tam-col-even .tam-row-quick-btn:hover { background:#eee!important; color:#000!important; }',
      '.tam-rec-cell-quick.tam-col-odd .tam-row-quick-split, .tam-rec-cell-quick.tam-col-even .tam-row-quick-split { border-color:#64b5f6!important; color:#64b5f6!important; }',
      '.tam-rec-cell-quick.tam-col-odd .tam-row-quick-split:hover, .tam-rec-cell-quick.tam-col-even .tam-row-quick-split:hover { background:#1565c0!important; color:#fff!important; border-color:#1565c0!important; }',
      /* sub-header quick label */
      '.tam-sub-q { font-size:.6rem; font-weight:bold; color:#aaa; letter-spacing:.03em; }',
      '.tam-row-quick-btn:disabled { opacity:0.3; cursor:not-allowed; }',
      '.tam-quick-nototals { opacity:0.5; }',

      /* ── ref-completing: green flash kept at top for 3s ── */
      '.tam-ref-completing td { background:#d4f5d4!important; transition:background 0.4s; }',
      '.tam-ref-completing .tam-rec-ref-col { background:#c0eec0!important; }',
      '.tam-ref-completing .tam-rec-total-col { background:#c8f2c8!important; }',

      /* ── Top scrollbar sync bar ── */
      '.tam-rec-scroll-sync-wrap { display:flex; flex-direction:column; width:100%; }',
      '.tam-rec-scroll-top-bar { overflow-x:auto; overflow-y:hidden; height:12px; background:#e8e8e8; border-radius:6px 6px 0 0; border-bottom:1px solid #ccc; scrollbar-width:thin; }',
      '.tam-rec-scroll-top-bar::-webkit-scrollbar { height:8px; }',
      '.tam-rec-scroll-top-bar::-webkit-scrollbar-thumb { background:#aaa; border-radius:4px; }',
      '.tam-rec-scroll-top-inner { height:1px; }',

      /* dark mode overrides */

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
      '.tam-boxes-sub-hdr .tam-rec-ref-col { position:sticky; left:0; z-index:4; background-color:#fafafa!important; background:#fafafa!important; box-shadow:2px 0 6px rgba(0,0,0,.07); padding:4px 6px!important; }',
      /* ── Mobile sticky ref column — refuerzo explícito ── */
      '@media (max-width:768px) {',
      '  .tam-rec-boxes-scroll { overflow-x:auto!important; -webkit-overflow-scrolling:touch!important; }',
      '  .tam-rec-ref-col { position:sticky!important; left:0!important; z-index:10!important; min-width:110px!important; background-color:#fafafa!important; background:#fafafa!important; box-shadow:3px 0 10px rgba(0,0,0,.13)!important; }',
      '  .tam-boxes-hdr-row .tam-rec-ref-col,',
      '  .tam-boxes-sub-hdr .tam-rec-ref-col { position:sticky!important; left:0!important; z-index:12!important; background-color:#f8f8f8!important; background:#f8f8f8!important; }',
      '  .tam-ref-over .tam-rec-ref-col { background-color:#ffe0e0!important; background:#ffe0e0!important; }',
      '  .tam-ref-complete .tam-rec-ref-col { background-color:#e8e8e8!important; background:#e8e8e8!important; }',
      '  .tam-ref-completing .tam-rec-ref-col { background:#c0eec0!important; }',
      '}',

      /* ── Click-to-modify tooltip ── */
      '#tam-modify-tip { position:absolute; z-index:9999; display:flex; align-items:center; gap:8px; padding:8px 14px; background:#fff; border:1.5px solid #1565c0; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.22); font-family:MontserratLight,sans-serif; font-size:.78rem; white-space:nowrap; opacity:0; pointer-events:none; transform:translateX(-4px); transition:opacity .15s ease, transform .15s ease; }',
      '#tam-modify-tip.tam-tip-visible { opacity:1; pointer-events:auto; transform:translateX(0); }',
      '.tam-tip-msg { color:#333; font-weight:bold; }',
      '.tam-tip-btn { padding:3px 14px; font-size:.74rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #1565c0; border-radius:7px; background:#1565c0; color:#fff; transition:background .12s; }',
      '.tam-tip-btn:hover { background:#0d47a1; border-color:#0d47a1; }',
      '.tam-tip-cancel { padding:3px 10px; font-size:.74rem; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:7px; background:#f5f5f5; color:#555; transition:background .12s; }',
      '.tam-tip-cancel:hover { background:#e0e0e0; }',
      /* pointer on clickable ref cells */
      '.tam-ref-complete .tam-rec-ref-col, .tam-ref-over .tam-rec-ref-col { cursor:pointer; }',
      '.tam-ref-complete .tam-rec-ref-col:hover, .tam-ref-over .tam-rec-ref-col:hover { background:#e8f0fe!important; }',
      /* ── Unlocked column highlight: bright white ── */
      '.tam-col-unlocked { background:#ffffff!important; box-shadow:inset 0 0 0 1px #1565c020; }',
      '.tam-col-unlocked-hdr { background:#e8f4fd!important; border-top:3px solid #1565c0!important; }',
      /* ── Ref cells in edit state: grey with relief ── */
      '.tam-cell-ref-edit { background:#e0e0e0!important; box-shadow:inset 0 1px 4px rgba(0,0,0,.18)!important; }',
      '.tam-cell-ref-edit .tam-rec-input { background:#e0e0e0!important; font-weight:bold!important; color:#1a1a1a!important; }',
      /* ── Cell edit flash animation (kept for other uses) ── */
      '@keyframes tam-edit-flash { 0%{background:#ffe082!important;outline:2px solid #f9a825!important;} 50%{background:#fff176!important;outline:2px solid #f9a825!important;} 100%{background:inherit;outline:none;} }',
      '.tam-cell-edit-flash { animation:tam-edit-flash 2s ease forwards!important; }',

      /* ── Undo / Redo / Clear action buttons in hdr2 ── */
      '.tam-hdr-action-col { padding:2px 4px!important; text-align:center!important; vertical-align:middle!important; }',
      '.tam-action-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:26px; font-size:.9rem; cursor:pointer; border:1.5px solid #2a2a3e; border-radius:7px; background:#1a1a2e; color:rgba(255,255,255,.7); transition:background .12s,color .12s,border-color .12s,box-shadow .12s; line-height:1; padding:0; }',
      '.tam-action-btn:hover:not(:disabled) { background:#2e2e50; color:#fff; border-color:#4a4a7a; box-shadow:0 2px 8px rgba(0,0,0,.25); }',
      '.tam-action-btn:disabled { opacity:.25; cursor:not-allowed; }',
      '.tam-undo-btn:hover:not(:disabled) { background:#1a237e!important; border-color:#3949ab!important; color:#fff!important; }',
      '.tam-redo-btn:hover:not(:disabled) { background:#1a237e!important; border-color:#3949ab!important; color:#fff!important; }',
      '.tam-clear-btn:hover:not(:disabled) { background:#b71c1c!important; border-color:#e53935!important; color:#fff!important; }',

      /* ── Ref filter input ── */
      '.tam-ref-filter-input { width:100%; box-sizing:border-box; padding:4px 8px; font-size:.78rem; font-family:MontserratLight,sans-serif; border:1.5px solid #ddd; border-radius:7px; outline:none; background:#fff; color:#333; transition:border-color .15s, box-shadow .15s; }',
      '.tam-ref-filter-input:focus { border-color:#1565c0; box-shadow:0 0 0 2px rgba(21,101,192,.15); }',
      '.tam-ref-filter-input::placeholder { color:#bbb; font-style:italic; }',
      /* Override sticky bg per row state */
      '.tam-ref-over .tam-rec-ref-col { background-color:#ffe0e0!important; background:#ffe0e0!important; }',
      '.tam-ref-complete .tam-rec-ref-col { background-color:#fafafa!important; background:#fafafa!important; }',
      '.tam-rec-boxes-table tbody tr:hover .tam-rec-ref-col { background-color:#f0f0f0!important; background:#f0f0f0!important; }',

      /* Celdas input */
      '.tam-rec-cell-f { background:#f0f8ff; padding:2px 4px!important; min-width:52px; }',
      '.tam-rec-cell-p { background:#fff0f5; padding:2px 4px!important; min-width:52px; border-right:2px solid #e0e0e0!important; }',
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

      /* ── Per-invoice quick distribution buttons ── */
      '.tam-inv-quick-wrap { display:flex; align-items:center; gap:4px; flex-shrink:0; }',
      '.tam-inv-quick-btn { padding:4px 11px; font-size:.68rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid rgba(255,255,255,.3); border-radius:7px; background:rgba(255,255,255,.12); color:rgba(255,255,255,.9); transition:background .15s,color .15s,border-color .15s,box-shadow .15s; white-space:nowrap; letter-spacing:.02em; }',
      '.tam-inv-quick-btn:hover { background:rgba(255,255,255,.28); border-color:rgba(255,255,255,.7); color:#fff; }',
      '.tam-inv-quick-split { border-color:rgba(100,181,246,.6)!important; color:#90caf9!important; background:rgba(21,101,192,.2)!important; }',
      '.tam-inv-quick-split:hover { background:rgba(21,101,192,.4)!important; color:#fff!important; border-color:#90caf9!important; }',
      '.tam-inv-quick-active { font-size:.68rem; font-weight:700; color:#fff; background:rgba(105,240,174,.2); border:1.5px solid #69f0ae; border-radius:7px; padding:4px 10px; white-space:nowrap; letter-spacing:.02em; text-shadow:0 1px 3px rgba(0,0,0,.3); }',
      '.tam-inv-quick-undo { border-color:rgba(255,138,128,.7)!important; color:#ff8a80!important; background:rgba(239,83,80,.1)!important; }',
      '.tam-inv-quick-undo:hover { background:rgba(239,83,80,.3)!important; color:#ffcdd2!important; border-color:#ff8a80!important; }',

      /* ── Edit mode button ── */
      '.tam-inv-edit-btn { padding:4px 11px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #aaa; border-radius:8px; background:#fff; color:#555; transition:background .15s,color .15s,border-color .15s; white-space:nowrap; flex-shrink:0; }',
      '.tam-inv-edit-btn:hover { background:#555; color:#fff; border-color:#555; }',
      '.tam-inv-edit-btn.active { background:#1a6a1a; color:#fff; border-color:#1a6a1a; }',
      '.tam-inv-edit-btn.active:hover { background:#145014; }',

      /* ── Edit mode table ── */
      '.tam-edit-notice { padding:7px 16px; font-size:.72rem; font-weight:bold; color:#b05000; background:#fff8f0; border-bottom:1px solid #f0d0a0; font-family:MontserratLight,sans-serif; letter-spacing:.02em; }',
      '.tam-table-edit tbody tr:hover td { background:#fffdf0!important; }',
      '.tam-edit-input { font-family:MontserratLight,sans-serif; font-size:.84rem; font-weight:bold; padding:3px 6px; border:1px solid #ddd; border-radius:6px; outline:none; background:#fff; width:100%; box-sizing:border-box; transition:border-color .15s; }',
      '.tam-edit-input:focus { border-color:#555; background:#fffef8; }',
      '.tam-edit-wide { min-width:160px; }',
      '.tam-edit-num { width:70px; text-align:center; }',
      '.tam-edit-del-row { background:none; border:1px solid #eee; border-radius:6px; cursor:pointer; font-size:.8rem; color:#ccc; padding:2px 7px; transition:color .15s,border-color .15s,background .15s; }',
      '.tam-edit-del-row:hover { color:#c00; border-color:#c00; background:#fff0f0; }',
      '.tam-edit-actions { display:flex; gap:8px; padding:10px 14px; background:#fafafa; border-top:1px solid #e6e6e6; flex-wrap:wrap; }',
      '.tam-edit-add-row { padding:6px 14px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #ccc; border-radius:8px; background:#fff; transition:background .15s; }',
      '.tam-edit-add-row:hover { background:#f5f5f5; border-color:#999; }',
      '.tam-edit-save { padding:6px 16px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #1a6a1a; border-radius:8px; background:#fff; color:#1a6a1a; transition:background .15s,color .15s; }',
      '.tam-edit-save:hover { background:#1a6a1a; color:#fff; }',
      '.tam-edit-cancel { padding:6px 14px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #eee; border-radius:8px; background:#fff; color:#aaa; transition:background .15s; }',
      '.tam-edit-cancel:hover { background:#f5f5f5; color:#555; }',

      /* dark mode edit */

      /* ── Remove button per invoice ── */
      '.tam-inv-remove-btn { padding:4px 10px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1px solid #c03000; border-radius:8px; background:#fff; color:#c03000; transition:background .15s,color .15s; white-space:nowrap; flex-shrink:0; }',
      '.tam-inv-remove-btn:hover { background:#c03000; color:#fff; }',

            /* ── Stock modal backdrop + panel ── */
      '#tam-stock-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#tam-stock-modal.tam-stock-visible { opacity:1; pointer-events:auto; }',
      '#tam-stock-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '#tam-stock-panel { position:relative; z-index:1; width:min(820px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.32); overflow:hidden; transform:translateY(12px); transition:transform .22s ease; }',
      '#tam-stock-modal.tam-stock-visible #tam-stock-panel { transform:translateY(0); }',
      '#tam-stock-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '#tam-stock-title { display:flex; flex-direction:column; gap:2px; }',
      '#tam-stock-inv-label { font-size:.95rem; font-weight:bold; color:#111; font-family:MontserratLight,sans-serif; }',
      '#tam-stock-sub-label { font-size:.68rem; color:#888; font-family:MontserratLight,sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      '#tam-stock-actions { display:flex; align-items:center; gap:8px; }',
      '.tam-stock-action-btn { padding:6px 16px; font-size:.76rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #2e7d32; border-radius:8px; background:#e8f5e9; color:#2e7d32; transition:background .13s,color .13s; white-space:nowrap; }',
      '.tam-stock-action-btn:hover { background:#2e7d32; color:#fff; }',
      '.tam-stock-close-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:1rem; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#f5f5f5; color:#555; transition:background .12s; }',
      '.tam-stock-close-btn:hover { background:#c62828; color:#fff; border-color:#c62828; }',
      '#tam-stock-scroll { overflow:auto; flex:1; -webkit-overflow-scrolling:touch; }',
      '#tam-stock-table { width:100%; border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.82rem; white-space:nowrap; }',
      '#tam-stock-table thead { position:sticky; top:0; z-index:2; }',
      '.tam-stock-th { padding:8px 14px; background:#f0f0f0; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#666; border-bottom:2px solid #ddd; text-align:left; user-select:none; }',
      '.tam-stock-th.tam-stock-city,.tam-stock-th.tam-stock-iva,.tam-stock-th.tam-stock-price,.tam-stock-th.tam-stock-qty { text-align:center; }',
      '.tam-stock-td { padding:6px 14px; border-bottom:1px solid #f2f2f2; vertical-align:middle; }',
      '.tam-stock-td.tam-stock-city,.tam-stock-td.tam-stock-iva,.tam-stock-td.tam-stock-qty { text-align:center; font-weight:bold; }',
      '.tam-stock-td.tam-stock-price { text-align:right; font-variant-numeric:tabular-nums; }',
      '.tam-stock-td.tam-stock-ref { font-weight:bold; color:#1a1a1a; min-width:160px; }',
      '.tam-stock-row-even { background:#fff; }',
      '.tam-stock-row-odd  { background:#fafafa; }',
      '#tam-stock-table tbody tr:hover td { background:#e8f0fe!important; }',
      '.tam-stock-td.tam-stock-city[data-city="A4"] { color:#1565c0; }',
      '.tam-stock-td.tam-stock-city[data-city="A5"] { color:#880e4f; }',
      '#tam-stock-footer { padding:8px 20px; font-size:.72rem; color:#888; border-top:1px solid #eee; background:#fafafa; font-family:MontserratLight,sans-serif; flex-shrink:0; }',

      /* ── Guia modal backdrop + panel ── */
      '#tam-guia-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#tam-guia-modal.tam-guia-visible { opacity:1; pointer-events:auto; }',
      '#tam-guia-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '#tam-guia-panel { position:relative; z-index:1; width:min(720px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.32); overflow:hidden; transform:translateY(12px); transition:transform .22s ease; }',
      '#tam-guia-modal.tam-guia-visible #tam-guia-panel { transform:translateY(0); }',
      '#tam-guia-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; flex-wrap:wrap; gap:8px; }',
      '#tam-guia-title { display:flex; flex-direction:column; gap:2px; }',
      '#tam-guia-title-main { font-size:.95rem; font-weight:bold; color:#111; font-family:MontserratLight,sans-serif; }',
      '#tam-guia-title-sub { font-size:.68rem; color:#888; font-family:MontserratLight,sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      '#tam-guia-header-btns { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
      '.tam-guia-action-btn { padding:6px 16px; font-size:.76rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:8px; background:#f5f5f5; color:#555; transition:background .13s,color .13s,border-color .13s; white-space:nowrap; }',
      '.tam-guia-action-btn:hover:not(:disabled) { background:#555; color:#fff; border-color:#555; }',
      '.tam-guia-action-btn:disabled { opacity:.4; cursor:not-allowed; }',
      '.tam-guia-confirm { border-color:#2e7d32!important; color:#2e7d32!important; background:#e8f5e9!important; }',
      '.tam-guia-confirm:hover:not(:disabled) { background:#2e7d32!important; color:#fff!important; }',
      '.tam-guia-close-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:1rem; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#f5f5f5; color:#555; transition:background .12s; }',
      '.tam-guia-close-btn:hover { background:#c62828; color:#fff; border-color:#c62828; }',
      '.tam-guia-copy-bar { display:flex; align-items:center; gap:6px; padding:8px 16px; background:#f8f8f8; border-bottom:1px solid #eee; flex-wrap:wrap; flex-shrink:0; }',
      '.tam-guia-copy-label { font-size:.7rem; font-weight:bold; color:#aaa; text-transform:uppercase; letter-spacing:.05em; font-family:MontserratLight,sans-serif; white-space:nowrap; }',
      '.tam-guia-copy-btn { padding:4px 11px; font-size:.72rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:7px; background:#fff; color:#555; transition:background .12s,color .12s,border-color .12s; white-space:nowrap; }',
      '.tam-guia-copy-btn:hover { background:#555; color:#fff; border-color:#555; }',
      '.tam-guia-copy-active { background:#1565c0!important; color:#fff!important; border-color:#1565c0!important; }',
      '.tam-guia-copy-msg { font-size:.75rem; font-weight:bold; font-family:MontserratLight,sans-serif; margin-left:4px; }',
      '#tam-guia-scroll { overflow:auto; flex:1; -webkit-overflow-scrolling:touch; }',
      '#tam-guia-table { width:100%; border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.84rem; }',
      '#tam-guia-table thead { position:sticky; top:0; z-index:2; }',
      '.tam-guia-th { padding:9px 14px; font-size:.72rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #ddd; text-align:center; }',
      '.tam-guia-th-f { background:#e8f0fe; color:#1565c0; }',
      '.tam-guia-th-p { background:#fce4ec; color:#880e4f; }',
      '.tam-guia-th-sep { width:16px; background:#f5f5f5; border-bottom:2px solid #ddd; }',
      '.tam-guia-th2 { padding:7px 14px; background:#f0f0f0; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; color:#666; border-bottom:2px solid #ddd; text-align:left; }',
      '.tam-guia-th2-qty { text-align:center; }',
      '.tam-guia-td { padding:7px 14px; border-bottom:1px solid #f2f2f2; vertical-align:middle; }',
      '.tam-guia-ref-f { font-weight:bold; color:#1565c0; min-width:120px; }',
      '.tam-guia-qty-f { text-align:center; font-weight:bold; color:#1565c0; font-variant-numeric:tabular-nums; }',
      '.tam-guia-sep { width:16px; background:#f9f9f9; border-bottom:1px solid #f2f2f2; }',
      '.tam-guia-ref-p { font-weight:bold; color:#880e4f; min-width:120px; }',
      '.tam-guia-qty-p { text-align:center; font-weight:bold; color:#880e4f; font-variant-numeric:tabular-nums; }',
      '.tam-guia-row-even td { background:#fff; }',
      '.tam-guia-row-odd td { background:#fafafa; }',
      '.tam-guia-row-sent td { background:#f0faf0; color:#888; }',
      '.tam-guia-row-sent .tam-guia-ref-f,.tam-guia-row-sent .tam-guia-ref-p { color:#aaa; }',
      '.tam-guia-row-sent .tam-guia-qty-f,.tam-guia-row-sent .tam-guia-qty-p { color:#aaa; }',
      '#tam-guia-table tbody tr:hover td { background:#e8f0fe!important; }',
      '.tam-guia-sent-hdr td { padding:6px 14px; background:#f0faf0; font-size:.72rem; font-weight:bold; color:#2e7d32; text-transform:uppercase; letter-spacing:.04em; border-top:2px solid #c8e6c9; border-bottom:1px solid #c8e6c9; }',
      '.tam-guia-empty { padding:18px 14px; color:#bbb; font-style:italic; text-align:center; }',
      '#tam-guia-footer { padding:8px 20px; font-size:.72rem; color:#888; border-top:1px solid #eee; background:#fafafa; font-family:MontserratLight,sans-serif; flex-shrink:0; }',
      /* ── Guia confirm overlay ── */
      '#tam-guia-confirm-overlay { position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.88); border-radius:16px; }',
      '#tam-guia-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:24px 28px; width:min(380px,90%); font-family:MontserratLight,sans-serif; }',
      '.tam-gc-title { font-size:.9rem; font-weight:bold; color:#c05000; margin-bottom:12px; }',
      '.tam-gc-body { font-size:.82rem; color:#555; line-height:1.6; margin-bottom:18px; }',
      '.tam-gc-btns { display:flex; gap:10px; justify-content:flex-end; }',
      '.tam-gc-btn { padding:8px 20px; font-size:.78rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:9px; border:1.5px solid #ccc; background:#f5f5f5; color:#555; transition:background .13s,color .13s; }',
      '.tam-gc-ok { border-color:#2e7d32!important; color:#2e7d32!important; background:#e8f5e9!important; }',
      '.tam-gc-ok:hover { background:#2e7d32!important; color:#fff!important; }',
      '.tam-gc-cancel:hover { background:#555; color:#fff; border-color:#555; }',

      /* ── Anomaly column header and cells ── */
      '.tam-th-anomaly { background:#f5f5f5!important; color:#888!important; font-size:.65rem!important; min-width:54px; }',
      '.tam-cell-anomaly-ok   { background:#1a1a1a!important; color:#1a1a1a!important; font-size:.75rem; font-weight:bold; text-align:center; }',
      '.tam-cell-anomaly-low  { background:#fff0f0; color:#c00; font-weight:bold; text-align:center; }',
      '.tam-cell-anomaly-high { background:#f0f4ff; color:#1565c0; font-weight:bold; text-align:center; }',
      '.tam-cell-anomaly-empty { background:#fafafa; }',

      /* ── Anomaly report block ── */
      '#tam-anomaly-area { width:100%; max-width:960px; margin-top:16px; }',
      '.tam-anomaly-btn-wrap { display:flex; justify-content:center; margin-bottom:10px; }',
      '.tam-anomaly-btn { padding:9px 24px; font-size:.82rem; font-weight:bold; font-family:MontserratLight,sans-serif; text-transform:lowercase; cursor:pointer; border:1.5px solid #e07000; border-radius:10px; background:#fff8f0; color:#b05000; transition:background .15s,color .15s; letter-spacing:.02em; }',
      '.tam-anomaly-btn:hover { background:#e07000; color:#fff; }',
      '#tam-anomaly-report { border:1px solid #e6e6e6; border-radius:14px; overflow:hidden; font-family:MontserratLight,sans-serif; }',
      '.tam-anomaly-title { padding:10px 16px; font-size:.7rem; font-weight:bold; text-transform:uppercase; letter-spacing:.07em; color:#aaa; border-bottom:1px solid #e6e6e6; background:#fafafa; border-radius:14px 14px 0 0; }',
      '.tam-anomaly-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }',
      '.tam-anomaly-table { width:100%; min-width:480px; border-collapse:collapse; font-size:.84rem; white-space:nowrap; }',
      '.tam-anomaly-table th { padding:6px 12px; background:#f2f2f2; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; color:#888; border-bottom:1px solid #e6e6e6; text-align:center; }',
      '.tam-anomaly-table td { padding:5px 12px; border-bottom:1px solid #f5f5f5; font-weight:bold; text-align:center; vertical-align:middle; }',
      '.tam-anomaly-table td:first-child { text-align:left; }',
      '.tam-anomaly-table tbody tr:last-child td { border-bottom:none; }',
      '.tam-anom-low  { color:#c00!important; }',
      '.tam-anom-high { color:#1565c0!important; }',


      /* -- DN modal -- */
      '#tam-dn-modal { position:fixed; inset:0; z-index:10001; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#tam-dn-modal.tam-dn-visible { opacity:1; pointer-events:auto; }',
      '#tam-dn-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.5); }',
      '#tam-dn-panel { position:relative; z-index:1; width:min(700px,96vw); max-width:96vw; max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.32); overflow:hidden; transform:translateY(12px); transition:transform .22s ease; }',
      '#tam-dn-modal.tam-dn-visible #tam-dn-panel { transform:translateY(0); }',
      '#tam-dn-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '#tam-dn-title { display:flex; flex-direction:column; gap:2px; }',
      '#tam-dn-zy { font-size:1rem; font-weight:bold; color:#111; font-family:MontserratLight,sans-serif; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
      '#tam-dn-sub { font-size:.68rem; color:#888; font-family:MontserratLight,sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      /* Total pieces labels next to title */
      '.tam-dn-total-ok      { font-size:.78rem; font-weight:bold; color:#2e7d32; background:#f0faf0; border:1px solid #2e7d32; border-radius:6px; padding:2px 8px; white-space:nowrap; }',
      '.tam-dn-total-err     { font-size:.78rem; font-weight:bold; color:#c62828; background:#fff0f0; border:1px solid #c62828; border-radius:6px; padding:2px 8px; white-space:nowrap; }',
      '.tam-dn-total-neutral { font-size:.78rem; font-weight:bold; color:#555;    background:#f5f5f5;  border:1px solid #ccc;    border-radius:6px; padding:2px 8px; white-space:nowrap; }',
      '.tam-dn-close { width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:1.1rem; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#f5f5f5; color:#555; transition:background .12s; }',
      '.tam-dn-close:hover { background:#c62828; color:#fff; border-color:#c62828; }',
      '#tam-dn-scroll { overflow:auto; flex:1; -webkit-overflow-scrolling:touch; }',
      '#tam-dn-table { width:100%; border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.84rem; table-layout:auto; }',
      '#tam-dn-table thead { position:sticky; top:0; z-index:2; }',
      '.tam-dn-th { padding:8px 12px; background:#f0f0f0; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#666; border-bottom:2px solid #ddd; text-align:left; }',
      '.tam-dn-th-f { color:#1565c0; background:#e8f0fe; }',
      '.tam-dn-th-p { color:#c62828; background:#fce4ec; }',
      '.tam-dn-row td { padding:7px 12px; border-bottom:1px solid #f2f2f2; vertical-align:middle; }',
      '.tam-dn-ref { font-weight:bold; color:#222; white-space:nowrap; width:1%; }',  /* shrink to longest ref */
      '.tam-dn-total { text-align:center; color:#555; font-weight:bold; white-space:nowrap; width:1%; }',
      '.tam-dn-cell { text-align:center; white-space:nowrap; width:1%; }',
      /* No spinners on DN inputs */
      '.tam-dn-inp { width:58px; min-width:44px; padding:5px 4px; font-size:.84rem; font-family:MontserratLight,sans-serif; border:1.5px solid #ddd; border-radius:7px; text-align:center; outline:none; transition:border-color .12s; -moz-appearance:textfield; appearance:textfield; }',
      '.tam-dn-inp::-webkit-inner-spin-button,.tam-dn-inp::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }',
      '.tam-dn-inp-f:focus { border-color:#1565c0; }',
      '.tam-dn-inp-p:focus { border-color:#c62828; }',
      '.tam-dn-btns { display:flex; gap:4px; align-items:center; white-space:nowrap; }',
      '.tam-dn-btns-cell { width:1%; white-space:nowrap; }',  /* shrink buttons col */
      '.tam-dn-qbtn { padding:5px 11px; font-size:.72rem; font-weight:700; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:8px; border:1.5px solid #2a2a3e; background:#1a1a2e; color:rgba(255,255,255,.75); transition:background .12s,color .12s,border-color .12s; white-space:nowrap; }',
      '.tam-dn-f100 { border-color:#3949ab!important; color:#90caf9!important; background:rgba(26,35,126,.3)!important; }',
      '.tam-dn-f100:hover { background:#1a237e!important; color:#fff!important; border-color:#1a237e!important; }',
      '.tam-dn-p100 { border-color:#880e4f!important; color:#f48fb1!important; background:rgba(136,14,79,.25)!important; }',
      '.tam-dn-p100:hover { background:#880e4f!important; color:#fff!important; border-color:#880e4f!important; }',
      '.tam-dn-split:hover { background:rgba(255,255,255,.2)!important; color:#fff!important; }',
      '.tam-dn-row-filled { background:#e8f5e9!important; transition:background .4s; }',
      /* Odd-piece inline dialog */
      '.tam-dn-odd-td { padding:0!important; border-bottom:1px solid #e8e8e8!important; }',
      '.tam-dn-odd-dlg { padding:10px 16px; background:#fffbe6; border-top:1px solid #ffe082; display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-family:MontserratLight,sans-serif; }',
      '.tam-dn-odd-body { font-size:.82rem; font-weight:600; color:#555; }',
      '.tam-dn-odd-btns { display:flex; gap:6px; flex-wrap:wrap; }',
      '.tam-dn-odd-btn { padding:5px 12px; font-size:.76rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:8px; border:1.5px solid #ccc; background:#fff; color:#444; transition:background .12s,color .12s; white-space:nowrap; }',
      '.tam-dn-odd-f { border-color:#1565c0!important; color:#1565c0!important; }',
      '.tam-dn-odd-f:hover { background:#1565c0!important; color:#fff!important; }',
      '.tam-dn-odd-p { border-color:#c62828!important; color:#c62828!important; }',
      '.tam-dn-odd-p:hover { background:#c62828!important; color:#fff!important; }',
      '.tam-dn-odd-skip:hover { background:#555!important; color:#fff!important; }',
      '#tam-dn-footer { display:flex; align-items:center; gap:10px; padding:12px 20px; border-top:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '.tam-dn-action-btn { padding:9px 22px; font-size:.82rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:none; border-radius:10px; background:#2e7d32; color:#fff; transition:background .13s; }',
      '.tam-dn-action-btn:hover { background:#1b5e20; }',
      '.tam-dn-cancel-btn { padding:9px 16px; font-size:.82rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #ddd; border-radius:10px; background:#f5f5f5; color:#555; transition:background .13s; }',
      '.tam-dn-cancel-btn:hover { background:#ddd; }',
      '#tam-dn-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(20px); background:#333; color:#fff; padding:10px 20px; border-radius:10px; font-size:.84rem; font-family:MontserratLight,sans-serif; opacity:0; transition:opacity .3s,transform .3s; z-index:20000; pointer-events:none; }',
      '#tam-dn-toast.tam-dn-toast-show { opacity:1; transform:translateX(-50%) translateY(0); }',
      /* -- DN bar button loading state -- */
      '.tam-dn-loading { background:#2e7d32!important; color:#fff!important; }',

      /* ── Motor D ── */
      '#tam-motord-spin { position:fixed; bottom:76px; left:50%; transform:translateX(-50%) translateY(16px); background:#1a0a2e; color:#c4b5fd; padding:9px 20px; border-radius:12px; font-size:.82rem; font-family:MontserratLight,sans-serif; font-weight:bold; opacity:0; pointer-events:none; transition:opacity .25s,transform .25s; z-index:20001; white-space:nowrap; box-shadow:0 4px 24px rgba(0,0,0,.45); }',

      /* ── Motor D update badge ── */
      '.tam-motord-update-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; font-size:.7rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border:1.5px solid #c05000; border-radius:8px; background:#fff8f0; color:#c05000; transition:background .13s,color .13s; white-space:nowrap; }',
      '.tam-motord-update-badge:hover { background:#c05000; color:#fff; }',

      /* ── Motor D update modal ── */
      '#tam-motord-update-modal { position:fixed; inset:0; z-index:10100; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#tam-motord-update-modal.tam-motord-update-visible { opacity:1; pointer-events:auto; }',
      '#tam-motord-update-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.5); }',
      '#tam-motord-update-panel { position:relative; z-index:1; width:min(480px,94vw); background:#fff; border-radius:16px; box-shadow:0 16px 60px rgba(0,0,0,.28); overflow:hidden; transform:translateY(10px); transition:transform .22s ease; font-family:MontserratLight,sans-serif; }',
      '#tam-motord-update-modal.tam-motord-update-visible #tam-motord-update-panel { transform:translateY(0); }',
      '#tam-motord-update-hdr { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#fff8f0; border-bottom:1px solid #f0d0b0; font-size:.84rem; font-weight:bold; color:#c05000; }',
      '#tam-motord-update-close { width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:1rem; background:none; border:1.5px solid #e0a080; border-radius:7px; cursor:pointer; color:#c05000; transition:background .12s; }',
      '#tam-motord-update-close:hover { background:#c05000; color:#fff; border-color:#c05000; }',
      '#tam-motord-update-body { padding:20px 22px; font-size:.85rem; font-weight:600; color:#333; line-height:1.7; }',
      '#tam-motord-update-body p { margin:0 0 10px; }',
      '#tam-motord-update-body ol { margin:0 0 0 18px; padding:0; }',
      '#tam-motord-update-body li { margin-bottom:8px; }',
      '#tam-motord-update-body code { background:#f5f5f5; border:1px solid #e0e0e0; border-radius:5px; padding:2px 7px; font-family:monospace; font-size:.82rem; color:#555; }',
      '#tam-motord-update-body a { color:#1565c0; font-weight:bold; }',
      '#tam-motord-spin.tam-motord-spin-on { opacity:1; transform:translateX(-50%) translateY(0); }',
      '.tam-badge-motord { background:#7c3aed; }',
      /* Pre-filled inputs from Motor D */
      '.tam-dn-inp-prefilled { border-color:#7c3aed!important; background:#f5f3ff!important; }',
      '.tam-dn-inp-unclear   { border-color:#c62828!important; background:#fff0f0!important; }',
      '.tam-dn-row-prefilled td { background:#faf7ff!important; }',
      /* Confidence banners */
      '.tam-dn-md-high { font-size:.7rem; font-weight:bold; color:#059669; }',
      '.tam-dn-md-med  { font-size:.7rem; font-weight:bold; color:#b45309; }',
      '.tam-dn-md-low  { font-size:.7rem; font-weight:bold; color:#c62828; }',
      /* Motor D button in DN verification */
      '.tam-dnv-btn-motord { border-color:#7c3aed!important; color:#7c3aed!important; }',
      '.tam-dnv-btn-motord:hover { background:#7c3aed!important; color:#fff!important; }',

      /* ── DN Verification area ── */
      '#tam-dn-verify-area { width:100%; max-width:960px; margin-top:16px; }',
      '.tam-dnv-area { display:flex; flex-direction:column; gap:10px; font-family:MontserratLight,sans-serif; }',

      /* Progress bars */
      '.tam-dnv-progress { display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:12px; font-size:.84rem; font-weight:600; }',
      '.tam-dnv-prog-icon { font-size:1.1rem; flex-shrink:0; }',
      '.tam-dnv-prog-text { color:#555; }',
      '.tam-dnv-partial { background:#fffbe6; border:1px solid #ffe082; }',
      '.tam-dnv-partial .tam-dnv-prog-text { color:#7a5a00; }',
      '.tam-dnv-missing { color:#c05000; font-weight:bold; }',
      '.tam-dnv-ok { background:#f0faf0; border:1px solid #a5d6a7; }',
      '.tam-dnv-ok .tam-dnv-prog-text { color:#1b5e20; }',

      /* Diff block */
      '.tam-dnv-block { border:1.5px solid #ffe082; border-radius:14px; overflow:hidden; background:#fff; }',
      '.tam-dnv-block-hdr { padding:10px 16px; background:#fffbe6; font-size:.78rem; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#7a5a00; border-bottom:1px solid #ffe082; }',
      '.tam-dnv-hint { padding:8px 16px; font-size:.78rem; color:#888; border-bottom:1px solid #f5f5f5; background:#fafafa; }',
      '.tam-dnv-scroll { overflow-x:auto; }',
      '.tam-dnv-table { width:100%; border-collapse:collapse; font-size:.83rem; }',
      '.tam-dnv-table thead th { padding:7px 12px; background:#f5f5f5; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; color:#888; border-bottom:1px solid #e6e6e6; white-space:nowrap; }',
      '.tam-dnv-row td { padding:8px 12px; border-bottom:1px solid #f5f5f5; vertical-align:middle; }',
      '.tam-dnv-row:last-child td { border-bottom:none; }',
      '.tam-dnv-ref { font-weight:bold; color:#222; white-space:nowrap; min-width:130px; }',
      '.tam-dnv-num { text-align:center; font-variant-numeric:tabular-nums; font-weight:bold; color:#555; white-space:nowrap; }',
      '.tam-dnv-diff-low  { color:#c62828!important; }',
      '.tam-dnv-diff-high { color:#1565c0!important; }',
      '.tam-dnv-action-cell { padding:6px 12px!important; }',

      /* Action buttons inside table */
      '.tam-dnv-actions { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }',
      '.tam-dnv-btn { padding:4px 11px; font-size:.73rem; font-weight:bold; font-family:MontserratLight,sans-serif; cursor:pointer; border-radius:8px; border:1.5px solid #ccc; background:#f5f5f5; color:#444; transition:background .12s,color .12s; white-space:nowrap; }',
      '.tam-dnv-btn-edit { border-color:#1565c0!important; color:#1565c0!important; }',
      '.tam-dnv-btn-edit:hover { background:#1565c0!important; color:#fff!important; }',
      '.tam-dnv-btn-confirm-dn { border-color:#2e7d32!important; color:#2e7d32!important; }',
      '.tam-dnv-btn-confirm-dn:hover { background:#2e7d32!important; color:#fff!important; }',
      '.tam-dnv-btn-reopen { border-color:#888!important; color:#888!important; font-size:.68rem!important; }',
      '.tam-dnv-btn-reopen:hover { background:#555!important; color:#fff!important; border-color:#555!important; }',

      /* Invoice alert row */
      '.tam-dnv-invoice-alert { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:6px 10px; background:#fff0f0; border:1.5px solid #ef9a9a; border-radius:8px; font-size:.78rem; font-weight:bold; color:#c62828; }',
      '.tam-dne-row-mismatch td { background:#fffbe6!important; }',

      /* DN Edit modal */
      '.tam-dn-edit-modal { position:fixed; inset:0; z-index:10002; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '.tam-dn-edit-modal.tam-dn-visible { opacity:1; pointer-events:auto; }',
      '#tam-dn-edit-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.5); }',
      '#tam-dn-edit-panel { position:relative; z-index:1; width:min(520px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.32); overflow:hidden; transform:translateY(12px); transition:transform .22s ease; }',
      '.tam-dn-edit-modal.tam-dn-visible #tam-dn-edit-panel { transform:translateY(0); }',
      '#tam-dne-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '#tam-dne-title { display:flex; flex-direction:column; gap:2px; }',
      '#tam-dne-zy { font-size:1rem; font-weight:bold; color:#111; font-family:MontserratLight,sans-serif; }',
      '#tam-dne-sub { font-size:.68rem; color:#888; font-family:MontserratLight,sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      '.tam-dne-hint { padding:8px 16px; font-size:.78rem; color:#888; background:#fafafa; border-bottom:1px solid #f0f0f0; flex-shrink:0; }',
      '#tam-dne-scroll { overflow:auto; flex:1; }',
      '#tam-dne-table { width:100%; border-collapse:collapse; font-family:MontserratLight,sans-serif; font-size:.84rem; }',
      '#tam-dne-table thead { position:sticky; top:0; z-index:2; }',
      '.tam-dne-ref { font-weight:bold; color:#222; white-space:nowrap; padding:7px 12px; border-bottom:1px solid #f2f2f2; }',
      '.tam-dne-inv { text-align:center; color:#888; font-weight:bold; padding:7px 12px; border-bottom:1px solid #f2f2f2; }',
      '.tam-dne-qty { text-align:center; padding:5px 10px; border-bottom:1px solid #f2f2f2; }',
      '.tam-dne-inp { width:68px; padding:5px 6px; font-size:.84rem; font-family:MontserratLight,sans-serif; border:1.5px solid #ddd; border-radius:7px; text-align:center; outline:none; transition:border-color .12s; -moz-appearance:textfield; appearance:textfield; }',
      '.tam-dne-inp::-webkit-inner-spin-button,.tam-dne-inp::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }',
      '.tam-dne-inp:focus { border-color:#1565c0; }',
      '#tam-dne-footer { display:flex; align-items:center; gap:10px; padding:12px 20px; border-top:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',

      /* Dark mode DNV */

      /* Dark mode anomaly */

      /* ── Dark mode receção ── */,
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
        '<button class="tam-session-btn tam-close-session-btn" id="tam-close-session-btn" title="guardar e fechar sessão" style="display:none">🔒 fechar</button>' +
        '<div class="tam-sessions-dropdown-wrap">' +
          '<button class="tam-session-btn" id="tam-sessions-btn">📋 sessões ▾</button>' +
          '<div id="tam-sessions-dropdown"></div>' +
        '</div>' +
        '<label class="tam-session-btn" id="tam-dn-load-bar-btn" for="tam-dn-file-input" style="display:none">' +
          '\ud83d\udce6 delivery notes' +
          '<input type="file" id="tam-dn-file-input" accept="application/pdf" multiple style="display:none">' +
        '</label>' +
        '<span id="tam-dn-count" style="display:none;color:#fff;font-weight:700;font-size:.75rem;white-space:nowrap"></span>' +
        '<label class="tam-session-btn" id="tam-dn-cam-bar-btn" for="tam-dn-cam-input" style="display:none">' +
          '\ud83d\udcf7 fotografar caixa' +
          '<input type="file" id="tam-dn-cam-input" accept="image/*" capture="environment" style="display:none">' +
        '</label>';

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

      /* ── Helper: perform actual session close (called after confirmation) ── */
      function tamDoCloseSession() {
        // Save current session first, then close after save completes
        tamSaveSession(false);
        // Reset state
        tamInvoices      = [];
        tamEngineCache   = {};
        tamActiveEngines = {};
        tamSession       = null;
        tamRefCompleting.clear();
        tamRefDone.clear();
        Object.keys(tamRefCompletingTimers).forEach(function(k){ clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k]; });
        Object.keys(tamBoxLockTimers).forEach(function(k){ clearTimeout(tamBoxLockTimers[k]); delete tamBoxLockTimers[k]; });
        tamBoxLockPending = {};
        tamUndoStack = [];
        tamRedoStack = [];
        if (tamAutoSaveTimer) { clearInterval(tamAutoSaveTimer); tamAutoSaveTimer = null; }
        // Clear rendered areas
        ['tam-results-wrap','tam-invoice-meta','tam-validation-banner'].forEach(function(id){
          var el = document.getElementById(id);
          if (el) { el.className = ''; el.innerHTML = ''; }
        });
        var ra = document.getElementById('tam-reception-area');
        if (ra) ra.innerHTML = '';
        var aa = document.getElementById('tam-anomaly-area');
        if (aa) aa.innerHTML = '';
        var dva = document.getElementById('tam-dn-verify-area');
        if (dva) dva.innerHTML = '';
        // Reset session name field and status
        var sn = document.getElementById('tam-session-name');
        if (sn) sn.value = '';
        var ss = document.getElementById('tam-session-status');
        if (ss) ss.textContent = '';
        // Hide buttons that require an active session
        var expBtn = document.getElementById('tam-export-btn');
        if (expBtn) expBtn.classList.remove('show');
        document.getElementById('tam-save-btn').classList.remove('visible');
        closeSessionBtn.style.display = 'none';
        var dnLoadBtn = document.getElementById('tam-dn-load-bar-btn');
        if (dnLoadBtn) dnLoadBtn.style.display = 'none';
        var dnCamBtn = document.getElementById('tam-dn-cam-bar-btn');
        if (dnCamBtn) dnCamBtn.style.display = 'none';
        var dnCount = document.getElementById('tam-dn-count');
        if (dnCount) dnCount.style.display = 'none';
        // Reset upload zone
        var lbl = document.getElementById('upload-label') || document.getElementById('tam-upload-label');
        if (lbl) lbl.classList.remove('loaded');
        document.getElementById('tab-tam').classList.remove('tam-loaded');
        document.getElementById('admin-app').classList.remove('tam-loaded');
        var statusMsg = document.getElementById('tam-status-msg');
        if (statusMsg) statusMsg.textContent = '';
        var fileName = document.getElementById('tam-file-name');
        if (fileName) fileName.textContent = '';
      }

      /* ── Confirmation modal for closing session ── */
      function tamShowCloseConfirmModal() {
        // Remove any existing modal
        var existing = document.getElementById('tam-close-confirm-modal');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'tam-close-confirm-modal';
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'z-index:99999',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'background:rgba(0,0,0,0.35)',
          'backdrop-filter:blur(2px)',
          '-webkit-backdrop-filter:blur(2px)'
        ].join(';');

        var box = document.createElement('div');
        box.style.cssText = [
          'background:#fff',
          'border-radius:16px',
          'padding:32px 28px 24px',
          'max-width:420px',
          'width:calc(100% - 48px)',
          'box-shadow:0 8px 40px rgba(0,0,0,0.18)',
          'display:flex',
          'flex-direction:column',
          'gap:8px',
          'font-family:inherit'
        ].join(';');

        box.innerHTML =
          '<div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#888;text-transform:uppercase;margin-bottom:4px">FECHAR SESSÃO</div>' +
          '<div style="font-size:20px;font-weight:700;color:#111;margin-bottom:4px">Guardar e fechar a sessão activa?</div>' +
          '<div style="font-size:14px;color:#555;margin-bottom:18px">A sessão será guardada. Podes retomar a qualquer momento.</div>' +
          '<button id="tam-close-confirm-yes" style="' +
            'display:flex;align-items:center;justify-content:center;gap:10px;' +
            'padding:14px 20px;border-radius:10px;border:none;cursor:pointer;' +
            'background:#fdf0ef;color:#c0392b;font-size:15px;font-weight:600;' +
            'transition:background .15s;margin-bottom:8px' +
          '">💾 Guardar e fechar</button>' +
          '<button id="tam-close-confirm-no" style="' +
            'display:flex;align-items:center;justify-content:center;' +
            'padding:14px 20px;border-radius:10px;border:1.5px solid #e0e0e0;' +
            'background:#fff;color:#333;font-size:15px;font-weight:500;cursor:pointer;' +
            'transition:background .15s' +
          '">Cancelar</button>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Hover effects
        var yesBtn = box.querySelector('#tam-close-confirm-yes');
        var noBtn  = box.querySelector('#tam-close-confirm-no');
        yesBtn.addEventListener('mouseenter', function(){ this.style.background = '#fad7d4'; });
        yesBtn.addEventListener('mouseleave', function(){ this.style.background = '#fdf0ef'; });
        noBtn.addEventListener('mouseenter',  function(){ this.style.background = '#f5f5f5'; });
        noBtn.addEventListener('mouseleave',  function(){ this.style.background = '#fff'; });

        // Confirm: save + close
        yesBtn.addEventListener('click', function(){
          overlay.remove();
          tamDoCloseSession();
        });

        // Cancel: just close modal
        noBtn.addEventListener('click', function(){
          overlay.remove();
        });

        // Click outside to cancel
        overlay.addEventListener('click', function(e){
          if (e.target === overlay) overlay.remove();
        });

        // Escape key to cancel
        function onKeyDown(e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKeyDown); }
        }
        document.addEventListener('keydown', onKeyDown);
        overlay.addEventListener('remove', function(){ document.removeEventListener('keydown', onKeyDown); });
      }

      var closeSessionBtn = bar.querySelector('#tam-close-session-btn');
      if (closeSessionBtn) closeSessionBtn.addEventListener('click', function(){
        tamShowCloseConfirmModal();
      });

      // Bind sessions button here, not in the separate listener block above
      var sesBtn2 = bar.querySelector('#tam-sessions-btn');
      if (sesBtn2) sesBtn2.addEventListener('click', function(e){
        e.stopPropagation();
        tamOpenSessionsModal();
      });

      // DN buttons listeners
      var dnBarI = bar.querySelector('#tam-dn-file-input');
      if (dnBarI) dnBarI.addEventListener('change', function(e){
        var files = Array.from(e.target.files).filter(function(f){ return f.type==='application/pdf'; });
        if (files.length) tamHandleDeliveryNoteFiles(files);
        e.target.value = '';
      });
      var dnBarC = bar.querySelector('#tam-dn-cam-input');
      if (dnBarC) dnBarC.addEventListener('change', function(e){
        var file = e.target.files[0];
        if (file) tamHandleDNCameraPhoto(file);
        e.target.value = '';
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

    // Anomaly area — injected after reception area
    if (!document.getElementById('tam-anomaly-area')) {
      var aa = document.createElement('div');
      aa.id = 'tam-anomaly-area';
      var recArea = document.getElementById('tam-reception-area');
      if (recArea && recArea.nextSibling) recArea.parentNode.insertBefore(aa, recArea.nextSibling);
      else if (recArea) recArea.parentNode.appendChild(aa);
      else tab.appendChild(aa);
    }
    // DN verification area — injected after anomaly area
    if (!document.getElementById('tam-dn-verify-area')) {
      var dva = document.createElement('div');
      dva.id = 'tam-dn-verify-area';
      var anomArea = document.getElementById('tam-anomaly-area');
      if (anomArea && anomArea.nextSibling) anomArea.parentNode.insertBefore(dva, anomArea.nextSibling);
      else if (anomArea) anomArea.parentNode.appendChild(dva);
      else tab.appendChild(dva);
    }

    // Inject styles immediately — always fresh
    tamEnsureStyles();
  })();

})();
