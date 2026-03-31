// ══ FÉRIAS TAB ══
(function() {

  // ── ESTADO GLOBAL ──
  const BASE_YEAR = 2026;
  let currentYear = BASE_YEAR;

  // ── DATA BASE ──
  // Dados guardados por ano: chave = ano, valor = array de entradas
  const feriasDB = {};

  feriasDB[2026] = [
    // Porto Santo — Período 1
    { nome:'CARLA ALVES',        de:'12/03/2026', ate:'26/03/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',      de:'27/03/2026', ate:'13/04/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',         de:'29/04/2026', ate:'14/05/2026', loja:'Porto Santo' },
    { nome:'SANDRA MELIM',       de:'05/01/2026', ate:'25/01/2026', loja:'Porto Santo' },
    // Porto Santo — Período 2
    { nome:'SANDRA MELIM',       de:'14/09/2026', ate:'28/09/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',      de:'29/09/2026', ate:'14/10/2026', loja:'Porto Santo' },
    { nome:'CARLA ALVES',        de:'15/10/2026', ate:'29/10/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',         de:'30/10/2026', ate:'13/11/2026', loja:'Porto Santo' },
    // Funchal — Período 1
    { nome:'FERNANDA HENRIQUES', de:'05/01/2026', ate:'19/01/2026', loja:'Funchal' },
    { nome:'FERNANDA HENRIQUES', de:'20/01/2026', ate:'03/02/2026', loja:'Funchal' },
    { nome:'CRISTINA TEIXEIRA',  de:'04/02/2026', ate:'18/02/2026', loja:'Funchal' },
    { nome:'JOANA BAPTISTA',     de:'19/02/2026', ate:'05/03/2026', loja:'Funchal' },
    { nome:'SANDRA NUNES',       de:'06/03/2026', ate:'20/03/2026', loja:'Funchal' },
    { nome:'FILIPA RODRIGUES',   de:'23/03/2026', ate:'08/04/2026', loja:'Funchal' },
    { nome:'CATIA TEMTEM',       de:'09/04/2026', ate:'23/04/2026', loja:'Funchal' },
    { nome:'DEBORA FERNANDES',   de:'24/04/2026', ate:'11/05/2026', loja:'Funchal' },
    { nome:'PATRICIA SILVA',     de:'12/05/2026', ate:'26/05/2026', loja:'Funchal' },
    { nome:'JACINTA ALVES',      de:'27/05/2026', ate:'12/06/2026', loja:'Funchal' },
    { nome:'ISALTINA FERNANDES', de:'15/06/2026', ate:'30/06/2026', loja:'Funchal' },
    // Funchal — Período 2
    { nome:'ALEJANDRA ABREU',    de:'02/07/2026', ate:'16/07/2026', loja:'Funchal' },
    { nome:'JOANA BAPTISTA',     de:'17/07/2026', ate:'31/07/2026', loja:'Funchal' },
    { nome:'DEBORA FERNANDES',   de:'03/08/2026', ate:'17/08/2026', loja:'Funchal' },
    { nome:'CRISTINA TEIXEIRA',  de:'18/08/2026', ate:'02/09/2026', loja:'Funchal' },
    { nome:'SANDRA NUNES',       de:'03/09/2026', ate:'17/09/2026', loja:'Funchal' },
    { nome:'ISALTINA FERNANDES', de:'18/09/2026', ate:'02/10/2026', loja:'Funchal' },
    { nome:'PATRICIA SILVA',     de:'06/10/2026', ate:'20/10/2026', loja:'Funchal' },
    { nome:'CATIA TEMTEM',       de:'21/10/2026', ate:'04/11/2026', loja:'Funchal' },
    { nome:'ALEJANDRA ABREU',    de:'05/11/2026', ate:'19/11/2026', loja:'Funchal' },
    { nome:'FILIPA RODRIGUES',   de:'03/08/2026', ate:'17/08/2026', loja:'Funchal' },
    { nome:'JACINTA ALVES',      de:'18/08/2026', ate:'02/09/2026', loja:'Funchal' },
  ];

  // Pessoas conhecidas (para o select de adicionar férias)
  const pessoasConhecidas = new Set(feriasDB[2026].map(function(f){ return f.nome; }));

  // ── HELPERS ──
  function parseDate(str) {
    const p = str.split('/');
    return new Date(+p[2], +p[1]-1, +p[0]);
  }
  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }
  function pad2(n) { return String(n).padStart(2,'0'); }
  function toDateStr(date) {
    return pad2(date.getDate())+'/'+pad2(date.getMonth()+1)+'/'+date.getFullYear();
  }
  function getFerias(year) { return feriasDB[year] || []; }
  function getPessoas() {
    const all = new Set(pessoasConhecidas);
    Object.values(feriasDB).forEach(function(arr){
      arr.forEach(function(f){ all.add(f.nome); });
    });
    return Array.from(all).sort();
  }
  function getLojas() {
    const all = new Set();
    Object.values(feriasDB).forEach(function(arr){
      arr.forEach(function(f){ if(f.loja) all.add(f.loja); });
    });
    return Array.from(all).sort();
  }

  // ── MODAL: ADICIONAR FÉRIAS ──
  function openModalFerias(preNome) {
    closeModal();
    const pessoas  = getPessoas();
    const lojas    = getLojas();
    const year     = currentYear;
    const pessoaOpts = pessoas.map(function(p){
      return '<option value="'+p+'"'+(p===preNome?' selected':'')+'>'+p+'</option>';
    }).join('');
    const lojaOpts = lojas.map(function(l){
      return '<option value="'+l+'">'+l+'</option>';
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    modal.innerHTML =
      '<div style="background:#1e1e1e;border-radius:14px;padding:28px 24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#fff">➕ Adicionar Férias '+year+'</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'

      +'<label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Pessoa</label>'
      +'<select id="f-inp-pessoa" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 12px;font-size:.88rem;margin-bottom:14px;outline:none">'
      +'<option value="">— selecionar pessoa —</option>'
      +pessoaOpts
      +'<option value="__nova__">+ Nova pessoa…</option>'
      +'</select>'

      +'<div id="f-nova-pessoa-wrap" style="display:none;margin-bottom:14px">'
      +'<label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Nome da nova pessoa</label>'
      +'<input id="f-inp-nova-pessoa" type="text" placeholder="NOME APELIDO" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 12px;font-size:.88rem;box-sizing:border-box;outline:none;text-transform:uppercase">'
      +'</div>'

      +'<label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Loja</label>'
      +'<select id="f-inp-loja" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 12px;font-size:.88rem;margin-bottom:14px;outline:none">'
      +'<option value="">— selecionar loja —</option>'
      +lojaOpts
      +'<option value="__nova__">+ Nova loja…</option>'
      +'</select>'

      +'<div id="f-nova-loja-wrap" style="display:none;margin-bottom:14px">'
      +'<label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Nome da nova loja</label>'
      +'<input id="f-inp-nova-loja" type="text" placeholder="Nome da loja" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 12px;font-size:.88rem;box-sizing:border-box;outline:none">'
      +'</div>'

      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">'
      +'<div><label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">De</label>'
      +'<input id="f-inp-de" type="date" value="'+year+'-01-01" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 10px;font-size:.85rem;box-sizing:border-box;outline:none"></div>'
      +'<div><label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Até</label>'
      +'<input id="f-inp-ate" type="date" value="'+year+'-01-15" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 10px;font-size:.85rem;box-sizing:border-box;outline:none"></div>'
      +'</div>'

      +'<div id="f-modal-error" style="display:none;color:#e05;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<button id="f-modal-save" style="width:100%;background:#2a8a2a;color:#fff;border:none;border-radius:9px;padding:11px;font-size:.9rem;font-weight:700;cursor:pointer">Guardar</button>'
      +'</div>';

    document.body.appendChild(modal);

    document.getElementById('f-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });

    document.getElementById('f-inp-pessoa').addEventListener('change', function(){
      document.getElementById('f-nova-pessoa-wrap').style.display = this.value==='__nova__' ? 'block' : 'none';
    });
    document.getElementById('f-inp-loja').addEventListener('change', function(){
      document.getElementById('f-nova-loja-wrap').style.display = this.value==='__nova__' ? 'block' : 'none';
    });

    document.getElementById('f-modal-save').addEventListener('click', function(){
      const errEl = document.getElementById('f-modal-error');
      errEl.style.display = 'none';

      let pessoaSel = document.getElementById('f-inp-pessoa').value;
      if (pessoaSel === '__nova__') pessoaSel = (document.getElementById('f-inp-nova-pessoa').value||'').trim().toUpperCase();
      if (!pessoaSel) { errEl.textContent='⚠ Seleciona ou insere uma pessoa.'; errEl.style.display='block'; return; }

      let lojaSel = document.getElementById('f-inp-loja').value;
      if (lojaSel === '__nova__') lojaSel = (document.getElementById('f-inp-nova-loja').value||'').trim();
      if (!lojaSel) { errEl.textContent='⚠ Seleciona ou insere uma loja.'; errEl.style.display='block'; return; }

      const deVal = document.getElementById('f-inp-de').value;
      const ateVal = document.getElementById('f-inp-ate').value;
      if (!deVal||!ateVal) { errEl.textContent='⚠ Preenche as datas.'; errEl.style.display='block'; return; }

      const deDate  = new Date(deVal);
      const ateDate = new Date(ateVal);
      if (ateDate < deDate) { errEl.textContent='⚠ A data final não pode ser anterior à inicial.'; errEl.style.display='block'; return; }

      const deStr  = toDateStr(deDate);
      const ateStr = toDateStr(ateDate);
      const entryYear = deDate.getFullYear();

      if (!feriasDB[entryYear]) feriasDB[entryYear] = [];
      feriasDB[entryYear].push({ nome: pessoaSel, de: deStr, ate: ateStr, loja: lojaSel });
      pessoasConhecidas.add(pessoaSel);

      if (entryYear !== currentYear) currentYear = entryYear;
      closeModal();
      renderFerias();
    });
  }

  // ── MODAL: ADICIONAR PESSOA ──
  function openModalPessoa() {
    closeModal();
    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    modal.innerHTML =
      '<div style="background:#1e1e1e;border-radius:14px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#fff">👤 Nova Pessoa</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'
      +'<label style="display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Nome completo</label>'
      +'<input id="f-inp-pessoa-nome" type="text" placeholder="NOME APELIDO" style="width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:10px 12px;font-size:.9rem;box-sizing:border-box;outline:none;text-transform:uppercase;margin-bottom:20px">'
      +'<div id="f-modal-error" style="display:none;color:#e05;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      +'<button id="f-pessoa-save-only" style="background:#333;color:#fff;border:none;border-radius:9px;padding:10px;font-size:.85rem;font-weight:600;cursor:pointer">Guardar</button>'
      +'<button id="f-pessoa-save-ferias" style="background:#2a8a2a;color:#fff;border:none;border-radius:9px;padding:10px;font-size:.85rem;font-weight:700;cursor:pointer">Guardar + Férias</button>'
      +'</div>'
      +'</div>';

    document.body.appendChild(modal);

    document.getElementById('f-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });

    function getNome() {
      return (document.getElementById('f-inp-pessoa-nome').value||'').trim().toUpperCase();
    }

    document.getElementById('f-pessoa-save-only').addEventListener('click', function(){
      const nome = getNome();
      const errEl = document.getElementById('f-modal-error');
      if (!nome) { errEl.textContent='⚠ Insere um nome.'; errEl.style.display='block'; return; }
      pessoasConhecidas.add(nome);
      closeModal();
    });

    document.getElementById('f-pessoa-save-ferias').addEventListener('click', function(){
      const nome = getNome();
      const errEl = document.getElementById('f-modal-error');
      if (!nome) { errEl.textContent='⚠ Insere um nome.'; errEl.style.display='block'; return; }
      pessoasConhecidas.add(nome);
      closeModal();
      openModalFerias(nome);
    });
  }

  function closeModal() {
    const m = document.getElementById('f-modal-overlay');
    if (m) m.remove();
  }

  // ── RENDER PRINCIPAL ──
  function renderFerias() {
    const today = new Date();
    today.setHours(0,0,0,0);

    const area        = document.getElementById('f-area');
    const banner      = document.getElementById('f-today-banner');
    const bannerNames = document.getElementById('f-banner-names');
    if (!area) return;

    const FERIAS = getFerias(currentYear);
    const isCurrentYear = (currentYear === today.getFullYear());
    const isFutureYear  = (currentYear > today.getFullYear());

    // ── Header com título e navegação de ano ──
    let headerEl = document.getElementById('f-year-header');
    if (!headerEl) {
      headerEl = document.createElement('div');
      headerEl.id = 'f-year-header';
      headerEl.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:0 2px';
      area.parentNode.insertBefore(headerEl, area);
    }
    headerEl.innerHTML =
      '<span style="font-size:1.05rem;font-weight:800;color:#fff;letter-spacing:.03em">Férias '+currentYear+'</span>'
      +'<div style="display:flex;gap:8px;align-items:center">'
      +(currentYear > BASE_YEAR
        ? '<button id="f-btn-prev-year" style="background:#222;color:#ccc;border:1px solid #333;border-radius:7px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer">← '+(currentYear-1)+'</button>'
        : '')
      +'<button id="f-btn-next-year" style="background:#1a3a5c;color:#7ab8f5;border:1px solid #2a5a9c;border-radius:7px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer">'+(currentYear+1)+' →</button>'
      +'</div>';

    document.getElementById('f-btn-next-year').addEventListener('click', function(){
      currentYear++;
      renderFerias();
    });
    const prevBtn = document.getElementById('f-btn-prev-year');
    if (prevBtn) {
      prevBtn.addEventListener('click', function(){
        currentYear--;
        renderFerias();
      });
    }

    // ── Botões de ação ──
    let actionsEl = document.getElementById('f-actions');
    if (!actionsEl) {
      actionsEl = document.createElement('div');
      actionsEl.id = 'f-actions';
      actionsEl.style.cssText='display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap';
      area.parentNode.insertBefore(actionsEl, area);
    }
    actionsEl.innerHTML =
      '<button id="f-btn-add-ferias" style="background:#1e3a1e;color:#4caf50;border:1px solid #2e6a2e;border-radius:8px;padding:7px 14px;font-size:.8rem;font-weight:700;cursor:pointer;letter-spacing:.03em">＋ Férias</button>'
      +'<button id="f-btn-add-pessoa" style="background:#1e2a3a;color:#7ab8f5;border:1px solid #2a4a7a;border-radius:8px;padding:7px 14px;font-size:.8rem;font-weight:700;cursor:pointer;letter-spacing:.03em">＋ Pessoa</button>';

    document.getElementById('f-btn-add-ferias').addEventListener('click', openModalFerias);
    document.getElementById('f-btn-add-pessoa').addEventListener('click', openModalPessoa);

    // ── Classificar entradas ──
    const enriched = FERIAS.map(function(f) {
      const de  = parseDate(f.de);
      const ate = parseDate(f.ate);
      ate.setHours(23,59,59,999);
      let status, days;
      if (isCurrentYear) {
        if (today >= de && today <= ate) {
          status = 'active'; days = daysBetween(today, ate);
        } else if (de > today) {
          status = 'upcoming'; days = daysBetween(today, de);
        } else {
          status = 'past'; days = daysBetween(ate, today);
        }
      } else if (isFutureYear) {
        status = 'upcoming'; days = daysBetween(today, de);
      } else {
        status = 'past'; days = daysBetween(ate, today);
      }
      return Object.assign({}, f, { de, ate, status, days });
    });

    // ── Banner "de férias agora" ──
    if (banner) {
      const activeNow = enriched.filter(function(f){ return f.status==='active'; });
      if (activeNow.length && isCurrentYear) {
        const unique = [...new Set(activeNow.map(function(f){ return f.nome; }))];
        if (bannerNames) bannerNames.textContent = unique.join(' · ');
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
    }

    // ── Helpers de renderização ──
    function fmtDays(n, status) {
      if (status==='active')   return n===0 ? 'último dia' : 'termina em '+n+'d';
      if (status==='upcoming') return n===1 ? 'amanhã' : 'em '+n+' dias';
      if (status==='past')     return 'há '+n+' dias';
      return '';
    }

    function cardHTML(f) {
      const dotColor = f.status==='active' ? '#2a8a2a' : f.status==='upcoming' ? '#e09000' : '#555';
      const badgeCls = f.status==='active' ? 'active-now' : f.status==='upcoming' ? 'soon' : 'past';
      const lojaTag  = f.loja ? '<span style="font-size:.65rem;font-weight:600;color:#bbb;margin-left:6px;text-transform:lowercase;letter-spacing:.04em">'+f.loja+'</span>' : '';
      const deStr    = f.de.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const ateStr   = f.ate.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const badge    = isCurrentYear ? '<span class="f-badge '+badgeCls+'">'+fmtDays(f.days, f.status)+'</span>' : '';
      return '<div class="f-card">'
        +'<span class="f-dot" style="background:'+dotColor+'"></span>'
        +'<span class="f-name">'+f.nome+lojaTag+'</span>'
        +'<span class="f-dates">'+deStr+'&nbsp;→&nbsp;'+ateStr+'</span>'
        +badge
        +'</div>';
    }

    // ── Montar HTML ──
    let html = '';

    if (!isCurrentYear) {
      // Anos passados ou futuros: lista simples ordenada por data
      const sorted = [...enriched].sort(function(a,b){ return a.de-b.de; });
      const icon   = isFutureYear ? '📅' : '📁';
      if (sorted.length) {
        html += '<div class="f-section"><div class="f-section-title">'+icon+' calendário '+currentYear+'</div>';
        html += sorted.map(cardHTML).join('');
        html += '</div>';
      }
    } else {
      // Ano atual: lógica original com secções
      const activeNow = enriched.filter(function(f){ return f.status==='active'; });
      const upcoming  = enriched.filter(function(f){ return f.status==='upcoming'; })
                                .sort(function(a,b){ return a.de-b.de; });
      const recent    = enriched.filter(function(f){ return f.status==='past' && f.days<=30; })
                                .sort(function(a,b){ return a.days-b.days; });

      if (activeNow.length) {
        html += '<div class="f-section"><div class="f-section-title">🟢 de férias agora</div>';
        html += activeNow.map(cardHTML).join('');
        html += '</div>';
      }
      if (upcoming.length) {
        const next7  = upcoming.filter(function(f){ return f.days<=7; });
        const next30 = upcoming.filter(function(f){ return f.days>7 && f.days<=30; });
        const later  = upcoming.filter(function(f){ return f.days>30; });
        if (next7.length) {
          html += '<div class="f-section"><div class="f-section-title">🟡 esta semana</div>';
          html += next7.map(cardHTML).join(''); html += '</div>';
        }
        if (next30.length) {
          html += '<div class="f-section"><div class="f-section-title">próximos 30 dias</div>';
          html += next30.map(cardHTML).join(''); html += '</div>';
        }
        if (later.length) {
          html += '<div class="f-section"><div class="f-section-title">calendário</div>';
          html += later.map(cardHTML).join(''); html += '</div>';
        }
      }
      if (recent.length) {
        html += '<div class="f-section"><div class="f-section-title">regressaram recentemente</div>';
        html += recent.map(cardHTML).join(''); html += '</div>';
      }
    }

    if (!html) {
      html = '<div style="text-align:center;color:#aaa;font-size:.85rem;font-weight:600;padding:40px 0">nenhuma férias registada para '+currentYear+'</div>';
    }

    area.innerHTML = html;
  }

  // ── TAB LISTENER ──
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.dataset.tab === 'ferias') renderFerias();
    });
  });

  // ── AUTO-REFRESH ──
  setInterval(function() {
    const active = document.querySelector('.tab-btn[data-tab="ferias"].active');
    if (active) renderFerias();
  }, 3600000);

})();
