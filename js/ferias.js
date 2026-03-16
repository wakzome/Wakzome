// ══ FÉRIAS TAB ══
(function() {

  // ── DATA ──
  const FERIAS = [
    // Porto Santo — Período 1
    { nome:'CARLA ALVES',       de:'12/03/2026', ate:'26/03/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',     de:'27/03/2026', ate:'13/04/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',        de:'29/04/2026', ate:'14/05/2026', loja:'Porto Santo' },
    { nome:'SANDRA MELIM',      de:'05/01/2026', ate:'25/01/2026', loja:'Porto Santo' },
    // Porto Santo — Período 2
    { nome:'SANDRA MELIM',      de:'14/09/2026', ate:'28/09/2026', loja:'Porto Santo' },
    { nome:'MARILIA SILVA',     de:'29/09/2026', ate:'14/10/2026', loja:'Porto Santo' },
    { nome:'CARLA ALVES',       de:'15/10/2026', ate:'29/10/2026', loja:'Porto Santo' },
    { nome:'EDNA MELIM',        de:'30/10/2026', ate:'13/11/2026', loja:'Porto Santo' },
    // Funchal — Período 1
    { nome:'FERNANDA GONÇALVES',de:'05/01/2026', ate:'19/01/2026', loja:'Funchal' },
    { nome:'FERNANDA GONÇALVES',de:'20/01/2026', ate:'03/02/2026', loja:'Funchal' },
    { nome:'CRISTINA TEIXEIRA', de:'04/02/2026', ate:'18/02/2026', loja:'Funchal' },
    { nome:'JOANA BAPTISTA',    de:'19/02/2026', ate:'05/03/2026', loja:'Funchal' },
    { nome:'SANDRA SOUSA',      de:'06/03/2026', ate:'20/03/2026', loja:'Funchal' },
    { nome:'FILIPA RODRIGUES',  de:'23/03/2026', ate:'08/04/2026', loja:'Funchal' },
    { nome:'CATIA TEMTEM',      de:'09/04/2026', ate:'23/04/2026', loja:'Funchal' },
    { nome:'DEBORA FERNANDES',  de:'24/04/2026', ate:'11/05/2026', loja:'Funchal' },
    { nome:'PATRICIA SILVA',    de:'12/05/2026', ate:'26/05/2026', loja:'Funchal' },
    { nome:'JACINTA ALVES',     de:'27/05/2026', ate:'12/06/2026', loja:'Funchal' },
    { nome:'ISALTINA FERNANDES',de:'15/06/2026', ate:'30/06/2026', loja:'Funchal' },
    // Funchal — Período 2
    { nome:'ALEJANDRA ABREU',   de:'02/07/2026', ate:'16/07/2026', loja:'Funchal' },
    { nome:'JOANA BAPTISTA',    de:'17/07/2026', ate:'31/07/2026', loja:'Funchal' },
    { nome:'DEBORA FERNANDES',  de:'03/08/2026', ate:'17/08/2026', loja:'Funchal' },
    { nome:'CRISTINA TEIXEIRA', de:'18/08/2026', ate:'02/09/2026', loja:'Funchal' },
    { nome:'SANDRA SOUSA',      de:'03/09/2026', ate:'17/09/2026', loja:'Funchal' },
    { nome:'ISALTINA FERNANDES',de:'18/09/2026', ate:'02/10/2026', loja:'Funchal' },
    { nome:'PATRICIA SILVA',    de:'06/10/2026', ate:'20/10/2026', loja:'Funchal' },
    { nome:'CATIA TEMTEM',      de:'21/10/2026', ate:'04/11/2026', loja:'Funchal' },
    { nome:'ALEJANDRA ABREU',   de:'05/11/2026', ate:'19/11/2026', loja:'Funchal' },
    { nome:'FILIPA RODRIGUES',  de:'03/08/2026', ate:'17/08/2026', loja:'Funchal' },
    { nome:'JACINTA ALVES',     de:'18/08/2026', ate:'02/09/2026', loja:'Funchal' },
  ];

  function parseDate(str) {
    const p = str.split('/');
    return new Date(+p[2], +p[1]-1, +p[0]);
  }
  function formatDate(str) {
    const p = str.split('/');
    return p[0]+'/'+p[1];
  }
  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function renderFerias() {
    const today    = new Date();
    today.setHours(0,0,0,0);
    const area     = document.getElementById('f-area');
    const banner   = document.getElementById('f-today-banner');
    const bannerNames = document.getElementById('f-banner-names');
    if (!area) return;

    // Classify each entry
    const enriched = FERIAS.map(function(f) {
      const de  = parseDate(f.de);
      const ate = parseDate(f.ate);
      ate.setHours(23,59,59,999);
      let status, days;
      if (today >= de && today <= ate) {
        status = 'active';
        days   = daysBetween(today, ate);
      } else if (de > today) {
        status = 'upcoming';
        days   = daysBetween(today, de);
      } else {
        status = 'past';
        days   = daysBetween(ate, today);
      }
      return Object.assign({}, f, { de, ate, status, days });
    });

    // Today banner
    const activeNow = enriched.filter(function(f){ return f.status==='active'; });
    if (activeNow.length) {
      const unique = [...new Set(activeNow.map(function(f){ return f.nome; }))];
      bannerNames.textContent = unique.join(' · ');
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }

    // Sort upcoming by date
    const upcoming = enriched.filter(function(f){ return f.status==='upcoming'; })
      .sort(function(a,b){ return a.de-b.de; });

    // Recent past (last 30 days)
    const recent = enriched.filter(function(f){ return f.status==='past' && f.days<=30; })
      .sort(function(a,b){ return a.days-b.days; });

    function fmtDays(n, status) {
      if (status==='active')   return n===0 ? 'último dia' : 'termina em '+n+'d';
      if (status==='upcoming') return n===1 ? 'amanhã' : 'em '+n+' dias';
      if (status==='past')     return 'há '+n+' dias';
      return '';
    }

    function cardHTML(f) {
      const dotColor = f.status==='active' ? '#2a8a2a' : f.status==='upcoming' ? '#e09000' : '#ddd';
      const badgeCls = f.status==='active' ? 'active-now' : f.status==='upcoming' ? 'soon' : 'past';
      const lojaTag  = f.loja ? '<span style="font-size:.65rem;font-weight:600;color:#bbb;margin-left:6px;text-transform:lowercase;letter-spacing:.04em">'+f.loja+'</span>' : '';
      const deStr    = f.de.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      const ateStr   = f.ate.toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'});
      return '<div class="f-card">'
        + '<span class="f-dot" style="background:'+dotColor+'"></span>'
        + '<span class="f-name">'+f.nome+lojaTag+'</span>'
        + '<span class="f-dates">'+deStr+'&nbsp;→&nbsp;'+ateStr+'</span>'
        + '<span class="f-badge '+badgeCls+'">'+fmtDays(f.days, f.status)+'</span>'
        + '</div>';
    }

    let html = '';

    if (activeNow.length) {
      html += '<div class="f-section"><div class="f-section-title">🟢 de férias agora</div>';
      html += activeNow.map(cardHTML).join('');
      html += '</div>';
    }

    if (upcoming.length) {
      const next7  = upcoming.filter(function(f){ return f.days<=7; });
      const next30 = upcoming.filter(function(f){ return f.days>7  && f.days<=30; });
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

    if (!html) {
      html = '<div style="text-align:center;color:#aaa;font-size:.85rem;font-weight:600;padding:40px 0">nenhuma férias registada</div>';
    }

    area.innerHTML = html;
  }

  // Render when tab is clicked
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.dataset.tab === 'ferias') renderFerias();
    });
  });

  // Auto-refresh every hour
  setInterval(function() {
    const active = document.querySelector('.tab-btn[data-tab="ferias"].active');
    if (active) renderFerias();
  }, 3600000);

})();
