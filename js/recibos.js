// ══════════════════════════════════════════════════════════════
//  ADMIN: RECIBOS  —  v2  (senhas via Supabase, sem CSV)
// ══════════════════════════════════════════════════════════════

// ── Utilidades ────────────────────────────────────────────────
function rNormalize(str) {
  return str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function rSanitizeName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Detectar mes ──────────────────────────────────────────────
function rDetectMes() {
  const now = new Date(), day = now.getDate(), month = now.getMonth() + 1, year = now.getFullYear();
  if (month === 12 && day >= 10 && day <= 20) return `natal-${year}`;
  if (day <= 9) {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    return `${String(pm).padStart(2,'0')}-${py}`;
  }
  return `${String(month).padStart(2,'0')}-${year}`;
}

function rLoadConfig() {
  const mes = rDetectMes();
  localStorage.setItem('gh_mes', mes);
  rShowMesBadge(mes);
}

function rShowMesBadge(mes) {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  let label;
  if (mes.startsWith('natal-')) {
    label = `🎄 Subsídio de Natal ${mes.split('-')[1]}`;
  } else {
    const [mm, yyyy] = mes.split('-');
    label = `${MESES[parseInt(mm,10)-1] || mes} ${yyyy}`;
  }
  let badge = document.getElementById('r-mes-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'r-mes-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:8px 18px;background:#f4f4f4;border:1px solid #e0e0e0;border-radius:10px;font-size:.93rem;font-weight:600;color:#333;';
    const anchor = document.getElementById('r-label-pdf') || document.getElementById('r-status-msg');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor);
    else document.body.prepend(badge);
  }
  badge.innerHTML = `<span style="color:#888;font-weight:400;font-size:.82rem;">a processar</span><strong style="font-size:1.05em;">${label}</strong>`;
}

// ── Estado global ─────────────────────────────────────────────
let rPdfFile = null;
let rSenhasMap = new Map(); // nomeNorm → { nome_orig, senha }
let rPageMatches = [];      // [{ page, csvEntry, decision }]

// ── Cargar senhas desde Supabase ──────────────────────────────
async function rLoadSenhasFromSupabase() {
  try {
    const { data, error } = await sbClient
      .from('senhas_recibos')
      .select('nome, nome_orig, senha');
    if (error) throw error;
    rSenhasMap.clear();
    for (const row of data) {
      // Store with normalized key (uppercase, no accents)
      const key = rNormalize(row.nome.trim());
      rSenhasMap.set(key, { nome_orig: row.nome_orig || row.nome, senha: row.senha });
    }
    console.log('[recibos] senhas carregadas:', rSenhasMap.size, [...rSenhasMap.keys()].slice(0,3));
    rSetStatus(`senhas: ${rSenhasMap.size} carregadas de Supabase`);
    return true;
  } catch (e) {
    console.error('[recibos] erro ao carregar senhas:', e);
    rSetStatus('\u26a0\ufe0f Erro Supabase: ' + e.message);
    return false;
  }
}

// ── Guardar nueva senha en Supabase ──────────────────────────
async function rSaveSenhaToSupabase(nomeNorm, nomeOrig, senha) {
  try {
    const { error } = await sbClient.from('senhas_recibos').upsert({
      nome: nomeNorm,
      nome_orig: nomeOrig,
      senha: senha,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'nome' });
    if (error) throw error;
    rSenhasMap.set(nomeNorm, { nome_orig: nomeOrig, senha });
    return true;
  } catch (e) {
    console.error('[recibos] erro ao guardar senha:', e);
    return false;
  }
}

// ── Generar senha aleatoria estilo consistente (Xxx#99) ───────
function rGenerateSenha() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const specials = '#@&';
  const c1 = upper[Math.floor(Math.random() * upper.length)];
  const c2 = lower[Math.floor(Math.random() * lower.length)];
  const c3 = lower[Math.floor(Math.random() * lower.length)];
  const sp = specials[Math.floor(Math.random() * specials.length)];
  const d1 = digits[Math.floor(Math.random() * digits.length)];
  const d2 = digits[Math.floor(Math.random() * digits.length)];
  return `${c1}${c2}${c3}${sp}${d1}${d2}`;
}

