// ══════════════════════════════════════════════════════════════
//  VENTAS DIARIAS — ficheiro fundido (vista empleada + vista admin)
//  Cada vista mantém a sua própria IIFE/scope — ver nota no fundo
//  do ficheiro sobre _todayStr/_pad/_fmtEur (duplicados por design:
//  _fmtEur difere entre as duas vistas, não pode partilhar scope).
// ══════════════════════════════════════════════════════════════

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
  var _vRecords    = [];     // últimos 3 días cargados + dias partilhados (visible_extra)
  var _vRealtimeChannel = null; // canal Supabase Realtime desta loja (ver _setupRealtime)

  var SYSTEM_START = '2026-05-01'; // Primeiro dia de declaração de vendas pelas colaboradoras

  var PORTO_SUBTIENDAS = ['Shana', 'Mezka Avenida', 'Mezka Mercado', 'Maxx'];

  // Funchal unificado: label visível no botão + chave EXATA já usada em
  // ventas_diarias (tienda) para Mezka Funchal / Parfois Arcadas — tem de
  // ser esta chave, letra a letra, para continuar o histórico existente
  // em vez de criar registos paralelos.
  var FUNCHAL_STORES = [
    { label: 'Mezka Funchal',   key: 'mezka funchal' },
    { label: 'Parfois Arcadas', key: 'parfois arcadas são francisco' }
  ];

  // ── Lista de colaboradoras — carregada da mesma tabela que o gerador de
  //    recibos (recibos_funcionarias), em vez de estar fixa no código.
  //    Nomes completos, tal como estão guardados; a abreviação (ex.: "CARLA
  //    A.") aplica-se só ao mostrar/gravar (ver _abbrevName).
  var EMPLEADAS_LIST = [];
  var _empleadasLoaded = false;
  var _empleadasLoadPromise = null;

  function _loadEmpleadasList() {
    if (_empleadasLoadPromise) return _empleadasLoadPromise;
    _empleadasLoadPromise = (function () {
      if (typeof sbAdmin === 'undefined' || !sbAdmin) { _empleadasLoaded = true; return Promise.resolve(EMPLEADAS_LIST); }
      return sbAdmin
        .from('recibos_funcionarias_publica')
        .select('nome')
        .order('nome')
        .then(function (res) {
          if (res.error) throw res.error;
          EMPLEADAS_LIST = (res.data || [])
            .map(function (r) { return (r.nome || '').trim().toUpperCase(); })
            .filter(Boolean);
          _empleadasLoaded = true;
          return EMPLEADAS_LIST;
        })
        .catch(function (e) {
          console.warn('[ventas-empleada] Não foi possível carregar lista de colaboradoras:', e);
          _empleadasLoaded = true;
          return EMPLEADAS_LIST;
        });
    })();
    return _empleadasLoadPromise;
  }

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

    // Disparar já — em paralelo com o resto do carregamento do overlay —
    // para que a lista esteja pronta quando o formulário aparecer.
    _loadEmpleadasList();

    if (!_vStore) {
      var body = document.getElementById('ventas-overlay-body');
      if (body) body.innerHTML = '<div class="v-error">⚠ Loja não identificada. Por favor, refresque a página e volte a entrar com a sua senha.</div>';
      return;
    }

    if (_vStore === 'porto santo') {
      _showSubtiendasSelector();
    } else if (_vStore === 'funchal') {
      _showFunchalSelector();
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
    _teardownRealtime();
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

  // ── Descargar el CSV de horarios de Porto Santo que contiene la fecha de hoy ──
  // Estrategia: probar varios candidatos por número de semana ISO y quedarse
  // con el primero cuyo contenido incluya la fecha de hoy (DD/MM/YYYY).
  // Así funciona correctamente sin importar cuándo se publiquen los horarios.
  function _fetchScheduleCSV() {
    var today = new Date();
    var week  = _isoWeek(today);
    var base  = 'https://' + (window.SUPABASE_URL || '').replace('https://','').replace(/\/$/, '');
    var bucket = '/storage/v1/object/public/horarios/';

    // Fecha de hoy en formato DD/MM/YYYY (el mismo que aparece en el CSV)
    var todayForCheck = today.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' });

    // Candidatos: semana actual y las 2 anteriores y 2 siguientes
    var weeks = [week, week - 1, week + 1, week - 2, week + 2];
    var urls  = weeks.map(function (w) {
      return base + bucket + 'porto_s' + w + '.csv';
    });

    // Descargar cada candidato y devolver el primero que contenga la fecha de hoy
    function tryNext(idx) {
      if (idx >= urls.length) return Promise.reject(new Error('Horário não encontrado'));
      return fetch(urls[idx] + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) return tryNext(idx + 1);
          return res.text().then(function (text) {
            // Verificar que este CSV contiene la fecha de hoy
            if (text.indexOf(todayForCheck) !== -1) return text;
            // No contiene hoy → probar el siguiente
            return tryNext(idx + 1);
          });
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

  // ══════════════════════════════════════════════════════════════
  //  FUNCHAL UNIFICADO — mesma lógica de controlo de acesso por horário,
  //  mas lendo FUNCHAL.csv (um único ficheiro com todas as semanas, ao
  //  contrário do Porto Santo que tem um ficheiro por semana).
  // ══════════════════════════════════════════════════════════════

  // ── Descargar FUNCHAL.csv (mesmo bucket/base que Porto Santo) ──
  function _fetchFunchalScheduleCSV() {
    var base = 'https://' + (window.SUPABASE_URL || '').replace('https://', '').replace(/\/$/, '');
    var url  = base + '/storage/v1/object/public/horarios/FUNCHAL.csv?t=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('Horário não encontrado');
      return res.text();
    });
  }

  // ── Separar el CSV en bloques por líneas en blanco (mismo criterio que
  //    loadData usa em shared-funchal-v2.js) ──
  function _splitFunchalBlocks(csvText) {
    var lines = csvText.split(/\r?\n/).map(function (l) { return l.split(','); });
    var blocks = [], current = [];
    lines.forEach(function (row) {
      var isBlank = row.every(function (c) { return (c || '').trim() === ''; });
      if (isBlank) {
        if (current.length) { blocks.push(current); current = []; }
      } else {
        current.push(row);
      }
    });
    if (current.length) blocks.push(current);
    return blocks;
  }

  // ── Nombre de la tienda en el bloque CSV → chave EXATA usada em
  //    ventas_diarias.tienda (a mesma já usada pelas 3 lojas há meses) ──
  function _funchalStoreKeyFromCsvName(name) {
    var n = (name || '').trim().toUpperCase();
    if (n.indexOf('MEZKA FUNCHAL') !== -1)   return 'mezka funchal';
    if (n.indexOf('PARFOIS ARCADAS') !== -1) return 'parfois arcadas são francisco';
    return null;
  }

  // ── Detectar en qué tienda(s) del funchal unificado trabaja hoy la
  //    colaboradora, según FUNCHAL.csv. Devuelve array de keys (puede
  //    ser vacío, o incluir las dos si tiene reforço nos dois lados hoje) ──
  function _getAssignedFunchalStoresForToday(csvText, employeeName) {
    if (!employeeName) return [];

    var today    = new Date();
    var todayStr = today.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var empFirst = employeeName.split(/[\s.]/)[0].toUpperCase();
    var skipValues = ['FOLGA', 'FERIAS', ''];

    var blocks   = _splitFunchalBlocks(csvText);
    var assigned = [];

    blocks.forEach(function (block) {
      if (block.length < 3) return; // cabecera(2) + ao menos 1 pessoa(2 filas)

      var storeKey = _funchalStoreKeyFromCsvName((block[0] && block[0][0]) || '');
      if (!storeKey || assigned.indexOf(storeKey) !== -1) return;

      var dateRow = block[1] || [];
      var todayColIdx = -1;
      for (var c = 1; c < dateRow.length; c++) {
        if ((dateRow[c] || '').trim() === todayStr) { todayColIdx = c; break; }
      }
      if (todayColIdx < 0) return; // este bloque não é da semana atual

      var dataRows = block.slice(2);
      for (var i = 0; i + 1 < dataRows.length; i += 2) {
        var rowA = dataRows[i], rowB = dataRows[i + 1];
        var firstToken = (rowA[0] || '').split(/[\s.]/)[0].toUpperCase();
        if (firstToken !== empFirst) continue;

        var valA = (rowA[todayColIdx] || '').trim().toUpperCase();
        var valB = (rowB[todayColIdx] || '').trim().toUpperCase();

        var isScheduled = false;
        if (valA && skipValues.indexOf(valA) === -1 && /\d{2}:\d{2}/.test(valA)) isScheduled = true;
        if (!isScheduled && valB && skipValues.indexOf(valB) === -1 && /\d{2}:\d{2}/.test(valB)) isScheduled = true;

        if (isScheduled) { assigned.push(storeKey); }
        break; // já encontrámos a linha desta colaboradora neste bloco
      }
    });

    return assigned;
  }

  // ── Selector de loja (funchal unificado) — con control de acceso por
  //    horario, mesmo modelo do Porto Santo mas com 2 botões ──
  function _showFunchalSelector() {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '<div class="v-loading">a verificar horário…</div>';

    var empName = (window._currentEmployeeName || '').trim().toUpperCase();

    _fetchFunchalScheduleCSV()
      .then(function (csvText) {
        var assignedStores = _getAssignedFunchalStoresForToday(csvText, empName);
        _renderStoreSelectorWithAccess(FUNCHAL_STORES, assignedStores);
      })
      .catch(function () {
        // Si falla la descarga del CSV, sin acceso directo para ninguém →
        // cai para o código de emergência em ambos os botões (mesmo
        // comportamento de fail-safe que o Porto Santo já tem).
        _renderStoreSelectorWithAccess(FUNCHAL_STORES, []);
      });
  }

  // ── Renderizar los 4 botones con lógica de acceso (Porto Santo) ──
  function _renderSubtiendasWithAccess(assignedStores, csvText) {
    _renderStoreSelectorWithAccess(
      PORTO_SUBTIENDAS.map(function (name) { return { label: name, key: name }; }),
      assignedStores
    );
  }

  // ── Núcleo genérico e partilhado do seletor de lojas com controlo de
  //    acesso por horário — recebe [{label,key}] + a lista de keys com
  //    acesso direto hoje. Usado pelo Porto Santo (4 sub-lojas, label===key)
  //    e pelo funchal (2 lojas, key = chave exata já usada em ventas_diarias),
  //    sem duplicar a lógica de UI/emergência.
  function _renderStoreSelectorWithAccess(storeDefs, assignedStores) {
    var body = document.getElementById('ventas-overlay-body');
    body.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'v-subtienda-selector';

    var title = document.createElement('p');
    title.className = 'v-selector-title';
    title.textContent = 'seleciona a loja';
    wrap.appendChild(title);

    var todayStr = _todayStr(); // YYYY-MM-DD para el código de emergencia

    storeDefs.forEach(function (def) {
      var btnWrap = document.createElement('div');
      btnWrap.className = 'v-subtienda-btn-wrap';

      var btn = document.createElement('button');
      btn.className = 'v-subtienda-btn';
      btn.textContent = def.label;

      // Determinar si tiene acceso directo
      var hasDirectAccess = (assignedStores.indexOf(def.key) !== -1);

      btn.addEventListener('click', function () {
        if (hasDirectAccess) {
          _vSubtienda = def.key;
          _loadVentasPanel();
          return;
        }
        // Sin acceso directo → mostrar campo de código de emergencia
        _toggleEmergencyField(btnWrap, def.key, todayStr, def.label);
      });

      btnWrap.appendChild(btn);
      wrap.appendChild(btnWrap);
    });

    body.appendChild(wrap);
  }

  // ── Mostrar/ocultar campo de código de emergencia bajo un botón ──
  function _toggleEmergencyField(btnWrap, storeName, todayStr, displayLabel) {
    // Si ya hay un campo abierto para esta tienda, cerrarlo
    var existing = btnWrap.querySelector('.v-emergency-wrap');
    if (existing) { existing.remove(); return; }

    // Cerrar cualquier otro campo abierto
    document.querySelectorAll('.v-emergency-wrap').forEach(function (el) { el.remove(); });

    var wrap = document.createElement('div');
    wrap.className = 'v-emergency-wrap';

    var msg = document.createElement('div');
    msg.className = 'v-emergency-msg';
    msg.textContent = 'não estás programada para ' + (displayLabel || storeName) + ' hoje';
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

    function _tryCode() {
      var entered  = inp.value.trim();
      var expected = _emergencyCode(storeName, todayStr);
      if (entered === expected) {
        _vSubtienda = storeName;
        _loadVentasPanel();
      } else {
        errMsg.textContent = '✗ código incorrecto';
        errMsg.classList.add('show');
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

    // Atualização em tempo real: dias marcados como visíveis pela
    // administração aparecem aqui sem recarregar a página.
    _setupRealtime(_vSubtienda || _vStore);

    _fetchRecords().then(function (rows) {
      _vRecords = rows;
      _renderPanel(rows);
      _startAutosave();
    }).catch(function (err) {
      body.innerHTML = '<div class="v-error">⚠ Erro ao carregar: ' + err.message + '</div>';
    });
  }

  // ── Fetch últimos 3 días de esta tienda + qualquer dia marcado pela
  //    administração como visible_extra=true (partilhado manualmente,
  //    mesmo que fora da janela normal dos últimos 3 dias) ──
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
        .or('fecha.gte.' + cutoff + ',visible_extra.eq.true')
        .order('fecha', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data || [];
        });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // ── Supabase Realtime: mantém a área da colaboradora sincronizada com o
  //    que a administração fizer (sobretudo o toggle de visible_extra),
  //    sem recarregar a página nem tocar no formulário aberto. ──
  function _teardownRealtime() {
    if (_vRealtimeChannel) {
      try {
        if (typeof sbAdmin !== 'undefined' && sbAdmin && typeof sbAdmin.removeChannel === 'function') {
          sbAdmin.removeChannel(_vRealtimeChannel);
        } else if (typeof _vRealtimeChannel.unsubscribe === 'function') {
          _vRealtimeChannel.unsubscribe();
        }
      } catch (e) {}
      _vRealtimeChannel = null;
    }
  }

  function _setupRealtime(tienda) {
    _teardownRealtime();
    if (!tienda || typeof sbAdmin === 'undefined' || !sbAdmin || typeof sbAdmin.channel !== 'function') return;
    try {
      _vRealtimeChannel = sbAdmin
        .channel('ventas-live-' + tienda.replace(/[^a-z0-9]/gi, '-') + '-' + Date.now())
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'ventas_diarias', filter: 'tienda=eq.' + tienda },
          function (payload) {
            var row = payload && (payload.new || payload.old);
            if (row) _applyRealtimeRow(row);
          }
        )
        .subscribe();
    } catch (e) {
      // Realtime indisponível — a app continua a funcionar, só sem
      // atualização automática (a colaboradora vê ao reabrir o overlay).
    }
  }

  // ── Aplica uma alteração chegada por Realtime: atualiza a linha do dia
  //    (se estiver na janela normal, visível) e a secção de dias extra —
  //    nunca mexe no formulário que a colaboradora possa ter aberto. ──
  function _applyRealtimeRow(newRow) {
    if (!newRow || !newRow.fecha) return;
    var idx = _vRecords.findIndex(function (r) { return r.fecha === newRow.fecha; });
    if (idx >= 0) _vRecords[idx] = newRow; else _vRecords.push(newRow);

    var recentDates = _recentWindowDates();
    if (recentDates.indexOf(newRow.fecha) !== -1 &&
        document.querySelector('.v-hist-row[data-date="' + newRow.fecha + '"]')) {
      _refreshHistRow(newRow.fecha, newRow);
    }
    _renderExtraDays(_vRecords, recentDates);
  }

  // ── Renderizar panel ──
  // ── Datas da janela normal (máx 3, limitada por SYSTEM_START) ──
  function _recentWindowDates() {
    var today = _todayStr();
    var msPerDay = 86400000;
    var daysSinceStart = Math.floor((new Date(today) - new Date(SYSTEM_START)) / msPerDay);
    var daysToShow = Math.min(3, daysSinceStart + 1); // día 1→1, día 2→2, día 3+→3

    var dates = [];
    for (var d = 0; d < daysToShow; d++) {
      var dateStr = _offsetDate(-d);
      if (dateStr < SYSTEM_START) break;
      dates.push(dateStr);
    }
    return dates;
  }

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

    var recentDates = _recentWindowDates();
    recentDates.forEach(function (dateStr, d) {
      var rec = rows.find(function (r) { return r.fecha === dateStr; }) || null;
      var dayEl = _buildHistRow(dateStr, rec, d === 0);
      histSection.appendChild(dayEl);
    });
    body.appendChild(histSection);

    // ── Dias partilhados pela administração fora da janela normal ──
    var extraSection = document.createElement('div');
    extraSection.id = 'v-hist-extra';
    extraSection.className = 'v-hist-section';
    body.appendChild(extraSection);
    _renderExtraDays(rows, recentDates);

    // ── Formulario ──
    var formSection = document.createElement('div');
    formSection.id = 'v-form-section';
    formSection.className = 'v-form-section';
    body.appendChild(formSection);

    // Por defecto abrir el formulario del día de hoy
    _openForm(_todayStr(), rows.find(function (r) { return r.fecha === _todayStr(); }) || null);
  }

  // ── Secção "partilhado pela administração": mostra dias marcados
  //    manualmente como visible_extra=true que caem fora da janela normal
  //    dos últimos 3 dias. Reconstrói-se sempre a partir de _vRecords,
  //    incluindo quando chamada por uma atualização Realtime. ──
  function _renderExtraDays(rows, recentDates) {
    var extraSection = document.getElementById('v-hist-extra');
    if (!extraSection) return;

    var extraRows = rows.filter(function (r) {
      return r && r.visible_extra && recentDates.indexOf(r.fecha) === -1;
    }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    extraSection.innerHTML = '';
    if (!extraRows.length) return;

    var extraTitle = document.createElement('div');
    extraTitle.className = 'v-section-label';
    extraTitle.textContent = 'PARTILHADO PELA ADMINISTRAÇÃO';
    extraSection.appendChild(extraTitle);

    extraRows.forEach(function (rec) {
      var dayEl = _buildHistRow(rec.fecha, rec, false);
      extraSection.appendChild(dayEl);
    });
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
    empLabelRow.className = 'v-emp-label-row';
    var empLabel = document.createElement('label');
    empLabel.textContent = 'Nome da colaboradora';
    empLabel.className = 'v-emp-label';
    var empHint = document.createElement('span');
    empHint.textContent = 'Indica o nome de todas as colaboradoras que trabalharam neste dia.';
    empHint.className = 'v-emp-hint';
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

    // Tags array (estado interno) — guarda o nome COMPLETO tal como vem da
    // base de dados (não abreviado), para que a comparação/duplicação e a
    // pesquisa no dropdown continuem exactas. A abreviação só se aplica ao
    // desenhar o chip (_renderTags) e ao gravar (_getEmpleadaValue).
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

    // Input de escritura
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'v-emp-input';
    inp.placeholder = tags.length ? '' : 'Nome…';
    inp.autocomplete = 'off';

    var activeIdx = -1;
    var _lastQuery = '';

    function _renderTags() {
      // Limpiar tags existentes (dejar dropdown e input)
      Array.from(widget.children).forEach(function (ch) {
        if (ch !== inp && ch !== dropdown) widget.removeChild(ch);
      });
      tags.forEach(function (tag, i) {
        var chip = document.createElement('span');
        chip.className = 'v-emp-tag';
        // Mostrar a forma abreviada (ex.: "CARLA A."), guardando o nome
        // completo em tags[] para efeitos de comparação/gravação.
        chip.textContent = _abbrevName(tag);

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
      if (!filtered.length) {
        // Lista ainda a carregar (primeira vez) → mostrar estado, não "sem resultados"
        if (!_empleadasLoaded && !EMPLEADAS_LIST.length) {
          var loadingOpt = document.createElement('div');
          loadingOpt.className = 'v-emp-option v-emp-option-loading';
          loadingOpt.textContent = 'a carregar…';
          dropdown.appendChild(loadingOpt);
          dropdown.classList.add('show');
        } else {
          dropdown.classList.remove('show');
        }
        return;
      }
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
      dropdown.classList.add('show');
    }

    function _hideDropdown() {
      dropdown.classList.remove('show');
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
      _lastQuery = q;
      if (q.length < 1) { _hideDropdown(); return; }
      _showDropdown(q);
    });

    // Se a lista ainda não tinha chegado quando o campo começou a ser usado,
    // assim que chegar volta a filtrar com a última pesquisa em curso.
    _loadEmpleadasList().then(function () {
      if (document.activeElement === inp && _lastQuery) _showDropdown(_lastQuery);
    });

    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var opts = dropdown.querySelectorAll('.v-emp-option');
        if (activeIdx >= 0 && opts[activeIdx]) {
          _addTag(opts[activeIdx].textContent);
        } else if (inp.value.trim()) {
          var val = inp.value.trim().toUpperCase();
          if (EMPLEADAS_LIST.indexOf(val) !== -1) {
            _addTag(val);
          } else if (!EMPLEADAS_LIST.length) {
            // Lista indisponível (falha de rede) — não bloquear o registo.
            _addTag(val);
          }
          // Se não está na lista (e a lista carregou correctamente), ignora-se.
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
        if (val) {
          if (EMPLEADAS_LIST.indexOf(val) !== -1 || !EMPLEADAS_LIST.length) _addTag(val);
          else inp.value = '';
        }
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

  // "CARLA SOFIA DOS SANTOS ALVES" → "CARLA A."
  // "MARILIA"                     → "MARILIA"  (sin apellido, sin cambios)
  // Usa apenas o PRIMEIRO nome + a inicial do ÚLTIMO apelido — ignora
  // quaisquer nomes/apelidos do meio, mesmo com o nome completo da BD.
  function _abbrevName(fullName) {
    var parts = fullName.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    var primeiro = parts[0];
    var apellido = parts[parts.length - 1];
    return primeiro + ' ' + apellido.charAt(0) + '.';
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
    return tags.join(', ');
  }

})();

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
      el.classList.add('vadm-period-btn');
      el.classList.toggle('vadm-period-active', id === _activePeriodBtn);
    });
    ['vadm-btn-porto', 'vadm-btn-funchal', 'vadm-btn-domingos'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add('vadm-period-btn');
      el.classList.toggle('vadm-period-active', id === _activeZoneBtn);
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

    if (barTitle)  barTitle.textContent = 'ventas declaradas';
    if (adminApp)  adminApp.classList.add('module-open', 'ventas-open');

    if (panel) {
      _applyBtnStyles('vadm-btn-hoy');
      _vAdmLoadData();
    }
  };

  window.closeVentasAdmin = function () {
    var adminApp  = document.getElementById('admin-app');
    var dashboard = document.getElementById('adm-dashboard');
    var moduleBar = document.getElementById('adm-module-bar');
    var panel     = document.getElementById('adm-ventas-panel');
    var content   = document.getElementById('adm-ventas-content');

    if (adminApp) adminApp.classList.remove('module-open', 'ventas-open');
  };

  // ── Cargar datos — consulta principal + comparativa en paralelo ──
  function _vAdmLoadData() {
    var container = document.getElementById('adm-ventas-content');
    if (!container) return;
    container.innerHTML = '<div class="vadm-loading-msg">a carregar…</div>';

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
        container.innerHTML = '<div class="vadm-error-msg">⚠ Erro: ' + _esc(res.error.message) + '</div>';
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
      container.innerHTML = '<div class="vadm-error-msg">⚠ Erro de ligação</div>';
    });
  }

  // ── Render ──
  function _render(rows, container, meta) {
    container.innerHTML = '';

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
        alertDiv.className = 'vadm-alert';

        var alertTitle = document.createElement('div');
        alertTitle.className = 'vadm-alert-title';
        alertTitle.textContent = '⚠ Sin declarar hoy';
        alertDiv.appendChild(alertTitle);

        missing.forEach(function (t) {
          var item = document.createElement('div');
          item.className = 'vadm-alert-item';
          item.textContent = '· ' + (TIENDA_LABELS[t] || t);
          alertDiv.appendChild(item);
        });

        container.appendChild(alertDiv);
      }
    }

    // Sin resultados
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'vadm-empty';
      empty.textContent = 'Nenhum registo encontrado para este período.';
      container.appendChild(empty);
      return;
    }

    // ─────────────────────────────────────────────
    //  TOTAL GERAL
    // ─────────────────────────────────────────────
    var grand = document.createElement('div');
    grand.className = 'vadm-grand';

    var grandLabel = document.createElement('div');
    grandLabel.className = 'vadm-grand-label';
    grandLabel.textContent = 'TOTAL GERAL';
    grand.appendChild(grandLabel);

    var grandGrid = document.createElement('div');
    grandGrid.className = 'vadm-grand-grid';

    [
      { v: gt.numerario, l: 'Numerário', big: false },
      { v: gt.mb,        l: 'MB',        big: false },
      { v: gt.visa,      l: 'Visa',      big: false },
      { v: gt.voucher,   l: 'Voucher',   big: false },
      { v: gt.total,     l: 'Total',     big: true  }
    ].forEach(function (item) {
      var col = document.createElement('div');
      col.className = 'vadm-grand-col';

      var val = document.createElement('span');
      val.className = 'vadm-grand-val' + (item.big ? ' big' : '');
      val.textContent = _fmtEur(item.v);

      var lbl = document.createElement('em');
      lbl.className = 'vadm-grand-lbl';
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
      section.className = 'vadm-store-section';

      // ── Título: medalla ranking + nombre + barra ──
      var titleRow = document.createElement('div');
      titleRow.className = 'vadm-store-title-row';

      // Nombre tienda
      var titleText = document.createElement('span');
      titleText.className = 'vadm-store-name';
      titleText.textContent = label.toUpperCase();

      titleRow.appendChild(titleText);

      section.appendChild(titleRow);

      // ── Tabla ──
      var wrap = document.createElement('div');
      wrap.className = 'vadm-table-wrap';

      var table = document.createElement('table');
      table.className = 'vadm-table';

      // Colgroup: (visível) | Data | Num.# | MB | Visa | Voucher | Total | Obs | E*
      var cg = document.createElement('colgroup');
      [30, 88, 80, 80, 70, 70, 82, 36, 52].forEach(function () {
        cg.appendChild(document.createElement('col'));
      });
      table.appendChild(cg);

      // Cabecera
      var thead = document.createElement('thead');
      var hRow  = document.createElement('tr');
      ['','Data','Num.#','MB','Visa','Voucher','Total','Obs.','E*'].forEach(function (h, i) {
        var th = document.createElement('th');
        th.textContent = h;
        th.className = 'vadm-th';
        hRow.appendChild(th);
      });
      thead.appendChild(hRow);
      table.appendChild(thead);

      // Body
      var tbody = document.createElement('tbody');
      storeRows.forEach(function (r) {
        var isToday = (r.fecha === today);
        var tr = document.createElement('tr');
        tr.className = 'vadm-tr' + (isToday ? ' vadm-tr-today' : '');

        // ── Círculo: marca o dia como visível na área da colaboradora além
        //    da janela normal dos últimos 3 dias (coluna visible_extra em
        //    ventas_diarias). Atualiza no Supabase e reflete-se de imediato
        //    na área da colaboradora via Realtime (sem recarregar a página).
        var tdToggle = document.createElement('td');
        tdToggle.className = 'vadm-td-toggle';
        (function (row) {
          var isOn = !!row.visible_extra;
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'vadm-visible-dot';
          function _paint() {
            dot.title = isOn
              ? 'visível na área da colaboradora (clicar para ocultar)'
              : 'clicar para tornar visível na área da colaboradora';
            dot.classList.toggle('is-on', isOn);
          }
          _paint();
          dot.addEventListener('click', function () {
            var novo = !isOn;
            dot.disabled = true;
            sbAdmin.from('ventas_diarias').update({ visible_extra: novo })
              .eq('tienda', row.tienda).eq('fecha', row.fecha)
              .then(function (res) {
                dot.disabled = false;
                if (res.error) { alert('Erro ao atualizar: ' + res.error.message); return; }
                row.visible_extra = novo;
                isOn = novo;
                _paint();
              })
              .catch(function () { dot.disabled = false; alert('Erro de ligação.'); });
          });
          tdToggle.appendChild(dot);
        })(r);
        tr.appendChild(tdToggle);

        // Celda observaciones
        var obsText = (r.observaciones || '').trim();
        var hasObs  = obsText && obsText !== '—';
        var obsHtml = hasObs
          ? '<span class="vadm-obs-star" data-obs="' + _esc(obsText) + '">✱</span>'
          : '<span class="vadm-cell-dash">—</span>';

        // Celda colaboradora con lógica de asterisco tooltip
        var empText = (r.empleada || '').trim();
        var hasEmp  = empText && empText !== '—';
        var empHtml = hasEmp
          ? '<span class="vadm-obs-star vadm-obs-star-emp" data-obs="' + _esc(empText) + '">✱</span>'
          : '<span class="vadm-cell-dash">—</span>';

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
          td.className = 'vadm-td' + (c.bold ? ' bold' : '') + (c.emp ? ' emp' : '');
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
          { v: '',                     center: false },
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
          td.className = 'vadm-subtotal-td' + (c.bold ? ' bold' : '') + (c.center ? ' center' : ' left');
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
      if (!star) { tip.classList.remove('show'); return; }
      tip.textContent = star.getAttribute('data-obs') || '';
      tip.classList.add('show');
      var x = e.clientX + 14, y = e.clientY - 10;
      var rect = tip.getBoundingClientRect();
      if (x + rect.width  > window.innerWidth  - 10) x = e.clientX - rect.width  - 14;
      if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - 10;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    });
    container.addEventListener('mouseleave', function () {
      var tip = document.getElementById('vadm-tip-global');
      if (tip) tip.classList.remove('show');
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
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
