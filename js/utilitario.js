// ══════════════════════════════════════════════════════════════
//  UTILITARIO — ficheiro fundido (agenda + rótulos + saft-reminder)
//  Bloco AGENDA: mantém a sua própria IIFE (scope isolado).
//  Bloco RÓTULOS: mantém a sua própria IIFE (scope isolado).
//  Bloco SAFT-REMINDER: mantém-se em scope de topo, sem IIFE —
//  initSaftReminder() é chamado por shared.js como função global no
//  fluxo de login do admin; envolvê-lo numa IIFE quebraria esse
//  fluxo. Confirmado: zero colisões de nomes entre os 3 blocos.
// ══════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════
   AGENDA — módulo completo
   Injecta CSS + HTML no overlay #ag-root e gere estado
══════════════════════════════════════════════════════ */

(function () {
'use strict';

var AG_CSS = `
*{cursor:crosshair!important}
input,textarea{cursor:text!important}
`;

var AG_HTML = `
<div id="ag-app">
<div id="ag-year-nav"></div>
<div id="ag-close-year-wrap"><button id="ag-btn-close-year">fechar exercício</button></div>
<div id="ag-header">
  <div id="ag-title">agenda faturas</div>
  <div id="ag-today"></div>
</div>
<div id="ag-readonly-banner">
  <span id="ag-readonly-msg"></span>
  <span id="ag-readonly-badge">arquivo · leitura</span>
</div>
<div id="ag-edit-once-wrap">
  <button id="ag-btn-edit-once">✎ editar exercício</button>
  <button id="ag-btn-confirm-once">✓ confirmar e fechar edição</button>
  <span class="ag-edit-once-msg" id="ag-edit-once-msg"></span>
</div>
<div id="ag-hero">
  <div id="ag-hero-row">
    <div id="ag-hero-main">
      <div id="ag-hero-label">total pendente</div>
      <div id="ag-hero-value">—</div>
      <div id="ag-hero-sub"></div>
    </div>
    <div id="ag-hero-stats"></div>
  </div>
  <div id="ag-insights"></div>
</div>
<div id="ag-summary"></div>
<div id="ag-alerts"></div>
<div id="ag-chart-wrap">
  <div class="ag-cb">
    <div class="ag-ct">distribuição pendente</div>
    <div id="ag-donut-wrap">
      <svg id="ag-donut" width="72" height="72" viewBox="0 0 72 72"></svg>
      <div id="ag-donut-legend"></div>
    </div>
  </div>
  <div class="ag-cb ag-cb-wide">
    <div class="ag-ct">exposição por vencimento</div>
    <div id="ag-bar-chart"></div>
    <div id="ag-bar-labels"></div>
  </div>
</div>
<div id="ag-toolbar">
  <button class="ag-btn ag-btn-p" id="ag-btn-nova">+ nova fatura</button>
  <div id="ag-forn-btns"></div>
  <div id="ag-filter-wrap">
    <button class="ag-filter-btn active" data-filter="all">todas</button>
    <button class="ag-filter-btn ag-fp" data-filter="pendente">pendente</button>
    <button class="ag-filter-btn ag-fv" data-filter="vencida">vencidas</button>
    <button class="ag-filter-btn ag-fg" data-filter="pago">pago</button>
  </div>
</div>
<div id="ag-forn-banner">
  <div id="ag-fb-name"></div>
  <div id="ag-fb-stats"></div>
</div>
<div id="ag-table-outer"><div id="ag-table-wrap">
  <table id="ag-table">
    <thead><tr>
      <th class="ag-thc ag-th-num">#</th>
      <th data-sort="fornecedor">Fornecedor</th>
      <th data-sort="factura">Fatura</th>
      <th class="ag-thr" data-sort="valor">Valor</th>
      <th data-sort="data">Data</th>
      <th data-sort="vencimento">Vencimento</th>
      <th class="ag-thc">Prazo</th>
      <th class="ag-thc">Estado</th>
      <th class="ag-thc ag-th-actions"></th>
    </tr></thead>
    <tbody id="ag-tbody"></tbody>
  </table>
  <div id="ag-empty">nenhuma fatura encontrada</div>
</div></div>
<div class="ag-sl">por fornecedor</div>
<div id="ag-by-forn"></div>
</div>
<div id="ag-mo">
  <div id="ag-mb">
    <div id="ag-mt">nova fatura</div>
    <div class="ag-fg2">
      <div class="ag-fr"><label>Fornecedor</label><input class="ag-in" id="ag-f-forn" type="text" placeholder="ex: TAM, GIT…" list="ag-forn-list"><datalist id="ag-forn-list"><option value="TAM"><option value="GIT"><option value="BESTSELLER"><option value="CHLAMYS"></datalist></div>
      <div class="ag-fr"><label>Nº Fatura</label><input class="ag-in" id="ag-f-fat" type="text" placeholder="ZY-26000000"></div>
      <div class="ag-fr"><label>Valor (€)</label><input class="ag-in" id="ag-f-val" type="text" inputmode="decimal" placeholder="3.609,19"></div>
      <div class="ag-fr"><label>Estado</label><select class="ag-in" id="ag-f-est"><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="nc">Nota de Crédito</option></select></div>
      <div class="ag-fr"><label>Data Fatura</label><input class="ag-in" id="ag-f-dat" type="date"></div>
      <div class="ag-fr"><label>Vencimento</label><input class="ag-in" id="ag-f-vec" type="date"></div>
    </div>
    <div class="ag-mbtns">
      <button class="ag-btn" id="ag-mc">cancelar</button>
      <button class="ag-btn ag-btn-p" id="ag-ms">guardar</button>
    </div>
  </div>
</div>
<div id="ag-snack"><span id="ag-snack-icon"></span> <span id="ag-snack-msg"></span></div>
`;

var _agStyleInjected = false;
function agInjectStyle() {
  if (_agStyleInjected) return;
  _agStyleInjected = true;
  var s = document.createElement('style');
  s.id = 'ag-module-style';
  s.textContent = AG_CSS;
  document.head.appendChild(s);
}

var _agHtmlInjected = false;
var _agRefreshDate = null;
function agInjectHtml() {
  if (_agHtmlInjected) return;
  _agHtmlInjected = true;
  var root = document.getElementById('ag-root');
  if (root) root.innerHTML = AG_HTML;
  agBindLogic();
}

window.openAgendaOverlay = function () {
  agInjectStyle();
  var ov = document.getElementById('agenda-overlay');
  if (!ov) return;
  ov.classList.add('open');
  requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('visible'); }); });
  agInjectHtml();
  if (_agRefreshDate) _agRefreshDate();
  var yn = document.getElementById('ag-year-nav');
  if (yn) yn.classList.add('ag-visible');
};

window.closeAgendaOverlay = function () {
  var ov = document.getElementById('agenda-overlay');
  if (!ov) return;
  ov.classList.remove('visible');
  var yn = document.getElementById('ag-year-nav');
  if (yn) yn.classList.remove('ag-visible');
  setTimeout(function () { ov.classList.remove('open'); }, 600);
};

