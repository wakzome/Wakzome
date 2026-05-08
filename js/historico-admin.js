// ══════════════════════════════════════════════════════════════
//  HISTÓRICO DE VENDAS — ADMINISTRADOR
//  Árbol expandible: Tienda → Año → Mes → Día
//  Comparación inteligente por día de semana equivalente
// ══════════════════════════════════════════════════════════════
(function () {

  var LOJAS = ['MAXX','MEZKA AVENIDA','MEZKA FUNCHAL','MEZKA MERCADO','PARFOIS ARCADAS SAO FRANCISCO','PARFOIS MADEIRA SHOPPING','SHANA'];
  var LOJA_LABELS = {'MAXX':'Maxx','MEZKA AVENIDA':'Mezka Avenida','MEZKA FUNCHAL':'Mezka Funchal','MEZKA MERCADO':'Mezka Mercado','PARFOIS ARCADAS SAO FRANCISCO':'Parfois Arcadas','PARFOIS MADEIRA SHOPPING':'Madeira Shopping','SHANA':'Shana'};
  var ZONA_PARFOIS = ['PARFOIS ARCADAS SAO FRANCISCO','PARFOIS MADEIRA SHOPPING'];
  var ZONA_MEZKA   = ['MEZKA FUNCHAL','MEZKA MERCADO','MEZKA AVENIDA','SHANA','MAXX'];
  var ZONA_MEZKAF  = ['MEZKA FUNCHAL'];
  var MESES_PT     = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var DIAS_PT      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

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

  function _buildComparisons(from, to, rows) {
    var fromD=_strToDate(from), toD=_strToDate(to);
    var nDays=Math.round((toD-fromD)/86400000)+1;
    var dowPattern=[];
    for(var i=0;i<nDays;i++){var d=new Date(fromD);d.setDate(fromD.getDate()+i);dowPattern.push(d.getDay());}
    var comps=[];
    [52,104,156,208].forEach(function(w){
      var cFromD=new Date(fromD); cFromD.setDate(fromD.getDate()-w*7);
      var cToD=new Date(cFromD); cToD.setDate(cFromD.getDate()+nDays-1);
      var cFrom=_dateToStr(cFromD),cTo=_dateToStr(cToD);
      var cDow=[];
      for(var i=0;i<nDays;i++){var d=new Date(cFromD);d.setDate(cFromD.getDate()+i);cDow.push(d.getDay());}
      if(!cDow.every(function(d,i){return d===dowPattern[i];})) return;
      if(!rows.some(function(r){return r.data>=cFrom&&r.data<=cTo&&(parseFloat(r.montante)||0)>0;})) return;
      comps.push({from:cFrom,to:cTo,label:cFromD.getFullYear()+''});
    });
    return comps.slice(0,2);
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
      adminApp.style.setProperty('position','fixed','important');
      adminApp.style.setProperty('top','0','important');
      adminApp.style.setProperty('left','0','important');
      adminApp.style.setProperty('right','0','important');
      adminApp.style.setProperty('bottom','0','important');
      adminApp.style.setProperty('z-index','999','important');
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
    sbAdmin.from('ventas_historicas').select('*').order('data',{ascending:true})
      .then(function(res){_allRows=(res.error||!res.data)?[]:res.data;_render();})
      .catch(function(){_allRows=[];_render();});
  }

  function _hadmLoadData() { _render(); }
  window._hadmLoadData = _hadmLoadData;
  function _getContent() { return document.getElementById('hadm-content'); }

  function _render() {
    if(_activeTab==='vendas')     _renderVendas();
    if(_activeTab==='estacional') _renderEstacional();
    if(_activeTab==='carregar')   _renderCarregar();
  }

  // ════════════════════════════════════════════════════════════
  //  TAB VENDAS
  // ════════════════════════════════════════════════════════════
  function _renderVendas() {
    var c=_getContent(); if(!c)return;
    c.innerHTML=''; _setupContent(c);
    var f=_getFilters();
    var rows=_filterByZone(_allRows);
    var periodRows=rows.filter(function(r){return r.data>=f.from&&r.data<=f.to;});
    var periodTotal=periodRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    var nDays=Math.round((_strToDate(f.to)-_strToDate(f.from))/86400000)+1;
    var comps=_buildComparisons(f.from,f.to,rows);

    // Header resumen
    var hdr=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0e0e0;');
    hdr.style.setProperty('background','#1a1a1a','important');
    var hLbl=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;');
    hLbl.style.setProperty('color','#888888','important');
    hLbl.textContent=_fmtDate(f.from)+' → '+_fmtDate(f.to)+' ('+nDays+' dias)';
    hdr.appendChild(hLbl);
    var hVal=_el('div','font-size:2rem;font-weight:900;letter-spacing:-.02em;margin-bottom:4px;');
    hVal.style.setProperty('color','#ffffff','important');
    hVal.textContent=_fmtEur(periodTotal);
    hdr.appendChild(hVal);
    var hSub=_el('div','font-size:.72rem;');
    hSub.style.setProperty('color','#aaaaaa','important');
    hSub.textContent='Média diária: '+_fmtEur(periodTotal/nDays)+' · '+periodRows.length+' registos';
    hdr.appendChild(hSub);

    if(comps.length){
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

    // Árbol
    var treeLabel=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    treeLabel.style.setProperty('color','#999999','important');
    treeLabel.textContent='DETALHE POR LOJA · ANO · MÊS · DIA — clique para expandir';
    c.appendChild(treeLabel);

    var byLoja={};
    rows.forEach(function(r){
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

  function _sumObj(obj){
    if(Array.isArray(obj)) return obj.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    return Object.keys(obj).reduce(function(s,k){return s+_sumObj(obj[k]);},0);
  }

  // ════════════════════════════════════════════════════════════
  //  TAB ESTACIONAL
  // ════════════════════════════════════════════════════════════
  function _renderEstacional(){
    var c=_getContent(); if(!c)return;
    c.innerHTML=''; _setupContent(c);
    var rows=_filterByZone(_allRows);
    if(!rows.length){var e=_el('div','padding:40px;text-align:center;font-size:.85rem;');e.style.setProperty('color','#666666','important');e.textContent='Sem dados.';c.appendChild(e);return;}

    var byMonth=new Array(12).fill(0),cntMonth=new Array(12).fill(0);
    rows.forEach(function(r){if((parseFloat(r.montante)||0)===0)return;var m=_strToDate(r.data).getMonth();byMonth[m]+=parseFloat(r.montante);cntMonth[m]++;});
    var avgMonth=byMonth.map(function(v,i){return cntMonth[i]?v/cntMonth[i]:0;});

    var byDow=new Array(7).fill(0),cntDow=new Array(7).fill(0);
    rows.forEach(function(r){if((parseFloat(r.montante)||0)===0)return;var d=_strToDate(r.data).getDay();byDow[d]+=parseFloat(r.montante);cntDow[d]++;});
    var avgDow=byDow.map(function(v,i){return cntDow[i]?v/cntDow[i]:0;});

    var byYear={};
    rows.forEach(function(r){var yr=r.data.substring(0,4);if(!byYear[yr])byYear[yr]=0;byYear[yr]+=parseFloat(r.montante)||0;});
    var years=Object.keys(byYear).sort();

    var yest=_yesterdayStr();
    var d90=new Date(_strToDate(yest));d90.setDate(d90.getDate()-89);
    var d180=new Date(d90);d180.setDate(d90.getDate()-90);
    var d90s=_dateToStr(d90),d180s=_dateToStr(d180);
    var last90=rows.filter(function(r){return r.data>=d90s&&r.data<=yest&&(parseFloat(r.montante)||0)>0;});
    var prev90=rows.filter(function(r){return r.data>=d180s&&r.data<d90s&&(parseFloat(r.montante)||0)>0;});
    var avg90=last90.length?last90.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0)/last90.length:0;
    var avgP90=prev90.length?prev90.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0)/prev90.length:0;
    var tend90=avgP90>0?(avg90-avgP90)/avgP90*100:null;

    // Señales
    var sig=_el('div','border-radius:12px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0e0e0;');
    sig.style.setProperty('background','#fafafa','important');
    var sigT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px;');
    sigT.style.setProperty('color','#888888','important');sigT.textContent='SINAIS DO NEGÓCIO';sig.appendChild(sigT);
    var grid=_el('div','display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;');

    function _sc(icon,lbl,val,sub,col){
      var card=_el('div','border-radius:9px;padding:12px 14px;border:1px solid #e8e8e8;');
      card.style.setProperty('background','#ffffff','important');
      var i=_el('div','font-size:1.1rem;margin-bottom:3px;');i.textContent=icon;card.appendChild(i);
      var l=_el('div','font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;');
      l.style.setProperty('color','#888888','important');l.textContent=lbl;card.appendChild(l);
      var v=_el('div','font-size:.9rem;font-weight:800;');
      v.style.setProperty('color',col||'#111111','important');v.textContent=val;card.appendChild(v);
      if(sub){var s=_el('div','font-size:.65rem;margin-top:2px;');s.style.setProperty('color','#888888','important');s.textContent=sub;card.appendChild(s);}
      return card;
    }

    var bestM=avgMonth.indexOf(Math.max.apply(null,avgMonth));
    var validM=avgMonth.filter(function(v){return v>0;});
    var worstM=avgMonth.indexOf(Math.min.apply(null,validM.length?validM:[0]));
    grid.appendChild(_sc('📅','Melhor mês histórico',MESES_PT[bestM],_fmtEur(avgMonth[bestM])+'/dia em média','#2a6a40'));
    grid.appendChild(_sc('📉','Mês mais fraco',MESES_PT[worstM],_fmtEur(avgMonth[worstM])+'/dia em média','#a03020'));
    var bestD=avgDow.indexOf(Math.max.apply(null,avgDow));
    var validD=avgDow.filter(function(v){return v>0;});
    var worstD=avgDow.indexOf(Math.min.apply(null,validD.length?validD:[0]));
    grid.appendChild(_sc('📆','Melhor dia',DIAS_PT[bestD],_fmtEur(avgDow[bestD])+'/dia'));
    grid.appendChild(_sc('😴','Dia mais fraco',DIAS_PT[worstD],_fmtEur(avgDow[worstD])+'/dia','#a03020'));
    if(tend90!==null){
      var tCol=tend90>3?'#2a6a40':tend90<-3?'#a03020':'#555555';
      var tIco=tend90>3?'📈':tend90<-3?'📉':'➡️';
      var tLbl=tend90>3?'acelerando':tend90<-3?'a desacelerar':'estável';
      grid.appendChild(_sc(tIco,'Tendência 90 dias',tLbl,(tend90>=0?'+':'')+tend90.toFixed(1)+'% vs 90d anteriores',tCol));
    }
    var decAvg=avgMonth[11],totAvg=avgMonth.reduce(function(s,v){return s+v;},0)/12;
    if(decAvg>0&&totAvg>0){
      var dMult=decAvg/totAvg;
      grid.appendChild(_sc('🎄','Dezembro vs média',dMult.toFixed(1)+'x acima da média',_fmtEur(decAvg)+'/dia','#2a6a40'));
    }
    sig.appendChild(grid);c.appendChild(sig);

    // Evolución anual
    var yT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    yT.style.setProperty('color','#999999','important');yT.textContent='EVOLUÇÃO ANUAL';c.appendChild(yT);
    var yBox=_el('div','border-radius:12px;padding:14px 20px;margin-bottom:20px;border:1px solid #e0e0e0;');
    yBox.style.setProperty('background','#fafafa','important');
    var maxYr=Math.max.apply(null,years.map(function(y){return byYear[y];}))||1;
    var prevYrV=null;
    years.forEach(function(yr){
      var v=byYear[yr],pct=v/maxYr*100;
      var row=_el('div','display:flex;align-items:center;gap:12px;margin-bottom:10px;');
      var yL=_el('span','font-size:.78rem;font-weight:700;width:40px;flex-shrink:0;');
      yL.style.setProperty('color','#333333','important');yL.textContent=yr;
      var bW=_el('div','flex:1;border-radius:5px;overflow:hidden;height:12px;');
      bW.style.setProperty('background','#e8e8e8','important');
      var bF=_el('div','height:100%;border-radius:5px;');
      bF.style.setProperty('width',pct.toFixed(1)+'%','important');
      bF.style.setProperty('background','linear-gradient(90deg,#4a7aaa,#6aacdd)','important');
      bW.appendChild(bF);
      var vL=_el('span','font-size:.78rem;font-weight:700;width:100px;text-align:right;flex-shrink:0;');
      vL.style.setProperty('color','#111111','important');vL.textContent=_fmtEur(v);
      row.appendChild(yL);row.appendChild(bW);row.appendChild(vL);
      if(prevYrV!==null){
        var yD=(v-prevYrV)/prevYrV*100;
        var yB=_el('span','font-size:.65rem;font-weight:700;width:55px;text-align:right;flex-shrink:0;');
        yB.style.setProperty('color',yD>=0?'#2a6a40':'#a03020','important');
        yB.textContent=(yD>=0?'+':'')+yD.toFixed(1)+'%';
        row.appendChild(yB);
      }
      prevYrV=v;yBox.appendChild(row);
    });
    c.appendChild(yBox);

    // Mapa calor
    var hT=_el('div','font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;');
    hT.style.setProperty('color','#999999','important');hT.textContent='MAPA DE CALOR — MÉDIA DIÁRIA POR MÊS × ANO';c.appendChild(hT);
    var hBox=_el('div','border-radius:12px;padding:14px 20px;margin-bottom:20px;border:1px solid #e0e0e0;overflow-x:auto;');
    hBox.style.setProperty('background','#fafafa','important');
    var heatData={};
    rows.forEach(function(r){
      var yr=r.data.substring(0,4),mo=parseInt(r.data.substring(5,7))-1;
      if(!heatData[yr]) heatData[yr]=new Array(12).fill(null).map(function(){return{sum:0,cnt:0};});
      if((parseFloat(r.montante)||0)>0){heatData[yr][mo].sum+=parseFloat(r.montante);heatData[yr][mo].cnt++;}
    });
    var hYrs=Object.keys(heatData).sort();
    var allV=[];hYrs.forEach(function(yr){heatData[yr].forEach(function(m){if(m.cnt>0)allV.push(m.sum/m.cnt);});});
    var hMin=allV.length?Math.min.apply(null,allV):0,hMax=allV.length?Math.max.apply(null,allV):1;
    var tbl=document.createElement('table');tbl.setAttribute('style','border-collapse:collapse;font-size:.7rem;min-width:600px;');
    var thead=document.createElement('thead'),htr=document.createElement('tr');
    ['',...MESES_PT.map(function(m){return m.substring(0,3);})].forEach(function(h,i){
      var th=document.createElement('th');th.textContent=h;
      th.setAttribute('style','padding:4px 6px;text-align:'+(i===0?'left':'center')+';font-weight:700;');
      th.style.setProperty('color','#555555','important');htr.appendChild(th);
    });
    thead.appendChild(htr);tbl.appendChild(thead);
    var tbody=document.createElement('tbody');
    hYrs.forEach(function(yr){
      var tr=document.createElement('tr');
      var tdY=document.createElement('td');tdY.textContent=yr;
      tdY.setAttribute('style','padding:4px 8px;font-weight:700;');
      tdY.style.setProperty('color','#333333','important');tr.appendChild(tdY);
      heatData[yr].forEach(function(m){
        var td=document.createElement('td');td.setAttribute('style','padding:3px 4px;text-align:center;border-radius:4px;');
        if(m.cnt>0){
          var avg=m.sum/m.cnt,intensity=(avg-hMin)/(hMax-hMin||1);
          var rr=Math.round(255-(255-42)*intensity),gg=Math.round(255-(255-122)*intensity),bb=Math.round(255-(255-90)*intensity);
          td.style.setProperty('background','rgb('+rr+','+gg+','+bb+')','important');
          td.style.setProperty('color',intensity>0.5?'#ffffff':'#111111','important');
          td.textContent=Math.round(avg);
        } else {
          td.style.setProperty('background','#f0f0f0','important');td.style.setProperty('color','#cccccc','important');td.textContent='—';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);hBox.appendChild(tbl);c.appendChild(hBox);
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
  function _setupContent(c){c.style.setProperty('background','#ffffff','important');c.style.setProperty('padding','16px 24px 80px','important');c.style.setProperty('width','100%','important');c.style.setProperty('box-sizing','border-box','important');}

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

  function _applyBtnStyles(){
    ['hadm-btn-7','hadm-btn-30','hadm-btn-90','hadm-btn-mes','hadm-btn-ano'].forEach(function(id){var el=document.getElementById(id);if(el)el.setAttribute('style',id===_activePeriodBtn?S.pillAct:S.pill);});
    ['hadm-btn-parfois','hadm-btn-mezka','hadm-btn-mezkaf'].forEach(function(id){var el=document.getElementById(id);if(el)el.setAttribute('style',id===_activeZoneBtn?S.pillAct:S.pill);});
    ['hadm-tab-vendas','hadm-tab-estacional','hadm-tab-carregar'].forEach(function(id){var el=document.getElementById(id);if(!el)return;var tab=id.replace('hadm-tab-','');el.setAttribute('style',tab===_activeTab?S.tabAct:S.tab);});
  }

  setTimeout(function(){
    ['vendas','estacional','carregar'].forEach(function(tab){var btn=document.getElementById('hadm-tab-'+tab);if(!btn)return;btn.addEventListener('click',function(){_activeTab=tab;_applyBtnStyles();_render();});});
    var periods={'hadm-btn-7':_period7,'hadm-btn-30':_period30,'hadm-btn-90':_period90,'hadm-btn-mes':_periodMes,'hadm-btn-ano':_periodAno};
    Object.keys(periods).forEach(function(id){var btn=document.getElementById(id);if(!btn)return;btn.addEventListener('click',function(){var p=periods[id]();var fEl=document.getElementById('hadm-from'),tEl=document.getElementById('hadm-to');if(fEl)fEl.value=p.from;if(tEl)tEl.value=p.to;_activePeriodBtn=id;_activeZoneBtn=null;_applyBtnStyles();_render();});});
    var zBtns={'hadm-btn-parfois':ZONA_PARFOIS,'hadm-btn-mezka':ZONA_MEZKA,'hadm-btn-mezkaf':ZONA_MEZKAF};
    function _applyZone(lojas,btnId){var lojaEl=document.getElementById('hadm-loja');if(lojaEl){lojaEl.value='';lojaEl.dataset.zone=JSON.stringify(lojas);}    _activeZoneBtn=btnId;_activePeriodBtn=null;_applyBtnStyles();_render();}
    Object.keys(zBtns).forEach(function(id){var btn=document.getElementById(id);if(!btn)return;btn.addEventListener('click',function(){_applyZone(zBtns[id],id);});});
    var buscar=document.getElementById('hadm-buscar-btn');
    if(buscar)buscar.addEventListener('click',function(){var lojaEl=document.getElementById('hadm-loja');if(lojaEl)delete lojaEl.dataset.zone;_activePeriodBtn=null;_activeZoneBtn=null;_applyBtnStyles();_render();});
    var lojaEl=document.getElementById('hadm-loja');
    if(lojaEl)lojaEl.addEventListener('change',function(){delete lojaEl.dataset.zone;_activePeriodBtn=null;_activeZoneBtn=null;_applyBtnStyles();});
    _applyBtnStyles();
  },0);

})();
