/* ══════════════════════════════════════════════════════════
   processamento.js — Módulo de Processamento de Faturas
   Auto-injectado como overlay em index.html
══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 1. INJECT STYLES ── */
  var STYLE_ID = 'proc-styles';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id  = STYLE_ID;
    style.textContent = [
      /* Reset scoped */
      '#proc-content *, #proc-content *::before, #proc-content *::after { box-sizing: border-box; margin: 0; padding: 0; }',

      /* Wrapper */
      '#proc-content { width:100%; min-height:100%; background:#fff; padding:20px; display:flex; flex-direction:column; align-items:center; font-family:\'MontserratLight\', sans-serif; font-size:13px; color:#333; }',
      '#proc-content .page-wrap { width:100%; max-width:1100px; }',

      /* Top bar */
      '#proc-content .proc-top-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:10px; }',
      '#proc-content .proc-app-title { font-size:1.05rem; font-weight:700; color:#222; letter-spacing:-.01em; }',
      '#proc-content .proc-top-actions { display:flex; align-items:center; gap:8px; }',
      '#proc-content .proc-save-status { font-size:.72rem; font-weight:700; color:#2a8a2a; opacity:0; transition:opacity 0.5s; white-space:nowrap; min-width:90px; text-align:right; }',

      /* Session dropdown */
      '#proc-content .proc-session-menu-wrap { position:relative; }',
      '#proc-content .proc-session-dropdown { position:absolute; top:calc(100% + 6px); right:0; width:340px; background:#fff; border:1px solid #e0e0e0; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.14); z-index:600; overflow:hidden; max-height:380px; overflow-y:auto; }',
      '#proc-content .proc-session-dropdown.hidden { display:none; }',
      '#proc-content .proc-session-menu-empty { padding:18px 20px; text-align:center; color:#000; font-size:.78rem; font-weight:600; }',
      '#proc-content .proc-session-menu-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #f2f2f2; gap:8px; }',
      '#proc-content .proc-session-menu-item:last-child { border-bottom:none; }',
      '#proc-content .proc-session-menu-item.current { background:#f5f9ff; }',
      '#proc-content .proc-session-menu-item-info { display:flex; flex-direction:column; gap:2px; min-width:0; }',
      '#proc-content .proc-session-menu-item-label { font-size:.82rem; font-weight:700; color:#222; white-space:nowrap; }',
      '#proc-content .proc-session-current-badge { font-size:.58rem; background:#1565c0; color:#fff; border-radius:4px; padding:1px 5px; margin-left:6px; vertical-align:middle; font-weight:700; }',
      '#proc-content .proc-session-menu-item-date { font-size:.67rem; color:#000; font-weight:600; }',
      '#proc-content .proc-session-menu-item-actions { display:flex; gap:5px; align-items:center; flex-shrink:0; }',
      '#proc-content .proc-session-load-btn { padding:3px 10px; border:1px solid #1565c0; border-radius:6px; background:#e3f2fd; color:#1565c0; font-size:.7rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '#proc-content .proc-session-load-btn:hover { background:#1565c0; color:#fff; }',
      '#proc-content .proc-session-delete-btn { padding:3px 8px; border:1px solid #ddd; border-radius:6px; background:transparent; color:#000; font-size:.7rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '#proc-content .proc-session-delete-btn:hover { border-color:#c00; color:#c00; background:#fff0f0; }',

      /* Fatura instance & banner */
      '#proc-content .proc-fatura-instance { margin-bottom:28px; }',
      '#proc-content .proc-fatura-banner { background:linear-gradient(90deg,#1a237e 0%,#1976d2 100%); border-radius:12px 12px 0 0; padding:11px 18px; display:flex; align-items:center; justify-content:space-between; }',
      '#proc-content .proc-fatura-banner-left { display:flex; align-items:center; gap:10px; }',
      '#proc-content .proc-fatura-banner-num { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,.9); }',
      '#proc-content .proc-fatura-banner-provider { font-size:.88rem; font-weight:700; color:#fff; }',
      '#proc-content .proc-remove-fatura-btn { padding:3px 11px; border:1px solid rgba(255,255,255,.35); border-radius:6px; background:transparent; color:rgba(255,255,255,.7); font-size:.68rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '#proc-content .proc-remove-fatura-btn:hover { border-color:#ff6b6b; color:#ff6b6b; background:rgba(255,0,0,.12); }',

      /* Connect banner to header-card */
      '#proc-content .proc-fatura-instance .proc-header-card { border-radius:0; border-top:none; margin-top:0; }',
      '#proc-content .proc-fatura-instance .proc-table-footer { border-radius:0 0 12px 12px; }',

      /* Header card */
      '#proc-content .proc-header-card { background:#fff; border:1px solid #e6e6e6; border-radius:14px; padding:16px 20px; margin-bottom:10px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; align-items:end; }',
      '#proc-content .proc-field-group { display:flex; flex-direction:column; gap:5px; }',
      '#proc-content .proc-field-label { font-size:.65rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:#000; }',

      /* Inputs */
      '#proc-content input[type="text"], #proc-content input[type="number"] { background:#fafafa; border:1px solid #e0e0e0; color:#333; font-family:\'MontserratLight\',sans-serif; font-size:.88rem; font-weight:600; padding:8px 10px; border-radius:8px; outline:none; width:100%; transition:border-color 0.15s; -moz-appearance:textfield; }',
      '#proc-content input[type="text"]:focus, #proc-content input[type="number"]:focus { border-color:#555; background:#fff; }',
      '#proc-content input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; }',

      /* Total box */
      '#proc-content .proc-total-box { background:#fafafa; border:1px solid #e0e0e0; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; }',
      '#proc-content .proc-total-box .proc-amount { font-size:1.15rem; font-weight:700; color:#222; }',

      /* Table block */
      '#proc-content .proc-table-block { background:#fff; border:1px solid #e6e6e6; border-radius:14px; overflow:hidden; margin-bottom:10px; }',
      '#proc-content .proc-table-wrap { overflow-x:auto; }',
      '#proc-content .proc-table-wrap table { border-collapse:collapse; white-space:nowrap; border-radius:0; border-spacing:0; }',
      '#proc-content .proc-table-wrap thead tr { background:#f2f2f2; border-bottom:2px solid #e0e0e0; }',
      '#proc-content .proc-table-wrap thead th { padding:8px 7px; text-align:center; font-size:.65rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#000; white-space:nowrap; border:none; border-radius:0; }',
      '#proc-content .proc-table-wrap thead th.left { text-align:left; padding-left:10px; }',
      '#proc-content .proc-table-wrap thead th.th-a4 { color:#1565c0; background:#e3f2fd; }',
      '#proc-content .proc-table-wrap thead th.th-a5 { color:#2e7d32; background:#e8f5e9; }',
      '#proc-content .proc-table-wrap tbody tr { border-bottom:1px solid #f2f2f2; transition:background 0.1s; }',
      '#proc-content .proc-table-wrap tbody tr:hover { background:#fafafa !important; }',
      '#proc-content .proc-table-wrap tbody tr.has-data { background:#fffffe; }',
      '#proc-content .proc-table-wrap td { padding:2px 3px; vertical-align:middle; white-space:nowrap; border:none; border-radius:0; font-size:.9rem; font-weight:normal; }',

      /* TD inputs */
      '#proc-content .proc-table-wrap td input[type="text"], #proc-content .proc-table-wrap td input[type="number"] { background:transparent; border:1px solid transparent; font-size:.82rem; font-weight:600; padding:4px 6px; border-radius:6px; width:100%; }',
      '#proc-content .proc-table-wrap td input[type="number"] { width:52px; }',
      '#proc-content .proc-table-wrap td input.proc-ref-input { width:90px; }',
      '#proc-content .proc-table-wrap td input.proc-desc-input { width:140px; }',
      '#proc-content .proc-table-wrap td input[type="text"]:not(.proc-ref-input):not(.proc-desc-input) { width:80px; }',
      '#proc-content .proc-table-wrap td input:focus { background:#fff; border-color:#ccc; }',
      '#proc-content .proc-table-wrap td.center-col { text-align:center; }',

      /* Row misc */
      '#proc-content .proc-row-num { color:#ccc; font-size:.72rem; text-align:center; width:28px; user-select:none; font-weight:700; }',
      '#proc-content .proc-cell-computed { padding:4px 8px; font-size:.82rem; font-weight:700; text-align:right; color:#000; white-space:nowrap; }',
      '#proc-content .proc-cell-computed.has-val { color:#333; }',
      '#proc-content .proc-cell-status { text-align:center; font-size:.72rem; font-weight:700; padding:4px 3px; white-space:nowrap; }',
      '#proc-content .proc-cell-status.ok { color:#2a8a2a; }',
      '#proc-content .proc-cell-status.err { color:#c00; }',
      '#proc-content .proc-cell-status.warn { color:#e67e00; }',

      /* Toggle D */
      '#proc-content .proc-toggle-d { display:flex; justify-content:center; align-items:center; white-space:nowrap; }',
      '#proc-content .proc-toggle-d input[type="checkbox"] { display:none; }',
      '#proc-content .proc-toggle-d label { cursor:pointer; padding:3px 8px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.7rem; font-weight:700; transition:all 0.15s; user-select:none; white-space:nowrap; }',
      '#proc-content .proc-toggle-d input:checked + label { border-color:#e67e00; color:#e67e00; background:#fff8f0; }',

      /* Split btn */
      '#proc-content .proc-split-btn { cursor:pointer; padding:3px 7px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.68rem; font-weight:700; background:transparent; font-family:\'MontserratLight\',sans-serif; transition:all 0.15s; user-select:none; display:block; width:100%; text-align:center; }',
      '#proc-content .proc-split-btn:hover { border-color:#1565c0; color:#1565c0; background:#e3f2fd; }',
      '#proc-content .proc-split-btn.active { border-color:#2e7d32; color:#2e7d32; background:#e8f5e9; }',

      /* Toggle +1 */
      '#proc-content .proc-toggle-plus { display:flex; justify-content:center; align-items:center; white-space:nowrap; }',
      '#proc-content .proc-toggle-plus input[type="checkbox"] { display:none; }',
      '#proc-content .proc-toggle-plus label { cursor:pointer; padding:3px 8px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.7rem; font-weight:700; transition:all 0.15s; user-select:none; white-space:nowrap; }',
      '#proc-content .proc-toggle-plus input:checked + label { border-color:#1565c0; color:#1565c0; background:#e3f2fd; }',

      /* Margem */
      '#proc-content .proc-margem-val { color:#2a8a2a; }',
      '#proc-content .proc-margem-val.low { color:#e67e00; }',
      '#proc-content .proc-margem-val.very-low { color:#c00; }',

      /* Footer */
      '#proc-content .proc-table-footer { background:#fafafa; border:1px solid #e6e6e6; border-radius:14px; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }',
      '#proc-content .proc-summary-line { display:flex; gap:20px; font-size:.78rem; color:#000; font-weight:600; }',
      '#proc-content .proc-summary-line strong { color:#333; }',
      '#proc-content .proc-diff-chip { font-size:.75rem; font-weight:700; padding:3px 10px; border-radius:20px; border:1.5px solid; display:inline-block; }',
      '#proc-content .proc-diff-chip.zero { border-color:#2a8a2a; color:#2a8a2a; background:#f0faf0; }',
      '#proc-content .proc-diff-chip.pos { border-color:#e67e00; color:#e67e00; background:#fff8f0; }',
      '#proc-content .proc-diff-chip.neg { border-color:#c00; color:#c00; background:#fff0f0; }',
      '#proc-content .proc-footer-actions { display:flex; gap:8px; }',

      /* Buttons */
      '#proc-content .proc-btn { padding:7px 16px; border:1px solid #ccc; border-radius:8px; background:#fff; color:#555; font-family:\'MontserratLight\',sans-serif; font-size:.78rem; font-weight:700; text-transform:lowercase; cursor:pointer; transition:all 0.15s; white-space:nowrap; }',
      '#proc-content .proc-btn:hover { background:#555; color:#fff; border-color:#555; }',
      '#proc-content .proc-btn.primary { border-color:#1565c0; color:#1565c0; background:#e3f2fd; }',
      '#proc-content .proc-btn.primary:hover { background:#1565c0; color:#fff; border-color:#1565c0; }',

      /* OBS input */
      '#proc-content .proc-table-wrap td input.proc-obs-input { width:90px; }',

      /* Add fatura */
      '#proc-content .proc-add-fatura-wrap { display:flex; justify-content:center; margin:8px 0 14px; }',
      '#proc-content .proc-add-fatura-btn { padding:9px 32px; font-size:.82rem; border-style:dashed; border-color:#1565c0; color:#1565c0; background:#f0f6ff; border-radius:10px; }',
      '#proc-content .proc-add-fatura-btn:hover { background:#1565c0; color:#fff; border-style:solid; }',

      /* Disclaimer */
      '#proc-content .proc-disclaimer-msg { margin:4px 0 20px; padding:10px 16px; background:#fff8e1; border:1.5px solid #f0c040; border-radius:10px; font-size:.75rem; font-weight:700; color:#7a5800; letter-spacing:.03em; text-align:center; }',

      /* Modals */
      '.proc-or-modal { position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.22s ease; pointer-events:none; }',
      '.proc-or-modal.visible { opacity:1; pointer-events:auto; }',
      '.proc-or-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '.proc-or-panel { position:relative; z-index:1; width:min(700px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.18); transform:translateY(14px); transition:transform 0.22s ease; overflow:hidden; }',
      '.proc-or-modal.visible .proc-or-panel { transform:translateY(0); }',
      '.proc-or-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '.proc-or-panel-title { display:flex; flex-direction:column; gap:2px; }',
      '.proc-or-panel-title-main { font-size:1rem; font-weight:700; color:#111; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-title-sub { font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#000; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-header-btns { display:flex; gap:8px; align-items:center; }',
      '.proc-or-close-btn { background:transparent; border:1.5px solid #ddd; border-radius:8px; color:#000; font-size:.85rem; padding:4px 10px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; font-weight:700; transition:all 0.14s; }',
      '.proc-or-close-btn:hover { border-color:#c00; color:#c00; background:#fff0f0; }',
      '.proc-or-action-btn { background:#fff; border:1px solid #ccc; border-radius:8px; color:#555; font-size:.75rem; font-weight:700; text-transform:lowercase; padding:5px 13px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '.proc-or-action-btn:hover { background:#555; color:#fff; border-color:#555; }',
      '.proc-or-copy-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 20px; border-bottom:1px solid #f0f0f0; background:#fafafa; flex-shrink:0; }',
      '.proc-or-copy-label { font-size:.63rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; margin-right:4px; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-copy-btn { background:#fff; border:1px solid #ddd; border-radius:7px; color:#666; font-size:.72rem; font-weight:700; padding:3px 10px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '.proc-or-copy-btn:hover { background:#f0f0f0; border-color:#999; }',
      '.proc-or-copy-btn.active { border-color:#2a8a2a; color:#2a8a2a; background:#f0faf0; }',
      '.proc-or-copy-msg { font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-scroll { overflow:auto; flex:1; }',
      '.proc-or-table { border-collapse:collapse; font-family:\'MontserratLight\',sans-serif; white-space:nowrap; width:100%; }',
      '.proc-or-table thead { position:sticky; top:0; z-index:2; }',
      '.proc-or-table thead tr { background:#f5f5f5; border-bottom:2px solid #e0e0e0; }',
      '.proc-or-table th { padding:8px 12px; text-align:left; font-size:.65rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; white-space:nowrap; }',
      '.proc-or-table th.center { text-align:center; }',
      '.proc-or-table td { padding:7px 12px; font-size:.84rem; font-weight:700; border-bottom:1px solid #f2f2f2; color:#333; }',
      '.proc-or-table td.center { text-align:center; }',
      '.proc-or-table td.right { text-align:right; }',
      '.proc-or-table tr:nth-child(even) td { background:#fafafa; }',
      '.proc-or-table tr:hover td { background:#f5f5f5 !important; }',
      '.proc-or-table .empty-row td { text-align:center; color:#000; padding:24px; font-style:italic; font-weight:400; }',
      '.proc-or-panel-footer { padding:10px 20px; border-top:1px solid #e8e8e8; background:#fafafa; font-size:.72rem; font-weight:700; color:#000; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ── 2. STATE ── */
  var faturaCount   = 0;
  var activeFaturas = [];
  var rowCounts     = {};
  var _procInited   = false;

  /* ── 3. SESSION HELPERS ── */
  var SESSION_PREFIX = 'proc_fatura_';

  function getMondayISO() {
    var d   = new Date();
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var m   = new Date(d);
    m.setDate(d.getDate() + diff);
    return m.toISOString().slice(0, 10);
  }
  function getSessionKey()   { return SESSION_PREFIX + getMondayISO(); }
  function labelFromKey(key) {
    var iso = key.replace(SESSION_PREFIX, '');
    var p   = iso.split('-');
    return 'Semana ' + p[2] + '/' + p[1] + '/' + p[0];
  }
  function getAllSessionKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SESSION_PREFIX) === 0) keys.push(k);
      }
    } catch(e) {}
    return keys.sort().reverse();
  }

  /* ── 4. SAVE / LOAD ── */
  function procSaveSession(manual) {
    var payload = {
      savedAt: new Date().toISOString(),
      faturas: activeFaturas.map(function(fid) {
        var rows = procCollectRows(fid).map(function(r) {
          return { ref:r.ref, desc:r.desc, qtdFt:r.qtdFt, a4:r.a4, a5:r.a5,
                   preco:r.preco, descPct:r.descPct, hasD:r.hasD, plus1:r.plus1, obs:r.obs };
        });
        return {
          proveedor:    (document.getElementById('proc-proveedor-'    + fid) || {}).value || '',
          valorFactura: (document.getElementById('proc-valorFactura-' + fid) || {}).value || '',
          rows: rows
        };
      })
    };
    try {
      localStorage.setItem(getSessionKey(), JSON.stringify(payload));
      if (manual) procShowSaveStatus('\u2713 guardado');
    } catch(e) {
      if (manual) procShowSaveStatus('\u26a0 erro ao guardar');
    }
  }

  function procShowSaveStatus(msg) {
    var el = document.getElementById('proc-saveStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.style.opacity = '0'; }, 2600);
  }

  function procLoadSession(key) {
    var raw = localStorage.getItem(key);
    if (!raw) { alert('Sessão não encontrada.'); return; }
    var data;
    try { data = JSON.parse(raw); } catch(e) { alert('Erro ao interpretar sessão.'); return; }

    var cont = document.getElementById('proc-faturasContainer');
    if (cont) cont.innerHTML = '';
    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });

    var faturas = data.faturas || [];
    if (!faturas.length) { procAddFatura(null); }
    else faturas.forEach(function(fd) { procAddFatura(fd); });
    procShowSaveStatus('\u2713 sessão carregada');
    procCloseSessionMenu();
  }

  function procDeleteSession(key) {
    if (!confirm('Eliminar ' + labelFromKey(key) + '?')) return;
    try { localStorage.removeItem(key); } catch(e) {}
    procRenderSessionMenu();
  }

  /* ── 5. SESSION DROPDOWN ── */
  function procToggleSessionMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('proc-sessionMenuDropdown');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
      procRenderSessionMenu();
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  }
  function procCloseSessionMenu() {
    var m = document.getElementById('proc-sessionMenuDropdown');
    if (m) m.classList.add('hidden');
  }
  function procRenderSessionMenu() {
    var menu = document.getElementById('proc-sessionMenuDropdown');
    if (!menu) return;
    var keys = getAllSessionKeys();
    var cur  = getSessionKey();
    if (!keys.length) {
      menu.innerHTML = '<div class="proc-session-menu-empty">Nenhuma sessão guardada</div>';
      return;
    }
    menu.innerHTML = keys.map(function(key) {
      var savedAt = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          savedAt = dt.toLocaleDateString('pt-PT') + ' ' + dt.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
        }
      } catch(e) {}
      var isCur  = key === cur;
      var badge  = isCur ? ' <span class="proc-session-current-badge">atual</span>' : '';
      var curCls = isCur ? ' current' : '';
      return '<div class="proc-session-menu-item' + curCls + '" onclick="event.stopPropagation()">'
        + '<div class="proc-session-menu-item-info">'
        + '<span class="proc-session-menu-item-label">' + labelFromKey(key) + badge + '</span>'
        + (savedAt ? '<span class="proc-session-menu-item-date">' + savedAt + '</span>' : '')
        + '</div>'
        + '<div class="proc-session-menu-item-actions">'
        + '<button class="proc-session-load-btn" onclick="procLoadSession(\'' + key + '\')">carregar</button>'
        + '<button class="proc-session-delete-btn" onclick="procDeleteSession(\'' + key + '\')">\u2715</button>'
        + '</div></div>';
    }).join('');
  }

  /* ── 6. FATURA MANAGEMENT ── */
  function procAddFatura(data) {
    faturaCount++;
    var fid = faturaCount;
    rowCounts[fid] = 0;
    activeFaturas.push(fid);

    var container = document.getElementById('proc-faturasContainer');
    if (!container) return;
    var wrap = document.createElement('div');
    wrap.className = 'proc-fatura-instance';
    wrap.id = 'proc-fatura-' + fid;
    wrap.innerHTML = buildProcFaturaHTML(fid);
    container.appendChild(wrap);
    procUpdateBannerNumbers();

    var dataRows = (data && data.rows) ? data.rows : [];
    var nRows    = Math.max(dataRows.length + 1, 2);
    procAddRows(fid, nRows);

    if (data) {
      var pEl = document.getElementById('proc-proveedor-'    + fid);
      var vEl = document.getElementById('proc-valorFactura-' + fid);
      if (pEl) pEl.value = data.proveedor    || '';
      if (vEl) vEl.value = data.valorFactura || '';
      procUpdateBannerProvider(fid);
      dataRows.forEach(function(row, idx) {
        var rid = idx + 1;
        var tr  = document.getElementById('proc-row-' + fid + '-' + rid);
        if (!tr) return;
        var rIn  = tr.querySelector('.proc-ref-input');
        var dIn  = tr.querySelector('.proc-desc-input');
        var nums = tr.querySelectorAll('input[type="number"]');
        var oIn  = tr.querySelector('.proc-obs-input');
        var dCb  = document.getElementById('proc-d-'    + fid + '-' + rid);
        var pCb  = document.getElementById('proc-plus-' + fid + '-' + rid);
        if (rIn)     rIn.value       = row.ref     || '';
        if (dIn)     dIn.value       = row.desc    || '';
        if (nums[0]) nums[0].value   = row.qtdFt   != null ? row.qtdFt   : '';
        if (nums[1]) nums[1].value   = row.a4      != null ? row.a4      : '';
        if (nums[2]) nums[2].value   = row.a5      != null ? row.a5      : '';
        if (nums[3]) nums[3].value   = row.preco   != null ? row.preco   : '';
        if (nums[4]) nums[4].value   = row.descPct != null ? row.descPct : '';
        if (dCb)     dCb.checked     = !!row.hasD;
        if (pCb)     pCb.checked     = !!row.plus1;
        if (oIn)     oIn.value       = row.obs || '';
        procRecalcRow(fid, rid);
      });
      procUpdateHeader(fid);
    }
    if (activeFaturas.length > 1) {
      wrap.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  }

  function buildProcFaturaHTML(fid) {
    return ''
      + '<div class="proc-fatura-banner" id="proc-fatura-banner-' + fid + '">'
      +   '<div class="proc-fatura-banner-left">'
      +     '<span style="font-size:1rem">&#128196;</span>'
      +     '<span class="proc-fatura-banner-num" id="proc-fatura-banner-num-' + fid + '">Fatura ' + fid + '</span>'
      +     '<span class="proc-fatura-banner-provider" id="proc-banner-provider-' + fid + '"></span>'
      +   '</div>'
      +   '<button class="proc-remove-fatura-btn" id="proc-remove-btn-' + fid + '" onclick="procRemoveFatura(' + fid + ')" style="display:none">\u2715 remover</button>'
      + '</div>'
      + '<div class="proc-header-card">'
      +   '<div class="proc-field-group"><div class="proc-field-label">Fornecedor</div>'
      +     '<input type="text" id="proc-proveedor-' + fid + '" placeholder="Nome do fornecedor\u2026" oninput="procUpdateBannerProvider(' + fid + ')"></div>'
      +   '<div class="proc-field-group"><div class="proc-field-label">Valor Fatura (\u20ac)</div>'
      +     '<input type="number" id="proc-valorFactura-' + fid + '" placeholder="0.00" step="0.01" oninput="procUpdateHeader(' + fid + ')"></div>'
      +   '<div class="proc-field-group"><div class="proc-field-label">Total Calculado (\u20ac)</div>'
      +     '<div class="proc-total-box"><div class="proc-field-label" style="font-size:.6rem">soma das linhas</div>'
      +     '<div class="proc-amount" id="proc-totalCalc-' + fid + '">0.00</div></div></div>'
      + '</div>'
      + '<div class="proc-table-block"><div class="proc-table-wrap"><table id="proc-mainTable-' + fid + '">'
      + '<thead><tr>'
      + '<th>N</th>'
      + '<th class="left">Refer\u00eancia</th>'
      + '<th class="left">Descri\u00e7\u00e3o</th>'
      + '<th>Qtd. FT</th>'
      + '<th class="th-a4">Funchal</th>'
      + '<th class="th-a5">Porto Santo</th>'
      + '<th title="Dividir Qtd. FT igualmente">\u00f7</th>'
      + '<th>Pre\u00e7o \u20ac</th>'
      + '<th>%Desc.</th>'
      + '<th>!</th>'
      + '<th>D / +1\u20ac</th>'
      + '<th>PVP \u20ac</th>'
      + '<th>Margem</th>'
      + '<th>Total Linha</th>'
      + '<th class="left">OBS</th>'
      + '</tr></thead>'
      + '<tbody id="proc-tableBody-' + fid + '"></tbody>'
      + '</table></div></div>'
      + '<div class="proc-table-footer">'
      +   '<div class="proc-summary-line">'
      +     '<span>Linhas: <strong id="proc-lineCount-' + fid + '">0</strong></span>'
      +     '<span>Pe\u00e7as totais: <strong id="proc-totalPiezas-' + fid + '">0</strong></span>'
      +     '<span>Diferen\u00e7a: <span id="proc-diffChip-' + fid + '" class="proc-diff-chip zero">\u00b1 0.00 \u20ac</span></span>'
      +   '</div>'
      +   '<div class="proc-footer-actions">'
      +     '<button class="proc-btn primary" onclick="procShowStockModal(' + fid + ')">\ud83d\udce6 ingresso de stock</button>'
      +   '</div>'
      + '</div>';
  }

  function procRemoveFatura(fid) {
    if (activeFaturas.length <= 1) return;
    var el = document.getElementById('proc-fatura-' + fid);
    if (el) el.remove();
    activeFaturas = activeFaturas.filter(function(id) { return id !== fid; });
    procUpdateBannerNumbers();
  }

  function procUpdateBannerNumbers() {
    activeFaturas.forEach(function(fid, idx) {
      var nEl = document.getElementById('proc-fatura-banner-num-' + fid);
      if (nEl) nEl.textContent = 'Fatura ' + (idx + 1);
      var btn = document.getElementById('proc-remove-btn-' + fid);
      if (btn) btn.style.display = activeFaturas.length > 1 ? 'inline-block' : 'none';
    });
  }

  function procUpdateBannerProvider(fid) {
    var pEl = document.getElementById('proc-proveedor-'       + fid);
    var bEl = document.getElementById('proc-banner-provider-' + fid);
    var val = (pEl && pEl.value) ? pEl.value : '';
    if (bEl) bEl.textContent = val ? '\u2014 ' + val : '';
  }

  /* ── 7. ROW CREATION ── */
  function procAddRows(fid, n) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    for (var i = 0; i < n; i++) {
      rowCounts[fid]++;
      var id = rowCounts[fid];
      var f  = fid;
      var r  = id;
      var tr = document.createElement('tr');
      tr.id  = 'proc-row-' + f + '-' + r;
      tr.innerHTML =
          '<td class="proc-row-num">' + r + '</td>'
        + '<td><input type="text" class="proc-ref-input" placeholder="REF\u2026"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')"></td>'
        + '<td><input type="text" class="proc-desc-input" placeholder="Descri\u00e7\u00e3o\u2026"'
        + ' oninput="procCheckAutoExpand(' + f + ',' + r + ')"></td>'
        + '<td><input type="number" min="0" step="1" placeholder="0"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')"></td>'
        + '<td><input type="number" min="0" step="1" placeholder="0"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')"></td>'
        + '<td><input type="number" min="0" step="1" placeholder="0"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')"></td>'
        + '<td class="center-col"><button class="proc-split-btn" onclick="procAutoSplit(' + f + ',' + r + ')"'
        + ' title="Dividir Qtd. FT entre Funchal e Porto Santo">\u00f7</button></td>'
        + '<td><input type="number" min="0" step="0.01" placeholder="0.00"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')" style="width:68px"></td>'
        + '<td><input type="number" min="0" max="100" step="0.1" placeholder="0"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')" style="width:46px"></td>'
        + '<td class="proc-cell-status" id="proc-status-' + f + '-' + r + '">\u2014</td>'
        + '<td style="white-space:nowrap;text-align:center;padding:2px 4px">'
        + '<div style="display:flex;gap:4px;justify-content:center;align-items:center">'
        + '<div class="proc-toggle-d"><input type="checkbox" id="proc-d-' + f + '-' + r
        + '" onchange="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '<label for="proc-d-' + f + '-' + r + '">D</label></div>'
        + '<div class="proc-toggle-plus"><input type="checkbox" id="proc-plus-' + f + '-' + r
        + '" onchange="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '<label for="proc-plus-' + f + '-' + r + '">+1\u20ac</label></div>'
        + '</div></td>'
        + '<td class="proc-cell-computed" id="proc-pvp-'   + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-cell-computed" id="proc-marg-'  + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-cell-computed" id="proc-total-' + f + '-' + r + '">\u2014</td>'
        + '<td><input type="text" class="proc-obs-input" placeholder="Obs\u2026"></td>';
      tbody.appendChild(tr);
    }
    procUpdateSummary(fid);
  }

  function procCheckAutoExpand(fid, id) {
    if (id === rowCounts[fid]) procAddRows(fid, 1);
  }

  /* ── 8. AUTO-SPLIT ── */
  function procAutoSplit(fid, id) {
    var tr = document.getElementById('proc-row-' + fid + '-' + id);
    if (!tr) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    var qtdFt  = parseInt(inputs[0].value) || 0;
    if (!qtdFt) return;
    var half = Math.floor(qtdFt / 2);
    inputs[1].value = qtdFt - half;
    inputs[2].value = half;
    var btn = tr.querySelector('.proc-split-btn');
    if (btn) { btn.classList.add('active'); setTimeout(function() { btn.classList.remove('active'); }, 800); }
    procRecalcRow(fid, id);
    procCheckAutoExpand(fid, id);
  }

  /* ── 9. RECALC ── */
  function procRecalcRow(fid, id) {
    var tr = document.getElementById('proc-row-' + fid + '-' + id);
    if (!tr) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    var qtdFt  = parseFloat(inputs[0].value) || 0;
    var a4     = parseFloat(inputs[1].value) || 0;
    var a5     = parseFloat(inputs[2].value) || 0;
    var preco  = parseFloat(inputs[3].value) || 0;
    var desc   = parseFloat(inputs[4].value) || 0;
    var dEl    = document.getElementById('proc-d-'    + fid + '-' + id);
    var plusEl = document.getElementById('proc-plus-' + fid + '-' + id);
    var hasD   = dEl   ? dEl.checked   : false;
    var plus1  = plusEl ? plusEl.checked : false;
    var pecas  = a4 + a5;

    var statusEl = document.getElementById('proc-status-' + fid + '-' + id);
    if (statusEl) {
      if (!preco && !qtdFt && !pecas) {
        statusEl.textContent = '\u2014'; statusEl.className = 'proc-cell-status';
      } else if (!qtdFt || !pecas) {
        statusEl.textContent = '\u2014'; statusEl.className = 'proc-cell-status';
      } else if (pecas === qtdFt) {
        statusEl.textContent = 'OK'; statusEl.className = 'proc-cell-status ok';
      } else if (hasD) {
        var diff = pecas - qtdFt;
        statusEl.textContent = diff > 0 ? 'D (+' + diff + ')' : 'D (' + diff + ')';
        statusEl.className = 'proc-cell-status warn';
      } else {
        var diff2 = pecas - qtdFt;
        statusEl.textContent = diff2 > 0 ? '+' + diff2 + ' pzs' : diff2 + ' pzs';
        statusEl.className = 'proc-cell-status err';
      }
    }

    var pc = procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5);
    var pvpResult = procCalcPVP(preco);
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (pvpEl) {
      if (pvpResult !== null) {
        pvpEl.textContent = pvpResult.pvpFinal.toFixed(2) + ' \u20ac';
        pvpEl.className = 'proc-cell-computed has-val';
      } else {
        pvpEl.textContent = '\u2014'; pvpEl.className = 'proc-cell-computed';
      }
    }

    var marg   = pvpResult ? procCalcMargem(pvpResult.pvp1, preco) : null;
    var margEl = document.getElementById('proc-marg-' + fid + '-' + id);
    if (margEl) {
      if (marg !== null) {
        var cls = 'proc-cell-computed has-val proc-margem-val';
        if (marg < 20) cls += ' very-low';
        else if (marg < 30) cls += ' low';
        margEl.textContent = marg.toFixed(1) + '%';
        margEl.className = cls;
      } else {
        margEl.textContent = '\u2014'; margEl.className = 'proc-cell-computed';
      }
    }

    var totalEl = document.getElementById('proc-total-' + fid + '-' + id);
    if (totalEl) {
      if (preco && pecas) {
        var lineTotal = pecas * pc * (1 - desc / 100);
        totalEl.textContent = lineTotal.toFixed(2) + ' \u20ac';
        totalEl.className = 'proc-cell-computed has-val';
      } else {
        totalEl.textContent = '\u2014'; totalEl.className = 'proc-cell-computed';
      }
    }

    var refVal = tr.querySelector('.proc-ref-input') ? tr.querySelector('.proc-ref-input').value : '';
    if (preco || refVal) tr.classList.add('has-data');
    else                 tr.classList.remove('has-data');

    procUpdateSummary(fid);
  }

  /* ── 10. SUMMARY ── */
  function procUpdateSummary(fid) {
    var total = 0, piezas = 0, lines = 0;
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var tr   = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var nums = tr.querySelectorAll('input[type="number"]');
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var desc  = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var dEl2  = document.getElementById('proc-d-'    + fid + '-' + i);
      var pEl2  = document.getElementById('proc-plus-' + fid + '-' + i);
      var hasD2 = dEl2 ? dEl2.checked  : false;
      var plus2 = pEl2 ? pEl2.checked  : false;
      var pcs   = a4 + a5;
      if (preco && pcs) {
        var pc2 = procCalcPrecoCusto(preco, plus2, hasD2, qtdFt, a4, a5);
        total  += pcs * pc2 * (1 - desc / 100);
        piezas += pcs;
        lines++;
      }
    }
    var tcEl = document.getElementById('proc-totalCalc-'   + fid);
    var lcEl = document.getElementById('proc-lineCount-'   + fid);
    var tpEl = document.getElementById('proc-totalPiezas-' + fid);
    if (tcEl) tcEl.textContent = total.toFixed(2);
    if (lcEl) lcEl.textContent = lines;
    if (tpEl) tpEl.textContent = piezas;
    procUpdateHeader(fid, total);
  }

  function procUpdateHeader(fid, computedTotal) {
    if (computedTotal === undefined) {
      var tEl = document.getElementById('proc-totalCalc-' + fid);
      computedTotal = parseFloat(tEl ? tEl.textContent : 0) || 0;
    }
    var vEl      = document.getElementById('proc-valorFactura-' + fid);
    var ftVal    = parseFloat(vEl ? vEl.value : 0) || 0;
    var diffChip = document.getElementById('proc-diffChip-' + fid);
    if (!diffChip) return;
    if (!ftVal) {
      diffChip.className = 'proc-diff-chip zero';
      diffChip.textContent = '\u00b1 0.00 \u20ac';
      return;
    }
    var diff = computedTotal - ftVal;
    if (Math.abs(diff) < 0.01) {
      diffChip.className = 'proc-diff-chip zero'; diffChip.textContent = '\u2713 fatura certa';
    } else {
      var sign = diff > 0 ? '+' : '';
      diffChip.className = 'proc-diff-chip ' + (diff > 0 ? 'pos' : 'neg');
      diffChip.textContent = 'erro ' + sign + diff.toFixed(2) + ' \u20ac';
    }
  }

  /* ── 11. CALC HELPERS ── */
  function procCalcPVP(preco) {
    if (!preco || preco <= 0) return null;
    var raw  = preco * 2 + (preco * 2) * 0.23;
    var r    = Math.round(raw) - 0.01;
    var pvp1 = r < raw ? r + 1 : r;
    pvp1 = Math.round(pvp1 * 100) / 100;
    if (Math.abs(pvp1 - 13.99) < 0.005) pvp1 = 14.99;
    var pvpFinal = Math.round((pvp1 + 1) * 100) / 100;
    if (Math.abs(pvpFinal - 13.99) < 0.005) pvpFinal = 14.99;
    return { pvp1: pvp1, pvpFinal: pvpFinal };
  }
  function procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5) {
    if (!preco) return 0;
    var p   = preco;
    if (plus1) p += 1;
    var pcs = (a4 || 0) + (a5 || 0);
    if (hasD && qtdFt && pcs && pcs !== qtdFt) p = (qtdFt * p) / pcs;
    return p;
  }
  function procCalcMargem(pvp1, precoOriginal) {
    if (!pvp1 || !precoOriginal) return null;
    var pvpSemIVA = pvp1 / 1.22;
    return ((pvpSemIVA - precoOriginal) / pvpSemIVA) * 100;
  }

  /* ── 12. COLLECT ROWS ── */
  function procCollectRows(fid) {
    var result = [];
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var tr  = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var rIn  = tr.querySelector('.proc-ref-input');
      var dIn2 = tr.querySelector('.proc-desc-input');
      var nums = tr.querySelectorAll('input[type="number"]');
      var oIn  = tr.querySelector('.proc-obs-input');
      var dCb  = document.getElementById('proc-d-'    + fid + '-' + i);
      var pCb  = document.getElementById('proc-plus-' + fid + '-' + i);
      var ref   = rIn  ? rIn.value.trim()  : '';
      var desc  = dIn2 ? dIn2.value.trim() : '';
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var dPct  = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var hasD3 = dCb ? dCb.checked : false;
      var plus3 = pCb ? pCb.checked : false;
      var obs   = oIn ? oIn.value   : '';
      if (!ref && !preco) continue;
      var pc3 = procCalcPrecoCusto(preco, plus3, hasD3, qtdFt, a4, a5);
      result.push({ ref:ref, desc:desc, qtdFt:qtdFt, a4:a4, a5:a5,
                    preco:preco, descPct:dPct, hasD:hasD3, plus1:plus3,
                    precoCusto:pc3, obs:obs });
    }
    return result;
  }

  /* ── 13. COPY BAR HELPER ── */
  function procBindCopyBar(modal, cols, getVal) {
    var msg   = modal.querySelector('.proc-or-copy-msg');
    var timer = null;
    modal.querySelectorAll('.proc-or-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ci   = parseInt(btn.dataset.col);
        var vals = getVal(ci);
        if (!vals.length) return;
        modal.querySelectorAll('.proc-or-copy-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var text = vals.join('\n');
        var show = function(ok) {
          if (msg) {
            msg.textContent = ok ? '\u2713 ' + cols[ci] + ' copiado!' : '\u26a0 copie manualmente';
            msg.style.color = ok ? '#2a8a2a' : '#e67e00';
          }
          if (timer) clearTimeout(timer);
          timer = setTimeout(function() {
            if (msg) msg.textContent = '';
            modal.querySelectorAll('.proc-or-copy-btn').forEach(function(b) { b.classList.remove('active'); });
          }, 2200);
        };
        var fallback = function() {
          try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); show(true);
          } catch(e) { show(false); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() { show(true); }).catch(fallback);
        } else { fallback(); }
      });
    });
  }

  /* ── 14. MODAL HELPERS ── */
  function procOpenModal(modal) {
    document.body.appendChild(modal);
    requestAnimationFrame(function() { modal.classList.add('visible'); });
  }
  function procCloseModal(modal) {
    modal.classList.remove('visible');
    setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
  }
  function procBindClose(modal) {
    modal.querySelector('.proc-or-backdrop').addEventListener('click', function() { procCloseModal(modal); });
    modal.querySelector('.proc-or-close-btn').addEventListener('click',  function() { procCloseModal(modal); });
    var esc = function(e) { if (e.key === 'Escape') { procCloseModal(modal); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  /* ── 15. STOCK MODAL ── */
  function procShowStockModal(fid) {
    var rows      = procCollectRows(fid);
    var pEl       = document.getElementById('proc-proveedor-' + fid);
    var proveedor = pEl ? (pEl.value || '\u2014') : '\u2014';

    var lines = [];
    [['Funchal','A4'],['Porto Santo','A5']].forEach(function(pair) {
      var loja = pair[0], cod = pair[1];
      rows.forEach(function(r) {
        var qty = cod === 'A4' ? r.a4 : r.a5;
        if (qty > 0) lines.push({ ref:r.ref, loja:loja, cod:cod, iva:'23', precio:r.precoCusto, qty:qty });
      });
    });

    var COLS = ['Refer\u00eancia','Armaz\u00e9m','IVA','Pre\u00e7o','Qtd.'];
    var copyBar = '<div class="proc-or-copy-bar"><span class="proc-or-copy-label">Copiar coluna:</span>'
      + COLS.map(function(c,i) { return '<button class="proc-or-copy-btn" data-col="' + i + '">\u29c9 ' + c + '</button>'; }).join('')
      + '<span class="proc-or-copy-msg"></span></div>';

    var tableRows = lines.length
      ? lines.map(function(l) {
          return '<tr>'
            + '<td>' + l.ref + '</td>'
            + '<td class="center" style="font-weight:700;letter-spacing:.05em">' + l.cod + '</td>'
            + '<td class="center">' + l.iva + '</td>'
            + '<td class="right">' + l.precio.toFixed(2) + ' \u20ac</td>'
            + '<td class="center">' + l.qty + '</td>'
            + '</tr>';
        }).join('')
      : '<tr class="empty-row"><td colspan="5">Sem linhas com dados para mostrar</td></tr>';

    var totalFunchal    = lines.filter(function(l) { return l.cod==='A4'; }).reduce(function(s,l) { return s+l.qty; }, 0);
    var totalPortoSanto = lines.filter(function(l) { return l.cod==='A5'; }).reduce(function(s,l) { return s+l.qty; }, 0);
    var totalStock      = lines.reduce(function(s,l) { return s + l.qty * l.precio; }, 0);

    var modal = document.createElement('div');
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">' + proveedor + '</span>'
      +       '<span class="proc-or-panel-title-sub">Ingresso de Stock \u00b7 ERP</span>'
      +     '</div>'
      +     '<div class="proc-or-panel-header-btns">'
      +       '<button class="proc-or-action-btn" id="proc-stock-export-btn">\u2b07 exportar CSV</button>'
      +       '<button class="proc-or-close-btn">\u2715</button>'
      +     '</div>'
      +   '</div>'
      +   copyBar
      +   '<div class="proc-or-scroll">'
      +     '<table class="proc-or-table"><thead><tr>'
      +       '<th>Refer\u00eancia</th>'
      +       '<th class="center">Armaz\u00e9m</th>'
      +       '<th class="center">IVA</th>'
      +       '<th class="center">Pre\u00e7o</th>'
      +       '<th class="center">Qtd.</th>'
      +     '</tr></thead>'
      +     '<tbody>' + tableRows + '</tbody>'
      +     '</table>'
      +   '</div>'
      +   '<div class="proc-or-panel-footer">'
      +     lines.length + ' linhas \u00b7 ' + totalFunchal + ' un. Funchal \u00b7 ' + totalPortoSanto + ' un. Porto Santo'
      +     ' \u00b7 <strong style="color:#222">Total: ' + totalStock.toFixed(2) + ' \u20ac</strong>'
      +   '</div>'
      + '</div>';

    procBindClose(modal);
    procBindCopyBar(modal, COLS, function(ci) {
      return lines.map(function(l) {
        if (ci===0) return l.ref;
        if (ci===1) return l.cod;
        if (ci===2) return l.iva;
        if (ci===3) return l.precio.toFixed(2).replace('.',',');
        return String(l.qty);
      });
    });

    modal.querySelector('#proc-stock-export-btn').addEventListener('click', function() {
      var bom    = '\uFEFF';
      var header = 'Refer\u00eancia;Armaz\u00e9m;IVA;Pre\u00e7o;Quantidade';
      var body   = lines.map(function(l) {
        return [l.ref, l.cod, l.iva, l.precio.toFixed(2).replace('.',','), l.qty].join(';');
      }).join('\r\n');
      var blob = new Blob([bom + header + '\r\n' + body], { type:'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = 'Stock_' + proveedor.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    });

    procOpenModal(modal);
  }

  /* ── 16. BUILD OVERLAY HTML ── */
  function buildOverlayContent(container) {
    container.id = 'proc-content';
    container.innerHTML =
        '<div class="page-wrap">'
      +   '<div class="proc-top-bar">'
      +     '<h1 class="proc-app-title">Processamento de Faturas</h1>'
      +     '<div class="proc-top-actions">'
      +       '<span id="proc-saveStatus" class="proc-save-status"></span>'
      +       '<div class="proc-session-menu-wrap">'
      +         '<button class="proc-btn" id="proc-sessionMenuBtn">&#128194; sess&#245;es &#x25be;</button>'
      +         '<div id="proc-sessionMenuDropdown" class="proc-session-dropdown hidden"></div>'
      +       '</div>'
      +       '<button class="proc-btn primary" id="proc-saveBtn">&#128190; guardar</button>'
      +     '</div>'
      +   '</div>'
      +   '<div id="proc-faturasContainer"></div>'
      +   '<div class="proc-add-fatura-wrap">'
      +     '<button class="proc-add-fatura-btn proc-btn" id="proc-addFaturaBtn">&#65291; adicionar fatura</button>'
      +   '</div>'
      +   '<div class="proc-disclaimer-msg">'
      +     '&#9888;&#65039; SE OS ITENS TIVEREM DESCONTO DEVES INSERIR O PRE&#199;O NORMAL E, NA COLUNA DE %, INSERIR O VALOR DO DESCONTO (%).'
      +   '</div>'
      + '</div>';

    /* bind buttons */
    document.getElementById('proc-saveBtn').addEventListener('click', function() { procSaveSession(true); });
    document.getElementById('proc-sessionMenuBtn').addEventListener('click', function(e) { procToggleSessionMenu(e); });
    document.getElementById('proc-addFaturaBtn').addEventListener('click', function() { procAddFatura(null); });

    /* close session menu on outside click */
    document.addEventListener('click', function() { procCloseSessionMenu(); });
  }

  /* ── 17. INIT ── */
  function initProcessamento(container) {
    if (_procInited) return;
    _procInited = true;

    /* reset state */
    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });

    buildOverlayContent(container);
    procAddFatura(null);

    /* auto-save every 10 s */
    setInterval(function() { procSaveSession(false); }, 10000);
  }

  /* ── 18. OVERLAY OPEN / CLOSE ── */
  function openProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    requestAnimationFrame(function() { overlay.classList.add('visible'); });

    /* init on first open */
    var content = document.getElementById('proc-content');
    if (!content) {
      var root = document.getElementById('proc-root');
      if (root) initProcessamento(root);
    }
  }

  function closeProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.classList.remove('open'); }, 600);
  }

  /* ── 19. EXPOSE GLOBALS ── */
  window.openProcessamentoOverlay  = openProcessamentoOverlay;
  window.closeProcessamentoOverlay = closeProcessamentoOverlay;

  /* functions called from inline onclick in dynamically built HTML */
  window.procAddFatura           = procAddFatura;
  window.procRemoveFatura        = procRemoveFatura;
  window.procUpdateBannerProvider= procUpdateBannerProvider;
  window.procUpdateHeader        = procUpdateHeader;
  window.procRecalcRow           = procRecalcRow;
  window.procCheckAutoExpand     = procCheckAutoExpand;
  window.procAutoSplit           = procAutoSplit;
  window.procShowStockModal      = procShowStockModal;
  window.procToggleSessionMenu   = procToggleSessionMenu;
  window.procLoadSession         = procLoadSession;
  window.procDeleteSession       = procDeleteSession;
  window.procSaveSession         = procSaveSession;

})();
