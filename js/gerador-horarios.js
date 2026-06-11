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
      _personStores: {}, _storeOrder: {}
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
      // Only set colours — overflow and layout are controlled by HTML CSS
      panel.style.background = '#fff';
      panel.style.color = '#111';
    }
  }

  function cleanupGeradorLayout() {
    // Called when leaving the gerador tab — reset only the inline styles we added.
    // NEVER touch display — the tab system's CSS controls visibility exclusively.
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      panel.style.background = '';
      panel.style.color = '';
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
        <div id="gh-borradores-list" style="margin-top:48px;"></div>
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
                <div class="gh-wiz-title" style="margin-bottom:0">Pessoal Activo</div>
                <div class="gh-step2-badge">
                  ${(PEOPLE.length - feriasAuto.length)} activa${(PEOPLE.length - feriasAuto.length) !== 1 ? 's' : ''} · ${feriasAuto.length} férias
                </div>
              </div>
              <div class="gh-wiz-sub">Gere o pessoal de Porto Santo.</div>
            </div>
          </div>

          <!-- FÉRIAS BANNER -->
          ${feriasAuto.length ? `<div class="gh-ferias-banner" style="margin-top:6px;margin-bottom:6px">
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
            <button class="gh-add-btn" id="gh-add-person" style="margin:0">+ Adicionar pessoa</button>
            <button class="gh-btn gh-btn-solid" id="gh-sub-abs">Continuar →</button>
          </div>
        </div>

        <!-- FORM ADICIONAR/EDITAR -->
        <div id="gh-person-form" style="display:none" class="gh-person-form">
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
            <div class="gh-pf-field" style="grid-column:1/-1">
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
          <div class="gh-pf-field" style="margin-top:10px">
            <label>Lojas onde pode trabalhar</label>
            <div class="gh-pf-stores" id="gh-pf-knows">
              ${STORES.map(s => `<label class="gh-pf-check"><input type="checkbox" value="${s.id}"> ${s.name}</label>`).join('')}
            </div>
          </div>
          <div class="gh-pf-field" style="margin-top:10px">
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
          folgaPedidaTag = `<span style="display:inline-flex;align-items:center;gap:5px;margin-top:3px;padding:3px 9px 3px 7px;background:#fff3cd;border:1.5px solid #e6a817;border-radius:5px;font-size:.7rem;font-weight:800;color:#7a4800;letter-spacing:.02em;white-space:nowrap;">⚑ PEDIU FOLGA · ${labels.toUpperCase()}</span>`;
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
          contractEndTag = ` · <span style="font-size:.58rem;color:#e57373;font-weight:700;">fim contrato ${endFmt}</span>`;
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
              ${folgaPedidaTag ? `<div style="margin-top:2px;">${folgaPedidaTag}</div>` : ''}
            </div>
          </div>
          <div class="gh-sr-btns">
            <button class="gh-icon-btn gh-edit-person" data-pid="${p.id}" title="Editar">✏</button>
            <button class="gh-icon-btn gh-limpar-inc" data-pid="${p.id}" title="Limpar" style="color:#b8860b">↺</button>
            <button class="gh-icon-btn gh-del-person" data-pid="${p.id}" title="Eliminar" style="color:#c0392b">✕</button>
          </div>
        </div>

        <!-- CORPO colapsável -->
        <div class="gh-sr-body" id="gh-body-${p.id}" style="display:none">
          <div class="gh-sr-cols">
            <div class="gh-sr-col">
              <div class="gh-sr-col-title">📅 Folga</div>
              <div class="gh-day-btns">${dayBtns}</div>
              <div class="gh-sr-col-title" style="margin-top:8px">📋 Licença <input type="checkbox" class="gh-inc-usar" data-pid="${p.id}" data-col="lic_active" ${licenca.active?'checked':''}></div>
              <div class="gh-date-row">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_from" value="${licenca.data_inicio?licenca.data_inicio.slice(5).split('-').reverse().join('/')+'/'+licenca.data_inicio.slice(2,4):''}" placeholder="dd/mm/aa">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_to" value="${licenca.data_fim?licenca.data_fim.slice(5).split('-').reverse().join('/')+'/'+licenca.data_fim.slice(2,4):''}" placeholder="dd/mm/aa">
              </div>
              <div class="gh-date-row" style="margin-top:3px">
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
              <div class="gh-sr-col-title" style="margin-top:8px">⏱ Banco <button class="gh-btn-guardar-inc gh-icon-btn" data-pid="${p.id}" title="Guardar baixa, licença e banco" style="margin-left:auto;font-size:.6rem;padding:1px 6px;width:auto;color:#1a5c1a;border-color:#b7ddb7;background:#f0fdf0;">💾</button></div>
              <div class="gh-inc-saldo ${saldo>0?'gh-inc-saldo-neg':saldo<0?'gh-inc-saldo-pos':''}" id="gh-saldo-${p.id}">${saldo>0?'+':''}${saldo}h</div>
              <div class="gh-banco-add-row">
                <input type="number" class="gh-field-sm gh-banco-h gh-num-mini" data-pid="${p.id}" placeholder="±h" step="0.5">
                <button class="gh-icon-btn gh-banco-lancar" data-pid="${p.id}" title="Lançar">＋</button>
                <button class="gh-icon-btn gh-banco-zero" data-pid="${p.id}" title="Zerar" style="color:#c0392b">✕</button>
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
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
      });
    });
    list.querySelectorAll('.gh-inc-inp[data-col^="baixa"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        if (!S._baixas) S._baixas = {};
        if (!S._baixas[pid]) S._baixas[pid] = {};
        S._baixas[pid]._pendente = true;
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
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
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
      });
    });

    // Botão guardar incidências por pessoa (baixa + licença + banco pendente)
    list.querySelectorAll('.gh-btn-guardar-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        btn.textContent = '⏳'; btn.style.opacity = '0.6';
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
        btn.style.opacity = '1';
        btn.style.background = saved ? '#f0fdf0' : '#f0fdf0';
        btn.style.borderColor = '#b7ddb7';
        btn.style.color = '#1a5c1a';
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
    if (!others.length) { container.innerHTML = '<span style="font-size:.72rem;color:#bbb">Sem outras pessoas na BD.</span>'; return; }
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

            // Si la persona no tiene horario esta semana, no tocar su saldo
            if (!tieneHorario) return;

            const diffSemana = Math.round((realHrs - 40) * 10) / 10;

            const registro = bancoMap[p.id] || { saldo: 0, saldo_semana: 0, ultima_semana: null };
            let saldoBase = registro.saldo || 0;

            // Si ya calculamos esta semana antes, restar el aporte anterior
            if (registro.ultima_semana === weekKey) {
              saldoBase = Math.round((saldoBase - (registro.saldo_semana || 0)) * 10) / 10;
            }

            const novoSaldo = Math.round((saldoBase + diffSemana) * 10) / 10;
            S._banco[p.id] = novoSaldo;

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
          retryBtn.style.cssText = 'margin-left:8px;color:#b8860b;border-color:#b8860b;';
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

          if (cell.type === 'folga' || cell.type === 'ferias' || cell.type === 'baixa') {
            const lbl = cell.type === 'ferias' ? 'FERIAS' : cell.type === 'baixa' ? 'LICENÇA' : 'FOLGA';
            rowA.push(lbl);
            rowB.push(cell.type === 'baixa' ? '' : lbl);
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
    c.innerHTML = '<div style="padding:40px;text-align:center;color:#aaa;font-size:.85rem;">A carregar horário publicado…</div>';
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

            DAYS_ORDER.forEach((day, di) => {
              const cellA = (rowA[di+1] || '').trim();
              const cellB = (rowB[di+1] || '').trim();
              const upper = cellA.toUpperCase();

              if (upper === 'FOLGA') {
                S.schedule[person.id][day] = { type: 'folga', shift: null, store: null };
              } else if (upper === 'FERIAS') {
                S.schedule[person.id][day] = { type: 'ferias', shift: null, store: null };
              } else if (cellA === '' && cellB === '') {
                // leave as empty
              } else {
                // Check if it's an alias (another store name)
                const aliasId = SHORT_TO_ID[upper.toLowerCase()];
                if (aliasId && aliasId !== storeId) {
                  // Person working in another store — only set if not already set
                  const cur = S.schedule[person.id][day];
                  if (cur.type === 'empty') {
                    S.schedule[person.id][day] = { type: 'work', shift: null, store: aliasId };
                  }
                } else {
                  // Actual shift — join morning + afternoon with |
                  const shift = cellB ? (cellA + '|' + cellB) : cellA;
                  const cur = S.schedule[person.id][day];
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
      const active = PEOPLE.filter(p => !fullyAbsent(p.id));
      showSchedule(active);

    } catch(e) {
      console.error('[GH] loadPortoWeekForEdit error:', e);
      c.innerHTML = '<div style="padding:40px;text-align:center;color:#c0392b;font-size:.85rem;">Erro ao carregar: ' + e.message + '</div>';
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
    };
  }


  function showToast(msg, duration = 3000) {
    let t = document.getElementById('gh-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gh-toast';
      t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.95);background:#111;color:#fff !important;-webkit-text-fill-color:#fff !important;padding:20px 36px;border-radius:14px;font-size:.95rem;font-weight:600;font-family:inherit;letter-spacing:.02em;opacity:0;transition:all .25s ease;z-index:99999;pointer-events:none;white-space:nowrap;box-shadow:0 16px 48px rgba(0,0,0,.35);';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translate(-50%,-50%) scale(1)';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translate(-50%,-50%) scale(0.95)';
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

      container.innerHTML = '<div style="font-size:.58rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ccc;margin-bottom:16px;text-align:center;">Borradores guardados</div>';

      data.forEach(b => {
        const d = new Date(b.semana + 'T00:00:00');
        const label = d.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' });
        const updated = new Date(b.updated_at).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:1px solid #efefef;border-radius:8px;margin-bottom:8px;background:#fafafa;gap:12px;';
        row.innerHTML =
          '<div>' +
            '<div style="font-size:.85rem;font-weight:600;color:#111;">Semana ' + label + '</div>' +
            '<div style="font-size:.63rem;color:#bbb;margin-top:2px;">Guardado: ' + updated + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-shrink:0;">' +
            '<button class="gh-btn gh-btn-solid gh-btn-sm" data-week="' + b.semana + '" data-action="load">Carregar</button>' +
            '<button class="gh-btn gh-btn-ghost gh-btn-sm" data-week="' + b.semana + '" data-action="delete" style="color:#c0392b !important;-webkit-text-fill-color:#c0392b !important;border-color:#e0b0b0 !important;">✕</button>' +
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

    return `<div class="gh-cov-panel" id="gh-cov-panel" style="display:none;">
      <div class="gh-cov-header">
        <span class="gh-cov-title">Cobertura por hora</span>
        <button class="gh-cov-close" id="gh-cov-close" title="Fechar">✕</button>
      </div>
      <div class="gh-cov-body">${sectionsHTML}</div>
    </div>`;
  }

  function updateBancoBadge(pid) {
    const realHrs = calcPersonHrs(pid);
    const diff = Math.round((realHrs - 40) * 10) / 10;
    const saldoBase = S._bancoBase?.[pid] ?? S._banco?.[pid] ?? 0;
    const saldoVivo = Math.round((saldoBase + diff) * 10) / 10;
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
    // Apply work-shift edits
    Object.entries(dayShifts).forEach(([day, segs]) => {
      const cell = S.schedule[pid]?.[day];
      if (!cell || cell.type !== 'work') return;
      const parts = Object.values(segs);
      const newShift = parts.map(([t1,t2]) => normTime(t1)+'-'+normTime(t2)).join('|');
      S.schedule[pid][day] = { ...cell, shift: newShift };
    });
    // Apply apoio-shift edits
    Object.entries(apoioEdits).forEach(([day, [t1, t2]]) => {
      if (!S._apoioShifts?.[pid]?.[day]) return;
      S._apoioShifts[pid][day].shift = normTime(t1) + '-' + normTime(t2);
    });
    // Update banco — always use current DB saldo as base, add weekly diff
    if (!S._banco) S._banco = {};
    const realHrs = calcPersonHrs(pid);
    const diff = Math.round((realHrs - 40) * 10) / 10;
    const bancoBase = S._bancoBase?.[pid] ?? S._banco[pid] ?? 0;
    const saldoVivo = Math.round((bancoBase + diff) * 10) / 10;
    S._banco[pid] = saldoVivo;
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
        <div style="display:flex;gap:8px;align-items:center;">
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
            const lbl = c2.type === 'ferias' ? 'FÉRIAS' : c2.type === 'baixa' ? 'LICENÇA' : 'FOLGA';
            const cls = (c2.type === 'ferias' || c2.type === 'baixa') ? 'c-ferias' : 'c-folga';
            return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner ${cls}"><span class="gh-sh-line">${lbl}</span></div></td>`;
          }
          let cls = '', content = '';
          if (c2.type === 'fim_contrato') { cls = 'c-fim-contrato'; content = `<span class="gh-sh-line gh-fim-txt">fim de contrato</span>`; }
          else if (c2.type === 'folga') { cls = 'c-folga'; content = `<span class="gh-sh-line">FOLGA</span>`; }
          else if (c2.type === 'ferias') { cls = 'c-ferias'; content = `<span class="gh-sh-line">FÉRIAS</span>`; }
          else if (c2.type === 'baixa')  { cls = 'c-ferias'; content = `<span class="gh-sh-line">LICENÇA</span>`; }
          else if (c2.type === 'na')     { cls = 'c-na';     content = `<span class="gh-sh-line">N/A</span>`; }
          else if (c2.type === 'empty')  { cls = 'c-empty';  content = ''; }
          else if (c2.type === 'work') {
            // Check if person does apoio in THIS store on this day
            const apoioHereRender = S._apoioShifts?.[p.id]?.[day]?.store === st.id;
            if (apoioHereRender) {
              cls = 'c-shift-b';
              content = `<span class="gh-sh-line" style="color:#e67e22;font-weight:700;">⚡ ${S._apoioShifts[p.id][day].shift}</span>`;
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
              <div class="gh-store-actions" id="gh-sa-${st.id}" style="display:flex">
                <button class="gh-store-act-btn gh-store-add" data-store="${st.id}" title="Adicionar pessoa">＋</button>
              </div>
            </td>
            ${DAYS.map((d,i) => `<td style="width:108px;min-width:108px;max-width:108px;box-sizing:border-box">${d}<br><span class="gh-tbl-date">${fmt(dates[i])}</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" style="padding:18px 12px;text-align:center;color:#bbb;font-size:.8rem;font-style:italic;">Loja vazia — use ＋ para adicionar pessoal</td></tr>`}</tbody>
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
            okBtn.style.cssText = 'margin-top:6px;background:#111 !important;color:#fff !important;-webkit-text-fill-color:#fff !important;border-radius:5px;padding:3px 10px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;display:block;width:100%;text-align:center;box-sizing:border-box;';
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
              inner.innerHTML = `<div style="display:flex;align-items:center;gap:1px;justify-content:center;">
                <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="apoio" data-seg="0" data-part="0" value="${a1 || ''}">
                <span style="font-size:.65rem;color:#999">-</span>
                <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="apoio" data-seg="0" data-part="1" value="${a2 || ''}">
              </div>`;
            }
            // Case B: this cell shows the person's real shift in THIS store → edit it
            else if (cell.store === tdStore && cell.shift) {
              const parts = cell.shift.split('|');
              inner.innerHTML = parts.map((seg, i) => {
                const [t1, t2] = seg.split('-');
                return `<div style="display:flex;align-items:center;gap:1px;justify-content:center;">
                  <input class="gh-sh-time-inp" data-pid="${pid}" data-day="${day}" data-kind="work" data-seg="${i}" data-part="0" value="${t1 || ''}">
                  <span style="font-size:.65rem;color:#999">-</span>
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
    typeEl.value = c2.type === 'work' ? 'work' : c2.type === 'ferias' ? 'ferias' : c2.type === 'baixa' ? 'baixa' : c2.type === 'empty' ? 'work' : 'folga';
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
      const cellType = type === 'ferias' ? 'ferias' : type === 'baixa' ? 'baixa' : 'folga';
      S.schedule[pid][day] = { type: cellType, shift: null, store: null };
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
      <div style="font-size:.7rem;color:#888;margin-bottom:10px;">Selecione a pessoa para adicionar a ${sname(sid)}. As suas ausências do assistente são mantidas. Edite os dias individualmente clicando nas células.</div>
      <div style="display:flex;flex-direction:column;gap:5px;max-height:220px;overflow-y:auto;">
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
            ? `<span style="font-size:.68rem;font-weight:700;color:#7a4800;background:#fff3cd;border:1px solid #e6a817;border-radius:4px;padding:1px 6px;white-space:nowrap;">⚑ ${hasBadge.label}</span>`
            : `<span style="font-size:.82rem;">${hasBadge.icon}</span>`)
            : '';
          return `<button class="gh-add-person-pick" data-pid="${p.id}"
            style="text-align:left;padding:8px 12px;border:1px solid #e0e0e0;border-radius:6px;background:${hasBadge.label ? '#fffbf0' : '#fff'};cursor:pointer;font-size:.82rem;font-family:inherit;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span>${shortName(p.name)}</span>
            ${badgeHtml}
          </button>`;
        }).join('') : '<div style="color:#bbb;font-size:.75rem;padding:8px">Todas as pessoas já foram adicionadas.</div>'}
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

    // Inject CSS only once
    if (!document.getElementById('gh-styles')) {
      const style = document.createElement('style');
      style.id = 'gh-styles';
      style.textContent = `
        /* ── LAYOUT — isolation from admin dark theme ── */
        #tab-gerador { background:#fff !important; color:#111 !important; }

        /* ── WIZARD ── */
        @keyframes gh-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        #tab-gerador .gh-wiz-box { width:100%; max-width:520px; margin:0 auto; padding:48px 24px; animation:gh-up .3s ease; box-sizing:border-box; }
        #tab-gerador .gh-wiz-label { font-size:.65rem; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:#bbb; margin-bottom:12px; }
        #tab-gerador .gh-wiz-title { font-size:1.6rem; font-weight:400; margin-bottom:8px; line-height:1.3; color:#111; }
        #tab-gerador .gh-wiz-sub   { font-size:.82rem; color:#888; margin-bottom:32px; line-height:1.6; }
        #tab-gerador .gh-field { width:100%; border:1px solid #ddd; border-radius:6px; padding:11px 13px; font-size:.9rem; font-family:inherit; font-weight:400; outline:none; transition:border-color .15s; background:#fff; margin-bottom:28px; color:#111; box-sizing:border-box; }
        #tab-gerador .gh-field:focus { border-color:#000; }
        #tab-gerador .gh-wiz-nav { display:flex; gap:12px; align-items:center; margin-top:4px; }

        /* ── BUTTONS ── */
        #tab-gerador .gh-btn { padding:9px 20px; font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; border-radius:6px; font-family:inherit; transition:all .15s; }
        #tab-gerador .gh-btn-solid { background:#111 !important; color:#fff !important; border:1px solid #111 !important; }
        #tab-gerador .gh-btn-solid:hover { background:#333 !important; border-color:#333 !important; }
        #tab-gerador .gh-btn-ghost { background:#fff !important; color:#111 !important; border:1px solid #999 !important; }
        #tab-gerador .gh-btn-ghost:hover { border-color:#111 !important; }
        #tab-gerador .gh-btn-sm { padding:6px 14px; font-size:.65rem; }
        #tab-gerador .gh-wiz-back { background:none !important; border:none !important; font-size:.68rem; color:#bbb !important; cursor:pointer; font-family:inherit; letter-spacing:.06em; text-transform:uppercase; padding:6px 4px; }
        #tab-gerador .gh-wiz-back:hover { color:#111 !important; }

        /* ── ABSENCES ── */
        #tab-gerador .gh-ab-list { margin-bottom:14px; }
        #tab-gerador .gh-ab-row { display:grid; grid-template-columns:1fr 110px 90px 28px; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0; }
        #tab-gerador .gh-ab-sel { border:1px solid #ddd; border-radius:5px; padding:7px 9px; font-size:.78rem; font-family:inherit; font-weight:300; outline:none; background:#fff; width:100%; color:#111; }
        #tab-gerador .gh-ab-x { background:none; border:none; cursor:pointer; color:#ccc; font-size:1rem; line-height:1; }
        #tab-gerador .gh-ab-x:hover { color:#c00; }
        #tab-gerador .gh-add-btn { display:flex; align-items:center; gap:8px; font-size:.75rem; color:#aaa; cursor:pointer; border:1px dashed #ddd; border-radius:5px; padding:9px 14px; background:none; font-family:inherit; width:100%; margin-bottom:24px; }
        #tab-gerador .gh-add-btn:hover { border-color:#111; color:#111; }

        /* ── STORE CONFIG ── */
        #tab-gerador .gh-store-cfg { margin-bottom:28px; display:flex; flex-direction:column; gap:0; }
        #tab-gerador .gh-sc-row { padding:14px 0 10px; border-bottom:1px solid #f0f0f0; display:flex; flex-direction:column; gap:8px; }
        #tab-gerador .gh-sc-row:last-child { border-bottom:none; }
        #tab-gerador .gh-sc-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        #tab-gerador .gh-sc-name { font-size:.88rem; cursor:pointer; color:#111; font-weight:600; flex:1; min-width:80px; }
        #tab-gerador .gh-sc-top input[type=checkbox] { width:16px; height:16px; cursor:pointer; accent-color:#000; flex-shrink:0; }
        #tab-gerador .gh-sc-minmax { display:flex; align-items:center; gap:4px; background:#f5f5f5; border:1px solid #e8e8e8; border-radius:6px; padding:3px 8px; margin-left:auto; }
        #tab-gerador .gh-sc-mm-field { display:flex; align-items:center; gap:3px; }
        #tab-gerador .gh-sc-mm-label { font-size:.58rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#aaa; }
        #tab-gerador .gh-sc-mm-inp { width:32px; font-size:.78rem; font-weight:700; text-align:center; border:1px solid #ddd; border-radius:3px; padding:2px 3px; color:#111; background:#fff; font-family:inherit; }
        #tab-gerador .gh-sc-mm-inp:focus { outline:none; border-color:#111; }
        #tab-gerador .gh-sc-mm-inp::placeholder { color:#ccc; font-weight:400; }
        #tab-gerador .gh-sc-mm-sep { font-size:.7rem; color:#ccc; padding:0 1px; }
        #tab-gerador .gh-sc-fixed-cap { font-size:.62rem; font-weight:700; color:#888; background:#f0f0f0; border:1px solid #e0e0e0; border-radius:5px; padding:3px 9px; margin-left:auto; white-space:nowrap; }
        #tab-gerador .gh-sc-days { display:flex; gap:5px; flex-wrap:wrap; padding-left:26px; }
        #tab-gerador .gh-sc-mode-row { display:flex; align-items:center; gap:8px; padding-left:26px; flex-wrap:wrap; }
        #tab-gerador .gh-sc-mode-label { font-size:.58rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#aaa; white-space:nowrap; }
        #tab-gerador .gh-sc-mode-sel { font-size:.72rem; border:1px solid #ddd; border-radius:5px; padding:4px 8px; font-family:inherit; color:#111; background:#fff; cursor:pointer; flex:1; min-width:180px; max-width:340px; }
        #tab-gerador .gh-sc-mode-sel:focus { outline:none; border-color:#111; }
        #tab-gerador .gh-sc-mode-hint { font-size:.62rem; color:#888; white-space:nowrap; flex-shrink:0; }
        /* Disabled state */
        #tab-gerador .gh-sc-row.closed .gh-sc-minmax,
        #tab-gerador .gh-sc-row.closed .gh-sc-mode-row { opacity:.3; pointer-events:none; }
        #tab-gerador .gh-sc-row.closed .gh-sc-name { color:#bbb; }
        #tab-gerador .gh-sc-row.closed .gh-sc-days { opacity:.2; pointer-events:none; }
        /* Day toggles */
        #tab-gerador .gh-dtog { padding:5px 9px; border:1px solid #ddd; border-radius:4px; font-size:.65rem; font-weight:600; letter-spacing:.04em; cursor:pointer; user-select:none; color:#555; background:#fff; transition:all .12s; }
        #tab-gerador .gh-dtog:hover { border-color:#555; }
        #tab-gerador .gh-dtog.on { background:#111; color:#fff !important; border-color:#111; }
        #tab-gerador .gh-dtog-dom { border-style:dashed; }
        #tab-gerador .gh-dtog-dom.on { background:#1a5c9e; border-color:#1a5c9e; border-style:solid; }
        /* Season banner */
        #tab-gerador .gh-season-banner { display:flex; align-items:flex-start; gap:10px; background:#f5f8ff; border:1px solid #d0ddf5; border-radius:8px; padding:10px 14px; margin-bottom:18px; }
        #tab-gerador .gh-season-icon { font-size:1.1rem; flex-shrink:0; margin-top:1px; }
        #tab-gerador .gh-season-name { font-size:.78rem; font-weight:700; color:#1a3a6c; margin-bottom:2px; }
        #tab-gerador .gh-season-hint { font-size:.7rem; color:#4a6a9c; line-height:1.4; }

        /* ── COMBINAÇÃO BAR ── */
        #tab-gerador .gh-comb-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:6px 20px; background:#f9f9f7; border-bottom:1px solid #efefeb; font-size:.62rem; }
        #tab-gerador .gh-comb-label { font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#bbb; margin-right:2px; }
        #tab-gerador .gh-comb-codes { font-family:monospace; color:#888; font-size:.68rem; }
        #tab-gerador .gh-comb-sep { color:#ddd; }
        #tab-gerador .gh-comb-person { display:inline-flex; align-items:center; gap:3px; background:#f0f0eb; border-radius:4px; padding:1px 6px; color:#555; }
        #tab-gerador .gh-comb-num { font-weight:700; color:#1a3a6c; background:#e8f0fe; border-radius:3px; padding:0 4px; font-size:.65rem; margin-left:2px; }

        /* ── SCHEDULE BAR ── */
        #tab-gerador .gh-sched-bar { position:sticky; top:0; background:#fff; border-bottom:1px solid #e8e8e8; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; z-index:10; box-sizing:border-box; }
        #tab-gerador .gh-sb-week  { font-size:.68rem; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:#888; }
        #tab-gerador .gh-sb-dates { font-size:.88rem; font-weight:500; margin-top:2px; color:#111; }
        #tab-gerador .gh-alert-bar { padding:8px 20px; background:#fafafa; border-bottom:1px solid #ebebeb; box-sizing:border-box; }
        #tab-gerador .gh-dec-bar   { padding:7px 20px; border-bottom:1px solid #f0f0f0; box-sizing:border-box; }
        #tab-gerador .gh-al-inner  { display:flex; flex-wrap:wrap; gap:6px; }
        #tab-gerador .gh-dec-inner { display:flex; flex-wrap:wrap; gap:5px; }
        #tab-gerador .gh-al-chip { font-size:.72rem; font-weight:600; padding:5px 13px; border-radius:20px; }
        #tab-gerador .gh-al-chip.red   { background:#fff0f0; color:#a93226; border:1px solid rgba(169,50,38,.25); }
        #tab-gerador .gh-al-chip.amber { background:#fff8e8; color:#9a6f00; border:1px solid rgba(154,111,0,.25); }
        #tab-gerador .gh-al-chip.info  { background:#edf3ff; color:#1a4a7a; border:1px solid rgba(26,74,122,.25); }
        #tab-gerador .gh-dec-chip { font-size:.68rem; font-weight:500; color:#555; padding:4px 10px; background:#efefef; border-radius:4px; }

        /* ── COVERAGE BLOCKER ── */
        #tab-gerador .gh-cov-list { margin:24px 0; display:flex; flex-direction:column; gap:8px; }
        #tab-gerador .gh-cov-row { display:grid; grid-template-columns:60px 1fr auto; gap:12px; align-items:center; padding:10px 14px; background:#fff5f5; border:1px solid rgba(169,50,38,.2); border-radius:7px; }
        #tab-gerador .gh-cov-day { font-size:.72rem; font-weight:700; letter-spacing:.1em; color:#a93226; }
        #tab-gerador .gh-cov-store { font-size:.82rem; font-weight:500; color:#111; }
        #tab-gerador .gh-cov-count { font-size:.72rem; font-weight:600; color:#a93226; white-space:nowrap; }

        /* ── TABLE LAYOUT ── */
        #tab-gerador .gh-sched-body { padding:20px 20px 0; width:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:stretch; overflow:visible; }

        /* ── COVERAGE PANEL ── */
        #tab-gerador .gh-sched-wrap { display:flex; flex-direction:row; align-items:flex-start; gap:0; width:100%; box-sizing:border-box; }
        #tab-gerador .gh-sched-wrap > .gh-sched-body { flex:1 1 auto; min-width:0; }
        #tab-gerador .gh-cov-panel { flex:0 0 auto; width:340px; max-width:42vw; margin:20px 20px 0 0; border:1px solid #e2e2e2; border-radius:10px; background:#fafafa; box-sizing:border-box; align-self:flex-start; position:sticky; top:64px; max-height:calc(100vh - 84px); overflow-y:auto; }
        #tab-gerador .gh-cov-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid #e8e8e8; position:sticky; top:0; background:#fafafa; }
        #tab-gerador .gh-cov-title { font-size:.7rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#555; }
        #tab-gerador .gh-cov-close { background:none !important; border:none !important; font-size:.9rem; color:#999 !important; cursor:pointer; padding:2px 6px; line-height:1; }
        #tab-gerador .gh-cov-close:hover { color:#111 !important; }
        #tab-gerador .gh-cov-body { padding:12px 14px; }
        #tab-gerador .gh-cov-store { margin-bottom:18px; }
        #tab-gerador .gh-cov-store:last-child { margin-bottom:0; }
        #tab-gerador .gh-cov-store-name { font-size:.7rem; font-weight:700; color:#333; margin-bottom:6px; letter-spacing:.04em; }
        #tab-gerador .gh-cov-empty { font-size:.7rem; color:#aaa; font-style:italic; padding:6px 0; }
        #tab-gerador .gh-cov-table { width:100%; border-collapse:collapse; font-size:.62rem; }
        #tab-gerador .gh-cov-th { padding:4px 2px; font-weight:700; color:#888; text-align:center; border-bottom:1px solid #e0e0e0; font-size:.58rem; letter-spacing:.03em; }
        #tab-gerador .gh-cov-th-hour { text-align:left; color:#bbb; }
        #tab-gerador .gh-cov-hour { padding:3px 4px; color:#999; font-weight:600; text-align:left; white-space:nowrap; font-size:.6rem; }
        #tab-gerador .gh-cov-td { padding:3px 2px; text-align:center; font-weight:700; border-radius:3px; }
        #tab-gerador .gh-cov-zero { color:#ddd; }
        #tab-gerador .gh-cov-one  { color:#c08a00; background:#fff7e6; }
        #tab-gerador .gh-cov-many { color:#1a6c1a; background:#eaf7ea; }

        /* 1. CONTENEDOR: bloque desplazable */
        #tab-gerador .gh-store-block {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          width: 100% !important;
          display: block !important;
          margin-bottom: 48px;
          padding-bottom: 15px !important;
          box-sizing: border-box;
        }

        /* 2. TABLA: obligada a NO encogerse */
        #tab-gerador .gh-sched-tbl {
          width: auto !important;
          min-width: unset !important;
          border-collapse: collapse !important;
          table-layout: auto !important;
          margin: 0 auto !important;
        }

        /* 3. CELDAS: sin saltos de linea, fondo solido */
        #tab-gerador .gh-sched-tbl th,
        #tab-gerador .gh-sched-tbl td {
          white-space: nowrap !important;
          background-color: #ffffff !important;
        }

        #tab-gerador .gh-tbl-store-hdr { background:#efefef; }
        #tab-gerador .gh-tbl-store-hdr td { background-color:#efefef !important; padding:9px 8px; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; border:1px solid #ddd; text-align:center; color:#111; white-space:nowrap; }
        #tab-gerador .gh-tbl-store-hdr td:first-child { text-align:center; white-space:nowrap; }
        #tab-gerador .gh-sched-tbl td:first-child { white-space:nowrap; }
        #tab-gerador .gh-store-name-btn { background:none; border:none; cursor:pointer; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#111; font-family:inherit; padding:4px 8px; border-radius:5px; transition:background .15s; line-height:1.4; }
        #tab-gerador .gh-store-name-btn:hover { background:#e0e0e0; }
        #tab-gerador .gh-store-actions { display:flex; gap:4px; justify-content:center; margin-top:4px; }
        #tab-gerador .gh-store-act-btn { width:26px; height:26px; border-radius:50%; border:1px solid #ccc; background:#fff; cursor:pointer; font-size:1rem; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all .15s; line-height:1; }
        #tab-gerador .gh-store-add:hover { background:#e8f5e9; border-color:#4caf50; color:#2e7d32; }
        #tab-gerador .gh-tbl-date { font-weight:500; font-size:.72rem; color:#555; }
        #tab-gerador .gh-sched-tbl td { border:1px solid #e8e8e8; padding:0; vertical-align:middle; }
        #tab-gerador .gh-sched-tbl td:first-child { padding:0; white-space:nowrap; box-sizing:border-box; }
        #tab-gerador .gh-sh-td { white-space:nowrap; text-align:center; cursor:pointer; }
        #tab-gerador .gh-sh-td:hover { background:#f4f4f4 !important; }
        #tab-gerador .gh-no-click { cursor:default; }
        #tab-gerador .gh-no-click:hover { background:transparent !important; }

        /* ── PERSON CELL ── */
        #tab-gerador .gh-p-cell { padding:8px 12px; white-space:nowrap; text-align:center; overflow:hidden; }
        #tab-gerador .gh-p-name { font-size:.85rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:5px; color:#111; }
        #tab-gerador .gh-p-dot  { color:#e74c3c; font-size:.7rem; flex-shrink:0; }
        #tab-gerador .gh-p-remove-btn { background:none; border:none; cursor:pointer; font-size:.85rem; font-weight:600; color:#111; font-family:inherit; display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:0; text-align:center; }
        #tab-gerador .gh-p-remove-btn:hover .gh-p-remove-x { opacity:1; }
        #tab-gerador .gh-p-remove-x { font-size:.65rem; color:#ccc; margin-left:auto; opacity:0; transition:opacity .15s; padding-left:4px; }
        #tab-gerador .gh-p-hrs-tag { font-weight:500; color:#999; font-size:.72rem; flex-shrink:0; }
        #tab-gerador .gh-p-hrs  { font-size:.68rem; padding-left:0; margin-top:3px; font-weight:600; text-align:center; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:5px; flex-wrap:nowrap; }
        #tab-gerador .gh-p-hrs.ok  { color:#2d6a4f; }
        #tab-gerador .gh-p-hrs.bad { color:#c0392b; }
        #tab-gerador .gh-banco-badge { font-size:.62rem; font-weight:700; padding:2px 6px; border-radius:4px; border:none; font-family:inherit; line-height:1.4; display:inline-block; }
        #tab-gerador .gh-banco-zero { background:#f5f5f5; color:#aaa; }
        #tab-gerador .gh-banco-pos { background:#e8f5e9; color:#2e7d32; }
        #tab-gerador .gh-banco-neg { background:#ffebee; color:#c62828; }
        #tab-gerador .gh-banco-badge:hover { opacity:.8; }
        #tab-gerador .gh-sh-time-inp { width:44px; font-size:.72rem; font-weight:700; text-align:center; border:1px solid #bbb; border-radius:3px; padding:2px; color:#111; background:#fff; font-family:inherit; outline:none; }
        #tab-gerador .gh-sh-time-inp:focus { border-color:#111; }
        #tab-gerador tr.gh-editing td.gh-sh-td { background:#fffde7 !important; }

        /* ── SHIFT CELLS ── */
        #tab-gerador .gh-sh-inner { padding:7px 4px; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        #tab-gerador .gh-sh-line { display:block; font-size:.82rem; font-weight:600; line-height:1.65; color:#111; white-space:nowrap; }
        #tab-gerador .gh-sh-loc  { display:block; font-size:.78rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#111; line-height:1.4; }
        #tab-gerador .c-empty  { background:#fff; min-height:48px; }
        #tab-gerador .gh-sh-td.c-empty-td { cursor:default; }
        #tab-gerador .c-folga  { background:#f9f9f9; }
        #tab-gerador .c-folga .gh-sh-line  { color:#ccc; font-style:italic; }
        #tab-gerador .c-ferias { background:#f9f9f9; }
        #tab-gerador .c-ferias .gh-sh-line { color:#ccc; font-style:italic; }
        #tab-gerador .c-na .gh-sh-line     { color:#e0e0e0; }
        #tab-gerador .c-elsewhere { background:#f5f5f5; }
        #tab-gerador .c-soft { background:#fffbf0; }
        #tab-gerador .c-soft .gh-sh-line { color:#b8860b; }
        /* Shift-specific cell colors — A B C D E F */
        #tab-gerador .c-shift-a { background:#fdf6e3; }
        #tab-gerador .c-shift-a .gh-sh-line { color:#8a6000; }
        #tab-gerador .c-shift-b { background:#e8f5e9; }
        #tab-gerador .c-shift-b .gh-sh-line { color:#1b5e20; }
        #tab-gerador .c-shift-c { background:#e3f2fd; }
        #tab-gerador .c-shift-c .gh-sh-line { color:#0d47a1; }
        #tab-gerador .c-shift-d { background:#fce4ec; }
        #tab-gerador .c-shift-d .gh-sh-line { color:#880e4f; }
        #tab-gerador .c-shift-e { background:#f3e5f5; }
        #tab-gerador .c-shift-e .gh-sh-line { color:#4a148c; }
        #tab-gerador .c-shift-f { background:#e8eaf6; }
        #tab-gerador .c-shift-f .gh-sh-line { color:#1a237e; }
        #tab-gerador .c-fim-contrato { background:#fff5f5; cursor:default; }
        #tab-gerador .gh-fim-txt { color:#e57373; font-size:.58rem; font-style:italic; font-weight:600; letter-spacing:.01em; text-transform:lowercase; line-height:1.3; }

        /* ── Hide legacy selects — always hidden, pills are used instead ── */
        #gh-modal #gh-me-type,
        #gh-modal #gh-me-shift,
        #gh-modal #gh-me-store { display:none !important; }

        /* ── MODAL — position:fixed floats over whole page; always start hidden ── */
        #gh-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(4px); z-index:9000; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
        #gh-modal.open { display:flex; opacity:1; pointer-events:all; }
        #gh-modal .gh-modal { background:#fff; border:1px solid #e0e0e0; border-radius:16px; width:560px; max-width:96vw; overflow:hidden; transform:translateY(10px); transition:transform .22s cubic-bezier(.25,.8,.25,1); box-shadow:0 20px 60px rgba(0,0,0,.18); color:#111; }
        #gh-modal.open .gh-modal { transform:translateY(0); }
        #gh-modal .gh-modal-hdr { padding:16px 20px 14px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
        #gh-modal .gh-modal-ttl { font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#333; }
        #gh-modal .gh-modal-x   { background:none; border:none; cursor:pointer; color:#aaa; font-size:1.1rem; line-height:1; padding:2px 4px; border-radius:4px; transition:color .15s; }
        #gh-modal .gh-modal-x:hover { color:#555; }
        #gh-modal .gh-modal-bdy { padding:18px 18px 20px; }
        #gh-modal .gh-form-grp  { margin-bottom:14px; }
        #gh-modal .gh-form-grp-last { margin-bottom:2px; }
        #gh-modal .gh-form-lbl  { display:block; font-size:.6rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#ccc; margin-bottom:8px; }
        #gh-modal .gh-conf-note { padding:9px 12px; border-radius:7px; font-size:.74rem; margin-top:10px; line-height:1.5; }
        #gh-modal .gh-conf-note.hard { background:#fff5f5; border:1px solid rgba(192,57,43,.2); color:#c0392b; }
        #gh-modal .gh-conf-note.soft { background:#fffbf0; border:1px solid rgba(184,134,11,.2); color:#b8860b; }
        /* ── pill base ── */
        #gh-modal .gh-btn-group { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
        #gh-modal .gh-pill { background:#f7f7f7; border:1.5px solid #e5e5e5; border-radius:50px; padding:9px 20px; font-size:.82rem; font-weight:600; cursor:pointer; color:#444; transition:all .15s; white-space:nowrap; font-family:inherit; line-height:1.2; }
        #gh-modal .gh-pill:hover { background:#f0f0f0; border-color:#ccc; color:#111; transform:translateY(-1px); box-shadow:0 3px 10px rgba(0,0,0,.08); }
        #gh-modal .gh-pill.active:hover { background:#111; border-color:#111; color:#fff !important; transform:translateY(-1px); }
        /* TIPO active — black, white text */
        #gh-modal .gh-pill-tipo.active { background:#111; border-color:#111; color:#fff !important; box-shadow:0 4px 14px rgba(0,0,0,.22); }
        /* SHIFT active — black, white text */
        #gh-modal .gh-pill-shift.active { background:#111; border-color:#111; color:#fff !important; box-shadow:0 4px 14px rgba(0,0,0,.2); }
        /* STORE active — black, white text */
        #gh-modal .gh-pill-store.active { background:#111; border-color:#111; color:#fff !important; box-shadow:0 4px 14px rgba(0,0,0,.2); }
        /* ── Shift pills base ── */
        #gh-modal .gh-btn-group-shifts { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        #gh-modal .gh-apoio-section-label { font-size:.6rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#e67e22; margin:12px 0 8px; padding:6px 10px; background:#fff3e0; border-radius:6px; border-left:3px solid #e67e22; }
        #gh-modal .gh-btn-group-apoio { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        #gh-modal .gh-apoio-lbl { font-size:.68rem; color:#e67e22; font-weight:700; }
        #gh-modal .gh-pill-shift { border-radius:10px; padding:12px 8px; font-size:.82rem; font-weight:600; text-align:center; line-height:1.55; white-space:normal; color:#333; }
        #gh-modal .gh-pill-shift:hover { color:#111; }
        /* Subtle color tones per shift — matches table cell colors */
        #gh-modal .gh-pill-shift[data-val="10:00-13:00|14:00-19:00"] { background:#fdf6e3; border-color:#f0d080; }
        #gh-modal .gh-pill-shift[data-val="10:00-14:00|15:00-19:00"] { background:#e8f5e9; border-color:#a5d6a7; }
        #gh-modal .gh-pill-shift[data-val="10:00-15:00|16:00-19:00"] { background:#e3f2fd; border-color:#90caf9; }
        #gh-modal .gh-pill-shift[data-val="09:00-12:00|13:00-18:00"] { background:#fce4ec; border-color:#f48fb1; }
        #gh-modal .gh-pill-shift[data-val="11:00-15:00|16:00-20:00"] { background:#f3e5f5; border-color:#ce93d8; }
        #gh-modal .gh-pill-shift[data-val="09:00-13:00|19:00-23:00"] { background:#e8eaf6; border-color:#9fa8da; }
        #gh-modal .gh-pill-shift.gh-pill-apoio { background:#fff3e0; border-color:#e67e22; }
        #gh-modal .gh-pill-shift.gh-pill-apoio.active { background:#e67e22 !important; border-color:#e67e22 !important; color:#fff !important; }
        /* Active state must override per-shift backgrounds */
        #gh-modal .gh-pill-shift.active,
        #gh-modal .gh-pill-shift[data-val].active { background:#111 !important; border-color:#111 !important; color:#fff !important; box-shadow:0 4px 14px rgba(0,0,0,.2); }
        #gh-modal .gh-pill-shift.active:hover,
        #gh-modal .gh-pill-shift[data-val].active:hover { background:#111 !important; border-color:#111 !important; color:#fff !important; }
        /* store pills — wrap row */
        #gh-modal .gh-btn-group-stores { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
        #gh-modal .gh-pill-store { border-radius:50px; padding:9px 20px; font-size:.82rem; }

        /* ── CONFIRM MODAL ── */
        #gh-confirm-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(3px); z-index:9100; align-items:center; justify-content:center; }
        #gh-confirm-modal.open { display:flex; }
        #gh-confirm-modal .gh-cm-box { background:#fff; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.18); padding:28px 28px 20px; max-width:340px; width:90vw; text-align:center; }
        #gh-confirm-modal .gh-cm-msg { font-size:.88rem; font-weight:500; color:#222; margin-bottom:22px; line-height:1.5; }
        #gh-confirm-modal .gh-cm-btns { display:flex; gap:10px; justify-content:center; }
        #gh-confirm-modal .gh-cm-cancel { padding:8px 22px; border:1px solid #ddd; background:#fff; border-radius:6px; font-size:.78rem; font-weight:600; cursor:pointer; color:#666; font-family:inherit; }
        #gh-confirm-modal .gh-cm-cancel:hover { background:#f5f5f5; }
        #gh-confirm-modal .gh-cm-ok { padding:8px 22px; border:none; background:#c0392b; border-radius:6px; font-size:.78rem; font-weight:700; cursor:pointer; color:#fff; font-family:inherit; }
        #gh-confirm-modal .gh-cm-ok:hover { background:#a93226; }
        /* ── FERIAS BANNER (injected separately, also scope it) ── */
        #tab-gerador .gh-ferias-banner { display:flex; align-items:center; gap:9px; background:#f0f9f0; border:1px solid #b7ddb7; border-radius:7px; padding:9px 13px; font-size:.8rem; color:#1a5c1a; margin-bottom:12px; font-weight:500; line-height:1.4; }
        #tab-gerador .gh-ferias-banner-icon { font-size:1rem; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f6fdf6; border:1px solid #c8e6c8; border-radius:7px; margin-bottom:6px; font-size:.82rem; color:#1a5c1a; font-weight:600; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-tag { background:#e0f5e0; color:#1a5c1a; border-radius:4px; font-size:.68rem; padding:2px 8px; font-weight:700; letter-spacing:.04em; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-from { font-size:.74rem; color:#4a8a4a; font-weight:500; margin-left:auto; }

        /* ── STAFF MANAGEMENT PANEL ── */
        /* ── STEP 2 LAYOUT ── */
        #tab-gerador .gh-step2-wrap { width:100%; max-width:780px; margin:0 auto; padding:12px 8px 40px; box-sizing:border-box; }
        #tab-gerador .gh-step2-header { margin-bottom:14px; }
        #tab-gerador .gh-step2-header-top { margin-bottom:10px; }
        #tab-gerador .gh-step2-title-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:4px; }
        #tab-gerador .gh-step2-badge { background:#111 !important; color:#fff !important; -webkit-text-fill-color:#fff !important; border-radius:20px; padding:4px 14px; font-size:.75rem; font-weight:700; letter-spacing:.04em; white-space:nowrap; flex-shrink:0; }
        #tab-gerador .gh-step2-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px; }
        #tab-gerador .gh-wiz-box--wide { max-width:680px; }
        #tab-gerador .gh-staff-list { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
        #tab-gerador .gh-staff-row { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid #e8e8e8; border-radius:7px; background:#fafafa; }
        #tab-gerador .gh-staff-row.gh-staff-ferias { background:#f0fdf0; border-color:#b7ddb7; }
        #tab-gerador .gh-staff-info { display:flex; flex-direction:column; gap:2px; }
        #tab-gerador .gh-staff-name-row { display:flex; align-items:center; gap:8px; }
        #tab-gerador .gh-staff-name { font-size:.85rem; font-weight:700; color:#111; }
        #tab-gerador .gh-staff-meta { font-size:.72rem; color:#777; }
        #tab-gerador .gh-staff-weight { font-size:.70rem; color:#555; font-weight:600; }
        #tab-gerador .gh-staff-knows { font-size:.68rem; color:#999; }
        #tab-gerador .gh-staff-actions { flex-shrink:0; margin-left:10px; }
        #tab-gerador .gh-btn-xs { font-size:.62rem; padding:2px 6px; }

        /* ── PERSON FORM ── */
        #tab-gerador .gh-person-form { border:1px solid #e0e0e0; border-radius:8px; padding:14px; margin-bottom:12px; background:#fff; }
        #tab-gerador .gh-pf-title { font-size:.78rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#555; margin-bottom:12px; }
        #tab-gerador .gh-pf-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        #tab-gerador .gh-pf-field { display:flex; flex-direction:column; gap:4px; }
        #tab-gerador .gh-pf-field label { font-size:.65rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#999; }
        #tab-gerador .gh-pf-stores { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
        #tab-gerador .gh-pf-check { display:flex; align-items:center; gap:5px; font-size:.78rem; color:#333; cursor:pointer; }
        #tab-gerador .gh-pf-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }

        /* ── STAFF ROW colapsável ── */
        #tab-gerador .gh-staff-list { display:flex; flex-direction:column; gap:5px; margin-top:12px; }
        #tab-gerador .gh-sr { border:1px solid #e8e8e8; border-radius:8px; background:#fff; box-sizing:border-box; width:100%; }
        #tab-gerador .gh-sr-ferias { background:#f0fdf0; border-color:#b7ddb7; }
        #tab-gerador .gh-sr-header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; gap:8px; }
        #tab-gerador .gh-sr-header-left { display:flex; align-items:center; gap:7px; flex:1; min-width:0; }
        #tab-gerador .gh-toggle-btn { background:none; border:none; cursor:pointer; font-size:.65rem; color:#bbb; padding:0; width:14px; flex-shrink:0; }
        #tab-gerador .gh-toggle-btn:hover { color:#555; }
        #tab-gerador .gh-sr-nameblock { display:flex; flex-direction:column; gap:1px; min-width:0; }
        #tab-gerador .gh-sr-name { font-size:.82rem; font-weight:700; color:#111; white-space:nowrap; display:flex; align-items:baseline; gap:3px; }
        #tab-gerador .gh-sr-meta { font-size:.62rem; color:#999; white-space:nowrap; }
        #tab-gerador .gh-auto-badge { font-size:.58rem; font-weight:700; padding:1px 5px; border-radius:3px; letter-spacing:.03em; }
        #tab-gerador .gh-auto-efectiva   { background:#e8f5e9; color:#2e7d32; }
        #tab-gerador .gh-auto-autonoma   { background:#e3f2fd; color:#1565c0; }
        #tab-gerador .gh-auto-autonoma_h { background:#fff3e0; color:#e65100; }
        #tab-gerador .gh-auto-nao_autonoma { background:#fce4ec; color:#c62828; }
        #tab-gerador .gh-sr-btns { display:flex; flex-direction:row; gap:4px; flex-shrink:0; }
        #tab-gerador .gh-icon-btn { width:24px; height:24px; border:1px solid #e0e0e0; border-radius:5px; background:#fafafa; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; color:#555; font-size:.78rem; font-weight:600; line-height:1; transition:background .15s; flex-shrink:0; }
        #tab-gerador .gh-icon-btn:hover { background:#efefef; border-color:#bbb; }
        #tab-gerador .gh-sr-body { border-top:1px solid #f0f0f0; }
        #tab-gerador .gh-sr-cols { display:flex; flex-direction:row; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        #tab-gerador .gh-sr-col { padding:10px 12px; border-right:1px solid #f0f0f0; display:flex; flex-direction:column; gap:3px; min-width:160px; flex-shrink:0; }
        #tab-gerador .gh-sr-col:last-child { border-right:none; }
        #tab-gerador .gh-sr-col-title { font-size:.62rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#888; display:flex; align-items:center; gap:4px; white-space:nowrap; margin-bottom:3px; }
        #tab-gerador .gh-saldo-sup { font-size:.58rem; font-weight:700; padding:1px 4px; border-radius:3px; vertical-align:super; margin-left:2px; }
        #tab-gerador .gh-saldo-sup-neg { background:#fff0f0; color:#c0392b !important; -webkit-text-fill-color:#c0392b !important; }
        #tab-gerador .gh-saldo-sup-pos { background:#f0fff0; color:#1a6c1a !important; -webkit-text-fill-color:#1a6c1a !important; }
        #tab-gerador .gh-day-btns { display:flex; flex-direction:row; gap:2px; flex-wrap:nowrap; }
        #tab-gerador .gh-day-btn { border:1px solid #ddd; background:#fff; color:#555; border-radius:3px; width:22px; height:22px; font-size:.62rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; flex-shrink:0; }
        #tab-gerador .gh-day-btn-on { background:#111 !important; color:#fff !important; -webkit-text-fill-color:#fff !important; border-color:#111 !important; }
        #tab-gerador .gh-date-row { display:flex; flex-direction:row; gap:3px; }
        #tab-gerador .gh-date-txt { width:68px !important; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-sel-mini { width:auto !important; max-width:80px; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-num-mini { width:40px !important; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-inc-saldo { font-size:.74rem; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:3px; }
        #tab-gerador .gh-inc-saldo-neg { background:#fff0f0; color:#c0392b !important; -webkit-text-fill-color:#c0392b !important; }
        #tab-gerador .gh-inc-saldo-pos { background:#f0fff0; color:#1a6c1a !important; -webkit-text-fill-color:#1a6c1a !important; }
        #tab-gerador .gh-banco-add-row { display:flex; flex-direction:row; gap:3px; align-items:center; }
        #tab-gerador .gh-inc-tag { font-size:.6rem; font-weight:700; padding:1px 4px; border-radius:3px; }

        #tab-gerador.active { display:flex !important; flex-direction:column !important; flex:1 !important; overflow:hidden !important; width:100% !important; padding:0 !important; }
        #tab-gerador #gh-container { flex:1; display:flex; flex-direction:column; overflow-x:auto; overflow-y:auto; -webkit-overflow-scrolling:touch; min-height:0; width:100%; }
      `;
      document.head.appendChild(style);
    }

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
            <select id="gh-me-type" style="display:none">
              <option value="work">Trabalho</option>
              <option value="folga">FOLGA</option>
              <option value="ferias">FÉRIAS</option>
              <option value="baixa">Licença</option>
            </select>
            <select id="gh-me-shift" style="display:none">
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
            <select id="gh-me-store" style="display:none"></select>

            <!-- TIPO buttons -->
            <div class="gh-form-grp">
              <div class="gh-btn-group" id="gh-me-type-btns">
                <button class="gh-pill gh-pill-tipo" data-val="work">Trabalho</button>
                <button class="gh-pill gh-pill-tipo" data-val="folga">Folga</button>
                <button class="gh-pill gh-pill-tipo" data-val="ferias">Férias</button>
                <button class="gh-pill gh-pill-tipo" data-val="baixa">Licença</button>
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
                <div class="gh-btn-group gh-btn-group-apoio">
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="09:00-12:00|APOIO:13:00-14:00|14:00-18:00">09:00 – 12:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>14:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="09:00-13:00|APOIO:14:00-15:00|15:00-18:00">09:00 – 13:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>15:00 – 18:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-13:00|APOIO:13:00-14:00|15:00-19:00">10:00 – 13:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>15:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-13:00|APOIO|15:00-19:00">10:00 – 13:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>15:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="10:00-14:00|APOIO:14:00-15:00|16:00-19:00">10:00 – 14:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>16:00 – 19:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="11:00-13:00|APOIO:13:00-14:00|15:00-20:00">11:00 – 13:00<br><span class="gh-apoio-lbl">apoio 13:00</span><br>15:00 – 20:00</button>
                  <button class="gh-pill gh-pill-shift gh-pill-apoio" data-val="11:00-14:00|APOIO:14:00-15:00|16:00-20:00">11:00 – 14:00<br><span class="gh-apoio-lbl">apoio 14:00</span><br>16:00 – 20:00</button>
                </div>
                <!-- APOIO store selector -->
                <div id="gh-apoio-store-wrap" style="display:none;margin-top:12px;">
                  <div style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#e67e22;margin-bottom:8px;">Tienda de apoio (14:00–15:00)</div>
                  <select id="gh-apoio-store" class="gh-ab-sel"></select>
                </div>
              </div>
              <!-- LOJA buttons -->
              <div class="gh-form-grp gh-form-grp-last">
                <div class="gh-btn-group gh-btn-group-stores" id="gh-me-store-btns"></div>
              </div>
            </div>
            <div class="gh-conf-note" id="gh-me-conf" style="display:none"></div>
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
        document.getElementById('gh-me-type').value = btn.dataset.val;
        ghSyncPillGroup('gh-me-type-btns', btn.dataset.val);
        meTypeChange();
        if (btn.dataset.val !== 'work') applyEdit();
      });
      // HORARIO pill buttons
      document.getElementById('gh-me-shift-btns').addEventListener('click', e => {
        const btn = e.target.closest('.gh-pill[data-val]');
        if (!btn) return;
        document.getElementById('gh-me-shift').value = btn.dataset.val;
        ghSyncPillGroup('gh-me-shift-btns', btn.dataset.val);
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
      });
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