function agBindLogic() {
  var CURRENT_YEAR = new Date().getFullYear();
  var FIRST_YEAR = 2023;
  var ALL_YEARS = [];
  for (var y = FIRST_YEAR; y <= CURRENT_YEAR; y++) ALL_YEARS.push(y);

  var activeYear = CURRENT_YEAR;
  var agF = [], agFilter = 'all', agForn = null, agQ = '';
  var agSort = {col:'data',dir:'asc'}, agEditId = null;
  var TODAY = new Date(); TODAY.setHours(0,0,0,0);
  /* Días hasta el domingo de esta semana (0 = hoy es domingo, siempre >= 0) */
  var DAYS_TO_SUNDAY = (7 - TODAY.getDay()) % 7;
  var _editOnceActive = false;

  function dataKey(y)   { return 'ag_faturas_' + y; }
  function lockedKey(y) { return 'ag_locked_'  + y; }
  function editOnceKey(y){ return 'ag_editonce_used_' + y; }
  function isLocked(y)  { return !!localStorage.getItem(lockedKey(y)); }
  function editOnceUsed(y){ return !!localStorage.getItem(editOnceKey(y)); }
  function isReadonly() { return isLocked(activeYear) || (activeYear < CURRENT_YEAR && !_editOnceActive); }

  /* Sem seed — agenda começa vazia */
  function fmt(n){return new Intl.NumberFormat('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €'}
  function fmtK(n){return Math.abs(n)>=1000?(n/1000).toFixed(0)+'k':Math.round(n)+''}
  function fd(s){if(!s)return'—';var d=new Date(s+'T00:00:00');return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}
  function dd(s){var d=new Date(s+'T00:00:00');return isNaN(d)?null:Math.round((d-TODAY)/86400000)}
  function nid(){return agF.length?Math.max.apply(null,agF.map(function(f){return f.id;}))+1:1}
  function est(f){if(f.estado==='pago'||f.estado==='nc')return f.estado;var d=dd(f.vencimento);return(d!==null&&d<0)?'vencida':'pendente'}

  /* ══════════════════════════════════════════════
     SUPABASE CONFIG
     Substitui os valores abaixo pelos do teu projeto.
     Project URL  → Supabase Dashboard → Settings → API
     Anon Key     → Supabase Dashboard → Settings → API
  ══════════════════════════════════════════════ */
  var SB_URL = window.SUPABASE_URL || '';
  var SB_KEY = window.SUPABASE_KEY || '';

  /* ── Sync status indicator ── */
  var _syncEl = null;
  function getSyncEl(){
    if(_syncEl) return _syncEl;
    _syncEl = document.getElementById('ag-sync-status');
    if(!_syncEl){
      _syncEl = document.createElement('div');
      _syncEl.id = 'ag-sync-status';
      document.body.appendChild(_syncEl);
    }
    return _syncEl;
  }
  function setSyncStatus(state, msg){
    var el = getSyncEl();
    var icons = { syncing:'⟳', ok:'✓', error:'⚠', offline:'◌' };
    var colors = { syncing:'#1565c0', ok:'#2e7d32', error:'#c62828', offline:'#e65100' };
    el.style.color = colors[state] || '#000';
    el.style.borderColor = colors[state] || '#e6e6e6';
    el.innerHTML = '<span class="ag-sync-icon">' + (icons[state]||'·') + '</span> ' + msg;
    el.style.opacity = '1';
    if(state === 'ok'){
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(function(){ el.style.opacity = '0'; }, 2500);
    }
  }

  /* ── Supabase REST helpers ── */
  function sbHeaders(){
    return { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'x-admin-token': 'wkz-admin-2025-secret' };
  }
  function sbFetch(path, opts){
    return fetch(SB_URL + '/rest/v1/' + path, Object.assign({ headers: sbHeaders() }, opts||{}));
  }

  /* ── SAVE (async, upsert) ── */
  var _saveDebounce = null;
  var _pendingSave = false;
  var _autoSaveInterval = null;

  function save(){
    if(isReadonly()) return;
    /* Guarda também em localStorage como fallback offline */
    try{ localStorage.setItem(dataKey(activeYear), JSON.stringify(agF)); }catch(e){}
    /* Debounce: agrupa mudanças rápidas num único pedido */
    _pendingSave = true;
    clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(function(){ _flushSave(); }, 800);
  }

  function _flushSave(){
    if(!_pendingSave) return;
    _pendingSave = false;
    if(isReadonly()) return;
    setSyncStatus('syncing', 'a guardar…');
    var payload = { ano: activeYear, faturas: JSON.stringify(agF), updated_at: new Date().toISOString() };
    sbFetch('ag_agenda?ano=eq.' + activeYear, {
      method: 'POST',
      headers: Object.assign(sbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(payload)
    }).then(function(r){
      if(r.ok){ setSyncStatus('ok', 'guardado'); }
      else{ r.text().then(function(t){ console.error('AG save error', t); setSyncStatus('error', 'erro ao guardar'); }); }
    }).catch(function(e){ console.error('AG save network error', e); setSyncStatus('offline', 'offline — guardado localmente'); });
  }

  /* ── LOAD (async) ── */
  function load(y){
    /* Carrega imediatamente do localStorage enquanto Supabase responde */
    try{
      var cached = localStorage.getItem(dataKey(y));
      if(cached){ agF = JSON.parse(cached); rAll(); }
      else{ agF = []; }
    }catch(e){ agF = []; }

    setSyncStatus('syncing', 'a carregar…');
    sbFetch('ag_agenda?ano=eq.' + y + '&select=faturas', { method:'GET' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(data && data.length && data[0].faturas){
          var remote = JSON.parse(data[0].faturas);
          agF = remote;
          try{ localStorage.setItem(dataKey(y), JSON.stringify(agF)); }catch(e){}
          setSyncStatus('ok', 'sincronizado');
          rAll();
          rFornDatalist();
        } else {
          /* Nenhum registo remoto ainda — se há dados locais faz upload inicial */
          setSyncStatus('ok', 'pronto');
          if(agF.length > 0) _flushSave();
          else rAll();
        }
      })
      .catch(function(e){
        console.error('AG load error', e);
        setSyncStatus('offline', 'offline — dados locais');
        rAll();
      });
  }

  /* ── AUTOGUARDADO a cada 15 segundos ── */
  function startAutoSave(){
    stopAutoSave();
    _autoSaveInterval = setInterval(function(){
      if(!isReadonly() && _pendingSave){ _flushSave(); }
      else if(!isReadonly()){
        /* Ping silencioso para confirmar sync */
        setSyncStatus('syncing','a verificar…');
        sbFetch('ag_agenda?ano=eq.'+activeYear+'&select=updated_at',{method:'GET'})
          .then(function(r){return r.json();})
          .then(function(){ setSyncStatus('ok','em dia'); })
          .catch(function(){ setSyncStatus('offline','offline'); });
      }
    }, 15000);
  }
  function stopAutoSave(){ clearInterval(_autoSaveInterval); }

  /* Inicia o autoguardado quando o overlay abre */
  (function(){
    var ov = document.getElementById('agenda-overlay');
    if(ov){
      var obs = new MutationObserver(function(){
        if(ov.classList.contains('open')) startAutoSave();
        else stopAutoSave();
      });
      obs.observe(ov, { attributes:true, attributeFilter:['class'] });
    }
  })();

  var _st;
  function snack(ic,msg){
    var el=document.getElementById('ag-snack');if(!el)return;
    clearTimeout(_st);
    document.getElementById('ag-snack-icon').textContent=ic;
    document.getElementById('ag-snack-msg').textContent=msg;
    el.classList.add('show');
    _st=setTimeout(function(){el.classList.remove('show');},2200);
  }
  function rpl(btn,e){
    var r=document.createElement('span'),rc=btn.getBoundingClientRect(),sz=Math.max(rc.width,rc.height);
    r.className='ag-ripple';
    r.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+(e.clientX-rc.left-sz/2)+'px;top:'+(e.clientY-rc.top-sz/2)+'px';
    btn.appendChild(r);setTimeout(function(){r.remove();},440);
  }
  var _pv={};
  function animVal(el,from,to,dur){
    var s=null;
    function step(ts){if(!s)s=ts;var p=Math.min((ts-s)/dur,1),ease=1-Math.pow(1-p,3),c=from+(to-from)*ease;el.textContent=fmt(c);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  function rEditOnce(){
    var wrap=document.getElementById('ag-edit-once-wrap');
    var btnEdit=document.getElementById('ag-btn-edit-once');
    var btnConfirm=document.getElementById('ag-btn-confirm-once');
    var msg=document.getElementById('ag-edit-once-msg');
    if(!wrap)return;
    var isPrev=activeYear<CURRENT_YEAR,used=editOnceUsed(activeYear),locked=isLocked(activeYear);
    if(isPrev&&!locked&&!used&&!_editOnceActive){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='';if(btnConfirm)btnConfirm.classList.remove('show');if(msg)msg.classList.remove('show');}
    else if(isPrev&&_editOnceActive){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='none';if(btnConfirm)btnConfirm.classList.add('show');if(msg){msg.textContent='modo edição ativo — confirme quando terminar';msg.classList.add('show');}}
    else if(isPrev&&used){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='none';if(btnConfirm)btnConfirm.classList.remove('show');if(msg){msg.textContent='edição única já utilizada neste exercício';msg.classList.add('show');}}
    else{wrap.classList.remove('show');_editOnceActive=false;}
  }
  function rYearNav(){
    var nav=document.getElementById('ag-year-nav');
    var closeWrap=document.getElementById('ag-close-year-wrap');
    nav.innerHTML=ALL_YEARS.map(function(y){
      var locked=isLocked(y);
      var cls='ag-year-btn'+(y===activeYear?' active-year':'')+(locked?' locked':'');
      return '<button class="'+cls+'" data-year="'+y+'">'+y+'</button>';
    }).join('');
    var canClose=!isLocked(CURRENT_YEAR)&&activeYear===CURRENT_YEAR&&TODAY>=new Date(CURRENT_YEAR+1,0,1);
    if(closeWrap)closeWrap.className=canClose?'show':'';
    nav.querySelectorAll('.ag-year-btn').forEach(function(btn){
      btn.addEventListener('click',function(){var y=parseInt(this.dataset.year,10);if(y!==activeYear)switchYear(y);});
    });
  }
  function rFornBtns(){
    var container=document.getElementById('ag-forn-btns');if(!container)return;
    var found={};agF.forEach(function(f){found[f.fornecedor]=true;});
    /* ordem: fornecedores conhecidos primeiro, depois os restantes por ordem alfabética */
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(found).filter(function(k){return known.indexOf(k)<0;}).sort();
    var fkeys=known.filter(function(k){return found[k];}).concat(others);
    container.innerHTML=fkeys.map(function(k){
      var cls='ag-fb'+(agForn===k?' active':'');
      var col=fornColor(k);
      /* injeta estilo inline para fornecedores sem classe CSS predefinida */
      var style=FC_BASE[k]?'':'style="--forn-col:'+col+'"';
      return '<button class="'+cls+' ag-fb-dyn" data-forn="'+k+'" '+style+' data-col="'+col+'">'+k+'<span class="ag-fbadge" id="ag-b-'+k+'"></span></button>';
    }).join('');
    container.querySelectorAll('.ag-fb').forEach(function(btn){
      /* aplica cor activa para fornecedores sem CSS predefinida */
      var col=btn.dataset.col;
      if(col&&!FC_BASE[btn.dataset.forn]){
        btn.addEventListener('mouseenter',function(){if(!this.classList.contains('active'))this.style.background=col;});
        btn.addEventListener('mouseleave',function(){if(!this.classList.contains('active'))this.style.background='';});
      }
      btn.addEventListener('click',function(){
        var f=this.dataset.forn;
        if(agForn===f){agForn=null;container.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.borderColor='';b.style.color=''});}
        else{agForn=f;container.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.borderColor='';b.style.color='';});this.classList.add('active');
          if(col&&!FC_BASE[f]){this.style.background=col;this.style.borderColor=col;this.style.color='#fff';}
          agFilter='all';document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});document.querySelector('.ag-filter-btn[data-filter="all"]').classList.add('active');}
        rBanner();rTable();rForn();
      });
    });
  }
  function switchYear(y){
    activeYear=y;agForn=null;agFilter='all';agQ='';agEditId=null;_editOnceActive=false;
    document.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});
    document.querySelector('.ag-filter-btn[data-filter="all"]').classList.add('active');
    load(y);rYearNav();rReadonlyBanner();rEditOnce();rToolbarState();rFornDatalist();snack('•','exercício '+y);
  }
  function rReadonlyBanner(){
    var banner=document.getElementById('ag-readonly-banner');
    var msg=document.getElementById('ag-readonly-msg');
    if(isReadonly()){var reason=isLocked(activeYear)?'exercício '+activeYear+' fechado — leitura apenas':'a ver exercício '+activeYear+' — leitura apenas';msg.textContent=reason;banner.classList.add('show');}
    else{banner.classList.remove('show');}
  }
  function rToolbarState(){
    var ro=isReadonly();
    var nova=document.getElementById('ag-btn-nova');if(nova)nova.style.display=ro?'none':'';
    var closeWrap=document.getElementById('ag-close-year-wrap');
    var canCloseYear=!isLocked(CURRENT_YEAR)&&activeYear===CURRENT_YEAR&&TODAY>=new Date(CURRENT_YEAR+1,0,1);
    if(closeWrap)closeWrap.className=canCloseYear?'show':'';
  }
  function closeYear(){
    if(isLocked(CURRENT_YEAR))return;
    if(!confirm('Fechar o exercício '+CURRENT_YEAR+'?\n\nÁ partir deste momento não poderá ser editado. Esta ação é irreversível.'))return;
    /* Faz flush imediato para Supabase antes de bloquear */
    _pendingSave = true;
    _flushSave();
    localStorage.setItem(lockedKey(CURRENT_YEAR),'1');
    snack('⊘','exercício '+CURRENT_YEAR+' fechado');
    rYearNav();rReadonlyBanner();rToolbarState();
  }
  var _hv=0;
  function rHero(){
    var pend=0,venc=0,urg=0,fp=0;
    agF.forEach(function(f){var e=est(f);if(e==='pago'||e==='nc')return;var d=dd(f.vencimento);pend+=f.valor;fp++;if(d!==null&&d<0)venc++;else if(d!==null&&d>=0&&d<=DAYS_TO_SUNDAY)urg++;});
    var hv=document.getElementById('ag-hero-value'),hs=document.getElementById('ag-hero-sub');
    var lbl=document.getElementById('ag-hero-label');
    if(lbl)lbl.textContent='total pendente '+activeYear;
    if(hv){animVal(hv,_hv,pend,800);_hv=pend;hv.className=venc>0?'danger':'ok';}
    if(hs){var p=[];if(venc)p.push(venc+' vencida'+(venc>1?'s':''));if(urg)p.push(urg+' esta semana');hs.textContent=p.length?p.join(' · '):'sem alertas urgentes';hs.className=p.length?'alert':'';}
    document.getElementById('ag-hero-stats').innerHTML=[{l:'faturas',v:fp,c:''},{l:'vencidas',v:venc,c:venc>0?'r':''},{l:'esta semana',v:urg,c:urg>0?'a':''}].map(function(s){return'<div class="ag-hs"><span class="ag-hs-l">'+s.l+'</span><span class="ag-hs-v '+s.c+'">'+s.v+'</span></div>';}).join('');
  }
  function rInsights(){
    var el=document.getElementById('ag-insights');if(!el)return;
    var m={},tp=0,vl=[],ul=[];
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]={p:0};var e=est(f);if(e==='pendente'||e==='vencida'){m[f.fornecedor].p+=f.valor;tp+=f.valor;var d=dd(f.vencimento);if(d!==null&&d<0)vl.push(f);else if(d!==null&&d>=0&&d<=DAYS_TO_SUNDAY)ul.push(f);}});
    var ins=[];
    var topF=Object.keys(m).sort(function(a,b){return m[b].p-m[a].p;})[0];
    if(topF&&tp>0){var pct=Math.round(m[topF].p/tp*100);if(pct>40)ins.push({cls:pct>60?'warn':'',text:topF+' concentra '+pct+'% da dívida pendente — '+fmt(m[topF].p)});}
    var smalls=agF.filter(function(f){var e=est(f);return(e==='pendente'||e==='vencida')&&f.valor>0&&f.valor<500;});
    if(smalls.length>=2)ins.push({cls:'ok',text:smalls.length+' faturas <500€ — '+fmt(smalls.reduce(function(s,f){return s+f.valor;},0))+' eliminaria '+smalls.length+' alertas'});
    if(vl.length>0)ins.push({cls:'danger',text:vl.length+' fatura'+(vl.length>1?'s':'')+' vencida'+(vl.length>1?'s':'')+' — '+fmt(vl.reduce(function(s,f){return s+f.valor;},0))+' em risco imediato'});
    el.innerHTML=ins.slice(0,3).map(function(i){return'<div class="ag-insight '+i.cls+'"><span>·</span><span>'+i.text+'</span></div>';}).join('');
  }
  function rSum(){
    var geral=0,pago=0,pend=0,venc=0;
    agF.forEach(function(f){var e=est(f);geral+=f.valor;if(e==='pago'||e==='nc')pago+=f.valor;else{pend+=f.valor;if(e==='vencida')venc+=f.valor;}});
    var cards=[{id:'cg',l:'total '+activeYear,v:geral,cc:'cb',vc:''},{id:'cp',l:'pago',v:pago,cc:'cg',vc:'vg'},{id:'ce',l:'pendente',v:pend,cc:'ca',vc:'va'},{id:'cv',l:'em atraso',v:venc,cc:'cr',vc:venc>0?'vr':''}];
    var el=document.getElementById('ag-summary');
    if(!document.getElementById('cg')){el.innerHTML=cards.map(function(c){return'<div class="ag-card '+c.cc+'" id="'+c.id+'"><div class="ag-card-label">'+c.l+'</div><div class="ag-card-value '+c.vc+'" id="'+c.id+'-v">'+fmt(c.v)+'</div></div>';}).join('');cards.forEach(function(c){_pv[c.id]=c.v;});}
    else{document.getElementById('cg').querySelector('.ag-card-label').textContent='total '+activeYear;cards.forEach(function(c){var ve=document.getElementById(c.id+'-v');if(ve&&_pv[c.id]!==c.v){animVal(ve,_pv[c.id]||0,c.v,480);_pv[c.id]=c.v;}});}
  }
  function rAlerts(){
    var v=[],u=[];
    agF.forEach(function(f){if(f.estado==='pago'||f.estado==='nc')return;var d=dd(f.vencimento);if(d===null)return;if(d<0)v.push(f);else if(d>=0&&d<=DAYS_TO_SUNDAY)u.push(f);});
    var h='';
    if(v.length)h+='<div class="ag-alert ag-av">▲ '+v.length+' fatura'+(v.length>1?'s':'')+' vencida'+(v.length>1?'s':'')+' · '+fmt(v.reduce(function(s,f){return s+f.valor;},0))+'</div>';
    if(u.length)h+='<div class="ag-alert ag-au">● '+u.length+' a vencer esta semana · '+fmt(u.reduce(function(s,f){return s+f.valor;},0))+'</div>';
    document.getElementById('ag-alerts').innerHTML=h;
  }
  function rBadges(){
    var c={};
    agF.forEach(function(f){var e=est(f);if(e==='pendente'||e==='vencida')c[f.fornecedor]=(c[f.fornecedor]||0)+1;});
    Object.keys(c).forEach(function(k){var el=document.getElementById('ag-b-'+k);if(el)el.textContent=c[k]||'';});
    /* zera os que não têm pendentes */
    document.querySelectorAll('.ag-fbadge').forEach(function(el){var k=el.id.replace('ag-b-','');if(!c[k])el.textContent='';});
  }
  var FC_BASE={TAM:'#1565c0',GIT:'#6a1b9a',BESTSELLER:'#880e4f',CHLAMYS:'#2e7d32'};
  var FC_EXTRA=['#00695c','#e65100','#4527a0','#37474f','#558b2f','#6d4c41','#1565c0','#ad1457'];
  var _fcCache={};
  function fornColor(k){
    if(FC_BASE[k])return FC_BASE[k];
    if(_fcCache[k])return _fcCache[k];
    var hash=0;for(var i=0;i<k.length;i++)hash=(hash*31+k.charCodeAt(i))>>>0;
    _fcCache[k]=FC_EXTRA[hash%FC_EXTRA.length];
    return _fcCache[k];
  }

  function rCharts(){
    var m={},total=0;
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]=0;var e=est(f);if(e==='pendente'||e==='vencida'){m[f.fornecedor]+=f.valor;total+=f.valor;}});
    var svg=document.getElementById('ag-donut'),lg=document.getElementById('ag-donut-legend');
    if(svg&&lg){var cx=36,cy=36,r=27,sw=9,ci=2*Math.PI*r,off=0,paths='',lh='';Object.keys(m).filter(function(k){return m[k]>0;}).sort(function(a,b){return m[b]-m[a];}).forEach(function(k){var pct=total>0?m[k]/total:0,dash=ci*pct,gap=ci-dash,rot=-90+off*360,col=fornColor(k);paths+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" transform="rotate('+rot.toFixed(1)+' '+cx+' '+cy+')"/>';lh+='<div class="ag-dl"><div class="ag-dl-dot" style="background:'+col+'"></div><span class="ag-dl-label">'+k+'</span><span class="ag-dl-pct">'+Math.round(pct*100)+'%</span></div>';off+=pct;});svg.innerHTML=paths+'<circle cx="'+cx+'" cy="'+cy+'" r="'+(r-sw/2-1)+'" fill="#fff"/>';lg.innerHTML=lh;}
    var bm={};agF.forEach(function(f){var e=est(f);if(e==='pago'||e==='nc')return;if(!f.vencimento)return;var mon=f.vencimento.slice(0,7);bm[mon]=(bm[mon]||0)+f.valor;});
    var months=Object.keys(bm).sort().slice(-8),maxV=0;months.forEach(function(mon){if(bm[mon]>maxV)maxV=bm[mon];});
    var bc=document.getElementById('ag-bar-chart'),bl=document.getElementById('ag-bar-labels');
    if(bc&&bl){var tm=TODAY.toISOString().slice(0,7);bc.innerHTML=months.map(function(mon){var v=bm[mon],h=Math.max(3,Math.round((v/maxV)*46)),isT=mon===tm,col=isT?'#e65100':'#000';return'<div class="ag-bar" style="height:'+h+'px;background:'+col+';opacity:'+(isT?'1':'.35')+'"><div class="ag-bar-tip">'+fmtK(v)+'€</div></div>';}).join('');bl.innerHTML=months.map(function(mon){return'<div class="ag-bar-label">'+mon.slice(5)+'</div>';}).join('');}
  }
  function rBanner(){
    var ban=document.getElementById('ag-forn-banner');
    if(!agForn){ban.classList.remove('show');return;}
    var all=agF.filter(function(f){return f.fornecedor===agForn;});
    var pend=all.filter(function(f){var e=est(f);return e==='pendente'||e==='vencida';});
    var venc=pend.filter(function(f){return est(f)==='vencida';});
    var fnm=document.getElementById('ag-fb-name');fnm.textContent=agForn;fnm.style.color=fornColor(agForn)||'#000';
    var tp=pend.reduce(function(s,f){return s+f.valor;},0),tv=venc.reduce(function(s,f){return s+f.valor;},0);
    document.getElementById('ag-fb-stats').innerHTML=[{l:'pendente',v:fmt(tp),c:tp>0?'a':''},{l:'vencido',v:fmt(tv),c:tv>0?'r':''},{l:'faturas',v:pend.length,c:''}].map(function(s){return'<div class="ag-fbs"><span class="ag-fbs-l">'+s.l+'</span><span class="ag-fbs-v '+s.c+'">'+s.v+'</span></div>';}).join('');
    ban.classList.add('show');
  }
  function bRow(f,delay,seq){
    var e=est(f),d=dd(f.vencimento),tc=e==='vencida'?'ag-tr-v':e==='pago'||e==='nc'?'ag-tr-p':'';
    var ds=delay?(' style="animation-delay:'+delay+'ms"'):'';
    var dh='—';
    if(f.estado!=='pago'&&f.estado!=='nc'&&d!==null){var dc=d<0?'ag-du':d<=DAYS_TO_SUNDAY?'ag-dp':'ag-do',dl=d<0?Math.abs(d)+'d atraso':d===0?'hoje':d+'d';dh='<span class="ag-dias '+dc+'">'+dl+'</span>';}
    else if(f.estado==='pago'||f.estado==='nc')dh='<span class="ag-dias ag-dd">—</span>';
    var em={pago:'<span class="ag-est ag-est-p">✓ pago</span>',pendente:'<span class="ag-est ag-est-e">● pendente</span>',vencida:'<span class="ag-est ag-est-v">▲ vencida</span>',nc:'<span class="ag-est ag-est-n">NC</span>'};
    var vc='ag-tdr'+(f.valor<0?' ag-neg':'');
    var ro=isReadonly();
    var actions=ro?'<button class="ag-ib ag-tp" data-id="'+f.id+'">'+(e==='pago'||e==='nc'?'↩':'✓')+'</button>':'<button class="ag-ib ag-tp" data-id="'+f.id+'">'+(e==='pago'||e==='nc'?'↩':'✓')+'</button> <button class="ag-ib ag-ed" data-id="'+f.id+'">✎</button> <button class="ag-ib ag-del" data-id="'+f.id+'">×</button>';
    var chipStyle=FC_BASE[f.fornecedor]?'':'style="background:'+fornColor(f.fornecedor)+'22;color:'+fornColor(f.fornecedor)+'"';
    return'<tr class="'+tc+'" data-id="'+f.id+'"'+ds+'><td class="ag-thc ag-tdn">'+(seq!==undefined?seq:f.id)+'</td><td><span class="ag-chip ag-chip-'+f.fornecedor+'" '+chipStyle+'>'+f.fornecedor+'</span></td><td class="ag-fw-bold">'+f.factura+'</td><td class="'+vc+'">'+fmt(f.valor)+'</td><td>'+fd(f.data)+'</td><td class="ag-fw-bold">'+fd(f.vencimento)+'</td><td class="ag-thc">'+dh+'</td><td class="ag-thc">'+(em[e]||'')+'</td><td class="ag-thc">'+actions+'</td></tr>';
  }
  function secRow(lbl,cls){return'<tr class="ag-sec-tr '+cls+'"><td colspan="9">'+lbl+'</td></tr>';}
  function subRow(n,t){return'<tr class="ag-sub-tr"><td colspan="5"></td><td colspan="3" class="ag-sub-right">'+n+' fatura'+(n>1?'s':'')+' · '+fmt(t)+'</td><td></td></tr>';}
  function getF(){
    return agF.filter(function(f){
      if(agForn&&f.fornecedor!==agForn)return false;
      var q=agQ.toLowerCase();if(q&&f.factura.toLowerCase().indexOf(q)<0&&f.fornecedor.toLowerCase().indexOf(q)<0)return false;
      if(agFilter==='all')return true;var e=est(f);
      if(agFilter==='vencida')return e==='vencida';
      if(agFilter==='pendente')return e==='pendente'||e==='vencida';
      if(agFilter==='pago')return e==='pago'||e==='nc';
      return true;
    });
  }
  function getS(list){
    return list.slice().sort(function(a,b){
      var va,vb;
      if(agSort.col==='valor'){va=a.valor;vb=b.valor;}
      else if(agSort.col==='data'||agSort.col==='vencimento'){va=a[agSort.col]||'';vb=b[agSort.col]||'';}
      else if(agSort.col==='fornecedor'){va=a.fornecedor;vb=b.fornecedor;}
      else if(agSort.col==='factura'){va=a.factura;vb=b.factura;}
      else{va=a.id;vb=b.id;}
      var r=va<vb?-1:va>vb?1:0;return agSort.dir==='asc'?r:-r;
    });
  }
  function rTable(){
    var tb=document.getElementById('ag-tbody'),em=document.getElementById('ag-empty');
    if(agForn){
      var all=agF.filter(function(f){return f.fornecedor===agForn;});
      var q=agQ.toLowerCase();if(q)all=all.filter(function(f){return f.factura.toLowerCase().indexOf(q)>=0;});
      var pend=all.filter(function(f){return f.estado!=='pago'&&f.estado!=='nc';});
      pend.sort(function(a,b){var da=a.vencimento||'9999',db=b.vencimento||'9999';return da<db?-1:da>db?1:0;});
      var v=[],u=[],x=[],dist=[];
      pend.forEach(function(f){var d=dd(f.vencimento);if(d===null||d<0)v.push(f);else if(d>=0&&d<=DAYS_TO_SUNDAY)u.push(f);else if(d<=30)x.push(f);else dist.push(f);});
      if(!pend.length){tb.innerHTML='';em.style.display='block';em.textContent='sem faturas pendentes · '+agForn;return;}
      em.style.display='none';var rows=[],delay=0,seq=0;
      function addSec(list,lbl,cls){if(!list.length)return;var t=list.reduce(function(s,f){return s+f.valor;},0);rows.push(secRow(lbl+' — '+list.length+' fatura'+(list.length>1?'s':''),cls));list.forEach(function(f){seq++;rows.push(bRow(f,delay,seq));delay+=32;});rows.push(subRow(list.length,t));}
      addSec(v,'▲ vencidas','ag-sec-v');addSec(u,'● esta semana','ag-sec-u');addSec(x,'● próximas 30 dias','ag-sec-x');addSec(dist,'○ mais distantes','ag-sec-d');
      tb.innerHTML=rows.join('');return;
    }
    var list=getS(getF());
    if(!list.length){tb.innerHTML='';em.style.display='block';em.textContent='nenhuma fatura encontrada';return;}
    em.style.display='none';
    tb.innerHTML=list.map(function(f,i){return bRow(f,i*24,i+1);}).join('');
    document.querySelectorAll('#ag-table thead th[data-sort]').forEach(function(th){th.classList.remove('ag-sa','ag-sd');if(th.dataset.sort===agSort.col)th.classList.add(agSort.dir==='asc'?'ag-sa':'ag-sd');});
  }
  function rForn(){
    var m={};
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]={p:0,e:0,t:0,n:0};var e=est(f);m[f.fornecedor].t+=f.valor;m[f.fornecedor].n++;if(e==='pago'||e==='nc')m[f.fornecedor].p+=f.valor;else m[f.fornecedor].e+=f.valor;});
    var container=document.getElementById('ag-by-forn');
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(m).filter(function(k){return known.indexOf(k)<0;}).sort();
    var allKeys=known.filter(function(k){return m[k];}).concat(others.filter(function(k){return m[k];}));
    var keys=agForn?[agForn]:allKeys;
    /* ajusta grid ao número de fornecedores */
    var cols=Math.min(keys.length,4);
    container.style.gridTemplateColumns=agForn?'1fr':'repeat('+cols+',1fr)';
    container.className=agForn?'solo':'';
    container.innerHTML=keys.map(function(k){
      var d=m[k]||{p:0,e:0,t:0,n:0};
      var col=fornColor(k);
      var hdrStyle='style="color:'+col+';background:'+col+'18;border-left:4px solid '+col+'"';
      return'<div class="ag-fb-block" style="--forn-col:'+col+'"><div class="ag-fb-hdr" '+hdrStyle+'><span>'+k+'</span><span class="ag-fw-bold">'+d.n+' fat.</span></div><div class="ag-fb-row"><span class="ag-fb-rl">pago</span><span class="ag-fb-rv g">'+fmt(d.p)+'</span></div><div class="ag-fb-row"><span class="ag-fb-rl">pendente</span><span class="ag-fb-rv'+(d.e>0?' r':'')+'">'+fmt(d.e)+'</span></div><div class="ag-fb-row ag-fb-divider"><span class="ag-fb-rl">total</span><span class="ag-fb-rv">'+fmt(d.t)+'</span></div></div>';
    }).join('');
  }
  function rAll(){rHero();rSum();rAlerts();rInsights();rFornBtns();rBadges();rBanner();rCharts();rTable();rForn();}

  function parseVal(s){
    /* Aceita: 3.609,19 / 3609,19 / 3609.19 / 3.609.19 */
    var str = s.trim().replace(/[€\s]/g,'');
    /* Se tem vírgula como decimal (formato PT): remove pontos de milhar, troca vírgula por ponto */
    if(/,\d{1,2}$/.test(str)){
      str = str.replace(/\./g,'').replace(',','.');
    } else {
      /* Remove pontos de milhar (ex: 3.609) */
      str = str.replace(/\.(?=\d{3})/g,'');
    }
    return parseFloat(str);
  }
  function rFornDatalist(){
    /* Recolhe fornecedores de todos os anos guardados em localStorage */
    var all={};
    ALL_YEARS.forEach(function(y){
      try{
        var cached=localStorage.getItem(dataKey(y));
        if(cached){JSON.parse(cached).forEach(function(f){if(f.fornecedor)all[f.fornecedor]=true;});}
      }catch(e){}
    });
    /* Inclui também os do ano ativo em memória */
    agF.forEach(function(f){if(f.fornecedor)all[f.fornecedor]=true;});
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(all).filter(function(k){return known.indexOf(k)<0;}).sort();
    var dl=document.getElementById('ag-forn-list');
    if(dl)dl.innerHTML=known.concat(others).map(function(k){return'<option value="'+k+'">';}).join('');
  }
  function openM(id){
    if(isReadonly()){snack('⊘','exercício fechado — leitura apenas');return;}
    agEditId=id||null;
    document.getElementById('ag-mt').textContent=id?'editar fatura':'nova fatura';
    if(id){var f=agF.find(function(x){return x.id===id;});if(!f)return;document.getElementById('ag-f-forn').value=f.fornecedor;document.getElementById('ag-f-fat').value=f.factura;
      /* Mostra o valor formatado PT ao editar */
      document.getElementById('ag-f-val').value=new Intl.NumberFormat('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(f.valor);
      document.getElementById('ag-f-est').value=f.estado;document.getElementById('ag-f-dat').value=f.data||'';document.getElementById('ag-f-vec').value=f.vencimento||'';}
    else{document.getElementById('ag-f-forn').value=agForn||'';document.getElementById('ag-f-fat').value='';document.getElementById('ag-f-val').value='';document.getElementById('ag-f-est').value='pendente';document.getElementById('ag-f-dat').value=activeYear+'-'+(('0'+(TODAY.getMonth()+1)).slice(-2))+'-'+(('0'+TODAY.getDate()).slice(-2));document.getElementById('ag-f-vec').value='';}
    rFornDatalist();
    document.getElementById('ag-mo').classList.add('open');
    setTimeout(function(){document.getElementById('ag-f-fat').focus();},50);
  }
  function closeM(){document.getElementById('ag-mo').classList.remove('open');agEditId=null;}
  function saveM(){
    if(isReadonly())return;
    var fat=document.getElementById('ag-f-fat').value.trim(),val=parseVal(document.getElementById('ag-f-val').value),forn=document.getElementById('ag-f-forn').value.trim(),estado=document.getElementById('ag-f-est').value,dat=document.getElementById('ag-f-dat').value,vec=document.getElementById('ag-f-vec').value;
    if(!fat){document.getElementById('ag-f-fat').focus();return;}
    if(isNaN(val)||val===0){document.getElementById('ag-f-val').focus();snack('⚠','valor inválido');return;}
    if(agEditId){var i=agF.findIndex(function(x){return x.id===agEditId;});if(i>=0)agF[i]={id:agEditId,fornecedor:forn,factura:fat,valor:val,estado:estado,data:dat,vencimento:vec};}
    else agF.push({id:nid(),fornecedor:forn,factura:fat,valor:val,estado:estado,data:dat,vencimento:vec});
    save();closeM();rAll();snack('✓','fatura guardada');
  }
  function animPaid(id){
    var tr=document.querySelector('#ag-tbody tr[data-id="'+id+'"]');
    if(tr){tr.classList.add('ag-tr-paying');setTimeout(function(){rAll();snack('✓','marcada como paga');},500);}
    else{rAll();snack('✓','marcada como paga');}
  }

  document.getElementById('ag-btn-nova').addEventListener('click',function(e){rpl(this,e);openM(null);});
  document.getElementById('ag-mo').addEventListener('click',function(e){if(e.target===this)closeM();});
  document.getElementById('ag-mc').addEventListener('click',closeM);
  document.getElementById('ag-ms').addEventListener('click',function(e){rpl(this,e);saveM();});
  document.getElementById('ag-btn-close-year').addEventListener('click',closeYear);
  document.getElementById('ag-btn-edit-once').addEventListener('click',function(){_editOnceActive=true;rEditOnce();rReadonlyBanner();rToolbarState();snack('✎','modo edição ativo — pode editar este exercício');});
  document.getElementById('ag-btn-confirm-once').addEventListener('click',function(){
    if(!confirm('Confirmar e encerrar a edição do exercício '+activeYear+'?\n\nA edição única ficará bloqueada depois desta ação.'))return;
    _editOnceActive=false;localStorage.setItem(editOnceKey(activeYear),'1');rEditOnce();rReadonlyBanner();rToolbarState();save();snack('✓','edição confirmada e bloqueada');
  });
  document.addEventListener('keydown',function(e){
    var ov=document.getElementById('agenda-overlay');if(!ov||!ov.classList.contains('open'))return;
    if(e.key==='Escape'){var mo=document.getElementById('ag-mo');if(mo&&mo.classList.contains('open'))closeM();else window.closeAgendaOverlay();}
    if(e.key==='Enter'&&document.getElementById('ag-mo').classList.contains('open'))saveM();
    if(e.key==='n'&&!document.getElementById('ag-mo').classList.contains('open')&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='SELECT'){e.preventDefault();openM(null);}
  });
  document.querySelectorAll('.ag-filter-btn').forEach(function(btn){
    btn.addEventListener('click',function(){agFilter=this.dataset.filter;agForn=null;document.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');});document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});this.classList.add('active');if(agFilter==='pendente'){agSort.col='vencimento';agSort.dir='asc';}rBanner();rTable();rForn();});
  });
  document.querySelectorAll('#ag-table thead th[data-sort]').forEach(function(th){
    th.addEventListener('click',function(){var c=this.dataset.sort;agSort.dir=agSort.col===c?(agSort.dir==='asc'?'desc':'asc'):'asc';agSort.col=c;rTable();});
  });
  document.getElementById('ag-tbody').addEventListener('click',function(e){
    var btn=e.target.closest('button');if(!btn)return;
    var id=parseInt(btn.dataset.id,10);
    if(btn.classList.contains('ag-ed')){openM(id);}
    if(btn.classList.contains('ag-del')){if(isReadonly())return;if(confirm('Eliminar esta fatura?')){agF=agF.filter(function(f){return f.id!==id;});save();rAll();snack('×','fatura eliminada');}}
    if(btn.classList.contains('ag-tp')){var f=agF.find(function(x){return x.id===id;});if(f){var ev=est(f);f.estado=(ev==='pago'||ev==='nc')?'pendente':'pago';save();if(f.estado==='pago')animPaid(id);else{rAll();snack('↩','marcada como pendente');}}}
  });

  /* ── Blindaje de fecha ──────────────────────────────────────────
     Evita que TODAY quede congelado en el día de la primera carga.
     agBindLogic() solo corre una vez (guard _agHtmlInjected), por lo
     que TODAY debe recalcularse activamente. Esta función reasigna las
     variables de fecha del scope (TODAY, DAYS_TO_SUNDAY), refresca el
     encabezado y re-renderiza. Es no-op si el día real no cambió, así
     que invocarla repetidamente no tiene coste de render. */
  function agRefreshDate(force){
    var now=new Date();now.setHours(0,0,0,0);
    if(!force&&now.getTime()===TODAY.getTime())return;
    TODAY=now;
    DAYS_TO_SUNDAY=(7-TODAY.getDay())%7;
    var te=document.getElementById('ag-today');
    if(te)te.textContent=TODAY.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toLowerCase();
    rAll();
  }
  _agRefreshDate=agRefreshDate;
  /* (1) Reapertura del módulo → openAgendaOverlay() llama a _agRefreshDate. */
  /* (2) Pestaña/ventana que recupera el foco. */
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState!=='visible')return;
    var ov=document.getElementById('agenda-overlay');
    if(ov&&ov.classList.contains('open'))agRefreshDate();
  });
  window.addEventListener('focus',function(){
    var ov=document.getElementById('agenda-overlay');
    if(ov&&ov.classList.contains('open'))agRefreshDate();
  });
  /* (3) Vigía de medianoche: cubre el caso de la pestaña abierta y
     enfocada cruzando las 00:00 sin interacción. Comprueba cada 30 s;
     solo re-renderiza el día en que detecta el cambio. */
  setInterval(function(){
    var ov=document.getElementById('agenda-overlay');
    if(ov&&ov.classList.contains('open'))agRefreshDate();
  },30000);

  load(activeYear);
  setTimeout(function(){
    rYearNav();rReadonlyBanner();rEditOnce();rToolbarState();
    document.getElementById('ag-today').textContent=TODAY.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toLowerCase();
  },0);
}

})();

