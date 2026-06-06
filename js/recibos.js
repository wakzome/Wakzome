// ══════════════════════════════════════════════════════════════
//  ADMIN: RECIBOS
// ══════════════════════════════════════════════════════════════

/**
 * Determina automaticamente o mês a processar com base na data atual.
 *
 * Regras:
 *  - Dia 10–20 de dezembro          → "natal-YYYY"  (subsidio de natal)
 *  - Dia 25 do mês anterior até dia 4 do mês atual → mês atual "MM-YYYY"
 *  - Resto do ano                   → mês atual "MM-YYYY" (default seguro)
 *
 * Retorna string no formato "MM-YYYY" ou "natal-YYYY"
 */
function rDetectMes() {
  const now   = new Date();
  const day   = now.getDate();
  const month = now.getMonth() + 1; // 1–12
  const year  = now.getFullYear();

  // Subsidio de natal: 10–20 de dezembro (tem prioridade)
  if (month === 12 && day >= 10 && day <= 20) {
    return `natal-${year}`;
  }

  // Dia 1–9: ainda a processar recibos do mês ANTERIOR
  // Ex: 4 maio → abril, 9 janeiro → dezembro do ano anterior
  if (day <= 9) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    return `${String(prevMonth).padStart(2,'0')}-${prevYear}`;
  }

  // Dia 10–31: processa o mês ATUAL
  // Ex: 25 abril → abril, 30 abril → abril, 10 maio → maio
  return `${String(month).padStart(2,'0')}-${year}`;
}

function rLoadConfig() {
  const mes = rDetectMes();
  localStorage.setItem('gh_mes', mes);
  rShowMesBadge(mes);
  rInitAdmin();
}

function rShowMesBadge(mes) {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  let label;
  if (mes.startsWith('natal-')) {
    label = `🎄 Subsídio de Natal ${mes.split('-')[1]}`;
  } else {
    const [mm, yyyy] = mes.split('-');
    const nomeMes = MESES[parseInt(mm, 10) - 1] || mes;
    label = `${nomeMes} ${yyyy}`;
  }
  // Injeta badge no DOM se existir o contentor, senão cria um
  let badge = document.getElementById('r-mes-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'r-mes-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:8px 18px;background:#f4f4f4;border:1px solid #e0e0e0;border-radius:10px;font-size:.93rem;font-weight:600;color:#333;';
    // Insere antes dos uploads
    const anchor = document.getElementById('r-upload-outer') || document.getElementById('r-status-msg');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor);
    else document.body.prepend(badge);
  }
  badge.innerHTML = `<span style="color:#888;font-weight:400;font-size:.82rem;">a processar</span><strong style="font-size:1.05em;">${label}</strong>`;
}

/* ══════════════════════════════════════════════════════════════
   RECIBOS — auto-inject: estilos + DOM
   Cualquier cambio visual o estructural va aquí, nunca en index.html
   ══════════════════════════════════════════════════════════════ */

