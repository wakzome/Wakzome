// ══════════════════════════════════════════════════════════════
//  NÚCLEO DA APLICAÇÃO — horários (empregada + admin), PROTEGIDO
// ══════════════════════════════════════════════════════════════
//  Carregado só DEPOIS do login, por loadProtectedScripts() em shared.js
//  — NÃO está em PUBLIC_JS (middleware.js), por isso um visitante sem
//  sessão recebe 401 e nunca vê este código. Toda a lógica de negócio de
//  horários vive aqui: renderização da vista empregada, cobertura,
//  aviso, badge, e o painel de administração completo (secção final).
//  Índice:
//    1. Estado interno (modo Funchal unificado)
//    2. Contagem decrescente de turno (vista empregada)
//    3. window._empRender / window._hRender — API para shared.js e
//       para a secção do painel admin (final deste ficheiro)
//    4. Carga e renderização de horários (vista empregada)
//    5. Estilo "glass" partilhado (Porto Santo + Funchal)
//    6. Atualização ao vivo da tabela (sem reload)
//    7. Cobertura Porto Santo (reaproveita o motor do Funchal)
//    8. Modal de horário individual (Porto Santo)
//    9. Aviso editável (Porto Santo + Funchal)
//   10. Badge "última semana publicada" (Porto Santo)
//   11. Arranque incondicional (observers + estilos ao vivo)
//   12. Painel de administração de horários (admin-horarios)
// ══════════════════════════════════════════════════════════════
(function(){

  let _isFunchalUnificadoMode = false;

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

  // Exposto para o attemptLogin de shared.js poder chamar depois do login
  // (mesma convenção de window._hRender, usado pelo admin-horarios.js).
  window._empRender = {
    loadData: function(store){ return loadData(store); },
    havPrefetch: function(loja){ return havPrefetch(loja); },
    havUltimaPrefetch: function(){ return havUltimaPrefetch(); }
  };

  // Expose render functions for admin horarios tab
  window._hRender = {
    table: renderTable,
    porto: renderPortoSanto,
    funchal: renderFunchalUnificado,
    findCurrentWeek: findCurrentWeek,
    // Porto Santo NÃO liga o botão/painel de cobertura dentro de
    // renderPortoSanto (ao contrário do funchal) — depende de um
    // MutationObserver ligado ao #table-container ORIGINAL (ver o final
    // deste ficheiro). O painel admin (admin-horarios.js) faz um "swap" de id em
    // #table-container para desviar o render para a sua própria área, o
    // que faz esse observer nunca disparar (está a observar um nó
    // diferente). Por isso expomos aqui a MESMA função que o observer
    // chamaria, para o admin a invocar diretamente depois de renderizar
    // Porto Santo — precisa de window._lastBlocks + #week-select.value
    // corretos antes de chamar (ver portoSantoCurrentRowsIfActive).
    refreshPortoSantoCoverage: function(){ portoSantoOnTableMutated(); }
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
    const isFunchalUnificado = (store === 'funchal');
    _isFunchalUnificadoMode = isFunchalUnificado;
    window._isFunchalUnificadoMode = isFunchalUnificado;
    const csvUrl = isFunchalUnificado
      ? 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/FUNCHAL.csv'
      : 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/datosfnc.csv';
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

    let filteredBlocks;
    if (isFunchalUnificado) {
      // FUNCHAL.csv contém só os blocos desta loja unificada (Mezka Funchal +
      // Parfois Arcadas, várias semanas intercaladas) — usar todos tal como vêm.
      filteredBlocks = blocks;
    } else {
      const nameMapping = {
        "mezka funchal": "mezka funchal",
        "parfois arcadas são francisco": "parfois arcadas",
        "porto santo": "porto santo"
      };
      const searchName = nameMapping[store];
      filteredBlocks = blocks.filter(b => b[0][0].toLowerCase() === searchName);
    }
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
    if (store === 'porto santo') havCheckAndShow('porto santo');
    if (store === 'funchal') havCheckAndShow('funchal');
    if (store === 'porto santo') havUltimaCheckAndShow();
    startShiftCountdown(store);
    document.getElementById('table-container').style.display='flex';

    const weekSelectId = 'week-select';
    if(!document.getElementById(weekSelectId)){
      const weekSelect = document.createElement('select');
      weekSelect.id = weekSelectId;
      finalBlocks.forEach((block,i)=>{
        const op=document.createElement('option');
        op.value=i;
        if (isFunchalUnificado) {
          const semanaTxt = (block[1] && block[1][0]) ? block[1][0] : ('SEMANA '+(i+1));
          const lojaTxt   = (block[0] && block[0][0]) ? block[0][0] : '';
          op.textContent  = semanaTxt + (lojaTxt ? (' · ' + lojaTxt) : '');
        } else {
          op.textContent = 'SEMANA '+(i+1);
        }
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
      if(_isFunchalUnificadoMode){
        renderFunchalUnificado(blocks, index);
      } else {
        const firstCell = (blocks[index][0][0] || '').trim().toLowerCase();
        if(firstCell === 'porto santo'){ renderPortoSanto(blocks, index); }
        else { renderTable(blocks, index); }
      }
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

  // ══════════════════════════════════════════════════════════════
  //  ESTILO "GLASS" PARTILHADO — usado tanto por Porto Santo
  //  (renderPortoSanto) como pelo funchal unificado (buildSubTable /
  //  renderFunchalUnificado), para os dois terem exatamente o mesmo
  //  visual apesar de virem de funções e formatos de dados diferentes.
  //  É glassmorphism (blur + transparência + gradiente + highlight
  //  especular estático via inset) — a aproximação leve e compatível
  //  com todos os browsers/dispositivos que a web permite; não é o
  //  material "Liquid Glass" nativo da Apple (esse usa refração real
  //  e especularidade dinâmica via GPU shaders do próprio sistema
  //  operativo, sem equivalente performático na web).
  // ══════════════════════════════════════════════════════════════
  const FX_GLASS_CARD = 'background:linear-gradient(135deg, rgba(255,255,255,.72) 0%, rgba(255,255,255,.48) 100%);'
    + 'backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);'
    + 'border:1px solid rgba(255,255,255,.75);border-radius:16px;'
    + 'box-shadow:0 8px 30px rgba(0,0,0,.07), inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(0,0,0,.03);'
    + 'padding:18px 16px 14px;';
  const FX_TH_NORMAL = 'background:linear-gradient(180deg, rgba(42,44,50,.94) 0%, rgba(26,28,34,.94) 100%);color:#fff;';
  const FX_TH_TODAY  = 'background:linear-gradient(180deg, rgba(70,152,235,.22) 0%, rgba(56,142,235,.14) 100%);color:#1a3a5c;';
  const FX_CELL_BG       = 'rgba(255,255,255,.45)';
  const FX_CELL_BG_TODAY = 'rgba(56,142,235,.10)';
  function fxDotGlow(circleColor){
    return circleColor === 'green' ? '0 0 6px 1px rgba(42,138,42,.55)' : '0 0 6px 1px rgba(190,50,50,.35)';
  }

  function renderPortoSanto(blocks, index) {
    // Reforça a flag global (normalmente definida por loadData ao trocar de
    // loja) sempre que este render corre — garante que
    // funchalCovBuildForCurrentStore nunca lê um valor desatualizado, quer
    // dizendo respeito ao fluxo normal da app quer a uma chamada direta a
    // window._hRender.porto (ex.: testes, ou navegação de semana).
    window._isFunchalUnificadoMode = false;
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
        html += `<th style="width:${colWidths[0]*12}px;${FX_TH_NORMAL}text-align:center;padding:6px 4px;">${escapeHtml(row[0])}</th>`;
        for (let c = 1; c < cols; c++) {
          html += `<th style="width:${colWidths[c]*12}px;${FX_TH_NORMAL}text-align:center;padding:6px 4px;">${escapeHtml(row[c] || '')}</th>`;
        }
        html += '</tr>'; i++; continue;
      }
      const todayCol = findTodayColPS(row);
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const cls = (c === todayCol ? 'today-col' : '');
        // Mesmos tons do cabeçalho do funchal unificado (FX_TH_NORMAL/
        // FX_TH_TODAY) — visual idêntico entre as duas vistas.
        const bg = (c === todayCol ? FX_TH_TODAY : FX_TH_NORMAL);
        html += `<th class="${cls}" style="width:${colWidths[c]*12}px;${bg}text-align:center;padding:6px 4px;">${escapeHtml(row[c] || '')}</th>`;
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
        // Mesmo fundo subtil, destaque da coluna de hoje e glow da bolinha
        // usados no funchal unificado (FX_CELL_BG*/fxDotGlow) — visual
        // idêntico entre as duas vistas, apesar de virem de dados diferentes.
        html += `<tr class="${activeCls}">`;
        html += `<td class="name hps-person-name" data-hps-person="${escapeHtml(A[0]||'')}" style="background:${FX_CELL_BG};width:${colWidths[0]*12}px;text-align:center;justify-content:center;cursor:pointer;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${circleColor};box-shadow:${fxDotGlow(circleColor)};margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>
                  ${escapeHtml(A[0]||'')}
                 </td>`;
        for (let c = 1; c < cols; c++) {
          const cls = (c === todayCol ? 'today-col' : '');
          const cellBg = (c === todayCol ? FX_CELL_BG_TODAY : FX_CELL_BG);
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
          html += `<td class="${cls}" style="background:${cellBg};width:${colWidths[c]*12}px;text-align:center;${nw}">${content}</td>`;
        }
        html += '</tr>'; i += 2;
      }
    }
    html += '</table>';
    // Mesmo card "glass" usado no funchal unificado (FX_GLASS_CARD) — como
    // aqui é uma única tabela contínua (as 4 sub-lojas intercaladas, ao
    // contrário do funchal que usa um card por sub-loja), envolve-se a
    // tabela inteira num só card, mantendo hpsBindNameClicks a funcionar
    // normalmente (usa querySelectorAll, não depende do pai direto).
    document.getElementById('table-container').innerHTML =
      '<div class="funchal-store-card" style="' + FX_GLASS_CARD + '">' + html + '</div>';
    hpsBindNameClicks(rows);
    funchalBindRowHoverEffect();
  }

  // ── FUNCHAL UNIFICADO: junta Mezka Funchal + Parfois Arcadas da mesma
  //    "SEMANA N" numa única vista, empilhadas verticalmente (2 linhas por
  //    pessoa, sem linha de totais; nomes clicáveis, igual ao Porto Santo) ──
  function renderFunchalUnificado(allBlocks, index){
    const current = allBlocks[index];
    if(!current) return;
    // Mesmo reforço que em renderPortoSanto — esta função SABE que está a
    // renderizar o funchal, não precisa de confiar em loadData ter corrido
    // antes (nem sempre corre, ex.: chamada direta a window._hRender.funchal).
    // Só depois do guard acima, para nunca marcar "modo funchal" num render
    // que na prática não aconteceu.
    window._isFunchalUnificadoMode = true;
    const semanaKey = (current[1] && current[1][0]) || '';
    const groupBlocks = allBlocks.filter(b => ((b[1] && b[1][0]) || '') === semanaKey);
    // Guardado para funchalCovBuildForCurrentStore poder reconstruir o
    // painel de cobertura a qualquer momento (ex.: ao entrar no modo
    // dividido), sem precisar de re-passar argumentos por todo o lado.
    window._lastFunchalGroupBlocks = groupBlocks;

    function buildSubTable(rows, hoursMap, targetPersonCount, sharedColWidths){
      const headerRows = rows.slice(0,2);
      const dataRows   = rows.slice(2);
      const storeSlug = ((rows[0] && rows[0][0]) || '').toLowerCase().replace(/[^a-z0-9]+/g,'-');
      // Larguras de coluna partilhadas entre TODAS as sub-lojas do funchal
      // (calculadas uma única vez, fora desta função) — garante que Mezka
      // Funchal e Parfois Arcadas ficam sempre alinhadas, em vez de cada
      // tabela calcular a sua própria largura a partir só do seu texto.
      const colWidths = sharedColWidths;
      const cols = colWidths.length;
      const todayCol = findTodayCol(headerRows[1])+1;

      // Agrupar linhas por pessoa: no FUNCHAL.csv o nome repete-se em todas as
      // linhas dessa pessoa (não fica em branco na 2ª linha) — agrupar por
      // corridas consecutivas do mesmo nome. Robusto a qualquer nº de linhas.
      const persons=[];
      let cur=null, curName=null;
      dataRows.forEach(row=>{
        const name=(row[0]||'').trim();
        if(cur===null || name!==curName){
          if(cur) persons.push(cur);
          cur=[row];
          curName=name;
        } else {
          cur.push(row);
        }
      });
      if(cur) persons.push(cur);

      // Preencher com linhas-fantasma (invisíveis, mas ocupam espaço) até ao
      // máximo histórico de pessoas desta loja — mantém a altura da tabela
      // constante entre semanas, para as setas/botão de cobertura no topo do
      // modal nunca mudarem de posição no ecrã consoante quem trabalha nessa semana.
      while (persons.length < (targetPersonCount||0)) {
        persons.push([
          ['', ...Array(cols-1).fill('09:30-13:00')],
          ['', ...Array(cols-1).fill('14:00-18:30')]
        ]);
      }

      let html='<table style="margin:0 auto;border-collapse:separate;border-spacing:0;">';
      for(let r=0;r<2;r++){
        html+='<tr>';
        for(let c=0;c<cols;c++){
          const cls=(c===todayCol?'today-col':'');
          // Mesmas constantes partilhadas com Porto Santo (FX_TH_NORMAL/
          // FX_TH_TODAY) — garante visual idêntico entre as duas vistas.
          const thBg = (c===todayCol ? FX_TH_TODAY : FX_TH_NORMAL);
          const thWrap=(c===0?'':'white-space:nowrap;');
          html+=`<th class="${cls}" style="width:${colWidths[c]*12}px;${thBg}${thWrap}text-align:center;padding:6px 4px;">${escapeHtml(headerRows[r][c]||'')}</th>`;
        }
        html+='</tr>';
      }
      persons.forEach((p, pIdx)=>{
        const A = p[0] || Array(cols).fill('');
        const B = p[1] || Array(cols).fill('');
        const isPlaceholder = !(A[0]||'').trim();
        // Mesmas constantes partilhadas com Porto Santo (FX_CELL_BG/
        // FX_CELL_BG_TODAY) — garante visual idêntico entre as duas vistas.
        const bg = FX_CELL_BG;
        const cellBg = (isToday) => isToday ? FX_CELL_BG_TODAY : FX_CELL_BG;
        let circleColor='red', isActiveNow=false, todayHorarios=[];
        if (!isPlaceholder) {
          for(let c=1;c<cols;c++){
            const colDate=headerRows[1][c]; if(!colDate) continue;
            const parts=colDate.split('/'); if(parts.length!==3) continue;
            const d=new Date(+parts[2],parts[1]-1,+parts[0]);
            if(d.toDateString()===new Date().toDateString()){
              todayHorarios=[A[c],B[c]].filter(v=>v);
              if(todayHorarios.some(h=>isNowInSchedule(h))){ circleColor='green'; isActiveNow=true; }
            }
          }
        }
        const activeCls = isActiveNow ? ' tr-active-now' : '';
        const rowVis = isPlaceholder ? 'visibility:hidden;' : '';
        const nameRaw = A[0]||'';
        const hrsLabel = funchalFormatHrs((hoursMap && hoursMap[nameRaw.trim()]) || 0);
        // data-live-id liga a bolinha às 2 <tr> desta pessoa, para o timer de
        // 30 em 30 min (funchalUpdateLiveDots) as encontrar e atualizar sem
        // precisar de re-renderizar a tabela nem recarregar a página.
        const liveId = 'fx-' + storeSlug + '-' + pIdx;
        const liveIdAttr = isPlaceholder ? '' : ` data-live-id="${liveId}"`;
        // Mesma função partilhada com Porto Santo (fxDotGlow) — o glow
        // fica sempre sincronizado com a cor, tanto aqui como no tick de
        // funchalUpdateLiveDots (30 em 30 min).
        const dotGlow = fxDotGlow(circleColor);
        let rowspanCols=[];
        html+=`<tr class="${activeCls}" style="${rowVis}"${liveIdAttr}>`;
        html+=`<td class="name hps-person-name" data-hps-person="${escapeHtml(nameRaw)}" rowspan="2" style="background:${bg};width:${colWidths[0]*12}px;text-align:center;justify-content:center;cursor:pointer;">
                <span class="funchal-live-dot" data-today="${escapeHtml(todayHorarios.join('|'))}"${liveIdAttr} style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${circleColor};box-shadow:${dotGlow};margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>
                ${escapeHtml(nameRaw)}<br>${hrsLabel}</td>`;
        for(let c=1;c<cols;c++){
          const cls=(c===todayCol?'today-col':'');
          const top=A[c]||'', bot=B[c]||'';
          const isSchedule = v => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v.trim());
          const topNw = isSchedule(top)||top===''||top.toUpperCase()==='FOLGA'||top.toUpperCase()==='FERIAS';
          const botNw = isSchedule(bot)||bot===''||bot.toUpperCase()==='FOLGA'||bot.toUpperCase()==='FERIAS';
          const nw = (topNw && botNw) ? 'white-space:nowrap;' : '';
          if(top===bot && top!==''){
            html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${cellBg(c===todayCol)};width:${colWidths[c]*12}px;${nw}text-align:center;">${escapeHtml(top)}</td>`;
            rowspanCols.push(c);
          } else if(top!==''||bot!==''){
            const cont=[top,bot].filter(v=>v).map(escapeHtml).join('<br>');
            html+=`<td class="multi-line ${cls}" rowspan="2" style="background:${cellBg(c===todayCol)};width:${colWidths[c]*12}px;${nw}text-align:center;">${cont}</td>`;
            rowspanCols.push(c);
          } else { html+=`<td class="${cls}" style="background:${cellBg(c===todayCol)};width:${colWidths[c]*12}px;text-align:center;"></td>`; }
        }
        html+=`</tr><tr class="${activeCls}" style="${rowVis}"${liveIdAttr}>`;
        for(let c=1;c<cols;c++){ if(rowspanCols.includes(c)) continue;
          const cls=(c===todayCol?'today-col':'');
          html+=`<td class="${cls}" style="background:${cellBg(c===todayCol)};width:${colWidths[c]*12}px;text-align:center;">${escapeHtml(B[c]||'')}</td>`;
        }
        html+='</tr>';
      });
      html+='</table>';
      return html;
    }

    const hoursMap = funchalCollectPersonWeekHours(groupBlocks);
    const maxPersonCountByStore = funchalMaxPersonCountByStore(allBlocks);

    // Larguras de coluna unificadas entre TODAS as sub-lojas desta semana —
    // calculadas uma única vez a partir de todos os groupBlocks, para as
    // tabelas de Mezka Funchal e Parfois Arcadas ficarem sempre alinhadas
    // (mesma largura de coluna), em vez de cada uma variar consoante o
    // comprimento dos seus próprios nomes/horários.
    const sharedCols = Math.max(...groupBlocks.map(block => Math.max(...block.map(r=>r.length))));
    const sharedColWidths = Array(sharedCols).fill(0);
    groupBlocks.forEach(block => block.forEach(r => r.forEach((c,i) => {
      sharedColWidths[i] = Math.max(sharedColWidths[i], c.length);
    })));

    let combined = '';
    groupBlocks.forEach(block=>{
      const storeName = (block[0] && block[0][0]) ? block[0][0] : '';
      const targetCount = maxPersonCountByStore[storeName] || 0;
      // Mesmo card partilhado com Porto Santo (FX_GLASS_CARD) — glassmorphism
      // com highlight especular estático (inset) e gradiente de profundidade;
      // só a "casca" visual muda, estrutura/lógica da tabela (buildSubTable)
      // ficam intactas.
      combined += '<div class="funchal-store-card" style="margin-bottom:22px;' + FX_GLASS_CARD + '">'
                + '<div style="font-weight:700;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;margin:0 0 10px;text-align:center;color:#333;">' + escapeHtml(storeName) + '</div>'
                + buildSubTable(block, hoursMap, targetCount, sharedColWidths)
                + '</div>';
    });

    // wrapper único para neutralizar o display:flex (row) que loadData() aplica a
    // #table-container — garante que as sub-lojas empilham na vertical (uma por
    // baixo da outra), em vez de ficarem lado a lado como itens do mesmo flex row.
    // #funchal-tables-wrap/#funchal-tables-scale: em telemóvel mantêm o
    // tamanho natural (scroll H+V, ver funchalFitTablesToScreen); em tablet/
    // desktop, se não couber na largura do ecrã, é encolhido (scale) como um
    // todo — as duas tabelas partilham a mesma largura de coluna, por isso
    // permanecem alinhadas em qualquer um dos dois modos.
    document.getElementById('table-container').innerHTML =
      '<div style="display:flex;flex-direction:column;width:100%;">'
      +   '<div id="funchal-tables-wrap" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">'
      +     '<div id="funchal-tables-scale" style="display:inline-block;">'
      +       combined
      +     '</div>'
      +   '</div>'
      + '</div>';

    hpsBindNameClicksFunchal(groupBlocks);
    funchalBindRowHoverEffect();

    // Painel de cobertura: atualiza qualquer alvo já aberto (overlay mobile
    // OU painel dividido em PC) com os dados desta semana — mantém tudo
    // sincronizado ao navegar entre semanas. Não abre nada por si só; só o
    // clique no botão (funchalCovToggle) decide abrir/fechar.
    funchalCovRefreshAllTargets();

    // Botão "cobertura" na barra do modal de horários (#wz-hor-modal-bar,
    // definida no index.html) — em vez de dentro de #table-container, para
    // não criar scroll vertical extra; mesma posição usada por Porto Santo
    // (ver funchalCovBarEnsureButton). O index.html não precisa de voltar a
    // ser tocado para ajustar este botão no futuro.
    funchalCovBarEnsureButton(funchalCovToggle);

    // Bolinhas + ponto da cobertura: aplicar o estado atual já neste render,
    // e arrancar (uma única vez) o timer que os mantém corretos a cada 30
    // minutos certos do relógio, sem precisar de recarregar a página.
    funchalEnsureLiveStyles();
    funchalUpdateLiveDots();
    funchalUpdateCoverageHourMarker();
    funchalEnsureLiveTicker();

    // Ajustar as duas tabelas ao ecrã (tablet/desktop) ou manter scroll
    // natural (telemóvel) — ver funchalFitTablesToScreen.
    funchalFitTablesToScreen();
    funchalEnsureResizeListener();
  }

  // Telemóvel (<=700px): mantém o tamanho natural das tabelas, com scroll
  // horizontal e vertical — encolher mais neste tamanho tornaria os horários
  // difíceis de ler. Tablet/desktop (>700px): se a largura natural das duas
  // tabelas juntas exceder o espaço disponível, encolhe-as (scale) como um
  // todo até caberem exatamente, sem scroll horizontal — como partilham a
  // mesma largura de coluna (sharedColWidths), o alinhamento mantém-se.
  function funchalFitTablesToScreen(){
    // Funchal tem wrap/inner dedicados (2 tabelas lado a lado). Porto Santo
    // não tem — usa #table-container diretamente como wrap, e o seu único
    // filho direto (.funchal-store-card, a tabela envolvida no card glass)
    // como elemento a escalar. Mesmo mecanismo para as duas, sem duplicar
    // lógica: necessário para o modo dividido de cobertura (a coluna
    // disponível para a tabela de horários encolhe quando o painel de
    // cobertura aparece ao lado) nunca gerar scroll horizontal em nenhuma
    // das duas lojas.
    let wrap  = document.getElementById('funchal-tables-wrap');
    let inner = document.getElementById('funchal-tables-scale');
    if (!wrap || !inner) {
      wrap = document.getElementById('table-container');
      inner = wrap && wrap.querySelector(':scope > .funchal-store-card');
    }
    if (!wrap || !inner) return;

    // Repor antes de medir, para não acumular escalas de ajustes anteriores.
    inner.style.transform = '';
    inner.style.transformOrigin = '';
    wrap.style.height = '';

    if (window.innerWidth <= 700) return; // telemóvel: comportamento natural

    const naturalWidth  = inner.scrollWidth;
    const naturalHeight = inner.scrollHeight;
    const availWidth    = wrap.clientWidth;
    if (naturalWidth > availWidth && naturalWidth > 0) {
      const scale = availWidth / naturalWidth;
      inner.style.transformOrigin = 'top left';
      inner.style.transform = 'scale(' + scale + ')';
      // Compensa o espaço reservado no documento (transform não reflui o
      // layout), para não sobrar scroll nem espaço vazio por baixo.
      wrap.style.height = (naturalHeight * scale) + 'px';
    }
  }

  // Reajusta ao rodar o ecrã ou redimensionar a janela (ex.: iPad portrait →
  // landscape), sem precisar reabrir o modal. Um só listener por carregamento
  // de página (flag module-level), tal como funchalEnsureLiveTicker.
  let _funchalResizeListenerAdded = false;
  function funchalEnsureResizeListener(){
    if (_funchalResizeListenerAdded) return;
    _funchalResizeListenerAdded = true;
    let resizeTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(funchalFitTablesToScreen, 150);
    });
    window.addEventListener('orientationchange', function(){
      setTimeout(funchalFitTablesToScreen, 250);
    });
  }

  // ── Horas semanais + painel de cobertura para a vista FUNCHAL UNIFICADO —
  //    réplica fiel do algoritmo de "Cobertura por hora" do gerador de
  //    horários (buildCoveragePanel): mesma janela horária dinâmica por loja,
  //    mesma regra de sobreposição (s < H+1 && e > H) e mesmas cores por
  //    contagem. Adaptado para ler diretamente das linhas do CSV (em vez do
  //    estado S.schedule do gerador) — nada no gerador é tocado. ──
  function funchalToHrs(s){
    if(!s) return NaN;
    const parts = s.split(':').map(Number);
    if(isNaN(parts[0])) return NaN;
    return parts[0] + (isNaN(parts[1]) ? 0 : parts[1]) / 60;
  }

  function funchalFormatHrs(totalHrs){
    const rounded = Math.round((totalHrs||0) * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + 'hrs';
  }

  // Nº máximo de pessoas que ALGUMA VEZ apareceu em cada loja, em qualquer
  // semana do CSV — usado para reservar sempre o mesmo nº de linhas por loja,
  // para a caixa do modal (centrada pelo index.html) não mudar de altura
  // consoante a semana, o que faria as setas "saltarem" de posição no ecrã.
  function funchalMaxPersonCountByStore(allBlocks){
    const maxByStore = {};
    allBlocks.forEach(block=>{
      const storeName = (block[0] && block[0][0]) ? block[0][0] : '';
      const dataRows = block.slice(2);
      let count=0, curName=null;
      dataRows.forEach(row=>{
        const name=(row[0]||'').trim();
        if(count===0 || name!==curName){ count++; curName=name; }
      });
      if(!maxByStore[storeName] || count>maxByStore[storeName]) maxByStore[storeName]=count;
    });
    return maxByStore;
  }

  // Soma as horas de TODOS os turnos de cada pessoa nas duas lojas da semana
  // (uma pessoa em reforço soma a loja de origem + a loja onde reforça —
  // sem duplicar, porque cada turno só está escrito na loja onde acontece).
  function funchalCollectPersonWeekHours(groupBlocks){
    const totals = {};
    groupBlocks.forEach(block=>{
      const dataRows = block.slice(2);
      let cur=null, curName=null;
      const flush = () => {
        if(!cur) return;
        let sum = totals[curName] || 0;
        cur.forEach(row=>{
          for(let c=1;c<row.length;c++){
            const v=(row[c]||'').trim();
            if(!hpsIsSchedule(v)) continue;
            const [a,b]=v.split('-');
            const s=funchalToHrs(a), e=funchalToHrs(b);
            if(!isNaN(s) && !isNaN(e) && e>s) sum += (e-s);
          }
        });
        totals[curName]=sum;
      };
      dataRows.forEach(row=>{
        const name=(row[0]||'').trim();
        if(cur===null || name!==curName){ flush(); cur=[row]; curName=name; }
        else cur.push(row);
      });
      flush();
    });
    return totals;
  }

  function funchalFormatHourLabel(H){
    const hh = Math.floor(H);
    const mm = Math.round((H - hh) * 60);
    return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  // Normaliza os blocos independentes do funchal para a forma partilhada
  // [{storeName, dayHeader, people:[{name,A,B}]}] — mesmo agrupamento
  // consecutivo-por-nome usado em buildSubTable. Extraído para função
  // própria (em vez de inline) para poder ser reutilizado tanto pelo grid
  // padrão (funchalBuildCoveragePanel) como pela disposição do modo
  // dividido (funchalCovBuildForCurrentStoreSections) sem duplicar nada.
  function funchalNormalizeGroupBlocksForCoverage(groupBlocks){
    return groupBlocks.map(block=>{
      const storeName = (block[0] && block[0][0]) ? block[0][0] : '';
      const dayHeader  = block[0].slice(1);
      // Datas completas (DD/MM/YYYY) desta semana, na mesma ordem do
      // dayHeader — necessárias para saber se a semana atualmente
      // consultada é mesmo a que contém o dia de hoje (ver dateHeader em
      // funchalBuildCoverageSections).
      const dateHeader = (block[1] || []).slice(1);
      const dataRows   = block.slice(2);
      const people = [];
      let cur=null, curName=null;
      dataRows.forEach(row=>{
        const name=(row[0]||'').trim();
        if(cur===null || name!==curName){
          if(cur) people.push({ name: curName, A: cur[0], B: cur[1]||cur[0] });
          cur=[row]; curName=name;
        } else cur.push(row);
      });
      if(cur) people.push({ name: curName, A: cur[0], B: cur[1]||cur[0] });
      return { storeName, dayHeader, dateHeader, people };
    });
  }

  function funchalBuildCoveragePanel(groupBlocks){
    return funchalBuildCoveragePanelFromStores(funchalNormalizeGroupBlocksForCoverage(groupBlocks));
  }

  // Porto Santo: reaproveita hpsCollectStores (já existente, usado pela modal
  // por pessoa) para obter as sub-lojas do bloco nested-marker, e normaliza
  // para a mesma forma partilhada — não duplica nenhuma lógica de parsing.
  // Também extraída para função própria pelo mesmo motivo que
  // funchalNormalizeGroupBlocksForCoverage.
  function portoSantoNormalizeRowsForCoverage(rows){
    const { dayHeaderRow, stores } = hpsCollectStores(rows);
    return stores.map(s => ({
      storeName: s.name,
      dayHeader: (dayHeaderRow || []).slice(1),
      // s.dateRow já vem de hpsCollectStores (datas completas DD/MM/YYYY
      // desta sub-loja) — mesmo propósito que em
      // funchalNormalizeGroupBlocksForCoverage.
      dateHeader: (s.dateRow || []).slice(1),
      people: s.people
    }));
  }

  function portoSantoBuildCoveragePanel(rows){
    // Porto Santo: intervalos hora-a-hora (9, 10, 11…), ao contrário do
    // funchal que mantém 30 em 30 min — único parâmetro que muda.
    return funchalBuildCoveragePanelFromStores(portoSantoNormalizeRowsForCoverage(rows), 1);
  }

  // Núcleo genérico e partilhado do painel de cobertura — recebe uma lista
  // já normalizada [{storeName, dayHeader, people:[{name,A,B}]}] e devolve o
  // HTML de cada loja SEPARADAMENTE (array [{storeName, html}]), sem as
  // montar em nenhuma grelha — usado tanto pelo grid padrão do modal/overlay
  // (funchalBuildCoveragePanelFromStores, ordem natural, 2 colunas) como
  // pela disposição específica do modo dividido (funchalCovBuildSplitHtml,
  // que reagrupa estas mesmas secções por loja). Nunca duplica a lógica das
  // cores/horas; só o tamanho do intervalo muda por parâmetro.
  function funchalBuildCoverageSections(normalizedStores, stepHours){
    stepHours = stepHours || 0.5;
    const sections = [];
    // Data de hoje, calculada uma única vez para todas as secções.
    const todayDateStr = new Date().toDateString();
    normalizedStores.forEach(({storeName, dayHeader, dateHeader, people})=>{
      // Esta tabela representa a semana consultada, não necessariamente a
      // semana atual — só deve haver destaque de "agora" se uma das suas
      // colunas corresponder EXATAMENTE à data de hoje (mesma comparação de
      // data completa já usada em findTodayCol/findTodayColPS para as
      // tabelas de horário). Sem dateHeader (ou sem coincidência), fica
      // vazio e o ticker desliga todos os indicadores desta secção.
      let todayColName = '';
      (dateHeader||[]).forEach((dv, di)=>{
        if (todayColName) return;
        const parts = (dv||'').trim().split('/');
        if (parts.length !== 3) return;
        const d = new Date(+parts[2], +parts[1]-1, +parts[0]);
        if (d.toDateString() === todayDateStr) todayColName = dayHeader[di] || '';
      });
      const byDay = dayHeader.map(()=>[]);
      people.forEach(p=>{
        [p.A, p.B].forEach(row=>{
          if(!row) return;
          for(let c=1;c<row.length;c++){
            const v=(row[c]||'').trim();
            if(!hpsIsSchedule(v)) continue;
            const [a,b]=v.split('-');
            const s=funchalToHrs(a), e=funchalToHrs(b);
            if(!isNaN(s) && !isNaN(e) && e>s) byDay[c-1].push([s,e]);
          }
        });
      });

      let minH=Infinity, maxH=-Infinity;
      byDay.forEach(segs=>segs.forEach(([s,e])=>{ if(s<minH) minH=s; if(e>maxH) maxH=e; }));
      if(!isFinite(minH) || !isFinite(maxH)){
        sections.push({ storeName, html:
          '<div style="min-width:0;">'
          + '<div style="font-size:11px;font-weight:700;color:#333;margin-bottom:8px;letter-spacing:.04em;text-transform:uppercase;text-align:center;">' + escapeHtml(storeName) + '</div>'
          + '<div style="font-size:11px;color:#888;font-style:italic;text-align:center;">Sem turnos atribuídos</div>'
          + '</div>'
        });
        return;
      }
      // Intervalos de stepHours em stepHours, alinhados ao próprio passo
      // (0.5 → :00/:30 para o funchal; 1 → :00 certo para o Porto Santo).
      const startHour = Math.floor(minH/stepHours)*stepHours, endHour = Math.ceil(maxH/stepHours)*stepHours;
      // Ponto pulsante reservado em TODOS os cabeçalhos (visibility:hidden por
      // omissão) — o mesmo timer que trata da hora também mostra este, só na
      // coluna do dia da semana ATUAL (ver funchalUpdateCoverageHourMarker).
      // data-day no próprio <th> (além do já existente no span do ponto)
      // permite destacar a coluna inteira do dia atual (funchal-col-today-th).
      // overflow:hidden (também nas células de dados, mais abaixo) garante
      // que table-layout:fixed nunca deixa texto transbordar visualmente
      // para a coluna vizinha quando o espaço fica muito apertado — caso
      // mais provável dentro do modo dividido, com colunas bem mais
      // estreitas do que no overlay tradicional.
      const headCells = dayHeader.map(d=>'<th data-day="'+escapeHtml(d)+'" style="padding:4px 2px;font-weight:700;color:#666;text-align:center;border-bottom:1px solid rgba(0,0,0,.1);font-size:10px;letter-spacing:.02em;overflow:hidden;">'
        + '<span class="funchal-live-day-dot" data-day="'+escapeHtml(d)+'" style="visibility:hidden;"></span>'
        + escapeHtml(d) + '</th>').join('');
      let rowsHtml='';
      for(let H=startHour; H<endHour; H+=stepHours){
        const dayCells = byDay.map((segs, dIdx)=>{
          let count=0;
          segs.forEach(([s,e])=>{ if(s<H+stepHours && e>H) count++; });
          // Escala semântica: 1 pessoa = perigo (vermelho), 2 = atenção (âmbar),
          // 3+ = boa cobertura (verde) — tons saturados, sem pastel. Mantém-se
          // sempre visível; o destaque da coluna de hoje (funchal-col-today-td)
          // é só um contorno, nunca substitui esta cor.
          const style = count===0 ? 'color:#b3b3bd;'
            : count===1 ? 'color:#b91c1c;background:rgba(185,28,28,.12);'
            : count===2 ? 'color:#b45309;background:rgba(180,83,9,.12);'
            : 'color:#15803d;background:rgba(21,128,61,.12);';
          // data-day no <td> (destaque de coluna) e no <span> (negrito do
          // número quando é a célula de agora) — o timer liga/desliga as
          // duas classes a cada tick, sem re-renderizar nada
          // (ver funchalUpdateCoverageHourMarker).
          const dayAttr = escapeHtml(dayHeader[dIdx]||'');
          return '<td data-day="'+dayAttr+'" style="padding:3px 1px;text-align:center;font-weight:700;border-radius:4px;overflow:hidden;'+style+'">'
            + '<span class="funchal-live-cell-now" data-day="'+dayAttr+'" data-hour="'+H+'" data-hour-end="'+(H+stepHours)+'">'+(count||'')+'</span>'
            + '</td>';
        }).join('');
        const label = funchalFormatHourLabel(H);
        // Ponto pulsante reservado em TODAS as linhas (visibility:hidden por
        // omissão) — o timer só alterna a visibilidade da linha cujo
        // intervalo [data-hour, data-hour-end) contém a hora atual, sem
        // re-renderizar nada. Funciona igual para o passo de 30 min
        // (funchal) e de 1h (Porto Santo).
        // overflow:hidden é essencial aqui — com table-layout:fixed, se a
        // coluna ficar mais estreita do que "09:30" precisa (ex.: modo
        // dividido de Porto Santo, com 2 lojas empilhadas numa coluna
        // estreita), o texto transbordaria visualmente por cima da coluna
        // seguinte em vez de ser simplesmente cortado.
        rowsHtml += '<tr><td style="width:46px;padding:3px 2px;color:#777;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;font-size:10px;">'
          + '<span class="funchal-live-hour-dot" data-hour="'+H+'" data-hour-end="'+(H+stepHours)+'" style="visibility:hidden;"></span>' + label
          + '</td>'+dayCells+'</tr>';
      }
      sections.push({ storeName, html:
        '<div style="min-width:0;">'
        + '<div style="font-size:11px;font-weight:700;color:#333;margin-bottom:8px;letter-spacing:.04em;text-transform:uppercase;text-align:center;">' + escapeHtml(storeName) + '</div>'
        + '<table data-today-col-name="' + escapeHtml(todayColName) + '" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;">'
        +   '<thead><tr><th style="width:46px;padding:4px 2px;font-weight:700;color:#999;text-align:center;border-bottom:1px solid rgba(0,0,0,.1);font-size:10px;overflow:hidden;">h</th>' + headCells + '</tr></thead>'
        +   '<tbody>' + rowsHtml + '</tbody>'
        + '</table>'
        + '</div>'
      });
    });
    return sections;
  }

  // Grid padrão do modal/overlay de cobertura — 2 colunas, 2 lojas em cima,
  // 2 em baixo (em vez de flex-wrap, que enchia 3 por linha e deixava a 4ª
  // sozinha), pela ordem natural dos dados. Em ecrãs estreitos, a classe
  // funchal-cov-grid passa a 1 coluna (ver media query em
  // funchalEnsureLiveStyles) para as lojas não se sobreporem. Usado sempre
  // que o overlay tradicional é mostrado — nunca mudou de comportamento.
  function funchalBuildCoveragePanelFromStores(normalizedStores, stepHours){
    const sections = funchalBuildCoverageSections(normalizedStores, stepHours);
    const sectionsHtml = sections.map(s => s.html).join('');
    return '<div class="funchal-cov-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">' + sectionsHtml + '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  //  ATUALIZAÇÃO AO VIVO (sem reload) — de 30 em 30 min, à hora certa do
  //  relógio (não 30 min a contar do carregamento da página):
  //   1) bolinha verde/vermelha de cada pessoa nas tabelas de horário;
  //   2) ponto pulsante na linha da meia-hora atual, no painel de cobertura.
  // ══════════════════════════════════════════════════════════════
  let _funchalLiveTickerStarted = false;

  function funchalEnsureLiveStyles(){
    if (document.getElementById('funchal-live-styles')) return;
    const style = document.createElement('style');
    style.id = 'funchal-live-styles';
    style.textContent = `
      @keyframes funchalPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.7); } }
      .funchal-live-hour-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#4a4a4a; margin-right:5px; vertical-align:middle; animation:funchalPulse 1.6s ease-in-out infinite; }
      .funchal-live-day-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#4a4a4a; margin-right:4px; vertical-align:middle; animation:funchalPulse 1.6s ease-in-out infinite; }
      /* Número da célula de agora: sem animação — só mais peso (negrito) e
         tamanho, atualizado a cada tick (30 min funchal / 1h Porto Santo).
         Tamanho fixo (não relativo ao base de 10px) para o destaque ser
         inequívoco à primeira vista; fundo mantém-se sempre o original da
         célula (cor semântica vermelho/âmbar/verde). A tabela de cobertura
         usa table-layout:fixed, por isso este aumento nunca gera scroll
         horizontal — a largura das colunas é sempre fixa. */
      .funchal-cell-now-active { display:inline-block; font-weight:900; font-size:14px; line-height:1; }
      /* Destaque da coluna do dia atual no painel de cobertura — contorno em
         cinza escuro em toda a coluna (cabeçalho + células), sem substituir
         a cor semântica de contagem (vermelho/âmbar/verde) das células. */
      .funchal-col-today-th { background:rgba(60,60,66,.12); box-shadow:inset 0 0 0 1px rgba(60,60,66,.45); }
      .funchal-col-today-td { box-shadow:inset 0 0 0 1px rgba(60,60,66,.4); }
      @media (max-width: 700px) {
        .funchal-cov-grid { grid-template-columns: 1fr !important; }
      }
      /* Modernização visual da tabela de horários — escopada à classe
         .funchal-store-card, partilhada por Porto Santo (renderPortoSanto)
         e pelo funchal unificado (buildSubTable), nunca afeta as outras
         lojas: hairlines finas em vez de bordas duras, hover mais discreto
         no nome (sobrepõe-se ao hover global de .hps-person-name). */
      .funchal-store-card table th { border: none; }
      .funchal-store-card table td { border-bottom: 1px solid rgba(0,0,0,.05); transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
      .funchal-store-card .hps-person-name:hover { background: rgba(0,0,0,.04) !important; }
      /* Hover na linha da pessoa (tabelas de horário Funchal + Porto Santo):
         classe aplicada via JS (funchalBindRowHoverEffect) à(s) <tr> certas —
         cresce ligeiramente (simula aumento de letra) e ilumina-se com uma
         sombra suave, sem alterar as cores semânticas de fundo da célula. */
      .funchal-store-card tr.fx-row-hover > td {
        transform: scale(1.035);
        position: relative;
        z-index: 3;
        box-shadow: 0 6px 18px rgba(0,0,0,.14), inset 0 0 0 1px rgba(255,255,255,.7);
        filter: brightness(1.05);
      }
      #funchal-cov-toggle:hover { background: rgba(255,255,255,.85); }
      /* Botão "Cobertura por hora" (gatilho do modo dividido): estado de
         hover invertido, para reforçar que é um botão. !important porque
         body{color:#000!important} no index.html ganharia à cor branca sobre
         o fundo escuro do hover. */
      #funchal-cov-split-trigger:hover {
        background: rgba(51,51,58,.95);
        color: #fff !important;
        border-color: rgba(51,51,58,.95);
        box-shadow: 0 4px 16px rgba(0,0,0,.18);
      }
      #funchal-cov-split-trigger:active { transform: translateY(1px); }

      /* ── Barra do modal em ecrã estreito (telemóvel vertical) ──────────
         O index.html centra #wz-week-nav com position:absolute;left:50%,
         portanto fora do fluxo. Ao acrescentar o botão "cobertura" dentro
         de #wz-week-right, esse bloco passou a ser largo o suficiente para
         alcançar o centro da barra em ecrãs estreitos e, por ter
         backdrop-filter (que cria contexto de empilhamento e vem depois no
         DOM), pintava-se POR CIMA das setas, tapando-as. Em horizontal há
         espaço a sobrar, não há sobreposição, e as setas apareciam — daí o
         sintoma de "só aparecem em horizontal".
         Solução: nesta largura, as setas voltam ao fluxo normal da barra,
         pelo que nada se pode sobrepor. Tudo restrito a
         #wz-hor-modal-bar.funchal-cov-on — classe que só existe enquanto o
         botão de cobertura está visível (Funchal/Porto Santo). As restantes
         lojas nunca entram nestas regras e ficam exatamente como estavam. */
      @media (max-width: 760px) {
        #wz-hor-modal-bar.funchal-cov-on {
          gap: 6px;
          padding-left: 12px !important;
          padding-right: 12px !important;
        }
        #wz-hor-modal-bar.funchal-cov-on #wz-week-nav {
          position: static !important;
          left: auto !important;
          transform: none !important;
          flex: none !important;
          order: 2;
        }
        /* Título "horarios" cede espaço primeiro: é o único elemento
           dispensável se a largura ficar muito curta. */
        #wz-hor-modal-bar.funchal-cov-on > span {
          flex: 1 1 0 !important;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          order: 1;
        }
        #wz-hor-modal-bar.funchal-cov-on #wz-week-right {
          flex: none !important;
          order: 3;
          gap: 5px !important;
        }
        #wz-hor-modal-bar.funchal-cov-on #wz-week-prev,
        #wz-hor-modal-bar.funchal-cov-on #wz-week-next {
          font-size: 1.15rem !important;
          padding: 4px 7px !important;
        }
        #wz-hor-modal-bar.funchal-cov-on #funchal-cov-toggle {
          font-size: 10px !important;
          padding: 5px 11px !important;
        }
        /* "semana 35" é redundante em ecrã estreito (as setas já indicam a
           navegação) e é o que rouba mais largura ao conjunto. */
        #wz-hor-modal-bar.funchal-cov-on #wz-week-label { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // Reavalia cada bolinha a partir do horário-de-hoje guardado em data-today
  // (texto estático, escrito no render) contra a hora ATUAL — não depende de
  // reprocessar o CSV nem de recarregar a página.
  function funchalUpdateLiveDots(){
    document.querySelectorAll('#table-container .funchal-live-dot').forEach(span=>{
      const raw = span.getAttribute('data-today') || '';
      const segments = raw ? raw.split('|').filter(Boolean) : [];
      const active = segments.some(h=>isNowInSchedule(h));
      const dotColor = active ? 'green' : 'red';
      span.style.background = dotColor;
      // Mesma função partilhada (fxDotGlow) — evita dessincronizar a sombra
      // da cor depois do primeiro tick (30 em 30 min).
      span.style.boxShadow = fxDotGlow(dotColor);
      const liveId = span.getAttribute('data-live-id');
      if (liveId) {
        document.querySelectorAll('#table-container tr[data-live-id="'+liveId+'"]').forEach(tr=>{
          tr.classList.toggle('tr-active-now', active);
        });
      }
    });
  }

  // Marca a linha cujo intervalo [data-hour, data-hour-end) contém a hora
  // atual — funciona tanto para o passo de 30 min (funchal) como para o de
  // 1h (Porto Santo), sem precisar de saber qual dos dois está no ecrã.
  function funchalUpdateCoverageHourMarker(){
    const now = new Date();
    const nowDec = now.getHours() + now.getMinutes()/60;

    // Cada tabela de cobertura (uma por loja) sabe, desde a sua geração
    // (funchalBuildCoveragePanelFromStores), se a SEMANA que está a mostrar
    // contém realmente o dia de hoje — data-today-col-name guarda o nome
    // abreviado desse dia (ex.: "QUA"), ou fica vazio se a semana
    // consultada for outra (ex.: "semana seguinte"). Processar tabela a
    // tabela evita acender qualquer indicador (bolinha de dia/hora, número
    // em negrito, contorno de coluna) quando não estamos a ver a semana
    // atual — em vez de comparar só o nome do dia, que se repete todas as
    // semanas. .funchal-cov-host cobre tanto o overlay tradicional
    // (#funchal-cov-body) como o painel do modo dividido
    // (#funchal-cov-inline-panel) com o mesmo seletor.
    document.querySelectorAll('.funchal-cov-host table[data-today-col-name]').forEach(table=>{
      const todayColName = (table.getAttribute('data-today-col-name')||'').trim().toUpperCase();
      const isCurrentWeek = !!todayColName;

      table.querySelectorAll('.funchal-live-hour-dot').forEach(dot=>{
        const rowH = parseFloat(dot.getAttribute('data-hour'));
        const rowEnd = parseFloat(dot.getAttribute('data-hour-end'));
        const isCurrent = isCurrentWeek && nowDec >= rowH && nowDec < rowEnd;
        dot.style.visibility = isCurrent ? 'visible' : 'hidden';
      });

      table.querySelectorAll('.funchal-live-day-dot').forEach(dot=>{
        const dayAttr = (dot.getAttribute('data-day')||'').trim().toUpperCase();
        dot.style.visibility = (isCurrentWeek && dayAttr === todayColName) ? 'visible' : 'hidden';
      });

      // Número da célula (dia atual + hora atual): sem animação — só mais
      // peso (negrito), ligado/desligado a cada tick sem re-renderizar nada.
      table.querySelectorAll('.funchal-live-cell-now').forEach(cell=>{
        const dayAttr = (cell.getAttribute('data-day')||'').trim().toUpperCase();
        const rowH = parseFloat(cell.getAttribute('data-hour'));
        const rowEnd = parseFloat(cell.getAttribute('data-hour-end'));
        const isNow = isCurrentWeek && dayAttr === todayColName && nowDec >= rowH && nowDec < rowEnd;
        cell.classList.toggle('funchal-cell-now-active', isNow);
      });

      // Destaque da coluna inteira do dia atual (cabeçalho + cada célula de
      // dados) — contorno subtil, nunca substitui a cor semântica de
      // contagem das células.
      table.querySelectorAll('th[data-day]').forEach(th=>{
        const dayAttr = (th.getAttribute('data-day')||'').trim().toUpperCase();
        th.classList.toggle('funchal-col-today-th', isCurrentWeek && dayAttr === todayColName);
      });
      table.querySelectorAll('td[data-day]').forEach(td=>{
        const dayAttr = (td.getAttribute('data-day')||'').trim().toUpperCase();
        td.classList.toggle('funchal-col-today-td', isCurrentWeek && dayAttr === todayColName);
      });
    });
  }

  // Arranca UMA SÓ VEZ por carregamento de página (flag module-level) — o
  // callback volta a interrogar o DOM a cada tick, por isso continua correto
  // mesmo depois de o utilizador navegar entre semanas várias vezes.
  function funchalEnsureLiveTicker(){
    if (_funchalLiveTickerStarted) return;
    _funchalLiveTickerStarted = true;
    function tick(){
      funchalUpdateLiveDots();
      funchalUpdateCoverageHourMarker();
      portoSantoUpdateLiveDots();
    }
    tick();
    const now = new Date();
    const msToNextHalfHour = ((30 - (now.getMinutes() % 30)) * 60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
      tick();
      setInterval(tick, 30*60*1000);
    }, Math.max(1000, msToNextHalfHour));
  }

  // Overlay de cobertura — nó único anexado a document.body (mesmo padrão do
  // hps-overlay já usado no Porto Santo), com painel em glassmorphism. Fecha
  // ao clicar no fundo ou no ✕; a tabela de horários por baixo nunca é
  // escondida, por isso não é preciso nenhum botão para "voltar".
  function funchalCovEnsureOverlay(){
    let overlay = document.getElementById('funchal-cov-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'funchal-cov-overlay';
    // O blur tem de estar no OVERLAY (a camada de fundo) para desfocar o que
    // está atrás; o backdrop-filter do painel, sozinho, só desfoca o próprio
    // fundo escuro do overlay — nunca chega a "ver" a página por trás dele.
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:9600;background:rgba(15,15,22,.46);backdrop-filter:blur(10px) saturate(1.3);-webkit-backdrop-filter:blur(10px) saturate(1.3);align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
    overlay.innerHTML =
      '<div id="funchal-cov-panel" style="position:relative;max-width:920px;width:100%;max-height:82vh;overflow-y:auto;background:rgba(255,255,255,.78);backdrop-filter:blur(28px) saturate(190%);-webkit-backdrop-filter:blur(28px) saturate(190%);border:1px solid rgba(255,255,255,.9);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.6);padding:22px 24px;">'
      +   '<button type="button" id="funchal-cov-close" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:16px;color:#777;cursor:pointer;line-height:1;padding:4px 6px;border-radius:6px;">✕</button>'
      // Gatilho do modo dividido (PC): um BOTÃO a sério (pílula, com borda,
      // fundo e hover próprios), não texto simples — para se perceber logo
      // que é clicável. Clicar fecha este overlay e abre as tabelas de
      // cobertura uma de cada lado dos horários, sem blur nenhum.
      // color com !important porque body{color:#000!important} no index.html
      // ganharia à cor herdada no estado de hover (fundo escuro).
      +   '<div style="text-align:center;margin-bottom:16px;">'
      +     '<button type="button" id="funchal-cov-split-trigger" style="display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#333!important;background:rgba(255,255,255,.72);border:1px solid rgba(0,0,0,.12);border-radius:22px;padding:9px 20px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.07);transition:background .15s, color .15s, border-color .15s, box-shadow .15s;">'
      +       '<span style="display:inline-block;width:13px;height:9px;border-radius:2px;border:1.5px solid currentColor;border-left-width:4px;border-right-width:4px;flex:none;"></span>'
      +       'Cobertura por hora'
      +     '</button>'
      +   '</div>'
      +   '<div id="funchal-cov-body" class="funchal-cov-host"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
    document.getElementById('funchal-cov-close').addEventListener('click', () => { overlay.style.display = 'none'; });
    document.getElementById('funchal-cov-split-trigger').addEventListener('click', () => {
      funchalCovEnterSplit();
    });
    return overlay;
  }

  // Devolve o HTML de cobertura da loja atualmente visível no modal
  // (Funchal ou Porto Santo), ou null se nenhuma das duas estiver ativa —
  // fonte única usada pelo overlay tradicional, que mostra sempre o grid
  // padrão de 2 colunas em ordem natural.
  function funchalCovBuildForCurrentStore(){
    const psRows = portoSantoCurrentRowsIfActive();
    if (psRows) return portoSantoBuildCoveragePanel(psRows);
    if (window._isFunchalUnificadoMode && window._lastFunchalGroupBlocks) {
      return funchalBuildCoveragePanel(window._lastFunchalGroupBlocks);
    }
    return null;
  }

  // Devolve as secções de cobertura da loja atual SEPARADAS (não montadas em
  // grid) — [{storeName, html}] — para o modo dividido poder reagrupá-las
  // por coluna (funchalCovGroupSectionsForSplit). null se nenhuma das duas
  // lojas com cobertura estiver ativa.
  function funchalCovBuildForCurrentStoreSections(){
    const psRows = portoSantoCurrentRowsIfActive();
    if (psRows) {
      return funchalBuildCoverageSections(portoSantoNormalizeRowsForCoverage(psRows), 1);
    }
    if (window._isFunchalUnificadoMode && window._lastFunchalGroupBlocks) {
      return funchalBuildCoverageSections(funchalNormalizeGroupBlocksForCoverage(window._lastFunchalGroupBlocks), 0.5);
    }
    return null;
  }

  // Agrupa as secções de cobertura em 2 colunas para o modo dividido.
  // Funchal (2 lojas): 1 por coluna, ordem natural (Mezka Funchal esquerda,
  // Arcadas direita). Porto Santo (4 lojas): ordem fixa pedida
  // explicitamente — esquerda = Mezka Avenida (cima) + Shana (baixo);
  // direita = Mezka Mercado (cima) + Maxx (baixo) — procurada pelo NOME
  // exato da loja, não pela posição no array, para não depender da ordem em
  // que as sub-lojas vêm no CSV.
  function funchalCovGroupSectionsForSplit(sections){
    if (sections.length <= 2) {
      return [
        sections[0] ? [sections[0]] : [],
        sections[1] ? [sections[1]] : []
      ];
    }
    const byName = {};
    sections.forEach(s => { byName[(s.storeName||'').trim().toUpperCase()] = s; });
    const left  = ['MEZKA AVENIDA', 'SHANA'].map(n => byName[n]).filter(Boolean);
    const right = ['MEZKA MERCADO', 'MAXX'].map(n => byName[n]).filter(Boolean);
    if (left.length + right.length === sections.length) return [left, right];
    // Fallback defensivo: se os nomes não baterem certo (ex.: grafia
    // diferente no CSV), nunca perder nenhuma loja silenciosamente —
    // distribui pela ordem natural em vez da ordem pedida.
    return [
      sections.filter((_, i) => i % 2 === 0),
      sections.filter((_, i) => i % 2 === 1)
    ];
  }

  // Monta o HTML de cada um dos 2 painéis laterais: devolve
  // { left, right } com as sub-lojas de cada lado empilhadas na vertical
  // (conforme funchalCovGroupSectionsForSplit), ou null se não houver loja
  // com cobertura ativa. Cada painel ocupa a sua margem inteira, por isso
  // as tabelas já não competem por largura entre si.
  function funchalCovBuildSplitColumnsHtml(){
    const sections = funchalCovBuildForCurrentStoreSections();
    if (!sections) return null;
    const columns = funchalCovGroupSectionsForSplit(sections);
    return {
      left:  (columns[0] || []).map(s => s.html).join(''),
      right: (columns[1] || []).map(s => s.html).join('')
    };
  }

  // Atualiza tanto o overlay tradicional (sempre garantido, mesmo escondido
  // — o conteúdo fica pronto desde o primeiro render, sem "flash" de vazio
  // ao abrir pela primeira vez) como o painel dividido, se já tiver sido
  // aberto pelo utilizador (esse nunca é criado antecipadamente — só existe
  // depois de um clique no título "Cobertura por hora"). Chamada tanto ao
  // clicar como a cada re-render da tabela (mudança de semana), para o
  // painel dividido nunca ficar dessincronizado enquanto o utilizador navega.
  function funchalCovRefreshAllTargets(){
    funchalCovEnsureOverlay();
    const overlayBody = document.getElementById('funchal-cov-body');
    const overlayHtml = funchalCovBuildForCurrentStore();
    if (overlayBody && overlayHtml != null) overlayBody.innerHTML = overlayHtml;

    const leftBody  = document.getElementById('funchal-cov-inline-columns-left');
    const rightBody = document.getElementById('funchal-cov-inline-columns-right');
    if (leftBody || rightBody) {
      const splitHtml = funchalCovBuildSplitColumnsHtml();
      if (splitHtml != null) {
        if (leftBody)  leftBody.innerHTML  = splitHtml.left;
        if (rightBody) rightBody.innerHTML = splitHtml.right;
      }
      // O conteúdo pode ter mudado de altura (ex.: loja com mais/menos
      // sub-lojas) — reposiciona/redimensiona os painéis fixed em função disso.
      funchalCovPositionSplitPanel();
    }

    funchalUpdateCoverageHourMarker();
  }

  // O modal de horários fica sempre centrado no ecrã (index.html:
  // #wz-hor-modal usa display:flex + justify-content:center) com
  // width:min(95vw,1080px). Num ecrã de 24" (1920px) sobram 420px de cada
  // lado; num 27" (2560px) sobram 740px. É nessas margens livres que os
  // dois painéis de cobertura são colocados — um de cada lado da tabela
  // principal. O modal NUNCA é redimensionado nem movido: só se verifica
  // se as duas folgas laterais são suficientes. Se qualquer um dos lados
  // não tiver espaço, o modo dividido não ativa (mantém-se o overlay
  // tradicional), em vez de mostrar um painel espremido ou só de um lado.
  // 376px = largura mínima do painel (340) + folga ao modal (20) + margem
  // ao bordo do ecrã (16).
  const FUNCHAL_COV_SPLIT_MIN_GAP = 376;
  function funchalCovSideGaps(){
    // Mesma ideia do window._hCovBarIds (bar/right/label): o painel admin
    // define window._hCovBarIds.modalBox para a SUA própria caixa
    // (#h-hor-box), que tem exatamente a mesma largura min(95vw,1080px) do
    // modal das empregadas — o dashboard de empregadas nunca define isto,
    // por isso continua a usar #wz-hor-modal-box sem qualquer alteração.
    const modalBoxId = (window._hCovBarIds && window._hCovBarIds.modalBox) || 'wz-hor-modal-box';
    const box = document.getElementById(modalBoxId);
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    return { rect, left: rect.left, right: window.innerWidth - rect.right };
  }
  function funchalCovIsDesktopWidth(){
    const gaps = funchalCovSideGaps();
    if (!gaps) return false;
    return gaps.left >= FUNCHAL_COV_SPLIT_MIN_GAP && gaps.right >= FUNCHAL_COV_SPLIT_MIN_GAP;
  }

  // Painel de cobertura do modo dividido — elemento TOTALMENTE separado do
  // modal de horários (nunca é movido para dentro dele, nunca lhe altera o
  // tamanho): position:fixed, com a sua própria caixa/sombra, ancorado ao
  // lado direito do modal. Por ser fixed e independente, nunca é afetado
  // pelo scroll vertical da tabela de horários — o utilizador pode descer
  // até à última sub-loja (ex.: Maxx) sem a cobertura correspondente sair
  // do sítio; tem o seu PRÓPRIO scroll interno (overflow-y:auto) quando o
  // conteúdo é mais alto do que o espaço disponível.
  // Um painel por lado ('left'/'right'), criado à medida que é preciso e
  // reutilizado daí em diante. Cada um é autónomo: caixa e sombra próprias,
  // botão de fechar próprio e scroll vertical próprio.
  function funchalCovEnsureSplitPanel(side){
    const id = 'funchal-cov-split-panel-' + side;
    let panel = document.getElementById(id);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = id;
    panel.style.cssText = 'display:none;position:fixed;z-index:9500;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.06);box-sizing:border-box;padding:16px;overflow-y:auto;-webkit-overflow-scrolling:touch;';
    panel.innerHTML =
        '<button type="button" class="funchal-cov-split-close" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:16px;color:#777;cursor:pointer;line-height:1;padding:4px 6px;border-radius:6px;">✕</button>'
      + '<div style="font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#333;margin-bottom:14px;text-align:center;">Cobertura por hora</div>'
      + '<div id="funchal-cov-inline-columns-' + side + '" class="funchal-cov-host funchal-cov-split-body" style="display:flex;flex-direction:column;gap:18px;"></div>';
    document.body.appendChild(panel);
    panel.querySelector('.funchal-cov-split-close').addEventListener('click', funchalCovExitSplit);
    return panel;
  }
  function funchalCovEnsureSplitPanels(){
    return [funchalCovEnsureSplitPanel('left'), funchalCovEnsureSplitPanel('right')];
  }

  // Recalcula a posição/tamanho do painel a partir da posição REAL do modal
  // no ecrã (getBoundingClientRect) — chamado ao entrar no modo dividido, ao
  // redimensionar a janela, e a cada re-render da tabela (a altura do modal
  // pode mudar consoante quem trabalha nessa semana). Ambos position:fixed
  // relativos ao viewport, por isso não depende de nada sobre scroll de
  // página. Não faz nada se o painel não existir ou estiver escondido.
  function funchalCovPositionSplitPanel(){
    const gaps = funchalCovSideGaps();
    if (!gaps) return;
    const rect = gaps.rect;
    const gap = 20, margin = 16;
    const leftPanel  = document.getElementById('funchal-cov-split-panel-left');
    const rightPanel = document.getElementById('funchal-cov-split-panel-right');

    if (leftPanel && leftPanel.style.display !== 'none') {
      const width = Math.max(340, Math.min(520, gaps.left - gap - margin));
      leftPanel.style.width = width + 'px';
      // Encostado ao modal pela direita: o painel termina onde o modal
      // começa (menos a folga), para os dois ficarem sempre alinhados,
      // independentemente da largura calculada.
      leftPanel.style.left = (rect.left - gap - width) + 'px';
      leftPanel.style.top = rect.top + 'px';
      leftPanel.style.maxHeight = rect.height + 'px';
    }
    if (rightPanel && rightPanel.style.display !== 'none') {
      const width = Math.max(340, Math.min(520, gaps.right - gap - margin));
      rightPanel.style.width = width + 'px';
      rightPanel.style.left = (rect.right + gap) + 'px';
      rightPanel.style.top = rect.top + 'px';
      rightPanel.style.maxHeight = rect.height + 'px';
    }
  }

  let _funchalCovSplitActive = false;

  // Feedback visual de estado no próprio botão — sem isto o utilizador não
  // tem forma de saber, só de olhar, se o modo dividido já está aberto (o
  // clique passa a alternar, ao contrário do comportamento anterior que só
  // abria).
  // A cor do texto é aplicada com setProperty(...,'important') porque
  // index.html define `#wz-hor-modal-bar button { color:#000 }` e
  // `body { color:#000 !important }` — sobre o fundo cinzento-escuro do
  // estado ativo, texto preto fica praticamente ilegível. O !important
  // garante o branco independentemente de qualquer regra do index.html,
  // que continua a não ser tocado.
  function funchalCovUpdateToggleButtonState(){
    const btn = document.getElementById('funchal-cov-toggle');
    if (!btn) return;
    if (_funchalCovSplitActive) {
      btn.style.background = 'rgba(51,51,58,.92)';
      btn.style.setProperty('color', '#fff', 'important');
      btn.style.borderColor = 'rgba(51,51,58,.92)';
    } else {
      btn.style.background = 'rgba(255,255,255,.55)';
      btn.style.setProperty('color', '#333', 'important');
      btn.style.borderColor = 'rgba(0,0,0,.08)';
    }
  }

  // Entra no modo dividido: confirma que há espaço nas DUAS margens e
  // mostra um painel de cobertura de cada lado do modal. Nem o modal
  // (#wz-hor-modal-box) nem a tabela (#container-tables) são tocados —
  // mantêm a largura e o scroll que sempre tiveram, por isso a tabela de
  // horários continua 100% nítida e interativa (nomes clicáveis, hover das
  // linhas) enquanto a cobertura está visível dos dois lados, e o scroll de
  // uma nunca afeta a outra.
  function funchalCovEnterSplit(){
    if (!funchalCovIsDesktopWidth()) return;
    const covOverlay = document.getElementById('funchal-cov-overlay');
    if (covOverlay) covOverlay.style.display = 'none';
    funchalCovEnsureSplitPanels().forEach(p => { p.style.display = 'block'; });
    _funchalCovSplitActive = true;
    funchalCovUpdateToggleButtonState();
    funchalCovPositionSplitPanel();
    funchalCovRefreshAllTargets();
    funchalCovEnsureSplitResizeListener();
  }

  // Sai do modo dividido: só esconde os dois painéis — nunca há nada para
  // repor no modal, porque funchalCovEnterSplit nunca lhe mexeu.
  function funchalCovExitSplit(){
    ['left','right'].forEach(side => {
      const p = document.getElementById('funchal-cov-split-panel-' + side);
      if (p) p.style.display = 'none';
    });
    _funchalCovSplitActive = false;
    funchalCovUpdateToggleButtonState();
  }

  // Reposiciona o painel ao redimensionar a janela; se deixar de haver
  // espaço suficiente, sai do modo dividido em vez de deixar o painel
  // espremido ou a transbordar do ecrã. Um só listener por carregamento de
  // página (flag module-level), tal como funchalEnsureLiveTicker.
  let _funchalCovSplitResizeListenerAdded = false;
  function funchalCovEnsureSplitResizeListener(){
    if (_funchalCovSplitResizeListenerAdded) return;
    _funchalCovSplitResizeListenerAdded = true;
    let resizeTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){
        if (!_funchalCovSplitActive) return;
        if (!funchalCovIsDesktopWidth()) { funchalCovExitSplit(); return; }
        funchalCovPositionSplitPanel();
      }, 150);
    });
  }

  // Se o modal de horários fechar (✕, clique fora, Escape — tudo tratado
  // por closeHor() em index.html, nunca tocado) enquanto o modo dividido
  // está ativo, o estado tem de ser reposto — senão a próxima vez que o
  // modal abrisse ficaria com a estrutura desalinhada. Observa a classe
  // wz-on do próprio modal em vez de depender de qualquer botão específico,
  // por isso cobre todas as formas de fechar de uma só vez.
  //
  // O painel admin (admin-horarios.js) não tem "modal" nenhum — tem um
  // separador (#tab-horarios) que ganha/perde a classe "active" ao trocar
  // de separador ou voltar ao dashboard (botão "início"). Sem isto, sair do
  // separador de horários com a cobertura dividida aberta deixava os
  // painéis fixed a "contaminar" o dashboard principal, sem forma de os
  // fechar a não ser voltando a entrar em horários. window._hCovBarIds.closeWatch
  // permite ao admin apontar este observador para o SEU elemento/classe —
  // a loja de empregadas nunca define isto, por isso mantém-se 100% igual.
  let _funchalCovModalCloseObserverAdded = false;
  function funchalCovEnsureModalCloseObserver(){
    if (_funchalCovModalCloseObserverAdded) return;
    const cfg = (window._hCovBarIds && window._hCovBarIds.closeWatch) || { el: 'wz-hor-modal', activeClass: 'wz-on' };
    const modal = document.getElementById(cfg.el);
    if (!modal) return;
    _funchalCovModalCloseObserverAdded = true;
    new MutationObserver(() => {
      if (modal.classList.contains(cfg.activeClass)) return;
      if (_funchalCovSplitActive) funchalCovExitSplit();
      const overlay = document.getElementById('funchal-cov-overlay');
      if (overlay && overlay.style.display !== 'none') overlay.style.display = 'none';
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // Callback única do botão "cobertura", partilhada por funchal e Porto
  // Santo: abre sempre o modal/overlay tradicional, exatamente como antes
  // de existir o modo dividido — este botão nunca decide sozinho dividir o
  // ecrã. Só exceção: se o modo dividido já estiver ativo (aberto a partir
  // do título "Cobertura por hora" dentro do overlay — ver
  // funchalCovEnsureOverlay), o mesmo botão passa a servir para voltar ao
  // layout normal, em vez de abrir o overlay por cima de uma vista já
  // dividida (o que mostraria a cobertura duas vezes).
  function funchalCovToggle(){
    funchalCovEnsureModalCloseObserver();
    if (_funchalCovSplitActive) {
      funchalCovExitSplit();
      return;
    }
    const covOverlay = funchalCovEnsureOverlay();
    funchalCovRefreshAllTargets();
    covOverlay.style.display = 'flex';
  }

  // ── Botão "cobertura" na barra do modal de horários (#wz-hor-modal-bar,
  //    definida no index.html — não precisa de voltar a ser tocada) — em vez
  //    de dentro de #table-container, para não empurrar a tabela para baixo
  //    nem criar scroll vertical extra. Inserido no lado direito da barra,
  //    junto a "semana X" e antes do ✕, para nunca invadir o título
  //    "horários" nem as setas de navegação (que ficam centradas). Usado
  //    tanto pelo funchal (renderFunchalUnificado) como pelo Porto Santo
  //    (portoSantoEnsureCoverageButton) — mesma posição nos dois. ──
  // IDs da barra onde o botão "cobertura" vive. Por omissão, a barra do
  // modal de horários das empregadas (definida no index.html). O painel
  // admin (admin-horarios.js) define window._hCovBarIds com os SEUS
  // próprios ids (h-week-right/h-week-label/h-hor-bar) antes de qualquer
  // render — o fluxo das empregadas nunca toca nesta variável, por isso o
  // seu comportamento fica 100% inalterado.
  function funchalCovBarIds(){
    return window._hCovBarIds || { right: 'wz-week-right', label: 'wz-week-label', bar: 'wz-hor-modal-bar' };
  }

  function funchalCovBarEnsureButton(onOpen){
    const ids = funchalCovBarIds();
    const right = document.getElementById(ids.right);
    if (!right) return null;
    let btn = document.getElementById('funchal-cov-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'funchal-cov-toggle';
      btn.textContent = 'cobertura';
      btn.style.cssText = 'display:inline-flex;align-items:center;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:lowercase;padding:6px 14px;border-radius:20px;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.55);backdrop-filter:blur(12px) saturate(160%);-webkit-backdrop-filter:blur(12px) saturate(160%);color:#333;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.05);transition:background .15s;';
      const label = document.getElementById(ids.label);
      if (label) right.insertBefore(btn, label); else right.insertBefore(btn, right.firstChild);
    }
    // onclick (não addEventListener) substitui sempre o handler anterior —
    // o botão persiste entre renders (já não é recriado a cada troca de
    // semana), por isso addEventListener empilharia um handler por render.
    btn.onclick = onOpen;
    btn.style.display = 'inline-flex';
    // Marca a barra como "tem botão de cobertura": só com esta classe é que
    // as regras de ecrã estreito (ver funchalEnsureLiveStyles) entram em
    // ação, deixando as setas de semana no fluxo em vez de centradas em
    // absoluto — sem isso, o botão tapava-as em telemóvel vertical. As
    // lojas sem cobertura nunca recebem a classe e mantêm o layout original.
    funchalEnsureLiveStyles();
    const bar = document.getElementById(ids.bar);
    if (bar) bar.classList.add('funchal-cov-on');
    return btn;
  }

  // Esconde o botão quando a loja atual não é nem funchal nem Porto Santo
  // (ex.: mudou para Mezka Madeira / Parfois Arcadas standalone) — chamado
  // pelo mesmo observer que já deteta re-renders do #table-container. Sai
  // também do modo dividido, se estiver ativo: uma loja sem cobertura não
  // pode ficar com #container-tables preso dentro do wrap lado a lado.
  function funchalCovBarHideButton(){
    const ids = funchalCovBarIds();
    const btn = document.getElementById('funchal-cov-toggle');
    if (btn) btn.style.display = 'none';
    // Sem botão de cobertura, a barra volta ao layout original do index.html
    // (setas centradas em absoluto, "semana N" visível) — as regras de ecrã
    // estreito deixam de se aplicar porque dependem desta classe.
    const bar = document.getElementById(ids.bar);
    if (bar) bar.classList.remove('funchal-cov-on');
    if (_funchalCovSplitActive) funchalCovExitSplit();
  }

  // ══════════════════════════════════════════════════════════════
  //  PORTO SANTO — reaproveita cobertura + bolinhas ao vivo do funchal.
  //  100% aditivo: nunca toca em renderPortoSanto/hpsCollectStores/
  //  hpsBindNameClicks. Deteta a loja atual pela MESMA regra que
  //  fadeRenderTable já usa (rows[0][0]==='porto santo'), injeta o botão
  //  de cobertura por cima da tabela via DOM depois do render, e mantém
  //  as bolinhas verdes/vermelhas atualizadas relendo o DOM — reaproveita
  //  o mesmo temporizador de 30 em 30 min já criado para o funchal.
  // ══════════════════════════════════════════════════════════════
  function portoSantoCurrentRowsIfActive(){
    const ws = document.getElementById('week-select');
    const blocks = window._lastBlocks;
    if (!ws || !blocks || !blocks.length) return null;
    const idx = parseInt(ws.value, 10);
    const rows = blocks[idx];
    if (!rows || !rows[0]) return null;
    const firstCell = (rows[0][0] || '').trim().toLowerCase();
    return firstCell === 'porto santo' ? rows : null;
  }

  function portoSantoEnsureCoverageButton(){
    // O botão vive na barra do modal de horários (#wz-hor-modal-bar), não
    // dentro de #table-container — já não precisa de embrulhar nem mover a
    // tabela do Porto Santo, por isso renderPortoSanto/hpsCollectStores/
    // hpsBindNameClicks continuam 100% intocados, sem qualquer manipulação
    // do DOM que produzem (ver funchalCovBarEnsureButton). Mesma callback
    // partilhada com o funchal (funchalCovToggle) — decide overlay (mobile)
    // ou modo dividido (PC) e sabe encontrar os dados certos por si própria.
    funchalCovBarEnsureButton(funchalCovToggle);
  }

  // Reavalia cada bolinha por POSIÇÃO no DOM (não por nome) — a mesma pessoa
  // pode aparecer em mais do que uma sub-loja (reforço) com o mesmo
  // data-hps-person; casar por nome arriscaria atualizar a loja errada.
  // hpsCollectStores(rows) devolve as pessoas pela MESMA ordem em que
  // renderPortoSanto as desenha (percorre o mesmo array rows pela mesma
  // ordem), por isso o pareamento posicional é seguro.
  function portoSantoUpdateLiveDots(){
    const rows = portoSantoCurrentRowsIfActive();
    if (!rows) return;
    const { stores } = hpsCollectStores(rows);
    const flat = [];
    stores.forEach(s => s.people.forEach(p => flat.push({ store: s, person: p })));
    const tds = document.querySelectorAll('#table-container .hps-person-name');
    if (tds.length !== flat.length) return;
    tds.forEach((td, idx) => {
      const { store, person } = flat[idx];
      const dateRow = store.dateRow || [];
      let todayCol = -1;
      for (let c = 1; c < dateRow.length; c++) {
        const d = dateRow[c]; if (!d) continue;
        const parts = d.split('/'); if (parts.length !== 3) continue;
        const dd = new Date(+parts[2], +parts[1]-1, +parts[0]);
        if (dd.toDateString() === new Date().toDateString()) { todayCol = c; break; }
      }
      let active = false;
      if (todayCol > 0) {
        const horarios = [person.A[todayCol], person.B[todayCol]].filter(v=>v);
        active = horarios.some(h => isNowInSchedule(h));
      }
      const span = td.querySelector('span');
      if (span) {
        const dotColor = active ? 'green' : 'red';
        span.style.background = dotColor;
        // Mesmo glow do render inicial (fxDotGlow) — evita dessincronizar a
        // sombra da cor depois do primeiro tick (30 em 30 min).
        span.style.boxShadow = fxDotGlow(dotColor);
      }
      const tr = td.closest('tr');
      if (tr) tr.classList.toggle('tr-active-now', active);
    });
  }

  // Deteta re-renders do Porto Santo (fadeRenderTable → renderPortoSanto)
  // sem tocar em nenhum dos dois — o mesmo padrão de MutationObserver já
  // usado no index.html para o reveal do mosaico.
  function portoSantoOnTableMutated(){
    const rows = portoSantoCurrentRowsIfActive();
    if (!rows) {
      // Não é Porto Santo — se também não for funchal unificado (que trata
      // do seu próprio botão dentro de renderFunchalUnificado), esconde o
      // botão de cobertura da barra do modal (loja "normal", sem cobertura).
      if (!window._isFunchalUnificadoMode) funchalCovBarHideButton();
      return;
    }
    portoSantoEnsureCoverageButton();
    portoSantoUpdateLiveDots();
    // Mesmo ajuste de escala do funchal (ver funchalFitTablesToScreen) —
    // necessário sobretudo quando o modo dividido de cobertura está ativo,
    // já que a coluna disponível para a tabela encolhe.
    funchalFitTablesToScreen();
    funchalEnsureResizeListener();
    // Mantém o painel de cobertura dividido (se estiver aberto) sincronizado
    // com a semana atualmente visível, tal como já acontece para o funchal.
    funchalCovRefreshAllTargets();
  }

  // ── Equivalentes "hps" (modal por pessoa) para a vista FUNCHAL UNIFICADO —
  //    blocos independentes por sub-loja (sem marcador 'porto santo'), por
  //    isso não podem reutilizar hpsCollectStores/hpsBindNameClicks tal como
  //    estão. Reaproveitam a MESMA modal (hpsRenderModal) e a MESMA lógica de
  //    deteção de reforço; nada no mecanismo do Porto Santo é alterado. ──
  function hpsCollectStoresFunchal(groupBlocks) {
    const cols = Math.max(...groupBlocks.map(b => Math.max(...b.map(r=>r.length))));
    const dayHeaderRow = (groupBlocks[0] && groupBlocks[0][0]) || [];
    const stores = groupBlocks.map(block => {
      const dateRow = block[1] || [];
      const people = [];
      let cur=null, curName=null;
      block.slice(2).forEach(row=>{
        const name=(row[0]||'').trim();
        if(cur===null || name!==curName){
          if(cur) people.push({ name: curName, A: cur[0], B: cur[1]||cur[0] });
          cur=[row];
          curName=name;
        } else {
          cur.push(row);
        }
      });
      if(cur) people.push({ name: curName, A: cur[0], B: cur[1]||cur[0] });
      return { name: (block[0] && block[0][0]) ? block[0][0] : '', dateRow, people };
    });
    return { cols, dayHeaderRow, stores };
  }

  function showPersonWeekModalFunchal(personLabel, groupBlocks) {
    const { cols, dayHeaderRow, stores } = hpsCollectStoresFunchal(groupBlocks);
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
      let apoioLoja = '', apoioDisplay = '';
      const recebeApoio = [];

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
      if (!isWork) {
        for (const ap of appearances) {
          const top = (ap.entry.A[c] || '').trim();
          if (top && !knownStoreNames.has(top.toUpperCase())) { display = top; loja = ap.store; break; }
        }
      }
      if (!display) {
        const any = appearances.find(ap => (ap.entry.A[c] || '').trim());
        if (any) { display = (any.entry.A[c] || '').trim(); loja = any.store; }
      }

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

  function hpsBindNameClicksFunchal(groupBlocks) {
    document.querySelectorAll('#table-container .hps-person-name').forEach(td => {
      td.addEventListener('click', () => {
        const personLabel = td.dataset.hpsPerson;
        if (personLabel) showPersonWeekModalFunchal(personLabel, groupBlocks);
      });
    });
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

  // Hover nas linhas das tabelas de horário (Funchal + Porto Santo): ao
  // passar o rato no nome, a(s) <tr> dessa pessoa ganham a classe
  // .fx-row-hover (ver funchalEnsureLiveStyles). No Funchal cada pessoa
  // ocupa 2 <tr> ligadas por data-live-id; em Porto Santo ocupa só 1 <tr>
  // (sem data-live-id) — por isso o agrupamento não pode ser feito com
  // seletores CSS de irmãos (tr:hover + tr / tr:has(+ tr:hover)), que
  // ligariam incorretamente a última linha de uma pessoa à primeira da
  // pessoa seguinte no Funchal. O agrupamento por data-live-id evita esse bug.
  function funchalBindRowHoverEffect() {
    document.querySelectorAll('#table-container .hps-person-name').forEach(nameCell => {
      const ownRow = nameCell.closest('tr');
      if (!ownRow) return;
      // liveId é sempre gerado internamente como 'fx-' + slug([a-z0-9-]) + '-' + índice
      // (ver buildSubTable), nunca contém aspas nem caracteres especiais — seguro
      // para interpolar diretamente no seletor de atributo.
      const liveId = ownRow.getAttribute('data-live-id');
      const rows = liveId
        ? document.querySelectorAll('tr[data-live-id="' + liveId + '"]')
        : [ownRow];
      nameCell.addEventListener('mouseenter', () => {
        rows.forEach(tr => tr.classList.add('fx-row-hover'));
      });
      nameCell.addEventListener('mouseleave', () => {
        rows.forEach(tr => tr.classList.remove('fx-row-hover'));
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  AVISO (PORTO SANTO + FUNCHAL) — mensagem flutuante editável
  //  pelo admin, uma por loja.
  //  · Tabela Supabase: porto_santo_aviso — uma linha por loja,
  //    mapeada por HAV_IDS ('porto santo'→id:1, 'funchal'→id:2).
  //    id:1 é a linha já existente em produção, nunca alterada de
  //    significado; id:2 é criada automaticamente (upsert) na
  //    primeira gravação para Funchal — sem alterações ao schema.
  //  · Admin: modal com switch ativo/inativo + textarea + guardar,
  //    reaproveitado para qualquer loja (título/placeholder mudam).
  //  · Loja: ao entrar em Porto Santo ou Funchal, se ativo=true,
  //    mostra a mensagem — uma vez por sessão, por loja.
  // ══════════════════════════════════════════════════════════════
  const HAV_TABLE = 'porto_santo_aviso';
  const HAV_IDS = { 'porto santo': 1, 'funchal': 2 };
  function havIdFor(loja) { return HAV_IDS[loja] || HAV_IDS['porto santo']; }

  async function havGetSB() {
    if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    }
    return null;
  }

  async function havLoad(loja) {
    const sb = await havGetSB();
    if (!sb) return { ativo: false, mensagem: '' };
    try {
      const { data, error } = await sb.from(HAV_TABLE).select('ativo,mensagem').eq('id', havIdFor(loja)).limit(1);
      if (error || !data || !data.length) return { ativo: false, mensagem: '' };
      return { ativo: !!data[0].ativo, mensagem: data[0].mensagem || '' };
    } catch (e) { return { ativo: false, mensagem: '' }; }
  }

  // Pré-carregamento: lançado logo após o login (em paralelo com a animação de
  // entrada + carregamento do horário), para que quando o dashboard aparecer
  // os dados do aviso já estejam prontos e o popup surja sem espera extra.
  // Uma promise em cache por loja (Porto Santo e Funchal nunca partilham).
  const havPrefetchPromises = {};
  function havPrefetch(loja) {
    const key = loja || 'porto santo';
    if (!havPrefetchPromises[key]) havPrefetchPromises[key] = havLoad(key).catch(() => ({ ativo: false, mensagem: '' }));
    return havPrefetchPromises[key];
  }

  async function havSave(loja, ativo, mensagem) {
    const sb = await havGetSB();
    if (!sb) return false;
    try {
      const { error } = await sb.from(HAV_TABLE).upsert({
        id: havIdFor(loja), ativo: ativo, mensagem: mensagem, updated_at: new Date().toISOString()
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

  // Loja atualmente aberta no modal de admin — definida por havOpenAdmin(loja)
  // e lida por havHandleSave, já que o botão "guardar" não recebe argumentos.
  let havAdminCurrentLoja = 'porto santo';

  async function havHandleSave() {
    const btn   = document.getElementById('hav-adm-save-btn');
    const msgEl = document.getElementById('hav-adm-save-msg');
    const ativo = document.getElementById('hav-adm-chk').checked;
    const mensagem = document.getElementById('hav-adm-textarea').value;
    btn.disabled = true;
    msgEl.textContent = 'a guardar…';
    const ok = await havSave(havAdminCurrentLoja, ativo, mensagem);
    btn.disabled = false;
    msgEl.textContent = ok ? '✓ guardado' : 'erro ao guardar';
    if (ok) setTimeout(() => { if (msgEl.textContent === '✓ guardado') msgEl.textContent = ''; }, 2500);
  }

  async function havOpenAdmin(loja) {
    havAdminCurrentLoja = loja || 'porto santo';
    const overlay = havEnsureAdminModal();
    const chk = document.getElementById('hav-adm-chk');
    const ta  = document.getElementById('hav-adm-textarea');
    document.getElementById('hav-adm-title').textContent = 'aviso · ' + havAdminCurrentLoja;
    ta.placeholder = 'mensagem que vai aparecer às funcionárias de ' + havAdminCurrentLoja + ' ao entrarem…';
    document.getElementById('hav-adm-save-msg').textContent = '';
    chk.checked = false;
    ta.value = '';
    overlay.classList.add('open');
    const cur = await havLoad(havAdminCurrentLoja);
    chk.checked = !!cur.ativo;
    ta.value = cur.mensagem || '';
  }

  window._hAvisoAdmin = { open: havOpenAdmin };

  /* ── LOJA: janela flutuante ao entrar (Porto Santo ou Funchal, só se ativo) ── */
  const havShownThisSession = {};

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

  async function havCheckAndShow(loja) {
    const key = loja || 'porto santo';
    if (havShownThisSession[key]) return;
    let cur;
    try { cur = await havPrefetch(key); } catch (e) { return; }
    if (!cur.ativo || !cur.mensagem || !cur.mensagem.trim()) return;
    havShownThisSession[key] = true;
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
    document.getElementById('hav-ult-text').innerHTML = 'Horários – última semana publicada<br><b>' + escapeHtml(havUltimaFormatLabel(semanaISO)) + '</b>';
    badge.classList.add('show');
  }

  // ══════════════════════════════════════════════════════════════
  //  ARRANQUE incondicional (não depende de renderFunchalUnificado ter
  //  corrido) — cobre também a loja Porto Santo, que nunca chama essa
  //  função. #table-container já existe no HTML antes deste <script>
  //  correr (mesmo padrão do window._hRender acima), por isso é seguro
  //  ligar o observer já aqui. tick() e o observer verificam sempre a
  //  loja atual antes de fazer seja o que for, por isso não têm efeito
  //  nenhum fora do Porto Santo / funchal.
  // ══════════════════════════════════════════════════════════════
  funchalEnsureLiveStyles();
  funchalEnsureLiveTicker();
  const _fxTableEl = document.getElementById('table-container');
  if (_fxTableEl) {
    new MutationObserver(portoSantoOnTableMutated).observe(_fxTableEl, { childList: true, subtree: true });
  }

  // ══════════════════════════════════════════════════════════════
  //  MOSAICO (fundido de index.html) — ecrã inicial da vista
  //  empregada: grid de atalhos + modais de horários/aviso/banco de
  //  horas. Auto-injeta o próprio HTML (#wz-mosaic + os 3 modais)
  //  porque este script só carrega DEPOIS do login. O observer de
  //  #main-header (mais abaixo) mantém-se inalterado — esse elemento
  //  já é estático em index.html, por isso já existe garantidamente
  //  quando este script corre. Só o bloco EVENTOS (wiring dos botões)
  //  dependia de DOMContentLoaded, que nunca dispararia aqui; passou a
  //  correr de forma síncrona, logo após ensureMosaicShell() garantir
  //  que os elementos já existem.
  // ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function ensureMosaicShell() {
    if (document.getElementById('wz-mosaic')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = `
<!-- ══ MOSAICO ══════════════════════════════════════════════════ -->
<div id="wz-mosaic">
  <div id="wz-brand">wakzome</div>
  <div id="wz-grid">
    <div class="wz-cell wz-cell-horarios" id="wz-c-horarios">
      <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/horarios.png" alt="horários" draggable="false">
      <div class="wz-cell-overlay"></div>
      <span class="wz-cell-label">horários</span>
    </div>
    <div class="wz-cell wz-cell-pvp" id="wz-c-pvp">
      <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/lista%20pvp.png" alt="lista pvp" draggable="false">
      <div class="wz-cell-overlay"></div>
      <span class="wz-cell-label">lista pvp</span>
    </div>
    <div class="wz-cell wz-cell-etiquetas" id="wz-c-etiquetas">
      <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/etiquetas.png" alt="etiquetas" draggable="false">
      <div class="wz-cell-overlay"></div>
      <span class="wz-cell-label">etiquetas</span>
    </div>
    <div class="wz-cell wz-cell-recibo" id="wz-c-recibo">
      <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/recibo.png" alt="recibos" draggable="false">
      <div class="wz-cell-overlay"></div>
      <span class="wz-cell-label">recibos</span>
    </div>
    <div class="wz-cell wz-cell-vendas" id="wz-c-vendas">
      <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/vendas.png" alt="vendas" draggable="false">
      <div class="wz-cell-overlay"></div>
      <span class="wz-cell-label">vendas</span>
    </div>
  </div>
  <div id="wz-aviso-btn">
    <span id="wz-aviso-dot"></span>aviso
  </div>
  <div id="wz-banco-btn">
    <span id="wz-banco-btn-icon">⏱</span>banco de horas
  </div>
</div>

<!-- ══ MODAL HORÁRIOS ════════════════════════════════════════════ -->
<div id="wz-hor-modal">
  <div id="wz-hor-modal-bg"></div>
  <div id="wz-hor-modal-box">
    <div id="wz-hor-modal-bar">
      <span>horários</span>
      <div id="wz-week-nav">
        <button id="wz-week-prev" title="semana anterior">&#8592;</button>
        <button id="wz-week-next" title="semana seguinte">&#8594;</button>
      </div>
      <div id="wz-week-right">
        <span id="wz-week-label"></span>
        <button id="wz-hor-close">✕</button>
      </div>
    </div>
    <div id="wz-hor-modal-body"></div>
  </div>
</div>

<!-- ══ MODAL AVISO ═══════════════════════════════════════════════ -->
<div id="wz-aviso-modal">
  <div id="wz-aviso-modal-bg"></div>
  <img src="https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/assets/Aviso.png" alt="aviso">
</div>

<!-- ══ MODAL BANCO DE HORAS (só visualização, por agora) ═══════════ -->
<div id="wz-banco-modal">
  <div id="wz-banco-modal-bg"></div>
  <div id="wz-banco-modal-box">
    <div id="wz-banco-modal-bar">
      <span>banco de horas</span>
      <button id="wz-banco-close">✕</button>
    </div>
    <div id="wz-banco-modal-body"></div>
  </div>
</div>
`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }
  ensureMosaicShell();

  var _horOpen = false;

  /* ─────────────────────────────────────────────────────────────
     MOSTRAR MOSAICO
     Chamado logo após shared.js definir main-header.style.display='flex'
     e container-tables.style.display='flex'.
     Precisamos reverter esses inline styles imediatamente.
  ───────────────────────────────────────────────────────────── */
  function showMosaic() {
    var hdr = document.getElementById('main-header');
    var ct  = document.getElementById('container-tables');
    var mosaic = document.getElementById('wz-mosaic');
    var grid   = document.getElementById('wz-grid');
    if (!mosaic) return;

    /* Reverter os inline styles que shared.js acabou de aplicar */
    if (hdr) { hdr.style.display = 'none'; hdr.style.opacity = '0'; }
    if (ct)  { ct.style.display  = 'none'; }

    /* Porto Santo = mostra PVP; outras lojas = esconde */
    var tienda = (window._currentStoreGlobal || '').toLowerCase().trim();
    if (tienda !== 'porto santo') {
      grid.classList.add('wz-no-pvp');
    }

    mosaic.classList.add('wz-on');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        mosaic.classList.add('wz-visible');
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     OBSERVER: esperar que main-header receba class 'show'
     (shared.js linha 160: main-header.classList.add('show'))
     Isso acontece DENTRO do callback do greeting, que é quando
     window._currentStoreGlobal já está definido (linha 155).
  ───────────────────────────────────────────────────────────── */
  var _hdr = document.getElementById('main-header');
  var _obs = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (_hdr.classList.contains('show')) {
        _obs.disconnect();
        /* Executar no mesmo tick — antes do browser pintar */
        showMosaic();
        return;
      }
    }
  });
  _obs.observe(_hdr, { attributes: true, attributeFilter: ['class'] });

  /* ─────────────────────────────────────────────────────────────
     MODAL HORÁRIOS
  ───────────────────────────────────────────────────────────── */
  var _wzWeekIndex = 0;

  /* ── FUNCHAL UNIFICADO: agrupar blocos pela mesma "SEMANA N"
     (Mezka Funchal + Parfois Arcadas). Só é usado quando
     window._isFunchalUnificadoMode === true; não afeta as outras lojas. ── */
  function _wzGetWeekGroups() {
    var blocks = window._lastBlocks;
    var groups = [];
    var map = {};
    if (!blocks) return groups;
    blocks.forEach(function (b, i) {
      var key = (b[1] && b[1][0]) ? b[1][0] : ('#' + i);
      if (!map.hasOwnProperty(key)) {
        map[key] = groups.length;
        groups.push({ key: key, indices: [i] });
      } else {
        groups[map[key]].indices.push(i);
      }
    });
    return groups;
  }
  function _wzFindGroupIndexForBlock(groups, blockIdx) {
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].indices.indexOf(blockIdx) !== -1) return g;
    }
    return 0;
  }

  function wzWeekNavUpdate() {
    var blocks = window._lastBlocks;
    if (!blocks || !blocks.length) {
      document.getElementById('wz-week-nav').style.display = 'none';
      return;
    }
    if (window._isFunchalUnificadoMode) {
      var groups = _wzGetWeekGroups();
      var gi = _wzFindGroupIndexForBlock(groups, _wzWeekIndex);
      var fLabel = document.getElementById('wz-week-label');
      var fPrev  = document.getElementById('wz-week-prev');
      var fNext  = document.getElementById('wz-week-next');
      document.getElementById('wz-week-nav').style.display = groups.length > 1 ? 'flex' : 'none';
      if (fLabel) fLabel.textContent = groups[gi] ? groups[gi].key.toLowerCase() : '';
      if (fPrev)  fPrev.disabled = gi <= 0;
      if (fNext)  fNext.disabled = gi >= groups.length - 1;
      var fWs = document.getElementById('week-select');
      if (fWs) fWs.value = _wzWeekIndex;
      return;
    }
    var total  = blocks.length;
    var label  = document.getElementById('wz-week-label');
    var prev   = document.getElementById('wz-week-prev');
    var next   = document.getElementById('wz-week-next');
    document.getElementById('wz-week-nav').style.display = total > 1 ? 'flex' : 'none';
    if (label) label.textContent = 'semana ' + (_wzWeekIndex + 1);
    if (prev)  prev.disabled  = _wzWeekIndex <= 0;
    if (next)  next.disabled  = _wzWeekIndex >= total - 1;
    /* sync hidden select so shared.js interval still works */
    var ws = document.getElementById('week-select');
    if (ws) ws.value = _wzWeekIndex;
  }

  function wzWeekGo(idx) {
    var blocks = window._lastBlocks;
    if (!blocks || !blocks.length) return;
    _wzWeekIndex = Math.max(0, Math.min(idx, blocks.length - 1));
    wzWeekNavUpdate();
    /* kill any pending fade before rendering */
    var tc = document.getElementById('table-container');
    if (tc) { tc.style.transition = 'none'; tc.style.opacity = '1'; }
    if (window._isFunchalUnificadoMode && window._hRender && typeof window._hRender.funchal === 'function') {
      window._hRender.funchal(blocks, _wzWeekIndex);
      return;
    }
    if (window._hRender && typeof window._hRender.table === 'function') {
      var firstCell = (blocks[_wzWeekIndex][0][0] || '').trim().toLowerCase();
      if (firstCell === 'porto santo') {
        window._hRender.porto(blocks, _wzWeekIndex);
      } else {
        window._hRender.table(blocks, _wzWeekIndex);
      }
    }
  }

  function openHor() {
    if (_horOpen) return;
    _horOpen = true;
    var modal = document.getElementById('wz-hor-modal');
    var body  = document.getElementById('wz-hor-modal-body');
    var ct    = document.getElementById('container-tables');

    /* Matar fade pendente do fadeRenderTable antes de mostrar */
    var tc = document.getElementById('table-container');
    if (tc) { tc.style.transition = 'none'; tc.style.opacity = '1'; }

    /* Mostrar modal — animação CSS arranca */
    modal.classList.add('wz-on');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('wz-visible');

        /* Mover container-tables após primeiro frame */
        if (ct && body && !body.contains(ct)) {
          ct.style.display    = 'flex';
          ct.style.opacity    = '1';
          ct.style.transition = 'none';
          ct.style.minWidth   = '0';
          ct.style.width      = '100%';
          body.appendChild(ct);
        }

        /* Inicializar índice da semana atual e actualizar navegação */
        function initWeekNav() {
          var blocks = window._lastBlocks;
          if (!blocks || !blocks.length) return false;
          if (typeof window._hRender !== 'undefined' &&
              typeof window._hRender.findCurrentWeek === 'function') {
            _wzWeekIndex = window._hRender.findCurrentWeek(blocks);
          }
          wzWeekNavUpdate();
          return true;
        }
        if (!initWeekNav()) {
          var _navPoll = setInterval(function () {
            if (initWeekNav()) clearInterval(_navPoll);
          }, 80);
        }
      });
    });
  }

  function closeHor() {
    if (!_horOpen) return;
    var modal = document.getElementById('wz-hor-modal');
    var body  = document.getElementById('wz-hor-modal-body');
    var ct    = document.getElementById('container-tables');
    modal.classList.remove('wz-visible');
    setTimeout(function () {
      modal.classList.remove('wz-on');
      _horOpen = false;
      /* Devolver container-tables ao body e esconder */
      if (ct && body.contains(ct)) {
        ct.style.display = 'none';
        document.body.appendChild(ct);
      }
    }, 420);
  }

  /* ─────────────────────────────────────────────────────────────
     MODAL AVISO
  ───────────────────────────────────────────────────────────── */
  function openAviso() {
    var m = document.getElementById('wz-aviso-modal');
    m.classList.add('wz-on');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { m.classList.add('wz-visible'); });
    });
  }
  function closeAviso() {
    var m = document.getElementById('wz-aviso-modal');
    m.classList.remove('wz-visible');
    setTimeout(function () { m.classList.remove('wz-on'); }, 400);
  }

  /* ─────────────────────────────────────────────────────────────
     MODAL BANCO DE HORAS (só visualização — definido em banco-horas.js)
  ───────────────────────────────────────────────────────────── */
  function openBanco() {
    var m = document.getElementById('wz-banco-modal');
    m.classList.add('wz-on');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { m.classList.add('wz-visible'); });
    });
    if (typeof window.bhVisualizarSaldos === 'function') window.bhVisualizarSaldos();
  }
  function closeBanco() {
    var m = document.getElementById('wz-banco-modal');
    m.classList.remove('wz-visible');
    setTimeout(function () { m.classList.remove('wz-on'); }, 400);
  }

  /* ─────────────────────────────────────────────────────────────
     EVENTOS
  ───────────────────────────────────────────────────────────── */
  (function () {

    document.getElementById('wz-c-horarios').addEventListener('click', openHor);
    document.getElementById('wz-hor-close').addEventListener('click', closeHor);
    document.getElementById('wz-hor-modal-bg').addEventListener('click', closeHor);

    document.getElementById('wz-week-prev').addEventListener('click', function () {
      if (window._isFunchalUnificadoMode) {
        var groupsP = _wzGetWeekGroups();
        var giP = _wzFindGroupIndexForBlock(groupsP, _wzWeekIndex);
        if (giP > 0) wzWeekGo(groupsP[giP - 1].indices[0]);
        return;
      }
      wzWeekGo(_wzWeekIndex - 1);
    });
    document.getElementById('wz-week-next').addEventListener('click', function () {
      if (window._isFunchalUnificadoMode) {
        var groupsN = _wzGetWeekGroups();
        var giN = _wzFindGroupIndexForBlock(groupsN, _wzWeekIndex);
        if (giN < groupsN.length - 1) wzWeekGo(groupsN[giN + 1].indices[0]);
        return;
      }
      wzWeekGo(_wzWeekIndex + 1);
    });

    /* PVP — só Porto Santo (célula hidden via CSS para outras lojas) */
    document.getElementById('wz-c-pvp').addEventListener('click', function () {
      if (typeof pfPvpOpenEmployee === 'function') pfPvpOpenEmployee();
    });

    document.getElementById('wz-c-etiquetas').addEventListener('click', function () {
      if (typeof openEtiquetasOverlay === 'function') openEtiquetasOverlay();
    });

    document.getElementById('wz-c-recibo').addEventListener('click', function () {
      if (typeof openRecibosOverlay === 'function') openRecibosOverlay();
    });

    document.getElementById('wz-c-vendas').addEventListener('click', function () {
      if (typeof openVentasOverlay === 'function') openVentasOverlay();
    });

    document.getElementById('wz-aviso-btn').addEventListener('click', openAviso);
    document.getElementById('wz-aviso-modal-bg').addEventListener('click', closeAviso);

    document.getElementById('wz-banco-btn').addEventListener('click', openBanco);
    document.getElementById('wz-banco-modal-bg').addEventListener('click', closeBanco);
    document.getElementById('wz-banco-close').addEventListener('click', closeBanco);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeHor(); closeAviso(); closeBanco(); }
    });

    document.querySelectorAll('.wz-cell').forEach(function (c) {
      c.addEventListener('mouseenter', function () { if (window.WZ_SFX) WZ_SFX.hover(); });
      c.addEventListener('click',      function () { if (window.WZ_SFX) WZ_SFX.click(); });
    });
  })();

})();

})();