// ══════════════════════════════════════════════════════════════
//  (bloco RÓTULOS — IIFE própria, ver nota no cabeçalho do ficheiro)
// ══════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════
   RÓTULOS — módulo completo  v2
   · Bug fix: shipments ya no se borran al abrir
   · Supabase sync (tabla rotulos_data: id text PK, payload jsonb)
   · Campo de fecha en "gerar rótulos" (por defecto hoy)
   · Modal "registar envio passado" en controlo de entregas
══════════════════════════════════════════════════════ */

(function () {
'use strict';

var RT_HTML = `
<div id="rt-app">
  <div id="rt-hd">
    <div id="rt-hd-title">wakzome rótulos <span id="rt-sync-dot" title="estado sync"></span></div>
    <div id="rt-hd-date"></div>
  </div>
  <div id="rt-sum-section">
    <div class="rt-slabel">resumo do ano</div>
    <div id="rt-sum-inner">
      <div id="rt-sum-wrap" class="rt-flex1-noshrink">
        <table id="rt-sum-table">
          <thead><tr>
            <th class="rt-th-left">data</th>
            <th class="rt-col-fnc">fnc</th><th class="rt-col-pxo">pxo</th>
            <th>mf</th><th>ma</th><th>mm</th><th>sh</th><th>mx</th>
          </tr></thead>
          <tbody id="rt-sum-body"><tr><td colspan="8" class="rt-empty-row">sem envios registados este ano</td></tr></tbody>
          <tfoot id="rt-sum-foot"></tfoot>
        </table>
      </div>
      <div id="rt-sum-pending">
        <div class="rt-pend-card fnc">
          <div class="rt-pend-lbl">fnc — por entregar</div>
          <div class="rt-pend-val" id="rt-pend-fnc-val">0</div>
          <div class="rt-pend-sub">caixas pendentes</div>
        </div>
        <div class="rt-pend-card pxo">
          <div class="rt-pend-lbl">pxo — por entregar</div>
          <div class="rt-pend-val" id="rt-pend-pxo-val">0</div>
          <div class="rt-pend-sub">caixas pendentes</div>
        </div>
      </div>
    </div>
  </div>
  <div id="rt-tabs">
    <button class="rt-tab-btn active" onclick="rtSwitchTab('gen',this)">gerar rótulos</button>
    <button class="rt-tab-btn" onclick="rtSwitchTab('ctrl',this)">controlo de entregas</button>
  </div>
  <div class="rt-tab-panel active" id="rt-tab-gen">
    <div id="rt-gen-layout">
      <div>
        <div class="rt-card">
          <div class="rt-card-title">configurar envio</div>
          <!-- DATE PICKER -->
          <div class="rt-date-row">
            <span class="rt-date-lbl">data</span>
            <input type="date" class="rt-date-inp" id="rt-gen-date" />
            <span class="rt-past-badge" id="rt-past-badge">data passada</span>
          </div>
          <div class="rt-dest-sec">
            <div class="rt-dest-lbl"><span class="rt-ddot"></span>funchal</div>
            <div id="rt-stores-f"></div>
            <button class="rt-add-st-btn" onclick="rtOpenAdd('f')">+ adicionar loja funchal</button>
          </div>
          <div class="rt-divider"></div>
          <div class="rt-dest-sec">
            <div class="rt-dest-lbl"><span class="rt-ddot"></span>porto santo</div>
            <div id="rt-stores-p"></div>
            <button class="rt-add-st-btn" onclick="rtOpenAdd('p')">+ adicionar loja porto santo</button>
          </div>
          <div class="rt-divider"></div>
          <button class="rt-btn-prim" onclick="rtGenerate()">gerar rótulos</button>
        </div>
        <div class="rt-card rt-card-top">
          <div class="rt-card-title rt-card-title-sep">acumulado por loja</div>
          <div id="rt-acc-info"></div>
        </div>
      </div>
      <div>
        <div id="rt-prev-empty">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <span class="rt-muted">configure o envio e clique em "gerar rótulos"</span>
        </div>
        <div id="rt-prev-panel" style="display:none">
          <div class="rt-prev-hd">
            <h3 id="rt-prev-title">rótulos</h3>
            <div class="rt-prev-actions">
              <button class="rt-btn-sm" onclick="rtOpenPrintModal()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                imprimir / pdf
              </button>
              <button class="rt-btn-sm bk" onclick="rtSaveShipment()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                guardar envio
              </button>
            </div>
          </div>
          <div class="rt-lbl-grid" id="rt-lbl-grid"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="rt-tab-panel" id="rt-tab-ctrl">
    <div class="rt-filters">
      <span class="rt-fl">filtrar:</span>
      <button class="rt-fb active" onclick="rtFCtrl('all',this)">todos</button>
      <button class="rt-fb" onclick="rtFCtrl('pending',this)">com pendentes</button>
      <button class="rt-fb" onclick="rtFCtrl('done',this)">completos</button>
      <button class="rt-fb" onclick="rtFCtrl('f',this)">funchal</button>
      <button class="rt-fb" onclick="rtFCtrl('p',this)">porto santo</button>
      <button class="rt-btn-hist" onclick="rtOpenHistModal()">+ registar envio passado</button>
    </div>
    <div class="rt-sl" id="rt-sl"></div>
  </div>
</div>
<div id="rt-modal-print">
  <div class="rt-mp-box">
    <div class="rt-mp-hd">
      <h2 id="rt-mp-title">prévia de impressão</h2>
      <div class="rt-mp-actions">
        <button class="rt-btn-sm" onclick="rtDoPrint()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          imprimir
        </button>
        <button class="rt-btn-sm" onclick="rtExportPDF()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          exportar pdf
        </button>
        <button class="rt-btn-sm" onclick="rtSendEmail()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          enviar email
        </button>
        <button class="rt-mp-close" onclick="rtClosePrintModal()">✕</button>
      </div>
    </div>
    <div class="rt-mp-body" id="rt-mp-body"></div>
  </div>
</div>
<!-- New store modal -->
<div class="rt-mm" id="rt-mm-add">
  <div class="rt-mm-b">
    <h3>nova loja</h3>
    <div class="rt-fld"><label>nome da loja</label><input id="rt-ns-nm" placeholder="ex: mezka forum" /></div>
    <div class="rt-fld"><label>código (ex: M, SH, MX)</label><input id="rt-ns-cd" placeholder="M" maxlength="4" class="rt-uppercase" /></div>
    <div class="rt-fld"><label>abreviatura rótulo (ex: FCN)</label><input id="rt-ns-ab" placeholder="FCN" maxlength="5" class="rt-uppercase" /></div>
    <div class="rt-fld"><label>morada</label><input id="rt-ns-ad" placeholder="Rua..." /></div>
    <div class="rt-fld"><label>código postal + cidade</label><input id="rt-ns-cp" placeholder="9400-168 Porto Santo" /></div>
    <input type="hidden" id="rt-ns-dt" value="f" />
    <div class="rt-mm-act">
      <button class="rt-btn-cnc" onclick="rtCloseAdd()">cancelar</button>
      <button class="rt-btn-cnf" onclick="rtConfirmAdd()">adicionar</button>
    </div>
  </div>
</div>
<!-- Historical shipment modal -->
<div id="rt-hist-modal">
  <div id="rt-hist-box">
    <h3>registar envio passado</h3>
    <p class="rt-hist-sub">introduza a data e as quantidades enviadas. o acumulador será actualizado.</p>
    <div class="rt-hist-date-row">
      <label>data do envio</label>
      <input type="date" id="rt-hist-date" />
    </div>
    <div class="rt-hist-sec-lbl"><span class="rt-ddot"></span>funchal</div>
    <div class="rt-hist-stores" id="rt-hist-stores-f"></div>
    <div class="rt-hist-sec-lbl rt-mt10"><span class="rt-ddot"></span>porto santo</div>
    <div class="rt-hist-stores" id="rt-hist-stores-p"></div>
    <div class="rt-hist-act">
      <button class="rt-btn-cnc rt-flex1" onclick="rtCloseHistModal()">cancelar</button>
      <button class="rt-btn-cnf rt-flex1" onclick="rtConfirmHist()">registar</button>
    </div>
  </div>
</div>
<div class="rt-toast" id="rt-toast"></div>
<div id="rt-print-area"></div>
<!-- Delete confirmation modal -->
<div id="rt-del-modal">
  <div id="rt-del-box">
    <h3>eliminar envio</h3>
    <p id="rt-del-msg">tem a certeza que quer eliminar este envio? esta acção não pode ser desfeita.</p>
    <div class="rt-del-act">
      <button class="rt-btn-cnc rt-flex1" onclick="rtCloseDelModal()">cancelar</button>
      <button class="rt-del-confirm" id="rt-del-ok">eliminar</button>
    </div>
  </div>
</div>
`;

var _rtHtmlInjected = false;
function rtInjectHtml() {
  if (_rtHtmlInjected) return;
  _rtHtmlInjected = true;
  var root = document.getElementById('rt-root');
  if (root) root.innerHTML = RT_HTML;
  rtBindLogic();
}

window.openRotulosOverlay = function () {
  var ov = document.getElementById('rotulos-overlay');
  if (!ov) return;
  ov.classList.add('open');
  requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('visible'); }); });
  rtInjectHtml();
};

