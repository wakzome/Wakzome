// ══════════════════════════════════════════════════════════════
//  VENTAS DIARIAS — VISTA EMPLEADA
// ══════════════════════════════════════════════════════════════
(function () {

  // ── Estado ──
  var _vStore      = null;   // tienda activa (de login)
  var _vSubtienda  = null;   // sub-tienda seleccionada (Porto Santo)
  var _vFecha      = null;   // fecha en edición (YYYY-MM-DD)
  var _vAutoTimer  = null;   // interval autoguardado
  var _vDirty      = false;  // cambios sin guardar
  var _vSaving     = false;
  var _vRecords    = [];     // últimos 3 días cargados

  var PORTO_SUBTIENDAS = ['Porto Santo', 'Shana', 'Mezka Avenida', 'Mezka Mercado'];

  // ── Abrir overlay ──
  window.openVentasOverlay = function (store) {
    _vStore = store || (window._currentStoreGlobal || null);
    var overlay = document.getElementById('ventas-overlay');
    overlay.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('visible'); });
    });
    _vSubtienda = null;
    _vFecha     = _todayStr();
    _vDirty     = false;

    if (_vStore === 'porto santo') {
      _showSubtiendasSelector();
    } else {
      _vSubtienda = _vStore;
      _loadVentasPanel();
    }
  };

  // ── Cerrar overlay ──
  window.closeVentasOverlay = function () {
    if (_vDirty) {
      if (!confirm('Tens alterações não guardadas. Sair mesmo assim?')) return;
    }
    _stopAutosave();
    var overlay = document.getElementById('ventas-overlay');
    overlay.classList.remove('visible');
    setTimeout(function () { overlay.classList.remove('open'); }, 650);
  };

  // ── Selector de sub-tienda (Porto Santo) ──
  function _showSubtiendasSelector() {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'v-subtienda-selector';

    var title = document.createElement('p');
    title.className = 'v-selector-title';
    title.textContent = 'seleciona a loja';
    wrap.appendChild(title);

    PORTO_SUBTIENDAS.forEach(function (name) {
      var btn = document.createElement('button');
      btn.className = 'v-subtienda-btn';
      btn.textContent = name;
      btn.addEventListener('click', function () {
        _vSubtienda = name;
        _loadVentasPanel();
      });
      wrap.appendChild(btn);
    });

    body.appendChild(wrap);
  }

  // ── Cargar el panel principal (historial + formulario) ──
  function _loadVentasPanel() {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '<div class="v-loading">a carregar…</div>';

    // Título del overlay
    var tLabel = _labelFor(_vSubtienda || _vStore);
    document.getElementById('ventas-overlay-title').textContent = 'ventas · ' + tLabel.toLowerCase();

    _fetchRecords().then(function (rows) {
      _vRecords = rows;
      _renderPanel(rows);
      _startAutosave();
    }).catch(function (err) {
      body.innerHTML = '<div class="v-error">⚠ Erro ao carregar: ' + err.message + '</div>';
    });
  }

  // ── Fetch últimos 3 días de esta tienda ──
  function _fetchRecords() {
    var tienda = _vSubtienda || _vStore;
    var cutoff = _offsetDate(-3);
    return sbClient
      .from('ventas_diarias')
      .select('*')
      .eq('tienda', tienda)
      .gte('fecha', cutoff)
      .order('fecha', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  // ── Renderizar panel ──
  function _renderPanel(rows) {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '';

    // ── Historial ──
    var histSection = document.createElement('div');
    histSection.className = 'v-hist-section';

    var histTitle = document.createElement('div');
    histTitle.className = 'v-section-label';
    histTitle.textContent = 'REGISTOS RECENTES';
    histSection.appendChild(histTitle);

    // Generar los últimos 3 días
    for (var d = 0; d < 3; d++) {
      var dateStr = _offsetDate(-d);
      var rec = rows.find(function (r) { return r.fecha === dateStr; }) || null;
      var dayEl = _buildHistRow(dateStr, rec, d === 0);
      histSection.appendChild(dayEl);
    }
    body.appendChild(histSection);

    // ── Formulario ──
    var formSection = document.createElement('div');
    formSection.id = 'v-form-section';
    formSection.className = 'v-form-section';
    body.appendChild(formSection);

    // Por defecto abrir el formulario del día de hoy
    _openForm(_todayStr(), rows.find(function (r) { return r.fecha === _todayStr(); }) || null);
  }

  // ── Fila de historial ──
  function _buildHistRow(dateStr, rec, isToday) {
    var row = document.createElement('div');
    row.className = 'v-hist-row' + (isToday ? ' v-hist-today' : '');
    row.dataset.date = dateStr;

    var dateLabel = document.createElement('span');
    dateLabel.className = 'v-hist-date';
    dateLabel.textContent = _formatDatePT(dateStr) + (isToday ? ' (hoje)' : '');
    row.appendChild(dateLabel);

    if (rec) {
      var total = document.createElement('span');
      total.className = 'v-hist-total';
      total.textContent = _fmtEur(rec.total);
      row.appendChild(total);

      // Botón editar
      var editBtn = document.createElement('button');
      editBtn.className = 'v-hist-edit-btn';
      editBtn.title = 'editar';
      editBtn.innerHTML = '✏';
      editBtn.addEventListener('click', (function (ds, r) {
        return function () { _openForm(ds, r); };
      })(dateStr, rec));
      row.appendChild(editBtn);
    } else {
      // Alerta si no es hoy (día perdido)
      if (!isToday) {
        var alert = document.createElement('span');
        alert.className = 'v-hist-missing';
        alert.textContent = '⚠ não enviado';
        row.appendChild(alert);
      } else {
        var pending = document.createElement('span');
        pending.className = 'v-hist-pending';
        pending.textContent = 'por preencher';
        row.appendChild(pending);
      }

      // Botón rellenar
      var fillBtn = document.createElement('button');
      fillBtn.className = 'v-hist-edit-btn';
      fillBtn.innerHTML = '＋';
      fillBtn.title = 'preencher';
      fillBtn.addEventListener('click', (function (ds) {
        return function () { _openForm(ds, null); };
      })(dateStr));
      row.appendChild(fillBtn);
    }

    return row;
  }

  // ── Abrir formulario de una fecha ──
  function _openForm(dateStr, existingRec) {
    _vFecha = dateStr;
    _vDirty = false;

    // Scroll al form
    var formSection = document.getElementById('v-form-section');
    if (!formSection) return;

    // Destacar la fila activa en el historial
    document.querySelectorAll('.v-hist-row').forEach(function (r) {
      r.classList.toggle('v-hist-row-active', r.dataset.date === dateStr);
    });

    var rec = existingRec || {};

    formSection.innerHTML = '';

    var formTitle = document.createElement('div');
    formTitle.className = 'v-section-label';
    formTitle.textContent = 'PREENCHER · ' + _formatDatePT(dateStr).toUpperCase();
    formSection.appendChild(formTitle);

    // Campos numéricos
    var fields = [
      { id: 'v-numerario', label: 'Numerário',  key: 'numerario' },
      { id: 'v-mb',        label: 'MB',          key: 'mb'        },
      { id: 'v-visa',      label: 'Visa',        key: 'visa'      },
      { id: 'v-voucher',   label: 'Voucher',     key: 'voucher'   },
    ];

    var numGrid = document.createElement('div');
    numGrid.className = 'v-num-grid';

    fields.forEach(function (f) {
      var group = document.createElement('div');
      group.className = 'v-field-group';

      var label = document.createElement('label');
      label.htmlFor = f.id;
      label.textContent = f.label;
      group.appendChild(label);

      var input = document.createElement('input');
      input.type = 'number';
      input.id   = f.id;
      input.min  = '0';
      input.step = '0.01';
      input.placeholder = '0,00';
      input.value = rec[f.key] != null ? rec[f.key] : '';
      input.className = 'v-num-input';
      input.addEventListener('input', _onFieldChange);
      group.appendChild(input);

      numGrid.appendChild(group);
    });
    formSection.appendChild(numGrid);

    // Total (solo lectura)
    var totalGroup = document.createElement('div');
    totalGroup.className = 'v-field-group v-total-group';
    var totalLabel = document.createElement('label');
    totalLabel.textContent = 'Total';
    totalGroup.appendChild(totalLabel);
    var totalInput = document.createElement('input');
    totalInput.type = 'text';
    totalInput.id   = 'v-total';
    totalInput.readOnly = true;
    totalInput.className = 'v-num-input v-total-input';
    totalInput.value = rec.total != null ? _fmtEur(rec.total) : '0,00 €';
    totalGroup.appendChild(totalInput);
    formSection.appendChild(totalGroup);

    // Observações
    var obsGroup = document.createElement('div');
    obsGroup.className = 'v-field-group v-obs-group';
    var obsLabel = document.createElement('label');
    obsLabel.htmlFor = 'v-obs';
    obsLabel.textContent = 'Observações';
    obsGroup.appendChild(obsLabel);
    var obsInput = document.createElement('textarea');
    obsInput.id   = 'v-obs';
    obsInput.rows = 3;
    obsInput.className = 'v-obs-input';
    obsInput.placeholder = 'opcional…';
    obsInput.value = rec.observaciones || '';
    obsInput.addEventListener('input', function () { _vDirty = true; });
    obsGroup.appendChild(obsInput);
    formSection.appendChild(obsGroup);

    // Nombre empleada
    var empGroup = document.createElement('div');
    empGroup.className = 'v-field-group';
    var empLabel = document.createElement('label');
    empLabel.htmlFor = 'v-empleada';
    empLabel.textContent = 'Nome da colaboradora';
    empGroup.appendChild(empLabel);
    var empInput = document.createElement('input');
    empInput.type = 'text';
    empInput.id   = 'v-empleada';
    empInput.className = 'v-text-input';
    empInput.placeholder = 'Nome completo';
    empInput.value = rec.empleada || '';
    empInput.addEventListener('input', function () { _vDirty = true; });
    empGroup.appendChild(empInput);
    formSection.appendChild(empGroup);

    // Barra de acciones (estado + botón)
    var actionBar = document.createElement('div');
    actionBar.className = 'v-action-bar';

    var statusEl = document.createElement('span');
    statusEl.id = 'v-save-status';
    statusEl.className = 'v-save-status';
    actionBar.appendChild(statusEl);

    var saveBtn = document.createElement('button');
    saveBtn.id = 'v-save-btn';
    saveBtn.className = 'v-save-btn';
    saveBtn.title = 'guardar';
    saveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="3" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="13" width="12" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><line x1="9" y1="4.5" x2="9" y2="8.5" stroke="currentColor" stroke-width="1.5"/></svg> guardar';
    saveBtn.addEventListener('click', function () { _saveRecord(true); });
    actionBar.appendChild(saveBtn);

    formSection.appendChild(actionBar);

    // Calcular total inicial
    _updateTotal();

    // Scroll suave al form
    setTimeout(function () {
      formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  // ── Recalcular total ──
  function _onFieldChange() {
    _vDirty = true;
    _updateTotal();
  }

  function _updateTotal() {
    var sum = 0;
    ['v-numerario', 'v-mb', 'v-visa', 'v-voucher'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sum += parseFloat(el.value) || 0;
    });
    var totalEl = document.getElementById('v-total');
    if (totalEl) totalEl.value = _fmtEur(sum);
  }

  // ── Guardar (upsert) ──
  function _saveRecord(manual) {
    if (_vSaving) return;

    var tienda = _vSubtienda || _vStore;
    var numerario = parseFloat(document.getElementById('v-numerario').value) || 0;
    var mb        = parseFloat(document.getElementById('v-mb').value)        || 0;
    var visa      = parseFloat(document.getElementById('v-visa').value)      || 0;
    var voucher   = parseFloat(document.getElementById('v-voucher').value)   || 0;
    var total     = numerario + mb + visa + voucher;
    var obs       = document.getElementById('v-obs').value.trim();
    var empleada  = document.getElementById('v-empleada').value.trim();

    if (!empleada) {
      _setStatus('⚠ indica o nome da colaboradora', 'error');
      document.getElementById('v-empleada').focus();
      return;
    }

    _vSaving = true;
    _setStatus('a guardar…', 'saving');

    var record = {
      tienda:       tienda,
      fecha:        _vFecha,
      numerario:    numerario,
      mb:           mb,
      visa:         visa,
      voucher:      voucher,
      total:        total,
      observaciones: obs,
      empleada:     empleada,
      updated_at:   new Date().toISOString()
    };

    sbClient
      .from('ventas_diarias')
      .upsert(record, { onConflict: 'tienda,fecha' })
      .then(function (res) {
        _vSaving = false;
        if (res.error) {
          _setStatus('⚠ Erro: ' + res.error.message, 'error');
          return;
        }
        _vDirty = false;
        _setStatus(manual ? '✓ guardado' : '✓ autoguardado', 'ok');

        // Actualizar historial en memoria
        var idx = _vRecords.findIndex(function (r) { return r.fecha === _vFecha && r.tienda === tienda; });
        if (idx >= 0) {
          _vRecords[idx] = Object.assign({}, _vRecords[idx], record);
        } else {
          _vRecords.push(Object.assign({ id: null }, record));
        }
        _refreshHistRow(_vFecha, record);

        if (manual) {
          setTimeout(function () { _setStatus('', ''); }, 2500);
        }
      })
      .catch(function (err) {
        _vSaving = false;
        _setStatus('⚠ Erro de ligação', 'error');
      });
  }

  // ── Actualizar fila del historial tras guardar ──
  function _refreshHistRow(dateStr, rec) {
    var row = document.querySelector('.v-hist-row[data-date="' + dateStr + '"]');
    if (!row) return;

    // Quitar alerta de missing si había
    var missing = row.querySelector('.v-hist-missing, .v-hist-pending');
    if (missing) missing.remove();

    var totalEl = row.querySelector('.v-hist-total');
    if (totalEl) {
      totalEl.textContent = _fmtEur(rec.total);
    } else {
      var t = document.createElement('span');
      t.className = 'v-hist-total';
      t.textContent = _fmtEur(rec.total);
      var editBtn = row.querySelector('.v-hist-edit-btn');
      row.insertBefore(t, editBtn);
    }

    // Cambiar el botón ＋ a ✏ si existía como ＋
    var btn = row.querySelector('.v-hist-edit-btn');
    if (btn && btn.innerHTML === '＋') btn.innerHTML = '✏';
  }

  // ── Autoguardado ──
  function _startAutosave() {
    _stopAutosave();
    _vAutoTimer = setInterval(function () {
      if (_vDirty && !_vSaving) _saveRecord(false);
    }, 15000);
  }

  function _stopAutosave() {
    if (_vAutoTimer) { clearInterval(_vAutoTimer); _vAutoTimer = null; }
  }

  // ── Helpers UI ──
  function _setStatus(msg, type) {
    var el = document.getElementById('v-save-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'v-save-status' + (type ? ' v-status-' + type : '');
  }

  // ── Helpers fecha ──
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

  function _formatDatePT(str) {
    var parts = str.split('-');
    if (parts.length !== 3) return str;
    var days   = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
    var months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return days[d.getDay()] + ', ' + parts[2] + ' ' + months[+parts[1] - 1];
  }

  function _fmtEur(v) {
    return parseFloat(v || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function _labelFor(store) {
    var map = {
      'mezka funchal': 'Mezka Funchal',
      'parfois madeira shopping': 'Madeira Shopping',
      'parfois arcadas são francisco': 'Parfois Arcadas',
      'porto santo': 'Porto Santo',
      'Porto Santo': 'Porto Santo',
      'Shana': 'Shana',
      'Mezka Avenida': 'Mezka Avenida',
      'Mezka Mercado': 'Mezka Mercado'
    };
    return map[store] || store;
  }

  // ── Exponer tienda actual al abrir (shared.js la guarda aquí) ──
  // shared.js llama a loadData(currentStore) → nosotros interceptamos
  var _origLoadData = window.loadData;
  window.loadData = function (store) {
    window._currentStoreGlobal = store;
    if (_origLoadData) _origLoadData(store);
  };

})();
