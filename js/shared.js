// ══════════════════════════════════════════════════════════════
//  SESSÃO — login unificado + relógios (login/empregada/admin)
// ══════════════════════════════════════════════════════════════
//  PÚBLICO: único ficheiro em PUBLIC_JS (middleware.js) além de
//  supabase-config.js/intro.js. Descarregável por QUALQUER visitante sem
//  sessão — é o que torna o próprio login possível (o browser precisa
//  deste código ANTES de teres cookie). Por isso deve conter só isto:
//  autenticação, cookie de sessão, relógios, e o arranque do carregamento
//  dos scripts protegidos. TODA a lógica de negócio (horários, cobertura,
//  painel admin) vive em nucleo.js, carregado a seguir ao login por
//  loadProtectedScripts() aqui em baixo, e NUNCA em PUBLIC_JS.
//  Índice:
//    1. Estado de sessão + rotação móvel
//    2. Relógios (login, dashboard empregada, dashboard admin)
//    3. attemptLogin — autenticação, cookie, carga dos scripts protegidos
//    4. Fade reload (clique no logótipo)
//    5. Greeting (saudação animada pós-login)
// ══════════════════════════════════════════════════════════════
(function(){

  let isLoggedIn = false;
  let currentStore = null;

  // — Rotación móvil —
  function checkOrientation() {
    if (!isLoggedIn) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('main-header').style.display  = 'none';
      document.getElementById('container-tables').style.display = 'none';
    }
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  // — Relojes —
  function updateTimeDateLogin() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    document.getElementById('current-time').innerHTML =
      h + '<span class="time-colon">:</span>' + m + '<span class="time-colon">:</span>' + s;
    document.getElementById('current-date').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateTimeDateLogin, 1000);
  updateTimeDateLogin();

  function updateTimeDateMain() {
    const now = new Date();
    document.getElementById('current-time-main').textContent = now.toLocaleTimeString('pt-PT',{hour12:false});
    document.getElementById('current-date-main').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateTimeDateMain, 1000);

  function updateAdminClock() {
    const now = new Date();
    document.getElementById('admin-time').textContent = now.toLocaleTimeString('pt-PT',{hour12:false});
    document.getElementById('admin-date').textContent = now.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'numeric',day:'numeric'});
  }
  setInterval(updateAdminClock, 1000);

  // — Login unificado — consulta claves en Supabase —
  async function attemptLogin() {
    const userKey = document.getElementById('key-input').value.trim();
    if (!userKey) return;

    // Bloquear botón mientras consulta
    const btn = document.getElementById('key-submit');
    btn.disabled = true;

    try {
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: userKey })
      });

      if (!loginRes.ok) {
        alert('Senha incorreta');
        document.getElementById('key-input').value = '';
        document.getElementById('key-input').focus();
        btn.disabled = false;
        return;
      }

      const data = await loginRes.json();
      const sessionToken = data.token;

      // Guardar token en cookie para el portero de /js/
      document.cookie = 'wkz_session=' + sessionToken + '; path=/; SameSite=Strict';

      // Cargar los JS protegidos ahora que la cookie está lista
      await (function loadProtectedScripts() {
        const scripts = [
          'js/nucleo.js',
          'js/session-lock.js',
          'js/agenda.js','js/rotulos.js','js/processamento.js',
          'js/admin-init.js','js/salarios.js','js/recibos.js',
          'js/ferias.js','js/editor-pdf.js',
          'js/tam.js','js/saft-reminder.js','js/gerador-horarios.js',
          'js/ventas-empleada.js','js/ventas-admin.js',
          'js/historico-admin.js','js/nadiya.js','js/parfois.js',
          'js/banco-horas.js'
        ];
        return scripts.reduce(function(p, src) {
          return p.then(function() {
            return new Promise(function(resolve, reject) {
              var s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              s.onerror = reject;
              document.body.appendChild(s);
            });
          });
        }, Promise.resolve());
      })();

      // Inicializar Supabase con credenciales del login — sin llamada extra
      await window.initSupabase(sessionToken, {
        url: data.url,
        key: data.key,
        adminToken: data.adminToken
      });

      isLoggedIn = true;

      if (data.rol === 'admin') {
        // ── LOGIN ADMIN ──
        if (window.__wkzAutoLogin) {
          // Silent auto-login — no sweep, no greeting, instant show
          window.__wkzAutoLogin = false;
          document.getElementById('login-screen').style.display = 'none';
          const adminApp = document.getElementById('admin-app');
          adminApp.classList.add('show');
          const adminHdr = document.getElementById('admin-header');
          adminHdr.classList.add('show');
          updateAdminClock();
          rLoadConfig();
          // Show elements immediately without animation
          adminApp.querySelectorAll('.reveal-item').forEach(function(el) {
            el.style.opacity = '1';
          });
          initSaftReminder();
        } else {
          sweepThen(function() {
            document.getElementById('login-screen').style.display = 'none';
            showGreeting(data.nombre || 'administração', function() {
              const adminApp = document.getElementById('admin-app');
              adminApp.classList.add('show');
              const adminHdr = document.getElementById('admin-header');
              adminHdr.classList.add('show');
              updateAdminClock();
              rLoadConfig();
              animateReveal(adminApp.querySelectorAll('.reveal-item'), 130);
              initSaftReminder();
            });
          });
        }

      } else if (data.rol === 'nadiya') {
        // ── LOGIN NADIYA ──
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.nombre || 'nadiya', function() {
            if (typeof openNadiyaOverlay === 'function') openNadiyaOverlay();
          });
        });

      } else {
        // ── LOGIN TIENDA ──
        currentStore = data.tienda;
        window._currentStoreGlobal = data.tienda;
        window._currentEmployeeName = (data.nombre || '').trim().toUpperCase();
        if (data.tienda === 'porto santo' && window._empRender && window._empRender.havPrefetch) window._empRender.havPrefetch();
        if (data.tienda === 'porto santo' && window._empRender && window._empRender.havUltimaPrefetch) window._empRender.havUltimaPrefetch();
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.nombre || data.tienda, function() {
            document.getElementById('main-header').classList.add('show');
            document.getElementById('main-header').style.display = 'flex';
            document.getElementById('container-tables').style.display = 'flex';
            animateReveal([
              document.querySelector('#main-header-center'),
              document.getElementById('container-tables')
            ], 150);
            window._empRender.loadData(currentStore);
          });
        });
      }

    } catch(err) {
      alert('Erro de ligação. Tenta novamente.');
      btn.disabled = false;
    }
  }

  document.getElementById('key-submit').addEventListener('click', attemptLogin);
  document.getElementById('key-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') attemptLogin();
  });

  // — Logo click → reload —


  // ── FADE RELOAD ──
  function fadeReload() {
    document.body.style.transition = 'opacity 0.5s ease';
    document.body.style.opacity = '0';
    setTimeout(function() { location.reload(); }, 520);
  }
  document.getElementById('main-logo').removeEventListener('click', null);
  document.getElementById('admin-logo').removeEventListener('click', null);
  document.getElementById('main-logo').onclick  = function(e){ e.preventDefault(); fadeReload(); };
  document.getElementById('admin-logo').onclick = function(e){ e.preventDefault(); fadeReload(); };

  // ── GREETING ──
  function showGreeting(label, callback) {
    const h = new Date().getHours();
    const greet = h < 12 ? 'bom dia' : h < 19 ? 'boa tarde' : 'boa noite';
    const sub   = label || 'wakzome';
    const el    = document.getElementById('greeting-overlay');
    const txt   = document.getElementById('greeting-text');
    const subtxt= document.getElementById('greeting-sub');
    txt.textContent  = greet;
    subtxt.textContent = sub;
    el.style.display = 'flex';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.classList.add('show');
        setTimeout(function() {
          el.classList.remove('show');
          setTimeout(function() {
            el.style.display = 'none';
            if (callback) callback();
          }, 550);
        }, 1400);
      });
    });
  }

})();

