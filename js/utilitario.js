

// ══════════════════════════════════════════════════════════════
//  SAFT-REMINDER — auto-injeção do shell (executa primeiro que
//  tudo o resto do ficheiro, para garantir que os elementos do
//  painel já existem quando os outros blocos os procuram).
// ══════════════════════════════════════════════════════════════
function ensureSaftReminderShell() {
  if (document.getElementById('saft-reminder')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="saft-reminder">
  <div id="saft-label">recordatorio</div>
  <div id="saft-title">gerir envio<br>de SAFT</div>
  <div id="saft-divider"></div>
  <button id="saft-recibos-btn" onclick="openRecibosOverlay()">recibos</button>
  <div id="saft-recibos-label">últimos recibos<br>carregados</div>
  <div id="saft-recibos-mes">—</div>
  <div id="saft-divider2" style="width:100%;height:1px;background:#e8e8e8;margin:10px 0;"></div>
  <div id="saft-faturas-label" style="font-size:.6rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000;">faturas</div>
  <div id="saft-faturas-count" style="font-size:1.5rem;font-weight:100;color:#000;line-height:1;letter-spacing:-.01em;">—</div>
  <div id="saft-faturas-count-label" style="font-size:.62rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#000;margin-top:-2px;">a vencer esta semana</div>
  <div id="saft-faturas-list" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;width:100%;"></div>
  <button id="saft-agenda-btn" onclick="openAgendaOverlay()" style="margin-top:4px;padding:5px 14px;font-size:.72rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.05em;color:#000;border:1px solid #ccc;border-radius:20px;background:transparent;cursor:pointer;transition:color .2s,border-color .2s,background .2s;width:100%;">ver agenda →</button>

  
  <div id="saft-divider3" style="width:100%;height:1px;background:#e8e8e8;margin:12px 0 8px;"></div>
  <div id="emg-label" style="font-size:.6rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000;margin-bottom:4px;">código de acesso</div>
  <div id="emg-bubble" role="button" tabindex="0" aria-label="código de acesso"></div>

  
  <div style="width:100%;height:1px;background:#e8e8e8;margin:12px 0 8px;"></div>
  <div style="font-size:.6rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000;margin-bottom:6px;">folgas pedidas</div>
  <button id="fd-btn" onclick="openFolgasDirigidasModal()">ver / editar<span id="fd-badge-count" style="display:none"></span></button>
</div>`);
}
ensureSaftReminderShell();

// ══════════════════════════════════════════════════════════════
//  CÓDIGOS DE EMERGÊNCIA — bolha de acesso: shell do tooltip partilhado
//  (desktop dentro da sidebar via #emg-bubble; mobile inserida no fluxo
//  normal logo depois de #adm-module-grid via #emg-mobile-bubble — NÃO
//  position:fixed, porque #adm-dashboard tem o seu próprio overflow-y:
//  auto e um botão fixo ao ecrã ficaria a sobrepor os cartões enquanto
//  o utilizador faz scroll). Tooltip injetado fora de #saft-reminder
//  para continuar acessível quando este fica oculto em mobile.
// ══════════════════════════════════════════════════════════════
function ensureEmgPanelShell() {
  if (!document.getElementById('emg-mobile-bubble')) {
    var bubbleHtml = '<div id="emg-mobile-bubble" role="button" tabindex="0" aria-label="código de acesso"></div>';
    var grid = document.getElementById('adm-module-grid');
    var dashboard = document.getElementById('adm-dashboard');
    if (grid) grid.insertAdjacentHTML('afterend', bubbleHtml);
    else if (dashboard) dashboard.insertAdjacentHTML('beforeend', bubbleHtml);
    else document.body.insertAdjacentHTML('beforeend', bubbleHtml);
  }
  if (document.getElementById('emg-tooltip')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="emg-tooltip">
  <div id="emg-tooltip-title">código de acesso</div>
  <div id="emg-date">hoje</div>
  <div id="emg-codes-list"></div>
  <div id="emg-valid">válido até às 00:00</div>
</div>`);
}
ensureEmgPanelShell();

function toggleEmgTooltip() {
  var tooltip = document.getElementById('emg-tooltip');
  if (tooltip) tooltip.classList.toggle('open');
}
function closeEmgTooltip() {
  var tooltip = document.getElementById('emg-tooltip');
  if (tooltip) tooltip.classList.remove('open');
}
(function bindEmgBubbles() {
  var triggers = [document.getElementById('emg-bubble'), document.getElementById('emg-mobile-bubble')];
  triggers.forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleEmgTooltip();
    });
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleEmgTooltip(); }
    });
  });
  document.addEventListener('click', function (ev) {
    var tooltip = document.getElementById('emg-tooltip');
    if (!tooltip || !tooltip.classList.contains('open')) return;
    if (tooltip.contains(ev.target)) return;
    closeEmgTooltip();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeEmgTooltip();
  });
})();

// ══════════════════════════════════════════════════════════════
//  CÓDIGOS DE EMERGÊNCIA — hash determinístico por loja+data, gera o
//  código diário para cada loja e preenche o widget cujo shell vazio
//  (#emg-codes-list / #emg-date) é criado acima por ensureEmgPanelShell().
//  Antes vivia em index.html; movido para aqui porque é este ficheiro que
//  cria o contentor. Nota: como este script só carrega DEPOIS do login
//  (loadProtectedScripts), DOMContentLoaded já disparou há muito — por
//  isso a deteção de visibilidade abaixo verifica o estado atual de
//  imediato, em vez de depender desse evento.
// ══════════════════════════════════════════════════════════════
function _emergencyCode(tienda, dateStr) {
  var SECRET = 'wkz.ps@8f2e1b9d4c7a';
  var raw = SECRET + '|' + tienda.toLowerCase() + '|' + dateStr;
  var h = 5381;
  for (var i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) + raw.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  var code = 10000 + (h % 90000);
  return String(Math.abs(code));
}

function _renderEmgCodes() {
  var list = document.getElementById('emg-codes-list');
  var dateEl = document.getElementById('emg-date');
  if (!list) return;

  var today = new Date();
  var dd = String(today.getDate()).padStart(2,'0');
  var mm = String(today.getMonth()+1).padStart(2,'0');
  var yyyy = today.getFullYear();
  var dateStr = yyyy + '-' + mm + '-' + dd;
  var displayDate = dd + '/' + mm + '/' + yyyy;

  if (dateEl) dateEl.textContent = displayDate;

  var stores = ['Shana', 'Mezka Avenida', 'Mezka Mercado', 'Maxx', 'Mezka Funchal', 'Parfois Arcadas'];
  list.innerHTML = '';
  stores.forEach(function (s) {
    var code = _emergencyCode(s, dateStr);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:6px;padding:2px 0;border-bottom:1px solid #f0f0f0;';
    var nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-size:.65rem;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameEl.textContent = s;
    var codeEl = document.createElement('span');
    codeEl.style.cssText = 'font-size:.82rem;font-weight:bold;color:#000;letter-spacing:.08em;white-space:nowrap;';
    codeEl.textContent = code;
    row.appendChild(nameEl);
    row.appendChild(codeEl);
    list.appendChild(row);
  });

  var now = new Date();
  var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 5);
  var msUntilMidnight = midnight - now;
  setTimeout(function () { _renderEmgCodes(); }, msUntilMidnight);
}

(function () {
  var adminApp = document.getElementById('admin-app');
  if (!adminApp) return;
  if (adminApp.classList.contains('show')) { _renderEmgCodes(); return; }
  new MutationObserver(function (muts, obs) {
    if (adminApp.classList.contains('show')) {
      _renderEmgCodes();
      obs.disconnect();
    }
  }).observe(adminApp, { attributes: true, attributeFilter: ['class'] });
})();

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

/* ── Auto-injeção: shell #agenda-overlay. Migrado de index.html. Lazy —
   nada faz varrimento único dos seus filhos antes de openAgendaOverlay()
   correr (o botão que a abre é um data-tab interceptado por admin-init.js,
   não depende do conteúdo interno do overlay já existir). ── */