function rInjectStyles() {
  if (document.getElementById('r-styles')) return;
  var s = document.createElement('style');
  s.id = 'r-styles';
  s.textContent = [
    /* ── Upload area ── */
    '#r-upload-outer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;width:100%;max-width:700px;margin-bottom:14px;}',
    '#r-hint-pdf{grid-column:1;display:flex;justify-content:flex-end;}',
    '#r-upload-grid{grid-column:2;display:grid;grid-template-columns:220px;gap:14px;}',
    '#r-hint-csv{grid-column:3;display:flex;justify-content:flex-start;}',
    '@media(max-width:700px){#r-upload-outer{grid-template-columns:1fr;}#r-hint-pdf,#r-hint-csv{display:none;}#r-upload-grid{grid-column:1;grid-template-columns:1fr;}}',
    '@media(max-width:400px){#r-upload-grid{grid-template-columns:1fr;}.upload-box{min-height:90px;}}',
    /* ── Upload box ── */
    '.upload-box{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:110px;border:2px dashed #ccc;border-radius:16px;cursor:pointer;padding:14px;text-align:center;color:#000;font-size:.88rem;font-weight:600;transition:border-color .2s,background .2s;position:relative;}',
    '.upload-box:hover,.upload-box.drag-over{border-color:#555;background:#f9f9f9;color:#000;}',
    '.upload-box .upload-icon{font-size:1.7rem;margin-bottom:6px;}',
    '.upload-box input[type="file"]{display:none;}',
    '.upload-box .file-loaded{position:absolute;bottom:6px;left:0;right:0;font-size:.72rem;color:#000;text-align:center;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    /* ── Hints ── */
    '.r-inline-hint{display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.78) translateY(10px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1);pointer-events:none;}',
    '.r-inline-hint.show{opacity:1;transform:scale(1) translateY(0);}',
    '#r-hint-pdf{justify-content:flex-end;}',
    '#r-hint-pdf .hint-shape{position:relative;width:160px;height:160px;display:flex;align-items:center;justify-content:center;}',
    '#r-hint-pdf .hint-shape svg.shape-bg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}',
    '#r-hint-csv{justify-content:flex-start;}',
    '#r-hint-csv .hint-shape{position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center;}',
    '#r-hint-csv .hint-shape svg.shape-bg{position:absolute;inset:0;width:100%;height:100%;}',
    '.hint-svg-text{font-family:"MontserratLight",sans-serif;font-weight:bold;font-size:11px;text-anchor:middle;dominant-baseline:middle;}',
    /* ── Process button ── */
    '#r-process-btn{padding:9px 36px;font-size:.95rem;font-weight:600;cursor:pointer;border:1px solid #555;border-radius:12px;background:#fff;transition:background .2s,color .2s,transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s cubic-bezier(.22,1,.36,1)!important;margin-bottom:12px;display:none;will-change:transform;}',
    '#r-process-btn.show{display:inline-block;}',
    '#r-process-btn:hover{background:#555;color:#fff;transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.07);}',
    '#r-process-btn:disabled{opacity:.4;cursor:not-allowed;}',
    '#r-process-btn:active{transform:translateY(1px) scale(.97)!important;box-shadow:none!important;}',
    '@media(max-width:768px){#r-process-btn{width:100%;max-width:100%;box-sizing:border-box;}}',
    /* ── Status ── */
    '#r-status-area{width:100%;max-width:700px;margin-bottom:8px;}',
    '#r-status-msg{font-size:.9rem;font-weight:600;color:#000;text-align:center;min-height:18px;margin-bottom:6px;}',
    '#r-warnings-box{display:none;background:#fff8f0;border:1px solid #f0c080;border-radius:12px;padding:12px 16px;}',
    '#r-warnings-box .warn-title{font-size:.83rem;font-weight:bold;color:#b05000;margin-bottom:6px;}',
    '#r-warnings-box ul{list-style:none;padding:0;}',
    '#r-warnings-box ul li{font-size:.83rem;font-weight:600;color:#b05000;padding:2px 0;}',
    '#r-warnings-box ul li::before{content:"⚠️ ";}',
    '@media(max-width:768px){#r-status-area{max-width:100%;}}',
    /* ── Progress ── */
    '#r-upload-progress{display:none;width:100%;max-width:700px;background:#f2f2f2;border-radius:10px;overflow:hidden;height:6px;margin-bottom:6px;}',
    '#r-upload-progress-bar{height:100%;background:#555;width:0%;transition:width .3s;}',
    '#r-progress-detail{font-size:.82rem;font-weight:bold;color:#000;text-align:center;min-height:18px;margin-bottom:6px;width:100%;max-width:700px;}',
    '@media(max-width:768px){#r-upload-progress,#r-progress-detail{max-width:100%;}}',
    /* ── Conferir ── */
    '#r-conferir-fixed{position:fixed;top:50%;right:20px;transform:translateY(-50%);display:none;flex-direction:column;align-items:flex-end;gap:8px;z-index:51;max-width:160px;text-align:right;}',
    '#r-conferir-fixed.show{display:flex;}',
    '#r-conferir-btn{padding:9px 18px;font-size:.88rem;font-weight:bold;font-family:"MontserratLight",sans-serif;text-transform:lowercase;cursor:pointer;border:1.5px solid #555;border-radius:12px;background:#fff;transition:background .2s,color .2s,transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s cubic-bezier(.22,1,.36,1)!important;pointer-events:auto;will-change:transform;}',
    '#r-conferir-btn:hover{background:#555;color:#fff;transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.07);}',
    '#r-conferir-btn:active{transform:translateY(1px) scale(.97)!important;box-shadow:none!important;}',
    '#r-conferir-note{font-size:.76rem;font-weight:bold;color:#e09000;margin:0;line-height:1.5;}',
    '@media(max-width:1024px){#r-conferir-fixed{display:none!important;}}',
    /* ── Recibos table ── */
    '#r-recibos-table{width:100%;border-collapse:separate;border-spacing:0;border-radius:15px;overflow:hidden;}',
    '#r-recibos-table th{background:#e0e0e0;padding:10px 14px;text-align:left;font-size:.85rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;border:1px solid #e6e6e6;}',
    '#r-recibos-table td{padding:9px 14px;border:1px solid #efefef;font-size:.88rem;font-weight:bold;vertical-align:middle;}',
    '#r-recibos-table tbody tr:hover td{background:#f5f5f5;}',
    '.r-status-ok{color:#2a8a2a;font-size:.8rem;}',
    '.r-status-err{color:#c03000;font-size:.8rem;}',
    /* ── Modal ── */
    '#r-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;justify-content:center;align-items:center;}',
    '#r-modal-overlay.show{display:flex;}',
    '#r-modal-box{background:#fff;border-radius:18px;padding:28px 30px;max-width:420px;width:90%;font-family:"MontserratLight",sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.12);}',
    '#r-modal-box .modal-title{font-size:.8rem;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#000;margin-bottom:6px;}',
    '#r-modal-box .modal-name{font-size:1.05rem;font-weight:bold;color:#000;margin-bottom:18px;word-break:break-word;}',
    '#r-modal-box .modal-counter{font-size:.75rem;color:#000;font-weight:600;margin-bottom:16px;}',
    '#r-modal-pwd-row{display:none;flex-direction:column;gap:6px;margin-bottom:16px;}',
    '#r-modal-pwd-row label{font-size:.78rem;font-weight:bold;color:#000;text-transform:uppercase;}',
    '#r-modal-pwd-input{padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:.9rem;outline:none;font-family:"MontserratLight",sans-serif;font-weight:600;transition:border-color .25s,box-shadow .25s!important;}',
    '#r-modal-pwd-input:focus{border-color:#555;box-shadow:0 2px 14px rgba(0,0,0,.06)!important;}',
    '.modal-btns{display:flex;flex-direction:column;gap:8px;}',
    '.modal-btn{padding:10px 16px;font-size:.88rem;font-weight:600;cursor:pointer;border-radius:10px;border:1px solid #ccc;background:#fff;text-align:left;transition:background .15s,transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s cubic-bezier(.22,1,.36,1)!important;font-family:"MontserratLight",sans-serif;will-change:transform;}',
    '.modal-btn:hover{background:#f5f5f5;transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.07);}',
    '.modal-btn:active{transform:translateY(1px) scale(.97)!important;box-shadow:none!important;}',
    '.modal-btn.primary{border-color:#555;}',
    '.modal-btn.primary:hover{background:#555;color:#fff;}',
    /* ── Mes badge ── */
    '#r-mes-badge{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:8px 18px;background:#f4f4f4;border:1px solid #e0e0e0;border-radius:10px;font-size:.93rem;font-weight:600;color:#333;}',
    /* ── Admin: gestão de colaboradoras ── */
    '#r-gestao-admin-btn{display:none;padding:6px 16px;font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid #e0e0e0;border-radius:20px;background:#fafafa;font-family:"MontserratLight",sans-serif;margin-bottom:14px;color:#555;transition:background .15s,color .15s,border-color .15s;}',
    '#r-gestao-admin-btn:hover{background:#111!important;color:#fff!important;border-color:#111!important;}',
    '#r-gestao-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;justify-content:center;align-items:center;}',
    '#r-gestao-overlay.show{display:flex;}',
    '#r-gestao-box{background:#fff;border-radius:18px;padding:28px;max-width:580px;width:93%;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;font-family:"MontserratLight",sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.15);}',
    '#r-gestao-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-shrink:0;}',
    '#r-gestao-title{font-size:.95rem;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#000;}',
    '#r-gestao-close{background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:#000;padding:4px 8px;border-radius:6px;line-height:1;}',
    '#r-gestao-close:hover{background:#f0f0f0;}',
    '#r-gestao-list{flex:1;overflow-y:auto;margin-bottom:16px;display:flex;flex-direction:column;gap:8px;}',
    '.r-gestao-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:10px 14px;border:1px solid #e0e0e0;border-radius:10px;background:#fafafa;}',
    '.r-gestao-nome{font-size:.82rem;font-weight:bold;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.r-gestao-senha-wrap{display:flex;align-items:center;gap:6px;margin-top:3px;}',
    '.r-gestao-senha{font-size:.85rem;font-family:"Courier New",monospace;color:#555;letter-spacing:.05em;}',
    '.r-gestao-toggle-pwd{background:transparent;border:none;font-size:.75rem;cursor:pointer;color:#aaa;padding:0 2px;line-height:1;}',
    '.r-gestao-toggle-pwd:hover{color:#000;}',
    '.r-gestao-actions{display:flex;gap:6px;flex-shrink:0;}',
    '.r-gestao-btn{padding:5px 10px;font-size:.73rem;font-weight:600;cursor:pointer;border:1px solid #ccc;border-radius:7px;background:#fff;font-family:"MontserratLight",sans-serif;transition:background .15s,border-color .15s;}',
    '.r-gestao-btn:hover{background:#f0f0f0;border-color:#999;}',
    '.r-gestao-btn.del:hover{background:#fff0f0;border-color:#e00;color:#c00;}',
    '#r-gestao-add-form{border-top:1px solid #e0e0e0;padding-top:16px;flex-shrink:0;}',
    '#r-gestao-add-title{font-size:.78rem;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#000;margin-bottom:10px;}',
    '#r-gestao-aviso{font-size:.74rem;color:#555;margin-bottom:12px;line-height:1.55;padding:8px 12px;background:#fffbe6;border:1px solid #f0d060;border-radius:8px;}',
    '.r-gestao-field{margin-bottom:10px;}',
    '.r-gestao-field label{display:block;font-size:.73rem;font-weight:bold;color:#000;text-transform:uppercase;margin-bottom:4px;letter-spacing:.04em;}',
    '.r-gestao-field input{width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:8px;font-size:.86rem;font-family:"MontserratLight",sans-serif;font-weight:600;outline:none;box-sizing:border-box;}',
    '.r-gestao-field input:focus{border-color:#555;}',
    '#r-gestao-pwd-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:10px;}',
    '#r-gestao-pwd-row .r-gestao-field{flex:1;margin-bottom:0;}',
    '#r-gestao-gen-btn{padding:8px 14px;font-size:.76rem;font-weight:600;cursor:pointer;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;font-family:"MontserratLight",sans-serif;white-space:nowrap;flex-shrink:0;transition:background .15s;}',
    '#r-gestao-gen-btn:hover{background:#e0e0e0;}',
    '#r-gestao-save-btn{width:100%;padding:10px;font-size:.88rem;font-weight:600;cursor:pointer;border:1.5px solid #555;border-radius:10px;background:#fff;font-family:"MontserratLight",sans-serif;transition:background .15s,color .15s;}',
    '#r-gestao-save-btn:hover{background:#555;color:#fff;}'
  ].join('');
  document.head.appendChild(s);
}

