// ══════════════════════════════════════════════════════════════
//  VENTAS DIARIAS + HISTÓRICO DE VENDAS — ficheiro fundido
//  (vista empleada + vista admin de ventas + histórico admin)
//  Cada vista/módulo mantém a sua própria IIFE/scope — ver nota no
//  fundo do ficheiro sobre _todayStr/_pad/_fmtEur (duplicados por
//  design: cada bloco tem a sua própria versão, com pequenas
//  diferenças entre si — nunca podem partilhar scope).
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
  function _fmtNumber(v) { var n=parseFloat(v||0).toFixed(2),parts=n.split('.'); parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return parts[0]+','+parts[1]; }
  function _dowStr(s) { return DIAS_PT[_strToDate(s).getDay()]; }

  // Devuelve todas las fechas de domingo (YYYY-MM-DD) del calendario de un mes dado.
  // year: número, month: 1-12. Independiente de si hubo ventas o no.
  function _domingosCalendarioMes(year, month) {
    var out = [];
    var d = new Date(year, month - 1, 1);
    while (d.getMonth() === month - 1) {
      if (d.getDay() === 0) out.push(_dateToStr(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

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
  var _equalDates = true;

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

  // Inyecta el HTML del módulo dentro de #admin-app si aún no existe
  function _injectHTML(){
    if(document.getElementById('adm-historico-panel')) return;
    var adminApp=document.getElementById('admin-app');
    if(!adminApp) return;

    var panel=document.createElement('div');
    panel.id='adm-historico-panel';
    panel.innerHTML=
      '<div class="hadm-filter-container">'+

        // ── FILA 1: Total · Ano ──
        '<div class="hadm-row">'+
          '<button id="hadm-btn-total">Total</button>'+
          '<span class="hadm-dot">·</span>'+
          '<button id="hadm-btn-ano">Ano</button>'+
        '</div>'+

        // conector vertical
        '<div class="hadm-cv"></div>'+

        // ── FILA 2: T1 T2 T3 T4 · Mes ──
        '<div class="hadm-row">'+
          '<button id="hadm-btn-q1">T1</button>'+
          '<button id="hadm-btn-q2">T2</button>'+
          '<button id="hadm-btn-q3">T3</button>'+
          '<button id="hadm-btn-q4">T4</button>'+
          '<span class="hadm-dot">·</span>'+
          '<button id="hadm-btn-mes">Mes</button>'+
        '</div>'+

        // ── DIVISOR ZONAS ──
        '<div class="hadm-zdiv"><div class="hadm-zdiv-line"></div><span>zonas</span><div class="hadm-zdiv-line"></div></div>'+

        // ── ÁRBOL DE ZONAS ──
        // Parfois y Primavera en la misma fila
        '<div class="hadm-zone-roots">'+

          // ── PARFOIS ──
          '<div class="hadm-zbranch">'+
            '<button id="hadm-btn-parfois">Parfois</button>'+
            '<div class="hadm-connector-wrap hadm-conn-2">'+
              '<div class="hadm-conn-v"></div>'+
              '<div class="hadm-conn-h"></div>'+
              '<div class="hadm-conn-vl"></div>'+
              '<div class="hadm-conn-vr"></div>'+
            '</div>'+
            '<div class="hadm-zleaves">'+
              '<button id="hadm-btn-parfois-arc">Parfois Arcadas</button>'+
              '<button id="hadm-btn-parfois-mad">Parfois Madeira</button>'+
            '</div>'+
          '</div>'+

          // ── PRIMAVERA ──
          '<div class="hadm-zbranch hadm-prima-branch">'+
            '<button id="hadm-btn-primavera" class="hadm-prima-root">Primavera</button>'+
            '<div class="hadm-prima-children">'+
              // Fila 1: Funchal + Porto Santo (centro de esta fila = posición de Primavera)
              '<div class="hadm-prima-top">'+
                '<button id="hadm-btn-mezkafnc">Mezka Funchal</button>'+
                '<button id="hadm-btn-mezkaps" class="hadm-porto-root">Mezka Porto Santo</button>'+
              '</div>'+
              // Fila 2: las 4 sub-tiendas de Porto Santo
              '<div class="hadm-porto-children">'+
                '<button id="hadm-btn-mezkaavenida">Mezka Avenida</button>'+
                '<button id="hadm-btn-mezkamercado">Mezka Mercado</button>'+
                '<button id="hadm-btn-shana">Shana</button>'+
                '<button id="hadm-btn-maxx">Maxx</button>'+
              '</div>'+
            '</div>'+
          '</div>'+

        '</div>'+

        // ── DOMINGO PS ──
        '<div class="hadm-zdiv"><div class="hadm-zdiv-line"></div><span>especial</span><div class="hadm-zdiv-line"></div></div>'+
        '<div class="hadm-row">'+
          '<button id="hadm-btn-domingo">Domingo Ps</button>'+
        '</div>'+

        // ── CONTROLES FECHA / LOJA ──
        '<div class="hadm-row hadm-row-dates">'+
          '<div class="hadm-filter-group hadm-date-group">'+
            '<label>De</label>'+
            '<input type="date" id="hadm-from">'+
          '</div>'+
          '<div class="hadm-filter-group hadm-date-group">'+
            '<label>Até</label>'+
            '<input type="date" id="hadm-to">'+
          '</div>'+
          '<div class="hadm-filter-group">'+
            '<label>Loja</label>'+
            '<select id="hadm-loja">'+
              '<option value="">todas as lojas</option>'+
              '<option value="MAXX">Maxx</option>'+
              '<option value="MEZKA AVENIDA">Mezka Avenida</option>'+
              '<option value="MEZKA FUNCHAL">Mezka Funchal</option>'+
              '<option value="MEZKA MERCADO">Mezka Mercado</option>'+
              '<option value="PARFOIS ARCADAS SAO FRANCISCO">Parfois Arcadas</option>'+
              '<option value="PARFOIS MADEIRA SHOPPING">Madeira Shopping</option>'+
              '<option value="SHANA">Shana</option>'+
            '</select>'+
          '</div>'+
          '<button class="hadm-buscar-btn" id="hadm-buscar-btn">pesquisar</button>'+
        '</div>'+

        // ── TABS ──
        '<div class="hadm-row">'+
          '<button id="hadm-tab-vendas">📋 Vendas</button>'+
          '<button id="hadm-tab-carregar">➕ Carregar dados</button>'+
          '<button id="hadm-tab-proyeccion">📈 Projecção</button>'+
          '<button id="hadm-tab-premios">€ Prémios</button>'+
        '</div>'+

      '</div>'+
      '<div id="hadm-content"></div>';
    adminApp.appendChild(panel);

    // Modal de trazabilidad (también del módulo)
    if(!document.getElementById('hadm-traza-overlay')){
      var overlay=document.createElement('div');
      overlay.id='hadm-traza-overlay';
      overlay.innerHTML=
        '<div id="hadm-traza-modal">'+
          '<button id="hadm-traza-close" title="Fechar">✕</button>'+
          '<div id="hadm-traza-body"></div>'+
        '</div>';
      adminApp.appendChild(overlay);
    }
  }

  window.openHistoricoAdmin = function () {
    _injectHTML(); // Crear el HTML del módulo si no existe
    _attachListeners(); // Enganchar listeners una sola vez
    var adminApp=document.getElementById('admin-app');
    var dashboard=document.getElementById('adm-dashboard');
    var barTitle=document.getElementById('adm-module-bar-title');
    var panel=document.getElementById('adm-historico-panel');
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
    if(dashboard) dashboard.style.display='none';
    if(barTitle)  barTitle.textContent='histórico de vendas';
    if(adminApp)  adminApp.classList.add('module-open','historico-open');
    if(panel){
      // Wrapper de scroll interno: envuelve filtros + contenido para que suban juntos
      var sw=document.getElementById('hadm-scroll-wrapper');
      if(!sw){
        sw=document.createElement('div');
        sw.id='hadm-scroll-wrapper';
        while(panel.firstChild) sw.appendChild(panel.firstChild);
        panel.appendChild(sw);
      }
    }
    _activeTab='vendas'; _activePeriodBtn='hadm-btn-mes'; _activeZoneBtn=null; _expanded={};
    _applyBtnStyles();
    var p=_periodMes();
    var fEl=document.getElementById('hadm-from'),tEl=document.getElementById('hadm-to');
    if(fEl) fEl.value=p.from; if(tEl) tEl.value=p.to;
    _loadAll();
  };

  window.closeHistoricoAdmin = function () {
    var adminApp=document.getElementById('admin-app');
    var dashboard=document.getElementById('adm-dashboard');
    if(dashboard) dashboard.style.display='';
    if(adminApp) adminApp.classList.remove('module-open','historico-open');
  };

  function _loadAll() {
    var c=_getContent();
    if(c){c.innerHTML='<div class="hadm-loading-msg">a carregar dados históricos…</div>';_setupContent(c);}
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
          c.innerHTML='<div class="hadm-loading-msg">a carregar… '+loaded+' registos</div>';
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
    if(_activeTab==='premios')    _renderPremios();
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
    } else if(_activePeriodBtn&&_activePeriodBtn!=='hadm-btn-total'){
      // Calcular from según el botón activo, pero usar lastDay (calculado con zonaLojas) como to
      var tD=_strToDate(lastDay);
      var fromVal;
      if(_activePeriodBtn==='hadm-btn-7')   { var fd=new Date(tD);fd.setDate(tD.getDate()-6); fromVal=_dateToStr(fd); }
      else if(_activePeriodBtn==='hadm-btn-30')  { var fd=new Date(tD);fd.setDate(tD.getDate()-29); fromVal=_dateToStr(fd); }
      else if(_activePeriodBtn==='hadm-btn-90')  { var fd=new Date(tD);fd.setDate(tD.getDate()-89); fromVal=_dateToStr(fd); }
      else if(_activePeriodBtn==='hadm-btn-mes') { fromVal=_dateToStr(new Date(tD.getFullYear(),tD.getMonth(),1)); }
      else if(_activePeriodBtn==='hadm-btn-ano') { fromVal=tD.getFullYear()+'-01-01'; }
      else if(_activePeriodBtn==='hadm-btn-q1')  { fromVal=tD.getFullYear()+'-01-01'; }
      else if(_activePeriodBtn==='hadm-btn-q2')  { fromVal=tD.getFullYear()+'-04-01'; }
      else if(_activePeriodBtn==='hadm-btn-q3')  { fromVal=tD.getFullYear()+'-07-01'; }
      else if(_activePeriodBtn==='hadm-btn-q4')  { fromVal=tD.getFullYear()+'-10-01'; }
      else { fromVal=_getFilters().from; }
      
      // Para Q: limitar siempre al fin real del trimestre; si el Q aún no terminó, limitar a lastDay
      var toVal=lastDay;
      var isQBtn=['hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4'].indexOf(_activePeriodBtn)>=0;
      if(isQBtn){
        var qEndDates={'hadm-btn-q1':'03-31','hadm-btn-q2':'06-30','hadm-btn-q3':'09-30','hadm-btn-q4':'12-31'};
        var qEndStr=tD.getFullYear()+'-'+qEndDates[_activePeriodBtn];
        // Si el trimestre aún no empezó → ventana completa hacia adelante (fin del trimestre)
        // Si ya terminó → fin del trimestre exacto · si está en curso → lastDay (último día con datos)
        if(fromVal>lastDay) toVal=qEndStr;
        else                toVal=qEndStr<lastDay?qEndStr:lastDay;
      }
      
      f={from:fromVal, to:toVal};
      // Sincronizar inputs
      var fEl2=document.getElementById('hadm-from'),tEl2=document.getElementById('hadm-to');
      if(fEl2)fEl2.value=f.from;
      if(tEl2)tEl2.value=f.to;
    } else {
      f=_getFilters();
      if(f.to>=_todayStr()) f={from:f.from, to:lastDay};
    }

    // Para el header: ventas del período seleccionado (zona filtrada)
    var periodRows=rows.filter(function(r){return r.data>=f.from&&r.data<=f.to;});
    var periodTotal=periodRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
    var nDays=Math.round((_strToDate(f.to)-_strToDate(f.from))/86400000)+1;
    var diasRestantes='';
    // Si es Q1-Q4 y estamos en medio del trimestre, mostrar dias restantes
    if(['hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4'].indexOf(_activePeriodBtn)>=0 && !isTotal){
      var today=_strToDate(_todayStr());
      // Usar la fecha real de fin de trimestre, no lastDay
      var qEndDates={'hadm-btn-q1':'03-31','hadm-btn-q2':'06-30','hadm-btn-q3':'09-30','hadm-btn-q4':'12-31'};
      var qEndDateStr=today.getFullYear()+'-'+qEndDates[_activePeriodBtn];
      var qEnd=_strToDate(qEndDateStr);
      if(today<qEnd){
        var dr=Math.round((qEnd-today)/86400000);
        if(dr>0) diasRestantes=', faltan '+dr+' para terminar T';
      }
    }
    var dataLabel=isTotal?'TOTAL HISTÓRICO':(_fmtDate(f.from)+' → '+_fmtDate(f.to)+(isToday?' · até hoje':' · até ontem')+' ('+nDays+' dias'+diasRestantes+')'+(_equalDates?' · datas exactas':''));
    var comps=_equalDates?_buildComparisonsExact(f.from,f.to,rows):_buildComparisons(f.from,f.to,rows);

    // Header resumen
    var hdr=_el('div','hadm-hdr');
    hdr.classList.add('hadm-hdr-c');

    // Botón = (toggle modo fechas exactas)
    if(!isTotal){
      var eqBtn=_el('div','hadm-eq-btn');
      eqBtn.title=_equalDates?'Modo: mesmas datas exactas':'Modo: mesmo dia de semana';
      eqBtn.classList.add(_equalDates?'hadm-eq-btn-active':'hadm-eq-btn-inactive');
      eqBtn.textContent='=';
      eqBtn.addEventListener('mouseenter',function(){
        if(!_equalDates){eqBtn.classList.add('hadm-eq-btn-hover');}
      });
      eqBtn.addEventListener('mouseleave',function(){
        if(!_equalDates){eqBtn.classList.remove('hadm-eq-btn-hover');}
      });
      eqBtn.addEventListener('click',function(){_equalDates=!_equalDates;_render();});
      hdr.appendChild(eqBtn);
    }

    var hLbl=_el('div','hadm-h-lbl');
    hLbl.classList.add('hadm-h-lbl-c');
    hLbl.textContent=dataLabel;
    hdr.appendChild(hLbl);

    // ── Fila principal: izquierda=total, derecha=proyección
    var hMainRow=_el('div','hadm-h-main-row');

    // Columna izquierda — total + media
    var hLeft=_el('div','hadm-h-left');
    var hVal=_el('div','hadm-h-val');
    hVal.classList.add('hadm-h-val-c');
    hVal.textContent=_fmtEur(periodTotal);
    hLeft.appendChild(hVal);
    var hSub=_el('div','hadm-h-sub');
    hSub.classList.add('hadm-h-sub-c');
    hSub.textContent=(isTotal?periodRows.length+' registos':'Média diária: '+_fmtEur(periodTotal/nDays)+' · '+periodRows.length+' registos');
    hLeft.appendChild(hSub);
    hMainRow.appendChild(hLeft);

    // Columna derecha — proyección (solo períodos en curso, no Total, no búsqueda manual)
    var _proyBtns=['hadm-btn-mes','hadm-btn-ano','hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4'];
    var _isPeriodoCurso=_proyBtns.indexOf(_activePeriodBtn)>=0;

    // Calcular fin real del período (Q y Ano van hasta su fin natural, no lastDay)
    var _projTo=f.to;
    var _todayNow=_todayStr();
    if(_activePeriodBtn==='hadm-btn-q1') _projTo=_strToDate(f.from).getFullYear()+'-03-31';
    else if(_activePeriodBtn==='hadm-btn-q2') _projTo=_strToDate(f.from).getFullYear()+'-06-30';
    else if(_activePeriodBtn==='hadm-btn-q3') _projTo=_strToDate(f.from).getFullYear()+'-09-30';
    else if(_activePeriodBtn==='hadm-btn-q4') _projTo=_strToDate(f.from).getFullYear()+'-12-31';
    else if(_activePeriodBtn==='hadm-btn-ano') _projTo=_strToDate(f.from).getFullYear()+'-12-31';
    else if(_activePeriodBtn==='hadm-btn-mes'){
      var _mD=_strToDate(f.from);
      _projTo=_dateToStr(new Date(_mD.getFullYear(),_mD.getMonth()+1,0));
    }
    // Período en curso = hoy está dentro del rango real del período
    var _periodoAbierto=_todayNow>=f.from&&_todayNow<=_projTo;
    var _maxxNaZonaVendas=zonaLojas.indexOf('MAXX')>=0;

    if(!isTotal&&_isPeriodoCurso&&_periodoAbierto){
      var hRight=_el('div','hadm-h-right');
      var _periodoLabel={'hadm-btn-mes':'Mês','hadm-btn-ano':'Ano','hadm-btn-q1':'T1','hadm-btn-q2':'T2','hadm-btn-q3':'T3','hadm-btn-q4':'T4'}[_activePeriodBtn]||'';

      function _buildProjBlock(proj){
        hRight.innerHTML='';
        if(!proj) return;
        var pLbl=_el('div','hadm-p-lbl');
        pLbl.classList.add('hadm-p-lbl-c');
        pLbl.textContent='Projecção '+_periodoLabel;
        hRight.appendChild(pLbl);
        var pVal=_el('div','hadm-p-val');
        pVal.classList.add('hadm-p-val-c');
        pVal.textContent=_fmtEur(proj.valorProjetado);
        hRight.appendChild(pVal);
        var pSub=_el('div','hadm-p-sub');
        pSub.classList.add('hadm-h-sub-c');
        pSub.textContent=proj.pctDone.toFixed(1)+'% concluído · '+proj.diasRestantes+' dias rest.';
        hRight.appendChild(pSub);
        var pAnos=_el('div','hadm-p-anos');
        pAnos.classList.add('hadm-p-anos-c');
        pAnos.textContent='Base: '+proj.anosBase.join(', ');
        hRight.appendChild(pAnos);
        if(proj.maxxContribFutura>0){
          var pMaxx=_el('div','hadm-p-maxx');
          pMaxx.classList.add('hadm-p-lbl-c');
          pMaxx.textContent='+ Maxx (dias restantes): '+_fmtEur(proj.maxxContribFutura);
          hRight.appendChild(pMaxx);
        }
      }

      function _doCalcProj(){
        var effectiveTodayProj=_lastCompleteDay(zonaLojas);
        if(effectiveTodayProj>_todayNow) effectiveTodayProj=_todayNow;

        // ── Caso simple: Maxx NO está en la zona → proyección normal directa
        if(!_maxxNaZonaVendas){
          var projSimple=_calcProjection(rows,f.from,_projTo,effectiveTodayProj,null);
          _buildProjBlock(projSimple);
          return;
        }

        // ── Maxx está en la zona. Detectar su rango REAL de operación este año
        // dentro del período, a partir de los datos (primer día con venta ≠ 0).
        // La realidad de los datos manda — sin configuración manual.
        var _mr=_maxxRangoReal(f.from, effectiveTodayProj);

        // Maxx sin ventas aún en el período → proyección normal de las demás
        if(!_mr){
          var projSinMaxx=_calcProjection(rows,f.from,_projTo,effectiveTodayProj,null);
          _buildProjBlock(projSinMaxx);
          return;
        }

        // ¿Maxx empezó a facturar después del inicio del período? → abrió a mitad
        var _maxxAbreEnPeriodo=_mr.desde>f.from;

        if(!_maxxAbreEnPeriodo){
          // Maxx operó desde el inicio del período igual que las demás → cálculo normal
          var projNormal=_calcProjection(rows,f.from,_projTo,effectiveTodayProj,null);
          _buildProjBlock(projNormal);
          return;
        }

        // Maxx abrió a mitad del período → separar.
        // Tiendas estables: proyección normal sobre el período completo.
        // Maxx: media diaria sobre días de CALENDARIO desde su apertura hasta hoy,
        // extendida a los días de calendario restantes. Coherente: misma unidad
        // (días calendario) en numerador y denominador → T2 ≥ Mes siempre.
        var rowsSinMaxx=rows.filter(function(r){return r.loja!=='MAXX';});
        var projBase=_calcProjection(rowsSinMaxx,f.from,_projTo,effectiveTodayProj,null);

        // Acumulado real de Maxx desde su 1er día con venta hasta hoy
        var maxxRealAcum=_allRows.filter(function(r){
          return r.loja==='MAXX'&&r.data>=_mr.desde&&r.data<=effectiveTodayProj;
        }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);

        // Días de calendario transcurridos desde apertura hasta hoy (inclusive)
        var maxxDiasTranscurridos=Math.round((_strToDate(effectiveTodayProj)-_strToDate(_mr.desde))/86400000)+1;
        if(maxxDiasTranscurridos<1) maxxDiasTranscurridos=1;
        var maxxMediaDia=maxxRealAcum/maxxDiasTranscurridos;

        // Días de calendario restantes (desde mañana hasta fin del período)
        var maxxDiasRest=0;
        if(effectiveTodayProj<_projTo){
          maxxDiasRest=Math.round((_strToDate(_projTo)-_strToDate(effectiveTodayProj))/86400000);
        }
        var maxxFuturo=maxxMediaDia*maxxDiasRest;
        var maxxProyTotal=maxxRealAcum+maxxFuturo;

        if(projBase){
          _buildProjBlock({
            realAcum: projBase.realAcum+maxxRealAcum,
            valorProjetado: projBase.valorProjetado+maxxProyTotal,
            pctDone: projBase.pctDone,
            diasRestantes: projBase.diasRestantes,
            anosBase: projBase.anosBase,
            maxxContribFutura: maxxFuturo
          });
        } else if(maxxRealAcum>0){
          // Maxx es la única tienda
          var maxxTotalDiasPeriodo=maxxDiasTranscurridos+maxxDiasRest;
          _buildProjBlock({
            realAcum: maxxRealAcum,
            valorProjetado: maxxProyTotal,
            pctDone: maxxTotalDiasPeriodo>0?(maxxDiasTranscurridos/maxxTotalDiasPeriodo*100):0,
            diasRestantes: maxxDiasRest,
            anosBase: ['ritmo Maxx'],
            maxxContribFutura: maxxFuturo
          });
        } else {
          _buildProjBlock(null);
        }
      }

      // La detección del rango de Maxx es directa desde _allRows (ya en memoria),
      // no requiere cargar configuración manual.
      _doCalcProj();

      hMainRow.appendChild(hRight);
    }

    hdr.appendChild(hMainRow);

    if(!isTotal&&comps.length){
      var cRow=_el('div','hadm-c-row');
      comps.forEach(function(comp,idx){
        var cRows=rows.filter(function(r){return r.data>=comp.from&&r.data<=comp.to;});
        var cTotal=cRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var diff=cTotal>0?(periodTotal-cTotal)/cTotal*100:null;
        var diffEur=periodTotal-cTotal;
        var cBox=_el('div','hadm-c-box');
        // Separador superior en cada fila nueva (cada 3 items excepto la primera fila)
        if(idx>=3){
          cBox.classList.add('hadm-c-box-c');
        }
        // Separador vertical entre columnas (no en la última de cada fila)
        if(idx%3!==2){
          cBox.classList.add('hadm-c-box-c--render-vendas');
        }
        var cYear=_el('div','hadm-c-year');
        cYear.classList.add('hadm-h-lbl-c');
        var yearLabel='vs '+comp.label;
        if(cTotal>0){
          var eur=_fmtEur(Math.abs(diffEur));
          yearLabel+=' ('+_fmtNumber(Math.abs(diffEur))+')';
        }
        cYear.textContent=yearLabel;
        cBox.appendChild(cYear);
        var cDates=_el('div','hadm-c-dates');
        cDates.className='hadm-comp-dates';
        cDates.classList.add('hadm-c-dates-c');
        cDates.textContent=_fmtDate(comp.from)+'→'+_fmtDate(comp.to);
        cBox.appendChild(cDates);
        var cLine=_el('div','hadm-c-line');
        var cVal=_el('span','hadm-c-val');
        cVal.classList.add('hadm-h-val-c');
        cVal.textContent=_fmtEur(cTotal);
        cLine.appendChild(cVal);
        if(diff!==null){
          var cD=_el('span','hadm-c-d');
          cD.classList.add(diff>=0?'hadm-diff-pos-a':'hadm-diff-neg-a');
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
          var bannerProy=_el('div','hadm-banner-proy');
          bannerProy.classList.add('hadm-banner-proy-c');
          var bLeft=_el('div','');
          var bLbl=_el('div','hadm-b-lbl');
          bLbl.classList.add('hadm-p-lbl-c');
          bLbl.textContent='PROJECÇÃO DO TRIMESTRE COMPLETO';
          bLeft.appendChild(bLbl);
          var bSub=_el('div','hadm-b-sub');
          bSub.classList.add('hadm-b-sub-c');
          bSub.textContent=proj.pctDone.toFixed(1)+'% completado · '+proj.diasRestantes+' dias restantes';
          bLeft.appendChild(bSub);
          bannerProy.appendChild(bLeft);
          var bVal=_el('div','hadm-b-val');
          bVal.classList.add('hadm-b-val-c');
          bVal.textContent='→ '+_fmtEur(proj.valorProjetado);
          bannerProy.appendChild(bVal);
          c.appendChild(bannerProy);
        }
      }
    }

    // Árbol — solo muestra registros del período activo (excepto Total que muestra todo)
    var treeLabel=_el('div','hadm-tree-label');
    treeLabel.classList.add('hadm-tree-label-c');
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

      var lojaRow=_el('div','hadm-loja-row');
      lojaRow.classList.add('hadm-loja-row-c');
      lojaRow.addEventListener('mouseenter',function(){this.classList.add('hadm-this-c');});
      lojaRow.addEventListener('mouseleave',function(){this.classList.remove('hadm-this-c');});
      var lojaHdr=_el('div','hadm-loja-hdr');
      var lojaNom=_el('span','hadm-loja-nom');
      lojaNom.classList.add('hadm-loja-nom-c');
      lojaNom.textContent=(lojaOpen?'▼ ':'▶ ')+lojaLabel;
      var lojaRight=_el('div','hadm-loja-right');
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
          var lojaB=_el('span','hadm-loja-b');
          lojaB.classList.add(lojaDiff>=0?'hadm-diff-pos-bg':'hadm-diff-neg-bg');
          lojaB.classList.add(lojaDiff>=0?'hadm-diff-pos-c':'hadm-diff-neg-c');
          lojaB.textContent=(lojaDiff>=0?'↑ +':'↓ ')+lojaDiff.toFixed(1)+'% vs '+prevYrLabel;
          lojaRight.appendChild(lojaB);
        }
      }
      var lojaSum=_el('span','hadm-loja-nom');
      lojaSum.classList.add('hadm-loja-nom-c');
      lojaSum.textContent=_fmtEur(lojaTotal);
      lojaRight.appendChild(lojaSum);
      lojaHdr.appendChild(lojaNom); lojaHdr.appendChild(lojaRight);
      lojaRow.appendChild(lojaHdr);
      c.appendChild(lojaRow);

      var yrsCont=_el('div','hadm-tree-branch');
      yrsCont.classList.toggle('show',lojaOpen);
      c.appendChild(yrsCont);

      lojaRow.addEventListener('click',function(){
        _expanded[lojaKey]=!_expanded[lojaKey];
        var o=_expanded[lojaKey];
        lojaNom.textContent=(o?'▼ ':'▶ ')+lojaLabel;
        yrsCont.classList.toggle('show',o);
      });

      var years=Object.keys(lojaData).sort(function(a,b){return b-a;});
      years.forEach(function(yr){
        var yrData=lojaData[yr];
        var yrTotal=_sumObj(yrData);
        var yrKey=lojaKey+':Y:'+yr;
        var yrOpen=!!_expanded[yrKey];
        var prevYr=String(parseInt(yr)-1);

        var yrRow=_el('div','hadm-yr-row');
        yrRow.classList.add('hadm-yr-row-c');
        yrRow.addEventListener('mouseenter',function(){this.classList.add('hadm-this-c--render-vendas');});
        yrRow.addEventListener('mouseleave',function(){this.classList.remove('hadm-this-c--render-vendas');});
        var yrHdr=_el('div','hadm-yr-hdr');
        var yrLbl=_el('span','hadm-yr-lbl');
        yrLbl.classList.add('hadm-yr-lbl-c');
        yrLbl.textContent=(yrOpen?'▼ ':'▶ ')+yr;
        var yrRight=_el('div','hadm-yr-right');
        if(lojaData[prevYr]){
          var prevYrT=_sumObj(lojaData[prevYr]);
          if(prevYrT>0){
            var yrDiff=(yrTotal-prevYrT)/prevYrT*100;
            var yrB=_el('span','hadm-yr-b');
            yrB.classList.add(yrDiff>=0?'hadm-diff-pos-bg':'hadm-diff-neg-bg');
            yrB.classList.add(yrDiff>=0?'hadm-diff-pos-c':'hadm-diff-neg-c');
            yrB.textContent=(yrDiff>=0?'↑ +':'↓ ')+yrDiff.toFixed(1)+'% vs '+prevYr;
            yrRight.appendChild(yrB);
          }
        }
        var yrSum=_el('span','hadm-yr-lbl');
        yrSum.classList.add('hadm-yr-lbl-c');
        yrSum.textContent=_fmtEur(yrTotal);
        yrRight.appendChild(yrSum);
        yrHdr.appendChild(yrLbl); yrHdr.appendChild(yrRight);
        yrRow.appendChild(yrHdr);
        yrsCont.appendChild(yrRow);

        var mosCont=_el('div','hadm-tree-branch');
        mosCont.classList.toggle('show',yrOpen);
        yrsCont.appendChild(mosCont);

        yrRow.addEventListener('click',function(e){
          e.stopPropagation();
          _expanded[yrKey]=!_expanded[yrKey];
          var o=_expanded[yrKey];
          yrLbl.textContent=(o?'▼ ':'▶ ')+yr;
          mosCont.classList.toggle('show',o);
        });

        var months=Object.keys(yrData).sort();
        months.forEach(function(mo){
          var moRows=yrData[mo];
          var moTotal=moRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          var moKey=yrKey+':M:'+mo;
          var moOpen=!!_expanded[moKey];
          var moName=MESES_PT[parseInt(mo)-1]||mo;

          var moRow=_el('div','hadm-mo-row');
          moRow.classList.add('hadm-mo-row-c');
          moRow.addEventListener('mouseenter',function(){this.classList.add('hadm-this-c--render-vendas-2');});
          moRow.addEventListener('mouseleave',function(){this.classList.remove('hadm-this-c--render-vendas-2');});
          var moHdr=_el('div','hadm-mo-hdr');
          var moLbl=_el('span','hadm-mo-lbl');
          moLbl.classList.add('hadm-mo-lbl-c');
          moLbl.textContent=(moOpen?'▼ ':'▶ ')+moName+' '+yr;
          var moRight=_el('div','hadm-loja-right');
          if(lojaData[prevYr]&&lojaData[prevYr][mo]){
            var prevMoT=lojaData[prevYr][mo].reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
            if(prevMoT>0){
              var moDiff=(moTotal-prevMoT)/prevMoT*100;
              var moB=_el('span','hadm-mo-b');
              moB.classList.add(moDiff>=0?'hadm-diff-pos-bg':'hadm-diff-neg-bg');
              moB.classList.add(moDiff>=0?'hadm-diff-pos-c':'hadm-diff-neg-c');
              moB.textContent=(moDiff>=0?'+':'')+moDiff.toFixed(1)+'%';
              moRight.appendChild(moB);
            }
          }
          var moSum=_el('span','hadm-mo-sum');
          moSum.classList.add('hadm-mo-lbl-c');
          moSum.textContent=_fmtEur(moTotal);
          moRight.appendChild(moSum);
          moHdr.appendChild(moLbl); moHdr.appendChild(moRight);
          moRow.appendChild(moHdr);
          mosCont.appendChild(moRow);

          var daysCont=_el('div','hadm-tree-branch');
          daysCont.classList.toggle('show',moOpen);
          mosCont.appendChild(daysCont);

          moRow.addEventListener('click',function(e){
            e.stopPropagation();
            _expanded[moKey]=!_expanded[moKey];
            var o=_expanded[moKey];
            moLbl.textContent=(o?'▼ ':'▶ ')+moName+' '+yr;
            daysCont.classList.toggle('show',o);
          });

          var daysSorted=moRows.slice().sort(function(a,b){return a.data>b.data?-1:1;});
          daysSorted.forEach(function(r){
            var dayVal=parseFloat(r.montante)||0;
            var dayRow=_el('div','hadm-day-row');
            dayRow.classList.add('hadm-yr-row-c');
            var dayL=_el('div','hadm-yr-right');
            var dayD=_el('span','hadm-day-d');
            dayD.classList.add('hadm-mo-lbl-c');
            dayD.textContent=_fmtDate(r.data);
            var dayDow=_el('span','hadm-day-dow');
            dayDow.classList.add('hadm-tree-label-c');
            dayDow.textContent=_dowStr(r.data);
            dayL.appendChild(dayD); dayL.appendChild(dayDow);
            var dayA=_el('span','hadm-day-a');
            dayA.classList.add(dayVal===0?'hadm-dayval-zero':'hadm-dayval-nonzero');
            dayA.textContent=_fmtEur(dayVal);
            dayRow.appendChild(dayL); dayRow.appendChild(dayA);
            daysCont.appendChild(dayRow);
          });

          var moTR=_el('div','hadm-mo-tr');
          moTR.classList.add('hadm-this-c--render-vendas-2');
          var moTL=_el('span','hadm-mo-tl');
          moTL.classList.add('hadm-mo-tl-c'); moTL.textContent='Total '+moName;
          var moTV=_el('span','hadm-c-d');
          moTV.classList.add('hadm-loja-nom-c'); moTV.textContent=_fmtEur(moTotal);
          moTR.appendChild(moTL); moTR.appendChild(moTV);
          daysCont.appendChild(moTR);
        });

        var yrTR=_el('div','hadm-yr-tr');
        yrTR.classList.add('hadm-yr-tr-c');
        var yrTL=_el('span','hadm-mo-tl');
        yrTL.classList.add('hadm-mo-tl-c'); yrTL.textContent='Total '+yr;
        var yrTV=_el('span','hadm-yr-tv');
        yrTV.classList.add('hadm-loja-nom-c'); yrTV.textContent=_fmtEur(yrTotal);
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
    var hdr=_el('div','hadm-hdr--render-domingo-ps');
    hdr.classList.add('hadm-hdr-c');
    var hLbl=_el('div','hadm-h-lbl--render-domingo-ps');
    hLbl.classList.add('hadm-h-lbl-c');
    hLbl.textContent='DOMINGOS '+currentYear+' — MEZKA PS (Avenida · Mercado · Shana · Maxx)';
    hdr.appendChild(hLbl);
    var hVal=_el('div','hadm-h-val');
    hVal.classList.add('hadm-h-val-c');
    hVal.textContent=_fmtEur(currentTotal);
    hdr.appendChild(hVal);
    var hSub=_el('div','hadm-h-sub');
    hSub.classList.add('hadm-h-sub-c');
    hSub.textContent=currentCount+' domingos reais';
    hdr.appendChild(hSub);

    // Comparações com anos anteriores — total vs total, 3 por fila
    var prevYears=years.filter(function(y){return y!==currentYear;});
    if(prevYears.length){
      var cRow=_el('div','hadm-c-row');
      prevYears.forEach(function(yr,idx){
        var yrRows=byYear[yr];
        var yrTotal=yrRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
        var yrCount=(function(){var d={};yrRows.forEach(function(r){d[r.data]=true;});return Object.keys(d).length;})();
        var diff=yrTotal>0?(currentTotal-yrTotal)/yrTotal*100:null;
        var diffEur=currentTotal-yrTotal;
        var cBox=_el('div','hadm-c-box');
        // Separador superior en cada fila nueva (cada 3 items)
        if(idx>=3){
          cBox.classList.add('hadm-c-box-c');
        }
        // Separador vertical entre columnas (no en la última de cada fila)
        if(idx%3!==2){
          cBox.classList.add('hadm-c-box-c--render-vendas');
        }
        var cYear=_el('div','hadm-c-year');
        cYear.classList.add('hadm-h-lbl-c');
        var yearLabel='vs '+yr+' ('+yrCount+' dom.)';
        if(yrTotal>0){
          yearLabel+=' · '+_fmtNumber(Math.abs(diffEur));
        }
        cYear.textContent=yearLabel;
        cBox.appendChild(cYear);
        var cLine=_el('div','hadm-c-line--render-domingo-ps');
        var cVal=_el('span','hadm-c-val');
        cVal.classList.add('hadm-h-val-c');
        cVal.textContent=_fmtEur(yrTotal);
        cLine.appendChild(cVal);
        if(diff!==null){
          var cD=_el('span','hadm-c-d');
          cD.classList.add(diff>=0?'hadm-diff-pos-a':'hadm-diff-neg-a');
          cD.textContent=(diff>=0?'↑ +':'↓ ')+diff.toFixed(1)+'%';
          cLine.appendChild(cD);
        }
        cBox.appendChild(cLine);
        cRow.appendChild(cBox);
      });
      hdr.appendChild(cRow);
    }
    c.appendChild(hdr);

    // ── ANÁLISE MÊS A MÊS — ano atual ──────────────────────────
    (function _renderMesAMes() {
      // Domingos do ano atual agrupados por mês
      var byMes = {};
      currentYearRows.forEach(function(r) {
        var mo = r.data.substring(5, 7);
        if (!byMes[mo]) byMes[mo] = [];
        byMes[mo].push(r);
      });
      var meses = Object.keys(byMes).sort();
      if (!meses.length) return;

      var mesCard = _el('div', 'hadm-hdr--render-domingo-ps');
      mesCard.classList.add('hadm-yr-row-c');

      var mesCardTitle = _el('div', 'hadm-mes-card-title');
      mesCardTitle.classList.add('hadm-tree-label-c');
      mesCardTitle.textContent = 'ANÁLISE MÊS A MÊS — ' + currentYear;
      mesCard.appendChild(mesCardTitle);

      meses.forEach(function(mo, idx) {
        var moRows = byMes[mo];
        // Total do mês (todas as lojas, todos os domingos do mês)
        var moTotal = moRows.reduce(function(s, r) { return s + (parseFloat(r.montante) || 0); }, 0);
        // Nº de domingos únicos neste mês
        var domDates = {};
        moRows.forEach(function(r) { domDates[r.data] = true; });
        var nDom = Object.keys(domDates).length;
        var moName = MESES_PT[parseInt(mo, 10) - 1];
        var moKey = 'DOM:MES:' + currentYear + ':' + mo;
        var moOpen = !!_expanded[moKey];

        // Separador entre meses
        if (idx > 0) {
          var sep = _el('div', 'hadm-sep');
          sep.classList.add('hadm-this-c--render-vendas-2');
          mesCard.appendChild(sep);
        }

        // Fila del mes (clickable)
        var moRow = _el('div', 'hadm-mo-row--render-domingo-ps');
        moRow.classList.add('hadm-mo-row-c--render-domingo-ps');
        moRow.addEventListener('mouseenter', function() { moRow.classList.add('hadm-this-c--render-vendas'); });
        moRow.addEventListener('mouseleave', function() { moRow.classList.remove('hadm-this-c--render-vendas'); });

        var moLeft = _el('div', 'hadm-yr-right');
        var moArrow = _el('span', 'hadm-mo-arrow');
        moArrow.classList.add('hadm-tree-label-c');
        moArrow.textContent = moOpen ? '▼' : '▶';
        var moNom = _el('span', 'hadm-c-val');
        moNom.classList.add('hadm-loja-nom-c');
        moNom.textContent = moName;
        var moBadge = _el('span', 'hadm-mo-badge');
        moBadge.classList.add('hadm-mo-badge-c');
        moBadge.textContent = nDom + ' dom.';
        moLeft.appendChild(moArrow);
        moLeft.appendChild(moNom);
        moLeft.appendChild(moBadge);

        var moRight = _el('span', 'hadm-c-val');
        moRight.classList.add('hadm-loja-nom-c');
        moRight.textContent = _fmtEur(moTotal);

        moRow.appendChild(moLeft);
        moRow.appendChild(moRight);
        mesCard.appendChild(moRow);

        // Contenedor expandible — tiendas del mes
        var moDetail = _el('div', 'hadm-mo-detail');
        moDetail.classList.toggle('show', moOpen);

        // Agrupar por loja dentro del mes
        var byLojaM = {};
        moRows.forEach(function(r) {
          if (!byLojaM[r.loja]) byLojaM[r.loja] = 0;
          byLojaM[r.loja] += (parseFloat(r.montante) || 0);
        });

        ZONA_DOMINGO.forEach(function(loja) {
          if (byLojaM[loja] === undefined) return;
          var lojaVal = byLojaM[loja];
          var lojaLabel = LOJA_LABELS[loja] || loja;
          var pct = moTotal > 0 ? (lojaVal / moTotal * 100) : 0;

          var lojaRow = _el('div', 'hadm-loja-row--render-domingo-ps');

          var lojaLeft = _el('div', 'hadm-loja-left');
          var lojaNameLine = _el('div', 'hadm-loja-name-line');
          var lojaNom = _el('span', 'hadm-day-a');
          lojaNom.classList.add('hadm-mo-lbl-c');
          lojaNom.textContent = lojaLabel;
          var lojaPct = _el('span', 'hadm-loja-pct');
          lojaPct.classList.add('hadm-tree-label-c');
          lojaPct.textContent = pct.toFixed(1) + '%';
          lojaNameLine.appendChild(lojaNom);
          lojaNameLine.appendChild(lojaPct);
          lojaLeft.appendChild(lojaNameLine);

          // Barra de progreso proporcional
          var barOuter = _el('div', 'hadm-bar-outer');
          barOuter.classList.add('hadm-this-c--render-vendas-2');
          var barInner = _el('div', 'hadm-bar-inner');
          barInner.style.setProperty('width', pct.toFixed(1) + '%', 'important');
          barInner.classList.add('hadm-bar-inner-c');
          barOuter.appendChild(barInner);
          lojaLeft.appendChild(barOuter);

          var lojaVal2 = _el('span', 'hadm-loja-val2');
          lojaVal2.classList.add('hadm-yr-lbl-c');
          lojaVal2.textContent = _fmtEur(lojaVal);

          lojaRow.appendChild(lojaLeft);
          lojaRow.appendChild(lojaVal2);
          moDetail.appendChild(lojaRow);
        });

        mesCard.appendChild(moDetail);

        // Toggle expand/collapse
        moRow.addEventListener('click', function() {
          _expanded[moKey] = !_expanded[moKey];
          var o = _expanded[moKey];
          moArrow.textContent = o ? '▼' : '▶';
          moDetail.classList.toggle('show', o);
        });
      });

      // Total general al pie del card
      var grandTotal = currentYearRows.reduce(function(s, r) { return s + (parseFloat(r.montante) || 0); }, 0);
      var totalFooter = _el('div', 'hadm-total-footer');
      var totalLbl = _el('span', 'hadm-total-lbl');
      totalLbl.classList.add('hadm-mo-tl-c');
      totalLbl.textContent = 'Total ' + currentYear + ' · ' + currentCount + ' dom.';
      var totalVal = _el('span', 'hadm-total-val');
      totalVal.classList.add('hadm-loja-nom-c');
      totalVal.textContent = _fmtEur(grandTotal);
      totalFooter.appendChild(totalLbl);
      totalFooter.appendChild(totalVal);
      mesCard.appendChild(totalFooter);

      c.appendChild(mesCard);
    })();
    // ── fin ANÁLISE MÊS A MÊS ──────────────────────────────────

    // Detalhe: cada año con sus domingos
    var treeLabel=_el('div','hadm-tree-label');
    treeLabel.classList.add('hadm-tree-label-c');
    treeLabel.textContent='DETALHE POR ANO — clique para expandir';
    c.appendChild(treeLabel);

    years.forEach(function(yr){
      var yrRows=byYear[yr].slice().sort(function(a,b){return a.data>b.data?-1:1;});
      var yrTotal=yrRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var yrKey='DOM:Y:'+yr;
      var yrOpen=!!_expanded[yrKey];

      var yrRow=_el('div','hadm-loja-row');
      yrRow.classList.add('hadm-loja-row-c');
      yrRow.addEventListener('mouseenter',function(){this.classList.add('hadm-this-c');});
      yrRow.addEventListener('mouseleave',function(){this.classList.remove('hadm-this-c');});
      var yrHdr=_el('div','hadm-loja-name-line');
      var yrNom=_el('span','hadm-loja-nom');
      yrNom.classList.add('hadm-loja-nom-c');
      yrNom.textContent=(yrOpen?'▼ ':'▶ ')+yr+(yr===currentYear?' ★':'');
      var yrSum=_el('span','hadm-loja-nom');
      yrSum.classList.add('hadm-loja-nom-c');
      yrSum.textContent=_fmtEur(yrTotal)+' ('+yrRows.length+' dom.)';
      yrHdr.appendChild(yrNom); yrHdr.appendChild(yrSum);
      yrRow.appendChild(yrHdr);
      c.appendChild(yrRow);

      var domCont=_el('div','hadm-tree-branch');
      domCont.classList.toggle('show',yrOpen);
      c.appendChild(domCont);

      yrRow.addEventListener('click',function(){
        _expanded[yrKey]=!_expanded[yrKey];
        var o=_expanded[yrKey];
        yrNom.textContent=(o?'▼ ':'▶ ')+yr+(yr===currentYear?' ★':'');
        domCont.classList.toggle('show',o);
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

        var lRow=_el('div','hadm-yr-row');
        lRow.classList.add('hadm-yr-row-c');
        lRow.addEventListener('mouseenter',function(){this.classList.add('hadm-this-c--render-vendas');});
        lRow.addEventListener('mouseleave',function(){this.classList.remove('hadm-this-c--render-vendas');});
        var lHdr=_el('div','hadm-loja-name-line');
        var lNom=_el('span','hadm-yr-lbl');
        lNom.classList.add('hadm-yr-lbl-c');
        lNom.textContent=(lOpen?'▼ ':'▶ ')+lLabel;
        var lSum=_el('span','hadm-yr-lbl');
        lSum.classList.add('hadm-yr-lbl-c');
        lSum.textContent=_fmtEur(lTotal);
        lHdr.appendChild(lNom); lHdr.appendChild(lSum);
        lRow.appendChild(lHdr);
        domCont.appendChild(lRow);

        var lDaysCont=_el('div','hadm-tree-branch');
        lDaysCont.classList.toggle('show',lOpen);
        domCont.appendChild(lDaysCont);

        lRow.addEventListener('click',function(e){
          e.stopPropagation();
          _expanded[lKey]=!_expanded[lKey];
          var o=_expanded[lKey];
          lNom.textContent=(o?'▼ ':'▶ ')+lLabel;
          lDaysCont.classList.toggle('show',o);
        });

        lRows.forEach(function(r){
          var dayVal=parseFloat(r.montante)||0;
          var dayRow=_el('div','hadm-day-row--render-domingo-ps');
          dayRow.classList.add('hadm-yr-row-c');
          var dayL=_el('div','hadm-yr-right');
          var dayD=_el('span','hadm-day-d');
          dayD.classList.add('hadm-mo-lbl-c');
          dayD.textContent=_fmtDate(r.data);
          var dayDow=_el('span','hadm-day-dow');
          dayDow.classList.add('hadm-p-lbl-c');
          dayDow.textContent='Dom';
          dayL.appendChild(dayD); dayL.appendChild(dayDow);
          var dayA=_el('span','hadm-day-a');
          dayA.classList.add(dayVal===0?'hadm-dayval-zero':'hadm-dayval-nonzero');
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

  // Detecta automáticamente el rango real de operación de Maxx dentro de [from, to]
  // basándose en los datos: primer y último día con venta ≠ 0.
  // La realidad de los datos manda — no depende de configuración manual.
  // Devuelve {desde, hasta} o null si Maxx no tiene ventas en el rango.
  function _maxxRangoReal(from, to) {
    var dias=_allRows.filter(function(r){
      return r.loja==='MAXX' && r.data>=from && r.data<=to && (parseFloat(r.montante)||0)>0;
    }).map(function(r){return r.data;}).sort();
    if(!dias.length) return null;
    return {desde:dias[0], hasta:dias[dias.length-1]};
  }

  // Detecta la temporada completa de Maxx en un año dado (primer→último día con venta).
  // Devuelve {desde, hasta, dias:[{data,val}]} ordenado, o null si no hay datos.
  function _maxxTemporadaAno(anoStr) {
    var dias=_allRows.filter(function(r){
      return r.loja==='MAXX' && r.data.substring(0,4)===anoStr && (parseFloat(r.montante)||0)>0;
    }).map(function(r){return {data:r.data,val:parseFloat(r.montante)||0};})
      .sort(function(a,b){return a.data<b.data?-1:1;});
    if(!dias.length) return null;
    return {desde:dias[0].data, hasta:dias[dias.length-1].data, dias:dias};
  }

  // Proyección de Maxx comparando TEMPORADA con TEMPORADA (no fecha calendario).
  // Toma lo facturado este año en sus primeros N días de operación y estima el
  // total de temporada según qué % representaban esos primeros N días en años
  // anteriores (ponderado por recencia). Estacional-agnóstico al calendario.
  // Devuelve {realAcum, valorProjetado, pctDone, diasRestantes, anosBase} o null.
  function _calcProjectionMaxxTemporada(anoActualStr, hastaFecha) {
    var temp=_maxxTemporadaAno(anoActualStr);
    if(!temp) return null;
    // Días de operación reales este año hasta hoy
    var diasActuales=temp.dias.filter(function(d){return d.data<=hastaFecha;});
    if(!diasActuales.length) return null;
    var realAcum=diasActuales.reduce(function(s,d){return s+d.val;},0);
    var nDiasOperados=diasActuales.length;

    // Para cada año histórico: % que representaban los primeros nDiasOperados
    // días de su temporada respecto al total de esa temporada.
    var anosDisponibles={};
    _allRows.forEach(function(r){
      if(r.loja!=='MAXX') return;
      var yr=r.data.substring(0,4);
      if(yr===anoActualStr||ANOS_EXCLUIDOS.indexOf(yr)>=0) return;
      if((parseFloat(r.montante)||0)<=0) return;
      anosDisponibles[yr]=true;
    });
    var sortedYrs=Object.keys(anosDisponibles).sort(function(a,b){return b-a;});

    var wSum=0, wRatioSum=0, anosBase=[];
    sortedYrs.forEach(function(yr,i){
      var t=_maxxTemporadaAno(yr);
      if(!t||t.dias.length<nDiasOperados) return; // necesita al menos esos días para comparar
      var totalTemp=t.dias.reduce(function(s,d){return s+d.val;},0);
      var primerosN=t.dias.slice(0,nDiasOperados).reduce(function(s,d){return s+d.val;},0);
      if(totalTemp<=0||primerosN<=0) return;
      var ratio=primerosN/totalTemp; // % del total que son los primeros N días
      var w=Math.pow(0.45,i);
      wSum+=w; wRatioSum+=w*ratio;
      anosBase.push(yr);
    });

    if(wSum<=0) return null; // sin histórico comparable
    var pctHistorico=wRatioSum/wSum;
    var valorProjetado=pctHistorico>0?realAcum/pctHistorico:realAcum;

    // Días restantes estimados de temporada = media ponderada de duración de temporada
    var wDur=0, wDurSum=0;
    sortedYrs.forEach(function(yr,i){
      var t=_maxxTemporadaAno(yr);
      if(!t) return;
      var dur=t.dias.length;
      var w=Math.pow(0.45,i);
      wDur+=w; wDurSum+=w*dur;
    });
    var duracionEsperada=wDur>0?Math.round(wDurSum/wDur):nDiasOperados;
    var diasRestantes=Math.max(0, duracionEsperada-nDiasOperados);

    return {
      realAcum:realAcum,
      valorProjetado:valorProjetado,
      pctDone:pctHistorico*100,
      diasRestantes:diasRestantes,
      anosBase:anosBase
    };
  }

  // Calcula la contribución estimada de Maxx para un tramo [from, to]
  // usando media histórica por mes ponderada por recencia (mismo método que _calcProjection).
  // Devuelve {total, detalle:[{mes, diasAbertos, media, total}]}
  function _calcProjectionMaxxTramo(from, to) {
    var currentYrStr=from.substring(0,4);
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

    var dIter=new Date(_strToDate(from).getTime());
    var diasPorMes={};
    while(_dateToStr(dIter)<=to){
      var mes=dIter.getMonth()+1;
      diasPorMes[mes]=(diasPorMes[mes]||0)+1;
      dIter.setDate(dIter.getDate()+1);
    }

    var total=0, detalle=[];
    Object.keys(diasPorMes).sort(function(a,b){return a-b;}).forEach(function(mes){
      var nDias=diasPorMes[mes];
      var mData=maxxByMes[parseInt(mes)];
      if(!mData||!Object.keys(mData).length){
        detalle.push({mes:parseInt(mes),nDias:nDias,media:0,total:0,nota:'sem histórico'});
        return;
      }
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
      var diasAbiertosEsperados=ywDias>0?Math.round(ywDiasSum/ywDias):nDias;
      // Limitar días esperados a los días reales disponibles en el tramo
      if(diasAbiertosEsperados>nDias) diasAbiertosEsperados=nDias;
      var contrib=diasAbiertosEsperados*mediaDia;
      total+=contrib;
      detalle.push({mes:parseInt(mes),nDias:nDias,diasAbertos:diasAbiertosEsperados,media:mediaDia,total:contrib,anos:anosYrs.length});
    });
    return {total:total, detalle:detalle};
  }

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
    var ctrlWrap=_el('div','hadm-ctrl-wrap');
    ctrlWrap.classList.add('hadm-mo-row-c');

    // Mes límite
    var mesWrap=_el('div','hadm-mes-wrap');
    var mesLbl=_el('span','hadm-mes-lbl');
    mesLbl.classList.add('hadm-b-sub-c');
    mesLbl.textContent='Abrir domingos até:';
    mesWrap.appendChild(mesLbl);
    for(var m=1;m<=12;m++){
      (function(mes){
        var mb=_el('div','hadm-mb');
        var isAct=_domMesFin===mes;
        mb.classList.add(isAct?'hadm-pill-on':'hadm-pill-off');
        mb.classList.add('hadm-h-val-c');
        mb.textContent=MESES_PT[mes-1].substring(0,3);
        mb.addEventListener('click',function(){_domMesFin=mes;_renderProyeccion();});
        mesWrap.appendChild(mb);
      })(m);
    }
    ctrlWrap.appendChild(mesWrap);

    // Toggles de tiendas
    var lojaWrap=_el('div','hadm-loja-wrap');
    var lojaLbl=_el('span','hadm-mes-lbl');
    lojaLbl.classList.add('hadm-b-sub-c');
    lojaLbl.textContent='Tiendas:';
    lojaWrap.appendChild(lojaLbl);
    ZONA_DOMINGO.forEach(function(loja){
      var isAct=_domLojasActivas.indexOf(loja)>=0;
      var lb=_el('div','hadm-mb');
      lb.classList.add(isAct?'hadm-pill-on':'hadm-pill-off');
      lb.classList.add('hadm-h-val-c');
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
    var hdr=_el('div','hadm-hdr--render-proy-domingos');
    hdr.classList.add('hadm-hdr-c');
    var hLbl=_el('div','hadm-h-lbl--render-domingo-ps');
    hLbl.classList.add('hadm-b-sub-c');
    hLbl.textContent='PROJECÇÃO DOMINGOS '+currentYear+' — até '+MESES_PT[_domMesFin-1];
    hdr.appendChild(hLbl);

    if(!proj||proj.domReales===0){
      var noData=_el('div','hadm-no-data');
      noData.classList.add('hadm-no-data-c');
      noData.textContent='Sem dados de domingos registados para as lojas seleccionadas.';
      hdr.appendChild(noData);
    } else {
      var hVal=_el('div','hadm-h-val--render-proy-domingos');
      hVal.classList.add('hadm-h-val-c');
      hVal.textContent=_fmtEur(proj.totalReal);
      hdr.appendChild(hVal);
      var hSub=_el('div','hadm-h-sub--render-proy-domingos');
      hSub.classList.add('hadm-no-data-c');
      hSub.textContent=proj.domReales+' domingos reais · média actual: '+_fmtEur(proj.mediaActual)+'/dom';
      hdr.appendChild(hSub);

      var projSec=_el('div','hadm-proj-sec');
      var projLbl=_el('div','hadm-proj-lbl');
      projLbl.classList.add('hadm-p-lbl-c');
      projLbl.textContent='PROJECÇÃO TOTAL (real + futuro)';
      projSec.appendChild(projLbl);
      var projRow=_el('div','hadm-proj-row');
      var projVal=_el('span','hadm-proj-val');
      projVal.classList.add('hadm-proj-val-c');
      projVal.textContent=_fmtEur(proj.totalProyectado);
      projRow.appendChild(projVal);
      var projExtra=_el('span','hadm-h-sub');
      projExtra.classList.add('hadm-b-sub-c');
      projExtra.textContent='+'+_fmtEur(proj.proyFuturo)+' projetado ('+proj.domRestantes+' dom. restantes)';
      projRow.appendChild(projExtra);
      projSec.appendChild(projRow);

      // Desglose mes a mes
      var mesesConDom=Object.keys(proj.proyFuturoPorMes).sort(function(a,b){return a-b;});
      if(mesesConDom.length){
        var mesGrid=_el('div','hadm-mes-grid');
        mesesConDom.forEach(function(mes){
          var md=proj.proyFuturoPorMes[mes];
          var mBox=_el('div','hadm-m-box');
          mBox.classList.add('hadm-m-box-c');
          var mNom=_el('div','hadm-m-nom');
          mNom.classList.add('hadm-b-sub-c');
          mNom.textContent=MESES_PT[parseInt(mes)-1].substring(0,3)+' ('+md.nDom+' dom)';
          mBox.appendChild(mNom);
          var mVal=_el('div','hadm-c-d');
          mVal.classList.add('hadm-h-val-c');
          mVal.textContent=_fmtEur(md.total);
          mBox.appendChild(mVal);
          if(md.hist!=null){
            var mHist=_el('div','hadm-m-hist');
            mHist.classList.add('hadm-m-hist-c');
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
      var fixBtn=_el('div','hadm-fix-btn');
      fixBtn.classList.add('hadm-fix-btn-c');
      fixBtn.textContent='📌 Fixar Projecção Domingos';
      fixBtn.addEventListener('click',function(){
        var nota=window.prompt('Nota opcional (ex: até Agosto, Maxx excluída):','');
        if(nota===null) return;
        fixBtn.textContent='A guardar…';fixBtn.classList.add('hadm-busy');
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
            if(res.error){fixBtn.textContent='✗ Erro';fixBtn.classList.remove('hadm-busy');}
            else{fixBtn.textContent='✓ Fixado!';fixBtn.classList.add('hadm-fix-btn-c--render-proy-domingos');fixBtn.classList.remove('hadm-busy');fixBtn.classList.add('hadm-locked');}
          }).catch(function(){fixBtn.textContent='✗ Erro';fixBtn.classList.remove('hadm-busy');});
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
    var subTabsWrap=_el('div','hadm-sub-tabs-wrap');
    var subTabs=[
      {id:'general',label:'📈 Projecção Geral'},
      {id:'domingos',label:'🌿 Domingos Ps'},
      {id:'diagnostico',label:'🔬 Diagnóstico'}
    ];
    subTabs.forEach(function(st){
      var btn=_el('div','hadm-btn');
      var isAct=_proyTab===st.id;
      btn.classList.add(isAct?'hadm-subtab-on':'hadm-subtab-off');
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
      var loadMsg=_el('div','hadm-load-msg');
      loadMsg.classList.add('hadm-no-data-c');
      loadMsg.textContent='A carregar configuração…';
      c.appendChild(loadMsg);
      _loadMaxxConfig(function(){_renderProyeccion();});
      return;
    }

    // Selector de zona
    var zonaWrap=_el('div','hadm-zona-wrap');
    var zonas=[
      {k:'TODAS',l:'Todas',lojas:LOJAS},
      {k:'PARFOIS',l:'Parfois',lojas:ZONA_PARFOIS},
      {k:'PRIMAVERA',l:'Primavera',lojas:ZONA_PRIMAVERA},
      {k:'MEZKA_PS',l:'Mezka Ps',lojas:ZONA_MEZKAPS},
      {k:'MEZKA_FNC',l:'Mezka Fnc',lojas:ZONA_MEZKAFNC}
    ];
    zonas.forEach(function(z){
      var btn=_el('div','hadm-btn--render-proy-general');
      var isAct=_proyZona===z.k;
      btn.classList.add('hadm-h-val-c');
      btn.classList.add(isAct?'hadm-pill-on':'hadm-pill-off');
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
      var maxxPanel=_el('div','hadm-maxx-panel');
      var maxxHasConfig=_maxxConfig.inicio&&_maxxConfig.fin;
      maxxPanel.classList.add(maxxHasConfig?'hadm-maxx-panel-on':'hadm-maxx-panel-off');

      var maxxPanelHdr=_el('div','hadm-maxx-panel-hdr');
      var maxxPanelTtl=_el('div','hadm-maxx-panel-ttl');
      maxxPanelTtl.classList.add(maxxHasConfig?'hadm-txt-green':'hadm-txt-gray888');
      maxxPanelTtl.textContent='🏪 Configuração Maxx '+currentYear;
      maxxPanelHdr.appendChild(maxxPanelTtl);

      if(maxxHasConfig){
        var qRanges={Q1:{from:currentYear+'-01-01',to:currentYear+'-03-31'},Q2:{from:currentYear+'-04-01',to:currentYear+'-06-30'},Q3:{from:currentYear+'-07-01',to:currentYear+'-09-30'},Q4:{from:currentYear+'-10-01',to:currentYear+'-12-31'}};
        var qAfect=['T1','T2','T3','T4'].filter(function(q){return !!_maxxRangoParaPeriodo(qRanges[q.replace('T','Q')].from,qRanges[q.replace('T','Q')].to);});
        var qBadge=_el('span','hadm-q-badge');
        qBadge.classList.add('hadm-q-badge-c');
        qBadge.textContent='Afecta: '+qAfect.join(', ');
        maxxPanelHdr.appendChild(qBadge);
      }
      maxxPanel.appendChild(maxxPanelHdr);

      var maxxInputRow=_el('div','hadm-maxx-input-row');
      var iS='hadm-i-s';

      var gInicio=_el('div','hadm-g-inicio');
      var lInicio=_el('label','hadm-l-inicio');
      lInicio.classList.add('hadm-b-sub-c');lInicio.textContent='Início';
      var inpInicio=_el('input',iS);inpInicio.type='date';inpInicio.value=_maxxConfig.inicio||'';
      inpInicio.classList.add('hadm-inp-inicio-c');
      gInicio.appendChild(lInicio);gInicio.appendChild(inpInicio);

      var gFin=_el('div','hadm-g-inicio');
      var lFin=_el('label','hadm-l-inicio');
      lFin.classList.add('hadm-b-sub-c');lFin.textContent='Fim';
      var inpFin=_el('input',iS);inpFin.type='date';inpFin.value=_maxxConfig.fin||'';
      inpFin.classList.add('hadm-inp-inicio-c');
      gFin.appendChild(lFin);gFin.appendChild(inpFin);

      var saveBtn=_el('div','hadm-save-btn');
      saveBtn.classList.add('hadm-save-btn-c');
      saveBtn.textContent='Guardar';
      saveBtn.addEventListener('click',function(){
        var ini=inpInicio.value,fi=inpFin.value;
        if(!ini||!fi||ini>fi){saveBtn.textContent='⚠ datas inválidas';setTimeout(function(){saveBtn.textContent='Guardar';},2000);return;}
        saveBtn.textContent='A guardar…';saveBtn.classList.add('hadm-busy');
        _saveMaxxConfig(ini,fi,function(err){
          saveBtn.classList.remove('hadm-busy');
          if(err){saveBtn.textContent='✗ Erro';setTimeout(function(){saveBtn.textContent='Guardar';},2000);}
          else{_renderProyeccion();}
        });
      });

      var clearBtn=_el('div','hadm-clear-btn');
      clearBtn.classList.add('hadm-clear-btn-c');
      clearBtn.textContent='✕ limpar';clearBtn.classList.toggle('show',maxxHasConfig);
      clearBtn.addEventListener('click',function(){
        _saveMaxxConfig('','',function(){_maxxConfig.inicio=null;_maxxConfig.fin=null;_renderProyeccion();});
      });

      maxxInputRow.appendChild(gInicio);maxxInputRow.appendChild(gFin);
      maxxInputRow.appendChild(saveBtn);maxxInputRow.appendChild(clearBtn);
      maxxPanel.appendChild(maxxInputRow);

      if(maxxHasConfig){
        var maxxInfo=_el('div','hadm-maxx-info');
        maxxInfo.classList.add('hadm-p-lbl-c');
        maxxInfo.textContent='Maxx activa de '+_fmtDate(_maxxConfig.inicio)+' até '+_fmtDate(_maxxConfig.fin)+' — a projecção de cada trimestre incluirá a sua contribuição no tramo correspondente.';
        maxxPanel.appendChild(maxxInfo);
      }
      c.appendChild(maxxPanel);
    }

    // Cards Q1-Q4 + Año
    var periods=[
      {id:'Q1',label:'T1',from:currentYear+'-01-01',to:currentYear+'-03-31'},
      {id:'Q2',label:'T2',from:currentYear+'-04-01',to:currentYear+'-06-30'},
      {id:'Q3',label:'T3',from:currentYear+'-07-01',to:currentYear+'-09-30'},
      {id:'Q4',label:'T4',from:currentYear+'-10-01',to:currentYear+'-12-31'},
      {id:'ANO',label:'Ano '+currentYear,from:currentYear+'-01-01',to:currentYear+'-12-31'}
    ];

    var grid=_el('div','hadm-grid');
    periods.forEach(function(p){
      var realRows=rows.filter(function(r){return r.data>=p.from&&r.data<=p.to;});
      var realTotal=realRows.reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
      var isClosed=today>p.to;
      var isActive=today>=p.from&&today<=p.to;
      var isFuture=today<p.from;
      var maxxRango=maxxNaZona?_maxxRangoParaPeriodo(p.from,p.to):null;
      var maxxDesde=maxxRango?maxxRango.desde:null;
      var proj=(!isClosed)?_calcProjection(rows,p.from,p.to,effectiveToday,maxxDesde):null;

      var card=_el('div','hadm-card');
      card.classList.add(isClosed?'hadm-card-closed':isActive?'hadm-card-active':'hadm-card-future');

      var cLbl=_el('div','hadm-c-lbl');
      cLbl.classList.add(isActive?'hadm-txt-green':'hadm-txt-gray888');
      var lSpan=document.createElement('span');lSpan.textContent=p.label+(isClosed?' · Fechado':isActive?' · Em curso':' · Futuro');
      cLbl.appendChild(lSpan);
      if(isActive&&proj){
        var pctSpan=_el('span','hadm-pct-span');
        pctSpan.classList.add('hadm-q-badge-c');
        pctSpan.textContent=proj.pctHistorico.toFixed(0)+'% hist · '+proj.pctDone.toFixed(0)+'% linear';
        cLbl.appendChild(pctSpan);
      }
      card.appendChild(cLbl);

      var cVal=_el('div','hadm-c-val--render-proy-general');
      cVal.classList.add('hadm-loja-nom-c');
      cVal.textContent=_fmtEur(realTotal);
      card.appendChild(cVal);

      if(!isClosed&&proj){
        var projLine=_el('div','hadm-proj-line');
        var projLbl=_el('span','hadm-proj-lbl--render-proy-general');
        projLbl.classList.add('hadm-b-sub-c');
        projLbl.textContent=isFuture?'Estimativa:':'Projecção:';
        projLine.appendChild(projLbl);
        var projVal=_el('span','hadm-loja-nom');
        projVal.classList.add(isActive?'hadm-diff-pos-c':'hadm-txt-gray555');
        projVal.textContent=_fmtEur(proj.valorProjetado);
        projLine.appendChild(projVal);
        if(isActive){
          var projSub=_el('span','hadm-proj-sub');
          projSub.classList.add('hadm-no-data-c');
          projSub.textContent='('+proj.diasRestantes+' dias restantes)';
          projLine.appendChild(projSub);
        }
        card.appendChild(projLine);
        if(proj.maxxContribFutura>0){
          var maxxTag=_el('div','hadm-maxx-tag');
          maxxTag.classList.add('hadm-p-lbl-c');
          maxxTag.textContent='↳ incl. Maxx ('+_fmtDate(maxxDesde)+'→'+_fmtDate(maxxRango.hasta)+'): +'+_fmtEur(proj.maxxContribFutura);
          card.appendChild(maxxTag);
        }
        if(proj.anosBase&&proj.anosBase.length){
          var baseLbl=_el('div','hadm-p-maxx');
          baseLbl.classList.add('hadm-base-lbl-c');
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
        var diffLine=_el('div','hadm-diff-line');
        diffLine.classList.add(diff>=0?'hadm-diff-pos-c':'hadm-diff-neg-c');
        diffLine.textContent=(diff>=0?'↑ +':'↓ ')+diff.toFixed(1)+'% vs '+(currentYear-1)+' ('+_fmtEur(prevTotal)+')';
        card.appendChild(diffLine);
      }

      if(isActive&&proj){
        var btnRow=_el('div','hadm-btn-row');
        var fixBtn=_el('div','hadm-fix-btn--render-proy-general');
        fixBtn.classList.add('hadm-fix-btn-c');
        fixBtn.textContent='📌 Fixar Projecção';
        fixBtn.addEventListener('click',function(){_guardarProyeccion(p,proj,_proyZona,rows,fixBtn);});
        btnRow.appendChild(fixBtn);
        var calcBtn=_el('div','hadm-calc-btn');
        calcBtn.classList.add('hadm-calc-btn-c');
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
    var ttl=_el('div','hadm-ttl');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent='⚠ ALERTAS — RITMO POR LOJA';
    c.appendChild(ttl);

    var alertasWrap=_el('div','hadm-alertas-wrap');
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
      var card=_el('div','hadm-card--render-alertas');
      card.classList.add(diff<0?'hadm-alert-card-neg':'hadm-alert-card-pos');

      // Linha 1: nome + percentagem
      var aRow1=_el('div','hadm-loja-name-line');
      var aLoja=_el('div','hadm-a-loja');
      aLoja.classList.add('hadm-loja-nom-c');
      aLoja.textContent=LOJA_LABELS[loja]||loja;
      aRow1.appendChild(aLoja);
      var aPct=_el('div','hadm-a-pct');
      aPct.classList.add(diff<0?'hadm-diff-neg-c':'hadm-diff-pos-c');
      aPct.textContent=(diff>=0?'+':'')+diff.toFixed(1)+'%';
      aRow1.appendChild(aPct);
      card.appendChild(aRow1);

      // Linha 2: período e base de comparação
      var aRow2=_el('div','hadm-a-row2');
      var aPeriodo=_el('div','hadm-a-periodo');
      aPeriodo.classList.add('hadm-b-sub-c');
      aPeriodo.textContent='Período: 01/01→'+_fmtDate(today)+' ('+dayOfYear+' dias) · Base: média de '+anosUsados.length+' anos ('+anosUsados.join(', ')+')';
      aRow2.appendChild(aPeriodo);
      card.appendChild(aRow2);

      // Linha 3: valores reais vs média histórica + vs ano anterior
      var aRow3=_el('div','hadm-a-row3');
      var aVals=_el('div','hadm-proj-sub');
      aVals.classList.add('hadm-b-sub-c');
      aVals.textContent='Real: '+_fmtEur(realActual)+' · Média hist.: '+_fmtEur(mediaHist);
      aRow3.appendChild(aVals);
      var aImpDiv=_el('div','hadm-a-imp-div');
      var aImp=_el('div','hadm-proj-lbl--render-proy-general');
      aImp.classList.add('hadm-b-sub-c');
      var impacto=(realActual-mediaHist);
      aImp.textContent=(impacto>=0?'+':'')+_fmtEur(impacto)+' vs média hist.';
      aImpDiv.appendChild(aImp);
      if(diffVsAnterior!==null){
        var aAnt=_el('div','hadm-a-periodo');
        aAnt.classList.add(diffVsAnterior<0?'hadm-txt-red-c0392b':'hadm-diff-pos-c');
        var impVsAnt=realActual-realAnterior;
        aAnt.textContent=(diffVsAnterior>=0?'+':'')+diffVsAnterior.toFixed(1)+'% vs '+anoAnterior+' ('+(impVsAnt>=0?'+':'')+_fmtEur(impVsAnt)+')';
        aImpDiv.appendChild(aAnt);
      }
      aRow3.appendChild(aImpDiv);
      card.appendChild(aRow3);

      alertasWrap.appendChild(card);
    });

    if(!anyAlert){
      var ok=_el('div','hadm-ok');
      ok.classList.add('hadm-b-sub-c');
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
    var mTtl=_el('div','hadm-m-ttl');
    mTtl.classList.add('hadm-m-ttl-c');
    mTtl.textContent='CÁLCULOS — '+label;
    body.appendChild(mTtl);
    var panel=_renderTrazabilidad(proj);
    body.appendChild(panel);
    overlay.classList.add('active');
    document.body.classList.add('hadm-modal-open-lock');
  }

  function _closeTrazaModal(){
    var overlay=document.getElementById('hadm-traza-overlay');
    if(overlay) overlay.classList.remove('active');
    document.body.classList.remove('hadm-modal-open-lock');
  }

  // ── Narrativa analítica — reemplaza los pasos técnicos
  function _renderTrazabilidad(proj){
    var panel=_el('div','');
    var t=proj.traza;
    if(!t){
      var nd=_el('div','hadm-h-sub');nd.classList.add('hadm-no-data-c');
      nd.textContent='Sem dados de análise.';panel.appendChild(nd);return panel;
    }

    function _bloco(titulo,cor,conteudo){
      var b=_el('div','hadm-bloco--render-trazabilidad');
      b.style.setProperty('border-left-color',cor,'important');
      var bT=_el('div','hadm-b-t');
      bT.style.setProperty('color',cor,'important');bT.textContent=titulo;b.appendChild(bT);
      var bC=_el('div','hadm-b-c');
      bC.classList.add('hadm-mo-lbl-c');bC.innerHTML=conteudo;b.appendChild(bC);
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
      b3+='Comparando com '+ultAno+' ('+_fmtEur(ultTotal)+'): a projecção representa '+(diffUlt>=0?'<b class="hadm-txt-pos">+'+diffUlt.toFixed(1)+'%</b>':'<b class="hadm-txt-neg">'+diffUlt.toFixed(1)+'%</b>')+'. ';
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
    btn.textContent='A guardar…';btn.classList.add('hadm-busy');
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
          btn.textContent='✗ Erro ao guardar';btn.classList.remove('hadm-busy');
        } else {
          btn.textContent='✓ Projecção fixada!';
          btn.classList.add('hadm-btn-c');
          btn.classList.remove('hadm-busy');btn.classList.add('hadm-locked');
        }
      }).catch(function(){btn.textContent='✗ Erro';btn.classList.remove('hadm-busy');});
  }

  function _renderProyFijadas(c,currentYear,zona){
    var wrap=_el('div','hadm-wrap');
    var ttl=_el('div','hadm-ttl--render-proy-fijadas');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent='📌 PROJECÇÕES FIXADAS';
    wrap.appendChild(ttl);
    var box=_el('div','hadm-box');
    box.classList.add('hadm-no-data-c');
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
        var tw=_el('div','hadm-tw');
        var t=document.createElement('table');
        t.classList.add('hadm-t-sa');
        var thead=document.createElement('thead'),htr=document.createElement('tr');
        ['Período','Data fixação','% feito','Real','Projecção','Nota'].forEach(function(h){
          var th=document.createElement('th');th.textContent=h;
          th.classList.add('hadm-th-sa');
          th.classList.add('hadm-th-c');
          htr.appendChild(th);
        });
        thead.appendChild(htr);t.appendChild(thead);
        var tbody=document.createElement('tbody');
        data.forEach(function(r,i){
          var tr=document.createElement('tr');
          var bgCls=i%2===0?'hadm-row-even':'hadm-row-odd';
          [r.periodo_tipo,_fmtDate(r.fecha_fijacion),r.pct_completado+'%',
           _fmtEur(r.valor_real_acumulado),_fmtEur(r.valor_proyectado),r.nota||'—'].forEach(function(v,ci){
            var td=document.createElement('td');td.textContent=v;
            td.classList.add('hadm-td-sa');
            td.classList.toggle('hadm-fw800',ci>=3&&ci<=4);
            td.classList.add(bgCls);td.classList.add('hadm-loja-nom-c');
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
    var ttl=_el('div','hadm-tree-label');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent='🔮 SIMULADOR — E SE MAXX ABRISSE?';
    c.appendChild(ttl);

    var simWrap=_el('div','hadm-sim-wrap');
    simWrap.classList.add('hadm-mo-row-c');

    var simDesc=_el('div','hadm-sim-desc');
    simDesc.classList.add('hadm-b-sub-c');
    simDesc.textContent='Define o período de abertura da Maxx para ver o impacto na projecção anual. As demais lojas contribuem sempre.';
    simWrap.appendChild(simDesc);

    // Toggle Maxx
    var toggleRow=_el('div','hadm-toggle-row');
    var toggleBtn=_el('div','hadm-toggle-btn');
    toggleBtn.classList.add('hadm-h-val-c');
    toggleBtn.classList.add(_simMaxxActiva?'hadm-toggle-on':'hadm-toggle-off');
    toggleBtn.textContent=_simMaxxActiva?'✓ Maxx incluída':'Maxx fechada';

    var iS='hadm-i-s--render-simulador';
    var inpDesde=_el('input',iS);
    inpDesde.type='date';inpDesde.value=_simMaxxDesde||'';
    inpDesde.classList.add('hadm-inp-inicio-c');
    var lDesde=_el('span','hadm-l-desde');
    lDesde.classList.add('hadm-b-sub-c');lDesde.textContent='de';
    var inpHasta=_el('input',iS);
    inpHasta.type='date';inpHasta.value=_simMaxxHasta||'';
    inpHasta.classList.add('hadm-inp-inicio-c');
    var lHasta=_el('span','hadm-l-desde');
    lHasta.classList.add('hadm-b-sub-c');lHasta.textContent='até';

    // Toggle domingos Maxx
    var domToggle=_el('div','hadm-dom-toggle');
    domToggle.classList.add('hadm-h-val-c');
    domToggle.classList.add(_simMaxxDomingos?'hadm-toggle-on':'hadm-toggle-off');
    domToggle.textContent=_simMaxxDomingos?'Dom ✓':'+ Domingos';

    toggleRow.appendChild(toggleBtn);
    toggleRow.appendChild(lDesde);toggleRow.appendChild(inpDesde);
    toggleRow.appendChild(lHasta);toggleRow.appendChild(inpHasta);
    toggleRow.appendChild(domToggle);
    simWrap.appendChild(toggleRow);

    // Resultado
    var simResult=_el('div','hadm-sim-result');
    simResult.classList.add('hadm-yr-row-c');
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
      var sLbl=_el('div','hadm-s-lbl');
      sLbl.classList.add('hadm-b-sub-c');
      sLbl.textContent='RESULTADO DA SIMULAÇÃO — ANO '+currentYear;
      simResult.appendChild(sLbl);

      var sRow=_el('div','hadm-s-row');
      var sBase=_el('div','');
      var sBaseLbl=_el('div','hadm-m-hist');sBaseLbl.classList.add('hadm-no-data-c');
      sBaseLbl.textContent='Sem Maxx';
      var sBaseVal=_el('div','hadm-loja-nom');
      sBaseVal.classList.add('hadm-b-sub-c');
      sBaseVal.textContent=_fmtEur(baseSinMaxx);
      sBase.appendChild(sBaseLbl);sBase.appendChild(sBaseVal);
      sRow.appendChild(sBase);

      if(_simMaxxActiva&&maxxContrib>0){
        var sMaxx=_el('div','');
        var sMaxxLbl=_el('div','hadm-m-hist');sMaxxLbl.classList.add('hadm-p-lbl-c');
        sMaxxLbl.textContent='Contributo Maxx';
        var sMaxxVal=_el('div','hadm-loja-nom');
        sMaxxVal.classList.add('hadm-p-lbl-c');
        sMaxxVal.textContent='+'+_fmtEur(maxxContrib);
        sMaxx.appendChild(sMaxxLbl);sMaxx.appendChild(sMaxxVal);
        sRow.appendChild(sMaxx);

        var sTotal=_el('div','');
        var sTotalLbl=_el('div','hadm-m-hist');sTotalLbl.classList.add('hadm-b-val-c');
        sTotalLbl.textContent='Total com Maxx';
        var sTotalVal=_el('div','hadm-proj-val');
        sTotalVal.classList.add('hadm-loja-nom-c');
        sTotalVal.textContent=_fmtEur(totalComMaxx);
        sTotal.appendChild(sTotalLbl);sTotal.appendChild(sTotalVal);
        sRow.appendChild(sTotal);
      } else {
        var sTotalVal2=_el('div','hadm-proj-val');
        sTotalVal2.classList.add('hadm-loja-nom-c');
        sTotalVal2.textContent=_fmtEur(baseSinMaxx);
        sRow.appendChild(sTotalVal2);
      }
      simResult.appendChild(sRow);

      // Desglose Maxx mes a mes
      if(maxxDetalle.length){
        var dttl=_el('div','hadm-dttl');
        dttl.classList.add('hadm-p-lbl-c');
        dttl.textContent='DESGLOSE MAXX';
        simResult.appendChild(dttl);
        var dGrid=_el('div','hadm-d-grid');
        maxxDetalle.forEach(function(d){
          var dBox=_el('div','hadm-d-box');
          dBox.classList.add('hadm-d-box-c');
          var dNom=_el('div','hadm-d-nom');
          dNom.classList.add('hadm-p-lbl-c');
          dNom.textContent=MESES_PT[d.mes-1].substring(0,3)+' · '+d.tipo;
          dBox.appendChild(dNom);
          var dN=_el('div','hadm-proj-sub');
          dN.classList.add('hadm-b-sub-c');
          dN.textContent=d.n+(d.tipo==='domingos'?' dom':' dias')+' · '+_fmtEur(d.media)+'/dia';
          dBox.appendChild(dN);
          var dT=_el('div','hadm-a-loja');
          dT.classList.add('hadm-loja-nom-c');
          dT.textContent=_fmtEur(d.total);
          dBox.appendChild(dT);
          if(d.ratio!==undefined){
            var dR=_el('div','hadm-d-r');
            dR.classList.add('hadm-no-data-c');
            dR.textContent='ratio dom/sem: '+(d.ratio*100).toFixed(0)+'%';
            dBox.appendChild(dR);
          }
          dGrid.appendChild(dBox);
        });
        simResult.appendChild(dGrid);
      }

      if(!_simMaxxActiva||(maxxContrib===0&&_simMaxxActiva)){
        var hint=_el('div','hadm-hint');
        hint.classList.add('hadm-no-data-c');
        hint.textContent=_simMaxxActiva?'Define as datas de abertura da Maxx para calcular o seu contributo.':'Activa a Maxx e define as datas para simular o seu impacto.';
        simResult.appendChild(hint);
      }
    }

    // Event listeners
    toggleBtn.addEventListener('click',function(){
      _simMaxxActiva=!_simMaxxActiva;
      _calcSimResult();
      toggleBtn.classList.remove('hadm-toggle-on','hadm-toggle-off');
      toggleBtn.classList.add(_simMaxxActiva?'hadm-toggle-on':'hadm-toggle-off');
      toggleBtn.textContent=_simMaxxActiva?'✓ Maxx incluída':'Maxx fechada';
    });
    inpDesde.addEventListener('change',function(){_simMaxxDesde=inpDesde.value;_calcSimResult();});
    inpHasta.addEventListener('change',function(){_simMaxxHasta=inpHasta.value;_calcSimResult();});
    domToggle.addEventListener('click',function(){
      _simMaxxDomingos=!_simMaxxDomingos;
      domToggle.classList.remove('hadm-toggle-on','hadm-toggle-off');
      domToggle.classList.add(_simMaxxDomingos?'hadm-toggle-on':'hadm-toggle-off');
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

    var ttl=_el('div','hadm-ttl--render-proy-diagnostico');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent='DIAGNÓSTICO POR LOJA';
    c.appendChild(ttl);

    // Share de mercado Porto Santo — mantener la tabla (es útil y visual)
    var portoLojas=['MAXX','MEZKA AVENIDA','MEZKA MERCADO','SHANA'];
    var portoSection=_el('div','hadm-porto-section');
    portoSection.classList.add('hadm-mo-row-c');
    var psTtl=_el('div','hadm-ps-ttl');
    psTtl.classList.add('hadm-b-sub-c');
    psTtl.textContent='SHARE DE MERCADO — PORTO SANTO';
    portoSection.appendChild(psTtl);
    var yearsAll={};
    _allRows.forEach(function(r){yearsAll[r.data.substring(0,4)]=true;});
    var yearsList=Object.keys(yearsAll).sort();
    var tw=_el('div','hadm-tw--render-proy-diagnostico');
    var t=document.createElement('table');
    t.classList.add('hadm-t-sa');
    var thead=document.createElement('thead'),htr=document.createElement('tr');
    (['Loja'].concat(yearsList)).forEach(function(h){
      var th=document.createElement('th');th.textContent=h;
      th.classList.add('hadm-th-sa--render-proy-diagnostico');
      th.classList.add('hadm-th-c--render-proy-diagnostico');
      if(h==='Loja'){th.classList.add('hadm-th-left');}
      htr.appendChild(th);
    });
    thead.appendChild(htr);t.appendChild(thead);
    var tbody=document.createElement('tbody');
    portoLojas.forEach(function(loja,li){
      var tr=document.createElement('tr');
      var bgCls=li%2===0?'hadm-row-even':'hadm-row-odd';
      var tdL=document.createElement('td');
      tdL.textContent=LOJA_LABELS[loja]||loja;
      tdL.classList.add('hadm-td-l-sa');
      tdL.classList.add(bgCls);tdL.classList.add('hadm-loja-nom-c');
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
        td.classList.add('hadm-td-sa--render-proy-diagnostico');
        td.classList.add(bgCls);
        td.classList.add(share>=25?'hadm-diff-pos-c':share>=15?'hadm-dayval-nonzero':'hadm-dayval-zero');
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

      // Proyección año actual — aplicar el % de crecimiento vs año anterior
      // al total del año anterior completo. Más honesto que ratios históricos
      // contaminados por la nueva estructura de domingos.
      var projAnual=null;
      if(diagActual&&diagActual.total>0&&comparacoes2026.length>0){
        // Usar la comparación vs el año anterior más reciente (comparacoes2026[0])
        var cmpRecente=comparacoes2026[0];
        var yrAnteriorCompleto=diagHist.find(function(d){return d.yr===cmpRecente.yr;});
        if(yrAnteriorCompleto&&yrAnteriorCompleto.total>0&&cmpRecente.total>0){
          var fatorCrescimento=diagActual.total/cmpRecente.total;
          projAnual=yrAnteriorCompleto.total*fatorCrescimento;
        }
      }
      // Fallback: _calcProjection si no hay comparación disponible
      if(!projAnual&&diagActual&&diagActual.total>0){
        var lojaRowsProj=_allRows.filter(function(r){return r.loja===loja;});
        var projResult=_calcProjection(lojaRowsProj,String(currentYear)+'-01-01',String(currentYear)+'-12-31',today,null);
        if(projResult&&projResult.valorProjetado>0) projAnual=projResult.valorProjetado;
      }

      // Card por tienda
      var sec=_el('div','hadm-sec');
      sec.classList.add('hadm-mo-row-c');

      // Header clickable
      var secHdr=_el('div','hadm-sec-hdr');
      var secLbl=_el('span','hadm-loja-nom');
      secLbl.classList.add('hadm-loja-nom-c');
      secLbl.textContent='▶ '+label;

      // Badge de tendencia
      var tBadge=_el('span','hadm-q-badge');
      var tColorCls=tendencia3==='crescente'?'hadm-tbadge-up':tendencia3==='decrescente'?'hadm-tbadge-down':'hadm-tbadge-flat';
      tBadge.classList.add(tColorCls);
      tBadge.textContent=tendencia3==='crescente'?'↑ tendência crescente':tendencia3==='decrescente'?'↓ tendência decrescente':'→ estável';
      secHdr.appendChild(secLbl);secHdr.appendChild(tBadge);
      sec.appendChild(secHdr);

      var secBody=_el('div','hadm-sec-body');
      var open=false;
      secHdr.addEventListener('click',function(){
        open=!open;
        secLbl.textContent=(open?'▼ ':'▶ ')+label;
        secBody.classList.toggle('show',open);
      });

      function _bloco(cor,titulo,html){
        var b=_el('div','hadm-bloco--render-proy-diagnostico');
        b.style.setProperty('border-left-color',cor,'important');
        var bT=_el('div','hadm-proj-lbl');
        bT.style.setProperty('color',cor,'important');bT.textContent=titulo;b.appendChild(bT);
        var bC=_el('div','hadm-b-c--render-proy-diagnostico');
        bC.classList.add('hadm-mo-lbl-c');bC.innerHTML=html;b.appendChild(bC);
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
            h1+=', com um impacto de '+(dEvt.diffTotal>=0?'<b class="hadm-txt-pos">+':'<b class="hadm-txt-neg">')+dEvt.diffTotal.toFixed(1)+'%</b> face ao ano anterior';
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
            h2+='vs <b>'+cmp.yr+'</b> ('+_fmtEur(cmp.total)+'): '+(cmp.diff>=0?'<b class="hadm-txt-pos">+':'<b class="hadm-txt-neg">')+cmp.diff.toFixed(1)+'%</b>; ';
          });
        }
        if(projAnual){
          h2+='<br>Se mantiver este ritmo, o ano pode fechar em <b>'+_fmtEur(projAnual)+'</b>.';
          var refAno=diagHist[diagHist.length-1];
          if(refAno&&refAno.total>0){
            var diffProj=(projAnual-refAno.total)/refAno.total*100;
            h2+=' Isso representaria '+(diffProj>=0?'<b class="hadm-txt-pos">+':'<b class="hadm-txt-neg">')+diffProj.toFixed(1)+'%</b> face a '+refAno.yr+'.';
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

  // ════════════════════════════════════════════════════════════
  //  TAB PREMIOS — Comparação justa 2025 vs 2026 por tienda/mês
  // ════════════════════════════════════════════════════════════

  // Estado de ventas nocturnas por tienda/mes: { 'LOJA:MM': valor }
  var _premiosNocturno = {};

  // ── Configuración del premio ──
  // Meses activos: Abril(4)–Septiembre(9)
  var PREMIOS_MESES_ACTIVOS = [4,5,6,7,8,9];
  // Valor del premio por mes
  var PREMIOS_VALOR = {4:100,5:100,6:100,7:200,8:200,9:100};
  // Mínimo de diferencia por tienda para ganar el premio
  var PREMIOS_MINIMO = {
    'MEZKA AVENIDA': 1700,
    'MEZKA MERCADO': 1700,
    'SHANA':         1250,
    'MAXX':          1250
  };
  // Mapeo nombre corto CSV → nombre completo
  var PREMIOS_PERSONAS = [
    {csv:'SANDRA M.',  nombre:'Sandra Melim'},
    {csv:'EDNA M.',    nombre:'Edna Melim'},
    {csv:'CARLA A.',   nombre:'Carla Alves'},
    {csv:'MARILIA S.', nombre:'Marilia Silva'}
  ];
  // Mapeo nombre en CSV de tienda → loja key
  var PREMIOS_CSV_LOJA = {
    'MEZKA AVENIDA': 'MEZKA AVENIDA',
    'MEZKA MERCADO': 'MEZKA MERCADO',
    'SHANA':         'SHANA',
    'MAXX':          'MAXX'
  };
  // Base de semanas (semana 1 = 2026-01-05)
  var PREMIOS_BASE_DATE = new Date('2026-01-05T00:00:00');

  // Caché de CSVs ya cargados: { 'porto_sN': texto | null }
  var _premiosCSVCache = {};

  // Obtiene la URL pública del bucket horarios
  function _premiosStorageUrl(filename) {
    try {
      var result = sbAdmin.storage.from('horarios').getPublicUrl(filename);
      return (result && result.data && result.data.publicUrl) ? result.data.publicUrl : null;
    } catch(e) { return null; }
  }

  // Calcula el número de semana para una fecha (lunes de la semana)
  function _premiosWeekNum(mondayDate) {
    var ms = new Date(mondayDate.getFullYear()+'-'+_pad(mondayDate.getMonth()+1)+'-'+_pad(mondayDate.getDate())+'T00:00:00') - PREMIOS_BASE_DATE;
    return Math.round(ms / (7 * 86400000)) + 1;
  }

  // Devuelve los lunes de semanas que tienen al menos un día en el mes dado
  function _premiosWeeksForMonth(year, month) {
    // Primer y último día del mes
    var firstDay = new Date(year, month-1, 1);
    var lastDay  = new Date(year, month, 0); // día 0 del mes siguiente = último del mes
    var weeks = [];
    // Buscar el lunes anterior o igual al firstDay
    var d = new Date(firstDay);
    var dow = d.getDay(); // 0=dom,1=lun,...
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // retroceder al lunes
    while(d <= lastDay) {
      weeks.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
    return weeks;
  }

  // Carga un CSV desde Storage (con caché)
  // Semanas < 17 usan datosfnc.csv; desde s17 usan porto_sN.csv
  var _SEMANA_PORTO = 17; // primera semana con archivo independiente

  function _premiosLoadCSV(weekNum) {
    var filename = weekNum < _SEMANA_PORTO ? 'datosfnc.csv' : 'porto_s' + weekNum + '.csv';
    var key = weekNum < _SEMANA_PORTO ? 'datosfnc' : 'porto_s' + weekNum;
    if(_premiosCSVCache.hasOwnProperty(key)) {
      return Promise.resolve(_premiosCSVCache[key]);
    }
    var url = _premiosStorageUrl(filename);
    if(!url) return Promise.resolve(null);
    return fetch(url).then(function(r){
      if(!r.ok) { _premiosCSVCache[key]=null; return null; }
      return r.text().then(function(txt){ _premiosCSVCache[key]=txt; return txt; });
    }).catch(function(){ _premiosCSVCache[key]=null; return null; });
  }

  // Parsea un CSV de horarios y devuelve:
  // { personaCsv: { lojaCsv: Set(fechas ISO trabajadas) } }
  function _premiosParseCSV(csvText) {
    if(!csvText) return {};
    var result = {};
    var lines = csvText.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    var currentStoreName = null;
    var currentDates = []; // fechas ISO de cada columna (índice 1-7)
    var i = 0;
    while(i < lines.length) {
      var cols = lines[i].split(',');
      // Cabecera de sección: PORTO SANTO,...
      if(cols[0] === 'PORTO SANTO') {
        i++;
        // Siguiente línea: nombre tienda + fechas
        if(i < lines.length) {
          var storeLine = lines[i].split(',');
          currentStoreName = storeLine[0].trim().toUpperCase();
          currentDates = [];
          for(var ci=1; ci<=7; ci++) {
            var dateStr = (storeLine[ci]||'').trim();
            // Formato DD/MM/YYYY → ISO YYYY-MM-DD
            var parts = dateStr.split('/');
            if(parts.length === 3) {
              currentDates.push(parts[2]+'-'+parts[1]+'-'+parts[0]);
            } else {
              currentDates.push(null);
            }
          }
        }
        i++;
        continue;
      }
      // Fila de persona: nombre+hrs, luego días
      // El nombre es la primera columna, puede tener hrs: "SANDRA M.40hrs"
      var rawName = cols[0].trim();
      // Extraer prefijo del nombre (sin número de horas): "SANDRA M."
      var personMatch = rawName.match(/^([A-ZÁÉÍÓÚÃÕÂÊÔ][^\d]+\.\s*)/);
      var personKey = personMatch ? personMatch[1].trim() : null;

      if(personKey && currentStoreName) {
        if(!result[personKey]) result[personKey] = {};
        if(!result[personKey][currentStoreName]) result[personKey][currentStoreName] = {};
        if(!result[personKey]['__ausencias__']) result[personKey]['__ausencias__'] = {};

        // Recorrer cada día (columnas 1-7)
        for(var di=1; di<=7; di++) {
          var cell = (cols[di]||'').trim().toUpperCase();
          var isoDate = currentDates[di-1];
          if(!isoDate) continue;

          // ¿Ausencia larga (no folga normal)?
          if(cell === 'FERIAS' || cell === 'LICENÇA' || cell === 'LICENCA' || cell === 'BAIXA') {
            result[personKey]['__ausencias__'][isoDate] = true;
          } else if(cell === 'FOLGA' || cell === '') {
            // folga normal — no cuenta como ausencia ni como trabajo
          } else if(cell === currentStoreName || PREMIOS_CSV_LOJA[cell] === PREMIOS_CSV_LOJA[currentStoreName]) {
            // La celda dice el nombre de esta misma tienda (apoio desde otra)
            result[personKey][currentStoreName][isoDate] = true;
          } else if(PREMIOS_CSV_LOJA[cell]) {
            // Está trabajando en otra tienda — registrar allí
            if(!result[personKey][cell]) result[personKey][cell] = {};
            result[personKey][cell][isoDate] = true;
          } else if(cell.includes(':')) {
            // Es un horario (HH:MM-HH:MM) → trabajó aquí
            result[personKey][currentStoreName][isoDate] = true;
            // Calcular horas: si no es 8h y no es 1h, registrar para acumular
            var parts = cell.split('-');
            if(parts.length === 2) {
              var startParts = parts[0].trim().split(':');
              var endParts = parts[1].trim().split(':');
              if(startParts.length === 2 && endParts.length === 2) {
                var startMin = parseInt(startParts[0])*60 + parseInt(startParts[1]);
                var endMin = parseInt(endParts[0])*60 + parseInt(endParts[1]);
                var horas = (endMin - startMin) / 60;
                // Si no es 8 horas y no es 1 hora, registrar
                if(horas !== 8 && horas !== 1) {
                  if(!result[personKey]['__horasParc__']) result[personKey]['__horasParc__'] = {};
                  if(!result[personKey]['__horasParc__'][currentStoreName]) result[personKey]['__horasParc__'][currentStoreName] = 0;
                  result[personKey]['__horasParc__'][currentStoreName] += horas;
                }
              }
            }
          }
        }
      }
      i++;
    }
    return result;
  }


  // Carga y agrega horarios de todas las semanas de un mes
  // Devuelve: { 'SANDRA M.': { 'MEZKA AVENIDA': {fechas}, '__ausencias__': {fechas}, ... }, ... }
  function _premiosHorariosDelMes(year, month) {
    var weeks = _premiosWeeksForMonth(year, month);
    var promises = weeks.map(function(monday) {
      return _premiosLoadCSV(_premiosWeekNum(monday));
    });

    // También consultar tabla ferias de Supabase para este año
    var feriasPromise = sbAdmin.from('ferias').select('nome,de,ate')
      .then(function(res){ return res.data || []; })
      .catch(function(){ return []; });

    return Promise.all([Promise.all(promises), feriasPromise]).then(function(results) {
      var csvTexts = results[0];
      var feriasRows = results[1];

      var merged = {};

      // Procesar CSVs
      csvTexts.forEach(function(csv) {
        var parsed = _premiosParseCSV(csv);
        Object.keys(parsed).forEach(function(person) {
          if(!merged[person]) merged[person] = {};
          Object.keys(parsed[person]).forEach(function(store) {
            if(!merged[person][store]) merged[person][store] = {};
            Object.keys(parsed[person][store]).forEach(function(fecha) {
              var m = parseInt((fecha||'').substring(5,7));
              var y = parseInt((fecha||'').substring(0,4));
              if(y === year && m === month) {
                merged[person][store][fecha] = true;
              }
            });
          });
        });
      });

      // Añadir días de férias desde Supabase
      // Cruzar nombre completo de ferias con clave CSV de PREMIOS_PERSONAS
      feriasRows.forEach(function(f) {
        // Buscar la persona en PREMIOS_PERSONAS por nombre completo (case-insensitive)
        var personaMatch = null;
        PREMIOS_PERSONAS.forEach(function(p) {
          if(p.nombre.toUpperCase() === (f.nome||'').toUpperCase()) personaMatch = p;
        });
        if(!personaMatch) return;

        // Parsear fechas de férias (formato DD/MM/YYYY o YYYY-MM-DD)
        function parseFeriaDate(str) {
          if(!str) return null;
          if(str.includes('/')) {
            var parts = str.split('/');
            return new Date(+parts[2], +parts[1]-1, +parts[0]);
          }
          var parts = str.split('-');
          return new Date(+parts[0], +parts[1]-1, +parts[2]);
        }
        var deD = parseFeriaDate(f.de);
        var ateD = parseFeriaDate(f.ate);
        if(!deD || !ateD) return;

        // Iterar cada día del rango de férias
        var d = new Date(deD);
        while(d <= ateD) {
          var dy = d.getFullYear();
          var dm = d.getMonth() + 1;
          if(dy === year && dm === month) {
            var isoDate = dy + '-' + _pad(dm) + '-' + _pad(d.getDate());
            var csvKey = personaMatch.csv;
            if(!merged[csvKey]) merged[csvKey] = {};
            if(!merged[csvKey]['__ausencias__']) merged[csvKey]['__ausencias__'] = {};
            merged[csvKey]['__ausencias__'][isoDate] = true;
          }
          d.setDate(d.getDate() + 1);
        }
      });

      return merged;
    });
  }

  // Calcula días calendario del mes
  function _diasDelMes(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function _renderPremioPersonas(horariosData, loja, mo, year, premioValor, diff, minimo) {
    var wrap = _el('div','hadm-wrap--render-premio-personas');
    var ganoObjetivo = (diff !== null && diff >= minimo);

    wrap.classList.add(ganoObjetivo ? 'hadm-maxx-panel-on' : 'hadm-wrap-off');

    var wHdr = _el('div','hadm-s-lbl');
    wHdr.classList.add(ganoObjetivo ? 'hadm-txt-green' : 'hadm-txt-gray888');
    wHdr.textContent = ganoObjetivo
      ? '✓ OBJETIVO ATINGIDO — PRÉMIO ' + premioValor + '€'
      : '✗ OBJETIVO NÃO ATINGIDO';
    wrap.appendChild(wHdr);

    if(!ganoObjetivo) {
      var falta = minimo - (diff||0);
      var faltaEl = _el('div','hadm-falta-el');
      faltaEl.classList.add('hadm-falta-el-c');
      var mesAtual = parseInt(_todayStr().substring(5,7));
      var verbo = (mo === mesAtual) ? 'Faltam' : 'Faltaram';
      faltaEl.textContent = verbo + ' ' + _fmtEur(falta) + ' para atingir o objectivo mínimo de +' + _fmtEur(minimo);
      wrap.appendChild(faltaEl);
      return wrap;
    }

    // Calcular días trabajados por persona en esta tienda
    var lojaCSVKey = loja;
    var participaciones = [];
    PREMIOS_PERSONAS.forEach(function(p) {
      var fechasEnEstaLoja = horariosData[p.csv] && horariosData[p.csv][lojaCSVKey]
        ? Object.keys(horariosData[p.csv][lojaCSVKey]) : [];
      if(fechasEnEstaLoja.length === 0) return;
      var diasAusencia = horariosData[p.csv] && horariosData[p.csv]['__ausencias__']
        ? Object.keys(horariosData[p.csv]['__ausencias__']).length : 0;
      
      // Calcular días adicionales de horas parciales >= 8h
      var horasParc = horariosData[p.csv] && horariosData[p.csv]['__horasParc__'] && horariosData[p.csv]['__horasParc__'][lojaCSVKey]
        ? horariosData[p.csv]['__horasParc__'][lojaCSVKey] : 0;
      var diasAdicionales = Math.floor(horasParc / 8);
      var horasRestantes = horasParc % 8;
      var diasTotal = fechasEnEstaLoja.length + diasAdicionales;
      
      participaciones.push({
        nombre: p.nombre,
        dias: fechasEnEstaLoja.length,
        diasAdicionales: diasAdicionales,
        horasRestantes: horasRestantes,
        diasTotal: diasTotal,
        ausencias: diasAusencia
      });
    });

    if(!participaciones.length) {
      var noData = _el('div','hadm-falta-el');
      noData.classList.add('hadm-b-sub-c');
      noData.textContent = 'Sem dados de horário disponíveis para este mês.';
      wrap.appendChild(noData);
      return wrap;
    }

    // Tabla: nombre | días trabajados
    var pt = document.createElement('table');
    pt.classList.add('hadm-pt-sa');
    participaciones.forEach(function(p,i) {
      var ptr = document.createElement('tr');
      var pbgCls = i%2===0?'hadm-row-even':'hadm-row-odd-green';

      var tdNom = document.createElement('td');
      tdNom.textContent = p.nombre;
      tdNom.classList.add('hadm-td-nom-sa');
      tdNom.classList.add(pbgCls);
      tdNom.classList.add('hadm-loja-nom-c');
      ptr.appendChild(tdNom);

      var tdDias = document.createElement('td');
      var diasLabel = p.diasTotal + ' dias trabalhados';
      if(p.horasRestantes > 0) diasLabel += ' + ' + p.horasRestantes.toFixed(1) + 'h';
      if(p.ausencias > 0) diasLabel += ' · ' + p.ausencias + 'd férias';
      tdDias.textContent = diasLabel;
      tdDias.classList.add('hadm-td-dias-sa');
      tdDias.classList.add(pbgCls);
      tdDias.classList.add('hadm-mo-tl-c');
      ptr.appendChild(tdDias);

      pt.appendChild(ptr);
    });
    wrap.appendChild(pt);
    return wrap;
  }

  function _renderPremios() {
    var c = _getContent(); if(!c) return;
    c.innerHTML = ''; _setupContent(c);

    var LOJAS_PREMIOS = ['MEZKA AVENIDA','MEZKA MERCADO','MAXX','SHANA'];
    // Año actual: tomamos el año del último dato cargado en _allRows
    var currentYear = parseInt(_todayStr().substring(0,4));

    // Título
    var ttl = _el('div','hadm-h-lbl--render-domingo-ps');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent = '🏆 PRÉMIOS — COMPARAÇÃO JUSTA 2025 vs 2026';
    c.appendChild(ttl);

    var sub = _el('div','hadm-sub');
    sub.classList.add('hadm-no-data-c');
    sub.textContent = 'Para cada loja: facturado 2025 vs facturado 2026 menos os domingos (única diferença operacional). Jun/Jul/Ago: subtrair também as vendas nocturnas introduzidas manualmente.';
    c.appendChild(sub);

    LOJAS_PREMIOS.forEach(function(loja) {
      var label = LOJA_LABELS[loja] || loja;
      var lojaRows = _allRows.filter(function(r){ return r.loja === loja; });

      // Último día con dato cargado para esta tienda — independiente de las demás
      var lojaLastDay = lojaRows
        .filter(function(r){ return r.data.substring(0,4) === String(currentYear); })
        .map(function(r){ return r.data; })
        .sort()
        .pop() || '';
      var lojaLastMonth = lojaLastDay ? parseInt(lojaLastDay.substring(5,7)) : 0;

      if(!lojaLastDay) return; // sin datos 2026, saltar

      var card = _el('div','hadm-sim-wrap');
      card.classList.add('hadm-mo-row-c');

      // Header: nombre + hasta qué día
      var cardHdr = _el('div','hadm-card-hdr');
      var cardNom = _el('span','hadm-loja-nom');
      cardNom.classList.add('hadm-loja-nom-c');
      cardNom.textContent = label;
      var cardHasta = _el('span','hadm-proj-lbl--render-proy-general');
      cardHasta.classList.add('hadm-b-sub-c');
      cardHasta.textContent = 'até ' + _fmtDate(lojaLastDay);
      cardHdr.appendChild(cardNom);
      cardHdr.appendChild(cardHasta);
      card.appendChild(cardHdr);

      // Tabla
      var tw = _el('div','hadm-tw--render-premios');
      var t = document.createElement('table');
      t.classList.add('hadm-t-sa--render-premios');

      var thead = document.createElement('thead');
      var htr = document.createElement('tr');
      ['Mês','2025','Dom. 2026','2026 ajust.','Diferença','Vend. noturnas'].forEach(function(h,hi) {
        var th = document.createElement('th');
        th.textContent = h;
        th.classList.add('hadm-th-sa--render-premios');
        th.classList.toggle('hadm-th-left',hi===0);
        th.classList.add('hadm-th-c--render-proy-diagnostico');
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      t.appendChild(thead);

      var tbody = document.createElement('tbody');
      var totalBase = 0, totalAjust = 0, totalDiff = 0;

      for(var mo = 1; mo <= lojaLastMonth; mo++) {
        var moStr = _pad(mo);
        var moName = MESES_PT[mo-1];
        var isNocturnoMes = (mo >= 6 && mo <= 8);
        var nocturnoKey = loja + ':' + moStr;
        var nocturnoVal = parseFloat(_premiosNocturno[nocturnoKey]) || 0;

        // 2025: total del mes completo de esta tienda
        var total2025 = lojaRows.filter(function(r){
          return r.data.substring(0,4) === '2025' &&
                 parseInt(r.data.substring(5,7)) === mo;
        }).reduce(function(s,r){ return s + (parseFloat(r.montante)||0); }, 0);

        // 2026: total del mes hasta el último día cargado de esta tienda
        // Para el mes en curso usamos lojaLastDay como tope; meses anteriores: mes completo
        var moTo = (mo === lojaLastMonth) ? lojaLastDay : (String(currentYear)+'-'+moStr+'-31');
        var total2026 = lojaRows.filter(function(r){
          return r.data.substring(0,4) === String(currentYear) &&
                 parseInt(r.data.substring(5,7)) === mo &&
                 r.data <= moTo;
        }).reduce(function(s,r){ return s + (parseFloat(r.montante)||0); }, 0);

        // ── Auditoría de domingos: emparejamiento posicional desde el FIN del mes ──
        // Cada domingo de 2026 se empareja con el domingo de 2025 que ocupa su misma
        // posición contando desde el ULTIMO domingo del mes hacia atras (ultimo<->ultimo,
        // penultimo<->penultimo, ...). Se descuenta el domingo de 2026 SOLO si su par
        // de 2025 estuvo cerrado (venta 0) o no existe.
        // Esto maneja correctamente tiendas irregulares: si 2025 abrio el penultimo
        // domingo pero NO el ultimo, se protege exactamente el domingo de 2026 que cae
        // en esa misma posicion desde el final, no el ultimo del mes.

        // Domingos de 2025 del calendario del mes, con su venta real, ordenados ASC
        var domsCal2025 = _domingosCalendarioMes(2025, mo);
        var venta2025PorDom = {};
        lojaRows.forEach(function(r){
          if(r.data.substring(0,4)==='2025' && parseInt(r.data.substring(5,7))===mo &&
             _strToDate(r.data).getDay()===0){
            venta2025PorDom[r.data] = parseFloat(r.montante)||0;
          }
        });
        // Flag abierto/cerrado por posición desde el final (índice 0 = último domingo)
        var abierto2025DesdeFinal = [];
        for(var k2025 = domsCal2025.length - 1; k2025 >= 0; k2025--){
          abierto2025DesdeFinal.push((venta2025PorDom[domsCal2025[k2025]]||0) > 0);
        }

        // Domingos de 2026 cargados de esta tienda (hasta moTo), ordenados ASC
        var domingos2026 = lojaRows.filter(function(r){
          return r.data.substring(0,4) === String(currentYear) &&
                 parseInt(r.data.substring(5,7)) === mo &&
                 r.data <= moTo &&
                 _strToDate(r.data).getDay() === 0;
        }).sort(function(a,b){ return a.data < b.data ? -1 : 1; });
        var nDomingos2026Total = domingos2026.length;

        // Todos los domingos del calendario 2026 (para conocer la posición desde el final)
        var domsCal2026 = _domingosCalendarioMes(currentYear, mo);

        // Para cada domingo cargado de 2026: calcular su posición desde el final del mes
        // y descontarlo si el par de 2025 en esa misma posición estuvo cerrado/ausente.
        var totalDomingos2026 = 0;
        var nDescontar = 0;
        domingos2026.forEach(function(r){
          var posDesdeFinal = (domsCal2026.length - 1) - domsCal2026.indexOf(r.data);
          var parAbierto = (posDesdeFinal < abierto2025DesdeFinal.length)
            ? abierto2025DesdeFinal[posDesdeFinal]
            : false; // 2025 no tenia domingo en esa posicion → sin par → descontar
          if(!parAbierto){
            totalDomingos2026 += parseFloat(r.montante) || 0;
            nDescontar++;
          }
        });
        var nDomingos2026 = nDescontar;

        // 2026 ajustado: quitar domingos sin par en 2025 y ventas nocturnas
        var total2026Ajust = total2026 - totalDomingos2026 - nocturnoVal;

        var hasDatos = total2025 > 0 || total2026 > 0;
        var diff = hasDatos ? (total2026Ajust - total2025) : null;

        if(hasDatos) {
          totalBase  += total2025;
          totalAjust += total2026Ajust;
          totalDiff  += (diff || 0);
        }

        var tr = document.createElement('tr');
        var bgCls = mo % 2 === 0 ? 'hadm-row-even' : 'hadm-row-odd';

        // Mes
        var tdMes = document.createElement('td');
        tdMes.textContent = moName;
        tdMes.classList.add('hadm-td-mes-sa');
        tdMes.classList.add(bgCls);
        tdMes.classList.add('hadm-loja-nom-c');
        tr.appendChild(tdMes);

        // 2025
        var td25 = document.createElement('td');
        td25.textContent = total2025 > 0 ? _fmtEur(total2025) : '—';
        td25.classList.add('hadm-td25-sa');
        td25.classList.add(bgCls);
        td25.classList.add('hadm-mo-lbl-c');
        tr.appendChild(td25);

        // Domingos 2026 — muestra descontados/total para trazabilidad
        var tdDom = document.createElement('td');
        if(nDomingos2026Total > 0) {
          var domTxt = nDescontar+'d · -'+_fmtEur(totalDomingos2026);
          if(nDescontar < nDomingos2026Total) {
            domTxt += ' ('+nDomingos2026Total+'↓'+nDescontar+')';
          }
          tdDom.textContent = domTxt;
        } else {
          tdDom.textContent = '—';
        }
        tdDom.classList.add('hadm-td-dom-sa');
        tdDom.classList.add(bgCls);
        tdDom.classList.add('hadm-falta-el-c');
        tr.appendChild(tdDom);

        // 2026 ajustado
        var td26 = document.createElement('td');
        td26.textContent = hasDatos ? _fmtEur(total2026Ajust) : '—';
        td26.classList.add('hadm-td25-sa');
        td26.classList.add(bgCls);
        td26.classList.add('hadm-loja-nom-c');
        tr.appendChild(td26);

        // Diferença
        var tdDiff = document.createElement('td');
        if(diff !== null) {
          tdDiff.textContent = (diff >= 0 ? '+' : '') + _fmtEur(diff);
          tdDiff.classList.add(diff >= 0 ? 'hadm-diff-pos-c' : 'hadm-diff-neg-c');
        } else {
          tdDiff.textContent = '—';
          tdDiff.classList.add('hadm-td-diff-c');
        }
        tdDiff.classList.add('hadm-td-diff-sa');
        tdDiff.classList.add(bgCls);
        tr.appendChild(tdDiff);

        // Ventas nocturnas (solo jun/jul/ago)
        var tdNoct = document.createElement('td');
        tdNoct.classList.add('hadm-td-noct-sa');
        tdNoct.classList.add(bgCls);
        if(isNocturnoMes) {
          var inpNoct = document.createElement('input');
          inpNoct.type = 'number';
          inpNoct.step = '0.01';
          inpNoct.min = '0';
          inpNoct.placeholder = '0,00';
          inpNoct.value = nocturnoVal > 0 ? nocturnoVal : '';
          inpNoct.classList.add('hadm-inp-noct-sa');
          inpNoct.classList.add('hadm-inp-inicio-c');
          // Capturar nocturnoKey en closure
          (function(key, inp){
            inp.addEventListener('change',function(){
              _premiosNocturno[key] = parseFloat(inp.value) || 0;
              _renderPremios();
            });
          })(nocturnoKey, inpNoct);
          tdNoct.appendChild(inpNoct);
        } else {
          tdNoct.textContent = '—';
          tdNoct.classList.add('hadm-td-diff-c');
        }
        tr.appendChild(tdNoct);

        tbody.appendChild(tr);
      }

      t.appendChild(tbody);

      // Fila total
      var tfoot = document.createElement('tfoot');
      var ftr = document.createElement('tr');
      [['TOTAL','left'],['','right'],['','right'],['','right'],['','right'],['','right']].forEach(function(col,fi){
        var td = document.createElement('td');
        td.classList.add('hadm-td-sa--render-premios');
        td.classList.toggle('hadm-th-left',fi===0);
        if(fi === 0) {
          td.textContent = 'TOTAL';
          td.classList.add('hadm-fw800','hadm-tfoot-total');
          td.classList.add('hadm-mo-tl-c');
        } else if(fi === 1) {
          td.textContent = _fmtEur(totalBase);
          td.classList.add('hadm-fw800');
          td.classList.add('hadm-mo-lbl-c');
        } else if(fi === 3) {
          td.textContent = _fmtEur(totalAjust);
          td.classList.add('hadm-fw800');
          td.classList.add('hadm-loja-nom-c');
        } else if(fi === 4) {
          td.textContent = (totalDiff >= 0 ? '+' : '') + _fmtEur(totalDiff);
          td.classList.add('hadm-tfoot-diff');
          td.classList.add(totalDiff >= 0 ? 'hadm-diff-pos-c' : 'hadm-diff-neg-c');
        }
        td.classList.add('hadm-loja-row-c');
        ftr.appendChild(td);
      });
      tfoot.appendChild(ftr);
      t.appendChild(tfoot);

      tw.appendChild(t);
      card.appendChild(tw);

      // ── Sección de prémios por persona — cargada desde horarios ──
      // Solo meses activos del premio (Abril-Septiembre) con datos
      var premiosMesesActivos = [];
      for(var pmo=1; pmo<=lojaLastMonth; pmo++) {
        if(PREMIOS_MESES_ACTIVOS.indexOf(pmo) < 0) continue;
        if(!PREMIOS_MINIMO[loja]) continue;
        (function(m) {
          var pmoStr = _pad(m);
          var pmoTo = (m === lojaLastMonth) ? lojaLastDay : (String(currentYear)+'-'+pmoStr+'-31');
          var p2025 = lojaRows.filter(function(r){
            return r.data.substring(0,4)==='2025' && parseInt(r.data.substring(5,7))===m;
          }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          var p2026 = lojaRows.filter(function(r){
            return r.data.substring(0,4)===String(currentYear) &&
                   parseInt(r.data.substring(5,7))===m && r.data<=pmoTo;
          }).reduce(function(s,r){return s+(parseFloat(r.montante)||0);},0);
          // Emparejamiento posicional desde el fin del mes (idéntico al de la tabla)
          var pDomsCal2025 = _domingosCalendarioMes(2025, m);
          var pVenta2025PorDom = {};
          lojaRows.forEach(function(r){
            if(r.data.substring(0,4)==='2025' && parseInt(r.data.substring(5,7))===m &&
               _strToDate(r.data).getDay()===0){
              pVenta2025PorDom[r.data] = parseFloat(r.montante)||0;
            }
          });
          var pAbierto2025DesdeFinal = [];
          for(var pk=pDomsCal2025.length-1; pk>=0; pk--){
            pAbierto2025DesdeFinal.push((pVenta2025PorDom[pDomsCal2025[pk]]||0) > 0);
          }
          var pDomsCal2026 = _domingosCalendarioMes(currentYear, m);
          var pDomingos2026 = lojaRows.filter(function(r){
            return r.data.substring(0,4)===String(currentYear) &&
                   parseInt(r.data.substring(5,7))===m && r.data<=pmoTo &&
                   _strToDate(r.data).getDay()===0;
          }).sort(function(a,b){ return a.data < b.data ? -1 : 1; });
          var pDom = 0;
          pDomingos2026.forEach(function(r){
            var pPos = (pDomsCal2026.length-1) - pDomsCal2026.indexOf(r.data);
            var pPar = (pPos < pAbierto2025DesdeFinal.length) ? pAbierto2025DesdeFinal[pPos] : false;
            if(!pPar) pDom += parseFloat(r.montante)||0;
          });
          var pNoct = parseFloat(_premiosNocturno[loja+':'+pmoStr])||0;
          var pDiff = (p2025>0||p2026>0) ? (p2026-pDom-pNoct-p2025) : null;
          premiosMesesActivos.push({mo:m, diff:pDiff});
        })(pmo);
      }

      if(premiosMesesActivos.length > 0) {
        var premiosSecTtl = _el('div','hadm-premios-sec-ttl');
        premiosSecTtl.classList.add('hadm-b-sub-c');
        premiosSecTtl.textContent = '👥 ATRIBUIÇÃO DE PRÉMIOS POR COLABORADORA';
        card.appendChild(premiosSecTtl);

        var premiosSecWrap = _el('div','hadm-premios-sec-wrap');
        card.appendChild(premiosSecWrap);

        // Placeholder de carga
        var loadingEl = _el('div','hadm-loading-el');
        loadingEl.classList.add('hadm-no-data-c');
        loadingEl.textContent = 'A carregar horários…';
        premiosSecWrap.appendChild(loadingEl);

        // Cargar horarios de los meses activos de forma asíncrona
        var mesesUnicos = premiosMesesActivos.map(function(x){return x.mo;});
        var horariosPromises = mesesUnicos.map(function(pmo){
          return _premiosHorariosDelMes(currentYear, pmo).then(function(data){
            return {mo:pmo, data:data};
          });
        });

        Promise.all(horariosPromises).then(function(results) {
          loadingEl.remove();
          var horariosMap = {};
          results.forEach(function(r){ horariosMap[r.mo]=r.data; });

          premiosMesesActivos.forEach(function(item) {
            var pmo = item.mo;
            var pDiff = item.diff;
            var premioValor = PREMIOS_VALOR[pmo] || 100;
            var minimo = PREMIOS_MINIMO[loja] || 1700;
            var moLabel = MESES_PT[pmo-1];

            var moSec = _el('div','');
            var moHdr = _el('div','hadm-mo-hdr--render-premios');
            moHdr.classList.add('hadm-mo-tl-c');
            moHdr.textContent = moLabel + ' — ' + premioValor + '€ / colaboradora';
            moSec.appendChild(moHdr);

            var horariosData = horariosMap[pmo] || {};
            var personasWrap = _renderPremioPersonas(horariosData, loja, pmo, currentYear, premioValor, pDiff, minimo);
            moSec.appendChild(personasWrap);
            premiosSecWrap.appendChild(moSec);
          });
        }).catch(function() {
          loadingEl.textContent = 'Erro ao carregar horários.';
          loadingEl.classList.remove('hadm-no-data-c');
          loadingEl.classList.add('hadm-falta-el-c');
        });
      }

      // Nota nocturno si hay valores
      var noctKeys = ['06','07','08'].filter(function(mm){ return (_premiosNocturno[loja+':'+mm]||0) > 0; });
      if(noctKeys.length > 0) {
        var noctTotal = noctKeys.reduce(function(s,mm){ return s+(parseFloat(_premiosNocturno[loja+':'+mm])||0); },0);
        var noctNota = _el('div','hadm-maxx-info');
        noctNota.classList.add('hadm-b-sub-c');
        noctNota.textContent = '* Vendas noturnas subtraídas: ' + _fmtEur(noctTotal) + ' (Jun/Jul/Ago)';
        card.appendChild(noctNota);
      }

      c.appendChild(card);
    });

    // Nota metodología
    var nota = _el('div','hadm-nota');
    nota.classList.add('hadm-nota-c');
    nota.innerHTML = '<b class="hadm-txt-label">Metodologia:</b> 2026 ajust. = total 2026 − domingos 2026 (− vendas noturnas Jun/Jul/Ago). Cada loja mostra dados até ao último dia carregado individualmente.';
    c.appendChild(nota);
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
    var ttl=_el('div','hadm-ttl--render-proy-diagnostico');
    ttl.classList.add('hadm-b-sub-c');
    ttl.textContent='CARGA DIÁRIA DE VENDAS';
    c.appendChild(ttl);

    // ── Selector de fecha (sin valor por defecto — obliga a elegir conscientemente)
    var dateWrap=_el('div','hadm-date-wrap');
    dateWrap.classList.add('hadm-mo-row-c');
    var dateLbl=_el('span','hadm-date-lbl');
    dateLbl.classList.add('hadm-b-sub-c');
    dateLbl.textContent='DATA';
    var iS='hadm-i-s--render-carregar';
    var inpData=_el('input',iS);
    inpData.type='date';
    inpData.id='hadm-carga-data';
    inpData.classList.add('hadm-inp-inicio-c');
    // Sin value por defecto — el usuario debe seleccionarlo
    dateWrap.appendChild(dateLbl);
    dateWrap.appendChild(inpData);

    // Hint
    var dateHint=_el('span','hadm-date-hint');
    dateHint.classList.add('hadm-no-data-c');
    dateHint.textContent='Selecione a data antes de registar';
    dateWrap.appendChild(dateHint);
    c.appendChild(dateWrap);

    // Cuando cambia la fecha: cargar valores existentes de Supabase
    inpData.addEventListener('change',function(){
      var d=inpData.value;
      if(!d) return;
      dateHint.textContent='A carregar valores existentes…';
      dateHint.classList.remove('hadm-no-data-c','hadm-falta-el-c','hadm-date-hint-found');
      dateHint.classList.add('hadm-no-data-c');
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
          dateHint.classList.remove('hadm-no-data-c','hadm-falta-el-c','hadm-date-hint-found');
          dateHint.classList.add(rows.length>0?'hadm-date-hint-found':'hadm-no-data-c');
        }).catch(function(){
          dateHint.textContent='Erro ao carregar valores existentes';
          dateHint.classList.remove('hadm-no-data-c','hadm-falta-el-c','hadm-date-hint-found');
          dateHint.classList.add('hadm-falta-el-c');
        });
    });

    // ── Grid de tiendas
    var grid=_el('div','hadm-grid--render-carregar');
    grid.id='hadm-carga-grid';
    c.appendChild(grid);

    // Inicializar estado vacío
    LOJAS.forEach(function(loja){
      var esPrimavera=LOJAS_PRIMAVERA.indexOf(loja)>=0;
      _cargaEstado[loja]=esPrimavera?{fat:0,dev:0,status:'pending'}:{total:0,status:'pending'};
    });
    _renderLojaCards(grid);

    // ── Tabla recientes
    var rT=_el('div','hadm-r-t');
    rT.classList.add('hadm-b-sub-c');
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
      var card=_el('div','hadm-card');
      card.classList.add(status==='saved'?'hadm-card-c--mk-save-btn-2':status==='error'?'hadm-card-c--mk-save-btn':'hadm-card-default');

      // Cabecera de card
      var cardHdr=_el('div','hadm-card-hdr--render-loja-cards');
      var cardNom=_el('span','hadm-c-val');
      cardNom.classList.add('hadm-loja-nom-c');
      cardNom.textContent=label;

      // Indicador estado
      var statusDot=_el('span','hadm-status-dot');
      if(status==='saved'){
        statusDot.textContent='✓ guardado';
        statusDot.classList.add('hadm-q-badge-c');
      } else if(status==='saving'){
        statusDot.textContent='↑ guardando…';
        statusDot.classList.add('hadm-status-dot-c');
      } else if(status==='error'){
        statusDot.textContent='✗ erro';
        statusDot.classList.add('hadm-status-dot-c--render-loja-cards');
      } else {
        statusDot.textContent='pendente';
        statusDot.classList.add('hadm-status-dot-c--render-loja-cards-2');
      }
      cardHdr.appendChild(cardNom);
      cardHdr.appendChild(statusDot);
      card.appendChild(cardHdr);

      var iSCard='hadm-i-scard';

      if(esPrimavera){
        // Dos campos: Facturação y Devoluções → neto calculado
        var row2=_el('div','hadm-row2');

        var fFat=_el('div','hadm-f-fat');
        var lFat=_el('label','hadm-l-fat');
        lFat.classList.add('hadm-m-hist-c');
        lFat.textContent='Facturação (€)';
        var inpFat=_el('input',iSCard);
        inpFat.type='number';inpFat.step='0.01';inpFat.min='0';inpFat.placeholder='0.00';
        inpFat.value=estado.fat||'';
        inpFat.classList.add('hadm-inp-inicio-c');
        fFat.appendChild(lFat);fFat.appendChild(inpFat);

        var fDev=_el('div','hadm-f-fat');
        var lDev=_el('label','hadm-l-fat');
        lDev.classList.add('hadm-m-hist-c');
        lDev.textContent='Devoluções (€)';
        var inpDev=_el('input',iSCard);
        inpDev.type='number';inpDev.step='0.01';inpDev.min='0';inpDev.placeholder='0.00';
        inpDev.value=estado.dev||'';
        inpDev.classList.add('hadm-inp-inicio-c');
        fDev.appendChild(lDev);fDev.appendChild(inpDev);

        // Neto display
        var fNeto=_el('div','hadm-f-neto');
        var lNeto=_el('label','hadm-l-fat');
        lNeto.classList.add('hadm-p-lbl-c');
        lNeto.textContent='Neto';
        var netoVal=_el('div','hadm-neto-val');
        netoVal.classList.add('hadm-loja-nom-c');
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
        var rowT=_el('div','hadm-row2');
        var fTot=_el('div','hadm-f-tot');
        var lTot=_el('label','hadm-l-fat');
        lTot.classList.add('hadm-m-hist-c');
        lTot.textContent='Total (€)';
        var inpTot=_el('input',iSCard);
        inpTot.type='number';inpTot.step='0.01';inpTot.min='0';inpTot.placeholder='0.00';
        inpTot.value=estado.total||'';
        inpTot.classList.add('hadm-inp-inicio-c');
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
    var btn=_el('div','hadm-btn--mk-save-btn');
    btn.classList.add('hadm-save-btn-c');
    btn.textContent='Guardar';
    btn.addEventListener('click',function(){
      var payload=getPayload();
      if(!payload) return;
      // Actualizar estado visual
      _cargaEstado[loja].status='saving';
      statusDot.textContent='↑ guardando…';
      statusDot.classList.remove('hadm-status-dot-c--render-loja-cards-2','hadm-status-dot-c','hadm-status-dot-c--render-loja-cards','hadm-q-badge-c','hadm-status-dot-c--flash-need-date');
      statusDot.classList.add('hadm-status-dot-c');
      card.classList.remove('hadm-card-default','hadm-card-c','hadm-card-c--mk-save-btn','hadm-card-c--mk-save-btn-2','hadm-card-c--mk-save-btn-3');
      card.classList.add('hadm-card-c');
      btn.classList.add('hadm-busy-50');

      sbAdmin.from('ventas_historicas').upsert(payload,{onConflict:'loja,data'})
        .then(function(res){
          btn.classList.remove('hadm-busy-50');
          if(res.error){
            _cargaEstado[loja].status='error';
            statusDot.textContent='✗ erro';
            statusDot.classList.remove('hadm-status-dot-c--render-loja-cards-2','hadm-status-dot-c','hadm-status-dot-c--render-loja-cards','hadm-q-badge-c','hadm-status-dot-c--flash-need-date');
            statusDot.classList.add('hadm-status-dot-c--render-loja-cards');
            card.classList.remove('hadm-card-default','hadm-card-c','hadm-card-c--mk-save-btn','hadm-card-c--mk-save-btn-2','hadm-card-c--mk-save-btn-3');
            card.classList.add('hadm-card-c--mk-save-btn');
          } else {
            _cargaEstado[loja].status='saved';
            statusDot.textContent='✓ guardado';
            statusDot.classList.remove('hadm-status-dot-c--render-loja-cards-2','hadm-status-dot-c','hadm-status-dot-c--render-loja-cards','hadm-q-badge-c','hadm-status-dot-c--flash-need-date');
            statusDot.classList.add('hadm-q-badge-c');
            card.classList.remove('hadm-card-default','hadm-card-c','hadm-card-c--mk-save-btn','hadm-card-c--mk-save-btn-2','hadm-card-c--mk-save-btn-3');
            card.classList.add('hadm-card-c--mk-save-btn-2');
            // Actualizar _allRows en memoria
            _allRows=_allRows.filter(function(r){return!(r.loja===payload.loja&&r.data===payload.data);});
            _allRows.push(payload);
            _loadRecentes();
          }
        }).catch(function(){
          btn.classList.remove('hadm-busy-50');
          _cargaEstado[loja].status='error';
          statusDot.textContent='✗ erro ligação';
          statusDot.classList.remove('hadm-status-dot-c--render-loja-cards-2','hadm-status-dot-c','hadm-status-dot-c--render-loja-cards','hadm-q-badge-c','hadm-status-dot-c--flash-need-date');
          statusDot.classList.add('hadm-status-dot-c--render-loja-cards');
          card.classList.remove('hadm-card-default','hadm-card-c','hadm-card-c--mk-save-btn','hadm-card-c--mk-save-btn-2','hadm-card-c--mk-save-btn-3');
          card.classList.add('hadm-card-c--mk-save-btn-3');
        });
    });
    return btn;
  }

  function _flashNeedDate(statusDot){
    statusDot.textContent='⚠ selecione a data';
    statusDot.classList.remove('hadm-status-dot-c--render-loja-cards-2','hadm-status-dot-c','hadm-status-dot-c--render-loja-cards','hadm-q-badge-c','hadm-status-dot-c--flash-need-date');
    statusDot.classList.add('hadm-status-dot-c--flash-need-date');
    var inpData=document.getElementById('hadm-carga-data');
    if(inpData){inpData.classList.add('hadm-card-c');setTimeout(function(){inpData.classList.remove('hadm-card-c');inpData.classList.add('hadm-inp-data-c');},2000);}
    setTimeout(function(){
      var e=_cargaEstado[statusDot._loja];
      statusDot.textContent=e&&e.status==='saved'?'✓ guardado':'pendente';
    },2000);
  }

  function _loadRecentes(){
    var box=document.getElementById('hadm-recentes');if(!box)return;
    box.innerHTML='<div class="hadm-loading-msg-sm">a carregar…</div>';
    // Última semana: 7 días × 7 tiendas = hasta 49 registros, ordenados por fecha desc
    var semanaAtras=_dateToStr(new Date(new Date().setDate(new Date().getDate()-7)));
    sbAdmin.from('ventas_historicas').select('*')
      .gte('data', semanaAtras)
      .order('data',{ascending:false})
      .order('loja',{ascending:true})
      .then(function(res){
        box.innerHTML='';
        if(res.error||!res.data||!res.data.length){
          var e=_el('div','hadm-e');
          e.classList.add('hadm-m-hist-c');
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
          var dHdr=_el('div','hadm-d-hdr');
          dHdr.classList.add('hadm-mo-tl-c');
          dHdr.textContent=_fmtDate(date)+' · '+_dowStr(date);
          box.appendChild(dHdr);

          var tw=_el('div','hadm-tw--load-recentes');
          var t=document.createElement('table');
          t.classList.add('hadm-t-sa--render-premios');

          var thead=document.createElement('thead'),htr=document.createElement('tr');
          ['Loja','Montante',''].forEach(function(h){
            var th=document.createElement('th');
            th.textContent=h;
            th.classList.add('hadm-th-sa--load-recentes');
            th.classList.add('hadm-th-c');
            htr.appendChild(th);
          });
          thead.appendChild(htr);t.appendChild(thead);

          var tbody=document.createElement('tbody');
          byDate[date].forEach(function(r,i){
            var tr=document.createElement('tr');
            var bgCls=i%2===0?'hadm-row-even':'hadm-row-odd';

            // Loja
            var tdL=document.createElement('td');
            tdL.textContent=LOJA_LABELS[r.loja]||r.loja;
            tdL.classList.add('hadm-td-sa');
            tdL.classList.add(bgCls);
            tdL.classList.add('hadm-loja-nom-c');

            // Montante (editable inline)
            var tdM=document.createElement('td');
            tdM.classList.add('hadm-td-m-sa');
            tdM.classList.add(bgCls);
            tdM.classList.add('hadm-loja-nom-c');
            var valSpan=document.createElement('span');
            valSpan.textContent=_fmtEur(r.montante);
            tdM.appendChild(valSpan);

            // Lápiz — edición inline
            var tdAct=document.createElement('td');
            tdAct.classList.add('hadm-td-act-sa');
            tdAct.classList.add(bgCls);
            var pencil=document.createElement('span');
            pencil.textContent='✏️';
            pencil.className='hadm-pencil';
            pencil.addEventListener('mouseenter',function(){pencil.classList.add('is-active');});
            pencil.addEventListener('mouseleave',function(){if(!pencil._editing)pencil.classList.remove('is-active');});
            pencil.addEventListener('click',function(){
              if(pencil._editing) return;
              pencil._editing=true;pencil.classList.add('is-active');
              // Reemplazar span por input
              var inp=document.createElement('input');
              inp.type='number';inp.step='0.01';inp.min='0';
              inp.value=parseFloat(r.montante)||0;
              inp.classList.add('hadm-inp-sa');
              inp.classList.add('hadm-inp-inicio-c');
              tdM.innerHTML='';tdM.appendChild(inp);inp.focus();inp.select();

              // Botones ✓ ✗
              var ok=document.createElement('span');ok.textContent='✓';
              ok.classList.add('hadm-ok-sa');
              var cancel=document.createElement('span');cancel.textContent='✗';
              cancel.classList.add('hadm-cancel-sa');
              tdAct.innerHTML='';tdAct.appendChild(ok);tdAct.appendChild(cancel);

              ok.addEventListener('click',function(){
                var newVal=parseFloat(inp.value)||0;
                ok.textContent='…';ok.classList.add('hadm-locked');
                sbAdmin.from('ventas_historicas').upsert({loja:r.loja,data:r.data,montante:newVal},{onConflict:'loja,data'})
                  .then(function(res2){
                    if(res2.error){
                      tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                      tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.classList.remove('is-active');
                    } else {
                      r.montante=newVal;
                      tdM.innerHTML='';valSpan.textContent=_fmtEur(newVal);tdM.appendChild(valSpan);
                      tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.classList.remove('is-active');
                      // Actualizar memoria
                      _allRows=_allRows.filter(function(x){return!(x.loja===r.loja&&x.data===r.data);});
                      _allRows.push({loja:r.loja,data:r.data,montante:newVal});
                    }
                  }).catch(function(){
                    tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                    tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.classList.remove('is-active');
                  });
              });
              cancel.addEventListener('click',function(){
                tdM.innerHTML='';valSpan.textContent=_fmtEur(r.montante);tdM.appendChild(valSpan);
                tdAct.innerHTML='';tdAct.appendChild(pencil);pencil._editing=false;pencil.classList.remove('is-active');
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
        var e=_el('div','hadm-e');
        e.classList.add('hadm-falta-el-c');
        e.textContent='Erro ao carregar registos.';
        box.appendChild(e);
      });
  }

  function _el(tag,cls,bg){var el=document.createElement(tag);if(cls)el.className=cls;if(bg)el.style.setProperty('background',bg,'important');return el;}
  function _setupContent(c){c.classList.add('hadm-c-c');}

  // IDs de todos los botones de período y zona
  var _PERIOD_BTNS = ['hadm-btn-mes','hadm-btn-ano','hadm-btn-q1','hadm-btn-q2','hadm-btn-q3','hadm-btn-q4','hadm-btn-total'];
  var _ZONE_BTNS   = ['hadm-btn-parfois','hadm-btn-parfois-arc','hadm-btn-parfois-mad','hadm-btn-primavera','hadm-btn-mezkafnc','hadm-btn-mezkaps','hadm-btn-mezkaavenida','hadm-btn-mezkamercado','hadm-btn-shana','hadm-btn-maxx','hadm-btn-domingo'];

  function _applyBtnStyles(){
    _PERIOD_BTNS.forEach(function(id){
      var el=document.getElementById(id);
      if(el){el.classList.add('hadm-pill');el.classList.toggle('hadm-pill-active',id===_activePeriodBtn);}
    });
    _ZONE_BTNS.forEach(function(id){
      var el=document.getElementById(id);
      if(el){el.classList.add('hadm-pill');el.classList.toggle('hadm-pill-active',id===_activeZoneBtn);}
    });
    ['hadm-tab-vendas','hadm-tab-carregar','hadm-tab-proyeccion','hadm-tab-premios'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      var tab=id.replace('hadm-tab-','');
      el.classList.add('hadm-tab');
      el.classList.toggle('hadm-tab-active',tab===_activeTab);
    });
  }

  var _listenersAttached=false;
  function _attachListeners(){
    if(_listenersAttached) return;
    _listenersAttached=true;
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
    ['vendas','carregar','proyeccion','premios'].forEach(function(tab){
      var btn=document.getElementById('hadm-tab-'+tab);
      if(!btn)return;
      btn.addEventListener('click',function(){_activeTab=tab;_applyBtnStyles();_render();});
    });

    // Botones de período — mantienen zona activa
    var periods={
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
        _applyBtnStyles();
        _render();
      });
    }

    // Mapa zona-btn → lojas que filtra
    var zBtns={
      'hadm-btn-parfois':      ZONA_PARFOIS,
      'hadm-btn-parfois-arc':  ['PARFOIS ARCADAS SAO FRANCISCO'],
      'hadm-btn-parfois-mad':  ['PARFOIS MADEIRA SHOPPING'],
      'hadm-btn-primavera':    ZONA_PRIMAVERA,
      'hadm-btn-mezkafnc':     ZONA_MEZKAFNC,
      'hadm-btn-mezkaps':      ZONA_MEZKAPS,
      'hadm-btn-mezkaavenida': ['MEZKA AVENIDA'],
      'hadm-btn-mezkamercado': ['MEZKA MERCADO'],
      'hadm-btn-shana':        ['SHANA'],
      'hadm-btn-maxx':         ['MAXX']
    };
    function _applyZone(lojas,btnId){
      var lojaEl=document.getElementById('hadm-loja');
      if(lojaEl){lojaEl.value='';lojaEl.dataset.zone=JSON.stringify(lojas);}
      _activeZoneBtn=btnId;
      _applyBtnStyles();
      _render();
    }
    Object.keys(zBtns).forEach(function(id){
      var btn=document.getElementById(id);if(!btn)return;
      btn.addEventListener('click',function(){
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
  }

})();
