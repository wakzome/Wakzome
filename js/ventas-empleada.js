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

  var SYSTEM_START = '2026-05-01'; // Primeiro dia de declaração de vendas pelas colaboradoras

  var PORTO_SUBTIENDAS = ['Shana', 'Mezka Avenida', 'Mezka Mercado', 'Maxx'];

  var EMPLEADAS_LIST = [
    'Alejandra Abreu', 'Cristina Teixeira', 'Patricia Silva', 'Carla Alves',
    'Catia Temtem', 'Débora Fernandes', 'Edna Melim', 'Filipa Rodrigues',
    'Isaltina Fernandes', 'Jacinta Alves', 'Joana Baptista', 'Marilia Silva',
    'Sandra Melim', 'Sandra Nunes', 'Djanice Lopes', 'Matilde Rodrigues',
    'Sara Almeida', 'Claudia Nunes', 'Leonia Pereira'
  ].map(function (n) { return n.toUpperCase(); });

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

    if (!_vStore) {
      var body = document.getElementById('ventas-overlay-body');
      if (body) body.innerHTML = '<div class="v-error">⚠ Loja não identificada. Por favor, refresque a página e volte a entrar com a sua senha.</div>';
      return;
    }

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

  // ── Código de emergencia: hash determinista por tienda+fecha ──
  // Genera 5 dígitos numéricos a partir de un string. Sin librerías externas.
  function _emergencyCode(tienda, dateStr) {
    var SECRET = 'wkz.ps@8f2e1b9d4c7a';
    var raw = SECRET + '|' + tienda.toLowerCase() + '|' + dateStr;
    // djb2 hash
    var h = 5381;
    for (var i = 0; i < raw.length; i++) {
      h = ((h << 5) + h) + raw.charCodeAt(i);
      h = h & 0x7fffffff; // mantener positivo 31 bits
    }
    // Extraer 5 dígitos: usar módulo para obtener número 10000–99999
    var code = 10000 + (h % 90000);
    return String(Math.abs(code));
  }

  // ── Obtener semana ISO del año ──
  function _isoWeek(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  // ── Descargar y parsear el CSV de horarios de Porto Santo ──
  function _fetchScheduleCSV() {
    var today = new Date();
    var week  = _isoWeek(today);
    var base  = 'https://' + (window.SUPABASE_URL || '').replace('https://','').replace(/\/$/, '');
    var bucket = '/storage/v1/object/public/horarios/';

    // Intentar semana actual, luego anterior y siguiente como fallback
    var candidates = [week, week - 1, week + 1].map(function (w) {
      return base + bucket + 'porto_s' + w + '.csv';
    });

    function tryNext(idx) {
      if (idx >= candidates.length) return Promise.reject(new Error('Horário não encontrado'));
      return fetch(candidates[idx] + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) return tryNext(idx + 1);
          return res.text();
        })
        .catch(function () { return tryNext(idx + 1); });
    }
    return tryNext(0);
  }

  // ── Parsear CSV y detectar tiendas asignadas hoy para una empleada ──
  // Devuelve array con nombres de subtiendas donde trabaja hoy (puede ser vacío)
  function _getAssignedStoresForToday(csvText, employeeName) {
    if (!employeeName) return [];

    var today    = new Date();
    var todayStr = today.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' })
                        .replace(/\//g, '/'); // DD/MM/YYYY

    var lines = csvText.split(/\r?\n/).map(function (l) { return l.split(','); });

    var assigned = [];
    var currentSection = null; // tienda actual del bloque CSV
    var i = 0;

    while (i < lines.length) {
      var row = lines[i];
      var cell0 = (row[0] || '').trim();

      // Detectar cabecera de bloque: "PORTO SANTO" seguido de nombre de tienda
      if (cell0.toUpperCase() === 'PORTO SANTO') {
        // Siguiente fila es el nombre de la sub-tienda + fechas
        var nextRow = lines[i + 1] || [];
        currentSection = (nextRow[0] || '').trim(); // ej: "MEZKA AVENIDA"
        i += 2; // saltar las 2 filas de cabecera
        continue;
      }

      // Fila de empleada: cell0 contiene "NOMBRE X.NNhrs"
      // Comparar ignorando apellido y horas: buscar el primer token que coincida
      var firstToken = cell0.split(/[\s.]/)[0].toUpperCase();
      var empFirst   = employeeName.split(/[\s.]/)[0].toUpperCase();

      if (firstToken && firstToken === empFirst && currentSection) {
        // Buscar la columna de hoy en la fila de fechas (2 filas atrás = cabecera de fechas)
        // La cabecera de fechas está en la fila inmediatamente después de la fila "PORTO SANTO"
        // Necesitamos buscarla hacia atrás: buscamos la fila que tiene fechas DD/MM/YYYY
        var headerRow = null;
        for (var back = i - 1; back >= 0; back--) {
          var candidate = lines[back];
          var hasDate = false;
          for (var c = 1; c < candidate.length; c++) {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test((candidate[c] || '').trim())) { hasDate = true; break; }
          }
          if (hasDate) { headerRow = candidate; break; }
          // Si encontramos "PORTO SANTO" ya pasamos el bloque
          if ((candidate[0] || '').trim().toUpperCase() === 'PORTO SANTO') break;
        }

        if (headerRow) {
          var todayColIdx = -1;
          for (var c = 1; c < headerRow.length; c++) {
            if ((headerRow[c] || '').trim() === todayStr) { todayColIdx = c; break; }
          }

          if (todayColIdx > 0) {
            // Leer filas A y B de esta empleada
            var rowA = lines[i]     || [];
            var rowB = lines[i + 1] || [];
            var valA = (rowA[todayColIdx] || '').trim().toUpperCase();
            var valB = (rowB[todayColIdx] || '').trim().toUpperCase();

            var isScheduled = false;
            var skipValues  = ['FOLGA', 'FERIAS', '', 'MEZKA AVENIDA', 'MEZKA MERCADO', 'SHANA', 'MAXX'];

            // Valor tiene horario (ej: "10:00-13:00") → está en esta tienda
            if (valA && !skipValues.includes(valA) && /\d{2}:\d{2}/.test(valA)) isScheduled = true;
            if (!isScheduled && valB && !skipValues.includes(valB) && /\d{2}:\d{2}/.test(valB)) isScheduled = true;

            if (isScheduled && assigned.indexOf(currentSection) === -1) {
              assigned.push(currentSection);
            }
          }
        }
        i += 2; // saltar par de filas (A y B)
        continue;
      }

      i++;
    }

    return assigned;
  }

  // ── Normalizar nombre de sección CSV → nombre de subtienda en PORTO_SUBTIENDAS ──
  function _normalizeSection(sectionName) {
    var map = {
      'MEZKA AVENIDA':  'Mezka Avenida',
      'MEZKA MERCADO':  'Mezka Mercado',
      'SHANA':          'Shana',
      'MAXX':           'Maxx'
    };
    return map[(sectionName || '').trim().toUpperCase()] || null;
  }

  // ── Selector de sub-tienda (Porto Santo) — con control de acceso por horario ──
  function _showSubtiendasSelector() {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '<div class="v-loading">a verificar horário…</div>';

    var empName = (window._currentEmployeeName || '').trim().toUpperCase();

    _fetchScheduleCSV()
      .then(function (csvText) {
        var rawAssigned = _getAssignedStoresForToday(csvText, empName);
        // Normalizar nombres de sección a nombres de subtienda
        var assignedStores = rawAssigned.map(_normalizeSection).filter(Boolean);

        _renderSubtiendasWithAccess(assignedStores, csvText);
      })
      .catch(function () {
        // Si falla la descarga del CSV, mostrar todos los botones sin restricción
        _renderSubtiendasWithAccess([], null);
      });
  }

  // ── Renderizar los 4 botones con lógica de acceso ──
  function _renderSubtiendasWithAccess(assignedStores, csvText) {
    // Inyectar CSS de emergencia una sola vez
    if (!document.getElementById('v-emergency-style')) {
      var es = document.createElement('style');
      es.id = 'v-emergency-style';
      es.textContent =
        '.v-subtienda-btn-wrap{display:flex;flex-direction:column;align-items:stretch;width:100%;max-width:320px;}' +
        '.v-emergency-wrap{margin-top:6px;padding:12px 14px;background:#f5f5f5;border:1.5px solid #bbb;border-radius:10px;}' +
        '.v-emergency-msg{font-size:.78rem;color:#555;margin-bottom:8px;font-weight:600;text-align:center;}' +
        '.v-emergency-row{display:flex;gap:8px;align-items:center;}' +
        '.v-emergency-input{flex:1;padding:8px 10px;border:1.5px solid #bbb;border-radius:7px;font-size:.88rem;text-align:center;letter-spacing:.1em;background:#fff;}' +
        '.v-emergency-input:focus{border-color:#555;outline:none;box-shadow:0 0 0 2px rgba(0,0,0,.08);}' +
        '.v-emergency-confirm{padding:8px 14px;background:#333;color:#fff !important;border:none;border-radius:7px;font-size:.82rem;cursor:pointer;white-space:nowrap;}' +
        '.v-emergency-confirm:hover{background:#000;}' +
        '.v-emergency-err{font-size:.78rem;color:#555;margin-top:6px;text-align:center;font-weight:600;}';
      document.head.appendChild(es);
    }
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'v-subtienda-selector';

    var title = document.createElement('p');
    title.className = 'v-selector-title';
    title.textContent = 'seleciona a loja';
    wrap.appendChild(title);

    var todayStr = _todayStr(); // YYYY-MM-DD para el código de emergencia

    PORTO_SUBTIENDAS.forEach(function (name) {
      var btnWrap = document.createElement('div');
      btnWrap.className = 'v-subtienda-btn-wrap';

      var btn = document.createElement('button');
      btn.className = 'v-subtienda-btn';
      btn.textContent = name;

      // Determinar si tiene acceso directo
      var hasDirectAccess = (assignedStores.indexOf(name) !== -1);

      btn.addEventListener('click', function () {
        if (hasDirectAccess) {
          _vSubtienda = name;
          _loadVentasPanel();
          return;
        }
        // Sin acceso directo → mostrar campo de código de emergencia
        _toggleEmergencyField(btnWrap, name, todayStr);
      });

      btnWrap.appendChild(btn);
      wrap.appendChild(btnWrap);
    });

    body.appendChild(wrap);
  }

  // ── Mostrar/ocultar campo de código de emergencia bajo un botón ──
  function _toggleEmergencyField(btnWrap, storeName, todayStr) {
    // Si ya hay un campo abierto para esta tienda, cerrarlo
    var existing = btnWrap.querySelector('.v-emergency-wrap');
    if (existing) { existing.remove(); return; }

    // Cerrar cualquier otro campo abierto
    document.querySelectorAll('.v-emergency-wrap').forEach(function (el) { el.remove(); });

    var wrap = document.createElement('div');
    wrap.className = 'v-emergency-wrap';

    var msg = document.createElement('div');
    msg.className = 'v-emergency-msg';
    msg.textContent = 'não estás programada para ' + storeName + ' hoje';
    wrap.appendChild(msg);

    var row = document.createElement('div');
    row.className = 'v-emergency-row';

    var inp = document.createElement('input');
    inp.type        = 'number';
    inp.className   = 'v-emergency-input';
    inp.placeholder = '';
    inp.maxLength   = 5;

    var confirmBtn = document.createElement('button');
    confirmBtn.className   = 'v-emergency-confirm';
    confirmBtn.textContent = 'entrar';

    var errMsg = document.createElement('div');
    errMsg.className = 'v-emergency-err';
    errMsg.style.display = 'none';

    function _tryCode() {
      var entered  = inp.value.trim();
      var expected = _emergencyCode(storeName, todayStr);
      if (entered === expected) {
        _vSubtienda = storeName;
        _loadVentasPanel();
      } else {
        errMsg.textContent = '✗ código incorrecto';
        errMsg.style.display = 'block';
        inp.value = '';
        inp.focus();
      }
    }

    confirmBtn.addEventListener('click', _tryCode);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') _tryCode(); });

    row.appendChild(inp);
    row.appendChild(confirmBtn);
    wrap.appendChild(row);
    wrap.appendChild(errMsg);
    btnWrap.appendChild(wrap);

    inp.focus();
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
    if (!tienda) {
      return Promise.reject(new Error('Nenhuma loja definida. Por favor, refresque a página e volte a entrar.'));
    }
    if (typeof sbAdmin === "undefined" || !sbAdmin) {
      return Promise.reject(new Error('Ligação à base de dados não disponível. Refresque a página.'));
    }
    var cutoff = _offsetDate(-3) < SYSTEM_START ? SYSTEM_START : _offsetDate(-3);
    try {
      return sbAdmin
        .from('ventas_diarias')
        .select('*')
        .eq('tienda', tienda)
        .gte('fecha', cutoff)
        .order('fecha', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data || [];
        });
    } catch (e) {
      return Promise.reject(e);
    }
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

    // Calcular cuántos días mostrar: máx 3, pero limitado por días desde SYSTEM_START
    var today = _todayStr();
    var msPerDay = 86400000;
    var daysSinceStart = Math.floor((new Date(today) - new Date(SYSTEM_START)) / msPerDay);
    var daysToShow = Math.min(3, daysSinceStart + 1); // día 1→1, día 2→2, día 3+→3

    // Generar solo los días desde hoy hacia atrás, sin cruzar SYSTEM_START
    for (var d = 0; d < daysToShow; d++) {
      var dateStr = _offsetDate(-d);
      if (dateStr < SYSTEM_START) break;
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
      input.addEventListener('focus', function () {
        if (parseFloat(this.value) === 0) this.value = '';
      });
      input.addEventListener('blur', function () {
        if (this.value.trim() === '') { this.value = '0'; _updateTotal(); }
      });
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

    // Nombre empleada — widget multi-nombre con autocompletado
    var empGroup = document.createElement('div');
    empGroup.className = 'v-field-group';
    var empLabelRow = document.createElement('div');
    empLabelRow.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px;';
    var empLabel = document.createElement('label');
    empLabel.textContent = 'Nome da colaboradora';
    empLabel.style.margin = '0';
    var empHint = document.createElement('span');
    empHint.textContent = 'Indica o nome de todas as colaboradoras que trabalharam neste dia.';
    empHint.style.cssText = 'font-size:.72rem;color:#7a9e8a;font-style:italic;font-weight:700;letter-spacing:.01em;line-height:1.3;';
    empLabelRow.appendChild(empLabel);
    empLabelRow.appendChild(empHint);
    empGroup.appendChild(empLabelRow);
    _buildEmpleadaWidget(empGroup, rec.empleada || '');
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
    var empleada  = _getEmpleadaValue();

    if (!empleada) {
      _setStatus('⚠ indica o nome da colaboradora', 'error');
      var empWrap = document.getElementById('v-empleada-widget');
      if (empWrap) empWrap.querySelector('.v-emp-input').focus();
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

    sbAdmin
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
      'Shana': 'Shana',
      'Mezka Avenida': 'Mezka Avenida',
      'Mezka Mercado': 'Mezka Mercado',
      'Maxx': 'Maxx'
    };
    return map[store] || store;
  }

  // ── Widget multi-nombre con autocompletado ──
  function _buildEmpleadaWidget(container, existingValue) {
    // Inyectar CSS una sola vez
    if (!document.getElementById('v-emp-widget-style')) {
      var s = document.createElement('style');
      s.id = 'v-emp-widget-style';
      s.textContent =
        '#v-empleada-widget{' +
          'display:flex;flex-wrap:wrap;gap:5px;align-items:center;' +
          'min-height:40px;padding:5px 8px;border-radius:8px;cursor:text;' +
          'border:1.5px solid #d0d0d0;background:#fff;position:relative;' +
        '}' +
        '#v-empleada-widget:focus-within{border-color:#4a7c59;box-shadow:0 0 0 2px rgba(74,124,89,.15);}' +
        '.v-emp-tag{' +
          'display:inline-flex;align-items:center;gap:4px;' +
          'padding:3px 8px;border-radius:20px;font-size:.75rem;font-weight:700;' +
          'background:#1e2a22 !important;color:#b8e8c8 !important;white-space:nowrap;' +
        '}' +
        '.v-emp-tag-x{' +
          'cursor:pointer;font-size:.85rem;line-height:1;opacity:.7;' +
          'background:none !important;border:none;color:#b8e8c8 !important;padding:0;margin-left:2px;' +
        '}' +
        '.v-emp-tag-x:hover{opacity:1;}' +
        '.v-emp-input{' +
          'border:none;outline:none;background:transparent;' +
          'font-size:.82rem;min-width:120px;flex:1;padding:2px 0;' +
          'text-transform:uppercase;' +
        '}' +
        '#v-emp-dropdown{' +
          'position:absolute;top:100%;left:0;right:0;z-index:9999;' +
          'background:#fff;border:1.5px solid #4a7c59;border-top:none;' +
          'border-radius:0 0 8px 8px;box-shadow:0 4px 12px rgba(0,0,0,.12);' +
          'max-height:180px;overflow-y:auto;' +
        '}' +
        '.v-emp-option{' +
          'padding:8px 12px;font-size:.8rem;font-weight:600;cursor:pointer;' +
          'text-transform:uppercase;' +
        '}' +
        '.v-emp-option:hover,.v-emp-option.v-emp-active{background:#f0f7f3;color:#1e2a22;}';
      document.head.appendChild(s);
    }

    // Tags array (estado interno)
    var tags = [];
    if (existingValue && existingValue.trim()) {
      existingValue.split(',').forEach(function (n) {
        var t = n.trim().toUpperCase();
        if (t) tags.push(t);
      });
    }

    // Contenedor widget
    var widget = document.createElement('div');
    widget.id = 'v-empleada-widget';

    // Dropdown
    var dropdown = document.createElement('div');
    dropdown.id = 'v-emp-dropdown';
    dropdown.style.display = 'none';

    // Input de escritura
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'v-emp-input';
    inp.placeholder = tags.length ? '' : 'Nome…';
    inp.autocomplete = 'off';

    var activeIdx = -1;

    function _renderTags() {
      // Limpiar tags existentes (dejar dropdown e input)
      Array.from(widget.children).forEach(function (ch) {
        if (ch !== inp && ch !== dropdown) widget.removeChild(ch);
      });
      tags.forEach(function (tag, i) {
        var chip = document.createElement('span');
        chip.className = 'v-emp-tag';
        chip.textContent = tag;

        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'v-emp-tag-x';
        x.textContent = '×';
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          tags.splice(i, 1);
          _renderTags();
          _vDirty = true;
        });
        chip.appendChild(x);
        widget.insertBefore(chip, inp);
      });
      inp.placeholder = tags.length ? '' : 'Nome…';
    }

    function _addTag(name) {
      var clean = name.trim().toUpperCase();
      if (!clean) return;
      if (tags.indexOf(clean) === -1) tags.push(clean);
      inp.value = '';
      activeIdx = -1;
      _hideDropdown();
      _renderTags();
      _vDirty = true;
    }

    function _showDropdown(q) {
      var filtered = EMPLEADAS_LIST.filter(function (n) {
        return n.indexOf(q) === 0 && tags.indexOf(n) === -1;
      });
      // También incluir coincidencias parciales no al inicio
      EMPLEADAS_LIST.forEach(function (n) {
        if (n.indexOf(q) > 0 && filtered.indexOf(n) === -1 && tags.indexOf(n) === -1) {
          filtered.push(n);
        }
      });
      filtered = filtered.slice(0, 7);
      dropdown.innerHTML = '';
      activeIdx = -1;
      if (!filtered.length) { dropdown.style.display = 'none'; return; }
      filtered.forEach(function (name) {
        var opt = document.createElement('div');
        opt.className = 'v-emp-option';
        opt.textContent = name;
        opt.addEventListener('mousedown', function (e) {
          e.preventDefault(); // evitar blur del input
          _addTag(name);
        });
        dropdown.appendChild(opt);
      });
      dropdown.style.display = 'block';
    }

    function _hideDropdown() {
      dropdown.style.display = 'none';
      activeIdx = -1;
    }

    function _moveActive(dir) {
      var opts = dropdown.querySelectorAll('.v-emp-option');
      if (!opts.length) return;
      opts.forEach(function (o) { o.classList.remove('v-emp-active'); });
      activeIdx = (activeIdx + dir + opts.length) % opts.length;
      opts[activeIdx].classList.add('v-emp-active');
    }

    inp.addEventListener('keydown', function (e) {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); return; }
      if (e.key === ',' || e.key === '.') { e.preventDefault(); return; }
    });

    inp.addEventListener('input', function () {
      // Eliminar cualquier dígito, coma o punto que llegue por pegado u otro medio
      var cur = inp.value.replace(/[0-9.,]/g, '');
      if (cur !== inp.value) inp.value = cur;
      var q = inp.value.toUpperCase().trim();
      if (q.length < 1) { _hideDropdown(); return; }
      _showDropdown(q);
    });

    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var opts = dropdown.querySelectorAll('.v-emp-option');
        if (activeIdx >= 0 && opts[activeIdx]) {
          _addTag(opts[activeIdx].textContent);
        } else if (inp.value.trim()) {
          var val = inp.value.trim().toUpperCase();
          if (EMPLEADAS_LIST.indexOf(val) !== -1) _addTag(val);
          // Si no está en la lista, no se añade (se ignora silenciosamente)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        _moveActive(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _moveActive(-1);
      } else if (e.key === 'Backspace' && inp.value === '' && tags.length) {
        tags.pop();
        _renderTags();
        _vDirty = true;
      } else if (e.key === 'Escape') {
        _hideDropdown();
      }
    });

    inp.addEventListener('blur', function () {
      // Pequeño delay para permitir click en dropdown
      setTimeout(function () {
        var val = inp.value.trim().toUpperCase();
        if (val && EMPLEADAS_LIST.indexOf(val) !== -1) _addTag(val);
        else inp.value = '';
        _hideDropdown();
      }, 150);
    });

    // Clic en el widget enfoca el input
    widget.addEventListener('click', function () { inp.focus(); });

    widget.appendChild(inp);
    widget.appendChild(dropdown);
    _renderTags();
    container.appendChild(widget);
  }

  // "MARILIA SILVA"      → "MARILIA S."
  // "MARIA JOSE PEREIRA" → "MARIA JOSE P."
  // "MARILIA"            → "MARILIA"  (sin apellido, sin cambios)
  function _abbrevName(fullName) {
    var parts = fullName.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    var nombres  = parts.slice(0, parts.length - 1).join(' ');
    var apellido = parts[parts.length - 1];
    return nombres + ' ' + apellido.charAt(0) + '.';
  }

  // Leer el valor actual del widget como string mayúsculas separado por comas
  function _getEmpleadaValue() {
    var widget = document.getElementById('v-empleada-widget');
    if (!widget) return '';
    var tags = [];
    widget.querySelectorAll('.v-emp-tag').forEach(function (chip) {
      // El texto del chip excluye el botón ×: leer solo el primer nodo texto
      var text = '';
      chip.childNodes.forEach(function (node) {
        if (node.nodeType === 3) text += node.textContent; // nodo texto
      });
      var t = text.trim().toUpperCase();
      if (t) tags.push(t);
    });
    // Añadir lo que esté escrito en el input sin confirmar aún
    var inp = widget.querySelector('.v-emp-input');
    if (inp && inp.value.trim()) {
      var extra = inp.value.trim().toUpperCase();
      if (tags.indexOf(extra) === -1) tags.push(extra);
    }
    return tags.map(_abbrevName).join(', ');
  }

})();
