// ══════════════════════════════════════════════════════════════
//  ADMIN: PDF.js worker + tabs
// ══════════════════════════════════════════════════════════════
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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

