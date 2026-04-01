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
    { id: 'matilde', name: 'Matilde R.',    hrs: 40, store: 'mercado', efetiva: false, start: '2025-03-02', canAlone: true,  mobile: true,  coverPri: 2, knows: ['mercado','avenida'],                hardAvoid: [],         softAvoid: [] },
    { id: 'djanice', name: 'Djanice L.',    hrs: 40, store: 'avenida', efetiva: false, start: '2025-03-15', canAlone: false, mobile: false, coverPri: 9, knows: ['avenida'],                          hardAvoid: [],         softAvoid: [] },
    { id: 'iara',    name: 'Iara O.',       hrs: 40, store: 'avenida', efetiva: false, start: '2025-04-01', canAlone: false, mobile: false, coverPri: 9, knows: ['avenida','mercado'],                hardAvoid: [],         softAvoid: [] },
  ];

  const DAYS   = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
  const DAY_PT = { SEG:'Segunda', TER:'Terça', QUA:'Quarta', QUI:'Quinta', SEX:'Sexta', SAB:'Sábado', DOM:'Domingo' };
  const SH_DEFAULT = '10:00-14:00|15:00-19:00';
  const SH_ALT     = '10:00-13:00|14:00-19:00';

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
    // Only touch #tab-gerador — never shared/global containers
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      panel.style.padding = '0';
      panel.style.background = '#fff';
      panel.style.color = '#111';
      panel.style.overflow = 'hidden';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
    }
    // gh-container layout is handled entirely by CSS — no inline styles needed
  }

  function cleanupGeradorLayout() {
    // Called when leaving the gerador tab — restore panel to neutral
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      panel.style.padding = '';
      panel.style.background = '';
      panel.style.color = '';
      panel.style.overflow = '';
      panel.style.display = '';
      panel.style.flexDirection = '';
    }
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
    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Passo 2 de 3</div>
        <div class="gh-wiz-title">Há ausências esta semana?</div>
        <div class="gh-wiz-sub">Férias, baixas ou N/A. Se não houver, avance.</div>
        <div class="gh-ab-list" id="gh-ab-list"></div>
        <button class="gh-add-btn" id="gh-add-ab">+ Adicionar ausência</button>
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-1">← Voltar</button>
          <button class="gh-btn gh-btn-solid" id="gh-sub-abs">Continuar →</button>
        </div>
      </div>`;
    S.absences.forEach(a => addAb(a));
    document.getElementById('gh-add-ab').addEventListener('click', () => addAb({}));
    document.getElementById('gh-back-1').addEventListener('click', () => { wStep = 0; renderWiz(); });
    document.getElementById('gh-sub-abs').addEventListener('click', sub_abs);
  }

  function addAb(ex) {
    ex = ex || {};
    const list = document.getElementById('gh-ab-list'); if (!list) return;
    const row = document.createElement('div'); row.className = 'gh-ab-row';
    const pO = PEOPLE.map(p => `<option value="${p.id}" ${ex.pid===p.id?'selected':''}>${p.name}</option>`).join('');
    const tO = [['ferias','FÉRIAS'],['baixa','BAIXA'],['na','N/A']].map(([v,l]) => `<option value="${v}" ${ex.type===v?'selected':''}>${l}</option>`).join('');
    const dO = DAYS.map(d => `<option value="${d}" ${ex.from===d?'selected':''}>${DAY_PT[d]}</option>`).join('');
    row.innerHTML = `<select class="gh-ab-sel">${pO}</select><select class="gh-ab-sel">${tO}</select><select class="gh-ab-sel">${dO}</select><button class="gh-ab-x">×</button>`;
    row.querySelector('.gh-ab-x').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function sub_abs() {
    S.absences = [];
    document.querySelectorAll('.gh-ab-row').forEach(r => {
      const s = r.querySelectorAll('select');
      S.absences.push({ pid: s[0].value, type: s[1].value, from: s[2].value });
    });
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
    function baseCov(day) {
      const cov = {};
      S.openStores.forEach(sid => {
        cov[sid] = active.filter(p => {
          if (p.id === 'sandra') return S.sandraDay[day] === sid;
          if (!p.store || p.store !== sid) return false;
          return !isAbsent(p.id, day);
        }).length;
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
        const candidates = workDays.filter(d => !isAbsent(p.id, d));
        extraDayOff = candidates.sort((a, b) => (remaining[b][myStore]||0) - (remaining[a][myStore]||0))[0];
      }
      let found = false, willWorkSunday = false;
      for (let t = 0; t < 12; t++) {
        const day = workDays[dayIdx];
        const monSatDays = workDays.filter(d => {
          if (d === day) return false;
          if (canWorkSunday && extraDayOff && d === extraDayOff && day !== extraDayOff) return false;
          if (isAbsent(p.id, d)) return false;
          return true;
        }).length;
        const withSun = monSatDays + 1, withoutSun = monSatDays;
        let sundayDecision = false;
        if (withoutSun === target) { sundayDecision = false; }
        else if (canWorkSunday && withSun === target) { sundayDecision = true; }
        else { dayIdx = (dayIdx+1) % 6; continue; }
        const effStore = p.id === 'sandra' ? S.sandraDay[day] : p.store;
        if (effStore && S.openStores.includes(effStore) && S.openDays[effStore]?.includes(day)) {
          if ((remaining[day][effStore]||0) - 1 < 1) { dayIdx = (dayIdx+1) % 6; continue; }
        }
        const sameFolgas = sorted.filter(x => {
          if (x.id === p.id || !S.folgaDay[x.id] || S.folgaDay[x.id] !== day) return false;
          return (x.id === 'sandra' ? S.sandraDay[day] : x.store) === effStore;
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
      const effStore = p.id === 'sandra' ? S.sandraDay[day] : p.store;
      if (effStore && remaining[day]?.[effStore] !== undefined) remaining[day][effStore]--;
      if (willWorkSunday && extraDayOff && extraDayOff !== day) {
        if (effStore && remaining[extraDayOff]?.[effStore] !== undefined) remaining[extraDayOff][effStore]--;
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
      STORES.filter(st => storeOpen(st.id, day)).forEach(st => {
        const staff = wk().filter(p => S.schedule[p.id][day].store === st.id)
          .sort((a, b) => { const as = (a.efetiva?1000:0)+weeksSince(a.start,S.weekStart), bs = (b.efetiva?1000:0)+weeksSince(b.start,S.weekStart); return as - bs; });
        if (staff.length < 2) return;
        staff.forEach((p, i) => { S.schedule[p.id][day].shift = i < staff.length-1 ? SH_ALT : SH_DEFAULT; });
      });
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

  function generate() {
    S.alerts = []; S.decisions = []; S.sandraDay = {}; S.folgaDay = {}; S.extraDayOff = {};
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    computeSandraPosition(active);
    assignFolgas(active);
    buildSchedule(active);
    fixSunday(active);
    intelPass(active);
    saveMem();
    showSchedule(active);
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
        <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-nova">← Nova semana</button>
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
            <div class="gh-p-name"><span class="gh-p-dot">●</span>${p.name} <span class="gh-p-hrs-tag">${p.hrs}h</span></div>
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

    // Edit on click
    c.querySelectorAll('.gh-sh-td[data-pid]').forEach(td => {
      td.addEventListener('click', () => openEdit(td.dataset.pid, td.dataset.day, td.dataset.store));
    });
  }

  // ── MODAL DE EDIÇÃO ──
  let editCtx = null;

  function openEdit(pid, day, ctxStore) {
    editCtx = { pid, day, ctxStore };
    const p = P(pid), c2 = S.schedule[pid]?.[day] || {};
    const modal = document.getElementById('gh-modal');
    if (!modal) return;
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
          overflow:hidden !important;
          padding:0 !important; /* override module-open padding */
          background:#fff !important; color:#111 !important;
          box-sizing:border-box;
        }
        #gh-container {
          flex:1; overflow-y:auto; overflow-x:hidden;
          padding:0 0 60px; -webkit-overflow-scrolling:touch;
          background:#fff; color:#111;
          min-height:0;
        }

        /* ── WIZARD ── */
        @keyframes gh-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .gh-wiz-box { width:100%; max-width:520px; margin:0 auto; padding:48px 24px; animation:gh-up .3s ease; box-sizing:border-box; }
        .gh-wiz-label { font-size:.65rem; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:#bbb; margin-bottom:12px; }
        .gh-wiz-title { font-size:1.6rem; font-weight:400; margin-bottom:8px; line-height:1.3; color:#111; }
        .gh-wiz-sub   { font-size:.82rem; color:#888; margin-bottom:32px; line-height:1.6; }
        .gh-field { width:100%; border:1px solid #ddd; border-radius:6px; padding:11px 13px; font-size:.9rem; font-family:inherit; font-weight:400; outline:none; transition:border-color .15s; background:#fff; margin-bottom:28px; color:#111; box-sizing:border-box; }
        .gh-field:focus { border-color:#000; }
        .gh-wiz-nav { display:flex; gap:12px; align-items:center; margin-top:4px; }

        /* ── BUTTONS — always white text on dark, light outline on ghost ── */
        .gh-btn { padding:9px 20px; font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; border-radius:6px; font-family:inherit; transition:all .15s; }
        .gh-btn-solid { background:#111 !important; color:#fff !important; border:1px solid #111 !important; }
        .gh-btn-solid:hover { background:#333 !important; border-color:#333 !important; }
        .gh-btn-ghost { background:#fff !important; color:#111 !important; border:1px solid #999 !important; }
        .gh-btn-ghost:hover { border-color:#111 !important; }
        .gh-btn-sm { padding:6px 14px; font-size:.65rem; }
        .gh-wiz-back { background:none !important; border:none !important; font-size:.68rem; color:#bbb !important; cursor:pointer; font-family:inherit; letter-spacing:.06em; text-transform:uppercase; padding:6px 4px; }
        .gh-wiz-back:hover { color:#111 !important; }

        /* ── ABSENCES ── */
        .gh-ab-list { margin-bottom:14px; }
        .gh-ab-row { display:grid; grid-template-columns:1fr 110px 90px 28px; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0; }
        .gh-ab-sel { border:1px solid #ddd; border-radius:5px; padding:7px 9px; font-size:.78rem; font-family:inherit; font-weight:300; outline:none; background:#fff; width:100%; color:#111; }
        .gh-ab-x { background:none; border:none; cursor:pointer; color:#ccc; font-size:1rem; line-height:1; }
        .gh-ab-x:hover { color:#c00; }
        .gh-add-btn { display:flex; align-items:center; gap:8px; font-size:.75rem; color:#aaa; cursor:pointer; border:1px dashed #ddd; border-radius:5px; padding:9px 14px; background:none; font-family:inherit; width:100%; margin-bottom:24px; }
        .gh-add-btn:hover { border-color:#111; color:#111; }

        /* ── STORE CONFIG ── */
        .gh-store-cfg { margin-bottom:28px; }
        .gh-sc-row { padding:12px 0; border-bottom:1px solid #f0f0f0; }
        .gh-sc-top { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .gh-sc-top label { font-size:.85rem; cursor:pointer; color:#111; font-weight:400; }
        .gh-sc-top input[type=checkbox] { width:16px; height:16px; cursor:pointer; accent-color:#000; flex-shrink:0; }
        .gh-sc-days { display:flex; gap:6px; flex-wrap:wrap; padding-left:28px; }
        .gh-sc-row.closed .gh-sc-top label { color:#bbb; }
        .gh-sc-row.closed .gh-sc-days { opacity:.2; pointer-events:none; }
        .gh-dtog { padding:5px 11px; border:1px solid #ddd; border-radius:4px; font-size:.65rem; font-weight:600; letter-spacing:.05em; cursor:pointer; user-select:none; color:#555; background:#fff; }
        .gh-dtog:hover { border-color:#555; }
        .gh-dtog.on { background:#111; color:#fff !important; border-color:#111; }

        /* ── SCHEDULE BAR ── */
        .gh-sched-bar { position:sticky; top:0; background:#fff; border-bottom:1px solid #e8e8e8; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; z-index:10; box-sizing:border-box; }
        .gh-sb-week  { font-size:.68rem; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:#888; }
        .gh-sb-dates { font-size:.88rem; font-weight:500; margin-top:2px; color:#111; }
        .gh-alert-bar { padding:8px 20px; background:#fafafa; border-bottom:1px solid #ebebeb; box-sizing:border-box; }
        .gh-dec-bar   { padding:7px 20px; border-bottom:1px solid #f0f0f0; box-sizing:border-box; }
        .gh-al-inner  { display:flex; flex-wrap:wrap; gap:6px; }
        .gh-dec-inner { display:flex; flex-wrap:wrap; gap:5px; }
        .gh-al-chip { font-size:.68rem; padding:4px 11px; border-radius:20px; }
        .gh-al-chip.red   { background:#fff5f5; color:#c0392b; border:1px solid rgba(192,57,43,.18); }
        .gh-al-chip.amber { background:#fffbf0; color:#b8860b; border:1px solid rgba(184,134,11,.2); }
        .gh-al-chip.info  { background:#f0f6ff; color:#1a4a7a; border:1px solid rgba(26,74,122,.2); }
        .gh-dec-chip { font-size:.65rem; color:#777; padding:3px 9px; background:#f5f5f5; border-radius:4px; }

        /* ── TABLE LAYOUT ── */
        .gh-sched-body { padding:20px 0 60px; width:100%; box-sizing:border-box; }
        .gh-store-block { margin-bottom:48px; display:flex; justify-content:center; padding:0 16px; overflow-x:auto; }
        /* Table: auto layout, width determined by content only — never stretches to fill container */
        .gh-sched-tbl { border-collapse:collapse; table-layout:auto; }
        .gh-tbl-store-hdr { background:#efefef; }
        .gh-tbl-store-hdr td { padding:9px 8px; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; border:1px solid #ddd; text-align:center; color:#111; word-break:keep-all; min-width:80px; }
        .gh-tbl-store-hdr td:first-child { text-align:center; min-width:0; width:130px; }
        .gh-tbl-date { font-weight:500; font-size:.72rem; color:#555; }
        .gh-sched-tbl td { border:1px solid #e8e8e8; padding:0; vertical-align:middle; }
        .gh-sched-tbl td:first-child { padding:0; white-space:nowrap; }

        /* ── PERSON CELL ── */
        .gh-p-cell { padding:8px 12px; }
        .gh-p-name { font-size:.85rem; font-weight:600; display:flex; align-items:center; gap:5px; color:#111; white-space:nowrap; }
        .gh-p-dot  { color:#e74c3c; font-size:.7rem; flex-shrink:0; }
        .gh-p-hrs-tag { font-weight:500; color:#999; font-size:.72rem; flex-shrink:0; }
        .gh-p-hrs  { font-size:.68rem; padding-left:16px; margin-top:2px; font-weight:600; }
        .gh-p-hrs.ok  { color:#2d6a4f; }
        .gh-p-hrs.bad { color:#c0392b; }

        /* ── SHIFT CELLS ── */
        .gh-sh-td { text-align:center; cursor:pointer; }
        .gh-sh-td:hover { background:#f4f4f4; }
        .gh-no-click { cursor:default; }
        .gh-no-click:hover { background:transparent; }
        .gh-sh-inner { padding:7px 4px; min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .gh-sh-line { display:block; font-size:.76rem; font-weight:500; line-height:1.6; color:#111; white-space:nowrap; }
        .gh-sh-loc  { display:block; font-size:.72rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#111; line-height:1.4; }
        .c-folga  { background:#f9f9f9; }
        .c-folga .gh-sh-line  { color:#ccc; font-style:italic; }
        .c-ferias { background:#f9f9f9; }
        .c-ferias .gh-sh-line { color:#ccc; font-style:italic; }
        .c-na .gh-sh-line     { color:#e0e0e0; }
        .c-elsewhere { background:#f5f5f5; }
        .c-soft { background:#fffbf0; }
        .c-soft .gh-sh-line { color:#b8860b; }

        /* ── MODAL ── */
        .gh-modal-ov { position:fixed; inset:0; background:rgba(0,0,0,.3); backdrop-filter:blur(3px); z-index:9000; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
        .gh-modal-ov.open { opacity:1; pointer-events:all; }
        .gh-modal { background:#fff; border:1px solid #e0e0e0; border-radius:8px; width:340px; max-width:94vw; overflow:hidden; transform:translateY(8px); transition:transform .2s; box-shadow:0 8px 32px rgba(0,0,0,.12); color:#111; }
        .gh-modal-ov.open .gh-modal { transform:translateY(0); }
        .gh-modal-hdr { padding:14px 18px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
        .gh-modal-ttl { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#111; }
        .gh-modal-x   { background:none; border:none; cursor:pointer; color:#bbb; font-size:1rem; line-height:1; }
        .gh-modal-bdy { padding:18px; }
        .gh-modal-ftr { padding:12px 18px; border-top:1px solid #f0f0f0; display:flex; gap:10px; justify-content:flex-end; }
        .gh-form-grp  { margin-bottom:14px; }
        .gh-form-lbl  { display:block; font-size:.62rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#999; margin-bottom:5px; }
        .gh-field-sm  { width:100%; border:1px solid #ddd; border-radius:5px; padding:7px 10px; font-size:.82rem; font-family:inherit; font-weight:300; outline:none; background:#fff; color:#111; box-sizing:border-box; }
        .gh-field-sm:focus { border-color:#111; }
        .gh-conf-note { padding:8px 10px; border-radius:5px; font-size:.72rem; margin-top:8px; line-height:1.5; }
        .gh-conf-note.hard { background:#fff5f5; border:1px solid rgba(192,57,43,.2); color:#c0392b; }
        .gh-conf-note.soft { background:#fffbf0; border:1px solid rgba(184,134,11,.2); color:#b8860b; }
      `;
      document.head.appendChild(style);
    }

    // Inject HTML into panel (only once)
    if (!document.getElementById('gh-container')) {
      panel.innerHTML = `
        <div id="gh-container"></div>
        <div class="gh-modal-ov" id="gh-modal">
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
          </div>
        </div>`;

      document.getElementById('gh-modal-x').addEventListener('click', closeModal);
      document.getElementById('gh-modal-cancel').addEventListener('click', closeModal);
      document.getElementById('gh-modal-save').addEventListener('click', applyEdit);
      document.getElementById('gh-me-type').addEventListener('change', meTypeChange);
      document.getElementById('gh-modal').addEventListener('click', e => { if (e.target === document.getElementById('gh-modal')) closeModal(); });
    }

    renderWiz();
  };

  // ── TAB LISTENER ──
  document.querySelectorAll('.tab-btn, .drawer-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.tab === 'gerador') {
        window.initGeradorHorarios?.();
      } else {
        // Leaving gerador — clean up any inline styles we set on #tab-gerador
        cleanupGeradorLayout();
      }
    });
  });

})();
