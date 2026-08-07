// ══════════════════════════════════════════════════════════════
//  ADMIN: PDF.js worker + tabs
//  ══════════════════════════════════════════════════════════════
//  Fundido de index.html (migração para JS):
//  - interceptOverlayTabs() (agenda/rótulos/processamento) foi colocado
//    ANTES do handler .tab-btn abaixo, de propósito: ambos os listeners
//    são anexados ao MESMO elemento (o próprio botão), e para listeners
//    no próprio target (nem ancestor), a ordem de execução é a ordem de
//    anexação — capture:true não muda isso. Se o handler .tab-btn corresse
//    primeiro, o stopImmediatePropagation() do interceptor chegaria tarde
//    demais (o painel errado já teria sido ativado). Isto reproduz
//    fielmente a ordem original (o script do interceptor já vinha antes,
//    inline, no index.html).
//  - Drawer móvel, router central (openModule/goToDashboard) e o handler
//    de popstate também foram fundidos aqui (ver final do ficheiro).
//  - O router central tinha o seu wiring de cliques (.adm-mod-card,
//    botões de voltar) dentro de DOMContentLoaded. Adaptado para
//    verificação de document.readyState: este ficheiro carrega depois
//    do login, quando DOMContentLoaded já disparou há muito — sem este
//    ajuste os 6 cartões principais do dashboard (#adm-module-grid)
//    ficariam sem clique.
// ══════════════════════════════════════════════════════════════

// ── Reset defensivo, primeira coisa a correr ao carregar este ficheiro:
//    garante que #admin-app nunca herda show/module-open/vendas-open/
//    historico-open de uma sessão anterior na mesma aba. Este script é
//    injetado (loadProtectedScripts, em shared.js) para QUALQUER login
//    bem-sucedido, admin ou não, sempre antes de #admin-app ganhar a
//    classe show — por isso é o sítio certo para limpar antes de mais
//    nada decidir o que deve ficar visível. ──
(function () {
  var _adminAppEarly = document.getElementById('admin-app');
  if (_adminAppEarly) {
    _adminAppEarly.classList.remove('show', 'module-open', 'vendas-open', 'historico-open');
  }
})();

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════════════════════
//  (fundido de index.html) — intercepção de tabs agenda/rótulos/
//  processamento: redireciona para os respetivos overlays em vez do
//  painel de tab normal. Tem de correr ANTES do handler .tab-btn
//  abaixo — ver nota no cabeçalho do ficheiro.
// ══════════════════════════════════════════════════════════════
(function () {
  var _lastTab = 'pagamentos';

  function interceptOverlayTabs() {
    document.querySelectorAll('.tab-btn, .drawer-tab-btn').forEach(function (btn) {
      if (btn.dataset.tab !== 'agenda' && btn.dataset.tab !== 'rotulos' && btn.dataset.tab !== 'processamento') return;
      if (btn.dataset._overlayBound) return;
      btn.dataset._overlayBound = '1';

      btn.addEventListener('click', function (e) {
        
        e.stopImmediatePropagation();

        
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.tab === _lastTab);
        });
        document.querySelectorAll('.drawer-tab-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.tab === _lastTab);
        });

        if (btn.dataset.tab === 'agenda')         openAgendaOverlay();
        if (btn.dataset.tab === 'rotulos')        openRotulosOverlay();
        if (btn.dataset.tab === 'processamento')  openProcessamentoOverlay();
      }, true); 
    });
  }

  
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab-btn, .drawer-tab-btn');
    if (!btn) return;
    if (btn.dataset.tab !== 'agenda' && btn.dataset.tab !== 'rotulos' && btn.dataset.tab !== 'processamento') {
      _lastTab = btn.dataset.tab;
    }
  }, true);

  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', interceptOverlayTabs);
  } else {
    interceptOverlayTabs();
  }
})();

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.remove('active');
      // reset animation so it re-fires on next activation
      p.style.animation = 'none';
    });
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    panel.classList.add('active');
    // force reflow then re-enable animation
    void panel.offsetWidth;
    panel.style.animation = '';
    // Manage page scroll: desktop keeps overflow hidden except salários loaded;
    // on mobile body scroll is always allowed (ferias and others need it)
    const adminApp = document.getElementById('admin-app');
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Mobile: body always scrolls freely, tab-nav is fixed so always visible
      document.body.style.overflow = '';
      adminApp.classList.remove('s-loaded');
      document.getElementById('tab-salarios').classList.remove('s-loaded');
      if (btn.dataset.tab === 'salarios' && adminApp.dataset.sLoaded === '1') {
        adminApp.classList.add('s-loaded');
        document.getElementById('tab-salarios').classList.add('s-loaded');
      }
      window.scrollTo(0, 0);
    } else if (btn.dataset.tab === 'salarios' && adminApp.dataset.sLoaded === '1') {
      document.body.style.overflow = 'auto';
      adminApp.classList.add('s-loaded');
      document.getElementById('tab-salarios').classList.add('s-loaded');
    } else {
      document.body.style.overflow = 'hidden';
      adminApp.classList.remove('s-loaded');
      document.getElementById('tab-salarios').classList.remove('s-loaded');
    }
    // Recibos tab: show mes hint if no mes saved yet
    if (btn.dataset.tab === 'recibos') {
      const mesSaved = localStorage.getItem('gh_mes') || '';
      const mesHint  = document.getElementById('r-mes-hint');
      if (!mesSaved) {
        mesHint.style.opacity = '1';
        rShowGuide('right', '① actualiza\no mês\ne guarda', '');
      } else {
        mesHint.style.opacity = '0';
      }
    } else {
      // Hide recibos guides when leaving the tab
      rHideAllGuides();
      const cf = document.getElementById('r-conferir-fixed');
      if (cf) cf.classList.remove('show');
    }
  });
});


