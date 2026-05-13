// ══════════════════════════════════════════════════════════════
//  HISTÓRICO DE VENDAS — ADMINISTRADOR
//  Árbol expandible: Tienda → Año → Mes → Día
//  Comparación inteligente por día de semana equivalente
// ══════════════════════════════════════════════════════════════
(function () {

  var LOJAS = ['MAXX','MEZKA AVENIDA','MEZKA FUNCHAL','MEZKA MERCADO','PARFOIS ARCADAS SAO FRANCISCO','PARFOIS MADEIRA SHOPPING','SHANA'];
  var LOJA_LABELS = {'MAXX':'Maxx','MEZKA AVENIDA':'Mezka Avenida','MEZKA FUNCHAL':'Mezka Funchal','MEZKA MERCADO':'Mezka Mercado','PARFOIS ARCADAS SAO FRANCISCO':'Parfois Arcadas','PARFOIS MADEIRA SHOPPING':'Madeira Shopping','SHANA':'Shana'};
  var ZONA_PARFOIS  = ['PARFOIS ARCADAS SAO FRANCISCO','PARFOIS MADEIRA SHOPPING'];
  var ZONA_PRIMAVERA= ['MEZKA FUNCHAL','MEZKA AVENIDA','MEZKA MERCADO','SHANA','MAXX'];
  var ZONA_MEZKAPS  = ['MEZKA AVENIDA','MEZKA MERCADO','SHANA','MAXX'];
  var ZONA_MEZKAFNC = ['MEZKA FUNCHAL'];
  var ZONA_DOMINGO  = ['MEZKA AVENIDA','MEZKA MERCADO','SHANA','MAXX'];
  var MESES_PT      = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var DIAS_PT       = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  var _activeTab       = 'vendas';
  var _activePeriodBtn = null;
  var _activeZoneBtn   = null;
  var _allRows         = [];
  var _expanded        = {};

  var S = {
    pill:    'background:#2a2a2a !important;color:#f0f0f0 !important;border:1.5px solid #555 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    pillAct: 'background:#4a7c59 !important;color:#ffffff !important;border:1.5px solid #4a7c59 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    tab:     'background:#f0f0f0 !important;color:#444444 !important;border:1.5px solid #dddddd !important;border-radius:10px !important;padding:9px 22px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    tabAct:  'background:#1a1a1a !important;color:#ffffff !important;border:1.5px solid #1a1a1a !important;border-radius:10px !important;padding:9px 22px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;'
  };

  function _pad(n) { return n < 10 ? '0' + n : String(n); }
  function _todayStr() { var d=new Date(); return d.getFullYear()+'-'+_pad(d.getMonth()+1)+'-'+_pad(d.getDate()); }
  function _yesterdayStr() { var d=new Date(); d.setDate(d.getDate()-1); return d.getFullYear()+'-'+_pad(d.getMonth()+1)+'-'+_pad(d.getDate()); }

  // Detecta el último día donde TODAS las tiendas tienen registro cargado
  // Si hoy tiene las 7 tiendas → devuelve hoy. Si no → busca hacia atrás.
  function _lastCompleteDay(lojas) {
    var lojaSet=lojas||LOJAS;
    var today=_todayStr();
    // Comprobar hoy primero
    var candidates=[today, _yesterdayStr()];
    // Añadir los 5 días anteriores por si hay lagunas
    for(var i=2;i<=6;i++){
      var d=new Date();d.setDate(d.getDate()-i);
      candidates.push(_dateToStr(d));
    }
    for(var ci=0;ci<candidates.length;ci++){
      var day=candidates[ci];
      var lojasThatDay=_allRows.filter(function(r){return r.data===day;}).map(function(r){return r.loja;});
      var allPresent=lojaSet.every(function(l){return lojasThatDay.indexOf(l)>=0;});
      if(allPresent) return day;
    }
    // Fallback: ayer
    return _yesterdayStr();
  }
  function _dateToStr(d) { return d.getFullYear()+'-'+_pad(d.getMonth()+1)+'-'+_pad(d.getDate()); }
  function _strToDate(s) { return new Date(s+'T00:00:00'); }
  function _fmtDate(str) { if(!str)return''; var p=str.split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:str; }
  function _fmtEur(v) { var n=parseFloat(v||0).toFixed(2),parts=n.split('.'); parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return parts[0]+','+parts[1]+'\u00a0€'; }
  function _dowStr(s) { return DIAS_PT[_strToDate(s).getDay()]; }

  function _yesterday() { return _strToDate(_yesterdayStr()); }
  function _lastDay()   { return _lastCompleteDay(); } // alias corto
  function _period7()   { var t=_strToDate(_lastCompleteDay()),f=new Date(t); f.setDate(t.getDate()-6);  return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _period30()  { var t=_strToDate(_lastCompleteDay()),f=new Date(t); f.setDate(t.getDate()-29); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _period90()  { var t=_strToDate(_lastCompleteDay()),f=new Date(t); f.setDate(t.getDate()-89); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _periodMes() { var t=_strToDate(_lastCompleteDay()),f=new Date(t.getFullYear(),t.getMonth(),1); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _periodAno() { var t=_lastCompleteDay(); return {from:t.substring(0,4)+'-01-01',to:t}; }
  function _periodQ1()  { var y=_yesterday().getFullYear(); return {from:y+'-01-01',to:y+'-03-31'}; }
  function _periodQ2()  { var y=_yesterday().getFullYear(); return {from:y+'-04-01',to:y+'-06-30'}; }
  function _periodQ3()  { var y=_yesterday().getFullYear(); return {from:y+'-07-01',to:y+'-09-30'}; }
  function _periodQ4()  { var y=_yesterday().getFullYear(); return {from:y+'-10-01',to:y+'-12-31'}; }
  function _periodTotal(rows) {
    // Rango completo del histórico
    var dates=rows.map(function(r){return r.data;}).filter(Boolean).sort();
    if(!dates.length) { var y=_yesterdayStr(); return {from:y,to:y}; }
    return {from:dates[0],to:dates[dates.length-1]};
  }

  // Construye comparaciones vs TODOS los años donde haya datos equivalentes (mismo patrón DOW)
  function _buildComparisons(from, to, rows) {
    var fromD=_strToDate(from), toD=_strToDate(to);
    var nDays=Math.round((toD-fromD)/86400000)+1;
    var dowPattern=[];
    for(var i=0;i<nDays;i++){var d=new Date(fromD);d.setDate(fromD.getDate()+i);dowPattern.push(d.getDay());}

    // Determinar todos los años con datos disponibles
    var yearsWithData={};
    rows.forEach(function(r){if((parseFloat(r.montante)||0)>0){yearsWithData[r.data.substring(0,4)]=true;}});
    var currentYear=fromD.getFullYear();
    var comps=[];

    // Buscar hasta 10 años atrás en incrementos de 52 semanas
    for(var w=52;w<=520;w+=52){
      var cFromD=new Date(fromD); cFromD.setDate(fromD.getDate()-w);
      var cToD=new Date(cFromD); cToD.setDate(cFromD.getDate()+nDays-1);
      var cFrom=_dateToStr(cFromD),cTo=_dateToStr(cToD);
      var cYear=cFromD.getFullYear();
      if(!yearsWithData[String(cYear)]) continue;
      var cDow=[];
      for(var j=0;j<nDays;j++){var dd=new Date(cFromD);dd.setDate(cFromD.getDate()+j);cDow.push(dd.getDay());}
      if(!cDow.every(function(dv,ii){return dv===dowPattern[ii];})) continue;
      if(!rows.some(function(r){return r.data>=cFrom&&r.data<=cTo&&(parseFloat(r.montante)||0)>0;})) continue;
      comps.push({from:cFrom,to:cTo,label:String(cYear)});
    }
    return comps;
  }

  // Modo comparación exacta (mismo número de día, sin ajuste DOW)
  var _equalDates = false;

  function _buildComparisonsExact(from, to, rows) {
    var fromD=_strToDate(from), toD=_strToDate(to);
    var nDays=Math.round((toD-fromD)/86400000)+1;
    var fromMD=from.substring(5);
    var toMD=to.substring(5);
    var yearsWithData={};
    rows.forEach(function(r){if((parseFloat(r.montante)||0)>0){yearsWithData[r.data.substring(0,4)]=true;}});
    var currentYear=fromD.getFullYear();
    var comps=[];
    var years=Object.keys(yearsWithData).map(Number).sort(function(a,b){return b-a;});
    years.forEach(function(yr){
      if(yr>=currentYear) return;
      var cFrom=yr+'-'+fromMD;
      var cTo=(toMD<fromMD?(yr+1):yr)+'-'+toMD;
      if(!rows.some(function(r){return r.data>=cFrom&&r.data<=cTo&&(parseFloat(r.montante)||0)>0;})) return;
      comps.push({from:cFrom,to:cTo,label:String(yr)});
    });
    return comps;
  }

  function _filterByZone(rows) {
    var lojaEl=document.getElementById('hadm-loja');
    var loja=lojaEl?lojaEl.value:'';
    var zone=lojaEl&&lojaEl.dataset.zone?JSON.parse(lojaEl.dataset.zone):null;
    if(loja) return rows.filter(function(r){return r.loja===loja;});
    if(zone) return rows.filter(function(r){return zone.indexOf(r.loja)>=0;});
    return rows;
  }

  function _getFilters() {
    var from=(document.getElementById('hadm-from')||{}).value||_period30().from;
    var to=(document.getElementById('hadm-to')||{}).value||_period30().to;
    return {from:from,to:to};
  }

  window.openHistoricoAdmin = function () {
    var adminApp=document.getElementById('admin-app');
    var dashboard=document.getElementById('adm-dashboard');
    var moduleBar=document.getElementById('adm-module-bar');
    var barTitle=document.getElementById('adm-module-bar-title');
    var panel=document.getElementById('adm-historico-panel');
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
    if(dashboard) dashboard.style.display='none';
    if(barTitle)  barTitle.textContent='histórico de vendas';
    if(adminApp)  adminApp.classList.add('module-open');
    if(adminApp){
      adminApp.style.setProperty('display','flex','important');
      adminApp.style.setProperty('flex-direction','column','important');
      adminApp.style.setProperty('overflow','hidden','important');
      adminApp.style.setProperty('height','100vh','important');
      adminApp.style.setProperty('padding','0','important');
      /* position:fixed removido — causava invasão do layout */
    }
    if(moduleBar){moduleBar.style.setProperty('display','flex','important');moduleBar.style.setProperty('flex-shrink','0','important');moduleBar.style.setProperty('width','100%','important');}
    if(panel){
      panel.style.setProperty('display','flex','important');
      panel.style.setProperty('flex','1','important');
      panel.style.setProperty('flex-direction','column','important');
      panel.style.setProperty('overflow-y','auto','important');
      panel.style.setProperty('overflow-x','hidden','important');
      panel.style.setProperty('width','100%','important');
      panel.style.setProperty('height','0','important');
    }
    _injectStyles();
    _activeTab='vendas'; _activePeriodBtn='hadm-btn-30'; _activeZoneBtn=null; _expanded={};
    _applyBtnStyles();
    var p=_period30();
    var fEl=document.getElementById('hadm-from'),tEl=document.getElementById('hadm-to');
    if(fEl) fEl.value=p.from; if(tEl) tEl.value=p.to;
    _loadAll();
  };

  window.closeHistoricoAdmin = function () {
    var adminApp=document.getElementById('admin-app');
    var dashboard=document.getElementById('adm-dashboard');
    var moduleBar=document.getElementById('adm-module-bar');
    var panel=document.getElementById('adm-historico-panel');
    if(panel){panel.style.display='none';['flex','flex-direction','overflow-y','overflow-x','width','height'].forEach(function(p){panel.style.removeProperty(p);});}
    if(moduleBar){moduleBar.style.display='none';['flex-shrink','width'].forEach(function(p){moduleBar.style.removeProperty(p);});}
    if(dashboard) dashboard.style.display='';
    if(adminApp){adminApp.classList.remove('module-open');['display','flex-direction','overflow','height','padding','position','top','left','right','bottom','z-index'].forEach(function(p){adminApp.style.removeProperty(p);});}
  };

  function _loadAll() {
    var c=_getContent();
    if(c){c.innerHTML='<div style="padding:30px;font-size:.85rem;color:#666 !important;">a carregar dados históricos…</div>';_setupContent(c);}
    _allRows=[];
    _loadPage(0);
  }

  function _loadPage(offset) {
    var PAGE=1000;
    var c=_getContent();
    sbAdmin.from('ventas_historicas').select('*').order('data',{ascending:true}).range(offset,offset+PAGE-1)
      .then(function(res){
        if(res.error){_render();return;}
        var rows=res.data||[];
        _allRows=_allRows.concat(rows);
        if(c){
          var loaded=_allRows.length;
          c.innerHTML='<div style="padding:30px;font-size:.85rem;color:#666 !important;">a carregar… '+loaded+' registos</div>';
          _setupContent(c);
        }
        if(rows.length===PAGE){
          _loadPage(offset+PAGE);
        } else {
          _render();
        }
      })
      .catch(function(){_render();});
  }

  function _hadmLoadData() { _render(); }
  window._hadmLoadData = _hadmLoadData;
  function _getContent() { return document.getElementById('hadm-content'); }

  function _render() {
    if(_activeTab==='vendas')     _renderVendas();
    if(_activeTab==='carregar')   _renderCarregar();
    if(_activeTab==='proyeccion') _renderProyeccion();
  }

  // ════════════════════════════════════════════════════════════
  //  TAB VENDAS
  // ════════════════════════════════════════════════════════════
  function _renderVendas() {
    var c=_getContent(); if(!c)return;
    c.innerHTML=''; _setupContent(c);

    // Modo Domingo Ps: especial — ignora filtro de período normal
    if(_activeZoneBtn==='hadm-btn-domingo') {
      _renderDomingoPs(c);
      return;
    }

    // Detectar zona activa para _lastCompleteDay
    var zonaLojas=_filterByZone(LOJAS.map(function(l){return {loja:l,data:'',montante:0};})).map(function(r){return r.loja;});
    if(!zonaLojas.length) zonaLojas=LOJAS;
    var lastDay=_lastCompleteDay(zonaLojas);
    var isToday=lastDay===_todayStr();

    var rows=_filterByZone(_allRows);
    var isTotal=(_activePeriodBtn==='hadm-btn-total');
    var f;
    if(isTotal){
      f=_periodTotal(_allRows);
    } else {
      f=_getFilters();
      // Si el período llega hasta hoy o más allá, usar lastDay como tope
      if(f.to>=_todayStr()) f={from:f.from, to:lastDay};
    }

    // Para el header: ventas del período seleccionado (zona filtrada)
    var periodRows=rows.filter(function(r){return r.data>=f.from&&r.data<=f.to;});
    var periodTotal=periodRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    var nDays=Math.round((_strToDate(f.to)-_strToDate(f.from))/86400000)+1;
    var dataLabel=isTotal?'TOTAL HISTÓRICO':(_fmtDate(f.from)+' → '+_fmtDate(f.to)+(isToday?' · até hoje':' · até ontem')+' ('+nDays+' dias)'+(_equalDates?' · datas exactas':''));
    var comps=_equalDates?_buildComparisonsExact(f.from,f.to,rows):_buildComparisons(f.from,f.to,rows);

    // Header resumen
    var hdr=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0e0e0;position:relative;');
    hdr.style.setProperty('background','#1a1a1a','important');

    // Botón = (toggle modo fechas exactas)
    if(!isTotal){
      var eqBtn=_el('div','position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.85rem;font-weight:900;border:1.5px solid;transition:all .2s;user-select:none;');
      eqBtn.title=_equalDates?'Modo: mesmas datas exactas':'Modo: mesmo dia de semana';
      eqBtn.style.setProperty('background',_equalDates?'#4a7c59':'transparent','important');
      eqBtn.style.setProperty('color',_equalDates?'#ffffff':'#666666','important');
      eqBtn.style.setProperty('border-color',_equalDates?'#4a7c59':'#444444','important');
      eqBtn.textContent='=';
      eqBtn.addEventListener('mouseenter',function(){
        if(!_equalDates){eqBtn.style.setProperty('border-color','#888888','important');eqBtn.style.setProperty('color','#aaaaaa','important');}
      });
      eqBtn.addEventListener('mouseleave',function(){
        if(!_equalDates){eqBtn.style.setProperty('border-color','#444444','important');eqBtn.style.setProperty('color','#666666','important');}
      });
      eqBtn.addEventListener('click',function(){_equalDates=!_equalDates;_render();});
      hdr.appendChild(eqBtn);
    }

    var hLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;padding-right:36px;');
    hLbl.style.setProperty('color','#888888','important');
    hLbl.textContent=dataLabel;
    hdr.appendChild(hLbl);
    var hVal=_el('div','font-size:2rem;font-weight:900;letter-spacing:-.02em;margin-bottom:4px;');
    hVal.style.setProperty('color','#ffffff','important');
    hVal.textContent=_fmtEur(periodTotal);
    hdr.appendChild(hVal);
    var hSub=_el('div','font-size:.72rem;');
    hSub.style.setProperty('color','#aaaaaa','important');
    hSub.textContent=(isTotal?periodRows.length+' registos':'Média diária: '+_fmtEur(periodTotal/nDays)+' · '+periodRows.length+' registos');
    hdr.appendChild(hSub);

    if(!isTotal&&comps.length){
      var cRow=_el('div','display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #333333;');
      comps.forEach(function(comp){
        var cRows=rows.filter(function(r){return r.data>=comp.from&&r.data<=comp.to;});
        var cTotal=cRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var diff=cTotal>0?(periodTotal-cTotal)/cTotal*100:null;
        var cBox=_el('div','min-width:120px;');
        var cYear=_el('div','font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.12em;margin-bottom:1px;');
        cYear.style.setProperty('color','#aaaaaa','important');
        cYear.textContent='vs '+comp.label;
        cBox.appendChild(cYear);
        var cDates=_el('div','font-size:.56rem;font-weight:600;letter-spacing:.04em;margin-bottom:4px;');
        cDates.style.setProperty('color','#555555','important');
        cDates.textContent=_fmtDate(comp.from)+'→'+_fmtDate(comp.to);
        cBox.appendChild(cDates);
        var cLine=_el('div','display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;');
        var cVal=_el('span','font-size:.88rem;font-weight:800;');
        cVal.style.setProperty('color','#cccccc','important');
        cVal.textContent=_fmtEur(cTotal);
        cLine.appendChild(cVal);
        if(diff!==null){
          var cD=_el('span','font-size:.78rem;font-weight:800;');
          cD.style.setProperty('color',diff>=0?'#4caf82':'#e05a5a','important');
          cD.textContent=(diff>=0?'↑ +':'↓ ')+diff.toFixed(1)+'%';
          cLine.appendChild(cD);
        }
        cBox.appendChild(cLine);
        cRow.appendChild(cBox);
      });
      hdr.appendChild(cRow);
    }
    c.appendChild(hdr);

    // ── Banner de proyección para trimestres incompletos
    if(['hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4'].indexOf(_activePeriodBtn)>=0){
      var today=_todayStr();
      // Usar último dia com dados reais — se hoje ainda não foi carregado, usa ontem
      var effectiveTodayVendas=_lastCompleteDay(zonaLojas);
      if(effectiveTodayVendas>today) effectiveTodayVendas=today;
      if(today<=f.to){
        var proj=_calcProjection(rows,f.from,f.to,effectiveTodayVendas);
        if(proj){
          var bannerProy=_el('div','border-radius:10px;padding:10px 16px;margin-bottom:16px;border:1px solid #c8e6c9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;');
          bannerProy.style.setProperty('background','#f1f8f4','important');
          var bLeft=_el('div','');
          var bLbl=_el('div','font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:2px;');
          bLbl.style.setProperty('color','#4a7c59','important');
          bLbl.textContent='PROJECÇÃO DO TRIMESTRE COMPLETO';
          bLeft.appendChild(bLbl);
          var bSub=_el('div','font-size:.65rem;');
          bSub.style.setProperty('color','#888888','important');
          bSub.textContent=proj.pctDone.toFixed(1)+'% completado · '+proj.diasRestantes+' dias restantes';
          bLeft.appendChild(bSub);
          bannerProy.appendChild(bLeft);
          var bVal=_el('div','font-size:1.1rem;font-weight:900;');
          bVal.style.setProperty('color','#2a6a40','important');
          bVal.textContent='→ '+_fmtEur(proj.valorProjetado);
          bannerProy.appendChild(bVal);
          c.appendChild(bannerProy);
        }
      }
    }

    // Árbol — solo muestra registros del período activo (excepto Total que muestra todo)
    var treeLabel=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    treeLabel.style.setProperty('color','#999999','important');
    treeLabel.textContent='DETALHE POR LOJA · ANO · MÊS · DIA — clique para expandir';
    c.appendChild(treeLabel);

    // Árbol usa filas del período (para Total, usa todas las filas de la zona)
    var treeRows=isTotal?rows:rows.filter(function(r){return r.data>=f.from&&r.data<=f.to;});

    var byLoja={};
    treeRows.forEach(function(r){
      if(!byLoja[r.loja]) byLoja[r.loja]={};
      var yr=r.data.substring(0,4);
      if(!byLoja[r.loja][yr]) byLoja[r.loja][yr]={};
      var mo=r.data.substring(5,7);
      if(!byLoja[r.loja][yr][mo]) byLoja[r.loja][yr][mo]=[];
      byLoja[r.loja][yr][mo].push(r);
    });
    var lojaOrder=LOJAS.filter(function(l){return byLoja[l];});
    Object.keys(byLoja).forEach(function(l){if(lojaOrder.indexOf(l)<0)lojaOrder.push(l);});

    lojaOrder.forEach(function(loja){
      var lojaData=byLoja[loja];
      var lojaLabel=LOJA_LABELS[loja]||loja;
      var lojaTotal=_sumObj(lojaData);
      var lojaKey='L:'+loja;
      var lojaOpen=!!_expanded[lojaKey];

      var lojaRow=_el('div','border-radius:10px;padding:13px 16px;margin-bottom:8px;cursor:pointer;border:1px solid #e0e0e0;user-select:none;');
      lojaRow.style.setProperty('background','#f5f5f5','important');
      lojaRow.addEventListener('mouseenter',function(){this.style.setProperty('background','#ebebeb','important');});
      lojaRow.addEventListener('mouseleave',function(){this.style.setProperty('background','#f5f5f5','important');});
      var lojaHdr=_el('div','display:flex;align-items:center;justify-content:space-between;gap:8px;');
      var lojaNom=_el('span','font-size:.95rem;font-weight:800;');
      lojaNom.style.setProperty('color','#111111','important');
      lojaNom.textContent=(lojaOpen?'▼ ':'▶ ')+lojaLabel;
      var lojaRight=_el('div','display:flex;align-items:center;gap:8px;');
      // Badge % vs año anterior: busca mismo período del año anterior en _allRows
      if(!isTotal&&f.from&&f.to){
        var prevFrom=String(parseInt(f.from.substring(0,4))-1)+f.from.substring(4);
        var prevTo=String(parseInt(f.to.substring(0,4))-1)+f.to.substring(4);
        var prevYrLabel=String(parseInt(f.from.substring(0,4))-1);
        var prevLojaTotal=_allRows.filter(function(r){
          return r.loja===loja&&r.data>=prevFrom&&r.data<=prevTo;
        }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        if(prevLojaTotal>0){
          var lojaDiff=(lojaTotal-prevLojaTotal)/prevLojaTotal*100;
          var lojaB=_el('span','font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap;');
          lojaB.style.setProperty('background',lojaDiff>=0?'#e6f4ed':'#fdecea','important');
          lojaB.style.setProperty('color',lojaDiff>=0?'#2a6a40':'#a03020','important');
          lojaB.textContent=(lojaDiff>=0?'↑ +':'↓ ')+lojaDiff.toFixed(1)+'% vs '+prevYrLabel;
          lojaRight.appendChild(lojaB);
        }
      }
      var lojaSum=_el('span','font-size:.95rem;font-weight:800;');
      lojaSum.style.setProperty('color','#111111','important');
      lojaSum.textContent=_fmtEur(lojaTotal);
      lojaRight.appendChild(lojaSum);
      lojaHdr.appendChild(lojaNom); lojaHdr.appendChild(lojaRight);
      lojaRow.appendChild(lojaHdr);
      c.appendChild(lojaRow);

      var yrsCont=_el('div','');
      yrsCont.style.display=lojaOpen?'block':'none';
      c.appendChild(yrsCont);

      lojaRow.addEventListener('click',function(){
        _expanded[lojaKey]=!_expanded[lojaKey];
        var o=_expanded[lojaKey];
        lojaNom.textContent=(o?'▼ ':'▶ ')+lojaLabel;
        yrsCont.style.display=o?'block':'none';
      });

      var years=Object.keys(lojaData).sort(function(a,b){return b-a;});
      years.forEach(function(yr){
        var yrData=lojaData[yr];
        var yrTotal=_sumObj(yrData);
        var yrKey=lojaKey+':Y:'+yr;
        var yrOpen=!!_expanded[yrKey];
        var prevYr=String(parseInt(yr)-1);

        var yrRow=_el('div','border-radius:8px;padding:9px 16px 9px 28px;margin-bottom:3px;cursor:pointer;border:1px solid #eeeeee;user-select:none;');
        yrRow.style.setProperty('background','#ffffff','important');
        yrRow.addEventListener('mouseenter',function(){this.style.setProperty('background','#f8f8f8','important');});
        yrRow.addEventListener('mouseleave',function(){this.style.setProperty('background','#ffffff','important');});
        var yrHdr=_el('div','display:flex;align-items:center;gap:10px;justify-content:space-between;');
        var yrLbl=_el('span','font-size:.85rem;font-weight:700;');
        yrLbl.style.setProperty('color','#222222','important');
        yrLbl.textContent=(yrOpen?'▼ ':'▶ ')+yr;
        var yrRight=_el('div','display:flex;align-items:center;gap:10px;');
        if(lojaData[prevYr]){
          var prevYrT=_sumObj(lojaData[prevYr]);
          if(prevYrT>0){
            var yrDiff=(yrTotal-prevYrT)/prevYrT*100;
            var yrB=_el('span','font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:10px;');
            yrB.style.setProperty('background',yrDiff>=0?'#e6f4ed':'#fdecea','important');
            yrB.style.setProperty('color',yrDiff>=0?'#2a6a40':'#a03020','important');
            yrB.textContent=(yrDiff>=0?'↑ +':'↓ ')+yrDiff.toFixed(1)+'% vs '+prevYr;
            yrRight.appendChild(yrB);
          }
        }
        var yrSum=_el('span','font-size:.85rem;font-weight:700;');
        yrSum.style.setProperty('color','#222222','important');
        yrSum.textContent=_fmtEur(yrTotal);
        yrRight.appendChild(yrSum);
        yrHdr.appendChild(yrLbl); yrHdr.appendChild(yrRight);
        yrRow.appendChild(yrHdr);
        yrsCont.appendChild(yrRow);

        var mosCont=_el('div','');
        mosCont.style.display=yrOpen?'block':'none';
        yrsCont.appendChild(mosCont);

        yrRow.addEventListener('click',function(e){
          e.stopPropagation();
          _expanded[yrKey]=!_expanded[yrKey];
          var o=_expanded[yrKey];
          yrLbl.textContent=(o?'▼ ':'▶ ')+yr;
          mosCont.style.display=o?'block':'none';
        });

        var months=Object.keys(yrData).sort();
        months.forEach(function(mo){
          var moRows=yrData[mo];
          var moTotal=moRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          var moKey=yrKey+':M:'+mo;
          var moOpen=!!_expanded[moKey];
          var moName=MESES_PT[parseInt(mo)-1]||mo;

          var moRow=_el('div','border-radius:7px;padding:7px 16px 7px 44px;margin-bottom:2px;cursor:pointer;border:1px solid #f0f0f0;user-select:none;');
          moRow.style.setProperty('background','#fafafa','important');
          moRow.addEventListener('mouseenter',function(){this.style.setProperty('background','#f0f0f0','important');});
          moRow.addEventListener('mouseleave',function(){this.style.setProperty('background','#fafafa','important');});
          var moHdr=_el('div','display:flex;align-items:center;gap:8px;justify-content:space-between;');
          var moLbl=_el('span','font-size:.8rem;font-weight:600;');
          moLbl.style.setProperty('color','#333333','important');
          moLbl.textContent=(moOpen?'▼ ':'▶ ')+moName+' '+yr;
          var moRight=_el('div','display:flex;align-items:center;gap:8px;');
          if(lojaData[prevYr]&&lojaData[prevYr][mo]){
            var prevMoT=lojaData[prevYr][mo].reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
            if(prevMoT>0){
              var moDiff=(moTotal-prevMoT)/prevMoT*100;
              var moB=_el('span','font-size:.62rem;font-weight:700;padding:1px 6px;border-radius:8px;');
              moB.style.setProperty('background',moDiff>=0?'#e6f4ed':'#fdecea','important');
              moB.style.setProperty('color',moDiff>=0?'#2a6a40':'#a03020','important');
              moB.textContent=(moDiff>=0?'+':'')+moDiff.toFixed(1)+'%';
              moRight.appendChild(moB);
            }
          }
          var moSum=_el('span','font-size:.8rem;font-weight:700;');
          moSum.style.setProperty('color','#333333','important');
          moSum.textContent=_fmtEur(moTotal);
          moRight.appendChild(moSum);
          moHdr.appendChild(moLbl); moHdr.appendChild(moRight);
          moRow.appendChild(moHdr);
          mosCont.appendChild(moRow);

          var daysCont=_el('div','');
          daysCont.style.display=moOpen?'block':'none';
          mosCont.appendChild(daysCont);

          moRow.addEventListener('click',function(e){
            e.stopPropagation();
            _expanded[moKey]=!_expanded[moKey];
            var o=_expanded[moKey];
            moLbl.textContent=(o?'▼ ':'▶ ')+moName+' '+yr;
            daysCont.style.display=o?'block':'none';
          });

          var daysSorted=moRows.slice().sort(function(a,b){return a.data>b.data?-1:1;});
          daysSorted.forEach(function(r){
            var dayVal=parseFloat(r.montante)||0;
            var dayRow=_el('div','display:flex;align-items:center;justify-content:space-between;padding:5px 16px 5px 60px;border-bottom:1px solid #f5f5f5;');
            dayRow.style.setProperty('background','#ffffff','important');
            var dayL=_el('div','display:flex;align-items:center;gap:10px;');
            var dayD=_el('span','font-size:.75rem;font-weight:600;width:80px;');
            dayD.style.setProperty('color','#333333','important');
            dayD.textContent=_fmtDate(r.data);
            var dayDow=_el('span','font-size:.68rem;width:28px;');
            dayDow.style.setProperty('color','#999999','important');
            dayDow.textContent=_dowStr(r.data);
            dayL.appendChild(dayD); dayL.appendChild(dayDow);
            var dayA=_el('span','font-size:.78rem;font-weight:700;');
            dayA.style.setProperty('color',dayVal===0?'#cccccc':'#111111','important');
            dayA.textContent=_fmtEur(dayVal);
            dayRow.appendChild(dayL); dayRow.appendChild(dayA);
            daysCont.appendChild(dayRow);
          });

          var moTR=_el('div','display:flex;justify-content:space-between;padding:6px 16px 6px 60px;border-top:2px solid #e0e0e0;');
          moTR.style.setProperty('background','#f0f0f0','important');
          var moTL=_el('span','font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;');
          moTL.style.setProperty('color','#555555','important'); moTL.textContent='Total '+moName;
          var moTV=_el('span','font-size:.78rem;font-weight:800;');
          moTV.style.setProperty('color','#111111','important'); moTV.textContent=_fmtEur(moTotal);
          moTR.appendChild(moTL); moTR.appendChild(moTV);
          daysCont.appendChild(moTR);
        });

        var yrTR=_el('div','display:flex;justify-content:space-between;padding:7px 16px 7px 28px;border-top:2px solid #dddddd;margin-top:2px;');
        yrTR.style.setProperty('background','#efefef','important');
        var yrTL=_el('span','font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;');
        yrTL.style.setProperty('color','#555555','important'); yrTL.textContent='Total '+yr;
        var yrTV=_el('span','font-size:.8rem;font-weight:800;');
        yrTV.style.setProperty('color','#111111','important'); yrTV.textContent=_fmtEur(yrTotal);
        yrTR.appendChild(yrTL); yrTR.appendChild(yrTV);
        mosCont.appendChild(yrTR);
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  //  MODO DOMINGO PS
  // ════════════════════════════════════════════════════════════
  function _renderDomingoPs(c) {
    var allDomRows=_allRows.filter(function(r){
      return ZONA_DOMINGO.indexOf(r.loja)>=0 && _strToDate(r.data).getDay()===0 && (parseFloat(r.montante)||0)>0;
    });

    // Agrupar por año
    var byYear={};
    allDomRows.forEach(function(r){
      var yr=r.data.substring(0,4);
      if(!byYear[yr])byYear[yr]=[];
      byYear[yr].push(r);
    });
    var years=Object.keys(byYear).sort(function(a,b){return b-a;});
    var currentYear=new Date().getFullYear().toString();
    var currentYearRows=byYear[currentYear]||[];
    var currentTotal=currentYearRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    var currentCount=(function(){var d={};currentYearRows.forEach(function(r){d[r.data]=true;});return Object.keys(d).length;})();

    // Header negro
    var hdr=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0e0e0;');
    hdr.style.setProperty('background','#1a1a1a','important');
    var hLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;');
    hLbl.style.setProperty('color','#888888','important');
    hLbl.textContent='DOMINGOS '+currentYear+' — MEZKA PS (Avenida · Mercado · Shana · Maxx)';
    hdr.appendChild(hLbl);
    var hVal=_el('div','font-size:2rem;font-weight:900;letter-spacing:-.02em;margin-bottom:4px;');
    hVal.style.setProperty('color','#ffffff','important');
    hVal.textContent=_fmtEur(currentTotal);
    hdr.appendChild(hVal);
    var hSub=_el('div','font-size:.72rem;');
    hSub.style.setProperty('color','#aaaaaa','important');
    hSub.textContent=currentCount+' domingos reais · média: '+_fmtEur(currentCount?currentTotal/currentCount:0)+'/domingo';
    hdr.appendChild(hSub);

    // Comparações com anos anteriores
    var prevYears=years.filter(function(y){return y!==currentYear;});
    if(prevYears.length){
      var cRow=_el('div','display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #333333;');
      prevYears.forEach(function(yr){
        var yrRows=byYear[yr];
        var yrTotal=yrRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var yrCount=(function(){var d={};yrRows.forEach(function(r){d[r.data]=true;});return Object.keys(d).length;})();
        // Comparar médias por domingo para que sea justo aunque haya distinto nº de domingos
        var avgCur=currentCount?currentTotal/currentCount:0;
        var avgPrev=yrCount?yrTotal/yrCount:0;
        var diff=avgPrev>0?(avgCur-avgPrev)/avgPrev*100:null;
        var cBox=_el('div','');
        var cLbl=_el('div','font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;');
        cLbl.style.setProperty('color','#666666','important');
        cLbl.textContent='vs '+yr+' ('+yrCount+' dom.)';
        cBox.appendChild(cLbl);
        var cLine=_el('div','display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;');
        var cVal=_el('span','font-size:.88rem;font-weight:800;');
        cVal.style.setProperty('color','#cccccc','important');
        cVal.textContent=_fmtEur(yrTotal);
        cLine.appendChild(cVal);
        var cAvg=_el('span','font-size:.72rem;');
        cAvg.style.setProperty('color','#777777','important');
        cAvg.textContent='('+_fmtEur(avgPrev)+'/dom)';
        cLine.appendChild(cAvg);
        if(diff!==null){
          var cD=_el('span','font-size:.78rem;font-weight:800;');
          cD.style.setProperty('color',diff>=0?'#4caf82':'#e05a5a','important');
          cD.textContent=(diff>=0?'↑ +':'↓ ')+diff.toFixed(1)+'% média/dom';
          cLine.appendChild(cD);
        }
        cBox.appendChild(cLine);
        cRow.appendChild(cBox);
      });
      hdr.appendChild(cRow);
    }
    c.appendChild(hdr);

    // Detalhe: cada año con sus domingos
    var treeLabel=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    treeLabel.style.setProperty('color','#999999','important');
    treeLabel.textContent='DETALHE POR ANO — clique para expandir';
    c.appendChild(treeLabel);

    years.forEach(function(yr){
      var yrRows=byYear[yr].slice().sort(function(a,b){return a.data>b.data?-1:1;});
      var yrTotal=yrRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var yrKey='DOM:Y:'+yr;
      var yrOpen=!!_expanded[yrKey];

      var yrRow=_el('div','border-radius:10px;padding:13px 16px;margin-bottom:8px;cursor:pointer;border:1px solid #e0e0e0;user-select:none;');
      yrRow.style.setProperty('background','#f5f5f5','important');
      yrRow.addEventListener('mouseenter',function(){this.style.setProperty('background','#ebebeb','important');});
      yrRow.addEventListener('mouseleave',function(){this.style.setProperty('background','#f5f5f5','important');});
      var yrHdr=_el('div','display:flex;align-items:center;justify-content:space-between;');
      var yrNom=_el('span','font-size:.95rem;font-weight:800;');
      yrNom.style.setProperty('color','#111111','important');
      yrNom.textContent=(yrOpen?'▼ ':'▶ ')+yr+(yr===currentYear?' ★':'');
      var yrSum=_el('span','font-size:.95rem;font-weight:800;');
      yrSum.style.setProperty('color','#111111','important');
      yrSum.textContent=_fmtEur(yrTotal)+' ('+yrRows.length+' dom.)';
      yrHdr.appendChild(yrNom); yrHdr.appendChild(yrSum);
      yrRow.appendChild(yrHdr);
      c.appendChild(yrRow);

      var domCont=_el('div','');
      domCont.style.display=yrOpen?'block':'none';
      c.appendChild(domCont);

      yrRow.addEventListener('click',function(){
        _expanded[yrKey]=!_expanded[yrKey];
        var o=_expanded[yrKey];
        yrNom.textContent=(o?'▼ ':'▶ ')+yr+(yr===currentYear?' ★':'');
        domCont.style.display=o?'block':'none';
      });

      // Agrupar por loja dentro del año
      var byLojaD={};
      yrRows.forEach(function(r){
        if(!byLojaD[r.loja])byLojaD[r.loja]=[];
        byLojaD[r.loja].push(r);
      });
      ZONA_DOMINGO.forEach(function(loja){
        if(!byLojaD[loja])return;
        var lRows=byLojaD[loja].slice().sort(function(a,b){return a.data>b.data?-1:1;});
        var lTotal=lRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var lKey=yrKey+':L:'+loja;
        var lOpen=!!_expanded[lKey];
        var lLabel=LOJA_LABELS[loja]||loja;

        var lRow=_el('div','border-radius:8px;padding:9px 16px 9px 28px;margin-bottom:3px;cursor:pointer;border:1px solid #eeeeee;user-select:none;');
        lRow.style.setProperty('background','#ffffff','important');
        lRow.addEventListener('mouseenter',function(){this.style.setProperty('background','#f8f8f8','important');});
        lRow.addEventListener('mouseleave',function(){this.style.setProperty('background','#ffffff','important');});
        var lHdr=_el('div','display:flex;align-items:center;justify-content:space-between;');
        var lNom=_el('span','font-size:.85rem;font-weight:700;');
        lNom.style.setProperty('color','#222222','important');
        lNom.textContent=(lOpen?'▼ ':'▶ ')+lLabel;
        var lSum=_el('span','font-size:.85rem;font-weight:700;');
        lSum.style.setProperty('color','#222222','important');
        lSum.textContent=_fmtEur(lTotal);
        lHdr.appendChild(lNom); lHdr.appendChild(lSum);
        lRow.appendChild(lHdr);
        domCont.appendChild(lRow);

        var lDaysCont=_el('div','');
        lDaysCont.style.display=lOpen?'block':'none';
        domCont.appendChild(lDaysCont);

        lRow.addEventListener('click',function(e){
          e.stopPropagation();
          _expanded[lKey]=!_expanded[lKey];
          var o=_expanded[lKey];
          lNom.textContent=(o?'▼ ':'▶ ')+lLabel;
          lDaysCont.style.display=o?'block':'none';
        });

        lRows.forEach(function(r){
          var dayVal=parseFloat(r.montante)||0;
          var dayRow=_el('div','display:flex;align-items:center;justify-content:space-between;padding:5px 16px 5px 44px;border-bottom:1px solid #f5f5f5;');
          dayRow.style.setProperty('background','#ffffff','important');
          var dayL=_el('div','display:flex;align-items:center;gap:10px;');
          var dayD=_el('span','font-size:.75rem;font-weight:600;width:80px;');
          dayD.style.setProperty('color','#333333','important');
          dayD.textContent=_fmtDate(r.data);
          var dayDow=_el('span','font-size:.68rem;width:28px;');
          dayDow.style.setProperty('color','#4a7c59','important');
          dayDow.textContent='Dom';
          dayL.appendChild(dayD); dayL.appendChild(dayDow);
          var dayA=_el('span','font-size:.78rem;font-weight:700;');
          dayA.style.setProperty('color',dayVal===0?'#cccccc':'#111111','important');
          dayA.textContent=_fmtEur(dayVal);
          dayRow.appendChild(dayL); dayRow.appendChild(dayA);
          lDaysCont.appendChild(dayRow);
        });
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  //  MOTOR DE PROYECCIÓN
  // ════════════════════════════════════════════════════════════

  var ANOS_EXCLUIDOS = ['2020','2021']; // COVID — distorsionan proyecciones

  // Calcula proyección con trazabilidad completa
  // maxxDesde: fecha ISO desde la cual Maxx abrirá (opcional) — suma su contribución futura
  function _calcProjection(rows, from, to, today, maxxDesde) {
    var fromD=_strToDate(from), toD=_strToDate(to);
    var todayD=_strToDate(today||_todayStr());
    var totalDays=Math.round((toD-fromD)/86400000)+1;
    var doneDays=Math.min(Math.round((todayD-fromD)/86400000)+1, totalDays);
    if(doneDays<=0||doneDays>=totalDays) return null;
    var pctDone=doneDays/totalDays*100;

    // Acumulado real — todas las tiendas con datos reales
    var realAcum=rows.filter(function(r){return r.data>=from&&r.data<=today;})
      .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    if(realAcum<=0) return null;

    var fromMD=from.substring(5), toMD=to.substring(5);
    var currentYrStr=fromD.getFullYear().toString();
    var doneOffset=doneDays-1;

    // Histórico limpio — todas las tiendas sin modificaciones
    var yearsData={};
    rows.forEach(function(r){
      var yr=r.data.substring(0,4);
      if(yr===currentYrStr) return;
      if(ANOS_EXCLUIDOS.indexOf(yr)>=0) return;
      if((parseFloat(r.montante)||0)<=0) return;
      if(!yearsData[yr]) yearsData[yr]={done:0,total:0};
    });
    rows.forEach(function(r){
      var yr=r.data.substring(0,4);
      if(yr===currentYrStr) return;
      if(ANOS_EXCLUIDOS.indexOf(yr)>=0||!yearsData[yr]) return;
      var val=parseFloat(r.montante)||0;
      var yrFrom=yr+'-'+fromMD, yrTo=yr+'-'+toMD;
      if(r.data<yrFrom||r.data>yrTo) return;
      yearsData[yr].total+=val;
      var yrFromD=_strToDate(yrFrom);
      var yrCutD=new Date(yrFromD.getTime()+doneOffset*86400000);
      if(r.data<=_dateToStr(yrCutD)) yearsData[yr].done+=val;
    });

    // Ratio ponderado por recencia (año más reciente pesa más)
    var ratiosByYear={};
    var sortedYrs=Object.keys(yearsData).sort(function(a,b){return b-a;});
    var wSum=0,wRatioSum=0;
    sortedYrs.forEach(function(yr,i){
      var d=yearsData[yr];
      if(d.total>0&&d.done>0){
        var ratio=d.done/d.total;
        ratiosByYear[yr]={done:d.done,total:d.total,ratio:ratio,pct:ratio*100};
        var w=Math.pow(0.45,i);
        wSum+=w; wRatioSum+=w*ratio;
      }
    });
    var pctHistorico=wSum>0?wRatioSum/wSum:pctDone/100;
    var valorProjetado=pctHistorico>0?realAcum/pctHistorico:realAcum/(pctDone/100);

    // ── Contribución futura de Maxx desde maxxDesde
    var maxxContribFutura=0;
    var maxxDetalleFuturo=[];
    if(maxxDesde&&maxxDesde>today&&maxxDesde<=to){
      // Media histórica de Maxx por mes — ponderada por recencia, usando días con venta
      var maxxByMes={};
      _allRows.forEach(function(r){
        if(r.loja!=='MAXX') return;
        var yr=r.data.substring(0,4);
        if(yr===currentYrStr||ANOS_EXCLUIDOS.indexOf(yr)>=0) return;
        var val=parseFloat(r.montante)||0;
        if(val<=0) return;
        var mes=parseInt(r.data.substring(5,7));
        if(!maxxByMes[mes]) maxxByMes[mes]={};
        if(!maxxByMes[mes][yr]) maxxByMes[mes][yr]={sum:0,dias:0};
        maxxByMes[mes][yr].sum+=val;
        maxxByMes[mes][yr].dias++;
      });

      // Días desde maxxDesde hasta fin del período
      var dIter=new Date(_strToDate(maxxDesde).getTime());
      var diasPorMes={};
      while(_dateToStr(dIter)<=to){
        var mes=dIter.getMonth()+1;
        diasPorMes[mes]=(diasPorMes[mes]||0)+1;
        dIter.setDate(dIter.getDate()+1);
      }

      Object.keys(diasPorMes).sort(function(a,b){return a-b;}).forEach(function(mes){
        var nDias=diasPorMes[mes];
        var mData=maxxByMes[parseInt(mes)];
        if(!mData||!Object.keys(mData).length){
          maxxDetalleFuturo.push({mes:parseInt(mes),nDias:nDias,media:0,total:0,nota:'sem histórico'});
          return;
        }
        // Media por día abierto ponderada por recencia entre años
        var anosYrs=Object.keys(mData).sort(function(a,b){return b-a;});
        var yw=0,ywSum=0,ywDias=0,ywDiasSum=0;
        anosYrs.forEach(function(yr,i){
          var ad=mData[yr];
          var mediaDiaAno=ad.dias>0?ad.sum/ad.dias:0;
          if(mediaDiaAno>0){
            var w=Math.pow(0.45,i);
            yw+=w; ywSum+=w*mediaDiaAno;
            ywDias+=w; ywDiasSum+=w*ad.dias;
          }
        });
        var mediaDia=yw>0?ywSum/yw:0;
        // Dias abertos esperados = media ponderada historica (nao dias de calendario)
        var diasAbiertosEsperados=ywDias>0?Math.round(ywDiasSum/ywDias):nDias;
        var contrib=diasAbiertosEsperados*mediaDia;
        maxxContribFutura+=contrib;
        maxxDetalleFuturo.push({mes:parseInt(mes),nDias:nDias,diasAbertos:diasAbiertosEsperados,media:mediaDia,total:contrib,anos:anosYrs.length});
      });
      valorProjetado+=maxxContribFutura;
    }

    var anosExcluidos=sortedYrs.filter(function(yr){return !ratiosByYear[yr];});

    return {
      realAcum:realAcum,
      valorProjetado:valorProjetado,
      pctDone:pctDone,
      pctHistorico:pctHistorico*100,
      diasRestantes:totalDays-doneDays,
      totalDays:totalDays,
      doneDays:doneDays,
      anosBase:Object.keys(ratiosByYear),
      maxxContribFutura:maxxContribFutura,
      maxxDetalleFuturo:maxxDetalleFuturo,
      traza:{
        from:from, to:to, today:today,
        totalDays:totalDays, doneDays:doneDays,
        pctLineal:pctDone,
        pctHistoricoUsado:pctHistorico*100,
        realAcum:realAcum,
        valorProjetado:valorProjetado,
        ratiosByYear:ratiosByYear,
        anosExcluidosCovid:ANOS_EXCLUIDOS,
        anosExcluidosSinDatos:anosExcluidos,
        maxxDesde:maxxDesde||null,
        maxxContribFutura:maxxContribFutura,
        maxxDetalleFuturo:maxxDetalleFuturo,
        formula:'Proyectado = (Real acumulado ÷ % histórico)'+(maxxContribFutura>0?' + Maxx desde '+_fmtDate(maxxDesde):'')
      }
    };
  }

  // Proyección domingos mes a mes con controles de tiendas y mes límite
  // lojaActivas: array de lojas incluidas, mesFin: 1-12 (último mes donde abrirá domingos)
  function _calcProjectionDomingos(allRows, today, lojasActivas, mesFin) {
    var todayD=_strToDate(today);
    var currentYear=todayD.getFullYear();
    var yrStr=String(currentYear);
    lojasActivas=lojasActivas||ZONA_DOMINGO;
    mesFin=mesFin||12;

    // Domingos reales este año hasta hoy — solo tiendas activas
    var domRows=allRows.filter(function(r){
      return lojasActivas.indexOf(r.loja)>=0&&_strToDate(r.data).getDay()===0&&r.data.substring(0,4)===yrStr;
    });
    var domFechas={};
    domRows.forEach(function(r){domFechas[r.data]=(domFechas[r.data]||0)+(parseFloat(r.montante)||0);});
    var domDates=Object.keys(domFechas).sort();
    var domReales=(function(){var u={};domDates.forEach(function(d){u[d]=true;});return Object.keys(u).length;})();
    var totalReal=domDates.reduce(function(s,d){return s+domFechas[d];},0);
    var mediaActual=domReales>0?totalReal/domReales:0;

    // ── Media histórica POR MES
    // Regla simple y correcta:
    // - Para meses donde 2025 tuvo domingos (jun/jul/ago): usar 2025 directamente al 100%
    //   Es el único año comparable (día completo, mismas tiendas)
    // - Para meses sin histórico comparable (abr/may): usar tendencia real de 2026
    //   ajustada por ratio estacional de días normales del año actual

    var ANO_REFERENCIA = '2025'; // único año con día completo y mismas tiendas

    // Media por domingo de 2025, por mes, por las tiendas activas
    var media2025ByMes = {};
    allRows.forEach(function(r){
      var yr = r.data.substring(0,4);
      if(yr !== ANO_REFERENCIA) return;
      if(lojasActivas.indexOf(r.loja) < 0) return;
      if(_strToDate(r.data).getDay() !== 0) return;
      var val = parseFloat(r.montante)||0;
      if(val <= 0) return;
      var mes = parseInt(r.data.substring(5,7));
      if(!media2025ByMes[mes]) media2025ByMes[mes] = {sum:0, dates:{}};
      media2025ByMes[mes].dates[r.data] = true;
      media2025ByMes[mes].sum += val;
    });
    // Convertir a media por domingo
    var mediaByMes = {};
    for(var m=1; m<=12; m++){
      var d2025 = media2025ByMes[m];
      if(!d2025) { mediaByMes[m] = null; continue; }
      var nd = Object.keys(d2025.dates).length;
      mediaByMes[m] = nd > 0 ? d2025.sum / nd : null;
    }

    // Factor de crecimiento 2026 vs 2025 calculado por tienda
    // ponderado por el peso real de cada tienda en los domingos de 2025
    // Usando todos los datos disponibles de 2026 vs mismo período de 2025
    var periodoHasta = today; // hasta hoy en ambos años
    var periodoDesde2026 = yrStr + '-01-01';
    var periodoDesde2025 = '2025-01-01';
    var periodoHasta2025 = '2025-' + today.substring(5); // mismo mes/día en 2025

    var factorPorLoja = {};
    lojasActivas.forEach(function(loja){
      var tot2026 = allRows.filter(function(r){
        return r.loja===loja && r.data>=periodoDesde2026 && r.data<=periodoHasta;
      }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var tot2025 = allRows.filter(function(r){
        return r.loja===loja && r.data>=periodoDesde2025 && r.data<=periodoHasta2025;
      }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      factorPorLoja[loja] = (tot2025>0 && tot2026>0) ? tot2026/tot2025 : null;
    });

    // Peso de cada tienda en domingos de 2025
    var totalDom2025 = 0;
    var pesoPorLoja = {};
    lojasActivas.forEach(function(loja){
      var s = allRows.filter(function(r){
        return r.loja===loja && r.data.substring(0,4)==='2025' && _strToDate(r.data).getDay()===0;
      }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      pesoPorLoja[loja] = s;
      totalDom2025 += s;
    });

    // Factor ponderado final
    var factorCrecimiento = 1;
    if(totalDom2025 > 0){
      var fSum = 0, fW = 0;
      lojasActivas.forEach(function(loja){
        var f = factorPorLoja[loja];
        if(f===null) return;
        var w = pesoPorLoja[loja]/totalDom2025;
        fSum += f*w; fW += w;
      });
      if(fW > 0){
        factorCrecimiento = fSum/fW;
        // Limitar entre 0.85 y 1.5
        factorCrecimiento = Math.max(0.85, Math.min(1.5, factorCrecimiento));
      }
    }

    // Aplicar factor a los meses con referencia 2025
    for(var m=1; m<=12; m++){
      if(mediaByMes[m] !== null) mediaByMes[m] = mediaByMes[m] * factorCrecimiento;
    }
    // Para proyectar meses sin histórico dominical comparable
    var mediaSemanalByMes = {};
    allRows.forEach(function(r){
      if(r.data.substring(0,4) !== yrStr) return;
      if(lojasActivas.indexOf(r.loja) < 0) return;
      var dow = _strToDate(r.data).getDay();
      if(dow === 0 || dow === 6) return;
      var val = parseFloat(r.montante)||0;
      if(val <= 0) return;
      var mes = parseInt(r.data.substring(5,7));
      if(!mediaSemanalByMes[mes]) mediaSemanalByMes[mes] = {sum:0,n:0};
      mediaSemanalByMes[mes].sum += val;
      mediaSemanalByMes[mes].n++;
    });
    var mesesConDatos = Object.keys(mediaSemanalByMes);
    var mediaSemanalGlobal = mesesConDatos.length > 0
      ? mesesConDatos.reduce(function(s,m){ return s + mediaSemanalByMes[m].sum/mediaSemanalByMes[m].n; }, 0) / mesesConDatos.length
      : 1;

    // Domingos restantes mes a mes hasta mesFin
    var d=new Date(todayD); d.setDate(d.getDate()+1);
    var yearEnd=new Date(currentYear,11,31);
    var domRestantesPorMes={};
    while(d<=yearEnd){
      if(d.getDay()===0){
        var mes=d.getMonth()+1;
        if(mes<=mesFin){
          domRestantesPorMes[mes]=(domRestantesPorMes[mes]||0)+1;
        }
      }
      d.setDate(d.getDate()+1);
    }

    // Proyección mes a mes
    var proyFuturoPorMes={};
    var proyFuturo=0;
    Object.keys(domRestantesPorMes).forEach(function(mes){
      var nDom = domRestantesPorMes[mes];
      var histMes = mediaByMes[parseInt(mes)]; // media real de 2025 para ese mes
      var mediaMes, nota;

      if(histMes != null){
        // 2025 tuvo domingos en este mes → usar directamente como referencia
        mediaMes = histMes;
        nota = '2025';
      } else {
        // Sin histórico comparable → tendencia real 2026 ajustada por estacionalidad
        var mSem = mediaSemanalByMes[parseInt(mes)];
        var ratioMes = (mSem && mSem.n > 0 && mediaSemanalGlobal > 0)
          ? (mSem.sum/mSem.n) / mediaSemanalGlobal
          : 1;
        mediaMes = mediaActual * ratioMes;
        nota = 'tendência '+yrStr;
      }

      proyFuturoPorMes[mes] = {nDom:nDom, media:mediaMes, total:nDom*mediaMes, hist:histMes, nota:nota};
      proyFuturo += nDom * mediaMes;
    });
    var totalProyectado=totalReal+proyFuturo;

    // Total domingos del año
    var d2=new Date(currentYear,0,1),ye=new Date(currentYear,11,31),totalDomAnio=0;
    while(d2<=ye){if(d2.getDay()===0)totalDomAnio++;d2.setDate(d2.getDate()+1);}
    var domRestantes=Object.keys(domRestantesPorMes).reduce(function(s,k){return s+(domRestantesPorMes[k]||0);},0);

    return {
      domReales:domReales, totalReal:totalReal, mediaActual:mediaActual,
      domRestantes:domRestantes, totalDomAnio:totalDomAnio,
      proyFuturoPorMes:proyFuturoPorMes, proyFuturo:proyFuturo,
      totalProyectado:totalProyectado, mediaByMes:mediaByMes,
      lojasActivas:lojasActivas, mesFin:mesFin
    };
  }

  // Estado de controles domingos
  var _domLojasActivas=ZONA_DOMINGO.slice();
  var _domMesFin=12;

  function _renderProyDomingos(c,today){
    var currentYear=_strToDate(today).getFullYear();

    // ── Controles
    var ctrlWrap=_el('div','border-radius:12px;padding:14px 16px;margin-bottom:16px;border:1px solid #e0e0e0;');
    ctrlWrap.style.setProperty('background','#fafafa','important');

    // Mes límite
    var mesWrap=_el('div','display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;');
    var mesLbl=_el('span','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;');
    mesLbl.style.setProperty('color','#888888','important');
    mesLbl.textContent='Abrir domingos até:';
    mesWrap.appendChild(mesLbl);
    for(var m=1;m<=12;m++){
      (function(mes){
        var mb=_el('div','padding:4px 10px;border-radius:14px;font-size:.72rem;font-weight:800;cursor:pointer;border:1.5px solid;font-family:MontserratLight,sans-serif;');
        var isAct=_domMesFin===mes;
        mb.style.setProperty('background',isAct?'#4a7c59':'#2a2a2a','important');
        mb.style.setProperty('color','#ffffff','important');
        mb.style.setProperty('border-color',isAct?'#4a7c59':'#555','important');
        mb.textContent=MESES_PT[mes-1].substring(0,3);
        mb.addEventListener('click',function(){_domMesFin=mes;_renderProyeccion();});
        mesWrap.appendChild(mb);
      })(m);
    }
    ctrlWrap.appendChild(mesWrap);

    // Toggles de tiendas
    var lojaWrap=_el('div','display:flex;align-items:center;gap:8px;flex-wrap:wrap;');
    var lojaLbl=_el('span','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;');
    lojaLbl.style.setProperty('color','#888888','important');
    lojaLbl.textContent='Tiendas:';
    lojaWrap.appendChild(lojaLbl);
    ZONA_DOMINGO.forEach(function(loja){
      var isAct=_domLojasActivas.indexOf(loja)>=0;
      var lb=_el('div','padding:4px 10px;border-radius:14px;font-size:.72rem;font-weight:800;cursor:pointer;border:1.5px solid;font-family:MontserratLight,sans-serif;');
      lb.style.setProperty('background',isAct?'#4a7c59':'#2a2a2a','important');
      lb.style.setProperty('color','#ffffff','important');
      lb.style.setProperty('border-color',isAct?'#4a7c59':'#555','important');
      lb.textContent=LOJA_LABELS[loja]||loja;
      lb.addEventListener('click',function(){
        var idx=_domLojasActivas.indexOf(loja);
        if(idx>=0){if(_domLojasActivas.length>1)_domLojasActivas.splice(idx,1);}
        else{_domLojasActivas.push(loja);}
        _renderProyeccion();
      });
      lojaWrap.appendChild(lb);
    });
    ctrlWrap.appendChild(lojaWrap);
    c.appendChild(ctrlWrap);

    // ── Calcular proyección con controles
    var proj=_calcProjectionDomingos(_allRows,today,_domLojasActivas,_domMesFin);

    // ── Header negro
    var hdr=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #e0e0e0;');
    hdr.style.setProperty('background','#1a1a1a','important');
    var hLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;');
    hLbl.style.setProperty('color','#888888','important');
    hLbl.textContent='PROJECÇÃO DOMINGOS '+currentYear+' — até '+MESES_PT[_domMesFin-1];
    hdr.appendChild(hLbl);

    if(!proj||proj.domReales===0){
      var noData=_el('div','font-size:.82rem;');
      noData.style.setProperty('color','#aaaaaa','important');
      noData.textContent='Sem dados de domingos registados para as lojas seleccionadas.';
      hdr.appendChild(noData);
    } else {
      var hVal=_el('div','font-size:2rem;font-weight:900;letter-spacing:-.02em;margin-bottom:2px;');
      hVal.style.setProperty('color','#ffffff','important');
      hVal.textContent=_fmtEur(proj.totalReal);
      hdr.appendChild(hVal);
      var hSub=_el('div','font-size:.72rem;margin-bottom:10px;');
      hSub.style.setProperty('color','#aaaaaa','important');
      hSub.textContent=proj.domReales+' domingos reais · média actual: '+_fmtEur(proj.mediaActual)+'/dom';
      hdr.appendChild(hSub);

      var projSec=_el('div','padding-top:10px;border-top:1px solid #333333;');
      var projLbl=_el('div','font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;');
      projLbl.style.setProperty('color','#4a7c59','important');
      projLbl.textContent='PROJECÇÃO TOTAL (real + futuro)';
      projSec.appendChild(projLbl);
      var projRow=_el('div','display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px;');
      var projVal=_el('span','font-size:1.3rem;font-weight:900;');
      projVal.style.setProperty('color','#4caf82','important');
      projVal.textContent=_fmtEur(proj.totalProyectado);
      projRow.appendChild(projVal);
      var projExtra=_el('span','font-size:.72rem;');
      projExtra.style.setProperty('color','#888888','important');
      projExtra.textContent='+'+_fmtEur(proj.proyFuturo)+' projetado ('+proj.domRestantes+' dom. restantes)';
      projRow.appendChild(projExtra);
      projSec.appendChild(projRow);

      // Desglose mes a mes
      var mesesConDom=Object.keys(proj.proyFuturoPorMes).sort(function(a,b){return a-b;});
      if(mesesConDom.length){
        var mesGrid=_el('div','display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;');
        mesesConDom.forEach(function(mes){
          var md=proj.proyFuturoPorMes[mes];
          var mBox=_el('div','border-radius:8px;padding:6px 10px;min-width:80px;');
          mBox.style.setProperty('background','#2a2a2a','important');
          var mNom=_el('div','font-size:.58rem;font-weight:800;text-transform:uppercase;');
          mNom.style.setProperty('color','#888888','important');
          mNom.textContent=MESES_PT[parseInt(mes)-1].substring(0,3)+' ('+md.nDom+' dom)';
          mBox.appendChild(mNom);
          var mVal=_el('div','font-size:.78rem;font-weight:800;');
          mVal.style.setProperty('color','#ffffff','important');
          mVal.textContent=_fmtEur(md.total);
          mBox.appendChild(mVal);
          if(md.hist!=null){
            var mHist=_el('div','font-size:.58rem;');
            mHist.style.setProperty('color','#666666','important');
            mHist.textContent='hist: '+_fmtEur(md.hist)+'/dom';
            mBox.appendChild(mHist);
          }
          mesGrid.appendChild(mBox);
        });
        projSec.appendChild(mesGrid);
      }
      hdr.appendChild(projSec);
    }
    c.appendChild(hdr);

    // Botón fijar
    if(proj&&proj.domReales>0){
      var fixBtn=_el('div','padding:8px 20px;border-radius:10px;font-size:.78rem;font-weight:800;cursor:pointer;text-align:center;border:1.5px solid #4a7c59;margin-bottom:16px;font-family:MontserratLight,sans-serif;display:inline-block;');
      fixBtn.style.setProperty('background','transparent','important');
      fixBtn.style.setProperty('color','#4a7c59','important');
      fixBtn.textContent='📌 Fixar Projecção Domingos';
      fixBtn.addEventListener('click',function(){
        var nota=window.prompt('Nota opcional (ex: até Agosto, Maxx excluída):','');
        if(nota===null) return;
        fixBtn.textContent='A guardar…';fixBtn.style.opacity='.6';fixBtn.style.pointerEvents='none';
        var payload={
          periodo_tipo:'DOMINGOS_ANO',periodo_ano:currentYear,zona:'MEZKA_PS',
          fecha_fijacion:today,dias_completados:proj.domReales,dias_totales:proj.totalDomAnio,
          pct_completado:parseFloat((proj.domReales/proj.totalDomAnio*100).toFixed(2)),
          valor_real_acumulado:parseFloat(proj.totalReal.toFixed(2)),
          valor_proyectado:parseFloat(proj.totalProyectado.toFixed(2)),
          valor_base_historica:parseFloat(proj.mediaActual.toFixed(2)),
          anos_base_usados:'mes-a-mes',
          nota:(nota||'')+' | até '+MESES_PT[_domMesFin-1]+' | lojas: '+_domLojasActivas.map(function(l){return LOJA_LABELS[l]||l;}).join(',')
        };
        sbAdmin.from('proyecciones_guardadas').upsert(payload,{onConflict:'periodo_tipo,periodo_ano,zona,fecha_fijacion'})
          .then(function(res){
            if(res.error){fixBtn.textContent='✗ Erro';fixBtn.style.opacity='1';fixBtn.style.pointerEvents='';}
            else{fixBtn.textContent='✓ Fixado!';fixBtn.style.setProperty('background','#4a7c59','important');fixBtn.style.setProperty('color','#fff','important');fixBtn.style.opacity='1';}
          }).catch(function(){fixBtn.textContent='✗ Erro';fixBtn.style.opacity='1';fixBtn.style.pointerEvents='';});
      });
      c.appendChild(fixBtn);
    }

    _renderProyFijadas(c,currentYear,'MEZKA_PS');
  }

  // ════════════════════════════════════════════════════════════
  //  MOTOR DE DIAGNÓSTICO
  // ════════════════════════════════════════════════════════════

  function _calcDiagnostico(loja, allRows) {
    var lojaRows=allRows.filter(function(r){return r.loja===loja;});
    var byYear={};
    lojaRows.forEach(function(r){
      var yr=r.data.substring(0,4);
      if(!byYear[yr]){byYear[yr]={total:0,diasAbiertos:0,diasRegistrados:0};}
      byYear[yr].diasRegistrados++;
      var v=parseFloat(r.montante)||0;
      byYear[yr].total+=v;
      if(v>0) byYear[yr].diasAbiertos++;
    });
    var years=Object.keys(byYear).sort();
    var result=[];
    years.forEach(function(yr,i){
      var d=byYear[yr];
      var mediaDia=d.diasAbiertos>0?d.total/d.diasAbiertos:0;
      var prev=i>0?byYear[years[i-1]]:null;
      var prevMedia=prev&&prev.diasAbiertos>0?prev.total/prev.diasAbiertos:0;
      var diffTotal=prev&&prev.total>0?(d.total-prev.total)/prev.total*100:null;
      var diffMedia=prevMedia>0?(mediaDia-prevMedia)/prevMedia*100:null;
      var diffDias=prev?(d.diasAbiertos-prev.diasAbiertos):null;
      // Coste de oportunidad: si hubiera abierto los mismos días que el año anterior
      var costeOportunidad=null;
      if(prev&&diffDias<0&&mediaDia>0){
        costeOportunidad=Math.abs(diffDias)*mediaDia;
      }
      result.push({
        yr:yr, total:d.total, diasAbiertos:d.diasAbiertos,
        diasRegistrados:d.diasRegistrados, mediaDia:mediaDia,
        diffTotal:diffTotal, diffMedia:diffMedia,
        diffDias:diffDias, costeOportunidad:costeOportunidad,
        inflexion:diffTotal!==null&&Math.abs(diffTotal)>=20
      });
    });
    return result;
  }

  // ════════════════════════════════════════════════════════════
  //  TAB PROYECCIÓN
  // ════════════════════════════════════════════════════════════

  var _proyTab='general';
  var _proyZona='TODAS';
  var _proySimulacion={};

  // Configuración global de Maxx — persiste en Supabase (tabla configuracion_maxx)
  var _maxxConfig={loaded:false,inicio:null,fin:null};

  function _loadMaxxConfig(callback){
    if(_maxxConfig.loaded){if(callback)callback();return;}
    var currentYear=new Date().getFullYear();
    sbAdmin.from('configuracion_maxx').select('*').eq('ano',currentYear).limit(1)
      .then(function(res){
        var r=res.data&&res.data[0];
        if(r){_maxxConfig.inicio=r.fecha_inicio;_maxxConfig.fin=r.fecha_fin;}
        _maxxConfig.loaded=true;
        if(callback)callback();
      }).catch(function(){_maxxConfig.loaded=true;if(callback)callback();});
  }

  function _saveMaxxConfig(inicio,fin,callback){
    var currentYear=new Date().getFullYear();
    var payload={ano:currentYear,fecha_inicio:inicio,fecha_fin:fin,updated_at:new Date().toISOString()};
    sbAdmin.from('configuracion_maxx').upsert(payload,{onConflict:'ano'})
      .then(function(res){
        if(!res.error){_maxxConfig.inicio=inicio;_maxxConfig.fin=fin;}
        if(callback)callback(res.error);
      }).catch(function(e){if(callback)callback(e);});
  }

  // Calcula intersección de la config de Maxx con un período dado
  function _maxxRangoParaPeriodo(pFrom,pTo){
    var inicio=_maxxConfig.inicio,fin=_maxxConfig.fin;
    if(!inicio||!fin) return null;
    var desde=inicio>pFrom?inicio:pFrom;
    var hasta=fin<pTo?fin:pTo;
    if(desde>hasta) return null;
    return {desde:desde,hasta:hasta};
  }

  function _renderProyeccion(){
    var c=_getContent();if(!c)return;
    c.innerHTML='';_setupContent(c);
    var today=_todayStr();

    // ── Sub-tabs
    var subTabsWrap=_el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;justify-content:center;');
    var subTabs=[
      {id:'general',label:'📈 Projecção Geral'},
      {id:'domingos',label:'🌿 Domingos Ps'},
      {id:'diagnostico',label:'🔬 Diagnóstico'}
    ];
    subTabs.forEach(function(st){
      var btn=_el('div','padding:8px 18px;border-radius:20px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:MontserratLight,sans-serif;border:1.5px solid;');
      var isAct=_proyTab===st.id;
      btn.style.setProperty('background',isAct?'#1a1a1a':'#f0f0f0','important');
      btn.style.setProperty('color',isAct?'#ffffff':'#444444','important');
      btn.style.setProperty('border-color',isAct?'#1a1a1a':'#dddddd','important');
      btn.textContent=st.label;
      btn.addEventListener('click',function(){_proyTab=st.id;_renderProyeccion();});
      subTabsWrap.appendChild(btn);
    });
    c.appendChild(subTabsWrap);

    if(_proyTab==='general')     _renderProyGeneral(c,today);
    if(_proyTab==='domingos')    _renderProyDomingos(c,today);
    if(_proyTab==='diagnostico') _renderProyDiagnostico(c);
  }

  // ── Proyección general: Q1-Q4 + Año + Alertas + Simulador
  function _renderProyGeneral(c,today){
    var currentYear=_strToDate(today).getFullYear();

    // Cargar config Maxx si no está en memoria, luego renderizar
    if(!_maxxConfig.loaded){
      var loadMsg=_el('div','font-size:.78rem;padding:20px;text-align:center;');
      loadMsg.style.setProperty('color','#aaaaaa','important');
      loadMsg.textContent='A carregar configuração…';
      c.appendChild(loadMsg);
      _loadMaxxConfig(function(){_renderProyeccion();});
      return;
    }

    // Selector de zona
    var zonaWrap=_el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;justify-content:center;');
    var zonas=[
      {k:'TODAS',l:'Todas',lojas:LOJAS},
      {k:'PARFOIS',l:'Parfois',lojas:ZONA_PARFOIS},
      {k:'PRIMAVERA',l:'Primavera',lojas:ZONA_PRIMAVERA},
      {k:'MEZKA_PS',l:'Mezka Ps',lojas:ZONA_MEZKAPS},
      {k:'MEZKA_FNC',l:'Mezka Fnc',lojas:ZONA_MEZKAFNC}
    ];
    zonas.forEach(function(z){
      var btn=_el('div','padding:5px 14px;border-radius:16px;font-size:.72rem;font-weight:800;cursor:pointer;border:1.5px solid;font-family:MontserratLight,sans-serif;');
      var isAct=_proyZona===z.k;
      btn.style.setProperty('background',isAct?'#4a7c59':'#2a2a2a','important');
      btn.style.setProperty('color','#ffffff','important');
      btn.style.setProperty('border-color',isAct?'#4a7c59':'#555','important');
      btn.textContent=z.l;
      btn.addEventListener('click',function(){_proyZona=z.k;_renderProyeccion();});
      zonaWrap.appendChild(btn);
    });
    c.appendChild(zonaWrap);

    var zonaActiva=zonas.find(function(z){return z.k===_proyZona;})||zonas[0];
    var rows=_allRows.filter(function(r){return zonaActiva.lojas.indexOf(r.loja)>=0;});
    var maxxNaZona=zonaActiva.lojas.indexOf('MAXX')>=0;

    // Usar o último dia com dados completos para a zona activa.
    // Se hoje ainda não tem dados carregados, a projecção usa ontem (ou o último
    // dia completo), evitando contar dias sem facturação no denominador histórico.
    var effectiveToday=_lastCompleteDay(zonaActiva.lojas);
    // Nunca ultrapassar o dia de hoje real (segurança)
    if(effectiveToday>today) effectiveToday=today;

    // ── Panel global de configuração Maxx
    if(maxxNaZona){
      var maxxPanel=_el('div','border-radius:12px;padding:14px 18px;margin-bottom:16px;border:1.5px solid;');
      var maxxHasConfig=_maxxConfig.inicio&&_maxxConfig.fin;
      maxxPanel.style.setProperty('border-color',maxxHasConfig?'#4a7c59':'#e0e0e0','important');
      maxxPanel.style.setProperty('background',maxxHasConfig?'#f1f8f4':'#fafafa','important');

      var maxxPanelHdr=_el('div','display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px;');
      var maxxPanelTtl=_el('div','font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;');
      maxxPanelTtl.style.setProperty('color',maxxHasConfig?'#4a7c59':'#888888','important');
      maxxPanelTtl.textContent='🏪 Configuração Maxx '+currentYear;
      maxxPanelHdr.appendChild(maxxPanelTtl);

      if(maxxHasConfig){
        var qRanges={Q1:{from:currentYear+'-01-01',to:currentYear+'-03-31'},Q2:{from:currentYear+'-04-01',to:currentYear+'-06-30'},Q3:{from:currentYear+'-07-01',to:currentYear+'-09-30'},Q4:{from:currentYear+'-10-01',to:currentYear+'-12-31'}};
        var qAfect=['Q1','Q2','Q3','Q4'].filter(function(q){return !!_maxxRangoParaPeriodo(qRanges[q].from,qRanges[q].to);});
        var qBadge=_el('span','font-size:.62rem;font-weight:700;padding:2px 10px;border-radius:10px;');
        qBadge.style.setProperty('background','#e6f4ed','important');
        qBadge.style.setProperty('color','#2a6a40','important');
        qBadge.textContent='Afecta: '+qAfect.join(', ');
        maxxPanelHdr.appendChild(qBadge);
      }
      maxxPanel.appendChild(maxxPanelHdr);

      var maxxInputRow=_el('div','display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;');
      var iS='padding:6px 10px;font-size:.78rem;font-weight:700;border:1.5px solid #cccccc;border-radius:8px;font-family:MontserratLight,sans-serif;outline:none;';

      var gInicio=_el('div','display:flex;flex-direction:column;gap:3px;');
      var lInicio=_el('label','font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;');
      lInicio.style.setProperty('color','#888888','important');lInicio.textContent='Início';
      var inpInicio=_el('input',iS);inpInicio.type='date';inpInicio.value=_maxxConfig.inicio||'';
      inpInicio.style.setProperty('background','#ffffff','important');inpInicio.style.setProperty('color','#111111','important');
      gInicio.appendChild(lInicio);gInicio.appendChild(inpInicio);

      var gFin=_el('div','display:flex;flex-direction:column;gap:3px;');
      var lFin=_el('label','font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;');
      lFin.style.setProperty('color','#888888','important');lFin.textContent='Fim';
      var inpFin=_el('input',iS);inpFin.type='date';inpFin.value=_maxxConfig.fin||'';
      inpFin.style.setProperty('background','#ffffff','important');inpFin.style.setProperty('color','#111111','important');
      gFin.appendChild(lFin);gFin.appendChild(inpFin);

      var saveBtn=_el('div','padding:6px 16px;border-radius:8px;font-size:.72rem;font-weight:800;cursor:pointer;font-family:MontserratLight,sans-serif;');
      saveBtn.style.setProperty('background','#1a1a1a','important');saveBtn.style.setProperty('color','#ffffff','important');
      saveBtn.textContent='Guardar';
      saveBtn.addEventListener('click',function(){
        var ini=inpInicio.value,fi=inpFin.value;
        if(!ini||!fi||ini>fi){saveBtn.textContent='⚠ datas inválidas';setTimeout(function(){saveBtn.textContent='Guardar';},2000);return;}
        saveBtn.textContent='A guardar…';saveBtn.style.opacity='.6';saveBtn.style.pointerEvents='none';
        _saveMaxxConfig(ini,fi,function(err){
          saveBtn.style.opacity='1';saveBtn.style.pointerEvents='';
          if(err){saveBtn.textContent='✗ Erro';setTimeout(function(){saveBtn.textContent='Guardar';},2000);}
          else{_renderProyeccion();}
        });
      });

      var clearBtn=_el('div','padding:6px 12px;border-radius:8px;font-size:.72rem;font-weight:800;cursor:pointer;font-family:MontserratLight,sans-serif;');
      clearBtn.style.setProperty('background','transparent','important');clearBtn.style.setProperty('color','#a03020','important');
      clearBtn.style.setProperty('border','1px solid #e0e0e0','important');
      clearBtn.textContent='✕ limpar';clearBtn.style.display=maxxHasConfig?'block':'none';
      clearBtn.addEventListener('click',function(){
        _saveMaxxConfig('','',function(){_maxxConfig.inicio=null;_maxxConfig.fin=null;_renderProyeccion();});
      });

      maxxInputRow.appendChild(gInicio);maxxInputRow.appendChild(gFin);
      maxxInputRow.appendChild(saveBtn);maxxInputRow.appendChild(clearBtn);
      maxxPanel.appendChild(maxxInputRow);

      if(maxxHasConfig){
        var maxxInfo=_el('div','font-size:.65rem;margin-top:8px;');
        maxxInfo.style.setProperty('color','#4a7c59','important');
        maxxInfo.textContent='Maxx activa de '+_fmtDate(_maxxConfig.inicio)+' até '+_fmtDate(_maxxConfig.fin)+' — a projecção de cada trimestre incluirá a sua contribuição no tramo correspondente.';
        maxxPanel.appendChild(maxxInfo);
      }
      c.appendChild(maxxPanel);
    }

    // Cards Q1-Q4 + Año
    var periods=[
      {id:'Q1',label:'Q1',from:currentYear+'-01-01',to:currentYear+'-03-31'},
      {id:'Q2',label:'Q2',from:currentYear+'-04-01',to:currentYear+'-06-30'},
      {id:'Q3',label:'Q3',from:currentYear+'-07-01',to:currentYear+'-09-30'},
      {id:'Q4',label:'Q4',from:currentYear+'-10-01',to:currentYear+'-12-31'},
      {id:'ANO',label:'Ano '+currentYear,from:currentYear+'-01-01',to:currentYear+'-12-31'}
    ];

    var grid=_el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px;');
    periods.forEach(function(p){
      var realRows=rows.filter(function(r){return r.data>=p.from&&r.data<=p.to;});
      var realTotal=realRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var isClosed=today>p.to;
      var isActive=today>=p.from&&today<=p.to;
      var isFuture=today<p.from;
      var maxxRango=maxxNaZona?_maxxRangoParaPeriodo(p.from,p.to):null;
      var maxxDesde=maxxRango?maxxRango.desde:null;
      var proj=(!isClosed)?_calcProjection(rows,p.from,p.to,effectiveToday,maxxDesde):null;

      var card=_el('div','border-radius:12px;padding:14px 16px;border:1.5px solid;');
      var bc=isClosed?'#e0e0e0':isActive?'#4a7c59':'#555555';
      card.style.setProperty('border-color',bc,'important');
      card.style.setProperty('background',isClosed?'#fafafa':isActive?'#f1f8f4':'#f5f5f5','important');

      var cLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;');
      cLbl.style.setProperty('color',isActive?'#4a7c59':'#888888','important');
      var lSpan=document.createElement('span');lSpan.textContent=p.label+(isClosed?' · Fechado':isActive?' · Em curso':' · Futuro');
      cLbl.appendChild(lSpan);
      if(isActive&&proj){
        var pctSpan=_el('span','font-size:.58rem;padding:2px 7px;border-radius:10px;');
        pctSpan.style.setProperty('background','#e6f4ed','important');
        pctSpan.style.setProperty('color','#2a6a40','important');
        pctSpan.textContent=proj.pctHistorico.toFixed(0)+'% hist · '+proj.pctDone.toFixed(0)+'% linear';
        cLbl.appendChild(pctSpan);
      }
      card.appendChild(cLbl);

      var cVal=_el('div','font-size:1.4rem;font-weight:900;letter-spacing:-.02em;');
      cVal.style.setProperty('color','#111111','important');
      cVal.textContent=_fmtEur(realTotal);
      card.appendChild(cVal);

      if(!isClosed&&proj){
        var projLine=_el('div','display:flex;align-items:baseline;gap:8px;margin-top:4px;flex-wrap:wrap;');
        var projLbl=_el('span','font-size:.62rem;font-weight:700;');
        projLbl.style.setProperty('color','#888888','important');
        projLbl.textContent=isFuture?'Estimativa:':'Projecção:';
        projLine.appendChild(projLbl);
        var projVal=_el('span','font-size:.95rem;font-weight:800;');
        projVal.style.setProperty('color',isActive?'#2a6a40':'#555555','important');
        projVal.textContent=_fmtEur(proj.valorProjetado);
        projLine.appendChild(projVal);
        if(isActive){
          var projSub=_el('span','font-size:.62rem;');
          projSub.style.setProperty('color','#aaaaaa','important');
          projSub.textContent='('+proj.diasRestantes+' dias restantes)';
          projLine.appendChild(projSub);
        }
        card.appendChild(projLine);
        if(proj.maxxContribFutura>0){
          var maxxTag=_el('div','font-size:.6rem;font-weight:700;margin-top:2px;');
          maxxTag.style.setProperty('color','#4a7c59','important');
          maxxTag.textContent='↳ incl. Maxx ('+_fmtDate(maxxDesde)+'→'+_fmtDate(maxxRango.hasta)+'): +'+_fmtEur(proj.maxxContribFutura);
          card.appendChild(maxxTag);
        }
        if(proj.anosBase&&proj.anosBase.length){
          var baseLbl=_el('div','font-size:.58rem;margin-top:3px;');
          baseLbl.style.setProperty('color','#bbbbbb','important');
          baseLbl.textContent='Base: '+proj.anosBase.join(', ');
          card.appendChild(baseLbl);
        }
      }

      var prevFrom=String(currentYear-1)+p.from.substring(4);
      var prevTo=String(currentYear-1)+p.to.substring(4);
      var prevRows=rows.filter(function(r){return r.data>=prevFrom&&r.data<=prevTo;});
      var prevTotal=prevRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      if(prevTotal>0){
        var compareVal=isClosed?realTotal:(proj?proj.valorProjetado:realTotal);
        var diff=(compareVal-prevTotal)/prevTotal*100;
        var diffLine=_el('div','font-size:.68rem;font-weight:700;margin-top:6px;padding-top:6px;border-top:1px solid #e0e0e0;');
        diffLine.style.setProperty('color',diff>=0?'#2a6a40':'#a03020','important');
        diffLine.textContent=(diff>=0?'↑ +':'↓ ')+diff.toFixed(1)+'% vs '+(currentYear-1)+' ('+_fmtEur(prevTotal)+')';
        card.appendChild(diffLine);
      }

      if(isActive&&proj){
        var btnRow=_el('div','display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;');
        var fixBtn=_el('div','padding:6px 14px;border-radius:8px;font-size:.7rem;font-weight:800;cursor:pointer;text-align:center;border:1.5px solid #4a7c59;font-family:MontserratLight,sans-serif;');
        fixBtn.style.setProperty('background','transparent','important');fixBtn.style.setProperty('color','#4a7c59','important');
        fixBtn.textContent='📌 Fixar Projecção';
        fixBtn.addEventListener('click',function(){_guardarProyeccion(p,proj,_proyZona,rows,fixBtn);});
        btnRow.appendChild(fixBtn);
        var calcBtn=_el('div','padding:6px 14px;border-radius:8px;font-size:.7rem;font-weight:800;cursor:pointer;text-align:center;border:1.5px solid #aaaaaa;font-family:MontserratLight,sans-serif;');
        calcBtn.style.setProperty('background','transparent','important');calcBtn.style.setProperty('color','#666666','important');
        calcBtn.textContent='🔍 Análise';
        calcBtn.addEventListener('click',function(e){e.stopPropagation();_openTrazaModal(proj,p.label);});
        btnRow.appendChild(calcBtn);
        card.appendChild(btnRow);
      }

      grid.appendChild(card);
    });
    c.appendChild(grid);

    // ── Alertas tienda a tienda
    _renderAlertas(c,rows,effectiveToday,currentYear,zonaActiva.lojas);

    // ── Proyecciones fijadas guardadas
    _renderProyFijadas(c,currentYear,_proyZona);

    // ── Simulador
    _renderSimulador(c,rows,effectiveToday,currentYear,zonaActiva);
  }

  function _renderAlertas(c,rows,today,currentYear,lojas){
    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;margin-top:4px;');
    ttl.style.setProperty('color','#888888','important');
    ttl.textContent='⚠ ALERTAS — RITMO POR LOJA';
    c.appendChild(ttl);

    var alertasWrap=_el('div','display:flex;flex-direction:column;gap:8px;margin-bottom:20px;');
    var anyAlert=false;

    lojas.forEach(function(loja){
      var lojaRows=rows.filter(function(r){return r.loja===loja;});
      // Calcular ritmo histórico medio para este punto del año (días 1-N del año)
      var periodoInicio=today.substring(0,4)+'-01-01';
      var dayOfYear=Math.round((_strToDate(today)-_strToDate(periodoInicio))/86400000)+1;
      var historicos=[];
      var anosUsados=[];
      for(var yr=2017;yr<currentYear;yr++){
        if(ANOS_EXCLUIDOS.indexOf(String(yr))>=0) continue;
        var yrStart=String(yr)+'-01-01';
        var cutD=new Date(yr,0,1);cutD.setDate(cutD.getDate()+dayOfYear-1);
        var yrCutStr=_dateToStr(cutD);
        var yrSum=lojaRows.filter(function(r){return r.data>=yrStart&&r.data<=yrCutStr;})
          .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        if(yrSum>0){historicos.push(yrSum);anosUsados.push(String(yr));}
      }
      if(historicos.length<2) return;
      var mediaHist=historicos.reduce(function(s,v){return s+v;},0)/historicos.length;
      var realActual=lojaRows.filter(function(r){return r.data>=periodoInicio&&r.data<=today;})
        .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      if(mediaHist<=0) return;
      var ritmo=realActual/mediaHist*100;
      var diff=ritmo-100;
      if(Math.abs(diff)<10) return; // solo mostrar si hay desviación significativa

      // Último ano com dados para comparação directa
      var anoAnterior=String(currentYear-1);
      var yrAntStart=anoAnterior+'-01-01';
      var cutDAnt=new Date(parseInt(anoAnterior),0,1);cutDAnt.setDate(cutDAnt.getDate()+dayOfYear-1);
      var yrAntCutStr=_dateToStr(cutDAnt);
      var realAnterior=lojaRows.filter(function(r){return r.data>=yrAntStart&&r.data<=yrAntCutStr;})
        .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var diffVsAnterior=realAnterior>0?(realActual-realAnterior)/realAnterior*100:null;

      anyAlert=true;
      var card=_el('div','border-radius:10px;padding:10px 14px;border:1.5px solid;display:flex;flex-direction:column;gap:6px;');
      card.style.setProperty('border-color',diff<0?'#f5c6c6':'#c8e6c9','important');
      card.style.setProperty('background',diff<0?'#fff8f8':'#f6fbf4','important');

      // Linha 1: nome + percentagem
      var aRow1=_el('div','display:flex;align-items:center;justify-content:space-between;');
      var aLoja=_el('div','font-size:.82rem;font-weight:800;');
      aLoja.style.setProperty('color','#111111','important');
      aLoja.textContent=LOJA_LABELS[loja]||loja;
      aRow1.appendChild(aLoja);
      var aPct=_el('div','font-size:1rem;font-weight:900;');
      aPct.style.setProperty('color',diff<0?'#a03020':'#2a6a40','important');
      aPct.textContent=(diff>=0?'+':'')+diff.toFixed(1)+'%';
      aRow1.appendChild(aPct);
      card.appendChild(aRow1);

      // Linha 2: período e base de comparação
      var aRow2=_el('div','display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;');
      var aPeriodo=_el('div','font-size:.6rem;');
      aPeriodo.style.setProperty('color','#888888','important');
      aPeriodo.textContent='Período: 01/01→'+_fmtDate(today)+' ('+dayOfYear+' dias) · Base: média de '+anosUsados.length+' anos ('+anosUsados.join(', ')+')';
      aRow2.appendChild(aPeriodo);
      card.appendChild(aRow2);

      // Linha 3: valores reais vs média histórica + vs ano anterior
      var aRow3=_el('div','display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;');
      var aVals=_el('div','font-size:.62rem;');
      aVals.style.setProperty('color','#888888','important');
      aVals.textContent='Real: '+_fmtEur(realActual)+' · Média hist.: '+_fmtEur(mediaHist);
      aRow3.appendChild(aVals);
      var aImpDiv=_el('div','display:flex;flex-direction:column;align-items:flex-end;gap:1px;');
      var aImp=_el('div','font-size:.62rem;font-weight:700;');
      aImp.style.setProperty('color','#888888','important');
      var impacto=(realActual-mediaHist);
      aImp.textContent=(impacto>=0?'+':'')+_fmtEur(impacto)+' vs média hist.';
      aImpDiv.appendChild(aImp);
      if(diffVsAnterior!==null){
        var aAnt=_el('div','font-size:.6rem;');
        aAnt.style.setProperty('color',diffVsAnterior<0?'#c0392b':'#2a6a40','important');
        var impVsAnt=realActual-realAnterior;
        aAnt.textContent=(diffVsAnterior>=0?'+':'')+diffVsAnterior.toFixed(1)+'% vs '+anoAnterior+' ('+(impVsAnt>=0?'+':'')+_fmtEur(impVsAnt)+')';
        aImpDiv.appendChild(aAnt);
      }
      aRow3.appendChild(aImpDiv);
      card.appendChild(aRow3);

      alertasWrap.appendChild(card);
    });

    if(!anyAlert){
      var ok=_el('div','font-size:.78rem;padding:10px;text-align:center;');
      ok.style.setProperty('color','#888888','important');
      ok.textContent='Todas as lojas dentro do ritmo histórico esperado ✓';
      alertasWrap.appendChild(ok);
    }
    c.appendChild(alertasWrap);
  }

  // ── Modal flotante de trazabilidad
  function _openTrazaModal(proj, label){
    var overlay=document.getElementById('hadm-traza-overlay');
    var body=document.getElementById('hadm-traza-body');
    if(!overlay||!body) return;
    body.innerHTML='';
    // Título del modal
    var mTtl=_el('div','font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:16px;padding-right:32px;');
    mTtl.style.setProperty('color','#1a1a1a','important');
    mTtl.textContent='CÁLCULOS — '+label;
    body.appendChild(mTtl);
    var panel=_renderTrazabilidad(proj);
    body.appendChild(panel);
    overlay.classList.add('active');
    document.body.style.overflow='hidden';
  }

  function _closeTrazaModal(){
    var overlay=document.getElementById('hadm-traza-overlay');
    if(overlay) overlay.classList.remove('active');
    document.body.style.overflow='';
  }

  // ── Narrativa analítica — reemplaza los pasos técnicos
  function _renderTrazabilidad(proj){
    var panel=_el('div','');
    var t=proj.traza;
    if(!t){
      var nd=_el('div','font-size:.72rem;');nd.style.setProperty('color','#aaaaaa','important');
      nd.textContent='Sem dados de análise.';panel.appendChild(nd);return panel;
    }

    function _bloco(titulo,cor,conteudo){
      var b=_el('div','margin-bottom:14px;padding:14px 16px;border-radius:10px;border-left:3px solid '+cor+';');
      b.style.setProperty('background','#f9f9f9','important');
      var bT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;');
      bT.style.setProperty('color',cor,'important');bT.textContent=titulo;b.appendChild(bT);
      var bC=_el('div','font-size:.78rem;line-height:1.7;');
      bC.style.setProperty('color','#333333','important');bC.innerHTML=conteudo;b.appendChild(bC);
      return b;
    }

    // ── Bloco 1: Situação actual
    var diasRestantes=t.totalDays-t.doneDays;
    var pesoRestante=100-t.pctHistoricoUsado;
    var ritmoAdj=t.pctHistoricoUsado>t.pctLineal?'concentrado nos dias que faltam':'mais forte nos dias já passados';
    var b1='Estamos no dia <b>'+t.doneDays+'</b> de <b>'+t.totalDays+'</b> do período (<b>'+_fmtDate(t.from)+'→'+_fmtDate(t.to)+'</b>). ';
    b1+='Foram facturados <b>'+_fmtEur(t.realAcum)+'</b> até '+_fmtDate(t.today)+'. ';
    b1+='Restam <b>'+diasRestantes+' dias</b>, que historicamente representam <b>'+pesoRestante.toFixed(1)+'%</b> do total do período — ';
    b1+='ou seja, o peso dos dias que faltam é <b>'+ritmoAdj+'</b> em relação à parte já decorrida.';
    if(t.maxxContribFutura>0){
      b1+=' A Maxx iniciará actividade a partir de <b>'+_fmtDate(t.maxxDesde)+'</b>, contribuindo com uma estimativa de <b>+'+_fmtEur(t.maxxContribFutura)+'</b> adicionais.';
    }
    panel.appendChild(_bloco('SITUAÇÃO ACTUAL','#4a7c59',b1));

    // ── Bloco 2: O que diz a história
    var anosKeys=Object.keys(t.ratiosByYear).sort();
    var totais=anosKeys.map(function(yr){return t.ratiosByYear[yr].total;});
    var minTotal=Math.min.apply(null,totais),maxTotal=Math.max.apply(null,totais);
    var minAno=anosKeys[totais.indexOf(minTotal)],maxAno=anosKeys[totais.indexOf(maxTotal)];
    var anosRecentes=anosKeys.slice(-2);
    var b2='Em <b>'+anosKeys.length+' anos comparáveis</b> ('+anosKeys.join(', ')+'), o período completo oscilou entre <b>'+_fmtEur(minTotal)+'</b> ('+minAno+') e <b>'+_fmtEur(maxTotal)+'</b> ('+maxAno+'). ';
    if(anosRecentes.length>=2){
      var t1=t.ratiosByYear[anosRecentes[0]].total,t2=t.ratiosByYear[anosRecentes[1]].total;
      var tendencia=t2>t1?'crescente':'decrescente';
      b2+='A tendência dos últimos dois anos é <b>'+tendencia+'</b>: '+anosRecentes[0]+' fechou em <b>'+_fmtEur(t1)+'</b> e '+anosRecentes[1]+' em <b>'+_fmtEur(t2)+'</b>. ';
    }
    // Dispersão dos ratios
    var ratios=anosKeys.map(function(yr){return t.ratiosByYear[yr].pct;});
    var minR=Math.min.apply(null,ratios),maxR=Math.max.apply(null,ratios);
    b2+='O peso histórico dos dias já decorridos variou entre <b>'+minR.toFixed(1)+'%</b> e <b>'+maxR.toFixed(1)+'%</b> — uma amplitude de '+(maxR-minR).toFixed(1)+' pontos percentuais. ';
    if(t.anosExcluidosCovid&&t.anosExcluidosCovid.length){
      b2+='Os anos '+t.anosExcluidosCovid.join(' e ')+' foram excluídos por distorção atípica (COVID-19).';
    }
    panel.appendChild(_bloco('O QUE DIZ A HISTÓRIA','#2563a8',b2));

    // ── Bloco 3: Veredicto e análise crítica
    var pctUsado=t.pctHistoricoUsado;
    var projBase=t.realAcum/(pctUsado/100);
    var projFinal=t.valorProjetado;
    // Identificar mes crítico (el que más pesa en el período restante — simplificado)
    var b3='Com base no ritmo actual e no peso histórico ponderado, a projecção para o período completo é de <b>'+_fmtEur(projFinal)+'</b>. ';
    // Comparar con la media histórica
    var mediaHist=totais.reduce(function(s,v){return s+v;},0)/totais.length;
    var diffMedia=(projFinal-mediaHist)/mediaHist*100;
    b3+='Este valor situa-se <b>'+(Math.abs(diffMedia)<5?'próximo da média histórica ('+(diffMedia>=0?'+':'')+diffMedia.toFixed(1)+'%)':'('+Math.abs(diffMedia).toFixed(1)+'% '+(diffMedia>=0?'acima':'abaixo')+' da média histórica de '+_fmtEur(mediaHist)+')')+'</b>. ';
    // Comparar con el año más reciente
    if(anosRecentes.length>0){
      var ultAno=anosRecentes[anosRecentes.length-1];
      var ultTotal=t.ratiosByYear[ultAno].total;
      var diffUlt=(projFinal-ultTotal)/ultTotal*100;
      b3+='Comparando com '+ultAno+' ('+_fmtEur(ultTotal)+'): a projecção representa '+(diffUlt>=0?'<b style="color:#2a6a40">+'+diffUlt.toFixed(1)+'%</b>':'<b style="color:#a03020">'+diffUlt.toFixed(1)+'%</b>')+'. ';
    }
    // Factor crítico
    if(pesoRestante>60){
      b3+='<br><br>⚠ <b>Factor crítico:</b> '+pesoRestante.toFixed(0)+'% da facturação esperada ainda está por realizar. O resultado final depende fortemente do comportamento dos dias que faltam.';
    } else if(pesoRestante<30){
      b3+='<br><br>✓ <b>Nota:</b> Mais de '+t.pctHistoricoUsado.toFixed(0)+'% do período já está realizado. A projecção tem um grau de fiabilidade mais elevado.';
    }
    if(t.maxxContribFutura>0){
      var pctMaxx=t.maxxContribFutura/projFinal*100;
      b3+='<br>↳ A contribuição da Maxx representa <b>'+pctMaxx.toFixed(1)+'%</b> do total projectado.';
    }
    panel.appendChild(_bloco('VEREDICTO','#1a1a1a',b3));

    return panel;
  }

  function _guardarProyeccion(period,proj,zona,rows,btn){
    var nota=window.prompt('Nota opcional para esta projecção (pode deixar em branco):','');
    if(nota===null) return; // canceló
    btn.textContent='A guardar…';btn.style.opacity='.6';btn.style.pointerEvents='none';
    var today=_todayStr();
    var currentYear=_strToDate(today).getFullYear();
    var prevFrom=String(currentYear-1)+period.from.substring(4);
    var prevTo=String(currentYear-1)+period.to.substring(4);
    var prevTotal=rows.filter(function(r){return r.data>=prevFrom&&r.data<=prevTo;})
      .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);

    var payload={
      periodo_tipo:period.id,
      periodo_ano:currentYear,
      zona:zona,
      fecha_fijacion:today,
      dias_completados:proj.doneDays,
      dias_totales:proj.totalDays,
      pct_completado:parseFloat(proj.pctDone.toFixed(2)),
      valor_real_acumulado:parseFloat(proj.realAcum.toFixed(2)),
      valor_proyectado:parseFloat(proj.valorProjetado.toFixed(2)),
      valor_base_historica:parseFloat(prevTotal.toFixed(2)),
      anos_base_usados:proj.anosBase?proj.anosBase.join(','):null,
      nota:nota||null
    };
    sbAdmin.from('proyecciones_guardadas').upsert(payload,{onConflict:'periodo_tipo,periodo_ano,zona,fecha_fijacion'})
      .then(function(res){
        if(res.error){
          btn.textContent='✗ Erro ao guardar';btn.style.opacity='1';btn.style.pointerEvents='';
        } else {
          btn.textContent='✓ Projecção fixada!';
          btn.style.setProperty('background','#4a7c59','important');
          btn.style.setProperty('color','#ffffff','important');
          btn.style.setProperty('border-color','#4a7c59','important');
          btn.style.opacity='1';btn.style.pointerEvents='none';
        }
      }).catch(function(){btn.textContent='✗ Erro';btn.style.opacity='1';btn.style.pointerEvents='';});
  }

  function _renderProyFijadas(c,currentYear,zona){
    var wrap=_el('div','margin-bottom:20px;');
    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:8px;');
    ttl.style.setProperty('color','#888888','important');
    ttl.textContent='📌 PROJECÇÕES FIXADAS';
    wrap.appendChild(ttl);
    var box=_el('div','font-size:.75rem;');
    box.style.setProperty('color','#aaaaaa','important');
    box.textContent='A carregar…';
    wrap.appendChild(box);
    c.appendChild(wrap);

    sbAdmin.from('proyecciones_guardadas').select('*')
      .eq('periodo_ano',currentYear).eq('zona',zona)
      .order('fecha_fijacion',{ascending:false})
      .limit(20)
      .then(function(res){
        box.innerHTML='';
        var data=res.data||[];
        if(!data.length){
          box.textContent='Nenhuma projecção fixada ainda para '+zona+' em '+currentYear+'.';
          return;
        }
        var tw=_el('div','overflow-x:auto;border-radius:10px;border:1px solid #e0e0e0;');
        var t=document.createElement('table');
        t.setAttribute('style','width:100%;border-collapse:collapse;font-size:.72rem;');
        var thead=document.createElement('thead'),htr=document.createElement('tr');
        ['Período','Data fixação','% feito','Real','Projecção','Nota'].forEach(function(h){
          var th=document.createElement('th');th.textContent=h;
          th.setAttribute('style','padding:6px 10px;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1.5px solid #e0e0e0;white-space:nowrap;');
          th.style.setProperty('color','#555555','important');th.style.setProperty('background','#f5f5f5','important');
          htr.appendChild(th);
        });
        thead.appendChild(htr);t.appendChild(thead);
        var tbody=document.createElement('tbody');
        data.forEach(function(r,i){
          var tr=document.createElement('tr');
          var bg=i%2===0?'#ffffff':'#fafafa';
          [r.periodo_tipo,_fmtDate(r.fecha_fijacion),r.pct_completado+'%',
           _fmtEur(r.valor_real_acumulado),_fmtEur(r.valor_proyectado),r.nota||'—'].forEach(function(v,ci){
            var td=document.createElement('td');td.textContent=v;
            td.setAttribute('style','padding:6px 10px;border-bottom:1px solid #eeeeee;white-space:nowrap;'+(ci>=3&&ci<=4?'font-weight:800;':''));
            td.style.setProperty('background',bg,'important');td.style.setProperty('color','#111111','important');
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        t.appendChild(tbody);tw.appendChild(t);box.appendChild(tw);
      }).catch(function(){box.textContent='Erro ao carregar projecções.';});
  }

  // Estado del simulador Maxx
  var _simMaxxActiva=false;
  var _simMaxxDesde='';
  var _simMaxxHasta='';
  var _simMaxxDomingos=false;

  function _renderSimulador(c,rows,today,currentYear,zonaActiva){
    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    ttl.style.setProperty('color','#888888','important');
    ttl.textContent='🔮 SIMULADOR — E SE MAXX ABRISSE?';
    c.appendChild(ttl);

    var simWrap=_el('div','border-radius:12px;padding:16px;border:1px solid #e0e0e0;margin-bottom:20px;');
    simWrap.style.setProperty('background','#fafafa','important');

    var simDesc=_el('div','font-size:.72rem;margin-bottom:14px;');
    simDesc.style.setProperty('color','#888888','important');
    simDesc.textContent='Define o período de abertura da Maxx para ver o impacto na projecção anual. As demais lojas contribuem sempre.';
    simWrap.appendChild(simDesc);

    // Toggle Maxx
    var toggleRow=_el('div','display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;');
    var toggleBtn=_el('div','padding:7px 20px;border-radius:20px;font-size:.78rem;font-weight:800;cursor:pointer;border:1.5px solid;font-family:MontserratLight,sans-serif;');
    toggleBtn.style.setProperty('background',_simMaxxActiva?'#4a7c59':'#2a2a2a','important');
    toggleBtn.style.setProperty('color','#ffffff','important');
    toggleBtn.style.setProperty('border-color',_simMaxxActiva?'#4a7c59':'#555','important');
    toggleBtn.textContent=_simMaxxActiva?'✓ Maxx incluída':'Maxx fechada';

    var iS='padding:7px 10px;font-size:.78rem;font-weight:700;border:1.5px solid #cccccc;border-radius:8px;font-family:MontserratLight,sans-serif;outline:none;';
    var inpDesde=_el('input',iS);
    inpDesde.type='date';inpDesde.value=_simMaxxDesde||'';
    inpDesde.style.setProperty('background','#ffffff','important');
    inpDesde.style.setProperty('color','#111111','important');
    var lDesde=_el('span','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;');
    lDesde.style.setProperty('color','#888888','important');lDesde.textContent='de';
    var inpHasta=_el('input',iS);
    inpHasta.type='date';inpHasta.value=_simMaxxHasta||'';
    inpHasta.style.setProperty('background','#ffffff','important');
    inpHasta.style.setProperty('color','#111111','important');
    var lHasta=_el('span','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;');
    lHasta.style.setProperty('color','#888888','important');lHasta.textContent='até';

    // Toggle domingos Maxx
    var domToggle=_el('div','padding:5px 12px;border-radius:14px;font-size:.7rem;font-weight:800;cursor:pointer;border:1.5px solid;font-family:MontserratLight,sans-serif;');
    domToggle.style.setProperty('background',_simMaxxDomingos?'#4a7c59':'#2a2a2a','important');
    domToggle.style.setProperty('color','#ffffff','important');
    domToggle.style.setProperty('border-color',_simMaxxDomingos?'#4a7c59':'#555','important');
    domToggle.textContent=_simMaxxDomingos?'Dom ✓':'+ Domingos';

    toggleRow.appendChild(toggleBtn);
    toggleRow.appendChild(lDesde);toggleRow.appendChild(inpDesde);
    toggleRow.appendChild(lHasta);toggleRow.appendChild(inpHasta);
    toggleRow.appendChild(domToggle);
    simWrap.appendChild(toggleRow);

    // Resultado
    var simResult=_el('div','border-radius:10px;padding:12px 16px;border:1.5px solid #e0e0e0;');
    simResult.style.setProperty('background','#ffffff','important');
    simWrap.appendChild(simResult);
    c.appendChild(simWrap);

    function _calcSimResult(){
      simResult.innerHTML='';

      // Proyección base sin Maxx (tiendas que sí tienen datos en 2026)
      var rowsSinMaxx=rows.filter(function(r){return r.loja!=='MAXX';});
      var baseProj=_calcProjection(rowsSinMaxx,currentYear+'-01-01',currentYear+'-12-31',today);
      var baseSinMaxx=baseProj?baseProj.valorProjetado:rowsSinMaxx.filter(function(r){
        return r.data.substring(0,4)===String(currentYear);
      }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);

      var maxxContrib=0;
      var maxxDetalle=[];

      if(_simMaxxActiva&&_simMaxxDesde&&_simMaxxHasta&&_simMaxxDesde<=_simMaxxHasta){
        var desde=_simMaxxDesde,hasta=_simMaxxHasta;
        // Días futuros de Maxx en el rango (que aún no han ocurrido)
        var dCur=new Date(Math.max(_strToDate(today).getTime(),_strToDate(desde).getTime()));
        dCur.setDate(dCur.getDate()+1);
        var dEnd=_strToDate(hasta);

        // Media histórica de Maxx por mes (lun-sab, sin COVID, sin 2026)
        var maxxHistByMes={};
        for(var m=1;m<=12;m++) maxxHistByMes[m]={sum:0,dias:0};
        _allRows.forEach(function(r){
          if(r.loja!=='MAXX') return;
          var yr=r.data.substring(0,4);
          if(yr===String(currentYear)||ANOS_EXCLUIDOS.indexOf(yr)>=0) return;
          var dow=_strToDate(r.data).getDay();
          if(dow===0) return; // domingos separado
          var mes=parseInt(r.data.substring(5,7));
          var val=parseFloat(r.montante)||0;
          if(val>0){maxxHistByMes[mes].sum+=val;maxxHistByMes[mes].dias++;}
        });

        // Proyección días normales mes a mes
        var dIter=new Date(dCur);
        var diasPorMes={};
        while(dIter<=dEnd){
          var dow=dIter.getDay();
          if(dow!==0){ // lun-sab
            var mes=dIter.getMonth()+1;
            diasPorMes[mes]=(diasPorMes[mes]||0)+1;
          }
          dIter.setDate(dIter.getDate()+1);
        }
        Object.keys(diasPorMes).sort().forEach(function(mes){
          var mh=maxxHistByMes[parseInt(mes)];
          var mediaDia=mh.dias>0?mh.sum/mh.dias:0;
          var contrib=diasPorMes[mes]*mediaDia;
          maxxContrib+=contrib;
          maxxDetalle.push({
            mes:parseInt(mes),tipo:'dias normais',
            n:diasPorMes[mes],media:mediaDia,total:contrib
          });
        });

        // Proyección domingos si activados
        if(_simMaxxDomingos){
          // Ratio domingo/semana de Avenida+Mercado+Shana en 2026
          var refLojas=['MEZKA AVENIDA','MEZKA MERCADO','SHANA'];
          var ratiosByMes={};
          for(var m=1;m<=12;m++){
            var domSum=0,domN=0,semSum=0,semN=0;
            _allRows.forEach(function(r){
              if(refLojas.indexOf(r.loja)<0) return;
              if(r.data.substring(0,4)!==String(currentYear)) return;
              if(parseInt(r.data.substring(5,7))!==m) return;
              var dow=_strToDate(r.data).getDay();
              var val=parseFloat(r.montante)||0;
              if(dow===0){domSum+=val;domN++;}
              else{semSum+=val;semN++;}
            });
            var mediaSem=semN>0?semSum/semN:0;
            var mediaDom=domN>0?domSum/domN:0;
            ratiosByMes[m]=mediaSem>0?mediaDom/mediaSem:0.9;
          }
          // Media histórica Maxx por mes (lun-sab) × ratio domingo
          var domIter=new Date(dCur);
          var domPorMes={};
          while(domIter<=dEnd){
            if(domIter.getDay()===0){
              var mes=domIter.getMonth()+1;
              domPorMes[mes]=(domPorMes[mes]||0)+1;
            }
            domIter.setDate(domIter.getDate()+1);
          }
          Object.keys(domPorMes).sort().forEach(function(mes){
            var mh=maxxHistByMes[parseInt(mes)];
            var mediaDia=mh.dias>0?mh.sum/mh.dias:0;
            var ratio=ratiosByMes[parseInt(mes)]||0.9;
            var mediaDom=mediaDia*ratio;
            var contrib=domPorMes[mes]*mediaDom;
            maxxContrib+=contrib;
            maxxDetalle.push({
              mes:parseInt(mes),tipo:'domingos',
              n:domPorMes[mes],media:mediaDom,total:contrib,ratio:ratio
            });
          });
        }
      }

      var totalComMaxx=baseSinMaxx+maxxContrib;

      // Render resultado
      var sLbl=_el('div','font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;');
      sLbl.style.setProperty('color','#888888','important');
      sLbl.textContent='RESULTADO DA SIMULAÇÃO — ANO '+currentYear;
      simResult.appendChild(sLbl);

      var sRow=_el('div','display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:10px;');
      var sBase=_el('div','');
      var sBaseLbl=_el('div','font-size:.58rem;');sBaseLbl.style.setProperty('color','#aaaaaa','important');
      sBaseLbl.textContent='Sem Maxx';
      var sBaseVal=_el('div','font-size:.95rem;font-weight:800;');
      sBaseVal.style.setProperty('color','#888888','important');
      sBaseVal.textContent=_fmtEur(baseSinMaxx);
      sBase.appendChild(sBaseLbl);sBase.appendChild(sBaseVal);
      sRow.appendChild(sBase);

      if(_simMaxxActiva&&maxxContrib>0){
        var sMaxx=_el('div','');
        var sMaxxLbl=_el('div','font-size:.58rem;');sMaxxLbl.style.setProperty('color','#4a7c59','important');
        sMaxxLbl.textContent='Contributo Maxx';
        var sMaxxVal=_el('div','font-size:.95rem;font-weight:800;');
        sMaxxVal.style.setProperty('color','#4a7c59','important');
        sMaxxVal.textContent='+'+_fmtEur(maxxContrib);
        sMaxx.appendChild(sMaxxLbl);sMaxx.appendChild(sMaxxVal);
        sRow.appendChild(sMaxx);

        var sTotal=_el('div','');
        var sTotalLbl=_el('div','font-size:.58rem;');sTotalLbl.style.setProperty('color','#2a6a40','important');
        sTotalLbl.textContent='Total com Maxx';
        var sTotalVal=_el('div','font-size:1.3rem;font-weight:900;');
        sTotalVal.style.setProperty('color','#111111','important');
        sTotalVal.textContent=_fmtEur(totalComMaxx);
        sTotal.appendChild(sTotalLbl);sTotal.appendChild(sTotalVal);
        sRow.appendChild(sTotal);
      } else {
        var sTotalVal2=_el('div','font-size:1.3rem;font-weight:900;');
        sTotalVal2.style.setProperty('color','#111111','important');
        sTotalVal2.textContent=_fmtEur(baseSinMaxx);
        sRow.appendChild(sTotalVal2);
      }
      simResult.appendChild(sRow);

      // Desglose Maxx mes a mes
      if(maxxDetalle.length){
        var dttl=_el('div','font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;');
        dttl.style.setProperty('color','#4a7c59','important');
        dttl.textContent='DESGLOSE MAXX';
        simResult.appendChild(dttl);
        var dGrid=_el('div','display:flex;gap:6px;flex-wrap:wrap;');
        maxxDetalle.forEach(function(d){
          var dBox=_el('div','border-radius:8px;padding:6px 10px;min-width:90px;');
          dBox.style.setProperty('background','#f0f8f4','important');
          dBox.style.setProperty('border','1px solid #c8e6c9','important');
          var dNom=_el('div','font-size:.58rem;font-weight:800;');
          dNom.style.setProperty('color','#4a7c59','important');
          dNom.textContent=MESES_PT[d.mes-1].substring(0,3)+' · '+d.tipo;
          dBox.appendChild(dNom);
          var dN=_el('div','font-size:.62rem;');
          dN.style.setProperty('color','#888888','important');
          dN.textContent=d.n+(d.tipo==='domingos'?' dom':' dias')+' · '+_fmtEur(d.media)+'/dia';
          dBox.appendChild(dN);
          var dT=_el('div','font-size:.82rem;font-weight:800;');
          dT.style.setProperty('color','#111111','important');
          dT.textContent=_fmtEur(d.total);
          dBox.appendChild(dT);
          if(d.ratio!==undefined){
            var dR=_el('div','font-size:.55rem;');
            dR.style.setProperty('color','#aaaaaa','important');
            dR.textContent='ratio dom/sem: '+(d.ratio*100).toFixed(0)+'%';
            dBox.appendChild(dR);
          }
          dGrid.appendChild(dBox);
        });
        simResult.appendChild(dGrid);
      }

      if(!_simMaxxActiva||(maxxContrib===0&&_simMaxxActiva)){
        var hint=_el('div','font-size:.7rem;margin-top:6px;');
        hint.style.setProperty('color','#aaaaaa','important');
        hint.textContent=_simMaxxActiva?'Define as datas de abertura da Maxx para calcular o seu contributo.':'Activa a Maxx e define as datas para simular o seu impacto.';
        simResult.appendChild(hint);
      }
    }

    // Event listeners
    toggleBtn.addEventListener('click',function(){
      _simMaxxActiva=!_simMaxxActiva;
      _calcSimResult();
      toggleBtn.style.setProperty('background',_simMaxxActiva?'#4a7c59':'#2a2a2a','important');
      toggleBtn.style.setProperty('border-color',_simMaxxActiva?'#4a7c59':'#555','important');
      toggleBtn.textContent=_simMaxxActiva?'✓ Maxx incluída':'Maxx fechada';
    });
    inpDesde.addEventListener('change',function(){_simMaxxDesde=inpDesde.value;_calcSimResult();});
    inpHasta.addEventListener('change',function(){_simMaxxHasta=inpHasta.value;_calcSimResult();});
    domToggle.addEventListener('click',function(){
      _simMaxxDomingos=!_simMaxxDomingos;
      domToggle.style.setProperty('background',_simMaxxDomingos?'#4a7c59':'#2a2a2a','important');
      domToggle.style.setProperty('border-color',_simMaxxDomingos?'#4a7c59':'#555','important');
      domToggle.textContent=_simMaxxDomingos?'Dom ✓':'+ Domingos';
      _calcSimResult();
    });

    _calcSimResult();
  }

  // ── Diagnóstico histórico
  function _renderProyDiagnostico(c){
    // Usar último día con datos completos — no hoy si aún no está cargado
    var today=_lastCompleteDay();
    var currentYear=parseInt(today.substring(0,4));
    var todayMD=today.substring(5); // MM-DD

    // Contexto histórico — eventos operativos relevantes para la narrativa
    // No contiene datos financieros, solo hechos operativos genéricos
    var CONTEXTO_LOJAS={
      'MEZKA AVENIDA':{
        grupo:'porto_santo',
        eventos:{
          '2018':'abertura de nova loja no mesmo mercado geográfico',
          '2019':'reforço de produto e mix comercial'
        }
      },
      'MEZKA MERCADO':{
        grupo:'porto_santo',
        eventos:{
          '2018':'primeiro ano de operação'
        }
      },
      'MAXX':{
        grupo:'porto_santo',
        eventos:{
          '2019':'alteração de mix de produto',
          '2023':'redução progressiva de dias de abertura',
          '2025':'experiência de abertura aos domingos'
        }
      },
      'SHANA':{grupo:'porto_santo',eventos:{}},
      'MEZKA FUNCHAL':{grupo:'funchal',eventos:{}},
      'PARFOIS ARCADAS SAO FRANCISCO':{grupo:'funchal',eventos:{}},
      'PARFOIS MADEIRA SHOPPING':{grupo:'funchal',eventos:{}}
    };

    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:16px;');
    ttl.style.setProperty('color','#888888','important');
    ttl.textContent='DIAGNÓSTICO POR LOJA';
    c.appendChild(ttl);

    // Share de mercado Porto Santo — mantener la tabla (es útil y visual)
    var portoLojas=['MAXX','MEZKA AVENIDA','MEZKA MERCADO','SHANA'];
    var portoSection=_el('div','border-radius:12px;padding:14px 16px;border:1px solid #e0e0e0;margin-bottom:20px;');
    portoSection.style.setProperty('background','#fafafa','important');
    var psTtl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;');
    psTtl.style.setProperty('color','#888888','important');
    psTtl.textContent='SHARE DE MERCADO — PORTO SANTO';
    portoSection.appendChild(psTtl);
    var yearsAll={};
    _allRows.forEach(function(r){yearsAll[r.data.substring(0,4)]=true;});
    var yearsList=Object.keys(yearsAll).sort();
    var tw=_el('div','overflow-x:auto;');
    var t=document.createElement('table');
    t.setAttribute('style','width:100%;border-collapse:collapse;font-size:.72rem;');
    var thead=document.createElement('thead'),htr=document.createElement('tr');
    (['Loja'].concat(yearsList)).forEach(function(h){
      var th=document.createElement('th');th.textContent=h;
      th.setAttribute('style','padding:5px 8px;font-size:.58rem;font-weight:800;text-transform:uppercase;text-align:right;border-bottom:1.5px solid #e0e0e0;white-space:nowrap;');
      th.style.setProperty('color','#555555','important');th.style.setProperty('background','#f0f0f0','important');
      if(h==='Loja'){th.style.textAlign='left';}
      htr.appendChild(th);
    });
    thead.appendChild(htr);t.appendChild(thead);
    var tbody=document.createElement('tbody');
    portoLojas.forEach(function(loja,li){
      var tr=document.createElement('tr');
      var bg=li%2===0?'#ffffff':'#fafafa';
      var tdL=document.createElement('td');
      tdL.textContent=LOJA_LABELS[loja]||loja;
      tdL.setAttribute('style','padding:5px 8px;border-bottom:1px solid #eeeeee;font-weight:700;white-space:nowrap;');
      tdL.style.setProperty('background',bg,'important');tdL.style.setProperty('color','#111111','important');
      tr.appendChild(tdL);
      yearsList.forEach(function(yr){
        var lojaYrTotal=_allRows.filter(function(r){return r.loja===loja&&r.data.substring(0,4)===yr;})
          .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var portoYrTotal=portoLojas.reduce(function(s,l){
          return s+_allRows.filter(function(r){return r.loja===l&&r.data.substring(0,4)===yr;})
            .reduce(function(ss,r){return ss+(parseFloat(r.montante)||0);},0);
        },0);
        var share=portoYrTotal>0?(lojaYrTotal/portoYrTotal*100):0;
        var td=document.createElement('td');
        td.textContent=share>0?share.toFixed(1)+'%':'—';
        td.setAttribute('style','padding:5px 8px;border-bottom:1px solid #eeeeee;text-align:right;font-weight:700;');
        td.style.setProperty('background',bg,'important');
        td.style.setProperty('color',share>=25?'#2a6a40':share>=15?'#111111':'#aaaaaa','important');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);tw.appendChild(t);portoSection.appendChild(tw);
    c.appendChild(portoSection);

    // ── Narrativa por tienda
    LOJAS.forEach(function(loja){
      var diag=_calcDiagnostico(loja,_allRows);
      if(!diag.length) return;
      var label=LOJA_LABELS[loja]||loja;
      var ctx=CONTEXTO_LOJAS[loja]||{eventos:{}};

      // Datos históricos — excluir año actual para análisis histórico
      var diagHist=diag.filter(function(d){return parseInt(d.yr)<currentYear;});
      var diagActual=diag.find(function(d){return parseInt(d.yr)===currentYear;});

      // Calcular estadísticas históricas
      var totaisHist=diagHist.map(function(d){return d.total;}).filter(function(v){return v>0;});
      var mediasDia=diagHist.map(function(d){return d.mediaDia;}).filter(function(v){return v>0;});
      var anoMax=diagHist.reduce(function(best,d){return d.total>best.total?d:best;},{total:0,yr:'—'});
      var anoMin=diagHist.filter(function(d){return d.total>0;}).reduce(function(worst,d){return d.total<worst.total?d:worst;},{total:Infinity,yr:'—'});
      var ultimos3=diagHist.slice(-3);
      var tendencia3='estável';
      if(ultimos3.length>=2){
        var soma=0;
        for(var i=1;i<ultimos3.length;i++){
          if(ultimos3[i-1].total>0) soma+=(ultimos3[i].total-ultimos3[i-1].total)/ultimos3[i-1].total;
        }
        var mediaTend=soma/(ultimos3.length-1);
        if(mediaTend>0.05) tendencia3='crescente';
        else if(mediaTend<-0.05) tendencia3='decrescente';
      }

      // 2026 vs mesmo período anos anteriores
      var periodoAtual2026From=String(currentYear)+'-01-01';
      var periodoAtual2026To=today;
      var comparacoes2026=[];
      diagHist.slice(-4).reverse().forEach(function(d){
        var yrAnterior=d.yr;
        var fromAnt=yrAnterior+'-01-01';
        var toAnt=yrAnterior+'-'+todayMD;
        var totalAnt=_allRows.filter(function(r){
          return r.loja===loja&&r.data>=fromAnt&&r.data<=toAnt;
        }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        if(totalAnt>0&&diagActual){
          var diff=(diagActual.total-totalAnt)/totalAnt*100;
          comparacoes2026.push({yr:yrAnterior,total:totalAnt,diff:diff});
        }
      });

      // Proyección año actual — usando ratio histórico de realización
      // (mismo método que _calcProjection: real acumulado ÷ % histórico completado)
      var projAnual=null;
      if(diagActual&&diagActual.total>0){
        // Calcular % histórico que representa enero-hasta hoy en el año completo
        var ratios=[];
        diagHist.forEach(function(d){
          if(parseInt(d.yr)>=currentYear||ANOS_EXCLUIDOS.indexOf(d.yr)>=0) return;
          var lojaRows=_allRows.filter(function(r){return r.loja===loja;});
          var fromAnt=d.yr+'-01-01';
          var toAntCut=d.yr+'-'+todayMD;
          var toAntFull=d.yr+'-12-31';
          var parcial=lojaRows.filter(function(r){return r.data>=fromAnt&&r.data<=toAntCut;})
            .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          var anual=lojaRows.filter(function(r){return r.data>=fromAnt&&r.data<=toAntFull;})
            .reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          if(anual>0&&parcial>0) ratios.push(parcial/anual);
        });
        if(ratios.length>0){
          // Media ponderada por recencia
          ratios.reverse();
          var wS=0,wR=0;
          ratios.forEach(function(r,i){var w=Math.pow(0.65,i);wS+=w;wR+=w*r;});
          var pctHist=wR/wS;
          if(pctHist>0) projAnual=diagActual.total/pctHist;
        }
        // Fallback: si no hay histórico suficiente, usar media diaria × días del año
        if(!projAnual&&diagActual.mediaDia>0){
          var diasRestAno=Math.round((_strToDate(String(currentYear)+'-12-31')-_strToDate(today))/86400000);
          projAnual=diagActual.total+diasRestAno*diagActual.mediaDia;
        }
      }

      // Card por tienda
      var sec=_el('div','border-radius:12px;padding:16px;border:1px solid #e0e0e0;margin-bottom:14px;');
      sec.style.setProperty('background','#fafafa','important');

      // Header clickable
      var secHdr=_el('div','display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:8px;');
      var secLbl=_el('span','font-size:.95rem;font-weight:800;');
      secLbl.style.setProperty('color','#111111','important');
      secLbl.textContent='▶ '+label;

      // Badge de tendencia
      var tBadge=_el('span','font-size:.62rem;font-weight:700;padding:2px 10px;border-radius:10px;');
      var tColor=tendencia3==='crescente'?{bg:'#e6f4ed',c:'#2a6a40'}:tendencia3==='decrescente'?{bg:'#fdecea',c:'#a03020'}:{bg:'#f0f0f0',c:'#666'};
      tBadge.style.setProperty('background',tColor.bg,'important');
      tBadge.style.setProperty('color',tColor.c,'important');
      tBadge.textContent=tendencia3==='crescente'?'↑ tendência crescente':tendencia3==='decrescente'?'↓ tendência decrescente':'→ estável';
      secHdr.appendChild(secLbl);secHdr.appendChild(tBadge);
      sec.appendChild(secHdr);

      var secBody=_el('div','margin-top:14px;');
      secBody.style.display='none';
      var open=false;
      secHdr.addEventListener('click',function(){
        open=!open;
        secLbl.textContent=(open?'▼ ':'▶ ')+label;
        secBody.style.display=open?'block':'none';
      });

      function _bloco(cor,titulo,html){
        var b=_el('div','margin-bottom:12px;padding:12px 14px;border-radius:9px;border-left:3px solid '+cor+';');
        b.style.setProperty('background','#ffffff','important');
        var bT=_el('div','font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;');
        bT.style.setProperty('color',cor,'important');bT.textContent=titulo;b.appendChild(bT);
        var bC=_el('div','font-size:.78rem;line-height:1.75;');
        bC.style.setProperty('color','#333333','important');bC.innerHTML=html;b.appendChild(bC);
        return b;
      }

      // ── Bloco 1: A história
      var h1='';
      if(anoMax.yr!=='—'&&totaisHist.length>0){
        h1+='O melhor resultado histórico foi <b>'+_fmtEur(anoMax.total)+'</b> em <b>'+anoMax.yr+'</b>';
        if(anoMin.yr!=='—'&&anoMin.yr!==anoMax.yr){
          h1+=', e o mais fraco <b>'+_fmtEur(anoMin.total)+'</b> em <b>'+anoMin.yr+'</b>';
        }
        h1+='. ';
      }
      // Mencionar eventos del contexto
      var eventosKeys=Object.keys(ctx.eventos||{}).sort();
      eventosKeys.forEach(function(yrEvt){
        var dEvt=diagHist.find(function(d){return d.yr===yrEvt;});
        var dPrev=diagHist.find(function(d){return parseInt(d.yr)===parseInt(yrEvt)-1;});
        if(dEvt){
          h1+='Em <b>'+yrEvt+'</b> ocorreu '+ctx.eventos[yrEvt];
          if(dEvt.diffTotal!==null){
            h1+=', com um impacto de '+(dEvt.diffTotal>=0?'<b style="color:#2a6a40">+':'<b style="color:#a03020">')+dEvt.diffTotal.toFixed(1)+'%</b> face ao ano anterior';
          }
          h1+='. ';
        }
      });
      // Tendencia últimos años
      if(ultimos3.length>=2){
        var ult=ultimos3[ultimos3.length-1];
        var penult=ultimos3[ultimos3.length-2];
        h1+='Nos últimos anos a tendência é <b>'+tendencia3+'</b>: '+penult.yr+' fechou em <b>'+_fmtEur(penult.total)+'</b> e '+ult.yr+' em <b>'+_fmtEur(ult.total)+'</b>.';
      }
      secBody.appendChild(_bloco('#2563a8','A HISTÓRIA',h1||'Sem dados históricos suficientes.'));

      // ── Bloco 2: 2026 em contexto real
      if(diagActual){
        var h2='Com <b>'+diagActual.diasAbiertos+' dias abertos</b> até '+_fmtDate(today)+', a loja acumula <b>'+_fmtEur(diagActual.total)+'</b> a uma média de <b>'+_fmtEur(diagActual.mediaDia)+'/dia</b>. ';
        if(comparacoes2026.length>0){
          h2+='Comparando o mesmo período (até '+_fmtDate(today.substring(0,4)+'-'+todayMD)+') com anos anteriores: ';
          comparacoes2026.forEach(function(cmp){
            h2+='vs <b>'+cmp.yr+'</b> ('+_fmtEur(cmp.total)+'): '+(cmp.diff>=0?'<b style="color:#2a6a40">+':'<b style="color:#a03020">')+cmp.diff.toFixed(1)+'%</b>; ';
          });
        }
        if(projAnual){
          h2+='<br>Se mantiver este ritmo, o ano pode fechar em <b>'+_fmtEur(projAnual)+'</b>.';
          var refAno=diagHist[diagHist.length-1];
          if(refAno&&refAno.total>0){
            var diffProj=(projAnual-refAno.total)/refAno.total*100;
            h2+=' Isso representaria '+(diffProj>=0?'<b style="color:#2a6a40">+':'<b style="color:#a03020">')+diffProj.toFixed(1)+'%</b> face a '+refAno.yr+'.';
          }
        }
        secBody.appendChild(_bloco('#4a7c59','2026 — SITUAÇÃO ACTUAL',h2));
      }

      // ── Bloco 3: Cenários
      if(diagActual&&projAnual&&diagHist.length>=2){
        var pesimista=Math.min.apply(null,totaisHist.filter(function(v){return v>0;}));
        var otimista=Math.max.apply(null,totaisHist);
        var anoPes=diagHist.find(function(d){return d.total===pesimista;});
        var anoOtm=diagHist.find(function(d){return d.total===otimista;});
        var h3='<b>Cenário base</b> (ritmo actual): <b>'+_fmtEur(projAnual)+'</b><br>';
        h3+='<b>Cenário optimista</b> (replica '+anoOtm.yr+'): <b>'+_fmtEur(otimista)+'</b><br>';
        h3+='<b>Cenário pessimista</b> (replica '+(anoPes?anoPes.yr:'—')+'): <b>'+_fmtEur(pesimista)+'</b>';
        secBody.appendChild(_bloco('#1a1a1a','CENÁRIOS',h3));
      }

      sec.appendChild(secBody);
      c.appendChild(sec);
    });
  }

  function _sumObj(obj){
    if(Array.isArray(obj)) return obj.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    return Object.keys(obj).reduce(function(s,k){return s+_sumObj(obj[k]);},0);
  }

  // ════════════════════════════════════════════════════════════
  //  TAB CARREGAR — módulo de carga diaria
  // ════════════════════════════════════════════════════════════

  // Tiendas Primavera (facturação - devoluções) vs ICG (total directo)
  var LOJAS_PRIMAVERA = ['MEZKA FUNCHAL','MEZKA AVENIDA','MEZKA MERCADO','SHANA','MAXX'];

  // Estado de la carga diaria: { loja: { fat, dev, status } }
  var _cargaEstado = {};

  function _renderCarregar(){
    var c=_getContent();if(!c)return;
    c.innerHTML='';_setupContent(c);

    // ── Título
    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:16px;');
    ttl.style.setProperty('color','#888888','important');
    ttl.textContent='CARGA DIÁRIA DE VENDAS';
    c.appendChild(ttl);

    // ── Selector de fecha (sin valor por defecto — obliga a elegir conscientemente)
    var dateWrap=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:18px;border:1px solid #e0e0e0;display:flex;align-items:center;gap:16px;flex-wrap:wrap;');
    dateWrap.style.setProperty('background','#fafafa','important');
    var dateLbl=_el('span','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;');
    dateLbl.style.setProperty('color','#888888','important');
    dateLbl.textContent='DATA';
    var iS='padding:9px 14px;font-size:.88rem;font-weight:700;font-family:MontserratLight,sans-serif;border:1.5px solid #cccccc;border-radius:9px;outline:none;box-sizing:border-box;';
    var inpData=_el('input',iS);
    inpData.type='date';
    inpData.id='hadm-carga-data';
    inpData.style.setProperty('background','#ffffff','important');
    inpData.style.setProperty('color','#111111','important');
    // Sin value por defecto — el usuario debe seleccionarlo
    dateWrap.appendChild(dateLbl);
    dateWrap.appendChild(inpData);

    // Hint
    var dateHint=_el('span','font-size:.7rem;');
    dateHint.style.setProperty('color','#aaaaaa','important');
    dateHint.textContent='Selecione a data antes de registar';
    dateWrap.appendChild(dateHint);
    c.appendChild(dateWrap);

    // Cuando cambia la fecha: cargar valores existentes de Supabase
    inpData.addEventListener('change',function(){
      var d=inpData.value;
      if(!d) return;
      dateHint.textContent='A carregar valores existentes…';
      dateHint.style.setProperty('color','#aaaaaa','important');
      sbAdmin.from('ventas_historicas').select('*').eq('data',d)
        .then(function(res){
          var rows=res.data||[];
          // Precargar estado con valores existentes
          LOJAS.forEach(function(loja){
            var r=rows.find(function(x){return x.loja===loja;});
            var esPrimavera=LOJAS_PRIMAVERA.indexOf(loja)>=0;
            if(r){
              if(esPrimavera){
                // Guardamos neto en fat, dev=0 (no tenemos el desglose original)
                _cargaEstado[loja]={fat:parseFloat(r.montante)||0,dev:0,status:'saved'};
              } else {
                _cargaEstado[loja]={total:parseFloat(r.montante)||0,status:'saved'};
              }
            } else {
              if(esPrimavera){
                _cargaEstado[loja]={fat:0,dev:0,status:'pending'};
              } else {
                _cargaEstado[loja]={total:0,status:'pending'};
              }
            }
          });
          _refreshLojaCards(d);
          dateHint.textContent=rows.length>0?(rows.length+' loja(s) já registadas para esta data'):'Nenhum registo existente — preencha abaixo';
          dateHint.style.setProperty('color',rows.length>0?'#4a7c59':'#aaaaaa','important');
        }).catch(function(){
          dateHint.textContent='Erro ao carregar valores existentes';
          dateHint.style.setProperty('color','#a03020','important');
        });
    });

    // ── Grid de tiendas
    var grid=_el('div','display:flex;flex-direction:column;gap:10px;margin-bottom:24px;');
    grid.id='hadm-carga-grid';
    c.appendChild(grid);

    // Inicializar estado vacío
    LOJAS.forEach(function(loja){
      var esPrimavera=LOJAS_PRIMAVERA.indexOf(loja)>=0;
      _cargaEstado[loja]=esPrimavera?{fat:0,dev:0,status:'pending'}:{total:0,status:'pending'};
    });
    _renderLojaCards(grid);

    // ── Tabla recientes
    var rT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;margin-top:8px;');
    rT.style.setProperty('color','#888888','important');
    rT.textContent='ÚLTIMA SEMANA';
    c.appendChild(rT);
    var rBox=_el('div','');rBox.id='hadm-recentes';c.appendChild(rBox);
    _loadRecentes();
  }

  function _renderLojaCards(grid){
    grid.innerHTML='';
    LOJAS.forEach(function(loja){
      var label=LOJA_LABELS[loja]||loja;
      var esPrimavera=LOJAS_PRIMAVERA.indexOf(loja)>=0;
      var estado=_cargaEstado[loja]||{};
      var status=estado.status||'pending';

      // Card
      var card=_el('div','border-radius:12px;padding:14px 16px;border:1.5px solid;');
      var borderColor=status==='saved'?'#4a7c59':status==='error'?'#e05a5a':'#e0e0e0';
      card.style.setProperty('border-color',borderColor,'important');
      card.style.setProperty('background',status==='saved'?'#f6fbf8':'#fafafa','important');

      // Cabecera de card
      var cardHdr=_el('div','display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;');
      var cardNom=_el('span','font-size:.88rem;font-weight:800;');
      cardNom.style.setProperty('color','#111111','important');
      cardNom.textContent=label;

      // Indicador estado
      var statusDot=_el('span','font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:20px;');
      if(status==='saved'){
        statusDot.textContent='✓ guardado';
        statusDot.style.setProperty('background','#e6f4ed','important');
        statusDot.style.setProperty('color','#2a6a40','important');
      } else if(status==='saving'){
        statusDot.textContent='↑ guardando…';
        statusDot.style.setProperty('background','#fff8e6','important');
        statusDot.style.setProperty('color','#8a6000','important');
      } else if(status==='error'){
        statusDot.textContent='✗ erro';
        statusDot.style.setProperty('background','#fdecea','important');
        statusDot.style.setProperty('color','#a03020','important');
      } else {
        statusDot.textContent='pendente';
        statusDot.style.setProperty('background','#f0f0f0','important');
        statusDot.style.setProperty('color','#888888','important');
      }
      cardHdr.appendChild(cardNom);
      cardHdr.appendChild(statusDot);
      card.appendChild(cardHdr);

      var iSCard='width:100%;box-sizing:border-box;padding:8px 12px;font-size:.88rem;font-weight:700;font-family:MontserratLight,sans-serif;border:1.5px solid #dddddd;border-radius:8px;outline:none;';

      if(esPrimavera){
        // Dos campos: Facturação y Devoluções → neto calculado
        var row2=_el('div','display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;');

        var fFat=_el('div','flex:1;min-width:120px;');
        var lFat=_el('label','display:block;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;');
        lFat.style.setProperty('color','#666666','important');
        lFat.textContent='Facturação (€)';
        var inpFat=_el('input',iSCard);
        inpFat.type='number';inpFat.step='0.01';inpFat.min='0';inpFat.placeholder='0.00';
        inpFat.value=estado.fat||'';
        inpFat.style.setProperty('background','#ffffff','important');
        inpFat.style.setProperty('color','#111111','important');
        fFat.appendChild(lFat);fFat.appendChild(inpFat);

        var fDev=_el('div','flex:1;min-width:120px;');
        var lDev=_el('label','display:block;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;');
        lDev.style.setProperty('color','#666666','important');
        lDev.textContent='Devoluções (€)';
        var inpDev=_el('input',iSCard);
        inpDev.type='number';inpDev.step='0.01';inpDev.min='0';inpDev.placeholder='0.00';
        inpDev.value=estado.dev||'';
        inpDev.style.setProperty('background','#ffffff','important');
        inpDev.style.setProperty('color','#111111','important');
        fDev.appendChild(lDev);fDev.appendChild(inpDev);

        // Neto display
        var fNeto=_el('div','flex:1;min-width:100px;');
        var lNeto=_el('label','display:block;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;');
        lNeto.style.setProperty('color','#4a7c59','important');
        lNeto.textContent='Neto';
        var netoVal=_el('div','font-size:.95rem;font-weight:900;padding:8px 0;');
        netoVal.style.setProperty('color','#111111','important');
        function _updateNeto(){
          var fat=parseFloat(inpFat.value)||0;
          var dev=parseFloat(inpDev.value)||0;
          var neto=Math.max(0,fat-dev);
          netoVal.textContent=_fmtEur(neto);
          _cargaEstado[loja].fat=fat;
          _cargaEstado[loja].dev=dev;
        }
        _updateNeto();
        inpFat.addEventListener('input',_updateNeto);
        inpDev.addEventListener('input',_updateNeto);
        fNeto.appendChild(lNeto);fNeto.appendChild(netoVal);

        row2.appendChild(fFat);row2.appendChild(fDev);row2.appendChild(fNeto);
        card.appendChild(row2);

        // Botón guardar de esta tienda
        var btnCard=_mkSaveBtn(loja,statusDot,card,function(){
          var d=document.getElementById('hadm-carga-data')?document.getElementById('hadm-carga-data').value:'';
          if(!d){_flashNeedDate(statusDot);return;}
          var fat=parseFloat(inpFat.value)||0;
          var dev=parseFloat(inpDev.value)||0;
          var neto=Math.max(0,fat-dev);
          _cargaEstado[loja].fat=fat;
          _cargaEstado[loja].dev=dev;
          return {loja:loja,data:d,montante:neto};
        });
        card.appendChild(btnCard);

      } else {
        // ICG: un solo campo total
        var rowT=_el('div','display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;');
        var fTot=_el('div','flex:1;min-width:140px;');
        var lTot=_el('label','display:block;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;');
        lTot.style.setProperty('color','#666666','important');
        lTot.textContent='Total (€)';
        var inpTot=_el('input',iSCard);
        inpTot.type='number';inpTot.step='0.01';inpTot.min='0';inpTot.placeholder='0.00';
        inpTot.value=estado.total||'';
        inpTot.style.setProperty('background','#ffffff','important');
        inpTot.style.setProperty('color','#111111','important');
        inpTot.addEventListener('input',function(){_cargaEstado[loja].total=parseFloat(inpTot.value)||0;});
        fTot.appendChild(lTot);fTot.appendChild(inpTot);
        rowT.appendChild(fTot);
        card.appendChild(rowT);

        var btnCard=_mkSaveBtn(loja,statusDot,card,function(){
          var d=document.getElementById('hadm-carga-data')?document.getElementById('hadm-carga-data').value:'';
          if(!d){_flashNeedDate(statusDot);return;}
          var tot=parseFloat(inpTot.value)||0;
          _cargaEstado[loja].total=tot;
          return {loja:loja,data:d,montante:tot};
        });
        card.appendChild(btnCard);
      }

      grid.appendChild(card);
    });
  }

  function _refreshLojaCards(d){
    // Re-renderiza los cards con los valores precargados
    var grid=document.getElementById('hadm-carga-grid');
    if(grid) _renderLojaCards(grid);
  }

  function _mkSaveBtn(loja,statusDot,card,getPayload){
    var btn=_el('div','display:inline-block;margin-top:10px;padding:8px 20px;border-radius:8px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:MontserratLight,sans-serif;');
    btn.style.setProperty('background','#1a1a1a','important');
    btn.style.setProperty('color','#ffffff','important');
    btn.textContent='Guardar';
    btn.addEventListener('click',function(){
      var payload=getPayload();
      if(!payload) return;
      // Actualizar estado visual
      _cargaEstado[loja].status='saving';
      statusDot.textContent='↑ guardando…';
      statusDot.style.setProperty('background','#fff8e6','important');
      statusDot.style.setProperty('color','#8a6000','important');
      card.style.setProperty('border-color','#ccaa00','important');
      btn.style.opacity='.5';btn.style.pointerEvents='none';

      sbAdmin.from('ventas_historicas').upsert(payload,{onConflict:'loja,data'})
        .then(function(res){
          btn.style.opacity='1';btn.style.pointerEvents='';
          if(res.error){
            _cargaEstado[loja].status='error';
            statusDot.textContent='✗ erro';
            statusDot.style.setProperty('background','#fdecea','important');
            statusDot.style.setProperty('color','#a03020','important');
            card.style.setProperty('border-color','#e05a5a','important');
            card.style.setProperty('background','#fafafa','important');
          } else {
            _cargaEstado[loja].status='saved';
            statusDot.textContent='✓ guardado';
            statusDot.style.setProperty('background','#e6f4ed','important');
            statusDot.style.setProperty('color','#2a6a40','important');
            card.style.setProperty('border-color','#4a7c59','important');
            card.style.setProperty('background','#f6fbf8','important');
            // Actualizar _allRows en memoria
            _allRows=_allRows.filter(function(r){return!(r.loja===payload.loja&&r.data===payload.data);});
            _allRows.push(payload);
            _loadRecentes();
          }
        }).catch(function(){
          btn.style.opacity='1';btn.style.pointerEvents='';
          _cargaEstado[loja].status='error';
          statusDot.textContent='✗ erro ligação';
          statusDot.style.setProperty('background','#fdecea','important');
          statusDot.style.setProperty('color','#a03020','important');
          card.style.setProperty('border-color','#e05a5a','important');
        });
    });
    return btn;
  }

  function _flashNeedDate(statusDot){
    statusDot.textContent='⚠ selecione a data';
    statusDot.style.setProperty('background','#fff3cd','important');
    statusDot.style.setProperty('color','#856404','important');
    var inpData=document.getElementById('hadm-carga-data');
    if(inpData){inpData.style.setProperty('border-color','#ccaa00','important');setTimeout(function(){inpData.style.setProperty('border-color','#cccccc','important');},2000);}
    setTimeout(function(){
      var e=_cargaEstado[statusDot._loja];
      statusDot.textContent=e&&e.status==='saved'?'✓ guardado':'pendente';
    },2000);
  }

  function _loadRecentes(){
    var box=document.getElementById('hadm-recentes');if(!box)return;
    box.innerHTML='<div style="font-size:.8rem;padding:8px 0;color:#666 !important;">a carregar…</div>';
    // Última semana: 7 días × 7 tiendas = hasta 49 registros, ordenados por fecha desc
    var semanaAtras=_dateToStr(new Date(new Date().setDate(new Date().getDate()-7)));
    sbAdmin.from('ventas_historicas').select('*')
      .gte('data', semanaAtras)
      .order('data',{ascending:false})
      .order('loja',{ascending:true})
      .then(function(res){
        box.innerHTML='';
        if(res.error||!res.data||!res.data.length){
          var e=_el('div','font-size:.8rem;padding:8px 0;');
          e.style.setProperty('color','#666666','important');
          e.textContent='Sem registos na última semana.';
          box.appendChild(e);return;
        }
        // Agrupar por fecha
        var byDate={};
        var dateOrder=[];
        res.data.forEach(function(r){
          if(!byDate[r.data]){byDate[r.data]=[];dateOrder.push(r.data);}
          byDate[r.data].push(r);
        });
        // Fechas únicas ordenadas desc
        var dates=[...new Set(dateOrder)].sort(function(a,b){return b>a?1:-1;});
        dates.forEach(function(date){
          // Cabecera de fecha
          var dHdr=_el('div','font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:8px 0 4px;border-top:2px solid #e0e0e0;margin-top:8px;');
          dHdr.style.setProperty('color','#555555','important');
          dHdr.textContent=_fmtDate(date)+' · '+_dowStr(date);
          box.appendChild(dHdr);

          var tw=_el('div','overflow-x:auto;border-radius:10px;border:1px solid #e0e0e0;margin-bottom:4px;');
          var t=document.createElement('table');
          t.setAttribute('style','width:100%;border-collapse:collapse;font-size:.78rem;');

          var thead=document.createElement('thead'),htr=document.createElement('tr');
          ['Loja','Montante',''].forEach(function(h){
            var th=document.createElement('th');
            th.textContent=h;
            th.setAttribute('style','padding:6px 10px;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1.5px solid #e0e0e0;');
            th.style.setProperty('color','#555555','important');
            th.style.setProperty('background','#f5f5f5','important');
            htr.appendChild(th);
          });
          thead.appendChild(htr);t.appendChild(thead);

          var tbody=document.createElement('tbody');
          byDate[date].forEach(function(r,i){
            var tr=document.createElement('tr');
            var bg=i%2===0?'#ffffff':'#fafafa';

            // Loja
            var tdL=document.createElement('td');
            tdL.textContent=LOJA_LABELS[r.loja]||r.loja;
            tdL.setAttribute('style','padding:6px 10px;border-bottom:1px solid #eeeeee;white-space:nowrap;');
            tdL.style.setProperty('background',bg,'important');
            tdL.style.setProperty('color','#111111','important');

            // Montante (editable inline)
            var tdM=document.createElement('td');
            tdM.setAttribute('style','padding:6px 10px;border-bottom:1px solid #eeeeee;white-space:nowrap;font-weight:800;text-align:right;');
            tdM.style.setProperty('background',bg,'important');
            tdM.style.setProperty('color','#111111','important');
            var valSpan=document.createElement('span');
            valSpan.textContent=_fmtEur(r.montante);
            tdM.appendChild(valSpan);

            // Lápiz — edición inline
            var tdAct=document.createElement('td');
            tdAct.setAttribute('style','padding:6px 10px;border-bottom:1px solid #eeeeee;text-align:center;width:36px;');
            tdAct.style.setProperty('background',bg,'important');
            var pencil=document.createElement('span');
            pencil.textContent='✏️';
            pencil.setAttribute('style','cursor:pointer;font-size:.85rem;opacity:.6;');
            pencil.addEventListener('mouseenter',function(){pencil.style.opacity='1';});
            pencil.addEventListener('mouseleave',function(){if(!pencil._editing)pencil.style.opacity='.6';});
            pencil.addEventListener('click',function(){
              if(pencil._editing) return;
              pencil._editing=true;pencil.style.opacity='1';
              // Reemplazar span por input
              var inp=document.createElement('input');
              inp.type='number';inp.step='0.01';inp.min='0';
              inp.value=parseFloat(r.montante)||0;
              inp.setAttribute('style','width:90px;padding:4px 6px;font-size:.82rem;font-weight:700;border:1.5px solid #4a7c59;border-radius:6px;outline:none;font-family:MontserratLight,sans-serif;text-align:right;');
              inp.style.setProperty('background','#ffffff','important');
              inp.style.setProperty('color','#111111','important');
              tdM.innerHTML='';tdM.appendChild(inp);inp.focus();inp.select();

              // Botones ✓ ✗
              var ok=document.createElement('span');ok.textContent='✓';
              ok.setAttribute('style','cursor:pointer;color:#2a6a40;font-weight:900;font-size:1rem;margin-left:4px;');
              var cancel=document.createElement('span');cancel.textContent='✗';
              cancel.setAttribute('style','cursor:pointer;color:#a03020;font-weight:900;font-size:1rem;margin-left:4px;');
              tdAct.innerHTML='';tdAct.appendChild(ok);tdAct.appendChild(cancel);

              ok.addEventListener('click',function(){
                var newVal=parseFloat(inp.value)||0;
                ok.textContent='…';ok.style.pointerEvents='none';
                sbAdmin.from('ventas_historicas').upsert({loja:r.loja,data:r.data,montante:newVal},{onConflict:'loja,data'})
                  .then(function(res2){
                    if(res2.error){
                      tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                      tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.style.opacity='.6';
                    } else {
                      r.montante=newVal;
                      tdM.innerHTML='';valSpan.textContent=_fmtEur(newVal);tdM.appendChild(valSpan);
                      tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.style.opacity='.6';
                      // Actualizar memoria
                      _allRows=_allRows.filter(function(x){return!(x.loja===r.loja&&x.data===r.data);});
                      _allRows.push({loja:r.loja,data:r.data,montante:newVal});
                    }
                  }).catch(function(){
                    tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                    tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.style.opacity='.6';
                  });
              });
              cancel.addEventListener('click',function(){
                tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.style.opacity='.6';
              });
            });
            tdAct.appendChild(pencil);

            tr.appendChild(tdL);tr.appendChild(tdM);tr.appendChild(tdAct);
            tbody.appendChild(tr);
          });
          t.appendChild(tbody);tw.appendChild(t);box.appendChild(tw);
        });
      }).catch(function(){
        box.innerHTML='';
        var e=_el('div','font-size:.8rem;padding:8px 0;');
        e.style.setProperty('color','#a03020','important');
        e.textContent='Erro ao carregar registos.';
        box.appendChild(e);
      });
  }

  function _el(tag,css,bg){var el=document.createElement(tag);if(css)el.setAttribute('style',css);if(bg)el.style.setProperty('background',bg,'important');return el;}
  function _setupContent(c){c.style.setProperty('background','#ffffff','important');c.style.setProperty('padding','16px 24px 80px','important');c.style.setProperty('width','100%','important');c.style.setProperty('max-width','900px','important');c.style.setProperty('margin-left','auto','important');c.style.setProperty('margin-right','auto','important');c.style.setProperty('box-sizing','border-box','important');}

  function _injectStyles(){
    if(document.getElementById('hadm-styles'))return;
    var s=document.createElement('style');s.id='hadm-styles';
    s.textContent=
      '#adm-historico-panel input[type="number"]::-webkit-outer-spin-button,#adm-historico-panel input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}'+
      '#adm-historico-panel input[type="number"]{-moz-appearance:textfield;}'+
      '#adm-historico-panel select option{background:#ffffff !important;color:#111111 !important;}'+
      '.hadm-filter-container{display:flex !important;flex-direction:column !important;align-items:center !important;gap:15px !important;background:#f5f5f5 !important;padding:20px !important;border-radius:15px !important;margin:20px auto !important;width:fit-content !important;max-width:calc(100% - 32px) !important;border:1px solid #e0e0e0 !important;box-sizing:border-box !important;}'+
      '.hadm-row{display:flex !important;gap:10px !important;justify-content:center !important;align-items:flex-end !important;flex-wrap:wrap !important;}';
    document.head.appendChild(s);
  }

  // IDs de todos los botones de período y zona
  var _PERIOD_BTNS = ['hadm-btn-7','hadm-btn-30','hadm-btn-90','hadm-btn-mes','hadm-btn-ano','hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4','hadm-btn-total'];
  var _ZONE_BTNS   = ['hadm-btn-parfois','hadm-btn-primavera','hadm-btn-mezkaps','hadm-btn-mezkafnc','hadm-btn-domingo'];

  function _applyBtnStyles(){
    _PERIOD_BTNS.forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.setAttribute('style',id===_activePeriodBtn?S.pillAct:S.pill);
    });
    _ZONE_BTNS.forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.setAttribute('style',id===_activeZoneBtn?S.pillAct:S.pill);
    });
    ['hadm-tab-vendas','hadm-tab-carregar','hadm-tab-proyeccion'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      var tab=id.replace('hadm-tab-','');
      el.setAttribute('style',tab===_activeTab?S.tabAct:S.tab);
    });
  }

  setTimeout(function(){
    // ── Modal de trazabilidad — cerrar
    var trazaClose=document.getElementById('hadm-traza-close');
    var trazaOverlay=document.getElementById('hadm-traza-overlay');
    if(trazaClose) trazaClose.addEventListener('click',_closeTrazaModal);
    if(trazaOverlay) trazaOverlay.addEventListener('click',function(e){
      if(e.target===trazaOverlay) _closeTrazaModal();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape') _closeTrazaModal();
    });

    // Tabs — solo vendas y carregar (estacional eliminado)
    ['vendas','carregar','proyeccion'].forEach(function(tab){
      var btn=document.getElementById('hadm-tab-'+tab);
      if(!btn)return;
      btn.addEventListener('click',function(){_activeTab=tab;_applyBtnStyles();_render();});
    });

    // Botones de período — mantienen zona activa
    var periods={
      'hadm-btn-7':   _period7,
      'hadm-btn-30':  _period30,
      'hadm-btn-90':  _period90,
      'hadm-btn-mes': _periodMes,
      'hadm-btn-ano': _periodAno,
      'hadm-btn-q1':  _periodQ1,
      'hadm-btn-q2':  _periodQ2,
      'hadm-btn-q3':  _periodQ3,
      'hadm-btn-q4':  _periodQ4
    };
    Object.keys(periods).forEach(function(id){
      var btn=document.getElementById(id);if(!btn)return;
      btn.addEventListener('click',function(){
        var p=periods[id]();
        var fEl=document.getElementById('hadm-from'),tEl=document.getElementById('hadm-to');
        if(fEl)fEl.value=p.from;
        if(tEl)tEl.value=p.to;
        _activePeriodBtn=id;
        // Zona se mantiene — NO se resetea
        _applyBtnStyles();
        _render();
      });
    });

    // Botón Total — todo el histórico
    var btnTotal=document.getElementById('hadm-btn-total');
    if(btnTotal){
      btnTotal.addEventListener('click',function(){
        var pt=_periodTotal(_allRows);
        var fEl=document.getElementById('hadm-from'),tEl=document.getElementById('hadm-to');
        if(fEl)fEl.value=pt.from;
        if(tEl)tEl.value=pt.to;
        _activePeriodBtn='hadm-btn-total';
        // Zona se mantiene
        _applyBtnStyles();
        _render();
      });
    }

    // Botones de zona — mantienen período activo
    var zBtns={
      'hadm-btn-parfois':   ZONA_PARFOIS,
      'hadm-btn-primavera': ZONA_PRIMAVERA,
      'hadm-btn-mezkaps':   ZONA_MEZKAPS,
      'hadm-btn-mezkafnc':  ZONA_MEZKAFNC
    };
    function _applyZone(lojas,btnId){
      var lojaEl=document.getElementById('hadm-loja');
      if(lojaEl){lojaEl.value='';lojaEl.dataset.zone=JSON.stringify(lojas);}
      _activeZoneBtn=btnId;
      // Período se mantiene — NO se resetea
      _applyBtnStyles();
      _render();
    }
    Object.keys(zBtns).forEach(function(id){
      var btn=document.getElementById(id);if(!btn)return;
      btn.addEventListener('click',function(){
        // Si ya está activo, deseleccionar (toggle)
        if(_activeZoneBtn===id){
          var lojaEl=document.getElementById('hadm-loja');
          if(lojaEl){lojaEl.value='';delete lojaEl.dataset.zone;}
          _activeZoneBtn=null;
          _applyBtnStyles();
          _render();
        } else {
          _applyZone(zBtns[id],id);
        }
      });
    });

    // Botón Domingo Ps — especial, no usa filtro de período
    var btnDomingo=document.getElementById('hadm-btn-domingo');
    if(btnDomingo){
      btnDomingo.addEventListener('click',function(){
        if(_activeZoneBtn==='hadm-btn-domingo'){
          // Toggle off
          _activeZoneBtn=null;
          var lojaEl=document.getElementById('hadm-loja');
          if(lojaEl){lojaEl.value='';delete lojaEl.dataset.zone;}
          _applyBtnStyles();
          _render();
        } else {
          _activeZoneBtn='hadm-btn-domingo';
          var lojaEl=document.getElementById('hadm-loja');
          if(lojaEl){lojaEl.value='';delete lojaEl.dataset.zone;}
          _applyBtnStyles();
          _render();
        }
      });
    }

    // Botón buscar manual
    var buscar=document.getElementById('hadm-buscar-btn');
    if(buscar)buscar.addEventListener('click',function(){
      var lojaEl=document.getElementById('hadm-loja');
      if(lojaEl)delete lojaEl.dataset.zone;
      _activePeriodBtn=null;
      _activeZoneBtn=null;
      _applyBtnStyles();
      _render();
    });

    var lojaEl=document.getElementById('hadm-loja');
    if(lojaEl)lojaEl.addEventListener('change',function(){
      delete lojaEl.dataset.zone;
      _activePeriodBtn=null;
      _activeZoneBtn=null;
      _applyBtnStyles();
    });

    _applyBtnStyles();
  },0);

})();
