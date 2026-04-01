// ══ GERADOR DE HORÁRIOS — Porto Santo ══
(function () {

  // ── KNOWLEDGE BASE ──
  const STORES = [
    { id: 'avenida', name: 'Mezka Avenida', short: 'MEZKA AVENIDA', priority: 1 },
    { id: 'mercado', name: 'Mezka Mercado', short: 'MEZKA MERCADO', priority: 2 },
    { id: 'shana',   name: 'Shana',         short: 'SHANA',         priority: 3 },
    { id: 'maxx',    name: 'Maxx',          short: 'MAXX',          priority: 4 },
  ];

  const PEOPLE = [
    { id: 'edna',    name: 'Edna Melim',    hrs: 40, store: 'avenida', efetiva: true,  start: '2020-01-01', canAlone: true,  mobile: false, coverPri: 9, knows: ['avenida','mercado','shana','maxx'], hardAvoid: ['carla'],  softAvoid: ['sandra'] },
    { id: 'carla',   name: 'Carla Alves',   hrs: 40, store: 'mercado', efetiva: true,  start: '2020-01-01', canAlone: true,  mobile: true,  coverPri: 4, knows: ['avenida','mercado','shana','maxx'], hardAvoid: ['edna'],   softAvoid: ['sandra'] },
    { id: 'marilia', name: 'Marilia Silva', hrs: 40, store: 'shana',   efetiva: true,  start: '2020-01-01', canAlone: true,  mobile: false, coverPri: 8, knows: ['shana','mercado','avenida'],        hardAvoid: [],         softAvoid: ['sandra'] },
    { id: 'sandra',  name: 'Sandra Melim',  hrs: 40, store: null,      efetiva: true,  start: '2022-01-01', canAlone: true,  mobile: true,  coverPri: 1, knows: ['avenida','mercado','shana','maxx'], hardAvoid: [],         softAvoid: ['edna','marilia','carla'] },
    { id: 'sara',    name: 'Sara Almeida',  hrs: 40, store: 'avenida', efetiva: false, start: '2025-03-02', canAlone: true,  mobile: true,  coverPri: 2, knows: ['avenida','mercado'],                hardAvoid: [],         softAvoid: [] },
    { id: 'matilde', name: 'Matilde Rodrigues.',    hrs: 40, store: 'mercado', efetiva: false, start: '2025-03-02', canAlone: true,  mobile: true,  coverPri: 2, knows: ['mercado','avenida'],                hardAvoid: [],         softAvoid: [] },
    { id: 'djanice', name: 'Djanice Lopes.',    hrs: 40, store: 'avenida', efetiva: false, start: '2025-03-15', canAlone: false, mobile: false, coverPri: 9, knows: ['avenida'],                          hardAvoid: [],         softAvoid: [] },
    { id: 'iara',    name: 'Iara Oliveira.',       hrs: 40, store: 'avenida', efetiva: false, start: '2025-04-01', canAlone: false, mobile: false, coverPri: 9, knows: ['avenida','mercado'],                hardAvoid: [],         softAvoid: [] },
  ];

  const DAYS   = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
  const DAY_PT = { SEG:'Segunda', TER:'Terça', QUA:'Quarta', QUI:'Quinta', SEX:'Sexta', SAB:'Sábado', DOM:'Domingo' };
  const SH_DEFAULT = '10:00-14:00|15:00-19:00';
  const SH_ALT     = '10:00-13:00|14:00-19:00';

  // Expor PEOPLE globalmente para que ferias.js possa cruzar nomes ↔ ids
  window.GERADOR_PEOPLE = PEOPLE;

  // ── MEMORY (sessionStorage) ──
  let MEM = (function () {
    try { const r = sessionStorage.getItem('mzk_gh8'); if (r) return JSON.parse(r); } catch (e) {}
    return { cycleWeek: 0, offsets: {}, sundays: {} };
  })();
  function saveMem() { try { sessionStorage.setItem('mzk_gh8', JSON.stringify(MEM)); } catch (e) {} }

  // ── STATE ──
  function blank() {
    return {
      weekStart: null, openStores: [], openDays: {}, absences: [],
      sandraDay: {}, folgaDay: {}, sundayAssigned: {}, extraDayOff: {},
      schedule: {}, alerts: [], decisions: []
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
  function nextMonday() { const t = new Date(), dow = t.getDay(); t.setDate(t.getDate() + (dow === 0 ? 1 : 8 - dow)); return t.toISOString().split('T')[0]; }
  function isoWeek(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w1 = new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7); }
  function weeksSince(s, ref) { return Math.floor((ref - new Date(s)) / (7*864e5)); }
  function absOf(pid)       { return S.absences.find(a => a.pid === pid) || null; }
  function isAbsent(pid, day) { const a = absOf(pid); if (!a) return false; return DAYS.indexOf(day) >= DAYS.indexOf(a.from); }
  function fullyAbsent(pid)   { const a = absOf(pid); if (!a) return false; return DAYS.indexOf(a.from) === 0; }
  function storeOpen(sid, day) { return S.openStores.includes(sid) && S.openDays[sid]?.includes(day); }
  function minAv(day) { const m = S.weekStart.getMonth()+1; return day === 'DOM' ? (m < 6 ? 1 : 2) : 3; }

  // ── WIZARD STATE ──
  let wStep = 0;
  function getContainer() { return document.getElementById('gh-container'); }

  function fixPanelLayout() {
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      // NEVER set display here — the tab system's CSS (.tab-panel.active { display:flex })
      // is the single source of truth for visibility. Forcing display:flex here causes the
      // gerador panel to bleed into other modules when tabs switch.
      panel.style.padding = '0';
      panel.style.background = '#fff';
      panel.style.color = '#111';
      /* overflow handled by gh-container scroll */
      panel.style.flexDirection = 'column';
    }
  }

  function cleanupGeradorLayout() {
    // Called when leaving the gerador tab — reset only the inline styles we added.
    // NEVER touch display — the tab system's CSS controls visibility exclusively.
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      panel.style.padding = '';
      panel.style.background = '';
      panel.style.color = '';
      panel.style.overflow = '';
      panel.style.flexDirection = '';
      // display must never be set inline — clear any leftover value just in case
      panel.style.display = '';
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
      </div>`;
    document.getElementById('gh-sub-week').addEventListener('click', sub_week);
  }

  function sub_week() {
    const v = document.getElementById('gh-inp-week').value; if (!v) return;
    const d = new Date(v + 'T00:00:00'), dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    S.weekStart = d; wStep = 1; renderWiz();
  }

  // ── WIZARD: PASSO 2 ──
  function wiz_absences() {
    const c = getContainer(); if (!c) return;

    // ── Consultar férias automáticas ──
    let feriasAuto = [];
    if (typeof window.getFeriasParaSemana === 'function' && S.weekStart) {
      feriasAuto = window.getFeriasParaSemana(S.weekStart).filter(f => f.pid);
    }

    // Filtrar ausências manuais para não duplicar quem já tem férias automáticas
    const feriasAutoPids = new Set(feriasAuto.map(f => f.pid));
    const manualAbsences = S.absences.filter(a => !feriasAutoPids.has(a.pid));

    // Banner informativo se há férias detectadas
    let bannerHTML = '';
    if (feriasAuto.length) {
      const nomes = feriasAuto.map(f => {
        const p = PEOPLE.find(x => x.id === f.pid);
        return p ? p.name.split(' ')[0] : f.nome;
      }).join(', ');
      bannerHTML = `<div class="gh-ferias-banner">
        <span class="gh-ferias-banner-icon">🏖</span>
        <span>Férias detectadas automaticamente: <strong>${nomes}</strong></span>
      </div>`;
    }

    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Passo 2 de 3</div>
        <div class="gh-wiz-title">Há ausências esta semana?</div>
        <div class="gh-wiz-sub">Baixas ou N/A. As férias são importadas automaticamente.</div>
        ${bannerHTML}
        <div class="gh-ab-list" id="gh-ab-list"></div>
        <button class="gh-add-btn" id="gh-add-ab">+ Adicionar ausência</button>
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-1">← Voltar</button>
          <button class="gh-btn gh-btn-solid" id="gh-sub-abs">Continuar →</button>
        </div>
      </div>`;

    // Renderizar linhas de férias automáticas (só-leitura)
    const list = document.getElementById('gh-ab-list');
    feriasAuto.forEach(f => {
      const p = PEOPLE.find(x => x.id === f.pid);
      if (!p) return;
      const row = document.createElement('div');
      row.className = 'gh-ab-row-ferias';
      row.dataset.pid = f.pid;
      row.innerHTML = `
        <span>${p.name}</span>
        <span class="gh-ferias-tag">🏖 FÉRIAS</span>
        <span class="gh-ferias-from">desde ${DAY_PT[f.from] || f.from}</span>
      `;
      list.appendChild(row);
    });

    // Renderizar ausências manuais editáveis
    manualAbsences.forEach(a => addAb(a));
    document.getElementById('gh-add-ab').addEventListener('click', () => addAb({}));
    document.getElementById('gh-back-1').addEventListener('click', () => { wStep = 0; renderWiz(); });
    document.getElementById('gh-sub-abs').addEventListener('click', sub_abs);
  }

  function addAb(ex) {
    ex = ex || {};
    const list = document.getElementById('gh-ab-list'); if (!list) return;
    const row = document.createElement('div'); row.className = 'gh-ab-row';
    const pO = PEOPLE.map(p => `<option value="${p.id}" ${ex.pid===p.id?'selected':''}>${p.name}</option>`).join('');
    // FÉRIAS removidas daqui — são importadas automaticamente de ferias.js
    const tO = [['baixa','BAIXA'],['na','N/A']].map(([v,l]) => `<option value="${v}" ${ex.type===v?'selected':''}>${l}</option>`).join('');
    const dO = DAYS.map(d => `<option value="${d}" ${ex.from===d?'selected':''}>${DAY_PT[d]}</option>`).join('');
    row.innerHTML = `<select class="gh-ab-sel">${pO}</select><select class="gh-ab-sel">${tO}</select><select class="gh-ab-sel">${dO}</select><button class="gh-ab-x">×</button>`;
    row.querySelector('.gh-ab-x').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function sub_abs() {
    // Coletar ausências manuais (linhas editáveis)
    const manual = [];
    document.querySelectorAll('.gh-ab-row').forEach(r => {
      const s = r.querySelectorAll('select');
      manual.push({ pid: s[0].value, type: s[1].value, from: s[2].value });
    });

    // Coletar férias automáticas (linhas só-leitura)
    const feriasAutoPids = new Set();
    const feriasAuto = [];
    document.querySelectorAll('.gh-ab-row-ferias').forEach(r => {
      const pid  = r.dataset.pid;
      const from = r.querySelector('.gh-ferias-from')?.textContent?.trim() || 'SEG';
      // Converter "desde Segunda" → "SEG"
      const DAY_REVERSE = { 'desde Segunda':'SEG','desde Terça':'TER','desde Quarta':'QUA','desde Quinta':'QUI','desde Sexta':'SEX','desde Sábado':'SAB','desde Domingo':'DOM' };
      const fromDay = DAY_REVERSE[from] || 'SEG';
      feriasAutoPids.add(pid);
      feriasAuto.push({ pid, type: 'ferias', from: fromDay });
    });

    // Excluir duplicados: se alguém foi adicionado manualmente como "ferias"
    // e já está em feriasAuto, prevalece o automático
    const manualFiltered = manual.filter(a => !feriasAutoPids.has(a.pid));

    S.absences = [...feriasAuto, ...manualFiltered];
    wStep = 2; renderWiz();
  }

  // ── WIZARD: PASSO 3 ──
  function wiz_stores() {
    const c = getContainer(); if (!c) return;
    const defD = ['SEG','TER','QUA','QUI','SEX','SAB'];
    const rows = STORES.map(st => {
      const open = S.openStores.length ? S.openStores.includes(st.id) : st.id !== 'maxx';
      const days = S.openDays[st.id] || (open ? [...defD] : []);
      const togs = DAYS.map(d => `<span class="gh-dtog ${days.includes(d)?'on':''}" data-store="${st.id}" data-day="${d}">${d}</span>`).join('');
      return `<div class="gh-sc-row ${!open?'closed':''}" id="gh-scr-${st.id}">
        <div class="gh-sc-top"><input type="checkbox" id="gh-chk-${st.id}" ${open?'checked':''} data-store="${st.id}"><label for="gh-chk-${st.id}">${st.name}</label></div>
        <div class="gh-sc-days" id="gh-scd-${st.id}">${togs}</div></div>`;
    }).join('');

    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Passo 3 de 3</div>
        <div class="gh-wiz-title">Quais lojas abrem e em que dias?</div>
        <div class="gh-wiz-sub">Selecione as lojas e os dias de funcionamento desta semana.</div>
        <div class="gh-store-cfg">${rows}</div>
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-2">← Voltar</button>
          <button class="gh-btn gh-btn-solid" id="gh-sub-stores">Gerar horário →</button>
        </div>
      </div>`;

    c.querySelectorAll('[data-store]').forEach(el => {
      if (el.type === 'checkbox') {
        el.addEventListener('change', () => {
          document.getElementById(`gh-scr-${el.dataset.store}`).classList.toggle('closed', !el.checked);
        });
      } else if (el.classList.contains('gh-dtog')) {
        el.addEventListener('click', () => el.classList.toggle('on'));
      }
    });

    document.getElementById('gh-back-2').addEventListener('click', () => { wStep = 1; renderWiz(); });
    document.getElementById('gh-sub-stores').addEventListener('click', sub_stores);
  }

  function sub_stores() {
    S.openStores = []; S.openDays = {};
    STORES.forEach(st => {
      const chk = document.getElementById(`gh-chk-${st.id}`); if (!chk?.checked) return;
      const days = [...document.querySelectorAll(`[data-store="${st.id}"].gh-dtog.on`)].map(e => e.dataset.day);
      if (!days.length) return;
      S.openStores.push(st.id); S.openDays[st.id] = days;
    });
    if (!S.openStores.length) { alert('Selecione pelo menos uma loja.'); return; }
    generate();
  }

  // ══ ENGINE ══

  function computeSandraPosition(active) {
    S.sandraDay = {};
    if (!active.find(p => p.id === 'sandra')) return;
    ['SEG','TER','QUA','QUI','SEX','SAB'].forEach(day => {
      if (isAbsent('sandra', day)) { S.sandraDay[day] = null; return; }
      if (storeOpen('maxx', day)) { S.sandraDay[day] = 'maxx'; return; }
      if (storeOpen('shana', day) && isAbsent('marilia', day)) {
        S.sandraDay[day] = 'shana';
        S.decisions.push({ type: 'info', text: `${day}: Sandra cobre Shana (Marilia ausente).` });
        return;
      }
      if (storeOpen('avenida', day)) {
        const avWorkers = active.filter(p => p.id !== 'sandra' && p.store === 'avenida' && !isAbsent(p.id, day)).length;
        if (avWorkers < minAv(day)) { S.sandraDay[day] = 'avenida'; return; }
      }
      if (storeOpen('mercado', day)) { S.sandraDay[day] = 'mercado'; return; }
      const fb = S.openStores.find(id => S.openDays[id]?.includes(day));
      S.sandraDay[day] = fb || null;
    });
  }

  function assignFolgas(active) {
    MEM.cycleWeek++;
    const workDays = ['SEG','TER','QUA','QUI','SEX','SAB'];
    const sundayStores = S.openStores.filter(id => S.openDays[id]?.includes('DOM'));
    active.forEach((p, i) => { if (MEM.offsets[p.id] === undefined) MEM.offsets[p.id] = i; });
    S.sundayAssigned = {};
    sundayStores.forEach(sid => { S.sundayAssigned[sid] = []; });

    // Where would person p actually work on this day if not on folga?
    // Mirrors buildCell logic exactly.
    function predictStore(p, day) {
      if (p.id === 'sandra') return S.sandraDay[day] || null;
      if (isAbsent(p.id, day)) return null;
      if (p.store && storeOpen(p.store, day)) return p.store;
      return S.openStores.find(id => S.openDays[id]?.includes(day) && p.knows.includes(id)) || null;
    }

    // True coverage: count everyone's predicted store, not just their home store
    function baseCov(day) {
      const cov = {};
      S.openStores.forEach(sid => { cov[sid] = 0; });
      active.forEach(p => {
        if (isAbsent(p.id, day)) return;
        const sid = predictStore(p, day);
        if (sid && cov[sid] !== undefined) cov[sid]++;
      });
      return cov;
    }

    const remaining = {};
    workDays.forEach(day => { remaining[day] = baseCov(day); });
    const sorted = [...active].sort((a, b) => {
      const pa = STORES.find(s => s.id === (a.store||'z'))?.priority ?? 9;
      const pb = STORES.find(s => s.id === (b.store||'z'))?.priority ?? 9;
      return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
    });
    sorted.forEach(p => {
      let dayIdx = (MEM.offsets[p.id] + MEM.cycleWeek) % 6;
      const myStore = p.id === 'sandra' ? null : p.store;
      const storOpensSun = myStore && sundayStores.includes(myStore) && !isAbsent(p.id, 'DOM');
      const target = Math.round((p.hrs || 40) / 8);
      const sunQuotaFilled = storOpensSun && (S.sundayAssigned[myStore]||[]).length >= (myStore === 'avenida' ? minAv('DOM') : 1);
      const canWorkSunday = storOpensSun && !sunQuotaFilled && p.canAlone !== false && weeksSince(p.start, S.weekStart) >= 4;
      let extraDayOff = null;
      if (canWorkSunday) {
        const candidates = workDays.filter(d => {
          if (isAbsent(p.id, d)) return false;
          const covStore = predictStore(p, d) || myStore;
          if (!covStore) return false;
          const storeMin = covStore === 'avenida' ? minAv(d) : 1;
          return (remaining[d]?.[covStore] || 0) - 1 >= storeMin;
        });
        if (candidates.length > 0) {
          extraDayOff = candidates.sort((a, b) => (remaining[b][myStore]||0) - (remaining[a][myStore]||0))[0];
        }
      }
      const canWorkSundayEffective = canWorkSunday && extraDayOff !== null;
      let found = false, willWorkSunday = false;
      for (let t = 0; t < 12; t++) {
        const day = workDays[dayIdx];
        const monSatDays = workDays.filter(d => {
          if (d === day) return false;
          if (canWorkSundayEffective && extraDayOff && d === extraDayOff && day !== extraDayOff) return false;
          if (isAbsent(p.id, d)) return false;
          return true;
        }).length;
        const withSun = monSatDays + 1, withoutSun = monSatDays;
        let sundayDecision = false;
        if (withoutSun === target) { sundayDecision = false; }
        else if (canWorkSundayEffective && withSun === target) { sundayDecision = true; }
        else { dayIdx = (dayIdx+1) % 6; continue; }

        // Use real predicted store — not just p.store
        const effStore = predictStore(p, day);
        if (effStore && storeOpen(effStore, day)) {
          const storeMin = effStore === 'avenida' ? minAv(day) : 1;
          if ((remaining[day][effStore]||0) - 1 < storeMin) { dayIdx = (dayIdx+1) % 6; continue; }
        }
        // Count folgas already assigned whose predicted store matches
        const sameFolgas = sorted.filter(x => {
          if (x.id === p.id || !S.folgaDay[x.id] || S.folgaDay[x.id] !== day) return false;
          return predictStore(x, day) === effStore;
        }).length;
        if (sameFolgas >= ((day === 'TER' || day === 'QUA') ? 2 : 1)) { dayIdx = (dayIdx+1) % 6; continue; }
        if (p.id === 'matilde' && S.folgaDay['carla']   === day) { dayIdx = (dayIdx+1) % 6; continue; }
        if (p.id === 'carla'   && S.folgaDay['matilde'] === day) { dayIdx = (dayIdx+1) % 6; continue; }
        if (p.id === 'sara'    && S.folgaDay['edna']    === day) { dayIdx = (dayIdx+1) % 6; continue; }
        if (p.id === 'edna'    && S.folgaDay['sara']    === day) { dayIdx = (dayIdx+1) % 6; continue; }
        willWorkSunday = sundayDecision; found = true; break;
      }
      const day = workDays[dayIdx];
      S.folgaDay[p.id] = day;
      if (willWorkSunday) {
        if (!S.sundayAssigned[myStore]) S.sundayAssigned[myStore] = [];
        S.sundayAssigned[myStore].push(p.id);
      }
      const effStore = predictStore(p, day);
      if (effStore && remaining[day]?.[effStore] !== undefined) remaining[day][effStore]--;
      if (willWorkSunday && extraDayOff && extraDayOff !== day) {
        const extraStore = predictStore(p, extraDayOff) || myStore;
        if (extraStore && remaining[extraDayOff]?.[extraStore] !== undefined) remaining[extraDayOff][extraStore]--;
        if (!S.extraDayOff) S.extraDayOff = {};
        S.extraDayOff[p.id] = extraDayOff;
      }
    });
    saveMem();
  }

  function buildSchedule(active) {
    PEOPLE.forEach(p => {
      S.schedule[p.id] = {};
      DAYS.forEach(day => { S.schedule[p.id][day] = buildCell(p, day, active); });
    });
  }

  function buildCell(p, day, active) {
    if (!active.find(x => x.id === p.id)) return { type: 'na', shift: null, store: null };
    if (isAbsent(p.id, day)) {
      const a = absOf(p.id);
      return { type: a.type === 'ferias' ? 'ferias' : a.type === 'na' ? 'na' : 'folga', shift: null, store: null };
    }
    if (day === 'DOM') return { type: 'folga', shift: null, store: null };
    if (S.folgaDay[p.id] === day) return { type: 'folga', shift: null, store: null };
    if (S.extraDayOff?.[p.id] === day) return { type: 'folga', shift: null, store: null };
    if (p.id === 'sandra') {
      const sid = S.sandraDay[day];
      if (!sid) return { type: 'folga', shift: null, store: null };
      return { type: 'work', shift: SH_DEFAULT, store: sid };
    }
    if (p.store && storeOpen(p.store, day)) return { type: 'work', shift: SH_DEFAULT, store: p.store };
    const alt = S.openStores.find(id => S.openDays[id]?.includes(day) && p.knows.includes(id));
    if (alt) return { type: 'work', shift: SH_DEFAULT, store: alt };
    return { type: 'folga', shift: null, store: null };
  }

  function fixSunday(active) {
    active.forEach(p => {
      if (isAbsent(p.id, 'DOM')) {
        const a = absOf(p.id);
        S.schedule[p.id]['DOM'] = { type: a.type === 'ferias' ? 'ferias' : 'folga', shift: null, store: null };
      } else {
        S.schedule[p.id]['DOM'] = { type: 'folga', shift: null, store: null };
      }
    });
    Object.entries(S.sundayAssigned || {}).forEach(([sid, pids]) => {
      pids.forEach(pid => {
        if (!isAbsent(pid, 'DOM')) {
          S.schedule[pid]['DOM'] = { type: 'work', shift: SH_DEFAULT, store: sid };
          MEM.sundays[pid] = (MEM.sundays[pid] || 0) + 1;
        }
      });
    });
  }

  function intelPass(active) {
    DAYS.forEach(day => {
      const wk = () => active.filter(p => S.schedule[p.id]?.[day]?.type === 'work');
      const ed = S.schedule['edna']?.[day], ca = S.schedule['carla']?.[day];
      if (ed?.type === 'work' && ca?.type === 'work' && ed.store === ca.store) {
        const edStore = ed.store;
        const alt = S.openStores.find(id => id !== edStore && storeOpen(id, day) && P('carla').knows.includes(id));
        if (alt) { S.schedule['carla'][day].store = alt; S.decisions.push({ type: 'info', text: `${day}: Carla → ${sname(alt)} (separar de Edna).` }); }
        else S.alerts.push({ type: 'amber', text: `${day}: Edna e Carla na mesma loja — sem alternativa.` });
      }
      wk().filter(p => !p.canAlone && weeksSince(p.start, S.weekStart) < 4).forEach(p => {
        const myStore = S.schedule[p.id][day].store;
        if (wk().some(o => o.id !== p.id && o.canAlone && S.schedule[o.id][day].store === myStore)) return;
        const sup = wk().filter(o => o.canAlone && o.id !== p.id && o.knows.includes(myStore))
          .sort((a, b) => {
            const ac = wk().filter(x => S.schedule[x.id][day].store === S.schedule[a.id][day].store).length;
            const bc = wk().filter(x => S.schedule[x.id][day].store === S.schedule[b.id][day].store).length;
            return bc - ac || (a.coverPri||9) - (b.coverPri||9);
          })[0];
        if (sup) { S.schedule[sup.id][day].store = myStore; S.decisions.push({ type: 'info', text: `${day}: ${sup.name} → ${sname(myStore)} (supervisão ${p.name}).` }); }
        else S.alerts.push({ type: 'amber', text: `${day}: ${p.name} em ${sname(myStore)} sem supervisão.` });
      });
      STORES.filter(st => storeOpen(st.id, day)).sort((a, b) => a.priority - b.priority).forEach(st => {
        const min = st.id === 'avenida' ? minAv(day) : 1;
        const have = wk().filter(p => S.schedule[p.id][day].store === st.id).length;
        if (have >= min) return;
        for (let i = 0; i < min - have; i++) {
          const cand = wk().filter(p => p.mobile !== false && p.knows.includes(st.id) && S.schedule[p.id][day].store !== st.id)
            .sort((a, b) => {
              const ac = wk().filter(x => S.schedule[x.id][day].store === S.schedule[a.id][day].store).length;
              const bc = wk().filter(x => S.schedule[x.id][day].store === S.schedule[b.id][day].store).length;
              return bc - ac || (a.coverPri||9) - (b.coverPri||9);
            })[0];
          if (cand) { S.schedule[cand.id][day].store = st.id; S.decisions.push({ type: 'warn', text: `${day}: ${cand.name} → ${sname(st.id)} (cobertura mínima).` }); }
          else S.alerts.push({ type: 'red', text: `${day}: ${sname(st.id)} sem cobertura suficiente.` });
        }
      });
      if (storeOpen('avenida', day) && storeOpen('mercado', day)) {
        const avStaff = wk().filter(p => S.schedule[p.id][day].store === 'avenida');
        const mcStaff = wk().filter(p => S.schedule[p.id][day].store === 'mercado');
        if (avStaff.length >= 4 && mcStaff.length === 1) {
          const avCanAlone = avStaff.filter(p => p.canAlone && p.id !== 'sandra');
          const cand = avStaff.filter(p => p.mobile !== false && p.id !== 'sandra' && p.knows.includes('mercado'))
            .filter(p => !(p.canAlone && avCanAlone.length <= 1))
            .sort((a, b) => new Date(b.start) - new Date(a.start))[0];
          if (cand) { S.schedule[cand.id][day].store = 'mercado'; S.decisions.push({ type: 'info', text: `${day}: ${cand.name} → Mercado (reequilíbrio).` }); }
        }
      }

      // ── Assign shifts AFTER all relocations are final ──
      // Lunch staggering only applies to workers who are autonomous:
      //   canAlone === true  AND  weeksSince(start, weekStart) >= 3
      // Non-autonomous workers always receive SH_DEFAULT (same as everyone else if only 1 person).
      // Among the autonomous subset: least-senior first → SH_ALT, most-senior last → SH_DEFAULT.
      // This guarantees store coverage during every lunch slot while respecting the rule
      // that a worker cannot be left alone unless they have ≥3 weeks seniority.
      STORES.filter(st => storeOpen(st.id, day)).forEach(st => {
        const staff = wk().filter(p => S.schedule[p.id][day].store === st.id);
        const isAutonomous = p => p.canAlone && weeksSince(p.start, S.weekStart) >= 3;
        const autonomous = staff.filter(isAutonomous)
          .sort((a, b) => {
            const as = (a.efetiva ? 1000 : 0) + weeksSince(a.start, S.weekStart);
            const bs = (b.efetiva ? 1000 : 0) + weeksSince(b.start, S.weekStart);
            return as - bs;
          });
        // Non-autonomous workers always get SH_DEFAULT
        staff.filter(p => !isAutonomous(p)).forEach(p => {
          S.schedule[p.id][day].shift = SH_DEFAULT;
        });
        if (autonomous.length < 2) {
          // 0 or 1 autonomous worker: no staggering possible, all get SH_DEFAULT
          autonomous.forEach(p => { S.schedule[p.id][day].shift = SH_DEFAULT; });
          return;
        }
        // 2+ autonomous workers: stagger lunches. All but the last get SH_ALT, last gets SH_DEFAULT.
        // RULE: when staff > 2, the person left alone during lunch (SH_DEFAULT) must be
        // the most senior. The ascending sort above already guarantees this naturally.
        autonomous.forEach((p, i) => {
          S.schedule[p.id][day].shift = i < autonomous.length - 1 ? SH_ALT : SH_DEFAULT;
        });
        // Log who stays alone when there are more than 2 people in the store
        if (staff.length > 2 && autonomous.length >= 2) {
          const aloneWorker = autonomous[autonomous.length - 1];
          S.decisions.push({ type: 'info', text: `${day}: ${sname(st.id)} — ${aloneWorker.name} fica sozinha no almoço (critério: mais antiga).` });
        }
      });

      // ── Soft rule: Edna & Carla should have different lunch breaks when both work ──
      // Only adjust if it does NOT break the stagger already set within each store.
      const edSch = S.schedule['edna']?.[day];
      const caSch = S.schedule['carla']?.[day];
      if (edSch?.type === 'work' && caSch?.type === 'work' && edSch.shift && caSch.shift && edSch.shift === caSch.shift) {
        const altShift = caSch.shift === SH_DEFAULT ? SH_ALT : SH_DEFAULT;
        const isAutonomous = p => p.canAlone && weeksSince(p.start, S.weekStart) >= 3;

        // Try flipping Carla first — only safe if her store has another autonomous worker
        // already on a different shift (so the stagger in her store is preserved).
        const caStore = caSch.store;
        const caStoreAutonomous = wk().filter(p => p.id !== 'carla' && S.schedule[p.id][day].store === caStore && isAutonomous(p));
        const caStaggerSafe = caStoreAutonomous.some(p => S.schedule[p.id][day].shift !== altShift);
        if (caStoreAutonomous.length >= 1 && caStaggerSafe) {
          S.schedule['carla'][day].shift = altShift;
          S.decisions.push({ type: 'info', text: `${day}: Carla turno ajustado (almoço separado de Edna).` });
        } else {
          // Try flipping Edna — only safe if:
          // 1. Her store has another autonomous worker on a different shift, AND
          // 2. The person who would be left alone on SH_DEFAULT is the most senior in the store
          //    (seniority rule: the person alone at lunch must be the most senior).
          const edStore = edSch.store;
          const edStoreAutonomous = wk().filter(p => p.id !== 'edna' && S.schedule[p.id][day].store === edStore && isAutonomous(p));
          const edStaggerSafe = edStoreAutonomous.some(p => S.schedule[p.id][day].shift !== altShift);
          if (edStoreAutonomous.length >= 1 && edStaggerSafe) {
            // Check seniority rule: after flipping Edna to SH_ALT, who stays alone on SH_DEFAULT?
            // That person must be the most senior autonomous worker in the store.
            const allEdStoreAuto = wk().filter(p => S.schedule[p.id][day].store === edStore && isAutonomous(p));
            // After flip: Edna → altShift; others keep their shifts. Who would have SH_DEFAULT?
            const wouldHaveDefault = allEdStoreAuto.filter(p => {
              if (p.id === 'edna') return altShift === SH_DEFAULT;
              return S.schedule[p.id][day].shift === SH_DEFAULT;
            });
            // The most senior autonomous worker in the store
            const seniorityScore = p => (p.efetiva ? 1000 : 0) + weeksSince(p.start, S.weekStart);
            const mostSenior = allEdStoreAuto.reduce((a, b) => seniorityScore(a) >= seniorityScore(b) ? a : b, allEdStoreAuto[0]);
            const aloneIsSenior = wouldHaveDefault.length === 0 || wouldHaveDefault.some(p => p.id === mostSenior?.id);
            if (aloneIsSenior) {
              S.schedule['edna'][day].shift = altShift;
              S.decisions.push({ type: 'info', text: `${day}: Edna turno ajustado (almoço separado de Carla).` });
            }
            // If flipping Edna would leave a junior alone, skip the flip.
          }
          // If neither flip is safe, leave shifts as-is (stagger within stores takes priority).
        }
      }
      const logged = new Set();
      wk().forEach(p => {
        (p.softAvoid || []).forEach(oid => {
          const o = wk().find(x => x.id === oid);
          if (!o || S.schedule[p.id][day].store !== S.schedule[o.id][day].store) return;
          const key = [p.id, oid].sort().join('-') + day;
          if (logged.has(key)) return; logged.add(key);
          S.alerts.push({ type: 'amber', text: `${day}: ${p.name} e ${o.name} na mesma loja.` });
        });
      });
    });
  }

  // ── SUNDAY VIABILITY CHECK ──
  // Priority order to sacrifice: maxx → shana → mercado → avenida
  const SUNDAY_SACRIFICE_ORDER = ['maxx', 'shana', 'mercado', 'avenida'];

  // Returns how many workers can realistically cover a store on Sunday
  // (those assigned to that store, canAlone-capable, not absent, seniority >= 4 weeks)
  function sundayCandidatesFor(sid, active) {
    return active.filter(p => {
      if (isAbsent(p.id, 'DOM')) return false;
      if (!p.knows.includes(sid)) return false;
      if (!p.canAlone && weeksSince(p.start, S.weekStart) < 4) return false;
      return true;
    });
  }

  // Each person working Sunday needs a compensatory day off Mon–Sat.
  // Simulate how many extra folgas would be required by all Sunday assignments,
  // and check whether Mon–Sat coverage survives losing those slots.
  function sundayWouldBreakWeek(sundayStoreIds, active) {
    // For each sunday store, count how many people we need (minAv for avenida, 1 for rest)
    const needed = {};
    sundayStoreIds.forEach(sid => {
      needed[sid] = sid === 'avenida' ? minAv('DOM') : 1;
    });

    // Count available candidates per store
    const available = {};
    sundayStoreIds.forEach(sid => {
      available[sid] = sundayCandidatesFor(sid, active).length;
    });

    // Check if any store has fewer candidates than needed
    for (const sid of sundayStoreIds) {
      if (available[sid] < needed[sid]) return { breaks: true, reason: `${sname(sid)} não tem pessoal suficiente para abrir ao domingo (precisa ${needed[sid]}, disponível ${available[sid]}).` };
    }

    // Simulate extra day-off pressure on Mon–Sat:
    // Each person working Sunday loses one Mon–Sat day (extraDayOff).
    // Count per store how many people would lose a day, and check if
    // minimum coverage (1 per store, minAv for avenida) can still be met.
    const workDays = ['SEG','TER','QUA','QUI','SEX','SAB'];
    // For each open Mon–Sat store, count available workers on each day
    // This is a conservative estimate: we just check total "person-days" budget
    for (const sid of sundayStoreIds) {
      const cands = sundayCandidatesFor(sid, active);
      const toAssign = Math.min(needed[sid], cands.length);
      // Each assigned person loses one Mon–Sat day from their store
      // Check if that store still has enough coverage each Mon–Sat day it opens
      const storeOpenDays = workDays.filter(d => storeOpen(sid, d));
      if (!storeOpenDays.length) continue;
      // Workers normally in this store on Mon–Sat (excluding absent)
      const storeWorkers = active.filter(p => {
        if (p.id === 'sandra') return false; // Sandra handled separately
        if (p.store !== sid) return false;
        return !fullyAbsent(p.id);
      });
      const minNeeded = sid === 'avenida' ? minAv('SEG') : 1; // conservative: use Monday value
      // If we lose `toAssign` person-days across the week, the worst case is
      // they all fall on the same day. Check if that day would still be covered.
      const worstCaseRemaining = storeWorkers.length - toAssign;
      if (worstCaseRemaining < minNeeded) {
        return {
          breaks: true,
          reason: `Abrir ${sname(sid)} ao domingo deixaria sem cobertura mínima de Segunda a Sábado (${storeWorkers.length} pessoa(s) na loja, ${toAssign} iriam trabalhar domingo e precisam de folga compensatória).`
        };
      }
    }
    return { breaks: false };
  }

  // Resolve sunday stores: remove stores that would break weekday coverage,
  // following sacrifice priority. Returns { resolvedSundayStores, sacrificed[] }
  function resolveSundayStores(active) {
    const requestedSundayStores = S.openStores.filter(id => S.openDays[id]?.includes('DOM'));
    if (!requestedSundayStores.length) return { resolvedSundayStores: [], sacrificed: [] };

    const sacrificed = [];
    // Work with a mutable copy, sorted by sacrifice priority (first to go = index 0)
    let current = [...requestedSundayStores];

    // Keep trying to remove lowest-priority stores until the set is viable or empty
    while (current.length > 0) {
      const check = sundayWouldBreakWeek(current, active);
      if (!check.breaks) break; // current set is viable

      // Find the lowest-priority store in current set to sacrifice
      const toRemove = SUNDAY_SACRIFICE_ORDER.find(sid => current.includes(sid));
      if (!toRemove) break; // nothing left to sacrifice (shouldn't happen)

      sacrificed.push({ sid: toRemove, reason: check.reason });
      current = current.filter(id => id !== toRemove);
    }

    return { resolvedSundayStores: current, sacrificed };
  }

  function generate() {
    S.alerts = []; S.decisions = []; S.sandraDay = {}; S.folgaDay = {}; S.extraDayOff = {};
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));

    // Save a snapshot of the original openDays/openStores (before sunday check may mutate them)
    // so that regenSchedule() can restore the user's original intent.
    S._openDaysSnapshot  = JSON.parse(JSON.stringify(S.openDays));
    S._openStoresSnapshot = [...S.openStores];

    // ── Sunday viability check ──
    const { resolvedSundayStores, sacrificed } = resolveSundayStores(active);
    if (sacrificed.length) {
      // Patch openDays: remove DOM from sacrificed stores
      sacrificed.forEach(({ sid, reason }) => {
        if (S.openDays[sid]) {
          S.openDays[sid] = S.openDays[sid].filter(d => d !== 'DOM');
          if (!S.openDays[sid].length) {
            S.openStores = S.openStores.filter(id => id !== sid);
          }
        }
        S.alerts.push({
          type: 'red',
          text: `DOM: ${sname(sid)} não pode abrir ao domingo — ${reason} Horário gerado sem domingo nesta loja.`
        });
      });
    }

    computeSandraPosition(active);
    assignFolgas(active);
    buildSchedule(active);
    fixSunday(active);
    intelPass(active);
    saveMem();

    // ── Minimum coverage gate ──
    // If the generated schedule fails to cover any store on any open day,
    // block the output and show the coverage error screen instead.
    const coverageViolations = validateMinCoverage(active);
    if (coverageViolations.length > 0) {
      showCoverageBlocker(coverageViolations, active);
      return;
    }

    showSchedule(active);
  }

  // ── MINIMUM COVERAGE VALIDATION ──
  // Checks that every open store has the minimum required staff on every open day (Mon-Sat).
  // Returns an array of violations. Empty array = all good.
  function validateMinCoverage(active) {
    const violations = [];
    const workDays = ['SEG','TER','QUA','QUI','SEX','SAB'];
    workDays.forEach(day => {
      S.openStores.forEach(sid => {
        if (!storeOpen(sid, day)) return;
        const min = sid === 'avenida' ? minAv(day) : 1;
        const have = active.filter(p => {
          const c = S.schedule[p.id]?.[day];
          return c?.type === 'work' && c?.store === sid;
        }).length;
        if (have < min) {
          violations.push({ day, sid, have, min });
        }
      });
    });
    return violations;
  }

  // ── BLOCKING COVERAGE ALERT ──
  function showCoverageBlocker(violations, active) {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();

    const rows = violations.map(v =>
      `<div class="gh-cov-row">
        <span class="gh-cov-day">${v.day}</span>
        <span class="gh-cov-store">${sname(v.sid)}</span>
        <span class="gh-cov-count">${v.have}/${v.min} pessoa(s)</span>
      </div>`
    ).join('');

    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Cobertura insuficiente</div>
        <div class="gh-wiz-title">⚠ Horário não pode ser gerado</div>
        <div class="gh-wiz-sub">
          O horário resultante não garante a cobertura mínima indispensável de Segunda a Sábado.
          Ajuste as ausências, as lojas abertas ou os dias de funcionamento e tente novamente.
        </div>
        <div class="gh-cov-list">${rows}</div>
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost" id="gh-cov-back-stores">← Lojas</button>
          <button class="gh-btn gh-btn-ghost" id="gh-cov-back-abs">← Ausências</button>
          <button class="gh-btn gh-btn-solid" id="gh-cov-regen">↺ Tentar redistribuição</button>
        </div>
      </div>`;

    document.getElementById('gh-cov-back-stores').addEventListener('click', () => { wStep = 2; renderWiz(); });
    document.getElementById('gh-cov-back-abs').addEventListener('click',   () => { wStep = 1; renderWiz(); });
    document.getElementById('gh-cov-regen').addEventListener('click', () => {
      MEM.cycleWeek++;
      generate();
    });
  }

  // ── RENDER HORÁRIO ──
  function showSchedule(active) {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();
    const dates = wkDates();
    const today = new Date(); today.setHours(0,0,0,0);

    const alertsHTML = S.alerts.length
      ? `<div class="gh-alert-bar"><div class="gh-al-inner">${S.alerts.map(a => `<div class="gh-al-chip ${a.type}">${a.text}</div>`).join('')}</div></div>`
      : '';
    const decsHTML = S.decisions.length
      ? `<div class="gh-dec-bar"><div class="gh-dec-inner">${S.decisions.map(d => `<div class="gh-dec-chip">${d.text}</div>`).join('')}</div></div>`
      : '';

    const topBar = `
      <div class="gh-sched-bar">
        <div>
          <div class="gh-sb-week">Porto Santo · Semana ${isoWeek(S.weekStart)}</div>
          <div class="gh-sb-dates">${fmt(dates[0])} — ${fmt(dates[6])} ${dates[6].getFullYear()}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-regen" title="Redistribuir folgas mantendo as mesmas configurações">↺ Gerar Novamente</button>
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-nova">← Nova semana</button>
        </div>
      </div>
      ${alertsHTML}${decsHTML}`;

    let bodyHTML = '';
    STORES.filter(st => S.openStores.includes(st.id)).sort((a, b) => a.priority - b.priority).forEach(st => {
      const inSection = PEOPLE.filter(p => {
        const sched = S.schedule[p.id] || {};
        if (!DAYS.some(d => sched[d]?.type !== 'na')) return false;
        if (p.store === st.id) return true;
        return DAYS.some(d => sched[d]?.type === 'work' && sched[d]?.store === st.id);
      });
      if (!inSection.length) return;

      const hdrs = DAYS.map((d, i) => {
        const date = dates[i];
        const isToday = date.toDateString() === today.toDateString();
        const open = S.openDays[st.id]?.includes(d);
        return `<th class="gh-th${!open?' gh-th-closed':''}${isToday?' gh-th-today':''}">${d}<span class="gh-th-date">${fmt(date)}</span></th>`;
      }).join('');

      const rows = inSection.map(p => {
        const sched = S.schedule[p.id] || {};
        const cells = DAYS.map((day, di) => {
          const c2 = sched[day] || { type: 'na' };
          const open = S.openDays[st.id]?.includes(day);
          if (!open) {
            const lbl = c2.type === 'ferias' ? 'FÉRIAS' : c2.type === 'baixa' ? 'BAIXA' : 'FOLGA';
            const cls = (c2.type === 'ferias' || c2.type === 'baixa') ? 'c-ferias' : 'c-folga';
            return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner ${cls}"><span class="gh-sh-line">${lbl}</span></div></td>`;
          }
          let cls = '', content = '';
          if (c2.type === 'folga') { cls = 'c-folga'; content = `<span class="gh-sh-line">FOLGA</span>`; }
          else if (c2.type === 'ferias') { cls = 'c-ferias'; content = `<span class="gh-sh-line">FÉRIAS</span>`; }
          else if (c2.type === 'baixa')  { cls = 'c-ferias'; content = `<span class="gh-sh-line">BAIXA</span>`; }
          else if (c2.type === 'na')     { cls = 'c-na';     content = `<span class="gh-sh-line">N/A</span>`; }
          else if (c2.type === 'work') {
            if (c2.store === st.id) {
              const soft = p.softAvoid?.some(oid => S.schedule[oid]?.[day]?.type === 'work' && S.schedule[oid]?.[day]?.store === st.id);
              cls = soft ? 'c-soft' : 'c-work';
              content = c2.shift ? c2.shift.split('|').map(l => `<span class="gh-sh-line">${l}</span>`).join('') : `<span class="gh-sh-line">—</span>`;
            } else {
              cls = 'c-elsewhere';
              content = sshort(c2.store).split(' ').map(w => `<span class="gh-sh-loc">${w}</span>`).join('');
            }
          }
          return `<td class="gh-sh-td" data-pid="${p.id}" data-day="${day}" data-store="${st.id}"><div class="gh-sh-inner ${cls}">${content}</div></td>`;
        }).join('');

        let aH = 0;
        DAYS.forEach(d => {
          const cl = S.schedule[p.id]?.[d];
          if (cl?.type === 'work' && cl.shift) cl.shift.split('|').forEach(sg => {
            const [a, b] = sg.split('-').map(s => { const [h, m] = s.split(':').map(Number); return h + m/60; });
            aH += b - a;
          });
        });
        aH = Math.round(aH * 10) / 10;
        const hOk = Math.abs(aH - (p.hrs||40)) < 0.5;
        return `<tr>
          <td><div class="gh-p-cell">
            <div class="gh-p-name"><span class="gh-p-dot">●</span>${p.name}</div>
            <div class="gh-p-hrs ${hOk?'ok':'bad'}">${aH}h${hOk?' ✓':' (!)'}</div>
          </div></td>${cells}</tr>`;
      }).join('');

      bodyHTML += `<div class="gh-store-block"><table class="gh-sched-tbl">
        <thead>
          <tr class="gh-tbl-store-hdr">
            <td>PORTO SANTO<br>${st.short.split(' ').join('<br>')}</td>
            ${DAYS.map((d,i) => `<td>${d}<br><span class="gh-tbl-date">${fmt(dates[i])}</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    });

    c.innerHTML = topBar + `<div class="gh-sched-body">${bodyHTML}</div>`;

    document.getElementById('gh-btn-nova')?.addEventListener('click', startNew);
    document.getElementById('gh-btn-regen')?.addEventListener('click', regenSchedule);

    // Sync name-column width: measure the widest first-cell across ALL tables,
    // then set that width explicitly on every first-cell so all tables align.
    requestAnimationFrame(() => {
      const nameCells = [...c.querySelectorAll('.gh-sched-tbl td:first-child')];
      nameCells.forEach(td => { td.style.width = ''; td.style.minWidth = ''; });
      const maxW = nameCells.reduce((m, td) => Math.max(m, td.getBoundingClientRect().width), 0);
      if (maxW > 0) nameCells.forEach(td => { td.style.width = maxW + 'px'; td.style.minWidth = maxW + 'px'; });
    });

    // Edit on click
    c.querySelectorAll('.gh-sh-td[data-pid]').forEach(td => {
      td.addEventListener('click', () => openEdit(td.dataset.pid, td.dataset.day, td.dataset.store));
    });
  }

  // Re-run the engine keeping week, absences and store config — just shuffle folgas
  function regenSchedule() {
    // Restore original openDays/openStores from snapshot taken before the sunday check
    // mutated them on the previous generate() call.
    if (S._openDaysSnapshot) {
      S.openDays   = JSON.parse(JSON.stringify(S._openDaysSnapshot));
      S.openStores = S._openStoresSnapshot ? [...S._openStoresSnapshot] : Object.keys(S.openDays);
    }
    // Advance the cycle counter so folgas rotate to a different day
    MEM.cycleWeek++;
    generate();
  }

  // ── MODAL DE EDIÇÃO ──
  let editCtx = null;

  function openEdit(pid, day, ctxStore) {
    editCtx = { pid, day, ctxStore };
    const p = P(pid), c2 = S.schedule[pid]?.[day] || {};
    const modal = document.getElementById('gh-modal');
    if (!modal) return;
    modal.style.display = ''; // restore in case cleanup had hidden it
    document.getElementById('gh-me-ttl').textContent = `${p?.name} · ${DAY_PT[day]}`;
    const typeEl = document.getElementById('gh-me-type');
    typeEl.value = c2.type === 'work' ? 'work' : c2.type === 'ferias' ? 'ferias' : 'folga';
    const shEl = document.getElementById('gh-me-shift');
    if (c2.shift) { const f = [...shEl.options].find(o => o.value === c2.shift); shEl.value = f ? c2.shift : shEl.options[0].value; }
    const stEl = document.getElementById('gh-me-store');
    stEl.innerHTML = S.openStores.filter(id => p?.knows?.includes(id)).map(id => `<option value="${id}" ${c2.store===id?'selected':''}>${sname(id)}</option>`).join('');
    document.getElementById('gh-me-conf').style.display = 'none';
    meTypeChange();
    modal.classList.add('open');
  }

  function meTypeChange() {
    const v = document.getElementById('gh-me-type').value;
    document.getElementById('gh-me-work').style.display = v === 'work' ? '' : 'none';
  }

  function applyEdit() {
    if (!editCtx) return;
    const { pid, day } = editCtx;
    const type = document.getElementById('gh-me-type').value;
    if (type !== 'work') {
      S.schedule[pid][day] = { type: type === 'ferias' ? 'ferias' : 'folga', shift: null, store: null };
    } else {
      const shift = document.getElementById('gh-me-shift').value;
      const sid   = document.getElementById('gh-me-store').value;
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

  function closeModal() {
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
        #tab-gerador.active {
          display:flex !important; flex-direction:column !important;
          flex:1 !important; width:100% !important; height:100% !important;
          overflow:visible !important;
          padding:0 !important;
          background:#fff !important; color:#111 !important;
          box-sizing:border-box;
        }
        #tab-gerador #gh-container {
          flex:1; overflow-y:auto; overflow-x:auto;
          padding:0 0 60px; -webkit-overflow-scrolling:touch;
          background:#fff; color:#111;
          min-height:0;
        }

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
        #tab-gerador .gh-store-cfg { margin-bottom:28px; }
        #tab-gerador .gh-sc-row { padding:12px 0; border-bottom:1px solid #f0f0f0; }
        #tab-gerador .gh-sc-top { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        #tab-gerador .gh-sc-top label { font-size:.85rem; cursor:pointer; color:#111; font-weight:400; }
        #tab-gerador .gh-sc-top input[type=checkbox] { width:16px; height:16px; cursor:pointer; accent-color:#000; flex-shrink:0; }
        #tab-gerador .gh-sc-days { display:flex; gap:6px; flex-wrap:wrap; padding-left:28px; }
        #tab-gerador .gh-sc-row.closed .gh-sc-top label { color:#bbb; }
        #tab-gerador .gh-sc-row.closed .gh-sc-days { opacity:.2; pointer-events:none; }
        #tab-gerador .gh-dtog { padding:5px 11px; border:1px solid #ddd; border-radius:4px; font-size:.65rem; font-weight:600; letter-spacing:.05em; cursor:pointer; user-select:none; color:#555; background:#fff; }
        #tab-gerador .gh-dtog:hover { border-color:#555; }
        #tab-gerador .gh-dtog.on { background:#111; color:#fff !important; border-color:#111; }

        /* ── SCHEDULE BAR ── */
        #tab-gerador .gh-sched-bar { position:sticky; top:0; left:0; background:#fff; border-bottom:1px solid #e8e8e8; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; z-index:10; box-sizing:border-box; min-width:100vw; flex-wrap:wrap; gap:8px; }
        #tab-gerador .gh-sb-week  { font-size:.68rem; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:#888; }
        #tab-gerador .gh-sb-dates { font-size:.88rem; font-weight:500; margin-top:2px; color:#111; }
        #tab-gerador .gh-alert-bar { padding:8px 20px; background:#fafafa; border-bottom:1px solid #ebebeb; box-sizing:border-box; min-width:100vw; }
        #tab-gerador .gh-dec-bar   { padding:7px 20px; border-bottom:1px solid #f0f0f0; box-sizing:border-box; min-width:100vw; }
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
        #tab-gerador .gh-sched-body { padding:20px 0 60px; min-width:100%; width:max-content; box-sizing:border-box; display:flex; flex-direction:column; align-items:flex-start; }
        #tab-gerador .gh-store-block { margin-bottom:48px; width:100%; padding:0 16px; box-sizing:border-box; display:flex; justify-content:flex-start; }
        #tab-gerador .gh-sched-tbl { border-collapse:collapse; table-layout:auto; width:max-content; min-width:min(900px,100%); }
        #tab-gerador .gh-tbl-store-hdr { background:#efefef; }
        #tab-gerador .gh-tbl-store-hdr td { padding:9px 8px; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; border:1px solid #ddd; text-align:center; color:#111; word-break:keep-all; width:106px; }
        #tab-gerador .gh-tbl-store-hdr td:first-child { text-align:center; width:auto; min-width:140px; }
        #tab-gerador .gh-tbl-date { font-weight:500; font-size:.72rem; color:#555; }
        #tab-gerador .gh-sched-tbl td { border:1px solid #e8e8e8; padding:0; vertical-align:middle; }
        #tab-gerador .gh-sched-tbl td:first-child { padding:0; }
        #tab-gerador .gh-sh-td { width:106px; min-width:106px; max-width:106px; text-align:center; cursor:pointer; }
        #tab-gerador .gh-sh-td:hover { background:#f4f4f4; }
        #tab-gerador .gh-no-click { cursor:default; }
        #tab-gerador .gh-no-click:hover { background:transparent; }

        /* ── PERSON CELL ── */
        #tab-gerador .gh-p-cell { padding:8px 12px; white-space:nowrap; }
        #tab-gerador .gh-p-name { font-size:.85rem; font-weight:600; display:flex; align-items:center; gap:5px; color:#111; }
        #tab-gerador .gh-p-dot  { color:#e74c3c; font-size:.7rem; flex-shrink:0; }
        #tab-gerador .gh-p-hrs-tag { font-weight:500; color:#999; font-size:.72rem; flex-shrink:0; }
        #tab-gerador .gh-p-hrs  { font-size:.68rem; padding-left:16px; margin-top:2px; font-weight:600; }
        #tab-gerador .gh-p-hrs.ok  { color:#2d6a4f; }
        #tab-gerador .gh-p-hrs.bad { color:#c0392b; }

        /* ── SHIFT CELLS ── */
        #tab-gerador .gh-sh-inner { padding:7px 4px; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        #tab-gerador .gh-sh-line { display:block; font-size:.82rem; font-weight:600; line-height:1.65; color:#111; white-space:nowrap; }
        #tab-gerador .gh-sh-loc  { display:block; font-size:.78rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#111; line-height:1.4; }
        #tab-gerador .c-folga  { background:#f9f9f9; }
        #tab-gerador .c-folga .gh-sh-line  { color:#ccc; font-style:italic; }
        #tab-gerador .c-ferias { background:#f9f9f9; }
        #tab-gerador .c-ferias .gh-sh-line { color:#ccc; font-style:italic; }
        #tab-gerador .c-na .gh-sh-line     { color:#e0e0e0; }
        #tab-gerador .c-elsewhere { background:#f5f5f5; }
        #tab-gerador .c-soft { background:#fffbf0; }
        #tab-gerador .c-soft .gh-sh-line { color:#b8860b; }


        /* ── MOBILE SCROLL FIX ── */
        @media (max-width:900px) {
          #tab-gerador .gh-sched-bar { padding:10px 14px; flex-wrap:wrap; gap:8px; }
          #tab-gerador .gh-sb-dates { font-size:.78rem; }
          #tab-gerador .gh-sched-body { padding:12px 0 60px; align-items:flex-start; }
          #tab-gerador .gh-store-block { padding:0 8px; justify-content:flex-start; max-width:100%; }
          #tab-gerador .gh-wiz-box { padding:32px 16px; }
          #tab-gerador .gh-wiz-title { font-size:1.3rem; }
          #tab-gerador .gh-btn { padding:8px 16px; font-size:.68rem; }
          #tab-gerador .gh-btn-sm { padding:6px 12px; font-size:.62rem; }
          #tab-gerador .gh-p-cell { padding:6px 8px; }
          #tab-gerador .gh-p-name { font-size:.78rem; }
          #tab-gerador .gh-ab-row { grid-template-columns:1fr 90px 76px 28px; gap:5px; }
        }

        /* ── MODAL — position:fixed floats over whole page; always start hidden ── */
        #gh-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.3); backdrop-filter:blur(3px); z-index:9000; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
        #gh-modal.open { display:flex; opacity:1; pointer-events:all; }
        #gh-modal .gh-modal { background:#fff; border:1px solid #e0e0e0; border-radius:8px; width:340px; max-width:94vw; overflow:hidden; transform:translateY(8px); transition:transform .2s; box-shadow:0 8px 32px rgba(0,0,0,.12); color:#111; }
        #gh-modal.open .gh-modal { transform:translateY(0); }
        #gh-modal .gh-modal-hdr { padding:14px 18px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
        #gh-modal .gh-modal-ttl { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#111; }
        #gh-modal .gh-modal-x   { background:none; border:none; cursor:pointer; color:#bbb; font-size:1rem; line-height:1; }
        #gh-modal .gh-modal-bdy { padding:18px; }
        #gh-modal .gh-modal-ftr { padding:12px 18px; border-top:1px solid #f0f0f0; display:flex; gap:10px; justify-content:flex-end; }
        #gh-modal .gh-form-grp  { margin-bottom:14px; }
        #gh-modal .gh-form-lbl  { display:block; font-size:.62rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#999; margin-bottom:5px; }
        #gh-modal .gh-field-sm  { width:100%; border:1px solid #ddd; border-radius:5px; padding:7px 10px; font-size:.82rem; font-family:inherit; font-weight:300; outline:none; background:#fff; color:#111; box-sizing:border-box; }
        #gh-modal .gh-field-sm:focus { border-color:#111; }
        #gh-modal .gh-conf-note { padding:8px 10px; border-radius:5px; font-size:.72rem; margin-top:8px; line-height:1.5; }
        #gh-modal .gh-conf-note.hard { background:#fff5f5; border:1px solid rgba(192,57,43,.2); color:#c0392b; }
        #gh-modal .gh-conf-note.soft { background:#fffbf0; border:1px solid rgba(184,134,11,.2); color:#b8860b; }

        /* ── FERIAS BANNER (injected separately, also scope it) ── */
        #tab-gerador .gh-ferias-banner { display:flex; align-items:center; gap:9px; background:#f0f9f0; border:1px solid #b7ddb7; border-radius:7px; padding:9px 13px; font-size:.8rem; color:#1a5c1a; margin-bottom:12px; font-weight:500; line-height:1.4; }
        #tab-gerador .gh-ferias-banner-icon { font-size:1rem; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f6fdf6; border:1px solid #c8e6c8; border-radius:7px; margin-bottom:6px; font-size:.82rem; color:#1a5c1a; font-weight:600; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-tag { background:#e0f5e0; color:#1a5c1a; border-radius:4px; font-size:.68rem; padding:2px 8px; font-weight:700; letter-spacing:.04em; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-from { font-size:.74rem; color:#4a8a4a; font-weight:500; margin-left:auto; }
      `;
      document.head.appendChild(style);
    }

    // Inject HTML into panel (only once) — only gh-container goes inside the panel
    if (!document.getElementById('gh-container')) {
      panel.innerHTML = `<div id="gh-container"></div>`;
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
            <div class="gh-form-grp">
              <label class="gh-form-lbl">Tipo</label>
              <select class="gh-field-sm" id="gh-me-type" style="width:100%">
                <option value="work">Trabalho</option>
                <option value="folga">FOLGA</option>
                <option value="ferias">FÉRIAS</option>
              </select>
            </div>
            <div id="gh-me-work">
              <div class="gh-form-grp" style="margin-top:10px">
                <label class="gh-form-lbl">Horário</label>
                <select class="gh-field-sm" id="gh-me-shift" style="width:100%">
                  <option value="10:00-14:00|15:00-19:00">10:00-14:00 / 15:00-19:00</option>
                  <option value="10:00-13:00|14:00-19:00">10:00-13:00 / 14:00-19:00</option>
                  <option value="09:00-13:00|14:00-18:00">09:00-13:00 / 14:00-18:00</option>
                  <option value="09:00-13:00|19:00-23:00">09:00-13:00 / 19:00-23:00 (Noite)</option>
                  <option value="11:00-15:00|16:00-20:00">11:00-15:00 / 16:00-20:00 (Pós-noite)</option>
                  <option value="10:00-14:00">10:00-14:00 (Meio dia)</option>
                </select>
              </div>
              <div class="gh-form-grp" style="margin-top:10px">
                <label class="gh-form-lbl">Loja</label>
                <select class="gh-field-sm" id="gh-me-store" style="width:100%"></select>
              </div>
            </div>
            <div class="gh-conf-note" id="gh-me-conf" style="display:none"></div>
          </div>
          <div class="gh-modal-ftr">
            <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-modal-cancel">Cancelar</button>
            <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-modal-save">Guardar</button>
          </div>
        </div>`;
      document.body.appendChild(modalEl);

      document.getElementById('gh-modal-x').addEventListener('click', closeModal);
      document.getElementById('gh-modal-cancel').addEventListener('click', closeModal);
      document.getElementById('gh-modal-save').addEventListener('click', applyEdit);
      document.getElementById('gh-me-type').addEventListener('change', meTypeChange);
      modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
    }

    renderWiz();
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

})();
