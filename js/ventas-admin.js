// ══════════════════════════════════════════════════════════════
//  VENTAS DIARIAS — VISTA ADMINISTRADOR
// ══════════════════════════════════════════════════════════════
(function () {

  var TIENDAS = [
    'mezka funchal',
    'parfois madeira shopping',
    'parfois arcadas são francisco',
    'Shana',
    'Mezka Avenida',
    'Mezka Mercado',
    'Maxx'
  ];

  var TIENDA_LABELS = {
    'mezka funchal':                 'Mezka Funchal',
    'parfois madeira shopping':      'Madeira Shopping',
    'parfois arcadas são francisco': 'Parfois Arcadas',
    'Shana':                         'Shana',
    'Mezka Avenida':                 'Mezka Avenida',
    'Mezka Mercado':                 'Mezka Mercado',
    'Maxx':                          'Maxx'
  };

  var PORTO_SANTO_TIENDAS = ['Shana', 'Mezka Avenida', 'Mezka Mercado', 'Maxx'];
  var FUNCHAL_TIENDAS     = ['mezka funchal', 'parfois madeira shopping', 'parfois arcadas são francisco'];

  // ── Estilos inline para botones ──
  var S = {
    btnNormal: 'background:#3d3d3d !important;color:#f0f0f0 !important;border:1.5px solid #666 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;',
    btnActive: 'background:#4a7c59 !important;color:#ffffff !important;border:1.5px solid #4a7c59 !important;border-radius:20px !important;padding:7px 18px !important;font-size:.82rem !important;font-weight:bold !important;cursor:pointer !important;white-space:nowrap !important;'
  };

  var _activePeriodBtn = null;
  var _activeZoneBtn   = null;

  function _applyBtnStyles(activePeriodId, activeZoneId) {
    // Si se llama con un solo argumento (compatibilidad previa), interpretar según grupo
    if (activeZoneId === undefined) {
      // Detectar a qué grupo pertenece el id
      var zoneIds = ['vadm-btn-porto', 'vadm-btn-funchal', 'vadm-btn-domingos'];
      if (activePeriodId === null || zoneIds.indexOf(activePeriodId) === -1) {
        _activePeriodBtn = activePeriodId;
      } else {
        _activeZoneBtn = activePeriodId;
      }
    } else {
      _activePeriodBtn = activePeriodId;
      _activeZoneBtn   = activeZoneId;
    }
    ['vadm-btn-hoy', 'vadm-btn-semana', 'vadm-btn-mes'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('style', id === _activePeriodBtn ? S.btnActive : S.btnNormal);
    });
    ['vadm-btn-porto', 'vadm-btn-funchal', 'vadm-btn-domingos'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('style', id === _activeZoneBtn ? S.btnActive : S.btnNormal);
    });
  }

  // ── Abrir módulo ──
  window.openVentasAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var barTitle  = document.getElementById('adm-module-bar-title');
    var panel     = document.getElementById('adm-ventas-panel');
    var content   = document.getElementById('adm-ventas-content');

    if (dashboard) dashboard.style.display = 'none';
    if (barTitle)  barTitle.textContent = 'ventas declaradas';
    if (adminApp)  adminApp.classList.add('module-open');

    if (adminApp) {
      adminApp.style.setProperty('display',        'flex',   'important');
      adminApp.style.setProperty('flex-direction', 'column', 'important');
      adminApp.style.setProperty('overflow',       'hidden', 'important');
      adminApp.style.setProperty('height',         '100vh',  'important');
      adminApp.style.setProperty('padding',        '0',      'important');
    }
    if (moduleBar) {
      moduleBar.style.setProperty('display',     'flex', 'important');
      moduleBar.style.setProperty('flex-shrink', '0',    'important');
      moduleBar.style.setProperty('width',       '100%', 'important');
      moduleBar.style.removeProperty('position');
      moduleBar.style.removeProperty('top');
      moduleBar.style.removeProperty('z-index');
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
      _applyBtnStyles('vadm-btn-hoy');
      _vAdmLoadData();
    }
    if (content) {
      content.style.setProperty('overflow', 'visible', 'important');
      content.style.setProperty('height',   'auto',    'important');
      content.style.setProperty('flex',     'none',    'important');
    }
  };

  window.closeVentasAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var panel     = document.getElementById('adm-ventas-panel');
    var content   = document.getElementById('adm-ventas-content');

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

  // ── Cargar datos — consulta principal + comparativa en paralelo ──
  function _vAdmLoadData() {
    var _adminApp  = document.getElementById('admin-app');
    var _panel     = document.getElementById('adm-ventas-panel');
    var _moduleBar = document.getElementById('adm-module-bar');
    if (_adminApp) {
      _adminApp.style.setProperty('overflow',   'hidden', 'important');
      _adminApp.style.setProperty('overflow-y', 'hidden', 'important');
    }
    if (_panel) {
      _panel.style.setProperty('display',        'flex',   'important');
      _panel.style.setProperty('flex-direction', 'column', 'important');
      _panel.style.setProperty('flex',           '1',      'important');
      _panel.style.setProperty('min-height',     '0',      'important');
      _panel.style.setProperty('overflow-y',     'auto',   'important');
      _panel.style.setProperty('overflow-x',     'hidden', 'important');
      _panel.style.setProperty('width',          '100%',   'important');
      _panel.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
    }
    if (_moduleBar) {
      _moduleBar.style.setProperty('flex-shrink', '0', 'important');
    }

    var container = document.getElementById('adm-ventas-content');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;opacity:.6;font-size:.85rem;">a carregar…</div>';

    var fromDate    = document.getElementById('vadm-from').value   || _todayStr();
    var toDate      = document.getElementById('vadm-to').value     || _todayStr();
    var tiendaEl    = document.getElementById('vadm-tienda');
    var filterStore = tiendaEl ? (tiendaEl.value || '') : '';
    var zoneFilter  = (tiendaEl && tiendaEl.dataset.zoneFilter)  ? JSON.parse(tiendaEl.dataset.zoneFilter) : null;
    var sundayFilter = (tiendaEl && tiendaEl.dataset.sundayFilter === 'true');

    // Consulta principal
    var q = sbAdmin.from('ventas_diarias').select('*')
      .gte('fecha', fromDate).lte('fecha', toDate)
      .order('fecha', { ascending: false });
    if (filterStore) {
      q = q.eq('tienda', filterStore);
    } else if (zoneFilter) {
      q = q.in('tienda', zoneFilter);
    }
    q.then(function (res) {
      if (res.error) {
        container.innerHTML = '<div style="padding:20px;color:#c03000;font-size:.85rem;">⚠ Erro: ' + res.error.message + '</div>';
        return;
      }
      var mainData = res.data || [];
      if (sundayFilter) {
        mainData = mainData.filter(function (r) { return new Date(r.fecha + 'T00:00:00').getDay() === 0; });
      }
      _render(mainData, container, {
        from: fromDate, to: toDate,
        filterStore: filterStore,
        zoneFilter: zoneFilter
      });
    }).catch(function () {
      container.innerHTML = '<div style="padding:20px;color:#c03000;font-size:.85rem;">⚠ Erro de ligação</div>';
    });
  }

  // ── Render ──
  function _render(rows, container, meta) {
    container.innerHTML = '';
    container.style.setProperty('overflow',   'visible',       'important');
    container.style.setProperty('height',     'auto',          'important');
    container.style.setProperty('flex',       'none',          'important');
    container.style.setProperty('padding',    '12px 8px 80px', 'important');
    container.style.setProperty('max-width',  'none',          'important');
    container.style.setProperty('width',      '100%',          'important');
    container.style.setProperty('box-sizing', 'border-box',    'important');

    // CSS global para tooltip — inyectar una sola vez
    if (!document.getElementById('vadm-tooltip-style')) {
      var styleEl = document.createElement('style');
      styleEl.id  = 'vadm-tooltip-style';
      styleEl.textContent =
        '#vadm-tip-global {' +
        '  position:fixed !important; z-index:99999 !important;' +
        '  background:#1a1a1a !important; color:#f0f0f0 !important;' +
        '  padding:8px 12px !important; border-radius:8px !important;' +
        '  font-size:.75rem !important; line-height:1.5 !important;' +
        '  white-space:pre-wrap !important; max-width:260px !important;' +
        '  box-shadow:0 4px 14px rgba(0,0,0,.55) !important;' +
        '  pointer-events:none !important; display:none;' +
        '}' +
        '.vadm-emp-cell { color:#ffffff !important; }' +
        '.vadm-table-wrap {' +
        '  overflow-x:auto !important;' +
        '  -webkit-overflow-scrolling:touch !important;' +
        '  position:relative;' +
        '}' +
        '.vadm-table-wrap::after {' +
        '  content:"";' +
        '  position:absolute;top:0;right:0;bottom:0;width:18px;' +
        '  background:linear-gradient(to right,transparent,rgba(0,0,0,0.07));' +
        '  pointer-events:none;border-radius:0 10px 10px 0;' +
        '}';
      document.head.appendChild(styleEl);
    }
    if (!document.getElementById('vadm-tip-global')) {
      var tipEl = document.createElement('div');
      tipEl.id  = 'vadm-tip-global';
      document.body.appendChild(tipEl);
    }

    var today = _todayStr();

    // ── Agrupar datos principales ──
    var byStore = {};
    rows.forEach(function (r) {
      if (!byStore[r.tienda]) byStore[r.tienda] = [];
      byStore[r.tienda].push(r);
    });
    var storeOrder = TIENDAS.filter(function (t) { return byStore[t]; });
    Object.keys(byStore).forEach(function (t) {
      if (storeOrder.indexOf(t) < 0) storeOrder.push(t);
    });

    // Totales por tienda
    var storeTotals = {};
    storeOrder.forEach(function (t) {
      storeTotals[t] = byStore[t].reduce(function (s, r) { return s + (parseFloat(r.total) || 0); }, 0);
    });

    // ── Gran total ──
    var gt = { numerario: 0, mb: 0, visa: 0, voucher: 0, total: 0 };
    storeOrder.forEach(function (t) {
      byStore[t].forEach(function (r) {
        gt.numerario += parseFloat(r.numerario) || 0;
        gt.mb        += parseFloat(r.mb)        || 0;
        gt.visa      += parseFloat(r.visa)      || 0;
        gt.voucher   += parseFloat(r.voucher)   || 0;
        gt.total     += parseFloat(r.total)     || 0;
      });
    });

    // ── Ranking: ordenar por total desc ──
    storeOrder.sort(function (a, b) { return storeTotals[b] - storeTotals[a]; });
    var maxTotal = storeTotals[storeOrder[0]] || 1;

    // ─────────────────────────────────────────────
    //  ALERTA — tiendas sin declarar hoy (≥ 23:10)
    // ─────────────────────────────────────────────
    var now    = new Date();
    var isLate = (now.getHours() > 23) || (now.getHours() === 23 && now.getMinutes() >= 10);
    if (isLate && !meta.filterStore) {
      var declaredToday = {};
      rows.forEach(function (r) { if (r.fecha === today) declaredToday[r.tienda] = true; });
      var missing = TIENDAS.filter(function (t) { return !declaredToday[t]; });
      if (missing.length) {
        var alertDiv = document.createElement('div');
        alertDiv.style.cssText = 'margin-bottom:14px;padding:10px 14px;border-radius:9px;border-left:4px solid #e05a5a;';
        alertDiv.style.setProperty('background', '#2a1414', 'important');

        var alertTitle = document.createElement('div');
        alertTitle.style.cssText = 'font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;';
        alertTitle.style.setProperty('color', '#ff8080', 'important');
        alertTitle.textContent = '⚠ Sin declarar hoy';
        alertDiv.appendChild(alertTitle);

        missing.forEach(function (t) {
          var item = document.createElement('div');
          item.style.cssText = 'font-size:.78rem;font-weight:600;padding:1px 0;';
          item.style.setProperty('color', '#ffb3b3', 'important');
          item.textContent = '· ' + (TIENDA_LABELS[t] || t);
          alertDiv.appendChild(item);
        });

        container.appendChild(alertDiv);
      }
    }

    // Sin resultados
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.setAttribute('style', 'padding:50px 0;text-align:center;opacity:.5;font-size:.85rem;');
      empty.textContent = 'Nenhum registo encontrado para este período.';
      container.appendChild(empty);
      return;
    }

    // ─────────────────────────────────────────────
    //  TOTAL GERAL
    // ─────────────────────────────────────────────
    var grand = document.createElement('div');
    grand.style.cssText = 'border-radius:10px;padding:12px 16px;margin-bottom:16px;overflow-x:auto;';
    grand.style.setProperty('background', '#111111', 'important');

    var grandLabel = document.createElement('div');
    grandLabel.style.cssText = 'font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin-bottom:4px;';
    grandLabel.style.setProperty('color', '#ffffff', 'important');
    grandLabel.textContent = 'TOTAL GERAL';
    grand.appendChild(grandLabel);

    var grandGrid = document.createElement('div');
    grandGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-end;';

    [
      { v: gt.numerario, l: 'Numerário', big: false },
      { v: gt.mb,        l: 'MB',        big: false },
      { v: gt.visa,      l: 'Visa',      big: false },
      { v: gt.voucher,   l: 'Voucher',   big: false },
      { v: gt.total,     l: 'Total',     big: true  }
    ].forEach(function (item) {
      var col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:80px;';

      var val = document.createElement('span');
      val.style.cssText = 'font-size:' + (item.big ? '1.4rem' : '1.1rem') + ';font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;display:block;';
      val.style.setProperty('color', item.big ? '#6dcf95' : '#ffffff', 'important');
      val.textContent = _fmtEur(item.v);

      var lbl = document.createElement('em');
      lbl.style.cssText = 'font-style:normal;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;display:block;';
      lbl.style.setProperty('color', 'rgba(255,255,255,0.75)', 'important');
      lbl.textContent = item.l;

      col.appendChild(val);
      col.appendChild(lbl);

      grandGrid.appendChild(col);
    });

    grand.appendChild(grandGrid);
    container.appendChild(grand);

    // ─────────────────────────────────────────────
    //  SECCIONES POR TIENDA (ordenadas por ranking)
    // ─────────────────────────────────────────────
    storeOrder.forEach(function (tienda, rankIdx) {
      var storeRows = byStore[tienda];
      var label     = TIENDA_LABELS[tienda] || tienda;

      var sub = { numerario: 0, mb: 0, visa: 0, voucher: 0, total: 0 };
      storeRows.forEach(function (r) {
        sub.numerario += parseFloat(r.numerario) || 0;
        sub.mb        += parseFloat(r.mb)        || 0;
        sub.visa      += parseFloat(r.visa)      || 0;
        sub.voucher   += parseFloat(r.voucher)   || 0;
        sub.total     += parseFloat(r.total)     || 0;
      });

      var barPct  = maxTotal > 0 ? (sub.total / maxTotal * 100) : 0;

      var section = document.createElement('div');
      section.setAttribute('style', 'margin-bottom:28px;');

      // ── Título: medalla ranking + nombre + barra ──
      var titleRow = document.createElement('div');
      titleRow.setAttribute('style',
        'display:flex;align-items:center;gap:10px;' +
        'margin-bottom:6px;padding-bottom:5px;border-bottom:2px solid #555;'
      );

      // Nombre tienda
      var titleText = document.createElement('span');
      titleText.setAttribute('style',
        'font-size:1rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;flex-shrink:0;'
      );
      titleText.textContent = label.toUpperCase();

      titleRow.appendChild(titleText);

      section.appendChild(titleRow);

      // ── Tabla ──
      var wrap = document.createElement('div');
      wrap.className = 'vadm-table-wrap';
      wrap.setAttribute('style', 'overflow-x:auto;-webkit-overflow-scrolling:touch;');

      var table = document.createElement('table');
      table.className = 'vadm-table';
      table.setAttribute('style',
        'width:100%;table-layout:auto;border-collapse:separate;border-spacing:0;' +
        'font-size:.82rem;border-radius:10px;overflow:hidden;border:1px solid #e6e6e6;'
      );

      // Colgroup: Data | Num.# | MB | Visa | Voucher | Total | Obs | E*
      var cg = document.createElement('colgroup');
      [88, 80, 80, 70, 70, 82, 36, 52].forEach(function (w) {
        var col = document.createElement('col');
        col.style.width = w + 'px';
        cg.appendChild(col);
      });
      table.appendChild(cg);

      // Cabecera
      var thead = document.createElement('thead');
      var hRow  = document.createElement('tr');
      ['Data','Num.#','MB','Visa','Voucher','Total','Obs.','E*'].forEach(function (h, i) {
        var th = document.createElement('th');
        th.textContent = h;
        th.setAttribute('style',
          'padding:5px 8px;font-size:.62rem;font-weight:700;text-transform:uppercase;' +
          'letter-spacing:.05em;border-bottom:1.5px solid #e0e0e0;white-space:nowrap;' +
          'text-align:center;'
        );
        hRow.appendChild(th);
      });
      thead.appendChild(hRow);
      table.appendChild(thead);

      // Body
      var tbody = document.createElement('tbody');
      storeRows.forEach(function (r) {
        var isToday = (r.fecha === today);
        var tr = document.createElement('tr');
        if (isToday) tr.setAttribute('style', 'background:rgba(109,207,149,0.10);');

        // Celda observaciones
        var obsText = (r.observaciones || '').trim();
        var hasObs  = obsText && obsText !== '—';
        var obsHtml = hasObs
          ? '<span class="vadm-obs-star" data-obs="' + obsText.replace(/"/g, '&quot;') + '" ' +
            'style="color:#c8a832;font-weight:900;font-size:1rem;line-height:1;cursor:help;">✱</span>'
          : '<span style="opacity:.35;">—</span>';

        // Celda colaboradora con lógica de asterisco tooltip
        var empText = (r.empleada || '').trim();
        var hasEmp  = empText && empText !== '—';
        var empHtml = hasEmp
          ? '<span class="vadm-obs-star" data-obs="' + empText.replace(/"/g, '&quot;') + '" ' +
            'style="color:#1a1a1a !important;font-weight:900;font-size:1rem;line-height:1;cursor:help;">✱</span>'
          : '<span style="opacity:.35;">—</span>';

        var cells = [
          { v: _fmtDate(r.fecha),    center: true },
          { v: _fmtEur(r.numerario), center: true },
          { v: _fmtEur(r.mb),        center: true },
          { v: _fmtEur(r.visa),      center: true },
          { v: _fmtEur(r.voucher),   center: true },
          { v: _fmtEur(r.total),     center: true, bold: true },
          { v: obsHtml,              center: true },
          { v: empHtml,              center: true, emp: true  }
        ];
        cells.forEach(function (c, ci) {
          var td = document.createElement('td');
          td.innerHTML = c.v;
          td.setAttribute('style',
            'padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;' +
            'white-space:nowrap;text-align:center;' +
            'font-weight:' + (c.bold ? '800 !important' : 'normal') + ';' +
            'font-size:.75rem;font-variant-numeric:tabular-nums;'
          );
          if (c.bold) td.style.setProperty('font-weight', '800', 'important');
          if (c.emp) td.style.setProperty('color', '#1a1a1a', 'important');
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // Subtotal — solo si hay más de 1 fila
      if (storeRows.length > 1) {
        var tfoot   = document.createElement('tfoot');
        var trSub   = document.createElement('tr');
        var subCells = [
          { v: 'SUBTOTAL',             center: false },
          { v: _fmtEur(sub.numerario), center: true  },
          { v: _fmtEur(sub.mb),        center: true  },
          { v: _fmtEur(sub.visa),      center: true  },
          { v: _fmtEur(sub.voucher),   center: true  },
          { v: _fmtEur(sub.total),     center: true,  bold: true },
          { v: '',                     center: false, colspan: 2 }
        ];
        subCells.forEach(function (c) {
          var td = document.createElement('td');
          td.innerHTML = c.v;
          if (c.colspan) td.setAttribute('colspan', c.colspan);
          td.setAttribute('style',
            'padding:4px 8px;font-size:.68rem;' +
            'font-weight:' + (c.bold ? '800' : '600') + ';' +
            'border-top:2px solid #3a5a45;white-space:nowrap;' +
            'text-align:' + (c.center ? 'center' : 'left') + ';font-variant-numeric:tabular-nums;'
          );
          td.style.setProperty('background', '#1e2a22', 'important');
          td.style.setProperty('color',      '#b8e8c8', 'important');
          trSub.appendChild(td);
        });
        tfoot.appendChild(trSub);
        table.appendChild(tfoot);
      }

      wrap.appendChild(table);
      section.appendChild(wrap);
      container.appendChild(section);
    });

    // ── Delegación tooltip global ──
    container.addEventListener('mousemove', function (e) {
      var star = e.target.closest
        ? e.target.closest('.vadm-obs-star')
        : (e.target.classList && e.target.classList.contains('vadm-obs-star') ? e.target : null);
      var tip = document.getElementById('vadm-tip-global');
      if (!tip) return;
      if (!star) { tip.style.display = 'none'; return; }
      tip.textContent = star.getAttribute('data-obs') || '';
      tip.style.display = 'block';
      var x = e.clientX + 14, y = e.clientY - 10;
      var rect = tip.getBoundingClientRect();
      if (x + rect.width  > window.innerWidth  - 10) x = e.clientX - rect.width  - 14;
      if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - 10;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    });
    container.addEventListener('mouseleave', function () {
      var tip = document.getElementById('vadm-tip-global');
      if (tip) tip.style.display = 'none';
    });
  }

  // ── Helpers ──
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
  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Helpers período ──
  function _periodHoy() { var t = _todayStr(); return { from: t, to: t }; }
  function _periodSemana() {
    var d = new Date(), day = d.getDay();
    var mon = new Date(d);
    mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: _dateToStr(mon), to: _dateToStr(sun) };
  }
  function _periodMes() {
    var d    = new Date();
    var from = new Date(d.getFullYear(), d.getMonth(), 1);
    var to   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: _dateToStr(from), to: _dateToStr(to) };
  }

  function _applyPeriod(period, btnId) {
    var fromEl   = document.getElementById('vadm-from');
    var toEl     = document.getElementById('vadm-to');
    var tiendaEl = document.getElementById('vadm-tienda');
    if (fromEl) fromEl.value = period.from;
    if (toEl)   toEl.value   = period.to;
    if (tiendaEl) { delete tiendaEl.dataset.zoneFilter; delete tiendaEl.dataset.sundayFilter; }
    _activeZoneBtn = null;
    _applyBtnStyles(btnId);
    _vAdmLoadData();
  }

  // ── Init ── (script corre después del DOM, ejecutar directamente)
  setTimeout(function () {
    var fromEl = document.getElementById('vadm-from');
    var toEl   = document.getElementById('vadm-to');
    if (fromEl) fromEl.value = _todayStr();
    if (toEl)   toEl.value   = _todayStr();

    _applyBtnStyles(null, null);

    var buscarBtn = document.getElementById('vadm-buscar-btn');
    if (buscarBtn) {
      buscarBtn.addEventListener('click', function () {
        var tiendaEl = document.getElementById('vadm-tienda');
        if (tiendaEl) { delete tiendaEl.dataset.zoneFilter; delete tiendaEl.dataset.sundayFilter; }
        _applyBtnStyles(null, null);
        _vAdmLoadData();
      });
    }

    var btnHoy    = document.getElementById('vadm-btn-hoy');
    var btnSemana = document.getElementById('vadm-btn-semana');
    var btnMes    = document.getElementById('vadm-btn-mes');

    if (btnHoy)    btnHoy.addEventListener('click',    function () { _applyPeriod(_periodHoy(),    'vadm-btn-hoy');    });
    if (btnSemana) btnSemana.addEventListener('click', function () { _applyPeriod(_periodSemana(), 'vadm-btn-semana'); });
    if (btnMes)    btnMes.addEventListener('click',    function () { _applyPeriod(_periodMes(),    'vadm-btn-mes');    });

    // ── Filtros de zona: Porto Santo / Funchal ──
    function _applyZoneFilter(tiendas, btnId) {
      var tiendaEl = document.getElementById('vadm-tienda');
      if (!tiendaEl) return;
      tiendaEl.value = '';
      tiendaEl.dataset.zoneFilter = JSON.stringify(tiendas);
      delete tiendaEl.dataset.sundayFilter;
      _applyBtnStyles(btnId);
      _vAdmLoadData();
    }

    var btnPorto    = document.getElementById('vadm-btn-porto');
    var btnFunchal  = document.getElementById('vadm-btn-funchal');
    var btnDomingos = document.getElementById('vadm-btn-domingos');

    if (btnPorto) {
      btnPorto.addEventListener('click', function () {
        _applyZoneFilter(PORTO_SANTO_TIENDAS, 'vadm-btn-porto');
      });
    }
    if (btnFunchal) {
      btnFunchal.addEventListener('click', function () {
        _applyZoneFilter(FUNCHAL_TIENDAS, 'vadm-btn-funchal');
      });
    }
    if (btnDomingos) {
      btnDomingos.addEventListener('click', function () {
        var tiendaEl = document.getElementById('vadm-tienda');
        if (!tiendaEl) return;
        // Fijar rango completo para no depender del período activo
        var fromEl = document.getElementById('vadm-from');
        var toEl   = document.getElementById('vadm-to');
        if (fromEl) fromEl.value = '2026-01-01';
        if (toEl)   toEl.value   = _todayStr();
        tiendaEl.value = '';
        tiendaEl.dataset.zoneFilter   = JSON.stringify(PORTO_SANTO_TIENDAS);
        tiendaEl.dataset.sundayFilter = 'true';
        _activeZoneBtn   = 'vadm-btn-domingos';
        _activePeriodBtn = null;
        _applyBtnStyles('vadm-btn-domingos');
        _vAdmLoadData();
      });
    }

    if (fromEl) fromEl.addEventListener('change', function () {
      var tiendaEl = document.getElementById('vadm-tienda');
      if (tiendaEl) { delete tiendaEl.dataset.zoneFilter; delete tiendaEl.dataset.sundayFilter; }
      _applyBtnStyles(null, null);
    });
    if (toEl) toEl.addEventListener('change', function () {
      var tiendaEl = document.getElementById('vadm-tienda');
      if (tiendaEl) { delete tiendaEl.dataset.zoneFilter; delete tiendaEl.dataset.sundayFilter; }
      _applyBtnStyles(null, null);
    });
  }, 0);

  window._vAdmLoadData = _vAdmLoadData;

})();