// ── Setup upload PDF (ya no hay CSV) ─────────────────────────
function rSetupUpload() {
  const label  = document.getElementById('r-label-pdf');
  const input  = document.getElementById('r-input-pdf');
  const nameEl = document.getElementById('r-name-pdf');

  const handleFile = async (f) => {
    if (!f) return;
    rPdfFile = f;
    nameEl.textContent = f.name;
    await rOnPdfLoaded();
  };

  input.addEventListener('change', e => handleFile(e.target.files[0]));
  label.addEventListener('dragover',  e => { e.preventDefault(); label.classList.add('drag-over'); });
  label.addEventListener('dragleave', () => label.classList.remove('drag-over'));
  label.addEventListener('drop', e => {
    e.preventDefault(); label.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });
}

// ── Buscar senha con matching flexible ───────────────────────
function rFindSenha(detectedName) {
  if (!detectedName) return null;
  const dn = rNormalize(detectedName);
  // 1. Exact
  if (rSenhasMap.has(dn)) return { key: dn, ...rSenhasMap.get(dn) };
  // 2. Containment
  for (const [k, v] of rSenhasMap) {
    if (k.includes(dn) || dn.includes(k)) return { key: k, ...v };
  }
  // 3. All words match
  const words = dn.split(' ').filter(w => w.length > 2);
  if (words.length >= 2) {
    for (const [k, v] of rSenhasMap) {
      if (words.every(w => k.includes(w))) return { key: k, ...v };
    }
  }
  // 4. Most words match (tolerance for truncated names)
  if (words.length >= 2) {
    for (const [k, v] of rSenhasMap) {
      const matches = words.filter(w => k.includes(w)).length;
      if (matches >= Math.max(2, words.length - 1)) return { key: k, ...v };
    }
  }
  return null;
}

// ── Cuando se carga PDF: extraer + cruzar con Supabase ───────
async function rOnPdfLoaded() {
  rSetStatus('a consultar senhas em Supabase…');
  const panel = document.getElementById('r-senhas-panel');
  if (panel) panel.innerHTML = '<div class="r-panel-loading"><span class="r-spinner"></span> a carregar…</div>';

  const ok = await rLoadSenhasFromSupabase();
  if (!ok) {
    rSetStatus('\u26a0\ufe0f Erro ao carregar senhas de Supabase');
    if (panel) panel.innerHTML = '<div class="r-panel-empty">erro ao conectar com Supabase</div>';
    return;
  }

  rSetStatus('a extrair páginas do pdf…');
  const pdfBytes = await rPdfFile.arrayBuffer();
  const pages = await rExtractPages(pdfBytes);

  rPageMatches = pages.map(page => {
    const found = rFindSenha(page.detectedName);
    console.log('[recibos] pag', page.pageIndex, '| detectado:', page.detectedName, '| match:', found ? found.key : 'NONE');
    return {
      page,
      csvEntry: found ? { name: found.key, nome_orig: found.nome_orig, pwd: found.senha } : null,
      decision: null
    };
  });

  rSetStatus('');
  rRenderSenhasPanel();
  rCheckReadyToProcess();
}

