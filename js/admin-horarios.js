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
    const filtered = allBlocks.filter(b => (b[0][0] || '').toLowerCase() === key);
    if (!filtered.length) {
      document.getElementById('h-table-area').innerHTML = '<div id="h-status-msg">sem dados para esta loja</div>';
      return;
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
