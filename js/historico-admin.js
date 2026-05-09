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
  function _dateToStr(d) { return d.getFullYear()+'-'+_pad(d.getMonth()+1)+'-'+_pad(d.getDate()); }
  function _strToDate(s) { return new Date(s+'T00:00:00'); }
  function _fmtDate(str) { if(!str)return''; var p=str.split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:str; }
  function _fmtEur(v) { var n=parseFloat(v||0).toFixed(2),parts=n.split('.'); parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return parts[0]+','+parts[1]+'\u00a0€'; }
  function _dowStr(s) { return DIAS_PT[_strToDate(s).getDay()]; }

  function _yesterday() { return _strToDate(_yesterdayStr()); }
  function _period7()   { var t=_yesterday(),f=new Date(t); f.setDate(t.getDate()-6);  return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _period30()  { var t=_yesterday(),f=new Date(t); f.setDate(t.getDate()-29); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _period90()  { var t=_yesterday(),f=new Date(t); f.setDate(t.getDate()-89); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _periodMes() { var t=_yesterday(),f=new Date(t.getFullYear(),t.getMonth(),1); return {from:_dateToStr(f),to:_dateToStr(t)}; }
  function _periodAno() { var t=_yesterday(); return {from:t.getFullYear()+'-01-01',to:_dateToStr(t)}; }
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
    if(_activeTab==='vendas')   _renderVendas();
    if(_activeTab==='carregar') _renderCarregar();
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

    var rows=_filterByZone(_allRows);
    var isTotal=(_activePeriodBtn==='hadm-btn-total');
    var f;
    if(isTotal){
      f=_periodTotal(_allRows); // para el header usar rango completo
    } else {
      f=_getFilters();
    }

    // Para el header: ventas del período seleccionado (zona filtrada)
    var periodRows=rows.filter(function(r){return r.data>=f.from&&r.data<=f.to;});
    var periodTotal=periodRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    var nDays=Math.round((_strToDate(f.to)-_strToDate(f.from))/86400000)+1;
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
    hLbl.textContent=isTotal?'TOTAL HISTÓRICO':(_fmtDate(f.from)+' → '+_fmtDate(f.to)+' ('+nDays+' dias)'+(_equalDates?' · datas exactas':''));
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
      var lojaHdr=_el('div','display:flex;align-items:center;justify-content:space-between;');
      var lojaNom=_el('span','font-size:.95rem;font-weight:800;');
      lojaNom.style.setProperty('color','#111111','important');
      lojaNom.textContent=(lojaOpen?'▼ ':'▶ ')+lojaLabel;
      var lojaSum=_el('span','font-size:.95rem;font-weight:800;');
      lojaSum.style.setProperty('color','#111111','important');
      lojaSum.textContent=_fmtEur(lojaTotal);
      lojaHdr.appendChild(lojaNom); lojaHdr.appendChild(lojaSum);
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
    ['hadm-tab-vendas','hadm-tab-carregar'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      var tab=id.replace('hadm-tab-','');
      el.setAttribute('style',tab===_activeTab?S.tabAct:S.tab);
    });
  }

  setTimeout(function(){
    // Tabs — solo vendas y carregar (estacional eliminado)
    ['vendas','carregar'].forEach(function(tab){
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
