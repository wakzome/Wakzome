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
  const IDB_VERSION = 3;

  const ZONA_LABEL = { loja: 'Loja', armazem: 'Armazém' };
  const UNIDAD_LABEL = { loja: 'Expositor', armazem: 'Grupo' };
  const UNIDAD_LABEL_PLURAL = { loja: 'expositores', armazem: 'grupos' };

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
        if (!db.objectStoreNames.contains('asociaciones_locales')) {
          const store = db.createObjectStore('asociaciones_locales', { keyPath: 'clave' });
          store.createIndex('sincronizado', 'sincronizado');
        }
        if (!db.objectStoreNames.contains('intentos_locales')) {
          const store = db.createObjectStore('intentos_locales', { keyPath: 'id' });
          store.createIndex('unidad_id', 'unidad_id');
          store.createIndex('synced', 'synced');
        }
        if (!db.objectStoreNames.contains('capturas_locales')) {
          const store = db.createObjectStore('capturas_locales', { keyPath: 'id' });
          store.createIndex('intento_id', 'intento_id');
          store.createIndex('synced', 'synced');
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

  // Rede de segurança para leituras "rede primeiro, cópia local depois": numa zona sem
  // sinal o telefone pode continuar a acreditar que há ligação (navigator.onLine === true)
  // e o pedido ao servidor não falha — fica pendurado à espera de uma resposta que nunca
  // chega. Isto garante que essa espera nunca é maior do que TIMEOUT_RED_MS, para cair
  // sempre para a cópia local a tempo.
  const TIMEOUT_RED_MS = 4000;
  function conTimeout(promessa) {
    return Promise.race([
      promessa,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('tempo esgotado')); }, TIMEOUT_RED_MS);
      })
    ]);
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
  let sheetJsPromise = null;

  // Carrega a biblioteca de geração de Excel (.xlsx) só quando é mesmo preciso — a maioria
  // das sessões de escaneamento nunca a usa. Fica em cache depois do primeiro carregamento.
  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    if (sheetJsPromise) return sheetJsPromise;
    sheetJsPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { sheetJsPromise = null; reject(new Error('falha ao carregar')); };
      document.head.appendChild(script);
    });
    return sheetJsPromise;
  }

  async function actualizarIndicador() {
    const eventos = await idbGetAll('eventos');
    const anul = await idbGetAll('anulaciones_local');
    const intentosLoc = await idbGetAll('intentos_locales');
    const capturasLoc = await idbGetAll('capturas_locales');
    const pendientes = eventos.filter(function (e) { return !e.synced; }).length +
      anul.filter(function (a) { return !a.synced; }).length +
      intentosLoc.filter(function (i) { return !i.synced; }).length +
      capturasLoc.filter(function (c) { return !c.synced; }).length;
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
      // Intentos e capturas primeiro — escaneos e capturas dependem deles existirem no
      // servidor (chaves estrangeiras). Um conflito real (ex.: duas pessoas fecharam a
      // mesma unidade offline) fica marcado como "conflito" em vez de ser gravado às
      // escondidas: nada se sobrepõe em silêncio.
      const intentosLoc = (await idbGetAll('intentos_locales')).filter(function (i) { return !i.synced && !i.conflicto; });
      for (const it of intentosLoc) {
        const payload = {
          id: it.id, unidad_id: it.unidad_id, numero_intento: it.numero_intento,
          persona1_id: it.persona1_id || null, persona2_id: it.persona2_id || null,
          conteo_fisico: it.conteo_fisico != null ? it.conteo_fisico : null,
          estado: it.estado, cerrado_at: it.cerrado_at || null
        };
        // Pode ser uma tentativa nova (Pessoa 1 fechou a contagem) ou a atualização de uma
        // já existente no servidor (Pessoa 2 reclamou-a offline). Tenta primeiro como
        // atualização — só avança se ainda estava "autorizado", ou seja, se mais ninguém
        // mexeu nela entretanto.
        const { data: atualizados, error: eUpd } = await window.sbInventario.from('intentos')
          .update(payload).eq('id', it.id).eq('estado', 'autorizado').select();
        if (eUpd) continue; // rede/erro: tenta no próximo ciclo

        if (atualizados && atualizados.length) {
          await idbPut('intentos_locales', Object.assign({}, it, { synced: true }));
          continue;
        }

        // Não havia nenhuma linha "autorizado" com este id: ou ainda não existe (é mesmo
        // nova) ou já mudou de mãos — nesse caso não se sobrescreve às escondidas.
        const { data: existente } = await window.sbInventario.from('intentos').select('id').eq('id', it.id).maybeSingle();
        if (!existente) {
          const { error: eIns } = await window.sbInventario.from('intentos').insert(payload);
          if (!eIns) {
            await idbPut('intentos_locales', Object.assign({}, it, { synced: true }));
          } else if (esConflictoDuplicado(eIns)) {
            await idbPut('intentos_locales', Object.assign({}, it, { conflicto: true }));
          }
        } else {
          await idbPut('intentos_locales', Object.assign({}, it, { conflicto: true }));
        }
      }

      const capturasLoc = (await idbGetAll('capturas_locales')).filter(function (c) { return !c.synced && !c.conflicto; });
      for (const c of capturasLoc) {
        // Só avança se o intento desta captura já está confirmado no servidor.
        const intentoPai = intentosLoc.find(function (i) { return i.id === c.intento_id; });
        if (intentoPai && !intentoPai.synced) continue;
        const { error } = await window.sbInventario.from('capturas').insert({
          id: c.id, intento_id: c.intento_id, numero_captura: c.numero_captura, estado: c.estado
        });
        if (!error) {
          await idbPut('capturas_locales', Object.assign({}, c, { synced: true }));
        } else if (esConflictoDuplicado(error)) {
          await idbPut('capturas_locales', Object.assign({}, c, { conflicto: true }));
        }
      }

      // Um evento com resuelto === false ainda não tem referência/descrição definitivas
      // (código por reconhecer) — não se envia ao servidor até estar completo.
      const eventos = (await idbGetAll('eventos')).filter(function (e) { return !e.synced && e.resuelto !== false; });
      const LOTE = 25;
      for (let i = 0; i < eventos.length; i += LOTE) {
        const lote = eventos.slice(i, i + LOTE).map(function (e) {
          return {
            id: e.id,
            captura_id: e.captura_id,
            codigo_barras: e.codigo_barras,
            referencia_resuelta: e.referencia_resuelta,
            descripcion_resuelta: e.descripcion_resuelta,
            codigo_conocido: !!e.codigo_conocido,
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

      // Associações código→referência decididas offline: ficam já a valer no aparelho
      // (guardarAsociacionLocal); isto só as leva ao servidor para ficarem partilhadas
      // com as outras pessoas/aparelhos. Se falhar, tentam-se de novo no próximo ciclo.
      const asociaciones = (await idbGetAll('asociaciones_locales')).filter(function (a) { return !a.sincronizado; });
      for (const a of asociaciones) {
        const { data, error } = await window.sbInventario.rpc('asociar_codigo_temporal', {
          p_token: S.token,
          p_inventario_id: a.inventario_id,
          p_codigo: a.codigo_barras,
          p_referencia: a.referencia,
          p_descripcion: a.descripcion,
          p_persona_id: a.persona_id
        });
        if (!error) {
          await idbPut('asociaciones_locales', Object.assign({}, a, { sincronizado: true }));
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
  async function registrarEscaneoLocal(codigoBarras, referencia, descripcion, codigoConocido, resuelto) {
    const dispId = await dispositivoId();
    const evento = {
      id: uuid(),
      captura_id: S.captura.id,
      codigo_barras: codigoBarras,
      referencia_resuelta: referencia || null,
      descripcion_resuelta: descripcion || null,
      codigo_conocido: !!codigoConocido,
      resuelto: !!resuelto,
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
    if (evento.resuelto) sincronizar();
    return evento;
  }

  // Atualiza uma leitura já guardada localmente (ex.: depois de resolver um código
  // que não estava reconhecido). O upsert por keyPath ('id') substitui o registo inteiro.
  async function resolverEscaneoLocal(eventoId, referencia, descripcion, codigoConocido) {
    const evento = await idbGet('eventos', eventoId);
    if (!evento) return;
    evento.referencia_resuelta = referencia || null;
    evento.descripcion_resuelta = descripcion || null;
    evento.codigo_conocido = !!codigoConocido;
    evento.resuelto = true;
    await idbPut('eventos', evento);
    sincronizar();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CÓDIGOS NÃO RECONHECIDOS — associação código→referência guardada
  //  primeiro no aparelho; a partilha com o servidor é sempre em segundo
  //  plano e nunca bloqueia quem está a contar.
  // ══════════════════════════════════════════════════════════════════════
  function claveAsociacionLocal(inventarioId, codigo) {
    return inventarioId + '|' + codigo;
  }

  async function buscarCodigoLocal(codigo) {
    return await idbGet('asociaciones_locales', claveAsociacionLocal(S.inventario.id, codigo));
  }

  async function guardarAsociacionLocal(codigo, referencia, descripcion) {
    const registro = {
      clave: claveAsociacionLocal(S.inventario.id, codigo),
      inventario_id: S.inventario.id,
      codigo_barras: codigo,
      referencia: referencia,
      descripcion: descripcion,
      persona_id: S.persona.id,
      sincronizado: false
    };
    await idbPut('asociaciones_locales', registro);
    sincronizar();
    return registro;
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
      #inv-root .inv-relatorios { display:flex; justify-content:center; gap:16px; width:100%;
        margin-top:16px; }
      #inv-root .inv-btn-redondo { width:64px; height:64px; border-radius:50%; padding:0;
        display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700;
        flex:0 0 auto; }
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
    render(
      '<h1>Inventário</h1>',
      '<h1>Seleciona a tua loja</h1><div class="inv-menu">' + botones + '</div>' +
      '<button id="inv-btn-lisboa" style="margin-top:24px;">LISBOA</button>'
    );

    root().querySelectorAll('.inv-menu button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.tienda = { id: b.dataset.id, nombre: b.dataset.nombre };
        pantallaRol();
      });
    });
    document.getElementById('inv-btn-lisboa').onclick = pedirClaveAdminRelatorios;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LISBOA — relatórios consolidados de todas as lojas, protegido por
  //  clave de administração (não passa pelo login de Pessoa 1/2).
  // ══════════════════════════════════════════════════════════════════════
  function pedirClaveAdminRelatorios() {
    const f = modal(
      '<h3>Clave de administração</h3>' +
      '<div style="position:relative;max-width:280px;margin:0 auto;">' +
      '<input type="password" id="inv-clave-lisboa" placeholder="Clave de administração" autofocus style="padding-right:40px;max-width:none;">' +
      '<button type="button" id="inv-clave-lisboa-olho" title="Mostrar/ocultar senha" ' +
      'style="position:absolute;right:4px;top:4px;padding:6px 10px;border-radius:8px;">👁</button>' +
      '</div>' +
      '<div id="inv-clave-lisboa-error" style="color:#c0392b;font-size:14px;margin-bottom:10px;"></div>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-clave-lisboa-ok">Entrar</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>' +
      '</div>'
    );
    const input = f.querySelector('#inv-clave-lisboa');
    const err = f.querySelector('#inv-clave-lisboa-error');
    f.querySelector('#inv-clave-lisboa-olho').onclick = function () {
      input.type = input.type === 'password' ? 'text' : 'password';
    };
    input.focus();
    async function confirmar() {
      const clave = input.value.trim();
      if (!clave) return;
      err.textContent = '';
      const { data, error } = await window.sbInventario.rpc('verificar_clave_admin', { p_token: S.token, p_clave: clave });
      if (error) { err.textContent = 'Não foi possível verificar. Verifica a tua ligação.'; return; }
      if (!data) { err.textContent = 'Clave incorreta.'; return; }
      f.remove();
      pantallaRelatoriosGlobal();
    }
    f.querySelector('#inv-clave-lisboa-ok').onclick = confirmar;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmar(); });
  }

  // Verificação de que o catálogo local (js/catalogo-datos.js) carregou corretamente.
  function infoCatalogoLocal() {
    const catalogo = window.WKZ_CATALOGO;
    if (!catalogo) {
      return '<p style="color:#c0392b;">⚠️ Catálogo local não carregado.</p>';
    }
    const codigos = Object.keys(catalogo);
    const referencias = new Set(codigos.map(function (c) { return catalogo[c][0]; }));
    return '<p style="color:#555;font-size:14px;">Catálogo local: ' +
      referencias.size.toLocaleString('pt-PT') + ' referências — ' +
      codigos.length.toLocaleString('pt-PT') + ' códigos de barras.</p>';
  }

  async function pantallaRelatoriosGlobal() {
    render('<h1>LISBOA</h1>', '<p>A carregar…</p>', pantallaTiendas);

    const { data: tiendas, error } = await window.sbInventario
      .from('tiendas').select('id,nombre').eq('activo', true).order('nombre');
    if (error) {
      render('<h1>LISBOA</h1>', '<p>Não foi possível carregar as lojas. Verifica a tua ligação.</p>', pantallaTiendas);
      return;
    }

    const estados = await Promise.all(tiendas.map(function (t) { return hayCierreCompletoTienda(t.id); }));
    const linhaEstilo = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #eee;';
    const filas = tiendas.map(function (t, i) {
      if (!estados[i]) {
        return '<div style="' + linhaEstilo + '"><span>' + escapeHtml(t.nombre) + '</span>' +
          '<span style="color:#888;font-size:14px;">sem encerramento definitivo</span></div>';
      }
      return '<div style="' + linhaEstilo + '"><span>' + escapeHtml(t.nombre) + '</span>' +
        '<div class="inv-relatorios" style="margin:0;">' +
        '<button class="inv-btn-redondo" data-tienda-id="' + t.id + '" data-tienda-nombre="' + escapeHtml(t.nombre) + '" data-formato="ean">EAN</button>' +
        '<button class="inv-btn-redondo" data-tienda-id="' + t.id + '" data-tienda-nombre="' + escapeHtml(t.nombre) + '" data-formato="ref">REF</button>' +
        '</div></div>';
    }).join('');

    render(
      '<h1>LISBOA</h1>',
      '<h1>Relatórios</h1>' +
      infoCatalogoLocal() +
      filas +
      '<div style="' + linhaEstilo + 'margin-top:16px;border-bottom:none;">' +
      '<span><strong>Todas as lojas de Porto Santo</strong></span>' +
      '<div class="inv-menu" style="margin:0;">' +
      '<button class="inv-primario" id="inv-btn-global-ean">EAN</button>' +
      '<button class="inv-primario" id="inv-btn-global-ref">REF</button>' +
      '</div></div>',
      pantallaTiendas
    );

    root().querySelectorAll('[data-tienda-id]').forEach(function (b) {
      b.onclick = function () { descargarConsolidadoDeTienda(b.dataset.tiendaId, b.dataset.tiendaNombre, b.dataset.formato); };
    });
    document.getElementById('inv-btn-global-ean').onclick = function () { descargarConsolidadoGlobal('ean'); };
    document.getElementById('inv-btn-global-ref').onclick = function () { descargarConsolidadoGlobal('ref'); };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ 2 — SELEÇÃO DE PESSOA (1 ou 2) + SENHA PESSOAL
  // ══════════════════════════════════════════════════════════════════════

  // Nome de quem foi a ÚLTIMA pessoa a assumir este papel nesta loja (qualquer zona) —
  // mesmo já liberada (inventário fechado), fica como referência de quem fez o trabalho,
  // até que outra pessoa entre e assuma o papel de novo. É só uma etiqueta de reconhecimento
  // visual; carregar a senha continua obrigatório para entrar.
  async function obtenerUltimoNombrePorRol(rol) {
    const { data, error } = await window.sbInventario
      .from('asignaciones')
      .select('persona:personas!asignaciones_persona_id_fkey(nombre)')
      .eq('tienda_id', S.tienda.id).eq('rol', rol)
      .order('asignado_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data || !data.persona) return '';
    return primerNombre(data.persona.nombre);
  }

  async function pantallaRol() {
    render('<h1>' + S.tienda.nombre + '</h1>', '<p>A carregar…</p>');

    const nombreP1 = await obtenerUltimoNombrePorRol('persona1');
    const nombreP2 = await obtenerUltimoNombrePorRol('persona2');

    render(
      '<h1>' + S.tienda.nombre + '</h1>',
      '<h1>Quem és tu?</h1>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-p1">' + (nombreP1 ? nombreP1 + ' (contagem)' : 'Pessoa 1 (contagem)') + '</button>' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-p2">' + (nombreP2 ? nombreP2 + ' (leitura)' : 'Pessoa 2 (leitura)') + '</button>' +
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
  // Estado de encerramento de uma zona (loja/armazém) desta loja — independente de já se
  // ter "entrado" nela nesta sessão. Usado para mostrar o botão de encerrar definitivamente
  // ao nível de "Loja ou Armazém?", sem precisar de abrir a lista de unidades.
  async function construirEstadoZona(zona) {
    const { data: inv, error } = await window.sbInventario
      .from('inventarios').select('*')
      .eq('tienda_id', S.tienda.id).eq('zona', zona).eq('estado', 'abierto')
      .maybeSingle();
    if (error || !inv) return null;

    const { data: unidades, error: eu } = await window.sbInventario
      .from('unidades').select('estado').eq('inventario_id', inv.id);
    if (eu) return null;

    const validadas = (unidades || []).filter(function (u) { return u.estado === 'validada'; }).length;
    // Uma zona fica "pronta" quando já foi declarada (unidades_esperadas não é null) e não
    // fica nenhuma por validar — incluindo o caso de ter sido declarada com 0 (nada a contar).
    const listo = inv.unidades_esperadas !== null && (unidades.length === 0 || validadas === unidades.length);

    return { inventario: inv, listo: listo };
  }

  // Verifica se já existe um encerramento definitivo de Loja E de Armazém para esta loja —
  // condição para mostrar os botões de download do relatório consolidado.
  async function hayCierreCompletoTienda(tiendaId) {
    const { data, error } = await window.sbInventario
      .from('inventarios').select('zona').eq('tienda_id', tiendaId).eq('estado', 'cerrado');
    if (error || !data) return false;
    const zonas = {};
    data.forEach(function (r) { zonas[r.zona] = true; });
    return !!(zonas.loja && zonas.armazem);
  }

  async function pantallaZona() {
    render('<h1>' + S.tienda.nombre + ' — ' + S.persona.nombre + '</h1>', '<p>A carregar…</p>');

    let cierreHtml = '';
    if (S.rol === 'persona2') {
      const estados = await Promise.all([construirEstadoZona('loja'), construirEstadoZona('armazem')]);
      const ambosListos = estados[0] && estados[0].listo && estados[1] && estados[1].listo;
      if (ambosListos) {
        cierreHtml = '<div style="width:100%;"><button class="inv-primario" id="inv-btn-cerrar-tienda" style="margin-top:10px;width:100%;">Encerrar inventário de ' + S.tienda.nombre + '</button></div>';
      }
    }

    let relatoriosHtml = '';
    const cierreCompleto = await hayCierreCompletoTienda(S.tienda.id);
    if (cierreCompleto) {
      relatoriosHtml = '<div class="inv-relatorios">' +
        '<button class="inv-btn-redondo" id="inv-btn-relatorio-ean">EAN</button>' +
        '<button class="inv-btn-redondo" id="inv-btn-relatorio-ref">REF</button>' +
        '</div>' +
        '<button id="inv-btn-reabrir-tienda" style="margin-top:12px;width:100%;">🔓 Reabrir para edição</button>';
    }

    render(
      '<h1>' + S.tienda.nombre + ' — ' + S.persona.nombre + '</h1>',
      '<h1>Loja ou Armazém?</h1>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-loja">Loja</button>' +
      '<button class="inv-primario inv-menu-btn" id="inv-btn-armazem">Armazém</button>' +
      '</div>' + cierreHtml + relatoriosHtml +
      '<button id="inv-btn-volver" style="margin-top:24px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-loja').onclick = function () { S.zona = 'loja'; entrarEnInventario(); };
    document.getElementById('inv-btn-armazem').onclick = function () { S.zona = 'armazem'; entrarEnInventario(); };
    document.getElementById('inv-btn-volver').onclick = pantallaRol;
    const btnCerrar = document.getElementById('inv-btn-cerrar-tienda');
    if (btnCerrar) btnCerrar.onclick = cerrarInventarioDeTienda;
    const btnEan = document.getElementById('inv-btn-relatorio-ean');
    if (btnEan) btnEan.onclick = function () { descargarConsolidado('ean'); };
    const btnRef = document.getElementById('inv-btn-relatorio-ref');
    if (btnRef) btnRef.onclick = function () { descargarConsolidado('ref'); };
    const btnReabrir = document.getElementById('inv-btn-reabrir-tienda');
    if (btnReabrir) btnReabrir.onclick = pedirClaveAdmin;
  }

  // Pede a clave de administração e, se correta, reabre o cierre mais recente de Loja +
  // Armazém desta loja para edição (adicionar/reiniciar unidades). Não altera nada do que
  // já foi validado até agora.
  function pedirClaveAdmin() {
    const f = modal(
      '<h3>Clave de administração</h3>' +
      '<div style="position:relative;max-width:280px;margin:0 auto;">' +
      '<input type="password" id="inv-clave-admin" placeholder="Clave de administração" autofocus style="padding-right:40px;max-width:none;">' +
      '<button type="button" id="inv-clave-admin-olho" title="Mostrar/ocultar senha" ' +
      'style="position:absolute;right:4px;top:4px;padding:6px 10px;border-radius:8px;">👁</button>' +
      '</div>' +
      '<div id="inv-clave-admin-error" style="color:#c0392b;font-size:14px;margin-bottom:10px;"></div>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-clave-admin-ok">Reabrir</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>' +
      '</div>'
    );
    const input = f.querySelector('#inv-clave-admin');
    const err = f.querySelector('#inv-clave-admin-error');
    f.querySelector('#inv-clave-admin-olho').onclick = function () {
      input.type = input.type === 'password' ? 'text' : 'password';
    };
    input.focus();
    async function confirmar() {
      const clave = input.value.trim();
      if (!clave) return;
      err.textContent = '';
      const { data, error } = await window.sbInventario.rpc('reabrir_inventario_tienda', {
        p_token: S.token, p_tienda_id: S.tienda.id, p_clave_admin: clave
      });
      if (error) { err.textContent = 'Não foi possível reabrir. Verifica a tua ligação.'; return; }
      const resultado = data && data[0];
      if (!resultado || !resultado.ok) {
        err.textContent = resultado ? resultado.motivo : 'Erro desconhecido.';
        return;
      }
      f.remove();
      alert('Inventário reaberto para edição.');
      pantallaZona();
    }
    f.querySelector('#inv-clave-admin-ok').onclick = confirmar;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmar(); });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ABRIR/REUTILIZAR O INVENTÁRIO (loja+zona) E ATRIBUIR A PESSOA
  // ══════════════════════════════════════════════════════════════════════
  async function entrarEnInventario() {
    render('<h1>' + S.tienda.nombre + '</h1>', '<p>A entrar…</p><p>A verificar disponibilidade…</p>');

    // Sair do ecrã NÃO liberta a atribuição (regra de negócio explícita). Por isso, antes de
    // tentar criar uma atribuição nova, vemos se esta pessoa já tem outras ativas. Uma pessoa
    // pode ter várias atribuições ativas em simultâneo DENTRO da mesma loja (ex.: Loja e
    // Armazém), mas nunca em lojas diferentes ao mesmo tempo — essa é a barreira real entre
    // lojas. Se for exatamente a mesma loja+zona+função, é uma RETOMA, não um conflito.
    const { data: activas, error: e0 } = await window.sbInventario
      .from('asignaciones').select('*').eq('persona_id', S.persona.id).eq('estado', 'activa');

    if (e0) { render('<h1>Erro</h1>', '<p>Não foi possível verificar atribuições anteriores. Verifica a tua ligação.</p>'); return; }

    const ativaOutraLoja = (activas || []).find(function (a) { return a.tienda_id !== S.tienda.id; });
    if (ativaOutraLoja) {
      render('<h1>Não disponível</h1>',
        '<p><strong>' + S.persona.nombre + '</strong> já tem uma atribuição ativa como ' +
        (ativaOutraLoja.rol === 'persona1' ? 'Pessoa 1' : 'Pessoa 2') + ' em ' + ativaOutraLoja.tienda_id + ' — ' + ZONA_LABEL[ativaOutraLoja.zona] + '.</p>' +
        '<p>Tem de ser encerrada corretamente antes de poder ser atribuída a outra loja.</p>' +
        '<button class="inv-primario" id="inv-btn-voltar-conflito">Voltar</button>');
      document.getElementById('inv-btn-voltar-conflito').onclick = pantallaZona;
      return;
    }

    const ativaAtual = (activas || []).find(function (a) { return a.zona === S.zona && a.rol === S.rol; });
    if (ativaAtual) {
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

    if (e1) {
      render('<h1>Erro</h1>', '<p>Não foi possível verificar o inventário. Verifica a tua ligação.</p>', pantallaZona);
      return;
    }

    if (!inv) {
      // Não há inventário aberto nesta loja/zona. Antes de criar um novo, vemos se já existe um
      // encerrado com a mesma etiqueta (mesmo ano) — nesse caso não é um erro, é que este
      // inventário já foi encerrado e só um/a administrador/a pode reabri-lo para edição.
      const etiqueta = S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + ' — ' + new Date().getFullYear();
      const { data: cerrado, error: eChk } = await window.sbInventario
        .from('inventarios').select('*')
        .eq('tienda_id', S.tienda.id).eq('zona', S.zona).eq('etiqueta', etiqueta)
        .maybeSingle();

      if (eChk) {
        render('<h1>Erro</h1>', '<p>Não foi possível verificar o inventário. Verifica a tua ligação.</p>', pantallaZona);
        return;
      }

      if (cerrado) {
        render('<h1>Inventário encerrado</h1>',
          '<p>O inventário de ' + ZONA_LABEL[S.zona] + ' de <strong>' + S.tienda.nombre + '</strong> já foi encerrado.</p>' +
          '<p>Pede a um/a administrador/a para o reabrir para edição.</p>',
          pantallaZona);
        return;
      }

      const { data: nuevo, error: e2 } = await window.sbInventario
        .from('inventarios')
        .insert({ tienda_id: S.tienda.id, zona: S.zona, etiqueta: etiqueta })
        .select().single();
      if (e2) {
        render('<h1>Erro</h1>', '<p>Não foi possível abrir o inventário.</p>', pantallaZona);
        return;
      }
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
  //  MODO SEM INTERNET — ativado por cada pessoa no seu próprio aparelho, com ligação,
  //  antes de ir para uma zona sem sinal (ex.: Armazém). Só muda a REVELAÇÃO da lista
  //  (mostra todos os grupos já declarados de uma vez); a proteção de fundo (guardar
  //  primeiro no aparelho, sincronizar depois) está sempre ativa, com ou sem este modo.
  // ══════════════════════════════════════════════════════════════════════
  function claveModoOffline(inventarioId) {
    return 'modo_sin_internet_' + inventarioId;
  }

  async function estaModoSinInternetActivo(inventarioId) {
    const registro = await idbGet('meta', claveModoOffline(inventarioId));
    return !!(registro && registro.activo);
  }

  async function definirModoSinInternet(inventarioId, activo) {
    await idbPut('meta', { clave: claveModoOffline(inventarioId), activo: activo });
  }

  // Verifica, neste aparelho, se alguma das duas zonas desta loja ainda tem o modo sem
  // Internet ativo — usado para bloquear o encerramento definitivo até ser desativado.
  async function hayModoSinInternetActivoEnTienda(tiendaId) {
    for (const zona of ['loja', 'armazem']) {
      const { data: inv } = await window.sbInventario
        .from('inventarios').select('id').eq('tienda_id', tiendaId).eq('zona', zona)
        .order('creado_at', { ascending: false }).limit(1).maybeSingle();
      if (inv && await estaModoSinInternetActivo(inv.id)) return true;
    }
    return false;
  }

  function claveCacheUnidades(inventarioId) {
    return 'unidades_cache_' + inventarioId;
  }

  async function guardarCacheUnidades(inventarioId, unidades) {
    await idbPut('meta', { clave: claveCacheUnidades(inventarioId), unidades: unidades, guardado_at: new Date().toISOString() });
  }

  async function obtenerCacheUnidades(inventarioId) {
    const registro = await idbGet('meta', claveCacheUnidades(inventarioId));
    return registro ? registro.unidades : null;
  }

  // Sobrepõe, por cima dos dados do servidor (ou da cópia guardada), as contagens/leituras
  // feitas neste aparelho que ainda não foram confirmadas pelo servidor — para que apareçam
  // na lista de imediato, sem esperar pela sincronização.
  async function fusionarIntentosLocales(unidades) {
    const idsUnidad = new Set(unidades.map(function (u) { return u.id; }));
    const pendientes = (await idbGetAll('intentos_locales')).filter(function (it) {
      return !it.synced && idsUnidad.has(it.unidad_id);
    });
    if (!pendientes.length) return unidades;

    const porUnidad = {};
    pendientes.forEach(function (it) {
      (porUnidad[it.unidad_id] = porUnidad[it.unidad_id] || []).push(it);
    });

    return unidades.map(function (u) {
      const propios = porUnidad[u.id];
      if (!propios || !propios.length) return u;
      const intentosCombinados = (u.intentos || []).slice();
      propios.forEach(function (local) {
        const idx = intentosCombinados.findIndex(function (srv) { return srv.id === local.id; });
        if (idx >= 0) intentosCombinados[idx] = local; else intentosCombinados.push(local);
      });
      return Object.assign({}, u, { intentos: intentosCombinados });
    });
  }

  // Próximo número de tentativa para uma unidade, olhando tanto para a última cópia
  // guardada do servidor como para as tentativas ainda só guardadas neste aparelho —
  // funciona sem rede nenhuma.
  async function siguienteNumeroIntento(inventarioId, unidadId) {
    let maxNum = 0;
    const cache = await obtenerCacheUnidades(inventarioId);
    if (cache) {
      const u = cache.find(function (x) { return x.id === unidadId; });
      if (u && u.intentos) {
        u.intentos.forEach(function (it) { if (it.numero_intento > maxNum) maxNum = it.numero_intento; });
      }
    }
    const locales = await idbGetAllByIndex('intentos_locales', 'unidad_id', unidadId);
    locales.forEach(function (it) { if (it.numero_intento > maxNum) maxNum = it.numero_intento; });
    return maxNum + 1;
  }

  // Último intento de uma unidade, olhando para a cópia guardada do servidor e para as
  // tentativas só guardadas neste aparelho — funciona sem rede nenhuma.
  async function obtenerUltimoIntentoLocalOCache(unidadId) {
    let candidatos = [];
    const cache = await obtenerCacheUnidades(S.inventario.id);
    if (cache) {
      const u = cache.find(function (x) { return x.id === unidadId; });
      if (u && u.intentos) candidatos = candidatos.concat(u.intentos);
    }
    const locales = await idbGetAllByIndex('intentos_locales', 'unidad_id', unidadId);
    locales.forEach(function (local) {
      const idx = candidatos.findIndex(function (c) { return c.id === local.id; });
      if (idx >= 0) candidatos[idx] = local; else candidatos.push(local);
    });
    candidatos.sort(function (a, b) { return b.numero_intento - a.numero_intento; });
    return candidatos[0] || null;
  }

  // Tenta sempre primeiro no servidor (mais atual); sem rede, cai para a cópia local —
  // nunca fica bloqueado só por falta de sinal.
  async function obtenerUltimoIntentoParaUnidad(unidadId) {
    if (await estaModoSinInternetActivo(S.inventario.id)) {
      return await obtenerUltimoIntentoLocalOCache(unidadId);
    }
    try {
      const { data, error } = await conTimeout(window.sbInventario.from('intentos')
        .select('*').eq('unidad_id', unidadId).order('numero_intento', { ascending: false }).limit(1).maybeSingle());
      if (error) throw error;
      if (data) return data;
    } catch (e) {
      // sem rede, pedido demorado ou falha do servidor: cai para a cópia local.
    }
    return await obtenerUltimoIntentoLocalOCache(unidadId);
  }

  function pedirPrepararSinInternet() {
    const mensagem = S.rol === 'persona1'
      ? '<p>A partir de agora vais ver todos os ' + UNIDAD_LABEL_PLURAL[S.zona] + ' já declarados de uma vez, em vez de um de cada vez.</p>' +
        '<p>Continua a contar e a encerrar cada um normalmente. O código de cada um aparecerá diretamente na lista, ao lado de "Encerrado" — não precisas de entrar para o ver.</p>'
      : '<p>A partir de agora vais ver todos os ' + UNIDAD_LABEL_PLURAL[S.zona] + ' já declarados de uma vez.</p>' +
        '<p>Para cada um marcado como "Encerrado", usa o código que aparece ao lado dele para começares a ler — não é preciso esperar que o sistema o faça sozinho.</p>';
    const f = modal(
      '<h3>Preparar para trabalhar sem Internet</h3>' +
      mensagem +
      '<p>Isto guarda agora, neste aparelho, uma cópia de tudo o que já existe, para que a lista continue a funcionar mesmo sem sinal.</p>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-preparar-offline-ok">Ativar</button>' +
      '<button onclick="window._invCerrarModal(this)">Cancelar</button>' +
      '</div>'
    );
    f.querySelector('#inv-preparar-offline-ok').onclick = async function () {
      await definirModoSinInternet(S.inventario.id, true);
      f.remove();
      pantallaUnidades();
    };
  }

  function pedirDesativarSinInternet() {
    if (!confirm('Desativar o modo sem Internet nesta zona?')) return;
    definirModoSinInternet(S.inventario.id, false).then(pantallaUnidades);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ECRÃ 4 — LISTA DE UNIDADES (Expositores / Grupos)
  // ══════════════════════════════════════════════════════════════════════
  async function construirEstadoUnidades() {
    let unidades = null;
    let nomeP2Inventario = '';

    // Com o modo sem Internet ativo, a pessoa já disse explicitamente que não há rede —
    // vai-se direto à cópia local, sem tentar sequer o servidor (resposta imediata, nunca
    // pendurado à espera de um pedido que não vai chegar a lado nenhum).
    const modoSinInternet = await estaModoSinInternetActivo(S.inventario.id);

    if (modoSinInternet) {
      unidades = await obtenerCacheUnidades(S.inventario.id);
      if (!unidades) return null;
    } else {
      try {
        const { data, error } = await conTimeout(window.sbInventario
          .from('unidades').select('*, intentos(*)')
          .eq('inventario_id', S.inventario.id).order('numero'));
        if (error) throw error;
        unidades = data;

        // Nome de quem tem o papel de Pessoa 2 atribuído a este inventário agora — só um
        // detalhe cosmético; se falhar, a lista continua a funcionar sem ele.
        const { data: asigP2Lista } = await conTimeout(window.sbInventario.from('asignaciones')
          .select('persona:personas!asignaciones_persona_id_fkey(nombre)')
          .eq('inventario_id', S.inventario.id).eq('rol', 'persona2').eq('estado', 'activa').maybeSingle());
        nomeP2Inventario = (asigP2Lista && asigP2Lista.persona) ? primerNombre(asigP2Lista.persona.nombre) : '';

        await guardarCacheUnidades(S.inventario.id, unidades);
      } catch (e) {
        // Sem rede (ou o pedido demorou demasiado): usa a última cópia guardada neste
        // aparelho. A lista nunca fica bloqueada só porque não há sinal.
        unidades = await obtenerCacheUnidades(S.inventario.id);
        if (!unidades) return null;
      }
    }

    unidades = await fusionarIntentosLocales(unidades);

    const label = UNIDAD_LABEL[S.zona];
    const validadas = unidades.filter(function (u) { return u.estado === 'validada'; }).length;

    // Revelação progressiva (só com o modo sem Internet desativado): uma unidade "por
    // começar" só aparece depois de a anterior já ter sido iniciada. Com o modo ativo,
    // aparecem todas as declaradas de uma vez, como pedido.
    let unidadesVisibles = unidades;
    if (!modoSinInternet) {
      const numerosIniciados = unidades
        .filter(function (u) { return (u.intentos && u.intentos.length) || u.estado === 'validada'; })
        .map(function (u) { return u.numero; });
      const limiteVisible = (numerosIniciados.length ? Math.max.apply(null, numerosIniciados) : 0) + 1;
      unidadesVisibles = unidades.filter(function (u) { return u.numero <= limiteVisible; });
    }

    const filasArr = await Promise.all(unidadesVisibles.map(async function (u) {
      const ultimoIntento = (u.intentos || []).sort(function (a, b) {
        return b.numero_intento - a.numero_intento;
      })[0];
      let estadoTxt = 'Pendente';
      let accion = '';
      let codigoInline = '';
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
        // Código à mão na própria lista, sem ter de entrar em "Ver códigos" — pedido
        // explícito para trabalhar sem Internet, mas útil sempre.
        const codigo = await codigoIndice(S.tienda.id, S.inventario.id, u.id, ultimoIntento.numero_intento, 1);
        codigoInline = ' <strong class="inv-codigo-lista">(' + codigo + ')</strong>';
      }
      if (S.rol === 'persona2' && ultimoIntento && (ultimoIntento.estado === 'autorizado' || ultimoIntento.estado === 'escaneando')) {
        accion = '<button class="inv-primario" data-accion="escanear" data-id="' + u.id + '" data-numero="' + u.numero + '">' +
          (ultimoIntento.estado === 'escaneando' ? 'Continuar' : 'Começar leitura') + '</button>';
      }
      return '<div class="inv-lista-item"><span>' + label + ' ' + u.numero + ' — ' + estadoTxt + codigoInline + '</span>' + accion + '</div>';
    }));
    let filas = filasArr.join('');

    if (!filas) filas = '<p>Ainda não há ' + UNIDAD_LABEL_PLURAL[S.zona] + ' criados.</p>';

    // Depende exclusivamente de a Pessoa 1 já ter contado e encerrado cada unidade (existe
    // pelo menos uma tentativa registada) — independentemente de a Pessoa 2 já ter validado
    // essa contagem ou de ter havido divergência entretanto. Uma lista vazia (0 declarados)
    // conta como "todas contadas" — não há nenhuma pendente.
    const todasContadasPorP1 = unidades.every(function (u) {
      return u.intentos && u.intentos.length > 0;
    });

    return {
      unidades: unidades, filas: filas, validadas: validadas, label: label,
      todasContadasPorP1: todasContadasPorP1, modoSinInternet: modoSinInternet
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

  // Ecrã de declaração inicial — só aparece uma vez, quando ainda não há nenhum expositor
  // criado neste inventário. Depois disto, para adicionar mais usa-se "+ Adicionar", sem
  // voltar a passar por aqui.
  function pantallaDeclararNumero() {
    const label = UNIDAD_LABEL[S.zona].toLowerCase();
    const labelPlural = UNIDAD_LABEL_PLURAL[S.zona];
    render(
      '<h1>' + S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + '</h1>',
      '<h1>Quantos ' + labelPlural + ' há?</h1>' +
      '<p>Declara agora o número total de ' + labelPlural + ' que existem nesta zona.</p>' +
      '<p>Depois de os teres contado e encerrado todos, o botão <strong>+ Adicionar</strong> aparece automaticamente para acrescentares mais, um a um — sem teres de voltar a declarar nada.</p>' +
      '<p><strong>Em caso de teres declarado um número incorreto:</strong> conta e encerra os que já existem; assim que estiverem todos contados, usa <strong>+ Adicionar</strong> para completar os que faltam.</p>' +
      '<p><strong>Em caso de aparecer um ' + label + ' novo</strong> que não foi contado na declaração inicial: adiciona-o da mesma forma, através de <strong>+ Adicionar</strong>, quando os restantes já estiverem todos contados.</p>' +
      '<input type="number" id="inv-numero-declarado" placeholder="Número de ' + labelPlural + '" min="0" max="500">' +
      '<button class="inv-primario" id="inv-btn-declarar" style="margin-top:16px;width:100%;">Declarar</button>',
      pantallaZona
    );
    document.getElementById('inv-btn-declarar').onclick = declararNumeroExpositores;
  }

  async function declararNumeroExpositores() {
    const input = document.getElementById('inv-numero-declarado');
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 0 || n > 500) { alert('Introduz um número válido (0 ou mais, até 500).'); return; }

    if (n === 0) {
      // Declarar 0 é uma afirmação forte ("não há nada aqui") — merece um aviso explícito
      // antes de gravar, com opção de voltar atrás e escrever de novo.
      const f = modal(
        '<h3>Atenção</h3>' +
        '<p>Vais declarar que não há nenhum ' + UNIDAD_LABEL[S.zona].toLowerCase() + ' nesta zona.</p>' +
        '<div class="inv-menu">' +
        '<button class="inv-primario" id="inv-declarar-cero-confirmar">Confirmar</button>' +
        '<button id="inv-declarar-cero-refazer">Refazer</button>' +
        '</div>'
      );
      f.querySelector('#inv-declarar-cero-confirmar').onclick = function () { f.remove(); guardarDeclaracao(0); };
      f.querySelector('#inv-declarar-cero-refazer').onclick = function () {
        f.remove();
        input.value = '';
        input.focus();
      };
      return;
    }

    await guardarDeclaracao(n);
  }

  async function guardarDeclaracao(n) {
    if (n > 0) {
      const filas = [];
      for (let i = 1; i <= n; i++) filas.push({ inventario_id: S.inventario.id, numero: i });

      const { error } = await window.sbInventario.from('unidades').insert(filas);
      if (error) {
        alert(esConflictoDuplicado(error) ? 'Já foram declarados entretanto. A atualizar a lista…' : 'Não foi possível declarar. Verifica a tua ligação e tenta novamente.');
        pantallaUnidades();
        return;
      }
    }

    const { error: eUpd } = await window.sbInventario.from('inventarios').update({ unidades_esperadas: n }).eq('id', S.inventario.id);
    if (eUpd) { alert('Não foi possível declarar. Verifica a tua ligação e tenta novamente.'); return; }
    S.inventario.unidades_esperadas = n;

    pantallaUnidades();
  }

  async function pantallaUnidades() {
    const estado = await construirEstadoUnidades();
    if (!estado) { render('<h1>Erro</h1>', '<p>Não foi possível carregar a lista de unidades.</p>', pantallaZona); return; }

    if (S.rol === 'persona1' && S.inventario.unidades_esperadas === null) {
      pantallaDeclararNumero();
      return;
    }

    // Só reaparece quando a Pessoa 1 já contou e encerrou TODOS os expositores atuais — não é
    // preciso voltar a declarar nada para adicionar mais a partir daí.
    const nuevaUnidadHtml = (S.rol === 'persona1' && estado.todasContadasPorP1)
      ? '<button class="inv-primario" id="inv-btn-agregar-unidad" style="margin-top:20px;width:100%;">+ Adicionar ' + estado.label.toLowerCase() + '</button>'
      : '';

    const modoHtml = estado.modoSinInternet
      ? '<div style="background:#fff4e0;color:#a15c00;padding:10px;border-radius:8px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
        '<span>🔌 Modo sem Internet ativo</span>' +
        '<button id="inv-btn-desativar-offline">Desativar</button></div>'
      : '<button id="inv-btn-preparar-offline" style="margin-top:16px;width:100%;">📴 Preparar para trabalhar sem Internet</button>';

    render(
      '<h1>' + S.tienda.nombre + ' — ' + ZONA_LABEL[S.zona] + '</h1>',
      '<p>' + estado.validadas + ' / ' + estado.unidades.length + ' validados — ' + S.persona.nombre + ' (' + (S.rol === 'persona1' ? 'Pessoa 1' : 'Pessoa 2') + ')</p>' +
      '<div style="width:100%;" id="inv-lista-unidades">' + estado.filas + '</div>' + nuevaUnidadHtml + modoHtml +
      '<button id="inv-btn-salir" style="margin-top:24px;">Sair deste ecrã (não encerra a tua atribuição)</button>',
      pantallaZona
    );

    vincularAccionesUnidades();
    const btnAgregar = document.getElementById('inv-btn-agregar-unidad');
    if (btnAgregar) btnAgregar.onclick = agregarUnidad;
    const btnPreparar = document.getElementById('inv-btn-preparar-offline');
    if (btnPreparar) btnPreparar.onclick = pedirPrepararSinInternet;
    const btnDesativar = document.getElementById('inv-btn-desativar-offline');
    if (btnDesativar) btnDesativar.onclick = pedirDesativarSinInternet;
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
          codigo_conocido: true,
          cantidad: 0
        });
      }
      const g = mapa.get(key);
      if (!e.codigo_conocido) g.codigo_conocido = false;
      g.cantidad++;
    });
    // Códigos sem catálogo sempre primeiro (nunca por acaso), depois por quantidade.
    return Array.from(mapa.values()).sort(function (a, b) {
      if (a.codigo_conocido !== b.codigo_conocido) return a.codigo_conocido ? 1 : -1;
      return b.cantidad - a.cantidad;
    });
  }

  function filaResumoCodigo(g) {
    return '<div class="inv-historial-item">' +
      '<span class="inv-historial-codigo">' + escapeHtml(g.codigo_barras) + '</span>' +
      '<span class="inv-historial-ref">' + escapeHtml(g.referencia_resuelta || '—') + '</span>' +
      '<span class="inv-historial-desc">' + escapeHtml(g.descripcion_resuelta || '—') + '</span>' +
      '<span class="inv-historial-qty">' + g.cantidad + '</span>' +
      '</div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  RELATÓRIO CONSOLIDADO DA LOJA (Loja + Armazém, depois de ambos fechados)
  // ══════════════════════════════════════════════════════════════════════

  // Mesma lógica de obterEscaneosDeUnidad, mas para TODAS as unidades de um inventário
  // de uma só vez (usado para consolidar um inventário inteiro, não só uma unidade).
  async function obtenerEscaneosDeInventario(inventarioId) {
    const { data: unidades, error } = await window.sbInventario
      .from('unidades').select('id, intentos(id, numero_intento)').eq('inventario_id', inventarioId);
    if (error || !unidades || !unidades.length) return [];

    const intentoIds = unidades.map(function (u) {
      const intentos = (u.intentos || []).slice().sort(function (a, b) { return b.numero_intento - a.numero_intento; });
      return intentos.length ? intentos[0].id : null;
    }).filter(function (id) { return id; });
    if (!intentoIds.length) return [];

    const { data: capturas } = await window.sbInventario.from('capturas')
      .select('id').in('intento_id', intentoIds).eq('estado', 'cerrada');
    const capturaIds = (capturas || []).map(function (c) { return c.id; });
    if (!capturaIds.length) return [];

    const { data: escaneos } = await window.sbInventario.from('escaneos')
      .select('*').in('captura_id', capturaIds);
    if (!escaneos || !escaneos.length) return [];

    const { data: anulaciones } = await window.sbInventario.from('anulaciones')
      .select('escaneo_id').in('escaneo_id', escaneos.map(function (e) { return e.id; }));
    const anuladosSet = new Set((anulaciones || []).map(function (a) { return a.escaneo_id; }));
    return escaneos.filter(function (e) { return !anuladosSet.has(e.id); });
  }

  // Devolve os escaneos (sem anuladas) de Loja+Armazém do encerramento MAIS RECENTE de
  // uma loja, ou null se ainda não há um encerramento definitivo de ambas as zonas.
  async function obtenerEscaneosCerradosDeTienda(tiendaId) {
    const completo = await hayCierreCompletoTienda(tiendaId);
    if (!completo) return null;

    const { data: invLoja } = await window.sbInventario
      .from('inventarios').select('id').eq('tienda_id', tiendaId).eq('zona', 'loja').eq('estado', 'cerrado')
      .order('cerrado_at', { ascending: false }).limit(1).maybeSingle();
    const { data: invArmazem } = await window.sbInventario
      .from('inventarios').select('id').eq('tienda_id', tiendaId).eq('zona', 'armazem').eq('estado', 'cerrado')
      .order('cerrado_at', { ascending: false }).limit(1).maybeSingle();
    if (!invLoja || !invArmazem) return null;

    const escaneosLoja = await obtenerEscaneosDeInventario(invLoja.id);
    const escaneosArmazem = await obtenerEscaneosDeInventario(invArmazem.id);
    return escaneosLoja.concat(escaneosArmazem);
  }

  // Devolve o consolidado da loja (Loja + Armazém) — usa o cierre MAIS RECENTE de cada
  // zona. Devolve null se ainda não há um cierre de ambas as zonas.
  async function obtenerConsolidadoTienda(tiendaId) {
    const escaneos = await obtenerEscaneosCerradosDeTienda(tiendaId);
    return escaneos ? agruparPorCodigo(escaneos) : null;
  }

  // Consolidado de TODAS as lojas ativas com encerramento definitivo, junto num só grupo
  // por código (sem distinção de loja) — as quantidades de códigos repetidos entre lojas
  // somam-se automaticamente, porque agruparPorCodigo() agrupa pelo código de barras.
  async function obtenerConsolidadoGlobal() {
    const { data: tiendas, error } = await window.sbInventario.from('tiendas').select('id').eq('activo', true);
    if (error) throw error;
    let todosEscaneos = [];
    for (const t of (tiendas || [])) {
      const escaneos = await obtenerEscaneosCerradosDeTienda(t.id);
      if (escaneos) todosEscaneos = todosEscaneos.concat(escaneos);
    }
    return agruparPorCodigo(todosEscaneos);
  }

  // Constrói e transfere o ficheiro .xlsx a partir de grupos já consolidados
  // (obtenerConsolidadoTienda / obtenerConsolidadoGlobal).
  async function exportarGruposExcel(grupos, nomeBase, formato) {
    if (!grupos.length) { alert('Não há leituras registadas para consolidar.'); return; }

    try {
      await cargarSheetJS();
    } catch (e) {
      alert('Não foi possível carregar a biblioteca de Excel. Verifica a tua ligação e tenta novamente.');
      return;
    }

    const AVISO_SEM_CATALOGO = 'SEM CATÁLOGO — criar referência ou associar este código EAN';

    let filas, nomeFolha;
    if (formato === 'ean') {
      filas = [['Código de Barras', 'Nº de Peças', 'Aviso']].concat(
        grupos.map(function (g) { return [g.codigo_barras, g.cantidad, g.codigo_conocido ? '' : AVISO_SEM_CATALOGO]; })
      );
      nomeFolha = 'EAN';
    } else {
      filas = [['Referência', 'Código de Barras', 'Descrição', 'Nº de Peças', 'Aviso']].concat(
        grupos.map(function (g) { return [g.referencia_resuelta || '', g.codigo_barras, g.descripcion_resuelta || '', g.cantidad, g.codigo_conocido ? '' : AVISO_SEM_CATALOGO]; })
      );
      nomeFolha = 'REF';
    }

    const ws = window.XLSX.utils.aoa_to_sheet(filas);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, nomeFolha);
    const nomeArquivo = (nomeBase || 'loja').replace(/[^a-z0-9]+/gi, '_') + '_' + nomeFolha + '.xlsx';
    window.XLSX.writeFile(wb, nomeArquivo);
  }

  async function descargarConsolidado(formato) {
    let grupos;
    try {
      grupos = await obtenerConsolidadoTienda(S.tienda.id);
    } catch (e) {
      alert('Não foi possível obter os dados. Verifica a tua ligação.');
      return;
    }
    if (!grupos) { alert('Ainda não há um encerramento definitivo de Loja e Armazém para consolidar.'); return; }
    await exportarGruposExcel(grupos, S.tienda.nombre, formato);
  }

  async function descargarConsolidadoDeTienda(tiendaId, tiendaNombre, formato) {
    let grupos;
    try {
      grupos = await obtenerConsolidadoTienda(tiendaId);
    } catch (e) {
      alert('Não foi possível obter os dados. Verifica a tua ligação.');
      return;
    }
    if (!grupos) { alert('Ainda não há um encerramento definitivo de Loja e Armazém para consolidar.'); return; }
    await exportarGruposExcel(grupos, tiendaNombre, formato);
  }

  async function descargarConsolidadoGlobal(formato) {
    let grupos;
    try {
      grupos = await obtenerConsolidadoGlobal();
    } catch (e) {
      alert('Não foi possível obter os dados. Verifica a tua ligação.');
      return;
    }
    await exportarGruposExcel(grupos, 'Porto_Santo', formato);
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

  // Cria diretamente o próximo expositor/grupo — sem declarar um total antecipado.
  // Cada clique corresponde a uma unidade física que existe agora, e mais nenhuma.
  async function agregarUnidad() {
    const { data: ultimas, error: e0 } = await window.sbInventario
      .from('unidades').select('numero').eq('inventario_id', S.inventario.id)
      .order('numero', { ascending: false }).limit(1);
    if (e0) { alert('Não foi possível adicionar. Verifica a tua ligação.'); return; }
    const siguiente = (ultimas && ultimas.length ? ultimas[0].numero : 0) + 1;

    const { error: e1 } = await window.sbInventario.from('unidades')
      .insert({ inventario_id: S.inventario.id, numero: siguiente });
    if (e1) {
      alert(esConflictoDuplicado(e1) ? 'Já foi adicionada entretanto. A atualizar a lista…' : 'Não foi possível adicionar. Verifica a tua ligação.');
      pantallaUnidades();
      return;
    }

    // Mantém a coluna coerente para referência/auditoria — não é usada para bloquear nada.
    await window.sbInventario.from('inventarios').update({ unidades_esperadas: siguiente }).eq('id', S.inventario.id);
    S.inventario.unidades_esperadas = siguiente;

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
    document.getElementById('inv-btn-cerrar-conteo').onclick = abrirConfirmacaoConteo;
  }

  // Antes de gravar, pede confirmação explícita do número — e permite voltar atrás com o
  // campo vazio em vez de gravar logo. O número em si nunca mais volta a aparecer depois disto.
  function abrirConfirmacaoConteo() {
    const conteo = parseInt(document.getElementById('inv-conteo-fisico').value, 10);
    if (!conteo && conteo !== 0) { alert('Introduz um número válido.'); return; }
    const f = modal(
      '<h3>Confirmar contagem</h3>' +
      '<p>Vais declarar <strong>' + conteo + '</strong> peças.</p>' +
      '<div class="inv-menu">' +
      '<button class="inv-primario" id="inv-conteo-confirmar">Confirmar</button>' +
      '<button id="inv-conteo-rehacer">Refazer</button>' +
      '</div>'
    );
    f.querySelector('#inv-conteo-confirmar').onclick = function () { f.remove(); cerrarConteo(conteo); };
    f.querySelector('#inv-conteo-rehacer').onclick = function () {
      f.remove();
      const input = document.getElementById('inv-conteo-fisico');
      if (input) { input.value = ''; input.focus(); }
    };
  }

  async function cerrarConteo(conteo) {
    const numeroIntento = await siguienteNumeroIntento(S.inventario.id, S.unidad.id);
    const intento = {
      id: uuid(), unidad_id: S.unidad.id, numero_intento: numeroIntento, persona1_id: S.persona.id,
      conteo_fisico: conteo, cerrado_at: new Date().toISOString(), estado: 'autorizado', synced: false
    };
    try {
      await idbPut('intentos_locales', intento);
    } catch (e) {
      mostrarModalIntegridad('Não foi possível guardar a contagem localmente. Não continues até resolver isto.');
      throw e;
    }
    sincronizar();

    // Detalhe informativo (não crítico): se falhar por falta de rede, sincroniza-se sozinho
    // mais tarde através da cópia guardada acima.
    if (navigator.onLine) {
      window.sbInventario.from('unidades').update({ estado: 'en_proceso' }).eq('id', S.unidad.id).then(function () {}, function () {});
    }

    intento.persona1_nombre = S.persona.nombre;
    S.intento = intento;
    mostrarCodigos(1);
  }

  // Refazer uma contagem já declarada — só é permitido enquanto a Pessoa 2 ainda não
  // começou a leitura (estado 'autorizado'). Cria uma tentativa nova e independente da
  // primeira declaração; a anterior fica registada no histórico, nada é apagado.
  async function refazerConteo() {
    if (!confirm('Refazer a contagem desta unidade? A declaração anterior fica substituída.')) return;
    const ultimo = await obtenerUltimoIntentoLocalOCache(S.unidad.id);
    if (!ultimo || ultimo.estado !== 'autorizado') {
      alert('Já não é possível refazer: a Pessoa 2 já começou a leitura desta unidade.');
      pantallaUnidades();
      return;
    }
    iniciarConteo(S.unidad.id, S.unidad.numero);
  }

  async function verCodigosDeNuevo(unidadId, numero, intentoId) {
    let intento = null;
    if (!(await estaModoSinInternetActivo(S.inventario.id))) {
      try {
        const { data, error } = await conTimeout(window.sbInventario.from('intentos')
          .select('*, persona1:personas!intentos_persona1_id_fkey(nombre)')
          .eq('id', intentoId).maybeSingle());
        if (error) throw error;
        if (data) {
          data.persona1_nombre = data.persona1 ? data.persona1.nombre : '';
          intento = data;
        }
      } catch (e) {
        // sem rede, pedido demorado ou falha do servidor: cai para a cópia local, abaixo.
      }
    }
    if (!intento) intento = await obtenerUltimoIntentoLocalOCache(unidadId);
    if (!intento) { alert('Não foi possível recuperar esta tentativa.'); return; }
    S.unidad = { id: unidadId, numero: numero };
    S.intento = intento;
    mostrarCodigos(1);
  }

  async function mostrarCodigos(indice) {
    const codigo = await codigoIndice(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, indice);
    const nomeP1 = S.intento.persona1_nombre ? primerNombre(S.intento.persona1_nombre) : '';
    // Só pode refazer enquanto a Pessoa 2 ainda não reclamou esta tentativa.
    const podeRefazer = S.intento.estado === 'autorizado';
    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + S.unidad.numero + ' — encerrado</h1>',
      (nomeP1 ? '<p>Registado por <strong>' + nomeP1 + '</strong></p>' : '') +
      '<div style="font-size:40px;letter-spacing:4px;margin:16px 0;font-weight:300;">' + codigo + '</div>' +
      '<button id="inv-btn-mas-codigos">Gerar outro código</button>' +
      '<button class="inv-primario" id="inv-btn-siguiente-unidad" style="margin-top:16px;">Ir para a próxima unidade</button>' +
      (podeRefazer ? '<button id="inv-btn-refazer" style="margin-top:10px;">Refazer contagem</button>' : '') +
      '<button id="inv-btn-volver-codigos" style="margin-top:10px;">← Voltar</button>'
    );
    document.getElementById('inv-btn-mas-codigos').onclick = function () { mostrarCodigos(indice + 1); };
    document.getElementById('inv-btn-siguiente-unidad').onclick = pantallaUnidades;
    document.getElementById('inv-btn-volver-codigos').onclick = pantallaUnidades;
    const btnRefazer = document.getElementById('inv-btn-refazer');
    if (btnRefazer) btnRefazer.onclick = refazerConteo;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PESSOA 2 — INTRODUZIR CÓDIGO E LER
  // ══════════════════════════════════════════════════════════════════════
  async function iniciarAutorizacionEscaneo(unidadId, numero) {
    S.unidad = { id: unidadId, numero: numero };

    const intento = await obtenerUltimoIntentoParaUnidad(unidadId);
    if (!intento) { render('<h1>Erro</h1>', '<p>Não foi possível carregar esta unidade.</p>', pantallaUnidades); return; }
    S.intento = intento;

    const modoSinInternet = await estaModoSinInternetActivo(S.inventario.id);

    if (intento.estado === 'escaneando' && intento.persona2_id === S.persona.id) {
      // Retoma após uma atualização de página: recuperar a captura ativa (servidor, e se não
      // houver rede, a cópia guardada neste aparelho), nunca criar outra às cegas.
      let captura = null;
      if (!modoSinInternet) {
        try {
          const { data: capturas, error } = await conTimeout(window.sbInventario.from('capturas')
            .select('*').eq('intento_id', intento.id).eq('estado', 'activa').limit(1));
          if (error) throw error;
          if (capturas && capturas.length) captura = capturas[0];
        } catch (e) {
          // sem rede, pedido demorado ou falha: procura abaixo na cópia local.
        }
      }
      if (!captura) {
        const locales = await idbGetAllByIndex('capturas_locales', 'intento_id', intento.id);
        captura = locales.find(function (c) { return c.estado === 'activa'; }) || null;
      }
      if (captura) {
        S.captura = captura;
        await guardarPuntero();
        pantallaEscaneo();
        return;
      }
    }

    // Com rede real, o servidor já garante a entrega correta (estado 'autorizado' = Pessoa 1
    // fechou mesmo esta unidade) — o código de autorização só é necessário como alternativa.
    // Com o modo sem Internet ativo, ou se o servidor não confirma a tempo, usa-se sempre o
    // código manual (abaixo), sem ficar à espera de uma ligação que pode nem existir.
    if (!modoSinInternet && navigator.onLine && intento.estado === 'autorizado') {
      render('<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>', '<p>A iniciar leitura…</p>');
      let resultado = null;
      try {
        resultado = await conTimeout(reclamarUnidad());
      } catch (e) {
        resultado = null; // tempo esgotado: segue para o ecrã do código manual, abaixo.
      }
      if (resultado) {
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
    }

    render(
      '<h1>' + UNIDAD_LABEL[S.zona] + ' ' + numero + '</h1>',
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

  // Caminho do código manual: nunca depende da rede. Guarda a atribuição e a nova captura
  // primeiro no aparelho (a sincronização, com a mesma guarda de concorrência do caminho
  // automático, faz-se sozinha em segundo plano — ver sincronizar()).
  async function reclamarUnidadLocal() {
    const intentoLocal = Object.assign({}, S.intento, {
      persona2_id: S.persona.id, estado: 'escaneando', synced: false
    });
    try {
      await idbPut('intentos_locales', intentoLocal);
    } catch (e) {
      mostrarModalIntegridad('Não foi possível guardar localmente. Não continues até resolver isto.');
      throw e;
    }
    S.intento = intentoLocal;

    const captura = { id: uuid(), intento_id: S.intento.id, numero_captura: 1, estado: 'activa', synced: false };
    try {
      await idbPut('capturas_locales', captura);
    } catch (e) {
      mostrarModalIntegridad('Não foi possível guardar localmente. Não continues até resolver isto.');
      throw e;
    }
    sincronizar();
    S.captura = captura;

    await guardarPuntero();
    pantallaEscaneo();
  }

  async function autorizarEscaneo() {
    const codigo = document.getElementById('inv-codigo-auth').value;
    const err = document.getElementById('inv-codigo-error');
    const ok = await verificarCodigo(S.tienda.id, S.inventario.id, S.unidad.id, S.intento.numero_intento, codigo);
    if (!ok) { err.textContent = 'Código incorreto, ou pertence a outra unidade/tentativa.'; return; }

    await reclamarUnidadLocal();
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
    root().addEventListener('click', function () {
      // Com um aviso aberto (ex.: código não reconhecido), não roubar o foco dos
      // seus campos — aí o teclado tem de aparecer normalmente ao tocar.
      if (root().querySelector('.inv-modal-fondo')) return;
      focarSemTeclado(input);
    });

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

    // Se a app fechou a meio de um "código não reconhecido" por resolver, retoma aqui.
    const eventosCaptura = await idbGetAllByIndex('eventos', 'captura_id', S.captura.id);
    const pendente = eventosCaptura.find(function (e) { return e.resuelto === false; });
    if (pendente) pedirReferenciaManual(pendente);
  }

  async function procesarCodigo(codigo) {
    // 1) Catálogo mestre, embutido no aparelho (js/catalogo-datos.js) — sem rede, instantâneo.
    const doCatalogo = window.WKZ_CATALOGO && window.WKZ_CATALOGO[codigo];
    if (doCatalogo) {
      await registrarEscaneoLocal(codigo, doCatalogo[0], doCatalogo[1], true, true);
      await refrescarEscaneoUI();
      const inputCat = document.getElementById('inv-scan-input');
      if (inputCat) focarSemTeclado(inputCat);
      return;
    }

    // 2) Já resolvido antes, neste mesmo aparelho? (funciona sem rede)
    const local = await buscarCodigoLocal(codigo);
    if (local) {
      await registrarEscaneoLocal(codigo, local.referencia, local.descripcion, false, true);
      await refrescarEscaneoUI();
      const inputLocal = document.getElementById('inv-scan-input');
      if (inputLocal) focarSemTeclado(inputLocal);
      return;
    }

    // 3) A leitura fica guardada já, mesmo antes de saber se o código é conhecido.
    const evento = await registrarEscaneoLocal(codigo, null, null, false, false);

    // 4) Só com rede: associações temporais feitas noutros aparelhos para este inventário.
    let resultado = null;
    if (navigator.onLine && window.sbInventario) {
      const { data, error } = await window.sbInventario.rpc('buscar_codigo', {
        p_token: S.token, p_inventario_id: S.inventario.id, p_codigo: codigo
      });
      if (!error && data && data.length) resultado = data[0];
    }

    if (resultado) {
      await resolverEscaneoLocal(evento.id, resultado.referencia, resultado.descripcion, false);
      await refrescarEscaneoUI();
      const inputOk = document.getElementById('inv-scan-input');
      if (inputOk) focarSemTeclado(inputOk);
      return;
    }

    // 5) Código não reconhecido: bloqueia até introduzir referência e descrição.
    pedirReferenciaManual(evento);
  }

  function pedirReferenciaManual(evento) {
    const f = modal(
      '<h3>Código não reconhecido</h3>' +
      '<p>O código <strong>' + escapeHtml(evento.codigo_barras) + '</strong> não está no catálogo.</p>' +
      '<p>Introduz a referência e a descrição para continuares. Não é possível avançar sem preencher os dois campos.</p>' +
      '<input type="text" id="inv-ref-manual" placeholder="Referência" autocomplete="off">' +
      '<input type="text" id="inv-desc-manual" placeholder="Descrição (ex.: Saia preta comprida)" autocomplete="off" style="margin-top:8px;">' +
      '<p id="inv-ref-manual-error" style="color:#c0392b;"></p>' +
      '<button class="inv-primario" id="inv-ref-manual-ok" style="width:100%;">Confirmar</button>'
    );
    const inputRef = f.querySelector('#inv-ref-manual');
    const inputDesc = f.querySelector('#inv-desc-manual');
    const err = f.querySelector('#inv-ref-manual-error');
    inputRef.focus();

    async function confirmar() {
      const ref = inputRef.value.trim();
      const desc = inputDesc.value.trim();
      if (!ref || !desc) { err.textContent = 'Tens de preencher referência e descrição.'; return; }

      await guardarAsociacionLocal(evento.codigo_barras, ref, desc);
      await resolverEscaneoLocal(evento.id, ref, desc, false);
      f.remove();
      await refrescarEscaneoUI();
      const input = document.getElementById('inv-scan-input');
      if (input) focarSemTeclado(input);
    }

    f.querySelector('#inv-ref-manual-ok').onclick = confirmar;
    inputDesc.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmar(); });
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
      const input = document.getElementById('inv-scan-input');
      if (input) focarSemTeclado(input);
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
      alert('✅ ' + UNIDAD_LABEL[S.zona] + ' validado.');
    } else {
      await window.sbInventario.from('intentos').update({ estado: 'divergencia' }).eq('id', S.intento.id);
      await window.sbInventario.from('unidades').update({ estado: 'pendiente' }).eq('id', S.unidad.id);
      alert('❌ ' + UNIDAD_LABEL[S.zona] + ' não validado — divergência. A Pessoa 1 tem de voltar a contar esta unidade.');
    }
    await limpiarPuntero();
    pantallaUnidades();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ENCERRAMENTO DEFINITIVO DO INVENTÁRIO DA LOJA (Loja + Armazém juntos,
  //  numa única transação atómica no lado do servidor — ou fecham os dois,
  //  ou não fecha nenhum)
  // ══════════════════════════════════════════════════════════════════════
  async function cerrarInventarioDeTienda() {
    if (S.pendientesSync > 0) {
      alert('Ainda há ' + S.pendientesSync + ' leituras pendentes de sincronizar. Espera que o indicador fique verde antes de encerrar.');
      return;
    }
    if (!navigator.onLine) { alert('Precisas de ligação à Internet para encerrar o inventário definitivamente.'); return; }
    if (await hayModoSinInternetActivoEnTienda(S.tienda.id)) {
      alert('O modo sem Internet ainda está ativo neste aparelho, numa das zonas. Desativa-o (na lista de unidades dessa zona) antes de encerrar definitivamente.');
      return;
    }
    if (!confirm('Encerrar definitivamente o inventário de ' + S.tienda.nombre + ' (Loja e Armazém)? Esta ação não pode ser desfeita.')) return;

    const { data, error } = await window.sbInventario.rpc('cerrar_inventario_tienda', {
      p_token: S.token, p_tienda_id: S.tienda.id, p_persona_id: S.persona.id
    });
    if (error) { alert('Não foi possível encerrar: ' + error.message); return; }
    const resultado = data && data[0];
    if (!resultado || !resultado.ok) {
      alert('Ainda não é possível encerrar: ' + (resultado ? resultado.motivo : 'erro desconhecido'));
      return;
    }
    alert('Inventário de ' + S.tienda.nombre + ' encerrado corretamente.');
    pantallaZona();
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
