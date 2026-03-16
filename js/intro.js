// ── INTRO: scatter → assemble animation ──
(function() {
  const word = 'wakzome';
  const el   = document.getElementById('dynamic-text');

  // Each letter gets a random origin far from center
  const origins = [
    { x: '-120vw', y: '-40vh',  r: '-180deg', s: '3',   blur: '12px' },
    { x:  '80vw',  y: '-80vh',  r:  '120deg', s: '0.3', blur: '16px' },
    { x: '-60vw',  y:  '90vh',  r: '-90deg',  s: '2',   blur: '10px' },
    { x:  '100vw', y:  '30vh',  r:  '200deg', s: '0.5', blur: '20px' },
    { x: '-90vw',  y: '-60vh',  r: '-150deg', s: '2.5', blur: '14px' },
    { x:  '60vw',  y:  '70vh',  r:  '80deg',  s: '0.4', blur: '18px' },
    { x: '-40vw',  y: '-100vh', r:  '160deg', s: '1.8', blur: '8px'  },
  ];

  const spans = [];
  word.split('').forEach(function(ch, i) {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    const o = origins[i];
    // Set scatter starting position
    span.style.transform = `translate(${o.x}, ${o.y}) rotate(${o.r}) scale(${o.s})`;
    span.style.filter    = `blur(${o.blur})`;
    span.style.color     = '#ccc';
    el.appendChild(span);
    spans.push({ span, origin: o });
  });

  // Staggered assembly — each letter flies in to its final position
  const baseDelay  = 180; // ms before first letter starts
  const stagger    = 90;  // ms between each letter
  const duration   = 820; // ms for each letter transition
  const easing     = 'cubic-bezier(0.16, 1, 0.3, 1)';

  spans.forEach(function(item, i) {
    const span = item.span;
    const delay = baseDelay + i * stagger;

    setTimeout(function() {
      span.style.transition = [
        `transform ${duration}ms ${easing}`,
        `filter ${duration}ms ${easing}`,
        `color ${duration * 1.2}ms ${easing}`,
        `opacity 120ms ease`
      ].join(', ');
      span.style.opacity   = '1';
      span.style.transform = 'translate(0,0) rotate(0deg) scale(1)';
      span.style.filter    = 'blur(0px)';
      span.style.color     = '#222';
    }, delay);
  });

  // Draw line after all letters have landed
  const lineDelay = baseDelay + word.length * stagger + duration * 0.6;
  setTimeout(function() {
    const line = document.getElementById('intro-line');
    if (line) line.classList.add('draw');
  }, lineDelay);

})();

// Global reveal utility
function animateReveal(elements, staggerMs) {
  staggerMs = staggerMs || 110;
  Array.from(elements).forEach(function(el, i) {
    el.style.animationDelay = (i * staggerMs) + 'ms';
    el.classList.add('in');
  });
}

// Recibos overlay
var _recibosData = null; // cache de los PDFs cargados

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
    // Leer index.json desde Supabase Storage
    var { data: indexData, error: indexError } = await supabase
      .storage.from('recibos').download('index.json');
    if (indexError) throw new Error('Sem recibos disponíveis de momento.');
    var idx = JSON.parse(await indexData.text());
    // idx = { mes: "03-2026", ficheiros: ["nome.pdf", ...], dados: [{filename, b64}, ...] }

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

  // Generar URL firmada (válida 60 segundos) para descargar el PDF privado
  var path = item.mes + '/' + item.filename;
  var { data, error } = await supabase.storage.from('recibos').createSignedUrl(path, 60);
  if (error || !data) { alert('Erro ao descarregar o recibo.'); return; }

  var a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = item.filename;
  a.click();
}




// ── SWEEP LINE ──
function sweepThen(callback) {
  var line = document.getElementById('sweep-line');
  line.classList.remove('sweep');
  void line.offsetWidth; // reflow
  line.classList.add('sweep');
  setTimeout(callback, 420);
  setTimeout(function() { line.classList.remove('sweep'); }, 800);
}

window.addEventListener("load", function() {
  setTimeout(function() {
    var intro = document.getElementById("intro-screen");
    intro.style.opacity = "0";
    setTimeout(function() {
      if (intro.parentNode) intro.remove();
      var loginScreen = document.getElementById('login-screen');
      // pequeño delay para que el browser pinte opacity:0 antes de la transición
      setTimeout(function() {
        loginScreen.classList.add('visible');
        // trigger stagger animations for login items
        loginScreen.querySelectorAll('.login-item').forEach(function(el) {
          el.style.animationPlayState = 'running';
        });
      }, 50);
      document.getElementById('key-input').focus();
    }, 2100);
  }, 1000);
});