// ══════════════════════════════════════════════════════════════
//  (fundido de index.html) — drawer de menu móvel
// ══════════════════════════════════════════════════════════════
(function () {
  const btn      = document.getElementById('admin-menu-btn');
  const drawer   = document.getElementById('admin-menu-drawer');
  const overlay  = document.getElementById('admin-menu-overlay');
  const tabNav   = document.getElementById('tab-nav');

  function openMenu() {
    btn.classList.add('open');
    drawer.classList.add('open');
    overlay.classList.add('open');
  }
  function closeMenu() {
    btn.classList.remove('open');
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }

  btn.addEventListener('click', function () {
    drawer.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay.addEventListener('click', closeMenu);

  
  function syncActive(tabName) {
    drawer.querySelectorAll('.drawer-tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
  }

  
  drawer.addEventListener('click', function (e) {
    const drawerBtn = e.target.closest('.drawer-tab-btn');
    if (!drawerBtn) return;
    const tab = drawerBtn.dataset.tab;
    const realBtn = tabNav.querySelector('[data-tab="' + tab + '"]');
    if (realBtn) realBtn.click();
    syncActive(tab);
    closeMenu();
  });

  
  tabNav.addEventListener('click', function (e) {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) syncActive(tabBtn.dataset.tab);
  });
})();

// ══════════════════════════════════════════════════════════════
//  (fundido de index.html) — router central do admin: openModule,
//  goToDashboard, overlays de faturas/horários/vendas
// ══════════════════════════════════════════════════════════════
(function () {
  // ── Auto-injeção do #vendas-sub-grid (idempotente). Tem de correr AQUI,
  //    síncrono, logo ao carregar o ficheiro — antes de _adminInitWireCards()
  //    (mais abaixo) fazer o seu varrimento único de [data-vendas-module], e
  //    antes de relocateAccordionGrids() (a seguir) mover este grid para
  //    dentro do corpo do acordeão. Sem overlay fullscreen: o grupo "Vendas"
  //    expande-se no próprio lugar no dashboard. ──
  function ensureVendasOverlayShell() {
    if (document.getElementById('vendas-sub-grid')) return;
    var grid = document.createElement('div');
    grid.id = 'vendas-sub-grid';
    grid.innerHTML = `
      <div class="adm-mod-card" data-vendas-module="ventas">
        <div class="adm-mod-name">VENDAS DECLARADAS</div>
        <div class="adm-mod-desc">vendas declaradas por loja</div>
      </div>
      <div class="adm-mod-card" data-vendas-module="historico">
        <div class="adm-mod-name">VENDAS SISTEMA</div>
        <div class="adm-mod-desc">análise de vendas do sistema</div>
      </div>
`;
    document.body.appendChild(grid);
  }
  ensureVendasOverlayShell();

  // ── Reubica os sub-grids dos antigos overlays fullscreen (vendas/horários/
  //    faturas) para dentro do novo corpo de acordeão de cada card no
  //    dashboard. nucleo.js (horários) e faturas.js (faturas) carregam ANTES
  //    deste ficheiro (ver os seus próprios comentários de ordem), e o shell
  //    de vendas acabou de ser criado 2 linhas acima — os 3 grids já existem
  //    a esta altura. Move-se o elemento em si (não uma cópia): os ficheiros
  //    que continuam a inserir cards neles (ferias.js/banco-horas em
  //    horarios.js, tam.js, etc.) fazem-no por getElementById, que continua
  //    a encontrá-los onde quer que estejam — nada mais precisa de mudar. ──
  function relocateAccordionGrids() {
    var map = {
      'vendas-sub-grid':   'acc-body-vendas',
      'horarios-sub-grid': 'acc-body-horarios',
      'faturas-sub-grid':  'acc-body-faturas'
    };
    Object.keys(map).forEach(function (gridId) {
      var gridEl = document.getElementById(gridId);
      var bodyEl = document.getElementById(map[gridId]);
      if (gridEl && bodyEl) bodyEl.appendChild(gridEl);
    });
  }
  relocateAccordionGrids();

  var MODULE_LABELS = {
    pagamentos:    'pagamentos',
    agenda:        'agenda',
    rotulos:       'rótulos',
    horarios:      'horários',
    gerador:       'gerador de horários',
    ferias:        'férias',
    'banco-horas': 'banco de horas',
    editor:        'editor pdf',
    tam:           'tam',
    processamento: 'faturas lisboa',
    faturas:       'faturas'
  };

  function openModule(tab) {
    
    if (tab === 'faturas') { toggleAccordion('faturas'); return; }

    
    if (tab === 'horarios-group') { toggleAccordion('horarios'); return; }

    
    if (tab === 'vendas-group') { toggleAccordion('vendas'); return; }

    
    if (tab === 'utilitarios-group') { toggleAccordion('utilitarios'); return; }

    
    if (tab === 'ventas') {
      var adminApp = document.getElementById('admin-app');
      var dashboard = document.getElementById('adm-dashboard');
      var moduleBar = document.getElementById('adm-module-bar');
      var barTitle  = document.getElementById('adm-module-bar-title');

      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      if (dashboard) dashboard.style.display = 'none';
      if (moduleBar) moduleBar.style.display  = 'flex';
      if (barTitle)  barTitle.textContent     = 'vendas declaradas';
      if (adminApp)  adminApp.scrollTop = 0;
      // #adm-ventas-panel agora é auto-injetado por ventas.js — delega-se
      // sempre a openVentasAdmin() (idêntico ao padrão já usado para 'historico'
      // com openHistoricoAdmin() logo abaixo), em vez de assumir HTML estático.
      if (typeof openVentasAdmin === 'function') openVentasAdmin();
      return;
    }

    
    if (tab === 'historico') {
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      var dashboard = document.getElementById('adm-dashboard');
      var moduleBar = document.getElementById('adm-module-bar');
      var barTitle  = document.getElementById('adm-module-bar-title');
      if (dashboard) dashboard.style.display = 'none';
      if (moduleBar) moduleBar.style.display  = 'flex';
      if (barTitle)  barTitle.textContent     = 'histórico de vendas';
      if (typeof openHistoricoAdmin === 'function') openHistoricoAdmin();
      return;
    }

    
    if (tab !== 'gerador' && typeof cleanupGeradorLayout === 'function') {
      cleanupGeradorLayout();
    }

    var adminApp = document.getElementById('admin-app');
    var barTitle = document.getElementById('adm-module-bar-title');

    
    document.querySelectorAll('.tab-btn, .drawer-tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.remove('active');
    });
    var panel = document.getElementById('tab-' + tab);
    if (panel) panel.classList.add('active');

    
    adminApp.classList.add('module-open');
    adminApp.scrollTop = 0;
    if (barTitle) barTitle.textContent = MODULE_LABELS[tab] || tab;
    var moduleBar = document.getElementById('adm-module-bar');
    if (moduleBar) moduleBar.style.display = 'flex';

    
    
    setTimeout(function () {
      adminApp.style.overflow = 'hidden';
      adminApp.offsetHeight; 
      adminApp.style.overflow = '';
    }, 80);

    
    
    
    
    if (tab === 'agenda'        && typeof openAgendaOverlay        === 'function') { openAgendaOverlay();        adminApp.classList.remove('module-open'); }
    if (tab === 'rotulos'       && typeof openRotulosOverlay       === 'function') { openRotulosOverlay();       adminApp.classList.remove('module-open'); }
    if (tab === 'processamento' && typeof openProcessamentoOverlay === 'function') { openProcessamentoOverlay(); adminApp.classList.remove('module-open'); document.body.classList.add('no-glow'); }
    if (tab === 'tam') { document.body.classList.add('no-glow'); }

    
    
    if (tab === 'gerador') {
      if (typeof initGeradorHorarios === 'function') setTimeout(initGeradorHorarios, 40);
    }
    if (tab === 'ferias') {
      if (typeof initFerias === 'function') {
        initFerias();
      } else if (typeof loadFerias === 'function') {
        loadFerias();
      } else if (typeof renderFerias === 'function') {
        renderFerias();
      } else {
        
        document.dispatchEvent(new CustomEvent('ferias:open'));
        
        var feriasBtns = document.querySelectorAll('.tab-btn[data-tab="ferias"], .drawer-tab-btn[data-tab="ferias"]');
        feriasBtns.forEach(function(b) {
          b.dispatchEvent(new CustomEvent('ferias:tabactivated', { bubbles: true }));
        });
      }
    }
    if (tab === 'banco-horas') {
      if (typeof initBancoHorasAdmin === 'function') setTimeout(initBancoHorasAdmin, 40);
    }
  }

  function goToDashboard() {
    var adminApp = document.getElementById('admin-app');
    adminApp.classList.remove('module-open');
    document.body.classList.remove('no-glow');
    
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });

    
    var moduleBar = document.getElementById('adm-module-bar');
    if (moduleBar) moduleBar.style.display = '';

    
    if (typeof closeVentasAdmin === 'function') closeVentasAdmin();
    else {
      var vPanel = document.getElementById('adm-ventas-panel');
      if (vPanel) vPanel.style.display = 'none';
    }

    
    if (typeof closeHistoricoAdmin === 'function') closeHistoricoAdmin();
    else {
      var hPanel = document.getElementById('adm-historico-panel');
      if (hPanel) hPanel.style.display = 'none';
    }

    
    var dashboard = document.getElementById('adm-dashboard');
    if (dashboard) dashboard.style.display = '';

    
    collapseAccordion();
    document.querySelectorAll('#adm-module-grid > .adm-mod-card, #adm-module-grid > .adm-group > .adm-mod-trigger').forEach(function (c) {
      c.style.animation = 'none';
      c.offsetWidth; 
      c.style.animation = '';
    });
  }

  // ── Acordeão do dashboard (Utilitários/Vendas/Horários/Faturas): substitui
  //    o antigo padrão de overlay fullscreen. Clássico — abrir um grupo
  //    fecha qualquer outro que estivesse aberto. O corpo (.adm-mod-body)
  //    já contém o sub-grid correto graças a relocateAccordionGrids(). ──
  var ACCORDION_BODIES = {
    utilitarios: 'acc-body-utilitarios',
    vendas:      'acc-body-vendas',
    horarios:    'acc-body-horarios',
    faturas:     'acc-body-faturas'
  };

  function collapseAccordion() {
    document.querySelectorAll('.adm-group.expanded').forEach(function (g) {
      g.classList.remove('expanded');
      var trigger = g.querySelector('.adm-mod-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleAccordion(name) {
    var bodyId = ACCORDION_BODIES[name];
    var body = bodyId ? document.getElementById(bodyId) : null;
    var group = body ? body.closest('.adm-group') : null;
    if (!group) return;

    var wasOpen = group.classList.contains('expanded');
    collapseAccordion();
    if (wasOpen) return;

    group.classList.add('expanded');
    var trigger = group.querySelector('.adm-mod-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');

    
    body.querySelectorAll('.adm-mod-card').forEach(function (c) {
      c.style.animation = 'none';
      c.offsetWidth; 
      c.style.animation = '';
    });
  }

  // ── Expostas para os módulos JS que auto-injetam o seu próprio cartão no
  // menu (editor-pdf.js, nucleo.js, ferias.js, banco-horas.js, tam.js) ──
  window.openModule = openModule;
  window.toggleAccordion = toggleAccordion;
  window.collapseAccordion = collapseAccordion;

  function _adminInitWireCards() {

    document.querySelectorAll('.adm-mod-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.module;
        if (mod) openModule(mod);
      });
    });

    
    document.querySelectorAll('[data-faturas-module]').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.faturasModule;
        if (mod) openModule(mod);
      });
    });

    
    document.querySelectorAll('[data-horarios-module]').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.horariosModule;
        if (mod) openModule(mod);
      });
    });

    
    document.querySelectorAll('[data-vendas-module]').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.vendasModule;
        if (mod) openModule(mod);
      });
    });

    
    var backBtn = document.getElementById('adm-back-btn');
    if (backBtn) backBtn.addEventListener('click', goToDashboard);
  }
  // Adaptado de DOMContentLoaded: este ficheiro carrega depois do login,
  // quando DOMContentLoaded já disparou há muito — sem este check os 6
  // cartões principais do dashboard (#adm-module-grid) e os botões de
  // voltar dos overlays ficariam sem clique.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _adminInitWireCards);
  } else {
    _adminInitWireCards();
  }
})();