function rInjectDOM() {
  /* ── Tab content ── */
  var tab = document.getElementById('tab-recibos');
  if (tab && !document.getElementById('r-upload-outer')) {
    tab.innerHTML =
      '<button id="r-gestao-admin-btn">⚙ gerir colaboradoras</button>' +
      '<div id="r-upload-outer">' +
        '<div id="r-hint-pdf" class="r-inline-hint"></div>' +
        '<div id="r-upload-grid">' +
          '<label class="upload-box" id="r-label-pdf">' +
            '<span class="upload-icon">📄</span>' +
            'pdf de recibos<br>' +
            '<small style="font-size:.75rem;opacity:.6">clique ou arraste</small>' +
            '<input type="file" id="r-input-pdf" accept="application/pdf">' +
            '<span class="file-loaded" id="r-name-pdf"></span>' +
          '</label>' +
        '</div>' +
        '<div id="r-hint-csv" class="r-inline-hint r-inline-hint-right"></div>' +
      '</div>' +
      '<button id="r-process-btn">processar recibos</button>' +
      '<div id="r-status-area">' +
        '<div id="r-status-msg"></div>' +
        '<div id="r-warnings-box">' +
          '<div class="warn-title">senhas em falta — nenhum recibo foi gerado</div>' +
          '<ul id="r-warnings-list"></ul>' +
        '</div>' +
      '</div>' +
      '<div id="r-upload-progress"><div id="r-upload-progress-bar"></div></div>' +
      '<div id="r-progress-detail"></div>' +
      '<div id="r-conferir-fixed">' +
        '<button id="r-conferir-btn">🔍 conferir recibos</button>' +
        '<p id="r-conferir-note">⚠ pode demorar alguns minutos a atualizar.</p>' +
      '</div>';
  }
  /* ── Modal de gestão de colaboradoras ── */
  if (!document.getElementById('r-gestao-overlay')) {
    var gestao = document.createElement('div');
    gestao.id = 'r-gestao-overlay';
    gestao.innerHTML =
      '<div id="r-gestao-box">' +
        '<div id="r-gestao-header">' +
          '<span id="r-gestao-title">Gestão de Colaboradoras</span>' +
          '<button id="r-gestao-close">✕</button>' +
        '</div>' +
        '<div id="r-gestao-list"></div>' +
        '<div id="r-gestao-add-form">' +
          '<div id="r-gestao-add-title">Adicionar nova colaboradora</div>' +
          '<div id="r-gestao-aviso">⚠ O nome deve ser introduzido exactamente como figura no recibo de salário — com todos os apelidos e sem abreviaturas.</div>' +
          '<div class="r-gestao-field">' +
            '<label>Nome completo</label>' +
            '<input type="text" id="r-gestao-nome-input" placeholder="NOME COMPLETO DA COLABORADORA" autocomplete="off">' +
          '</div>' +
          '<div id="r-gestao-pwd-row">' +
            '<div class="r-gestao-field">' +
              '<label>Senha de acesso</label>' +
              '<input type="text" id="r-gestao-pwd-input" placeholder="senha" autocomplete="off">' +
            '</div>' +
            '<button id="r-gestao-gen-btn">🎲 gerar senha</button>' +
          '</div>' +
          '<button id="r-gestao-save-btn">Guardar colaboradora</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(gestao);
  }

  /* ── Modal de aviso de senha em falta ── */
  if (!document.getElementById('r-modal-overlay')) {
    var modal = document.createElement('div');
    modal.id = 'r-modal-overlay';
    modal.innerHTML =
      '<div id="r-modal-box">' +
        '<div class="modal-title">senha em falta</div>' +
        '<div class="modal-name" id="r-modal-name"></div>' +
        '<div class="modal-counter" id="r-modal-counter"></div>' +
        '<div id="r-modal-pwd-row">' +
          '<label>senha</label>' +
          '<input type="text" id="r-modal-pwd-input" placeholder="introduza a senha">' +
        '</div>' +
        '<div class="modal-btns">' +
          '<button class="modal-btn primary" id="r-modal-btn-pwd">🔑 introduzir senha agora</button>' +
          '<button class="modal-btn" id="r-modal-btn-no-pwd">📄 gerar recibo sem senha</button>' +
          '<button class="modal-btn" id="r-modal-btn-skip">⏭ não gerar recibo</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }
}

rInjectStyles();
rInjectDOM();

/* ══════════════════════════════════════════════════════════════ */

let rPdfFile = null;

async function rFetchSenhas() {
  const res = await fetch('/api/recibos-senhas', { credentials: 'same-origin' });
  if (!res.ok) {
    const err = await res.json().catch(function() { return {}; });
    throw new Error(err.error || 'Erro ao carregar senhas (' + res.status + ')');
  }
  const body = await res.json();
  return (body.senhas || []).map(function(row) {
    return { name: rNormalize(row.nome), pwd: row.senha || null };
  });
}

/* ══════════════════════════════════════════════════════════════
   GESTÃO DE COLABORADORAS — apenas para admin
   ══════════════════════════════════════════════════════════════ */

async function rGestaoApi(method, body) {
  const opts = { method, credentials: 'same-origin' };
  if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res  = await fetch('/api/recibos-gerir', opts);
  const data = await res.json().catch(function() { return {}; });
  if (res.status === 401 || res.status === 403) {
    throw new Error('A tua sessão expirou. Actualiza a página para continuar.');
  }
  if (!res.ok) throw new Error(data.error || 'Erro ' + res.status);
  return data;
}

function rGestaoGenPwd() {
  const upper = 'ABCDFGHJKLMNPQRSTVWXYZ';
  const lower = 'abcdfghjklmnpqrstvwxyz';
  const c1 = upper[Math.floor(Math.random() * upper.length)];
  const c2 = lower[Math.floor(Math.random() * lower.length)];
  const c3 = lower[Math.floor(Math.random() * lower.length)];
  const n  = String(Math.floor(Math.random() * 89) + 11);
  return c1 + c2 + c3 + '#' + n;
}

async function rGestaoOpen() {
  var overlay = document.getElementById('r-gestao-overlay');
  if (!overlay) return;
  overlay.classList.add('show');
  document.getElementById('r-gestao-nome-input').value = '';
  document.getElementById('r-gestao-pwd-input').value  = '';
  var list = document.getElementById('r-gestao-list');
  list.innerHTML = '<div style="text-align:center;padding:24px;color:#aaa;font-size:.85rem;">a carregar...</div>';
  try {
    var data = await rGestaoApi('GET');
    rGestaoRenderList(data.funcionarias || []);
  } catch(e) {
    list.innerHTML = '<div style="color:#c00;text-align:center;padding:24px;font-size:.85rem;">' + e.message + '</div>';
  }
}

function rGestaoRenderList(list) {
  var container = document.getElementById('r-gestao-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#aaa;font-size:.85rem;">Nenhuma colaboradora registada.</div>';
    return;
  }
  container.innerHTML = list.map(function(f) {
    var inativo = !f.ativo ? ' <span style="font-size:.68rem;color:#e00;font-weight:bold;">(inativa)</span>' : '';
    return '<div class="r-gestao-row" data-id="' + f.id + '">' +
      '<div>' +
        '<div class="r-gestao-nome">' + escHtml(f.nome) + inativo + '</div>' +
        '<div class="r-gestao-senha-wrap">' +
          '<span class="r-gestao-senha" data-pwd="' + escHtml(f.senha || '') + '" data-visible="0">••••••••</span>' +
          '<button class="r-gestao-toggle-pwd" title="mostrar/ocultar senha">👁</button>' +
        '</div>' +
      '</div>' +
      '<div class="r-gestao-actions">' +
        '<button class="r-gestao-btn del" data-id="' + f.id + '" title="Eliminar">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.r-gestao-toggle-pwd').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var senhaEl = btn.closest('.r-gestao-senha-wrap').querySelector('.r-gestao-senha');
      var visible = senhaEl.getAttribute('data-visible') === '1';
      senhaEl.textContent = visible ? '••••••••' : (senhaEl.getAttribute('data-pwd') || '—');
      senhaEl.setAttribute('data-visible', visible ? '0' : '1');
    });
  });

  container.querySelectorAll('.r-gestao-btn.del').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var id   = parseInt(btn.getAttribute('data-id'));
      var nome = btn.closest('.r-gestao-row').querySelector('.r-gestao-nome').textContent.trim();
      if (!confirm('Tem a certeza que pretende eliminar "' + nome + '"?\nEsta acção é irreversível.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        await rGestaoApi('POST', { action: 'delete', id: id });
        var data = await rGestaoApi('GET');
        rGestaoRenderList(data.funcionarias || []);
      } catch(e) {
        alert('Erro ao eliminar: ' + e.message);
        btn.disabled = false; btn.textContent = '🗑';
      }
    });
  });
}

