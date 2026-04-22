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

    // ── PORTO SANTO: load generated weeks directly from porto_horarios.csv ──
    // For weeks with no data in datosfnc.csv, we directly substitute blocks
    // from porto_horarios.csv — no merging, no multiplication.
    if (store === 'porto santo') {
      try {
        const portoUrl = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/porto_horarios.csv?t=' + Date.now();
        const portoRes = await fetch(portoUrl);
        if (portoRes.ok) {
          const portoText = await portoRes.text();

          // Parse porto_horarios.csv — treat ALL lines as one block (no blank line splitting)
          // because we want one entry per week regardless of how many stores
          const portoLines = portoText.replace(/\r/g, '').split('\n');
          
          // Group by week: each week starts with PORTO SANTO and has a date row
          // Build map: firstDate → all rows for that week
          const portoWeeks = {}; // date → array of rows
          let currentDate = null;
          
          portoLines.forEach(line => {
            const cells = line.split(',').map(c => (c || '').trim());
            if (cells.every(c => c === '')) return; // skip blank lines
            // Check if this row contains a date in position 1
            const hasDate = cells[1] && cells[1].match(/^\d{2}\/\d{2}\/\d{4}$/);
            if (hasDate && !cells[0].match(/^\d{2}/)) {
              // This is a store header row — extract date
              if (!currentDate || cells[1] !== currentDate) {
                currentDate = cells[1];
              }
            }
            if (currentDate) {
              if (!portoWeeks[currentDate]) portoWeeks[currentDate] = [];
              portoWeeks[currentDate].push(cells);
            }
          });

          // Replace empty blocks in filtered with rows from porto_horarios
          const usedDates = new Set();
          filtered = filtered.map(block => {
            // Get date of this block
            let blockDate = null;
            for (let i = 0; i < block.length; i++) {
              for (let c = 1; c < block[i].length; c++) {
                if (block[i][c] && block[i][c].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  blockDate = block[i][c]; break;
                }
              }
              if (blockDate) break;
            }
            if (!blockDate) return block;
            
            // Already used this date (duplicate empty block) — remove it
            if (usedDates.has(blockDate)) return null;
            
            // Check if generated data exists for this date
            const generatedRows = portoWeeks[blockDate];
            if (!generatedRows || !generatedRows.length) return block;
            
            // Check if original block has real person data
            const hasRealData = block.some(r => {
              const first = (r[0] || '').trim().toUpperCase();
              if (['PORTO SANTO','SHANA','MEZKA MERCADO','MEZKA AVENIDA','MAXX'].includes(first)) return false;
              if (r[1] && r[1].match(/^\d{2}\/\d{2}\/\d{4}$/)) return false;
              return first !== '' && r.slice(1).some(c => c && c !== '');
            });
            if (hasRealData) return block;
            
            usedDates.add(blockDate);
            return generatedRows;
          }).filter(b => b !== null);
        }
      } catch(e) {
        console.warn('[admin-horarios] porto_horarios.csv not available:', e.message);
      }
    }

        hBlocks = { filtered };