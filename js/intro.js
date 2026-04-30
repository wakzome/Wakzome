// ── INTRO: rise → settle → rise out animation ──
(function() {
  const word = 'wakzome';
  const el   = document.getElementById('dynamic-text');

  if (el) {
    el.style.fontSize      = 'clamp(3rem, 10vw, 6rem)';
    el.style.fontWeight    = '300';
    el.style.letterSpacing = '0.12em';
    el.style.display       = 'flex';
    el.style.justifyContent = 'center';
    el.style.alignItems    = 'center';
  }

  // Render word as single element for clean unified motion
  const span = document.createElement('span');
  span.textContent = word;
  span.style.display    = 'inline-block';
  span.style.color      = '#ffffff';
  span.style.opacity    = '0';
  span.style.transform  = 'translateY(38px)';
  span.style.filter     = 'blur(6px)';
  span.style.willChange = 'transform, opacity, filter';
  el.appendChild(span);

  const riseIn   = 1100; // ms to rise into center
  const easeIn   = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const holdMs   = 900;  // how long it stays visible and still
  const riseOut  = 800;  // ms to rise and fade out
  const easeOut  = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // Phase 1 — rise in from below, settle to center
  setTimeout(function() {
    span.style.transition = [
      'transform ' + riseIn + 'ms ' + easeIn,
      'opacity '   + riseIn + 'ms ' + easeIn,
      'filter '    + riseIn + 'ms ' + easeIn
    ].join(', ');
    span.style.opacity   = '1';
    span.style.transform = 'translateY(0px)';
    span.style.filter    = 'blur(0px)';
  }, 200);

  // Phase 2 — after hold, rise up and dissolve
  setTimeout(function() {
    span.style.transition = [
      'transform ' + riseOut + 'ms ' + easeOut,
      'opacity '   + riseOut + 'ms ' + easeOut,
      'filter '    + riseOut + 'ms ' + easeOut
    ].join(', ');
    span.style.opacity   = '0';
    span.style.transform = 'translateY(-22px)';
    span.style.filter    = 'blur(5px)';

    // fade the line too
    var line = document.getElementById('intro-line');
    if (line) {
      line.style.transition = 'opacity ' + riseOut + 'ms ' + easeOut;
      line.style.opacity    = '0';
    }
  }, 200 + riseIn + holdMs);

  // Draw the line after word settles
  setTimeout(function() {
    var line = document.getElementById('intro-line');
    if (line) line.classList.add('draw');
  }, 200 + riseIn * 0.7);

})();

// --- Funciones de utilidad se mantienen igual ---
function animateReveal(elements, staggerMs) {
  staggerMs = staggerMs || 110;
  Array.from(elements).forEach(function(el, i) {
    el.style.animationDelay = (i * staggerMs) + 'ms';
    el.classList.add('in');
  });
}

function openRecibosOverlay() {
  var overlay = document.getElementById('recibos-overlay');
  overlay.classList.add('open');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { overlay.classList.add('visible'); });
  });
  _loadRecibosIndex();
}

function closeRecibosOverlay() {
  var overlay = document.getElementById('recibos-overlay');
  overlay.classList.remove('visible');
  setTimeout(function() { overlay.classList.remove('open'); }, 650);
}

var MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

async function _loadRecibosIndex() {
  var loading = document.getElementById('recibos-overlay-loading');
  var body    = document.getElementById('recibos-overlay-body');
  var errEl   = document.getElementById('recibos-overlay-error');
  var titleBar= document.getElementById('recibos-overlay-title');
  loading.style.display = 'block';
  body.style.display    = 'none';
  errEl.style.display   = 'none';

  try {
    var { data: indexData, error: indexError } = await sbClient
      .storage.from('recibos').download('index.json');
    if (indexError) throw new Error('Sem recibos disponíveis de momento.');
    var idx = JSON.parse(await indexData.text());

    var mes     = idx.mes || '';
    var parts   = mes.split('-');
    var mesNum  = parseInt(parts[0], 10);
    var ano     = parts[1] || '';
    var mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES_PT[mesNum - 1] : mes;
    var titulo  = mesNome ? ('recibos ' + mesNome + ' ' + ano) : 'recibos';

    document.getElementById('recibos-page-title').textContent = titulo;
    titleBar.textContent = titulo;

    var tbody = document.getElementById('recibos-tbody');
    tbody.innerHTML = '';
    _recibosData = idx.dados || [];

    _recibosData.forEach(function(item, i) {
      var tr  = document.createElement('tr');
      var td1 = document.createElement('td'); td1.className = 'rn'; td1.textContent = i + 1;
      var td2 = document.createElement('td'); td2.textContent = (item.name || item.filename.replace('.pdf','').replace(/_/g,' ').toUpperCase());
      var td3 = document.createElement('td');
      var btn = document.createElement('button');
      btn.textContent = '⬇ pdf';
      btn.onclick = (function(idx) { return function() { _downloadRecibo(idx); }; })(i);
      td3.appendChild(btn);
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });

    loading.style.display = 'none';
    body.style.display    = 'flex';
  } catch(e) {
    loading.style.display = 'none';
    errEl.style.display   = 'block';
    errEl.textContent     = e.message || 'Erro ao carregar recibos.';
  }
}

async function _downloadRecibo(i) {
  var item = _recibosData[i];
  if (!item) return;

  var path = item.mes + '/' + item.filename;
  var { data, error } = await sbClient.storage.from('recibos').createSignedUrl(path, 60);
  if (error || !data) { alert('Erro ao descarregar o recibo.'); return; }

  var a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = item.filename;
  a.click();
}

function sweepThen(callback) {
  var line = document.getElementById('sweep-line');
  line.classList.remove('sweep');
  void line.offsetWidth; 
  line.classList.add('sweep');
  setTimeout(callback, 420);
  setTimeout(function() { line.classList.remove('sweep'); }, 800);
}

window.addEventListener("load", function() {
  setTimeout(function() {
    var intro = document.getElementById("intro-screen");
    if(intro) {
      intro.style.opacity = "0";
      setTimeout(function() {
        if (intro.parentNode) intro.remove();
        var loginScreen = document.getElementById('login-screen');
        setTimeout(function() {
          if(loginScreen) {
            loginScreen.classList.add('visible');
            loginScreen.querySelectorAll('.login-item').forEach(function(el) {
              el.style.animationPlayState = 'running';
            });
          }
        }, 50);
        var keyInput = document.getElementById('key-input');
        if(keyInput) keyInput.focus();
      }, 2100);
    }
  }, 1000);
});