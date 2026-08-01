// ── INTRO: rise → settle → rise out animation ──
(function() {
  const word = 'wakzome';
  const el   = document.getElementById('dynamic-text');

  // Inject !important color override via <style>
  var forceStyle = document.createElement('style');
  forceStyle.textContent =
    '#dynamic-text, #dynamic-text * {' +
    '  color: #ffffff !important;' +
    '}';
  document.head.appendChild(forceStyle);

  if (el) {
    el.style.fontSize       = 'clamp(3rem, 10vw, 6rem)';
    el.style.fontWeight     = '300';
    el.style.letterSpacing  = '0.12em';
    el.style.display        = 'flex';
    el.style.justifyContent = 'center';
    el.style.alignItems     = 'center';
  }

  // Render word as single element for clean unified motion
  const span = document.createElement('span');
  span.textContent      = word;
  span.style.display    = 'inline-block';
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