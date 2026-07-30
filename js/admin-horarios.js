// ══ ADMIN HORÁRIOS TAB ══
(function() {
  var hBlocks = null;
  var hCurrentStore = null;

  document.getElementById('h-store-select').addEventListener('change', function() {
    var store = this.value;
    if (!store) return;
    hCurrentStore = store;
    document.getElementById('h-week-select').style.display = 'none';
    document.getElementById('h-week-select').innerHTML = '';
    document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">a carregar…</div>';
    hBlocks = null;
    loadHorarios(store);
  });

  document.getElementById('h-week-select').addEventListener('change', function() {
    if (!hBlocks) return;
    hRenderWeek(hBlocks.filtered, parseInt(this.value));
  });

  // ── UI: dropdown "loja" escondido, substituído por 2 botões (Porto Santo /
  // Funchal) — sem tocar no index.html. O <select> mantém-se como fonte de
  // verdade (só oculto), disparando o seu próprio 'change' já ligado acima,
  // para reaproveitar 100% da lógica existente sem duplicação. ──
  (function hSetupStoreButtons() {
    var host = document.getElementById('h-store-selector');
    var sel = document.getElementById('h-store-select');
    if (!host || !sel) return;

    if (!sel.querySelector('option[value="funchal"]')) {
      var op = document.createElement('option');
      op.value = 'funchal';
      op.textContent = 'Funchal';
      sel.appendChild(op);
    }
    sel.style.display = 'none';
    var oldLabel = host.querySelector('label');
    if (oldLabel) oldLabel.style.display = 'none';

    var wrap = document.createElement('div');
    wrap.id = 'h-store-buttons';
    wrap.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

    function paintButtons() {
      Array.prototype.forEach.call(wrap.children, function(b) {
        var active = b.dataset.storeValue === sel.value;
        b.style.background = active ? '#111' : '#fff';
        b.style.color = active ? '#fff' : '#111';
        b.style.borderColor = active ? '#111' : '#ccc';
      });
    }

    [['porto santo', 'Porto Santo'], ['funchal', 'Funchal']].forEach(function(pair) {
      var value = pair[0], label = pair[1];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.storeValue = value;
      btn.style.cssText = 'padding:10px 24px;font-size:.8rem;font-weight:700;letter-spacing:.03em;cursor:pointer;border-radius:10px;font-family:inherit;background:#fff;color:#111;border:1px solid #ccc;transition:background .15s,color .15s,border-color .15s;';
      btn.addEventListener('click', function() {
        sel.value = value;
        sel.dispatchEvent(new Event('change'));
      });
      wrap.appendChild(btn);
    });
    host.insertBefore(wrap, sel);
    sel.addEventListener('change', paintButtons);
    paintButtons();
  })();

  // ── 3 caixas de estatísticas (ativas agora / folga-férias / próximo
  // início) removidas do painel admin — #h-dashboard escondido, e deixa de
  // se chamar window._hDashboard a partir daqui. ──
  (function hHideDashboardBoxes() {
    var dash = document.getElementById('h-dashboard');
    if (dash) dash.style.display = 'none';
  })();

  // ── "aviso" — trigger movido para aqui (deixa de existir em shared.js),
  // acompanha o botão de loja ativo (Porto Santo ou Funchal). ──
  (function hSetupAvisoButton() {
    var host = document.getElementById('h-store-selector');
    var sel = document.getElementById('h-store-select');
    if (!host || !sel) return;
    function sync() {
      var btn = document.getElementById('hav-adm-open-btn');
      var loja = (sel.value === 'porto santo' || sel.value === 'funchal') ? sel.value : null;
      if (loja) {
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'hav-adm-open-btn';
          btn.type = 'button';
          btn.style.cssText = 'margin-left:8px;padding:7px 14px;font-size:.72rem;font-weight:700;letter-spacing:.04em;cursor:pointer;border-radius:8px;font-family:inherit;background:#111!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border:1px solid #111!important;';
          host.appendChild(btn);
        }
        btn.textContent = '📢 aviso ' + loja;
        btn.onclick = function() { if (window._hAvisoAdmin) window._hAvisoAdmin.open(loja); };
      } else if (btn) {
        btn.remove();
      }
    }
    sel.addEventListener('change', sync);
    sync();
  })();

  async function loadHorarios(store) {
    var isFunchal = (store === 'funchal');
    const csvUrl = isFunchal
      ? 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/FUNCHAL.csv'
      : 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/datosfnc.csv';
    let csvText = '';
    try {
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      csvText = await res.text();
    } catch(err) {
      document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">erro: ' + err.message + '</div>';
      return;
    }

    const parsed = Papa.parse(csvText, {skipEmptyLines: false});
    let rows = parsed.data.map(r => r.map(cell => (cell == null ? '' : String(cell).trim())));
    const allBlocks = [];
    let cur = [];
    rows.forEach(r => {
      if (r.every(cell => cell === '')) { if (cur.length) { allBlocks.push(cur); cur = []; } }
      else cur.push(r);
    });
    if (cur.length) allBlocks.push(cur);

    let filtered;
    if (isFunchal) {
      // FUNCHAL.csv contém só os blocos desta loja unificada (Mezka Funchal +
      // Parfois Arcadas, várias semanas intercaladas) — usar tudo tal como
      // vem, exatamente como o dashboard de empregadas (loadData/shared.js).
      filtered = allBlocks;
    } else {
      const nameMapping = {
        'porto santo': 'porto santo'
      };
      const key = nameMapping[store];
      filtered = allBlocks.filter(b => (b[0][0] || '').toLowerCase() === key);
    }
    if (!filtered.length) {
      document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">sem dados para esta loja</div>';
      return;
    }

    // ── PORTO SANTO: load week-specific files (porto_s17.csv, porto_s18.csv...) ──
    if (store === 'porto santo') {
      const BASE_DATE = new Date('2026-01-05T00:00:00');
      const usedWeeks = new Set();
      const blockPromises = filtered.map(async block => {
        let blockDate = null;
        for (let i=0;i<block.length&&!blockDate;i++)
          for (let c=1;c<block[i].length&&!blockDate;c++)
            if (block[i][c]&&/^\d{2}\/\d{2}\/\d{4}$/.test(block[i][c])) blockDate=block[i][c];
        if (!blockDate) return block;
        const hasData = block.some(r=>{
          const f=(r[0]||'').trim().toUpperCase();
          if (['PORTO SANTO','SHANA','MEZKA MERCADO','MEZKA AVENIDA','MAXX'].includes(f)) return false;
          if (r[1]&&/^\d{2}\/\d{2}\/\d{4}$/.test(r[1])) return false;
          return f!==''&&r.slice(1).some(c=>c&&c!=='');
        });
        if (hasData) return block;
        const p=blockDate.split('/');
        const weekNum=Math.round((new Date(+p[2],+p[1]-1,+p[0])-BASE_DATE)/(7*86400000))+1;
        if (weekNum<17) return block;
        if (usedWeeks.has(weekNum)) return null;
        usedWeeks.add(weekNum);
        try {
          const url='https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/porto_s'+weekNum+'.csv?t='+Date.now();
          const res=await fetch(url);
          if (!res.ok) return block;
          const text=await res.text();
          const flat=Papa.parse(text,{skipEmptyLines:false}).data.map(r=>r.map(c=>(c==null?'':String(c).trim()))).filter(r=>!r.every(c=>c===''));
          return flat.length?flat:block;
        } catch(e){return block;}
      });
      filtered=(await Promise.all(blockPromises)).filter(b=>b!==null);
    }

    hBlocks = { filtered };

    // Build week selector. Para Funchal, cada bloco é UMA loja numa ÚNICA
    // semana (Mezka Funchal e Arcadas vêm como blocos SEPARADOS que partilham
    // a mesma etiqueta de semana em block[1][0]) — window._hRender.funchal já
    // agrupa por essa etiqueta sozinho a partir de UM índice qualquer do
    // grupo, mas o seletor de semanas não pode mostrar uma entrada por bloco
    // (mostraria a mesma semana duplicada, uma vez por loja). Por isso aqui
    // deduplicamos por semanaKey, guardando o índice do primeiro bloco de
    // cada semana como "representante" desse grupo. Para as restantes lojas
    // o comportamento é idêntico ao anterior (1 opção por bloco).
    const weekSel = document.getElementById('h-week-select');
    weekSel.innerHTML = '';
    let weekGroups;
    if (isFunchal) {
      weekGroups = [];
      const seen = new Set();
      filtered.forEach((block, i) => {
        const key = (block[1] && block[1][0]) || ('#' + i);
        if (seen.has(key)) return;
        seen.add(key);
        weekGroups.push(i);
      });
    } else {
      weekGroups = filtered.map((_, i) => i);
    }
    weekGroups.forEach((rawIndex, groupIdx) => {
      const op = document.createElement('option');
      op.value = rawIndex;
      op.textContent = 'SEMANA ' + (groupIdx + 1);
      weekSel.appendChild(op);
    });
    weekSel.style.display = weekGroups.length > 1 ? 'inline-block' : 'none';

    // Auto-select current week — procura só entre os representantes de cada
    // grupo, para o valor escolhido corresponder sempre a uma opção real do
    // seletor (window._hRender.funchal agrupa a partir de QUALQUER índice da
    // mesma semana, por isso não importa qual dos blocos do grupo se usa).
    const representativeBlocks = weekGroups.map(i => filtered[i]);
    const startGroupIdx = hFindCurrentWeek(representativeBlocks);
    const startWeek = weekGroups[startGroupIdx];
    weekSel.value = startWeek;
    hRenderWeek(filtered, startWeek);
  }

  function hFindCurrentWeek(blocks) {
    const hoy = new Date();
    for (let i = 0; i < blocks.length; i++) {
      const h2 = blocks[i][1]; if (!h2) continue;
      for (let col = 1; col < h2.length; col++) {
        const d = h2[col]; if (!d) continue;
        const parts = d.split('/');
        if (parts.length !== 3) continue;
        const dateObj = new Date(+parts[2], +parts[1]-1, +parts[0]);
        if (dateObj.toDateString() === hoy.toDateString()) return i;
      }
    }
    return 0;
  }

  // active counter interval handle
  var hActiveInterval = null;

  // ── EDIT BUTTON (só Porto Santo — mantido exatamente como estava) ──
  function hShowEditButton(filtered, index) {
    const existing = document.getElementById('h-edit-btn');
    if (existing) existing.remove();
    if (hCurrentStore !== 'porto santo') return;
    const block = filtered[index];
    if (!block) return;

    // Only show for weeks >= 27/04/2026
    let blockDate = null;
    for (let i = 0; i < block.length && !blockDate; i++)
      for (let c = 1; c < block[i].length && !blockDate; c++)
        if (block[i][c] && /^\d{2}\/\d{2}\/\d{4}$/.test(block[i][c]))
          blockDate = block[i][c];
    if (!blockDate) return;
    const parts = blockDate.split('/');
    const d = new Date(+parts[2], +parts[1]-1, +parts[0]);
    if (d < new Date(2026, 3, 27)) return;

    const btn = document.createElement('button');
    btn.id = 'h-edit-btn';
    btn.textContent = '✏ Editar horário';
    btn.style.cssText = 'margin:10px auto 0 !important;display:block !important;padding:8px 20px !important;font-size:.72rem !important;font-weight:700 !important;letter-spacing:.08em !important;text-transform:uppercase !important;cursor:pointer !important;border-radius:6px !important;font-family:inherit !important;background:#111 !important;color:#fff !important;-webkit-text-fill-color:#fff !important;border:1px solid #111 !important;';
    btn.onmouseover = () => btn.style.setProperty('background','#333','important');
    btn.onmouseout  = () => btn.style.setProperty('background','#111','important');
    btn.addEventListener('click', () => {
      window._ghLoadPortoWeek = parts[2] + '-' + parts[1] + '-' + parts[0];
      const gBtn = document.querySelector('.tab-btn[data-tab="gerador"]') || document.querySelector('.drawer-tab-btn[data-tab="gerador"]');
      if (gBtn) gBtn.click();
    });
    document.getElementById('h-table-area').appendChild(btn);
  }

  function hRenderWeek(filtered, index) {
    if (!window._hRender) return;
    const area = document.getElementById('h-table-area');
    area.innerHTML = '';

    const real = document.getElementById('table-container');
    if (real) real.setAttribute('id', 'table-container-bak');

    const temp = document.createElement('div');
    temp.id = 'table-container';
    temp.style.cssText = 'display:block;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;';
    area.appendChild(temp);

    if (hCurrentStore === 'funchal') {
      window._hRender.funchal(filtered, index);
    } else {
      const firstCell = (filtered[index][0][0] || '').trim().toLowerCase();
      if (firstCell === 'porto santo') {
        window._hRender.porto(filtered, index);
      } else {
        window._hRender.table(filtered, index);
      }
    }

    temp.removeAttribute('id');
    if (real) real.setAttribute('id', 'table-container');

    hUpdateActive(filtered, index);
    hShowEditButton(filtered, index);
    if (hActiveInterval) clearInterval(hActiveInterval);
    hActiveInterval = setInterval(function() {
      hUpdateActive(filtered, index);
    }, 60000);
  }

  function hUpdateActive(filtered, index) {
    const rows = filtered[index];
    if (!rows) return;
    const header = rows[1] || [];
    const today = new Date();
    let todayCol = -1;
    for (let col = 1; col < header.length; col++) {
      const d = header[col]; if (!d) continue;
      const parts = d.split('/');
      if (parts.length !== 3) continue;
      const dt = new Date(+parts[2], +parts[1]-1, +parts[0]);
      if (dt.toDateString() === today.toDateString()) { todayCol = col; break; }
    }
    let count = 0;
    if (todayCol > 0) {
      const dataRows = rows.slice(2);
      const schedules = [];
      dataRows.forEach(function(row) {
        const val = (row[todayCol] || '').trim();
        if (val) schedules.push(val);
      });
      schedules.forEach(function(sched) {
        if (window._hRender && hIsNowInSchedule(sched)) count++;
      });
    }
    const bar   = document.getElementById('h-active-bar');
    const badge = document.getElementById('h-active-badge');
    const text  = document.getElementById('h-active-text');
    if (!bar) return;
    bar.style.display = 'flex';
    text.textContent = count === 1 ? '1 pessoa ativa agora' : count + ' pessoas ativas agora';
    if (count === 0) { badge.classList.add('zero'); text.textContent = 'nenhuma pessoa ativa agora'; }
    else { badge.classList.remove('zero'); }
  }

  function hIsNowInSchedule(schedule) {
    const now = new Date();
    const segments = schedule.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < segments.length; i++) {
      const parts = segments[i].split('-');
      if (parts.length < 2) continue;
      const start = parts[0].trim(); const end = parts[1].trim();
      const sh = parseInt(start.split(':')[0]); const sm = parseInt(start.split(':')[1] || 0);
      const eh = parseInt(end.split(':')[0]);   const em = parseInt(end.split(':')[1] || 0);
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em);
      if (now >= s && now <= e) return true;
    }
    return false;
  }
})();
