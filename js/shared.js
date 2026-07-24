// ══════════════════════════════════════════════════════════════
//  LÓGICA COMPARTIDA: reloj + login unificado
// ══════════════════════════════════════════════════════════════
(function(){

  let isLoggedIn = false;
  let currentStore = null;

  // — Rotación móvil —
  function checkOrientation() {
    if (!isLoggedIn) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('main-header').style.display  = 'none';
      document.getElementById('container-tables').style.display = 'none';
    }
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  // — Relojes —
  function updateTimeDateLogin() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    document.getElementById('current-time').innerHTML =
      h + '<span class="time-colon">:</span>' + m + '<span class="time-colon">:</span>' + s;
    document.getElementById('current-date').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateTimeDateLogin, 1000);
  updateTimeDateLogin();

  function updateTimeDateMain() {
    const now = new Date();
    document.getElementById('current-time-main').textContent = now.toLocaleTimeString('pt-PT',{hour12:false});
    document.getElementById('current-date-main').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateTimeDateMain, 1000);

  function updateAdminClock() {
    const now = new Date();
    document.getElementById('admin-time').textContent = now.toLocaleTimeString('pt-PT',{hour12:false});
    document.getElementById('admin-date').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateAdminClock, 1000);

  // — Login unificado — consulta claves en Supabase —
  async function attemptLogin() {
    const userKey = document.getElementById('key-input').value.trim();
    if (!userKey) return;

    // Bloquear botón mientras consulta
    const btn = document.getElementById('key-submit');
    btn.disabled = true;

    try {
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: userKey })
      });

      if (!loginRes.ok) {
        alert('Senha incorreta');
        document.getElementById('key-input').value = '';
        document.getElementById('key-input').focus();
        btn.disabled = false;
        return;
      }

      const data = await loginRes.json();
      const sessionToken = data.token;

      // Guardar token en cookie para el portero de /js/
      document.cookie = 'wkz_session=' + sessionToken + '; path=/; SameSite=Strict';

      // Cargar los JS protegidos ahora que la cookie está lista
      await (function loadProtectedScripts() {
        const scripts = [
          'js/session-lock.js',
          'js/agenda.js','js/rotulos.js','js/processamento.js',
          'js/admin-init.js','js/salarios.js','js/recibos.js',
          'js/admin-horarios.js','js/ferias.js','js/editor-pdf.js',
          'js/tam.js','js/saft-reminder.js','js/gerador-horarios.js',
          'js/ventas-empleada.js','js/ventas-admin.js',
          'js/historico-admin.js','js/nadiya.js','js/parfois.js',
          'js/banco-horas.js'
        ];
        return scripts.reduce(function(p, src) {
          return p.then(function() {
            return new Promise(function(resolve, reject) {
              var s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              s.onerror = reject;
              document.body.appendChild(s);
            });
          });
        }, Promise.resolve());
      })();

      // Inicializar Supabase con credenciales del login — sin llamada extra
      await window.initSupabase(sessionToken, {
        url: data.url,
        key: data.key,
        adminToken: data.adminToken
      });

      isLoggedIn = true;

      if (data.rol === 'admin') {
        // ── LOGIN ADMIN ──
        if (window.__wkzAutoLogin) {
          // Silent auto-login — no sweep, no greeting, instant show
          window.__wkzAutoLogin = false;
          document.getElementById('login-screen').style.display = 'none';
          const adminApp = document.getElementById('admin-app');
          adminApp.classList.add('show');
          const adminHdr = document.getElementById('admin-header');
          adminHdr.classList.add('show');
          updateAdminClock();
          rLoadConfig();
          // Show elements immediately without animation
          adminApp.querySelectorAll('.reveal-item').forEach(function(el) {
            el.style.opacity = '1';
          });
          initSaftReminder();
        } else {
          sweepThen(function() {
            document.getElementById('login-screen').style.display = 'none';
            showGreeting(data.nombre || 'administração', function() {
              const adminApp = document.getElementById('admin-app');
              adminApp.classList.add('show');
              const adminHdr = document.getElementById('admin-header');
              adminHdr.classList.add('show');
              updateAdminClock();
              rLoadConfig();
              animateReveal(adminApp.querySelectorAll('.reveal-item'), 130);
              initSaftReminder();
            });
          });
        }

      } else if (data.rol === 'nadiya') {
        // ── LOGIN NADIYA ──
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.nombre || 'nadiya', function() {
            if (typeof openNadiyaOverlay === 'function') openNadiyaOverlay();
          });
        });

      } else {
        // ── LOGIN TIENDA ──
        currentStore = data.tienda;
        window._currentStoreGlobal = data.tienda;
        window._currentEmployeeName = (data.nombre || '').trim().toUpperCase();
        if (data.tienda === 'porto santo' && typeof havPrefetch === 'function') havPrefetch();
        if (data.tienda === 'porto santo' && typeof havUltimaPrefetch === 'function') havUltimaPrefetch();
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.nombre || data.tienda, function() {
            document.getElementById('main-header').classList.add('show');
            document.getElementById('main-header').style.display = 'flex';
            document.getElementById('container-tables').style.display = 'flex';
            animateReveal([
              document.querySelector('#main-header-center'),
              document.getElementById('container-tables')
            ], 150);
            loadData(currentStore);
          });
        });
      }

    } catch(err) {
      alert('Erro de ligação. Tenta novamente.');
      btn.disabled = false;
    }
  }

  document.getElementById('key-submit').addEventListener('click', attemptLogin);
  document.getElementById('key-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') attemptLogin();
  });

  // — Logo click → reload —


  // ── FADE RELOAD ──
  function fadeReload() {
    document.body.style.transition = 'opacity 0.5s ease';
    document.body.style.opacity = '0';
    setTimeout(function() { location.reload(); }, 520);
  }
  document.getElementById('main-logo').removeEventListener('click', null);
  document.getElementById('admin-logo').removeEventListener('click', null);
  document.getElementById('main-logo').onclick  = function(e){ e.preventDefault(); fadeReload(); };
  document.getElementById('admin-logo').onclick = function(e){ e.preventDefault(); fadeReload(); };

  // ── GREETING ──
  function showGreeting(label, callback) {
    const h = new Date().getHours();
    const greet = h < 12 ? 'bom dia' : h < 19 ? 'boa tarde' : 'boa noite';
    const sub   = label || 'wakzome';
    const el    = document.getElementById('greeting-overlay');
    const txt   = document.getElementById('greeting-text');
    const subtxt= document.getElementById('greeting-sub');
    txt.textContent  = greet;
    subtxt.textContent = sub;
    el.style.display = 'flex';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.classList.add('show');
        setTimeout(function() {
          el.classList.remove('show');
          setTimeout(function() {
            el.style.display = 'none';
            if (callback) callback();
          }, 550);
        }, 1400);
      });
    });
  }

  // ── SHIFT COUNTDOWN (employee view) ──
  function startShiftCountdown(store) {
    // Poll every 30s, find end of current shift for today
    function tick() {
      const el = document.getElementById('shift-countdown');
      if (!el || !window._lastBlocks) return;
      const blocks   = window._lastBlocks;
      const today    = new Date();
      const todayStr = today.toDateString();
      let latestEnd  = null;

      for (const block of blocks) {
        const header = block[1] || [];
        let col = -1;
        for (let c = 1; c < header.length; c++) {
          const d = header[c]; if (!d) continue;
          const parts = d.split('/');
          if (parts.length !== 3) continue;
          const dt = new Date(+parts[2], +parts[1]-1, +parts[0]);
          if (dt.toDateString() === todayStr) { col = c; break; }
        }
        if (col < 0) continue;
        const dataRows = block.slice(2);
        dataRows.forEach(function(row) {
          const val = (row[col] || '').trim();
          if (!val) return;
          val.split(',').forEach(function(seg) {
            seg = seg.trim();
            const pts = seg.split('-');
            if (pts.length < 2) return;
            const eh = parseInt(pts[1].split(':')[0]);
            const em = parseInt((pts[1].split(':')[1]) || 0);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
            if (end > today && (!latestEnd || end > latestEnd)) latestEnd = end;
          });
        });
      }

      if (!latestEnd) { el.style.display = 'none'; return; }
      const diff = latestEnd - today;
      if (diff <= 0) { el.style.display = 'none'; return; }
      const hh   = Math.floor(diff / 3600000);
      const mm   = Math.floor((diff % 3600000) / 60000);
      el.style.display = 'block';
      el.textContent   = hh > 0
        ? 'terminas em ' + hh + 'h ' + (mm > 0 ? mm + 'min' : '')
        : 'terminas em ' + mm + ' min';
    }
    tick();
    setInterval(tick, 30000);
  }

  // ── DASHBOARD (admin horarios) ──
  window._hDashboard = function(filtered, index) {
    const rows    = filtered[index];
    const header  = rows[1] || [];
    const today   = new Date();
    const todayStr= today.toDateString();

    let todayCol  = -1;
    for (let c = 1; c < header.length; c++) {
      const d = header[c]; if (!d) continue;
      const parts = d.split('/');
      if (parts.length !== 3) continue;
      const dt = new Date(+parts[2], +parts[1]-1, +parts[0]);
      if (dt.toDateString() === todayStr) { todayCol = c; break; }
    }

    const dataRows = rows.slice(2);
    let active = 0, folga = 0, nextStart = null;

    // Group rows by person name (col 0) — a person with multiple rows is still ONE person
    const personMap = {};
    dataRows.forEach(function(row) {
      const name = (row[0] || '').trim();
      if (!name) return;
      if (!personMap[name]) personMap[name] = [];
      personMap[name].push(row);
    });

    Object.keys(personMap).forEach(function(name) {
      const personRows = personMap[name];
      let isFolga = false, isActive = false;

      personRows.forEach(function(row) {
        const val = (row[todayCol] || '').trim().toUpperCase();
        if (!val) return;
        if (val === 'FOLGA' || val === 'FERIAS') { isFolga = true; return; }
        // check if active now
        val.toLowerCase().split(',').forEach(function(seg) {
          seg = seg.trim();
          const pts = seg.split('-');
          if (pts.length < 2) return;
          const sh = parseInt(pts[0].split(':')[0]);
          const sm = parseInt((pts[0].split(':')[1]) || 0);
          const eh = parseInt(pts[1].split(':')[0]);
          const em = parseInt((pts[1].split(':')[1]) || 0);
          const s = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
          const e = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
          if (today >= s && today <= e) isActive = true;
          if (s > today && (!nextStart || s < nextStart)) nextStart = s;
        });
      });

      if (isFolga) folga++;
      else if (isActive) active++;
    });

    const nextStr = nextStart
      ? String(nextStart.getHours()).padStart(2,'0') + ':' + String(nextStart.getMinutes()).padStart(2,'0')
      : '—';

    const dash = document.getElementById('h-dashboard');
    if (!dash) return;
    dash.style.display = 'flex';
    dash.innerHTML = [
      { val: active, label: 'ativas agora',        dot: active > 0 ? '#2a8a2a' : '#ccc' },
      { val: folga,  label: 'folga / férias hoje',  dot: folga  > 0 ? '#e09000' : '#ccc' },
      { val: nextStr,label: 'próximo início',        dot: '#aaa' }
    ].map(function(d) {
      return '<div class="dash-card">'
        + '<span class="dash-dot" style="background:' + d.dot + '"></span>'
        + '<span class="dash-val">' + d.val + '</span>'
        + '<span class="dash-label">' + d.label + '</span>'
        + '</div>';
    }).join('');
  };

  // logo click now handled by fadeReload above

  // Expose render functions for admin horarios tab
  window._hRender = {
    table: renderTable,
    porto: renderPortoSanto,
    findCurrentWeek: findCurrentWeek
  };

  // ══════════════════════════════════════════════════════════════
  //  INDEX: CARGA Y RENDERIZADO DE HORARIOS
  // ══════════════════════════════════════════════════════════════

  function splitPortoSantoBlock(block){
    const subBlocks = [];
    let currentSub = [];
    const totalCols = block[0].length;
    for(let i=1; i<block.length; i++){
      const firstCell = (block[i][0] || '').trim().toLowerCase();
      if(firstCell && firstCell !== 'porto santo'){
        if(currentSub.length) subBlocks.push(currentSub);
        const headerRow = block[0];
        const storeRow  = padRow(block[i], totalCols);
        const datesRow  = padRow(block[i+1] || [], totalCols);
        currentSub = [headerRow, storeRow, datesRow];
        i++;
      } else if(currentSub.length){
        currentSub.push(padRow(block[i], totalCols));
      }
    }
    if(currentSub.length) subBlocks.push(currentSub);
    return subBlocks;
  }

  function padRow(row, total){
    const r = [...row];
    while(r.length < total) r.push("");
    return r;
  }

  async function loadData(store){
    const csvUrl = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/datosfnc.csv';
    let csvText='';
    try{
      const res = await fetch(csvUrl);
      if(!res.ok) throw new Error('HTTP '+res.status);
      csvText = await res.text();
    } catch(err){
      document.getElementById('table-container').innerHTML = 'Error cargando CSV: '+err.message;
      return;
    }

    const parsed = Papa.parse(csvText,{skipEmptyLines:false});
    let rows = parsed.data.map(r => r.map(c => (c==null?'':String(c).trim())));
    const blocks=[];
    let currentBlock=[];
    rows.forEach(r=>{
      if(r.every(c=>c==='')){
        if(currentBlock.length){ blocks.push(currentBlock); currentBlock=[]; }
      } else currentBlock.push(r);
    });
    if(currentBlock.length) blocks.push(currentBlock);
    if(blocks.length===0){ document.getElementById('table-container').innerHTML='CSV vacío'; return; }

    const nameMapping = {
      "mezka funchal": "mezka funchal",
      "parfois madeira shopping": "madeira shopping",
      "parfois arcadas são francisco": "parfois arcadas",
      "porto santo": "porto santo"
    };
    const searchName = nameMapping[store];
    const filteredBlocks = blocks.filter(b => b[0][0].toLowerCase() === searchName);
    if(filteredBlocks.length === 0){ document.getElementById('table-container').innerHTML='No hay datos para esta tienda'; return; }

    function updateSummaryWrapVisibility() {
      // summary-wrap is permanently hidden — replaced by #legal-notice above the table
    }
    updateSummaryWrapVisibility();
    window.addEventListener('resize', updateSummaryWrapVisibility);

    // ── PORTO SANTO: load week-specific files ──
    let finalBlocks = filteredBlocks;
    if (store === 'porto santo') {
      const BASE_DATE = new Date('2026-01-05T00:00:00');
      const usedWeeks = new Set();
      const blockPromises = filteredBlocks.map(async block => {
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
          const flat=Papa.parse(await res.text(),{skipEmptyLines:false}).data.map(r=>r.map(c=>(c==null?'':String(c).trim()))).filter(r=>!r.every(c=>c===''));
          return flat.length?flat:block;
        } catch(e){return block;}
      });
      finalBlocks=(await Promise.all(blockPromises)).filter(b=>b!==null);
    }

    window._lastBlocks = finalBlocks;
    if (store === 'porto santo') havCheckAndShow();
    if (store === 'porto santo') havUltimaCheckAndShow();
    startShiftCountdown(currentStore);
    document.getElementById('table-container').style.display='flex';

    const weekSelectId = 'week-select';
    if(!document.getElementById(weekSelectId)){
      const weekSelect = document.createElement('select');
      weekSelect.id = weekSelectId;
      finalBlocks.forEach((_,i)=>{
        const op=document.createElement('option');
        op.value=i; op.textContent='SEMANA '+(i+1);
        weekSelect.appendChild(op);
      });
      document.getElementById('main-header-center').appendChild(weekSelect);
      weekSelect.addEventListener('change',()=>{ fadeRenderTable(finalBlocks,parseInt(weekSelect.value)); });
    }

    const startWeek = findCurrentWeek(filteredBlocks);
    document.getElementById(weekSelectId).value=startWeek;
    fadeRenderTable(finalBlocks,startWeek);

    setInterval(() => {
      const currentWeek = parseInt(document.getElementById(weekSelectId).value);
      renderSummary(finalBlocks,currentWeek);
      highlightCurrentCell(finalBlocks,currentWeek);
    }, 30000);
  }

  function fadeRenderTable(blocks, index){
    const cont = document.getElementById('table-container');
    cont.style.opacity = 0;
    setTimeout(() => {
      renderSummary(blocks, index);
      const firstCell = (blocks[index][0][0] || '').trim().toLowerCase();
      if(firstCell === 'porto santo'){ renderPortoSanto(blocks, index); }
      else { renderTable(blocks, index); }
      cont.style.opacity = 1;
    }, 400);
  }

  function findCurrentWeek(blocks){
    const hoy=new Date();
    for(let i=0;i<blocks.length;i++){
      const header2=blocks[i][1]; if(!header2) continue;
      for(let c=1;c<header2.length;c++){
        const d=header2[c]; if(!d) continue;
        const parts=d.split('/');
        if(parts.length!==3) continue;
        const dateObj=new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0]));
        if(dateObj.toDateString()===hoy.toDateString()) return i;
      }
    }
    return 0;
  }

  function highlightCurrentCell(blocks,index){
    const table = document.getElementById('summary-table');
    if (!table) return;
    const previous = table.querySelectorAll('.blinking-now');
    previous.forEach(el => el.classList.remove('blinking-now'));
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const rows = table.rows;
    if (rows.length < 2) return;
    const todayColIndex = findTodayCol(blocks[index][1]) + 1;
    if(todayColIndex<1) return;
    for(let i=1;i<rows.length;i++){
      const timeCell = rows[i].cells[0];
      if(!timeCell || !timeCell.textContent) continue;
      const [h,m] = timeCell.textContent.split(':').map(Number);
      const nextM = m + ((m%30===0)?30:60);
      const nextH = nextM>=60? h+1:h;
      if((currentHour>h || (currentHour===h && currentMinute>=m)) &&
         (currentHour<nextH || (currentHour===nextH && currentMinute<(nextM%60)))) {
        const targetCell = rows[i].cells[todayColIndex];
        if(targetCell) targetCell.classList.add('blinking-now');
        break;
      }
    }
  }

  function renderSummary(blocks,index){
    const rows = blocks[index];
    const dataRows = rows.slice(2);
    const headerCols = rows[1].slice(1);
    let minHour=24, maxHour=0;
    dataRows.forEach(row=>{
      row.forEach((cell,c)=>{
        if(c===0||!cell) return;
        const segments = cell.split('<br>').join(',').split(',').map(s=>s.trim()).filter(s=>s);
        segments.forEach(seg=>{
          const [start,end]=seg.split('-').map(s=>s.trim());
          if(!start||!end) return;
          const sh = parseInt(start.split(':')[0]);
          const eh = parseInt(end.split(':')[0]);
          if(sh<minHour) minHour=sh;
          if(eh>maxHour) maxHour=eh;
        });
      });
    });
    const now=new Date();
    let use30min=false;
    dataRows.forEach(row=>{
      row.forEach((cell,c)=>{
        if(c===0||!cell) return;
        const segments = cell.split('<br>').join(',').split(',').map(s=>s.trim()).filter(s=>s);
        segments.forEach(seg=>{
          const [start,]=seg.split('-').map(s=>s.trim());
          const sm = parseInt(start.split(':')[1]||'0');
          if(sm!==0) use30min=true;
        });
      });
    });
    const interval = use30min?30:60;
    const timeIntervals=[];
    for(let h=minHour;h<maxHour;h++){
      for(let m=0;m<60;m+=interval){
        timeIntervals.push(h+':'+(m<10?'0':'')+m);
      }
    }
    const summaryCounts = timeIntervals.map(t=>headerCols.map(_=>0));
    dataRows.forEach((row)=>{
      row.forEach((cell,c)=>{
        if(c===0||!cell) return;
        const segments = cell.split('<br>').join(',').split(',').map(s=>s.trim()).filter(s=>s);
        segments.forEach(seg=>{
          const [start,end]=seg.split('-').map(s=>s.trim());
          if(!start||!end) return;
          timeIntervals.forEach((intervalTime,iInt)=>{
            const [ih,im] = intervalTime.split(':').map(Number);
            const [sh,sm]=start.split(':').map(Number);
            const [eh,em]=end.split(':').map(Number);
            const intervalDate=new Date(0,0,0,ih,im);
            const startDate=new Date(0,0,0,sh,sm);
            const endDate=new Date(0,0,0,eh,em);
            if(intervalDate>=startDate && intervalDate<endDate) summaryCounts[iInt][c-1]++;
          });
        });
      });
    });
    let html='<table id="summary-table">';
    const weekdayMap = ['DOM','SEG','TER','QUA','QUI','SEX','SAB'];
    html += '<tr><th></th>' + headerCols.map(h => {
      if(!h) return '';
      const parts = h.split('/');
      if(parts.length !== 3) return h;
      const d = new Date(+parts[2], +parts[1]-1, +parts[0]);
      return weekdayMap[d.getDay()];
    }).map(escapeHtml).map(day => `<th>${day}</th>`).join('') + '</tr>';
    const todayCol = findTodayCol(rows[1]);
    timeIntervals.forEach(interval=>{
      html+='<tr>';
      html+=`<td>${interval}</td>`;
      summaryCounts[timeIntervals.indexOf(interval)].forEach((cnt,j)=>{
        let classes = '';
        if(j===todayCol){
          const [ih,im]=interval.split(':').map(Number);
          if(now.getHours()===ih && now.getMinutes()>=im) classes='active-now';
        }
        html+=`<td class="${classes}">${cnt}</td>`;
      });
      html+='</tr>';
    });
    html+='</table>';
    document.getElementById('summary-wrap').innerHTML=html;
    setTimeout(()=>highlightCurrentCell(blocks,index),100);
  }

  function findTodayCol(headerDates){
    const today=new Date();
    for(let c=1;c<headerDates.length;c++){
      const d=headerDates[c]; if(!d) continue;
      const parts=d.split('/');
      if(parts.length!==3) continue;
      const dd=new Date(Number(parts[2]),Number(parts[1])-1,Number(parts[0]));
      if(dd.toDateString()===today.toDateString()) return c-1;
    }
    return -1;
  }

  function renderTable(blocks,index){
    const rows = blocks[index];
    const headerRows = rows.slice(0,2);
    const dataRows = rows.slice(2);
    const cols = Math.max(...rows.map(r=>r.length));
    const colWidths = Array(cols).fill(0);
    rows.forEach(r=>r.forEach((c,i)=>colWidths[i]=Math.max(colWidths[i],c.length)));
    const todayCol = findTodayCol(headerRows[1])+1;
    const persons=[];
    for(let i=0;i<dataRows.length;i+=3) persons.push({A:dataRows[i]||Array(cols).fill(''),B:dataRows[i+1]||Array(cols).fill(''),C:dataRows[i+2]||Array(cols).fill('')});
    function rowHasBlankToken(row){ if(!row) return false; const re=/^\s*(?:40\s*hrs|40hrs|7(?:[\.,]5)?|8|0)\s*$/i; return row.some(cell=>re.test(String(cell).trim())); }
    let html='<table style="margin:0 auto;">';
    for(let r=0;r<2;r++){
      html+='<tr>';
      for(let c=0;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        const thBg=(c===todayCol?'':'background:#444;color:#fff;');
        // col 0 = store/name header: allow wrap. col 1+ = day headers: nowrap
        const thWrap=(c===0?'':'white-space:nowrap;');
        html+=`<th class="${cls}" style="width:${colWidths[c]*12}px;${thBg}${thWrap}text-align:center;">${escapeHtml(headerRows[r][c]||'')}</th>`;
      }
      html+='</tr>';
    }
    persons.forEach(p=>{
      const A=p.A,B=p.B,C=p.C;
      const bgA=rowHasBlankToken(A)?'#fff':'#f2f2f2';
      const bgB=rowHasBlankToken(B)?'#fff':'#f2f2f2';
      let circleColor='red'; let isActiveNow=false;
      for(let c=1;c<cols;c++){
        const colDate=headerRows[1][c]; if(!colDate) continue;
        const parts=colDate.split('/'); if(parts.length!==3) continue;
        const d=new Date(+parts[2],parts[1]-1,+parts[0]);
        if(d.toDateString()===new Date().toDateString()){
          const horarios=[A[c],B[c],C[c]].filter(v=>v);
          if(horarios.some(h=>isNowInSchedule(h))){ circleColor='green'; isActiveNow=true; }
        }
      }
      const activeCls = isActiveNow ? ' tr-active-now' : '';
      let rowspanCols=[];
      html+=`<tr class="${activeCls}">`;
      // name cell: allow wrap so compound names break naturally
      html+=`<td class="name" rowspan="2" style="background:${bgA};width:${colWidths[0]*12}px;text-align:center;justify-content:center;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${circleColor};margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>
              ${escapeHtml(A[0]||'')}</td>`;
      for(let c=1;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        const top=A[c]||'', bot=B[c]||'';
        // nowrap only if cell looks like a schedule (contains digits and colon/dash, no spaces)
        const isSchedule = v => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v.trim());
        const topNw = isSchedule(top)||top===''||top.toUpperCase()==='FOLGA'||top.toUpperCase()==='FERIAS';
        const botNw = isSchedule(bot)||bot===''||bot.toUpperCase()==='FOLGA'||bot.toUpperCase()==='FERIAS';
        const nw = (topNw && botNw) ? 'white-space:nowrap;' : '';
        if(top===bot && top!==''){
          html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${bgA};width:${colWidths[c]*12}px;${nw}text-align:center;">${escapeHtml(top)}</td>`;
          rowspanCols.push(c);
        } else if(top!==''||bot!==''){
          const cont=[top,bot].filter(v=>v).map(escapeHtml).join('<br>');
          html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${bgA};width:${colWidths[c]*12}px;${nw}text-align:center;">${cont}</td>`;
          rowspanCols.push(c);
        } else { html+=`<td class="${cls}" style="background:${bgA};width:${colWidths[c]*12}px;text-align:center;"></td>`; }
      }
      html+=`</tr><tr class="${activeCls}">`;
      for(let c=1;c<cols;c++){ if(rowspanCols.includes(c)) continue;
        const cls=(c===todayCol?'today-col':'');
        html+=`<td class="${cls}" style="background:${bgB};width:${colWidths[c]*12}px;text-align:center;">${escapeHtml(B[c]||'')}</td>`;
      }
      html+='</tr><tr>';
      for(let c=0;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        html+=`<td class="bold-row ${cls}" style="background:#fff;width:${colWidths[c]*12}px;text-align:center;">${escapeHtml(C[c]||'')}</td>`;
      }
      html+='</tr>';
    });
    html+='</table>';
    document.getElementById('table-container').innerHTML=html;
  }

  function renderPortoSanto(blocks, index) {
    const rows = blocks[index];
    const cols = Math.max(...rows.map(r => r.length));
    let html = '<table style="margin:0 auto;">';
    function findTodayColPS(row) {
      const today = new Date();
      for (let c = 1; c < row.length; c++) {
        const d = row[c]; if (!d) continue;
        const parts = d.split('/');
        if (parts.length !== 3) continue;
        const dateObj = new Date(+parts[2], +parts[1]-1, +parts[0]);
        if (dateObj.toDateString() === today.toDateString()) return c;
      }
      return -1;
    }
    const colWidths = Array(cols).fill(0);
    rows.forEach(r => r.forEach((c, i) => colWidths[i] = Math.max(colWidths[i], (c||'').length)));
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const firstCell = (row[0] || '').trim().toLowerCase();
      if (firstCell === 'porto santo') {
        html += '<tr>';
        html += `<th style="width:${colWidths[0]*12}px;background:#444;color:#fff;text-align:center;">${escapeHtml(row[0])}</th>`;
        for (let c = 1; c < cols; c++) {
          html += `<th style="width:${colWidths[c]*12}px;background:#444;color:#fff;text-align:center;">${escapeHtml(row[c] || '')}</th>`;
        }
        html += '</tr>'; i++; continue;
      }
      const todayCol = findTodayColPS(row);
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const cls = (c === todayCol ? 'today-col' : '');
        const bg = (c === todayCol ? '' : 'background:#444;color:#fff;');
        html += `<th class="${cls}" style="width:${colWidths[c]*12}px;${bg}text-align:center;">${escapeHtml(row[c] || '')}</th>`;
      }
      html += '</tr>'; i++;
      while (i + 1 < rows.length && (rows[i][0] || '').toLowerCase() !== 'porto santo') {
        const A = rows[i]; const B = rows[i + 1];
        let circleColor = 'red'; let isActiveNow = false;
        if (todayCol > 0) {
          const horarios = [A[todayCol], B[todayCol]].filter(v => v);
          if (horarios.some(h => isNowInSchedule(h))) { circleColor = 'green'; isActiveNow = true; }
        }
        const activeCls = isActiveNow ? ' tr-active-now' : '';
        html += `<tr class="${activeCls}">`;
        html += `<td class="name hps-person-name" data-hps-person="${escapeHtml(A[0]||'')}" style="width:${colWidths[0]*12}px;text-align:center;justify-content:center;cursor:pointer;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${circleColor};margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>
                  ${escapeHtml(A[0]||'')}
                 </td>`;
        for (let c = 1; c < cols; c++) {
          const cls = (c === todayCol ? 'today-col' : '');
          const morning = (A[c] || '').trim().toUpperCase();
          const afternoon = (B[c] || '').trim().toUpperCase();
          let content = '';
          const specialWords = ['FOLGA', 'FERIAS'];
          const isSchedule = v => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v.trim());
          const nw = (isSchedule(A[c]||'')||specialWords.includes(morning)||morning==='') &&
                     (isSchedule(B[c]||'')||specialWords.includes(afternoon)||afternoon==='')
                     ? 'white-space:nowrap;' : '';
          if (morning && morning === afternoon && specialWords.includes(morning)) {
            content = escapeHtml(morning);
          } else if (morning && afternoon) {
            content = `${escapeHtml(A[c])}<br>${escapeHtml(B[c])}`;
          } else {
            content = escapeHtml(A[c] || B[c] || '');
          }
          html += `<td class="${cls}" style="width:${colWidths[c]*12}px;text-align:center;${nw}">${content}</td>`;
        }
        html += '</tr>'; i += 2;
      }
    }
    html += '</table>';
    document.getElementById('table-container').innerHTML = html;
    hpsBindNameClicks(rows);
  }

  function isNowInSchedule(schedule){
    const now=new Date();
    const segments=schedule.split('<br>').join(',').split(',').map(s=>s.trim()).filter(s=>s);
    for(let seg of segments){
      const [start,end]=seg.split('-').map(t=>t.trim());
      if(!start||!end) continue;
      const [sh,sm]=start.split(':').map(Number);
      const [eh,em]=end.split(':').map(Number);
      const s=new Date(now.getFullYear(),now.getMonth(),now.getDate(),sh,sm);
      const e=new Date(now.getFullYear(),now.getMonth(),now.getDate(),eh,em);
      if(now>=s && now<=e) return true;
    }
    return false;
  }

  function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ══════════════════════════════════════════════════════════════
  //  MODAL: horário consolidado de UMA pessoa (só vista Porto Santo)
  //  Ao clicar no nome, mostra um quadro novo só com essa pessoa — os 7 dias
  //  da semana, cada um com a loja real, o horário, e (se aplicável) o
  //  reforço que ELA dá noutra loja ou o reforço que ELA recebe na sua.
  //  NÃO altera em nada a tabela normal — só lê os mesmos dados já publicados.
  // ══════════════════════════════════════════════════════════════
  const HPS_TIME_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;
  function hpsIsSchedule(v) { return HPS_TIME_RE.test((v || '').trim()); }
  const HPS_HRS_SUFFIX_RE = /\s*\d+(?:[.,]\d+)?\s*hrs?\.?\s*$/i;
  function hpsStripHrs(name) { return (name || '').replace(HPS_HRS_SUFFIX_RE, '').trim(); }

  // Repete a mesma leitura de blocos que renderPortoSanto já faz, mas devolve
  // dados estruturados em vez de HTML: { dayHeaderRow, stores:[{name, dateRow, people:[{name,A,B}]}] }
  function hpsCollectStores(rows) {
    const cols = Math.max(...rows.map(r => r.length));
    const stores = [];
    let dayHeaderRow = null;
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const firstCell = (row[0] || '').trim().toLowerCase();
      if (firstCell === 'porto santo') {
        if (!dayHeaderRow) dayHeaderRow = row;
        i++;
        const dateRow = rows[i] || [];
        const store = { name: (dateRow[0] || '').trim(), dateRow, people: [] };
        stores.push(store);
        i++;
        while (i + 1 < rows.length && (rows[i][0] || '').toLowerCase() !== 'porto santo') {
          store.people.push({ name: (rows[i][0] || '').trim(), A: rows[i], B: rows[i + 1] });
          i += 2;
        }
        continue;
      }
      i++;
    }
    return { cols, dayHeaderRow: dayHeaderRow || [], stores };
  }

  function showPersonWeekModal(personLabel, rows) {
    const { cols, dayHeaderRow, stores } = hpsCollectStores(rows);
    const knownStoreNames = new Set(stores.map(s => s.name.toUpperCase()).filter(Boolean));
    const storeByName = {};
    stores.forEach(s => { storeByName[s.name] = s; });

    const appearances = stores
      .map(s => ({ store: s.name, dateRow: s.dateRow, entry: s.people.find(p => p.name === personLabel) }))
      .filter(x => x.entry);
    if (!appearances.length) return;

    const dias = [];
    for (let c = 1; c < cols; c++) {
      const dayName = (dayHeaderRow[c] || '').trim();
      const date = (appearances[0].dateRow[c] || '').trim();
      let loja = '', display = '', isWork = false;
      let apoioLoja = '', apoioDisplay = '';       // reforço que ELA dá noutra loja
      const recebeApoio = [];                       // reforço que ELA recebe na sua loja

      // 1) Turno principal = a loja onde AMBOS os segmentos (manhã e tarde) têm
      //    formato de hora — um turno normal exporta sempre os dois. Um único
      //    segmento solto é reforço/apoio nessa loja, não o turno principal.
      for (const ap of appearances) {
        const top = (ap.entry.A[c] || '').trim();
        const bot = (ap.entry.B[c] || '').trim();
        if (hpsIsSchedule(top) && hpsIsSchedule(bot)) {
          loja = ap.store; display = top + ' · ' + bot; isWork = true;
        } else if (hpsIsSchedule(top) && !bot) {
          apoioLoja = ap.store; apoioDisplay = top;
        }
      }
      if (!isWork && apoioDisplay) {
        loja = apoioLoja; display = apoioDisplay; isWork = true;
        apoioLoja = ''; apoioDisplay = '';
      }
      // 2) Sem horário em lado nenhum — a primeira palavra que não seja o nome
      //    de outra loja (FOLGA, FÉRIAS, LICENÇA, BAIXA MEDICA, etc.).
      if (!isWork) {
        for (const ap of appearances) {
          const top = (ap.entry.A[c] || '').trim();
          if (top && !knownStoreNames.has(top.toUpperCase())) { display = top; loja = ap.store; break; }
        }
      }
      // 3) Nada encontrado — mostra o que houver, nunca fica em branco sem explicação.
      if (!display) {
        const any = appearances.find(ap => (ap.entry.A[c] || '').trim());
        if (any) { display = (any.entry.A[c] || '').trim(); loja = any.store; }
      }

      // 4) Reforço que ELA recebe: outras pessoas na SUA loja, nesse dia, com o
      //    padrão de 1 segmento só (apoio) — não ela própria.
      if (isWork && loja && storeByName[loja]) {
        storeByName[loja].people.forEach(p2 => {
          if (p2.name === personLabel) return;
          const t = (p2.A[c] || '').trim();
          const b = (p2.B[c] || '').trim();
          if (hpsIsSchedule(t) && !b) recebeApoio.push({ name: p2.name, time: t });
        });
      }

      dias.push({ dayName, date, loja, display, isWork, apoioLoja, apoioDisplay, recebeApoio });
    }
    hpsRenderModal(personLabel, dias);
  }

  function hpsEnsureStyles() {
    if (document.getElementById('hps-styles')) return;
    const style = document.createElement('style');
    style.id = 'hps-styles';
    style.textContent = `
      #hps-overlay { display:none; position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,.7); backdrop-filter:blur(3px); align-items:center; justify-content:center; }
      #hps-overlay.open { display:flex; }
      #hps-modal { background:#1a1a1a !important; border:1px solid #383838; border-radius:14px; width:min(94vw,560px); max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 40px rgba(0,0,0,.7); }
      #hps-modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:1px solid #2e2e2e; flex-shrink:0; }
      #hps-modal-title { font-size:.82rem; font-weight:800; letter-spacing:.04em; color:#fff !important; -webkit-text-fill-color:#fff !important; }
      #hps-modal-close { background:none; border:none; cursor:pointer; font-size:1.1rem; color:#888 !important; -webkit-text-fill-color:#888 !important; line-height:1; padding:2px 6px; border-radius:6px; }
      #hps-modal-close:hover { color:#fff !important; -webkit-text-fill-color:#fff !important; background:#333; }
      #hps-modal-body { overflow-y:auto; padding:14px 16px; flex:1; scrollbar-width:thin; scrollbar-color:#444 #1a1a1a; }
      .hps-day-row { display:flex; align-items:center; gap:10px; background:#222 !important; border:1px solid #2e2e2e; border-radius:10px; padding:10px 12px; margin-bottom:8px; }
      .hps-day-lbl { width:64px; flex-shrink:0; }
      .hps-day-name { font-size:.74rem; font-weight:800; letter-spacing:.06em; color:#fff !important; -webkit-text-fill-color:#fff !important; display:block; }
      .hps-day-date { font-size:.64rem; font-weight:700; color:#fff !important; -webkit-text-fill-color:#fff !important; display:block; }
      .hps-day-info { flex:1; text-align:right; }
      .hps-day-store { font-size:.62rem; font-weight:700; color:#fff !important; -webkit-text-fill-color:#fff !important; text-transform:uppercase; letter-spacing:.05em; margin-bottom:2px; }
      .hps-day-shift { font-size:.82rem; font-weight:800; color:#fff !important; -webkit-text-fill-color:#fff !important; }
      .hps-day-shift.off { color:#fff !important; -webkit-text-fill-color:#fff !important; font-style:italic; font-weight:700; }
      .hps-day-apoio, .hps-day-recebe { font-size:.68rem; font-weight:800; color:#fff !important; -webkit-text-fill-color:#fff !important; margin-top:3px; }
      .hps-person-name { text-decoration:underline; text-decoration-style:dotted; text-decoration-color:#999 !important; text-underline-offset:3px; transition:background .15s; }
      .hps-person-name:hover { background:#f2f2f2 !important; }
    `;
    document.head.appendChild(style);
  }

  function hpsEnsureModal() {
    hpsEnsureStyles();
    let overlay = document.getElementById('hps-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'hps-overlay';
    overlay.innerHTML = `
      <div id="hps-modal">
        <div id="hps-modal-header">
          <div id="hps-modal-title"></div>
          <button id="hps-modal-close">✕</button>
        </div>
        <div id="hps-modal-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) hpsCloseModal(); });
    document.getElementById('hps-modal-close').addEventListener('click', hpsCloseModal);
    return overlay;
  }

  function hpsCloseModal() {
    const overlay = document.getElementById('hps-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function hpsRenderModal(personLabel, dias) {
    const overlay = hpsEnsureModal();
    document.getElementById('hps-modal-title').textContent = personLabel;
    document.getElementById('hps-modal-body').innerHTML = dias.map(d => {
      const off = !d.isWork;
      const recebeHtml = (d.recebeApoio || []).map(r =>
        `<div class="hps-day-recebe">⚡ recebe reforço de ${escapeHtml(hpsStripHrs(r.name))}: ${escapeHtml(r.time)}</div>`
      ).join('');
      return `<div class="hps-day-row">
        <div class="hps-day-lbl">
          <span class="hps-day-name">${escapeHtml(d.dayName)}</span>
          <span class="hps-day-date">${escapeHtml(d.date)}</span>
        </div>
        <div class="hps-day-info">
          ${d.isWork ? `<div class="hps-day-store">${escapeHtml(d.loja)}</div>` : ''}
          <div class="hps-day-shift${off ? ' off' : ''}">${escapeHtml(d.display || '—')}</div>
          ${d.apoioDisplay ? `<div class="hps-day-apoio">⚡ reforço em ${escapeHtml(d.apoioLoja)}: ${escapeHtml(d.apoioDisplay)}</div>` : ''}
          ${recebeHtml}
        </div>
      </div>`;
    }).join('');
    overlay.classList.add('open');
  }

  function hpsBindNameClicks(rows) {
    document.querySelectorAll('#table-container .hps-person-name').forEach(td => {
      td.addEventListener('click', () => {
        const personLabel = td.dataset.hpsPerson;
        if (personLabel) showPersonWeekModal(personLabel, rows);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  AVISO PORTO SANTO — mensagem flutuante editável pelo admin
  //  · Tabela Supabase: porto_santo_aviso (linha única, id=1)
  //  · Admin: modal com switch ativo/inativo + textarea + guardar
  //  · Loja: ao entrar em Porto Santo, se ativo=true, mostra a mensagem
  // ══════════════════════════════════════════════════════════════
  const HAV_TABLE = 'porto_santo_aviso';

  async function havGetSB() {
    if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    }
    return null;
  }

  async function havLoad() {
    const sb = await havGetSB();
    if (!sb) return { ativo: false, mensagem: '' };
    try {
      const { data, error } = await sb.from(HAV_TABLE).select('ativo,mensagem').eq('id', 1).limit(1);
      if (error || !data || !data.length) return { ativo: false, mensagem: '' };
      return { ativo: !!data[0].ativo, mensagem: data[0].mensagem || '' };
    } catch (e) { return { ativo: false, mensagem: '' }; }
  }

  // Pré-carregamento: lançado logo após o login (em paralelo com a animação de
  // entrada + carregamento do horário), para que quando o dashboard aparecer
  // os dados do aviso já estejam prontos e o popup surja sem espera extra.
  let havPrefetchPromise = null;
  function havPrefetch() {
    if (!havPrefetchPromise) havPrefetchPromise = havLoad().catch(() => ({ ativo: false, mensagem: '' }));
    return havPrefetchPromise;
  }

  async function havSave(ativo, mensagem) {
    const sb = await havGetSB();
    if (!sb) return false;
    try {
      const { error } = await sb.from(HAV_TABLE).upsert({
        id: 1, ativo: ativo, mensagem: mensagem, updated_at: new Date().toISOString()
      });
      return !error;
    } catch (e) { return false; }
  }

  /* ── ADMIN: modal de edição ── */
  function havEnsureAdminStyles() {
    if (document.getElementById('hav-adm-styles')) return;
    const s = document.createElement('style');
    s.id = 'hav-adm-styles';
    s.textContent = [
      '#hav-adm-overlay{display:none;position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.7);backdrop-filter:blur(3px);align-items:center;justify-content:center;}',
      '#hav-adm-overlay.open{display:flex;}',
      '#hav-adm-modal{background:#1a1a1a!important;border:1px solid #383838;border-radius:14px;width:min(94vw,760px);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.7);}',
      '#hav-adm-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px 12px;border-bottom:1px solid #2e2e2e;flex-shrink:0;}',
      '#hav-adm-title{font-size:.82rem;font-weight:800;letter-spacing:.04em;color:#fff!important;-webkit-text-fill-color:#fff!important;white-space:nowrap;}',
      '#hav-adm-switch-row{display:flex;align-items:center;gap:8px;margin-left:auto;}',
      '#hav-adm-switch-lbl{font-size:.68rem;font-weight:700;color:rgba(255,255,255,.7)!important;-webkit-text-fill-color:rgba(255,255,255,.7)!important;white-space:nowrap;}',
      '.hav-switch{position:relative;width:38px;height:20px;display:inline-block;flex-shrink:0;}',
      '.hav-switch input{opacity:0;width:0;height:0;position:absolute;}',
      '.hav-slider{position:absolute;inset:0;background:#555;border-radius:20px;cursor:pointer;transition:background .2s;}',
      '.hav-slider:before{content:"";position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .2s;}',
      '#hav-adm-chk:checked+.hav-slider{background:#2a5a2a;}',
      '#hav-adm-chk:checked+.hav-slider:before{transform:translateX(18px);}',
      '#hav-adm-close{background:none;border:none;cursor:pointer;font-size:1.1rem;color:#888!important;-webkit-text-fill-color:#888!important;line-height:1;padding:2px 6px;border-radius:6px;flex-shrink:0;}',
      '#hav-adm-close:hover{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#333;}',
      '#hav-adm-body{overflow-y:auto;padding:16px 20px;flex:1;}',
      '#hav-adm-textarea{width:100%;height:62vh;min-height:320px;border:1px solid #383838;border-radius:8px;padding:10px 12px;font-size:.85rem;font-family:\'MontserratLight\',sans-serif;color:#fff!important;-webkit-text-fill-color:#fff!important;background:#222!important;resize:vertical;box-sizing:border-box;}',
      '#hav-adm-textarea::placeholder{color:#777!important;-webkit-text-fill-color:#777!important;}',
      '#hav-adm-textarea:focus{outline:none;border-color:#555;}',
      '#hav-adm-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 20px;border-top:1px solid #2e2e2e;flex-shrink:0;}',
      '#hav-adm-save-msg{font-size:.68rem;font-weight:700;color:#5caa5c!important;-webkit-text-fill-color:#5caa5c!important;}',
      '#hav-adm-save-btn{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;font-family:\'MontserratLight\',sans-serif;cursor:pointer;padding:8px 18px;border-radius:8px;border:1px solid #fff;background:#fff!important;color:#111!important;-webkit-text-fill-color:#111!important;transition:opacity .15s;}',
      '#hav-adm-save-btn:hover{opacity:.85;}',
      '#hav-adm-save-btn:disabled{opacity:.4;cursor:default;}'
    ].join('');
    document.head.appendChild(s);
  }

  function havEnsureAdminModal() {
    let overlay = document.getElementById('hav-adm-overlay');
    if (overlay) return overlay;
    havEnsureAdminStyles();
    overlay = document.createElement('div');
    overlay.id = 'hav-adm-overlay';
    overlay.innerHTML = `<div id="hav-adm-modal">
      <div id="hav-adm-header">
        <span id="hav-adm-title">aviso · porto santo</span>
        <div id="hav-adm-switch-row">
          <span id="hav-adm-switch-lbl">ativo</span>
          <label class="hav-switch">
            <input type="checkbox" id="hav-adm-chk">
            <span class="hav-slider"></span>
          </label>
        </div>
        <button id="hav-adm-close" title="fechar">&times;</button>
      </div>
      <div id="hav-adm-body">
        <textarea id="hav-adm-textarea" placeholder="mensagem que vai aparecer às funcionárias de porto santo ao entrarem…"></textarea>
      </div>
      <div id="hav-adm-footer">
        <span id="hav-adm-save-msg"></span>
        <button id="hav-adm-save-btn">guardar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) havCloseAdminModal(); });
    document.getElementById('hav-adm-close').addEventListener('click', havCloseAdminModal);
    document.getElementById('hav-adm-save-btn').addEventListener('click', havHandleSave);
    return overlay;
  }

  function havCloseAdminModal() {
    const overlay = document.getElementById('hav-adm-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  async function havHandleSave() {
    const btn   = document.getElementById('hav-adm-save-btn');
    const msgEl = document.getElementById('hav-adm-save-msg');
    const ativo = document.getElementById('hav-adm-chk').checked;
    const mensagem = document.getElementById('hav-adm-textarea').value;
    btn.disabled = true;
    msgEl.textContent = 'a guardar…';
    const ok = await havSave(ativo, mensagem);
    btn.disabled = false;
    msgEl.textContent = ok ? '✓ guardado' : 'erro ao guardar';
    if (ok) setTimeout(() => { if (msgEl.textContent === '✓ guardado') msgEl.textContent = ''; }, 2500);
  }

  async function havOpenAdmin() {
    const overlay = havEnsureAdminModal();
    const chk = document.getElementById('hav-adm-chk');
    const ta  = document.getElementById('hav-adm-textarea');
    document.getElementById('hav-adm-save-msg').textContent = '';
    chk.checked = false;
    ta.value = '';
    overlay.classList.add('open');
    const cur = await havLoad();
    chk.checked = !!cur.ativo;
    ta.value = cur.mensagem || '';
  }

  window._hAvisoAdmin = { open: havOpenAdmin };

  /* ── ADMIN: botão "aviso" só visível com Porto Santo selecionado ── */
  (function havWireAdminButton() {
    const sel = document.getElementById('h-store-select');
    if (!sel) return;
    function sync() {
      const host = document.getElementById('h-store-selector');
      let btn = document.getElementById('hav-adm-open-btn');
      if (sel.value === 'porto santo') {
        if (!btn && host) {
          btn = document.createElement('button');
          btn.id = 'hav-adm-open-btn';
          btn.type = 'button';
          btn.textContent = '📢 aviso porto santo';
          btn.style.cssText = 'margin-left:8px;padding:7px 14px;font-size:.72rem;font-weight:700;letter-spacing:.04em;cursor:pointer;border-radius:8px;font-family:inherit;background:#111!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border:1px solid #111!important;';
          btn.addEventListener('click', () => window._hAvisoAdmin.open());
          host.appendChild(btn);
        }
      } else if (btn) {
        btn.remove();
      }
    }
    sel.addEventListener('change', sync);
    sync();
  })();

  /* ── LOJA: janela flutuante ao entrar (só Porto Santo, só se ativo) ── */
  let havShownThisSession = false;

  function havEnsureViewStyles() {
    if (document.getElementById('hav-view-styles')) return;
    const s = document.createElement('style');
    s.id = 'hav-view-styles';
    s.textContent = [
      '#hav-view-overlay{display:none;position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);align-items:center;justify-content:center;}',
      '#hav-view-overlay.open{display:flex;}',
      '#hav-view-modal{background:#1a1a1a!important;border:1px solid #383838;border-radius:14px;width:min(94vw,760px);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.7);}',
      '#hav-view-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid #2e2e2e;flex-shrink:0;}',
      '#hav-view-title{font-size:.82rem;font-weight:800;letter-spacing:.06em;color:#fff!important;-webkit-text-fill-color:#fff!important;}',
      '#hav-view-close{background:none;border:none;cursor:pointer;font-size:1.1rem;color:#888!important;-webkit-text-fill-color:#888!important;line-height:1;padding:2px 6px;border-radius:6px;}',
      '#hav-view-close:hover{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#333;}',
      '#hav-view-body{overflow-y:auto;padding:18px 20px;flex:1;font-size:.85rem;font-weight:700;line-height:1.5;color:#fff!important;-webkit-text-fill-color:#fff!important;white-space:pre-wrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  async function havCheckAndShow() {
    if (havShownThisSession) return;
    let cur;
    try { cur = await havPrefetch(); } catch (e) { return; }
    if (!cur.ativo || !cur.mensagem || !cur.mensagem.trim()) return;
    havShownThisSession = true;
    havEnsureViewStyles();
    let overlay = document.getElementById('hav-view-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hav-view-overlay';
      overlay.innerHTML = `<div id="hav-view-modal">
        <div id="hav-view-header">
          <span id="hav-view-title">aviso</span>
          <button id="hav-view-close" title="fechar">&times;</button>
        </div>
        <div id="hav-view-body"></div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
      document.getElementById('hav-view-close').addEventListener('click', () => overlay.classList.remove('open'));
    }
    document.getElementById('hav-view-body').textContent = cur.mensagem;
    overlay.classList.add('open');
  }

  // ══════════════════════════════════════════════════════════════
  //  ÚLTIMA SEMANA PUBLICADA — badge discreto (só Porto Santo)
  //  · Tabela Supabase: porto_santo_ultima_semana (linha única, id=1,
  //    gravada pelo gerador-horarios.js sempre que publica uma semana)
  //  · Reaproveita havGetSB() já existente — não cria ligação nova
  //  · Mesma mecânica do aviso: aparece uma vez por sessão, ao fechar
  //    só volta a aparecer numa sessão nova (novo login)
  // ══════════════════════════════════════════════════════════════
  const HAV_ULTIMA_TABLE = 'porto_santo_ultima_semana';
  const HAV_BASE_DATE = new Date('2026-01-05T00:00:00');

  async function havUltimaSemanaLoad() {
    const sb = await havGetSB();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from(HAV_ULTIMA_TABLE).select('semana_inicio').eq('id', 1).limit(1);
      if (error || !data || !data.length || !data[0].semana_inicio) return null;
      return data[0].semana_inicio; // 'YYYY-MM-DD'
    } catch (e) { return null; }
  }

  let havUltimaPrefetchPromise = null;
  function havUltimaPrefetch() {
    if (!havUltimaPrefetchPromise) havUltimaPrefetchPromise = havUltimaSemanaLoad().catch(() => null);
    return havUltimaPrefetchPromise;
  }

  function havUltimaFormatLabel(semanaInicioISO) {
    const start = new Date(semanaInicioISO + 'T00:00:00');
    const weekNum = Math.round((start - HAV_BASE_DATE) / (7 * 86400000)) + 1;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    return 'Semana ' + weekNum + ' · ' + fmt(start) + ' – ' + fmt(end);
  }

  function havUltimaEnsureStyles() {
    if (document.getElementById('hav-ult-styles')) return;
    const s = document.createElement('style');
    s.id = 'hav-ult-styles';
    s.textContent = [
      '#hav-ult-badge{display:none;position:fixed;bottom:18px;right:18px;z-index:9400;align-items:center;gap:10px;background:#1a1a1a!important;border:1px solid #383838;border-radius:50px;padding:10px 14px 10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);max-width:min(88vw,340px);}',
      '#hav-ult-badge.show{display:flex;}',
      '@media (min-width:769px){ #hav-ult-badge{ left:18px; right:auto; } }',
      '#hav-ult-dot{width:8px;height:8px;border-radius:50%;background:#4caf50;flex-shrink:0;animation:hav-ult-pulse 1.8s ease-in-out infinite;}',
      '@keyframes hav-ult-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(76,175,80,.5);}50%{opacity:.55;box-shadow:0 0 0 5px rgba(76,175,80,0);}}',
      '#hav-ult-text{font-size:.72rem;font-weight:700;color:#fff!important;-webkit-text-fill-color:#fff!important;line-height:1.35;}',
      '#hav-ult-text b{font-weight:800;}',
      '#hav-ult-close{background:none;border:none;cursor:pointer;color:#888!important;-webkit-text-fill-color:#888!important;font-size:1rem;line-height:1;padding:2px 4px;border-radius:5px;flex-shrink:0;margin-left:2px;}',
      '#hav-ult-close:hover{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#333;}'
    ].join('');
    document.head.appendChild(s);
  }

  let havUltimaShownThisSession = false;
  async function havUltimaCheckAndShow() {
    if (havUltimaShownThisSession) return;
    let semanaISO;
    try { semanaISO = await havUltimaPrefetch(); } catch (e) { return; }
    if (!semanaISO) return;
    havUltimaShownThisSession = true;
    havUltimaEnsureStyles();
    let badge = document.getElementById('hav-ult-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'hav-ult-badge';
      badge.innerHTML = `<span id="hav-ult-dot"></span><span id="hav-ult-text"></span><button id="hav-ult-close" title="fechar">&times;</button>`;
      document.body.appendChild(badge);
      document.getElementById('hav-ult-close').addEventListener('click', () => badge.classList.remove('show'));
    }
    document.getElementById('hav-ult-text').innerHTML = 'Última semana publicada<br><b>' + escapeHtml(havUltimaFormatLabel(semanaISO)) + '</b>';
    badge.classList.add('show');
  }

})();
