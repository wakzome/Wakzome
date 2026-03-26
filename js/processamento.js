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
      '#proc-content .proc-top-actions { display:flex; align-items:center; gap:8px; }',
      '#proc-content .proc-save-status { font-size:.72rem; font-weight:700; color:#2a8a2a; opacity:0; transition:opacity 0.5s; white-space:nowrap; min-width:90px; text-align:right; }',

      /* Session dropdown */
      '#proc-content .proc-session-menu-wrap { position:relative; }',
      '#proc-content .proc-session-dropdown { position:fixed; width:340px; background:#fff; border:1px solid #e0e0e0; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.14); z-index:9999; overflow:hidden; max-height:380px; overflow-y:auto; }',
      '#proc-content .proc-session-dropdown.hidden { display:none; }',
      '#proc-content .proc-session-menu-empty { padding:18px 20px; text-align:center; color:#000; font-size:.78rem; font-weight:600; }',
      '#proc-content .proc-session-menu-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #f2f2f2; gap:8px; }',
      '#proc-content .proc-session-menu-item:last-child { border-bottom:none; }',
      '#proc-content .proc-session-menu-item.current { background:#f5f9ff; }',
      '#proc-content .proc-session-menu-item-info { display:flex; flex-direction:column; gap:2px; min-width:0; }',
      '#proc-content .proc-session-menu-item-label { font-size:.82rem; font-weight:700; color:#000; white-space:nowrap; }',
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
      '#proc-content .proc-fatura-banner-num { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#ffffff !important; text-shadow:0 1px 4px rgba(0,0,0,.5); }',
      '#proc-content .proc-fatura-banner-provider { font-size:.88rem; font-weight:700; color:#ffffff !important; text-shadow:0 1px 4px rgba(0,0,0,.5); }',
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
      '#proc-content input[type="text"], #proc-content input[type="number"] { background:#fafafa; border:1px solid #e0e0e0; color:#000; font-family:\'MontserratLight\',sans-serif; font-size:.88rem; font-weight:700; padding:8px 10px; border-radius:8px; outline:none; width:100%; transition:border-color 0.15s; -moz-appearance:textfield; }',
      '#proc-content input[type="text"]:focus, #proc-content input[type="number"]:focus { border-color:#000; background:#fff; }',
      '#proc-content input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; }',

      /* Total box */
      '#proc-content .proc-total-box { background:#fafafa; border:1px solid #e0e0e0; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; }',
      '#proc-content .proc-total-box .proc-amount { font-size:1.15rem; font-weight:700; color:#000; }',

      /* Table block */
      '#proc-content .proc-table-block { background:#fff; border:1px solid #e6e6e6; border-radius:14px; overflow:visible; margin-bottom:10px; }',
      '#proc-content .proc-table-wrap { overflow-x:auto; width:100%; }',
      '#proc-content .proc-table-wrap table { border-collapse:collapse; white-space:nowrap; border-radius:0; border-spacing:0; width:100%; table-layout:auto; }',
      '#proc-content .proc-table-wrap thead tr { background:#f2f2f2; border-bottom:2px solid #e0e0e0; }',
      '#proc-content .proc-table-wrap thead th { padding:8px 7px; text-align:center; font-size:.65rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#000; white-space:nowrap; border:none; border-radius:0; }',
      '#proc-content .proc-table-wrap thead th.left { text-align:left; padding-left:10px; }',
      '#proc-content .proc-table-wrap thead th.th-a4 { color:#1565c0; background:#e3f2fd; }',
      '#proc-content .proc-table-wrap thead th.th-a5 { color:#2e7d32; background:#e8f5e9; }',
      '#proc-content .proc-table-wrap tbody tr { border-bottom:1px solid #f2f2f2; transition:background 0.1s; }',
      '#proc-content .proc-table-wrap tbody tr:hover { background:#fafafa !important; }',
      '#proc-content .proc-table-wrap tbody tr.has-data { background:#fffffe; }',
      '#proc-content .proc-table-wrap td { padding:3px 4px; vertical-align:middle; white-space:nowrap; border:none; border-radius:0; font-size:.92rem; font-weight:600; color:#000; }',

      /* TD inputs — compact, centered numbers */
      '#proc-content .proc-table-wrap td input[type="text"], #proc-content .proc-table-wrap td input[type="number"] { background:transparent; border:1px solid transparent; font-size:.82rem; font-weight:700; padding:3px 4px; border-radius:6px; width:100%; color:#000; text-align:center; }',
      '#proc-content .proc-table-wrap td input[type="number"] { width:44px; text-align:center; }',
      '#proc-content .proc-table-wrap td input.proc-ref-input { width:100%; min-width:100px; text-align:left; }',
      '#proc-content .proc-table-wrap td input.proc-desc-input { width:100%; min-width:140px; font-size:.73rem; text-align:left; }',
      '#proc-content .proc-table-wrap td input.proc-preco-input { width:46px; text-align:center; }',
      '#proc-content .proc-table-wrap td input.proc-desc-pct-input { width:38px; text-align:center; }',
      '#proc-content .proc-table-wrap td input:focus { background:#fff; border-color:#ccc; }',
      '#proc-content .proc-table-wrap td.center-col { text-align:center; }',
      '#proc-content .proc-table-wrap td.td-ref { min-width:110px; }',
      '#proc-content .proc-table-wrap td.td-desc { min-width:160px; }',

      /* Row misc */
      '#proc-content .proc-cell-computed { padding:3px 6px; font-size:.85rem; font-weight:700; text-align:center; color:#000; white-space:nowrap; }',
      '#proc-content .proc-cell-computed.has-val { color:#000; font-weight:700; }',
      /* PVP and Margem centered */
      '#proc-content td[id^="proc-pvp-"] { text-align:center !important; }',
      '#proc-content td[id^="proc-marg-"] { text-align:center !important; }',
      '#proc-content td[id^="proc-pvp-"].has-val { font-size:.88rem; font-weight:700; }',
      '#proc-content td[id^="proc-marg-"].has-val { font-size:.88rem; font-weight:700; }',
      '#proc-content .proc-cell-status { text-align:center; font-size:.75rem; font-weight:700; padding:3px 6px; white-space:nowrap; border-radius:6px; }',
      '#proc-content .proc-cell-status.ok { color:#fff; background:#2a8a2a; }',
      '#proc-content .proc-cell-status.err { color:#fff; background:#c00; }',
      '#proc-content .proc-cell-status.warn { color:#fff; background:#e67e00; }',

      /* Copy button — elegant pill */
      '#proc-content .proc-copy-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; padding:0; border:1px solid #d0d0d0; background:#f7f7f7; cursor:pointer; color:#888; font-size:.6rem; line-height:1; border-radius:4px; flex-shrink:0; transition:all .15s; vertical-align:middle; margin-right:4px; }',
      '#proc-content .proc-copy-btn:hover { color:#1565c0; background:#e3f2fd; border-color:#90caf9; box-shadow:0 1px 4px rgba(21,101,192,.15); }',
      '#proc-content .proc-copy-btn.copied { color:#2a8a2a !important; background:#f0faf0 !important; border-color:#a5d6a7 !important; }',
      /* Ref and desc cell layout */
      '#proc-content .proc-ref-wrap { display:inline-flex; align-items:center; width:100%; }',
      '#proc-content .proc-desc-wrap { display:inline-flex; align-items:center; width:100%; position:relative; }',

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
      '#proc-content .proc-summary-line { display:flex; gap:20px; font-size:.78rem; color:#000; font-weight:700; }',
      '#proc-content .proc-summary-line strong { color:#000; }',
      '#proc-content .proc-diff-chip { font-size:.75rem; font-weight:700; padding:3px 10px; border-radius:20px; border:1.5px solid; display:inline-block; }',
      '#proc-content .proc-diff-chip.zero { border-color:#2a8a2a; color:#2a8a2a; background:#f0faf0; }',
      '#proc-content .proc-diff-chip.pos { border-color:#e67e00; color:#e67e00; background:#fff8f0; }',
      '#proc-content .proc-diff-chip.neg { border-color:#c00; color:#c00; background:#fff0f0; }',
      '#proc-content .proc-footer-actions { display:flex; gap:8px; }',

      /* Buttons */
      '#proc-content .proc-btn { padding:7px 16px; border:1px solid #ccc; border-radius:8px; background:#fff; color:#000; font-family:\'MontserratLight\',sans-serif; font-size:.78rem; font-weight:700; text-transform:lowercase; cursor:pointer; transition:all 0.15s; white-space:nowrap; }',
      '#proc-content .proc-btn:hover { background:#000; color:#fff; border-color:#000; }',
      '#proc-content .proc-btn.primary { border-color:#1565c0; color:#1565c0; background:#e3f2fd; }',
      '#proc-content .proc-btn.primary:hover { background:#1565c0; color:#fff; border-color:#1565c0; }',

      /* OBS input */
      '#proc-content .proc-table-wrap td input.proc-obs-input { width:70px; }',

      /* OBS tooltip cell */
      '#proc-content .proc-obs-cell { position:relative; }',
      '#proc-content .proc-obs-tip { visibility:hidden; opacity:0; position:absolute; bottom:calc(100% + 8px); right:0; min-width:180px; max-width:300px; background:#1a1a1a; color:#fff; font-size:.78rem; font-weight:600; padding:8px 12px; border-radius:8px; white-space:pre-wrap; word-break:break-word; z-index:9999; pointer-events:none; line-height:1.6; transition:opacity .15s, visibility .15s; box-shadow:0 4px 14px rgba(0,0,0,.25); }',
      '#proc-content .proc-obs-tip::after { content:""; position:absolute; top:100%; right:14px; border:6px solid transparent; border-top-color:#1a1a1a; }',
      '#proc-content .proc-obs-cell:hover .proc-obs-tip.has-text { visibility:visible; opacity:1; }',

      /* Add fatura */
      '#proc-content .proc-add-fatura-wrap { display:flex; justify-content:center; margin:8px 0 14px; }',
      '#proc-content .proc-add-fatura-btn { padding:9px 32px; font-size:.82rem; border-style:dashed; border-color:#1565c0; color:#1565c0; background:#f0f6ff; border-radius:10px; }',
      '#proc-content .proc-add-fatura-btn:hover { background:#1565c0; color:#fff; border-style:solid; }',

      /* Disclaimer */
      '#proc-content .proc-disclaimer-msg { margin:4px 0 6px; padding:10px 16px; background:#fff8e1; border:1.5px solid #f0c040; border-radius:10px; font-size:.75rem; font-weight:700; color:#7a5800; letter-spacing:.03em; text-align:center; }',

      /* ── GUIA MODAL ── */
      '#proc-guia-modal { position:fixed; inset:0; z-index:5000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .22s ease; pointer-events:none; }',
      '#proc-guia-modal.proc-guia-visible { opacity:1; pointer-events:auto; }',
      '#proc-guia-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '#proc-guia-panel { position:relative; z-index:1; width:min(720px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,.28); overflow:hidden; transform:translateY(14px); transition:transform .22s ease; font-family:\'MontserratLight\',sans-serif; }',
      '#proc-guia-modal.proc-guia-visible #proc-guia-panel { transform:translateY(0); }',
      '#proc-guia-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; flex-wrap:wrap; gap:8px; }',
      '#proc-guia-title { display:flex; flex-direction:column; gap:2px; }',
      '#proc-guia-title-main { font-size:.95rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '#proc-guia-title-sub { display:block; font-size:.68rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; text-transform:uppercase; letter-spacing:.06em; }',
      '#proc-guia-header-btns { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
      '.proc-guia-action-btn { padding:6px 16px; font-size:.76rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:8px; background:#f5f5f5; color:#000!important; transition:background .13s,color .13s; white-space:nowrap; }',
      '.proc-guia-action-btn:hover:not(:disabled) { background:#000; color:#fff; border-color:#000; }',
      '.proc-guia-action-btn:disabled { opacity:.4; cursor:not-allowed; }',
      '.proc-guia-confirm { border-color:#2e7d32!important; color:#2e7d32!important; background:#e8f5e9!important; }',
      '.proc-guia-confirm:hover:not(:disabled) { background:#2e7d32!important; color:#fff!important; border-color:#2e7d32!important; }',
      '.proc-guia-close-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:1rem; cursor:pointer; border:1.5px solid #ddd; border-radius:8px; background:#f5f5f5; color:#000; transition:background .12s; }',
      '.proc-guia-close-btn:hover { background:#c62828; color:#fff; border-color:#c62828; }',
      '.proc-guia-copy-bar { display:flex; align-items:center; gap:6px; padding:8px 16px; background:#f8f8f8; border-bottom:1px solid #eee; flex-wrap:wrap; flex-shrink:0; }',
      '.proc-guia-copy-label { font-size:.7rem; font-weight:700; color:#000!important; text-transform:uppercase; letter-spacing:.05em; font-family:\'MontserratLight\',sans-serif; white-space:nowrap; }',
      '.proc-guia-copy-btn { padding:4px 11px; font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; cursor:pointer; border:1.5px solid #ccc; border-radius:7px; background:#fff; color:#000; transition:background .12s,color .12s; white-space:nowrap; }',
      '.proc-guia-copy-btn:hover { background:#000; color:#fff; border-color:#000; }',
      '.proc-guia-copy-active { background:#1565c0!important; color:#fff!important; border-color:#1565c0!important; }',
      '.proc-guia-copy-msg { font-size:.75rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; margin-left:4px; color:#000!important; }',
      '#proc-guia-scroll { overflow:auto; flex:1; -webkit-overflow-scrolling:touch; }',
      '#proc-guia-table { width:100%; border-collapse:collapse; font-family:\'MontserratLight\',sans-serif; font-size:.84rem; }',
      '#proc-guia-table thead { position:sticky; top:0; z-index:2; }',
      '.proc-guia-th { padding:9px 14px; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #ddd; text-align:center; }',
      '.proc-guia-th-f { background:#e8f0fe; color:#1565c0; }',
      '.proc-guia-th-p { background:#fce4ec; color:#880e4f; }',
      '.proc-guia-th-sep { width:16px; background:#f5f5f5; border-bottom:2px solid #ddd; }',
      '.proc-guia-th2 { padding:7px 14px; background:#f0f0f0; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#000; border-bottom:2px solid #ddd; text-align:left; }',
      '.proc-guia-td { padding:7px 14px; border-bottom:1px solid #f2f2f2; vertical-align:middle; }',
      '.proc-guia-ref-f { font-weight:700; color:#1565c0; min-width:120px; }',
      '.proc-guia-qty-f { text-align:center; font-weight:700; color:#1565c0; font-variant-numeric:tabular-nums; }',
      '.proc-guia-sep-td { width:16px; background:#f9f9f9; border-bottom:1px solid #f2f2f2; }',
      '.proc-guia-ref-p { font-weight:700; color:#880e4f; min-width:120px; }',
      '.proc-guia-qty-p { text-align:center; font-weight:700; color:#880e4f; font-variant-numeric:tabular-nums; }',
      '.proc-guia-row-even td { background:#fff; }',
      '.proc-guia-row-odd td { background:#fafafa; }',
      '.proc-guia-row-sent td { background:#f0faf0; }',
      '.proc-guia-row-sent .proc-guia-ref-f,.proc-guia-row-sent .proc-guia-ref-p { color:#000; }',
      '.proc-guia-row-sent .proc-guia-qty-f,.proc-guia-row-sent .proc-guia-qty-p { color:#000; }',
      '#proc-guia-table tbody tr:hover td { background:#e8f0fe!important; }',
      '.proc-guia-sent-hdr td { padding:6px 14px; background:#f0faf0; font-size:.72rem; font-weight:700; color:#2e7d32; text-transform:uppercase; letter-spacing:.04em; border-top:2px solid #c8e6c9; border-bottom:1px solid #c8e6c9; }',
      '.proc-guia-empty { padding:24px; color:#000; font-style:italic; text-align:center; }',
      '#proc-guia-footer { padding:8px 20px; font-size:.72rem; font-weight:700; color:#000!important; border-top:1px solid #eee; background:#fafafa; font-family:\'MontserratLight\',sans-serif; flex-shrink:0; }',
      '#proc-guia-confirm-overlay { position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.9); border-radius:16px; }',
      '#proc-guia-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.18); padding:24px 28px; width:min(380px,90%); font-family:\'MontserratLight\',sans-serif; }',
      '.proc-gc-title { font-size:.9rem; font-weight:700; color:#c05000; margin-bottom:12px; }',
      '.proc-gc-body { font-size:.82rem; color:#000; line-height:1.6; margin-bottom:18px; }',
      '.proc-gc-btns { display:flex; gap:8px; }',
      '.proc-gc-btn { padding:8px 18px; font-size:.82rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; border-radius:8px; cursor:pointer; border:1.5px solid #ccc; background:#fff; color:#000; transition:background .12s; }',
      '.proc-gc-ok { border-color:#2e7d32!important; color:#2e7d32!important; background:#e8f5e9!important; }',
      '.proc-gc-ok:hover { background:#2e7d32!important; color:#fff!important; }',
      '.proc-gc-cancel:hover { background:#f5f5f5; }',

      /* Address chips in guia header */
      '.proc-guia-addr-bar { display:flex; align-items:center; gap:5px; flex-wrap:wrap; justify-content:flex-end; padding:0 20px 10px; flex-shrink:0; }',
      '.proc-guia-addr-chip { display:flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:.75rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; cursor:pointer; transition:background .12s,border-color .12s; user-select:none; width:100%; box-sizing:border-box; justify-content:space-between; }',
      '.proc-guia-addr-chip:hover { background:#f0f0f0; border-color:#bbb; }',
      '.proc-guia-addr-chip.proc-addr-copied { background:#f0faf0!important; border-color:#2e7d32!important; color:#2e7d32!important; }',
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
      '#proc-content .proc-forn-item.corrected { color:#1565c0; }',

      /* Table lock overlay */
      '#proc-content .proc-table-lock { display:flex; align-items:center; justify-content:center; padding:22px 16px; background:#fafafa; border:1px solid #e6e6e6; border-radius:14px; margin-bottom:10px; font-size:.88rem; font-weight:700; color:#000; text-align:center; gap:10px; }',
      '#proc-content .proc-table-lock span { font-size:1.2rem; }',

      /* Modals */
      '.proc-or-modal { position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.22s ease; pointer-events:none; }',
      '.proc-or-modal.visible { opacity:1; pointer-events:auto; }',
      '.proc-or-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }',
      '.proc-or-panel { position:relative; z-index:1; width:min(700px,96vw); max-height:85vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.18); transform:translateY(14px); transition:transform 0.22s ease; overflow:hidden; }',
      '.proc-or-modal.visible .proc-or-panel { transform:translateY(0); }',
      '.proc-or-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid #e8e8e8; background:#fafafa; flex-shrink:0; }',
      '.proc-or-panel-title { display:flex; flex-direction:column; gap:2px; }',
      '.proc-or-panel-title-main { font-size:1rem; font-weight:700; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-title-sub { font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#000!important; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-panel-header-btns { display:flex; gap:8px; align-items:center; }',
      '.proc-or-close-btn { background:transparent; border:1.5px solid #ddd; border-radius:8px; color:#000; font-size:.85rem; padding:4px 10px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; font-weight:700; transition:all 0.14s; }',
      '.proc-or-close-btn:hover { border-color:#c00; color:#c00; background:#fff0f0; }',
      '.proc-or-action-btn { background:#fff; border:1px solid #ccc; border-radius:8px; color:#000; font-size:.75rem; font-weight:700; text-transform:lowercase; padding:5px 13px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '.proc-or-action-btn:hover { background:#000; color:#fff; border-color:#000; }',
      '.proc-or-copy-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 20px; border-bottom:1px solid #f0f0f0; background:#fafafa; flex-shrink:0; }',
      '.proc-or-copy-label { font-size:.63rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; margin-right:4px; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-copy-btn { background:#fff; border:1px solid #ddd; border-radius:7px; color:#000; font-size:.72rem; font-weight:700; padding:3px 10px; cursor:pointer; font-family:\'MontserratLight\',sans-serif; transition:all 0.14s; }',
      '.proc-or-copy-btn:hover { background:#f0f0f0; border-color:#999; }',
      '.proc-or-copy-btn.active { border-color:#2a8a2a; color:#2a8a2a; background:#f0faf0; }',
      '.proc-or-copy-msg { font-size:.72rem; font-weight:700; font-family:\'MontserratLight\',sans-serif; }',
      '.proc-or-scroll { overflow:auto; flex:1; }',
      '.proc-or-table { border-collapse:collapse; font-family:\'MontserratLight\',sans-serif; white-space:nowrap; width:100%; }',
      '.proc-or-table thead { position:sticky; top:0; z-index:2; }',
      '.proc-or-table thead tr { background:#f5f5f5; border-bottom:2px solid #e0e0e0; }',
      '.proc-or-table th { padding:8px 12px; text-align:left; font-size:.65rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#000; white-space:nowrap; }',
      '.proc-or-table th.center { text-align:center; }',
      '.proc-or-table td { padding:7px 12px; font-size:.84rem; font-weight:700; border-bottom:1px solid #f2f2f2; color:#000; }',
      '.proc-or-table td.center { text-align:center; }',
      '.proc-or-table td.right { text-align:right; }',
      '.proc-or-table tr:nth-child(even) td { background:#fafafa; }',
      '.proc-or-table tr:hover td { background:#f5f5f5 !important; }',
      '.proc-or-table .empty-row td { text-align:center; color:#000; padding:24px; font-style:italic; font-weight:400; }',
      '.proc-or-panel-footer { padding:10px 20px; border-top:1px solid #e8e8e8; background:#fafafa; font-size:.72rem; font-weight:700; color:#000; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',

      /* Mobile: horizontal scroll + sticky ref column */
      '@media (max-width:1024px) {',
      '  #proc-content .proc-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }',
      '  #proc-content .proc-table-wrap table { min-width:700px; }',
      '  #proc-content .proc-table-wrap td.td-ref,',
      '  #proc-content .proc-table-wrap th.left:first-of-type { position:sticky; left:0; background:#fff; z-index:2; box-shadow:2px 0 4px rgba(0,0,0,.07); }',
      '  #proc-content .proc-table-wrap thead th.left:first-of-type { background:#f2f2f2; z-index:3; }',
      '  #proc-content .proc-table-wrap tbody tr:hover td.td-ref { background:#fafafa !important; }',
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
    el.style.color = state === 'error' ? '#c00' : state === 'offline' ? '#e67e00' : '#2a8a2a';
    clearTimeout(el._t);
    if (state === 'ok') {
      el._t = setTimeout(function() { el.style.opacity = '0'; }, 3000);
    }
  }

  function procMarkSynced() {
    _isSynced = true;
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


  /* ── 2c. BIBLIOTECA DE DESCRIÇÕES ── */
  var BIBLIOTECA = ["-T-SHIRT RISCAS", "ALFINETE BORBOLETA", "ALFINETE BOTÃO", "ALFINETE FLORES", "ALFINETE FLORES LANTEJOULAS", "BIQUÍNI BORDADO", "BIQUÍNI BÁSICO", "BIQUÍNI C/RISCAS", "BIQUÍNI DEGRADÊ", "BIQUÍNI ESTAMPADO", "BIQUÍNI ESTAMPADO FL", "BIQUÍNI FLORES", "BIQUÍNI FLORES/RISCAS", "BIQUÍNI FRANJAS", "BIQUÍNI IMP FLORES", "BIQUÍNI LANTEJOULAS", "BIQUÍNI LANTEJOULAS/FLORES", "BIQUÍNI LEOPARDO", "BIQUÍNI PADRÃO", "BIQUÍNI RISCAS", "BIQUÍNI RISCAS MULTI", "BIQUÍNI RISCAS/FLORES", "BIQUÍNI TIRA LEOPARDO", "BLUSA 1 BOTÃO", "BLUSA 2 BOTÃO", "BLUSA 3 BOTÃO", "BLUSA ALGODÃO", "BLUSA ALGODÃO BOLSO", "BLUSA ALGODÃO FARRIPAS", "BLUSA ALGODÃO PRINT", "BLUSA ALGODÃO PUNHO", "BLUSA ALGODÃO-C/LANTEJOULAS", "BLUSA APLICAÇÃO", "BLUSA APLICAÇÃO LANTEJOULAS", "BLUSA APLICAÇÃO/GOLA", "BLUSA ASSIMÉTRICA", "BLUSA ASSIMÉTRICA MANGA CURTA", "BLUSA BICO C BOTÃO", "BLUSA BICO PRINT FLORES", "BLUSA BOLAS LINHO", "BLUSA BOLSO LANTEJOULAS", "BLUSA BORDADO", "BLUSA BORDADO APLIC", "BLUSA BORDADO BOTÃO", "BLUSA BORDADO DOURADO", "BLUSA BORDADO FLORES", "BLUSA BOTÃO", "BLUSA BOTÃO BRILHO", "BLUSA BOTÃO C/FLORES PQ", "BLUSA BOTÃO COSTA", "BLUSA BOTÃO COSTAS", "BLUSA BOTÃO FRT", "BLUSA BOTÃO TRAZ", "BLUSA BRILHO", "BLUSA BRILHO BORDA", "BLUSA BRILHO FRENTE", "BLUSA BRILHO MANG", "BLUSA BÁSICO", "BLUSA BÁSICO BORDADO", "BLUSA BÁSICO BOTÃO", "BLUSA BÁSICO C/ELAST", "BLUSA BÁSICO CETIM", "BLUSA BÁSICO COMPRIDA", "BLUSA BÁSICO CURTA", "BLUSA BÁSICO LINHO", "BLUSA C APLICAÇÃO", "BLUSA C BOLSO C APLICAÇÃO", "BLUSA C BORDADO", "BLUSA C BOTÃO", "BLUSA C BRILHO", "BLUSA C BRILHO MANGA", "BLUSA C FLORES", "BLUSA C LANTEJOULAS", "BLUSA C LAÇO MANGA", "BLUSA C PADRÃO", "BLUSA C PÉROLAS", "BLUSA C/3-BOTÃO", "BLUSA C/APLICAÇÃO", "BLUSA C/BOLAS", "BLUSA C/BOTÃO", "BLUSA C/BOTÃO LAVAGEM", "BLUSA C/BOTÃO M-3/4", "BLUSA C/BOTÃO MTL", "BLUSA C/BRILHO", "BLUSA C/COLETE", "BLUSA C/ELASTIC -FLORES", "BLUSA C/ELASTICO E BOTÃO", "BLUSA C/FLORES", "BLUSA C/FOLHO", "BLUSA C/FRANJAS", "BLUSA C/GOLA BORDADO", "BLUSA C/GRAVATA", "BLUSA C/LANTEJOL", "BLUSA C/LANTEJOULAS", "BLUSA C/LAÇO", "BLUSA C/LAÇO PT", "BLUSA C/NAPA", "BLUSA C/NOEUD", "BLUSA C/PÉROLAS", "BLUSA C/RENDA", "BLUSA C/RISCAS", "BLUSA C/VIVO E BOTÃO", "BLUSA C/VIVO LEOPARDO", "BLUSA C/VIVO NAPA", "BLUSA CAVA ALGODÃO", "BLUSA CAVA BOTÃO", "BLUSA CAVA C/BOTÃO", "BLUSA CAVA C/FLORES", "BLUSA CAVA GRILO LEOPARDO", "BLUSA CAVA LEOPARDO", "BLUSA CETIM APLICAÇÃO LANTEJOULAS", "BLUSA CETIM BOTÃO", "BLUSA CETIM BÁSICO", "BLUSA CETIM C LANTEJOULAS", "BLUSA CETIM ESTAMPADO", "BLUSA CETIM FLORES", "BLUSA CETIM FRANZIDA", "BLUSA CHIFON C/LAÇO", "BLUSA CHIFON ESTAMPADO", "BLUSA COMPRIDA", "BLUSA COMPRIDA/CHAVES", "BLUSA CURTA LEOPARDO", "BLUSA DEC/RED-FLORES", "BLUSA DECOTE C PADRÃO", "BLUSA DEGRADÊ", "BLUSA DEGRADÊ RENDA", "BLUSA DUPLO TECIDO", "BLUSA ESLASTIC BÁSICO", "BLUSA ESTAMPADO", "BLUSA ESTAMPADO AFRICANO", "BLUSA ESTAMPADO CONTINUO", "BLUSA ESTAMPADO HOMBRO DESCU", "BLUSA ESTAMPADO-BLS", "BLUSA FESTA BRILHO", "BLUSA FIO DOURADO", "BLUSA FLORES", "BLUSA FLORES /ELASTIC", "BLUSA FLORES LANTEJOULAS", "BLUSA FLORES M/COMPRIDA", "BLUSA FOLHO /PÉROLAS", "BLUSA FRANJAS", "BLUSA FRANZ FLORES", "BLUSA FRANZIDA", "BLUSA FRANZIDA FRENTE", "BLUSA GEOMÉTRICO", "BLUSA GOLA ESTAMPADO", "BLUSA IMIT LINHO", "BLUSA IMITA LINHO", "BLUSA JEANS /RISCAS", "BLUSA JEANS COMPRIDA", "BLUSA JEANS M COMPRIDA", "BLUSA LARGA C/APLICAÇÃO", "BLUSA LAVAGEM BOTÃO", "BLUSA LAZOS ESTAMPADO", "BLUSA LAÇO", "BLUSA LAÇO ESTAMPADO", "BLUSA LAÇO FRENTE", "BLUSA LAÇO FRT", "BLUSA LAÇO LEOPARDO", "BLUSA LEOPARDO", "BLUSA LEOPARDO LANTEJOULAS", "BLUSA LEOPARDO LUREX", "BLUSA LEOPARDO/ 2 BOLSOS", "BLUSA LEOPARDO/PUNHOS", "BLUSA LICRA C/LAÇO", "BLUSA LICRA ESTAMPADO", "BLUSA LINHO", "BLUSA LINHO /LANTEJOULAS", "BLUSA LINHO BOTÃO", "BLUSA LINHO C BORDADO", "BLUSA LINHO LAÇO", "BLUSA LINHO PRINT", "BLUSA LINHO RISCAS", "BLUSA LISA BOTÃO", "BLUSA LUREX PADRÃO", "BLUSA M/CAVA C-BOTÃO", "BLUSA M/CAVA C/LAÇO", "BLUSA M/COMPRIDA", "BLUSA MALHA ESTAMPADO", "BLUSA MANGA BORDADO", "BLUSA MANGA RECOGIDA ESTAMPADO", "BLUSA MANGA TULE", "BLUSA METALIZADO", "BLUSA MG/COMPRIDA", "BLUSA MUSSELIN ESTAMPADO", "BLUSA MUSSELINA", "BLUSA MUSSELINA BOTÃO", "BLUSA MUSSELINA C LAÇO", "BLUSA MUSSELINA C/COS", "BLUSA MUSSELINA COS", "BLUSA MUSSELINA M/COMPRIDA", "BLUSA MUSSELINA PRINT", "BLUSA MUSSELINA/FLORES", "BLUSA ORGANZA ESTAMPADO", "BLUSA PADRÃO", "BLUSA PADRÃO GEOM", "BLUSA POLIPELE", "BLUSA POPELINE", "BLUSA PRINT ANIMAL E FLORES", "BLUSA PRINT BOTÃO", "BLUSA PRINT BRILHO", "BLUSA PRINT C LANTEJOULAS", "BLUSA PRINT FLORES", "BLUSA PRINT FLORES ALGODÃO", "BLUSA PRINT LEOPARDO", "BLUSA PRINT LEOPARDO C LAÇOS", "BLUSA PRINT LINHO", "BLUSA PRINT SEDA", "BLUSA PRINT ÉTNICA", "BLUSA PÉROLAS", "BLUSA RENDA LEOPARDO", "BLUSA RISCAS", "BLUSA RISCAS /FLORES", "BLUSA RISCAS /RENDA", "BLUSA RISCAS BORDADO", "BLUSA RISCAS C LUREX", "BLUSA RISCAS C/BORDADO", "BLUSA RISCAS C/NO", "BLUSA RISCAS CETIM", "BLUSA RISCAS COLO", "BLUSA RISCAS COLOR", "BLUSA RISCAS FLORES", "BLUSA RISCAS JEANS", "BLUSA RISCAS LARGA", "BLUSA RISCAS LARGA NO", "BLUSA RISCAS LINHA", "BLUSA RISCAS LINHO", "BLUSA RISCAS M/CTR", "BLUSA RISCAS MAG", "BLUSA RISCAS MULTICOL", "BLUSA RISCAS OMBRO", "BLUSA RISCAS TF", "BLUSA RISCAS TRACADA", "BLUSA RISCAS/LEOPARDO", "BLUSA SEDA APLICAÇÃO", "BLUSA SEDA/-C-LAÇO", "BLUSA TECIDO BICO", "BLUSA TECIDO FURROS", "BLUSA TECIDO RUG", "BLUSA TULE BORDADO", "BLUSA X/ESTAMPADO", "BLUSA ÉTNICA", "BLUSÃO ALGODÃO", "BLUSÃO APLICAÇÃO", "BLUSÃO BOTÃO", "BLUSÃO C APLICAÇÃO", "BLUSÃO C LANTEJOULAS", "BLUSÃO CAMBRAIA", "BLUSÃO COMPRIDA NAPA", "BLUSÃO CROPED BRILHO", "BLUSÃO DEGRADÊ", "BLUSÃO DEGRADÊ BOTÃO", "BLUSÃO FLORES C/BOTÃO", "BLUSÃO FRANJAS CURTO", "BLUSÃO IMT -CAMBRAIA", "BLUSÃO IMT/CAMBRAIA", "BLUSÃO JEANS APLICAÇÃO", "BLUSÃO JEANS BRILHO", "BLUSÃO JEANS PÉROLAS", "BLUSÃO NAPA", "BLUSÃO NAPA COMPRIDA/FRANJAS", "BLUSÃO NAPA FRANJAS", "BLUSÃO NAPA H", "BLUSÃO NAPA S/GOLA", "BLUSÃO NAPA+", "BLUSÃO NAPA-FRANZ", "BLUSÃO NAPA/C-VIVO", "BLUSÃO NAPA/COSTURAS", "BLUSÃO NAPA/MODA", "BLUSÃO NYLON BÁSICO", "BLUSÃO NYLON XADREZ", "BLUSÃO POLIPELE", "BLUSÃO POLIPELE C/PRINT", "BLUSÃO PRINT FLORES", "BLUSÃO RISCAS", "BLUSÃO RISCAS CAPUZ", "BLUSÃO ROCK CAMBRAIA", "BLUSÃO TAXAS SARJA", "BLUSÃO TECIDO/XD", "BLUSÃO XADREZ ALGODÃO", "BODY BRILHO", "BODY BÁSICO", "BODY BÁSICO VELUDO", "BODY CAMURÇA", "BODY M/COMPRIDA", "BODY PRINT FLORES", "BOLERO ALGODÃO", "BOLERO BOTÃO ALGODÃO", "BOLERO BRILHO", "BOLERO BÁSICO", "BOLERO C/BOTÃO MALHA", "BOLERO FRANZIDA", "BOLERO LAÇO", "BOLERO M/COMPRIDA", "BOLERO MAG FRANZIDA", "BOLERO MG COMPRIDA", "BOLERO RISCAS", "BOLERO RISCAS DOUR", "BOTAS 3 BOTÃO", "BOTAS ALT/CAMBRAIA", "BOTAS BÁSICO", "BOTAS C/ALT CAMBRAIA", "BOTAS C/ALT-CAMBRAIA", "BOTAS C/APLICAÇÃO", "BOTAS C/BRILHO", "BOTAS C/FERAG", "BOTAS C/LAÇO", "BOTAS C/PARCHE", "BOTAS CAMBRAIA", "BOTAS CAMBRAIA ALT", "BOTAS CAMBRAIA BX", "BOTAS CAMBRAIA S/ALT", "BOTAS CAMBRAIA-2 BOTÃO", "BOTAS CAMBRAIA-LAÇO", "BOTAS CAMBRAIA/3 BOTÃO", "BOTAS CAMBRAIA/C-ALT", "BOTAS CAMBRAIA/C-FRANJ", "BOTAS CAMBRAIA/DOBRA", "BOTAS CAMBRAIA/SALT", "BOTAS CAMBRAIA/SALTO", "BOTAS CAMBRAIA/TAXAS", "BOTAS CAMBRAIA/ZIP", "BOTAS CAMURÇA SALTO", "BOTAS DOBRA IM/CAMBRAIA", "BOTAS ESKIMO LEOPARDO", "BOTAS ESTAMPADO", "BOTAS FLORES", "BOTAS FORRO LEOPARDO", "BOTAS FRANJAS", "BOTAS FRANZIDA", "BOTAS GALOCHA GEOMÉTRICO", "BOTAS IM /CAMBRAIA", "BOTAS IM/CAMBRAIA", "BOTAS IM/CAMBRAIA LAÇO", "BOTAS IMIT/CAMBRAIA", "BOTAS IMP/CAMBRAIA", "BOTAS IMT/CAMBRAIA", "BOTAS IMT/CAMBRAIA-TAX", "BOTAS METALIZADO", "BOTAS MONTANA CAMBRAIA", "BOTAS MONTANHA COMPRIDA", "BOTAS NAPA", "BOTAS NAPA-C/ALT", "BOTAS PEL-3 BOTÃO", "BOTAS POLIPELE", "BOTAS PÉROLAS", "BOTAS RASA CAMBRAIA", "BOTAS ST/ALT CAMBRAIA", "BOTINS DE TACÃO BÁSICO", "BRINCOS BÁSICO", "BRINCOS BÁSICO GOLD", "BRINCOS GOLD BÁSICO", "BÁSICO GIRL LEGGING", "BÁSICO PASHMINA", "BÁSICO POLO", "BÁSICO PONCHO", "BÁSICO SINGLET", "BÁSICO SPORT CALÇA", "BÁSICO T-SHIRT", "BÁSICO VESTIDO", "CACHECOL ALGODÃO", "CACHECOL BÁSICO", "CACHECOL BÁSICO-FINO", "CACHECOL C/FLORES", "CACHECOL COMPRIDA", "CACHECOL FRANJAS", "CACHECOL FRANZIDA", "CACHECOL LEOPARDO", "CACHECOL PELO FRANJAS", "CACHECOL RISCAS", "CALÇA 3 BOTÃO", "CALÇA 5 BOTÃO", "CALÇA AFGAN/COMPRIDA", "CALÇA ALGODÃO", "CALÇA ALGODÃO APLIC", "CALÇA ALGODÃO ESTAMPADO", "CALÇA ALGODÃO FARRIPAS", "CALÇA ALGODÃO FIO", "CALÇA ALGODÃO HOMEM", "CALÇA ALGODÃO LARGA", "CALÇA ALGODÃO PRINT", "CALÇA ALGODÃO UNIV", "CALÇA ALGODÃO VIVO", "CALÇA ALGODÃO/BÁSICO", "CALÇA ALGODÃO/C-PUNHO", "CALÇA ALGODÃO/CINT", "CALÇA ALGODÃO/NEW", "CALÇA ALGODÃO/PRINT", "CALÇA ALGODÃO/PUNHO", "CALÇA APLICAÇÃO", "CALÇA BOCA SINO GEOMÉTRICO", "CALÇA BOLAS LINHO", "CALÇA BOMBAZINE", "CALÇA BOMBAZINE/XADREZ", "CALÇA BORDADO", "CALÇA BOTÃO", "CALÇA BRILHO", "CALÇA BÁSICO", "CALÇA BÁSICO ALGODÃO", "CALÇA BÁSICO BOLSO", "CALÇA BÁSICO C CINTO", "CALÇA BÁSICO C/BOLSO", "CALÇA BÁSICO C/CINTO", "CALÇA BÁSICO C/COS GRD", "CALÇA BÁSICO C/ELASTIC", "CALÇA BÁSICO CHINO", "CALÇA BÁSICO COLOR", "CALÇA BÁSICO ELASTICO", "CALÇA BÁSICO GRD", "CALÇA BÁSICO IMITA LINH", "CALÇA BÁSICO LAÇO", "CALÇA BÁSICO LISA", "CALÇA BÁSICO MALHA", "CALÇA BÁSICO PANA", "CALÇA BÁSICO POPELINE", "CALÇA BÁSICO PUNHO", "CALÇA BÁSICO SARJA", "CALÇA BÁSICO T/GR", "CALÇA BÁSICO T/GRD", "CALÇA BÁSICO TECIDO", "CALÇA BÁSICO TECLIN", "CALÇA BÁSICO TREIN", "CALÇA C APLICAÇÃO", "CALÇA C BOTÃO", "CALÇA C BRILHO", "CALÇA C FRANJAS", "CALÇA C PÉROLAS", "CALÇA C RISCAS", "CALÇA C/BORDADO", "CALÇA C/BORDADO LANTEJOULAS", "CALÇA C/BOTÃO", "CALÇA C/BRILHO", "CALÇA C/CINTO", "CALÇA C/CORDÃO", "CALÇA C/FIO", "CALÇA C/FLORES", "CALÇA C/LAÇO", "CALÇA C/LAÇO PRT", "CALÇA C/MISSANGA", "CALÇA C/PREGA BÁSICO", "CALÇA C/PRINT", "CALÇA C/PUNHO", "CALÇA C/RISCAS", "CALÇA C/SARJA", "CALÇA C/VINCO", "CALÇA CAMBRAIA /CINT", "CALÇA CAMBRAIA/CROPD", "CALÇA CAMURÇA ELAST", "CALÇA CAV/C BOTÃO", "CALÇA CETIM", "CALÇA CETIM BÁSICO", "CALÇA CETIM C LANTEJOULAS", "CALÇA CETIM C LEOPARDO", "CALÇA CETIM ESTAMPADO", "CALÇA CETIM PADRÃO", "CALÇA CETIM RISCAS", "CALÇA CLASS/ALGODÃO", "CALÇA CLASSIC BÁSICO", "CALÇA CLASSIC C/BOTÃO", "CALÇA CLASSICA BOTÃO", "CALÇA CLASSICA BÁSICO", "CALÇA COMPRIDA BÁSICO", "CALÇA COMPRIDA-RISCAS", "CALÇA COMPRIDA/TAXA", "CALÇA COMPRIDA/TRANSP", "CALÇA COS 2 BOTÃO", "CALÇA COS ALGODÃO", "CALÇA COS FRANZIDA", "CALÇA CROSS POLIPELE", "CALÇA CURTA RISCAS", "CALÇA DESPORT/COMPRIDA", "CALÇA ELASTIC/RISCAS", "CALÇA ESTAMPADO", "CALÇA ESTAMPADO/FLORES", "CALÇA F/ BÁSICO", "CALÇA FINO ESTAMPADO", "CALÇA GEOMÉTRICO", "CALÇA HOEME LINHO", "CALÇA HOMEM IMIT LINHO", "CALÇA HOMEM LINHO", "CALÇA IMIT LINHO", "CALÇA IMIT LINHO RISCAS", "CALÇA IMPRIM FLORES", "CALÇA IMT/CAMBRAIA", "CALÇA INT CAMBRAIA", "CALÇA JEANS APLICAÇÃO", "CALÇA JEANS BOTÃO", "CALÇA JEANS C/BOTÃO", "CALÇA JEANS FLORES", "CALÇA JEANS LEOPARDO", "CALÇA JEANS PÉROLAS", "CALÇA JUSTA BRILHO", "CALÇA LANTEJOULAS", "CALÇA LARG ESTAMPADO", "CALÇA LARG/RISCAS", "CALÇA LARGA /COMPRIDA", "CALÇA LARGA ALGODÃO", "CALÇA LARGA BÁSICO", "CALÇA LARGA ESTAMPADO", "CALÇA LEGGING APLICAÇÃO", "CALÇA LEGGING BÁSICO", "CALÇA LEGGING FLORES", "CALÇA LEGGING LANTEJOULAS", "CALÇA LEGGING RISCAS", "CALÇA LEGGING SARJA", "CALÇA LEGGUING BÁSICO", "CALÇA LEOPARDO", "CALÇA LEOPARDO LANTEJOULAS", "CALÇA LICRA PLISSADA", "CALÇA LINHO", "CALÇA LINHO COS ALGODÃO", "CALÇA LINHO PROM", "CALÇA LINHO RISCAS", "CALÇA LUREX LEOPARDO", "CALÇA MAGICA APLICAÇÃO", "CALÇA MAGICA METALIZADO", "CALÇA MAGICVA BRILHO", "CALÇA MALHA FRIA BÁSICO", "CALÇA MALHA METALIZADO", "CALÇA MALHA PADRÃO", "CALÇA MALHA RISCAS", "CALÇA MEIA BÁSICO", "CALÇA METALIZADO", "CALÇA MODA BRILHO", "CALÇA MUSSELINA", "CALÇA MUSSELINA/PRINT", "CALÇA NAPA", "CALÇA NAPA C LANTEJOULAS", "CALÇA PADRÃO", "CALÇA PADRÃO C BOLSO", "CALÇA PADRÃO ÉTNICA", "CALÇA PANTALONA CETIM", "CALÇA PANTALONA FELPA BÁSICO", "CALÇA PANTALONA FELPA FRANJAS LATERAL", "CALÇA PANTALONA FRANJAS LATERAL", "CALÇA PANTALONA IMIT LINHO", "CALÇA PANTALONA JOGGING BÁSICO", "CALÇA PANTALONA LINHO", "CALÇA PANTALONA LUREX DEGRADÊ", "CALÇA PANTALONE TECIDO", "CALÇA PERNA FRANZIDA", "CALÇA PESSEGO LANTEJOULAS", "CALÇA PLISSADA", "CALÇA POLIPELE", "CALÇA POLIPELE DOURADA", "CALÇA POPELINE", "CALÇA PREGAS BÁSICO", "CALÇA PRINT ALGODÃO", "CALÇA PRINT BRILHO", "CALÇA PRINT CAMURÇA", "CALÇA PRINT DOURADO", "CALÇA PRINT FLORES", "CALÇA PRINT FLORES PQ", "CALÇA PRINT LEOPARDO", "CALÇA PRINT PLISSADA", "CALÇA PRINT ÉTNICA", "CALÇA PUNHO ALGODÃO", "CALÇA PÉROLAS", "CALÇA RISCAS", "CALÇA RISCAS ALGODÃO", "CALÇA RISCAS BARRA", "CALÇA RISCAS BRILH", "CALÇA RISCAS C CINT", "CALÇA RISCAS CINTO", "CALÇA RISCAS CLASSIC", "CALÇA RISCAS CROPD", "CALÇA RISCAS CROPED", "CALÇA RISCAS FINA", "CALÇA RISCAS JEANS", "CALÇA RISCAS LARGA", "CALÇA RISCAS LUREX", "CALÇA RISCAS MULTI", "CALÇA RISCAS MULTICOLOR", "CALÇA RISCAS PRINT", "CALÇA RISCAS T/GRD", "CALÇA RISCAS/GEOM", "CALÇA SARJA", "CALÇA SARJA BRC", "CALÇA SARJA PRINT ANIMAL", "CALÇA SARJA WHIT", "CALÇA SARJA.C/PUNHO", "CALÇA SARJA/BÁSICO", "CALÇA SARJA/CHINO", "CALÇA SARJA/CLOR", "CALÇA SARJA/PREG", "CALÇA SARJA/SLIM", "CALÇA SEDA", "CALÇA SEDA-COS ALGODÃO", "CALÇA SHAKKAR RISCAS", "CALÇA SHANKAR ALGODÃO", "CALÇA SHANKKAR BOTÃO", "CALÇA SLIM BÁSICO", "CALÇA SLIM LEOPARDO", "CALÇA STRAIGHT LINHO", "CALÇA TECIDO", "CALÇA TECIDO BÁSICO", "CALÇA TECIDO C CINTO", "CALÇA TECIDO ENRRUGADO", "CALÇA TECIDO GEOMETRICO", "CALÇA TECIDO LANTEJOULAS", "CALÇA TECIDO LIMIT LINHO", "CALÇA TECIDO LINHO", "CALÇA TECIDO PRINT", "CALÇA TECIDO PUSH UP", "CALÇA TECIDO RUG", "CALÇA TECIDO TECN", "CALÇA TECIDO TECNIC", "CALÇA TECIDO-BAS", "CALÇA TECIDO/FRANZ", "CALÇA TENS BOTÃO", "CALÇA TWILL BÁSICO", "CALÇA VELUDO LEOPARDO", "CALÇA VELUDO RISCAS", "CALÇA ÉTNICA", "CALÇA ÉTNICA C/PUNHO", "CALÇAS POPELINE C CINTO", "CALÇÃO ALGODÃO", "CALÇÃO ALGODÃO CARGO", "CALÇÃO ALGODÃO RISCAS", "CALÇÃO ALGODÃO/C-FIOS", "CALÇÃO ALGODÃO/DESPORT", "CALÇÃO APLICAÇÃO", "CALÇÃO BOMBAZINE", "CALÇÃO BOTÃO", "CALÇÃO BÁSICO", "CALÇÃO BÁSICO HOMEM", "CALÇÃO BÁSICO POPELINE", "CALÇÃO C APLICAÇÃO", "CALÇÃO C BOTÃO", "CALÇÃO C/APLICAÇÃO", "CALÇÃO C/BOTÃO", "CALÇÃO C/BRILHO", "CALÇÃO C/CINTO", "CALÇÃO C/CINTO METAL", "CALÇÃO C/FLORES", "CALÇÃO C/ILHOS", "CALÇÃO C/LAÇO", "CALÇÃO C/LEOPARDO", "CALÇÃO C/SUSPENSO", "CALÇÃO COS ALGODÃO", "CALÇÃO CROCHET/TECIDO", "CALÇÃO ESTAMPADO", "CALÇÃO ESTAMPADO FLORES", "CALÇÃO FIO DOURADO", "CALÇÃO FLORES", "CALÇÃO FRANJAS", "CALÇÃO HOMEM RISCAS", "CALÇÃO HOMEM TECIDO", "CALÇÃO LANTEJOULAS", "CALÇÃO LINHO", "CALÇÃO POLIPELE", "CALÇÃO POPELINE", "CALÇÃO POPELINE BÁSICO", "CALÇÃO PRAIA BÁSICO HOMEM", "CALÇÃO PRINT FLORES", "CALÇÃO RENDA DEGRADÊ", "CALÇÃO RISCAS", "CALÇÃO RISCAS C/CINTO", "CALÇÃO RISCAS C/ELASTIC", "CALÇÃO RISCAS COLOR", "CALÇÃO RISCAS DOUR", "CALÇÃO RISCAS HOMEM", "CALÇÃO SARJA", "CALÇÃO SEDA-COS ALGODÃO", "CALÇÃO SEDA/CTR", "CALÇÃO SUBIDO C/BOTÃO", "CALÇÃO TECIDO", "CALÇÃO TWILL ESTAMPADO", "CALÇÃO ÉTNICA", "CAMBRAIA/CASACO", "CAMISA / BLUSÃO LANTEJOULAS", "CAMISA ALGODÃO BORDADO", "CAMISA ALGODÃO CURTA", "CAMISA ALGODÃO GOLA MAO", "CAMISA ALGODÃO HOM", "CAMISA ALGODÃO RISCAS", "CAMISA ALGODÃO RISCAS FINA", "CAMISA ALGODÃO/BOTÃO", "CAMISA APLIC/LANTEJOULAS", "CAMISA APLICAÇÃO", "CAMISA ASA LANTEJOULAS", "CAMISA BOMBAZINE", "CAMISA BORDADO", "CAMISA BOTÃO", "CAMISA BOTÃO DOR", "CAMISA BOXY ESTAMPADO", "CAMISA BÁSICO", "CAMISA BÁSICO CETIM", "CAMISA BÁSICO H", "CAMISA BÁSICO HOM", "CAMISA BÁSICO M CURTA", "CAMISA BÁSICO M/C", "CAMISA BÁSICO OVER", "CAMISA BÁSICO OXFORD", "CAMISA BÁSICO QUADROS", "CAMISA BÁSICO SENHORA", "CAMISA C BORDADO", "CAMISA C BRILHO", "CAMISA C/APLICAÇÃO", "CAMISA C/BOTÃO COSTA", "CAMISA C/FRONCE", "CAMISA C/PLISSADO", "CAMISA CAMBRAIA", "CAMISA COMPRIDA/PENAS", "CAMISA CUELLO BOBO ESTAMPADO", "CAMISA DEGRADÊ", "CAMISA ESTAMPADO", "CAMISA ESTAMPADO CRUZADA", "CAMISA ESTAMPADO TAXAS", "CAMISA ESTAMPADO VOILE", "CAMISA FLORES", "CAMISA FLORES M/CTR", "CAMISA FLUIDA BOTÃO", "CAMISA H RISCAS", "CAMISA H RISCAS FINA", "CAMISA HOMEM ALGODÃO", "CAMISA HOMEM RISCAS", "CAMISA HOMEM RISCAS LARG", "CAMISA IMP/LEOPARDO", "CAMISA JEANS BORDADO", "CAMISA JEANS RISCAS", "CAMISA LISA ALGODÃO", "CAMISA LISTRADA C BORDADO", "CAMISA LYOCELL ESTAMPADO", "CAMISA M COMPRIDA", "CAMISA M/C ESTAMPADO", "CAMISA M/COMPRIDA", "CAMISA M/L ESTAMPADO", "CAMISA METALIZADO", "CAMISA OVERSIZE BORDADO", "CAMISA PADRÃO VARIOS", "CAMISA POPELINE", "CAMISA POPELINE PRINT", "CAMISA PRINT APLICAÇÃO", "CAMISA PRINT FLORES", "CAMISA RISCAS", "CAMISA RISCAS C BRILHO", "CAMISA RISCAS DISN", "CAMISA RISCAS FINA", "CAMISA RISCAS LARGA", "CAMISA RISCAS OXFOR", "CAMISA RISCAS/MALHA", "CAMISA TECIDO BORDADO", "CAMISA VOILE ESTAMPADO", "CAMISA XADREZ", "CAMISEIRO ALGODÃO", "CAMISEIRO BOTÃO", "CAMISEIRO BOTÃO M/PRL", "CAMISEIRO BÁSICO", "CAMISEIRO BÁSICO BOLSO", "CAMISEIRO BÁSICO COMPRIDA", "CAMISEIRO C APLICAÇÃO", "CAMISEIRO C ESTAMPADO", "CAMISEIRO C/BOTÃO", "CAMISEIRO C/VIVO", "CAMISEIRO CETIM", "CAMISEIRO COMPRIDA", "CAMISEIRO COMPRIDA LINHO RISCAS", "CAMISEIRO COMPRIDA-RISCAS", "CAMISEIRO COMPRIDA/2RACHAS", "CAMISEIRO COMPRIDA/JEANS", "CAMISEIRO COMPRIDA/PRINT", "CAMISEIRO DEGRADÊ", "CAMISEIRO ESTAMPADO", "CAMISEIRO FLORES", "CAMISEIRO LINHO", "CAMISEIRO LINHO RISCAS", "CAMISEIRO M/COMPRIDA", "CAMISEIRO M/COMPRIDA FLORES", "CAMISEIRO PADRÃO", "CAMISEIRO POPELINE", "CAMISEIRO PRINT COMPRIDA", "CAMISEIRO PUNHO LANTEJOULAS", "CAMISEIRO RISCAS", "CAMISETA ASSIMÉTRICA", "CAMISETA BAILARINA ESTAMPADO", "CAMISETA BOTÃO", "CAMISETA BÁSICO", "CAMISETA C/FLECOS", "CAMISETA C/LAÇO", "CAMISETA COLEGE ESTAMPADO", "CAMISETA DEGRADÊ", "CAMISETA ESTAMPADO", "CAMISETA ESTAMPADO MOTORCYC", "CAMISETA ESTAMPADO POSICIONAL", "CAMISETA ESTAMPADO POSICIONAL FLORES", "CAMISETA ESTAMPADO POSSICIONAL", "CAMISETA LARGA CORDÃO", "CAMISETA OVERSIZE ASSIMÉTRICA", "CAMISETA TIRANTES BÁSICO", "CAMISETA TIRANTES ESTAMPADO", "CAMISETA ÉTNICA GYM", "CAMISOLA +TOP LANTEJOULAS", "CAMISOLA 1 BOTÃO", "CAMISOLA 2 BOTÃO", "CAMISOLA 2 BOTÃO MG", "CAMISOLA 2 FACE LEOPARDO", "CAMISOLA 2 TECIDO", "CAMISOLA 2B/RISCAS", "CAMISOLA 3 LAÇO", "CAMISOLA ALGODÃO", "CAMISOLA ALGODÃO FOLHO", "CAMISOLA ALGODÃO PRINT", "CAMISOLA ALGODÃO VELUDO", "CAMISOLA ALGODÃO/C-BORDADO", "CAMISOLA ALGODÃO/C-BOT", "CAMISOLA ALGODÃO/FOLHO", "CAMISOLA ALGODÃO/LARGA", "CAMISOLA APLICAÇÃO", "CAMISOLA ASA BOTÃO", "CAMISOLA ASA BÁSICO", "CAMISOLA ASA COMPRIDA", "CAMISOLA ASA LANTEJOULAS", "CAMISOLA ASA M/COMPRIDA", "CAMISOLA ASA RISCAS", "CAMISOLA ASA RISCAS/CASH", "CAMISOLA ASA/RISCAS", "CAMISOLA ASSIMÉTRICA", "CAMISOLA ASSIMÉTRICA/CINTO", "CAMISOLA BARC-BÁSICO", "CAMISOLA BARC-C/CINTO", "CAMISOLA BARC/BÁSICO", "CAMISOLA BARC/RISCAS", "CAMISOLA BARCA BÁSICO", "CAMISOLA BARCA C/BOTÃO", "CAMISOLA BARCA COMPRIDA", "CAMISOLA BARCA COMPRIDA/", "CAMISOLA BARCA RISCAS", "CAMISOLA BICO BÁSICO", "CAMISOLA BICO C/FECHO", "CAMISOLA BICO C/RISCAS", "CAMISOLA BICO ESTAMPADO", "CAMISOLA BICO RISCAS", "CAMISOLA BICO RISCAS LG", "CAMISOLA BOLSO APLICAÇÃO", "CAMISOLA BOLSO CAMBRAIA", "CAMISOLA BOLSO LANTEJOULAS", "CAMISOLA BOLSO NAPA", "CAMISOLA BOLSO/VIVO NAPA", "CAMISOLA BORBOLETA", "CAMISOLA BORDADO", "CAMISOLA BORDADO/ GOLA", "CAMISOLA BORDADO/ING-ELAST", "CAMISOLA BORDADO/LEOPARDO", "CAMISOLA BOTÃO", "CAMISOLA BOTÃO COS", "CAMISOLA BOTÃO COST", "CAMISOLA BOTÃO COSTA", "CAMISOLA BOTÃO MANG", "CAMISOLA BOTÃO MANGA", "CAMISOLA BOTÃO MG", "CAMISOLA BOTÃO TRAZ", "CAMISOLA BOTÃO+LAC", "CAMISOLA BRILHO", "CAMISOLA BÁSICO", "CAMISOLA BÁSICO 3/4", "CAMISOLA BÁSICO ASA", "CAMISOLA BÁSICO BAB", "CAMISOLA BÁSICO BARCA", "CAMISOLA BÁSICO BICO", "CAMISOLA BÁSICO BOTÃO DOURADO", "CAMISOLA BÁSICO C/CINTO", "CAMISOLA BÁSICO C/ELASTIC", "CAMISOLA BÁSICO C/NO", "CAMISOLA BÁSICO C/TAXAS", "CAMISOLA BÁSICO C/VIVO", "CAMISOLA BÁSICO CTR", "CAMISOLA BÁSICO DC/RD", "CAMISOLA BÁSICO DCT/RED", "CAMISOLA BÁSICO DEC/RD", "CAMISOLA BÁSICO DECOTE", "CAMISOLA BÁSICO FINA", "CAMISOLA BÁSICO FIO", "CAMISOLA BÁSICO FOLH", "CAMISOLA BÁSICO GOLA", "CAMISOLA BÁSICO GOLA CTR", "CAMISOLA BÁSICO LARGA", "CAMISOLA BÁSICO LUREX", "CAMISOLA BÁSICO M-3/4", "CAMISOLA BÁSICO M/CAVA", "CAMISOLA BÁSICO M/COMPRIDA", "CAMISOLA BÁSICO M/CTR", "CAMISOLA BÁSICO M/CURTA", "CAMISOLA BÁSICO M3/4", "CAMISOLA BÁSICO MALHA", "CAMISOLA BÁSICO MG 3/4", "CAMISOLA BÁSICO MG3/4", "CAMISOLA BÁSICO QUADRAD", "CAMISOLA BÁSICO ROND", "CAMISOLA BÁSICO T/GRD", "CAMISOLA BÁSICO TGR", "CAMISOLA BÁSICO TROC", "CAMISOLA BÁSICO V", "CAMISOLA BÁSICO VIVI", "CAMISOLA BÁSICO/BAB", "CAMISOLA BÁSICO/FIO", "CAMISOLA BÁSICO/M/COMPRIDA", "CAMISOLA BÁSICO/VIVO", "CAMISOLA C APLICAÇÃO", "CAMISOLA C BOTÃO", "CAMISOLA C BOTÃO FLORES", "CAMISOLA C BOTÃO/NO", "CAMISOLA C BRILHO", "CAMISOLA C LANTEJOULAS", "CAMISOLA C PÉROLAS", "CAMISOLA C TECIDO", "CAMISOLA C/2 BOTÃO", "CAMISOLA C/ALSA", "CAMISOLA C/APLICAÇÃO", "CAMISOLA C/APLICAÇÃO-TRAZ", "CAMISOLA C/BORBOLETA", "CAMISOLA C/BOTÃO", "CAMISOLA C/BOTÃO DOR", "CAMISOLA C/BOTÃO GOLA", "CAMISOLA C/BOTÃO LAVAGEM", "CAMISOLA C/BOTÃO MANG", "CAMISOLA C/BRILHO", "CAMISOLA C/BRILHO M/COMPRIDA", "CAMISOLA C/CACHECOL", "CAMISOLA C/CROCHET", "CAMISOLA C/DOURADO", "CAMISOLA C/ESTAMPADO", "CAMISOLA C/FLORES MALHA", "CAMISOLA C/LANTEJOULAS", "CAMISOLA C/LAÇO", "CAMISOLA C/MALHA", "CAMISOLA C/NAPA", "CAMISOLA C/PADRÃO", "CAMISOLA C/PLISSADA", "CAMISOLA C/PÉROLAS", "CAMISOLA C/TECIDO", "CAMISOLA CANELADO M/COMPRIDA", "CAMISOLA CAVA C/BOTÃO", "CAMISOLA CAVA C/COS", "CAMISOLA CETIM/VIVO", "CAMISOLA CHUMASSO NAPA", "CAMISOLA COMPRIDA", "CAMISOLA COMPRIDA BARC", "CAMISOLA COMPRIDA-PRINT", "CAMISOLA COMPRIDA/ATRAZ", "CAMISOLA COMPRIDA/LARG", "CAMISOLA COMPRIDA/MESCLA", "CAMISOLA COMPRIDA/MG-FRANZ", "CAMISOLA CORACAO LANTEJOULAS", "CAMISOLA COS FRANZIDA", "CAMISOLA COS RISCAS", "CAMISOLA COS/ ALGODÃO", "CAMISOLA COS/ALGODÃO", "CAMISOLA CROCHET COMPRIDA", "CAMISOLA CROCHET DEGRADÊ", "CAMISOLA CROPED LANTEJOULAS", "CAMISOLA CTR RISCAS", "CAMISOLA CURTA ALGODÃO", "CAMISOLA D/RD DEGRADÊ", "CAMISOLA DE MALHA ALGODÃO", "CAMISOLA DE MALHA BRILHO", "CAMISOLA DE MALHA BÁSICO", "CAMISOLA DE MALHA FLORES", "CAMISOLA DE MALHA MAGA FLORES JEANS", "CAMISOLA DE MALHA PÉROLAS", "CAMISOLA DEGRADÊ", "CAMISOLA ELASTIC/FLORES", "CAMISOLA ELASTICO M/COMPRIDA", "CAMISOLA ESTAMPADO", "CAMISOLA ESTAMPADO-FLORES", "CAMISOLA ESTAMPADO/FACE", "CAMISOLA ESTAMPADO/FRANZIDA", "CAMISOLA ESTAMPADO/GOLA", "CAMISOLA ESTAMPADO/PAV", "CAMISOLA ESTAMPADO/RENDA", "CAMISOLA ESTAMPADO/TGR", "CAMISOLA ESTAMPADO/TIGER", "CAMISOLA FIO /LANTEJOULAS", "CAMISOLA FIO DOURADO", "CAMISOLA FIOS DOURADO", "CAMISOLA FLORES", "CAMISOLA FLORES M/COMPRIDA", "CAMISOLA FRANJAS", "CAMISOLA FRANZIDA", "CAMISOLA G/RISCAS", "CAMISOLA GEOMÉTRICO", "CAMISOLA GOLA BOTÃO", "CAMISOLA GOLA BRILHO", "CAMISOLA GOLA BÁSICO", "CAMISOLA GOLA DEGRADÊ", "CAMISOLA GOLA DOURADO", "CAMISOLA GOLA LEOPARDO", "CAMISOLA GOLA M/COMPRIDA", "CAMISOLA GOLA M/CTR BÁSICO", "CAMISOLA GOLA RISCAS", "CAMISOLA GOLAO PADRÃO", "CAMISOLA HOMEM BÁSICO", "CAMISOLA IMT/CAMBRAIA", "CAMISOLA LANTEJOULAS", "CAMISOLA LANTEJOULAS MANG", "CAMISOLA LANTEJOULAS/PET", "CAMISOLA LARG ALGODÃO", "CAMISOLA LAÇO", "CAMISOLA LAÇO ASA", "CAMISOLA LAÇO FRENTE", "CAMISOLA LAÇO LADO", "CAMISOLA LAÇO NAPA", "CAMISOLA LEOPARDO", "CAMISOLA LEOPARDO C LANTEJOULAS", "CAMISOLA LEOPARDO C/CINTO", "CAMISOLA LEOPARDO/C-CINTO", "CAMISOLA LEOPARDO/CAVA-COS", "CAMISOLA LEOPARDO/COLORS", "CAMISOLA LEOPARDO/ELASTIC", "CAMISOLA LEOPARDO/M-CTR", "CAMISOLA LEOPARDO/VIVO", "CAMISOLA LICRA ESTAMPADO", "CAMISOLA LINHO BÁSICO", "CAMISOLA LINHO RISCAS", "CAMISOLA LUREX FLORES", "CAMISOLA M 3/4 BÁSICO", "CAMISOLA M/C/BÁSICO", "CAMISOLA M/COMPRIDA", "CAMISOLA M/COMPRIDA GRD", "CAMISOLA M/COMPRIDA MANCH", "CAMISOLA M/COMPRIDA XADREZ", "CAMISOLA M/COMPRIDA-C/LAC", "CAMISOLA M/COMPRIDA-CASCH", "CAMISOLA M/COMPRIDA-FLORES", "CAMISOLA M/COMPRIDA-GOLA", "CAMISOLA M/COMPRIDA-PRINT", "CAMISOLA M/COMPRIDA-PUNH", "CAMISOLA M/COMPRIDA-RELEVO", "CAMISOLA M/COMPRIDA. GOLA", "CAMISOLA M/COMPRIDA/PRINT", "CAMISOLA M/CTR C-LAÇO", "CAMISOLA MALHA 2 BOTÃO", "CAMISOLA MALHA 3 RISCAS", "CAMISOLA MALHA ALGODÃO", "CAMISOLA MALHA APLICAÇÃO", "CAMISOLA MALHA ASSIMÉTRICA", "CAMISOLA MALHA BICO BÁSICO", "CAMISOLA MALHA BOTÃO", "CAMISOLA MALHA BRILHO", "CAMISOLA MALHA BÁSICO", "CAMISOLA MALHA BÁSICO G", "CAMISOLA MALHA BÁSICO P", "CAMISOLA MALHA C APLICAÇÃO", "CAMISOLA MALHA C FLORES", "CAMISOLA MALHA C/BOTÃO", "CAMISOLA MALHA C/BOTÃO PQ", "CAMISOLA MALHA C/BRILHO", "CAMISOLA MALHA C/LANTEJOULAS", "CAMISOLA MALHA C/TECIDO", "CAMISOLA MALHA COMPRIDA", "CAMISOLA MALHA ESTAMPADO", "CAMISOLA MALHA FLORES", "CAMISOLA MALHA LANTEJOULAS", "CAMISOLA MALHA LINHO", "CAMISOLA MALHA M/COMPRIDA", "CAMISOLA MALHA RISCAS", "CAMISOLA MANCHA RISCAS", "CAMISOLA MANG APLICAÇÃO", "CAMISOLA MANGA COMPRIDA", "CAMISOLA MANGA COMPRIDA.", "CAMISOLA MANGA COMPRIDA/", "CAMISOLA MANGA FLORES", "CAMISOLA MC - FLORES", "CAMISOLA MG FRANZIDA", "CAMISOLA MG/COMPRIDA", "CAMISOLA MG/FRANZIDA", "CAMISOLA MUSSELINA M/CV", "CAMISOLA MUSSELINA/COS ALGODÃO", "CAMISOLA MUSSELINA/PRINT", "CAMISOLA NAD BÁSICO", "CAMISOLA OLHO LANTEJOULAS", "CAMISOLA OMBRO /FLORES", "CAMISOLA OMBRO FLORES", "CAMISOLA OMBRO M/COMPRIDA", "CAMISOLA PADRÃO", "CAMISOLA PAZ LANTEJOULAS", "CAMISOLA PLISSADA", "CAMISOLA PREGAS M/COMPRIDA", "CAMISOLA PRINT BORBOLETA", "CAMISOLA PRINT COMPRIDA", "CAMISOLA PRINT FLORES", "CAMISOLA PRINT FLORES GRD", "CAMISOLA PRINT FLORES PQ", "CAMISOLA PRINT FRANZIDA", "CAMISOLA PRINT LANTEJOULAS", "CAMISOLA PRINT LEOPARDO", "CAMISOLA PRINT M/COMPRIDA", "CAMISOLA PRINT ÉTNICA", "CAMISOLA PRINT/FLORES", "CAMISOLA PUMP/LANTEJOULAS", "CAMISOLA RENDA DEGRADÊ", "CAMISOLA RENDA FLORES", "CAMISOLA RENDA M/COMPRIDA", "CAMISOLA RENDA+TOP BÁSICO", "CAMISOLA RISCAS", "CAMISOLA RISCAS /ESTAMPADO", "CAMISOLA RISCAS /GOLA", "CAMISOLA RISCAS ASA", "CAMISOLA RISCAS B", "CAMISOLA RISCAS BICO", "CAMISOLA RISCAS BÁSICO", "CAMISOLA RISCAS C BRILHO", "CAMISOLA RISCAS C DOURADO", "CAMISOLA RISCAS C/CETI", "CAMISOLA RISCAS C/CINT/MH", "CAMISOLA RISCAS C/CINTO", "CAMISOLA RISCAS C/LAÇO", "CAMISOLA RISCAS C/NO", "CAMISOLA RISCAS CAMIS", "CAMISOLA RISCAS CINT", "CAMISOLA RISCAS CINTO", "CAMISOLA RISCAS CORACAO", "CAMISOLA RISCAS CURTA", "CAMISOLA RISCAS D/BICO", "CAMISOLA RISCAS D/ROND", "CAMISOLA RISCAS FINA", "CAMISOLA RISCAS FLORES", "CAMISOLA RISCAS FLUOR", "CAMISOLA RISCAS GOLA", "CAMISOLA RISCAS LARG", "CAMISOLA RISCAS LARGA", "CAMISOLA RISCAS LUREX", "CAMISOLA RISCAS LX", "CAMISOLA RISCAS M/CTR", "CAMISOLA RISCAS MALHA", "CAMISOLA RISCAS MEDIA", "CAMISOLA RISCAS NERVURA", "CAMISOLA RISCAS PELO", "CAMISOLA RISCAS PRINT", "CAMISOLA RISCAS S/OMBRO", "CAMISOLA RISCAS TRANSP", "CAMISOLA RISCAS TRANSPARENT", "CAMISOLA RISCAS V", "CAMISOLA RISCAS ZIG", "CAMISOLA RISCAS+COLETE", "CAMISOLA RISCAS+TOP", "CAMISOLA SEDA-C/KAI", "CAMISOLA TAXAS M/COMPRIDA", "CAMISOLA TECIDO/COMBI", "CAMISOLA TECIDO/DEC", "CAMISOLA TRACADA-M/COMPRIDA", "CAMISOLA TRACAR LEOPARDO", "CAMISOLA TÚNICA RISCAS", "CAMISOLA V-LANTEJOULAS", "CAMISOLA VIVO POLIPELE", "CAMISOLA VIVO/CETIM", "CAMISOLA/APLICAÇÃO", "CAMISOLA/CASACO ESTAMPADO", "CAMISOLA/LANTEJOULAS", "CARTEIRA ESTAMPADO", "CASACO 1 BOTÃO", "CASACO 3 BOTÃO", "CASACO ABERT/ALGODÃO", "CASACO ABERTO ALGODÃO", "CASACO ABERTO COMPRIDA", "CASACO ALGODÃO", "CASACO ALGODÃO BOLSO", "CASACO ALGODÃO BRILHO", "CASACO ALGODÃO OVERSIZE", "CASACO ALGODÃO RENDA", "CASACO ALGODÃO-BÁSICO", "CASACO ALGODÃO/BÁSICO", "CASACO ALGODÃO/FL", "CASACO ALGODÃO/ITALIA", "CASACO ALGODÃO/PRINT-FLORES", "CASACO APLICAÇÃO", "CASACO ASA BÁSICO", "CASACO ASA SEDA", "CASACO BARRA BRILHO", "CASACO BICO BÁSICO", "CASACO BICO COMPRIDA-MALHA", "CASACO BICO COMPRIDA/", "CASACO BICOS BÁSICO", "CASACO BICOS COMPRIDA", "CASACO BOLERO BÁSICO", "CASACO BOMBER BRILHO", "CASACO BOMBER RISCAS", "CASACO BOTÃO", "CASACO BOTÃO 3/4", "CASACO BOTÃO BOLSO", "CASACO BOTÃO BRILH", "CASACO BOTÃO DOUR", "CASACO BOTÃO GRANDE", "CASACO BOTÃO MILITAR", "CASACO BOTÃO/TRANÇA", "CASACO BRILHO", "CASACO BÁSICO", "CASACO BÁSICO 3 BOTÃO", "CASACO BÁSICO 3/4", "CASACO BÁSICO BICO", "CASACO BÁSICO BICOS", "CASACO BÁSICO C/APLIQU", "CASACO BÁSICO C/LAÇO", "CASACO BÁSICO COMPRIDA", "CASACO BÁSICO DEC/RED", "CASACO BÁSICO FIO", "CASACO BÁSICO HOMEM", "CASACO BÁSICO M/L", "CASACO BÁSICO MANGA-PRS", "CASACO BÁSICO OVERSIZE", "CASACO BÁSICO T-GRD", "CASACO BÁSICO T/GRD", "CASACO BÁSICO TENN", "CASACO BÁSICO TENNE", "CASACO BÁSICO TROCID", "CASACO BÁSICO ZIP", "CASACO BÁSICO-C/BOLSO", "CASACO BÁSICO/BOLSO", "CASACO BÁSICO/COMPRIDA", "CASACO C APLICAÇÃO", "CASACO C APLICAÇÃO JEANS", "CASACO C BOTÃO", "CASACO C BRILHO", "CASACO C FLORES", "CASACO C LANTEJOULAS", "CASACO C PÉROLAS", "CASACO C/APLICAÇÃO", "CASACO C/APLICAÇÃO-MANG", "CASACO C/BLUSA", "CASACO C/BLUSA LEOPARDO", "CASACO C/BOLSO", "CASACO C/BOLSOS", "CASACO C/BOTÃO", "CASACO C/BOTÃO GRD", "CASACO C/CAMBRAIA-ESTAMPADO", "CASACO C/CAMBRAIA-PRINT", "CASACO C/CAPUZ ALGODÃO", "CASACO C/CINTO", "CASACO C/DOURADO", "CASACO C/FECHO", "CASACO C/FLORES", "CASACO C/FRANJAS", "CASACO C/GOLA", "CASACO C/LANTEJOULAS", "CASACO C/LAÇO", "CASACO C/LOREX", "CASACO C/MALHA", "CASACO C/MISSANGA", "CASACO C/NAPA", "CASACO C/PELO", "CASACO C/PELO GL", "CASACO C/RENDA", "CASACO C/VIVO NAPA", "CASACO C/ZIP -NAPA", "CASACO CAMBRAIA /MANGA", "CASACO CAMBRAIA/FRANJAS", "CASACO CAPUZ RISCAS", "CASACO CETIM BOTÃO", "CASACO CETIM LEOPARDO", "CASACO CHANEL C/PÉROLAS", "CASACO COMPRIDA", "CASACO COMPRIDA /BOTÃO", "CASACO COMPRIDA /CAPUZ", "CASACO COMPRIDA BOTÃO", "CASACO COMPRIDA BÁSICO", "CASACO COMPRIDA C/BOLSO", "CASACO COMPRIDA C/BOTÃO", "CASACO COMPRIDA CROCHET", "CASACO COMPRIDA GEOM", "CASACO COMPRIDA LINHO", "CASACO COMPRIDA LISO", "CASACO COMPRIDA M/CTR", "CASACO COMPRIDA MALHA", "CASACO COMPRIDA MALHA ABRT", "CASACO COMPRIDA MESCL", "CASACO COMPRIDA MOHAIR", "CASACO COMPRIDA PEL/OVELH", "CASACO COMPRIDA RENDA", "CASACO COMPRIDA RISCAS", "CASACO COMPRIDA XD", "CASACO COMPRIDA-2BOT", "CASACO COMPRIDA-CFLOR", "CASACO COMPRIDA-M 3/4", "CASACO COMPRIDA/ CAPUZ", "CASACO COMPRIDA/ FELTRO", "CASACO COMPRIDA/2 BOTÃO", "CASACO COMPRIDA/ALGODÃO", "CASACO COMPRIDA/BC-CINTO", "CASACO COMPRIDA/BICOS", "CASACO COMPRIDA/BICOS CAN", "CASACO COMPRIDA/BOLSO", "CASACO COMPRIDA/BOLSOS", "CASACO COMPRIDA/BÁSICO", "CASACO COMPRIDA/C-APLI", "CASACO COMPRIDA/C-PRESILH", "CASACO COMPRIDA/C/CINTO", "CASACO COMPRIDA/CAPUZ PELO", "CASACO COMPRIDA/CINTO", "CASACO COMPRIDA/FLH", "CASACO COMPRIDA/FLORES", "CASACO COMPRIDA/G-PELO", "CASACO COMPRIDA/LAC", "CASACO COMPRIDA/LAÇO", "CASACO COMPRIDA/MALHA", "CASACO COMPRIDA/NYLON", "CASACO COMPRIDA/PELO", "CASACO COMPRIDA/S-MANG", "CASACO CTR PRINT FLORES", "CASACO CURTO 2 BOTÃO", "CASACO CURTO FLORES GRD", "CASACO CURTO LANTEJOULAS", "CASACO CURTO RISCAS", "CASACO DEGRADÊ", "CASACO DESPORTIVO FLORES", "CASACO DESPORTIVO LEOPARDO", "CASACO DOBLE FACE LEOPARDO", "CASACO ESTAMPADO", "CASACO ETNICO FRANJAS", "CASACO FELPA ESTAMPADO", "CASACO FELT/COMPRIDA", "CASACO FELTRO BOTÃO MET", "CASACO FINO COMPRIDA", "CASACO FLT-XADREZ", "CASACO FRANJAS", "CASACO FRANJAS PESSEGO", "CASACO FRANZIDA", "CASACO GABARDINE APLICAÇÃO", "CASACO GANGA C/CAPUZ", "CASACO GOLA SEDA", "CASACO GRD/C-BOTÃO", "CASACO IMIT/CAMBRAIA", "CASACO IMITA CAMBRAIA", "CASACO IMS CAMBRAIA CRUZ", "CASACO IMT CAMBRAIA", "CASACO IMT CAMURÇA", "CASACO IMT/CAMBRAIA", "CASACO IMT/CAMBRAIA -PELO", "CASACO JEANS C/BRILHO", "CASACO KIMONO BRILHO", "CASACO LAHA COMPRIDA", "CASACO LANTEJOULAS", "CASACO LANTEJOULAS BORDADO", "CASACO LEOPARDO", "CASACO LINHA C BOTÃO DOURDO", "CASACO LONGO RISCAS LUREX", "CASACO M JACKSON COMPRIDA", "CASACO M/COMPRIDA", "CASACO MALHA 1 BOTÃO", "CASACO MALHA ALGODÃO", "CASACO MALHA APLICAÇÃO", "CASACO MALHA BOTÃO", "CASACO MALHA BÁSICO", "CASACO MALHA C LANTEJOULAS", "CASACO MALHA C/APLICAÇÃO", "CASACO MALHA C/BOTÃO", "CASACO MALHA C/CAPUZ", "CASACO MALHA COMPRIDA", "CASACO MALHA COMPRIDA TRANÇA", "CASACO MALHA COMPRIDA/M-CTR", "CASACO MALHA COMPRIDA/RISCAS", "CASACO MALHA COR DOURADO", "CASACO MALHA FINA COMPRIDA", "CASACO MALHA FLORES", "CASACO MALHA GEOMÉTRICO", "CASACO MALHA LANTEJOULAS", "CASACO MALHA LEOPARDO", "CASACO MALHA PRT/FLORES", "CASACO MALHA RISCAS", "CASACO MALHA RISCAS/CAPUZ", "CASACO MALHA ROMA COMPRIDA", "CASACO MALHA S/BOTÃO", "CASACO MALHA VIVO NAPA", "CASACO MANG/FRANZIDA", "CASACO MANG/NAPA", "CASACO MANGA NAPA", "CASACO MESCLADO C/LANTEJOULAS", "CASACO MILITAR CAMBRAIA", "CASACO MISTURA TECIDO", "CASACO MLHA PÉROLAS", "CASACO NAPA /CTR", "CASACO NAPA/COMPRIDA", "CASACO NAPA/CURTO", "CASACO NAPA/GRAVADA", "CASACO PADRÃO", "CASACO PADRÃO C ZIP", "CASACO PELO BRILHO", "CASACO PELO C/BOTÃO", "CASACO PELO E LANTEJOULAS", "CASACO PELO LEOPARDO", "CASACO PELO MG-NAPA", "CASACO POLAR C/CANELADO", "CASACO POLIPELE HOMEM", "CASACO POPELINE", "CASACO PRINT C/FRANJAS", "CASACO PRINT C/LANTEJOULAS", "CASACO PRINT FLORES", "CASACO PRINT FRANJAS", "CASACO PRINT GEOMÉTRICO", "CASACO PRINT LEOPARDO", "CASACO RENDA COMPRIDA", "CASACO RISCAS", "CASACO RISCAS 3/4", "CASACO RISCAS BOTÃO", "CASACO RISCAS CAPUZ", "CASACO RISCAS LUREX", "CASACO RISCAS M3/4", "CASACO RISCAS PELO", "CASACO ROMA 2 BOTÃO", "CASACO ROMA C/BOTÃO", "CASACO S/MANGAS BORDADO", "CASACO SEM BOTÃO", "CASACO TECIDO/CAP", "CASACO TECIDO/CHANN", "CASACO TEDDY GEOMÉTRICO", "CASACO TEDDY LISO COMPRIDA", "CASACO TRAC/LEOPARDO", "CASACO TRACADO C/BOTÃO", "CASACO TRACADO RISCAS", "CASACO TRANCAS BOTÃO", "CASACO XADREZ/CAPUZ", "CASACO XD COMPRIDA", "CASACO ZIP RISCAS", "CHAPÉU APLICAÇÃO", "CHAPÉU BICOLOR LANTEJOULAS", "CHAPÉU BÁSICO", "CHAPÉU C APLICAÇÃO", "CHAPÉU C FLORES", "CHAPÉU C LAÇO", "CHAPÉU C/FITA", "CHAPÉU C/FLORES", "CHAPÉU C/LAÇO", "CHAPÉU ESTAMPADO", "CHAPÉU FITA LEOPARDO", "CHAPÉU FLORES", "CHAPÉU GANGA", "CHAPÉU LAÇO", "CHAPÉU LAÇO TECIDO", "CHAPÉU RISCAS LAÇO", "CHAPÉU TECIDO", "CHINELOS LANTEJOULAS", "CINTO BRILHO", "CINTO BUZIOS +BOTÃO", "CINTO BÁSICO", "CINTO BÁSICO FINO", "CINTO BÁSICO LG", "CINTO BÁSICO MEDIO", "CINTO BÁSICO PELE", "CINTO BÁSICO/FIV-GRD", "CINTO C/APLICAÇÃO", "CINTO ELAST/FLORES", "CINTO ELASTIC/FLORES", "CINTO ELASTICO C/FLORES", "CINTO FINO BÁSICO", "CINTO IMT/CAMBRAIA-TAXAS", "CINTO PELE BÁSICO", "CLUTCH BRILHO", "CLUTCH LANTEJOULAS", "CLUTCH LEOPARDO", "COLAR 2 BRILHO", "COLAR 5 MEDALHA", "COLAR BRILHO", "COLAR C/CFIOS", "COLAR C/PÉROLAS G", "COLAR COMPRIDA BUZIOS", "COLAR COMPRIDA/COLOR", "COLAR CORRENTEC/PÉROLAS", "COLAR FESTA C/PÉROLAS", "COLAR FIO CAMBRAIA", "COLAR FLORES", "COLAR METAL+TECIDO", "COLAR PEDRAS COLOR BORDADO", "COLAR PÉROLAS", "COLAR PÉROLAS FLUO", "COLAR TECIDO/MET", "COLETE ALMF LEOPARDO", "COLETE BICOS 2 BOTÃO", "COLETE BORDADO", "COLETE BÁSICO", "COLETE C BOTÃO", "COLETE CAMBRAIA /APLIC", "COLETE CAMBRAIA-ETNICO", "COLETE COMPRIDA CROCHET", "COLETE COMPRIDA FAZENDA", "COLETE CROCHET BOTÃO", "COLETE IMIT CAMBRAIA", "COLETE IMITA CAMURÇA", "COLETE LINHO", "COLETE LINHO C FIOS", "COLETE MALHA 2 BOTÃO", "COLETE MALHA BOTÃO", "COLETE MALHA C BOTÃO", "COLETE MALHA COMPRIDA", "COLETE NAPA COMPRIDA", "COLETE PELO CAMBRAIA", "COLETE PELO COMPRIDA", "COLETE PELO DEGRADÊ", "COLETE PELO LEOPARDO", "COLETE PIEDPOUL BOTÃO", "COLETE POLIPELE", "COLETE PRINT COMPRIDA", "COLETE TECIDO BÁSICO", "COLETE TECIDO COMPRIDA", "COLETE+ CAMISOLA BÁSICO", "CONJ BIQUÍNI LANTEJOULAS", "CONJUNTO BÁSICO", "CUECA BÁSICO", "CUECA DUPLO LEOPARDO", "CUECA PRAIA BORDADO", "CUECA PRAIA RISCAS", "CUECA RISCAS", "DERBY BÁSICO", "FATO DE BANHO BÁSICO", "FATO DE BANHO CETIM", "FATO DE BANHO PRINT", "FATO DE BANHO PRINT ASSIMÉTRICA", "FATO DE BANHO RISCAS", "FITTED VESTIDO TULE", "GEOMÉTRICO PONCHO", "KIMONO ALGODÃO", "KIMONO CETIM COMPRIDA", "KIMONO COMPRIDA C/FRAMJ", "KIMONO COMPRIDA RISCAS", "KIMONO CURTO LANTEJOULAS", "KIMONO ESTAMPADO", "KIMONO LEOPARDO", "KIMONO LINHO RISCAS", "KIMONO LUREX RISCAS", "KIMONO PRAIA COMPRIDA", "KIMONO PRINT FRANJAS", "KIMONO RISCAS", "LADIES BÁSICO POLO", "LADIES BÁSICO SINGLET", "LADIES BÁSICO T-SHIRT", "LADIES BÁSICO VESTIDO", "LEGGING ALGODÃO", "LEGGING BOTÃO", "LEGGING BÁSICO", "LEGGING BÁSICO PRINT", "LEGGING BÁSICO ZIP", "LEGGING C/APLICAÇÃO", "LEGGING C/BOTÃO", "LEGGING C/BRILHO", "LEGGING C/FLORES", "LEGGING C/LANTEJOULAS", "LEGGING C/LAÇO", "LEGGING C/NAPA", "LEGGING C/XADREZ", "LEGGING CURTA BOTÃO", "LEGGING ESTAMPADO", "LEGGING IMT/NAPA", "LEGGING LANTEJOULAS", "LEGGING NAPA", "LEGGING PRINT FLORES", "LEGGING PRINT LEOPARDO", "LEGGING PRINT ÉTNICA", "LEGGING RISCAS", "LEGGING TECIDO/MERG", "LEGGING ÉTNICA", "LENÇO AGL/BÁSICO", "LENÇO ALGODÃO /BÁSICO", "LENÇO ALGODÃO BÁSICO", "LENÇO ALGODÃO/BÁSICO", "LENÇO BÁSICO", "LENÇO BÁSICO ALGODÃO", "LENÇO BÁSICO DEGRADÊ", "LENÇO COMPRIDA", "LENÇO ESTAMPADO", "LENÇO ESTAMPADO GEOMÉTRICO ARRIVAL", "LENÇO FLORES", "LENÇO FLORES BICOL", "LENÇO FLORES GRANDE", "LENÇO FLORES MEDIA", "LENÇO FLORES+CRONOCOP", "LENÇO FRANJAS", "LENÇO FRANJAS QD/PQ", "LENÇO GOLA PRINT LEOPARDO", "LENÇO LEOPARDO", "LENÇO PRINT BORBOLETA", "LENÇO PRINT FLORES", "LENÇO PRINT FLORES GRD", "LENÇO PRINT LEOPARDO", "LENÇO QUADRADO ALGODÃO", "LENÇO RISCAS", "LENÇO RISCAS DEGRADÊ", "LENÇO RISCAS GROSSA", "LENÇO RISCAS RAYON", "LENÇO SEDA/BÁSICO", "LENÇO SEDA/LISO", "LENÇO TRO/BÁSICO", "LENÇO/GOLA FLORES", "MACACO ALGODÃO", "MACACO BÁSICO", "MACACO C APLICAÇÃO", "MACACO C BOTÃO", "MACACO C FLORES", "MACACO C/CINT-BOTÃO", "MACACO CALÇÃO ALGODÃO", "MACACO COMPRIDA", "MACACO COMPRIDA BOLSO", "MACACO COMPRIDA LISO", "MACACO COMPRIDA-CAMBRAIA", "MACACO COMPRIDA-KAIKAI", "MACACO COMPRIDA-LISO", "MACACO COMPRIDA-PRINT", "MACACO COMPRIDA/ JEANS", "MACACO COMPRIDA/KAKAI", "MACACO COMPRIDA/MANCHA", "MACACO COMPRIDA/PRINT", "MACACO CREP FLORES", "MACACO CTR ALGODÃO", "MACACO CURT/SEDA", "MACACO CURTO BÁSICO", "MACACO CURTO C BOTÃO", "MACACO CURTO ESTAMPADO", "MACACO CURTO SEDA/FOLH", "MACACO DEGRADÊ", "MACACO ESTAMPADO-ELASTIC", "MACACO ESTAMPADO/CTR", "MACACO IMIT LINHO", "MACACO LINHO", "MACACO POP/ALGODÃO", "MACACO PRINT COMPRIDA", "MACACO PRINT FLORES", "MACACO RISCAS", "MACACO RISCAS LAÇO", "MACACO RISCAS MILTICOLOR", "MACACO SEDA-KAIKAI", "MACACO SEDA/BERMUD", "MACACO TECIDO", "MACACO VIVO DOURADO", "MALA APLICAÇÃO", "MALA BORDADO", "MALA BORDADO LAVANDA", "MALA BOTÃO CROCH", "MALA BRILHO", "MALA BÁSICO TRAÇAR", "MALA C APLICAÇÃO", "MALA C BRILHO", "MALA C/APLICAÇÃO", "MALA C/FLORES", "MALA C/LANTEJOULAS", "MALA C/MISSANGA", "MALA C/P. MOEDAS", "MALA C/RISCAS", "MALA C/SARJA", "MALA CAMURÇA", "MALA CAROL+LANTEJOULAS", "MALA CROCHE BOTÃO", "MALA DOBLE FACE LEOPARDO", "MALA DUPLA EF/CAMBRAIA", "MALA ENVELOPE APLICAÇÃO", "MALA ENVELOPE ÉTNICA", "MALA ENVP TECIDO", "MALA ESTAMPADO", "MALA FLORES", "MALA FLORES GRD", "MALA FLORES LANTEJOULAS", "MALA FLORES MISSANGA", "MALA GR LANTEJOULAS", "MALA IMIT/CAMBRAIA", "MALA LANTEJOULAS", "MALA LANTEJOULAS RISCAS", "MALA LEOPARDO", "MALA LEOPARDO MEDIA", "MALA LEOPARDO RECT", "MALA LEOPARDO REDEOND", "MALA METALIZADO", "MALA OMBRO LANTEJOULAS", "MALA PALHA RISCAS", "MALA PELE METALIZADO", "MALA PELO PÉROLAS", "MALA PEQ APLICAÇÃO", "MALA PEQUENA ÉTNICA", "MALA POLIPELE", "MALA PQ LEOPARDO TRACAR", "MALA PQ TRACAR LEOPARDO", "MALA PRAIA RISCAS", "MALA PRAIA RISCAS COLORS", "MALA PRINT FLORES", "MALA PRINT LEOPARDO", "MALA PÉROLAS", "MALA RAFIA LANTEJOULAS", "MALA RAYAS LANTEJOULAS", "MALA RISCAS", "MALA RISCAS ALGODÃO", "MALA RISCAS LANTEJOULAS", "MALA RISCAS MISSANGA", "MALA RY+LANTEJOULAS", "MALA SACO CAMBRAIA", "MALA SARJA/VERN", "MALA SHOPPER LANTEJOULAS", "MALA T/FLORES", "MALA TECIDO CORD", "MALA TECIDO SEDA", "MALA TECIDO TECNI", "MALA TECIDO/JUTE", "MALA TRACAR CAMURÇA", "MALA TRANSP/TECIDO", "MALA TRAÇAR BÁSICO", "MALA TRAÇAR ÉTNICA", "MALA VIVOS DOURADO", "MALA YUTE FLORES", "MALA ÉTNICA", "MALA ÉTNICA INDIA", "MALA ÉTNICA INDY", "MALA ÉTNICA POMPOM", "MENS SINGLET BÁSICO", "MENS T-SHIRT BÁSICO", "MINI SAIA BOMBAZINE", "MINI SAIA BÁSICO", "MINI SAIA DEGRADÊ", "MINI SAIA LANTEJOULAS", "MINI SAIA LANTEJOULAS COLORS", "MINI SAIA METALIZADO", "MINI SAIA POLIPELE", "MINI SAIA POPELINE", "MOCHILA C/APLICAÇÃO", "MOCHILA DE NYLON C/PENDURO", "MOCHILA ESTAMPADO TENERIFE", "MOCHILA JEANS FLORES", "MOCHILA RISCAS", "PANTUFA BOTAS RISCAS", "PAREO ALGODÃO", "PAREO BÁSICO", "PAREO DEGRADÊ", "PAREO FLORES", "PAREO LANTEJOULAS.", "PAREO PRINT ÉTNICA", "PASHMINA BÁSICO", "PASHMINA LEOPARDO", "PASHMINA RISCAS", "PASHMINA SEDA/RISCAS", "PIJAMA RISCAS", "PIRATA C/CINTO", "POLO BRILHO", "POLO BÁSICO", "POLO BÁSICO HOMEM", "POLO BÁSICO PIQUE", "POLO C/BOTÃO", "POLO C/GRAVATA", "POLO ESTAMPADO", "POLO FRANZIDA", "POLO H BÁSICO", "POLO M/COMPRIDA", "POLO RISCAS", "POLO RISCAS C/FOLHO", "POLO RISCAS F", "POLO RISCAS FINA", "POLO RISCAS FLUR", "POLO RISCAS GOLA", "POLO RISCAS L", "POLO RISCAS LARGA", "POLO RISCAS LG", "PONCHO BÁSICO", "PONCHO C/FRANJAS", "PONCHO FRANJAS", "POPELINE T-SHIRT", "PULSEIRA PÉROLAS", "PULSEIRA TECIDO", "SABRINAS ABERT C-LAÇO", "SABRINAS ALGODÃO", "SABRINAS ALGODÃO/LISA", "SABRINAS ALGODÃO/TIRA", "SABRINAS APLICAÇÃO", "SABRINAS BOMBAZINE", "SABRINAS BOR/FLORES", "SABRINAS BOTÃO", "SABRINAS BÁSICO", "SABRINAS C LAÇO", "SABRINAS C/APLICAÇÃO", "SABRINAS C/FLORES", "SABRINAS C/LANTEJOULAS", "SABRINAS C/LAÇO", "SABRINAS C/LAÇO CRIANÇA", "SABRINAS CAMBRAIA/ROSA", "SABRINAS CAMBRAIA/VIVO", "SABRINAS CETIM LAÇO", "SABRINAS ESTAMPADO", "SABRINAS FIVELA LANTEJOULAS", "SABRINAS FLORES", "SABRINAS LANTEJOULAS", "SABRINAS LAÇO", "SABRINAS LAÇO BRILH", "SABRINAS LAÇO DOURADO", "SABRINAS LAÇO PEDRAS", "SABRINAS LAÇO STRASS", "SABRINAS LAÇO ZIP", "SABRINAS LEOPARDO", "SAIA 3 BRILHO", "SAIA ACETINADA PADRÃO", "SAIA ALGODÃO", "SAIA ALGODÃO /COS", "SAIA ALGODÃO C CINTO", "SAIA ALGODÃO COMPRIDA", "SAIA ALGODÃO FOLHO", "SAIA ALGODÃO PRINT", "SAIA ALGODÃO/ESTAMPADO", "SAIA APLICAÇÃO", "SAIA ASSIMÉTRICA", "SAIA BICOS ESTAMPADO", "SAIA BOMBAZINE", "SAIA BOMBAZINE/BORDADO", "SAIA BOMBAZINE/CINT", "SAIA BOMBAZINE/CINTO", "SAIA BOMBAZINE/CINTO G", "SAIA BOMBAZINE/EST", "SAIA BOMBAZINE/FINO", "SAIA BOMBAZINE/FIO", "SAIA BOMBAZINE/FIVELA", "SAIA BOMBAZINE/FOLHO", "SAIA BOMBAZINE/JOELHO", "SAIA BOMBAZINE/LANTEJOULAS", "SAIA BORBOLETA", "SAIA BORDA/FLORES", "SAIA BORDADO", "SAIA BORDADO/ZIG", "SAIA BOTÃO", "SAIA BRILHO", "SAIA BÁSICO", "SAIA BÁSICO ALGODÃO", "SAIA BÁSICO C/BOLSO", "SAIA BÁSICO LINHO", "SAIA C BOTÃO", "SAIA C BRILHO", "SAIA C C RISCAS", "SAIA C CORDÃO", "SAIA C PADRÃO", "SAIA C PÉROLAS", "SAIA C-2RACHA CETIM", "SAIA C-2RACHA TECIDO", "SAIA C/APLICAÇÃO", "SAIA C/BORDADO", "SAIA C/BOTÃO", "SAIA C/BRILHO", "SAIA C/C BOLSO", "SAIA C/C DOURADOS", "SAIA C/C-RACHA", "SAIA C/CINTO", "SAIA C/CINTO COURO", "SAIA C/CINTO GANGA", "SAIA C/CRISTAIS", "SAIA C/DOURADO", "SAIA C/FOLHOS", "SAIA C/GANGA", "SAIA C/LANTEJOULAS", "SAIA C/LAÇO", "SAIA C/MEDALHA", "SAIA C/MEIO CINTO", "SAIA C/POPELINE", "SAIA C/PRIDA LAÇO", "SAIA C/PÉROLAS", "SAIA C/RENDA", "SAIA C/RISCAS", "SAIA C/TULE", "SAIA C/VIVOS", "SAIA CAMBRAIA", "SAIA CAMBRAIA ESPIGA", "SAIA CAMBRAIA PLISSADA", "SAIA CAMBRAIA XADREZ", "SAIA CAMBRAIA-ABERTO", "SAIA CAMBRAIA/ ZIPS", "SAIA CAMURÇA", "SAIA CETIM", "SAIA CETIM BÁSICO", "SAIA CETIM COMPRIDA", "SAIA CETIM FRANZIDA", "SAIA CETIM LEOPARDO", "SAIA CETIM PRINT", "SAIA COMPRIDA", "SAIA COMPRIDA /CINTO", "SAIA COMPRIDA ALGODÃO", "SAIA COMPRIDA BOMB", "SAIA COMPRIDA BOMBAZINE", "SAIA COMPRIDA BORDADO", "SAIA COMPRIDA C BOTÃO", "SAIA COMPRIDA CARGO", "SAIA COMPRIDA ESTAMPADO", "SAIA COMPRIDA JEANS", "SAIA COMPRIDA LANTEJOULAS", "SAIA COMPRIDA LINHO", "SAIA COMPRIDA MALHA", "SAIA COMPRIDA PRINT", "SAIA COMPRIDA PRINT DOUR", "SAIA COMPRIDA PRINT LEOPARDO", "SAIA COMPRIDA RENDA", "SAIA COMPRIDA RISCAS", "SAIA COMPRIDA+CINTO", "SAIA COMPRIDA-ALGODÃO", "SAIA COMPRIDA-C/CINTO", "SAIA COMPRIDA-MUSSELINA", "SAIA COMPRIDA-SEDA", "SAIA COMPRIDA/ COS CROCH", "SAIA COMPRIDA/ALGODÃO", "SAIA COMPRIDA/APLICAÇÃO", "SAIA COMPRIDA/BOLSO", "SAIA COMPRIDA/BOLSO-CETIM", "SAIA COMPRIDA/BOMB", "SAIA COMPRIDA/C-CINTO", "SAIA COMPRIDA/CETIM-", "SAIA COMPRIDA/CINTO", "SAIA COMPRIDA/COS ELAST", "SAIA COMPRIDA/FRANZIDA", "SAIA COMPRIDA/GAZA", "SAIA COMPRIDA/JEANS", "SAIA COMPRIDA/LANTEJOULAS", "SAIA COMPRIDA/MANC", "SAIA COMPRIDA/MOD", "SAIA COMPRIDA/PRINT", "SAIA COMPRIDA/RENDA", "SAIA COMPRIDA/RISCAS", "SAIA COMPRIDA/TRACAR", "SAIA COMPRIDA/ÉTNICA", "SAIA CORDÃO", "SAIA COS ALGODÃO", "SAIA COS/LANTEJOULAS", "SAIA CROCHET COMPRIDA", "SAIA CTR RISCAS", "SAIA CURTA ALGODÃO", "SAIA CURTA BRILHO", "SAIA CURTA DEGRADÊ", "SAIA CURTA ESTAMPADO", "SAIA CURTA POLIPELE", "SAIA DEGRADÊ", "SAIA DEGRADÊ ALGODÃO", "SAIA DOURADO", "SAIA ESTAMPADO", "SAIA ESTAMPADO COMPRIDA", "SAIA FLORES", "SAIA FLORES BOR", "SAIA FOLHO LANTEJOULAS", "SAIA FOLHO TULE", "SAIA FOLHOS FLORES PQ", "SAIA FRANJAS", "SAIA FRANJAS BRILHO", "SAIA GEOMÉTRICO", "SAIA IMT/CAMBRAIA", "SAIA JEANS BOTÃO", "SAIA JEANS COMPRIDA", "SAIA JEANS METALIZADO", "SAIA JEANS RISCAS", "SAIA LANTEJOULAS", "SAIA LEOPARDO", "SAIA LEOPARDO LANTEJOULAS", "SAIA LICRA C/BOTÃO", "SAIA LINHO BRILHO", "SAIA LUREX GEOMÉTRICO", "SAIA MALHA BOTÃO", "SAIA MALHA C BOTÃO", "SAIA MALHA PADRÃO", "SAIA MESC/XADREZ", "SAIA METALIZADO", "SAIA METALIZADO RACHA", "SAIA MIDI ESTAMPADO", "SAIA MIDI LANTEJOULAS COLORS", "SAIA MIDI LYONCEL", "SAIA MIDI POLIPELE", "SAIA MIDI TULE PRINT", "SAIA MUSSELINA", "SAIA MUSSELINA MODA", "SAIA MUSSELINA/ASSIMET", "SAIA NAPA", "SAIA NAPA /COMPRIDA", "SAIA NAPA BRILHO", "SAIA NAPA C/APLICAÇÃO", "SAIA NAPA C/CORR", "SAIA NAPA C/ZIP", "SAIA NAPA DOURADO", "SAIA PADRÃO", "SAIA PLISSADA BÁSICO", "SAIA PLISSADA C BOTÃO", "SAIA PLISSADA CAMBRAIA<", "SAIA PLISSADA CETIM", "SAIA PLISSADA COMPRIDA", "SAIA PLISSADA DEGRADÊ", "SAIA PLISSADA METALIZADO", "SAIA PLISSADA/TULE", "SAIA POLIPELE CINTO", "SAIA POLIPELE FOLHOS", "SAIA POPELINE", "SAIA POPELINE COMPRIDA", "SAIA PRINT", "SAIA PRINT ANIMAL", "SAIA PRINT ASSIMÉTRICA", "SAIA PRINT BOTÃO", "SAIA PRINT FLORES", "SAIA PRINT GALES", "SAIA PRINT LEOPARDO", "SAIA PRINT TULE", "SAIA PROMENOR CAMBRAIA", "SAIA RISCAS", "SAIA RISCAS 2 RACHAS", "SAIA RISCAS C/BOLSO", "SAIA RISCAS COMPRIDA", "SAIA RISCAS MULTI", "SAIA SARJA/CINT", "SAIA SB C/LAÇO", "SAIA SEDA-CURTA", "SAIA SEDA/FOLHO", "SAIA SEDA/FOLHOS", "SAIA TECIDO", "SAIA TECIDO LINHO", "SAIA TECIDO PRINT", "SAIA TENCEL CETIM", "SAIA TRANS/ASSIMÉTRICA", "SAIA TUBO RISCAS", "SAIA TULE", "SAIA TULE BOLAS", "SAIA TULE BORDADO", "SAIA TULE BRILHO", "SAIA TULE DEGRADÊ", "SAIA TULE FOLHO", "SAIA TULE FOLHOS", "SAIA TULE LEOPARD", "SAIA TULE MIDI", "SAIA TULE PRINT", "SAIA VOILE ESTAMPADO", "SAIA ÉTNICA", "SAIA ÉTNICA COMPRIDA", "SAIA ÉTNICA PRINT", "SANDÁLIA ALT / TIRAS CETIM", "SANDÁLIA APLICAÇÃO", "SANDÁLIA APLICAÇÃO SALTO", "SANDÁLIA BAIXA C/FLORES", "SANDÁLIA BRILHO", "SANDÁLIA BÁSICO", "SANDÁLIA BÁSICO DEDO", "SANDÁLIA C BRILHO", "SANDÁLIA C FLORES", "SANDÁLIA C/APLICAÇÃO", "SANDÁLIA C/BRILHO", "SANDÁLIA C/DOURADO", "SANDÁLIA C/ELASTIC", "SANDÁLIA C/FIO CORDEL", "SANDÁLIA C/FLORES", "SANDÁLIA C/ILHOS", "SANDÁLIA C/LAÇO", "SANDÁLIA C/LAÇO CORT", "SANDÁLIA C/LAÇO RISCAS", "SANDÁLIA C/MEDALHA", "SANDÁLIA C/MISSANGA", "SANDÁLIA C/PEDRA GRD", "SANDÁLIA C/PEDRAS", "SANDÁLIA CAMBRAIA/DEDO", "SANDÁLIA CANO CAMBRAIA", "SANDÁLIA CANO SARJA", "SANDÁLIA CETIM FLORES", "SANDÁLIA COMPRIDA", "SANDÁLIA COMPRIDA/CORDA", "SANDÁLIA COMPRIDA/TIRAS", "SANDÁLIA CORDA C/FLORES", "SANDÁLIA CRZ/SARJA", "SANDÁLIA CUNHA C/RISCAS", "SANDÁLIA CUNHA FLORES", "SANDÁLIA CUNHA LAÇO", "SANDÁLIA CUNHA RISCAS", "SANDÁLIA DEDO BRILHO", "SANDÁLIA ESTAMPADO", "SANDÁLIA FIO DOURADO", "SANDÁLIA FLORES", "SANDÁLIA FLORES TIRAS", "SANDÁLIA FRANJAS", "SANDÁLIA ING LANTEJOULAS", "SANDÁLIA ING/CAMBRAIA", "SANDÁLIA INGLESA FLORES", "SANDÁLIA LANTEJOULAS", "SANDÁLIA LAÇO", "SANDÁLIA METALIZADO", "SANDÁLIA PRF FLORES", "SANDÁLIA PÉROLAS", "SANDÁLIA RASA FLORES", "SANDÁLIA RISCAS", "SANDÁLIA SARJA/CRZ", "SANDÁLIA SL/BX-FLORES", "SANDÁLIA SLT/FLORES", "SANDÁLIA SOLA RISCAS", "SANDÁLIA TIRA BRILHO", "SANDÁLIA TIRA CAMBRAIA", "SANDÁLIA TIRA LEOPARDO", "SANDÁLIA TIRA METALIZADO", "SANDÁLIA TRANCA TECIDO", "SAPATILHAS APLICAÇÃO", "SAPATILHAS BOTAS COMPRIDA", "SAPATILHAS BRILHO", "SAPATILHAS BÁSICO", "SAPATILHAS BÁSICO NUDE", "SAPATILHAS C/APLICAÇÃO", "SAPATILHAS C/BORDADO", "SAPATILHAS C/FLORES", "SAPATILHAS COMPRIDA", "SAPATILHAS ESTAMPADO", "SAPATILHAS FLORES", "SAPATILHAS FRANJAS", "SAPATILHAS LANTEJOULAS", "SAPATILHAS NAPA", "SAPATILHAS PRINT COMPRIDA", "SAPATILHAS SALTO FLORES", "SAPATILHAS TECIDO", "SAPATILHAS TECIDO BRILH", "SAPATILHAS TSMITH COMPRIDA", "SAPATO AB COMPRIDA", "SAPATO AB/CAMBRAIA-COLOR", "SAPATO AB/LEOPARDO", "SAPATO ABERTO C/LAÇO", "SAPATO ALT C/LAÇO", "SAPATO ALT/C-FLORES", "SAPATO ALT/LAÇO", "SAPATO APLICAÇÃO", "SAPATO APLICAÇÃO/VRZ", "SAPATO BICO DOURADO", "SAPATO BÁSICO", "SAPATO BÁSICO TIRA", "SAPATO BÁSICO VERNIZ", "SAPATO C V«BRILHO", "SAPATO C/CANO CAMBRAIA", "SAPATO C/FIVELA", "SAPATO C/FLORES", "SAPATO C/FRANJAS", "SAPATO C/LAÇO", "SAPATO C/PIEZA", "SAPATO C/VERNIZ-LAÇO", "SAPATO CAMBRAIA", "SAPATO CAMBRAIA C/LAÇO", "SAPATO CAMBRAIA/", "SAPATO CAMBRAIA/BICOLOR", "SAPATO CAMBRAIA/C-LAC", "SAPATO CAMBRAIA/CUNHA", "SAPATO CAMBRAIA/HOMEM", "SAPATO CAMURÇA", "SAPATO CETIM C/LAÇO", "SAPATO CETIM LAÇO", "SAPATO COMPRIDA", "SAPATO COMPRIDA/CAMBRAIA", "SAPATO CORDA /COMPRIDA", "SAPATO CUNHA C/FLORES", "SAPATO CUNHA CAMBRAIA", "SAPATO CUNHA LAÇO", "SAPATO ESTAMPADO", "SAPATO FCH/LEOPARDO", "SAPATO FECHADO CAMBRAIA/COLOR", "SAPATO FEST/CAMBRAIA", "SAPATO FESTA C/LAÇO", "SAPATO FIVELA BRILHO", "SAPATO FLORES", "SAPATO FLORES CUNHA", "SAPATO FORRO LEOPARDO", "SAPATO FRANJAS", "SAPATO FRANJAS /COMPRIDA", "SAPATO FRS C/LAÇO", "SAPATO FUR C/FLORES", "SAPATO FUROS C/LAÇO", "SAPATO IMT/CAMBRAIA", "SAPATO LANTEJOULAS", "SAPATO LAÇO", "SAPATO LAÇO BRILHANT", "SAPATO LAÇO CUNH", "SAPATO LAÇO TAX", "SAPATO LEOPARDO", "SAPATO LEOPARDO/ABERT", "SAPATO LEOPARDO/FECHAD", "SAPATO LISO C/LEOPARDO", "SAPATO NAPA", "SAPATO PRINT FLORES", "SAPATO RASO CAMBRAIA", "SAPATO RISCAS", "SAPATO SARJA C/LAÇO", "SAPATO SARJA LAÇO", "SAPATO SOLA COMPRIDA", "SAPATO TECIDO/ZIG", "SAPATO TOEP C/LAÇO", "SAPATO VERNIZ FRANJAS", "SAPATO/BOTAS-CAMBRAIA", "SHOPPER BÁSICO", "SHOPPER JACOB BÁSICO", "SWEATSHIRT ALGODÃO", "SWEATSHIRT BORDADO", "SWEATSHIRT BÁSICO", "SWEATSHIRT BÁSICO C/REND", "SWEATSHIRT BÁSICO RENDA", "SWEATSHIRT C/BOTÃO", "SWEATSHIRT C/BRILHO", "SWEATSHIRT C/DOURADO", "SWEATSHIRT C/LANTEJOULAS", "SWEATSHIRT C/PRINT", "SWEATSHIRT C/PRINTING", "SWEATSHIRT CAPUZ RISCAS", "SWEATSHIRT CURTA LEOPARDO", "SWEATSHIRT ESTAMPADO", "SWEATSHIRT LANTEJOULAS", "SWEATSHIRT M/COMPRIDA-BÁSICO", "SWEATSHIRT RISCAS", "SWEATSHIRT RISCAS MILITAR", "SWEET-T-SHIRT PADRÃO", "T T-SHIRT BÁSICO", "T T-SHIRT C APLICAÇÃO", "T T-SHIRT ESTAMPADO", "T T-SHIRT LANTEJOULAS", "T- T-SHIRT BÁSICO", "T-SAIA RISCAS C/CROCH", "T-SHIRT ALGODÃO", "T-SHIRT APLIC-LEOPARDO", "T-SHIRT APLICAÇÃO", "T-SHIRT ASSIMÉTRICA", "T-SHIRT BICO BOTÃO", "T-SHIRT BOLSO FRANJAS", "T-SHIRT BORDADO", "T-SHIRT BORDADO LANTEJOULAS", "T-SHIRT BOTÃO", "T-SHIRT BOTÃO MANGA", "T-SHIRT BÁSICO", "T-SHIRT BÁSICO D/RED", "T-SHIRT BÁSICO DC/RED", "T-SHIRT BÁSICO DEC/BICO", "T-SHIRT BÁSICO DEC/V", "T-SHIRT BÁSICO H", "T-SHIRT BÁSICO V", "T-SHIRT C BORDADO", "T-SHIRT C LANTEJOULAS", "T-SHIRT C/APLICAÇÃO", "T-SHIRT C/BOLSO", "T-SHIRT C/BOTÃO", "T-SHIRT C/CHUMASOS", "T-SHIRT C/CINTO", "T-SHIRT C/DOURADO", "T-SHIRT C/FLORES", "T-SHIRT C/PRINT", "T-SHIRT CAVA APLICAÇÃO", "T-SHIRT CAVA FLORES", "T-SHIRT DEGRADÊ", "T-SHIRT ESTAMPADO", "T-SHIRT EXTRA COMPRIDA", "T-SHIRT FLORES", "T-SHIRT FLORES BORADO", "T-SHIRT FRANJAS", "T-SHIRT FRANJAS PESSEGO", "T-SHIRT GEOMÉTRICO", "T-SHIRT IMP/BORBOLETA", "T-SHIRT LANTEJOULAS", "T-SHIRT LANTEJOULAS-WOMAN", "T-SHIRT LEOPARDO", "T-SHIRT LEOPARDO LANTEJOULAS", "T-SHIRT LEOPARDO/M-COMPRIDA", "T-SHIRT MAG BORDADO", "T-SHIRT MANG BORDADO", "T-SHIRT MANGA APLICAÇÃO", "T-SHIRT MANGA TULE", "T-SHIRT METALIZADO", "T-SHIRT N/COMPRIDA", "T-SHIRT PADRÃO", "T-SHIRT POPELINE", "T-SHIRT POPELINE AOP", "T-SHIRT PRINT FLORES", "T-SHIRT PRINT LEOPARDO", "T-SHIRT PRINT RISCAS", "T-SHIRT PÉROLAS", "T-SHIRT RISCAS", "T-SHIRT RISCAS BICO", "T-SHIRT RISCAS CAPUZ", "T-SHIRT RISCAS CORACAO", "T-SHIRT RISCAS FIO PRATA", "T-SHIRT RISCAS FLORES", "T-SHIRT RISCAS FLUOR", "T-SHIRT RISCAS FOLHO", "T-SHIRT RISCAS LUREX", "T-SHIRT RISCAS M/COMPRIDA", "T-SHIRT RISCAS MANCHAD", "T-SHIRT RISCAS PRINT", "T-SHIRT RISCAS PRINTFLOR", "T-SHIRT RISCAS/PRINT", "T-SHIRT ÉTNICA", "TOP BIQUÍNI BORDADO", "TOP BIQUÍNI BÁSICO", "TOP BIQUÍNI CETIM", "TOP BIQUÍNI FRANJAS", "TOP BIQUÍNI PRINT", "TOP BIQUÍNI RISCAS", "TOP BIQUÍNI RISCAS FOLHOS", "TOP C/CINTO", "TOP FLORES C/CINTO", "TOP FRANJAS BIQUÍNI", "TOP LEOPARDO/ CINTO", "TOP RISCAS+CINTO", "TÚNICA 2 BOTÃO", "TÚNICA 2 LAÇO", "TÚNICA 3 BOTÃO", "TÚNICA 3 FLORES BICOS", "TÚNICA ALGODÃO", "TÚNICA ALGODÃO C/CINTO", "TÚNICA ALGODÃO ESTAMPADO", "TÚNICA ALGODÃO FOLHO", "TÚNICA ALGODÃO/TIGRADO", "TÚNICA APLICAÇÃO", "TÚNICA ASA ESTAMPADO", "TÚNICA ASSIMÉTRICA", "TÚNICA AZULEIJO FRANZIDA", "TÚNICA BICO ALGODÃO", "TÚNICA BICOS BORDADO", "TÚNICA BICOS ESTAMPADO", "TÚNICA BORDADO", "TÚNICA BORDADO/LANTEJOULAS", "TÚNICA BOTÃO", "TÚNICA BOTÃO FORRA", "TÚNICA BÁSICO", "TÚNICA BÁSICO/CINTO", "TÚNICA C APLICAÇÃO", "TÚNICA C BOTÃO", "TÚNICA C LANTEJOULAS", "TÚNICA C/APLIC-BOTÃO", "TÚNICA C/APLICAÇÃO", "TÚNICA C/BORDA/FLORES", "TÚNICA C/BORDADO", "TÚNICA C/BOTÃO", "TÚNICA C/BRILHO", "TÚNICA C/CACHECOL", "TÚNICA C/CINTO", "TÚNICA C/CINTO FRANZIDA", "TÚNICA C/COS", "TÚNICA C/ESTAMPADO", "TÚNICA C/FLORES BORDADO", "TÚNICA C/LANTEJOULA", "TÚNICA C/LANTEJOULAS", "TÚNICA C/LAÇO", "TÚNICA CAV-GEOMÉTRICO", "TÚNICA CAV/-3 FLORES", "TÚNICA CAVA ESTAMPADO", "TÚNICA CAVA RISCAS", "TÚNICA CINTO-LANTEJOULAS", "TÚNICA COLORS GEOMÉTRICO", "TÚNICA COMPRIDA", "TÚNICA COMPRIDA LEOPARD", "TÚNICA COMPRIDA-BOTÃO", "TÚNICA COMPRIDA/CPRINT", "TÚNICA DEGRADÊ", "TÚNICA DEGRADÊ LINHO", "TÚNICA DEGRADÊ S/M", "TÚNICA ESTAMPADO", "TÚNICA ESTAMPADO BICOS", "TÚNICA ESTAMPADO COMPRIDA", "TÚNICA ESTAMPADO-2 FACES", "TÚNICA ESTAMPADO/2BOT", "TÚNICA ESTAMPADO/ALGODÃO", "TÚNICA ESTAMPADO/ANIMAL", "TÚNICA ESTAMPADO/C/CETIM", "TÚNICA ESTAMPADO/CAVA", "TÚNICA ESTAMPADO/CINTO", "TÚNICA ESTAMPADO/LICRA", "TÚNICA ESTAMPADO/MUSSEL", "TÚNICA ESTAMPADO/RENDA", "TÚNICA FLORES", "TÚNICA FLORES CAVA", "TÚNICA FLORES M/BAL", "TÚNICA FLORES M/CTR", "TÚNICA FOLHOS ESTAMPADO", "TÚNICA FRANJAS", "TÚNICA FRANJAS CROCHET", "TÚNICA FRANJAS E LANTEJOLA", "TÚNICA FRANJAS E LANTEJOULAS", "TÚNICA FUNIL/COMPRIDA", "TÚNICA GEOMÉTRICO", "TÚNICA GOLA BOTÃO", "TÚNICA GRD PRINT FLORES", "TÚNICA LANTEJOULAS", "TÚNICA LANTEJOULAS/CINTO", "TÚNICA LAÇO", "TÚNICA LAÇO LADO", "TÚNICA LAÇO+COLAR", "TÚNICA LEOPARDO APLI JEANS", "TÚNICA LICRA ESTAMPADO", "TÚNICA LINHO LANTEJOULAS", "TÚNICA LISA BOTÃO", "TÚNICA LISA C/BORDADO", "TÚNICA M/CAV-2 BOTÃO", "TÚNICA M/COMPRIDA", "TÚNICA M/COMPRIDA-CINTO FRZ", "TÚNICA M/COMPRIDA/GOLA/CT", "TÚNICA M/CTR C-FLORES", "TÚNICA M/CTR C/BOTÃO", "TÚNICA M/CTR FLORES", "TÚNICA M/CTR PRINT LANTEJOULAS", "TÚNICA M/L PLISSADA", "TÚNICA MALHA 8 BOTÃO", "TÚNICA MALHA M/COMPRIDA", "TÚNICA MALHA PLISSADA", "TÚNICA MALHAC/ESTAMPADO", "TÚNICA MUSSELINA", "TÚNICA MUSSELINA C/CINTO", "TÚNICA MUSSELINA COS ALGODÃO", "TÚNICA MUSSELINA COS LG", "TÚNICA MUSSELINA/PRINT", "TÚNICA ORGANZA ESTAMPADO", "TÚNICA PREGA M/COMPRIDA", "TÚNICA PRINT /FRANJAS", "TÚNICA PRINT /LANTEJOULAS", "TÚNICA PRINT ALGODÃO T/GR", "TÚNICA PRINT BORDADO", "TÚNICA PRINT FLORES", "TÚNICA PRINT FLORES GRD", "TÚNICA PRINT FRANJAS", "TÚNICA PRINT GEOMÉTRICO", "TÚNICA PRINT LEOPARDO", "TÚNICA PRINT M/COMPRIDA", "TÚNICA RISCAS", "TÚNICA RISCAS BORDADO", "TÚNICA RISCAS C/CINTO", "TÚNICA RISCAS LUREX", "TÚNICA RISCAS PRINT", "TÚNICA RISCAS/CINTO", "TÚNICA SEDA", "TÚNICA SEDA-C.LANTEJOULAS", "TÚNICA T/GRD C-BOTÃO", "TÚNICA TECIDO/ BOTÃO", "TÚNICA/VESTIDO ESTAMPADO", "TÚNICA/VESTIDO MLH-RISCAS", "VESTIDO 2 BOTÃO", "VESTIDO 2 TECIDO", "VESTIDO 3 BOTÃO-GOLA", "VESTIDO ALCA FLORES PQ", "VESTIDO ALGODÃO", "VESTIDO ALGODÃO /LAÇO", "VESTIDO ALGODÃO ALCAS", "VESTIDO ALGODÃO BOLSO", "VESTIDO ALGODÃO BOTÃO", "VESTIDO ALGODÃO BÁSICO", "VESTIDO ALGODÃO C CAMISO", "VESTIDO ALGODÃO C/ELAS", "VESTIDO ALGODÃO C/RENDA", "VESTIDO ALGODÃO FOLHO", "VESTIDO ALGODÃO LAÇO", "VESTIDO ALGODÃO M/CTR", "VESTIDO ALGODÃO MODA", "VESTIDO ALGODÃO PRAIA", "VESTIDO ALGODÃO PRINT", "VESTIDO ALGODÃO PRINT ANIMAL", "VESTIDO ALGODÃO RISCAS", "VESTIDO ALGODÃO TUBO", "VESTIDO ALGODÃO/ALCA", "VESTIDO ALGODÃO/ASAS", "VESTIDO ALGODÃO/C-BOLSO", "VESTIDO ALGODÃO/C/BOLSO", "VESTIDO ALGODÃO/CINTO", "VESTIDO ALGODÃO/CTR RASG", "VESTIDO ALGODÃO/ESTAMPADO", "VESTIDO ALGODÃO/LANTEJOULAS", "VESTIDO ALGODÃO/PRINT", "VESTIDO ALGODÃO/TRACADO", "VESTIDO ANIMAL PÉROLAS", "VESTIDO APLICAÇÃO", "VESTIDO APLICAÇÃO/CASCHE", "VESTIDO ASSIMÉTRICA/RENDA", "VESTIDO BALAO BÁSICO", "VESTIDO BALAO C-FLORES", "VESTIDO BALAO C/LANTEJOULAS", "VESTIDO BALAO M/COMPRIDA", "VESTIDO BALAO RISCAS", "VESTIDO BARRA BORDADO", "VESTIDO BATCK COMPRIDA", "VESTIDO BATIC COMPRIDA", "VESTIDO BICO ALGODÃO", "VESTIDO BICO BÁSICO", "VESTIDO BICO FRANZIDA", "VESTIDO BICOLOR C/LAÇO", "VESTIDO BICOLR M/COMPRIDA", "VESTIDO BOHO COMPRIDA", "VESTIDO BORDADO", "VESTIDO BORDADO COMPRIDA", "VESTIDO BORDADO/ELAST", "VESTIDO BOTÃO", "VESTIDO BRILHO", "VESTIDO BRILHO ASSIMETRI", "VESTIDO BRILHO DECOTE", "VESTIDO BRILHO MG/COMPRIDA", "VESTIDO BÁSICO", "VESTIDO BÁSICO ALGODÃO", "VESTIDO BÁSICO AMAR", "VESTIDO BÁSICO C/ELASTICO", "VESTIDO BÁSICO C/ZIP", "VESTIDO BÁSICO DEC-V", "VESTIDO BÁSICO GOLA", "VESTIDO BÁSICO MALHA FRIA", "VESTIDO BÁSICO MIDI", "VESTIDO BÁSICO MZK", "VESTIDO BÁSICO TRAPEZIO", "VESTIDO BÁSICO ZR", "VESTIDO C APLICAÇÃO", "VESTIDO C APLICAÇÃO BORDADO", "VESTIDO C BOLSO E BOTÃO", "VESTIDO C BORDADO", "VESTIDO C BORDADO DOUR", "VESTIDO C BOTÃO", "VESTIDO C BRILHO", "VESTIDO C DOURADO", "VESTIDO C LANTEJOULAS", "VESTIDO C PADRÃO", "VESTIDO C PRINT LEOPARDO", "VESTIDO C RISCAS TOPO", "VESTIDO C/APLIC-LANTEJOULAS", "VESTIDO C/APLICAÇÃO", "VESTIDO C/BORDADO", "VESTIDO C/BOTÃO", "VESTIDO C/BOTÃO MILIT", "VESTIDO C/BRILHO", "VESTIDO C/BÁSICO", "VESTIDO C/CAMISA", "VESTIDO C/CAVA", "VESTIDO C/CETIM", "VESTIDO C/CROCHET", "VESTIDO C/ELASTICO", "VESTIDO C/FIO DOURADO", "VESTIDO C/FLORES", "VESTIDO C/FLORES BORDADO", "VESTIDO C/FRANJAS", "VESTIDO C/FRANZIDA", "VESTIDO C/LANTEJOULAS", "VESTIDO C/LAÇO", "VESTIDO C/LAÇO CETIM", "VESTIDO C/LEOPARDO", "VESTIDO C/LISO", "VESTIDO C/NAPA", "VESTIDO C/PREGAS", "VESTIDO C/PRINT", "VESTIDO C/PÉROLAS", "VESTIDO C/RENDA", "VESTIDO C/RISCAS", "VESTIDO C/RISCAS TOPO", "VESTIDO CAMISEIRO BORDADO", "VESTIDO CANELADO COMPRIDA", "VESTIDO CASACO POLIPELE", "VESTIDO CASCHE/M/COMPRIDA", "VESTIDO CAVA BOTÃO", "VESTIDO CAVA BRILHO", "VESTIDO CAVA RISCAS", "VESTIDO CAVA VELUDO RISCAS", "VESTIDO CETIM", "VESTIDO CETIM ASSIMÉTRICA", "VESTIDO CETIM BÁSICO", "VESTIDO CETIM COMPRIDA", "VESTIDO CETIM DEGRADÊ", "VESTIDO CETIM ESTAMPADO", "VESTIDO COLORS COMPRIDA", "VESTIDO COMPRIDA", "VESTIDO COMPRIDA AJUSTADO", "VESTIDO COMPRIDA ALGODÃO", "VESTIDO COMPRIDA ALGODÃO PRINT", "VESTIDO COMPRIDA ALÇA", "VESTIDO COMPRIDA ASSIM", "VESTIDO COMPRIDA BATICK", "VESTIDO COMPRIDA BOHEMIO", "VESTIDO COMPRIDA BORDADO", "VESTIDO COMPRIDA C BOLERO", "VESTIDO COMPRIDA C FIO", "VESTIDO COMPRIDA CETIM PRINT", "VESTIDO COMPRIDA COLORS", "VESTIDO COMPRIDA CREPE", "VESTIDO COMPRIDA CROCHET", "VESTIDO COMPRIDA DECOTE", "VESTIDO COMPRIDA DOURADO", "VESTIDO COMPRIDA DT-V", "VESTIDO COMPRIDA ESTAMPADO", "VESTIDO COMPRIDA FIO DOURADO", "VESTIDO COMPRIDA FIOS", "VESTIDO COMPRIDA FLORES", "VESTIDO COMPRIDA GEOM", "VESTIDO COMPRIDA LINHO", "VESTIDO COMPRIDA LISO", "VESTIDO COMPRIDA LYOCELL", "VESTIDO COMPRIDA MANC", "VESTIDO COMPRIDA MANCHA", "VESTIDO COMPRIDA NO", "VESTIDO COMPRIDA POMP", "VESTIDO COMPRIDA PRINT", "VESTIDO COMPRIDA RACHA", "VESTIDO COMPRIDA RENDA", "VESTIDO COMPRIDA RISCAS", "VESTIDO COMPRIDA T/S", "VESTIDO COMPRIDA-JEANS", "VESTIDO COMPRIDA-KAIKAI RISCAS", "VESTIDO COMPRIDA-PRINT", "VESTIDO COMPRIDA/ BOTÃO", "VESTIDO COMPRIDA/2RX", "VESTIDO COMPRIDA/ALGODÃO", "VESTIDO COMPRIDA/APLI", "VESTIDO COMPRIDA/ASSIM", "VESTIDO COMPRIDA/BICO", "VESTIDO COMPRIDA/BORDADO", "VESTIDO COMPRIDA/BÁSICO", "VESTIDO COMPRIDA/ESTAMPADO", "VESTIDO COMPRIDA/GOLAO", "VESTIDO COMPRIDA/KAIAKI FLORES", "VESTIDO COMPRIDA/KAIKAI", "VESTIDO COMPRIDA/LAÇO", "VESTIDO COMPRIDA/MALHA", "VESTIDO COMPRIDA/MANCH", "VESTIDO COMPRIDA/NAD", "VESTIDO COMPRIDA/NADADOR", "VESTIDO COMPRIDA/PRINT", "VESTIDO COMPRIDA/PRINT FLORES", "VESTIDO COMPRIDA/RACHA", "VESTIDO COMPRIDA/RASGO", "VESTIDO COMPRIDA/RAYE", "VESTIDO COMPRIDA/RISCAS", "VESTIDO COMPRIDA/TRAZ", "VESTIDO COPA C/LANTEJOULAS", "VESTIDO CREPE BRILHO", "VESTIDO CROCHET BOTÃO", "VESTIDO CROCHET COMPRIDA", "VESTIDO CRONOCOP/COMPRIDA", "VESTIDO CTR PRINT FLORES", "VESTIDO CTR-LANTEJOULAS", "VESTIDO CTR/SEDA", "VESTIDO CURDO ALGODÃO", "VESTIDO CURTO BORDADO", "VESTIDO CURTO BOTÃO", "VESTIDO CURTO BÁSICO", "VESTIDO CURTO C/LAÇO", "VESTIDO CURTO RISCAS", "VESTIDO CURTO SEDA", "VESTIDO DEGRADÊ", "VESTIDO DEGRADÊ LUREX", "VESTIDO DP/TECIDO", "VESTIDO ELASTIC/COMPRIDA", "VESTIDO ESLASTIC-BORDADO", "VESTIDO ESTAM/COMPRIDA", "VESTIDO ESTAMPADO", "VESTIDO ESTAMPADO -V", "VESTIDO ESTAMPADO COMPRIDA", "VESTIDO ESTAMPADO ELASTI", "VESTIDO ESTAMPADO FOLHAS", "VESTIDO ESTAMPADO M/COMPRIDA", "VESTIDO ESTAMPADO RISCAS", "VESTIDO ESTAMPADO-C/ELAST", "VESTIDO ESTAMPADO-M/CTR", "VESTIDO ESTAMPADO/COMPRIDA", "VESTIDO ESTAMPADO/CTR", "VESTIDO ESTAMPADO/KAIKAI", "VESTIDO FESTA C/NAPA", "VESTIDO FLORES", "VESTIDO FLORES COMPRIDA", "VESTIDO FLORES MANGA", "VESTIDO FLORES PQ", "VESTIDO FOF-GOLA BÁSICO", "VESTIDO FRANJAS", "VESTIDO FRANZIDA", "VESTIDO FRANZIDA C/CINTO", "VESTIDO FRANZIDA M/CTR", "VESTIDO G/PELO M-COMPRIDA", "VESTIDO GANGA C/BOTÃO", "VESTIDO GEOMÉTRICO", "VESTIDO GOLA BÁSICO", "VESTIDO GOLA LAÇO", "VESTIDO GOLAO M/COMPRIDA", "VESTIDO GOLAO/COMPRIDA", "VESTIDO IMP/FLORES", "VESTIDO IMT/CAMBRAIA", "VESTIDO KAIKAI ALGODÃO", "VESTIDO KAIKAI ALGODÃO/FINO", "VESTIDO KAIKAI COMPRIDA", "VESTIDO KAIKAI ESTAMPADO", "VESTIDO KAIKAI FLORES", "VESTIDO KAIKAI FOLH/ALGODÃO", "VESTIDO KAIKAI MUSSELINA", "VESTIDO KAIKAI RISCAS", "VESTIDO LANTEJOULAS", "VESTIDO LANTEJOULAS /RACHA", "VESTIDO LANTEJOULAS E PENA", "VESTIDO LANTEJOULAS MULTICOLORS", "VESTIDO LANTEJOULAS-ZIG", "VESTIDO LAÇO", "VESTIDO LEOPARD/BOTÃO", "VESTIDO LEOPARDO", "VESTIDO LEOPARDO C/BOTÃO", "VESTIDO LEOPARDO PRINT", "VESTIDO LEOPC/BOTÃO", "VESTIDO LICRA COMPRIDA", "VESTIDO LICRA ESTAMPADO", "VESTIDO LINHO", "VESTIDO LINHO BORDADO", "VESTIDO LINHO BOTÃO", "VESTIDO LINHO BOTÃO DEGRA", "VESTIDO LINHO C BOTÃO BRILHO", "VESTIDO LINHO C LANTEJOULAS", "VESTIDO LINHO CAVA", "VESTIDO LINHO COMPRIDA", "VESTIDO LINHO DEGRADÊ", "VESTIDO LINHO PRINT", "VESTIDO LINHO RISCAS", "VESTIDO LISO C/BORDADO", "VESTIDO LISO CETIM", "VESTIDO LISO COMPRIDA", "VESTIDO LISO SEDA", "VESTIDO LONGO RISCAS", "VESTIDO LUREX PADRÃO", "VESTIDO LUREX RISCAS", "VESTIDO M/CAV-BORDADO", "VESTIDO M/COMPRIDA", "VESTIDO M/COMPRIDA FT", "VESTIDO M/COMPRIDA-BICO", "VESTIDO M/COMPRIDA-C-FLORES", "VESTIDO M/COMPRIDA-ESTAMPADO", "VESTIDO M/COMPRIDA-PREGAS", "VESTIDO M/CTR 3 BOTÃO", "VESTIDO M/CTR BOTÃO", "VESTIDO M/CTR FLORES", "VESTIDO MALHA +LANTEJOULAS", "VESTIDO MALHA ASSIMÉTRICA", "VESTIDO MALHA BOTÃO", "VESTIDO MALHA BÁSICO", "VESTIDO MALHA C/BOTÃO", "VESTIDO MALHA C/FLORES", "VESTIDO MALHA C/LAÇO", "VESTIDO MALHA COMPRIDA", "VESTIDO MALHA DOURADO", "VESTIDO MALHA ESTAMPADO/COLOR", "VESTIDO MALHA GEOMÉTRICO", "VESTIDO MALHA M/COMPRIDA", "VESTIDO MALHA RISCAS", "VESTIDO MALHA ÉTNICA", "VESTIDO MALHAC/ESTAMPADO", "VESTIDO MANCH M/COMPRIDA", "VESTIDO MANG BORDADO", "VESTIDO MANGA LANTEJOULAS", "VESTIDO MEZKA /FLORES", "VESTIDO MG COMPRIDA", "VESTIDO MG/FRANZIDA", "VESTIDO MIDI ALGODÃO PRINT", "VESTIDO MIDI BÁSICO", "VESTIDO MINI C/CINTO", "VESTIDO MINI SEDA/FOLHO", "VESTIDO MUSSEL/COMPRIDA", "VESTIDO MUSSELIN ESTAMPADO", "VESTIDO MUSSELINA", "VESTIDO MUSSELINA C/ELAST", "VESTIDO MUSSELINA CAVA", "VESTIDO MUSSELINA COMPRIDA", "VESTIDO MUSSELINA CRUZA", "VESTIDO MUSSELINA CURTO", "VESTIDO MUSSELINA DEC/V", "VESTIDO MUSSELINA ESTAMPADO", "VESTIDO MZK-FOF/FLORES", "VESTIDO NAPA BOTÃO", "VESTIDO PADRÃO", "VESTIDO PADRÃO ALÇA", "VESTIDO PIRNT C BOTÃO", "VESTIDO PLISSADO DEGRADÊ", "VESTIDO PLISSADO LEOPARDO", "VESTIDO POLIPELE", "VESTIDO POLIPELE FOLHO", "VESTIDO POPELINE", "VESTIDO PREGAS C/LANTEJOULAS", "VESTIDO PRINT ALGODÃO", "VESTIDO PRINT BORDADO", "VESTIDO PRINT BOTÃO", "VESTIDO PRINT C/CETIM", "VESTIDO PRINT C/FLORES", "VESTIDO PRINT C/NAPA", "VESTIDO PRINT CETIM", "VESTIDO PRINT CETIM/ALGODÃO", "VESTIDO PRINT COMPRIDA", "VESTIDO PRINT FLORES", "VESTIDO PRINT FLORES S/OMB", "VESTIDO PRINT GOLA BORDADO", "VESTIDO PRINT LANTEJOULAS", "VESTIDO PRINT LEOPARDO", "VESTIDO PRINT LEOPARDO C DOURADO", "VESTIDO PRINT SEDA", "VESTIDO PRINT ÉTNICA", "VESTIDO PRINT/BOTÃO", "VESTIDO PRINT/FLORES", "VESTIDO REDE LANTEJOULAS", "VESTIDO RENDA ALGODÃO", "VESTIDO RENDA BOTÃO", "VESTIDO RENDA E LANTEJOULAS", "VESTIDO RISCAS", "VESTIDO RISCAS /RACHAS", "VESTIDO RISCAS 2 BOLSO", "VESTIDO RISCAS 2 RACHAS", "VESTIDO RISCAS BORDADO", "VESTIDO RISCAS BRILHO", "VESTIDO RISCAS BÁSICO", "VESTIDO RISCAS C/LAÇO", "VESTIDO RISCAS C/PRINT", "VESTIDO RISCAS COLOR", "VESTIDO RISCAS COMPRIDA", "VESTIDO RISCAS COR", "VESTIDO RISCAS CROCHET", "VESTIDO RISCAS DOURADO", "VESTIDO RISCAS FINA", "VESTIDO RISCAS FINAS", "VESTIDO RISCAS IMIT LINHO", "VESTIDO RISCAS INDIA", "VESTIDO RISCAS KAIKAI", "VESTIDO RISCAS LADO", "VESTIDO RISCAS LAÇO", "VESTIDO RISCAS LUREX", "VESTIDO RISCAS LUTEX", "VESTIDO RISCAS METALIZADO", "VESTIDO RISCAS NADADORA", "VESTIDO S/MANG E BOTÃO", "VESTIDO SEDA APLICAÇÃO", "VESTIDO SEDA COMPRIDA", "VESTIDO SEDA-BÁSICO", "VESTIDO SEDA-FOLHO", "VESTIDO SEDA/BORDADO", "VESTIDO SEDA/ELASTIC", "VESTIDO TECIDO", "VESTIDO TECIDO LANTEJOULAS", "VESTIDO TECIDO PRINT", "VESTIDO TECIDO/PEDR", "VESTIDO TWILL ESTAMPADO", "VESTIDO V-NAPA", "VESTIDO VELUDO BOTÃO", "VESTIDO VELUDO BRILHO", "VESTIDO ZIP C/CINTO", "VESTIDO «COMPRIDA", "VESTIDO ÉTNICA"];

  function procNormalizeDesc(s) {
    return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function procFindDescMatches(q) {
    if (!q || q.length < 2) return [];
    var qn = procNormalizeDesc(q);
    var starts = [], contains = [];
    for (var i = 0; i < BIBLIOTECA.length; i++) {
      var item = BIBLIOTECA[i];
      var itemn = procNormalizeDesc(item);
      if (itemn.indexOf(qn) === 0) starts.push(item);
      else if (itemn.indexOf(qn) !== -1) contains.push(item);
      if (starts.length >= 8 && contains.length >= 8) break;
    }
    return starts.concat(contains).slice(0, 8);
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
      btn.style.cssText = base + (b.style || 'background:#fff;border:1px solid #e0e0e0;color:#000;');
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

  /* ── 4. SAVE / LOAD ── */
  var _procSaveDebounce = null;

  function procSaveSession(manual) {
    if (!_isSynced) {
      if (manual) procSetSyncStatus('syncing', 'a sincronizar…');
      return;
    }
    var key = _activeSessionKey || getSessionKey();
    _activeSessionKey = key;
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

  function procDeleteSession(key) {
    procFloatModal({
      label: 'Eliminar sess\u00e3o',
      title: 'Tens a certeza?',
      body: 'Vais eliminar <strong>' + labelFromKey(key) + '</strong>. Esta a\u00e7\u00e3o \u00e9 irrevers\u00edvel.',
      buttons: [
        { label: '\u274c Eliminar definitivamente',
          style: 'background:#fff0f0;border:1px solid #ffd7d7;color:#c00;font-weight:700;',
          cb: function() {
            procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key), { method: 'DELETE' }).catch(function(){});
            try { localStorage.removeItem(key); } catch(e) {}
            if (_activeSessionKey === key) _activeSessionKey = null;
            procRenderSessionMenu();
          }
        },
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #e0e0e0;color:#000;', cb: null }
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
      + 'border:1px solid #e0e0e0;background:#fff;color:#000;line-height:1.5;';

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
          'border-color:#1565c0;background:#e3f2fd;color:#1565c0;',
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

    /* Init autocomplete + lock */
    procInitProviderInput(fid);
    procUpdateTableLock(fid);

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
      +     '<div class="proc-total-box"><div class="proc-field-label" style="font-size:.6rem">soma das linhas</div>'
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
      +   '<th class="th-a4">FNC</th>'
      +   '<th class="th-a5">PXO</th>'
      +   '<th title="Dividir Qtd. FT igualmente">\u00f7</th>'
      +   '<th>PRC</th>'
      +   '<th>%Desc.</th>'
      +   '<th>!</th>'
      +   '<th>D / +1\u20ac</th>'
      +   '<th>PVP \u20ac</th>'
      +   '<th>Margem</th>'
      +   '<th class="left">OBS</th>'
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
        }, 180);
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
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '</div></td>'
        + '<td class="td-desc">'
        + '<div class="proc-desc-wrap">'
        + '<button class="proc-copy-btn" title="Copiar descri\u00e7\u00e3o" onclick="procCopyBtn(this)">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>'
        + '<input type="text" class="proc-desc-input"'
        + ' oninput="procCheckAutoExpand(' + f + ',' + r + ')">'
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
        + '<td class="proc-cell-computed" id="proc-pvp-'   + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-cell-computed" id="proc-marg-'  + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-obs-cell">'
        +   '<input type="text" class="proc-obs-input" id="proc-obs-' + f + '-' + r + '">'
        +   '<div class="proc-obs-tip" id="proc-obs-tip-' + f + '-' + r + '"></div>'
        + '</td>';
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
      b.style.cssText = 'display:block;width:100%;padding:11px 16px;margin-bottom:8px;text-align:left;font-size:.88rem;font-weight:600;font-family:\'MontserratLight\',sans-serif;background:#fff;border:1px solid #e0e0e0;border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s;color:#000;';
      b.innerHTML = text;
      b.onmouseenter = function(){ b.style.background='#f5f5f5'; b.style.borderColor='#bbb'; };
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
            + '<td class="right">' + l.precio.toFixed(2) + '</td>'
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
      +     ' \u00b7 <strong style="color:#000;font-size:1rem;letter-spacing:-.01em">Total: ' + totalStock.toFixed(2) + '</strong>'
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
      /* ── Session bar — always visible, never blocking ── */
      +   '<div id="proc-session-bar">'
      +     '<span id="proc-session-label" style="font-size:.78rem;font-weight:700;color:#555;white-space:nowrap;display:none;"></span>'
      +     '<span id="proc-saveStatus" class="proc-save-status" style="flex:1;display:none;"></span>'
      +     '<button class="proc-btn" id="proc-sessionMenuBtn" style="white-space:nowrap;">&#128194; sess&#245;es &#x25be;</button>'
      +     '<div id="proc-sessionMenuDropdown" class="proc-session-dropdown hidden" style="top:calc(100% + 6px);right:0;"></div>'
      +     '<button class="proc-btn primary" id="proc-saveBtn" style="display:none;">&#128190; guardar</button>'
      +     '<button class="proc-btn" id="proc-closeSessionBtn" title="Guarda e fecha a sess\u00e3o activa" style="display:none;border-color:#c00;color:#c00;background:#fff0f0;">&#x23CF;&#xFE0F; fechar</button>'
      +     '<button class="proc-btn" id="proc-guiaBtn" style="display:none;border-color:#1565c0;color:#1565c0;background:#e3f2fd;">&#128203; guia</button>'
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
    if (sb) sb.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:10px 0 14px;border-bottom:1px solid #eee;margin-bottom:18px;position:relative;';

    var ss = document.getElementById('proc-session-start');
    if (ss) ss.style.cssText = 'display:flex;justify-content:center;padding:32px 0;';

    var si = document.getElementById('proc-session-start-inner');
    if (si) si.style.cssText = 'width:100%;max-width:460px;background:#fff;border:1px solid #e6e6e6;border-radius:16px;padding:28px 28px 22px;box-shadow:0 4px 20px rgba(0,0,0,.06);font-family:\'MontserratLight\',sans-serif;';

    /* ── Bind buttons ── */
    document.getElementById('proc-saveBtn').addEventListener('click', function() { procSaveSession(true); });
    document.getElementById('proc-sessionMenuBtn').addEventListener('click', function(e) { procToggleSessionMenu(e); });
    document.getElementById('proc-guiaBtn').addEventListener('click', function() { procShowGuiaModal(); });
    document.getElementById('proc-closeSessionBtn').addEventListener('click', function() { procCloseActiveSession(); });
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
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;margin-bottom:6px;border:1px solid #e0e0e0;border-radius:10px;gap:8px;font-family:\'MontserratLight\',sans-serif;">'
        + '<div style="min-width:0;">'
        +   '<div style="font-size:.85rem;font-weight:700;color:#000;">' + label + '</div>'
        +   (meta ? '<div style="font-size:.68rem;font-weight:600;color:#888;margin-top:2px;">' + meta + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-shrink:0;">'
        +   '<button class="proc-start-load-btn" data-key="' + key + '" style="padding:5px 13px;border:1px solid #1565c0;border-radius:7px;background:#e3f2fd;color:#1565c0;font-size:.72rem;font-weight:700;cursor:pointer;font-family:\'MontserratLight\',sans-serif;">\u21a9 carregar</button>'
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

  /* Load a session from the start panel (non-blocking) */
  function procLoadSessionFromStart(key) {
    procSetSyncStatus('syncing', 'a carregar\u2026');
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : localStorage.getItem(key);
        if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', 'sess\u00e3o carregada');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'carregado localmente');
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
    var sb = document.getElementById('proc-session-bar');
    if (sb) sb.style.justifyContent = 'space-between';
    /* Update label in session bar */
    var lbl = document.getElementById('proc-session-label');
    if (lbl && key) { lbl.textContent = labelFromKey(key); lbl.style.display = ''; }
    /* Show close button */
    var closeBtn = document.getElementById('proc-closeSessionBtn');
    if (closeBtn) closeBtn.style.display = '';
  }

  function procShowStartArea() {
    var start = document.getElementById('proc-session-start');
    var main  = document.getElementById('proc-main-area');
    if (start) start.style.display = 'flex';
    if (main)  main.style.display  = 'none';
    var lbl = document.getElementById('proc-session-label');
    if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
    var closeBtn = document.getElementById('proc-closeSessionBtn');
    if (closeBtn) closeBtn.style.display = 'none';
    /* Hide save and guia, recenter bar */
    var saveBtn = document.getElementById('proc-saveBtn');
    var guiaBtn = document.getElementById('proc-guiaBtn');
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveBtn) saveBtn.style.display = 'none';
    if (guiaBtn) guiaBtn.style.display = 'none';
    if (saveStatus) saveStatus.style.display = 'none';
    var sb = document.getElementById('proc-session-bar');
    if (sb) sb.style.justifyContent = 'center';
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
          style: 'background:#fff0f0;border:1px solid #ffc8c8;color:#c00;font-weight:700;',
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
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #e0e0e0;color:#000;', cb: null }
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
  }

  /* ── 18. OVERLAY OPEN / CLOSE ── */
  function openProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    requestAnimationFrame(function() { overlay.classList.add('visible'); });

    var content = document.getElementById('proc-content');
    if (!content) {
      var root = document.getElementById('proc-root');
      if (root) initProcessamento(root);
    } else if (!_isSynced) {
      /* Returned after closing session — refresh start panel */
      procShowStartArea();
    }
  }

  function closeProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
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

  function procShowGuiaModal() {
    var allRows  = procBuildGuiaRows();
    var pendRows = allRows.filter(function(r){ return !r.done; });
    var sentRows = allRows.filter(function(r){ return  r.done; });

    if (!allRows.length) {
      procFloatModal({
        title: 'Sem distribuição',
        body:  'Nenhuma fatura tem pe\u00e7as distribu\u00eddas por armazém. Preenche as colunas Funchal e Porto Santo primeiro.',
        buttons: [{ label: 'OK', cb: null }]
      });
      return;
    }

    var old = document.getElementById('proc-guia-modal');
    if (old) old.parentNode.removeChild(old);

    var nFaturas = activeFaturas.length;
    var title    = 'Guia Consolidada \u00b7 ' + nFaturas + ' fatura' + (nFaturas !== 1 ? 's' : '');
    var fPend    = pendRows.reduce(function(s,r){ return s+r.pendF; }, 0);
    var pPend    = pendRows.reduce(function(s,r){ return s+r.pendP; }, 0);
    var fSent    = sentRows.reduce(function(s,r){ return s+r.totalF; }, 0);
    var pSent    = sentRows.reduce(function(s,r){ return s+r.totalP; }, 0);

    var COL_G = ['Ref. Funchal', 'Qtd. F', 'Ref. Porto Santo', 'Qtd. PS'];

    function buildTableRows(rowList) {
      if (!rowList.length) return '<tr><td colspan="5" class="proc-guia-empty">Sem refer\u00eancias pendentes</td></tr>';

      /* Separate into FNC-only list and PXO-only list, then pair them row by row */
      var fRows = rowList.filter(function(r){ return (r.done ? r.totalF : r.pendF) > 0; });
      var pRows = rowList.filter(function(r){ return (r.done ? r.totalP : r.pendP) > 0; });
      var maxLen = Math.max(fRows.length, pRows.length);
      var html = '';
      for (var i = 0; i < maxLen; i++) {
        var fRow = fRows[i] || null;
        var pRow = pRows[i] || null;
        var refRow = fRow || pRow;
        var cls = refRow.done ? ' proc-guia-row-sent' : (i%2===0 ? ' proc-guia-row-even' : ' proc-guia-row-odd');
        var fRef = fRow ? fRow.ref : '';
        var fQty = fRow ? (fRow.done ? fRow.totalF : fRow.pendF) : '';
        var pRef = pRow ? pRow.ref : '';
        var pQty = pRow ? (pRow.done ? pRow.totalP : pRow.pendP) : '';
        html += '<tr class="proc-guia-tr' + cls + '">'
          + '<td class="proc-guia-td proc-guia-ref-f" data-gcol="0">' + fRef + '</td>'
          + '<td class="proc-guia-td proc-guia-qty-f" data-gcol="1">' + (fQty !== '' ? fQty : '') + '</td>'
          + '<td class="proc-guia-td proc-guia-sep-td"></td>'
          + '<td class="proc-guia-td proc-guia-ref-p" data-gcol="2">' + pRef + '</td>'
          + '<td class="proc-guia-td proc-guia-qty-p" data-gcol="3">' + (pQty !== '' ? pQty : '') + '</td>'
          + '</tr>';
      }
      return html;
    }

    var copyBar = '<div class="proc-guia-copy-bar">'
      + '<span class="proc-guia-copy-label">copiar coluna:</span>'
      + COL_G.map(function(lbl,ci){
          return '<button class="proc-guia-copy-btn" data-gcol="' + ci + '">\u29c9 ' + lbl + '</button>';
        }).join('')
      + '<span class="proc-guia-copy-msg" id="proc-guia-copy-msg"></span>'
      + '</div>';

    var sentSection = sentRows.length
      ? '<tr class="proc-guia-sent-hdr"><td colspan="5">\u2713 J\u00e1 enviado ('
        + sentRows.length + ' refs \u00b7 ' + fSent + ' F \u00b7 ' + pSent + ' PS)</td></tr>'
        + buildTableRows(sentRows)
      : '';

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
      +     '<div id="proc-guia-header-btns">'
      +       '<button id="proc-guia-confirm-btn" class="proc-guia-action-btn proc-guia-confirm"'
      +         (pendRows.length===0?' disabled':'') + '>\u2713 Confirmar envio</button>'
      +       '<button id="proc-guia-export-btn" class="proc-guia-action-btn">\u2b07 Exportar CSV</button>'
      +       '<button id="proc-guia-close-btn" class="proc-guia-close-btn">\u00d7</button>'
      +     '</div>'
      +   '</div>'
      +   copyBar
      +   '<div id="proc-guia-scroll">'
      +     '<table id="proc-guia-table">'
      +       '<thead><tr>'
      +         '<th class="proc-guia-th proc-guia-th-f" colspan="2">\ud83d\udd35 FUNCHAL (A4) \u00b7 ' + fPend + ' un. pendentes</th>'
      +         '<th class="proc-guia-th proc-guia-th-sep"></th>'
      +         '<th class="proc-guia-th proc-guia-th-p" colspan="2">\ud83d\udd34 PORTO SANTO (A5) \u00b7 ' + pPend + ' un. pendentes</th>'
      +       '</tr><tr>'
      +         '<th class="proc-guia-th2">Refer\u00eancia</th>'
      +         '<th class="proc-guia-th2" style="text-align:center">Qtd.</th>'
      +         '<th class="proc-guia-th-sep"></th>'
      +         '<th class="proc-guia-th2">Refer\u00eancia</th>'
      +         '<th class="proc-guia-th2" style="text-align:center">Qtd.</th>'
      +       '</tr></thead>'
      +       '<tbody>' + buildTableRows(pendRows) + sentSection + '</tbody>'
      +     '</table>'
      +   '</div>'
      +   '<div id="proc-guia-footer">'
      +     pendRows.length + ' refs pendentes \u00b7 ' + fPend + ' un. Funchal \u00b7 ' + pPend + ' un. Porto Santo'
      +     (sentRows.length ? ' \u00b7 ' + sentRows.length + ' j\u00e1 enviadas' : '')
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('proc-guia-visible'); });

    function closeModal() {
      modal.classList.remove('proc-guia-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
    }

    /* Address chip copy */
    modal.querySelectorAll('.proc-guia-addr-chip').forEach(function(chip){
      chip.addEventListener('click', function(){
        var text = chip.getAttribute('data-addr');
        function flash(){ chip.classList.add('proc-addr-copied'); setTimeout(function(){ chip.classList.remove('proc-addr-copied'); }, 1600); }
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
          copyMsg.style.color = ok ? '#2e7d32' : '#b05000';
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
        + '<strong>' + fPend + '</strong> un. Funchal \u00b7 <strong>' + pPend + '</strong> un. Porto Santo<br><br>'
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
        procConfirmGuiaEnvio(pendRows);
        confirmDiv.parentNode.removeChild(confirmDiv);
        closeModal();
        setTimeout(function(){ procShowGuiaModal(); }, 280);
      });
    });

    /* Export CSV */
    modal.querySelector('#proc-guia-export-btn').addEventListener('click', function(){
      var fRows = pendRows.filter(function(r){ return r.pendF>0; });
      var pRows = pendRows.filter(function(r){ return r.pendP>0; });
      var lines = ['\uFEFF' + 'Referencia;Qtd Funchal;Referencia;Qtd Porto Santo'];
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

  /* Override procSaveSession payload to include sentRefs */
  var _origSaveSession = procSaveSession;
  procSaveSession = function(manual) {
    /* Inject sentRefs into payload by patching the save temporarily */
    _origSaveSession(manual);
    /* Re-save with sentRefs included */
    var key = _activeSessionKey;
    if (!key) return;
    try {
      var stored = JSON.parse(localStorage.getItem(key) || '{}');
      stored.sentRefs = _procSentRefs;
      localStorage.setItem(key, JSON.stringify(stored));
    } catch(e) {}
  };
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
  window.procUpdateTableLock     = procUpdateTableLock;
  window.procObsSync             = procObsSync;
  window.procShowGuiaModal       = procShowGuiaModal;
  window.procCopyBtn             = procCopyBtn;
  window.procLimitDigits         = procLimitDigits;

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