async function rGestaoAddNew() {
  var nome   = (document.getElementById('r-gestao-nome-input').value || '').trim().toUpperCase();
  var senha  = (document.getElementById('r-gestao-pwd-input').value  || '').trim();
  if (!nome) { document.getElementById('r-gestao-nome-input').focus(); return; }
  var saveBtn = document.getElementById('r-gestao-save-btn');
  saveBtn.disabled = true; saveBtn.textContent = 'a guardar...';
  try {
    await rGestaoApi('POST', { action: 'add', nome: nome, senha: senha || null });
    document.getElementById('r-gestao-nome-input').value = '';
    document.getElementById('r-gestao-pwd-input').value  = '';
    var data = await rGestaoApi('GET');
    rGestaoRenderList(data.funcionarias || []);
  } catch(e) {
    alert('Erro ao adicionar colaboradora: ' + e.message);
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar colaboradora';
  }
}

function rInitAdmin() {
  var adminBtn = document.getElementById('r-gestao-admin-btn');
  var overlay  = document.getElementById('r-gestao-overlay');
  var closeBtn = document.getElementById('r-gestao-close');
  var genBtn   = document.getElementById('r-gestao-gen-btn');
  var saveBtn  = document.getElementById('r-gestao-save-btn');
  if (!adminBtn) return;

  /* rLoadConfig() só é chamado no branch admin — mostrar botão directamente */
  adminBtn.style.display = 'inline-block';

  adminBtn.addEventListener('click', rGestaoOpen);

  if (closeBtn) closeBtn.addEventListener('click', function() {
    overlay.classList.remove('show');
  });
  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.classList.remove('show');
  });
  if (genBtn) genBtn.addEventListener('click', function() {
    document.getElementById('r-gestao-pwd-input').value = rGestaoGenPwd();
  });
  if (saveBtn) saveBtn.addEventListener('click', rGestaoAddNew);
}

/* ══════════════════════════════════════════════════════════════ */

function rSetupUpload(labelId, inputId, nameId, type) {
  const label = document.getElementById(labelId);
  const input = document.getElementById(inputId);
  const nameEl = document.getElementById(nameId);
  input.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    rPdfFile = f;
    rShowGuide('right', '② clica em\nprocessar\nrecibos', '');
    nameEl.textContent = f.name; rCheckReady();
  });
  label.addEventListener('dragover',  e => { e.preventDefault(); label.classList.add('drag-over'); });
  label.addEventListener('dragleave', () => label.classList.remove('drag-over'));
  label.addEventListener('drop', e => {
    e.preventDefault(); label.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (!f) return;
    rPdfFile = f;
    rShowGuide('right', '② clica em\nprocessar\nrecibos', '');
    nameEl.textContent = f.name; rCheckReady();
  });
}
rSetupUpload('r-label-pdf', 'r-input-pdf', 'r-name-pdf', 'pdf');

// ── Guide helpers — geometric shapes with SVG text ──
function rShowGuide(side, title, note) {
  const elId = side === 'left' ? 'r-hint-pdf' : 'r-hint-csv';
  const el = document.getElementById(elId);
  if (!el) return;

  if (!title && !note) {
    el.classList.remove('show');
    setTimeout(function() { if (!el.classList.contains('show')) el.innerHTML = ''; }, 500);
    return;
  }

  // Split combined text into lines
  const allText = ((title || '') + (note ? '\n' + note : '')).trim();
  const lines = allText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  if (side === 'left') {
    // Triangle pointing RIGHT: vertices at (8,152) (152,80) (8,8)
    // Centroid x = (8+152+8)/3 = 56, y = (152+80+8)/3 = 80
    // But visually the "meat" is between x=8..~100, center around x=52, y=80
    const cx = 52, cy = 80;
    const lineH = 14;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    const textEls = lines.map(function(line, i) {
      return `<text class="hint-svg-text hint-svg-text-dark" x="${cx}" y="${startY + i * lineH}" fill="#333">${line}</text>`;
    }).join('');

    el.innerHTML = `<div class="hint-shape">
      <svg class="shape-bg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon class="hint-svg-fill" points="8,152 152,80 8,8"
          fill="rgba(247,247,247,0.97)" stroke="#ccc" stroke-width="1.5" stroke-linejoin="round"/>
        ${textEls}
      </svg>
    </div>`;

  } else {
    // Circle: center (75,75) radius 68
    const cx = 75, cy = 75;
    const lineH = 15;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    const textEls = lines.map(function(line, i) {
      return `<text class="hint-svg-text" x="${cx}" y="${startY + i * lineH}" fill="#fff">${line}</text>`;
    }).join('');

    el.innerHTML = `<div class="hint-shape">
      <svg class="shape-bg" viewBox="0 0 150 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle class="hint-svg-fill" cx="75" cy="75" r="68" fill="#3a3a3a"/>
        ${textEls}
      </svg>
    </div>`;
  }

  el.offsetHeight; // force reflow
  el.classList.add('show');
}
function rHideAllGuides() {
  ['r-hint-pdf','r-hint-csv'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('show');
      setTimeout(function() { if (!el.classList.contains('show')) el.innerHTML = ''; }, 500);
    }
  });
}

function rCheckReady() {
  const btn = document.getElementById('r-process-btn');
  if (rPdfFile) {
    btn.classList.add('show');
    rShowGuide('left', '', '');
    rShowGuide('right', '', '');
    rSetStatus('② Clica em processar recibos · Atenção: recibos sem senha na base de dados não serão publicados — poderás introduzir a senha no aviso que aparecerá.');
  } else {
    btn.classList.remove('show');
  }
}

document.getElementById('r-process-btn').addEventListener('click', rProcessRecibos);

