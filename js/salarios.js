// ── Salários: estilos do botão de cópia por célula ──
(function(){
  const sid = 's-liq-copy-styles';
  if (document.getElementById(sid)) return;
  const st = document.createElement('style');
  st.id = sid;
  st.textContent = [
    // Coluna de vencimento líquido: largura dinâmica ao conteúdo
    '#s-salary-table th:last-child, #s-salary-table td:last-child { width:1%; white-space:nowrap; }',

    '#s-salary-table tbody td:last-child { cursor:pointer; user-select:none; transition:background .15s, color .15s; }',
    '#s-salary-table tbody td:last-child:hover { background:#f0f0f0 !important; color:#000000 !important; }',
    '.s-liq-cell { display:inline-flex; align-items:center; gap:5px; width:100%; justify-content:flex-end; color:inherit; }',
    '.s-liq-check { display:none; flex-shrink:0; }',

    // Botão de reset
    '#s-reset-btn { display:none; margin:0 auto 24px auto; width:48px; height:48px; border-radius:50%; border:2px solid #d0d0d0; background:#fff; cursor:pointer; color:#888; font-size:22px; align-items:center; justify-content:center; transition:all .2s; }',
    '#s-reset-btn:hover { border-color:#555; color:#222; transform:rotate(-30deg); }',
    '#s-reset-btn.visible { display:flex; }',
    '#s-salary-table tbody tr.s-row-copied td { background:#1a1a1a !important; color:#ffffff !important; font-size:1.04em; letter-spacing:0.01em; transition:background .2s, color .2s; }',
    '#s-salary-table tbody tr.s-row-copied td * { color:#ffffff !important; }',
    '#s-salary-table tbody tr.s-row-copied:hover td { background:#2e2e2e !important; }',
    '#s-salary-table tbody tr.s-row-copied .s-liq-check { display:inline-block !important; color:#7ecfc0 !important; }',

    // ── Alertas de erros contabilísticos ──
    '.s-err-badge { display:inline-flex; align-items:center; gap:4px; margin-left:7px; padding:1px 7px 1px 5px; border-radius:20px; font-size:0.7em; font-weight:700; letter-spacing:0.03em; vertical-align:middle; white-space:nowrap; cursor:default; transition:opacity .15s; }',
    '.s-err-badge svg { flex-shrink:0; }',
    '.s-err-red  { background:#fff0f0; color:#c0392b; border:1px solid #f5c6c6; }',
    '.s-err-yellow { background:#fffbf0; color:#b07d00; border:1px solid #f0dfa0; }',
    '#s-salary-table tbody tr.s-row-copied .s-err-red    { background:#5a1a1a; color:#f5a0a0; border-color:#7a2020; }',
    '#s-salary-table tbody tr.s-row-copied .s-err-yellow { background:#4a3a00; color:#f0d060; border-color:#7a6000; }',
    '#s-errors-summary { display:flex; align-items:flex-start; gap:10px; margin:0 0 18px 0; padding:14px 18px; border-radius:10px; background:#fff8f8; border:1px solid #f0d0d0; font-size:0.88em; line-height:1.55; }',
    '#s-errors-summary.has-yellow { background:#fffcf2; border-color:#f0e4a0; }',
    '#s-errors-summary-icon { font-size:1.5em; flex-shrink:0; margin-top:1px; }',
    '#s-errors-summary ul { margin:4px 0 0 0; padding:0 0 0 16px; }',
    '#s-errors-summary li { margin-bottom:2px; }',
    '#s-errors-summary strong { font-weight:700; }',
  ].join('\n');
  document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════
//  ADMIN: SALÁRIOS
// ══════════════════════════════════════════════════════════════
let sTableData = [];

const sUploadLabel = document.getElementById('s-upload-label');

// Crear e insertar botón de reset justo después del upload label
const sResetBtn = document.createElement('button');
sResetBtn.id = 's-reset-btn';
sResetBtn.title = 'Carregar novo ficheiro';
sResetBtn.innerHTML = '↺';
sUploadLabel.parentNode.insertBefore(sResetBtn, sUploadLabel.nextSibling);

sResetBtn.addEventListener('click', () => {
  // Resetear estado
  sTableData = [];
  sCopiedRow = null;
  sCopyRowTimer = null;
  document.getElementById('s-file-name').innerHTML = '';
  document.getElementById('s-status-msg').textContent = '';
  document.getElementById('s-results-wrap').innerHTML = '';
  document.getElementById('s-file-input').value = '';
  // Mostrar upload, ocultar reset
  sUploadLabel.style.display = '';
  sResetBtn.classList.remove('visible');
  // Quitar clases de estado cargado
  document.getElementById('tab-salarios').classList.remove('s-loaded');
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

// Extrai o mês e ano do nome do ficheiro e formata para exibição
function sFormatFileName(filename) {
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  // Tenta apanhar padrões: MMAAAA, MMYYYY, MM2025, 042026, etc.
  const m = filename.match(/(\d{2})(\d{4})/);
  if (m) {
    const mes = parseInt(m[1], 10);
    const ano = m[2];
    if (mes >= 1 && mes <= 12) {
      const nomeMes = MESES[mes - 1].charAt(0).toUpperCase() + MESES[mes - 1].slice(1);
      return `<strong style="font-size:1.18em;letter-spacing:0.01em;">${nomeMes} ${ano}</strong>`;
    }
  }
  // Fallback: nome original
  return `<span style="font-size:1.05em;">${filename}</span>`;
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
    // O count correto é o de sTableData após o filtro em sRenderTable
    const countFinal = sTableData.length;
    document.getElementById('s-status-msg').textContent = countFinal + ' colaboradores encontrados';
    // Ocultar cuadro de upload, mostrar botón de reset
    sUploadLabel.style.display = 'none';
    sResetBtn.classList.add('visible');
    // Switch salários tab to page-level scroll
    document.getElementById('s-upload-label').classList.add('loaded');
    document.getElementById('tab-salarios').classList.add('s-loaded');
    const adminApp = document.getElementById('admin-app');
    adminApp.classList.add('s-loaded');
    adminApp.dataset.sLoaded = '1';
    document.body.style.overflow = 'auto';
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
    // numberTokens index map (14 colunas numéricas do PDF):
    // 0:bruto 1:alimentação 2:férias 3:natal 4:outrosAbonos 5:totalAbonos
    // 6:faltas 7:outrosDesc 8:IRS 9:sobretaxa 10:segSocial 11:descEntid 12:totalDesc 13:líquido
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
    document.getElementById('s-results-wrap').innerHTML = '<p style="text-align:center;color:#888;font-weight:600;margin-top:20px;">nenhum colaborador com vencimento positivo.</p>';
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
    // Badge de erro
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
  document.getElementById('s-results-wrap').innerHTML = html;
}

// Timeout handle para limpar o highlight anterior
let sCopyRowTimer = null;
let sCopiedRow = null;

function sCopyLiquido(td) {
  const val = td.getAttribute('data-val');
  const copy = (navigator.clipboard && navigator.clipboard.writeText)
    ? navigator.clipboard.writeText(val)
    : Promise.reject();
  copy.catch(() => {
    const ta = document.createElement('textarea');
    ta.value = val; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });

  // Remove highlight da fila anterior
  if (sCopiedRow) sCopiedRow.classList.remove('s-row-copied');
  if (sCopyRowTimer) { clearTimeout(sCopyRowTimer); sCopyRowTimer = null; }

  const row = td.closest('tr');
  if (row) { row.classList.add('s-row-copied'); sCopiedRow = row; }
}
