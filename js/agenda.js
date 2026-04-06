/* ══════════════════════════════════════════════════════
   AGENDA — módulo completo
   Injecta CSS + HTML no overlay #ag-root e gere estado
══════════════════════════════════════════════════════ */

(function () {
'use strict';

var AG_CSS = `
*{cursor:crosshair!important}
input,textarea{cursor:text!important}
#ag-app{position:relative;z-index:1;max-width:920px;margin:0 auto;padding:28px 20px 60px}
#ag-header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px}
#ag-title{font-size:2.4rem;font-weight:300;text-transform:lowercase;letter-spacing:.1em;color:#000;line-height:1}
#ag-today{font-size:.88rem;font-weight:bold;text-transform:lowercase;letter-spacing:.05em;color:#000}
#ag-hero{margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #e6e6e6}
#ag-hero-row{display:flex;align-items:flex-end;gap:28px;flex-wrap:wrap;margin-bottom:10px}
#ag-hero-main{display:flex;flex-direction:column;gap:2px}
#ag-hero-label{font-size:.8rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000}
#ag-hero-value{font-size:3.5rem;font-weight:300;color:#000;letter-spacing:-.02em;line-height:1;transition:color .4s}
#ag-hero-value.danger{color:#c62828}
#ag-hero-sub{font-size:.88rem;font-weight:bold;color:#000;margin-top:2px}
#ag-hero-sub.alert{color:#c62828;opacity:1}
#ag-hero-stats{display:flex;gap:22px;flex-wrap:wrap}
.ag-hs{display:flex;flex-direction:column;gap:1px}
.ag-hs-l{font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#000}
.ag-hs-v{font-size:1.15rem;font-weight:bold;color:#000}
.ag-hs-v.r{color:#c62828}.ag-hs-v.a{color:#e65100}.ag-hs-v.g{color:#2e7d32}
#ag-insights{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.ag-insight{font-size:.88rem;font-weight:bold;color:#000;display:flex;align-items:center;gap:6px}
.ag-insight.warn{color:#e65100}.ag-insight.danger{color:#c62828}.ag-insight.ok{color:#2e7d32}
#ag-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.ag-card{background:#fff;border:1px solid #e6e6e6;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:5px;position:relative;overflow:hidden;transition:border-color .2s,transform .2s cubic-bezier(0.22,1,0.36,1)}
.ag-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#e6e6e6}
.ag-card.cr::before{background:#c62828}.ag-card.ca::before{background:#e65100}.ag-card.cg::before{background:#2e7d32}.ag-card.cb::before{background:#000}
.ag-card:hover{border-color:#bbb;transform:translateY(-2px)}
.ag-card-label{font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:#000}
.ag-card-value{font-size:1.45rem;font-weight:300;color:#000;letter-spacing:-.01em}
.ag-card-value.vr{color:#c62828;font-weight:bold}.ag-card-value.vg{color:#2e7d32}.ag-card-value.va{color:#e65100}
#ag-alerts{margin-bottom:14px;display:flex;flex-direction:column;gap:6px}
.ag-alert{padding:10px 16px;border-radius:10px;font-size:.9rem;font-weight:bold;display:flex;align-items:center;gap:7px;animation:slideIn .22s ease}
@keyframes slideIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.ag-av{background:#fff5f5;color:#c62828;border:1px solid #ffd7d7}
.ag-au{background:#fff8f0;color:#e65100;border:1px solid #ffd7b0}
#ag-chart-wrap{display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.ag-cb{flex:1;min-width:180px;background:#fff;border:1px solid #e6e6e6;border-radius:14px;padding:14px 16px}
.ag-ct{font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:#000;margin-bottom:10px}
#ag-donut-wrap{display:flex;align-items:center;gap:12px}
#ag-donut-legend{display:flex;flex-direction:column;gap:4px}
.ag-dl{display:flex;align-items:center;gap:7px;font-size:.82rem;font-weight:bold}
.ag-dl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ag-dl-label{color:#000;flex:1}.ag-dl-pct{color:#000}
#ag-bar-chart{display:flex;align-items:flex-end;gap:4px;height:50px}
.ag-bar{flex:1;border-radius:3px 3px 0 0;position:relative;cursor:crosshair!important;min-width:8px;transition:opacity .15s}
.ag-bar:hover{opacity:.7!important}
.ag-bar-tip{position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);font-size:.6rem;font-weight:bold;color:#000;background:#fff;border:1px solid #e6e6e6;border-radius:5px;padding:2px 6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s}
.ag-bar:hover .ag-bar-tip{opacity:1}
#ag-bar-labels{display:flex;gap:4px;margin-top:3px}
.ag-bar-label{flex:1;font-size:.55rem;font-weight:bold;color:#000;text-align:center;min-width:8px}
#ag-toolbar{display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;align-items:center}
.ag-btn{padding:9px 20px;font-size:.88rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.04em;cursor:crosshair!important;border:1px solid #ccc;border-radius:20px;background:#fff;color:#000;transition:background .15s,border-color .15s,color .15s,transform .12s;white-space:nowrap;position:relative;overflow:hidden}
.ag-btn:hover{background:#000;color:#fff!important;border-color:#000}
.ag-btn:active{transform:scale(0.97)}
.ag-btn-p{background:#000!important;color:#fff!important;border-color:#000!important}
.ag-btn-p:hover{background:#333!important;border-color:#333!important;color:#fff!important}
.ag-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,.3);transform:scale(0);animation:ripple .42s linear;pointer-events:none}
@keyframes ripple{to{transform:scale(4);opacity:0}}
#ag-forn-btns{display:flex;gap:5px;flex-wrap:wrap}
.ag-fb{padding:7px 14px;font-size:.8rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:uppercase;letter-spacing:.06em;cursor:crosshair!important;border:1px solid #e6e6e6;border-radius:20px;background:#fff;color:#000;transition:all .18s cubic-bezier(0.22,1,0.36,1);white-space:nowrap}
.ag-fb:hover{border-color:#aaa}
.ag-fb.active{background:#000;color:#fff!important;border-color:#000}
.ag-fb[data-forn="TAM"].active{background:#1565c0;border-color:#1565c0;color:#fff!important}
.ag-fb[data-forn="GIT"].active{background:#6a1b9a;border-color:#6a1b9a;color:#fff!important}
.ag-fb[data-forn="BESTSELLER"].active{background:#880e4f;border-color:#880e4f;color:#fff!important}
.ag-fb[data-forn="CHLAMYS"].active{background:#2e7d32;border-color:#2e7d32;color:#fff!important}
.ag-fbadge{display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;border-radius:7px;font-size:.55rem;font-weight:bold;margin-left:3px;padding:0 2px;background:rgba(0,0,0,.08);color:#000;vertical-align:middle}
.ag-fb.active .ag-fbadge{background:rgba(255,255,255,.25);color:#fff}
#ag-filter-wrap{display:flex;gap:5px;margin-left:auto;flex-wrap:wrap}
.ag-filter-btn{padding:7px 14px;font-size:.8rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:uppercase;letter-spacing:.06em;cursor:crosshair!important;border:1px solid #e6e6e6;border-radius:20px;background:transparent;color:#000;transition:all .15s}
.ag-filter-btn.active{border-color:#000;background:#000;color:#fff!important}
.ag-filter-btn.ag-fp.active{background:#e65100;border-color:#e65100;color:#fff!important}
.ag-filter-btn.ag-fv.active{background:#c62828;border-color:#c62828;color:#fff!important}
.ag-filter-btn.ag-fg.active{background:#2e7d32;border-color:#2e7d32;color:#fff!important}
#ag-forn-banner{display:none;align-items:center;gap:16px;padding:9px 15px;margin-bottom:11px;border-radius:12px;border:1px solid #e6e6e6;background:#fafafa;animation:slideIn .2s ease;flex-wrap:wrap}
#ag-forn-banner.show{display:flex}
#ag-fb-name{font-size:.95rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em}
#ag-fb-stats{display:flex;gap:14px}
.ag-fbs{display:flex;flex-direction:column;gap:1px}
.ag-fbs-l{font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#000}
.ag-fbs-v{font-size:1rem;font-weight:bold;color:#000}
.ag-fbs-v.r{color:#c62828}.ag-fbs-v.a{color:#e65100}
#ag-table-outer{text-align:center;margin-bottom:0;overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}
#ag-table-wrap{background:#fff;border:1px solid #e6e6e6;border-radius:14px;overflow:hidden;display:block;width:max-content;min-width:100%;text-align:left}
#ag-table{width:auto;border-collapse:collapse;font-family:'MontserratLight',sans-serif;font-size:.95rem;white-space:nowrap}
@media(min-width:768px){#ag-app{max-width:1280px}#ag-table-outer{overflow-x:visible}#ag-table-wrap{width:100%;min-width:unset}#ag-table{width:100%}}
#ag-table thead th{background:#f0f0f0;padding:11px 14px;text-align:left;font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#000;border-bottom:1px solid #e6e6e6;position:sticky;top:0;z-index:2}
#ag-table thead th[data-sort]{cursor:crosshair!important}
.ag-thr{text-align:right}.ag-thc{text-align:center}
#ag-table tbody tr{border-bottom:1px solid #f0f0f0;transition:background .1s;animation:rowIn .28s cubic-bezier(0.22,1,0.36,1) both}
@keyframes rowIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
#ag-table tbody tr:last-child{border-bottom:none}
#ag-table tbody tr:hover{background:#fafafa}
.ag-tr-v{background:#fff8f5!important}.ag-tr-v:hover{background:#fff0e8!important}
.ag-tr-p{opacity:.5}.ag-tr-p:hover{opacity:1!important;background:#f5faf5!important}
@keyframes paidOut{0%{background:rgba(46,125,50,.1)}60%{opacity:.5;transform:translateX(4px)}100%{opacity:.4;transform:none}}
.ag-tr-paying{animation:paidOut .48s cubic-bezier(0.22,1,0.36,1) forwards!important}
#ag-table td{padding:5px 14px;color:#000;vertical-align:middle;font-weight:bold}
.ag-tdc{text-align:center}.ag-tdr{text-align:right;font-variant-numeric:tabular-nums}.ag-tdn{font-size:.88rem;color:#000;font-weight:bold}
.ag-sec-tr td{padding:7px 12px!important;font-size:.75rem!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.09em!important;border:none!important;border-bottom:1px solid #e6e6e6!important}
.ag-sec-v td{color:#c62828!important;background:#fff5f5!important}
.ag-sec-u td{color:#e65100!important;background:#fff8f0!important}
.ag-sec-x td{color:#1565c0!important;background:#f0f7ff!important}
.ag-sec-d td{color:#000!important;background:#fafafa!important}
.ag-sub-tr td{padding:7px 12px!important;font-size:.82rem!important;font-weight:bold!important;border-bottom:1px solid #e6e6e6!important;color:#000!important;background:#fafafa!important}
.ag-chip{display:inline-block;padding:2px 9px;border-radius:5px;font-size:.78rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}
.ag-chip-TAM{background:#e3f2fd;color:#1565c0}
.ag-chip-GIT{background:#f3e5f5;color:#6a1b9a}
.ag-chip-BESTSELLER{background:#fce4ec;color:#880e4f}
.ag-chip-CHLAMYS{background:#e8f5e9;color:#2e7d32}
.ag-est{display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.ag-est-p{background:#e8f5e9;color:#2e7d32}
.ag-est-e{background:#fff3e0;color:#e65100}
.ag-est-v{background:#ffebee;color:#c62828}
.ag-est-n{background:#ede7f6;color:#4527a0}
.ag-dias{display:inline-block;padding:3px 9px;border-radius:10px;font-size:.75rem;font-weight:bold;white-space:nowrap}
.ag-du{background:#ffebee;color:#c62828}
.ag-dp{background:#fff3e0;color:#e65100}
.ag-do{background:#e8f5e9;color:#2e7d32}
.ag-dd{color:#000;font-size:.6rem}
.ag-neg{color:#4527a0!important}
.ag-sa::after{content:' ↑'}.ag-sd::after{content:' ↓'}
#ag-empty{padding:38px 0;text-align:center;color:#000;font-size:.82rem;font-weight:bold;text-transform:lowercase;display:none}
.ag-ib{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:.72rem;cursor:crosshair!important;border:1px solid #e6e6e6;border-radius:6px;background:#fff;color:#000;transition:all .12s;padding:0;font-family:inherit;line-height:1}
.ag-ib:hover{opacity:1;border-color:#ccc;background:#f5f5f5}
.ag-tp:hover{border-color:#2e7d32;color:#2e7d32}
.ag-del:hover{border-color:#c62828;color:#c62828}
#ag-by-forn{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;transition:all .3s cubic-bezier(0.22,1,0.36,1)}
.ag-fb-block{background:#fff;border:1px solid #e6e6e6;border-radius:14px;overflow:hidden;transition:border-color .2s,transform .2s cubic-bezier(0.22,1,0.36,1)}
.ag-fb-block:hover{border-color:#bbb;transform:translateY(-2px)}
#ag-by-forn.solo{grid-template-columns:1fr;max-width:460px}
#ag-by-forn.solo .ag-fb-block{border-width:2px}
.ag-fb-hdr{padding:10px 14px;font-size:.78rem;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#000;border-bottom:1px solid #e6e6e6;display:flex;align-items:center;justify-content:space-between}
.ag-fb-TAM .ag-fb-hdr{color:#1565c0;background:#e3f2fd}
.ag-fb-GIT .ag-fb-hdr{color:#6a1b9a;background:#f3e5f5}
.ag-fb-BESTSELLER .ag-fb-hdr{color:#880e4f;background:#fce4ec}
.ag-fb-CHLAMYS .ag-fb-hdr{color:#2e7d32;background:#e8f5e9}
.ag-fb-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-top:1px solid #f5f5f5;font-size:.72rem}
.ag-fb-rl{color:#000;font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}
.ag-fb-rv{font-weight:bold;font-variant-numeric:tabular-nums;color:#000;font-size:.88rem}
.ag-fb-rv.g{color:#2e7d32}.ag-fb-rv.r{color:#c62828}
.ag-sl{font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000;padding:18px 0 8px}
#ag-mo{display:none;position:fixed;inset:0;background:rgba(255,255,255,.8);backdrop-filter:blur(6px);z-index:500;justify-content:center;align-items:center;padding:20px}
#ag-mo.open{display:flex}
#ag-mo.open #ag-mb{animation:modalIn .26s cubic-bezier(0.22,1,0.36,1)}
@keyframes modalIn{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
#ag-mb{background:#fff;border:1px solid #e6e6e6;border-radius:18px;padding:26px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.1);display:flex;flex-direction:column;gap:15px}
#ag-mt{font-size:.82rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000}
.ag-fr{display:flex;flex-direction:column;gap:4px}
.ag-fr label{font-size:.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#000}
.ag-in{padding:10px 14px;font-size:.95rem;font-weight:600;font-family:'MontserratLight',sans-serif;background:#fff;border:1px solid #ddd;border-radius:10px;color:#000;outline:none;transition:border-color .15s;width:100%}
.ag-in:focus{border-color:#555}
.ag-fg2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.ag-mbtns{display:flex;gap:8px;justify-content:flex-end;margin-top:3px}
#ag-snack{position:fixed;bottom:22px;right:22px;z-index:800;display:flex;align-items:center;gap:7px;padding:8px 16px;border-radius:20px;background:#000;color:#fff;font-size:.88rem;font-weight:bold;font-family:'MontserratLight',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16);opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s cubic-bezier(0.22,1,0.36,1);pointer-events:none}
#ag-snack.show{opacity:1;transform:none}
#ag-year-nav{position:fixed;top:24px;right:24px;z-index:300;display:none;flex-direction:column;gap:6px;align-items:flex-end}
#ag-year-nav.ag-visible{display:flex}
#ag-close-year-wrap{margin-top:2px;display:none}
#ag-close-year-wrap.show{display:block}
.ag-year-btn{padding:6px 14px;font-size:.78rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.06em;cursor:crosshair!important;border:1px solid #ccc;border-radius:20px;background:#fff;color:#000;transition:background .15s,color .15s,border-color .15s;white-space:nowrap}
.ag-year-btn:hover{background:#000;color:#fff!important;border-color:#000}
.ag-year-btn.active-year{background:#000;color:#fff!important;border-color:#000}
.ag-year-btn.locked{border-style:solid;border-color:#000}
.ag-year-btn.locked::after{content:' ⊘';font-size:.65rem}
#ag-btn-close-year{padding:5px 12px;font-size:.7rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.05em;cursor:crosshair!important;border:1px solid #c62828;border-radius:20px;background:#fff;color:#c62828;transition:background .15s,color .15s;white-space:nowrap}
#ag-btn-close-year:hover{background:#c62828;color:#fff}
#ag-readonly-banner{display:none;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;margin-bottom:16px;border-radius:12px;border:1px solid #000;background:#fafafa;font-size:.82rem;font-weight:bold;animation:slideIn .22s ease}
#ag-readonly-banner.show{display:flex}
#ag-readonly-banner span{color:#000}
#ag-readonly-badge{padding:3px 10px;border-radius:20px;border:1px solid #000;font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#000}
#ag-edit-once-wrap{display:none;margin-bottom:12px}
#ag-edit-once-wrap.show{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#ag-btn-edit-once{padding:7px 18px;font-size:.82rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.04em;cursor:crosshair!important;border:1.5px solid #000;border-radius:20px;background:#fff;color:#000;transition:background .15s,color .15s}
#ag-btn-edit-once:hover{background:#000;color:#fff}
#ag-btn-confirm-once{padding:7px 18px;font-size:.82rem;font-weight:bold;font-family:'MontserratLight',sans-serif;text-transform:lowercase;letter-spacing:.04em;cursor:crosshair!important;border:1.5px solid #c62828;border-radius:20px;background:#fff;color:#c62828;display:none;transition:background .15s,color .15s}
#ag-btn-confirm-once:hover{background:#c62828;color:#fff}
#ag-btn-confirm-once.show{display:inline-block}
.ag-edit-once-msg{font-size:.78rem;font-weight:bold;color:#000;display:none}
.ag-edit-once-msg.show{display:block}
@media(max-width:768px){#ag-summary{grid-template-columns:repeat(2,1fr)}#ag-by-forn{grid-template-columns:repeat(2,1fr)}#ag-filter-wrap{margin-left:0}#ag-chart-wrap{flex-direction:column}.ag-fg2{grid-template-columns:1fr}#ag-hero-value{font-size:2.2rem}
  /* Cards por fornecedor — layout limpo em mobile */
  #ag-by-forn{grid-template-columns:1fr!important;gap:10px}
  .ag-fb-block{width:100%}
  .ag-fb-hdr{font-size:.88rem;padding:12px 16px;letter-spacing:.08em}
  .ag-fb-row{padding:9px 16px}
  .ag-fb-rl{font-size:.76rem}
  .ag-fb-rv{font-size:.95rem}
  /* Borde izquierdo de color en mobile para identificar proveedor */
  .ag-fb-TAM .ag-fb-hdr{border-left:4px solid #1565c0;padding-left:12px}
  .ag-fb-GIT .ag-fb-hdr{border-left:4px solid #6a1b9a;padding-left:12px}
  .ag-fb-BESTSELLER .ag-fb-hdr{border-left:4px solid #880e4f;padding-left:12px}
  .ag-fb-CHLAMYS .ag-fb-hdr{border-left:4px solid #2e7d32;padding-left:12px}
}
@media(max-width:480px){#ag-summary{grid-template-columns:1fr 1fr}#ag-by-forn{grid-template-columns:1fr!important}}
@media(max-width:600px){
  #ag-year-nav{
    position:relative!important;
    top:auto!important;
    right:auto!important;
    flex-direction:row!important;
    flex-wrap:wrap;
    justify-content:flex-end;
    gap:6px;
    margin-bottom:8px;
  }
  .ag-year-btn{font-size:.75rem;padding:5px 12px}
}

`;

var AG_HTML = `
<div id="ag-app">
<div id="ag-year-nav"></div>
<div id="ag-close-year-wrap"><button id="ag-btn-close-year">fechar exercício</button></div>
<div id="ag-header">
  <div id="ag-title">agenda faturas</div>
  <div id="ag-today"></div>
</div>
<div id="ag-readonly-banner">
  <span id="ag-readonly-msg"></span>
  <span id="ag-readonly-badge">arquivo · leitura</span>
</div>
<div id="ag-edit-once-wrap">
  <button id="ag-btn-edit-once">✎ editar exercício</button>
  <button id="ag-btn-confirm-once">✓ confirmar e fechar edição</button>
  <span class="ag-edit-once-msg" id="ag-edit-once-msg"></span>
</div>
<div id="ag-hero">
  <div id="ag-hero-row">
    <div id="ag-hero-main">
      <div id="ag-hero-label">total pendente</div>
      <div id="ag-hero-value">—</div>
      <div id="ag-hero-sub"></div>
    </div>
    <div id="ag-hero-stats"></div>
  </div>
  <div id="ag-insights"></div>
</div>
<div id="ag-summary"></div>
<div id="ag-alerts"></div>
<div id="ag-chart-wrap">
  <div class="ag-cb">
    <div class="ag-ct">distribuição pendente</div>
    <div id="ag-donut-wrap">
      <svg id="ag-donut" width="72" height="72" viewBox="0 0 72 72"></svg>
      <div id="ag-donut-legend"></div>
    </div>
  </div>
  <div class="ag-cb" style="flex:2">
    <div class="ag-ct">exposição por vencimento</div>
    <div id="ag-bar-chart"></div>
    <div id="ag-bar-labels"></div>
  </div>
</div>
<div id="ag-toolbar">
  <button class="ag-btn ag-btn-p" id="ag-btn-nova">+ nova fatura</button>
  <div id="ag-forn-btns"></div>
  <div id="ag-filter-wrap">
    <button class="ag-filter-btn active" data-filter="all">todas</button>
    <button class="ag-filter-btn ag-fp" data-filter="pendente">pendente</button>
    <button class="ag-filter-btn ag-fv" data-filter="vencida">vencidas</button>
    <button class="ag-filter-btn ag-fg" data-filter="pago">pago</button>
  </div>
</div>
<div id="ag-forn-banner">
  <div id="ag-fb-name"></div>
  <div id="ag-fb-stats"></div>
</div>
<div id="ag-table-outer"><div id="ag-table-wrap">
  <table id="ag-table">
    <thead><tr>
      <th class="ag-thc" style="width:30px">#</th>
      <th data-sort="fornecedor">Fornecedor</th>
      <th data-sort="factura">Fatura</th>
      <th class="ag-thr" data-sort="valor">Valor</th>
      <th data-sort="data">Data</th>
      <th data-sort="vencimento">Vencimento</th>
      <th class="ag-thc">Prazo</th>
      <th class="ag-thc">Estado</th>
      <th class="ag-thc" style="width:68px"></th>
    </tr></thead>
    <tbody id="ag-tbody"></tbody>
  </table>
  <div id="ag-empty">nenhuma fatura encontrada</div>
</div></div>
<div class="ag-sl">por fornecedor</div>
<div id="ag-by-forn"></div>
</div>
<div id="ag-mo">
  <div id="ag-mb">
    <div id="ag-mt">nova fatura</div>
    <div class="ag-fg2">
      <div class="ag-fr"><label>Fornecedor</label><input class="ag-in" id="ag-f-forn" type="text" placeholder="ex: TAM, GIT…" list="ag-forn-list"><datalist id="ag-forn-list"><option value="TAM"><option value="GIT"><option value="BESTSELLER"><option value="CHLAMYS"></datalist></div>
      <div class="ag-fr"><label>Nº Fatura</label><input class="ag-in" id="ag-f-fat" type="text" placeholder="ZY-26000000"></div>
      <div class="ag-fr"><label>Valor (€)</label><input class="ag-in" id="ag-f-val" type="text" inputmode="decimal" placeholder="3.609,19"></div>
      <div class="ag-fr"><label>Estado</label><select class="ag-in" id="ag-f-est"><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="nc">Nota de Crédito</option></select></div>
      <div class="ag-fr"><label>Data Fatura</label><input class="ag-in" id="ag-f-dat" type="date"></div>
      <div class="ag-fr"><label>Vencimento</label><input class="ag-in" id="ag-f-vec" type="date"></div>
    </div>
    <div class="ag-mbtns">
      <button class="ag-btn" id="ag-mc">cancelar</button>
      <button class="ag-btn ag-btn-p" id="ag-ms">guardar</button>
    </div>
  </div>
</div>
<div id="ag-snack"><span id="ag-snack-icon"></span> <span id="ag-snack-msg"></span></div>
`;

var _agStyleInjected = false;
function agInjectStyle() {
  if (_agStyleInjected) return;
  _agStyleInjected = true;
  var s = document.createElement('style');
  s.id = 'ag-module-style';
  s.textContent = AG_CSS;
  document.head.appendChild(s);
}

var _agHtmlInjected = false;
function agInjectHtml() {
  if (_agHtmlInjected) return;
  _agHtmlInjected = true;
  var root = document.getElementById('ag-root');
  if (root) root.innerHTML = AG_HTML;
  agBindLogic();
}

window.openAgendaOverlay = function () {
  agInjectStyle();
  var ov = document.getElementById('agenda-overlay');
  if (!ov) return;
  ov.classList.add('open');
  requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('visible'); }); });
  agInjectHtml();
  var yn = document.getElementById('ag-year-nav');
  if (yn) yn.classList.add('ag-visible');
};

