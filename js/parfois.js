// ══════════════════════════════════════════════════════════════
//  PARFOIS — invoice parser · WAK04 Ilha Dourada  v2
//  · Parses ALL pages before processing
//  · Column-aware: groups PDF items by Y-position into rows,
//    then identifies columns by X to extract fields correctly
//  · EAN reconstruction from split cells (10+3 digits)
//  · Ref deduplication: sum qty, average price
//  · Cross-validation vs invoice totals
//  · Barcode overlay + Stock entry modal (A5, copyable)
//  · Greyscale palette · dark bg → white text !important
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONSTANTS & STATE
  ══════════════════════════════════════════════════════════════ */
  var PF_LS_KEY     = 'parfois_week_session_v2';
  var PF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var pfState = {
    invoices:    [],
    sessionName: '',
    createdAt:   null
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
        sessionName: pfState.sessionName,
        createdAt:   pfState.createdAt,
        invoices:    pfState.invoices
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
      pfState.sessionName = data.sessionName;
      pfState.createdAt   = data.createdAt;
      pfState.invoices    = data.invoices || [];
      return pfState.invoices.length > 0;
    } catch(e) { return false; }
  }

  function pfClear() {
    try { localStorage.removeItem(PF_LS_KEY); } catch(e) {}
    pfState.invoices    = [];
    pfState.sessionName = pfWeekName();
    pfState.createdAt   = Date.now();
  }

  /* ══════════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════════ */
  function pfStyles() {
    if (document.getElementById('pf-styles')) return;
    var s = document.createElement('style');
    s.id = 'pf-styles';
    s.textContent = [
      '#pf-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:220;flex-direction:column;opacity:0;transition:opacity 0.45s cubic-bezier(0.22,1,0.36,1);}',
      '#pf-overlay.open{display:flex;}',
      '#pf-overlay.visible{opacity:1;}',
      '#pf-bar{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #e6e6e6;background:#fff;flex-shrink:0;flex-wrap:wrap;}',
      '#pf-back{font-size:.9rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#000;border:1.5px solid #000;padding:7px 16px 7px 12px;border-radius:10px;transition:background .2s,transform .15s;text-transform:lowercase;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,0.18);display:inline-flex;align-items:center;gap:8px;}',
      '#pf-back:hover{background:#333;border-color:#333;transform:translateY(-1px);}',
      '#pf-title{font-size:.82rem;font-weight:bold;text-transform:lowercase;letter-spacing:.06em;color:#000;}',
      '#pf-session-lbl{font-size:.72rem;color:#aaa;margin-left:auto;white-space:nowrap;}',
      '#pf-clear-btn{font-size:.72rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#666;border:1.5px solid #666;padding:5px 12px;border-radius:8px;transition:background .2s;text-transform:lowercase;white-space:nowrap;}',
      '#pf-clear-btn:hover{background:#333;border-color:#333;}',
      '#pf-content{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;padding:28px 16px 60px;font-family:\'MontserratLight\',sans-serif;-webkit-overflow-scrolling:touch;}',
      '#pf-drop-area{width:100%;max-width:680px;border:2px dashed #ccc;border-radius:14px;padding:32px 24px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:#fafafa;margin-bottom:20px;box-sizing:border-box;}',
      '#pf-drop-area:hover,#pf-drop-area.drag-over{border-color:#555;background:#f0f0f0;}',
      '#pf-drop-lbl{font-size:.88rem;font-weight:600;color:#555;}',
      '#pf-drop-sub{font-size:.72rem;color:#bbb;margin-top:5px;}',
      '#pf-file-input{display:none;}',
      '#pf-status-bar{width:100%;max-width:680px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px;}',
      '#pf-status-msg{font-size:.82rem;font-weight:bold;color:#555;}',
      '.pf-btn{font-size:.78rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:7px 14px;border-radius:8px;border:1.5px solid #ccc;background:#fff;color:#000!important;transition:background .15s,border-color .15s;text-transform:lowercase;white-space:nowrap;}',
      '.pf-btn:hover{background:#f0f0f0;border-color:#888;}',
      '.pf-btn-dark{background:#222!important;color:#fff!important;border-color:#222!important;}',
      '.pf-btn-dark:hover{background:#444!important;border-color:#444!important;}',
      '.pf-btn-mid{background:#555!important;color:#fff!important;border-color:#555!important;}',
      '.pf-btn-mid:hover{background:#333!important;border-color:#333!important;}',
      '.pf-inv-block{width:100%;max-width:680px;margin-bottom:28px;border:1.5px solid #e0e0e0;border-radius:14px;overflow:hidden;}',
      '.pf-inv-hdr{background:#222;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
      '.pf-inv-num{font-size:.95rem;font-weight:bold;color:#fff!important;letter-spacing:.05em;}',
      '.pf-inv-meta{font-size:.72rem;color:rgba(255,255,255,0.6)!important;}',
      '.pf-inv-total{font-size:.82rem;font-weight:bold;color:#fff!important;}',
      '.pf-inv-acts{display:flex;gap:8px;flex-wrap:wrap;}',
      '.pf-badge{font-size:.68rem;font-weight:bold;padding:4px 10px;border-radius:20px;white-space:nowrap;}',
      '.pf-ok{background:#2a5a2a!important;color:#fff!important;}',
      '.pf-err{background:#7a1a1a!important;color:#fff!important;}',
      '.pf-warn{background:#555!important;color:#fff!important;}',
      '.pf-val-row{margin:0 16px 10px;padding:8px 12px;border-radius:8px;font-size:.75rem;font-weight:bold;}',
      '.pf-val-row.ok{background:#e8f5e8;border:1px solid #b0d0b0;color:#1a4a1a!important;}',
      '.pf-val-row.err{background:#fdf0f0;border:1px solid #e0b0b0;color:#6a1010!important;}',
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
      '#pf-spinner{display:none;position:fixed;inset:0;z-index:999;background:rgba(255,255,255,0.88);align-items:center;justify-content:center;flex-direction:column;gap:14px;}',
      '#pf-spinner.on{display:flex;}',
      '.pf-spin{width:36px;height:36px;border:3px solid #ddd;border-top-color:#333;border-radius:50%;animation:pf-spin .7s linear infinite;}',
      '.pf-spin-txt{font-size:.82rem;font-weight:bold;color:#666;}',
      '@keyframes pf-spin{to{transform:rotate(360deg);}}',
      '#pf-bc-overlay{display:none;position:fixed;inset:0;z-index:310;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);align-items:center;justify-content:center;}',
      '#pf-bc-overlay.open{display:flex;}',
      '#pf-bc-panel{background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:540px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);}',
      '#pf-bc-hdr{background:#222;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#pf-bc-title{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.07em;text-transform:uppercase;}',
      '#pf-bc-close{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;line-height:1;}',
      '#pf-bc-close:hover{background:rgba(255,255,255,0.15);}',
      '#pf-bc-body{overflow-y:auto;padding:14px 18px;flex:1;}',
      '.pf-bc-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f0f0f0;}',
      '.pf-bc-row:last-child{border-bottom:none;}',
      '.pf-bc-info{flex:1;min-width:0;}',
      '.pf-bc-ref{font-size:.78rem;font-weight:bold;color:#000!important;letter-spacing:.05em;}',
      '.pf-bc-name{font-size:.72rem;color:#999!important;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pf-bc-code{font-size:.85rem;font-weight:bold;color:#000!important;letter-spacing:.1em;background:#f5f5f5;padding:4px 10px;border-radius:6px;border:1px solid #e0e0e0;white-space:nowrap;font-variant-numeric:tabular-nums;}',
      '#pf-st-overlay{display:none;position:fixed;inset:0;z-index:310;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);align-items:center;justify-content:center;}',
      '#pf-st-overlay.open{display:flex;}',
      '#pf-st-panel{background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:600px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);}',
      '#pf-st-hdr{background:#333;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#pf-st-hdr-info{flex:1;}',
      '#pf-st-title{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.07em;text-transform:uppercase;}',
      '#pf-st-sub{font-size:.68rem;color:rgba(255,255,255,0.55)!important;margin-top:3px;}',
      '#pf-st-close{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;line-height:1;}',
      '#pf-st-close:hover{background:rgba(255,255,255,0.15);}',
      '#pf-st-cbar{background:#f5f5f5;padding:9px 18px;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '#pf-st-copy{font-size:.75rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:6px 14px;border-radius:8px;border:none;background:#333!important;color:#fff!important;transition:background .15s;text-transform:lowercase;}',
      '#pf-st-copy:hover{background:#111!important;}',
      '#pf-st-cstatus{font-size:.72rem;font-weight:bold;color:#666;}',
      '#pf-st-body{overflow-y:auto;flex:1;}',
      '#pf-st-ta{width:100%;box-sizing:border-box;padding:14px 18px;font-size:.8rem;font-weight:600;font-family:\'MontserratLight\',sans-serif;border:none;outline:none;resize:none;color:#000!important;background:#fff;line-height:1.75;min-height:280px;}',
      '@media(max-width:480px){.pf-inv-hdr{flex-direction:column;align-items:flex-start;}.pf-table td,.pf-table th{padding:5px 7px;font-size:.74rem;}}'
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
     PDF EXTRACTION — column-aware
     
     Strategy:
     1. Extract ALL items from ALL pages with their x,y coordinates
     2. Group items into rows by Y coordinate (within 4px tolerance)
     3. Within each row, sort items by X to get column order
     4. Identify table rows by detecting article code patterns
     5. EAN is always the 2nd column: first part ~10 digits, second
        part ~3 digits on the NEXT row continuing the same record
  ══════════════════════════════════════════════════════════════ */
  async function pfExtract(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js não disponível');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PF_WORKER_URL;
    }

    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    // Collect ALL items from ALL pages with global coords
    // We add a large Y offset per page so page 2 items are always below page 1
    var allItems = [];
    var pageYOffset = 0;
    var PAGE_HEIGHT_ESTIMATE = 1000; // large enough to separate pages

    for (var p = 1; p <= pdf.numPages; p++) {
      var page    = await pdf.getPage(p);
      var vp      = page.getViewport({ scale: 1 });
      var content = await page.getTextContent();

      content.items.forEach(function(item) {
        if (!item.str || !item.str.trim()) return;
        var x = item.transform[4];
        // PDF Y is bottom-up, convert to top-down
        var y = vp.height - item.transform[5];
        allItems.push({
          str:  item.str.trim(),
          x:    x,
          y:    y + pageYOffset,
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
    // Sort by Y then X
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

  /* ══════════════════════════════════════════════════════════════
     MAIN PARSER
  ══════════════════════════════════════════════════════════════ */
  function pfParse(allItems, fileName) {
    /* ── 1. Extract header info from raw text ── */
    var allText   = allItems.map(function(i){ return i.str; }).join(' ');
    var invoiceNo = '';
    var invoiceDate = '';

    var mft = allText.match(/FT\s+(\d{4}\/\d{6,7})/);
    if (mft) invoiceNo = 'FT ' + mft[1];
    var mdate = allText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (mdate) invoiceDate = mdate[1];

    /* ── 2. Extract footer totals ── */
    var totalQtd = 0;
    var totalEur = 0;
    var numCaixas = 0;

    var mq  = allText.match(/Total\s+Qtd\s+(\d+)/i);
    if (mq) totalQtd = parseInt(mq[1]);
    var me  = allText.match(/TOTAL\s+EUR\s+([\d.,]+)/i);
    if (me) totalEur = parseFloat(me[1].replace(/\./g,'').replace(',','.'));
    var mcx = allText.match(/N[oº°]\s*total\s+de\s+caixas[:\s]+(\d+)/i);
    if (mcx) numCaixas = parseInt(mcx[1]);

    /* ── 3. Group into rows ── */
    var rows = groupRows(allItems, 5);

    /* ── 4. Identify the table X-columns by scanning for known patterns
       The table structure (left→right) is:
         Col A (x~30-120):   Box code OR Article code OR size suffix
         Col B (x~120-200):  EAN part 1 (first ~10 digits)
         Col C (x~200-260):  Código Pautal (6 digits)
         Col D (x~260-380):  Descrição (product name)
         Col E (x~380-520):  Composição (long text)
         Col F (x~520-560):  País (CN/MM/TR/IN/VN/BD/MA)
         Col G (x~560-590):  Qtd p/Caixa (integer)
         Col H (x~590-620):  % IVA (23)
         Col I (x~620-660):  Cód. (usually empty)
         Col J (x~660-710):  Preço Unit. (e.g. 12,680)
         Col K (x~710-740):  % Desc. (0,00)
         Col L (x~740-800):  Preço total (e.g. 25,36)
       
       We don't hardcode X values — instead we detect by content patterns.
    ── */

    // Known country codes
    var COUNTRIES = /^(CN|MM|TR|IN|VN|BD|MA|CA|PT|ES|FR|IT|DE|PK|BD|KH|TH|ID|MY|TW|HK|MX|CO|PE|TN|MA|EG|LK|MR|SN|ET|KE)$/;

    // Article code pattern: digits+underscore+letters, or digits+letters (no underscore)
    function isArticleCode(s) {
      return /^\d{5,8}[_\-A-Z]/.test(s) ||   // 218121_WT, 246919_NVL
             /^\d{5,8}[A-Z]{2,4}$/.test(s) || // 246919NVL (no underscore)
             /^\d{5,8}NCL$/.test(s) ||         // 244521NCL
             /^\d{5,8}NCS$/.test(s) ||
             /^\d{5,8}NCM$/.test(s) ||
             /^\d{5,8}BNL$/.test(s);
    }

    // Box code pattern
    function isBoxCode(s) {
      return /^[OSGEP]\d{10,}$/.test(s) || /^[OSGEP]\d{9,}[A-Z]?\d?$/.test(s);
    }

    // EAN partial: first part (7-11 digits)
    function isEanPart1(s) {
      return /^\d{7,11}$/.test(s);
    }

    // EAN fragment: second part (2-6 digits)
    function isEanPart2(s) {
      return /^\d{2,6}$/.test(s);
    }

    function isFullEan(s) {
      return /^\d{13}$/.test(s);
    }

    // Código Pautal: 6 digits
    function isPautal(s) {
      return /^\d{6}$/.test(s);
    }

    // Price: N,NN or NN,NN or NNN,NN
    function isPrice(s) {
      return /^\d{1,4},\d{2}$/.test(s);
    }

    function parsePrice(s) {
      return parseFloat(s.replace(',', '.'));
    }

    // Size suffix (can follow article code split across rows)
    function isSizeSuffix(s) {
      return /^(XS-?S|S-?S|M-?L|XL|XXS|XS|S|M|L|XL|XXL|\d+-\d+)$/.test(s);
    }

    /* ── 5. State machine over rows ── */
    var items = [];  // parsed line items

    var state = {
      code:     null,
      ean1:     null,  // first fragment
      ean:      null,  // full 13-digit EAN
      pautal:   null,
      desc:     null,
      country:  null,
      qty:      null,
      unitPrice:null,
      price:    null,  // line total
      rowIdx:   -1
    };

    function flush() {
      if (state.code && state.desc && state.qty !== null && state.price !== null) {
        var ref = state.code.match(/^(\d+)/);
        if (ref) {
          items.push({
            ref:      ref[1],
            code:     state.code,
            ean:      state.ean || '',
            desc:     state.desc,
            qty:      state.qty,
            unitPrice:state.unitPrice || 0,
            price:    state.price
          });
        }
      }
      state.code      = null;
      state.ean1      = null;
      state.ean       = null;
      state.pautal    = null;
      state.desc      = null;
      state.country   = null;
      state.qty       = null;
      state.unitPrice = null;
      state.price     = null;
    }

    for (var ri = 0; ri < rows.length; ri++) {
      var row   = rows[ri];
      var cells = row.items; // already sorted by X

      if (!cells.length) continue;

      var firstCell  = cells[0].str;
      var allCells   = cells.map(function(c){ return c.str; });
      var rowStr     = allCells.join(' ');

      // Skip obvious header/footer lines
      if (/^(Barata|BARATA|Contribuinte|Rua|www\.|INVOICE|Pág\.|Qtd (a transferir|transferida)|Valor (a transferir|transferido)|Total Qtd|TOTAL EUR|Subtotal|Desconto|Frete|Seguro|Total IVA|Nº total|Peso|Volume|Local de|Lugar de|Processado|ATCUD:|Em caso|Data:|Hora:|Matric|Cliente|WAK|WAKZOME|Morada|PORTUGAL|Porto Santo|Rua Dr)/i.test(rowStr)) continue;
      if (/^(FT\s+\d{4}\/|% IVA|Incidência|Valor IVA|23,00\s+\d|Obs\.\:|O Gestor|Nuno|Caixa\s|Código|artigo|Descrição|Composição|País|IVA|Cód\.|Preço|Desc\.)/i.test(rowStr)) continue;
      if (/^(Pronto Pag|Air|CIF|ORIGINAL)/i.test(rowStr)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}\s*$/.test(rowStr)) continue;
      if (/^(100002|ATCUD:)/.test(firstCell)) continue;

      // ── Box code row → just marks a new group, flush previous ──
      if (isBoxCode(firstCell)) {
        flush();
        continue;
      }

      // ── Article code row ──
      if (isArticleCode(firstCell)) {
        flush();
        state.code = firstCell;

        // Parse all cells in this row
        for (var ci = 1; ci < cells.length; ci++) {
          var c = cells[ci].str;

          // EAN part 1 (second column, before Pautal)
          if (!state.ean && !state.pautal && isEanPart1(c)) {
            state.ean1 = c;
            continue;
          }
          // Full EAN
          if (!state.ean && isFullEan(c)) {
            state.ean = c;
            state.ean1 = null;
            continue;
          }
          // Pautal
          if (!state.pautal && isPautal(c)) {
            state.pautal = c;
            continue;
          }
          // Country code
          if (!state.country && COUNTRIES.test(c)) {
            state.country = c;
            continue;
          }
          // After country: qty (integer 1-9), then 23 (IVA), then unitPrice, then 0,00, then price
          if (state.country && state.qty === null && /^\d{1,3}$/.test(c)) {
            state.qty = parseInt(c);
            continue;
          }
          if (state.qty !== null && c === '23') continue; // IVA
          if (state.qty !== null && state.unitPrice === null && isPrice(c)) {
            state.unitPrice = parsePrice(c);
            continue;
          }
          if (state.unitPrice !== null && c === '0,00') continue; // discount
          if (state.unitPrice !== null && state.price === null && isPrice(c)) {
            state.price = parsePrice(c);
            continue;
          }
          // Description: appears after Pautal, before country
          // If not yet captured, and this looks like a description word
          if (state.pautal && !state.country && !state.desc && !/^\d/.test(c) && c.length > 2) {
            // Accumulate description words (stop at composition keywords)
            if (!/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(c)) {
              state.desc = (state.desc ? state.desc + ' ' : '') + c;
            }
          }
        }
        continue;
      }

      // ── Continuation row (not a new article code) ──
      if (state.code) {
        // Could be: size suffix, EAN fragment 2, desc continuation, qty/price if they were on next row

        // EAN fragment 2 (completes the EAN)
        if (state.ean1 && !state.ean && isEanPart2(firstCell)) {
          var candidate = state.ean1 + firstCell;
          if (candidate.length === 13) {
            state.ean  = candidate;
            state.ean1 = null;
          }
          // Rest of row might contain pautal, desc, country, qty, prices
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

        // Size suffix on its own row (e.g. "M-L", "S-S")
        if (isSizeSuffix(firstCell) && cells.length === 1 && !state.desc) {
          state.code = state.code + ' ' + firstCell;
          continue;
        }

        // If we haven't gotten desc yet and this row has desc-like content
        if (!state.desc && !state.country) {
          var descCandidates = cells.filter(function(c){
            return !isPautal(c.str) && !isEanPart1(c.str) && !isEanPart2(c.str) &&
                   !COUNTRIES.test(c.str) && !/^\d{1,3}$/.test(c.str) &&
                   !isPrice(c.str) && c.str !== '23' && c.str !== '0,00' &&
                   !/^(Forro:|Corpo:|Exterior:|Insole|superior:|forro:|sola:|Ext comp|Int comp)/i.test(c.str) &&
                   c.str.length > 2;
          });
          if (descCandidates.length) {
            state.desc = descCandidates.map(function(c){ return c.str; }).join(' ').trim();
          }
        }

        // If still missing qty/price from a trailing row
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
    flush(); // final flush

    /* ── 6. DEDUPLICATION: sum qty, weighted-average price ── */
    var refMap = {};
    items.forEach(function(item) {
      var key = item.ref;
      if (!refMap[key]) {
        refMap[key] = {
          ref:        item.ref,
          desc:       item.desc,
          ean:        item.ean,
          totalQty:   0,
          totalPrice: 0,
          sumUnit:    0,
          count:      0
        };
      }
      var r = refMap[key];
      r.totalQty   += item.qty;
      r.totalPrice += item.price;
      r.sumUnit    += item.unitPrice * item.qty;
      r.count      += 1;
      if (!r.ean && item.ean) r.ean = item.ean;
      if (item.desc && item.desc.length > (r.desc || '').length) r.desc = item.desc;
    });

    var grouped = Object.values(refMap).map(function(r) {
      var avgUnit = r.totalQty > 0 ? rnd2(r.sumUnit / r.totalQty) : 0;
      return {
        ref:       r.ref,
        desc:      r.desc || '—',
        ean:       r.ean || '',
        qty:       r.totalQty,
        price:     rnd2(r.totalPrice),
        unitPrice: avgUnit
      };
    });

    /* ── 7. Cross-validation ── */
    var parsedQty   = grouped.reduce(function(s,g){ return s + g.qty; }, 0);
    var parsedPrice = rnd2(grouped.reduce(function(s,g){ return s + g.price; }, 0));
    var qtyOk       = totalQtd > 0 ? parsedQty === totalQtd : null;
    var priceOk     = totalEur > 0 ? Math.abs(parsedPrice - totalEur) < 0.15 : null;

    return {
      fileName:    fileName,
      invoiceNo:   invoiceNo || fileName.replace(/\.pdf$/i, ''),
      invoiceDate: invoiceDate,
      numCaixas:   numCaixas,
      totalQtd:    totalQtd,
      totalEur:    totalEur,
      parsedQty:   parsedQty,
      parsedPrice: parsedPrice,
      qtyOk:       qtyOk,
      priceOk:     priceOk,
      valid:       qtyOk !== false && priceOk !== false,
      items:       grouped
    };
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  function pfRender() {
    var content    = document.getElementById('pf-content');
    var statusMsg  = document.getElementById('pf-status-msg');
    if (!content) return;

    // Remove old blocks
    content.querySelectorAll('.pf-inv-block,.pf-empty').forEach(function(el){ el.remove(); });

    if (!pfState.invoices.length) {
      statusMsg.textContent = 'nenhuma fatura carregada';
      var em = document.createElement('div');
      em.className = 'pf-empty';
      em.textContent = 'carregue uma fatura Parfois (PDF)';
      content.appendChild(em);
      return;
    }

    var totRefs = pfState.invoices.reduce(function(s,inv){ return s + inv.items.length; }, 0);
    var totPcs  = pfState.invoices.reduce(function(s,inv){ return s + inv.parsedQty; }, 0);
    statusMsg.textContent = pfState.invoices.length + ' fatura(s) · ' + totRefs + ' referências · ' + totPcs + ' peças';

    pfState.invoices.forEach(function(inv, idx) {
      var block = document.createElement('div');
      block.className = 'pf-inv-block';

      // Badge
      var badge = '';
      if (inv.qtyOk === true && inv.priceOk === true) {
        badge = '<span class="pf-badge pf-ok">✓ validado</span>';
      } else if (inv.qtyOk === false || inv.priceOk === false) {
        badge = '<span class="pf-badge pf-err">⚠ divergência</span>';
      } else {
        badge = '<span class="pf-badge pf-warn">– sem totais</span>';
      }

      block.innerHTML =
        '<div class="pf-inv-hdr">' +
          '<div>' +
            '<div class="pf-inv-num">' + esc(inv.invoiceNo) + '</div>' +
            '<div class="pf-inv-meta">' + esc(inv.invoiceDate) +
              (inv.numCaixas ? ' · ' + inv.numCaixas + ' cx.' : '') +
              ' · ' + inv.parsedQty + ' pcs' +
            '</div>' +
          '</div>' +
          badge +
          '<div class="pf-inv-total">' + fmt(inv.parsedPrice) + ' €</div>' +
          '<div class="pf-inv-acts">' +
            '<button class="pf-btn pf-btn-mid" data-bc="' + idx + '">códigos de barras</button>' +
            '<button class="pf-btn pf-btn-dark" data-st="' + idx + '">ingresso de stock</button>' +
          '</div>' +
        '</div>';

      // Validation summary
      if (inv.qtyOk === false || inv.priceOk === false) {
        var vd = document.createElement('div');
        vd.className = 'pf-val-row err';
        var msgs = [];
        if (inv.qtyOk === false) msgs.push('qtd lida: ' + inv.parsedQty + ' · fatura: ' + inv.totalQtd);
        if (inv.priceOk === false) msgs.push('valor lido: ' + fmt(inv.parsedPrice) + ' € · fatura: ' + fmt(inv.totalEur) + ' €');
        vd.textContent = msgs.join('  ·  ');
        block.appendChild(vd);
      } else if (inv.qtyOk === true && inv.priceOk === true) {
        var vo = document.createElement('div');
        vo.className = 'pf-val-row ok';
        vo.textContent = '✓ totais confirmados · ' + inv.totalQtd + ' pcs · ' + fmt(inv.totalEur) + ' €';
        block.appendChild(vo);
      }

      // Table
      var tw = document.createElement('div');
      tw.className = 'pf-table-wrap';
      var rows = inv.items.map(function(it) {
        return '<tr>' +
          '<td class="pf-td-ref">' + esc(it.ref) + '</td>' +
          '<td class="pf-td-name">' + esc(it.desc) + '</td>' +
          '<td class="pf-td-r">' + it.qty + '</td>' +
          '<td class="pf-td-r">' + fmt(it.price) + ' €</td>' +
        '</tr>';
      }).join('');
      tw.innerHTML =
        '<table class="pf-table">' +
          '<thead><tr>' +
            '<th>Referência</th><th>Nome</th>' +
            '<th style="text-align:right">Pcs</th>' +
            '<th style="text-align:right">Preço</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot><tr>' +
            '<td colspan="2" style="font-weight:bold;color:#000!important;">TOTAL</td>' +
            '<td class="pf-td-r" style="font-weight:bold;color:#000!important;">' + inv.parsedQty + '</td>' +
            '<td class="pf-td-r" style="font-weight:bold;color:#000!important;">' + fmt(inv.parsedPrice) + ' €</td>' +
          '</tr></tfoot>' +
        '</table>';
      block.appendChild(tw);
      content.appendChild(block);
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
    var ov   = document.getElementById('pf-bc-overlay');
    var body = document.getElementById('pf-bc-body');
    var ttl  = document.getElementById('pf-bc-title');
    ttl.textContent = inv.invoiceNo + ' · códigos de barras';
    var withEan = inv.items.filter(function(it){ return it.ean; });
    body.innerHTML = withEan.length
      ? withEan.map(function(it){
          return '<div class="pf-bc-row">' +
            '<div class="pf-bc-info">' +
              '<div class="pf-bc-ref">' + esc(it.ref) + '</div>' +
              '<div class="pf-bc-name">' + esc(it.desc) + '</div>' +
            '</div>' +
            '<div class="pf-bc-code">' + esc(it.ean) + '</div>' +
          '</div>';
        }).join('')
      : '<div style="text-align:center;padding:40px;color:#bbb;font-size:.82rem;">nenhum EAN encontrado</div>';
    ov.classList.add('open');
  }

  /* ══════════════════════════════════════════════════════════════
     STOCK MODAL
  ══════════════════════════════════════════════════════════════ */
  function pfOpenST(idx) {
    var inv = pfState.invoices[idx];
    if (!inv) return;
    var ov  = document.getElementById('pf-st-overlay');
    var sub = document.getElementById('pf-st-sub');
    var ta  = document.getElementById('pf-st-ta');
    sub.textContent = inv.invoiceNo + ' · ' + inv.invoiceDate + ' · Armazém A5';
    var lines = [
      'INGRESSO DE STOCK · ' + inv.invoiceNo + ' · ' + inv.invoiceDate,
      'Armazém: A5',
      '',
      'Ref\tNome\tQtd\tPreço Unit.\tTotal',
      '─'.repeat(56)
    ];
    inv.items.forEach(function(it){
      lines.push(it.ref + '\t' + it.desc + '\t' + it.qty + '\t' + fmt(it.unitPrice) + ' €\t' + fmt(it.price) + ' €');
    });
    lines.push('─'.repeat(56));
    lines.push('TOTAL\t\t' + inv.parsedQty + '\t\t' + fmt(inv.parsedPrice) + ' €');
    ta.value = lines.join('\n');
    ov.classList.add('open');
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
        pfSpinner('a analisar ' + file.name + '…');
        var parsed   = pfParse(allItems, file.name);

        var existIdx = pfState.invoices.findIndex(function(inv){ return inv.fileName === file.name; });
        if (existIdx >= 0) pfState.invoices[existIdx] = parsed;
        else pfState.invoices.push(parsed);

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
        '<div><div class="adm-mod-name">PARFOIS</div><div class="adm-mod-desc">faturas Parfois · EAN + stock</div></div>' +
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
            '<div id="pf-drop-sub">faturas Parfois · um ou vários PDFs</div>' +
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

    /* Stock modal */
    if (!document.getElementById('pf-st-overlay')) {
      var st = document.createElement('div');
      st.id  = 'pf-st-overlay';
      st.innerHTML =
        '<div id="pf-st-panel">' +
          '<div id="pf-st-hdr">' +
            '<div id="pf-st-hdr-info">' +
              '<div id="pf-st-title">ingresso de stock · A5</div>' +
              '<div id="pf-st-sub"></div>' +
            '</div>' +
            '<button id="pf-st-close">✕</button>' +
          '</div>' +
          '<div id="pf-st-cbar">' +
            '<button id="pf-st-copy">copiar tudo</button>' +
            '<span id="pf-st-cstatus"></span>' +
          '</div>' +
          '<div id="pf-st-body"><textarea id="pf-st-ta" readonly></textarea></div>' +
        '</div>';
      document.body.appendChild(st);
      document.getElementById('pf-st-close').addEventListener('click', function(){ st.classList.remove('open'); });
      st.addEventListener('click', function(e){ if (e.target === st) st.classList.remove('open'); });
      document.getElementById('pf-st-copy').addEventListener('click', function(){
        var ta  = document.getElementById('pf-st-ta');
        var cs  = document.getElementById('pf-st-cstatus');
        ta.select();
        try {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(ta.value).then(function(){
              cs.textContent = '✓ copiado!';
              setTimeout(function(){ cs.textContent = ''; }, 2000);
            });
          } else {
            document.execCommand('copy');
            cs.textContent = '✓ copiado!';
            setTimeout(function(){ cs.textContent = ''; }, 2000);
          }
        } catch(e) { cs.textContent = 'seleccione manualmente'; }
      });
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
      var st2 = document.getElementById('pf-st-overlay');
      if (bc2) bc2.classList.remove('open');
      if (st2) st2.classList.remove('open');
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

  /* Re-init if grid appears later */
  new MutationObserver(function(){
    var grid = document.getElementById('faturas-sub-grid');
    if (grid && !document.getElementById('pf-card')) {
      pfBuildDOM();
      pfHook();
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