window.closeRotulosOverlay = function () {
  var ov = document.getElementById('rotulos-overlay');
  if (!ov) return;
  ov.classList.remove('visible');
  setTimeout(function () { ov.classList.remove('open'); }, 600);
};

function rtBindLogic() {
  var YEAR    = new Date().getFullYear();
  var SK      = 'wkz_rt_' + YEAR;
  var BASE_IDS = ['fcn','av','mc','sh','mx'];

  var DEFAULT_STORES = {
    f: [{id:'fcn',name:'MEZKA FUNCHAL',code:'M',abr:'FCN',addr:'R. DE S. FRANCISCO 20 - ARCADAS S. FRANCISCO LJ.5',cp:'9000-150 Funchal',dest:'f'}],
    p: [
      {id:'av',name:'MEZKA AVENIDA',code:'M',abr:'AV',addr:'EDIFÍCIO ILHA DOURADA',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'mc',name:'MEZKA MERCADO',code:'M',abr:'MC',addr:'PRAÇA DO BARQUEIRO',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'sh',name:'SHANA',code:'SH',abr:'SH',addr:'R. DR. MANUEL GREGÓRIO P. JUNIOR',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'mx',name:'MAXX',code:'MX',abr:'MX',addr:'RUA BARTOLOMEU PERESTRELO',cp:'9400-168 Porto Santo',dest:'p'}
    ]
  };

  /* ── Helpers ── */
  function rtSB() { return (typeof sbAdmin !== 'undefined') ? sbAdmin : null; }

  function setSyncDot(state) {
    var d = document.getElementById('rt-sync-dot');
    if (!d) return;
    d.className = state; // '', 'syncing', 'ok'
  }

  function mergeStores(saved) {
    var stores = JSON.parse(JSON.stringify(DEFAULT_STORES));
    ['f','p'].forEach(function(dest) {
      var customs = ((saved.stores||{})[dest]||[]).filter(function(s){ return BASE_IDS.indexOf(s.id)===-1; });
      stores[dest] = stores[dest].concat(customs);
    });
    return stores;
  }

  /* ── loadData: Supabase first, fallback localStorage ── */
  function loadDataLocal() {
    var stores = JSON.parse(JSON.stringify(DEFAULT_STORES));
    try {
      var raw = localStorage.getItem(SK);
      if (raw) {
        var saved = JSON.parse(raw);
        stores = mergeStores(saved);
        return { stores: stores, shipments: saved.shipments||[], acc: saved.acc||{} };
      }
    } catch(e) {}
    return { stores: stores, shipments: [], acc: {} };
  }

  /* ── saveData: localStorage + Supabase async ── */
  function saveData() {
    localStorage.setItem(SK, JSON.stringify(D));
    var sb = rtSB();
    if (!sb) return;
    setSyncDot('syncing');
    sb.from('rotulos_data')
      .upsert({ id: SK, payload: D }, { onConflict: 'id' })
      .then(function(res) {
        setSyncDot(res.error ? '' : 'ok');
        if (res.error) console.warn('RT Supabase save error', res.error);
        setTimeout(function(){ setSyncDot(''); }, 2000);
      });
  }

  /* ── Initial load: try Supabase, fall back to localStorage ── */
  var D = loadDataLocal();
  /* NOTE: bug fix — removed the lines that wiped D.shipments and D.acc on every open */

  var sb = rtSB();
  if (sb) {
    setSyncDot('syncing');
    sb.from('rotulos_data').select('payload').eq('id', SK).single()
      .then(function(res) {
        setSyncDot('');
        if (!res.error && res.data && res.data.payload) {
          var saved = res.data.payload;
          D.stores    = mergeStores(saved);
          D.shipments = saved.shipments || [];
          D.acc       = saved.acc || {};
          localStorage.setItem(SK, JSON.stringify(D)); // keep local in sync
          rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
          rtToast('sincronizado ✓', 'ok');
        }
      })
      .catch(function(e) { setSyncDot(''); console.warn('RT Supabase load error', e); });
  }

  var CL     = [];
  var CF     = 'all';
  var PITEMS = [];

  /* ── Active date for "gerar" tab ── */
  var ACTIVE_DATE = new Date();

  function allS(){ return [].concat(D.stores.f||[], D.stores.p||[]); }

  /* Set up date picker default = today */
  (function initDatePicker(){
    var inp = document.getElementById('rt-gen-date');
    if (!inp) return;
    var t = new Date();
    inp.value = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    inp.addEventListener('change', function(){
      if (!inp.value) { ACTIVE_DATE = new Date(); return; }
      var parts = inp.value.split('-');
      ACTIVE_DATE = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      var today = new Date(); today.setHours(0,0,0,0);
      var ad = new Date(ACTIVE_DATE); ad.setHours(0,0,0,0);
      var badge = document.getElementById('rt-past-badge');
      if (badge) badge.classList.toggle('show', ad < today);
    });
  })();

  document.getElementById('rt-hd-date').textContent = new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toLowerCase();

  window.rtSwitchTab = function(n, btn){
    document.querySelectorAll('.rt-tab-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.rt-tab-panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('rt-tab-'+n).classList.add('active');
    if (n==='ctrl') rtRCtrl();
  };

  function rtRStores(){ rtRSec('f','rt-stores-f'); rtRSec('p','rt-stores-p'); }
  function rtRSec(dest, cid){
    var el = document.getElementById(cid); el.innerHTML='';
    (D.stores[dest]||[]).forEach(function(s){
      var row = document.createElement('div'); row.className='rt-store-row';
      row.innerHTML='<label>'+s.name+'</label><span class="rt-acc-n">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span><input class="rt-qty-inp" type="number" min="0" id="rtq_'+s.id+'" />';
      el.appendChild(row);
    });
  }
  function rtRAcc(){
    document.getElementById('rt-acc-info').innerHTML = allS().map(function(s){
      return '<div class="rt-acc-row"><span>'+s.name+'</span><span class="rt-acc-val">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span></div>';
    }).join('');
  }

  window.rtOpenAdd = function(dest){
    ['rt-ns-nm','rt-ns-cd','rt-ns-ab','rt-ns-ad','rt-ns-cp'].forEach(function(i){ document.getElementById(i).value=''; });
    document.getElementById('rt-ns-dt').value=dest;
    document.getElementById('rt-mm-add').classList.add('open');
    setTimeout(function(){ document.getElementById('rt-ns-nm').focus(); }, 50);
  };
  window.rtCloseAdd = function(){ document.getElementById('rt-mm-add').classList.remove('open'); };
  window.rtConfirmAdd = function(){
    var nm=document.getElementById('rt-ns-nm').value.trim().toUpperCase();
    var cd=document.getElementById('rt-ns-cd').value.trim().toUpperCase();
    var ab=document.getElementById('rt-ns-ab').value.trim().toUpperCase();
    var ad=document.getElementById('rt-ns-ad').value.trim().toUpperCase();
    var cp=document.getElementById('rt-ns-cp').value.trim().toUpperCase();
    var dt=document.getElementById('rt-ns-dt').value;
    if(!nm||!ab){ rtToast('preencha nome e abreviatura'); return; }
    var id=ab.toLowerCase()+'_'+Date.now();
    if(!D.stores[dt]) D.stores[dt]=[];
    D.stores[dt].push({id:id,name:nm,code:cd||ab,abr:ab,addr:ad,cp:cp,dest:dt});
    saveData(); rtCloseAdd(); rtRStores(); rtRAcc(); rtRSum();
    rtToast('loja "'+nm+'" adicionada','ok');
  };

  /* ── mkCode: accepts optional dateObj, defaults to ACTIVE_DATE ── */
  function mkCode(s, accBox, boxNum, total, extraN, dateObj){
    var d   = dateObj || ACTIVE_DATE;
    var dd  = String(d.getDate()).padStart(2,'0');
    var mm  = String(d.getMonth()+1).padStart(2,'0');
    var yy  = String(d.getFullYear()).slice(-2);
    var base = dd+mm+'LJ-'+s.code+'-'+s.abr+'-'+yy+'/'+String(accBox).padStart(4,'0')+'*** '+boxNum+'-'+total+' CX';
    if(extraN) base+=' (EXTRA '+extraN+')';
    return base;
  }

  function dateToStr(d){ return d.toLocaleDateString('pt-PT'); }

  function hasDateShipment(sid, dateStr){
    return D.shipments.some(function(sh){ return sh.date===dateStr && sh.boxes.some(function(b){ return b.storeId===sid && !b.isExtra; }); });
  }
  function extraCountForDate(sid, dateStr){
    var n=0;
    D.shipments.forEach(function(sh){ if(sh.date===dateStr) sh.boxes.forEach(function(b){ if(b.storeId===sid&&b.isExtra) n++; }); });
    return n;
  }

  window.rtGenerate = function(){
    var items = [];
    var ds = dateToStr(ACTIVE_DATE);
    allS().forEach(function(s){
      var el  = document.getElementById('rtq_'+s.id);
      var qty = parseInt(el && el.value) || 0;
      if(qty > 0){
        var acc  = D.acc[s.id] || 0;
        var isX  = hasDateShipment(s.id, ds);
        var xBase= extraCountForDate(s.id, ds);
        for(var i=1;i<=qty;i++) items.push({s:s, boxNum:i, total:qty, accBox:acc+i, isExtra:isX, extraN:isX?(xBase+i):0});
      }
    });
    if(!items.length){ rtToast('introduza quantidades para pelo menos uma loja'); return; }
    CL=items; rtRPreview(items);
  };

  function rtRPreview(items){
    document.getElementById('rt-prev-empty').style.display='none';
    document.getElementById('rt-prev-panel').style.display='block';
    document.getElementById('rt-prev-title').textContent=items.length+' rótulo'+(items.length>1?'s':'')+' gerado'+(items.length>1?'s':'');
    var g=document.getElementById('rt-lbl-grid'); g.innerHTML='';
    items.forEach(function(it){
      var code=mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0);
      var d=document.createElement('div'); d.className='rt-lp';
      d.innerHTML='<div class="rt-lp-send">WAKZOME</div><div class="rt-lp-st">'+it.s.name+'</div><div class="rt-lp-ad">'+(it.s.addr||'')+'</div><div class="rt-lp-cp">'+(it.s.cp||'')+'</div><div class="rt-lp-cd">'+code+'</div>';
      g.appendChild(d);
    });
  }

  window.rtSaveShipment = function(){
    if(!CL.length){ rtToast('gere rótulos primeiro'); return; }
    var ds  = dateToStr(ACTIVE_DATE);
    var iso = ACTIVE_DATE.toISOString();
    CL.forEach(function(it){ D.acc[it.s.id]=(D.acc[it.s.id]||0)+1; });
    D.shipments.push({
      id: Date.now(), date: ds, iso: iso,
      boxes: CL.map(function(it){
        return {
          code:      mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0),
          storeId:   it.s.id, storeName: it.s.name, dest: it.s.dest,
          delivered: false, isExtra: it.isExtra||false, extraN: it.extraN||0
        };
      })
    });
    saveData(); CL=[];
    allS().forEach(function(s){ var e=document.getElementById('rtq_'+s.id); if(e) e.value=''; });
    document.getElementById('rt-prev-empty').style.display='flex';
    document.getElementById('rt-prev-panel').style.display='none';
    rtRStores(); rtRAcc(); rtRSum();
    rtToast('envio guardado ✓','ok');
  };

  /* ══════════════════════════════════════════════════════
     HISTORICAL SHIPMENT MODAL
  ══════════════════════════════════════════════════════ */
  window.rtOpenHistModal = function(){
    /* Populate date = yesterday by default */
    var yest = new Date(); yest.setDate(yest.getDate()-1);
    var di = document.getElementById('rt-hist-date');
    if(di) di.value = yest.getFullYear()+'-'+String(yest.getMonth()+1).padStart(2,'0')+'-'+String(yest.getDate()).padStart(2,'0');

    /* Render store qty inputs */
    ['f','p'].forEach(function(dest){
      var el = document.getElementById('rt-hist-stores-'+dest); if(!el) return;
      el.innerHTML='';
      (D.stores[dest]||[]).forEach(function(s){
        var row=document.createElement('div'); row.className='rt-hist-row';
        row.innerHTML='<label>'+s.name+'</label>'+
          '<span class="rt-acc-n">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span>'+
          '<input class="rt-qty-inp" type="number" min="0" id="rthq_'+s.id+'" />';
        el.appendChild(row);
      });
    });
    document.getElementById('rt-hist-modal').classList.add('open');
  };

  window.rtCloseHistModal = function(){
    document.getElementById('rt-hist-modal').classList.remove('open');
  };

  window.rtConfirmHist = function(){
    var di = document.getElementById('rt-hist-date');
    if(!di||!di.value){ rtToast('selecione uma data'); return; }

    var parts  = di.value.split('-');
    var histDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    var ds     = dateToStr(histDate);
    var iso    = histDate.toISOString();

    var items = [];
    allS().forEach(function(s){
      var el  = document.getElementById('rthq_'+s.id);
      var qty = parseInt(el && el.value) || 0;
      if(qty > 0){
        var acc = D.acc[s.id] || 0;
        for(var i=1;i<=qty;i++) items.push({s:s, boxNum:i, total:qty, accBox:acc+i, isExtra:false, extraN:0});
      }
    });

    if(!items.length){ rtToast('introduza pelo menos uma quantidade'); return; }

    /* Update acc and save shipment */
    items.forEach(function(it){ D.acc[it.s.id]=(D.acc[it.s.id]||0)+1; });
    D.shipments.push({
      id: Date.now(), date: ds, iso: iso, historical: true,
      boxes: items.map(function(it){
        return {
          code:      mkCode(it.s, it.accBox, it.boxNum, it.total, 0, histDate),
          storeId:   it.s.id, storeName: it.s.name, dest: it.s.dest,
          delivered: false, isExtra: false, extraN: 0
        };
      })
    });

    /* Sort shipments chronologically */
    D.shipments.sort(function(a,b){ return new Date(a.iso)-new Date(b.iso); });

    saveData();
    rtCloseHistModal();
    rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
    rtToast('envio de '+ds+' registado ✓','ok');
  };

  /* ══════════════════════════════════════════════════════
     SUMMARY TABLE
  ══════════════════════════════════════════════════════ */
  function rtRSum(){
    var body=document.getElementById('rt-sum-body'), foot=document.getElementById('rt-sum-foot');
    var stores=allS();
    var extras=stores.filter(function(s){ return BASE_IDS.indexOf(s.id)===-1; });
    var thead=document.querySelector('#rt-sum-table thead tr');
    while(thead.cells.length>8) thead.deleteCell(-1);
    extras.forEach(function(s){ var th=document.createElement('th'); th.textContent=s.abr.toLowerCase(); thead.appendChild(th); });

    /* Pending counts (not delivered) + oldest pending shipment date */
    var pendF=0, pendP=0;
    var oldestF=null, oldestP=null;
    D.shipments.forEach(function(sh){
      var shDate = sh.iso ? new Date(sh.iso) : null;
      sh.boxes.forEach(function(b){
        if(!b.delivered){
          if(b.dest==='f'){ pendF++; if(shDate&&(!oldestF||shDate<oldestF)) oldestF=shDate; }
          else if(b.dest==='p'){ pendP++; if(shDate&&(!oldestP||shDate<oldestP)) oldestP=shDate; }
        }
      });
    });
    var today=new Date(); today.setHours(0,0,0,0);
    function daysDiff(d){ if(!d) return null; var dd=new Date(d); dd.setHours(0,0,0,0); return Math.round((today-dd)/(1000*60*60*24)); }
    var daysF=daysDiff(oldestF), daysP=daysDiff(oldestP);
    var pFel=document.getElementById('rt-pend-fnc-val');
    var pPel=document.getElementById('rt-pend-pxo-val');
    if(pFel) pFel.textContent=pendF;
    if(pPel) pPel.textContent=pendP;
    /* Update age sub-label in each card */
    var pFsub=document.querySelector('.rt-pend-card.fnc .rt-pend-sub');
    var pPsub=document.querySelector('.rt-pend-card.pxo .rt-pend-sub');
    if(pFsub) pFsub.innerHTML='caixas pendentes'+(pendF>0&&daysF!==null?'<br><span class="rt-pend-days">há '+daysF+(daysF===1?' dia':' dias')+'</span>':'');
    if(pPsub) pPsub.innerHTML='caixas pendentes'+(pendP>0&&daysP!==null?'<br><span class="rt-pend-days">há '+daysP+(daysP===1?' dia':' dias')+'</span>':'');

    if(!D.shipments.length){
      body.innerHTML='<tr><td colspan="'+(8+extras.length)+'" class="rt-empty-row">sem envios registados este ano</td></tr>';
      foot.innerHTML=''; return;
    }
    var tot={f:0,p:0}; stores.forEach(function(s){ tot[s.id]=0; });

    /* Group shipments by month key "YYYY-MM" */
    var monthOrder=[], monthMap={};
    D.shipments.forEach(function(sh){
      var iso = sh.iso || '';
      var key, label;
      if(iso){
        var d=new Date(sh.iso);
        key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        label=d.toLocaleDateString('pt-PT',{month:'long',year:'numeric'}).toLowerCase();
      } else {
        /* fallback: parse from sh.date "dd/mm/yyyy" */
        var parts=sh.date.split('/');
        if(parts.length===3){ key=parts[2]+'-'+parts[1].padStart(2,'0'); label=new Date(parseInt(parts[2]),parseInt(parts[1])-1,1).toLocaleDateString('pt-PT',{month:'long',year:'numeric'}).toLowerCase(); }
        else { key='?'; label='?'; }
      }
      if(!monthMap[key]){ monthMap[key]={label:label,shipments:[]}; monthOrder.push(key); }
      monthMap[key].shipments.push(sh);
    });

    var colSpan = 8 + extras.length;
    var htmlRows = '';
    var groupIdx = 0;
    monthOrder.forEach(function(key){
      var grp = monthMap[key];
      var mTotF=0, mTotP=0; var mTotStore={};
      stores.forEach(function(s){ mTotStore[s.id]=0; });
      grp.shipments.forEach(function(sh){
        var fc=sh.boxes.filter(function(b){ return b.dest==='f'; }).length;
        var ps=sh.boxes.filter(function(b){ return b.dest==='p'; }).length;
        mTotF+=fc; mTotP+=ps;
        tot.f+=fc; tot.p+=ps;
        stores.forEach(function(s){ var c=sh.boxes.filter(function(b){ return b.storeId===s.id; }).length; mTotStore[s.id]+=c; tot[s.id]+=c; });
      });
      var gid='rtmg'+groupIdx++;
      /* Month header row */
      htmlRows+='<tr class="rt-month-row" onclick="(function(el){el.classList.toggle(\'open\');var rows=document.querySelectorAll(\'.rt-detail-'+gid+'\');rows.forEach(function(r){r.classList.toggle(\'open\');});}).call(this,this)">';
      htmlRows+='<td><span class="rt-month-tri">▶</span>'+grp.label+'</td>';
      htmlRows+='<td class="rt-num rt-col-fnc">'+(mTotF||'—')+'</td><td class="rt-num rt-col-pxo">'+(mTotP||'—')+'</td>';
      stores.forEach(function(s){ var t=mTotStore[s.id]; htmlRows+=t?'<td class="rt-num">'+t+'</td>':'<td>—</td>'; });
      htmlRows+='</tr>';
      /* Detail rows (collapsed by default) */
      grp.shipments.forEach(function(sh){
        var fc=sh.boxes.filter(function(b){ return b.dest==='f'; }).length;
        var ps=sh.boxes.filter(function(b){ return b.dest==='p'; }).length;
        var cols=stores.map(function(s){ var c=sh.boxes.filter(function(b){ return b.storeId===s.id; }).length; return c?'<td class="rt-num">'+c+'</td>':'<td>—</td>'; }).join('');
        var pastMark=sh.historical?' <span class="rt-hist-mark">hist</span>':'';
        htmlRows+='<tr class="rt-month-detail rt-detail-'+gid+'">';
        htmlRows+='<td class="rt-indent28">'+sh.date+pastMark+'</td>';
        htmlRows+='<td class="rt-num rt-col-fnc">'+(fc||'—')+'</td><td class="rt-num rt-col-pxo">'+(ps||'—')+'</td>'+cols+'</tr>';
      });
    });
    body.innerHTML=htmlRows;

    var tc=stores.map(function(s){ var t=tot[s.id]||0; return t?'<td class="rt-num">'+t+'</td>':'<td>—</td>'; }).join('');
    foot.innerHTML='<tr><td class="rt-fw-bold">total</td><td class="rt-num rt-col-fnc">'+tot.f+'</td><td class="rt-num rt-col-pxo">'+tot.p+'</td>'+tc+'</tr>';
  }

  /* ══════════════════════════════════════════════════════
     DELIVERY CONTROL
  ══════════════════════════════════════════════════════ */
  function rtRCtrl(){
    var el=document.getElementById('rt-sl');
    var list=D.shipments.slice().reverse();
    if(CF==='pending') list=list.filter(function(s){ return s.boxes.some(function(b){ return !b.delivered; }); });
    else if(CF==='done') list=list.filter(function(s){ return s.boxes.every(function(b){ return b.delivered; }); });
    else if(CF==='f') list=list.filter(function(s){ return s.boxes.some(function(b){ return b.dest==='f'; }); });
    else if(CF==='p') list=list.filter(function(s){ return s.boxes.some(function(b){ return b.dest==='p'; }); });
    if(!list.length){ el.innerHTML='<div class="rt-es"><p>nenhum envio encontrado.</p></div>'; return; }
    el.innerHTML='';
    list.forEach(function(sh){
      var del=sh.boxes.filter(function(b){ return b.delivered; }).length, tot=sh.boxes.length, allDone=del===tot;
      var div=document.createElement('div'); div.className='rt-sg'+(allDone?' col':''); div.id='rtsg_'+sh.id;
      var rows=sh.boxes.map(function(b,i){
        return '<div class="rt-bx'+(b.delivered?' done':'')+'" id="rtbr_'+sh.id+'_'+i+'">'+
          '<input type="checkbox" class="rt-bx-chk"'+(b.delivered?' checked':'')+' onchange="rtTogDel('+sh.id+','+i+',this)" />'+
          '<div class="rt-bx-dot"></div><div class="rt-bx-cd">'+b.code+'</div><div class="rt-bx-st">'+b.storeName+'</div></div>';
      }).join('');
      var histTag = sh.historical ? ' <span class="rt-hist-badge">hist</span>' : '';
      div.innerHTML=
        '<div class="rt-sg-hd">'+
          '<div class="rt-sg-t-wrap" onclick="rtTogGrp(\'rtsg_'+sh.id+'\')">'+
            '<div class="rt-sg-t">'+sh.date+histTag+'</div>'+
            '<div class="rt-sg-m">'+
              '<span class="rt-sg-pr" id="rtsp_'+sh.id+'">'+del+'/'+tot+' entregues</span>'+
              '<span class="rt-sg-b">'+tot+' cx</span>'+
              (allDone?'<span class="rt-sg-ok">✓ completo</span>':'')+
              '<span class="rt-sg-ch">▾</span>'+
            '</div>'+
          '</div>'+
          '<button class="rt-reprint-btn" onclick="rtReprintShipment('+sh.id+',event)">'+
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'+
            ' reimprimir</button>'+
          '<button class="rt-del-btn" onclick="rtOpenDelModal('+sh.id+',\''+sh.date+'\',event)" title="eliminar envio">✕</button>'+
        '</div>'+
        '<div class="rt-sg-bx">'+rows+'</div>';
      el.appendChild(div);
    });
  }

  window.rtTogGrp = function(id){ var el=document.getElementById(id); if(el) el.classList.toggle('col'); };
  window.rtTogDel = function(shId,idx,cb){
    var sh=D.shipments.find(function(s){ return s.id==shId; }); if(!sh) return;
    sh.boxes[idx].delivered=cb.checked; saveData();
    var row=document.getElementById('rtbr_'+shId+'_'+idx); if(row) row.classList.toggle('done',cb.checked);
    var del=sh.boxes.filter(function(b){ return b.delivered; }).length;
    var sp=document.getElementById('rtsp_'+shId); if(sp) sp.textContent=del+'/'+sh.boxes.length+' entregues';
    if(cb.checked && del===sh.boxes.length){
      var grp=document.getElementById('rtsg_'+shId); if(grp) grp.classList.add('col');
    }
    rtRSum(); rtToast(cb.checked?'caixa entregue ✓':'caixa desmarcada',cb.checked?'ok':'');
  };

  /* ── Delete shipment ── */
  var _delPendingId = null;
  window.rtOpenDelModal = function(shId, dateStr, evt){
    if(evt) evt.stopPropagation();
    _delPendingId = shId;
    var msg = document.getElementById('rt-del-msg');
    if(msg) msg.textContent = 'tem a certeza que quer eliminar o envio de ' + dateStr + '? esta acção não pode ser desfeita.';
    document.getElementById('rt-del-modal').classList.add('open');
  };
  window.rtCloseDelModal = function(){
    _delPendingId = null;
    document.getElementById('rt-del-modal').classList.remove('open');
  };
  window.rtConfirmDel = function(){
    if(!_delPendingId) return;
    D.shipments = D.shipments.filter(function(s){ return s.id != _delPendingId; });
    /* Recalculate acc from scratch based on remaining shipments */
    var newAcc = {};
    D.shipments.forEach(function(sh){
      sh.boxes.forEach(function(b){ newAcc[b.storeId] = (newAcc[b.storeId]||0) + 1; });
    });
    D.acc = newAcc;
    saveData();
    rtCloseDelModal();
    rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
    rtToast('envio eliminado','ok');
  };

  window.rtFCtrl = function(f,btn){
    CF=f; document.querySelectorAll('.rt-fb').forEach(function(b){ b.classList.remove('active'); }); btn.classList.add('active'); rtRCtrl();
  };
  window.rtReprintShipment = function(shId,evt){
    if(evt) evt.stopPropagation();
    var sh=D.shipments.find(function(s){ return s.id==shId; }); if(!sh){ rtToast('envio não encontrado'); return; }
    var items=sh.boxes.map(function(b){ var store=allS().find(function(s){ return s.id===b.storeId; })||{id:b.storeId,name:b.storeName,code:'',abr:'',addr:'',cp:'',dest:b.dest}; return{s:store,boxNum:0,total:0,accBox:0,isExtra:b.isExtra||false,extraN:b.extraN||0,_preCode:b.code}; });
    rtShowPrintModal(items,'reimprimir — '+sh.date);
  };
  window.rtOpenPrintModal = function(){ if(!CL.length){ rtToast('gere rótulos primeiro'); return; } rtShowPrintModal(CL,'prévia de impressão'); };

  function rtShowPrintModal(items,title){
    PITEMS=items.slice();
    document.getElementById('rt-mp-title').textContent=(title||'prévia')+' — '+items.length+' rótulo'+(items.length>1?'s':'');
    var body=document.getElementById('rt-mp-body'); body.innerHTML='';
    var cs=8;
    for(var i=0;i<items.length;i+=cs){
      var chunk=items.slice(i,i+cs);
      var pg=Math.floor(i/cs)+1, pages=Math.ceil(items.length/cs);
      var lbl=document.createElement('div'); lbl.className='rt-pg-lbl';
      lbl.textContent='folha '+pg+(pages>1?' / '+pages:'')+' — '+chunk.length+' rótulo'+(chunk.length>1?'s':'');
      body.appendChild(lbl);
      var sheet=document.createElement('div'); sheet.className='rt-psheet';
      chunk.forEach(function(it){
        var code=it._preCode||mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0);
        var d=document.createElement('div'); d.className='rt-rot';
        d.innerHTML='<div class="rs">WAKZOME</div><div class="rn">'+(it.s.name||'')+'</div><div class="ra">'+(it.s.addr||'')+'</div><div class="rc">'+(it.s.cp||'')+'</div><div class="rk">'+code+'</div>';
        sheet.appendChild(d);
      });
      while(sheet.children.length<8){ var e=document.createElement('div'); e.className='rt-rot empty'; sheet.appendChild(e); }
      body.appendChild(sheet);
    }
    document.getElementById('rt-modal-print').style.display='flex';
  }

  window.rtClosePrintModal = function(){ document.getElementById('rt-modal-print').style.display='none'; };
  window.rtDoPrint = function(){
    if(!PITEMS.length){ rtToast('sem rótulos'); return; }
    var cs = 8;
    var pagesHtml = '';
    for(var i=0; i<PITEMS.length; i+=cs){
      var chunk = PITEMS.slice(i, i+cs);
      var rowsHtml = '';
      chunk.forEach(function(it){
        var code = it._preCode || mkCode(it.s, it.accBox, it.boxNum, it.total, it.extraN||0);
        rowsHtml += '<div class="row">'
          + '<div class="send">WAKZOME</div>'
          + '<div class="st">' + (it.s.name||'').toUpperCase() + '</div>'
          + '<div class="ad">' + (it.s.addr||'').toUpperCase() + '</div>'
          + '<div class="cp">' + (it.s.cp||'').toUpperCase() + '</div>'
          + '<div class="cd">' + code + '</div>'
          + '</div>';
      });
      // pad to 8 rows
      for(var j=chunk.length; j<8; j++) rowsHtml += '<div class="row empty"></div>';
      pagesHtml += '<div class="page">' + rowsHtml + '</div>';
    }
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<title>rótulos</title>'
      + '<style>'
      + '* { margin:0; padding:0; box-sizing:border-box; }'
      + 'body { background:#fff; }'
      + '@page { size: A4 portrait; margin: 0; }'
      + '.page { width:210mm; height:297mm; display:flex; flex-direction:column; page-break-after:always; break-after:page; overflow:hidden; }'
      + '.page:last-child { page-break-after:avoid; break-after:avoid; }'
      + '.row { flex: 0 0 calc(297mm / 8); height:calc(297mm / 8); padding:2mm 12mm; border-bottom:0.5pt solid #ccc; display:flex; flex-direction:column; justify-content:center; font-family:Arial,sans-serif; overflow:hidden; }'
      + '.row:last-child { border-bottom:none; }'
      + '.row.empty { background:#fafafa; }'
      + '.send { font-size:6.5pt; text-transform:uppercase; letter-spacing:1px; margin-bottom:1mm; color:#000; font-weight:700; }'
      + '.st { font-size:16pt; font-weight:900; text-transform:uppercase; margin-bottom:1.5mm; line-height:1.1; color:#000; }'
      + '.ad { font-size:9pt; line-height:1.3; color:#000; font-weight:600; }'
      + '.cp { font-size:9pt; margin-bottom:1.5mm; color:#000; font-weight:600; }'
      + '.cd { font-size:9pt; font-weight:800; font-family:\'Courier New\',monospace; background:#e8e8e8; padding:1.5mm 2.5mm; border-left:3pt solid #000; display:inline-block; color:#000; }'
      + '</style></head><body>'
      + pagesHtml
      + '<script>window.onload=function(){ window.focus(); window.print(); setTimeout(function(){ window.close(); }, 1000); };<\/script>'
      + '</body></html>';
    var w = window.open('', '_blank', 'width=900,height=700');
    if(!w){ rtToast('permita popups para imprimir'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };
  window.rtExportPDF = function(){ rtToast('selecione "guardar como pdf" no diálogo de impressão','ok'); setTimeout(rtDoPrint,400); };
  window.rtSendEmail = function(){ rtToast('funcionalidade de email será configurada em breve'); };

  var _tt;
  function rtToast(msg,type){
    var t=document.getElementById('rt-toast');
    t.className='rt-toast'+(type?' '+type:'');
    t.textContent=msg; t.classList.add('show');
    clearTimeout(_tt); _tt=setTimeout(function(){ t.classList.remove('show'); },3000);
  }

  document.addEventListener('keydown',function(e){
    var ov=document.getElementById('rotulos-overlay'); if(!ov||!ov.classList.contains('open')) return;
    if(e.key==='Escape'){ rtClosePrintModal(); rtCloseAdd(); rtCloseHistModal(); rtCloseDelModal(); }
  });
  document.getElementById('rt-modal-print').addEventListener('click',function(e){ if(e.target===this) rtClosePrintModal(); });
  document.getElementById('rt-mm-add').addEventListener('click',function(e){ if(e.target===this) rtCloseAdd(); });
  document.getElementById('rt-hist-modal').addEventListener('click',function(e){ if(e.target===this) rtCloseHistModal(); });
  document.getElementById('rt-del-modal').addEventListener('click',function(e){ if(e.target===this) rtCloseDelModal(); });
  var delOk = document.getElementById('rt-del-ok');
  if(delOk) delOk.addEventListener('click', rtConfirmDel);

  rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
}

})();

