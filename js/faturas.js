/* ══════════════════════════════════════════════════════════
   processamento.js — Módulo de Processamento de Faturas
   Auto-injectado como overlay em index.html
══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 2. STATE ── */
  var faturaCount   = 0;
  var activeFaturas = [];
  var rowCounts     = {};
  var _procInited   = false;
  var _isSynced     = false;   /* true only after remote fetch completes on init */
  /* Nova nomenclatura: decisao 100% por factura, nunca por fornecedor —
     duas facturas do mesmo fornecedor sao mundos independentes. Por
     omissao (chave ausente) considera-se activo. */
  /* ══ SUSPENSAO TEMPORARIA DAS REFERENCIAS INTERNAS (decisao de negocio) ══
     Enquanto false, a funcionalidade fica bloqueada em todo o lado que a
     consulta (checkbox aparece desactivado com cadeado, geracao nunca
     corre, stock/exportacoes tratam como se estivesse desligada) — mas
     NADA e removido: RPCs, correcao de linhas, toda a logica existente
     continua intacta. As preferencias por factura ja guardadas (
     _usaNomenclaturaPorFatura) tambem NAO sao alteradas nem apagadas
     enquanto suspensa, para que ao reactivar cada factura volte
     exactamente ao estado em que estava.
     PARA REACTIVAR: mudar esta unica constante para true. Mais nada
     precisa de ser tocado. */
  var PROC_REFERENCIA_INTERNA_HABILITADA = false;

  var _usaNomenclaturaPorFatura = {};

  /* Correcao manual da data real de uma factura, para o caso raro em
     que ela chegou fisicamente numa data mas so foi lancada no
     Primavera semanas depois (sem a data de lancamento ser corrigida
     la). Guardado por fid: { data: 'DD/MM/AAAA', movida: bool,
     sessaoDestino, movidaEm } — "movida" fica permanentemente
     marcado depois da factura ser realmente deslocada para a sessao
     da semana correcta, ao fechar a sessao (ver procCloseActiveSession
     e procMoverFacturaParaSemanaCorrigida). */
  var _procDataCorrigidaPorFatura = {};

  /* Estilo inline do botao de correcao de data no modal "Ingresso de
     Stock", conforme o estado actual (nunca tocado / correcao
     pendente / ja movida) — usado tanto na primeira renderizacao como
     depois de o utilizador gravar uma correcao, para o botao mudar de
     aspecto na hora sem ter de reabrir o modal. */
  function procEstiloBotaoDataCorrigida(corr) {
    var base = 'display:inline-block;margin-left:6px;width:20px;height:20px;line-height:18px;text-align:center;border-radius:50%;font-size:.8rem;cursor:pointer;font-weight:700;';
    if (corr && corr.movida) return base + 'border:1px solid #9B4D4D;background:#F5EAEA;color:#9B4D4D;';
    if (corr && corr.data)   return base + 'border:1px solid #C9A227;background:#FBF3D9;color:#8a6d1a;';
    return base + 'border:1px solid #ccc;background:#fff;color:#999;';
  }

  function procTituloBotaoDataCorrigida(corr) {
    if (corr && corr.movida) return 'Factura movida para a semana de ' + corr.data + ' (' + (corr.sessaoDestino || '') + ').';
    if (corr && corr.data)   return 'Data corrigida pendente: ' + corr.data + ' (será movida ao fechar a sessão).';
    return 'Corrigir a data real desta factura.';
  }

  /* Estado EFECTIVO (nao o guardado) — usar isto sempre que se quer
     saber se a referencia interna esta activa AGORA para uma factura,
     em vez de ler _usaNomenclaturaPorFatura directamente. */
  function procNomenclaturaAtivaParaFatura(fid) {
    if (!PROC_REFERENCIA_INTERNA_HABILITADA) return false;
    return _usaNomenclaturaPorFatura.hasOwnProperty(fid) ? _usaNomenclaturaPorFatura[fid] : true;
  }

  /* Uma factura com numero de guia fica com a tabela de artigos
     bloqueada para edicao (protege dados ja enviados ao ERP). So fica
     true depois do gesto deliberado de 3 clics no nome do fornecedor —
     nunca persiste entre sessoes/recargas, para que cada abertura da
     factura volte ao estado seguro por omissao. */
  var _tabelaDesbloqueadaPorGuia = {};

  /* ── UNDO HISTORY (Ctrl+Z, ultimos 10 estados) ── */
  var _undoStack   = [];
  var _undoMaxSize = 10;
  var _undoPaused  = false; /* evita gravacao durante restore */

  /* ── 2a. SUPABASE CONFIG ── */
  // Lee credenciales dinámicamente en cada llamada para respetar el timing de initSupabase
  function procSbHeaders() {
    var key = window.SUPABASE_KEY || '';
    return { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key, 'x-admin-token': window.ADMIN_TOKEN || '' };
  }
  function procSbFetch(path, opts) {
    var url = window.SUPABASE_URL || '';
    return fetch(url + '/rest/v1/' + path, Object.assign({ headers: procSbHeaders() }, opts || {}));
  }

  /* ── 2b. SYNC STATUS ── */
  function procSetSyncStatus(state, msg) {
    var el = document.getElementById('proc-saveStatus');
    if (!el) return;
    var icons = { syncing: '↻', ok: '✓', error: '⚠', offline: '⊘' };
    el.textContent = (icons[state] || '') + ' ' + msg;
    el.style.opacity = '1';
    el.style.color = state === 'error' ? '#9B4D4D' : state === 'offline' ? '#5F7B94' : '#4A7C6F';
    clearTimeout(el._t);
    if (state === 'ok') {
      el._t = setTimeout(function() { el.style.opacity = '0'; }, 3000);
    }
  }

  function procMarkSynced() {
    _isSynced = true;
  }

  /* ── UNDO HELPERS ── */

  function procUndoSnapshot() {
    if (_undoPaused) return;
    var payload = procBuildSavePayload();
    if (!payload) return;
    var json = JSON.stringify(payload);
    if (_undoStack.length && _undoStack[_undoStack.length - 1] === json) return;
    _undoStack.push(json);
    if (_undoStack.length > _undoMaxSize) _undoStack.shift();
  }

  function procUndoRestore() {
    if (_undoStack.length < 2) {
      procUndoFlash('nada para desfazer');
      return;
    }
    _undoStack.pop();
    var json = _undoStack[_undoStack.length - 1];
    _undoPaused = true;
    try {
      var data;
      try { data = JSON.parse(json); } catch(e) { _undoPaused = false; return; }
      var cont = document.getElementById('proc-faturasContainer');
      if (cont) cont.innerHTML = '';
      faturaCount   = 0;
      activeFaturas = [];
      Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
      var faturas = data.faturas || [];
      if (!faturas.length) { procAddFatura(null); }
      else faturas.forEach(function(fd) { procAddFatura(fd); });
    } finally {
      _undoPaused = false;
    }
    procUndoFlash('desfeito');
  }

  function procUndoFlash(msg) {
    var el = document.getElementById('proc-saveStatus');
    if (!el) return;
    var prev = el.textContent;
    var prevOpacity = el.style.opacity;
    el.textContent = String.fromCharCode(8617) + ' ' + msg;
    el.style.opacity = '1';
    el.style.color = '#5F7B94';
    clearTimeout(el._t);
    el._t = setTimeout(function() {
      el.textContent = prev;
      el.style.opacity = prevOpacity;
      el.style.color = '';
    }, 1800);
  }

  function procInitUndoKeyboard() {
    document.addEventListener('keydown', function(e) {
      var inProc = document.getElementById('proc-content');
      if (!inProc) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        var active = document.activeElement;
        if (!inProc.contains(active) && active !== document.body) return;
        e.preventDefault();
        procUndoRestore();
      }
    });
  }

  /* ── 2b. PROVIDER LIST ── */
  var PROVIDERS = [
    'TAM','REN KE ZHONG','MEMORIAS INFINITAS','AMORADO','JOLIE','NICOLE','JIANG JING','GUO XIAOFENG','PARFOIS','BORBOLETA VISTOSA',
    'DALUN CHENG','SEMPRE NATURAL','MODA GY','XU HAIDONG','KAMRUZZAMAN','CHLAMYS VARIA','LOSAN','EUROPA&MING',
    'VEGOTEX','CHEN XIANG','YOUHE YANG','BLISSED','PICKBEAUTY','MODA EUROPA','VILA & SAAVEDRA',
    'MUKIT','ALCOTT','CHUXUAN SUN','MELODYSTATION','MUNDO FAVORITO','MING TA','ARITA','ALDATEX',
    'GOOD E GOOD','BLUE ROYAL','EXOTICO & CINTILANTE','SKY LOVERS','ZHUO QIUHUI','BESTSELLER',
    'FARZANA','BIJUTERIA XU HAIDONG','NOVA MODA','XIANDENG ZHANG','WAVINGMOON','ERRUI CHEN',
    'YINGLONG','HANG HAIGUANG','CHI FANGYU'
  ];

  function procNormalize(s) {
    return s.trim().toUpperCase().replace(/\s+/g,' ');
  }

  function procFindMatches(query) {
    var q = procNormalize(query);
    if (!q) return [];
    return PROVIDERS.filter(function(p) {
      return p.indexOf(q) !== -1 || q.indexOf(p) !== -1 ||
             p.split(' ').some(function(w) { return w.indexOf(q) === 0; });
    });
  }

  /* Encuentra el proveedor exacto si el valor escrito coincide suficientemente */
  function procFindExact(query) {
    var q = procNormalize(query);
    /* Coincidencia exacta */
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i] === q) return PROVIDERS[i];
    }
    /* Coincidencia 80%+: el query contiene todas las palabras significativas del proveedor */
    for (var j = 0; j < PROVIDERS.length; j++) {
      var words = PROVIDERS[j].split(' ').filter(function(w){ return w.length > 2; });
      if (words.length && words.every(function(w){ return q.indexOf(w) !== -1; })) {
        return PROVIDERS[j];
      }
    }
    return null;
  }

  /* ── 2b-bis. BIBLIOTECA DE FORNECEDORES (Supabase) ──
     PROVIDERS funciona como cache em memória partilhada por todas as
     funções de matching acima. Ao arrancar, funde-se com os fornecedores
     gravados remotamente; sempre que se deteta um fornecedor novo (sem
     correspondência aproximada), grava-se na tabela `proc_fornecedores`
     para ficar disponível a todos os utilizadores/sessões futuras. */
  var _knownFornecedoresSet  = {};
  var _fornecedoresRemoteLoaded = false;
  (function procBuildFornecedoresSet() {
    for (var i = 0; i < PROVIDERS.length; i++) _knownFornecedoresSet[PROVIDERS[i]] = true;
  })();

  function procLoadFornecedoresRemote() {
    if (_fornecedoresRemoteLoaded) return;
    _fornecedoresRemoteLoaded = true;
    procSbFetch('proc_fornecedores?select=nome', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        if (!rows || !rows.length) return;
        rows.forEach(function(row) {
          var nome = row && row.nome ? procNormalize(row.nome) : '';
          if (nome && !_knownFornecedoresSet[nome]) {
            PROVIDERS.push(nome);
            _knownFornecedoresSet[nome] = true;
          }
        });
      })
      .catch(function() { /* offline — mantém-se a lista local/seed */ });
  }

  /* Grava um fornecedor novo na biblioteca remota (fire-and-forget).
     Idempotente: `merge-duplicates` evita duplicados se duas sessões
     gravarem o mesmo nome em simultâneo. */
  function procSaveFornecedorRemote(nome) {
    var n = procNormalize(nome);
    if (!n || _knownFornecedoresSet[n]) return;
    _knownFornecedoresSet[n] = true;
    PROVIDERS.push(n);
    procSbFetch('proc_fornecedores', {
      method: 'POST',
      headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ nome: n })
    }).catch(function() { /* falha silenciosa — fica disponível só nesta sessão */ });
  }

  /* ── 2b-ter. NOVA NOMENCLATURA (AAPPPCT-NNNNN) ──
     Bloco isolado: nada aqui e chamado a menos que procShowCriacaoModal
     o invoque explicitamente. Nao altera nenhum fluxo existente. */

  var _sessaoUsaReferenciaAutomatica = true;
  window.procSetSessaoUsaReferenciaAutomatica = function(v) {
    _sessaoUsaReferenciaAutomatica = (v !== false);
  };

  var _categoriasCache = null;
  var _categoriasLoading = null;

  function procNormalizarTermo(s) {
    return (s || '').toString().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function procLoadCategoriasRemote() {
    /* So reutiliza a cache quando realmente trouxe categorias. Um array
       vazio NUNCA fica guardado como "carregado" — se a 1a tentativa falhar
       ou vier vazia (rede lenta, RLS ainda a inicializar, etc.), a proxima
       chamada tenta de novo em vez de resolver tudo como XX para sempre. */
    if (_categoriasCache && _categoriasCache.length) return Promise.resolve(_categoriasCache);
    if (_categoriasLoading) return _categoriasLoading;
    _categoriasLoading = procSbFetch(
      'proc_categorias?select=codigo,categoria_pt,sinonimos_pt,sinonimos_es,sinonimos_en,sinonimos_it,sinonimos_fr,sinonimos_de,erros_comuns_pt,erros_comuns_es&ativo=eq.true',
      { method: 'GET' }
    )
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var mapeadas = (rows || []).map(function(row) {
          var todos = []
            .concat(row.sinonimos_pt || [], row.sinonimos_es || [], row.sinonimos_en || [],
                    row.sinonimos_it || [], row.sinonimos_fr || [], row.sinonimos_de || [],
                    row.erros_comuns_pt || [], row.erros_comuns_es || []);
          var termos = todos.map(procNormalizarTermo).filter(Boolean);
          termos.sort(function(a, b) { return b.split(' ').length - a.split(' ').length; });
          return { codigo: row.codigo, categoria_pt: row.categoria_pt, termos: termos };
        });
        if (mapeadas.length) { _categoriasCache = mapeadas; }
        _categoriasLoading = null;
        return mapeadas;
      })
      .catch(function() { _categoriasLoading = null; return []; });
    return _categoriasLoading;
  }

  function procResolverCategoria(descricao, categorias) {
    var desc = procNormalizarTermo(descricao);
    if (!desc) return 'XX';
    var palavras = desc.split(' ');
    for (var i = 0; i < categorias.length; i++) {
      var termos = categorias[i].termos;
      for (var j = 0; j < termos.length; j++) {
        if (termos[j].indexOf(' ') === -1) continue;
        if ((' ' + desc + ' ').indexOf(' ' + termos[j] + ' ') !== -1) return categorias[i].codigo;
      }
    }
    for (var p = 0; p < palavras.length; p++) {
      var w = palavras[p];
      var wSing = (w.length > 3 && w.slice(-1) === 'S' && w.slice(-2) !== 'SS') ? w.slice(0, -1) : w;
      for (var k = 0; k < categorias.length; k++) {
        var terms2 = categorias[k].termos;
        for (var m = 0; m < terms2.length; m++) {
          if (terms2[m] === w || terms2[m] === wSing) return categorias[k].codigo;
        }
      }
    }
    return 'XX';
  }

  var _fornecedorInfoCache = {};
  function procLoadFornecedorInfo(nomeFornecedor) {
    var n = procNormalize(nomeFornecedor);
    if (!n) return Promise.resolve(null);
    if (_fornecedorInfoCache[n]) return Promise.resolve(_fornecedorInfoCache[n]);
    return procSbFetch(
      'proc_fornecedores?nome=eq.' + encodeURIComponent(n) + '&select=nome,codigo,gera_referencia_automatica',
      { method: 'GET' }
    )
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var info = (rows && rows[0]) ? rows[0] : { nome: n, codigo: null, gera_referencia_automatica: true };
        _fornecedorInfoCache[n] = info;
        return info;
      })
      .catch(function() {
        return { nome: n, codigo: null, gera_referencia_automatica: true };
      });
  }

  function procGuardarPreferenciaFornecedor(nomeFornecedor, ativo) {
    var n = procNormalize(nomeFornecedor);
    if (!n) return;
    if (_fornecedorInfoCache[n]) _fornecedorInfoCache[n].gera_referencia_automatica = ativo;
    procSbFetch('proc_fornecedores?nome=eq.' + encodeURIComponent(n), {
      method: 'PATCH',
      headers: Object.assign(procSbHeaders(), { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ gera_referencia_automatica: ativo })
    }).catch(function() { /* falha silenciosa */ });
  }

  function procNormalizarRefOriginal(ref) {
    return (ref || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Cria ou obtem a referencia interna atraves do RPC atomico
     proc_obter_ou_criar_referencia (ver proc_referencias_atomico_v3.sql).
     Todo o "existe? / calcula proximo numero livre / grava" acontece numa
     unica transacao dentro da base de dados, com a linha do fornecedor
     bloqueada — nao ha forma de duas chamadas concorrentes colidirem.
     Devolve { referencia_interna, criada_agora }: criada_agora=false
     significa que a referencia ja existia antes desta chamada (pode
     estar partilhada com outra factura) — so quando e true e que e
     seguro apaga-la mais tarde se o utilizador desligar o toggle. */
  function procObtenerOuCriarReferencia(nomeFornecedor, codigoFornecedor, refOriginal, categoria, guiaAtual) {
    var proveedor = procNormalize(nomeFornecedor);
    var refNorm   = procNormalizarRefOriginal(refOriginal);
    var ano       = new Date().getFullYear() % 100;
    if (!proveedor || !refNorm || !codigoFornecedor) return Promise.resolve(null);

    return procSbFetch('rpc/proc_obter_ou_criar_referencia', {
      method: 'POST',
      body: JSON.stringify({
        p_proveedor: proveedor,
        p_referencia_original: refNorm,
        p_categoria: categoria,
        p_ano: ano,
        p_guia: guiaAtual || null
      })
    })
      .then(function(r) {
        if (!r.ok) {
          return r.text().then(function(txt) {
            console.error('[proc] falha ao obter/criar referencia — status ' + r.status + ':', txt, { proveedor: proveedor, refNorm: refNorm, categoria: categoria, ano: ano });
            return null;
          });
        }
        return r.json();
      })
      .then(function(resultado) {
        if (!resultado || !resultado.referencia_interna) return null;
        return { referencia_interna: resultado.referencia_interna, criada_agora: !!resultado.criada_agora };
      })
      .catch(function(e) {
        console.error('[proc] erro de rede ao obter/criar referencia:', e, { proveedor: proveedor, refNorm: refNorm, categoria: categoria, ano: ano });
        return null;
      });
  }

  function procValidarAdmin(token) {
    if (!token) return Promise.resolve(false);
    return procSbFetch('rpc/proc_es_admin', {
      method: 'POST',
      body: JSON.stringify({ p_token: token })
    })
      .then(function(r) { return r.ok ? r.json() : false; })
      .catch(function() { return false; });
  }

  /* ══════════════════════════════════════════════════════════════
     IMPORTADOR DE HISTORICO (Excel → Supabase) — ferramenta pontual,
     usada uma unica vez para trazer para proc_sessoes os dados de anos
     anteriores guardados numa folha Excel externa. Pode ser removida
     depois de usada; nao faz parte do fluxo normal da aplicacao.

     Regra de ouro: NUNCA sobrescreve nem apaga nada que ja exista.
     Cada factura candidata so e admitida se a combinacao
     fornecedor + numero de guia + semana ainda nao existir em nenhuma
     sessao ja gravada (incluindo sufixos _2, _3... da mesma semana);
     caso contrario e descartada silenciosamente (fica so no relatorio).
  ══════════════════════════════════════════════════════════════ */

  function procCarregarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload  = function() { resolve(); };
      s.onerror = function() { reject(new Error('Falha ao carregar SheetJS')); };
      document.head.appendChild(s);
    });
  }

  /* Le a folha linha a linha e reconstroi cada factura exactamente como
     no excel: uma linha do excel = uma linha do produto num armazem
     (A4 ou A5). Agrupa-se por (referencia, descricao, preco) — nunca so
     por referencia — e somam-se as quantidades de cada armazem dentro
     desse grupo. Isto e uma copia FIEL: se a mesma referencia aparecer
     com precos diferentes na mesma factura, fica em linhas separadas,
     nunca se faz media nem se descarta nada (essa media so se aplica
     depois, ao ingresso de stock — nunca aqui na importacao). Uma nova
     factura comeca sempre que a coluna GUIA tem valor; uma sessao
     (semana) e identificada pela DATA SESSAO da PRIMEIRA linha de cada
     factura, convertida para a mesma chave proc_fatura_YYYY-MM-DD que a
     aplicacao ja usa (as datas do SheetJS vem em UTC, exactamente como
     saem do Excel, por isso toISOString() nunca desvia o dia). */
  function procAgruparExcelHistorico(arrayBuffer) {
    var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    var sessions = {};
    var avisos = [];
    var blocoAtual = null;

    /* Fecha e regista o bloco (factura) ACTUALMENTE aberto — auto-
       contida, nunca depende de estado partilhado fora desta funcao. */
    function fecharBlocoAtual() {
      if (!blocoAtual) return;
      var bloco = blocoAtual;
      blocoAtual = null;

      var rows = [];
      for (var i = 0; i < bloco.order.length; i++) {
        var g = bloco.groups[bloco.order[i]];
        rows.push({
          ref: g.ref, desc: g.desc, qtdFt: g.a4 + g.a5, a4: g.a4, a5: g.a5,
          preco: g.preco, descPct: 0, hasD: false, plus1: false, obs: '', flagged: false, pvpManual: null
        });
      }
      if (!rows.length) return;

      var d = bloco.data ? new Date(bloco.data) : null;
      if (!d || isNaN(d.getTime())) {
        avisos.push('Factura com guia ' + bloco.guia + ' (' + (bloco.fornecedor || '?') + ') ignorada \u2014 data de sess\u00e3o inv\u00e1lida.');
        return;
      }
      var proveedorNorm = procNormalize(bloco.fornecedor || '');
      var guiaErp = (bloco.guia != null) ? String(bloco.guia).trim() : '';
      if (!proveedorNorm || !guiaErp) {
        avisos.push('Factura com guia ' + bloco.guia + ' ignorada \u2014 fornecedor ou guia em falta.');
        return;
      }

      /* CRITICO: usar SEMPRE os getters LOCAIS (getFullYear/getMonth/
         getDate), nunca toISOString()/getUTC*. O SheetJS constroi as
         datas das celulas usando o fuso horario LOCAL do browser — em
         horario de Verao (Portugal/Madeira, UTC+1), a meia-noite local
         de segunda-feira e as 23:00 UTC de domingo, por isso
         toISOString() (que devolve em UTC) dava domingo em vez de
         segunda em mais de metade dos registos.
         Se a data nao cair numa segunda-feira, usa-se a segunda-feira
         dessa mesma semana (nunca se rejeita a factura). */
      var diaSemanaLocal = d.getDay();
      var diffParaSegunda = (diaSemanaLocal === 0) ? -6 : (1 - diaSemanaLocal);
      var segunda = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffParaSegunda);
      var dataLocalISO = segunda.getFullYear() + '-' + String(segunda.getMonth() + 1).padStart(2, '0') + '-' + String(segunda.getDate()).padStart(2, '0');

      var sessionKey = 'proc_fatura_' + dataLocalISO;
      if (!sessions[sessionKey]) sessions[sessionKey] = [];
      sessions[sessionKey].push({
        proveedor: bloco.fornecedor || '',
        proveedorNorm: proveedorNorm,
        valorFactura: (bloco.totalFt != null && bloco.totalFt !== '') ? String(bloco.totalFt) : '',
        guiaErp: guiaErp,
        rows: rows
      });
    }

    for (var r = 1; r < linhas.length; r++) {
      var row = linhas[r] || [];
      var guia = row[0], ref = row[1], desc = row[2], arm = row[3],
          preco = row[5], qtda = row[6], totalFt = row[8], dataSessao = row[9], fornecedor = row[10];

      if (guia != null && guia !== '') {
        fecharBlocoAtual();
        blocoAtual = { guia: guia, fornecedor: fornecedor, data: dataSessao, totalFt: totalFt, groups: {}, order: [] };
      }
      if (!blocoAtual) continue;
      if (ref == null || ref === '') continue;

      var refStr   = String(ref).trim();
      var descStr  = (desc == null) ? '' : String(desc).trim();
      var precoNum = (preco != null && preco !== '') ? parseFloat(preco) : 0;
      var qtdaNum  = (qtda  != null && qtda  !== '') ? parseFloat(qtda)  : 0;
      var chave = refStr + '\u0001' + descStr + '\u0001' + precoNum;

      if (!blocoAtual.groups[chave]) {
        blocoAtual.groups[chave] = { ref: refStr, desc: descStr, preco: precoNum, a4: 0, a5: 0 };
        blocoAtual.order.push(chave);
      }
      if (arm === 'A4') blocoAtual.groups[chave].a4 += qtdaNum;
      else if (arm === 'A5') blocoAtual.groups[chave].a5 += qtdaNum;
      else blocoAtual.groups[chave].a4 += qtdaNum;
    }
    fecharBlocoAtual();

    var totalInv = 0, totalR = 0;
    Object.keys(sessions).forEach(function(k) {
      totalInv += sessions[k].length;
      sessions[k].forEach(function(inv) { totalR += inv.rows.length; });
    });

    return { sessions: sessions, totalInvoices: totalInv, totalRows: totalR, avisos: avisos };
  }

  /* Importa sessao a sessao, sempre sequencialmente (nunca em paralelo,
     para nao haver corrida entre o GET e o POST da mesma sessao). Por
     cada semana, procura TODAS as sessoes ja gravadas com esse prefixo
     (a base + eventuais sufixos _2, _3...), junta as chaves
     fornecedor+guia de TODAS elas, e so acrescenta as facturas
     candidatas cuja chave ainda nao apareca em lado nenhum. As facturas
     ja existentes nunca sao tocadas nem reescritas — so se acrescenta
     ao array, nunca se substitui. */
  function procImportarSessoesHistorico(sessoesMap, log, onDone) {
    var chaves = Object.keys(sessoesMap).sort();
    var idx = 0;
    var resumo = { sessoesNovas: 0, sessoesAtualizadas: 0, facturasAdicionadas: 0, facturasDescartadas: 0, erros: 0 };

    function proximo() {
      if (idx >= chaves.length) {
        log('\n\u2713 Importa\u00e7\u00e3o conclu\u00edda. Sess\u00f5es novas: ' + resumo.sessoesNovas
          + ' \u00b7 sess\u00f5es actualizadas: ' + resumo.sessoesAtualizadas
          + ' \u00b7 facturas adicionadas: ' + resumo.facturasAdicionadas
          + ' \u00b7 facturas descartadas (j\u00e1 existiam): ' + resumo.facturasDescartadas
          + (resumo.erros ? ' \u00b7 erros: ' + resumo.erros : ''));
        if (onDone) onDone(resumo);
        return;
      }
      var sessionKey = chaves[idx++];
      var candidatos = sessoesMap[sessionKey];

      procSbFetch('proc_sessoes?session_key=like.' + encodeURIComponent(sessionKey) + '*&select=session_key,dados', { method: 'GET' })
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(existentes) {
          var vistas = {};
          (existentes || []).forEach(function(row) {
            try {
              var dados = JSON.parse(row.dados);
              (dados.faturas || []).forEach(function(f) {
                var chave = procNormalize(f.proveedor || '') + '|' + (f.guiaErp || '').toString().trim();
                vistas[chave] = true;
              });
            } catch (e) {}
          });

          var novas = candidatos.filter(function(c) {
            var chave = c.proveedorNorm + '|' + c.guiaErp;
            if (vistas[chave]) { resumo.facturasDescartadas++; return false; }
            vistas[chave] = true;
            return true;
          });

          if (!novas.length) {
            log('\u2014 ' + sessionKey + ': nada novo (' + candidatos.length + ' j\u00e1 exist' + (candidatos.length === 1 ? 'ia' : 'iam') + ')');
            proximo();
            return;
          }

          var baseExistente = (existentes || []).filter(function(row) { return row.session_key === sessionKey; })[0];
          var payload;
          if (baseExistente) {
            try { payload = JSON.parse(baseExistente.dados); } catch (e) { payload = null; }
          }
          if (!payload) payload = { savedAt: new Date().toISOString(), sentRefs: {}, faturas: [] };
          if (!payload.faturas) payload.faturas = [];

          novas.forEach(function(c) {
            payload.faturas.push({
              proveedor: c.proveedor, valorFactura: c.valorFactura, guiaErp: c.guiaErp,
              collapsed: false, transpTotal: '', transpApplied: false, guiaInclude: false,
              usaNomenclatura: false, rows: c.rows
            });
          });
          payload.savedAt = new Date().toISOString();

          procSbFetch('proc_sessoes', {
            method: 'POST',
            headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify({ session_key: sessionKey, dados: JSON.stringify(payload), updated_at: payload.savedAt })
          }).then(function(r) {
            if (r.ok) {
              if (baseExistente) resumo.sessoesAtualizadas++; else resumo.sessoesNovas++;
              resumo.facturasAdicionadas += novas.length;
              log('\u2713 ' + sessionKey + ': +' + novas.length + ' factura(s)' + (candidatos.length > novas.length ? ' (' + (candidatos.length - novas.length) + ' j\u00e1 exist' + ((candidatos.length - novas.length) === 1 ? 'ia' : 'iam') + ')' : ''));
            } else {
              resumo.erros++;
              log('\u26a0 ' + sessionKey + ': erro ao gravar');
            }
            proximo();
          }).catch(function() {
            resumo.erros++;
            log('\u26a0 ' + sessionKey + ': erro de rede ao gravar');
            proximo();
          });
        })
        .catch(function() {
          resumo.erros++;
          log('\u26a0 ' + sessionKey + ': erro ao ler sess\u00e3o existente');
          proximo();
        });
    }

    proximo();
  }

  function procMostrarModalImportadorHistorico() {
    var old = document.getElementById('proc-import-hist-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-import-hist-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:560px;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Importar Hist\u00f3rico (Excel)</span>'
      +       '<span class="proc-or-panel-title-sub">Nunca sobrescreve o que j\u00e1 existe</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">\u2715 Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-panel-scroll" style="padding:20px;">'
      +     '<p style="font-size:.8rem;color:#555;line-height:1.5;margin:0 0 14px;">Cada factura \u00e9 comparada por <strong>fornecedor + n\u00famero de guia + semana</strong> contra o que j\u00e1 est\u00e1 em Supabase \u2014 se j\u00e1 existir, \u00e9 descartada. Nada existente \u00e9 alterado ou apagado.</p>'
      +     '<input type="file" id="proc-import-hist-file" accept=".xlsx" style="font-size:.8rem;">'
      +     '<div style="margin-top:14px;">'
      +       '<button class="proc-btn primary" id="proc-import-hist-start-btn" disabled>Iniciar importa\u00e7\u00e3o</button>'
      +     '</div>'
      +     '<div id="proc-import-hist-log" style="display:none;font-family:monospace;font-size:.7rem;white-space:pre-wrap;max-height:320px;overflow-y:auto;background:#f7f7f7;border-radius:8px;padding:10px;margin-top:14px;"></div>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);
    procOpenModal(modal);
    procBindClose(modal);

    var fileInput = document.getElementById('proc-import-hist-file');
    var startBtn  = document.getElementById('proc-import-hist-start-btn');
    var logEl     = document.getElementById('proc-import-hist-log');
    var arquivoSelecionado = null;

    fileInput.addEventListener('change', function() {
      arquivoSelecionado = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
      startBtn.disabled = !arquivoSelecionado;
    });

    function log(msg) {
      logEl.style.display = 'block';
      logEl.textContent += (logEl.textContent ? '\n' : '') + msg;
      logEl.scrollTop = logEl.scrollHeight;
    }

    startBtn.addEventListener('click', function() {
      if (!arquivoSelecionado) return;
      startBtn.disabled = true;
      fileInput.disabled = true;
      log('A carregar ficheiro\u2026');
      var reader = new FileReader();
      reader.onload = function(e) {
        procCarregarSheetJS().then(function() {
          log('A processar Excel\u2026');
          var resultado;
          try {
            resultado = procAgruparExcelHistorico(e.target.result);
          } catch (err) {
            log('\u26a0 Erro ao processar o Excel: ' + (err && err.message ? err.message : err));
            return;
          }
          (resultado.avisos || []).forEach(function(a) { log('\u26a0 ' + a); });
          var numSessoes = Object.keys(resultado.sessions).length;
          log(numSessoes + ' sess\u00f5es encontradas \u00b7 ' + resultado.totalInvoices + ' factura(s) \u00b7 ' + resultado.totalRows + ' linha(s). A comparar com o Supabase e a importar\u2026');
          procImportarSessoesHistorico(resultado.sessions, log, function() {});
        }).catch(function() {
          log('\u26a0 N\u00e3o foi poss\u00edvel carregar a biblioteca de leitura de Excel.');
        });
      };
      reader.onerror = function() { log('\u26a0 Erro ao ler o ficheiro.'); };
      reader.readAsArrayBuffer(arquivoSelecionado);
    });
  }

  function procAbrirImportadorHistorico() {
    var senha = window.prompt('Esta a\u00e7\u00e3o requer a senha de administrador:');
    if (senha === null) return;
    procValidarAdmin(senha).then(function(ok) {
      if (!ok) { window.alert('Senha incorrecta.'); return; }
      procMostrarModalImportadorHistorico();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     IMPORTADOR DE VENDAS (PRIMAVERA) → vendas_primavera
     Le o Excel exportado do Primavera (colunas: Utilizador, Artigo,
     Descricao, Quantidade, V.Liquido, V.Bruto, Valor IVA, Descontos,
     Custo, Margem, Perc.Margem, Data, Hora Venda) e grava-o, fiel,
     linha a linha, em vendas_primavera. Nunca resume nem descarta
     nenhuma coluna. Deduplicacao SEMPRE por dia inteiro (nunca linha
     a linha, dado o volume — 100k+ linhas por ano) contra a tabela de
     controlo vendas_primavera_dias: se um dia ja existir, e ignorado
     por inteiro; caso contrario, insere-se em blocos. Serve tanto
     para a carga historica inicial (um ficheiro por ano) como para as
     cargas semanais futuras — o mesmo mecanismo, sem distincao.
     Mapeamento de armazem (Utilizador → A4/A5), usado mais tarde pelo
     calculo de stock (nao por este importador):
       A4 (Funchal):     Mezka.funchal, Mezka.funchal1
       A5 (Porto Santo):  Mezka.PS, Shana, Maxx, Mezka.Avenida,
                          Duarte, pri
     Qualquer "Utilizador" fora desta lista NUNCA deve ser atribuido
     a um armazem por omissao — fica por rever, avisado explicitamente
     no relatorio do calculo de stock (a construir a seguir). Este
     importador em si nao faz essa atribuicao — so grava os dados tal
     como vem do Excel. */

  /* "Data" (celula Date do SheetJS) → "YYYY-MM-DD" com getters LOCAIS,
     nunca toISOString()/getUTC* — mesma regra critica de fuso horario
     ja aplicada ao importador de compras. */
  function procDataVendaLocalISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* "Hora Venda" vem como texto tipo "Jan  2 2023  4:07PM" (sem
     segundos, por vezes com espacos duplicados). Em vez de confiar no
     parser de datas livres do proprio motor JS (inconsistente entre
     navegadores), extrai-se a hora/minuto/AM-PM por regex e combina-se
     com a data já correcta (local) da própria linha. Devolve null se
     não conseguir interpretar — nunca bloqueia a linha, hora_venda_texto
     fica sempre gravado tal qual, com ou sem data_hora calculada. */
  function procParseHoraVendaPrimavera(dataBase, horaTexto) {
    if (!horaTexto) return null;
    var m = String(horaTexto).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    var dh = new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate(), h, min, 0);
    if (isNaN(dh.getTime())) return null;
    return dh.toISOString();
  }

  function procNumOuNullVenda(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  /* Mapeia uma linha bruta do Excel (array por indice de coluna) para
     o formato de gravacao em vendas_primavera. Devolve null se faltar
     loja, referencia ou data valida (linha descartada, nunca inventada). */
  function procMapearLinhaVendaPrimavera(row) {
    var loja = row[0] != null ? String(row[0]).trim() : '';
    var referencia = row[1] != null ? String(row[1]).trim() : '';
    var dataCell = row[11];
    var d = (dataCell instanceof Date) ? dataCell : null;
    if (!loja || !referencia || !d || isNaN(d.getTime())) return null;

    var dataISO = procDataVendaLocalISO(d);
    var horaTexto = row[12] != null ? String(row[12]).trim() : '';
    var dataHoraISO = procParseHoraVendaPrimavera(d, horaTexto);

    return {
      dia: dataISO,
      payload: {
        loja: loja,
        referencia: referencia,
        descricao: row[2] != null ? String(row[2]) : null,
        quantidade: procNumOuNullVenda(row[3]) || 0,
        valor_liquido: procNumOuNullVenda(row[4]),
        valor_bruto: procNumOuNullVenda(row[5]),
        valor_iva: procNumOuNullVenda(row[6]),
        descontos: procNumOuNullVenda(row[7]),
        custo: procNumOuNullVenda(row[8]),
        margem: procNumOuNullVenda(row[9]),
        perc_margem: procNumOuNullVenda(row[10]),
        data: dataISO,
        hora_venda_texto: horaTexto || null,
        data_hora: dataHoraISO
      }
    };
  }

  /* Le a folha inteira e agrupa as linhas por dia (chave "YYYY-MM-DD").
     Nunca ordena nem filtra por armazem — isso e feito mais tarde, no
     calculo de stock, nao aqui. */
  function procAgruparVendasPrimavera(arrayBuffer) {
    var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    var diasMap = {};
    var totalLinhas = 0, linhasIgnoradas = 0;

    for (var r = 1; r < linhas.length; r++) {
      var row = linhas[r] || [];
      if (!row.length) continue;
      var mapeada = procMapearLinhaVendaPrimavera(row);
      if (!mapeada) { linhasIgnoradas++; continue; }
      if (!diasMap[mapeada.dia]) diasMap[mapeada.dia] = [];
      diasMap[mapeada.dia].push(mapeada.payload);
      totalLinhas++;
    }

    return {
      diasMap: diasMap,
      totalLinhas: totalLinhas,
      linhasIgnoradas: linhasIgnoradas,
      totalDias: Object.keys(diasMap).length
    };
  }

  /* Insere as linhas de UM dia em blocos sequenciais (nunca em
     paralelo, para nao sobrecarregar o Supabase com ficheiros de
     100k+ linhas) e so no fim marca o dia como importado na tabela
     de controlo. Se falhar a meio, o dia fica por marcar — por isso
     uma nova tentativa mais tarde volta a inserir esse dia inteiro,
     nunca fica "meio importado" de forma invisivel. */
  function procInserirDiaVendas(dia, linhasPayload, log, cb) {
    var TAMANHO_LOTE = 2000;
    var pos = 0;

    function proximoLote() {
      if (pos >= linhasPayload.length) {
        procSbFetch('vendas_primavera_dias', {
          method: 'POST',
          headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify([{ data: dia, linhas: linhasPayload.length }])
        }).then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          cb(true);
        }).catch(function(e) {
          log('⚠ ' + dia + ': erro ao marcar dia como importado — ' + (e && e.message ? e.message : e));
          cb(false);
        });
        return;
      }
      var lote = linhasPayload.slice(pos, pos + TAMANHO_LOTE);
      pos += TAMANHO_LOTE;
      procSbFetch('vendas_primavera', {
        method: 'POST',
        headers: Object.assign(procSbHeaders(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(lote)
      }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        proximoLote();
      }).catch(function(e) {
        log('⚠ ' + dia + ': erro ao inserir linhas — ' + (e && e.message ? e.message : e));
        cb(false);
      });
    }
    proximoLote();
  }

  /* Motor de importacao: consulta UMA vez quais os dias ja existentes
     (tabela de controlo, pequena, consulta rapida mesmo com anos de
     historico acumulado), e depois processa os dias do ficheiro em
     ordem cronologica, sequencialmente, saltando os que ja existem. */
  function procImportarVendasPrimavera(diasMap, log, onDone) {
    var diasChaves = Object.keys(diasMap).sort();
    if (!diasChaves.length) { log('Nenhuma linha válida encontrada.'); onDone(); return; }

    procSbFetch('vendas_primavera_dias?select=data', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(existentes) {
        var jaImportados = {};
        (existentes || []).forEach(function(row) { jaImportados[row.data] = true; });

        var idx = 0;
        function proximoDia() {
          if (idx >= diasChaves.length) { onDone(); return; }
          var dia = diasChaves[idx++];
          if (jaImportados[dia]) {
            log('— ' + dia + ' já importado, ignorado.');
            proximoDia();
            return;
          }
          var linhasPayload = diasMap[dia];
          procInserirDiaVendas(dia, linhasPayload, log, function(ok) {
            if (ok) log('✓ ' + dia + ' — ' + linhasPayload.length + ' linha(s) importada(s).');
            proximoDia();
          });
        }
        proximoDia();
      })
      .catch(function(e) {
        log('⚠ Erro ao consultar dias já importados: ' + (e && e.message ? e.message : e));
        onDone();
      });
  }

  /* Busca todas as paginas de um endpoint PostgREST, contornando o
     limite por omissao de 1000 linhas por pedido — sem isto, qualquer
     tabela com mais de 1000 linhas fica silenciosamente cortada. */
  function procFetchTodasPaginas(pathBase) {
    var TAMANHO_PAGINA = 1000;
    var tudo = [];
    function proximaPagina(offset) {
      var sep = pathBase.indexOf('?') === -1 ? '?' : '&';
      return procSbFetch(pathBase + sep + 'limit=' + TAMANHO_PAGINA + '&offset=' + offset, { method: 'GET' })
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(pagina) {
          tudo = tudo.concat(pagina || []);
          if (!pagina || pagina.length < TAMANHO_PAGINA) return tudo;
          return proximaPagina(offset + TAMANHO_PAGINA);
        });
    }
    return proximaPagina(0);
  }

  /* Consulta a tabela de controlo vendas_primavera_dias (paginada, para
     nao ficar sujeita ao limite de 1000 linhas do PostgREST) para obter
     dias cobertos e intervalo de datas por ano, e em paralelo chama a
     funcao resumo_vendas_por_ano() (agregacao feita no Postgres) para
     obter o total de peças e o total líquido por ano a partir da tabela
     grande de vendas, sem transferir centenas de milhares de linhas
     para o browser. Serve para verificar rapidamente se uma importação
     ficou completa. */
  function procVerResumoVendasPorAno(container) {
    container.innerHTML = '<p style="font-size:.8rem;color:#888;">A consultar…</p>';
    Promise.all([
      procFetchTodasPaginas('vendas_primavera_dias?select=data&order=data.asc'),
      procSbFetch('rpc/resumo_vendas_por_ano', { method: 'POST', body: JSON.stringify({}) })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; })
    ]).then(function(res) {
        var diasRows = res[0] || [];
        var rpcRows  = res[1];
        if (!diasRows.length) {
          container.innerHTML = '<p style="font-size:.8rem;color:#888;">Ainda não há nada importado.</p>';
          return;
        }
        var porAno = {}; /* ano → { dias, min, max, pecas, liquido } */
        diasRows.forEach(function(row) {
          var ano = String(row.data).slice(0, 4);
          if (!porAno[ano]) porAno[ano] = { dias: 0, min: row.data, max: row.data, pecas: null, liquido: null };
          porAno[ano].dias += 1;
          if (row.data < porAno[ano].min) porAno[ano].min = row.data;
          if (row.data > porAno[ano].max) porAno[ano].max = row.data;
        });
        var rpcFalhou = !rpcRows;
        if (rpcRows) {
          rpcRows.forEach(function(r) {
            var ano = String(r.ano);
            if (!porAno[ano]) porAno[ano] = { dias: 0, min: null, max: null, pecas: null, liquido: null };
            porAno[ano].pecas = Number(r.total_pecas) || 0;
            porAno[ano].liquido = Number(r.total_liquido) || 0;
          });
        }
        var anos = Object.keys(porAno).sort();
        function ddmmaaaa(iso) { return iso ? iso.split('-').reverse().join('/') : '—'; }
        var linhasHTML = anos.map(function(a) {
          var v = porAno[a];
          return '<tr><td>' + a + '</td>'
            + '<td class="center">' + (v.pecas === null ? '—' : v.pecas.toLocaleString('pt-PT')) + '</td>'
            + '<td class="center">' + (v.liquido === null ? '—' : procFormatarMoeda(v.liquido)) + '</td>'
            + '<td class="center">' + v.dias + '</td>'
            + '<td class="center">' + ddmmaaaa(v.min) + '</td>'
            + '<td class="center">' + ddmmaaaa(v.max) + '</td></tr>';
        }).join('');
        container.innerHTML = (rpcFalhou
            ? '<p style="font-size:.72rem;color:#c00;margin:0 0 8px;">⚠ Não foi possível obter Peças/Líquido (função resumo_vendas_por_ano ainda não existe em Supabase?). A mostrar apenas Dias/datas.</p>'
            : '')
          + '<table class="proc-or-table">'
          + '<thead><tr><th>Ano</th><th class="center">Peças</th><th class="center">Líquido</th><th class="center">Dias</th><th class="center">Primeiro dia</th><th class="center">Último dia</th></tr></thead>'
          + '<tbody>' + linhasHTML + '</tbody>'
          + '</table>';
      })
      .catch(function(e) {
        container.innerHTML = '<p style="font-size:.8rem;color:#c00;">Erro ao consultar: ' + (e && e.message ? e.message : e) + '</p>';
      });
  }

  function procMostrarModalImportadorVendas() {
    var old = document.getElementById('proc-import-vendas-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-import-vendas-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:560px;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Importar Vendas (Primavera)</span>'
      +       '<span class="proc-or-panel-title-sub">Deduplicado por dia — nunca duplica</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">✕ Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-panel-scroll" style="padding:20px;">'
      +     '<p style="font-size:.8rem;color:#555;line-height:1.5;margin:0 0 14px;">Cada dia do ficheiro é comparado com o que já está em Supabase — se o dia já existir, é ignorado por inteiro. Nada existente é alterado ou apagado.</p>'
      +     '<div style="margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #eee;">'
      +       '<button type="button" class="proc-btn" id="proc-vendas-resumo-btn">Ver resumo por ano</button>'
      +       '<div id="proc-vendas-resumo-body" style="margin-top:12px;"></div>'
      +     '</div>'
      +     '<input type="file" id="proc-import-vendas-file" accept=".xlsx" style="font-size:.8rem;">'
      +     '<div style="margin-top:14px;">'
      +       '<button class="proc-btn primary" id="proc-import-vendas-start-btn" disabled>Iniciar importação</button>'
      +     '</div>'
      +     '<div id="proc-import-vendas-log" style="display:none;font-family:monospace;font-size:.7rem;white-space:pre-wrap;max-height:320px;overflow-y:auto;background:#f7f7f7;border-radius:8px;padding:10px;margin-top:14px;"></div>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    var resumoBtn  = document.getElementById('proc-vendas-resumo-btn');
    var resumoBody = document.getElementById('proc-vendas-resumo-body');
    if (resumoBtn) resumoBtn.addEventListener('click', function() { procVerResumoVendasPorAno(resumoBody); });

    var fileInput = document.getElementById('proc-import-vendas-file');
    var startBtn  = document.getElementById('proc-import-vendas-start-btn');
    var logEl     = document.getElementById('proc-import-vendas-log');
    var arquivoSelecionado = null;

    fileInput.addEventListener('change', function() {
      arquivoSelecionado = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
      startBtn.disabled = !arquivoSelecionado;
    });

    function log(msg) {
      logEl.style.display = 'block';
      logEl.textContent += (logEl.textContent ? '\n' : '') + msg;
      logEl.scrollTop = logEl.scrollHeight;
    }

    startBtn.addEventListener('click', function() {
      if (!arquivoSelecionado) return;
      startBtn.disabled = true;
      fileInput.disabled = true;
      log('A carregar ficheiro…');
      var reader = new FileReader();
      reader.onload = function(e) {
        procCarregarSheetJS().then(function() {
          log('A processar Excel…');
          var resultado;
          try {
            resultado = procAgruparVendasPrimavera(e.target.result);
          } catch (err) {
            log('⚠ Erro ao processar o Excel: ' + (err && err.message ? err.message : err));
            return;
          }
          if (resultado.linhasIgnoradas) log('⚠ ' + resultado.linhasIgnoradas + ' linha(s) ignorada(s) por falta de loja/referência/data válida.');
          log(resultado.totalDias + ' dia(s) encontrados · ' + resultado.totalLinhas + ' linha(s). A comparar com o Supabase e a importar…');
          procImportarVendasPrimavera(resultado.diasMap, log, function() {
            log('✓ Concluído.');
          });
        }).catch(function() {
          log('⚠ Não foi possível carregar a biblioteca de leitura de Excel.');
        });
      };
      reader.onerror = function() { log('⚠ Erro ao ler o ficheiro.'); };
      reader.readAsArrayBuffer(arquivoSelecionado);
    });
  }

  function procAbrirImportadorVendas() {
    var senha = window.prompt('Esta ação requer a senha de administrador:');
    if (senha === null) return;
    procValidarAdmin(senha).then(function(ok) {
      if (!ok) { window.alert('Senha incorrecta.'); return; }
      procMostrarModalImportadorVendas();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     IMPORTACAO AUTOMATICA DE FACTURAS TAM (tam_sessions → proc_sessoes)
     Corre sozinha, sem botao, sempre que a aplicacao inicia. So traz
     facturas de TAM que ja tenham numero de guia ERP preenchido (ou
     seja, ja fechadas) e cuja data seja a partir de 18/08/2026 — nunca
     nada anterior, porque tudo o que e anterior a essa data ja foi
     trazido manualmente pelo importador do Excel. Nunca escreve nem
     alterar nada em tam_sessions (so le); nunca toca em sentRefs, por
     isso nao interfere com o que "PENDENTES DE OUTRAS SESSOES" ja
     deteta correctamente como por enviar na guia de transporte.
     Reaproveita procImportarSessoesHistorico — a mesma logica seguem de
     nunca sobrescrever, nunca duplicar (fornecedor+guia+semana) usada
     no importador do Excel. */
  var TAM_IMPORT_CUTOFF = new Date(2026, 7, 18); /* 18 de Agosto de 2026 */

  /* Excecao pontual e exclusiva: estas duas facturas TAM ficaram
     pendentes de distribuicao porque as caixas so chegaram fisicamente
     a 26/08/2026, data em que finalmente ganharam guia ERP. Sao
     anteriores ao corte geral acima, por isso sem esta lista o
     importador automatico nunca as traria. O match exige DATA e GUIA
     identicos em simultaneo — nunca deixa passar nenhuma outra
     factura, mesmo que partilhe a mesma data ou a mesma guia
     isoladamente. Nao precisa de remocao manual depois de importadas:
     a deduplicacao normal (proveedor+guia+semana) torna-a inofensiva
     em qualquer execucao futura. */
  var TAM_IMPORT_EXCECOES = [
    { data: '14.08.2026', guia: '210' },
    { data: '17.08.2026', guia: '211' },
    { data: '21.08.2026', guia: '220' }
  ];

  /* "DD.MM.YYYY" → segunda-feira dessa semana, calculada com getters
     LOCAIS (nunca toISOString()/getUTC*) — mesma correccao critica de
     fuso horario aplicada ao importador do Excel. */
  function procDataTamParaSegunda(dataStr) {
    if (!dataStr) return null;
    var m = String(dataStr).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    var d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (isNaN(d.getTime())) return null;
    var diaSemana = d.getDay();
    var diff = (diaSemana === 0) ? -6 : (1 - diaSemana);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  }

  /* Mapeia os artigos (grouped) de uma factura TAM para o formato de
     linha do Processamento — FNC/PXO vem da soma das caixas que
     pertencem A ESTA FACTURA (box.invIdx === invIndex), nunca de
     todas as caixas da sessao — uma sessao TAM pode conter varias
     facturas, e cada caixa esta marcada com o indice da factura a que
     pertence; sem este filtro, referencias repetidas noutra factura
     da mesma sessao contaminavam a distribuicao desta. Preco e o
     custo puro sem transporte (totalCost/pieces — o unitPriceWithShip
     ja traz o transporte prorrateado, e isso e um mecanismo proprio
     do Processamento via Transp./Desc., nunca deve vir ja embutido).
     semPvp:true porque estas pecas vem a preco de fabrica, sem PVP
     nem margem aplicavel. */
  /* Ajuste de centimos — MESMA logica ja usada e confiavel do modal
     "Ingresso de Stock · ERP" (procShowStockModal): arredonda cada
     preco a 2 casas e depois reparte os centimos de diferenca residual
     (linha a linha, das menores quantidades para as maiores) ate a
     soma bater exactamente com o valor declarado da factura. Reaproveita
     o mesmo algoritmo, nao inventa nenhum novo — so o aplica mais cedo,
     no momento da importacao, para que a factura ja fique quadrada
     desde a origem, exactamente como o Ingresso de Stock ja mostra. */
  function procAjustarCentimosParaTotal(linhas, valorTotal) {
    if (!(valorTotal > 0) || !linhas.length) return;
    linhas.forEach(function(l) { l.preco = Math.round(l.preco * 100) / 100; });
    var somaAtual = linhas.reduce(function(s, l) { return s + Math.round(l.preco * l.qtdFt * 100) / 100; }, 0);
    var diffCents = Math.round((valorTotal - somaAtual) * 100);
    if (diffCents === 0) return;
    var ordenado = linhas.slice().sort(function(a, b) { return a.qtdFt - b.qtdFt; });
    for (var i = 0; i < ordenado.length && diffCents !== 0; i++) {
      var l = ordenado[i];
      var sign = diffCents > 0 ? 1 : -1;
      var after = diffCents - sign * l.qtdFt;
      if (Math.abs(after) <= Math.abs(diffCents)) {
        l.preco = Math.round((l.preco + sign * 0.01) * 100) / 100;
        diffCents = after;
      }
    }
  }

  function procMapearLinhasFacturaTam(sessionData, inv, invIndex) {
    var boxes = (sessionData.boxes || []).filter(function(box) { return box.invIdx === invIndex; });
    var linhas = [];
    (inv.grouped || []).forEach(function(g) {
      if (!g.ref) return;
      var distF = 0, distP = 0;
      boxes.forEach(function(box) {
        if (box.refs && box.refs[g.ref]) {
          distF += box.refs[g.ref].f || 0;
          distP += box.refs[g.ref].p || 0;
        }
      });
      var pieces = g.pieces || 0;
      var a4 = distF, a5 = distP;
      /* Sem distribuicao registada nas caixas — nunca perde a
         quantidade, atribui tudo a Funchal por omissao. */
      if (a4 === 0 && a5 === 0 && pieces > 0) a4 = pieces;
      /* Preco: g.grandTotal e o valor total que a TAM ja da para esta
         referencia (a soma de todos os g.grandTotal de uma factura
         reconstroi exactamente o valor total da factura, inv.grandTotal
         — verificado). E o unico campo copiado sem qualquer desvio.
         Divide-se por pieces so porque a grelha do Processamento guarda
         preco por unidade, nunca um total por linha — nao e um calculo
         de negocio, e o minimo necessario para encaixar o mesmo valor
         no formato da grelha. */
      var preco = pieces > 0 ? (g.grandTotal != null ? g.grandTotal : (g.totalCost || 0)) / pieces : 0;
      var desc  = g.garmentType ? (g.garmentType + (g.name ? ' \u00b7 ' + g.name : '')) : (g.name || '');
      linhas.push({
        ref: String(g.ref).trim(), desc: desc, qtdFt: pieces, a4: a4, a5: a5,
        preco: preco, descPct: 0, hasD: false, plus1: false, obs: '', flagged: false,
        pvpManual: null, semPvp: true
      });
    });
    procAjustarCentimosParaTotal(linhas, inv.grandTotal);
    return linhas;
  }

  function procImportarTamAutomatico() {
    procSbFetch('tam_sessions?select=session_name,data', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var sessionsMap = {};
        (rows || []).forEach(function(row) {
          var data;
          try { data = JSON.parse(row.data); } catch (e) { return; }
          if (!data || !data.invoices) return;
          data.invoices.forEach(function(inv, invIndex) {
            var guia = (inv.guiaErp || '').toString().trim();
            if (!guia) return;
            var segunda = procDataTamParaSegunda(inv.invoiceDate);
            if (!segunda) return;
            var eExcecao = TAM_IMPORT_EXCECOES.some(function(ex) { return ex.data === inv.invoiceDate && ex.guia === guia; });
            if (segunda < TAM_IMPORT_CUTOFF && !eExcecao) return;
            var linhas = procMapearLinhasFacturaTam(data, inv, invIndex);
            if (!linhas.length) return;
            var dataISO = segunda.getFullYear() + '-' + String(segunda.getMonth() + 1).padStart(2, '0') + '-' + String(segunda.getDate()).padStart(2, '0');
            var sessionKey = 'proc_fatura_' + dataISO;
            if (!sessionsMap[sessionKey]) sessionsMap[sessionKey] = [];
            sessionsMap[sessionKey].push({
              proveedor: 'TAM',
              proveedorNorm: procNormalize('TAM'),
              valorFactura: (inv.grandTotal != null) ? String(inv.grandTotal) : '',
              guiaErp: guia,
              rows: linhas
            });
          });
        });
        if (!Object.keys(sessionsMap).length) return;
        procImportarSessoesHistorico(sessionsMap, function(msg) { console.log('[proc][tam-auto]', msg); }, function() {});
      })
      .catch(function(e) { console.warn('[proc] erro ao importar facturas TAM automaticamente:', e); });
  }

  /* ══════════════ IMPORTACAO AUTOMATICA — PARFOIS ══════════════
     Mesmo mecanismo do TAM acima (mesmo corte TAM_IMPORT_CUTOFF,
     18/08/2026, reaproveitado tal e qual), com as diferencas proprias
     do modulo Parfois: data no formato "DD/MM/AAAA" (barras, nao
     pontos); armazem sempre fixo em A5 — Parfois nao distribui por
     caixas F/P como o TAM, por isso a4 fica sempre 0 e a5 recebe toda
     a quantidade; preco ja vem pronto como preco unitario por
     referencia (unitPrice), sem calculo nenhum. semPvp:true em todas
     as linhas, pelo mesmo motivo do TAM (preco de fabrica, sem margem
     de venda aplicavel). Nunca escreve nem altera nada em
     parfois_sessions (so le). Reaproveita procImportarSessoesHistorico,
     a mesma logica de nunca sobrescrever nem duplicar. */

  /* "DD/MM/AAAA" → segunda-feira dessa semana, com getters LOCAIS
     (nunca toISOString()/getUTC*). */
  function procDataParfoisParaSegunda(dataStr) {
    if (!dataStr) return null;
    var m = String(dataStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (isNaN(d.getTime())) return null;
    var diaSemana = d.getDay();
    var diff = (diaSemana === 0) ? -6 : (1 - diaSemana);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  }

  /* Le os items do engine activo da factura (o mesmo que pfGetActiveResult
     usaria no proprio parfois.js: activeEngines[fileName] || autoEngine
     || 'A', com fallback para o cache 'A') e mapeia para o formato de
     linha do Processamento. */
  function procMapearLinhasFacturaParfois(sessionData, inv) {
    var linhas = [];
    if (!inv.engineCache) return linhas;
    var activeEngines = (sessionData && sessionData.activeEngines) || {};
    var label = activeEngines[inv.fileName] || inv.autoEngine || 'A';
    var cached = inv.engineCache[label] || inv.engineCache.A;
    var items = (cached && cached.items) || [];
    items.forEach(function(it) {
      if (!it.ref) return;
      var qty = it.qty || 0;
      linhas.push({
        ref: String(it.ref).trim(), desc: it.desc || '', qtdFt: qty, a4: 0, a5: qty,
        preco: it.unitPrice || 0, descPct: 0, hasD: false, plus1: false, obs: '', flagged: false,
        pvpManual: null, semPvp: true
      });
    });
    return linhas;
  }

  function procImportarParfoisAutomatico() {
    procSbFetch('parfois_sessions?select=session_name,data', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var sessionsMap = {};
        (rows || []).forEach(function(row) {
          var data;
          try { data = JSON.parse(row.data); } catch (e) { return; }
          if (!data || !data.invoices) return;
          data.invoices.forEach(function(inv) {
            var guia = (inv.guiaErp || '').toString().trim();
            if (!guia) return;
            var segunda = procDataParfoisParaSegunda(inv.invoiceDate);
            if (!segunda || segunda < TAM_IMPORT_CUTOFF) return;
            var linhas = procMapearLinhasFacturaParfois(data, inv);
            if (!linhas.length) return;
            var dataISO = segunda.getFullYear() + '-' + String(segunda.getMonth() + 1).padStart(2, '0') + '-' + String(segunda.getDate()).padStart(2, '0');
            var sessionKey = 'proc_fatura_' + dataISO;
            if (!sessionsMap[sessionKey]) sessionsMap[sessionKey] = [];
            sessionsMap[sessionKey].push({
              proveedor: 'PARFOIS',
              proveedorNorm: procNormalize('PARFOIS'),
              valorFactura: (inv.totalEur != null) ? String(inv.totalEur) : '',
              guiaErp: guia,
              rows: linhas
            });
          });
        });
        if (!Object.keys(sessionsMap).length) return;
        procImportarSessoesHistorico(sessionsMap, function(msg) { console.log('[proc][parfois-auto]', msg); }, function() {});
      })
      .catch(function(e) { console.warn('[proc] erro ao importar facturas Parfois automaticamente:', e); });
  }

  /* Vincula retroactivamente a guia ERP as referencias ja criadas para
     esta factura (proveedor + referencias/categorias das linhas actuais).
     Chamada quando o utilizador preenche o campo "Guia ERP". Falha
     silenciosa: nunca deve bloquear o fluxo normal da factura. */
  function procVincularGuiaReferencias(fid, guia) {
    guia = (guia || '').toString().trim();
    if (!guia) return;
    var pEl = document.getElementById('proc-proveedor-' + fid);
    var fornecedor = pEl ? pEl.value.trim() : '';
    if (!fornecedor) return;
    var proveedorNorm = procNormalize(fornecedor);
    if (!proveedorNorm) return;

    Promise.all([procLoadFornecedorInfo(fornecedor), procLoadCategoriasRemote()])
      .then(function(res) {
        var info = res[0], categorias = res[1];
        if (!info || !info.codigo) return null;

        var rows = typeof procCollectRows === 'function' ? procCollectRows(fid) : [];
        var ano = new Date().getFullYear() % 100;
        var chaves = {};
        rows.forEach(function(r) {
          if (!r || !r.ref) return;
          var refNorm = procNormalizarRefOriginal(r.ref);
          if (!refNorm) return;
          var categoria = procResolverCategoria(r.desc, categorias);
          chaves[refNorm + '|' + categoria] = true;
        });
        var listaChaves = Object.keys(chaves);
        if (!listaChaves.length) return null;

        return procSbFetch(
          'proc_referencias?proveedor=eq.' + encodeURIComponent(proveedorNorm)
            + '&ano=eq.' + ano
            + '&select=referencia_interna,referencia_original,categoria',
          { method: 'GET' }
        )
          .then(function(r2) { return r2.ok ? r2.json() : []; })
          .then(function(todasDoAno) {
            var referenciasParaLigar = (todasDoAno || [])
              .filter(function(row) { return chaves.hasOwnProperty(row.referencia_original + '|' + row.categoria); })
              .map(function(row) { return row.referencia_interna; });
            if (!referenciasParaLigar.length) return null;
            return procSbFetch('rpc/proc_asignar_guia_referencias', {
              method: 'POST',
              body: JSON.stringify({ p_proveedor: proveedorNorm, p_referencias: referenciasParaLigar, p_guia: guia })
            });
          });
      })
      .catch(function() { /* falha silenciosa — nunca bloqueia o fluxo da factura */ });
  }


  /* ── 2c. MOTOR DE SUGESTÕES DE DESCRIÇÕES ── */
  /* Estrutura compacta: TIPOS base + MODIFICADORES → combinações dinâmicas
     Nível 1 – "ca"        → tipos que começam com CA
     Nível 2 – "calça "    → CALÇA + todos os modificadores
     Nível 3 – "calça li"  → CALÇA + modificadores que começam com LI
     Nível 4 – "calça linho r" → CALÇA LINHO + segundo modificador com R  */

  var DESC_TIPOS = [
    /* ── Português ── */
    'ALFINETE','BIQUÍNI','BLAZER','BLUSA','BLUSÃO','BODY','BOLERO',
    'BOTAS','BOTINS','BRINCOS','CACHECOL','CALÇA','CALÇAS','CALÇÃO',
    'CAMISA','CAMISEIRO','CAMISETA','CAMISOLA','CARDIGAN','CARTEIRA',
    'CASACO','CHAPÉU','CHINELOS','CINTO','CLUTCH','COLAR','COLETE',
    'CONJUNTO','CROP TOP','CUECA','DERBY','FATO','FATO DE BANHO',
    'JARDINEIRAS','KIMONO','LEGGING','LENÇO','LEOTARD','MACACO',
    'MACAQUINHO','MALA','MINI SAIA','MOCHILA','PANTUFA','PAREO',
    'PASHMINA','PIJAMA','PIRATA','POLO','PONCHO','PULSEIRA','REGATA',
    'SABRINAS','SAIA','SANDÁLIA','SAPATILHAS','SAPATO','SHOPPER',
    'SINGLET','SWEATSHIRT','T-SHIRT','TOP','TÚNICA','VESTIDO','FATO DE BANHO CRIANÇA','CUECA CRIANÇA','BIQUÍNI CRIANÇA',
    /* ── English ── */
    'BIKINI','BOOTS','COAT','DRESS','HOODIE','JACKET',
    'JEANS','JUMPSUIT','LEGGINGS','PANTS','ROMPER','SANDALS',
    'SCARF','SHIRT','SHOES','SHORTS','SKIRT','SNEAKERS',
    'SUIT','SWEATER','SWIMSUIT','TANK TOP','TRENCH COAT','VEST'
  ];

  var DESC_MODS = [
    /* ── Tecidos / Materiais ── */
    'ALGODÃO','BOMBAZINE','CAMBRAIA','CAMURÇA','CANELADO','CETIM',
    'CROCHET','ELASTICO','FELPA','FELTRO','FIO','GANGA','IMIT LINHO',
    'JEANS','LICRA','LINHO','LUREX','MALHA','METALIZADO','MOHAIR',
    'MUSSELINA','NAPA','NYLON','ORGANZA','OXFORD','PELO','POLIPELE',
    'POPELINE','SARJA','SEDA','STRASS','TECIDO','TULE','TWILL',
    'VELUDO','VOILE',
    /* ── Estampados / Padrões ── */
    'AFRICANO','ANIMAL','DEGRADÊ','ESTAMPADO','ÉTNICA',
    'FLORES','GEOMÉTRICO','LEOPARDO','LISO','PADRÃO',
    'PRINT','PRINT FLORES','PRINT LEOPARDO','RISCAS','TRACADO',
    'XADREZ','ZIG ZAG',
    /* ── Detalhes / Acabamentos ── */
    'ABERTO','APLICAÇÃO','ASSIMÉTRICA','BABADO','BALÃO','BARCA',
    'BICO','BICOLOR','BOLSO','BORDADO','BOTÃO','BRILHO','C/APLICAÇÃO',
    'C/BOTÃO','C/CINTO','C/FLORES','C/LANTEJOULAS','C/LAÇO','C/RENDA',
    'C/ZIP','CARGO','CAVA','CINTO','CLÁSSICO','COMPRIDA','COS',
    'CROPPED','CURTA','DESPORTIVO','DOURADO','DUPLO','ESPIGA',
    'FARRIPAS','FINO','FOLHO','FRANJAS','FRANZIDA','FRANZIDO',
    'FUROS','GOLA','HOMEM','LANTEJOULAS','LAÇO','LARGA','LAVAGEM',
    'M/COMPRIDA','M/CURTA','MANGA','MIDI','MISSANGA','NERVURA',
    'OVERSIZE','PENA','PÉROLAS','PLISSADA','PREGAS','PUNHO','RACHA',
    'RELEVO','RENDA','SLIM','TAXA','TRANSPARENTE','TRANÇA','TUBO',
    'ZIP',
    /* ── English modifiers ── */
    'ANIMAL PRINT','BASIC','BOHO','CLASSIC','DENIM','EMBROIDERED',
    'FLORAL','FLOWY','FRINGE','GRAPHIC','KNIT','LACE','LINEN',
    'LONG','LOOSE','MINI','OVERSIZED','PLAID','PLEATED','PRINTED',
    'RIBBED','SHORT','SLIM FIT','STRIPED','VELVET','WRAP',
    /* ── Público / faixa etária ── */
    'CRIANÇA','BEBÉ','INFANTIL','JÚNIOR','ADULTO'
  ];

  /* Tabelas normalizadas pré-calculadas (evita normalizar em cada keystroke) */
  var _DESC_TIPOS_N = DESC_TIPOS.map(function(t){ return procNormalizeDesc(t); });
  var _DESC_MODS_N  = DESC_MODS.map(function(m){ return procNormalizeDesc(m); });

  /* Índice de tipos ordenado por comprimento desc para matching guloso (ex: "FATO DE BANHO" antes de "FATO") */
  var _DESC_TIPOS_IDX = DESC_TIPOS
    .map(function(t,i){ return i; })
    .sort(function(a,b){ return _DESC_TIPOS_N[b].length - _DESC_TIPOS_N[a].length; });

  function procNormalizeDesc(s) {
    return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Corrección silenciosa: normaliza el input y busca la mejor coincidencia
     en DESC_TIPOS y DESC_MODS. Si la distancia de edición es <= 2 caracteres,
     reemplaza sin avisar al usuario. */
  function procSilentCorrectDesc(raw) {
    var parts = raw.trim().toUpperCase().split(/\s+/);
    var correctedParts = parts.map(function(part, idx) {
      var partN = procNormalizeDesc(part);
      /* Buscar en TIPOS (solo en primera palabra) o MODS */
      var candidates = idx === 0 ? DESC_TIPOS.concat(DESC_MODS) : DESC_MODS;
      var candidatesN = idx === 0 ? _DESC_TIPOS_N.concat(_DESC_MODS_N) : _DESC_MODS_N;
      var bestDist = 2; /* umbral máximo */
      var bestMatch = null;
      for (var i = 0; i < candidatesN.length; i++) {
        var cn = candidatesN[i];
        if (Math.abs(cn.length - partN.length) > 1) continue;
        var d = procLevenshtein(partN, cn);
        if (d < bestDist) { bestDist = d; bestMatch = candidates[i]; }
        if (d === 0) break; /* coincidencia exacta */
      }
      return (bestDist <= 1 && bestMatch) ? bestMatch : part;
    });
    var result = correctedParts.join(' ');
    return result !== raw.toUpperCase() ? result : null;
  }

  function procLevenshtein(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; }
    for (var j = 0; j <= n; j++) { dp[0][j] = j; }
    for (var i2 = 1; i2 <= m; i2++) {
      for (var j2 = 1; j2 <= n; j2++) {
        dp[i2][j2] = a[i2-1] === b[j2-1]
          ? dp[i2-1][j2-1]
          : 1 + Math.min(dp[i2-1][j2], dp[i2][j2-1], dp[i2-1][j2-1]);
      }
    }
    return dp[m][n];
  }

  function procFindDescMatches(raw) {
    if (!raw || raw.length < 1) return [];
    var q = procNormalizeDesc(raw.trim());

    /* ── Tentar encontrar TIPO já completo no início da query ── */
    var foundTipoIdx  = -1;
    var modQuery      = '';

    for (var si = 0; si < _DESC_TIPOS_IDX.length; si++) {
      var ti  = _DESC_TIPOS_IDX[si];
      var tn  = _DESC_TIPOS_N[ti];
      /* TIPO seguido de espaço → utilizador está a escrever modificador */
      if (q.indexOf(tn + ' ') === 0) {
        foundTipoIdx = ti;
        modQuery     = q.slice(tn.length + 1);
        break;
      }
      /* TIPO exato sem mais nada → sugerir modificadores sem filtro */
      if (q === tn) {
        foundTipoIdx = ti;
        modQuery     = '';
        break;
      }
    }

    if (foundTipoIdx >= 0) {
      var tipo = DESC_TIPOS[foundTipoIdx];

      /* ── Nível 3/4: TIPO já fixo — verificar se MOD1 também está completo ── */
      var foundModIdx = -1;
      var mod2Query   = '';
      for (var mi = 0; mi < _DESC_MODS_N.length; mi++) {
        var mn = _DESC_MODS_N[mi];
        if (modQuery.indexOf(mn + ' ') === 0) {
          foundModIdx = mi;
          mod2Query   = modQuery.slice(mn.length + 1);
          break;
        }
        if (modQuery === mn) {
          foundModIdx = mi;
          mod2Query   = '';
          break;
        }
      }

      if (foundModIdx >= 0) {
        /* Nível 4: TIPO + MOD1 fixos → sugerir segundo modificador */
        var mod1    = DESC_MODS[foundModIdx];
        var starts4 = [], cont4 = [];
        for (var k = 0; k < _DESC_MODS_N.length; k++) {
          if (k === foundModIdx) continue;
          if (!mod2Query || _DESC_MODS_N[k].indexOf(mod2Query) === 0) {
            starts4.push(tipo + ' ' + mod1 + ' ' + DESC_MODS[k]);
          } else if (mod2Query && _DESC_MODS_N[k].indexOf(mod2Query) !== -1) {
            cont4.push(tipo + ' ' + mod1 + ' ' + DESC_MODS[k]);
          }
        }
        /* Incluir a combinação só com MOD1 se não houver mod2 digitado */
        var results4 = !mod2Query ? [tipo + ' ' + mod1] : [];
        return results4.concat(starts4).concat(cont4).slice(0, 8);
      }

      /* Nível 2/3: TIPO fixo → filtrar modificadores */
      var mq      = modQuery;
      var starts3 = [], cont3 = [];
      for (var j = 0; j < _DESC_MODS_N.length; j++) {
        if (!mq || _DESC_MODS_N[j].indexOf(mq) === 0) {
          starts3.push(tipo + ' ' + DESC_MODS[j]);
        } else if (mq && _DESC_MODS_N[j].indexOf(mq) !== -1) {
          cont3.push(tipo + ' ' + DESC_MODS[j]);
        }
      }
      /* Incluir tipo sozinho no topo quando nada ainda digitado como mod */
      var results3 = (!mq ? [tipo] : []).concat(starts3).concat(cont3);
      return results3.slice(0, 8);
    }

    /* ── Nível 1: utilizador ainda a escrever o TIPO ── */
    var starts1 = [], cont1 = [];
    for (var ii = 0; ii < _DESC_TIPOS_N.length; ii++) {
      if (_DESC_TIPOS_N[ii].indexOf(q) === 0)        starts1.push(DESC_TIPOS[ii]);
      else if (_DESC_TIPOS_N[ii].indexOf(q) !== -1)  cont1.push(DESC_TIPOS[ii]);
    }
    return starts1.concat(cont1).slice(0, 8);
  }

  function procTableIsUnlocked(fid) {
    var pEl = document.getElementById('proc-proveedor-' + fid);
    var vEl = document.getElementById('proc-valorFactura-' + fid);
    var pVal = pEl ? pEl.value.trim() : '';
    var vVal = vEl ? parseFloat(vEl.value) : 0;
    return pVal.length > 0 && vVal > 0;
  }

  function procUpdateTableLock(fid) {
    var lock  = document.getElementById('proc-table-lock-' + fid);
    var block = document.getElementById('proc-table-block-' + fid);
    if (!lock || !block) return;
    var unlocked = procTableIsUnlocked(fid);
    lock.style.display  = unlocked ? 'none'  : 'flex';
    block.style.display = unlocked ? 'block' : 'none';
    if (unlocked) procInitTableKeyboard(fid);
  }

  function procInitProviderInput(fid) {
    var input = document.getElementById('proc-proveedor-' + fid);
    var sugg  = document.getElementById('proc-forn-sugg-' + fid);
    if (!input || !sugg) return;

    /* Guarda o nome com que se começou a editar, para no "blur" se poder
       comparar com o nome final e detectar uma correcção/troca de
       fornecedor (ex.: escreveu "REN KE ZHONG" por engano e corrigiu
       para "CHLAMYS VARIA"). */
    input.addEventListener('focus', function() {
      input.dataset.prevValue = input.value.trim();
    });

    input.addEventListener('click', function(e) {
      procTentarDesbloquearTabelaPorClique(fid, e);
    });

    input.addEventListener('input', function() {
      /* Força maiúsculas no valor real (não só visual), preservando a posição do cursor */
      var selStart = input.selectionStart, selEnd = input.selectionEnd;
      input.value = input.value.toUpperCase();
      try { input.setSelectionRange(selStart, selEnd); } catch(e) {}

      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
      var q = input.value.trim();
      if (!q) { sugg.classList.add('hidden'); return; }
      var matches = procFindMatches(q);
      if (!matches.length) { sugg.classList.add('hidden'); return; }
      sugg.innerHTML = matches.map(function(p) {
        return '<div class="proc-forn-item" data-val="' + p + '">' + p + '</div>';
      }).join('');
      sugg.classList.remove('hidden');
    });

    input.addEventListener('blur', function() {
      setTimeout(function() {
        sugg.classList.add('hidden');
        var raw = input.value.trim();
        if (!raw) return;
        /* Corrección automática si hay coincidencia suficiente */
        var exact = procFindExact(raw);
        if (exact) {
          if (procNormalize(raw) !== exact) {
            input.value = exact;
            procUpdateBannerProvider(fid);
            procUpdateTableLock(fid);
          }
        } else {
          /* Fornecedor novo — entra na biblioteca remota (Supabase) */
          procSaveFornecedorRemote(raw);
        }

        /* Se o nome mudou nesta edição, as referências internas geradas
           sob o nome ANTIGO para as linhas desta factura deixaram de
           corresponder a nada — nunca deviam ficar esquecidas em
           Supabase. Apaga-se aqui de imediato (com a mesma protecção
           contra outras facturas abertas que ainda usem esse nome
           antigo), sem depender de o utilizador reabrir o modal de
           Criação de Artigos. */
        var anterior = input.dataset.prevValue || '';
        var atual = input.value.trim();
        if (anterior && procNormalize(anterior) !== procNormalize(atual)) {
          procApagarReferenciasDaFatura(fid, anterior);
        }
        input.dataset.prevValue = atual;
      }, 180);
    });

    sugg.addEventListener('mousedown', function(e) {
      var item = e.target.closest('.proc-forn-item');
      if (!item) return;
      input.value = item.dataset.val;
      sugg.classList.add('hidden');
      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
    });
  }

  /* ── 3. SESSION HELPERS ── */
  var SESSION_PREFIX = 'proc_fatura_';

  function getMondayISO() {
    var d   = new Date();
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var m   = new Date(d);
    m.setDate(d.getDate() + diff);
    return m.toISOString().slice(0, 10);
  }

  /* Returns all keys for the current week (e.g. proc_fatura_2026-03-24, proc_fatura_2026-03-24_2, ...) */
  function getWeekKeys() {
    var monday = getMondayISO();
    var base   = SESSION_PREFIX + monday;
    var all    = getAllSessionKeys();
    return all.filter(function(k) { return k === base || k.indexOf(base + '_') === 0; });
  }

  /* Primary key for new saves this week (slot 1) */
  function getSessionKey() { return SESSION_PREFIX + getMondayISO(); }

  /* Next available key for this week */
  function getNextWeekKey() {
    var base  = SESSION_PREFIX + getMondayISO();
    var taken = getWeekKeys();
    if (!taken.length) return base;
    /* find highest suffix */
    var max = 1;
    taken.forEach(function(k) {
      if (k === base) { if (max < 1) max = 1; return; }
      var n = parseInt(k.replace(base + '_', ''), 10);
      if (!isNaN(n) && n >= max) max = n + 1;
    });
    if (taken.indexOf(base) === -1) return base;
    return base + '_' + max;
  }

  /* True se j\u00e1 existe alguma sess\u00e3o guardada para a semana corrente
     (chave base ou com sufixo _2, _3, ...). Usado para impedir a
     cria\u00e7\u00e3o de uma segunda sess\u00e3o na mesma semana. */
  function weekSessionExists() {
    return getWeekKeys().length > 0;
  }

  /* Current active save key (set when a session is loaded or a new one starts) */
  var _activeSessionKey = null;

  /* ══════════════════════════════════════════════════════════════
     SESSION LOCK — reutiliza el SessionLock global (session-lock.js).
     Comparte la tabla 'module_session_locks' en Supabase con otros
     módulos discriminando por module_name='processamento'.
     Si dos dispositivos abren EXACTAMENTE la misma sesión (mismo key),
     el nuevo expulsa al anterior y éste vuelve al dashboard.
  ══════════════════════════════════════════════════════════════ */
  var _procLock      = null;
  var _procLockedKey = null;

  function procGetLock() {
    if (!_procLock &&
        typeof SessionLock !== 'undefined' &&
        typeof sbAdmin     !== 'undefined' && sbAdmin) {
      _procLock = SessionLock.create('processamento', sbAdmin);
    }
    return _procLock;
  }

  /* Tomar el lock para una sesión. Idempotente para la misma sesión;
     si se cambia de sesión sin cerrar, libera la anterior primero. */
  function procLockAcquire(key) {
    if (!key) return;
    var lock = procGetLock();
    if (!lock) return;
    if (_procLockedKey === key) return;          /* ya la tenemos */
    if (_procLockedKey) { try { lock.release(); } catch (e) {} }  /* cambio de sesión */
    _procLockedKey = key;
    lock.acquire(key, procLockOnEvicted);
  }

  /* Liberar el lock (cierre normal: volver al dashboard, inactividad, etc.) */
  function procLockRelease() {
    _procLockedKey = null;
    var lock = procGetLock();
    if (lock) { try { lock.release(); } catch (e) {} }
  }

  /* Desalojo: otro dispositivo abrió la misma sesión.
     Guarda el trabajo, cierra la sesión y vuelve al dashboard.
     El toast lo muestra el propio SessionLock. */
  function procLockOnEvicted() {
    _procLockedKey = null;
    try { if (_isSynced && _activeSessionKey) procSaveSession(true); } catch (e) {}

    procHideFloatingButtons();
    _isSynced         = false;
    _activeSessionKey = null;
    _procInited       = false;
    faturaCount       = 0;
    activeFaturas     = [];
    Object.keys(rowCounts).forEach(function (k) { delete rowCounts[k]; });
    _procSentRefs = {};
    var cont = document.getElementById('proc-faturasContainer');
    if (cont) cont.innerHTML = '';

    function backToDashboard() {
      var backBtn = document.getElementById('adm-back-btn');
      if (backBtn) { backBtn._procBound = false; backBtn.click(); }
    }

    var overlay = document.getElementById('processamento-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(function () {
        overlay.classList.remove('open');
        backToDashboard();
      }, 650);
    } else {
      backToDashboard();
    }
  }

  function labelFromKey(key) {
    var stripped = key.replace(SESSION_PREFIX, '');
    /* detect suffix like _2, _3 */
    var suffix = '';
    var match  = stripped.match(/_(\d+)$/);
    if (match) {
      suffix  = ' (' + match[1] + ')';
      stripped = stripped.replace(/_\d+$/, '');
    }
    var p = stripped.split('-');
    return 'Semana ' + p[2] + '/' + p[1] + '/' + p[0] + suffix;
  }

  function getAllSessionKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SESSION_PREFIX) === 0) keys.push(k);
      }
    } catch(e) {}
    return keys.sort().reverse();
  }

  /* ── Agrupamento de sessoes antigas por mes/ano ──
     Para nao deixar a lista de sessoes eterna, so as do mes corrente
     ficam soltas (tal como sempre estiveram); tudo o que for de meses
     anteriores fica dentro de um bloco colapsavel por mes, e esse bloco
     leva o ano no rotulo sempre que for diferente do ano actual — assim,
     ao passar de ano, os grupos ja aparecem naturalmente separados por
     ano tambem, sem precisar de um nivel extra de encaixe. */
  var MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var _gruposSessaoExpandidos = {};

  function procMesAnoDeChave(key) {
    var stripped = key.replace(SESSION_PREFIX, '');
    var m = stripped.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { ano: parseInt(m[1], 10), mes: parseInt(m[2], 10) };
  }

  function procAgruparSessoesPorMes(keys) {
    var agora = new Date();
    var anoAtual = agora.getFullYear(), mesAtual = agora.getMonth() + 1;
    var soltas = [];
    var grupos = [];      /* meses do ano actual — soltos, tal como sempre foi */
    var gruposAno = [];   /* anos anteriores — cada um colapsavel, com os seus meses la dentro */
    var atualMes = null;
    var anosMap = {};

    /* Assume keys ja ordenadas (mais recente primeiro), tal como
       getAllSessionKeys() sempre devolveu — por isso um mesmo mes/ano
       aparece sempre em bloco contiguo, nunca espalhado. */
    keys.forEach(function(key) {
      var ref = procMesAnoDeChave(key);
      if (!ref) { soltas.push(key); return; }
      if (ref.ano === anoAtual && ref.mes === mesAtual) { soltas.push(key); return; }

      if (ref.ano === anoAtual) {
        var chaveMes = ref.ano + '-' + ref.mes;
        if (!atualMes || atualMes.chave !== chaveMes) {
          atualMes = { chave: chaveMes, label: MESES_PT[ref.mes - 1], keys: [] };
          grupos.push(atualMes);
        }
        atualMes.keys.push(key);
        return;
      }

      /* Ano diferente do actual: em vez de um bloco de mes solto por
         ano (que enchia a lista com dezenas de blocos quando ha varios
         anos de historico), fica tudo dentro de UM bloco colapsavel
         por ano, com os meses desse ano la dentro. */
      if (!anosMap[ref.ano]) {
        anosMap[ref.ano] = { chave: 'ano-' + ref.ano, label: String(ref.ano), keys: [], gruposMes: [], atualMes: null };
        gruposAno.push(anosMap[ref.ano]);
      }
      var bloco = anosMap[ref.ano];
      bloco.keys.push(key);
      var chaveMes2 = ref.ano + '-' + ref.mes;
      if (!bloco.atualMes || bloco.atualMes.chave !== chaveMes2) {
        bloco.atualMes = { chave: chaveMes2, label: MESES_PT[ref.mes - 1], keys: [] };
        bloco.gruposMes.push(bloco.atualMes);
      }
      bloco.atualMes.keys.push(key);
    });

    return { soltas: soltas, grupos: grupos, gruposAno: gruposAno };
  }

  /* Monta o cabecalho colapsavel comum aos dois sitios onde a lista de
     sessoes aparece (ecra inicial e menu "sessoes" da barra superior). */
  function procMontarGrupoSessaoHTML(grupo, itensHTML) {
    var aberto = !!_gruposSessaoExpandidos[grupo.chave];
    return '<div class="proc-session-group' + (aberto ? ' aberto' : '') + '" data-grupo="' + grupo.chave + '" onclick="event.stopPropagation()">'
      + '<div class="proc-session-group-header">'
      +   '<span>' + grupo.label + '</span>'
      +   '<span class="proc-session-group-count">' + grupo.keys.length + ' sessões <span class="proc-session-group-arrow">' + (aberto ? '▾' : '▸') + '</span></span>'
      + '</div>'
      + '<div class="proc-session-group-body">' + itensHTML + '</div>'
      + '</div>';
  }

  function procLigarGruposSessaoHTML(container) {
    container.querySelectorAll('.proc-session-group-header').forEach(function(h) {
      h.addEventListener('click', function(e) {
        e.stopPropagation();
        var grp = h.parentNode;
        var chave = grp.dataset.grupo;
        _gruposSessaoExpandidos[chave] = !_gruposSessaoExpandidos[chave];
        grp.classList.toggle('aberto', _gruposSessaoExpandidos[chave]);
        var arrow = h.querySelector('.proc-session-group-arrow');
        if (arrow) arrow.textContent = _gruposSessaoExpandidos[chave] ? '▾' : '▸';
      });
    });
  }

  /* ── GENERIC FLOATING MODAL HELPER ── */
  function procFloatModal(opts) {
    /* opts: { title, body, buttons: [{label, style, cb}] } */
    var overlay = document.createElement('div');
    overlay.className = 'proc-dlg-overlay';

    var panel = document.createElement('div');
    panel.className = 'proc-dlg-panel';

    var html = '';
    if (opts.label) html += '<div class="proc-dlg-label">' + opts.label + '</div>';
    if (opts.title) html += '<div class="proc-dlg-title">' + opts.title + '</div>';
    if (opts.body)  html += '<div class="proc-dlg-body">' + opts.body + '</div>';
    panel.innerHTML = html;

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

    opts.buttons.forEach(function(b) {
      var btn = document.createElement('button');
      var base = 'display:block;width:100%;padding:11px 16px;margin-bottom:8px;text-align:left;font-size:.88rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s;';
      btn.style.cssText = base + (b.style || 'background:#fff;border:1px solid #9DB6C9;color:#000;');
      btn.innerHTML = b.label;
      btn.onmouseenter = function(){ btn.style.filter='brightness(0.95)'; };
      btn.onmouseleave = function(){ btn.style.filter=''; };
      btn.onclick = function(){ close(); if (b.cb) b.cb(); };
      panel.appendChild(btn);
    });

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return { close: close };
  }

  function procBuildSavePayload() {
    if (!activeFaturas.length) return null;
    return {
      savedAt: new Date().toISOString(),
      /* sentRefs incluído aqui para que chegue ao Supabase e sobreviva
         a um reload desde remoto. _procSentRefs pode estar vazio ({})
         no início da sessão — isso é correcto. */
      sentRefs: _procSentRefs || {},
      faturas: activeFaturas.map(function(fid) {
        var rows = procCollectRows(fid).map(function(r) {
          return { ref:r.ref, desc:r.desc, qtdFt:r.qtdFt, a4:r.a4, a5:r.a5,
                   preco:r.preco, descPct:r.descPct, hasD:r.hasD, plus1:r.plus1, obs:r.obs, flagged:r.flagged, pvpManual:r.pvpManual, semPvp:r.semPvp };
        });
        var transpInput = document.getElementById('proc-transp-' + fid);
        var transpVal   = transpInput ? transpInput.value : '';
        var transpApplied = !!(transpInput && transpInput.disabled);
        var guiaCb = document.getElementById('proc-guia-include-' + fid);
        var guiaInclude = guiaCb ? guiaCb.checked : true;
        return {
          proveedor:    (document.getElementById('proc-proveedor-'    + fid) || {}).value || '',
          valorFactura: (document.getElementById('proc-valorFactura-' + fid) || {}).value || '',
          guiaErp:      (document.getElementById('proc-guia-erp-'     + fid) || {}).value || '',
          collapsed:    !!(document.getElementById('proc-fatura-' + fid) || {}).classList && (document.getElementById('proc-fatura-' + fid)).classList.contains('proc-collapsed'),
          transpTotal:   transpVal,
          transpApplied: transpApplied,
          guiaInclude:   guiaInclude,
          usaNomenclatura: _usaNomenclaturaPorFatura.hasOwnProperty(fid) ? _usaNomenclaturaPorFatura[fid] : true,
          dataCorrigida: _procDataCorrigidaPorFatura.hasOwnProperty(fid) ? _procDataCorrigidaPorFatura[fid] : null,
          rows: rows
        };
      })
    };
  }

    /* ── 4. SAVE / LOAD ── */
  var _procSaveDebounce = null;

  function procSaveSession(manual) {
    if (!_isSynced) {
      if (manual) procSetSyncStatus('syncing', 'a sincronizar…');
      return;
    }
    var key = _activeSessionKey || getSessionKey();
    _activeSessionKey = key;
    var payload = procBuildSavePayload();
    if (!payload) return;

    /* Always save to localStorage as offline fallback */
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch(e) {}
    if (manual) procSetSyncStatus('syncing', 'a guardar…');

    /* Debounce remote saves */
    clearTimeout(_procSaveDebounce);
    _procSaveDebounce = setTimeout(function() {
      procSbFetch('proc_sessoes', {
        method: 'POST',
        headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ session_key: key, dados: JSON.stringify(payload), updated_at: payload.savedAt })
      }).then(function(r) {
        if (r.ok) { procSetSyncStatus('ok', 'guardado'); }
        else { r.text().then(function(t) { console.error('PROC save error', t); procSetSyncStatus('error', 'erro ao guardar remotamente'); }); }
      }).catch(function() { procSetSyncStatus('offline', 'offline — guardado localmente'); });
    }, manual ? 0 : 800);
  }

  function procShowSaveStatus(msg) { procSetSyncStatus('ok', msg); }

  function procApplySessionData(key, raw, callback) {
    var data;
    try { data = JSON.parse(raw); } catch(e) {
      procFloatModal({ title: 'Erro ao interpretar sess\u00e3o.', buttons: [{ label: 'OK', cb: null }] });
      return;
    }
    var cont = document.getElementById('proc-faturasContainer');
    if (cont) cont.innerHTML = '';
    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
    _activeSessionKey = key;
    var faturas = data.faturas || [];
    if (!faturas.length) { procAddFatura(null); }
    else faturas.forEach(function(fd) { procAddFatura(fd); });
    /* Snapshot inicial para que o primeiro Ctrl+Z restaure este estado */
    setTimeout(procUndoSnapshot, 100);
    /* Elegibilidade da nova nomenclatura: sessoes antigas ficam marcadas
       usa_referencia_automatica=false na BD e nunca activam o gerador.
       Assincrono e nao-bloqueante — nao interfere no carregamento normal. */
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=usa_referencia_automatica', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var elegivel = !(rows && rows.length && rows[0].usa_referencia_automatica === false);
        window.procSetSessaoUsaReferenciaAutomatica(elegivel);
      })
      .catch(function() { window.procSetSessaoUsaReferenciaAutomatica(true); });
    if (callback) callback();
  }

  function procLoadSession(key) {
    procSetSyncStatus('syncing', 'a carregar…');
    procCloseSessionMenu();
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', 'sess\u00e3o carregada');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'carregado localmente');
        });
      });
  }

  /* ── 4a-bis. FORCE REMOTE LOAD (ignores localStorage cache) ── */
  function procForceLoadSession(key) {
    procSetSyncStatus('syncing', 'a actualizar\u2026');
    procCloseSessionMenu();
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : null;
        if (!raw) {
          raw = localStorage.getItem(key);
          if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
          procApplySessionData(key, raw, function() {
            procMarkSynced();
            procShowMainArea(key);
            procSetSyncStatus('offline', 'sem dados remotos \u2014 carregado localmente');
          });
          return;
        }
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', '\u2713 actualizado e carregado');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procFloatModal({ title: 'Sess\u00e3o n\u00e3o encontrada.', buttons: [{ label: 'OK', cb: null }] }); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'offline \u2014 carregado localmente');
        });
      });
  }

  function procDeleteSession(key) {
    procFloatModal({
      label: 'Eliminar sess\u00e3o',
      title: 'Tens a certeza?',
      body: 'Vais eliminar <strong>' + labelFromKey(key) + '</strong>. Esta a\u00e7\u00e3o \u00e9 irrevers\u00edvel.',
      buttons: [
        { label: '\u274c Eliminar definitivamente',
          style: 'background:#F5EAEA;border:1px solid #e8c5c5;color:#9B4D4D;font-weight:700;',
          cb: function() {
            var senha = window.prompt('Esta ac\u00e7\u00e3o requer a senha de administrador:');
            if (senha === null) return; /* cancelado */
            procValidarAdmin(senha).then(function(ok) {
              if (!ok) { window.alert('Senha incorrecta.'); return; }
              procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key), { method: 'DELETE' }).catch(function(){});
              try { localStorage.removeItem(key); } catch(e) {}
              if (_activeSessionKey === key) { _activeSessionKey = null; procLockRelease(); }
              procRenderSessionMenu();
            });
          }
        },
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #9DB6C9;color:#000;', cb: null }
      ]
    });
  }

  /* ── 4b. REMOTE KEY SYNC ── */
  function procLoadRemoteKeys(callback) {
    procSbFetch('proc_sessoes?select=session_key,updated_at&order=updated_at.desc', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        if (rows && rows.length) {
          rows.forEach(function(row) {
            if (!localStorage.getItem(row.session_key)) {
              try { localStorage.setItem(row.session_key, JSON.stringify({ savedAt: row.updated_at, faturas: [] })); } catch(e) {}
            }
          });
        }
        if (callback) callback();
      })
      .catch(function() { if (callback) callback(); });
  }

  /* ── 4c. SESSION PICKER MODAL ── */
  function procShowSessionPicker() {
    var overlay = document.createElement('div');
    overlay.id = 'proc-session-picker';
    overlay.className = 'proc-picker-overlay';

    var panel = document.createElement('div');
    panel.className = 'proc-picker-panel';

    panel.innerHTML =
      '<div class="proc-picker-header">'
      + '<div class="proc-picker-eyebrow">PROCESSAMENTO DE FATURAS</div>'
      + '<div class="proc-picker-title">Continua uma sess&#227;o ou inicia uma nova</div>'
      + '<div class="proc-picker-desc">Para evitar sobreescrever dados existentes, escolhe sempre a sess&#227;o correcta antes de come&#231;ar.</div>'
      + '</div>'
      + '<div id="proc-picker-body">'
      + '<div class="proc-picker-loading">&#8635; a carregar sess&#245;es&#8230;</div>'
      + '</div>';

    overlay.appendChild(panel);
    /* Not dismissable — user must make a choice */
    document.body.appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    var BTN_BASE = 'display:block;width:100%;padding:13px 16px;margin-bottom:8px;text-align:left;'
      + 'font-size:.88rem;font-weight:700;font-family:\'MontserratLight\',sans-serif;'
      + 'border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s,filter .12s;'
      + 'border:1px solid #9DB6C9;background:#fff;color:#000;line-height:1.5;';

    function hoverOn(b)  { b.style.filter = 'brightness(0.95)'; }
    function hoverOff(b) { b.style.filter = ''; }

    function sessionMeta(key) {
      var label = labelFromKey(key);
      var dateStr = '';
      var nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          dateStr = dt.toLocaleDateString('pt-PT') + ' \u00b7 ' + dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        }
        if (d && d.faturas) nFat = d.faturas.length + ' fat.';
      } catch(e) {}
      return { label: label, dateStr: dateStr, nFat: nFat };
    }

    function makeBtn(style, html) {
      var btn = document.createElement('button');
      btn.style.cssText = BTN_BASE + (style || '');
      btn.innerHTML = html;
      btn.addEventListener('mouseenter', function(){ hoverOn(btn); });
      btn.addEventListener('mouseleave', function(){ hoverOff(btn); });
      return btn;
    }

    function metaLine(m) {
      if (!m.dateStr && !m.nFat) return '';
      return '<br><span class="proc-meta-line">' + [m.dateStr, m.nFat].filter(Boolean).join(' \u00b7 ') + '</span>';
    }

    function loadKeyRemote(key, onDone) {
      procSetSyncStatus('syncing', 'a carregar\u2026');
      procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
        .then(function(r) { return r.json(); })
        .then(function(rows) {
          var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : localStorage.getItem(key);
          if (!raw) { onDone(null); return; }
          try { localStorage.setItem(key, raw); } catch(e) {}
          onDone(raw);
        })
        .catch(function() { onDone(localStorage.getItem(key)); });
    }

    function renderPicker(allKeys) {
      var bodyEl = document.getElementById('proc-picker-body');
      if (!bodyEl) return;
      bodyEl.innerHTML = '';

      /* ── Latest session ── */
      if (allKeys.length > 0) {
        var latestKey = allKeys[0];
        var lm = sessionMeta(latestKey);

        var section1 = document.createElement('div');
        section1.className = 'proc-section-wrap';
        section1.innerHTML = '<div class="proc-section-label">\u00daltima sess\u00e3o</div>';

        var lastBtn = makeBtn(
          'border-color:#5F7B94;background:transparent;color:#5F7B94;',
          '\u21a9 Continuar \u2014 ' + lm.label + metaLine(lm)
        );
        lastBtn.addEventListener('click', function() {
          close();
          loadKeyRemote(latestKey, function(raw) {
            if (!raw) { procMarkSynced(); procAddFatura(null); procSetSyncStatus('ok', 'nova sess\u00e3o'); return; }
            procApplySessionData(latestKey, raw, function() {
              procMarkSynced();
              procSetSyncStatus('ok', 'sess\u00e3o carregada');
            });
          });
        });
        section1.appendChild(lastBtn);
        bodyEl.appendChild(section1);

        /* ── Older sessions ── */
        var olderKeys = allKeys.slice(1);
        if (olderKeys.length) {
          var section2 = document.createElement('div');
          section2.className = 'proc-section-wrap';
          section2.innerHTML = '<div class="proc-section-label">Sess\u00f5es anteriores</div>';
          olderKeys.forEach(function(key) {
            var om = sessionMeta(key);
            var oldBtn = makeBtn('', om.label + metaLine(om));
            oldBtn.addEventListener('click', function() {
              close();
              procLoadSession(key);
            });
            section2.appendChild(oldBtn);
          });
          bodyEl.appendChild(section2);
        }
      }

      /* ── New session ── */
      var section3 = document.createElement('div');
      if (allKeys.length) section3.classList.add('proc-section3-divider');
      section3.innerHTML = '<div class="proc-section-label">Come\u00e7ar do zero</div>';

      var newBtn = makeBtn('', '\u2605 Iniciar nova sess\u00e3o');
      newBtn.addEventListener('click', function() {
        if (weekSessionExists()) {
          procFloatModal({
            title: 'J\u00e1 existe uma sess\u00e3o esta semana',
            body: 'J\u00e1 existe uma sess\u00e3o criada esta semana, podes continuar a utiliz\u00e1-la.',
            buttons: [
              { label: 'Entendido', style: 'background:#f0f0f0;border:1px solid #555;color:#000;font-weight:700;', cb: null }
            ]
          });
          return;
        }
        close();
        _activeSessionKey = getNextWeekKey();
        procMarkSynced();
        procAddFatura(null);
        procSetSyncStatus('ok', 'nova sess\u00e3o');
      });
      section3.appendChild(newBtn);
      bodyEl.appendChild(section3);
    }

    /* Fetch remote keys, then render */
    procLoadRemoteKeys(function() {
      renderPicker(getAllSessionKeys());
    });
  }

  function procLoadSessionSilent(key, callback) {
    var raw = localStorage.getItem(key);
    if (!raw) { if (callback) callback(); return; }
    procApplySessionData(key, raw, callback);
  }

  /* ── 5. SESSION DROPDOWN ── */
  function procSessionMenuBackdrop() {
    var bd = document.getElementById('proc-session-menu-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'proc-session-menu-backdrop';
      bd.addEventListener('click', procCloseSessionMenu);
      var host = document.getElementById('proc-content') || document.body;
      host.appendChild(bd);
    }
    return bd;
  }
  function procToggleSessionMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('proc-sessionMenuDropdown');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
      procRenderSessionMenu();
      menu.classList.remove('hidden');
      procSessionMenuBackdrop().style.display = 'block';
      /* Position dropdown relative to the trigger button using fixed coords.
         Em ecrãs estreitos (telemóvel), ancorar pela direita do botão
         empurrava o painel para fora do ecrã à esquerda — em vez disso,
         centra-se horizontalmente no ecrã. */
      var btn = e && e.currentTarget ? e.currentTarget : (e && e.target ? e.target : null);
      if (btn) {
        var rect = btn.getBoundingClientRect();
        var isMobile = window.innerWidth <= 640;
        menu.style.top = (rect.bottom + 6) + 'px';
        if (isMobile) {
          menu.style.left = '50%';
          menu.style.right = 'auto';
          menu.style.transform = 'translateX(-50%)';
        } else {
          menu.style.right = (window.innerWidth - rect.right) + 'px';
          menu.style.left  = 'auto';
          menu.style.transform = 'none';
        }
        /* Estica o modal o máximo possível no espaço livre abaixo do botão;
           quando o conteúdo não couber, o scroll interno já definido no
           CSS (overflow-y:auto) assume. */
        var freeBelow = window.innerHeight - rect.bottom - 20;
        menu.style.maxHeight = Math.max(180, Math.min(freeBelow, window.innerHeight * 0.7)) + 'px';
      }
    } else {
      procCloseSessionMenu();
    }
  }
  function procCloseSessionMenu() {
    var m = document.getElementById('proc-sessionMenuDropdown');
    if (m) m.classList.add('hidden');
    var bd = document.getElementById('proc-session-menu-backdrop');
    if (bd) bd.style.display = 'none';
  }
  function procRenderSessionMenu() {
    var menu = document.getElementById('proc-sessionMenuDropdown');
    if (!menu) return;
    var keys = getAllSessionKeys();
    var cur  = _activeSessionKey || getSessionKey();
    if (!keys.length) {
      menu.innerHTML = '<div class="proc-session-menu-empty">Nenhuma sess\u00e3o guardada</div>';
      return;
    }

    function montarItemHTML(key) {
      var savedAt = '';
      var nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          savedAt = dt.toLocaleDateString('pt-PT') + ' ' + dt.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
        }
        if (d && d.faturas) nFat = ' · ' + d.faturas.length + ' fat.';
      } catch(e) {}
      var isCur  = key === cur;
      var badge  = isCur ? ' <span class="proc-session-current-badge">ativa</span>' : '';
      var curCls = isCur ? ' current' : '';
      return '<div class="proc-session-menu-item' + curCls + '" onclick="event.stopPropagation()">'
        + '<div class="proc-session-menu-item-info">'
        + '<span class="proc-session-menu-item-label">' + labelFromKey(key) + badge + '</span>'
        + (savedAt ? '<span class="proc-session-menu-item-date">' + savedAt + nFat + '</span>' : '')
        + '</div>'
        + '<div class="proc-session-menu-item-actions">'
        + '<button class="proc-session-load-btn" onclick="procForceLoadSession(\'' + key + '\')">&#8635; carregar</button>'
        + '<button class="proc-session-delete-btn" onclick="procDeleteSession(\'' + key + '\')">\u2715</button>'
        + '</div></div>';
    }

    var agrupado = procAgruparSessoesPorMes(keys);
    var html = agrupado.soltas.map(montarItemHTML).join('');
    html += agrupado.grupos.map(function(g) {
      return procMontarGrupoSessaoHTML(g, g.keys.map(montarItemHTML).join(''));
    }).join('');
    html += agrupado.gruposAno.map(function(ga) {
      var mesesHTML = ga.gruposMes.map(function(g) {
        return procMontarGrupoSessaoHTML(g, g.keys.map(montarItemHTML).join(''));
      }).join('');
      return procMontarGrupoSessaoHTML(ga, mesesHTML);
    }).join('');
    menu.innerHTML = html;
    procLigarGruposSessaoHTML(menu);
  }

  /* ── 6. FATURA MANAGEMENT ── */
  function procAddFatura(data) {
    faturaCount++;
    var fid = faturaCount;
    rowCounts[fid] = 0;
    activeFaturas.push(fid);

    var container = document.getElementById('proc-faturasContainer');
    if (!container) return;
    var wrap = document.createElement('div');
    wrap.className = 'proc-fatura-instance';
    wrap.id = 'proc-fatura-' + fid;
    wrap.innerHTML = buildProcFaturaHTML(fid);
    container.appendChild(wrap);
    procUpdateBannerNumbers();

    /* Init autocomplete + lock */
    procInitProviderInput(fid);
    procUpdateTableLock(fid);

    /* ── Onboarding invisível (uma única vez) ── */
    if (!data && fid === 1) {
      setTimeout(function() { procShowOnboardingTooltip(fid); }, 600);
    }

    var dataRows = (data && data.rows) ? data.rows : [];
    var nRows    = Math.max(dataRows.length + 1, 2);
    procAddRows(fid, nRows);

    if (data) {
      var pEl = document.getElementById('proc-proveedor-'    + fid);
      var vEl = document.getElementById('proc-valorFactura-' + fid);
      if (pEl) pEl.value = data.proveedor    || '';
      if (vEl) vEl.value = data.valorFactura || '';
      procUpdateBannerProvider(fid);
      procUpdateTableLock(fid);
      /* Nova nomenclatura: por defeito activo, excepto se esta factura
         especifica ja tinha sido guardada com o toggle desligado. */
      _usaNomenclaturaPorFatura[fid] = (data.usaNomenclatura !== false);
      _procDataCorrigidaPorFatura[fid] = data.dataCorrigida || null;
      /* Restore guia ERP — if present, always collapse on load */
      if (data.guiaErp) {
        var gEl = document.getElementById('proc-guia-erp-' + fid);
        if (gEl) {
          gEl.value = data.guiaErp;
          gEl.classList.add('proc-guia-done');
          var bannerEl = document.getElementById('proc-fatura-banner-' + fid);
          if (bannerEl) bannerEl.classList.add('proc-banner-done');
          /* Always collapse when guia exists, regardless of previous collapsed state */
          var wrapEl = document.getElementById('proc-fatura-' + fid);
          if (wrapEl && !wrapEl.classList.contains('proc-collapsed')) procToggleCollapse(fid);
          procAtualizarBotaoRemover(fid);
          procAtualizarBloqueioGuia(fid);
        }
      } else if (data.collapsed) {
        /* No guia but was manually collapsed — restore that too */
        var wrapEl2 = document.getElementById('proc-fatura-' + fid);
        if (wrapEl2 && !wrapEl2.classList.contains('proc-collapsed')) procToggleCollapse(fid);
      }
      dataRows.forEach(function(row, idx) {
        var rid = idx + 1;
        var tr  = document.getElementById('proc-row-' + fid + '-' + rid);
        if (!tr) return;
        var rIn  = tr.querySelector('.proc-ref-input');
        var dIn  = tr.querySelector('.proc-desc-input');
        var nums = tr.querySelectorAll('input[type="number"]');
        var oIn  = tr.querySelector('.proc-obs-input');
        var dCb  = document.getElementById('proc-d-'    + fid + '-' + rid);
        var pCb  = document.getElementById('proc-plus-' + fid + '-' + rid);
        if (rIn)     rIn.value       = row.ref     || '';
        if (dIn)     dIn.value       = row.desc    || '';
        if (nums[0]) nums[0].value   = row.qtdFt   != null ? row.qtdFt   : '';
        if (nums[1]) nums[1].value   = row.a4      != null ? row.a4      : '';
        if (nums[2]) nums[2].value   = row.a5      != null ? row.a5      : '';
        if (nums[3]) nums[3].value   = row.preco   != null ? row.preco   : '';
        if (nums[4]) nums[4].value   = (row.descPct != null && row.descPct !== 0) ? row.descPct : '';
        if (dCb)     dCb.checked     = !!row.hasD;
        if (pCb)     pCb.checked     = !!row.plus1;
        if (oIn) {
          oIn.value = row.obs || '';
          procObsSync(oIn);
        }
        if (row.flagged) {
          var flagBtn = document.getElementById('proc-flag-' + fid + '-' + rid);
          var flagTr  = document.getElementById('proc-row-'  + fid + '-' + rid);
          if (flagBtn) flagBtn.classList.add('flagged');
          if (flagTr)  flagTr.classList.add('proc-row-flagged');
        }
        /* Tem de ficar marcado ANTES do primeiro procRecalcRow, para a
           pintura inicial ja vir sem PVP/margem (ex.: linhas importadas
           de TAM, preco de fabrica sem margem de venda aplicavel). */
        tr.dataset.semPvp = row.semPvp ? '1' : '0';
        procRecalcRow(fid, rid);
        /* Restore manual PVP override after recalc */
        if (row.pvpManual != null && !isNaN(row.pvpManual)) {
          var pvpElR  = document.getElementById('proc-pvp-' + fid + '-' + rid);
          if (pvpElR) {
            pvpElR._manualOverride = true;
            var dispR   = pvpElR.querySelector('.proc-pvp-display');
            var copyBR  = pvpElR.querySelector('.proc-pvp-copy-btn');
            if (dispR)  dispR.textContent = parseFloat(row.pvpManual).toFixed(2);
            if (copyBR) copyBR.style.display = 'inline-flex';
            pvpElR.className = 'proc-cell-computed has-val';
          }
        }
      });
      procUpdateHeader(fid);
      procSyncRefColWidth(fid);
      procSyncDescColWidth(fid);
      /* Restore transp field */
      if (data.transpTotal) {
        var tEl      = document.getElementById('proc-transp-'      + fid);
        var tBtn     = document.getElementById('proc-transp-btn-'  + fid);
        var tUndoBtn = document.getElementById('proc-transp-undo-' + fid);
        if (tEl) {
          tEl.value = data.transpTotal;
          tEl.classList.add('proc-transp-active');
          if (data.transpApplied) {
            tEl.disabled = true;
            if (tBtn)     tBtn.style.display     = 'none';
            if (tUndoBtn) tUndoBtn.style.display = 'inline-block';
          } else {
            tEl.disabled = false;
            if (tBtn)     tBtn.style.display     = 'inline-block';
            if (tUndoBtn) tUndoBtn.style.display = 'none';
          }
        }
      }
      /* Restore guia include checkbox */
      if (data.guiaInclude === false) {
        var gCb   = document.getElementById('proc-guia-include-'      + fid);
        var gWrap = document.getElementById('proc-guia-include-wrap-' + fid);
        if (gCb)   gCb.checked = false;
        if (gWrap) gWrap.classList.add('excluded');
      }
    } /* end if (data) */
    if (activeFaturas.length > 1) {
      wrap.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  }

  function buildProcFaturaHTML(fid) {
    return ''
      + '<div class="proc-fatura-banner" id="proc-fatura-banner-' + fid + '">'
      +   '<div class="proc-fatura-banner-left">'
      +     '<button class="proc-collapse-btn" id="proc-collapse-btn-' + fid + '" title="Colapsar / expandir fatura" onclick="procToggleCollapse(' + fid + ')">&#9660;</button>'
      +     '<span class="proc-fatura-icon">&#128196;</span>'
      +     '<span class="proc-fatura-banner-num" id="proc-fatura-banner-num-' + fid + '">Fatura ' + fid + '</span>'
      +     '<span class="proc-fatura-banner-provider" id="proc-banner-provider-' + fid + '"></span>'
      +   '</div>'
      +   '<div class="proc-transp-row">'
      +     '<div class="proc-transp-wrap">'
      +       '<span class="proc-transp-label">Transp./Desc.</span>'
      +       '<input type="number" class="proc-transp-input" id="proc-transp-' + fid + '" placeholder="opcional" step="0.01"'
      +       ' oninput="procTranspChange(' + fid + ')" />'
      +       '<button class="proc-transp-apply-btn" id="proc-transp-btn-' + fid + '" onclick="procTranspApply(' + fid + ')">distribuir</button>'
      +       '<button class="proc-transp-undo-btn" id="proc-transp-undo-' + fid + '" onclick="procTranspUndo(' + fid + ')">\u21a9 desfazer</button>'
      +     '</div>'
      +     '<div class="proc-guia-erp-wrap">'
      +       '<span class="proc-guia-erp-label">N.º Guia</span>'
      +       '<input type="text" class="proc-guia-erp-input" id="proc-guia-erp-' + fid + '" placeholder="ex: 2025/001" autocomplete="off"'
      +       ' oninput="procGuiaErpChange(' + fid + ')" />'
      +     '</div>'
      +     '<button class="proc-remove-fatura-btn" id="proc-remove-btn-' + fid + '" onclick="procRemoveFatura(' + fid + ')">\u2715 remover</button>'
      +   '</div>'
      + '</div>'
      + '<div class="proc-header-card">'
      +   '<div class="proc-forn-valor-row">'
      +     '<div class="proc-field-group proc-forn-group">'
      +       '<div class="proc-field-label">Fornecedor</div>'
      +       '<div class="proc-forn-wrap">'
      +         '<input type="text" id="proc-proveedor-' + fid + '" placeholder="Nome do fornecedor\u2026" autocomplete="off">'
      +         '<div id="proc-forn-sugg-' + fid + '" class="proc-forn-suggestions hidden"></div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="proc-field-group proc-valorfat-group"><div class="proc-field-label">Valor Fatura s/IVA (\u20ac)</div>'
      +       '<input type="number" id="proc-valorFactura-' + fid + '" placeholder="0.00" step="0.01" oninput="procUpdateHeader(' + fid + ');procUpdateTableLock(' + fid + ')"></div>'
      +   '</div>'
      +   '<div class="proc-field-group proc-totalcalc-group"><div class="proc-field-label">Total Calculado (\u20ac)</div>'
      +     '<div class="proc-total-box"><div class="proc-field-label">soma das linhas <button class="proc-audit-btn" id="proc-audit-btn-' + fid + '" onclick="procShowAuditPanel(' + fid + ')">&#128269; rever</button></div>'
      +     '<div class="proc-amount-row">'
      +       '<div class="proc-amount" id="proc-totalCalc-' + fid + '">0.00</div>'
      +       '<button class="proc-criacao-btn" title="Cria\u00e7\u00e3o de Artigos" onclick="procShowCriacaoModal(' + fid + ')">&#10022;</button>'
      +       '<label class="proc-guia-include-wrap" id="proc-guia-include-wrap-' + fid + '" title="Incluir na guia de transporte">'
      +         '<input type="checkbox" id="proc-guia-include-' + fid + '" checked onchange="procGuiaIncludeChange(' + fid + ')">'
      +         '<span class="proc-guia-include-label">guia</span>'
      +       '</label>'
      +       '<button class="proc-btn primary proc-stock-btn" onclick="procShowStockModal(' + fid + ')" title="Ingresso de Stock"><span class="proc-stock-btn-icon">\ud83d\udce6</span><span class="proc-stock-btn-label"> ingresso de stock</span></button>'
      +     '</div></div></div>'
      +   '<div class="proc-header-summary-col">'
      +     '<div class="proc-summary-item">N\u00ba Refer\u00eancias: <strong id="proc-lineCount-' + fid + '">0</strong></div>'
      +     '<div class="proc-summary-item">Pe\u00e7as totais: <strong id="proc-totalPiezas-' + fid + '">0</strong></div>'
      +     '<div class="proc-summary-item">Diferen\u00e7a: <span id="proc-diffChip-' + fid + '" class="proc-diff-chip zero">\u00b1 0.00 \u20ac</span></div>'
      +   '</div>'
      + '</div>'
      /* Lock message */
      + '<div class="proc-table-lock" id="proc-table-lock-' + fid + '">'
      +   '<span>\u26a0\ufe0f</span>'
      +   '<span>Para come\u00e7ar a preencher a tabela, introduz primeiro o <strong>nome do fornecedor</strong> e o <strong>valor da fatura sem IVA</strong>.</span>'
      + '</div>'
      /* Table (hidden until unlocked) */
      + '<div id="proc-table-block-' + fid + '">'
      +   '<div class="proc-table-block"><div class="proc-table-wrap"><table id="proc-mainTable-' + fid + '">'
      +   '<thead><tr>'
      +   '<th class="left">Refer\u00eancia</th>'
      +   '<th class="left">Descri\u00e7\u00e3o</th>'
      +   '<th>QTD.</th>'
      +   '<th class="th-a4" title="Atribuir toda a quantidade a Funchal"><button class="proc-fill-all-btn" onclick="procFillAll(' + fid + ',\'fnc\')">FNC</button></th>'
      +   '<th class="th-a5" title="Atribuir toda a quantidade a Porto Santo"><button class="proc-fill-all-btn" onclick="procFillAll(' + fid + ',\'pxo\')">PXO</button></th>'
      +   '<th title="Dividir Qtd. FT igualmente">\u00f7</th>'
      +   '<th>€</th>'
      +   '<th>%-</th>'
      +   '<th>!</th>'
      +   '<th>D / +1\u20ac</th>'
      +   '<th>pvp</th>'
      +   '<th>Margem</th>'
      +   '<th class="proc-obs-th">OBS</th>'
      +   '<th title="Assinalar linha">&#9873;</th>'
      +   '</tr></thead>'
      +   '<tbody id="proc-tableBody-' + fid + '"></tbody>'
      +   '</table></div></div>'
      +   '</div>';
  }

  /* Apaga em Supabase as referencias que esta factura especifica tem
     associadas (mesma logica/autonomia do toggle: o que a factura mostra,
     ela pode apagar). Falha silenciosa (so regista no console) — nunca
     deve impedir a remocao da factura em si. O trigger da base de dados
     continua a proteger fisicamente qualquer referencia com guia_erp. */
  function procApagarReferenciasDaFatura(fid, proveedorOverride) {
    var fornecedor;
    if (proveedorOverride != null) {
      /* Usado quando o nome do fornecedor acabou de mudar: o campo ja
         tem o nome NOVO, por isso quem chama passa explicitamente o
         nome ANTIGO — as referencias geradas sob esse nome deixaram de
         corresponder a esta factura. */
      fornecedor = proveedorOverride;
    } else {
      var pEl = document.getElementById('proc-proveedor-' + fid);
      fornecedor = pEl ? pEl.value.trim() : '';
    }
    var proveedorNorm = procNormalize(fornecedor);
    if (!proveedorNorm) return;

    var rows = procCollectRows(fid);
    if (!rows.length) return;
    var ano = new Date().getFullYear() % 100;

    procLoadCategoriasRemote().then(function(categorias) {
      var protegidas = procChavesUsadasPorOutrasFaturas(proveedorNorm, fid, categorias);
      var chaves = {};
      rows.forEach(function(r) {
        if (!r.ref) return;
        var refNorm = procNormalizarRefOriginal(r.ref);
        if (!refNorm) return;
        var categoria = procResolverCategoria(r.desc, categorias || []);
        var chave = refNorm + '|' + categoria;
        if (protegidas.hasOwnProperty(chave)) return; /* outra factura activa ainda precisa */
        chaves[chave] = true;
      });
      var listaChaves = Object.keys(chaves);
      if (!listaChaves.length) return;

      return procSbFetch(
        'proc_referencias?proveedor=eq.' + encodeURIComponent(proveedorNorm) + '&ano=eq.' + ano + '&select=referencia_interna,referencia_original,categoria',
        { method: 'GET' }
      )
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(todasDoAno) {
          var referencias = (todasDoAno || [])
            .filter(function(row) { return chaves.hasOwnProperty(row.referencia_original + '|' + row.categoria); })
            .map(function(row) { return row.referencia_interna; });
          if (!referencias.length) return;
          return procSbFetch('rpc/proc_borrar_referencias_rascunho', {
            method: 'POST',
            body: JSON.stringify({ p_proveedor: proveedorNorm, p_referencias: referencias })
          }).then(function(r2) {
            if (!r2.ok) {
              return r2.text().then(function(txt) {
                console.error('[proc] falha ao apagar referencias da factura removida — status ' + r2.status + ':', txt);
              });
            }
          });
        });
    }).catch(function(e) {
      console.error('[proc] erro ao apagar referencias da factura removida:', e);
    });
  }

  function procRemoveFatura(fid) {
    if (activeFaturas.length <= 1) return;
    var guiaInput = document.getElementById('proc-guia-erp-' + fid);
    var temGuia = guiaInput && guiaInput.value.trim().length > 0;
    if (temGuia) {
      window.alert('Esta factura j\u00e1 tem n\u00famero de guia (j\u00e1 foi ingressada no sistema) e n\u00e3o pode ser eliminada.');
      return;
    }
    var senha = window.prompt('Esta ac\u00e7\u00e3o requer a senha de administrador:');
    if (senha === null) return; /* cancelado */
    procValidarAdmin(senha).then(function(ok) {
      if (!ok) { window.alert('Senha incorrecta.'); return; }
      procApagarReferenciasDaFatura(fid);
      procUndoSnapshot(); /* snapshot antes de remover */
      var el = document.getElementById('proc-fatura-' + fid);
      if (el) el.remove();
      activeFaturas = activeFaturas.filter(function(id) { return id !== fid; });
      procUpdateBannerNumbers();
    });
  }

  function procUpdateBannerNumbers() {
    activeFaturas.forEach(function(fid, idx) {
      var nEl = document.getElementById('proc-fatura-banner-num-' + fid);
      if (nEl) nEl.textContent = 'Fatura ' + (idx + 1);
      procAtualizarBotaoRemover(fid);
    });
  }

  /* Esconde por completo o botao "remover" assim que a fatura ja tem
     numero de guia (ja foi ingressada no ERP) — deixar de aparecer, em
     vez de so bloquear ao clicar, evita que o utilizador pense que a
     remocao e possivel e va a procura de outra forma de a forcar. */
  function procAtualizarBotaoRemover(fid) {
    var btn = document.getElementById('proc-remove-btn-' + fid);
    if (!btn) return;
    var guiaInput = document.getElementById('proc-guia-erp-' + fid);
    var temGuia   = !!(guiaInput && guiaInput.value.trim().length > 0);
    btn.style.display = (activeFaturas.length > 1 && !temGuia) ? 'inline-block' : 'none';
  }

  /* Bloqueia visual e funcionalmente toda a tabela de artigos quando a
     factura ja tem numero de guia — impede edicoes acidentais depois de
     fechado o ciclo com o ERP. A unica forma de voltar a editar e o
     gesto deliberado de 3 clics no nome do fornecedor (ver o listener
     'click' registado em procInitProviderInput). */
  function procAtualizarBloqueioGuia(fid) {
    var block = document.getElementById('proc-table-block-' + fid);
    var table = document.getElementById('proc-mainTable-' + fid);
    if (!block || !table) return;
    var guiaInput = document.getElementById('proc-guia-erp-' + fid);
    var temGuia   = !!(guiaInput && guiaInput.value.trim().length > 0);
    var bloqueado = temGuia && !_tabelaDesbloqueadaPorGuia[fid];
    block.classList.toggle('proc-table-guia-locked', bloqueado);
    /* O pointer-events:none vai APENAS na <table>, nunca no wrapper que
       tem o overflow-x:auto — assim o scroll horizontal em ecrans
       pequenos continua a funcionar com a tabela bloqueada; so a
       interacao com o conteudo da propria tabela (inputs, botoes) fica
       desactivada. A opacidade continua a aplicar-se a toda a area,
       e e so um efeito visual, nao interfere com o scroll. */
    table.style.pointerEvents = bloqueado ? 'none' : '';
    block.style.opacity       = bloqueado ? '0.5'  : '';
    block.title = bloqueado ? 'Tabela bloqueada \u2014 esta factura j\u00e1 tem n\u00famero de guia. 3 clics no nome do fornecedor para desbloquear.' : '';
  }

  /* Gesto de desbloqueio: 3 clics no campo do fornecedor. e.detail conta
     clics consecutivos na mesma posicao dentro do intervalo do sistema
     (o mesmo mecanismo nativo do duplo-clique, generalizado a 3). */
  function procTentarDesbloquearTabelaPorClique(fid, e) {
    if (e.detail !== 3) return;
    var guiaInput = document.getElementById('proc-guia-erp-' + fid);
    var temGuia   = !!(guiaInput && guiaInput.value.trim().length > 0);
    if (!temGuia || _tabelaDesbloqueadaPorGuia[fid]) return;
    _tabelaDesbloqueadaPorGuia[fid] = true;
    procAtualizarBloqueioGuia(fid);
  }

  function procUpdateBannerProvider(fid) {
    var pEl = document.getElementById('proc-proveedor-'       + fid);
    var bEl = document.getElementById('proc-banner-provider-' + fid);
    var val = (pEl && pEl.value) ? pEl.value : '';
    if (bEl) bEl.textContent = val ? '\u2014 ' + val : '';
  }

  /* ── GUIA ERP: colapsar / expandir factura ── */
  function procGuiaErpChange(fid) {
    var input   = document.getElementById('proc-guia-erp-' + fid);
    var banner  = document.getElementById('proc-fatura-banner-' + fid);
    var wrap    = document.getElementById('proc-fatura-' + fid);
    var colBtn  = document.getElementById('proc-collapse-btn-' + fid);
    if (!input) return;
    var hasGuia = input.value.trim().length > 0;
    if (hasGuia) {
      input.classList.add('proc-guia-done');
      if (banner) banner.classList.add('proc-banner-done');
      /* Vincula retroactivamente a guia as referencias ja criadas (nao bloqueante) */
      procVincularGuiaReferencias(fid, input.value.trim());
      /* Auto-collapse when guia is set and not yet collapsed */
      if (wrap && !wrap.classList.contains('proc-collapsed')) {
        procToggleCollapse(fid);
      }
    } else {
      input.classList.remove('proc-guia-done');
      if (banner) banner.classList.remove('proc-banner-done');
    }
    procAtualizarBotaoRemover(fid);
    procAtualizarBloqueioGuia(fid);
    procSaveSession(false);
  }

  /* ── TRANSPORTE / DESCONTO GERAL ── */
  /* Snapshot por factura: guarda os preços originais antes de distribuir */
  var _transpSnapshot = {};

  function procTranspChange(fid) {
    var input = document.getElementById('proc-transp-' + fid);
    var btn   = document.getElementById('proc-transp-btn-' + fid);
    if (!input || !btn) return;
    var val = parseFloat(input.value);
    var hasVal = !isNaN(val) && val !== 0;
    btn.style.display = hasVal ? 'inline-block' : 'none';
    if (hasVal) {
      input.classList.add('proc-transp-active');
    } else {
      input.classList.remove('proc-transp-active');
    }
  }

  function procTranspApply(fid) {
    var input   = document.getElementById('proc-transp-' + fid);
    var undoBtn = document.getElementById('proc-transp-undo-' + fid);
    var applyBtn = document.getElementById('proc-transp-btn-' + fid);
    if (!input) return;
    var transpTotal = parseFloat(input.value);
    if (isNaN(transpTotal) || transpTotal === 0) return;

    /* Collect rows with pieces > 0 */
    var rc = rowCounts[fid] || 0;
    var totalPecas = 0;
    var rowData = [];
    for (var i = 1; i <= rc; i++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var nums = tr.querySelectorAll('input[type="number"]');
      var a4   = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5   = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var pcs  = a4 + a5;
      if (pcs > 0) {
        totalPecas += pcs;
        rowData.push({ id: i, pcs: pcs, precoInput: nums[3] });
      }
    }
    if (totalPecas === 0) return;

    /* Save snapshot of original prices before applying */
    var snapshot = { transpTotal: transpTotal, rows: [] };
    rowData.forEach(function(rd) {
      if (!rd.precoInput) return;
      snapshot.rows.push({ id: rd.id, originalPreco: rd.precoInput.value });
    });
    _transpSnapshot[fid] = snapshot;

    /* perPeca = coste de transporte por unidade — soma-se ao preço unitário de cada linha */
    var perPeca = transpTotal / totalPecas;
    rowData.forEach(function(rd) {
      if (!rd.precoInput) return;
      var currentPreco = parseFloat(rd.precoInput.value) || 0;
      if (currentPreco <= 0) return;
      var addition = Math.round(perPeca * 100) / 100;
      rd.precoInput.value = (currentPreco + addition).toFixed(2);
      procRecalcRow(fid, rd.id);
    });

    /* Update UI: hide apply btn, show undo btn, keep input visible with applied value */
    input.disabled = true;
    input.classList.add('proc-transp-active');
    if (applyBtn) applyBtn.style.display = 'none';
    if (undoBtn)  undoBtn.style.display  = 'inline-block';
    procSaveSession(false);
  }

  function procTranspUndo(fid) {
    var snapshot = _transpSnapshot[fid];
    if (!snapshot) return;

    /* Restore original prices from snapshot */
    snapshot.rows.forEach(function(s) {
      var tr = document.getElementById('proc-row-' + fid + '-' + s.id);
      if (!tr) return;
      var nums = tr.querySelectorAll('input[type="number"]');
      if (nums[3]) {
        nums[3].value = s.originalPreco;
        procRecalcRow(fid, s.id);
      }
    });

    /* Reset UI */
    delete _transpSnapshot[fid];
    var input    = document.getElementById('proc-transp-' + fid);
    var undoBtn  = document.getElementById('proc-transp-undo-' + fid);
    var applyBtn = document.getElementById('proc-transp-btn-' + fid);
    if (input) {
      input.value    = snapshot.transpTotal;
      input.disabled = false;
      input.classList.add('proc-transp-active');
    }
    if (applyBtn) applyBtn.style.display = 'inline-block';
    if (undoBtn)  undoBtn.style.display  = 'none';
    procSaveSession(false);
  }

  function procGuiaIncludeChange(fid) {
    var cb   = document.getElementById('proc-guia-include-' + fid);
    var wrap = document.getElementById('proc-guia-include-wrap-' + fid);
    if (!cb || !wrap) return;
    if (cb.checked) {
      wrap.classList.remove('excluded');
    } else {
      wrap.classList.add('excluded');
    }
    procSaveSession(false);
  }

  function procToggleCollapse(fid) {
    var wrap   = document.getElementById('proc-fatura-' + fid);
    var colBtn = document.getElementById('proc-collapse-btn-' + fid);
    if (!wrap) return;
    var isCollapsed = wrap.classList.toggle('proc-collapsed');
    if (colBtn) {
      colBtn.innerHTML = isCollapsed ? '&#9654;' : '&#9660;';
      colBtn.classList.toggle('collapsed', isCollapsed);
      colBtn.title = isCollapsed ? 'Expandir fatura' : 'Colapsar fatura';
    }
  }

  /* ── 7. ROW CREATION ── */
  function procAddRows(fid, n) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    /* Delegate OBS input once per tbody */
    /* ── Desc autocomplete delegation (once per tbody) ── */
    if (!tbody._descListening) {
      tbody._descListening = true;

      /* Global suggestions element — lives on body, escapes all stacking contexts */
      if (!document.getElementById('proc-desc-global-sugg')) {
        var gSugg = document.createElement('div');
        gSugg.id  = 'proc-desc-global-sugg';
        document.body.appendChild(gSugg);
        gSugg.addEventListener('mousedown', function(e) {
          var item = e.target && e.target.classList.contains('proc-desc-item') ? e.target : null;
          if (!item) return;
          e.preventDefault();
          var sg = document.getElementById('proc-desc-global-sugg');
          if (sg._activeInput) {
            sg._activeInput.value = item.textContent;
            sg._activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          sg.style.display = 'none';
        });
      }

      tbody.addEventListener('input', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        var inp = e.target;
        procSyncDescColWidth(fid);
        var sg  = document.getElementById('proc-desc-global-sugg');
        var q   = inp.value.trim().toUpperCase().replace(/\s+/g,' ');
        if (!q || q.length < 2) { sg.style.display = 'none'; return; }
        var matches = procFindDescMatches(q);
        if (!matches.length) { sg.style.display = 'none'; return; }
        sg.innerHTML = matches.map(function(m) {
          return '<div class="proc-desc-item">' + m + '</div>';
        }).join('');
        var rect = inp.getBoundingClientRect();
        sg.style.top    = (rect.bottom + 2) + 'px';
        sg.style.left   = rect.left + 'px';
        sg.style.width  = Math.max(rect.width, 220) + 'px';
        sg.style.display = 'block';
        sg._activeInput  = inp;
      });

      tbody.addEventListener('focusout', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        setTimeout(function() {
          var sg = document.getElementById('proc-desc-global-sugg');
          if (sg) { sg.style.display = 'none'; sg._activeInput = null; }
          var inp = e.target;
          var raw = inp.value.trim();
          if (!raw) return;
          var rawUpper = raw.toUpperCase();
          /* Se o utilizador rejeitou esta palavra antes, não volta a corrigir */
          if (inp._userRejectedValues && inp._userRejectedValues[rawUpper]) return;
          var corrected = procSilentCorrectDesc(raw);
          if (corrected && corrected !== raw) {
            /* Guarda o valor original que o sistema vai substituir,
               para que se o utilizador o voltar a escrever, não seja corrigido novamente */
            inp._lastAutoCorrectFrom = rawUpper;
            inp.value = corrected;
          }
        }, 180);
      });

      /* Detecta quando o utilizador reescreve uma palavra que foi autocorrigida → rejeição */
      tbody.addEventListener('keydown', function(e) {
        if (!e.target || !e.target.classList.contains('proc-desc-input')) return;
        var inp = e.target;
        /* Se o utilizador apaga para corrigir a autocorreção, registar rejeição */
        if ((e.key === 'Backspace' || e.key === 'Delete') && inp._lastAutoCorrectFrom) {
          if (!inp._userRejectedValues) inp._userRejectedValues = {};
          inp._userRejectedValues[inp._lastAutoCorrectFrom] = true;
          inp._lastAutoCorrectFrom = null;
        }
      });
    }
    if (!tbody._obsListening) {
      tbody._obsListening = true;
      tbody.addEventListener('input', function(e) {
        if (e.target && e.target.classList.contains('proc-obs-input')) {
          procObsSync(e.target);
        }
      });
    }
    /* ── Correcao de referencia/descricao ja gravada em Supabase ──
       Deteta quando o utilizador termina de editar a referencia ou a
       descricao de uma linha ja existente e decide, ao sair do campo,
       se deve corrigir (preserva a referencia_interna) ou apagar
       (referencia+descricao ficaram ambas vazias) a entrada
       correspondente em proc_referencias. Ver procTratarEdicaoLinha. */
    if (!tbody._correcaoLinhaListening) {
      tbody._correcaoLinhaListening = true;
      tbody.addEventListener('focusin', function(e) {
        if (!e.target) return;
        var isRefOuDesc = e.target.classList.contains('proc-ref-input') || e.target.classList.contains('proc-desc-input');
        if (!isRefOuDesc) return;
        var tr = e.target.closest('tr');
        if (!tr || tr.dataset.edicaoActiva === '1') return;
        var rIn0 = tr.querySelector('.proc-ref-input');
        var dIn0 = tr.querySelector('.proc-desc-input');
        tr.dataset.edicaoActiva = '1';
        tr.dataset.prevRef  = rIn0 ? rIn0.value.trim() : '';
        tr.dataset.prevDesc = dIn0 ? dIn0.value.trim() : '';
      });
      tbody.addEventListener('focusout', function(e) {
        if (!e.target) return;
        var isRefOuDesc = e.target.classList.contains('proc-ref-input') || e.target.classList.contains('proc-desc-input');
        if (!isRefOuDesc) return;
        var tr = e.target.closest('tr');
        if (!tr) return;
        setTimeout(function() {
          var activo = document.activeElement;
          if (activo && tr.contains(activo)) return;
          if (tr.dataset.edicaoActiva !== '1') return;
          tr.dataset.edicaoActiva = '0';
          var refAntigo  = tr.dataset.prevRef  || '';
          var descAntigo = tr.dataset.prevDesc || '';
          var m = tr.id.match(/^proc-row-(\d+)-(\d+)$/);
          if (!m) return;
          var fidLinha = parseInt(m[1], 10);
          var iLinha   = parseInt(m[2], 10);
          var rInF = tr.querySelector('.proc-ref-input');
          var dInF = tr.querySelector('.proc-desc-input');
          var refFinal  = rInF ? rInF.value.trim() : '';
          var descFinal = dInF ? dInF.value.trim() : '';
          if (refAntigo === refFinal && descAntigo === descFinal) return;
          procTratarEdicaoLinha(fidLinha, iLinha, refAntigo, descAntigo);
        }, 200);
      });
    }
    for (var i = 0; i < n; i++) {
      rowCounts[fid]++;
      var id = rowCounts[fid];
      var f  = fid;
      var r  = id;
      var tr = document.createElement('tr');
      tr.id  = 'proc-row-' + f + '-' + r;
      tr.innerHTML =
          '<td class="td-ref">'
        + '<div class="proc-ref-wrap">'
        + '<input type="text" class="proc-ref-input"'
        + ' onfocus="procActivateRow(this)"'
        + ' oninput="var s=this.selectionStart,e=this.selectionEnd;this.value=this.value.toUpperCase();this.setSelectionRange(s,e);procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '</div></td>'
        + '<td class="td-desc">'
        + '<div class="proc-desc-wrap">'
        + '<input type="text" class="proc-desc-input" size="22"'
        + ' onfocus="procActivateRow(this)"'
        + ' oninput="var s=this.selectionStart,e=this.selectionEnd;this.value=this.value.toUpperCase();this.setSelectionRange(s,e);procCheckAutoExpand(' + f + ',' + r + ')">'
        + '</div></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" step="1" maxlength="5"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td class="center-col"><button class="proc-split-btn" onclick="procAutoSplit(' + f + ',' + r + ')"'
        + ' title="Dividir Qtd. FT entre Funchal e Porto Santo">\u00f7</button></td>'
        + '<td><input type="number" min="0" step="0.01" class="proc-preco-input"'
        + ' onfocus="procActivateRow(this)"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,5)"></td>'
        + '<td><input type="number" min="0" max="100" step="0.1" class="proc-desc-pct-input"'
        + ' oninput="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ');procLimitDigits(this,4)"></td>'
        + '<td class="proc-cell-status" id="proc-status-' + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-toggle-cell">'
        + '<div class="proc-toggle-inner">'
        + '<div class="proc-toggle-d"><input type="checkbox" id="proc-d-' + f + '-' + r
        + '" onchange="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '<label for="proc-d-' + f + '-' + r + '">D</label></div>'
        + '<div class="proc-toggle-plus"><input type="checkbox" id="proc-plus-' + f + '-' + r
        + '" onchange="procRecalcRow(' + f + ',' + r + ');procCheckAutoExpand(' + f + ',' + r + ')">'
        + '<label for="proc-plus-' + f + '-' + r + '">+1\u20ac</label></div>'
        + '</div></td>'
        + '<td class="proc-cell-computed proc-cell-tight" id="proc-pvp-'   + f + '-' + r + '">'
        + '<div class="proc-pvp-wrap">'
        + '<span class="proc-pvp-display">\u2014</span>'
        + '<input type="number" class="proc-pvp-edit-input" step="0.01" min="0" placeholder="0.00"'
        + ' onblur="procPVPEditBlur(this,\'' + f + '\',\'' + r + '\')"'
        + ' oninput="procPVPEditInput(this,\'' + f + '\',\'' + r + '\')"'
        + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
        + '<button class="proc-pvp-edit-btn" title="Editar PVP" onclick="procPVPToggleEdit(this,\'' + f + '\',\'' + r + '\')">'
        + '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + '</button>'
        + '</div>'
        + '</td>'
        + '<td class="proc-cell-computed" id="proc-marg-'  + f + '-' + r + '">\u2014</td>'
        + '<td class="proc-obs-cell">'
        +   '<button type="button" class="proc-obs-btn" id="proc-obs-btn-' + f + '-' + r + '" title="Observa\u00e7\u00e3o" onclick="procObsEdit(this)"></button>'
        +   '<input type="text" class="proc-obs-input" id="proc-obs-' + f + '-' + r + '" onblur="procObsCommit(this)" onkeydown="procObsKeydown(event,this)">'
        +   '<div class="proc-obs-tip" id="proc-obs-tip-' + f + '-' + r + '"></div>'
        + '</td>'
        + '<td class="proc-marg-td">'
        +   '<button class="proc-flag-btn" id="proc-flag-' + f + '-' + r + '" title="Assinalar linha" onclick="procToggleFlag(' + f + ',' + r + ')">'
        +   '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3v18M4 3h12l-3 5 3 5H4"/></svg>'
        +   '</button>'
        + '</td>';
      tbody.appendChild(tr);
    }
    procUpdateSummary(fid);
  }

  function procCheckAutoExpand(fid, id) {
    if (id === rowCounts[fid]) procAddRows(fid, 1);
    procSyncRefColWidth(fid);
    procSyncDescColWidth(fid);
  }

  /* Measure the longest ref value in this fatura and set all ref inputs
     to that same character-width so the column is always content-driven */
  function procSyncRefColWidth(fid) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var inputs = tbody.querySelectorAll('input.proc-ref-input');
    var maxLen = 6; /* minimum fallback chars */
    inputs.forEach(function(inp) {
      var len = inp.value ? inp.value.length : 0;
      if (len > maxLen) maxLen = len;
    });
    /* size attribute drives input width in ch units — add 1 for cursor */
    inputs.forEach(function(inp) {
      inp.setAttribute('size', maxLen + 1);
    });
    /* Also size the header th to match */
    var table = document.getElementById('proc-mainTable-' + fid);
    if (table) {
      var th = table.querySelector('thead th.left:first-child');
      if (th) th.style.minWidth = '';
    }
  }

  function procSyncDescColWidth(fid) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var inputs = tbody.querySelectorAll('input.proc-desc-input');
    var maxLen = 22; /* minimum fallback chars */
    inputs.forEach(function(inp) {
      var len = inp.value ? inp.value.length : 0;
      if (len > maxLen) maxLen = len;
    });
    inputs.forEach(function(inp) {
      inp.setAttribute('size', maxLen + 2);
    });
  }



  function procAutoSplit(fid, id) {
    var tr = document.getElementById('proc-row-' + fid + '-' + id);
    if (!tr) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    var qtdFt  = parseInt(inputs[0].value) || 0;
    if (!qtdFt) return;

    function applySplit(a4, a5) {
      inputs[1].value = a4;
      inputs[2].value = a5;
      var btn = tr.querySelector('.proc-split-btn');
      if (btn) { btn.classList.add('active'); setTimeout(function() { btn.classList.remove('active'); }, 800); }
      procRecalcRow(fid, id);
      procCheckAutoExpand(fid, id);
    }

    if (qtdFt % 2 === 0) {
      /* Par — divide directamente */
      applySplit(qtdFt / 2, qtdFt / 2);
      return;
    }

    /* Ímpar — modal elegante */
    var half = Math.floor(qtdFt / 2);
    var ref  = (tr.querySelector('.proc-ref-input') || {}).value || '';
    var fF   = Math.ceil(qtdFt / 2);  /* Funchal com extra */
    var fPS  = Math.ceil(qtdFt / 2);  /* Porto Santo com extra */

    var overlay = document.createElement('div');
    overlay.className = 'proc-odd-overlay';

    var panel = document.createElement('div');
    panel.className = 'proc-odd-panel';

    var label = '<div class="proc-odd-label">PE\u00c7A \u00cdMPAR \u2014 1 DE 1</div>';
    var refLine = ref ? '<div class="proc-odd-ref">Refer\u00eancia ' + ref + '</div>' : '';
    var info = '<div class="proc-odd-info">Total: ' + qtdFt + ' pe\u00e7as &nbsp;\u00b7&nbsp; Funchal: ' + half + ' &nbsp;\u00b7&nbsp; Porto Santo: ' + half + '</div>';
    var question = '<div class="proc-odd-question">Sobra 1 pe\u00e7a. Para onde vai?</div>';

    function btn(text, cb) {
      var b = document.createElement('button');
      b.className = 'proc-odd-btn';
      b.innerHTML = text;
      b.onmouseenter = function(){ b.style.background='#E8EFF4'; b.style.borderColor='#9DB6C9'; };
      b.onmouseleave = function(){ b.style.background='#fff'; b.style.borderColor='#e0e0e0'; };
      b.onclick = function(){ document.body.removeChild(overlay); cb(); };
      return b;
    }

    panel.innerHTML = label + refLine + info + question;
    panel.appendChild(btn('\u2192 Funchal (' + (half+1) + 'F / ' + half + 'PS)', function(){ applySplit(half+1, half); }));
    panel.appendChild(btn('\u2192 Porto Santo (' + half + 'F / ' + (half+1) + 'PS)', function(){ applySplit(half, half+1); }));
    panel.appendChild(btn('deixar pendente', function(){ /* não aplica split */ }));

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e){ if(e.target===overlay){ document.body.removeChild(overlay); } });
    document.body.appendChild(overlay);
  }

  /* ── 8a-bis. FILL ALL → FNC or PXO ── */
  /* Al hacer clic en el encabezado FNC o PXO, copia la cantidad total de cada
     fila al almacén correspondiente y pone 0 en el otro.
     Solo actúa en filas que tengan QTD > 0. */
  function procFillAll(fid, target) {
    var tbody = document.getElementById('proc-tableBody-' + fid);
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    var affected = 0;
    for (var i = 0; i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input[type="number"]');
      /* inputs[0] = QTD FT, inputs[1] = FNC, inputs[2] = PXO */
      if (!inputs || inputs.length < 3) continue;
      var qtd = parseInt(inputs[0].value) || 0;
      if (!qtd) continue;
      if (target === 'fnc') {
        inputs[1].value = qtd;
        inputs[2].value = 0;
      } else {
        inputs[1].value = 0;
        inputs[2].value = qtd;
      }
      var rowId = parseInt(rows[i].id.replace('proc-row-' + fid + '-', ''));
      if (!isNaN(rowId)) procRecalcRow(fid, rowId);
      affected++;
    }
    if (!affected) return;
    /* Flash visual no botão clicado */
    var thClass = target === 'fnc' ? 'th-a4' : 'th-a5';
    var table = document.getElementById('proc-mainTable-' + fid);
    if (table) {
      var th = table.querySelector('thead th.' + thClass + ' .proc-fill-all-btn');
      if (th) {
        th.classList.add('flashed');
        setTimeout(function() { th.classList.remove('flashed'); }, 700);
      }
    }
    procUpdateSummary(fid);
    procSaveSession(false);
  }

  /* ── 8b. EXCEL-LIKE KEYBOARD NAVIGATION ── */
  function procGetAllInputs(fid) {
    /* Returns ordered list of all focusable inputs in the table for fid */
    var block = document.getElementById('proc-table-block-' + fid);
    if (!block) return [];
    return Array.prototype.slice.call(
      block.querySelectorAll('tbody input[type="text"], tbody input[type="number"]')
    );
  }

  function procGetCellCoords(input, fid) {
    /* Returns { row, col } of the input within the tbody grid */
    var tr = input.closest('tr');
    if (!tr) return null;
    var allRows = Array.prototype.slice.call(
      document.querySelectorAll('#proc-tableBody-' + fid + ' tr')
    );
    var row = allRows.indexOf(tr);
    var inputs = Array.prototype.slice.call(tr.querySelectorAll('input[type="text"], input[type="number"]'));
    var col = inputs.indexOf(input);
    return { row: row, col: col };
  }

  function procNavigate(input, fid, direction) {
    var coords = procGetCellCoords(input, fid);
    if (!coords) return;
    var allRows = Array.prototype.slice.call(
      document.querySelectorAll('#proc-tableBody-' + fid + ' tr')
    );
    var targetRow, targetCol, targetInputs, targetInput;

    if (direction === 'down' || direction === 'enter') {
      /* Move to same column, next row */
      targetRow = coords.row + 1;
      if (targetRow >= allRows.length) return;
      targetInputs = Array.prototype.slice.call(
        allRows[targetRow].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = targetInputs[Math.min(coords.col, targetInputs.length - 1)];
    } else if (direction === 'up') {
      targetRow = coords.row - 1;
      if (targetRow < 0) return;
      targetInputs = Array.prototype.slice.call(
        allRows[targetRow].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = targetInputs[Math.min(coords.col, targetInputs.length - 1)];
    } else if (direction === 'right') {
      var allInputs = Array.prototype.slice.call(
        allRows[coords.row].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = allInputs[coords.col + 1] || null;
      if (!targetInput) {
        /* Wrap to first input of next row */
        if (coords.row + 1 < allRows.length) {
          targetInput = allRows[coords.row + 1].querySelector('input[type="text"], input[type="number"]');
        }
      }
    } else if (direction === 'left') {
      var rowInputs = Array.prototype.slice.call(
        allRows[coords.row].querySelectorAll('input[type="text"], input[type="number"]')
      );
      targetInput = rowInputs[coords.col - 1] || null;
      if (!targetInput && coords.row > 0) {
        /* Wrap to last input of previous row */
        var prevInputs = Array.prototype.slice.call(
          allRows[coords.row - 1].querySelectorAll('input[type="text"], input[type="number"]')
        );
        targetInput = prevInputs[prevInputs.length - 1] || null;
      }
    }

    if (targetInput) {
      targetInput.focus();
      if (targetInput.select) targetInput.select();
    }
  }

  /* Normaliza um valor colado num campo numérico: aceita separador decimal
     europeu (vírgula) ou americano (ponto), remove símbolos de moeda e
     separadores de milhares. Devolve null se não for um número válido —
     nesse caso o input numérico não é tocado, evitando o erro nativo do
     browser "The specified value ... cannot be parsed". */
  function procNormalizePastedNumber(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    s = s.replace(/[^0-9,.\-]/g, '');
    if (!s) return null;
    var hasComma = s.indexOf(',') !== -1;
    var hasDot   = s.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        /* "1.234,56" -> milhares=. decimais=, */
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        /* "1,234.56" -> milhares=, decimais=. */
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      /* "6,9" -> so virgula, e o separador decimal */
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return (isNaN(n) || !isFinite(n)) ? null : String(n);
  }

  function procInitTableKeyboard(fid) {
    var block = document.getElementById('proc-table-block-' + fid);
    if (!block || block._keyboardInited) return;
    block._keyboardInited = true;

    /* ── Paste from Excel: distribute lines downward in the same column ── */
    block.addEventListener('paste', function(e) {
      var input = e.target;
      if (input.tagName !== 'INPUT') return;
      if (!input.closest('#proc-table-block-' + fid)) return;

      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text) return;

      /* Split by newline, clean carriage returns and empty trailing line */
      var lines = text.split('\n').map(function(l) { return l.replace(/\r/g, '').trim(); });
      if (lines[lines.length - 1] === '') lines.pop();

      /* Cola de valor unico (uma celula): o browser trata da insercao no
         cursor, exceto em inputs numericos, onde e preciso normalizar a
         virgula decimal antes de atribuir -- caso contrario o valor nativo
         e rejeitado silenciosamente (ou com erro na consola). */
      if (lines.length <= 1) {
        if (input.type === 'number') {
          var normalizedSingle = procNormalizePastedNumber(text);
          if (normalizedSingle !== null) {
            e.preventDefault();
            input.value = normalizedSingle;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            var trSingle = input.closest('tr');
            var rowIdSingle = trSingle ? parseInt((trSingle.id || '').split('-').pop(), 10) : NaN;
            if (!isNaN(rowIdSingle)) procRecalcRow(fid, rowIdSingle);
          }
        }
        return;
      }

      e.preventDefault();

      /* Find which row this input belongs to */
      var tr = input.closest('tr');
      if (!tr) return;
      var tbody = document.getElementById('proc-tableBody-' + fid);
      if (!tbody) return;
      var allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var startRowIdx = allRows.indexOf(tr);
      if (startRowIdx === -1) return;

      /* Find column index of this input within its row */
      var rowInputs = Array.prototype.slice.call(tr.querySelectorAll('input[type="text"], input[type="number"]'));
      var colIdx = rowInputs.indexOf(input);

      /* Ensure enough rows exist */
      var rowsNeeded = startRowIdx + lines.length;
      var currentRowCount = rowCounts[fid] || 0;
      if (rowsNeeded > currentRowCount) {
        procAddRows(fid, rowsNeeded - currentRowCount);
        /* Re-fetch rows after adding */
        allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      }

      /* Paste each line into the same column of successive rows */
      lines.forEach(function(val, i) {
        var targetRow = allRows[startRowIdx + i];
        if (!targetRow) return;
        var targetInputs = Array.prototype.slice.call(
          targetRow.querySelectorAll('input[type="text"], input[type="number"]')
        );
        var targetInput = targetInputs[colIdx];
        if (!targetInput) return;
        var pasteVal = val;
        if (targetInput.type === 'number') {
          var normalizedMulti = procNormalizePastedNumber(val);
          pasteVal = normalizedMulti !== null ? normalizedMulti : '';
        }
        targetInput.value = pasteVal;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        /* Get row id from tr id: proc-row-{fid}-{id} */
        var rowId = parseInt((targetRow.id || '').split('-').pop(), 10);
        if (!isNaN(rowId)) procRecalcRow(fid, rowId);
      });

      /* Focus the first pasted cell */
      var firstTargetRow = allRows[startRowIdx];
      if (firstTargetRow) {
        var firstInputs = Array.prototype.slice.call(
          firstTargetRow.querySelectorAll('input[type="text"], input[type="number"]')
        );
        if (firstInputs[colIdx]) firstInputs[colIdx].focus();
      }
      procSaveSession(false);
    });

    block.addEventListener('keydown', function(e) {
      var input = e.target;
      if (input.tagName !== 'INPUT') return;
      if (!input.closest('#proc-table-block-' + fid)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        procNavigate(input, fid, 'enter');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        procNavigate(input, fid, 'down');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        procNavigate(input, fid, 'up');
      } else if (e.key === 'ArrowRight') {
        /* Solo navega si el cursor está al final del valor */
        var atEnd = input.selectionStart === (input.value || '').length;
        if (atEnd) { e.preventDefault(); procNavigate(input, fid, 'right'); }
      } else if (e.key === 'ArrowLeft') {
        var atStart = input.selectionStart === 0;
        if (atStart) { e.preventDefault(); procNavigate(input, fid, 'left'); }
      }
    });
  }

  /* ── 9. RECALC ── */
  function procRecalcRow(fid, id) {
    var tr = document.getElementById('proc-row-' + fid + '-' + id);
    if (!tr) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    var qtdFt  = parseFloat(inputs[0].value) || 0;
    var a4     = parseFloat(inputs[1].value) || 0;
    var a5     = parseFloat(inputs[2].value) || 0;
    var preco  = parseFloat(inputs[3].value) || 0;
    var desc   = parseFloat(inputs[4].value) || 0;
    var dEl    = document.getElementById('proc-d-'    + fid + '-' + id);
    var plusEl = document.getElementById('proc-plus-' + fid + '-' + id);
    var hasD   = dEl   ? dEl.checked   : false;
    var plus1  = plusEl ? plusEl.checked : false;
    var pecas  = a4 + a5;

    var statusEl = document.getElementById('proc-status-' + fid + '-' + id);
    if (statusEl) {
      if (!preco && !qtdFt && !pecas) {
        statusEl.textContent = '\u2014'; statusEl.className = 'proc-cell-status';
      } else if (!qtdFt || !pecas) {
        statusEl.textContent = '\u2014'; statusEl.className = 'proc-cell-status';
      } else if (pecas === qtdFt) {
        statusEl.textContent = 'OK'; statusEl.className = 'proc-cell-status ok';
      } else if (hasD) {
        var diff = pecas - qtdFt;
        statusEl.textContent = diff > 0 ? 'D (+' + diff + ')' : 'D (' + diff + ')';
        statusEl.className = 'proc-cell-status warn';
      } else {
        var diff2 = pecas - qtdFt;
        statusEl.textContent = diff2 > 0 ? '+' + diff2 + ' pzs' : diff2 + ' pzs';
        statusEl.className = 'proc-cell-status err';
      }
    }

    var pc = procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5);
    /* Linhas marcadas sem PVP (ex.: importadas de TAM, preco de
       fabrica sem margem de venda aplicavel) nunca calculam PVP nem
       margem, seja qual for o preco de custo — o preco de custo em
       si continua normal, so o PVP/margem ficam sempre vazios. */
    var semPvp = tr.dataset.semPvp === '1';
    var pvpResult = semPvp ? null : procCalcPVP(preco);
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (pvpEl) {
      var pvpDisplay = pvpEl.querySelector('.proc-pvp-display');
      var pvpCopyBtn = pvpEl.querySelector('.proc-pvp-copy-btn');
      var pvpEditInput = pvpEl.querySelector('.proc-pvp-edit-input');
      /* Only update the auto-calculated value if user hasn't manually overridden */
      if (!pvpEl._manualOverride) {
        if (pvpResult !== null) {
          pvpEl.className = 'proc-cell-computed has-val';
          pvpEl._calcValue = pvpResult.pvpFinal;
          if (pvpDisplay) pvpDisplay.textContent = pvpResult.pvpFinal.toFixed(2);
          if (pvpCopyBtn) pvpCopyBtn.style.display = 'inline-flex';
        } else {
          pvpEl.className = 'proc-cell-computed';
          pvpEl._calcValue = null;
          if (pvpDisplay) pvpDisplay.textContent = '\u2014';
          if (pvpCopyBtn) pvpCopyBtn.style.display = 'none';
        }
      }
    }

    var marg   = pvpResult ? procCalcMargem(pvpResult.pvp1, preco) : null;
    var margEl = document.getElementById('proc-marg-' + fid + '-' + id);
    if (margEl) {
      if (marg !== null) {
        var cls = 'proc-cell-computed has-val proc-margem-val';
        if (marg < 20) cls += ' very-low';
        else if (marg < 30) cls += ' low';
        margEl.textContent = marg.toFixed(1) + '%';
        margEl.className = cls;
      } else {
        margEl.textContent = '\u2014'; margEl.className = 'proc-cell-computed';
      }
    }

    var refVal = tr.querySelector('.proc-ref-input') ? tr.querySelector('.proc-ref-input').value : '';
    if (preco || refVal) tr.classList.add('has-data');
    else                 tr.classList.remove('has-data');

    procCheckRowCoherence(fid, id, tr, qtdFt, pecas, preco);
    procUpdateSummary(fid);
    /* Snapshot para undo — debounced */
    clearTimeout(procRecalcRow._undoTimer);
    procRecalcRow._undoTimer = setTimeout(procUndoSnapshot, 600);
  }

  /* ── 9b. ROW COHERENCE CHECK ── */
  /* Marca visualmente com borda laranja suave campos com incoerências:
     - Qtd 0 mas preço preenchido
     - preço 0 mas qtd preenchida
     - Total de peças (FNC+PXO) muito diferente da qtd FT (sem flag D) */
  function procCheckRowCoherence(fid, id, tr, qtdFt, pecas, preco) {
    var inputs    = tr.querySelectorAll('input[type="number"]');
    var qtdInput  = inputs[0];
    var precoInput = inputs[3];

    /* Reset warnings */
    if (qtdInput)   qtdInput.classList.remove('proc-warn-field');
    if (precoInput) precoInput.classList.remove('proc-warn-field');

    /* Qtd 0 com preço preenchido */
    if (!qtdFt && preco > 0) {
      if (qtdInput) qtdInput.classList.add('proc-warn-field');
    }
    /* Preço 0 com qtd preenchida */
    if (qtdFt > 0 && !preco) {
      if (precoInput) precoInput.classList.add('proc-warn-field');
    }
  }

  /* ── 9c. ONBOARDING TOOLTIP (once per device) ── */
  function procShowOnboardingTooltip(fid) {
    var SEEN_KEY = 'proc_onboarding_seen';
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch(e) { return; }

    var input = document.getElementById('proc-proveedor-' + fid);
    if (!input) return;

    var tip = document.createElement('div');
    tip.id = 'proc-onboarding-tip';
    tip.innerHTML =
      '<div class="proc-tip-bubble">'
      + '<span class="proc-tip-text">&#8594; começa aqui &mdash; escreve o fornecedor</span>'
      + '</div>'
      + '<div class="proc-tip-arrow"></div>';

    document.body.appendChild(tip);

    function reposition() {
      var r = input.getBoundingClientRect();
      tip.style.left = (r.left + window.scrollX) + 'px';
      tip.style.top  = (r.top + window.scrollY - tip.offsetHeight - 10) + 'px';
    }
    reposition();

    function dismiss() {
      if (!tip.parentNode) return;
      tip.style.transition = 'opacity 0.25s';
      tip.style.opacity = '0';
      setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 260);
      try { localStorage.setItem(SEEN_KEY, '1'); } catch(e) {}
      input.removeEventListener('focus', dismiss);
    }
    input.addEventListener('focus', dismiss);
    /* Auto-dismiss after 5s */
    setTimeout(dismiss, 5000);
  }

  /* ── 10. SUMMARY ── */
  function procUpdateSummary(fid) {
    var total = 0, piezas = 0, lines = 0;
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var tr   = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var nums = tr.querySelectorAll('input[type="number"]');
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var desc  = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var dEl2  = document.getElementById('proc-d-'    + fid + '-' + i);
      var pEl2  = document.getElementById('proc-plus-' + fid + '-' + i);
      var hasD2 = dEl2 ? dEl2.checked  : false;
      var plus2 = pEl2 ? pEl2.checked  : false;
      var pcs   = a4 + a5;
      if (preco && pcs) {
        var pc2 = procCalcPrecoCusto(preco, plus2, hasD2, qtdFt, a4, a5);
        total  += pcs * pc2 * (1 - desc / 100);
        piezas += pcs;
        lines++;
      }
    }
    var tcEl = document.getElementById('proc-totalCalc-'   + fid);
    var lcEl = document.getElementById('proc-lineCount-'   + fid);
    var tpEl = document.getElementById('proc-totalPiezas-' + fid);
    if (tcEl) tcEl.textContent = total.toFixed(2);
    if (lcEl) lcEl.textContent = lines;
    if (tpEl) tpEl.textContent = piezas;
    procUpdateHeader(fid, total);
  }

  function procUpdateHeader(fid, computedTotal) {
    if (computedTotal === undefined) {
      var tEl = document.getElementById('proc-totalCalc-' + fid);
      computedTotal = parseFloat(tEl ? tEl.textContent : 0) || 0;
    }
    var vEl      = document.getElementById('proc-valorFactura-' + fid);
    var ftVal    = parseFloat(vEl ? vEl.value : 0) || 0;
    var diffChip = document.getElementById('proc-diffChip-' + fid);
    if (!diffChip) return;
    if (!ftVal) {
      diffChip.className = 'proc-diff-chip zero';
      diffChip.textContent = '\u00b1 0.00 \u20ac';
      return;
    }
    var diff = computedTotal - ftVal;
    if (Math.abs(diff) < 0.01) {
      diffChip.className = 'proc-diff-chip zero'; diffChip.textContent = '\u2713 fatura certa';
      if (vEl) vEl.classList.remove('proc-warn-field', 'proc-valor-error-neg', 'proc-valor-error-pos');
      procUpdateAuditButton(fid, 0);
    } else {
      var sign = diff > 0 ? '+' : '';
      diffChip.className = 'proc-diff-chip ' + (diff > 0 ? 'pos' : 'neg');
      diffChip.textContent = 'erro ' + sign + diff.toFixed(2) + ' \u20ac';
      /* Cor do campo espelha o indicador de diferença (maroon/azul), não o aviso laranja genérico */
      if (computedTotal > 0 && Math.abs(diff) > 0.01) {
        if (vEl) {
          vEl.classList.remove('proc-warn-field');
          vEl.classList.toggle('proc-valor-error-neg', diff < 0);
          vEl.classList.toggle('proc-valor-error-pos', diff > 0);
        }
      } else {
        if (vEl) vEl.classList.remove('proc-warn-field', 'proc-valor-error-neg', 'proc-valor-error-pos');
      }
      procUpdateAuditButton(fid, diff);
    }
  }

  /* ── 10b. AUDIT ENGINE ── */

  /* Decide si el boton de auditoria debe mostrarse:
     - Hay diferencia real (diff != 0)
     - Todas las lineas con datos tienen distribucion completa (FNC+PXO == QTD o flag D)
     - No hay ninguna linea con status "err" (error de cantidades sin resolver) */
  function procUpdateAuditButton(fid, diff) {
    var btn = document.getElementById('proc-audit-btn-' + fid);
    if (!btn) return;
    if (Math.abs(diff) < 0.01) { btn.style.display = 'none'; return; }

    /* Verificar que no hay errores de cantidades pendientes */
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var statusEl = document.getElementById('proc-status-' + fid + '-' + i);
      if (statusEl && statusEl.classList.contains('err')) {
        btn.style.display = 'none';
        return;
      }
    }

    /* Verificar que todas las lineas con datos tienen distribucion completa */
    var allDistributed = true;
    for (var j = 1; j <= rc; j++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + j);
      if (!tr) continue;
      var nums = tr.querySelectorAll('input[type="number"]');
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      if (!preco && !qtdFt) continue; /* linea vacia, ignorar */
      var dCb = document.getElementById('proc-d-' + fid + '-' + j);
      var hasD = dCb ? dCb.checked : false;
      if (!hasD && qtdFt > 0 && (a4 + a5) !== qtdFt) {
        allDistributed = false;
        break;
      }
    }

    btn.style.display = allDistributed ? 'inline-block' : 'none';
  }

  /* Calcula candidatas para el panel de auditoria */
  function procComputeAuditCandidates(fid, diff) {
    var rc = rowCounts[fid] || 0;
    var lines = [];

    for (var i = 1; i <= rc; i++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var rIn  = tr.querySelector('.proc-ref-input');
      var dIn  = tr.querySelector('.proc-desc-input');
      var nums = tr.querySelectorAll('input[type="number"]');
      var dCb  = document.getElementById('proc-d-' + fid + '-' + i);
      var pCb  = document.getElementById('proc-plus-' + fid + '-' + i);
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var descPct = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var hasD  = dCb ? dCb.checked : false;
      var plus1 = pCb ? pCb.checked : false;
      var pcs   = a4 + a5;
      if (!preco || !pcs) continue;

      var pc = procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5);
      var contribution = pcs * pc * (1 - descPct / 100);

      /* pc_new: precio de coste que cerraría la diferencia si solo esta línea fuera culpable */
      var factor = pcs * (1 - descPct / 100);
      var pc_new = (contribution - diff) / factor;

      /* errorUnitario: diferencia entre pc_new y pc (ambos en precio de coste) */
      var errorUnitario = pc_new - pc;  /* negativo si hay que bajar, positivo si hay que subir */

      /* precoCorregido: precio que el usuario debería haber escrito
         Invertimos procCalcPrecoCusto: preco_correcto = preco + (pc_new - pc)
         Esto funciona porque el ajuste D y +1 son lineales sobre preco */
      var precoCorregido = preco + (pc_new - pc);

      /* distClean: distancia del precoCorregido al multiplo de 0.05 mas cercano.
         Un precio real de coste siempre es un numero limpio (x.00, x.25, x.50, x.75, x.99...).
         Si precoCorregido es limpio, esta linea es la culpable probable.
         Si no, es una linea inocente que produciria un precio absurdo al corregir. */
      var nearest = Math.round(precoCorregido / 0.05) * 0.05;
      var distClean = Math.abs(precoCorregido - nearest);

      lines.push({
        idx: i,
        ref: rIn  ? (rIn.value  || '—') : '—',
        desc: dIn ? (dIn.value || '') : '',
        preco: preco,
        precoCorregido: precoCorregido,
        errorUnitario: Math.abs(errorUnitario),
        distClean: distClean,
        pcs: pcs
      });
    }

    /* Ordenar por distClean: el precoCorregido mas limpio (cercano a multiplo de 0.05) va primero */
    lines.sort(function(a, b) { return a.distClean - b.distClean; });

    /* Candidatas simples: todas, ordenadas */
    var singles = lines.slice(0, 5);

    /* Candidatas dobles: pares donde ambos errores unitarios son menores que el error mayor de las simples */
    var doubles = [];
    var threshold = singles.length ? singles[singles.length - 1].distClean : Infinity;
    for (var p = 0; p < lines.length && doubles.length < 3; p++) {
      for (var q2 = p + 1; q2 < lines.length && doubles.length < 3; q2++) {
        /* Si entre los dos explican la diferencia con errores unitarios razonables */
        /* No hay una solucion unica para dos incognitas, pero podemos mostrar
           el par con menor suma de errores si la diferencia se puede repartir */
        /* Heuristica: si ambos tienen pcs similares, cada uno absorbe ~diff/2 */
        var eA = Math.abs(diff / 2 / (lines[p].pcs  * (1 - 0)));
        var eB = Math.abs(diff / 2 / (lines[q2].pcs * (1 - 0)));
        if (eA < 0.05 && eB < 0.05) {
          doubles.push({ a: lines[p], b: lines[q2], eA: eA, eB: eB });
        }
      }
    }

    return { singles: singles, doubles: doubles, diff: diff };
  }

  function procShowAuditPanel(fid) {
    var vEl  = document.getElementById('proc-valorFactura-' + fid);
    var tEl  = document.getElementById('proc-totalCalc-'   + fid);
    var ftVal = parseFloat(vEl ? vEl.value : 0) || 0;
    var calc  = parseFloat(tEl ? tEl.textContent : 0) || 0;
    var diff  = calc - ftVal;

    var result = procComputeAuditCandidates(fid, diff);
    var sign   = diff > 0 ? '+' : '';

    /* ── Build panel HTML ── */
    var rowsHTML = '';
    result.singles.forEach(function(c, idx) {
      var arrow = diff > 0 ? '\u2193' : '\u2191'; /* seta direcao correcao */
      var precoStr    = c.preco.toFixed(2).replace('.', ',') + ' \u20ac';
      var corrigStr   = c.precoCorregido.toFixed(2).replace('.', ',') + ' \u20ac';
      var errStr      = (diff > 0 ? '-' : '+') + c.errorUnitario.toFixed(2).replace('.', ',') + ' \u20ac/un';
      var highlight   = idx === 0 ? 'proc-audit-row-top' : '';
      rowsHTML +=
        '<tr class="proc-audit-row ' + highlight + '">'
        + '<td class="proc-audit-ref">' + c.ref + (c.desc ? '<span class="proc-audit-desc"> ' + c.desc.slice(0, 22) + '</span>' : '') + '</td>'
        + '<td class="proc-audit-val">' + precoStr + '</td>'
        + '<td class="proc-audit-arrow">' + arrow + '</td>'
        + '<td class="proc-audit-val proc-audit-corr">' + corrigStr + '</td>'
        + '<td class="proc-audit-pcs">' + c.pcs + ' pcs</td>'
        + '<td class="proc-audit-err">' + errStr + '</td>'
        + '</tr>';
    });

    var doublesHTML = '';
    if (result.singles.length === 0 || result.singles[0].errorUnitario > 1) {
      /* Solo mostrar pares si las simples no son convincentes */
      result.doubles.forEach(function(d) {
        doublesHTML +=
          '<div class="proc-audit-pair">'
          + '\u2197 ' + d.a.ref + ' + ' + d.b.ref
          + ' <span class="proc-audit-pair-err">(&plusmn;' + d.eA.toFixed(2) + ' + &plusmn;' + d.eB.toFixed(2) + ' \u20ac/un)</span>'
          + '</div>';
      });
    }

    var modal = document.createElement('div');
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel proc-or-panel--narrow">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Auditoria de pre\u00e7os</span>'
      +       '<span class="proc-or-panel-title-sub">Diferen\u00e7a: ' + sign + diff.toFixed(2) + ' \u20ac \u00b7 linhas mais prov\u00e1veis</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">\u2715</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll proc-or-scroll--padded">'
      +     '<div class="proc-audit-explain">O sistema calculou, para cada linha, qual seria o pre\u00e7o unit\u00e1rio necess\u00e1rio para fechar a diferen\u00e7a. As linhas com menor ajuste necess\u00e1rio s\u00e3o as mais prov\u00e1veis.</div>'
      +     '<table class="proc-audit-table">'
      +       '<thead><tr>'
      +         '<th>Refer\u00eancia</th>'
      +         '<th>Pre\u00e7o atual</th>'
      +         '<th></th>'
      +         '<th>Pre\u00e7o correto</th>'
      +         '<th>Pcs</th>'
      +         '<th>Erro/un</th>'
      +       '</tr></thead>'
      +       '<tbody>' + rowsHTML + '</tbody>'
      +     '</table>'
      +     (doublesHTML ? '<div class="proc-audit-pairs-title">Poss\u00edveis combina\u00e7\u00f5es de duas linhas:</div>' + doublesHTML : '')
      +     '<div class="proc-audit-note">Clica numa linha da tabela para ir diretamente a esse campo de pre\u00e7o.</div>'
      +   '</div>'
      + '</div>';

    /* Click on row navigates to that price input */
    procOpenModal(modal);
    modal.querySelector('.proc-or-backdrop').addEventListener('click', function() { procCloseModal(modal); });
    modal.querySelector('.proc-or-close-btn').addEventListener('click',  function() { procCloseModal(modal); });
    var esc = function(e) { if (e.key === 'Escape') { procCloseModal(modal); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);

    /* Row click — focus price input */
    modal.querySelectorAll('.proc-audit-row').forEach(function(tr2, idx2) {
      tr2.style.cursor = 'pointer';
      tr2.addEventListener('click', function() {
        procCloseModal(modal);
        var candidate = result.singles[idx2];
        if (!candidate) return;
        var rowEl = document.getElementById('proc-row-' + fid + '-' + candidate.idx);
        if (!rowEl) return;
        var priceInput = rowEl.querySelectorAll('input[type="number"]')[3];
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
          priceInput.classList.add('proc-warn-field');
          setTimeout(function() { priceInput.classList.remove('proc-warn-field'); }, 3000);
        }
      });
    });
  }

    /* ── 11. CALC HELPERS ── */
  function procCalcPVP(preco) {
    if (!preco || preco <= 0) return null;
    var raw  = preco * 2 + (preco * 2) * 0.23;
    var r    = Math.round(raw) - 0.01;
    var pvp1 = r < raw ? r + 1 : r;
    pvp1 = Math.round(pvp1 * 100) / 100;
    if (Math.abs(pvp1 - 13.99) < 0.005) pvp1 = 14.99;
    var pvpFinal = Math.round((pvp1 + 1) * 100) / 100;
    if (Math.abs(pvpFinal - 13.99) < 0.005) pvpFinal = 14.99;
    return { pvp1: pvp1, pvpFinal: pvpFinal };
  }
  function procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5) {
    if (!preco) return 0;
    var p   = preco;
    if (plus1) p += 1;
    var pcs = (a4 || 0) + (a5 || 0);
    if (hasD && qtdFt && pcs && pcs !== qtdFt) p = (qtdFt * p) / pcs;
    return p;
  }
  function procCalcMargem(pvp1, precoOriginal) {
    if (!pvp1 || !precoOriginal) return null;
    var pvpSemIVA = pvp1 / 1.22;
    return ((pvpSemIVA - precoOriginal) / pvpSemIVA) * 100;
  }

  /* ── 12. COLLECT ROWS ── */
  function procCollectRows(fid) {
    var result = [];
    var rc = rowCounts[fid] || 0;
    for (var i = 1; i <= rc; i++) {
      var tr  = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var rIn  = tr.querySelector('.proc-ref-input');
      var dIn2 = tr.querySelector('.proc-desc-input');
      var nums = tr.querySelectorAll('input[type="number"]');
      var oIn  = tr.querySelector('.proc-obs-input');
      var dCb  = document.getElementById('proc-d-'    + fid + '-' + i);
      var pCb  = document.getElementById('proc-plus-' + fid + '-' + i);
      var ref   = rIn  ? rIn.value.trim()  : '';
      var desc  = dIn2 ? dIn2.value.trim() : '';
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      var dPct  = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var hasD3 = dCb ? dCb.checked : false;
      var plus3 = pCb ? pCb.checked : false;
      var obs   = oIn ? oIn.value   : '';
      var flagBtn = document.getElementById('proc-flag-' + fid + '-' + i);
      var flagged = flagBtn ? flagBtn.classList.contains('flagged') : false;
      if (!ref && !preco && !flagged) continue;
      var pc3raw = procCalcPrecoCusto(preco, plus3, hasD3, qtdFt, a4, a5);
      /* Apply row discount to cost price (descPct column) */
      var pc3 = pc3raw * (1 - dPct / 100);
      /* Collect manual PVP override if any */
      var pvpEl3    = document.getElementById('proc-pvp-' + fid + '-' + i);
      var pvpManual = (pvpEl3 && pvpEl3._manualOverride) ? parseFloat((pvpEl3.querySelector('.proc-pvp-display') || {}).textContent) || null : null;
      var semPvp3   = tr.dataset.semPvp === '1';
      result.push({ ref:ref, desc:desc, qtdFt:qtdFt, a4:a4, a5:a5,
                    preco:preco, descPct:dPct, hasD:hasD3, plus1:plus3,
                    precoCusto:pc3, obs:obs, flagged:flagged, pvpManual:pvpManual, semPvp:semPvp3 });
    }
    return result;
  }

  /* Devolve o conjunto de chaves (referencia_original|categoria) que
     OUTRAS facturas activas (excepto fidExcluir) do MESMO fornecedor
     ainda tem nas suas linhas neste momento. Usado para nunca apagar em
     Supabase uma referencia de que outra factura aberta ainda precisa —
     mesmo que a factura actual tenha total autonomia sobre o que E SO
     DELA. */
  function procChavesUsadasPorOutrasFaturas(proveedorNorm, fidExcluir, categorias) {
    var chaves = {};
    if (!proveedorNorm) return chaves;
    activeFaturas.forEach(function(outroFid) {
      if (outroFid === fidExcluir) return;
      var pEl = document.getElementById('proc-proveedor-' + outroFid);
      var outroForn = pEl ? procNormalize(pEl.value) : '';
      if (outroForn !== proveedorNorm) return;
      procCollectRows(outroFid).forEach(function(r) {
        if (!r.ref) return;
        var refNorm = procNormalizarRefOriginal(r.ref);
        if (!refNorm) return;
        var categoria = procResolverCategoria(r.desc, categorias || []);
        chaves[refNorm + '|' + categoria] = true;
      });
    });
    return chaves;
  }

  /* Sibling de procChavesUsadasPorOutrasFaturas, mas a granularidade de
     LINHA: verifica se alguma OUTRA linha (em qualquer factura aberta do
     mesmo fornecedor, incluindo a mesma factura, mas excluindo a propria
     linha que esta a ser editada) ainda usa a chave indicada. Garante que
     duas linhas identicas (ex.: duas "X1 CAMISA") nunca fazem com que a
     referencia seja apagada ou repontada enquanto pelo menos uma delas
     ainda precisar dela. */
  function procChaveEmUsoNoutraLinha(proveedorNorm, chave, trIdAtual, categorias) {
    var encontrada = false;
    activeFaturas.forEach(function(outroFid) {
      if (encontrada) return;
      var pEl = document.getElementById('proc-proveedor-' + outroFid);
      var outroForn = pEl ? procNormalize(pEl.value) : '';
      if (outroForn !== proveedorNorm) return;
      var rc = rowCounts[outroFid] || 0;
      for (var j = 1; j <= rc; j++) {
        var tr = document.getElementById('proc-row-' + outroFid + '-' + j);
        if (!tr || tr.id === trIdAtual) continue;
        var rIn = tr.querySelector('.proc-ref-input');
        var dIn = tr.querySelector('.proc-desc-input');
        var ref = rIn ? rIn.value.trim() : '';
        if (!ref) continue;
        var refNorm = procNormalizarRefOriginal(ref);
        var categoria = procResolverCategoria(dIn ? dIn.value.trim() : '', categorias || []);
        if ((refNorm + '|' + categoria) === chave) { encontrada = true; break; }
      }
    });
    return encontrada;
  }

  /* Reage a uma edicao (correcao ou limpeza) da referencia/descricao de
     uma linha cuja referencia_interna ja possa ter sido atribuida em
     Supabase. Duas situacoes:
       1. Referencia E descricao ficaram ambas vazias → a intencao foi
          apagar a linha: apaga a entrada em proc_referencias (via RPC
          proc_borrar_referencias_rascunho, que ja protege guias ja
          enviadas ao ERP).
       2. A linha ainda tem conteudo (correcao de um erro de digitacao,
          possivelmente depois de a etiqueta ja ter sido impressa) → a
          intencao foi CORRIGIR: a referencia_interna existente deve ser
          preservada, apenas os campos referencia_original/categoria sao
          actualizados. Isto e feito atomicamente do lado do servidor
          via RPC proc_corrigir_referencia (SECURITY DEFINER) — nunca por
          PATCH directo do browser, que fica bloqueado em silencio pelas
          politicas de RLS (so ha politicas de INSERT/SELECT nesta
          tabela). */
  function procTratarEdicaoLinha(fid, i, refAntigo, descAntigo) {
    var pEl = document.getElementById('proc-proveedor-' + fid);
    var proveedorNorm = pEl ? procNormalize(pEl.value) : '';
    if (!proveedorNorm) return;
    var refNormAntigo = procNormalizarRefOriginal(refAntigo);
    if (!refNormAntigo) return;

    var tr = document.getElementById('proc-row-' + fid + '-' + i);
    if (!tr) return;
    var rIn = tr.querySelector('.proc-ref-input');
    var dIn = tr.querySelector('.proc-desc-input');
    var refNovo  = rIn ? rIn.value.trim() : '';
    var descNovo = dIn ? dIn.value.trim() : '';
    var ano = new Date().getFullYear() % 100;

    procLoadCategoriasRemote().then(function(categorias) {
      var categoriaAntiga = procResolverCategoria(descAntigo, categorias);
      var chaveAntiga = refNormAntigo + '|' + categoriaAntiga;

      if (procChaveEmUsoNoutraLinha(proveedorNorm, chaveAntiga, tr.id, categorias)) return;

      var totalmenteVazio = !refNovo && !descNovo;

      if (totalmenteVazio) {
        procSbFetch(
          'proc_referencias?proveedor=eq.' + encodeURIComponent(proveedorNorm) + '&ano=eq.' + ano
            + '&referencia_original=eq.' + encodeURIComponent(refNormAntigo) + '&categoria=eq.' + encodeURIComponent(categoriaAntiga)
            + '&select=id,referencia_interna',
          { method: 'GET' }
        ).then(function(r) { return r.ok ? r.json() : []; })
         .then(function(rows) {
           if (!rows || !rows.length) return;
           var refs = rows.map(function(row) { return row.referencia_interna; });
           procSbFetch('rpc/proc_borrar_referencias_rascunho', {
             method: 'POST',
             body: JSON.stringify({ p_proveedor: proveedorNorm, p_referencias: refs })
           }).catch(function() {});
         });
        return;
      }

      if (!refNovo) return;

      var categoriaNova = procResolverCategoria(descNovo, categorias);
      if (refNormAntigo === procNormalizarRefOriginal(refNovo) && categoriaAntiga === categoriaNova) return;

      procSbFetch('rpc/proc_corrigir_referencia', {
        method: 'POST',
        body: JSON.stringify({
          p_proveedor: proveedorNorm,
          p_referencia_original_antiga: refNormAntigo,
          p_categoria_antiga: categoriaAntiga,
          p_ano: ano,
          p_referencia_original_nova: refNovo,
          p_categoria_nova: categoriaNova
        })
      }).catch(function() {});
    }).catch(function() {});
  }

  /* ── 13. COPY BAR HELPER ── */
  function procBindCopyBar(modal, cols, getVal) {
    var msg   = modal.querySelector('.proc-or-copy-msg');
    var timer = null;
    modal.querySelectorAll('.proc-or-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ci   = parseInt(btn.dataset.col);
        var vals = getVal(ci);
        if (!vals.length) return;
        modal.querySelectorAll('.proc-or-copy-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var text = vals.join('\n');
        var show = function(ok) {
          if (msg) {
            msg.textContent = ok ? '\u2713 ' + cols[ci] + ' copiado!' : '\u26a0 copie manualmente';
            msg.style.color = ok ? '#4A7C6F' : '#5F7B94';
          }
          if (timer) clearTimeout(timer);
          timer = setTimeout(function() {
            if (msg) msg.textContent = '';
            modal.querySelectorAll('.proc-or-copy-btn').forEach(function(b) { b.classList.remove('active'); });
          }, 2200);
        };
        var fallback = function() {
          try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.className = 'proc-clipboard-hack';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); show(true);
          } catch(e) { show(false); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() { show(true); }).catch(fallback);
        } else { fallback(); }
      });
    });
  }

  /* ── 14. MODAL HELPERS ── */
  function procOpenModal(modal) {
    document.body.appendChild(modal);
    requestAnimationFrame(function() { modal.classList.add('visible'); });
  }
  function procCloseModal(modal) {
    modal.classList.remove('visible');
    setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
  }
  function procBindClose(modal) {
    modal.querySelector('.proc-or-backdrop').addEventListener('click', function() { procCloseModal(modal); });
    modal.querySelector('.proc-or-close-btn').addEventListener('click',  function() { procCloseModal(modal); });
    var esc = function(e) { if (e.key === 'Escape') { procCloseModal(modal); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  /* ── 15. STOCK MODAL ── */
  function procShowStockModal(fid) {
    var rowsOriginais = procCollectRows(fid);
    var pEl0           = document.getElementById('proc-proveedor-' + fid);
    var proveedorNorm0 = pEl0 ? procNormalize(pEl0.value) : '';

    function construirComRows(rows) {
      var pEl       = document.getElementById('proc-proveedor-' + fid);
      var proveedor = pEl ? (pEl.value || '\u2014') : '\u2014';

      /* ── Build raw lines, then merge equal refs per ARM ── */
      var rawLines = [];
      [['Funchal','A4'],['Porto Santo','A5']].forEach(function(pair) {
        var loja = pair[0], cod = pair[1];
        rows.forEach(function(r) {
          var qty = cod === 'A4' ? r.a4 : r.a5;
          if (qty > 0) rawLines.push({ ref:r.ref, loja:loja, cod:cod, precio:r.precoCusto, qty:qty });
        });
      });

      /* Merge: group by ref+cod, sum qty, average price when prices differ */
      var map = {};
      rawLines.forEach(function(l) {
        var key = l.ref + '||' + l.cod;
        if (!map[key]) {
          map[key] = { ref:l.ref, loja:l.loja, cod:l.cod, qty:0, _prices:[], _totalQty:0 };
        }
        map[key].qty      += l.qty;
        map[key]._prices.push(l.precio);
        map[key]._totalQty += l.qty;
      });
      var lines = Object.keys(map).map(function(k) {
        var m = map[k];
        var prices = m._prices;
        /* Average price (weighted equally per row, not per unit) */
        var avgPrice = prices.reduce(function(s,p){ return s+p; }, 0) / prices.length;
        return { ref:m.ref, loja:m.loja, cod:m.cod, iva:'23', precio:avgPrice, qty:m.qty };
      });

      /* ── Simple nearest rounding: round each unit price to 2 decimals.
         Max error per line = 0.005€, so for 73 lines max total drift ≈ ±0.36€ ── */
      lines.forEach(function(l) {
        l.precio = Math.round(l.precio * 100) / 100;
      });

      /* ── Ajuste de cêntimos: aproximar o total ao valor da fatura ── */
      var vElAdj  = document.getElementById('proc-valorFactura-' + fid);
      var ftValAdj = parseFloat(vElAdj ? vElAdj.value : 0) || 0;
      if (ftValAdj > 0) {
        var stockTotal = lines.reduce(function(s, l) {
          return s + Math.round(l.precio * l.qty * 100) / 100;
        }, 0);
        var diffCents = Math.round((ftValAdj - stockTotal) * 100);
        if (diffCents !== 0) {
          /* Ordenar por qty ascendente — menos peças = menos impacto por cêntimo */
          var sortedAdj = lines.slice().sort(function(a, b) { return a.qty - b.qty; });
          for (var ai = 0; ai < sortedAdj.length && diffCents !== 0; ai++) {
            var ll   = sortedAdj[ai];
            var sign = diffCents > 0 ? 1 : -1;
            var afterDiff = diffCents - sign * ll.qty;
            if (Math.abs(afterDiff) <= Math.abs(diffCents)) {
              ll.precio = Math.round((ll.precio + sign * 0.01) * 100) / 100;
              diffCents = afterDiff;
            }
          }
        }
      }

      /* ── Render helpers ── */
      var currentIva = '23';

      function buildTableRows() {
        if (!lines.length) return '<tr class="empty-row"><td colspan="5">Sem linhas com dados para mostrar</td></tr>';
        return lines.map(function(l) {
          return '<tr>'
            + '<td>' + l.ref + '</td>'
            + '<td class="center proc-cod-td">' + l.cod + '</td>'
            + '<td class="center">' + currentIva + '</td>'
            + '<td class="right">' + l.precio.toFixed(2) + '</td>'
            + '<td class="center">' + l.qty + '</td>'
            + '</tr>';
        }).join('');
      }

      var totalFunchal    = lines.filter(function(l) { return l.cod==='A4'; }).reduce(function(s,l) { return s+l.qty; }, 0);
      var totalPortoSanto = lines.filter(function(l) { return l.cod==='A5'; }).reduce(function(s,l) { return s+l.qty; }, 0);
      var totalStock      = lines.reduce(function(s,l) { return s + l.qty * l.precio; }, 0);

      /* Delta residual após ajuste de cêntimos */
      var deltaLabel = '';
      if (ftValAdj > 0) {
        var residualCents = Math.round((ftValAdj - totalStock) * 100);
        deltaLabel = residualCents === 0
          ? ' \u00b7 \u0394 0,00 \u20ac'
          : ' \u00b7 \u0394 ' + (residualCents > 0 ? '+' : '') + (residualCents / 100).toFixed(2) + ' \u20ac';
      }

      var COLS = ['Refer\u00eancia','ARM','IVA','\u20ac','Qtd.'];

      var corrAtual = _procDataCorrigidaPorFatura[fid] || null;

      var modal = document.createElement('div');
      modal.className = 'proc-or-modal';
      modal.innerHTML =
          '<div class="proc-or-backdrop"></div>'
        + '<div class="proc-or-panel proc-or-panel--stock">'
        +   '<div class="proc-or-panel-header">'
        +     '<div class="proc-or-panel-title">'
        +       '<span class="proc-or-panel-title-main">' + proveedor + '</span>'
        +       '<span class="proc-or-panel-title-sub">Ingresso de Stock \u00b7 ERP</span>'
        +       '<span class="proc-stock-corrigir-data-btn" id="proc-stock-corrigir-data-btn" title="' + procTituloBotaoDataCorrigida(corrAtual).replace(/"/g,'&quot;') + '" style="' + procEstiloBotaoDataCorrigida(corrAtual) + '">\u2731</span>'
        +     '</div>'
        +     '<div class="proc-or-panel-header-btns">'
        +       '<label class="proc-stock-iva-label">IVA&nbsp;%</label>'
        +       '<input id="proc-stock-iva-input" type="text" value="23" maxlength="6" />'
        +       '<button class="proc-or-action-btn" id="proc-stock-export-btn">\u2b07 exportar CSV</button>'
        +       '<button class="proc-or-close-btn">\u2715</button>'
        +     '</div>'
        +   '</div>'
        +   '<div class="proc-or-scroll">'
        +     '<table class="proc-or-table proc-stock-table"><thead><tr>'
        +       '<th class="proc-stock-th-ref"><button class="proc-or-copy-btn proc-or-copy-th-btn" data-col="0">Refer\u00eancia</button></th>'
        +       '<th class="center proc-stock-th-arm"><button class="proc-or-copy-btn proc-or-copy-th-btn" data-col="1">ARM</button></th>'
        +       '<th class="center proc-stock-th-iva"><button class="proc-or-copy-btn proc-or-copy-th-btn" data-col="2">IVA</button></th>'
        +       '<th class="center proc-stock-th-preco"><button class="proc-or-copy-btn proc-or-copy-th-btn" data-col="3">\u20ac</button></th>'
        +       '<th class="center proc-stock-th-qtd"><button class="proc-or-copy-btn proc-or-copy-th-btn" data-col="4">Qtd.</button></th>'
        +     '</tr></thead>'
        +     '<tbody id="proc-stock-tbody">' + buildTableRows() + '</tbody>'
        +     '</table>'
        +   '</div>'
        +   '<div class="proc-or-panel-footer">'
        +     lines.length + ' linhas \u00b7 ' + totalFunchal + ' un. Funchal \u00b7 ' + totalPortoSanto + ' un. Porto Santo'
        +     ' \u00b7 <strong class="proc-stock-total-strong">Total: ' + totalStock.toFixed(2) + '</strong>'
        +     deltaLabel
        +     '<span class="proc-or-copy-msg" id="proc-stock-copy-msg"></span>'
        +   '</div>'
        + '</div>';

      /* ── IVA input: update entire column on change ── */
      var ivaInput = modal.querySelector('#proc-stock-iva-input');
      ivaInput.addEventListener('input', function() {
        currentIva = ivaInput.value.trim();
        var tbody = modal.querySelector('#proc-stock-tbody');
        if (tbody) tbody.innerHTML = buildTableRows();
      });
      ivaInput.addEventListener('focus', function() { ivaInput.style.borderColor='#000'; });
      ivaInput.addEventListener('blur',  function() { ivaInput.style.borderColor='#ccc'; });

      /* Bot\u00e3o \u2731 \u2014 corrigir manualmente a data real desta factura.
         window.prompt() em vez de procFloatModal porque este ultimo
         remove o body do DOM antes de invocar o callback do botao,
         o que impossibilitaria ler um <input> colocado la dentro. */
      var corrBtn = modal.querySelector('#proc-stock-corrigir-data-btn');
      if (corrBtn) {
        corrBtn.addEventListener('click', function() {
          var atual = _procDataCorrigidaPorFatura[fid] || null;
          var sugestao = atual && atual.data ? atual.data : '';
          var resp = window.prompt('Data real desta factura (DD/MM/AAAA):', sugestao);
          if (resp === null) return;
          resp = resp.trim();
          if (!resp) {
            delete _procDataCorrigidaPorFatura[fid];
            corrBtn.setAttribute('style', procEstiloBotaoDataCorrigida(null));
            corrBtn.setAttribute('title', procTituloBotaoDataCorrigida(null));
            procSaveSession(true);
            return;
          }
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(resp)) {
            window.alert('Formato inv\u00e1lido. Use DD/MM/AAAA.');
            return;
          }
          var partes = resp.split('/');
          var dia = parseInt(partes[0], 10), mes = parseInt(partes[1], 10), ano = parseInt(partes[2], 10);
          var dataObj = new Date(ano, mes - 1, dia);
          if (dataObj.getFullYear() !== ano || (dataObj.getMonth() + 1) !== mes || dataObj.getDate() !== dia) {
            window.alert('Data inv\u00e1lida.');
            return;
          }
          _procDataCorrigidaPorFatura[fid] = { data: resp, movida: false, sessaoDestino: null, movidaEm: null };
          corrBtn.setAttribute('style', procEstiloBotaoDataCorrigida(_procDataCorrigidaPorFatura[fid]));
          corrBtn.setAttribute('title', procTituloBotaoDataCorrigida(_procDataCorrigidaPorFatura[fid]));
          procSaveSession(true);
        });
      }

      procBindClose(modal);
      procBindCopyBar(modal, COLS, function(ci) {
        return lines.map(function(l) {
          if (ci===0) return l.ref;
          if (ci===1) return l.cod;
          if (ci===2) return currentIva;
          if (ci===3) return l.precio.toFixed(2).replace('.',',');
          return String(l.qty);
        });
      });

      modal.querySelector('#proc-stock-export-btn').addEventListener('click', function() {
        var bom    = '\uFEFF';
        var header = 'Refer\u00eancia;Armaz\u00e9m;IVA;Pre\u00e7o;Quantidade';
        var body   = lines.map(function(l) {
          return [l.ref, l.cod, currentIva, l.precio.toFixed(2).replace('.',','), l.qty].join(';');
        }).join('\r\n');
        var blob = new Blob([bom + header + '\r\n' + body], { type:'text/csv;charset=utf-8;' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url;
        a.download = 'Stock_' + proveedor.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      });

      procOpenModal(modal);
    }

    var usaNomenclaturaFatura = procNomenclaturaAtivaParaFatura(fid);

    if (!proveedorNorm0 || !usaNomenclaturaFatura) { construirComRows(rowsOriginais); return; }

    procLoadFornecedorInfo(pEl0.value).then(function(info) {
      if (!info || !info.codigo) {
        construirComRows(rowsOriginais);
        return;
      }
      var ano0 = new Date().getFullYear() % 100;
      Promise.all([
        procLoadCategoriasRemote(),
        procSbFetch(
          'proc_referencias?proveedor=eq.' + encodeURIComponent(proveedorNorm0) + '&ano=eq.' + ano0 + '&select=referencia_interna,referencia_original,categoria',
          { method: 'GET' }
        ).then(function(r) { return r.ok ? r.json() : []; })
      ])
        .then(function(res) {
          var categorias0  = res[0];
          var todasDoAno0  = res[1] || [];
          var mapa0 = {};
          todasDoAno0.forEach(function(row) {
            mapa0[row.referencia_original + '|' + row.categoria] = row.referencia_interna;
          });
          var rowsTraduzidas = rowsOriginais.map(function(r) {
            var refNorm0    = procNormalizarRefOriginal(r.ref);
            var categoria0  = procResolverCategoria(r.desc, categorias0);
            var nova0       = mapa0[refNorm0 + '|' + categoria0];
            return nova0 ? Object.assign({}, r, { ref: nova0 }) : r;
          });
          construirComRows(rowsTraduzidas);
        })
        .catch(function() { construirComRows(rowsOriginais); });
    }).catch(function() { construirComRows(rowsOriginais); });
  }

  /* ── 15b. FLOATING ACTION BUTTONS ── */
  function procCreateFloatingButtons() {
    if (document.getElementById('proc-float-actions')) return;
    var wrap = document.createElement('div');
    wrap.id = 'proc-float-actions';

    var saveBtn = document.createElement('button');
    saveBtn.id = 'proc-float-save';
    saveBtn.className = 'proc-float-btn';
    saveBtn.title = 'Guardar sessão';
    saveBtn.innerHTML = '<span class="proc-float-btn-icon">&#128190;</span>';
    saveBtn.addEventListener('click', function() { procSaveSession(true); });

    wrap.appendChild(saveBtn);
    document.body.appendChild(wrap);

    /* Show float buttons only when the top session bar scrolls out of view */
    var sessionBar = document.getElementById('proc-session-bar');
    if (sessionBar && window.IntersectionObserver) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var enabled = wrap.getAttribute('data-enabled');
          if (!enabled) return;
          if (!entry.isIntersecting) {
            wrap.classList.add('proc-float-visible');
          } else {
            wrap.classList.remove('proc-float-visible');
          }
        });
      }, { threshold: 0, rootMargin: '0px' });
      observer.observe(sessionBar);
      wrap._observer = observer;
    }
  }

  function procShowFloatingButtons() {
    var wrap = document.getElementById('proc-float-actions');
    if (!wrap) return;
    wrap.setAttribute('data-enabled', '1');
    /* If observer not supported, fall back to always-visible */
    if (!window.IntersectionObserver) wrap.classList.add('proc-float-visible');
  }

  function procHideFloatingButtons() {
    var wrap = document.getElementById('proc-float-actions');
    if (!wrap) return;
    wrap.removeAttribute('data-enabled');
    wrap.classList.remove('proc-float-visible');
  }

  /* ── 16. BUILD OVERLAY HTML ── */
  function buildOverlayContent(container) {
    container.id = 'proc-content';
    container.innerHTML =
        '<div class="page-wrap">'
      /* ── Session bar — always visible, never blocking ── */
      +   '<div id="proc-session-bar">'
      +     '<div id="proc-session-bar-left">'
      +       '<span id="proc-session-label" style="display:none;"></span>'
      +       '<span id="proc-saveStatus" class="proc-save-status" style="display:none;"></span>'
      +     '</div>'
      +     '<div id="proc-session-bar-center">'
      +       '<button class="proc-btn primary" id="proc-start-new-btn">Iniciar nova sessão</button>'
      +       '<button type="button" id="proc-start-extra-btn" title="Importar históricos" style="margin-left:6px;font-size:.85rem;font-weight:700;color:#8a6d1a;background:none;border:1px solid #C9A227;border-radius:6px;width:28px;height:28px;line-height:1;cursor:pointer;vertical-align:middle;">✱</button>'
      +     '</div>'
      +     '<div id="proc-start-extra-menu" style="display:none;position:fixed;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.14);z-index:50;min-width:220px;overflow:hidden;text-align:left;">'
      +       '<button type="button" id="proc-import-hist-btn" onclick="procAbrirImportadorHistorico();document.getElementById(\'proc-start-extra-menu\').style.display=\'none\';" style="display:block;width:100%;text-align:left;padding:10px 14px;font-size:.75rem;font-weight:600;color:#333;background:none;border:none;cursor:pointer;">Importar histórico</button>'
      +       '<button type="button" id="proc-import-vendas-btn2" onclick="procAbrirImportadorVendas();document.getElementById(\'proc-start-extra-menu\').style.display=\'none\';" style="display:block;width:100%;text-align:left;padding:10px 14px;font-size:.75rem;font-weight:600;color:#333;background:none;border:none;cursor:pointer;border-top:1px solid #eee;">Importar vendas (Primavera)</button>'
      +     '</div>'
      +     '<div id="proc-session-bar-right" style="display:none;">'
      +       '<button class="proc-btn" id="proc-sessionMenuBtn">&#9776; sess&#245;es &#x25be;</button>'
      +       '<div id="proc-sessionMenuDropdown" class="proc-session-dropdown hidden"></div>'
      +       '<button class="proc-btn proc-icon-btn" id="proc-buscaToggleBtn" title="Consultar refer\u00eancia">&#128269;</button>'
      +       '<div id="proc-buscaPopover" class="proc-busca-popover hidden">'
      +         '<input type="text" id="proc-busca-referencia-input-bar" class="proc-busca-input" autocomplete="off" placeholder="Consultar refer\u00eancia\u2026">'
      +         '<div id="proc-busca-dropdown-bar" class="proc-busca-dropdown hidden"></div>'
      +       '</div>'
      +       '<button class="proc-btn primary" id="proc-saveBtn" style="display:none;">&#128190;</button>'
      +       '<button class="proc-btn" id="proc-guiaBtn" style="display:none;">&#128203;</button>'
      +     '</div>'
      +   '</div>'
      /* ── Session start panel — visible only before a session is active ── */
      +   '<div id="proc-session-start">'
      +     '<div id="proc-session-start-inner">'
      +       '<div id="proc-busca-referencia-wrap">'
      +         '<input type="text" id="proc-busca-referencia-input" class="proc-busca-input" autocomplete="off" placeholder="Consultar refer\u00eancia (original ou refer\u00eancia interna)\u2026">'
      +         '<div id="proc-busca-dropdown" class="proc-busca-dropdown hidden"></div>'
      +       '</div>'
      +       '<div style="text-align:right;margin:2px 2px 10px;">'
      +         '<button type="button" id="proc-totais-fornecedor-btn" onclick="procMostrarModalTotaisPorFornecedor()" style="font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#000;opacity:.35;background:none;border:none;cursor:pointer;padding:2px 4px;">Totais por Fornecedor</button>'
      +         '<button type="button" id="proc-artigos-fornecedor-btn" onclick="procMostrarModalFornecedoresArtigos()" style="font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#000;opacity:.35;background:none;border:none;cursor:pointer;padding:2px 4px;">Artigos por Fornecedor</button>'
      +       '</div>'
      +       '<div id="proc-start-sessions-list"></div>'
      +     '</div>'
      +   '</div>'
      /* ── Main work area — hidden until session active ── */
      +   '<div id="proc-main-area" style="display:none;">'
      +     '<div class="proc-top-bar">'
      +       '<h1 class="proc-app-title">Processamento de Faturas</h1>'
      +     '</div>'
      +     '<div id="proc-faturasContainer"></div>'
      +     '<div class="proc-add-fatura-wrap">'
      +       '<button class="proc-add-fatura-btn proc-btn" id="proc-addFaturaBtn">&#65291; adicionar fatura</button>'
      +     '</div>'
      +     '<div class="proc-disclaimer-bar">'
      +     '<div class="proc-disclaimer-msg">'
      +       'SE OS ITENS TIVEREM DESCONTO DEVES INSERIR O PRE\u00c7O NORMAL E, NA COLUNA DE %, INSERIR O VALOR DO DESCONTO (%).'
      +     '</div>'
      +     '<div class="proc-disclaimer-msg">'
      +       'SE FOR NECESS\u00c1RIO ADICIONAR 1\u20ac POR TRANSPORTE, ACTIVA O BOT\u00c3O <strong>+1\u20ac</strong> NA LINHA DA REFER\u00caNCIA CORRESPONDENTE.'
      +     '</div>'
      +     '<div class="proc-disclaimer-msg">'
      +       '<strong>BOT\u00c3O D \u2014 DILUI\u00c7\u00c3O DE PRE\u00c7O:</strong> '
      +       'SE FALTAREM PE\u00c7AS E FOREM SATISFEITAS NOUTRA FATURA, OU SE VIEREM PE\u00c7AS A MAIS, ACTIVA O <strong>D</strong> PARA DILUIR O PRE\u00c7O E FAZER COINCIDIR OS C\u00c1LCULOS COM A FATURA. '
      +       'SE AGUARDAS REPOSI\u00c7\u00c3O DO FORNECEDOR, N\u00c3O ACTIVES NADA.'
      +     '</div>'
      +   '</div>'
      +   '</div>'
      + '</div>';

    /* ── Styles for new elements ── */
    var sb = document.getElementById('proc-session-bar');
    if (sb) sb.classList.add('proc-sess-bar-divider');

    var ss = document.getElementById('proc-session-start');
    if (ss) ss.classList.add('proc-sess-start-wrap');

    var si = document.getElementById('proc-session-start-inner');
    if (si) si.classList.add('proc-sess-start-inner');

    /* ── Bind buttons ── */
    document.getElementById('proc-saveBtn').addEventListener('click', function() { procSaveSession(true); });
    document.getElementById('proc-sessionMenuBtn').addEventListener('click', function(e) { procToggleSessionMenu(e); });
    document.getElementById('proc-guiaBtn').addEventListener('click', function() { procShowGuiaModal(); });
    document.getElementById('proc-start-new-btn').addEventListener('click', function() { procStartNewSession(); });

    /* ── ✱ ao lado de "Iniciar nova sessão": abre/fecha o menu com
       Importar histórico / Importar vendas (Primavera). Posicionamento
       fixed calculado a partir do botão (mesma técnica já usada e
       comprovada por procToggleSessionMenu), nunca dependente do
       layout do proc-session-bar-center — evita alterar o container
       existente. ── */
    (function() {
      var extraBtn  = document.getElementById('proc-start-extra-btn');
      var extraMenu = document.getElementById('proc-start-extra-menu');
      if (!extraBtn || !extraMenu) return;
      extraBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isHidden = extraMenu.style.display === 'none' || !extraMenu.style.display;
        if (isHidden) {
          var rect = extraBtn.getBoundingClientRect();
          extraMenu.style.top  = (rect.bottom + 6) + 'px';
          extraMenu.style.left = rect.left + 'px';
          extraMenu.style.display = 'block';
        } else {
          extraMenu.style.display = 'none';
        }
      });
      document.addEventListener('click', function(e) {
        if (extraMenu.style.display !== 'none' && !extraMenu.contains(e.target) && e.target !== extraBtn) {
          extraMenu.style.display = 'none';
        }
      });
    })();

    /* ── Consulta rapida por referencia (original ou nova nomenclatura) ──
       Duas instancias independentes da mesma pesquisa: a do ecra inicial
       (antes de haver sessao activa) e a do popover da barra superior
       (acessivel a qualquer momento dentro de uma sessao). ── */
    procConfigurarBuscaReferencia('proc-busca-referencia-input', 'proc-busca-dropdown', 'proc-busca-referencia-wrap');
    procConfigurarBuscaReferencia('proc-busca-referencia-input-bar', 'proc-busca-dropdown-bar', 'proc-buscaPopover');

    var buscaToggleBtn = document.getElementById('proc-buscaToggleBtn');
    if (buscaToggleBtn) {
      buscaToggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        procToggleBuscaPopover(e);
      });
    }
    document.addEventListener('click', function(e) {
      var pop = document.getElementById('proc-buscaPopover');
      var btn = document.getElementById('proc-buscaToggleBtn');
      if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && e.target !== btn) {
        procFecharBuscaPopover();
      }
    });

    /* close session menu on outside click */
    document.addEventListener('click', function() { procCloseSessionMenu(); });
  }

  /* ── Consulta rapida por referencia (radiografia da peca) ──
     Aceita tanto a referencia original do fornecedor como a nova
     nomenclatura, por coincidencia parcial. Pode devolver mais que uma
     candidata (ex.: o mesmo codigo reutilizado para duas pecas
     diferentes), cada uma tratada como um bloco independente.
     Existe em DUAS instancias na pagina — a do ecra inicial e a do
     popover da barra de sessao — por isso todas as funcoes recebem o id
     do dropdown/input que lhes diz respeito, em vez de assumirem sempre
     os mesmos ids fixos. */
  function procFecharBuscaDropdown(dropdownId) {
    var dd = document.getElementById(dropdownId || 'proc-busca-dropdown');
    if (dd) { dd.classList.add('hidden'); dd.innerHTML = ''; }
  }

  /* Liga um par input+dropdown (identificados pelos seus ids) a logica de
     pesquisa: debounce ao escrever, Enter abre directamente o Historico,
     Escape fecha o dropdown, e um clique fora do "wrap" tambem o fecha. */
  function procConfigurarBuscaReferencia(inputId, dropdownId, wrapId) {
    var buscaInput = document.getElementById(inputId);
    if (!buscaInput) return;
    var buscaDebounce = null;
    buscaInput.addEventListener('input', function() {
      clearTimeout(buscaDebounce);
      var val = buscaInput.value.trim();
      if (val.length < 2) { procFecharBuscaDropdown(dropdownId); return; }
      buscaDebounce = setTimeout(function() { procAtualizarBuscaDropdown(val, dropdownId, inputId); }, 250);
    });
    buscaInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = buscaInput.value.trim();
        if (val.length < 2) return;
        procFecharBuscaDropdown(dropdownId);
        procAbrirRadiografia(val, null);
      } else if (e.key === 'Escape') {
        procFecharBuscaDropdown(dropdownId);
      }
    });
    document.addEventListener('click', function(e) {
      var wrap = document.getElementById(wrapId);
      if (wrap && !wrap.contains(e.target)) procFecharBuscaDropdown(dropdownId);
    });
  }

  /* Mostra/esconde o popover de pesquisa da barra de sessao (o icone da
     lupa entre "sessoes" e o botao de guardar). */
  function procToggleBuscaPopover(e) {
    var pop = document.getElementById('proc-buscaPopover');
    if (!pop) return;
    if (pop.classList.contains('hidden')) {
      pop.classList.remove('hidden');
      var btn = document.getElementById('proc-buscaToggleBtn');
      var isMobile = window.innerWidth <= 640;
      if (btn) {
        var rect = btn.getBoundingClientRect();
        pop.style.top = (rect.bottom + 6) + 'px';
        if (isMobile) {
          pop.style.left = '50%';
          pop.style.right = 'auto';
          pop.style.transform = 'translateX(-50%)';
        } else {
          pop.style.right = (window.innerWidth - rect.right) + 'px';
          pop.style.left = 'auto';
          pop.style.transform = 'none';
        }
      }
      var input = document.getElementById('proc-busca-referencia-input-bar');
      if (input) { input.value = ''; setTimeout(function() { input.focus(); }, 0); }
      procFecharBuscaDropdown('proc-busca-dropdown-bar');
    } else {
      procFecharBuscaPopover();
    }
  }
  function procFecharBuscaPopover() {
    var pop = document.getElementById('proc-buscaPopover');
    if (pop) pop.classList.add('hidden');
    procFecharBuscaDropdown('proc-busca-dropdown-bar');
  }

  function procNormalizarBuscaQuery(q) {
    return (q || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Constroi o padrao usado no ilike do PostgREST. Em vez de eliminar os
     caracteres que nao sao letras/numeros (o que quebrava a busca ao colar
     uma nomenclatura completa como "26RKZCA-00003", pois o valor guardado
     mantem o hifen), colapsa qualquer sequencia desses caracteres num
     "*", que o PostgREST traduz para um wildcard SQL. Assim "26RKZCA-00003"
     vira "26RKZCA*00003", que encontra o valor guardado tenha ele hifen
     ou nao. */
  function procConstruirPadraoIlike(q) {
    var bruto = (q || '').toString().toUpperCase().trim();
    return bruto.replace(/[^A-Z0-9]+/g, '*').replace(/^\*+|\*+$/g, '');
  }

  function procBuscarCandidatosReferencia(valorBruto) {
    var padrao = procConstruirPadraoIlike(valorBruto);
    if (!padrao) return Promise.resolve([[], []]);
    return Promise.all([
      procSbFetch(
        'proc_referencias?select=referencia_interna,referencia_original,categoria,proveedor&or=(referencia_interna.ilike.*'
          + encodeURIComponent(padrao) + '*,referencia_original.ilike.*' + encodeURIComponent(padrao) + '*)&limit=20',
        { method: 'GET' }
      ).then(function(r) { return r.ok ? r.json() : []; }),
      procLoadCategoriasRemote()
    ]);
  }

  /* Cache simples (por carregamento de pagina) de todas as sessoes
     guardadas, reutilizado tanto pelo dropdown de sugestoes como pela
     radiografia final — evita repetir o mesmo fetch pesado duas vezes
     na mesma pesquisa. */
  var _todasSessoesBuscaCache = null;
  function procCarregarTodasSessoesBusca() {
    if (_todasSessoesBuscaCache) return _todasSessoesBuscaCache;
    _todasSessoesBuscaCache = procSbFetch(
      'proc_sessoes?select=session_key,dados,updated_at&order=updated_at.desc',
      { method: 'GET' }
    ).then(function(r) { return r.ok ? r.json() : []; })
     .catch(function() { _todasSessoesBuscaCache = null; return []; });
    return _todasSessoesBuscaCache;
  }

  /* Varre todas as sessoes guardadas a procura de artigos cuja referencia
     original bata com a pesquisa, mesmo que essa factura NUNCA tenha tido
     a nomenclatura activada (logo, sem linha em proc_referencias). Cada
     resultado e um "candidato virtual" — sem referencia_interna — que a
     radiografia consegue mostrar na mesma, usando a referencia original
     como identificador. */
  function procBuscarCandidatosEmSessoes(qNorm, sessoes, categorias) {
    var vistos = {};
    var candidatos = [];
    (sessoes || []).forEach(function(sess) {
      var dados;
      try { dados = JSON.parse(sess.dados); } catch (e) { return; }
      if (!dados || !dados.faturas) return;
      dados.faturas.forEach(function(fat) {
        var provNorm = procNormalize(fat.proveedor || '');
        if (!provNorm) return;
        (fat.rows || []).forEach(function(row) {
          if (!row.ref) return;
          var refNorm = procNormalizarRefOriginal(row.ref);
          if (!refNorm || refNorm.indexOf(qNorm) === -1) return;
          var categoria = procResolverCategoria(row.desc, categorias || []);
          var chave = provNorm + '|' + refNorm + '|' + categoria;
          if (vistos[chave]) return;
          vistos[chave] = true;
          candidatos.push({
            referencia_interna: null,
            referencia_original: refNorm,
            /* Texto exactamente como foi escrito (com hifens e tudo) —
               refNorm serve so para procurar/desduplicar, NUNCA para
               mostrar; perder os hifens na visualizacao era o bug
               reportado. */
            referencia_original_raw: row.ref,
            categoria: categoria,
            proveedor: provNorm,
            semNomenclatura: true
          });
        });
      });
    });
    return candidatos;
  }

  /* Junta os resultados vindos de proc_referencias com os candidatos
     virtuais encontrados directamente nas sessoes, sem duplicar quando
     o mesmo artigo ja tem nomenclatura (nesse caso a versao com
     referencia_interna e que fica). */
  function procFundirCandidatos(candidatosDb, qNorm, sessoes, categorias) {
    var vistos = {};
    (candidatosDb || []).forEach(function(c) {
      vistos[c.proveedor + '|' + c.referencia_original + '|' + c.categoria] = true;
    });
    var candidatosSessao = procBuscarCandidatosEmSessoes(qNorm, sessoes, categorias)
      .filter(function(c) {
        return !vistos[c.proveedor + '|' + c.referencia_original + '|' + c.categoria];
      });
    return (candidatosDb || []).concat(candidatosSessao);
  }

  function procAtualizarBuscaDropdown(valorBruto, dropdownId, inputId) {
    dropdownId = dropdownId || 'proc-busca-dropdown';
    inputId = inputId || 'proc-busca-referencia-input';
    var qNorm = procNormalizarBuscaQuery(valorBruto);
    if (!qNorm) { procFecharBuscaDropdown(dropdownId); return; }
    Promise.all([
      procBuscarCandidatosReferencia(valorBruto),
      procCarregarTodasSessoesBusca()
    ]).then(function(res) {
      var candidatosDb = res[0][0] || [];
      var categorias = res[0][1] || [];
      var sessoes = res[1] || [];
      var candidatos = procFundirCandidatos(candidatosDb, qNorm, sessoes, categorias);
      var dd = document.getElementById(dropdownId);
      if (!dd) return;
      if (!candidatos.length) {
        dd.innerHTML = '<div class="proc-busca-dropdown-empty">Nenhuma refer\u00eancia encontrada</div>';
        dd.classList.remove('hidden');
        return;
      }
      var mapaCategorias = {};
      categorias.forEach(function(c) { mapaCategorias[c.codigo] = c.categoria_pt; });
      dd.innerHTML = candidatos.map(function(c, idx) {
        var nomeCat = mapaCategorias[c.categoria] || c.categoria;
        var refLabel = c.referencia_interna || c.referencia_original_raw || c.referencia_original;
        return '<div class="proc-busca-dropdown-item" data-idx="' + idx + '">'
          + '<span class="proc-busca-dropdown-ref">' + refLabel + '</span>'
          + '<span class="proc-busca-dropdown-desc">' + nomeCat + ' \u00b7 ' + c.proveedor + '</span>'
          + '</div>';
      }).join('');
      dd.classList.remove('hidden');
      dd.querySelectorAll('.proc-busca-dropdown-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.dataset.idx, 10);
          var candidato = candidatos[idx];
          procFecharBuscaDropdown(dropdownId);
          var inputEl = document.getElementById(inputId);
          if (inputEl) inputEl.value = candidato.referencia_interna || candidato.referencia_original_raw || candidato.referencia_original;
          procAbrirRadiografia(null, [candidato]);
        });
      });
    }).catch(function() { procFecharBuscaDropdown(dropdownId); });
  }

  /* Monta o "raio-x" de uma referencia especifica, varrendo TODAS as
     sessoes guardadas em busca de linhas que correspondam exactamente
     (mesmo fornecedor, mesma referencia original normalizada, mesma
     categoria). Preco de custo, PVP e margem sao recalculados a partir
     dos dados brutos guardados, com as MESMAS formulas usadas ao vivo —
     nunca inventa nada, nunca precisa de tocar na factura original. */
  function procMontarBlocoRadiografia(candidato, sessoes, categorias) {
    var linhas = [];
    var totalA4 = 0, totalA5 = 0, descricaoRef = '';

    /* Uma mesma referencia pode aparecer em varias linhas dentro da MESMA
       sessao — seja repetida na mesma factura, seja espalhada por facturas
       diferentes dessa sessao. Em vez de mostrar uma linha por cada
       ocorrencia (o que fica confuso e repetitivo), soma-se as
       quantidades e, quando os precos diferem entre ocorrencias,
       calcula-se a media ponderada pela quantidade de cada uma — assim o
       preco de custo/PVP/margem mostrados reflectem o valor real medio
       pago por peca, e nao apenas o da ultima linha encontrada. */
    sessoes.forEach(function(sess) {
      var dados;
      try { dados = JSON.parse(sess.dados); } catch(e) { return; }
      if (!dados || !dados.faturas) return;

      var a4Sess = 0, a5Sess = 0, encontrado = false;
      var pesoTotal = 0, custoPeso = 0, pvpPeso = 0, margPeso = 0;

      dados.faturas.forEach(function(fat) {
        if (procNormalize(fat.proveedor || '') !== candidato.proveedor) return;
        (fat.rows || []).forEach(function(row) {
          if (!row.ref) return;
          if (procNormalizarRefOriginal(row.ref) !== candidato.referencia_original) return;
          if (procResolverCategoria(row.desc, categorias) !== candidato.categoria) return;

          encontrado = true;
          if (!descricaoRef) descricaoRef = row.desc || '';

          var pc3raw = procCalcPrecoCusto(row.preco, row.plus1, row.hasD, row.qtdFt, row.a4, row.a5);
          var pc3 = pc3raw * (1 - (row.descPct || 0) / 100);
          var pvpResult = procCalcPVP(row.preco);
          var pvpFinal = (row.pvpManual != null) ? row.pvpManual : (pvpResult ? pvpResult.pvpFinal : null);
          var marg = pvpResult ? procCalcMargem(pvpResult.pvp1, row.preco) : null;

          var a4 = row.a4 || 0, a5 = row.a5 || 0;
          var peso = a4 + a5;
          a4Sess += a4; a5Sess += a5;

          if (peso > 0) {
            pesoTotal += peso;
            if (pc3 != null && !isNaN(pc3)) custoPeso += pc3 * peso;
            if (pvpFinal != null && !isNaN(pvpFinal)) pvpPeso += pvpFinal * peso;
            if (marg != null && !isNaN(marg)) margPeso += marg * peso;
          }
        });
      });

      if (!encontrado) return;

      totalA4 += a4Sess; totalA5 += a5Sess;
      linhas.push({
        label: labelFromKey(sess.session_key),
        sessionKey: sess.session_key,
        a4: a4Sess, a5: a5Sess, total: a4Sess + a5Sess,
        precoCusto: pesoTotal ? (custoPeso / pesoTotal) : null,
        pvp: pesoTotal ? (pvpPeso / pesoTotal) : null,
        margem: pesoTotal ? (margPeso / pesoTotal) : null
      });
    });

    /* Ordem estritamente cronologica, mais recente primeiro — o
       session_key (proc_fatura_YYYY-MM-DD[_N]) ordena correctamente
       como texto, exactamente como getAllSessionKeys() ja faz noutro
       lado do ficheiro. Nao dar por garantido que "sessoes" ja vem
       ordenado por semana: vem ordenado por updated_at (ultima vez
       gravado), que pode divergir da semana que a sessao representa
       sempre que uma sessao antiga e reaberta/corrigida. */
    linhas.sort(function(a, b) {
      return a.sessionKey < b.sessionKey ? 1 : (a.sessionKey > b.sessionKey ? -1 : 0);
    });

    return {
      candidato: candidato,
      descricao: descricaoRef,
      linhas: linhas,
      totalA4: totalA4,
      totalA5: totalA5,
      totalGeral: totalA4 + totalA5,
      numSessoes: linhas.length
    };
  }

  function procMostrarRadiografiaModal(blocos, categorias, aoVoltar) {
    var old = document.getElementById('proc-radiografia-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var mapaCategorias = {};
    (categorias || []).forEach(function(c) { mapaCategorias[c.codigo] = c.categoria_pt; });

    var corpoHTML;
    if (!blocos.length) {
      corpoHTML = '<div class="proc-raio-vazio">Nenhuma refer\u00eancia encontrada.</div>';
    } else {
      corpoHTML = blocos.map(function(bloco, idxBloco) {
        var cand = bloco.candidato;
        var nomeCat = mapaCategorias[cand.categoria] || cand.categoria;
        var linhasHTML = bloco.linhas.length
          ? bloco.linhas.map(function(l) {
              return '<tr class="proc-raio-row-clickable" style="cursor:pointer" title="Abrir esta sess\u00e3o" onclick="procFecharRadiografiaEAbrirSessao(\'' + l.sessionKey + '\')">'
                + '<td class="center">' + l.label + '</td>'
                + '<td class="center">' + l.a4 + '</td>'
                + '<td class="center">' + l.a5 + '</td>'
                + '<td class="center" style="font-weight:700;font-size:1.15em;color:#000;">' + l.total + '</td>'
                + '<td class="center">' + (l.precoCusto ? l.precoCusto.toFixed(2) : '\u2014') + '</td>'
                + '<td class="center">' + (l.pvp != null ? l.pvp.toFixed(2) : '\u2014') + '</td>'
                + '<td class="center">' + (l.margem != null ? l.margem.toFixed(1) + '%' : '\u2014') + '</td>'
                + '</tr>';
            }).join('')
          : '<tr class="empty-row"><td colspan="7">Sem hist\u00f3rico de sess\u00f5es</td></tr>';

        var refNovaLabel = cand.referencia_interna || cand.referencia_original_raw || cand.referencia_original;

        /* Partilha entre fornecedores: se outro bloco desta mesma busca
           tiver a MESMA referencia mas outro proveedor, mostra um
           aviso — o stock desta referencia esta a ser calculado em
           FIFO entre esses fornecedores (ver procAlocarFifo mais
           abaixo, na secção "Stock actual por bloco"). */
        var outrosFornecedores = blocos.filter(function(b, i) {
          if (i === idxBloco) return false;
          var refOutro = b.candidato.referencia_interna || b.candidato.referencia_original_raw || b.candidato.referencia_original;
          return refOutro === refNovaLabel;
        }).map(function(b) { return b.candidato.proveedor; });
        var badgeCompartilhada = outrosFornecedores.length
          ? ' <span class="proc-ref-compartilhada" title="Esta refer\u00eancia tamb\u00e9m \u00e9 comprada a: ' + outrosFornecedores.join(', ').replace(/"/g, '&quot;') + '. Stock calculado em FIFO entre fornecedores (o lote mais antigo esgota primeiro)." style="display:inline-block;margin-left:6px;font-size:.7rem;font-weight:600;color:#8a6d1a;border:1px solid #C9A227;background:#FBF3D9;border-radius:8px;padding:1px 7px;cursor:help;vertical-align:middle;">\u21c4 partilhada</span>'
          : '';

        return '<div class="proc-raio-bloco">'
          + '<div class="proc-raio-bloco-header">'
          +   '<div>'
          +     '<span class="proc-raio-ref-nova proc-raio-ref-copiar" style="cursor:pointer;" title="Clicar para copiar">' + refNovaLabel + '</span> '
          +     '<span class="proc-raio-categoria">' + nomeCat + '</span>'
          +     badgeCompartilhada
          +   '</div>'
          +   (cand.referencia_interna
                ? '<span class="proc-raio-ref-original">Original: ' + cand.referencia_original + ' \u00b7 ' + cand.proveedor + '</span>'
                : '<span class="proc-raio-ref-original">' + cand.proveedor + '</span>')
          + '</div>'
          + (bloco.descricao ? '<div class="proc-raio-descricao">' + bloco.descricao + '</div>' : '')
          + '<div class="proc-raio-totais" style="color:#000 !important;opacity:1 !important;">'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Sess\u00f5es:</span> <span style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">' + bloco.numSessoes + '</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Funchal:</span> <span style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">' + bloco.totalA4 + '</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Porto Santo:</span> <span style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">' + bloco.totalA5 + '</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Total:</span> <span style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">' + bloco.totalGeral + '</span>'
          +   '&nbsp;&nbsp;<span style="color:#999;">|</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Stock A4:</span> <span class="proc-raio-stock" data-idx="' + idxBloco + '" data-campo="a4" style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">\u2026</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Stock A5:</span> <span class="proc-raio-stock" data-idx="' + idxBloco + '" data-campo="a5" style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">\u2026</span>&nbsp;&nbsp;'
          +   '<span style="color:#000 !important;font-weight:600 !important;opacity:1 !important;">Stock Total:</span> <strong><span class="proc-raio-stock" data-idx="' + idxBloco + '" data-campo="total" style="color:#000 !important;font-weight:700 !important;opacity:1 !important;">\u2026</span></strong>'
          + '</div>'
          + '<table class="proc-or-table">'
          +   '<thead><tr>'
          +     '<th class="center">Sess\u00e3o</th><th class="center">Funchal</th><th class="center">P. Santo</th><th class="center" style="font-size:1.15em;font-weight:700;color:#000;">Total</th>'
          +     '<th class="center">P. Custo</th><th class="center">PVP</th><th class="center">Margem</th>'
          +   '</tr></thead>'
          +   '<tbody>' + linhasHTML + '</tbody>'
          + '</table>'
          + '</div>';
      }).join('');
    }

    var modal = document.createElement('div');
    modal.id = 'proc-radiografia-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel proc-or-panel--radiografia">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Hist\u00f3rico da Refer\u00eancia</span>'
      +       '<span class="proc-or-panel-title-sub">'
      +         (blocos.length > 1 ? blocos.length + ' refer\u00eancias encontradas' : (blocos.length === 1 ? '1 refer\u00eancia encontrada' : 'Sem resultados'))
      +       '</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">' + (aoVoltar ? '\u2039 Voltar' : '\u2715 Fechar') + '</button>'
      +   '</div>'
      +   '<div class="proc-or-panel-scroll">' + corpoHTML + '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);
    procLigarVoltar(modal, aoVoltar);


    /* Clicar na referencia (canto superior de cada bloco) copia-a para
       a area de transferencia — evita ter de seleccionar o texto
       manualmente. Feedback visual breve (fundo verde claro + title
       "copiado!") em vez de qualquer alert/popup. */
    modal.querySelectorAll('.proc-raio-ref-copiar').forEach(function(span) {
      span.addEventListener('click', function() {
        var texto = span.textContent.trim();
        if (!texto) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto);
          } else {
            var ta = document.createElement('textarea');
            ta.value = texto;
            ta.className = 'proc-clipboard-hack';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
          }
        } catch (ex) {}
        var origTitle = span.getAttribute('title');
        var origBg = span.style.backgroundColor;
        span.title = '✓ copiado!';
        span.style.backgroundColor = '#dff5e1';
        clearTimeout(span._procCopyT);
        span._procCopyT = setTimeout(function() {
          span.title = origTitle || '';
          span.style.backgroundColor = origBg || '';
        }, 900);
      });
    });

    /* Stock actual por bloco (A4/A5/Total) = pecas compradas ate hoje
       menos as vendidas desde a primeira compra em cada armazem — um
       unico pedido em lote ao Supabase para todos os blocos deste
       modal. Preenche os placeholders "\u2026" depois do modal ja
       estar visivel, para nao atrasar a abertura.
       Quando dois blocos partilham a mesma referencia (fornecedores
       diferentes, ver badgeCompartilhada acima), sao tratados como
       lotes FIFO: o RPC e chamado uma so vez por referencia com o
       cutoff do lote mais antigo, e o total vendido e repartido entre
       os blocos por ordem de data de compra (ver procAlocarFifo). */
    if (blocos.length) {
      var infoPorBloco = blocos.map(function(bloco) {
        var cand = bloco.candidato;
        var refTexto = cand.referencia_interna || cand.referencia_original_raw || cand.referencia_original;
        var cutoffA4 = null, cutoffA5 = null;
        bloco.linhas.forEach(function(l) {
          var d = procDataDeChave(l.sessionKey);
          if (!d) return;
          var iso = procIsoAAAAMMDD(d.ano, d.mes, d.dia);
          if (l.a4 > 0 && (!cutoffA4 || iso < cutoffA4)) cutoffA4 = iso;
          if (l.a5 > 0 && (!cutoffA5 || iso < cutoffA5)) cutoffA5 = iso;
        });
        return { refTexto: refTexto, cutoffA4: cutoffA4, cutoffA5: cutoffA5, comprasA4: bloco.totalA4, comprasA5: bloco.totalA5, fornecedorNorm: procNormalize(cand.proveedor || '') };
      });

      var gruposPorRef = {};
      infoPorBloco.forEach(function(info) {
        if (!gruposPorRef[info.refTexto]) gruposPorRef[info.refTexto] = [];
        gruposPorRef[info.refTexto].push(info);
      });

      var paresStockRadio = Object.keys(gruposPorRef).map(function(refTexto) {
        var grupo = gruposPorRef[refTexto];
        var lotesA4 = procLotesOrdenados(grupo, 'comprasA4', 'cutoffA4');
        var lotesA5 = procLotesOrdenados(grupo, 'comprasA5', 'cutoffA5');
        var cutoffA4 = lotesA4.length ? lotesA4[0].cutoffA4 : null;
        var cutoffA5 = lotesA5.length ? lotesA5[0].cutoffA5 : null;
        return { referencia: refTexto, cutoff_a4: procSubtrairDiasIso(cutoffA4, FOLGA_CORTE_DIAS), cutoff_a5: procSubtrairDiasIso(cutoffA5, FOLGA_CORTE_DIAS) };
      });

      procCalcularStockLote(paresStockRadio, function(stockMapa) {
        Object.keys(gruposPorRef).forEach(function(refTexto) {
          var grupo = gruposPorRef[refTexto];
          var venda = stockMapa ? stockMapa[refTexto] : null;
          if (stockMapa && venda && !venda.erro) {
            var lotesA4 = procLotesOrdenados(grupo, 'comprasA4', 'cutoffA4');
            var lotesA5 = procLotesOrdenados(grupo, 'comprasA5', 'cutoffA5');
            procAlocarFifo(lotesA4, venda.vendidoA4, 'comprasA4', 'stockA4');
            procAlocarFifo(lotesA5, venda.vendidoA5, 'comprasA5', 'stockA5');
          }
        });
        blocos.forEach(function(bloco, idxBloco) {
          var info = infoPorBloco[idxBloco];
          var refTexto = info.refTexto;
          var celA4 = modal.querySelector('.proc-raio-stock[data-idx="' + idxBloco + '"][data-campo="a4"]');
          var celA5 = modal.querySelector('.proc-raio-stock[data-idx="' + idxBloco + '"][data-campo="a5"]');
          var celTotal = modal.querySelector('.proc-raio-stock[data-idx="' + idxBloco + '"][data-campo="total"]');
          if (!celA4 || !celA5 || !celTotal) return;
          if (!stockMapa) {
            celA4.textContent = celA5.textContent = celTotal.textContent = '\u26a0';
            return;
          }
          var venda = stockMapa[refTexto] || { vendidoA4: 0, vendidoA5: 0, temLojaNaoMapeada: false };
          if (venda.erro) {
            celA4.textContent = celA5.textContent = celTotal.textContent = '\u26a0';
            celA4.title = celA5.title = celTotal.title = 'Erro ao obter este lote do Supabase. Tenta recarregar.';
            return;
          }
          var stockA4 = info.hasOwnProperty('stockA4') ? info.stockA4 : bloco.totalA4;
          var stockA5 = info.hasOwnProperty('stockA5') ? info.stockA5 : bloco.totalA5;
          celA4.textContent = stockA4;
          celA5.textContent = stockA5;
          var detalheTextoA5Radio = procFormatarDetalheA5(venda.detalheA5);
          if (detalheTextoA5Radio) {
            celA5.title = detalheTextoA5Radio;
            celA5.style.cursor = 'help';
          }
          celTotal.textContent = (stockA4 + stockA5) + (venda.temLojaNaoMapeada ? ' \u26a0' : '');
          if (venda.temLojaNaoMapeada) {
            celTotal.title = 'H\u00e1 vendas desta refer\u00eancia num posto de venda n\u00e3o mapeado para A4/A5 \u2014 n\u00e3o entraram neste c\u00e1lculo.';
          }
        });
      });
    }
  }

  /* Clicar numa linha do historico fecha o modal (e qualquer popover de
     busca ainda aberto) e abre directamente essa sessao — reaproveita
     procForceLoadSession, o mesmo caminho ja usado pelo botao "carregar"
     no menu "☰ sessões", por isso o comportamento (fetch remoto,
     fallback local, lock, etc.) e identico e ja testado. */
  function procFecharRadiografiaEAbrirSessao(sessionKey) {
    if (!sessionKey) return;
    var modal = document.getElementById('proc-radiografia-modal');
    if (modal) procCloseModal(modal);
    procFecharBuscaDropdown('proc-busca-dropdown');
    if (typeof procFecharBuscaPopover === 'function') procFecharBuscaPopover();
    procForceLoadSession(sessionKey);
  }

  function procAbrirRadiografia(valorBruto, candidatosForcados, aoVoltar) {
    var abrirComCandidatos = function(candidatos, categorias) {
      if (!candidatos || !candidatos.length) {
        procMostrarRadiografiaModal([], categorias || [], aoVoltar);
        return;
      }
      procCarregarTodasSessoesBusca().then(function(sessoes) {
        var blocos = candidatos.map(function(cand) {
          return procMontarBlocoRadiografia(cand, sessoes || [], categorias || []);
        });
        procMostrarRadiografiaModal(blocos, categorias || [], aoVoltar);
      });
    };

    if (candidatosForcados) {
      procLoadCategoriasRemote().then(function(categorias) {
        abrirComCandidatos(candidatosForcados, categorias);
      });
      return;
    }

    var qNorm = procNormalizarBuscaQuery(valorBruto);
    if (!qNorm) return;

    Promise.all([
      procBuscarCandidatosReferencia(valorBruto),
      procCarregarTodasSessoesBusca()
    ]).then(function(res) {
      var candidatosDb = res[0][0] || [];
      var categorias = res[0][1] || [];
      var sessoes = res[1] || [];
      var candidatos = procFundirCandidatos(candidatosDb, qNorm, sessoes, categorias);
      abrirComCandidatos(candidatos, categorias);
    }).catch(function() { procMostrarRadiografiaModal([], [], aoVoltar); });
  }

  /* ══════════════ TOTAIS POR FORNECEDOR / ANO ══════════════
     Modal so de leitura, nunca escreve nada. Percorre TODAS as sessoes
     em proc_sessoes, soma o total de cada factura (mesma formula usada
     em procUpdateSummary para o "Total" ao vivo de cada factura:
     (a4+a5) * procCalcPrecoCusto(...) * (1 - desc%)) agrupado por
     fornecedor (procNormalize, mesma normalizacao usada em todo o
     resto do ficheiro) e por ano (extraido do session_key). As colunas
     de ano sao calculadas na hora a partir dos anos realmente
     presentes nos dados — nunca fixas, por isso um ano novo aparece
     sozinho assim que houver a primeira factura desse ano. Inclui
     tambem uma coluna "Total" (soma de todos os anos, por fornecedor)
     e uma linha de totais por ano no fundo da tabela — ambas a negrito.
     Um segundo modal, aberto a partir de um botao dentro do primeiro,
     mostra a mesma comparacao mas cortada: usa a data da sessao mais
     recente do ano corrente (mes/dia) como corte, e aplica esse MESMO
     corte (so mes/dia, ignorando o ano) a todos os anos — permite
     comparar "quanto se comprou ate este ponto do calendario" de forma
     justa entre anos. */

  /* Mesma formula de procUpdateSummary, em forma pura (sem DOM) para
     poder ser aplicada a facturas guardadas em Supabase. */
  function procCalcularTotalLinhasFatura(fatura) {
    var total = 0;
    (fatura.rows || []).forEach(function(r) {
      var a4 = r.a4 || 0, a5 = r.a5 || 0, pcs = a4 + a5;
      var preco = r.preco || 0;
      if (preco && pcs) {
        var pc = procCalcPrecoCusto(preco, r.plus1, r.hasD, r.qtdFt, a4, a5);
        total += pcs * pc * (1 - (r.descPct || 0) / 100);
      }
    });
    return total;
  }

  /* Formato monetario com separador de milhares, locale pt-PT
     (ex.: 85569.69 → "85.569,69 €"). */
  function procFormatarMoeda(v) {
    return (v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  /* "proc_fatura_YYYY-MM-DD[_N]" → { ano, mes, dia }, todos numericos.
     Versao estendida de procMesAnoDeChave que tambem devolve o dia,
     necessaria para o corte por mes/dia usado na comparacao ano-a-ano. */
  function procDataDeChave(key) {
    var stripped = key.replace(SESSION_PREFIX, '');
    var m = stripped.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { ano: parseInt(m[1], 10), mes: parseInt(m[2], 10), dia: parseInt(m[3], 10) };
  }

  /* 'YYYY-MM-DD' a partir de ano/mes/dia numericos — usado para
     construir as datas de corte enviadas ao calculo de stock. */
  function procIsoAAAAMMDD(ano, mes, dia) {
    var mm = (mes < 10 ? '0' : '') + mes;
    var dd = (dia < 10 ? '0' : '') + dia;
    return ano + '-' + mm + '-' + dd;
  }

  /* Subtrai N dias a uma data 'YYYY-MM-DD', devolvendo outra data no
     mesmo formato. Ancorado ao meio-dia UTC e lido de volta com os
     mesmos metodos UTC (nunca locais) para a aritmetica de datas
     nunca ser afectada por fuso horario ou DST. Usado para dar uma
     folga de tolerancia (FOLGA_CORTE_DIAS) ao corte de stock: por
     vezes a factura chega fisicamente numa data mas so e' lancada no
     Primavera semanas depois, sem que a data de lancamento seja
     corrigida — esta folga evita descartar por engano vendas que na
     realidade ja pertencem a essa compra. */
  function procSubtrairDiasIso(iso, dias) {
    if (!iso) return iso;
    var partes = iso.split('-');
    var d = new Date(Date.UTC(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10), 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - dias);
    var mm = (d.getUTCMonth() + 1 < 10 ? '0' : '') + (d.getUTCMonth() + 1);
    var dd = (d.getUTCDate() < 10 ? '0' : '') + d.getUTCDate();
    return d.getUTCFullYear() + '-' + mm + '-' + dd;
  }

  var FOLGA_CORTE_DIAS = 28;

  /* Nomes amigaveis dos "postos de venda" que compoem o armazem A5
     (Porto Santo) — usados so para mostrar ao utilizador no tooltip
     de "quais lojas venderam esta referencia", nunca para logica de
     calculo (essa continua a viver inteiramente no RPC, agrupada por
     loja normalizada em minusculas). */
  var LOJAS_A5_LABEL = {
    'mezka.ps': 'Mezka Mercado',
    'shana': 'Shana',
    'maxx': 'Maxx',
    'mezka.avenida': 'Mezka Avenida',
    'duarte': 'Duarte',
    'pri': 'Pri'
  };

  /* Constroi o texto do tooltip (title nativo, uma loja por linha) a
     partir do "detalheA5" devolvido pelo RPC stock_por_referencias —
     um array [{ loja, qty }, ...] ja filtrado pelo mesmo corte+folga
     usado no calculo do stock A5, ordenado da loja com mais vendas
     para a de menos. Devolve null quando nao ha nada para mostrar.
     A chave e normalizada (lower/trim) antes do lookup em
     LOJAS_A5_LABEL, para nunca mostrar o codigo interno em bruto por
     causa de uma diferenca de capitalizacao vinda do RPC. */
  function procFormatarDetalheA5(detalhe) {
    if (!detalhe || !detalhe.length) return null;
    var linhas = detalhe.slice().sort(function(a, b) { return (b.qty || 0) - (a.qty || 0); }).map(function(d) {
      var chave = String(d.loja || '').toLowerCase().trim();
      var nome = LOJAS_A5_LABEL[chave] || d.loja;
      return nome + ': ' + (d.qty || 0);
    });
    return 'Vendido em (Porto Santo):\n' + linhas.join('\n');
  }

  /* ════════════ FIFO ENTRE FORNECEDORES (referencia partilhada) ════════════
     Duas empresas fornecedoras podem, por coincidencia (ou por venderem
     mesmo o mesmo artigo), usar identico codigo de referencia. A tabela
     vendas_primavera so tem referencia/loja/data/quantidade — nao sabe
     a qual compra pertence cada venda. Sem tratamento especial, cada
     fornecedor "reclamava" as MESMAS vendas no seu proprio calculo de
     stock, descontando-as duas vezes e disparando o stock para
     negativos sem sentido. Resolvido tratando as compras de cada
     fornecedor dessa referencia como um "lote" numa fila FIFO ordenada
     pela data da primeira compra: as vendas desde a data mais antiga
     entre todos os lotes sao pedidas UMA SO VEZ ao RPC, e depois
     distribuidas — o lote mais antigo esgota-se primeiro, so depois se
     desconta do seguinte. */

  /* Constroi, a partir de uma lista completa de facturas (todos os
     fornecedores — ja disponivel em memoria em ambos os modais de
     stock), um mapa referencia -> array de lotes { fornecedorNorm,
     fornecedorDisplay, comprasA4, comprasA5, cutoffA4, cutoffA5 }, um
     lote por cada fornecedor que alguma vez comprou essa referencia. */
  function procConstruirLotesPorReferencia(listaCompleta) {
    var porRef = {};
    (listaCompleta || []).forEach(function(item) {
      var bruto = (item.fatura.proveedor || '').trim();
      if (!bruto) return;
      var norm = procNormalize(bruto);
      (item.fatura.rows || []).forEach(function(r) {
        var ref = (r.ref || '').trim();
        if (!ref) return;
        var a4v = r.a4 || 0, a5v = r.a5 || 0;
        if (!a4v && !a5v) return;
        if (!porRef[ref]) porRef[ref] = {};
        if (!porRef[ref][norm]) {
          porRef[ref][norm] = { fornecedorNorm: norm, fornecedorDisplay: bruto, comprasA4: 0, comprasA5: 0, cutoffA4: null, cutoffA5: null };
        }
        var lote = porRef[ref][norm];
        lote.comprasA4 += a4v;
        lote.comprasA5 += a5v;
        var isoData = procIsoAAAAMMDD(item.ano, item.mes, item.dia);
        if (a4v > 0 && (!lote.cutoffA4 || isoData < lote.cutoffA4)) lote.cutoffA4 = isoData;
        if (a5v > 0 && (!lote.cutoffA5 || isoData < lote.cutoffA5)) lote.cutoffA5 = isoData;
      });
    });
    var out = {};
    Object.keys(porRef).forEach(function(ref) {
      out[ref] = Object.keys(porRef[ref]).map(function(k) { return porRef[ref][k]; });
    });
    return out;
  }

  /* Filtra os lotes que realmente compraram neste armazem (campoCompras
     > 0) e ordena do mais antigo para o mais recente pela data de
     corte desse armazem — a ordem exacta que a fila FIFO precisa. */
  function procLotesOrdenados(lotes, campoCompras, campoCutoff) {
    return (lotes || []).filter(function(l) { return (l[campoCompras] || 0) > 0; }).sort(function(a, b) {
      var ca = a[campoCutoff], cb = b[campoCutoff];
      if (ca === cb) return 0;
      if (!ca) return 1;
      if (!cb) return -1;
      return ca < cb ? -1 : 1;
    });
  }

  /* Distribui "vendidoTotal" (ja obtido do RPC, contado desde a data
     de corte do lote mais antigo) pelos lotes recebidos, ja ordenados
     do mais antigo para o mais recente: consome por completo cada
     lote antes de tocar no seguinte. So o ULTIMO lote da fila pode
     ficar com stock negativo, caso a soma vendida exceda tudo o que
     foi comprado em todos os lotes — sinal real de historico de
     compras incompleto, tal como ja acontecia antes para um unico
     fornecedor. Muta cada lote, preenchendo lote[campoStock]. */
  function procAlocarFifo(lotesOrdenados, vendidoTotal, campoCompras, campoStock) {
    var restante = vendidoTotal || 0;
    for (var i = 0; i < lotesOrdenados.length; i++) {
      var lote = lotesOrdenados[i];
      var disponivel = lote[campoCompras] || 0;
      if (i === lotesOrdenados.length - 1) {
        lote[campoStock] = disponivel - restante;
      } else {
        var consumido = Math.min(disponivel, restante);
        lote[campoStock] = disponivel - consumido;
        restante -= consumido;
      }
    }
  }


  /* Chama a funcao stock_por_referencias(jsonb) no Supabase para um
     lote de referencias de uma so vez — cada par indica a referencia
     e a data de corte propria de cada armazem (primeira compra nesse
     armazem). O calculo real (soma de vendas por loja mapeada para
     A4/A5, filtrada pela data de corte) e feito inteiramente no
     Postgres, evitando transferir linhas da tabela grande de vendas
     para o browser. callback(null) sinaliza falha (distinto de
     callback({}) que significa "sem vendas ainda"), para a UI poder
     distinguir erro de stock zero. */
  /* O PostgREST do Supabase limita por omissão qualquer resposta a
     1000 linhas (o mesmo limite que já tinha aparecido no resumo de
     vendas por ano) — um fornecedor com mais de 1000 referências
     distintas (ex.: AMORADO tem 1105) fazia a função devolver tudo
     correctamente, mas a resposta chegava cortada ao browser, e as
     referências que ficassem de fora do corte apareciam com stock
     igual ao comprado (0 vendido), como se nunca tivessem sido
     vendidas. Corrigido dividindo o pedido em lotes bem abaixo desse
     limite — cada lote é um pedido HTTP independente, os resultados
     são fundidos num único mapa antes do callback. */
  function procCalcularStockLote(pares, callback) {
    if (!pares || !pares.length) { callback({}); return; }
    var TAMANHO_LOTE = 400;
    var lotes = [];
    for (var i = 0; i < pares.length; i += TAMANHO_LOTE) {
      lotes.push(pares.slice(i, i + TAMANHO_LOTE));
    }
    var mapaFinal = {};
    var pendentes = lotes.length;
    lotes.forEach(function(lote) {
      procSbFetch('rpc/stock_por_referencias', { method: 'POST', body: JSON.stringify({ pares: lote }) })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(rows) {
          if (rows) {
            rows.forEach(function(row) {
              mapaFinal[row.referencia] = {
                vendidoA4: Number(row.vendido_a4) || 0,
                vendidoA5: Number(row.vendido_a5) || 0,
                detalheA5: row.detalhe_a5 || [],
                temLojaNaoMapeada: !!row.tem_loja_nao_mapeada
              };
            });
          } else {
            lote.forEach(function(par) { mapaFinal[par.referencia] = { erro: true }; });
          }
        })
        .catch(function() {
          lote.forEach(function(par) { mapaFinal[par.referencia] = { erro: true }; });
        })
        .then(function() {
          pendentes--;
          if (pendentes === 0) callback(mapaFinal);
        });
    });
  }

  /* Carrega TODAS as sessoes de proc_sessoes uma unica vez e devolve
  /* Carrega TODAS as sessoes de proc_sessoes uma unica vez e devolve
     uma lista plana { ano, mes, dia, fatura } — uma entrada por
     factura, com a data completa da sua sessao. Serve de base tanto
     para a tabela "todo o historico" como para a tabela "com corte",
     evitando duas idas a Supabase. */
  async function procCarregarFaturasComData() {
    var out = [];
    var res = await procSbFetch('proc_sessoes?select=session_key,dados', { method: 'GET' });
    if (!res.ok) return out;
    var rows = await res.json();
    rows.forEach(function(row) {
      var d = procDataDeChave(row.session_key);
      if (!d) return;
      var data;
      try { data = JSON.parse(row.dados); } catch (e) { return; }
      if (!data.faturas || !data.faturas.length) return;
      data.faturas.forEach(function(fat) {
        out.push({ ano: d.ano, mes: d.mes, dia: d.dia, fatura: fat });
      });
    });
    return out;
  }

  /* Agrupa a lista plana por fornecedor + ano, somando o total de cada
     factura. "filtro", se fornecido, decide que entradas entram (usado
     para aplicar o corte por mes/dia). */
  function procAgregarPorFornecedorAno(lista, filtro) {
    var mapa = {}; /* fornecedorNorm → { display, anos:{ano:total} } */
    lista.forEach(function(item) {
      if (filtro && !filtro(item)) return;
      var nomeBruto = (item.fatura.proveedor || '').trim();
      if (!nomeBruto) return;
      var norm = procNormalize(nomeBruto);
      if (!norm) return;
      var totalFat = procCalcularTotalLinhasFatura(item.fatura);
      if (!totalFat) return;
      if (!mapa[norm]) mapa[norm] = { display: norm, anos: {} };
      mapa[norm].anos[item.ano] = (mapa[norm].anos[item.ano] || 0) + totalFat;
    });
    return mapa;
  }

  /* Determina o corte (mes, dia) a partir da sessao mais recente do
     ano corrente. Devolve null se ainda nao houver nenhuma sessao no
     ano corrente. */
  function procCalcularCorteAnoAtual(lista) {
    var anoAtual = new Date().getFullYear();
    var maxMes = 0, maxDia = 0;
    lista.forEach(function(item) {
      if (item.ano !== anoAtual) return;
      if (item.mes > maxMes || (item.mes === maxMes && item.dia > maxDia)) {
        maxMes = item.mes; maxDia = item.dia;
      }
    });
    if (!maxMes) return null;
    return { mes: maxMes, dia: maxDia };
  }

  /* Constroi a tabela (HTML) a partir de um mapa fornecedor→ano→total.
     Reaproveitada pelos dois modais (historico completo e com corte).
     Inclui coluna "Total" por fornecedor e linha de totais por ano no
     fundo — ambas a negrito. Devolve null se nao houver fornecedores. */
  function procMontarTabelaTotaisFornecedor(mapa, clicavel) {
    var fornecedores = Object.keys(mapa);
    if (!fornecedores.length) return null;

    var anosSet = {};
    fornecedores.forEach(function(f) {
      Object.keys(mapa[f].anos).forEach(function(a) { anosSet[a] = true; });
    });
    var anos = Object.keys(anosSet).map(Number).sort(function(a, b) { return a - b; });

    /* Pre-calcula o total geral de cada fornecedor para poder ordenar
       por hierarquia de gasto (maior para menor); em empate, ordem
       alfabetica para o resultado ficar estavel. Usado tanto pela
       tabela de historico completo como pela de comparacao por corte,
       ja que ambas reaproveitam esta mesma funcao. */
    fornecedores.forEach(function(f) {
      var t = 0;
      anos.forEach(function(a) { t += mapa[f].anos[a] || 0; });
      mapa[f].totalGeral = t;
    });
    fornecedores.sort(function(a, b) {
      return mapa[b].totalGeral - mapa[a].totalGeral || mapa[a].display.localeCompare(mapa[b].display, 'pt');
    });

    var theadHTML = '<tr><th>Fornecedor</th>'
      + anos.map(function(a) { return '<th class="center">' + a + '</th>'; }).join('')
      + '<th class="center"><strong>Total</strong></th></tr>';

    var totaisPorAno = {};
    anos.forEach(function(a) { totaisPorAno[a] = 0; });
    var granTotal = 0;

    var tbodyHTML = fornecedores.map(function(f) {
      var linha = mapa[f];
      var totalLinha = linha.totalGeral;
      var cels = anos.map(function(a) {
        var v = linha.anos[a] || 0;
        totaisPorAno[a] += v;
        return '<td class="center">' + (v ? procFormatarMoeda(v) : '—') + '</td>';
      }).join('');
      granTotal += totalLinha;
      /* "clicavel" so e true na tabela do modulo geral (Totais por
         Fornecedor) — a tabela do modulo de comparacao por corte
         reaproveita esta mesma funcao sem o passar, por isso as suas
         linhas continuam nao-clicaveis, exactamente como antes. */
      var trAttrs = clicavel
        ? ' class="proc-fornecedor-total-row" data-fornecedor="' + linha.display.replace(/"/g, '&quot;') + '" style="cursor:pointer;"'
        : '';
      return '<tr' + trAttrs + '><td>' + linha.display + '</td>' + cels + '<td class="center"><strong>' + procFormatarMoeda(totalLinha) + '</strong></td></tr>';
    }).join('');

    var tfootHTML = '<tr style="border-top:2px solid #ccc;background:#f7f7f7;"><td><strong>Total</strong></td>'
      + anos.map(function(a) { return '<td class="center"><strong>' + procFormatarMoeda(totaisPorAno[a]) + '</strong></td>'; }).join('')
      + '<td class="center"><strong>' + procFormatarMoeda(granTotal) + '</strong></td></tr>';

    return '<table class="proc-or-table">'
      + '<thead>' + theadHTML + '</thead>'
      + '<tbody>' + tbodyHTML + '</tbody>'
      + '<tfoot>' + tfootHTML + '</tfoot>'
      + '</table>';
  }

  function procMostrarModalTotaisPorFornecedor() {
    var old = document.getElementById('proc-totais-fornecedor-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-totais-fornecedor-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:1040px;width:95vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Totais por Fornecedor</span>'
      +       '<span class="proc-or-panel-title-sub">Soma de compras por ano · todo o histórico</span>'
      +     '</div>'
      +     '<div class="proc-or-panel-header-btns">'
      +       '<button class="proc-or-action-btn" id="proc-totais-corte-btn">comparar até esta data (todos os anos)</button>'
      +       '<button class="proc-or-close-btn">✕ Fechar</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="proc-or-scroll" id="proc-totais-fornecedor-body">'
      +     '<p style="font-size:.8rem;color:#888;padding:20px;">A carregar…</p>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    var corteBtn = modal.querySelector('#proc-totais-corte-btn');
    if (corteBtn) corteBtn.addEventListener('click', function() { procMostrarModalTotaisPorFornecedorCorte(); });

    procCarregarFaturasComData().then(function(lista) {
      var body = document.getElementById('proc-totais-fornecedor-body');
      if (!body) return;
      var mapa = procAgregarPorFornecedorAno(lista, null);
      var tabelaHTML = procMontarTabelaTotaisFornecedor(mapa, true);
      body.innerHTML = tabelaHTML || '<p style="font-size:.8rem;color:#888;padding:20px;">Sem dados.</p>';

      /* So no modulo geral: clicar num fornecedor abre a lista de
         todas as suas facturas, da mais recente a mais antiga. Reusa
         a mesma "lista" ja carregada (sem novo fetch a Supabase). */
      body.querySelectorAll('.proc-fornecedor-total-row').forEach(function(tr) {
        tr.addEventListener('click', function() {
          var norm = tr.getAttribute('data-fornecedor');
          procMostrarModalFacturasFornecedor(norm, lista);
        });
      });
    }).catch(function(e) {
      var body = document.getElementById('proc-totais-fornecedor-body');
      if (body) body.innerHTML = '<p style="font-size:.8rem;color:#c00;padding:20px;">Erro ao carregar dados.</p>';
      console.warn('[proc] erro ao carregar totais por fornecedor:', e);
    });
  }

  /* Modal aberto a partir de uma linha do modulo geral de Totais por
     Fornecedor: lista TODAS as facturas desse fornecedor (todas as
     sessoes, todos os anos), ordenadas cronologicamente da mais
     recente a mais antiga. "lista" e reaproveitada do modal anterior,
     sem novo fetch a Supabase. So leitura, nunca escreve nada. */
  function procMostrarModalFacturasFornecedor(fornecedorNorm, lista) {
    var old = document.getElementById('proc-facturas-fornecedor-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var itens = lista.filter(function(item) {
      var bruto = (item.fatura.proveedor || '').trim();
      return bruto && procNormalize(bruto) === fornecedorNorm;
    }).slice().sort(function(a, b) {
      return (b.ano * 10000 + b.mes * 100 + b.dia) - (a.ano * 10000 + a.mes * 100 + a.dia);
    });

    var linhasHTML = itens.length ? itens.map(function(item) {
      var dataStr = String(item.dia).padStart(2, '0') + '/' + String(item.mes).padStart(2, '0') + '/' + item.ano;
      var total = procCalcularTotalLinhasFatura(item.fatura);
      var guia = (item.fatura.guiaErp || '').toString().trim();
      var sessionKey = SESSION_PREFIX + procIsoAAAAMMDD(item.ano, item.mes, item.dia);
      return '<tr>'
        + '<td>' + dataStr + '</td>'
        + '<td class="center proc-guia-ir-sessao" data-session-key="' + sessionKey + '" title="Ir para a sessão" style="cursor:pointer;color:#8a6d1a;text-decoration:underline;text-decoration-style:dotted;">' + (guia || '—') + '</td>'
        + '<td class="center"><strong>' + procFormatarMoeda(total) + '</strong></td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="3" style="text-align:center;color:#888;">Sem facturas.</td></tr>';

    var modal = document.createElement('div');
    modal.id = 'proc-facturas-fornecedor-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:620px;width:92vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">' + fornecedorNorm + '</span>'
      +       '<span class="proc-or-panel-title-sub">Faturas · da mais recente à mais antiga</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">✕ Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll">'
      +     '<table class="proc-or-table">'
      +       '<thead><tr><th>Data</th><th class="center">Guia ERP</th><th class="center">Total</th></tr></thead>'
      +       '<tbody>' + linhasHTML + '</tbody>'
      +     '</table>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    /* Clicar na guia ERP (“entrada de stock”) leva directamente à
       sessão semanal que contem essa factura — fecha todos os modais
       abertos por cima (este e o de Totais por Fornecedor) e reaproveita
       procLoadSessionFromStart, a mesma funcao ja usada pelo botão
       "↩ carregar" do painel inicial, nunca uma nova. */
    modal.querySelectorAll('.proc-guia-ir-sessao').forEach(function(td) {
      td.addEventListener('click', function() {
        var sessionKey = td.getAttribute('data-session-key');
        if (!sessionKey) return;
        procCloseModal(modal);
        var totaisModal = document.getElementById('proc-totais-fornecedor-modal');
        if (totaisModal) procCloseModal(totaisModal);
        procLoadSessionFromStart(sessionKey);
      });
    });
  }

  /* Segundo modal: mesma tabela, mas cortada pela data (mes/dia) da
     sessao mais recente do ano corrente, aplicada por igual a todos
     os anos — comparacao "ate este ponto do calendario". */
  function procMostrarModalTotaisPorFornecedorCorte() {
    var old = document.getElementById('proc-totais-fornecedor-corte-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-totais-fornecedor-corte-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:1040px;width:95vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Totais por Fornecedor · até esta data</span>'
      +       '<span class="proc-or-panel-title-sub" id="proc-totais-corte-sub">A calcular corte…</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">✕ Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll" id="proc-totais-fornecedor-corte-body">'
      +     '<p style="font-size:.8rem;color:#888;padding:20px;">A carregar…</p>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    procCarregarFaturasComData().then(function(lista) {
      var body = document.getElementById('proc-totais-fornecedor-corte-body');
      var sub  = document.getElementById('proc-totais-corte-sub');
      if (!body) return;
      var corte = procCalcularCorteAnoAtual(lista);
      if (!corte) {
        if (sub) sub.textContent = 'Sem sessões no ano corrente';
        body.innerHTML = '<p style="font-size:.8rem;color:#888;padding:20px;">Ainda não há sessões no ano corrente para definir o corte.</p>';
        return;
      }
      var diaStr = String(corte.dia).padStart(2, '0') + '/' + String(corte.mes).padStart(2, '0');
      if (sub) sub.textContent = 'Compras até ' + diaStr + ' de cada ano · mesmo corte em todos os anos';

      var corteChave = corte.mes * 100 + corte.dia;
      var mapa = procAgregarPorFornecedorAno(lista, function(item) {
        return (item.mes * 100 + item.dia) <= corteChave;
      });
      var tabelaHTML = procMontarTabelaTotaisFornecedor(mapa);
      body.innerHTML = tabelaHTML || '<p style="font-size:.8rem;color:#888;padding:20px;">Sem dados.</p>';
    }).catch(function(e) {
      var body = document.getElementById('proc-totais-fornecedor-corte-body');
      if (body) body.innerHTML = '<p style="font-size:.8rem;color:#c00;padding:20px;">Erro ao carregar dados.</p>';
      console.warn('[proc] erro ao carregar totais por fornecedor (corte):', e);
    });
  }

  /* ══════════════ ARTIGOS POR FORNECEDOR ══════════════
     Reaproveita procCarregarFaturasComData() (mesma fonte de dados de
     Totais por Fornecedor — um so fetch a Supabase). Modal A lista os
     fornecedores (mesmo agrupamento por procNormalize); ao clicar um
     fornecedor, Modal B lista as suas referencias (com descricao) e o
     total de pecas compradas por ano + coluna Total, ordenadas por
     total de pecas (maior para menor; empates por ordem alfabetica).
     Tem um campo de filtro no topo (por referencia ou descricao). Ao
     clicar numa referencia, reaproveita directamente
     procAbrirRadiografia(ref) — o mesmo modal de historico que a
     busca do campo principal ja usa, incluindo a distribuicao A4/A5.
     Nunca escreve nada.

     Navegacao "para tras": fechar qualquer modal deste fluxo (botao,
     backdrop ou Escape) volta ao modal anterior em vez de fechar tudo
     — ver procLigarVoltar, aditivo por cima do procBindClose generico
     (nunca o substitui), por isso todos os outros modais do sistema
     continuam a fechar normalmente. */

  /* Liga backdrop / botao fechar / Escape de um modal a uma acao de
     "voltar" (reabrir o modal anterior), em vez de apenas fechar.
     Aditivo — nunca substitui procBindClose, so acrescenta por cima. */
  function procLigarVoltar(modal, aoVoltar) {
    if (!aoVoltar) return;
    var acionado = false;
    var voltar = function() {
      if (acionado) return;
      acionado = true;
      aoVoltar();
    };
    var backdrop = modal.querySelector('.proc-or-backdrop');
    var closeBtn = modal.querySelector('.proc-or-close-btn');
    if (backdrop) backdrop.addEventListener('click', voltar);
    if (closeBtn) closeBtn.addEventListener('click', voltar);
    var esc = function(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); voltar(); } };
    document.addEventListener('keydown', esc);
  }

  function procMostrarModalFornecedoresArtigos() {
    var old = document.getElementById('proc-fornecedores-artigos-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-fornecedores-artigos-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:520px;width:90vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Artigos por Fornecedor</span>'
      +       '<span class="proc-or-panel-title-sub">Selecione um fornecedor</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">✕ Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll" id="proc-fornecedores-artigos-body">'
      +     '<p style="font-size:.8rem;color:#888;padding:20px;">A carregar…</p>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    procCarregarFaturasComData().then(function(lista) {
      procRenderListaFornecedoresArtigos(lista);
    }).catch(function(e) {
      var body = document.getElementById('proc-fornecedores-artigos-body');
      if (body) body.innerHTML = '<p style="font-size:.8rem;color:#c00;padding:20px;">Erro ao carregar dados.</p>';
      console.warn('[proc] erro ao carregar fornecedores:', e);
    });
  }

  /* Re-renderiza o Modal A a partir de uma "lista" ja carregada em
     memoria (sem novo fetch) — usado tanto na primeira abertura como
     ao voltar do Modal B. */
  function procRenderListaFornecedoresArtigos(lista) {
    var old = document.getElementById('proc-fornecedores-artigos-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-fornecedores-artigos-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:520px;width:90vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">Artigos por Fornecedor</span>'
      +       '<span class="proc-or-panel-title-sub">Selecione um fornecedor</span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">✕ Fechar</button>'
      +   '</div>'
      +   '<div class="proc-or-scroll" id="proc-fornecedores-artigos-body"></div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);

    var body = document.getElementById('proc-fornecedores-artigos-body');
    if (!body) return;

    var nomes = {};
    lista.forEach(function(item) {
      var bruto = (item.fatura.proveedor || '').trim();
      if (!bruto) return;
      var norm = procNormalize(bruto);
      if (norm) nomes[norm] = true;
    });
    var fornecedores = Object.keys(nomes).sort(function(a, b) { return a.localeCompare(b, 'pt'); });
    if (!fornecedores.length) {
      body.innerHTML = '<p style="font-size:.8rem;color:#888;padding:20px;">Sem dados.</p>';
      return;
    }
    body.innerHTML = '<div style="padding:14px;">' + fornecedores.map(function(f) {
      return '<button type="button" class="proc-fornecedor-artigos-item" data-fornecedor="' + f.replace(/"/g, '&quot;') + '" '
        + 'style="display:block;width:100%;text-align:left;padding:10px 14px;margin:0 0 6px;border:1px solid #e2e2e2;border-radius:6px;background:#fafafa;cursor:pointer;font-size:.8rem;font-weight:700;letter-spacing:.03em;color:#222;">'
        + f + '</button>';
    }).join('') + '</div>';

    body.querySelectorAll('[data-fornecedor]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var norm = btn.getAttribute('data-fornecedor');
        procCloseModal(modal);
        procMostrarModalArtigosDoFornecedor(norm, lista, function() { procRenderListaFornecedoresArtigos(lista); });
      });
    });
  }

  /* Modal B — referencias de um fornecedor especifico, com descricao
     e pecas compradas por ano + Total, ordenadas por total de pecas
     (maior para menor). "lista" e reaproveitada do Modal A, sem novo
     fetch a Supabase. "aoVoltar", se fornecido, reabre o modal
     anterior ao fechar este (ver procLigarVoltar) e troca o texto do
     botao para "Voltar". */
  function procMostrarModalArtigosDoFornecedor(fornecedorNorm, lista, aoVoltar) {

  /* Cache simples da ultima data de vendas carregada no sistema
     (tabela vendas_primavera_dias, ja pequena e ordenada por dia —
     muito mais rapido que MAX(data) sobre vendas_primavera, que tem
     quase 400 mil linhas). So pede ao Supabase uma vez por sessao
     de pagina; chamadas seguintes reaproveitam o valor em cache
     (incluindo null, se a consulta falhar, para nao ficar em
     loop a tentar de novo). Devolve ao callback a data formatada
     'DD/MM/AAAA', ou null se ainda nao houver nenhuma linha. */
  var _ultimoDiaVendasCache;
  function procObterUltimoDiaVendasCarregado(callback) {
    if (_ultimoDiaVendasCache !== undefined) { callback(_ultimoDiaVendasCache); return; }
    procSbFetch('vendas_primavera_dias?select=data&order=data.desc&limit=1', { method: 'GET' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        var iso = (rows && rows.length) ? rows[0].data : null;
        var formatado = null;
        if (iso) {
          var partes = String(iso).split('-');
          if (partes.length === 3) formatado = partes[2] + '/' + partes[1] + '/' + partes[0];
        }
        _ultimoDiaVendasCache = formatado;
        callback(formatado);
      })
      .catch(function() {
        _ultimoDiaVendasCache = null;
        callback(null);
      });
  }

    var old = document.getElementById('proc-artigos-fornecedor-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.id = 'proc-artigos-fornecedor-modal';
    modal.className = 'proc-or-modal';
    modal.innerHTML =
        '<div class="proc-or-backdrop"></div>'
      + '<div class="proc-or-panel" style="max-width:1140px;width:96vw;">'
      +   '<div class="proc-or-panel-header">'
      +     '<div class="proc-or-panel-title">'
      +       '<span class="proc-or-panel-title-main">' + fornecedorNorm + '</span>'
      +       '<span class="proc-or-panel-title-sub">Peças compradas por referência e por ano · clique numa referência para ver o histórico<span id="proc-artigos-ultima-data" style="color:#8a6d1a;"></span></span>'
      +     '</div>'
      +     '<button class="proc-or-close-btn">' + (aoVoltar ? '‹ Voltar' : '✕ Fechar') + '</button>'
      +   '</div>'
      +   '<div style="padding:12px 20px 0;">'
      +     '<input type="text" id="proc-artigos-filtro" placeholder="Filtrar por referência ou descrição…" '
      +       'style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:.8rem;border:1px solid #ddd;border-radius:6px;">'
      +   '</div>'
      +   '<div class="proc-or-scroll" id="proc-artigos-fornecedor-body">'
      +     '<p style="font-size:.8rem;color:#888;padding:20px;">A carregar…</p>'
      +   '</div>'
      + '</div>';

    procOpenModal(modal);
    procBindClose(modal);
    procLigarVoltar(modal, aoVoltar);

    procObterUltimoDiaVendasCarregado(function(dataStr) {
      var elData = document.getElementById('proc-artigos-ultima-data');
      if (elData && dataStr) elData.textContent = ' · Informe atualizado até ' + dataStr;
    });

    var body = document.getElementById('proc-artigos-fornecedor-body');
    if (!body) return;

    var mapa = {}; /* ref → { display, desc, anos:{ano:pecas}, comprasA4, comprasA5, cutoffA4, cutoffA5 } */
    lista.forEach(function(item) {
      var bruto = (item.fatura.proveedor || '').trim();
      if (!bruto || procNormalize(bruto) !== fornecedorNorm) return;
      (item.fatura.rows || []).forEach(function(r) {
        var ref = (r.ref || '').trim();
        if (!ref) return;
        var a4v = r.a4 || 0, a5v = r.a5 || 0;
        var pecas = r.qtdFt || (a4v + a5v);
        if (!pecas) return;
        if (!mapa[ref]) mapa[ref] = { display: ref, desc: '', anos: {}, comprasA4: 0, comprasA5: 0, cutoffA4: null, cutoffA5: null };
        if (!mapa[ref].desc && r.desc) mapa[ref].desc = r.desc;
        mapa[ref].anos[item.ano] = (mapa[ref].anos[item.ano] || 0) + pecas;
        mapa[ref].comprasA4 += a4v;
        mapa[ref].comprasA5 += a5v;
        var isoData = procIsoAAAAMMDD(item.ano, item.mes, item.dia);
        if (a4v > 0 && (!mapa[ref].cutoffA4 || isoData < mapa[ref].cutoffA4)) mapa[ref].cutoffA4 = isoData;
        if (a5v > 0 && (!mapa[ref].cutoffA5 || isoData < mapa[ref].cutoffA5)) mapa[ref].cutoffA5 = isoData;
      });
    });

    /* Lotes de TODOS os fornecedores por referencia (nao so este) —
       para o FIFO entre fornecedores quando duas empresas partilham o
       mesmo codigo de referencia (ver procConstruirLotesPorReferencia). */
    var lotesPorReferencia = procConstruirLotesPorReferencia(lista);

    var referencias = Object.keys(mapa);    if (!referencias.length) {
      body.innerHTML = '<p style="font-size:.8rem;color:#888;padding:20px;">Sem artigos.</p>';
      return;
    }

    var anosSet = {};
    referencias.forEach(function(ref) {
      Object.keys(mapa[ref].anos).forEach(function(a) { anosSet[a] = true; });
    });
    var anos = Object.keys(anosSet).map(Number).sort(function(a, b) { return a - b; });

    /* Pre-calcula o total de cada referencia para ordenar por ele
       (maior para menor); em empate, ordem alfabetica para o
       resultado ficar estavel. */
    referencias.forEach(function(ref) {
      var t = 0;
      anos.forEach(function(a) { t += mapa[ref].anos[a] || 0; });
      mapa[ref].total = t;
    });
    referencias.sort(function(a, b) {
      return mapa[b].total - mapa[a].total || mapa[a].display.localeCompare(mapa[b].display, 'pt');
    });

    /* Cabecalho de cada ano vira um botao clicavel: filtra a lista
       para so mostrar referencias com pecas compradas nesse ano.
       Clicar de novo no mesmo ano remove o filtro (ver
       procAplicarFiltrosArtigos mais abaixo). As cores sao aplicadas
       via setProperty(..., 'important') porque o estilo inline normal
       pode ser sobreposto por regras !important da folha de estilos
       do "th" — assim garante-se sempre o contraste correcto.
       O cabecalho ganhou uma segunda linha de grupo ("Peças compradas"
       / "Stock atual") para nao confundir o Total de compras historico
       com o Total de stock actual, que sao coisas diferentes. */
    var theadHTML = '<tr>'
      +   '<th rowspan="2" style="vertical-align:bottom;">Referência</th>'
      +   '<th rowspan="2" style="vertical-align:bottom;">Descrição</th>'
      +   '<th colspan="' + (anos.length + 1) + '" class="center" style="border-bottom:1px solid #ddd;">Peças compradas</th>'
      +   '<th colspan="3" class="center" style="border-bottom:1px solid #ddd;">Stock actual <button type="button" id="proc-stock-sort-btn" disabled title="A carregar stock\u2026" style="display:inline-block;margin-left:8px;padding:2px 9px;font-size:.68rem;font-weight:700;letter-spacing:.02em;border:1px solid #ccc;border-radius:10px;background:#f2f2f2;color:#999;cursor:not-allowed;vertical-align:middle;">\u21c5 Ordenar por Stock</button></th>'
      + '</tr>'
      + '<tr>'
      + anos.map(function(a) {
          return '<th class="center" style="width:56px;padding-left:2px;padding-right:2px;">'
            + '<button type="button" class="proc-artigos-ano-btn" data-ano="' + a + '" '
            + 'style="display:inline-block;padding:3px 10px;font:inherit;font-weight:700;letter-spacing:.03em;'
            + 'cursor:pointer;border:1px solid #ccc;border-radius:12px;background:#f2f2f2;color:#333;line-height:1.4;">'
            + a + '</button></th>';
        }).join('')
      +   '<th class="center" style="width:70px;"><strong>Total</strong></th>'
      +   '<th class="center" style="width:56px;">A4</th>'
      +   '<th class="center" style="width:56px;">A5</th>'
      +   '<th class="center" style="width:70px;"><strong>Total</strong></th>'
      + '</tr>';

    var tbodyHTML = referencias.map(function(ref) {
      var linha = mapa[ref];
      var anosComPecas = [];
      var cels = anos.map(function(a) {
        var v = linha.anos[a] || 0;
        if (v) anosComPecas.push(a);
        return '<td class="center" style="padding-left:4px;padding-right:4px;">' + (v || '—') + '</td>';
      }).join('');
      var outrosFornecedores = (lotesPorReferencia[ref] || []).filter(function(l) { return l.fornecedorNorm !== fornecedorNorm; });
      var badgeCompartilhada = outrosFornecedores.length
        ? ' <span class="proc-ref-compartilhada" title="Esta referência também é comprada a: ' + outrosFornecedores.map(function(l) { return l.fornecedorDisplay; }).join(', ').replace(/"/g, '&quot;') + '. Stock calculado em FIFO entre fornecedores (o lote mais antigo esgota primeiro)." style="display:inline-block;margin-left:6px;font-size:.7rem;font-weight:600;color:#8a6d1a;border:1px solid #C9A227;background:#FBF3D9;border-radius:8px;padding:1px 7px;cursor:help;vertical-align:middle;">⇄ partilhada</span>'
        : '';
      return '<tr class="proc-artigo-row" data-ref="' + linha.display.replace(/"/g, '&quot;') + '" '
        + 'data-filtro="' + (linha.display + ' ' + (linha.desc || '')).toLowerCase().replace(/"/g, '&quot;') + '" '
        + 'data-anos="' + anosComPecas.join(',') + '" style="cursor:pointer;">'
        + '<td>' + linha.display + badgeCompartilhada + '</td>'
        + '<td>' + (linha.desc || '—').toUpperCase() + '</td>'
        + cels
        + '<td class="center"><strong>' + linha.total + '</strong></td>'
        + '<td class="center proc-stock-a4">…</td>'
        + '<td class="center proc-stock-a5">…</td>'
        + '<td class="center proc-stock-total">…</td></tr>';
    }).join('');
    body.innerHTML = '<table class="proc-or-table">'
      + '<thead>' + theadHTML + '</thead>'
      + '<tbody>' + tbodyHTML + '</tbody>'
      + '</table>';

    body.querySelectorAll('.proc-artigo-row').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var ref = tr.getAttribute('data-ref');
        procCloseModal(modal);
        procAbrirRadiografia(ref, null, function() {
          procMostrarModalArtigosDoFornecedor(fornecedorNorm, lista, aoVoltar);
        });
      });
    });

    /* Filtro combinado: texto (referencia/descricao) + ano activo
       (botao no cabecalho da coluna). Uma linha so fica visivel se
       passar nos dois criterios ao mesmo tempo. */
    var anoAtivo = null;
    var filtroInput = modal.querySelector('#proc-artigos-filtro');

    function procAplicarFiltrosArtigos() {
      var q = filtroInput ? filtroInput.value.trim().toLowerCase() : '';
      body.querySelectorAll('.proc-artigo-row').forEach(function(tr) {
        var alvo = tr.getAttribute('data-filtro') || '';
        var passaTexto = !q || alvo.indexOf(q) !== -1;
        var anosLinha = (tr.getAttribute('data-anos') || '').split(',');
        var passaAno = anoAtivo === null || anosLinha.indexOf(String(anoAtivo)) !== -1;
        tr.style.display = (passaTexto && passaAno) ? '' : 'none';
      });
    }

    if (filtroInput) filtroInput.addEventListener('input', procAplicarFiltrosArtigos);

    /* setProperty(..., 'important') garante que a cor/fundo do botao
       nunca fica sobreposta por regras !important externas do "th"
       — inline !important tem sempre a prioridade mais alta da
       cascata CSS, acima de qualquer !important de folha de estilos. */
    function procPintarBotaoAno(b, activo) {
      if (activo) {
        b.style.setProperty('background', '#222', 'important');
        b.style.setProperty('color', '#fff', 'important');
        b.style.setProperty('border-color', '#222', 'important');
      } else {
        b.style.setProperty('background', '#f2f2f2', 'important');
        b.style.setProperty('color', '#333', 'important');
        b.style.setProperty('border-color', '#ccc', 'important');
      }
    }

    modal.querySelectorAll('.proc-artigos-ano-btn').forEach(function(btn) {
      procPintarBotaoAno(btn, false);
      btn.addEventListener('click', function() {
        var ano = parseInt(btn.getAttribute('data-ano'), 10);
        anoAtivo = (anoAtivo === ano) ? null : ano;
        modal.querySelectorAll('.proc-artigos-ano-btn').forEach(function(b) {
          var activo = anoAtivo !== null && parseInt(b.getAttribute('data-ano'), 10) === anoAtivo;
          procPintarBotaoAno(b, activo);
        });
        procAplicarFiltrosArtigos();
      });
    });

    /* Stock actual (A4/A5/Total) = pecas compradas ate hoje menos as
       vendidas desde a primeira compra em cada armazem — calculado
       num unico pedido em lote ao Supabase (RPC stock_por_referencias)
       para nao bater no limite de tempo com uma chamada por
       referencia. Preenche as celulas placeholder "…" depois da
       tabela ja estar visivel, para nao atrasar a abertura do modal.
       Quando uma referencia tem lotes de mais de um fornecedor, o
       cutoff enviado ao RPC é o do lote MAIS ANTIGO entre todos —
       depois o total vendido é repartido em FIFO (ver procAlocarFifo),
       e só a parte deste fornecedor é mostrada aqui. */
    var paresStock = referencias.map(function(ref) {
      var lotesA4 = procLotesOrdenados(lotesPorReferencia[ref], 'comprasA4', 'cutoffA4');
      var lotesA5 = procLotesOrdenados(lotesPorReferencia[ref], 'comprasA5', 'cutoffA5');
      var cutoffA4 = lotesA4.length ? lotesA4[0].cutoffA4 : null;
      var cutoffA5 = lotesA5.length ? lotesA5[0].cutoffA5 : null;
      return { referencia: ref, cutoff_a4: procSubtrairDiasIso(cutoffA4, FOLGA_CORTE_DIAS), cutoff_a5: procSubtrairDiasIso(cutoffA5, FOLGA_CORTE_DIAS) };
    });
    procCalcularStockLote(paresStock, function(stockMapa) {
      var trEls = body.querySelectorAll('.proc-artigo-row');
      trEls.forEach(function(tr, i) {
        var ref = referencias[i];
        var compras = mapa[ref];
        var celA4 = tr.querySelector('.proc-stock-a4');
        var celA5 = tr.querySelector('.proc-stock-a5');
        var celTotal = tr.querySelector('.proc-stock-total');
        if (!celA4 || !celA5 || !celTotal) return;
        if (!stockMapa) {
          celA4.textContent = '⚠'; celA5.textContent = '⚠'; celTotal.textContent = '⚠';
          celA4.title = celA5.title = celTotal.title = 'Erro ao calcular o stock (ref=' + ref + ').';
          return;
        }
        var venda = stockMapa[ref] || { vendidoA4: 0, vendidoA5: 0, temLojaNaoMapeada: false };
        if (venda.erro) {
          celA4.textContent = '⚠'; celA5.textContent = '⚠'; celTotal.textContent = '⚠';
          celA4.title = celA5.title = celTotal.title = 'Erro ao obter este lote do Supabase (ref=' + ref + '). Tenta recarregar.';
          return;
        }
        var lotesA4 = procLotesOrdenados(lotesPorReferencia[ref], 'comprasA4', 'cutoffA4');
        var lotesA5 = procLotesOrdenados(lotesPorReferencia[ref], 'comprasA5', 'cutoffA5');
        procAlocarFifo(lotesA4, venda.vendidoA4, 'comprasA4', 'stockA4');
        procAlocarFifo(lotesA5, venda.vendidoA5, 'comprasA5', 'stockA5');
        var meuLoteA4 = lotesA4.filter(function(l) { return l.fornecedorNorm === fornecedorNorm; })[0];
        var meuLoteA5 = lotesA5.filter(function(l) { return l.fornecedorNorm === fornecedorNorm; })[0];
        var stockA4 = meuLoteA4 ? meuLoteA4.stockA4 : compras.comprasA4;
        var stockA5 = meuLoteA5 ? meuLoteA5.stockA5 : compras.comprasA5;
        celA4.textContent = stockA4;
        celA5.textContent = stockA5;
        var detalheTextoA5 = procFormatarDetalheA5(venda.detalheA5);
        if (detalheTextoA5) {
          celA5.title = detalheTextoA5;
          celA5.style.cursor = 'help';
        }
        celTotal.innerHTML = '<strong>' + (stockA4 + stockA5) + '</strong>' + (venda.temLojaNaoMapeada ? ' ⚠' : '');
        if (venda.temLojaNaoMapeada) {
          celTotal.title = 'Há vendas desta referência num posto de venda não mapeado para A4/A5 — não entraram neste cálculo.';
        }
        tr.setAttribute('data-stock-total', String(stockA4 + stockA5));
      });

      /* Botão "⇅ Ordenar por Stock" — só fica activo depois de todas
         as células de stock estarem preenchidas (data-stock-total já
         calculado em cada linha). Funciona como interruptor: um clique
         ordena por Stock Total decrescente (maior primeiro, para
         destacar as referências com mais peças paradas em stock); um
         segundo clique restaura a ordem original (por peças compradas).
         Reordena os nós <tr> directamente no DOM — preserva o estado
         de filtro (texto/ano) e os listeners de clique de cada linha. */
      var sortBtn = modal.querySelector('#proc-stock-sort-btn');
      if (sortBtn) {
        var ordemOriginalStock = Array.prototype.slice.call(trEls);
        var ordenadoPorStock = false;
        sortBtn.disabled = false;
        sortBtn.title = 'Ordenar as referências pelo Stock Total (maior para menor)';
        sortBtn.style.setProperty('background', '#f2f2f2', 'important');
        sortBtn.style.setProperty('color', '#333', 'important');
        sortBtn.style.cursor = 'pointer';
        sortBtn.addEventListener('click', function() {
          var tbodyEl = body.querySelector('tbody');
          if (!tbodyEl) return;
          if (ordenadoPorStock) {
            ordemOriginalStock.forEach(function(tr) { tbodyEl.appendChild(tr); });
            sortBtn.style.setProperty('background', '#f2f2f2', 'important');
            sortBtn.style.setProperty('color', '#333', 'important');
            sortBtn.style.setProperty('border-color', '#ccc', 'important');
            sortBtn.title = 'Ordenar as referências pelo Stock Total (maior para menor)';
            ordenadoPorStock = false;
            return;
          }
          var linhasTbody = Array.prototype.slice.call(tbodyEl.querySelectorAll('.proc-artigo-row'));
          linhasTbody.sort(function(a, b) {
            return (parseFloat(b.getAttribute('data-stock-total')) || 0) - (parseFloat(a.getAttribute('data-stock-total')) || 0);
          });
          linhasTbody.forEach(function(tr) { tbodyEl.appendChild(tr); });
          sortBtn.style.setProperty('background', '#222', 'important');
          sortBtn.style.setProperty('color', '#fff', 'important');
          sortBtn.style.setProperty('border-color', '#222', 'important');
          sortBtn.title = 'Clicar para voltar à ordem original';
          ordenadoPorStock = true;
        });
      }
    });  }

  /* ── Render session list in the start panel ── */
  function procRenderStartPanel() {
    var list = document.getElementById('proc-start-sessions-list');
    if (!list) return;
    var keys = getAllSessionKeys();
    if (!keys.length) {
      list.innerHTML = '';
      return;
    }

    function montarItemHTML(key) {
      var label = labelFromKey(key);
      var dateStr = '', nFat = '';
      try {
        var d = JSON.parse(localStorage.getItem(key));
        if (d && d.savedAt) {
          var dt = new Date(d.savedAt);
          dateStr = dt.toLocaleDateString('pt-PT') + ' \u00b7 ' + dt.toLocaleTimeString('pt-PT', {hour:'2-digit',minute:'2-digit'});
        }
        if (d && d.faturas) nFat = d.faturas.length + ' fat.';
      } catch(e) {}
      var meta = [dateStr, nFat].filter(Boolean).join(' \u00b7 ');
      return '<div class="proc-session-item">'
        + '<div class="proc-session-item-info">'
        +   '<div class="proc-session-item-label">' + label + '</div>'
        +   (meta ? '<div class="proc-session-item-meta">' + meta + '</div>' : '')
        + '</div>'
        + '<div class="proc-session-item-actions">'
        +   '<button class="proc-start-load-btn" data-key="' + key + '">\u21a9 carregar</button>'
        +   '<button class="proc-start-del-btn" data-key="' + key + '">\u2715</button>'
        + '</div>'
        + '</div>';
    }

    var agrupado = procAgruparSessoesPorMes(keys);
    var html = '<div class="proc-section-label">sess\u00f5es guardadas \u00b7 ' + keys.length + '</div>';
    html += agrupado.soltas.map(montarItemHTML).join('');
    html += agrupado.grupos.map(function(g) {
      return procMontarGrupoSessaoHTML(g, g.keys.map(montarItemHTML).join(''));
    }).join('');
    html += agrupado.gruposAno.map(function(ga) {
      var mesesHTML = ga.gruposMes.map(function(g) {
        return procMontarGrupoSessaoHTML(g, g.keys.map(montarItemHTML).join(''));
      }).join('');
      return procMontarGrupoSessaoHTML(ga, mesesHTML);
    }).join('');
    list.innerHTML = html;
    procLigarGruposSessaoHTML(list);

    list.querySelectorAll('.proc-start-load-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        procLoadSessionFromStart(btn.dataset.key);
      });
    });
    list.querySelectorAll('.proc-start-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        procDeleteSession(btn.dataset.key);
        setTimeout(procRenderStartPanel, 100);
      });
    });
  }

  /* Load a session from the start panel — always forces remote fetch first */
  function procLoadSessionFromStart(key) {
    procSetSyncStatus('syncing', 'a actualizar\u2026');
    procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(key) + '&select=dados', { method: 'GET' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        var raw = (rows && rows.length && rows[0].dados) ? rows[0].dados : null;
        if (!raw) {
          raw = localStorage.getItem(key);
          if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
          procApplySessionData(key, raw, function() {
            procMarkSynced();
            procShowMainArea(key);
            procSetSyncStatus('offline', 'sem dados remotos \u2014 carregado localmente');
          });
          return;
        }
        /* Force-overwrite localStorage with freshest remote data */
        try { localStorage.setItem(key, raw); } catch(e) {}
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('ok', '\u2713 actualizado e carregado');
        });
      })
      .catch(function() {
        var raw = localStorage.getItem(key);
        if (!raw) { procSetSyncStatus('error', 'sess\u00e3o n\u00e3o encontrada'); return; }
        procApplySessionData(key, raw, function() {
          procMarkSynced();
          procShowMainArea(key);
          procSetSyncStatus('offline', 'offline \u2014 carregado localmente');
        });
      });
  }

  /* Start a brand-new session */
  function procStartNewSession() {
    if (weekSessionExists()) {
      procFloatModal({
        title: 'J\u00e1 existe uma sess\u00e3o esta semana',
        body: 'J\u00e1 existe uma sess\u00e3o criada esta semana, podes continuar a utiliz\u00e1-la.',
        buttons: [
          { label: 'Entendido', style: 'background:#f0f0f0;border:1px solid #555;color:#000;font-weight:700;', cb: null }
        ]
      });
      return;
    }
    _activeSessionKey = getNextWeekKey();
    procMarkSynced();
    procAddFatura(null);
    procShowMainArea(_activeSessionKey);
    procSetSyncStatus('ok', 'nova sess\u00e3o');
  }

  /* Show/hide between start panel and main work area */
  function procShowMainArea(key) {
    procLockAcquire(key);   /* sesión activa → tomar lock (expulsa a otro dispositivo en la misma sesión) */
    var start = document.getElementById('proc-session-start');
    var main  = document.getElementById('proc-main-area');
    var addBtn = document.getElementById('proc-addFaturaBtn');
    if (start) start.style.display = 'none';
    var newBtnWrap1 = document.getElementById('proc-session-bar-center');
    if (newBtnWrap1) newBtnWrap1.style.display = 'none';
    var barRight1 = document.getElementById('proc-session-bar-right');
    if (barRight1) barRight1.style.display = '';
    if (main)  main.style.display  = '';
    if (addBtn) {
      var newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener('click', function() { procAddFatura(null); });
    }
    /* Show save and guia buttons, switch bar alignment */
    var saveBtn = document.getElementById('proc-saveBtn');
    var guiaBtn = document.getElementById('proc-guiaBtn');
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveBtn) saveBtn.style.display = '';
    if (guiaBtn) guiaBtn.style.display = '';
    if (saveStatus) saveStatus.style.display = '';
    /* Update label in session bar */
    var lbl = document.getElementById('proc-session-label');
    if (lbl && key) { lbl.textContent = labelFromKey(key); lbl.style.display = ''; }
    /* Floating action buttons */
    procCreateFloatingButtons();
    procShowFloatingButtons();
  }

  function procShowStartArea() {
    var start = document.getElementById('proc-session-start');
    var main  = document.getElementById('proc-main-area');
    if (start) start.style.display = 'flex';
    var newBtnWrap2 = document.getElementById('proc-session-bar-center');
    if (newBtnWrap2) newBtnWrap2.style.display = '';
    var barRight2 = document.getElementById('proc-session-bar-right');
    if (barRight2) barRight2.style.display = 'none';
    if (main)  main.style.display  = 'none';
    var lbl = document.getElementById('proc-session-label');
    if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
    /* Hide save and guia, recenter bar */
    var saveBtn = document.getElementById('proc-saveBtn');
    var guiaBtn = document.getElementById('proc-guiaBtn');
    var saveStatus = document.getElementById('proc-saveStatus');
    if (saveBtn) saveBtn.style.display = 'none';
    if (guiaBtn) guiaBtn.style.display = 'none';
    if (saveStatus) saveStatus.style.display = 'none';
    /* Hide floating buttons */
    procHideFloatingButtons();
    /* Reload remote keys then render */
    procLoadRemoteKeys(procRenderStartPanel);
  }

  /* Ao fechar uma sess\u00e3o com facturas cuja data foi corrigida
     manualmente (ver _procDataCorrigidaPorFatura / procShowStockModal),
     move cada uma delas para a sess\u00e3o semanal correcta (segunda-feira
     da data corrigida), criando essa sess\u00e3o se ainda n\u00e3o existir.
     Sequencial (n\u00e3o paralelo) para nunca haver duas escritas
     concorrentes na mesma sess\u00e3o de destino quando duas facturas
     corrigidas caem na mesma semana. A sess\u00e3o de origem fica apenas
     com as facturas \u201cmantidas\u201d (payloadCompleto.faturas menos as
     pendentes); se n\u00e3o sobrar nenhuma, a sess\u00e3o de origem \u00e9 apagada. */
  function procResolverFecharComFacturasCorrigidas(keyAtual, payloadCompleto, pendentes, onDone) {
    var mantidas = payloadCompleto.faturas.filter(function(f) {
      return pendentes.indexOf(f) === -1;
    });

    function moverProxima(idx) {
      if (idx >= pendentes.length) { if (onDone) onDone(); return; }
      var fatura  = pendentes[idx];
      var segunda = procDataParfoisParaSegunda(fatura.dataCorrigida.data);
      if (!segunda) { moverProxima(idx + 1); return; }
      var targetKey = SESSION_PREFIX + procIsoAAAAMMDD(segunda.getFullYear(), segunda.getMonth() + 1, segunda.getDate());
      var agoraIso  = new Date().toISOString();
      var faturaMovida = Object.assign({}, fatura, {
        dataCorrigida: { data: fatura.dataCorrigida.data, movida: true, sessaoDestino: targetKey, movidaEm: agoraIso }
      });
      procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(targetKey) + '&select=dados', { method: 'GET' })
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(rows) {
          var payloadDestino;
          if (rows && rows.length && rows[0].dados) {
            try { payloadDestino = JSON.parse(rows[0].dados); } catch (e) { payloadDestino = null; }
          }
          if (!payloadDestino) payloadDestino = { savedAt: agoraIso, sentRefs: {}, faturas: [] };
          if (!payloadDestino.faturas) payloadDestino.faturas = [];
          payloadDestino.faturas.push(faturaMovida);
          payloadDestino.savedAt = new Date().toISOString();
          return procSbFetch('proc_sessoes', {
            method: 'POST',
            headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify({ session_key: targetKey, dados: JSON.stringify(payloadDestino), updated_at: payloadDestino.savedAt })
          });
        })
        .then(function() { moverProxima(idx + 1); })
        .catch(function() { moverProxima(idx + 1); });
    }

    if (mantidas.length) {
      var payloadMantidas = { savedAt: new Date().toISOString(), sentRefs: payloadCompleto.sentRefs || {}, faturas: mantidas };
      procSbFetch('proc_sessoes', {
        method: 'POST',
        headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ session_key: keyAtual, dados: JSON.stringify(payloadMantidas), updated_at: payloadMantidas.savedAt })
      }).then(function() { moverProxima(0); }).catch(function() { moverProxima(0); });
    } else {
      procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(keyAtual), { method: 'DELETE' })
        .then(function() { moverProxima(0); }).catch(function() { moverProxima(0); });
    }
  }

  /* \u2500\u2500 16b. CLOSE / RESET SESSION \u2500\u2500 */
  function procCloseActiveSession() {
    procFloatModal({
      label: 'Fechar sess\u00e3o',
      title: 'Guardar e fechar a sess\u00e3o activa?',
      body: 'A sess\u00e3o ser\u00e1 guardada. Podes retomar a qualquer momento.',
      buttons: [
        {
          label: '\ud83d\udcbe Guardar e fechar',
          style: 'background:#F5EAEA;border:1px solid #e8c5c5;color:#9B4D4D;font-weight:700;',
          cb: function() {
            var payloadAtual = _isSynced ? procBuildSavePayload() : null;
            var pendentes = [];
            if (payloadAtual) {
              pendentes = payloadAtual.faturas.filter(function(f) {
                return f.dataCorrigida && f.dataCorrigida.data && !f.dataCorrigida.movida;
              });
            }

            function finalizarFecho() {
              procLockRelease();
              setTimeout(function() {
                _isSynced = false;
                _activeSessionKey = null;
                _procInited = false;
                faturaCount   = 0;
                activeFaturas = [];
                Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
                _procSentRefs = {};
                var cont = document.getElementById('proc-faturasContainer');
                if (cont) cont.innerHTML = '';
                var saveBtn = document.getElementById('proc-saveBtn');
                if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = ''; saveBtn.style.cursor = ''; }
                procSetSyncStatus('ok', 'sess\u00e3o fechada');
                procShowStartArea();
              }, 400);
            }

            if (_isSynced && payloadAtual && pendentes.length) {
              var keyAtual = _activeSessionKey || getSessionKey();
              procSetSyncStatus('syncing', 'a mover factura(s) corrigida(s)\u2026');
              procResolverFecharComFacturasCorrigidas(keyAtual, payloadAtual, pendentes, finalizarFecho);
            } else {
              if (_isSynced) procSaveSession(true);
              finalizarFecho();
            }
          }
        },
        { label: 'Cancelar', style: 'background:#fff;border:1px solid #9DB6C9;color:#000;', cb: null }
      ]
    });
  }

  /* ── 17. INIT ── */
  function initProcessamento(container) {
    if (_procInited) return;
    _procInited = true;

    faturaCount   = 0;
    activeFaturas = [];
    Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });

    buildOverlayContent(container);

    /* Carrega biblioteca de fornecedores remota (non-blocking) */
    procLoadFornecedoresRemote();

    /* Pre-carrega categorias (non-blocking) — evita que a primeira
       correcao/edicao de uma linha, logo a seguir a abrir a sessao,
       resolva categoria='XX' por a cache ainda nao estar pronta. */
    procLoadCategoriasRemote();

    /* Importa automaticamente facturas TAM ja fechadas (com guia ERP),
       desde 18/08/2026 em diante (non-blocking, silenciosa, nunca
       sobrescreve nem duplica — ver procImportarTamAutomatico). */
    procImportarTamAutomatico();

    /* Importa automaticamente facturas Parfois ja fechadas (com guia ERP),
       desde 18/08/2026 em diante (non-blocking, silenciosa, nunca
       sobrescreve nem duplica — ver procImportarParfoisAutomatico). */
    procImportarParfoisAutomatico();

    /* Show start area (non-blocking) — loads remote keys then renders */
    procShowStartArea();

    /* auto-save every 10 s */
    setInterval(function() { procSaveSession(false); }, 10000);

    /* ── Auto-cierre por inactividad: 10 minutos ──
       Se resetea con cualquier click, tecla o input dentro del módulo.
       Si no hay actividad en 10 min y hay sesión activa, guarda y vuelve
       al dashboard exactamente igual que si el usuario hubiera pulsado volver. */
    var _inactivityTimer = null;
    var _INACTIVITY_MS   = 10 * 60 * 1000;

    function procResetInactivity() {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = setTimeout(function() {
        if (!_activeSessionKey) return;
        var backBtn = document.getElementById('adm-back-btn');
        if (!backBtn) return;
        if (_isSynced) procSaveSession(false);
        procLockRelease();
        procHideFloatingButtons();
        _isSynced         = false;
        _activeSessionKey = null;
        _procInited       = false;
        faturaCount       = 0;
        activeFaturas     = [];
        Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
        _procSentRefs = {};
        var cont = document.getElementById('proc-faturasContainer');
        if (cont) cont.innerHTML = '';
        setTimeout(function() {
          backBtn._procBound = false;
          backBtn.click();
        }, 80);
      }, _INACTIVITY_MS);
    }

    var _procRoot = document.getElementById('proc-root') || container;
    _procRoot.addEventListener('click',   procResetInactivity, true);
    _procRoot.addEventListener('keydown', procResetInactivity, true);
    _procRoot.addEventListener('input',   procResetInactivity, true);
    procResetInactivity();

    /* Undo keyboard shortcut (Ctrl+Z) */
    procInitUndoKeyboard();

    /* ── adm-back-btn: guardar, fechar sessão e ocultar botões flutuantes ──
       Antes de guardar, verifica se ha facturas com data corrigida ainda
       por mover (ver botão ✱ / procResolverFecharComFacturasCorrigidas)
       — se houver, move-as primeiro para a sessão semanal correcta (a
       mesma logica ja usada e confiavel, so agora ligada ao botao real de
       sair, que antes nunca a disparava). */
    (function() {
      var backBtn = document.getElementById('adm-back-btn');
      if (!backBtn || backBtn._procBound) return;
      backBtn._procBound = true;
      backBtn.addEventListener('click', function(e) {
        if (!_isSynced || !_activeSessionKey) return;
        e.stopImmediatePropagation();

        function finalizarSaidaVoltar() {
          procLockRelease();
          procHideFloatingButtons();
          _isSynced         = false;
          _activeSessionKey = null;
          _procInited       = false;
          faturaCount   = 0;
          activeFaturas = [];
          Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
          _procSentRefs = {};
          var cont = document.getElementById('proc-faturasContainer');
          if (cont) cont.innerHTML = '';
          setTimeout(function() {
            backBtn._procBound = false;
            backBtn.click();
            backBtn._procBound = true;
          }, 80);
        }

        var payloadAtual = procBuildSavePayload();
        var pendentes = payloadAtual ? payloadAtual.faturas.filter(function(f) {
          return f.dataCorrigida && f.dataCorrigida.data && !f.dataCorrigida.movida;
        }) : [];

        if (payloadAtual && pendentes.length) {
          var keyAtual = _activeSessionKey || getSessionKey();
          procSetSyncStatus('syncing', 'a mover factura(s) corrigida(s)…');
          procResolverFecharComFacturasCorrigidas(keyAtual, payloadAtual, pendentes, finalizarSaidaVoltar);
        } else {
          procSaveSession(false);
          finalizarSaidaVoltar();
        }
      }, true);
    })();
  }

  /* ── 18. OVERLAY OPEN / CLOSE ── */
  function openProcessamentoOverlay() {
    ensureOverlayShell();
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    requestAnimationFrame(function() { overlay.classList.add('visible'); });

    var root = document.getElementById('proc-root');
    if (!root) return;

    var content = document.getElementById('proc-content');
    if (!content) {
      /* Primeira vez — inicializar */
      initProcessamento(root);
    } else if (!_activeSessionKey) {
      /* Voltou sem sessão activa — mostrar ecrã de início */
      _procInited = false;
      initProcessamento(root);
    }
    /* Se há sessão activa, a UI já está correcta */
  }

  /* ── procDoCloseSession: guarda e reseta o estado da sessão ──
     Mesma verificacao de facturas com data corrigida pendente (ver
     adm-back-btn acima) — esta e a outra saida real do modulo (fechar
     a overlay), por isso precisa da mesma ligacao. */
  function procDoCloseSession() {
    function finalizarFecho() {
      procLockRelease();
      _isSynced         = false;
      _activeSessionKey = null;
      _procInited       = false;
      faturaCount       = 0;
      activeFaturas     = [];
      Object.keys(rowCounts).forEach(function(k) { delete rowCounts[k]; });
      _procSentRefs     = {};
      var cont = document.getElementById('proc-faturasContainer');
      if (cont) cont.innerHTML = '';
      var saveBtn = document.getElementById('proc-saveBtn');
      if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.style.opacity = ''; saveBtn.style.cursor = ''; }
      var guiaBtn = document.getElementById('proc-guiaBtn');
      if (guiaBtn) guiaBtn.style.display = 'none';
      var saveStatus = document.getElementById('proc-saveStatus');
      if (saveStatus) saveStatus.style.display = 'none';
      var lbl = document.getElementById('proc-session-label');
      if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
      var main = document.getElementById('proc-main-area');
      if (main) main.style.display = 'none';
      var start = document.getElementById('proc-session-start');
      if (start) start.style.display = 'flex';
      var newBtnWrap3 = document.getElementById('proc-session-bar-center');
      if (newBtnWrap3) newBtnWrap3.style.display = '';
      var barRight3 = document.getElementById('proc-session-bar-right');
      if (barRight3) barRight3.style.display = 'none';
      procHideFloatingButtons();
      var backBtn = document.getElementById('adm-back-btn');
      if (backBtn) backBtn._procBound = false;
      procLoadRemoteKeys(procRenderStartPanel);
    }

    if (!_isSynced || !_activeSessionKey) { finalizarFecho(); return; }

    var payloadAtual = procBuildSavePayload();
    var pendentes = payloadAtual ? payloadAtual.faturas.filter(function(f) {
      return f.dataCorrigida && f.dataCorrigida.data && !f.dataCorrigida.movida;
    }) : [];

    if (payloadAtual && pendentes.length) {
      var keyAtual = _activeSessionKey || getSessionKey();
      procSetSyncStatus('syncing', 'a mover factura(s) corrigida(s)…');
      procResolverFecharComFacturasCorrigidas(keyAtual, payloadAtual, pendentes, finalizarFecho);
    } else {
      procSaveSession(false);
      finalizarFecho();
    }
  }

  function closeProcessamentoOverlay() {
    var overlay = document.getElementById('processamento-overlay');
    if (!overlay) return;
    /* Se há sessão activa, guardar e fechar antes de esconder a overlay */
    if (_activeSessionKey) procDoCloseSession();
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.classList.remove('open'); }, 600);
    // Este overlay é anterior ao acordeão do dashboard e cobre-o por completo;
    // ao voltar, o grupo "Faturas" tem de ser colapsado tal como acontece no
    // fluxo normal via goToDashboard() — senão fica expandido por baixo.
    if (typeof window.collapseAccordion === 'function') window.collapseAccordion();
  }

  /* ── 19. GUIA DE TRANSPORTE ── */

  /* sentRefs: { "ref___fid": [{data, f, p}] } stored in session */
  function procSentKey(ref, fid) { return ref + '___' + fid; }

  function procSentQty(ref, fid) {
    if (!_procSentRefs) return { f:0, p:0 };
    var key  = procSentKey(ref, fid);
    var lots = _procSentRefs[key] || [];
    var f = 0, p = 0;
    lots.forEach(function(l){ f += l.f||0; p += l.p||0; });
    return { f:f, p:p };
  }

  /* Build rows from all active faturas that have a4 or a5 > 0.
     Quando um fornecedor tem a nova nomenclatura activa, a referencia
     usada aqui (e portanto a chave de tracking de "enviado") passa a
     ser a referencia_interna — a partir do momento em que se confirma
     um envio, essa e a identidade perpetua do artigo, nunca a original. */
  function procBuildGuiaRowsSync(mapasPorForn, categorias) {
    var rows = [];
    activeFaturas.forEach(function(fid) {
      /* Skip if this fatura is excluded from guia */
      var cb = document.getElementById('proc-guia-include-' + fid);
      if (cb && !cb.checked) return;
      var fatRows = procCollectRows(fid);
      var pEl = document.getElementById('proc-proveedor-' + fid);
      var forn = pEl ? (pEl.value || 'Fatura ' + fid) : 'Fatura ' + fid;
      var fornNorm = procNormalize(forn);
      /* O mapa (dicionario) e do fornecedor, mas usa-lo ou nao e decisao
         desta factura especifica — nunca herdada de outra factura. */
      var usaFatura = procNomenclaturaAtivaParaFatura(fid);
      var mapa = (usaFatura && mapasPorForn) ? mapasPorForn[fornNorm] : null;
      fatRows.forEach(function(r) {
        if (!r.ref) return;
        if ((r.a4 || 0) === 0 && (r.a5 || 0) === 0) return;
        var refFinal = r.ref;
        if (mapa) {
          var refNorm   = procNormalizarRefOriginal(r.ref);
          var categoria = procResolverCategoria(r.desc, categorias || []);
          var nova      = mapa[refNorm + '|' + categoria];
          if (nova) refFinal = nova;
        }
        var sent  = procSentQty(refFinal, fid);
        var pendF = Math.max(0, (r.a4||0) - sent.f);
        var pendP = Math.max(0, (r.a5||0) - sent.p);
        rows.push({
          ref:    refFinal,
          forn:   forn,
          fid:    fid,
          totalF: r.a4 || 0,
          totalP: r.a5 || 0,
          pendF:  pendF,
          pendP:  pendP,
          sentF:  sent.f,
          sentP:  sent.p,
          done:   pendF === 0 && pendP === 0
        });
      });
    });
    return rows;
  }

  /* Resolve, para cada fornecedor distinto entre as faturas activas, se tem
     nomenclatura activa e o respectivo mapa (referencia_original|categoria
     -> referencia_interna) antes de montar as linhas da guia. */
  function procBuildGuiaRowsAsync() {
    var faturasInfo = activeFaturas.map(function(fid) {
      var cb = document.getElementById('proc-guia-include-' + fid);
      if (cb && !cb.checked) return null;
      var pEl = document.getElementById('proc-proveedor-' + fid);
      var forn = pEl ? (pEl.value || 'Fatura ' + fid) : 'Fatura ' + fid;
      return { fid: fid, forn: forn, fornNorm: procNormalize(forn) };
    }).filter(Boolean);

    var distintos = {};
    faturasInfo.forEach(function(fi) { if (fi.fornNorm) distintos[fi.fornNorm] = true; });
    var listaFornNorm = Object.keys(distintos);

    if (!listaFornNorm.length) return Promise.resolve(procBuildGuiaRowsSync({}, []));

    var ano0 = new Date().getFullYear() % 100;

    return Promise.all(listaFornNorm.map(function(fn) {
      return procLoadFornecedorInfo(fn).then(function(info) {
        if (!info || !info.codigo) {
          return { fornNorm: fn, mapa: null };
        }
        return procSbFetch(
          'proc_referencias?proveedor=eq.' + encodeURIComponent(fn) + '&ano=eq.' + ano0 + '&select=referencia_interna,referencia_original,categoria',
          { method: 'GET' }
        )
          .then(function(r) { return r.ok ? r.json() : []; })
          .then(function(rowsRef) {
            var mapa = {};
            (rowsRef || []).forEach(function(row) {
              mapa[row.referencia_original + '|' + row.categoria] = row.referencia_interna;
            });
            return { fornNorm: fn, mapa: mapa };
          });
      }).catch(function() { return { fornNorm: fn, mapa: null }; });
    })).then(function(resultados) {
      var mapasPorForn = {};
      resultados.forEach(function(res) { mapasPorForn[res.fornNorm] = res.mapa; });
      return procLoadCategoriasRemote().then(function(categorias) {
        return procBuildGuiaRowsSync(mapasPorForn, categorias);
      });
    });
  }

  /* Constrói linhas de historial para refs externas (TAM ou sessões proc anteriores)
     que foram confirmadas nesta sessão. Guardadas em _procSentRefs com chave
     ref___EXT___sessionKey. */
  function procBuildGuiaSentExternal() {
    var results = [];
    if (!_procSentRefs) return results;
    var colorMap = {};
    var colorIdx = 0;
    var EXT_COLORS = ['#F59E0B','#8B5CF6','#3B82F6','#10B981','#6B7280'];
    Object.keys(_procSentRefs).forEach(function(key) {
      if (key.indexOf('___EXT___') === -1) return;
      var parts      = key.split('___EXT___');
      var ref        = parts[0];
      var sessionKey = parts[1];
      if (!colorMap[sessionKey]) colorMap[sessionKey] = EXT_COLORS[colorIdx++ % EXT_COLORS.length];
      var lots = _procSentRefs[key] || [];
      var f = 0, p = 0;
      lots.forEach(function(l){ f += l.f||0; p += l.p||0; });
      if (f === 0 && p === 0) return;
      results.push({
        ref:        ref,
        sessionKey: sessionKey,
        sessionName: sessionKey,
        totalF:     f,
        totalP:     p,
        pendF:      0,
        pendP:      0,
        done:       true,
        _dotColor:  colorMap[sessionKey],
        _fromOtherSession: true
      });
    });
    return results;
  }

  function procConfirmGuiaEnvio(pendRows) {
    var today = new Date().toISOString().slice(0,10);
    pendRows.forEach(function(row) {
      if (row.done) return;
      var key = procSentKey(row.ref, row.fid);
      if (!_procSentRefs[key]) _procSentRefs[key] = [];
      _procSentRefs[key].push({ data: today, f: row.pendF, p: row.pendP });
    });
    procSaveSession(false);
  }

  /* ══════════════════════════════════════════════════════════
     PENDENTES DE OUTRAS SESSÕES — Processamento + TAM
     Consulta Supabase para funcionar entre dispositivos.
  ══════════════════════════════════════════════════════════ */

  var PROC_SESSION_COLORS = ['#F59E0B','#8B5CF6','#3B82F6','#10B981','#6B7280'];
  function procSessionColor(idx) {
    return PROC_SESSION_COLORS[Math.min(idx, PROC_SESSION_COLORS.length - 1)];
  }

  /* ── Extrai pendentes das sessões de Processamento (proc_sessoes) ── */
  async function procGetPendingFromProcSessions() {
    var results = [];
    try {
      var res = await procSbFetch('proc_sessoes?select=session_key,dados&order=updated_at.desc', { method: 'GET' });
      if (!res.ok) return results;
      var rows = await res.json();

      /* FIX 1: extrair a data da sessão activa para só incluir sessões anteriores.
         O session_key tem o formato proc_fatura_YYYY-MM-DD[_N], por isso basta
         comparar a parte da data lexicograficamente. */
      var activeKey    = _activeSessionKey || '';
      /* Extrai "YYYY-MM-DD" do active key, ou '' se não for possível */
      var activeDateStr = (function() {
        var stripped = activeKey.replace('proc_fatura_', '');
        var m = stripped.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
      })();

      rows.forEach(function(row) {
        /* Ignorar a sessão activa */
        if (row.session_key === activeKey) return;

        /* FIX 1: ignorar sessões iguais ou posteriores à activa.
           Compara apenas a parte da data (YYYY-MM-DD) — lexicográfico é correcto
           porque o formato é ISO. Se não conseguirmos extrair a data, ignorar
           também por segurança. */
        if (activeDateStr) {
          var rowDateStr = (function() {
            var s = row.session_key.replace('proc_fatura_', '');
            var m2 = s.match(/^(\d{4}-\d{2}-\d{2})/);
            return m2 ? m2[1] : '';
          })();
          if (!rowDateStr || rowDateStr >= activeDateStr) return;
        }

        var data;
        try { data = JSON.parse(row.dados); } catch(e) { return; }
        if (!data.faturas || !data.faturas.length) return;
        var sentRefs = data.sentRefs || {};

        /* Agrupar por ref para evitar entradas duplicadas (mesma ref em
           várias faturas ou várias linhas da mesma sessão) */
        var refMap = {}; /* ref → { a4, a5, sentKeys } */
        data.faturas.forEach(function(fat, fidIdx) {
          /* Respeitar exclusão da guia definida na sessão de origem —
             mesma regra aplicada à sessão activa em procBuildGuiaRows() */
          if (fat.guiaInclude === false) return;
          var fid  = fidIdx + 1; /* 1-based, igual a faturaCount */
          (fat.rows || []).forEach(function(r) {
            if (!r.ref) return;
            var a4 = r.a4 || 0, a5 = r.a5 || 0;
            if (a4 === 0 && a5 === 0) return;
            if (!refMap[r.ref]) refMap[r.ref] = { a4: 0, a5: 0, sentKeys: [] };
            refMap[r.ref].a4 += a4;
            refMap[r.ref].a5 += a5;
            refMap[r.ref].sentKeys.push(r.ref + '___' + fid);
          });
        });

        /* FIX 2: usar o session_key formatado como nome de sessão, não o proveedor.
           labelFromKey converte "proc_fatura_2026-03-24" → "Semana 24/03/2026". */
        var sessionName = labelFromKey(row.session_key);

        Object.keys(refMap).forEach(function(ref) {
          var entry = refMap[ref];
          /* Somar já enviado de todas as chaves associadas a esta ref */
          var sF = 0, sP = 0;
          entry.sentKeys.forEach(function(sk) {
            (sentRefs[sk] || []).forEach(function(l){ sF += l.f||0; sP += l.p||0; });
          });
          var pendF = Math.max(0, entry.a4 - sF);
          var pendP = Math.max(0, entry.a5 - sP);
          /* FIX 3: só incluir se há realmente algo por enviar */
          if (pendF === 0 && pendP === 0) return;
          /* Usar a primeira chave como referência para gravação */
          var primaryKey = entry.sentKeys[0];
          results.push({
            ref:               ref,
            forn:              sessionName,
            sourceModule:      'proc',
            sessionKey:        row.session_key,
            sessionName:       sessionName,
            pendF:             pendF,
            pendP:             pendP,
            totalF:            entry.a4,
            totalP:            entry.a5,
            done:              false,
            _fromOtherSession: true,
            _procKey:          row.session_key,
            _procSentKey:      primaryKey
          });
        });
      });
    } catch(e) { console.warn('procGetPendingFromProcSessions error', e); }
    return results;
  }

  /* ── Extrai pendentes das sessões de TAM (tam_sessions) ── */
  async function procGetPendingFromTamSessions() {
    var results = [];
    try {
      var res = await procSbFetch('tam_sessions?select=session_name,data&order=saved_at.desc', { method: 'GET' });
      if (!res.ok) return results;
      var rows = await res.json();
      rows.forEach(function(row) {
        var data;
        try { data = JSON.parse(row.data); } catch(e) { return; }
        if (!data.boxes) return;
        var sentRefs = data.sentRefs || {};

        /* Recolher todas as refs únicas das caixas — fonte única de verdade.
           A distribuição está nas caixas, não nos invoices; iterar invoices
           causava entradas duplicadas (uma por invoice × ref). */
        var refMap = {}; /* ref → { distF, distP } */
        data.boxes.forEach(function(box) {
          if (!box.refs) return;
          Object.keys(box.refs).forEach(function(ref) {
            if (!refMap[ref]) refMap[ref] = { distF: 0, distP: 0 };
            refMap[ref].distF += box.refs[ref].f || 0;
            refMap[ref].distP += box.refs[ref].p || 0;
          });
        });

        Object.keys(refMap).forEach(function(ref) {
          var distF = refMap[ref].distF;
          var distP = refMap[ref].distP;
          if (distF === 0 && distP === 0) return;

          /* sentRefs em TAM: a chave histórica era ref___invIdx (por invoice).
             Para compatibilidade, somar todos os lots cujo key começa com ref___  */
          var sF = 0, sP = 0;
          Object.keys(sentRefs).forEach(function(k) {
            if (k === ref || k.indexOf(ref + '___') === 0) {
              (sentRefs[k] || []).forEach(function(l){ sF += l.f||0; sP += l.p||0; });
            }
          });

          var pendF = Math.max(0, distF - sF);
          var pendP = Math.max(0, distP - sP);
          if (pendF === 0 && pendP === 0) return;

          /* sentKey estável para futuras gravações: ref___TAMsessionName */
          var sentKey = ref + '___' + row.session_name;
          results.push({
            ref:               ref,
            forn:              row.session_name,
            sourceModule:      'tam',
            sessionKey:        row.session_name,
            sessionName:       'TAM · ' + row.session_name,
            pendF:             pendF,
            pendP:             pendP,
            totalF:            distF,
            totalP:            distP,
            done:              false,
            _fromOtherSession: true,
            _tamSessionName:   row.session_name,
            _tamSentKey:       sentKey
          });
        });
      });
    } catch(e) { console.warn('procGetPendingFromTamSessions error', e); }
    return results;
  }

  /* ── Confirmar envio de pendentes de outras sessões ── */
  async function procConfirmOtherSessionsEnvio(otherRows) {
    if (!otherRows.length) return;
    var today = new Date().toISOString().slice(0, 10);

    /* Agrupar por sessão proc */
    var byProcKey = {};
    otherRows.filter(function(r){ return r.sourceModule === 'proc'; }).forEach(function(r) {
      if (!byProcKey[r._procKey]) byProcKey[r._procKey] = [];
      byProcKey[r._procKey].push(r);
    });

    /* Agrupar por sessão TAM */
    var byTamKey = {};
    otherRows.filter(function(r){ return r.sourceModule === 'tam'; }).forEach(function(r) {
      if (!byTamKey[r._tamSessionName]) byTamKey[r._tamSessionName] = [];
      byTamKey[r._tamSessionName].push(r);
    });

    /* Actualizar sessões proc */
    for (var pKey in byProcKey) {
      try {
        var pRes = await procSbFetch('proc_sessoes?session_key=eq.' + encodeURIComponent(pKey) + '&select=dados', { method: 'GET' });
        var pRows = await pRes.json();
        var pRaw  = pRows && pRows.length ? pRows[0].dados : null;
        if (!pRaw) continue;
        var pData = JSON.parse(pRaw);
        if (!pData.sentRefs) pData.sentRefs = {};
        byProcKey[pKey].forEach(function(row) {
          if (!pData.sentRefs[row._procSentKey]) pData.sentRefs[row._procSentKey] = [];
          pData.sentRefs[row._procSentKey].push({ data: today, f: row.pendF, p: row.pendP });
        });
        pData.savedAt = new Date().toISOString();
        await procSbFetch('proc_sessoes', {
          method: 'POST',
          headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ session_key: pKey, dados: JSON.stringify(pData), updated_at: pData.savedAt })
        });
      } catch(e) { console.warn('procConfirmOtherSessionsEnvio proc error', e); }
    }

    /* Actualizar sessões TAM */
    for (var tKey in byTamKey) {
      try {
        var tRes = await procSbFetch('tam_sessions?session_name=eq.' + encodeURIComponent(tKey) + '&select=data', { method: 'GET' });
        var tRows = await tRes.json();
        var tRaw  = tRows && tRows.length ? tRows[0].data : null;
        if (!tRaw) continue;
        var tData = JSON.parse(tRaw);
        if (!tData.sentRefs) tData.sentRefs = {};
        byTamKey[tKey].forEach(function(row) {
          if (!tData.sentRefs[row._tamSentKey]) tData.sentRefs[row._tamSentKey] = [];
          tData.sentRefs[row._tamSentKey].push({ data: today, f: row.pendF, p: row.pendP });
        });
        tData.savedAt = Date.now();
        await procSbFetch('tam_sessions', {
          method: 'POST',
          headers: Object.assign(procSbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ session_name: tKey, saved_at: new Date().toISOString(), data: JSON.stringify(tData) })
        });
      } catch(e) { console.warn('procConfirmOtherSessionsEnvio tam error', e); }
    }
  }

  function procShowGuiaModal() {
    function montarGuiaModal(allRows) {
      var pendRows = allRows.filter(function(r){ return !r.done; });
      var sentRows = allRows.filter(function(r){ return  r.done; });
      /* Incluir refs externas (TAM / sessões proc) confirmadas nesta sessão */
      var extSentRows = procBuildGuiaSentExternal();
      sentRows = sentRows.concat(extSentRows);

      if (!allRows.length) {
        procFloatModal({
          title: 'Sem distribuição',
          body:  'Nenhuma fatura tem pe\u00e7as distribu\u00eddas por armazém. Preenche as colunas FNC e PXO primeiro.',
          buttons: [{ label: 'OK', cb: null }]
        });
        return;
      }

      var oldModal = document.getElementById('proc-guia-modal');
      if (oldModal) oldModal.parentNode.removeChild(oldModal);

      var nFaturas = activeFaturas.length;
      var title    = 'Guia Consolidada \u00b7 ' + nFaturas + ' fatura' + (nFaturas !== 1 ? 's' : '');
      var fPend    = pendRows.reduce(function(s,r){ return s+r.pendF; }, 0);
      var pPend    = pendRows.reduce(function(s,r){ return s+r.pendP; }, 0);
      var fSent    = sentRows.reduce(function(s,r){ return s+r.totalF; }, 0);
      var pSent    = sentRows.reduce(function(s,r){ return s+r.totalP; }, 0);

      var COL_G = ['Ref. FNC', 'Qtd. F', 'Ref. PXO', 'Qtd. PS'];

      function buildTableRows(rowList) {
        if (!rowList.length) return '<tr><td colspan="7" class="proc-guia-empty">Sem refer\u00eancias pendentes</td></tr>';
        var fRows = rowList.filter(function(r){ return (r.done ? r.totalF : r.pendF) > 0; });
        var pRows = rowList.filter(function(r){ return (r.done ? r.totalP : r.pendP) > 0; });
        var maxLen = Math.max(fRows.length, pRows.length);
        var html = '';
        for (var i = 0; i < maxLen; i++) {
          var fRow = fRows[i] || null;
          var pRow = pRows[i] || null;
          var refRow = fRow || pRow;
          var cls = refRow.done ? ' proc-guia-row-sent' : (i%2===0 ? ' proc-guia-row-even' : ' proc-guia-row-odd');
          var trBg = refRow.done ? 'background:#f5f5f5;' : (i%2===0 ? 'background:#fff;' : 'background:#F7F4F3;');
          /* Indicator dots live in their own column — refs are untouched */
          var fDot = (fRow && fRow._dotColor)
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + fRow._dotColor + ';flex-shrink:0;" aria-hidden="true"></span>'
            : '';
          var pDot = (pRow && pRow._dotColor)
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + pRow._dotColor + ';flex-shrink:0;" aria-hidden="true"></span>'
            : '';
          var fRef = fRow ? fRow.ref : '';
          var fQty = fRow ? (fRow.done ? fRow.totalF : fRow.pendF) : '';
          var pRef = pRow ? pRow.ref : '';
          var pQty = pRow ? (pRow.done ? pRow.totalP : pRow.pendP) : '';
          html += '<tr class="proc-guia-tr' + cls + '" style="' + trBg + '">'
            + '<td class="proc-guia-td proc-guia-dot-col" style="' + trBg + '">' + fDot + '</td>'
            + '<td class="proc-guia-td proc-guia-ref-f" style="' + trBg + '" data-gcol="0">' + fRef + '</td>'
            + '<td class="proc-guia-td proc-guia-qty-f" style="' + trBg + '" data-gcol="1">' + (fQty !== '' ? fQty : '') + '</td>'
            + '<td class="proc-guia-td proc-guia-sep-td" style="' + trBg + '"></td>'
            + '<td class="proc-guia-td proc-guia-dot-col" style="' + trBg + '">' + pDot + '</td>'
            + '<td class="proc-guia-td proc-guia-ref-p" style="' + trBg + '" data-gcol="2">' + pRef + '</td>'
            + '<td class="proc-guia-td proc-guia-qty-p" style="' + trBg + '" data-gcol="3">' + (pQty !== '' ? pQty : '') + '</td>'
            + '</tr>';
        }
        return html;
      }

      function buildLegendHtml(otherRows) {
        var colorMap = {};
        otherRows.forEach(function(r){ if (!colorMap[r.sessionKey]) colorMap[r.sessionKey] = r._dotColor; });
        var keys = Object.keys(colorMap);
        if (!keys.length) return '';
        return '<div id="proc-guia-session-legend">'
          + keys.map(function(k){
              var row = otherRows.find(function(r){ return r.sessionKey === k; });
              var name = row ? row.sessionName : k;
              return '<span class="proc-guia-legend-item"><span style="color:' + colorMap[k] + ';user-select:none;">\u25cf</span> ' + name + '</span>';
            }).join('')
          + '</div>';
      }

      var copyBar = '<div class="proc-guia-copy-bar">'
        + '<button class="proc-guia-addr-btn" data-addr="CAL\u00c7ADA DA QUINTINHA 17 B">Lisboa</button>'
        + '<button class="proc-guia-addr-btn" data-addr="29-FV-30">Matr\u00edcula</button>'
        + '<button class="proc-guia-addr-btn" data-addr="RUA DE S\u00c3O FRANCISCO N\u00ba 20">FNC</button>'
        + '<button class="proc-guia-addr-btn" data-addr="EDIFICIO Ilha Dourada Loja-1">PXO</button>'
        + '</div>';

      /* FIX: mostrar enviadas apenas quando nao ha pendentes */
      var sentSection = (sentRows.length && pendRows.length === 0)
        ? '<tr class="proc-guia-sent-hdr"><td colspan="7">\u2713 J\u00e1 enviado ('
          + sentRows.length + ' refs \u00b7 ' + fSent + ' F \u00b7 ' + pSent + ' PS)</td></tr>'
          + buildTableRows(sentRows)
        : '';

      /* Banner — fase 1: a verificar */
      var bannerHtml = '<div id="proc-guia-other-banner" class="proc-guia-other-banner proc-guia-other-loading">'
        + '<span id="proc-guia-other-status">\u21bb a verificar sessões anteriores\u2026</span>'
        + '</div>';

      var modal = document.createElement('div');
      modal.id  = 'proc-guia-modal';
      modal.innerHTML =
        '<div id="proc-guia-backdrop"></div>'
        + '<div id="proc-guia-panel">'
        +   '<div id="proc-guia-header">'
        +     '<div id="proc-guia-title">'
        +       '<span id="proc-guia-title-main">' + title + '</span>'
        +       '<span id="proc-guia-title-sub">Guia de transporte \u00b7 Processamento de Faturas</span>'
        +     '</div>'
        +     '<div id="proc-guia-header-right">'
        +       bannerHtml
        +       '<div id="proc-guia-header-btns">'
        +         '<button id="proc-guia-confirm-btn" class="proc-guia-action-btn proc-guia-confirm"'
        +           (pendRows.length===0?' disabled':'') + '>\u2713 Confirmar envio</button>'
        +         '<button id="proc-guia-export-btn" class="proc-guia-action-btn">\u2b07 Exportar CSV</button>'
        +         '<button id="proc-guia-close-btn" class="proc-guia-close-btn">\u00d7</button>'
        +       '</div>'
        +     '</div>'
        +   '</div>'
        +   copyBar
        +   '<div id="proc-guia-scroll">'
        +     '<table id="proc-guia-table">'
        +       '<thead><tr>'
        +         '<th class="proc-guia-th proc-guia-dot-th"></th>'
        +         '<th class="proc-guia-th proc-guia-th-f" colspan="2"><div class="proc-guia-th-flex"><span>\ud83d\udd35 FNC (A4)</span><span id="proc-guia-fnc-count" class="proc-guia-count-label">' + fPend + ' un. pendentes</span></div></th>'
        +         '<th class="proc-guia-th proc-guia-th-sep"></th>'
        +         '<th class="proc-guia-th proc-guia-dot-th"></th>'
        +         '<th class="proc-guia-th proc-guia-th-p" colspan="2"><div class="proc-guia-th-flex"><span>\ud83d\udd34 PXO (A5)</span><span id="proc-guia-pxo-count" class="proc-guia-count-label">' + pPend + ' un. pendentes</span></div></th>'
        +       '</tr><tr>'
        +         '<th class="proc-guia-dot-th"></th>'
        +         '<th class="proc-guia-th2"><button class="proc-guia-copy-btn" data-gcol="0">Refer\u00eancia</button></th>'
        +         '<th class="proc-guia-th2 proc-th2-center"><button class="proc-guia-copy-btn" data-gcol="1">Qtd.</button></th>'
        +         '<th class="proc-guia-th-sep"></th>'
        +         '<th class="proc-guia-dot-th"></th>'
        +         '<th class="proc-guia-th2"><button class="proc-guia-copy-btn" data-gcol="2">Refer\u00eancia</button></th>'
        +         '<th class="proc-guia-th2 proc-th2-center"><button class="proc-guia-copy-btn" data-gcol="3">Qtd.</button></th>'
        +       '</tr></thead>'
        +       '<tbody id="proc-guia-tbody">' + buildTableRows(pendRows) + sentSection + '</tbody>'
        +     '</table>'
        +     '<div id="proc-guia-legend-wrap"></div>'
        +   '</div>'
        +   '<div id="proc-guia-footer">'
        +     '<span id="proc-guia-footer-text">'
        +       pendRows.length + ' refs pendentes \u00b7 ' + fPend + ' un. FNC \u00b7 ' + pPend + ' un. PXO'
        +       (sentRows.length ? ' \u00b7 ' + sentRows.length + ' j\u00e1 enviadas' : '')
        +     '</span>'
        +     '<span class="proc-guia-copy-msg" id="proc-guia-copy-msg"></span>'
        +   '</div>'
        + '</div>';

      document.body.appendChild(modal);
      requestAnimationFrame(function(){ modal.classList.add('proc-guia-visible'); });

      /* ── Fase 2: fetch remoto — proc + TAM ── */
      /* NÃO adiciona automaticamente — apenas avisa e espera confirmação do utilizador */
      var _pendingOtherRows = [];   /* ficam guardadas até o user clicar em Adicionar */

      /* _addedOtherRows acumula todas as rows de sessões que o user escolheu adicionar */
      var _addedOtherRows = [];

      function applyOtherRows() {
        /* _pendingOtherRows contém as rows da sessão que acabou de ser clicada */
        var sessionRows = _pendingOtherRows.slice();
        _pendingOtherRows = [];
        if (!sessionRows.length) return;

        /* Acumular para legenda */
        _addedOtherRows = _addedOtherRows.concat(sessionRows);

        var newPendRows = pendRows.concat(sessionRows);
        var newFPend = newPendRows.reduce(function(s,r){ return s+r.pendF; },0);
        var newPPend = newPendRows.reduce(function(s,r){ return s+r.pendP; },0);

        var tbody = modal.querySelector('#proc-guia-tbody');
        if (tbody) tbody.innerHTML = buildTableRows(newPendRows) + sentSection;

        var fncCount = modal.querySelector('#proc-guia-fnc-count');
        var pxoCount = modal.querySelector('#proc-guia-pxo-count');
        if (fncCount) fncCount.textContent = newFPend + ' un. pendentes';
        if (pxoCount) pxoCount.textContent = newPPend + ' un. pendentes';

        var legendWrap = modal.querySelector('#proc-guia-legend-wrap');
        if (legendWrap) legendWrap.innerHTML = buildLegendHtml(_addedOtherRows);

        var footerText = modal.querySelector('#proc-guia-footer-text');
        if (footerText) {
          footerText.textContent = newPendRows.length + ' refs pendentes · ' + newFPend + ' un. FNC · ' + newPPend + ' un. PXO'
            + (sentRows.length ? ' · ' + sentRows.length + ' já enviadas' : '');
        }

        var confirmBtn = modal.querySelector('#proc-guia-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = (newPendRows.length === 0);

        pendRows = newPendRows;
        fPend = newFPend; pPend = newPPend;
      }

      Promise.all([
        procGetPendingFromProcSessions(),
        procGetPendingFromTamSessions()
      ]).then(function(results) {
        var allOther = results[0].concat(results[1]);
        var banner   = modal.querySelector('#proc-guia-other-banner');
        if (!banner || !modal.parentNode) return;

        banner.classList.remove('proc-guia-other-loading');

        if (!allOther.length) {
          banner.classList.add('proc-guia-other-none');
          banner.querySelector('#proc-guia-other-status').textContent = '\u2713 sem pendentes noutras sess\u00f5es';
          setTimeout(function(){ banner.style.display = 'none'; }, 2000);
          return;
        }

        /* Atribuir cores por sess\u00e3o */
        var colorMap = {}, colorIdx = 0;
        allOther.forEach(function(row) {
          if (!colorMap[row.sessionKey]) colorMap[row.sessionKey] = procSessionColor(colorIdx++);
          row._dotColor = colorMap[row.sessionKey];
        });

        /* Agrupar por sess\u00e3o — uma linha de banner por cada sess\u00e3o */
        var sessionGroups = {};
        var sessionOrder  = [];
        allOther.forEach(function(row) {
          if (!sessionGroups[row.sessionKey]) {
            sessionGroups[row.sessionKey] = { rows: [], name: row.sessionName, color: row._dotColor, key: row.sessionKey };
            sessionOrder.push(row.sessionKey);
          }
          sessionGroups[row.sessionKey].rows.push(row);
        });

        banner.classList.add('proc-guia-other-found');
        banner.style.flexDirection = 'column';
        banner.style.alignItems    = 'stretch';
        banner.style.gap           = '6px';

        /* Renderizar uma linha por sess\u00e3o */
        banner.innerHTML = '<div class="proc-guia-banner-label">Sessões anteriores com pendentes</div>'
          + sessionOrder.map(function(sKey) {
              var grp  = sessionGroups[sKey];
              var totF = grp.rows.reduce(function(s,r){ return s+r.pendF; },0);
              var totP = grp.rows.reduce(function(s,r){ return s+r.pendP; },0);
              return '<div class="proc-guia-sess-row" data-skey="' + sKey + '">'
                + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + grp.color + ';flex-shrink:0;"></span>'
                + '<span class="proc-guia-sess-name" title="' + grp.name + '">' + grp.name + '</span>'
                + '<span class="proc-guia-sess-count">' + grp.rows.length + ' ref' + (grp.rows.length!==1?'s':'') + ' \u00b7 ' + totF + ' FNC \u00b7 ' + totP + ' PXO</span>'
                + '<button class="proc-guia-sess-add-btn" data-skey="' + sKey + '">+ Adicionar</button>'
                + '<button class="proc-guia-sess-ign-btn" data-skey="' + sKey + '">\u00d7</button>'
                + '</div>';
            }).join('');

        /* Bind por linha */
        banner.querySelectorAll('.proc-guia-sess-add-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var sKey = btn.getAttribute('data-skey');
            var grp  = sessionGroups[sKey];
            if (!grp) return;

            /* Flash sutil no bot\u00e3o — escurece borda brevemente, volta ao normal */
            btn.style.borderColor = '#555';
            btn.style.background  = '#f0f0f0';
            setTimeout(function(){ btn.style.borderColor = ''; btn.style.background = ''; }, 300);

            /* Aplicar apenas as rows desta sess\u00e3o */
            _pendingOtherRows = grp.rows;
            applyOtherRows();

            /* Remover a linha desta sess\u00e3o do banner */
            delete sessionGroups[sKey];
            var rowEl = banner.querySelector('.proc-guia-sess-row[data-skey="' + sKey + '"]');
            if (rowEl) rowEl.remove();

            /* Se n\u00e3o restam sess\u00f5es, fechar banner */
            if (!Object.keys(sessionGroups).length) {
              banner.style.display = 'none';
            }
          });
        });

        banner.querySelectorAll('.proc-guia-sess-ign-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var sKey = btn.getAttribute('data-skey');
            delete sessionGroups[sKey];
            var rowEl = banner.querySelector('.proc-guia-sess-row[data-skey="' + sKey + '"]');
            if (rowEl) rowEl.remove();
            if (!Object.keys(sessionGroups).length) banner.style.display = 'none';
          });
        });

      }).catch(function() {
        var banner = modal.querySelector('#proc-guia-other-banner');
        if (banner) banner.style.display = 'none';
      });

      function closeModal() {
        modal.classList.remove('proc-guia-visible');
        setTimeout(function(){ if (modal.parentNode) modal.parentNode.removeChild(modal); }, 260);
      }

      /* Address button copy */
      modal.querySelectorAll('.proc-guia-addr-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var text = btn.getAttribute('data-addr');
          if (!text) return;
          function flash(){ btn.classList.add('proc-guia-addr-copied'); setTimeout(function(){ btn.classList.remove('proc-guia-addr-copied'); }, 1400); }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(flash).catch(flash);
          } else {
            try { var ta=document.createElement('textarea'); ta.value=text; ta.className='proc-clipboard-hack'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch(e){}
            flash();
          }
        });
      });

      /* Copy column */
      var copyMsg = modal.querySelector('#proc-guia-copy-msg');
      var copyTimer = null;
      modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var ci   = parseInt(btn.getAttribute('data-gcol'));
          var vals = Array.from(modal.querySelectorAll('td[data-gcol="'+ci+'"]'))
                         .map(function(td){ return td.textContent.trim(); })
                         .filter(function(v){ return v && v !== '\u2014'; });
          if (!vals.length) return;
          modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(b){ b.classList.remove('proc-guia-copy-active'); });
          btn.classList.add('proc-guia-copy-active');
          var text = vals.join('\n');
          function showMsg(ok) {
            if (!copyMsg) return;
            copyMsg.textContent = ok ? '\u2713 ' + COL_G[ci] + ' copiado!' : '\u26a0 copie manualmente';
            copyMsg.style.color = ok ? '#4A7C6F' : '#b05000';
            clearTimeout(copyTimer);
            copyTimer = setTimeout(function(){
              copyMsg.textContent = '';
              modal.querySelectorAll('.proc-guia-copy-btn').forEach(function(b){ b.classList.remove('proc-guia-copy-active'); });
            }, 2200);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function(){ showMsg(true); }).catch(function(){ showMsg(false); });
          } else {
            try {
              var ta = document.createElement('textarea');
              ta.value = text; ta.className = 'proc-clipboard-hack';
              document.body.appendChild(ta); ta.select(); document.execCommand('copy');
              document.body.removeChild(ta); showMsg(true);
            } catch(e){ showMsg(false); }
          }
        });
      });

      /* Confirmar envio */
      modal.querySelector('#proc-guia-confirm-btn').addEventListener('click', function(){
        if (!pendRows.length) return;
        var confirmDiv = document.createElement('div');
        confirmDiv.id = 'proc-guia-confirm-overlay';
        confirmDiv.innerHTML =
          '<div id="proc-guia-confirm-box">'
          + '<div class="proc-gc-title">\u26a0 Confirmar envio</div>'
          + '<div class="proc-gc-body">'
          + 'Vais marcar <strong>' + pendRows.length + ' refer\u00eancias</strong> como enviadas hoje ('
          + new Date().toLocaleDateString('pt-PT') + ').<br>'
          + '<strong>' + fPend + '</strong> un. FNC \u00b7 <strong>' + pPend + '</strong> un. PXO<br><br>'
          + 'Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.'
          + '</div>'
          + '<div class="proc-gc-btns">'
          + '<button class="proc-gc-btn proc-gc-ok">\u2713 Confirmar</button>'
          + '<button class="proc-gc-btn proc-gc-cancel">Cancelar</button>'
          + '</div>'
          + '</div>';
        modal.querySelector('#proc-guia-panel').appendChild(confirmDiv);
        confirmDiv.querySelector('.proc-gc-cancel').addEventListener('click', function(){
          confirmDiv.parentNode.removeChild(confirmDiv);
        });
        confirmDiv.querySelector('.proc-gc-ok').addEventListener('click', function(){
          var ownRows   = pendRows.filter(function(r){ return !r._fromOtherSession; });
          var otherRows = pendRows.filter(function(r){ return  r._fromOtherSession; });
          procConfirmGuiaEnvio(ownRows);
          /* Guardar refs externas confirmadas em _procSentRefs para historial */
          var today = new Date().toISOString().slice(0,10);
          otherRows.forEach(function(row) {
            var extKey = row.ref + '___EXT___' + (row.sessionName || row.sessionKey || 'ext');
            if (!_procSentRefs[extKey]) _procSentRefs[extKey] = [];
            _procSentRefs[extKey].push({ data: today, f: row.pendF, p: row.pendP });
          });
          confirmDiv.parentNode.removeChild(confirmDiv);
          closeModal();
          /* Aguardar que o Supabase das outras sessões seja actualizado antes
             de reabrir a guia — evita que as refs reapareçam como pendentes */
          procConfirmOtherSessionsEnvio(otherRows).then(function() {
            setTimeout(function(){ procShowGuiaModal(); }, 150);
          }).catch(function() {
            setTimeout(function(){ procShowGuiaModal(); }, 150);
          });
        });
      });

      /* Export CSV */
      modal.querySelector('#proc-guia-export-btn').addEventListener('click', function(){
        var fRows = pendRows.filter(function(r){ return r.pendF>0; });
        var pRows = pendRows.filter(function(r){ return r.pendP>0; });
        var lines = ['\uFEFF' + 'Referencia;Qtd FNC;Referencia;Qtd PXO'];
        for (var li = 0; li < Math.max(fRows.length, pRows.length); li++) {
          var fc = fRows[li] ? fRows[li].ref + ';' + fRows[li].pendF : ';';
          var pc = pRows[li] ? pRows[li].ref + ';' + pRows[li].pendP : ';';
          lines.push(fc + ';' + pc);
        }
        var blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href   = url;
        a.download = 'Guia_' + new Date().toISOString().slice(0,10) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      });

      modal.querySelector('#proc-guia-backdrop').addEventListener('click', closeModal);
      modal.querySelector('#proc-guia-close-btn').addEventListener('click', closeModal);
      document.addEventListener('keydown', function escG(e){
        if (e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', escG); }
      });
    }

    procBuildGuiaRowsAsync().then(montarGuiaModal).catch(function() { montarGuiaModal([]); });
  }

  /* ── 19b. SENT REFS STATE (persisted in session) ── */
  var _procSentRefs = {};   /* loaded/saved with session */

  /* Override procApplySessionData to also restore sentRefs */
  var _origApplySessionData = procApplySessionData;
  procApplySessionData = function(key, raw, callback) {
    try {
      var data = JSON.parse(raw);
      _procSentRefs = data.sentRefs || {};
    } catch(e) { _procSentRefs = {}; }
    _origApplySessionData(key, raw, callback);
  };

  /* sentRefs já está incluído em procBuildSavePayload — override removido. */

  /* ── CRIAÇÃO DE ARTIGOS MODAL ── */
  function procShowCriacaoModal(fid) {
    /* Remove any existing instance */
    var old = document.getElementById('proc-criacao-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var pEl = document.getElementById('proc-proveedor-' + fid);
    var fornecedor = pEl ? (pEl.value.trim() || 'Fornecedor') : 'Fornecedor';
    var guiaEl = document.getElementById('proc-guia-erp-' + fid);
    var guiaAtual = guiaEl ? guiaEl.value.trim() : '';

    /* Collect rows with any data */
    var rc = rowCounts[fid] || 0;
    var items = [];
    for (var i = 1; i <= rc; i++) {
      var tr = document.getElementById('proc-row-' + fid + '-' + i);
      if (!tr) continue;
      var rIn  = tr.querySelector('.proc-ref-input');
      var dIn  = tr.querySelector('.proc-desc-input');
      var nums = tr.querySelectorAll('input[type="number"]');
      var dCb  = document.getElementById('proc-d-'    + fid + '-' + i);
      var pCb  = document.getElementById('proc-plus-' + fid + '-' + i);
      var ref   = rIn  ? rIn.value.trim()  : '';
      var nome  = dIn  ? dIn.value.trim()  : '';
      var preco = parseFloat(nums[3] ? nums[3].value : 0) || 0;
      if (!ref && !preco) continue;
      var qtdFt = parseFloat(nums[0] ? nums[0].value : 0) || 0;
      var a4    = parseFloat(nums[1] ? nums[1].value : 0) || 0;
      var a5    = parseFloat(nums[2] ? nums[2].value : 0) || 0;
      var dPct  = parseFloat(nums[4] ? nums[4].value : 0) || 0;
      var hasD  = dCb ? dCb.checked : false;
      var plus1 = pCb ? pCb.checked : false;
      var pc    = procCalcPrecoCusto(preco, plus1, hasD, qtdFt, a4, a5) * (1 - dPct / 100);
      /* PVP: manual override or auto-calculated */
      var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + i);
      var pvpVal = null;
      if (pvpEl) {
        if (pvpEl._manualOverride) {
          var disp = pvpEl.querySelector('.proc-pvp-display');
          pvpVal = disp ? parseFloat(disp.textContent) : null;
        } else if (pvpEl._calcValue != null) {
          pvpVal = pvpEl._calcValue;
        }
      }
      /* Margem: usar exatamente o que a tabela original já mostra —
         nunca recalcular aqui, para nunca divergir do valor da linha. */
      var margCellEl = document.getElementById('proc-marg-' + fid + '-' + i);
      var margTxt = margCellEl ? margCellEl.textContent.trim() : '';
      var marg = (margTxt && margTxt !== '\u2014') ? margTxt : null;
      /* Quantidade: vem da coluna "QTD." (total introduzido pelo
         utilizador), nunca da soma da reparticao por armazem (FNC+PXO) —
         sao conceitos diferentes e podem nao coincidir. */
      items.push({ ref: ref, nome: nome, pvp: pvpVal, marg: marg, custo: pc, qtd: qtdFt, refNova: null });
    }

    /* Dedupe por referencia + descricao — varias linhas da fatura podem
       repetir a mesma referencia com a MESMA descricao (ex.: quantidade
       dividida por varias linhas de tamanhos diferentes); nesse caso
       basta 1 linha. Mas a mesma referencia com descricao DIFERENTE e um
       artigo genuinamente distinto (ex.: um conjunto dividido em duas
       pecas com o mesmo codigo do fornecedor) — nunca deve ser fundida
       com a outra, tem de gerar a sua propria nomenclatura. */
    if (items.length) {
      var seenRef = {};
      var deduped = [];
      items.forEach(function(it) {
        var refKey = (it.ref || '').trim().toUpperCase();
        if (!refKey) { deduped.push(it); return; }
        var key = refKey + '||' + (it.nome || '').trim().toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(seenRef, key)) {
          seenRef[key] = deduped.length;
          deduped.push(it);
        } else {
          /* Mesma referencia + mesma descricao espalhada por varias
             linhas (ex.: tamanhos diferentes) — funde-se numa so linha,
             mas a quantidade tem de ser a SOMA de todas, nunca perder-se
             a das linhas descartadas. */
          var existente = deduped[seenRef[key]];
          existente.qtd = (existente.qtd || 0) + (it.qtd || 0);
          if ((it.pvp != null) && (existente.pvp == null)) {
            it.qtd = existente.qtd;
            deduped[seenRef[key]] = it;
          }
        }
      });
      items = deduped;
    }

    /* ── Nova nomenclatura: elegibilidade da sessao + preferencia do fornecedor.
       Sessoes antigas (marcadas usa_referencia_automatica = false) nunca
       chegam a pedir isto — mantem-se 100% o comportamento actual. */
    var elegivelSessao = _sessaoUsaReferenciaAutomatica;

    /* Enquanto "carregando" for verdade e ainda nao houver refNova,
       mostra reticencias em vez da referencia original — nunca deve
       aparecer o numero errado nem um "salto" visual de um para o outro. */
    function refExibida(it, ativo, carregando) {
      if (ativo && !it.refNova && carregando) return '\u2026';
      return (ativo && it.refNova) ? it.refNova : (it.ref || '\u2014');
    }

    /* Cabecalho da tabela — a coluna "Referencia original" so existe
       enquanto o toggle "nova nomenclatura" estiver activo; sem ela, a
       propria coluna "Referencia" ja mostra o codigo original (via
       refExibida), por isso duplicar essa informacao nao faz sentido. */
    function gerarTheadRowHTML(ativo) {
      return (ativo ? '<th>Refer\u00eancia original</th>' : '')
        + '<th>Refer\u00eancia</th>'
        + '<th>Nome</th>'
        + '<th class="right">Qtd.</th>'
        + '<th class="right">PVP</th>'
        + '<th class="right">%</th>'
        + '<th class="right">PC</th>';
    }

    function gerarRowsHTML(ativo, carregando) {
      var html = items.map(function(it, idx) {
        var refMostrar = refExibida(it, ativo, carregando);
        return '<tr data-idx="' + idx + '" data-ref="' + refMostrar + '" data-nome="' + (it.nome||'') + '" data-pvp="' + (it.pvp != null ? it.pvp.toFixed(2) : '') + '" style="--i:' + idx + '">'
          + (ativo ? '<td class="td-ref-original">' + (it.ref || '\u2014') + '</td>' : '')
          + '<td class="td-ref">' + refMostrar + '</td>'
          + '<td class="td-nome">' + (it.nome || '\u2014') + '</td>'
          + '<td class="td-qtd">' + (it.qtd > 0 ? it.qtd : '\u2014') + '</td>'
          + '<td class="td-pvp">' + (it.pvp != null ? it.pvp.toFixed(2) : '\u2014') + '</td>'
          + '<td class="td-marg">' + (it.marg != null ? it.marg : '\u2014') + '</td>'
          + '<td class="td-custo">' + (it.custo > 0 ? it.custo.toFixed(2) : '\u2014') + '</td>'
          + '</tr>';
      }).join('');
      var colspan = ativo ? 7 : 6;
      return html || ('<tr><td colspan="' + colspan + '" class="proc-table-empty-msg">Sem artigos com dados</td></tr>');
    }

    function montarModal(fornecedorInfo, categorias) {
      var podeGerar  = !!(elegivelSessao && fornecedorInfo && fornecedorInfo.codigo);
      /* Decisao 100% desta factura (fid) — nunca herda nem contamina
         outra factura do mesmo fornecedor. Por omissao, activo — excepto
         se a funcionalidade estiver suspensa globalmente (ver
         PROC_REFERENCIA_INTERNA_HABILITADA), caso em que fica sempre
         inactiva independentemente do que esta factura tinha guardado. */
      var ativoAtual = podeGerar && procNomenclaturaAtivaParaFatura(fid);
      /* "gerando" comeca logo verdadeiro se vamos gerar, para que a
         PRIMEIRA pintura do modal ja mostre reticencias em vez da
         referencia original — nunca ha um "salto" visivel. */
      var gerando   = podeGerar && ativoAtual;
      var geracaoId = 0;

      /* Fatura ja ingressada no ERP (tem numero de guia) → o toggle
         fica bloqueado: alternar aqui criaria ou apagaria referencias
         associadas a uma guia ja emitida, o que nunca deve acontecer
         depois de fechado o ciclo com o ERP. Ou, independentemente da
         guia, a funcionalidade pode estar suspensa globalmente — em
         ambos os casos o checkbox fica visivel mas bloqueado. */
      var guiaElAtual   = document.getElementById('proc-guia-erp-' + fid);
      var temGuiaFatura = !!(guiaElAtual && guiaElAtual.value.trim().length > 0);
      var suspensaGlobal = !PROC_REFERENCIA_INTERNA_HABILITADA;
      var toggleBloqueado = temGuiaFatura || suspensaGlobal;
      var toggleTitulo = temGuiaFatura
        ? 'Fatura j\u00e1 tem guia ERP associada \u2014 refer\u00eancia interna bloqueada'
        : (suspensaGlobal ? 'Refer\u00eancias internas temporariamente suspensas' : 'Gerar refer\u00eancia interna para este fornecedor');

      var toggleHTML = podeGerar
        ? ('<label class="proc-criacao-toggle-wrap' + (toggleBloqueado ? ' proc-criacao-toggle-locked' : '') + '"'
          + ' title="' + toggleTitulo + '">'
          + '<input type="checkbox" id="proc-criacao-toggle-' + fid + '"' + (ativoAtual ? ' checked' : '') + (toggleBloqueado ? ' disabled' : '') + '>'
          + '<span>refer\u00eancia interna</span>'
          + (toggleBloqueado ? '<span class="proc-criacao-toggle-lock-icon" style="margin-left:4px;opacity:.55;">\ud83d\udd12</span>' : '')
          + '</label>')
        : '';

      var modal = document.createElement('div');
      modal.id = 'proc-criacao-modal';
      modal.innerHTML =
          '<div id="proc-criacao-backdrop"></div>'
        + '<div id="proc-criacao-panel">'
        +   '<div id="proc-criacao-header">'
        +     '<div id="proc-criacao-title">'
        +       '<span id="proc-criacao-title-main">' + fornecedor + '</span>'
        +       toggleHTML
        +       '<span id="proc-criacao-title-sub">Cria\u00e7\u00e3o de Artigos</span>'
        +     '</div>'
        +     '<button id="proc-criacao-close">\u00d7</button>'
        +   '</div>'
        +   '<div id="proc-criacao-scroll">'
        +     '<table id="proc-criacao-table">'
        +       '<thead><tr>' + gerarTheadRowHTML(ativoAtual) + '</tr></thead>'
        +       '<tbody>' + gerarRowsHTML(ativoAtual, gerando) + '</tbody>'
        +     '</table>'
        +   '</div>'
        +   '<div id="proc-criacao-copy-hint">Clique numa linha para selecionar &mdash; clique numa c\u00e9lula para copiar</div>'
        + '</div>';

      document.body.appendChild(modal);

      /* Actualiza cabecalho + corpo da tabela. O <tbody> nunca e
         substituido como elemento (so o seu innerHTML muda) para nao
         invalidar os listeners de clique/copia ja ligados a ele; o
         cabecalho e reescrito porque a coluna extra da referencia
         original aparece/desaparece consoante o toggle.
         "comFade" aplica uma pequena animacao de entrada em cascata —
         usado apenas na revelacao final, nunca durante o "a carregar". */
      function atualizarTabela(comFade) {
        var theadRow = modal.querySelector('#proc-criacao-table thead tr');
        if (theadRow) theadRow.innerHTML = gerarTheadRowHTML(ativoAtual);
        var tbody = modal.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = gerarRowsHTML(ativoAtual, gerando);
        if (comFade) {
          tbody.classList.remove('proc-reveal');
          void tbody.offsetWidth; /* forca reflow para reiniciar a animacao */
          tbody.classList.add('proc-reveal');
        }
      }

      /* Gera as referencias UMA A UMA, em estrita ordem da tabela — nunca
         em paralelo. A linha 1 so avanca para a linha 2 depois de a linha
         1 ja ter o seu numero confirmado, por isso a ordem dos numeros
         corresponde sempre, sem excepcao, a ordem visual das linhas.
         A tabela SO e repintada no inicio (mostrando reticencias) e no
         fim (mostrando tudo de uma vez, com uma entrada suave) — nunca a
         cada linha resolvida, que era o que dava aquele efeito de
         "pipoca" a aparecerem uma a uma, mesmo quando nao havia nada
         realmente novo para criar. */
      function gerarReferenciasEAtualizar() {
        /* Sem descricao nao ha tentativa de classificacao — nunca se gera
           (nem se guarda) uma referencia so por falta de nome. Fica
           pendente ate o utilizador escrever a descricao; so ai entra
           directamente com a categoria correcta, nunca com XX de mentira. */
        var pendentes = items.filter(function(it) { return it.ref && it.nome && it.nome.trim() && !it.refNova; });
        if (!pendentes.length) { gerando = false; atualizarTabela(); return; }
        var minhaGeracao = ++geracaoId;
        gerando = true;
        atualizarTabela();
        var cadeia = Promise.resolve();
        pendentes.forEach(function(it) {
          cadeia = cadeia.then(function() {
            if (minhaGeracao !== geracaoId) return; /* toggle mudou entretanto */
            var categoria = procResolverCategoria(it.nome, categorias);
            return procObtenerOuCriarReferencia(fornecedor, fornecedorInfo.codigo, it.ref, categoria, guiaAtual)
              .then(function(resultado) {
                if (minhaGeracao !== geracaoId) return;
                if (resultado) {
                  it.refNova = resultado.referencia_interna;
                  /* So marcamos para poder apagar mais tarde se esta
                     chamada e que a criou agora mesmo — se ja existia
                     (partilhada com outra factura, p.ex.), nunca se apaga. */
                  it.refNovaCriadaAgora = resultado.criada_agora;
                }
              })
              .catch(function() {});
          });
        });
        cadeia.then(function() {
          if (minhaGeracao === geracaoId) { gerando = false; atualizarTabela(true); }
        });
      }

      /* Ao desligar o toggle: apaga de imediato em Supabase (via RPC
         proc_borrar_referencias_rascunho) o que ESTA factura tem gerado
         neste momento — EXCEPTO uma referencia que outra factura ACTIVA
         (aberta neste instante, do mesmo fornecedor) ainda tenha na sua
         propria tabela. Cada factura decide livremente por si propria,
         mas nunca pode apagar debaixo dos pes de outra factura que ainda
         precisa da mesma referencia. A protecao final continua a ser da
         base de dados: nunca se apaga nada com guia_erp atribuido. */
      function apagarReferenciasGeradasEAtualizar() {
        geracaoId++; /* invalida qualquer geracao sequencial ainda a decorrer */
        gerando = false;
        var protegidas = procChavesUsadasPorOutrasFaturas(procNormalize(fornecedor), fid, categorias);
        var geradas = items
          .filter(function(it) {
            if (!it.refNova) return false;
            var refNorm   = procNormalizarRefOriginal(it.ref);
            var categoria = procResolverCategoria(it.nome, categorias);
            return !protegidas.hasOwnProperty(refNorm + '|' + categoria);
          })
          .map(function(it) { return it.refNova; });
        items.forEach(function(it) { it.refNova = null; it.refNovaCriadaAgora = false; });
        atualizarTabela();
        if (!geradas.length) return;
        procSbFetch('rpc/proc_borrar_referencias_rascunho', {
          method: 'POST',
          body: JSON.stringify({ p_proveedor: procNormalize(fornecedor), p_referencias: geradas })
        }).then(function(r) {
          if (!r.ok) {
            return r.text().then(function(txt) {
              console.error('[proc] falha ao apagar referencias rascunho — status ' + r.status + ':', txt, 'referencias:', geradas);
            });
          }
        }).catch(function(e) {
          console.error('[proc] erro de rede ao apagar referencias rascunho:', e, 'referencias:', geradas);
        });
      }

      var toggleEl = document.getElementById('proc-criacao-toggle-' + fid);
      if (toggleEl) {
        toggleEl.addEventListener('change', function() {
          ativoAtual = toggleEl.checked;
          /* Guarda so nesta factura (proc_sessoes), nunca no fornecedor —
             outra factura do mesmo fornecedor nao e afectada. */
          _usaNomenclaturaPorFatura[fid] = ativoAtual;
          procSaveSession(false);
          if (ativoAtual) { gerarReferenciasEAtualizar(); } else { apagarReferenciasGeradasEAtualizar(); }
        });
      }

      if (podeGerar && ativoAtual) gerarReferenciasEAtualizar();

      procShowCriacaoModalContinuar(modal, fid);
    }

    if (elegivelSessao) {
      Promise.all([procLoadFornecedorInfo(fornecedor), procLoadCategoriasRemote()])
        .then(function(res) { montarModal(res[0], res[1]); })
        .catch(function() { montarModal(null, []); });
    } else {
      montarModal(null, []);
    }
  }

  /* Resto da configura\u00e7\u00e3o do modal (fechar, hover, clique-para-copiar,
     anima\u00e7\u00e3o) — extra\u00eddo tal e qual do c\u00f3digo original, agora chamado
     depois de o modal (com ou sem a nova nomenclatura) j\u00e1 estar no DOM. */
  function procShowCriacaoModalContinuar(modal, fid) {
    /* Close on backdrop click */
    modal.querySelector('#proc-criacao-backdrop').addEventListener('click', function() {
      modal.classList.remove('proc-criacao-visible');
      setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 220);
    });
    modal.querySelector('#proc-criacao-close').addEventListener('click', function() {
      modal.classList.remove('proc-criacao-visible');
      setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 220);
    });

    /* Row / cell interaction */
    var activeRow = null;

    function applyActiveStyle(tr2) {
      tr2.style.setProperty('background', '#000', 'important');
      Array.prototype.forEach.call(tr2.querySelectorAll('td'), function(td2) {
        td2.style.setProperty('color', '#fff', 'important');
        td2.style.setProperty('opacity', '1', 'important');
      });
    }
    function clearActiveStyle(tr2) {
      tr2.style.removeProperty('background');
      Array.prototype.forEach.call(tr2.querySelectorAll('td'), function(td2) {
        td2.style.removeProperty('color');
        td2.style.removeProperty('opacity');
      });
    }

    modal.querySelector('tbody').addEventListener('mouseover', function(e) {
      var tr2 = e.target.closest('tr');
      if (!tr2) return;
      if (tr2 === activeRow) {
        tr2.classList.add('proc-row-highlight');
        Array.prototype.forEach.call(tr2.querySelectorAll('td'), function(td2) {
          td2.classList.add('proc-cell-highlight');
        });
      }
    });
    modal.querySelector('tbody').addEventListener('mouseleave', function() {
      if (activeRow) {
        activeRow.classList.add('proc-row-highlight');
        Array.prototype.forEach.call(activeRow.querySelectorAll('td'), function(td2) {
          td2.classList.add('proc-cell-highlight');
        });
      }
    });

    modal.querySelector('tbody').addEventListener('click', function(e) {
      var td = e.target.closest('td');
      var tr2 = e.target.closest('tr');
      if (!tr2) return;

      /* A coluna "Referencia original" so aparece quando a referencia
         interna esta activa — nesse caso e puramente informativa, para
         nunca ser copiada nem usada por engano em vez da referencia
         interna. Sem a referencia interna activa, a coluna nao existe e
         a coluna "normal" volta a comportar-se como sempre. */
      if (td && td.classList.contains('td-ref-original')) return;

      /* Clear previous active row inline styles */
      if (activeRow && activeRow !== tr2) {
        activeRow.classList.remove('proc-criacao-active');
        clearActiveStyle(activeRow);
      }

      /* Set new active row */
      tr2.classList.add('proc-criacao-active');
      applyActiveStyle(tr2);
      activeRow = tr2;

      /* Determine value to copy from the clicked cell */
      var cellVal = td ? td.textContent.trim() : '';
      if (!cellVal || cellVal === '\u2014') return;

      /* Copy to clipboard */
      var doCopy = function(text) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.className = 'proc-clipboard-hack';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
          }
        } catch(ex) {}
      };
      doCopy(cellVal);

      /* Strong copy feedback: cell turns black with ✓ briefly */
      if (td) {
        var origText = td.textContent;
        var origColor = td.style.color;
        var origBg = td.style.background;
        td.style.setProperty('background', '#000', 'important');
        td.style.setProperty('color', '#fff', 'important');
        td.textContent = '✓';
        setTimeout(function() {
          td.textContent = origText;
          td.style.background = origBg;
          td.style.color = origColor;
          /* Re-apply active style if this row is still active */
          if (tr2 === activeRow) applyActiveStyle(tr2);
        }, 500);
      }
    });

    /* Animate in */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { modal.classList.add('proc-criacao-visible'); });
    });
  }

  /* ── Auto-injeção: shell do overlay + cartão do dashboard ──
     Migrado de index.html. O shell só existe no DOM depois de
     ensureOverlayShell() correr — antes disso, openProcessamentoOverlay()
     não tinha onde inicializar (root inexistente). */
  function ensureOverlayShell() {
    if (document.getElementById('processamento-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div id="processamento-overlay">
  <div id="processamento-overlay-bar">
    <button id="processamento-overlay-back" onclick="closeProcessamentoOverlay();document.body.classList.remove('no-glow')">← voltar</button>
    <div id="processamento-overlay-title">processamento de faturas</div>
  </div>
  <div id="processamento-overlay-content">
    <div id="proc-root" style="width:100%; min-height:100%;"></div>
  </div>
</div>
    `);
  }

  /* ── Auto-injeção: #faturas-sub-grid vazio. Tem de correr AQUI, síncrono,
     ANTES de ensureModuleCard() (a seguir) — este ficheiro carrega ANTES de
     admin-init.js (ver loadProtectedScripts() em shared.js), cujo
     _adminInitWireCards() e relocateAccordionGrids() fazem os seus
     varrimentos únicos de [data-faturas-module]. Se o grid aparecesse
     depois, nem esses varrimentos nem o grid.appendChild() abaixo
     (ensureModuleCard) teriam onde inserir a card. Sem overlay fullscreen:
     o grupo "Faturas" expande-se no próprio lugar no dashboard. ── */
  function ensureFaturasOverlayShell() {
    if (document.getElementById('faturas-sub-grid')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="faturas-sub-grid"></div>');
  }
  ensureFaturasOverlayShell();

  function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-faturas-module="processamento"]')) return;
    var grid = document.getElementById('faturas-sub-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-faturas-module', 'processamento');
    card.innerHTML = `
        <div>
          <div class="adm-mod-name">FATURAS LISBOA</div>
          <div class="adm-mod-desc">processamento de faturas</div>
        </div>
      `;
    grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.openModule === 'function') window.openModule('processamento');
    });
  }
  ensureModuleCard();

  window.openProcessamentoOverlay  = openProcessamentoOverlay;
  window.closeProcessamentoOverlay = closeProcessamentoOverlay;

  /* functions called from inline onclick in dynamically built HTML */
  window.procAddFatura           = procAddFatura;
  window.procRemoveFatura        = procRemoveFatura;
  window.procUpdateBannerProvider= procUpdateBannerProvider;
  window.procUpdateHeader        = procUpdateHeader;
  window.procRecalcRow           = procRecalcRow;
  window.procCheckAutoExpand     = procCheckAutoExpand;
  window.procAutoSplit           = procAutoSplit;
  window.procFillAll             = procFillAll;
  window.procShowStockModal      = procShowStockModal;
  window.procToggleSessionMenu   = procToggleSessionMenu;
  window.procLoadSession         = procLoadSession;
  window.procForceLoadSession    = procForceLoadSession;
  window.procDeleteSession       = procDeleteSession;
  window.procSaveSession         = procSaveSession;
  window.procUpdateTableLock     = procUpdateTableLock;
  window.procObsSync             = procObsSync;
  window.procObsEdit              = procObsEdit;
  window.procObsCommit            = procObsCommit;
  window.procObsKeydown           = procObsKeydown;
  window.procShowGuiaModal       = procShowGuiaModal;
  window.procShowAuditPanel      = procShowAuditPanel;
  window.procShowCriacaoModal    = procShowCriacaoModal;
  window.procActivateRow             = procActivateRow;
  window.procLimitDigits         = procLimitDigits;
  window.procToggleFlag          = procToggleFlag;
  window.procPVPToggleEdit       = procPVPToggleEdit;
  window.procPVPEditInput        = procPVPEditInput;
  window.procPVPEditBlur         = procPVPEditBlur;
  window.procToggleCollapse      = procToggleCollapse;
  window.procGuiaErpChange       = procGuiaErpChange;
  window.procTranspChange        = procTranspChange;
  window.procTranspApply         = procTranspApply;
  window.procTranspUndo          = procTranspUndo;
  window.procGuiaIncludeChange   = procGuiaIncludeChange;
  window.procFecharRadiografiaEAbrirSessao = procFecharRadiografiaEAbrirSessao;
  window.procAbrirImportadorHistorico = procAbrirImportadorHistorico;
  window.procAbrirImportadorVendas = procAbrirImportadorVendas;
  window.procMostrarModalTotaisPorFornecedor = procMostrarModalTotaisPorFornecedor;
  window.procMostrarModalFornecedoresArtigos = procMostrarModalFornecedoresArtigos;

  /* ── Shared helper: highlight the row of any button/input element ── */
  function procActivateRow(el) {
    var tr = el.closest ? el.closest('tr') : null;
    if (!tr) return;
    var tbody = tr.closest ? tr.closest('tbody') : null;
    if (tbody) {
      var activeRows = tbody.querySelectorAll('tr.proc-row-active');
      for (var i = 0; i < activeRows.length; i++) {
        activeRows[i].classList.remove('proc-row-active');
      }
    }
    tr.classList.add('proc-row-active');
  }

  function procLimitDigits(input, max) {
    var v = input.value.replace(/[^0-9.]/g,'');
    var parts = v.split('.');
    if (parts[0].length > max) {
      parts[0] = parts[0].slice(0, max);
      input.value = parts.join('.');
    }
  }

  function procPVPToggleEdit(btn, fid, id) {
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (!pvpEl) return;
    var display   = pvpEl.querySelector('.proc-pvp-display');
    var editInput = pvpEl.querySelector('.proc-pvp-edit-input');
    var copyBtn   = pvpEl.querySelector('.proc-pvp-copy-btn');
    var isEditing = editInput && editInput.style.display === 'block';
    if (isEditing) {
      /* Commit */
      var val = parseFloat(editInput.value);
      if (!isNaN(val) && val > 0) {
        pvpEl._manualOverride = true;
        if (display) display.textContent = val.toFixed(2);
        pvpEl.className = 'proc-cell-computed has-val';
        if (copyBtn) copyBtn.style.display = 'inline-flex';
      } else if (!editInput.value.trim()) {
        /* Clear override — revert to auto */
        pvpEl._manualOverride = false;
        var calcVal = pvpEl._calcValue;
        if (calcVal !== null && calcVal !== undefined) {
          if (display) display.textContent = calcVal.toFixed(2);
          pvpEl.className = 'proc-cell-computed has-val';
          if (copyBtn) copyBtn.style.display = 'inline-flex';
        } else {
          if (display) display.textContent = '\u2014';
          pvpEl.className = 'proc-cell-computed';
          if (copyBtn) copyBtn.style.display = 'none';
        }
      }
      editInput.style.display = 'none';
      if (display) display.style.display = '';
      btn.classList.remove('active');
    } else {
      /* Start editing */
      var currentVal = pvpEl._manualOverride
        ? (display ? display.textContent.trim() : '')
        : (pvpEl._calcValue !== null && pvpEl._calcValue !== undefined ? pvpEl._calcValue.toFixed(2) : '');
      editInput.value = currentVal;
      editInput.style.display = 'block';
      if (display) display.style.display = 'none';
      editInput.focus();
      editInput.select();
      btn.classList.add('active');
    }
  }

  function procPVPEditInput(input, fid, id) {
    /* live preview while editing — no op needed, value is committed on blur/enter */
  }

  function procPVPEditBlur(input, fid, id) {
    var pvpEl = document.getElementById('proc-pvp-' + fid + '-' + id);
    if (!pvpEl) return;
    var btn = pvpEl.querySelector('.proc-pvp-edit-btn');
    procPVPToggleEdit(btn, fid, id);
  }

  function procToggleFlag(fid, id) {
    var btn = document.getElementById('proc-flag-' + fid + '-' + id);
    var tr  = document.getElementById('proc-row-'  + fid + '-' + id);
    if (!btn || !tr) return;
    var on = btn.classList.toggle('flagged');
    if (on) { tr.classList.add('proc-row-flagged'); }
    else    { tr.classList.remove('proc-row-flagged'); }
    procSaveSession(false);
  }

  function procObsSync(input) {
    /* Busca el tip y el botão asterisco como irmãos do input dentro do mesmo td */
    var cell = input.closest ? input.closest('.proc-obs-cell') : input.parentElement;
    var tip  = cell ? cell.querySelector('.proc-obs-tip') : null;
    var btn  = cell ? cell.querySelector('.proc-obs-btn')  : null;
    var val  = input.value || '';
    var has  = !!val.trim();
    if (tip) {
      tip.textContent = val;
      tip.classList.toggle('has-text', has);
    }
    if (btn) {
      btn.textContent = has ? '*' : '';
      btn.classList.toggle('has-text', has);
    }
  }

  /* Clique no asterisco (ou no espaço vazio da célula) abre o campo para escrever */
  function procObsEdit(btn) {
    var cell = btn.closest ? btn.closest('.proc-obs-cell') : btn.parentElement;
    if (!cell) return;
    var input = cell.querySelector('.proc-obs-input');
    if (!input) return;
    cell.classList.add('editing');
    input.focus();
    input.select();
  }

  /* Fecha a edição e volta a mostrar o asterisco (ou vazio) */
  function procObsCommit(input) {
    var cell = input.closest ? input.closest('.proc-obs-cell') : input.parentElement;
    procObsSync(input);
    if (cell) cell.classList.remove('editing');
    procSaveSession(false);
  }

  function procObsKeydown(e, input) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
  }

})();
