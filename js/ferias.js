// ══ FÉRIAS TAB ══
(function() {

  // ── SUPABASE ──
  const SUPA_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  // Esperar a que el cliente Supabase esté disponible
  function getSupabase() {
    if (window.supabase && window.supabase.createClient) {
      return window.supabase.createClient(SUPA_URL, SUPA_KEY);
    }
    return null;
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
        el.style.cssText = 'position:fixed;bottom:28px;right:20px;background:#111;color:#fff;padding:8px 16px;border-radius:10px;font-size:.78rem;font-weight:600;z-index:99999;opacity:.85';
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

    const LS = 'display:block;font-size:.72rem;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px';
    const IS = 'width:100%;background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:9px 12px;font-size:.88rem;box-sizing:border-box;outline:none';

    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:28px 24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#111">'+(isEdit?'✏️ Editar':'➕ Adicionar')+' Férias '+year+'</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#888;font-size:1.3rem;cursor:pointer">✕</button>'
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

      +'<div id="f-modal-error" style="display:none;color:#c00;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<div style="display:flex;gap:10px">'
      +(isEdit ? '<button id="f-modal-delete" style="flex:0 0 auto;background:#fff;color:#c00;border:1px solid #ccc;border-radius:9px;padding:11px 16px;font-size:.85rem;font-weight:700;cursor:pointer">🗑</button>' : '')
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
    const LS = 'display:block;font-size:.72rem;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px';
    const IS = 'width:100%;background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:10px 12px;font-size:.9rem;box-sizing:border-box;outline:none;text-transform:uppercase;margin-bottom:20px';

    const modal = document.createElement('div');
    modal.id = 'f-modal-overlay';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<span style="font-size:1rem;font-weight:700;color:#111">👤 Nova Pessoa</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#888;font-size:1.3rem;cursor:pointer">✕</button>'
      +'</div>'
      +'<label style="'+LS+'">Nome completo</label>'
      +'<input id="f-inp-pessoa-nome" type="text" placeholder="NOME APELIDO" style="'+IS+'">'
      +'<div id="f-modal-error" style="display:none;color:#c00;font-size:.78rem;margin-bottom:10px;font-weight:600"></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      +'<button id="f-pessoa-save-only" style="'+BTN+'">Guardar</button>'
      +'<button id="f-pessoa-save-ferias" style="'+BTN+'">Guardar + Férias</button>'
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
      html += '<div style="margin-bottom:16px">'
        +'<div style="font-size:.75rem;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">'+yr+' · '+total+' dias</div>';
      entries.sort(function(a,b){ return parseDate(a.de)-parseDate(b.de); }).forEach(function(f,i){
        const deD = parseDate(f.de), ateD = parseDate(f.ate);
        const dias = daysBetween(deD, ateD) + 1;
        const deStr = f.de.substring(0,5), ateStr = f.ate.substring(0,5);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eee">'
          +'<span style="font-size:.82rem;color:#111">'+deStr+' → '+ateStr+'</span>'
          +'<span style="display:flex;align-items:center;gap:10px">'
          +'<span style="font-size:.75rem;color:#666">'+dias+'d · '+f.loja+'</span>'
          +'<button data-id="'+f.id+'" class="fv-edit-btn" style="background:none;border:none;color:#888;cursor:pointer;font-size:.8rem;padding:2px 6px">✏️</button>'
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
      '<div style="background:#fff;border-radius:14px;padding:28px 24px;width:100%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:inherit">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">'
      +'<span style="font-size:.95rem;font-weight:700;color:#111">📋 '+nome+'</span>'
      +'<button id="f-modal-close" style="background:none;border:none;color:#888;font-size:1.3rem;cursor:pointer">✕</button>'
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

    // ── Barra de acciones ──
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
      let ohtml = '<div class="f-section"><div style="background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 14px;font-size:.78rem;color:#111;font-weight:600">'
        +'⚠️ Solapamentos detetados:<br>';
      filteredOverlaps.forEach(function(o){
        ohtml += '<span style="font-weight:400;color:#444">'+o.a.nome+' &amp; '+o.b.nome+' ('+o.a.loja+') — '
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
      const dotColor = f.status==='active' ? '#2a8a2a' : f.status==='upcoming' ? '#e09000' : '#555';
      const badgeCls = f.status==='active' ? 'active-now' : f.status==='upcoming' ? 'soon' : 'past';
      const lojaTag  = f.loja ? '<span style="font-size:.65rem;font-weight:600;color:#bbb;margin-left:6px;text-transform:lowercase;letter-spacing:.04em">'+f.loja+'</span>' : '';
      const deStr    = f.de.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const ateStr   = f.ate.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const badge    = isCurrentYear ? '<span class="f-badge '+badgeCls+'">'+fmtDays(f.days, f.status)+'</span>' : '';
      const dias     = daysBetween(f.de instanceof Date ? f.de : parseDate(f.de),
                                   f.ate instanceof Date ? f.ate : parseDate(f.ate)) + 1;
      const diasTag  = '<span style="font-size:.68rem;color:#777;margin-left:4px">'+dias+'d</span>';
      const editBtn  = '<button class="f-edit-card-btn" data-id="'+f.id+'" '
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

    const upcoming_all = enriched.filter(function(f){ return f.status==='upcoming'; })
                                  .sort(function(a,b){ return a.de-b.de; });
    const nextUp = upcoming_all[0] || null;

    // ── Montar HTML ──
    let html = '';

    // ── Bloco "próximo a ir" — CORREGIDO: usa f-section para respetar max-width ──
    if (isCurrentYear && nextUp && nextUp.days > 7) {
      html += '<div class="f-section">'
        +'<div style="background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 14px;font-size:.82rem;color:#111;font-weight:600">'
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

  // ── INIT ──
  async function initFerias() {
    _supaClient = getSupabase();
    if (!_supaClient) {
      console.warn('[Férias] Supabase no disponible, reintentando…');
      setTimeout(initFerias, 500);
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

  // Arrancar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFerias);
  } else {
    setTimeout(initFerias, 200);
  }

})();
