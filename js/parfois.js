// ══════════════════════════════════════════════════════════════
//  PARFOIS — invoice parser · WAK04 Ilha Dourada
//  · Auto-injects card into #faturas-sub-grid
//  · Full overlay with session persistence (localStorage)
//  · PDF parsing via pdf.js (already loaded in index.html)
//  · EAN reconstruction (2-line split → 13 digits)
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
  var PF_LS_KEY      = 'parfois_week_session';
  var PF_WORKER_URL  = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var pfState = {
    invoices: [],      // parsed invoices for this week session
    sessionName: '',
    createdAt: null
  };

  /* ══════════════════════════════════════════════════════════════
     WEEK SESSION NAME
  ══════════════════════════════════════════════════════════════ */
  function pfWeekName() {
    var d   = new Date();
    var day = d.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    var mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    var dd   = String(mon.getDate()).padStart(2, '0');
    var mm   = String(mon.getMonth() + 1).padStart(2, '0');
    var yyyy = mon.getFullYear();
    return 'Parfois ' + dd + '/' + mm + '/' + yyyy;
  }

  /* ══════════════════════════════════════════════════════════════
     LOCALSTORAGE PERSISTENCE
  ══════════════════════════════════════════════════════════════ */
  function pfSaveSession() {
    try {
      localStorage.setItem(PF_LS_KEY, JSON.stringify({
        sessionName: pfState.sessionName,
        createdAt:   pfState.createdAt,
        invoices:    pfState.invoices
      }));
    } catch(e) { console.warn('Parfois: save error', e); }
  }

  function pfLoadSession() {
    try {
      var raw = localStorage.getItem(PF_LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var weekName = pfWeekName();
      // Only load if session belongs to current week
      if (!data.sessionName || !data.sessionName.startsWith('Parfois ')) return false;
      // Check if the session date matches current week
      var sessionDate = data.sessionName.replace('Parfois ', '');
      var currentDate = weekName.replace('Parfois ', '');
      if (sessionDate !== currentDate) return false;
      pfState.sessionName = data.sessionName;
      pfState.createdAt   = data.createdAt;
      pfState.invoices    = data.invoices || [];
      return pfState.invoices.length > 0;
    } catch(e) { return false; }
  }

  function pfClearSession() {
    try { localStorage.removeItem(PF_LS_KEY); } catch(e) {}
    pfState.invoices    = [];
    pfState.sessionName = pfWeekName();
    pfState.createdAt   = Date.now();
  }

  /* ══════════════════════════════════════════════════════════════
     INJECT STYLES
  ══════════════════════════════════════════════════════════════ */
  function pfEnsureStyles() {
    if (document.getElementById('pf-styles')) return;
    var s = document.createElement('style');
    s.id = 'pf-styles';
    s.textContent = [
      /* ── Overlay shell ── */
      '#pf-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:220;flex-direction:column;opacity:0;transition:opacity 0.45s cubic-bezier(0.22,1,0.36,1);}',
      '#pf-overlay.open{display:flex;}',
      '#pf-overlay.visible{opacity:1;}',

      /* ── Top bar ── */
      '#pf-bar{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid #e6e6e6;background:#fff;flex-shrink:0;}',
      '#pf-back{font-size:.9rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#000;border:1.5px solid #000;padding:7px 16px 7px 12px;border-radius:10px;transition:background .2s,transform .15s,box-shadow .15s;text-transform:lowercase;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,0.18);display:inline-flex;align-items:center;gap:8px;}',
      '#pf-back:hover{background:#333;border-color:#333;transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,0.22);}',
      '#pf-title{font-size:.82rem;font-weight:bold;text-transform:lowercase;letter-spacing:.06em;color:#000;}',
      '#pf-session-label{font-size:.72rem;font-weight:600;color:#888;margin-left:auto;letter-spacing:.04em;}',
      '#pf-clear-btn{font-size:.72rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;color:#fff!important;background:#555;border:1.5px solid #555;padding:5px 12px;border-radius:8px;transition:background .2s;text-transform:lowercase;white-space:nowrap;}',
      '#pf-clear-btn:hover{background:#333;border-color:#333;}',

      /* ── Content ── */
      '#pf-content{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;padding:32px 16px 60px;font-family:\'MontserratLight\',sans-serif;-webkit-overflow-scrolling:touch;}',

      /* ── Upload zone ── */
      '#pf-upload-zone{width:100%;max-width:680px;margin-bottom:28px;}',
      '#pf-drop-area{border:2px dashed #ccc;border-radius:14px;padding:36px 24px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:#fafafa;}',
      '#pf-drop-area:hover,#pf-drop-area.drag-over{border-color:#555;background:#f0f0f0;}',
      '#pf-drop-label{font-size:.88rem;font-weight:600;color:#555;letter-spacing:.04em;}',
      '#pf-drop-sub{font-size:.72rem;color:#aaa;margin-top:6px;}',
      '#pf-file-input{display:none;}',

      /* ── Status bar ── */
      '#pf-status-bar{width:100%;max-width:680px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '#pf-status-msg{font-size:.82rem;font-weight:bold;color:#555;letter-spacing:.03em;}',
      '#pf-action-btns{display:flex;gap:8px;flex-wrap:wrap;}',

      /* ── Action buttons ── */
      '.pf-btn{font-size:.78rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:7px 16px;border-radius:8px;border:1.5px solid #ccc;background:#fff;color:#000!important;transition:background .15s,border-color .15s,color .15s;text-transform:lowercase;white-space:nowrap;}',
      '.pf-btn:hover{background:#f0f0f0;border-color:#888;}',
      '.pf-btn.pf-btn-dark{background:#222!important;color:#fff!important;border-color:#222!important;}',
      '.pf-btn.pf-btn-dark:hover{background:#444!important;border-color:#444!important;}',
      '.pf-btn.pf-btn-mid{background:#555!important;color:#fff!important;border-color:#555!important;}',
      '.pf-btn.pf-btn-mid:hover{background:#333!important;border-color:#333!important;}',

      /* ── Invoice block ── */
      '.pf-inv-block{width:100%;max-width:680px;margin-bottom:32px;border:1.5px solid #e0e0e0;border-radius:14px;overflow:hidden;}',
      '.pf-inv-header{background:#222;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.pf-inv-number{font-size:.95rem;font-weight:bold;color:#fff!important;letter-spacing:.06em;}',
      '.pf-inv-meta{font-size:.72rem;color:rgba(255,255,255,0.65)!important;letter-spacing:.04em;}',
      '.pf-inv-total-label{font-size:.78rem;font-weight:bold;color:#fff!important;letter-spacing:.04em;}',
      '.pf-inv-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',

      /* ── Validation badge ── */
      '.pf-valid-badge{font-size:.68rem;font-weight:bold;padding:4px 10px;border-radius:20px;letter-spacing:.06em;white-space:nowrap;}',
      '.pf-valid-ok{background:#2d6a2d!important;color:#fff!important;}',
      '.pf-valid-err{background:#8b2222!important;color:#fff!important;}',
      '.pf-valid-warn{background:#666!important;color:#fff!important;}',

      /* ── Table ── */
      '.pf-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}',
      '.pf-table{width:100%;border-collapse:collapse;font-family:\'MontserratLight\',sans-serif;}',
      '.pf-table th{background:#444;color:#fff!important;font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;padding:8px 12px;text-align:left;border-bottom:2px solid #333;}',
      '.pf-table td{font-size:.82rem;font-weight:600;padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#000!important;vertical-align:middle;}',
      '.pf-table tr:last-child td{border-bottom:none;}',
      '.pf-table tbody tr:hover td{background:#f9f9f9;}',
      '.pf-td-ref{font-weight:bold;color:#000!important;font-size:.85rem;letter-spacing:.04em;}',
      '.pf-td-name{color:#444!important;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pf-td-num{text-align:right;font-variant-numeric:tabular-nums;}',
      '.pf-td-price{text-align:right;font-weight:bold;font-variant-numeric:tabular-nums;}',
      '.pf-table tfoot td{background:#f5f5f5!important;font-weight:bold;font-size:.82rem;border-top:2px solid #ddd;color:#000!important;}',

      /* ── Spinner ── */
      '#pf-spinner{display:none;position:fixed;inset:0;z-index:999;background:rgba(255,255,255,0.85);align-items:center;justify-content:center;flex-direction:column;gap:14px;}',
      '#pf-spinner.on{display:flex;}',
      '.pf-spin-ring{width:36px;height:36px;border:3px solid #ddd;border-top-color:#333;border-radius:50%;animation:pf-spin 0.7s linear infinite;}',
      '.pf-spin-msg{font-size:.82rem;font-weight:bold;color:#555;letter-spacing:.04em;}',
      '@keyframes pf-spin{to{transform:rotate(360deg);}}',

      /* ── Barcode overlay ── */
      '#pf-barcode-overlay{display:none;position:fixed;inset:0;z-index:310;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);align-items:center;justify-content:center;}',
      '#pf-barcode-overlay.open{display:flex;}',
      '#pf-barcode-panel{background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:560px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);}',
      '#pf-barcode-header{background:#222;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#pf-barcode-title{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.08em;text-transform:uppercase;}',
      '#pf-barcode-close{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;}',
      '#pf-barcode-close:hover{background:rgba(255,255,255,0.15);}',
      '#pf-barcode-body{overflow-y:auto;padding:16px 18px;flex:1;}',
      '.pf-bc-row{display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f0f0f0;}',
      '.pf-bc-row:last-child{border-bottom:none;}',
      '.pf-bc-info{flex:1;min-width:0;}',
      '.pf-bc-ref{font-size:.78rem;font-weight:bold;color:#000!important;letter-spacing:.06em;}',
      '.pf-bc-name{font-size:.72rem;color:#888!important;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pf-bc-code{font-size:.88rem;font-weight:bold;color:#000!important;letter-spacing:.12em;font-variant-numeric:tabular-nums;white-space:nowrap;background:#f5f5f5;padding:4px 10px;border-radius:6px;border:1px solid #e0e0e0;}',

      /* ── Stock modal ── */
      '#pf-stock-overlay{display:none;position:fixed;inset:0;z-index:310;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);align-items:center;justify-content:center;}',
      '#pf-stock-overlay.open{display:flex;}',
      '#pf-stock-panel{background:#fff;border-radius:16px;width:calc(100% - 32px);max-width:600px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);}',
      '#pf-stock-header{background:#333;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#pf-stock-header-info{flex:1;}',
      '#pf-stock-title{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.08em;text-transform:uppercase;}',
      '#pf-stock-subtitle{font-size:.68rem;color:rgba(255,255,255,0.6)!important;margin-top:3px;letter-spacing:.04em;}',
      '#pf-stock-close{background:none;border:none;color:#fff!important;font-size:1.1rem;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background .15s;}',
      '#pf-stock-close:hover{background:rgba(255,255,255,0.15);}',
      '#pf-stock-copy-bar{background:#f5f5f5;padding:10px 18px;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '#pf-stock-copy-btn{font-size:.75rem;font-weight:bold;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:6px 14px;border-radius:8px;border:1.5px solid #333;background:#333!important;color:#fff!important;transition:background .15s;text-transform:lowercase;white-space:nowrap;}',
      '#pf-stock-copy-btn:hover{background:#111!important;}',
      '#pf-stock-copy-status{font-size:.72rem;font-weight:bold;color:#555;transition:color .2s;}',
      '#pf-stock-body{overflow-y:auto;padding:0;flex:1;}',
      '#pf-stock-textarea{width:100%;box-sizing:border-box;padding:16px 18px;font-size:.82rem;font-weight:600;font-family:\'MontserratLight\',sans-serif;border:none;outline:none;resize:none;color:#000!important;background:#fff;line-height:1.7;min-height:300px;}',

      /* ── Empty state ── */
      '.pf-empty{text-align:center;padding:60px 24px;color:#bbb;font-size:.88rem;font-weight:600;letter-spacing:.04em;}',

      /* ── Validation summary ── */
      '.pf-val-summary{margin:0 16px 12px;padding:10px 14px;border-radius:8px;font-size:.75rem;font-weight:bold;letter-spacing:.04em;}',
      '.pf-val-summary.ok{background:#e8f5e8;border:1px solid #b8d8b8;color:#2d5a2d!important;}',
      '.pf-val-summary.err{background:#fdf0f0;border:1px solid #e8c0c0;color:#7a1a1a!important;}',

      /* ── Responsive ── */
      '@media(max-width:480px){.pf-inv-header{flex-direction:column;align-items:flex-start;}.pf-table td,.pf-table th{padding:6px 8px;font-size:.75rem;}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════
     ESCAPE HTML
  ══════════════════════════════════════════════════════════════ */
  function pfEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function pfFmt(n) {
    return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pfRound2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /* ══════════════════════════════════════════════════════════════
     PDF PARSING
  ══════════════════════════════════════════════════════════════ */
  function pfSetWorker() {
    if (typeof pdfjsLib === 'undefined') return;
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PF_WORKER_URL;
    }
  }

  async function pfExtractAllText(file) {
    pfSetWorker();
    var buf  = await file.arrayBuffer();
    var pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
    var lines = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page    = await pdf.getPage(p);
      var content = await page.getTextContent();
      // Group items by approximate Y position into lines
      var items = content.items;
      // Sort by Y desc (PDF coords), then X asc
      var sorted = items.slice().sort(function(a, b) {
        var dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
        if (dy !== 0) return dy;
        return a.transform[4] - b.transform[4];
      });
      // Group into rows by Y (within 3px tolerance)
      var rows = [];
      var curY = null;
      var curRow = [];
      for (var i = 0; i < sorted.length; i++) {
        var item = sorted[i];
        var y    = Math.round(item.transform[5]);
        if (curY === null || Math.abs(y - curY) > 3) {
          if (curRow.length) rows.push(curRow);
          curRow = [item];
          curY   = y;
        } else {
          curRow.push(item);
        }
      }
      if (curRow.length) rows.push(curRow);
      // Convert each row to a text string
      for (var ri = 0; ri < rows.length; ri++) {
        var rowText = rows[ri].map(function(it){ return it.str; }).join(' ').trim();
        if (rowText) lines.push(rowText);
      }
    }
    return lines;
  }

  /* ── Extract numeric ref (digits before underscore) ── */
  function pfExtractRef(code) {
    // e.g. "218121_WT" → "218121"
    // e.g. "2037301GYU" → "2037301" (also handle refs like "2037301GYU" — all digits prefix)
    var m = code.match(/^(\d+)/);
    return m ? m[1] : null;
  }

  /* ── Is EAN-like: exactly 13 digits ── */
  function pfIsEAN(s) {
    return /^\d{13}$/.test(s.replace(/\s/g,''));
  }

  /* ── Is partial EAN (7-12 digits, could be first part of split EAN) ── */
  function pfIsPartialEAN(s) {
    var clean = s.replace(/\s/g,'');
    return /^\d{7,12}$/.test(clean);
  }

  /* ── Is the second fragment of a split EAN (2-6 digits) ── */
  function pfIsEANFragment(s) {
    var clean = s.replace(/\s/g,'');
    return /^\d{2,6}$/.test(clean);
  }

  /* ── Is an article code ── */
  function pfIsArticleCode(s) {
    // Matches patterns like: 218121_WT, 218121_WTM-L, 2037301GYU, 197334_BNU, etc.
    return /^\d{5,8}[_A-Z]/.test(s) || /^\d{7,8}[A-Z]{2,4}$/.test(s);
  }

  /* ── Is a box code ── */
  function pfIsBoxCode(s) {
    return /^[ESGO]\d{10,}/.test(s);
  }

  /* ── Is a numeric-only field (qty, price) ── */
  function pfIsNumeric(s) {
    return /^\d+([.,]\d+)?$/.test(s.trim());
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN PARSER
     Strategy: scan all lines sequentially, reconstruct EAN from
     2-line splits, collect article code + description + qty + price
  ══════════════════════════════════════════════════════════════ */
  function pfParseInvoice(lines, fileName) {
    var invoiceNo   = '';
    var invoiceDate = '';
    var totalQtd    = 0;
    var totalEur    = 0;
    var numCaixas   = 0;
    var items       = []; // raw items before deduplication

    /* ── Extract header info ── */
    for (var i = 0; i < Math.min(lines.length, 60); i++) {
      var l = lines[i];
      // Invoice number: FT 2124/0045985 or FT 2126/0056278
      var mft = l.match(/FT\s+(\d{4}\/\d{6,7})/);
      if (mft && !invoiceNo) invoiceNo = 'FT ' + mft[1];
      // Date: DD/MM/YYYY
      var mdate = l.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (mdate && !invoiceDate) invoiceDate = mdate[1];
    }

    /* ── Extract footer totals (scan from end) ── */
    for (var j = lines.length - 1; j >= 0; j--) {
      var fl = lines[j];
      // Total Qtd NNN
      var mqtd = fl.match(/Total\s+Qtd\s+(\d+)/i);
      if (mqtd && !totalQtd) totalQtd = parseInt(mqtd[1]);
      // TOTAL EUR NNN,NN
      var meur = fl.match(/TOTAL\s+EUR\s+([\d.,]+)/i);
      if (meur && !totalEur) {
        totalEur = parseFloat(meur[1].replace(/\./g,'').replace(',','.'));
      }
      // Nº total de caixas: N
      var mcx = fl.match(/N[oº°]\s*total\s+de\s+caixas[:\s]+(\d+)/i);
      if (mcx && !numCaixas) numCaixas = parseInt(mcx[1]);
      if (totalQtd && totalEur && numCaixas) break;
    }

    /* ── Parse article lines ── */
    // We'll do a state-machine approach over lines
    // State: collecting article fields
    var state = {
      code:       null,  // article code (may be split across lines)
      ean:        null,  // reconstructed EAN
      eanPart:    null,  // first part of split EAN
      desc:       null,  // description (Descrição)
      qty:        null,
      price:      null   // line total price
    };

    // Known description keywords to identify description lines
    var descWords = [
      'Vestido','Camisa','Saia','Calças','Sandálias','Sabrinas','Mala','Carteira',
      'Óculos','Cinto','Bolsinha','Porta','Top','T-shirt','Sweatshirt','Macacão',
      'Quimono','Saco','Malote','Mochila','Faixa','Chapéu','Capa','Casaco',
      'Cardigan','Poncho','Vestuário','Calções','Lenço','Bolsa','Carteira',
      'Carteiras','Prof','Colares','Pulseira','Bracelete'
    ];

    function looksLikeDesc(str) {
      for (var di = 0; di < descWords.length; di++) {
        if (str.indexOf(descWords[di]) !== -1) return true;
      }
      return false;
    }

    function flushItem() {
      if (state.code && state.desc && state.qty !== null && state.price !== null) {
        var ref = pfExtractRef(state.code);
        if (ref) {
          items.push({
            ref:   ref,
            code:  state.code,
            ean:   state.ean || '',
            desc:  state.desc,
            qty:   state.qty,
            price: state.price
          });
        }
      }
      state.code    = null;
      state.ean     = null;
      state.eanPart = null;
      state.desc    = null;
      state.qty     = null;
      state.price   = null;
    }

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line) continue;

      // Skip header/footer noise
      if (/^(Barata|BARATA|Contribuinte|Rua|www\.|INVOICE|Pág\.|Qtd (a transferir|transferida)|Valor (a transferir|transferido)|Total Qtd|TOTAL EUR|Subtotal|Desconto|Frete|Seguro|Total IVA|Nº total|Peso|Volume|Local de|Lugar de|Processado|ATCUD|Em caso|Data:|Hora:|Matr)/i.test(line)) continue;
      if (/^(Cliente|WAK|WAKZOME|Morada|PORTUGAL|Porto Santo|Rua Dr)/i.test(line)) continue;
      if (/^(FT\s+\d{4}\/|% IVA|Incidência|Valor IVA|23,00|Obs\.\:|O Gestor|Nuno)/i.test(line)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}/.test(line) && line.length < 15) continue;
      if (/^(Caixa|Código do|artigo|Código EAN|Código Pautal|Descrição|Composição|País de|Qtd p\/|% IVA|Cód\.|Preço Unit\.|% Desc|Preço$)/i.test(line)) continue;
      if (/^(Pronto Pag|Air|CIF|ORIGINAL|WAKZOME|Barata & Ramilo)/i.test(line)) continue;

      // ── Box code line (new box group — ignore, just marks boundary) ──
      if (pfIsBoxCode(line.split(' ')[0])) {
        // Don't flush here; box codes appear on same line as qty sometimes
        // Extract just the first token
        continue;
      }

      // ── Detect article code ──
      // Article codes can be split: "218121_WT" on one line, "M-L" on next
      var firstToken = line.split(/\s+/)[0];

      if (pfIsArticleCode(firstToken)) {
        flushItem();
        state.code = firstToken;
        // Check if rest of line has EAN (sometimes on same line)
        var restTokens = line.split(/\s+/).slice(1);
        // Look for EAN in rest
        for (var rt = 0; rt < restTokens.length; rt++) {
          var tok = restTokens[rt].replace(/\s/g,'');
          if (pfIsEAN(tok)) { state.ean = tok; break; }
          if (pfIsPartialEAN(tok)) { state.eanPart = tok; }
        }
        continue;
      }

      // ── Size suffix for split article code (M-L, S-S, XS-S, etc.) ──
      if (state.code && !state.desc && /^(XS-?S|S-?S|M-?L|XL|XXS|L|XL|XS|S|M)$/.test(firstToken.trim())) {
        state.code = state.code + ' ' + firstToken.trim();
        continue;
      }

      // ── EAN line: exactly 13 digits or partial EAN ──
      var cleanLine = line.replace(/\s/g,'');
      if (pfIsEAN(cleanLine) && state.code) {
        state.ean     = cleanLine;
        state.eanPart = null;
        continue;
      }
      if (pfIsPartialEAN(cleanLine) && state.code && !state.ean) {
        state.eanPart = cleanLine;
        continue;
      }
      if (pfIsEANFragment(cleanLine) && state.code && state.eanPart && !state.ean) {
        var candidate = state.eanPart + cleanLine;
        if (pfIsEAN(candidate)) {
          state.ean     = candidate;
          state.eanPart = null;
        }
        continue;
      }

      // ── Description line ──
      if (looksLikeDesc(line) && state.code) {
        // Extract description: first meaningful word(s) before composition info
        // Remove composition details (after "Corpo:", "Forro:", etc.)
        var descClean = line.replace(/\s*(Corpo:|Forro:|superior:|exterior:|insole:|sola:|Hastes:|armação:|lentes:|Geral:|Ext comp|Int comp).*/i, '').trim();
        descClean = descClean.replace(/^\d+\s+\d+\s+/, '').trim(); // remove leading qty/pautal
        if (descClean) state.desc = descClean;
        // Try to extract qty and price from same line (sometimes they're here)
        // Pattern: ... CN/MM/TR/IN/VN/BD N 23 N,NN 0,00 N,NN
        var mQtyPrice = line.match(/(?:CN|MM|TR|IN|VN|BD|MA)\s+(\d+)\s+23\s+[\d,.]+\s+0,00\s+([\d.,]+)\s*$/);
        if (mQtyPrice) {
          state.qty   = parseInt(mQtyPrice[1]);
          state.price = parseFloat(mQtyPrice[2].replace(/\./g,'').replace(',','.'));
        }
        continue;
      }

      // ── Qty + Price line ──
      // Pattern: CN 2 23 13,650 0,00 27,30 (with country code, qty, iva, unit, disc, total)
      var mLine = line.match(/^(?:CN|MM|TR|IN|VN|BD|MA|CA)\s+(\d+)\s+23\s+([\d.,]+)\s+0,00\s+([\d.,]+)$/);
      if (mLine && state.code && state.desc) {
        state.qty   = parseInt(mLine[1]);
        state.price = parseFloat(mLine[3].replace(/\./g,'').replace(',','.'));
        // Immediately flush since we have all fields
        flushItem();
        continue;
      }

      // ── Alternative: standalone qty+price (when description was on prior line) ──
      // Sometimes line is just: 2 23 13,650 0,00 27,30
      var mAlt = line.match(/^(\d+)\s+23\s+([\d.,]+)\s+0,00\s+([\d.,]+)$/);
      if (mAlt && state.code && state.desc && state.qty === null) {
        state.qty   = parseInt(mAlt[1]);
        state.price = parseFloat(mAlt[3].replace(/\./g,'').replace(',','.'));
        flushItem();
        continue;
      }
    }
    // Final flush
    flushItem();

    /* ── SECOND PASS: reconstruct EAN from adjacent lines more aggressively ── */
    // Re-scan lines to pair partial EANs
    var eanMap = {};
    var prevPartial = null;
    var prevCode    = null;
    for (var si = 0; si < lines.length; si++) {
      var sl    = lines[si].trim().replace(/\s/g,'');
      var slRaw = lines[si].trim();
      if (pfIsArticleCode(slRaw.split(/\s+/)[0])) {
        prevCode    = slRaw.split(/\s+/)[0];
        prevPartial = null;
        continue;
      }
      if (pfIsEAN(sl) && prevCode) {
        eanMap[prevCode] = sl;
        prevPartial = null;
        continue;
      }
      if (pfIsPartialEAN(sl) && prevCode && !eanMap[prevCode]) {
        prevPartial = sl;
        continue;
      }
      if (pfIsEANFragment(sl) && prevPartial && prevCode) {
        var cand = prevPartial + sl;
        if (pfIsEAN(cand)) {
          eanMap[prevCode] = cand;
          prevPartial      = null;
        }
        continue;
      }
    }
    // Apply ean map to items missing EAN
    items.forEach(function(item) {
      if (!item.ean && eanMap[item.code]) {
        item.ean = eanMap[item.code];
      }
    });

    /* ── DEDUPLICATION: sum qty, average price ── */
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
          count:      0,
          prices:     [],
          qtys:       []
        };
      }
      var r = refMap[key];
      r.totalQty   += item.qty;
      r.totalPrice += item.price;
      r.count      += 1;
      r.prices.push(item.price);
      r.qtys.push(item.qty);
      // Prefer a non-empty EAN
      if (!r.ean && item.ean) r.ean = item.ean;
      // Prefer more specific description
      if (item.desc.length > r.desc.length) r.desc = item.desc;
    });

    var grouped = Object.values(refMap).map(function(r) {
      // If all prices divide cleanly by qty, use that for unit; else average line totals / total qty
      var unitPrice = r.totalQty > 0 ? pfRound2(r.totalPrice / r.totalQty) : 0;
      return {
        ref:       r.ref,
        desc:      r.desc,
        ean:       r.ean,
        qty:       r.totalQty,
        price:     pfRound2(r.totalPrice),
        unitPrice: unitPrice
      };
    });

    /* ── Cross-validation ── */
    var parsedQty   = grouped.reduce(function(s,g){ return s + g.qty; }, 0);
    var parsedPrice = pfRound2(grouped.reduce(function(s,g){ return s + g.price; }, 0));

    var qtyOk   = totalQtd > 0 ? (parsedQty === totalQtd) : null;
    var priceOk = totalEur > 0 ? (Math.abs(parsedPrice - totalEur) < 0.10) : null;
    var valid   = (qtyOk !== false) && (priceOk !== false);

    return {
      fileName:    fileName,
      invoiceNo:   invoiceNo || fileName.replace('.pdf',''),
      invoiceDate: invoiceDate,
      numCaixas:   numCaixas,
      totalQtd:    totalQtd,
      totalEur:    totalEur,
      parsedQty:   parsedQty,
      parsedPrice: parsedPrice,
      qtyOk:       qtyOk,
      priceOk:     priceOk,
      valid:        valid,
      items:       grouped
    };
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  function pfRender() {
    var content = document.getElementById('pf-content');
    if (!content) return;

    // Status bar
    var statusBar = document.getElementById('pf-status-bar');
    var statusMsg = document.getElementById('pf-status-msg');
    var actionBtns = document.getElementById('pf-action-btns');

    if (pfState.invoices.length === 0) {
      statusMsg.textContent = 'nenhuma fatura carregada';
      actionBtns.innerHTML  = '';
    } else {
      var totalInv   = pfState.invoices.length;
      var totalRefs  = pfState.invoices.reduce(function(s,inv){ return s + inv.items.length; }, 0);
      var totalPcs   = pfState.invoices.reduce(function(s,inv){ return s + inv.parsedQty; }, 0);
      statusMsg.textContent = totalInv + ' fatura(s) · ' + totalRefs + ' referências · ' + totalPcs + ' peças';
    }

    // Remove old invoice blocks
    var oldBlocks = content.querySelectorAll('.pf-inv-block');
    oldBlocks.forEach(function(b){ b.parentNode.removeChild(b); });

    // Show empty state or invoice blocks
    var emptyEl = content.querySelector('.pf-empty');
    if (emptyEl) emptyEl.parentNode.removeChild(emptyEl);

    if (pfState.invoices.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'pf-empty';
      empty.textContent = 'carregue uma fatura Parfois (PDF) para começar';
      content.appendChild(empty);
      return;
    }

    pfState.invoices.forEach(function(inv, idx) {
      var block = document.createElement('div');
      block.className = 'pf-inv-block';

      /* ── Header ── */
      var validBadge = '';
      if (inv.qtyOk === true && inv.priceOk === true) {
        validBadge = '<span class="pf-valid-badge pf-valid-ok">✓ validado</span>';
      } else if (inv.qtyOk === false || inv.priceOk === false) {
        validBadge = '<span class="pf-valid-badge pf-valid-err">⚠ divergência</span>';
      } else {
        validBadge = '<span class="pf-valid-badge pf-valid-warn">– sem totais</span>';
      }

      block.innerHTML =
        '<div class="pf-inv-header">' +
          '<div>' +
            '<div class="pf-inv-number">' + pfEsc(inv.invoiceNo) + '</div>' +
            '<div class="pf-inv-meta">' + pfEsc(inv.invoiceDate) +
              (inv.numCaixas ? ' · ' + inv.numCaixas + ' cx.' : '') +
              ' · ' + inv.parsedQty + ' pcs' +
            '</div>' +
          '</div>' +
          validBadge +
          '<div class="pf-inv-total-label">' + pfFmt(inv.parsedPrice) + ' €</div>' +
          '<div class="pf-inv-actions">' +
            '<button class="pf-btn pf-btn-mid" data-pf-bc="' + idx + '">códigos de barras</button>' +
            '<button class="pf-btn pf-btn-dark" data-pf-stock="' + idx + '">ingresso de stock</button>' +
          '</div>' +
        '</div>';

      /* ── Validation summary ── */
      if (inv.qtyOk === false || inv.priceOk === false) {
        var valDiv = document.createElement('div');
        valDiv.className = 'pf-val-summary err';
        var msgs = [];
        if (inv.qtyOk === false) msgs.push('qtd. lida: ' + inv.parsedQty + ' | fatura: ' + inv.totalQtd);
        if (inv.priceOk === false) msgs.push('valor lido: ' + pfFmt(inv.parsedPrice) + ' € | fatura: ' + pfFmt(inv.totalEur) + ' €');
        valDiv.textContent = msgs.join('  ·  ');
        block.appendChild(valDiv);
      } else if (inv.qtyOk === true && inv.priceOk === true) {
        var valOkDiv = document.createElement('div');
        valOkDiv.className = 'pf-val-summary ok';
        valOkDiv.textContent = 'totais confirmados · ' + inv.totalQtd + ' pcs · ' + pfFmt(inv.totalEur) + ' €';
        block.appendChild(valOkDiv);
      }

      /* ── Table ── */
      var tableWrap = document.createElement('div');
      tableWrap.className = 'pf-table-wrap';
      var rows = inv.items.map(function(item) {
        return '<tr>' +
          '<td class="pf-td pf-td-ref">' + pfEsc(item.ref) + '</td>' +
          '<td class="pf-td pf-td-name">' + pfEsc(item.desc) + '</td>' +
          '<td class="pf-td pf-td-num">' + item.qty + '</td>' +
          '<td class="pf-td pf-td-price">' + pfFmt(item.price) + ' €</td>' +
        '</tr>';
      }).join('');
      var totalRow =
        '<tr>' +
          '<td colspan="2" style="font-weight:bold;color:#000!important;">TOTAL</td>' +
          '<td class="pf-td-num" style="font-weight:bold;color:#000!important;">' + inv.parsedQty + '</td>' +
          '<td class="pf-td-price" style="font-weight:bold;color:#000!important;">' + pfFmt(inv.parsedPrice) + ' €</td>' +
        '</tr>';
      tableWrap.innerHTML =
        '<table class="pf-table">' +
          '<thead><tr>' +
            '<th>Referência</th><th>Nome</th><th style="text-align:right">Pcs</th><th style="text-align:right">Preço</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot>' + totalRow + '</tfoot>' +
        '</table>';
      block.appendChild(tableWrap);

      content.appendChild(block);
    });

    /* ── Button listeners ── */
    content.querySelectorAll('[data-pf-bc]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        pfOpenBarcodesOverlay(parseInt(btn.getAttribute('data-pf-bc')));
      });
    });
    content.querySelectorAll('[data-pf-stock]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        pfOpenStockModal(parseInt(btn.getAttribute('data-pf-stock')));
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     BARCODE OVERLAY
  ══════════════════════════════════════════════════════════════ */
  function pfOpenBarcodesOverlay(invIdx) {
    var inv = pfState.invoices[invIdx];
    if (!inv) return;
    var overlay = document.getElementById('pf-barcode-overlay');
    var body    = document.getElementById('pf-barcode-body');
    var title   = document.getElementById('pf-barcode-title');
    if (!overlay || !body) return;

    title.textContent = inv.invoiceNo + ' · códigos de barras';

    var html = inv.items.filter(function(it){ return it.ean; }).map(function(item) {
      return '<div class="pf-bc-row">' +
        '<div class="pf-bc-info">' +
          '<div class="pf-bc-ref">' + pfEsc(item.ref) + '</div>' +
          '<div class="pf-bc-name">' + pfEsc(item.desc) + '</div>' +
        '</div>' +
        '<div class="pf-bc-code">' + pfEsc(item.ean) + '</div>' +
      '</div>';
    }).join('');

    if (!html) {
      html = '<div style="text-align:center;padding:40px;color:#aaa;font-size:.82rem;font-weight:600;">nenhum código de barras encontrado nesta fatura</div>';
    }
    body.innerHTML = html;
    overlay.classList.add('open');
  }

  function pfCloseBarcodesOverlay() {
    var overlay = document.getElementById('pf-barcode-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════════════════
     STOCK MODAL
  ══════════════════════════════════════════════════════════════ */
  function pfOpenStockModal(invIdx) {
    var inv = pfState.invoices[invIdx];
    if (!inv) return;
    var overlay  = document.getElementById('pf-stock-overlay');
    var subtitle = document.getElementById('pf-stock-subtitle');
    var textarea = document.getElementById('pf-stock-textarea');
    if (!overlay || !textarea) return;

    subtitle.textContent = inv.invoiceNo + ' · ' + inv.invoiceDate + ' · Armazém A5';

    // Build stock entry text — tab-separated for easy pasting
    var lines = [
      'INGRESSO DE STOCK · ' + inv.invoiceNo + ' · ' + inv.invoiceDate,
      'Armazém: A5',
      '',
      'Referência\tNome\tQtd\tPreço Unit.\tTotal',
      '─────────────────────────────────────────────────────'
    ];
    inv.items.forEach(function(item) {
      lines.push(
        item.ref + '\t' +
        item.desc + '\t' +
        item.qty + '\t' +
        pfFmt(item.unitPrice) + ' €\t' +
        pfFmt(item.price) + ' €'
      );
    });
    lines.push('─────────────────────────────────────────────────────');
    lines.push('TOTAL\t\t' + inv.parsedQty + '\t\t' + pfFmt(inv.parsedPrice) + ' €');

    textarea.value = lines.join('\n');
    overlay.classList.add('open');
  }

  function pfCloseStockModal() {
    var overlay = document.getElementById('pf-stock-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════════════════
     SPINNER
  ══════════════════════════════════════════════════════════════ */
  function pfSpinner(msg) {
    var sp = document.getElementById('pf-spinner');
    if (!sp) return;
    if (msg) {
      sp.querySelector('.pf-spin-msg').textContent = msg;
      sp.classList.add('on');
    } else {
      sp.classList.remove('on');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     HANDLE FILES
  ══════════════════════════════════════════════════════════════ */
  async function pfHandleFiles(files) {
    var pdfFiles = Array.from(files).filter(function(f){ return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'); });
    if (!pdfFiles.length) return;

    pfSpinner('a ler PDF…');
    var statusMsg = document.getElementById('pf-status-msg');
    if (statusMsg) statusMsg.textContent = 'a processar…';

    try {
      for (var fi = 0; fi < pdfFiles.length; fi++) {
        var file = pdfFiles[fi];
        pfSpinner('a processar ' + file.name + '…');

        // Check if already loaded (same filename + same size as proxy for same file)
        var alreadyIdx = pfState.invoices.findIndex(function(inv){ return inv.fileName === file.name; });

        var lines  = await pfExtractAllText(file);
        var parsed = pfParseInvoice(lines, file.name);

        if (alreadyIdx >= 0) {
          // Replace existing
          pfState.invoices[alreadyIdx] = parsed;
        } else {
          pfState.invoices.push(parsed);
        }
      }

      // Init session name if new
      if (!pfState.sessionName) {
        pfState.sessionName = pfWeekName();
        pfState.createdAt   = Date.now();
      }

      pfSaveSession();
      pfRender();
      pfUpdateSessionLabel();

    } catch(err) {
      console.error('Parfois parse error:', err);
      if (statusMsg) statusMsg.textContent = 'erro: ' + err.message;
    } finally {
      pfSpinner(null);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SESSION LABEL
  ══════════════════════════════════════════════════════════════ */
  function pfUpdateSessionLabel() {
    var lbl = document.getElementById('pf-session-label');
    if (lbl && pfState.sessionName) lbl.textContent = pfState.sessionName;
  }

  /* ══════════════════════════════════════════════════════════════
     BUILD DOM
  ══════════════════════════════════════════════════════════════ */
  function pfBuildDOM() {
    /* ── 1. Card in #faturas-sub-grid ── */
    var grid = document.getElementById('faturas-sub-grid');
    if (grid && !document.getElementById('pf-card')) {
      var card = document.createElement('div');
      card.id        = 'pf-card';
      card.className = 'adm-mod-card';
      card.setAttribute('data-faturas-module', 'parfois');
      card.style.animationDelay = '0.15s';
      card.innerHTML =
        '<span class="adm-mod-icon">' +
          '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="3" y="4" width="18" height="16" rx="2" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>' +
            '<path d="M7 9h10M7 12h7M7 15h5" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" stroke-linecap="round"/>' +
            '<path d="M16 14l1.5 1.5L20 13" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</span>' +
        '<div>' +
          '<div class="adm-mod-name">PARFOIS</div>' +
          '<div class="adm-mod-desc">faturas Parfois · EAN + stock</div>' +
        '</div>' +
        '<div class="adm-mod-arrow">→</div>';
      card.addEventListener('click', pfOpenOverlay);
      grid.appendChild(card);
    }

    /* ── 2. Main overlay ── */
    if (!document.getElementById('pf-overlay')) {
      var overlay = document.createElement('div');
      overlay.id  = 'pf-overlay';
      overlay.innerHTML =
        '<div id="pf-bar">' +
          '<button id="pf-back">' +
            '<svg width="13" height="13" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M8 2L4 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
            ' faturas' +
          '</button>' +
          '<span id="pf-title">parfois</span>' +
          '<span id="pf-session-label"></span>' +
          '<button id="pf-clear-btn">limpar sessão</button>' +
        '</div>' +
        '<div id="pf-content">' +
          '<div id="pf-upload-zone">' +
            '<label id="pf-drop-area" for="pf-file-input">' +
              '<div id="pf-drop-label">arrastar PDF aqui ou clicar para seleccionar</div>' +
              '<div id="pf-drop-sub">faturas Parfois · um ou vários PDFs</div>' +
              '<input type="file" id="pf-file-input" accept="application/pdf" multiple>' +
            '</label>' +
          '</div>' +
          '<div id="pf-status-bar">' +
            '<span id="pf-status-msg">nenhuma fatura carregada</span>' +
            '<div id="pf-action-btns"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      // Back button
      document.getElementById('pf-back').addEventListener('click', pfCloseOverlay);

      // Clear session
      document.getElementById('pf-clear-btn').addEventListener('click', function() {
        if (pfState.invoices.length === 0) return;
        if (confirm('Limpar sessão Parfois desta semana?')) {
          pfClearSession();
          pfRender();
          pfUpdateSessionLabel();
        }
      });

      // File input
      document.getElementById('pf-file-input').addEventListener('change', function(e) {
        if (e.target.files.length) pfHandleFiles(e.target.files);
        e.target.value = '';
      });

      // Drag & drop
      var dropArea = document.getElementById('pf-drop-area');
      dropArea.addEventListener('dragover', function(e){ e.preventDefault(); dropArea.classList.add('drag-over'); });
      dropArea.addEventListener('dragleave', function(){ dropArea.classList.remove('drag-over'); });
      dropArea.addEventListener('drop', function(e){
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        var files = Array.from(e.dataTransfer.files).filter(function(f){ return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'); });
        if (files.length) pfHandleFiles(files);
      });
    }

    /* ── 3. Barcode overlay ── */
    if (!document.getElementById('pf-barcode-overlay')) {
      var bcOverlay = document.createElement('div');
      bcOverlay.id  = 'pf-barcode-overlay';
      bcOverlay.innerHTML =
        '<div id="pf-barcode-panel">' +
          '<div id="pf-barcode-header">' +
            '<span id="pf-barcode-title">códigos de barras</span>' +
            '<button id="pf-barcode-close">✕</button>' +
          '</div>' +
          '<div id="pf-barcode-body"></div>' +
        '</div>';
      document.body.appendChild(bcOverlay);
      document.getElementById('pf-barcode-close').addEventListener('click', pfCloseBarcodesOverlay);
      bcOverlay.addEventListener('click', function(e){ if (e.target === bcOverlay) pfCloseBarcodesOverlay(); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape') pfCloseBarcodesOverlay(); });
    }

    /* ── 4. Stock modal ── */
    if (!document.getElementById('pf-stock-overlay')) {
      var stOverlay = document.createElement('div');
      stOverlay.id  = 'pf-stock-overlay';
      stOverlay.innerHTML =
        '<div id="pf-stock-panel">' +
          '<div id="pf-stock-header">' +
            '<div id="pf-stock-header-info">' +
              '<div id="pf-stock-title">ingresso de stock · A5</div>' +
              '<div id="pf-stock-subtitle"></div>' +
            '</div>' +
            '<button id="pf-stock-close">✕</button>' +
          '</div>' +
          '<div id="pf-stock-copy-bar">' +
            '<button id="pf-stock-copy-btn">copiar tudo</button>' +
            '<span id="pf-stock-copy-status"></span>' +
          '</div>' +
          '<div id="pf-stock-body">' +
            '<textarea id="pf-stock-textarea" readonly></textarea>' +
          '</div>' +
        '</div>';
      document.body.appendChild(stOverlay);
      document.getElementById('pf-stock-close').addEventListener('click', pfCloseStockModal);
      stOverlay.addEventListener('click', function(e){ if (e.target === stOverlay) pfCloseStockModal(); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape') pfCloseStockModal(); });

      // Copy button
      document.getElementById('pf-stock-copy-btn').addEventListener('click', function() {
        var ta     = document.getElementById('pf-stock-textarea');
        var status = document.getElementById('pf-stock-copy-status');
        if (!ta) return;
        ta.select();
        try {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(ta.value).then(function() {
              status.textContent = '✓ copiado!';
              setTimeout(function(){ status.textContent = ''; }, 2000);
            });
          } else {
            document.execCommand('copy');
            status.textContent = '✓ copiado!';
            setTimeout(function(){ status.textContent = ''; }, 2000);
          }
        } catch(e) {
          status.textContent = 'seleccione e copie manualmente';
        }
      });
    }

    /* ── 5. Spinner ── */
    if (!document.getElementById('pf-spinner')) {
      var sp = document.createElement('div');
      sp.id  = 'pf-spinner';
      sp.innerHTML =
        '<div class="pf-spin-ring"></div>' +
        '<div class="pf-spin-msg">a processar…</div>';
      document.body.appendChild(sp);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     OPEN / CLOSE OVERLAY
  ══════════════════════════════════════════════════════════════ */
  function pfOpenOverlay() {
    var overlay = document.getElementById('pf-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    requestAnimationFrame(function(){ overlay.classList.add('visible'); });
  }

  function pfCloseOverlay() {
    var overlay = document.getElementById('pf-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(function(){ overlay.classList.remove('open'); }, 450);
  }

  /* ══════════════════════════════════════════════════════════════
     HOOK INTO FATURAS MODULE CARD CLICK
  ══════════════════════════════════════════════════════════════ */
  function pfHookFaturasCard() {
    // The faturas-sub-grid listens for clicks on adm-mod-card
    // We need to intercept when data-faturas-module="parfois" is clicked
    var grid = document.getElementById('faturas-sub-grid');
    if (!grid) return;

    // Remove any previous listener to avoid doubles
    if (grid._pfListener) grid.removeEventListener('click', grid._pfListener);
    grid._pfListener = function(e) {
      var card = e.target.closest('[data-faturas-module="parfois"]');
      if (card) {
        e.stopPropagation();
        pfOpenOverlay();
      }
    };
    grid.addEventListener('click', grid._pfListener);
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function pfInit() {
    pfEnsureStyles();
    pfBuildDOM();
    pfHookFaturasCard();

    // Load persisted session
    if (pfLoadSession()) {
      pfRender();
      pfUpdateSessionLabel();
    } else {
      pfState.sessionName = pfWeekName();
      pfState.createdAt   = Date.now();
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pfInit);
  } else {
    pfInit();
  }

  // Also reinit if #faturas-sub-grid appears later (lazy loaded)
  var pfObserver = new MutationObserver(function() {
    var grid = document.getElementById('faturas-sub-grid');
    if (grid && !document.getElementById('pf-card')) {
      pfBuildDOM();
      pfHookFaturasCard();
    }
  });
  pfObserver.observe(document.body, { childList: true, subtree: true });

})();