window.closeAgendaOverlay = function () {
  var ov = document.getElementById('agenda-overlay');
  if (!ov) return;
  ov.classList.remove('visible');
  var yn = document.getElementById('ag-year-nav');
  if (yn) yn.classList.remove('ag-visible');
  setTimeout(function () { ov.classList.remove('open'); }, 600);
};

function agBindLogic() {
  var CURRENT_YEAR = new Date().getFullYear();
  var FIRST_YEAR = 2023;
  var ALL_YEARS = [];
  for (var y = FIRST_YEAR; y <= CURRENT_YEAR; y++) ALL_YEARS.push(y);

  var activeYear = CURRENT_YEAR;
  var agF = [], agFilter = 'all', agForn = null, agQ = '';
  var agSort = {col:'data',dir:'asc'}, agEditId = null;
  var TODAY = new Date(); TODAY.setHours(0,0,0,0);
  /* Días hasta el domingo de esta semana (0 = hoy es domingo, siempre >= 0) */
  var DAYS_TO_SUNDAY = (7 - TODAY.getDay()) % 7;
  var _editOnceActive = false;

  function dataKey(y)   { return 'ag_faturas_' + y; }
  function lockedKey(y) { return 'ag_locked_'  + y; }
  function editOnceKey(y){ return 'ag_editonce_used_' + y; }
  function isLocked(y)  { return !!localStorage.getItem(lockedKey(y)); }
  function editOnceUsed(y){ return !!localStorage.getItem(editOnceKey(y)); }
  function isReadonly() { return isLocked(activeYear) || (activeYear < CURRENT_YEAR && !_editOnceActive); }

  /* Sem seed — agenda começa vazia */
  function fmt(n){return new Intl.NumberFormat('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €'}
  function fmtK(n){return Math.abs(n)>=1000?(n/1000).toFixed(0)+'k':Math.round(n)+''}
  function fd(s){if(!s)return'—';var d=new Date(s+'T00:00:00');return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}
  function dd(s){var d=new Date(s+'T00:00:00');return isNaN(d)?null:Math.round((d-TODAY)/86400000)}
  function nid(){return agF.length?Math.max.apply(null,agF.map(function(f){return f.id;}))+1:1}
  function est(f){if(f.estado==='pago'||f.estado==='nc')return f.estado;var d=dd(f.vencimento);return(d!==null&&d<0)?'vencida':'pendente'}

  /* ══════════════════════════════════════════════
     SUPABASE CONFIG
     Substitui os valores abaixo pelos do teu projeto.
     Project URL  → Supabase Dashboard → Settings → API
     Anon Key     → Supabase Dashboard → Settings → API
  ══════════════════════════════════════════════ */
  var SB_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  /* ── Sync status indicator ── */
  var _syncEl = null;
  function getSyncEl(){
    if(_syncEl) return _syncEl;
    _syncEl = document.getElementById('ag-sync-status');
    if(!_syncEl){
      _syncEl = document.createElement('div');
      _syncEl.id = 'ag-sync-status';
      _syncEl.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:800;display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:#fff;border:1px solid #e6e6e6;font-size:.75rem;font-weight:bold;font-family:"MontserratLight",sans-serif;color:#000;opacity:0;transition:opacity .3s;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.07)';
      document.body.appendChild(_syncEl);
    }
    return _syncEl;
  }
  function setSyncStatus(state, msg){
    var el = getSyncEl();
    var icons = { syncing:'⟳', ok:'✓', error:'⚠', offline:'◌' };
    var colors = { syncing:'#1565c0', ok:'#2e7d32', error:'#c62828', offline:'#e65100' };
    el.style.color = colors[state] || '#000';
    el.style.borderColor = colors[state] || '#e6e6e6';
    el.innerHTML = '<span style="font-size:.85rem">' + (icons[state]||'·') + '</span> ' + msg;
    el.style.opacity = '1';
    if(state === 'ok'){
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(function(){ el.style.opacity = '0'; }, 2500);
    }
  }

  /* ── Supabase REST helpers ── */
  function sbHeaders(){
    return { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };
  }
  function sbFetch(path, opts){
    return fetch(SB_URL + '/rest/v1/' + path, Object.assign({ headers: sbHeaders() }, opts||{}));
  }

  /* ── SAVE (async, upsert) ── */
  var _saveDebounce = null;
  var _pendingSave = false;
  var _autoSaveInterval = null;

  function save(){
    if(isReadonly()) return;
    /* Guarda também em localStorage como fallback offline */
    try{ localStorage.setItem(dataKey(activeYear), JSON.stringify(agF)); }catch(e){}
    /* Debounce: agrupa mudanças rápidas num único pedido */
    _pendingSave = true;
    clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(function(){ _flushSave(); }, 800);
  }

  function _flushSave(){
    if(!_pendingSave) return;
    _pendingSave = false;
    if(isReadonly()) return;
    setSyncStatus('syncing', 'a guardar…');
    var payload = { ano: activeYear, faturas: JSON.stringify(agF), updated_at: new Date().toISOString() };
    sbFetch('ag_agenda?ano=eq.' + activeYear, {
      method: 'POST',
      headers: Object.assign(sbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(payload)
    }).then(function(r){
      if(r.ok){ setSyncStatus('ok', 'guardado'); }
      else{ r.text().then(function(t){ console.error('AG save error', t); setSyncStatus('error', 'erro ao guardar'); }); }
    }).catch(function(e){ console.error('AG save network error', e); setSyncStatus('offline', 'offline — guardado localmente'); });
  }

  /* ── LOAD (async) ── */
  function load(y){
    /* Carrega imediatamente do localStorage enquanto Supabase responde */
    try{
      var cached = localStorage.getItem(dataKey(y));
      if(cached){ agF = JSON.parse(cached); rAll(); }
      else{ agF = []; }
    }catch(e){ agF = []; }

    setSyncStatus('syncing', 'a carregar…');
    sbFetch('ag_agenda?ano=eq.' + y + '&select=faturas', { method:'GET' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(data && data.length && data[0].faturas){
          var remote = JSON.parse(data[0].faturas);
          agF = remote;
          try{ localStorage.setItem(dataKey(y), JSON.stringify(agF)); }catch(e){}
          setSyncStatus('ok', 'sincronizado');
          rAll();
          rFornDatalist();
        } else {
          /* Nenhum registo remoto ainda — se há dados locais faz upload inicial */
          setSyncStatus('ok', 'pronto');
          if(agF.length > 0) _flushSave();
          else rAll();
        }
      })
      .catch(function(e){
        console.error('AG load error', e);
        setSyncStatus('offline', 'offline — dados locais');
        rAll();
      });
  }

  /* ── AUTOGUARDADO a cada 15 segundos ── */
  function startAutoSave(){
    stopAutoSave();
    _autoSaveInterval = setInterval(function(){
      if(!isReadonly() && _pendingSave){ _flushSave(); }
      else if(!isReadonly()){
        /* Ping silencioso para confirmar sync */
        setSyncStatus('syncing','a verificar…');
        sbFetch('ag_agenda?ano=eq.'+activeYear+'&select=updated_at',{method:'GET'})
          .then(function(r){return r.json();})
          .then(function(){ setSyncStatus('ok','em dia'); })
          .catch(function(){ setSyncStatus('offline','offline'); });
      }
    }, 15000);
  }
  function stopAutoSave(){ clearInterval(_autoSaveInterval); }

  /* Inicia o autoguardado quando o overlay abre */
  (function(){
    var ov = document.getElementById('agenda-overlay');
    if(ov){
      var obs = new MutationObserver(function(){
        if(ov.classList.contains('open')) startAutoSave();
        else stopAutoSave();
      });
      obs.observe(ov, { attributes:true, attributeFilter:['class'] });
    }
  })();

  var _st;
  function snack(ic,msg){
    var el=document.getElementById('ag-snack');if(!el)return;
    clearTimeout(_st);
    document.getElementById('ag-snack-icon').textContent=ic;
    document.getElementById('ag-snack-msg').textContent=msg;
    el.classList.add('show');
    _st=setTimeout(function(){el.classList.remove('show');},2200);
  }
  function rpl(btn,e){
    var r=document.createElement('span'),rc=btn.getBoundingClientRect(),sz=Math.max(rc.width,rc.height);
    r.className='ag-ripple';
    r.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+(e.clientX-rc.left-sz/2)+'px;top:'+(e.clientY-rc.top-sz/2)+'px';
    btn.appendChild(r);setTimeout(function(){r.remove();},440);
  }
  var _pv={};
  function animVal(el,from,to,dur){
    var s=null;
    function step(ts){if(!s)s=ts;var p=Math.min((ts-s)/dur,1),ease=1-Math.pow(1-p,3),c=from+(to-from)*ease;el.textContent=fmt(c);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  function rEditOnce(){
    var wrap=document.getElementById('ag-edit-once-wrap');
    var btnEdit=document.getElementById('ag-btn-edit-once');
    var btnConfirm=document.getElementById('ag-btn-confirm-once');
    var msg=document.getElementById('ag-edit-once-msg');
    if(!wrap)return;
    var isPrev=activeYear<CURRENT_YEAR,used=editOnceUsed(activeYear),locked=isLocked(activeYear);
    if(isPrev&&!locked&&!used&&!_editOnceActive){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='';if(btnConfirm)btnConfirm.classList.remove('show');if(msg)msg.classList.remove('show');}
    else if(isPrev&&_editOnceActive){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='none';if(btnConfirm)btnConfirm.classList.add('show');if(msg){msg.textContent='modo edição ativo — confirme quando terminar';msg.classList.add('show');}}
    else if(isPrev&&used){wrap.classList.add('show');if(btnEdit)btnEdit.style.display='none';if(btnConfirm)btnConfirm.classList.remove('show');if(msg){msg.textContent='edição única já utilizada neste exercício';msg.classList.add('show');}}
    else{wrap.classList.remove('show');_editOnceActive=false;}
  }
  function rYearNav(){
    var nav=document.getElementById('ag-year-nav');
    var closeWrap=document.getElementById('ag-close-year-wrap');
    nav.innerHTML=ALL_YEARS.map(function(y){
      var locked=isLocked(y);
      var cls='ag-year-btn'+(y===activeYear?' active-year':'')+(locked?' locked':'');
      return '<button class="'+cls+'" data-year="'+y+'">'+y+'</button>';
    }).join('');
    var canClose=!isLocked(CURRENT_YEAR)&&activeYear===CURRENT_YEAR&&TODAY>=new Date(CURRENT_YEAR+1,0,1);
    if(closeWrap)closeWrap.className=canClose?'show':'';
    nav.querySelectorAll('.ag-year-btn').forEach(function(btn){
      btn.addEventListener('click',function(){var y=parseInt(this.dataset.year,10);if(y!==activeYear)switchYear(y);});
    });
  }
  function rFornBtns(){
    var container=document.getElementById('ag-forn-btns');if(!container)return;
    var found={};agF.forEach(function(f){found[f.fornecedor]=true;});
    /* ordem: fornecedores conhecidos primeiro, depois os restantes por ordem alfabética */
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(found).filter(function(k){return known.indexOf(k)<0;}).sort();
    var fkeys=known.filter(function(k){return found[k];}).concat(others);
    container.innerHTML=fkeys.map(function(k){
      var cls='ag-fb'+(agForn===k?' active':'');
      var col=fornColor(k);
      /* injeta estilo inline para fornecedores sem classe CSS predefinida */
      var style=FC_BASE[k]?'':'style="--forn-col:'+col+'"';
      return '<button class="'+cls+' ag-fb-dyn" data-forn="'+k+'" '+style+' data-col="'+col+'">'+k+'<span class="ag-fbadge" id="ag-b-'+k+'"></span></button>';
    }).join('');
    container.querySelectorAll('.ag-fb').forEach(function(btn){
      /* aplica cor activa para fornecedores sem CSS predefinida */
      var col=btn.dataset.col;
      if(col&&!FC_BASE[btn.dataset.forn]){
        btn.addEventListener('mouseenter',function(){if(!this.classList.contains('active'))this.style.background=col;});
        btn.addEventListener('mouseleave',function(){if(!this.classList.contains('active'))this.style.background='';});
      }
      btn.addEventListener('click',function(){
        var f=this.dataset.forn;
        if(agForn===f){agForn=null;container.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.borderColor='';b.style.color=''});}
        else{agForn=f;container.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.borderColor='';b.style.color='';});this.classList.add('active');
          if(col&&!FC_BASE[f]){this.style.background=col;this.style.borderColor=col;this.style.color='#fff';}
          agFilter='all';document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});document.querySelector('.ag-filter-btn[data-filter="all"]').classList.add('active');}
        rBanner();rTable();rForn();
      });
    });
  }
  function switchYear(y){
    activeYear=y;agForn=null;agFilter='all';agQ='';agEditId=null;_editOnceActive=false;
    document.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});
    document.querySelector('.ag-filter-btn[data-filter="all"]').classList.add('active');
    load(y);rYearNav();rReadonlyBanner();rEditOnce();rToolbarState();rFornDatalist();snack('•','exercício '+y);
  }
  function rReadonlyBanner(){
    var banner=document.getElementById('ag-readonly-banner');
    var msg=document.getElementById('ag-readonly-msg');
    if(isReadonly()){var reason=isLocked(activeYear)?'exercício '+activeYear+' fechado — leitura apenas':'a ver exercício '+activeYear+' — leitura apenas';msg.textContent=reason;banner.classList.add('show');}
    else{banner.classList.remove('show');}
  }
  function rToolbarState(){
    var ro=isReadonly();
    var nova=document.getElementById('ag-btn-nova');if(nova)nova.style.display=ro?'none':'';
    var closeWrap=document.getElementById('ag-close-year-wrap');
    var canCloseYear=!isLocked(CURRENT_YEAR)&&activeYear===CURRENT_YEAR&&TODAY>=new Date(CURRENT_YEAR+1,0,1);
    if(closeWrap)closeWrap.className=canCloseYear?'show':'';
  }
  function closeYear(){
    if(isLocked(CURRENT_YEAR))return;
    if(!confirm('Fechar o exercício '+CURRENT_YEAR+'?\n\nÁ partir deste momento não poderá ser editado. Esta ação é irreversível.'))return;
    /* Faz flush imediato para Supabase antes de bloquear */
    _pendingSave = true;
    _flushSave();
    localStorage.setItem(lockedKey(CURRENT_YEAR),'1');
    snack('⊘','exercício '+CURRENT_YEAR+' fechado');
    rYearNav();rReadonlyBanner();rToolbarState();
  }
  var _hv=0;
  function rHero(){
    var pend=0,venc=0,urg=0,fp=0;
    agF.forEach(function(f){var e=est(f);if(e==='pago'||e==='nc')return;var d=dd(f.vencimento);pend+=f.valor;fp++;if(d!==null&&d<0)venc++;else if(d!==null&&d>=0&&d<=DAYS_TO_SUNDAY)urg++;});
    var hv=document.getElementById('ag-hero-value'),hs=document.getElementById('ag-hero-sub');
    var lbl=document.getElementById('ag-hero-label');
    if(lbl)lbl.textContent='total pendente '+activeYear;
    if(hv){animVal(hv,_hv,pend,800);_hv=pend;hv.className=venc>0?'danger':'ok';}
    if(hs){var p=[];if(venc)p.push(venc+' vencida'+(venc>1?'s':''));if(urg)p.push(urg+' esta semana');hs.textContent=p.length?p.join(' · '):'sem alertas urgentes';hs.className=p.length?'alert':'';}
    document.getElementById('ag-hero-stats').innerHTML=[{l:'faturas',v:fp,c:''},{l:'vencidas',v:venc,c:venc>0?'r':''},{l:'esta semana',v:urg,c:urg>0?'a':''}].map(function(s){return'<div class="ag-hs"><span class="ag-hs-l">'+s.l+'</span><span class="ag-hs-v '+s.c+'">'+s.v+'</span></div>';}).join('');
  }
  function rInsights(){
    var el=document.getElementById('ag-insights');if(!el)return;
    var m={},tp=0,vl=[],ul=[];
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]={p:0};var e=est(f);if(e==='pendente'||e==='vencida'){m[f.fornecedor].p+=f.valor;tp+=f.valor;var d=dd(f.vencimento);if(d!==null&&d<0)vl.push(f);else if(d!==null&&d>=0&&d<=DAYS_TO_SUNDAY)ul.push(f);}});
    var ins=[];
    var topF=Object.keys(m).sort(function(a,b){return m[b].p-m[a].p;})[0];
    if(topF&&tp>0){var pct=Math.round(m[topF].p/tp*100);if(pct>40)ins.push({cls:pct>60?'warn':'',text:topF+' concentra '+pct+'% da dívida pendente — '+fmt(m[topF].p)});}
    var smalls=agF.filter(function(f){var e=est(f);return(e==='pendente'||e==='vencida')&&f.valor>0&&f.valor<500;});
    if(smalls.length>=2)ins.push({cls:'ok',text:smalls.length+' faturas <500€ — '+fmt(smalls.reduce(function(s,f){return s+f.valor;},0))+' eliminaria '+smalls.length+' alertas'});
    if(vl.length>0)ins.push({cls:'danger',text:vl.length+' fatura'+(vl.length>1?'s':'')+' vencida'+(vl.length>1?'s':'')+' — '+fmt(vl.reduce(function(s,f){return s+f.valor;},0))+' em risco imediato'});
    el.innerHTML=ins.slice(0,3).map(function(i){return'<div class="ag-insight '+i.cls+'"><span>·</span><span>'+i.text+'</span></div>';}).join('');
  }
  function rSum(){
    var geral=0,pago=0,pend=0,venc=0;
    agF.forEach(function(f){var e=est(f);geral+=f.valor;if(e==='pago'||e==='nc')pago+=f.valor;else{pend+=f.valor;if(e==='vencida')venc+=f.valor;}});
    var cards=[{id:'cg',l:'total '+activeYear,v:geral,cc:'cb',vc:''},{id:'cp',l:'pago',v:pago,cc:'cg',vc:'vg'},{id:'ce',l:'pendente',v:pend,cc:'ca',vc:'va'},{id:'cv',l:'em atraso',v:venc,cc:'cr',vc:venc>0?'vr':''}];
    var el=document.getElementById('ag-summary');
    if(!document.getElementById('cg')){el.innerHTML=cards.map(function(c){return'<div class="ag-card '+c.cc+'" id="'+c.id+'"><div class="ag-card-label">'+c.l+'</div><div class="ag-card-value '+c.vc+'" id="'+c.id+'-v">'+fmt(c.v)+'</div></div>';}).join('');cards.forEach(function(c){_pv[c.id]=c.v;});}
    else{document.getElementById('cg').querySelector('.ag-card-label').textContent='total '+activeYear;cards.forEach(function(c){var ve=document.getElementById(c.id+'-v');if(ve&&_pv[c.id]!==c.v){animVal(ve,_pv[c.id]||0,c.v,480);_pv[c.id]=c.v;}});}
  }
  function rAlerts(){
    var v=[],u=[];
    agF.forEach(function(f){if(f.estado==='pago'||f.estado==='nc')return;var d=dd(f.vencimento);if(d===null)return;if(d<0)v.push(f);else if(d>=0&&d<=DAYS_TO_SUNDAY)u.push(f);});
    var h='';
    if(v.length)h+='<div class="ag-alert ag-av">▲ '+v.length+' fatura'+(v.length>1?'s':'')+' vencida'+(v.length>1?'s':'')+' · '+fmt(v.reduce(function(s,f){return s+f.valor;},0))+'</div>';
    if(u.length)h+='<div class="ag-alert ag-au">● '+u.length+' a vencer esta semana · '+fmt(u.reduce(function(s,f){return s+f.valor;},0))+'</div>';
    document.getElementById('ag-alerts').innerHTML=h;
  }
  function rBadges(){
    var c={};
    agF.forEach(function(f){var e=est(f);if(e==='pendente'||e==='vencida')c[f.fornecedor]=(c[f.fornecedor]||0)+1;});
    Object.keys(c).forEach(function(k){var el=document.getElementById('ag-b-'+k);if(el)el.textContent=c[k]||'';});
    /* zera os que não têm pendentes */
    document.querySelectorAll('.ag-fbadge').forEach(function(el){var k=el.id.replace('ag-b-','');if(!c[k])el.textContent='';});
  }
  var FC_BASE={TAM:'#1565c0',GIT:'#6a1b9a',BESTSELLER:'#880e4f',CHLAMYS:'#2e7d32'};
  var FC_EXTRA=['#00695c','#e65100','#4527a0','#37474f','#558b2f','#6d4c41','#1565c0','#ad1457'];
  var _fcCache={};
  function fornColor(k){
    if(FC_BASE[k])return FC_BASE[k];
    if(_fcCache[k])return _fcCache[k];
    var hash=0;for(var i=0;i<k.length;i++)hash=(hash*31+k.charCodeAt(i))>>>0;
    _fcCache[k]=FC_EXTRA[hash%FC_EXTRA.length];
    return _fcCache[k];
  }

  function rCharts(){
    var m={},total=0;
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]=0;var e=est(f);if(e==='pendente'||e==='vencida'){m[f.fornecedor]+=f.valor;total+=f.valor;}});
    var svg=document.getElementById('ag-donut'),lg=document.getElementById('ag-donut-legend');
    if(svg&&lg){var cx=36,cy=36,r=27,sw=9,ci=2*Math.PI*r,off=0,paths='',lh='';Object.keys(m).filter(function(k){return m[k]>0;}).sort(function(a,b){return m[b]-m[a];}).forEach(function(k){var pct=total>0?m[k]/total:0,dash=ci*pct,gap=ci-dash,rot=-90+off*360,col=fornColor(k);paths+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" transform="rotate('+rot.toFixed(1)+' '+cx+' '+cy+')"/>';lh+='<div class="ag-dl"><div class="ag-dl-dot" style="background:'+col+'"></div><span class="ag-dl-label">'+k+'</span><span class="ag-dl-pct">'+Math.round(pct*100)+'%</span></div>';off+=pct;});svg.innerHTML=paths+'<circle cx="'+cx+'" cy="'+cy+'" r="'+(r-sw/2-1)+'" fill="#fff"/>';lg.innerHTML=lh;}
    var bm={};agF.forEach(function(f){var e=est(f);if(e==='pago'||e==='nc')return;if(!f.vencimento)return;var mon=f.vencimento.slice(0,7);bm[mon]=(bm[mon]||0)+f.valor;});
    var months=Object.keys(bm).sort().slice(-8),maxV=0;months.forEach(function(mon){if(bm[mon]>maxV)maxV=bm[mon];});
    var bc=document.getElementById('ag-bar-chart'),bl=document.getElementById('ag-bar-labels');
    if(bc&&bl){var tm=TODAY.toISOString().slice(0,7);bc.innerHTML=months.map(function(mon){var v=bm[mon],h=Math.max(3,Math.round((v/maxV)*46)),isT=mon===tm,col=isT?'#e65100':'#000';return'<div class="ag-bar" style="height:'+h+'px;background:'+col+';opacity:'+(isT?'1':'.35')+'"><div class="ag-bar-tip">'+fmtK(v)+'€</div></div>';}).join('');bl.innerHTML=months.map(function(mon){return'<div class="ag-bar-label">'+mon.slice(5)+'</div>';}).join('');}
  }
  function rBanner(){
    var ban=document.getElementById('ag-forn-banner');
    if(!agForn){ban.classList.remove('show');return;}
    var all=agF.filter(function(f){return f.fornecedor===agForn;});
    var pend=all.filter(function(f){var e=est(f);return e==='pendente'||e==='vencida';});
    var venc=pend.filter(function(f){return est(f)==='vencida';});
    var fnm=document.getElementById('ag-fb-name');fnm.textContent=agForn;fnm.style.color=fornColor(agForn)||'#000';
    var tp=pend.reduce(function(s,f){return s+f.valor;},0),tv=venc.reduce(function(s,f){return s+f.valor;},0);
    document.getElementById('ag-fb-stats').innerHTML=[{l:'pendente',v:fmt(tp),c:tp>0?'a':''},{l:'vencido',v:fmt(tv),c:tv>0?'r':''},{l:'faturas',v:pend.length,c:''}].map(function(s){return'<div class="ag-fbs"><span class="ag-fbs-l">'+s.l+'</span><span class="ag-fbs-v '+s.c+'">'+s.v+'</span></div>';}).join('');
    ban.classList.add('show');
  }
  function bRow(f,delay,seq){
    var e=est(f),d=dd(f.vencimento),tc=e==='vencida'?'ag-tr-v':e==='pago'||e==='nc'?'ag-tr-p':'';
    var ds=delay?(' style="animation-delay:'+delay+'ms"'):'';
    var dh='—';
    if(f.estado!=='pago'&&f.estado!=='nc'&&d!==null){var dc=d<0?'ag-du':d<=DAYS_TO_SUNDAY?'ag-dp':'ag-do',dl=d<0?Math.abs(d)+'d atraso':d===0?'hoje':d+'d';dh='<span class="ag-dias '+dc+'">'+dl+'</span>';}
    else if(f.estado==='pago'||f.estado==='nc')dh='<span class="ag-dias ag-dd">—</span>';
    var em={pago:'<span class="ag-est ag-est-p">✓ pago</span>',pendente:'<span class="ag-est ag-est-e">● pendente</span>',vencida:'<span class="ag-est ag-est-v">▲ vencida</span>',nc:'<span class="ag-est ag-est-n">NC</span>'};
    var vc='ag-tdr'+(f.valor<0?' ag-neg':'');
    var ro=isReadonly();
    var actions=ro?'<button class="ag-ib ag-tp" data-id="'+f.id+'">'+(e==='pago'||e==='nc'?'↩':'✓')+'</button>':'<button class="ag-ib ag-tp" data-id="'+f.id+'">'+(e==='pago'||e==='nc'?'↩':'✓')+'</button> <button class="ag-ib ag-ed" data-id="'+f.id+'">✎</button> <button class="ag-ib ag-del" data-id="'+f.id+'">×</button>';
    var chipStyle=FC_BASE[f.fornecedor]?'':'style="background:'+fornColor(f.fornecedor)+'22;color:'+fornColor(f.fornecedor)+'"';
    return'<tr class="'+tc+'" data-id="'+f.id+'"'+ds+'><td class="ag-thc ag-tdn">'+(seq!==undefined?seq:f.id)+'</td><td><span class="ag-chip ag-chip-'+f.fornecedor+'" '+chipStyle+'>'+f.fornecedor+'</span></td><td style="font-weight:bold">'+f.factura+'</td><td class="'+vc+'">'+fmt(f.valor)+'</td><td>'+fd(f.data)+'</td><td style="font-weight:bold">'+fd(f.vencimento)+'</td><td class="ag-thc">'+dh+'</td><td class="ag-thc">'+(em[e]||'')+'</td><td class="ag-thc">'+actions+'</td></tr>';
  }
  function secRow(lbl,cls){return'<tr class="ag-sec-tr '+cls+'"><td colspan="9">'+lbl+'</td></tr>';}
  function subRow(n,t){return'<tr class="ag-sub-tr"><td colspan="5"></td><td colspan="3" style="text-align:right">'+n+' fatura'+(n>1?'s':'')+' · '+fmt(t)+'</td><td></td></tr>';}
  function getF(){
    return agF.filter(function(f){
      if(agForn&&f.fornecedor!==agForn)return false;
      var q=agQ.toLowerCase();if(q&&f.factura.toLowerCase().indexOf(q)<0&&f.fornecedor.toLowerCase().indexOf(q)<0)return false;
      if(agFilter==='all')return true;var e=est(f);
      if(agFilter==='vencida')return e==='vencida';
      if(agFilter==='pendente')return e==='pendente'||e==='vencida';
      if(agFilter==='pago')return e==='pago'||e==='nc';
      return true;
    });
  }
  function getS(list){
    return list.slice().sort(function(a,b){
      var va,vb;
      if(agSort.col==='valor'){va=a.valor;vb=b.valor;}
      else if(agSort.col==='data'||agSort.col==='vencimento'){va=a[agSort.col]||'';vb=b[agSort.col]||'';}
      else if(agSort.col==='fornecedor'){va=a.fornecedor;vb=b.fornecedor;}
      else if(agSort.col==='factura'){va=a.factura;vb=b.factura;}
      else{va=a.id;vb=b.id;}
      var r=va<vb?-1:va>vb?1:0;return agSort.dir==='asc'?r:-r;
    });
  }
  function rTable(){
    var tb=document.getElementById('ag-tbody'),em=document.getElementById('ag-empty');
    if(agForn){
      var all=agF.filter(function(f){return f.fornecedor===agForn;});
      var q=agQ.toLowerCase();if(q)all=all.filter(function(f){return f.factura.toLowerCase().indexOf(q)>=0;});
      var pend=all.filter(function(f){return f.estado!=='pago'&&f.estado!=='nc';});
      pend.sort(function(a,b){var da=a.vencimento||'9999',db=b.vencimento||'9999';return da<db?-1:da>db?1:0;});
      var v=[],u=[],x=[],dist=[];
      pend.forEach(function(f){var d=dd(f.vencimento);if(d===null||d<0)v.push(f);else if(d>=0&&d<=DAYS_TO_SUNDAY)u.push(f);else if(d<=30)x.push(f);else dist.push(f);});
      if(!pend.length){tb.innerHTML='';em.style.display='block';em.textContent='sem faturas pendentes · '+agForn;return;}
      em.style.display='none';var rows=[],delay=0,seq=0;
      function addSec(list,lbl,cls){if(!list.length)return;var t=list.reduce(function(s,f){return s+f.valor;},0);rows.push(secRow(lbl+' — '+list.length+' fatura'+(list.length>1?'s':''),cls));list.forEach(function(f){seq++;rows.push(bRow(f,delay,seq));delay+=32;});rows.push(subRow(list.length,t));}
      addSec(v,'▲ vencidas','ag-sec-v');addSec(u,'● esta semana','ag-sec-u');addSec(x,'● próximas 30 dias','ag-sec-x');addSec(dist,'○ mais distantes','ag-sec-d');
      tb.innerHTML=rows.join('');return;
    }
    var list=getS(getF());
    if(!list.length){tb.innerHTML='';em.style.display='block';em.textContent='nenhuma fatura encontrada';return;}
    em.style.display='none';
    tb.innerHTML=list.map(function(f,i){return bRow(f,i*24,i+1);}).join('');
    document.querySelectorAll('#ag-table thead th[data-sort]').forEach(function(th){th.classList.remove('ag-sa','ag-sd');if(th.dataset.sort===agSort.col)th.classList.add(agSort.dir==='asc'?'ag-sa':'ag-sd');});
  }
  function rForn(){
    var m={};
    agF.forEach(function(f){if(!m[f.fornecedor])m[f.fornecedor]={p:0,e:0,t:0,n:0};var e=est(f);m[f.fornecedor].t+=f.valor;m[f.fornecedor].n++;if(e==='pago'||e==='nc')m[f.fornecedor].p+=f.valor;else m[f.fornecedor].e+=f.valor;});
    var container=document.getElementById('ag-by-forn');
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(m).filter(function(k){return known.indexOf(k)<0;}).sort();
    var allKeys=known.filter(function(k){return m[k];}).concat(others.filter(function(k){return m[k];}));
    var keys=agForn?[agForn]:allKeys;
    /* ajusta grid ao número de fornecedores */
    var cols=Math.min(keys.length,4);
    container.style.gridTemplateColumns=agForn?'1fr':'repeat('+cols+',1fr)';
    container.className=agForn?'solo':'';
    container.innerHTML=keys.map(function(k){
      var d=m[k]||{p:0,e:0,t:0,n:0};
      var col=fornColor(k);
      var hdrStyle='style="color:'+col+';background:'+col+'18;border-left:4px solid '+col+'"';
      return'<div class="ag-fb-block" style="--forn-col:'+col+'"><div class="ag-fb-hdr" '+hdrStyle+'><span>'+k+'</span><span style="font-weight:bold">'+d.n+' fat.</span></div><div class="ag-fb-row"><span class="ag-fb-rl">pago</span><span class="ag-fb-rv g">'+fmt(d.p)+'</span></div><div class="ag-fb-row"><span class="ag-fb-rl">pendente</span><span class="ag-fb-rv'+(d.e>0?' r':'')+'">'+fmt(d.e)+'</span></div><div class="ag-fb-row" style="border-top:1px solid #e6e6e6"><span class="ag-fb-rl">total</span><span class="ag-fb-rv">'+fmt(d.t)+'</span></div></div>';
    }).join('');
  }
  function rAll(){rHero();rSum();rAlerts();rInsights();rFornBtns();rBadges();rBanner();rCharts();rTable();rForn();}

  function parseVal(s){
    /* Aceita: 3.609,19 / 3609,19 / 3609.19 / 3.609.19 */
    var str = s.trim().replace(/[€\s]/g,'');
    /* Se tem vírgula como decimal (formato PT): remove pontos de milhar, troca vírgula por ponto */
    if(/,\d{1,2}$/.test(str)){
      str = str.replace(/\./g,'').replace(',','.');
    } else {
      /* Remove pontos de milhar (ex: 3.609) */
      str = str.replace(/\.(?=\d{3})/g,'');
    }
    return parseFloat(str);
  }
  function rFornDatalist(){
    /* Recolhe fornecedores de todos os anos guardados em localStorage */
    var all={};
    ALL_YEARS.forEach(function(y){
      try{
        var cached=localStorage.getItem(dataKey(y));
        if(cached){JSON.parse(cached).forEach(function(f){if(f.fornecedor)all[f.fornecedor]=true;});}
      }catch(e){}
    });
    /* Inclui também os do ano ativo em memória */
    agF.forEach(function(f){if(f.fornecedor)all[f.fornecedor]=true;});
    var known=['TAM','GIT','BESTSELLER','CHLAMYS'];
    var others=Object.keys(all).filter(function(k){return known.indexOf(k)<0;}).sort();
    var dl=document.getElementById('ag-forn-list');
    if(dl)dl.innerHTML=known.concat(others).map(function(k){return'<option value="'+k+'">';}).join('');
  }
  function openM(id){
    if(isReadonly()){snack('⊘','exercício fechado — leitura apenas');return;}
    agEditId=id||null;
    document.getElementById('ag-mt').textContent=id?'editar fatura':'nova fatura';
    if(id){var f=agF.find(function(x){return x.id===id;});if(!f)return;document.getElementById('ag-f-forn').value=f.fornecedor;document.getElementById('ag-f-fat').value=f.factura;
      /* Mostra o valor formatado PT ao editar */
      document.getElementById('ag-f-val').value=new Intl.NumberFormat('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(f.valor);
      document.getElementById('ag-f-est').value=f.estado;document.getElementById('ag-f-dat').value=f.data||'';document.getElementById('ag-f-vec').value=f.vencimento||'';}
    else{document.getElementById('ag-f-forn').value=agForn||'';document.getElementById('ag-f-fat').value='';document.getElementById('ag-f-val').value='';document.getElementById('ag-f-est').value='pendente';document.getElementById('ag-f-dat').value=activeYear+'-'+(('0'+(TODAY.getMonth()+1)).slice(-2))+'-'+(('0'+TODAY.getDate()).slice(-2));document.getElementById('ag-f-vec').value='';}
    rFornDatalist();
    document.getElementById('ag-mo').classList.add('open');
    setTimeout(function(){document.getElementById('ag-f-fat').focus();},50);
  }
  function closeM(){document.getElementById('ag-mo').classList.remove('open');agEditId=null;}
  function saveM(){
    if(isReadonly())return;
    var fat=document.getElementById('ag-f-fat').value.trim(),val=parseVal(document.getElementById('ag-f-val').value),forn=document.getElementById('ag-f-forn').value.trim(),estado=document.getElementById('ag-f-est').value,dat=document.getElementById('ag-f-dat').value,vec=document.getElementById('ag-f-vec').value;
    if(!fat){document.getElementById('ag-f-fat').focus();return;}
    if(isNaN(val)||val===0){document.getElementById('ag-f-val').focus();snack('⚠','valor inválido');return;}
    if(agEditId){var i=agF.findIndex(function(x){return x.id===agEditId;});if(i>=0)agF[i]={id:agEditId,fornecedor:forn,factura:fat,valor:val,estado:estado,data:dat,vencimento:vec};}
    else agF.push({id:nid(),fornecedor:forn,factura:fat,valor:val,estado:estado,data:dat,vencimento:vec});
    save();closeM();rAll();snack('✓','fatura guardada');
  }
  function animPaid(id){
    var tr=document.querySelector('#ag-tbody tr[data-id="'+id+'"]');
    if(tr){tr.classList.add('ag-tr-paying');setTimeout(function(){rAll();snack('✓','marcada como paga');},500);}
    else{rAll();snack('✓','marcada como paga');}
  }

  document.getElementById('ag-btn-nova').addEventListener('click',function(e){rpl(this,e);openM(null);});
  document.getElementById('ag-mo').addEventListener('click',function(e){if(e.target===this)closeM();});
  document.getElementById('ag-mc').addEventListener('click',closeM);
  document.getElementById('ag-ms').addEventListener('click',function(e){rpl(this,e);saveM();});
  document.getElementById('ag-btn-close-year').addEventListener('click',closeYear);
  document.getElementById('ag-btn-edit-once').addEventListener('click',function(){_editOnceActive=true;rEditOnce();rReadonlyBanner();rToolbarState();snack('✎','modo edição ativo — pode editar este exercício');});
  document.getElementById('ag-btn-confirm-once').addEventListener('click',function(){
    if(!confirm('Confirmar e encerrar a edição do exercício '+activeYear+'?\n\nA edição única ficará bloqueada depois desta ação.'))return;
    _editOnceActive=false;localStorage.setItem(editOnceKey(activeYear),'1');rEditOnce();rReadonlyBanner();rToolbarState();save();snack('✓','edição confirmada e bloqueada');
  });
  document.addEventListener('keydown',function(e){
    var ov=document.getElementById('agenda-overlay');if(!ov||!ov.classList.contains('open'))return;
    if(e.key==='Escape'){var mo=document.getElementById('ag-mo');if(mo&&mo.classList.contains('open'))closeM();else window.closeAgendaOverlay();}
    if(e.key==='Enter'&&document.getElementById('ag-mo').classList.contains('open'))saveM();
    if(e.key==='n'&&!document.getElementById('ag-mo').classList.contains('open')&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='SELECT'){e.preventDefault();openM(null);}
  });
  document.querySelectorAll('.ag-filter-btn').forEach(function(btn){
    btn.addEventListener('click',function(){agFilter=this.dataset.filter;agForn=null;document.querySelectorAll('.ag-fb').forEach(function(b){b.classList.remove('active');});document.querySelectorAll('.ag-filter-btn').forEach(function(b){b.classList.remove('active');});this.classList.add('active');rBanner();rTable();rForn();});
  });
  document.querySelectorAll('#ag-table thead th[data-sort]').forEach(function(th){
    th.addEventListener('click',function(){var c=this.dataset.sort;agSort.dir=agSort.col===c?(agSort.dir==='asc'?'desc':'asc'):'asc';agSort.col=c;rTable();});
  });
  document.getElementById('ag-tbody').addEventListener('click',function(e){
    var btn=e.target.closest('button');if(!btn)return;
    var id=parseInt(btn.dataset.id,10);
    if(btn.classList.contains('ag-ed')){openM(id);}
    if(btn.classList.contains('ag-del')){if(isReadonly())return;if(confirm('Eliminar esta fatura?')){agF=agF.filter(function(f){return f.id!==id;});save();rAll();snack('×','fatura eliminada');}}
    if(btn.classList.contains('ag-tp')){var f=agF.find(function(x){return x.id===id;});if(f){var ev=est(f);f.estado=(ev==='pago'||ev==='nc')?'pendente':'pago';save();if(f.estado==='pago')animPaid(id);else{rAll();snack('↩','marcada como pendente');}}}
  });

  load(activeYear);
  setTimeout(function(){
    rYearNav();rReadonlyBanner();rEditOnce();rToolbarState();
    document.getElementById('ag-today').textContent=TODAY.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toLowerCase();
  },0);
}

})();
