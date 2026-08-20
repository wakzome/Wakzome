// ══════════════════════════════════════════════════════════════
//  TAM FASHION — invoice parser + receção de mercadoria  v9
//  · v9: Autoguardado fiable (localStorage + Supabase)
//        Biblioteca de referências aprendida automaticamente
//        Sticky ref column fix (background sólido)
// ══════════════════════════════════════════════════════════════
(function () {

  // ── DOM injected by tam.js ──
  function ensureTabShell() {
    if (document.getElementById('tab-tam')) return;
    var adminApp = document.getElementById('admin-app');
    if (!adminApp) return;
    var panel = document.createElement('div');
    panel.id = 'tab-tam';
    panel.className = 'tab-panel';
    panel.innerHTML =
      '<div id="tam-upload-zone">' +
        '<label id="tam-upload-label" for="tam-file-input">' +
          '<span class="upload-icon">\ud83d\udce6</span>' +
          'carregar fatura<br>' +
          '<small style="font-size:.78rem;opacity:.6"></small>' +
        '</label>' +
        '<input type="file" id="tam-file-input" accept="application/pdf">' +
        '<div id="tam-file-name"></div>' +
        '<div id="tam-status-msg"></div>' +
      '</div>' +
      '<div id="tam-invoice-meta"></div>' +
      '<div id="tam-validation-banner"></div>' +
      '<div id="tam-results-wrap"></div>' +
      '<button id="tam-export-btn">\u2b07 exportar excel</button>';
    adminApp.appendChild(panel);
  }
  ensureTabShell();

  // ── Cartão do submenu "faturas" injetado por tam.js ──
  function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-faturas-module="tam"]')) return;
    var grid = document.getElementById('faturas-sub-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-faturas-module', 'tam');
    card.style.animationDelay = '0.10s';
    card.innerHTML = `        <span class="adm-mod-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 8H3l1.5 10.5A2 2 0 0 0 6.48 20h11.04a2 2 0 0 0 1.98-1.5L21 8Z" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
            <path d="M3 8l1.5-4h15L21 8" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 12h6M10 15h4" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <div class="adm-mod-name">TAM</div>
          <div class="adm-mod-desc">faturas TAM Fashion</div>
        </div>
        <div class="adm-mod-arrow">→</div>
      `;
    grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.closeFaturasOverlay === 'function') window.closeFaturasOverlay();
      setTimeout(function () {
        if (typeof window.openModule === 'function') window.openModule('tam');
      }, 200);
    });
  }
  ensureModuleCard();

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
  var tamEditingBoxBi       = -1;         // bi da única caixa com colunas abertas na distribuição geral
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
      box.refs      = {};
      box.locked    = false;
      box.confirmed = false;
      if (tamBoxLockTimers) {
        var bi = tamSession.boxes.indexOf(box);
        if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
        delete tamBoxLockPending[bi];
      }
    });
    tamEditingBoxBi = -1;
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

  /* ── N.º GUIA ERP: ao preencher, colapsa automaticamente a fatura ──────
     Espelha o mecanismo do módulo Processamento: ao introduzir o número
     da guia gerada no ERP, a fatura minimiza-se sozinha, sinalizando
     visualmente que já está processada. Nunca expande automaticamente ao
     apagar o valor — só o utilizador decide reabrir manualmente. ── */
  function tamGuiaErpChange(idx) {
    var input = document.getElementById('tam-inv-guia-erp-' + idx);
    if (!input) return;
    var r = tamInvoices[idx];
    if (r) r.guiaErp = input.value;
    var hasGuia = input.value.trim().length > 0;
    input.classList.toggle('tam-inv-guia-erp-done', hasGuia);
    input.size = hasGuia ? Math.max(input.value.length + 1, 3) : 12;
    if (hasGuia && !tamCollapseState['inv_' + idx]) {
      tamCollapseState['inv_' + idx] = true;
      tamApplyCollapseState();
    }
    tamScheduleSave();
  }


  /* ── Supabase: tabla tam_sessions, bucket/tabla tam_refs ── */
  var TAM_SESSIONS_TABLE = 'tam_sessions';
  var TAM_REFS_TABLE     = 'tam_refs';

  /* Obtener cliente Supabase del sistema (definido en supabase-config.js como sbClient) */
  function tamSB() {
    return (typeof sbAdmin !== "undefined") ? sbAdmin : null;
  }

  /* ══════════════════════════════════════════════════════════════
     SESSION LOCK — reutiliza el SessionLock global (session-lock.js).
     Comparte la tabla 'module_session_locks' discriminando por
     module_name='tam'. Si dos dispositivos abren EXACTAMENTE la misma
     sesión (mismo session_name), el nuevo expulsa al anterior, que
     guarda y vuelve al dashboard.
  ══════════════════════════════════════════════════════════════ */
  var _tamLock      = null;
  var _tamLockedKey = null;

  function tamGetLock() {
    if (!_tamLock && typeof SessionLock !== 'undefined') {
      var sb = tamSB();
      if (sb) _tamLock = SessionLock.create('tam', sb);
    }
    return _tamLock;
  }

  /* Desalojo: otro dispositivo abrió la misma sesión. Reutiliza el
     camino real de cierre (botão voltar): guarda, cierra y vuelve al
     dashboard. El toast lo muestra el propio SessionLock. */
  function tamLockOnEvicted() {
    _tamLockedKey = null;
    var backBtn = document.getElementById('adm-back-btn');
    if (backBtn) backBtn.click();
  }

  /* Sincroniza el lock con la sesión activa. Idempotente: no re-adquiere
     la misma sesión; si se cambió de sesión, libera la anterior primero. */
  function tamLockSync() {
    var name = (tamSession && tamSession.name) ? tamSession.name : null;
    if (!name) return;
    var lock = tamGetLock();
    if (!lock) return;
    if (_tamLockedKey === name) return;
    if (_tamLockedKey) { try { lock.release(); } catch (e) {} }
    _tamLockedKey = name;
    lock.acquire(name, tamLockOnEvicted);
  }

  /* Libera el lock (cierre normal de sesión). */
  function tamLockRelease() {
    _tamLockedKey = null;
    var lock = tamGetLock();
    if (lock) { try { lock.release(); } catch (e) {} }
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
      var cost = payload.mode === 'photo' ? 0.004 : payload.mode === 'invoice' ? 0.014 : payload.mode === 'excel_dn' ? 0.008 : 0.006;
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
        grandTotal:        tamRound2(totalCost + shipPerPiece * pieces),
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
        result.dnList = tamExtractDNListFromRows(allRows, result.invoiceNo || null);

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

        if (allAlreadyIn) {
          tamShowDNError('Fatura' + (parsed.length > 1 ? 's' : '') + ' já carregada' + (parsed.length > 1 ? 's' : '') + ' nesta sessão: ' + parsed.map(function(r){ return r.invoiceNo; }).join(', ') + '.');
          return;
        }

        /* Mixed: filter out duplicates and warn */
        var dups = parsed.filter(function(r){ return existingNos.indexOf(r.invoiceNo) >= 0; });
        if (dups.length) {
          tamShowDNError(dups.length + ' fatura' + (dups.length > 1 ? 's' : '') + ' ignorada' + (dups.length > 1 ? 's' : '') + ' — já carregada' + (dups.length > 1 ? 's' : '') + ' na sessão: ' + dups.map(function(r){ return r.invoiceNo; }).join(', ') + '.');
        }
        parsed = parsed.filter(function(r){ return existingNos.indexOf(r.invoiceNo) < 0; });
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

  /* ── Upload de nota de crédito para uma fatura específica ──
     Associação é sempre explícita (botão dentro do cartão da fatura,
     nunca automática/global) — mas ainda assim validamos o
     "Re-Nr./Invoic No." contra o número da fatura antes de aplicar,
     para não deixar anexar um documento ao destino errado. */
  async function tamHandleCreditNoteFile(invIdx, file) {
    var r = tamInvoices[invIdx];
    if (!r) return;
    try {
      var buf = await file.arrayBuffer();
      var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      var allRows = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        var page = await pdf.getPage(p);
        allRows.push.apply(allRows, tamGroupByRows((await page.getTextContent()).items));
      }
      var cn = tamParseCreditNote(allRows);
      cn.fileName = file.name;

      if (!cn.lines.length) {
        tamShowDNError('Não foi possível reconhecer artigos na nota de crédito "' + file.name + '".');
        return;
      }

      var invoiceBareNo = String(r.invoiceNo || '').replace(/^ZY-/i, '');
      if (cn.invoiceRefNos.indexOf(invoiceBareNo) < 0) {
        tamShowDNError('A nota de crédito ' + (cn.creditNo || file.name) + ' refere-se à fatura Re-Nr. ' +
          (cn.invoiceRefNos.join(', ') || '—') + ', que não corresponde a esta fatura (' + r.invoiceNo + '). Nada foi aplicado.');
        return;
      }

      var already = (r.creditNotes || []).some(function(x){ return x.creditNo === cn.creditNo; });
      if (already) {
        tamShowDNError('A nota de crédito ' + (cn.creditNo || file.name) + ' já está anexada a esta fatura.');
        return;
      }

      var warnings = tamApplyCreditNoteToInvoice(r, cn);
      tamRenderAll();
      tamScheduleSave();
      if (warnings.length) {
        tamShowDNError('Nota de crédito ' + (cn.creditNo || file.name) + ' aplicada com avisos: ' + warnings.join(' '));
      }
    } catch (err) {
      console.error('tamHandleCreditNoteFile', err);
      tamShowDNError('Erro ao processar a nota de crédito: ' + err.message);
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
                   shipPerPiece: r.shipPerPiece, _externalShipping: r._externalShipping || null,
                   creditNotes: r.creditNotes || [] };
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
    var baseStatus = tamInvoices.length + ' fatura(s) · ' + totalRefs + ' referências · ' + totalPieces + ' unidades';
    var boxSuffix = '';
    if (tamSession && tamSession.boxes.length > 0) {
      var qd0 = tamSession.quickDistrib || {};
      var vBoxes = tamSession.boxes.map(function(box, bi){ return { box:box, bi:bi }; })
        .filter(function(item){ return !(item.box.invIdx !== undefined && qd0[item.box.invIdx] !== undefined); });
      if (vBoxes.some(function(item){ return !!item.box.total; })) {
        var cBoxes = vBoxes.filter(function(item){
          if (!item.box.total) return false;
          var r = 0;
          Object.keys(item.box.refs || {}).forEach(function(ref){ r += (item.box.refs[ref].f||0)+(item.box.refs[ref].p||0); });
          return r >= item.box.total && !tamBoxLockPending[item.bi];
        }).length;
        boxSuffix = ' · ' + cBoxes + '/' + vBoxes.length + ' cajas';
      }
    }
    statusMsgEl.textContent = baseStatus + boxSuffix;
    statusMsgEl.style.setProperty('font-weight', 'bold', 'important');
    statusMsgEl.style.setProperty('font-size', '1rem', 'important');
    document.getElementById('tam-file-name').textContent =
      tamInvoices.map(function(r){ var m = r._fileName.match(/ZY-\d+/i); return m ? m[0] : r._fileName.replace(/\.pdf$/i, ''); }).join(' · ');

    tamRenderInvoices();
    tamRenderReception();
    tamRenderDNVerification();
    tamRenderProgress();
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
      meta.style.display = 'none';
      ban.style.display  = 'none';

      var r0   = tamInvoices[0];
      var block0 = document.createElement('div');
      block0.className = 'tam-invoice-block';
      block0.id = 'tam-invoice-block-0';

      var hdr0 = document.createElement('div');
      hdr0.className = 'tam-invoice-block-header tam-inv-color-0';
      hdr0.innerHTML =
        '<div class="tam-inv-hdr-row1">' +
          '<button class="tam-inv-toggle-btn" data-inv="0" title="expandir / minimizar">&#9660;</button>' +
          '<span class="tam-inv-num">' + tamEsc(r0.invoiceNo) + '</span>' +
          '<button class="tam-inv-remove-btn" data-inv="0" title="remover fatura da sessão">✕</button>' +
        '</div>' +
        '<div class="tam-inv-hdr-row2">' +
          '<span class="tam-inv-meta tam-inv-meta-date">' + tamEsc(r0.invoiceDate) + '</span>' +
          '<span class="tam-inv-meta tam-inv-meta-rest"> · ' +
          r0.grouped.length + ' refs · ' + r0.totalPieces + ' un · ' +
          r0.shipPkgs + ' pac.</span>' +
        '</div>' +
        '<div class="tam-inv-hdr-row3">' +
          '<span class="tam-inv-total">' + tamFmtEU(r0.grandTotal) + ' €</span>' +
        '</div>' +
        '<div class="tam-inv-hdr-btns">' +
          '<div class="tam-inv-guia-erp-wrap">' +
            '<span class="tam-inv-guia-erp-label">N.º Guia ERP</span>' +
            '<input type="text" class="tam-inv-guia-erp-input' + (r0.guiaErp ? ' tam-inv-guia-erp-done' : '') + '" ' +
              'id="tam-inv-guia-erp-0" data-inv="0" placeholder="ex: 2025/001" autocomplete="off" size="' + (r0.guiaErp ? Math.max(String(r0.guiaErp).length + 1, 3) : 12) + '" value="' + tamEsc(r0.guiaErp || '') + '">' +
          '</div>' +
          '<button class="tam-inv-edit-btn' + (tamEditMode[0] ? ' active' : '') + '" data-inv="0">' +
            (tamEditMode[0] ? 'fechar edição' : 'editar') +
          '</button>' +
          '<button class="tam-inv-stock-btn" data-inv="0">ingreso de stock</button>' +
          '<button class="tam-inv-guia-btn" data-inv="0">guía</button>' +
          '<button class="tam-inv-export-btn" data-inv="0">exportar</button>' +
          '<button class="tam-inv-credit-btn" data-inv="0">nota de crédito</button>' +
          '<input type="file" accept="application/pdf" class="tam-inv-credit-input" data-inv="0" style="display:none">' +
        '</div>';

      block0.appendChild(hdr0);

      hdr0.querySelector('.tam-inv-toggle-btn').addEventListener('click', function(){
        tamCollapseState['inv_0'] = !tamCollapseState['inv_0'];
        tamApplyCollapseState();
      });
      hdr0.querySelector('.tam-inv-guia-erp-input').addEventListener('input', function(){ tamGuiaErpChange(0); });
      hdr0.querySelector('.tam-inv-edit-btn').addEventListener('click', function(){ tamToggleEditMode(0); });
      hdr0.querySelector('.tam-inv-export-btn').addEventListener('click', function(){ tamExportInvoiceCSV(tamInvoices[0]); });
      hdr0.querySelector('.tam-inv-stock-btn').addEventListener('click', function(){ tamShowStockModal(0); });
      hdr0.querySelector('.tam-inv-guia-btn').addEventListener('click', function(){ tamShowGuiaModal(0); });
      hdr0.querySelector('.tam-inv-remove-btn').addEventListener('click', function(){ tamConfirmRemoveInvoice(0); });
      var creditInput0 = hdr0.querySelector('.tam-inv-credit-input');
      hdr0.querySelector('.tam-inv-credit-btn').addEventListener('click', function(){ creditInput0.click(); });
      creditInput0.addEventListener('change', function(){
        if (creditInput0.files && creditInput0.files[0]) {
          tamHandleCreditNoteFile(0, creditInput0.files[0]);
          creditInput0.value = '';
        }
      });

      var banEl0 = document.createElement('div');
      banEl0.className = 'tam-inv-banner';
      tamRenderInvoiceBanner(r0, banEl0);
      block0.appendChild(banEl0);

      var creditEl0 = document.createElement('div');
      tamRenderCreditNotesBlock(r0, creditEl0, 0);
      block0.appendChild(creditEl0);

      var tWrap0 = document.createElement('div');
      tWrap0.className = 'tam-inv-table-wrap';
      block0.appendChild(tWrap0);
      wrap.appendChild(block0);

      if (tamEditMode[0]) {
        tamRenderEditTable(r0, tWrap0, 0);
      } else {
        tamRenderInvoiceTable(r0, tWrap0, 0);
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

        hdr.innerHTML =
          '<div class="tam-inv-hdr-row1">' +
            '<button class="tam-inv-toggle-btn" data-inv="' + idx + '" title="expandir / minimizar">&#9660;</button>' +
            '<span class="tam-inv-num">' + tamEsc(r.invoiceNo) + '</span>' +
            '<button class="tam-inv-remove-btn" data-inv="' + idx + '" title="remover fatura da sessão">✕</button>' +
          '</div>' +
          '<div class="tam-inv-hdr-row2">' +
            '<span class="tam-inv-meta tam-inv-meta-date">' + tamEsc(r.invoiceDate) + '</span>' +
            '<span class="tam-inv-meta tam-inv-meta-rest"> · ' +
            r.grouped.length + ' refs · ' + r.totalPieces + ' un · ' +
            r.shipPkgs + ' pac.</span>' +
          '</div>' +
          '<div class="tam-inv-hdr-row3">' +
            '<span class="tam-inv-total">' + tamFmtEU(r.grandTotal) + ' €</span>' +
          '</div>' +
          '<div class="tam-inv-hdr-btns">' +
            '<div class="tam-inv-guia-erp-wrap">' +
              '<span class="tam-inv-guia-erp-label">N.º Guia ERP</span>' +
              '<input type="text" class="tam-inv-guia-erp-input' + (r.guiaErp ? ' tam-inv-guia-erp-done' : '') + '" ' +
                'id="tam-inv-guia-erp-' + idx + '" data-inv="' + idx + '" placeholder="ex: 2025/001" autocomplete="off" size="' + (r.guiaErp ? Math.max(String(r.guiaErp).length + 1, 3) : 12) + '" value="' + tamEsc(r.guiaErp || '') + '">' +
            '</div>' +
            '<button class="tam-inv-edit-btn' + (tamEditMode[idx] ? ' active' : '') + '" data-inv="' + idx + '">' +
              (tamEditMode[idx] ? 'fechar edição' : 'editar') +
            '</button>' +
            '<button class="tam-inv-stock-btn" data-inv="' + idx + '">ingreso de stock</button>' +
            '<button class="tam-inv-guia-btn" data-inv="' + idx + '">guía</button>' +
            '<button class="tam-inv-export-btn" data-inv="' + idx + '">exportar</button>' +
            '<button class="tam-inv-credit-btn" data-inv="' + idx + '">nota de crédito</button>' +
            '<input type="file" accept="application/pdf" class="tam-inv-credit-input" data-inv="' + idx + '" style="display:none">' +
          '</div>';
        block.appendChild(hdr);
        hdr.querySelector('.tam-inv-toggle-btn').addEventListener('click', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-toggle-btn').getAttribute('data-inv'));
          tamCollapseState['inv_' + i] = !tamCollapseState['inv_' + i];
          tamApplyCollapseState();
        });
        hdr.querySelector('.tam-inv-guia-erp-input').addEventListener('input', function(){
          var i = parseInt(hdr.querySelector('.tam-inv-guia-erp-input').getAttribute('data-inv'));
          tamGuiaErpChange(i);
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
        (function(){
          var creditInput = hdr.querySelector('.tam-inv-credit-input');
          hdr.querySelector('.tam-inv-credit-btn').addEventListener('click', function(){ creditInput.click(); });
          creditInput.addEventListener('change', function(){
            var i = parseInt(creditInput.getAttribute('data-inv'));
            if (creditInput.files && creditInput.files[0]) {
              tamHandleCreditNoteFile(i, creditInput.files[0]);
              creditInput.value = '';
            }
          });
        })();

        // ── Validation banner per invoice ──────────────────
        var banEl = document.createElement('div');
        banEl.className = 'tam-inv-banner';
        tamRenderInvoiceBanner(r, banEl);
        block.appendChild(banEl);

        // ── Notas de crédito anexadas ───────────────────────
        var creditEl = document.createElement('div');
        tamRenderCreditNotesBlock(r, creditEl, idx);
        block.appendChild(creditEl);

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

  /* ══════════════════════════════════════════════════════════════
     NOTAS DE CRÉDITO — aplicação/remoção (reversível)
     r.grouped guarda sempre o valor billed corrente (já líquido de
     créditos aplicados). Cada linha da nota grava se foi aplicada
     (line.applied) para que a remoção só reverta o que foi de facto
     debitado — protege contra dados inconsistentes (ref inexistente
     na fatura, ou crédito maior do que o saldo restante).
  ══════════════════════════════════════════════════════════════ */
  function tamRecalcInvoiceAfterCredit(r) {
    r.totalPieces   = r.grouped.reduce(function(s,g){ return s + g.pieces; }, 0);
    r.subtotalGoods = tamRound2(r.grouped.reduce(function(s,g){ return s + g.totalCost; }, 0));
    var shipPerPiece = r.totalPieces > 0 ? r.shipping / r.totalPieces : 0;
    r.grouped.forEach(function(g){
      var base = g.pieces > 0 ? g.totalCost / g.pieces : 0;
      g.unitPriceWithShip = tamRound2(base + shipPerPiece);
      g.grandTotal        = tamRound2(g.totalCost + shipPerPiece * g.pieces);
    });
    r.shipPerPiece = tamRound2(shipPerPiece);
    r.grandTotal   = tamRound2(r.subtotalGoods + (r.shipping || 0));
  }

  function tamApplyCreditNoteToInvoice(r, cn) {
    var warnings = [];
    cn.lines.forEach(function(line){
      var g = r.grouped.find(function(x){ return x.ref === line.ref; });
      if (!g) {
        line.applied = false;
        warnings.push('referência ' + line.ref + ' não encontrada nesta fatura — linha ignorada.');
        return;
      }
      if (line.pieces > g.pieces + 1e-6) {
        line.applied = false;
        warnings.push('referência ' + line.ref + ': a nota credita ' + line.pieces + ' un, mas restam apenas ' + g.pieces + ' un nesta fatura — linha ignorada.');
        return;
      }
      g.pieces         = tamRound2(g.pieces - line.pieces);
      g.totalCost       = tamRound2(g.totalCost - line.total);
      g.creditedPieces  = tamRound2((g.creditedPieces || 0) + line.pieces);
      g.creditedTotal   = tamRound2((g.creditedTotal  || 0) + line.total);
      g.hasCredit        = true;
      line.applied = true;
    });
    r.shipping = tamRound2(Math.max(0, (r.shipping || 0) - (cn.shipping || 0)));
    tamRecalcInvoiceAfterCredit(r);
    cn.warnings = warnings;
    r.creditNotes = r.creditNotes || [];
    r.creditNotes.push(cn);
    return warnings;
  }

  function tamRemoveCreditNote(invIdx, creditNo) {
    var r = tamInvoices[invIdx];
    if (!r || !r.creditNotes) return;
    var pos = -1;
    for (var i = 0; i < r.creditNotes.length; i++) {
      if (r.creditNotes[i].creditNo === creditNo) { pos = i; break; }
    }
    if (pos < 0) return;
    var cn = r.creditNotes[pos];
    cn.lines.forEach(function(line){
      if (!line.applied) return;
      var g = r.grouped.find(function(x){ return x.ref === line.ref; });
      if (!g) return;
      g.pieces          = tamRound2(g.pieces + line.pieces);
      g.totalCost        = tamRound2(g.totalCost + line.total);
      g.creditedPieces   = tamRound2((g.creditedPieces || 0) - line.pieces);
      g.creditedTotal    = tamRound2((g.creditedTotal  || 0) - line.total);
      if (g.creditedPieces <= 0.004) { g.hasCredit = false; g.creditedPieces = 0; g.creditedTotal = 0; }
    });
    r.shipping = tamRound2((r.shipping || 0) + (cn.shipping || 0));
    r.creditNotes.splice(pos, 1);
    tamRecalcInvoiceAfterCredit(r);
    tamRenderAll();
    tamScheduleSave();
  }

  function tamConfirmRemoveCreditNote(invIdx, creditNo) {
    var r = tamInvoices[invIdx];
    if (!r) return;
    var cn = (r.creditNotes || []).find(function(x){ return x.creditNo === creditNo; });
    var dialog = document.createElement('div');
    dialog.id = 'tam-session-dialog';
    dialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">remover nota de crédito</div>' +
        '<div class="tam-dialog-body">' +
          'Remover a nota de crédito <strong>' + tamEsc(creditNo || '') + '</strong>?<br>' +
          '<small style="color:#888">As peças e o valor creditados voltam a ser contabilizados nesta fatura.</small>' +
        '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-new">🗑 sim, remover</button>' +
          '<button class="tam-dialog-btn tam-dialog-btn-add">cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.tam-dialog-btn-new').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
      tamRemoveCreditNote(invIdx, creditNo);
    });
    dialog.querySelector('.tam-dialog-btn-add').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
    });
  }

  function tamRenderCreditNotesBlock(r, el, invIdx) {
    if (!r.creditNotes || !r.creditNotes.length) { el.innerHTML = ''; el.className = ''; return; }
    el.className = 'tam-credit-block';
    el.innerHTML = r.creditNotes.map(function(cn){
      var warnHtml = (cn.warnings && cn.warnings.length)
        ? '<span class="tam-credit-warn" title="' + tamEsc(cn.warnings.join(' ')) + '">⚠</span>' : '';
      return (
        '<div class="tam-credit-row">' +
          '<span class="tam-credit-icon">↩</span>' +
          '<span class="tam-credit-num">' + tamEsc(cn.creditNo || cn.fileName || '—') + '</span>' +
          '<span class="tam-credit-date">' + tamEsc(cn.creditDate || '') + '</span>' +
          '<span class="tam-credit-amt">−' + cn.totalPieces + ' un · −' + tamFmtEU(cn.grandTotal) + ' €</span>' +
          warnHtml +
          '<button class="tam-credit-remove-btn" data-inv="' + invIdx + '" data-credit="' + tamEsc(cn.creditNo || '') + '" title="remover nota de crédito">✕</button>' +
        '</div>'
      );
    }).join('');
    el.querySelectorAll('.tam-credit-remove-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        tamConfirmRemoveCreditNote(parseInt(btn.getAttribute('data-inv')), btn.getAttribute('data-credit'));
      });
    });
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
      '<thead>' +
      '<tr>' +
        '<th class="tam-th">#</th>' +
        '<th class="tam-th">referência</th>' +
        '<th class="tam-th">tipo · nome</th>' +
        '<th class="tam-th">UND</th>' +
        '<th class="tam-th">P.Unit/T</th>' +
        '<th class="tam-th">Total</th>' +
        '<th class="tam-th tam-th-funchal">FNC</th>' +
        '<th class="tam-th tam-th-porto">PS</th>' +
        (showAnomalyCol ? '<th class="tam-th tam-th-anomaly">±</th>' : '') +
      '</tr></thead><tbody>';

    r.grouped.forEach(function(g, i){
      var conf     = g.confidence || 'CONFIRMED';
      var typeNome = (g.garmentType||'') + (g.garmentType && g.name ? ' · ' : '') + (g.name||'—');
      var badge    = conf === 'CONFLICT' ? '<span class="tam-badge tam-badge-conflict">⚠</span>' : conf === 'MOTOR_D' ? '<span class="tam-badge tam-badge-motord" title="Resolvido pelo Motor D">🤖</span>' : '';
      var discBadge = g.hasDiscount ? '<span class="tam-badge tam-badge-discount" title="desconto direto detetado na fatura: ' + tamFmtEU(g.grossUnitPrice) + ' € → ' + tamFmtEU(g.grossUnitPrice - g.discountPerUnit) + ' €/un (−' + tamFmtEU(g.discountPerUnit) + ' €/un)">% desc.</span>' : '';
      var creditBadge = g.hasCredit ? '<span class="tam-badge tam-badge-credit" title="nota de crédito aplicada: −' + g.creditedPieces + ' un / −' + tamFmtEU(g.creditedTotal) + ' €">↩ crédito</span>' : '';

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
        '<td class="tam-td"><strong>' + tamEsc(g.ref) + '</strong>' + badge + discBadge + creditBadge + '</td>' +
        '<td class="tam-td">' + tamEsc(typeNome) + '</td>' +
        '<td class="tam-td tam-td-num">' + g.pieces + '</td>' +
        '<td class="tam-td tam-td-num">' + tamFmtEU(g.unitPriceWithShip) + '</td>' +
        '<td class="tam-td tam-td-num"><strong>' + tamFmtEU(g.grandTotal) + '</strong></td>' +
        '<td class="tam-td tam-td-num tam-cell-funchal" data-inv="' + invIdx + '" data-ref="' + tamEsc(g.ref) + '" data-pieces="' + g.pieces + '" data-city="f">' + (fVal > 0 ? fVal : '—') + '</td>' +
        '<td class="tam-td tam-td-num tam-cell-porto"   data-inv="' + invIdx + '" data-ref="' + tamEsc(g.ref) + '" data-pieces="' + g.pieces + '" data-city="p">' + (pVal > 0 ? pVal : '—') + '</td>' +
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

    container.querySelectorAll('.tam-cell-funchal[data-ref], .tam-cell-porto[data-ref]').forEach(function(cell) {
      cell.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        var invI   = parseInt(cell.getAttribute('data-inv'));
        var ref    = cell.getAttribute('data-ref');
        var pieces = parseInt(cell.getAttribute('data-pieces'));
        var city   = cell.getAttribute('data-city');
        var d      = tamGetRefDistribForInvoice(ref, invI);
        var currVal = city === 'f' ? (d.f || 0) : (d.p || 0);

        var inp = document.createElement('input');
        inp.type = 'number'; inp.min = '0'; inp.max = String(pieces);
        inp.value = currVal > 0 ? currVal : '';
        inp.style.cssText = 'width:46px;border:1.5px solid #111;border-radius:4px;padding:2px 4px;font-size:.75rem;text-align:center;font-family:\'MontserratLight\',sans-serif;outline:none;';
        cell.innerHTML = '';
        cell.appendChild(inp);
        inp.focus(); inp.select();

        function applyEdit() {
          var v    = Math.max(0, Math.min(parseInt(inp.value) || 0, pieces));
          var newF = city === 'f' ? v : Math.max(0, pieces - v);
          var newP = city === 'p' ? v : Math.max(0, pieces - v);
          if (newF + newP > pieces) newP = pieces - newF;
          tamPushUndo();
          var invBoxes = tamSession.boxes.filter(function(box){ return box.invIdx === invI; });
          tamDistribToBoxesFiltered(ref, pieces, newF, newP, invBoxes);
          tamDetectRefCompletions();
          invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
          tamRenderAll();
          tamSaveSession(false);
        }

        inp.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter')  { applyEdit(); ev.preventDefault(); }
          if (ev.key === 'Escape') { tamRenderAll(); }
        });
        inp.addEventListener('blur', applyEdit);
      });
    });
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

  /* Distribuir F/P de un ref para uma fatura.

     Reglas de atribución (sólo afecta a la distribución MANUAL):
     · Cajas confirmadas por delivery note (box.dnZyCode): autoritativas — se
       atribuyen estrictamente por su box.invIdx. El flujo de DN no se altera.
     · Cajas MANUALES (sin dnZyCode): su invIdx es posicional/arbitrario porque al
       abrir la caja no se sabe a qué factura pertenece. Por eso su contenido NO se
       atribuye por caja, sino que se reparte entre las facturas que realmente deben
       esa referencia, llenando cada una hasta lo que debe (descontando lo que ya
       cubre la DN) y desbordando a la siguiente. Así, "10 + 10" siempre queda
       10 en una factura y 10 en la otra, se metan las piezas como se metan. */
  function tamGetRefDistribForInvoice(ref, invIdx) {
    if (!tamSession) return { f: 0, p: 0 };

    // 1. Separar contenido DN (por factura) del contenido manual (global).
    var dnF = {}, dnP = {};
    var manualF = 0, manualP = 0;
    tamSession.boxes.forEach(function(box){
      var cell = box.refs[ref];
      if (!cell) return;
      var f = cell.f || 0, p = cell.p || 0;
      if (f === 0 && p === 0) return;
      if (box.dnZyCode) {
        dnF[box.invIdx] = (dnF[box.invIdx] || 0) + f;
        dnP[box.invIdx] = (dnP[box.invIdx] || 0) + p;
      } else {
        manualF += f;
        manualP += p;
      }
    });

    // 2. Facturas que facturan esta referencia, en orden, con lo que deben.
    var billing = [];
    tamInvoices.forEach(function(r, i){
      var owed = 0;
      r.grouped.forEach(function(g){ if (g.ref === ref) owed += g.pieces; });
      if (owed > 0) billing.push({ invIdx: i, owed: owed });
    });
    if (!billing.length) {
      // Referencia sin factura asociada: devolver lo que haya por caja DN.
      return { f: (dnF[invIdx] || 0), p: (dnP[invIdx] || 0) };
    }

    // 3. Repartir el total manual por deuda restante (llenar y desbordar).
    var allocTotal = {}, allocF = {};
    var remTotal = manualF + manualP;
    billing.forEach(function(b, idx){
      var isLast    = (idx === billing.length - 1);
      var dnCovered = (dnF[b.invIdx] || 0) + (dnP[b.invIdx] || 0);
      var room      = Math.max(0, b.owed - dnCovered);
      var take      = isLast ? remTotal : Math.min(remTotal, room);
      if (take < 0) take = 0;
      allocTotal[b.invIdx] = take;
      remTotal -= take;
    });
    // Split F/P: se asigna F primero (preserva los totales de ciudad globales).
    var fRem = manualF;
    billing.forEach(function(b){
      var t = allocTotal[b.invIdx] || 0;
      var f = Math.min(t, fRem);
      allocF[b.invIdx] = f;
      fRem -= f;
    });

    // 4. Resultado = porción DN (por invIdx) + porción manual asignada.
    var totalForInv = (dnF[invIdx] || 0) + (dnP[invIdx] || 0) + (allocTotal[invIdx] || 0);
    var fForInv     = (dnF[invIdx] || 0) + (allocF[invIdx] || 0);
    return { f: fForInv, p: totalForInv - fForInv };
  }

  /* ══════════════════════════════════════════════════════════════
     VÍNCULO MANUAL CAIXA → DN (quando o PDF/foto da DN não está
     disponível, mas o código da DN é conhecido no papel físico).
     Estampar box.dnZyCode + box.invIdx torna essa caixa autoritativa
     em tamGetRefDistribForInvoice, tirando-a do pool "manual" que é
     repartido por ordem de chegada das facturas.
  ══════════════════════════════════════════════════════════════ */

  /* DNs declaradas nas facturas (inv.dnList) que ainda não estão
     vinculadas a nenhuma caixa da sessão, agrupadas por factura. */
  function tamGetPendingDNsGrouped() {
    if (!tamSession) return [];
    var usedCodes = {};
    tamSession.boxes.forEach(function(b){ if (b.dnZyCode) usedCodes[b.dnZyCode] = true; });
    var groups = [];
    tamInvoices.forEach(function(inv, invIdx){
      var pending = (inv.dnList || []).filter(function(zy){ return !usedCodes[zy]; });
      if (pending.length) groups.push({ invIdx: invIdx, invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate, codes: pending });
    });
    return groups;
  }

  /* Vincula uma caixa a uma DN conhecida apenas pelo código. Não mexe
     em refs/total — só estampa o roteamento para essa factura. */
  function tamLinkBoxToDN(bi, zyCode, invIdx) {
    if (!tamSession) return;
    var box = tamSession.boxes[bi];
    if (!box) return;
    tamPushUndo();
    box.dnZyCode = zyCode;
    box.invIdx   = invIdx;
    tamRenderAll();
    tamScheduleSave();
  }

  /* Remove o vínculo manual (só disponível quando não há DN digital por
     trás — ver isManualLink em tamRenderReception). A caixa volta a
     "Caixa N" posicional; tamRepairBoxInvIdx a reencaixa no próximo render. */
  function tamUnlinkBoxDN(bi) {
    if (!tamSession) return;
    var box = tamSession.boxes[bi];
    if (!box || !box.dnZyCode) return;
    tamPushUndo();
    delete box.dnZyCode;
    tamRenderAll();
    tamScheduleSave();
  }

  /* Popover singleton — lista as DNs pendentes para vincular a uma caixa. */
  function tamShowDNLinkPopover(bi, anchorEl) {
    var old = document.getElementById('tam-dn-link-popover');
    if (old) old.parentNode.removeChild(old);

    var groups = tamGetPendingDNsGrouped();
    var bodyHtml = !groups.length
      ? '<div class="tam-dnlink-empty">Não há DNs pendentes por vincular.</div>'
      : groups.map(function(g){
          return '<div class="tam-dnlink-group">' +
            '<div class="tam-dnlink-group-hdr">' + tamEsc(g.invoiceNo) + '</div>' +
            g.codes.map(function(zy){
              return '<button type="button" class="tam-dnlink-opt" data-zy="' + tamEsc(zy) +
                '" data-inv="' + g.invIdx + '">' + tamEsc(zy) + '</button>';
            }).join('') +
          '</div>';
        }).join('');

    var pop = document.createElement('div');
    pop.id = 'tam-dn-link-popover';
    pop.innerHTML =
      '<div class="tam-dnlink-title">Vincular caixa a DN pendente</div>' +
      (groups.length ? '<input type="text" inputmode="numeric" autocomplete="off" id="tam-dnlink-filter" class="tam-dnlink-filter" placeholder="\uD83D\uDD0D filtrar por c\u00f3digo\u2026">' : '') +
      '<div class="tam-dnlink-list">' + bodyHtml + '</div>' +
      '<button type="button" class="tam-dnlink-cancel" id="tam-dnlink-cancel">cancelar</button>';
    document.body.appendChild(pop);

    var dnFilterInp = pop.querySelector('#tam-dnlink-filter');
    if (dnFilterInp) {
      dnFilterInp.addEventListener('input', function(){
        var q = dnFilterInp.value.trim().toLowerCase();
        pop.querySelectorAll('.tam-dnlink-group').forEach(function(grp){
          var anyVisible = false;
          grp.querySelectorAll('.tam-dnlink-opt').forEach(function(optBtn){
            var match = !q || optBtn.getAttribute('data-zy').toLowerCase().indexOf(q) >= 0;
            optBtn.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
          });
          grp.style.display = anyVisible ? '' : 'none';
        });
      });
    }

    function closePop() {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
      document.removeEventListener('click', onOutsideClick, true);
    }
    function onOutsideClick(e) {
      if (pop.contains(e.target) || e.target === anchorEl) return;
      closePop();
    }

    pop.querySelectorAll('.tam-dnlink-opt').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var zy     = btn.getAttribute('data-zy');
        var invIdx = parseInt(btn.getAttribute('data-inv'));
        closePop();
        tamLinkBoxToDN(bi, zy, invIdx);
      });
    });
    pop.querySelector('#tam-dnlink-cancel').addEventListener('click', function(e){
      e.stopPropagation();
      closePop();
    });

    pop.style.visibility = 'hidden';
    pop.classList.add('tam-dnlink-visible');
    requestAnimationFrame(function(){
      var rect    = anchorEl.getBoundingClientRect();
      var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      var scrollY = window.pageYOffset || document.documentElement.scrollTop;
      var popW = pop.offsetWidth, popH = pop.offsetHeight;
      var left = rect.left + scrollX;
      var top  = rect.bottom + scrollY + 6;
      var maxLeft = scrollX + window.innerWidth - popW - 12;
      if (left > maxLeft) left = maxLeft;
      if (left < scrollX + 8) left = scrollX + 8;
      if (top + popH > scrollY + window.innerHeight - 8) top = rect.top + scrollY - popH - 6;
      pop.style.left = left + 'px';
      pop.style.top  = top  + 'px';
      pop.style.visibility = '';
      if (dnFilterInp) dnFilterInp.focus();
    });

    setTimeout(function(){ document.addEventListener('click', onOutsideClick, true); }, 0);
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

    /* ── Painel lateral: uma única lista de caixas (ordem de receção).
       Confirmar NÃO move nem separa a caixa — só marca um ✓ no item.
       Só a caixa em tamEditingBoxBi mostra colunas na distribuição geral. */
    var openEntry = null;
    for (var _oi=0; _oi<boxOrder.length; _oi++) { if (boxOrder[_oi].bi === tamEditingBoxBi) { openEntry = boxOrder[_oi]; break; } }
    if (!openEntry || openEntry.box.confirmed) { tamEditingBoxBi = -1; openEntry = null; }
    var sortedBoxes = openEntry ? [openEntry] : [];

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
      var isActiveBox    = !bObj.isComplete;   // every pending box is "active" — user chooses which to fill
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
      var box  = bObj.box;
      var dnCode = box.dnZyCode || null;
      // Vincular/desvincular é independente de já ter distribuição, de
      // estar bloqueada, ou de a DN ter (ou não) PDF digital por trás —
      // não altera box.refs, só a atribuição por factura.
      var canLink  = !dnCode;
      var boxLabel = dnCode
        ? dnCode
        : ('Caixa ' + (bi+1));
      var colSpan = info.isActiveBox ? 3 : 2;

      var labelHtml;
      if (canLink) {
        labelHtml =
          '<button type="button" class="tam-box-dn-link-btn" data-box="' + bi + '" ' +
            'title="Vincular esta caixa a uma DN pendente (sabe o c\u00f3digo mas n\u00e3o tem o PDF)">' +
            tamEsc(boxLabel) + ' <span class="tam-box-dn-link-icon">\uD83D\uDD17</span>' +
          '</button>';
      } else {
        labelHtml =
          tamEsc(boxLabel) +
          ' <button type="button" class="tam-box-dn-unlink-btn" data-box="' + bi + '" title="Desvincular DN">\u2715</button>';
      }

      hdr1 += '<th colspan="' + colSpan + '" class="tam-box-header ' + info.boxCls + '">' + labelHtml + '</th>';
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
          '<button class="tam-box-close-btn" data-box="' + bi + '" title="Fechar sem confirmar">\u2715</button>' +
          '<button class="tam-box-confirm-btn" data-box="' + bi + '" title="Confirmar caixa e fechar colunas">\u2713 Confirmar</button>' +
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
      var rowCls  = isOver ? 'tam-ref-over' : (isDone ? 'tam-ref-complete' : '');
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

        // Quick buttons in every active pending box, only for pending/completing refs
        var quickCell = '';
        var boxHasTotal = !!(box.total);
        if (isPending && !isDone && !isOver) {
          var btnDisabled = boxHasTotal ? '' : ' disabled';
          var btnTitle    = boxHasTotal ? '' : ' title="introduza primeiro o total da caixa"';
          quickCell =
            '<td class="tam-rec-cell-quick' + colParity + (boxHasTotal ? '' : ' tam-quick-nototals') + '">' +
              '<div class="tam-row-quick">' +
                '<button class="tam-row-quick-btn"' + btnDisabled + btnTitle + ' data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-mode="funchal">F</button>' +
                '<button class="tam-row-quick-btn"' + btnDisabled + btnTitle + ' data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-mode="porto">PS</button>' +
                '<button class="tam-row-quick-btn tam-row-quick-split"' + btnDisabled + btnTitle + ' data-box="' + bi + '" data-ref="' + tamEsc(c.ref) + '" data-mode="split">\xbd</button>' +
              '</div>' +
            '</td>';
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

    // Global quick buttons bar — só existe enquanto há uma caixa aberta
    var globalBar = !openEntry ? '' :
      '<div class="tam-rec-quick-btns">' +
        '<span class="tam-quick-label">tudo:</span>' +
        '<button class="tam-quick-btn" id="tam-quick-funchal">100%FNC</button>' +
        '<button class="tam-quick-btn" id="tam-quick-porto">100%PXO</button>' +
        '<button class="tam-quick-btn tam-quick-btn-split" id="tam-quick-split">50 / 50</button>' +
      '</div>';

    // ── Painel lateral: lista única de caixas ────────────────
    function tamBoxPanelLabel(bObj) {
      var box = bObj.box, bi = bObj.bi;
      var dnCode = box.dnZyCode || null;
      return dnCode ? dnCode : ('Caixa ' + (bi + 1));
    }
    function tamBoxPanelItem(bObj) {
      var bi       = bObj.bi;
      var box      = bObj.box;
      var received = bObj.received;
      var openDirect = !bObj.isComplete;
      var dnCode   = box.dnZyCode || null;
      // Vincular/desvincular é independente de já ter distribuição, de
      // estar bloqueada, ou de a DN ter (ou não) PDF digital por trás —
      // não altera box.refs, só a atribuição por factura.
      var canLink  = !dnCode;
      var pct    = box.total ? (received + '/' + box.total) : '';
      var active = (bi === tamEditingBoxBi) ? ' tam-boxlist-item-active' : '';

      // Único sinal visual: caixa incompleta (começou mas não chegou ao
      // total) ou com mais peças do que o total declarado. Nada de
      // "confirmada / não confirmada" — essa distinção só confundia.
      var over        = !!(box.total && received > box.total);
      var incomplete  = !!(box.total && received > 0 && received < box.total);
      var warnCls     = over ? ' tam-boxlist-item-over' : (incomplete ? ' tam-boxlist-item-incomplete' : '');
      var warnHtml    = over
        ? '<span class="tam-boxlist-warn" title="Tem mais pe\u00e7as do que o total declarado">\u26A0</span>'
        : (incomplete ? '<span class="tam-boxlist-warn" title="Distribui\u00e7\u00e3o incompleta">\u26A0</span>' : '');

      var linkHtml = canLink
        ? '<button type="button" class="tam-boxlist-link-btn" data-box="' + bi + '" title="Vincular a uma DN pendente">\uD83D\uDD17</button>'
        : '<button type="button" class="tam-boxlist-unlink-btn" data-box="' + bi + '" title="Desvincular DN">\u2715</button>';

      return '<div class="tam-boxlist-item' + active + warnCls + '">' +
        '<button type="button" class="tam-boxlist-item-main" data-box="' + bi + '" data-direct="' + (openDirect ? '1' : '0') + '">' +
          warnHtml +
          '<span class="tam-boxlist-label">' + tamEsc(tamBoxPanelLabel(bObj)) + '</span>' +
          (pct ? '<span class="tam-boxlist-pct">' + pct + '</span>' : '') +
        '</button>' +
        linkHtml +
      '</div>';
    }
    // ── Resumo compacto: DNs declaradas nas facturas que ainda não
    // foram vinculadas a nenhuma caixa — mesma informação que o popover
    // de vincular já usa, só que visível de relance, sem ser invasiva
    // (colapsada por defeito).
    var pendingDNGroups    = tamGetPendingDNsGrouped();
    var pendingDNCount     = pendingDNGroups.reduce(function(s,g){ return s + g.codes.length; }, 0);
    var pendingDNCollapsed = tamCollapseState['pendingDN'] === undefined ? true : !!tamCollapseState['pendingDN'];
    var pendingDNHtml = !pendingDNCount ? '' :
      '<div class="tam-boxlist-pending-dn">' +
        '<button type="button" id="tam-pendingdn-toggle" class="tam-boxlist-pending-dn-btn">' +
          '\u26A0 ' + pendingDNCount + ' DN(s) pendente(s) ' + (pendingDNCollapsed ? '\u25B8' : '\u25BE') +
        '</button>' +
        (pendingDNCollapsed ? '' :
          '<div class="tam-boxlist-pending-dn-list">' +
            pendingDNGroups.map(function(g){
              return '<div class="tam-boxlist-pending-dn-group">' +
                '<div class="tam-boxlist-pending-dn-inv">' + tamEsc(g.invoiceNo) +
                  (g.invoiceDate ? ' \u00b7 ' + tamEsc(g.invoiceDate) : '') +
                '</div>' +
                '<div class="tam-boxlist-pending-dn-codes">' + g.codes.map(tamEsc).join(', ') + '</div>' +
              '</div>';
            }).join('') +
          '</div>') +
      '</div>';

    var boxListHtml =
      '<div class="tam-boxlist-panel">' +
        '<div class="tam-boxlist-section">' +
          '<div class="tam-boxlist-hdr">Caixas</div>' +
          pendingDNHtml +
          (boxOrder.length ? boxOrder.map(function(b){ return tamBoxPanelItem(b); }).join('') : '<div class="tam-boxlist-empty">\u2014</div>') +
        '</div>' +
      '</div>';

    var isIpad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (tamCollapseState['distrib'] === undefined) {
      tamCollapseState['distrib'] = true;
    }
    var distribCollapsed = !!tamCollapseState['distrib'];
    area.innerHTML =
      '<div class="tam-rec-divider"><span>Distribui\u00e7\u00e3o Manual Geral</span></div>' +
      '<div class="tam-rec-area' + (distribCollapsed ? ' tam-rec-collapsed' : '') + '">' +
        '<div class="tam-rec-area-title">' +
          '<button class="tam-inv-toggle-btn" id="tam-rec-toggle-btn" title="expandir / minimizar" style="margin-right:8px;">' +
            (distribCollapsed ? '&#9654;' : '&#9660;') +
          '</button>' +
          tamInvoices.length + ' fatura(s) · ' + consolidatedForSummary.length + ' referências' +
          (quickCount > 0 ? ' · ' + quickCount + ' com distribuição rápida' : '') +
        '</div>' +
        '<div class="tam-rec-collapsible">' +
          '<div class="tam-rec-flex">' +
            '<div class="tam-rec-main-col">' +
              globalBar +
              tableHtml +
            '</div>' +
            boxListHtml +
          '</div>' +
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

    // ── BIND RESUMO DE DNs PENDENTES ────────────────────────────
    (function(){
      var pendingDNBtn = area.querySelector('#tam-pendingdn-toggle');
      if (pendingDNBtn) pendingDNBtn.addEventListener('click', function(){
        tamCollapseState['pendingDN'] = !pendingDNCollapsed;
        tamRenderAll();
      });
    })();

    // ── BIND PAINEL DE CAIXAS ──────────────────────────────────
    // Caixa vazia/incompleta → abre direto na distribuição geral.
    // Caixa completa → abre o modal primeiro (revisão rápida de números).
    (function(){
      area.querySelectorAll('.tam-boxlist-item-main').forEach(function(btn){
        btn.addEventListener('click', function(){
          var bi = parseInt(btn.getAttribute('data-box'));
          if (btn.getAttribute('data-direct') === '1') {
            // Caixa vazia ou incompleta — vai direto à distribuição geral,
            // sem passar pelo modal (não há nada relevante para rever ali).
            var dBox = tamSession.boxes[bi];
            if (dBox) {
              tamPushUndo();
              dBox.locked    = false;
              dBox.confirmed = false;
              if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
              delete tamBoxLockPending[bi];
            }
            tamEditingBoxBi = bi;
            tamRenderAll();
            tamScheduleSave();
          } else {
            tamShowBoxEditModal(bi);
          }
        });
      });
      area.querySelectorAll('.tam-boxlist-link-btn').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          tamShowDNLinkPopover(parseInt(btn.getAttribute('data-box')), btn);
        });
      });
      area.querySelectorAll('.tam-boxlist-unlink-btn').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          tamUnlinkBoxDN(parseInt(btn.getAttribute('data-box')));
        });
      });
      area.querySelectorAll('.tam-box-confirm-btn').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          tamConfirmBox(parseInt(btn.getAttribute('data-box')));
        });
      });
      area.querySelectorAll('.tam-box-close-btn').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          tamEditingBoxBi = -1;
          tamRenderAll();
        });
      });
    })();

    // ── BIND PER-ROW QUICK BUTTONS ────────────────────────────
    area.querySelectorAll('.tam-row-quick-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref  = btn.getAttribute('data-ref');
        var mode = btn.getAttribute('data-mode');
        var bi   = parseInt(btn.getAttribute('data-box'));
        var c    = consolidatedForSummary.find(function(x){ return x.ref === ref; });
        if (!c) return;
        tamPushUndo();
        // Apply to the specific box this button belongs to
        var targetBox = tamSession.boxes[bi];
        var boxList = targetBox ? [targetBox] : [];
        if (!boxList.length) return;
        // Use only the portion of this reference that belongs to THIS box's invoice,
        // so a reference shared across invoices is not fully credited to a single one.
        var invEntry = c.invoices.find(function(iv){ return iv.invIdx === targetBox.invIdx; });
        var owed     = invEntry ? invEntry.pieces : (c.invoices.length === 1 ? c.totalPieces : 0);
        if (!owed) return;
        // Cap to what is still UNDISTRIBUTED for this reference: el botón rápido debe
        // rellenar sólo las piezas restantes, nunca el total de la factura otra vez.
        // Se restan las piezas ya colocadas en las demás cajas (incluidas las cajas
        // bloqueadas/validadas). La caja destino se sobrescribe en
        // tamDistribToBoxesFiltered, por eso su contenido actual se excluye de la suma.
        var distributedElsewhere = 0;
        tamSession.boxes.forEach(function(b, idx){
          if (idx === bi) return;
          var cell = b.refs[ref];
          if (cell) distributedElsewhere += (cell.f || 0) + (cell.p || 0);
        });
        var amount = Math.max(0, Math.min(owed, c.totalPieces - distributedElsewhere));
        if (!amount) return;
        if (mode === 'funchal') {
          tamDistribToBoxesFiltered(ref, amount, amount, 0, boxList);
        } else if (mode === 'porto') {
          tamDistribToBoxesFiltered(ref, amount, 0, amount, boxList);
        } else if (mode === 'split') {
          var half  = Math.floor(amount / 2);
          var isOdd = amount % 2 !== 0;
          tamDistribToBoxesFiltered(ref, amount, half, amount - half - (isOdd ? 1 : 0), boxList);
          if (isOdd) {
            tamOddPieceDialogFiltered([{ ref:ref, totalPieces:amount, invBoxes:boxList }], 0, boxList, function(){
              tamDetectRefCompletions();
              tamCheckBoxLock(bi);
              tamRenderAll(); tamSaveSession(false);
            });
            return;
          }
        }
        // Detect completions BEFORE re-render so 3s state is set
        tamDetectRefCompletions();
        tamCheckBoxLock(bi);
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
    // Abre um modal flutuante só com as referências que já têm quantidade
    // nesta caixa — evita arrastar o scroll horizontal pela matriz inteira
    // para encontrar as colunas certas (pedido: fluidez de trabalho).
    area.querySelectorAll('.tam-box-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var bi = parseInt(btn.getAttribute('data-box'));
        tamShowBoxEditModal(bi);
      });
    });

    // ── BIND LINK-TO-DN BUTTON ─────────────────────────────────
    area.querySelectorAll('.tam-box-dn-link-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var bi = parseInt(btn.getAttribute('data-box'));
        tamShowDNLinkPopover(bi, btn);
      });
    });

    // ── BIND UNLINK-DN BUTTON ───────────────────────────────────
    area.querySelectorAll('.tam-box-dn-unlink-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var bi = parseInt(btn.getAttribute('data-box'));
        tamUnlinkBoxDN(bi);
      });
    });

    // ── BIND FILTER BUTTON ────────────────────────────────────
    var _activeFilterBi = -1;
    area.querySelectorAll('.tam-box-filter-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var bi = parseInt(btn.getAttribute('data-box'));
        if (_activeFilterBi === bi) {
          /* Deactivate filter — show all rows */
          _activeFilterBi = -1;
          btn.style.background = ''; btn.style.borderColor = '';
          area.querySelectorAll('tr[data-ref]').forEach(function(r){ r.style.display = ''; });
        } else {
          /* Activate filter for this box */
          area.querySelectorAll('.tam-box-filter-btn').forEach(function(b){
            b.style.background = ''; b.style.borderColor = '';
          });
          _activeFilterBi = bi;
          btn.style.background = '#f0f0f0'; btn.style.borderColor = '#000';
          var box = tamSession.boxes[bi];
          var filled = box ? Object.keys(box.refs).filter(function(ref){
            return (box.refs[ref].f||0) + (box.refs[ref].p||0) > 0;
          }) : [];
          area.querySelectorAll('tr[data-ref]').forEach(function(row){
            row.style.display = (filled.indexOf(row.getAttribute('data-ref')) >= 0) ? '' : 'none';
          });
        }
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
        /* Cap check: F+P must not exceed DN qty for this ref */
        var capBox = tamSession.boxes[bi];
        if (capBox.dnZyCode) {
          var capDn = tamDeliveryNotes[capBox.dnZyCode];
          if (capDn) {
            var capRef = null;
            for (var _ci=0; _ci<capDn.refs.length; _ci++) { if (capDn.refs[_ci].ref===ref){ capRef=capDn.refs[_ci]; break; } }
            if (capRef) {
              var curF = capBox.refs[ref].f || 0, curP = capBox.refs[ref].p || 0;
              if (curF + curP > capRef.qty && !inp._capWarning) {
                inp._capWarning = true;
                var keep = confirm('\u26a0 ATEN\u00c7\u00c3O\n\nEstas a distribuir ' + (curF+curP) +
                  ' pcs para "' + ref + '"\nmas a DN s\u00f3 tem ' + capRef.qty + ' pcs.\n\n' +
                  'Confirmas que h\u00e1 efectivamente mais pe\u00e7as?');
                if (!keep) {
                  capBox.refs[ref][city] = Math.max(0, capRef.qty - (city==='f' ? curP : curF));
                  inp.value = capBox.refs[ref][city];
                }
                inp._capWarning = false;
              }
            }
          }
        }
        tamUpdateSummaryRow(ref);
        tamUpdateInvoicesRows(ref);  /* also refresh invoice table columns */
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

  /* ══════════════════════════════════════════════════════════════
     MODAL DE EDIÇÃO RÁPIDA DE CAIXA — só refs com quantidade > 0
     Aberto pelo lápis ✏️ de uma caixa completa/bloqueada. Em vez de
     desbloquear a caixa inline e obrigar a arrastar o scroll horizontal
     pela matriz inteira (podem ser 50+ referências), mostra só as que
     esta caixa já tem preenchidas, num modal compacto — edita e
     confirma de uma vez.
  ══════════════════════════════════════════════════════════════ */
  function tamShowBoxEditModal(bi) {
    if (!tamSession) return;
    var box = tamSession.boxes[bi];
    if (!box) return;

    var old = document.getElementById('tam-box-edit-modal');
    if (old) old.parentNode.removeChild(old);

    /* Só refs com F ou PS > 0 nesta caixa — é exactamente o que foi pedido */
    var refs = Object.keys(box.refs).filter(function(ref){
      var c = box.refs[ref];
      return c && ((c.f || 0) + (c.p || 0)) > 0;
    });

    var consolidated = tamConsolidatedRefs();
    function totalFor(ref) {
      var c = consolidated.find(function(x){ return x.ref === ref; });
      return c ? c.totalPieces : 0;
    }

    var boxLabel = box.dnZyCode ? box.dnZyCode : ('Caixa ' + (bi + 1));

    var rowsHtml = refs.map(function(ref) {
      var cell = box.refs[ref] || { f:0, p:0 };
      var safe = ref.replace(/[^a-z0-9]/gi,'_');
      return '<tr>' +
        '<td class="tam-dne-ref"><strong>' + tamEsc(ref) + '</strong></td>' +
        '<td class="tam-dne-inv">' + totalFor(ref) + '</td>' +
        '<td class="tam-dne-qty">' +
          '<input type="text" inputmode="numeric" class="tam-dne-inp" ' +
            'id="tam-bem-f-' + safe + '" data-ref="' + tamEsc(ref) + '" value="' + (cell.f || 0) + '" autocomplete="off">' +
        '</td>' +
        '<td class="tam-dne-qty">' +
          '<input type="text" inputmode="numeric" class="tam-dne-inp" ' +
            'id="tam-bem-p-' + safe + '" data-ref="' + tamEsc(ref) + '" value="' + (cell.p || 0) + '" autocomplete="off">' +
        '</td>' +
      '</tr>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'tam-box-edit-modal';
    modal.className = 'tam-dn-edit-modal';   /* reutiliza o mesmo sistema visual do modal de DN */

    modal.innerHTML =
      '<div id="tam-dn-edit-backdrop"></div>' +
      '<div id="tam-dn-edit-panel">' +
        '<div id="tam-dne-header">' +
          '<div id="tam-dne-title">' +
            '<span id="tam-dne-zy">' + tamEsc(boxLabel) + '</span>' +
            '<span id="tam-dne-sub">Edição rápida · só referências com quantidade</span>' +
          '</div>' +
          '<button id="tam-bem-close" class="tam-dn-close">&times;</button>' +
        '</div>' +
        (refs.length
          ? '<div class="tam-dne-hint">Corrige F / PS desta caixa e confirma. Referências sem quantidade não aparecem aqui.</div>' +
            '<div id="tam-dne-scroll">' +
              '<table id="tam-dne-table">' +
                '<thead><tr>' +
                  '<th class="tam-dn-th">Referência</th>' +
                  '<th class="tam-dn-th">Total</th>' +
                  '<th class="tam-dn-th">F</th>' +
                  '<th class="tam-dn-th">PS</th>' +
                '</tr></thead>' +
                '<tbody>' + rowsHtml + '</tbody>' +
              '</table>' +
            '</div>'
          : '<div class="tam-dne-hint">Esta caixa ainda não tem nenhuma referência com quantidade.</div>') +
        '<div id="tam-dne-footer">' +
          '<button id="tam-bem-save" class="tam-dn-action-btn">✓ Confirmar e guardar</button>' +
          '<button id="tam-bem-general" class="tam-dn-cancel-btn">↩ Levar a distribuição geral</button>' +
          '<button id="tam-bem-cancel" class="tam-dn-cancel-btn">Cancelar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-dn-visible'); });

    function closeModal() {
      modal.classList.remove('tam-dn-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
    }
    modal.querySelector('#tam-dn-edit-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-bem-close').addEventListener('click', closeModal);
    modal.querySelector('#tam-bem-cancel').addEventListener('click', closeModal);

    var saveBtn = modal.querySelector('#tam-bem-save');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      tamPushUndo();
      refs.forEach(function(ref) {
        var safe = ref.replace(/[^a-z0-9]/gi,'_');
        var fInp = modal.querySelector('#tam-bem-f-' + safe);
        var pInp = modal.querySelector('#tam-bem-p-' + safe);
        var fVal = fInp ? (parseInt(fInp.value) || 0) : 0;
        var pVal = pInp ? (parseInt(pInp.value) || 0) : 0;
        if (fVal <= 0 && pVal <= 0) {
          delete box.refs[ref];
        } else {
          box.refs[ref] = { f: fVal, p: pVal };
        }
      });

      /* Recalcula se a caixa continua completa — sem esperar os 3s de
         animação, porque isto é uma confirmação deliberada e não
         digitação ao vivo. */
      var received = 0;
      Object.values(box.refs).forEach(function(v){ received += (v.f || 0) + (v.p || 0); });
      if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
      delete tamBoxLockPending[bi];
      box.locked = !!(box.total && received >= box.total);

      tamDetectRefCompletions();
      tamRenderAll();
      tamSaveSession(false);
      closeModal();
    });

    var generalBtn = modal.querySelector('#tam-bem-general');
    if (generalBtn) generalBtn.addEventListener('click', function() {
      tamPushUndo();
      box.locked    = false;
      box.confirmed = false;
      if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
      delete tamBoxLockPending[bi];
      tamEditingBoxBi = bi;
      closeModal();
      tamRenderAll();
      tamSaveSession(false);
    });
  }

  /* ──────────────────────────────────────────────────────────────
     Confirmar caixa manualmente — fecha as colunas na distribuição
     geral e move a caixa para a lista "confirmadas". Deliberado: não
     depende de o total bater certo (permite entregas parciais), mas
     avisa se faltam peças.
  ──────────────────────────────────────────────────────────────── */
  function tamConfirmBox(bi) {
    if (!tamSession) return;
    var box = tamSession.boxes[bi];
    if (!box) return;

    var received = 0;
    Object.keys(box.refs || {}).forEach(function(ref){
      var c = box.refs[ref];
      received += (c.f || 0) + (c.p || 0);
    });
    var missing = box.total ? Math.max(0, box.total - received) : 0;
    var bodyHtml = missing > 0
      ? ('Faltam <strong>' + missing + '</strong> pe\u00e7a(s) para completar o total declarado (' +
          received + '/' + box.total + ').<br><small style="color:#888">Podes confirmar mesmo assim se a caixa est\u00e1 mesmo incompleta.</small>')
      : ('Confirmar esta caixa' + (box.total ? (' com ' + received + ' de ' + box.total + ' pe\u00e7as') : (' com ' + received + ' pe\u00e7as')) + '?');

    var old = document.getElementById('tam-session-dialog');
    if (old) old.parentNode.removeChild(old);

    var dialog = document.createElement('div');
    dialog.id = 'tam-session-dialog';
    dialog.innerHTML =
      '<div id="tam-session-dialog-box">' +
        '<div class="tam-dialog-title">confirmar caixa</div>' +
        '<div class="tam-dialog-body">' + bodyHtml + '</div>' +
        '<div class="tam-dialog-btns">' +
          '<button class="tam-dialog-btn tam-dialog-btn-add" id="tam-confirmbox-yes">\u2713 sim, confirmar</button>' +
          '<button class="tam-dialog-btn" id="tam-confirmbox-no">cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    dialog.querySelector('#tam-confirmbox-yes').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
      tamPushUndo();
      box.confirmed = true;
      if (tamEditingBoxBi === bi) tamEditingBoxBi = -1;
      tamDetectRefCompletions();
      tamRenderAll();
      tamScheduleSave();
    });
    dialog.querySelector('#tam-confirmbox-no').addEventListener('click', function(){
      dialog.parentNode.removeChild(dialog);
    });
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
          // Nota: NÃO fecha a coluna aberta automaticamente — só o botão
          // "Confirmar" explícito faz isso (decisão deliberada do utilizador).
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
  /* Detect completions — no animation, instant class update */
  function tamDetectRefCompletions() {
    if (!tamSession) return;
    var consolidated = tamConsolidatedRefs();
    var area = document.getElementById('tam-reception-area');
    /* Cancel all pending completing timers */
    Object.keys(tamRefCompletingTimers).forEach(function(k){
      clearTimeout(tamRefCompletingTimers[k]); delete tamRefCompletingTimers[k];
    });
    tamRefCompleting.clear();
    consolidated.forEach(function(c){
      var totals = tamGetRefTotals(c.ref);
      var recv   = totals.f + totals.p;
      var isDone = recv >= c.totalPieces && c.totalPieces > 0;
      var isOver = recv >  c.totalPieces && c.totalPieces > 0;
      if (isDone) tamRefDone.add(c.ref); else tamRefDone.delete(c.ref);
      if (!area) return;
      var safeSelector = c.ref.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      var row = area.querySelector('tr[data-ref="' + safeSelector + '"]');
      if (!row) return;
      row.classList.remove('tam-ref-over', 'tam-ref-complete', 'tam-ref-completing');
      if (isOver)      row.classList.add('tam-ref-over');
      else if (isDone) row.classList.add('tam-ref-complete');
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
        var box = tamSession.boxes[offset + i];
        if (box !== undefined && !box.dnZyCode) {
          /* Only repair positional boxes that were NOT stamped by a DN confirm.
             DN-stamped boxes already have the correct invIdx set at confirm time
             and must not be overwritten by positional arithmetic. */
          box.invIdx = invIdx;
        }
      }
      offset += pkgs;
    });
    /* Boxes beyond the positional range (dynamically added for extra DNs):
       they already carry their correct invIdx — leave them untouched. */
    if (!tamSession.quickDistrib) tamSession.quickDistrib = {};
  }

  /* Per-invoice quick distribution */
  function tamQuickDistribRef(invIdx, ref, pieces, mode) {
    if (!tamSession) return;
    tamRepairBoxInvIdx();
    var invBoxes = tamSession.boxes.filter(function(box){ return box.invIdx === invIdx; });
    var distrib  = tamGetRefDistribForInvoice(ref, invIdx);
    var fCurr = distrib.f || 0;
    var pCurr = distrib.p || 0;

    /* Toggle: si el modo ya está activo → limpiar distribución */
    var isActive = false;
    if (mode === 'funchal' && fCurr === pieces && pCurr === 0) isActive = true;
    if (mode === 'porto'   && pCurr === pieces && fCurr === 0) isActive = true;
    if (mode === 'split'   && fCurr > 0 && pCurr > 0 && fCurr + pCurr === pieces) isActive = true;

    if (isActive) {
      tamPushUndo();
      invBoxes.forEach(function(box) {
        if (box.refs[ref]) { box.refs[ref].f = 0; box.refs[ref].p = 0; }
      });
      tamDetectRefCompletions();
      invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
      tamRenderAll();
      tamSaveSession(false);
      return;
    }

    tamPushUndo();
    if (mode === 'funchal') {
      tamDistribToBoxesFiltered(ref, pieces, pieces, 0, invBoxes);
    } else if (mode === 'porto') {
      tamDistribToBoxesFiltered(ref, pieces, 0, pieces, invBoxes);
    } else if (mode === 'split') {
      var half  = Math.floor(pieces / 2);
      var isOdd = pieces % 2 !== 0;
      tamDistribToBoxesFiltered(ref, pieces, half, pieces - half - (isOdd ? 1 : 0), invBoxes);
      if (isOdd) {
        tamOddPieceDialogFiltered([{ ref:ref, totalPieces:pieces, invBoxes:invBoxes }], 0, invBoxes, function(){
          tamDetectRefCompletions();
          invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
          tamRenderAll();
          tamSaveSession(false);
        });
        return;
      }
    }
    tamDetectRefCompletions();
    invBoxes.forEach(function(box){ var bi = tamSession.boxes.indexOf(box); if (bi >= 0) tamCheckBoxLock(bi); });
    tamRenderAll();
    tamSaveSession(false);
  }

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
      // Each odd entry may target a different invoice's boxes; prefer its own list.
      var boxesForThis = c.invBoxes || invBoxes;
      tamDistribToBoxesFiltered(c.ref, c.totalPieces, f, p, boxesForThis);
      dialog.parentNode.removeChild(dialog);
      tamOddPieceDialogFiltered(oddRefs, idx + 1, invBoxes, onComplete);
    }
    dialog.querySelector('#tam-odd-f').addEventListener('click', function(){ choose(half+1, half); });
    dialog.querySelector('#tam-odd-p').addEventListener('click', function(){ choose(half, half+1); });
    dialog.querySelector('#tam-odd-s').addEventListener('click', function(){ choose(half, half); });
  }

  /* Global quick distribution (area de resumen buttons).
     Invoice-aware: a reference shared across several invoices is split so that
     EACH invoice receives exactly its own requested pieces (c.invoices[].pieces),
     distributed only within that invoice's boxes. This prevents the whole
     consolidated quantity from landing in a single invoice. */
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

    function invBoxesFor(invIdx) {
      return tamSession.boxes.filter(function(box){ return box.invIdx === invIdx; });
    }

    if (mode === 'funchal' || mode === 'porto') {
      consolidated.forEach(function(c){
        c.invoices.forEach(function(inv){
          var boxes = invBoxesFor(inv.invIdx);
          if (!boxes.length || !inv.pieces) return;
          tamDistribToBoxesFiltered(c.ref, inv.pieces,
            mode === 'funchal' ? inv.pieces : 0,
            mode === 'porto'   ? inv.pieces : 0,
            boxes);
        });
      });
      afterDistrib();
      tamRenderAll();
      tamSaveSession(false);
      return;
    }

    if (mode === 'split') {
      var oddRefs = [];
      consolidated.forEach(function(c){
        c.invoices.forEach(function(inv){
          var boxes = invBoxesFor(inv.invIdx);
          if (!boxes.length || !inv.pieces) return;
          var half  = Math.floor(inv.pieces / 2);
          var isOdd = inv.pieces % 2 !== 0;
          tamDistribToBoxesFiltered(c.ref, inv.pieces, half, inv.pieces - half - (isOdd ? 1 : 0), boxes);
          // Carry the invoice's own boxes so the odd-piece dialog targets them.
          if (isOdd) oddRefs.push({ ref: c.ref, totalPieces: inv.pieces, invBoxes: boxes });
        });
      });
      if (oddRefs.length) {
        tamOddPieceDialogFiltered(oddRefs, 0, tamSession.boxes, function(){
          afterDistrib();
          tamRenderAll(); tamSaveSession(false);
        });
      } else {
        afterDistrib();
        tamRenderAll(); tamSaveSession(false);
      }
    }
  }

  function tamGetBoxRefTotal(box, ref) {
    if (!box.refs[ref]) return 0;
    return (box.refs[ref].f || 0) + (box.refs[ref].p || 0);
  }

  /* Sequential dialog for odd-piece refs */
  function tamRenderProgress() {
    var area = document.getElementById('tam-progress-area');
    if (area) area.innerHTML = '';
    if (!tamSession || !tamInvoices.length) return;
    tamInvoices.forEach(function(inv, invIdx) {
      var totalNeeded  = inv.totalPieces;
      var totalDistrib = inv.grouped.reduce(function(s, g) {
        var d = tamGetRefDistribForInvoice(g.ref, invIdx);
        return s + d.f + d.p;
      }, 0);
      var complete = totalNeeded > 0 && totalDistrib >= totalNeeded;
      document.querySelectorAll('.tam-inv-stock-btn').forEach(function(btn) {
        var di = btn.getAttribute('data-inv');
        if (di !== null && parseInt(di) === invIdx) {
          btn.classList.toggle('tam-inv-stock-active', complete);
        } else if (di === null && invIdx === 0) {
          btn.classList.toggle('tam-inv-stock-active', complete);
        }
      });
    });
  }

  function tamRenderSessionBar() {
    var bar = document.getElementById('tam-session-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    var nameEl = document.getElementById('tam-session-name');
    var saveBtn  = document.getElementById('tam-save-btn');
    var guiaBarBtn = document.getElementById('tam-guia-bar-btn');
    var stEl    = document.getElementById('tam-session-status');
    var eanToolBtn = document.getElementById('tam-ean-tool-btn');
    if (tamSession) {
      if (nameEl) nameEl.value = tamSession.name;
      if (saveBtn) saveBtn.classList.add('visible');
      if (guiaBarBtn) guiaBarBtn.style.display = 'inline-block';
      if (eanToolBtn) eanToolBtn.style.display = 'flex';
    } else {
      if (nameEl) nameEl.value = '';
      if (saveBtn) saveBtn.classList.remove('visible');
      if (guiaBarBtn) guiaBarBtn.style.display = 'none';
      if (eanToolBtn) eanToolBtn.style.display = 'none';
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
    tamLockSync();   /* sesión activa → tomar/sincronizar lock */
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
          _externalShipping: r._externalShipping || null,
          guiaErp:       r.guiaErp       || '',
          creditNotes:   r.creditNotes   || []
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
      var guiaBtnVis  = document.getElementById('tam-guia-bar-btn');
      if (saveBtn) saveBtn.classList.add('visible');
      if (guiaBtnVis)  guiaBtnVis.style.display  = 'inline-block';
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
     LISTA DE SESSÕES — bloco fixo por baixo da zona de carregar
     fatura (visível só em estado vazio, via CSS #tab-tam:not(.tam-loaded)).
     Substituiu o antigo popup: já não há abrir/fechar, só (re)carregar.
  ══════════════════════════════════════════════════════════════ */
  function tamRefreshSessionsInline() {
    var dd = document.getElementById('tam-sessions-dropdown');
    if (!dd) return;
    dd.innerHTML = '<div class="tam-sessions-empty">a carregar sessões…</div>';
    tamLoadAllSessionsMerged().then(function(sessions){
      tamRenderSessionsList(sessions);
      // Se o Supabase ainda não estava pronto nesta tentativa (sbAdmin
      // undefined — acontece na 1ª carga, logo após o login), reinicia
      // sozinho por polling até sbAdmin ficar disponível (máx. 10s).
      if (!tamSB()) tamRetrySessionsWhenReady();
    });
  }

  function tamRetrySessionsWhenReady() {
    if (tamRetrySessionsWhenReady._active) return;
    tamRetrySessionsWhenReady._active = true;
    var attempts = 0;
    var maxAttempts = 20; // 20 × 500ms = 10s
    var timer = setInterval(function () {
      attempts++;
      if (tamSB()) {
        clearInterval(timer);
        tamRetrySessionsWhenReady._active = false;
        tamRefreshSessionsInline();
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        tamRetrySessionsWhenReady._active = false;
      }
    }, 500);
  }

  /* Data embutida no nome da sessão ("Sessão TAM DD/MM/YYYY") — âncora
     cronológica estável que nunca muda ao guardar/carregar, ao contrário
     de savedAt (que avança sempre que a sessão é tocada). */
  function tamParseSessionDate(name) {
    var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(name || '');
    if (!m) return 0;
    return new Date(parseInt(m[3],10), parseInt(m[2],10)-1, parseInt(m[1],10)).getTime();
  }

  /* Renderiza a lista em TODOS os contentores presentes no DOM neste
     momento — o bloco inline (visível em estado vazio) e, se estiver
     aberto, o modal de troca de sessão (visível dentro de uma sessão
     activa). Os dois soões o mesmo dado, nunca dessincronizam. */
  function tamRenderSessionsList(sessions) {
    var targets = document.querySelectorAll('.tam-sessions-list-target');
    if (!targets.length) return;
    if (!sessions) sessions = tamLoadAllSessionsLocal();
    var keys = Object.keys(sessions).sort(function(a,b){
      var da = tamParseSessionDate(sessions[a].name || a);
      var db = tamParseSessionDate(sessions[b].name || b);
      if (db !== da) return db - da;
      return (sessions[b].savedAt||0) - (sessions[a].savedAt||0);
    });

    var titleTxt = 'sessões guardadas' + (keys.length ? ' · ' + keys.length : '');
    document.querySelectorAll('.tam-sessions-title-target').forEach(function(t){ t.textContent = titleTxt; });

    var bodyHtml = !keys.length
      ? '<div class="tam-sessions-empty">nenhuma sessão guardada</div>'
      : keys.map(function(k){
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

    targets.forEach(function(dd){
      dd.innerHTML = bodyHtml;

      dd.querySelectorAll('.tam-dd-load-btn').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          var key = btn.getAttribute('data-key');
          /* Show loading feedback on button */
          btn.textContent = '…';
          btn.disabled = true;
          tamLoadSessionFresh(key);
          /* Se veio do modal de troca (dentro de uma sessão activa), fechá-lo */
          var switchModal = document.getElementById('tam-sessions-switch-modal');
          if (switchModal) switchModal.remove();
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
    });
  }

  /* ── Modal de troca de sessão — só faz sentido quando já se está DENTRO
     de uma sessão activa (o bloco inline fica escondido nesse estado para
     dar espaço ao trabalho). Segue o mesmo padrão de overlay que os outros
     diálogos do módulo (criar/remover a cada abertura). ── */
  function tamOpenSessionsSwitchModal() {
    var old = document.getElementById('tam-sessions-switch-modal');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'tam-sessions-switch-modal';
    overlay.innerHTML =
      '<div id="tam-sessions-switch-box">' +
        '<div class="tam-sessions-switch-hdr">' +
          '<span class="tam-sessions-inline-title tam-sessions-title-target">sessões guardadas</span>' +
          '<button type="button" id="tam-sessions-switch-close">✕</button>' +
        '</div>' +
        '<div class="tam-sessions-list-target" id="tam-sessions-switch-dropdown"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#tam-sessions-switch-close').addEventListener('click', function(){ overlay.remove(); });
    function onKeyDown(e){
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKeyDown); }
    }
    document.addEventListener('keydown', onKeyDown);

    overlay.querySelector('#tam-sessions-switch-dropdown').innerHTML = '<div class="tam-sessions-empty">a carregar sessões…</div>';
    tamLoadAllSessionsMerged().then(function(sessions){ tamRenderSessionsList(sessions); });
  }

  /* ── Cargar sessão forçando fetch de Supabase primeiro ── */
  async function tamLoadSessionFresh(key) {
    /* Show loading state in status */
    var statusEl = document.getElementById('tam-session-status');
    if (statusEl) { statusEl.textContent = '↻ a sincronizar…'; statusEl.style.opacity = '1'; }

    var sb = tamSB();
    var sessionData = null;

    /* 1. Try to fetch fresh data from Supabase */
    if (sb) {
      try {
        var res = await sb.from(TAM_SESSIONS_TABLE)
          .select('data, saved_at')
          .eq('session_name', key)
          .limit(1);
        if (!res.error && res.data && res.data.length) {
          var remote = JSON.parse(res.data[0].data);
          /* Update localStorage with fresh remote data */
          try {
            var all = tamLoadAllSessionsLocal();
            all[remote.name] = remote;
            localStorage.setItem('tam_sessions', JSON.stringify(all));
          } catch(e) {}
          sessionData = remote;
          if (statusEl) {
            statusEl.textContent = '✓ sincronizado';
            setTimeout(function(){ if (statusEl) statusEl.style.opacity = '0'; }, 2000);
          }
        }
      } catch(e) {
        console.warn('TAM: Supabase fetch failed, falling back to localStorage', e);
      }
    }

    /* 2. Fallback to localStorage if Supabase unavailable or no remote data */
    if (!sessionData) {
      sessionData = tamLoadAllSessionsLocal()[key];
      if (statusEl) {
        statusEl.textContent = '⊘ offline — carregado localmente';
        statusEl.style.color = '#5F7B94';
        setTimeout(function(){ if (statusEl) { statusEl.style.opacity = '0'; statusEl.style.color = ''; } }, 2500);
      }
    }

    if (!sessionData) {
      if (statusEl) { statusEl.textContent = '⚠ sessão não encontrada'; statusEl.style.color = '#9B4D4D'; }
      return;
    }

    tamLoadSession(key, sessionData);
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
            g.grandTotal        = tamRound2(g.totalCost + shipPerPiece * g.pieces);
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
          guiaErp:        inv.guiaErp         || '',
          creditNotes:    inv.creditNotes     || [],
          xv: { fullyAgree: true, confirmed: grouped.length, conflicts: [],
                engines: [{label:'A',refs:grouped.length,units:totalPieces},
                          {label:'B',refs:grouped.length,units:totalPieces}],
                autoEngine:'A', activeEngine:'A', isManual:false }
        };
      });
      /* Guia ERP já preenchida ao guardar — a fatura reabre sempre colapsada
         (o estado de colapso em si não é persistido, só se re-deriva daqui). */
      tamInvoices.forEach(function(inv, idx){
        if (inv.guiaErp) tamCollapseState['inv_' + idx] = true;
      });
      document.getElementById('tab-tam').classList.add('tam-loaded');
      document.getElementById('admin-app').classList.add('tam-loaded');
      document.getElementById('tam-export-btn').classList.add('show');
      document.getElementById('tam-file-name').textContent = s.invoices.length + ' fatura(s) — sessão carregada';
      document.getElementById('tam-status-msg').textContent = 'sessão: ' + s.name;
      tamRebuildDNMap();
      /* Pre-mark all already-completed refs as Done so no staggered re-renders fire */
      tamRefCompleting.clear();
      tamRefDone.clear();
      if (tamSession) {
        var _consolidated = tamConsolidatedRefs ? tamConsolidatedRefs() : [];
        _consolidated.forEach(function(c){
          var totals = tamGetRefTotals(c.ref);
          if ((totals.f + totals.p) >= c.totalPieces && c.totalPieces > 0) {
            tamRefDone.add(c.ref);
          }
        });
      }
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
    if (tamSession && tamSession.name === key) tamLockRelease();
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
    var f = 0, p = 0;
    /* FIX: somar todos os lotes cujo key comeca por ref___ — compativel com
       chaves escritas pelo proprio TAM (ref___invIdx) e por Processamento
       (ref___sessionName). */
    var prefix = ref + '___';
    Object.keys(tamSession.sentRefs).forEach(function(k) {
      if (k === ref || k.indexOf(prefix) === 0) {
        (tamSession.sentRefs[k] || []).forEach(function(l){ f += (l.f||0); p += (l.p||0); });
      }
    });
    return { f:f, p:p };
  }

  /* ── Colores por sesión antigua (índice 0 = más reciente distinta a la activa) ── */
  var TAM_SESSION_COLORS = ['#F59E0B','#8B5CF6','#3B82F6','#6B7280'];
  function tamSessionColor(idx) {
    return TAM_SESSION_COLORS[Math.min(idx, TAM_SESSION_COLORS.length - 1)];
  }

  /* ── Recopilar pendientes de sesiones anteriores ── */

  /* Extrae pendientes de un mapa de sesiones ya cargado (local o remoto) */
  function tamExtractPendingFromSessionsMap(allSessions) {
    var results = [];
    /* FIX: só incluir sessões criadas ANTES da sessão activa.
       Compara createdAt (timestamp numérico). Se a sessão activa não tiver
       createdAt, usa savedAt como fallback. Sessões futuras ou sem data são ignoradas. */
    var activeCreatedAt = tamSession ? (tamSession.createdAt || tamSession.savedAt || 0) : 0;
    var keys = Object.keys(allSessions)
      .filter(function(k){
        var s = allSessions[k];
        if (!tamSession || s.name === tamSession.name) return false;
        var sTime = s.createdAt || s.savedAt || 0;
        return sTime < activeCreatedAt;
      })
      .sort(function(a,b){ return (allSessions[b].savedAt||0) - (allSessions[a].savedAt||0); });
    keys.forEach(function(key){
      var s = allSessions[key];
      if (!s.invoices || !s.boxes) return;
      s.invoices.forEach(function(inv, invIdx){
        (inv.grouped || []).forEach(function(g){
          var distF = 0, distP = 0;
          s.boxes.forEach(function(box){
            if (box.refs && box.refs[g.ref]) {
              distF += box.refs[g.ref].f || 0;
              distP += box.refs[g.ref].p || 0;
            }
          });
          if (distF === 0 && distP === 0) return;
          /* FIX: somar todos os lotes cujo key comeca por ref___ — compativel
             com chaves de TAM (ref___invIdx) e de Processamento (ref___sessionName). */
          var sentF = 0, sentP = 0;
          var _prefix = g.ref + '___';
          Object.keys(s.sentRefs || {}).forEach(function(k) {
            if (k === g.ref || k.indexOf(_prefix) === 0) {
              ((s.sentRefs || {})[k] || []).forEach(function(l){ sentF += l.f||0; sentP += l.p||0; });
            }
          });
          var pendF = Math.max(0, distF - sentF);
          var pendP = Math.max(0, distP - sentP);
          if (pendF > 0 || pendP > 0) {
            results.push({
              ref:               g.ref,
              invIdx:            invIdx,
              sessionKey:        key,
              sessionName:       s.name,
              pendF:             pendF,
              pendP:             pendP,
              sentF:             sentF,
              sentP:             sentP,
              totalF:            distF,
              totalP:            distP,
              done:              false,
              _fromOtherSession: true
            });
          }
        });
      });
    });
    return results;
  }

  /* Versão síncrona (só localStorage) — resultado imediato */
  function tamGetPendingFromOtherSessions() {
    return tamExtractPendingFromSessionsMap(tamLoadAllSessionsLocal());
  }

  /* Versão async — consulta Supabase para funcionar entre dispositivos */
  async function tamGetPendingFromOtherSessionsRemote() {
    var allSessions = await tamLoadAllSessionsMerged();
    return tamExtractPendingFromSessionsMap(allSessions);
  }

  /* ── Confirmar envío de pendientes de sesiones anteriores ── */
  function tamConfirmOtherSessionsEnvio(rows) {
    var today = new Date().toISOString().slice(0,10);
    // Group by sessionKey
    var bySession = {};
    rows.forEach(function(row){
      if (!row._fromOtherSession) return;
      if (!bySession[row.sessionKey]) bySession[row.sessionKey] = [];
      bySession[row.sessionKey].push(row);
    });
    var allSessions = tamLoadAllSessionsLocal();
    Object.keys(bySession).forEach(function(sKey){
      var s = allSessions[sKey];
      if (!s) return;
      if (!s.sentRefs) s.sentRefs = {};
      bySession[sKey].forEach(function(row){
        var key = row.ref + '___' + row.invIdx;
        if (!s.sentRefs[key]) s.sentRefs[key] = [];
        s.sentRefs[key].push({ data: today, f: row.pendF, p: row.pendP });
      });
      allSessions[sKey] = s;
      // Save to Supabase too
      tamSaveSessionSupabase(s);
    });
    try { localStorage.setItem('tam_sessions', JSON.stringify(allSessions)); } catch(e){}
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
  async function tamShowGuiaModal(invIdx) {
    /* FIX: refrescar sentRefs da sessao activa a partir do Supabase antes de
       construir as linhas — garante que confirmacoes feitas noutro modulo
       (ex: Processamento) sao reflectidas imediatamente. */
    if (tamSession) {
      var sb = tamSB();
      if (sb) {
        try {
          var _sfRes = await sb.from(TAM_SESSIONS_TABLE)
            .select('data')
            .eq('session_name', tamSession.name)
            .limit(1);
          if (!_sfRes.error && _sfRes.data && _sfRes.data.length) {
            var _sfParsed = JSON.parse(_sfRes.data[0].data);
            if (_sfParsed.sentRefs) {
              tamSession.sentRefs = _sfParsed.sentRefs;
              /* Actualizar localStorage com dados frescos */
              try {
                var _sfAll = tamLoadAllSessionsLocal();
                if (_sfAll[tamSession.name]) {
                  _sfAll[tamSession.name].sentRefs = _sfParsed.sentRefs;
                  localStorage.setItem('tam_sessions', JSON.stringify(_sfAll));
                }
              } catch(e) {}
            }
          }
        } catch(e) { console.warn('TAM guia: erro ao refrescar sentRefs', e); }
      }
    }

    var isAll  = (invIdx === null);
    var rows   = isAll ? tamBuildGuiaRowsAll() : tamBuildGuiaRows(invIdx);
    var title  = isAll
      ? 'Guía Consolidada · ' + tamInvoices.length + ' fatura(s)'
      : 'Guía · ' + tamEsc(tamInvoices[invIdx].invoiceNo);

    /* ── Pendientes de sesiones anteriores — fase 1: localStorage inmediato ── */
    var otherRows = tamGetPendingFromOtherSessions();

    /* Asignar color por sesión */
    function tamAssignSessionColors(rows) {
      var colorMap = {};
      var idx = 0;
      rows.forEach(function(row){
        if (!colorMap[row.sessionKey]) colorMap[row.sessionKey] = tamSessionColor(idx++);
        row._dotColor = colorMap[row.sessionKey];
      });
      return colorMap;
    }
    var sessionColorMap = tamAssignSessionColors(otherRows);

    /* Combinar: filas activas primero, luego otras sesiones */
    var pendRows = rows.filter(function(r){ return !r.done; }).concat(otherRows);
    var sentRows = rows.filter(function(r){ return  r.done; });

    var oldModal = document.getElementById('tam-guia-modal');
    if (oldModal) oldModal.parentNode.removeChild(oldModal);

    var modal = document.createElement('div');
    modal.id = 'tam-guia-modal';

    /* ── Column copy labels ── */
    var COL_G = ['Ref. FNC', 'Qtd. F', 'Ref. PXO', 'Qtd. PS'];

    function buildTableRows(rowList) {
      if (!rowList.length) return '<tr><td colspan="5" class="tam-guia-empty">Sem referências pendentes</td></tr>';
      return rowList.map(function(row, i){
        var cls = row.done ? ' tam-guia-row-sent' : (i%2===0 ? ' tam-guia-row-even' : ' tam-guia-row-odd');
        var fQty = row.done ? row.totalF : row.pendF;
        var pQty = row.done ? row.totalP : row.pendP;
        var fDisp = fQty > 0 ? fQty : '—';
        var pDisp = pQty > 0 ? pQty : '—';
        var dot = row._dotColor
          ? '<span class="tam-guia-session-dot" style="color:' + row._dotColor + ';user-select:none;-webkit-user-select:none;" aria-hidden="true">●</span>'
          : '';
        return '<tr class="tam-guia-tr' + cls + '">' +
          '<td class="tam-guia-td tam-guia-ref-f" data-gcol="0">' + (fQty>0 ? dot + tamEsc(row.ref) : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-qty-f" data-gcol="1">' + (fQty>0 ? fDisp : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-sep"></td>' +
          '<td class="tam-guia-td tam-guia-ref-p" data-gcol="2">' + (pQty>0 ? dot + tamEsc(row.ref) : '') + '</td>' +
          '<td class="tam-guia-td tam-guia-qty-p" data-gcol="3">' + (pQty>0 ? pDisp : '') + '</td>' +
        '</tr>';
      }).join('');
    }

    function buildLegendHtml(colorMap) {
      var keys = Object.keys(colorMap);
      if (!keys.length) return '';
      return '<div id="tam-guia-session-legend">' +
        keys.map(function(k){
          var color = colorMap[k];
          var name  = (tamLoadAllSessionsLocal()[k] || {}).name || k;
          return '<span class="tam-guia-legend-item">' +
            '<span style="color:' + color + ';user-select:none;-webkit-user-select:none;">●</span> ' +
            tamEsc(name) +
          '</span>';
        }).join('') +
      '</div>';
    }

    function recalcTotals(pr, sr) {
      return {
        fPend: pr.reduce(function(s,r){ return s+r.pendF; },0),
        pPend: pr.reduce(function(s,r){ return s+r.pendP; },0),
        fSent: sr.reduce(function(s,r){ return s+r.totalF; },0),
        pSent: sr.reduce(function(s,r){ return s+r.totalP; },0)
      };
    }

    var totals = recalcTotals(pendRows, sentRows);
    var fPend = totals.fPend, pPend = totals.pPend;
    var fSent = totals.fSent, pSent = totals.pSent;

    /* ── 4 address buttons ── */
    var addrBar =
      '<div class="tam-guia-copy-bar tam-guia-addr-bar-4">' +
        '<button class="tam-guia-addr-btn" data-addr="CALCADA DA QUINTINHA 17 B">\u29c9\u00a0Lisboa</button>' +
        '<button class="tam-guia-addr-btn" data-addr="29-FV-30">\u29c9\u00a0Placa</button>' +
        '<button class="tam-guia-addr-btn" data-addr="RUA DE SAO FRANCISCO N\u00ba 20">\u29c9\u00a0FNC</button>' +
        '<button class="tam-guia-addr-btn" data-addr="EDIFICIO Ilha Dourada Loja-1">\u29c9\u00a0PXO</button>' +
      '</div>';

    /* FIX: mostrar enviadas apenas quando nao ha pendentes — evita confusao
       entre pendentes e enviadas. Se ha pendentes, o historico de enviadas e omitido. */
    var sentSection = (sentRows.length && pendRows.length === 0)
      ? '<tr class="tam-guia-sent-hdr"><td colspan="5">\u2713 J\u00e1 enviado (' + sentRows.length + ' refs \u00b7 ' + fSent + ' F \u00b7 ' + pSent + ' PS)</td></tr>' +
        buildTableRows(sentRows)
      : '';

    /* ── Banner de sessões anteriores (zona superior direita do header) ── */
    /* Aparece imediatamente a indicar que está a verificar; atualiza depois do fetch remoto */
    var bannerHtml =
      '<div id="tam-guia-other-banner" class="tam-guia-other-banner tam-guia-other-loading">' +
        '<span id="tam-guia-other-status">\u21bb a verificar sessões anteriores…</span>' +
      '</div>';

    modal.innerHTML =
      '<div id="tam-guia-backdrop"></div>' +
      '<div id="tam-guia-panel">' +
        '<div id="tam-guia-header">' +
          '<div id="tam-guia-title">' +
            '<span id="tam-guia-title-main">' + title + '</span>' +
            '<span id="tam-guia-title-sub">Guia de transporte \u00b7 TAM Fashion</span>' +
          '</div>' +
          '<div id="tam-guia-header-right">' +
            bannerHtml +
            '<div id="tam-guia-header-btns">' +
              '<button id="tam-guia-confirm-btn" class="tam-guia-action-btn tam-guia-confirm"' + (pendRows.length===0?' disabled':'') + '>\u2713 Confirmar envio</button>' +
              '<button id="tam-guia-export-btn" class="tam-guia-action-btn">\u2b07 Exportar CSV</button>' +
              '<button id="tam-guia-close-btn" class="tam-guia-close-btn">\u00d7</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        addrBar +
        '<div id="tam-guia-scroll">' +
          '<table id="tam-guia-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="tam-guia-th tam-guia-th-f" colspan="2">' +
                  '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
                    '<span>\ud83d\udd35 FNC (A4)</span>' +
                    '<span id="tam-guia-fnc-count" style="font-size:.6rem;font-weight:600;opacity:.7;">' + fPend + ' un. pendentes</span>' +
                  '</div>' +
                '</th>' +
                '<th class="tam-guia-th tam-guia-th-sep"></th>' +
                '<th class="tam-guia-th tam-guia-th-p" colspan="2">' +
                  '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
                    '<span>\ud83d\udd34 PXO (A5)</span>' +
                    '<span id="tam-guia-pxo-count" style="font-size:.6rem;font-weight:600;opacity:.7;">' + pPend + ' un. pendentes</span>' +
                  '</div>' +
                '</th>' +
              '</tr>' +
              '<tr>' +
                '<th class="tam-guia-th2"><div class="tam-guia-th2-inner">Refer\u00eancia <button class="tam-guia-copy-btn tam-guia-hdr-copy" data-gcol="0">\u29c9</button></div></th>' +
                '<th class="tam-guia-th2 tam-guia-th2-qty"><div class="tam-guia-th2-inner" style="justify-content:center">Qtd. <button class="tam-guia-copy-btn tam-guia-hdr-copy" data-gcol="1">\u29c9</button></div></th>' +
                '<th class="tam-guia-th-sep"></th>' +
                '<th class="tam-guia-th2"><div class="tam-guia-th2-inner">Refer\u00eancia <button class="tam-guia-copy-btn tam-guia-hdr-copy" data-gcol="2">\u29c9</button></div></th>' +
                '<th class="tam-guia-th2 tam-guia-th2-qty"><div class="tam-guia-th2-inner" style="justify-content:center">Qtd. <button class="tam-guia-copy-btn tam-guia-hdr-copy" data-gcol="3">\u29c9</button></div></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="tam-guia-tbody">' + buildTableRows(pendRows) + sentSection + '</tbody>' +
          '</table>' +
          '<div id="tam-guia-legend-wrap">' + buildLegendHtml(sessionColorMap) + '</div>' +
        '</div>' +
        '<div id="tam-guia-footer">' +
          '<span id="tam-guia-footer-text">' +
            pendRows.length + ' refs pendentes \u00b7 ' + fPend + ' un. FNC \u00b7 ' + pPend + ' un. PXO' +
            (sentRows.length ? ' \u00b7 ' + sentRows.length + ' j\u00e1 enviadas' : '') +
            (otherRows.length ? ' \u00b7 ' + otherRows.length + ' de sess\u00f5es anteriores' : '') +
          '</span>' +
          '<span class="tam-guia-copy-msg" id="tam-guia-copy-msg" style="margin-left:10px;"></span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-guia-visible'); });

    /* ── Fase 2: opt-in por sessão — nunca adiciona automaticamente ── */
    var _tamAddedOtherRows = [];

    function tamApplySessionRows(sessionRows) {
      if (!sessionRows.length) return;
      _tamAddedOtherRows = _tamAddedOtherRows.concat(sessionRows);
      var newPendRows = pendRows.concat(sessionRows);
      var newTotals   = recalcTotals(newPendRows, sentRows);
      var tbody = modal.querySelector('#tam-guia-tbody');
      var newSentSection = (sentRows.length && newPendRows.length === 0)
        ? '<tr class="tam-guia-sent-hdr"><td colspan="5">\u2713 J\u00e1 enviado (' + sentRows.length + ' refs \u00b7 ' + newTotals.fSent + ' F \u00b7 ' + newTotals.pSent + ' PS)</td></tr>' +
          buildTableRows(sentRows)
        : '';
      if (tbody) tbody.innerHTML = buildTableRows(newPendRows) + newSentSection;
      var fncCount = modal.querySelector('#tam-guia-fnc-count');
      var pxoCount = modal.querySelector('#tam-guia-pxo-count');
      if (fncCount) fncCount.textContent = newTotals.fPend + ' un. pendentes';
      if (pxoCount) pxoCount.textContent = newTotals.pPend + ' un. pendentes';
      var legendWrap = modal.querySelector('#tam-guia-legend-wrap');
      if (legendWrap) legendWrap.innerHTML = buildLegendHtml(tamAssignSessionColors(_tamAddedOtherRows));
      var footerText = modal.querySelector('#tam-guia-footer-text');
      if (footerText) {
        footerText.textContent =
          newPendRows.length + ' refs pendentes \u00b7 ' + newTotals.fPend + ' un. FNC \u00b7 ' + newTotals.pPend + ' un. PXO' +
          (sentRows.length ? ' \u00b7 ' + sentRows.length + ' j\u00e1 enviadas' : '');
      }
      var confirmBtn = modal.querySelector('#tam-guia-confirm-btn');
      if (confirmBtn) confirmBtn.disabled = (newPendRows.length === 0);
      pendRows = newPendRows;
      otherRows = _tamAddedOtherRows;
      fPend = newTotals.fPend;
      pPend = newTotals.pPend;
    }

    tamGetPendingFromOtherSessionsRemote().then(function(remoteOtherRows) {
      var banner = modal.querySelector('#tam-guia-other-banner');
      if (!banner || !modal.parentNode) return;
      banner.classList.remove('tam-guia-other-loading');
      if (!remoteOtherRows.length) {
        banner.classList.add('tam-guia-other-none');
        var statusEl = banner.querySelector('#tam-guia-other-status');
        if (statusEl) statusEl.textContent = '\u2713 sem pendentes noutras sess\u00f5es';
        setTimeout(function(){ banner.style.display = 'none'; }, 2000);
        return;
      }
      tamAssignSessionColors(remoteOtherRows);
      var sessionGroups = {}, sessionOrder = [];
      remoteOtherRows.forEach(function(row) {
        if (!sessionGroups[row.sessionKey]) {
          sessionGroups[row.sessionKey] = { rows: [], name: row.sessionName, color: row._dotColor };
          sessionOrder.push(row.sessionKey);
        }
        sessionGroups[row.sessionKey].rows.push(row);
      });
      banner.classList.add('tam-guia-other-found');
      banner.style.flexDirection = 'column';
      banner.style.alignItems    = 'stretch';
      banner.style.gap           = '6px';
      banner.innerHTML =
        '<div style="font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.5;margin-bottom:2px;">Sess\u00f5es anteriores com pendentes</div>' +
        sessionOrder.map(function(sKey) {
          var grp  = sessionGroups[sKey];
          var totF = grp.rows.reduce(function(s,r){ return s+r.pendF; },0);
          var totP = grp.rows.reduce(function(s,r){ return s+r.pendP; },0);
          return '<div class="tam-guia-sess-row" data-skey="' + tamEsc(sKey) + '" style="display:flex;align-items:center;gap:8px;">' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + grp.color + ';flex-shrink:0;"></span>' +
            '<span style="font-size:.72rem;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + tamEsc(grp.name) + '">' + tamEsc(grp.name) + '</span>' +
            '<span style="font-size:.68rem;font-weight:600;color:#000;opacity:.6;white-space:nowrap;flex-shrink:0;">' + grp.rows.length + ' ref' + (grp.rows.length!==1?'s':'') + ' \u00b7 ' + totF + ' FNC \u00b7 ' + totP + ' PXO</span>' +
            '<button class="tam-guia-sess-add-btn" data-skey="' + tamEsc(sKey) + '" style="padding:3px 12px;font-size:.68rem;font-weight:700;cursor:pointer;border:1.5px solid #555;border-radius:6px;background:#fff;color:#000;white-space:nowrap;flex-shrink:0;transition:background .12s,border-color .12s;">+ Adicionar</button>' +
            '<button class="tam-guia-sess-ign-btn" data-skey="' + tamEsc(sKey) + '" style="padding:3px 8px;font-size:.68rem;font-weight:700;cursor:pointer;border:1.5px solid #ddd;border-radius:6px;background:transparent;color:#000;white-space:nowrap;flex-shrink:0;transition:background .12s,border-color .12s;">\u00d7</button>' +
            '</div>';
        }).join('');
      banner.querySelectorAll('.tam-guia-sess-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sKey = btn.getAttribute('data-skey');
          var grp  = sessionGroups[sKey];
          if (!grp) return;
          btn.style.background = '#f0f0f0'; btn.style.borderColor = '#555';
          setTimeout(function(){ btn.style.background = ''; btn.style.borderColor = ''; }, 300);
          tamApplySessionRows(grp.rows);
          delete sessionGroups[sKey];
          var rowEl = banner.querySelector('.tam-guia-sess-row[data-skey="' + tamEsc(sKey) + '"]');
          if (rowEl) rowEl.remove();
          if (!Object.keys(sessionGroups).length) banner.style.display = 'none';
        });
      });
      banner.querySelectorAll('.tam-guia-sess-ign-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sKey = btn.getAttribute('data-skey');
          delete sessionGroups[sKey];
          var rowEl = banner.querySelector('.tam-guia-sess-row[data-skey="' + tamEsc(sKey) + '"]');
          if (rowEl) rowEl.remove();
          if (!Object.keys(sessionGroups).length) banner.style.display = 'none';
        });
      });
    }).catch(function(){
      var banner = modal.querySelector('#tam-guia-other-banner');
      if (banner) banner.style.display = 'none';
    });

    /* ── Address buttons (4 especiales — Lisboa, Placa, FNC, PXO) ── */
    modal.querySelectorAll('.tam-guia-addr-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var text = btn.getAttribute('data-addr');
        if (!text) return;
        function flash(){ btn.classList.add('tam-guia-addr-copied'); setTimeout(function(){ btn.classList.remove('tam-guia-addr-copied'); }, 1400); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash).catch(flash);
        } else {
          try { var ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;top:-9999px;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch(e){}
          flash();
        }
      });
    });

    /* ── Copy column — inline hdr-copy + dot removal ── */
    var copyMsg   = modal.querySelector('#tam-guia-copy-msg');
    var copyTimer = null;
    modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ci   = parseInt(btn.getAttribute('data-gcol'));
        var vals = Array.from(modal.querySelectorAll('td[data-gcol="'+ci+'"]'))
                       .map(function(td){
                         var clone = td.cloneNode(true);
                         clone.querySelectorAll('.tam-guia-session-dot').forEach(function(d){ d.parentNode.removeChild(d); });
                         return clone.textContent.trim();
                       })
                       .filter(function(v){ return v && v !== '\u2014'; });
        if (!vals.length) return;
        modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
        btn.classList.add('tam-guia-copy-active');
        var text = vals.join('\n');
        function showMsg(ok){
          if (!copyMsg) return;
          copyMsg.textContent = ok ? '\u2713 ' + COL_G[ci] + ' copiado!' : '\u26a0 copie manualmente';
          copyMsg.style.color = ok ? '#4A7C6F' : '#5F7B94';
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(function(){
            copyMsg.textContent = '';
            modal.querySelectorAll('.tam-guia-copy-btn').forEach(function(b){ b.classList.remove('tam-guia-copy-active'); });
          }, 2200);
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

    /* ── Confirmar envio ── */
    modal.querySelector('#tam-guia-confirm-btn').addEventListener('click', function(){
      if (!pendRows.length) return;
      var confirmDiv = document.createElement('div');
      confirmDiv.id = 'tam-guia-confirm-overlay';
      confirmDiv.innerHTML =
        '<div id="tam-guia-confirm-box">' +
          '<div class="tam-gc-title">\u26a0 Confirmar envio</div>' +
          '<div class="tam-gc-body">' +
            'Vais marcar <strong>' + pendRows.length + ' refer\u00eancias</strong> como enviadas hoje (' + new Date().toLocaleDateString('pt-PT') + ').<br>' +
            '<strong>' + fPend + '</strong> un. FNC \u00b7 <strong>' + pPend + '</strong> un. PXO<br><br>' +
            'Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.' +
          '</div>' +
          '<div class="tam-gc-btns">' +
            '<button class="tam-gc-btn tam-gc-ok">\u2713 Confirmar</button>' +
            '<button class="tam-gc-btn tam-gc-cancel">Cancelar</button>' +
          '</div>' +
        '</div>';
      modal.querySelector('#tam-guia-panel').appendChild(confirmDiv);
      confirmDiv.querySelector('.tam-gc-cancel').addEventListener('click', function(){
        confirmDiv.parentNode.removeChild(confirmDiv);
      });
      confirmDiv.querySelector('.tam-gc-ok').addEventListener('click', function(){
        tamConfirmGuiaEnvio(pendRows.filter(function(r){ return !r._fromOtherSession; }));
        tamConfirmOtherSessionsEnvio(pendRows.filter(function(r){ return r._fromOtherSession; }));
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

  function tamAdjustStockPrices(rows, grandTotal) {
    if (!rows.length) return rows;

    /* Piezas totales por referencia (A4 + A5 sumadas) */
    var refPieces = {};
    rows.forEach(function(rw) {
      refPieces[rw.ref] = (refPieces[rw.ref] || 0) + rw.qty;
    });

    /* Diferencia actual en céntimos (positivo = falta, negativo = sobra) */
    var currentTotal = rows.reduce(function(s, rw) {
      return s + tamRound2(rw.price * rw.qty);
    }, 0);
    var diffCents = Math.round((grandTotal - currentTotal) * 100);
    if (diffCents === 0) return rows;

    /* Ordenar referencias por piezas ascendente (menor impacto primero) */
    var sortedRefs = Object.keys(refPieces).sort(function(a, b) {
      return refPieces[a] - refPieces[b];
    });

    /* Greedy: aplicar ±0,01 a las referencias de menor pieza */
    var adjustments = {};
    for (var i = 0; i < sortedRefs.length && diffCents !== 0; i++) {
      var ref = sortedRefs[i];
      var impact = refPieces[ref]; /* céntimos que mueve ajustar 0,01 a este ref */
      var sign   = diffCents > 0 ? 1 : -1;
      /* Aplicar si reduce la diferencia o la acerca más a 0 */
      var afterDiff = diffCents - sign * impact;
      if (Math.abs(afterDiff) <= Math.abs(diffCents)) {
        adjustments[ref] = sign * 0.01;
        diffCents = afterDiff;
      }
    }

    /* Aplicar ajustes al array de filas */
    return rows.map(function(rw) {
      if (adjustments[rw.ref] !== undefined) {
        return { ref:rw.ref, city:rw.city, iva:rw.iva, price:tamRound2(rw.price + adjustments[rw.ref]), qty:rw.qty };
      }
      return rw;
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

    rows = tamAdjustStockPrices(rows, r.grandTotal);

    /* Delta residual tras ajuste */
    var adjustedSum = rows.reduce(function(s, rw){ return s + tamRound2(rw.price * rw.qty); }, 0);
    var deltaCents  = Math.round((r.grandTotal - adjustedSum) * 100);
    var deltaLabel  = deltaCents === 0
      ? '· Δ 0,00 €'
      : '· Δ ' + (deltaCents > 0 ? '+' : '-') + tamFmtEU(Math.abs(deltaCents) / 100) + ' €';

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

    var COL_S = ['Referencia', 'ARM', 'IVA', '\u20ac', 'Qtd.'];

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
        '<div id="tam-stock-scroll">' +
          '<table id="tam-stock-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="tam-stock-th tam-stock-ref"><div class="tam-guia-th2-inner"><button class="tam-stock-copy-btn" data-scol="0">&#x29c9;</button>Referencia</div></th>' +
                '<th class="tam-stock-th tam-stock-city"><div class="tam-guia-th2-inner" style="justify-content:center"><button class="tam-stock-copy-btn" data-scol="1">&#x29c9;</button>ARM</div></th>' +
                '<th class="tam-stock-th tam-stock-iva"><div class="tam-guia-th2-inner" style="justify-content:center"><button class="tam-stock-copy-btn" data-scol="2">&#x29c9;</button>IVA</div></th>' +
                '<th class="tam-stock-th tam-stock-price"><div class="tam-guia-th2-inner" style="justify-content:center"><button class="tam-stock-copy-btn" data-scol="3">&#x29c9;</button>&euro;</div></th>' +
                '<th class="tam-stock-th tam-stock-qty"><div class="tam-guia-th2-inner" style="justify-content:center"><button class="tam-stock-copy-btn" data-scol="4">&#x29c9;</button>Qtd.</div></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (noData || tableRows) + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-stock-footer">' +
          rows.length + ' linhas · ' +
          rows.filter(function(rw){ return rw.city==='A4'; }).reduce(function(s,rw){ return s+rw.qty; },0) + ' uds Funchal · ' +
          rows.filter(function(rw){ return rw.city==='A5'; }).reduce(function(s,rw){ return s+rw.qty; },0) + ' uds Porto Santo ' +
          deltaLabel +
          '<span class="tam-guia-copy-msg" id="tam-stock-copy-msg" style="margin-left:10px;"></span>' +
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
        modal.querySelectorAll('.tam-stock-copy-btn').forEach(function(b){ b.classList.remove('tam-stock-copy-active'); });
        btn.classList.add('tam-stock-copy-active');
        var text = vals.join('\n');
        function showMsg(ok){
          if (!stockCopyMsg) return;
          stockCopyMsg.textContent = ok ? '\u2713 ' + COL_S[ci] + ' copiado!' : '\u26a0 copie manualmente';
          stockCopyMsg.style.color = ok ? '#4A7C6F' : '#5F7B94';
          if (stockCopyTimer) clearTimeout(stockCopyTimer);
          stockCopyTimer = setTimeout(function(){
            stockCopyMsg.textContent='';
            modal.querySelectorAll('.tam-stock-copy-btn').forEach(function(b){ b.classList.remove('tam-stock-copy-active'); });
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
      var lines = ['\uFEFF' + ['Referencia','ARM','IVA','Euro','Quantidade'].join(';')];
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

  function tamExtractDNListFromRows(allRows, knownInvoiceZY) {
    /* The invoice ZY code appears in every page header (once per page).
       DN (Lieferschein) codes appear only once, at the invoice footer.

       Strategy v2 — 3-tier invoice ZY identification:
         Tier 1: use knownInvoiceZY if provided by the caller (from tamTagMeta)
         Tier 2: most-frequent ZY code (works for multi-page invoices)
         Tier 3: among tied ZY codes, prefer ZY-2xxxxxxx (TAM invoice prefix)
                 Lieferscheine use ZY-8xxxxxxx, invoices use ZY-2xxxxxxx.
                 If still tied, use first appearance in text.

       This fixes 1-page invoices where invoice ZY and each Lieferschein ZY
       all appear exactly once — equal frequency made the old code pick wrong one.
    */
    var fullText = allRows.map(function(t){ return t.join(' '); }).join(' ');

    fullText = fullText.replace(/\bZY\s+-\s*(\d{8})\b/g, 'ZY-$1');
    fullText = fullText.replace(/\bZY-(\d{1,7})\s+(\d{1,7})\b/g, function(m, p1, p2) {
      var combined = p1 + p2;
      if (combined.length === 8) return 'ZY-' + combined;
      return m;
    });

    var matches = fullText.match(/ZY-\d{8}/g);
    if (!matches) return [];

    /* Tier 1: caller already knows the invoice ZY */
    var invoiceZY = knownInvoiceZY || null;

    if (!invoiceZY) {
      var freq = {};
      matches.forEach(function(zy){ freq[zy] = (freq[zy] || 0) + 1; });
      var maxFreq = 0;
      Object.keys(freq).forEach(function(zy){ if (freq[zy] > maxFreq) maxFreq = freq[zy]; });
      var candidates = Object.keys(freq).filter(function(zy){ return freq[zy] === maxFreq; });

      if (candidates.length === 1) {
        /* Tier 2: unique winner by frequency */
        invoiceZY = candidates[0];
      } else {
        /* Tier 3: prefer ZY-2xxxxxxx (invoice number prefix) */
        var invoicePrefixed = candidates.filter(function(zy){ return /^ZY-2/.test(zy); });
        if (invoicePrefixed.length >= 1) {
          /* pick first appearance among ZY-2 candidates */
          invoiceZY = null;
          for (var mi = 0; mi < matches.length; mi++) {
            if (invoicePrefixed.indexOf(matches[mi]) >= 0) { invoiceZY = matches[mi]; break; }
          }
        }
        if (!invoiceZY) {
          /* Last resort: first appearance overall */
          invoiceZY = matches[0];
        }
      }
    }

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
    var loadBtn  = document.getElementById('tam-dn-load-bar-btn');
    var camBtn   = document.getElementById('tam-dn-cam-bar-btn');
    if (loadBtn)  loadBtn.style.display  = 'inline-flex';
    if (camBtn)   camBtn.style.display   = 'inline-flex';
    tamUpdateDNCount();
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT DN + DISTRIBUIÇÃO → CSV semicolon-separated, UTF-8 BOM
  ══════════════════════════════════════════════════════════════ */
  function tamExportDNExcel() {
    var dns = Object.values(tamDeliveryNotes);
    if (!dns.length) return;

    // Sort DNs: by invoice then by zyCode
    dns.sort(function(a, b) {
      var iA = tamDNtoInvIdx.hasOwnProperty(a.zyCode) ? tamDNtoInvIdx[a.zyCode] : 9999;
      var iB = tamDNtoInvIdx.hasOwnProperty(b.zyCode) ? tamDNtoInvIdx[b.zyCode] : 9999;
      if (iA !== iB) return iA - iB;
      return a.zyCode < b.zyCode ? -1 : a.zyCode > b.zyCode ? 1 : 0;
    });

    var rows = [];
    // Header
    rows.push(['DN', 'FACTURA', 'REFERÊNCIA', 'T', 'FNC', 'PXO'].join(';'));

    dns.forEach(function(dn, idx) {
      var invIdx   = tamDNtoInvIdx.hasOwnProperty(dn.zyCode) ? tamDNtoInvIdx[dn.zyCode] : -1;
      var factura  = (invIdx >= 0 && tamInvoices[invIdx]) ? tamInvoices[invIdx].invoiceNo : '';
      var refs     = dn.refs || [];

      // Build distrib map from lastPhotoDistrib if confirmed, else zeros
      var distribMap = {};
      if (dn.distribConfirmed && dn.lastPhotoDistrib && dn.lastPhotoDistrib.length) {
        dn.lastPhotoDistrib.forEach(function(d){ if (d && d.ref) distribMap[d.ref] = { f: d.f || 0, p: d.p || 0 }; });
      }

      refs.forEach(function(r) {
        var d   = distribMap[r.ref] || { f: 0, p: 0 };
        rows.push([dn.zyCode, factura, r.ref, r.qty, d.f, d.p].join(';'));
      });

      // Blank separator row between DNs (not after last one)
      if (idx < dns.length - 1) rows.push('');
    });

    var bom     = '\uFEFF';
    var content = bom + rows.join('\r\n');
    var blob    = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    var url     = URL.createObjectURL(blob);
    var a       = document.createElement('a');
    var date    = new Date().toISOString().slice(0, 10);
    a.href      = url;
    a.download  = 'DN_Distribuicao_' + date + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  }

  function tamUpdateDNCount() {
    var el = document.getElementById('tam-dn-count');
    if (!el) return;
    var n = Object.keys(tamDeliveryNotes).length;
    el.textContent = n > 0 ? n + ' DN' : '';
    el.style.display = n > 0 ? 'inline-block' : 'none';
    el.style.color = '#000';
    el.style.fontWeight = '700';
    el.style.cursor = 'pointer';
    el.style.textDecoration = 'underline dotted';
    el.title = 'Ver delivery notes carregadas';
    if (!el._tamDNBound) {
      el._tamDNBound = true;
      el.addEventListener('click', function(e){ e.stopPropagation(); tamShowDNListPanel(); });
    }
  }

  function tamShowDNListPanel() {
    var existing = document.getElementById('tam-dn-list-backdrop');
    if (existing) { existing.remove(); return; }
    var el = document.getElementById('tam-dn-count');
    var backdrop = document.createElement('div');
    backdrop.id = 'tam-dn-list-backdrop';
    backdrop.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99997',
      'background:rgba(0,0,0,0.35)',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:16px'
    ].join(';');

    var panel = document.createElement('div');
    panel.id = 'tam-dn-list-panel';
    panel.style.cssText = [
      'background:#fff',
      'border:1px solid #e0e0e0',
      'border-radius:12px',
      'box-shadow:0 8px 30px rgba(0,0,0,.18)',
      "font-family:'MontserratLight',sans-serif",
      'width:min(560px,calc(100vw - 32px))',
      'max-height:80vh',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden'
    ].join(';');

    backdrop.appendChild(panel);

    var dns = Object.values(tamDeliveryNotes);
    if (!dns.length) {
      panel.innerHTML = '<div style="padding:18px 16px;font-size:.82rem;color:#000;opacity:.5;font-weight:700;">Nenhuma DN carregada.</div>';
    } else {
      var confCount = dns.filter(function(d){ return d.distribConfirmed; }).length;
      var pendCount = dns.length - confCount;
      var hdrHtml =
        '<div style="padding:10px 14px 8px;font-size:.6rem;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.12em;color:#000;border-bottom:1px solid #f0f0f0;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">' +
        '<span>' + dns.length + ' Delivery Note' + (dns.length !== 1 ? 's' : '') + ' carregadas</span>' +
        '<span style="margin-left:8px;font-size:.6rem;font-weight:700;color:#4A7C6F;">' + confCount + '</span>' +
        '<span style="font-size:.6rem;font-weight:700;color:#000;">/' + pendCount + '</span>' +
        '<button id="tam-dn-export-xls-btn" style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;' +
        'padding:3px 9px;border-radius:6px;border:1px solid #bbb;background:transparent;color:#000;opacity:.7;cursor:pointer;' +
        'font-family:MontserratLight,sans-serif;transition:all .15s;">↓ excel</button>' +
        '</div>' +
        '<div style="padding:8px 14px 6px;border-bottom:1px solid #f0f0f0;flex-shrink:0;">' +
          '<input id="tam-dn-filter-inp" type="text" placeholder="🔍 filtrar por ZY ou referência…" autocomplete="off" spellcheck="false" style="' +
            'width:100%;box-sizing:border-box;padding:6px 10px;font-size:.78rem;' +
            "font-family:'MontserratLight',sans-serif;border:1px solid #e0e0e0;" +
            'border-radius:7px;outline:none;background:#fafafa;color:#000;transition:border-color .15s;">' +
        '</div>' +
        '<div id="tam-dn-list-rows" style="overflow-y:auto;flex:1;">';

      var rowsHtml = dns.map(function(dn) {
        var hasPhoto   = !!(dn.lastPhotoDistrib && dn.lastPhotoDistrib.length);
        var confirmed  = dn.distribConfirmed ? ' ✓' : '';
        var clr        = dn.distribConfirmed ? '#4A7C6F' : '#000';
        var isUserConf = dn.lastPhotoConf === 'user_confirmed';
        var btnLabel   = hasPhoto ? (isUserConf ? '✓ ver confirmado' : '?? ver resultado') : '';
        var photoBtn   = hasPhoto
          ? '<button class="tam-dn-replay-btn" data-zy="' + tamEsc(dn.zyCode) + '" style="' +
              'padding:3px 10px;font-size:.68rem;font-weight:700;cursor:pointer;' +
              'border:1px solid ' + (isUserConf ? '#4A7C6F' : '#ccc') + ';border-radius:6px;background:transparent;' +
              'color:' + (isUserConf ? '#4A7C6F' : '#000') + ";font-family:'MontserratLight',sans-serif;" +
              'transition:all .12s;white-space:nowrap;flex-shrink:0;">' +
              btnLabel + '</button>'
          : '';
        var distribBtn = '<button class="tam-dn-distrib-btn" data-zy="' + tamEsc(dn.zyCode) + '" style="' +
          'padding:3px 10px;font-size:.68rem;font-weight:700;cursor:pointer;' +
          'border:1px solid #ccc;border-radius:6px;background:transparent;' +
          "color:#000;font-family:'MontserratLight',sans-serif;" +
          'transition:all .12s;white-space:nowrap;flex-shrink:0;">✏ distribuir</button>';
        var deleteBtn = '<button class="tam-dn-delete-btn" data-zy="' + tamEsc(dn.zyCode) + '" style="' +
          'padding:3px 8px;font-size:.68rem;font-weight:700;cursor:pointer;' +
          'border:1px solid #f5c0c0;border-radius:6px;background:transparent;' +
          "color:#c00;font-family:'MontserratLight',sans-serif;" +
          'transition:all .12s;white-space:nowrap;flex-shrink:0;">✕</button>';
        var dnRefs = (dn.refs || []).map(function(r){ return r.ref.toLowerCase(); }).join(' ');
        return '<div class="tam-dn-row-item" data-zy="' + tamEsc(dn.zyCode) + '" data-refs="' + tamEsc(dnRefs) + '" style="display:flex;align-items:center;gap:6px;padding:9px 14px;border-bottom:1px solid #f5f5f5;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:.8rem;font-weight:700;color:' + clr + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              tamEsc(dn.zyCode) + confirmed +
            '</div>' +
            '<div style="font-size:.65rem;color:#000;opacity:.45;margin-top:1px;">' +
              (dn.refs ? dn.refs.length + ' refs' : '') +
              (dn.gesamtPcs ? ' · ' + dn.gesamtPcs + ' pcs' : '') +
            '</div>' +
          '</div>' +
          photoBtn +
          distribBtn +
          deleteBtn +
        '</div>';
      }).join('');

      panel.innerHTML = hdrHtml + rowsHtml + '</div>';
    }

    document.body.appendChild(backdrop);

    /* Filtro en tiempo real */
    /* ── Excel export button ── */
    var xlsBtn = panel.querySelector('#tam-dn-export-xls-btn');
    if (xlsBtn) {
      xlsBtn.addEventListener('mouseenter', function(){ xlsBtn.style.opacity='1'; xlsBtn.style.background='#f5f5f5'; });
      xlsBtn.addEventListener('mouseleave', function(){ xlsBtn.style.opacity='.7'; xlsBtn.style.background='transparent'; });
      xlsBtn.addEventListener('click', function(e){
        e.stopPropagation();
        tamExportDNExcel();
      });
    }

    var filterInp = panel.querySelector('#tam-dn-filter-inp');
    if (filterInp) {
      filterInp.addEventListener('input', function() {
        var q = filterInp.value.trim().toLowerCase();
        panel.querySelectorAll('.tam-dn-row-item').forEach(function(row) {
          var zy   = (row.getAttribute('data-zy')   || '').toLowerCase();
          var refs = (row.getAttribute('data-refs') || '').toLowerCase();
          row.style.display = (!q || zy.indexOf(q) >= 0 || refs.indexOf(q) >= 0) ? 'flex' : 'none';
        });
      });
      filterInp.addEventListener('click', function(e){ e.stopPropagation(); });
      /* Focus automático al abrir — solo en desktop/iPad, no en móvil (evita teclado) */
      if (window.innerWidth >= 640) {
        setTimeout(function(){ filterInp.focus(); }, 60);
      }
    }

    panel.querySelectorAll('.tam-dn-replay-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function(){ btn.style.background='#f5f5f5'; });
      btn.addEventListener('mouseleave', function(){ btn.style.background='transparent'; });
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var zy = btn.getAttribute('data-zy');
        var dn = tamDeliveryNotes[zy];
        if (!dn) return;
        backdrop.remove();
        tamShowDNDistribModal(dn, dn.lastPhotoDistrib || null, dn.lastPhotoConf || null, false);
      });
    });

    panel.querySelectorAll('.tam-dn-distrib-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function(){ btn.style.background='#f5f5f5'; });
      btn.addEventListener('mouseleave', function(){ btn.style.background='transparent'; });
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var zy = btn.getAttribute('data-zy');
        var dn = tamDeliveryNotes[zy];
        if (!dn) return;
        backdrop.remove();
        tamShowDNDistribModal(dn, null, null, false);
      });
    });

    panel.querySelectorAll('.tam-dn-delete-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function(){ btn.style.background='#fff0f0'; });
      btn.addEventListener('mouseleave', function(){ btn.style.background='transparent'; });
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var zy = btn.getAttribute('data-zy');
        delete tamDeliveryNotes[zy];
        tamUpdateDNCount();
        tamRebuildDNMap();
        var bd = document.getElementById('tam-dn-list-backdrop');
        if (bd) bd.remove();
        if (Object.keys(tamDeliveryNotes).length > 0) tamShowDNListPanel();
      });
    });

    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) backdrop.remove();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     DN EXCEL IMPORT — carga un .xlsx con columnas: Delivery Note | referencia | Qty
     Agrupa por zyCode + ref (suma qty por EAN), crea entradas en tamDeliveryNotes
     con la misma estructura que tamParseDNFromItems: { zyCode, refs, fileName, gesamtPcs }
     No sobreescribe una DN existente (cargada por PDF) si ya tiene refs.
  ══════════════════════════════════════════════════════════════ */
  async function tamHandleDNExcelFile(file) {
    try {
      /* SheetJS is available as XLSX in this environment */
      if (typeof XLSX === 'undefined') {
        console.warn('TAM DN Excel: SheetJS (XLSX) not available');
        tamShowDNError('SheetJS não disponível — não é possível ler Excel.');
        return;
      }
      var buf  = await file.arrayBuffer();
      var wb   = XLSX.read(buf, { type: 'array' });
      var ws   = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!rows.length) {
        tamShowDNError('Excel vazio ou sem dados.');
        return;
      }

      /* Detect header row — find the row that contains "Delivery Note" or "ZY-" pattern.
         Accepts first row as header if it contains text, otherwise uses row 0. */
      var dataStart = 0;
      var COL_ZY = 0, COL_REF = 1, COL_QTY = 2;

      /* Try to auto-detect columns from header row */
      var hdr = rows[0].map(function(c){ return String(c).trim().toLowerCase(); });
      var foundHeader = false;
      hdr.forEach(function(h, i) {
        if (/delivery.?note|zy.?code|lieferschein/i.test(h)) { COL_ZY = i; foundHeader = true; }
        if (/ref|artikel|reference/i.test(h))                 { COL_REF = i; }
        if (/qty|menge|quantity|anzahl/i.test(h))             { COL_QTY = i; }
      });
      if (foundHeader) dataStart = 1;

      /* Accumulate: { zyCode: { refCode: totalQty } } */
      var accumulator = {};   /* { zyCode: { ref: qty } } */
      var refOrder    = {};   /* { zyCode: [ref, ...] } — preserves first-seen order */

      for (var ri = dataStart; ri < rows.length; ri++) {
        var row = rows[ri];
        var zyRaw  = String(row[COL_ZY]  || '').trim();
        var refRaw = String(row[COL_REF] || '').trim();
        var qtyRaw = row[COL_QTY];

        /* zyCode must match ZY-XXXXXXXX pattern */
        var zyMatch = zyRaw.match(/ZY-\d{8}/);
        if (!zyMatch) continue;
        var zyCode = zyMatch[0];

        if (!refRaw) continue;

        var qty = parseInt(qtyRaw);
        if (isNaN(qty) || qty < 1) continue;

        if (!accumulator[zyCode]) {
          accumulator[zyCode] = {};
          refOrder[zyCode]    = [];
        }
        if (!accumulator[zyCode].hasOwnProperty(refRaw)) {
          accumulator[zyCode][refRaw] = 0;
          refOrder[zyCode].push(refRaw);
        }
        accumulator[zyCode][refRaw] += qty;
      }

      var count = 0;
      var newZyCodes = [];
      Object.keys(accumulator).forEach(function(zyCode) {
        /* Do not overwrite a DN that was loaded from PDF (has refs already) */
        if (tamDeliveryNotes[zyCode] && tamDeliveryNotes[zyCode].refs && tamDeliveryNotes[zyCode].refs.length) {
          console.log('TAM DN Excel: skipping', zyCode, '— already loaded from PDF');
          return;
        }
        var refs = refOrder[zyCode]
          .map(function(ref){ return { ref: ref, qty: accumulator[zyCode][ref] }; })
          .filter(function(r){ return r.qty > 0; });
        if (!refs.length) return;
        var gesamtPcs = refs.reduce(function(s, r){ return s + r.qty; }, 0);
        tamDeliveryNotes[zyCode] = {
          zyCode:     zyCode,
          refs:       refs,
          fileName:   file.name,
          gesamtPcs:  gesamtPcs,
          fromExcel:  true
        };
        newZyCodes.push(zyCode);
        count++;
      });

      console.log('TAM DN Excel: imported', count, 'DNs from', file.name);

      /* ── Fallback Motor D: si la detección local no encontró nada ── */
      if (count === 0) {
        tamMotorDSpinner('Motor D a analisar Excel…');
        try {
          var sampleRows = rows.slice(0, 60);
          var mdRes = await tamMotorDCall({ mode: 'excel_dn', rows: sampleRows });
          tamMotorDSpinner(null);
          if (mdRes && mdRes.dns && mdRes.dns.length) {
            mdRes.dns.forEach(function(dn) {
              if (!dn.zyCode || !dn.refs || !dn.refs.length) return;
              if (tamDeliveryNotes[dn.zyCode] && tamDeliveryNotes[dn.zyCode].refs && tamDeliveryNotes[dn.zyCode].refs.length) return;
              var gesamtPcs = dn.gesamtPcs || dn.refs.reduce(function(s, r){ return s + (r.qty||0); }, 0);
              tamDeliveryNotes[dn.zyCode] = {
                zyCode:    dn.zyCode,
                refs:      dn.refs,
                fileName:  file.name,
                gesamtPcs: gesamtPcs,
                fromExcel: true,
                motorD:    true
              };
              newZyCodes.push(dn.zyCode);
              count++;
            });
            if (count > 0) console.log('TAM DN Excel Motor D: imported', count, 'DNs');
          }
          if (count === 0) tamShowDNError('Motor D não conseguiu identificar DNs no Excel. Verifica o formato do ficheiro.');
        } catch(emd) {
          tamMotorDSpinner(null);
          console.warn('TAM DN Excel Motor D fallback failed', emd);
          tamShowDNError('Erro ao ler Excel: formato não reconhecido.');
        }
      }
      tamRebuildDNMap();
      tamCheckOrphanDNs(newZyCodes);
      tamUpdateDNCount();
      tamScheduleSave();
      tamRenderDNVerification();
      tamRenderAll();

    } catch(e) {
      console.error('TAM DN Excel error', e);
      tamShowDNError('Erro ao ler Excel: ' + e.message);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     PONTE COM O EAN TOOL (ean-tool.js) — aplica delivery notes já
     resolvidas (cruzamento EAN→referência feito lá) à sessão activa.
     Mesma regra do import por Excel: não sobrescreve uma DN já
     carregada por PDF (fonte mais fiável tem prioridade).
     dnList: [{ zyCode, refs:[{ref,qty}], fileName, gesamtPcs }]
  ══════════════════════════════════════════════════════════════ */
  window.tamApplyImportedDeliveryNotes = function(dnList) {
    if (!dnList || !dnList.length) return { applied: 0, skipped: 0 };

    var applied = 0, skipped = 0;
    var newZyCodes = [];

    dnList.forEach(function(dn) {
      if (!dn || !dn.zyCode || !dn.refs || !dn.refs.length) return;
      if (tamDeliveryNotes[dn.zyCode] && tamDeliveryNotes[dn.zyCode].refs && tamDeliveryNotes[dn.zyCode].refs.length) {
        skipped++;
        return;
      }
      var gesamtPcs = dn.gesamtPcs || dn.refs.reduce(function(s, r){ return s + (r.qty||0); }, 0);
      tamDeliveryNotes[dn.zyCode] = {
        zyCode:      dn.zyCode,
        refs:        dn.refs,
        fileName:    dn.fileName || 'EAN Tool',
        gesamtPcs:   gesamtPcs,
        fromExcel:   true,
        fromEanTool: true
      };
      newZyCodes.push(dn.zyCode);
      applied++;
    });

    if (applied > 0) {
      tamRebuildDNMap();
      tamCheckOrphanDNs(newZyCodes);
      tamUpdateDNCount();
      tamScheduleSave();
      tamRenderDNVerification();
      tamRenderAll();
    }

    return { applied: applied, skipped: skipped };
  };

  /* ── Alimenta em segundo plano o catálogo do EAN Tool com os EAN reais
     capturados pelo parser primário de DN em PDF (ver refEans em
     tamParseDNFromItems). Não abre o overlay do EAN Tool — carrega o
     script se ainda não estiver presente (idêntico ao lazy-load já usado
     para o botão de Excel) e delega a fusão a tamEanToolIngestCatalog. */
  function tamPushEanCatalogFromPDF(entries) {
    if (!entries || !entries.length) return;
    if (typeof window.tamEanToolIngestCatalog === 'function') {
      window.tamEanToolIngestCatalog(entries);
    } else {
      tamLoadEanToolModule();
      if (typeof window.tamEanToolIngestCatalog === 'function') window.tamEanToolIngestCatalog(entries);
    }
  }

  async function tamHandleDeliveryNoteFiles(files) {
    var count = 0;
    var newZyCodes = [];
    var pdfCatalogEntries = [];
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
              y: pageH - item.transform[5] + offset,  /* top-to-bottom, page-adjusted */
              w: item.width || 0   /* usado pelo âncoramento por cabeçalho (ex: coluna Stück/Pieces) */
            });
          });
        }
        var dn = tamParseDNFromItems(allPageItems, file.name);
        if (dn) {
          tamDeliveryNotes[dn.zyCode] = dn; newZyCodes.push(dn.zyCode); count++;
          if (dn.refEans) {
            Object.keys(dn.refEans).forEach(function(ref) {
              if (dn.refEans[ref] && dn.refEans[ref].length) pdfCatalogEntries.push({ ref: ref, eans: dn.refEans[ref] });
            });
          }
        }
      } catch(e) { console.warn('DN parse error', file.name, e); }
    }
    tamRebuildDNMap();
    tamCheckOrphanDNs(newZyCodes);
    tamUpdateDNCount();
    tamScheduleSave();
    console.log('DN loaded:', count, Object.keys(tamDeliveryNotes));
    tamRenderDNVerification();
    tamRenderAll();
    tamPushEanCatalogFromPDF(pdfCatalogEntries);
  }


  /* ── Legacy text-based parser — used by camera OCR path (ZY code only) ── */
  function tamParseDNText(text, fileName) {
    var zyMatch = text.match(/ZY-\d{8}/);
    if (!zyMatch) return null;
    return { zyCode: zyMatch[0], refs: [], fileName: fileName, gesamtPcs: null };
  }

  /* ── Item-based DN parser v5 ─────────────────────────────────────────────
     Resilient multi-strategy parser. Does NOT rely on fixed X columns.
     Instead uses the EAN (13-digit barcode) as the structural anchor:
     every product line has exactly one EAN — its Y position is ground truth.

     Strategy (4 levels, applied in order, first success wins):

       LEVEL A — EAN-anchored REF detection (primary, layout-independent)
         For each EAN item, scan ALL items within a Y window above it
         (up to ~80pt = ~2 lines). The ref is the token that looks like a
         product code in that window, leftmost and highest up.

       LEVEL B — QTY column auto-calibration
         Detect the QTY column X by finding where integers 1-9999 cluster
         near EAN Y positions. No hardcoded X range needed.

       LEVEL C — REF column auto-calibration
         If level A finds refs, derive REF_X_MAX from the actual X of those
         refs + 40pt margin. Re-run with calibrated value.

       LEVEL D — Gesamtstückzahl fallback
         If refs found but sum ≠ declared total, trust declared total and
         emit a warning — never silently discard a parseable DN.

     Improvements vs v4:
       · No hardcoded QTY_X_MIN/MAX (auto-calibrated from EAN rows)
       · No hardcoded REF_X_MAX (auto-calibrated or wide scan)
       · QTY limit raised to 9999 (handles bags, accessories, 200+ pcs)
       · REF_RE replaced by broader tamIsDNRef() that also catches:
           HFA-POS-BAG1, HF-PO-301-0387, KY-PO-201-0622, YKK-PO2306014
           FaYa-2505109, GUY-2505132, BAT-PO-151-0121-1, etc.
       · Falls back gracefully: if no refs found via coordinates,
         tries a pure-text pass using Lot-Nr block structure.
  ─────────────────────────────────────────────────────────────────────────── */
  function tamParseDNFromItems(allPageItems, fileName) {
    var EAN_RE  = /^\d{13}$/;
    var BAD_STR = /^(ZY-|B2B-|DE-|HRB|UST|IBAN|BIC|GLS|DHL|DPD|FedEx|Hailys|Zabaione|Z-ONE|Versand|Lieferschein|Gesamtst|Bruttogewicht|Nettogewicht|Kunden|Konto|Karton|Datum|Seite|Modell|Farbe|Größe|Stück|Auftr|Herkunft|TAM\s|Valvo|Essener|Daimler|Hamburg|Michelfeld|Stuttgart|Volksbank|IBAN|info@)/i;
    /* Address-style codes: 1-2 letters + digits + dash + digits, e.g. B15-17 */
    var ADDR_RE = /^[A-Za-z]{1,2}\d+-\d+$/;
    /* Broader REF pattern for DN — covers all observed TAM/Hailys/Zabaione formats:
       HFA-POS-BAG1, HF-PO-301-0387, KY-PO-201-0622, FaYa-2505109,
       GUY-2505132, BAT-PO-151-0121-1, YKK-PO2306014, JY-20790,
       QJG-2508057, SXS-101-0114, WAL-C-201-0501, MIK-09160, etc.
       Rules: starts with 2-6 alpha, then at least one separator+alphanum segment,
       must contain at least one digit somewhere after the first separator,
       total length 5-25 chars. */
    var DN_REF_RE = /^(?!ZY-)[A-Za-z]{2,6}[-_](?:[A-Za-z]{1,4}[-_]){0,3}[A-Za-z0-9]*\d[A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+){0,4}$/;

    function tamIsDNRef(s) {
      if (!s || s.length < 4 || s.length > 30) return false;
      if (BAD_STR.test(s)) return false;
      if (ADDR_RE.test(s)) return false;
      if (/^\d/.test(s)) return false;          // starts with digit → not a ref
      if (!/\d/.test(s)) return false;           // no digit at all → not a ref
      if (DN_REF_RE.test(s)) return true;
      /* Also accept via KNOWN_REFS for backwards compat */
      return KNOWN_REFS.has(s.toUpperCase());
    }

    /* ── 1. ZY code ── */
    var zyCode = null;
    for (var i = 0; i < allPageItems.length; i++) {
      var m = allPageItems[i].str.match(/ZY-\d{8}/);
      if (m) { zyCode = m[0]; break; }
    }
    if (!zyCode) return null;

    /* ── 2. Gesamtstückzahl ── */
    var gesamtPcs = null;
    for (var i = 0; i < allPageItems.length; i++) {
      if (/Gesamtst/i.test(allPageItems[i].str)) {
        for (var j = i + 1; j < Math.min(i + 8, allPageItems.length); j++) {
          var gn = parseInt(allPageItems[j].str);
          if (!isNaN(gn) && gn >= 1 && gn <= 99999) { gesamtPcs = gn; break; }
        }
        break;
      }
    }

    /* ── 3. Locate all EAN items (structural anchors) ── */
    var eanItems = allPageItems.filter(function(it){ return EAN_RE.test(it.str); });
    if (!eanItems.length) {
      /* Sem EAN de 13 dígitos — o fornecedor pode ter mudado o layout da DN
         (já aconteceu: lotes agregados por referência, sem quebra por
         tamanho). Delega à cadeia de critérios de leitura, validados contra
         o Gesamtstückzahl que a própria DN declara. */
      return tamParseDNFallbackChain(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef, null);
    }

    /* ── 4. Auto-calibrate QTY column X from items that appear near EAN Y positions ──
       For each EAN, look at items within EAN_Y_TOL in Y. Among those, integers
       1-9999 are qty candidates. Collect their X positions to find the qty column. */
    var EAN_Y_TOL = 6;   /* pt — generous to handle slight vertical misalignment */
    var qtyXList  = [];

    eanItems.forEach(function(ean) {
      allPageItems.forEach(function(it) {
        if (Math.abs(it.y - ean.y) > EAN_Y_TOL) return;
        if (!/^\d{1,4}$/.test(it.str)) return;
        var v = parseInt(it.str);
        if (v < 1 || v > 9999) return;
        /* Exclude the EAN itself and 13-digit numbers */
        if (it.str === ean.str) return;
        qtyXList.push(it.x);
      });
    });

    /* Derive QTY column X using mode (most frequent X bucket, 10pt buckets).
       Tight ±25pt margin avoids capturing the SIZE column (~50pt to the left). */
    var QTY_X_MIN, QTY_X_MAX;
    if (qtyXList.length >= 2) {
      var buckets = {};
      qtyXList.forEach(function(x) {
        var bucket = Math.round(x / 10) * 10;
        buckets[bucket] = (buckets[bucket] || 0) + 1;
      });
      var modeX = null, modeCount = 0;
      Object.keys(buckets).forEach(function(b) {
        if (buckets[b] > modeCount) { modeCount = buckets[b]; modeX = parseFloat(b); }
      });
      QTY_X_MIN = modeX - 25;
      QTY_X_MAX = modeX + 25;
    } else {
      /* Fallback: v4 proven range */
      QTY_X_MIN = 370;
      QTY_X_MAX = 420;
    }

    /* ── 5. LEVEL A — EAN-anchored REF detection ──
       For each EAN, look upward for a ref within REF_SCAN_ABOVE pt.
       If none found (e.g. product block split across pages), inherit the
       last ref seen before this EAN in reading order (Y-sorted scan).
       This handles page-break splits correctly without any page awareness.
    */
    var REF_SCAN_ABOVE = 120;  /* pt — normal same-page window */

    function hasNearbyEAN(y) {
      for (var k = 0; k < eanItems.length; k++) {
        if (Math.abs(eanItems[k].y - y) <= EAN_Y_TOL) return true;
      }
      return false;
    }

    /* Sort all items top-to-bottom (ascending Y = earlier in reading order) */
    var itemsSorted = allPageItems.slice().sort(function(a,b){ return a.y - b.y; });

    /* Map: eanY → ref string.
       Pass 1 — try normal window scan (ref within REF_SCAN_ABOVE above EAN). */
    var eanToRef = {};
    eanItems.forEach(function(ean) {
      var candidates = allPageItems.filter(function(it) {
        return it.y < ean.y && it.y >= ean.y - REF_SCAN_ABOVE && tamIsDNRef(it.str);
      });
      if (!candidates.length) return;
      candidates.sort(function(a,b){ return b.y - a.y; });
      eanToRef[ean.y] = candidates[0].str;
    });

    /* Pass 2 — for EANs that still have no ref (cross-page split),
       inherit ref within the SAME Lot-Nr block only.
       Segment items into Lot blocks, carry the block's ref to orphan EANs.
       Never leaks across Lot boundaries. */
    (function() {
      var blocks = [];
      var currentBlock = null;

      for (var si = 0; si < itemsSorted.length; si++) {
        var it = itemsSorted[si];
        if (/^Lot-Nr/i.test(it.str)) {
          currentBlock = { ref: null, eanYs: [] };
          blocks.push(currentBlock);
          continue;
        }
        if (/^Gesamtst/i.test(it.str)) break;
        if (!currentBlock) {
          currentBlock = { ref: null, eanYs: [] };
          blocks.push(currentBlock);
        }
        if (currentBlock.ref === null && tamIsDNRef(it.str) && !BAD_STR.test(it.str)) {
          currentBlock.ref = it.str;
        }
        if (/^\d{13}$/.test(it.str)) {
          currentBlock.eanYs.push(it.y);
        }
      }

      blocks.forEach(function(block) {
        if (!block.ref) return;
        block.eanYs.forEach(function(ey) {
          if (!eanToRef[ey]) eanToRef[ey] = block.ref;
        });
      });
    })();

    /* ── 6. Accumulate QTY per ref ── */
    var refAccum = {}, refOrder = [];

    allPageItems.forEach(function(it) {
      /* Must be in QTY column range */
      if (it.x < QTY_X_MIN || it.x > QTY_X_MAX) return;
      /* Must be a positive integer up to 9999 */
      if (!/^\d{1,4}$/.test(it.str)) return;
      var qty = parseInt(it.str);
      if (qty < 1 || qty > 9999) return;
      /* Must have an EAN nearby in Y */
      if (!hasNearbyEAN(it.y)) return;
      /* Find the ref for the nearest EAN */
      var bestRef = null, bestDist = Infinity;
      eanItems.forEach(function(ean) {
        var dist = Math.abs(ean.y - it.y);
        if (dist <= EAN_Y_TOL && dist < bestDist) {
          bestDist = dist;
          bestRef  = eanToRef[ean.y] || null;
        }
      });
      if (!bestRef) return;

      if (!refAccum.hasOwnProperty(bestRef)) {
        refAccum[bestRef] = 0;
        refOrder.push(bestRef);
      }
      refAccum[bestRef] += qty;
    });

    var refs = refOrder
      .map(function(ref){ return { ref:ref, qty:refAccum[ref] }; })
      .filter(function(r){ return r.qty > 0; });

    /* ── 6b. Capturar os EAN reais por referência (leitura adicional só de
       apoio — não interfere na deteção de ref/qty acima nem na cadeia de
       fallback). Reaproveita eanItems/eanToRef já calculados, agrupando o
       código de barras que já serviu de âncora posicional para cada ref,
       para poder alimentar depois o catálogo EAN. */
    var refEans = {};
    eanItems.forEach(function(ean) {
      var ref = eanToRef[ean.y];
      if (!ref) return;
      if (!refEans[ref]) refEans[ref] = [];
      if (refEans[ref].indexOf(ean.str) === -1) refEans[ref].push(ean.str);
    });

    /* ── 7. Validar contra o Gesamtstückzahl declarado na própria DN.
       Encontrar refs não chega — se a soma não bater com o total que a DN
       diz ter, a leitura pode estar errada (ex.: mudança de layout do
       fornecedor). Delega à cadeia de critérios: só aceita de imediato o
       que reconciliar com o total declarado; senão tenta os outros
       critérios de leitura antes de se dar por vencido. */
    var eanResult = refs.length ? { zyCode:zyCode, refs:refs, fileName:fileName, gesamtPcs:gesamtPcs, refEans:refEans } : null;
    return tamParseDNFallbackChain(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef, eanResult);
  }

  /* ══════════════════════════════════════════════════════════════
     CADEIA DE CRITÉRIOS DE LEITURA DE DN — auto-detecção de formato
     O fornecedor pode mudar o layout da DN a qualquer momento (já
     aconteceu). Em vez de confiar cegamente no primeiro critério que
     encontrar alguma coisa, cada candidato é validado contra o
     Gesamtstückzahl que a própria DN declara — a única "verdade" que
     não depende de como o PDF está desenhado. Só quando NENHUM critério
     reconcilia é que se aceita o melhor resultado disponível, e mesmo
     assim marcado como não confirmado (parseUnconfirmed) para alertar
     o utilizador na UI em vez de falhar silenciosamente.
  ══════════════════════════════════════════════════════════════ */
  function tamParseDNFallbackChain(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef, primaryResult) {
    function sumOf(res) { return res.refs.reduce(function(s,r){ return s + r.qty; }, 0); }
    function matches(res) {
      return !!(res && res.refs && res.refs.length && (gesamtPcs === null || sumOf(res) === gesamtPcs));
    }

    if (matches(primaryResult)) return primaryResult;

    var qtyCol = tamParseDNFromItemsQtyColumn(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef);
    if (matches(qtyCol)) return qtyCol;

    var fb = tamParseDNFromItemsTextFallback(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef);
    if (matches(fb)) return fb;

    /* Nenhum critério reconciliou com o total declarado — usa o melhor
       resultado não-vazio disponível (o mais estrutural primeiro) mas
       marca como não confirmado em vez de aceitar às cegas. */
    var best = (primaryResult && primaryResult.refs && primaryResult.refs.length) ? primaryResult
             : (qtyCol && qtyCol.refs && qtyCol.refs.length) ? qtyCol
             : fb;
    if (!best || !best.refs || !best.refs.length) {
      console.warn('TAM DN: nenhum critério de leitura encontrou referências para', zyCode, fileName);
      return null;
    }
    best.parseUnconfirmed = true;
    console.warn('TAM DN: leitura não confirmada (nenhum critério bate com o Gesamtstückzahl declarado) —',
      zyCode, fileName, '· soma:', sumOf(best), '· declarado:', gesamtPcs);
    return best;
  }

  /* ── DN parser — formato "lote agregado" sem EAN de 13 dígitos ──────────
     Layout observado a partir de 06/2026: cada bloco Lot-Nr traz uma única
     linha por referência já com a quantidade total do lote (sem quebra por
     tamanho nem EAN de 13 dígitos por linha). Sem EAN como âncora, a coluna
     de quantidade é isolada pela posição X do próprio cabeçalho
     "Stück/Pieces" da DN — evita o bug do fallback genérico de texto, que
     soma qualquer inteiro solto do bloco (códigos de cor/estilo inclusive).
  ─────────────────────────────────────────────────────────────────────── */
  function tamParseDNFromItemsQtyColumn(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef) {
    var hdr = null;
    for (var i = 0; i < allPageItems.length; i++) {
      if (/^Stück\/Pieces$/i.test(allPageItems[i].str)) { hdr = allPageItems[i]; break; }
    }
    if (!hdr) return null;   /* cabeçalho não encontrado — deixa para o fallback genérico */

    var QTY_X_MIN = hdr.x - 6;
    var QTY_X_MAX = hdr.x + (hdr.w || 45) + 8;

    var sorted = allPageItems.slice().sort(function(a,b){ return a.y - b.y; });
    var refAccum = {}, refOrder = [];
    var currentRef = null;

    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i].str;
      if (/^Lot-Nr/i.test(s)) { currentRef = null; continue; }
      if (/^Gesamtst/i.test(s)) break;
      if (currentRef === null && tamIsDNRef(s)) {
        currentRef = s;
        if (!refAccum.hasOwnProperty(currentRef)) {
          refAccum[currentRef] = 0;
          refOrder.push(currentRef);
        }
        continue;
      }
      if (currentRef !== null && /^\d{1,4}$/.test(s)) {
        var x = sorted[i].x;
        if (x < QTY_X_MIN || x > QTY_X_MAX) continue;   /* fora da coluna Stück/Pieces */
        var v = parseInt(s);
        if (v >= 1 && v <= 9999) refAccum[currentRef] += v;
      }
    }

    var refs = refOrder
      .map(function(ref){ return { ref:ref, qty:refAccum[ref] }; })
      .filter(function(r){ return r.qty > 0; });
    if (!refs.length) return null;

    return { zyCode:zyCode, refs:refs, fileName:fileName, gesamtPcs:gesamtPcs };
  }

  /* ── DN text-structure fallback ─────────────────────────────────────────
     Used when EAN-anchored strategy fails (e.g. very unusual layouts).
     Reads the Lot-Nr block structure: each product block starts with a
     "Lot-Nr." header line, followed by the ref code on the next item,
     and ends before the next Lot-Nr or Gesamtstückzahl.
     Qty is the sum of all integers found between ref and next block start.
  ─────────────────────────────────────────────────────────────────────────── */
  function tamParseDNFromItemsTextFallback(allPageItems, zyCode, fileName, gesamtPcs, tamIsDNRef) {
    /* Sort items top-to-bottom by Y */
    var sorted = allPageItems.slice().sort(function(a,b){ return a.y - b.y; });
    var refAccum = {}, refOrder = [];
    var currentRef = null;

    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i].str;
      /* New block starts at Lot-Nr line */
      if (/^Lot-Nr/i.test(s)) { currentRef = null; continue; }
      /* Gesamtstückzahl ends all blocks */
      if (/^Gesamtst/i.test(s)) break;
      /* First ref-like token after a block start becomes the current ref */
      if (currentRef === null && tamIsDNRef(s)) {
        currentRef = s;
        if (!refAccum.hasOwnProperty(currentRef)) {
          refAccum[currentRef] = 0;
          refOrder.push(currentRef);
        }
        continue;
      }
      /* Accumulate integer quantities while inside a block */
      if (currentRef !== null && /^\d{1,4}$/.test(s)) {
        var v = parseInt(s);
        if (v >= 1 && v <= 9999) refAccum[currentRef] += v;
      }
    }

    var refs = refOrder
      .map(function(ref){ return { ref:ref, qty:refAccum[ref] }; })
      .filter(function(r){ return r.qty > 0; });

    if (!refs.length) return null;
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

      /* ── Call Motor D photo mode ──
         Strategy: send the refs of the specific DN being photographed.
         Since we don’t know the ZY until Motor D replies, we do a first
         pass with no refs (just ZY detection), then a second pass with the
         exact refs of that DN in order so Motor D can read the manuscript
         column-by-column with full context.
      ── */

      /* Pass 1 — ZY detection only (no refs) */
      tamMotorDSpinner('a ler foto...');
      var mdResult = await tamMotorDCall({
        mode:        'photo',
        imageBase64: base64,
        mediaType:   imageFile.type || 'image/jpeg',
        refs:        []   /* no refs yet — just find the ZY code */
      });
      tamMotorDSpinner(null);

      /* Extract ZY code */
      var zyCode = mdResult && mdResult.zyCode ? mdResult.zyCode : null;

      /* Pass 2 — if ZY found and DN is loaded, re-call with exact refs in order */
      if (zyCode && tamDeliveryNotes[zyCode]) {
        var dnRefs = tamDeliveryNotes[zyCode].refs || [];
        if (dnRefs.length > 0) {
          tamMotorDSpinner('a ler distribuição...');
          var mdResult2 = await tamMotorDCall({
            mode:        'photo',
            imageBase64: base64,
            mediaType:   imageFile.type || 'image/jpeg',
            refs:        dnRefs.map(function(r){ return r.ref; })
          });
          tamMotorDSpinner(null);
          /* Use the second result if it returned a distribution */
          if (mdResult2 && mdResult2.distribution && mdResult2.distribution.length) {
            mdResult = mdResult2;
            if (!mdResult.zyCode) mdResult.zyCode = zyCode; /* preserve ZY from pass 1 */
          }
        }
      }

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
        ? mdResult.distribution.slice() : null;
      var confidence   = mdResult && mdResult.confidence ? mdResult.confidence : null;

      /* ── POST-PROCESS: right-column overflow = continuation of last row ──
         When there is no space on the paper, the user writes values for the
         last ref on the right side. Motor D may return these as a separate
         rightColumn array [{f,p}] or as entries with no ref.
         Rule: merge right-column data into the corresponding ref by position. */
      if (distribution && distribution.length) {
        /* Case A: Motor D returns a separate rightColumn array */
        if (mdResult.rightColumn && mdResult.rightColumn.length) {
          mdResult.rightColumn.forEach(function(rc, i) {
            var dnRef = dn.refs[i];
            if (!dnRef) return;
            var existing = null;
            for (var di=0; di<distribution.length; di++) {
              if (distribution[di].ref === dnRef.ref) { existing = distribution[di]; break; }
            }
            if (existing) {
              if (rc.f != null && (existing.f == null || existing.f === 0)) existing.f = rc.f;
              if (rc.p != null && (existing.p == null || existing.p === 0)) existing.p = rc.p;
            } else {
              distribution.push({ ref: dnRef.ref, f: rc.f != null ? rc.f : null, p: rc.p != null ? rc.p : null });
            }
          });
        }
        /* Case B: entries with no/empty ref = continuation of last valid ref */
        var lastValidRef = null;
        for (var di=0; di<distribution.length; di++) {
          var d = distribution[di];
          if (d.ref && d.ref.trim()) {
            lastValidRef = d.ref;
          } else if (lastValidRef) {
            for (var dj=0; dj<distribution.length; dj++) {
              if (distribution[dj].ref === lastValidRef) {
                if (d.f != null && (distribution[dj].f == null || distribution[dj].f === 0)) distribution[dj].f = d.f;
                if (d.p != null && (distribution[dj].p == null || distribution[dj].p === 0)) distribution[dj].p = d.p;
                break;
              }
            }
          }
        }
        /* Remove ref-less orphan entries after merging */
        distribution = distribution.filter(function(d){ return d.ref && d.ref.trim(); });
      }

      /* fromPhoto=true: boxes must NOT auto-lock if distribution is incomplete */
      tamShowDNDistribModal(dn, distribution, confidence, true);

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
      tamRenderDNVerification();
      tamRenderAll();
    }
  }

  function tamCheckOrphanDNs(newZyCodes) {
    if (!newZyCodes || !newZyCodes.length) return;
    if (!tamInvoices || !tamInvoices.length) return;
    var knownZYs = Object.keys(tamDNtoInvIdx);
    if (!knownZYs.length) return; /* facturas sem dnList — não é possível validar */
    var orphans = newZyCodes.filter(function(zy) {
      return !tamDNtoInvIdx.hasOwnProperty(zy);
    });
    if (!orphans.length) return;
    orphans.forEach(function(zy) { delete tamDeliveryNotes[zy]; });
    var msg = orphans.length === newZyCodes.length
      ? 'Nenhuma das delivery notes carregadas pertence a uma fatura da sessão.'
      : orphans.length + ' delivery note' + (orphans.length > 1 ? 's' : '') +
        ' ignorada' + (orphans.length > 1 ? 's' : '') +
        ' — não pertence' + (orphans.length > 1 ? 'm' : '') +
        ' a nenhuma fatura da sessão: ' + orphans.join(', ');
    tamShowDNError(msg);
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

  function tamShowDNWarnBanner(modal, dist, exp) {
    /* Remove any existing banner first */
    var existing = modal.querySelector('#tam-dn-warn-banner');
    if (existing) existing.parentNode.removeChild(existing);
    var footer = modal.querySelector('#tam-dn-footer');
    if (!footer) return;
    var banner = document.createElement('div');
    banner.id = 'tam-dn-warn-banner';
    banner.innerHTML =
      '<div class="tam-dn-wb-icon">\u26a0</div>' +
      '<div class="tam-dn-wb-msg">' +
        '<span class="tam-dn-wb-nums">' + dist + ' \u2260 ' + exp + ' pcs</span>' +
        '<span class="tam-dn-wb-text">O total distribu\u00eddo n\u00e3o coincide com a DN. Confirmas mesmo assim?</span>' +
      '</div>' +
      '<div class="tam-dn-wb-btns">' +
        '<button class="tam-dn-wb-fix">corrigir</button>' +
        '<button class="tam-dn-wb-go">confirmar mesmo assim \u2192</button>' +
      '</div>';
    footer.parentNode.insertBefore(banner, footer);
    requestAnimationFrame(function(){ banner.classList.add('tam-dn-wb-visible'); });
    banner.querySelector('.tam-dn-wb-fix').addEventListener('click', function() {
      banner.classList.remove('tam-dn-wb-visible');
      setTimeout(function(){ if (banner.parentNode) banner.parentNode.removeChild(banner); }, 280);
    });
    banner.querySelector('.tam-dn-wb-go').addEventListener('click', function() {
      modal._distribWarnAck = true;
      banner.classList.remove('tam-dn-wb-visible');
      setTimeout(function(){
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        var confirmBtn = modal.querySelector('#tam-dn-confirm-btn');
        if (confirmBtn) confirmBtn.click();
      }, 220);
    });
  }

  function tamShowDNDistribModal(dn, motorDDistrib, motorDConf, fromPhoto) {
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
          '<button class="tam-dn-qbtn tam-dn-f100" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'">F</button>' +
          '<button class="tam-dn-qbtn tam-dn-p100" data-ref="'+tamEsc(r.ref)+'" data-qty="'+r.qty+'">PS</button>' +
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
              '<th class="tam-dn-th tam-dn-th-t">T</th>' +
              '<th class="tam-dn-th tam-dn-th-f"><button class="tam-dn-col-btn tam-dn-col-btn-f">FNC</button></th>' +
              '<th class="tam-dn-th tam-dn-th-p"><button class="tam-dn-col-btn tam-dn-col-btn-p">PXO</button></th>' +
              '<th class="tam-dn-th"></th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="tam-dn-footer">' +
          (dn.distribConfirmed
            ? '<button id="tam-dn-confirm-btn" class="tam-dn-action-btn" style="border-color:#E8A44A;color:#C47A1E;">\u270F editar distribui\u00e7\u00e3o</button>'
            : '<button id="tam-dn-confirm-btn" class="tam-dn-action-btn">\u2713 Confirmar distribui\u00e7\u00e3o</button>') +
          '<button id="tam-dn-cancel-btn" class="tam-dn-cancel-btn">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('tam-dn-visible'); });

    /* ── Column-fill buttons: FNC fills 100% F, 0 P; PXO fills 100% P, 0 F ── */
    modal.querySelector(".tam-dn-col-btn-f").addEventListener("click", function() {
      dn.refs.forEach(function(r) {
        var safe = r.ref.replace(/[^a-z0-9]/gi, "_");
        var fi = modal.querySelector("#tam-dn-f-" + safe);
        var pi = modal.querySelector("#tam-dn-p-" + safe);
        if (fi) { fi.value = r.qty; fi.dispatchEvent(new Event("input", {bubbles:true})); }
        if (pi) { pi.value = 0;     pi.dispatchEvent(new Event("input", {bubbles:true})); }
      });
    });
    modal.querySelector(".tam-dn-col-btn-p").addEventListener("click", function() {
      dn.refs.forEach(function(r) {
        var safe = r.ref.replace(/[^a-z0-9]/gi, "_");
        var fi = modal.querySelector("#tam-dn-f-" + safe);
        var pi = modal.querySelector("#tam-dn-p-" + safe);
        if (fi) { fi.value = 0;     fi.dispatchEvent(new Event("input", {bubbles:true})); }
        if (pi) { pi.value = r.qty; pi.dispatchEvent(new Event("input", {bubbles:true})); }
      });
    });

    /* ── Pre-fill from confirmed distribution when editing ── */
    if (dn.distribConfirmed && dn.lastPhotoDistrib && dn.lastPhotoDistrib.length && !motorDDistrib) {
      dn.lastPhotoDistrib.forEach(function(d) {
        if (!d || !d.ref) return;
        var safe = d.ref.replace(/[^a-z0-9]/gi, '_');
        var fi = modal.querySelector('#tam-dn-f-' + safe);
        var pi = modal.querySelector('#tam-dn-p-' + safe);
        if (fi && d.f != null) { fi.value = d.f; fi.classList.add('tam-dn-inp-prefilled'); }
        if (pi && d.p != null) { pi.value = d.p; pi.classList.add('tam-dn-inp-prefilled'); }
      });
      var subEl0 = modal.querySelector('#tam-dn-sub');
      if (subEl0) subEl0.innerHTML = 'Delivery Note &middot; distribui\u00e7\u00e3o j\u00e1 confirmada &middot; <span class="tam-dn-md-high">\u2713 a editar</span>';
    }

    /* ── Motor D pre-fill + arithmetic confidence check ── */
    if (motorDDistrib && motorDDistrib.length) {

      /* Step 1: fill inputs */
      motorDDistrib.forEach(function(d) {
        if (!d || !d.ref) return;
        var safe = d.ref.replace(/[^a-z0-9]/gi, '_');
        var fi = modal.querySelector('#tam-dn-f-' + safe);
        var pi = modal.querySelector('#tam-dn-p-' + safe);
        var row = fi ? fi.closest('tr') : null;
        if (fi) {
          if (d.f != null) { fi.value = d.f; fi.classList.add('tam-dn-inp-prefilled'); }
          else             { fi.value = '';  fi.classList.add('tam-dn-inp-unclear'); }
        }
        if (pi) {
          if (d.p != null) { pi.value = d.p; pi.classList.add('tam-dn-inp-prefilled'); }
          else             { pi.value = '';  pi.classList.add('tam-dn-inp-unclear'); }
        }
        if (row) row.classList.add('tam-dn-row-prefilled');
      });

      /* Step 2: validate each row — F+P must equal Total.
         Motor D's self-reported confidence is overridden by arithmetic. */
      var mismatchCount = 0, nullCount = 0;
      dn.refs.forEach(function(r) {
        var safe2 = r.ref.replace(/[^a-z0-9]/gi, '_');
        var fi2  = modal.querySelector('#tam-dn-f-' + safe2);
        var pi2  = modal.querySelector('#tam-dn-p-' + safe2);
        var row2 = fi2 ? fi2.closest('tr') : null;
        if (!fi2 || !pi2 || !row2) return;
        var fVal = fi2.value === '' ? null : (parseInt(fi2.value) || 0);
        var pVal = pi2.value === '' ? null : (parseInt(pi2.value) || 0);
        if (fVal === null || pVal === null) { nullCount++; return; }
        var sum = fVal + pVal;
        var wc = row2.querySelector('.tam-dn-warn-cell');
        if (!wc) {
          wc = document.createElement('td');
          wc.className = 'tam-dn-warn-cell';
          wc.style.cssText = 'font-size:.68rem;font-weight:700;white-space:nowrap;padding:0 6px;vertical-align:middle;';
          row2.appendChild(wc);
        }
        if (sum !== r.qty) {
          mismatchCount++;
          fi2.classList.remove('tam-dn-inp-prefilled'); fi2.classList.add('tam-dn-inp-unclear');
          pi2.classList.remove('tam-dn-inp-prefilled'); pi2.classList.add('tam-dn-inp-unclear');
          fi2.style.borderColor = '#9B4D4D'; pi2.style.borderColor = '#9B4D4D';
          wc.style.color = '#9B4D4D';
          wc.textContent = '⚠ ' + sum + '≠' + r.qty;
        } else {
          fi2.style.borderColor = ''; pi2.style.borderColor = '';
          wc.style.color = '#4A7C6F'; wc.textContent = '✓';
        }
      });

      /* Step 3: effective confidence */
      var effectiveConf = mismatchCount > 0 ? 'low' : nullCount > 0 ? 'medium' : motorDConf;

      /* Step 4: confidence banner */
      var subEl = modal.querySelector('#tam-dn-sub');
      if (subEl) {
        /* Check if distributed total matches DN total */
        var dnExpected = dn.refs.reduce(function(s,r){ return s+r.qty; },0);
        var dnDistrib  = 0;
        dn.refs.forEach(function(r){
          var s2 = r.ref.replace(/[^a-z0-9]/gi,'_');
          var fi2 = modal.querySelector('#tam-dn-f-'+s2), pi2 = modal.querySelector('#tam-dn-p-'+s2);
          dnDistrib += (fi2?(parseInt(fi2.value)||0):0) + (pi2?(parseInt(pi2.value)||0):0);
        });
        var totalWrong = dnExpected > 0 && dnDistrib > 0 && dnDistrib !== dnExpected;
        if (totalWrong) mismatchCount = Math.max(mismatchCount, 1);

        var confLabel = effectiveConf === 'high' && !totalWrong
          ? '<span class="tam-dn-md-high tam-conf-badge tam-conf-ok">✓ Motor D · alta confiança</span>'
          : effectiveConf === 'medium' || (effectiveConf === 'high' && totalWrong)
            ? '<span class="tam-dn-md-med tam-conf-badge tam-conf-warn">⚠ Motor D · verifica os valores</span>'
            : mismatchCount > 0
              ? '<span class="tam-dn-md-low tam-conf-badge tam-conf-err">✗ Motor D · ' + mismatchCount + ' erro' + (mismatchCount>1?'s':'') + ' — corrige antes de confirmar</span>'
              : '<span class="tam-dn-md-low tam-conf-badge tam-conf-err">⚠ Motor D · verifica com atenção</span>';
        subEl.innerHTML = 'Delivery Note &middot; distribuir por loja &middot; ' + confLabel;
      }
    }

    function closeModal() {
      modal.classList.remove('tam-dn-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
    }
    modal.querySelector('#tam-dn-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#tam-dn-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#tam-dn-cancel-btn').addEventListener('click', closeModal);

    /* Live per-row mismatch validation */
    modal.querySelectorAll('.tam-dn-inp').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var row  = inp.closest('tr');
        if (!row) return;
        var qty  = parseInt(inp.getAttribute('data-qty')) || 0;
        var safe = inp.getAttribute('data-ref').replace(/[^a-z0-9]/gi,'_');
        var fi   = modal.querySelector('#tam-dn-f-' + safe);
        var pi   = modal.querySelector('#tam-dn-p-' + safe);
        var fVal = fi ? (parseInt(fi.value)||0) : 0;
        var pVal = pi ? (parseInt(pi.value)||0) : 0;
        var sum  = fVal + pVal;
        var wc   = row.querySelector('.tam-dn-warn-cell');
        if (!wc) {
          wc = document.createElement('td');
          wc.className = 'tam-dn-warn-cell';
          wc.style.cssText = 'font-size:.68rem;font-weight:700;white-space:nowrap;padding:0 6px;vertical-align:middle;';
          row.appendChild(wc);
        }
        if (qty > 0 && sum !== qty) {
          wc.style.color = '#9B4D4D'; wc.textContent = '⚠ ' + sum + '≠' + qty;
          if (fi) fi.style.borderColor = '#9B4D4D';
          if (pi) pi.style.borderColor = '#9B4D4D';
        } else if (qty > 0 && sum === qty) {
          wc.style.color = '#4A7C6F'; wc.textContent = '✓';
          if (fi) fi.style.borderColor = '';
          if (pi) pi.style.borderColor = '';
        } else {
          wc.textContent = '';
          if (fi) fi.style.borderColor = '';
          if (pi) pi.style.borderColor = '';
        }
      });
    });

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
      /* Warn if distributed total ≠ DN total */
      var _dnExp = dn.refs.reduce(function(s,r){ return s+r.qty; },0);
      var _dnDist = 0;
      dn.refs.forEach(function(r){
        var _s = r.ref.replace(/[^a-z0-9]/gi,'_');
        var _f = modal.querySelector('#tam-dn-f-'+_s), _p = modal.querySelector('#tam-dn-p-'+_s);
        _dnDist += (_f?(parseInt(_f.value)||0):0)+(_p?(parseInt(_p.value)||0):0);
      });
      if (_dnExp > 0 && _dnDist !== _dnExp) {
        if (!modal._distribWarnAck) {
          tamShowDNWarnBanner(modal, _dnDist, _dnExp);
          return;
        }
        delete modal._distribWarnAck;
      }

      // Always repair invIdx first — fixes legacy sessions where boxes lack invIdx
      tamRepairBoxInvIdx();

      var targetBox=null, targetBi=-1;
      var knownInvIdx = tamDNtoInvIdx.hasOwnProperty(dn.zyCode) ? tamDNtoInvIdx[dn.zyCode] : -1;

      function unlockBox(bi) {
        if (tamBoxLockTimers[bi]) { clearTimeout(tamBoxLockTimers[bi]); delete tamBoxLockTimers[bi]; }
        delete tamBoxLockPending[bi];
        tamSession.boxes[bi].locked = false;
        Object.keys(tamSession.boxes[bi].refs).forEach(function(ref){ tamRefDone.delete(ref); });
      }

      /* ── Box selection — each DN always gets its own exclusive box ──────────
         Priority order:
           0. Re-edit: a box already stamped with THIS DN → reuse it.
           1. An unlocked box with no dnZyCode (fresh or partially filled manually).
           2. All available boxes are stamped with OTHER DNs → create a new box
              dynamically. Never reopen a box belonging to a different DN.
         The invIdx (used for quickDistrib isolation and column rendering) is set
         on the box at creation/stamp time. tamRepairBoxInvIdx will not overwrite
         boxes that carry a dnZyCode, so dynamically added boxes are safe.
      ────────────────────────────────────────────────────────────────────────── */
      var resolvedInvIdx = knownInvIdx >= 0 ? knownInvIdx : 0;

      // Pass 0: re-edit — box already stamped with THIS DN → reuse directly
      for (var bi=0; bi<tamSession.boxes.length; bi++) {
        if (tamSession.boxes[bi].dnZyCode === dn.zyCode) {
          if (tamSession.boxes[bi].locked) unlockBox(bi);
          targetBox=tamSession.boxes[bi]; targetBi=bi; break;
        }
      }

      // Pass 1: first unlocked box with no dnZyCode and matching invIdx (prefer empty)
      if (!targetBox) {
        for (var bi=0; bi<tamSession.boxes.length; bi++) {
          var bx=tamSession.boxes[bi];
          if (bx.invIdx===resolvedInvIdx && !bx.locked && !bx.dnZyCode && Object.keys(bx.refs).length===0) {
            targetBox=bx; targetBi=bi; break;
          }
        }
      }
      // Pass 1b: unlocked, no dnZyCode, matching invIdx (may have manual refs)
      if (!targetBox) {
        for (var bi=0; bi<tamSession.boxes.length; bi++) {
          var bx=tamSession.boxes[bi];
          if (bx.invIdx===resolvedInvIdx && !bx.locked && !bx.dnZyCode) { targetBox=bx; targetBi=bi; break; }
        }
      }
      // Pass 2 REMOVED — a DN must NEVER write to a box belonging to a different invoice.
      // If no free box exists for resolvedInvIdx, Pass 3 creates one with the correct invIdx.

      // Pass 3: no suitable box found — CREATE a new box dynamically.
      // This is the normal case when all existing boxes are already stamped with other DNs.
      // The new box carries the correct invIdx so rendering and quickDistrib work correctly.
      // tamRepairBoxInvIdx will NOT overwrite it because it will have dnZyCode set below.
      if (!targetBox) {
        var newBox = { total: null, refs: {}, locked: false, invIdx: resolvedInvIdx };
        tamSession.boxes.push(newBox);
        targetBi = tamSession.boxes.length - 1;
        targetBox = newBox;
      }

      if (!targetBox) { tamShowDNError('Sem caixas na sess\u00e3o.'); return; }

      var totalQty = dn.refs.reduce(function(s,r){ return s+r.qty; }, 0);
      tamPushUndo();
      /* REPLACE only refs belonging to this DN — clears previous values for these refs,
         but never touches refs that may have been manually entered for other purposes */
      targetBox.dnZyCode = dn.zyCode;  /* stamp so header shows DN code */
      /* On re-edit: remove only the refs that were previously written by this DN */
      var dnRefKeys = dn.refs.map(function(r){ return r.ref; });
      Object.keys(targetBox.refs).forEach(function(existingRef){
        if (dnRefKeys.indexOf(existingRef) >= 0) delete targetBox.refs[existingRef];
      });
      dn.refs.forEach(function(r){
        var safe=r.ref.replace(/[^a-z0-9]/gi,'_');
        var fi=modal.querySelector('#tam-dn-f-'+safe), pi=modal.querySelector('#tam-dn-p-'+safe);
        var fVal=fi?(parseInt(fi.value)||0):0, pVal=pi?(parseInt(pi.value)||0):0;
        targetBox.refs[r.ref] = {f: fVal, p: pVal};
      });
      /* Mark confirmed and always save the user-confirmed values for replay */
      if (tamDeliveryNotes[dn.zyCode]) {
        tamDeliveryNotes[dn.zyCode].distribConfirmed = true;
        var savedDistrib = dn.refs.map(function(r) {
          var safe2 = r.ref.replace(/[^a-z0-9]/gi,'_');
          var fi2 = modal.querySelector('#tam-dn-f-' + safe2);
          var pi2 = modal.querySelector('#tam-dn-p-' + safe2);
          return { ref: r.ref, f: fi2 ? (parseInt(fi2.value)||0) : 0, p: pi2 ? (parseInt(pi2.value)||0) : 0 };
        });
        tamDeliveryNotes[dn.zyCode].lastPhotoDistrib = savedDistrib;
        tamDeliveryNotes[dn.zyCode].lastPhotoConf    = 'user_confirmed';
      }
      /* box.total = total pieces in this DN — always set from DN, never from an average.
         If the box already had a total from a previous DN, keep the larger value. */
      targetBox.total = Math.max(targetBox.total || 0, totalQty);

      /* Synchronous lock check — forces the box to close immediately so the next
         DN photo lands in a fresh box, without waiting for the 3s animation timer. */
      var recvNow = 0;
      Object.values(targetBox.refs).forEach(function(v){ recvNow += (v.f||0) + (v.p||0); });
      if (recvNow >= targetBox.total) {
        if (tamBoxLockTimers[targetBi]) { clearTimeout(tamBoxLockTimers[targetBi]); delete tamBoxLockTimers[targetBi]; }
        delete tamBoxLockPending[targetBi];
        targetBox.locked = true;
        /* Clear any completing-ref animations for refs in this box */
        Object.keys(targetBox.refs).forEach(function(ref){
          tamRefCompleting.delete(ref);
          if (tamRefCompletingTimers[ref]) { clearTimeout(tamRefCompletingTimers[ref]); delete tamRefCompletingTimers[ref]; }
        });
      }

      tamRenderAll();
      tamSaveSession(true);
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

      /* ── Leitura não confirmada: nenhum critério de parsing bateu com o
         Gesamtstückzahl que a própria DN declara (possível mudança de
         layout do fornecedor). Avisa sempre, independentemente do resto. ── */
      var unconfirmedDNs = loadedDNs.filter(function(zy){
        var d = tamDeliveryNotes[zy];
        return d && d.parseUnconfirmed;
      });
      var unconfirmedHtml = unconfirmedDNs.length
        ? '<div class="tam-dnv-missing-block">' +
            '<div class="tam-dnv-missing-hdr">⚠ Leitura automática não confirmada — ' +
              unconfirmedDNs.map(tamEsc).join(', ') +
              ' &mdash; a soma não bate com o Gesamtstückzahl da própria DN. Verifica com ✏ Editar.' +
            '</div>' +
          '</div>'
        : '';

      /* ── Progress indicator ── */
      var progressHtml;

      /* ── Warning: invoice declares more packages than DN codes parsed ── */
      var parsedShortHtml = parsedShort
        ? '<div class="tam-dnv-missing-block">' +
            '<div class="tam-dnv-missing-hdr">⚠ <strong>' + tamEsc(inv.invoiceNo) + '</strong>' +
              ' &mdash; a fatura declara ' + expectedDNs + ' pacotes mas apenas ' + totalDNs + ' códigos DN foram encontrados no PDF.' +
            '</div>' +
          '</div>'
        : '';

      if (!allLoaded) {
        var missingListHtml = missingDNs.map(function(zy) {
          return '<div class="tam-dnv-missing-item">' + tamEsc(zy) + '</div>';
        }).join('');
        progressHtml = parsedShortHtml +
          '<div class="tam-dnv-missing-block">' +
            '<div class="tam-dnv-missing-hdr">⚠ <strong>' + tamEsc(inv.invoiceNo) + '</strong>' +
              ' &mdash; ' + loadedDNs.length + ' / ' + expectedDNs + ' DNs carregadas' +
            '</div>' +
            (missingListHtml ? '<div class="tam-dnv-missing-list">' + missingListHtml + '</div>' : '') +
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
      blocks.push(unconfirmedHtml + progressHtml);
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
            delete dn.parseUnconfirmed;
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
      delete dn.parseUnconfirmed;
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
  var ZY_RE  = /\b(ZY-[\d]{8,})\b/;

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

  /* ── PRICE BLOCK (qtd + preço[s]) ─────────────────────────────────
     Formato normal:      qtd  preço/un        total
     Formato c/ desconto: qtd  preço bruto  desconto/un  preço líquido  total
     (ex.: "22 5,63 1,43 4,20 92,40" → bruto 5,63 − desconto 1,43 = líquido 4,20; 22×4,20=92,40)
     O formato de desconto só é aceite se a aritmética bater certo, para não
     confundir números extra de faturas normais com um desconto inexistente. */
  var PRICE_BLOCK_RE = /^(\d{1,4})\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})(?:\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2}))?/;

  function tamParsePriceBlock(after) {
    var m = after.match(PRICE_BLOCK_RE);
    if (!m) return null;
    var pieces = parseInt(m[1], 10);
    if (m[4] && m[5]) {
      var gross    = tamParseEU(m[2]);
      var discount = tamParseEU(m[3]);
      var net      = tamParseEU(m[4]);
      var total    = tamParseEU(m[5]);
      var netOk    = Math.abs(tamRound2(gross - discount) - net) < 0.02;
      var totalOk  = Math.abs(tamRound2(pieces * net) - total) < 0.02;
      if (netOk && totalOk) {
        return { pieces:pieces, unitPrice:net, total:total,
                 hasDiscount:true, grossUnitPrice:gross, discountPerUnit:discount };
      }
      /* aritmética não confirma desconto — trata como formato normal (2 números) */
    }
    return { pieces:pieces, unitPrice:tamParseEU(m[2]), total:tamParseEU(m[3]), hasDiscount:false };
  }
  function tamCleanName(n) {
    return String(n||'').replace(/\bModell\s*:\s*/gi,'').replace(/\b\d{8}\b/g,'').replace(/44/g,'').replace(/\s{2,}/g,' ').trim();
  }

  var GARMENT_WORDS = new Set(['Blouse','Dress','Skirt','Top','Trouser','Trousers','Cardigan','Pullover','Pullunder','Culotte','Scarf','Jacket','Coat','Shirt','Leggings','Vest','Jumper','Sweater','Blazer','Shorts','Pants','Tee','Tunic','Cape','Poncho','Bodysuit','Overall','Jumpsuit','Romper','Light']);
  var BRANDS_SET = new Set(['hailys','zabaione']);

  function tamExtractTypeAndName(beforeHS) {
    var cleaned = beforeHS.replace(/\bModell\s*:\s*/gi,'').replace(/\b\d{8}\b/g,'').replace(/\b\d{4,}\b/g,'').replace(/([A-Za-z])44([A-Za-z])/g,'$1$2').trim();
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

  /* ══════════════════════════════════════════════════════════════
     NOTAS DE CRÉDITO (Gutschrift) ─────────────────────────────
     Mesma estrutura tabular das faturas, mas quantidades e totais
     vêm com sinal "-" à direita (ex.: "22-", "198,00-"). O preço
     unitário nunca leva o sinal. Cada linha de artigo repete
     "Re-Nr./Invoic No.: NNNNNNNN" — o número (sem "ZY-") da fatura
     de origem, usado para validar a que fatura a nota pertence.
  ══════════════════════════════════════════════════════════════ */
  var CREDIT_PRICE_RE = /^(\d{1,4})-?\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})-?(?:\s+([\d.]*\d+,\d{2})\s+([\d.]*\d+,\d{2})-?)?/;

  function tamParseCreditNote(allRows) {
    var creditNo = null, creditDate = null;
    var refInvoiceNos = {};
    var currentRef = null, currentType = '', currentName = '';
    var lines = [];
    var shipping = 0, subtotalGoods = null, grandTotal = null;

    for (var i = 0; i < allRows.length; i++) {
      var tokens = allRows[i], joined = tokens.join(' ');

      var zyM = joined.match(/\b(ZY-\d{6,})\b/);
      if (zyM && !creditNo) creditNo = zyM[1];

      if (!creditDate && joined.indexOf('Datum/Date') >= 0) {
        var dM = joined.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dM) creditDate = dM[1];
      }

      var reM = joined.match(/Re-Nr\.?\/?Invoic\s*No\.?:?\s*(\d{5,})/i);
      if (reM) refInvoiceNos[reM[1]] = (refInvoiceNos[reM[1]] || 0) + 1;

      if (/Versandkosten|Transportation costs/i.test(joined)) {
        var shM = joined.match(/([\d.]*\d+,\d{2})-?\s*$/);
        if (shM) shipping = tamParseEU(shM[1]);
        continue;
      }
      if (/Zwischensumme\/Subtotal/i.test(joined)) {
        var subM = joined.match(/([\d.]*\d+,\d{2})-?\s*$/);
        if (subM) {
          if (subtotalGoods == null) subtotalGoods = tamParseEU(subM[1]);
          else grandTotal = tamParseEU(subM[1]);
        }
        continue;
      }
      if (/Gesamt\/Total/i.test(joined)) continue;

      var refC = tamIsRef(tokens[0]) ? tokens[0] : (!HS_RE.test(joined) ? tamFindRefInRow(tokens) : null);
      if (refC) { currentRef = refC; currentType = ''; currentName = ''; continue; }

      var hsM = joined.match(HS_RE);
      if (hsM && currentRef) {
        var hsPos = joined.indexOf(hsM[1]);
        var after = joined.slice(hsPos + 8).trim();
        var m = after.match(CREDIT_PRICE_RE);
        if (m) {
          var pieces = parseInt(m[1], 10);
          var tn = tamExtractTypeAndName(joined.slice(0, hsPos));
          if (tn.name) currentName = tn.name;
          if (tn.type) currentType = tn.type;
          var line = { ref: currentRef, garmentType: currentType, name: currentName, pieces: pieces, applied: false };
          if (m[4] && m[5]) {
            var gross = tamParseEU(m[2]), discount = tamParseEU(m[3]), net = tamParseEU(m[4]), total = tamParseEU(m[5]);
            var netOk   = Math.abs(tamRound2(gross - discount) - net) < 0.02;
            var totalOk = Math.abs(tamRound2(pieces * net) - total) < 0.02;
            if (netOk && totalOk) {
              line.unitPrice = net; line.total = total; line.hasDiscount = true;
              line.grossUnitPrice = gross; line.discountPerUnit = discount;
            } else {
              line.unitPrice = tamParseEU(m[2]); line.total = tamParseEU(m[3]); line.hasDiscount = false;
            }
          } else {
            line.unitPrice = tamParseEU(m[2]); line.total = tamParseEU(m[3]); line.hasDiscount = false;
          }
          lines.push(line);
        }
      }
    }

    var totalPieces      = lines.reduce(function(s,l){ return s + l.pieces; }, 0);
    var computedSubtotal = tamRound2(lines.reduce(function(s,l){ return s + l.total; }, 0));

    return {
      creditNo: creditNo,
      creditDate: creditDate,
      invoiceRefNos: Object.keys(refInvoiceNos),
      lines: lines,
      totalPieces: totalPieces,
      subtotalGoods: subtotalGoods != null ? subtotalGoods : computedSubtotal,
      shipping: shipping,
      grandTotal: grandTotal != null ? grandTotal : tamRound2(computedSubtotal + shipping)
    };
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
      if (!map[item.ref]) map[item.ref] = { ref:item.ref, garmentType:item.garmentType, name:item.name, pieces:0, totalCost:0, lines:[], hasDiscount:false, grossUnitPrice:0, discountPerUnit:0 };
      var g = map[item.ref];
      g.pieces    += item.pieces;
      g.totalCost  = tamRound2(g.totalCost + item.total);
      g.lines.push(item);
      if (item.name)        g.name = item.name;
      if (item.garmentType) g.garmentType = item.garmentType;
      if (item.hasDiscount) { g.hasDiscount = true; g.grossUnitPrice = item.grossUnitPrice; g.discountPerUnit = item.discountPerUnit; }
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
      /* grandTotal: use exact shipping fraction to avoid cumulative rounding error */
      g.grandTotal        = tamRound2(g.totalCost + shipPerPiece * g.pieces);
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
      g.grandTotal        = tamRound2(g.totalCost + shipPerPiece * g.pieces);
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

    // Se transporte = 0 → mostra alerta com botão PDF + input manual
    if (!tamDetectMissingShipping(r)) return;

    var alertEl = document.createElement('div');
    alertEl.className = 'tam-freight-alert';

    var fileInputId   = 'tam-freight-input-' + invIdx;
    var manualInputId = 'tam-freight-manual-' + invIdx;
    alertEl.innerHTML =
      '<span class="tam-freight-icon">🚚</span>' +
      '<span class="tam-freight-msg">Transporte não detetado na fatura · ' +
        '<strong>' + tamFmtEU(r.subtotalGoods) + ' €</strong> (só mercadoria)</span>' +
      '<label class="tam-freight-btn" for="' + fileInputId + '">' +
        '📎 Carregar fatura de transporte' +
        '<input type="file" id="' + fileInputId + '" accept="application/pdf" style="display:none">' +
      '</label>' +
      '<span class="tam-freight-sep" style="font-size:.72rem;color:#999;white-space:nowrap;">ou</span>' +
      '<div class="tam-freight-manual-wrap" style="display:flex;align-items:center;gap:5px;flex-shrink:0;">' +
        '<input type="text" id="' + manualInputId + '" placeholder="ex: 175,00" inputmode="decimal" autocomplete="off" style="' +
          'width:90px;padding:5px 8px;font-size:.78rem;font-weight:700;' +
          "font-family:'MontserratLight',sans-serif;border:1px solid #e0e0e0;" +
          'border-radius:7px;outline:none;background:#fff;color:#000;' +
          'transition:border-color .15s;text-align:right;">' +
        '<span style="font-size:.78rem;font-weight:700;color:#555;flex-shrink:0;">€</span>' +
        '<button class="tam-freight-manual-btn" data-inv="' + invIdx + '" style="' +
          'padding:5px 13px;font-size:.75rem;font-weight:700;cursor:pointer;' +
          "font-family:'MontserratLight',sans-serif;border:1px solid #4A7C6F;" +
          'border-radius:7px;background:transparent;color:#4A7C6F;' +
          'transition:all .14s;white-space:nowrap;">✓ aplicar</button>' +
        '<span class="tam-freight-manual-err" style="font-size:.72rem;color:#c00;display:none;white-space:nowrap;"></span>' +
      '</div>';

    containerEl.appendChild(alertEl);

    /* ── Listener: carregar PDF de transporte ── */
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
        var pkgs = freight.pkgs || r.shipPkgs || 0;
        tamApplyExternalShipping(invIdx, freight.cost, pkgs, file.name);
      } catch(err) {
        console.error('TAM freight parse error', err);
        if (btn) {
          btn.innerHTML = '<span style="color:#c00">⚠ Erro: ' + tamEsc(err.message) + '</span>';
        }
      }
    });

    /* ── Listener: valor manual ── */
    var manualInp = alertEl.querySelector('#' + manualInputId);
    var manualErr = alertEl.querySelector('.tam-freight-manual-err');
    var manualBtn = alertEl.querySelector('.tam-freight-manual-btn');

    /* focus/blur styles */
    manualInp.addEventListener('focus', function(){ manualInp.style.borderColor = '#4A7C6F'; });
    manualInp.addEventListener('blur',  function(){ manualInp.style.borderColor = '#e0e0e0'; });

    /* Enter key triggers apply */
    manualInp.addEventListener('keydown', function(e){
      if (e.key === 'Enter') { e.preventDefault(); manualBtn.click(); }
    });

    manualBtn.addEventListener('click', function(){
      manualErr.style.display = 'none';
      var raw  = manualInp.value.trim();
      if (!raw) {
        manualErr.textContent = 'introduz um valor';
        manualErr.style.display = 'inline';
        return;
      }
      var cost = tamParseEU(raw);
      if (isNaN(cost) || cost <= 0) {
        manualErr.textContent = 'valor inválido';
        manualErr.style.display = 'inline';
        manualInp.style.borderColor = '#c00';
        return;
      }
      tamApplyExternalShipping(invIdx, cost, r.shipPkgs || 0, 'manual');
    });

    manualBtn.addEventListener('mouseenter', function(){ manualBtn.style.background='rgba(74,124,111,.1)'; });
    manualBtn.addEventListener('mouseleave', function(){ manualBtn.style.background='transparent'; });
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
      g.grandTotal        = tamRound2(g.totalCost);  /* no shipping: exact totalCost */
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
        var pb = tamParsePriceBlock(after);
        if (pb) {
          var tn = tamExtractTypeAndName(joined.slice(0,hsPos));
          return { idx:idx, type:'DATA', garmentType:tn.type, name:tn.name,
                   pieces:pb.pieces, unitPrice:pb.unitPrice, total:pb.total,
                   hasDiscount:pb.hasDiscount, grossUnitPrice:pb.grossUnitPrice, discountPerUnit:pb.discountPerUnit };
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
        hasDiscount:row.hasDiscount, grossUnitPrice:row.grossUnitPrice, discountPerUnit:row.discountPerUnit,
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
        var pb=tamParsePriceBlock(after);
        if (pb) {
          var tn=tamExtractTypeAndName(joined.slice(0,hsPos));
          if (tn.name) currentName=tn.name;
          if (tn.type) currentType=tn.type;
          tagged.push({ idx:i, type:'DATA', ref:currentRef, garmentType:currentType, name:currentName,
                        pieces:pb.pieces, unitPrice:pb.unitPrice, total:pb.total,
                        hasDiscount:pb.hasDiscount, grossUnitPrice:pb.grossUnitPrice, discountPerUnit:pb.discountPerUnit }); continue;
        }
      }
      tagged.push({ idx:i, type:'OTHER' });
    }
    var rawItems=[];
    tagged.forEach(function(row){
      if (row.type!=='DATA') return;
      rawItems.push({ ref:row.ref, garmentType:row.garmentType, name:row.name,
        pieces:row.pieces, unitPrice:row.unitPrice, total:row.total,
        hasDiscount:row.hasDiscount, grossUnitPrice:row.grossUnitPrice, discountPerUnit:row.discountPerUnit,
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
      g.grandTotal=tamRound2(g.totalCost + shipPerPiece*g.pieces);
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
        '<button class="tam-session-btn" id="tam-sessions-btn" title="trocar de sessão">sessões</button>' +
        '<button class="tam-session-btn" id="tam-save-btn" title="guardar sessão">guardar</button>' +
        '<button class="tam-session-btn" id="tam-guia-bar-btn" title="guía consolidada" style="display:none">guía</button>' +
        '<label class="tam-session-btn" id="tam-dn-load-bar-btn" for="tam-dn-file-input" title="delivery notes PDF / Excel" style="display:none">delivery note' +
          '<input type="file" id="tam-dn-file-input" accept="application/pdf,.xlsx,.xls" multiple style="display:none">' +
        '</label>' +
        '<span id="tam-dn-count" style="display:none;color:#000;font-weight:700;font-size:.75rem;white-space:nowrap"></span>' +
        '<button id="tam-ean-tool-btn" class="tam-session-btn" title="Códigos EAN" style="display:none">EAN</button>' +
        '<label class="tam-session-btn" id="tam-dn-cam-bar-btn" for="tam-dn-cam-input" title="fotografar caixa" style="display:none">câmara' +
          '<input type="file" id="tam-dn-cam-input" accept="image/*" capture="environment" style="display:none">' +
        '</label>' +
        '<span id="tam-session-status"></span>';

      // Insertar ANTES del upload-zone para que aparezca en la parte superior
      var uz = document.getElementById('tam-upload-zone');
      if (uz) uz.parentNode.insertBefore(bar, uz);
      else tab.insertBefore(bar, tab.firstChild);

      var saveBtn = bar.querySelector('#tam-save-btn');
      if (saveBtn) saveBtn.addEventListener('click', function(){ tamSaveSession(false); });

      // ── Botão "sessões": só visível dentro de uma sessão activa (ver CSS
      // #tab-tam.tam-loaded #tam-sessions-btn) — em estado vazio o bloco
      // inline já está à vista, não faz falta um botão para o abrir. ──
      var sessBtn = bar.querySelector('#tam-sessions-btn');
      if (sessBtn) sessBtn.addEventListener('click', function(){ tamOpenSessionsSwitchModal(); });

      // ── Lista de sessões: bloco fixo por baixo da zona de carregar
      // fatura (visível só em estado vazio — ver CSS #tab-tam:not(.tam-loaded)).
      if (!document.getElementById('tam-sessions-inline')) {
        var sessInline = document.createElement('div');
        sessInline.id = 'tam-sessions-inline';
        sessInline.innerHTML =
          '<div class="tam-sessions-inline-title tam-sessions-title-target" id="tam-sessions-inline-title">sessões guardadas</div>' +
          '<div class="tam-sessions-list-target" id="tam-sessions-dropdown"></div>';
        if (uz && uz.parentNode) uz.parentNode.insertBefore(sessInline, uz.nextSibling);
        else tab.appendChild(sessInline);
        tamRefreshSessionsInline();
      }

      // ── Botón EAN Tool ──
      var eanToolBtn = bar.querySelector('#tam-ean-tool-btn');
      if (eanToolBtn) {
        eanToolBtn.addEventListener('click', function() {
          if (typeof window.tamOpenEanTool === 'function') {
            window.tamOpenEanTool();
          } else {
            tamLoadEanToolModule();
            if (typeof window.tamOpenEanTool === 'function') window.tamOpenEanTool();
          }
        });
      }

      /* ── Helper: perform actual session close (called after confirmation) ── */
      function tamDoCloseSession() {
        // Save current session first, then close after save completes
        tamSaveSession(false);
        tamLockRelease();
        // Reset state
        tamInvoices       = [];
        tamEngineCache    = {};
        tamActiveEngines  = {};
        tamSession        = null;
        tamDeliveryNotes  = {};   // ← DN nunca deben persistir entre sesiones
        tamDNVerifyState  = {};   // ← ídem estado de escalación
        tamDNtoInvIdx     = {};   // ← ídem índice de asignación DN→factura
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
        var dva = document.getElementById('tam-dn-verify-area');
        if (dva) dva.innerHTML = '';
        var pra = document.getElementById('tam-progress-area');
        if (pra) pra.innerHTML = '';
        // Reset session name field and status
        var sn = document.getElementById('tam-session-name');
        if (sn) sn.value = '';
        var ss = document.getElementById('tam-session-status');
        if (ss) ss.textContent = '';
        // Hide buttons that require an active session
        var expBtn = document.getElementById('tam-export-btn');
        if (expBtn) expBtn.classList.remove('show');
        document.getElementById('tam-save-btn').classList.remove('visible');
        var dnLoadBtn = document.getElementById('tam-dn-load-bar-btn');
        if (dnLoadBtn) dnLoadBtn.style.display = 'none';
        var dnCamBtn = document.getElementById('tam-dn-cam-bar-btn');
        if (dnCamBtn) dnCamBtn.style.display = 'none';
        var guiaBarBtnClose = document.getElementById('tam-guia-bar-btn');
        if (guiaBarBtnClose) guiaBarBtnClose.style.display = 'none';
        var eanToolBtnClose = document.getElementById('tam-ean-tool-btn');
        if (eanToolBtnClose) eanToolBtnClose.style.display = 'none';
        var dnCount = document.getElementById('tam-dn-count');
        if (dnCount) { dnCount.style.display = 'none'; dnCount.textContent = ''; }
        // Reset upload zone
        var lbl = document.getElementById('upload-label') || document.getElementById('tam-upload-label');
        if (lbl) lbl.classList.remove('loaded');
        document.getElementById('tab-tam').classList.remove('tam-loaded');
        document.getElementById('admin-app').classList.remove('tam-loaded');
        var statusMsg = document.getElementById('tam-status-msg');
        if (statusMsg) statusMsg.textContent = '';
        var fileName = document.getElementById('tam-file-name');
        if (fileName) fileName.textContent = '';
        // A sessão fechada acabou de ser guardada — refrescar a lista
        // inline (volta a ficar visível agora que saímos do estado carregado).
        tamRefreshSessionsInline();
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
          'padding:24px 28px 20px',
          'max-width:420px',
          'width:calc(100% - 48px)',
          'box-shadow:0 16px 64px rgba(0,0,0,.18)',
          'display:flex',
          'flex-direction:column',
          'gap:8px',
          'font-family:\'MontserratLight\',sans-serif'
        ].join(';');

        box.innerHTML =
          '<div style="font-size:.6rem;font-weight:700;letter-spacing:.12em;color:#000;opacity:.5;text-transform:uppercase;margin-bottom:4px;font-family:\'MontserratLight\',sans-serif">FECHAR SESSÃO</div>' +
          '<div style="font-size:1.05rem;font-weight:700;color:#000;margin-bottom:8px;font-family:\'MontserratLight\',sans-serif">Guardar e fechar a sessão activa?</div>' +
          '<div style="font-size:.82rem;color:#000;opacity:.6;margin-bottom:18px;font-weight:600;font-family:\'MontserratLight\',sans-serif">A sessão será guardada. Podes retomar a qualquer momento.</div>' +
          '<button id="tam-close-confirm-yes" style="' +
            'display:flex;align-items:center;justify-content:center;gap:10px;' +
            'padding:10px 20px;border-radius:8px;border:1px solid #9B4D4D;cursor:pointer;' +
            'background:transparent;color:#9B4D4D;font-size:.82rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;' +
            'transition:all .15s;margin-bottom:8px;text-transform:lowercase;' +
          '">guardar e fechar</button>' +
          '<button id="tam-close-confirm-no" style="' +
            'display:flex;align-items:center;justify-content:center;' +
            'padding:10px 20px;border-radius:8px;border:1px solid #e0e0e0;' +
            'background:transparent;color:#000;font-size:.82rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;cursor:pointer;' +
            'transition:all .15s;text-transform:lowercase' +
          '">cancelar</button>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Hover effects
        var yesBtn = box.querySelector('#tam-close-confirm-yes');
        var noBtn  = box.querySelector('#tam-close-confirm-no');
        yesBtn.addEventListener('mouseenter', function(){ this.style.background = 'rgba(155,77,77,.12)'; });
        yesBtn.addEventListener('mouseleave', function(){ this.style.background = 'transparent'; });
        noBtn.addEventListener('mouseenter',  function(){ this.style.background = '#f5f5f5'; });
        noBtn.addEventListener('mouseleave',  function(){ this.style.background = 'transparent'; });

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

      // Guia bar button → open consolidated guia
      var guiaBarBtn = bar.querySelector('#tam-guia-bar-btn');
      if (guiaBarBtn) guiaBarBtn.addEventListener('click', function(){ tamShowGuiaModal(null); });

      // DN buttons listeners
      var dnBarI = bar.querySelector('#tam-dn-file-input');
      if (dnBarI) dnBarI.addEventListener('change', function(e){
        var allFiles = Array.from(e.target.files);
        var pdfs   = allFiles.filter(function(f){ return f.type === 'application/pdf'; });
        var excels = allFiles.filter(function(f){ return /\.(xlsx|xls)$/i.test(f.name); });
        if (pdfs.length) tamHandleDeliveryNoteFiles(pdfs);
        if (excels.length) {
          // Excel passa sempre pelo motor único (EAN Tool): reconhece
          // catálogo e delivery notes, incluindo cruzamento EAN→referência
          // entre hojas, em vez do importador simples de uma só hoja.
          if (typeof window.tamEanToolIngestFiles === 'function') {
            window.tamEanToolIngestFiles(excels);
          } else {
            tamLoadEanToolModule();
            if (typeof window.tamEanToolIngestFiles === 'function') window.tamEanToolIngestFiles(excels);
          }
        }
        e.target.value = '';
      });
      var dnBarC = bar.querySelector('#tam-dn-cam-input');
      if (dnBarC) dnBarC.addEventListener('change', function(e){
        var file = e.target.files[0];
        if (file) tamHandleDNCameraPhoto(file);
        e.target.value = '';
      });
    }

    // Progress area — injected before results-wrap
    if (!document.getElementById('tam-progress-area')) {
      var pa = document.createElement('div');
      pa.id = 'tam-progress-area';
      var rw0 = document.getElementById('tam-results-wrap');
      if (rw0) rw0.parentNode.insertBefore(pa, rw0);
      else tab.appendChild(pa);
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

    // DN verification area — injected after reception area
    if (!document.getElementById('tam-dn-verify-area')) {
      var dva = document.createElement('div');
      dva.id = 'tam-dn-verify-area';
      var recArea2 = document.getElementById('tam-reception-area');
      if (recArea2 && recArea2.nextSibling) recArea2.parentNode.insertBefore(dva, recArea2.nextSibling);
      else if (recArea2) recArea2.parentNode.appendChild(dva);
      else tab.appendChild(dva);
    }

    // ── adm-back-btn: guardar e fechar sessão antes de voltar ao dashboard ──
    (function() {
      var backBtn = document.getElementById('adm-back-btn');
      if (!backBtn || backBtn._tamBound) return;
      backBtn._tamBound = true;
      backBtn.addEventListener('click', function(e) {
        if (!tamSession) return;
        e.stopImmediatePropagation();
        tamSaveSession(false);
        tamDoCloseSession();
        setTimeout(function() {
          backBtn._tamBound = false;
          backBtn.click();
          backBtn._tamBound = true;
        }, 80);
      }, true);
    })();
  })();

  /* ══════════════════════════════════════════════════════════════
     MÓDULO EAN TOOL — fundido de ean-tool.js
     Antes: ficheiro à parte, carregado sob demanda via <script> nos
     3 pontos acima (tamPushEanCatalogFromPDF, botão EAN, import Excel).
     Agora: mesma função, chamada diretamente — carrega-se na mesma
     altura (1ª utilização real), zero mudança de comportamento.
  ══════════════════════════════════════════════════════════════ */
function tamLoadEanToolModule() {
  'use strict';

  // ── Evitar doble inicialización ──
  if (window._eanToolInitialized) return;
  window._eanToolInitialized = true;

  // ═══════════════════════════════════════════════════════════════
  //  DEPENDENCIAS EXTERNAS — inyectar si no están presentes
  // ═══════════════════════════════════════════════════════════════
  function loadScript(src, id, onload) {
    if (document.getElementById(id)) { if (onload) onload(); return; }
    var s = document.createElement('script');
    s.id  = id;
    s.src = src;
    if (onload) s.onload = onload;
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════
  //  HTML — overlay contenedor + modal de resultados
  // ═══════════════════════════════════════════════════════════════
  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    '<div id="ean-tool-overlay">' +
      '<div id="ean-tool-wrap">' +

        /* cabecera de la ventana */
        '<div id="ean-tool-header">' +
          '<div id="ean-tool-header-title">CÓDIGOS EAN</div>' +
          '<button id="ean-tool-close">✕</button>' +
        '</div>' +

        /* zona de acción */
        '<div id="ean-action-row">' +
          '<label id="ean-drop-zone" title="Cargar archivos">' +
            'EAN' +
            '<input type="file" id="ean-file-input" accept=".pdf,.xlsx,.xls" multiple style="display:none">' +
          '</label>' +
          '<span id="ean-file-count"></span>' +
          '<button id="ean-btn-open-modal" disabled title="Ver resultados">◉</button>' +
        '</div>' +

        /* progreso */
        '<div id="ean-progress-wrap">' +
          '<div id="ean-progress-track"><div id="ean-progress-fill"></div></div>' +
          '<div id="ean-progress-lbl">Analizando…</div>' +
        '</div>' +

        /* error */
        '<div id="ean-error-wrap"><div id="ean-error-box"></div></div>' +

        /* novos EANs encontrados */
        '<div id="ean-found-wrap"><div id="ean-found-box"></div></div>' +

        /* delivery notes encontradas */
        '<div id="ean-dn-wrap"><div id="ean-dn-box"></div></div>' +

      '</div>' +
    '</div>' +

    /* modal de resultados (z-index mayor, fuera de ean-tool-wrap) */
    '<div id="ean-modal-overlay">' +
      '<div id="ean-modal-box">' +
        '<div id="ean-modal-hdr">' +
          '<div id="ean-modal-hdr-texts"><div id="ean-modal-hdr-title">CÓDIGOS EAN</div></div>' +
          '<div id="ean-modal-hdr-actions">' +
            '<button class="ean-btn-download-excel" id="ean-btn-download">⬇ Excel</button>' +
            '<button class="ean-btn-save-sb" id="ean-btn-save-supabase" title="Guardar EANs en Supabase">⬆ Guardar EAN</button>' +
            '<button id="ean-modal-close">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="ean-modal-stats">' +
          '<div class="ean-stat-item"><div class="ean-stat-val" id="ean-s-refs">0</div><div class="ean-stat-lbl">Referencias</div></div>' +
          '<div class="ean-stat-item"><div class="ean-stat-val" id="ean-s-eans">0</div><div class="ean-stat-lbl">EANs únicos</div></div>' +
          '<div id="ean-audit-summary">' +
            '<div class="ean-audit-dot" id="ean-audit-dot"></div>' +
            '<span id="ean-audit-summary-text"></span>' +
          '</div>' +
        '</div>' +
        '<div id="ean-modal-search-wrap">' +
          '<input id="ean-modal-search" type="text" placeholder="Buscar referencia, nombre o EAN…">' +
        '</div>' +
        '<div id="ean-modal-body">' +
          '<div class="ean-empty-state" id="ean-empty-state">' +
            '<div class="ean-empty-icon">🔍</div>' +
            '<div class="ean-empty-title">Sin resultados</div>' +
            '<div class="ean-empty-sub">Prueba con otro término</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div id="ean-copy-toast"></div>';

  document.body.appendChild(wrapper);

  // ═══════════════════════════════════════════════════════════════
  //  REFERENCIAS DOM
  // ═══════════════════════════════════════════════════════════════
  var toolOverlay  = document.getElementById('ean-tool-overlay');
  var toolClose    = document.getElementById('ean-tool-close');
  var dropZone     = document.getElementById('ean-drop-zone');
  var fileInput    = document.getElementById('ean-file-input');
  var fileCount    = document.getElementById('ean-file-count');
  var btnOpenModal = document.getElementById('ean-btn-open-modal');
  var progressWrap = document.getElementById('ean-progress-wrap');
  var progressFill = document.getElementById('ean-progress-fill');
  var progressLbl  = document.getElementById('ean-progress-lbl');
  var errorWrap    = document.getElementById('ean-error-wrap');
  var errorBox     = document.getElementById('ean-error-box');
  var dnWrap       = document.getElementById('ean-dn-wrap');
  var dnBox        = document.getElementById('ean-dn-box');
  var foundWrap    = document.getElementById('ean-found-wrap');
  var foundBox     = document.getElementById('ean-found-box');
  var modalOverlay = document.getElementById('ean-modal-overlay');
  var modalClose   = document.getElementById('ean-modal-close');
  var modalBody    = document.getElementById('ean-modal-body');
  var modalSearch  = document.getElementById('ean-modal-search');
  var emptyState   = document.getElementById('ean-empty-state');
  var copyToast    = document.getElementById('ean-copy-toast');

  // ═══════════════════════════════════════════════════════════════
  //  API PÚBLICA — llamada desde tam.js
  // ═══════════════════════════════════════════════════════════════
  window.tamOpenEanTool = function () {
    toolOverlay.classList.add('ean-open');
    /* Se existe um rascunho restaurado do localStorage (ou dados chegados
       em 2º plano via tamEanToolIngestCatalog) que ainda não foi reflectido
       em state.results nesta sessão de página, consolida agora para que o
       utilizador veja logo o catálogo acumulado ao abrir a ferramenta. */
    if (Object.keys(merged).length && !state.results.length) {
      consolidateResults().then(function(){
        if (state.results.length) { btnOpenModal.disabled = false; btnOpenModal.classList.add('ean-has-results'); }
        renderPendingEanBanner();
      });
    }
  };

  // Ponto de entrada único: abre a ferramenta e entrega-lhe directamente
  // os ficheiros escolhidos no botão "delivery note" de tam.js (Excel
  // e PDF passam a ser analisados sempre pelo mesmo motor).
  window.tamEanToolIngestFiles = function (files) {
    toolOverlay.classList.add('ean-open');
    addFiles(Array.prototype.slice.call(files));
  };

  // Ingestão silenciosa em 2º plano — usada pelo parser de DN em PDF de
  // tam.js (tamPushEanCatalogFromPDF) para alimentar o catálogo com os
  // EAN reais capturados durante a leitura de uma delivery note, sem abrir
  // o overlay nem reanalisar ficheiros. entries: [{ref, eans:[...]}].
  window.tamEanToolIngestCatalog = async function (entries) {
    if (!entries || !entries.length) return;
    entries.forEach(function(e){
      if (e && e.ref && e.eans && e.eans.length) mergeRef(e.ref, '', '', e.eans, 'pdf-dn', '');
    });
    await consolidateResults();
    if (state.results.length) { btnOpenModal.disabled = false; btnOpenModal.classList.add('ean-has-results'); }
    renderPendingEanBanner();
  };

  // Cerrar ventana principal
  toolClose.addEventListener('click', function () {
    toolOverlay.classList.remove('ean-open');
  });
  toolOverlay.addEventListener('click', function (e) {
    if (e.target === toolOverlay) toolOverlay.classList.remove('ean-open');
  });

  // ═══════════════════════════════════════════════════════════════
  //  CONSTANTES SEMÁNTICAS — calibradas del PDF real TAM
  //  Pero con detección adaptativa para tolerar variaciones
  // ═══════════════════════════════════════════════════════════════

  var GARMENT_WORDS = new Set([
    'blouse','dress','skirt','top','trouser','trousers','cardigan','pullover',
    'pullunder','culotte','scarf','jacket','coat','shirt','leggings','vest',
    'jumper','sweater','blazer','shorts','pants','tee','tunic','cape','poncho',
    'bodysuit','overall','jumpsuit','romper','light','lg','sl','ss','3/4'
  ]);

  var BRANDS_SET = new Set(['hailys','zabaione','z-one']);

  var NOISE_TOKENS = new Set([
    'lot-nr./anzahl:.','lot-nr.','anzahl','herkunft/coo:','herkunft',
    'modell/model','farbe/colour','größe/size','stück/pieces','auftr.-nr./order',
    'versandanschrift','delivery','address','lieferschein','gesamtstückzahl',
    'bruttogewicht','nettogewicht','gesamtpaketanzahl','verwaltung','administration',
    'hauptsitz','headquarter','geschäftsführung','kontakt','bankverbindung',
    'kunden','konto','karton','datum','seite','page','iban','bic','ust-id',
    'fon','fax','email','info@tam-fashion.com','tam','fashion','gmbh',
    'valvo-park','essener','straße','hamburg','michelfeld','stuttgart',
    'volksbank','backnang','versandart','despatched','fedex'
  ]);

  var SIZE_TOKENS = new Set(['xs','s','m','l','xl','xxl','xxxl','xxxxl','one size']);

  var REF_RE = /^(?!ZY-)(?!DE-)(?!UST-)(?!HRB)(?!B2B-)[A-Za-z]{2,6}[-_](?:[A-Za-z0-9]{1,6}[-_]){0,4}[A-Za-z0-9]*\d[A-Za-z0-9]*$/;

  function isRef(s) {
    if (!s || s.length < 4 || s.length > 32) return false;
    if (!/\d/.test(s)) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    if (/^\d/.test(s)) return false;
    return REF_RE.test(s);
  }

  function isEan13(s) { return /^\d{13}$/.test(s); }
  function isHsCode(s) { return /^\d{8}$/.test(s); }
  function isPrice(s)  { return /^\d{1,3}[,.]\d{2}$/.test(s); }
  function isOrderNo(s){ return /^\d-DE-\d{9,}$/.test(s); }
  function isQty(s)    { return /^\d{1,4}$/.test(s) && parseInt(s) >= 1 && parseInt(s) <= 9999; }
  function isSize(s)   { return SIZE_TOKENS.has(s.toLowerCase()); }
  function isNoise(s)  { return NOISE_TOKENS.has(s.toLowerCase()); }
  function isBrand(s)  { return BRANDS_SET.has(s.toLowerCase()); }

  // ═══════════════════════════════════════════════════════════════
  //  ESTADO
  // ═══════════════════════════════════════════════════════════════
  var state  = { files: [], results: [] };
  var merged = {};
  var pendingDNResults    = [];   // [{ zyCode, refs:[{ref,qty}], fileName, gesamtPcs }]
  var pendingDNUnresolved = 0;    // EANs vistos numa hoja de DN sem referência conhecida

  // ═══════════════════════════════════════════════════════════════
  //  PERSISTÊNCIA (localStorage) — rascunho do catálogo por sessão de
  //  browser. Guarda só o catálogo (merged); as delivery notes pendentes
  //  não persistem (ficam sujeitas a "Aplicar à sessão activa" na hora).
  // ═══════════════════════════════════════════════════════════════
  var EAN_STORAGE_KEY = 'tam_ean_tool_draft_v1';

  function persistEanToolState() {
    try {
      var serializable = {};
      Object.keys(merged).forEach(function(key){
        var e = merged[key];
        serializable[key] = {
          ref: e.ref, name: e.name, pvp: e.pvp,
          eans: Array.from(e.eans), sources: Array.from(e.sources), dns: Array.from(e.dns)
        };
      });
      if (Object.keys(serializable).length) {
        localStorage.setItem(EAN_STORAGE_KEY, JSON.stringify({ merged: serializable, savedAt: Date.now() }));
      } else {
        localStorage.removeItem(EAN_STORAGE_KEY);
      }
    } catch(e) { console.warn('EAN Tool: fallo al guardar borrador local', e); }
  }

  function restoreEanToolState() {
    try {
      var raw = localStorage.getItem(EAN_STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.merged) return false;
      var any = false;
      Object.keys(data.merged).forEach(function(key){
        var e = data.merged[key];
        if (!e || !e.ref) return;
        merged[key] = {
          ref: e.ref, name: e.name || '', pvp: e.pvp || '',
          eans: new Set(e.eans || []), sources: new Set(e.sources || []), dns: new Set(e.dns || [])
        };
        any = true;
      });
      return any;
    } catch(e) { console.warn('EAN Tool: fallo al restaurar borrador local', e); return false; }
  }

  function clearEanToolState() {
    try { localStorage.removeItem(EAN_STORAGE_KEY); } catch(e) {}
  }

  restoreEanToolState();

  // ═══════════════════════════════════════════════════════════════
  //  SUPABASE — Biblioteca EANs conocidos
  // ═══════════════════════════════════════════════════════════════
  var SUPABASE_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Wx9SAdPR0kRX-KAsVIj02w_4Y37IyEU';
  var MOTOR_D_URL  = 'https://wmvucabpkixdzeanfrzx.supabase.co/functions/v1/Motor-D';

  async function eanMotorDCall(payload) {
    try {
      var res = await fetch(MOTOR_D_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      var data = await res.json();
      return data.ok ? data.result : null;
    } catch(e) {
      console.warn('EAN Motor D failed:', e.message);
      return null;
    }
  }

  async function fetchKnownEans() {
    var known    = new Set();
    var pageSize = 1000;
    var from     = 0;
    var keepGoing = true;
    while (keepGoing) {
      var to   = from + pageSize - 1;
      var resp = await fetch(
        SUPABASE_URL + '/rest/v1/tam_ean_catalog?select=ean&limit=' + pageSize + '&offset=' + from,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      if (!resp.ok) break;
      var rows = await resp.json();
      rows.forEach(function(r){ if (r.ean) known.add(r.ean.trim()); });
      keepGoing = rows.length === pageSize;
      from += pageSize;
    }
    return known;
  }

  // ═══════════════════════════════════════════════════════════════
  //  FILE HANDLING
  // ═══════════════════════════════════════════════════════════════
  dropZone.addEventListener('dragover',  function(e){ e.preventDefault(); dropZone.classList.add('ean-drag-over'); });
  dropZone.addEventListener('dragleave', function(){  dropZone.classList.remove('ean-drag-over'); });
  dropZone.addEventListener('drop', function(e){
    e.preventDefault(); dropZone.classList.remove('ean-drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  });
  fileInput.addEventListener('change', function(e){
    addFiles(Array.from(e.target.files)); e.target.value = '';
  });

  btnOpenModal.addEventListener('click', function(){
    if (state.results && state.results.length) { openModal(); }
  });

  function addFiles(files) {
    files.forEach(function(f){
      var ext  = f.name.split('.').pop().toLowerCase();
      var type = ext === 'pdf' ? 'pdf' : (ext === 'xlsx' || ext === 'xls') ? 'xlsx' : null;
      if (!type) return;
      if (state.files.some(function(x){ return x.file.name===f.name && x.file.size===f.size; })) return;
      state.files.push({ file: f, type: type });
    });
    updateFileUI();
    errorWrap.classList.remove('ean-visible');
    if (state.files.length) runExtraction();
  }

  function updateFileUI() {
    var n = state.files.length;
    if (n > 0) {
      fileCount.textContent = n + ' Delivery Note' + (n !== 1 ? 's' : '');
      fileCount.classList.add('ean-visible');
    } else {
      fileCount.classList.remove('ean-visible');
    }
  }

  function setProg(pct, lbl) { progressFill.style.width=pct+'%'; progressLbl.textContent=lbl; }

  // ═══════════════════════════════════════════════════════════════
  //  LIMPIEZA DE NOMBRE
  // ═══════════════════════════════════════════════════════════════
  function cleanName(texto) {
    if (!texto) return '';
    return texto
      .replace(/([A-Za-z])44([A-Za-z])/g, '$1$2')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ═══════════════════════════════════════════════════════════════
  //  MERGE HELPER
  // ═══════════════════════════════════════════════════════════════
  function mergeRef(ref, name, pvp, eans, src, dn) {
    if (!ref || !ref.trim()) return;
    var key = ref.trim().toUpperCase();
    if (!merged[key]) merged[key] = { ref:ref.trim(), name:'', pvp:'', eans:new Set(), sources:new Set(), dns:new Set() };
    var e = merged[key];
    var n = cleanName((name||'').trim());
    if (n && n.length > e.name.length) e.name = n;
    var p = (pvp||'').toString().trim().replace(',','.').replace(/[^\d.]/g,'');
    if (p && !e.pvp) e.pvp = p;
    (eans||[]).forEach(function(x){ var s=String(x).replace(/\s/g,''); if(/^\d{8,14}$/.test(s)) e.eans.add(s); });
    e.sources.add(src);
    if (dn && /^ZY-/i.test(String(dn).trim())) e.dns.add(String(dn).trim());
  }

  // ═══════════════════════════════════════════════════════════════
  //  Consolidação do catálogo (merged → state.results), incluindo o
  //  filtro de EANs já conhecidos no Supabase. Reutilizável tanto pelo
  //  fluxo normal de extração (runExtraction) como pela ingestão em
  //  segundo plano vinda do parser de DN em PDF (tamEanToolIngestCatalog).
  // ═══════════════════════════════════════════════════════════════
  async function consolidateResults() {
    state.results = Object.values(merged)
      .map(function(e){ return {
        ref:     e.ref,
        name:    e.name,
        pvp:     e.pvp,
        eans:    Array.from(e.eans).filter(function(x){return /^\d{8,14}$/.test(x);}),
        sources: Array.from(e.sources),
        dns:     Array.from(e.dns).sort()
      }; })
      .filter(function(r){ return r.eans.length>0; })
      .sort(function(a,b){ return a.ref.localeCompare(b.ref); });

    runAuditEngines(state.results);

    try {
      var knownEans = await fetchKnownEans();
      if (knownEans.size > 0) {
        var withEans = [], withoutEans = [];
        state.results.forEach(function(r) {
          r.eans = r.eans.filter(function(e){ return !knownEans.has(e); });
          if (r.eans.length > 0) { withEans.push(r); }
          else { withoutEans.push(r); }
        });
        state.results = withEans.concat(withoutEans);
      }
    } catch(e) { console.warn('Supabase fetch error (filtro omitido):', e); }

    persistEanToolState();
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN — auto-runs on file load
  // ═══════════════════════════════════════════════════════════════
  async function runExtraction() {
    errorWrap.classList.remove('ean-visible');
    dnWrap.classList.remove('ean-visible');
    merged = {}; state.results = [];
    pendingDNResults = []; pendingDNUnresolved = 0;
    var xlsxSheetsForDN = [];
    progressWrap.classList.add('ean-visible');
    btnOpenModal.disabled = true;

    var pdfFiles  = state.files.filter(function(f){ return f.type==='pdf';  });
    var xlsxFiles = state.files.filter(function(f){ return f.type==='xlsx'; });
    var total = pdfFiles.length + xlsxFiles.length, done = 0;

    for (var pi=0; pi<pdfFiles.length; pi++) {
      var pf = pdfFiles[pi];
      setProg(Math.round((done/total)*85+5), 'PDF '+(pi+1)+'/'+pdfFiles.length+': '+pf.file.name);
      try {
        var words = await extractPdfItems(pf.file);
        var beforeCount = Object.keys(merged).length;
        parsePDF(words, mergeRef);
        /* Motor D fallback si el parser local no encontró nada */
        if (Object.keys(merged).length === beforeCount) {
          setProg(Math.round((done/total)*85+5), '🤖 Motor D: '+pf.file.name+'…');
          try {
            var pdfText = buildRows(words, 14)
              .map(function(row){ return row.items.map(function(it){ return it.str; }).join(' '); })
              .join('\n').slice(0, 12000);
            var mdResPdf = await eanMotorDCall({ mode: 'ean', text: pdfText });
            if (mdResPdf && mdResPdf.refs && mdResPdf.refs.length) {
              mdResPdf.refs.forEach(function(r) {
                if (r.ref && r.eans && r.eans.length) mergeRef(r.ref, r.name||'', r.pvp||'', r.eans, 'pdf-motord', '');
              });
            }
          } catch(emd) { console.warn('EAN Motor D PDF fallback failed', emd); }
        }
      } catch(err) { console.error('PDF error', pf.file.name, err); }
      done++;
    }
    for (var xi=0; xi<xlsxFiles.length; xi++) {
      var xf = xlsxFiles[xi];
      setProg(Math.round((done/total)*85+5), 'Excel '+(xi+1)+'/'+xlsxFiles.length+': '+xf.file.name);
      try {
        var sheets = await readXlsx(xf.file);
        var beforeXlCount = Object.keys(merged).length;
        parseXLSX(sheets, mergeRef);
        /* Motor D fallback si los motores locales C+D no reconocieron el formato */
        if (Object.keys(merged).length === beforeXlCount) {
          setProg(Math.round((done/total)*85+5), '🤖 Motor D: '+xf.file.name+'…');
          try {
            var xlText = sheets.map(function(sheet) {
              return '=== ' + sheet.name + ' ===\n' +
                sheet.rows.slice(0, 80).map(function(row) {
                  return row.filter(function(c){ return String(c).trim(); }).join('\t');
                }).filter(Boolean).join('\n');
            }).join('\n\n').slice(0, 12000);
            var mdResXl = await eanMotorDCall({ mode: 'ean', text: xlText });
            if (mdResXl && mdResXl.refs && mdResXl.refs.length) {
              mdResXl.refs.forEach(function(r) {
                if (r.ref && r.eans && r.eans.length) mergeRef(r.ref, r.name||'', r.pvp||'', r.eans, 'xlsx-motord', '');
              });
            }
          } catch(emd) { console.warn('EAN Motor D Excel fallback failed', emd); }
        }
        xlsxSheetsForDN.push({ sheets: sheets, fileName: xf.file.name });
      } catch(err) { console.error('XLSX error', xf.file.name, err); }
      done++;
    }

    /* ── Delivery notes: cruce EAN → referência com o catálogo já
       reconhecido em TODAS as hojas/ficheiros deste lote (por isso
       corre só depois de terminar o loop, não hoja a hoja). ── */
    if (xlsxSheetsForDN.length) {
      var eanToRef      = buildEanToRefMap();
      var dnAccum        = {}, dnOrder = {}, dnFileName = {};
      var unresolvedSet = new Set();
      xlsxSheetsForDN.forEach(function(entry){
        detectDNSheets(entry.sheets, entry.fileName, eanToRef, dnAccum, dnOrder, dnFileName, unresolvedSet);
      });
      pendingDNResults = Object.keys(dnAccum).sort().map(function(zy){
        var refs = dnOrder[zy].map(function(ref){ return { ref: ref, qty: dnAccum[zy][ref] }; });
        var gesamtPcs = refs.reduce(function(s,r){ return s + r.qty; }, 0);
        return { zyCode: zy, refs: refs, fileName: dnFileName[zy], gesamtPcs: gesamtPcs };
      });
      pendingDNUnresolved = unresolvedSet.size;
    }

    setProg(100, 'Consolidando…');
    setProg(100, 'Consultando biblioteca EANs…');
    await consolidateResults();

    setTimeout(function(){
      progressWrap.classList.remove('ean-visible');
      if (!state.results.length && !pendingDNResults.length) {
        errorBox.textContent='No se encontraron referencias con EANs. Verifica el formato de los archivos.';
        errorWrap.classList.add('ean-visible');
        btnOpenModal.disabled = true;
      } else if (state.results.length) {
        btnOpenModal.disabled = false;
        btnOpenModal.classList.add('ean-has-results');
      }
      renderPendingDN();
      renderPendingEanBanner();
    }, 350);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PDF UTIL
  // ═══════════════════════════════════════════════════════════════
  async function extractPdfItems(file) {
    var ab  = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    var allItems = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page    = await pdf.getPage(p);
      var content = await page.getTextContent();
      content.items.forEach(function(it){
        var s = (it.str || '').trim();
        if (!s) return;
        allItems.push({ str: s, x: it.transform[4], y: it.transform[5], page: p });
      });
    }
    return allItems;
  }

  function buildRows(items, yTol) {
    var sorted = items.slice().sort(function(a,b){
      if (a.page !== b.page) return a.page - b.page;
      return b.y - a.y;
    });
    var rows = [];
    var cur  = null;
    sorted.forEach(function(it){
      if (!cur || cur.page !== it.page || Math.abs(it.y - cur.y) > yTol) {
        if (cur) rows.push(cur);
        cur = { y: it.y, page: it.page, items: [] };
      }
      cur.items.push(it);
    });
    if (cur) rows.push(cur);
    rows.forEach(function(row){ row.items.sort(function(a,b){ return a.x - b.x; }); });
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PDF PARSER — MOTOR SEMÁNTICO POR DESCARTE
  // ═══════════════════════════════════════════════════════════════
  function parsePDF(items, merge) {
    var eanXs = items.filter(function(it){ return isEan13(it.str); }).map(function(it){ return it.x; });
    function modeArr(arr, bucket) {
      if (!arr.length) return null;
      var c = {};
      arr.forEach(function(x){ var b=Math.round(x/bucket)*bucket; c[b]=(c[b]||0)+1; });
      var best=null, bn=0;
      Object.keys(c).forEach(function(b){ if(c[b]>bn){bn=c[b];best=parseFloat(b);} });
      return best;
    }
    var xEan = modeArr(eanXs, 8) || 260;

    var pdfDN = '';
    items.forEach(function(it){
      if (!pdfDN && /^ZY-\d+$/i.test(it.str.trim())) pdfDN = it.str.trim();
    });

    var rows = buildRows(items, 14);

    function rowHasEan(row)   { return row.items.some(function(it){ return isEan13(it.str); }); }
    function rowIsLotNr(row)  { return row.items.some(function(it){ return /^Lot-Nr/i.test(it.str); }); }
    function rowIsGesamt(row) { return row.items.some(function(it){ return /^Gesamtst/i.test(it.str); }); }

    var blocks = [], curBlock = null;
    rows.forEach(function(row){
      if (rowIsGesamt(row)) { if (curBlock){ blocks.push(curBlock); curBlock=null; } return; }
      if (rowIsLotNr(row))  {
        if (curBlock) blocks.push(curBlock);
        curBlock = { lotRow: row, lotPage: row.page, rows: [] };
        return;
      }
      if (!curBlock) return;
      curBlock.rows.push(row);
    });
    if (curBlock) blocks.push(curBlock);

    blocks.forEach(function(block){
      var ref = null;
      var searchRows = [block.lotRow].concat(block.rows.slice(0, 8));
      searchRows.forEach(function(row){
        if (ref) return;
        row.items.forEach(function(it){
          if (!ref && isRef(it.str)) ref = it.str;
        });
      });
      if (!ref) return;

      var dataRows = block.rows.filter(rowHasEan);
      if (!dataRows.length) return;

      var eans = [];
      var pvp  = '';
      var nameCandidates = {};

      dataRows.forEach(function(row){
        var rowEan = '', rowPvp = '';
        var fixedTokens = new Set();

        row.items.forEach(function(it){
          var s = it.str;
          if (isEan13(s))    { rowEan = s; fixedTokens.add(s); return; }
          if (isHsCode(s))   { fixedTokens.add(s); return; }
          if (isPrice(s))    { if (!rowPvp) rowPvp = s; fixedTokens.add(s); return; }
          if (isOrderNo(s))  { fixedTokens.add(s); return; }
          if (isRef(s))      { fixedTokens.add(s); return; }
          if (isNoise(s))    { fixedTokens.add(s); return; }
          if (isBrand(s))    { fixedTokens.add(s); return; }
          if (isSize(s) && it.x > xEan) { fixedTokens.add(s); return; }
          if (/^\d+$/.test(s) && it.x > xEan) { fixedTokens.add(s); return; }
        });

        row.items.forEach(function(it){
          if (fixedTokens.has(it.str)) return;
          var s = it.str.trim();
          if (!s) return;
          s.split(/\s+/).forEach(function(tok){
            tok = tok.trim();
            if (!tok) return;
            if (/^\d+$/.test(tok)) return;
            if (isSize(tok)) return;
            if (isNoise(tok)) return;
            nameCandidates[tok] = (nameCandidates[tok] || 0) + 1;
          });
        });

        if (rowEan && eans.indexOf(rowEan) === -1) eans.push(rowEan);
        if (rowPvp && !pvp) pvp = rowPvp;
      });

      var orderedName = [];
      if (dataRows.length > 0) {
        var templateRow = dataRows[0];
        var fixedInTemplate = new Set();
        templateRow.items.forEach(function(it){
          if (isEan13(it.str)||isHsCode(it.str)||isPrice(it.str)||
              isOrderNo(it.str)||isRef(it.str)||isNoise(it.str)||isBrand(it.str)) {
            fixedInTemplate.add(it.str);
          }
          if (isSize(it.str) && it.x > xEan) fixedInTemplate.add(it.str);
          if (/^\d+$/.test(it.str) && it.x > xEan) fixedInTemplate.add(it.str);
        });

        templateRow.items.forEach(function(it){
          if (fixedInTemplate.has(it.str)) return;
          it.str.split(/\s+/).forEach(function(tok){
            tok = tok.trim();
            if (!tok || /^\d+$/.test(tok) || isSize(tok) || isNoise(tok)) return;
            if (nameCandidates[tok] && nameCandidates[tok] >= 1) {
              if (orderedName.indexOf(tok) === -1) orderedName.push(tok);
            }
          });
        });
      }

      var name     = orderedName.join(' ').trim();
      var pvpClean = pvp ? pvp.replace(',','.') : '';
      if (eans.length > 0) merge(ref, name, pvpClean, eans, 'pdf', pdfDN);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXCEL UTIL
  // ═══════════════════════════════════════════════════════════════
  function normalizeXlsxCell(v) {
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return (v === null || v === undefined) ? '' : String(v);
  }

  async function readXlsx(file) {
    var ab = await file.arrayBuffer();
    var wb = XLSX.read(ab, { type:'array', raw:true });
    return wb.SheetNames.map(function(name){
      var ws = wb.Sheets[name];
      var rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true });
      return { name:name, rows: rows.map(function(row){ return row.map(normalizeXlsxCell); }) };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXCEL PARSER — MOTOR C (header mapping) + MOTOR D (fuzzy)
  // ═══════════════════════════════════════════════════════════════
  function parseXLSX(sheets, merge) {
    var SYN = {
      ref:  ['referencia','reference','ref','modelo','model','modell','article ref',
              'artikelnummer','article number','item','sku','codigo'],
      ean:  ['ean','barcode','codigo de barras','code','gtin','upc','bar code'],
      name: ['article name','name','nombre','artikelname','product name','description',
              'descripcion','artikel','designation','item name','producto'],
      pvp:  ['sales price','pvp','price','precio','uvp','vk','retail','rrp',
              'selling price','msrp','prix','prezzo'],
      skip: ['delivery note','lieferschein','albarán','albaran','qty','quantity',
             'cantidad','menge','stück','pieces','order','pedido','auftr']
    };

    function findColByHeader(headerRow, syns) {
      for (var i=0; i<headerRow.length; i++) {
        var h = String(headerRow[i]).toLowerCase().trim();
        for (var j=0; j<syns.length; j++) {
          if (h.indexOf(syns[j]) !== -1) return i;
        }
      }
      return -1;
    }

    function getSkipCols(headerRow) {
      var skip = new Set();
      for (var i=0; i<headerRow.length; i++) {
        var h = String(headerRow[i]).toLowerCase().trim();
        for (var j=0; j<SYN.skip.length; j++) {
          if (h.indexOf(SYN.skip[j]) !== -1) { skip.add(i); break; }
        }
      }
      return skip;
    }

    function motorC(sheet) {
      var rows = sheet.rows;
      if (!rows || rows.length < 2) return false;
      var hRow=-1, cols={};
      for (var ri=0; ri<Math.min(8,rows.length); ri++) {
        var rc=findColByHeader(rows[ri],SYN.ref);
        var ec=findColByHeader(rows[ri],SYN.ean);
        if (rc!==-1 && ec!==-1) {
          hRow=ri; cols.ref=rc; cols.ean=ec;
          cols.name=findColByHeader(rows[ri],SYN.name);
          cols.pvp =findColByHeader(rows[ri],SYN.pvp);
          cols.dn  =findColByHeader(rows[ri],['delivery note','lieferschein','albaran','albarán','dn']);
          break;
        }
      }
      if (hRow===-1) return false;
      for (var ri2=hRow+1; ri2<rows.length; ri2++) {
        var row=rows[ri2];
        var ref =String(row[cols.ref]||'').trim();
        var ean =String(row[cols.ean]||'').trim().replace(/\s/g,'');
        var name=cols.name!==-1?String(row[cols.name]||'').trim():'';
        var pvp =cols.pvp !==-1?String(row[cols.pvp] ||'').trim():'';
        var dn  =cols.dn  !==-1?String(row[cols.dn]  ||'').trim():'';
        if (!ref||!ean||!/^\d{8,14}$/.test(ean)) continue;
        pvp=pvp.replace(',','.').replace(/[^\d.]/g,'');
        merge(ref,name,pvp,[ean],'xlsx',dn);
      }
      return true;
    }

    function motorD(sheet) {
      var rows=sheet.rows;
      if (!rows||rows.length<3) return;

      var sample=rows.slice(0,Math.min(40,rows.length));
      var numCols=0; sample.forEach(function(r){if(r.length>numCols)numCols=r.length;});

      var skipCols = new Set();
      for (var ri=0; ri<Math.min(3,rows.length); ri++) {
        var maybeSkip = getSkipCols(rows[ri]);
        if (maybeSkip.size > 0) { maybeSkip.forEach(function(c){ skipCols.add(c); }); }
      }

      // ── Preferir cabecera EAN explícita antes de adivinar por patrón ──
      // Evita confundir un GLN (u otro número de 13 dígitos constante,
      // como un sender code) con el EAN real cuando ambos calzan con
      // /^\d{13}$/. Si algún encabezado dice literalmente "EAN"/"barcode"/
      // etc., esa columna gana siempre.
      var headerEanC = -1;
      for (var hri=0; hri<Math.min(3,rows.length); hri++) {
        var hc = findColByHeader(rows[hri], SYN.ean);
        if (hc !== -1) { headerEanC = hc; break; }
      }

      var scores={};
      for(var c=0;c<numCols;c++) scores[c]={ean:0,ref:0,price:0,text:0,reflike:0,total:0};

      sample.forEach(function(row){
        for(var c=0;c<row.length;c++){
          if(skipCols.has(c)) continue;
          var v=String(row[c]||'').trim();
          if(!v) continue;
          scores[c].total++;
          var vn=v.replace(/\s/g,'');
          if(/^\d{13}$/.test(vn))           scores[c].ean++;
          if(isRef(v))                       scores[c].ref++;
          if(isPrice(v))                     scores[c].price++;
          if(/^[A-Z]{2,}-\d{6,}$/.test(v))  scores[c].reflike++;
          if(/[A-Za-z]{2,}/.test(v)&&v.length>3&&!isRef(v)) scores[c].text++;
        }
      });

      var n=sample.length;
      var eanC=headerEanC,refC=-1,prC=-1,nmC=-1;
      var mxE=0,mxR=0,mxP=0,mxT=0;

      Object.keys(scores).forEach(function(c){
        var ci=parseInt(c),s=scores[c],t=Math.max(s.total,1);
        if(skipCols.has(ci)) return;
        if(headerEanC===-1 && s.ean/t>.3&&s.ean>mxE){mxE=s.ean;eanC=ci;}
        if(s.ref/t>.2&&s.ref>mxR){mxR=s.ref;refC=ci;}
        if(s.price/t>.15&&s.price>mxP){mxP=s.price;prC=ci;}
      });

      Object.keys(scores).forEach(function(c){
        var ci=parseInt(c),s=scores[c],t=Math.max(s.total,1);
        if(ci===eanC||ci===refC||ci===prC) return;
        if(skipCols.has(ci)) return;
        if(s.reflike/t>.4) return;
        if(s.ref/t>.4) return;
        if(s.text/t>.2&&s.text>mxT){mxT=s.text;nmC=ci;}
      });

      var dnC = -1;
      Object.keys(scores).forEach(function(c){
        var ci = parseInt(c), s = scores[c], t = Math.max(s.total,1);
        if (s.reflike/t > .4 && ci !== refC) dnC = ci;
      });

      if(eanC===-1||refC===-1) return;

      var startRow=0;
      for(var ri=0;ri<Math.min(5,rows.length);ri++){
        var hv=String(rows[ri][eanC]||'').toLowerCase();
        if(/ean|barcode|code/.test(hv)){startRow=ri+1;break;}
      }

      for(var ri2=startRow;ri2<rows.length;ri2++){
        var row=rows[ri2];
        var ean=String(row[eanC]||'').trim().replace(/\s/g,'');
        var ref=String(row[refC]||'').trim();
        var nm =nmC!==-1?String(row[nmC]||'').trim():'';
        var pv =prC!==-1?String(row[prC]||'').trim():'';
        var dn =dnC!==-1?String(row[dnC]||'').trim():'';
        if(!/^\d{8,14}$/.test(ean)||!ref) continue;
        pv=pv.replace(',','.').replace(/[^\d.]/g,'');
        merge(ref,nm,pv,[ean],'xlsx',dn);
      }
    }

    sheets.forEach(function(sheet){
      motorC(sheet);
      motorD(sheet);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  DELIVERY NOTES — cruce EAN → referência entre hojas/ficheiros
  //  Detecta hojas com coluna "Delivery Note" (código ZY) + EAN + Qty,
  //  mesmo sem coluna de referência própria, e resolve o ref através
  //  do catálogo (ref+EAN) já reconhecido no mesmo lote de ficheiros.
  // ═══════════════════════════════════════════════════════════════
  function buildEanToRefMap() {
    var map = {};
    Object.keys(merged).forEach(function(key){
      var e = merged[key];
      e.eans.forEach(function(ean){ if (!map[ean]) map[ean] = e.ref; });
    });
    return map;
  }

  function detectDNSheets(sheets, fileName, eanToRef, dnAccum, dnOrder, dnFileName, unresolvedSet) {
    var SYN_DN  = ['delivery note','lieferschein','albaran','albarán','dn'];
    var SYN_EAN = ['ean','barcode','codigo de barras','code','gtin','upc','bar code'];
    var SYN_QTY = ['qty','quantity','cantidad','menge','stück','pieces','anzahl'];

    function findCol(headerRow, syns) {
      for (var i=0; i<headerRow.length; i++) {
        var h = String(headerRow[i]).toLowerCase().trim();
        for (var j=0; j<syns.length; j++) { if (h.indexOf(syns[j]) !== -1) return i; }
      }
      return -1;
    }

    sheets.forEach(function(sheet){
      var rows = sheet.rows;
      if (!rows || rows.length < 2) return;

      var hRow=-1, dnC=-1, eanC=-1, qtyC=-1;
      for (var ri=0; ri<Math.min(8,rows.length); ri++) {
        var dc = findCol(rows[ri], SYN_DN);
        var ec = findCol(rows[ri], SYN_EAN);
        if (dc !== -1 && ec !== -1) { hRow=ri; dnC=dc; eanC=ec; qtyC=findCol(rows[ri], SYN_QTY); break; }
      }
      if (hRow === -1) return; // esta hoja não tem estrutura de delivery note

      for (var ri2=hRow+1; ri2<rows.length; ri2++) {
        var row = rows[ri2];
        var dnRaw = String(row[dnC]||'').trim();
        var dnMatch = dnRaw.match(/ZY-\d+/i);
        if (!dnMatch) continue;
        var zyCode = dnMatch[0].toUpperCase();

        var ean = String(row[eanC]||'').trim().replace(/\s/g,'');
        if (!/^\d{8,14}$/.test(ean)) continue;

        var qty = qtyC !== -1 ? parseInt(row[qtyC]) : NaN;
        if (isNaN(qty) || qty < 1) continue;

        var ref = eanToRef[ean];
        if (!ref) { unresolvedSet.add(ean); continue; }

        if (!dnAccum[zyCode]) { dnAccum[zyCode] = {}; dnOrder[zyCode] = []; dnFileName[zyCode] = fileName; }
        if (!dnAccum[zyCode].hasOwnProperty(ref)) { dnAccum[zyCode][ref] = 0; dnOrder[zyCode].push(ref); }
        dnAccum[zyCode][ref] += qty;
      }
    });
  }

  function renderPendingDN() {
    if (!pendingDNResults.length) {
      dnWrap.classList.remove('ean-visible');
      dnBox.innerHTML = '';
      return;
    }
    var totalPcs = pendingDNResults.reduce(function(s,d){ return s + d.gesamtPcs; }, 0);
    var listHtml = pendingDNResults.map(function(d){
      return '<div class="ean-dn-item">' + d.zyCode + ' — ' + d.refs.length + ' ref. · ' + d.gesamtPcs + ' pcs</div>';
    }).join('');
    var unresolvedHtml = pendingDNUnresolved > 0
      ? '<div id="ean-dn-unresolved">⚠ ' + pendingDNUnresolved + ' EAN(s) sem referência no catálogo — não incluídos.</div>'
      : '';
    dnBox.innerHTML =
      '<div id="ean-dn-title">📦 ' + pendingDNResults.length + ' delivery note(s) encontrada(s) · ' + totalPcs + ' pcs</div>' +
      '<div id="ean-dn-list">' + listHtml + '</div>' +
      unresolvedHtml +
      '<button type="button" id="ean-dn-apply-btn">Aplicar à sessão activa</button>';
    dnWrap.classList.add('ean-visible');

    var applyBtn = dnBox.querySelector('#ean-dn-apply-btn');
    if (applyBtn) applyBtn.addEventListener('click', function(){
      if (typeof window.tamApplyImportedDeliveryNotes !== 'function') {
        toast('A sessão TAM não está disponível nesta página.');
        return;
      }
      applyBtn.disabled = true;
      applyBtn.textContent = 'A aplicar…';
      var result = window.tamApplyImportedDeliveryNotes(pendingDNResults) || {};
      var appliedCount = typeof result.applied === 'number' ? result.applied : pendingDNResults.length;
      var skippedCount = typeof result.skipped === 'number' ? result.skipped : 0;
      toast(appliedCount + ' delivery note(s) aplicada(s)' + (skippedCount ? ' · ' + skippedCount + ' já existentes ignoradas' : ''));
      pendingDNResults    = [];
      pendingDNUnresolved = 0;
      dnWrap.classList.remove('ean-visible');
      dnBox.innerHTML = '';
    });
  }

  /* ── Aviso visível de EANs novos por rever/guardar. Complementa o
     destaque discreto do botão ◉ (ean-has-results) com um bloco explícito,
     igualmente relevante quando os dados chegam em 2º plano (PDF de DN)
     ou são restaurados de um rascunho local, sem passar por runExtraction. ── */
  function renderPendingEanBanner() {
    var totalNew = state.results.reduce(function(s,r){ return s + r.eans.length; }, 0);
    if (!state.results.length || totalNew === 0) {
      foundWrap.classList.remove('ean-visible');
      foundBox.innerHTML = '';
      return;
    }
    foundBox.innerHTML =
      '<div id="ean-found-title">🏷 ' + state.results.length + ' referencia(s) · ' + totalNew + ' EAN(s) nuevo(s)</div>' +
      '<div id="ean-found-hint">Toca en ◉ para revisar y guardar en el catálogo.</div>';
    foundWrap.classList.add('ean-visible');
  }

  // ═══════════════════════════════════════════════════════════════
  //  CAPA DE FISCALIZACIÓN — 4 MOTORES AUDITORES
  // ═══════════════════════════════════════════════════════════════

  function auditEanLuhn(ean) {
    if (!/^\d{13}$/.test(ean)) return false;
    var digits = ean.split('').map(Number);
    var check  = digits.pop();
    var sum = 0;
    digits.forEach(function(d, i){ sum += (i % 2 === 0) ? d : d * 3; });
    var computed = (10 - (sum % 10)) % 10;
    return computed === check;
  }

  function auditConsistency(result) {
    var flags = [];
    var validEans   = result.eans.filter(auditEanLuhn);
    var invalidEans = result.eans.filter(function(e){ return !auditEanLuhn(e); });
    if (invalidEans.length > 0) {
      flags.push({ type:'error', motor:'M1·EAN', msg:invalidEans.length+' EAN'+(invalidEans.length>1?'s':'')+' con dígito de control incorrecto', data:invalidEans });
    }
    if (result.eans.length > 30) {
      flags.push({ type:'warn', motor:'M2·LOTE', msg:result.eans.length+' EANs — volumen inusual, verificar si hay mezcla de referencias' });
    }
    if (validEans.length === 0 && result.eans.length > 0) {
      flags.push({ type:'error', motor:'M2·LOTE', msg:'Ningún EAN pasa la validación matemática' });
    }
    return flags;
  }

  function auditSemantic(result) {
    var flags = [];
    if (/[A-Za-z]44[A-Za-z]/.test(result.name)) {
      flags.push({ type:'warn', motor:'M3·SEM', msg:'Nombre contiene secuencia "44" residual: "'+result.name+'"' });
      result.name = cleanName(result.name);
    }
    if (result.name.length > 0 && result.name.length < 2) {
      flags.push({ type:'warn', motor:'M3·SEM', msg:'Nombre sospechosamente corto: "'+result.name+'"' });
    }
    if (result.pvp) {
      var pvpNum = parseFloat(result.pvp);
      if (isNaN(pvpNum) || pvpNum <= 0 || pvpNum > 999.99) {
        flags.push({ type:'error', motor:'M3·SEM', msg:'PVP fuera de rango válido: '+result.pvp+' €' });
      }
    }
    var noisePatterns = /^(ZY-|DE-|HRB|UST|IBAN|BIC|GLS|DHL|FedEx)/i;
    if (noisePatterns.test(result.name)) {
      flags.push({ type:'error', motor:'M3·SEM', msg:'Nombre contiene ruido de cabecera: "'+result.name+'"' });
      result.name = '';
    }
    return flags;
  }

  function auditIntegrity(result) {
    var flags = [];
    if (!result.name || result.name.trim() === '') {
      flags.push({ type:'warn', motor:'M4·INT', msg:'Nombre de producto no detectado — registro incompleto' });
    }
    if (!result.pvp || result.pvp === '') {
      flags.push({ type:'warn', motor:'M4·INT', msg:'Precio (PVP) no detectado' });
    }
    if (result.ref.length < 4 || result.ref.length > 30) {
      flags.push({ type:'error', motor:'M4·INT', msg:'Referencia con longitud anómala: "'+result.ref+'"' });
    }
    return flags;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOTOR OMEGA
  // ═══════════════════════════════════════════════════════════════
  var OMEGA_MAX_INTRA_GAP = 50;
  var OMEGA_MIN_CLUSTER   = 2;
  var OMEGA_TAM_PREFIX    = '40';
  var OMEGA_MAX_CLUSTERS  = 6;

  function omegaCluster(eans) {
    if (!eans || !eans.length) return [];
    var nums = eans.map(Number).filter(function(n){ return !isNaN(n); });
    nums.sort(function(a,b){ return a-b; });
    if (!nums.length) return [];
    var clusters = [[nums[0]]];
    for (var i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i-1] <= OMEGA_MAX_INTRA_GAP) {
        clusters[clusters.length-1].push(nums[i]);
      } else {
        clusters.push([nums[i]]);
      }
    }
    return clusters;
  }

  function omegaAudit(results) {
    var omegaLog    = [];
    var corrections = 0;
    var detections  = 0;

    var eanGlobalIndex = {};
    results.forEach(function(r){
      r.eans.forEach(function(ean){
        if (!eanGlobalIndex[ean]) eanGlobalIndex[ean] = [];
        eanGlobalIndex[ean].push(r.ref);
      });
    });

    results.forEach(function(r){
      if (!r._omegaFlags)      r._omegaFlags = [];
      if (!r._omegaRemovedEans) r._omegaRemovedEans = new Set();

      var clusters = omegaCluster(r.eans);

      if (clusters.length > 1) {
        var mainCluster = clusters.reduce(function(best, c){ return c.length > best.length ? c : best; }, clusters[0]);
        clusters.forEach(function(cluster){
          if (cluster === mainCluster) return;
          var clusterEans = cluster.map(String);
          var betterHome  = null;
          var betterScore = cluster.length;

          results.forEach(function(other){
            if (other.ref === r.ref) return;
            var otherClusters = omegaCluster(other.eans);
            otherClusters.forEach(function(oc){
              var overlap = cluster.filter(function(n){ return oc.indexOf(n) !== -1; });
              if (overlap.length > 0 && oc.length > betterScore) { betterHome=other.ref; betterScore=oc.length; }
            });
          });

          if (betterHome) {
            clusterEans.forEach(function(ean){ r._omegaRemovedEans.add(ean); });
            r._omegaFlags.push({ type:'error', motor:'OMEGA·P1', msg:'Cluster foráneo detectado y eliminado: '+clusterEans.length+' EANs ('+clusterEans[0]+'…'+clusterEans[clusterEans.length-1]+') pertenecen a '+betterHome, eans:clusterEans });
            corrections++;
            omegaLog.push('[OMEGA·P1] CORRECCIÓN: '+r.ref+' → '+clusterEans.length+' EANs reasignados a '+betterHome);
          } else if (clusters.length > OMEGA_MAX_CLUSTERS) {
            clusterEans.forEach(function(ean){ r._omegaRemovedEans.add(ean); });
            r._omegaFlags.push({ type:'error', motor:'OMEGA·P1', msg:'Cluster aislado sin referencia válida: '+clusterEans.length+' EANs eliminados por exceso de fragmentación ('+clusters.length+' clusters)', eans:clusterEans });
            corrections++;
          }
        });
      }

      var crossEans = r.eans.filter(function(ean){
        var refs = eanGlobalIndex[ean];
        return refs && refs.length > 1 && !r._omegaRemovedEans.has(ean);
      });

      if (crossEans.length > 0) {
        crossEans.forEach(function(ean){
          var refs = eanGlobalIndex[ean];
          var eanNum = parseInt(ean);
          var bestRef = null, bestScore = -1;
          refs.forEach(function(candidateRef){
            var candidateResult = results.filter(function(x){ return x.ref===candidateRef; })[0];
            if (!candidateResult) return;
            var cClusters = omegaCluster(candidateResult.eans);
            cClusters.forEach(function(cc){
              if (cc.indexOf(eanNum) === -1) return;
              if (cc.length > bestScore) { bestScore=cc.length; bestRef=candidateRef; }
            });
          });

          if (bestRef && bestRef !== r.ref) {
            r._omegaRemovedEans.add(ean);
            r._omegaFlags.push({ type:'error', motor:'OMEGA·P2', msg:'EAN '+ean+' reasignado a '+bestRef+' (cluster más coherente: '+bestScore+' EANs)', eans:[ean] });
            corrections++;
            omegaLog.push('[OMEGA·P2] CORRECCIÓN: EAN '+ean+' de '+r.ref+' → '+bestRef);
          }
        });
      }

      clusters.forEach(function(cluster){
        if (cluster.length === 1) {
          var ean = String(cluster[0]);
          if (!r._omegaRemovedEans.has(ean)) {
            var refs = eanGlobalIndex[ean] || [];
            if (refs.length === 1) {
              r._omegaFlags.push({ type:'warn', motor:'OMEGA·P3', msg:'EAN '+ean+' aparece aislado (sin cluster de tallas)', eans:[ean] });
              detections++;
            }
          }
        }
      });

      r.eans.forEach(function(ean){
        if (!r._omegaRemovedEans.has(ean) && !ean.startsWith(OMEGA_TAM_PREFIX)) {
          r._omegaFlags.push({ type:'error', motor:'OMEGA·P4', msg:'EAN '+ean+' tiene prefijo GS1 incorrecto (esperado 40x, encontrado '+ean.substring(0,3)+')', eans:[ean] });
          r._omegaRemovedEans.add(ean);
          corrections++;
        }
      });

      if (r._omegaRemovedEans.size > 0) {
        r.eans = r.eans.filter(function(ean){ return !r._omegaRemovedEans.has(ean); });
      }
    });

    var before = results.length;
    for (var i = results.length - 1; i >= 0; i--) {
      if (results[i].eans.length === 0) {
        omegaLog.push('[OMEGA] Referencia '+results[i].ref+' eliminada — sin EANs válidos tras corrección');
        results.splice(i, 1);
      }
    }

    if (omegaLog.length) {
      console.group('%c[MOTOR OMEGA] Correcciones aplicadas', 'color:#c0392b;font-weight:bold');
      omegaLog.forEach(function(l){ console.log(l); });
      console.groupEnd();
    }
    console.info('[OMEGA] Correcciones automáticas: '+corrections+' | Detecciones: '+detections+' | Refs eliminadas: '+(before - results.length));

    return { corrections: corrections, detections: detections };
  }

  function runAuditEngines(results) {
    var omegaResult = omegaAudit(results);

    var eanIndex = {};
    results.forEach(function(r){
      r.eans.forEach(function(ean){
        if (!eanIndex[ean]) eanIndex[ean] = [];
        eanIndex[ean].push(r.ref);
      });
    });

    var totalIssues = 0, totalErrors = 0;

    results.forEach(function(r){
      r._auditFlags  = [];
      r._invalidEans = new Set();

      var consistFlags = auditConsistency(r);
      consistFlags.forEach(function(f){ r._auditFlags.push(f); if (f.data) f.data.forEach(function(e){ r._invalidEans.add(e); }); });

      var semFlags = auditSemantic(r);
      semFlags.forEach(function(f){ r._auditFlags.push(f); });

      var intFlags = auditIntegrity(r);
      intFlags.forEach(function(f){ r._auditFlags.push(f); });

      r.eans.forEach(function(ean){
        var refs = eanIndex[ean];
        if (refs && refs.length > 1) {
          var alreadyFlagged = r._auditFlags.some(function(f){ return f.motor==='M4·DUP' && f.ean===ean; });
          if (!alreadyFlagged) {
            r._auditFlags.push({ type:'error', motor:'M4·DUP', msg:'EAN '+ean+' aparece en '+refs.length+' referencias distintas: '+refs.join(', '), ean:ean });
            r._invalidEans.add(ean);
          }
        }
      });

      r._auditFlags.forEach(function(f){
        if (f.type==='error') totalErrors++;
        else if (f.type==='warn') totalIssues++;
      });
    });

    var summaryEl  = document.getElementById('ean-audit-summary');
    var dotEl      = document.getElementById('ean-audit-dot');
    var summaryTxt = document.getElementById('ean-audit-summary-text');

    if (totalErrors > 0) {
      dotEl.className = 'ean-audit-dot ean-errors';
      summaryTxt.textContent = totalErrors+' error'+(totalErrors>1?'s':'')+
        (totalIssues>0?' · '+totalIssues+' aviso'+(totalIssues>1?'s':''):'')+
        (omegaResult.corrections>0?' · Ω '+omegaResult.corrections+' corrección'+(omegaResult.corrections>1?'es':''):'');
    } else if (totalIssues > 0 || omegaResult.corrections > 0) {
      dotEl.className = 'ean-audit-dot ean-issues';
      summaryTxt.textContent = (totalIssues>0?totalIssues+' aviso'+(totalIssues>1?'s':''):'')+
        (omegaResult.corrections>0?(totalIssues>0?' · ':'')+'Ω '+omegaResult.corrections+' corrección'+(omegaResult.corrections>1?'es':''):'');
    } else {
      dotEl.className = 'ean-audit-dot ean-clean';
      summaryTxt.textContent = 'Ω Auditoría OK';
    }
    summaryEl.style.display = 'flex';

    console.info('[AUDIT] Resultados:', results.length, '| Errores:', totalErrors, '| Avisos:', totalIssues);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODAL DE RESULTADOS
  // ═══════════════════════════════════════════════════════════════
  function openModal() {
    modalSearch.value = '';
    renderResults(state.results); updateStats(state.results);
    modalOverlay.classList.add('ean-open');
    setTimeout(function(){ modalSearch.focus(); }, 80);
  }

  modalClose.addEventListener('click', function(){ modalOverlay.classList.remove('ean-open'); });
  modalOverlay.addEventListener('click', function(e){ if(e.target===modalOverlay) modalOverlay.classList.remove('ean-open'); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') modalOverlay.classList.remove('ean-open'); });
  modalSearch.addEventListener('input', function(){
    var q=modalSearch.value.toLowerCase().trim();
    var filtered=!q?state.results:state.results.filter(function(r){
      return r.ref.toLowerCase().indexOf(q)!==-1||r.name.toLowerCase().indexOf(q)!==-1||r.eans.some(function(e){return e.indexOf(q)!==-1;});
    });
    renderResults(filtered); updateStats(filtered);
  });

  // ── Excel download ──
  document.getElementById('ean-btn-download').addEventListener('click', function(){
    var q = modalSearch.value.toLowerCase().trim();
    var list = !q ? state.results : state.results.filter(function(r){
      return r.ref.toLowerCase().indexOf(q)!==-1||r.name.toLowerCase().indexOf(q)!==-1||r.eans.some(function(e){return e.indexOf(q)!==-1;});
    });
    if (!list.length) return;

    var rows = [['Referencia','Nombre','PVP','UN','EAN']];
    list.forEach(function(r){
      r.eans.forEach(function(ean){
        rows.push([ r.ref, r.name, r.pvp ? parseFloat(r.pvp) : '', 'UN', ean ]);
      });
    });

    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch:20 },{ wch:22 },{ wch:8 },{ wch:5 },{ wch:16 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EANs');
    XLSX.writeFile(wb, 'TAM_EANs_' + new Date().toISOString().slice(0,10) + '.xlsx');
    toast('Excel descargado');
  });

  // ── Guardar EANs en Supabase ──
  document.getElementById('ean-btn-save-supabase').addEventListener('click', async function(){
    var btn = this;
    var allEans = [];
    state.results.forEach(function(r){ r.eans.forEach(function(e){ allEans.push(e); }); });
    if (!allEans.length) { toast('No hay EANs nuevos para guardar'); return; }

    btn.disabled = true;
    btn.textContent = '⬆ Guardando…';

    var batchSize = 500;
    var errors    = 0;
    for (var i = 0; i < allEans.length; i += batchSize) {
      var batch = allEans.slice(i, i + batchSize).map(function(e){ return { ref:'', ean:e }; });
      try {
        var resp = await fetch(SUPABASE_URL + '/rest/v1/tam_ean_catalog', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates'
          },
          body: JSON.stringify(batch)
        });
        if (!resp.ok) errors++;
      } catch(e) { errors++; }
    }

    btn.disabled = false;
    btn.textContent = '⬆ SB';
    if (errors === 0) {
      toast(allEans.length + ' EANs guardados en Supabase ✓');
      clearEanToolState();
    } else {
      toast('Guardado con ' + errors + ' error(es) — revisa consola');
    }
  });

  function updateStats(list){
    document.getElementById('ean-s-refs').textContent = list.length;
    document.getElementById('ean-s-eans').textContent = list.reduce(function(a,r){ return a+r.eans.length; }, 0);
  }

  function renderResults(list){
    Array.from(modalBody.querySelectorAll('.ean-ref-block')).forEach(function(el){ el.remove(); });
    if (!list.length){ emptyState.classList.add('ean-visible'); return; }
    emptyState.classList.remove('ean-visible');
    var frag = document.createDocumentFragment();
    list.forEach(function(r){
      var block = document.createElement('div'); block.className = 'ean-ref-block';
      var topLine = document.createElement('div'); topLine.className = 'ean-ref-top-line';

      var codeEl = document.createElement('div'); codeEl.className = 'ean-ref-code'; codeEl.textContent = r.ref;
      codeEl.title = 'Clic para copiar';
      codeEl.addEventListener('click', function(){ copySimple(r.ref, codeEl, 'Referencia copiada'); });

      var nameEl = document.createElement('div'); nameEl.className = 'ean-ref-name'+(r.name?'':' ean-empty'); nameEl.textContent = r.name||'sin nombre';
      if (r.name){ nameEl.title='Clic para copiar nombre'; nameEl.addEventListener('click', function(){ copySimple(r.name, nameEl, 'Nombre copiado'); }); }

      var pvpEl = document.createElement('div'); pvpEl.className = 'ean-ref-pvp'+(r.pvp?'':' ean-empty'); pvpEl.textContent = r.pvp?r.pvp+' €':'—';
      if (r.pvp){ pvpEl.title='Clic para copiar PVP'; pvpEl.addEventListener('click', function(){ copySimple(r.pvp, pvpEl, 'PVP copiado'); }); }

      topLine.appendChild(codeEl); topLine.appendChild(nameEl); topLine.appendChild(pvpEl);
      block.appendChild(topLine);

      var allFlags = (r._omegaFlags||[]).concat(r._auditFlags||[]);
      if (allFlags.length > 0) {
        var auditBar = document.createElement('div'); auditBar.className = 'ean-audit-bar';
        allFlags.forEach(function(f){
          var tag = document.createElement('span');
          tag.className = 'ean-audit-flag ean-' + f.type;
          tag.textContent = (f.motor.startsWith('OMEGA') ? 'Ω ' : '⚑ ') + f.motor + ': ' + f.msg;
          tag.title = f.msg;
          auditBar.appendChild(tag);
        });
        block.appendChild(auditBar);
      }

      if (r.eans.length > 0){
        var eanList = document.createElement('div'); eanList.className = 'ean-list';
        r.eans.forEach(function(ean, idx){
          var chip = document.createElement('div');
          var isInvalid = r._invalidEans && r._invalidEans.has(ean);
          chip.className = 'ean-chip' + (isInvalid ? ' ean-invalid' : '');
          chip.textContent = ean;
          chip.title = isInvalid
            ? '⚠ EAN con dígito de control incorrecto (fallo Luhn GS1)'
            : (idx===0?'Clic → copia TODOS los EANs en formato Excel (col A: UN  col B: EAN)':'Clic → copia todos los EANs');
          chip.addEventListener('click', function(){ copyAllEans(r.eans, eanList); });
          eanList.appendChild(chip);
        });
        block.appendChild(eanList);
      }

      if (r.dns && r.dns.length > 0) {
        var dnFooter = document.createElement('div'); dnFooter.className = 'ean-dn-footer';
        var dnLabel  = document.createElement('span'); dnLabel.className = 'ean-dn-label'; dnLabel.textContent = 'DN';
        dnFooter.appendChild(dnLabel);
        r.dns.forEach(function(dn){
          var chip = document.createElement('span'); chip.className = 'ean-dn-chip'; chip.textContent = dn;
          chip.title = 'Clic para copiar Delivery Note';
          chip.addEventListener('click', function(){ copySimple(dn, chip, 'DN copiada'); });
          dnFooter.appendChild(chip);
        });
        block.appendChild(dnFooter);
      }

      frag.appendChild(block);
    });
    modalBody.insertBefore(frag, emptyState);
  }

  // ═══════════════════════════════════════════════════════════════
  //  COPY
  // ═══════════════════════════════════════════════════════════════
  function copySimple(text, el, msg){
    var ok = function(){
      el.classList.add('ean-copied');
      el.classList.add('ean-done');
      toast(msg||'Copiado');
      setTimeout(function(){ el.classList.remove('ean-copied'); }, 1200);
    };
    if (navigator.clipboard){ navigator.clipboard.writeText(text).then(ok).catch(function(){ fallback(text); ok(); }); }
    else { fallback(text); ok(); }
  }
  function copyAllEans(eans, eanListEl){
    var tsv  = eans.map(function(e){ return 'UN\t'+e; }).join('\n');
    var html = '<table>'+eans.map(function(e){ return '<tr><td>UN</td><td>'+e+'</td></tr>'; }).join('')+'</table>';
    var flash = function(){
      Array.from(eanListEl.querySelectorAll('.ean-chip')).forEach(function(c){
        c.classList.add('ean-copied');
        c.classList.add('ean-done');
        setTimeout(function(){ c.classList.remove('ean-copied'); }, 1400);
      });
      toast(eans.length+' EANs copiados · Pega en Excel: col A=UN, col B=EAN');
    };
    if (navigator.clipboard && window.ClipboardItem){
      try {
        var item = new ClipboardItem({ 'text/plain':new Blob([tsv],{type:'text/plain'}), 'text/html':new Blob([html],{type:'text/html'}) });
        navigator.clipboard.write([item]).then(flash).catch(function(){ fallback(tsv); flash(); });
        return;
      } catch(e){}
    }
    fallback(tsv); flash();
  }
  function fallback(text){
    var ta = document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(ta);
  }
  var toastTimer = null;
  function toast(msg){
    copyToast.textContent = msg; copyToast.classList.add('ean-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ copyToast.classList.remove('ean-show'); }, 2500);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CARGAR DEPENDENCIAS (xlsx + pdf.js) si no están presentes
  // ═══════════════════════════════════════════════════════════════
  function initWithDeps() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  if (typeof XLSX === 'undefined') {
    loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'ean-xlsx-script',
      function() {
        if (typeof pdfjsLib === 'undefined') {
          loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            'ean-pdfjs-script',
            initWithDeps
          );
        } else {
          initWithDeps();
        }
      }
    );
  } else if (typeof pdfjsLib === 'undefined') {
    loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      'ean-pdfjs-script',
      initWithDeps
    );
  } else {
    initWithDeps();
  }

}

})();