// ══════════════════════════════════════════════════════════════
//  (fundido de index.html) — botão-atrás do browser fecha overlays
//  em vez de sair da SPA
// ══════════════════════════════════════════════════════════════
(function () {
  history.pushState({ appLayer: 0 }, '');

  window.addEventListener('popstate', function () {
    history.pushState({ appLayer: 0 }, '');

    var overlays = [
      { id: 'agenda-overlay',        close: function () { if (typeof closeAgendaOverlay === 'function') closeAgendaOverlay(); } },
      { id: 'rotulos-overlay',       close: function () { if (typeof closeRotulosOverlay === 'function') closeRotulosOverlay(); } },
      { id: 'processamento-overlay', close: function () { if (typeof closeProcessamentoOverlay === 'function') { closeProcessamentoOverlay(); document.body.classList.remove('no-glow'); } } },
      { id: 'recibos-overlay',       close: function () { if (typeof closeRecibosOverlay === 'function') closeRecibosOverlay(); } },
      { id: 'etiquetas-overlay',     close: function () { if (typeof closeEtiquetasOverlay === 'function') closeEtiquetasOverlay(); } },
      { id: 'ventas-overlay',        close: function () { if (typeof closeVentasOverlay === 'function') closeVentasOverlay(); } },
      { id: 'banco-horas-overlay',   close: function () { if (typeof closeBancoHorasOverlay === 'function') closeBancoHorasOverlay(); } }
    ];

    for (var i = 0; i < overlays.length; i++) {
      var el = document.getElementById(overlays[i].id);
      if (el && el.classList.contains('open')) {
        overlays[i].close();
        return;
      }
    }

    var backBtn = document.getElementById('adm-back-btn');
    if (backBtn) backBtn.click();
  });
})();

