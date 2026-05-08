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
    var comps=_buildComparisons(f.from,f.to,rows);

    // Header resumen
    var hdr=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0e0e0;');
    hdr.style.setProperty('background','#1a1a1a','important');
    var hLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;');
    hLbl.style.setProperty('color','#888888','important');
    hLbl.textContent=isTotal?'TOTAL HISTÓRICO':(_fmtDate(f.from)+' → '+_fmtDate(f.to)+' ('+nDays+' dias)');
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
      var cRow=_el('div','display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #333333;');
      comps.forEach(function(comp){
        var cRows=rows.filter(function(r){return r.data>=comp.from&&r.data<=comp.to;});
        var cTotal=cRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var diff=cTotal>0?(periodTotal-cTotal)/cTotal*100:null;
        var cBox=_el('div','');
        var cLbl=_el('div','font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;');
        cLbl.style.setProperty('color','#666666','important');
        cLbl.textContent='vs '+comp.label+' ('+_fmtDate(comp.from)+'→'+_fmtDate(comp.to)+')';
        cBox.appendChild(cLbl);
        var cLine=_el('div','display:flex;align-items:baseline;gap:8px;');
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
    var currentCount=currentYearRows.length;

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
    hSub.textContent=currentCount+' domingos registados · média: '+_fmtEur(currentCount?currentTotal/currentCount:0)+'/domingo';
    hdr.appendChild(hSub);

    // Comparações com anos anteriores
    var prevYears=years.filter(function(y){return y!==currentYear;});
    if(prevYears.length){
      var cRow=_el('div','display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #333333;');
      prevYears.forEach(function(yr){
        var yrRows=byYear[yr];
        var yrTotal=yrRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var yrCount=yrRows.length;
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
  //  TAB CARREGAR
  // ════════════════════════════════════════════════════════════
  function _renderCarregar(){
    var c=_getContent();if(!c)return;
    c.innerHTML='';_setupContent(c);
    var ttl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:16px;');
    ttl.style.setProperty('color','#888888','important');ttl.textContent='REGISTAR VENDA HISTÓRICA';c.appendChild(ttl);
    var form=_el('div','border-radius:12px;padding:20px;margin-bottom:22px;border:1px solid #e0e0e0;');
    form.style.setProperty('background','#fafafa','important');
    function _fR(lbl,inp){var row=_el('div','margin-bottom:14px;');var label=_el('label','display:block;font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;');label.style.setProperty('color','#666666','important');label.textContent=lbl;row.appendChild(label);row.appendChild(inp);return row;}
    var iS='width:100%;box-sizing:border-box;padding:10px 14px;font-size:.88rem;font-weight:600;font-family:MontserratLight,sans-serif;border:1.5px solid #cccccc;border-radius:9px;outline:none;';
    var inpD=_el('input',iS);inpD.type='date';inpD.id='hadm-inp-data';inpD.value=_yesterdayStr();
    inpD.style.setProperty('background','#ffffff','important');inpD.style.setProperty('color','#111111','important');
    form.appendChild(_fR('Data',inpD));
    var inpL=document.createElement('select');inpL.id='hadm-inp-loja';inpL.setAttribute('style',iS);
    inpL.style.setProperty('background','#ffffff','important');inpL.style.setProperty('color','#111111','important');
    var op0=document.createElement('option');op0.value='';op0.textContent='Selecionar loja…';inpL.appendChild(op0);
    LOJAS.forEach(function(l){var o=document.createElement('option');o.value=l;o.textContent=LOJA_LABELS[l]||l;inpL.appendChild(o);});
    form.appendChild(_fR('Loja',inpL));
    var inpM=_el('input',iS);inpM.type='number';inpM.id='hadm-inp-montante';inpM.placeholder='0.00';inpM.step='0.01';inpM.min='0';
    inpM.style.setProperty('background','#ffffff','important');inpM.style.setProperty('color','#111111','important');
    form.appendChild(_fR('Montante (€)',inpM));
    var fb=_el('div','font-size:.78rem;font-weight:700;min-height:20px;margin-bottom:12px;');fb.id='hadm-feedback';form.appendChild(fb);
    var btn=_el('div','display:inline-block;padding:12px 28px;border-radius:10px;font-size:.88rem;font-weight:800;cursor:pointer;text-align:center;font-family:MontserratLight,sans-serif;');
    btn.style.setProperty('background','#1a1a1a','important');btn.style.setProperty('color','#ffffff','important');btn.textContent='Guardar em Supabase';
    btn.addEventListener('click',function(){
      var d=(document.getElementById('hadm-inp-data')||{}).value;
      var l=(document.getElementById('hadm-inp-loja')||{}).value;
      var m=(document.getElementById('hadm-inp-montante')||{}).value;
      var fbEl=document.getElementById('hadm-feedback');
      if(!d||!l||m===''){if(fbEl){fbEl.textContent='⚠ Preencha todos os campos.';fbEl.style.setProperty('color','#a03020','important');}return;}
      btn.style.opacity='.5';btn.style.pointerEvents='none';
      if(fbEl){fbEl.textContent='A guardar…';fbEl.style.setProperty('color','#666666','important');}
      sbAdmin.from('ventas_historicas').upsert({loja:l,data:d,montante:parseFloat(m)},{onConflict:'loja,data'})
        .then(function(res){
          btn.style.opacity='1';btn.style.pointerEvents='';
          if(res.error){if(fbEl){fbEl.textContent='✗ '+res.error.message;fbEl.style.setProperty('color','#a03020','important');}}
          else{
            if(fbEl){fbEl.textContent='✓ Guardado: '+(LOJA_LABELS[l]||l)+' · '+_fmtDate(d)+' · '+_fmtEur(parseFloat(m));fbEl.style.setProperty('color','#2a6a40','important');}
            if(document.getElementById('hadm-inp-data'))document.getElementById('hadm-inp-data').value=_yesterdayStr();
            if(document.getElementById('hadm-inp-loja'))document.getElementById('hadm-inp-loja').value='';
            if(document.getElementById('hadm-inp-montante'))document.getElementById('hadm-inp-montante').value='';
            _allRows=_allRows.filter(function(r){return!(r.loja===l&&r.data===d);});
            _allRows.push({loja:l,data:d,montante:parseFloat(m)});
            _loadRecentes();
          }
        }).catch(function(){btn.style.opacity='1';btn.style.pointerEvents='';if(fbEl){fbEl.textContent='✗ Erro de ligação.';fbEl.style.setProperty('color','#a03020','important');}});
    });
    form.appendChild(btn);c.appendChild(form);
    var rT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    rT.style.setProperty('color','#888888','important');rT.textContent='ÚLTIMOS REGISTOS INSERIDOS';c.appendChild(rT);
    var rBox=_el('div','');rBox.id='hadm-recentes';c.appendChild(rBox);
    _loadRecentes();
  }

  function _loadRecentes(){
    var box=document.getElementById('hadm-recentes');if(!box)return;
    box.innerHTML='<div style="font-size:.8rem;padding:8px 0;color:#666 !important;">a carregar…</div>';
    sbAdmin.from('ventas_historicas').select('*').order('created_at',{ascending:false}).limit(15)
      .then(function(res){
        box.innerHTML='';
        if(res.error||!res.data||!res.data.length){var e=_el('div','font-size:.8rem;padding:8px 0;');e.style.setProperty('color','#666666','important');e.textContent='Sem registos recentes.';box.appendChild(e);return;}
        var tw=_el('div','overflow-x:auto;border-radius:10px;border:1px solid #e0e0e0;');
        var t=document.createElement('table');t.setAttribute('style','width:100%;border-collapse:collapse;font-size:.78rem;');
        var thead=document.createElement('thead'),htr=document.createElement('tr');
        ['Data','Loja','Montante'].forEach(function(h){var th=document.createElement('th');th.textContent=h;th.setAttribute('style','padding:7px 12px;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1.5px solid #e0e0e0;');th.style.setProperty('color','#555555','important');th.style.setProperty('background','#f5f5f5','important');htr.appendChild(th);});
        thead.appendChild(htr);t.appendChild(thead);
        var tbody=document.createElement('tbody');
        res.data.forEach(function(r,i){var tr=document.createElement('tr');var bg=i%2===0?'#ffffff':'#fafafa';[_fmtDate(r.data),LOJA_LABELS[r.loja]||r.loja,_fmtEur(r.montante)].forEach(function(v,ci){var td=document.createElement('td');td.textContent=v;td.setAttribute('style','padding:7px 12px;border-bottom:1px solid #eeeeee;white-space:nowrap;'+(ci===2?'font-weight:800;text-align:right;':''));td.style.setProperty('background',bg,'important');td.style.setProperty('color','#111111','important');tr.appendChild(td);});tbody.appendChild(tr);});
        t.appendChild(tbody);tw.appendChild(t);box.appendChild(tw);
      }).catch(function(){});
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
  var _PERIOD_BTNS = ['hadm-btn-7','hadm-btn-30','hadm-btn-90','hadm-btn-mes','hadm-btn-ano','hadm-btn-total'];
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
      'hadm-btn-ano': _periodAno
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
