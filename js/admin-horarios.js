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

  async function loadHorarios(store) {
    const csvUrl = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/datosfnc.csv';
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

    const nameMapping = {
      'mezka funchal':                   'mezka funchal',
      'parfois madeira shopping':         'madeira shopping',
      'parfois arcadas são francisco': 'parfois arcadas',
      'porto santo':                      'porto santo'
    };
    const key = nameMapping[store];
    let filtered = allBlocks.filter(b => (b[0][0] || '').toLowerCase() === key);
    if (!filtered.length) {
      document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">sem dados para esta loja</div>';
      return;
    }

    // ── PORTO SANTO: merge generated weeks from porto_horarios.csv ──
    // Blocks where all data rows are empty (only header + dates, no people)
    // are replaced by blocks from porto_horarios.csv if available.
    if (store === 'porto santo') {
      try {
        const portoUrl = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/porto_horarios.csv?t=' + Date.now();
        const portoRes = await fetch(portoUrl);
        if (portoRes.ok) {
          const portoText = await portoRes.text();
          const portoRows = Papa.parse(portoText, {skipEmptyLines: false}).data.map(r => r.map(c => (c==null?'':String(c).trim())));
          const portoBlocks = [];
          let pcur = [];
          portoRows.forEach(r => {
            if (r.every(c => c === '')) { if (pcur.length) { portoBlocks.push(pcur); pcur = []; } }
            else pcur.push(r);
          });
          if (pcur.length) portoBlocks.push(pcur);

          // Build a map: date string → porto block (using first date found in block)
          const portoByDate = {};
          portoBlocks.forEach(pb => {
            for (let i = 0; i < pb.length; i++) {
              const row = pb[i];
              for (let c = 1; c < row.length; c++) {
                if (row[c] && row[c].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  portoByDate[row[c]] = pb;
                  return;
                }
              }
            }
          });

          // Replace empty Porto Santo blocks with generated ones
          filtered = filtered.map(block => {
            // Check if block has any person rows (rows beyond header+dates that have schedule data)
            const hasPeople = block.slice(2).some(r => r.slice(1).some(c => c && c !== ''));
            if (hasPeople) return block; // already has data — keep

            // Find the date for this block
            let blockDate = null;
            for (let i = 0; i < block.length; i++) {
              for (let c = 1; c < block[i].length; c++) {
                if (block[i][c] && block[i][c].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  blockDate = block[i][c]; break;
                }
              }
              if (blockDate) break;
            }

            if (blockDate && portoByDate[blockDate]) {
              return portoByDate[blockDate]; // replace with generated block
            }
            return block;
          });
        }
      } catch(e) {
        console.warn('[admin-horarios] porto_horarios.csv not available:', e.message);
      }
    }

    hBlocks = { filtered };

    // Build week selector
    const weekSel = document.getElementById('h-week-select');
    weekSel.innerHTML = '';
    filtered.forEach((_, i) => {
      const op = document.createElement('option');
      op.value = i; op.textContent = 'SEMANA ' + (i + 1);
      weekSel.appendChild(op);
    });
    weekSel.style.display = filtered.length > 1 ? 'inline-block' : 'none';

    // Auto-select current week
    const startWeek = hFindCurrentWeek(filtered);
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

  function hRenderWeek(filtered, index) {
    if (!window._hRender) return;
    const area = document.getElementById('h-table-area');
    area.innerHTML = '';

    // Temporarily swap #table-container so renderTable writes here
    const real = document.getElementById('table-container');
    if (real) real.setAttribute('id', 'table-container-bak');

    const temp = document.createElement('div');
    temp.id = 'table-container';
    temp.style.cssText = 'display:flex;justify-content:flex-start;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;';
    area.appendChild(temp);

    const firstCell = (filtered[index][0][0] || '').trim().toLowerCase();
    if (firstCell === 'porto santo') {
      window._hRender.porto(filtered, index);
    } else {
      window._hRender.table(filtered, index);
    }

    // Rename temp so it doesn't conflict, restore real
    temp.removeAttribute('id');
    if (real) real.setAttribute('id', 'table-container');

    // Start active counter + dashboard
    hUpdateActive(filtered, index);
    if (window._hDashboard) window._hDashboard(filtered, index);
    if (hActiveInterval) clearInterval(hActiveInterval);
    hActiveInterval = setInterval(function() {
      hUpdateActive(filtered, index);
    }, 60000); // update every minute
  }

  function hUpdateActive(filtered, index) {
    const rows = filtered[index];
    if (!rows) return;

    // Find today's column
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
      // collect all schedule values for today across all data rows
      const schedules = [];
      dataRows.forEach(function(row) {
        const val = (row[todayCol] || '').trim();
        if (val) schedules.push(val);
      });
      schedules.forEach(function(sched) {
        if (window._hRender && hIsNowInSchedule(sched)) count++;
      });
    }

    const bar    = document.getElementById('h-active-bar');
    const badge  = document.getElementById('h-active-badge');
    const dot    = document.getElementById('h-active-dot');
    const text   = document.getElementById('h-active-text');
    if (!bar) return;

    bar.style.display = 'flex';
    text.textContent = count === 1 ? '1 pessoa ativa agora' : count + ' pessoas ativas agora';
    if (count === 0) {
      badge.classList.add('zero');
      text.textContent = 'nenhuma pessoa ativa agora';
    } else {
      badge.classList.remove('zero');
    }
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
