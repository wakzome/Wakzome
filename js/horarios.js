// ══════════════════════════════════════════════════════════════
//  HORARIOS — ficheiro fundido (férias + gerador de horários + banco de horas)
//  Fusão cirúrgica de ferias.js + gerador-horarios.js + banco-horas.js.
//  Cada bloco mantém a sua IIFE própria (scope isolado, idêntico ao padrão
//  já usado em utilitario.js/ventas.js/tam.js). Nenhuma lógica foi alterada:
//  apenas estilos inline (style=, .style.cssText, .style.X=, blocos de CSS-in-JS)
//  foram migrados para estilo.css. Ordem preservada: FÉRIAS antes de GERADOR
//  antes de BANCO DE HORAS (ordem relativa original em shared.js).
//
//  Dependências entre blocos (pré-existentes, preservadas):
//  - FÉRIAS expõe window.getFeriasParaSemana(); GERADOR lê-a (typeof-guard).
//  - GERADOR expõe window.GERADOR_PEOPLE; FÉRIAS lê-a (fallback [] se ausente).
//  Como os 3 blocos correm sequencialmente no mesmo scope global (tal como
//  antes, em ficheiros separados), este contrato mantém-se inalterado.
// ══════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════════
   BLOCO FÉRIAS — fundido de ferias.js
   IIFE própria, scope isolado.
══════════════════════════════════════════════════════════════ */
// ══ FÉRIAS TAB ══
(function() {

  // ── DOM injected by ferias.js ──
  function ensureTabShell() {
    if (document.getElementById('tab-ferias')) return;
    const adminApp = document.getElementById('admin-app');
    if (!adminApp) return;
    const panel = document.createElement('div');
    panel.id = 'tab-ferias';
    panel.className = 'tab-panel';
    panel.innerHTML =
      '<div id="f-today-banner">'
      +   '<div class="f-banner-title">🌴 de férias hoje</div>'
      +   '<div class="f-banner-names" id="f-banner-names"></div>'
      + '</div>'
      + '<div id="f-area"></div>';
    adminApp.appendChild(panel);
  }
  ensureTabShell();

  // ── Cartão do submenu "horários" injetado por ferias.js ──
  function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-horarios-module="ferias"]')) return;
    const grid = document.getElementById('horarios-sub-grid');
    if (!grid) return;
    const card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-horarios-module', 'ferias');
    card.innerHTML = `        <span class="adm-mod-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3C12 3 7 8 7 13a5 5 0 0 0 10 0c0-5-5-10-5-10Z" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
            <path d="M12 13v5M9 18h6" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M7 9c-2 1-4 3-4 3s2 0 3 1" stroke="rgba(255,255,255,0.6)" stroke-width="1.1" stroke-linecap="round"/>
            <path d="M17 9c2 1 4 3 4 3s-2 0-3 1" stroke="rgba(255,255,255,0.6)" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <div class="adm-mod-name">FÉRIAS</div>
          <div class="adm-mod-desc">controlo de férias e ausências</div>
        </div>
        <div class="adm-mod-arrow">→</div>
      `;
    const gerador = grid.querySelector('.adm-mod-card[data-horarios-module="gerador"]');
    const bancoHoras = grid.querySelector('.adm-mod-card[data-horarios-module="banco-horas"]');
    if (bancoHoras) grid.insertBefore(card, bancoHoras);
    else if (gerador) grid.insertBefore(card, gerador.nextSibling);
    else grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.closeHorariosOverlay === 'function') window.closeHorariosOverlay();
      setTimeout(function () {
        if (typeof window.openModule === 'function') window.openModule('ferias');
      }, 200);
    });
  }
  ensureModuleCard();

  // ── SUPABASE ──
  // Usar cliente global sbAdmin (inicializado tras login)
  function getSupabase() {
    return (typeof sbAdmin !== 'undefined') ? sbAdmin : null;
  }

  // ── ESTADO GLOBAL ──
  const BASE_YEAR = 2026;
  let currentYear = BASE_YEAR;
  let filterLoja  = '';
  let viewPessoa  = '';
  let feriasDB    = {};           // { año: [entradas...] }
  let _supaClient = null;
  let _realtimeSub = null;

  // ── HELPERS ──
  function parseDate(str) {
    if (!str) return new Date(0);
    // Acepta "DD/MM/YYYY" o "YYYY-MM-DD"
    if (str.includes('/')) {
      const p = str.split('/');
      return new Date(+p[2], +p[1]-1, +p[0]);
    }
    const p = str.split('-');
    return new Date(+p[0], +p[1]-1, +p[2]);
  }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function pad2(n) { return String(n).padStart(2,'0'); }
  function toDateStr(date) {
    return pad2(date.getDate())+'/'+pad2(date.getMonth()+1)+'/'+date.getFullYear();
  }
  function getFerias(year) { return feriasDB[year] || []; }
  function getPessoas() {
    const all = new Set();
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
  function diasFerias(nome, year) {
    return (feriasDB[year] || [])
      .filter(function(f){ return f.nome === nome; })
      .reduce(function(acc, f){
        return acc + daysBetween(parseDate(f.de), parseDate(f.ate)) + 1;
      }, 0);
  }
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

  // ── SUPABASE: CARGAR DATOS ──
  async function loadFromSupabase() {
    if (!_supaClient) return;
    showLoadingIndicator(true);
    try {
      const { data, error } = await _supaClient
        .from('ferias')
        .select('*')
        .order('de', { ascending: true });

      if (error) {
        console.error('[Férias] Error al cargar:', error.message);
        showToast('⚠️ Error al cargar datos');
        return;
      }

      // Reconstruir feriasDB agrupado por año
      feriasDB = {};
      (data || []).forEach(function(row) {
        const year = parseDate(row.de).getFullYear();
        if (!feriasDB[year]) feriasDB[year] = [];
        feriasDB[year].push({
          id:   row.id,
          nome: row.nome,
          de:   row.de,   // guardado como DD/MM/YYYY
          ate:  row.ate,
          loja: row.loja
        });
      });
      // Notificar outros módulos (ex: gerador) que os dados foram atualizados
      document.dispatchEvent(new CustomEvent('ferias:updated'));
    } catch(e) {
      console.error('[Férias] Excepción:', e);
    } finally {
      showLoadingIndicator(false);
    }
  }

  // ── SUPABASE: INSERTAR ──
  async function insertFerias(entry) {
    if (!_supaClient) return null;
    const { data, error } = await _supaClient
      .from('ferias')
      .insert([{ nome: entry.nome, de: entry.de, ate: entry.ate, loja: entry.loja }])
      .select()
      .single();
    if (error) { console.error('[Férias] Insert error:', error.message); return null; }
    return data;
  }

  // ── SUPABASE: ACTUALIZAR ──
  async function updateFerias(id, entry) {
    if (!_supaClient) return false;
    const { error } = await _supaClient
      .from('ferias')
      .update({ nome: entry.nome, de: entry.de, ate: entry.ate, loja: entry.loja })
      .eq('id', id);
    if (error) { console.error('[Férias] Update error:', error.message); return false; }
    return true;
  }

  // ── SUPABASE: ELIMINAR ──
  async function deleteFerias(id) {
    if (!_supaClient) return false;
    const { error } = await _supaClient
      .from('ferias')
      .delete()
      .eq('id', id);
    if (error) { console.error('[Férias] Delete error:', error.message); return false; }
    return true;
  }

  // ── SUPABASE: REALTIME ──
  function subscribeRealtime() {
    if (!_supaClient || _realtimeSub) return;
    _realtimeSub = _supaClient
      .channel('ferias-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ferias' }, function() {
        loadFromSupabase().then(function() { renderFerias(); });
      })
      .subscribe();
  }

  // ── LOADING INDICATOR ──
  function showLoadingIndicator(show) {
    let el = document.getElementById('f-loading');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'f-loading';
        el.className = 'f-loading-toast';
        el.textContent = '⏳ sincronizando…';
        document.body.appendChild(el);
      }
    } else {
      if (el) el.remove();
    }
  }

  // ── TOAST ──
  function showToast(msg) {
    const t = document.createElement('div');
    t.className='f-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 250); }, 2500);
  }

  // ── BTN STYLE: ver .f-btn / .f-btn-active em estilo.css ──

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

    modal.innerHTML =
      '<div class="f-modal-box w420">'
      +'<div class="f-modal-head">'
      +'<span class="f-modal-title">'+(isEdit?'✏️ Editar':'➕ Adicionar')+' Férias '+year+'</span>'
      +'<button id="f-modal-close" class="f-modal-close">✕</button>'
      +'</div>'

      +'<label class="f-modal-label">Pessoa</label>'
      +'<select id="f-inp-pessoa" class="f-modal-input mb">'
      +'<option value="">— selecionar pessoa —</option>'+pessoaOpts
      +'<option value="__nova__">+ Nova pessoa…</option>'
      +'</select>'

      +'<div id="f-nova-pessoa-wrap" class="f-modal-subwrap">'
      +'<label class="f-modal-label">Nome da nova pessoa</label>'
      +'<input id="f-inp-nova-pessoa" type="text" placeholder="NOME APELIDO" class="f-modal-input upper">'
      +'</div>'

      +'<label class="f-modal-label">Loja</label>'
      +'<select id="f-inp-loja" class="f-modal-input mb">'
      +'<option value="">— selecionar loja —</option>'+lojaOpts
      +'<option value="__nova__">+ Nova loja…</option>'
      +'</select>'

      +'<div id="f-nova-loja-wrap" class="f-modal-subwrap">'
      +'<label class="f-modal-label">Nome da nova loja</label>'
      +'<input id="f-inp-nova-loja" type="text" placeholder="Nome da loja" class="f-modal-input">'
      +'</div>'

      +'<div class="f-modal-grid2">'
      +'<div><label class="f-modal-label">De</label>'
      +'<input id="f-inp-de" type="date" value="'+defDe+'" class="f-modal-input"></div>'
      +'<div><label class="f-modal-label">Até</label>'
      +'<input id="f-inp-ate" type="date" value="'+defAte+'" class="f-modal-input"></div>'
      +'</div>'

      +'<div id="f-modal-error" class="f-modal-error"></div>'
      +'<div class="f-modal-btnrow">'
      +(isEdit ? '<button id="f-modal-delete" class="f-modal-btn-del">🗑</button>' : '')
      +'<button id="f-modal-save" class="f-modal-btn-save">'+(isEdit?'Guardar alterações':'Guardar')+'</button>'
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
      document.getElementById('f-modal-delete').addEventListener('click', async function(){
        if (!confirm('Eliminar esta entrada de férias?')) return;
        const saveBtn = document.getElementById('f-modal-save');
        if (saveBtn) saveBtn.disabled = true;
        const ok = await deleteFerias(editEntry.id);
        if (ok) {
          await loadFromSupabase();
          closeModal();
          showToast('🗑 Férias eliminadas');
          renderFerias();
        } else {
          showToast('⚠️ Erro ao eliminar');
        }
      });
    }

    document.getElementById('f-modal-save').addEventListener('click', async function(){
      const errEl = document.getElementById('f-modal-error');
      errEl.style.display = 'none';
      const saveBtn = this;
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ a guardar…';

      let pessoaSel = document.getElementById('f-inp-pessoa').value;
      if (pessoaSel === '__nova__') pessoaSel = (document.getElementById('f-inp-nova-pessoa').value||'').trim().toUpperCase();
      if (!pessoaSel) { errEl.textContent='⚠ Seleciona ou insere uma pessoa.'; errEl.style.display='block'; saveBtn.disabled=false; saveBtn.textContent=isEdit?'Guardar alterações':'Guardar'; return; }

      let lojaSel = document.getElementById('f-inp-loja').value;
      if (lojaSel === '__nova__') lojaSel = (document.getElementById('f-inp-nova-loja').value||'').trim();
      if (!lojaSel) { errEl.textContent='⚠ Seleciona ou insere uma loja.'; errEl.style.display='block'; saveBtn.disabled=false; saveBtn.textContent=isEdit?'Guardar alterações':'Guardar'; return; }

      const deVal  = document.getElementById('f-inp-de').value;
      const ateVal = document.getElementById('f-inp-ate').value;
      if (!deVal||!ateVal) { errEl.textContent='⚠ Preenche as datas.'; errEl.style.display='block'; saveBtn.disabled=false; saveBtn.textContent=isEdit?'Guardar alterações':'Guardar'; return; }

      const deDate  = new Date(deVal);
      const ateDate = new Date(ateVal);
      if (ateDate < deDate) { errEl.textContent='⚠ A data final não pode ser anterior à inicial.'; errEl.style.display='block'; saveBtn.disabled=false; saveBtn.textContent=isEdit?'Guardar alterações':'Guardar'; return; }

      const deStr  = toDateStr(deDate);
      const ateStr = toDateStr(ateDate);

      let ok = false;
      if (isEdit) {
        ok = await updateFerias(editEntry.id, { nome: pessoaSel, de: deStr, ate: ateStr, loja: lojaSel });
        if (ok) showToast('✅ Férias atualizadas');
      } else {
        const row = await insertFerias({ nome: pessoaSel, de: deStr, ate: ateStr, loja: lojaSel });
        ok = !!row;
        if (ok) showToast('✅ Férias guardadas');
      }

      if (!ok) {
        showToast('⚠️ Erro ao guardar');
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Guardar alterações' : 'Guardar';
        return;
      }

      await loadFromSupabase();
      const entryYear = deDate.getFullYear();
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
    modal.innerHTML =
      '<div class="f-modal-box w380">'
      +'<div class="f-modal-head">'
      +'<span class="f-modal-title">👤 Nova Pessoa</span>'
      +'<button id="f-modal-close" class="f-modal-close">✕</button>'
      +'</div>'
      +'<label class="f-modal-label">Nome completo</label>'
      +'<input id="f-inp-pessoa-nome" type="text" placeholder="NOME APELIDO" class="f-pessoa-nome-input">'
      +'<div id="f-modal-error" class="f-modal-error"></div>'
      +'<div class="f-modal-grid2b">'
      +'<button id="f-pessoa-save-only" class="f-btn">Guardar</button>'
      +'<button id="f-pessoa-save-ferias" class="f-btn">Guardar + Férias</button>'
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
      closeModal();
      showToast('✅ Pessoa adicionada');
    });

    document.getElementById('f-pessoa-save-ferias').addEventListener('click', function(){
      const nome = getNome();
      const errEl = document.getElementById('f-modal-error');
      if (!nome) { errEl.textContent='⚠ Insere um nome.'; errEl.style.display='block'; return; }
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
      html += '<div class="f-year-block">'
        +'<div class="f-year-title">'+yr+' · '+total+' dias</div>';
      entries.sort(function(a,b){ return parseDate(a.de)-parseDate(b.de); }).forEach(function(f,i){
        const deD = parseDate(f.de), ateD = parseDate(f.ate);
        const dias = daysBetween(deD, ateD) + 1;
        const deStr = f.de.substring(0,5), ateStr = f.ate.substring(0,5);
        html += '<div class="f-entry-row">'
          +'<span class="f-entry-date">'+deStr+' → '+ateStr+'</span>'
          +'<span class="f-entry-meta">'
          +'<span class="f-entry-sub">'+dias+'d · '+f.loja+'</span>'
          +'<button data-id="'+f.id+'" class="fv-edit-btn f-entry-edit-btn">✏️</button>'
          +'</span>'
          +'</div>';
      });
      html += '</div>';
    });
    if (!html) html = '<div class="f-view-empty">Nenhuma férias registada</div>';

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.innerHTML =
      '<div class="f-modal-box w400">'
      +'<div class="f-modal-head tight">'
      +'<span class="f-modal-title sm">📋 '+nome+'</span>'
      +'<button id="f-modal-close" class="f-modal-close">✕</button>'
      +'</div>'
      +html
      +'<button id="fv-add-btn" class="f-btn block">＋ Adicionar Férias</button>'
      +'</div>';

    document.body.appendChild(modal);
    document.getElementById('f-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
    document.getElementById('fv-add-btn').addEventListener('click', function(){
      closeModal(); openModalFerias(nome);
    });

    modal.querySelectorAll('.fv-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const id = btn.dataset.id;
        // Buscar la entrada por id en todos los años
        let found = null, foundYear = null;
        Object.keys(feriasDB).forEach(function(yr){
          const idx = feriasDB[yr].findIndex(function(f){ return String(f.id) === String(id); });
          if (idx >= 0) { found = feriasDB[yr][idx]; foundYear = +yr; }
        });
        if (found) {
          closeModal();
          openModalFerias(nome, found, foundYear, null);
        }
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

    // ── Header ──
    let headerEl = document.getElementById('f-year-header');
    if (!headerEl) {
      headerEl = document.createElement('div');
      headerEl.id = 'f-year-header';
      area.parentNode.insertBefore(headerEl, area);
    }
    headerEl.innerHTML =
      '<span class="f-year-header-title">Férias '+currentYear+'</span>'
      +'<div class="f-year-nav">'
      +(currentYear > BASE_YEAR
        ? '<button id="f-btn-prev-year" class="f-btn">← '+(currentYear-1)+'</button>'
        : '')
      +'<button id="f-btn-next-year" class="f-btn">'+(currentYear+1)+' →</button>'
      +'</div>';

    document.getElementById('f-btn-next-year').addEventListener('click', function(){ currentYear++; renderFerias(); });
    const prevBtn = document.getElementById('f-btn-prev-year');
    if (prevBtn) prevBtn.addEventListener('click', function(){ currentYear--; renderFerias(); });

    // ── Barra de acciones ──
    let actionsEl = document.getElementById('f-actions');
    if (!actionsEl) {
      actionsEl = document.createElement('div');
      actionsEl.id = 'f-actions';
      area.parentNode.insertBefore(actionsEl, area);
    }

    const lojas = getLojas();
    const lojaFilterOpts = '<option value="">Todas as lojas</option>'
      + lojas.map(function(l){
          return '<option value="'+l+'"'+(filterLoja===l?' selected':'')+'>'+l+'</option>';
        }).join('');

    actionsEl.innerHTML =
      '<button id="f-btn-add-ferias" class="f-btn">＋ Férias</button>'
      +'<button id="f-btn-add-pessoa" class="f-btn">＋ Pessoa</button>'
      +'<select id="f-filter-loja" class="f-filter-select">'+lojaFilterOpts+'</select>';

    document.getElementById('f-btn-add-ferias').addEventListener('click', function(){ openModalFerias(); });
    document.getElementById('f-btn-add-pessoa').addEventListener('click', openModalPessoa);
    document.getElementById('f-filter-loja').addEventListener('change', function(){
      filterLoja = this.value;
      renderFerias();
    });

    // ── Alertas de solapamiento ──
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
      let ohtml = '<div class="f-section"><div class="f-alert-box">'
        +'⚠️ Solapamentos detetados:<br>';
      filteredOverlaps.forEach(function(o){
        ohtml += '<span class="f-alert-sub">'+o.a.nome+' &amp; '+o.b.nome+' ('+o.a.loja+') — '
          +o.a.de.substring(0,5)+' a '+o.a.ate.substring(0,5)+' / '+o.b.de.substring(0,5)+' a '+o.b.ate.substring(0,5)+'</span><br>';
      });
      ohtml += '</div></div>';
      alertEl.innerHTML = ohtml;
    } else {
      alertEl.innerHTML = '';
    }

    // ── Clasificar entradas ──
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

    function cardHTML(f) {
      const badgeCls = f.status==='active' ? 'active-now' : f.status==='upcoming' ? 'soon' : 'past';
      const lojaTag  = f.loja ? '<span class="f-card-loja-tag">'+f.loja+'</span>' : '';
      const deStr    = f.de.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const ateStr   = f.ate.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const badge    = isCurrentYear ? '<span class="f-badge '+badgeCls+'">'+fmtDays(f.days, f.status)+'</span>' : '';
      const dias     = daysBetween(f.de instanceof Date ? f.de : parseDate(f.de),
                                   f.ate instanceof Date ? f.ate : parseDate(f.ate)) + 1;
      const diasTag  = '<span class="f-card-dias-tag">'+dias+'d</span>';
      const editBtn  = '<button class="f-edit-card-btn f-card-edit-btn" data-id="'+f.id+'">✏️</button>';
      const nameBtn  = '<button class="f-view-pessoa-btn f-card-name-btn" data-nome="'+f.nome+'">'+f.nome+'</button>';
      return '<div class="f-card">'
        +'<span class="f-dot '+badgeCls+'"></span>'
        +'<span class="f-name">'+nameBtn+lojaTag+diasTag+'</span>'
        +'<span class="f-dates">'+deStr+'&nbsp;→&nbsp;'+ateStr+'</span>'
        +badge
        +editBtn
        +'</div>';
    }

    const upcoming_all = enriched.filter(function(f){ return f.status==='upcoming'; })
                                  .sort(function(a,b){ return a.de-b.de; });
    const nextUp = upcoming_all[0] || null;

    // ── Montar HTML ──
    let html = '';

    // ── Bloco "próximo a ir" — CORREGIDO: usa f-section para respetar max-width ──
    if (isCurrentYear && nextUp && nextUp.days > 7) {
      html += '<div class="f-section">'
        +'<div class="f-highlight-box">'
        +'🏖 Próximo: <strong>'+nextUp.nome+'</strong> ('+nextUp.loja+') — em '+nextUp.days+' dias'
        +'</div>'
        +'</div>';
    }

    if (!isCurrentYear) {
      const sorted = [...enriched].sort(function(a,b){ return a.de-b.de; });
      if (sorted.length) {
        const icon = isFutureYear ? '📅' : '📁';
        html += '<div class="f-section"><div class="f-section-title">'+icon+' calendário '+currentYear+'</div>';
        sorted.forEach(function(f){ html += cardHTML(f); });
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
        arr.forEach(function(f){ s += cardHTML(f); });
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
      html += '<div class="f-section"><div class="f-section-title mb8">📊 resumo '+currentYear+'</div>';
      html += '<div class="f-resumo-grid">';
      pessoasNoAno.forEach(function(p){
        const total = diasFerias(p, currentYear);
        html += '<button class="f-view-pessoa-btn f-resumo-btn" data-nome="'+p+'">'
          +'<span class="f-resumo-name">'+p+'</span>'
          +'<span class="f-resumo-dias">'+total+' dias</span>'
          +'</button>';
      });
      html += '</div></div>';
    }

    if (!html) {
      html = '<div class="f-empty-state">nenhuma férias registada para '+currentYear+'</div>';
    }

    area.innerHTML = html;

    // ── Wiring de botones ──
    area.querySelectorAll('.f-edit-card-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const id = btn.dataset.id;
        let found = null, foundYear = null;
        Object.keys(feriasDB).forEach(function(yr){
          const entry = feriasDB[yr].find(function(f){ return String(f.id) === String(id); });
          if (entry) { found = entry; foundYear = +yr; }
        });
        if (found) openModalFerias(null, found, foundYear, null);
      });
    });

    area.querySelectorAll('.f-view-pessoa-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        openModalPessoaView(btn.dataset.nome);
      });
    });
  }

  // ── API GLOBAL PARA GERADOR DE HORÁRIOS ──
  // Devolve lista de { pid, nome, from } para pessoas de férias que coincidem
  // com a semana indicada (weekStart: Date da segunda-feira).
  // "from" é o primeiro dia da semana (SEG..DOM) em que a pessoa está de férias.
  window.getFeriasParaSemana = function(weekStart) {
    const DAYS = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
    // Mapas nome→id e nome→loja para cruzar com PEOPLE do gerador
    // O gerador expõe window.GERADOR_PEOPLE; se não existir, tentamos cruzar por nome
    const peopleLookup = window.GERADOR_PEOPLE || [];

    const weekDates = DAYS.map(function(_, i) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      d.setHours(0,0,0,0);
      return d;
    });
    const weekEnd = new Date(weekDates[6]);
    weekEnd.setHours(23,59,59,999);

    const result = [];
    const allEntries = Object.values(feriasDB).reduce(function(acc, arr) { return acc.concat(arr); }, []);

    allEntries.forEach(function(f) {
      const de  = parseDate(f.de);
      const ate = parseDate(f.ate);
      ate.setHours(23,59,59,999);
      // Sobrepõe-se à semana?
      if (de > weekEnd || ate < weekDates[0]) return;

      // Encontrar o primeiro dia da semana em que está de férias
      let fromDay = null;
      for (var i = 0; i < DAYS.length; i++) {
        if (weekDates[i] >= de) { fromDay = DAYS[i]; break; }
      }
      if (!fromDay) fromDay = 'SEG';

      // Encontrar o último dia da semana em que está de férias
      // (pode ser antes de DOM se as férias terminam a meio da semana)
      let toDay = null;
      for (var j = DAYS.length - 1; j >= 0; j--) {
        if (weekDates[j] <= ate) { toDay = DAYS[j]; break; }
      }
      if (!toDay) toDay = 'DOM';

      // Cruzar nome com PEOPLE do gerador (por nome, case-insensitive)
      const nomeNorm = (f.nome || '').trim().toUpperCase();
      let pid = null;
      peopleLookup.forEach(function(p) {
        if (p.name.toUpperCase() === nomeNorm) pid = p.id;
      });

      result.push({ pid: pid, nome: f.nome, loja: f.loja, from: fromDay, to: toDay });
    });

    return result;
  };

  // ── INIT ──
  async function initFerias() {
    _supaClient = getSupabase();
    if (!_supaClient) {
      console.warn('[Férias] Supabase no disponible — esperando login');
      return;
    }
    await loadFromSupabase();
    subscribeRealtime();
    renderFerias();
  }

  // ── TAB LISTENER ──
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.dataset.tab === 'ferias') {
        if (!_supaClient) { initFerias(); } else { renderFerias(); }
      }
    });
  });

  document.addEventListener('ferias:open', function() {
    setTimeout(function() {
      if (!_supaClient) { initFerias(); } else { renderFerias(); }
    }, 40);
  });

  // ── AUTO-REFRESH cada hora ──
  setInterval(function() {
    const active = document.querySelector('.tab-btn[data-tab="ferias"].active');
    if (active) renderFerias();
  }, 3600000);

  // Arrancar solo cuando hay sesión activa (no al cargar la página)
  // La inicialización ocurre al abrir la pestaña de férias

})();

