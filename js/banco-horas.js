// ══════════════════════════════════════════════════════════════
//  BANCO DE HORAS — admin (gestão + aprovação) e loja (autosserviço)
//  Leituras e autosserviço da loja usam window.sbClient (supabase-config.js).
//  Escritas de admin usam bhAdminClient(), um cliente Supabase próprio com
//  um cabeçalho/segredo dedicados — ver bh_is_admin() no SQL. Já disponível
//  quando initBancoHorasAdmin()/openBancoHorasOverlay() são chamados.
//
//  PORTO SANTO — caso especial: esta loja já tem o seu próprio banco de
//  horas dentro do gerador de horários (tabelas gh_people / gh_banco_horas),
//  em produção e a funcionar. Em vez de duplicar dados, este módulo lê e
//  escreve DIRETAMENTE nessas mesmas tabelas para "porto santo" (funções
//  com sufixo "PortoSanto" abaixo) — não existe cópia nem sincronização,
//  é a mesma conta vista a partir de dois sítios. gerador-horarios.js não
//  é tocado por nenhuma alteração feita aqui. Como gh_banco_horas não tem
//  conceito de "pendente", os pedidos da empregada de Porto Santo ficam
//  numa tabela nova (bh_ps_pendentes) até serem aceites — só aí entram em
//  gh_banco_horas, tal como a lógica de aprovação das outras lojas.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var BH_LOJAS = [
    { value: 'mezka funchal',                    label: 'Mezka Funchal' },
    { value: 'parfois madeira shopping',         label: 'Madeira Shopping' },
    { value: 'parfois arcadas são francisco',    label: 'Arcadas' },
    { value: 'porto santo',                      label: 'Porto Santo' }
  ];

  // Porto Santo não aparece na grelha "atribuir loja": as pessoas dessa loja
  // vêm de gh_people (gerido no próprio gerador de horários), não de recibos.
  var BH_LOJAS_ATRIBUIVEIS = BH_LOJAS.filter(function (l) { return l.value !== 'porto santo'; });

  function bhLojaLabel(value) {
    for (var i = 0; i < BH_LOJAS.length; i++) if (BH_LOJAS[i].value === value) return BH_LOJAS[i].label;
    return value || '';
  }

  function bhLojaOptionsHtml(includeEmpty, emptyLabel) {
    var html = includeEmpty ? '<option value="">' + bhEsc(emptyLabel || '— selecionar —') + '</option>' : '';
    BH_LOJAS.forEach(function (l) {
      html += '<option value="' + bhEsc(l.value) + '">' + bhEsc(l.label) + '</option>';
    });
    return html;
  }

  function bhEsc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function bhTodayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function bhFormatData(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split('-');
    return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : dateStr;
  }

  function bhFormatHoras(h) {
    return Number(h).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Espelha a lógica do trigger bh_calc_horas() no Postgres — só para pré-visualização.
  function bhComputeHoras(inicio, fim) {
    if (!inicio || !fim || inicio === fim) return null;
    var pi = inicio.split(':').map(Number);
    var pf = fim.split(':').map(Number);
    if (pi.length < 2 || pf.length < 2 || pi.some(isNaN) || pf.some(isNaN)) return null;
    var minutos = (pf[0] * 60 + pf[1]) - (pi[0] * 60 + pi[1]);
    if (minutos <= 0) minutos += 24 * 60;
    return Math.round((minutos / 60) * 100) / 100;
  }

  function bhFormatSaldo(saldo) {
    var n = Number(saldo) || 0;
    if (Math.abs(n) < 0.005) return { texto: 'saldo a zero', classe: 'bh-saldo-zero' };
    if (n > 0) return { texto: bhFormatHoras(n) + ' h a favor da empregada', classe: 'bh-saldo-positivo' };
    return { texto: bhFormatHoras(Math.abs(n)) + ' h em dívida à empresa', classe: 'bh-saldo-negativo' };
  }

  function bhEstadoBadge(estado) {
    var map = {
      pendente: ['pendente', 'bh-badge-pendente'],
      aceite: ['aceite', 'bh-badge-aceite'],
      rejeitado: ['rejeitado', 'bh-badge-rejeitado']
    };
    var m = map[estado] || [estado, ''];
    return '<span class="bh-badge ' + m[1] + '">' + m[0] + '</span>';
  }

  // 'credito' = horas extra (a favor da empregada) · 'debito' = deve à empresa
  function bhTipoLabel(tipo) {
    return tipo === 'credito' ? 'horas extra' : 'deve à empresa';
  }
  function bhTipoBadge(tipo) {
    return tipo === 'credito'
      ? '<span class="bh-badge bh-badge-credito">horas extra</span>'
      : '<span class="bh-badge bh-badge-debito">deve à empresa</span>';
  }

  /* ══════════════════════════════════════════════════════════════
     ESTILOS
     ══════════════════════════════════════════════════════════════ */
  function bhInjectStyles() {
    var existing = document.getElementById('bh-styles');
    if (existing) existing.remove();
    var s = document.createElement('style');
    s.id = 'bh-styles';
    s.textContent = [
      '#tab-banco-horas.active{overflow-y:auto;}',
      '#bh-admin-wrap,#bh-loja-wrap{width:100%;max-width:900px;margin:0 auto;padding:0 4px 60px;box-sizing:border-box;font-family:"MontserratLight",sans-serif;}',
      '.bh-section{margin-bottom:34px;}',
      '.bh-section-title{font-size:.78rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;opacity:.55;margin-bottom:14px;}',
      '.bh-filter-row{margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;}',
      '.bh-filter-row select{padding:8px 12px;font-size:.85rem;font-weight:600;font-family:"MontserratLight",sans-serif;border:1.5px solid #ddd;border-radius:9px;background:#fff;outline:none;cursor:pointer;}',
      '.bh-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid #e6e6e6;border-radius:10px;background:#fafafa;margin-bottom:8px;flex-wrap:wrap;}',
      '.bh-row-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
      '.bh-row-nome{font-size:.86rem;font-weight:bold;color:#000;}',
      '.bh-row-loja{font-size:.72rem;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.04em;}',
      '.bh-row-meta{font-size:.72rem;font-weight:600;color:#888;}',
      '.bh-row-actions{display:flex;gap:6px;flex-shrink:0;}',
      '.bh-empty{text-align:center;padding:24px;color:#aaa;font-size:.85rem;font-weight:600;}',
      '.bh-error{text-align:center;padding:16px;color:#c03000;font-size:.85rem;font-weight:600;}',
      '.bh-btn{padding:6px 14px;font-size:.76rem;font-weight:600;cursor:pointer;border:1px solid #ccc;border-radius:8px;background:#fff;font-family:"MontserratLight",sans-serif;transition:background .15s,color .15s,border-color .15s;}',
      '.bh-btn:hover{background:#f0f0f0;border-color:#999;}',
      '.bh-btn:disabled{opacity:.45;cursor:not-allowed;}',
      '.bh-btn.bh-btn-del:hover{background:#fff0f0;border-color:#e00;color:#c00;}',
      '.bh-btn.bh-btn-aceitar{border-color:#2a8a2a;color:#2a8a2a;}',
      '.bh-btn.bh-btn-aceitar:hover{background:#2a8a2a;color:#fff;}',
      '.bh-btn.bh-btn-rejeitar:hover{background:#c03000;border-color:#c03000;color:#fff;}',
      '.bh-btn.primary{background:#000;color:#fff !important;border-color:#000;}',
      '.bh-btn.primary:hover{background:#333;border-color:#333;}',
      '.bh-badge{display:inline-block;padding:2px 9px;font-size:.66rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;border-radius:12px;}',
      '.bh-badge-inativo{background:#fff0f0;color:#c00;}',
      '.bh-badge-pendente{background:#fff8e6;color:#a06a00;}',
      '.bh-badge-aceite{background:#eafaea;color:#2a8a2a;}',
      '.bh-badge-rejeitado{background:#fdeaea;color:#c03000;}',
      '.bh-badge-credito{background:#eafaea;color:#2a8a2a;}',
      '.bh-badge-debito{background:#fff2e0;color:#b05000;}',
      '.bh-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;flex:1;min-width:130px;}',
      '.bh-field label{font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;opacity:.55;}',
      '.bh-field input,.bh-field select{padding:9px 12px;font-size:.9rem;font-weight:600;font-family:"MontserratLight",sans-serif;border:1.5px solid #ddd;border-radius:10px;outline:none;background:#fff;box-sizing:border-box;transition:border-color .2s;}',
      '.bh-field input:focus,.bh-field select:focus{border-color:#555;}',
      '.bh-field-row{display:flex;gap:12px;flex-wrap:wrap;}',
      '.bh-preview span{display:inline-block;padding:9px 0;font-size:.9rem;font-weight:bold;color:#000;}',
      '#bh-lancar-status,#bh-loja-submit-status{font-size:.82rem;font-weight:600;min-height:18px;margin-top:8px;}',
      '.bh-status-ok{color:#2a8a2a;}',
      '.bh-status-error{color:#c03000;}',
      '.bh-saldo-card{padding:18px 22px;border-radius:14px;background:#f7f7f7;border:1.5px solid #e6e6e6;margin-bottom:20px;}',
      '.bh-saldo-card .bh-saldo-nome{font-size:.78rem;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px;}',
      '.bh-saldo-card .bh-saldo-valor{font-size:1.3rem;font-weight:bold;}',
      '.bh-saldo-positivo{color:#2a8a2a !important;}',
      '.bh-saldo-negativo{color:#c03000 !important;}',
      '.bh-saldo-zero{color:#666 !important;}',
      '#bh-loja-picker{display:flex;flex-direction:column;gap:8px;max-width:360px;margin:20px auto 30px;text-align:center;}',
      '#bh-loja-picker label{font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;opacity:.55;}',
      '#bh-loja-picker select{padding:10px 14px;font-size:.95rem;font-weight:600;font-family:"MontserratLight",sans-serif;border:1.5px solid #ddd;border-radius:12px;background:#fff;outline:none;cursor:pointer;}',
      '.bh-loja-group-title{font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;opacity:.6;margin:18px 0 8px;}',
      '.bh-loja-group-title:first-child{margin-top:0;}',
      '.bh-row-clickable{cursor:pointer;transition:background .12s;}',
      '.bh-row-clickable:hover{background:#f0f0f0;}',
      '#bh-lancar-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;justify-content:center;align-items:center;}',
      '#bh-lancar-modal-overlay.show{display:flex;}',
      '#bh-lancar-modal-box{background:#fff;border-radius:18px;padding:26px;max-width:480px;width:92%;max-height:85vh;overflow-y:auto;font-family:"MontserratLight",sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.15);}',
      '#bh-lancar-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}',
      '#bh-lancar-modal-title{font-size:.88rem;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#000;}',
      '#bh-lancar-modal-close{background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:#000;padding:4px 8px;border-radius:6px;line-height:1;}',
      '#bh-lancar-modal-close:hover{background:#f0f0f0;}',
      '#bh-lancar-modal-nome{font-size:.95rem;font-weight:bold;color:#000;}',
      '#bh-lancar-modal-loja{font-size:.72rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.04em;}',
      '#bh-gerir-lojas-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:601;justify-content:center;align-items:center;}',
      '#bh-gerir-lojas-modal-overlay.show{display:flex;}',
      '#bh-gerir-lojas-modal-box{background:#fff;border-radius:18px;padding:26px;max-width:420px;width:90%;font-family:"MontserratLight",sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.15);}',
      '#bh-gerir-lojas-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}',
      '#bh-gerir-lojas-modal-title{font-size:.88rem;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#000;}',
      '#bh-gerir-lojas-modal-close{background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:#000;padding:4px 8px;border-radius:6px;line-height:1;}',
      '#bh-gerir-lojas-modal-close:hover{background:#f0f0f0;}',
      '#bh-gerir-lojas-modal-nome{font-size:.95rem;font-weight:bold;color:#000;}',
      '.bh-gerir-loja-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid #f0f0f0;}',
      '.bh-gerir-loja-row:last-child{border-bottom:none;}',
      '.bh-gerir-loja-row input[type="checkbox"]{width:18px;height:18px;cursor:pointer;flex-shrink:0;}',
      '.bh-gerir-loja-row label{font-size:.86rem;font-weight:600;cursor:pointer;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════
     ACESSO A DADOS
     ══════════════════════════════════════════════════════════════ */
  async function bhFetchColaboradoras(loja) {
    var q = window.sbClient.from('bh_colaboradoras').select('*').order('nome', { ascending: true });
    if (loja) q = q.eq('loja', loja);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  // Reaproveita a lista já gerida em "pagamentos → gerir colaboradoras"
  // (tabela recibos_funcionarias, endpoint /api/recibos-gerir) em vez de duplicar
  // nomes aqui. Devolve [] silenciosamente se o pedido falhar, para não travar
  // o resto do painel.
  async function bhFetchColaboradorasRecibos() {
    try {
      var res = await fetch('/api/recibos-gerir', { credentials: 'same-origin' });
      if (!res.ok) return [];
      var body = await res.json().catch(function () { return {}; });
      return (body.funcionarias || []).filter(function (f) { return f.ativo !== false; });
    } catch (e) {
      return [];
    }
  }

  async function bhFetchSaldos(loja) {
    var q = window.sbClient.from('bh_saldos').select('*').order('nome', { ascending: true });
    if (loja) q = q.eq('loja', loja);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function bhFetchLancamentos(colaboradoraId) {
    var res = await window.sbClient.from('bh_lancamentos').select('*')
      .eq('colaboradora_id', colaboradoraId)
      .order('data', { ascending: false })
      .order('inserido_em', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function bhFetchPendentes(loja) {
    var res = await window.sbClient.from('bh_lancamentos')
      .select('*, bh_colaboradoras(nome, loja)')
      .eq('estado', 'pendente')
      .order('inserido_em', { ascending: true });
    if (res.error) throw res.error;
    var list = res.data || [];
    if (loja) list = list.filter(function (l) { return l.bh_colaboradoras && l.bh_colaboradoras.loja === loja; });
    return list;
  }

  /* ── Porto Santo: leitura direta de gh_people / gh_banco_horas / bh_ps_pendentes ── */
  // gh_people e gh_banco_horas só respondem a pedidos com o token real de
  // admin (política "solo admin con token", cmd=ALL) — o mesmo cliente que o
  // gerador-horarios.js já usa (getSupabase() -> sbAdmin). window.sbClient
  // (anon, sem token) devolve sempre vazio aqui, sem erro.
  async function bhFetchPessoasPortoSanto() {
    var res = await window.sbAdmin.from('gh_people').select('id,name').eq('active', true).order('name', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function bhFetchBancoPortoSantoMap() {
    var res = await window.sbAdmin.from('gh_banco_horas').select('pessoa_id,saldo');
    if (res.error) throw res.error;
    var map = {};
    (res.data || []).forEach(function (b) { map[b.pessoa_id] = Number(b.saldo) || 0; });
    return map;
  }

  async function bhFetchPendentesPortoSanto() {
    var res = await window.sbClient.from('bh_ps_pendentes').select('*')
      .eq('estado', 'pendente')
      .order('inserido_em', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function bhFetchSaldosPortoSanto() {
    var pessoas = await bhFetchPessoasPortoSanto();
    var bancoMap = await bhFetchBancoPortoSantoMap();
    var pendentes = await bhFetchPendentesPortoSanto();
    var pendCountMap = {};
    pendentes.forEach(function (p) { pendCountMap[p.pessoa_id] = (pendCountMap[p.pessoa_id] || 0) + 1; });
    return pessoas.map(function (p) {
      return {
        pessoa_id: p.id,
        nome: p.name,
        loja: 'porto santo',
        ativo: true,
        saldo_horas: bancoMap[p.id] || 0,
        pendentes_count: pendCountMap[p.id] || 0
      };
    });
  }

  // Escritas de admin usam um cliente Supabase próprio do Banco de Horas,
  // com um cabeçalho e segredo dedicados (não é o ADMIN_TOKEN do resto da
  // app). O Postgres confirma este cabeçalho em bh_is_admin() — ver o SQL.
  var BH_ADMIN_SECRET = 'bh_819feacac0265c06d180eea78f7f79af245f5dd570c4ccfa';
  var bhAdminClientInstance = null;
  function bhAdminClient() {
    if (bhAdminClientInstance) return bhAdminClientInstance;
    bhAdminClientInstance = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-bh-admin-token': BH_ADMIN_SECRET } }
    });
    return bhAdminClientInstance;
  }

  async function bhAdminAddColaboradora(nome, loja) {
    var res = await bhAdminClient().from('bh_colaboradoras').insert({ nome: nome.trim().toUpperCase(), loja: loja });
    if (res.error) throw res.error;
  }
  async function bhAdminDeleteColaboradora(id) {
    var res = await bhAdminClient().from('bh_colaboradoras').delete().eq('id', id);
    if (res.error) throw res.error;
  }

  async function bhAdminDecidir(id, novoEstado) {
    var res = await bhAdminClient().from('bh_lancamentos').update({ estado: novoEstado }).eq('id', id);
    if (res.error) throw res.error;
  }

  async function bhAdminInserirDireto(payload) {
    var res = await bhAdminClient().from('bh_lancamentos').insert({
      colaboradora_id: payload.colaboradora_id,
      tipo: payload.tipo,
      data: payload.data,
      hora_inicio: payload.hora_inicio,
      hora_fim: payload.hora_fim,
      origem: 'admin',
      estado: 'aceite',
      nota: payload.nota || null
    });
    if (res.error) throw res.error;
  }

  // Soma/subtrai diretamente ao saldo de gh_banco_horas — o MESMO upsert que
  // lancarBanco() já faz dentro de gerador-horarios.js (mesma tabela, mesma
  // lógica de arredondamento a 1 casa decimal). Não toca em saldo_semana nem
  // ultima_semana, que são só do cálculo automático do horário semanal.
  async function bhAdminLancarPortoSanto(pessoaId, deltaHoras) {
    var atualRes = await window.sbAdmin.from('gh_banco_horas').select('saldo').eq('pessoa_id', pessoaId).maybeSingle();
    if (atualRes.error) throw atualRes.error;
    var atual = (atualRes.data && Number(atualRes.data.saldo)) || 0;
    var novoSaldo = Math.round((atual + deltaHoras) * 10) / 10;
    var res = await window.sbAdmin.from('gh_banco_horas').upsert(
      { pessoa_id: pessoaId, saldo: novoSaldo, updated_at: new Date().toISOString() },
      { onConflict: 'pessoa_id' }
    );
    if (res.error) throw res.error;
    return novoSaldo;
  }

  async function bhAdminDecidirPortoSanto(id, novoEstado) {
    var atualRow = await bhAdminClient().from('bh_ps_pendentes').select('*').eq('id', id).maybeSingle();
    if (atualRow.error) throw atualRow.error;
    var row = atualRow.data;
    if (!row) throw new Error('Pedido não encontrado (pode já ter sido decidido).');
    var upd = await bhAdminClient().from('bh_ps_pendentes').update({ estado: novoEstado }).eq('id', id);
    if (upd.error) throw upd.error;
    if (novoEstado === 'aceite') {
      var delta = row.tipo === 'credito' ? Number(row.horas) : -Number(row.horas);
      await bhAdminLancarPortoSanto(row.pessoa_id, delta);
    }
  }

  async function bhLojaSubmeter(payload) {
    var res = await window.sbClient.from('bh_lancamentos').insert({
      colaboradora_id: payload.colaboradora_id,
      tipo: payload.tipo,
      data: payload.data,
      hora_inicio: payload.hora_inicio,
      hora_fim: payload.hora_fim,
      origem: 'empregada',
      estado: 'pendente',
      nota: payload.nota || null
    });
    if (res.error) throw res.error;
  }

  async function bhLojaCancelarPendente(id) {
    var res = await window.sbClient.from('bh_lancamentos').delete().eq('id', id).eq('estado', 'pendente');
    if (res.error) throw res.error;
  }

  async function bhLojaSubmeterPortoSanto(payload) {
    var res = await window.sbClient.from('bh_ps_pendentes').insert({
      pessoa_id: payload.pessoa_id,
      nome: payload.nome,
      tipo: payload.tipo,
      data: payload.data,
      hora_inicio: payload.hora_inicio,
      hora_fim: payload.hora_fim,
      nota: payload.nota || null
    });
    if (res.error) throw res.error;
  }

  async function bhLojaCancelarPendentePortoSanto(id) {
    var res = await window.sbClient.from('bh_ps_pendentes').delete().eq('id', id).eq('estado', 'pendente');
    if (res.error) throw res.error;
  }

  /* ══════════════════════════════════════════════════════════════
     ADMIN — DOM + RENDER
     ══════════════════════════════════════════════════════════════ */
  var bhAdminInjected = false;

  function bhAdminInjectDOM() {
    var root = document.getElementById('bh-admin-root');
    if (!root || bhAdminInjected) return;
    bhAdminInjected = true;
    root.innerHTML =
      '<div id="bh-admin-wrap">' +
        '<div id="bh-adm-pendentes-wrap"></div>' +

        '<div class="bh-section">' +
          '<div class="bh-filter-row">' +
            '<select id="bh-adm-loja-filter"><option value="">todas as lojas (saldos e pendentes)</option>' + bhLojaOptionsHtml(false) + '</select>' +
          '</div>' +
          '<div class="bh-section-title">saldos</div>' +
          '<div id="bh-adm-saldos-list"></div>' +
        '</div>' +

        '<div class="bh-section">' +
          '<div class="bh-section-title">lançamentos pendentes</div>' +
          '<div id="bh-adm-pendentes-list"></div>' +
        '</div>' +
      '</div>';

    // ── delegação de eventos (uma única vez) ──
    document.getElementById('bh-adm-saldos-list').addEventListener('click', function (e) {
      var row = e.target.closest('.bh-row-clickable');
      if (!row) return;
      bhOpenLancarModal({
        tipo: row.getAttribute('data-tipo'),
        id: row.getAttribute('data-tipo') === 'ps' ? row.getAttribute('data-id') : parseInt(row.getAttribute('data-id'), 10),
        nome: row.getAttribute('data-nome'),
        loja: row.getAttribute('data-loja')
      });
    });
    document.getElementById('bh-adm-loja-filter').addEventListener('change', bhAdminRefreshAll);

    document.getElementById('bh-adm-pendentes-wrap').addEventListener('click', function (e) {
      var row = e.target.closest('.bh-row-clickable');
      if (row) { bhOpenGerirLojasModal(row.getAttribute('data-nome')); return; }
      var delBtn = e.target.closest('.bh-btn-del-orphan');
      if (delBtn) {
        var id = parseInt(delBtn.getAttribute('data-id'), 10);
        var nome = delBtn.getAttribute('data-nome');
        if (!confirm('Eliminar "' + nome + '" do Banco de Horas? Isto apaga também o histórico de horas dela. Não é reversível.')) return;
        delBtn.disabled = true;
        bhAdminDeleteColaboradora(id)
          .then(bhAdminRefreshAll)
          .catch(function (err) { alert('Erro ao eliminar: ' + err.message); delBtn.disabled = false; });
      }
    });

    document.getElementById('bh-adm-pendentes-list').addEventListener('click', function (e) {
      var aceitarBtn = e.target.closest('.bh-btn-aceitar');
      var rejeitarBtn = e.target.closest('.bh-btn-rejeitar');
      var btn = aceitarBtn || rejeitarBtn;
      if (!btn) return;
      var rawId = btn.getAttribute('data-id');
      var isPS = rawId.indexOf('ps:') === 0;
      var id = isPS ? parseInt(rawId.slice(3), 10) : parseInt(rawId, 10);
      var novoEstado = aceitarBtn ? 'aceite' : 'rejeitado';
      if (rejeitarBtn && !confirm('Rejeitar este lançamento?')) return;
      var row = btn.closest('.bh-row');
      row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      var decisao = isPS ? bhAdminDecidirPortoSanto(id, novoEstado) : bhAdminDecidir(id, novoEstado);
      decisao
        .then(bhAdminRefreshAll)
        .catch(function (err) {
          alert('Erro: ' + err.message);
          row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        });
    });

  }

  /* ── modal "registar horas" — aberto ao clicar num nome nos saldos ── */
  var bhLancarModalInjected = false;
  var bhLancarAlvo = null; // { tipo: 'normal'|'ps', id, nome, loja }

  function bhLancarModalInjectDOM() {
    if (bhLancarModalInjected) return;
    bhLancarModalInjected = true;
    var modal = document.createElement('div');
    modal.id = 'bh-lancar-modal-overlay';
    modal.innerHTML =
      '<div id="bh-lancar-modal-box">' +
        '<div id="bh-lancar-modal-header">' +
          '<span id="bh-lancar-modal-title">registar horas</span>' +
          '<button id="bh-lancar-modal-close">✕</button>' +
        '</div>' +
        '<div id="bh-lancar-modal-body">' +
          '<div class="bh-row-nome" id="bh-lancar-modal-nome" style="margin-bottom:2px;"></div>' +
          '<div class="bh-row-loja" id="bh-lancar-modal-loja" style="margin-bottom:10px;"></div>' +
          '<div id="bh-lancar-gerir-lojas-wrap" style="margin-bottom:18px;"><button class="bh-btn" type="button" id="bh-lancar-gerir-lojas-btn">gerir lojas</button></div>' +
          '<div class="bh-field-row">' +
            '<div class="bh-field"><label>tipo</label><select id="bh-lancar-tipo">' +
              '<option value="credito">horas extra</option>' +
              '<option value="debito">deve à empresa</option>' +
            '</select></div>' +
            '<div class="bh-field"><label>data</label><input type="date" id="bh-lancar-data"></div>' +
          '</div>' +
          '<div class="bh-field-row">' +
            '<div class="bh-field"><label>hora início</label><input type="time" id="bh-lancar-inicio"></div>' +
            '<div class="bh-field"><label>hora fim</label><input type="time" id="bh-lancar-fim"></div>' +
            '<div class="bh-field bh-preview"><label>duração</label><span id="bh-lancar-preview">—</span></div>' +
          '</div>' +
          '<div class="bh-field"><label>nota (opcional)</label><input type="text" id="bh-lancar-nota" placeholder="observação"></div>' +
          '<button class="bh-btn primary" id="bh-lancar-submit-btn">registar (já aceite)</button>' +
          '<div id="bh-lancar-status"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('bh-lancar-modal-close').addEventListener('click', bhCloseLancarModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) bhCloseLancarModal(); });

    document.getElementById('bh-lancar-gerir-lojas-btn').addEventListener('click', function () {
      if (!bhLancarAlvo) return;
      var nome = bhLancarAlvo.nome;
      bhCloseLancarModal();
      bhOpenGerirLojasModal(nome);
    });

    ['bh-lancar-inicio', 'bh-lancar-fim'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        var inicio = document.getElementById('bh-lancar-inicio').value;
        var fim = document.getElementById('bh-lancar-fim').value;
        var h = bhComputeHoras(inicio, fim);
        document.getElementById('bh-lancar-preview').textContent = h === null ? '—' : (bhFormatHoras(h) + ' h');
      });
    });

    document.getElementById('bh-lancar-submit-btn').addEventListener('click', async function () {
      if (!bhLancarAlvo) return;
      var btn = this;
      var statusEl = document.getElementById('bh-lancar-status');
      var tipo = document.getElementById('bh-lancar-tipo').value;
      var data = document.getElementById('bh-lancar-data').value;
      var inicio = document.getElementById('bh-lancar-inicio').value;
      var fim = document.getElementById('bh-lancar-fim').value;
      var nota = document.getElementById('bh-lancar-nota').value;

      if (!data) { statusEl.textContent = 'Indica a data.'; statusEl.className = 'bh-status-error'; return; }
      var horasCalc = bhComputeHoras(inicio, fim);
      if (horasCalc === null) { statusEl.textContent = 'Hora de início e hora de fim inválidas ou iguais.'; statusEl.className = 'bh-status-error'; return; }

      btn.disabled = true; statusEl.textContent = 'a guardar…'; statusEl.className = '';
      try {
        if (bhLancarAlvo.tipo === 'ps') {
          var delta = tipo === 'credito' ? horasCalc : -horasCalc;
          await bhAdminLancarPortoSanto(bhLancarAlvo.id, delta);
        } else {
          await bhAdminInserirDireto({ colaboradora_id: bhLancarAlvo.id, tipo: tipo, data: data, hora_inicio: inicio, hora_fim: fim, nota: nota });
        }
        statusEl.textContent = '✓ lançamento registado e já aceite.'; statusEl.className = 'bh-status-ok';
        await bhAdminRefreshAll();
        setTimeout(bhCloseLancarModal, 700);
      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message; statusEl.className = 'bh-status-error';
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bhOpenLancarModal(alvo) {
    bhLancarModalInjectDOM();
    bhLancarAlvo = alvo;
    document.getElementById('bh-lancar-modal-nome').textContent = alvo.nome;
    document.getElementById('bh-lancar-modal-loja').textContent = bhLojaLabel(alvo.loja);
    document.getElementById('bh-lancar-gerir-lojas-wrap').style.display = alvo.tipo === 'ps' ? 'none' : '';
    document.getElementById('bh-lancar-tipo').value = 'credito';
    document.getElementById('bh-lancar-data').value = bhTodayISO();
    document.getElementById('bh-lancar-inicio').value = '';
    document.getElementById('bh-lancar-fim').value = '';
    document.getElementById('bh-lancar-nota').value = '';
    document.getElementById('bh-lancar-preview').textContent = '—';
    document.getElementById('bh-lancar-status').textContent = '';
    document.getElementById('bh-lancar-status').className = '';
    document.getElementById('bh-lancar-modal-overlay').classList.add('show');
  }
  function bhCloseLancarModal() {
    var el = document.getElementById('bh-lancar-modal-overlay');
    if (el) el.classList.remove('show');
    bhLancarAlvo = null;
  }

  function bhRenderPendenteAtribuicaoRow(nome) {
    return '<div class="bh-row bh-row-clickable" data-nome="' + bhEsc(nome) + '" title="clicar para atribuir loja">' +
      '<div class="bh-row-main"><span class="bh-row-nome">' + bhEsc(nome) + '</span></div>' +
      '<span class="bh-row-meta">por atribuir</span>' +
    '</div>';
  }

  function bhRenderOrphanRow(c) {
    return '<div class="bh-row">' +
      '<div class="bh-row-main">' +
        '<span class="bh-row-nome">' + bhEsc(c.nome) + '</span>' +
        '<span class="bh-row-loja">' + bhEsc(bhLojaLabel(c.loja)) + '</span>' +
      '</div>' +
      '<div class="bh-row-actions">' +
        '<button class="bh-btn bh-btn-del bh-btn-del-orphan" data-id="' + c.id + '" data-nome="' + bhEsc(c.nome) + '">eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function bhRenderSaldoRow(s) {
    var saldo = bhFormatSaldo(s.saldo_horas);
    var tipo = s.pessoa_id != null ? 'ps' : 'normal';
    var id = s.pessoa_id != null ? s.pessoa_id : s.colaboradora_id;
    return '<div class="bh-row bh-row-clickable" data-tipo="' + tipo + '" data-id="' + bhEsc(String(id)) + '" data-nome="' + bhEsc(s.nome) + '" data-loja="' + bhEsc(s.loja) + '" title="clicar para registar horas">' +
      '<div class="bh-row-main">' +
        '<span class="bh-row-nome">' + bhEsc(s.nome) + '</span>' +
        (s.pendentes_count > 0 ? '<span class="bh-row-meta">' + s.pendentes_count + ' pendente' + (s.pendentes_count > 1 ? 's' : '') + '</span>' : '') +
      '</div>' +
      '<span class="' + saldo.classe + '" style="font-size:.85rem;font-weight:bold;">' + saldo.texto + '</span>' +
    '</div>';
  }

  // Agrupa por loja, pela ordem de BH_LOJAS — como o utilizador pediu.
  function bhRenderSaldosGrouped(saldos) {
    if (!saldos.length) return '<div class="bh-empty">sem dados.</div>';
    var porLoja = {};
    saldos.forEach(function (s) {
      if (!porLoja[s.loja]) porLoja[s.loja] = [];
      porLoja[s.loja].push(s);
    });
    var html = '';
    BH_LOJAS.forEach(function (l) {
      var items = porLoja[l.value];
      if (!items || !items.length) return;
      html += '<div class="bh-loja-group-title">' + bhEsc(l.label) + '</div>' + items.map(bhRenderSaldoRow).join('');
    });
    return html || '<div class="bh-empty">sem dados.</div>';
  }

  function bhRenderPendenteRow(l) {
    var nome = l.bh_colaboradoras ? l.bh_colaboradoras.nome : ('#' + l.colaboradora_id);
    var loja = l.bh_colaboradoras ? bhLojaLabel(l.bh_colaboradoras.loja) : '';
    return '<div class="bh-row" data-id="' + l.id + '">' +
      '<div class="bh-row-main">' +
        '<span class="bh-row-nome">' + bhEsc(nome) + '</span>' +
        '<span class="bh-row-loja">' + bhEsc(loja) + '</span>' +
        bhTipoBadge(l.tipo) +
        '<span class="bh-row-meta">' + bhFormatData(l.data) + ' · ' + l.hora_inicio.slice(0, 5) + '–' + l.hora_fim.slice(0, 5) + ' · ' + bhFormatHoras(l.horas) + ' h</span>' +
        (l.nota ? '<span class="bh-row-meta">"' + bhEsc(l.nota) + '"</span>' : '') +
      '</div>' +
      '<div class="bh-row-actions">' +
        '<button class="bh-btn bh-btn-aceitar" data-id="' + l.id + '">✓ aceitar</button>' +
        '<button class="bh-btn bh-btn-rejeitar" data-id="' + l.id + '">✕ rejeitar</button>' +
      '</div>' +
    '</div>';
  }

  // Silencioso por default: só mostra algo quando há colaboradoras dos
  // recibos ainda sem nenhuma loja atribuída, ou registos antigos sem
  // correspondência nos recibos. Sem essa justificação, o wrap fica vazio.
  async function bhRefreshColabSection() {
    var wrap = document.getElementById('bh-adm-pendentes-wrap');
    if (!wrap) return;
    try {
      var todasColaboradoras = await bhFetchColaboradoras(null);
      var recibosList = await bhFetchColaboradorasRecibos();
      var recibosNomes = recibosList.map(function (f) { return f.nome; });
      var recibosNomesLowerSet = new Set(recibosNomes.map(function (n) { return n.trim().toLowerCase(); }));
      var assignedNomesLowerSet = new Set(todasColaboradoras.map(function (c) { return c.nome.trim().toLowerCase(); }));

      var pendentes = recibosNomes.filter(function (n) { return !assignedNomesLowerSet.has(n.trim().toLowerCase()); });
      var orphans = todasColaboradoras.filter(function (c) { return !recibosNomesLowerSet.has(c.nome.trim().toLowerCase()); });

      if (!pendentes.length && !orphans.length) { wrap.innerHTML = ''; return; }

      var html = '';
      if (pendentes.length) {
        html += '<div class="bh-section-title">colaboradoras por atribuir</div>' +
          '<div class="bh-row-meta" style="margin-bottom:10px;">Clica no nome para escolher a loja.</div>' +
          pendentes.map(bhRenderPendenteAtribuicaoRow).join('');
      }
      if (orphans.length) {
        html += '<div class="bh-section-title" style="margin-top:' + (pendentes.length ? '22px' : '0') + ';">sem correspondência nos recibos</div>' +
          '<div class="bh-row-meta" style="margin-bottom:10px;">Têm horas registadas mas já não estão em "gerir colaboradoras".</div>' +
          orphans.map(bhRenderOrphanRow).join('');
      }
      wrap.innerHTML = '<div class="bh-section">' + html + '</div>';
    } catch (err) {
      wrap.innerHTML = '<div class="bh-section"><div class="bh-error">' + bhEsc(err.message) + '</div></div>';
    }
  }

  /* ── modal "gerir lojas" — atribuir/remover lojas de UMA colaboradora ── */
  var bhGerirLojasModalInjected = false;
  var bhGerirLojasNome = null;

  function bhGerirLojasModalInjectDOM() {
    if (bhGerirLojasModalInjected) return;
    bhGerirLojasModalInjected = true;
    var modal = document.createElement('div');
    modal.id = 'bh-gerir-lojas-modal-overlay';
    modal.innerHTML =
      '<div id="bh-gerir-lojas-modal-box">' +
        '<div id="bh-gerir-lojas-modal-header">' +
          '<span id="bh-gerir-lojas-modal-title">gerir lojas</span>' +
          '<button id="bh-gerir-lojas-modal-close">✕</button>' +
        '</div>' +
        '<div class="bh-row-nome" id="bh-gerir-lojas-modal-nome" style="margin-bottom:14px;"></div>' +
        '<div id="bh-gerir-lojas-modal-body"></div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('bh-gerir-lojas-modal-close').addEventListener('click', bhCloseGerirLojasModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) bhCloseGerirLojasModal(); });

    document.getElementById('bh-gerir-lojas-modal-body').addEventListener('change', async function (e) {
      var cb = e.target.closest('.bh-gerir-loja-check');
      if (!cb || !bhGerirLojasNome) return;
      var nome = bhGerirLojasNome;
      var loja = cb.getAttribute('data-loja');
      var id = cb.getAttribute('data-id');
      cb.disabled = true;
      try {
        if (cb.checked) {
          await bhAdminAddColaboradora(nome, loja);
        } else if (id) {
          var confirmar = confirm(
            'Remover ' + nome + ' de ' + bhLojaLabel(loja) + '?\n' +
            'Isto apaga também o histórico de horas dela nesta loja. Não é reversível.'
          );
          if (!confirmar) { cb.checked = true; cb.disabled = false; return; }
          await bhAdminDeleteColaboradora(parseInt(id, 10));
        }
        await bhRefreshGerirLojasModal();
        await bhAdminRefreshAll();
      } catch (err) {
        alert('Erro: ' + err.message);
        cb.checked = !cb.checked;
        cb.disabled = false;
      }
    });
  }

  async function bhRefreshGerirLojasModal() {
    var body = document.getElementById('bh-gerir-lojas-modal-body');
    if (!bhGerirLojasNome) return;
    body.innerHTML = '<div class="bh-empty">a carregar…</div>';
    try {
      var nomeLower = bhGerirLojasNome.trim().toLowerCase();
      var todas = await bhFetchColaboradoras(null);
      var existentesPorLoja = {};
      todas.forEach(function (c) {
        if (c.nome.trim().toLowerCase() === nomeLower) existentesPorLoja[c.loja] = c;
      });
      body.innerHTML = BH_LOJAS_ATRIBUIVEIS.map(function (l) {
        var existing = existentesPorLoja[l.value];
        var checked = existing ? ' checked' : '';
        var idAttr = existing ? existing.id : '';
        var cbId = 'bh-gerir-loja-cb-' + l.value.replace(/[^a-z0-9]/gi, '');
        return '<div class="bh-gerir-loja-row">' +
          '<input type="checkbox" class="bh-gerir-loja-check" id="' + cbId + '" data-loja="' + bhEsc(l.value) + '" data-id="' + idAttr + '"' + checked + '>' +
          '<label for="' + cbId + '">' + bhEsc(l.label) + '</label>' +
        '</div>';
      }).join('');
    } catch (err) {
      body.innerHTML = '<div class="bh-error">' + bhEsc(err.message) + '</div>';
    }
  }

  function bhOpenGerirLojasModal(nome) {
    bhGerirLojasModalInjectDOM();
    bhGerirLojasNome = nome;
    document.getElementById('bh-gerir-lojas-modal-nome').textContent = nome;
    document.getElementById('bh-gerir-lojas-modal-overlay').classList.add('show');
    bhRefreshGerirLojasModal();
  }
  function bhCloseGerirLojasModal() {
    var el = document.getElementById('bh-gerir-lojas-modal-overlay');
    if (el) el.classList.remove('show');
    bhGerirLojasNome = null;
  }

  async function bhAdminRefreshAll() {
    bhAdminInjectDOM();
    var lojaFiltro = document.getElementById('bh-adm-loja-filter').value;

    var saldosList = document.getElementById('bh-adm-saldos-list');
    var pendentesList = document.getElementById('bh-adm-pendentes-list');

    saldosList.innerHTML = '<div class="bh-empty">a carregar…</div>';
    pendentesList.innerHTML = '<div class="bh-empty">a carregar…</div>';

    await bhRefreshColabSection();

    try {
      // bh_saldos pode ainda ter registos antigos de Porto Santo (de antes desta
      // integração) — não se escondem, ficam visíveis ao lado dos novos, vindos
      // de gh_people/gh_banco_horas. Não são fundidos automaticamente.
      var saldos = await bhFetchSaldos(lojaFiltro || null);
      if (!lojaFiltro || lojaFiltro === 'porto santo') {
        var saldosPS = await bhFetchSaldosPortoSanto();
        saldos = saldos.concat(saldosPS);
      }
      saldosList.innerHTML = bhRenderSaldosGrouped(saldos);
    } catch (err) {
      saldosList.innerHTML = '<div class="bh-error">' + bhEsc(err.message) + '</div>';
    }

    try {
      var pendentes = await bhFetchPendentes(lojaFiltro || null);
      if (!lojaFiltro || lojaFiltro === 'porto santo') {
        var pendentesPSraw = await bhFetchPendentesPortoSanto();
        var pendentesPS = pendentesPSraw.map(function (row) {
          return {
            id: 'ps:' + row.id,
            tipo: row.tipo, data: row.data, hora_inicio: row.hora_inicio, hora_fim: row.hora_fim,
            horas: row.horas, nota: row.nota,
            bh_colaboradoras: { nome: row.nome, loja: 'porto santo' }
          };
        });
        pendentes = pendentes.concat(pendentesPS);
      }
      pendentesList.innerHTML = pendentes.length
        ? pendentes.map(bhRenderPendenteRow).join('')
        : '<div class="bh-empty">nenhum lançamento pendente.</div>';
    } catch (err) {
      pendentesList.innerHTML = '<div class="bh-error">' + bhEsc(err.message) + '</div>';
    }
  }

  // Chamado por openModule() quando o admin abre o sub-módulo "banco-horas".
  window.initBancoHorasAdmin = function () {
    bhInjectStyles();
    bhAdminInjectDOM();
    bhAdminRefreshAll();
  };

  /* ══════════════════════════════════════════════════════════════
     LOJA — DOM + RENDER (autosserviço da empregada)
     ══════════════════════════════════════════════════════════════ */
  var bhLojaInjected = false;
  var bhLojaColaboradoraAtual = null; // { id, nome, loja }

  function bhLojaInjectDOM() {
    var root = document.getElementById('bh-loja-root');
    if (!root || bhLojaInjected) return;
    bhLojaInjected = true;
    root.innerHTML =
      '<div id="bh-loja-wrap">' +
        '<div id="bh-loja-picker">' +
          '<label>quem és tu?</label>' +
          '<select id="bh-loja-nome-select"><option value="">— selecionar —</option></select>' +
        '</div>' +
        '<div id="bh-loja-content" style="display:none;">' +
          '<div id="bh-loja-saldo-card"></div>' +
          '<div class="bh-section">' +
            '<div class="bh-section-title">novo registo</div>' +
            '<div class="bh-field"><label>tipo</label><select id="bh-loja-tipo">' +
              '<option value="credito">horas extra (trabalhei a mais)</option>' +
              '<option value="debito">deve à empresa (saí mais cedo / recuperação)</option>' +
            '</select></div>' +
            '<div class="bh-field-row">' +
              '<div class="bh-field"><label>data</label><input type="date" id="bh-loja-data"></div>' +
              '<div class="bh-field"><label>hora início</label><input type="time" id="bh-loja-inicio"></div>' +
              '<div class="bh-field"><label>hora fim</label><input type="time" id="bh-loja-fim"></div>' +
              '<div class="bh-field bh-preview"><label>duração</label><span id="bh-loja-preview">—</span></div>' +
            '</div>' +
            '<div class="bh-field"><label>nota (opcional)</label><input type="text" id="bh-loja-nota" placeholder="observação"></div>' +
            '<button class="bh-btn primary" id="bh-loja-submit-btn">submeter para aprovação</button>' +
            '<div id="bh-loja-submit-status"></div>' +
          '</div>' +
          '<div class="bh-section">' +
            '<div class="bh-section-title">histórico</div>' +
            '<div id="bh-loja-historico"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('bh-loja-data').value = bhTodayISO();

    document.getElementById('bh-loja-nome-select').addEventListener('change', function () {
      var id = this.value;
      if (!id) { document.getElementById('bh-loja-content').style.display = 'none'; bhLojaColaboradoraAtual = null; return; }
      var opt = this.options[this.selectedIndex];
      var loja = window._currentStoreGlobal;
      var isPS = loja === 'porto santo';
      bhLojaColaboradoraAtual = { id: isPS ? id : parseInt(id, 10), nome: opt.getAttribute('data-nome'), loja: loja };
      try { localStorage.setItem('bh_colab_id_' + loja, id); } catch (e) {}
      document.getElementById('bh-loja-content').style.display = '';
      bhLojaRefreshConteudo();
    });

    ['bh-loja-inicio', 'bh-loja-fim'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        var inicio = document.getElementById('bh-loja-inicio').value;
        var fim = document.getElementById('bh-loja-fim').value;
        var h = bhComputeHoras(inicio, fim);
        document.getElementById('bh-loja-preview').textContent = h === null ? '—' : (bhFormatHoras(h) + ' h');
      });
    });

    document.getElementById('bh-loja-submit-btn').addEventListener('click', async function () {
      var btn = this;
      var statusEl = document.getElementById('bh-loja-submit-status');
      if (!bhLojaColaboradoraAtual) { statusEl.textContent = 'Seleciona primeiro o teu nome.'; statusEl.className = 'bh-status-error'; return; }
      var tipo = document.getElementById('bh-loja-tipo').value;
      var data = document.getElementById('bh-loja-data').value;
      var inicio = document.getElementById('bh-loja-inicio').value;
      var fim = document.getElementById('bh-loja-fim').value;
      var nota = document.getElementById('bh-loja-nota').value;

      if (!data) { statusEl.textContent = 'Indica a data.'; statusEl.className = 'bh-status-error'; return; }
      if (bhComputeHoras(inicio, fim) === null) { statusEl.textContent = 'Hora de início e hora de fim inválidas ou iguais.'; statusEl.className = 'bh-status-error'; return; }

      btn.disabled = true; statusEl.textContent = 'a submeter…'; statusEl.className = '';
      try {
        if (bhLojaColaboradoraAtual.loja === 'porto santo') {
          await bhLojaSubmeterPortoSanto({ pessoa_id: bhLojaColaboradoraAtual.id, nome: bhLojaColaboradoraAtual.nome, tipo: tipo, data: data, hora_inicio: inicio, hora_fim: fim, nota: nota });
        } else {
          await bhLojaSubmeter({ colaboradora_id: bhLojaColaboradoraAtual.id, tipo: tipo, data: data, hora_inicio: inicio, hora_fim: fim, nota: nota });
        }
        statusEl.textContent = '✓ submetido — fica pendente até a administração aprovar.'; statusEl.className = 'bh-status-ok';
        document.getElementById('bh-loja-inicio').value = '';
        document.getElementById('bh-loja-fim').value = '';
        document.getElementById('bh-loja-nota').value = '';
        document.getElementById('bh-loja-preview').textContent = '—';
        await bhLojaRefreshConteudo();
      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message; statusEl.className = 'bh-status-error';
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('bh-loja-historico').addEventListener('click', function (e) {
      var cancelBtn = e.target.closest('.bh-btn-cancelar');
      if (!cancelBtn) return;
      if (!confirm('Cancelar este pedido pendente?')) return;
      var id = parseInt(cancelBtn.getAttribute('data-id'), 10);
      cancelBtn.disabled = true;
      var isPS = bhLojaColaboradoraAtual && bhLojaColaboradoraAtual.loja === 'porto santo';
      var acao = isPS ? bhLojaCancelarPendentePortoSanto(id) : bhLojaCancelarPendente(id);
      acao
        .then(bhLojaRefreshConteudo)
        .catch(function (err) { alert('Erro: ' + err.message); cancelBtn.disabled = false; });
    });
  }

  function bhRenderHistoricoRow(l) {
    var podeCancel = l.estado === 'pendente';
    return '<div class="bh-row" data-id="' + l.id + '">' +
      '<div class="bh-row-main">' +
        '<span class="bh-row-meta">' + bhFormatData(l.data) + '</span>' +
        bhTipoBadge(l.tipo) +
        bhEstadoBadge(l.estado) +
        '<span class="bh-row-meta">' + l.hora_inicio.slice(0, 5) + '–' + l.hora_fim.slice(0, 5) + ' · ' + bhFormatHoras(l.horas) + ' h</span>' +
      '</div>' +
      (podeCancel ? '<div class="bh-row-actions"><button class="bh-btn bh-btn-del bh-btn-cancelar" data-id="' + l.id + '">cancelar</button></div>' : '') +
    '</div>';
  }

  async function bhLojaRefreshConteudo() {
    if (!bhLojaColaboradoraAtual) return;
    var saldoCard = document.getElementById('bh-loja-saldo-card');
    var histEl = document.getElementById('bh-loja-historico');
    saldoCard.innerHTML = '<div class="bh-empty">a carregar…</div>';
    histEl.innerHTML = '<div class="bh-empty">a carregar…</div>';
    try {
      var isPS = bhLojaColaboradoraAtual.loja === 'porto santo';
      var saldoHoras, historico;
      if (isPS) {
        var bancoRes = await window.sbClient.from('gh_banco_horas').select('saldo').eq('pessoa_id', bhLojaColaboradoraAtual.id).maybeSingle();
        if (bancoRes.error) throw bancoRes.error;
        saldoHoras = (bancoRes.data && Number(bancoRes.data.saldo)) || 0;
        var pendRes = await window.sbClient.from('bh_ps_pendentes').select('*')
          .eq('pessoa_id', bhLojaColaboradoraAtual.id)
          .order('data', { ascending: false })
          .order('inserido_em', { ascending: false });
        if (pendRes.error) throw pendRes.error;
        historico = pendRes.data || [];
      } else {
        historico = await bhFetchLancamentos(bhLojaColaboradoraAtual.id);
        saldoHoras = historico.reduce(function (acc, l) {
          if (l.estado !== 'aceite') return acc;
          return acc + (l.tipo === 'credito' ? Number(l.horas) : -Number(l.horas));
        }, 0);
      }
      var saldo = bhFormatSaldo(saldoHoras);
      saldoCard.innerHTML = '<div class="bh-saldo-card">' +
        '<div class="bh-saldo-nome">' + bhEsc(bhLojaColaboradoraAtual.nome) + '</div>' +
        '<div class="bh-saldo-valor ' + saldo.classe + '">' + saldo.texto + '</div>' +
      '</div>';
      histEl.innerHTML = historico.length
        ? historico.map(bhRenderHistoricoRow).join('')
        : '<div class="bh-empty">ainda sem lançamentos.</div>';
    } catch (err) {
      saldoCard.innerHTML = '';
      histEl.innerHTML = '<div class="bh-error">' + bhEsc(err.message) + '</div>';
    }
  }

  async function bhLojaCarregarPicker() {
    var select = document.getElementById('bh-loja-nome-select');
    var loja = window._currentStoreGlobal;
    select.innerHTML = '<option value="">a carregar…</option>';
    try {
      var isPS = loja === 'porto santo';
      var ativas;
      if (isPS) {
        var pessoas = await bhFetchPessoasPortoSanto();
        ativas = pessoas.map(function (p) { return { id: p.id, nome: p.name }; });
      } else {
        var colaboradoras = await bhFetchColaboradoras(loja);
        ativas = colaboradoras.filter(function (c) { return c.ativo; });
      }
      select.innerHTML = '<option value="">— selecionar —</option>' + ativas.map(function (c) {
        return '<option value="' + bhEsc(String(c.id)) + '" data-nome="' + bhEsc(c.nome) + '">' + bhEsc(c.nome) + '</option>';
      }).join('');

      var guardado = null;
      try { guardado = localStorage.getItem('bh_colab_id_' + loja); } catch (e) {}
      var nomeAtualLower = (window._currentEmployeeName || '').trim().toLowerCase();
      var match = null;
      if (guardado && ativas.some(function (c) { return String(c.id) === guardado; })) {
        match = guardado;
      } else if (nomeAtualLower) {
        var porNome = ativas.find(function (c) { return c.nome.trim().toLowerCase() === nomeAtualLower; });
        if (porNome) match = String(porNome.id);
      }
      if (match) {
        select.value = match;
        select.dispatchEvent(new Event('change'));
      }
    } catch (err) {
      select.innerHTML = '<option value="">erro ao carregar</option>';
    }
  }

  window.openBancoHorasOverlay = function () {
    bhInjectStyles();
    var overlay = document.getElementById('banco-horas-overlay');
    if (!overlay) return;
    bhLojaInjectDOM();
    overlay.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('visible'); });
    });
    bhLojaCarregarPicker();
  };

  window.closeBancoHorasOverlay = function () {
    var overlay = document.getElementById('banco-horas-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(function () { overlay.classList.remove('open'); }, 460);
  };

})();
