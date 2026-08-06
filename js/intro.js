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

// ══════════════════════════════════════════════════════════════
//  (fundido de index.html) — vinheta em overlays, transição "wipe",
//  sistema de som (WZ_SFX, usado também por nucleo.js), ambiente dia/
//  tarde, parallax do cabeçalho e 2 easter eggs (logo x3, Konami).
//  Antes vivia num <script> inline no fim do <body>, onde já corria
//  depois de todo o HTML estático existir. Aqui carrega cedo (ainda
//  antes do login), por isso todo o arranque (_fxInit) espera pelo
//  mesmo guard de readyState que já protegia initCinematicIntro —
//  sem isso, elementos definidos mais abaixo no HTML (ex.:
//  #recibos-overlay) ainda não existiriam quando o código corresse.
//
//  Nota (não alterado, apenas identificado): o efeito glitch/chromatic
//  dentro de initCinematicIntro observa elementos '.char', que nenhum
//  script atual (incluindo este ficheiro) chega a criar — parece
//  código vestigial de uma versão anterior da intro, com efeito por
//  carácter. Mantido tal como estava; a decidir se ainda faz sentido.
// ══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const html = document.documentElement;

  
  function initCinematicIntro(){
    const screen  = $('intro-screen');
    const dynText = $('dynamic-text');
    if(!screen || !dynText) return;

    let chromaApplied = false;
    const obs = new MutationObserver(() => {
      const chars = dynText.querySelectorAll('.char');
      if(chars.length && !chromaApplied){
        chromaApplied = true;
        dynText.dataset.text = dynText.textContent;
        setTimeout(() => {
          chars.forEach(ch => {
            if(Math.random() > 0.5){
              ch.classList.add('char-glitch');
              ch.style.animationDelay = (Math.random()*4)+'s';
            }
          });
          setTimeout(() => dynText.classList.add('chromatic'), 600);
        }, 800);
        obs.disconnect();
      }
    });
    obs.observe(dynText, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });

    
    const exitObs = new MutationObserver(() => {
      const op = parseFloat(window.getComputedStyle(screen).opacity);
      if(op < 0.95 && !screen.dataset.shattered && typeof gsap !== 'undefined'){
        screen.dataset.shattered = '1';
        dynText.querySelectorAll('.char').forEach((ch, i) => {
          const dir = i%2===0 ? -1 : 1;
          gsap.to(ch, {
            x: dir*(20+Math.random()*90), y: -(10+Math.random()*80),
            rotation: dir*(10+Math.random()*40),
            scale: 0.2+Math.random()*0.4,
            opacity:0, filter:'blur(8px)',
            duration:0.6, ease:'power2.in', delay:i*0.035
          });
        });
        gsap.to($('intro-line'), { scaleX:0, opacity:0, duration:0.3, ease:'power2.in' });
      }
    });
    exitObs.observe(screen, { attributes:true, attributeFilter:['style'] });
  }

  

  // ── Ponto único de arranque: tudo o que antes corria assumindo que o
  //    documento já estava todo parseado (este script sempre viveu no fim
  //    do <body>, depois de todo o HTML estático) — agora que passa a
  //    carregar cedo, junto com intro.js, tem de esperar pelo mesmo guard
  //    que já protegia initCinematicIntro(), senão elementos definidos mais
  //    abaixo no HTML (ex.: #recibos-overlay) ainda não existiriam. ──
  function _fxInit(){
    initCinematicIntro();

    const vignette = $('wz-vignette');
    ['recibos-overlay','r-modal-overlay','ed-export-modal'].forEach(id => {
      const el = $(id); if(!el) return;
      new MutationObserver(() => {
        const open = el.classList.contains('open')||el.classList.contains('show')||el.classList.contains('visible');
        if(vignette) vignette.classList.toggle('active', open);
      }).observe(el, { attributes:true, attributeFilter:['class','style'] });
    });

  
    const wipeEl = $('wz-wipe');
    window.wzWipe = function(cb){
      if(!wipeEl){ cb&&cb(); return; }
      wipeEl.classList.remove('wipe-out');
      void wipeEl.offsetWidth;
      wipeEl.classList.add('wipe-in');
      wipeEl.addEventListener('animationend', function h(){
        wipeEl.removeEventListener('animationend',h);
        cb&&cb();
        setTimeout(()=>{
          wipeEl.classList.remove('wipe-in');
          void wipeEl.offsetWidth;
          wipeEl.classList.add('wipe-out');
          wipeEl.addEventListener('animationend', function h2(){
            wipeEl.removeEventListener('animationend',h2);
            wipeEl.classList.remove('wipe-out');
          },{once:true});
        },80);
      },{once:true});
    };

  
    let audioCtx = null;
    function ac(){ return audioCtx||(audioCtx=new(window.AudioContext||window.webkitAudioContext)()); }
    function tone(freq,type,dur,gain){
      try{
        const o=ac().createOscillator(), g=ac().createGain();
        o.connect(g); g.connect(ac().destination);
        o.type=type||'sine'; o.frequency.value=freq;
        g.gain.setValueAtTime(0,ac().currentTime);
        g.gain.linearRampToValueAtTime(gain||0.04, ac().currentTime+0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, ac().currentTime+(dur||0.15));
        o.start(); o.stop(ac().currentTime+(dur||0.16));
      }catch(e){}
    }
    const SFX = {
      click:   ()=>tone(820,'sine',0.08,0.04),
      hover:   ()=>tone(640,'sine',0.05,0.02),
      error:   ()=>tone(160,'sawtooth',0.22,0.06),
      success: ()=>{ tone(880,'sine',0.12,0.04); setTimeout(()=>tone(1100,'sine',0.15,0.035),80); },
      egg:     ()=>{ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',0.18,0.04),i*80)); }
    };
    window.WZ_SFX = SFX;

    document.addEventListener('click', e => {
      if(e.target.closest('button,a,.tab-btn,label[for],#recibos-link')) SFX.click();
    },{passive:true});
    document.addEventListener('mouseover', e => {
      if(e.target.closest('button,.tab-btn,#recibos-link')) SFX.hover();
    },{passive:true});

    const statusEl = $('r-status-msg')||$('s-status-msg');
    if(statusEl) new MutationObserver(()=>{
      const t = statusEl.textContent.toLowerCase();
      if(t.includes('erro')||t.includes('falhou')) SFX.error();
      if(t.includes('concluí')||t.includes('guardado')) SFX.success();
    }).observe(statusEl,{characterData:true,childList:true,subtree:true});

  
    function applyTimeAmbience(){
      const h = new Date().getHours();
      html.classList.remove('wz-morning','wz-evening');
      if(h>=6  && h<12) html.classList.add('wz-morning');
      if(h>=18 && h<21) html.classList.add('wz-evening');
    }
    applyTimeAmbience();
    setInterval(applyTimeAmbience, 60000);

  
    let pmx=0, pmy=0;
    document.addEventListener('mousemove', e=>{
      pmx=(e.clientX/innerWidth -0.5)*2;
      pmy=(e.clientY/innerHeight-0.5)*2;
    },{passive:true});
    (function loop(){
      [$('main-header-center'),$('admin-header')].forEach((el,i)=>{
        if(!el) return;
        const d=i===0?6:5;
        el.style.transform=`translate(${pmx*d}px,${pmy*(d-2)}px)`;
      });
      requestAnimationFrame(loop);
    })();

  
    let clicks=0, clickTimer;
    document.addEventListener('click', e=>{
      const logo = e.target.closest('.logo-text');
      if(!logo) return;
      clicks++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(()=>{
        if(clicks>=3){
          logo.classList.remove('burst');
          void logo.offsetWidth;
          logo.classList.add('burst');
          SFX.egg();
          html.classList.toggle('wz-egg');
        
          for(let i=0;i<12;i++){
            const p=document.createElement('div');
            p.style.cssText=`position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:4px;height:4px;border-radius:50%;background:#000;pointer-events:none;z-index:99999;transform:translate(-50%,-50%)`;
            document.body.appendChild(p);
            const angle=(i/12)*Math.PI*2, dist=40+Math.random()*60;
            if(typeof gsap!=='undefined'){
              gsap.to(p,{x:Math.cos(angle)*dist,y:Math.sin(angle)*dist,opacity:0,scale:0,duration:0.6+Math.random()*0.3,ease:'power2.out',onComplete:()=>p.remove()});
            } else { setTimeout(()=>p.remove(),700); }
          }
          setTimeout(()=>logo.classList.remove('burst'),700);
        }
        clicks=0;
      },350);
    });

  
    const KONAMI=[38,38,40,40,37,39,37,39,66,65]; let ki=0;
    document.addEventListener('keydown', e=>{
      ki = e.keyCode===KONAMI[ki] ? ki+1 : 0;
      if(ki===KONAMI.length){ ki=0; html.classList.toggle('wz-egg'); SFX.egg(); }
    });

  
    const minBtn = $('wz-minimal-btn');
    if(minBtn) minBtn.addEventListener('click',()=>{
      html.classList.toggle('wz-minimal'); SFX.click();
    });

  
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded', _fxInit);
  else
    _fxInit();

})();
