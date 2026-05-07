// ══════════════════════════════════════════════════════════════
//  HISTÓRICO DE VENDAS — VISTA ADMINISTRADOR
// ══════════════════════════════════════════════════════════════
(function () {

  var LOJAS = [
    'MAXX',
    'MEZKA AVENIDA',
    'MEZKA FUNCHAL',
    'MEZKA MERCADO',
    'PARFOIS ARCADAS SAO FRANCISCO',
    'PARFOIS MADEIRA SHOPPING',
    'SHANA'
  ];

  var LOJA_LABELS = {
    'MAXX':                          'Maxx',
    'MEZKA AVENIDA':                 'Mezka Avenida',
    'MEZKA FUNCHAL':                 'Mezka Funchal',
    'MEZKA MERCADO':                 'Mezka Mercado',
    'PARFOIS ARCADAS SAO FRANCISCO': 'Parfois Arcadas',
    'PARFOIS MADEIRA SHOPPING':      'Madeira Shopping',
    'SHANA':                         'Shana'
  };

  var PORTO_SANTO = ['MAXX', 'MEZKA AVENIDA', 'MEZKA MERCADO', 'SHANA'];
  var FUNCHAL     = ['MEZKA FUNCHAL', 'PARFOIS ARCADAS SAO FRANCISCO', 'PARFOIS MADEIRA SHOPPING'];

  var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  // ── Estilos botones pill ──
  var S = {
    normal: 'background:#3d3d3d !important;color:#f0f0f0 !important;border:1.5px solid #666 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    active: 'background:#4a7c59 !important;color:#ffffff !important;border:1.5px solid #4a7c59 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    tab:    'background:#2a2a2a !important;color:#aaaaaa !important;border:1.5px solid #444 !important;border-radius:10px !important;padding:9px 22px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;',
    tabAct: 'background:#4a7c59 !important;color:#ffffff !important;border:1.5px solid #4a7c59 !important;border-radius:10px !important;padding:9px 22px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;font-family:MontserratLight,sans-serif !important;'
  };

  var _activeTab       = 'analise';
  var _activePeriodBtn = null;
  var _activeZoneBtn   = null;

  // ── Helpers fecha ──
  function _todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }
  function _dateToStr(d) {
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }
  function _pad(n) { return n < 10 ? '0' + n : String(n); }
  function _fmtDate(str) {
    if (!str) return '';
    var p = str.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : str;
  }
  function _fmtEur(v) {
    var n = parseFloat(v || 0).toFixed(2);
    var parts = n.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts[0] + ',' + parts[1] + '\u00a0€';
  }

  // ── Períodos ──
  function _periodHoje()     { var t = _todayStr(); return { from: t, to: t }; }
  function _period30()       { var t = new Date(); var f = new Date(t); f.setDate(t.getDate()-29); return { from: _dateToStr(f), to: _dateToStr(t) }; }
  function _period90()       { var t = new Date(); var f = new Date(t); f.setDate(t.getDate()-89); return { from: _dateToStr(f), to: _dateToStr(t) }; }
  function _periodAnoAtual() { var d = new Date(); return { from: d.getFullYear()+'-01-01', to: _dateToStr(d) }; }
  function _periodHistorico(){ return { from: '2017-01-01', to: _todayStr() }; }
  function _periodMesAtual() {
    var d = new Date();
    var f = new Date(d.getFullYear(), d.getMonth(), 1);
    var t = new Date(d.getFullYear(), d.getMonth()+1, 0);
    return { from: _dateToStr(f), to: _dateToStr(t) };
  }

  function _applyPeriod(period, btnId) {
    var fEl = document.getElementById('hadm-from');
    var tEl = document.getElementById('hadm-to');
    if (fEl) fEl.value = period.from;
    if (tEl) tEl.value = period.to;
    _activePeriodBtn = btnId;
    _activeZoneBtn   = null;
    _applyBtnStyles();
    _hadmLoadData();
  }

  function _applyBtnStyles() {
    ['hadm-btn-30','hadm-btn-90','hadm-btn-mes','hadm-btn-ano','hadm-btn-hist'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute('style', id === _activePeriodBtn ? S.active : S.normal);
    });
    ['hadm-btn-porto','hadm-btn-funchal'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute('style', id === _activeZoneBtn ? S.active : S.normal);
    });
    ['hadm-tab-analise','hadm-tab-estacional','hadm-tab-carregar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var tab = id.replace('hadm-tab-', '');
      el.setAttribute('style', tab === _activeTab ? S.tabAct : S.tab);
    });
  }

  // ── Abrir módulo ──
  window.openHistoricoAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var panel     = document.getElementById('adm-historico-panel');
    var content   = document.getElementById('hadm-content');

    if (adminApp) {
      adminApp.style.setProperty('display',        'flex',   'important');
      adminApp.style.setProperty('flex-direction', 'column', 'important');
      adminApp.style.setProperty('overflow',       'hidden', 'important');
      adminApp.style.setProperty('height',         '100vh',  'important');
      adminApp.style.setProperty('padding',        '0',      'important');
    }
    if (panel) {
      panel.style.setProperty('display',        'flex',   'important');
      panel.style.setProperty('flex',           '1',      'important');
      panel.style.setProperty('flex-direction', 'column', 'important');
      panel.style.setProperty('overflow-y',     'auto',   'important');
      panel.style.setProperty('overflow-x',     'hidden', 'important');
      panel.style.setProperty('width',          '100%',   'important');
      panel.style.setProperty('height',         '0',      'important');
      panel.style.removeProperty('min-height');
    }
    if (content) {
      content.style.setProperty('overflow', 'visible', 'important');
      content.style.setProperty('height',   'auto',    'important');
      content.style.setProperty('flex',     'none',    'important');
    }

    _activeTab       = 'analise';
    _activePeriodBtn = 'hadm-btn-90';
    _activeZoneBtn   = null;
    _applyBtnStyles();

    var p = _period90();
    var fEl = document.getElementById('hadm-from');
    var tEl = document.getElementById('hadm-to');
    if (fEl) fEl.value = p.from;
    if (tEl) tEl.value = p.to;

    _hadmLoadData();
  };

  window.closeHistoricoAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var panel     = document.getElementById('adm-historico-panel');
    var content   = document.getElementById('hadm-content');

    if (panel) {
      panel.style.display = 'none';
      ['flex','flex-direction','overflow-y','overflow-x','width','height','min-height'].forEach(function (p) {
        panel.style.removeProperty(p);
      });
    }
    if (content) {
      ['overflow','height','flex'].forEach(function (p) { content.style.removeProperty(p); });
    }
    if (moduleBar) {
      moduleBar.style.display = 'none';
      ['flex-shrink','width','position','top','z-index'].forEach(function (p) {
        moduleBar.style.removeProperty(p);
      });
    }
    if (dashboard) dashboard.style.display = '';
    if (adminApp) {
      adminApp.classList.remove('module-open');
      ['display','flex-direction','overflow','height','padding'].forEach(function (p) {
        adminApp.style.removeProperty(p);
      });
    }
  };

  // ── Cargar datos según tab activo ──
  function _hadmLoadData() {
    if (_activeTab === 'analise')    _renderAnalise();
    if (_activeTab === 'estacional') _renderEstacional();
    if (_activeTab === 'carregar')   _renderCarregar();
  }

  // ── Obtener filtros actuales ──
  function _getFilters() {
    var from      = document.getElementById('hadm-from') ? document.getElementById('hadm-from').value : _period90().from;
    var to        = document.getElementById('hadm-to')   ? document.getElementById('hadm-to').value   : _period90().to;
    var lojaEl    = document.getElementById('hadm-loja');
    var loja      = lojaEl ? lojaEl.value : '';
    var zoneFilter = lojaEl && lojaEl.dataset.zoneFilter ? JSON.parse(lojaEl.dataset.zoneFilter) : null;
    return { from: from, to: to, loja: loja, zoneFilter: zoneFilter };
  }

  // ── Contenedor de contenido ──
  function _getContent() { return document.getElementById('hadm-content'); }

  function _setLoading() {
    var c = _getContent();
    if (c) c.innerHTML = '<div style="padding:30px;opacity:.6;font-size:.85rem;color:#fff !important;">a carregar…</div>';
  }

  // ════════════════════════════════════════════════════════════
  //  TAB: ANÁLISE
  // ════════════════════════════════════════════════════════════
  function _renderAnalise() {
    _setLoading();
    var f = _getFilters();

    // Período de comparação: mesma duração, imediatamente anterior
    var fromD   = new Date(f.from + 'T00:00:00');
    var toD     = new Date(f.to   + 'T00:00:00');
    var len     = Math.round((toD - fromD) / 86400000) + 1;
    var cmpToD  = new Date(fromD); cmpToD.setDate(fromD.getDate() - 1);
    var cmpFromD = new Date(cmpToD); cmpFromD.setDate(cmpToD.getDate() - len + 1);
    var cmpFrom = _dateToStr(cmpFromD);
    var cmpTo   = _dateToStr(cmpToD);

    var results = { main: null, prev: null };

    function _tryRender() {
      if (results.main === null || results.prev === null) return;
      _buildAnalise(results.main, results.prev, f);
    }

    // Consulta principal
    var q = sbAdmin.from('ventas_historicas').select('*')
      .gte('data', f.from).lte('data', f.to).order('data', { ascending: false });
    if (f.loja)       q = q.eq('loja', f.loja);
    else if (f.zoneFilter) q = q.in('loja', f.zoneFilter);
    q.then(function (res) {
      results.main = res.error ? [] : (res.data || []);
      _tryRender();
    }).catch(function () { results.main = []; _tryRender(); });

    // Consulta comparativa
    var q2 = sbAdmin.from('ventas_historicas').select('*')
      .gte('data', cmpFrom).lte('data', cmpTo);
    if (f.loja)       q2 = q2.eq('loja', f.loja);
    else if (f.zoneFilter) q2 = q2.in('loja', f.zoneFilter);
    q2.then(function (res) {
      results.prev = res.error ? [] : (res.data || []);
      _tryRender();
    }).catch(function () { results.prev = []; _tryRender(); });
  }

  function _buildAnalise(rows, prevRows, f) {
    var c = _getContent();
    if (!c) return;
    c.innerHTML = '';
    c.style.setProperty('padding', '12px 8px 80px', 'important');

    _injectStyles();

    if (!rows.length) {
      var empty = document.createElement('div');
      empty.setAttribute('style', 'padding:50px 0;text-align:center;opacity:.5;font-size:.85rem;color:#fff !important;');
      empty.textContent = 'Nenhum registo encontrado para este período.';
      c.appendChild(empty);
      return;
    }

    // ── Agrupar por loja ──
    var byLoja = {};
    rows.forEach(function (r) {
      var k = r.loja;
      if (!byLoja[k]) byLoja[k] = [];
      byLoja[k].push(r);
    });
    var lojaOrder = LOJAS.filter(function (l) { return byLoja[l]; });
    Object.keys(byLoja).forEach(function (l) { if (lojaOrder.indexOf(l) < 0) lojaOrder.push(l); });

    var lojaTotals = {};
    lojaOrder.forEach(function (l) {
      lojaTotals[l] = byLoja[l].reduce(function (s, r) { return s + (parseFloat(r.montante) || 0); }, 0);
    });

    var prevByLoja = {};
    prevRows.forEach(function (r) {
      if (!prevByLoja[r.loja]) prevByLoja[r.loja] = [];
      prevByLoja[r.loja].push(r);
    });
    var prevTotals = {};
    Object.keys(prevByLoja).forEach(function (l) {
      prevTotals[l] = prevByLoja[l].reduce(function (s, r) { return s + (parseFloat(r.montante) || 0); }, 0);
    });

    var gt     = rows.reduce(function (s, r) { return s + (parseFloat(r.montante) || 0); }, 0);
    var prevGt = prevRows.reduce(function (s, r) { return s + (parseFloat(r.montante) || 0); }, 0);

    // Ordenar por total desc
    lojaOrder.sort(function (a, b) { return lojaTotals[b] - lojaTotals[a]; });
    var maxTotal = lojaTotals[lojaOrder[0]] || 1;

    // ── Métricas de tendencia (últimos 30 vs 30 anteriores dentro del período) ──
    var today = new Date();
    var d30f  = new Date(today); d30f.setDate(today.getDate() - 29);
    var d60f  = new Date(today); d60f.setDate(today.getDate() - 59);
    var d30s  = _dateToStr(d30f);
    var d60s  = _dateToStr(d60f);

    function _avg30(lojaRows) {
      var last30 = lojaRows.filter(function (r) { return r.data >= d30s; });
      var prev30 = lojaRows.filter(function (r) { return r.data >= d60s && r.data < d30s; });
      if (!last30.length || !prev30.length) return null;
      var a1 = last30.reduce(function (s, r) { return s + (parseFloat(r.montante)||0); }, 0) / last30.length;
      var a2 = prev30.reduce(function (s, r) { return s + (parseFloat(r.montante)||0); }, 0) / prev30.length;
      return { pct: (a1 - a2) / a2 * 100, avg: a1 };
    }

    // ── Anomalías ──
    function _detectAnomalies(lojaRows) {
      if (lojaRows.length < 10) return [];
      var vals = lojaRows.map(function (r) { return parseFloat(r.montante) || 0; });
      vals.sort(function (a, b) { return a - b; });
      var median = vals[Math.floor(vals.length / 2)];
      var mad = vals.map(function (v) { return Math.abs(v - median); });
      mad.sort(function (a, b) { return a - b; });
      var madVal = mad[Math.floor(mad.length / 2)] || 1;
      var anomalies = [];
      lojaRows.forEach(function (r) {
        var v = parseFloat(r.montante) || 0;
        var z = Math.abs(v - median) / madVal;
        if (z > 3.5) {
          anomalies.push({ data: r.data, montante: v, z: z, alto: v > median });
        }
      });
      return anomalies.slice(0, 3);
    }

    // ═══ TOTAL GERAL ═══
    var grand = _el('div', 'border-radius:12px;padding:14px 18px;margin-bottom:18px;', '#111111');
    var grandLbl = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:8px;', null);
    grandLbl.style.setProperty('color', '#ffffff', 'important');
    grandLbl.textContent = 'TOTAL GERAL — ' + _fmtDate(f.from) + ' a ' + _fmtDate(f.to);
    grand.appendChild(grandLbl);

    var grandRow = _el('div', 'display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;', null);
    var grandVal = _el('div', 'font-size:1.8rem;font-weight:900;letter-spacing:-.02em;', null);
    grandVal.style.setProperty('color', '#ffffff', 'important');
    grandVal.textContent = _fmtEur(gt);
    grandRow.appendChild(grandVal);

    if (prevGt > 0) {
      var pct = (gt - prevGt) / prevGt * 100;
      var badge = _el('span', 'font-size:.82rem;font-weight:800;', null);
      badge.style.setProperty('color', pct >= 0 ? '#4caf82' : '#e05a5a', 'important');
      badge.textContent = (pct >= 0 ? '↑ +' : '↓ ') + pct.toFixed(1) + '% vs período anterior';
      grandRow.appendChild(badge);
    }
    grand.appendChild(grandRow);

    // Promedio diario
    var fromD2 = new Date(f.from + 'T00:00:00');
    var toD2   = new Date(f.to   + 'T00:00:00');
    var dias   = Math.round((toD2 - fromD2) / 86400000) + 1;
    var avgDia = _el('div', 'font-size:.75rem;margin-top:4px;', null);
    avgDia.style.setProperty('color', '#aaaaaa', 'important');
    avgDia.textContent = 'Média diária: ' + _fmtEur(gt / dias) + ' · ' + rows.length + ' registos · ' + dias + ' dias';
    grand.appendChild(avgDia);

    c.appendChild(grand);

    // ═══ RANKING + BARRA ═══
    var rankTitle = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;', null);
    rankTitle.style.setProperty('color', '#888888', 'important');
    rankTitle.textContent = 'RANKING DE LOJAS';
    c.appendChild(rankTitle);

    lojaOrder.forEach(function (loja, idx) {
      var total   = lojaTotals[loja];
      var prevT   = prevTotals[loja] || 0;
      var barPct  = total / maxTotal * 100;
      var label   = LOJA_LABELS[loja] || loja;
      var trend   = _avg30(byLoja[loja]);

      var row = _el('div', 'margin-bottom:14px;', null);

      // Nombre + badge tendencia
      var nameRow = _el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:5px;', null);
      var medal = ['🥇','🥈','🥉'][idx] || '';
      var nameSpan = _el('span', 'font-size:.88rem;font-weight:800;', null);
      nameSpan.style.setProperty('color', '#ffffff', 'important');
      nameSpan.textContent = (medal ? medal + ' ' : (idx+1) + '. ') + label;
      nameRow.appendChild(nameSpan);

      // Badge variação vs período anterior
      if (prevT > 0) {
        var vPct  = (total - prevT) / prevT * 100;
        var vBadge = _el('span', 'font-size:.68rem;font-weight:800;padding:2px 8px;border-radius:10px;', null);
        vBadge.style.setProperty('background', vPct >= 0 ? 'rgba(74,175,130,.18)' : 'rgba(224,90,90,.18)', 'important');
        vBadge.style.setProperty('color', vPct >= 0 ? '#4caf82' : '#e05a5a', 'important');
        vBadge.textContent = (vPct >= 0 ? '↑ +' : '↓ ') + vPct.toFixed(1) + '%';
        nameRow.appendChild(vBadge);
      }

      // Badge tendência 30d
      if (trend) {
        var tIcon = trend.pct > 3 ? '▲ acelerando' : trend.pct < -3 ? '▼ desacelerando' : '→ estável';
        var tBadge = _el('span', 'font-size:.65rem;font-weight:700;padding:2px 8px;border-radius:10px;', null);
        tBadge.style.setProperty('background', trend.pct > 3 ? 'rgba(74,175,130,.12)' : trend.pct < -3 ? 'rgba(224,90,90,.12)' : 'rgba(180,180,180,.12)', 'important');
        tBadge.style.setProperty('color', trend.pct > 3 ? '#4caf82' : trend.pct < -3 ? '#e05a5a' : '#aaaaaa', 'important');
        tBadge.textContent = tIcon;
        nameRow.appendChild(tBadge);
      }

      row.appendChild(nameRow);

      // Barra
      var barWrap = _el('div', 'border-radius:6px;overflow:hidden;margin-bottom:4px;', null);
      barWrap.style.setProperty('background', '#2a2a2a', 'important');
      barWrap.style.height = '8px';
      var barFill = _el('div', 'height:100%;border-radius:6px;transition:width .6s ease;', null);
      barFill.style.setProperty('width', barPct.toFixed(1) + '%', 'important');
      barFill.style.setProperty('background', 'linear-gradient(90deg,#3a6a4a,#4caf82)', 'important');
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);

      // Total
      var totalRow = _el('div', 'display:flex;justify-content:space-between;', null);
      var totalSpan = _el('span', 'font-size:.82rem;font-weight:800;', null);
      totalSpan.style.setProperty('color', '#ffffff', 'important');
      totalSpan.textContent = _fmtEur(total);
      var avgSpan = _el('span', 'font-size:.72rem;', null);
      avgSpan.style.setProperty('color', '#888888', 'important');
      var nDias = byLoja[loja].length;
      avgSpan.textContent = 'média ' + _fmtEur(total / nDias) + '/dia';
      totalRow.appendChild(totalSpan);
      totalRow.appendChild(avgSpan);
      row.appendChild(totalRow);

      // Anomalías de esta loja
      var anomalies = _detectAnomalies(byLoja[loja]);
      if (anomalies.length) {
        var aBox = _el('div', 'margin-top:6px;padding:8px 12px;border-radius:8px;border-left:3px solid #c8a832;', null);
        aBox.style.setProperty('background', '#1e1a0a', 'important');
        anomalies.forEach(function (a) {
          var aLine = _el('div', 'font-size:.7rem;', null);
          aLine.style.setProperty('color', '#f0d080', 'important');
          aLine.textContent = (a.alto ? '⚡ Pico' : '⚠ Queda') + ' em ' + _fmtDate(a.data) + ': ' + _fmtEur(a.montante);
          aBox.appendChild(aLine);
        });
        row.appendChild(aBox);
      }

      c.appendChild(row);
    });

    // ═══ SEPARADOR ═══
    var sep = _el('div', 'height:1px;margin:22px 0;', null);
    sep.style.setProperty('background', '#333333', 'important');
    c.appendChild(sep);

    // ═══ INSIGHT AUTOMÁTICO ═══
    _buildInsight(c, rows, prevRows, gt, prevGt, lojaOrder, lojaTotals, f);
  }

  function _buildInsight(c, rows, prevRows, gt, prevGt, lojaOrder, lojaTotals, f) {
    var box = _el('div', 'border-radius:12px;padding:14px 18px;margin-bottom:18px;border-left:4px solid #4a7c59;', null);
    box.style.setProperty('background', '#0d1f13', 'important');

    var title = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;', null);
    title.style.setProperty('color', '#4caf82', 'important');
    title.textContent = '🧠 INTELIGÊNCIA DO NEGÓCIO';
    box.appendChild(title);

    var insights = [];

    // Tendência geral
    if (prevGt > 0) {
      var pct = (gt - prevGt) / prevGt * 100;
      if (pct > 5)       insights.push('✅ Tendência positiva: o período atual supera o anterior em ' + pct.toFixed(1) + '%.');
      else if (pct < -5) insights.push('⚠️ Alerta: as vendas estão ' + Math.abs(pct).toFixed(1) + '% abaixo do período anterior.');
      else               insights.push('→ Desempenho estável em relação ao período anterior (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%).');
    }

    // Mejor y peor loja
    if (lojaOrder.length > 1) {
      var best  = lojaOrder[0];
      var worst = lojaOrder[lojaOrder.length - 1];
      insights.push('🏆 Melhor loja: ' + (LOJA_LABELS[best]||best) + ' (' + _fmtEur(lojaTotals[best]) + ').');
      insights.push('📉 Menor volume: ' + (LOJA_LABELS[worst]||worst) + ' (' + _fmtEur(lojaTotals[worst]) + ').');
    }

    // Concentración
    if (lojaOrder.length > 1) {
      var topShare = lojaTotals[lojaOrder[0]] / gt * 100;
      if (topShare > 40) {
        insights.push('📊 Concentração: a loja líder representa ' + topShare.toFixed(0) + '% do total — dependência elevada.');
      }
    }

    // Días con ventas 0
    var zeroDays = rows.filter(function (r) { return (parseFloat(r.montante)||0) === 0; }).length;
    if (zeroDays > 0) insights.push('⚪ ' + zeroDays + ' dia(s) com vendas zero no período.');

    insights.forEach(function (txt) {
      var line = _el('div', 'font-size:.78rem;line-height:1.55;margin-bottom:4px;', null);
      line.style.setProperty('color', '#d4f0e2', 'important');
      line.textContent = txt;
      box.appendChild(line);
    });

    c.appendChild(box);
  }

  // ════════════════════════════════════════════════════════════
  //  TAB: ESTACIONAL
  // ════════════════════════════════════════════════════════════
  function _renderEstacional() {
    _setLoading();
    var f = _getFilters();

    // Para estacional, pegar sempre o histórico completo
    var q = sbAdmin.from('ventas_historicas').select('*').order('data', { ascending: true });
    if (f.loja)            q = q.eq('loja', f.loja);
    else if (f.zoneFilter) q = q.in('loja', f.zoneFilter);

    q.then(function (res) {
      if (res.error || !res.data || !res.data.length) {
        var c = _getContent();
        if (c) { c.innerHTML = ''; var e = _el('div','padding:30px;opacity:.5;font-size:.85rem;',null); e.style.setProperty('color','#fff','important'); e.textContent='Sem dados.'; c.appendChild(e); }
        return;
      }
      _buildEstacional(res.data);
    }).catch(function () {});
  }

  function _buildEstacional(rows) {
    var c = _getContent();
    if (!c) return;
    c.innerHTML = '';
    c.style.setProperty('padding', '12px 8px 80px', 'important');
    _injectStyles();

    // ── Média por día de semana ──
    var byDow = [0,0,0,0,0,0,0];
    var cntDow = [0,0,0,0,0,0,0];
    rows.forEach(function (r) {
      var dow = new Date(r.data + 'T00:00:00').getDay();
      byDow[dow]  += parseFloat(r.montante) || 0;
      cntDow[dow] += 1;
    });
    var avgDow = byDow.map(function (v, i) { return cntDow[i] ? v / cntDow[i] : 0; });
    var maxDow = Math.max.apply(null, avgDow) || 1;

    var dowTitle = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px;', null);
    dowTitle.style.setProperty('color', '#888888', 'important');
    dowTitle.textContent = 'MÉDIA DE VENDAS POR DIA DA SEMANA';
    c.appendChild(dowTitle);

    var dowBox = _el('div', 'border-radius:12px;padding:14px 18px;margin-bottom:22px;', null);
    dowBox.style.setProperty('background', '#111111', 'important');

    DIAS_SEMANA.forEach(function (dia, i) {
      var v   = avgDow[i];
      var pct = v / maxDow * 100;
      var row = _el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:10px;', null);
      var dLabel = _el('span', 'font-size:.75rem;font-weight:700;width:28px;flex-shrink:0;', null);
      dLabel.style.setProperty('color', '#cccccc', 'important');
      dLabel.textContent = dia;
      row.appendChild(dLabel);

      var barWrap = _el('div', 'flex:1;border-radius:5px;overflow:hidden;', null);
      barWrap.style.setProperty('background', '#2a2a2a', 'important');
      barWrap.style.height = '14px';
      var barFill = _el('div', 'height:100%;border-radius:5px;', null);
      barFill.style.setProperty('width', pct.toFixed(1) + '%', 'important');
      var isWeekend = (i === 0 || i === 6);
      barFill.style.setProperty('background', isWeekend ? 'linear-gradient(90deg,#4a3a7c,#8a6ccc)' : 'linear-gradient(90deg,#3a6a4a,#4caf82)', 'important');
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);

      var vLabel = _el('span', 'font-size:.75rem;font-weight:800;width:80px;text-align:right;flex-shrink:0;', null);
      vLabel.style.setProperty('color', '#ffffff', 'important');
      vLabel.textContent = _fmtEur(v);
      row.appendChild(vLabel);
      dowBox.appendChild(row);
    });
    c.appendChild(dowBox);

    // ── Média por mês ──
    var byMonth = new Array(12).fill(0);
    var cntMonth = new Array(12).fill(0);
    rows.forEach(function (r) {
      var m = new Date(r.data + 'T00:00:00').getMonth();
      byMonth[m]  += parseFloat(r.montante) || 0;
      cntMonth[m] += 1;
    });
    var avgMonth = byMonth.map(function (v, i) { return cntMonth[i] ? v / cntMonth[i] : 0; });
    var maxMonth = Math.max.apply(null, avgMonth) || 1;

    var mTitle = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px;', null);
    mTitle.style.setProperty('color', '#888888', 'important');
    mTitle.textContent = 'MÉDIA DIÁRIA POR MÊS (histórico completo)';
    c.appendChild(mTitle);

    var mBox = _el('div', 'border-radius:12px;padding:14px 18px;margin-bottom:22px;', null);
    mBox.style.setProperty('background', '#111111', 'important');

    // Determinar melhor e pior mês
    var sortedMonths = avgMonth.map(function (v, i) { return { v: v, i: i }; }).filter(function (x) { return x.v > 0; });
    sortedMonths.sort(function (a, b) { return b.v - a.v; });
    var bestMIdx  = sortedMonths.length ? sortedMonths[0].i : -1;
    var worstMIdx = sortedMonths.length ? sortedMonths[sortedMonths.length - 1].i : -1;

    MESES.forEach(function (mes, i) {
      var v   = avgMonth[i];
      var pct = v / maxMonth * 100;
      var row = _el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:8px;', null);

      var mLabel = _el('span', 'font-size:.75rem;font-weight:700;width:28px;flex-shrink:0;', null);
      mLabel.style.setProperty('color', i === bestMIdx ? '#4caf82' : i === worstMIdx ? '#e05a5a' : '#cccccc', 'important');
      mLabel.textContent = mes;
      row.appendChild(mLabel);

      var barWrap = _el('div', 'flex:1;border-radius:5px;overflow:hidden;', null);
      barWrap.style.setProperty('background', '#2a2a2a', 'important');
      barWrap.style.height = '12px';
      var barFill = _el('div', 'height:100%;border-radius:5px;', null);
      barFill.style.setProperty('width', pct.toFixed(1) + '%', 'important');
      barFill.style.setProperty('background', i === bestMIdx ? 'linear-gradient(90deg,#2a6a3a,#4caf82)' : i === worstMIdx ? 'linear-gradient(90deg,#6a2a2a,#e05a5a)' : 'linear-gradient(90deg,#3a5a6a,#5a9abf)', 'important');
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);

      var vLabel = _el('span', 'font-size:.72rem;font-weight:800;width:80px;text-align:right;flex-shrink:0;', null);
      vLabel.style.setProperty('color', '#ffffff', 'important');
      vLabel.textContent = v > 0 ? _fmtEur(v) : '—';
      row.appendChild(vLabel);

      if (i === bestMIdx)  { var tag = _el('span','font-size:.6rem;padding:1px 6px;border-radius:8px;flex-shrink:0;',null); tag.style.setProperty('background','rgba(74,175,130,.2)','important'); tag.style.setProperty('color','#4caf82','important'); tag.textContent='melhor'; row.appendChild(tag); }
      if (i === worstMIdx) { var tag2 = _el('span','font-size:.6rem;padding:1px 6px;border-radius:8px;flex-shrink:0;',null); tag2.style.setProperty('background','rgba(224,90,90,.2)','important'); tag2.style.setProperty('color','#e05a5a','important'); tag2.textContent='pior'; row.appendChild(tag2); }

      mBox.appendChild(row);
    });
    c.appendChild(mBox);

    // ── Evolução anual ──
    var byYear = {};
    rows.forEach(function (r) {
      var yr = new Date(r.data + 'T00:00:00').getFullYear();
      if (!byYear[yr]) byYear[yr] = 0;
      byYear[yr] += parseFloat(r.montante) || 0;
    });
    var years = Object.keys(byYear).sort();
    if (years.length > 1) {
      var yTitle = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px;', null);
      yTitle.style.setProperty('color', '#888888', 'important');
      yTitle.textContent = 'EVOLUÇÃO ANUAL TOTAL';
      c.appendChild(yTitle);

      var yBox = _el('div', 'border-radius:12px;padding:14px 18px;margin-bottom:22px;', null);
      yBox.style.setProperty('background', '#111111', 'important');

      var maxYear = Math.max.apply(null, years.map(function (y) { return byYear[y]; })) || 1;
      var prevYearVal = null;

      years.forEach(function (yr) {
        var v   = byYear[yr];
        var pct = v / maxYear * 100;
        var row = _el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:10px;', null);

        var yLabel = _el('span', 'font-size:.75rem;font-weight:700;width:36px;flex-shrink:0;', null);
        yLabel.style.setProperty('color', '#cccccc', 'important');
        yLabel.textContent = yr;
        row.appendChild(yLabel);

        var barWrap = _el('div', 'flex:1;border-radius:5px;overflow:hidden;', null);
        barWrap.style.setProperty('background', '#2a2a2a', 'important');
        barWrap.style.height = '14px';
        var barFill = _el('div', 'height:100%;border-radius:5px;', null);
        barFill.style.setProperty('width', pct.toFixed(1) + '%', 'important');
        barFill.style.setProperty('background', 'linear-gradient(90deg,#2a4a6a,#4a8abf)', 'important');
        barWrap.appendChild(barFill);
        row.appendChild(barWrap);

        var vLabel = _el('span', 'font-size:.75rem;font-weight:800;width:90px;text-align:right;flex-shrink:0;', null);
        vLabel.style.setProperty('color', '#ffffff', 'important');
        vLabel.textContent = _fmtEur(v);
        row.appendChild(vLabel);

        if (prevYearVal !== null) {
          var ypct = (v - prevYearVal) / prevYearVal * 100;
          var yBadge = _el('span', 'font-size:.65rem;font-weight:700;width:50px;flex-shrink:0;text-align:right;', null);
          yBadge.style.setProperty('color', ypct >= 0 ? '#4caf82' : '#e05a5a', 'important');
          yBadge.textContent = (ypct >= 0 ? '+' : '') + ypct.toFixed(1) + '%';
          row.appendChild(yBadge);
        }
        prevYearVal = v;
        yBox.appendChild(row);
      });
      c.appendChild(yBox);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  TAB: CARREGAR DADOS
  // ════════════════════════════════════════════════════════════
  function _renderCarregar() {
    var c = _getContent();
    if (!c) return;
    c.innerHTML = '';
    c.style.setProperty('padding', '16px 12px 80px', 'important');
    _injectStyles();

    // ── Título ──
    var title = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:16px;', null);
    title.style.setProperty('color', '#888888', 'important');
    title.textContent = 'REGISTAR VENDA HISTÓRICA';
    c.appendChild(title);

    // ── Formulário ──
    var form = _el('div', 'border-radius:12px;padding:18px;margin-bottom:22px;', null);
    form.style.setProperty('background', '#111111', 'important');

    function _fRow(labelTxt, inputEl) {
      var row = _el('div', 'margin-bottom:14px;', null);
      var lbl = _el('label', 'display:block;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;', null);
      lbl.style.setProperty('color', '#888888', 'important');
      lbl.textContent = labelTxt;
      row.appendChild(lbl);
      row.appendChild(inputEl);
      return row;
    }

    var inputStyle = 'width:100%;box-sizing:border-box;padding:10px 14px;font-size:.88rem;font-weight:600;font-family:MontserratLight,sans-serif;border:1.5px solid #444;border-radius:9px;outline:none;';

    // Data
    var inpData = _el('input', inputStyle, '#1e1e1e');
    inpData.type = 'date';
    inpData.id   = 'hadm-inp-data';
    inpData.value = _todayStr();
    inpData.style.setProperty('color', '#ffffff', 'important');
    form.appendChild(_fRow('Data', inpData));

    // Loja
    var inpLoja = document.createElement('select');
    inpLoja.id = 'hadm-inp-loja';
    inpLoja.setAttribute('style', inputStyle);
    inpLoja.style.setProperty('background', '#1e1e1e', 'important');
    inpLoja.style.setProperty('color', '#ffffff', 'important');
    var optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = 'Selecionar loja…';
    inpLoja.appendChild(optPlaceholder);
    LOJAS.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l;
      opt.textContent = LOJA_LABELS[l] || l;
      inpLoja.appendChild(opt);
    });
    form.appendChild(_fRow('Loja', inpLoja));

    // Montante
    var inpMont = _el('input', inputStyle, '#1e1e1e');
    inpMont.type        = 'number';
    inpMont.id          = 'hadm-inp-montante';
    inpMont.placeholder = '0.00';
    inpMont.step        = '0.01';
    inpMont.min         = '0';
    inpMont.style.setProperty('color', '#ffffff', 'important');
    form.appendChild(_fRow('Montante (€)', inpMont));

    // Feedback
    var feedback = _el('div', 'font-size:.78rem;font-weight:700;min-height:20px;margin-bottom:12px;', null);
    feedback.id = 'hadm-feedback';
    form.appendChild(feedback);

    // Botón guardar
    var btnGuardar = _el('div', 'display:inline-block;padding:12px 28px;border-radius:10px;font-size:.88rem;font-weight:800;cursor:pointer;text-align:center;font-family:MontserratLight,sans-serif;transition:opacity .2s;', null);
    btnGuardar.style.setProperty('background', '#4a7c59', 'important');
    btnGuardar.style.setProperty('color', '#ffffff', 'important');
    btnGuardar.textContent = 'Guardar em Supabase';

    btnGuardar.addEventListener('click', function () {
      var data     = document.getElementById('hadm-inp-data')     ? document.getElementById('hadm-inp-data').value     : '';
      var loja     = document.getElementById('hadm-inp-loja')     ? document.getElementById('hadm-inp-loja').value     : '';
      var montante = document.getElementById('hadm-inp-montante') ? document.getElementById('hadm-inp-montante').value : '';
      var fb       = document.getElementById('hadm-feedback');

      if (!data || !loja || montante === '') {
        if (fb) { fb.textContent = '⚠ Preencha todos os campos.'; fb.style.setProperty('color', '#e05a5a', 'important'); }
        return;
      }
      if (parseFloat(montante) < 0) {
        if (fb) { fb.textContent = '⚠ O montante não pode ser negativo.'; fb.style.setProperty('color', '#e05a5a', 'important'); }
        return;
      }

      btnGuardar.style.opacity = '.5';
      btnGuardar.style.pointerEvents = 'none';
      if (fb) { fb.textContent = 'A guardar…'; fb.style.setProperty('color', '#aaaaaa', 'important'); }

      sbAdmin.from('ventas_historicas')
        .upsert({ loja: loja, data: data, montante: parseFloat(montante) }, { onConflict: 'loja,data' })
        .then(function (res) {
          btnGuardar.style.opacity = '1';
          btnGuardar.style.pointerEvents = '';
          if (res.error) {
            if (fb) { fb.textContent = '✗ Erro: ' + res.error.message; fb.style.setProperty('color', '#e05a5a', 'important'); }
          } else {
            if (fb) { fb.textContent = '✓ Guardado com sucesso! (' + (LOJA_LABELS[loja]||loja) + ' — ' + _fmtDate(data) + ' — ' + _fmtEur(parseFloat(montante)) + ')'; fb.style.setProperty('color', '#4caf82', 'important'); }
            // Reset form
            if (document.getElementById('hadm-inp-data'))     document.getElementById('hadm-inp-data').value     = _todayStr();
            if (document.getElementById('hadm-inp-loja'))     document.getElementById('hadm-inp-loja').value     = '';
            if (document.getElementById('hadm-inp-montante')) document.getElementById('hadm-inp-montante').value = '';
            // Actualizar tabla de recientes
            _loadRecentes();
          }
        }).catch(function (e) {
          btnGuardar.style.opacity = '1';
          btnGuardar.style.pointerEvents = '';
          if (fb) { fb.textContent = '✗ Erro de ligação.'; fb.style.setProperty('color', '#e05a5a', 'important'); }
        });
    });

    form.appendChild(btnGuardar);
    c.appendChild(form);

    // ── Registos recentes ──
    var recTitle = _el('div', 'font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px;', null);
    recTitle.style.setProperty('color', '#888888', 'important');
    recTitle.textContent = 'ÚLTIMOS REGISTOS INSERIDOS';
    c.appendChild(recTitle);

    var recBox = _el('div', '', null);
    recBox.id = 'hadm-recentes';
    c.appendChild(recBox);

    _loadRecentes();
  }

  function _loadRecentes() {
    var box = document.getElementById('hadm-recentes');
    if (!box) return;
    box.innerHTML = '<div style="opacity:.5;font-size:.8rem;padding:8px 0;color:#fff !important;">a carregar…</div>';

    sbAdmin.from('ventas_historicas')
      .select('*').order('created_at', { ascending: false }).limit(15)
      .then(function (res) {
        box.innerHTML = '';
        if (res.error || !res.data || !res.data.length) {
          var e = _el('div', 'opacity:.5;font-size:.8rem;padding:8px 0;', null);
          e.style.setProperty('color', '#ffffff', 'important');
          e.textContent = 'Sem registos recentes.';
          box.appendChild(e);
          return;
        }
        var tWrap = _el('div', 'overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px;', null);
        var table = document.createElement('table');
        table.setAttribute('style', 'width:100%;border-collapse:collapse;font-size:.78rem;');

        // Thead
        var thead = document.createElement('thead');
        var htr   = document.createElement('tr');
        ['Data','Loja','Montante'].forEach(function (h) {
          var th = document.createElement('th');
          th.textContent = h;
          th.setAttribute('style', 'padding:7px 12px;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1.5px solid #333;');
          th.style.setProperty('color', '#888888', 'important');
          th.style.setProperty('background', '#111111', 'important');
          htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);

        // Tbody
        var tbody = document.createElement('tbody');
        res.data.forEach(function (r, i) {
          var tr = document.createElement('tr');
          var bg = i % 2 === 0 ? '#161616' : '#111111';
          [_fmtDate(r.data), LOJA_LABELS[r.loja] || r.loja, _fmtEur(r.montante)].forEach(function (v, ci) {
            var td = document.createElement('td');
            td.textContent = v;
            td.setAttribute('style', 'padding:7px 12px;border-bottom:1px solid #222;white-space:nowrap;' + (ci === 2 ? 'font-weight:800;text-align:right;' : ''));
            td.style.setProperty('background', bg, 'important');
            td.style.setProperty('color', '#ffffff', 'important');
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tWrap.appendChild(table);
        box.appendChild(tWrap);
      }).catch(function () {});
  }

  // ════════════════════════════════════════════════════════════
  //  HELPERS DOM
  // ════════════════════════════════════════════════════════════
  function _el(tag, cssText, bgColor) {
    var el = document.createElement(tag);
    if (cssText) el.setAttribute('style', cssText);
    if (bgColor) el.style.setProperty('background', bgColor, 'important');
    return el;
  }

  function _injectStyles() {
    if (document.getElementById('hadm-styles')) return;
    var s = document.createElement('style');
    s.id = 'hadm-styles';
    s.textContent =
      '#adm-historico-panel input[type="number"]::-webkit-outer-spin-button,' +
      '#adm-historico-panel input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }' +
      '#adm-historico-panel input[type="number"] { -moz-appearance:textfield; }' +
      '#adm-historico-panel select option { background:#1e1e1e !important; color:#ffffff !important; }';
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════════
  setTimeout(function () {

    // Tabs
    ['analise','estacional','carregar'].forEach(function (tab) {
      var btn = document.getElementById('hadm-tab-' + tab);
      if (!btn) return;
      btn.addEventListener('click', function () {
        _activeTab = tab;
        _applyBtnStyles();
        _hadmLoadData();
      });
    });

    // Botones período
    var periods = {
      'hadm-btn-30':   _period30,
      'hadm-btn-90':   _period90,
      'hadm-btn-mes':  _periodMesAtual,
      'hadm-btn-ano':  _periodAnoAtual,
      'hadm-btn-hist': _periodHistorico
    };
    Object.keys(periods).forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', function () { _applyPeriod(periods[id](), id); });
    });

    // Filtros zona
    function _applyZone(lojas, btnId) {
      var lojaEl = document.getElementById('hadm-loja');
      if (!lojaEl) return;
      lojaEl.value = '';
      lojaEl.dataset.zoneFilter = JSON.stringify(lojas);
      _activeZoneBtn   = btnId;
      _activePeriodBtn = null;
      _applyBtnStyles();
      _hadmLoadData();
    }

    var btnPorto   = document.getElementById('hadm-btn-porto');
    var btnFunchal = document.getElementById('hadm-btn-funchal');
    if (btnPorto)   btnPorto.addEventListener('click',   function () { _applyZone(PORTO_SANTO, 'hadm-btn-porto');   });
    if (btnFunchal) btnFunchal.addEventListener('click', function () { _applyZone(FUNCHAL,     'hadm-btn-funchal'); });

    // Buscar manual
    var buscarBtn = document.getElementById('hadm-buscar-btn');
    if (buscarBtn) {
      buscarBtn.addEventListener('click', function () {
        var lojaEl = document.getElementById('hadm-loja');
        if (lojaEl) delete lojaEl.dataset.zoneFilter;
        _activePeriodBtn = null; _activeZoneBtn = null;
        _applyBtnStyles();
        _hadmLoadData();
      });
    }

    // Reset zone al cambiar fechas o loja manualmente
    ['hadm-from','hadm-to','hadm-loja'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          var lojaEl = document.getElementById('hadm-loja');
          if (lojaEl) delete lojaEl.dataset.zoneFilter;
          _activePeriodBtn = null; _activeZoneBtn = null;
          _applyBtnStyles();
        });
      }
    });

    _applyBtnStyles();
  }, 0);

  window._hadmLoadData = _hadmLoadData;

})();
