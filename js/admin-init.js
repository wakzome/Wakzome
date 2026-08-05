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
    
    if (tab === 'faturas') { openFaturasOverlay(); return; }

    
    if (tab === 'horarios-group') { openHorariosOverlay(); return; }

    
    if (tab === 'vendas-group') { openVendasOverlay(); return; }

    
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

    
    document.querySelectorAll('.adm-mod-card').forEach(function (c, i) {
      c.style.animation = 'none';
      c.offsetWidth; 
      c.style.animation = '';
      c.style.animationDelay = (0.05 + i * 0.05) + 's';
    });
  }

  
  function openFaturasOverlay() {
    var ov = document.getElementById('faturas-overlay');
    if (!ov) return;
    ov.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.classList.add('visible');
        
        ov.querySelectorAll('.adm-mod-card').forEach(function (c, i) {
          c.style.animation = 'none';
          c.offsetWidth;
          c.style.animation = '';
          c.style.animationDelay = (0.05 + i * 0.07) + 's';
        });
      });
    });
  }

  function closeFaturasOverlay() {
    var ov = document.getElementById('faturas-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    setTimeout(function () { ov.classList.remove('open'); }, 460);
  }

  function openHorariosOverlay() {
    var ov = document.getElementById('horarios-overlay');
    if (!ov) return;
    ov.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.classList.add('visible');
        ov.querySelectorAll('.adm-mod-card').forEach(function (c, i) {
          c.style.animation = 'none';
          c.offsetWidth;
          c.style.animation = '';
          c.style.animationDelay = (0.05 + i * 0.07) + 's';
        });
      });
    });
  }

  function closeHorariosOverlay() {
    var ov = document.getElementById('horarios-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    setTimeout(function () { ov.classList.remove('open'); }, 460);
  }

  function openVendasOverlay() {
    var ov = document.getElementById('vendas-overlay');
    if (!ov) return;
    ov.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.classList.add('visible');
        ov.querySelectorAll('.adm-mod-card').forEach(function (c, i) {
          c.style.animation = 'none';
          c.offsetWidth;
          c.style.animation = '';
          c.style.animationDelay = (0.05 + i * 0.07) + 's';
        });
      });
    });
  }

  function closeVendasOverlay() {
    var ov = document.getElementById('vendas-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    setTimeout(function () { ov.classList.remove('open'); }, 460);
  }

  // ── Expostas para os módulos JS que auto-injetam o seu próprio cartão no
  // menu (editor-pdf.js, nucleo.js, ferias.js, banco-horas.js, tam.js) ──
  window.openModule = openModule;
  window.closeHorariosOverlay = closeHorariosOverlay;
  window.closeFaturasOverlay = closeFaturasOverlay;

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
        if (!mod) return;
        closeFaturasOverlay();
        
        setTimeout(function () { openModule(mod); }, 200);
      });
    });

    
    document.querySelectorAll('[data-horarios-module]').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.horariosModule;
        if (!mod) return;
        closeHorariosOverlay();
        setTimeout(function () { openModule(mod); }, 200);
      });
    });

    
    document.querySelectorAll('[data-vendas-module]').forEach(function (card) {
      card.addEventListener('click', function () {
        var mod = card.dataset.vendasModule;
        if (!mod) return;
        closeVendasOverlay();
        setTimeout(function () { openModule(mod); }, 200);
      });
    });

    
    var fatBack = document.getElementById('faturas-overlay-back');
    if (fatBack) fatBack.addEventListener('click', closeFaturasOverlay);

    
    var horBack = document.getElementById('horarios-overlay-back');
    if (horBack) horBack.addEventListener('click', closeHorariosOverlay);

    
    var venBack = document.getElementById('vendas-overlay-back');
    if (venBack) venBack.addEventListener('click', closeVendasOverlay);

    
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
      { id: 'banco-horas-overlay',   close: function () { if (typeof closeBancoHorasOverlay === 'function') closeBancoHorasOverlay(); } },
      { id: 'horarios-overlay',      close: function () { var btn = document.getElementById('horarios-overlay-back'); if (btn) btn.click(); } },
      { id: 'faturas-overlay',       close: function () { var btn = document.getElementById('faturas-overlay-back'); if (btn) btn.click(); } },
      { id: 'vendas-overlay',        close: function () { var btn = document.getElementById('vendas-overlay-back'); if (btn) btn.click(); } }
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
