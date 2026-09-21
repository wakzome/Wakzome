(function () {

  // ══════════════════════════════════════════════════════════════════════
  //  INVENTÁRIO FÍSICO OFFLINE-FIRST — wakzome.com
  //
  //  Prioridade absoluta do projeto: NUNCA SE PODE PERDER UMA ÚNICA LEITURA.
  //  Por isso este ficheiro segue, do início ao fim, o modelo:
  //
  //    LEITURA → GUARDAR LOCALMENTE (IndexedDB) → CONTINUAR A TRABALHAR
  //            → (se houver rede) ENVIAR AO SUPABASE → CONFIRMAÇÃO → SINCRONIZADO
  //
  //  Nenhuma leitura depende da rede para existir. A rede só serve para
  //  propagar o que já está guardado localmente.
  //
  //  O que este ficheiro ainda NÃO implementa (deliberadamente fora do
  //  caminho crítico de "não perder nenhuma leitura"), para uma próxima
  //  entrega:
  //    - Relatórios/consolidações para o administrador (exportação).
  //    - Procedimento de reabertura/correção após um encerramento definitivo.
  //    - Service Worker / instalação como PWA.
  // ══════════════════════════════════════════════════════════════════════

  const SB_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  // Segredo para os códigos de autorização HMAC. Não é um segredo perante as
  // próprias funcionárias (Pessoa 1 e Pessoa 2 já conhecem o código, porque
  // a Pessoa 1 mostra-o fisicamente à Pessoa 2) — é um mecanismo de
  // INTEGRIDADE DE FLUXO: torna um código válido única e exclusivamente
  // para a sua loja+inventário+unidade+tentativa exatos, de forma
  // determinística e sem precisar de rede. A barreira de segurança real
  // perante terceiros é o token de sessão (x-inventario-token) e as
  // políticas RLS da base de dados, não este segredo.
  const HMAC_SECRET = 'wkz-inv-codigos-2027-a19f4e7c';

  const IDB_NAME = 'wkz_inventario';
  const IDB_VERSION = 1;

  const ZONA_LABEL = { loja: 'Loja', armazem: 'Armazém' };
  const UNIDAD_LABEL = { loja: 'Expositor', armazem: 'Grupo' };

  // ── Estado em memória da sessão de inventário ─────────────────────────
  const S = {
    token: null,
    persona: null,     // { id, nombre }
    rol: null,          // 'persona1' | 'persona2'
    tienda: null,        // { id, nombre }
    zona: null,          // 'loja' | 'armazem'
    inventario: null,    // linha de inventarios
    unidad: null,        // linha de unidades selecionada
    intento: null,        // linha de intentos ativa
    captura: null,        // linha de capturas ativa
    pendientesSync: 0,
    dispositivoId: null
  };

  // ══════════════════════════════════════════════════════════════════════
  //  INDEXEDDB — persistência local imediata
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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function primerNombre(nomeCompleto) {
    return (nomeCompleto || '').trim().split(/\s+/)[0] || '';
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
  //  CÓDIGOS DE AUTORIZAÇÃO — HMAC determinístico, funciona sem rede
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
  //  SINCRONIZAÇÃO — fila local, idempotente, em lotes
  // ══════════════════════════════════════════════════════════════════════
  let sincronizando = false;
  let timerListaUnidades = null;

  async function actualizarIndicador() {
    const eventos = await idbGetAll('eventos');
    const anul = await idbGetAll('anulaciones_local');
    const pendientes = eventos.filter(function (e) { return !e.synced; }).length +
      anul.filter(function (a) { return !a.synced; }).length;
    S.pendientesSync = pendientes;
    const el = document.getElementById('inv-indicador');
    if (!el) return;
    if (pendientes === 0) {
      el.textContent = '🟢 Dados protegidos';
      el.style.background = '#e6f7ec';
      el.style.color = '#1e7e34';
    } else if (navigator.onLine) {
      el.textContent = '🟠 A sincronizar… (' + pendientes + ' pendentes)';
      el.style.background = '#fff4e0';
      el.style.color = '#a15c00';
    } else {
      el.textContent = '🟠 Sem ligação — ' + pendientes + ' guardados localmente, pendentes de envio';
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
            await idbPut('eventos', Object.assign({}, eventos.find(function (x) { return x.id === e.id; }), { synced: true }));
          }
        } else {
          break; // será reenviado no próximo ciclo
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
      // Falha de rede ou semelhante: será reenviado no próximo ciclo. Nada se perde:
      // os eventos continuam no IndexedDB com synced=false.
    } finally {
      sincronizando = false;
      await actualizarIndicador();
    }
  }

  setInterval(sincronizar, 5000);
  window.addEventListener('online', sincronizar);

  // ══════════════════════════════════════════════════════════════════════
  //  GUARDAR UMA LEITURA — nunca depende da rede
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
      // Ponto crítico: se isto falhar, NÃO se pode fingir que a leitura existe.
      mostrarModalIntegridad('Não foi possível guardar a leitura localmente. Não continues até resolver isto.');
      throw e;
    }
    sincronizar();
    return evento;
  }

  async function obtenerEscaneosValidos(capturaId) {
    const eventos = await idbGetAllByIndex('eventos', 'captura_id', capturaId);
    const anulTodas = await idbGetAll('anulaciones_local');
    const anuladosSet = new Set(anulTodas.map(function (a) { return a.escaneo_id; }));
    return eventos
      .filter(function (e) { return !anuladosSet.has(e.id); })
      .sort(function (a, b) { return new Date(b.creado_en_dispositivo_at) - new Date(a.creado_en_dispositivo_at); });
  }

  async function contarEscaneosValidos(capturaId) {
    return (await obtenerEscaneosValidos(capturaId)).length;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  DADOS FICTÍCIOS (referência/descrição) — não há ainda mestre de artigos
  // ══════════════════════════════════════════════════════════════════════
  const REFERENCIA_PREFIXOS = ['REF', 'ART', 'PRD', 'SKU'];
  const DESCRICOES_FICTICIAS = [
    'Camisola básica algodão', 'Calça ganga slim', 'T-shirt estampada', 'Casaco impermeável',
    'Vestido verão floral', 'Sapatilha desportiva', 'Cinto de couro', 'Boné ajustável',
    'Camisa social manga longa', 'Saia plissada', 'Blusão acolchoado', 'Calção de banho',
    'Meias pack 3 unidades', 'Mala tiracolo', 'Óculos de sol'
  ];

  function hashSimples(texto) {
    let h = 0;
    for (let i = 0; i < texto.length; i++) {
      h = ((h << 5) - h + texto.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function datosFicticios(codigoBarras) {
    const h = hashSimples(String(codigoBarras));
    const prefixo = REFERENCIA_PREFIXOS[h % REFERENCIA_PREFIXOS.length];
    const numero = (h % 90000) + 10000;
    const descricao = DESCRICOES_FICTICIAS[Math.floor(h / 7) % DESCRICOES_FICTICIAS.length];
    return { referencia: prefixo + '-' + numero, descricao: descricao };
  }

  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  UI — overlay autónomo, não depende do CSS do site
  // ══════════════════════════════════════════════════════════════════════
  function inyectarEstilos() {
    if (document.getElementById('inv-estilos')) return;
    const style = document.createElement('style');
    style.id = 'inv-estilos';
    style.textContent = `
      #inv-root { position:fixed; inset:0; height:100dvh; background:#fafafa; z-index:99999; display:flex;
        flex-direction:column; font-family:inherit; color:#222; overflow-y:auto;
        -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
      #inv-root .inv-header { display:flex; justify-content:space-between; align-items:center;
        padding:14px 20px; border-bottom:1px solid #e5e5e5; background:#fff; flex-shrink:0;
        position:sticky; top:0; z-index:10; gap:10px; }
      #inv-root .inv-header h1 { font-size:17px; font-weight:500; margin:0; }
      #inv-root .inv-header button.inv-header-volver { padding:6px 14px; font-size:13px; flex-shrink:0; }
      #inv-root .inv-body { flex:1; padding:32px 24px; max-width:640px; margin:0 auto; width:100%;
        box-sizing:border-box; display:flex; flex-direction:column; align-items:center;
        justify-content:flex-start; text-align:center; min-height:0; }
      #inv-root .inv-body h1 { font-size:20px; font-weight:500; margin:0 0 24px; }
      #inv-root .inv-body p { color:#555; }
      #inv-root .inv-menu { display:flex; flex-direction:column; align-items:center; gap:10px; width:100%; }
      #inv-root button { font-family:inherit; -webkit-appearance:none; appearance:none;
        forced-color-adjust:none; font-size:15px; padding:12px 22px; border-radius:24px;
        border:1px solid #ccc; background:#fff; color:#222; cursor:pointer; }
      #inv-root button:hover { background:#f0f0f0; }
      #inv-root button.inv-primario { background:#1a1a1a !important; color:#fff !important; border-color:#1a1a1a; }
      #inv-root button.inv-primario:hover { background:#000 !important; }
      #inv-root button.inv-peligro { border-color:#c0392b; color:#c0392b; }
      #inv-root button.inv-menu-btn { min-width:220px; text-align:center; }
      #inv-root button:disabled { opacity:.4; cursor:not-allowed; }
      #inv-root .inv-lista-item { display:flex; justify-content:space-between; align-items:center;
        gap:10px; padding:8px 12px; border:1px solid #e5e5e5; border-radius:10px; margin-bottom:6px;
        background:#fff; width:100%; box-sizing:border-box; text-align:left; }
      #inv-root .inv-lista-item span { font-size:14px; }
      #inv-root .inv-lista-item button { padding:6px 14px; font-size:13px; flex-shrink:0; }
      #inv-root input[type=text], #inv-root input[type=password], #inv-root input[type=number] {
        font-family:inherit; font-size:16px; padding:10px 12px; border:1px solid #ccc; border-radius:8px;
        width:100%; max-width:280px; box-sizing:border-box; margin:0 auto 10px; display:block; }
      #inv-root .inv-badge { font-size:12px; padding:4px 10px; border-radius:12px; font-weight:600; }
      #inv-root .inv-modal-fondo { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100000;
        display:flex; align-items:center; justify-content:center; }
      #inv-root .inv-modal { background:#fff; border-radius:14px; padding:26px; max-width:420px; width:90%;
        text-align:center; }
      #inv-root .inv-modal .inv-menu { align-items:stretch; }
      #inv-root .inv-contador { font-size:56px; font-weight:300; text-align:center; margin:20px 0; }
      #inv-scan-input { position:absolute; opacity:0; pointer-events:none; }
      #inv-root .inv-progreso { font-size:13px; color:#888; margin:0 0 4px; }
      #inv-root .inv-ultima { width:100%; border:1px solid #e5e5e5; border-radius:14px; padding:18px;
        margin:0 0 14px; background:#fff; box-sizing:border-box; }
      #inv-root .inv-ultima .inv-ultima-ref { font-size:24px; font-weight:700; margin:0 0 6px; color:#1a1a1a; }
      #inv-root .inv-ultima .inv-ultima-desc { font-size:18px; margin:0 0 10px; color:#444; }
      #inv-root .inv-ultima .inv-ultima-codigo { font-size:20px; font-family:monospace; letter-spacing:1px;
        margin:0; color:#666; font-weight:600; }
      #inv-root .inv-ultima .inv-ultima-vazio { font-size:16px; color:#999; margin:0; }
      #inv-root .inv-acciones-icono { display:flex; justify-content:space-around; gap:8px; width:100%;
        padding-top:14px; margin-top:14px; border-top:1px solid #eee; }
      #inv-root .inv-icon-btn { display:flex; flex-direction:column; align-items:center; gap:4px;
        flex:1 1 0; padding:10px 4px; border-radius:14px; border:1px solid transparent; background:transparent; }
      #inv-root .inv-icon-btn .inv-icon { font-size:26px; line-height:1; }
      #inv-root .inv-icon-btn .inv-icon-label { font-size:11px; color:#555; }
      #inv-root .inv-btn-encerrar { width:100%; box-sizing:border-box; margin-top:14px; }
      #inv-root .inv-historial { width:100%; max-height:180px; overflow-y:auto;
        -webkit-overflow-scrolling:touch; overscroll-behavior:contain; border:1px solid #e5e5e5;
        border-radius:10px; margin-top:14px; box-sizing:border-box; background:#fff; flex-shrink:0; }
      #inv-root .inv-historial-item { display:flex; align-items:center; gap:8px; padding:6px 10px;
        border-bottom:1px solid #f0f0f0; text-align:left; }
      #inv-root .inv-historial-item:last-child { border-bottom:none; }
      #inv-root .inv-historial-item span { font-size:11px; line-height:1.3; }
      #inv-root .inv-historial-codigo { font-family:monospace; color:#888; flex:0 0 auto; min-width:62px; }
      #inv-root .inv-historial-ref { font-weight:600; color:#333; flex:0 0 auto; min-width:62px; }
      #inv-root .inv-historial-desc { color:#666; flex:1 1 auto; overflow:hidden; text-overflow:ellipsis;
        white-space:nowrap; }
      #inv-root .inv-historial-qty { font-weight:700; color:#1a1a1a; flex:0 0 auto; min-width:22px;
        text-align:right; font-size:13px !important; }
      #inv-root .inv-historial-vazio { padding:14px; font-size:12px; color:#999; text-align:center; }
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

  function render(headerHtml, bodyHtml, onVolver) {
    if (timerListaUnidades) { clearInterval(timerListaUnidades); timerListaUnidades = null; }
    const volverBtn = onVolver
      ? '<button class="inv-header-volver" id="inv-btn-header-volver">← Voltar</button>'
      : '';
    root().innerHTML =
      '<div class="inv-header">' + volverBtn + headerHtml +
      '<span id="inv-indicador" class="inv-badge">🟢 Dados protegidos</span></div>' +
      '<div class="inv-body">' + bodyHtml + '</div>';
    root().scrollTop = 0;
    actualizarIndicador();
    if (onVolver) document.getElementById('inv-btn-header-volver').onclick = onVolver;
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
      '<h3>Vamos parar um momento</h3><p>' + mensaje + '</p>' +
      '<p>Verifica a tua ligação e tenta novamente. Nenhum dado guardado até agora é perdido.</p>' +
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
  //  GUARDAR / RECUPERAR PONTEIRO DE SESSÃO (para sobreviver a uma
  //  atualização de página SEM perder o contexto — mas sempre revalidando
  //  com o servidor antes de continuar, nunca confiando ciegamente no local).
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
  //  ECRÃ 1 — SELEÇÃO DE LOJA
  // ══════════════════════════════════════════════════════════════════════
  async function pantallaTiendas() {
    S.zona = null; S.rol = null; S.persona = null; S.unidad = null; S.intento = null; S.captura = null;
    await limpiarPuntero();

    const { data, error } = await window.sbInventario.from('tiendas').select('id,nombre').eq('activo', true).order('nombre');
    if (error) {
      render('<h1>Inventário</h1>', '<p>Não foi possível carregar as lojas. Verifica a tua ligação.</p>');
      return;
    }
    const botones = data.map(function (t) {
      return '<button class="inv-primario inv-menu-btn" data-id="' + t.id + '" data-nombre="' + t.nombre + '">' + t.nombre + '</button>';
    }).join('');
    render('<h1>Inventário</h1>', '<h1>Seleciona a tua loja</h1><div class="inv-menu">' + botones + '</div>');

    root().querySelectorAll('.inv-menu button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.tienda = { id: b.dataset.id, nombre: b.dataset.nombre };
        pantallaRol();
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ 2 — SELEÇÃO DE PESSOA (1 ou 2) + SENHA PESSOAL
  // ══════════════════════════════════════════════════════════════════════
  function pantallaRol() {
    render(
      '<h1>' + S.tienda.nombre + '</h1>',
      '<h1>Quem és tu?</h1>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-p1">Pessoa 1 (contagem)</button>' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-p2">Pessoa 2 (leitura)</button>' +
      '</div>' +
      '<button id="inv-btn-volver" style="margin-top:24px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-p1').onclick = function () { pedirClavePersonal('persona1'); };
    document.getElementById('inv-btn-p2').onclick = function () { pedirClavePersonal('persona2'); };
    document.getElementById('inv-btn-volver').onclick = pantallaTiendas;
  }

  function pedirClavePersonal(rol) {
    const f = modal(
      '<h3>Senha pessoal</h3>' +
      '<div style="position:relative;max-width:280px;margin:0 auto;">' +
      '<input type="password" id="inv-clave-personal" placeholder="A tua senha" autofocus style="padding-right:40px;max-width:none;">' +
      '<button type="button" id="inv-clave-olho" title="Mostrar/ocultar senha" ' +
      'style="position:absolute;right:4px;top:4px;padding:6px 10px;border-radius:8px;">👁</button>' +
      '</div>' +
      '<div id="inv-clave-error" style="color:#c0392b;font-size:14px;margin-bottom:10px;"></div>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-clave-ok">Entrar</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>' +
      '</div>'
    );
    const input = f.querySelector('#inv-clave-personal');
    const err = f.querySelector('#inv-clave-error');
    f.querySelector('#inv-clave-olho').onclick = function () {
      input.type = input.type === 'password' ? 'text' : 'password';
    };
    input.focus();
    async function intentar() {
      const clave = input.value.trim();
      if (!clave) return;
      err.textContent = '';
      const { data, error } = await window.sbInventario.rpc('verificar_persona', { p_token: S.token, p_clave: clave });
      if (error || !data || !data.length) {
        err.textContent = 'Senha incorreta.';
        return;
      }
      const persona = data[0];
      S.persona = { id: persona.id, nombre: persona.nombre };
      S.rol = rol;
      f.remove();
      pantallaZona();
    }
    f.querySelector('#inv-clave-ok').onclick = intentar;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') intentar(); });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ 3 — SELEÇÃO DE ZONA (Loja / Armazém)
  // ══════════════════════════════════════════════════════════════════════
  function pantallaZona() {
    render(
      '<h1>' + S.tienda.nombre + ' — ' + S.persona.nombre + '</h1>',
      '<h1>Loja ou Armazém?</h1>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-loja">Loja</button>' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-armazem">Armazém</button>' +
      '</div>' +
      '<button id="inv-btn-volver" style="margin-top:24px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-loja').onclick = function () { S.zona = 'loja'; entrarEnInventario(); };
    document.getElementById('inv-btn-armazem').onclick = function () { S.zona = 'armazem'; entrarEnInventario(); };
    document.getElementById('inv-btn-volver').onclick = pantallaRol;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ABRIR/REUTILIZAR O INVENTÁRIO (loja+zona) E ATRIBUIR A PESSOA
  // ══════════════════════════════════════════════════════════════════════
  async function entrarEnInventario() {
    render('<h1>' + S.tienda.nombre + '</h1>', '<p>A entrar…</p><p>A verificar disponibilidade…</p>');

    // Sair do ecrã NÃO liberta a atribuição (regra de negócio explícita). Por isso, antes de
    // tentar criar uma atribuição nova, vemos se esta pessoa já tem uma ativa. Se for
    // exatamente a mesma loja+zona+função, é uma RETOMA, não um conflito.
    const { data: ativaAtual, error: e0 } = await window.sbInventario
      .from('asignaciones').select('*').eq('persona_id', S.persona.id).eq('estado', 'activa').maybeSingle();

    if (e0) { render('<h1>Erro</h1>', '<p>Não foi possível verificar atribuições anteriores. Verifica a tua ligação.</p>'); return; }

    if (ativaAtual) {
      const mesma = ativaAtual.tienda_id === S.tienda.id && ativaAtual.zona === S.zona && ativaAtual.rol === S.rol;
      if (!mesma) {
        render('<h1>Não disponível</h1>',
          '<p><strong>' + S.persona.nombre + '</strong> já tem uma atribuição ativa como ' +
          (ativaAtual.rol === 'persona1' ? 'Pessoa 1' : 'Pessoa 2') + ' em ' + ativaAtual.tienda_id + ' — ' + ZONA_LABEL[ativaAtual.zona] + '.</p>' +
          '<p>Tem de ser encerrado corretamente antes de poder ser reatribuída a outro sítio.</p>' +
          '<button class="inv-primario" id="inv-btn-voltar-conflito">Voltar</button>');
        document.getElementById('inv-btn-voltar-conflito').onclick = pantallaZona;
        return;
      }
      // Mesma loja+zona+função: retomamos a atribuição existente, sem criar outra.
      const { data: inv, error: eInv } = await window.sbInventario
        .from('inventarios').select('*').eq('id', ativaAtual.inventario_id).maybeSingle();
      if (eInv || !inv) { render('<h1>Erro</h1>', '<p>Não foi possível recuperar o inventário. Verifica a tua ligação.</p>'); return; }
      S.inventario = inv;
      await guardarPuntero();
      pantallaUnidades();
      return;
    }

    let { data: inv, error: e1 } = await window.sbInventario
      .from('inventarios').select('*')
      .eq('tienda_id', S.tienda.id).eq('zona', S.zona).eq('estado', 'abierto')
      .maybeSingle();

    if (e1) { render('<h1>Erro</h1>', '<p>Não foi possível verificar o inventário. Verifica a tua ligação.</p>'); return; }

    if (!inv) {
      const etiqueta = S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + ' — ' + new Date().getFullYear();
      const { data: nuevo, error: e2 } = await window.sbInventario
        .from('inventarios')
        .insert({ tienda_id: S.tienda.id, zona: S.zona, etiqueta: etiqueta, unidades_esperadas: 0 })
        .select().single();
      if (e2) { render('<h1>Erro</h1>', '<p>Não foi possível abrir o inventário.</p>'); return; }
      inv = nuevo;
    }
    S.inventario = inv;

    const { error: e3 } = await window.sbInventario.from('asignaciones').insert({
      persona_id: S.persona.id, tienda_id: S.tienda.id, zona: S.zona, rol: S.rol, inventario_id: inv.id
    });

    if (e3) {
      if (esConflictoDuplicado(e3)) {
        render('<h1>Não disponível</h1>',
          '<p><strong>' + S.persona.nombre + '</strong> já tem uma atribuição ativa noutra loja/função, ou essa função já está ocupada neste inventário por outra pessoa.</p>' +
          '<p>Tem de ser encerrado corretamente antes de poder ser reatribuído.</p>' +
          '<button class="inv-primario" id="inv-btn-voltar-conflito">Voltar</button>');
        document.getElementById('inv-btn-voltar-conflito').onclick = pantallaZona;
      } else {
        render('<h1>Erro</h1>', '<p>Não foi possível registar a atribuição. Verifica a tua ligação e tenta novamente.</p>');
      }
      return;
    }

    await guardarPuntero();
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ 4 — LISTA DE UNIDADES (Expositores / Grupos)
  // ══════════════════════════════════════════════════════════════════════
  async function construirEstadoUnidades() {
    const { data: unidades, error } = await window.sbInventario
      .from('unidades').select('*, intentos(*)')
      .eq('inventario_id', S.inventario.id).order('numero');

    if (error) return null;

    // Nome de quem tem o papel de Pessoa 2 atribuído a este inventário agora — independente
    // de já ter começado a ler alguma unidade em concreto.
    const { data: asigP2Lista } = await window.sbInventario.from('asignaciones')
      .select('persona:personas!asignaciones_persona_id_fkey(nombre)')
      .eq('inventario_id', S.inventario.id).eq('rol', 'persona2').eq('estado', 'activa').maybeSingle();
    const nomeP2Inventario = (asigP2Lista && asigP2Lista.persona) ? primerNombre(asigP2Lista.persona.nombre) : '';

    const label = UNIDAD_LABEL[S.zona];
    const validadas = unidades.filter(function (u) { return u.estado === 'validada'; }).length;

    // Revelação progressiva: uma unidade "por começar" (sem tentativas ainda) só aparece
    // depois de a anterior já ter sido iniciada. As unidades já iniciadas ou validadas
    // aparecem sempre, independentemente da ordem em que foram trabalhadas.
    const numerosIniciados = unidades
      .filter(function (u) { return (u.intentos && u.intentos.length) || u.estado === 'validada'; })
      .map(function (u) { return u.numero; });
    const limiteVisible = (numerosIniciados.length ? Math.max.apply(null, numerosIniciados) : 0) + 1;

    let filas = unidades.filter(function (u) { return u.numero <= limiteVisible; }).map(function (u) {
      const ultimoIntento = (u.intentos || []).sort(function (a, b) {
        return b.numero_intento - a.numero_intento;
      })[0];
      let estadoTxt = 'Pendente';
      let accion = '';
      if (u.estado === 'validada') {
        estadoTxt = '✅ Validado';
        accion = '<button data-accion="verdetalle" data-id="' + u.id + '" data-numero="' + u.numero + '" data-intento="' + (ultimoIntento ? ultimoIntento.id : '') + '">Ver detalhes</button>';
      } else if (ultimoIntento && ultimoIntento.estado === 'divergencia') {
        estadoTxt = '❌ Divergência — repetir contagem';
      } else if (ultimoIntento && ultimoIntento.estado === 'escaneando') {
        estadoTxt = S.rol === 'persona2' ? 'A aguardar leitura' : (nomeP2Inventario ? 'Em leitura por ' + nomeP2Inventario : 'Em leitura');
      } else if (ultimoIntento && ultimoIntento.estado === 'autorizado') {
        estadoTxt = S.rol === 'persona2'
          ? 'A aguardar leitura'
          : (nomeP2Inventario ? 'Encerrado — a aguardar ' + nomeP2Inventario : 'Encerrado (a aguardar Pessoa 2)');
      }
      if (S.rol === 'persona1' && u.estado !== 'validada' && (!ultimoIntento || ultimoIntento.estado === 'divergencia')) {
        accion = '<button class="inv-primario" data-accion="contar" data-id="' + u.id + '" data-numero="' + u.numero + '">Contar</button>';
      }
      if (S.rol === 'persona1' && ultimoIntento && (ultimoIntento.estado === 'autorizado' || ultimoIntento.estado === 'escaneando')) {
        accion = '<button data-accion="vercodigos" data-id="' + u.id + '" data-numero="' + u.numero + '" data-intento="' + ultimoIntento.id + '">Ver códigos</button>';
      }
      if (S.rol === 'persona2' && ultimoIntento && (ultimoIntento.estado === 'autorizado' || ultimoIntento.estado === 'escaneando')) {
        accion = '<button class="inv-primario" data-accion="escanear" data-id="' + u.id + '" data-numero="' + u.numero + '">' +
          (ultimoIntento.estado === 'escaneando' ? 'Continuar' : 'Começar leitura') + '</button>';
      }
      return '<div class="inv-lista-item"><span>' + label + ' ' + u.numero + ' — ' + estadoTxt + '</span>' + accion + '</div>';
    }).join('');

    if (!filas) filas = '<p>Ainda não há ' + label.toLowerCase() + 's criados.</p>';

    // O controlo de "número esperado" só aparece: (a) na primeira vez, antes de haver
    // qualquer número declarado, ou (b) depois de todas as unidades já declaradas
    // estarem validadas — para acrescentar mais. Enquanto houver trabalho pendente das
    // já declaradas, fica escondido, para não pedir de novo algo que já foi definido.
    const esperadas = S.inventario.unidades_esperadas || 0;
    const todasValidadas = esperadas > 0 && unidades.length >= esperadas && validadas >= esperadas;

    return {
      unidades: unidades, filas: filas, validadas: validadas,
      esperadas: esperadas, todasValidadas: todasValidadas, label: label
    };
  }

  function vincularAccionesUnidades() {
    root().querySelectorAll('[data-accion="contar"]').forEach(function (b) {
      b.onclick = function () { iniciarConteo(b.dataset.id, parseInt(b.dataset.numero, 10)); };
    });
    root().querySelectorAll('[data-accion="escanear"]').forEach(function (b) {
      b.onclick = function () { iniciarAutorizacionEscaneo(b.dataset.id, parseInt(b.dataset.numero, 10)); };
    });
    root().querySelectorAll('[data-accion="vercodigos"]').forEach(function (b) {
      b.onclick = function () { verCodigosDeNuevo(b.dataset.id, parseInt(b.dataset.numero, 10), b.dataset.intento); };
    });
    root().querySelectorAll('[data-accion="verdetalle"]').forEach(function (b) {
      b.onclick = function () { verDetalheUnidad(b.dataset.id, parseInt(b.dataset.numero, 10), b.dataset.intento); };
    });
  }

  // Refresca só a lista de expositores (sem recarregar o ecrã inteiro, sem perder o
  // scroll) enquanto se está nesta tela — para que uma mudança feita por outra pessoa
  // (ex.: Pessoa 1 recontando após divergência) apareça sozinha em poucos segundos.
  async function refrescarListaUnidades() {
    const cont = document.getElementById('inv-lista-unidades');
    if (!cont) { clearInterval(timerListaUnidades); timerListaUnidades = null; return; }
    const estado = await construirEstadoUnidades();
    if (!estado) return;
    cont.innerHTML = estado.filas;
    vincularAccionesUnidades();
  }

  async function pantallaUnidades() {
    const estado = await construirEstadoUnidades();
    if (!estado) { render('<h1>Erro</h1>', '<p>Não foi possível carregar a lista de unidades.</p>'); return; }

    const nuevaUnidadHtml = (S.rol === 'persona1' && (estado.esperadas === 0 || estado.todasValidadas))
      ? '<div style="margin-top:20px;width:100%;"><input type="number" id="inv-num-nuevas" placeholder="' +
        (estado.esperadas === 0 ? 'Número total de ' + estado.label.toLowerCase() + 's' : 'Novo número total (atualmente ' + estado.esperadas + ')') + '">' +
        '<button class="inv-primario" id="inv-btn-fijar-numero">' + (estado.esperadas === 0 ? 'Definir número esperado' : 'Adicionar mais ' + estado.label.toLowerCase() + 's') + '</button></div>'
      : '';

    const cierreHtml = S.rol === 'persona2'
      ? '<button class="inv-primario" id="inv-btn-cerrar-inv" style="margin-top:20px;">Encerrar inventário definitivamente</button>'
      : '';

    render(
      '<h1>' + S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + '</h1>',
      '<p>' + estado.validadas + ' / ' + Math.max(estado.unidades.length, S.inventario.unidades_esperadas) + ' validados — ' + S.persona.nombre + ' (' + (S.rol === 'persona1' ? 'Pessoa 1' : 'Pessoa 2') + ')</p>' +
      '<div style="width:100%;" id="inv-lista-unidades">' + estado.filas + '</div>' + nuevaUnidadHtml + cierreHtml +
      '<button id="inv-btn-salir" style="margin-top:24px;">Sair deste ecrã (não encerra a tua atribuição)</button>',
      pantallaTiendas
    );

    vincularAccionesUnidades();
    const btnFijar = document.getElementById('inv-btn-fijar-numero');
    if (btnFijar) btnFijar.onclick = fijarNumeroEsperado;
    const btnCerrar = document.getElementById('inv-btn-cerrar-inv');
    if (btnCerrar) btnCerrar.onclick = intentarCerrarInventario;
    document.getElementById('inv-btn-salir').onclick = function () {
      if (timerListaUnidades) { clearInterval(timerListaUnidades); timerListaUnidades = null; }
      root().remove();
    };

    if (timerListaUnidades) clearInterval(timerListaUnidades);
    timerListaUnidades = setInterval(refrescarListaUnidades, 5000);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  VER DETALHES DE UMA UNIDADE JÁ VALIDADA (só consulta, não reabre nada)
  // ══════════════════════════════════════════════════════════════════════
  async function obtenerEscaneosDeUnidad(intentoId) {
    if (!intentoId) return [];
    const { data: capturas } = await window.sbInventario.from('capturas')
      .select('id').eq('intento_id', intentoId).eq('estado', 'cerrada');
    const capturaIds = (capturas || []).map(function (c) { return c.id; });
    if (!capturaIds.length) return [];

    const { data: escaneos } = await window.sbInventario.from('escaneos')
      .select('*').in('captura_id', capturaIds).order('creado_en_dispositivo_at', { ascending: false });
    if (!escaneos || !escaneos.length) return [];

    const { data: anulaciones } = await window.sbInventario.from('anulaciones')
      .select('escaneo_id').in('escaneo_id', escaneos.map(function (e) { return e.id; }));
    const anuladosSet = new Set((anulaciones || []).map(function (a) { return a.escaneo_id; }));
    return escaneos.filter(function (e) { return !anuladosSet.has(e.id); });
  }

  function agruparPorCodigo(escaneos) {
    const mapa = new Map();
    escaneos.forEach(function (e) {
      const key = e.codigo_barras;
      if (!mapa.has(key)) {
        mapa.set(key, {
          codigo_barras: key,
          referencia_resuelta: e.referencia_resuelta,
          descripcion_resuelta: e.descripcion_resuelta,
          cantidad: 0
        });
      }
      mapa.get(key).cantidad++;
    });
    return Array.from(mapa.values()).sort(function (a, b) { return b.cantidad - a.cantidad; });
  }

  function filaResumoCodigo(g) {
    return '<div class="inv-historial-item">' +
      '<span class="inv-historial-codigo">' + escapeHtml(g.codigo_barras) + '</span>' +
      '<span class="inv-historial-ref">' + escapeHtml(g.referencia_resuelta || '—') + '</span>' +
      '<span class="inv-historial-desc">' + escapeHtml(g.descripcion_resuelta || '—') + '</span>' +
      '<span class="inv-historial-qty">' + g.cantidad + '</span>' +
      '</div>';
  }

  async function reiniciarExpositor(unidadId, numero, intentoId) {
    if (!confirm('Reiniciar ' + UNIDAD_LABEL[S.zona].toLowerCase() + ' ' + numero + '? O trabalho validado vai ser descartado e é preciso refazer a contagem do zero para valer no relatório final. Esta ação não pode ser desfeita.')) return;

    const { error: e1 } = await window.sbInventario.from('intentos')
      .update({ estado: 'divergencia' }).eq('id', intentoId);
    if (e1) { alert('Não foi possível reiniciar. Verifica a tua ligação.'); return; }

    const { error: e2 } = await window.sbInventario.from('unidades')
      .update({ estado: 'pendiente' }).eq('id', unidadId);
    if (e2) { alert('A unidade ficou num estado inconsistente — tenta reiniciar de novo. Verifica a tua ligação.'); return; }

    await window.sbInventario.from('incidencias').insert({
      inventario_id: S.inventario.id, unidad_id: unidadId, tipo: 'reinicio_expositor',
      detalle: { numero: numero, persona: S.persona.nombre, fecha: new Date().toISOString() }
    });

    alert('Reiniciado. É preciso voltar a contar esta unidade.');
    pantallaUnidades();
  }

  async function verDetalheUnidad(unidadId, numero, intentoId) {
    render('<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + ' — detalhe</h1>', '<p>A carregar…</p>', pantallaUnidades);
    const escaneos = await obtenerEscaneosDeUnidad(intentoId);
    const grupos = agruparPorCodigo(escaneos);
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + ' — detalhe</h1>',
      '<p>' + escaneos.length + ' peça' + (escaneos.length === 1 ? '' : 's') + ' em ' + grupos.length + ' código' + (grupos.length === 1 ? '' : 's') + ' de barras</p>' +
      '<div class="inv-historial" id="inv-historial-detalhe" style="max-height:340px;">' +
      (grupos.length ? grupos.map(filaResumoCodigo).join('') : '<p class="inv-historial-vazio">Sem leituras registadas.</p>') +
      '</div>' +
      '<button class="inv-peligro" id="inv-btn-reiniciar-expositor" style="margin-top:16px;">🔁 Reiniciar ' + UNIDAD_LABEL[S.zona].toLowerCase() + '</button>',
      pantallaUnidades
    );
    const btnReiniciar = document.getElementById('inv-btn-reiniciar-expositor');
    if (btnReiniciar) btnReiniciar.onclick = function () { reiniciarExpositor(unidadId, numero, intentoId); };
  }

  async function fijarNumeroEsperado() {
    const n = parseInt(document.getElementById('inv-num-nuevas').value, 10);
    if (!n || n < 1) return;
    const anterior = S.inventario.unidades_esperadas || 0;
    if (n < anterior) {
      alert('Não é permitido reduzir o número de unidades esperadas. Atual: ' + anterior);
      return;
    }
    const { error: e1 } = await window.sbInventario.from('inventarios')
      .update({ unidades_esperadas: n }).eq('id', S.inventario.id);
    if (e1) { alert('Não foi possível atualizar. Verifica a tua ligação.'); return; }

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
  //  PESSOA 1 — CONTAGEM FÍSICA E ENCERRAMENTO DA UNIDADE
  // ══════════════════════════════════════════════════════════════════════
  async function iniciarConteo(unidadId, numero) {
    S.unidad = { id: unidadId, numero: numero };
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
      '<p>Introduz a contagem física total desta unidade.</p>' +
      '<input type="number" id="inv-conteo-fisico" placeholder="Peças contadas">' +
      '<button class="inv-primario" id="inv-btn-cerrar-conteo">Encerrar ' + UNIDAD_LABEL[S.zona].toLowerCase() + '</button>' +
      '<button id="inv-btn-volver-lista" style="margin-top:10px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-volver-lista').onclick = pantallaUnidades;
    document.getElementById('inv-btn-cerrar-conteo').onclick = cerrarConteo;
  }

  async function cerrarConteo() {
    const conteo = parseInt(document.getElementById('inv-conteo-fisico').value, 10);
    if (!conteo && conteo !== 0) { alert('Introduz um número válido.'); return; }

    const { data: existentes } = await window.sbInventario.from('intentos')
      .select('numero_intento').eq('unidad_id', S.unidad.id).order('numero_intento', { ascending: false }).limit(1);
    const numeroIntento = existentes && existentes.length ? existentes[0].numero_intento + 1 : 1;

    const { data: intento, error } = await window.sbInventario.from('intentos').insert({
      unidad_id: S.unidad.id, numero_intento: numeroIntento, persona1_id: S.persona.id,
      conteo_fisico: conteo, cerrado_at: new Date().toISOString(), estado: 'autorizado'
    }).select().single();

    if (error) { alert('Não foi possível encerrar. Verifica a tua ligação e tenta novamente — nada foi perdido.'); return; }

    await window.sbInventario.from('unidades').update({ estado: 'en_proceso' }).eq('id', S.unidad.id);

    intento.persona1_nombre = S.persona.nombre;
    S.intento = intento;
    mostrarCodigos(1);
  }

  async function verCodigosDeNuevo(unidadId, numero, intentoId) {
    const { data: intento, error } = await window.sbInventario.from('intentos')
      .select('*, persona1:personas!intentos_persona1_id_fkey(nombre)')
      .eq('id', intentoId).maybeSingle();
    if (error || !intento) { alert('Não foi possível recuperar esta tentativa. Verifica a tua ligação.'); return; }
    intento.persona1_nombre = intento.persona1 ? intento.persona1.nombre : '';
    S.unidad = { id: unidadId, numero: numero };
    S.intento = intento;
    mostrarCodigos(1);
  }

  async function mostrarCodigos(indice) {
    const codigo = await codigoIndice(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, indice);
    const nomeP1 = S.intento.persona1_nombre ? primerNombre(S.intento.persona1_nombre) : '';
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + S.unidad.numero + ' — encerrado</h1>',
      (nomeP1 ? '<p>Registado por <strong>' + nomeP1 + '</strong></p>' : '') +
      '<p>Contagem física: <strong>' + S.intento.conteo_fisico + '</strong></p>' +
      '<div style="font-size:40px;letter-spacing:4px;margin:16px 0;font-weight:300;">' + codigo + '</div>' +
      '<button id="inv-btn-mas-codigos">Gerar outro código</button>' +
      '<button class="inv-primario" id="inv-btn-siguiente-unidad" style="margin-top:16px;">Ir para a próxima unidade</button>' +
      '<button id="inv-btn-volver-codigos" style="margin-top:10px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-mas-codigos').onclick = function () { mostrarCodigos(indice + 1); };
    document.getElementById('inv-btn-siguiente-unidad').onclick = pantallaUnidades;
    document.getElementById('inv-btn-volver-codigos').onclick = pantallaUnidades;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PESSOA 2 — INTRODUZIR CÓDIGO E LER
  // ══════════════════════════════════════════════════════════════════════
  async function iniciarAutorizacionEscaneo(unidadId, numero) {
    S.unidad = { id: unidadId, numero: numero };

    const { data: intento, error } = await window.sbInventario.from('intentos')
      .select('*').eq('unidad_id', unidadId).order('numero_intento', { ascending: false }).limit(1).single();
    if (error || !intento) { render('<h1>Erro</h1>', '<p>Não foi possível carregar esta unidade.</p>'); return; }
    S.intento = intento;

    if (intento.estado === 'escaneando' && intento.persona2_id === S.persona.id) {
      // Retoma após uma atualização de página: recuperar a captura ativa, nunca criar outra às cegas.
      const { data: capturas } = await window.sbInventario.from('capturas')
        .select('*').eq('intento_id', intento.id).eq('estado', 'activa').limit(1);
      if (capturas && capturas.length) {
        S.captura = capturas[0];
        await guardarPuntero();
        pantallaEscaneo();
        return;
      }
    }

    // Com rede, o servidor já garante a entrega correta (estado 'autorizado' = Pessoa 1
    // fechou mesmo esta unidade) — o código de autorização só é necessário como alternativa
    // para quando não há rede nenhuma para confirmar isso automaticamente.
    if (navigator.onLine && intento.estado === 'autorizado') {
      render('<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>', '<p>A iniciar leitura…</p>');
      const resultado = await reclamarUnidad();
      if (resultado.ok) return;
      render(
        '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
        '<p style="color:#c0392b;">' + resultado.motivo + '</p>' +
        '<button class="inv-primario" id="inv-btn-tentar-de-novo">Tentar novamente</button>' +
        '<button id="inv-btn-volver-lista" style="margin-top:10px;">← Voltar</button>',
        pantallaUnidades
      );
      document.getElementById('inv-btn-tentar-de-novo').onclick = function () { iniciarAutorizacionEscaneo(unidadId, numero); };
      document.getElementById('inv-btn-volver-lista').onclick = pantallaUnidades;
      return;
    }

    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
      '<p>Contagem da Pessoa 1: <strong>' + intento.conteo_fisico + '</strong></p>' +
      '<input type="text" id="inv-codigo-auth" placeholder="Código de autorização" inputmode="numeric">' +
      '<div id="inv-codigo-error" style="color:#c0392b;font-size:14px;"></div>' +
      '<button class="inv-primario" id="inv-btn-autorizar">Começar leitura</button>' +
      '<button id="inv-btn-volver-lista" style="margin-top:10px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-volver-lista').onclick = pantallaUnidades;
    document.getElementById('inv-btn-autorizar').onclick = autorizarEscaneo;
    document.getElementById('inv-codigo-auth').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') autorizarEscaneo();
    });
  }

  // .eq('estado','autorizado') funciona como guarda de concorrência: se esta tentativa já
  // tiver sido reclamada entretanto, esta atualização não afeta nenhuma linha e nada é
  // sobreposto. Usado tanto pelo caminho automático (com rede) como pelo código manual.
  async function reclamarUnidad() {
    const { data: intentoAct, error: e1 } = await window.sbInventario.from('intentos')
      .update({ persona2_id: S.persona.id, estado: 'escaneando' })
      .eq('id', S.intento.id).eq('estado', 'autorizado').select();
    if (e1) return { ok: false, motivo: 'Não foi possível autorizar. Verifica a tua ligação.' };
    if (!intentoAct || !intentoAct.length) {
      return { ok: false, motivo: 'Esta unidade já foi ocupada por outra pessoa.' };
    }
    S.intento = intentoAct[0];

    const { data: captura, error: e2 } = await window.sbInventario.from('capturas')
      .insert({ intento_id: S.intento.id, numero_captura: 1, estado: 'activa' }).select().single();
    if (e2) return { ok: false, motivo: 'Não foi possível iniciar a captura. Verifica a tua ligação.' };
    S.captura = captura;

    await guardarPuntero();
    pantallaEscaneo();
    return { ok: true };
  }

  async function autorizarEscaneo() {
    const codigo = document.getElementById('inv-codigo-auth').value;
    const err = document.getElementById('inv-codigo-error');
    const ok = await verificarCodigo(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, codigo);
    if (!ok) { err.textContent = 'Código incorreto, ou pertence a outra unidade/tentativa.'; return; }

    const resultado = await reclamarUnidad();
    if (!resultado.ok) err.textContent = resultado.motivo;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ DE LEITURA
  // ══════════════════════════════════════════════════════════════════════
  let bufferScan = '';
  let timerScan = null;

  function filaHistorial(e) {
    return '<div class="inv-historial-item">' +
      '<span class="inv-historial-codigo">' + escapeHtml(e.codigo_barras) + '</span>' +
      '<span class="inv-historial-ref">' + escapeHtml(e.referencia_resuelta || '—') + '</span>' +
      '<span class="inv-historial-desc">' + escapeHtml(e.descripcion_resuelta || '—') + '</span>' +
      '</div>';
  }

  function panelUltimaLectura(evento) {
    if (!evento) return '<p class="inv-ultima-vazio">À espera de leitura…</p>';
    return '<p class="inv-ultima-ref">' + escapeHtml(evento.referencia_resuelta || '—') + '</p>' +
      '<p class="inv-ultima-desc">' + escapeHtml(evento.descripcion_resuelta || '—') + '</p>' +
      '<p class="inv-ultima-codigo">' + escapeHtml(evento.codigo_barras) + '</p>';
  }

  function cardUltimaLectura(evento) {
    return '<div class="inv-ultima" id="inv-ultima">' +
      '<div id="inv-ultima-info">' + panelUltimaLectura(evento) + '</div>' +
      '<div class="inv-acciones-icono">' +
      '<button class="inv-icon-btn" id="inv-btn-manual"><span class="inv-icon">✏️</span><span class="inv-icon-label">Manual</span></button>' +
      '<button class="inv-icon-btn" id="inv-btn-anular"><span class="inv-icon">❌</span><span class="inv-icon-label">Anular</span></button>' +
      '<button class="inv-icon-btn" id="inv-btn-limpiar"><span class="inv-icon">🔄</span><span class="inv-icon-label">Reiniciar</span></button>' +
      '</div>' +
      '<button class="inv-peligro inv-btn-encerrar" id="inv-btn-cerrar-unidad">🔒 Encerrar ' + UNIDAD_LABEL[S.zona].toLowerCase() + '</button>' +
      '</div>';
  }

  function focarSemTeclado(input) {
    input.setAttribute('readonly', 'readonly');
    input.focus();
    setTimeout(function () { input.removeAttribute('readonly'); }, 50);
  }

  async function refrescarEscaneoUI() {
    const validos = await obtenerEscaneosValidos(S.captura.id);

    const elInfo = document.getElementById('inv-ultima-info');
    if (elInfo) elInfo.innerHTML = panelUltimaLectura(validos[0]);

    const elHist = document.getElementById('inv-historial');
    if (elHist) {
      elHist.innerHTML = validos.length
        ? validos.map(filaHistorial).join('')
        : '<p class="inv-historial-vazio">Ainda sem leituras nesta unidade.</p>';
    }
  }

  async function pantallaEscaneo() {
    const validos = await obtenerEscaneosValidos(S.captura.id);
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + S.unidad.numero + ' — A ler</h1>',
      cardUltimaLectura(validos[0]) +
      '<input type="text" id="inv-scan-input" autocomplete="off">' +
      '<div class="inv-historial" id="inv-historial">' +
      (validos.length ? validos.map(filaHistorial).join('') : '<p class="inv-historial-vazio">Ainda sem leituras nesta unidade.</p>') +
      '</div>',
      pantallaUnidades
    );

    const input = document.getElementById('inv-scan-input');
    focarSemTeclado(input);
    root().addEventListener('click', function () { focarSemTeclado(input); });

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
      const codigo = prompt('Insere o código manualmente:');
      if (codigo && codigo.trim()) procesarCodigo(codigo.trim());
    };
    document.getElementById('inv-btn-anular').onclick = anularUltimoEscaneo;
    document.getElementById('inv-btn-limpiar').onclick = limpiarCaptura;
    document.getElementById('inv-btn-cerrar-unidad').onclick = cerrarUnidadEscaneo;
  }

  async function procesarCodigo(codigo) {
    const ficticios = datosFicticios(codigo);
    await registrarEscaneo(codigo, ficticios.referencia, ficticios.descricao);
    await refrescarEscaneoUI();
    const input = document.getElementById('inv-scan-input');
    if (input) focarSemTeclado(input);
  }

  async function anularUltimoEscaneo() {
    const eventos = (await idbGetAllByIndex('eventos', 'captura_id', S.captura.id))
      .sort(function (a, b) { return new Date(b.creado_en_dispositivo_at) - new Date(a.creado_en_dispositivo_at); });
    if (!eventos.length) { alert('Não há leituras para anular nesta captura.'); return; }
    const anulTodas = await idbGetAll('anulaciones_local');
    const anuladosSet = new Set(anulTodas.map(function (a) { return a.escaneo_id; }));
    const candidato = eventos.find(function (e) { return !anuladosSet.has(e.id); });
    if (!candidato) { alert('Não há leituras pendentes de anulação nesta captura.'); return; }

    const f = modal(
      '<h3>Anular a última leitura?</h3>' +
      '<p>Código: ' + candidato.codigo_barras + '</p>' +
      '<select id="inv-motivo-anular" style="width:100%;padding:10px;margin-bottom:10px;">' +
      '<option value="Duplicado">Duplicado</option>' +
      '<option value="Erro de leitura">Erro de leitura</option>' +
      '<option value="Outro motivo">Outro motivo</option></select>' +
      '<input type="text" id="inv-motivo-otro" placeholder="Explica o motivo" style="display:none;">' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-confirmar-anular">Confirmar anulação</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>' +
      '</div>'
    );
    const sel = f.querySelector('#inv-motivo-anular');
    const otro = f.querySelector('#inv-motivo-otro');
    sel.addEventListener('change', function () { otro.style.display = sel.value === 'Outro motivo' ? 'block' : 'none'; });

    f.querySelector('#inv-confirmar-anular').onclick = async function () {
      const motivo = sel.value === 'Outro motivo' ? otro.value.trim() : sel.value;
      if (sel.value === 'Outro motivo' && !motivo) { alert('Explica o motivo.'); return; }
      const anulacion = { id: uuid(), escaneo_id: candidato.id, motivo: motivo, persona_id: S.persona.id, synced: false };
      await idbPut('anulaciones_local', anulacion);
      sincronizar();
      f.remove();
      await refrescarEscaneoUI();
    };
  }

  async function limpiarCaptura() {
    if (!confirm('Começar de novo? As leituras atuais ficam guardadas no histórico, mas não vão contar no resultado final.')) return;
    await window.sbInventario.from('capturas').update({ estado: 'cancelada', cerrado_at: new Date().toISOString() }).eq('id', S.captura.id);
    const { data: nueva, error } = await window.sbInventario.from('capturas')
      .insert({ intento_id: S.intento.id, numero_captura: S.captura.numero_captura + 1, estado: 'activa' }).select().single();
    if (error) { alert('Não foi possível reiniciar a captura. Verifica a tua ligação.'); return; }
    S.captura = nueva;
    await guardarPuntero();
    pantallaEscaneo();
  }

  async function cerrarUnidadEscaneo() {
    if (!confirm('Encerrar esta unidade? Vai comparar-se a contagem com as leituras válidas.')) return;
    const total = await contarEscaneosValidos(S.captura.id);

    await window.sbInventario.from('capturas').update({ estado: 'cerrada', cerrado_at: new Date().toISOString() }).eq('id', S.captura.id);

    if (total === S.intento.conteo_fisico) {
      await window.sbInventario.from('intentos').update({ estado: 'validado' }).eq('id', S.intento.id);
      await window.sbInventario.from('unidades').update({ estado: 'validada' }).eq('id', S.unidad.id);
      alert('✅ Unidade validada: ' + total + ' / ' + S.intento.conteo_fisico);
    } else {
      await window.sbInventario.from('intentos').update({ estado: 'divergencia' }).eq('id', S.intento.id);
      await window.sbInventario.from('unidades').update({ estado: 'pendiente' }).eq('id', S.unidad.id);
      alert('❌ Divergência: contagem física ' + S.intento.conteo_fisico + ' vs ' + total + ' lidos. A Pessoa 1 tem de voltar a contar esta unidade.');
    }
    await limpiarPuntero();
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ENCERRAMENTO DEFINITIVO DO INVENTÁRIO
  // ══════════════════════════════════════════════════════════════════════
  async function intentarCerrarInventario() {
    if (S.pendientesSync > 0) {
      alert('Ainda há ' + S.pendientesSync + ' leituras pendentes de sincronizar. Espera que o indicador fique verde antes de encerrar.');
      return;
    }
    if (!navigator.onLine) { alert('Precisas de ligação à Internet para encerrar o inventário definitivamente.'); return; }
    if (!confirm('Encerrar definitivamente este inventário? Esta ação não pode ser desfeita.')) return;

    const { data, error } = await window.sbInventario.rpc('cerrar_inventario', {
      p_token: S.token, p_inventario_id: S.inventario.id, p_persona_id: S.persona.id
    });
    if (error) { alert('Não foi possível encerrar: ' + error.message); return; }
    const resultado = data && data[0];
    if (!resultado || !resultado.ok) {
      alert('Ainda não é possível encerrar: ' + (resultado ? resultado.motivo : 'erro desconhecido'));
      return;
    }
    alert('Inventário encerrado corretamente.');
    await limpiarPuntero();
    root().remove();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PONTO DE ENTRADA
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