// ── Render panel derecho ──────────────────────────────────────
function rRenderSenhasPanel() {
  const panel = document.getElementById('r-senhas-panel');
  if (!panel) return;

  if (!rPageMatches.length) {
    panel.innerHTML = '<div class="r-panel-empty">nenhuma página detectada</div>';
    return;
  }

  const withPwd  = rPageMatches.filter(m => m.csvEntry && m.csvEntry.pwd).length;
  const missing  = rPageMatches.filter(m => !m.csvEntry || !m.csvEntry.pwd).length;
  const pending  = rPageMatches.filter(m => !m.csvEntry?.pwd && m.decision === null).length;

  let rows = '';
  rPageMatches.forEach((m, i) => {
    const displayName = m.csvEntry
      ? (m.csvEntry.nome_orig || m.csvEntry.name)
      : (m.page.detectedName || `pág. ${m.page.pageIndex}`);
    const hasPwd = !!(m.csvEntry && m.csvEntry.pwd);

    let pwdCell    = '';
    let actionCell = '';

    if (hasPwd) {
      pwdCell    = `<span class="r-pwd-chip">${escHtml(m.csvEntry.pwd)}</span>`;
      actionCell = `<span class="r-badge r-badge-ok">✓</span>`;
    } else if (m.decision === 'nopwd') {
      pwdCell    = `<span class="r-pwd-none">sem senha</span>`;
      actionCell = `<span class="r-badge r-badge-nopwd">publicar</span>
                    <button class="r-btn-undo" onclick="rUndoDecision(${i})" title="desfazer">↩</button>`;
    } else if (m.decision === 'skip') {
      pwdCell    = `<span class="r-pwd-none">—</span>`;
      actionCell = `<span class="r-badge r-badge-skip">ignorar</span>
                    <button class="r-btn-undo" onclick="rUndoDecision(${i})" title="desfazer">↩</button>`;
    } else {
      // Sin senha y sin decisión
      pwdCell    = `<button class="r-btn-gerar" onclick="rGerarSenha(${i})" id="r-gerar-btn-${i}">gerar senha</button>`;
      actionCell = `<div class="r-decision-wrap">
                      <button class="r-btn-nopwd" onclick="rDecideNoPwd(${i})">sem senha</button>
                      <button class="r-btn-skip"  onclick="rDecideSkip(${i})">não publicar</button>
                    </div>`;
    }

    const rowClass = hasPwd ? 'r-row-ok' : (m.decision ? 'r-row-decided' : 'r-row-missing');
    rows += `
      <tr class="r-panel-row ${rowClass}" id="r-row-${i}">
        <td class="r-td-num">${i + 1}</td>
        <td class="r-td-name" title="${escHtml(displayName)}">${escHtml(displayName)}</td>
        <td class="r-td-pwd">${pwdCell}</td>
        <td class="r-td-action">${actionCell}</td>
      </tr>`;
  });

  const footerClass = pending > 0 ? 'r-panel-footer-warn' : 'r-panel-footer-ok';
  const footerMsg   = pending > 0
    ? `⚠ ${pending} colaboradora${pending > 1 ? 's' : ''} sem decisão`
    : `✓ tudo pronto — podes processar`;

  panel.innerHTML = `
    <div class="r-panel-header">
      <span class="r-panel-title">colaboradoras <span class="r-panel-count">${rPageMatches.length}</span></span>
      <div class="r-panel-stats">
        <span class="r-stat r-stat-ok">✓ ${withPwd}</span>
        ${missing > 0 ? `<span class="r-stat r-stat-warn">⚠ ${missing} sem senha</span>` : ''}
      </div>
    </div>
    <div class="r-panel-table-wrap">
      <table class="r-panel-table">
        <thead>
          <tr>
            <th class="r-th-num">#</th>
            <th>nome</th>
            <th>senha</th>
            <th>ação</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="r-panel-footer ${footerClass}">${footerMsg}</div>
  `;
}

// ── Generar senha nueva y guardar en Supabase ─────────────────
async function rGerarSenha(i) {
  const m   = rPageMatches[i];
  const btn = document.getElementById(`r-gerar-btn-${i}`);
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  const newPwd   = rGenerateSenha();
  const nomeNorm = m.page.detectedName || `PAGINA_${m.page.pageIndex}`;
  const nomeOrig = (m.csvEntry && m.csvEntry.nome_orig) || nomeNorm;

  const saved = await rSaveSenhaToSupabase(nomeNorm, nomeOrig, newPwd);
  if (!saved) {
    if (btn) { btn.textContent = 'erro — tentar novamente'; btn.disabled = false; }
    return;
  }

  rPageMatches[i].csvEntry = { name: nomeNorm, nome_orig: nomeOrig, pwd: newPwd };
  rPageMatches[i].decision = null;
  rRenderSenhasPanel();
}

