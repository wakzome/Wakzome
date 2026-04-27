// ══════════════════════════════════════════════════════════════
//  VENTAS DIARIAS — VISTA ADMINISTRADOR
// ══════════════════════════════════════════════════════════════
(function () {

  var TIENDAS = [
    'mezka funchal',
    'parfois madeira shopping',
    'parfois arcadas são francisco',
    'Porto Santo',
    'Shana',
    'Mezka Avenida',
    'Mezka Mercado'
  ];

  var TIENDA_LABELS = {
    'mezka funchal':                     'Mezka Funchal',
    'parfois madeira shopping':          'Madeira Shopping',
    'parfois arcadas são francisco':     'Parfois Arcadas',
    'Porto Santo':                       'Porto Santo',
    'Shana':                             'Shana',
    'Mezka Avenida':                     'Mezka Avenida',
    'Mezka Mercado':                     'Mezka Mercado'
  };

  // ── Abrir módulo ventas admin ──
  window.openVentasAdmin = function () {
    // Usar el sistema de módulos existente del admin
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var barTitle  = document.getElementById('adm-module-bar-title');

    if (dashboard)  dashboard.style.display  = 'none';
    if (moduleBar)  moduleBar.style.display  = 'flex';
    if (barTitle)   barTitle.textContent     = 'ventas declaradas';
    if (adminApp)   adminApp.classList.add('module-open');

    // Mostrar el panel
    var panel = document.getElementById('adm-ventas-panel');
    if (panel) {
      panel.style.display = 'block';
      _vAdmLoadData();
    }
  };

  window.closeVentasAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var panel     = document.getElementById('adm-ventas-panel');

    if (panel)     panel.style.display    = 'none';
    if (moduleBar) moduleBar.style.display = 'none';
    if (dashboard) dashboard.style.display = '';
    if (adminApp)  adminApp.classList.remove('module-open');
  };

  // ── Cargar y renderizar ──
  function _vAdmLoadData() {
    var container = document.getElementById('adm-ventas-content');
    if (!container) return;

    container.innerHTML = '<div class="v-adm-loading">a carregar…</div>';

    // Obtener filtros
    var fromDate = document.getElementById('vadm-from').value || _offsetDate(-7);
    var toDate   = document.getElementById('vadm-to').value   || _todayStr();
    var filterStore = document.getElementById('vadm-tienda').value || '';

    var query = sbClient
      .from('ventas_diarias')
      .select('*')
      .gte('fecha', fromDate)
      .lte('fecha', toDate)
      .order('fecha', { ascending: false });

    if (filterStore) query = query.eq('tienda', filterStore);

    query.then(function (res) {
      if (res.error) {
        container.innerHTML = '<div class="v-adm-error">⚠ Erro: ' + res.error.message + '</div>';
        return;
      }
      _renderAdmTables(res.data || [], container);
    }).catch(function (err) {
      container.innerHTML = '<div class="v-adm-error">⚠ Erro de ligação</div>';
    });
  }

  function _renderAdmTables(rows, container) {
    container.innerHTML = '';

    if (!rows.length) {
      container.innerHTML = '<div class="v-adm-empty">Nenhum registo encontrado para este período.</div>';
      return;
    }

    // Agrupar por tienda
    var byStore = {};
    rows.forEach(function (r) {
      if (!byStore[r.tienda]) byStore[r.tienda] = [];
      byStore[r.tienda].push(r);
    });

    // Totales globales
    var grandTotals = { numerario: 0, mb: 0, visa: 0, voucher: 0, total: 0 };

    // Orden de tiendas (las que tienen datos, respetando orden lógico)
    var storeOrder = TIENDAS.filter(function (t) { return byStore[t]; });
    // Añadir cualquier tienda no mapeada que tenga datos
    Object.keys(byStore).forEach(function (t) {
      if (storeOrder.indexOf(t) < 0) storeOrder.push(t);
    });

    storeOrder.forEach(function (tienda) {
      var storeRows = byStore[tienda];
      var label     = TIENDA_LABELS[tienda] || tienda;

      // Subtotales de tienda
      var subtotals = { numerario: 0, mb: 0, visa: 0, voucher: 0, total: 0 };
      storeRows.forEach(function (r) {
        subtotals.numerario += parseFloat(r.numerario) || 0;
        subtotals.mb        += parseFloat(r.mb)        || 0;
        subtotals.visa      += parseFloat(r.visa)      || 0;
        subtotals.voucher   += parseFloat(r.voucher)   || 0;
        subtotals.total     += parseFloat(r.total)     || 0;
      });

      // Acumular globales
      Object.keys(grandTotals).forEach(function (k) { grandTotals[k] += subtotals[k]; });

      // Sección de tienda
      var section = document.createElement('div');
      section.className = 'v-adm-store-section';

      var sTitle = document.createElement('div');
      sTitle.className = 'v-adm-store-title';
      sTitle.textContent = label.toUpperCase();
      section.appendChild(sTitle);

      // Tabla
      var table = document.createElement('table');
      table.className = 'v-adm-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>Data</th>' +
        '<th>Numerário</th>' +
        '<th>MB</th>' +
        '<th>Visa</th>' +
        '<th>Voucher</th>' +
        '<th>Total</th>' +
        '<th>Observações</th>' +
        '<th>Colaboradora</th>' +
        '</tr></thead>';

      var tbody = document.createElement('tbody');
      storeRows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + _formatDatePTShort(r.fecha) + '</td>' +
          '<td class="v-adm-num">' + _fmtEur(r.numerario) + '</td>' +
          '<td class="v-adm-num">' + _fmtEur(r.mb)        + '</td>' +
          '<td class="v-adm-num">' + _fmtEur(r.visa)      + '</td>' +
          '<td class="v-adm-num">' + _fmtEur(r.voucher)   + '</td>' +
          '<td class="v-adm-num v-adm-total-cell">' + _fmtEur(r.total) + '</td>' +
          '<td class="v-adm-obs">' + _esc(r.observaciones || '—') + '</td>' +
          '<td>' + _esc(r.empleada || '—') + '</td>';
        tbody.appendChild(tr);
      });

      // Fila subtotal
      var tfoot = document.createElement('tfoot');
      tfoot.innerHTML =
        '<tr class="v-adm-subtotal-row">' +
        '<td>SUBTOTAL</td>' +
        '<td class="v-adm-num">' + _fmtEur(subtotals.numerario) + '</td>' +
        '<td class="v-adm-num">' + _fmtEur(subtotals.mb)        + '</td>' +
        '<td class="v-adm-num">' + _fmtEur(subtotals.visa)      + '</td>' +
        '<td class="v-adm-num">' + _fmtEur(subtotals.voucher)   + '</td>' +
        '<td class="v-adm-num v-adm-total-cell">' + _fmtEur(subtotals.total) + '</td>' +
        '<td colspan="2"></td>' +
        '</tr>';

      table.appendChild(tbody);
      table.appendChild(tfoot);
      section.appendChild(table);
      container.appendChild(section);
    });

    // ── Gran total ──
    var grandSection = document.createElement('div');
    grandSection.className = 'v-adm-grand-section';
    grandSection.innerHTML =
      '<div class="v-adm-grand-label">TOTAL GERAL</div>' +
      '<div class="v-adm-grand-grid">' +
        '<div class="v-adm-grand-item"><span>' + _fmtEur(grandTotals.numerario) + '</span><em>Numerário</em></div>' +
        '<div class="v-adm-grand-item"><span>' + _fmtEur(grandTotals.mb)        + '</span><em>MB</em></div>' +
        '<div class="v-adm-grand-item"><span>' + _fmtEur(grandTotals.visa)      + '</span><em>Visa</em></div>' +
        '<div class="v-adm-grand-item"><span>' + _fmtEur(grandTotals.voucher)   + '</span><em>Voucher</em></div>' +
        '<div class="v-adm-grand-item v-adm-grand-total"><span>' + _fmtEur(grandTotals.total) + '</span><em>Total</em></div>' +
      '</div>';
    container.appendChild(grandSection);
  }

  // ── Helpers ──
  function _todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }

  function _offsetDate(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }

  function _pad(n) { return n < 10 ? '0' + n : String(n); }

  function _formatDatePTShort(str) {
    if (!str) return '';
    var parts = str.split('-');
    if (parts.length !== 3) return str;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function _fmtEur(v) {
    return parseFloat(v || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Inicializar filtros cuando el panel esté en el DOM ──
  document.addEventListener('DOMContentLoaded', function () {
    var fromEl = document.getElementById('vadm-from');
    var toEl   = document.getElementById('vadm-to');
    if (fromEl) fromEl.value = _offsetDate(-7);
    if (toEl)   toEl.value   = _todayStr();

    // Botón buscar
    var buscarBtn = document.getElementById('vadm-buscar-btn');
    if (buscarBtn) {
      buscarBtn.addEventListener('click', function () {
        _vAdmLoadData();
      });
    }
  });

  // Exponer para uso desde HTML inline
  window._vAdmLoadData = _vAdmLoadData;

})();
