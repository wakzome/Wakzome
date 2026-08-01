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
          'js/agenda.js','js/rotulos.js','js/processamento.js',
          'js/admin-init.js','js/ordenados.js',
          'js/ferias.js','js/editor-pdf.js',
          'js/tam.js','js/saft-reminder.js','js/gerador-horarios.js',
          'js/ventas.js',
          'js/nadiya.js','js/parfois.js',
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

      await window.initSupabase(sessionToken, {
        url: data.url,
        key: data.key,
        adminToken: data.adminToken
      });

      isLoggedIn = true;
      hideAuthenticating();

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