async function rProcessRecibos() {
  const btn = document.getElementById('r-process-btn');
  btn.disabled = true;
  rHideAllGuides();
  document.getElementById('r-conferir-fixed').classList.remove('show');
  rSetStatus('a processar…');
  rSetProgressDetail('a ler ficheiros…');
  rHideWarnings();
  try {
    rSetStatus('a carregar senhas da base de dados…');
    rSetProgressDetail('a consultar base de dados…');
    const csvEntries = await rFetchSenhas();
    if (!csvEntries.length) { rSetStatus('⚠️ Nenhuma senha encontrada na base de dados. Verifica a tabela recibos_funcionarias.'); rSetProgressDetail(''); btn.disabled = false; return; }
    const pdfBytes = await rPdfFile.arrayBuffer();
    rSetStatus('a ler páginas do pdf…');
    rSetProgressDetail('a extrair páginas…');
    const pages = await rExtractPages(pdfBytes);
    rSetProgressDetail(pages.length + ' páginas encontradas');
    const pageMatches = pages.map(page => {
      const matched = csvEntries.find(e =>
        (page.detectedName && page.detectedName.includes(e.name)) || page.text.includes(e.name)
      );
      return { page, csvEntry: matched || null };
    });
    const missingPages = pageMatches.filter(m => !m.csvEntry);
    if (missingPages.length > 0) {
      rSetStatus(`${missingPages.length} pessoa(s) sem senha — a aguardar decisão…`);
      for (let i = 0; i < missingPages.length; i++) {
        const mp = missingPages[i];
        const name = mp.page.detectedName || `pagina ${mp.page.pageIndex}`;
        const decision = await rAskUserAboutMissing(name, i + 1, missingPages.length);
        if (decision.action === 'pwd')    pageMatches[pageMatches.indexOf(mp)].csvEntry = { name, pwd: decision.pwd };
        else if (decision.action === 'nopwd') pageMatches[pageMatches.indexOf(mp)].csvEntry = { name, pwd: null };
      }
    }
    const grouped = {};
    for (const { page, csvEntry } of pageMatches) {
      if (!csvEntry) continue;
      const key = csvEntry.name;
      if (!grouped[key]) grouped[key] = { csvEntry, pages: [] };
      grouped[key].pages.push(page);
    }
    if (Object.keys(grouped).length === 0) { rSetStatus('nenhum recibo para gerar.'); rSetProgressDetail(''); btn.disabled = false; return; }
    rSetStatus('a encriptar e gerar recibos…');
    const keys = Object.keys(grouped);
    const fileList = [];
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki];
      const { csvEntry, pages: grpPages } = grouped[key];
      rSetProgressDetail(`a encriptar: ${ki + 1} / ${keys.length} — ${csvEntry.name}`);
      for (let idx = 0; idx < grpPages.length; idx++) {
        const encBytes = await rEncryptPDF(grpPages[idx].bytes, csvEntry.pwd);
        const suffix   = grpPages.length > 1 ? `_${idx + 1}` : '';
        fileList.push({
          name: csvEntry.name,
          filename: rSanitizeName(csvEntry.name) + suffix + '.pdf',
          bytes: encBytes, pwd: csvEntry.pwd,
          ...(grpPages.length > 1 ? { count: grpPages.length, index: idx + 1 } : {})
        });
      }
    }
    const mes = rDetectMes(); // sempre calculado automaticamente
    localStorage.setItem('gh_mes', mes);

    rSetStatus('a enviar pdfs para supabase…');
    rShowProgress();
    const uploadResults = [];
    for (let i = 0; i < fileList.length; i++) {
      const r = fileList[i];
      const pct = Math.round((i / (fileList.length + 1)) * 100);
      rSetProgress(pct);
      rSetProgressDetail(`a enviar: ${i + 1} / ${fileList.length} — ${r.name}`);
      const ok = await rUploadToSupabase(mes, r.filename, r.bytes);
      uploadResults.push({ ...r, uploaded: ok });
    }

    // Guardar index.json en Supabase (sin base64, solo metadatos)
    rSetStatus('a atualizar index.json…');
    rSetProgressDetail('a publicar lista de recibos…');
    const indexData = {
      mes,
      ficheiros: uploadResults.map(r => r.filename),
      dados: uploadResults.map(r => ({ filename: r.filename, name: r.name, mes }))
    };
    const indexBlob = new Blob([JSON.stringify(indexData, null, 2)], { type: 'application/json' });
    const indexUpdateRes = await sbClient.storage.from('recibos').update('index.json', indexBlob, { upsert: true, contentType: 'application/json' });
    console.log('[recibos] index.json update result:', JSON.stringify(indexUpdateRes));
    if (indexUpdateRes.error) {
      rSetStatus('⚠️ Erro ao atualizar index.json: ' + indexUpdateRes.error.message);
      rSetProgressDetail('Verifica as permissões do bucket em Supabase.');
      btn.disabled = false;
      return;
    }

    rSetProgress(100); rHideProgress();
    const uploaded = uploadResults.filter(r => r.uploaded).length;
    rSetStatus(`✓ ${uploaded} recibos publicados`);
    rSetProgressDetail('');
    rRenderResults(uploadResults, true);
    document.getElementById('r-conferir-fixed').classList.add('show');
  } catch (err) { console.error(err); rSetStatus('erro: ' + err.message); rSetProgressDetail(''); }
  btn.disabled = false;
}

function rParseCSV(text) {
  const entries = [];
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    const stripped = line.replace(/^"(.*)"$/, '$1');
    const parts = stripped.split(';');
    if (parts.length < 2) continue;
    const name = rNormalize(parts[0].trim());
    const pwd  = parts[1].trim();
    if (name && pwd) entries.push({ name, pwd });
  }
  return entries;
}

function rNormalize(str) {
  return str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function rExtractPages(pdfBytes) {
  const { PDFDocument } = PDFLib;
  const srcDoc   = await PDFDocument.load(pdfBytes);
  const pdfjsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  const numPages = srcDoc.getPageCount();
  const pages    = [];
  for (let i = 0; i < numPages; i++) {
    const pdfjsPage = await pdfjsDoc.getPage(i + 1);
    const content   = await pdfjsPage.getTextContent();
    const items = [...content.items].sort((a, b) => {
      const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5]);
      return yDiff !== 0 ? yDiff : a.transform[4] - b.transform[4];
    });
    const rawText = items.map(it => it.str).join(' ');
    const text    = rNormalize(rawText);
    let detectedName = null;
    const tokens = rawText.split(/\s+/);
    const nomeIdx = tokens.findIndex(t => t === 'Nome:');
    if (nomeIdx !== -1) {
      const nameWords = [];
      for (let k = nomeIdx + 1; k < tokens.length && k <= nomeIdx + 7; k++) {
        if (tokens[k] === 'Nome:' || tokens[k].startsWith('Nº')) break;
        if (tokens[k].trim()) nameWords.push(tokens[k].trim());
      }
      detectedName = rNormalize(nameWords.join(' '));
    }
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
    newDoc.addPage(copiedPage);
    const pageBytes = await newDoc.save({ useObjectStreams: false });
    pages.push({ pageIndex: i + 1, text, detectedName, bytes: pageBytes });
  }
  return pages;
}

async function rEncryptPDF(pageBytes, password) {
  if (!password) return pageBytes;
  try { return rEncryptPDFpureJS(pageBytes, password); }
  catch(e) { console.warn('Encrypt failed:', e); return pageBytes; }
}

