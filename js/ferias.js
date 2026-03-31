// ══ FÉRIAS TAB ══
(function() {

  // ── ESTADO GLOBAL ──
  const BASE_YEAR = 2026;
  let currentYear = BASE_YEAR;
  let filterLoja  = '';      // '' = todas as lojas
  let viewPessoa  = '';      // '' = vista normal, nome = vista por pessoa

  // ── DATA BASE ──
  const feriasDB = {};
  feriasDB[2026] = [
    { nome:'CARLA ALVES',        de:'12/03/2026', ate:'26/03/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',      de:'27/03/2026', ate:'13/04/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',         de:'29/04/2026', ate:'14/05/2026', loja:'Porto Santo' },
    { nome:'SANDRA MELIM',       de:'05/01/2026', ate:'25/01/2026', loja:'Porto Santo' },
    { nome:'SANDRA MELIM',       de:'14/09/2026', ate:'28/09/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',      de:'29/09/2026', ate:'14/10/2026', loja:'Porto Santo' },
    { nome:'CARLA ALVES',        de:'15/10/2026', ate:'29/10/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',         de:'30/10/2026', ate:'13/11/2026', loja:'Porto Santo' },
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

  const pessoasConhecidas = new Set(feriasDB[2026].map(function(f){ return f.nome; }));

  // ── HELPERS ──
  function parseDate(str) {
    const p = str.split('/');
    return new Date(+p[2], +p[1]-1, +p[0]);
  }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
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

  // Dias de férias duma pessoa num ano
  function diasFerias(nome, year) {
    return (feriasDB[year] || [])
      .filter(function(f){ return f.nome === nome; })
      .reduce(function(acc, f){
        return acc + daysBetween(parseDate(f.de), parseDate(f.ate)) + 1;
      }, 0);
  }

  // Detectar solapamentos na mesma loja
  function getSolapamentos(year) {
    const entries = (feriasDB[year] || []).map(function(f){
      return Object.assign({}, f, { deD: parseDate(f.de), ateD: parseDate(f.ate) });
    });
    const overlaps = [];
    for (let i=0; i<entries.length; i++) {
      for (let j=i+1; j<entries.length; j++) {
        const a = entries[i], b = entries[j];
        if (a.loja !== b.loja) continue;
        if (a.nome === b.nome) continue;
        if (a.deD <= b.ateD && b.deD <= a.ateD) {
          overlaps.push({ a, b });
        }
      }
    }
    return overlaps;
  }

  // ── TOAST ──
  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 22px;border-radius:10px;font-size:.84rem;font-weight:600;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .2s';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.style.opacity='1'; });
    setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove(); }, 250); }, 2500);
  }

  // ── BTN STYLE ──
  const BTN = 'background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:7px 18px;font-size:.82rem;font-weight:700;cursor:pointer;letter-spacing:.02em';
  const BTN_ACTIVE = 'background:#111;color:#fff;border:1px solid #111;border-radius:8px;padding:7px 18px;font-size:.82rem;font-weight:700;cursor:pointer;letter-spacing:.02em';

  // ── MODAL: ADICIONAR / EDITAR FÉRIAS ──
  function openModalFerias(preNome, editEntry, editYear, editIdx) {
    closeModal();
    const pessoas   = getPessoas();
    const lojas     = getLojas();
    const year      = editYear || currentYear;
    const isEdit    = !!editEntry;
    const pessoaOpts = pessoas.map(function(p){
      const sel = (isEdit ? p===editEntry.nome : p===preNome) ? ' selected' : '';
      return '<option value="'+p+'"'+sel+'>'+p+'</option>';
    }).join('');
    const lojaOpts = lojas.map(function(l){
      const sel = isEdit && l===editEntry.loja ? ' selected' : '';
      return '<option value="'+l+'"'+sel+'>'+l+'</option>';
    }).join('');

    // Default dates
    let defDe  = year+'-01-01';
    let defAte = year+'-01-15';
    if (isEdit) {
      const dp = editEntry.de.split('/');
      const ap = editEntry.ate.split('/');
      defDe  = dp[2]+'-'+dp[1]+'-'+dp[0];
      defAte = ap[2]+'-'+ap[1]+'-'+ap[0];
    }

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';

    const LS = 'display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px';
    const IS = 'width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:9px 12px;font-size:.88rem;box-sizing:border-box;outline:none';

    modal.innerHTML =
      '<div style="background:#1e1e1e;border-radius:14px;padding:28px 24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#fff">'+(isEdit?'✏️ Editar':'➕ Adicionar')+' Férias '+year+'</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'

      +'<label style="'+LS+'">Pessoa</label>'
      +'<select id="f-inp-pessoa" style="'+IS+';margin-bottom:14px">'
      +'<option value="">— selecionar pessoa —</option>'+pessoaOpts
      +'<option value="__nova__">+ Nova pessoa…</option>'
      +'</select>'

      +'<div id="f-nova-pessoa-wrap" style="display:none;margin-bottom:14px">'
      +'<label style="'+LS+'">Nome da nova pessoa</label>'
      +'<input id="f-inp-nova-pessoa" type="text" placeholder="NOME APELIDO" style="'+IS+';text-transform:uppercase">'
      +'</div>'

      +'<label style="'+LS+'">Loja</label>'
      +'<select id="f-inp-loja" style="'+IS+';margin-bottom:14px">'
      +'<option value="">— selecionar loja —</option>'+lojaOpts
      +'<option value="__nova__">+ Nova loja…</option>'
      +'</select>'

      +'<div id="f-nova-loja-wrap" style="display:none;margin-bottom:14px">'
      +'<label style="'+LS+'">Nome da nova loja</label>'
      +'<input id="f-inp-nova-loja" type="text" placeholder="Nome da loja" style="'+IS+'">'
      +'</div>'

      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">'
      +'<div><label style="'+LS+'">De</label>'
      +'<input id="f-inp-de" type="date" value="'+defDe+'" style="'+IS+'"></div>'
      +'<div><label style="'+LS+'">Até</label>'
      +'<input id="f-inp-ate" type="date" value="'+defAte+'" style="'+IS+'"></div>'
      +'</div>'

      +'<div id="f-modal-error" style="display:none;color:#f55;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<div style="display:flex;gap:10px">'
      +(isEdit ? '<button id="f-modal-delete" style="flex:0 0 auto;background:#3a1a1a;color:#f55;border:1px solid #5a2a2a;border-radius:9px;padding:11px 16px;font-size:.85rem;font-weight:700;cursor:pointer">🗑</button>' : '')
      +'<button id="f-modal-save" style="flex:1;background:#fff;color:#111;border:1px solid #ccc;border-radius:9px;padding:11px;font-size:.9rem;font-weight:700;cursor:pointer">'+(isEdit?'Guardar alterações':'Guardar')+'</button>'
      +'</div>'
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

    if (isEdit) {
      document.getElementById('f-modal-delete').addEventListener('click', function(){
        if (!confirm('Eliminar esta entrada de férias?')) return;
        feriasDB[editYear].splice(editIdx, 1);
        closeModal();
        showToast('🗑 Férias eliminadas');
        renderFerias();
      });
    }

    document.getElementById('f-modal-save').addEventListener('click', function(){
      const errEl = document.getElementById('f-modal-error');
      errEl.style.display = 'none';

      let pessoaSel = document.getElementById('f-inp-pessoa').value;
      if (pessoaSel === '__nova__') pessoaSel = (document.getElementById('f-inp-nova-pessoa').value||'').trim().toUpperCase();
      if (!pessoaSel) { errEl.textContent='⚠ Seleciona ou insere uma pessoa.'; errEl.style.display='block'; return; }

      let lojaSel = document.getElementById('f-inp-loja').value;
      if (lojaSel === '__nova__') lojaSel = (document.getElementById('f-inp-nova-loja').value||'').trim();
      if (!lojaSel) { errEl.textContent='⚠ Seleciona ou insere uma loja.'; errEl.style.display='block'; return; }

      const deVal  = document.getElementById('f-inp-de').value;
      const ateVal = document.getElementById('f-inp-ate').value;
      if (!deVal||!ateVal) { errEl.textContent='⚠ Preenche as datas.'; errEl.style.display='block'; return; }

      const deDate  = new Date(deVal);
      const ateDate = new Date(ateVal);
      if (ateDate < deDate) { errEl.textContent='⚠ A data final não pode ser anterior à inicial.'; errEl.style.display='block'; return; }

      const deStr  = toDateStr(deDate);
      const ateStr = toDateStr(ateDate);
      const entryYear = deDate.getFullYear();

      if (!feriasDB[entryYear]) feriasDB[entryYear] = [];

      if (isEdit) {
        // Remove old (may be different year)
        feriasDB[editYear].splice(editIdx, 1);
        feriasDB[entryYear].push({ nome: pessoaSel, de: deStr, ate: ateStr, loja: lojaSel });
        showToast('✅ Férias atualizadas');
      } else {
        feriasDB[entryYear].push({ nome: pessoaSel, de: deStr, ate: ateStr, loja: lojaSel });
        showToast('✅ Férias guardadas');
      }

      pessoasConhecidas.add(pessoaSel);
      if (entryYear !== currentYear) currentYear = entryYear;
      closeModal();
      renderFerias();
    });
  }

  // ── MODAL: ADICIONAR PESSOA ──
  function openModalPessoa() {
    closeModal();
    const LS = 'display:block;font-size:.72rem;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px';
    const IS = 'width:100%;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:10px 12px;font-size:.9rem;box-sizing:border-box;outline:none;text-transform:uppercase;margin-bottom:20px';

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    modal.innerHTML =
      '<div style="background:#1e1e1e;border-radius:14px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#fff">👤 Nova Pessoa</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'
      +'<label style="'+LS+'">Nome completo</label>'
      +'<input id="f-inp-pessoa-nome" type="text" placeholder="NOME APELIDO" style="'+IS+'">'
      +'<div id="f-modal-error" style="display:none;color:#f55;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      +'<button id="f-pessoa-save-only" style="'+BTN+'">Guardar</button>'
      +'<button id="f-pessoa-save-ferias" style="background:#fff;color:#111;border:2px solid #111;border-radius:8px;padding:7px 18px;font-size:.82rem;font-weight:700;cursor:pointer">Guardar + Férias</button>'
      +'</div>'
      +'</div>';

    document.body.appendChild(modal);
    document.getElementById('f-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });

    function getNome() { return (document.getElementById('f-inp-pessoa-nome').value||'').trim().toUpperCase(); }

    document.getElementById('f-pessoa-save-only').addEventListener('click', function(){
      const nome = getNome();
      const errEl = document.getElementById('f-modal-error');
      if (!nome) { errEl.textContent='⚠ Insere um nome.'; errEl.style.display='block'; return; }
      pessoasConhecidas.add(nome);
      closeModal();
      showToast('✅ Pessoa adicionada');
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

  // ── MODAL: VISTA POR PESSOA ──
  function openModalPessoaView(nome) {
    closeModal();
    const allYears = Object.keys(feriasDB).map(Number).sort();
    let html = '';
    allYears.forEach(function(yr){
      const entries = (feriasDB[yr]||[]).filter(function(f){ return f.nome===nome; });
      if (!entries.length) return;
      const total = entries.reduce(function(acc,f){
        return acc + daysBetween(parseDate(f.de), parseDate(f.ate)) + 1;
      }, 0);
      html += '<div style="margin-bottom:16px">'
        +'<div style="font-size:.75rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">'+yr+' · '+total+' dias</div>';
      entries.sort(function(a,b){ return parseDate(a.de)-parseDate(b.de); }).forEach(function(f,i){
        const deD = parseDate(f.de), ateD = parseDate(f.ate);
        const dias = daysBetween(deD, ateD) + 1;
        const deStr = f.de.substring(0,5), ateStr = f.ate.substring(0,5);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #2a2a2a">'
          +'<span style="font-size:.82rem;color:#ddd">'+deStr+' → '+ateStr+'</span>'
          +'<span style="display:flex;align-items:center;gap:10px">'
          +'<span style="font-size:.75rem;color:#888">'+dias+'d · '+f.loja+'</span>'
          +'<button data-yr="'+yr+'" data-idx="'+i+'" class="fv-edit-btn" style="background:none;border:none;color:#888;cursor:pointer;font-size:.8rem;padding:2px 6px">✏️</button>'
          +'</span>'
          +'</div>';
      });
      html += '</div>';
    });
    if (!html) html = '<div style="color:#888;font-size:.85rem;text-align:center;padding:20px 0">Nenhuma férias registada</div>';

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    modal.innerHTML =
      '<div style="background:#1e1e1e;border-radius:14px;padding:28px 24px;width:100%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">'
      +'<span style="font-size:.95rem;font-weight:700;color:#fff">📋 '+nome+'</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'
      +html
      +'<button id="fv-add-btn" style="margin-top:16px;width:100%;'+BTN+'">＋ Adicionar Férias</button>'
      +'</div>';

    document.body.appendChild(modal);
    document.getElementById('f-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
    document.getElementById('fv-add-btn').addEventListener('click', function(){
      closeModal(); openModalFerias(nome);
    });

    // Edit buttons inside view
    modal.querySelectorAll('.fv-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const yr  = parseInt(btn.dataset.yr);
        const idx = parseInt(btn.dataset.idx);
        const sorted = (feriasDB[yr]||[])
          .filter(function(f){ return f.nome===nome; })
          .sort(function(a,b){ return parseDate(a.de)-parseDate(b.de); });
        // Find real index in feriasDB[yr]
        const realIdx = feriasDB[yr].indexOf(sorted[idx]);
        closeModal();
        openModalFerias(nome, feriasDB[yr][realIdx], yr, realIdx);
      });
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

    const isCurrentYear = (currentYear === today.getFullYear());
    const isFutureYear  = (currentYear > today.getFullYear());

    // ── Header: título + nav de ano ──
    let headerEl = document.getElementById('f-year-header');
    if (!headerEl) {
      headerEl = document.createElement('div');
      headerEl.id = 'f-year-header';
      headerEl.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 2px';
      area.parentNode.insertBefore(headerEl, area);
    }
    headerEl.innerHTML =
      '<span style="font-size:1.05rem;font-weight:800;color:#fff;letter-spacing:.03em">Férias '+currentYear+'</span>'
      +'<div style="display:flex;gap:8px;align-items:center">'
      +(currentYear > BASE_YEAR
        ? '<button id="f-btn-prev-year" style="'+BTN+'">← '+(currentYear-1)+'</button>'
        : '')
      +'<button id="f-btn-next-year" style="'+BTN+'">'+(currentYear+1)+' →</button>'
      +'</div>';

    document.getElementById('f-btn-next-year').addEventListener('click', function(){ currentYear++; renderFerias(); });
    const prevBtn = document.getElementById('f-btn-prev-year');
    if (prevBtn) prevBtn.addEventListener('click', function(){ currentYear--; renderFerias(); });

    // ── Barra de ações: botões + filtro loja ──
    let actionsEl = document.getElementById('f-actions');
    if (!actionsEl) {
      actionsEl = document.createElement('div');
      actionsEl.id = 'f-actions';
      actionsEl.style.cssText='display:flex;gap:14px;margin-bottom:12px;flex-wrap:wrap;align-items:center';
      area.parentNode.insertBefore(actionsEl, area);
    }

    const lojas = getLojas();
    const lojaFilterOpts = '<option value="">Todas as lojas</option>'
      + lojas.map(function(l){
          return '<option value="'+l+'"'+(filterLoja===l?' selected':'')+'>'+l+'</option>';
        }).join('');

    actionsEl.innerHTML =
      '<button id="f-btn-add-ferias" style="'+BTN+'">＋ Férias</button>'
      +'<button id="f-btn-add-pessoa" style="'+BTN+'">＋ Pessoa</button>'
      +'<select id="f-filter-loja" style="background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:7px 12px;font-size:.82rem;font-weight:600;cursor:pointer;outline:none">'+lojaFilterOpts+'</select>';

    document.getElementById('f-btn-add-ferias').addEventListener('click', function(){ openModalFerias(); });
    document.getElementById('f-btn-add-pessoa').addEventListener('click', openModalPessoa);
    document.getElementById('f-filter-loja').addEventListener('change', function(){
      filterLoja = this.value;
      renderFerias();
    });

    // ── Alertas de solapamento ──
    let alertEl = document.getElementById('f-overlap-alert');
    if (!alertEl) {
      alertEl = document.createElement('div');
      alertEl.id = 'f-overlap-alert';
      area.parentNode.insertBefore(alertEl, area);
    }
    const overlaps = getSolapamentos(currentYear);
    const filteredOverlaps = filterLoja
      ? overlaps.filter(function(o){ return o.a.loja === filterLoja; })
      : overlaps;
    if (filteredOverlaps.length) {
      let ohtml = '<div style="background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.78rem;color:#111;font-weight:600">'
        +'⚠️ Solapamentos detetados:<br>';
      filteredOverlaps.forEach(function(o){
        ohtml += '<span style="font-weight:400;color:#444">'+o.a.nome+' &amp; '+o.b.nome+' ('+o.a.loja+') — '
          +o.a.de.substring(0,5)+' a '+o.a.ate.substring(0,5)+' / '+o.b.de.substring(0,5)+' a '+o.b.ate.substring(0,5)+'</span><br>';
      });
      ohtml += '</div>';
      alertEl.innerHTML = ohtml;
    } else {
      alertEl.innerHTML = '';
    }

    // ── Classificar entradas ──
    let FERIAS = getFerias(currentYear);
    if (filterLoja) FERIAS = FERIAS.filter(function(f){ return f.loja === filterLoja; });

    const enriched = FERIAS.map(function(f) {
      const de  = parseDate(f.de);
      const ate = parseDate(f.ate);
      ate.setHours(23,59,59,999);
      let status, days;
      if (isCurrentYear) {
        if (today >= de && today <= ate) { status='active';   days=daysBetween(today, ate); }
        else if (de > today)             { status='upcoming'; days=daysBetween(today, de);  }
        else                             { status='past';     days=daysBetween(ate, today); }
      } else if (isFutureYear) {
        status='upcoming'; days=daysBetween(today, de);
      } else {
        status='past'; days=daysBetween(ate, today);
      }
      return Object.assign({}, f, { de, ate, status, days });
    });

    // ── Banner ──
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

    // ── Card builder ──
    function fmtDays(n, status) {
      if (status==='active')   return n===0 ? 'último dia' : 'termina em '+n+'d';
      if (status==='upcoming') return n===1 ? 'amanhã' : 'em '+n+' dias';
      if (status==='past')     return 'há '+n+' dias';
      return '';
    }

    function cardHTML(f, realYear, realIdx) {
      const dotColor = f.status==='active' ? '#2a8a2a' : f.status==='upcoming' ? '#e09000' : '#555';
      const badgeCls = f.status==='active' ? 'active-now' : f.status==='upcoming' ? 'soon' : 'past';
      const lojaTag  = f.loja ? '<span style="font-size:.65rem;font-weight:600;color:#bbb;margin-left:6px;text-transform:lowercase;letter-spacing:.04em">'+f.loja+'</span>' : '';
      const deStr    = f.de.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const ateStr   = f.ate.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const badge    = isCurrentYear ? '<span class="f-badge '+badgeCls+'">'+fmtDays(f.days, f.status)+'</span>' : '';
      const dias     = daysBetween(f.de instanceof Date ? f.de : parseDate(f.de),
                                   f.ate instanceof Date ? f.ate : parseDate(f.ate)) + 1;
      const diasTag  = '<span style="font-size:.68rem;color:#777;margin-left:4px">'+dias+'d</span>';
      const editBtn  = '<button class="f-edit-card-btn" data-yr="'+(realYear||currentYear)+'" data-idx="'+(realIdx||0)+'" '
        +'style="margin-left:auto;background:none;border:none;color:#555;cursor:pointer;font-size:.78rem;padding:0 4px;flex-shrink:0">✏️</button>';
      const nameBtn  = '<button class="f-view-pessoa-btn" data-nome="'+f.nome+'" '
        +'style="background:none;border:none;color:inherit;cursor:pointer;font-size:inherit;font-weight:inherit;font-family:inherit;padding:0;text-align:left">'+f.nome+'</button>';
      return '<div class="f-card" style="display:flex;align-items:center;gap:0">'
        +'<span class="f-dot" style="background:'+dotColor+'"></span>'
        +'<span class="f-name">'+nameBtn+lojaTag+diasTag+'</span>'
        +'<span class="f-dates">'+deStr+'&nbsp;→&nbsp;'+ateStr+'</span>'
        +badge
        +editBtn
        +'</div>';
    }

    // Próximo a ir (mesmo sem ser esta semana) — destaque especial
    const upcoming_all = enriched.filter(function(f){ return f.status==='upcoming'; })
                                  .sort(function(a,b){ return a.de-b.de; });
    const nextUp = upcoming_all[0] || null;

    // ── Montar HTML ──
    let html = '';

    // Bloco "próximo a ir" só no ano atual
    if (isCurrentYear && nextUp && nextUp.days > 7) {
      html += '<div style="background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.82rem;color:#111;font-weight:600">'
        +'🏖 Próximo: <strong>'+nextUp.nome+'</strong> ('+nextUp.loja+') — em '+nextUp.days+' dias'
        +'</div>';
    }

    if (!isCurrentYear) {
      const sorted = [...enriched].sort(function(a,b){ return a.de-b.de; });
      if (sorted.length) {
        const icon = isFutureYear ? '📅' : '📁';
        html += '<div class="f-section"><div class="f-section-title">'+icon+' calendário '+currentYear+'</div>';
        sorted.forEach(function(f){
          const realIdx = feriasDB[currentYear] ? feriasDB[currentYear].indexOf(
            feriasDB[currentYear].find(function(r){ return r.nome===f.nome && r.de===toDateStr(f.de) && r.ate===toDateStr(f.ate); })
          ) : 0;
          html += cardHTML(f, currentYear, realIdx);
        });
        html += '</div>';
      }
    } else {
      const activeNow = enriched.filter(function(f){ return f.status==='active'; });
      const upcoming  = enriched.filter(function(f){ return f.status==='upcoming'; })
                                .sort(function(a,b){ return a.de-b.de; });
      const recent    = enriched.filter(function(f){ return f.status==='past' && f.days<=30; })
                                .sort(function(a,b){ return a.days-b.days; });

      function renderSection(title, arr) {
        if (!arr.length) return '';
        let s = '<div class="f-section"><div class="f-section-title">'+title+'</div>';
        arr.forEach(function(f){
          const orig = (feriasDB[currentYear]||[]).find(function(r){
            return r.nome===f.nome && r.de===toDateStr(f.de) && r.ate===toDateStr(f.ate);
          });
          const realIdx = orig ? feriasDB[currentYear].indexOf(orig) : 0;
          s += cardHTML(f, currentYear, realIdx);
        });
        return s + '</div>';
      }

      if (activeNow.length) html += renderSection('🟢 de férias agora', activeNow);
      if (upcoming.length) {
        const next7  = upcoming.filter(function(f){ return f.days<=7; });
        const next30 = upcoming.filter(function(f){ return f.days>7 && f.days<=30; });
        const later  = upcoming.filter(function(f){ return f.days>30; });
        html += renderSection('🟡 esta semana', next7);
        html += renderSection('próximos 30 dias', next30);
        html += renderSection('calendário', later);
      }
      html += renderSection('regressaram recentemente', recent);
    }

    // ── Resumo por pessoa ──
    const pessoas = getPessoas();
    const pessoasNoAno = pessoas.filter(function(p){
      return (feriasDB[currentYear]||[]).some(function(f){ return f.nome===p; });
    });
    if (pessoasNoAno.length) {
      html += '<div class="f-section"><div class="f-section-title" style="margin-bottom:8px">📊 resumo '+currentYear+'</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
      pessoasNoAno.forEach(function(p){
        const total = diasFerias(p, currentYear);
        html += '<button class="f-view-pessoa-btn" data-nome="'+p+'" style="background:#fff;border:1px solid #ccc;border-radius:8px;padding:6px 12px;cursor:pointer;text-align:left">'
          +'<span style="display:block;font-size:.75rem;font-weight:700;color:#111">'+p+'</span>'
          +'<span style="font-size:.68rem;color:#555">'+total+' dias</span>'
          +'</button>';
      });
      html += '</div></div>';
    }

    if (!html) {
      html = '<div style="text-align:center;color:#aaa;font-size:.85rem;font-weight:600;padding:40px 0">nenhuma férias registada para '+currentYear+'</div>';
    }

    area.innerHTML = html;

    // ── Wiring dos botões nos cards ──
    area.querySelectorAll('.f-edit-card-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const yr  = parseInt(btn.dataset.yr);
        const idx = parseInt(btn.dataset.idx);
        if (feriasDB[yr] && feriasDB[yr][idx]) {
          openModalFerias(null, feriasDB[yr][idx], yr, idx);
        }
      });
    });

    area.querySelectorAll('.f-view-pessoa-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        openModalPessoaView(btn.dataset.nome);
      });
    });
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
