// ══ ADMIN HORÁRIOS TAB ══
(function() {
  var hBlocks = null;
  var hCurrentStore = null;
  var hWeekIndex = 0;

  document.getElementById('h-store-select').addEventListener('change', function() {
    var store = this.value;
    if (!store) return;
    hCurrentStore = store;
    document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">a carregar…</div>';
    var nav = document.getElementById('h-week-nav');
    if (nav) nav.style.display = 'none';
    hBlocks = null;
    loadHorarios(store);
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
        // index.html tem uma regra global "button{color:#000!important}" —
        // só setProperty(...,'important') consegue vencê-la quando o botão
        // fica ativo (fundo escuro, precisa de letra branca legível).
        b.style.background = active ? '#111' : '#fff';
        b.style.setProperty('color', active ? '#fff' : '#111', 'important');
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

  // ── Caixa + barra de horários: calco exato de #wz-hor-modal-box/
  // #wz-hor-modal-bar/#wz-week-nav/#wz-week-right/#wz-week-label/
  // #wz-hor-modal-body do modal de horários das empregadas (index.html) —
  // mesma largura (min(95vw,1080px)), mesmo padding, mesma barra com setas
  // centradas e "semana N" à direita. Só os ids mudam (h-hor-*/h-week-*
  // em vez de wz-hor-*/wz-week-*), para nunca colidir com esse modal, que
  // existe sempre na mesma página (dashboard de empregadas). #h-table-area
  // (elemento real do index.html) é movido para dentro desta caixa — todas
  // as referências a getElementById('h-table-area') continuam válidas,
  // porque o nó é o mesmo, só muda de posição na árvore. ──
  (function hSetupHorBox() {
    var host = document.getElementById('h-store-selector');
    var tableArea = document.getElementById('h-table-area');
    var oldSel = document.getElementById('h-week-select');
    if (!host || !tableArea) return;
    if (oldSel) oldSel.style.display = 'none';

    if (!document.getElementById('h-hor-box-styles')) {
      var s = document.createElement('style');
      s.id = 'h-hor-box-styles';
      s.textContent = [
        '#h-hor-box{width:min(95vw,1080px);margin:0 auto;background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,.06);}',
        '#h-hor-bar{position:relative;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #efefef;background:#fff;border-radius:20px 20px 0 0;}',
        '#h-hor-bar>span{flex:1;}',
        '#h-week-nav{display:none;align-items:center;gap:2px;position:absolute;left:50%;transform:translateX(-50%);}',
        '#h-week-prev,#h-week-next{background:none;border:none;cursor:pointer;font-size:1.5rem;padding:4px 12px;line-height:1;color:#000;border-radius:8px;transition:background .15s;}',
        '#h-week-prev:hover,#h-week-next:hover{background:#f0f0f0;}',
        '#h-week-prev:disabled,#h-week-next:disabled{opacity:.2;cursor:default;pointer-events:none;}',
        '#h-week-right{display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;}',
        '#h-week-label{font-family:\'MontserratLight\',sans-serif;font-size:.72rem;font-weight:700;text-transform:lowercase;letter-spacing:.06em;color:#555;}',
        '#h-table-area{padding:20px;box-sizing:border-box;}'
      ].join('');
      document.head.appendChild(s);
    }

    var box = document.createElement('div');
    box.id = 'h-hor-box';
    var bar = document.createElement('div');
    bar.id = 'h-hor-bar';
    bar.innerHTML =
        '<span></span>'
      + '<div id="h-week-nav">'
      +   '<button type="button" id="h-week-prev" title="semana anterior">&#8592;</button>'
      +   '<button type="button" id="h-week-next" title="semana seguinte">&#8594;</button>'
      + '</div>'
      + '<div id="h-week-right"><span id="h-week-label"></span></div>';
    box.appendChild(bar);

    tableArea.parentNode.insertBefore(box, tableArea);
    box.appendChild(tableArea);

    document.getElementById('h-week-prev').addEventListener('click', function () { hWeekStep(-1); });
    document.getElementById('h-week-next').addEventListener('click', function () { hWeekStep(1); });

    // Aponta o sistema de cobertura (shared.js) para esta barra em vez da
    // do modal das empregadas — mesma lógica/aparência, só os ids mudam. O
    // fluxo das empregadas nunca define isto, por isso fica 100% intacto.
    window._hCovBarIds = { right: 'h-week-right', label: 'h-week-label', bar: 'h-hor-bar' };
  })();

  // Agrupa blocos pela mesma "semana" (block[1][0]) — só usado para Funchal,
  // onde cada loja vem num bloco bruto separado; espelha _wzGetWeekGroups()
  // do modal de horários das empregadas (index.html).
  function hGetWeekGroups(filtered) {
    var groups = [];
    var map = {};
    filtered.forEach(function (b, i) {
      var key = (b[1] && b[1][0]) ? b[1][0] : ('#' + i);
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        map[key] = groups.length;
        groups.push({ key: key, indices: [i] });
      } else {
        groups[map[key]].indices.push(i);
      }
    });
    return groups;
  }
  function hFindGroupIndexForBlock(groups, blockIdx) {
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].indices.indexOf(blockIdx) !== -1) return g;
    }
    return 0;
  }

  function hWeekNavUpdate() {
    if (!hBlocks) return;
    var filtered = hBlocks.filtered;
    var nav   = document.getElementById('h-week-nav');
    var label = document.getElementById('h-week-label');
    var prev  = document.getElementById('h-week-prev');
    var next  = document.getElementById('h-week-next');
    if (!nav) return;
    if (hCurrentStore === 'funchal') {
      var groups = hGetWeekGroups(filtered);
      var gi = hFindGroupIndexForBlock(groups, hWeekIndex);
      nav.style.display = groups.length > 1 ? 'flex' : 'none';
      if (label) label.textContent = groups[gi] ? String(groups[gi].key).toLowerCase() : '';
      if (prev)  prev.disabled = gi <= 0;
      if (next)  next.disabled = gi >= groups.length - 1;
    } else {
      var total = filtered.length;
      nav.style.display = total > 1 ? 'flex' : 'none';
      if (label) label.textContent = 'semana ' + (hWeekIndex + 1);
      if (prev)  prev.disabled = hWeekIndex <= 0;
      if (next)  next.disabled = hWeekIndex >= total - 1;
    }
  }

  function hWeekStep(dir) {
    if (!hBlocks) return;
    var filtered = hBlocks.filtered;
    if (hCurrentStore === 'funchal') {
      var groups = hGetWeekGroups(filtered);
      var gi = hFindGroupIndexForBlock(groups, hWeekIndex);
      var ngi = gi + dir;
      if (ngi < 0 || ngi >= groups.length) return;
      hWeekGoTo(groups[ngi].indices[0]);
    } else {
      hWeekGoTo(hWeekIndex + dir);
    }
  }

  function hWeekGoTo(idx) {
    var filtered = hBlocks.filtered;
    hWeekIndex = Math.max(0, Math.min(idx, filtered.length - 1));
    hWeekNavUpdate();
    hRenderWeek(filtered, hWeekIndex);
  }

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

    // Semana inicial: para Funchal, procurar só entre os representantes de
    // cada grupo (1º bloco de cada semana real), já que window._hRender.funchal
    // agrupa a partir de QUALQUER índice da mesma semana — não importa qual
    // dos blocos do grupo se usa como ponto de partida.
    let startWeek;
    if (isFunchal) {
      const weekGroups = hGetWeekGroups(filtered);
      const representativeBlocks = weekGroups.map(g => filtered[g.indices[0]]);
      const startGroupIdx = hFindCurrentWeek(representativeBlocks);
      startWeek = weekGroups[startGroupIdx] ? weekGroups[startGroupIdx].indices[0] : 0;
    } else {
      startWeek = hFindCurrentWeek(filtered);
    }
    hWeekIndex = startWeek;
    hWeekNavUpdate();
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

    // Sem estilo inline: a regra global "#table-container{display:flex;
    // justify-content:center;...}" do index.html já centra a tabela sozinha
    // (é a mesma que o dashboard de empregadas usa) — um "display:block"
    // inline aqui destruía essa centragem e desalinhava tudo para um lado.
    const temp = document.createElement('div');
    temp.id = 'table-container';
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
