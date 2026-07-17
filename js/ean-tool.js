(function () {
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
  //  CSS — prefijado con ean- para no colisionar con tam.js
  //  font-family hereda de MontserratLight (definida en el index/tam)
  //  colores base (#111, #000, #fff) se heredan del documento
  // ═══════════════════════════════════════════════════════════════
  var CSS = [
    /* ── overlay principal ── */
    '#ean-tool-overlay { display:none; position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.55) !important; align-items:center; justify-content:center; padding:16px; }',
    '#ean-tool-overlay.ean-open { display:flex; }',

    /* ── ventana flotante ── */
    '#ean-tool-wrap { background:#fff !important; color:#111 !important; border-radius:12px; width:min(480px,96vw); max-height:92vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,.22); font-family:\'MontserratLight\',sans-serif; }',

    /* ── cabecera interna de la ventana ── */
    /* ══════════════════════════════════════════════════════════════
     REGLA DE ORO — NUNCA VIOLAR:
     Fondo oscuro → letras claras (color:#fff !important o similar)
     Fondo claro  → letras oscuras (color:#111 !important o similar)
     Cualquier cambio en colores de fondo DEBE revisar el color del texto.
    ══════════════════════════════════════════════════════════════ */
    '#ean-tool-header { background:#1a1a1a !important; color:#fff !important; padding:12px 18px; display:flex; align-items:center; gap:10px; flex-shrink:0; }',
    '#ean-tool-header-title { font-size:.9rem; font-weight:700; letter-spacing:.04em; flex:1; color:#fff !important; }',
    '#ean-tool-close { width:28px; height:28px; border-radius:6px; border:1px solid #444 !important; background:none !important; color:#aaa !important; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:.85rem; transition:color .12s,border-color .12s; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-tool-close:hover { color:#fff !important; border-color:#888 !important; }',

    /* ── zona de acción (botones EAN + progreso + error) ── */
    '#ean-action-row { display:flex; align-items:center; justify-content:center; gap:10px; padding:14px 18px 0; flex-shrink:0; }',

    /* ── botón EAN (drag zone) ── */
    '#ean-drop-zone { width:46px; height:46px; border-radius:50%; border:2px solid #111; background:#111 !important; color:#fff !important; font-size:.62rem; font-weight:800; letter-spacing:.06em; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; align-self:center; transition:background .14s,color .14s; user-select:none; text-transform:uppercase; line-height:1; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-drop-zone:hover, #ean-drop-zone.ean-drag-over { background:#333 !important; border-color:#333 !important; }',

    /* ── contador de archivos ── */
    '#ean-file-count { font-size:.7rem; color:#111 !important; letter-spacing:0; display:none; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-file-count.ean-visible { display:inline-block; }',

    /* ── botón círculo (abrir modal de resultados) ── */
    '#ean-btn-open-modal { width:46px; height:46px; border-radius:50%; border:2px solid #111; background:#fff !important; color:#111 !important; font-size:1.3rem; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; align-self:center; transition:background .14s,color .14s; line-height:1; }',
    '#ean-btn-open-modal:hover:not(:disabled) { background:#111 !important; color:#fff !important; }',
    '#ean-btn-open-modal:disabled { border-color:#ccc !important; color:#ccc !important; cursor:not-allowed; }',
    '#ean-btn-open-modal.ean-has-results { border-color:#111 !important; color:#111 !important; }',

    /* ── barra de progreso ── */
    '#ean-progress-wrap { padding:8px 18px 0; display:none; flex-shrink:0; }',
    '#ean-progress-wrap.ean-visible { display:block; }',
    '#ean-progress-track { height:2px; background:#ddd !important; border-radius:99px; overflow:hidden; }',
    '#ean-progress-fill { height:100%; background:#111 !important; width:0%; transition:width .25s; }',
    '#ean-progress-lbl { font-size:.68rem; color:#999 !important; margin-top:5px; font-family:\'MontserratLight\',sans-serif; }',

    /* ── error ── */
    '#ean-error-wrap { padding:8px 18px 0; display:none; flex-shrink:0; }',
    '#ean-error-wrap.ean-visible { display:block; }',
    '#ean-error-box { background:#fff0f0 !important; border:1px solid #f5c0c0; border-radius:7px; padding:10px 14px; font-size:.74rem; color:#c00 !important; font-family:\'MontserratLight\',sans-serif; }',

    /* ── delivery notes encontradas (cruce EAN → referência) ── */
    '#ean-dn-wrap { padding:8px 18px 14px; display:none; flex-shrink:0; }',
    '#ean-dn-wrap.ean-visible { display:block; }',
    '#ean-dn-box { background:#f0f7f4 !important; border:1px solid #bcd9cc; border-radius:7px; padding:10px 14px; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-dn-title { font-weight:700; font-size:.76rem; margin-bottom:6px; color:#111 !important; }',
    '#ean-dn-list { display:flex; flex-direction:column; gap:2px; margin-bottom:8px; max-height:110px; overflow-y:auto; }',
    '.ean-dn-item { font-family:\'Courier New\',monospace; font-size:.72rem; color:#333 !important; }',
    '#ean-dn-unresolved { font-size:.7rem; color:#9B4D4D !important; margin-bottom:8px; }',
    '#ean-dn-apply-btn { width:100%; padding:8px; border-radius:7px; border:1px solid #111 !important; background:#111 !important; color:#fff !important; cursor:pointer; font-family:\'MontserratLight\',sans-serif; font-size:.76rem; font-weight:700; transition:background .12s; }',
    '#ean-dn-apply-btn:hover { background:#333 !important; }',
    '#ean-dn-apply-btn:disabled { background:#ccc !important; border-color:#ccc !important; cursor:not-allowed; }',

    /* ── MODAL RESULTADOS ── */
    '#ean-modal-overlay { display:none; position:fixed; inset:0; z-index:10001; background:rgba(0,0,0,.5) !important; align-items:center; justify-content:center; padding:16px; }',
    '#ean-modal-overlay.ean-open { display:flex; }',
    '#ean-modal-box { background:#fff !important; color:#111 !important; border-radius:12px; width:100%; max-width:520px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,.22); font-family:\'MontserratLight\',sans-serif; }',
    '#ean-modal-hdr { background:#1a1a1a !important; color:#fff !important; padding:14px 18px; display:flex; align-items:center; gap:10px; flex-shrink:0; }',
    '#ean-modal-hdr-texts { flex:1; }',
    '#ean-modal-hdr-title { font-size:.92rem; font-weight:700; color:#fff !important; }',
    '#ean-modal-hdr-actions { display:flex; align-items:center; gap:8px; }',
    '#ean-modal-close { width:28px; height:28px; border-radius:6px; border:1px solid #444 !important; background:none !important; color:#aaa !important; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:.85rem; transition:color .12s,border-color .12s; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-modal-close:hover { color:#fff !important; border-color:#888 !important; }',
    '.ean-btn-download-excel { display:flex; align-items:center; gap:5px; padding:5px 11px; border-radius:5px; border:1px solid #444 !important; background:none !important; color:#aaa !important; font-size:.65rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; cursor:pointer; transition:color .12s,border-color .12s; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-btn-download-excel:hover { color:#fff !important; border-color:#aaa !important; }',
    '.ean-btn-save-sb { display:flex; align-items:center; gap:5px; padding:5px 11px; border-radius:5px; border:1px solid #3a6a3a !important; background:none !important; color:#5caa5c !important; font-size:.65rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; cursor:pointer; transition:color .12s,border-color .12s,opacity .12s; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-btn-save-sb:hover { color:#7fd17f !important; border-color:#7fd17f !important; }',
    '.ean-btn-save-sb:disabled { opacity:.4; cursor:default; }',
    '#ean-modal-stats { padding:9px 18px; background:#f8f8f8 !important; border-bottom:1px solid #eee; display:flex; gap:20px; flex-shrink:0; align-items:center; }',
    '.ean-stat-item { display:flex; flex-direction:column; gap:1px; }',
    '.ean-stat-val { font-size:.88rem; font-weight:700; color:#111 !important; }',
    '.ean-stat-lbl { font-size:.58rem; text-transform:uppercase; letter-spacing:.09em; color:#aaa !important; }',
    '#ean-audit-summary { font-size:.62rem; color:#aaa !important; margin-left:auto; display:flex; align-items:center; gap:5px; display:none; }',
    '.ean-audit-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }',
    '.ean-audit-dot.ean-clean { background:#4caf50 !important; }',
    '.ean-audit-dot.ean-issues { background:#f59e0b !important; }',
    '.ean-audit-dot.ean-errors { background:#ef4444 !important; }',
    '#ean-modal-search-wrap { padding:10px 20px; border-bottom:1px solid #eee; flex-shrink:0; }',
    '#ean-modal-search { width:100%; border:1px solid #ddd; border-radius:6px; padding:7px 11px; font-size:.78rem; color:#111 !important; outline:none; transition:border-color .14s; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-modal-search:focus { border-color:#555 !important; }',
    '#ean-modal-search::placeholder { color:#ccc !important; }',
    '#ean-modal-body { overflow-y:auto; flex:1; padding:0; }',
    '#ean-modal-body::-webkit-scrollbar { width:4px; }',
    '#ean-modal-body::-webkit-scrollbar-thumb { background:#ddd !important; border-radius:99px; }',

    /* ── bloques de referencia ── */
    '.ean-ref-block { padding:14px 20px 12px; border-bottom:1px solid #f0f0f0; }',
    '.ean-ref-block:last-child { border-bottom:none; }',
    '.ean-ref-block:hover { background:#fafafa !important; }',
    '.ean-ref-top-line { display:flex; align-items:baseline; gap:10px; }',
    '.ean-ref-code { font-size:.9rem; font-weight:800; color:#111 !important; cursor:pointer; padding:1px 5px; border-radius:4px; border:1px solid transparent; transition:background .12s,border-color .12s; white-space:nowrap; user-select:none; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-ref-code:hover { background:#f0f0f0 !important; border-color:#ddd !important; }',
    '.ean-ref-code.ean-copied { background:#f0f0f0 !important; border-color:#111 !important; color:#000 !important; }',
    '.ean-ref-name { font-size:.82rem; color:#111 !important; flex:0 1 auto; cursor:pointer; padding:1px 5px; border-radius:4px; border:1px solid transparent; transition:background .12s; user-select:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-ref-name:hover { background:#f0f0f0 !important; border-color:#ddd !important; color:#555 !important; }',
    '.ean-ref-name.ean-copied { background:#f0f0f0 !important; border-color:#111 !important; color:#000 !important; }',
    '.ean-ref-name.ean-empty { color:#ccc !important; font-style:italic; }',
    '.ean-ref-pvp { font-size:.82rem; font-weight:700; color:#111 !important; cursor:pointer; padding:1px 5px; border-radius:4px; border:1px solid transparent; transition:background .12s; white-space:nowrap; flex-shrink:0; user-select:none; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-ref-pvp:hover { background:#f0f0f0 !important; border-color:#ddd !important; }',
    '.ean-ref-pvp.ean-copied { background:#f0f0f0 !important; border-color:#111 !important; color:#000 !important; }',
    '.ean-ref-pvp.ean-empty { color:#ccc !important; }',
    '.ean-list { margin-top:6px; display:flex; flex-direction:column; gap:4px; }',
    '.ean-chip { display:block; width:100%; background:#f5f5f5 !important; border:1px solid #e8e8e8; border-radius:6px; padding:7px 12px; font-family:\'Courier New\',Courier,monospace; font-size:.82rem; color:#333 !important; cursor:pointer; transition:background .12s,border-color .12s; user-select:none; }',
    '.ean-chip:hover { background:#eee !important; border-color:#ccc !important; color:#111 !important; }',
    '.ean-chip.ean-copied { background:#eee !important; border-color:#111 !important; color:#111 !important; }',
    '.ean-ref-code.ean-done, .ean-ref-name.ean-done, .ean-ref-pvp.ean-done { border-color:#111 !important; }',
    '.ean-ref-code.ean-done::after, .ean-ref-name.ean-done::after, .ean-ref-pvp.ean-done::after { content:" ✓"; font-size:.72em; font-weight:700; color:#111; }',
    '.ean-chip.ean-done { border-color:#111 !important; }',
    '.ean-chip.ean-invalid { border-color:#f0a0a0 !important; background:#fde8e8 !important; color:#9b1c1c !important; }',
    '.ean-empty-state { text-align:center; padding:48px 20px; display:none; }',
    '.ean-empty-state.ean-visible { display:block; }',
    '.ean-empty-icon { font-size:1.6rem; margin-bottom:8px; }',
    '.ean-empty-title { font-size:.85rem; font-weight:600; color:#888 !important; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-empty-sub { font-size:.7rem; color:#bbb !important; margin-top:3px; font-family:\'MontserratLight\',sans-serif; }',

    /* ── audit flags ── */
    '.ean-audit-bar { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; padding-left:2px; }',
    '.ean-audit-flag { font-size:.58rem; font-weight:700; letter-spacing:.04em; padding:2px 7px; border-radius:4px; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-audit-flag.ean-warn { background:#fff8e1 !important; color:#7a5800 !important; border:1px solid #f0d080; }',
    '.ean-audit-flag.ean-error { background:#fde8e8 !important; color:#9b1c1c !important; border:1px solid #f0a0a0; }',

    /* ── DN footer ── */
    '.ean-dn-footer { margin-top:8px; padding-top:7px; border-top:1px dashed #ebebeb; display:flex; flex-wrap:wrap; gap:5px; align-items:center; }',
    '.ean-dn-label { font-size:.62rem; text-transform:uppercase; letter-spacing:.1em; color:#111 !important; margin-right:2px; flex-shrink:0; font-family:\'MontserratLight\',sans-serif; }',
    '.ean-dn-chip { font-family:\'Courier New\',monospace; font-size:.72rem; color:#111 !important; background:#f0f0f0 !important; border:1px solid #ddd; border-radius:4px; padding:2px 8px; cursor:pointer; transition:color .12s,border-color .12s,background .12s; user-select:none; white-space:nowrap; }',
    '.ean-dn-chip:hover { color:#000 !important; border-color:#111 !important; background:#e8e8e8 !important; }',
    '.ean-dn-chip.ean-copied { color:#000 !important; border-color:#111 !important; background:#eee !important; }',
    '.ean-dn-chip.ean-done { border-color:#111 !important; }',
    '.ean-dn-chip.ean-done::after { content:" ✓"; font-size:.72em; font-weight:700; color:#111; }',

    /* ── toast ── */
    '#ean-copy-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%) translateY(8px); background:#222 !important; color:#fff !important; font-size:.7rem; padding:7px 16px; border-radius:100px; pointer-events:none; opacity:0; transition:opacity .18s,transform .18s; z-index:10002; white-space:nowrap; font-family:\'MontserratLight\',sans-serif; }',
    '#ean-copy-toast.ean-show { opacity:1; transform:translateX(-50%) translateY(0); }'
  ].join('\n');

  // ── Inyectar estilos ──
  var styleEl = document.createElement('style');
  styleEl.id  = 'ean-tool-styles';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

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
  };

  // Ponto de entrada único: abre a ferramenta e entrega-lhe directamente
  // os ficheiros escolhidos no botão "delivery note" de tam.js (Excel
  // e PDF passam a ser analisados sempre pelo mesmo motor).
  window.tamEanToolIngestFiles = function (files) {
    toolOverlay.classList.add('ean-open');
    addFiles(Array.prototype.slice.call(files));
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
      setProg(100, 'Consultando biblioteca EANs…');
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

})();
