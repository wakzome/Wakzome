// ══════════════════════════════════════════════════════════════
//  ORDENADOS — ficheiro fundido (salários + recibos)
//  Bloco SALÁRIOS: mantém a sua própria IIFE (scope isolado).
//  Bloco RECIBOS: mantém-se em scope de topo, sem IIFE nova —
//  rLoadConfig() é chamado por shared.js como função global no
//  fluxo de login do admin; envolvê-lo numa IIFE quebraria esse
//  fluxo. Confirmado: zero colisões de nomes entre os dois blocos.
// ══════════════════════════════════════════════════════════════

(function () {

  // ── DOM injected by salarios.js ──
  function ensureUploadShell() {
    if (document.getElementById('s-upload-zone')) return;
    var col = document.getElementById('pag-col-salarios');
    if (!col) return;
    var zone = document.createElement('div');
    zone.id = 's-upload-zone';
    zone.innerHTML =
      '<label id="s-upload-label" for="s-file-input">' +
        '<span class="upload-icon">\ud83d\udcc4</span>' +
        'carregar pdf de sal\u00e1rios<br>' +
        '<small class="s-upload-hint">clique ou arraste o ficheiro aqui</small>' +
      '</label>' +
      '<input type="file" id="s-file-input" accept="application/pdf">' +
      '<div id="s-file-name"></div>' +
      '<div id="s-status-msg"></div>';
    col.appendChild(zone);
    var resultsWrap = document.createElement('div');
    resultsWrap.className = 'results-wrap';
    resultsWrap.id = 's-results-wrap';
    col.appendChild(resultsWrap);
  }
  ensureUploadShell();

  // ── Utilidad interna ──
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: SALÁRIOS
  // ══════════════════════════════════════════════════════════════

  // ── Injectar modal de resultados en el DOM ──
  (function () {
    if (document.getElementById('s-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'z-modal-overlay';
    overlay.innerHTML =
      '<div id="s-modal-overlay">' +
        '<div id="s-modal-box">' +
          '<div id="s-modal-header">' +
            '<span id="s-modal-title">processamento de salários</span>' +
            '<button id="s-modal-close" title="Fechar">✕</button>' +
          '</div>' +
          '<div id="s-modal-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay.firstElementChild);
    document.getElementById('s-modal-close').addEventListener('click', function () {
      document.getElementById('s-modal-overlay').classList.remove('show');
    });
    document.getElementById('s-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('show');
    });
  })();

  let sTableData = [];

  const sUploadLabel = document.getElementById('s-upload-label');

  // Crear e insertar botón de reset justo después del upload label
  const sResetBtn = document.createElement('button');
  sResetBtn.id = 's-reset-btn';
  sResetBtn.title = 'Carregar novo ficheiro';
  sResetBtn.innerHTML = '↺';
  sUploadLabel.parentNode.insertBefore(sResetBtn, sUploadLabel.nextSibling);

  const sViewBtn = document.createElement('button');
  sViewBtn.id = 's-view-btn';
  sViewBtn.textContent = 'ver resultados';
  sResetBtn.parentNode.insertBefore(sViewBtn, sResetBtn.nextSibling);
  sViewBtn.addEventListener('click', () => {
    document.getElementById('s-modal-overlay').classList.add('show');
  });

  sResetBtn.addEventListener('click', () => {
    sTableData = [];
    sCopiedRow = null;
    sCopyRowTimer = null;
    document.getElementById('s-file-name').innerHTML = '';
    document.getElementById('s-status-msg').textContent = '';
    document.getElementById('s-results-wrap').innerHTML = '';
    document.getElementById('s-modal-body').innerHTML = '';
    document.getElementById('s-modal-overlay').classList.remove('show');
    document.getElementById('s-file-input').value = '';
    sUploadLabel.style.display = '';
    sResetBtn.classList.remove('visible');
    sViewBtn.classList.remove('visible');
    document.getElementById('tab-pagamentos').classList.remove('s-loaded');
    const adminApp = document.getElementById('admin-app');
    adminApp.classList.remove('s-loaded');
    delete adminApp.dataset.sLoaded;
    document.body.style.overflow = '';
  });

  sUploadLabel.addEventListener('dragover',  e => { e.preventDefault(); sUploadLabel.classList.add('drag-over'); });
  sUploadLabel.addEventListener('dragleave', () => sUploadLabel.classList.remove('drag-over'));
  sUploadLabel.addEventListener('drop', e => {
    e.preventDefault(); sUploadLabel.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') sHandleFile(file);
  });
  document.getElementById('s-file-input').addEventListener('change', e => {
    if (e.target.files[0]) sHandleFile(e.target.files[0]);
  });

  function sFormatFileName(filename) {
    const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const m = filename.match(/(\d{2})(\d{4})/);
    if (m) {
      const mes = parseInt(m[1], 10);
      const ano = m[2];
      if (mes >= 1 && mes <= 12) {
        const nomeMes = MESES[mes - 1].charAt(0).toUpperCase() + MESES[mes - 1].slice(1);
        return `<strong class="s-filename-strong">${nomeMes} ${ano}</strong>`;
      }
    }
    return `<span class="s-filename-span">${filename}</span>`;
  }

  async function sHandleFile(file) {
    const displayName = sFormatFileName(file.name);
    document.getElementById('s-file-name').innerHTML  = displayName;
    document.getElementById('s-status-msg').textContent = 'a processar…';
    document.getElementById('s-results-wrap').innerHTML = '';
    sTableData = [];
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let allText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        const rows    = sGroupByRows(content.items);
        allText += rows.map(r => r.join('\t')).join('\n') + '\n';
      }
      const rows = sParsePayrollTable(allText);
      if (rows.length === 0) {
        document.getElementById('s-status-msg').textContent = 'nenhum dado encontrado. verifique o pdf.';
        return;
      }
      sTableData = rows;
      sRenderTable(rows);
      const countFinal = sTableData.length;
      document.getElementById('s-status-msg').textContent = countFinal + ' colaboradores encontrados';
      sUploadLabel.style.display = 'none';
      sResetBtn.classList.add('visible');
      sViewBtn.classList.add('visible');
      document.getElementById('s-upload-label').classList.add('loaded');
      document.getElementById('tab-pagamentos').classList.add('s-loaded');
      const adminApp = document.getElementById('admin-app');
      adminApp.classList.add('s-loaded');
      adminApp.dataset.sLoaded = '1';
      document.body.style.overflow = 'auto';
      // Abrir modal con los resultados
      document.getElementById('s-modal-overlay').classList.add('show');
    } catch (err) {
      console.error(err);
      document.getElementById('s-status-msg').textContent = 'erro ao processar o ficheiro.';
    }
  }

  function sGroupByRows(items) {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
    const rows = []; let currentRow = []; let lastY = sorted[0].transform[5]; const THRESHOLD = 3;
    for (const item of sorted) {
      const y = item.transform[5];
      if (Math.abs(y - lastY) > THRESHOLD) {
        if (currentRow.length) rows.push(currentRow.sort((a,b) => a.transform[4]-b.transform[4]).map(i => i.str.trim()));
        currentRow = [item]; lastY = y;
      } else { currentRow.push(item); }
    }
    if (currentRow.length) rows.push(currentRow.sort((a,b) => a.transform[4]-b.transform[4]).map(i => i.str.trim()));
    return rows;
  }

  function sParsePayrollTable(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const results = []; const codeRe = /^\d+$/;
    for (const line of lines) {
      const tokens = line.split('\t').map(t => t.trim()).filter(t => t);
      if (tokens.length < 3) continue;
      if (!codeRe.test(tokens[0])) continue;
      let nameTokens = [], numberTokens = [], inNumbers = false;
      for (let i = 1; i < tokens.length; i++) {
        const isNum = /^-?[\d]+([.,]\d+)?$/.test(tokens[i].replace(/\./g, '').replace(',', '.'));
        if (!inNumbers && !isNum) { nameTokens.push(tokens[i]); }
        else { inNumbers = true; numberTokens.push(tokens[i]); }
      }
      if (nameTokens.length === 0 || numberTokens.length === 0) continue;
      const toNum = s => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;
      results.push({
        code:        tokens[0],
        name:        nameTokens.join(' '),
        liquido:     numberTokens[numberTokens.length - 1],
        alimentacao: toNum(numberTokens[1]),
        ferias:      toNum(numberTokens[2]),
        outrosAbonos:toNum(numberTokens[4]),
      });
    }
    return results;
  }

  function sRenderTable(rows) {
    if (!rows.length) return;
    const filtered = rows.filter(r => {
      const n = parseFloat(r.liquido.replace(/\./g, '').replace(',', '.'));
      return !isNaN(n) && n > 0;
    });
    if (!filtered.length) {
      document.getElementById('s-modal-body').innerHTML = '<p class="s-empty-msg">nenhum colaborador com vencimento positivo.</p>';
      return;
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    sTableData = filtered;

    // ── Detecção de erros contabilísticos ──
    const errRed    = filtered.filter(r => r.ferias > 0 && r.alimentacao > 0);
    const errYellow = filtered.filter(r => r.ferias > 0 && r.alimentacao === 0 && r.outrosAbonos === 35);
    let summaryHtml = '';
    if (errRed.length || errYellow.length) {
      const onlyYellow = errRed.length === 0;
      let items = '';
      errRed.forEach(r => {
        items += `<li><strong>${escHtml(r.name)}</strong> — subsídio de férias + subsídio de alimentação</li>`;
      });
      errYellow.forEach(r => {
        items += `<li><strong>${escHtml(r.name)}</strong> — subsídio de férias + abono de falhas (€35)</li>`;
      });
      summaryHtml = `<div id="s-errors-summary"${onlyYellow ? ' class="has-yellow"' : ''}>
        <div id="s-errors-summary-icon">${onlyYellow ? '⚠️' : '🚨'}</div>
        <div><strong>${errRed.length + errYellow.length} erro(s) detetado(s) neste processamento:</strong><ul>${items}</ul></div>
      </div>`;
    }
    const total = filtered.reduce((sum, r) => {
      const n = parseFloat(r.liquido.replace(/\./g, '').replace(',', '.'));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    let html = summaryHtml + `<table id="s-salary-table"><thead><tr>
      <th class="row-num">#</th><th>nome</th><th>vencimento</th>
    </tr></thead><tbody>`;
    filtered.forEach((r, i) => {
      const cleanVal = r.liquido.replace(/\.(?=\d{3},)/, '');
      let badge = '';
      if (r.ferias > 0 && r.alimentacao > 0) {
        badge = `<span class="s-err-badge s-err-red" title="Subsídio de férias + subsídio de alimentação indevido"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> erro</span>`;
      } else if (r.ferias > 0 && r.outrosAbonos === 35) {
        badge = `<span class="s-err-badge s-err-yellow" title="Subsídio de férias + abono de falhas (€35) — verificar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> verificar</span>`;
      }
      html += `<tr><td class="row-num">${i + 1}</td><td>${escHtml(r.name)}${badge}</td><td onclick="sCopyLiquido(this)" data-val="${escHtml(cleanVal)}" title="Clique para copiar"><span class="s-liq-cell"><svg class="s-liq-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${escHtml(cleanVal)}</span></td></tr>`;
    });
    html += `</tbody><tfoot><tr>
      <td class="row-num"></td><td>total</td>
      <td>${total.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr></tfoot></table>`;
    document.getElementById('s-modal-body').innerHTML = html;
  }

  // Timeout handle para limpar o highlight anterior
  let sCopyRowTimer = null;
  let sCopiedRow = null;

  window.sCopyLiquido = function (td) {
    const val = td.getAttribute('data-val');
    const copy = (navigator.clipboard && navigator.clipboard.writeText)
      ? navigator.clipboard.writeText(val)
      : Promise.reject();
    copy.catch(() => {
      const ta = document.createElement('textarea');
      ta.value = val; ta.className = 's-clip-helper';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    });

    if (sCopiedRow) sCopiedRow.classList.remove('s-row-copied');
    if (sCopyRowTimer) { clearTimeout(sCopyRowTimer); sCopyRowTimer = null; }

    const row = td.closest('tr');
    if (row) { row.classList.add('s-row-copied'); sCopiedRow = row; }
  };

})();

// ══════════════════════════════════════════════════════════════
//  (bloco RECIBOS — scope de topo, ver nota no cabeçalho do ficheiro)
// ══════════════════════════════════════════════════════════════

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
    // Insere antes dos uploads
    const anchor = document.getElementById('r-upload-outer') || document.getElementById('r-status-msg');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor);
    else document.body.prepend(badge);
  }
  badge.innerHTML = `<span class="r-badge-label">a processar</span><strong class="r-badge-value">${label}</strong>`;
}

