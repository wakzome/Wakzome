// ── INTRO: scatter → assemble animation ──
(function() {
  const word = 'wakzome';
  const el   = document.getElementById('dynamic-text');

  // Ajuste de estilo para que coincida con la imagen (Grande y centrado)
  if (el) {
    el.style.fontSize = 'clamp(3rem, 10vw, 6rem)'; // Tamaño responsivo similar a la captura
    el.style.fontWeight = '300'; // Estilo fino/elegante
    el.style.letterSpacing = '0.05em';
    el.style.display = 'flex';
    el.style.justifyContent = 'center';
    el.style.alignItems = 'center';
  }

  // Cada letra con orígenes aleatorios (ajustados para mayor escala)
  const origins = [
    { x: '-120vw', y: '-40vh',  r: '-180deg', s: '5',   blur: '15px' },
    { x:  '80vw',  y: '-80vh',  r:  '120deg', s: '0.3', blur: '20px' },
    { x: '-60vw',  y:  '90vh',  r: '-90deg',  s: '4',   blur: '12px' },
    { x:  '100vw', y:  '30vh',  r:  '200deg', s: '0.5', blur: '25px' },
    { x: '-90vw',  y: '-60vh',  r: '-150deg', s: '4.5', blur: '18px' },
    { x:  '60vw',  y:  '70vh',  r:  '80deg',  s: '0.4', blur: '22px' },
    { x: '-40vw',  y: '-100vh', r:  '160deg', s: '3.5', blur: '10px' },
  ];

  const spans = [];
  word.split('').forEach(function(ch, i) {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    const o = origins[i] || origins[0];
    
    // Estilos iniciales (dispersos)
    span.style.display   = 'inline-block';
    span.style.transform = `translate(${o.x}, ${o.y}) rotate(${o.r}) scale(${o.s})`;
    span.style.filter    = `blur(${o.blur})`;
    span.style.opacity   = '0';
    span.style.color     = '#fff'; // Color blanco para resaltar sobre fondo negro
    
    el.appendChild(span);
    spans.push({ span, origin: o });
  });

  // Staggered assembly
  const baseDelay  = 200; 
  const stagger    = 100;  
  const duration   = 950; // Un poco más lento para notar la magnitud del tamaño
  const easing     = 'cubic-bezier(0.16, 1, 0.3, 1)';

  spans.forEach(function(item, i) {
    const span = item.span;
    const delay = baseDelay + i * stagger;

    setTimeout(function() {
      span.style.transition = [
        `transform ${duration}ms ${easing}`,
        `filter ${duration}ms ${easing}`,
        `color ${duration * 1.2}ms ${easing}`,
        `opacity ${duration}ms ease`
      ].join(', ');
      
      span.style.opacity   = '1';
      span.style.transform = 'translate(0,0) rotate(0deg) scale(1)';
      span.style.filter    = 'blur(0px)';
      span.style.color     = '#ffffff'; 
    }, delay);
  });

  const lineDelay = baseDelay + word.length * stagger + duration * 0.6;
  setTimeout(function() {
    const line = document.getElementById('intro-line');
    if (line) line.classList.add('draw');
  }, lineDelay);

  // ── Elegant disappear: pause to read, then dissolve upward ──
  const assembleEnd = baseDelay + word.length * stagger + duration;
  const pauseAfter  = 600;   // tiempo visible tras ensamblaje
  const exitDur     = 700;   // duración de la desaparición

  setTimeout(function() {
    spans.forEach(function(item, i) {
      var span = item.span;
      var revStagger = (spans.length - 1 - i) * 55; // orden invertido
      setTimeout(function() {
        span.style.transition = [
          'transform ' + exitDur + 'ms cubic-bezier(0.4, 0, 0.2, 1)',
          'opacity '   + exitDur + 'ms cubic-bezier(0.4, 0, 0.2, 1)',
          'filter '    + exitDur + 'ms cubic-bezier(0.4, 0, 0.2, 1)'
        ].join(', ');
        span.style.transform = 'translateY(-28px) scale(0.92)';
        span.style.opacity   = '0';
        span.style.filter    = 'blur(8px)';
      }, revStagger);
    });

    // fade out the line too
    setTimeout(function() {
      var line = document.getElementById('intro-line');
      if (line) {
        line.style.transition = 'opacity ' + exitDur + 'ms ease';
        line.style.opacity    = '0';
      }
    }, 80);

  }, assembleEnd + pauseAfter);

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