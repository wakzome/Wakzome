(function () {

  // ══════════════════════════════════════════════════════════════════════
  //  INVENTARIO FÍSICO OFFLINE-FIRST — wakzome.com
  //
  //  Prioridad absoluta del proyecto: JAMÁS SE PIERDA UN SOLO ESCANEO.
  //  Por eso este archivo sigue, de punta a punta, el modelo:
  //
  //    ESCANEO → GUARDAR LOCALMENTE (IndexedDB) → CONTINUAR TRABAJANDO
  //            → (si hay red) ENVIAR A SUPABASE → CONFIRMACIÓN → SINCRONIZADO
  //
  //  Ningún escaneo depende de la red para existir. La red solo se usa
  //  para propagar lo que ya está guardado localmente.
  //
  //  Lo que este archivo NO implementa todavía (deliberadamente fuera del
  //  camino crítico de "no perder un escaneo"), y que queda para una
  //  siguiente entrega:
  //    - Informes/consolidaciones para el administrador (exportación).
  //    - Procedimiento de reapertura/corrección tras un cierre definitivo.
  //    - Service Worker / instalación como PWA.
  //    - Gesto de "3 pulsaciones" para entrada manual (se sustituye por un
  //      botón explícito "Introducir código manualmente", misma función).
  // ══════════════════════════════════════════════════════════════════════

  const SB_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  // Secreto para los códigos de autorización HMAC. No es un secreto frente
  // a las propias empleadas (Persona 1 y Persona 2 ya conocen el código
  // porque Persona 1 se lo enseña a Persona 2 físicamente) — es un
  // mecanismo de INTEGRIDAD DE FLUJO: hace que un código sea válido única y
  // exclusivamente para su tienda+inventario+unidad+intento exactos, de
  // forma determinística y sin necesidad de red. La barrera de seguridad
  // real frente a terceros es el token de sesión (x-inventario-token) y
  // las políticas RLS de la base de datos, no este secreto.
  const HMAC_SECRET = 'wkz-inv-codigos-2027-a19f4e7c';

  const IDB_NAME = 'wkz_inventario';
  const IDB_VERSION = 1;

  const ZONA_LABEL = { loja: 'Loja', armazem: 'Armazém' };
  const UNIDAD_LABEL = { loja: 'Expositor', armazem: 'Grupo' };

  // ── Estado en memoria de la sesión de inventario ──────────────────────
  const S = {
    token: null,
    persona: null,     // { id, nombre }
    rol: null,          // 'persona1' | 'persona2'
    tienda: null,        // { id, nombre }
    zona: null,          // 'loja' | 'armazem'
    inventario: null,    // fila de inventarios
    asignacionId: null,
    unidad: null,        // fila de unidades seleccionada
    intento: null,        // fila de intentos activa
    captura: null,        // fila de capturas activa
    pendientesSync: 0,
    dispositivoId: null
  };

  // ══════════════════════════════════════════════════════════════════════
  //  INDEXEDDB — persistencia local inmediata
  // ══════════════════════════════════════════════════════════════════════
  let dbPromise = null;

  function abrirDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('eventos')) {
          const store = db.createObjectStore('eventos', { keyPath: 'id' });
          store.createIndex('synced', 'synced');
          store.createIndex('captura_id', 'captura_id');
        }
        if (!db.objectStoreNames.contains('anulaciones_local')) {
          const store = db.createObjectStore('anulaciones_local', { keyPath: 'id' });
          store.createIndex('synced', 'synced');
        }
        if (!db.objectStoreNames.contains('sesion')) {
          db.createObjectStore('sesion', { keyPath: 'clave' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'clave' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbPut(storeName, valor) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(valor);
        tx.oncomplete = function () { resolve(valor); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(storeName, clave) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(clave);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetAllByIndex(storeName, indexName, valor) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, 'readonly');
        const idx = tx.objectStore(storeName).index(indexName);
        const req = idx.getAll(IDBKeyRange.only(valor));
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetAll(storeName) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // Fallback muy improbable de necesitarse (navegadores modernos ya lo traen).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function dispositivoId() {
    if (S.dispositivoId) return S.dispositivoId;
    let d;
    try {
      d = localStorage.getItem('wkz_inv_dispositivo');
    } catch (e) { d = null; }
    if (!d) {
      d = uuid();
      try { localStorage.setItem('wkz_inv_dispositivo', d); } catch (e) { /* ignorado */ }
    }
    S.dispositivoId = d;
    return d;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CÓDIGOS DE AUTORIZACIÓN — HMAC determinístico, funciona sin red
  // ══════════════════════════════════════════════════════════════════════
  async function codigoIndice(tiendaId, inventarioId, unidadId, numeroIntento, indice) {
    const material = tiendaId + '|' + inventarioId + '|' + unidadId + '|' + numeroIntento + '|' + indice;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const firma = await crypto.subtle.sign('HMAC', key, enc.encode(material));
    const bytes = new Uint8Array(firma);
    const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return String(n % 1000000).padStart(6, '0');
  }

  async function verificarCodigo(tiendaId, inventarioId, unidadId, numeroIntento, codigoIntroducido) {
    for (let i = 1; i <= 50; i++) {
      const c = await codigoIndice(tiendaId, inventarioId, unidadId, numeroIntento, i);
      if (c === codigoIntroducido.trim()) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SINCRONIZACIÓN — cola local, idempotente, por lotes
  // ══════════════════════════════════════════════════════════════════════
  let sincronizando = false;

  async function actualizarIndicador() {
    const eventos = await idbGetAll('eventos');
    const anul = await idbGetAll('anulaciones_local');
    const pendientes = eventos.filter(function (e) { return !e.synced; }).length +
      anul.filter(function (a) { return !a.synced; }).length;
    S.pendientesSync = pendientes;
    const el = document.getElementById('inv-indicador');
    if (!el) return;
    if (pendientes === 0) {
      el.textContent = '🟢 Datos protegidos';
      el.style.background = '#e6f7ec';
      el.style.color = '#1e7e34';
    } else if (navigator.onLine) {
      el.textContent = '🟠 Sincronizando… (' + pendientes + ' pendientes)';
      el.style.background = '#fff4e0';
      el.style.color = '#a15c00';
    } else {
      el.textContent = '🟠 Sin conexión — ' + pendientes + ' guardados localmente, pendientes de enviar';
      el.style.background = '#fff4e0';
      el.style.color = '#a15c00';
    }
  }

  function esConflictoDuplicado(error) {
    return !!(error && (error.code === '23505' || (error.message || '').indexOf('duplicate') !== -1));
  }

  async function sincronizar() {
    if (sincronizando || !navigator.onLine || !window.sbInventario) return;
    sincronizando = true;
    try {
      const eventos = (await idbGetAll('eventos')).filter(function (e) { return !e.synced; });
      const LOTE = 25;
      for (let i = 0; i < eventos.length; i += LOTE) {
        const lote = eventos.slice(i, i + LOTE).map(function (e) {
          return {
            id: e.id,
            captura_id: e.captura_id,
            codigo_barras: e.codigo_barras,
            referencia_resuelta: e.referencia_resuelta,
            descripcion_resuelta: e.descripcion_resuelta,
            dispositivo_id: e.dispositivo_id,
            creado_en_dispositivo_at: e.creado_en_dispositivo_at
          };
        });
        const { error } = await window.sbInventario.from('escaneos').insert(lote);
        if (!error || esConflictoDuplicado(error)) {
          for (const e of lote) {
            e.synced = true;
            await idbPut('eventos', Object.assign({}, eventos.find(function (x) { return x.id === e.id; }), { synced: true }));
          }
        } else {
          break; // se reintentará en el próximo ciclo
        }
      }

      const anulaciones = (await idbGetAll('anulaciones_local')).filter(function (a) { return !a.synced; });
      for (const a of anulaciones) {
        const { error } = await window.sbInventario.from('anulaciones').insert({
          id: a.id, escaneo_id: a.escaneo_id, motivo: a.motivo, persona_id: a.persona_id
        });
        if (!error || esConflictoDuplicado(error)) {
          await idbPut('anulaciones_local', Object.assign({}, a, { synced: true }));
        }
      }
    } catch (e) {
      // Fallo de red o similar: se reintentará en el siguiente ciclo. No se pierde nada:
      // los eventos siguen en IndexedDB con synced=false.
    } finally {
      sincronizando = false;
      await actualizarIndicador();
    }
  }

  setInterval(sincronizar, 5000);
  window.addEventListener('online', sincronizar);

  // ══════════════════════════════════════════════════════════════════════
  //  GUARDAR UN ESCANEO — nunca depende de la red
  // ══════════════════════════════════════════════════════════════════════
  async function registrarEscaneo(codigoBarras, referencia, descripcion) {
    const dispId = await dispositivoId();
    const evento = {
      id: uuid(),
      captura_id: S.captura.id,
      codigo_barras: codigoBarras,
      referencia_resuelta: referencia || null,
      descripcion_resuelta: descripcion || null,
      dispositivo_id: dispId,
      creado_en_dispositivo_at: new Date().toISOString(),
      synced: false
    };
    try {
      await idbPut('eventos', evento);
    } catch (e) {
      // Punto crítico: si esto falla, NO se debe fingir que el escaneo existe.
      mostrarModalIntegridad('No se pudo guardar el escaneo localmente. No continúes hasta resolver esto.');
      throw e;
    }
    sincronizar();
    return evento;
  }

  async function contarEscaneosValidos(capturaId) {
    const eventos = await idbGetAllByIndex('eventos', 'captura_id', capturaId);
    const anulTodas = await idbGetAll('anulaciones_local');
    const anuladosSet = new Set(anulTodas.map(function (a) { return a.escaneo_id; }));
    return eventos.filter(function (e) { return !anuladosSet.has(e.id); }).length;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  UI — overlay autónomo, no depende del CSS del sitio
  // ══════════════════════════════════════════════════════════════════════
  function inyectarEstilos() {
    if (document.getElementById('inv-estilos')) return;
    const style = document.createElement('style');
    style.id = 'inv-estilos';
    style.textContent = `
      #inv-root { position:fixed; inset:0; background:#fafafa; z-index:99999; display:flex;
        flex-direction:column; font-family:inherit; color:#222; overflow-y:auto; }
      #inv-root .inv-header { display:flex; justify-content:space-between; align-items:center;
        padding:14px 20px; border-bottom:1px solid #e5e5e5; background:#fff; }
      #inv-root .inv-header h1 { font-size:17px; font-weight:500; margin:0; }
      #inv-root .inv-body { flex:1; padding:24px; max-width:640px; margin:0 auto; width:100%; box-sizing:border-box; }
      #inv-root button { font-family:inherit; font-size:15px; padding:12px 18px; border-radius:24px;
        border:1px solid #ccc; background:#fff; cursor:pointer; margin:6px 6px 6px 0; }
      #inv-root button:hover { background:#f0f0f0; }
      #inv-root button.inv-primario { background:#222; color:#fff; border-color:#222; }
      #inv-root button.inv-primario:hover { background:#000; }
      #inv-root button.inv-peligro { border-color:#c0392b; color:#c0392b; }
      #inv-root button:disabled { opacity:.4; cursor:not-allowed; }
      #inv-root .inv-lista-item { display:flex; justify-content:space-between; align-items:center;
        padding:14px; border:1px solid #e5e5e5; border-radius:10px; margin-bottom:10px; background:#fff; }
      #inv-root input[type=text], #inv-root input[type=password], #inv-root input[type=number] {
        font-family:inherit; font-size:16px; padding:10px 12px; border:1px solid #ccc; border-radius:8px;
        width:100%; box-sizing:border-box; margin-bottom:10px; }
      #inv-root .inv-badge { font-size:12px; padding:4px 10px; border-radius:12px; font-weight:600; }
      #inv-root .inv-modal-fondo { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100000;
        display:flex; align-items:center; justify-content:center; }
      #inv-root .inv-modal { background:#fff; border-radius:14px; padding:26px; max-width:420px; width:90%; }
      #inv-root .inv-contador { font-size:56px; font-weight:300; text-align:center; margin:20px 0; }
      #inv-scan-input { position:absolute; opacity:0; pointer-events:none; }
    `;
    document.head.appendChild(style);
  }

  function root() {
    let el = document.getElementById('inv-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'inv-root';
      document.body.appendChild(el);
    }
    return el;
  }

  function render(headerHtml, bodyHtml) {
    root().innerHTML =
      '<div class="inv-header">' + headerHtml +
      '<span id="inv-indicador" class="inv-badge">🟢 Datos protegidos</span></div>' +
      '<div class="inv-body">' + bodyHtml + '</div>';
    actualizarIndicador();
  }

  function modal(html) {
    const fondo = document.createElement('div');
    fondo.className = 'inv-modal-fondo';
    fondo.innerHTML = '<div class="inv-modal">' + html + '</div>';
    root().appendChild(fondo);
    return fondo;
  }

  function mostrarModalIntegridad(mensaje) {
    const f = modal(
      '<h3>Vamos a parar un momento</h3><p>' + mensaje + '</p>' +
      '<p>Comprueba tu conexión e inténtalo de nuevo. Ningún dato guardado hasta ahora se pierde.</p>' +
      '<button class="inv-primario" onclick="this.closest(\'.inv-modal-fondo\').remove()">Entendido</button>'
    );
    return f;
  }

  function cerrarModal(btn) {
    const f = btn.closest('.inv-modal-fondo');
    if (f) f.remove();
  }
  window._invCerrarModal = cerrarModal;

  // ══════════════════════════════════════════════════════════════════════
  //  GUARDAR / RECUPERAR PUNTERO DE SESIÓN (para sobrevivir a un refresco
  //  de página SIN perder el contexto — pero siempre reverificando con el
  //  servidor antes de continuar, nunca confiando ciegamente en lo local).
  // ══════════════════════════════════════════════════════════════════════
  async function guardarPuntero() {
    await idbPut('sesion', {
      clave: 'actual',
      personaId: S.persona ? S.persona.id : null,
      personaNombre: S.persona ? S.persona.nombre : null,
      rol: S.rol,
      tiendaId: S.tienda ? S.tienda.id : null,
      tiendaNombre: S.tienda ? S.tienda.nombre : null,
      zona: S.zona,
      inventarioId: S.inventario ? S.inventario.id : null,
      unidadId: S.unidad ? S.unidad.id : null,
      intentoId: S.intento ? S.intento.id : null,
      capturaId: S.captura ? S.captura.id : null
    });
  }

  async function limpiarPuntero() {
    await idbPut('sesion', { clave: 'actual' });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANTALLA 1 — SELECCIÓN DE TIENDA
  // ══════════════════════════════════════════════════════════════════════
  async function pantallaTiendas() {
    S.zona = null; S.rol = null; S.persona = null; S.unidad = null; S.intento = null; S.captura = null;
    await limpiarPuntero();

    const { data, error } = await window.sbInventario.from('tiendas').select('id,nombre').eq('activo', true).order('nombre');
    if (error) {
      render('<h1>Inventario</h1>', '<p>No se pudieron cargar las tiendas. Comprueba tu conexión.</p>');
      return;
    }
    const botones = data.map(function (t) {
      return '<button class="inv-primario" style="display:block;width:100%;text-align:left;margin-bottom:10px;" ' +
        'data-id="' + t.id + '" data-nombre="' + t.nombre + '">' + t.nombre + '</button>';
    }).join('');
    render('<h1>Selecciona tu tienda</h1>', botones);

    root().querySelectorAll('.inv-body button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.tienda = { id: b.dataset.id, nombre: b.dataset.nombre };
        pantallaZona();
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANTALLA 2 — SELECCIÓN DE ZONA (Loja / Armazém)
  // ══════════════════════════════════════════════════════════════════════
  function pantallaZona() {
    render(
      '<h1>' + S.tienda.nombre + '</h1>',
      '<button class="inv-primario" id="inv-btn-loja" style="display:block;width:100%;margin-bottom:10px;">Loja</button>' +
      '<button class="inv-primario" id="inv-btn-armazem" style="display:block;width:100%;">Armazém</button>' +
      '<button id="inv-btn-volver" style="display:block;margin-top:20px;">← Volver</button>'
    );
    document.getElementById('inv-btn-loja').onclick = function () { S.zona = 'loja'; pantallaRol(); };
    document.getElementById('inv-btn-armazem').onclick = function () { S.zona = 'armazem'; pantallaRol(); };
    document.getElementById('inv-btn-volver').onclick = pantallaTiendas;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANTALLA 3 — SELECCIÓN DE ROL + CLAVE PERSONAL
  // ══════════════════════════════════════════════════════════════════════
  function pantallaRol() {
    render(
      '<h1>' + S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + '</h1>',
      '<button class="inv-primario" id="inv-btn-p1" style="display:block;width:100%;margin-bottom:10px;">Persona 1 (conteo)</button>' +
      '<button class="inv-primario" id="inv-btn-p2" style="display:block;width:100%;">Persona 2 (escaneo)</button>' +
      '<button id="inv-btn-volver" style="display:block;margin-top:20px;">← Volver</button>'
    );
    document.getElementById('inv-btn-p1').onclick = function () { pedirClavePersonal('persona1'); };
    document.getElementById('inv-btn-p2').onclick = function () { pedirClavePersonal('persona2'); };
    document.getElementById('inv-btn-volver').onclick = pantallaZona;
  }

  function pedirClavePersonal(rol) {
    const f = modal(
      '<h3>Clave personal</h3>' +
      '<input type="password" id="inv-clave-personal" placeholder="Tu clave" autofocus>' +
      '<div id="inv-clave-error" style="color:#c0392b;font-size:14px;margin-bottom:10px;"></div>' +
      '<button class="inv-primario" id="inv-clave-ok">Entrar</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>'
    );
    const input = f.querySelector('#inv-clave-personal');
    const err = f.querySelector('#inv-clave-error');
    async function intentar() {
      const clave = input.value.trim();
      if (!clave) return;
      err.textContent = '';
      const { data, error } = await window.sbInventario.rpc('verificar_persona', { p_token: S.token, p_clave: clave });
      if (error || !data || !data.length) {
        err.textContent = 'Clave incorrecta.';
        return;
      }
      const persona = data[0];
      S.persona = { id: persona.id, nombre: persona.nombre };
      S.rol = rol;
      f.remove();
      await entrarEnInventario();
    }
    f.querySelector('#inv-clave-ok').onclick = intentar;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') intentar(); });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ABRIR/REUTILIZAR EL INVENTARIO (tienda+zona) Y ASIGNAR LA PERSONA
  // ══════════════════════════════════════════════════════════════════════
  async function entrarEnInventario() {
    render('<h1>Entrando…</h1>', '<p>Comprobando disponibilidad…</p>');

    let { data: inv, error: e1 } = await window.sbInventario
      .from('inventarios').select('*')
      .eq('tienda_id', S.tienda.id).eq('zona', S.zona).eq('estado', 'abierto')
      .maybeSingle();

    if (e1) { render('<h1>Error</h1>', '<p>No se pudo comprobar el inventario. Revisa tu conexión.</p>'); return; }

    if (!inv) {
      const etiqueta = S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + ' — ' + new Date().getFullYear();
      const { data: nuevo, error: e2 } = await window.sbInventario
        .from('inventarios')
        .insert({ tienda_id: S.tienda.id, zona: S.zona, etiqueta: etiqueta, unidades_esperadas: 0 })
        .select().single();
      if (e2) { render('<h1>Error</h1>', '<p>No se pudo abrir el inventario.</p>'); return; }
      inv = nuevo;
    }
    S.inventario = inv;

    const { error: e3 } = await window.sbInventario.from('asignaciones').insert({
      persona_id: S.persona.id, tienda_id: S.tienda.id, zona: S.zona, rol: S.rol, inventario_id: inv.id
    });

    if (e3) {
      if (esConflictoDuplicado(e3)) {
        render('<h1>No disponible</h1>',
          '<p><strong>' + S.persona.nombre + '</strong> ya tiene una asignación activa en otra tienda/rol, o ese rol ya está ocupado en este inventario por otra persona.</p>' +
          '<p>Debe cerrarse correctamente antes de poder reasignarse.</p>' +
          '<button class="inv-primario" onclick="location.reload()">Volver</button>');
      } else {
        render('<h1>Error</h1>', '<p>No se pudo registrar la asignación. Revisa tu conexión e inténtalo de nuevo.</p>');
      }
      return;
    }

    await guardarPuntero();
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANTALLA 4 — LISTA DE UNIDADES (Expositores / Grupos)
  // ══════════════════════════════════════════════════════════════════════
  async function pantallaUnidades() {
    const { data: unidades, error } = await window.sbInventario
      .from('unidades').select('*, intentos(*)')
      .eq('inventario_id', S.inventario.id).order('numero');

    if (error) { render('<h1>Error</h1>', '<p>No se pudo cargar la lista de unidades.</p>'); return; }

    const label = UNIDAD_LABEL[S.zona];
    const validadas = unidades.filter(function (u) { return u.estado === 'validada'; }).length;

    let filas = unidades.map(function (u) {
      const ultimoIntento = (u.intentos || []).sort(function (a, b) {
        return b.numero_intento - a.numero_intento;
      })[0];
      let estadoTxt = 'Pendiente';
      let accion = '';
      if (u.estado === 'validada') {
        estadoTxt = '✅ Validado';
      } else if (ultimoIntento && ultimoIntento.estado === 'divergencia') {
        estadoTxt = '❌ Divergencia — repetir conteo';
      } else if (ultimoIntento && (ultimoIntento.estado === 'autorizado' || ultimoIntento.estado === 'escaneando')) {
        estadoTxt = S.rol === 'persona2' ? 'Esperando escaneo' : 'Cerrado (esperando Persona 2)';
      }
      if (S.rol === 'persona1' && u.estado !== 'validada' && (!ultimoIntento || ultimoIntento.estado === 'divergencia')) {
        accion = '<button class="inv-primario" data-accion="contar" data-id="' + u.id + '" data-numero="' + u.numero + '">Contar</button>';
      }
      if (S.rol === 'persona2' && ultimoIntento && (ultimoIntento.estado === 'autorizado' || ultimoIntento.estado === 'escaneando')) {
        accion = '<button class="inv-primario" data-accion="escanear" data-id="' + u.id + '" data-numero="' + u.numero + '">' +
          (ultimoIntento.estado === 'escaneando' ? 'Continuar' : 'Introducir código') + '</button>';
      }
      return '<div class="inv-lista-item"><span>' + label + ' ' + u.numero + ' — ' + estadoTxt + '</span>' + accion + '</div>';
    }).join('');

    if (!filas) filas = '<p>Todavía no hay ' + label.toLowerCase() + 's creados.</p>';

    const nuevaUnidadHtml = S.rol === 'persona1'
      ? '<div style="margin-top:20px;"><input type="number" id="inv-num-nuevas" placeholder="Número total de ' + label.toLowerCase() + 's">' +
        '<button class="inv-primario" id="inv-btn-fijar-numero">Fijar número esperado</button></div>'
      : '';

    const cierreHtml = S.rol === 'persona2'
      ? '<button class="inv-primario" id="inv-btn-cerrar-inv" style="margin-top:20px;">Cerrar inventario definitivamente</button>'
      : '';

    render(
      '<h1>' + S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + '</h1>',
      '<p>' + validadas + ' / ' + Math.max(unidades.length, S.inventario.unidades_esperadas) + ' validados — ' + S.persona.nombre + ' (' + (S.rol === 'persona1' ? 'Persona 1' : 'Persona 2') + ')</p>' +
      filas + nuevaUnidadHtml + cierreHtml +
      '<button id="inv-btn-salir" style="display:block;margin-top:24px;">Salir de esta pantalla (no cierra tu asignación)</button>'
    );

    root().querySelectorAll('[data-accion="contar"]').forEach(function (b) {
      b.onclick = function () { iniciarConteo(b.dataset.id, parseInt(b.dataset.numero, 10)); };
    });
    root().querySelectorAll('[data-accion="escanear"]').forEach(function (b) {
      b.onclick = function () { iniciarAutorizacionEscaneo(b.dataset.id, parseInt(b.dataset.numero, 10)); };
    });
    const btnFijar = document.getElementById('inv-btn-fijar-numero');
    if (btnFijar) btnFijar.onclick = fijarNumeroEsperado;
    const btnCerrar = document.getElementById('inv-btn-cerrar-inv');
    if (btnCerrar) btnCerrar.onclick = intentarCerrarInventario;
    document.getElementById('inv-btn-salir').onclick = function () {
      root().remove();
    };
  }

  async function fijarNumeroEsperado() {
    const n = parseInt(document.getElementById('inv-num-nuevas').value, 10);
    if (!n || n < 1) return;
    const anterior = S.inventario.unidades_esperadas || 0;
    if (n < anterior) {
      alert('No se permite reducir el número de unidades esperadas. Actual: ' + anterior);
      return;
    }
    const { error: e1 } = await window.sbInventario.from('inventarios')
      .update({ unidades_esperadas: n }).eq('id', S.inventario.id);
    if (e1) { alert('No se pudo actualizar. Revisa tu conexión.'); return; }

    await window.sbInventario.from('incidencias').insert({
      inventario_id: S.inventario.id, tipo: 'ampliacion_unidades',
      detalle: { anterior: anterior, nuevo: n, persona: S.persona.nombre, fecha: new Date().toISOString() }
    });

    if (n > anterior) {
      const filas = [];
      for (let i = anterior + 1; i <= n; i++) {
        filas.push({ inventario_id: S.inventario.id, numero: i });
      }
      await window.sbInventario.from('unidades').insert(filas);
    }
    S.inventario.unidades_esperadas = n;
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PERSONA 1 — CONTEO FÍSICO Y CIERRE DE LA UNIDAD
  // ══════════════════════════════════════════════════════════════════════
  async function iniciarConteo(unidadId, numero) {
    S.unidad = { id: unidadId, numero: numero };
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
      '<p>Introduce el conteo físico total de esta unidad.</p>' +
      '<input type="number" id="inv-conteo-fisico" placeholder="Piezas contadas">' +
      '<button class="inv-primario" id="inv-btn-cerrar-conteo">Cerrar ' + UNIDAD_LABEL[S.zona].toLowerCase() + '</button>' +
      '<button id="inv-btn-volver-lista">← Volver</button>'
    );
    document.getElementById('inv-btn-volver-lista').onclick = pantallaUnidades;
    document.getElementById('inv-btn-cerrar-conteo').onclick = cerrarConteo;
  }

  async function cerrarConteo() {
    const conteo = parseInt(document.getElementById('inv-conteo-fisico').value, 10);
    if (!conteo && conteo !== 0) { alert('Introduce un número válido.'); return; }

    const { data: existentes } = await window.sbInventario.from('intentos')
      .select('numero_intento').eq('unidad_id', S.unidad.id).order('numero_intento', { ascending: false }).limit(1);
    const numeroIntento = existentes && existentes.length ? existentes[0].numero_intento + 1 : 1;

    const { data: intento, error } = await window.sbInventario.from('intentos').insert({
      unidad_id: S.unidad.id, numero_intento: numeroIntento, persona1_id: S.persona.id,
      conteo_fisico: conteo, cerrado_at: new Date().toISOString(), estado: 'autorizado'
    }).select().single();

    if (error) { alert('No se pudo cerrar. Revisa tu conexión e inténtalo de nuevo — nada se ha perdido.'); return; }

    await window.sbInventario.from('unidades').update({ estado: 'en_proceso' }).eq('id', S.unidad.id);

    S.intento = intento;
    mostrarCodigos(1);
  }

  async function mostrarCodigos(desdeIndice) {
    const codigos = [];
    for (let i = desdeIndice; i < desdeIndice + 4; i++) {
      codigos.push(await codigoIndice(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, i));
    }
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + S.unidad.numero + ' — cerrado</h1>',
      '<p>Conteo físico: <strong>' + S.intento.conteo_fisico + '</strong></p>' +
      '<p>Dale uno de estos códigos a Persona 2 para que empiece a escanear:</p>' +
      '<div style="font-size:22px;letter-spacing:2px;margin:16px 0;">' + codigos.join(' &nbsp; ') + '</div>' +
      '<button id="inv-btn-mas-codigos">Generar más códigos</button>' +
      '<button class="inv-primario" id="inv-btn-siguiente-unidad" style="display:block;margin-top:16px;">Ir a la siguiente unidad</button>'
    );
    document.getElementById('inv-btn-mas-codigos').onclick = function () { mostrarCodigos(desdeIndice + 4); };
    document.getElementById('inv-btn-siguiente-unidad').onclick = pantallaUnidades;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PERSONA 2 — INTRODUCIR CÓDIGO Y ESCANEAR
  // ══════════════════════════════════════════════════════════════════════
  async function iniciarAutorizacionEscaneo(unidadId, numero) {
    S.unidad = { id: unidadId, numero: numero };

    const { data: intento, error } = await window.sbInventario.from('intentos')
      .select('*').eq('unidad_id', unidadId).order('numero_intento', { ascending: false }).limit(1).single();
    if (error || !intento) { render('<h1>Error</h1>', '<p>No se pudo cargar esta unidad.</p>'); return; }
    S.intento = intento;

    if (intento.estado === 'escaneando' && intento.persona2_id === S.persona.id) {
      // Reanudación tras un refresco: recuperar la captura activa, nunca crear otra a ciegas.
      const { data: capturas } = await window.sbInventario.from('capturas')
        .select('*').eq('intento_id', intento.id).eq('estado', 'activa').limit(1);
      if (capturas && capturas.length) {
        S.captura = capturas[0];
        await guardarPuntero();
        pantallaEscaneo();
        return;
      }
    }

    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
      '<p>Conteo de Persona 1: <strong>' + intento.conteo_fisico + '</strong></p>' +
      '<input type="text" id="inv-codigo-auth" placeholder="Código de autorización" inputmode="numeric">' +
      '<div id="inv-codigo-error" style="color:#c0392b;font-size:14px;"></div>' +
      '<button class="inv-primario" id="inv-btn-autorizar">Comenzar escaneado</button>' +
      '<button id="inv-btn-volver-lista">← Volver</button>'
    );
    document.getElementById('inv-btn-volver-lista').onclick = pantallaUnidades;
    document.getElementById('inv-btn-autorizar').onclick = autorizarEscaneo;
    document.getElementById('inv-codigo-auth').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') autorizarEscaneo();
    });
  }

  async function autorizarEscaneo() {
    const codigo = document.getElementById('inv-codigo-auth').value;
    const err = document.getElementById('inv-codigo-error');
    const ok = await verificarCodigo(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, codigo);
    if (!ok) { err.textContent = 'Código incorrecto, o pertenece a otra unidad/intento.'; return; }

    // .eq('estado','autorizado') actúa como guarda de concurrencia: si otra Persona 2 ya
    // reclamó este intento entre que se listó y se autorizó, esta actualización no afecta
    // ninguna fila y no se pisan datos.
    const { data: intentoAct, error: e1 } = await window.sbInventario.from('intentos')
      .update({ persona2_id: S.persona.id, estado: 'escaneando' })
      .eq('id', S.intento.id).eq('estado', 'autorizado').select();
    if (e1) { err.textContent = 'No se pudo autorizar. Revisa tu conexión.'; return; }
    if (!intentoAct || !intentoAct.length) {
      err.textContent = 'Esta unidad ya fue tomada por otra persona. Vuelve a la lista.';
      return;
    }
    S.intento = intentoAct[0];

    const { data: captura, error: e2 } = await window.sbInventario.from('capturas')
      .insert({ intento_id: S.intento.id, numero_captura: 1, estado: 'activa' }).select().single();
    if (e2) { err.textContent = 'No se pudo iniciar la captura. Revisa tu conexión.'; return; }
    S.captura = captura;

    await guardarPuntero();
    pantallaEscaneo();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANTALLA DE ESCANEADO
  // ══════════════════════════════════════════════════════════════════════
  let bufferScan = '';
  let timerScan = null;

  async function pantallaEscaneo() {
    const total = await contarEscaneosValidos(S.captura.id);
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + S.unidad.numero + ' — Escaneando</h1>',
      '<div class="inv-contador" id="inv-contador">' + total + '</div>' +
      '<p style="text-align:center;color:#666;">de ' + S.intento.conteo_fisico + ' esperadas</p>' +
      '<input type="text" id="inv-scan-input" autocomplete="off">' +
      '<button class="inv-primario" id="inv-btn-manual">Introducir código manualmente</button>' +
      '<button id="inv-btn-anular">Anular último escaneo</button>' +
      '<button id="inv-btn-limpiar">Limpar / Começar de novo</button>' +
      '<button class="inv-peligro" id="inv-btn-cerrar-unidad" style="display:block;margin-top:16px;">Cerrar ' + UNIDAD_LABEL[S.zona].toLowerCase() + '</button>'
    );

    const input = document.getElementById('inv-scan-input');
    input.focus();
    root().addEventListener('click', function () { input.focus(); });

    input.addEventListener('input', function () {
      bufferScan = input.value;
      clearTimeout(timerScan);
      timerScan = setTimeout(procesarBuffer, 60);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { clearTimeout(timerScan); procesarBuffer(); }
    });

    function procesarBuffer() {
      const codigo = input.value.trim();
      input.value = '';
      bufferScan = '';
      if (!codigo) return;
      procesarCodigo(codigo);
    }

    document.getElementById('inv-btn-manual').onclick = function () {
      const codigo = prompt('Introduce el código manualmente:');
      if (codigo && codigo.trim()) procesarCodigo(codigo.trim());
    };
    document.getElementById('inv-btn-anular').onclick = anularUltimoEscaneo;
    document.getElementById('inv-btn-limpiar').onclick = limpiarCaptura;
    document.getElementById('inv-btn-cerrar-unidad').onclick = cerrarUnidadEscaneo;
  }

  async function procesarCodigo(codigo) {
    await registrarEscaneo(codigo, null, null);
    const total = await contarEscaneosValidos(S.captura.id);
    const el = document.getElementById('inv-contador');
    if (el) el.textContent = total;
    document.getElementById('inv-scan-input').focus();
  }

  let ultimoEscaneoId = null;

  async function anularUltimoEscaneo() {
    const eventos = (await idbGetAllByIndex('eventos', 'captura_id', S.captura.id))
      .sort(function (a, b) { return new Date(b.creado_en_dispositivo_at) - new Date(a.creado_en_dispositivo_at); });
    if (!eventos.length) { alert('No hay escaneos que anular en esta captura.'); return; }
    const anulTodas = await idbGetAll('anulaciones_local');
    const anuladosSet = new Set(anulTodas.map(function (a) { return a.escaneo_id; }));
    const candidato = eventos.find(function (e) { return !anuladosSet.has(e.id); });
    if (!candidato) { alert('No hay escaneos pendientes de anular en esta captura.'); return; }

    const f = modal(
      '<h3>¿Anular el último escaneo?</h3>' +
      '<p>Código: ' + candidato.codigo_barras + '</p>' +
      '<select id="inv-motivo-anular" style="width:100%;padding:10px;margin-bottom:10px;">' +
      '<option value="Duplicado">Duplicado</option>' +
      '<option value="Error de lectura">Error de lectura</option>' +
      '<option value="Otro motivo">Otro motivo</option></select>' +
      '<input type="text" id="inv-motivo-otro" placeholder="Explica el motivo" style="display:none;">' +
      '<button class="inv-primario" id="inv-confirmar-anular">Confirmar anulación</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>'
    );
    const sel = f.querySelector('#inv-motivo-anular');
    const otro = f.querySelector('#inv-motivo-otro');
    sel.addEventListener('change', function () { otro.style.display = sel.value === 'Otro motivo' ? 'block' : 'none'; });

    f.querySelector('#inv-confirmar-anular').onclick = async function () {
      const motivo = sel.value === 'Otro motivo' ? otro.value.trim() : sel.value;
      if (sel.value === 'Otro motivo' && !motivo) { alert('Explica el motivo.'); return; }
      const anulacion = { id: uuid(), escaneo_id: candidato.id, motivo: motivo, persona_id: S.persona.id, synced: false };
      await idbPut('anulaciones_local', anulacion);
      sincronizar();
      f.remove();
      const total = await contarEscaneosValidos(S.captura.id);
      document.getElementById('inv-contador').textContent = total;
    };
  }

  async function limpiarCaptura() {
    if (!confirm('¿Comenzar de nuevo? Los escaneos actuales quedan guardados en el historial, pero no contarán en el resultado final.')) return;
    await window.sbInventario.from('capturas').update({ estado: 'cancelada', cerrado_at: new Date().toISOString() }).eq('id', S.captura.id);
    const { data: nueva, error } = await window.sbInventario.from('capturas')
      .insert({ intento_id: S.intento.id, numero_captura: S.captura.numero_captura + 1, estado: 'activa' }).select().single();
    if (error) { alert('No se pudo reiniciar la captura. Revisa tu conexión.'); return; }
    S.captura = nueva;
    await guardarPuntero();
    pantallaEscaneo();
  }

  async function cerrarUnidadEscaneo() {
    if (!confirm('¿Cerrar esta unidad? Se comparará el conteo con los escaneos válidos.')) return;
    const total = await contarEscaneosValidos(S.captura.id);

    await window.sbInventario.from('capturas').update({ estado: 'cerrada', cerrado_at: new Date().toISOString() }).eq('id', S.captura.id);

    if (total === S.intento.conteo_fisico) {
      await window.sbInventario.from('intentos').update({ estado: 'validado' }).eq('id', S.intento.id);
      await window.sbInventario.from('unidades').update({ estado: 'validada' }).eq('id', S.unidad.id);
      alert('✅ Unidad validada: ' + total + ' / ' + S.intento.conteo_fisico);
    } else {
      await window.sbInventario.from('intentos').update({ estado: 'divergencia' }).eq('id', S.intento.id);
      await window.sbInventario.from('unidades').update({ estado: 'pendiente' }).eq('id', S.unidad.id);
      alert('❌ Divergencia: conteo físico ' + S.intento.conteo_fisico + ' vs ' + total + ' escaneados. Persona 1 debe volver a contar esta unidad.');
    }
    await limpiarPuntero();
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CIERRE DEFINITIVO DEL INVENTARIO
  // ══════════════════════════════════════════════════════════════════════
  async function intentarCerrarInventario() {
    if (S.pendientesSync > 0) {
      alert('Todavía hay ' + S.pendientesSync + ' escaneos pendientes de sincronizar. Espera a que el indicador se ponga verde antes de cerrar.');
      return;
    }
    if (!navigator.onLine) { alert('Necesitas conexión a Internet para cerrar el inventario definitivamente.'); return; }
    if (!confirm('¿Cerrar definitivamente este inventario? Esta acción no se puede deshacer.')) return;

    const { data, error } = await window.sbInventario.rpc('cerrar_inventario', {
      p_token: S.token, p_inventario_id: S.inventario.id, p_persona_id: S.persona.id
    });
    if (error) { alert('No se pudo cerrar: ' + error.message); return; }
    const resultado = data && data[0];
    if (!resultado || !resultado.ok) {
      alert('No se puede cerrar todavía: ' + (resultado ? resultado.motivo : 'error desconocido'));
      return;
    }
    alert('Inventario cerrado correctamente.');
    await limpiarPuntero();
    root().remove();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PUNTO DE ENTRADA
  // ══════════════════════════════════════════════════════════════════════
  function openInventarioApp(token) {
    if (!token) return;
    S.token = token;

    window.sbInventario = window.supabase.createClient(SB_URL, SB_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'wakzome-sb-inventario'
      },
      db: { schema: 'inventario' },
      global: { headers: { 'x-inventario-token': token } }
    });

    inyectarEstilos();
    pantallaTiendas();
  }

  window.openInventarioApp = openInventarioApp;

})();
