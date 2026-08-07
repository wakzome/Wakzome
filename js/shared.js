(function(){

  let isLoggedIn = false;
  let currentStore = null;

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

  function showAuthenticating() {
    let container = document.getElementById('wkz-auth-wave');
    if (!container) {
      if (!document.getElementById('wkz-auth-wave-style')) {
        const style = document.createElement('style');
        style.id = 'wkz-auth-wave-style';
        style.textContent =
          '#wkz-auth-wave{margin-top:14px;display:flex;justify-content:center;align-items:center;gap:7px;}' +
          '#wkz-auth-wave span{width:7px;height:7px;border-radius:50%;background:#444;opacity:.25;animation:wkzAuthDot 1.8s ease-in-out infinite;}' +
          '@keyframes wkzAuthDot{0%,60%,100%{opacity:.25;transform:scale(.8);}30%{opacity:1;transform:scale(1);}}';
        document.head.appendChild(style);
      }
      container = document.createElement('div');
      container.id = 'wkz-auth-wave';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.style.animationDelay = (i * 400) + 'ms';
        container.appendChild(dot);
      }
      const host = document.getElementById('key-input-container');
      if (!host || !host.parentNode) return;
      host.parentNode.insertBefore(container, host.nextSibling);
    }
    container.style.display = 'flex';
  }

  function hideAuthenticating() {
    const container = document.getElementById('wkz-auth-wave');
    if (container) container.style.display = 'none';
  }

  // ── Movido de intro.js / supabase-config.js (fusão) ──
  function animateReveal(elements, staggerMs) {
    staggerMs = staggerMs || 110;
    Array.from(elements).forEach(function(el, i) {
      el.style.animationDelay = (i * staggerMs) + 'ms';
      el.classList.add('in');
    });
  }
  window.animateReveal = animateReveal;

  function sweepThen(callback) {
    var line = document.getElementById('sweep-line');
    line.classList.remove('sweep');
    void line.offsetWidth; 
    line.classList.add('sweep');
    setTimeout(callback, 420);
    setTimeout(function() { line.classList.remove('sweep'); }, 800);
  }
  window.sweepThen = sweepThen;

  // ══════════════════════════════════════════════════════════════
  //  SUPABASE — configuración central
  //
  //  Nota: la autenticación de la app es propia (login → /api/config
  //  + cabecera x-admin-token). NO se usa Supabase Auth (GoTrue) para
  //  sesiones de usuario. Por eso ambos clientes desactivan la
  //  persistencia/refresco de sesión y usan storageKey distintos:
  //  así se elimina el aviso "Multiple GoTrueClient instances detected"
  //  y el estado de auth/Realtime compartido que lo provoca.
  // ══════════════════════════════════════════════════════════════
  async function initSupabase(sessionToken, credentials) {
    let url, key, adminToken;
    if (credentials) {
      // Usar credenciales recibidas directamente del login — sin llamada extra
      url        = credentials.url;
      key        = credentials.key;
      adminToken = credentials.adminToken;
    } else {
      // Fallback: pedir credenciales al servidor
      const res = await fetch('/api/config', {
        headers: { 'x-session-token': sessionToken }
      });
      if (!res.ok) throw new Error('No autorizado');
      const data = await res.json();
      url        = data.url;
      key        = data.key;
      adminToken = data.adminToken;
    }
    window.SUPABASE_URL = url;
    window.SUPABASE_KEY = key;
    window.ADMIN_TOKEN  = adminToken;

    // Opciones de auth comunes: sin sesión GoTrue persistente ni auto-refresh.
    // Cada cliente lleva un storageKey único para no colisionar entre sí.
    const baseAuth = {
      persistSession:   false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    };

    window.sbClient = window.supabase.createClient(url, key, {
      auth: Object.assign({ storageKey: 'wakzome-sb-client' }, baseAuth)
    });

    window.sbAdmin = window.supabase.createClient(url, key, {
      auth: Object.assign({ storageKey: 'wakzome-sb-admin' }, baseAuth),
      global: { headers: { 'x-admin-token': adminToken } }
    });

    // Avisa quem estava à espera (ex.: tam.js, se sbAdmin ainda não existia
    // na 1ª carga de sessões) de que sbClient/sbAdmin já estão prontos.
    window.dispatchEvent(new Event('wz:supabase-ready'));
  }
  window.initSupabase = initSupabase;

  async function attemptLogin() {
    const userKey = document.getElementById('key-input').value.trim();
    if (!userKey) return;

    const btn = document.getElementById('key-submit');
    btn.disabled = true;
    showAuthenticating();

    try {
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: userKey })
      });

      if (!loginRes.ok) {
        hideAuthenticating();
        alert('Senha incorreta');
        document.getElementById('key-input').value = '';
        document.getElementById('key-input').focus();
        btn.disabled = false;
        return;
      }

      const data = await loginRes.json();
      const sessionToken = data.token;

      document.cookie = 'wkz_session=' + sessionToken + '; path=/; SameSite=Strict';

      await (function loadProtectedScripts() {
        const scripts = [
          'js/nucleo.js',
          'js/session-lock.js',
          'js/utilitario.js','js/faturas.js',
          'js/admin-init.js','js/ordenados.js',
          'js/horarios.js',
          'js/tam.js',
          'js/ventas.js',
          'js/nadiya.js','js/parfois.js'
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

      await window.initSupabase(sessionToken, {
        url: data.url,
        key: data.key,
        adminToken: data.adminToken
      });

      isLoggedIn = true;
      hideAuthenticating();

      // Reset defensivo: o admin-app nunca deve arrancar visível, nem com
      // módulo/painel aberto, de uma sessão anterior na mesma aba — antes
      // de decidir, pelo papel (rol) atual, o que deve mesmo ficar visível.
      // Sem isto, um login de funcionária podia herdar admin-app.show de
      // uma sessão de admin anterior e mostrar os módulos de administração.
      var adminAppReset = document.getElementById('admin-app');
      if (adminAppReset) adminAppReset.classList.remove('show', 'module-open', 'vendas-open', 'historico-open');

      if (data.rol === 'admin') {
        if (window.__wkzAutoLogin) {
          window.__wkzAutoLogin = false;
          document.getElementById('login-screen').style.display = 'none';
          const adminApp = document.getElementById('admin-app');
          adminApp.classList.add('show');
          const adminHdr = document.getElementById('admin-header');
          adminHdr.classList.add('show');
          updateAdminClock();
          rLoadConfig();
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
        sweepThen(function() {
          document.getElementById('login-screen').style.display = 'none';
          showGreeting(data.nombre || 'nadiya', function() {
            if (typeof openNadiyaOverlay === 'function') openNadiyaOverlay();
          });
        });

      } else {
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
      hideAuthenticating();
      alert('Erro de ligação. Tenta novamente.');
      btn.disabled = false;
    }
  }

  document.getElementById('key-submit').addEventListener('click', attemptLogin);
  document.getElementById('key-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') attemptLogin();
  });

  function fadeReload() {
    document.body.style.transition = 'opacity 0.5s ease';
    document.body.style.opacity = '0';
    setTimeout(function() { location.reload(); }, 520);
  }
  document.getElementById('main-logo').removeEventListener('click', null);
  document.getElementById('admin-logo').removeEventListener('click', null);
  document.getElementById('main-logo').onclick  = function(e){ e.preventDefault(); fadeReload(); };
  document.getElementById('admin-logo').onclick = function(e){ e.preventDefault(); fadeReload(); };

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