// ══════════════════════════════════════════════════════════════
//  (bloco SAFT-REMINDER — scope de topo, ver nota no cabeçalho do ficheiro)
// ══════════════════════════════════════════════════════════════

// ══ SAFT REMINDER ══
function initSaftReminder() {
  const reminder = document.getElementById('saft-reminder');
  if (!reminder) return;

  function updateSaft() {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();

    // Next end-of-month: find the last day of current month, or next month if already past it
    function nextEndOfMonthFrom(d) {
      let y = d.getFullYear(), m = d.getMonth();
      // Last day of current month: day 0 of next month
      const endThisMonth = new Date(y, m + 1, 0);
      endThisMonth.setHours(0, 0, 0, 0);
      if (endThisMonth >= d) return endThisMonth;
      // Otherwise, last day of next month
      return new Date(y, m + 2, 0);
    }

    const today = new Date(year, month, day);
    const next31 = nextEndOfMonthFrom(today);
    if (!next31) return;

    const msPerDay = 86400000;
    const diffDays = Math.round((next31 - today) / msPerDay);

    const countEl = document.getElementById('saft-countdown');
    const labelEl = document.getElementById('saft-countdown-label');
    const titleEl = document.getElementById('saft-title');

    if (diffDays === 0) {
      countEl.textContent = 'hoje';
      labelEl.textContent = 'fim do mês';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else if (diffDays <= 5) {
      countEl.textContent = diffDays;
      labelEl.textContent = diffDays === 1 ? 'dia para o fim do mês' : 'dias para o fim do mês';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else {
      countEl.textContent = diffDays;
      labelEl.textContent = 'dias para o fim do mês';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.remove('urgent');
    }
  }

  updateSaft();
  setInterval(updateSaft, 60000);

  // Populate last loaded month
  function updateRecibosMonth() {
    const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const mes   = localStorage.getItem('gh_mes') || '';
    const mesEl = document.getElementById('saft-recibos-mes');
    if (!mesEl) return;
    if (!mes) { mesEl.textContent = '—'; return; }
    const parts  = mes.split('-');
    const mNum   = parseInt(parts[0], 10);
    const ano    = parts[1] || '';
    const nome   = (mNum >= 1 && mNum <= 12) ? MESES_PT[mNum - 1] : mes;
    mesEl.textContent = nome + (ano ? ' ' + ano : '');
  }
  updateRecibosMonth();

  // Re-update when config is saved
  const saveBtn = document.getElementById('r-save-config');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    setTimeout(updateRecibosMonth, 100);
  });

  reminder.classList.add('show');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      reminder.classList.add('visible');
    });
  });
}