// ══════════════════════════════════════════════════════════════
//  Efeito de hover nos cartões do dashboard (.adm-mod-card): eleva e
//  amplia ligeiramente de forma UNIFORME — sem qualquer rotação/tilt
//  (propositadamente removido: inclinar o cartão fazia um lado subir
//  mais do que o outro, parecendo uma tábua solta). Física de mola
//  própria (não transições CSS lineares) para um movimento suave e
//  elegante. Só o MOVIMENTO vive aqui: as custom properties que este
//  módulo escreve (--lift/--scale/--shadow-*) são lidas em estilo.css.
//  A luz do hover é 100% CSS (.adm-mod-card:hover::before/::after) de
//  propósito — assim aparece mesmo que este ficheiro não corra. Delegação de eventos em document (um só listener, não
//  um por cartão): funciona para qualquer .adm-mod-card, incluindo as
//  injetadas mais tarde por nucleo.js/horarios.js/faturas.js/
//  utilitario.js, sem precisar re-vincular nada.
//  Desligado por completo em touch e com prefers-reduced-motion —
//  nesse caso as custom properties nunca saem dos valores de
//  repouso definidos em estilo.css e os cartões ficam idênticos
//  aos anteriores a este efeito. ──
// ══════════════════════════════════════════════════════════════
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var HOVER_LIFT   = 6;
  var HOVER_SCALE  = 1.016;

  function makeSpring(stiffness, damping, mass, initial) {
    var value = initial, target = initial, velocity = 0;
    return {
      set: function (v) { target = v; },
      tick: function (dt) {
        var accel = (-stiffness * (value - target) - damping * velocity) / mass;
        velocity += accel * dt;
        value += velocity * dt;
        return value;
      },
      get: function () { return value; },
      settled: function () {
        return Math.abs(target - value) < 0.0008 && Math.abs(velocity) < 0.0008;
      }
    };
  }

  var tracked = new Map();

  function entryFor(card) {
    var e = tracked.get(card);
    if (e) return e;
    e = {
      hover: makeSpring(350, 32, 0.9, 0),
      running: false,
      lastT: null
    };
    tracked.set(card, e);
    return e;
  }

  function render(card, e) {
    var hv = Math.max(0, e.hover.get());
    var s  = card.style;
    s.setProperty('--lift', (-hv * HOVER_LIFT).toFixed(2) + 'px');
    s.setProperty('--scale', (1 + hv * (HOVER_SCALE - 1)).toFixed(4));
    s.setProperty('--shadow-y', (4 + hv * 6).toFixed(2) + 'px');
    s.setProperty('--shadow-blur', (18 + hv * 16).toFixed(2) + 'px');
    s.setProperty('--shadow-spread', (-4 - hv * 5).toFixed(2) + 'px');
    s.setProperty('--shadow-alpha', (hv * 0.16).toFixed(3));
  }

  function step(card, e, now) {
    if (!card.isConnected) { tracked.delete(card); e.running = false; return; }
    var dt = e.lastT == null ? (1 / 60) : Math.min(0.05, Math.max(0, (now - e.lastT) / 1000));
    e.lastT = now;
    e.hover.tick(dt);
    render(card, e);
    if (e.hover.settled() && e.hover.get() <= 0.001) {
      e.running = false;
      e.lastT = null;
      return;
    }
    requestAnimationFrame(function (t) { step(card, e, t); });
  }

  function ensureRunning(card, e) {
    if (e.running) return;
    e.running = true;
    e.lastT = null;
    requestAnimationFrame(function (t) { step(card, e, t); });
  }

  document.addEventListener('pointerenter', function (ev) {
    if (ev.pointerType === 'touch') return;
    var card = ev.target.closest && ev.target.closest('.adm-mod-card');
    if (!card) return;
    var e = entryFor(card);
    e.hover.set(1);
    ensureRunning(card, e);
  }, true);

  document.addEventListener('pointerleave', function (ev) {
    if (ev.pointerType === 'touch') return;
    var card = ev.target.closest && ev.target.closest('.adm-mod-card');
    if (!card) return;
    var e = tracked.get(card);
    if (!e) return;
    e.hover.set(0);
    ensureRunning(card, e);
  }, true);
})();

// ═══════════ MARCADOR DE PRUEBA TEMPORAL — BORRAR DESPUÉS ═══════════
(function () {
  var b = document.createElement('div');
  b.textContent = 'ADMIN-INIT.JS NUEVO — CARGADO OK';
  b.style.cssText = 'position:fixed;top:52px;left:0;right:0;z-index:2147483647;background:#00e000;color:#000;font:900 20px/1.4 sans-serif;text-align:center;padding:14px;';
  function add() { document.body.appendChild(b); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
})();