function rEncryptPDFpureJS(rawInput, userPassword) {
  const raw = rawInput instanceof Uint8Array ? rawInput
    : rawInput instanceof ArrayBuffer ? new Uint8Array(rawInput)
    : new Uint8Array(rawInput.buffer, rawInput.byteOffset, rawInput.byteLength);
  const head = new TextDecoder('latin1').decode(raw.slice(0, Math.min(4096, raw.length)));
  if (!head.startsWith('%PDF')) throw new Error('Not a PDF');
  if (head.includes('/Encrypt')) return rawInput;
  const PAD = [0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A];
  function rc4(key,data){const S=[...Array(256)].map((_,i)=>i);for(let i=0,j=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}let a=0,b=0;return data.map(x=>{a=(a+1)&255;b=(b+S[a])&255;[S[a],S[b]]=[S[b],S[a]];return x^S[(S[a]+S[b])&255];});}
  function md5(inp){function add(x,y){const l=(x&0xFFFF)+(y&0xFFFF);return(((x>>16)+(y>>16)+(l>>16))<<16)|(l&0xFFFF);}function rol(n,c){return(n<<c)|(n>>>(32-c));}function cmn(q,a,b,x,s,t){return add(rol(add(add(a,q),add(x,t)),s),b);}function ff(a,b,c,d,x,s,t){return cmn((b&c)|(~b&d),a,b,x,s,t);}function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&~d),a,b,x,s,t);}function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}function ii(a,b,c,d,x,s,t){return cmn(c^(b|~d),a,b,x,s,t);}const L=inp.length,extra=64-((L+9)%64);const p=[...inp,0x80,...new Array(extra).fill(0)];const bl=L*8;p.push(bl&255,(bl>>8)&255,(bl>>16)&255,(bl>>24)&255,0,0,0,0);let a=0x67452301,b=0xEFCDAB89,c=0x98BADCFE,d=0x10325476;for(let i=0;i<p.length;i+=64){const M=[];for(let j=0;j<16;j++)M[j]=p[i+j*4]|(p[i+j*4+1]<<8)|(p[i+j*4+2]<<16)|(p[i+j*4+3]<<24);let[aa,bb,cc,dd]=[a,b,c,d];a=ff(a,b,c,d,M[0],7,-680876936);d=ff(d,a,b,c,M[1],12,-389564586);c=ff(c,d,a,b,M[2],17,606105819);b=ff(b,c,d,a,M[3],22,-1044525330);a=ff(a,b,c,d,M[4],7,-176418897);d=ff(d,a,b,c,M[5],12,1200080426);c=ff(c,d,a,b,M[6],17,-1473231341);b=ff(b,c,d,a,M[7],22,-45705983);a=ff(a,b,c,d,M[8],7,1770035416);d=ff(d,a,b,c,M[9],12,-1958414417);c=ff(c,d,a,b,M[10],17,-42063);b=ff(b,c,d,a,M[11],22,-1990404162);a=ff(a,b,c,d,M[12],7,1804603682);d=ff(d,a,b,c,M[13],12,-40341101);c=ff(c,d,a,b,M[14],17,-1502002290);b=ff(b,c,d,a,M[15],22,1236535329);a=gg(a,b,c,d,M[1],5,-165796510);d=gg(d,a,b,c,M[6],9,-1069501632);c=gg(c,d,a,b,M[11],14,643717713);b=gg(b,c,d,a,M[0],20,-373897302);a=gg(a,b,c,d,M[5],5,-701558691);d=gg(d,a,b,c,M[10],9,38016083);c=gg(c,d,a,b,M[15],14,-660478335);b=gg(b,c,d,a,M[4],20,-405537848);a=gg(a,b,c,d,M[9],5,568446438);d=gg(d,a,b,c,M[14],9,-1019803690);c=gg(c,d,a,b,M[3],14,-187363961);b=gg(b,c,d,a,M[8],20,1163531501);a=gg(a,b,c,d,M[13],5,-1444681467);d=gg(d,a,b,c,M[2],9,-51403784);c=gg(c,d,a,b,M[7],14,1735328473);b=gg(b,c,d,a,M[12],20,-1926607734);a=hh(a,b,c,d,M[5],4,-378558);d=hh(d,a,b,c,M[8],11,-2022574463);c=hh(c,d,a,b,M[11],16,1839030562);b=hh(b,c,d,a,M[14],23,-35309556);a=hh(a,b,c,d,M[1],4,-1530992060);d=hh(d,a,b,c,M[4],11,1272893353);c=hh(c,d,a,b,M[7],16,-155497632);b=hh(b,c,d,a,M[10],23,-1094730640);a=hh(a,b,c,d,M[13],4,681279174);d=hh(d,a,b,c,M[0],11,-358537222);c=hh(c,d,a,b,M[3],16,-722521979);b=hh(b,c,d,a,M[6],23,76029189);a=hh(a,b,c,d,M[9],4,-640364487);d=hh(d,a,b,c,M[12],11,-421815835);c=hh(c,d,a,b,M[15],16,530742520);b=hh(b,c,d,a,M[2],23,-995338651);a=ii(a,b,c,d,M[0],6,-198630844);d=ii(d,a,b,c,M[7],10,1126891415);c=ii(c,d,a,b,M[14],15,-1416354905);b=ii(b,c,d,a,M[5],21,-57434055);a=ii(a,b,c,d,M[12],6,1700485571);d=ii(d,a,b,c,M[3],10,-1894986606);c=ii(c,d,a,b,M[10],15,-1051523);b=ii(b,c,d,a,M[1],21,-2054922799);a=ii(a,b,c,d,M[8],6,1873313359);d=ii(d,a,b,c,M[15],10,-30611744);c=ii(c,d,a,b,M[6],15,-1560198380);b=ii(b,c,d,a,M[13],21,1309151649);a=ii(a,b,c,d,M[4],6,-145523070);d=ii(d,a,b,c,M[11],10,-1120210379);c=ii(c,d,a,b,M[2],15,718787259);b=ii(b,c,d,a,M[9],21,-343485551);a=add(a,aa);b=add(b,bb);c=add(c,cc);d=add(d,dd);}const r=[];[a,b,c,d].forEach(v=>{for(let i=0;i<4;i++)r.push((v>>(i*8))&255);});return r;}
  const FID=Array.from({length:16},()=>Math.floor(Math.random()*256));
  const padPwd=s=>{const b=[...s].map(c=>c.charCodeAt(0)&255).slice(0,32);return[...b,...PAD].slice(0,32);};
  const pU=padPwd(userPassword);const O=rc4(md5(pU).slice(0,5),[...pU]);const P=-4;const Pb=[P&255,(P>>8)&255,(P>>16)&255,(P>>24)&255];const K=md5([...pU,...O,...Pb,...FID]).slice(0,5);const U=rc4(K,[...PAD]);
  const h2=b=>b.toString(16).padStart(2,'0');const Ohex=O.map(h2).join('');const Uhex=U.map(h2).join('');const FIDhex=FID.map(h2).join('');
  const oKey=(n,g)=>md5([...K,n&255,(n>>8)&255,(n>>16)&255,g&255,(g>>8)&255]).slice(0,Math.min(K.length+5,16));
  const encBuf=(bytes,n,g)=>rc4(oKey(n,g),[...bytes]);
  const NL=b=>b===10||b===13;const latin1=(a,s,e)=>new TextDecoder('latin1').decode(a.slice(s,e));
  function readLine(pos){const s=pos;while(pos<raw.length&&!NL(raw[pos]))pos++;const txt=latin1(raw,s,pos);while(pos<raw.length&&NL(raw[pos]))pos++;return{txt,next:pos};}
  function findBack(needle,startFrom){const n=[...needle].map(c=>c.charCodeAt(0));for(let i=Math.min(startFrom,raw.length-n.length);i>=0;i--){if(n.every((b,j)=>raw[i+j]===b))return i;}return -1;}
  const sxPos=findBack('startxref',raw.length-1);if(sxPos<0)throw new Error('No startxref');
  let{txt,next:p0}=readLine(sxPos+9);while(!txt.trim()&&p0<raw.length)({txt,next:p0}=readLine(p0));const xrefOff=parseInt(txt.trim(),10);
  if(!(raw[xrefOff]===120&&raw[xrefOff+1]===114&&raw[xrefOff+2]===101&&raw[xrefOff+3]===102))throw new Error('Compressed xref stream detected.');
  const objMap=new Map();let p=xrefOff+4;while(p<raw.length&&NL(raw[p]))p++;
  let trailerPos=-1;
  while(p<raw.length){const{txt:line,next}=readLine(p);p=next;const trimmed=line.trim();if(!trimmed)continue;if(trimmed==='trailer'){trailerPos=p;break;}const parts=trimmed.split(/\s+/);if(parts.length===2&&/^\d+$/.test(parts[0])){const fn=parseInt(parts[0]),cnt=parseInt(parts[1]);for(let i=0;i<cnt;i++){const{txt:ent,next:ep}=readLine(p);p=ep;const ep2=ent.trim().split(/\s+/);if(ep2.length>=3&&ep2[2]==='n')objMap.set(fn+i,{offset:parseInt(ep2[0]),gen:parseInt(ep2[1])});}}}
  if(trailerPos<0)throw new Error('No trailer');
  let depth=0,ts=trailerPos,te=-1,tp=trailerPos;while(tp<raw.length){if(raw[tp]===60&&raw[tp+1]===60){depth++;tp+=2;}else if(raw[tp]===62&&raw[tp+1]===62){depth--;tp+=2;if(depth===0){te=tp;break;}}else if(raw[tp]===40){tp++;let sd=1;while(tp<raw.length&&sd>0){if(raw[tp]===92)tp+=2;else if(raw[tp]===40)sd++;else if(raw[tp]===41)sd--;else tp++;}}else tp++;}
  const trailerDict=latin1(raw,ts,te);const rootM=trailerDict.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);if(!rootM)throw new Error('No /Root');const rootRef=`${rootM[1]} ${rootM[2]} R`;
  function encStrings(text,n,g){const key=oKey(n,g);let out='',i=0;while(i<text.length){const ch=text[i];if(ch==='%'){while(i<text.length&&text[i]!=='\n'&&text[i]!=='\r')out+=text[i++];}else if(ch==='<'&&text[i+1]==='<'){out+='<<';i+=2;}else if(ch==='>'&&text[i+1]==='>'){out+='>>';i+=2;}else if(ch==='('){const bs=[];i++;let d=1;while(i<text.length&&d>0){if(text[i]==='\\'){const c=text[++i];i++;if(c==='n')bs.push(10);else if(c==='r')bs.push(13);else if(c==='t')bs.push(9);else if(c==='b')bs.push(8);else if(c==='f')bs.push(12);else if(c==='(')bs.push(40);else if(c===')')bs.push(41);else if(c==='\\')bs.push(92);else if(c>='0'&&c<='7'){let o=c;if(text[i]>='0'&&text[i]<='7')o+=text[i++];if(text[i]>='0'&&text[i]<='7')o+=text[i++];bs.push(parseInt(o,8));}else if(c==='\r'){if(text[i]==='\n')i++;}else if(c==='\n'){}else bs.push(c.charCodeAt(0)&255);}else if(text[i]==='('){d++;bs.push(40);i++;}else if(text[i]===')'){d--;if(d>0){bs.push(41);i++;}else i++;}else{bs.push(text.charCodeAt(i)&255);i++;}}out+='<'+rc4(key,bs).map(h2).join('')+'>';}else if(ch==='<'){i++;let h='';while(i<text.length&&text[i]!=='>'){if(!/\s/.test(text[i]))h+=text[i];i++;}i++;if(h.length%2)h+='0';const bs=[];for(let j=0;j<h.length;j+=2)bs.push(parseInt(h.slice(j,j+2),16));out+='<'+rc4(key,bs).map(h2).join('')+'>';}else{out+=ch;i++;}}return out;}
  const chunks=[];let outLen=0;function emit(data){const u=typeof data==='string'?(()=>{const b=new Uint8Array(data.length);for(let i=0;i<data.length;i++)b[i]=data.charCodeAt(i)&255;return b;})():(data instanceof Uint8Array?data:new Uint8Array(data));chunks.push(u);outLen+=u.length;}
  let hdrEnd=0;for(let nl=0;nl<2;){if(NL(raw[hdrEnd]))nl++;hdrEnd++;if(hdrEnd>=raw.length)break;}emit(raw.slice(0,hdrEnd));
  const newOffsets=new Map();const sorted=[...objMap.entries()].sort((a,b)=>a[1].offset-b[1].offset);
  for(const[n,{offset,gen}]of sorted){newOffsets.set(n,outLen);let pos=offset;while(pos<raw.length&&!NL(raw[pos]))pos++;while(pos<raw.length&&NL(raw[pos]))pos++;emit(latin1(raw,offset,pos));if(raw[pos]===60&&raw[pos+1]===60){let d=0,dp=pos;while(dp<raw.length){if(raw[dp]===60&&raw[dp+1]===60){d++;dp+=2;}else if(raw[dp]===62&&raw[dp+1]===62){d--;dp+=2;if(d===0)break;}else if(raw[dp]===40){dp++;let sd=1;while(dp<raw.length&&sd>0){if(raw[dp]===92)dp+=2;else if(raw[dp]===40)sd++;else if(raw[dp]===41)sd--;else dp++;}}else if(raw[dp]===60&&raw[dp+1]!==60){dp++;while(dp<raw.length&&raw[dp]!==62)dp++;dp++;}else dp++;}const dictEnd=dp;const dictTxt=latin1(raw,pos,dictEnd);let sp=dictEnd;while(sp<raw.length&&(raw[sp]===32||raw[sp]===9||raw[sp]===10||raw[sp]===13))sp++;const isStream=raw[sp]===115&&raw[sp+1]===116&&raw[sp+2]===114&&raw[sp+3]===101&&raw[sp+4]===97&&raw[sp+5]===109;const lenM=dictTxt.match(/\/Length\s+(\d+)(?!\s*\d+\s*R)/);const streamLen=lenM?parseInt(lenM[1]):-1;emit(encStrings(dictTxt,n,gen));if(isStream&&streamLen>=0){sp+=6;if(raw[sp]===13)sp++;if(raw[sp]===10)sp++;emit('\nstream\n');emit(new Uint8Array(encBuf([...raw.slice(sp,sp+streamLen)],n,gen)));emit('\nendstream\nendobj\n');}else if(isStream){sp+=6;if(raw[sp]===13)sp++;if(raw[sp]===10)sp++;emit('\nstream\n');const es=[...`endstream`].map(c=>c.charCodeAt(0));let ep=sp;outer2:for(;ep<raw.length-9;ep++){for(let j=0;j<9;j++)if(raw[ep+j]!==es[j])continue outer2;break;}emit(raw.slice(sp,ep));emit('endstream\nendobj\n');}else{emit('\nendobj\n');}}else{const eo=[101,110,100,111,98,106];let ep=pos;outer3:for(;ep<raw.length;ep++){for(let j=0;j<6;j++)if(raw[ep+j]!==eo[j])continue outer3;break;}emit(encStrings(latin1(raw,pos,ep),n,gen));emit('endobj\n');}}
  const encN=Math.max(...objMap.keys())+1;newOffsets.set(encN,outLen);emit(`${encN} 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <${Ohex}> /U <${Uhex}> /P -4 >>\nendobj\n`);
  const xrefStart=outLen;emit('xref\n');emit('0 1\n0000000000 65535 f\r\n');const nums=[...newOffsets.keys()].sort((a,b)=>a-b);let ri=0;while(ri<nums.length){let re=ri;while(re+1<nums.length&&nums[re+1]===nums[re]+1)re++;emit(`${nums[ri]} ${re-ri+1}\n`);for(let j=ri;j<=re;j++)emit(`${String(newOffsets.get(nums[j])).padStart(10,'0')} 00000 n\r\n`);ri=re+1;}
  emit(`trailer\n<< /Size ${encN+1} /Root ${rootRef} /Encrypt ${encN} 0 R /ID [<${FIDhex}><${FIDhex}>] >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  const result=new Uint8Array(outLen);let off2=0;for(const ch of chunks){result.set(ch,off2);off2+=ch.length;}return result;
}

async function rUploadToSupabase(mes, filename, bytes) {
  const path = mes + '/' + filename;
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const { error } = await sbClient.storage.from('recibos')
    .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
  return !error;
}

function rRenderResults(results, showUpload) {
  // Store for potential download but don't render table (removed results zone)
  window._recibosData = results;
}

function rDownloadRecibo(index) {
  const r = window._recibosData[index];
  if (!r || !r.bytes) return;
  const blob = new Blob([r.bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = r.filename; a.click();
  URL.revokeObjectURL(url);
}

function rShowWarnings(names) {
  const box = document.getElementById('r-warnings-box');
  const list = document.getElementById('r-warnings-list');
  list.innerHTML = names.map(n => `<li>${escHtml(n)}</li>`).join('');
  box.style.display = 'block';
}
function rHideWarnings() {
  document.getElementById('r-warnings-box').style.display = 'none';
  document.getElementById('r-warnings-list').innerHTML = '';
}
function rShowProgress() { document.getElementById('r-upload-progress').style.display = 'block'; }
function rHideProgress() { document.getElementById('r-upload-progress').style.display = 'none'; rSetProgress(0); }
function rSetProgress(pct) { document.getElementById('r-upload-progress-bar').style.width = pct + '%'; }
function rSetStatus(msg) { document.getElementById('r-status-msg').textContent = msg; }
function rSetProgressDetail(msg) {
  const el = document.getElementById('r-progress-detail');
  if (el) el.textContent = msg;
}

// Mes auto-detectado — não há campo manual

// Conferir button — open recibos overlay
document.getElementById('r-conferir-btn').addEventListener('click', function() {
  openRecibosOverlay();
});

function rAskUserAboutMissing(name, current, total) {
  return new Promise(resolve => {
    const overlay   = document.getElementById('r-modal-overlay');
    const nameEl    = document.getElementById('r-modal-name');
    const counterEl = document.getElementById('r-modal-counter');
    const pwdRow    = document.getElementById('r-modal-pwd-row');
    const pwdInput  = document.getElementById('r-modal-pwd-input');
    const btnPwd    = document.getElementById('r-modal-btn-pwd');
    const btnNoPwd  = document.getElementById('r-modal-btn-no-pwd');
    const btnSkip   = document.getElementById('r-modal-btn-skip');
    nameEl.textContent = name; counterEl.textContent = `${current} de ${total}`;
    pwdRow.style.display = 'none'; pwdInput.value = '';
    overlay.classList.add('show');
    const newBtnPwd = btnPwd.cloneNode(true);
    const newBtnNoPwd = btnNoPwd.cloneNode(true);
    const newBtnSkip = btnSkip.cloneNode(true);
    btnPwd.replaceWith(newBtnPwd); btnNoPwd.replaceWith(newBtnNoPwd); btnSkip.replaceWith(newBtnSkip);
    function close(action, pwd) { overlay.classList.remove('show'); resolve({ action, pwd: pwd || null }); }
    document.getElementById('r-modal-btn-pwd').addEventListener('click', () => {
      const pwdRowEl = document.getElementById('r-modal-pwd-row');
      const pwdInputEl = document.getElementById('r-modal-pwd-input');
      if (pwdRowEl.style.display === 'none') {
        pwdRowEl.style.display = 'flex';
        document.getElementById('r-modal-btn-pwd').textContent = '✓ confirmar senha';
      } else {
        const pwd = pwdInputEl.value.trim();
        if (!pwd) { pwdInputEl.focus(); return; }
        close('pwd', pwd);
      }
    });
    document.getElementById('r-modal-btn-no-pwd').addEventListener('click', () => close('nopwd', null));
    document.getElementById('r-modal-btn-skip').addEventListener('click',   () => close('skip', null));
    document.getElementById('r-modal-pwd-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { const pwd = e.target.value.trim(); if (pwd) close('pwd', pwd); }
    });
  });
}

function rGenerateStandaloneHTML(results) {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const folder    = localStorage.getItem('gh_folder') || '';
  const mmMatch   = folder.match(/[-\/](\d{2})$/);
  const monthName = mmMatch ? (MESES[parseInt(mmMatch[1], 10) - 1] || '') : '';
  const pageTitle = monthName ? `Recibo ${monthName}` : 'Recibos';
  const items = results.map(r => {
    let binary = '';
    const bytes = r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { name: r.name, filename: r.filename, b64: btoa(binary), count: r.count||null, index: r.index||null };
  });
  const rows = items.map((item, i) => {
    const nameDisplay = item.count
      ? `${escHtml(item.name)} <span style="color:#aaa;font-size:.75rem">(${item.index}/${item.count})</span>`
      : escHtml(item.name);
    return `<tr><td class="rn">${i + 1}</td><td>${nameDisplay}</td><td><button onclick="dl(${i})">⬇ pdf</button></td></tr>`;
  }).join('');
  const dataJSON = JSON.stringify(items.map(it => ({ filename: it.filename, b64: it.b64 })));
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${pageTitle}</title><style>@font-face{font-family:'ML';src:url('https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/Montserrat-Light.ttf.ttf') format('truetype');font-weight:100}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{min-height:100%;font-family:'ML',sans-serif;background:#fff;color:#000}body{display:flex;flex-direction:column;align-items:center;padding:40px 16px 60px}.logo{font-size:3rem;font-weight:100;text-transform:lowercase;margin-bottom:4px}.page-title{font-size:1.6rem;font-weight:bold;margin-bottom:32px;color:#000}table{width:100%;max-width:700px;border-collapse:separate;border-spacing:0;border-radius:15px;overflow:hidden}th{background:#e0e0e0;padding:10px 14px;text-align:left;font-size:.85rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;border:1px solid #e6e6e6}td{padding:9px 14px;border:1px solid #efefef;font-size:.88rem;font-weight:bold;vertical-align:middle}tbody tr:hover td{background:#f5f5f5}.rn{color:#aaa;font-size:.78rem;text-align:center;min-width:24px}button{padding:4px 12px;font-size:.78rem;cursor:pointer;border:1px solid #ccc;border-radius:7px;background:#fff;font-family:'ML',sans-serif;font-weight:600;transition:background .15s,color .15s}button:hover{background:#555;color:#fff;border-color:#555}.nota{width:100%;max-width:700px;margin-top:32px;padding:18px 22px;border-top:1px solid #e6e6e6;font-size:.78rem;font-weight:600;color:#555;line-height:1.7}.nota p{margin-bottom:6px}.nota p:last-child{margin-bottom:0}.nota strong{color:#111;font-weight:bold}</style></head><body><div class="logo">wakzome</div><div class="page-title">${pageTitle}</div><table><thead><tr><th class="rn">#</th><th>colaborador</th><th>descarregar</th></tr></thead><tbody>${rows}</tbody></table><div class="nota"><p><strong>Após a impressão do recibo:</strong></p><p>· Caso esteja de acordo, poderá colocá-lo juntamente com os restantes recibos num único envelope, como tem sido feito até agora;</p><p>· Em alternativa, poderá guardá-lo em envelope fechado e juntá-lo à restante documentação que habitualmente é enviada para Lisboa.</p><p>Solicitamos igualmente o devido cuidado em assegurar que cada trabalhadora assine o seu recibo original e que este seja enviado, uma vez que, de acordo com a política interna, a assinatura constitui um procedimento obrigatório e regular.</p></div><script>const DATA=${dataJSON};function dl(i){const d=DATA[i];const bin=atob(d.b64);const bytes=new Uint8Array(bin.length);for(let j=0;j<bin.length;j++)bytes[j]=bin.charCodeAt(j);const blob=new Blob([bytes],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=d.filename;a.click();URL.revokeObjectURL(url);}<\/script></body></html>`;
}


function rSanitizeName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
}
