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
      '#proc-content { width:100%; min-height:100%; background:#fff; padding:20px; display:flex; flex-direction:column; align-items:center; font-family:\'MontserratLight\', sans-serif; font-size:14px; font-weight:600; color:#000; }',
      '#proc-content .page-wrap { width:100%; max-width:1400px; margin:0 auto; }',

      /* Top bar */
      '#proc-content .proc-top-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:10px; }',
      '#proc-content .proc-app-title { font-size:1.05rem; font-weight:700; color:#000; letter-spacing:-.01em; }',
      '#proc-content .proc-top-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
      '#proc-content .proc-save-status { font-size:.72rem; font-weight:700; color:#000; opacity:0; transition:opacity 0.5s; white-space:nowrap; min-width:90px; text-align:right; }',

      /* Session dropdown */
      '#proc-content .proc-session-menu-wrap { position:relative; }',
      '#proc-content .proc-session-dropdown { position:fixed; width:340px; background:#fff; border:1px solid #e0e0e0; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.14); z-index:9999; overflow:hidden; max-height:380px; overflow-y:auto; }',
      '#proc-content .proc-session-dropdown.hidden { display:none; }',
      '#proc-content .proc-session-menu-empty { padding:18px 20px; text-align:center; color:#000; font-size:.78rem; font-weight:600; }',
      '#proc-content .proc-session-menu-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #f0f0f0; gap:8px; }',
      '#proc-content .proc-session-menu-item:last-child { border-bottom:none; }',
      '#proc-content .proc-session-menu-item.current { background:#f5f5f5; }',
      '#proc-content .proc-session-menu-item-info { display:flex; flex-direction:column; gap:2px; min-width:0; }',
      '#proc-content .proc-session-menu-item-label { font-size:.82rem; font-weight:700; color:#000; white-space:nowrap; }',
      '#proc-content .proc-session-current-badge { font-size:.58rem; background:#000; color:#fff; border-radius:4px; padding:1px 5px; margin-left:6px; vertical-align:middle; font-weight:700; }',
      '#proc-content .proc-session-menu-item-date { font-size:.67rem; color:#000; font-weight:600; }',
      '#proc-content .proc-session-menu-item-actions { display:flex; gap:5px; align-items:center; flex-shrink:0; }',
      '#proc-content .proc-session-load-btn { padding:3px 10px; border:1px solid #ccc; border-radius:6px; background:transparent; color:#000; font-size:.7rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:background 0.14s,border-color 0.14s; }',
      '#proc-content .proc-session-load-btn:hover { background:#f0f0f0; border-color:#555; }',
      '#proc-content .proc-session-delete-btn { padding:3px 8px; border:1px solid #ddd; border-radius:6px; background:transparent; color:#000; font-size:.7rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:background 0.14s,border-color 0.14s,color 0.14s; }',
      '#proc-content .proc-session-delete-btn:hover { border-color:#9B4D4D; color:#9B4D4D; background:#F5EAEA; }',

      /* Fatura instance & banner */
      '#proc-content .proc-fatura-instance { margin-bottom:40px; border-bottom:3px solid #000; padding-bottom:40px; contain:layout style; content-visibility:auto; contain-intrinsic-size:0 600px; }',
      '#proc-content .proc-fatura-instance:last-of-type { border-bottom:none; padding-bottom:0; }',
      '#proc-content .proc-fatura-banner { background:transparent; border-radius:12px 12px 0 0; padding:18px 24px; display:flex; align-items:center; justify-content:space-between; border:1px solid #e0e0e0; border-bottom:none; }',
      '#proc-content .proc-fatura-banner-left { display:flex; align-items:center; gap:10px; }',
      '#proc-content .proc-fatura-banner-num { font-size:.78rem; font-weight:400; text-transform:uppercase; letter-spacing:.18em; color:#000 !important; }',
      '#proc-content .proc-fatura-banner-provider { font-size:1.5rem; font-weight:800; color:#000 !important; letter-spacing:.02em; }',
      '#proc-content .proc-remove-fatura-btn { padding:3px 11px; border:1px solid #ccc; border-radius:6px; background:transparent; color:#000; font-size:.68rem; font-weight:700; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:background 0.14s,border-color 0.14s,color 0.14s; }',
      '#proc-content .proc-remove-fatura-btn:hover { border-color:#c47a7a; color:#c47a7a; background:rgba(155,77,77,.12); }',

      /* Connect banner to header-card */
      '#proc-content .proc-fatura-instance .proc-header-card { border-radius:0; border-top:none; margin-top:0; }',
      '#proc-content .proc-fatura-instance .proc-table-footer { border-radius:0 0 12px 12px; }',

      /* Header card */
      '#proc-content .proc-header-card { background:#fff; border:1px solid #e0e0e0; border-radius:0; padding:20px; margin-bottom:10px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; align-items:end; }',
      '#proc-content .proc-field-group { display:flex; flex-direction:column; gap:5px; }',
      '#proc-content .proc-field-label { font-size:.6rem; font-weight:400; letter-spacing:.12em; text-transform:uppercase; color:#000; opacity:.5; }',

      /* Inputs */
      '#proc-content input[type="text"], #proc-content input[type="number"] { background:#fafafa; border:1px solid #e0e0e0; color:#000; font-family:\'MontserratLight\',sans-serif; font-size:.88rem; font-weight:700; padding:8px 10px; border-radius:8px; outline:none; width:100%; transition:border-color 0.15s; -moz-appearance:textfield; }',
      '#proc-content input[type="text"]:focus, #proc-content input[type="number"]:focus { border-color:#000; background:#fff; }',
      '#proc-content input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; }',

      /* Total box */
      '#proc-content .proc-total-box { background:transparent; border:none; border-radius:0; padding:0; display:flex; flex-direction:column; gap:2px; }',
      '#proc-content .proc-total-box .proc-amount { font-size:1.4rem; font-weight:300; color:#000; letter-spacing:-.02em; }',

      /* Table block */
      '#proc-content .proc-table-block { background:#fff; border:1px solid #e0e0e0; border-radius:14px; overflow:visible; margin-bottom:10px; contain:layout style; }',
      '#proc-content .proc-table-wrap { overflow-x:auto; width:100%; }',
      '#proc-content .proc-table-wrap table { border-collapse:collapse; white-space:nowrap; border-radius:0; border-spacing:0; width:100%; table-layout:auto; }',
      '#proc-content .proc-table-wrap thead tr { background:transparent; border-bottom:1px solid #e0e0e0; }',
      '#proc-content .proc-table-wrap thead th { padding:8px 7px; text-align:center; font-size:.68rem; font-weight:700; letter-spacing:.10em; text-transform:uppercase; color:#000; opacity:1; white-space:nowrap; border:none; border-radius:0; background:transparent; }',
      '#proc-content .proc-table-wrap thead th.left { text-align:left; padding-left:10px; }',
      '#proc-content .proc-table-wrap thead th.th-a4 { color:#000; background:transparent; }',
      '#proc-content .proc-table-wrap thead th.th-a5 { color:#000; background:transparent; }',
      '#proc-content .proc-table-wrap tbody tr { border-bottom:1px solid #f0f0f0; }',
      '#proc-content .proc-table-wrap tbody tr:hover { background:#f5f5f5 !important; }',
      '#proc-content .proc-table-wrap tbody tr.has-data { background:#fff; }',
      '#proc-content .proc-table-wrap td { padding:3px 4px; vertical-align:middle; white-space:nowrap; border:none; border-radius:0; font-size:.9rem; font-weight:800; color:#000; }',

      /* TD inputs — compact, centered numbers */
      '#proc-content .proc-table-wrap td input[type="text"], #proc-content .proc-table-wrap td input[type="number"] { background:transparent; border:1px solid transparent; font-size:.85rem; font-weight:800; padding:3px 4px; border-radius:6px; width:100%; color:#000; text-align:center; }',
      '#proc-content .proc-table-wrap td input[type="number"] { width:44px; text-align:center; }',
      '#proc-content .proc-table-wrap td input.proc-ref-input { width:auto; min-width:0; text-align:left; text-transform:uppercase; }',
      '#proc-content .proc-table-wrap td input.proc-desc-input { width:auto; min-width:0; font-size:.73rem; text-align:left; text-transform:uppercase; }',
      '#proc-content .proc-table-wrap td input.proc-preco-input { width:46px; text-align:center; }',
      '#proc-content .proc-table-wrap td input.proc-desc-pct-input { width:38px; text-align:center; }',
      '#proc-content .proc-table-wrap td input:focus { background:#fff; border-color:#ccc; }',
      '#proc-content .proc-table-wrap td.center-col { text-align:center; }',
      '#proc-content .proc-table-wrap td.td-ref { }',
      '#proc-content .proc-table-wrap td.td-desc { }',

      /* Row misc */
      '#proc-content .proc-cell-computed { padding:3px 6px; font-size:.85rem; font-weight:800; text-align:center; color:#000; white-space:nowrap; }',
      '#proc-content .proc-cell-computed.has-val { color:#000; font-weight:800; }',
      /* PVP and Margem centered */
      '#proc-content td[id^="proc-pvp-"] { text-align:center !important; }',
      '#proc-content td[id^="proc-marg-"] { text-align:center !important; }',
      '#proc-content td[id^="proc-pvp-"].has-val { font-size:.88rem; font-weight:800; }',
      '#proc-content td[id^="proc-marg-"].has-val { font-size:.88rem; font-weight:800; }',
      /* PVP editable wrap */
      '#proc-content .proc-pvp-wrap { display:inline-flex; align-items:center; justify-content:center; gap:3px; }',
      '#proc-content .proc-pvp-display { font-size:.88rem; font-weight:800; color:#000; }',
      '#proc-content .proc-pvp-edit-input { width:52px; font-size:.85rem; font-weight:800; font-family:\'MontserratLight\',sans-serif; text-align:center; border:1px solid #ccc; border-radius:5px; background:#fff; color:#000; padding:2px 4px; display:none; -moz-appearance:textfield; }',
      '#proc-content .proc-pvp-edit-input::-webkit-inner-spin-button { -webkit-appearance:none; }',
      '#proc-content .proc-pvp-edit-input:focus { border-color:#000; outline:none; }',
      '#proc-content .proc-pvp-edit-btn { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; padding:0; border:1px solid #d0d0d0; background:transparent; cursor:pointer; color:#aaa; font-size:.55rem; border-radius:4px; flex-shrink:0; transition:background .15s,border-color .15s,color .15s; }',
      '#proc-content .proc-pvp-edit-btn:hover { color:#000; background:#f0f0f0; border-color:#ccc; }',
      '#proc-content .proc-pvp-edit-btn.active { color:#000; background:#e8e8e8; border-color:#999; }',
      '#proc-content .proc-cell-status { text-align:center; font-size:.75rem; font-weight:700; padding:3px 6px; white-space:nowrap; border-radius:6px; }',
      '#proc-content .proc-cell-status.ok { color:#fff; background:#4A7C6F; }',
      '#proc-content .proc-cell-status.err { color:#fff; background:#9B4D4D; }',
      '#proc-content .proc-cell-status.warn { color:#fff; background:#5F7B94; }',

      /* Copy button — elegant pill */
      '#proc-content .proc-copy-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; padding:0; border:1px solid #d0d0d0; background:transparent; cursor:pointer; color:#888; font-size:.6rem; line-height:1; border-radius:4px; flex-shrink:0; transition:background .15s,border-color .15s,color .15s; vertical-align:middle; margin-right:4px; }',
      '#proc-content .proc-copy-btn:hover { color:#000; background:#f0f0f0; border-color:#ccc; box-shadow:0 1px 4px rgba(50,78,102,.15); }',
      '#proc-content .proc-copy-btn.copied { color:#000 !important; background:#f0f0f0 !important; border-color:#ccc !important; }',
      /* Ref and desc cell layout */
      '#proc-content .proc-ref-wrap { display:inline-flex; align-items:center; width:100%; }',
      '#proc-content .proc-desc-wrap { display:inline-flex; align-items:center; width:100%; position:relative; }',

      /* Toggle D */
      '#proc-content .proc-toggle-d { display:flex; justify-content:center; align-items:center; white-space:nowrap; }',
      '#proc-content .proc-toggle-d input[type="checkbox"] { display:none; }',
      '#proc-content .proc-toggle-d label { cursor:pointer; padding:3px 8px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.7rem; font-weight:700; transition:background 0.15s,border-color 0.15s; user-select:none; white-space:nowrap; }',
      '#proc-content .proc-toggle-d input:checked + label { border-color:#000; color:#000; background:#f0f0f0; }',

      /* Split btn */
      '#proc-content .proc-split-btn { cursor:pointer; padding:3px 7px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.68rem; font-weight:700; background:transparent; font-family:\'MontserratLight\',sans-serif; transition:background 0.15s,border-color 0.15s; user-select:none; display:block; width:100%; text-align:center; }',
      '#proc-content .proc-split-btn:hover { border-color:#000; color:#000; background:#f0f0f0; }',
      '#proc-content .proc-split-btn.active { border-color:#000; color:#000; background:#f0f0f0; }',

      /* Fill-all header buttons (FNC / PXO column headers) */
      '#proc-content .proc-fill-all-btn { cursor:pointer; padding:3px 8px; border:1px solid #ccc; border-radius:6px; color:#000; font-size:.68rem; font-weight:700; background:transparent; font-family:\'MontserratLight\',sans-serif; transition:background 0.15s,border-color 0.15s,color 0.15s,box-shadow 0.15s; user-select:none; white-space:nowrap; line-height:1.4; }',
      '#proc-content .proc-fill-all-btn:hover { border-color:#000; background:#f0f0f0; box-shadow:0 1px 4px rgba(0,0,0,.10); }',
      '#proc-content .proc-fill-all-btn.flashed { border-color:#4A7C6F; color:#fff; background:#4A7C6F; box-shadow:0 2px 8px rgba(74,124,111,.35); }',

      /* Toggle +1 */
      '#proc-content .proc-toggle-plus { display:flex; justify-content:center; align-items:center; white-space:nowrap; }',
      '#proc-content .proc-toggle-plus input[type="checkbox"] { display:none; }',
      '#proc-content .proc-toggle-plus label { cursor:pointer; padding:3px 8px; border:1px solid #ddd; border-radius:6px; color:#000; font-size:.7rem; font-weight:700; transition:background 0.15s,border-color 0.15s; user-select:none; white-space:nowrap; }',
      '#proc-content .proc-toggle-plus input:checked + label { border-color:#000; color:#000; background:#f0f0f0; }',

      /* Margem */
      '#proc-content .proc-margem-val { color:#4A7C6F; }',
      '#proc-content .proc-margem-val.low { color:#5F7B94; }',
      '#proc-content .proc-margem-val.very-low { color:#9B4D4D; }',

      /* Footer */
      '#proc-content .proc-table-footer { background:transparent; border-top:1px solid #e0e0e0; border-radius:0 0 12px 12px; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }',
      '#proc-content .proc-summary-line { display:flex; gap:20px; font-size:.78rem; color:#000; font-weight:700; }',
      '#proc-content .proc-summary-line strong { color:#000; }',
      '#proc-content .proc-diff-chip { font-size:.75rem; font-weight:700; padding:3px 10px; border-radius:20px; border:1.5px solid; display:inline-flex; align-items:center; gap:5px; transition:background 0.3s ease,border-color 0.3s ease; }',
      '#proc-content .proc-diff-chip.zero { border-color:#3a6b60; color:#fff; background:linear-gradient(135deg,#4A7C6F,#6aab9e); font-size:.88rem; padding:5px 14px; border-radius:24px; box-shadow:0 2px 10px rgba(74,124,111,.35); letter-spacing:.02em; animation:proc-chip-pop 0.35s cubic-bezier(.36,.07,.19,.97); }',
      '#proc-content .proc-diff-chip.pos { border-color:#4a6a80; color:#fff; background:linear-gradient(135deg,#5F7B94,#9DB6C9); font-size:.95rem; font-weight:800; padding:6px 16px; border-radius:24px; box-shadow:0 3px 14px rgba(95,123,148,.45); letter-spacing:.02em; animation:proc-chip-shake 0.4s cubic-bezier(.36,.07,.19,.97); }',
      '#proc-content .proc-diff-chip.neg { border-color:#7a3535; color:#fff; background:linear-gradient(135deg,#9B4D4D,#c47a7a); font-size:.95rem; font-weight:800; padding:6px 16px; border-radius:24px; box-shadow:0 3px 16px rgba(155,77,77,.5); letter-spacing:.02em; animation:proc-chip-shake 0.4s cubic-bezier(.36,.07,.19,.97); }',
      '@keyframes proc-chip-pop { 0%{transform:scale(.85);opacity:.6} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }',
      '@keyframes proc-chip-shake { 0%{transform:scale(.85) rotate(-1deg);opacity:.5} 30%{transform:scale(1.1) rotate(1deg)} 60%{transform:scale(1.05) rotate(-0.5deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }',
      '#proc-content .proc-footer-actions { display:flex; gap:8px; }',

      /* Flag / alert button per row */
      '#proc-content .proc-flag-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; padding:0; border:1.5px solid #ddd; background:transparent; cursor:pointer; color:#bbb; font-size:.7rem; line-height:1; border-radius:5px; flex-shrink:0; transition:background .15s,border-color .15s,color .15s; }',
      '#proc-content .proc-flag-btn:hover { color:#000; background:#f0f0f0; border-color:#ccc; }',
      '#proc-content .proc-flag-btn.flagged { color:#fff; background:#9B4D4D; border-color:#7a3535; box-shadow:0 1px 6px rgba(155,77,77,.5); animation:proc-flag-pulse 1.8s ease-in-out infinite; }',
      '@keyframes proc-flag-pulse { 0%,100%{box-shadow:0 1px 6px rgba(155,77,77,.5)} 50%{box-shadow:0 2px 12px rgba(155,77,77,.8)} }',
      /* Active row highlight (when ref copy button is clicked) */
      '#proc-content .proc-table-wrap tbody tr.proc-row-active { background:linear-gradient(90deg,rgba(255,210,60,.18) 0%,rgba(255,243,180,.45) 100%) !important; outline:2px solid rgba(220,180,0,.45); outline-offset:-1px; }',
      '#proc-content .proc-table-wrap tbody tr.proc-row-active td.td-ref { background:#fffbe6 !important; }',
      /* Flagged row highlight */
      '#proc-content .proc-table-wrap tbody tr.proc-row-flagged { background:linear-gradient(90deg,rgba(155,77,77,.10) 0%,rgba(255,235,238,.45) 100%) !important; outline:2px solid rgba(155,77,77,.35); outline-offset:-1px; }',
      '#proc-content .proc-table-wrap tbody tr.proc-row-flagged:hover { background:linear-gradient(90deg,rgba(155,77,77,.16) 0%,rgba(255,235,238,.6) 100%) !important; }',
      /* Sticky cell in flagged row must have solid bg to avoid bleed-through */
      '#proc-content .proc-table-wrap tbody tr.proc-row-flagged td.td-ref { background:#fdf0f0 !important; }',
      '#proc-content .proc-table-wrap tbody tr.proc-row-flagged:hover td.td-ref { background:#f9e4e4 !important; }',

      /* Buttons */
      '#proc-content .proc-btn { padding:7px 16px; border:1px solid #ccc; border-radius:8px; background:transparent; color:#000; font-family:\'MontserratLight\',sans-serif; font-size:.78rem; font-weight:700; text-transform:lowercase; cursor:pointer; transition:background 0.15s,border-color 0.15s; white-space:nowrap; }',
      '#proc-content .proc-btn:hover { background:#f0f0f0; border-color:#555; }',
      '#proc-content .proc-btn.primary { border-color:#ccc; color:#000; background:transparent; }',
      '#proc-content .proc-btn.primary:hover { background:#f0f0f0; border-color:#555; }',

      /* Session bar — always one row, label left, buttons right */
      '#proc-session-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 0 12px; flex-wrap:nowrap; }',
      '#proc-session-bar-left { display:flex; align-items:center; gap:6px; min-width:0; flex:1; overflow:hidden; }',
      '#proc-session-bar-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }',
      '#proc-session-bar .proc-session-dropdown { position:absolute; }',

      /* Floating action buttons — visible only when top bar scrolls out */
      '#proc-float-actions { position:fixed; right:16px; bottom:24px; display:none; flex-direction:column; gap:10px; z-index:1200; transition:opacity 0.2s; }',
      '#proc-float-actions.proc-float-visible { display:flex; }',
      '#proc-float-actions .proc-float-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; width:52px; height:52px; border-radius:14px; border:1.5px solid; cursor:pointer; font-family:\'MontserratLight\',sans-serif; font-size:.50rem; font-weight:700; text-transform:lowercase; letter-spacing:.03em; line-height:1.2; transition:transform 0.18s,box-shadow 0.18s; box-shadow:0 4px 16px rgba(0,0,0,.18); }',
      '#proc-float-actions .proc-float-btn:hover { transform:scale(1.08); box-shadow:0 6px 22px rgba(0,0,0,.26); }',
      '#proc-float-actions .proc-float-btn:active { transform:scale(0.96); }',
      '#proc-float-actions .proc-float-btn-icon { font-size:1.2rem; line-height:1; }',
      '#proc-float-save { border-color:#ccc; color:#000; background:transparent; }',
      '#proc-float-save:hover { background:#f5f5f5; border-color:#555; }',

      /* OBS input */
      '#proc-content .proc-table-wrap td input.proc-obs-input { width:auto; min-width:0; }',

      /* OBS tooltip cell */
      '#proc-content .proc-obs-cell { position:relative; }',
      '#proc-content .proc-obs-tip { visibility:hidden; opacity:0; position:absolute; bottom:calc(100% + 8px); right:0; min-width:180px; max-width:300px; background:#1a1a1a; color:#fff !important; font-size:.78rem; font-weight:600; padding:8px 12px; border-radius:8px; white-space:pre-wrap; word-break:break-word; z-index:9999; pointer-events:none; line-height:1.6; transition:opacity .15s, visibility .15s; box-shadow:0 4px 14px rgba(0,0,0,.25); }',
      '#proc-content .proc-obs-tip::after { content:""; position:absolute; top:100%; right:14px; border:6px solid transparent; border-top-color:#1a1a1a; }',
      '#proc-content .proc-obs-cell:hover .proc-obs-tip.has-text { visibility:visible; opacity:1; }',

      /* Incoherence soft warning — orange border on fields */
      '#proc-content .proc-warn-field { border-color:#E8A44A !important; background:#FFFBF5 !important; }',
      '#proc-content .proc-warn-field:focus { border-color:#D4922A !important; }',
      /* Audit button */
      '#proc-content .proc-audit-btn { margin-left:6px; padding:1px 7px; border:1px solid #E8A44A; border-radius:5px; background:transparent; color:#C47A1E; font-family:\'MontserratLight\',sans-serif; font-size:.6rem; font-weight:700; cursor:pointer; vertical-align:middle; transition:background .15s,border-color .15s,color .15s; }',
      '#proc-content .proc-audit-btn:hover { background:#E8A44A; color:#fff; }',
      /* Audit panel table */
      '#proc-content .proc-audit-explain { font-size:.75rem; font-weight:600; color:#000; opacity:.6; margin-bottom:14px; line-height:1.6; }',
      '#proc-content .proc-audit-table { width:100%; border-collapse:collapse; margin-bottom:14px; }',
      '#proc-content .proc-audit-table thead th { font-size:.6rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; opacity:.45; padding:4px 8px; text-align:left; border-bottom:1px solid #e0e0e0; }',
      '#proc-content .proc-audit-row { border-bottom:1px solid #f5f5f5; transition:background .1s; }',
      '#proc-content .proc-audit-row:hover { background:#f9f5ee; }',
      '#proc-content .proc-audit-row-top { background:#FFFBF5; }',
      '#proc-content .proc-audit-row-top:hover { background:#FFF5E6; }',
      '#proc-content .proc-audit-row td { padding:7px 8px; font-size:.82rem; font-weight:700; color:#000; }',
      '#proc-content .proc-audit-ref { font-weight:800; }',
      '#proc-content .proc-audit-desc { font-weight:600; opacity:.55; font-size:.72rem; }',
      '#proc-content .proc-audit-val { font-variant-numeric:tabular-nums; }',
      '#proc-content .proc-audit-corr { color:#4A7C6F; }',
      '#proc-content .proc-audit-arrow { color:#000; opacity:.3; text-align:center; }',
      '#proc-content .proc-audit-pcs { opacity:.5; font-size:.75rem; }',
      '#proc-content .proc-audit-err { color:#E8A44A; font-size:.75rem; }',
      '#proc-content .proc-audit-pairs-title { font-size:.68rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#000; opacity:.4; margin-bottom:6px; }',
      '#proc-content .proc-audit-pair { font-size:.8rem; font-weight:700; color:#000; padding:4px 0; }',
      '#proc-content .proc-audit-pair-err { color:#E8A44A; font-weight:600; font-size:.75rem; }',
      '#proc-content .proc-audit-note { font-size:.68rem; font-weight:600; color:#000; opacity:.35; margin-top:10px; }',
      /* Onboarding tooltip */
      '#proc-onboarding-tip { position:absolute; z-index:2000; pointer-events:none; animation:proc-tip-in 0.3s ease both; color:#fff !important; }',
      '@keyframes proc-tip-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }',
      '#proc-onboarding-tip .proc-tip-bubble { background:#1a1a1a; color:#fff !important; font-family:\'MontserratLight\',sans-serif; font-size:.78rem; font-weight:700; padding:8px 14px; border-radius:10px; white-space:nowrap; box-shadow:0 4px 18px rgba(0,0,0,.28); display:flex; align-items:center; gap:8px; }',
      '#proc-onboarding-tip .proc-tip-arrow { position:absolute; top:100%; left:18px; border:7px solid transparent; border-top-color:#1a1a1a; }',
      '#proc-content .proc-add-fatura-wrap { display:flex; justify-content:center; margin:8px 0 14px; }',
      '#proc-content .proc-add-fatura-btn { padding:9px 32px; font-size:.82rem; border-style:dashed; border-color:#ccc; color:#000; background:transparent; border-radius:10px; }',
      '#proc-content .proc-add-fatura-btn:hover { background:#f0f0f0; border-color:#555; border-style:solid; }',

      /* Disclaimer */
      '#proc-content .proc-disclaimer-msg { margin:4px 0 6px; padding:10px 16px; background:transparent; border:none; border-radius:0; font-size:.75rem; font-weight:800; color:#000; letter-spacing:.03em; text-align:center; opacity:1; }',

      /* ── GUIA MODAL ── */
      '#proc-guia-modal { position:fixed; inset:0; z-index:5000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#proc-guia-modal.proc-guia-visible { opacity:1; pointer-events:auto; }',
      '#proc-guia-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '#proc-guia-panel { position:relative; z-index:1; width:min(720px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.28); overflow:hidden; transform:translateY(14px); transition:transform .22s ease; font-family:\'MontserratLight\',sans-serif; }',
      '#proc-guia-modal.proc-guia-visible #proc-guia-panel { transform:translateY(0); }',
      '#proc-guia-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e0e0e0; background:#fafafa; flex-shrink:0; flex-wrap:wrap; gap:8px; }',
      '#proc-guia-title { display:flex; flex-direction:column; gap:2px; }',
      '#proc-guia-title-main { font-size:.95rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '#proc-guia-title-sub { display:block; font-size:.68rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      '#proc-guia-header-btns { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }',
      /* Right side of header: banner stacked above buttons */
      '#proc-guia-header-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }',
      /* ── Banner sessões anteriores (proc + TAM) ── */
      '.proc-guia-other-banner { display:flex; align-items:center; gap:7px; border-radius:8px; padding:5px 10px; font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; transition:background .3s; }',
      '.proc-guia-other-loading { background:#f5f5f5; color:#000; opacity:.55; }',
      '.proc-guia-other-none    { background:transparent; color:#4A7C6F; }',
      '.proc-guia-other-found   { background:#FFFBF5; border:1px solid #E8A44A; color:#000; flex-wrap:wrap; }',
      '.proc-guia-other-icon    { font-size:1rem; flex-shrink:0; }',
      '.proc-guia-other-text    { display:flex; flex-direction:column; gap:1px; }',
      '.proc-guia-other-text strong { color:#000!important; }',
      '.proc-guia-other-sessions { font-size:.65rem; color:#000; opacity:.55; margin-top:1px; display:block; font-weight:600; }',
      '#proc-guia-other-add-btn:hover { background:#f0f0f0!important; border-color:#555!important; }',
      '#proc-guia-other-dismiss-btn:hover { background:#f5f5f5!important; }',
      '.proc-guia-session-dot { font-size:.55rem; vertical-align:middle; margin-right:3px; line-height:1; }',
      '#proc-guia-session-legend { display:flex; flex-wrap:wrap; gap:10px; padding:7px 14px 4px; font-size:.68rem; color:#000; font-family:\'MontserratLight\',sans-serif; border-top:1px dashed #e0e0e0; opacity:.6; font-weight:700; }',
      '.proc-guia-legend-item { display:flex; align-items:center; gap:4px; }',
      '.proc-guia-action-btn { padding:6px 16px; font-size:.76rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:8px; background:transparent; color:#000!important; transition:background .13s,color .13s; white-space:nowrap; }',
      '.proc-guia-action-btn:hover:not(:disabled) { background:#f0f0f0; border-color:#555; }',
      '.proc-guia-action-btn:disabled { opacity:.4; cursor:not-allowed; }',
      '.proc-guia-confirm { border-color:#000!important; color:#000!important; background:transparent!important; }',
      '.proc-guia-confirm:hover:not(:disabled) { background:#f0f0f0!important; border-color:#555!important; }',
      '.proc-guia-close-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:1rem; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:transparent; color:#000; transition:background .12s; }',
      '.proc-guia-close-btn:hover { background:#7a3535; color:#fff; border-color:#7a3535; }',
      '.proc-guia-copy-bar { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:10px 16px; background:#fafafa; border-bottom:1px solid #e0e0e0; flex-shrink:0; }',
      '.proc-guia-copy-btn { padding:7px 10px; font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#fff; color:#000; transition:background .12s,color .12s,border-color .12s; white-space:nowrap; text-align:center; display:flex; align-items:center; justify-content:center; gap:5px; }',
      '.proc-guia-copy-btn:hover { background:#f0f0f0; border-color:#555; }',
      '.proc-guia-copy-active { background:#f0f0f0!important; border-color:#555!important; }',
      '.proc-guia-copy-msg { display:none; }',
      '.proc-guia-addr-btn { padding:7px 10px; font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#fff; color:#000; transition:background .12s,color .12s,border-color .12s; white-space:nowrap; text-align:center; display:flex; align-items:center; justify-content:center; gap:5px; width:100%; }',
      '.proc-guia-addr-btn:hover { background:#f0f0f0; border-color:#555; }',
      '.proc-guia-addr-btn.proc-guia-addr-copied { background:#e8e8e8!important; border-color:#555!important; }',
      '.proc-guia-th2 { padding:7px 10px; background:#fff; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#000; border-bottom:2px solid #ddd; text-align:left; white-space:nowrap; }',
      '.proc-guia-th2-inner { display:flex; align-items:center; gap:5px; }',
      '.proc-guia-hdr-copy { padding:2px 6px; font-size:.58rem; border:1px solid #ccc; border-radius:5px; background:transparent; cursor:pointer; color:#888; font-family:\'MontserratLight\',sans-serif; font-weight:700; transition:background .12s,border-color .12s,color .12s; flex-shrink:0; }',
      '.proc-guia-hdr-copy:hover { background:#f0f0f0; border-color:#555; }',
      '.proc-guia-hdr-copy.proc-guia-copy-active { background:#f0f0f0!important; border-color:#555!important; }',
      '#proc-guia-scroll { overflow:auto; flex:1; -webkit-overflow-scrolling:touch; }',
      '#proc-guia-table { width:100%; border-collapse:collapse; font-family:\'MontserratLight\',sans-serif; font-size:.84rem; }',
      '#proc-guia-table thead { position:sticky; top:0; z-index:2; }',
      '.proc-guia-th { padding:9px 14px; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #ddd; text-align:center; }',
      '.proc-guia-th-f { background:#fff; color:#000; }',
      '.proc-guia-th-p { background:#fff; color:#000; }',
      '.proc-guia-th-sep { width:16px; background:#fff; border-bottom:2px solid #ddd; }',
      
      '.proc-guia-td { padding:7px 14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }',
      '.proc-guia-ref-f { font-weight:700; color:#000; min-width:120px; }',
      '.proc-guia-qty-f { text-align:center; font-weight:700; color:#000; font-variant-numeric:tabular-nums; }',
      '.proc-guia-sep-td { width:16px; background:#fafafa; border-bottom:1px solid #f0f0f0; }',
      '.proc-guia-ref-p { font-weight:700; color:#000; min-width:120px; }',
      '.proc-guia-qty-p { text-align:center; font-weight:700; color:#000; font-variant-numeric:tabular-nums; }',
      '.proc-guia-row-even td { background:#fff; }',
      '.proc-guia-row-odd td { background:#F7F4F3; }',
      '.proc-guia-row-sent td { background:#f5f5f5; }',
      '.proc-guia-row-sent .proc-guia-ref-f,.proc-guia-row-sent .proc-guia-ref-p { color:#000; }',
      '.proc-guia-row-sent .proc-guia-qty-f,.proc-guia-row-sent .proc-guia-qty-p { color:#000; }',
      '#proc-guia-table tbody tr:hover td { background:#f0f0f0!important; }',
      '.proc-guia-sent-hdr td { padding:6px 14px; background:transparent; font-size:.72rem; font-weight:700; color:#000; text-transform:uppercase; letter-spacing:.04em; border-top:2px solid #e0e0e0; border-bottom:1px solid #e0e0e0; }',
      '.proc-guia-empty { padding:24px; color:#000; font-style:italic; text-align:center; }',
      '.proc-guia-dot-col { width:14px; min-width:14px; max-width:14px; padding:4px 2px 4px 8px!important; text-align:center; vertical-align:middle; }',
      '.proc-guia-dot-th { width:14px; min-width:14px; border-bottom:2px solid #ddd; background:#fff; padding:0!important; }',
      '#proc-guia-footer { padding:8px 20px; font-size:.72rem; font-weight:700; color:#000!important; border-top:1px solid #e0e0e0; background:#fafafa; font-family:\'MontserratLight\',sans-serif; flex-shrink:0; }',
      '#proc-guia-confirm-overlay { position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.9); border-radius:16px; }',
      '#proc-guia-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.18); padding:24px 28px; width:min(380px,90%); font-family:\'MontserratLight\',sans-serif; }',
      '.proc-gc-title { font-size:.9rem; font-weight:700; color:#000; margin-bottom:12px; }',
      '.proc-gc-body { font-size:.82rem; color:#000; line-height:1.6; margin-bottom:18px; }',
      '.proc-gc-btns { display:flex; gap:8px; }',
      '.proc-gc-btn { padding:8px 18px; font-size:.82rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; border-radius:8px; cursor:pointer; border:1.5px solid #ccc; background:#fff; color:#000; transition:background .12s; }',
      '.proc-gc-ok { border-color:#000!important; color:#000!important; background:#f0f0f0!important; }',
      '.proc-gc-ok:hover { background:#e8e8e8!important; border-color:#555!important; }',
      '.proc-gc-cancel:hover { background:#f0f0f0; }',

      /* Address chips in guia header */
      '.proc-guia-addr-bar { display:flex; align-items:center; gap:5px; flex-wrap:wrap; justify-content:flex-end; padding:0 20px 10px; flex-shrink:0; }',
      '.proc-guia-addr-chip { display:flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:.75rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; cursor:pointer; transition:background .12s,border-color .12s; user-select:none; width:100%; box-sizing:border-box; justify-content:space-between; }',
      '.proc-guia-addr-chip:hover { background:#f0f0f0; border-color:#bbb; }',
      '.proc-guia-addr-chip.proc-addr-copied { background:#f0f0f0!important; border-color:#000!important; color:#000!important; }',
      '.proc-guia-addr-clip { font-size:.8rem; }',


      /* Description autocomplete — global element lives on body */
      '#proc-content .proc-desc-wrap { position:relative; display:inline-flex; align-items:center; width:100%; }',
      '#proc-desc-global-sugg { position:fixed; top:0; left:0; min-width:220px; max-width:360px; background:#fff; border:1.5px solid #000; border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,.12); z-index:99999; overflow:hidden; max-height:210px; overflow-y:auto; display:none; }',
      '#proc-desc-global-sugg .proc-desc-item { padding:7px 12px; font-size:.82rem; font-weight:700; color:#000; cursor:pointer; border-bottom:1px solid #f0f0f0; transition:background .1s; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
      '#proc-desc-global-sugg .proc-desc-item:last-child { border-bottom:none; }',
      '#proc-desc-global-sugg .proc-desc-item:hover { background:#f0f0f0; }',
      /* Provider autocomplete */
      '#proc-content .proc-forn-wrap { position:relative; }',
      '#proc-content .proc-forn-suggestions { position:absolute; top:calc(100% + 3px); left:0; right:0; background:#fff; border:1.5px solid #000; border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,.12); z-index:500; overflow:hidden; max-height:220px; overflow-y:auto; }',
      '#proc-content .proc-forn-suggestions.hidden { display:none; }',
      '#proc-content .proc-forn-item { padding:8px 12px; font-size:.85rem; font-weight:700; color:#000; cursor:pointer; border-bottom:1px solid #f0f0f0; transition:background .1s; }',
      '#proc-content .proc-forn-item:last-child { border-bottom:none; }',
      '#proc-content .proc-forn-item:hover { background:#f0f0f0; }',
      '#proc-content .proc-forn-item.corrected { color:#000; }',

      /* Table lock overlay */
      '#proc-content .proc-table-lock { display:flex; align-items:center; justify-content:center; padding:22px 16px; background:transparent; border:1px solid #e0e0e0; border-radius:14px; margin-bottom:10px; font-size:.88rem; font-weight:700; color:#000; text-align:center; gap:10px; }',
      '#proc-content .proc-table-lock span { font-size:1.2rem; }',

      /* Modals */
      '.proc-or-modal { position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.22s ease; pointer-events:none; }',
      '.proc-or-modal.visible { opacity:1; pointer-events:auto; }',
      '.proc-or-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '.proc-or-panel { position:relative; z-index:1; width:min(700px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.18); transform:translateY(14px); transition:transform 0.22s ease; overflow:hidden; }',
      '.proc-or-modal.visible .proc-or-panel { transform:translateY(0); }',
      '.proc-or-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e0e0e0; background:#fafafa; flex-shrink:0; }',
      '.proc-or-panel-title { display:flex; flex-direction:column; gap:2px; }',
      '.proc-or-panel-title-main { font-size:1rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-title-sub { font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-header-btns { display:flex; gap:8px; align-items:center; }',
      '.proc-or-close-btn { background:transparent; border:1.5px solid #ddd; border-radius:8px; color:#000; font-size:.85rem; padding:4px 10px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; font-weight:700; transition:background 0.14s,border-color 0.14s,color 0.14s; }',
      '.proc-or-close-btn:hover { border-color:#9B4D4D; color:#9B4D4D; background:#F5EAEA; }',
      '.proc-or-action-btn { background:#fff; border:1px solid #ccc; border-radius:8px; color:#000; font-size:.75rem; font-weight:700; text-transform:lowercase; padding:5px 13px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:background 0.14s,border-color 0.14s,color 0.14s; }',
      '.proc-or-action-btn:hover { background:#f0f0f0; border-color:#555; }',
      '.proc-or-copy-bar { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; padding:10px 16px; border-bottom:1px solid #f0f0f0; background:#fff; flex-shrink:0; }',
      '.proc-or-copy-label { display:none; }',
      '.proc-or-copy-btn { background:#fff; border:1.5px solid #ddd; border-radius:8px; color:#000; font-size:.72rem; font-weight:700; padding:7px 6px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:background 0.14s,border-color 0.14s,color 0.14s; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px; }',
      '.proc-or-copy-btn:hover { background:#f0f0f0; border-color:#555; }',
      '.proc-or-copy-btn.active { border-color:#555; color:#000; background:#f0f0f0; }',
      '.proc-or-copy-msg { display:none; }',
      '.proc-or-scroll { overflow:auto; flex:1; }',
      '.proc-or-table { border-collapse:collapse; font-family:\'MontserratLight\',sans-serif; white-space:nowrap; width:100%; }',
      '.proc-or-table thead { position:sticky; top:0; z-index:2; }',
      '.proc-or-table thead tr { background:transparent; border-bottom:1px solid #e0e0e0; }',
      '.proc-or-table th { padding:8px 12px; text-align:left; font-size:.65rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; white-space:nowrap; }',
      '.proc-or-table th.center { text-align:center; }',
      '.proc-or-table td { padding:7px 12px; font-size:.84rem; font-weight:400; border-bottom:1px solid #f0f0f0; color:#000; }',
      '.proc-or-table td.center { text-align:center; }',
      '.proc-or-table td.right { text-align:right; }',
      '.proc-or-table tr:nth-child(even) td { background:#fafafa; }',
      '.proc-or-table tr:hover td { background:#f0f0f0 !important; }',
      '.proc-or-table .empty-row td { text-align:center; color:#000; padding:24px; font-style:italic; font-weight:400; }',
      '.proc-or-panel-footer { padding:10px 20px; border-top:1px solid #e0e0e0; background:#fafafa; font-size:.72rem; font-weight:700; color:#000; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',

      /* Ref column: auto-width driven by content, no fixed sizes */
      '#proc-content .proc-table-wrap td.td-ref { width:1px; white-space:nowrap; padding:3px 4px; }',
      '#proc-content .proc-table-wrap th.left:first-child { width:1px; white-space:nowrap; }',
      '#proc-content .proc-table-wrap td.td-ref .proc-ref-wrap { display:inline-flex; align-items:center; gap:0; width:auto; }',
      '#proc-content .proc-table-wrap td input.proc-ref-input { width:auto; min-width:0; max-width:none; text-align:left; padding-left:4px; text-transform:uppercase; }',

      /* ── RESPONSIVE ── */
      '@media (max-width:768px) {',
      '  #proc-content { padding:10px; }',
      '  #proc-content .proc-fatura-banner { padding:14px 14px; flex-wrap:wrap; gap:8px; }',
      '  #proc-content .proc-fatura-banner-provider { font-size:1.15rem; }',
      '  #proc-content .proc-header-card { grid-template-columns:1fr; gap:12px; padding:14px; }',
      '  #proc-content .proc-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }',
      '  #proc-content .proc-table-wrap table { min-width:0; table-layout:auto; }',
      /* Sticky ref column on mobile */
      '  #proc-content .proc-table-wrap td.td-ref {',
      '    position:sticky; left:0; background:#fff; z-index:2;',
      '  }',
      '  #proc-content .proc-table-wrap td.td-ref::after {',
      '    content:""; position:absolute; top:0; right:-8px; bottom:0; width:8px;',
      '    background:linear-gradient(to right,rgba(0,0,0,.10),transparent); pointer-events:none;',
      '  }',
      '  #proc-content .proc-table-wrap th.left:first-child {',
      '    position:sticky; left:0; background:#fff; z-index:3;',
      '  }',
      '  #proc-content .proc-table-wrap th.left:first-child::after {',
      '    content:""; position:absolute; top:0; right:-8px; bottom:0; width:8px;',
      '    background:linear-gradient(to right,rgba(0,0,0,.10),transparent); pointer-events:none;',
      '  }',
      '  #proc-content .proc-table-wrap tbody tr:hover td.td-ref { background:#f5f5f5 !important; }',
      '  #proc-content .proc-table-wrap tbody tr.proc-row-flagged td.td-ref { background:#fdf0f0 !important; }',
      '  #proc-content .proc-table-wrap tbody tr.proc-row-flagged:hover td.td-ref { background:#f9e4e4 !important; }',
      '  #proc-content .proc-top-bar { flex-direction:column; align-items:flex-start; }',
      '  #proc-content .proc-footer-actions { flex-wrap:wrap; }',
      '  #proc-content .proc-table-footer { flex-direction:column; align-items:flex-start; gap:10px; }',
      '  #proc-float-actions { right:12px; bottom:16px; }',
      '  #proc-float-actions .proc-float-btn { width:46px; height:46px; }',
      '}',
      '@media (min-width:769px) and (max-width:1024px) {',
      '  #proc-content .proc-header-card { grid-template-columns:1fr 1fr; }',
      '  #proc-content .proc-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }',
      '  #proc-content .proc-table-wrap td.td-ref {',
      '    position:sticky; left:0; background:#fff; z-index:2;',
      '  }',
      '  #proc-content .proc-table-wrap td.td-ref::after {',
      '    content:""; position:absolute; top:0; right:-8px; bottom:0; width:8px;',
      '    background:linear-gradient(to right,rgba(0,0,0,.08),transparent); pointer-events:none;',
      '  }',
      '  #proc-content .proc-table-wrap th.left:first-child {',
      '    position:sticky; left:0; background:#fff; z-index:3;',
      '  }',
      '  #proc-content .proc-table-wrap th.left:first-child::after {',
      '    content:""; position:absolute; top:0; right:-8px; bottom:0; width:8px;',
      '    background:linear-gradient(to right,rgba(0,0,0,.08),transparent); pointer-events:none;',
      '  }',
      '  #proc-content .proc-table-wrap tbody tr:hover td.td-ref { background:#f5f5f5 !important; }',
      '  #proc-content .proc-table-wrap tbody tr.proc-row-flagged td.td-ref { background:#fdf0f0 !important; }',
      '  #proc-content .proc-table-wrap tbody tr.proc-row-flagged:hover td.td-ref { background:#f9e4e4 !important; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ── 2. STATE ── */
  var faturaCount   = 0;
  var activeFaturas = [];
  var rowCounts     = {};
  var _procInited   = false;
  var _isSynced     = false;   /* true only after remote fetch completes on init */

  /* ── UNDO HISTORY (Ctrl+Z, ultimos 10 estados) ── */
  var _undoStack   = [];
  var _undoMaxSize = 10;
  var _undoPaused  = false; /* evita gravacao durante restore */

  /* ── 2a. SUPABASE CONFIG ── */
  var PROC_SB_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  var PROC_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  function procSbHeaders() {
    return { 'Content-Type': 'application/json', 'apikey': PROC_SB_KEY, 'Authorization': 'Bearer ' + PROC_SB_KEY };
  }
  function procSbFetch(path, opts) {
    return fetch(PROC_SB_URL + '/rest/v1/' + path, Object.assign({ headers: procSbHeaders() }, opts || {}));
  }

  /* ── 2b. SYNC STATUS ── */
  function procSetSyncStatus(state, msg) {
    var el = document.getElementById('proc-saveStatus');
    if (!el) return;
    var icons = { syncing: '↻', ok: '✓', error: '⚠', offline: '⊘' };
    el.textContent = (icons[state] || '') + ' ' + msg;
    el.style.opacity = '1';
    el.style.color = state === 'error' ? '#9B4D4D' : state === 'offline' ? '#5F7B94' : '#4A7C6F';
    clearTimeout(el._t);
    if (state === 'ok') {
      el._t = setTimeout(function() { el.style.opacity = '0'; }, 3000);
    }
  }

  function procMarkSynced() {
    _isSynced = true;
  }

  /* ── UNDO HELPERS ── */

  function procUndoSnapshot() {
    if (_undoPaused) return;
    var payload = procBuildSavePayload();
    if (!payload) return;
    var json = JSON.stringify(payload);
    if (_undoStack.length && _undoStack[_undoStack.length - 1] === json) return;
    _undoStack.push(json);
    if (_undoStack.length > _undoMaxSize) _undoStack.shift();
  }

  function procUndoRestore() {
    if (_undoStack.length < 2) {
      procUndoFlash('nada para desfazer');
      return;
    }
    _undoStack.pop();
    var json = _undoStack[_undoStack.length - 1];
    _undoPaused = true;
    try {
      var data;
      try { data = JSON.parse(json); } catch(e) { _undoPaused = false; return; }
      var cont = document.getElementById('proc-faturasContainer');
      if (cont) cont.innerHTML = '';
      faturaCount   = 0;
      activeFaturas = [];
      Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
      var faturas = data.faturas || [];
      if (!faturas.length) { procAddFatura(null); }
      else faturas.forEach(function(fd) { procAddFatura(fd); });
    } finally {
      _undoPaused = false;
    }
    procUndoFlash('desfeito');
  }

  function procUndoFlash(msg) {
    var el = document.getElementById('proc-saveStatus');
    if (!el) return;
    var prev = el.textContent;
    var prevOpacity = el.style.opacity;
    el.textContent = String.fromCharCode(8617) + ' ' + msg;
    el.style.opacity = '1';
    el.style.color = '#5F7B94';
    clearTimeout(el._t);
    el._t = setTimeout(function() {
      el.textContent = prev;
      el.style.opacity = prevOpacity;
      el.style.color = '';
    }, 1800);
  }

  function procInitUndoKeyboard() {
    document.addEventListener('keydown', function(e) {
      var inProc = document.getElementById('proc-content');
      if (!inProc) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        var active = document.activeElement;
        if (!inProc.contains(active) && active !== document.body) return;
        e.preventDefault();
        procUndoRestore();
      }
    });
  }

  /* ── 2b. PROVIDER LIST ── */
  var PROVIDERS = [
    'TAM','REN KE ZHONG','MEMORIAS INFINITAS','AMORADO','JOLIE','PARFOIS','BORBOLETA VISTOSA',
    'DALUN CHENG','SEMPRE NATURAL','MODA GY','XU HAIDONG','KAMRUZZAMAN','LOSAN','EUROPA&MING',
    'VEGOTEX','CHEN XIANG','YOUHE YANG','BLISSED','PICKBEAUTY','MODA EUROPA','VILA & SAAVEDRA',
    'MUKIT','ALCOTT','CHUXUAN SUN','MELODYSTATION','MUNDO FAVORITO','MING TA','ARITA','ALDATEX',
    'GOOD E GOOD','BLUE ROYAL','EXOTICO & CINTILANTE','SKY LOVERS','ZHUO QIUHUI','BESTSELLER',
    'FARZANA','BIJUTERIA XU HAIDONG','NOVA MODA','XIANDENG ZHANG','WAVINGMOON','ERRUI CHEN',
    'YINGLONG'
  ];

  function procNormalize(s) {
    return s.trim().toUpperCase().replace(/\s+/g,' ');
  }

  function procFindMatches(query) {
    var q = procNormalize(query);
    if (!q) return [];
    return PROVIDERS.filter(function(p) {
      return p.indexOf(q) !== -1 || q.indexOf(p) !== -1 ||
             p.split(' ').some(function(w) { return w.indexOf(q) === 0; });
    });
  }

  /* Encuentra el proveedor exacto si el valor escrito coincide suficientemente */
  function procFindExact(query) {
    var q = procNormalize(query);
    /* Coincidencia exacta */
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i] === q) return PROVIDERS[i];
    }
    /* Coincidencia 80%+: el query contiene todas las palabras significativas del proveedor */
    for (var j = 0; j < PROVIDERS.length; j++) {
      var words = PROVIDERS[j].split(' ').filter(function(w){ return w.length > 2; });
      if (words.length && words.every(function(w){ return q.indexOf(w) !== -1; })) {
        return PROVIDERS[j];
      }
    }
    return null;
  }


  /* ── 2c. MOTOR DE SUGESTÕES DE DESCRIÇÕES ── */
  /* Estrutura compacta: TIPOS base + MODIFICADORES → combinações dinâmicas
     Nível 1 – "ca"        → tipos que começam com CA
     Nível 2 – "calça "    → CALÇA + todos os modificadores
     Nível 3 – "calça li"  → CALÇA + modificadores que começam com LI
     Nível 4 – "calça linho r" → CALÇA LINHO + segundo modificador com R  */

  var DESC_TIPOS = [
    /* ── Português ── */
    'ALFINETE','BIQUÍNI','BLAZER','BLUSA','BLUSÃO','BODY','BOLERO',
    'BOTAS','BOTINS','BRINCOS','CACHECOL','CALÇA','CALÇAS','CALÇÃO',
    'CAMISA','CAMISEIRO','CAMISETA','CAMISOLA','CARDIGAN','CARTEIRA',
    'CASACO','CHAPÉU','CHINELOS','CINTO','CLUTCH','COLAR','COLETE',
    'CONJUNTO','CROP TOP','CUECA','DERBY','FATO','FATO DE BANHO',
    'JARDINEIRAS','KIMONO','LEGGING','LENÇO','LEOTARD','MACACO',
    'MACAQUINHO','MALA','MINI SAIA','MOCHILA','PANTUFA','PAREO',
    'PASHMINA','PIJAMA','PIRATA','POLO','PONCHO','PULSEIRA','REGATA',
    'SABRINAS','SAIA','SANDÁLIA','SAPATILHAS','SAPATO','SHOPPER',
    'SINGLET','SWEATSHIRT','T-SHIRT','TOP','TÚNICA','VESTIDO','FATO DE BANHO CRIANÇA','CUECA CRIANÇA','BIQUÍNI CRIANÇA',
    /* ── English ── */
    'BIKINI','BOOTS','COAT','DRESS','HOODIE','JACKET',
    'JEANS','JUMPSUIT','LEGGINGS','PANTS','ROMPER','SANDALS',
    'SCARF','SHIRT','SHOES','SHORTS','SKIRT','SNEAKERS',
    'SUIT','SWEATER','SWIMSUIT','TANK TOP','TRENCH COAT','VEST'
  ];

  var DESC_MODS = [
    /* ── Tecidos / Materiais ── */
    'ALGODÃO','BOMBAZINE','CAMBRAIA','CAMURÇA','CANELADO','CETIM',
    'CROCHET','ELASTICO','FELPA','FELTRO','FIO','GANGA','IMIT LINHO',
    'JEANS','LICRA','LINHO','LUREX','MALHA','METALIZADO','MOHAIR',
    'MUSSELINA','NAPA','NYLON','ORGANZA','OXFORD','PELO','POLIPELE',
    'POPELINE','SARJA','SEDA','STRASS','TECIDO','TULE','TWILL',
    'VELUDO','VOILE',
    /* ── Estampados / Padrões ── */
    'AFRICANO','ANIMAL','DEGRADÊ','ESTAMPADO','ÉTNICA',
    'FLORES','GEOMÉTRICO','LEOPARDO','LISO','PADRÃO',
    'PRINT','PRINT FLORES','PRINT LEOPARDO','RISCAS','TRACADO',
    'XADREZ','ZIG ZAG',
    /* ── Detalhes / Acabamentos ── */
    'ABERTO','APLICAÇÃO','ASSIMÉTRICA','BABADO','BALÃO','BARCA',
    'BICO','BICOLOR','BOLSO','BORDADO','BOTÃO','BRILHO','C/APLICAÇÃO',
    'C/BOTÃO','C/CINTO','C/FLORES','C/LANTEJOULAS','C/LAÇO','C/RENDA',
    'C/ZIP','CARGO','CAVA','CINTO','CLÁSSICO','COMPRIDA','COS',
    'CROPPED','CURTA','DESPORTIVO','DOURADO','DUPLO','ESPIGA',
    'FARRIPAS','FINO','FOLHO','FRANJAS','FRANZIDA','FRANZIDO',
    'FUROS','GOLA','HOMEM','LANTEJOULAS','LAÇO','LARGA','LAVAGEM',
    'M/COMPRIDA','M/CURTA','MANGA','MIDI','MISSANGA','NERVURA',
    'OVERSIZE','PENA','PÉROLAS','PLISSADA','PREGAS','PUNHO','RACHA',
    'RELEVO','RENDA','SLIM','TAXA','TRANSPARENTE','TRANÇA','TUBO',
    'ZIP',
    /* ── English modifiers ── */
    'ANIMAL PRINT','BASIC','BOHO','CLASSIC','DENIM','EMBROIDERED',
    'FLORAL','FLOWY','FRINGE','GRAPHIC','KNIT','LACE','LINEN',
    'LONG','LOOSE','MINI','OVERSIZED','PLAID','PLEATED','PRINTED',
    'RIBBED','SHORT','SLIM FIT','STRIPED','VELVET','WRAP',
    /* ── Público / faixa etária ── */
    'CRIANÇA','BEBÉ','INFANTIL','JÚNIOR','ADULTO'
  ];

  /* Tabelas normalizadas pré-calculadas (evita normalizar em cada keystroke) */
  var _DESC_TIPOS_N = DESC_TIPOS.map(function(t){ return procNormalizeDesc(t); });
  var _DESC_MODS_N  = DESC_MODS.map(function(m){ return procNormalizeDesc(m); });

  /* Índice de tipos ordenado por comprimento desc para matching guloso (ex: "FATO DE BANHO" antes de "FATO") */
  var _DESC_TIPOS_IDX = DESC_TIPOS
    .map(function(t,i){ return i; })
    .sort(function(a,b){ return _DESC_TIPOS_N[b].length - _DESC_TIPOS_N[a].length; });

  function procNormalizeDesc(s) {
    return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Corrección silenciosa: normaliza el input y busca la mejor coincidencia
     en DESC_TIPOS y DESC_MODS. Si la distancia de edición es <= 2 caracteres,
     reemplaza sin avisar al usuario. */
  function procSilentCorrectDesc(raw) {
    var parts = raw.trim().toUpperCase().split(/\s+/);
    var correctedParts = parts.map(function(part, idx) {
      var partN = procNormalizeDesc(part);
      /* Buscar en TIPOS (solo en primera palabra) o MODS */
      var candidates = idx === 0 ? DESC_TIPOS.concat(DESC_MODS) : DESC_MODS;
      var candidatesN = idx === 0 ? _DESC_TIPOS_N.concat(_DESC_MODS_N) : _DESC_MODS_N;
      var bestDist = 2; /* umbral máximo */
      var bestMatch = null;
      for (var i = 0; i < candidatesN.length; i++) {
        var cn = candidatesN[i];
        if (Math.abs(cn.length - partN.length) > 1) continue;
        var d = procLevenshtein(partN, cn);
        if (d < bestDist) { bestDist = d; bestMatch = candidates[i]; }
        if (d === 0) break; /* coincidencia exacta */
      }
      return (bestDist <= 1 && bestMatch) ? bestMatch : part;
    });
    var result = correctedParts.join(' ');
    return result !== raw.toUpperCase() ? result : null;
  }

  function procLevenshtein(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; }
    for (var j = 0; j <= n; j++) { dp[0][j] = j; }
    for (var i2 = 1; i2 <= m; i2++) {
      for (var j2 = 1; j2 <= n; j2++) {
        dp[i2][j2] = a[i2-1] === b[j2-1]
          ? dp[i2-1][j2-1]
          : 1 + Math.min(dp[i2-1][j2], dp[i2][j2-1], dp[i2-1][j2-1]);
      }
    }
    return dp[m][n];
  }

  function procFindDescMatches(raw) {
    if (!raw || raw.length < 1) return [];
    var q = procNormalizeDesc(raw.trim());

    /* ── Tentar encontrar TIPO já completo no início da query ── */
    var foundTipoIdx  = -1;
    var modQuery      = '';

    for (var si = 0; si < _DESC_TIPOS_IDX.length; si++) {
      var ti  = _DESC_TIPOS_IDX[si];
      var tn  = _DESC_TIPOS_N[ti];
      /* TIPO seguido de espaço → utilizador está a escrever modificador */
      if (q.indexOf(tn + ' ') === 0) {
        foundTipoIdx = ti;
        modQuery     = q.slice(tn.length + 1);
        break;
      }
      /* TIPO exato sem mais nada → sugerir modificadores sem filtro */
      if (q === tn) {
        foundTipoIdx = ti;
        modQuery     = '';
        break;
      }
    }

    if (foundTipoIdx >= 0) {
      var tipo = DESC_TIPOS[foundTipoIdx];

      /* ── Nível 3/4: TIPO já fixo — verificar se MOD1 também está completo ── */
      var foundModIdx = -1;
      var mod2Query   = '';
      for (var mi = 0; mi < _DESC_MODS_N.length; mi++) {
        var mn = _DESC_MODS_N[mi];
        if (modQuery.indexOf(mn + ' ') === 0) {
          foundModIdx = mi;
          mod2Query   = modQuery.slice(mn.length + 1);
          break;
        }
        if (modQuery === mn) {
          foundModIdx = mi;
          mod2Query   = '';
          break;
        }
      }

      if (foundModIdx >= 0) {
        /* Nível 4: TIPO + MOD1 fixos → sugerir segundo modificador */
        var mod1    = DESC_MODS[foundModIdx];
        var starts4 = [], cont4 = [];
        for (var k = 0; k < _DESC_MODS_N.length; k++) {
          if (k === foundModIdx) continue;
          if (!mod2Query || _DESC_MODS_N[k].indexOf(mod2Query) === 0) {
            starts4.push(tipo + ' ' + mod1 + ' ' + DESC_MODS[k]);
          } else if (mod2Query && _DESC_MODS_N[k].indexOf(mod2Query) !== -1) {
            cont4.push(tipo + ' ' + mod1 + ' ' + DESC_MODS[k]);
          }
        }
        /* Incluir a combinação só com MOD1 se não houver mod2 digitado */
        var results4 = !mod2Query ? [tipo + ' ' + mod1] : [];
        return results4.concat(starts4).concat(cont4).slice(0, 8);
      }

      /* Nível 2/3: TIPO fixo → filtrar modificadores */
      var mq      = modQuery;
      var starts3 = [], cont3 = [];
      for (var j = 0; j < _DESC_MODS_N.length; j++) {
        if (!mq || _DESC_MODS_N[j].indexOf(mq) === 0) {
          starts3.push(tipo + ' ' + DESC_MODS[j]);
        } else if (mq && _DESC_MODS_N[j].indexOf(mq) !== -1) {
          cont3.push(tipo + ' ' + DESC_MODS[j]);
        }
      }
      /* Incluir tipo sozinho no topo quando nada ainda digitado como mod */
      var results3 = (!mq ? [tipo] : []).concat(starts3).concat(cont3);
      return results3.slice(0, 8);
    }

    /* ── Nível 1: utilizador ainda a escrever o TIPO ── */
    var starts1 = [], cont1 = [];
    for (var ii = 0; ii < _DESC_TIPOS_N.length; ii++) {
      if (_DESC_TIPOS_N[ii].indexOf(q) === 0)        starts1.push(DESC_TIPOS[ii]);
      else if (_DESC_TIPOS_N[ii].indexOf(q) !== -1)  cont1.push(DESC_TIPOS[ii]);
    }
    return starts1.concat(cont1).slice(0, 8);
  }

  function procTableIsUnlocked(fid) {
    var pEl = document.getElementById('proc-proveedor-' + fid);
    var vEl = document.getElementById('proc-valorFactura-' + fid);
    var pVal = pEl ? pEl.value.trim() : '';
    var vVal = vEl ? parseFloat(vEl.value) : 0;
    return pVal.length > 0 && vVal > 0;
  }

  function procUpdateTableLock(fid) {
    var lock  = document.getElementById('proc-table-lock-' + fid);
    var block = document.getElementById('proc-table-block-' + fid);
    if (!lock || !block) return;
    var unlocked = procTableIsUnlocked(fid);
    lock.style.display  = unlocked ? 'none'  : 'flex';
    block.style.display = unlocked ? 'block' : 'none';
    if (unlocked) procInitTableKeyboard(fid);
  }

  function procInitProviderInput(fid) {
    var input = document.getElementById('proc-proveedor-' + fid);
    var sugg  = document.getElementById('proc-forn-sugg-' + fid);
    if (!input || !sugg) return;

    input.addEventListener('input', function() {
      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
      var q = input.value.trim();
      if (!q) { sugg.classList.add('hidden'); return; }
      var matches = procFindMatches(q);
      if (!matches.length) { sugg.classList.add('hidden'); return; }
      sugg.innerHTML = matches.map(function(p) {
        return '<div class="proc-forn-item" data-val="' + p + '">' + p + '</div>';
      }).join('');
      sugg.classList.remove('hidden');
    });

    input.addEventListener('blur', function() {
      setTimeout(function() {
        sugg.classList.add('hidden');
        /* Corrección automática si hay coincidencia suficiente */
        var exact = procFindExact(input.value);
        if (exact && procNormalize(input.value) !== exact) {
          input.value = exact;
          procUpdateBannerProvider(fid);
          procUpdateTableLock(fid);
        }
      }, 180);
    });

    sugg.addEventListener('mousedown', function(e) {
      var item = e.target.closest('.proc-forn-item');
      if (!item) return;
      input.value = item.dataset.val;
      sugg.classList.add('hidden');
      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
    });
  }

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

  /* Returns all keys for the current week (e.g. proc_fatura_2026-03-24, proc_fatura_2026-03-24_2, ...) */
  function getWeekKeys() {
    var monday = getMondayISO();
    var base   = SESSION_PREFIX + monday;
    var all    = getAllSessionKeys();
    return all.filter(function(k) { return k === base || k.indexOf(base + '_') === 0; });
  }

  /* Primary key for new saves this week (slot 1) */
  function getSessionKey() { return SESSION_PREFIX + getMondayISO(); }

  /* Next available key for this week */
  function getNextWeekKey() {
    var base  = SESSION_PREFIX + getMondayISO();
    var taken = getWeekKeys();
    if (!taken.length) return base;
    /* find highest suffix */
    var max = 1;
    taken.forEach(function(k) {
      if (k === base) { if (max < 1) max = 1; return; }
      var n = parseInt(k.replace(base + '_', ''), 10);
      if (!isNaN(n) && n >= max) max = n + 1;
    });
    if (taken.indexOf(base) === -1) return base;
    return base + '_' + max;
  }

  /* Current active save key (set when a session is loaded or a new one starts) */
  var _activeSessionKey = null;

  function labelFromKey(key) {
    var stripped = key.replace(SESSION_PREFIX, '');
    /* detect suffix like _2, _3 */
    var suffix = '';
    var match  = stripped.match(/_(\d+)$/);
    if (match) {
      suffix  = ' (' + match[1] + ')';
      stripped = stripped.replace(/_\d+$/, '');
    }
    var p = stripped.split('-');
    return 'Semana ' + p[2] + '/' + p[1] + '/' + p[0] + suffix;
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

  /* ── GENERIC FLOATING MODAL HELPER ── */
  function procFloatModal(opts) {
    /* opts: { title, body, buttons: [{label, style, cb}] } */
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.38);backdrop-filter:blur(3px);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:16px;padding:28px 28px 20px;max-width:440px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:\'MontserratLight\',sans-serif;';

    var html = '';
    if (opts.label) html += '<div style="font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;opacity:.45;margin-bottom:10px">' + opts.label + '</div>';
    if (opts.title) html += '<div style="font-size:1rem;font-weight:700;color:#000;margin-bottom:8px;line-height:1.3">' + opts.title + '</div>';
    if (opts.body)  html += '<div style="font-size:.85rem;font-weight:600;color:#000;opacity:.75;margin-bottom:20px;line-height:1.6">' + opts.body + '</div>';
    panel.innerHTML = html;

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

    opts.buttons.forEach(function(b) {
      var btn = document.createElement('button');
      var base = 'display:block;width:100%;padding:11px 16px;margin-bottom:8px;text-align:left;font-size:.88rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s;';
      btn.style.cssText = base + (b.style || 'background:#fff;border:1px solid #9DB6C9;color:#000;');
      btn.innerHTML = b.label;
      btn.onmouseenter = function(){ btn.style.filter='brightness(0.95)'; };
      btn.onmouseleave = function(){ btn.style.filter=''; };
      btn.onclick = function(){ close(); if (b.cb) b.cb(); };
      panel.appendChild(btn);
    });

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return { close: close };
  }

  function procBuildSavePayload() {
    if (!activeFaturas.length) return null;
    return {
      savedAt: new Date().toISOString(),
      /* sentRefs incluído aqui para que chegue ao Supabase e sobreviva
         a um reload desde remoto. _procSentRefs pode estar vazio ({})
         no início da sessão — isso é correcto. */
      sentRefs: _procSentRefs || {},
      faturas: activeFaturas.map(function(fid) {
        var rows = procCollectRows(fid).map(function(r) {
          return { ref:r.ref, desc:r.desc, qtdFt:r.qtdFt, a4:r.a4, a5:r.a5,
                   preco:r.preco, descPct:r.descPct, hasD:r.hasD, plus1:r.plus1, obs:r.obs, flagged:r.flagged, pvpManual:r.pvpManual };
        });
        return {
          proveedor:    (document.getElementById('proc-proveedor-'    + fid) || {}).value || '',
          valorFactura: (document.getElementById('proc-valorFactura-' + fid) || {}).value || '',
          rows: rows
        };
      })
    };
  }

    /* ── 4. SAVE / LOAD ── */
  var _procSaveDebounce = null;

  function procSaveSession(manual) {
    if (!_isSynced) {
      if (manual) procSetSyncStatus('syncing', 'a sincronizar…');
      return;
    }
    var key = _activeSessionKey || getSessionKey();
    _activeSessionKey = key;
    var payload = procBuildSavePayload();
    if (!payload) return;

    /* Always save to localStorage as offline fallback */
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch(e) {}
    if (manual) procSetSyncStatus('syncing', 'a guardar…');

    /* Debounce remote saves */
    clearTimeout(_procSaveDebounce);
    _procSaveDebounce = setTimeout(function() {
      procSbFetch('proc_sessoes', {
        method: 'POST',
        headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ session_key: key, dados: JSON.stringify(payload), updated_at: payload.savedAt })
      }).then(function(r) {
        if (r.ok) { procSetSyncStatus('ok', 'guardado'); }
        else { r.text().then(function(t) { console.error('PROC save error', t); procSetSyncStatus('error', 'erro ao guardar remotamente'); }); }
      }).catch(function() { procSetSyncStatus('offline', 'offline — guardado localmente'); });
    }, manual ? 0 : 800);
  }

  function procShowSaveStatus(msg) { procSetSyncStatus('ok', msg); }

  function procApplySessionData(key, raw, callback) {
    var data;
    try { data = JSON.parse(raw); } catch(e) {
      procFloatModal({ title: 'Erro ao interpretar sess\u00e3o.', buttons: [{ label: 'OK', cb: null }] });
      return;
    }
    var cont = document.getElementById('proc-faturasContainer');
    if (cont) cont.innerHTML = '';
    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
    _activeSessionKey = key;
    var faturas = data.faturas || [];
    if (!faturas.length) { procAddFatura(null); }
    else faturas.forEach(function(fd) { procAddFatura(fd); });
    /* Snapshot inicial para que o primeiro Ctrl+Z restaure este estado */
    setTimeout(procUndoSnapshot, 100);
    if (callback) callback();
  }

  function procLoadSession(key) {
    procSetSyncStatus('syncing', 'a carregar…');
    procCloseSessionMenu();
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', 'sess\u00e3o carregada');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'carregado localmente');
        });
      });
  }

  /* ── 4a-bis. FORCE REMOTE LOAD (ignores localStorage cache) ── */
  function procForceLoadSession(key) {
    procSetSyncStatus('syncing', 'a actualizar\u2026');
    procCloseSessionMenu();
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : null;
        if (!raw) {
          raw = localStorage.getItem(key);
          if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
          procApplySessionData(key, raw, function() {
            procMarkSynced();
            procShowMainArea(key);
            procSetSyncStatus('offline', 'sem dados remotos \u2014 carregado localmente');
          });
          return;
        }
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', '\u2713 actualizado e carregado');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'offline \u2014 carregado localmente');
        });
      });
  }

  function procDeleteSession(key) {
    procFloatModal({
      label: 'Eliminar sess\u00e3o',
      title: 'Tens a certeza?',
      body: 'Vais eliminar <strong>' + labelFromKey(key) + '</strong>. Esta a\u00e7\u00e3o \u00e9 irrevers\u00edvel.',
      buttons: [
        { label: '\u274c Eliminar definitivamente',
          style: 'background:#F5EAEA;border:1px solid #e8c5c5;color:#9B4D4D;font-weight:700;',
          cb: function() {
            procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key), { method: 'DELETE' }).catch(function(){});
            try { localStorage.removeItem(key); } catch(e) {}
            if (_activeSessionKey === key) _activeSessionKey = null;
            procRenderSessionMenu();
          }
        },
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #9DB6C9;color:#000;', cb: null }
      ]
    });
  }

  /* ── 4b. REMOTE KEY SYNC ── */
  function procLoadRemoteKeys(callback) {
    procSbFetch('proc_sessoes?select=session_key,updated_at&order=updated_at.desc', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        if (rows && rows.length) {
          rows.forEach(function(row) {
            if (!localStorage.getItem(row.session_key)) {
              try { localStorage.setItem(row.session_key, JSON.stringify({ savedAt: row.updated_at, faturas: [] })); } catch(e) {}
            }
          });
        }
        if (callback) callback();
      })
      .catch(function() { if (callback) callback(); });
  }

  /* ── 4c. SESSION PICKER MODAL ── */
  function procShowSessionPicker() {
    var overlay = document.createElement('div');
    overlay.id = 'proc-session-picker';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:18px;width:min(460px,94vw);max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 72px rgba(0,0,0,.22);font-family:\'MontserratLight\',sans-serif;overflow:hidden;';

    panel.innerHTML =
      '<div style="padding:22px 24px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0;">'
      + '<div style="font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:6px;">PROCESSAMENTO DE FATURAS</div>'
      + '<div style="font-size:1.05rem;font-weight:700;color:#000;line-height:1.3;">Continua uma sess&#227;o ou inicia uma nova</div>'
      + '<div style="font-size:.78rem;font-weight:600;color:#555;margin-top:6px;line-height:1.5;">Para evitar sobreescrever dados existentes, escolhe sempre a sess&#227;o correcta antes de come&#231;ar.</div>'
      + '</div>'
      + '<div id="proc-picker-body" style="padding:16px 24px 22px;overflow-y:auto;flex:1;">'
      + '<div style="text-align:center;padding:28px 0;color:#000;font-size:.85rem;font-weight:700;opacity:.45;">&#8635; a carregar sess&#245;es&#8230;</div>'
      + '</div>';

    overlay.appendChild(panel);
    /* Not dismissable — user must make a choice */
    document.body.appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    var BTN_BASE = 'display:block;width:100%;padding:13px 16px;margin-bottom:8px;text-align:left;'
      + 'font-size:.88rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;'
      + 'border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s,filter .12s;'
      + 'border:1px solid #9DB6C9;background:#fff;color:#000;line-height:1.5;';

    function hoverOn(b)  { b.style.filter = 'brightness(0.95)'; }
    function hoverOff(b) { b.style.filter = ''; }

    function sessionMeta(key) {
      var label = labelFromKey(key);
      var dateStr = '';
      var nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          dateStr = dt.toLocaleDateString('pt-PT') + ' \u00b7 ' + dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        }
        if (d && d.faturas) nFat = d.faturas.length + ' fat.';
      } catch(e) {}
      return { label: label, dateStr: dateStr, nFat: nFat };
    }

    function makeBtn(style, html) {
      var btn = document.createElement('button');
      btn.style.cssText = BTN_BASE + (style || '');
      btn.innerHTML = html;
      btn.addEventListener('mouseenter', function(){ hoverOn(btn); });
      btn.addEventListener('mouseleave', function(){ hoverOff(btn); });
      return btn;
    }

    function metaLine(m) {
      if (!m.dateStr && !m.nFat) return '';
      return '<br><span style="font-size:.68rem;font-weight:600;opacity:.6;">' + [m.dateStr, m.nFat].filter(Boolean).join(' \u00b7 ') + '</span>';
    }

    function loadKeyRemote(key, onDone) {
      procSetSyncStatus('syncing', 'a carregar\u2026');
      procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
        .then(function(r) { return r.json(); })
        .then(function(rows) {
          var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : localStorage.getItem(key);
          if (!raw) { onDone(null); return; }
          try { localStorage.setItem(key, raw); } catch(e) {}
          onDone(raw);
        })
        .catch(function() { onDone(localStorage.getItem(key)); });
    }

    function renderPicker(allKeys) {
      var bodyEl = document.getElementById('proc-picker-body');
      if (!bodyEl) return;
      bodyEl.innerHTML = '';

      /* ── Latest session ── */
      if (allKeys.length > 0) {
        var latestKey = allKeys[0];
        var lm = sessionMeta(latestKey);

        var section1 = document.createElement('div');
        section1.style.cssText = 'margin-bottom:18px;';
        section1.innerHTML = '<div style="font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:8px;">\u00daltima sess\u00e3o</div>';

        var lastBtn = makeBtn(
          'border-color:#5F7B94;background:transparent;color:#5F7B94;',
          '\u21a9 Continuar \u2014 ' + lm.label + metaLine(lm)
        );
        lastBtn.addEventListener('click', function() {
          close();
          loadKeyRemote(latestKey, function(raw) {
            if (!raw) { procMarkSynced(); procAddFatura(null); procSetSyncStatus('ok', 'nova sess\u00e3o'); return; }
            procApplySessionData(latestKey, raw, function() {
              procMarkSynced();
              procSetSyncStatus('ok', 'sess\u00e3o carregada');
            });
          });
        });
        section1.appendChild(lastBtn);
        bodyEl.appendChild(section1);

        /* ── Older sessions ── */
        var olderKeys = allKeys.slice(1);
        if (olderKeys.length) {
          var section2 = document.createElement('div');
          section2.style.cssText = 'margin-bottom:18px;';
          section2.innerHTML = '<div style="font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:8px;">Sess\u00f5es anteriores</div>';
          olderKeys.forEach(function(key) {
            var om = sessionMeta(key);
            var oldBtn = makeBtn('', om.label + metaLine(om));
            oldBtn.addEventListener('click', function() {
              close();
              procLoadSession(key);
            });
            section2.appendChild(oldBtn);
          });
          bodyEl.appendChild(section2);
        }
      }

      /* ── New session ── */
      var section3 = document.createElement('div');
      section3.style.cssText = allKeys.length ? 'border-top:1px solid #f0f0f0;padding-top:18px;' : '';
      section3.innerHTML = '<div style="font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:8px;">Come\u00e7ar do zero</div>';

      var newBtn = makeBtn('', '\u2605 Iniciar nova sess\u00e3o');
      newBtn.addEventListener('click', function() {
        close();
        _activeSessionKey = getNextWeekKey();
        procMarkSynced();
        procAddFatura(null);
        procSetSyncStatus('ok', 'nova sess\u00e3o');
      });
      section3.appendChild(newBtn);
      bodyEl.appendChild(section3);
    }

    /* Fetch remote keys, then render */
    procLoadRemoteKeys(function() {
      renderPicker(getAllSessionKeys());
    });
  }

  function procLoadSessionSilent(key, callback) {
    var raw = localStorage.getItem(key);
    if (!raw) { if (callback) callback(); return; }
    procApplySessionData(key, raw, callback);
  }

  /* ── 5. SESSION DROPDOWN ── */
  function procToggleSessionMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('proc-sessionMenuDropdown');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
      procRenderSessionMenu();
      menu.classList.remove('hidden');
      /* Position dropdown relative to the trigger button using fixed coords */
      var btn = e && e.currentTarget ? e.currentTarget : (e && e.target ? e.target : null);
      if (btn) {
        var rect = btn.getBoundingClientRect();
        menu.style.top   = (rect.bottom + 6) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.left  = 'auto';
      }
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
    var cur  = _activeSessionKey || getSessionKey();
    if (!keys.length) {
      menu.innerHTML = '<div class="proc-session-menu-empty">Nenhuma sess\u00e3o guardada</div>';
      return;
    }
    menu.innerHTML = keys.map(function(key) {
      var savedAt = '';
      var nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          savedAt = dt.toLocaleDateString('pt-PT') + ' ' + dt.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
        }
        if (d && d.faturas) nFat = ' · ' + d.faturas.length + ' fat.';
      } catch(e) {}
      var isCur  = key === cur;
      var badge  = isCur ? ' <span class="proc-session-current-badge">ativa</span>' : '';
      var curCls = isCur ? ' current' : '';
      return '<div class="proc-session-menu-item' + curCls + '" onclick="event.stopPropagation()">'
        + '<div class="proc-session-menu-item-info">'
        + '<span class="proc-session-menu-item-label">' + labelFromKey(key) + badge + '</span>'
        + (savedAt ? '<span class="proc-session-menu-item-date">' + savedAt + nFat + '</span>' : '')
        + '</div>'
        + '<div class="proc-session-menu-item-actions">'
        + '<button class="proc-session-load-btn" onclick="procForceLoadSession(\'' + key + '\')">&#8635; carregar</button>'
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

    /* Init autocomplete + lock */
    procInitProviderInput(fid);
    procUpdateTableLock(fid);

    /* ── Onboarding invisível (uma única vez) ── */
    if (!data && fid === 1) {
      setTimeout(function() { procShowOnboardingTooltip(fid); }, 600);
    }

    var dataRows = (data && data.rows) ? data.rows : [];
    var nRows    = Math.max(dataRows.length + 1, 2);
    procAddRows(fid, nRows);

    if (data) {
      var pEl = document.getElementById('proc-proveedor-'    + fid);
      var vEl = document.getElementById('proc-valorFactura-' + fid);
      if (pEl) pEl.value = data.proveedor    || '';
      if (vEl) vEl.value = data.valorFactura || '';
      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
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
        if (nums[4]) nums[4].value   = (row.descPct != null && row.descPct !== 0) ? row.descPct : '';
        if (dCb)     dCb.checked     = !!row.hasD;
        if (pCb)     pCb.checked     = !!row.plus1;
        if (oIn) {
          oIn.value = row.obs || '';
          procObsSync(oIn);
        }
        if (row.flagged) {
          var flagBtn = document.getElementById('proc-flag-' + fid + '-' + rid);
          var flagTr  = document.getElementById('proc-row-'  + fid + '-' + rid);
          if (flagBtn) flagBtn.classList.add('flagged');
          if (flagTr)  flagTr.classList.add('proc-row-flagged');
        }
        procRecalcRow(fid, rid);
        /* Restore manual PVP override after recalc */
        if (row.pvpManual != null && !isNaN(row.pvpManual)) {
          var pvpElR  = document.getElementById('proc-pvp-' + fid + '-' + rid);
          if (pvpElR) {
            pvpElR._manualOverride = true;
            var dispR   = pvpElR.querySelector('.proc-pvp-display');
            var copyBR  = pvpElR.querySelector('.proc-pvp-copy-btn');
            if (dispR)  dispR.textContent = parseFloat(row.pvpManual).toFixed(2);
            if (copyBR) copyBR.style.display = 'inline-flex';
            pvpElR.className = 'proc-cell-computed has-val';
          }
        }
      });
      procUpdateHeader(fid);
      procSyncRefColWidth(fid);
      procSyncDescColWidth(fid);
      procSyncObsColWidth(fid);
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
      +   '<div class="proc-field-group">'
      +     '<div class="proc-field-label">Fornecedor</div>'
      +     '<div class="proc-forn-wrap">'
      +       '<input type="text" id="proc-proveedor-' + fid + '" placeholder="Nome do fornecedor\u2026" autocomplete="off">'
      +       '<div id="proc-forn-sugg-' + fid + '" class="proc-forn-suggestions hidden"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="proc-field-group"><div class="proc-field-label">Valor Fatura s/IVA (\u20ac)</div>'
      +     '<input type="number" id="proc-valorFactura-' + fid + '" placeholder="0.00" step="0.01" oninput="procUpdateHeader(' + fid + ');procUpdateTableLock(' + fid + ')"></div>'
      +   '<div class="proc-field-group"><div class="proc-field-label">Total Calculado (\u20ac)</div>'
      +     '<div class="proc-total-box"><div class="proc-field-label" style="font-size:.6rem">soma das linhas <button class="proc-audit-btn" id="proc-audit-btn-' + fid + '" style="display:none" onclick="procShowAuditPanel(' + fid + ')">&#128269; rever</button></div>'
      +     '<div class="proc-amount" id="proc-totalCalc-' + fid + '">0.00</div></div></div>'
      + '</div>'
      /* Lock message */
      + '<div class="proc-table-lock" id="proc-table-lock-' + fid + '">'
      +   '<span>\u26a0\ufe0f</span>'
      +   '<span>Para come\u00e7ar a preencher a tabela, introduz primeiro o <strong>nome do fornecedor</strong> e o <strong>valor da fatura sem IVA</strong>.</span>'
      + '</div>'
      /* Table (hidden until unlocked) */
      + '<div id="proc-table-block-' + fid + '" style="display:none">'
      +   '<div class="proc-table-block"><div class="proc-table-wrap"><table id="proc-mainTable-' + fid + '">'
      +   '<thead><tr>'
      +   '<th class="left">Refer\u00eancia</th>'
      +   '<th class="left">Descri\u00e7\u00e3o</th>'
      +   '<th>QTD.</th>'
      +   '<th class="th-a4" title="Atribuir toda a quantidade a Funchal"><button class="proc-fill-all-btn" onclick="procFillAll(' + fid + ',\'fnc\')">FNC</button></th>'
      +   '<th class="th-a5" title="Atribuir toda a quantidade a Porto Santo"><button class="proc-fill-all-btn" onclick="procFillAll(' + fid + ',\'pxo\')">PXO</button></th>'
      +   '<th title="Dividir Qtd. FT igualmente">\u00f7</th>'
      +   '<th>€</th>'
      +   '<th>%-</th>'
      +   '<th>!</th>'
      +   '<th>D / +1\u20ac</th>'
      +   '<th>pvp</th>'
      +   '<th>Margem</th>'
      +   '<th class="left">OBS</th>'
      +   '<th title="Assinalar linha">&#9873;</th>'
      +   '</tr></thead>'
      +   '<tbody id="proc-tableBody-' + fid + '"></tbody>'
      +   '</table></div></div>'
      +   '<div class="proc-table-footer">'
      +     '<div class="proc-summary-line">'
      +       '<span>Linhas: <strong id="proc-lineCount-' + fid + '">0</strong></span>'
      +       '<span>Pe\u00e7as totais: <strong id="proc-totalPiezas-' + fid + '">0</strong></span>'
      +       '<span>Diferen\u00e7a: <span id="proc-diffChip-' + fid + '" class="proc-diff-chip zero">\u00b1 0.00 \u20ac</span></span>'
      +     '</div>'
      +     '<div class="proc-footer-actions">'
      +       '<button class="proc-btn primary" onclick="procShowStockModal(' + fid + ')">\ud83d\udce6 ingresso de stock</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function procRemoveFatura(fid) {
    if (activeFaturas.length <= 1) return;
    procUndoSnapshot(); /* snapshot antes de remover */
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
    /* Delegate OBS input once per tbody */
    /* ── Desc autocomplete delegation (once per tbody) ── */
    if (!tbody._descListening) {
      tbody._descListening = true;

      /* Global suggestions element — lives on body, escapes all stacking contexts */
      if (!document.getElementById('proc-desc-global-sugg')) {
        var gSugg = document.createElement('div');
        gSugg.id  = 'proc-desc-global-sugg';
        document.body.appendChild(gSugg);
        gSugg.addEventListener('mousedown', function(e) {
          var item = e.target && e.target.classList.contains('proc-desc-item') ? e.target : null;
          if (!item) return;
          e.preventDefault();
          var sg = document.getElementById('proc-desc-global-sugg');
          if (sg._activeInput) {
            sg._activeInput.value = item.textContent;
            sg._activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          sg.style.display = 'none';
        });
      }

      tbody.addEventListener('input', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        var inp = e.target;
        var sg  = document.getElementById('proc-desc-global-sugg');
        var q   = inp.value.trim().toUpperCase().replace(/\s+/g,' ');
        if (!q || q.length < 2) { sg.style.display = 'none'; return; }
        var matches = procFindDescMatches(q);
        if (!matches.length) { sg.style.display = 'none'; return; }
        sg.innerHTML = matches.map(function(m) {
          return '<div class="proc-desc-item">' + m + '</div>';
        }).join('');
        var rect = inp.getBoundingClientRect();
        sg.style.top    = (rect.bottom + 2) + 'px';
        sg.style.left   = rect.left + 'px';
        sg.style.width  = Math.max(rect.width, 220) + 'px';
        sg.style.display = 'block';
        sg._activeInput  = inp;
      });

      tbody.addEventListener('focusout', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        setTimeout(function() {
          var sg = document.getElementById('proc-desc-global-sugg');
          if (sg) { sg.style.display = 'none'; sg._activeInput = null; }
          var inp = e.target;
          var raw = inp.value.trim();
          if (!raw) return;
          var rawUpper = raw.toUpperCase();
          /* Se o utilizador rejeitou esta palavra antes, não volta a corrigir */
          if (inp._userRejectedValues && inp._userRejectedValues[rawUpper]) return;
          var corrected = procSilentCorrectDesc(raw);
          if (corrected && corrected !== raw) {
            /* Guarda o valor original que o sistema vai substituir,
               para que se o utilizador o voltar a escrever, não seja corrigido novamente */
            inp._lastAutoCorrectFrom = rawUpper;
            inp.value = corrected;
          }
        }, 180);
      });

      /* Detecta quando o utilizador reescreve uma palavra que foi autocorrigida → rejeição */
      tbody.addEventListener('keydown', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        var inp = e.target;
        /* Se o utilizador apaga para corrigir a autocorreção, registar rejeição */
        if ((e.key === 'Backspace' || e.key === 'Delete') && inp._lastAutoCorrectFrom) {
          if (!inp._userRejectedValues) inp._userRejectedValues = {};
          inp._userRejectedValues[inp._lastAutoCorrectFrom] = true;
          inp._lastAutoCorrectFrom = null;
        }
      });
    }
    if (!tbody._obsListening) {
      tbody._obsListening = true;
      tbody.addEventListener('input', function(e) {
        if (e.target && e.target.classList.contains('proc-obs-input')) {
          procObsSync(e.target);
        }
      });
    }
    for (var i = 0; i < n; i++) {
      rowCounts[fid]++;
      var id = rowCounts[fid];
      var f  = fid;
      var r  = id;
      var tr = document.createElement('tr');
      tr.id  = 'proc-row-' + f + '-' + r;
      tr.innerHTML =
          '<td class="td-ref">'
        + '<div class="proc-ref-wrap">'
        + '<button class="proc-copy-btn" title="Copiar refer\u00eancia" onclick="procCopyBtn(this)">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>'
        + '<input type="text" class="proc-ref-input"'
        + ' oninput="var s=this.selectionStart,e=this.selectionEnd;this.value=this.value.toUpperCase();this.setSelectionRange(s,e);procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '</div></td>'
        + '<td class="td-desc">'
        + '<div class="proc-desc-wrap">'
        + '<button class="proc-copy-btn" title="Copiar descri\u00e7\u00e3o" onclick="procCopyBtn(this)">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>'
        + '<input type="text" class="proc-desc-input" size="15"'
        + ' oninput="var s=this.selectionStart,e=this.selectionEnd;this.value=this.value.toUpperCase();this.setSelectionRange(s,e);procCheckAutoExpand(' + f + ',' + r + ')">'
        + '</div></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td class="center-col"><button class="proc-split-btn" onclick="procAutoSplit(' + f + ',' + r + ')"'
        + ' title="Dividir Qtd. FT entre Funchal e Porto Santo">\u00f7</button></td>'
        + '<td><input type="number" min="0" step="0.01" class="proc-preco-input"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" max="100" step="0.1" class="proc-desc-pct-input"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,4)"></td>'
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
        + '<td class="proc-cell-computed" id="proc-pvp-'   + f + '-' + r + '" style="padding:2px 4px;text-align:center;">'
        + '<div class="proc-pvp-wrap">'
        + '<button class="proc-copy-btn proc-pvp-copy-btn" title="Copiar PVP" style="display:none" onclick="procCopyPVP(this,\'' + f + '\',\'' + r + '\')">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>'
        + '<span class="proc-pvp-display">\u2014</span>'
        + '<input type="number" class="proc-pvp-edit-input" step="0.01" min="0" placeholder="0.00"'
        + ' onblur="procPVPEditBlur(this,\'' + f + '\',\'' + r + '\')"'
        + ' oninput="procPVPEditInput(this,\'' + f + '\',\'' + r + '\')"'
        + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
        + '<button class="proc-pvp-edit-btn" title="Editar PVP" onclick="procPVPToggleEdit(this,\'' + f + '\',\'' + r + '\')">'
        + '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + '</button>'
        + '</div>'
        + '</td>'
        + '<td class="proc-cell-computed" id="proc-marg-'  + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-obs-cell">'
        +   '<input type="text" class="proc-obs-input" size="7" id="proc-obs-' + f + '-' + r + '">'
        +   '<div class="proc-obs-tip" id="proc-obs-tip-' + f + '-' + r + '"></div>'
        + '</td>'
        + '<td style="text-align:center;padding:2px 4px;">'
        +   '<button class="proc-flag-btn" id="proc-flag-' + f + '-' + r + '" title="Assinalar linha" onclick="procToggleFlag(' + f + ',' + r + ')">'
        +   '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3v18M4 3h12l-3 5 3 5H4"/></svg>'
        +   '</button>'
        + '</td>';
      tbody.appendChild(tr);
    }
    procUpdateSummary(fid);
  }

  function procCheckAutoExpand(fid, id) {
    if (id === rowCounts[fid]) procAddRows(fid, 1);
    procSyncRefColWidth(fid);
    procSyncDescColWidth(fid);
    procSyncObsColWidth(fid);
  }

  /* Measure the longest ref value in this fatura and set all ref inputs
     to that same character-width so the column is always content-driven */
  function procSyncRefColWidth(fid) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var inputs = tbody.querySelectorAll('input.proc-ref-input');
    var maxLen = 6; /* minimum fallback chars */
    inputs.forEach(function(inp) {
      var len = inp.value ? inp.value.length : 0;
      if (len > maxLen) maxLen = len;
    });
    /* size attribute drives input width in ch units — add 1 for cursor */
    inputs.forEach(function(inp) {
      inp.setAttribute('size', maxLen + 1);
    });
    /* Also size the header th to match */
    var table = document.getElementById('proc-mainTable-' + fid);
    if (table) {
      var th = table.querySelector('thead th.left:first-child');
      if (th) th.style.minWidth = '';
    }
  }

  function procSyncDescColWidth(fid) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var inputs = tbody.querySelectorAll('input.proc-desc-input');
    var maxLen = 14; /* minimum fallback chars */
    inputs.forEach(function(inp) {
      var len = inp.value ? inp.value.length : 0;
      if (len > maxLen) maxLen = len;
    });
    inputs.forEach(function(inp) {
      inp.setAttribute('size', maxLen + 1);
    });
  }

  function procSyncObsColWidth(fid) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var inputs = tbody.querySelectorAll('input.proc-obs-input');
    var maxLen = 6; /* minimum fallback chars */
    inputs.forEach(function(inp) {
      var len = inp.value ? inp.value.length : 0;
      if (len > maxLen) maxLen = len;
    });
    inputs.forEach(function(inp) {
      inp.setAttribute('size', maxLen + 1);
    });
  }


  function procAutoSplit(fid, id) {
    var tr = document.getElementById('proc-row-' + fid + '-' + id);
    if (!tr) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    var qtdFt  = parseInt(inputs[0].value) || 0;
    if (!qtdFt) return;

    function applySplit(a4, a5) {
      inputs[1].value = a4;
      inputs[2].value = a5;
      var btn = tr.querySelector('.proc-split-btn');
      if (btn) { btn.classList.add('active'); setTimeout(function() { btn.classList.remove('active'); }, 800); }
      procRecalcRow(fid, id);
      procCheckAutoExpand(fid, id);
    }

    if (qtdFt % 2 === 0) {
      /* Par — divide directamente */
      applySplit(qtdFt / 2, qtdFt / 2);
      return;
    }

    /* Ímpar — modal elegante */
    var half = Math.floor(qtdFt / 2);
    var ref  = (tr.querySelector('.proc-ref-input') || {}).value || '';
    var fF   = Math.ceil(qtdFt / 2);  /* Funchal com extra */
    var fPS  = Math.ceil(qtdFt / 2);  /* Porto Santo com extra */

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:16px;padding:28px 28px 22px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.18);font-family:\'MontserratLight\',sans-serif;';

    var label = '<div style="font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;opacity:.5;margin-bottom:10px">PE\u00c7A \u00cdMPAR \u2014 1 DE 1</div>';
    var refLine = ref ? '<div style="font-size:.95rem;font-weight:700;color:#000;margin-bottom:4px">Refer\u00eancia ' + ref + '</div>' : '';
    var info = '<div style="font-size:.85rem;font-weight:600;color:#000;margin-bottom:4px">Total: ' + qtdFt + ' pe\u00e7as &nbsp;\u00b7&nbsp; Funchal: ' + half + ' &nbsp;\u00b7&nbsp; Porto Santo: ' + half + '</div>';
    var question = '<div style="font-size:.88rem;font-weight:700;color:#000;margin-bottom:18px;">Sobra 1 pe\u00e7a. Para onde vai?</div>';

    function btn(text, cb) {
      var b = document.createElement('button');
      b.style.cssText = 'display:block;width:100%;padding:11px 16px;margin-bottom:8px;text-align:left;font-size:.88rem;font-weight:600;font-family:\'MontserratLight\',sans-serif;background:#fff;border:1px solid #9DB6C9;border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s;color:#000;';
      b.innerHTML = text;
      b.onmouseenter = function(){ b.style.background='#E8EFF4'; b.style.borderColor='#9DB6C9'; };
      b.onmouseleave = function(){ b.style.background='#fff'; b.style.borderColor='#e0e0e0'; };
      b.onclick = function(){ document.body.removeChild(overlay); cb(); };
      return b;
    }

    panel.innerHTML = label + refLine + info + question;
    panel.appendChild(btn('\u2192 Funchal (' + (half+1) + 'F / ' + half + 'PS)', function(){ applySplit(half+1, half); }));
    panel.appendChild(btn('\u2192 Porto Santo (' + half + 'F / ' + (half+1) + 'PS)', function(){ applySplit(half, half+1); }));
    panel.appendChild(btn('deixar pendente', function(){ /* não aplica split */ }));

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e){ if(e.target===overlay){ document.body.removeChild(overlay); } });
    document.body.appendChild(overlay);
  }

  /* ── 8a-bis. FILL ALL → FNC or PXO ── */
  /* Al hacer clic en el encabezado FNC o PXO, copia la cantidad total de cada
     fila al almacén correspondiente y pone 0 en el otro.
     Solo actúa en filas que tengan QTD > 0. */
  function procFillAll(fid, target) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    var affected = 0;
    for (var i = 0; i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input[type="number"]');
      /* inputs[0] = QTD FT, inputs[1] = FNC, inputs[2] = PXO */
      if (!inputs || inputs.length < 3) continue;
      var qtd = parseInt(inputs[0].value) || 0;
      if (!qtd) continue;
      if (target === 'fnc') {
        inputs[1].value = qtd;
        inputs[2].value = 0;
      } else {
        inputs[1].value = 0;
        inputs[2].value = qtd;
      }
      var rowId = parseInt(rows[i].id.replace('proc-row-' + fid + '-', ''));
      if (!isNaN(rowId)) procRecalcRow(fid, rowId);
      affected++;
    }
    if (!affected) return;
    /* Flash visual no botão clicado */
    var thClass = target === 'fnc' ? 'th-a4' : 'th-a5';
    var table = document.getElementById('proc-mainTable-' + fid);
    if (table) {
      var th = table.querySelector('thead th.' + thClass + ' .proc-fill-all-btn');
      if (th) {
        th.classList.add('flashed');
        setTimeout(function() { th.classList.remove('flashed'); }, 700);
      }
    }
    procUpdateSummary(fid);
    procSaveSession(false);
  }

  /* ── 8b. EXCEL-LIKE KEYBOARD NAVIGATION ── */
  function procGetAllInputs(fid) {
    /* Returns ordered list of all focusable inputs in the table for fid */
    var block = document.getElementById('proc-table-block-' + fid);
    if (!block) return [];
    return Array.prototype.slice.call(
      block.querySelectorAll('tbody input[type="text"], tbody input[type="number"]')
    );
  }

  function procGetCellCoords(input, fid) {
    /* Returns { row, col } of the input within the tbody grid */
    var tr = input.closest('tr');
    if (!tr) return null;
    var allRows = Array.prototype.slice.call(
      document.querySelectorAll('#proc-tableBody-' + fid + ' tr')
    );
    var row = allRows.indexOf(tr);
    var inputs = Array.prototype.slice.call(tr.querySelectorAll('input[type="text"], input[type="number"]'));
    var col = inputs.indexOf(input);
    return { row: row, col: col };
  }

  function procNavigate(input, fid, direction) {
    var coords = procGetCellCoords(input, fid);
    if (!coords) return;
    var allRows = Array.prototype.slice.call(
      document.querySelectorAll('#proc-tableBody-' + fid + ' tr')
    );
    var targetRow, targetCol, targetInputs, targetInput;

    if (direction === 'down' || direction === 'enter') {
      /* Move to same column, next row */
      targetRow = coords.row + 1;
      if (targetRow >= allRows.length) return;
      targetInputs = Array.prototype.slice.call(
        allRows[targetRow].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = targetInputs[Math.min(coords.col, targetInputs.length - 1)];
    } else if (direction === 'up') {
      targetRow = coords.row - 1;
      if (targetRow < 0) return;
      targetInputs = Array.prototype.slice.call(
        allRows[targetRow].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = targetInputs[Math.min(coords.col, targetInputs.length - 1)];
    } else if (direction === 'right') {
      var allInputs = Array.prototype.slice.call(
        allRows[coords.row].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = allInputs[coords.col + 1] || null;
      if (!targetInput) {
        /* Wrap to first input of next row */
        if (coords.row + 1 < allRows.length) {
          targetInput = allRows[coords.row + 1].querySelector('input[type="text"], input[type="number"]');
        }
      }
    } else if (direction === 'left') {
      var rowInputs = Array.prototype.slice.call(
        allRows[coords.row].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = rowInputs[coords.col - 1] || null;
      if (!targetInput && coords.row > 0) {
        /* Wrap to last input of previous row */
        var prevInputs = Array.prototype.slice.call(
          allRows[coords.row - 1].querySelectorAll('input[type="text"], input[type="number"]')
        );
        targetInput = prevInputs[prevInputs.length - 1] || null;
      }
    }

    if (targetInput) {
      targetInput.focus();
      if (targetInput.select) targetInput.select();
    }
  }

  function procInitTableKeyboard(fid) {
    var block = document.getElementById('proc-table-block-' + fid);
    if (!block || block._keyboardInited) return;
    block._keyboardInited = true;
    block.addEventListener('keydown', function(e) {
      var input = e.target;
      if (input.tagName !== 'INPUT') return;
      if (!input.closest('#proc-table-block-' + fid)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        procNavigate(input, fid, 'enter');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        procNavigate(input, fid, 'down');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        procNavigate(input, fid, 'up');
      } else if (e.key === 'ArrowRight') {
        /* Solo navega si el cursor está al final del valor */
        var atEnd = input.selectionStart === (input.value || '').length;
        if (atEnd) { e.preventDefault(); procNavigate(input, fid, 'right'); }
      } else if (e.key === 'ArrowLeft') {
        var atStart = input.selectionStart === 0;
        if (atStart) { e.preventDefault(); procNavigate(input, fid, 'left'); }
      }
    });
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
      var pvpDisplay = pvpEl.querySelector('.proc-pvp-display');
      var pvpCopyBtn = pvpEl.querySelector('.proc-pvp-copy-btn');
      var pvpEditInput = pvpEl.querySelector('.proc-pvp-edit-input');
      /* Only update the auto-calculated value if user hasn't manually overridden */
      if (!pvpEl._manualOverride) {
        if (pvpResult !== null) {
          pvpEl.className = 'proc-cell-computed has-val';
          pvpEl._calcValue = pvpResult.pvpFinal;
          if (pvpDisplay) pvpDisplay.textContent = pvpResult.pvpFinal.toFixed(2);
          if (pvpCopyBtn) pvpCopyBtn.style.display = 'inline-flex';
        } else {
          pvpEl.className = 'proc-cell-computed';
          pvpEl._calcValue = null;
          if (pvpDisplay) pvpDisplay.textContent = '\u2014';
          if (pvpCopyBtn) pvpCopyBtn.style.display = 'none';
        }
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

    var refVal = tr.querySelector('.proc-ref-input') ? tr.querySelector('.proc-ref-input').value : '';
    if (preco || refVal) tr.classList.add('has-data');
    else                 tr.classList.remove('has-data');

    procCheckRowCoherence(fid, id, tr, qtdFt, pecas, preco);
    procUpdateSummary(fid);
    /* Snapshot para undo — debounced */
    clearTimeout(procRecalcRow._undoTimer);
    procRecalcRow._undoTimer = setTimeout(procUndoSnapshot, 600);
  }

  /* ── 9b. ROW COHERENCE CHECK ── */
  /* Marca visualmente com borda laranja suave campos com incoerências:
     - Qtd 0 mas preço preenchido
     - preço 0 mas qtd preenchida
     - Total de peças (FNC+PXO) muito diferente da qtd FT (sem flag D) */
  function procCheckRowCoherence(fid, id, tr, qtdFt, pecas, preco) {
    var inputs    = tr.querySelectorAll('input[type="number"]');
    var qtdInput  = inputs[0];
    var precoInput = inputs[3];

    /* Reset warnings */
    if (qtdInput)   qtdInput.classList.remove('proc-warn-field');
    if (precoInput) precoInput.classList.remove('proc-warn-field');

    /* Qtd 0 com preço preenchido */
    if (!qtdFt && preco > 0) {
      if (qtdInput) qtdInput.classList.add('proc-warn-field');
    }
    /* Preço 0 com qtd preenchida */
    if (qtdFt > 0 && !preco) {
      if (precoInput) precoInput.classList.add('proc-warn-field');
    }
  }

  /* ── 9c. ONBOARDING TOOLTIP (once per device) ── */
  function procShowOnboardingTooltip(fid) {
    var SEEN_KEY = 'proc_onboarding_seen';
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch(e) { return; }

    var input = document.getElementById('proc-proveedor-' + fid);
    if (!input) return;

    var tip = document.createElement('div');
    tip.id = 'proc-onboarding-tip';
    tip.innerHTML =
      '<div class="proc-tip-bubble">'
      + '<span style="color:#fff!important">&#8594; começa aqui &mdash; escreve o fornecedor</span>'
      + '</div>'
      + '<div class="proc-tip-arrow"></div>';

    document.body.appendChild(tip);

    function reposition() {
      var r = input.getBoundingClientRect();
      tip.style.left = (r.left + window.scrollX) + 'px';
      tip.style.top  = (r.top + window.scrollY - tip.offsetHeight - 10) + 'px';
    }
    reposition();

    function dismiss() {
      if (!tip.parentNode) return;
      tip.style.transition = 'opacity 0.25s';
      tip.style.opacity = '0';
      setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 260);
      try { localStorage.setItem(SEEN_KEY, '1'); } catch(e) {}
      input.removeEventListener('focus', dismiss);
    }
    input.addEventListener('focus', dismiss);
    /* Auto-dismiss after 5s */
    setTimeout(dismiss, 5000);
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
      if (vEl) vEl.classList.remove('proc-warn-field');
      procUpdateAuditButton(fid, 0);
    } else {
      var sign = diff > 0 ? '+' : '';
      diffChip.className = 'proc-diff-chip ' + (diff > 0 ? 'pos' : 'neg');
      diffChip.textContent = 'erro ' + sign + diff.toFixed(2) + ' \u20ac';
      /* Borda laranja subtil se diferença for relevante e houver linhas */
      if (computedTotal > 0 && Math.abs(diff) > 0.01) {
        if (vEl) vEl.classList.add('proc-warn-field');
      } else {
        if (vEl) vEl.classList.remove('proc-warn-field');
      }
      procUpdateAuditButton(fid, diff);
    }
  }

  /* ── 10b. AUDIT ENGINE ── */

  /* Decide si el boton de auditoria debe mostrarse:
     - Hay diferencia real (diff != 0)
     - Todas las lineas con datos tienen distribucion completa (FNC+PXO == QTD o flag D)
     - No hay ninguna linea con status "err" (error de cantidades sin resolver) */
  function procUpdateAuditButton(fid, diff) {
    var btn = document.getElementById('proc-audit-btn-' + fid);
    if (!btn) return;
    if (Math.abs(diff) < 0.01) { btn.style.display = 'none'; return; }

    /* Verificar que no hay errores de cantidades pendientes */
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var statusEl = document.getElementById('proc-status-' + fid + '-' + i);
      if (statusEl && statusEl.classList.contains('err')) {
        btn.style.display = 'none';
        return;
      }
    }

    /* Verificar que todas las lineas con datos tienen distribucion completa */
    var allDistributed = true;
    for (var j = 1; j <= rc; j++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + j);
      if (!tr) continue;
      var nums = tr.querySelectorAll('input[type="number"]');
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      if (!preco && !qtdFt) continue; /* linea vacia, ignorar */
      var dCb = document.getElementById('proc-d-' + fid + '-' + j);
      var hasD = dCb ? dCb.checked : false;
      if (!hasD && qtdFt > 0 && (a4 + a5) !== qtdFt) {
        allDistributed = false;
        break;
      }
    }

    btn.style.display = allDistributed ? 'inline-block' : 'none';
  }

  /* Calcula candidatas para el panel de auditoria */
  function procComputeAuditCandidates(fid, diff) {
    var rc = rowCounts[fid] || 0;
    var lines = [];

    for (var i = 1; i <= rc; i++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var rIn  = tr.querySelector('.proc-ref-input');
      var dIn  = tr.querySelector('.proc-desc-input');
      var nums = tr.querySelectorAll('input[type="number"]');
      var dCb  = document.getElementById('proc-d-' + fid + '-' + i);
      var pCb  = document.getElementById('proc-plus-' + fid + '-' + i);
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var descPct = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var hasD  = dCb ? dCb.checked : false;
      var plus1 = pCb ? pCb.checked : false;
      var pcs   = a4 + a5;
      if (!preco || !pcs) continue;

      var pc = procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5);
      var contribution = pcs * pc * (1 - descPct / 100);

      /* pc_new: precio de coste que cerraría la diferencia si solo esta línea fuera culpable */
      var factor = pcs * (1 - descPct / 100);
      var pc_new = (contribution - diff) / factor;

      /* errorUnitario: diferencia entre pc_new y pc (ambos en precio de coste) */
      var errorUnitario = pc_new - pc;  /* negativo si hay que bajar, positivo si hay que subir */

      /* precoCorregido: precio que el usuario debería haber escrito
         Invertimos procCalcPrecoCusto: preco_correcto = preco + (pc_new - pc)
         Esto funciona porque el ajuste D y +1 son lineales sobre preco */
      var precoCorregido = preco + (pc_new - pc);

      /* distClean: distancia del precoCorregido al multiplo de 0.05 mas cercano.
         Un precio real de coste siempre es un numero limpio (x.00, x.25, x.50, x.75, x.99...).
         Si precoCorregido es limpio, esta linea es la culpable probable.
         Si no, es una linea inocente que produciria un precio absurdo al corregir. */
      var nearest = Math.round(precoCorregido / 0.05) * 0.05;
      var distClean = Math.abs(precoCorregido - nearest);

      lines.push({
        idx: i,
        ref: rIn  ? (rIn.value  || '—') : '—',
        desc: dIn ? (dIn.value || '') : '',
        preco: preco,
        precoCorregido: precoCorregido,
        errorUnitario: Math.abs(errorUnitario),
        distClean: distClean,
        pcs: pcs
      });
    }

    /* Ordenar por distClean: el precoCorregido mas limpio (cercano a multiplo de 0.05) va primero */
    lines.sort(function(a, b) { return a.distClean - b.distClean; });

    /* Candidatas simples: todas, ordenadas */
    var singles = lines.slice(0, 5);

    /* Candidatas dobles: pares donde ambos errores unitarios son menores que el error mayor de las simples */
    var doubles = [];
    var threshold = singles.length ? singles[singles.length - 1].distClean : Infinity;
    for (var p = 0; p < lines.length && doubles.length < 3; p++) {
      for (var q2 = p + 1; q2 < lines.length && doubles.length < 3; q2++) {
        /* Si entre los dos explican la diferencia con errores unitarios razonables */
        /* No hay una solucion unica para dos incognitas, pero podemos mostrar
           el par con menor suma de errores si la diferencia se puede repartir */
        /* Heuristica: si ambos tienen pcs similares, cada uno absorbe ~diff/2 */
        var eA = Math.abs(diff / 2 / (lines[p].pcs  * (1 - 0)));
        var eB = Math.abs(diff / 2 / (lines[q2].pcs * (1 - 0)));
        if (eA < 0.05 && eB < 0.05) {
          doubles.push({ a: lines[p], b: lines[q2], eA: eA, eB: eB });
        }
      }
    }

    return { singles: singles, doubles: doubles, diff: diff };
  }

  function procShowAuditPanel(fid) {
    var vEl  = document.getElementById('proc-valorFactura-' + fid);
    var tEl  = document.getElementById('proc-totalCalc-'   + fid);
    var ftVal = parseFloat(vEl ? vEl.value : 0) || 0;
    var calc  = parseFloat(tEl ? tEl.textContent : 0) || 0;
    var diff  = calc - ftVal;

    var result = procComputeAuditCandidates(fid, diff);
    var sign   = diff > 0 ? '+' : '';

    /* ── Build panel HTML ── */
    var rowsHTML = '';
    result.singles.forEach(function(c, idx) {
      var arrow = diff > 0 ? '\u2193' : '\u2191'; /* seta direcao correcao */
      var precoStr    = c.preco.toFixed(2).replace('.', ',') + ' \u20ac';
      var corrigStr   = c.precoCorregido.toFixed(2).replace('.', ',') + ' \u20ac';
      var errStr      = (diff > 0 ? '-' : '+') + c.errorUnitario.toFixed(2).replace('.', ',') + ' \u20ac/un';
      var highlight   = idx === 0 ? 'proc-audit-row-top' : '';
      rowsHTML +=
        '<tr class="proc-audit-row ' + highlight + '">'
        + '<td class="proc-audit-ref">' + c.ref + (c.desc ? '<span class="proc-audit-desc"> ' + c.desc.slice(0, 22) + '</span>' : '') + '</td>'
        + '<td class="proc-audit-val">' + precoStr + '</td>'
        + '<td class="proc-audit-arrow">' + arrow + '</td>'
        + '<td class="proc-audit-val proc-audit-corr">' + corrigStr + '</td>'
        + '<td class="proc-audit-pcs">' + c.pcs + ' pcs</td>'
        + '<td class="proc-audit-err">' + errStr + '</td>'
        + '</tr>';
    });

    var doublesHTML = '';
    if (result.singles.length === 0 || result.singles[0].errorUnitario > 1) {
      /* Solo mostrar pares si las simples no son convincentes */
      result.doubles.forEach(function(d) {
        doublesHTML +=
          '<div class="proc-audit-pair">'
          + '\u2197 ' + d.a.ref + ' + ' + d.b.ref
          + ' <span class="proc-audit-pair-err">(&plusmn;' + d.eA.toFixed(2) + ' + &plusmn;' + d.eB.toFixed(2) + ' \u20ac/un)</span>'
          + '</div>';
      });
    }

    var modal = document.createElement('div');
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:560px">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Auditoria de pre\u00e7os</span>'
      +       '<span class="proc-or-panel-title-sub">Diferen\u00e7a: ' + sign + diff.toFixed(2) + ' \u20ac \u00b7 linhas mais prov\u00e1veis</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">\u2715</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll" style="padding:16px 20px">'
      +     '<div class="proc-audit-explain">O sistema calculou, para cada linha, qual seria o pre\u00e7o unit\u00e1rio necess\u00e1rio para fechar a diferen\u00e7a. As linhas com menor ajuste necess\u00e1rio s\u00e3o as mais prov\u00e1veis.</div>'
      +     '<table class="proc-audit-table">'
      +       '<thead><tr>'
      +         '<th>Refer\u00eancia</th>'
      +         '<th>Pre\u00e7o atual</th>'
      +         '<th></th>'
      +         '<th>Pre\u00e7o correto</th>'
      +         '<th>Pcs</th>'
      +         '<th>Erro/un</th>'
      +       '</tr></thead>'
      +       '<tbody>' + rowsHTML + '</tbody>'
      +     '</table>'
      +     (doublesHTML ? '<div class="proc-audit-pairs-title">Poss\u00edveis combina\u00e7\u00f5es de duas linhas:</div>' + doublesHTML : '')
      +     '<div class="proc-audit-note">Clica numa linha da tabela para ir diretamente a esse campo de pre\u00e7o.</div>'
      +   '</div>'
      + '</div>';

    /* Click on row navigates to that price input */
    procOpenModal(modal);
    modal.querySelector('.proc-or-backdrop').addEventListener('click', function() { procCloseModal(modal); });
    modal.querySelector('.proc-or-close-btn').addEventListener('click',  function() { procCloseModal(modal); });
    var esc = function(e) { if (e.key === 'Escape') { procCloseModal(modal); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);

    /* Row click — focus price input */
    modal.querySelectorAll('.proc-audit-row').forEach(function(tr2, idx2) {
      tr2.style.cursor = 'pointer';
      tr2.addEventListener('click', function() {
        procCloseModal(modal);
        var candidate = result.singles[idx2];
        if (!candidate) return;
        var rowEl = document.getElementById('proc-row-' + fid + '-' + candidate.idx);
        if (!rowEl) return;
        var priceInput = rowEl.querySelectorAll('input[type="number"]')[3];
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
          priceInput.classList.add('proc-warn-field');
          setTimeout(function() { priceInput.classList.remove('proc-warn-field'); }, 3000);
        }
      });
    });
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
      var flagBtn = document.getElementById('proc-flag-' + fid + '-' + i);
      var flagged = flagBtn ? flagBtn.classList.contains('flagged') : false;
      if (!ref && !preco && !flagged) continue;
      var pc3 = procCalcPrecoCusto(preco, plus3, hasD3, qtdFt, a4, a5);
      /* Collect manual PVP override if any */
      var pvpEl3    = document.getElementById('proc-pvp-' + fid + '-' + i);
      var pvpManual = (pvpEl3 && pvpEl3._manualOverride) ? parseFloat((pvpEl3.querySelector('.proc-pvp-display') || {}).textContent) || null : null;
      result.push({ ref:ref, desc:desc, qtdFt:qtdFt, a4:a4, a5:a5,
                    preco:preco, descPct:dPct, hasD:hasD3, plus1:plus3,
                    precoCusto:pc3, obs:obs, flagged:flagged, pvpManual:pvpManual });
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
            msg.style.color = ok ? '#4A7C6F' : '#5F7B94';
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

    /* ── Build raw lines, then merge equal refs per ARM ── */
    var rawLines = [];
    [['Funchal','A4'],['Porto Santo','A5']].forEach(function(pair) {
      var loja = pair[0], cod = pair[1];
      rows.forEach(function(r) {
        var qty = cod === 'A4' ? r.a4 : r.a5;
        if (qty > 0) rawLines.push({ ref:r.ref, loja:loja, cod:cod, precio:r.precoCusto, qty:qty });
      });
    });

    /* Merge: group by ref+cod, sum qty, average price when prices differ */
    var map = {};
    rawLines.forEach(function(l) {
      var key = l.ref + '||' + l.cod;
      if (!map[key]) {
        map[key] = { ref:l.ref, loja:l.loja, cod:l.cod, qty:0, _prices:[], _totalQty:0 };
      }
      map[key].qty      += l.qty;
      map[key]._prices.push(l.precio);
      map[key]._totalQty += l.qty;
    });
    var lines = Object.keys(map).map(function(k) {
      var m = map[k];
      var prices = m._prices;
      /* Average price (weighted equally per row, not per unit) */
      var avgPrice = prices.reduce(function(s,p){ return s+p; }, 0) / prices.length;
      return { ref:m.ref, loja:m.loja, cod:m.cod, iva:'23', precio:avgPrice, qty:m.qty };
    });

    /* ── Render helpers ── */
    var currentIva = '23';

    function buildTableRows() {
      if (!lines.length) return '<tr class="empty-row"><td colspan="5">Sem linhas com dados para mostrar</td></tr>';
      return lines.map(function(l) {
        return '<tr>'
          + '<td>' + l.ref + '</td>'
          + '<td class="center" style="font-weight:700;letter-spacing:.05em">' + l.cod + '</td>'
          + '<td class="center">' + currentIva + '</td>'
          + '<td class="right">' + l.precio.toFixed(2) + '</td>'
          + '<td class="center">' + l.qty + '</td>'
          + '</tr>';
      }).join('');
    }

    var totalFunchal    = lines.filter(function(l) { return l.cod==='A4'; }).reduce(function(s,l) { return s+l.qty; }, 0);
    var totalPortoSanto = lines.filter(function(l) { return l.cod==='A5'; }).reduce(function(s,l) { return s+l.qty; }, 0);
    var totalStock      = lines.reduce(function(s,l) { return s + l.qty * l.precio; }, 0);

    var COLS = ['Refer\u00eancia','ARM','IVA','\u20ac','Qtd.'];

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
      +     '<div class="proc-or-panel-header-btns" style="display:flex;align-items:center;gap:8px;">'
      +       '<label style="font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#000;opacity:.6;white-space:nowrap;">IVA&nbsp;%</label>'
      +       '<input id="proc-stock-iva-input" type="text" value="23" maxlength="6" style="width:52px;padding:4px 7px;border:1px solid #ccc;border-radius:7px;font-family:\'MontserratLight\',sans-serif;font-size:.82rem;font-weight:700;color:#000;text-align:center;background:#fafafa;outline:none;" />'
      +       '<button class="proc-or-action-btn" id="proc-stock-export-btn">\u2b07 exportar CSV</button>'
      +       '<button class="proc-or-close-btn">\u2715</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="proc-or-scroll">'
      +     '<table class="proc-or-table"><thead><tr>'
      +       '<th><div class="proc-guia-th2-inner"><button class="proc-or-copy-btn proc-guia-hdr-copy" data-col="0">\u29c9</button>Refer\u00eancia</div></th>'
      +       '<th class="center"><div class="proc-guia-th2-inner" style="justify-content:center"><button class="proc-or-copy-btn proc-guia-hdr-copy" data-col="1">\u29c9</button>ARM</div></th>'
      +       '<th class="center"><div class="proc-guia-th2-inner" style="justify-content:center"><button class="proc-or-copy-btn proc-guia-hdr-copy" data-col="2">\u29c9</button>IVA</div></th>'
      +       '<th class="center"><div class="proc-guia-th2-inner" style="justify-content:center"><button class="proc-or-copy-btn proc-guia-hdr-copy" data-col="3">\u29c9</button>\u20ac</div></th>'
      +       '<th class="center"><div class="proc-guia-th2-inner" style="justify-content:center"><button class="proc-or-copy-btn proc-guia-hdr-copy" data-col="4">\u29c9</button>Qtd.</div></th>'
      +     '</tr></thead>'
      +     '<tbody id="proc-stock-tbody">' + buildTableRows() + '</tbody>'
      +     '</table>'
      +   '</div>'
      +   '<div class="proc-or-panel-footer">'
      +     lines.length + ' linhas \u00b7 ' + totalFunchal + ' un. Funchal \u00b7 ' + totalPortoSanto + ' un. Porto Santo'
      +     ' \u00b7 <strong style="color:#000;font-size:1rem;letter-spacing:-.01em">Total: ' + totalStock.toFixed(2) + '</strong>'
      +     '<span class="proc-or-copy-msg" id="proc-stock-copy-msg" style="margin-left:10px;font-size:.72rem;font-weight:700;"></span>'
      +   '</div>'
      + '</div>';

    /* ── IVA input: update entire column on change ── */
    var ivaInput = modal.querySelector('#proc-stock-iva-input');
    ivaInput.addEventListener('input', function() {
      currentIva = ivaInput.value.trim();
      var tbody = modal.querySelector('#proc-stock-tbody');
      if (tbody) tbody.innerHTML = buildTableRows();
    });
    ivaInput.addEventListener('focus', function() { ivaInput.style.borderColor='#000'; });
    ivaInput.addEventListener('blur',  function() { ivaInput.style.borderColor='#ccc'; });

    procBindClose(modal);
    procBindCopyBar(modal, COLS, function(ci) {
      return lines.map(function(l) {
        if (ci===0) return l.ref;
        if (ci===1) return l.cod;
        if (ci===2) return currentIva;
        if (ci===3) return l.precio.toFixed(2).replace('.',',');
        return String(l.qty);
      });
    });

    modal.querySelector('#proc-stock-export-btn').addEventListener('click', function() {
      var bom    = '\uFEFF';
      var header = 'Refer\u00eancia;Armaz\u00e9m;IVA;Pre\u00e7o;Quantidade';
      var body   = lines.map(function(l) {
        return [l.ref, l.cod, currentIva, l.precio.toFixed(2).replace('.',','), l.qty].join(';');
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

  /* ── 15b. FLOATING ACTION BUTTONS ── */
  function procCreateFloatingButtons() {
    if (document.getElementById('proc-float-actions')) return;
    var wrap = document.createElement('div');
    wrap.id = 'proc-float-actions';

    var saveBtn = document.createElement('button');
    saveBtn.id = 'proc-float-save';
    saveBtn.className = 'proc-float-btn';
    saveBtn.title = 'Guardar sessão';
    saveBtn.innerHTML = '<span class="proc-float-btn-icon">&#128190;</span>';
    saveBtn.addEventListener('click', function() { procSaveSession(true); });

    wrap.appendChild(saveBtn);
    document.body.appendChild(wrap);

    /* Show float buttons only when the top session bar scrolls out of view */
    var sessionBar = document.getElementById('proc-session-bar');
    if (sessionBar && window.IntersectionObserver) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var enabled = wrap.getAttribute('data-enabled');
          if (!enabled) return;
          if (!entry.isIntersecting) {
            wrap.classList.add('proc-float-visible');
          } else {
            wrap.classList.remove('proc-float-visible');
          }
        });
      }, { threshold: 0, rootMargin: '0px' });
      observer.observe(sessionBar);
      wrap._observer = observer;
    }
  }

  function procShowFloatingButtons() {
    var wrap = document.getElementById('proc-float-actions');
    if (!wrap) return;
    wrap.setAttribute('data-enabled', '1');
    /* If observer not supported, fall back to always-visible */
    if (!window.IntersectionObserver) wrap.classList.add('proc-float-visible');
  }

  function procHideFloatingButtons() {
    var wrap = document.getElementById('proc-float-actions');
    if (!wrap) return;
    wrap.removeAttribute('data-enabled');
    wrap.classList.remove('proc-float-visible');
  }

  /* ── 16. BUILD OVERLAY HTML ── */
  function buildOverlayContent(container) {
    container.id = 'proc-content';
    container.innerHTML =
        '<div class="page-wrap">'
      /* ── Session bar — always visible, never blocking ── */
      +   '<div id="proc-session-bar">'
      +     '<div id="proc-session-bar-left">'
      +       '<span id="proc-session-label" style="font-size:.78rem;font-weight:700;color:#555;white-space:nowrap;display:none;"></span>'
      +       '<span id="proc-saveStatus" class="proc-save-status" style="display:none;"></span>'
      +     '</div>'
      +     '<div id="proc-session-bar-right">'
      +       '<button class="proc-btn" id="proc-sessionMenuBtn" style="white-space:nowrap;">&#128194; sess&#245;es &#x25be;</button>'
      +       '<div id="proc-sessionMenuDropdown" class="proc-session-dropdown hidden" style="top:calc(100% + 6px);right:0;"></div>'
      +       '<button class="proc-btn primary" id="proc-saveBtn" style="display:none;">&#128190;</button>'
      +       '<button class="proc-btn" id="proc-guiaBtn" style="display:none;border-color:#5F7B94;color:#5F7B94;background:transparent;">&#128203;</button>'
      +     '</div>'
      +   '</div>'
      /* ── Session start panel — visible only before a session is active ── */
      +   '<div id="proc-session-start">'
      +     '<div id="proc-session-start-inner">'
      +       '<div style="font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:10px;">PROCESSAMENTO DE FATURAS</div>'
      +       '<div style="font-size:1rem;font-weight:700;color:#000;margin-bottom:6px;">Escolhe uma sess\u00e3o ou inicia uma nova</div>'
      +       '<div style="font-size:.78rem;font-weight:600;color:#555;margin-bottom:20px;line-height:1.5;">Para evitar sobreescrever dados, selecciona sempre a sess\u00e3o correcta.</div>'
      +       '<div id="proc-start-sessions-list"></div>'
      +       '<div style="border-top:1px solid #f0f0f0;margin-top:16px;padding-top:16px;">'
      +         '<button class="proc-btn primary" id="proc-start-new-btn" style="width:100%;padding:11px 16px;font-size:.88rem;justify-content:flex-start;">&#11088; Iniciar nova sess\u00e3o</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      /* ── Main work area — hidden until session active ── */
      +   '<div id="proc-main-area" style="display:none;">'
      +     '<div class="proc-top-bar" style="margin-bottom:16px;">'
      +       '<h1 class="proc-app-title">Processamento de Faturas</h1>'
      +     '</div>'
      +     '<div id="proc-faturasContainer"></div>'
      +     '<div class="proc-add-fatura-wrap">'
      +       '<button class="proc-add-fatura-btn proc-btn" id="proc-addFaturaBtn">&#65291; adicionar fatura</button>'
      +     '</div>'
      +     '<div class="proc-disclaimer-msg">'
      +       '&#9888;&#65039; SE OS ITENS TIVEREM DESCONTO DEVES INSERIR O PRE\u00c7O NORMAL E, NA COLUNA DE %, INSERIR O VALOR DO DESCONTO (%).'
      +     '</div>'
      +     '<div class="proc-disclaimer-msg" style="margin-top:6px">'
      +       '&#10133; SE FOR NECESS\u00c1RIO ADICIONAR 1\u20ac POR TRANSPORTE, ACTIVA O BOT\u00c3O <strong>+1\u20ac</strong> NA LINHA DA REFER\u00caNCIA CORRESPONDENTE.'
      +     '</div>'
      +     '<div class="proc-disclaimer-msg" style="margin-top:6px;margin-bottom:20px">'
      +       '&#9432;&#65039; <strong>BOT\u00c3O D \u2014 DILUI\u00c7\u00c3O DE PRE\u00c7O:</strong> '
      +       'Se faltarem pe\u00e7as e forem satisfeitas noutra fatura, ou se vierem pe\u00e7as a mais, activa o <strong>D</strong> para diluir o pre\u00e7o e fazer coincidir os c\u00e1lculos com a fatura. '
      +       'Se aguardas repositi\u00e7\u00e3o do fornecedor, n\u00e3o actives nada.'
      +     '</div>'
      +   '</div>'
      + '</div>';

    /* ── Styles for new elements ── */
    var sb = document.getElementById('proc-session-bar');
    if (sb) sb.style.cssText = 'border-bottom:1px solid #9DB6C9;margin-bottom:18px;position:relative;';

    var ss = document.getElementById('proc-session-start');
    if (ss) ss.style.cssText = 'display:flex;justify-content:center;padding:32px 0;';

    var si = document.getElementById('proc-session-start-inner');
    if (si) si.style.cssText = 'width:100%;max-width:460px;background:#fff;border:1px solid #9DB6C9;border-radius:16px;padding:28px 28px 22px;box-shadow:0 4px 20px rgba(0,0,0,.06);font-family:\'MontserratLight\',sans-serif;';

    /* ── Bind buttons ── */
    document.getElementById('proc-saveBtn').addEventListener('click', function() { procSaveSession(true); });
    document.getElementById('proc-sessionMenuBtn').addEventListener('click', function(e) { procToggleSessionMenu(e); });
    document.getElementById('proc-guiaBtn').addEventListener('click', function() { procShowGuiaModal(); });
    document.getElementById('proc-start-new-btn').addEventListener('click', function() { procStartNewSession(); });

    /* close session menu on outside click */
    document.addEventListener('click', function() { procCloseSessionMenu(); });
  }

  /* ── Render session list in the start panel ── */
  function procRenderStartPanel() {
    var list = document.getElementById('proc-start-sessions-list');
    if (!list) return;
    var keys = getAllSessionKeys();
    if (!keys.length) {
      list.innerHTML = '';
      return;
    }
    var html = '<div style="font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.4;margin-bottom:8px;">Sess\u00f5es guardadas</div>';
    keys.forEach(function(key) {
      var label = labelFromKey(key);
      var dateStr = '', nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          dateStr = dt.toLocaleDateString('pt-PT') + ' \u00b7 ' + dt.toLocaleTimeString('pt-PT', {hour:'2-digit',minute:'2-digit'});
        }
        if (d && d.faturas) nFat = d.faturas.length + ' fat.';
      } catch(e) {}
      var meta = [dateStr, nFat].filter(Boolean).join(' \u00b7 ');
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;margin-bottom:6px;border:1px solid #9DB6C9;border-radius:10px;gap:8px;font-family:\'MontserratLight\',sans-serif;">'
        + '<div style="min-width:0;">'
        +   '<div style="font-size:.85rem;font-weight:700;color:#000;">' + label + '</div>'
        +   (meta ? '<div style="font-size:.68rem;font-weight:600;color:#888;margin-top:2px;">' + meta + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-shrink:0;">'
        +   '<button class="proc-start-load-btn" data-key="' + key + '" style="padding:5px 13px;border:1px solid #5F7B94;border-radius:7px;background:transparent;color:#5F7B94;font-size:.72rem;font-weight:700;cursor:pointer;font-family:\'MontserratLight\',sans-serif;">\u21a9 carregar</button>'
        +   '<button class="proc-start-del-btn" data-key="' + key + '" style="padding:5px 9px;border:1px solid #ddd;border-radius:7px;background:transparent;color:#888;font-size:.72rem;font-weight:700;cursor:pointer;font-family:\'MontserratLight\',sans-serif;">\u2715</button>'
        + '</div>'
        + '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.proc-start-load-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        procLoadSessionFromStart(btn.dataset.key);
      });
    });
    list.querySelectorAll('.proc-start-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        procDeleteSession(btn.dataset.key);
        setTimeout(procRenderStartPanel, 100);
      });
    });
  }

  /* Load a session from the start panel — always forces remote fetch first */
  function procLoadSessionFromStart(key) {
    procSetSyncStatus('syncing', 'a actualizar\u2026');
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : null;
        if (!raw) {
          raw = localStorage.getItem(key);
          if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
          procApplySessionData(key, raw, function() {
            procMarkSynced();
            procShowMainArea(key);
            procSetSyncStatus('offline', 'sem dados remotos \u2014 carregado localmente');
          });
          return;
        }
        /* Force-overwrite localStorage with freshest remote data */
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', '\u2713 actualizado e carregado');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'offline \u2014 carregado localmente');
        });
      });
  }

  /* Start a brand-new session */
  function procStartNewSession() {
    _activeSessionKey = getNextWeekKey();
    procMarkSynced();
    procAddFatura(null);
    procShowMainArea(_activeSessionKey);
    procSetSyncStatus('ok', 'nova sess\u00e3o');
  }

  /* Show/hide between start panel and main work area */
  function procShowMainArea(key) {
    var start = document.getElementById('proc-session-start');
    var main  = document.getElementById('proc-main-area');
    var addBtn = document.getElementById('proc-addFaturaBtn');
    if (start) start.style.display = 'none';
    if (main)  main.style.display  = '';
    if (addBtn) {
      var newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener('click', function() { procAddFatura(null); });
    }
    /* Show save and guia buttons, switch bar alignment */
    var saveBtn = document.getElementById('proc-saveBtn');
    var guiaBtn = document.getElementById('proc-guiaBtn');
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveBtn) saveBtn.style.display = '';
    if (guiaBtn) guiaBtn.style.display = '';
    if (saveStatus) saveStatus.style.display = '';
    /* Update label in session bar */
    var lbl = document.getElementById('proc-session-label');
    if (lbl && key) { lbl.textContent = labelFromKey(key); lbl.style.display = ''; }
    /* Floating action buttons */
    procCreateFloatingButtons();
    procShowFloatingButtons();
  }

  function procShowStartArea() {
    var start = document.getElementById('proc-session-start');
    var main  = document.getElementById('proc-main-area');
    if (start) start.style.display = 'flex';
    if (main)  main.style.display  = 'none';
    var lbl = document.getElementById('proc-session-label');
    if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
    /* Hide save and guia, recenter bar */
    var saveBtn = document.getElementById('proc-saveBtn');
    var guiaBtn = document.getElementById('proc-guiaBtn');
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveBtn) saveBtn.style.display = 'none';
    if (guiaBtn) guiaBtn.style.display = 'none';
    if (saveStatus) saveStatus.style.display = 'none';
    /* Hide floating buttons */
    procHideFloatingButtons();
    /* Reload remote keys then render */
    procLoadRemoteKeys(procRenderStartPanel);
  }

  /* ── 16b. CLOSE / RESET SESSION ── */
  function procCloseActiveSession() {
    procFloatModal({
      label: 'Fechar sess\u00e3o',
      title: 'Guardar e fechar a sess\u00e3o activa?',
      body: 'A sess\u00e3o ser\u00e1 guardada. Podes retomar a qualquer momento.',
      buttons: [
        {
          label: '\ud83d\udcbe Guardar e fechar',
          style: 'background:#F5EAEA;border:1px solid #e8c5c5;color:#9B4D4D;font-weight:700;',
          cb: function() {
            if (_isSynced) procSaveSession(true);
            setTimeout(function() {
              _isSynced = false;
              _activeSessionKey = null;
              _procInited = false;
              faturaCount   = 0;
              activeFaturas = [];
              Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
              _procSentRefs = {};
              var cont = document.getElementById('proc-faturasContainer');
              if (cont) cont.innerHTML = '';
              var saveBtn = document.getElementById('proc-saveBtn');
              if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = ''; saveBtn.style.cursor = ''; }
              procSetSyncStatus('ok', 'sess\u00e3o fechada');
              procShowStartArea();
            }, 400);
          }
        },
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #9DB6C9;color:#000;', cb: null }
      ]
    });
  }

  /* ── 17. INIT ── */
  function initProcessamento(container) {
    if (_procInited) return;
    _procInited = true;

    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });

    buildOverlayContent(container);

    /* Show start area (non-blocking) — loads remote keys then renders */
    procShowStartArea();

    /* auto-save every 10 s */
    setInterval(function() { procSaveSession(false); }, 10000);

    /* Undo keyboard shortcut (Ctrl+Z) */
    procInitUndoKeyboard();

    /* ── adm-back-btn: guardar, fechar sessão e ocultar botões flutuantes ── */
    (function() {
      var backBtn = document.getElementById('adm-back-btn');
      if (!backBtn || backBtn._procBound) return;
      backBtn._procBound = true;
      backBtn.addEventListener('click', function(e) {
        if (!_isSynced || !_activeSessionKey) return;
        e.stopImmediatePropagation();
        if (_isSynced) procSaveSession(false);
        procHideFloatingButtons();
        _isSynced         = false;
        _activeSessionKey = null;
        _procInited       = false;
        faturaCount   = 0;
        activeFaturas = [];
        Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
        _procSentRefs = {};
        var cont = document.getElementById('proc-faturasContainer');
        if (cont) cont.innerHTML = '';
        setTimeout(function() {
          backBtn._procBound = false;
          backBtn.click();
          backBtn._procBound = true;
        }, 80);
      }, true);
    })();
  }

  /* ── 18. OVERLAY OPEN / CLOSE ── */
  function openProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    requestAnimationFrame(function() { overlay.classList.add('visible'); });

    var root = document.getElementById('proc-root');
    if (!root) return;

    var content = document.getElementById('proc-content');
    if (!content) {
      /* Primeira vez — inicializar */
      initProcessamento(root);
    } else if (!_activeSessionKey) {
      /* Voltou sem sessão activa — mostrar ecrã de início */
      _procInited = false;
      initProcessamento(root);
    }
    /* Se há sessão activa, a UI já está correcta */
  }

  /* ── procDoCloseSession: guarda e reseta o estado da sessão ── */
  function procDoCloseSession() {
    if (_isSynced && _activeSessionKey) procSaveSession(false);
    _isSynced         = false;
    _activeSessionKey = null;
    _procInited       = false;
    faturaCount       = 0;
    activeFaturas     = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
    _procSentRefs     = {};
    var cont = document.getElementById('proc-faturasContainer');
    if (cont) cont.innerHTML = '';
    var saveBtn = document.getElementById('proc-saveBtn');
    if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.style.opacity = ''; saveBtn.style.cursor = ''; }
    var guiaBtn = document.getElementById('proc-guiaBtn');
    if (guiaBtn) guiaBtn.style.display = 'none';
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveStatus) saveStatus.style.display = 'none';
    var lbl = document.getElementById('proc-session-label');
    if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
    var main = document.getElementById('proc-main-area');
    if (main) main.style.display = 'none';
    var start = document.getElementById('proc-session-start');
    if (start) start.style.display = 'flex';
    procHideFloatingButtons();
    var backBtn = document.getElementById('adm-back-btn');
    if (backBtn) backBtn._procBound = false;
    procLoadRemoteKeys(procRenderStartPanel);
  }

  function closeProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    /* Se há sessão activa, guardar e fechar antes de esconder a overlay */
    if (_activeSessionKey) procDoCloseSession();
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.classList.remove('open'); }, 600);
  }

  /* ── 19. GUIA DE TRANSPORTE ── */

  /* sentRefs: { "ref___fid": [{data, f, p}] } stored in session */
  function procSentKey(ref, fid) { return ref + '___' + fid; }

  function procSentQty(ref, fid) {
    if (!_procSentRefs) return { f:0, p:0 };
    var key  = procSentKey(ref, fid);
    var lots = _procSentRefs[key] || [];
    var f = 0, p = 0;
    lots.forEach(function(l){ f += l.f||0; p += l.p||0; });
    return { f:f, p:p };
  }

  /* Build rows from all active faturas that have a4 or a5 > 0 */
  function procBuildGuiaRows() {
    var rows = [];
    activeFaturas.forEach(function(fid) {
      var fatRows = procCollectRows(fid);
      var pEl = document.getElementById('proc-proveedor-' + fid);
      var forn = pEl ? (pEl.value || 'Fatura ' + fid) : 'Fatura ' + fid;
      fatRows.forEach(function(r) {
        if (!r.ref) return;
        if ((r.a4 || 0) === 0 && (r.a5 || 0) === 0) return;
        var sent  = procSentQty(r.ref, fid);
        var pendF = Math.max(0, (r.a4||0) - sent.f);
        var pendP = Math.max(0, (r.a5||0) - sent.p);
        rows.push({
          ref:    r.ref,
          forn:   forn,
          fid:    fid,
          totalF: r.a4 || 0,
          totalP: r.a5 || 0,
          pendF:  pendF,
          pendP:  pendP,
          sentF:  sent.f,
          sentP:  sent.p,
          done:   pendF === 0 && pendP === 0
        });
      });
    });
    return rows;
  }

  function procConfirmGuiaEnvio(pendRows) {
    var today = new Date().toISOString().slice(0,10);
    pendRows.forEach(function(row) {
      if (row.done) return;
      var key = procSentKey(row.ref, row.fid);
      if (!_procSentRefs[key]) _procSentRefs[key] = [];
      _procSentRefs[key].push({ data: today, f: row.pendF, p: row.pendP });
    });
    procSaveSession(false);
  }

  /* ══════════════════════════════════════════════════════════
     PENDENTES DE OUTRAS SESSÕES — Processamento + TAM
     Consulta Supabase para funcionar entre dispositivos.
  ══════════════════════════════════════════════════════════ */

  var PROC_SESSION_COLORS = ['#F59E0B','#8B5CF6','#3B82F6','#10B981','#6B7280'];
  function procSessionColor(idx) {
    return PROC_SESSION_COLORS[Math.min(idx, PROC_SESSION_COLORS.length - 1)];
  }

  /* ── Extrai pendentes das sessões de Processamento (proc_sessoes) ── */
  async function procGetPendingFromProcSessions() {
    var results = [];
    try {
      var res = await procSbFetch('proc_sessoes?select=session_key,dados&order=updated_at.desc', { method: 'GET' });
      if (!res.ok) return results;
      var rows = await res.json();

      /* FIX 1: extrair a data da sessão activa para só incluir sessões anteriores.
         O session_key tem o formato proc_fatura_YYYY-MM-DD[_N], por isso basta
         comparar a parte da data lexicograficamente. */
      var activeKey    = _activeSessionKey || '';
      /* Extrai "YYYY-MM-DD" do active key, ou '' se não for possível */
      var activeDateStr = (function() {
        var stripped = activeKey.replace('proc_fatura_', '');
        var m = stripped.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
      })();

      rows.forEach(function(row) {
        /* Ignorar a sessão activa */
        if (row.session_key === activeKey) return;

        /* FIX 1: ignorar sessões iguais ou posteriores à activa.
           Compara apenas a parte da data (YYYY-MM-DD) — lexicográfico é correcto
           porque o formato é ISO. Se não conseguirmos extrair a data, ignorar
           também por segurança. */
        if (activeDateStr) {
          var rowDateStr = (function() {
            var s = row.session_key.replace('proc_fatura_', '');
            var m2 = s.match(/^(\d{4}-\d{2}-\d{2})/);
            return m2 ? m2[1] : '';
          })();
          if (!rowDateStr || rowDateStr >= activeDateStr) return;
        }

        var data;
        try { data = JSON.parse(row.dados); } catch(e) { return; }
        if (!data.faturas || !data.faturas.length) return;
        var sentRefs = data.sentRefs || {};

        /* Agrupar por ref para evitar entradas duplicadas (mesma ref em
           várias faturas ou várias linhas da mesma sessão) */
        var refMap = {}; /* ref → { a4, a5, sentKeys } */
        data.faturas.forEach(function(fat, fidIdx) {
          var fid  = fidIdx + 1; /* 1-based, igual a faturaCount */
          (fat.rows || []).forEach(function(r) {
            if (!r.ref) return;
            var a4 = r.a4 || 0, a5 = r.a5 || 0;
            if (a4 === 0 && a5 === 0) return;
            if (!refMap[r.ref]) refMap[r.ref] = { a4: 0, a5: 0, sentKeys: [] };
            refMap[r.ref].a4 += a4;
            refMap[r.ref].a5 += a5;
            refMap[r.ref].sentKeys.push(r.ref + '___' + fid);
          });
        });

        /* FIX 2: usar o session_key formatado como nome de sessão, não o proveedor.
           labelFromKey converte "proc_fatura_2026-03-24" → "Semana 24/03/2026". */
        var sessionName = labelFromKey(row.session_key);

        Object.keys(refMap).forEach(function(ref) {
          var entry = refMap[ref];
          /* Somar já enviado de todas as chaves associadas a esta ref */
          var sF = 0, sP = 0;
          entry.sentKeys.forEach(function(sk) {
            (sentRefs[sk] || []).forEach(function(l){ sF += l.f||0; sP += l.p||0; });
          });
          var pendF = Math.max(0, entry.a4 - sF);
          var pendP = Math.max(0, entry.a5 - sP);
          /* FIX 3: só incluir se há realmente algo por enviar */
          if (pendF === 0 && pendP === 0) return;
          /* Usar a primeira chave como referência para gravação */
          var primaryKey = entry.sentKeys[0];
          results.push({
            ref:               ref,
            forn:              sessionName,
            sourceModule:      'proc',
            sessionKey:        row.session_key,
            sessionName:       sessionName,
            pendF:             pendF,
            pendP:             pendP,
            totalF:            entry.a4,
            totalP:            entry.a5,
            done:              false,
            _fromOtherSession: true,
            _procKey:          row.session_key,
            _procSentKey:      primaryKey
          });
        });
      });
    } catch(e) { console.warn('procGetPendingFromProcSessions error', e); }
    return results;
  }

  /* ── Extrai pendentes das sessões de TAM (tam_sessions) ── */
  async function procGetPendingFromTamSessions() {
    var results = [];
    try {
      var res = await procSbFetch('tam_sessions?select=session_name,data&order=saved_at.desc', { method: 'GET' });
      if (!res.ok) return results;
      var rows = await res.json();
      rows.forEach(function(row) {
        var data;
        try { data = JSON.parse(row.data); } catch(e) { return; }
        if (!data.boxes) return;
        var sentRefs = data.sentRefs || {};

        /* Recolher todas as refs únicas das caixas — fonte única de verdade.
           A distribuição está nas caixas, não nos invoices; iterar invoices
           causava entradas duplicadas (uma por invoice × ref). */
        var refMap = {}; /* ref → { distF, distP } */
        data.boxes.forEach(function(box) {
          if (!box.refs) return;
          Object.keys(box.refs).forEach(function(ref) {
            if (!refMap[ref]) refMap[ref] = { distF: 0, distP: 0 };
            refMap[ref].distF += box.refs[ref].f || 0;
            refMap[ref].distP += box.refs[ref].p || 0;
          });
        });

        Object.keys(refMap).forEach(function(ref) {
          var distF = refMap[ref].distF;
          var distP = refMap[ref].distP;
          if (distF === 0 && distP === 0) return;

          /* sentRefs em TAM: a chave histórica era ref___invIdx (por invoice).
             Para compatibilidade, somar todos os lots cujo key começa com ref___  */
          var sF = 0, sP = 0;
          Object.keys(sentRefs).forEach(function(k) {
            if (k === ref || k.indexOf(ref + '___') === 0) {
              (sentRefs[k] || []).forEach(function(l){ sF += l.f||0; sP += l.p||0; });
            }
          });

          var pendF = Math.max(0, distF - sF);
          var pendP = Math.max(0, distP - sP);
          if (pendF === 0 && pendP === 0) return;

          /* sentKey estável para futuras gravações: ref___TAMsessionName */
          var sentKey = ref + '___' + row.session_name;
          results.push({
            ref:               ref,
            forn:              row.session_name,
            sourceModule:      'tam',
            sessionKey:        row.session_name,
            sessionName:       'TAM · ' + row.session_name,
            pendF:             pendF,
            pendP:             pendP,
            totalF:            distF,
            totalP:            distP,
            done:              false,
            _fromOtherSession: true,
            _tamSessionName:   row.session_name,
            _tamSentKey:       sentKey
          });
        });
      });
    } catch(e) { console.warn('procGetPendingFromTamSessions error', e); }
    return results;
  }

  /* ── Confirmar envio de pendentes de outras sessões ── */
  async function procConfirmOtherSessionsEnvio(otherRows) {
    if (!otherRows.length) return;
    var today = new Date().toISOString().slice(0, 10);

    /* Agrupar por sessão proc */
    var byProcKey = {};
    otherRows.filter(function(r){ return r.sourceModule === 'proc'; }).forEach(function(r) {
      if (!byProcKey[r._procKey]) byProcKey[r._procKey] = [];
      byProcKey[r._procKey].push(r);
    });

    /* Agrupar por sessão TAM */
    var byTamKey = {};
    otherRows.filter(function(r){ return r.sourceModule === 'tam'; }).forEach(function(r) {
      if (!byTamKey[r._tamSessionName]) byTamKey[r._tamSessionName] = [];
      byTamKey[r._tamSessionName].push(r);
    });

    /* Actualizar sessões proc */
    for (var pKey in byProcKey) {
      try {
        var pRes = await procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(pKey) + '&select=dados', { method: 'GET' });
        var pRows = await pRes.json();
        var pRaw  = pRows && pRows.length ? pRows[0].dados : null;
        if (!pRaw) continue;
        var pData = JSON.parse(pRaw);
        if (!pData.sentRefs) pData.sentRefs = {};
        byProcKey[pKey].forEach(function(row) {
          if (!pData.sentRefs[row._procSentKey]) pData.sentRefs[row._procSentKey] = [];
          pData.sentRefs[row._procSentKey].push({ data: today, f: row.pendF, p: row.pendP });
        });
        pData.savedAt = new Date().toISOString();
        await procSbFetch('proc_sessoes', {
          method: 'POST',
          headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ session_key: pKey, dados: JSON.stringify(pData), updated_at: pData.savedAt })
        });
      } catch(e) { console.warn('procConfirmOtherSessionsEnvio proc error', e); }
    }

    /* Actualizar sessões TAM */
    for (var tKey in byTamKey) {
      try {
        var tRes = await procSbFetch('tam_sessions?session_name=eq.' + encodeURIComponent(tKey) + '&select=data', { method: 'GET' });
        var tRows = await tRes.json();
        var tRaw  = tRows && tRows.length ? tRows[0].data : null;
        if (!tRaw) continue;
        var tData = JSON.parse(tRaw);
        if (!tData.sentRefs) tData.sentRefs = {};
        byTamKey[tKey].forEach(function(row) {
          if (!tData.sentRefs[row._tamSentKey]) tData.sentRefs[row._tamSentKey] = [];
          tData.sentRefs[row._tamSentKey].push({ data: today, f: row.pendF, p: row.pendP });
        });
        tData.savedAt = Date.now();
        await procSbFetch('tam_sessions', {
          method: 'POST',
          headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ session_name: tKey, saved_at: new Date().toISOString(), data: JSON.stringify(tData) })
        });
      } catch(e) { console.warn('procConfirmOtherSessionsEnvio tam error', e); }
    }
  }

  function procShowGuiaModal() {
    var allRows  = procBuildGuiaRows();
    var pendRows = allRows.filter(function(r){ return !r.done; });
    var sentRows = allRows.filter(function(r){ return  r.done; });

    if (!allRows.length) {
      procFloatModal({
        title: 'Sem distribuição',
        body:  'Nenhuma fatura tem pe\u00e7as distribu\u00eddas por armazém. Preenche as colunas FNC e PXO primeiro.',
        buttons: [{ label: 'OK', cb: null }]
      });
      return;
    }

    var oldModal = document.getElementById('proc-guia-modal');
    if (oldModal) oldModal.parentNode.removeChild(oldModal);

    var nFaturas = activeFaturas.length;
    var title    = 'Guia Consolidada \u00b7 ' + nFaturas + ' fatura' + (nFaturas !== 1 ? 's' : '');
    var fPend    = pendRows.reduce(function(s,r){ return s+r.pendF; }, 0);
    var pPend    = pendRows.reduce(function(s,r){ return s+r.pendP; }, 0);
    var fSent    = sentRows.reduce(function(s,r){ return s+r.totalF; }, 0);
    var pSent    = sentRows.reduce(function(s,r){ return s+r.totalP; }, 0);

    var COL_G = ['Ref. FNC', 'Qtd. F', 'Ref. PXO', 'Qtd. PS'];

    function buildTableRows(rowList) {
      if (!rowList.length) return '<tr><td colspan="7" class="proc-guia-empty">Sem refer\u00eancias pendentes</td></tr>';
      var fRows = rowList.filter(function(r){ return (r.done ? r.totalF : r.pendF) > 0; });
      var pRows = rowList.filter(function(r){ return (r.done ? r.totalP : r.pendP) > 0; });
      var maxLen = Math.max(fRows.length, pRows.length);
      var html = '';
      for (var i = 0; i < maxLen; i++) {
        var fRow = fRows[i] || null;
        var pRow = pRows[i] || null;
        var refRow = fRow || pRow;
        var cls = refRow.done ? ' proc-guia-row-sent' : (i%2===0 ? ' proc-guia-row-even' : ' proc-guia-row-odd');
        /* Indicator dots live in their own column — refs are untouched */
        var fDot = (fRow && fRow._dotColor)
          ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + fRow._dotColor + ';flex-shrink:0;" aria-hidden="true"></span>'
          : '';
        var pDot = (pRow && pRow._dotColor)
          ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + pRow._dotColor + ';flex-shrink:0;" aria-hidden="true"></span>'
          : '';
        var fRef = fRow ? fRow.ref : '';
        var fQty = fRow ? (fRow.done ? fRow.totalF : fRow.pendF) : '';
        var pRef = pRow ? pRow.ref : '';
        var pQty = pRow ? (pRow.done ? pRow.totalP : pRow.pendP) : '';
        html += '<tr class="proc-guia-tr' + cls + '">'
          + '<td class="proc-guia-td proc-guia-dot-col">' + fDot + '</td>'
          + '<td class="proc-guia-td proc-guia-ref-f" data-gcol="0">' + fRef + '</td>'
          + '<td class="proc-guia-td proc-guia-qty-f" data-gcol="1">' + (fQty !== '' ? fQty : '') + '</td>'
          + '<td class="proc-guia-td proc-guia-sep-td"></td>'
          + '<td class="proc-guia-td proc-guia-dot-col">' + pDot + '</td>'
          + '<td class="proc-guia-td proc-guia-ref-p" data-gcol="2">' + pRef + '</td>'
          + '<td class="proc-guia-td proc-guia-qty-p" data-gcol="3">' + (pQty !== '' ? pQty : '') + '</td>'
          + '</tr>';
      }
      return html;
    }

    function buildLegendHtml(otherRows) {
      var colorMap = {};
      otherRows.forEach(function(r){ if (!colorMap[r.sessionKey]) colorMap[r.sessionKey] = r._dotColor; });
      var keys = Object.keys(colorMap);
      if (!keys.length) return '';
      return '<div id="proc-guia-session-legend">'
        + keys.map(function(k){
            var row = otherRows.find(function(r){ return r.sessionKey === k; });
            var name = row ? row.sessionName : k;
            return '<span class="proc-guia-legend-item"><span style="color:' + colorMap[k] + ';user-select:none;">\u25cf</span> ' + name + '</span>';
          }).join('')
        + '</div>';
    }

    var copyBar = '<div class="proc-guia-copy-bar">'
      + '<button class="proc-guia-addr-btn" data-addr="CAL\u00c7ADA DA QUINTINHA 17 B">\u29c9\u00a0Lisboa</button>'
      + '<button class="proc-guia-addr-btn" data-addr="29-FV-30">\u29c9\u00a0Placa</button>'
      + '<button class="proc-guia-addr-btn" data-addr="RUA DE S\u00c3O FRANCISCO N\u00ba 20">\u29c9\u00a0FNC</button>'
      + '<button class="proc-guia-addr-btn" data-addr="EDIFICIO Ilha Dourada Loja-1">\u29c9\u00a0PXO</button>'
      + '</div>';

    /* FIX: mostrar enviadas apenas quando nao ha pendentes */
    var sentSection = (sentRows.length && pendRows.length === 0)
      ? '<tr class="proc-guia-sent-hdr"><td colspan="7">\u2713 J\u00e1 enviado ('
        + sentRows.length + ' refs \u00b7 ' + fSent + ' F \u00b7 ' + pSent + ' PS)</td></tr>'
        + buildTableRows(sentRows)
      : '';

    /* Banner — fase 1: a verificar */
    var bannerHtml = '<div id="proc-guia-other-banner" class="proc-guia-other-banner proc-guia-other-loading">'
      + '<span id="proc-guia-other-status">\u21bb a verificar sessões anteriores\u2026</span>'
      + '</div>';

    var modal = document.createElement('div');
    modal.id  = 'proc-guia-modal';
    modal.innerHTML =
      '<div id="proc-guia-backdrop"></div>'
      + '<div id="proc-guia-panel">'
      +   '<div id="proc-guia-header">'
      +     '<div id="proc-guia-title">'
      +       '<span id="proc-guia-title-main">' + title + '</span>'
      +       '<span id="proc-guia-title-sub">Guia de transporte \u00b7 Processamento de Faturas</span>'
      +     '</div>'
      +     '<div id="proc-guia-header-right">'
      +       bannerHtml
      +       '<div id="proc-guia-header-btns">'
      +         '<button id="proc-guia-confirm-btn" class="proc-guia-action-btn proc-guia-confirm"'
      +           (pendRows.length===0?' disabled':'') + '>\u2713 Confirmar envio</button>'
      +         '<button id="proc-guia-export-btn" class="proc-guia-action-btn">\u2b07 Exportar CSV</button>'
      +         '<button id="proc-guia-close-btn" class="proc-guia-close-btn">\u00d7</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   copyBar
      +   '<div id="proc-guia-scroll">'
      +     '<table id="proc-guia-table">'
      +       '<thead><tr>'
      +         '<th class="proc-guia-th proc-guia-dot-th"></th>'
      +         '<th class="proc-guia-th proc-guia-th-f" colspan="2"><div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><span>\ud83d\udd35 FNC (A4)</span><span id="proc-guia-fnc-count" style="font-size:.6rem;font-weight:600;opacity:.7;">' + fPend + ' un. pendentes</span></div></th>'
      +         '<th class="proc-guia-th proc-guia-th-sep"></th>'
      +         '<th class="proc-guia-th proc-guia-dot-th"></th>'
      +         '<th class="proc-guia-th proc-guia-th-p" colspan="2"><div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><span>\ud83d\udd34 PXO (A5)</span><span id="proc-guia-pxo-count" style="font-size:.6rem;font-weight:600;opacity:.7;">' + pPend + ' un. pendentes</span></div></th>'
      +       '</tr><tr>'
      +         '<th class="proc-guia-dot-th"></th>'
      +         '<th class="proc-guia-th2"><div class="proc-guia-th2-inner">Refer\u00eancia <button class="proc-guia-copy-btn proc-guia-hdr-copy" data-gcol="0">\u29c9</button></div></th>'
      +         '<th class="proc-guia-th2" style="text-align:center"><div class="proc-guia-th2-inner" style="justify-content:center">Qtd. <button class="proc-guia-copy-btn proc-guia-hdr-copy" data-gcol="1">\u29c9</button></div></th>'
      +         '<th class="proc-guia-th-sep"></th>'
      +         '<th class="proc-guia-dot-th"></th>'
      +         '<th class="proc-guia-th2"><div class="proc-guia-th2-inner">Refer\u00eancia <button class="proc-guia-copy-btn proc-guia-hdr-copy" data-gcol="2">\u29c9</button></div></th>'
      +         '<th class="proc-guia-th2" style="text-align:center"><div class="proc-guia-th2-inner" style="justify-content:center">Qtd. <button class="proc-guia-copy-btn proc-guia-hdr-copy" data-gcol="3">\u29c9</button></div></th>'
      +       '</tr></thead>'
      +       '<tbody id="proc-guia-tbody">' + buildTableRows(pendRows) + sentSection + '</tbody>'
      +     '</table>'
      +     '<div id="proc-guia-legend-wrap"></div>'
      +   '</div>'
      +   '<div id="proc-guia-footer">'
      +     '<span id="proc-guia-footer-text">'
      +       pendRows.length + ' refs pendentes \u00b7 ' + fPend + ' un. FNC \u00b7 ' + pPend + ' un. PXO'
      +       (sentRows.length ? ' \u00b7 ' + sentRows.length + ' j\u00e1 enviadas' : '')
      +     '</span>'
      +     '<span class="proc-guia-copy-msg" id="proc-guia-copy-msg" style="margin-left:8px;"></span>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('proc-guia-visible'); });

    /* ── Fase 2: fetch remoto — proc + TAM ── */
    /* NÃO adiciona automaticamente — apenas avisa e espera confirmação do utilizador */
    var _pendingOtherRows = [];   /* ficam guardadas até o user clicar em Adicionar */

    /* _addedOtherRows acumula todas as rows de sessões que o user escolheu adicionar */
    var _addedOtherRows = [];

    function applyOtherRows() {
      /* _pendingOtherRows contém as rows da sessão que acabou de ser clicada */
      var sessionRows = _pendingOtherRows.slice();
      _pendingOtherRows = [];
      if (!sessionRows.length) return;

      /* Acumular para legenda */
      _addedOtherRows = _addedOtherRows.concat(sessionRows);

      var newPendRows = pendRows.concat(sessionRows);
      var newFPend = newPendRows.reduce(function(s,r){ return s+r.pendF; },0);
      var newPPend = newPendRows.reduce(function(s,r){ return s+r.pendP; },0);

      var tbody = modal.querySelector('#proc-guia-tbody');
      if (tbody) tbody.innerHTML = buildTableRows(newPendRows) + sentSection;

      var fncCount = modal.querySelector('#proc-guia-fnc-count');
      var pxoCount = modal.querySelector('#proc-guia-pxo-count');
      if (fncCount) fncCount.textContent = newFPend + ' un. pendentes';
      if (pxoCount) pxoCount.textContent = newPPend + ' un. pendentes';

      var legendWrap = modal.querySelector('#proc-guia-legend-wrap');
      if (legendWrap) legendWrap.innerHTML = buildLegendHtml(_addedOtherRows);

      var footerText = modal.querySelector('#proc-guia-footer-text');
      if (footerText) {
        footerText.textContent = newPendRows.length + ' refs pendentes · ' + newFPend + ' un. FNC · ' + newPPend + ' un. PXO'
          + (sentRows.length ? ' · ' + sentRows.length + ' já enviadas' : '');
      }

      var confirmBtn = modal.querySelector('#proc-guia-confirm-btn');
      if (confirmBtn) confirmBtn.disabled = (newPendRows.length === 0);

      pendRows = newPendRows;
      fPend = newFPend; pPend = newPPend;
    }

    Promise.all([
      procGetPendingFromProcSessions(),
      procGetPendingFromTamSessions()
    ]).then(function(results) {
      var allOther = results[0].concat(results[1]);
      var banner   = modal.querySelector('#proc-guia-other-banner');
      if (!banner || !modal.parentNode) return;

      banner.classList.remove('proc-guia-other-loading');

      if (!allOther.length) {
        banner.classList.add('proc-guia-other-none');
        banner.querySelector('#proc-guia-other-status').textContent = '\u2713 sem pendentes noutras sess\u00f5es';
        setTimeout(function(){ banner.style.display = 'none'; }, 2000);
        return;
      }

      /* Atribuir cores por sess\u00e3o */
      var colorMap = {}, colorIdx = 0;
      allOther.forEach(function(row) {
        if (!colorMap[row.sessionKey]) colorMap[row.sessionKey] = procSessionColor(colorIdx++);
        row._dotColor = colorMap[row.sessionKey];
      });

      /* Agrupar por sess\u00e3o — uma linha de banner por cada sess\u00e3o */
      var sessionGroups = {};
      var sessionOrder  = [];
      allOther.forEach(function(row) {
        if (!sessionGroups[row.sessionKey]) {
          sessionGroups[row.sessionKey] = { rows: [], name: row.sessionName, color: row._dotColor, key: row.sessionKey };
          sessionOrder.push(row.sessionKey);
        }
        sessionGroups[row.sessionKey].rows.push(row);
      });

      banner.classList.add('proc-guia-other-found');
      banner.style.flexDirection = 'column';
      banner.style.alignItems    = 'stretch';
      banner.style.gap           = '6px';

      /* Renderizar uma linha por sess\u00e3o */
      banner.innerHTML = '<div style="font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#000;opacity:.5;margin-bottom:2px;">Sessões anteriores com pendentes</div>'
        + sessionOrder.map(function(sKey) {
            var grp  = sessionGroups[sKey];
            var totF = grp.rows.reduce(function(s,r){ return s+r.pendF; },0);
            var totP = grp.rows.reduce(function(s,r){ return s+r.pendP; },0);
            return '<div class="proc-guia-sess-row" data-skey="' + sKey + '" style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;">'
              + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + grp.color + ';flex-shrink:0;"></span>'
              + '<span style="font-size:.72rem;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + grp.name + '">' + grp.name + '</span>'
              + '<span style="font-size:.68rem;font-weight:600;color:#000;opacity:.6;white-space:nowrap;flex-shrink:0;">' + grp.rows.length + ' ref' + (grp.rows.length!==1?'s':'') + ' \u00b7 ' + totF + ' FNC \u00b7 ' + totP + ' PXO</span>'
              + '<button class="proc-guia-sess-add-btn" data-skey="' + sKey + '" style="padding:3px 12px;font-size:.68rem;font-weight:700;cursor:pointer;border:1.5px solid #555;border-radius:6px;background:#fff;color:#000;white-space:nowrap;flex-shrink:0;transition:background .12s,border-color .12s;">+ Adicionar</button>'
              + '<button class="proc-guia-sess-ign-btn" data-skey="' + sKey + '" style="padding:3px 8px;font-size:.68rem;font-weight:700;cursor:pointer;border:1.5px solid #ddd;border-radius:6px;background:transparent;color:#000;white-space:nowrap;flex-shrink:0;transition:background .12s,border-color .12s;">\u00d7</button>'
              + '</div>';
          }).join('');

      /* Bind por linha */
      banner.querySelectorAll('.proc-guia-sess-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sKey = btn.getAttribute('data-skey');
          var grp  = sessionGroups[sKey];
          if (!grp) return;

          /* Flash sutil no bot\u00e3o — escurece borda brevemente, volta ao normal */
          btn.style.borderColor = '#555';
          btn.style.background  = '#f0f0f0';
          setTimeout(function(){ btn.style.borderColor = ''; btn.style.background = ''; }, 300);

          /* Aplicar apenas as rows desta sess\u00e3o */
          _pendingOtherRows = grp.rows;
          applyOtherRows();

          /* Remover a linha desta sess\u00e3o do banner */
          delete sessionGroups[sKey];
          var rowEl = banner.querySelector('.proc-guia-sess-row[data-skey="' + sKey + '"]');
          if (rowEl) rowEl.remove();

          /* Se n\u00e3o restam sess\u00f5es, fechar banner */
          if (!Object.keys(sessionGroups).length) {
            banner.style.display = 'none';
          }
        });
      });

      banner.querySelectorAll('.proc-guia-sess-ign-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sKey = btn.getAttribute('data-skey');
          delete sessionGroups[sKey];
          var rowEl = banner.querySelector('.proc-guia-sess-row[data-skey="' + sKey + '"]');
          if (rowEl) rowEl.remove();
          if (!Object.keys(sessionGroups).length) banner.style.display = 'none';
        });
      });

    }).catch(function() {
      var banner = modal.querySelector('#proc-guia-other-banner');
      if (banner) banner.style.display = 'none';
    });

    function closeModal() {
      modal.classList.remove('proc-guia-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
    }

    /* Address button copy */
    modal.querySelectorAll('.proc-guia-addr-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var text = btn.getAttribute('data-addr');
        if (!text) return;
        function flash(){ btn.classList.add('proc-guia-addr-copied'); setTimeout(function(){ btn.classList.remove('proc-guia-addr-copied'); }, 1400); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash).catch(flash);
        } else {
          try { var ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;top:-9999px;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch(e){}
          flash();
        }
      });
    });

    /* Copy column */
    var copyMsg = modal.querySelector('#proc-guia-copy-msg');
    var copyTimer = null;
    modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ci   = parseInt(btn.getAttribute('data-gcol'));
        var vals = Array.from(modal.querySelectorAll('td[data-gcol="'+ci+'"]'))
                       .map(function(td){ return td.textContent.trim(); })
                       .filter(function(v){ return v && v !== '\u2014'; });
        if (!vals.length) return;
        modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(b){ b.classList.remove('proc-guia-copy-active'); });
        btn.classList.add('proc-guia-copy-active');
        var text = vals.join('\n');
        function showMsg(ok) {
          if (!copyMsg) return;
          copyMsg.textContent = ok ? '\u2713 ' + COL_G[ci] + ' copiado!' : '\u26a0 copie manualmente';
          copyMsg.style.color = ok ? '#4A7C6F' : '#b05000';
          clearTimeout(copyTimer);
          copyTimer = setTimeout(function(){
            copyMsg.textContent = '';
            modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(b){ b.classList.remove('proc-guia-copy-active'); });
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

    /* Confirmar envio */
    modal.querySelector('#proc-guia-confirm-btn').addEventListener('click', function(){
      if (!pendRows.length) return;
      var confirmDiv = document.createElement('div');
      confirmDiv.id = 'proc-guia-confirm-overlay';
      confirmDiv.innerHTML =
        '<div id="proc-guia-confirm-box">'
        + '<div class="proc-gc-title">\u26a0 Confirmar envio</div>'
        + '<div class="proc-gc-body">'
        + 'Vais marcar <strong>' + pendRows.length + ' refer\u00eancias</strong> como enviadas hoje ('
        + new Date().toLocaleDateString('pt-PT') + ').<br>'
        + '<strong>' + fPend + '</strong> un. FNC \u00b7 <strong>' + pPend + '</strong> un. PXO<br><br>'
        + 'Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.'
        + '</div>'
        + '<div class="proc-gc-btns">'
        + '<button class="proc-gc-btn proc-gc-ok">\u2713 Confirmar</button>'
        + '<button class="proc-gc-btn proc-gc-cancel">Cancelar</button>'
        + '</div>'
        + '</div>';
      modal.querySelector('#proc-guia-panel').appendChild(confirmDiv);
      confirmDiv.querySelector('.proc-gc-cancel').addEventListener('click', function(){
        confirmDiv.parentNode.removeChild(confirmDiv);
      });
      confirmDiv.querySelector('.proc-gc-ok').addEventListener('click', function(){
        var ownRows   = pendRows.filter(function(r){ return !r._fromOtherSession; });
        var otherRows = pendRows.filter(function(r){ return  r._fromOtherSession; });
        procConfirmGuiaEnvio(ownRows);
        confirmDiv.parentNode.removeChild(confirmDiv);
        closeModal();
        /* Aguardar que o Supabase das outras sessões seja actualizado antes
           de reabrir a guia — evita que as refs reapareçam como pendentes */
        procConfirmOtherSessionsEnvio(otherRows).then(function() {
          setTimeout(function(){ procShowGuiaModal(); }, 150);
        }).catch(function() {
          setTimeout(function(){ procShowGuiaModal(); }, 150);
        });
      });
    });

    /* Export CSV */
    modal.querySelector('#proc-guia-export-btn').addEventListener('click', function(){
      var fRows = pendRows.filter(function(r){ return r.pendF>0; });
      var pRows = pendRows.filter(function(r){ return r.pendP>0; });
      var lines = ['\uFEFF' + 'Referencia;Qtd FNC;Referencia;Qtd PXO'];
      for (var li = 0; li < Math.max(fRows.length, pRows.length); li++) {
        var fc = fRows[li] ? fRows[li].ref + ';' + fRows[li].pendF : ';';
        var pc = pRows[li] ? pRows[li].ref + ';' + pRows[li].pendP : ';';
        lines.push(fc + ';' + pc);
      }
      var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'Guia_' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });

    modal.querySelector('#proc-guia-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#proc-guia-close-btn').addEventListener('click', closeModal);
    document.addEventListener('keydown', function escG(e){
      if (e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', escG); }
    });
  }

  /* ── 19b. SENT REFS STATE (persisted in session) ── */
  var _procSentRefs = {};   /* loaded/saved with session */

  /* Override procApplySessionData to also restore sentRefs */
  var _origApplySessionData = procApplySessionData;
  procApplySessionData = function(key, raw, callback) {
    try {
      var data = JSON.parse(raw);
      _procSentRefs = data.sentRefs || {};
    } catch(e) { _procSentRefs = {}; }
    _origApplySessionData(key, raw, callback);
  };

  /* sentRefs já está incluído em procBuildSavePayload — override removido. */
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
  window.procFillAll             = procFillAll;
  window.procShowStockModal      = procShowStockModal;
  window.procToggleSessionMenu   = procToggleSessionMenu;
  window.procLoadSession         = procLoadSession;
  window.procForceLoadSession    = procForceLoadSession;
  window.procDeleteSession       = procDeleteSession;
  window.procSaveSession         = procSaveSession;
  window.procUpdateTableLock     = procUpdateTableLock;
  window.procObsSync             = procObsSync;
  window.procShowGuiaModal       = procShowGuiaModal;
  window.procShowAuditPanel      = procShowAuditPanel;
  window.procCopyBtn             = procCopyBtn;
  window.procLimitDigits         = procLimitDigits;
  window.procToggleFlag          = procToggleFlag;
  window.procCopyPVP             = procCopyPVP;
  window.procPVPToggleEdit       = procPVPToggleEdit;
  window.procPVPEditInput        = procPVPEditInput;
  window.procPVPEditBlur         = procPVPEditBlur;

  function procLimitDigits(input, max) {
    var v = input.value.replace(/[^0-9.]/g,'');
    var parts = v.split('.');
    if (parts[0].length > max) {
      parts[0] = parts[0].slice(0, max);
      input.value = parts.join('.');
    }
  }

  function procCopyBtn(btn) {
    var wrap  = btn.parentElement;
    var input = wrap ? wrap.querySelector('input') : null;
    var text  = input ? input.value.trim() : '';
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch(e) {}
    btn.classList.add('copied');
    var origHTML = btn.innerHTML;
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(function() {
      btn.classList.remove('copied');
      btn.innerHTML = origHTML;
    }, 900);
    /* Highlight the row if this is a ref copy button (first column) */
    var td = btn.closest ? btn.closest('td') : null;
    if (td && td.classList.contains('td-ref')) {
      var tr = td.closest ? td.closest('tr') : null;
      if (tr) {
        /* Remove active from any other row in the same table */
        var tbody = tr.closest ? tr.closest('tbody') : null;
        if (tbody) {
          var activeRows = tbody.querySelectorAll('tr.proc-row-active');
          for (var i = 0; i < activeRows.length; i++) {
            activeRows[i].classList.remove('proc-row-active');
          }
        }
        tr.classList.add('proc-row-active');
      }
    }
  }

  function procCopyPVP(btn, fid, id) {
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    var display = pvpEl ? pvpEl.querySelector('.proc-pvp-display') : null;
    var text = display ? display.textContent.trim() : '';
    if (!text || text === '\u2014') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch(e) {}
    btn.classList.add('copied');
    var origHTML = btn.innerHTML;
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(function() { btn.classList.remove('copied'); btn.innerHTML = origHTML; }, 900);
  }

  function procPVPToggleEdit(btn, fid, id) {
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (!pvpEl) return;
    var display   = pvpEl.querySelector('.proc-pvp-display');
    var editInput = pvpEl.querySelector('.proc-pvp-edit-input');
    var copyBtn   = pvpEl.querySelector('.proc-pvp-copy-btn');
    var isEditing = editInput && editInput.style.display === 'block';
    if (isEditing) {
      /* Commit */
      var val = parseFloat(editInput.value);
      if (!isNaN(val) && val > 0) {
        pvpEl._manualOverride = true;
        if (display) display.textContent = val.toFixed(2);
        pvpEl.className = 'proc-cell-computed has-val';
        if (copyBtn) copyBtn.style.display = 'inline-flex';
      } else if (!editInput.value.trim()) {
        /* Clear override — revert to auto */
        pvpEl._manualOverride = false;
        var calcVal = pvpEl._calcValue;
        if (calcVal !== null && calcVal !== undefined) {
          if (display) display.textContent = calcVal.toFixed(2);
          pvpEl.className = 'proc-cell-computed has-val';
          if (copyBtn) copyBtn.style.display = 'inline-flex';
        } else {
          if (display) display.textContent = '\u2014';
          pvpEl.className = 'proc-cell-computed';
          if (copyBtn) copyBtn.style.display = 'none';
        }
      }
      editInput.style.display = 'none';
      if (display) display.style.display = '';
      btn.classList.remove('active');
    } else {
      /* Start editing */
      var currentVal = pvpEl._manualOverride
        ? (display ? display.textContent.trim() : '')
        : (pvpEl._calcValue !== null && pvpEl._calcValue !== undefined ? pvpEl._calcValue.toFixed(2) : '');
      editInput.value = currentVal;
      editInput.style.display = 'block';
      if (display) display.style.display = 'none';
      editInput.focus();
      editInput.select();
      btn.classList.add('active');
    }
  }

  function procPVPEditInput(input, fid, id) {
    /* live preview while editing — no op needed, value is committed on blur/enter */
  }

  function procPVPEditBlur(input, fid, id) {
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (!pvpEl) return;
    var btn = pvpEl.querySelector('.proc-pvp-edit-btn');
    procPVPToggleEdit(btn, fid, id);
  }

  function procToggleFlag(fid, id) {
    var btn = document.getElementById('proc-flag-' + fid + '-' + id);
    var tr  = document.getElementById('proc-row-'  + fid + '-' + id);
    if (!btn || !tr) return;
    var on = btn.classList.toggle('flagged');
    if (on) { tr.classList.add('proc-row-flagged'); }
    else    { tr.classList.remove('proc-row-flagged'); }
    procSaveSession(false);
  }

  function procObsSync(input) {
    /* Busca el tip como hermano siguiente del input dentro del mismo td */
    var cell = input.closest ? input.closest('.proc-obs-cell') : input.parentElement;
    var tip  = cell ? cell.querySelector('.proc-obs-tip') : null;
    if (!tip) return;
    tip.textContent = input.value || '';
    if (input.value.trim()) {
      tip.classList.add('has-text');
    } else {
      tip.classList.remove('has-text');
    }
  }

})();