function ensureAgendaOverlayShell() {
  if (document.getElementById('agenda-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="agenda-overlay">
  <div id="agenda-overlay-bar">
    <button id="agenda-overlay-back" onclick="closeAgendaOverlay()">← voltar</button>
    <div id="agenda-overlay-title">agenda faturas</div>
  </div>
  <div id="agenda-overlay-content">
    <div id="ag-root" style="width:100%;"></div>
  </div>
</div>
  `);
}

window.openAgendaOverlay = function () {
  agInjectStyle();
  ensureAgendaOverlayShell();
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
  // Este overlay é anterior ao acordeão do dashboard e cobre-o por completo;
  // ao voltar, o grupo "Utilitários" tem de ser colapsado tal como acontece
  // no fluxo normal via goToDashboard() — senão fica expandido por baixo.
  if (typeof window.collapseAccordion === 'function') window.collapseAccordion();
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
          if(col&&!FC_BASE[f]){this.style.background=col;this.style.borderColor=col;this.style.color='#fff';}}
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
      var list=getS(getF());
      if(!list.length){tb.innerHTML='';em.style.display='block';em.textContent=(agFilter==='pago'?'sem faturas pagas · ':agFilter==='vencida'?'sem faturas vencidas · ':'sem faturas pendentes · ')+agForn;return;}
      em.style.display='none';var rows=[],delay=0,seq=0;
      function addSec(secList,lbl,cls){if(!secList.length)return;var t=secList.reduce(function(s,f){return s+f.valor;},0);rows.push(secRow(lbl+' — '+secList.length+' fatura'+(secList.length>1?'s':''),cls));secList.forEach(function(f){seq++;rows.push(bRow(f,delay,seq));delay+=32;});rows.push(subRow(secList.length,t));}
      if(agFilter==='pago'){
        addSec(list,'✓ pago / NC','ag-sec-d');
      } else {
        var pend=list.filter(function(f){return f.estado!=='pago'&&f.estado!=='nc';});
        pend.sort(function(a,b){var da=a.vencimento||'9999',db=b.vencimento||'9999';return da<db?-1:da>db?1:0;});
        var v=[],u=[],x=[],dist=[];
        pend.forEach(function(f){var d=dd(f.vencimento);if(d===null||d<0)v.push(f);else if(d>=0&&d<=DAYS_TO_SUNDAY)u.push(f);else if(d<=30)x.push(f);else dist.push(f);});
        addSec(v,'▲ vencidas','ag-sec-v');addSec(u,'● esta semana','ag-sec-u');addSec(x,'● próximas 30 dias','ag-sec-x');addSec(dist,'○ mais distantes','ag-sec-d');
        if(agFilter==='all'){
          var pago=list.filter(function(f){return f.estado==='pago'||f.estado==='nc';});
          addSec(pago,'✓ pago / NC','ag-sec-d');
        }
      }
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
    btn.addEventListener('click',function(){agFilter=this.dataset.filter;document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});this.classList.add('active');if(agFilter==='pendente'){agSort.col='vencimento';agSort.dir='asc';}rBanner();rTable();rForn();});
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

/* ══════════════════════════════════════════════════════
   WIDGET FATURAS (painel #saft-reminder) — fundido de index.html
   Lê os mesmos dados (localStorage ag_faturas_*) de forma
   independente do overlay principal da agenda.
══════════════════════════════════════════════════════ */
var AG_WIDGET_FIRST_YEAR = 2023;

function agWidgetDataKey(y) { return 'ag_faturas_' + y; }

function agWidgetDiasPara(dateStr) {
  if (!dateStr) return null;
  var today = new Date(); today.setHours(0,0,0,0);
  var d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function agWidgetFmtVal(v) {
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function agWidgetLoadFaturas() {
  var allFat = [];
  var currentYear = new Date().getFullYear();
  for (var y = AG_WIDGET_FIRST_YEAR; y <= currentYear; y++) {
    try {
      var raw = localStorage.getItem(agWidgetDataKey(y));
      if (raw) {
        var arr = JSON.parse(raw);
        arr.forEach(function (f) { allFat.push(f); });
      }
    } catch (e) {}
  }
  return allFat;
}

function agRenderFaturasWidget() {
  var countEl = document.getElementById('saft-faturas-count');
  var listEl  = document.getElementById('saft-faturas-list');
  if (!countEl || !listEl) return;

  var faturas = agWidgetLoadFaturas();

  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
  var seg = new Date(hoje); seg.setDate(hoje.getDate() - diaSemana);
  var dom = new Date(seg);  dom.setDate(seg.getDate() + 6); dom.setHours(23,59,59,999);

  var semana = faturas.filter(function (f) {
    if (f.estado === 'pago' || f.estado === 'nc') return false;
    if (!f.vencimento) return false;
    var d = new Date(f.vencimento); d.setHours(0,0,0,0);
    return d <= dom;
  });

  var total = semana.length;
  var montante = semana.reduce(function (acc, f) { return acc + (f.valor || 0); }, 0);
  var vencidas = semana.filter(function (f) { return agWidgetDiasPara(f.vencimento) < 0; }).length;
  var aVencer  = total - vencidas;

  countEl.textContent = total > 0 ? total : '0';
  countEl.className = '';
  if (vencidas > 0)   countEl.classList.add('danger');
  else if (total > 0) countEl.classList.add('warn');

  var labelEl = document.getElementById('saft-faturas-count-label');
  if (labelEl) {
    if (vencidas > 0 && aVencer > 0) {
      labelEl.textContent = vencidas + ' vencida' + (vencidas > 1 ? 's' : '') +
                            ' / ' + aVencer + ' a vencer';
    } else if (vencidas > 0) {
      labelEl.textContent = vencidas === 1 ? 'fatura vencida' : 'faturas vencidas';
    } else if (aVencer > 0) {
      labelEl.textContent = aVencer === 1 ? 'fatura a vencer esta semana' : 'faturas a vencer esta semana';
    } else {
      labelEl.textContent = 'a vencer esta semana';
    }
  }

  listEl.innerHTML = '';
  if (total === 0) {
    listEl.innerHTML = '<div class="saft-fat-empty">sem vencimentos esta semana</div>';
    return;
  }

  var montoEl = document.createElement('div');
  montoEl.className = 'saft-fat-total';
  montoEl.textContent = agWidgetFmtVal(montante);
  listEl.appendChild(montoEl);

  var subEl = document.createElement('div');
  subEl.className = 'saft-fat-total-label';
  subEl.textContent = 'total a liquidar';
  listEl.appendChild(subEl);
}

function agWidgetInit() {
  agRenderFaturasWidget();
  setInterval(agRenderFaturasWidget, 60000);

  document.addEventListener('agendaClosed', agRenderFaturasWidget);

  var agOv = document.getElementById('agenda-overlay');
  if (agOv) {
    var obs = new MutationObserver(function () {
      if (!agOv.classList.contains('open')) agRenderFaturasWidget();
    });
    obs.observe(agOv, { attributes: true, attributeFilter: ['class'] });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', agWidgetInit);
} else {
  agWidgetInit();
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

/* ── Auto-injeção: shell #rotulos-overlay. Migrado de index.html. Lazy,
   mesmo motivo do agenda-overlay acima. ── */
function ensureRotulosOverlayShell() {
  if (document.getElementById('rotulos-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="rotulos-overlay">
  <div id="rotulos-overlay-bar">
    <button id="rotulos-overlay-back" onclick="closeRotulosOverlay()">← voltar</button>
    <div id="rotulos-overlay-title">rótulos</div>
  </div>
  <div id="rotulos-overlay-content">
    <div id="rt-root" style="width:100%;"></div>
  </div>
</div>
  `);
}

window.openRotulosOverlay = function () {
  ensureRotulosOverlayShell();
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
  // Este overlay é anterior ao acordeão do dashboard e cobre-o por completo;
  // ao voltar, o grupo "Utilitários" tem de ser colapsado tal como acontece
  // no fluxo normal via goToDashboard() — senão fica expandido por baixo.
  if (typeof window.collapseAccordion === 'function') window.collapseAccordion();
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
  ensureSaftReminderShell();
  const reminder = document.getElementById('saft-reminder');
  if (!reminder) return;

  function isSaftReminderVisible(date) {
    const day = date.getDate();
    if (day <= 3) return true;
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return day === lastDay;
  }

  function updateSaft() {
    const visible = isSaftReminderVisible(new Date());
    const display = visible ? '' : 'none';
    const labelEl = document.getElementById('saft-label');
    const titleEl = document.getElementById('saft-title');
    const dividerEl = document.getElementById('saft-divider');
    if (labelEl) labelEl.style.display = display;
    if (titleEl) titleEl.style.display = display;
    if (dividerEl) dividerEl.style.display = display;
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

/* ══════════════════════════════════════════════════════════════
   BLOCO EDITOR PDF — fundido de editor-pdf.js
   IIFE própria, scope isolado (idêntico ao padrão AGENDA/RÓTULOS).
══════════════════════════════════════════════════════════════ */
// ══════════════════════════════════════════════════════════════
//  ADMIN: EDITOR PDF — v2.0
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── DOM injected by editor-pdf.js ──
  function ensureTabShell() {
    if (document.getElementById('tab-editor')) return;
    var adminApp = document.getElementById('admin-app');
    if (!adminApp) return;
    var panel = document.createElement('div');
    panel.id = 'tab-editor';
    panel.className = 'tab-panel';
    panel.innerHTML = `    
    <div id="ed-mobile-msg">
      <span>🖥️</span>
      <p>editor de pdf não disponível em mobile</p>
      <small>acede a partir de um computador para utilizar esta funcionalidade</small>
    </div>
    
    <div id="ed-toolbar">
      <label id="ed-upload-btn" for="ed-file-input" title="Carregar PDF">
        <span>📂</span> carregar pdf
        <input type="file" id="ed-file-input" accept="application/pdf" class="ed-hidden-input">
      </label>
      <div class="ed-sep"></div>
      <button id="ed-add-text-btn" title="Adicionar caixa de texto">✏️ texto</button>
      <label id="ed-add-img-btn" for="ed-img-input" title="Inserir imagem">
        🖼️ imagem
        <input type="file" id="ed-img-input" accept="image/*" class="ed-hidden-input">
      </label>
      <button id="ed-edit-native-btn" title="Ativar edição do texto original do PDF">🔤 editar texto original</button>
      <div class="ed-sep"></div>
      <button id="ed-bold-btn" title="Negrito">B</button>
      <button id="ed-italic-btn" title="Itálico">I</button>
      <button id="ed-underline-btn" title="Sublinhado">U</button>
      <select id="ed-font-family" title="Família de fonte">
        <option value="Helvetica">Arial</option>
        <option value="Times-Roman">Times</option>
        <option value="Courier">Courier</option>
      </select>
      <div class="ed-sep"></div>
      <label class="ed-tool-label" for="ed-font-size">tamanho</label>
      <input type="number" id="ed-font-size" value="14" min="6" max="120" step="1">
      <input type="color" id="ed-font-color" value="#000000" title="Cor do texto">
      <div class="ed-sep"></div>
      <button id="ed-draw-btn" title="Caneta livre">✏ desenhar</button>
      <input type="color" id="ed-draw-color" value="#000000" title="Cor do desenho">
      <input type="number" id="ed-draw-size" value="2" min="1" max="20" step="1" title="Espessura">
      <button id="ed-shape-btn" title="Inserir forma">⬡ formas</button>
      <div class="ed-sep"></div>
      <button id="ed-highlight-btn" title="Destacar / riscar / sublinhar (arrastar sobre texto)">🖌 destacar</button>
      <button id="ed-sticky-btn" title="Nota adesiva (clicar na página)">📌 nota</button>
      <div class="ed-sep"></div>
      <button id="ed-stamp-btn" title="Carimbo">🔖 carimbo</button>
      <button id="ed-pages-btn" title="Gerir páginas" disabled>📄 páginas</button>
      <label id="ed-concat-btn" for="ed-concat-input" title="Juntar outro PDF">➕ juntar pdf
        <input type="file" id="ed-concat-input" accept="application/pdf" class="ed-hidden-input">
      </label>
      <div class="ed-sep"></div>
      <label class="ed-tool-label" for="ed-page-select">página</label>
      <select id="ed-page-select"></select>
      <div class="ed-sep"></div>
      <button id="ed-undo-btn" title="Desfazer (Ctrl+Z)">↩ desfazer</button>
      <button id="ed-redo-btn" title="Refazer (Ctrl+Y)">↪ refazer</button>
      <div class="ed-sep"></div>
      <button id="ed-zoom-out-btn" title="Reduzir zoom">−</button>
      <span id="ed-zoom-display">100%</span>
      <button id="ed-zoom-in-btn" title="Aumentar zoom">+</button>
      <div class="ed-sep"></div>
      <button id="ed-export-btn" title="Exportar PDF">⬇️ exportar pdf</button>
    </div>
    
    <div id="ed-canvas-wrap">
      <div id="ed-drop-hint">
        <span>📄</span>
        <p>carregue um PDF para começar a editar</p>
        <small>clique em "carregar pdf" na barra acima</small>
      </div>
      <div id="ed-pages-container"></div>
    </div>`;
    adminApp.appendChild(panel);
  }
  ensureTabShell();

  // ── Modais e pickers externos (fora de #admin-app) injetados por editor-pdf.js ──
  function ensureExternalModals() {
    if (document.getElementById('ed-export-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div id="ed-export-modal">
  <div id="ed-export-modal-box">
    <div class="ed-modal-title">exportar pdf</div>
    <input type="text" id="ed-export-filename" placeholder="nome do ficheiro" value="editado">
    <div id="ed-folder-row">
      <div id="ed-folder-display">pasta de transferências (padrão)</div>
      <button id="ed-folder-pick-btn">📁 escolher pasta</button>
    </div>
    <div id="ed-export-hint">
      Selecione uma pasta para guardar diretamente, ou clique em <span>guardar</span> para descarregar para a pasta padrão do browser.<br>
      💡 Recomendado: guardar em <span>Wakzome Pessoal — OneDrive Pessoal</span>
    </div>
    <div class="ed-modal-btns">
      <button class="ed-modal-btn" id="ed-export-cancel">cancelar</button>
      <button class="ed-modal-btn primary" id="ed-export-confirm">⬇️ guardar</button>
    </div>
  </div>
</div>

<!-- ══ EDITOR PDF: PICKERS E MODAIS ════════════════════════════ -->
<div id="ed-shape-picker"></div>
<div id="ed-stamp-picker"></div>

<div id="ed-pages-modal">
  <div id="ed-pages-modal-box">
    <div id="ed-pages-modal-title">
      gerir páginas
      <button id="ed-pages-modal-close">✕</button>
    </div>
    <div id="ed-pages-modal-list"></div>
  </div>
</div>`);
  }
  ensureExternalModals();

  // ── Cartão do menu principal (dashboard admin) injetado por editor-pdf.js ──
  // Migrado para dentro do grupo "Utilitários" (#utilitarios-sub-grid, shell
  // estático em index.html junto com Agenda/Rótulos) — deixa de ir para
  // #adm-module-grid e deixa de se ancorar a "faturas" (relação que já não existe).
  function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-module="editor"]')) return;
    var grid = document.getElementById('utilitarios-sub-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-module', 'editor');
    card.innerHTML = `
        <div class="adm-mod-name">EDITOR DE PDF</div>
        <div class="adm-mod-desc">edição e anotação de documentos</div>
      `;
    grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.openModule === 'function') window.openModule('editor');
    });
  }
  ensureModuleCard();

  // ── 1. STATE ────────────────────────────────────────────────
  let edPdfDoc      = null;
  let edPdfBytes    = null;
  let edPageCount   = 0;
  let edPageSizes   = [];  // [{width,height}] em PDF pts por página
  let edElements    = [];  // { pageIndex, el, type, ... }
  let edSelectedEl  = null;
  let edEditingEl   = null;
  let edScale       = 1.5;

  // Formatação de texto
  let edBold        = false;
  let edItalic      = false;
  let edUnderlineOn = false;
  let edFontFamily  = 'Helvetica';

  // Ferramenta ativa: 'select' | 'draw' | 'highlight' | 'strikethrough' | 'underline-annot' | 'sticky'
  let edActiveTool  = 'select';
  let edShapeMode   = 'rect'; // rect | ellipse | line | arrow

  // Desenho livre
  let edDrawColor   = '#000000';
  let edDrawSize    = 2;
  let edDrawPaths   = {};   // { pageIndex: [{color,size,points:[{x,y}]}] } — coords normalizadas 0-1
  let edIsDrawing   = false;
  let edCurrentPath = null;
  let edDrawCtxMap  = {};   // { pageIndex: {canvas, ctx} }

  // Modo nativo
  let edNativeEditMode = false;

  // Histórico
  let edHistory    = [];
  let edHistoryIdx = -1;

  // ── 2. DOM REFS ─────────────────────────────────────────────
  const edFileInput      = document.getElementById('ed-file-input');
  const edImgInput       = document.getElementById('ed-img-input');
  const edPagesContainer = document.getElementById('ed-pages-container');
  const edDropHint       = document.getElementById('ed-drop-hint');
  const edPageSelect     = document.getElementById('ed-page-select');
  const edFontSize       = document.getElementById('ed-font-size');
  const edFontColor      = document.getElementById('ed-font-color');
  const edExportBtn      = document.getElementById('ed-export-btn');
  const edAddTextBtn     = document.getElementById('ed-add-text-btn');
  const edUndoBtn        = document.getElementById('ed-undo-btn');
  const edRedoBtn        = document.getElementById('ed-redo-btn');
  const edEditNativeBtn  = document.getElementById('ed-edit-native-btn');
  // Novos
  const edBoldBtn        = document.getElementById('ed-bold-btn');
  const edItalicBtn      = document.getElementById('ed-italic-btn');
  const edUnderlineBtn   = document.getElementById('ed-underline-btn');
  const edFontFamilyEl   = document.getElementById('ed-font-family');
  const edDrawBtn        = document.getElementById('ed-draw-btn');
  const edDrawColorEl    = document.getElementById('ed-draw-color');
  const edDrawSizeEl     = document.getElementById('ed-draw-size');
  const edShapeBtn       = document.getElementById('ed-shape-btn');
  const edHighlightBtn   = document.getElementById('ed-highlight-btn');
  const edStickyBtn      = document.getElementById('ed-sticky-btn');
  const edStampBtn       = document.getElementById('ed-stamp-btn');
  const edPagesBtn       = document.getElementById('ed-pages-btn');
  const edConcatInput    = document.getElementById('ed-concat-input');
  const edZoomOutBtn     = document.getElementById('ed-zoom-out-btn');
  const edZoomInBtn      = document.getElementById('ed-zoom-in-btn');
  const edZoomDisplay    = document.getElementById('ed-zoom-display');
  const edShapePicker    = document.getElementById('ed-shape-picker');
  const edStampPicker    = document.getElementById('ed-stamp-picker');
  const edPagesModal     = document.getElementById('ed-pages-modal');
  const edPagesModalList = document.getElementById('ed-pages-modal-list');
  // Export modal
  const edExportModal    = document.getElementById('ed-export-modal');
  const edExportFilename = document.getElementById('ed-export-filename');
  const edExportCancel   = document.getElementById('ed-export-cancel');
  const edExportConfirm  = document.getElementById('ed-export-confirm');
  const edFolderPickBtn  = document.getElementById('ed-folder-pick-btn');
  const edFolderDisplay  = document.getElementById('ed-folder-display');
  const edExportHint     = document.getElementById('ed-export-hint');

  edFontColor.value = '#000000';
  let edChosenDirHandle = null;

  // ── 3. HISTÓRICO ────────────────────────────────────────────
  function edPushHistory(entry) {
    edHistory = edHistory.slice(0, edHistoryIdx + 1);
    edHistory.push(entry);
    edHistoryIdx = edHistory.length - 1;
    edUpdateUndoRedo();
  }
  function edUpdateUndoRedo() {
    edUndoBtn.disabled = edHistoryIdx < 0;
    edRedoBtn.disabled = edHistoryIdx >= edHistory.length - 1;
  }
  function edUndo() {
    if (edHistoryIdx < 0) return;
    const entry = edHistory[edHistoryIdx--];
    edApplyInverse(entry);
    edUpdateUndoRedo();
  }
  function edRedo() {
    if (edHistoryIdx >= edHistory.length - 1) return;
    const entry = edHistory[++edHistoryIdx];
    edApplyForward(entry);
    edUpdateUndoRedo();
  }
  function edApplyInverse(entry) {
    if (entry.type === 'add') {
      entry.el.remove();
      edElements = edElements.filter(r => r.el !== entry.el);
      if (edSelectedEl === entry.el) edSelectedEl = null;
    } else if (entry.type === 'delete') {
      const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (entry.record.pageIndex + 1) + '"]');
      if (wrap) wrap.appendChild(entry.record.el);
      edElements.push(entry.record);
    } else if (entry.type === 'move') {
      entry.el.style.left = entry.prevLeft;
      entry.el.style.top  = entry.prevTop;
    } else if (entry.type === 'resize') {
      entry.el.style.left   = entry.prevLeft;
      entry.el.style.top    = entry.prevTop;
      entry.el.style.width  = entry.prevW;
      entry.el.style.height = entry.prevH;
    } else if (entry.type === 'text') {
      const ta = entry.ta || entry.el.querySelector('textarea');
      if (ta) ta.value = entry.prevText;
    } else if (entry.type === 'draw') {
      const paths = edDrawPaths[entry.pageIndex];
      if (paths && paths.length) paths.pop();
      edRedrawCanvas(entry.pageIndex);
    }
  }
  function edApplyForward(entry) {
    if (entry.type === 'add') {
      const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (entry.record.pageIndex + 1) + '"]');
      if (wrap) wrap.appendChild(entry.record.el);
      edElements.push(entry.record);
    } else if (entry.type === 'delete') {
      entry.record.el.remove();
      edElements = edElements.filter(r => r.el !== entry.record.el);
    } else if (entry.type === 'move') {
      entry.el.style.left = entry.nextLeft;
      entry.el.style.top  = entry.nextTop;
    } else if (entry.type === 'resize') {
      entry.el.style.left   = entry.nextLeft;
      entry.el.style.top    = entry.nextTop;
      entry.el.style.width  = entry.nextW;
      entry.el.style.height = entry.nextH;
    } else if (entry.type === 'text') {
      const ta = entry.ta || entry.el.querySelector('textarea');
      if (ta) ta.value = entry.nextText;
    } else if (entry.type === 'draw') {
      if (!edDrawPaths[entry.pageIndex]) edDrawPaths[entry.pageIndex] = [];
      edDrawPaths[entry.pageIndex].push(entry.path);
      edRedrawCanvas(entry.pageIndex);
    }
  }
  edUndoBtn.addEventListener('click', edUndo);
  edRedoBtn.addEventListener('click', edRedo);
  edUpdateUndoRedo();

  // ── 4. CARREGAR PDF ─────────────────────────────────────────
  edFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) edLoadFile(file);
    e.target.value = '';
  });

  async function edLoadFile(file) {
    edDropHint.style.display = 'none';
    edPagesContainer.innerHTML = '<div class="ed-loading-msg">a carregar…</div>';
    try {
      edPdfBytes      = await file.arrayBuffer();
      edElements      = [];
      edSelectedEl    = null;
      edEditingEl     = null;
      edHistory       = [];
      edHistoryIdx    = -1;
      edDrawPaths     = {};
      edDrawCtxMap    = {};
      edPageSizes     = [];
      edNativeEditMode = false;
      edEditNativeBtn.classList.remove('active');
      edEditNativeBtn.textContent = '🔤 editar texto original';
      edSetTool('select');
      edUpdateUndoRedo();

      edPdfDoc    = await pdfjsLib.getDocument({ data: edPdfBytes.slice(0) }).promise;
      edPageCount = edPdfDoc.numPages;

      edPageSelect.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i + ' / ' + edPageCount;
        edPageSelect.appendChild(opt);
      }
      edPagesContainer.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);

      edExportBtn.disabled = false;
      if (edPagesBtn) edPagesBtn.disabled = false;
      edUpdateZoomDisplay();
    } catch (err) {
      edPagesContainer.innerHTML = '<div class="ed-error-msg">erro ao carregar PDF</div>';
      console.error(err);
    }
  }

  // ── 5. RENDERIZAR PÁGINA ────────────────────────────────────
  async function edRenderPage(pageNum) {
    const page     = await edPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: edScale });

    // Guardar tamanho PDF desta página
    const pdfVP = page.getViewport({ scale: 1 });
    edPageSizes[pageNum - 1] = { width: pdfVP.width, height: pdfVP.height };

    const wrap = document.createElement('div');
    wrap.className    = 'ed-page';
    wrap.dataset.page = pageNum;
    wrap.style.width  = viewport.width  + 'px';
    wrap.style.height = viewport.height + 'px';

    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    wrap.appendChild(canvas);

    // Canvas de desenho livre (overlay)
    const drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'ed-draw-canvas';
    drawCanvas.width     = viewport.width;
    drawCanvas.height    = viewport.height;
    wrap.appendChild(drawCanvas);
    edDrawCtxMap[pageNum - 1] = { canvas: drawCanvas, ctx: drawCanvas.getContext('2d') };
    edRedrawCanvas(pageNum - 1);
    edBindDrawEvents(drawCanvas, wrap, pageNum - 1);

    edPagesContainer.appendChild(wrap);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Texto original do PDF
    await edExtractNativeText(page, wrap, pageNum - 1, viewport);

    // Recolocar elementos existentes desta página
    edElements.filter(r => r.pageIndex === pageNum - 1 && r.type !== 'native-text').forEach(r => {
      wrap.appendChild(r.el);
    });

    // Clicar em área vazia → deselecionar
    wrap.addEventListener('mousedown', function (e) {
      if (edActiveTool === 'sticky' && (e.target === wrap || e.target === canvas)) {
        edCreateStickyEl(wrap, pageNum - 1, e.offsetX - 10, e.offsetY - 10);
        return;
      }
      if (e.target === wrap || e.target === canvas) {
        edStopEditing(); edDeselect();
      }
    });
  }

  edPageSelect.addEventListener('change', function () {
    const pages  = edPagesContainer.querySelectorAll('.ed-page');
    const target = pages[parseInt(this.value) - 1];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ── 6. CANVAS DE DESENHO ────────────────────────────────────
  function edRedrawCanvas(pageIndex) {
    const entry = edDrawCtxMap[pageIndex];
    if (!entry) return;
    const { canvas, ctx } = entry;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const paths = edDrawPaths[pageIndex] || [];
    paths.forEach(path => {
      if (!path.points || path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth   = path.size;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      const p0 = path.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
      path.points.slice(1).forEach(pt => ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height));
      ctx.stroke();
    });
  }

  function edBindDrawEvents(drawCanvas, wrap, pageIndex) {
    drawCanvas.addEventListener('mousedown', function (e) {
      if (edActiveTool !== 'draw') return;
      e.stopPropagation();
      edIsDrawing   = true;
      const rect    = drawCanvas.getBoundingClientRect();
      const normX   = (e.clientX - rect.left)  / drawCanvas.width;
      const normY   = (e.clientY - rect.top)    / drawCanvas.height;
      edCurrentPath = { pageIndex, color: edDrawColor, size: edDrawSize, points: [{ x: normX, y: normY }] };
    });
    document.addEventListener('mousemove', function (e) {
      if (!edIsDrawing || !edCurrentPath || edCurrentPath.pageIndex !== pageIndex) return;
      const rect  = drawCanvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left)  / drawCanvas.width;
      const normY = (e.clientY - rect.top)    / drawCanvas.height;
      edCurrentPath.points.push({ x: normX, y: normY });
      // Desenho em tempo real
      const entry = edDrawCtxMap[pageIndex];
      if (entry) {
        edRedrawCanvas(pageIndex);
        const { canvas, ctx } = entry;
        ctx.beginPath();
        ctx.strokeStyle = edCurrentPath.color;
        ctx.lineWidth   = edCurrentPath.size;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        const p0 = edCurrentPath.points[0];
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
        edCurrentPath.points.slice(1).forEach(pt => ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height));
        ctx.stroke();
      }
    });
    document.addEventListener('mouseup', function () {
      if (!edIsDrawing || !edCurrentPath || edCurrentPath.pageIndex !== pageIndex) return;
      edIsDrawing = false;
      if (edCurrentPath.points.length > 1) {
        if (!edDrawPaths[pageIndex]) edDrawPaths[pageIndex] = [];
        const path = Object.assign({}, edCurrentPath);
        edDrawPaths[pageIndex].push(path);
        edPushHistory({ type: 'draw', pageIndex, path });
        edRedrawCanvas(pageIndex);
      }
      edCurrentPath = null;
    });
  }

  // ── 7. CONTROLO DE FERRAMENTA ───────────────────────────────
  function edSetTool(tool) {
    edActiveTool = tool;
    // Atualizar botões
    [edDrawBtn, edHighlightBtn, edStickyBtn].forEach(btn => btn && btn.classList.remove('active'));
    // Canvas de desenho: pointer-events
    document.querySelectorAll('.ed-draw-canvas').forEach(c => {
      c.classList.toggle('ed-draw-active', tool === 'draw');
    });
    // Overlay de anotação
    document.querySelectorAll('.ed-annot-overlay').forEach(o => o.remove());
    if (tool === 'highlight' || tool === 'strikethrough' || tool === 'underline-annot') {
      edHighlightBtn && edHighlightBtn.classList.add('active');
      edPagesContainer.querySelectorAll('.ed-page').forEach((wrap, idx) => {
        edAddAnnotOverlay(wrap, idx);
      });
    } else if (tool === 'draw') {
      edDrawBtn && edDrawBtn.classList.add('active');
      edDeselect(); edStopEditing();
    } else if (tool === 'sticky') {
      edStickyBtn && edStickyBtn.classList.add('active');
    }
  }

  // ── 8. TEXTO NATIVO ─────────────────────────────────────────
  edEditNativeBtn.addEventListener('click', function () {
    edNativeEditMode = !edNativeEditMode;
    edEditNativeBtn.classList.toggle('active', edNativeEditMode);
    edEditNativeBtn.textContent = edNativeEditMode ? '🔤 sair de edição' : '🔤 editar texto original';
    edElements.forEach(r => {
      if (r.type !== 'native-text') return;
      r.el.classList.toggle('editable-mode', edNativeEditMode);
      if (!edNativeEditMode) {
        if (edEditingEl === r.el) edStopEditing();
        if (edSelectedEl === r.el) edDeselect();
      }
    });
  });

  async function edExtractNativeText(page, wrap, pageIndex, viewport) {
    let textContent;
    try { textContent = await page.getTextContent(); } catch (e) { return; }
    const items = (textContent.items || []).filter(it => it.str && it.str.trim());
    if (!items.length) return;

    const groups = [];
    items.forEach(function (item) {
      var pt;
      try { pt = viewport.convertToViewportPoint(item.transform[4], item.transform[5]); } catch (e) { return; }
      var vx = pt[0], vy = pt[1];
      var fontPx = Math.abs(item.transform[0]) * edScale;
      if (fontPx < 1) fontPx = 12 * edScale / 72;
      var group = null;
      for (var g = 0; g < groups.length; g++) {
        if (Math.abs(groups[g].baseVY - vy) < fontPx * 0.7) { group = groups[g]; break; }
      }
      if (!group) { group = { baseVY: vy, fontPx: fontPx, items: [] }; groups.push(group); }
      group.items.push({ item: item, vx: vx, vy: vy, fontPx: fontPx });
    });
    groups.sort((a, b) => a.baseVY - b.baseVY);
    groups.forEach(g => g.items.sort((a, b) => a.vx - b.vx));

    groups.forEach(function (group) {
      var text = group.items.map(i => i.item.str).join('');
      if (!text.trim()) return;
      var first   = group.items[0];
      var fontPx  = first.fontPx;
      var vx      = first.vx;
      var elTop   = group.baseVY - fontPx * 1.15;
      var totalW  = group.items.reduce((s, i) => s + (i.item.width || 0) * edScale, 0);
      if (totalW < fontPx * 0.8) totalW = fontPx * text.length * 0.6;
      totalW = Math.max(totalW, fontPx * 2);
      var pdfX        = first.item.transform[4];
      var pdfY        = first.item.transform[5];
      var pdfFontSize = Math.abs(first.item.transform[0]);
      var pdfTotalW   = group.items.reduce((s, i) => s + (i.item.width || 0), 0);

      var el = document.createElement('div');
      el.className = 'ed-element ed-text-el ed-native-text';
      el.style.left  = vx + 'px';
      el.style.top   = elTop + 'px';
      el.style.width = (totalW + 6) + 'px';

      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = [
        'display:block', 'width:100%',
        'min-height:' + Math.ceil(fontPx * 1.3) + 'px',
        'padding:0 2px', 'box-sizing:border-box',
        'border:none', 'outline:none',
        'background:transparent', 'resize:none', 'overflow:hidden',
        'font-family:Arial,Helvetica,sans-serif',
        'font-size:' + Math.round(fontPx) + 'px',
        'color:transparent',
        'line-height:1.3',
        'writing-mode:horizontal-tb', 'direction:ltr',
        'pointer-events:none', 'cursor:text'
      ].join(';');
      ta.rows = 1; ta.spellcheck = false;
      el.appendChild(ta);

      function autoResize() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(Math.ceil(fontPx * 1.3), ta.scrollHeight) + 'px';
        el.style.height = ta.offsetHeight + 'px';
      }
      autoResize();
      ta.addEventListener('input', autoResize);

      // Clique simples = selecionar (activa edição nativa automaticamente)
      el.addEventListener('mousedown', function (e) {
        if (edActiveTool !== 'select') return;
        if (e.target.classList.contains('ed-del-btn')) return;
        if (el.classList.contains('editing')) return;
        e.stopPropagation();
        // Auto-ativar modo nativo ao clicar diretamente
        if (!edNativeEditMode) {
          edNativeEditMode = true;
          edEditNativeBtn.classList.add('active');
          edEditNativeBtn.textContent = '🔤 sair de edição';
          edElements.forEach(r => { if (r.type === 'native-text') r.el.classList.add('editable-mode'); });
        }
        edStopEditing(); edSelect(el);
      });
      el.addEventListener('dblclick', function (e) {
        if (edActiveTool !== 'select') return;
        e.stopPropagation();
        if (!edNativeEditMode) {
          edNativeEditMode = true;
          edEditNativeBtn.classList.add('active');
          edEditNativeBtn.textContent = '🔤 sair de edição';
          edElements.forEach(r => { if (r.type === 'native-text') r.el.classList.add('editable-mode'); });
        }
        edEnterEditing(el);
      });

      if (edNativeEditMode) el.classList.add('editable-mode');
      wrap.appendChild(el);

      var record = {
        pageIndex: pageIndex, el: el, ta: ta, type: 'native-text',
        originalText: text, pdfX: pdfX, pdfY: pdfY,
        pdfFontSize: pdfFontSize, pdfTotalW: pdfTotalW,
        viewX: vx, viewY: elTop
      };
      edElements.push(record);
    });
  }

  // ── 9. ADICIONAR TEXTO ──────────────────────────────────────
  edAddTextBtn.addEventListener('click', function () {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    edStopEditing();
    const record = edCreateTextEl(wrap, pageNum - 1, 40, 40, '');
    edPushHistory({ type: 'add', el: record.el, record });
  });

  function edCreateTextEl(wrap, pageIndex, x, y, text, opts) {
    opts = opts || {};
    const fontSize   = opts.fontSize   || parseInt(edFontSize.value) || 14;
    const color      = opts.color      || edFontColor.value          || '#000000';
    const bold       = opts.bold       !== undefined ? opts.bold       : edBold;
    const italic     = opts.italic     !== undefined ? opts.italic     : edItalic;
    const underline  = opts.underline  !== undefined ? opts.underline  : edUnderlineOn;
    const fontFamily = opts.fontFamily || edFontFamily                 || 'Helvetica';

    const el = document.createElement('div');
    el.className   = 'ed-element ed-text-el';
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = '160px';

    const ta = document.createElement('textarea');
    ta.value = text !== undefined ? text : '';
    ta.style.cssText = [
      'display:block', 'width:100%', 'min-height:28px',
      'padding:4px 6px', 'box-sizing:border-box',
      'border:none', 'outline:none',
      'background:transparent', 'resize:none', 'overflow:hidden',
      'font-family:' + edPdfFontToCSS(fontFamily),
      'font-size:' + fontSize + 'px',
      'font-weight:' + (bold ? 'bold' : 'normal'),
      'font-style:' + (italic ? 'italic' : 'normal'),
      'text-decoration:' + (underline ? 'underline' : 'none'),
      'line-height:1.5',
      'writing-mode:horizontal-tb', 'direction:ltr',
      'pointer-events:none', 'cursor:move'
    ].join(';');
    // Usar CSS custom property para cor (bypassa !important global)
    ta.style.setProperty('--ed-txt-color', color);
    ta.rows = 1; ta.spellcheck = false;
    el.appendChild(ta);

    function autoResize() {
      ta.style.height = 'auto';
      ta.style.height = Math.max(28, ta.scrollHeight) + 'px';
      el.style.height = ta.offsetHeight + 'px';
    }
    ta.addEventListener('input', autoResize);
    setTimeout(autoResize, 0);

    edAddHandles(el);
    edMakeDraggable(el, wrap);

    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (el.classList.contains('editing')) return;
      e.stopPropagation();
      edStopEditing(); edSelect(el);
    });
    el.addEventListener('dblclick', function (e) {
      e.stopPropagation(); edEnterEditing(el);
    });

    wrap.appendChild(el);
    const record = { pageIndex, el, ta, type: 'text', bold, italic, underline, fontFamily, textColor: color };
    edElements.push(record);
    edSelect(el);
    setTimeout(() => { edEnterEditing(el); autoResize(); }, 40);
    return record;
  }

  // ── 10. EDIÇÃO DE TEXTO ─────────────────────────────────────
  function edEnterEditing(el) {
    if (el.classList.contains('editing')) return;
    edStopEditing(); edSelect(el);
    el.classList.add('editing');
    edEditingEl = el;
    const ta = el.querySelector('textarea');
    if (!ta) return;
    ta.dataset.textBefore  = ta.value;
    // pointer-events/cursor/background do modo edição: cobertos por
    // .ed-text-el.editing / .ed-native-text.editing (estilo.css, !important)
    if (el.classList.contains('ed-sticky-el'))   ta.style.setProperty('--ed-txt-color', '#333');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function edStopEditing() {
    if (!edEditingEl) return;
    const el = edEditingEl;
    edEditingEl = null;
    el.classList.remove('editing');
    const ta = el.querySelector('textarea');
    if (ta) {
      // estado "não editando" (pointer-events/cursor/background): coberto
      // pela regra base .ed-text-el textarea (estilo.css)
      const before = ta.dataset.textBefore || '';
      const after  = ta.value;
      if (before !== after) edPushHistory({ type: 'text', el, ta, prevText: before, nextText: after });
      if (el.classList.contains('ed-native-text')) {
        const record = edElements.find(r => r.el === el);
        el.classList.toggle('modified', !!(record && after !== record.originalText));
        if (!el.classList.contains('modified')) ta.style.color = 'transparent';
      }
      delete ta.dataset.textBefore;
    }
  }

  // ── 11. FORMATAÇÃO DE TEXTO ─────────────────────────────────
  if (edBoldBtn) edBoldBtn.addEventListener('click', function () {
    edBold = !edBold;
    edBoldBtn.classList.toggle('ed-fmt-active', edBold);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontWeight = edBold ? 'bold' : 'normal';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.bold = edBold;
    }
  });
  if (edItalicBtn) edItalicBtn.addEventListener('click', function () {
    edItalic = !edItalic;
    edItalicBtn.classList.toggle('ed-fmt-active', edItalic);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontStyle = edItalic ? 'italic' : 'normal';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.italic = edItalic;
    }
  });
  if (edUnderlineBtn) edUnderlineBtn.addEventListener('click', function () {
    edUnderlineOn = !edUnderlineOn;
    edUnderlineBtn.classList.toggle('ed-fmt-active', edUnderlineOn);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.textDecoration = edUnderlineOn ? 'underline' : 'none';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.underline = edUnderlineOn;
    }
  });
  if (edFontFamilyEl) edFontFamilyEl.addEventListener('change', function () {
    edFontFamily = this.value;
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontFamily = edPdfFontToCSS(this.value);
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.fontFamily = this.value;
    }
  });

  // ── 12. CONTROLOS FONTE ─────────────────────────────────────
  edFontSize.addEventListener('input', function () {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.setProperty('--ed-font-sz', this.value + 'px');
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.fontSize = parseInt(this.value);
    }
  });
  edFontColor.addEventListener('input', function () {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el') && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.setProperty('--ed-txt-color', this.value);
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.textColor = this.value;
    }
  });

  // ── 13. ADICIONAR IMAGEM ────────────────────────────────────
  edImgInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const pageNum = parseInt(edPageSelect.value) || 1;
      const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
      if (!wrap) return;
      edStopEditing();
      const record = edCreateImageEl(wrap, pageNum - 1, 60, 60, ev.target.result);
      edPushHistory({ type: 'add', el: record.el, record });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  function edCreateImageEl(wrap, pageIndex, x, y, src, w, h) {
    const el = document.createElement('div');
    el.className    = 'ed-element ed-img-el';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = (w || 160) + 'px';
    el.style.height = (h || 120) + 'px';
    const img = document.createElement('img');
    img.src = src;
    el.appendChild(img);
    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    wrap.appendChild(el);
    const record = { pageIndex, el, type: 'image', src };
    edElements.push(record);
    edSelect(el);
    return record;
  }

  // ── 14. FORMAS ──────────────────────────────────────────────
  const SHAPE_DEFS = [
    { type: 'rect',    label: '⬜ retângulo' },
    { type: 'ellipse', label: '⭕ elipse' },
    { type: 'line',    label: '╱ linha' },
    { type: 'arrow',   label: '→ seta' },
  ];
  if (edShapePicker) {
    SHAPE_DEFS.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent  = s.label;
      btn.dataset.type = s.type;
      btn.addEventListener('click', function () {
        edShapeMode = s.type;
        edCloseAllPickers();
        edInsertShape(s.type);
      });
      edShapePicker.appendChild(btn);
    });
  }
  if (edShapeBtn) edShapeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    const show = !edShapePicker.classList.contains('show');
    edCloseAllPickers();
    if (show) {
      const rect = edShapeBtn.getBoundingClientRect();
      edShapePicker.style.top  = (rect.bottom + 4) + 'px';
      edShapePicker.style.left = rect.left + 'px';
      edShapePicker.classList.add('show');
    }
  });

  function edInsertShape(shapeType) {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    const record = edCreateShapeEl(wrap, pageNum - 1, 60, 80, 160, 90, shapeType);
    edPushHistory({ type: 'add', el: record.el, record });
  }

  function edCreateShapeEl(wrap, pageIndex, x, y, w, h, shapeType, opts) {
    opts = opts || {};
    const strokeColor = opts.strokeColor || edFontColor.value || '#000000';
    const fillColor   = opts.fillColor   || 'none';
    const strokeWidth = opts.strokeWidth || 2;

    const el = document.createElement('div');
    el.className    = 'ed-element ed-shape-el';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.appendChild(svg);

    function refreshSVG() {
      const ew = el.offsetWidth  || w;
      const eh = el.offsetHeight || h;
      edBuildShapeSVG(svg, shapeType, ew, eh, strokeColor, fillColor, strokeWidth);
    }
    setTimeout(refreshSVG, 0);
    new ResizeObserver(refreshSVG).observe(el);

    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    wrap.appendChild(el);
    const record = { pageIndex, el, svg, type: 'shape', shapeType, strokeColor, fillColor, strokeWidth };
    edElements.push(record);
    edSelect(el);
    return record;
  }

  function edBuildShapeSVG(svg, shapeType, w, h, strokeColor, fillColor, sw) {
    svg.innerHTML = '';
    const ns  = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    let shape;
    if (shapeType === 'rect') {
      shape = document.createElementNS(ns, 'rect');
      shape.setAttribute('x', sw / 2); shape.setAttribute('y', sw / 2);
      shape.setAttribute('width', Math.max(1, w - sw)); shape.setAttribute('height', Math.max(1, h - sw));
    } else if (shapeType === 'ellipse') {
      shape = document.createElementNS(ns, 'ellipse');
      shape.setAttribute('cx', w / 2); shape.setAttribute('cy', h / 2);
      shape.setAttribute('rx', Math.max(1, w / 2 - sw / 2)); shape.setAttribute('ry', Math.max(1, h / 2 - sw / 2));
    } else if (shapeType === 'line') {
      shape = document.createElementNS(ns, 'line');
      shape.setAttribute('x1', 0); shape.setAttribute('y1', h);
      shape.setAttribute('x2', w); shape.setAttribute('y2', 0);
    } else if (shapeType === 'arrow') {
      const mid = 'arr' + Date.now();
      const defs = document.createElementNS(ns, 'defs');
      const mk   = document.createElementNS(ns, 'marker');
      mk.setAttribute('id', mid); mk.setAttribute('markerWidth', '10'); mk.setAttribute('markerHeight', '7');
      mk.setAttribute('refX', '9'); mk.setAttribute('refY', '3.5'); mk.setAttribute('orient', 'auto');
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', '0 0, 10 3.5, 0 7'); poly.setAttribute('fill', strokeColor);
      mk.appendChild(poly); defs.appendChild(mk); svg.appendChild(defs);
      shape = document.createElementNS(ns, 'line');
      shape.setAttribute('x1', 0); shape.setAttribute('y1', h);
      shape.setAttribute('x2', w); shape.setAttribute('y2', 0);
      shape.setAttribute('marker-end', 'url(#' + mid + ')');
    }
    if (shape) {
      shape.setAttribute('stroke', strokeColor);
      shape.setAttribute('stroke-width', sw);
      shape.setAttribute('fill', (shapeType === 'rect' || shapeType === 'ellipse') ? fillColor : 'none');
      svg.appendChild(shape);
    }
  }

  // ── 15. FERRAMENTA DESENHO ──────────────────────────────────
  if (edDrawBtn) edDrawBtn.addEventListener('click', function () {
    edSetTool(edActiveTool === 'draw' ? 'select' : 'draw');
  });
  if (edDrawColorEl) edDrawColorEl.addEventListener('input', function () { edDrawColor = this.value; });
  if (edDrawSizeEl)  edDrawSizeEl.addEventListener('input',  function () { edDrawSize  = Math.max(1, parseInt(this.value) || 2); });

  // ── 16. ANOTAÇÕES (HIGHLIGHT / RISCAR / SUBLINHAR) ──────────
  if (edHighlightBtn) edHighlightBtn.addEventListener('click', function () {
    const isActive = edActiveTool === 'highlight';
    edSetTool(isActive ? 'select' : 'highlight');
  });

  function edAddAnnotOverlay(wrap, pageIndex) {
    const ov = document.createElement('div');
    ov.className = 'ed-annot-overlay';
    let startX, startY, annotEl;
    ov.addEventListener('mousedown', function (e) {
      if (edActiveTool !== 'highlight' && edActiveTool !== 'strikethrough' && edActiveTool !== 'underline-annot') return;
      e.stopPropagation();
      const rect = ov.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      annotEl = document.createElement('div');
      annotEl.className = 'ed-element ed-annot-el annot-' + edActiveTool;
      annotEl.style.left   = startX + 'px';
      annotEl.style.top    = startY + 'px';
      annotEl.style.width  = '1px';
      annotEl.style.height = '20px';
      wrap.appendChild(annotEl);

      function onMove(ev) {
        const cx  = ev.clientX - rect.left;
        const cy  = ev.clientY - rect.top;
        const x   = Math.min(startX, cx);
        const wid = Math.abs(cx - startX);
        const hei = edActiveTool === 'highlight' ? Math.max(16, Math.abs(cy - startY)) : 18;
        annotEl.style.left   = x + 'px';
        annotEl.style.width  = wid + 'px';
        annotEl.style.height = hei + 'px';
        if (edActiveTool === 'strikethrough' || edActiveTool === 'underline-annot') {
          annotEl.style.top = startY + 'px';
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (parseFloat(annotEl.style.width) < 10) { annotEl.remove(); return; }
        edMakeDraggable(annotEl, wrap);
        edAddHandles(annotEl);
        annotEl.addEventListener('mousedown', function (ev) {
          ev.stopPropagation(); edStopEditing(); edSelect(annotEl);
        });
        const record = { pageIndex, el: annotEl, type: 'annotation', annotType: edActiveTool };
        edElements.push(record);
        edPushHistory({ type: 'add', el: annotEl, record });
        edSelect(annotEl);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
    wrap.appendChild(ov);
  }

  // ── 17. NOTAS ADESIVAS ──────────────────────────────────────
  if (edStickyBtn) edStickyBtn.addEventListener('click', function () {
    edSetTool(edActiveTool === 'sticky' ? 'select' : 'sticky');
  });

  function edCreateStickyEl(wrap, pageIndex, x, y) {
    const el = document.createElement('div');
    el.className  = 'ed-element ed-sticky-el';
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = '160px';

    const header = document.createElement('div');
    header.className   = 'ed-sticky-header';
    header.textContent = '📌 nota';
    el.appendChild(header);

    const ta = document.createElement('textarea');
    ta.placeholder     = 'Escreva aqui…';
    ta.style.setProperty('--ed-txt-color', '#333');
    ta.rows = 4; ta.spellcheck = false;
    el.appendChild(ta);

    function autoResize() {
      ta.style.height = 'auto';
      ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
    }
    ta.addEventListener('input', autoResize);

    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (el.classList.contains('editing')) return;
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    el.addEventListener('dblclick', function (e) { e.stopPropagation(); edEnterEditing(el); });

    wrap.appendChild(el);
    const record = { pageIndex, el, ta, type: 'sticky' };
    edElements.push(record);
    edSetTool('select');
    edSelect(el);
    setTimeout(() => edEnterEditing(el), 40);
    edPushHistory({ type: 'add', el, record });
    return record;
  }

  // ── 18. CARIMBOS ────────────────────────────────────────────
  const STAMPS = [
    { text: 'APROVADO',     color: '#2a8a2a' },
    { text: 'REVISTO',      color: '#0055cc' },
    { text: 'RASCUNHO',     color: '#888888' },
    { text: 'CONFIDENCIAL', color: '#c03000' },
    { text: 'ARQUIVADO',    color: '#663399' },
  ];
  if (edStampPicker) {
    STAMPS.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent       = s.text;
      btn.style.color       = s.color;
      btn.style.borderColor = s.color;
      btn.addEventListener('click', function () {
        edCloseAllPickers(); edInsertStamp(s.text, s.color);
      });
      edStampPicker.appendChild(btn);
    });
  }
  if (edStampBtn) edStampBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    const show = !edStampPicker.classList.contains('show');
    edCloseAllPickers();
    if (show) {
      const rect = edStampBtn.getBoundingClientRect();
      edStampPicker.style.top  = (rect.bottom + 4) + 'px';
      edStampPicker.style.left = rect.left + 'px';
      edStampPicker.classList.add('show');
    }
  });

  function edInsertStamp(stampText, color) {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'ed-element ed-stamp-el';
    el.style.borderColor = color;
    el.style.color       = color;
    el.textContent = stampText;
    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); edStopEditing(); edSelect(el); });
    wrap.appendChild(el);
    const record = { pageIndex: pageNum - 1, el, type: 'stamp', stampText, color };
    edElements.push(record);
    edSelect(el);
    edPushHistory({ type: 'add', el, record });
    return record;
  }

  function edCloseAllPickers() {
    edShapePicker && edShapePicker.classList.remove('show');
    edStampPicker && edStampPicker.classList.remove('show');
  }
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('#ed-shape-picker') && !e.target.closest('#ed-shape-btn')) {
      edShapePicker && edShapePicker.classList.remove('show');
    }
    if (!e.target.closest('#ed-stamp-picker') && !e.target.closest('#ed-stamp-btn')) {
      edStampPicker && edStampPicker.classList.remove('show');
    }
  });

  // ── 19. GESTÃO DE PÁGINAS ───────────────────────────────────
  if (edPagesBtn) edPagesBtn.addEventListener('click', function () {
    if (!edPdfDoc) return;
    edOpenPagesModal();
  });

  async function edOpenPagesModal() {
    if (!edPagesModal || !edPagesModalList) return;
    edPagesModalList.innerHTML = '<div class="ed-loading-msg-sm">a carregar…</div>';
    edPagesModal.classList.add('show');
    await new Promise(r => setTimeout(r, 30));
    edPagesModalList.innerHTML = '';

    for (let i = 0; i < edPageCount; i++) {
      const page     = await edPdfDoc.getPage(i + 1);
      const vp       = page.getViewport({ scale: 0.18 });
      const tc       = document.createElement('canvas');
      tc.width = vp.width; tc.height = vp.height;
      await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;

      const item = document.createElement('div');
      item.className = 'ed-pm-thumb';

      const lbl = document.createElement('div');
      lbl.className = 'ed-pm-label'; lbl.textContent = 'Página ' + (i + 1);

      const acts = document.createElement('div');
      acts.className = 'ed-pm-actions';

      const rotL = document.createElement('button');
      rotL.textContent = '↺'; rotL.title = 'Rodar -90°';
      rotL.addEventListener('click', async function (e) {
        e.stopPropagation();
        edPagesModal.classList.remove('show');
        await edRotatePage(i, -90);
        edOpenPagesModal();
      });
      const rotR = document.createElement('button');
      rotR.textContent = '↻'; rotR.title = 'Rodar +90°';
      rotR.addEventListener('click', async function (e) {
        e.stopPropagation();
        edPagesModal.classList.remove('show');
        await edRotatePage(i, 90);
        edOpenPagesModal();
      });
      const delB = document.createElement('button');
      delB.textContent = '✕'; delB.title = 'Eliminar página'; delB.className = 'ed-pm-del';
      delB.addEventListener('click', async function (e) {
        e.stopPropagation();
        if (edPageCount <= 1) { alert('Não é possível eliminar a única página.'); return; }
        if (!confirm('Eliminar página ' + (i + 1) + '?')) return;
        edPagesModal.classList.remove('show');
        await edDeletePage(i);
      });
      acts.appendChild(rotL); acts.appendChild(rotR); acts.appendChild(delB);
      item.appendChild(tc); item.appendChild(lbl); item.appendChild(acts);
      edPagesModalList.appendChild(item);
    }
  }

  async function edRotatePage(pageIndex, degrees) {
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(edPdfBytes);
      const pg     = pdfDoc.getPages()[pageIndex];
      const cur    = pg.getRotation().angle;
      pg.setRotation(PDFLib.degrees((cur + degrees + 360) % 360));
      edPdfBytes = (await pdfDoc.save()).buffer;
      await edReloadPages();
    } catch (err) { console.error('Rotate error:', err); }
  }

  async function edDeletePage(pageIndex) {
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(edPdfBytes);
      pdfDoc.removePage(pageIndex);
      edPdfBytes = (await pdfDoc.save()).buffer;
      // Remover elementos da página eliminada e reindexar
      edElements = edElements.filter(r => r.pageIndex !== pageIndex);
      edElements.forEach(r => { if (r.pageIndex > pageIndex) r.pageIndex--; });
      const newPaths = {};
      Object.entries(edDrawPaths).forEach(([idx, paths]) => {
        const i = parseInt(idx);
        if (i !== pageIndex) newPaths[i > pageIndex ? i - 1 : i] = paths;
      });
      edDrawPaths = newPaths;
      await edReloadPages();
    } catch (err) { console.error('Delete page error:', err); }
  }

  async function edReloadPages() {
    edPdfDoc    = await pdfjsLib.getDocument({ data: edPdfBytes.slice(0) }).promise;
    edPageCount = edPdfDoc.numPages;
    edPageSizes = [];
    edDrawCtxMap = {};
    edPageSelect.innerHTML = '';
    for (let i = 1; i <= edPageCount; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i + ' / ' + edPageCount;
      edPageSelect.appendChild(opt);
    }
    edPagesContainer.innerHTML = '';
    for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);
  }

  if (edPagesModal) {
    edPagesModal.addEventListener('mousedown', function (e) {
      if (e.target === edPagesModal) edPagesModal.classList.remove('show');
    });
    const closeBtn = document.getElementById('ed-pages-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => edPagesModal.classList.remove('show'));
  }

  // ── 20. CONCATENAR PDFs ─────────────────────────────────────
  if (edConcatInput) edConcatInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file || !edPdfBytes) return;
    e.target.value = '';
    try {
      const newBytes = await file.arrayBuffer();
      const basePdf  = await PDFLib.PDFDocument.load(edPdfBytes);
      const addPdf   = await PDFLib.PDFDocument.load(newBytes);
      const copied   = await basePdf.copyPages(addPdf, addPdf.getPageIndices());
      copied.forEach(p => basePdf.addPage(p));
      edPdfBytes = (await basePdf.save()).buffer;

      // Guardar elementos/desenhos atuais antes de reload
      const savedEls    = edElements.filter(r => r.type !== 'native-text');
      const savedPaths  = Object.assign({}, edDrawPaths);
      await edReloadPages();
      // Restaurar
      savedEls.forEach(r => {
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (r.pageIndex + 1) + '"]');
        if (wrap) { wrap.appendChild(r.el); edElements.push(r); }
      });
      Object.entries(savedPaths).forEach(([idx, paths]) => {
        const i = parseInt(idx);
        edDrawPaths[i] = paths;
        edRedrawCanvas(i);
      });
    } catch (err) { console.error('Concat error:', err); alert('Erro ao juntar PDF: ' + err.message); }
  });

  // ── 21. ZOOM ────────────────────────────────────────────────
  const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

  function edUpdateZoomDisplay() {
    if (edZoomDisplay) edZoomDisplay.textContent = Math.round(edScale / 1.5 * 100) + '%';
  }
  edUpdateZoomDisplay();

  if (edZoomInBtn) edZoomInBtn.addEventListener('click', async function () {
    const next = ZOOM_STEPS.find(z => z > edScale + 0.01);
    if (next !== undefined) await edSetZoom(next);
  });
  if (edZoomOutBtn) edZoomOutBtn.addEventListener('click', async function () {
    const prev = [...ZOOM_STEPS].reverse().find(z => z < edScale - 0.01);
    if (prev !== undefined) await edSetZoom(prev);
  });

  async function edSetZoom(newScale) {
    if (!edPdfDoc) return;
    const ratio = newScale / edScale;
    edScale = newScale;
    // Escalar posições de todos os elementos
    edElements.forEach(r => {
      const el   = r.el;
      const left = parseFloat(el.style.left)  || 0;
      const top  = parseFloat(el.style.top)   || 0;
      const w    = parseFloat(el.style.width)  || 0;
      const h    = parseFloat(el.style.height) || 0;
      el.style.left  = (left * ratio) + 'px';
      el.style.top   = (top  * ratio) + 'px';
      if (w) el.style.width  = (w * ratio) + 'px';
      if (h && r.type !== 'text' && r.type !== 'sticky' && r.type !== 'native-text') {
        el.style.height = (h * ratio) + 'px';
      }
      if (r.ta && r.type !== 'native-text') {
        const fs = parseFloat(r.ta.style.fontSize) || (r.fontSize || 14);
        r.ta.style.setProperty('--ed-font-sz', Math.round(fs * ratio) + 'px');
      }
      if (r.type === 'native-text') {
        r.viewX = parseFloat(el.style.left)  || 0;
        r.viewY = parseFloat(el.style.top)   || 0;
      }
      if (r.type === 'stamp') {
        const sf = parseFloat(el.style.fontSize) || 22;
        el.style.fontSize = Math.round(sf * ratio) + 'px';
      }
    });
    edDrawCtxMap = {};
    edPagesContainer.innerHTML = '';
    edPageSizes = [];
    for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);
    edUpdateZoomDisplay();
  }

  // ── 22. HANDLES E DELETE ────────────────────────────────────
  function edAddHandles(el) {
    ['nw', 'ne', 'sw', 'se'].forEach(function (pos) {
      const h = document.createElement('div');
      h.className = 'ed-handle ' + pos;
      h.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault();
        edResizeStart(e, el, pos);
      });
      el.appendChild(h);
    });
    const del = document.createElement('button');
    del.className   = 'ed-del-btn';
    del.textContent = '✕';
    del.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
    del.addEventListener('click', function (e) { e.stopPropagation(); edStopEditing(); edDeleteEl(el); });
    el.appendChild(del);
  }

  function edDeleteEl(el) {
    const idx = edElements.findIndex(r => r.el === el);
    if (idx === -1) return;
    const record = edElements[idx];
    edPushHistory({ type: 'delete', el, record });
    edElements.splice(idx, 1);
    el.remove();
    if (edSelectedEl === el) edSelectedEl = null;
    if (edEditingEl  === el) edEditingEl  = null;
  }

  // ── 23. SELEÇÃO ─────────────────────────────────────────────
  function edSelect(el) {
    if (edSelectedEl === el) return;
    edDeselect();
    el.classList.add('selected');
    edSelectedEl = el;
    if (el.classList.contains('ed-text-el') && !el.classList.contains('ed-native-text')) {
      const ta = el.querySelector('textarea');
      if (ta) {
        edFontSize.value  = parseInt(ta.style.fontSize) || 14;
        edFontColor.value = ta.getAttribute('data-color') || '#000000';
        if (edBoldBtn)      edBoldBtn.classList.toggle('ed-fmt-active',      ta.style.fontWeight  === 'bold');
        if (edItalicBtn)    edItalicBtn.classList.toggle('ed-fmt-active',    ta.style.fontStyle   === 'italic');
        if (edUnderlineBtn) edUnderlineBtn.classList.toggle('ed-fmt-active', ta.style.textDecoration.includes('underline'));
        if (edFontFamilyEl) {
          const r = edElements.find(r => r.el === el);
          if (r && r.fontFamily) edFontFamilyEl.value = r.fontFamily;
        }
      }
    }
  }
  function edDeselect() {
    edPagesContainer.querySelectorAll('.ed-element.selected').forEach(e => e.classList.remove('selected'));
    edSelectedEl = null;
  }

  // Global: clicar fora → deselecionar
  document.addEventListener('mousedown', function (e) {
    const inEl      = e.target.closest('.ed-element');
    const inToolbar = e.target.closest('#ed-toolbar');
    const inModal   = e.target.closest('#ed-export-modal, #ed-pages-modal');
    const inPicker  = e.target.closest('#ed-shape-picker, #ed-stamp-picker');
    if (!inEl && !inToolbar && !inModal && !inPicker) {
      edStopEditing(); edDeselect();
    }
  });

  // ── 24. TECLADO ─────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (!document.getElementById('tab-editor').classList.contains('active')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); edUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); edRedo(); return; }
    if (e.key === 'Escape') { edSetTool('select'); edCloseAllPickers(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && edSelectedEl && !edEditingEl) {
      e.preventDefault(); edDeleteEl(edSelectedEl);
    }
  });

  // ── 25. ARRASTAR ────────────────────────────────────────────
  function edMakeDraggable(el, wrap) {
    let dragMoved = false;
    let prevLeft, prevTop;

    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (edEditingEl === el) return;
      if (edActiveTool !== 'select') return;
      dragMoved = false;
      prevLeft  = el.style.left;
      prevTop   = el.style.top;
      const startX = e.clientX - el.offsetLeft;
      const startY = e.clientY - el.offsetTop;

      function onMove(e) {
        dragMoved = true;
        let nx = e.clientX - startX;
        let ny = e.clientY - startY;
        nx = Math.max(0, Math.min(nx, wrap.offsetWidth  - el.offsetWidth));
        ny = Math.max(0, Math.min(ny, wrap.offsetHeight - el.offsetHeight));
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (dragMoved) {
          edPushHistory({ type: 'move', el, prevLeft, prevTop,
            nextLeft: el.style.left, nextTop: el.style.top });
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── 26. REDIMENSIONAR ───────────────────────────────────────
  function edResizeStart(e, el, corner) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = el.offsetWidth,  startH = el.offsetHeight;
    const startL = el.offsetLeft,   startT = el.offsetTop;

    function onMove(e) {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let nW = startW, nH = startH, nL = startL, nT = startT;
      if (corner === 'se') { nW = Math.max(40, startW + dx); nH = Math.max(24, startH + dy); }
      if (corner === 'sw') { nW = Math.max(40, startW - dx); nH = Math.max(24, startH + dy); nL = startL + startW - nW; }
      if (corner === 'ne') { nW = Math.max(40, startW + dx); nH = Math.max(24, startH - dy); nT = startT + startH - nH; }
      if (corner === 'nw') { nW = Math.max(40, startW - dx); nH = Math.max(24, startH - dy); nL = startL + startW - nW; nT = startT + startH - nH; }
      el.style.width = nW + 'px'; el.style.height = nH + 'px';
      el.style.left  = nL + 'px'; el.style.top    = nT + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      edPushHistory({ type: 'resize', el,
        prevLeft: startL + 'px', prevTop: startT + 'px',
        prevW: startW + 'px',    prevH: startH + 'px',
        nextLeft: el.style.left, nextTop: el.style.top,
        nextW: el.style.width,   nextH: el.style.height });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── 27. EXPORTAR PDF ────────────────────────────────────────
  edExportBtn.addEventListener('click', function () {
    if (!edPdfBytes) return;
    edStopEditing();
    edExportFilename.value = 'editado';
    edExportModal.classList.add('show');
    setTimeout(() => edExportFilename.select(), 80);
  });
  edExportCancel.addEventListener('click', () => edExportModal.classList.remove('show'));
  edExportModal.addEventListener('mousedown', function (e) {
    if (e.target === edExportModal) edExportModal.classList.remove('show');
  });

  edFolderPickBtn.addEventListener('click', async function () {
    if (!window.showDirectoryPicker) {
      edExportHint.innerHTML = 'O seu browser não suporta escolha de pasta.<br>O ficheiro será guardado nas <span>transferências</span>.';
      return;
    }
    try {
      edChosenDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      edFolderDisplay.textContent = '📁 ' + edChosenDirHandle.name;
      edFolderDisplay.classList.add('chosen');
      edExportHint.innerHTML = 'Guardado em <span>' + edChosenDirHandle.name + '</span>.';
      edExportHint.classList.add('has-folder');
    } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
  });

  edExportConfirm.addEventListener('click', async function () {
    const filename = (edExportFilename.value.trim() || 'editado').replace(/\.pdf$/i, '') + '.pdf';
    edExportModal.classList.remove('show');
    edExportBtn.disabled    = true;
    edExportBtn.textContent = 'a exportar…';

    try {
      const pdfDoc  = await PDFLib.PDFDocument.load(edPdfBytes);
      const pages   = pdfDoc.getPages();
      const fCache  = {};

      async function getFont(family, bold, italic) {
        const key = family + (bold ? 'b' : '') + (italic ? 'i' : '');
        if (fCache[key]) return fCache[key];
        let sfn;
        if (family === 'Times-Roman') {
          sfn = bold && italic ? PDFLib.StandardFonts.TimesRomanBoldItalic
              : bold           ? PDFLib.StandardFonts.TimesRomanBold
              : italic         ? PDFLib.StandardFonts.TimesRomanItalic
              :                  PDFLib.StandardFonts.TimesRoman;
        } else if (family === 'Courier') {
          sfn = bold && italic ? PDFLib.StandardFonts.CourierBoldOblique
              : bold           ? PDFLib.StandardFonts.CourierBold
              : italic         ? PDFLib.StandardFonts.CourierOblique
              :                  PDFLib.StandardFonts.Courier;
        } else {
          sfn = bold && italic ? PDFLib.StandardFonts.HelveticaBoldOblique
              : bold           ? PDFLib.StandardFonts.HelveticaBold
              : italic         ? PDFLib.StandardFonts.HelveticaOblique
              :                  PDFLib.StandardFonts.Helvetica;
        }
        const f = await pdfDoc.embedFont(sfn);
        fCache[key] = f; return f;
      }

      for (const record of edElements) {
        const pdfPage = pages[record.pageIndex];
        if (!pdfPage) continue;
        const { width: pW, height: pH } = pdfPage.getSize();
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (record.pageIndex + 1) + '"]');
        if (!wrap) continue;
        const scaleX = pW / wrap.offsetWidth;
        const scaleY = pH / wrap.offsetHeight;
        const el   = record.el;
        const elX  = parseFloat(el.style.left) || 0;
        const elY  = parseFloat(el.style.top)  || 0;
        const elW  = el.offsetWidth;
        const elH  = el.offsetHeight;
        const pdfX = elX * scaleX;
        const pdfY = pH - (elY + elH) * scaleY;

        // ── Texto novo ──
        if (record.type === 'text') {
          const ta      = record.ta || el.querySelector('textarea');
          const rawText = ta ? ta.value.trim() : '';
          if (!rawText) continue;
          const fsPx    = record.fontSize  || parseInt(ta && ta.style.fontSize) || 14;
          const clrHex  = record.textColor || '#000000';
          const bold    = !!record.bold;
          const italic  = !!record.italic;
          const fam     = record.fontFamily || 'Helvetica';
          const font    = await getFont(fam, bold, italic);
          const pdfFS   = fsPx * Math.min(scaleX, scaleY);
          const lineH   = pdfFS * 1.4;
          const clr     = edParseCssColor(clrHex);
          const lines   = ta.value.split('\n');
          lines.forEach((line, i) => {
            if (!line) return;
            try {
              pdfPage.drawText(line, {
                x: pdfX, y: pdfY + (lines.length - 1 - i) * lineH,
                size: pdfFS, font,
                color: PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255)
              });
            } catch (te) {}
            // Sublinhado
            if (record.underline) {
              const tw = font.widthOfTextAtSize(line, pdfFS);
              pdfPage.drawLine({
                start: { x: pdfX, y: pdfY + (lines.length - 1 - i) * lineH - 1 },
                end:   { x: pdfX + tw, y: pdfY + (lines.length - 1 - i) * lineH - 1 },
                thickness: 0.8,
                color: PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255)
              });
            }
          });
        }

        // ── Texto nativo ──
        else if (record.type === 'native-text') {
          const ta      = record.ta || el.querySelector('textarea');
          const newText = ta ? ta.value : '';
          const wasModified = newText !== record.originalText;
          const wasMoved    = Math.abs(parseFloat(el.style.left) - record.viewX) > 2 ||
                              Math.abs(parseFloat(el.style.top)  - record.viewY) > 2;
          if (!wasModified && !wasMoved) continue;
          const coverW = Math.max(record.pdfTotalW * 1.05, record.pdfFontSize * 2);
          const coverH = record.pdfFontSize * 1.5;
          pdfPage.drawRectangle({
            x: record.pdfX - 1, y: record.pdfY - coverH * 0.35,
            width: coverW + 2, height: coverH,
            color: PDFLib.rgb(1, 1, 1), borderWidth: 0
          });
          if (newText.trim()) {
            const font  = await getFont('Helvetica', false, false);
            const lines = newText.split('\n');
            const lineH = record.pdfFontSize * 1.35;
            lines.forEach((line, i) => {
              if (!line) return;
              try {
                pdfPage.drawText(line, {
                  x: pdfX, y: record.pdfY - i * lineH,
                  size: Math.max(record.pdfFontSize, 4), font,
                  color: PDFLib.rgb(0, 0, 0)
                });
              } catch (te) {}
            });
          }
        }

        // ── Imagem ──
        else if (record.type === 'image') {
          try {
            const src      = record.src;
            const imgBytes = await fetch(src).then(r => r.arrayBuffer());
            const isPng    = src.startsWith('data:image/png') || src.includes('.png');
            const imgEmbed = isPng
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
            pdfPage.drawImage(imgEmbed, { x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY });
          } catch (ie) { console.warn('imagem não exportada:', ie); }
        }

        // ── Forma ──
        else if (record.type === 'shape') {
          const sc   = edParseCssColor(record.strokeColor || '#000000');
          const sRgb = PDFLib.rgb(sc.r / 255, sc.g / 255, sc.b / 255);
          const sw   = (record.strokeWidth || 2) * Math.min(scaleX, scaleY);
          const rx = pdfX, ry = pdfY, rw = elW * scaleX, rh = elH * scaleY;
          const transparent = PDFLib.rgb(0, 0, 0);
          if (record.shapeType === 'rect') {
            pdfPage.drawRectangle({ x: rx, y: ry, width: rw, height: rh,
              borderColor: sRgb, borderWidth: sw, color: PDFLib.rgb(1, 1, 1), opacity: 0 });
          } else if (record.shapeType === 'ellipse') {
            pdfPage.drawEllipse({ x: rx + rw / 2, y: ry + rh / 2,
              xScale: rw / 2, yScale: rh / 2,
              borderColor: sRgb, borderWidth: sw, color: PDFLib.rgb(1, 1, 1), opacity: 0 });
          } else if (record.shapeType === 'line' || record.shapeType === 'arrow') {
            pdfPage.drawLine({ start: { x: rx, y: ry }, end: { x: rx + rw, y: ry + rh }, thickness: sw, color: sRgb });
            if (record.shapeType === 'arrow') {
              const ang  = Math.atan2(rh, rw);
              const aLen = sw * 6;
              const ax   = rx + rw, ay = ry + rh;
              pdfPage.drawLine({ start: { x: ax, y: ay }, end: { x: ax - aLen * Math.cos(ang - 0.45), y: ay - aLen * Math.sin(ang - 0.45) }, thickness: sw, color: sRgb });
              pdfPage.drawLine({ start: { x: ax, y: ay }, end: { x: ax - aLen * Math.cos(ang + 0.45), y: ay - aLen * Math.sin(ang + 0.45) }, thickness: sw, color: sRgb });
            }
          }
        }

        // ── Anotação ──
        else if (record.type === 'annotation') {
          if (record.annotType === 'highlight') {
            pdfPage.drawRectangle({
              x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY,
              color: PDFLib.rgb(1, 0.92, 0), opacity: 0.4, borderWidth: 0
            });
          } else if (record.annotType === 'strikethrough') {
            const midY = pdfY + (elH * scaleY) / 2;
            pdfPage.drawLine({ start: { x: pdfX, y: midY }, end: { x: pdfX + elW * scaleX, y: midY },
              thickness: 1.5 * Math.min(scaleX, scaleY), color: PDFLib.rgb(0.8, 0, 0) });
          } else if (record.annotType === 'underline-annot') {
            pdfPage.drawLine({ start: { x: pdfX, y: pdfY }, end: { x: pdfX + elW * scaleX, y: pdfY },
              thickness: 1.5 * Math.min(scaleX, scaleY), color: PDFLib.rgb(0, 0, 0.8) });
          }
        }

        // ── Nota adesiva ──
        else if (record.type === 'sticky') {
          const ta   = record.ta || el.querySelector('textarea');
          const text = ta ? ta.value : '';
          pdfPage.drawRectangle({
            x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY,
            color: PDFLib.rgb(1, 0.99, 0.6),
            borderColor: PDFLib.rgb(0.98, 0.79, 0.15),
            borderWidth: 1 * Math.min(scaleX, scaleY)
          });
          pdfPage.drawRectangle({
            x: pdfX, y: pdfY + elH * scaleY - 16 * scaleY,
            width: elW * scaleX, height: 16 * scaleY,
            color: PDFLib.rgb(0.98, 0.79, 0.15), borderWidth: 0
          });
          if (text.trim()) {
            const font  = await getFont('Helvetica', false, false);
            const pdfFS = 9 * Math.min(scaleX, scaleY);
            const lineH = pdfFS * 1.4;
            text.split('\n').forEach((line, i) => {
              if (!line || i > 12) return;
              try {
                pdfPage.drawText(line, {
                  x: pdfX + 4 * scaleX,
                  y: pdfY + elH * scaleY - (22 + i * (lineH / Math.min(scaleX, scaleY))) * scaleY,
                  size: pdfFS, font,
                  color: PDFLib.rgb(0.2, 0.2, 0.2),
                  maxWidth: (elW - 8) * scaleX
                });
              } catch (te) {}
            });
          }
        }

        // ── Carimbo ──
        else if (record.type === 'stamp') {
          const font    = await getFont('Helvetica', true, false);
          const sc      = edParseCssColor(record.color || '#000000');
          const sRgb    = PDFLib.rgb(sc.r / 255, sc.g / 255, sc.b / 255);
          const pdfFS   = 18 * Math.min(scaleX, scaleY);
          const textW   = font.widthOfTextAtSize(record.stampText, pdfFS);
          const pad     = 5 * Math.min(scaleX, scaleY);
          const cx      = pdfX + elW * scaleX / 2;
          const cy      = pdfY + elH * scaleY / 2;
          pdfPage.drawRectangle({
            x: cx - textW / 2 - pad, y: cy - pdfFS * 0.3 - pad,
            width: textW + pad * 2,  height: pdfFS * 1.3 + pad * 2,
            borderColor: sRgb, borderWidth: 2.5 * Math.min(scaleX, scaleY),
            borderOpacity: 0.75, color: PDFLib.rgb(1, 1, 1), opacity: 0
          });
          try {
            pdfPage.drawText(record.stampText, {
              x: cx - textW / 2, y: cy - pdfFS * 0.3,
              size: pdfFS, font, color: sRgb, opacity: 0.75
            });
          } catch (te) {}
        }
      }

      // ── Exportar caminhos de desenho ──
      for (const [pageIdxStr, paths] of Object.entries(edDrawPaths)) {
        const pageIndex = parseInt(pageIdxStr);
        const pdfPage   = pages[pageIndex];
        if (!pdfPage || !paths.length) continue;
        const { width: pW, height: pH } = pdfPage.getSize();
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (pageIndex + 1) + '"]');
        if (!wrap) continue;
        const scaleX = pW / wrap.offsetWidth;
        const scaleY = pH / wrap.offsetHeight;
        paths.forEach(path => {
          if (!path.points || path.points.length < 2) return;
          const clr  = edParseCssColor(path.color || '#000000');
          const cRgb = PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255);
          const sw   = (path.size || 2) * Math.min(scaleX, scaleY);
          for (let i = 1; i < path.points.length; i++) {
            const prev = path.points[i - 1];
            const curr = path.points[i];
            pdfPage.drawLine({
              start: { x: prev.x * pW, y: pH - prev.y * pH },
              end:   { x: curr.x * pW, y: pH - curr.y * pH },
              thickness: sw, color: cRgb
            });
          }
        });
      }

      const outBytes = await pdfDoc.save();

      // Guardar em pasta escolhida
      if (edChosenDirHandle) {
        try {
          const fh = await edChosenDirHandle.getFileHandle(filename, { create: true });
          const wr = await fh.createWritable();
          await wr.write(new Blob([outBytes], { type: 'application/pdf' }));
          await wr.close();
          edExportBtn.innerHTML = '✓ guardado';
          setTimeout(() => { edExportBtn.innerHTML = '⬇️ exportar pdf'; edExportBtn.disabled = false; }, 2500);
          return;
        } catch (fsErr) { console.warn('Fallback para download:', fsErr); }
      }
      // Download padrão
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (err) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar o PDF.');
    }
    edExportBtn.disabled  = false;
    edExportBtn.innerHTML = '⬇️ exportar pdf';
  });

  // ── 28. HELPERS ─────────────────────────────────────────────
  function edRgbToHex(rgb) {
    if (rgb && rgb[0] === '#') return rgb;
    const m = (rgb || '').match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
  }
  function edParseCssColor(css) {
    if (!css) return { r: 0, g: 0, b: 0 };
    const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const hex = css.replace('#', '');
    if (hex.length === 6) return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
    return { r: 0, g: 0, b: 0 };
  }
  function edPdfFontToCSS(pdfFont) {
    if (!pdfFont) return 'Arial,Helvetica,sans-serif';
    if (pdfFont.includes('Times'))   return "'Times New Roman',Times,serif";
    if (pdfFont.includes('Courier')) return "'Courier New',Courier,monospace";
    return 'Arial,Helvetica,sans-serif';
  }

})();
// ══════════════════════════════════════════════════════════════
//  (bloco ETIQUETAS — IIFE própria, ver nota no cabeçalho do ficheiro)
// ══════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════
   ETIQUETAS — módulo completo
   Auto-injeta o overlay #etiquetas-overlay no <body> na
   primeira abertura e gera etiquetas de preços em PDF.
══════════════════════════════════════════════════════ */

(function () {
'use strict';

var ET_HTML = `
<div id="etiquetas-overlay">
  <div id="etiquetas-overlay-bar">
    <button id="etiquetas-overlay-back" onclick="closeEtiquetasOverlay()">← voltar</button>
    <div id="etiquetas-overlay-title">etiquetas de preços</div>
  </div>
  <div id="etiquetas-overlay-content">
    <div id="etiquetas-form-wrap">
      <div class="et-section-title">configurar preços e quantidades</div>

      <div class="et-price-row" id="et-row-1">
        <label>Preço 1</label>
        <input class="et-price-input" type="number" step="0.01" min="0" placeholder="0,00 €" id="et-price-1">
        <span class="et-sep">×</span>
        <input class="et-qty-input" type="number" min="0" value="0" id="et-qty-1">
        <span class="et-sep">etiquetas</span>
        <span class="et-total-badge" id="et-tot-1">—</span>
      </div>
      <div class="et-price-row" id="et-row-2">
        <label>Preço 2</label>
        <input class="et-price-input" type="number" step="0.01" min="0" placeholder="0,00 €" id="et-price-2">
        <span class="et-sep">×</span>
        <input class="et-qty-input" type="number" min="0" value="0" id="et-qty-2">
        <span class="et-sep">etiquetas</span>
        <span class="et-total-badge" id="et-tot-2">—</span>
      </div>
      <div class="et-price-row" id="et-row-3">
        <label>Preço 3</label>
        <input class="et-price-input" type="number" step="0.01" min="0" placeholder="0,00 €" id="et-price-3">
        <span class="et-sep">×</span>
        <input class="et-qty-input" type="number" min="0" value="0" id="et-qty-3">
        <span class="et-sep">etiquetas</span>
        <span class="et-total-badge" id="et-tot-3">—</span>
      </div>
      <div class="et-price-row" id="et-row-4">
        <label>Preço 4</label>
        <input class="et-price-input" type="number" step="0.01" min="0" placeholder="0,00 €" id="et-price-4">
        <span class="et-sep">×</span>
        <input class="et-qty-input" type="number" min="0" value="0" id="et-qty-4">
        <span class="et-sep">etiquetas</span>
        <span class="et-total-badge" id="et-tot-4">—</span>
      </div>
      <div class="et-price-row" id="et-row-5">
        <label>Preço 5</label>
        <input class="et-price-input" type="number" step="0.01" min="0" placeholder="0,00 €" id="et-price-5">
        <span class="et-sep">×</span>
        <input class="et-qty-input" type="number" min="0" value="0" id="et-qty-5">
        <span class="et-sep">etiquetas</span>
        <span class="et-total-badge" id="et-tot-5">—</span>
      </div>

      <div id="et-summary-row">
        <span id="et-summary-text">total: 0 etiquetas · 0 páginas</span>
        <span id="et-pages-text"></span>
      </div>

      <div class="et-btn-row">
        <button class="et-btn" id="et-preview-btn" onclick="etiquetasGerar(false)">pré-visualizar</button>
        <button class="et-btn primary" id="et-download-btn" onclick="etiquetasGerar(true)">⬇ descarregar PDF</button>
      </div>
      <div id="et-status"></div>
    </div>
  </div>
</div>
`;

var _etHtmlInjected = false;
function etInjectHtml() {
  if (_etHtmlInjected) return;
  _etHtmlInjected = true;
  document.body.insertAdjacentHTML('beforeend', ET_HTML);
  etBindLogic();
}

var COLS = 5, ROWS = 13, PER_PAGE = 65;

function fmtPrice(v) {
  return parseFloat(v).toFixed(2).replace('.', ',') + '€';
}

function getEntries() {
  var entries = [];
  for (var i = 1; i <= 5; i++) {
    var priceEl = document.getElementById('et-price-' + i);
    var qtyEl   = document.getElementById('et-qty-' + i);
    var p = parseFloat(priceEl && priceEl.value);
    var q = parseInt(qtyEl && qtyEl.value, 10);
    if (isFinite(p) && p > 0 && isFinite(q) && q > 0) {
      entries.push({ price: p, qty: q });
    }
  }
  return entries;
}

function updateSummary() {
  for (var i = 1; i <= 5; i++) {
    var priceEl = document.getElementById('et-price-' + i);
    var qtyEl   = document.getElementById('et-qty-' + i);
    var totEl   = document.getElementById('et-tot-' + i);
    var p = parseFloat(priceEl && priceEl.value);
    var q = parseInt(qtyEl && qtyEl.value, 10);
    if (totEl) totEl.textContent = (isFinite(p) && p > 0 && isFinite(q) && q > 0) ? q + ' und.' : '—';
  }
  var entries = getEntries();
  var total = entries.reduce(function (a, e) { return a + e.qty; }, 0);
  var pages = total > 0 ? Math.ceil(total / PER_PAGE) : 0;
  var sumEl = document.getElementById('et-summary-text');
  if (sumEl) sumEl.textContent = 'total: ' + total + ' etiqueta' + (total !== 1 ? 's' : '') + ' · ' + pages + ' página' + (pages !== 1 ? 's' : '');
}

function etBindLogic() {
  for (var i = 1; i <= 5; i++) {
    var pe = document.getElementById('et-price-' + i);
    var qe = document.getElementById('et-qty-' + i);
    if (pe) pe.addEventListener('input', updateSummary);
    if (qe) qe.addEventListener('input', updateSummary);
  }
  updateSummary();
}

window.etiquetasGerar = async function (download) {
  var entries = getEntries();
  if (!entries.length) {
    document.getElementById('et-status').textContent = '⚠️ Introduza pelo menos um preço e quantidade.';
    return;
  }
  var statusEl = document.getElementById('et-status');
  statusEl.textContent = 'a gerar PDF…';
  try {
    var PDFLib = window.PDFLib;
    var PDFDocument = PDFLib.PDFDocument;
    var rgb = PDFLib.rgb;
    var StandardFonts = PDFLib.StandardFonts;
    var pdfDoc = await PDFDocument.create();
    var font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    var labels = [];
    entries.forEach(function (e) {
      for (var k = 0; k < e.qty; k++) labels.push(fmtPrice(e.price));
    });
    var totalPages = Math.ceil(labels.length / PER_PAGE);
    var idx = 0;
    var pageW = 595.28, pageH = 841.89;
    var marginX = 20, marginY = 20;
    var cellW = (pageW - marginX * 2) / COLS;
    var cellH = (pageH - marginY * 2) / ROWS;
    var fontSize = 28;
    for (var p = 0; p < totalPages; p++) {
      var page = pdfDoc.addPage([pageW, pageH]);
      for (var row = 0; row < ROWS; row++) {
        for (var col = 0; col < COLS; col++) {
          if (idx >= labels.length) break;
          var text = labels[idx++];
          var tw = font.widthOfTextAtSize(text, fontSize);
          var x = marginX + col * cellW + (cellW - tw) / 2;
          var y = pageH - marginY - (row + 1) * cellH + (cellH - fontSize * 0.75) / 2;
          page.drawText(text, { x: x, y: y, size: fontSize, font: font, color: rgb(0, 0, 0) });
        }
      }
    }
    var pdfBytes = await pdfDoc.save();
    var blob = new Blob([pdfBytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    if (download) {
      var a = document.createElement('a');
      a.href = url; a.download = 'etiquetas_precos.pdf'; a.click();
      statusEl.textContent = '✓ PDF descarregado.';
    } else {
      window.open(url, '_blank');
      statusEl.textContent = '✓ PDF aberto em nova aba.';
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ Erro ao gerar PDF: ' + err.message;
  }
};

window.openEtiquetasOverlay = function () {
  etInjectHtml();
  var overlay = document.getElementById('etiquetas-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { overlay.classList.add('visible'); });
  });
  var s = document.getElementById('et-status');
  if (s) s.textContent = '';
  updateSummary();
};

window.closeEtiquetasOverlay = function () {
  var overlay = document.getElementById('etiquetas-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(function () { overlay.classList.remove('open'); }, 460);
};

})();