// ── Decisiones ────────────────────────────────────────────────
function rDecideNoPwd(i) {
  const m = rPageMatches[i];
  m.decision = 'nopwd';
  if (!m.csvEntry) {
    const name = m.page.detectedName || `PAGINA_${m.page.pageIndex}`;
    m.csvEntry = { name, pwd: null };
  } else {
    m.csvEntry.pwd = null;
  }
  rRenderSenhasPanel();
  rCheckReadyToProcess();
}

function rDecideSkip(i) {
  rPageMatches[i].decision = 'skip';
  rRenderSenhasPanel();
  rCheckReadyToProcess();
}

function rUndoDecision(i) {
  rPageMatches[i].decision = null;
  if (rPageMatches[i].csvEntry) rPageMatches[i].csvEntry.pwd = null;
  rRenderSenhasPanel();
  rCheckReadyToProcess();
}

// ── Check si puede procesar ───────────────────────────────────
function rCheckReadyToProcess() {
  const btn     = document.getElementById('r-process-btn');
  if (!btn) return;
  const pending = rPageMatches.filter(m => !m.csvEntry?.pwd && m.decision === null).length;
  if (rPdfFile && rPageMatches.length > 0 && pending === 0) {
    btn.classList.add('show');
  } else {
    btn.classList.remove('show');
  }
}


    /* ── Header ── */
    .r-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
      flex-shrink: 0;
    }
    .r-panel-title {
      font-size: .78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: #555;
    }
    .r-panel-count {
      background: #e8e8e8;
      color: #555;
      border-radius: 20px;
      padding: 1px 7px;
      font-size: .72rem;
      font-weight: 600;
      margin-left: 5px;
    }
    .r-panel-stats { display: flex; gap: 8px; align-items: center; }
    .r-stat { font-size: .72rem; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
    .r-stat-ok   { background: #e8f5e9; color: #388e3c; }
    .r-stat-warn { background: #fff8e1; color: #f57f17; }

    /* ── Tabla scroll ── */
    .r-panel-table-wrap {
      overflow-y: auto;
      flex: 1;
    }
    .r-panel-table {
      width: 100%;
      border-collapse: collapse;
    }
    .r-panel-table thead th {
      position: sticky;
      top: 0;
      background: #f5f5f5;
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #888;
      padding: 7px 10px;
      border-bottom: 1px solid #e8e8e8;
      text-align: left;
      z-index: 1;
    }
    .r-th-num { width: 28px; text-align: center; }

    /* ── Filas ── */
    .r-panel-row td {
      padding: 8px 10px;
      border-bottom: 1px solid #f5f5f5;
      vertical-align: middle;
    }
    .r-panel-row:last-child td { border-bottom: none; }
    .r-row-ok      { background: #fff; }
    .r-row-missing { background: #fffdf5; }
    .r-row-decided { background: #fafafa; }

    .r-td-num  { color: #bbb; font-size: .72rem; text-align: center; width: 28px; }
    .r-td-name { font-size: .78rem; font-weight: 600; color: #333; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .r-td-pwd  { white-space: nowrap; }
    .r-td-action { white-space: nowrap; }

    /* ── Chips de senha ── */
    .r-pwd-chip {
      display: inline-block;
      font-family: 'SF Mono', 'Fira Mono', monospace;
      font-size: .75rem;
      font-weight: 600;
      color: #2e7d32;
      background: #e8f5e9;
      border: 1px solid #c8e6c9;
      border-radius: 6px;
      padding: 2px 8px;
      letter-spacing: .03em;
    }
    .r-pwd-none {
      color: #bbb;
      font-size: .75rem;
      font-style: italic;
    }

    /* ── Badges ── */
    .r-badge {
      display: inline-block;
      font-size: .7rem;
      font-weight: 700;
      border-radius: 20px;
      padding: 2px 8px;
    }
    .r-badge-ok    { background: #e8f5e9; color: #388e3c; }
    .r-badge-nopwd { background: #e3f2fd; color: #1565c0; }
    .r-badge-skip  { background: #f5f5f5; color: #999; }

    /* ── Botones de acción en fila ── */
    .r-btn-gerar {
      font-size: .72rem;
      font-weight: 600;
      color: #555;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 3px 9px;
      cursor: pointer;
      transition: background .15s, color .15s, border-color .15s;
      white-space: nowrap;
    }
    .r-btn-gerar:hover { background: #333; color: #fff; border-color: #333; }
    .r-btn-gerar:disabled { opacity: .5; cursor: wait; }

    .r-decision-wrap {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .r-btn-nopwd, .r-btn-skip {
      font-size: .68rem;
      font-weight: 600;
      border-radius: 5px;
      padding: 2px 7px;
      cursor: pointer;
      transition: background .15s, color .15s;
      border: 1px solid;
      white-space: nowrap;
    }
    .r-btn-nopwd {
      background: #e3f2fd;
      color: #1565c0;
      border-color: #bbdefb;
    }
    .r-btn-nopwd:hover { background: #1565c0; color: #fff; border-color: #1565c0; }
    .r-btn-skip {
      background: #f5f5f5;
      color: #888;
      border-color: #ddd;
    }
    .r-btn-skip:hover { background: #888; color: #fff; border-color: #888; }

    /* ── Botón deshacer ↩ ── */
    .r-btn-undo {
      font-size: .72rem;
      background: none;
      border: none;
      color: #bbb;
      cursor: pointer;
      padding: 1px 5px;
      border-radius: 4px;
      transition: color .15s, background .15s;
      margin-left: 3px;
      vertical-align: middle;
    }
    .r-btn-undo:hover { background: #eee; color: #555; }

    /* ── Footer ── */
    .r-panel-footer {
      padding: 9px 16px;
      font-size: .75rem;
      font-weight: 600;
      border-top: 1px solid #f0f0f0;
      flex-shrink: 0;
    }
    .r-panel-footer-ok   { background: #e8f5e9; color: #2e7d32; }
    .r-panel-footer-warn { background: #fff8e1; color: #f57f17; }

    /* ── Loading / empty ── */
    .r-panel-loading, .r-panel-empty {
      padding: 40px 20px;
      text-align: center;
      color: #aaa;
      font-size: .82rem;
    }
    .r-spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid #ddd;
      border-top-color: #888;
      border-radius: 50%;
      animation: r-spin .7s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    @keyframes r-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

// ── Procesar recibos ──────────────────────────────────────────
document.getElementById('r-process-btn').addEventListener('click', rProcessRecibos);

async function rProcessRecibos() {
  const btn = document.getElementById('r-process-btn');
  btn.disabled = true;
  document.getElementById('r-conferir-fixed').classList.remove('show');
  rSetStatus('a encriptar e gerar recibos…');
  rHideWarnings();

  try {
    const grouped = {};
    for (const m of rPageMatches) {
      if (m.decision === 'skip') continue;
      if (!m.csvEntry) continue;
      const key = m.csvEntry.name;
      if (!grouped[key]) grouped[key] = { csvEntry: m.csvEntry, pages: [] };
      grouped[key].pages.push(m.page);
    }

    if (!Object.keys(grouped).length) {
      rSetStatus('nenhum recibo para gerar.'); btn.disabled = false; return;
    }

    const keys = Object.keys(grouped);
    const fileList = [];
    for (let ki = 0; ki < keys.length; ki++) {
      const { csvEntry, pages: grpPages } = grouped[keys[ki]];
      rSetProgressDetail(`a encriptar: ${ki + 1}/${keys.length} — ${csvEntry.name}`);
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

    const mes = rDetectMes();
    localStorage.setItem('gh_mes', mes);
    rSetStatus('a enviar pdfs para supabase…');
    rShowProgress();
    const uploadResults = [];
    for (let i = 0; i < fileList.length; i++) {
      const r = fileList[i];
      rSetProgress(Math.round((i / (fileList.length + 1)) * 100));
      rSetProgressDetail(`a enviar: ${i + 1}/${fileList.length} — ${r.name}`);
      const ok = await rUploadToSupabase(mes, r.filename, r.bytes);
      uploadResults.push({ ...r, uploaded: ok });
    }

    rSetStatus('a atualizar index.json…');
    const indexData = { mes,
      ficheiros: uploadResults.map(r => r.filename),
      dados: uploadResults.map(r => ({ filename: r.filename, name: r.name, mes }))
    };
    const indexBlob = new Blob([JSON.stringify(indexData, null, 2)], { type: 'application/json' });
    const indexRes = await sbClient.storage.from('recibos').update('index.json', indexBlob, { upsert: true, contentType: 'application/json' });
    if (indexRes.error) {
      rSetStatus('⚠️ Erro ao atualizar index.json: ' + indexRes.error.message);
      btn.disabled = false; return;
    }

    rSetProgress(100); rHideProgress();
    rSetStatus(`✓ ${uploadResults.filter(r => r.uploaded).length} recibos enviados (${mes})`);
    rSetProgressDetail('');
    rRenderResults(uploadResults, true);
    document.getElementById('r-conferir-fixed').classList.add('show');
  } catch (err) {
    console.error(err); rSetStatus('erro: ' + err.message); rSetProgressDetail('');
  }
  btn.disabled = false;
}

// ── Helpers UI ────────────────────────────────────────────────
function rRenderResults(results) { window._recibosData = results; }
function rShowWarnings(names) {
  const box = document.getElementById('r-warnings-box');
  const list = document.getElementById('r-warnings-list');
  if (!box || !list) return;
  list.innerHTML = names.map(n => `<li>${escHtml(n)}</li>`).join('');
  box.style.display = 'block';
}
function rHideWarnings() {
  const box = document.getElementById('r-warnings-box');
  const list = document.getElementById('r-warnings-list');
  if (box)  box.style.display = 'none';
  if (list) list.innerHTML = '';
}
function rShowProgress() { document.getElementById('r-upload-progress').style.display = 'block'; }
function rHideProgress() { document.getElementById('r-upload-progress').style.display = 'none'; rSetProgress(0); }
function rSetProgress(pct) { document.getElementById('r-upload-progress-bar').style.width = pct + '%'; }
function rSetStatus(msg)   { document.getElementById('r-status-msg').textContent = msg; }
function rSetProgressDetail(msg) { const el = document.getElementById('r-progress-detail'); if (el) el.textContent = msg; }

document.getElementById('r-conferir-btn').addEventListener('click', () => openRecibosOverlay());

// ── Extraer páginas PDF ───────────────────────────────────────
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
    const tokens  = rawText.split(/\s+/);
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

// ── Encriptar PDF (sin cambios) ───────────────────────────────
async function rEncryptPDF(pageBytes, password) {
  if (!password) return pageBytes;
  try { return rEncryptPDFpureJS(pageBytes, password); }
  catch(e) { console.warn('Encrypt failed:', e); return pageBytes; }
}

function rEncryptPDFpureJS(rawInput, userPassword) {
  const raw = rawInput instanceof Uint8Array ? rawInput : rawInput instanceof ArrayBuffer ? new Uint8Array(rawInput) : new Uint8Array(rawInput.buffer, rawInput.byteOffset, rawInput.byteLength);
  const head = new TextDecoder('latin1').decode(raw.slice(0, Math.min(4096, raw.length)));
  if (!head.startsWith('%PDF')) throw new Error('Not a PDF');
  if (head.includes('/Encrypt')) return rawInput;
  const PAD=[0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A];
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

// ── Init ──────────────────────────────────────────────────────
rSetupUpload();
rLoadConfig();
