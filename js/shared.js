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
      const { data, error } = await sbClient
        .from('claves')
        .select('tienda, rol')
        .eq('clave', userKey)
        .maybeSingle();

      if (error || !data) {
        alert('Senha incorreta');
        document.getElementById('key-input').value = '';
        document.getElementById('key-input').focus();
        btn.disabled = false;
        return;
      }

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
            showGreeting('administração', function() {
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

      } else {
        // ── LOGIN TIENDA ──
        currentStore = data.tienda;
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.tienda, function() {
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
  document.getElementById('key-input').addEventListener('keydown', function(e){ if(e.key==='Enter') attemptLogin(); });

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

    window._lastBlocks = filteredBlocks;
    startShiftCountdown(currentStore);
    document.getElementById('table-container').style.display='flex';

    const weekSelectId = 'week-select';
    if(!document.getElementById(weekSelectId)){
      const weekSelect = document.createElement('select');
      weekSelect.id = weekSelectId;
      filteredBlocks.forEach((_,i)=>{
        const op=document.createElement('option');
        op.value=i; op.textContent='SEMANA '+(i+1);
        weekSelect.appendChild(op);
      });
      document.getElementById('main-header-center').appendChild(weekSelect);
      weekSelect.addEventListener('change',()=>{ fadeRenderTable(filteredBlocks,parseInt(weekSelect.value)); });
    }

    const startWeek = findCurrentWeek(filteredBlocks);
    document.getElementById(weekSelectId).value=startWeek;
    fadeRenderTable(filteredBlocks,startWeek);

    setInterval(() => {
      const currentWeek = parseInt(document.getElementById(weekSelectId).value);
      renderSummary(filteredBlocks,currentWeek);
      highlightCurrentCell(filteredBlocks,currentWeek);
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
    let html='<table>';
    for(let r=0;r<2;r++){
      html+='<tr>';
      for(let c=0;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        html+=`<th class="${cls}" style="width:${colWidths[c]*12}px">${escapeHtml(headerRows[r][c]||'')}</th>`;
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
      html+=`<td class="name" rowspan="2" style="background:${bgA};width:${colWidths[0]*12}px">
              <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${circleColor};margin-right:5px;"></span>
              ${escapeHtml(A[0]||'')}</td>`;
      for(let c=1;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        const top=A[c]||'', bot=B[c]||'';
        if(top===bot && top!==''){
          html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${bgA};width:${colWidths[c]*12}px">${escapeHtml(top)}</td>`;
          rowspanCols.push(c);
        } else if(top!==''||bot!==''){
          const cont=[top,bot].filter(v=>v).map(escapeHtml).join('<br>');
          html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${bgA};width:${colWidths[c]*12}px">${cont}</td>`;
          rowspanCols.push(c);
        } else { html+=`<td class="${cls}" style="background:${bgA};width:${colWidths[c]*12}px"></td>`; }
      }
      html+=`</tr><tr class="${activeCls}">`;
      for(let c=1;c<cols;c++){ if(rowspanCols.includes(c)) continue;
        const cls=(c===todayCol?'today-col':'');
        html+=`<td class="${cls}" style="background:${bgB};width:${colWidths[c]*12}px">${escapeHtml(B[c]||'')}</td>`;
      }
      html+='</tr><tr>';
      for(let c=0;c<cols;c++){
        const cls=(c===todayCol?'today-col':'');
        html+=`<td class="bold-row ${cls}" style="background:#fff;width:${colWidths[c]*12}px">${escapeHtml(C[c]||'')}</td>`;
      }
      html+='</tr>';
    });
    html+='</table>';
    document.getElementById('table-container').innerHTML=html;
  }

  function renderPortoSanto(blocks, index) {
    const rows = blocks[index];
    const cols = Math.max(...rows.map(r => r.length));
    let html = '<table>';
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
        html += `<th style="width:${colWidths[0]*12}px">${escapeHtml(row[0])}</th>`;
        for (let c = 1; c < cols; c++) {
          html += `<th style="width:${colWidths[c]*12}px">${escapeHtml(row[c] || '')}</th>`;
        }
        html += '</tr>'; i++; continue;
      }
      const todayCol = findTodayColPS(row);
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const cls = (c === todayCol ? 'today-col' : '');
        html += `<th class="${cls}" style="width:${colWidths[c]*12}px">${escapeHtml(row[c] || '')}</th>`;
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
        html += `<td class="name" style="white-space:nowrap;width:${colWidths[0]*12}px">
                  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${circleColor};margin-right:5px;"></span>
                  ${escapeHtml(A[0]||'')}
                 </td>`;
        for (let c = 1; c < cols; c++) {
          const cls = (c === todayCol ? 'today-col' : '');
          const morning = (A[c] || '').trim().toUpperCase();
          const afternoon = (B[c] || '').trim().toUpperCase();
          let content = '';
          const specialWords = ['FOLGA', 'FERIAS'];
          if (morning && morning === afternoon && specialWords.includes(morning)) {
            content = `<div style="text-align:center">${escapeHtml(morning)}</div>`;
          } else if (morning && afternoon) {
            content = `${escapeHtml(A[c])}<br>${escapeHtml(B[c])}`;
          } else {
            content = escapeHtml(A[c] || B[c] || '');
          }
          html += `<td class="${cls}" style="width:${colWidths[c]*12}px; text-align:center;">${content}</td>`;
        }
        html += '</tr>'; i += 2;
      }
    }
    html += '</table>';
    document.getElementById('table-container').innerHTML = html;
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

})();
