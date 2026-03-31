// ── Salários: estilos do botão de cópia por célula ──
(function(){
  const sid = 's-liq-copy-styles';
  if (document.getElementById(sid)) return;
  const st = document.createElement('style');
  st.id = sid;
  st.textContent = [
    '.s-liq-cell { display:inline-flex; align-items:center; gap:6px; }',
    '.s-liq-copy-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; padding:0; border:1px solid #d0d0d0; background:transparent; cursor:pointer; color:#aaa; border-radius:4px; flex-shrink:0; transition:all .15s; vertical-align:middle; }',
    '.s-liq-copy-btn:hover { color:#000; background:#f0f0f0; border-color:#bbb; }',
    '.s-liq-copy-btn.s-liq-copy-ok { color:#4A7C6F; border-color:#4A7C6F; background:#f0faf8; }',
  ].join('\n');
  document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════
//  ADMIN: SALÁRIOS
// ══════════════════════════════════════════════════════════════
let sTableData = [];

const sUploadLabel = document.getElementById('s-upload-label');
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

async function sHandleFile(file) {
  document.getElementById('s-file-name').textContent  = file.name;
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
    document.getElementById('s-status-msg').textContent = rows.length + ' colaboradores encontrados';
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
    results.push({ code: tokens[0], name: nameTokens.join(' '), liquido: numberTokens[numberTokens.length - 1] });
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
  const total = filtered.reduce((sum, r) => {
    const n = parseFloat(r.liquido.replace(/\./g, '').replace(',', '.'));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  let html = `<table id="s-salary-table"><thead><tr>
    <th class="row-num">#</th><th>nome</th><th>vencimento líquido</th>
  </tr></thead><tbody>`;
  filtered.forEach((r, i) => {
    const cleanVal = r.liquido.replace(/\.(?=\d{3},)/, '');
    html += `<tr><td class="row-num">${i + 1}</td><td>${escHtml(r.name)}</td><td><span class="s-liq-cell"><button class="s-liq-copy-btn" onclick="sCopyLiquido(this)" data-val="${escHtml(cleanVal)}" title="Copiar valor"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>${escHtml(cleanVal)}</span></td></tr>`;
  });
  html += `</tbody><tfoot><tr>
    <td class="row-num"></td><td>total</td>
    <td>${total.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
  </tr></tfoot></table>`;
  document.getElementById('s-results-wrap').innerHTML = html;
}

function sCopyLiquido(btn) {
  const val = btn.getAttribute('data-val');
  const copy = (navigator.clipboard && navigator.clipboard.writeText)
    ? navigator.clipboard.writeText(val)
    : Promise.reject();
  copy.catch(() => {
    const ta = document.createElement('textarea');
    ta.value = val; ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });
  const orig = btn.innerHTML;
  btn.classList.add('s-liq-copy-ok');
  btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  setTimeout(() => { btn.classList.remove('s-liq-copy-ok'); btn.innerHTML = orig; }, 1000);
}