// ══════════════════════════════════════════════════════════════
//  PAINEL DE ADMINISTRAÇÃO — HORÁRIOS (aba "Horários" do admin-app)
//  IIFE independente: nenhum identificador colide com o bloco acima.
//  Depende de window._hRender e window._hCovBarIds, expostos acima.
// ══════════════════════════════════════════════════════════════
(function() {
  var hBlocks = null;
  var hCurrentStore = null;
  var hWeekIndex = 0;

  // ── DOM injected by nucleo.js (painel admin de horários) ──
  (function ensureTabShell() {
    if (document.getElementById('tab-horarios')) return;
    var adminApp = document.getElementById('admin-app');
    if (!adminApp) return;
    var panel = document.createElement('div');
    panel.id = 'tab-horarios';
    panel.className = 'tab-panel';
    panel.innerHTML = `    <div id="h-store-selector">
      <label>loja</label>
      <select id="h-store-select">
        <option value="">— selecionar —</option>
        <option value="mezka funchal">Mezka Funchal</option>
        <option value="parfois arcadas são francisco">Parfois Arcadas São Francisco</option>
        <option value="porto santo">Porto Santo</option>
      </select>
      <select id="h-week-select"></select>
    </div>
    <div id="h-dashboard"></div>
    <div id="h-table-area"><div id="h-status-msg">selecione uma loja para ver o horário</div></div>`;
    adminApp.appendChild(panel);
  })();

  // ── Auto-injeção: #horarios-sub-grid vazio. Tem de correr AQUI, síncrono,
  //    ANTES de ensureModuleCard() (a seguir) — este ficheiro é o PRIMEIRO
  //    da sequência de loadProtectedScripts() (ver shared.js), mas
  //    #horarios-sub-grid tem de existir já quando ensureModuleCard()
  //    (abaixo) e, mais tarde, admin-init.js (_adminInitWireCards, 5º da
  //    sequência, e relocateAccordionGrids) fizerem os seus varrimentos
  //    únicos de [data-horarios-module]. Sem overlay fullscreen: o grupo
  //    "Horários" expande-se no próprio lugar no dashboard. ──
  (function ensureOverlayShell() {
    if (document.getElementById('horarios-sub-grid')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="horarios-sub-grid"></div>');
  })();

  // ── Cartão do submenu "horários" injetado por nucleo.js ──
  (function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-horarios-module="horarios"]')) return;
    var grid = document.getElementById('horarios-sub-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-horarios-module', 'horarios');
    card.style.animationDelay = '0.05s';
    card.innerHTML = `        <span class="adm-mod-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
            <path d="M12 8v4l2.5 2.5" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <div>
          <div class="adm-mod-name">HORÁRIOS</div>
          <div class="adm-mod-desc">gestão de horários por loja</div>
        </div>
        <div class="adm-mod-arrow">→</div>
      `;
    var anchor = grid.querySelector('.adm-mod-card[data-horarios-module="gerador"]');
    if (anchor) grid.insertBefore(card, anchor);
    else grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.closeHorariosOverlay === 'function') window.closeHorariosOverlay();
      setTimeout(function () {
        if (typeof window.openModule === 'function') window.openModule('horarios');
      }, 200);
    });
  })();

  document.getElementById('h-store-select').addEventListener('change', function() {
    var store = this.value;
    if (!store) return;
    // Este ficheiro carrega para TODOS os logins (admin E empregada — o
    // index.html não distingue "rol" ao carregar o script). Só aqui, no
    // instante em que o admin realmente escolhe uma loja (nunca acontece
    // numa sessão de empregada, que não tem acesso a estes botões), é que
    // é seguro apontar o sistema de cobertura para a barra do admin — feito
    // mais cedo (ao carregar o script), ia partir o botão "cobertura" das
    // empregadas em TODAS as sessões, mesmo sem o admin alguma vez abrir o
    // separador de horários.
    // closeWatch: se o admin sair do separador "horários" (voltar ao
    // dashboard, ou trocar de separador) com a cobertura dividida aberta,
    // nucleo.js fecha-a sozinha (painéis fixed não têm "dono" nenhum, senão
    // ficavam a contaminar o dashboard principal até se clicar "fechar").
    window._hCovBarIds = { right: 'h-week-right', label: 'h-week-label', bar: 'h-hor-bar', modalBox: 'h-hor-box', closeWatch: { el: 'tab-horarios', activeClass: 'active' } };
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
  // início) removidas do painel admin — #h-dashboard fica apenas escondido. ──
  (function hHideDashboardBoxes() {
    var dash = document.getElementById('h-dashboard');
    if (dash) dash.style.display = 'none';
  })();

  // ── "aviso" — trigger movido para aqui (deixa de existir em nucleo.js),
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
        // display:flex;flex-direction:column;flex:1;min-height:0 — sem isto
        // #h-table-area (que só ganha altura via flex:1 quando o PAI é
        // flex) deixava de encolher ao espaço disponível dentro da tab, a
        // caixa crescia sem limite e #tab-horarios (overflow:hidden) cortava
        // o resto sem scroll nenhum. overflow:hidden aqui é só para os
        // cantos arredondados não vazarem — quem faz scroll de verdade é
        // #h-table-area, por baixo, com o seu próprio overflow-y:auto.
        '#h-hor-box{width:min(95vw,1080px);margin:0 auto;background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,.06);display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}',
        '#h-hor-bar{position:relative;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #efefef;background:#fff;border-radius:20px 20px 0 0;flex:0 0 auto;}',
        '#h-hor-bar>span{flex:1;}',
        '#h-week-nav{display:none;align-items:center;gap:2px;position:absolute;left:50%;transform:translateX(-50%);}',
        '#h-week-prev,#h-week-next{background:none;border:none;cursor:pointer;font-size:1.5rem;padding:4px 12px;line-height:1;color:#000;border-radius:8px;transition:background .15s;}',
        '#h-week-prev:hover,#h-week-next:hover{background:#f0f0f0;}',
        '#h-week-prev:disabled,#h-week-next:disabled{opacity:.2;cursor:default;pointer-events:none;}',
        '#h-week-right{display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;}',
        '#h-week-label{font-family:\'MontserratLight\',sans-serif;font-size:.72rem;font-weight:700;text-transform:lowercase;letter-spacing:.06em;color:#555;}',
        '#h-table-area{padding:20px;box-sizing:border-box;}',
        // Calco exato da correção já aplicada a #wz-hor-modal-bar (barra das
        // empregadas): em ecrã estreito, o botão "cobertura" + "semana N" no
        // lado direito cresciam o suficiente para tapar a seta direita (que
        // fica centrada em posição absoluta). A classe funchal-cov-on já é
        // adicionada automaticamente por nucleo.js (funchalCovBarEnsureButton)
        // sempre que o botão de cobertura existe — aqui só faltavam as regras.
        '@media (max-width:760px){',
        '#h-hor-bar.funchal-cov-on{gap:6px;padding-left:12px!important;padding-right:12px!important;}',
        '#h-hor-bar.funchal-cov-on #h-week-nav{position:static!important;left:auto!important;transform:none!important;flex:none!important;order:2;}',
        '#h-hor-bar.funchal-cov-on>span{flex:1 1 0!important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;order:1;}',
        '#h-hor-bar.funchal-cov-on #h-week-right{flex:none!important;order:3;gap:5px!important;}',
        '#h-hor-bar.funchal-cov-on #h-week-prev,#h-hor-bar.funchal-cov-on #h-week-next{font-size:1.15rem!important;padding:4px 7px!important;}',
        '#h-hor-bar.funchal-cov-on #funchal-cov-toggle{font-size:10px!important;padding:5px 11px!important;}',
        '#h-hor-bar.funchal-cov-on #h-week-label{display:none;}',
        '}'
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

    // window._hCovBarIds NÃO é definido aqui (este IIFE corre ao carregar o
    // script, para TODOS os logins, incluindo empregadas) — só é definido
    // no listener de 'change' do #h-store-select, acima, que só dispara
    // quando o admin clica mesmo num botão de loja.
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
      // vem, exatamente como o dashboard de empregadas (loadData/nucleo.js).
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

  // portoSantoCurrentRowsIfActive() (nucleo.js) lê o índice da semana atual
  // em document.getElementById('week-select').value — um <select> que só a
  // empregada cria (dentro de loadData). O admin nunca chama loadData, por
  // isso esse elemento não existe aqui; criamos um <input type="hidden">
  // equivalente, só para satisfazer essa leitura (não precisa de <option>s
  // como um <select> real precisaria).
  function hSyncWeekSelectShim(index) {
    var ws = document.getElementById('week-select');
    if (!ws) {
      ws = document.createElement('input');
      ws.type = 'hidden';
      ws.id = 'week-select';
      document.body.appendChild(ws);
    }
    ws.value = index;
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
      // Limpa qualquer resíduo de Porto Santo: portoSantoCurrentRowsIfActive()
      // (nucleo.js) lê window._lastBlocks/#week-select em primeiro lugar, e
      // se ficasse com dados antigos, o painel de cobertura do funchal
      // continuaria "ligado" a Porto Santo em vez de atualizar (bug já visto).
      window._lastBlocks = null;
      window._hRender.funchal(filtered, index);
    } else {
      const firstCell = (filtered[index][0][0] || '').trim().toLowerCase();
      if (firstCell === 'porto santo') {
        // Porto Santo NÃO liga o botão/painel de cobertura dentro do próprio
        // render (ao contrário do funchal) — depende de um MutationObserver
        // ligado ao #table-container ORIGINAL, que nunca deteta as mutações
        // daqui (o admin desvia o render para um nó substituto com o mesmo
        // id). Por isso preenchemos manualmente o mesmo estado que esse
        // observer esperaria (window._lastBlocks + #week-select.value) e
        // chamamos diretamente window._hRender.refreshPortoSantoCoverage() —
        // TEM de ser feito enquanto "temp" ainda tem id="table-container",
        // porque essa função lê o DOM por esse id (senão via para o
        // #table-container real e vazio).
        window._lastBlocks = filtered;
        hSyncWeekSelectShim(index);
        window._hRender.porto(filtered, index);
        if (window._hRender.refreshPortoSantoCoverage) window._hRender.refreshPortoSantoCoverage();
      } else {
        window._lastBlocks = null;
        window._hRender.table(filtered, index);
      }
    }

    temp.removeAttribute('id');
    if (real) real.setAttribute('id', 'table-container');

    hShowEditButton(filtered, index);
  }

  // ══════════════════════════════════════════════════════════════
  //  "PESSOAS ATIVAS AGORA" (fundido de index.html) — bolha flutuante
  //  do admin com quem está a trabalhar neste momento, por loja. Lê os
  //  CSVs de horários diretamente; cruza VÁRIAS lojas ao mesmo tempo,
  //  por isso vive isolada na sua própria IIFE, sem partilhar estado
  //  com o resto deste ficheiro (que trabalha sempre uma loja de cada
  //  vez). Auto-injeta o próprio shell (#wz-active-panel) porque, tal
  //  como o resto deste ficheiro, só carrega DEPOIS do login — o antigo
  //  DOMContentLoaded nunca dispararia aqui (já disparou há muito antes
  //  deste script ser injetado); substituído por um check imediato ao
  //  estado atual de #admin-app.
  // ══════════════════════════════════════════════════════════════
(function () {
  function ensureActivePanelShell() {
    if (document.getElementById('wz-active-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'wz-active-panel';
    panel.innerHTML = `
  <div id="wz-active-bubble"></div>
  <div id="wz-active-tooltip">
    <div id="wz-active-tooltip-title">pessoas ativas agora</div>
    <div id="wz-active-list"><div id="wz-active-empty">a carregar…</div></div>
    <div id="wz-active-updated"></div>
  </div>
`;
    document.body.appendChild(panel);
  }

  var CSV_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/datosfnc.csv';
  var PORTO_BASE_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co/storage/v1/object/public/horarios/porto_s';
  var BASE_DATE = new Date('2026-01-05T00:00:00');

  var STANDARD_STORES = [
    { key: 'mezka funchal', label: 'Mezka Funchal' },
    { key: 'parfois arcadas', label: 'Parfois Arcadas' }
  ];

  var wzStarted = false;
  var wzTimer = null;

  function wzParseCsvBlocks(csvText) {
    var parsed = Papa.parse(csvText, { skipEmptyLines: false });
    var rows = parsed.data.map(function (r) {
      return r.map(function (c) { return c == null ? '' : String(c).trim(); });
    });
    var blocks = [];
    var cur = [];
    rows.forEach(function (r) {
      if (r.every(function (c) { return c === ''; })) {
        if (cur.length) { blocks.push(cur); cur = []; }
      } else {
        cur.push(r);
      }
    });
    if (cur.length) blocks.push(cur);
    return blocks;
  }

  function wzIsSameAsToday(dateStr) {
    if (!dateStr) return false;
    var parts = dateStr.split('/');
    if (parts.length !== 3) return false;
    var d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    return d.toDateString() === new Date().toDateString();
  }

  function wzFindTodayCol(headerRow) {
    if (!headerRow) return -1;
    for (var col = 1; col < headerRow.length; col++) {
      if (wzIsSameAsToday(headerRow[col])) return col;
    }
    return -1;
  }

  // Analisa o horário do dia (ex.: "09:00-13:00,14:00-18:00") e, se agora
  // cair dentro de algum tramo, devolve o fim desse tramo (currentEnd) e o
  // fim do ÚLTIMO tramo do dia (finalEnd — a hora de saída real). Todas as
  // pessoas têm sempre os seus tramos diários (normalmente 2, com intervalo
  // a meio), mas o código aceita qualquer número de tramos. Devolve null se
  // agora não cai em nenhum tramo (fora de horário ou em intervalo).
  function wzScheduleInfo(schedule) {
    var now = new Date();
    var segments = schedule.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var parsed = [];
    for (var i = 0; i < segments.length; i++) {
      var parts = segments[i].split('-');
      if (parts.length < 2) continue;
      var start = parts[0].trim(), end = parts[1].trim();
      var sh = parseInt(start.split(':')[0], 10), sm = parseInt(start.split(':')[1] || '0', 10);
      var eh = parseInt(end.split(':')[0], 10), em = parseInt(end.split(':')[1] || '0', 10);
      if (isNaN(sh) || isNaN(eh)) continue;
      parsed.push({
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em)
      });
    }
    if (!parsed.length) return null;
    var activeIdx = -1;
    for (var j = 0; j < parsed.length; j++) {
      if (now >= parsed[j].start && now <= parsed[j].end) { activeIdx = j; break; }
    }
    if (activeIdx < 0) return null;
    var lastIdx = parsed.length - 1;
    return {
      currentEnd: parsed[activeIdx].end,
      finalEnd: parsed[lastIdx].end,
      isLastSegment: activeIdx === lastIdx
    };
  }

  // Lojas "normais": bloco = [rótulo+dias semana, SEMANA X+datas, ...linhas de funcionários (+linha "Nhrs" de resumo)]
  function wzActiveFromStandardBlock(block, storeLabel) {
    var active = [];
    var todayCol = wzFindTodayCol(block[1]);
    if (todayCol < 0) return active;
    var seen = {};
    block.slice(2).forEach(function (row) {
      var name = (row[0] || '').trim();
      if (!name || seen[name]) return;
      var val = (row[todayCol] || '').trim();
      if (!val) return;
      var info = wzScheduleInfo(val);
      if (info) {
        seen[name] = true;
        active.push({ name: name, store: storeLabel, currentEnd: info.currentEnd, finalEnd: info.finalEnd, isLastSegment: info.isLastSegment });
      }
    });
    return active;
  }

  // Porto Santo: várias sub-lojas (SHANA, MEZKA AVENIDA, MEZKA MERCADO, MAXX) dentro do mesmo bloco,
  // separadas por linhas divisórias "PORTO SANTO,SEG,TER,..." e cabeçalhos "SUBLOJA,datas...".
  // O nome do funcionário vem colado às horas semanais, ex.: "LEONIA P.40hrs".
  function wzActiveFromPortoRows(rows) {
    var active = [];
    var seen = {};
    var currentStore = null;
    var currentCol = -1;
    rows.forEach(function (row) {
      var c0 = (row[0] || '').trim();
      var c0Upper = c0.toUpperCase();
      if (c0Upper === 'PORTO SANTO') return;
      if (row[1] && /^\d{2}\/\d{2}\/\d{4}$/.test(row[1])) {
        currentStore = c0;
        currentCol = wzFindTodayCol(row);
        return;
      }
      if (!currentStore || currentCol < 0 || !c0) return;
      var m = c0.match(/^(.*?)(\d+(?:\.\d+)?hrs)$/i);
      var name = (m ? m[1] : c0).trim();
      if (!name) return;
      var val = (row[currentCol] || '').trim();
      var key = name + '||' + currentStore;
      if (!val || seen[key]) return;
      var info = wzScheduleInfo(val);
      if (info) {
        seen[key] = true;
        active.push({ name: name, store: wzTitleCase(currentStore), currentEnd: info.currentEnd, finalEnd: info.finalEnd, isLastSegment: info.isLastSegment });
      }
    });
    return active;
  }

  function wzTitleCase(s) {
    return String(s).toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }

  // Determina o número da semana (formato usado nos ficheiros porto_sNN.csv) para o dia de hoje,
  // usando a segunda-feira da semana atual como âncora (evita erros de arredondamento ao domingo).
  function wzPortoWeekNumForToday() {
    var today = new Date();
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var day = todayMid.getDay();
    var diffToMonday = (day === 0 ? -6 : 1 - day);
    var monday = new Date(todayMid);
    monday.setDate(monday.getDate() + diffToMonday);
    return Math.round((monday - BASE_DATE) / (7 * 86400000)) + 1;
  }

  async function wzFetchText(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  async function wzResolvePortoActive(standardBlocks) {
    var weekNum = wzPortoWeekNumForToday();
    if (weekNum >= 17) {
      try {
        var text = await wzFetchText(PORTO_BASE_URL + weekNum + '.csv?t=' + Date.now());
        if (text && text.trim()) {
          var flat = Papa.parse(text, { skipEmptyLines: false }).data
            .map(function (r) { return r.map(function (c) { return c == null ? '' : String(c).trim(); }); })
            .filter(function (r) { return !r.every(function (c) { return c === ''; }); });
          if (flat.length) return wzActiveFromPortoRows(flat);
        }
      } catch (e) { /* cai para o CSV geral abaixo */ }
    }
    // Fallback: procurar bloco "porto santo" com a data de hoje dentro do CSV geral
    var portoBlocks = standardBlocks.filter(function (b) {
      return (b[0][0] || '').toLowerCase() === 'porto santo';
    });
    for (var i = 0; i < portoBlocks.length; i++) {
      var block = portoBlocks[i];
      var hasToday = block.some(function (row) {
        return row.some(function (cell) { return wzIsSameAsToday(cell); });
      });
      if (hasToday) return wzActiveFromPortoRows(block);
    }
    return [];
  }

  function wzEscapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Ordem fixa de exibição: primeiro as lojas de Porto Santo, depois as restantes.
  var STORE_ORDER = ['Mezka Avenida', 'Mezka Mercado', 'Shana', 'Maxx', 'Mezka Funchal', 'Parfois Arcadas'];

  function wzSortByStoreOrder(list) {
    return list.slice().sort(function (a, b) {
      var ia = STORE_ORDER.indexOf(a.store); if (ia < 0) ia = STORE_ORDER.length;
      var ib = STORE_ORDER.indexOf(b.store); if (ib < 0) ib = STORE_ORDER.length;
      return ia - ib;
    });
  }

  // Formata "HH:MM" (relogio) para a hora de saida final, e "H:MM:SS"/"MM:SS"
  // (cronometro) para o tempo em falta ate ao fim do tramo atual.
  function wzFormatClockTime(date) {
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  function wzFormatCountdown(ms) {
    if (ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(s).padStart(2, '0');
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
  }

  function wzRenderActive(active) {
    var listEl = document.getElementById('wz-active-list');
    if (!listEl) return;
    if (!active.length) {
      listEl.innerHTML = '<div id="wz-active-empty">ninguém ativo agora</div>';
      return;
    }
    var sorted = wzSortByStoreOrder(active);
    var html = '';
    var prevStore = null;
    sorted.forEach(function (p) {
      if (prevStore !== null && p.store !== prevStore) {
        html += '<div class="wz-active-sep">***</div>';
      }
      // Cronómetro conta sempre até ao fim do tramo ATUAL (o intervalo, se
      // houver um tramo a seguir; a saída real, se for o último tramo). Só
      // mostra a hora de saída fixa quando ainda falta um tramo depois deste.
      var exitHtml = p.isLastSegment ? '' :
        '<span class="wz-active-exit">sai ' + wzFormatClockTime(p.finalEnd) + '</span>';
      html += '<div class="wz-active-item" data-current-end="' + p.currentEnd.getTime() + '">' +
        '<span class="wz-active-name">' + wzEscapeHtml(p.name) +
        '</span><span class="wz-active-store">' + wzEscapeHtml(p.store) + '</span>' +
        '<span class="wz-active-countdown"></span>' +
        exitHtml +
        '</div>';
      prevStore = p.store;
    });
    listEl.innerHTML = html;
    wzTickCountdowns();
  }

  // Corre a cada segundo enquanto o painel existe: atualiza cada cronómetro
  // visível e remove do DOM quem acabou de chegar a 0 (fim do tramo atual —
  // ou entrou em intervalo, ou saiu de vez). Nunca mostra tempo negativo;
  // a pessoa desaparece da lista em vez disso, sem esperar pelo próximo
  // refresh de dados (que só corre a cada meia hora).
  function wzTickCountdowns() {
    var listEl = document.getElementById('wz-active-list');
    if (!listEl) return;
    var now = Date.now();
    listEl.querySelectorAll('.wz-active-item[data-current-end]').forEach(function (el) {
      var currentEnd = +el.dataset.currentEnd;
      var diff = currentEnd - now;
      if (diff <= 0) { el.remove(); return; }
      var cd = el.querySelector('.wz-active-countdown');
      if (cd) cd.textContent = wzFormatCountdown(diff);
    });
    if (!listEl.querySelector('.wz-active-item')) {
      listEl.innerHTML = '<div id="wz-active-empty">ninguém ativo agora</div>';
    }
  }

  async function wzLoadActive() {
    var listEl = document.getElementById('wz-active-list');
    var updatedEl = document.getElementById('wz-active-updated');
    var bubbleEl = document.getElementById('wz-active-bubble');
    if (!listEl) return;
    try {
      var csvText = await wzFetchText(CSV_URL + '?t=' + Date.now());
      var blocks = wzParseCsvBlocks(csvText);

      var results = [];
      STANDARD_STORES.forEach(function (store) {
        var candidates = blocks.filter(function (b) { return (b[0][0] || '').toLowerCase() === store.key; });
        var match = null;
        for (var i = 0; i < candidates.length; i++) {
          if (wzFindTodayCol(candidates[i][1]) >= 0) { match = candidates[i]; break; }
        }
        if (match) results = results.concat(wzActiveFromStandardBlock(match, store.label));
      });
      results = results.concat(await wzResolvePortoActive(blocks));

      wzRenderActive(results);
      if (bubbleEl) bubbleEl.classList.toggle('zero', results.length === 0);
      if (updatedEl) {
        updatedEl.textContent = 'atualizado às ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      }
    } catch (err) {
      if (updatedEl) updatedEl.textContent = 'erro ao atualizar';
    }
  }

  // Milissegundos até à próxima marca de relógio "em ponto" ou "e meia" (xx:00 / xx:30).
  function wzMsUntilNextHalfHour() {
    var now = new Date();
    var next = new Date(now);
    if (now.getMinutes() < 30) {
      next.setMinutes(30, 0, 0);
    } else {
      next.setHours(now.getHours() + 1, 0, 0, 0);
    }
    return next.getTime() - now.getTime();
  }

  // Agenda-se sempre para a próxima marca de relógio, não para "+30min desde a última consulta",
  // para que a atualização aconteça sempre às xx:00 e xx:30, independentemente da hora em que o painel arrancou.
  function wzScheduleNextRefresh() {
    if (wzTimer) clearTimeout(wzTimer);
    wzTimer = setTimeout(function () {
      wzLoadActive();
      wzScheduleNextRefresh();
    }, wzMsUntilNextHalfHour());
  }

  var wzCountdownTimer = null;

  function wzStartPanel() {
    if (wzStarted) return;
    wzStarted = true;
    ensureActivePanelShell();
    var panel = document.getElementById('wz-active-panel');
    if (panel) {
      panel.classList.add('show');
      requestAnimationFrame(function () { panel.classList.add('visible'); });
    }
    wzLoadActive();
    wzScheduleNextRefresh();
    if (!wzCountdownTimer) wzCountdownTimer = setInterval(wzTickCountdowns, 1000);
  }

  var adminApp = document.getElementById('admin-app');
  if (adminApp) {
    if (adminApp.classList.contains('show')) {
      wzStartPanel();
    } else {
      new MutationObserver(function (muts, obs) {
        if (adminApp.classList.contains('show')) { obs.disconnect(); wzStartPanel(); }
      }).observe(adminApp, { attributes: true, attributeFilter: ['class'] });
    }
  }
})();


})();