/* ══════════════════════════════════════════════════════════════
   RECIBOS — auto-inject: estilos + DOM
   Cualquier cambio visual o estructural va aquí, nunca en index.html
   ══════════════════════════════════════════════════════════════ */

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
            '<small class="r-upload-hint">clique ou arraste</small>' +
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
  list.innerHTML = '<div class="r-gestao-placeholder">a carregar...</div>';
  try {
    var data = await rGestaoApi('GET');
    rGestaoRenderList(data.funcionarias || []);
  } catch(e) {
    list.innerHTML = '<div class="r-gestao-error">' + e.message + '</div>';
  }
}

function rGestaoRenderList(list) {
  var container = document.getElementById('r-gestao-list');
  if (!list.length) {
    container.innerHTML = '<div class="r-gestao-placeholder">Nenhuma colaboradora registada.</div>';
    return;
  }
  container.innerHTML = list.map(function(f) {
    var inativo = !f.ativo ? ' <span class="r-gestao-inativo-tag">(inativa)</span>' : '';
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

/* ══════════════════════════════════════════════════════════════
   OVERLAY "VER RECIBOS" — movido de index.html (fusão)
   window.openRecibosOverlay / window.closeRecibosOverlay — usados
   pelos links/botões do cabeçalho e do painel SAFT após login.
   IIFE auto-contida, MESES local — zero alterações à lógica.
   ══════════════════════════════════════════════════════════════ */
(function () {
  var MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  window.openRecibosOverlay = function () {
    var overlay     = document.getElementById('recibos-overlay');
    var loading     = document.getElementById('recibos-overlay-loading');
    var body        = document.getElementById('recibos-overlay-body');
    var errorDiv    = document.getElementById('recibos-overlay-error');
    var titleEl     = document.getElementById('recibos-overlay-title');
    var pageTitleEl = document.getElementById('recibos-page-title');
    var tbody       = document.getElementById('recibos-tbody');
    if (!overlay) return;

    
    overlay.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('visible'); });
    });

    
    loading.style.display  = 'block';
    loading.textContent    = 'a carregar…';
    body.style.display     = 'none';
    errorDiv.style.display = 'none';
    errorDiv.textContent   = '';
    tbody.innerHTML        = '';

    
    var mes       = localStorage.getItem('gh_mes') || '';
    var mmMatch   = mes.match(/^(\d{2})-(\d{4})$/);
    var monthName = mmMatch ? (MESES[parseInt(mmMatch[1], 10) - 1] || mes) : mes;
    if (titleEl)     titleEl.textContent     = monthName || 'recibos';
    if (pageTitleEl) pageTitleEl.textContent = monthName ? 'Recibo ' + monthName : 'Recibos';

    
    sbClient.storage.from('recibos').createSignedUrl('index.json', 60)
      .then(function (signRes) {
        if (signRes.error) throw new Error(signRes.error.message);
        return fetch(signRes.data.signedUrl + '&t=' + Date.now(), { cache: 'no-store' });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (indexData) {
        var items = indexData.dados || [];
        if (!items.length && indexData.ficheiros) {
          items = indexData.ficheiros.map(function (f) {
            return { filename: f, name: f.replace(/_/g, ' ').replace(/\.pdf$/i, ''), mes: indexData.mes || mes };
          });
        }

        if (!items.length) {
          loading.style.display  = 'none';
          errorDiv.style.display = 'block';
          errorDiv.textContent   = 'Nenhum recibo encontrado.';
          return;
        }

        var mesPasta = indexData.mes || mes;
        var paths = items.map(function (item) { return mesPasta + '/' + item.filename; });

        
        return sbClient.storage.from('recibos').createSignedUrls(paths, 300)
          .then(function (urlRes) {
            if (urlRes.error) throw new Error(urlRes.error.message);
            var signed = urlRes.data; 

            tbody.innerHTML = items.map(function (item, i) {
              var entry   = signed[i] || {};
              var fileUrl = entry.signedUrl || '';
              var name    = item.name || item.filename;
              var safeName = String(name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              var safeFile = String(item.filename).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              return '<tr>'
                + '<td class="rn">' + (i + 1) + '</td>'
                + '<td>' + safeName + '</td>'
                + '<td><a href="' + fileUrl + '" download="' + safeFile + '" '
                +   'style="padding:4px 12px;font-size:.78rem;cursor:pointer;border:1px solid #ccc;'
                +   'border-radius:7px;background:#fff;text-decoration:none;font-weight:600;display:inline-block;"'
                +   ' onmouseover="this.style.background=\'#555\';this.style.color=\'#fff\';this.style.borderColor=\'#555\'"'
                +   ' onmouseout="this.style.background=\'#fff\';this.style.color=\'\';this.style.borderColor=\'#ccc\'"'
                +   '>⬇ pdf</a></td>'
                + '</tr>';
            }).join('');

            loading.style.display = 'none';
            body.style.display    = 'block';
          });
      })
      .catch(function (err) {
        console.error('openRecibosOverlay:', err);
        loading.style.display  = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent   = '⚠️ Erro ao carregar recibos: ' + err.message;
      });
  };
  window.closeRecibosOverlay = function () {
    var overlay = document.getElementById('recibos-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(function () { overlay.classList.remove('open'); }, 460);
  };
})();

/* ══════════════════════════════════════════════════════════════
   MOTOR DE DETEÇÃO DE MÊS — v1.1
   Determina a pasta do Supabase (mês/ano ou natal/ano) a partir do
   CONTEÚDO do PDF, em vez da data do sistema no momento do upload.
   rDetectMes() é mantida 100% intacta — continua a servir o badge
   visual pré-upload e como reserva (fallback) final deste motor.
   Tudo isolado num IIFE (mesmo padrão do MOTOR DE FISCALIZAÇÃO mais
   abaixo) para não poluir o scope global da página com nomes
   genéricos que possam colidir com outros módulos do admin.
   Único identificador exposto: rDetermineMesFromPDF.
   Zero alterações às funções existentes.
   ══════════════════════════════════════════════════════════════ */

const rDetermineMesFromPDF = (function() {

  // Ancora a data-base do lote: "De 1 de Junho 2026" / "De 1 de Dezembro 2025"
  const RX_DATA_INICIO = /\bDE\s+(\d{1,2})\s+DE\s+([A-Z]+)\s+(\d{4})\b/;

  // Tipo "Subsídio Natal" isolado — exclui "Subsídio Natal Fim Contrato"
  // (que surge nas páginas de Encerramento e não define o lote como Natal)
  const RX_TIPO_NATAL_OK = /SUBSIDIO NATAL(?!\s+FIM\b)/;

  const MESES_PT = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

  // Mínimo de colaboradoras distintas com tipo "Subsídio Natal" para confirmar o lote como Natal
  const MES_NATAL_MIN_COLABORADORAS = 5;
  // Mínima proporção de páginas que têm de concordar na mesma data para confiar no PDF
  const MES_DATA_CONFIANCA_MIN = 0.6;

  /**
   * Motor 1 — Extração de Data por consenso.
   * Lê a data-base ("De X de <mês> YYYY") de TODAS as páginas do PDF e
   * devolve o valor mais frequente (moda), imune a páginas isoladas
   * corrompidas ou com layout inesperado.
   */
  function m1_extrairDataConsenso(pages) {
    const contagem = {};
    let validas = 0;
    for (const p of pages) {
      const m = p.text && p.text.match(RX_DATA_INICIO);
      if (!m) continue;
      const mesIdx = MESES_PT.indexOf(m[2]);
      if (mesIdx === -1) continue;
      const mm  = String(mesIdx + 1).padStart(2, '0');
      const key = `${mm}-${m[3]}`;
      contagem[key] = (contagem[key] || 0) + 1;
      validas++;
    }
    if (validas === 0) return { mes: null, ano: null, confianca: 0 };
    const [melhorKey, melhorCount] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
    const [mm, yyyy] = melhorKey.split('-');
    return { mes: mm, ano: yyyy, confianca: melhorCount / validas };
  }

  /**
   * Motor 2 — Classificação de lote de Natal.
   * Conta colaboradoras DISTINTAS (não páginas) cujo tipo de recibo é
   * "Subsídio Natal", para evitar que uma única página de Encerramento
   * com "Subsídio Natal Fim Contrato" classifique o lote inteiro.
   */
  function m2_contarNatal(pages) {
    const colaboradorasNatal = new Set();
    for (const p of pages) {
      if (!p.detectedName) continue;
      if (p.text && RX_TIPO_NATAL_OK.test(p.text)) colaboradorasNatal.add(p.detectedName);
    }
    return colaboradorasNatal.size;
  }

  /**
   * Motor 3 — Fiscalização / Árbitro.
   * Cruza os Motores 1 e 2 e decide a fonte final do mês:
   *  - Natal confirmado apenas se houver ≥5 colaboradoras com tipo
   *    "Subsídio Natal" E a data-consenso do PDF cair em Dezembro.
   *  - Caso contrário usa o mês/ano extraído do PDF, se a confiança
   *    da data for suficiente.
   *  - Em último caso — sem confiança nenhuma no conteúdo do PDF —
   *    aplica-se rDetectMes(), a regra que já vigorava.
   */
  return function rDetermineMesFromPDF(pages) {
    const dataInfo   = m1_extrairDataConsenso(pages);
    const natalCount = m2_contarNatal(pages);
    const dataConfiavel = dataInfo.mes !== null && dataInfo.confianca >= MES_DATA_CONFIANCA_MIN;

    if (dataConfiavel && dataInfo.mes === '12' && natalCount >= MES_NATAL_MIN_COLABORADORAS) {
      console.log(`[rDetermineMesFromPDF] Natal confirmado — ${natalCount} colaboradoras, ano ${dataInfo.ano}, confiança da data ${(dataInfo.confianca * 100).toFixed(0)}%`);
      return `natal-${dataInfo.ano}`;
    }
    if (dataConfiavel) {
      console.log(`[rDetermineMesFromPDF] Mês extraído do PDF: ${dataInfo.mes}-${dataInfo.ano} (confiança ${(dataInfo.confianca * 100).toFixed(0)}%)`);
      return `${dataInfo.mes}-${dataInfo.ano}`;
    }
    console.warn('[rDetermineMesFromPDF] Não foi possível confirmar a data pelo conteúdo do PDF — a usar rDetectMes() (data do sistema) como reserva.');
    return rDetectMes();
  };

})();

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
    const mes = rDetermineMesFromPDF(pages); // determinado pelo conteudo do PDF, com reserva em rDetectMes()
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

/* ══════════════════════════════════════════════════════════════
   MOTOR DE FISCALIZAÇÃO — v2.0
   Análise imediata no momento do upload do PDF.
   Zero alterações às funções existentes.
   ══════════════════════════════════════════════════════════════ */

(function rFiscInit() {

  /* ─────────────────────────────────────────────────────────────
     PADRÕES DE DETECÇÃO
     ──────────────────────────────────────────────────────────── */

  // Nota exclusiva do TOConline nos recibos tipo "Subsídio Férias"
  const RX_TIPO_FERIAS     = /O ABONO VENCIMENTO BASE CONTRIBUIU COM O VALOR DE/i;
  // Cabeçalho de recibo tipo "Encerramento"
  const RX_TIPO_ENC        = /\bENCERRAMENTO\b/i;
  // Marcadores de liquidação legítima (só existem em Encerramento)
  const RX_LIQUIDACAO      = /SUBSIDIO NATAL FIM CONTRATO|NATAL FIM CONTRATO/i;
  // Subsídio de Alimentação com dias reais: "SUBS. ALIMENTACAO 22D"
  const RX_ALIM_DIAS       = /ALIMENTACAO\s+(\d+)\s*D\b/i;
  // Abono de Falhas seguido do valor
  const RX_FALHAS_VALOR    = /ABONO PARA FALHAS DE CAIXA\s+([\d.,]+)/i;

  /* ─────────────────────────────────────────────────────────────
     UTILITÁRIO: parse de valor monetário português
     ──────────────────────────────────────────────────────────── */
  function parsePT(str) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }

  /* ─────────────────────────────────────────────────────────────
     MOTOR 1 — Classificador de Tipo de Recibo
     ──────────────────────────────────────────────────────────── */
  function m1_tipo(texto) {
    if (RX_TIPO_ENC.test(texto))    return 'ENCERRAMENTO';
    if (RX_TIPO_FERIAS.test(texto)) return 'SUBSIDIO_FERIAS';
    return 'NORMAL';
  }

  /* ─────────────────────────────────────────────────────────────
     MOTOR 2 — Detector de Subsídios Proibidos na página Normal
     ──────────────────────────────────────────────────────────── */
  function m2_proibidos(texto) {
    var r = { alimentacao: false, falhas: false };
    var mA = texto.match(RX_ALIM_DIAS);
    if (mA && parseInt(mA[1], 10) > 0) r.alimentacao = true;
    var mF = texto.match(RX_FALHAS_VALOR);
    if (mF && parsePT(mF[1]) > 0)       r.falhas      = true;
    return r;
  }

  /* ─────────────────────────────────────────────────────────────
     MOTOR 3 — Verificador de Contexto Legítimo (anti-falso-positivo)
     ──────────────────────────────────────────────────────────── */
  function m3_liquidacaoLegitima(paginas) {
    return paginas.some(function(p) { return RX_LIQUIDACAO.test(p.text); });
  }

  /* ─────────────────────────────────────────────────────────────
     MOTOR 4 — Analisador de Estrutura do Par
     ──────────────────────────────────────────────────────────── */
  function m4_parCanonico(tipos) {
    return tipos.indexOf('NORMAL') !== -1 && tipos.indexOf('SUBSIDIO_FERIAS') !== -1
           && tipos.indexOf('ENCERRAMENTO') === -1;
  }

  /* ─────────────────────────────────────────────────────────────
     FISCALIZADOR — Árbitro dos 4 motores
     ──────────────────────────────────────────────────────────── */
  function rFiscalizar(pages) {
    var grouped = {};
    for (var i = 0; i < pages.length; i++) {
      var p   = pages[i];
      var key = p.detectedName || ('pagina_' + p.pageIndex);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    }

    var alertas = [];
    var nomes   = Object.keys(grouped);

    for (var n = 0; n < nomes.length; n++) {
      var nome = nomes[n];
      var pgs  = grouped[nome];

      if (pgs.length < 2)             continue; // apenas multi-recibo
      if (m3_liquidacaoLegitima(pgs)) continue; // excepção legítima

      var tipos = pgs.map(function(pg) { return m1_tipo(pg.text); });
      if (!m4_parCanonico(tipos))     continue; // par inesperado

      var normalPage = pgs[tipos.indexOf('NORMAL')];
      if (!normalPage)                continue;

      var prob = m2_proibidos(normalPage.text);
      if (!prob.alimentacao && !prob.falhas) continue;

      var itens = [];
      if (prob.alimentacao) itens.push('Subsídio de Alimentação');
      if (prob.falhas)      itens.push('Abono para Falhas de Caixa');

      alertas.push({
        nome : nome,
        msg  : 'Rever o recibo de ' + nome + ': recebeu Subsídio de Férias e o recibo Normal inclui ' + itens.join(' e ') + '.'
      });
    }

    return alertas;
  }

  /* ─────────────────────────────────────────────────────────────
     UI — Caixa de alertas (independente do #r-warnings-box)
     ──────────────────────────────────────────────────────────── */
  function rFiscInjectUI() {
    if (document.getElementById('r-fisc-box')) return;

    var box = document.createElement('div');
    box.id  = 'r-fisc-box';
    box.innerHTML = '<div class="fisc-title">⚠️ Fiscalização — Irregularidades Detectadas</div><ul id="r-fisc-list"></ul>';

    var anchor = document.getElementById('r-status-area');
    if (anchor) anchor.appendChild(box);
  }

  function rFiscMostrar(alertas) {
    var box  = document.getElementById('r-fisc-box');
    var list = document.getElementById('r-fisc-list');
    if (!box || !list) return;
    if (!alertas || !alertas.length) { box.style.display = 'none'; return; }
    list.innerHTML = alertas.map(function(a) {
      return '<li>' + escHtml(a.msg) + '</li>';
    }).join('');
    box.style.display = 'block';
  }

  function rFiscLimpar() {
    var box = document.getElementById('r-fisc-box');
    if (box) box.style.display = 'none';
  }

  /* ─────────────────────────────────────────────────────────────
     ANÁLISE IMEDIATA — dispara no upload, antes de qualquer acção
     ──────────────────────────────────────────────────────────── */
  async function rFiscAnalisar(file) {
    rFiscLimpar();
    if (!file) return;
    try {
      var pdfBytes = await file.arrayBuffer();
      var pages    = await rExtractPages(pdfBytes);
      var alertas  = rFiscalizar(pages);
      rFiscMostrar(alertas);
    } catch (err) {
      console.error('[Fiscalizador]', err);
    }
  }

  function rFiscObservarUpload() {
    var input = document.getElementById('r-input-pdf');
    var label = document.getElementById('r-label-pdf');

    // Selecção via clique
    if (input) {
      input.addEventListener('change', function(e) {
        var f = e.target.files[0];
        if (f) rFiscAnalisar(f);
      });
    }

    // Selecção via drag-and-drop
    if (label) {
      label.addEventListener('drop', function(e) {
        var f = e.dataTransfer && e.dataTransfer.files[0];
        if (f) rFiscAnalisar(f);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     BOOTSTRAP
     ──────────────────────────────────────────────────────────── */
  function rFiscBootstrap() {
    rFiscInjectUI();
    rFiscObservarUpload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rFiscBootstrap);
  } else {
    rFiscBootstrap();
  }

})();