/* ══════════════════════════════════════════════════════════════
   BLOCO GERADOR DE HORÁRIOS — fundido de gerador-horarios.js
   IIFE própria, scope isolado.
══════════════════════════════════════════════════════════════ */
// ══ GERADOR DE HORÁRIOS — Porto Santo ══
(function () {

  // ── KNOWLEDGE BASE — loaded dynamically from Supabase ──
  // No names or personal data hardcoded here. All data comes from the database.
  let STORES = [];
  let PEOPLE = [];

  // ── SUPABASE CONFIG ──
  // Credenciales gestionadas por el servidor — no hardcodeadas

  async function getSupabase() {
    if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    // Esperar a que sbAdmin esté disponible (máx 5 segundos)
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
    }
    return null;
  }

  async function supabaseFetch(table, filters = {}) {
    const sb = await getSupabase();
    if (!sb) { console.warn('Supabase client not available'); return []; }
    try {
      let query = sb.from(table).select('*');
      Object.entries(filters).forEach(([col, val]) => { query = query.eq(col, val); });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error(`Supabase fetch error (${table}):`, e);
      return [];
    }
  }

  async function supabaseInsert(table, data) {
    const sb = await getSupabase();
    if (!sb) return null;
    try {
      const { data: result, error } = await sb.from(table).insert(data).select();
      if (error) throw error;
      return result;
    } catch (e) {
      console.error(`Supabase insert error (${table}):`, e);
      return null;
    }
  }

  async function supabaseUpdate(table, id, data) {
    const sb = await getSupabase();
    if (!sb) return null;
    try {
      // Remove 'id' from data payload to avoid conflict with the filter
      const payload = { ...data };
      delete payload.id;
      const { data: result, error } = await sb.from(table).update(payload).eq('id', id).select();
      if (error) throw error;
      return result && result.length > 0 ? result : [payload];
    } catch (e) {
      console.error(`Supabase update error (${table}):`, e);
      return null;
    }
  }

  // Load STORES and PEOPLE from Supabase
  // Expected Supabase tables:
  //   gh_stores: id, name, short, priority, active
  //   gh_people: id, name, hrs, store_id, efetiva, start_date, end_date,
  //              can_alone, mobile, cover_pri, knows (array), hard_avoid (array),
  //              soft_avoid (array), active
  async function loadKnowledgeBase() {
    const [storesRaw, peopleRaw] = await Promise.all([
      supabaseFetch('gh_stores', { active: true }),
      supabaseFetch('gh_people', { active: true })
    ]);

    STORES = storesRaw.map(s => ({
      id: s.id, name: s.name, short: s.short, priority: s.priority
    }));

    PEOPLE = peopleRaw.map(p => {
      // Derivar autonomia: campo 'autonomia' na BD tem prioridade.
      // Fallback de compatibilidade para registos antigos (efetiva + can_alone).
      let autonomia = p.autonomia || null;
      if (!autonomia) {
        if (p.efetiva)          autonomia = 'efectiva';
        else if (p.can_alone)   autonomia = 'autonoma';
        else                    autonomia = 'nao_autonoma';
      }
      // Derivar flags operacionais a partir de autonomia
      const efetiva        = autonomia === 'efectiva';
      const canAlone       = autonomia === 'efectiva' || autonomia === 'autonoma';
      const canAloneInterval = autonomia !== 'nao_autonoma'; // efectiva, autonoma, autonoma_h
      // Peso: efectiva=2, autonoma/autonoma_h=1.5, nao_autonoma=1
      const pesoBase = efetiva ? 2 : (autonomia === 'nao_autonoma' ? 1 : 1.5);

      return {
        id: p.id,
        name: p.name,
        hrs: p.hrs || 40,
        store: p.store_id || null,
        autonomia,          // 'efectiva'|'autonoma'|'autonoma_h'|'nao_autonoma'
        efetiva,            // true só para efectivas
        canAlone,           // pode ficar sozinha o dia todo
        canAloneInterval,   // pode ficar sozinha só no intervalo
        pesoBase,           // peso para cálculos de almoço
        start: p.start_date,
        end: p.end_date || null,
        mobile: p.mobile || false,
        coverPri: p.cover_pri || 9,
        knows: p.knows || (p.store_id ? [p.store_id] : []),
        hardAvoid: p.hard_avoid || [],
        softAvoid: p.soft_avoid || []
      };
    });

    window.GERADOR_PEOPLE = PEOPLE;
  }

  // Exposed wrapper so the edit-from-admin watcher can load a published week safely,
  // waiting for the knowledge base before parsing the CSV. Idempotent-safe: re-entry is
  // prevented by the watcher's own `busy` flag.
  window._ghLoadPortoWeekForEdit = async function (weekISO) {
    if (!weekISO) return;
    // Ensure STORES/PEOPLE are loaded before parsing the published CSV
    if (!STORES.length || !PEOPLE.length) {
      try { await loadKnowledgeBase(); } catch (e) { console.error('[GH] KB load failed before edit:', e); }
    }
    return loadPortoWeekForEdit(weekISO);
  };

  const DAYS   = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
  const DAY_PT = { SEG:'Segunda', TER:'Terça', QUA:'Quarta', QUI:'Quinta', SEX:'Sexta', SAB:'Sábado', DOM:'Domingo' };

  // ── HORÁRIOS PERMITIDOS ──
  // A  10-13 / 14-19   (8h, intervalo 13h)
  // B  10-14 / 15-19   (8h, intervalo 14h)  ← default standard
  // C  10-15 / 16-19   (8h, intervalo 15h)
  // D  09-12 / 13-18   (8h, abertura 9h)
  // E  11-15 / 16-20   (8h, fecho 20h — pós-noite)
  // F  09-13 / 19-23   (8h, turno noite)
  // G  09-13 / 14-18   (8h, abertura 9h, intervalo 13h)
  // H  11-14 / 15-20   (8h, fecho 20h — pós-noite)
  const SH_A = '10:00-13:00|14:00-19:00';
  const SH_B = '10:00-14:00|15:00-19:00';
  const SH_C = '10:00-15:00|16:00-19:00';
  const SH_D = '09:00-12:00|13:00-18:00';
  const SH_E = '11:00-15:00|16:00-20:00';
  const SH_F = '09:00-13:00|19:00-23:00';
  const SH_G = '09:00-13:00|14:00-18:00';
  const SH_H = '11:00-14:00|15:00-20:00';

  // Aliases para compatibilidade com o código existente
  const SH_DEFAULT = SH_B;
  const SH_ALT     = SH_A;

  // ── MEMORY (sessionStorage) ──
  let MEM = (function () {
    try { const r = sessionStorage.getItem('mzk_gh8'); if (r) return JSON.parse(r); } catch (e) {}
    return { cycleWeek: 0, offsets: {}, sundays: {} };
  })();
  function saveMem() { try { sessionStorage.setItem('mzk_gh8', JSON.stringify(MEM)); } catch (e) {} }

  // ── STATE ──
  function blank() {
    return {
      weekStart: null, openStores: [], openDays: {}, storeMin: {}, storeMax: {},
      storeMode: {}, domPessoas: null,
      absences: [],
      sandraDay: {}, folgaDay: {}, sundayAssigned: {}, extraDayOff: {},
      schedule: {}, alerts: [], decisions: [],
      _personStores: {}, _storeOrder: {},
      // pid → contribuição que ESTA semana já tem dentro do saldo do banco.
      // Preenchido ao abrir uma semana publicada para edição (derivado do
      // próprio horário carregado) e actualizado a cada publicação.
      _contribSemana: {}
    };
  }
  let S = blank();

  // ── HELPERS ──
  function P(id)    { return PEOPLE.find(p => p.id === id); }
  function ST(id)   { return STORES.find(s => s.id === id); }
  function sname(id)  { return ST(id)?.name  || id || '—'; }
  function sshort(id) { return ST(id)?.short || id || '—'; }
  function wkDates() {
    return DAYS.map((_, i) => { const d = new Date(S.weekStart); d.setDate(d.getDate() + i); return d; });
  }
  function fmt(d) { if (!d) return ''; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
  function nextMonday() {
    const t = new Date();
    const dow = t.getDay(); // 0=dom, 1=seg, ..., 6=sab
    // Días hasta el próximo lunes:
    // dom(0)→+1, seg(1)→+7, ter(2)→+6, qua(3)→+5, qui(4)→+4, sex(5)→+3, sab(6)→+2
    const daysUntilMonday = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
    t.setDate(t.getDate() + daysUntilMonday);
    return t.toISOString().split('T')[0];
  }
  function isoWeek(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w1 = new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7); }
  function weeksSince(s, ref) { return Math.floor((ref - new Date(s)) / (7*864e5)); }
  function absOf(pid)       { return S.absences.find(a => a.pid === pid) || null; }

  // Converte uma data ISO (YYYY-MM-DD) no dia-da-semana correspondente (ex: 'QUA').
  // Devolve null se a data cair fora da semana actual.
  function dayOfWeekKey(dateStr) {
    if (!dateStr || !S.weekStart) return null;
    const d    = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((d - new Date(S.weekStart)) / 86400000);
    if (diff < 0 || diff > 6) return null; // fora desta semana
    return DAYS[diff];
  }

  // Pessoa está ausente num dia concreto?
  // Respeita 'from' (1.º dia de ausência) e 'to' (último dia de ausência).
  // Se 'to' não existir assume até ao final da semana (DOM).
  function isAbsent(pid, day) {
    const a = absOf(pid); if (!a) return false;
    const di    = DAYS.indexOf(day);
    const fromI = DAYS.indexOf(a.from);
    const toI   = a.to ? DAYS.indexOf(a.to) : 6;
    return di >= fromI && di <= toI;
  }

  // Pessoa ausente a semana toda?
  function fullyAbsent(pid) {
    const a = absOf(pid); if (!a) return false;
    const fromI = DAYS.indexOf(a.from);
    const toI   = a.to ? DAYS.indexOf(a.to) : 6;
    return fromI === 0 && toI === 6;
  }
  // Verifica se um dia da semana cai APÓS a data de fim de contrato da pessoa.
  // p.end é uma string ISO (YYYY-MM-DD). Devolve true se o dia >= day após end_date.
  function isContractEnded(p, day) {
    if (!p.end || !S.weekStart) return false;
    const endDate = new Date(p.end + 'T00:00:00');
    const di = DAYS.indexOf(day);
    const dayDate = new Date(S.weekStart);
    dayDate.setDate(dayDate.getDate() + di);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate > endDate;
  }

  function storeOpen(sid, day) { return S.openStores.includes(sid) && S.openDays[sid]?.includes(day); }
  function storeMin(sid)  { return S.storeMin?.[sid] > 0 ? S.storeMin[sid] : 1; }
  function storeMax(sid)  { const m = S.storeMax?.[sid]; return (m && m > 0) ? m : Infinity; }


  // ── SHIFT HELPERS (simplified — no engine) ──
  function storeBaseShift(sid) { return (window._STORE_MODE_SHIFTS?.[sid] || '10:00-14:00|15:00-19:00'); }

  // ── WIZARD STATE ──
  let wStep = 0;
  function getContainer() { return document.getElementById('gh-container'); }

  function fixPanelLayout() {
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      // Cor tratada via CSS (#tab-gerador { background:#fff !important; color:#111 !important; })
    }
  }

  function cleanupGeradorLayout() {
    // Called when leaving the gerador tab — reset only the inline styles we added.
    // NEVER touch display — the tab system's CSS controls visibility exclusively.
    const panel = document.getElementById('tab-gerador');
    if (panel) {
    }
    const modal = document.getElementById('gh-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
    editCtx = null;
  }

  function renderWiz() {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();
    c.style.animation = 'none'; c.offsetWidth; c.style.animation = '';
    [wiz_week, wiz_absences, wiz_stores][wStep]();
  }

  // ── WIZARD: PASSO 1 ──
  function wiz_week() {
    const c = getContainer(); if (!c) return;
    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Passo 1 de 3</div>
        <div class="gh-wiz-title">Qual semana vamos planear?</div>
        <div class="gh-wiz-sub">Indique a segunda-feira da semana.</div>
        <input type="date" class="gh-field" id="gh-inp-week" value="${nextMonday()}">
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-solid" id="gh-sub-week">Continuar →</button>
        </div>
        <div id="gh-borradores-list" class="gh-mt48"></div>
      </div>`;
    document.getElementById('gh-sub-week').addEventListener('click', sub_week);
    // Load borradores async into placeholder
    renderBorradores(document.getElementById('gh-borradores-list'));
  }

  function sub_week() {
    const v = document.getElementById('gh-inp-week').value; if (!v) return;
    const d = new Date(v + 'T00:00:00'), dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    S.weekStart = d; wStep = 1; renderWiz();
  }

  // ── WIZARD: PASSO 2 — GESTÃO DE PESSOAL ──
  // Mostra o pessoal activo carregado do Supabase.
  // Permite adicionar novas pessoas, editar condição efectiva/nova,
  // gerir tiendas onde podem trabalhar, e ver férias automáticas da semana.
  // NÃO há opção de adicionar ausências manuais — só férias automáticas.

  async function wiz_absences() {
    const c = getContainer(); if (!c) return;

    // Férias automáticas da semana
    let feriasAuto = [];
    if (typeof window.getFeriasParaSemana === 'function' && S.weekStart) {
      feriasAuto = window.getFeriasParaSemana(S.weekStart).filter(f => (f.loja||'').toLowerCase().includes('porto santo'));
    }

    // Recolher apenas férias para S.absences — sem ausências manuais
    const feriasAutoPids = new Set(feriasAuto.map(f => f.pid));

    const storeOptions = STORES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    c.innerHTML = `
      <div class="gh-step2-wrap">

        <!-- HEADER: título + contador + nav + adicionar -->
        <div class="gh-step2-header">
          <div class="gh-step2-header-top">
            <div>
              <div class="gh-wiz-label">Passo 2 de 3</div>
              <div class="gh-step2-title-row">
                <div class="gh-wiz-title mb0">Pessoal Activo</div>
                <div class="gh-step2-badge">
                  ${(PEOPLE.length - feriasAuto.length)} activa${(PEOPLE.length - feriasAuto.length) !== 1 ? 's' : ''} · ${feriasAuto.length} férias
                </div>
              </div>
              <div class="gh-wiz-sub">Gere o pessoal de Porto Santo.</div>
            </div>
          </div>

          <!-- FÉRIAS BANNER -->
          ${feriasAuto.length ? `<div class="gh-ferias-banner tight">
            <span class="gh-ferias-banner-icon">🏖</span>
            <span>Férias esta semana: <strong>${feriasAuto.map(f => {
              const nomeLower = (f.nome || '').toLowerCase();
              const p = PEOPLE.find(x =>
                x.id === f.pid ||
                x.name === f.nome ||
                nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
              );
              return p ? p.name.split(' ')[0] : (f.nome || f.pid || '?');
            }).join(', ')}</strong></span>
          </div>` : ''}

          <!-- NAV + ADICIONAR -->
          <div class="gh-step2-actions">
            <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-1">← Voltar</button>
            <button id="gh-add-person" class="gh-add-btn gh-m0">+ Adicionar pessoa</button>
            <button class="gh-btn gh-btn-solid" id="gh-sub-abs">Continuar →</button>
          </div>
        </div>

        <!-- FORM ADICIONAR/EDITAR -->
        <div id="gh-person-form" class="gh-person-form">
          <div class="gh-pf-title" id="gh-pf-title">Nova pessoa</div>
          <div class="gh-pf-grid">
            <div class="gh-pf-field">
              <label>Nome completo</label>
              <input type="text" id="gh-pf-name" class="gh-field-sm" placeholder="Nome Apelido">
            </div>
            <div class="gh-pf-field">
              <label>Horas contrato</label>
              <input type="number" id="gh-pf-hrs" class="gh-field-sm" value="40" min="1" max="40">
            </div>
            <div class="gh-pf-field" id="gh-pf-start-field">
              <label id="gh-pf-start-label">Data de entrada</label>
              <input type="date" id="gh-pf-start" class="gh-field-sm">
            </div>
            <div class="gh-pf-field">
              <label>Último dia de trabalho (opcional)</label>
              <input type="date" id="gh-pf-end" class="gh-field-sm">
            </div>
            <div class="gh-pf-field">
              <label>Loja fixa</label>
              <select id="gh-pf-store" class="gh-field-sm">
                <option value="">— Sem loja fixa —</option>
                ${storeOptions}
              </select>
            </div>
            <div class="gh-pf-field full">
              <label>Autonomia</label>
              <select id="gh-pf-autonomia" class="gh-field-sm">
                <option value="efectiva">Efectiva — vínculo permanente, pode ficar sozinha todo o dia (peso 2)</option>
                <option value="autonoma">Autónoma — pode ficar sozinha todo o dia (peso 1.5)</option>
                <option value="autonoma_h">Autónoma-H — pode fazer intervalo sozinha, não fica sozinha o dia todo (peso 1.5)</option>
                <option value="nao_autonoma">Não autónoma — precisa sempre de supervisão (peso 1)</option>
              </select>
            </div>
            <div class="gh-pf-field">
              <label>Móvel (pode ser deslocada)</label>
              <select id="gh-pf-mobile" class="gh-field-sm">
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </div>
          </div>
          <div class="gh-pf-field mt">
            <label>Lojas onde pode trabalhar</label>
            <div class="gh-pf-stores" id="gh-pf-knows">
              ${STORES.map(s => `<label class="gh-pf-check"><input type="checkbox" value="${s.id}"> ${s.name}</label>`).join('')}
            </div>
          </div>
          <div class="gh-pf-field mt">
            <label>Evitar coincidência de folga/turno com (softAvoid)</label>
            <div class="gh-pf-stores" id="gh-pf-softavoid">
              <!-- preenchido dinamicamente por renderSoftAvoidOptions() -->
            </div>
          </div>
          <div class="gh-pf-actions">
            <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-pf-cancel">Cancelar</button>
            <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-pf-save">Guardar</button>
          </div>
        </div>

        <!-- LISTA DE PESSOAL — scroll natural de página, sem contenedor interno -->
        <div class="gh-staff-list" id="gh-staff-list"></div>

      </div>`;

    await loadIncidencias();
    renderStaffList(feriasAutoPids, feriasAuto);
    bindPersonForm(storeOptions);

    document.getElementById('gh-back-1').addEventListener('click', () => { wStep = 0; renderWiz(); });
    document.getElementById('gh-sub-abs').addEventListener('click', sub_abs);
  }


  // Converter dd/mm/aa ou dd/mm/aaaa para ISO YYYY-MM-DD
  function parseDateInput(val) {
    if (!val) return null;
    if (val.includes('-')) return val; // already ISO
    const parts = val.split('/');
    if (parts.length < 3) return null;
    let [d, m, y] = parts;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Primeiro nome + último apelido
  function shortName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    return parts[0] + ' ' + parts[parts.length - 1];
  }
  function renderStaffList(feriasAutoPids, feriasAuto = []) {
    const list = document.getElementById('gh-staff-list');
    if (!list) return;
    list.innerHTML = '';

    // Build a set of pids that are on ferias, matching by pid or partial name
    const feriasMatchedPids = new Set();
    feriasAuto.forEach(f => {
      const nomeLower = (f.nome || '').toLowerCase();
      const matched = PEOPLE.find(x =>
        x.id === f.pid ||
        x.name === f.nome ||
        nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
      );
      if (matched) feriasMatchedPids.add(matched.id);
    });

    const DIAS_PT = {SEG:'S',TER:'T',QUA:'Q',QUI:'Q',SEX:'S',SAB:'S',DOM:'D'};
    const DIAS_FULL = {SEG:'Segunda',TER:'Terça',QUA:'Quarta',QUI:'Quinta',SEX:'Sexta',SAB:'Sábado',DOM:'Domingo'};
    const DIAS = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];

    const sortedPeople = [...PEOPLE].sort((a,b) => a.name.localeCompare(b.name));
    // Pre-calculate max name width for uniform column
    const maxNameLen = sortedPeople.reduce((max, p) => Math.max(max, shortName(p.name).length), 0);
    const nameColW = Math.min(Math.max(maxNameLen * 7 + 20, 100), 160);
    sortedPeople.forEach(p => {
      const onFerias = feriasMatchedPids.has(p.id) || feriasAutoPids.has(p.id);
      const autoLabels = { efectiva: 'Efectiva', autonoma: 'Autónoma', autonoma_h: 'Autónoma-H', nao_autonoma: 'Não autónoma' };
      const condLabel = autoLabels[p.autonomia] || (p.efetiva ? 'Efectiva' : 'Nova');
      const storeName = p.store ? STORES.find(s=>s.id===p.store)?.name || p.store : 'Sem loja fixa';
      const folga   = S._folgas?.[p.id]   || {};
      const baixa   = S._baixas?.[p.id]   || {};
      const licenca = S._licencas?.[p.id] || {};
      const saldo   = S._banco?.[p.id]    || 0;
      // Dias dirigidos: fonte primária é _folgasDirigidas (estável entre regenerações)
      // Fallback para _folgas (carregado de Supabase) se não há dirigidas em memória
      const folgaDirigidaRec = S._folgasDirigidas?.[p.id];
      const diasDirigidos = Array.isArray(folgaDirigidaRec) ? folgaDirigidaRec :
        (folgaDirigidaRec?._weekDays?.length ? folgaDirigidaRec._weekDays : []);

      // Badge de aviso: datas pedidas que caem nesta semana
      let folgaPedidaTag = '';
      if (folgaDirigidaRec?._allDatas?.length && S.weekStart) {
        const weekEnd = new Date(S.weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
        const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
        const datasNaSemana = folgaDirigidaRec._allDatas.filter(ds => {
          const d = new Date(ds + 'T00:00:00');
          return d >= S.weekStart && d <= weekEnd;
        });
        if (datasNaSemana.length) {
          const labels = datasNaSemana.map(ds => {
            const d = new Date(ds + 'T00:00:00');
            return `${d.getDate()} ${MESES[d.getMonth()]}`;
          }).join(' · ');
          folgaPedidaTag = `<span class="gh-folga-tag">⚑ PEDIU FOLGA · ${labels.toUpperCase()}</span>`;
        }
      }

      const dayBtns = DIAS.map(d => {
        const active = Array.isArray(diasDirigidos) ? diasDirigidos.includes(d) : false;
        return `<button class="gh-day-btn${active?' gh-day-btn-on':''}" data-pid="${p.id}" data-day="${d}" title="${DIAS_FULL[d]}">${d.charAt(0)}</button>`;
      }).join('');

      const row = document.createElement('div');
      row.className = `gh-sr${onFerias ? ' gh-sr-ferias' : ''}`;
      row.dataset.pid = p.id;
      const saldoTag = saldo !== 0 ? `<sup class="gh-saldo-sup ${saldo>0?'gh-saldo-sup-neg':'gh-saldo-sup-pos'}">${saldo>0?'+':''}${saldo}h</sup>` : '';

      // Verificar se o contrato termina durante esta semana (ou já terminou)
      const hasContractEnd = p.end && S.weekStart;
      let contractEndTag = '';
      if (hasContractEnd) {
        const endDate = new Date(p.end + 'T00:00:00');
        const weekEnd = new Date(S.weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59,0);
        const weekStart = new Date(S.weekStart); weekStart.setHours(0,0,0,0);
        if (endDate <= weekEnd) {
          const endFmt = `${String(endDate.getDate()).padStart(2,'0')}/${String(endDate.getMonth()+1).padStart(2,'0')}`;
          contractEndTag = ` · <span class="gh-contract-end-tag">fim contrato ${endFmt}</span>`;
        }
      }

      row.innerHTML = `
        <!-- HEADER sempre visível -->
        <div class="gh-sr-header">
          <div class="gh-sr-header-left">
            <button class="gh-toggle-btn" data-pid="${p.id}">▶</button>
            <div class="gh-sr-nameblock">
              <span class="gh-sr-name">${shortName(p.name)}${saldoTag}</span>
              <span class="gh-sr-meta">${storeName} · <span class="gh-auto-badge gh-auto-${p.autonomia||'autonoma'}">${condLabel}</span>${onFerias?' · 🏖':''}${contractEndTag}</span>
              ${folgaPedidaTag ? `<div class="gh-mt2">${folgaPedidaTag}</div>` : ''}
            </div>
          </div>
          <div class="gh-sr-btns">
            <button class="gh-icon-btn gh-edit-person" data-pid="${p.id}" title="Editar">✏</button>
            <button class="gh-icon-btn gh-limpar-inc warn" data-pid="${p.id}" title="Limpar">↺</button>
            <button class="gh-icon-btn gh-del-person danger" data-pid="${p.id}" title="Eliminar">✕</button>
          </div>
        </div>

        <!-- CORPO colapsável -->
        <div class="gh-sr-body" id="gh-body-${p.id}">
          <div class="gh-sr-cols">
            <div class="gh-sr-col">
              <div class="gh-sr-col-title">📅 Folga</div>
              <div class="gh-day-btns">${dayBtns}</div>
              <div class="gh-sr-col-title mt">📋 Licença <input type="checkbox" class="gh-inc-usar" data-pid="${p.id}" data-col="lic_active" ${licenca.active?'checked':''}></div>
              <div class="gh-date-row">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_from" value="${licenca.data_inicio?licenca.data_inicio.slice(5).split('-').reverse().join('/')+'/'+licenca.data_inicio.slice(2,4):''}" placeholder="dd/mm/aa">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_to" value="${licenca.data_fim?licenca.data_fim.slice(5).split('-').reverse().join('/')+'/'+licenca.data_fim.slice(2,4):''}" placeholder="dd/mm/aa">
              </div>
              <div class="gh-date-row mt">
                <select class="gh-field-sm gh-inc-inp gh-sel-mini" data-pid="${p.id}" data-col="lic_tipo">
                  <option value="recuperavel" ${licenca.tipo==='recuperavel'||!licenca.tipo?'selected':''}>Rec.</option>
                  <option value="nao_recuperavel" ${licenca.tipo==='nao_recuperavel'?'selected':''}>N.Rec.</option>
                </select>
                <input type="number" class="gh-field-sm gh-inc-inp gh-num-mini" data-pid="${p.id}" data-col="lic_horas" value="${licenca.horas||''}" placeholder="h" step="0.5">
              </div>
            </div>
            <div class="gh-sr-col">
              <div class="gh-sr-col-title">🏥 Baixa <input type="checkbox" class="gh-inc-usar" data-pid="${p.id}" data-col="baixa_active" ${baixa.active?'checked':''}></div>
              <div class="gh-date-row">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="baixa_from" value="${baixa.data_inicio?baixa.data_inicio.slice(5).split('-').reverse().join('/')+'/'+baixa.data_inicio.slice(2,4):''}" placeholder="dd/mm/aa">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="baixa_to" value="${baixa.data_fim?baixa.data_fim.slice(5).split('-').reverse().join('/')+'/'+baixa.data_fim.slice(2,4):''}" placeholder="dd/mm/aa">
              </div>
              <div class="gh-sr-col-title mt">⏱ Banco <button class="gh-btn-guardar-inc gh-icon-btn gh-btn-guardar-inline" data-pid="${p.id}" title="Guardar baixa, licença e banco">💾</button></div>
              <div class="gh-inc-saldo ${saldo>0?'gh-inc-saldo-neg':saldo<0?'gh-inc-saldo-pos':''}" id="gh-saldo-${p.id}">${saldo>0?'+':''}${saldo}h</div>
              <div class="gh-banco-add-row">
                <input type="number" class="gh-field-sm gh-banco-h gh-num-mini" data-pid="${p.id}" placeholder="±h" step="0.5">
                <button class="gh-icon-btn gh-banco-lancar" data-pid="${p.id}" title="Lançar">＋</button>
                <button class="gh-icon-btn gh-banco-zero danger" data-pid="${p.id}" title="Zerar">✕</button>
              </div>
            </div>
          </div>
        </div>`;
      list.appendChild(row);
    });

    // Toggle collapse/expand
    list.querySelectorAll('.gh-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const body = document.getElementById('gh-body-' + pid);
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        btn.textContent = open ? '▶' : '▼';
        btn.style.transform = '';
      });
    });

    list.querySelectorAll('.gh-edit-person').forEach(btn => {
      btn.addEventListener('click', () => openEditPerson(btn.dataset.pid));
    });
    list.querySelectorAll('.gh-del-person').forEach(btn => {
      btn.addEventListener('click', () => deletePersonConfirm(btn.dataset.pid));
    });

    // Folga: botões de dia — guardam em S._folgasDirigidas (separado de S._folgas)
    // S._folgasDirigidas persiste durante toda a sessão e nunca é resetado por loadIncidencias
    list.querySelectorAll('.gh-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const day = btn.dataset.day;
        if (!S._folgasDirigidas) S._folgasDirigidas = {};
        // Compatibilidade: se o registo é o novo formato (objecto com _allDatas),
        // converter para array simples de nomes de dia para edição local no gerador
        if (S._folgasDirigidas[pid] && !Array.isArray(S._folgasDirigidas[pid])) {
          S._folgasDirigidas[pid] = S._folgasDirigidas[pid]._weekDays?.map(i =>
            ['seg','ter','qua','qui','sex','sab','dom'][i]
          ).filter(Boolean) || [];
        }
        if (!S._folgasDirigidas[pid]) S._folgasDirigidas[pid] = [];
        const dias = S._folgasDirigidas[pid];
        const idx = dias.indexOf(day);
        if (idx >= 0) dias.splice(idx, 1); else dias.push(day);
        btn.classList.toggle('gh-day-btn-on', dias.includes(day));
        // Também actualizar S._folgas para compatibilidade com confirmSchedule
        if (!S._folgas) S._folgas = {};
        if (!S._folgas[pid]) S._folgas[pid] = { dias: [] };
        S._folgas[pid].dias = [...dias];
      });
    });

    // Baixa: toggle e datas — SÓ actualizam memória local, NÃO gravam automaticamente
    list.querySelectorAll('.gh-inc-usar[data-col="baixa_active"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        if (!S._baixas) S._baixas = {};
        if (!S._baixas[pid]) S._baixas[pid] = {};
        S._baixas[pid]._pendente = true;
        // Marcar botão guardar
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) btn.classList.add('pending');
      });
    });
    list.querySelectorAll('.gh-inc-inp[data-col^="baixa"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        if (!S._baixas) S._baixas = {};
        if (!S._baixas[pid]) S._baixas[pid] = {};
        S._baixas[pid]._pendente = true;
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) btn.classList.add('pending');
      });
    });

    // Licença: toggle, datas e tipo — SÓ actualizam memória local
    list.querySelectorAll('.gh-inc-usar[data-col="lic_active"], .gh-inc-inp[data-col^="lic"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        // Mostrar/ocultar campo observação (lógica visual mantida)
        if (el.dataset.col === 'lic_tipo') {
          const tipo = el.value;
          const obsEl = document.getElementById('gh-lic-obs-' + pid);
          if (obsEl) obsEl.style.display = tipo === 'nao_recuperavel' ? '' : 'none';
        }
        if (!S._licencas) S._licencas = {};
        if (!S._licencas[pid]) S._licencas[pid] = {};
        S._licencas[pid]._pendente = true;
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) btn.classList.add('pending');
      });
    });

    // Botão guardar incidências por pessoa (baixa + licença + banco pendente)
    list.querySelectorAll('.gh-btn-guardar-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        btn.textContent = '⏳'; btn.classList.add('saving');
        let saved = false;

        // Guardar baixa se pendente
        if (S._baixas?.[pid]?._pendente) {
          const active = document.querySelector(`[data-col="baixa_active"][data-pid="${pid}"]`)?.checked || false;
          const from   = parseDateInput(document.querySelector(`[data-col="baixa_from"][data-pid="${pid}"]`)?.value);
          const to     = parseDateInput(document.querySelector(`[data-col="baixa_to"][data-pid="${pid}"]`)?.value);
          await saveBaixa(pid, { active, data_inicio: from || new Date().toISOString().split('T')[0], data_fim: to || null, observacao: '' });
          if (S._baixas[pid]) delete S._baixas[pid]._pendente;
          saved = true;
        }

        // Guardar licença se pendente
        if (S._licencas?.[pid]?._pendente) {
          const active = document.querySelector(`[data-col="lic_active"][data-pid="${pid}"]`)?.checked || false;
          const from   = parseDateInput(document.querySelector(`[data-col="lic_from"][data-pid="${pid}"]`)?.value);
          const to     = parseDateInput(document.querySelector(`[data-col="lic_to"][data-pid="${pid}"]`)?.value);
          const tipo   = document.querySelector(`[data-col="lic_tipo"][data-pid="${pid}"]`)?.value || 'recuperavel';
          const horas  = parseFloat(document.querySelector(`[data-col="lic_horas"][data-pid="${pid}"]`)?.value || 0) || 0;
          const obs    = document.querySelector(`[data-col="lic_obs"][data-pid="${pid}"]`)?.value || '';
          const licData = { active, data_inicio: from || new Date().toISOString().split('T')[0], data_fim: to || null, tipo, horas, observacao: obs };
          await saveLicenca(pid, licData);
          // Se recuperável e activa → lançar horas no banco automaticamente
          if (active && tipo === 'recuperavel' && horas > 0 && !S._licencas[pid]?._addedToBanco) {
            const novoSaldo = await lancarBanco(pid, horas);
            if (S._licencas) S._licencas[pid] = { ...(S._licencas[pid]||{}), _addedToBanco: true };
            const saldoEl = document.getElementById('gh-saldo-' + pid);
            if (saldoEl && novoSaldo !== undefined) {
              saldoEl.textContent = `${novoSaldo > 0 ? '+' : ''}${novoSaldo}h`;
              saldoEl.className = 'gh-inc-saldo ' + (novoSaldo > 0 ? 'gh-inc-saldo-neg' : novoSaldo < 0 ? 'gh-inc-saldo-pos' : '');
            }
          }
          if (S._licencas[pid]) delete S._licencas[pid]._pendente;
          saved = true;
        }

        // Restaurar botão
        btn.textContent = saved ? '✓' : '💾';
        btn.classList.remove('saving', 'pending');
        btn.classList.add('saved');
        if (saved) setTimeout(() => { btn.textContent = '💾'; }, 1500);
      });
    });

    // Banco de horas: lançar
    list.querySelectorAll('.gh-banco-lancar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const input = list.querySelector(`.gh-banco-h[data-pid="${pid}"]`);
        const h = parseFloat(input?.value || 0);
        if (!h) return;
        const novoSaldo = await lancarBanco(pid, h);
        input.value = '';
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl && novoSaldo !== undefined) {
          saldoEl.textContent = `Saldo: ${novoSaldo > 0 ? '+' : ''}${novoSaldo}h`;
          saldoEl.className = 'gh-inc-saldo ' + (novoSaldo > 0 ? 'gh-inc-saldo-neg' : novoSaldo < 0 ? 'gh-inc-saldo-pos' : '');
        }
      });
    });

    // Banco de horas: zerar saldo
    list.querySelectorAll('.gh-banco-zero').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const p = PEOPLE.find(x => x.id === pid);
        if (!confirm(`Zerar banco de horas de ${shortName(p?.name||pid)}?`)) return;
        if (!S._banco) S._banco = {};
        S._banco[pid] = 0;
        const sb = await getSupabase();
        if (sb) {
          try {
            await sb.from('gh_banco_horas').upsert(
              { pessoa_id: pid, saldo: 0, updated_at: new Date().toISOString() },
              { onConflict: 'pessoa_id' }
            );
          } catch(e) { console.error('Erro ao zerar banco:', e); }
        }
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl) { saldoEl.textContent = 'Saldo: 0h'; saldoEl.className = 'gh-inc-saldo'; }
        const input = list.querySelector(`.gh-banco-h[data-pid="${pid}"]`);
        if (input) input.value = '';
      });
    });

    // Limpar incidências
    list.querySelectorAll('.gh-limpar-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const p = PEOPLE.find(x => x.id === pid);
        if (!confirm(`Limpar todas as incidências de ${shortName(p?.name||pid)}?`)) return;
        await limparIncidencias(pid);
        // Reset day buttons
        list.querySelectorAll(`.gh-day-btn[data-pid="${pid}"]`).forEach(b => b.classList.remove('gh-day-btn-on'));
        // Reset checkboxes
        list.querySelectorAll(`.gh-inc-usar[data-pid="${pid}"]`).forEach(b => { b.checked = false; });
        // Reset inputs
        list.querySelectorAll(`.gh-inc-inp[data-pid="${pid}"]`).forEach(b => { b.value = ''; });
        // Reset saldo
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl) { saldoEl.textContent = 'Saldo: 0h'; saldoEl.className = 'gh-inc-saldo'; }
      });
    });
  }

  // ══ INCIDÊNCIAS — 4 tabelas separadas ══
  // gh_baixas: pessoa_id, data_inicio, data_fim, observacao, active
  // gh_licencas: pessoa_id, data_inicio, data_fim, tipo, horas, observacao, active
  // gh_folgas: pessoa_id, semana, dias[]  (por semana)
  // gh_banco_horas: pessoa_id, saldo  (acumulado, um registo por pessoa)

  // Carrega TUDO para a semana actual
  async function loadIncidencias() {
    if (!S.weekStart) return;
    const sb = await getSupabase();
    if (!sb) return;
    const weekKey  = S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0');
    const weekEnd  = new Date(S.weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndKey = weekEnd.toISOString().split('T')[0];

    // Reset state
    S._baixas   = {};  // pid → {id, data_inicio, data_fim, observacao, active}
    S._licencas = {};  // pid → {id, data_inicio, data_fim, tipo, horas, observacao, active}
    S._folgas   = {};  // pid → {id, dias[]}
    S._banco    = {};  // pid → saldo numérico
    S._bancoBase = {};  // pid → saldo base antes de edición inline

    try {
      // Baixas activas que se sobrepõem à semana
      const { data: baixas } = await sb.from('gh_baixas')
        .select('*').eq('active', true)
        .lte('data_inicio', weekEndKey);
      (baixas || []).forEach(b => {
        if (!b.data_fim || b.data_fim >= weekKey) S._baixas[b.pessoa_id] = b;
      });

      // Licenças activas que se sobrepõem à semana
      const { data: licencas } = await sb.from('gh_licencas')
        .select('*').eq('active', true)
        .lte('data_inicio', weekEndKey);
      (licencas || []).forEach(l => {
        if (!l.data_fim || l.data_fim >= weekKey) S._licencas[l.pessoa_id] = l;
      });

      // Folgas desta semana
      const { data: folgas } = await sb.from('gh_folgas')
        .select('*').eq('semana', weekKey);
      (folgas || []).forEach(f => { S._folgas[f.pessoa_id] = f; });

      // Banco de horas
      const { data: banco } = await sb.from('gh_banco_horas').select('*');
      if (!S._bancoBase) S._bancoBase = {};
      (banco || []).forEach(b => {
        S._banco[b.pessoa_id] = b.saldo || 0;
        S._bancoBase[b.pessoa_id] = b.saldo || 0;
      });

      // Folgas dirigidas — datas exactas solicitadas com antecedência
      // Só carregamos se ainda não há dados em memória (_folgasDirigidas persiste na sessão)
      if (!S._folgasDirigidas || Object.keys(S._folgasDirigidas).length === 0) {
        const { data: folgasDirigidas } = await sb.from('gh_folgas_dirigidas').select('*');
        S._folgasDirigidas = S._folgasDirigidas || {};
        (folgasDirigidas || []).forEach(r => {
          // Converter datas ISO para dias da semana que caem nesta semana
          if (!r.datas || !r.datas.length) return;
          const weekDays = [];
          r.datas.forEach(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const diff = Math.round((d - S.weekStart) / 86400000);
            if (diff >= 0 && diff <= 6) weekDays.push(diff); // índice 0-6
          });
          // Guardar as datas completas para o badge de aviso
          S._folgasDirigidas[r.pessoa_id] = {
            _allDatas: r.datas,
            _notas: r.notas || '',
            _weekDays: weekDays  // índices de dia dentro desta semana
          };
        });
      } else {
        // Sessão já tem dados — recalcular _weekDays para a nova semana
        Object.keys(S._folgasDirigidas).forEach(pid => {
          const rec = S._folgasDirigidas[pid];
          if (!rec || !rec._allDatas) return;
          const weekDays = [];
          rec._allDatas.forEach(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const diff = Math.round((d - S.weekStart) / 86400000);
            if (diff >= 0 && diff <= 6) weekDays.push(diff);
          });
          rec._weekDays = weekDays;
        });
      }

    } catch(e) { console.error('Erro ao carregar incidências:', e); }
  }

  // Guardar folga da semana
  async function saveFolga(pid, dias) {
    const sb = await getSupabase(); if (!sb) return;
    const weekKey = S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null;
    if (!weekKey) return;
    if (!S._folgas) S._folgas = {};
    S._folgas[pid] = { ...(S._folgas[pid] || {}), pessoa_id: pid, semana: weekKey, dias };
    try {
      await sb.from('gh_folgas').upsert({ pessoa_id: pid, semana: weekKey, dias },
        { onConflict: 'pessoa_id,semana' });
    } catch(e) { console.error('Erro ao guardar folga:', e); }
  }

  // Guardar/actualizar baixa
  async function saveBaixa(pid, data) {
    const sb = await getSupabase(); if (!sb) return;
    if (!S._baixas) S._baixas = {};
    try {
      if (S._baixas[pid]?.id) {
        await sb.from('gh_baixas').update(data).eq('id', S._baixas[pid].id);
        S._baixas[pid] = { ...S._baixas[pid], ...data };
      } else {
        const { data: res } = await sb.from('gh_baixas')
          .insert({ pessoa_id: pid, ...data }).select().single();
        if (res) S._baixas[pid] = res;
      }
    } catch(e) { console.error('Erro ao guardar baixa:', e); }
  }

  // Guardar/actualizar licença
  async function saveLicenca(pid, data) {
    const sb = await getSupabase(); if (!sb) return;
    if (!S._licencas) S._licencas = {};
    try {
      if (S._licencas[pid]?.id) {
        await sb.from('gh_licencas').update(data).eq('id', S._licencas[pid].id);
        S._licencas[pid] = { ...S._licencas[pid], ...data };
      } else {
        const { data: res } = await sb.from('gh_licencas')
          .insert({ pessoa_id: pid, ...data }).select().single();
        if (res) S._licencas[pid] = res;
      }
    } catch(e) { console.error('Erro ao guardar licença:', e); }
  }

  // Lançar horas no banco
  async function lancarBanco(pid, horas) {
    const sb = await getSupabase(); if (!sb) return;
    if (!S._banco) S._banco = {};
    const novoSaldo = Math.round(((S._banco[pid] || 0) + horas) * 10) / 10;
    S._banco[pid] = novoSaldo;
    try {
      await sb.from('gh_banco_horas').upsert(
        { pessoa_id: pid, saldo: novoSaldo, updated_at: new Date().toISOString() },
        { onConflict: 'pessoa_id' }
      );
    } catch(e) { console.error('Erro ao lançar banco de horas:', e); }
    return novoSaldo;
  }

  // Limpar incidências da semana para uma pessoa (folga + baixa + licença)
  async function limparIncidencias(pid) {
    const sb = await getSupabase(); if (!sb) return;
    const weekKey = S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null;
    try {
      // Folga desta semana
      if (S._folgas?.[pid]?.id) {
        await sb.from('gh_folgas').delete().eq('id', S._folgas[pid].id);
        delete S._folgas[pid];
      } else if (weekKey) {
        await sb.from('gh_folgas').delete().eq('pessoa_id', pid).eq('semana', weekKey);
      }
      // Baixa activa
      if (S._baixas?.[pid]?.id) {
        await sb.from('gh_baixas').update({ active: false }).eq('id', S._baixas[pid].id);
        delete S._baixas[pid];
      }
      // Licença activa
      if (S._licencas?.[pid]?.id) {
        await sb.from('gh_licencas').update({ active: false }).eq('id', S._licencas[pid].id);
        delete S._licencas[pid];
      }
    } catch(e) { console.error('Erro ao limpar incidências:', e); }
  }

  async function deletePersonConfirm(pid) {
    const p = PEOPLE.find(x => x.id === pid);
    if (!p) return;
    const sb = await getSupabase();
    if (!sb) { alert('Supabase não disponível.'); return; }

    // Se a pessoa está associada a mais do que uma loja (via knows),
    // perguntar se quer apenas remover de uma loja ou eliminar por completo.
    const knows = p.knows || [];
    if (knows.length > 1) {
      // Construir lista de lojas conhecidas para o utilizador escolher
      const storeNames = knows.map(sid => {
        const st = STORES.find(s => s.id === sid);
        return st ? `• ${st.name} (id: ${sid})` : `• ${sid}`;
      }).join('\n');
      const choice = window.prompt(
        `"${p.name}" está associada a ${knows.length} lojas:\n${storeNames}\n\n` +
        `Escreva o NOME da loja para a remover apenas dessa loja,\n` +
        `ou deixe em branco e prima OK para ELIMINAR a pessoa por completo.`
      );
      // User cancelled
      if (choice === null) return;

      if (choice.trim() !== '') {
        // Remove from a specific store only
        const matchedStore = STORES.find(s =>
          s.name.toLowerCase().includes(choice.trim().toLowerCase()) ||
          s.short?.toLowerCase().includes(choice.trim().toLowerCase()) ||
          s.id === choice.trim()
        );
        if (!matchedStore) {
          alert(`Loja "${choice.trim()}" não encontrada. Operação cancelada.`);
          return;
        }
        try {
          const newKnows = knows.filter(sid => sid !== matchedStore.id);
          const newStore = p.store === matchedStore.id ? (newKnows[0] || null) : p.store;
          const { error } = await sb.from('gh_people')
            .update({ knows: newKnows, store_id: newStore })
            .eq('id', pid);
          if (error) throw error;
          await loadKnowledgeBase();
          await loadIncidencias();
          const feriasAuto = typeof window.getFeriasParaSemana === 'function' && S.weekStart
            ? window.getFeriasParaSemana(S.weekStart).filter(f => f.pid) : [];
          renderStaffList(new Set(feriasAuto.map(f => f.pid)), feriasAuto);
        } catch(e) {
          console.error('Remove from store error:', e);
          alert('Erro ao remover da loja. Verifique a consola.');
        }
        return;
      }
      // Blank → fall through to full delete below, with confirmation
    }

    // Full delete
    if (!confirm(`Eliminar "${p.name}" por completo? Esta acção não pode ser desfeita.`)) return;
    try {
      // Eliminar registos dependentes antes de apagar a pessoa (evita FK 23503)
      await sb.from('gh_licencas').delete().eq('pessoa_id', pid);
      await sb.from('gh_baixas').delete().eq('pessoa_id', pid);
      await sb.from('gh_folgas').delete().eq('pessoa_id', pid);
      await sb.from('gh_banco_horas').delete().eq('pessoa_id', pid);
      const { error } = await sb.from('gh_people').delete().eq('id', pid);
      if (error) throw error;
      if (S._licencas) delete S._licencas[pid];
      if (S._baixas)   delete S._baixas[pid];
      if (S._folgas)   delete S._folgas[pid];
      if (S._banco)    delete S._banco[pid];
      await loadKnowledgeBase();
      await loadIncidencias();
      const feriasAuto = typeof window.getFeriasParaSemana === 'function' && S.weekStart
        ? window.getFeriasParaSemana(S.weekStart).filter(f => f.pid) : [];
      renderStaffList(new Set(feriasAuto.map(f => f.pid)), feriasAuto);
    } catch(e) {
      console.error('Delete error:', e);
      alert('Erro ao eliminar. Verifique a consola.');
    }
  }

  let _editingPid = null;

  function bindPersonForm(storeOptions) {
    document.getElementById('gh-add-person').addEventListener('click', () => {
      _editingPid = null;
      document.getElementById('gh-pf-title').textContent = 'Nova pessoa';
      document.getElementById('gh-pf-name').value = '';
      document.getElementById('gh-pf-hrs').value = '40';
      document.getElementById('gh-pf-start').value = '';
      document.getElementById('gh-pf-end').value = '';
      document.getElementById('gh-pf-store').value = '';
      document.getElementById('gh-pf-autonomia').value = 'autonoma';
      document.getElementById('gh-pf-mobile').value = 'false';
      document.querySelectorAll('#gh-pf-knows input').forEach(cb => { cb.checked = false; });
      renderSoftAvoidOptions(null, []);
      document.getElementById('gh-person-form').style.display = 'block';
    });

    document.getElementById('gh-pf-cancel').addEventListener('click', () => {
      document.getElementById('gh-person-form').style.display = 'none';
      _editingPid = null;
    });

    // Toggle start date label/required based on autonomia
    document.getElementById('gh-pf-autonomia').addEventListener('change', function() {
      const lbl = document.getElementById('gh-pf-start-label');
      if (lbl) lbl.textContent = this.value === 'efectiva' ? 'Data de entrada (opcional)' : 'Data de entrada';
    });

    document.getElementById('gh-pf-save').addEventListener('click', savePersonForm);
  }

  function openEditPerson(pid) {
    const p = PEOPLE.find(x => x.id === pid); if (!p) return;
    _editingPid = pid;
    document.getElementById('gh-pf-title').textContent = 'Editar — ' + p.name;
    document.getElementById('gh-pf-name').value = p.name;
    document.getElementById('gh-pf-hrs').value = p.hrs || 40;
    document.getElementById('gh-pf-start').value = p.start || '';
    const lbl = document.getElementById('gh-pf-start-label');
    if (lbl) lbl.textContent = p.autonomia === 'efectiva' ? 'Data de entrada (opcional)' : 'Data de entrada';
    document.getElementById('gh-pf-end').value = p.end || '';
    document.getElementById('gh-pf-store').value = p.store || '';
    document.getElementById('gh-pf-autonomia').value = p.autonomia || 'autonoma';
    document.getElementById('gh-pf-mobile').value = p.mobile ? 'true' : 'false';
    document.querySelectorAll('#gh-pf-knows input').forEach(cb => {
      cb.checked = (p.knows || []).includes(cb.value);
    });
    renderSoftAvoidOptions(p.id, p.softAvoid || []);
    document.getElementById('gh-person-form').style.display = 'block';
  }

  // Renderiza checkboxes de softAvoid (excluindo a própria pessoa)
  function renderSoftAvoidOptions(selfPid, currentSoftAvoid) {
    const container = document.getElementById('gh-pf-softavoid');
    if (!container) return;
    const others = PEOPLE.filter(p => p.id !== selfPid).sort((a,b) => a.name.localeCompare(b.name));
    if (!others.length) { container.innerHTML = '<span class="gh-muted-note">Sem outras pessoas na BD.</span>'; return; }
    container.innerHTML = others.map(p =>
      `<label class="gh-pf-check">
        <input type="checkbox" name="gh-pf-softavoid-cb" value="${p.id}" ${(currentSoftAvoid||[]).includes(p.id) ? 'checked' : ''}>
        ${p.name.split(' ')[0]}
      </label>`
    ).join('');
  }

  async function savePersonForm() {
    const name     = document.getElementById('gh-pf-name').value.trim();
    const hrs      = parseInt(document.getElementById('gh-pf-hrs').value) || 40;
    const start    = document.getElementById('gh-pf-start').value;
    const end      = document.getElementById('gh-pf-end').value || null;
    const store    = document.getElementById('gh-pf-store').value || null;
    const autonomia  = document.getElementById('gh-pf-autonomia').value || 'autonoma';
    const efetiva    = autonomia === 'efectiva';
    const canAlone   = autonomia === 'efectiva' || autonomia === 'autonoma';
    const mobile   = document.getElementById('gh-pf-mobile').value === 'true';
    const knows     = [...document.querySelectorAll('#gh-pf-knows input:checked')].map(cb => cb.value);
    const newSoftAvoid = [...document.querySelectorAll('[name="gh-pf-softavoid-cb"]:checked')].map(cb => cb.value);

    // Start date required only for new staff (efectivas may not have it)
    if (!name) { alert('Nome é obrigatório.'); return; }
    if (autonomia !== 'efectiva' && !start) { alert('Data de entrada é obrigatória para pessoal não-efectivo.'); return; }

    // soft_avoid vem do formulário (checkboxes); hard_avoid preservado da BD
    const existingP = _editingPid ? PEOPLE.find(x => x.id === _editingPid) : null;
    const softAvoid = newSoftAvoid; // lido dos checkboxes do formulário
    const hardAvoid = existingP?.hardAvoid || []; // preservado — sem UI por enquanto

    // cover_pri é sempre derivado de autonomia — nunca preservado de dados antigos.
    // efectiva=1 (maior prioridade de cobertura), autonoma=3, autonoma_h=5, nao_autonoma=9
    const autoPriMap = { efectiva: 1, autonoma: 3, autonoma_h: 5, nao_autonoma: 9 };
    const coverPri = autoPriMap[autonomia] ?? 9;

    const data = {
      name, hrs, store_id: store,
      autonomia,                          // novo campo principal
      efetiva,                            // derivado — mantido para compatibilidade
      can_alone: canAlone,                // derivado
      start_date: start || null,
      end_date: end || null,
      mobile, cover_pri: coverPri,
      knows, hard_avoid: hardAvoid, soft_avoid: softAvoid, active: true
    };

    let saved;
    if (_editingPid) {
      saved = await supabaseUpdate('gh_people', _editingPid, data);
    } else {
      // Generate a simple slug id from name
      data.id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 20) + '_' + Date.now().toString(36);
      saved = await supabaseInsert('gh_people', data);
    }

    if (saved) {
      // Reload people from Supabase and re-render
      await loadKnowledgeBase();
      document.getElementById('gh-person-form').style.display = 'none';
      _editingPid = null;
      const feriasAuto = typeof window.getFeriasParaSemana === 'function' && S.weekStart
        ? window.getFeriasParaSemana(S.weekStart).filter(f => f.pid) : [];
      renderStaffList(new Set(feriasAuto.map(f => f.pid)), feriasAuto);
    } else {
      alert('Erro ao guardar. Verifique a ligação ao Supabase.');
    }
  }

  function sub_abs() {
    // Férias automáticas de Porto Santo
    let feriasAuto = [];
    if (typeof window.getFeriasParaSemana === 'function' && S.weekStart) {
      feriasAuto = window.getFeriasParaSemana(S.weekStart).filter(f => (f.loja||'').toLowerCase().includes('porto santo'));
    }

    // Build absences from férias
    S.absences = feriasAuto.map(f => {
      // Match person by pid or name
      const nomeLower = (f.nome || '').toLowerCase();
      const p = PEOPLE.find(x =>
        x.id === f.pid ||
        x.name === f.nome ||
        nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
      );
      // 'to': último dia de férias nesta semana.
      // Se f.to existir usa-o directamente; se f.data_fim existir converte para dia da semana;
      // sem info assume ausente até ao fim da semana (DOM).
      const toDay = f.to || (f.data_fim ? dayOfWeekKey(f.data_fim) : null) || 'DOM';
      return { pid: p ? p.id : f.pid, type: 'ferias', from: f.from || 'SEG', to: toDay };
    }).filter(a => a.pid);

    // Adicionar baixas activas à lista de ausências
    if (S._baixas) {
      Object.entries(S._baixas).forEach(([pid, b]) => {
        if (!b.active) return;
        if (S.absences.find(a => a.pid === pid)) return;
        const toDay = b.data_fim ? dayOfWeekKey(b.data_fim) : null;
        S.absences.push({ pid, type: 'baixa', from: 'SEG', to: toDay || 'DOM' });
      });
    }

    // Adicionar licenças activas como ausência (independentemente do tipo)
    if (S._licencas) {
      Object.entries(S._licencas).forEach(([pid, l]) => {
        if (!l.active) return;
        if (S.absences.find(a => a.pid === pid)) return;
        const toDay = l.data_fim ? dayOfWeekKey(l.data_fim) : null;
        S.absences.push({ pid, type: l.tipo === 'nao_recuperavel' ? 'na' : 'licenca', from: 'SEG', to: toDay || 'DOM' });
      });
    }

    // Folgas direccionadas — o algoritmo usa estes dias como folga fixa
    S._folgaDirigida = {};
    if (S._folgas) {
      Object.entries(S._folgas).forEach(([pid, f]) => {
        if (f.dias?.length) S._folgaDirigida[pid] = f.dias;
      });
    }

    wStep = 2; renderWiz();
  }

  // ── WIZARD: PASSO 3 — LOJAS E DIAS ──
  function wiz_stores() {
    const c = getContainer(); if (!c) return;
    const defD = ['SEG','TER','QUA','QUI','SEX','SAB'];

    const rows = STORES.map(st => {
      const open    = S.openStores.length ? S.openStores.includes(st.id) : (STORES.find(s=>s.id===st.id)?.priority ?? 9) < 4;
      const days    = S.openDays[st.id]   || (open ? [...defD] : []);

      const togs = DAYS.map(d => {
        const isOn = days.includes(d);
        const isDom = d === 'DOM';
        return `<span class="gh-dtog ${isOn ? 'on' : ''} ${isDom ? 'gh-dtog-dom' : ''}" data-store="${st.id}" data-day="${d}">${d}</span>`;
      }).join('');

      return `
      <div class="gh-sc-row ${!open ? 'closed' : ''}" id="gh-scr-${st.id}">
        <div class="gh-sc-top">
          <input type="checkbox" id="gh-chk-${st.id}" ${open ? 'checked' : ''} data-store="${st.id}">
          <label for="gh-chk-${st.id}" class="gh-sc-name">${st.name}</label>
        </div>
        <div class="gh-sc-days" id="gh-scd-${st.id}">${togs}</div>
      </div>`;
    }).join('');

    c.innerHTML = `
      <div class="gh-wiz-box gh-wiz-box--wide">
        <div class="gh-wiz-label">Passo 3 de 3</div>
        <div class="gh-wiz-title">Lojas e dias</div>
        <div class="gh-store-cfg">${rows}</div>

        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-2">← Voltar</button>
          <button class="gh-btn gh-btn-solid" id="gh-sub-stores">Gerar horário →</button>
        </div>
      </div>`;

    c.querySelectorAll('input[type=checkbox][data-store]').forEach(el => {
      el.addEventListener('change', () => {
        const row = document.getElementById(`gh-scr-${el.dataset.store}`);
        row.classList.toggle('closed', !el.checked);
        if (el.checked) {
          row.querySelectorAll('.gh-dtog').forEach(tog => {
            if (['SEG','TER','QUA','QUI','SEX','SAB'].includes(tog.dataset.day)) tog.classList.add('on');
            else tog.classList.remove('on');
          });
        } else {
          row.querySelectorAll('.gh-dtog').forEach(tog => tog.classList.remove('on'));
        }
      });
    });

    c.querySelectorAll('.gh-dtog').forEach(el => {
      el.addEventListener('click', () => { el.classList.toggle('on'); });
    });

    document.getElementById('gh-back-2').addEventListener('click', () => { wStep = 1; renderWiz(); });
    document.getElementById('gh-sub-stores').addEventListener('click', sub_stores);
  }

  function sub_stores() {
    S.openStores = []; S.openDays = {}; S.storeMin = {}; S.storeMax = {}; S.storeMode = {};
    STORES.forEach(st => {
      const chk = document.getElementById(`gh-chk-${st.id}`); if (!chk?.checked) return;
      const days = [...document.querySelectorAll(`[data-store="${st.id}"].gh-dtog.on`)].map(e => e.dataset.day);
      if (!days.length) return;
      S.openStores.push(st.id); S.openDays[st.id] = days;
    });
    if (!S.openStores.length) { alert('Selecione pelo menos uma loja.'); return; }

    // domingo open = any store has DOM in its days
    S.domingoAberto = S.openStores.some(sid => S.openDays[sid]?.includes('DOM'));

    // Build schedule: empty for work cells, but mark absences/folgas from wizard
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    S.schedule = {};
    active.forEach(p => {
      S.schedule[p.id] = {};
      DAYS.forEach(day => {
        // Check fim de contrato — tem prioridade sobre tudo
        if (isContractEnded(p, day)) {
          S.schedule[p.id][day] = { type: 'fim_contrato', shift: null, store: null };
          return;
        }
        // Check absence
        if (isAbsent(p.id, day)) {
          const a = absOf(p.id);
          const t = a?.type === 'ferias' ? 'ferias' : a?.type === 'baixa' ? 'baixa' : a?.type === 'na' ? 'na' : 'folga';
          S.schedule[p.id][day] = { type: t, shift: null, store: null };
          return;
        }
        // Check folga direccionada
        const _fdRec = S._folgasDirigidas?.[p.id];
        const folgaDias = Array.isArray(_fdRec) ? _fdRec : (_fdRec?._weekDays || []);
        // folgaDias são índices de dia (0=Seg…6=Dom) na nova estrutura
        // mas o código antigo usava nomes de dia (ex: 'seg') — verificar ambos
        const dayIdx = ['seg','ter','qua','qui','sex','sab','dom'].indexOf(day);
        if (folgaDias.includes(day) || (dayIdx >= 0 && folgaDias.includes(dayIdx))) {
          S.schedule[p.id][day] = { type: 'folga', shift: null, store: null };
          return;
        }
        // Everything else: empty (not assigned yet)
        S.schedule[p.id][day] = { type: 'empty', shift: null, store: null };
      });
    });
    S.alerts = []; S.decisions = [];
    showSchedule(active);
  }

  // ── CONFIRMAR HORARIO — graba todo en Supabase ──
  async function confirmSchedule(active) {
    const sb = await getSupabase(); if (!sb) { alert('Supabase não disponível.'); return; }
    const weekKey = S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null;
    if (!weekKey) return;

    const btn = document.getElementById('gh-btn-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'A guardar…'; }

    // DOM só conta se havia tiendas abertas ao domingo essa semana
    const domingoAberto = S.openStores.some(sid => S.openDays[sid]?.includes('DOM'));

    try {
      for (const p of active) {
        const dias = [];
        DAYS.forEach(day => {
          const cell = S.schedule[p.id]?.[day];
          if (cell?.type !== 'folga') return;
          if (day === 'DOM' && !domingoAberto) return;
          dias.push(day);
        });

        // Não guardar semanas sem folgas reais (férias completas, etc.)
        if (!dias.length) continue;

        await sb.from('gh_folgas').upsert(
          { pessoa_id: p.id, semana: weekKey, dias },
          { onConflict: 'pessoa_id,semana' }
        );
      }

      S.alerts.push({ type: 'info', text: '✓ Folgas guardadas.' });
      if (btn) { btn.textContent = '✓ Guardado'; btn.style.background = '#1a6c1a'; }

      // Actualizar banco de horas — lógica correcta con historial por semana
      S._isEditing = false;
      try {
        const sb = await getSupabase();
        if (sb) {
          // Cargar registros actuales de banco de horas
          const { data: bancoDB } = await sb.from('gh_banco_horas').select('*');
          const bancoMap = {};
          (bancoDB || []).forEach(b => { bancoMap[b.pessoa_id] = b; });

          const bancoUpdates = [];
          PEOPLE.forEach(p => {
            if (!S.schedule[p.id]) return;

            // Calcular horas reales de esta persona en esta semana
            const realHrs = calcPersonHrs(p.id);
            const tieneHorario = DAYS.some(d => S.schedule[p.id]?.[d]?.type === 'work');
            const temBaseline = S._contribSemana && typeof S._contribSemana[p.id] === 'number';

            // Sem horário nesta semana: só há algo a fazer se a pessoa TINHA
            // contribuição desta mesma semana (foi removida ao editar) — nesse
            // caso essa contribuição é desfeita. Caso contrário, não tocar.
            if (!tieneHorario && !temBaseline) return;

            const diffSemana = tieneHorario ? calcBancoDiff(p.id, realHrs) : 0;

            const registro = bancoMap[p.id] || { saldo: 0, saldo_semana: 0, ultima_semana: null };
            let saldoBase = registro.saldo || 0;

            // Reverter o que ESTA semana já contribuiu, antes de aplicar o novo
            // valor — para que republicar sem alterações tenha efeito zero:
            // 1º) baseline em memória: derivada do próprio horário carregado ao
            //     abrir a semana publicada (cobre republicar QUALQUER semana,
            //     mesmo depois de outras terem sido publicadas entretanto);
            // 2º) sem baseline: comportamento antigo — só quando esta é a mesma
            //     semana que a última registada na BD.
            if (temBaseline) {
              saldoBase = Math.round((saldoBase - S._contribSemana[p.id]) * 10) / 10;
            } else if (registro.ultima_semana === weekKey) {
              saldoBase = Math.round((saldoBase - (registro.saldo_semana || 0)) * 10) / 10;
            }

            const novoSaldo = Math.round((saldoBase + diffSemana) * 10) / 10;
            S._banco[p.id] = novoSaldo;
            if (!S._bancoBase) S._bancoBase = {};
            S._bancoBase[p.id] = novoSaldo;
            if (!S._contribSemana) S._contribSemana = {};
            S._contribSemana[p.id] = diffSemana;

            bancoUpdates.push(
              sb.from('gh_banco_horas').upsert(
                {
                  pessoa_id: p.id,
                  saldo: novoSaldo,
                  saldo_semana: diffSemana,
                  ultima_semana: weekKey,
                  updated_at: new Date().toISOString()
                },
                { onConflict: 'pessoa_id' }
              )
            );
          });
          await Promise.all(bancoUpdates);
        }
      } catch(e) { console.warn('Erro ao actualizar banco de horas:', e); }

      // Apagar borrador desta semana (já foi publicado)
      await deleteBorrador(weekKey);

      // Publicar CSV de Porto Santo — separado para não bloquear em caso de erro
      try {
        await publishPortoSantoCSV();
        S.alerts.push({ type: 'info', text: '✓ Horário publicado.' });
        // Show retry publish button replaced by success
        const retryBtn = document.getElementById('gh-btn-retry-csv');
        if (retryBtn) retryBtn.remove();
      } catch(csvErr) {
        console.error('Erro ao publicar CSV:', csvErr);
        // Show retry button instead of blocking alert
        let retryBtn = document.getElementById('gh-btn-retry-csv');
        if (!retryBtn) {
          retryBtn = document.createElement('button');
          retryBtn.id = 'gh-btn-retry-csv';
          retryBtn.className = 'gh-btn gh-btn-ghost gh-btn-sm';
          retryBtn.textContent = '↺ Republicar CSV';
          retryBtn.classList.add('gh-btn-retry');
          retryBtn.addEventListener('click', async () => {
            retryBtn.disabled = true;
            retryBtn.textContent = 'A publicar…';
            try {
              await publishPortoSantoCSV();
              retryBtn.remove();
              S.alerts.push({ type: 'info', text: '✓ CSV publicado.' });
              const active = PEOPLE.filter(p => !fullyAbsent(p.id));
              showSchedule(active);
            } catch(e2) {
              retryBtn.disabled = false;
              retryBtn.textContent = '↺ Republicar CSV';
              alert('Erro ao publicar: ' + (e2.message || e2));
            }
          });
          const confirmBtn = document.getElementById('gh-btn-confirm');
          confirmBtn?.parentNode?.insertBefore(retryBtn, confirmBtn.nextSibling);
        }
        S.alerts.push({ type: 'warn', text: '⚠ Folgas guardadas mas CSV não publicado. Clique em "Republicar CSV".' });
      }

    } catch(e) {
      console.error('Erro ao confirmar horário:', e);
      alert('Erro ao guardar folgas. Verifique a consola.');
      if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar horário'; }
    }
  }

  // ── PORTO SANTO CSV BUILDER + PUBLISHER ──

  // Map store id → short name used in CSV
  const PS_STORE_SHORT = {
    'shana':   'SHANA',
    'mercado': 'MEZKA MERCADO',
    'avenida': 'MEZKA AVENIDA',
    'maxx':    'MAXX',
  };

  // Map store id → alias shown when person works there from another store's block
  const PS_STORE_ALIAS = {
    'shana':   'SHANA',
    'mercado': 'MEZKA MERCADO',
    'avenida': 'MEZKA AVENIDA',
    'maxx':    'MAXX',
  };

  // Build first+last initial name like "MARILIA S." from full name
  function psShortName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].toUpperCase();
    const first = parts[0];
    const last  = parts[parts.length - 1];
    return (first + ' ' + last[0] + '.').toUpperCase();
  }

  // Format a date as DD/MM/YYYY
  function psDateFmt(d) {
    return String(d.getDate()).padStart(2,'0') + '/' +
           String(d.getMonth()+1).padStart(2,'0') + '/' +
           d.getFullYear();
  }

  // Build the Porto Santo CSV block from current S.schedule
  function buildPortoSantoCSV() {
    if (!S.weekStart) return '';
    const DAYS_ORDER = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
    const dates = DAYS_ORDER.map((_,i) => {
      const d = new Date(S.weekStart);
      d.setDate(d.getDate() + i);
      return psDateFmt(d);
    });

    // Determine which stores have at least one person with work shifts
    console.log('[GH] S.openStores:', S.openStores, 'STORES:', STORES.map(s=>s.id), 'S.schedule keys:', Object.keys(S.schedule).length);
    const openStoreIds = STORES
      .filter(st => S.openStores.includes(st.id))
      .sort((a,b) => a.priority - b.priority)
      .map(st => st.id)
      .filter(sid => {
        // Has at least one person working in this store
        return PEOPLE.some(p => {
          return DAYS_ORDER.some(day => {
            const cell = S.schedule[p.id]?.[day];
            return cell && cell.type === 'work' && cell.store === sid;
          });
        });
      });

    if (!openStoreIds.length) return '';

    const lines = [];

    openStoreIds.forEach((sid, storeIdx) => {
      const storeShort = PS_STORE_SHORT[sid] || sid.toUpperCase();

      // Get people assigned to this store (with at least one work day here, or apoio)
      const storePeople = PEOPLE.filter(p =>
        S._personStores?.[p.id]?.includes(sid) ||
        DAYS_ORDER.some(day => S.schedule[p.id]?.[day]?.store === sid && S.schedule[p.id]?.[day]?.type === 'work') ||
        DAYS_ORDER.some(day => S._apoioShifts?.[p.id]?.[day]?.store === sid)
      );

      if (!storePeople.length) return;

      // NO blank line between stores — all stores in one block (same as datosfnc.csv format)
      // Only add blank line before first store if not first
      lines.push(['PORTO SANTO', 'SEG','TER','QUA','QUI','SEX','SAB','DOM'].join(','));
      lines.push([storeShort, ...dates].join(','));

      storePeople.forEach(p => {
        // Calculate actual hours worked this week
        const actualHrs = calcPersonHrs(p.id);
        const nameLabel = psShortName(p.name) + actualHrs + 'hrs';
        const rowA = [nameLabel];
        const rowB = [nameLabel];

        DAYS_ORDER.forEach(day => {
          const cell = S.schedule[p.id]?.[day] || { type: 'na' };

          if (cell.type === 'folga' || cell.type === 'ferias' || cell.type === 'baixa' || cell.type === 'baixa_medica' || cell.type === 'fora_contrato') {
            // Licença: o texto publicado tem de distinguir recuperável / não recuperável,
            // senão essa escolha perde-se ao reabrir a semana publicada mais tarde.
            const lbl = cell.type === 'ferias' ? 'FERIAS'
              : cell.type === 'baixa_medica' ? 'BAIXA MEDICA'
              : cell.type === 'fora_contrato' ? 'FORA DE CONTRATO'
              : cell.type === 'baixa' ? (cell.recuperavel === false ? 'LICENÇA NAO REC.' : 'LICENÇA')
              : 'FOLGA';
            rowA.push(lbl);
            rowB.push((cell.type === 'baixa' || cell.type === 'baixa_medica' || cell.type === 'fora_contrato') ? '' : lbl);
          } else if (cell.type === 'work') {
            // Check if person does apoio in this store on this day
            const apoioHere = S._apoioShifts?.[p.id]?.[day]?.store === sid;
            if (apoioHere) {
              rowA.push(S._apoioShifts[p.id][day].shift || '14:00-15:00');
              rowB.push('');
            } else if (cell.store === sid) {
              // Working here — show shift split into morning/afternoon
              const parts = (cell.shift || '').split('|');
              rowA.push(parts[0] || '');
              rowB.push(parts[1] || '');
            } else {
              // Working in another store — alias only in row A, row B empty
              const alias = PS_STORE_ALIAS[cell.store] || (cell.store || '').toUpperCase();
              rowA.push(alias);
              rowB.push('');
            }
          } else if (cell.type === 'fim_contrato') {
            rowA.push('');
            rowB.push('');
          } else {
            rowA.push('');
            rowB.push('');
          }
        });

        lines.push(rowA.map(v => v.includes(',') ? '"' + v + '"' : v).join(','));
        lines.push(rowB.map(v => v.includes(',') ? '"' + v + '"' : v).join(','));
      });
      // NO blank line — stores stay in same block
    });

    return lines.join('\r\n');
  }

  // ── LOAD A PUBLISHED PORTO WEEK BACK INTO THE GERADOR FOR EDITING ──
  async function loadPortoWeekForEdit(weekISO) {
    const sb = await getSupabase();
    if (!sb) { renderWiz(); return; }

    const c = getContainer(); if (!c) return;
    c.innerHTML = '<div class="gh-loading-msg">A carregar horário publicado…</div>';
    fixPanelLayout();

    try {
      const BASE_DATE_EDIT = new Date('2026-01-05T00:00:00');
      const weekMsEdit = new Date(weekISO + 'T00:00:00') - BASE_DATE_EDIT;
      const weekNumEdit = Math.round(weekMsEdit / (7 * 86400000)) + 1;
      const portoFile = 'porto_s' + weekNumEdit + '.csv';
      const { data: urlData } = sb.storage.from('horarios').getPublicUrl(portoFile);
      const res = await fetch(urlData.publicUrl + '?t=' + Date.now());
      if (!res.ok) throw new Error(portoFile + ' não encontrado');
      const csvText = await res.text();

      // Parse CSV into blocks
      const rows = csvText.split(/\r?\n/).map(line => line.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
      const blocks = [];
      let cur = [];
      rows.forEach(r => {
        if (r.every(c => c === '')) { if (cur.length) { blocks.push(cur); cur = []; } }
        else cur.push(r);
      });
      if (cur.length) blocks.push(cur);

      // Find block matching weekISO date (convert to DD/MM/YYYY)
      const d = new Date(weekISO + 'T00:00:00');
      const targetDate = String(d.getDate()).padStart(2,'0') + '/' +
                         String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();

      let targetBlock = null;
      for (const block of blocks) {
        for (const row of block) {
          if (row.slice(1).some(c => c === targetDate)) { targetBlock = block; break; }
        }
        if (targetBlock) break;
      }

      if (!targetBlock) throw new Error('Semana não encontrada no CSV publicado');

      // Restore S state from the block
      S = blank();
      S.weekStart = new Date(weekISO + 'T00:00:00');
      S.openStores = STORES.map(st => st.id); // assume all stores open; refine below
      S.openDays   = {};
      S.storeMin   = {};
      S.storeMax   = {};
      S._personStores = {};
      S._storeOrder   = {};

      // Build schedule from CSV block
      // Block structure: repeating groups of:
      //   [PORTO SANTO, SEG, TER, ...]
      //   [STORE_SHORT, d1, d2, ...]
      //   [NAME.Xhrs, cells...]  (row A - morning)
      //   [NAME.Xhrs, cells...]  (row B - afternoon)
      //   ...repeat for each person

      const DAYS_ORDER = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
      const SHORT_TO_ID = {};
      STORES.forEach(st => { SHORT_TO_ID[(PS_STORE_SHORT[st.id] || st.id).toLowerCase()] = st.id; });

      // Initialize schedule for all people
      PEOPLE.forEach(p => {
        S.schedule[p.id] = {};
        DAYS_ORDER.forEach(day => { S.schedule[p.id][day] = { type: 'empty', shift: null, store: null }; });
      });

      let i = 0;
      while (i < targetBlock.length) {
        const row = targetBlock[i];
        const firstCell = (row[0] || '').trim().toLowerCase();

        if (firstCell === 'porto santo') { i++; continue; }

        // This is a store header row: [STORE_SHORT, d1, d2, ...]
        const storeShortRaw = (row[0] || '').trim().toLowerCase();
        const storeId = SHORT_TO_ID[storeShortRaw];
        if (!storeId) { i++; continue; }

        // Mark store as open
        if (!S.openStores.includes(storeId)) S.openStores.push(storeId);
        S.openDays[storeId] = DAYS_ORDER.slice(); // open all days for simplicity
        if (!S._storeOrder[storeId]) S._storeOrder[storeId] = [];

        i++; // skip store header
        // Read person pairs
        while (i + 1 < targetBlock.length) {
          const rowA = targetBlock[i];
          const rowB = targetBlock[i+1];
          const nameRawA = (rowA[0] || '').trim();
          const nameRawB = (rowB[0] || '').trim();

          // Stop if next row is another store header or porto santo
          if ((rowA[0]||'').toLowerCase() === 'porto santo') break;
          const nextShort = (rowA[0]||'').trim().toLowerCase();
          if (SHORT_TO_ID[nextShort] !== undefined && nextShort !== storeShortRaw) break;
          // If nameRawA doesn't look like a person (no dot), stop
          if (!nameRawA.includes('.')) break;

          // Find person by matching name
          const namePart = nameRawA.replace(/\.\d+hrs?/i, '').trim().toLowerCase();
          const person = PEOPLE.find(p => {
            const sn = psShortName(p.name).toLowerCase().replace('.','');
            const nm = namePart.replace('.','');
            return sn === nm || p.name.toLowerCase().startsWith(namePart.split(' ')[0]);
          });

          if (person) {
            if (!S._personStores[person.id]) S._personStores[person.id] = [];
            if (!S._personStores[person.id].includes(storeId)) S._personStores[person.id].push(storeId);
            if (!S._storeOrder[storeId].includes(person.id)) S._storeOrder[storeId].push(person.id);

            // Tipos de ausência: uma vez lida de qualquer tabela/loja, tem sempre
            // prioridade sobre trabalho/alias lido de outra tabela para o mesmo dia —
            // nunca é a pessoa fica com estados diferentes consoante a loja.
            const ABSENCE_TYPES_RD = ['folga', 'ferias', 'baixa', 'baixa_medica', 'fora_contrato', 'na', 'fim_contrato'];
            DAYS_ORDER.forEach((day, di) => {
              const cellA = (rowA[di+1] || '').trim();
              const cellB = (rowB[di+1] || '').trim();
              const upper = cellA.toUpperCase();

              if (upper === 'FOLGA') {
                S.schedule[person.id][day] = { type: 'folga', shift: null, store: null };
              } else if (upper === 'FERIAS') {
                S.schedule[person.id][day] = { type: 'ferias', shift: null, store: null };
              } else if (upper === 'LICENÇA') {
                // Sem sufixo no texto publicado → recuperável (também cobre ficheiros
                // publicados antes desta distinção existir).
                S.schedule[person.id][day] = { type: 'baixa', shift: null, store: null, recuperavel: true };
              } else if (upper === 'LICENÇA NAO REC.' || upper === 'LICENÇA NÃO REC.' || upper === 'LICENÇA NAO REC' || upper === 'LICENÇA NÃO REC') {
                S.schedule[person.id][day] = { type: 'baixa', shift: null, store: null, recuperavel: false };
              } else if (upper === 'BAIXA MEDICA' || upper === 'BAIXA MÉDICA') {
                S.schedule[person.id][day] = { type: 'baixa_medica', shift: null, store: null };
              } else if (upper === 'FORA DE CONTRATO') {
                S.schedule[person.id][day] = { type: 'fora_contrato', shift: null, store: null };
              } else if (cellA === '' && cellB === '') {
                // leave as empty
              } else {
                const cur = S.schedule[person.id][day];
                // Ausência já lida (nesta ou noutra loja) nunca é substituída por
                // trabalho/alias vindo do bloco de outra loja.
                if (ABSENCE_TYPES_RD.includes(cur.type)) return;
                // Check if it's an alias (another store name)
                const aliasId = SHORT_TO_ID[upper.toLowerCase()];
                if (aliasId && aliasId !== storeId) {
                  // Person working in another store — only set if not already set
                  if (cur.type === 'empty') {
                    S.schedule[person.id][day] = { type: 'work', shift: null, store: aliasId };
                  }
                } else {
                  // Actual shift — join morning + afternoon with |
                  const shift = cellB ? (cellA + '|' + cellB) : cellA;
                  // Detect apoio: single short time slot (no cellB) and person already
                  // has a full shift assigned for this day from their primary store block
                  const isShortSlot = !cellB && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(cellA);
                  const hasFullShift = cur.type === 'work' && cur.shift && cur.shift.includes('|');
                  if (isShortSlot && hasFullShift) {
                    // Apoio interval — store separately, preserve the main shift
                    if (!S._apoioShifts) S._apoioShifts = {};
                    if (!S._apoioShifts[person.id]) S._apoioShifts[person.id] = {};
                    S._apoioShifts[person.id][day] = { store: storeId, shift: cellA };
                  } else {
                    S.schedule[person.id][day] = { type: 'work', shift, store: storeId };
                  }
                }
              }
            });
          }
          i += 2;
        }
      }

      wStep = 3; // jump straight to schedule view
      S._isEditing = true; // flag: editando horario publicado
      await loadIncidencias();
      // Memorizar quanto é que ESTA semana, tal como está publicada, já
      // contribuiu para o banco de cada pessoa. Ao republicar, o saldo
      // recalcula-se como: saldo − contribuição antiga + contribuição nova.
      // Se nada mudar, o efeito líquido é exactamente zero — independentemente
      // de que outras semanas tenham sido publicadas entretanto. Deriva-se do
      // próprio horário acabado de carregar: não se consulta nenhuma outra
      // semana nem nenhum histórico.
      S._contribSemana = {};
      PEOPLE.forEach(p => {
        if (!S.schedule[p.id]) return;
        const temTrabalho = DAYS.some(d => S.schedule[p.id]?.[d]?.type === 'work');
        if (!temTrabalho) return;
        S._contribSemana[p.id] = calcBancoDiff(p.id, calcPersonHrs(p.id));
      });
      const active = PEOPLE.filter(p => !fullyAbsent(p.id));
      showSchedule(active);

    } catch(e) {
      console.error('[GH] loadPortoWeekForEdit error:', e);
      c.innerHTML = '<div class="gh-error-msg">Erro ao carregar: ' + e.message + '</div>';
    }
  }

  // Upload the CSV to Supabase Storage as porto_horarios.csv
  // Strategy: fetch existing file, append/replace the block for this week, re-upload
  async function publishPortoSantoCSV() {
    const sb = await getSupabase();
    if (!sb) return;
    const weekKey = S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null;
    if (!weekKey) return;

    const newBlock = buildPortoSantoCSV();
    console.log('[GH] CSV block length:', newBlock?.length, 'weekKey:', weekKey);
    if (!newBlock) { console.warn('[GH] buildPortoSantoCSV returned empty'); throw new Error('CSV gerado está vazio — verifique se há pessoas e turnos assignados'); }

    // One file per week: porto_s17.csv, porto_s18.csv, etc.
    const BUCKET = 'horarios';
    const BASE_DATE = new Date('2026-01-05T00:00:00');
    const weekMs = new Date(weekKey + 'T00:00:00') - BASE_DATE;
    const weekNum = Math.round(weekMs / (7 * 86400000)) + 1;
    const FILE = 'porto_s' + weekNum + '.csv';

    try {
      const blob = new Blob([newBlock], { type: 'text/csv' });
      const { error } = await sb.storage.from(BUCKET).upload(FILE, blob, {
        upsert: true,
        contentType: 'text/csv'
      });
      if (error) throw error;
      console.log('[GH] ' + FILE + ' publicado');
      // Regista qual foi a última semana publicada, para o aviso "última semana
      // publicada" no dashboard de Porto Santo (shared.js). Só avança — nunca
      // recua: publicar/editar uma semana MAIS ANTIGA (ex.: corrigir a semana
      // 29 depois de já ter a 30 publicada) não deve fazer o aviso "voltar
      // atrás". Falha aqui nunca deve impedir a publicação em si — é
      // puramente informativo.
      try {
        const { data: ultimaAtual } = await sb.from('porto_santo_ultima_semana').select('semana_inicio').eq('id', 1).limit(1);
        const semanaAtualRegistada = ultimaAtual && ultimaAtual[0] ? ultimaAtual[0].semana_inicio : null;
        if (!semanaAtualRegistada || weekKey >= semanaAtualRegistada) {
          await sb.from('porto_santo_ultima_semana').upsert(
            { id: 1, semana_inicio: weekKey, updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );
        }
      } catch (e2) { console.warn('[GH] Não foi possível registar última semana publicada:', e2); }
    } catch(e) {
      console.error('[GH] Erro ao publicar ' + FILE + ':', e);
      throw e;
    }
  }

  // ── BORRADORES ──

  function buildBorradorData() {
    return {
      weekKey: S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null,
      openStores: S.openStores,
      openDays: S.openDays,
      storeMin: S.storeMin,
      storeMax: S.storeMax,
      storeMode: S.storeMode,
      schedule: S.schedule,
      _personStores: S._personStores,
      _storeOrder: S._storeOrder,
      _folgasDirigidas: S._folgasDirigidas,
      _apoioShifts: S._apoioShifts || {},
      _contribSemana: S._contribSemana || {},
    };
  }


  function showToast(msg, duration = 3000) {
    let t = document.getElementById('gh-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gh-toast';
      t.className = 'gh-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
      t.classList.remove('show');
    }, duration);
  }

  async function saveBorrador() {
    const sb = await getSupabase(); if (!sb) return;
    const data = buildBorradorData();
    if (!data.weekKey) { alert('Sem semana definida.'); return; }
    try {
      const { error } = await sb.from('gh_borradores').upsert(
        { semana: data.weekKey, datos: data, updated_at: new Date().toISOString() },
        { onConflict: 'semana' }
      );
      if (error) throw error;
      showToast('✓ Borrador guardado para semana ' + data.weekKey);
    } catch(e) {
      alert('Erro ao guardar borrador: ' + (e.message || e));
    }
  }

  async function deleteBorrador(weekKey) {
    const sb = await getSupabase(); if (!sb) return;
    await sb.from('gh_borradores').delete().eq('semana', weekKey);
  }

  async function loadBorrador(borrador) {
    const d = borrador.datos;
    S = blank();
    S.weekStart = new Date(d.weekKey + 'T00:00:00');
    S.openStores = d.openStores || [];
    S.openDays = d.openDays || {};
    S.storeMin = d.storeMin || {};
    S.storeMax = d.storeMax || {};
    S.storeMode = d.storeMode || {};
    S.schedule = d.schedule || {};
    S._personStores = d._personStores || {};
    S._storeOrder = d._storeOrder || {};
    S._folgasDirigidas = d._folgasDirigidas || {};
    S._apoioShifts = d._apoioShifts || {};
    S._contribSemana = d._contribSemana || {};
    await loadKnowledgeBase();
    await loadIncidencias();
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    showSchedule(active);
  }

  async function renderBorradores(container) {
    const sb = await getSupabase(); if (!sb || !container) return;
    try {
      const { data } = await sb.from('gh_borradores').select('semana, updated_at').order('semana', { ascending: false });
      if (!data || !data.length) return;

      container.innerHTML = '<div class="gh-borradores-title">Borradores guardados</div>';

      data.forEach(b => {
        const d = new Date(b.semana + 'T00:00:00');
        const label = d.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' });
        const updated = new Date(b.updated_at).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        const row = document.createElement('div');
        row.className = 'gh-borrador-row';
        row.innerHTML =
          '<div>' +
            '<div class="gh-borrador-week-label">Semana ' + label + '</div>' +
            '<div class="gh-borrador-saved-date">Guardado: ' + updated + '</div>' +
          '</div>' +
          '<div class="gh-borrador-actions">' +
            '<button class="gh-btn gh-btn-solid gh-btn-sm" data-week="' + b.semana + '" data-action="load">Carregar</button>' +
            '<button class="gh-btn gh-btn-ghost gh-btn-sm gh-btn-delete-danger" data-week="' + b.semana + '" data-action="delete">✕</button>' +
          '</div>';
        row.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', async () => {
            const week = btn.dataset.week;
            if (btn.dataset.action === 'delete') {
              if (!confirm('Eliminar borrador semana ' + label + '?')) return;
              await deleteBorrador(week);
              row.remove();
              if (!container.querySelector('[data-action="load"]')) container.innerHTML = '';
            } else {
              const { data: bd } = await sb.from('gh_borradores').select('semana, datos, updated_at').eq('semana', week).single();
              if (bd) await loadBorrador(bd);
            }
          });
        });
        container.appendChild(row);
      });
    } catch(e) {
      console.warn('Erro ao carregar borradores:', e.message);
    }
  }

  // ── INLINE SHIFT EDIT (banco de horas) ──
  function calcPersonHrs(pid) {
    let h = 0;
    DAYS.forEach(d => {
      const cl = S.schedule[pid]?.[d];
      if (cl?.type === 'work' && cl.shift) {
        cl.shift.split('|').forEach(sg => {
          const pts = sg.split('-');
          if (pts.length < 2) return;
          const [h1,m1] = pts[0].split(':').map(Number);
          const [h2,m2] = pts[1].split(':').map(Number);
          if (!isNaN(h1)&&!isNaN(h2)) h += (h2+m2/60)-(h1+m1/60);
        });
      }
      const apoio = S._apoioShifts?.[pid]?.[d];
      if (apoio?.shift) {
        const pts = apoio.shift.split('-');
        if (pts.length>=2) {
          const [h1,m1]=pts[0].split(':').map(Number);
          const [h2,m2]=pts[1].split(':').map(Number);
          if (!isNaN(h1)&&!isNaN(h2)) h+=(h2+m2/60)-(h1+m1/60);
        }
      }
    });
    return Math.round(h * 10) / 10;
  }

  // Horas neutralizadas no cálculo do banco, numa semana, para uma pessoa.
  // Cada dia de Baixa Médica (sempre), cada dia de Fora de Contrato (sempre) e
  // cada dia de Licença marcada como NÃO recuperável perdoam 8h da jornada
  // semanal, evitando que esse dia gere défice. O efeito é limitado pela
  // própria meta em Math.max(0, 40 - perdão), pelo que nunca cria crédito
  // artificial no banco.
  function calcPerdaoHrs(pid) {
    let h = 0;
    DAYS.forEach(d => {
      const cl = S.schedule[pid]?.[d];
      if (!cl) return;
      if (cl.type === 'baixa_medica') h += 8;
      else if (cl.type === 'fora_contrato') h += 8;
      else if (cl.type === 'fim_contrato') h += 8;
      else if (cl.type === 'baixa' && cl.recuperavel === false) h += 8;
    });
    return h;
  }

  // Perdão que vem especificamente de limites de contrato (Fora de Contrato ou
  // Fim de Contrato) — isolado do resto porque este perdão tem uma regra
  // diferente da Baixa Médica/Licença (ver calcBancoDiff): pode cancelar
  // défice, mas NUNCA pode criar crédito.
  function calcPerdaoContratoHrs(pid) {
    let h = 0;
    DAYS.forEach(d => {
      const cl = S.schedule[pid]?.[d];
      if (!cl) return;
      if (cl.type === 'fora_contrato' || cl.type === 'fim_contrato') h += 8;
    });
    return h;
  }

  // Diferença desta semana para o banco de horas.
  // Baixa Médica e Licença não recuperável: reduzem a meta 8h/dia, e a partir
  // daí horas reais − meta sem qualquer tratamento especial (comportamento
  // original, inalterado).
  // Fora de Contrato / Fim de Contrato: a pessoa não tem contrato nesses dias,
  // por isso NUNCA podem mover o banco a favor dela — só existem para não a
  // penalizar. Por isso este perdão é aplicado à parte e limitado a, no
  // máximo, cancelar um défice que já existisse sem ele; nunca sobra para
  // criar crédito.
  function calcBancoDiff(pid, realHrs) {
    const perdaoTotal    = calcPerdaoHrs(pid);
    const perdaoContrato = calcPerdaoContratoHrs(pid);
    const metaSemContrato   = Math.max(0, 40 - (perdaoTotal - perdaoContrato));
    const diffSemContrato   = realHrs - metaSemContrato;
    const perdaoAplicado    = Math.min(perdaoContrato, Math.max(0, -diffSemContrato));
    return Math.round((diffSemContrato + perdaoAplicado) * 10) / 10;
  }

  // ── COVERAGE PANEL — people active per hour, per day, per store ──
  // Counts how many people are working during each whole-hour slot, for each day,
  // independently per store. A person counts for an hour H in a store if any of their
  // shift segments in that store satisfies start <= H < end. APOIO shifts add to the
  // store where the apoio takes place. Pure function — derives everything from state.
  function buildCoveragePanel(active) {
    const openStores = STORES
      .filter(st => S.openStores.includes(st.id))
      .sort((a, b) => a.priority - b.priority);
    if (!openStores.length) return '';

    // Helper: parse "HH:MM" → float hours; returns NaN on bad input
    const toHrs = (s) => {
      if (!s) return NaN;
      const [h, m] = s.split(':').map(Number);
      if (isNaN(h)) return NaN;
      return h + (isNaN(m) ? 0 : m) / 60;
    };

    // For a store, gather all [start,end) segments per day across all active people,
    // including apoio segments assigned to that store.
    function storeSegmentsByDay(storeId) {
      const byDay = {}; // day → array of [start,end]
      DAYS.forEach(day => { byDay[day] = []; });
      active.forEach(p => {
        DAYS.forEach(day => {
          const cell = S.schedule[p.id]?.[day];
          if (cell?.type === 'work' && cell.store === storeId && cell.shift) {
            cell.shift.split('|').forEach(seg => {
              const [a, b] = seg.split('-');
              const s = toHrs(a), e = toHrs(b);
              if (!isNaN(s) && !isNaN(e) && e > s) byDay[day].push([s, e]);
            });
          }
          // Apoio assigned to THIS store on this day
          const apoio = S._apoioShifts?.[p.id]?.[day];
          if (apoio?.store === storeId && apoio.shift) {
            const [a, b] = apoio.shift.split('-');
            const s = toHrs(a), e = toHrs(b);
            if (!isNaN(s) && !isNaN(e) && e > s) byDay[day].push([s, e]);
          }
        });
      });
      return byDay;
    }

    let sectionsHTML = '';
    openStores.forEach(st => {
      const byDay = storeSegmentsByDay(st.id);

      // Determine the hour range for this store (min start floor, max end ceil)
      let minH = Infinity, maxH = -Infinity;
      DAYS.forEach(day => {
        byDay[day].forEach(([s, e]) => {
          if (s < minH) minH = s;
          if (e > maxH) maxH = e;
        });
      });
      if (!isFinite(minH) || !isFinite(maxH)) {
        sectionsHTML += `<div class="gh-cov-store">
          <div class="gh-cov-store-name">${sshort(st.id)}</div>
          <div class="gh-cov-empty">Sem turnos atribuídos</div>
        </div>`;
        return;
      }
      const startHour = Math.floor(minH);
      const endHour = Math.ceil(maxH);

      // Build header row (days)
      const headCells = DAYS.map(d => `<th class="gh-cov-th">${d}</th>`).join('');

      // For each whole-hour slot [H, H+1), count people active per day
      let rowsHTML = '';
      for (let H = startHour; H < endHour; H++) {
        const dayCells = DAYS.map(day => {
          let count = 0;
          byDay[day].forEach(([s, e]) => {
            // active during the hour slot if the segment overlaps [H, H+1)
            if (s < H + 1 && e > H) count++;
          });
          const cls = count === 0 ? 'gh-cov-zero' : (count === 1 ? 'gh-cov-one' : 'gh-cov-many');
          return `<td class="gh-cov-td ${cls}">${count || ''}</td>`;
        }).join('');
        const label = String(H).padStart(2, '0') + ':00';
        rowsHTML += `<tr><td class="gh-cov-hour">${label}</td>${dayCells}</tr>`;
      }

      sectionsHTML += `<div class="gh-cov-store">
        <div class="gh-cov-store-name">${sshort(st.id)}</div>
        <table class="gh-cov-table">
          <thead><tr><th class="gh-cov-th gh-cov-th-hour">h</th>${headCells}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;
    });

    return `<div class="gh-cov-panel" id="gh-cov-panel">
      <div class="gh-cov-header">
        <span class="gh-cov-title">Cobertura por hora</span>
        <button class="gh-cov-close" id="gh-cov-close" title="Fechar">✕</button>
      </div>
      <div class="gh-cov-body">${sectionsHTML}</div>
    </div>`;
  }

  function updateBancoBadge(pid) {
    const realHrs = calcPersonHrs(pid);
    const diff = calcBancoDiff(pid, realHrs);
    const saldoBase = S._bancoBase?.[pid] ?? S._banco?.[pid] ?? 0;
    // Ao editar uma semana já publicada, o saldo da BD já inclui a contribuição
    // desta semana — subtraí-la evita contá-la em duplicado no valor "vivo".
    const contribAntiga = (S._contribSemana && typeof S._contribSemana[pid] === 'number') ? S._contribSemana[pid] : 0;
    const saldoVivo = Math.round((saldoBase - contribAntiga + diff) * 10) / 10;
    // Store updated value
    if (!S._banco) S._banco = {};
    S._banco[pid] = saldoVivo;
    // Update all badges for this person in DOM
    document.querySelectorAll(`.gh-banco-badge[data-pid="${pid}"]`).forEach(badge => {
      if (saldoVivo === 0) { badge.style.display = 'none'; return; }
      const pos = saldoVivo > 0;
      badge.className = `gh-banco-badge${pos ? ' gh-banco-pos' : ' gh-banco-neg'}`;
      badge.textContent = (pos ? '+' : '') + saldoVivo + 'h';
      badge.style.display = '';
    });
  }

  window._ghCommit = function(pid) { commitInlineEdit(pid); };

  function normTime(t) {
    t = (t || '').trim();
    if (!t) return t;
    if (/^\d{1,2}$/.test(t)) return t.padStart(2,'0') + ':00';
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5,'0');
    return t;
  }

  function commitInlineEdit(pid) {
    const c = getContainer();
    if (!c) return;
    // Read inputs scoped to container — avoids reading stale inputs from prior renders
    const inputs = c.querySelectorAll(`.gh-sh-time-inp[data-pid="${pid}"]`);
    if (!inputs.length) return; // no active inputs — nothing to commit
    const dayShifts = {};   // work shifts: { day: { seg: [t1,t2] } }
    const apoioEdits = {};  // apoio shifts: { day: [t1,t2] }
    inputs.forEach(inp => {
      const day = inp.dataset.day;
      const kind = inp.dataset.kind || 'work';
      const part = parseInt(inp.dataset.part);
      if (kind === 'apoio') {
        if (!apoioEdits[day]) apoioEdits[day] = ['',''];
        apoioEdits[day][part] = inp.value.trim();
      } else {
        const seg = parseInt(inp.dataset.seg);
        if (!dayShifts[day]) dayShifts[day] = {};
        if (!dayShifts[day][seg]) dayShifts[day][seg] = ['',''];
        dayShifts[day][seg][part] = inp.value.trim();
      }
    });
    // Apply work-shift edits — só marca 'changed' se a hora final for
    // realmente diferente da que já lá estava. Evita que um commit disparado
    // sem qualquer alteração real (ex.: um clique fora só para fechar o modo
    // de edição) mexa no banco.
    let changed = false;
    Object.entries(dayShifts).forEach(([day, segs]) => {
      const cell = S.schedule[pid]?.[day];
      if (!cell || cell.type !== 'work') return;
      const parts = Object.values(segs);
      const newShift = parts.map(([t1,t2]) => normTime(t1)+'-'+normTime(t2)).join('|');
      if (newShift !== cell.shift) changed = true;
      S.schedule[pid][day] = { ...cell, shift: newShift };
    });
    // Apply apoio-shift edits
    Object.entries(apoioEdits).forEach(([day, [t1, t2]]) => {
      const apoioCell = S._apoioShifts?.[pid]?.[day];
      if (!apoioCell) return;
      const newApoio = normTime(t1) + '-' + normTime(t2);
      if (newApoio !== apoioCell.shift) changed = true;
      apoioCell.shift = newApoio;
    });
    // Só recalcula o banco se alguma hora mudou mesmo — nunca num commit vazio.
    if (changed) {
      if (!S._banco) S._banco = {};
      const realHrs = calcPersonHrs(pid);
      const diff = calcBancoDiff(pid, realHrs);
      const bancoBase = S._bancoBase?.[pid] ?? S._banco[pid] ?? 0;
      // Mesma regra do updateBancoBadge: numa semana já publicada, o saldo da
      // BD já contém a contribuição desta semana — não a contar duas vezes.
      const contribAntiga = (S._contribSemana && typeof S._contribSemana[pid] === 'number') ? S._contribSemana[pid] : 0;
      const saldoVivo = Math.round((bancoBase - contribAntiga + diff) * 10) / 10;
      S._banco[pid] = saldoVivo;
    }
    // Re-render
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    showSchedule(active);
  }

  // ── RENDER HORÁRIO ──
  function shortNameInitial(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
  }

  function showSchedule(active) {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();
    const dates = wkDates();
    const today = new Date(); today.setHours(0,0,0,0);

    const alertsHTML = S.alerts.length
      ? `<div class="gh-alert-bar"><div class="gh-al-inner">${S.alerts.map(a => `<div class="gh-al-chip ${a.type}">${a.text}</div>`).join('')}</div></div>`
      : '';

    const topBar = `
      <div class="gh-sched-bar">
        <div>
          <div class="gh-sb-week">Porto Santo · Semana ${isoWeek(S.weekStart)}</div>
          <div class="gh-sb-dates">${fmt(dates[0])} — ${fmt(dates[6])} ${dates[6].getFullYear()}</div>
        </div>
        <div class="gh-flex-row-8">
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-coverage">📊 Cobertura</button>
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-nova">← Nova semana</button>
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-borrador">💾 Guardar rascunho</button>
          <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-btn-confirm">↑ Publicar horário</button>
        </div>
      </div>
      ${alertsHTML}`;

    // ── Pre-calculate the first-column width so all tables share the same value ──
    // We measure every text that appears in a first-column cell (store header lines
    // and person names) using an off-screen canvas, then add padding so the result
    // is pixel-perfect before a single byte of HTML is written.
    const _col0W = (function () {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Store-header cell: "PORTO SANTO\n<store.short lines>" in bold 0.75rem
      // Person cell: shortName() in 600-weight 0.85rem
      // We measure at 16px base (typical browser default).
      const BASE = 16;
      let max = 0;

      function measure(text, fontStr) {
        ctx.font = fontStr;
        return ctx.measureText(text).width;
      }

      const openStores = STORES.filter(st => S.openStores.includes(st.id));

      openStores.forEach(st => {
        // Header: "PORTO SANTO" + store short lines (bold 0.75rem ≈ 12px)
        const headerFont = `bold ${0.75 * BASE}px sans-serif`;
        ['PORTO SANTO', ...st.short.split(' ')].forEach(line => {
          max = Math.max(max, measure(line, headerFont));
        });
      });

      // Person names (600-weight 0.85rem ≈ 13.6px)
      const nameFont = `600 ${0.85 * BASE}px sans-serif`;
      // dot "●" + space prefix + name text + remove-x invisible but takes space
      active.forEach(p => {
        // "● " prefix (approx 16px) + shortName
        const w = measure('● ' + shortName(p.name), nameFont);
        max = Math.max(max, w);
      });

      // Badge "+99h" sits next to hours — account for its width
      const badgeFont = `700 ${0.62 * BASE}px sans-serif`;
      max += measure('+99h', badgeFont) + 10; // badge + gap
      // Add padding: 8px left + 12px right (from .gh-p-cell) + 8px header padding each side
      const PAD = 20 + 16; // generous fixed padding
      return Math.ceil(max + PAD);
    })();

    let bodyHTML = '';
    STORES.filter(st => S.openStores.includes(st.id)).sort((a, b) => a.priority - b.priority).forEach(st => {
      // Personas en orden de inserción (via +) o con work asignado
      const inSectionSet = active.filter(p =>
        (S._personStores?.[p.id]?.includes(st.id)) ||
        DAYS.some(d => S.schedule[p.id]?.[d]?.type === 'work' && S.schedule[p.id]?.[d]?.store === st.id)
      );
      const order = S._storeOrder?.[st.id] || [];
      // Sort: insertion order first, then any others
      const inSection = [
        ...order.map(pid => inSectionSet.find(p => p.id === pid)).filter(Boolean),
        ...inSectionSet.filter(p => !order.includes(p.id))
      ];
      // Siempre mostrar la tienda aunque esté vacía

      const rows = inSection.map(p => {
        const sched = S.schedule[p.id] || {};
        const cells = DAYS.map((day, di) => {
          const c2 = sched[day] || { type: 'na' };
          const open = S.openDays[st.id]?.includes(day);
          if (!open) {
            if (c2.type === 'work' && c2.store && c2.store !== st.id) {
              const content = sshort(c2.store).split(' ').map(w => `<span class="gh-sh-loc">${w}</span>`).join('');
              return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner c-elsewhere">${content}</div></td>`;
            }
            if (c2.type === 'empty' || c2.type === 'na') {
              return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner c-empty"></div></td>`;
            }
            if (c2.type === 'fim_contrato') {
              return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner c-fim-contrato"><span class="gh-sh-line gh-fim-txt">fim de contrato</span></div></td>`;
            }
            const lbl = c2.type === 'ferias' ? 'FÉRIAS' : c2.type === 'baixa_medica' ? 'BAIXA MÉDICA' : c2.type === 'fora_contrato' ? 'FORA DE CONTRATO' : c2.type === 'baixa' ? 'LICENÇA' : 'FOLGA';
            const cls = c2.type === 'baixa_medica' ? 'c-baixa-med' : c2.type === 'fora_contrato' ? 'c-fora-contrato' : (c2.type === 'ferias' || c2.type === 'baixa') ? 'c-ferias' : 'c-folga';
            return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner ${cls}"><span class="gh-sh-line">${lbl}</span></div></td>`;
          }
          let cls = '', content = '';
          if (c2.type === 'fim_contrato') { cls = 'c-fim-contrato'; content = `<span class="gh-sh-line gh-fim-txt">fim de contrato</span>`; }
          else if (c2.type === 'folga') { cls = 'c-folga'; content = `<span class="gh-sh-line">FOLGA</span>`; }
          else if (c2.type === 'ferias') { cls = 'c-ferias'; content = `<span class="gh-sh-line">FÉRIAS</span>`; }
          else if (c2.type === 'baixa')  { cls = 'c-ferias'; content = `<span class="gh-sh-line">LICENÇA</span>`; }
          else if (c2.type === 'baixa_medica') { cls = 'c-baixa-med'; content = `<span class="gh-sh-line">BAIXA MÉDICA</span>`; }
          else if (c2.type === 'fora_contrato') { cls = 'c-fora-contrato'; content = `<span class="gh-sh-line">FORA DE CONTRATO</span>`; }
          else if (c2.type === 'na')     { cls = 'c-na';     content = `<span class="gh-sh-line">N/A</span>`; }
          else if (c2.type === 'empty')  { cls = 'c-empty';  content = ''; }
          else if (c2.type === 'work') {
            // Check if person does apoio in THIS store on this day
            const apoioHereRender = S._apoioShifts?.[p.id]?.[day]?.store === st.id;
            if (apoioHereRender) {
              cls = 'c-shift-b';
              content = `<span class="gh-sh-line apoio">⚡ ${S._apoioShifts[p.id][day].shift}</span>`;
            } else if (c2.store === st.id) {
              const soft = p.softAvoid?.some(oid => S.schedule[oid]?.[day]?.type === 'work' && S.schedule[oid]?.[day]?.store === st.id);
              const shiftColorMap = { '10:00-13:00|14:00-19:00': 'c-shift-a', '10:00-14:00|15:00-19:00': 'c-shift-b', '10:00-15:00|16:00-19:00': 'c-shift-c', '09:00-12:00|13:00-18:00': 'c-shift-d', '11:00-15:00|16:00-20:00': 'c-shift-e', '09:00-13:00|19:00-23:00': 'c-shift-f', '09:00-13:00|14:00-18:00': 'c-shift-d', '11:00-14:00|15:00-20:00': 'c-shift-e' };
              cls = soft ? 'c-soft' : (shiftColorMap[c2.shift] || 'c-shift-b');
              content = c2.shift ? c2.shift.split('|').map(l => `<span class="gh-sh-line">${l}</span>`).join('') : `<span class="gh-sh-line">—</span>`;
            } else {
              cls = 'c-elsewhere';
              content = sshort(c2.store).split(' ').map(w => `<span class="gh-sh-loc">${w}</span>`).join('');
            }
          }
          const noClick = (c2.type === 'fim_contrato') ? ' gh-no-click' : '';
          return `<td class="gh-sh-td${noClick}" data-pid="${p.id}" data-day="${day}" data-store="${st.id}"><div class="gh-sh-inner ${cls}">${content}</div></td>`;
        }).join('');

        const aH = calcPersonHrs(p.id);
        return `<tr>
          <td style="width:${_col0W}px;min-width:${_col0W}px;max-width:${_col0W}px;box-sizing:border-box"><div class="gh-p-cell">
            <button class="gh-p-remove-btn" data-pid="${p.id}" data-store="${st.id}" title="Eliminar desta tabela">
              <span class="gh-p-dot">●</span>${shortName(p.name)}
              <span class="gh-p-remove-x">✕</span>
            </button>
            <div class="gh-p-hrs ok">${(()=>{const s=S._banco?.[p.id]??0;const pos=s>0;const zero=s===0;return `<span class="gh-banco-badge${zero?' gh-banco-zero':pos?' gh-banco-pos':' gh-banco-neg'}" data-pid="${p.id}">${pos?'+':''}${s}h</span>`;})()}${aH > 0 ? ' ' + aH + 'h' : ''}</div>
          </div></td>${cells}</tr>`;
      }).join('');

      // Store name as button with +/- controls
      bodyHTML += `<div class="gh-store-block" id="gh-sb-${st.id}"><table class="gh-sched-tbl">
        <thead>
          <tr class="gh-tbl-store-hdr">
            <td style="width:${_col0W}px;min-width:${_col0W}px;max-width:${_col0W}px;box-sizing:border-box">
              <button class="gh-store-name-btn" data-store="${st.id}">PORTO SANTO<br>${st.short.split(' ').join('<br>')}</button>
              <div class="gh-store-actions" id="gh-sa-${st.id}">
                <button class="gh-store-act-btn gh-store-add" data-store="${st.id}" title="Adicionar pessoa">＋</button>
              </div>
            </td>
            ${DAYS.map((d,i) => `<td class="gh-day-col">${d}<br><span class="gh-tbl-date">${fmt(dates[i])}</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" class="gh-empty-row">Loja vazia — use ＋ para adicionar pessoal</td></tr>`}</tbody>
      </table></div>`;
    });

    const coverageHTML = buildCoveragePanel(active);
    c.innerHTML = topBar + `<div class="gh-sched-wrap"><div class="gh-sched-body">${bodyHTML}</div>${coverageHTML}</div>`;

    // Coverage panel toggle
    document.getElementById('gh-btn-coverage')?.addEventListener('click', () => {
      const panel = document.getElementById('gh-cov-panel');
      if (!panel) return;
      panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    });
    document.getElementById('gh-cov-close')?.addEventListener('click', () => {
      const panel = document.getElementById('gh-cov-panel');
      if (panel) panel.style.display = 'none';
    });

    document.getElementById('gh-btn-nova')?.addEventListener('click', startNew);
    document.getElementById('gh-btn-borrador')?.addEventListener('click', () => saveBorrador());
    document.getElementById('gh-btn-confirm')?.addEventListener('click', () => {
      const weekKey = S.weekStart ? (S.weekStart.getFullYear() + '-' + String(S.weekStart.getMonth()+1).padStart(2,'0') + '-' + String(S.weekStart.getDate()).padStart(2,'0')) : null;
      const confirmed = confirm(`Confirmar e guardar o horário da semana de ${weekKey}?\n\nEsta acção gravará as folgas em Supabase e não poderá ser regenerada.`);
      if (!confirmed) return;
      const active = PEOPLE.filter(p => !fullyAbsent(p.id));
      confirmSchedule(active);
    });

    // Store name button — no toggle, + always visible

    // + Add person to store
    c.querySelectorAll('.gh-store-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.store;
        openAddPersonToStore(sid);
      });
    });

    // Remove person from store table
    // Banco badge click → make person's shifts editable inline
    c.querySelectorAll('.gh-banco-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        const pid = badge.dataset.pid;
        // Find all rows for this person and make shifts editable
        c.querySelectorAll('tr').forEach(row => {
          const nameBtn = row.querySelector('.gh-p-remove-btn');
          if (!nameBtn || nameBtn.dataset.pid !== pid) return;
          // If already editing, do nothing — commit is handled by ✓ OK button and Enter/Tab
          if (row.classList.contains('gh-editing')) return;
          row.classList.add('gh-editing');
          // Add confirm button to name cell
          const nameCell = row.querySelector('.gh-p-cell');
          if (nameCell && !nameCell.querySelector('.gh-inline-ok')) {
            const okBtn = document.createElement('div');
            okBtn.className = 'gh-inline-ok';
            okBtn.textContent = '✓ OK';
            okBtn.dataset.pid = pid;
            nameCell.appendChild(okBtn);
          }
          row.querySelectorAll('.gh-sh-td[data-pid]').forEach(td => {
            const day = td.dataset.day;
            const tdStore = td.dataset.store; // the store this table/cell represents
            const cell = S.schedule[pid]?.[day];
            if (!cell || cell.type !== 'work') return;
            const inner = td.querySelector('.gh-sh-inner');
            if (!inner) return;

            // Case A: this cell shows an APOIO shift for THIS store → edit the apoio range
            const apoioHere = S._apoioShifts?.[pid]?.[day]?.store === tdStore;
            if (apoioHere) {
              const apoioShift = S._apoioShifts[pid][day].shift || '';
              const [a1, a2] = apoioShift.split('-');
              inner.innerHTML = `<div class="gh-inline-center">
                <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="apoio" data-seg="0" data-part="0" value="${a1 || ''}">
                <span class="gh-dash-muted">-</span>
                <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="apoio" data-seg="0" data-part="1" value="${a2 || ''}">
              </div>`;
            }
            // Case B: this cell shows the person's real shift in THIS store → edit it
            else if (cell.store === tdStore && cell.shift) {
              const parts = cell.shift.split('|');
              inner.innerHTML = parts.map((seg, i) => {
                const [t1, t2] = seg.split('-');
                return `<div class="gh-inline-center">
                  <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="work" data-seg="${i}" data-part="0" value="${t1 || ''}">
                  <span class="gh-dash-muted">-</span>
                  <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="work" data-seg="${i}" data-part="1" value="${t2 || ''}">
                </div>`;
              }).join('');
            }
            // Case C: cell shows work ELSEWHERE (another store) → not editable from this table
            else { return; }

            // Enter key or Tab to commit
            inner.querySelectorAll('.gh-sh-time-inp').forEach(inp => {
              inp.setAttribute('onkeydown', `if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();window._ghCommit('${pid}');}`);
            });
          });
        });

      });
    });

    c.querySelectorAll('.gh-p-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const sid = btn.dataset.store;
        const p = P(pid);
        showConfirmModal(
          `Eliminar ${shortName(p?.name || pid)} da tabela de ${sname(sid)}?`,
          () => {
            DAYS.forEach(day => {
              const cell = S.schedule[pid]?.[day];
              if (cell?.type === 'work' && cell?.store === sid) {
                S.schedule[pid][day] = { type: 'empty', shift: null, store: null };
              }
            });
            if (S._personStores?.[pid]) {
              S._personStores[pid] = S._personStores[pid].filter(s => s !== sid);
              if (S._personStores[pid].length === 0) delete S._personStores[pid];
            }
            if (S._storeOrder?.[sid]) {
              S._storeOrder[sid] = S._storeOrder[sid].filter(id => id !== pid);
            }
            const active = PEOPLE.filter(p => !fullyAbsent(p.id));
            showSchedule(active);
          }
        );
      });
    });

    // Edit on click — intercept if add mode is active
    // Container click — commit any editing rows when clicking outside them
    if (!c.dataset.hasClickDelegation) {
      c.addEventListener('mousedown', (e) => {
        // 1. Intercept OK div click
        const okDiv = e.target.closest('.gh-inline-ok');
        if (okDiv) {
          e.preventDefault();
          e.stopPropagation();
          const pid = okDiv.dataset.pid;
          commitInlineEdit(pid);
          return;
        }
        // 2. mousedown inside an input — let it focus, don't commit
        if (e.target.closest('.gh-sh-time-inp')) return;
        // 3. mousedown outside any editing row — commit that row
        const editingRows = c.querySelectorAll('tr.gh-editing');
        if (!editingRows.length) return;
        editingRows.forEach(row => {
          if (!row.contains(e.target)) {
            const pid = row.querySelector('.gh-banco-badge')?.dataset?.pid ||
                        row.querySelector('[data-pid]')?.dataset?.pid;
            if (pid) commitInlineEdit(pid);
          }
        });
      });
      c.dataset.hasClickDelegation = 'true';
    }

    c.querySelectorAll('.gh-sh-td[data-pid]').forEach(td => {
      td.addEventListener('click', (e) => {
        // If row is in inline edit mode, don't open modal
        if (td.closest('tr')?.classList.contains('gh-editing')) return;
        // If click was on a time input, don't open modal
        if (e.target.closest('.gh-sh-time-inp')) return;

        if (_addCtx) {
          // Add mode: assign selected person to this day in the target store
          const { pid, sid } = _addCtx;
          const day = td.dataset.day;
          if (!S.openDays[sid]?.includes(day)) {
            alert(`${sname(sid)} não está aberta ao ${DAY_PT[day]}.`);
            return;
          }
          S.schedule[pid][day] = { type: 'work', shift: storeBaseShift(sid), store: sid };
          _addCtx = null;
          closeModal();
          const active = PEOPLE.filter(p => !fullyAbsent(p.id));
          showSchedule(active);
          return;
        }
        openEdit(td.dataset.pid, td.dataset.day, td.dataset.store);
      });
    });
  }

  function closeConfirmModal() {
    const cm = document.getElementById('gh-confirm-modal');
    if (cm) { cm.classList.remove('open'); cm._onOk = null; }
  }

  function showConfirmModal(msg, onOk) {
    let cm = document.getElementById('gh-confirm-modal');
    if (!cm) {
      cm = document.createElement('div');
      cm.id = 'gh-confirm-modal';
      cm.innerHTML = `<div class="gh-cm-box"><div class="gh-cm-msg" id="gh-cm-msg"></div><div class="gh-cm-btns"><button class="gh-cm-cancel" id="gh-cm-cancel">Cancelar</button><button class="gh-cm-ok" id="gh-cm-ok">Eliminar</button></div></div>`;
      document.body.appendChild(cm);
      cm.addEventListener('click', e => { if (e.target === cm) closeConfirmModal(); });
      document.getElementById('gh-cm-cancel').addEventListener('click', closeConfirmModal);
    }
    document.getElementById('gh-cm-msg').textContent = msg;
    cm._onOk = onOk;
    const okBtn = document.getElementById('gh-cm-ok');
    okBtn.onclick = () => { closeConfirmModal(); onOk && onOk(); };
    cm.classList.add('open');
  }

  function closeLicModal() {
    const lm = document.getElementById('gh-lic-modal');
    if (lm) lm.classList.remove('open');
  }

  // Mini-modal exclusivo da Licença: pergunta se as horas são recuperáveis.
  // onChoose(recuperavel:boolean) ao escolher; onCancel() ao cancelar/fechar.
  function showLicencaModal(onChoose, onCancel) {
    let lm = document.getElementById('gh-lic-modal');
    if (!lm) {
      lm = document.createElement('div');
      lm.id = 'gh-lic-modal';
      lm.innerHTML = `<div class="gh-lm-box">
        <div class="gh-lm-ttl">Licença</div>
        <div class="gh-lm-msg">As horas em falta neste dia vão para o banco de horas?</div>
        <div class="gh-lm-btns">
          <button class="gh-lm-btn gh-lm-rec" id="gh-lm-rec">Recuperável<span class="gh-lm-sub">soma ao banco</span></button>
          <button class="gh-lm-btn gh-lm-nrec" id="gh-lm-nrec">Não recuperável<span class="gh-lm-sub">não conta</span></button>
        </div>
        <button class="gh-lm-cancel" id="gh-lm-cancel">Cancelar</button>
      </div>`;
      document.body.appendChild(lm);
      lm.addEventListener('click', e => { if (e.target === lm) { closeLicModal(); if (lm._onCancel) lm._onCancel(); } });
    }
    lm._onCancel = onCancel;
    document.getElementById('gh-lm-rec').onclick  = () => { closeLicModal(); onChoose(true); };
    document.getElementById('gh-lm-nrec').onclick = () => { closeLicModal(); onChoose(false); };
    document.getElementById('gh-lm-cancel').onclick = () => { closeLicModal(); if (onCancel) onCancel(); };
    lm.classList.add('open');
  }

  // ── MODAL DE EDIÇÃO ──
  // ── PILL GROUP HELPER ──
  function ghSyncPillGroup(groupId, val) {
    const grp = document.getElementById(groupId);
    if (!grp) return;
    grp.querySelectorAll('.gh-pill[data-val]').forEach(b => {
      b.classList.toggle('active', b.dataset.val === val);
    });
  }

  let editCtx = null;

  function openEdit(pid, day, ctxStore) {
    editCtx = { pid, day, ctxStore };
    const p = P(pid), c2 = S.schedule[pid]?.[day] || {};
    const modal = document.getElementById('gh-modal');
    if (!modal) return;
    modal.style.display = '';
    document.getElementById('gh-me-ttl').textContent = `${p?.name} · ${DAY_PT[day]}`;
    const typeEl = document.getElementById('gh-me-type');
    typeEl.value = c2.type === 'work' ? 'work' : c2.type === 'ferias' ? 'ferias' : c2.type === 'baixa_medica' ? 'baixa_medica' : c2.type === 'fora_contrato' ? 'fora_contrato' : c2.type === 'baixa' ? 'baixa' : c2.type === 'empty' ? 'work' : 'folga';
    const shEl = document.getElementById('gh-me-shift');
    if (c2.shift) { const f = [...shEl.options].find(o => o.value === c2.shift); shEl.value = f ? c2.shift : shEl.options[0].value; }
    const stEl = document.getElementById('gh-me-store');
    const defaultStore = c2.store || ctxStore;
    stEl.innerHTML = STORES.map(st => {
      const knows = P(pid)?.knows?.includes(st.id);
      return `<option value="${st.id}" ${defaultStore===st.id?'selected':''}>${sname(st.id)}${!knows?' ⚠':''}</option>`;
    }).join('');
    // Sync pill buttons
    ghSyncPillGroup('gh-me-type-btns', typeEl.value);

    // Populate apoio store selector
    const apoioSel = document.getElementById('gh-apoio-store');
    if (apoioSel) {
      apoioSel.innerHTML = '';
      STORES.filter(st => S.openStores.includes(st.id)).sort((a,b)=>a.priority-b.priority).forEach(st => {
        const op = document.createElement('option');
        op.value = st.id;
        op.textContent = st.short || st.name;
        apoioSel.appendChild(op);
      });
    }

    // Show/hide apoio selector based on shift selection
    function updateApoioWrap() {
      const shiftVal = document.getElementById('gh-me-shift')?.value || '';
      const wrap = document.getElementById('gh-apoio-store-wrap');
      if (wrap) {
        wrap.style.display = shiftVal.includes('APOIO') ? 'block' : 'none';
        if (shiftVal.includes('APOIO')) {
          const apoioMatch = shiftVal.match(/APOIO:(\d{2}:\d{2}-\d{2}:\d{2})/);
          const apoioTime = apoioMatch ? apoioMatch[1] : '14:00-15:00';
          const lbl = wrap.querySelector('div');
          if (lbl) lbl.textContent = `Tienda de apoio (${apoioTime})`;
        }
      }
    }
    updateApoioWrap();

    // Auto-confirm when apoio store is selected
    document.getElementById('gh-apoio-store')?.addEventListener('change', () => {
      applyEdit();
    });
    ghSyncPillGroup('gh-me-shift-btns', shEl.value);
    // Build store pill buttons dynamically
    const storeBtns = document.getElementById('gh-me-store-btns');
    storeBtns.innerHTML = STORES.map(st => {
      const knows = P(pid)?.knows?.includes(st.id);
      return `<button class="gh-pill gh-pill-store${defaultStore===st.id?' active':''}" data-val="${st.id}">${sname(st.id)}${!knows?' ⚠':''}</button>`;
    }).join('');
    document.getElementById('gh-me-conf').style.display = 'none';
    meTypeChange();
    modal.classList.add('open');
  }

  function meTypeChange() {
    const v = document.getElementById('gh-me-type').value;
    document.getElementById('gh-me-work').style.display = v === 'work' ? '' : 'none';
  }

  async function applyEdit() {
    const modal = document.getElementById('gh-modal');
    const mode = modal?.dataset.mode;

    // Handle add person mode
    if (mode === 'add') {
      if (!_addCtx) { alert('Selecione uma pessoa primeiro.'); return; }
      const { pid, sid } = _addCtx;
      // Add mode: person was already added via click in openAddPersonToStore
      // Nothing to do here — just close
      cleanupModalExtras();
      closeModal();
      return;
    }

    if (!editCtx) return;
    const { pid, day } = editCtx;
    const type = document.getElementById('gh-me-type').value;
    if (type !== 'work') {
      const cellType = type === 'ferias' ? 'ferias' : type === 'baixa_medica' ? 'baixa_medica' : type === 'fora_contrato' ? 'fora_contrato' : type === 'baixa' ? 'baixa' : 'folga';
      const nonWorkCell = { type: cellType, shift: null, store: null };
      // Licença: guardar se é recuperável (default true → mantém o fluxo actual do banco).
      // Só 'não recuperável' (recuperavel === false) neutraliza o banco de horas.
      if (cellType === 'baixa') nonWorkCell.recuperavel = (editCtx.licRecuperavel === false) ? false : true;
      S.schedule[pid][day] = nonWorkCell;
      // Limpieza atómica: eliminar apoio huérfano de este día
      if (S._apoioShifts?.[pid]?.[day]) {
        delete S._apoioShifts[pid][day];
      }
    } else {
      const shiftRaw = document.getElementById('gh-me-shift').value;
      const sid   = document.getElementById('gh-me-store').value;
      let shift = shiftRaw;

      // Handle APOIO shift: assign apoio slot in support store, remove APOIO marker
      if (shiftRaw.includes('APOIO')) {
        const apoioSid = document.getElementById('gh-apoio-store')?.value;
        if (!apoioSid) { alert('Selecione a tienda de apoio.'); return; }
        if (!S._personStores) S._personStores = {};
        if (!S._personStores[pid]) S._personStores[pid] = [];
        if (!S._personStores[pid].includes(apoioSid)) S._personStores[pid].push(apoioSid);
        if (!S._storeOrder) S._storeOrder = {};
        if (!S._storeOrder[apoioSid]) S._storeOrder[apoioSid] = [];
        if (!S._storeOrder[apoioSid].includes(pid)) S._storeOrder[apoioSid].push(pid);
        // Extract apoio time from value: |APOIO:HH:MM-HH:MM| or legacy |APOIO| = 14:00-15:00
        const apoioMatch = shiftRaw.match(/APOIO:(\d{2}:\d{2}-\d{2}:\d{2})/);
        const apoioSlot = apoioMatch ? apoioMatch[1] : '14:00-15:00';
        // Save apoio shift for that day in the support store
        if (!S._apoioShifts) S._apoioShifts = {};
        if (!S._apoioShifts[pid]) S._apoioShifts[pid] = {};
        S._apoioShifts[pid][day] = { store: apoioSid, shift: apoioSlot };
        // Remove APOIO marker (with or without time) to get the clean shift string
        shift = shiftRaw.replace(/\|APOIO(?::[^|]+)?/, '');
      } else {
        // No APOIO in new shift — clean up any previous apoio entry for this day
        const prevApoio = S._apoioShifts?.[pid]?.[day];
        if (prevApoio) {
          const prevApoioSid = prevApoio.store;
          delete S._apoioShifts[pid][day];
          // If person has no remaining apoio days in that store, remove from its section
          const stillHasApoioInStore = Object.values(S._apoioShifts[pid] || {}).some(a => a.store === prevApoioSid);
          const stillHasWorkInStore = DAYS.some(d => d !== day && S.schedule[pid]?.[d]?.type === 'work' && S.schedule[pid]?.[d]?.store === prevApoioSid);
          if (!stillHasApoioInStore && !stillHasWorkInStore) {
            if (S._personStores?.[pid]) {
              S._personStores[pid] = S._personStores[pid].filter(s => s !== prevApoioSid);
              if (S._personStores[pid].length === 0) delete S._personStores[pid];
            }
            if (S._storeOrder?.[prevApoioSid]) {
              S._storeOrder[prevApoioSid] = S._storeOrder[prevApoioSid].filter(id => id !== pid);
            }
          }
        }
      }
      const p = P(pid), ce = document.getElementById('gh-me-conf');
      const hard = PEOPLE.find(o => o.id !== pid && p?.hardAvoid?.includes(o.id) && S.schedule[o.id]?.[day]?.type === 'work' && S.schedule[o.id]?.[day]?.store === sid);
      if (hard) { ce.textContent = `⚠ ${p?.name} e ${hard.name} não podem estar juntas.`; ce.className = 'gh-conf-note hard'; ce.style.display = ''; return; }
      const soft = PEOPLE.find(o => o.id !== pid && p?.softAvoid?.includes(o.id) && S.schedule[o.id]?.[day]?.type === 'work' && S.schedule[o.id]?.[day]?.store === sid);
      if (soft) { ce.textContent = `Atenção: ${p?.name} e ${soft.name} — preferido evitar.`; ce.className = 'gh-conf-note soft'; ce.style.display = ''; }
      else ce.style.display = 'none';
      S.schedule[pid][day] = { type: 'work', shift, store: sid };
    }
    closeModal();
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    showSchedule(active);
  }

  // ── AÑADIR PERSONA A TIENDA ──
  // Muestra lista de todas las personas activas, el usuario elige,
  // luego clica en el día donde quiere asignarla
  let _addCtx = null;

  function openAddPersonToStore(sid) {
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    const modal = document.getElementById('gh-modal');
    if (!modal) return;

    document.getElementById('gh-me-ttl').textContent = `Adicionar pessoa — ${sname(sid)}`;
    document.getElementById('gh-me-work').style.display = 'none';
    document.getElementById('gh-me-conf').style.display = 'none';
    document.getElementById('gh-me-type').style.display = 'none';

    // Only show people not already in this store
    const alreadyIn = new Set(
      active.filter(p =>
        (S._personStores?.[p.id]?.includes(sid)) ||
        DAYS.some(d => S.schedule[p.id]?.[d]?.type === 'work' && S.schedule[p.id]?.[d]?.store === sid)
      ).map(p => p.id)
    );
    const candidates = active.filter(p => !alreadyIn.has(p.id));

    const bdy = modal.querySelector('.gh-modal-bdy');
    let injected = bdy.querySelector('#gh-add-person-list');
    if (!injected) { injected = document.createElement('div'); injected.id = 'gh-add-person-list'; bdy.appendChild(injected); }

    injected.innerHTML = `
      <div class="gh-assist-note">Selecione a pessoa para adicionar a ${sname(sid)}. As suas ausências do assistente são mantidas. Edite os dias individualmente clicando nas células.</div>
      <div class="gh-assist-list">
        ${candidates.length ? candidates.map(p => {
          const hasBadge = (() => {
            const _fdR = S._folgasDirigidas?.[p.id];
            const hasAbs = !!absOf(p.id);
            if (hasAbs) return { icon: '🏖', label: '' };
            if (_fdR?._allDatas?.length) {
              const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
              const labels = _fdR._allDatas.map(ds => {
                const d = new Date(ds + 'T00:00:00');
                return `${d.getDate()} ${MESES[d.getMonth()]}`;
              }).join(', ');
              return { icon: '⚑', label: labels };
            }
            return { icon: '', label: '' };
          })();
          const badgeHtml = hasBadge.icon ? (hasBadge.label
            ? `<span class="gh-badge-tag">⚑ ${hasBadge.label}</span>`
            : `<span class="gh-icon-only">${hasBadge.icon}</span>`)
            : '';
          return `<button class="gh-add-person-pick${hasBadge.label ? ' has-badge' : ''}" data-pid="${p.id}">
            <span>${shortName(p.name)}</span>
            ${badgeHtml}
          </button>`;
        }).join('') : '<div class="gh-assist-empty">Todas as pessoas já foram adicionadas.</div>'}
      </div>`;

    injected.querySelectorAll('.gh-add-person-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        addPersonToStore(pid, sid);
        closeModal();
      });
    });

    modal.dataset.mode = 'add';
    modal.classList.add('open');
  }

  // Adds person to store: keeps their absences/folgas, leaves work days empty
  function addPersonToStore(pid, sid) {
    // Init schedule if first time adding this person
    if (!S.schedule[pid]) {
      S.schedule[pid] = {};
      DAYS.forEach(day => { S.schedule[pid][day] = { type: 'empty', shift: null, store: null }; });
      // Apply absences/folgas from wizard only on first add
      DAYS.forEach(day => {
        // Fim de contrato tem prioridade
        if (isContractEnded(PEOPLE.find(x => x.id === pid) || {}, day)) {
          S.schedule[pid][day] = { type: 'fim_contrato', shift: null, store: null };
          return;
        }
        if (isAbsent(pid, day)) {
          const a = absOf(pid);
          const t = a?.type === 'ferias' ? 'ferias' : a?.type === 'baixa' ? 'baixa' : a?.type === 'na' ? 'na' : 'folga';
          S.schedule[pid][day] = { type: t, shift: null, store: null };
          return;
        }
        // No default folgas — start empty, user assigns manually
      });
    }
    // If already exists (added to another store), keep existing cells as-is
    // Mark person as belonging to this store so they appear in the section
    if (!S._personStores) S._personStores = {};
    if (!S._personStores[pid]) S._personStores[pid] = [];
    if (!S._personStores[pid].includes(sid)) S._personStores[pid].push(sid);
    if (!S._storeOrder) S._storeOrder = {};
    if (!S._storeOrder[sid]) S._storeOrder[sid] = [];
    if (!S._storeOrder[sid].includes(pid)) S._storeOrder[sid].push(pid);
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    showSchedule(active);
  }

  // ── REMOVER PERSONA DE TIENDA — panel independiente ──

  function cleanupModalExtras() {
    const injected = document.querySelector('#gh-add-person-list');
    if (injected) injected.remove();
    const typeEl = document.getElementById('gh-me-type');
    if (typeEl) typeEl.style.display = '';
    const workEl = document.getElementById('gh-me-work');
    if (workEl) workEl.style.display = '';
    if (document.getElementById('gh-modal')) document.getElementById('gh-modal').dataset.mode = '';
    _addCtx = null;
  }

  function closeModal() {
    cleanupModalExtras();
    document.getElementById('gh-modal')?.classList.remove('open');
    editCtx = null;
  }


  function startNew() {
    S = blank(); wStep = 0; renderWiz();
  }

  // ── PUBLIC INIT ──
  window.initGeradorHorarios = function () {
    const panel = document.getElementById('tab-gerador');
    if (!panel) return;


    // Inject HTML into panel (only once) — only gh-container goes inside the panel
    if (!document.getElementById('gh-container')) {
      panel.innerHTML = `<div id="gh-container"></div>`;
    }

    if (!document.getElementById('gh-confirm-modal')) {
      const cm = document.createElement('div');
      cm.id = 'gh-confirm-modal';
      cm.innerHTML = `<div class="gh-cm-box"><div class="gh-cm-msg" id="gh-cm-msg"></div><div class="gh-cm-btns"><button class="gh-cm-cancel" id="gh-cm-cancel">Cancelar</button><button class="gh-cm-ok" id="gh-cm-ok">Eliminar</button></div></div>`;
      document.body.appendChild(cm);
      cm.addEventListener('click', e => { if (e.target === cm) closeConfirmModal(); });
      document.getElementById('gh-cm-cancel').addEventListener('click', closeConfirmModal);
    }

    // Modal lives in document.body — completely outside any tab panel so it never
    // bleeds into other modules regardless of how tabs show/hide their panels.
    if (!document.getElementById('gh-modal')) {
      const modalEl = document.createElement('div');
      modalEl.id = 'gh-modal';
      modalEl.innerHTML = `
        <div class="gh-modal">
          <div class="gh-modal-hdr">
            <div class="gh-modal-ttl" id="gh-me-ttl">Editar</div>
            <button class="gh-modal-x" id="gh-modal-x">✕</button>
          </div>
          <div class="gh-modal-bdy">
            <!-- hidden selects kept for compatibility with existing JS logic -->
            <select id="gh-me-type">
              <option value="work">Trabalho</option>
              <option value="folga">FOLGA</option>
              <option value="ferias">FÉRIAS</option>
              <option value="baixa">Licença</option>
              <option value="baixa_medica">Baixa Médica</option>
              <option value="fora_contrato">Fora de Contrato</option>
            </select>
            <select id="gh-me-shift">
              <option value="10:00-13:00|14:00-19:00">[A]</option>
              <option value="10:00-14:00|15:00-19:00">[B]</option>
              <option value="10:00-15:00|16:00-19:00">[C]</option>
              <option value="09:00-12:00|13:00-18:00">[D]</option>
              <option value="11:00-15:00|16:00-20:00">[E]</option>
              <option value="09:00-13:00|19:00-23:00">[F]</option>
              <option value="09:00-13:00|14:00-18:00">[G]</option>
              <option value="11:00-14:00|15:00-20:00">[H]</option>
              <option value="10:00-13:00|APOIO:13:00-14:00|15:00-19:00">[APOIO_A13]</option>
              <option value="10:00-13:00|APOIO|15:00-19:00">[APOIO_A14]</option>
              <option value="10:00-14:00|APOIO:14:00-15:00|16:00-19:00">[APOIO_B14]</option>
              <option value="11:00-14:00|APOIO:14:00-15:00|16:00-20:00">[APOIO_E14]</option>
              <option value="11:00-13:00|APOIO:13:00-14:00|15:00-20:00">[APOIO_H13]</option>
              <option value="09:00-12:00|APOIO:13:00-14:00|14:00-18:00">[APOIO_D13]</option>
              <option value="09:00-13:00|APOIO:14:00-15:00|15:00-18:00">[APOIO_G14]</option>
            </select>
            <select id="gh-me-store"></select>

            <!-- TIPO buttons -->
            <div class="gh-form-grp">
              <div class="gh-btn-group" id="gh-me-type-btns">
                <button class="gh-pill gh-pill-tipo" data-val="work">Trabalho</button>
                <button class="gh-pill gh-pill-tipo" data-val="folga">Folga</button>
                <button class="gh-pill gh-pill-tipo" data-val="ferias">Férias</button>
                <button class="gh-pill gh-pill-tipo" data-val="baixa">Licença</button>
                <button class="gh-pill gh-pill-tipo" data-val="baixa_medica">Baixa Médica</button>
                <button class="gh-pill gh-pill-tipo" data-val="fora_contrato">Fora de Contrato</button>
              </div>
            </div>

            <div id="gh-me-work">
              <!-- HORÁRIO buttons — only times, no letter -->
              <div class="gh-form-grp">
                <div class="gh-btn-group gh-btn-group-shifts" id="gh-me-shift-btns">
                  <button class="gh-pill gh-pill-shift" data-val="09:00-12:00|13:00-18:00">09:00 – 12:00<br>13:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="09:00-13:00|14:00-18:00">09:00 – 13:00<br>14:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="09:00-13:00|19:00-23:00">09:00 – 13:00<br>19:00 – 23:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="10:00-13:00|14:00-19:00">10:00 – 13:00<br>14:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="10:00-14:00|15:00-19:00">10:00 – 14:00<br>15:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="10:00-15:00|16:00-19:00">10:00 – 15:00<br>16:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="11:00-14:00|15:00-20:00">11:00 – 14:00<br>15:00 – 20:00</button>
                  <button class="gh-pill gh-pill-shift" data-val="11:00-15:00|16:00-20:00">11:00 – 15:00<br>16:00 – 20:00</button>
                </div>
                <div class="gh-apoio-section-label">⚡ Reforço de almoço</div>
                <div class="gh-btn-group gh-btn-group-apoio" id="gh-me-apoio-btns">
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="09:00-12:00|APOIO:13:00-14:00|14:00-18:00">09:00 – 12:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>14:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="09:00-13:00|APOIO:14:00-15:00|15:00-18:00">09:00 – 13:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>15:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-13:00|APOIO:13:00-14:00|15:00-19:00">10:00 – 13:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>15:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-13:00|APOIO|15:00-19:00">10:00 – 13:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>15:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-14:00|APOIO:14:00-15:00|16:00-19:00">10:00 – 14:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>16:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="11:00-13:00|APOIO:13:00-14:00|15:00-20:00">11:00 – 13:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>15:00 – 20:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="11:00-14:00|APOIO:14:00-15:00|16:00-20:00">11:00 – 14:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>16:00 – 20:00</button>
                </div>
                <!-- APOIO store selector -->
                <div id="gh-apoio-store-wrap">
                  <div class="gh-apoio-title">Tienda de apoio (14:00–15:00)</div>
                  <select id="gh-apoio-store" class="gh-ab-sel"></select>
                </div>
              </div>
              <!-- LOJA buttons -->
              <div class="gh-form-grp gh-form-grp-last">
                <div class="gh-btn-group gh-btn-group-stores" id="gh-me-store-btns"></div>
              </div>
            </div>
            <div class="gh-conf-note" id="gh-me-conf"></div>
          </div>
        </div></div></div>`;
      document.body.appendChild(modalEl);

      document.getElementById('gh-modal-x').addEventListener('click', closeModal);
      document.getElementById('gh-me-type').addEventListener('change', meTypeChange);
      // Backdrop click closes modal
      modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModal();
      });
      // TIPO pill buttons
      document.getElementById('gh-me-type-btns').addEventListener('click', e => {
        const btn = e.target.closest('.gh-pill[data-val]');
        if (!btn) return;
        const val = btn.dataset.val;
        // Licença: perguntar recuperável / não recuperável ANTES de aplicar.
        if (val === 'baixa') {
          showLicencaModal(
            (recuperavel) => {
              if (editCtx) editCtx.licRecuperavel = recuperavel;
              document.getElementById('gh-me-type').value = 'baixa';
              ghSyncPillGroup('gh-me-type-btns', 'baixa');
              meTypeChange();
              applyEdit();
            },
            () => {
              // Cancelar: repor o pill no tipo actual da célula, sem alterar nada.
              const cur = (editCtx && S.schedule[editCtx.pid]?.[editCtx.day]?.type) || 'folga';
              const mapped = cur === 'work' ? 'work' : cur === 'ferias' ? 'ferias' : cur === 'baixa_medica' ? 'baixa_medica' : cur === 'fora_contrato' ? 'fora_contrato' : cur === 'baixa' ? 'baixa' : 'folga';
              ghSyncPillGroup('gh-me-type-btns', mapped);
            }
          );
          return;
        }
        document.getElementById('gh-me-type').value = val;
        ghSyncPillGroup('gh-me-type-btns', val);
        meTypeChange();
        if (val !== 'work') applyEdit();
      });
      // HORARIO pill buttons — wired to BOTH the normal-shift group and the apoio group
      const onShiftPillClick = (e) => {
        const btn = e.target.closest('.gh-pill[data-val]');
        if (!btn) return;
        document.getElementById('gh-me-shift').value = btn.dataset.val;
        // Keep selection highlight correct across both groups
        ghSyncPillGroup('gh-me-shift-btns', btn.dataset.val);
        ghSyncPillGroup('gh-me-apoio-btns', btn.dataset.val);
        // Show/hide apoio store selector and update its label
        const wrap = document.getElementById('gh-apoio-store-wrap');
        const isApoio = btn.dataset.val.includes('APOIO');
        if (wrap) {
          wrap.style.display = isApoio ? 'block' : 'none';
          if (isApoio) {
            // Extract apoio time from value: |APOIO:HH:MM-HH:MM| or legacy |APOIO| = 14:00-15:00
            const apoioMatch = btn.dataset.val.match(/APOIO:(\d{2}:\d{2}-\d{2}:\d{2})/);
            const apoioTime = apoioMatch ? apoioMatch[1] : '14:00-15:00';
            const lbl = wrap.querySelector('div');
            if (lbl) lbl.textContent = `Tienda de apoio (${apoioTime})`;
          }
        }
        if (!isApoio && document.getElementById('gh-me-store').value) applyEdit();
      };
      document.getElementById('gh-me-shift-btns').addEventListener('click', onShiftPillClick);
      document.getElementById('gh-me-apoio-btns').addEventListener('click', onShiftPillClick);
      // LOJA pill buttons (dynamic)
      document.getElementById('gh-me-store-btns').addEventListener('click', e => {
        const btn = e.target.closest('.gh-pill[data-val]');
        if (!btn) return;
        document.getElementById('gh-me-store').value = btn.dataset.val;
        ghSyncPillGroup('gh-me-store-btns', btn.dataset.val);
        applyEdit();
      });
    }

    // Capture the edit-pending flag synchronously NOW. The watcher may clear the global
    // flag before this init's async loadKnowledgeBase().then() resolves, so we must read
    // it here, not inside the .then().
    const editPending = !!window._ghLoadPortoWeek;

    // Load knowledge base from Supabase before rendering
    loadKnowledgeBase().then(async () => {
      // Edit-from-admin is handled exclusively by the watchEditTrigger() poller below,
      // which calls window._ghLoadPortoWeekForEdit(weekISO). Here we only render the
      // wizard when there is no pending edit request.
      if (!editPending) {
        renderWiz();
      }
    }).catch(err => {
      console.error('Failed to load knowledge base:', err);
      if (!editPending) renderWiz();
    });
  };

  // ── TAB LISTENER ──
  // Listen for tab changes using the custom openModule flow AND direct tab-btn clicks.
  // IMPORTANT: only match clicks whose target is actually a tab button — NOT clicks on
  // dashboard cards (.adm-mod-card) which also reach the document in capture phase.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.tab-btn, .drawer-tab-btn');
    if (!btn) return;
    // Extra guard: ignore if the button is inside the dashboard card grid
    // (shouldn't happen normally, but prevents false positives)
    if (e.target.closest('.adm-mod-card')) return;
    if (btn.dataset.tab === 'gerador') {
      window.initGeradorHorarios?.();
    } else {
      cleanupGeradorLayout();
    }
  }, true); // capture phase: fires before the tab's own handler shows/hides panels

  // ── EDIT-FROM-ADMIN WATCHER ──
  // The admin viewer (admin-horarios.js) sets window._ghLoadPortoWeek then clicks the
  // gerador tab. That click can be interrupted by errors in other admin scripts before
  // initGeradorHorarios runs, leaving the week unloaded. This watcher polls for the flag
  // independently of the tab click, so the edit always loads once the panel exists.
  (function watchEditTrigger() {
    let busy = false;
    setInterval(function () {
      if (busy) return;
      const weekISO = window._ghLoadPortoWeek;
      if (!weekISO) return;
      const panel = document.getElementById('tab-gerador');
      if (!panel) return;
      // Only proceed once the gerador panel is actually visible
      const visible = panel.offsetParent !== null ||
                      (panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none');
      if (!visible) return;
      busy = true;
      // Initialize the module WHILE the flag is still set, so initGeradorHorarios skips
      // renderWiz() (it checks window._ghLoadPortoWeek) and doesn't paint the wizard over
      // the week we're about to load.
      window.initGeradorHorarios?.();
      // Now consume the flag and load the published week through the safe wrapper.
      window._ghLoadPortoWeek = null;
      Promise.resolve()
        .then(function () { return window._ghLoadPortoWeekForEdit?.(weekISO); })
        .catch(function (err) { console.error('[GH] edit trigger watcher error:', err); })
        .finally(function () { busy = false; });
    }, 250);
  })();

})();

/* ══════════════════════════════════════════════════════════════
   BLOCO BANCO DE HORAS — fundido de banco-horas.js
   IIFE própria, scope isolado.
══════════════════════════════════════════════════════════════ */
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
//  conceito de "pendente", os pedidos da colaboradora de Porto Santo ficam
//  numa tabela nova (bh_ps_pendentes) até serem aceites — só aí entram em
//  gh_banco_horas, tal como a lógica de aprovação das outras lojas.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── DOM injected by banco-horas.js ──
  function ensureTabShell() {
    if (document.getElementById('tab-banco-horas')) return;
    var adminApp = document.getElementById('admin-app');
    if (!adminApp) return;
    var panel = document.createElement('div');
    panel.id = 'tab-banco-horas';
    panel.className = 'tab-panel';
    panel.innerHTML = '<div id="bh-admin-root"></div>';
    adminApp.appendChild(panel);
  }
  ensureTabShell();

  // ── Cartão do submenu "horários" injetado por banco-horas.js ──
  function ensureModuleCard() {
    if (document.querySelector('.adm-mod-card[data-horarios-module="banco-horas"]')) return;
    var grid = document.getElementById('horarios-sub-grid');
    if (!grid) return;
    var card = document.createElement('div');
    card.className = 'adm-mod-card';
    card.setAttribute('data-horarios-module', 'banco-horas');
    card.innerHTML = `        <span class="adm-mod-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="10" width="4" height="10" rx="1" stroke="rgba(255,255,255,0.85)" stroke-width="1.3"/>
            <rect x="10" y="6" width="4" height="14" rx="1" stroke="rgba(255,255,255,0.85)" stroke-width="1.3"/>
            <rect x="17" y="13" width="4" height="7" rx="1" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
            <path d="M4 6l3-2 3 2" stroke="rgba(255,255,255,0.6)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <div>
          <div class="adm-mod-name">BANCO DE HORAS</div>
          <div class="adm-mod-desc">colaboradoras, saldos e aprovação de horas</div>
        </div>
        <div class="adm-mod-arrow">→</div>
      `;
    grid.appendChild(card);
    card.addEventListener('click', function () {
      if (typeof window.closeHorariosOverlay === 'function') window.closeHorariosOverlay();
      setTimeout(function () {
        if (typeof window.openModule === 'function') window.openModule('banco-horas');
      }, 200);
    });
  }
  ensureModuleCard();

  // ── Overlay "banco de horas" (fora de #admin-app) injetado por banco-horas.js ──
  function ensureOverlayShell() {
    if (document.getElementById('banco-horas-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div id="banco-horas-overlay">
  <div id="banco-horas-overlay-bar">
    <button id="banco-horas-overlay-back" onclick="closeBancoHorasOverlay()">← voltar</button>
    <span id="banco-horas-overlay-title">banco de horas</span>
  </div>
  <div id="banco-horas-overlay-content">
    <div id="bh-loja-root"></div>
  </div>
</div>`);
  }
  ensureOverlayShell();

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

  // Mostra sempre horas:minutos (ex.: 28,5h -> "28:30"), nunca decimal —
  // "6,95" lia-se como se tivesse 95 minutos, o que não existe.
  function bhFormatHoras(h) {
    var totalMin = Math.round(Number(h) * 60);
    var sinal = totalMin < 0 ? '-' : '';
    totalMin = Math.abs(totalMin);
    var hh = Math.floor(totalMin / 60);
    var mm = totalMin % 60;
    return sinal + hh + ':' + String(mm).padStart(2, '0');
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
    if (n > 0) return { texto: bhFormatHoras(n) + ' h a favor da colaboradora', classe: 'bh-saldo-positivo' };
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

  // 'credito' = horas extra (a favor da colaboradora) · 'debito' = deve à empresa
  function bhTipoLabel(tipo) {
    return tipo === 'credito' ? 'horas extra' : 'deve à empresa';
  }
  function bhTipoBadge(tipo) {
    return tipo === 'credito'
      ? '<span class="bh-badge bh-badge-credito">horas extra</span>'
      : '<span class="bh-badge bh-badge-debito">deve à empresa</span>';
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
    var res = await fetch('/api/recibos-gerir', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('sessão de recibos indisponível (' + res.status + ') — atualiza a página');
    var body = await res.json().catch(function () { return {}; });
    return (body.funcionarias || []).filter(function (f) { return f.ativo !== false; });
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
  // admin (política "solo admin con token", cmd=ALL) — por isso lê-se aqui
  // por duas vistas próprias (gh_people_publico / gh_banco_horas_publico),
  // que só expõem nome+id e pessoa_id+saldo, com leitura aberta (anon) —
  // ver SQL correspondente. A tabela original e a sua proteção de escrita
  // não mudam; escritas continuam sempre por bhAdminClient()/sbAdmin.
  async function bhFetchPessoasPortoSanto() {
    var res = await window.sbClient.from('gh_people_publico').select('id,name').order('name', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function bhFetchBancoPortoSantoMap() {
    var res = await window.sbClient.from('gh_banco_horas_publico').select('pessoa_id,saldo');
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
          '<div class="bh-row-nome" id="bh-lancar-modal-nome"></div>' +
          '<div class="bh-row-loja" id="bh-lancar-modal-loja"></div>' +
          '<div id="bh-lancar-gerir-lojas-wrap"><button class="bh-btn" type="button" id="bh-lancar-gerir-lojas-btn">gerir lojas</button></div>' +
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
      '<span class="' + saldo.classe + ' bh-saldo-inline">' + saldo.texto + '</span>' +
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
      // Nomes que já pertencem a Porto Santo (gh_people) também contam como
      // "já têm loja" — só não estão em bh_colaboradoras porque essa loja é
      // gerida à parte, no gerador de horários.
      var pessoasPS = await bhFetchPessoasPortoSanto().catch(function () { return []; });

      var recibosList;
      try {
        recibosList = await bhFetchColaboradorasRecibos();
      } catch (recibosErr) {
        // Não sabemos o estado real de "gerir colaboradoras" agora — nunca
        // mostrar pendentes/órfãos com base nisso, seria dar falsos positivos
        // (gente real a aparecer como se devesse ser eliminada).
        wrap.innerHTML = '<div class="bh-section"><div class="bh-row-meta warn">Não foi possível confirmar "gerir colaboradoras" agora (' + bhEsc(recibosErr.message) + '). Atualiza a página para veres pendentes/órfãos aqui.</div></div>';
        return;
      }
      var recibosNomes = recibosList.map(function (f) { return f.nome; });
      var recibosNomesLowerSet = new Set(recibosNomes.map(function (n) { return n.trim().toLowerCase(); }));
      var assignedNomesLowerSet = new Set(todasColaboradoras.map(function (c) { return c.nome.trim().toLowerCase(); }));
      pessoasPS.forEach(function (p) { assignedNomesLowerSet.add(p.name.trim().toLowerCase()); });

      var pendentes = recibosNomes.filter(function (n) { return !assignedNomesLowerSet.has(n.trim().toLowerCase()); });
      var orphans = todasColaboradoras.filter(function (c) { return !recibosNomesLowerSet.has(c.nome.trim().toLowerCase()); });

      if (!pendentes.length && !orphans.length) { wrap.innerHTML = ''; return; }

      var html = '';
      if (pendentes.length) {
        html += '<div class="bh-section-title">colaboradoras por atribuir</div>' +
          '<div class="bh-row-meta mb">Clica no nome para escolher a loja.</div>' +
          pendentes.map(bhRenderPendenteAtribuicaoRow).join('');
      }
      if (orphans.length) {
        html += '<div class="bh-section-title' + (pendentes.length ? ' mt' : '') + '">sem correspondência nos recibos</div>' +
          '<div class="bh-row-meta mb">Têm horas registadas mas já não estão em "gerir colaboradoras".</div>' +
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
        '<div class="bh-row-nome" id="bh-gerir-lojas-modal-nome"></div>' +
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
    bhAdminInjectDOM();
    bhAdminRefreshAll();
  };

  /* ══════════════════════════════════════════════════════════════
     LOJA — DOM + RENDER (autosserviço da colaboradora)
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
        '<div id="bh-loja-content">' +
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
        var bancoRes = await window.sbClient.from('gh_banco_horas_publico').select('saldo').eq('pessoa_id', bhLojaColaboradoraAtual.id).maybeSingle();
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

  /* ══════════════════════════════════════════════════════════════
     VISUALIZAÇÃO (dashboard de colaboradoras — botão "banco de horas")
     Só leitura por agora: mostra os nomes da loja e o saldo de cada
     uma, sem qualquer ação de editar/aprovar. Chamado por index.html
     (openBanco()) sempre que o modal abre.
     ══════════════════════════════════════════════════════════════ */
  function bhRenderSaldoRowSimples(s) {
    var saldo = bhFormatSaldo(s.saldo_horas);
    return '<div class="bh-row nowrap">' +
      '<div class="bh-row-main nowrap"><span class="bh-row-nome ellipsis">' + bhEsc(s.nome) + '</span></div>' +
      '<span class="' + saldo.classe + ' bh-saldo-inline-row">' + saldo.texto + '</span>' +
    '</div>';
  }

  window.bhVisualizarSaldos = async function () {
    var el = document.getElementById('wz-banco-modal-body');
    if (!el) return;
    el.innerHTML = '<div class="bh-empty">a carregar…</div>';
    var loja = window._currentStoreGlobal;
    try {
      var saldos;
      if (loja === 'porto santo') {
        saldos = await bhFetchSaldosPortoSanto();
      } else {
        saldos = await bhFetchSaldos(loja);
        saldos = saldos.filter(function (s) { return s.ativo; });
      }
      saldos.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt'); });
      el.innerHTML = saldos.length
        ? saldos.map(bhRenderSaldoRowSimples).join('')
        : '<div class="bh-empty">sem colaboradoras registadas nesta loja.</div>';
    } catch (err) {
      el.innerHTML = '<div class="bh-error">' + bhEsc(err.message) + '</div>';
    }
  };

  window.openBancoHorasOverlay = function () {
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
