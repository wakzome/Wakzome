// ══════════════════════════════════════════════════════════════
//  PARFOIS — invoice parser · WAK04 Ilha Dourada  v3
//  · Motor A: column-aware (Y-position grouping + content detection)
//  · Motor B: X-range positional column mapping
//  · Motor C: box-anchor strategy (S6... code triggers article read)
//  · Cross-validation vs invoice totals
//  · Engine selector when motors diverge (like TAM)
//  · Stock modal: Referencia | ARM | IVA | € | Qtd. (col copy)
//  · Barcode overlay: Ref + Nombre + EAN
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONSTANTS & STATE
  ══════════════════════════════════════════════════════════════ */
  var PF_LS_KEY     = 'parfois_week_session_v3';
  var PF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var pfState = {
    invoices:      [],
    activeEngines: {},   // { fileName: 'A'|'B'|'C' }
    engineCache:   {},   // { fileName: { A: result, B: result, C: result } }
    collapsed:     {},   // { fileName: true } — collapsed invoices
    sessionName:   '',
    createdAt:     null
  };

  /* ══════════════════════════════════════════════════════════════
     WEEK SESSION
  ══════════════════════════════════════════════════════════════ */
  function pfWeekName() {
    var d    = new Date();
    var day  = d.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    var mon  = new Date(d);
    mon.setDate(d.getDate() + diff);
    var dd   = String(mon.getDate()).padStart(2, '0');
    var mm   = String(mon.getMonth() + 1).padStart(2, '0');
    var yyyy = mon.getFullYear();
    return 'Parfois ' + dd + '/' + mm + '/' + yyyy;
  }

  /* ══════════════════════════════════════════════════════════════
     LOCALSTORAGE
  ══════════════════════════════════════════════════════════════ */
  function pfSave() {
    try {
      localStorage.setItem(PF_LS_KEY, JSON.stringify({
        sessionName:   pfState.sessionName,
        createdAt:     pfState.createdAt,
        invoices:      pfState.invoices,
        activeEngines: pfState.activeEngines
      }));
    } catch(e) {}
  }

  function pfLoad() {
    try {
      var raw = localStorage.getItem(PF_LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var weekName = pfWeekName();
      if (!data.sessionName || data.sessionName !== weekName) return false;
      pfState.sessionName   = data.sessionName;
      pfState.createdAt     = data.createdAt;
      pfState.invoices      = data.invoices || [];
      pfState.activeEngines = data.activeEngines || {};
      return pfState.invoices.length > 0;
    } catch(e) { return false; }
  }

  function pfClear() {
    try { localStorage.removeItem(PF_LS_KEY); } catch(e) {}
    pfState.invoices      = [];
    pfState.activeEngines = {};
    pfState.engineCache   = {};
    pfState.sessionName   = pfWeekName();
    pfState.createdAt     = Date.now();
  }

  /* ══════════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════════ */
  function pfStyles() {
    if (document.getElementById('pf-styles')) return;
    var s = document.createElement('style');
    s.id = 'pf-styles';
    s.textContent = [
      /* ── Layout ── */
      '#pf-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:220;flex-direction:column;opacity:0;transition:opacity 0.45s cubic-bezier(0.22,1,0.36,1);overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '#pf-overlay.open{display:flex;}',
      '#pf-overlay.visible{opacity:1;}',
      '#pf-bar{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #e6e6e6;background:#fff;flex-shrink:0;flex-wrap:wrap;position:sticky;top:0;z-index:10;}',
      '#pf-back{font-size:.9rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#000;border:1.5px solid #000;padding:7px 16px 7px 12px;border-radius:10px;transition:background .2s,transform .15s;text-transform:lowercase;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,0.18);display:inline-flex;align-items:center;gap:8px;}',
      '#pf-back:hover{background:#333;border-color:#333;transform:translateY(-1px);}',
      '#pf-title{font-size:.82rem;font-weight:bold;text-transform:lowercase;letter-spacing:.06em;color:#000;}',
      '#pf-session-lbl{font-size:.72rem;color:#aaa;margin-left:auto;white-space:nowrap;}',
      '#pf-clear-btn{font-size:.72rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#666;border:1.5px solid #666;padding:5px 12px;border-radius:8px;transition:background .2s;text-transform:lowercase;white-space:nowrap;}',
      '#pf-clear-btn:hover{background:#333;border-color:#333;}',
      '#pf-content{display:flex;flex-direction:column;align-items:center;padding:28px 16px 60px;font-family:\'MontserratLight\',sans-serif;}',
      '#pf-drop-area{width:100%;max-width:680px;border:2px dashed #ccc;border-radius:14px;padding:32px 24px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:#fafafa;margin-bottom:20px;box-sizing:border-box;}',
      '#pf-drop-area:hover,#pf-drop-area.drag-over{border-color:#555;background:#f0f0f0;}',
      '#pf-drop-lbl{font-size:.88rem;font-weight:600;color:#555;}',
      '#pf-drop-sub{font-size:.72rem;color:#bbb;margin-top:5px;}',
      '#pf-file-input{display:none;}',
      '#pf-status-bar{width:100%;max-width:680px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px;}',
      '#pf-status-msg{font-size:.82rem;font-weight:bold;color:#555;}',
      /* ── Buttons ── */
      '.pf-btn{font-size:.78rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:7px 14px;border-radius:8px;border:1.5px solid #ccc;background:#fff;color:#000!important;transition:background .15s,border-color .15s;text-transform:lowercase;white-space:nowrap;}',
      '.pf-btn:hover{background:#f0f0f0;border-color:#888;}',
      '.pf-btn-dark{background:#222!important;color:#fff!important;border-color:#222!important;}',
      '.pf-btn-dark:hover{background:#444!important;border-color:#444!important;}',
      '.pf-btn-mid{background:#555!important;color:#fff!important;border-color:#555!important;}',
      '.pf-btn-mid:hover{background:#333!important;border-color:#333!important;}',
      /* ── Invoice blocks ── */
      '.pf-inv-block{width:100%;max-width:680px;margin-bottom:28px;border:1.5px solid #e0e0e0;border-radius:14px;overflow:hidden;}',
      '.pf-inv-block.pf-collapsed .pf-inv-body{display:none;}',
      '.pf-inv-hdr{background:#222;padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;}',
      ,
      '.pf-inv-num{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.04em;white-space:nowrap;}',
      '.pf-inv-meta{font-size:.68rem;color:rgba(255,255,255,0.6)!important;white-space:nowrap;}',
      '.pf-inv-total{font-size:.82rem;font-weight:bold;color:#fff!important;white-space:nowrap;flex-shrink:0;}',
      '.pf-inv-acts{display:flex;gap:6px;flex-wrap:nowrap;align-items:center;}',
      /* ── Engine selector (same pattern as TAM) ── */
      '.pf-engine-sel-wrap{padding:8px 16px;background:#f8f8f8;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
      '.pf-engine-sel-wrap em{font-size:.72rem;color:#888;font-style:normal;}',
      '.pf-engine-btns{display:flex;gap:6px;flex-wrap:wrap;}',
      '.pf-engine-btn{font-size:.72rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:5px 12px;border-radius:6px;border:1.5px solid #ccc;background:#fff;color:#000!important;transition:background .15s,border-color .15s;text-transform:uppercase;letter-spacing:.06em;}',
      '.pf-engine-btn:hover{background:#f0f0f0;border-color:#888;}',
      '.pf-engine-btn.active{background:#222!important;color:#fff!important;border-color:#222!important;}',
      '.pf-engine-auto{background:#2a5a2a!important;color:#fff!important;border-color:#2a5a2a!important;}',
      '.pf-engine-auto:hover{background:#1a3a1a!important;border-color:#1a3a1a!important;}',
      '.pf-engine-conflict{background:#7a3a00!important;color:#fff!important;border-color:#7a3a00!important;}',
      /* ── Badges ── */
      '.pf-badge{font-size:.65rem;font-weight:bold;padding:3px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;}',
      '.pf-ok{background:#2a5a2a!important;color:#fff!important;}',
      '.pf-err{background:#7a1a1a!important;color:#fff!important;}',
      '.pf-warn{background:#555!important;color:#fff!important;}',
      '.pf-val-row{margin:0 16px 10px;padding:8px 12px;border-radius:8px;font-size:.75rem;font-weight:bold;}',
      '.pf-val-row.ok{background:#e8f5e8;border:1px solid #b0d0b0;color:#1a4a1a!important;}',
      '.pf-val-row.err{background:#fdf0f0;border:1px solid #e0b0b0;color:#6a1010!important;}',
      /* ── Table ── */
      '.pf-table-wrap{overflow-x:auto;}',
      '.pf-table{width:100%;border-collapse:collapse;font-family:\'MontserratLight\',sans-serif;}',
      '.pf-table th{background:#444;color:#fff!important;font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;padding:8px 10px;text-align:left;border-bottom:2px solid #333;}',
      '.pf-table td{font-size:.8rem;font-weight:600;padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#000!important;vertical-align:middle;}',
      '.pf-table tr:last-child td{border-bottom:none;}',
      '.pf-table tbody tr:hover td{background:#f9f9f9;}',
      '.pf-td-ref{font-weight:bold!important;letter-spacing:.04em;}',
      '.pf-td-name{color:#444!important;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pf-td-r{text-align:right!important;font-variant-numeric:tabular-nums;}',
      '.pf-table tfoot td{background:#f5f5f5!important;font-weight:bold!important;border-top:2px solid #ddd;font-size:.8rem;color:#000!important;}',
      '.pf-empty{text-align:center;padding:50px 20px;color:#ccc;font-size:.88rem;font-weight:600;}',
      /* ── Spinner ── */
      '#pf-spinner{display:none;position:fixed;inset:0;z-index:999;background:rgba(255,255,255,0.88);align-items:center;justify-content:center;flex-direction:column;gap:14px;}',
      '#pf-spinner.on{display:flex;}',
      '.pf-spin{width:36px;height:36px;border:3px solid #ddd;border-top-color:#333;border-radius:50%;animation:pf-spin .7s linear infinite;}',
      '.pf-spin-txt{font-size:.82rem;font-weight:bold;color:#666;}',
      '@keyframes pf-spin{to{transform:rotate(360deg);}}',
      /* ── Barcode overlay ── */
      '#pf-bc-overlay{display:none;position:fixed;inset:0;z-index:310;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);align-items:center;justify-content:center;}',
      '#pf-bc-overlay.open{display:flex;}',
      '#pf-bc-panel{background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:540px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);}',
      '#pf-bc-hdr{background:#222;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#pf-bc-title{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.07em;text-transform:uppercase;}',
      '#pf-bc-close{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;line-height:1;}',
      '#pf-bc-close:hover{background:rgba(255,255,255,0.15);}',
      '#pf-bc-body{overflow-y:auto;padding:0 0 8px;flex:1;}',
      '.pf-bc-group{border-bottom:1px solid #ececec;padding:10px 18px 8px;}',
      '.pf-bc-group:last-child{border-bottom:none;}',
      '.pf-bc-group-hdr{display:flex;align-items:baseline;gap:10px;margin-bottom:6px;}',
      '.pf-bc-ref{font-size:.78rem;font-weight:bold;color:#000!important;letter-spacing:.05em;cursor:pointer;padding:2px 5px;border-radius:4px;transition:background .15s;}',
      '.pf-bc-ref:hover{background:#f0f0f0;}',
      '.pf-bc-name{font-size:.72rem;color:#888!important;cursor:pointer;padding:2px 5px;border-radius:4px;transition:background .15s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}',
      '.pf-bc-name:hover{background:#f0f0f0;}',
      '.pf-bc-eans{display:flex;flex-direction:column;gap:4px;}',
      '.pf-bc-code{font-size:.85rem;font-weight:bold;color:#000!important;letter-spacing:.1em;background:#f5f5f5;padding:5px 12px;border-radius:6px;border:1px solid #e0e0e0;white-space:nowrap;font-variant-numeric:tabular-nums;cursor:pointer;display:inline-block;transition:background .15s,border-color .15s;}',
      '.pf-bc-code:hover{background:#e8e8e8;border-color:#bbb;}',
      '.pf-bc-copied{background:#e8f5e8!important;border-color:#a0c8a0!important;color:#1a4a1a!important;}',
      /* ── Stock modal (same pattern as TAM tamShowStockModal) ── */
      '#pf-st-modal{display:none;position:fixed;inset:0;z-index:310;}',
      '#pf-st-modal.pf-st-visible{display:block;}',
      '#pf-st-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}',
      '#pf-st-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:600px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);}',
      '#pf-st-header{background:#222;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:12px;}',
      '#pf-st-title-wrap{display:flex;flex-direction:column;gap:3px;}',
      '#pf-st-inv-label{font-size:.88rem;font-weight:bold;color:#fff!important;letter-spacing:.05em;}',
      '#pf-st-sub-label{font-size:.68rem;color:rgba(255,255,255,0.55)!important;letter-spacing:.04em;}',
      '#pf-st-actions{display:flex;align-items:center;gap:8px;}',
      '.pf-st-action-btn{font-size:.72rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff!important;transition:background .15s;text-transform:lowercase;}',
      '.pf-st-action-btn:hover{background:rgba(255,255,255,0.15);}',
      '.pf-st-close-btn{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;line-height:1;}',
      '.pf-st-close-btn:hover{background:rgba(255,255,255,0.15);}',
      '#pf-st-scroll{overflow-y:auto;flex:1;}',
      '#pf-st-table{width:100%;border-collapse:collapse;font-family:\'MontserratLight\',sans-serif;}',
      '.pf-st-th{background:#f0f0f0;padding:9px 12px;font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#333!important;border-bottom:2px solid #ddd;white-space:nowrap;}',
      '.pf-st-th.pf-st-ref{text-align:left;min-width:130px;}',
      '.pf-st-th.pf-st-num{text-align:center;}',
      '.pf-st-td{padding:8px 12px;font-size:.8rem;font-weight:600;border-bottom:1px solid #f0f0f0;color:#000!important;vertical-align:middle;}',
      '.pf-st-td.pf-st-ref{font-weight:bold!important;letter-spacing:.04em;}',
      '.pf-st-td.pf-st-num{text-align:center;font-variant-numeric:tabular-nums;}',
      '.pf-st-row-even td{background:#fff;}',
      '.pf-st-row-odd td{background:#fafafa;}',
      /* copy button inside th — same as TAM tam-stock-copy-btn */
      '.pf-guia-th2-inner{display:flex;align-items:center;gap:5px;}',
      '.pf-st-copy-btn{background:none;border:none;cursor:pointer;font-size:.85rem;color:#888;padding:0 3px;line-height:1;border-radius:4px;transition:color .15s,background .15s;}',
      '.pf-st-copy-btn:hover{color:#000;background:#e0e0e0;}',
      '.pf-st-copy-btn.pf-st-copy-active{color:#2a5a2a!important;}',
      '#pf-st-footer{padding:8px 18px;border-top:1px solid #eee;font-size:.72rem;font-weight:bold;color:#666;display:flex;flex-direction:column;gap:5px;flex-shrink:0;background:#fafafa;}',
      '.pf-st-footer-row{display:flex;align-items:center;gap:8px;}',
      '.pf-st-check-ok{color:#2a5a2a!important;}',
      '.pf-st-check-err{color:#7a1a1a!important;}',
      /* ── Responsive ── */
      '.pf-inv-toggle{background:none;border:none;color:rgba(255,255,255,0.7)!important;font-size:.85rem;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;transition:color .15s;}',
      '.pf-inv-toggle:hover{color:#fff!important;}',
      '.pf-inv-spacer{flex:1;}',
      '@media(max-width:480px){.pf-table td,.pf-table th{padding:5px 7px;font-size:.74rem;}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmt(n) {
    return Number(n||0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function rnd2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /* ══════════════════════════════════════════════════════════════
     PDF EXTRACTION — shared by all engines
  ══════════════════════════════════════════════════════════════ */
  async function pfExtract(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js não disponível');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PF_WORKER_URL;
    }
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var allItems = [];
    var pageYOffset = 0;
    var PAGE_HEIGHT_ESTIMATE = 1000;

    for (var p = 1; p <= pdf.numPages; p++) {
      var page    = await pdf.getPage(p);
      var vp      = page.getViewport({ scale: 1 });
      var content = await page.getTextContent();
      content.items.forEach(function(item) {
        if (!item.str || !item.str.trim()) return;
        allItems.push({
          str:  item.str.trim(),
          x:    item.transform[4],
          y:    (vp.height - item.transform[5]) + pageYOffset,
          page: p
        });
      });
      pageYOffset += PAGE_HEIGHT_ESTIMATE;
    }
    return allItems;
  }

  /* Group items into rows by Y proximity */
  function groupRows(items, tolerance) {
    tolerance = tolerance || 4;
    var sorted = items.slice().sort(function(a, b) {
      if (Math.abs(a.y - b.y) <= tolerance) return a.x - b.x;
      return a.y - b.y;
    });
    var rows = [];
    var cur  = null;
    sorted.forEach(function(item) {
      if (!cur || Math.abs(item.y - cur.y) > tolerance) {
        cur = { y: item.y, items: [] };
        rows.push(cur);
      }
      cur.items.push(item);
    });
    return rows;
  }

  /* ── Shared pattern matchers ── */
  var COUNTRIES = /^(CN|MM|TR|IN|VN|BD|MA|CA|PT|ES|FR|IT|DE|PK|KH|TH|ID|MY|TW|HK|MX|CO|PE|TN|EG|LK|MR|SN|ET|KE)$/;

  function isArticleCode(s) {
    return /^\d{5,8}[_\-A-Z]/.test(s) ||
           /^\d{5,8}[A-Z]{2,4}$/.test(s) ||
           /^\d{5,8}(NCL|NCS|NCM|BNL)$/.test(s);
  }
  function isBoxCode(s) {
    return /^[OSGEP]\d{9,}/.test(s);
  }
  function isEanPart1(s) { return /^\d{7,11}$/.test(s); }
  function isEanPart2(s) { return /^\d{2,6}$/.test(s); }
  function isFullEan(s)  { return /^\d{13}$/.test(s); }
  function isPautal(s)   { return /^\d{6}$/.test(s); }
  function isPrice(s)    { return /^\d{1,4},\d{2,3}$/.test(s); }
  function parsePrice(s) { return parseFloat(s.replace(',', '.')); }
  function isSizeSuffix(s) {
    return /^(XS-?S|S-?S|M-?L|XL|XXS|XS|S|M|L|XXL|\d+-\d+)$/.test(s);
  }

  var SKIP_ROW = /^(Barata|BARATA|Contribuinte|Rua|www\.|INVOICE|Pág\.|Total Qtd|TOTAL EUR|Subtotal|Desconto|Frete|Seguro|Total IVA|Nº total|Peso|Volume|Local de|Lugar de|Processado|ATCUD:|Em caso|Data:|Hora:|Matric|Cliente|WAK|WAKZOME|Morada|PORTUGAL|Porto Santo|Rua Dr|FT\s+\d{4}\/|% IVA|Incidência|Valor IVA|23,00\s+\d|Obs\.\:|O Gestor|Nuno|Caixa\s|Código|artigo|Descrição|Composição|País|Cód\.|Preço|Desc\.|Pronto Pag|Air|CIF|ORIGINAL)/i;

  /* ── Deduplication (shared) ── */
  function pfDedupe(items) {
    var refMap = {};
    items.forEach(function(item) {
      var key = item.ref;
      if (!refMap[key]) {
        refMap[key] = { ref: item.ref, desc: item.desc, eans: [],
                        totalQty: 0, totalPrice: 0, sumUnit: 0 };
      }
      var r = refMap[key];
      r.totalQty   += item.qty;
      r.totalPrice += item.price;
      r.sumUnit    += item.unitPrice * item.qty;
      if (item.ean && r.eans.indexOf(item.ean) === -1) r.eans.push(item.ean);
      if (item.desc && item.desc.length > (r.desc || '').length) r.desc = item.desc;
    });
    return Object.values(refMap).map(function(r) {
      return {
        ref:       r.ref,
        desc:      r.desc || '—',
        ean:       r.eans[0] || '',      // primary EAN (backward compat)
        eans:      r.eans,               // all EANs
        qty:       r.totalQty,
        price:     rnd2(r.totalPrice),
        unitPrice: r.totalQty > 0 ? rnd2(r.sumUnit / r.totalQty) : 0
      };
    });
  }

  /* ── Build result object ── */
  function pfBuildResult(grouped, meta) {
    var parsedQty   = grouped.reduce(function(s,g){ return s + g.qty; }, 0);
    var parsedPrice = rnd2(grouped.reduce(function(s,g){ return s + g.price; }, 0));
    var qtyOk       = meta.totalQtd > 0 ? parsedQty === meta.totalQtd : null;
    var priceOk     = meta.totalEur > 0 ? Math.abs(rnd2(parsedPrice * 1.23) - meta.totalEur) < 0.20 : null;
    return {
      items:       grouped,
      parsedQty:   parsedQty,
      parsedPrice: parsedPrice,
      qtyOk:       qtyOk,
      priceOk:     priceOk,
      valid:       qtyOk !== false && priceOk !== false
    };
  }

  /* ══════════════════════════════════════════════════════════════
     MOTOR A — column-aware (Y-position + content detection)
     Original strategy: groups by Y, identifies columns by content type
  ══════════════════════════════════════════════════════════════ */
  function pfEngineA(allItems, meta, eanMap) {
    eanMap = eanMap || {};
    var rows  = groupRows(allItems, 5);
    var items = [];

    var state = { code:null, ean1:null, ean:null, pautal:null, desc:null,
                  country:null, qty:null, unitPrice:null, price:null };

    function flush() {
      if (state.code && state.desc && state.qty !== null && state.price !== null) {
        var ref = state.code.match(/^(\d+)/);
        if (ref) {
          items.push({ ref: ref[1], code: state.code,
                       ean: state.ean || eanMap[state.code] || '',
                       desc: state.desc, qty: state.qty,
                       unitPrice: state.unitPrice || 0, price: state.price });
        }
      }
      state.code=null; state.ean1=null; state.ean=null; state.pautal=null;
      state.desc=null; state.country=null; state.qty=null;
      state.unitPrice=null; state.price=null;
    }

    for (var ri = 0; ri < rows.length; ri++) {
      var row   = rows[ri];
      var cells = row.items;
      if (!cells.length) continue;
      var firstCell = cells[0].str;
      var rowStr    = cells.map(function(c){ return c.str; }).join(' ');

      if (SKIP_ROW.test(rowStr)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}\s*$/.test(rowStr)) continue;
      if (/^(100002|ATCUD:)/.test(firstCell)) continue;

      if (isBoxCode(firstCell)) { flush(); continue; }

      if (isArticleCode(firstCell)) {
        flush();
        state.code = firstCell;
        for (var ci = 1; ci < cells.length; ci++) {
          var c = cells[ci].str;
          if (!state.ean && isFullEan(c)) { state.ean = c; state.ean1 = null; continue; }
          if (!state.ean && !state.pautal && isEanPart1(c)) { state.ean1 = c; continue; }
          // EAN part2 within same row (x~83, immediately after part1)
          if (!state.ean && state.ean1 && isEanPart2(c)) {
            var ec = state.ean1 + c;
            if (ec.length === 13) { state.ean = ec; state.ean1 = null; continue; }
          }
          if (!state.pautal && isPautal(c)) { state.pautal = c; continue; }
          if (!state.country && COUNTRIES.test(c)) { state.country = c; continue; }
          if (state.country && state.qty === null && /^\d{1,3}$/.test(c)) { state.qty = parseInt(c); continue; }
          if (state.qty !== null && c === '23') continue;
          if (state.qty !== null && state.unitPrice === null && isPrice(c)) { state.unitPrice = parsePrice(c); continue; }
          if (state.unitPrice !== null && c === '0,00') continue;
          if (state.unitPrice !== null && state.price === null && isPrice(c)) { state.price = parsePrice(c); continue; }
          if (state.pautal && !state.country && !state.desc && !/^\d/.test(c) && c.length > 2) {
            if (!/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(c)) {
              state.desc = (state.desc ? state.desc + ' ' : '') + c;
            }
          }
        }
        continue;
      }

      if (state.code) {
        if (state.ean1 && !state.ean && isEanPart2(firstCell)) {
          var cand = state.ean1 + firstCell;
          if (cand.length === 13) { state.ean = cand; state.ean1 = null; }
          for (var cj = 1; cj < cells.length; cj++) {
            var cc = cells[cj].str;
            if (!state.pautal && isPautal(cc)) { state.pautal = cc; continue; }
            if (!state.country && COUNTRIES.test(cc)) { state.country = cc; continue; }
            if (state.country && state.qty === null && /^\d{1,3}$/.test(cc)) { state.qty = parseInt(cc); continue; }
            if (state.qty !== null && cc === '23') continue;
            if (state.qty !== null && state.unitPrice === null && isPrice(cc)) { state.unitPrice = parsePrice(cc); continue; }
            if (state.unitPrice !== null && cc === '0,00') continue;
            if (state.unitPrice !== null && state.price === null && isPrice(cc)) { state.price = parsePrice(cc); continue; }
            if (state.pautal && !state.country && !state.desc && !/^\d/.test(cc) && cc.length > 2) {
              if (!/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(cc)) {
                state.desc = (state.desc ? state.desc + ' ' : '') + cc;
              }
            }
          }
          continue;
        }
        if (isSizeSuffix(firstCell) && cells.length === 1 && !state.desc) {
          state.code = state.code + ' ' + firstCell; continue;
        }
        if (!state.desc && !state.country) {
          var dcands = cells.filter(function(c) {
            return !isPautal(c.str) && !isEanPart1(c.str) && !isEanPart2(c.str) &&
                   !COUNTRIES.test(c.str) && !/^\d{1,3}$/.test(c.str) &&
                   !isPrice(c.str) && c.str !== '23' && c.str !== '0,00' &&
                   !/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(c.str) &&
                   c.str.length > 2;
          });
          if (dcands.length) state.desc = dcands.map(function(c){ return c.str; }).join(' ').trim();
        }
        if (state.desc && state.country && state.qty === null) {
          for (var ck = 0; ck < cells.length; ck++) {
            var cv = cells[ck].str;
            if (state.qty === null && /^\d{1,3}$/.test(cv)) { state.qty = parseInt(cv); continue; }
            if (state.qty !== null && cv === '23') continue;
            if (state.qty !== null && state.unitPrice === null && isPrice(cv)) { state.unitPrice = parsePrice(cv); continue; }
            if (state.unitPrice !== null && cv === '0,00') continue;
            if (state.unitPrice !== null && state.price === null && isPrice(cv)) { state.price = parsePrice(cv); continue; }
          }
        }
      }
    }
    flush();
    return pfBuildResult(pfDedupe(items), meta);
  }

  /* ══════════════════════════════════════════════════════════════
     MOTOR B — X-range positional column mapping
     Uses fixed X-coordinate ranges to identify each column.
     Tolerant to content-type ambiguities since position is primary.
  ══════════════════════════════════════════════════════════════ */
  function pfEngineB(allItems, meta, eanMap) {
    eanMap = eanMap || {};
    var rows  = groupRows(allItems, 6);  // slightly looser tolerance
    var items = [];

    /* Parfois column X ranges — calibrated from real PDF:
       Col 0 (Article/Box): x < 70
       Col 1 (EAN):         70 <= x < 145
       Col 2 (Pautal):      210 <= x < 270
       Col 3 (Desc):        270 <= x < 395
       Col 4 (Composição):  395 <= x < 530
       Col 5 (País):        530 <= x < 565
       Col 6 (Qtd):         565 <= x < 595
       Col 7 (IVA):         595 <= x < 630
       Col 8 (Cód):         630 <= x < 655
       Col 9 (P.Unit):      655 <= x < 715
       Col 10 (Desc%):      715 <= x < 740
       Col 11 (Preço):      740 <= x
    */
    function colOf(x) {
      if (x < 70)   return 0;   // Article/Box
      if (x < 145)  return 1;   // EAN
      if (x < 175)  return 2;   // Pautal
      if (x < 255)  return 3;   // Descrição
      if (x < 355)  return 4;   // Composição
      if (x < 395)  return 5;   // País
      if (x < 425)  return 6;   // Qtd
      if (x < 480)  return 7;   // IVA
      if (x < 515)  return 8;   // P.Unit
      if (x < 545)  return 9;   // Desc%
      return 10;                 // Preço total
    }

    var cur = null;

    function flush() {
      if (cur && cur.code && cur.desc && cur.qty !== null && cur.price !== null) {
        var ref = cur.code.match(/^(\d+)/);
        if (ref) {
          items.push({ ref: ref[1], code: cur.code,
                       ean: cur.ean || eanMap[cur.code] || '',
                       desc: cur.desc, qty: cur.qty,
                       unitPrice: cur.unitPrice || 0, price: cur.price });
        }
      }
      cur = null;
    }

    for (var ri = 0; ri < rows.length; ri++) {
      var row   = rows[ri];
      var cells = row.items;
      if (!cells.length) continue;
      var firstCell = cells[0].str;
      var rowStr    = cells.map(function(c){ return c.str; }).join(' ');

      if (SKIP_ROW.test(rowStr)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}\s*$/.test(rowStr)) continue;
      if (/^(100002|ATCUD:)/.test(firstCell)) continue;

      // Build column map for this row
      var colMap = {};
      cells.forEach(function(cell) {
        var col = colOf(cell.x);
        if (!colMap[col]) colMap[col] = [];
        colMap[col].push(cell.str);
      });
      function colStr(col) { return colMap[col] ? colMap[col].join(' ') : ''; }

      var col0 = colStr(0);

      if (isBoxCode(col0)) { flush(); continue; }

      if (isArticleCode(col0)) {
        flush();
        cur = {
          code:      col0,
          ean:       '',
          desc:      '',
          country:   '',
          qty:       null,
          unitPrice: null,
          price:     null
        };

        // EAN: col1 may be partial, col1+extra forms 13 digits
        var ean1str = colStr(1);
        var ean2str = colStr(2);
        if (isFullEan(ean1str)) {
          cur.ean = ean1str;
        } else if (isEanPart1(ean1str) && isEanPart2(ean2str)) {
          var cand = ean1str + ean2str;
          if (cand.length === 13) cur.ean = cand;
        }

        // Description: col3
        var d3 = colStr(3);
        if (d3 && !/^\d/.test(d3) && d3.length > 1) cur.desc = d3;

        // Country: col5
        var c5 = colStr(5);
        if (COUNTRIES.test(c5.trim())) cur.country = c5.trim();

        // Qty: col6
        var q6 = colStr(6).trim();
        if (/^\d{1,3}$/.test(q6) && parseInt(q6) > 0) cur.qty = parseInt(q6);

        // Unit price: col9
        var u8 = colStr(8).trim();
        if (isPrice(u8)) cur.unitPrice = parsePrice(u8);

        // Total price: col10
        var p10 = colStr(10).trim();
        if (isPrice(p10)) cur.price = parsePrice(p10);

        // If desc missing, try to find any text in col3 range
        if (!cur.desc) {
          var allDescCells = cells.filter(function(c){ return colOf(c.x) === 3; }); // col3 = Descrição
          if (allDescCells.length) cur.desc = allDescCells.map(function(c){ return c.str; }).join(' ');
        }
        continue;
      }

      // Continuation row
      if (cur) {
        // EAN fragment completion
        if (!cur.ean) {
          var cf0 = colStr(0), cf1 = colStr(1);
          if (isEanPart2(cf0) && cur._ean1) {
            var ec = cur._ean1 + cf0;
            if (ec.length === 13) cur.ean = ec;
          }
          if (isFullEan(cf0)) cur.ean = cf0;
          if (isFullEan(cf1)) cur.ean = cf1;
        }
        // Description from col3 if still missing
        if (!cur.desc) {
          var dd3 = colStr(3);
          if (dd3 && !/^\d/.test(dd3) && dd3.length > 1) cur.desc = dd3;
        }
        // Qty/price fallback from continuation
        if (cur.qty === null) {
          var qq6 = colStr(6).trim();
          if (/^\d{1,3}$/.test(qq6)) cur.qty = parseInt(qq6);
        }
        if (cur.price === null) {
          var pp10 = colStr(10).trim();
          if (isPrice(pp10)) cur.price = parsePrice(pp10);
        }
        if (cur.unitPrice === null) {
          var uu8 = colStr(8).trim();
          if (isPrice(uu8)) cur.unitPrice = parsePrice(uu8);
        }
      }
    }
    flush();
    return pfBuildResult(pfDedupe(items), meta);
  }

  /* ══════════════════════════════════════════════════════════════
     MOTOR C — box-anchor strategy
     Uses the S6.../O6... box code row as an anchor: the very next
     article code row is the item for that box. Reads the entire
     multi-row cluster between two box codes as one logical record.
  ══════════════════════════════════════════════════════════════ */
  function pfEngineC(allItems, meta, eanMap) {
    eanMap = eanMap || {};
    var rows  = groupRows(allItems, 7);  // looser still — catches split rows
    var items = [];

    // Split rows into clusters anchored by box codes
    var clusters = [];
    var curCluster = null;

    for (var ri = 0; ri < rows.length; ri++) {
      var row       = rows[ri];
      var cells     = row.items;
      if (!cells.length) continue;
      var firstCell = cells[0].str;
      var rowStr    = cells.map(function(c){ return c.str; }).join(' ');

      if (SKIP_ROW.test(rowStr)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}\s*$/.test(rowStr)) continue;
      if (/^(100002|ATCUD:)/.test(firstCell)) continue;

      if (isBoxCode(firstCell)) {
        if (curCluster && curCluster.rows.length) clusters.push(curCluster);
        curCluster = { boxCode: firstCell, rows: [] };
        continue;
      }
      if (curCluster) curCluster.rows.push(row);
    }
    if (curCluster && curCluster.rows.length) clusters.push(curCluster);

    // Process each cluster: find article code, then collect all field data
    clusters.forEach(function(cluster) {
      var allText = cluster.rows.map(function(r){ return r.items.map(function(c){ return c.str; }).join(' '); }).join(' ');
      // Find article code
      var artRow = cluster.rows.find(function(r){ return r.items.length && isArticleCode(r.items[0].str); });
      if (!artRow) return;

      var code = artRow.items[0].str;
      var ref  = code.match(/^(\d+)/);
      if (!ref) return;

      // Collect all cells from entire cluster
      var allCells = [];
      cluster.rows.forEach(function(r){ r.items.forEach(function(c){ allCells.push(c); }); });
      allCells.sort(function(a,b){ return a.x - b.x; });

      var ean = '', desc = '', country = '', qty = null, unitPrice = null, price = null;
      var ean1 = '';

      // EAN: scan for 13-digit or reconstructible sequence
      var allStrs = allCells.map(function(c){ return c.str; });
      for (var i = 0; i < allStrs.length; i++) {
        if (isFullEan(allStrs[i])) { ean = allStrs[i]; break; }
        if (isEanPart1(allStrs[i]) && !ean1) {
          ean1 = allStrs[i];
          if (i+1 < allStrs.length && isEanPart2(allStrs[i+1])) {
            var ec = ean1 + allStrs[i+1];
            if (ec.length === 13) { ean = ec; break; }
          }
        }
      }

      // Description: text tokens after the pautal code (6-digit), before country
      var pautalIdx = -1;
      for (var j = 0; j < allStrs.length; j++) {
        if (isPautal(allStrs[j])) { pautalIdx = j; break; }
      }
      if (pautalIdx >= 0) {
        var descParts = [];
        for (var k = pautalIdx + 1; k < allStrs.length; k++) {
          var t = allStrs[k];
          if (COUNTRIES.test(t)) break;
          if (/^\d/.test(t)) continue;
          if (/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(t)) continue;
          if (t.length > 2) descParts.push(t);
        }
        desc = descParts.slice(0, 3).join(' ').trim(); // cap at 3 words
      }

      // Country, qty, unitPrice, price — scan all tokens from right-to-left
      // Find the two rightmost prices (unitPrice then total), then qty before them
      var prices = [];
      var countryFound = false;
      for (var m = 0; m < allStrs.length; m++) {
        var ts = allStrs[m];
        if (COUNTRIES.test(ts) && !countryFound) { country = ts; countryFound = true; }
        if (isPrice(ts) && ts !== '0,00') prices.push(parsePrice(ts));
        if (countryFound && qty === null && /^\d{1,3}$/.test(ts) && !isPautal(ts)) {
          qty = parseInt(ts);
        }
      }
      // prices[0] = unitPrice, prices[1] = total (they appear left-to-right)
      if (prices.length >= 2) { unitPrice = prices[0]; price = prices[1]; }
      else if (prices.length === 1) { price = prices[0]; }

      if (desc && qty !== null && price !== null) {
        items.push({ ref: ref[1], code: code,
                     ean: ean || eanMap[code] || '',
                     desc: desc, qty: qty, unitPrice: unitPrice || 0, price: price });
      }
    });

    return pfBuildResult(pfDedupe(items), meta);
  }

  /* ══════════════════════════════════════════════════════════════
     EXTRACT META (invoice number, date, totals)
  ══════════════════════════════════════════════════════════════ */
  function pfExtractMeta(allItems, fileName) {
    var allText = allItems.map(function(i){ return i.str; }).join(' ');
    var invoiceNo   = '';
    var invoiceDate = '';
    var totalQtd    = 0;
    var totalEur    = 0;
    var numCaixas   = 0;

    var mft  = allText.match(/FT\s+(\d{4}\/\d{6,7})/);
    if (mft) invoiceNo = 'FT ' + mft[1];
    var mdate = allText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (mdate) invoiceDate = mdate[1];
    var mq   = allText.match(/Total\s+Qtd\s+(\d+)/i);
    if (mq) totalQtd = parseInt(mq[1]);
    var me   = allText.match(/TOTAL\s+EUR\s+([\d.,]+)/i);
    if (me) totalEur = parseFloat(me[1].replace(/\./g,'').replace(',','.'));
    var mcx  = allText.match(/N[oº°]\s*total\s+de\s+caixas[:\s]+(\d+)/i);
    if (mcx) numCaixas = parseInt(mcx[1]);

    return {
      fileName:    fileName,
      invoiceNo:   invoiceNo || fileName.replace(/\.pdf$/i, ''),
      invoiceDate: invoiceDate,
      numCaixas:   numCaixas,
      totalQtd:    totalQtd,
      totalEur:    totalEur
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ENGINE SELECTION — pick best, detect conflict
  ══════════════════════════════════════════════════════════════ */
  function pfPickEngine(resA, resB, resC) {
    // Count how many engines agree on qty and price
    var results = [
      { label: 'A', res: resA },
      { label: 'B', res: resB },
      { label: 'C', res: resC }
    ];

    // Prefer engines that pass cross-validation
    var valid = results.filter(function(r){ return r.res.valid; });
    if (valid.length === 1) return valid[0].label;
    if (valid.length > 1) {
      // Among valid, prefer the one with most refs (more complete)
      var best = valid.reduce(function(a,b){ return b.res.items.length >= a.res.items.length ? b : a; });
      return best.label;
    }

    // None fully valid — pick the one closest to invoice totals
    var scored = results.map(function(r) {
      var qScore = r.res.qtyOk === true ? 2 : r.res.qtyOk === null ? 1 : 0;
      var pScore = r.res.priceOk === true ? 2 : r.res.priceOk === null ? 1 : 0;
      return { label: r.label, score: qScore + pScore, refs: r.res.items.length };
    });
    scored.sort(function(a,b){ return b.score !== a.score ? b.score - a.score : b.refs - a.refs; });
    return scored[0].label;
  }

  function pfEnginesAgree(resA, resB, resC) {
    // Agree if all 3 produce same qty and same price total (within 0.02)
    var qA = resA.parsedQty, qB = resB.parsedQty, qC = resC.parsedQty;
    var pA = resA.parsedPrice, pB = resB.parsedPrice, pC = resC.parsedPrice;
    return (qA === qB && qB === qC) && (Math.abs(pA-pB)<0.02 && Math.abs(pB-pC)<0.02);
  }

  /* ══════════════════════════════════════════════════════════════
     FULL PARSE — runs all 3 motors, returns invoice object
  ══════════════════════════════════════════════════════════════ */
  /* Pre-build EAN map: { articleCode -> ean13 }
     In Parfois PDFs the EAN fragments appear at x~82.7, in rows BEFORE
     or AROUND the article row. We scan all items and reconstruct 13-digit
     EANs, then attach them to the nearest article code by Y proximity. */
  function pfBuildEanMap(allItems) {
    var eanMap = {};
    // Collect all EAN-column items (x between 70 and 145)
    var eanItems = allItems.filter(function(i){ return i.x >= 70 && i.x < 130; }); // x=82.7 EAN column only
    // Collect all article code items
    var artItems = allItems.filter(function(i){ return isArticleCode(i.str); });

    // Reconstruct EANs: look for consecutive numeric fragments that sum to 13 digits
    var eansSorted = eanItems.slice().sort(function(a,b){ return a.y - b.y; });
    var eans = [];  // { y, ean13 }
    for (var i = 0; i < eansSorted.length; i++) {
      var s = eansSorted[i].str;
      if (isFullEan(s)) {
        eans.push({ y: eansSorted[i].y, ean: s });
      } else if (isEanPart1(s)) {
        // Try to combine with the next item
        if (i + 1 < eansSorted.length && isEanPart2(eansSorted[i+1].str)) {
          var cand = s + eansSorted[i+1].str;
          if (cand.length === 13) {
            eans.push({ y: eansSorted[i].y, ean: cand });
            i++; // skip next
          }
        }
      }
    }

    // Match each EAN to the nearest article code by Y distance
    artItems.forEach(function(art) {
      var bestDist = 999;
      var bestEan  = '';
      eans.forEach(function(e) {
        var dist = Math.abs(e.y - art.y);
        if (dist < bestDist && dist < 60) { // within 60 Y units
          bestDist = dist;
          bestEan  = e.ean;
        }
      });
      if (bestEan) {
        var ref = art.str.match(/^(\d+)/);
        if (ref) eanMap[art.str] = bestEan;  // key: full article code
      }
    });
    return eanMap;
  }

  function pfParseAll(allItems, fileName) {
    var meta   = pfExtractMeta(allItems, fileName);
    var eanMap = pfBuildEanMap(allItems);
    var resA = pfEngineA(allItems, meta, eanMap);
    var resB = pfEngineB(allItems, meta, eanMap);
    var resC = pfEngineC(allItems, meta, eanMap);

    var agree    = pfEnginesAgree(resA, resB, resC);
    var autoEng  = pfPickEngine(resA, resB, resC);

    return Object.assign({}, meta, {
      _allItems:  allItems,
      engineCache: { A: resA, B: resB, C: resC },
      autoEngine:  autoEng,
      agree:       agree,
      // active engine result — will be set by pfGetActiveResult()
    });
  }

  function pfGetActiveResult(inv) {
    var label  = pfState.activeEngines[inv.fileName] || inv.autoEngine || 'A';
    var cached = inv.engineCache ? (inv.engineCache[label] || inv.engineCache['A']) : null;
    if (!cached) return { items:[], parsedQty:0, parsedPrice:0, qtyOk:null, priceOk:null, valid:false };
    // Recompute qtyOk and priceOk with current logic (IVA 23%)
    var qtyOk   = inv.totalQtd > 0 ? cached.parsedQty === inv.totalQtd : null;
    var priceOk = inv.totalEur > 0 ? Math.abs(rnd2(cached.parsedPrice * 1.23) - inv.totalEur) < 0.20 : null;
    return Object.assign({}, cached, { qtyOk: qtyOk, priceOk: priceOk, valid: qtyOk !== false && priceOk !== false });
  }

  function pfGetActiveItems(inv) {
    return pfGetActiveResult(inv).items;
  }

  /* ══════════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  function pfRender() {
    var content   = document.getElementById('pf-content');
    var statusMsg = document.getElementById('pf-status-msg');
    if (!content) return;

    content.querySelectorAll('.pf-inv-block,.pf-empty').forEach(function(el){ el.remove(); });

    if (!pfState.invoices.length) {
      statusMsg.textContent = 'nenhuma fatura carregada';
      var em = document.createElement('div');
      em.className = 'pf-empty';
      em.textContent = 'carregue uma fatura Parfois (PDF)';
      content.appendChild(em);
      return;
    }

    var totRefs = 0, totPcs = 0;
    pfState.invoices.forEach(function(inv){
      var r = pfGetActiveResult(inv);
      totRefs += r.items.length;
      totPcs  += r.parsedQty;
    });
    statusMsg.textContent = pfState.invoices.length + ' fatura(s) · ' + totRefs + ' referências · ' + totPcs + ' peças';

    pfState.invoices.forEach(function(inv, idx) {
      var res        = pfGetActiveResult(inv);
      var isCollapsed = !!pfState.collapsed[inv.fileName];

      var block = document.createElement('div');
      block.className = 'pf-inv-block' + (isCollapsed ? ' pf-collapsed' : '');

      // Badge
      var badge = '';
      if (res.qtyOk === true && res.priceOk === true) {
        badge = '<span class="pf-badge pf-ok">✓ validado</span>';
      } else if (res.qtyOk === false || res.priceOk === false) {
        badge = '<span class="pf-badge pf-err">⚠ divergência</span>';
      } else {
        badge = '<span class="pf-badge pf-warn">– sem totais</span>';
      }

      // Uniform header: num/meta | badge | spacer | total | bc-btn | stock-btn | toggle
      block.innerHTML =
        '<div class="pf-inv-hdr">' +
          '<div>' +
            '<div class="pf-inv-num">' + esc(inv.invoiceNo) + '</div>' +
            '<div class="pf-inv-meta">' + esc(inv.invoiceDate) +
              (inv.numCaixas ? ' · ' + inv.numCaixas + ' cx.' : '') +
              ' · ' + res.parsedQty + ' pcs' +
            '</div>' +
          '</div>' +
          badge +
          '<span class="pf-inv-spacer"></span>' +
          '<div class="pf-inv-total">' + fmt(res.parsedPrice) + ' €</div>' +
          '<div class="pf-inv-acts">' +
            '<button class="pf-btn pf-btn-mid" data-bc="' + idx + '">códigos de barras</button>' +
            '<button class="pf-btn pf-btn-dark" data-st="' + idx + '">ingresso de stock</button>' +
          '</div>' +
          '<button class="pf-inv-toggle" data-toggle="' + idx + '" title="expandir/minimizar">' +
            (isCollapsed ? '&#9654;' : '&#9660;') +
          '</button>' +
        '</div>' +
        '<div class="pf-inv-body"></div>';

      var body = block.querySelector('.pf-inv-body');

      // Validation row (inside body)
      if (res.qtyOk === false || res.priceOk === false) {
        var vd = document.createElement('div');
        vd.className = 'pf-val-row err';
        var msgs = [];
        if (res.qtyOk === false) msgs.push('qtd lida: ' + res.parsedQty + ' · fatura: ' + inv.totalQtd);
        if (res.priceOk === false) msgs.push('valor lido: ' + fmt(res.parsedPrice) + ' € · fatura: ' + fmt(inv.totalEur) + ' €');
        vd.textContent = msgs.join('  ·  ');
        body.appendChild(vd);
      } else if (res.qtyOk === true && res.priceOk === true) {
        var vo = document.createElement('div');
        vo.className = 'pf-val-row ok';
        vo.textContent = '✓ totais confirmados · ' + inv.totalQtd + ' pcs · ' + fmt(inv.totalEur) + ' €';
        body.appendChild(vo);
      }

      // Table (inside body)
      var tw = document.createElement('div');
      tw.className = 'pf-table-wrap';
      var trows = res.items.map(function(it) {
        return '<tr>' +
          '<td class="pf-td-ref">' + esc(it.ref) + '</td>' +
          '<td class="pf-td-name">' + esc(it.desc) + '</td>' +
          '<td class="pf-td-r">' + it.qty + '</td>' +
          '<td class="pf-td-r">' + fmt(it.unitPrice) + ' €</td>' +
          '<td class="pf-td-r">' + fmt(it.price) + ' €</td>' +
        '</tr>';
      }).join('');
      tw.innerHTML =
        '<table class="pf-table">' +
          '<thead><tr>' +
            '<th>Referência</th><th>Nome</th>' +
            '<th style="text-align:right">Pcs</th>' +
            '<th style="text-align:right">P.Unit</th>' +
            '<th style="text-align:right">Total</th>' +
          '</tr></thead>' +
          '<tbody>' + trows + '</tbody>' +
          '<tfoot><tr>' +
            '<td colspan="2" style="font-weight:bold;color:#000!important;">TOTAL</td>' +
            '<td class="pf-td-r" style="font-weight:bold;color:#000!important;">' + res.parsedQty + '</td>' +
            '<td></td>' +
            '<td class="pf-td-r" style="font-weight:bold;color:#000!important;">' + fmt(res.parsedPrice) + ' €</td>' +
          '</tr></tfoot>' +
        '</table>';
      body.appendChild(tw);
      content.appendChild(block);
    });

    // Toggle listeners
    content.querySelectorAll('[data-toggle]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var i   = parseInt(btn.getAttribute('data-toggle'));
        var inv = pfState.invoices[i];
        if (!inv) return;
        pfState.collapsed[inv.fileName] = !pfState.collapsed[inv.fileName];
        pfRender();
      });
    });

    // Button listeners
    content.querySelectorAll('[data-bc]').forEach(function(btn) {
      btn.addEventListener('click', function(){ pfOpenBC(parseInt(btn.getAttribute('data-bc'))); });
    });
    content.querySelectorAll('[data-st]').forEach(function(btn) {
      btn.addEventListener('click', function(){ pfOpenST(parseInt(btn.getAttribute('data-st'))); });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     BARCODE OVERLAY
  ══════════════════════════════════════════════════════════════ */
  function pfOpenBC(idx) {
    var inv = pfState.invoices[idx];
    if (!inv) return;
    var items = pfGetActiveItems(inv);
    var ov    = document.getElementById('pf-bc-overlay');
    var body  = document.getElementById('pf-bc-body');
    var ttl   = document.getElementById('pf-bc-title');
    ttl.textContent = inv.invoiceNo + ' · códigos de barras';

    var withEan = items.filter(function(it){ return it.eans && it.eans.length; });

    if (!withEan.length) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:.82rem;">nenhum EAN encontrado</div>';
      ov.classList.add('open');
      return;
    }

    // Build grouped HTML
    body.innerHTML = withEan.map(function(it) {
      var eansJoined = it.eans.join('|');
      var eanBtns = it.eans.map(function(ean) {
        return '<span class="pf-bc-code" data-eans="' + eansJoined + '">' + esc(ean) + '</span>';
      }).join('');
      return '<div class="pf-bc-group">' +
        '<div class="pf-bc-group-hdr">' +
          '<span class="pf-bc-ref" data-copy="' + esc(it.ref) + '">' + esc(it.ref) + '</span>' +
          '<span class="pf-bc-name" data-copy="' + esc(it.desc) + '">' + esc(it.desc) + '</span>' +
        '</div>' +
        '<div class="pf-bc-eans">' + eanBtns + '</div>' +
      '</div>';
    }).join('');

    // Copy helper
    function pfCopyText(text, el) {
      var done = function() {
        el.classList.add('pf-bc-copied');
        setTimeout(function(){ el.classList.remove('pf-bc-copied'); }, 900);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
      } else {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy');
          document.body.removeChild(ta);
        } catch(e) {}
        done();
      }
    }

    // Ref click — copy ref text
    body.querySelectorAll('.pf-bc-ref').forEach(function(el) {
      el.addEventListener('click', function() {
        pfCopyText(el.getAttribute('data-copy'), el);
      });
    });

    // Name click — copy name text
    body.querySelectorAll('.pf-bc-name').forEach(function(el) {
      el.addEventListener('click', function() {
        pfCopyText(el.getAttribute('data-copy'), el);
      });
    });

    // EAN click — copy ALL eans of this ref as "UN\tEAN" lines
    body.querySelectorAll('.pf-bc-code').forEach(function(el) {
      el.addEventListener('click', function() {
        var eans = el.getAttribute('data-eans').split('|');
        var text = eans.map(function(e){ return 'UN\t' + e; }).join('\n');
        pfCopyText(text, el);
      });
    });

    ov.classList.add('open');
  }

  /* ══════════════════════════════════════════════════════════════
     STOCK MODAL — same pattern as TAM tamShowStockModal
     Columns: Referencia | ARM | IVA | € | Qtd.
     Each column has individual copy button (⧉)
  ══════════════════════════════════════════════════════════════ */
  function pfOpenST(idx) {
    var inv = pfState.invoices[idx];
    if (!inv) return;
    var items = pfGetActiveItems(inv);
    var res   = pfGetActiveResult(inv);

    // Build rows — ARM fixed A5, IVA fixed 23
    var rows = items.map(function(it) {
      return {
        ref:   it.ref,
        arm:   'A5',
        iva:   '23',
        price: it.unitPrice,
        qty:   it.qty
      };
    });

    var COL_S = ['Referencia', 'ARM', 'IVA', '€', 'Qtd.'];

    // Remove any existing modal
    var old = document.getElementById('pf-st-modal');
    if (old) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'pf-st-modal';

    var tableRows = rows.map(function(row, i) {
      return '<tr class="' + (i % 2 === 0 ? 'pf-st-row-even' : 'pf-st-row-odd') + '">' +
        '<td class="pf-st-td pf-st-ref">'                  + esc(row.ref)       + '</td>' +
        '<td class="pf-st-td pf-st-num">'                  + esc(row.arm)       + '</td>' +
        '<td class="pf-st-td pf-st-num">'                  + esc(row.iva)       + '</td>' +
        '<td class="pf-st-td pf-st-num">'                  + fmt(row.price)     + '</td>' +
        '<td class="pf-st-td pf-st-num">'                  + row.qty            + '</td>' +
      '</tr>';
    }).join('');

    var noData = rows.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa;font-style:italic;">Sem artigos nesta fatura</td></tr>'
      : '';

    modal.innerHTML =
      '<div id="pf-st-backdrop"></div>' +
      '<div id="pf-st-panel">' +
        '<div id="pf-st-header">' +
          '<div id="pf-st-title-wrap">' +
            '<span id="pf-st-inv-label">' + esc(inv.invoiceNo) + '</span>' +
            '<span id="pf-st-sub-label">Ingresso de Stock · Primavera ERP</span>' +
          '</div>' +
          '<div id="pf-st-actions">' +
            '<button id="pf-st-export-btn" class="pf-st-action-btn">⬇ Exportar Excel</button>' +
            '<button id="pf-st-close-btn" class="pf-st-close-btn" title="fechar">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="pf-st-scroll">' +
          '<table id="pf-st-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="pf-st-th pf-st-ref"><div class="pf-guia-th2-inner"><button class="pf-st-copy-btn" data-scol="0">&#x29c9;</button>Referencia</div></th>' +
                '<th class="pf-st-th pf-st-num"><div class="pf-guia-th2-inner" style="justify-content:center"><button class="pf-st-copy-btn" data-scol="1">&#x29c9;</button>ARM</div></th>' +
                '<th class="pf-st-th pf-st-num"><div class="pf-guia-th2-inner" style="justify-content:center"><button class="pf-st-copy-btn" data-scol="2">&#x29c9;</button>IVA</div></th>' +
                '<th class="pf-st-th pf-st-num"><div class="pf-guia-th2-inner" style="justify-content:center"><button class="pf-st-copy-btn" data-scol="3">&#x29c9;</button>&euro;</div></th>' +
                '<th class="pf-st-th pf-st-num"><div class="pf-guia-th2-inner" style="justify-content:center"><button class="pf-st-copy-btn" data-scol="4">&#x29c9;</button>Qtd.</div></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (noData || tableRows) + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div id="pf-st-footer">' +
          (function(){
            var modalQty   = rows.reduce(function(s,r){ return s+r.qty; }, 0);
            var modalTotal = rows.reduce(function(s,r){ return s + r.price*r.qty; }, 0);
            modalTotal = Math.round((modalTotal + Number.EPSILON)*100)/100;
            var motorQty   = res.parsedQty;
            var motorTotal = res.parsedPrice;
            var qMatch = modalQty === motorQty;
            var pMatch = Math.abs(modalTotal - motorTotal) < 0.02;
            var qCls   = qMatch ? 'pf-st-check-ok' : 'pf-st-check-err';
            var pCls   = pMatch ? 'pf-st-check-ok' : 'pf-st-check-err';
            var qIcon  = qMatch ? '✓' : '⚠';
            var pIcon  = pMatch ? '✓' : '⚠';
            function fmtN(n){ return Number(n).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
            return '<div class="pf-st-footer-row">' +
              rows.length + ' linhas · A5' +
              '<span id="pf-st-copy-msg"></span>' +
            '</div>' +
            '<div class="pf-st-footer-row">' +
              '<span class="' + qCls + '">' + qIcon + ' ' + modalQty + ' pcs</span>' +
              '<span style="color:#ccc">|</span>' +
              '<span class="' + pCls + '">' + pIcon + ' ' + fmtN(modalTotal) + ' € s/IVA</span>' +
            '</div>';
          })() +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    requestAnimationFrame(function(){ modal.classList.add('pf-st-visible'); });

    function closeModal() {
      modal.classList.remove('pf-st-visible');
      setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
    }
    modal.querySelector('#pf-st-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#pf-st-close-btn').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    /* Column copy buttons — same logic as TAM */
    var copyMsg   = modal.querySelector('#pf-st-copy-msg');
    var copyTimer = null;
    var colKeys   = ['ref','arm','iva','price','qty'];

    modal.querySelectorAll('.pf-st-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ci  = parseInt(btn.getAttribute('data-scol'));
        var key = colKeys[ci];
        var vals = rows.map(function(rw) {
          if (key === 'ref')   return rw.ref;
          if (key === 'arm')   return rw.arm;
          if (key === 'iva')   return rw.iva;
          if (key === 'price') return fmt(rw.price);
          return String(rw.qty);
        });
        if (!vals.length) return;
        modal.querySelectorAll('.pf-st-copy-btn').forEach(function(b){ b.classList.remove('pf-st-copy-active'); });
        btn.classList.add('pf-st-copy-active');
        var text = vals.join('\n');
        function showMsg(ok) {
          if (!copyMsg) return;
          copyMsg.textContent = ok ? '✓ ' + COL_S[ci] + ' copiado!' : '⚠ copie manualmente';
          copyMsg.style.color = ok ? '#2a5a2a' : '#888';
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(function(){
            copyMsg.textContent = '';
            modal.querySelectorAll('.pf-st-copy-btn').forEach(function(b){ b.classList.remove('pf-st-copy-active'); });
          }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function(){ showMsg(true); }).catch(function(){ showMsg(false); });
        } else {
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); showMsg(true);
          } catch(e2) { showMsg(false); }
        }
      });
    });

    /* Export CSV */
    modal.querySelector('#pf-st-export-btn').addEventListener('click', function() {
      var lines = ['\uFEFF' + ['Referencia','ARM','IVA','Euro','Quantidade'].join(';')];
      rows.forEach(function(row) {
        lines.push([row.ref, row.arm, row.iva, String(row.price).replace('.',','), row.qty].join(';'));
      });
      var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'Stock_' + (inv.invoiceNo||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SPINNER
  ══════════════════════════════════════════════════════════════ */
  function pfSpinner(msg) {
    var sp = document.getElementById('pf-spinner');
    if (!sp) return;
    if (msg) { sp.querySelector('.pf-spin-txt').textContent = msg; sp.classList.add('on'); }
    else      { sp.classList.remove('on'); }
  }

  /* ══════════════════════════════════════════════════════════════
     HANDLE FILES
  ══════════════════════════════════════════════════════════════ */
  async function pfHandleFiles(files) {
    var pdfs = Array.from(files).filter(function(f){
      return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    });
    if (!pdfs.length) return;

    var statusMsg = document.getElementById('pf-status-msg');

    for (var fi = 0; fi < pdfs.length; fi++) {
      var file = pdfs[fi];
      pfSpinner('a ler ' + file.name + ' (' + (fi+1) + '/' + pdfs.length + ')…');
      if (statusMsg) statusMsg.textContent = 'a processar…';

      try {
        var allItems = await pfExtract(file);
        pfSpinner('a analisar com 3 motores…');
        var inv = pfParseAll(allItems, file.name);

        var existIdx = pfState.invoices.findIndex(function(i){ return i.fileName === file.name; });
        if (existIdx >= 0) {
          // Preserve engine choice if user had manually selected one
          var prevEngine = pfState.activeEngines[file.name];
          pfState.invoices[existIdx] = inv;
          if (prevEngine) pfState.activeEngines[file.name] = prevEngine;
        } else {
          pfState.invoices.push(inv);
        }

        if (!pfState.sessionName) {
          pfState.sessionName = pfWeekName();
          pfState.createdAt   = Date.now();
        }
        pfSave();
        pfUpdateLbl();
        pfRender();

      } catch(err) {
        console.error('Parfois parse error:', err);
        if (statusMsg) statusMsg.textContent = 'erro: ' + err.message;
      }
    }
    pfSpinner(null);
  }

  /* ══════════════════════════════════════════════════════════════
     SESSION LABEL
  ══════════════════════════════════════════════════════════════ */
  function pfUpdateLbl() {
    var lbl = document.getElementById('pf-session-lbl');
    if (lbl && pfState.sessionName) lbl.textContent = pfState.sessionName;
  }

  /* ══════════════════════════════════════════════════════════════
     BUILD DOM
  ══════════════════════════════════════════════════════════════ */
  function pfBuildDOM() {
    /* Card in #faturas-sub-grid */
    var grid = document.getElementById('faturas-sub-grid');
    if (grid && !document.getElementById('pf-card')) {
      var card = document.createElement('div');
      card.id        = 'pf-card';
      card.className = 'adm-mod-card';
      card.setAttribute('data-faturas-module', 'parfois');
      card.style.animationDelay = '0.15s';
      card.innerHTML =
        '<span class="adm-mod-icon">' +
          '<svg width="36" height="36" viewBox="0 0 24 24" fill="none">' +
            '<rect x="3" y="4" width="18" height="16" rx="2" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>' +
            '<path d="M7 9h10M7 12h7M7 15h5" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" stroke-linecap="round"/>' +
            '<path d="M16 14l1.5 1.5L20 13" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</span>' +
        '<div><div class="adm-mod-name">PARFOIS</div><div class="adm-mod-desc">faturas Parfois · 3 motores · EAN + stock</div></div>' +
        '<div class="adm-mod-arrow">→</div>';
      card.addEventListener('click', pfOpen);
      grid.appendChild(card);
    }

    /* Main overlay */
    if (!document.getElementById('pf-overlay')) {
      var ov = document.createElement('div');
      ov.id  = 'pf-overlay';
      ov.innerHTML =
        '<div id="pf-bar">' +
          '<button id="pf-back">' +
            '<svg width="13" height="13" viewBox="0 0 12 12" fill="none">' +
              '<path d="M8 2L4 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg> faturas' +
          '</button>' +
          '<span id="pf-title">parfois</span>' +
          '<span id="pf-session-lbl"></span>' +
          '<button id="pf-clear-btn">limpar sessão</button>' +
        '</div>' +
        '<div id="pf-content">' +
          '<label id="pf-drop-area" for="pf-file-input">' +
            '<div id="pf-drop-lbl">arrastar PDF aqui ou clicar para seleccionar</div>' +
            '<div id="pf-drop-sub">faturas Parfois · um ou vários PDFs · 3 motores de leitura</div>' +
            '<input type="file" id="pf-file-input" accept="application/pdf" multiple>' +
          '</label>' +
          '<div id="pf-status-bar">' +
            '<span id="pf-status-msg">nenhuma fatura carregada</span>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      document.getElementById('pf-back').addEventListener('click', pfClose);
      document.getElementById('pf-clear-btn').addEventListener('click', function(){
        if (!pfState.invoices.length) return;
        if (confirm('Limpar sessão Parfois desta semana?')) {
          pfClear(); pfRender(); pfUpdateLbl();
        }
      });
      document.getElementById('pf-file-input').addEventListener('change', function(e){
        if (e.target.files.length) pfHandleFiles(e.target.files);
        e.target.value = '';
      });
      var da = document.getElementById('pf-drop-area');
      da.addEventListener('dragover',  function(e){ e.preventDefault(); da.classList.add('drag-over'); });
      da.addEventListener('dragleave', function(){ da.classList.remove('drag-over'); });
      da.addEventListener('drop',      function(e){
        e.preventDefault(); da.classList.remove('drag-over');
        var f = Array.from(e.dataTransfer.files).filter(function(f){ return f.name.toLowerCase().endsWith('.pdf'); });
        if (f.length) pfHandleFiles(f);
      });
    }

    /* Barcode overlay */
    if (!document.getElementById('pf-bc-overlay')) {
      var bc = document.createElement('div');
      bc.id  = 'pf-bc-overlay';
      bc.innerHTML =
        '<div id="pf-bc-panel">' +
          '<div id="pf-bc-hdr">' +
            '<span id="pf-bc-title">códigos de barras</span>' +
            '<button id="pf-bc-close">✕</button>' +
          '</div>' +
          '<div id="pf-bc-body"></div>' +
        '</div>';
      document.body.appendChild(bc);
      document.getElementById('pf-bc-close').addEventListener('click', function(){ bc.classList.remove('open'); });
      bc.addEventListener('click', function(e){ if (e.target === bc) bc.classList.remove('open'); });
    }

    /* Spinner */
    if (!document.getElementById('pf-spinner')) {
      var sp = document.createElement('div');
      sp.id  = 'pf-spinner';
      sp.innerHTML = '<div class="pf-spin"></div><div class="pf-spin-txt">a processar…</div>';
      document.body.appendChild(sp);
    }

    /* Escape closes overlays */
    document.addEventListener('keydown', function(e){
      if (e.key !== 'Escape') return;
      var bc2 = document.getElementById('pf-bc-overlay');
      if (bc2) bc2.classList.remove('open');
      // stock modal handles its own escape
    });
  }

  /* ══════════════════════════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════════════════════════ */
  function pfOpen() {
    var ov = document.getElementById('pf-overlay');
    if (!ov) return;
    ov.classList.add('open');
    requestAnimationFrame(function(){ ov.classList.add('visible'); });
  }
  function pfClose() {
    var ov = document.getElementById('pf-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    setTimeout(function(){ ov.classList.remove('open'); }, 450);
  }

  /* Hook faturas-sub-grid */
  function pfHook() {
    var grid = document.getElementById('faturas-sub-grid');
    if (!grid) return;
    if (grid._pfHooked) return;
    grid._pfHooked = true;
    grid.addEventListener('click', function(e){
      if (e.target.closest('[data-faturas-module="parfois"]')) {
        e.stopPropagation();
        pfOpen();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function pfInit() {
    pfStyles();
    pfBuildDOM();
    pfHook();
    if (pfLoad()) { pfRender(); pfUpdateLbl(); }
    else { pfState.sessionName = pfWeekName(); pfState.createdAt = Date.now(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pfInit);
  } else {
    pfInit();
  }

  new MutationObserver(function(){
    var grid = document.getElementById('faturas-sub-grid');
    if (grid && !document.getElementById('pf-card')) {
      pfBuildDOM();
      pfHook();
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
