/* ══════════════════════════════════════════════════════
   RÓTULOS — módulo completo  v2
   · Bug fix: shipments ya no se borran al abrir
   · Supabase sync (tabla rotulos_data: id text PK, payload jsonb)
   · Campo de fecha en "gerar rótulos" (por defecto hoy)
   · Modal "registar envio passado" en controlo de entregas
══════════════════════════════════════════════════════ */

(function () {
'use strict';

var RT_CSS = `
#rt-app { max-width: 1040px; margin: 0 auto; padding: 28px 20px 60px; }
#rt-hd { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 10px; }
#rt-hd-title { font-size: 2rem; font-weight: 100; text-transform: lowercase; letter-spacing: .1em; }
#rt-hd-date { font-size: .82rem; font-weight: bold; text-transform: lowercase; }
.rt-slabel { font-size: .72rem; font-weight: bold; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 10px; }
#rt-sum-section { margin-bottom: 28px; }
#rt-sum-wrap { border: 1px solid #e6e6e6; border-radius: 14px; overflow: hidden; overflow-x: auto; }
#rt-sum-table { width: 100%; border-collapse: collapse; font-size: .82rem; white-space: nowrap; }
#rt-sum-table thead th { background: #f5f5f5; padding: 9px 14px; text-align: center; font-size: .7rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #e6e6e6; border-right: 1px solid #e6e6e6; }
#rt-sum-table thead th:first-child { text-align: left; }
#rt-sum-table thead th:last-child { border-right: none; }
#rt-sum-table tbody td { padding: 7px 14px; border-bottom: 1px solid #f0f0f0; border-right: 1px solid #f0f0f0; text-align: center; }
#rt-sum-table tbody td:first-child { text-align: left; }
#rt-sum-table tbody td:last-child { border-right: none; }
#rt-sum-table tbody tr:last-child td { border-bottom: none; }
#rt-sum-table tbody tr:hover td { background: #fafafa; }
#rt-sum-table tfoot td { padding: 8px 14px; background: #f5f5f5; font-weight: bold; border-top: 2px solid #e6e6e6; border-right: 1px solid #e6e6e6; text-align: center; }
#rt-sum-table tfoot td:first-child { text-align: left; }
#rt-sum-table tfoot td:last-child { border-right: none; }
.rt-num { font-weight: bold; }
#rt-tabs { display: flex; border-bottom: 1px solid #e6e6e6; margin-bottom: 24px; }
.rt-tab-btn { padding: 10px 22px; font-size: .82rem; font-weight: bold; text-transform: lowercase; border: none; background: transparent; color: #000; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: border-color .15s; font-family: 'MontserratLight', sans-serif; }
.rt-tab-btn.active { border-bottom-color: #000; }
.rt-tab-panel { display: none; }
.rt-tab-panel.active { display: block; }
#rt-gen-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
.rt-card { background: #fff; border: 1px solid #e6e6e6; border-radius: 14px; padding: 20px; }
.rt-card-title { font-size: .72rem; font-weight: bold; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e6e6e6; }
.rt-dest-sec { margin-bottom: 14px; }
.rt-dest-lbl { font-size: .68rem; font-weight: bold; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
.rt-ddot { width: 6px; height: 6px; border-radius: 50%; background: #000; }
.rt-store-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.rt-store-row label { flex: 1; font-size: .84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-acc-n { font-size: .7rem; font-weight: bold; min-width: 36px; text-align: right; font-family: monospace; }
.rt-qty-inp { width: 60px; border: 1px solid #e6e6e6; border-radius: 20px; padding: 5px 8px; font-size: .88rem; font-weight: bold; text-align: center; outline: none; transition: border-color .15s; background: #fff; color: #000; }
.rt-qty-inp:focus { border-color: #000; }
.rt-qty-inp::-webkit-outer-spin-button,.rt-qty-inp::-webkit-inner-spin-button { -webkit-appearance: none; }
.rt-add-st-btn { width: 100%; padding: 7px; background: #fff; border: 1px dashed #ccc; border-radius: 20px; color: #000; font-size: .76rem; cursor: pointer; transition: border-color .15s; margin-top: 2px; font-family: 'MontserratLight', sans-serif; }
.rt-add-st-btn:hover { border-color: #000; }
.rt-divider { height: 1px; background: #e6e6e6; margin: 14px 0; }
.rt-btn-prim { width: 100%; padding: 11px; background: #000; color: #fff; border: none; border-radius: 20px; font-size: .88rem; font-weight: bold; text-transform: lowercase; cursor: pointer; transition: background .15s; font-family: 'MontserratLight', sans-serif; }
.rt-btn-prim:hover { background: #333; }
.rt-acc-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: .8rem; border-bottom: 1px solid #f5f5f5; }
.rt-acc-row:last-child { border-bottom: none; }
.rt-acc-val { font-weight: bold; font-family: monospace; }
#rt-prev-empty { border: 1px dashed #e6e6e6; border-radius: 14px; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: .85rem; text-align: center; }
.rt-prev-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.rt-prev-hd h3 { font-size: .75rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; }
.rt-prev-actions { display: flex; gap: 8px; }
.rt-btn-sm { padding: 6px 15px; border-radius: 20px; font-size: .76rem; font-weight: bold; cursor: pointer; border: 1px solid #e6e6e6; background: #fff; color: #000; text-transform: lowercase; display: inline-flex; align-items: center; gap: 5px; transition: all .15s; font-family: 'MontserratLight', sans-serif; }
.rt-btn-sm:hover { border-color: #000; }
.rt-btn-sm.bk { background: #000; color: #fff; border-color: #000; }
.rt-lbl-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; max-height: 560px; overflow-y: auto; }
.rt-lp { border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px; font-family: Arial,sans-serif; }
.rt-lp-send { font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; }
.rt-lp-st { font-size: 14px; font-weight: 900; text-transform: uppercase; padding-bottom: 7px; margin-bottom: 7px; border-bottom: 2px solid #000; }
.rt-lp-ad,.rt-lp-cp { font-size: 10px; }
.rt-lp-cp { margin-bottom: 9px; }
.rt-lp-cd { font-size: 10px; font-weight: 700; font-family: 'Courier New',monospace; background: #f5f5f5; padding: 6px 8px; border-radius: 3px; border-left: 3px solid #000; word-break: break-all; }
.rt-filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
.rt-fl { font-size: .7rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; margin-right: 4px; }
.rt-fb { padding: 6px 14px; border-radius: 20px; font-size: .76rem; font-weight: bold; cursor: pointer; border: 1px solid #e6e6e6; background: #fff; color: #000; text-transform: lowercase; transition: all .15s; font-family: 'MontserratLight', sans-serif; }
.rt-fb.active { background: #000; color: #fff; border-color: #000; }
.rt-sl { display: flex; flex-direction: column; gap: 12px; }
.rt-sg { border: 1px solid #e6e6e6; border-radius: 14px; overflow: hidden; }
.rt-sg-hd { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: #fafafa; border-bottom: 1px solid #e6e6e6; }
.rt-sg-t-wrap { display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer; }
.rt-sg-t { font-size: .9rem; font-weight: bold; }
.rt-sg-m { display: flex; gap: 10px; align-items: center; }
.rt-sg-b { padding: 2px 9px; border-radius: 20px; font-size: .7rem; font-weight: bold; background: #000; color: #fff; }
.rt-sg-pr,.rt-sg-ok { font-size: .76rem; font-weight: bold; }
.rt-sg-ch { font-size: 11px; transition: transform .2s; }
.rt-sg.col .rt-sg-ch { transform: rotate(-90deg); }
.rt-sg-bx { padding: 6px 16px 10px; display: flex; flex-direction: column; gap: 4px; }
.rt-sg.col .rt-sg-bx { display: none; }
.rt-bx { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border: 1px solid #f0f0f0; border-radius: 8px; }
.rt-bx.done { opacity: .4; }
.rt-bx-chk { width: 15px; height: 15px; border-radius: 3px; border: 2px solid #e6e6e6; background: #fff; cursor: pointer; appearance: none; -webkit-appearance: none; flex-shrink: 0; position: relative; transition: all .15s; }
.rt-bx-chk:checked { background: #000; border-color: #000; }
.rt-bx-chk:checked::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-52%); color: #fff; font-size: 8px; font-weight: bold; }
.rt-bx-dot { width: 6px; height: 6px; border-radius: 50%; background: #000; flex-shrink: 0; }
.rt-bx-cd { font-family: monospace; font-size: .76rem; flex: 1; }
.rt-bx-st { font-size: .76rem; font-weight: bold; white-space: nowrap; }
.rt-bx.done .rt-bx-cd { text-decoration: line-through; opacity: .5; }
.rt-reprint-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border: 1px solid #000; border-radius: 20px; background: #fff; color: #000; font-size: .74rem; font-weight: bold; text-transform: lowercase; cursor: pointer; flex-shrink: 0; transition: all .15s; white-space: nowrap; font-family: 'MontserratLight', sans-serif; }
.rt-reprint-btn:hover { background: #000; color: #fff; }
.rt-mm { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 900; display: none; align-items: center; justify-content: center; }
.rt-mm.open { display: flex; }
.rt-mm-b { background: #fff; border: 1px solid #e6e6e6; border-radius: 14px; padding: 28px; width: 340px; box-shadow: 0 20px 60px rgba(0,0,0,.12); }
.rt-mm-b h3 { font-size: .95rem; font-weight: bold; margin-bottom: 20px; text-transform: lowercase; }
.rt-fld { margin-bottom: 12px; }
.rt-fld label { display: block; font-size: .68rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 5px; }
.rt-fld input { width: 100%; padding: 8px 12px; border: 1px solid #e6e6e6; border-radius: 20px; font-size: .88rem; outline: none; transition: border-color .15s; font-family: 'MontserratLight', sans-serif; }
.rt-fld input:focus { border-color: #000; }
.rt-mm-act { display: flex; gap: 8px; margin-top: 20px; }
.rt-btn-cnc { flex: 1; padding: 9px; background: #fff; border: 1px solid #e6e6e6; border-radius: 20px; cursor: pointer; font-size: .84rem; font-weight: bold; text-transform: lowercase; transition: border-color .15s; font-family: 'MontserratLight', sans-serif; }
.rt-btn-cnc:hover { border-color: #000; }
.rt-btn-cnf { flex: 1; padding: 9px; background: #000; border: none; border-radius: 20px; color: #fff; cursor: pointer; font-size: .84rem; font-weight: bold; text-transform: lowercase; font-family: 'MontserratLight', sans-serif; }
#rt-modal-print { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); z-index: 9999; display: none; align-items: center; justify-content: center; }
#rt-modal-print .rt-mp-box { background: #fff; border-radius: 14px; width: 92vw; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.25); }
.rt-mp-hd { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px; border-bottom: 1px solid #e6e6e6; flex-shrink: 0; }
.rt-mp-hd h2 { font-size: .84rem; font-weight: bold; text-transform: lowercase; }
.rt-mp-actions { display: flex; gap: 8px; align-items: center; }
.rt-mp-body { overflow-y: auto; padding: 20px; flex: 1; }
.rt-mp-close { width: 28px; height: 28px; border: 1px solid #e6e6e6; border-radius: 50%; background: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all .15s; }
.rt-mp-close:hover { border-color: #c00; color: #c00; }
.rt-pg-lbl { font-size: .68rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
.rt-psheet { display: flex; flex-direction: column; border: 1px solid #ccc; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
.rt-rot { padding: 10px 20px; border-bottom: 1px solid #ccc; font-family: Arial,sans-serif; background: #fff; }
.rt-rot:last-child { border-bottom: none; }
.rt-rot.empty { background: #fafafa; min-height: 50px; }
.rt-rot .rs { font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 3px; }
.rt-rot .rn { font-size: 15px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px; }
.rt-rot .ra,.rt-rot .rc { font-size: 10px; }
.rt-rot .rc { margin-bottom: 6px; }
.rt-rot .rk { font-size: 10px; font-weight: 700; font-family: 'Courier New',monospace; background: #f2f2f2; padding: 5px 8px; border-radius: 3px; border-left: 3px solid #000; display: inline-block; word-break: break-all; }
#rt-print-area { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body > * { display: none !important; }
  #rt-print-area { display: block !important; margin: 0; padding: 0; }
  .rt-pp { display: flex; flex-direction: column; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; page-break-after: always; break-after: page; margin: 0; padding: 0; }
  .rt-pp:last-child { page-break-after: avoid; break-after: avoid; }
  .rt-pp-r { flex: 0 0 calc(297mm / 8); height: calc(297mm / 8); max-height: calc(297mm / 8); overflow: hidden; padding: 2mm 12mm; border-bottom: 0.3pt solid #ccc; display: flex; flex-direction: column; justify-content: center; font-family: Arial, sans-serif; page-break-inside: avoid; break-inside: avoid; }
  .rt-pp-r:last-child { border-bottom: none; }
  .rt-pp-send { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1mm; color: #999; }
  .rt-pp-st { font-size: 16pt; font-weight: 900; text-transform: uppercase; margin-bottom: 1.5mm; line-height: 1.1; }
  .rt-pp-ad { font-size: 9pt; line-height: 1.3; }
  .rt-pp-cp { font-size: 9pt; margin-bottom: 1.5mm; }
  .rt-pp-cd { font-size: 9pt; font-weight: 700; font-family: 'Courier New',monospace; background: #f2f2f2; padding: 1.5mm 2.5mm; border-left: 2.5pt solid #000; display: inline-block; }
}
.rt-toast { position: fixed; bottom: 24px; right: 24px; background: #000; color: #fff; border-radius: 20px; padding: 9px 18px; font-size: .8rem; font-weight: bold; z-index: 99999; opacity: 0; transform: translateY(20px); transition: all .25s; pointer-events: none; font-family: 'MontserratLight', sans-serif; }
.rt-toast.show { opacity: 1; transform: translateY(0); }
.rt-toast.ok { background: #2e7d32; }
.rt-es { text-align: center; padding: 50px 20px; font-size: .84rem; }
@media (max-width: 900px) { #rt-gen-layout { grid-template-columns: 1fr; } .rt-lbl-grid { grid-template-columns: 1fr; } }

/* ── Date picker row ── */
.rt-date-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e6e6e6; }
.rt-date-lbl { font-size: .68rem; font-weight: bold; text-transform: uppercase; letter-spacing: .1em; white-space: nowrap; }
.rt-date-inp { flex: 1; border: 1px solid #e6e6e6; border-radius: 20px; padding: 5px 12px; font-size: .82rem; font-weight: bold; outline: none; transition: border-color .15s; font-family: 'MontserratLight', sans-serif; background: #fff; color: #000; }
.rt-date-inp:focus { border-color: #000; }
.rt-past-badge { font-size: .66rem; font-weight: bold; background: #fff3e0; color: #e65100; border: 1px solid #ffcc80; border-radius: 20px; padding: 2px 8px; white-space: nowrap; display: none; }
.rt-past-badge.show { display: inline-block; }

/* ── Historical shipment modal ── */
#rt-hist-modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 950; display: none; align-items: center; justify-content: center; }
#rt-hist-modal.open { display: flex; }
#rt-hist-box { background: #fff; border-radius: 16px; padding: 28px; width: min(480px, 94vw); max-height: 85vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,.2); }
#rt-hist-box h3 { font-size: .95rem; font-weight: bold; text-transform: lowercase; margin-bottom: 6px; }
.rt-hist-sub { font-size: .75rem; color: #888; font-weight: bold; margin-bottom: 20px; }
.rt-hist-date-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.rt-hist-date-row label { font-size: .68rem; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; }
#rt-hist-date { flex: 1; border: 1px solid #e6e6e6; border-radius: 20px; padding: 7px 14px; font-size: .88rem; font-weight: bold; outline: none; font-family: 'MontserratLight', sans-serif; transition: border-color .15s; }
#rt-hist-date:focus { border-color: #000; }
.rt-hist-sec-lbl { font-size: .66rem; font-weight: bold; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.rt-hist-stores { margin-bottom: 16px; }
.rt-hist-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.rt-hist-row label { flex: 1; font-size: .84rem; }
.rt-hist-row .rt-acc-n { font-size: .7rem; font-weight: bold; min-width: 36px; text-align: right; font-family: monospace; }
.rt-hist-act { display: flex; gap: 8px; margin-top: 20px; }
.rt-btn-hist { padding: 5px 14px; font-size: .76rem; font-weight: bold; cursor: pointer; border: 1px solid #e6e6e6; border-radius: 20px; background: #fff; color: #000; text-transform: lowercase; transition: all .15s; font-family: 'MontserratLight', sans-serif; margin-left: auto; }
.rt-btn-hist:hover { border-color: #000; background: #000; color: #fff; }

/* ── Sync indicator ── */
#rt-sync-dot { width: 7px; height: 7px; border-radius: 50%; background: #ccc; display: inline-block; margin-left: 8px; transition: background .3s; }
#rt-sync-dot.syncing { background: #e65100; }
#rt-sync-dot.ok { background: #2e7d32; }
`;

var RT_HTML = `
<div id="rt-app">
  <div id="rt-hd">
    <div id="rt-hd-title">wakzome rótulos <span id="rt-sync-dot" title="estado sync"></span></div>
    <div id="rt-hd-date"></div>
  </div>
  <div id="rt-sum-section">
    <div class="rt-slabel">resumo do ano</div>
    <div id="rt-sum-wrap">
      <table id="rt-sum-table">
        <thead><tr>
          <th style="text-align:left">data</th>
          <th>funchal</th><th>porto santo</th>
          <th>m.f</th><th>m.a</th><th>m.m</th><th>sh</th><th>mx</th>
        </tr></thead>
        <tbody id="rt-sum-body"><tr><td colspan="8" style="text-align:center;padding:16px;font-size:.82rem">sem envios registados este ano</td></tr></tbody>
        <tfoot id="rt-sum-foot"></tfoot>
      </table>
    </div>
  </div>
  <div id="rt-tabs">
    <button class="rt-tab-btn active" onclick="rtSwitchTab('gen',this)">gerar rótulos</button>
    <button class="rt-tab-btn" onclick="rtSwitchTab('ctrl',this)">controlo de entregas</button>
  </div>
  <div class="rt-tab-panel active" id="rt-tab-gen">
    <div id="rt-gen-layout">
      <div>
        <div class="rt-card">
          <div class="rt-card-title">configurar envio</div>
          <!-- DATE PICKER -->
          <div class="rt-date-row">
            <span class="rt-date-lbl">data</span>
            <input type="date" class="rt-date-inp" id="rt-gen-date" />
            <span class="rt-past-badge" id="rt-past-badge">data passada</span>
          </div>
          <div class="rt-dest-sec">
            <div class="rt-dest-lbl"><span class="rt-ddot"></span>funchal</div>
            <div id="rt-stores-f"></div>
            <button class="rt-add-st-btn" onclick="rtOpenAdd('f')">+ adicionar loja funchal</button>
          </div>
          <div class="rt-divider"></div>
          <div class="rt-dest-sec">
            <div class="rt-dest-lbl"><span class="rt-ddot"></span>porto santo</div>
            <div id="rt-stores-p"></div>
            <button class="rt-add-st-btn" onclick="rtOpenAdd('p')">+ adicionar loja porto santo</button>
          </div>
          <div class="rt-divider"></div>
          <button class="rt-btn-prim" onclick="rtGenerate()">gerar rótulos</button>
        </div>
        <div class="rt-card" style="margin-top:12px;padding:14px 16px">
          <div class="rt-card-title" style="margin-bottom:10px;padding-bottom:8px">acumulado por loja</div>
          <div id="rt-acc-info"></div>
        </div>
      </div>
      <div>
        <div id="rt-prev-empty">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <span style="color:#aaa">configure o envio e clique em "gerar rótulos"</span>
        </div>
        <div id="rt-prev-panel" style="display:none">
          <div class="rt-prev-hd">
            <h3 id="rt-prev-title">rótulos</h3>
            <div class="rt-prev-actions">
              <button class="rt-btn-sm" onclick="rtOpenPrintModal()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                imprimir / pdf
              </button>
              <button class="rt-btn-sm bk" onclick="rtSaveShipment()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                guardar envio
              </button>
            </div>
          </div>
          <div class="rt-lbl-grid" id="rt-lbl-grid"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="rt-tab-panel" id="rt-tab-ctrl">
    <div class="rt-filters">
      <span class="rt-fl">filtrar:</span>
      <button class="rt-fb active" onclick="rtFCtrl('all',this)">todos</button>
      <button class="rt-fb" onclick="rtFCtrl('pending',this)">com pendentes</button>
      <button class="rt-fb" onclick="rtFCtrl('done',this)">completos</button>
      <button class="rt-fb" onclick="rtFCtrl('f',this)">funchal</button>
      <button class="rt-fb" onclick="rtFCtrl('p',this)">porto santo</button>
      <button class="rt-btn-hist" onclick="rtOpenHistModal()">+ registar envio passado</button>
    </div>
    <div class="rt-sl" id="rt-sl"></div>
  </div>
</div>
<div id="rt-modal-print">
  <div class="rt-mp-box">
    <div class="rt-mp-hd">
      <h2 id="rt-mp-title">prévia de impressão</h2>
      <div class="rt-mp-actions">
        <button class="rt-btn-sm" onclick="rtDoPrint()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          imprimir
        </button>
        <button class="rt-btn-sm" onclick="rtExportPDF()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          exportar pdf
        </button>
        <button class="rt-btn-sm" onclick="rtSendEmail()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          enviar email
        </button>
        <button class="rt-mp-close" onclick="rtClosePrintModal()">✕</button>
      </div>
    </div>
    <div class="rt-mp-body" id="rt-mp-body"></div>
  </div>
</div>
<!-- New store modal -->
<div class="rt-mm" id="rt-mm-add">
  <div class="rt-mm-b">
    <h3>nova loja</h3>
    <div class="rt-fld"><label>nome da loja</label><input id="rt-ns-nm" placeholder="ex: mezka forum" /></div>
    <div class="rt-fld"><label>código (ex: M, SH, MX)</label><input id="rt-ns-cd" placeholder="M" maxlength="4" style="text-transform:uppercase" /></div>
    <div class="rt-fld"><label>abreviatura rótulo (ex: FCN)</label><input id="rt-ns-ab" placeholder="FCN" maxlength="5" style="text-transform:uppercase" /></div>
    <div class="rt-fld"><label>morada</label><input id="rt-ns-ad" placeholder="Rua..." /></div>
    <div class="rt-fld"><label>código postal + cidade</label><input id="rt-ns-cp" placeholder="9400-168 Porto Santo" /></div>
    <input type="hidden" id="rt-ns-dt" value="f" />
    <div class="rt-mm-act">
      <button class="rt-btn-cnc" onclick="rtCloseAdd()">cancelar</button>
      <button class="rt-btn-cnf" onclick="rtConfirmAdd()">adicionar</button>
    </div>
  </div>
</div>
<!-- Historical shipment modal -->
<div id="rt-hist-modal">
  <div id="rt-hist-box">
    <h3>registar envio passado</h3>
    <p class="rt-hist-sub">introduza a data e as quantidades enviadas. o acumulador será actualizado.</p>
    <div class="rt-hist-date-row">
      <label>data do envio</label>
      <input type="date" id="rt-hist-date" />
    </div>
    <div class="rt-hist-sec-lbl"><span class="rt-ddot"></span>funchal</div>
    <div class="rt-hist-stores" id="rt-hist-stores-f"></div>
    <div class="rt-hist-sec-lbl" style="margin-top:10px"><span class="rt-ddot"></span>porto santo</div>
    <div class="rt-hist-stores" id="rt-hist-stores-p"></div>
    <div class="rt-hist-act">
      <button class="rt-btn-cnc" onclick="rtCloseHistModal()" style="flex:1">cancelar</button>
      <button class="rt-btn-cnf" onclick="rtConfirmHist()" style="flex:1">registar</button>
    </div>
  </div>
</div>
<div class="rt-toast" id="rt-toast"></div>
<div id="rt-print-area"></div>
`;

var _rtStyleInjected = false;
function rtInjectStyle() {
  if (_rtStyleInjected) return;
  _rtStyleInjected = true;
  var s = document.createElement('style');
  s.id = 'rt-module-style';
  s.textContent = RT_CSS;
  document.head.appendChild(s);
}

var _rtHtmlInjected = false;
function rtInjectHtml() {
  if (_rtHtmlInjected) return;
  _rtHtmlInjected = true;
  var root = document.getElementById('rt-root');
  if (root) root.innerHTML = RT_HTML;
  rtBindLogic();
}

window.openRotulosOverlay = function () {
  rtInjectStyle();
  var ov = document.getElementById('rotulos-overlay');
  if (!ov) return;
  ov.classList.add('open');
  requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('visible'); }); });
  rtInjectHtml();
};

window.closeRotulosOverlay = function () {
  var ov = document.getElementById('rotulos-overlay');
  if (!ov) return;
  ov.classList.remove('visible');
  setTimeout(function () { ov.classList.remove('open'); }, 600);
};

function rtBindLogic() {
  var YEAR    = new Date().getFullYear();
  var SK      = 'wkz_rt_' + YEAR;
  var BASE_IDS = ['fcn','av','mc','sh','mx'];

  var DEFAULT_STORES = {
    f: [{id:'fcn',name:'MEZKA FUNCHAL',code:'M',abr:'FCN',addr:'R. DE S. FRANCISCO 20 - ARCADAS S. FRANCISCO LJ.5',cp:'9000-150 Funchal',dest:'f'}],
    p: [
      {id:'av',name:'MEZKA AVENIDA',code:'M',abr:'AV',addr:'EDIFÍCIO ILHA DOURADA',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'mc',name:'MEZKA MERCADO',code:'M',abr:'MC',addr:'PRAÇA DO BARQUEIRO',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'sh',name:'SHANA',code:'SH',abr:'SH',addr:'R. DR. MANUEL GREGÓRIO P. JUNIOR',cp:'9400-168 Porto Santo',dest:'p'},
      {id:'mx',name:'MAXX',code:'MX',abr:'MX',addr:'RUA BARTOLOMEU PERESTRELO',cp:'9400-168 Porto Santo',dest:'p'}
    ]
  };

  /* ── Helpers ── */
  function rtSB() { return (typeof sbClient !== 'undefined') ? sbClient : null; }

  function setSyncDot(state) {
    var d = document.getElementById('rt-sync-dot');
    if (!d) return;
    d.className = state; // '', 'syncing', 'ok'
  }

  function mergeStores(saved) {
    var stores = JSON.parse(JSON.stringify(DEFAULT_STORES));
    ['f','p'].forEach(function(dest) {
      var customs = ((saved.stores||{})[dest]||[]).filter(function(s){ return BASE_IDS.indexOf(s.id)===-1; });
      stores[dest] = stores[dest].concat(customs);
    });
    return stores;
  }

  /* ── loadData: Supabase first, fallback localStorage ── */
  function loadDataLocal() {
    var stores = JSON.parse(JSON.stringify(DEFAULT_STORES));
    try {
      var raw = localStorage.getItem(SK);
      if (raw) {
        var saved = JSON.parse(raw);
        stores = mergeStores(saved);
        return { stores: stores, shipments: saved.shipments||[], acc: saved.acc||{} };
      }
    } catch(e) {}
    return { stores: stores, shipments: [], acc: {} };
  }

  /* ── saveData: localStorage + Supabase async ── */
  function saveData() {
    localStorage.setItem(SK, JSON.stringify(D));
    var sb = rtSB();
    if (!sb) return;
    setSyncDot('syncing');
    sb.from('rotulos_data')
      .upsert({ id: SK, payload: D }, { onConflict: 'id' })
      .then(function(res) {
        setSyncDot(res.error ? '' : 'ok');
        if (res.error) console.warn('RT Supabase save error', res.error);
        setTimeout(function(){ setSyncDot(''); }, 2000);
      });
  }

  /* ── Initial load: try Supabase, fall back to localStorage ── */
  var D = loadDataLocal();
  /* NOTE: bug fix — removed the lines that wiped D.shipments and D.acc on every open */

  var sb = rtSB();
  if (sb) {
    setSyncDot('syncing');
    sb.from('rotulos_data').select('payload').eq('id', SK).single()
      .then(function(res) {
        setSyncDot('');
        if (!res.error && res.data && res.data.payload) {
          var saved = res.data.payload;
          D.stores    = mergeStores(saved);
          D.shipments = saved.shipments || [];
          D.acc       = saved.acc || {};
          localStorage.setItem(SK, JSON.stringify(D)); // keep local in sync
          rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
          rtToast('sincronizado ✓', 'ok');
        }
      })
      .catch(function(e) { setSyncDot(''); console.warn('RT Supabase load error', e); });
  }

  var CL     = [];
  var CF     = 'all';
  var PITEMS = [];

  /* ── Active date for "gerar" tab ── */
  var ACTIVE_DATE = new Date();

  function allS(){ return [].concat(D.stores.f||[], D.stores.p||[]); }

  /* Set up date picker default = today */
  (function initDatePicker(){
    var inp = document.getElementById('rt-gen-date');
    if (!inp) return;
    var t = new Date();
    inp.value = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    inp.addEventListener('change', function(){
      if (!inp.value) { ACTIVE_DATE = new Date(); return; }
      var parts = inp.value.split('-');
      ACTIVE_DATE = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      var today = new Date(); today.setHours(0,0,0,0);
      var ad = new Date(ACTIVE_DATE); ad.setHours(0,0,0,0);
      var badge = document.getElementById('rt-past-badge');
      if (badge) badge.classList.toggle('show', ad < today);
    });
  })();

  document.getElementById('rt-hd-date').textContent = new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toLowerCase();

  window.rtSwitchTab = function(n, btn){
    document.querySelectorAll('.rt-tab-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.rt-tab-panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('rt-tab-'+n).classList.add('active');
    if (n==='ctrl') rtRCtrl();
  };

  function rtRStores(){ rtRSec('f','rt-stores-f'); rtRSec('p','rt-stores-p'); }
  function rtRSec(dest, cid){
    var el = document.getElementById(cid); el.innerHTML='';
    (D.stores[dest]||[]).forEach(function(s){
      var row = document.createElement('div'); row.className='rt-store-row';
      row.innerHTML='<label>'+s.name+'</label><span class="rt-acc-n">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span><input class="rt-qty-inp" type="number" min="0" id="rtq_'+s.id+'" />';
      el.appendChild(row);
    });
  }
  function rtRAcc(){
    document.getElementById('rt-acc-info').innerHTML = allS().map(function(s){
      return '<div class="rt-acc-row"><span>'+s.name+'</span><span class="rt-acc-val">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span></div>';
    }).join('');
  }

  window.rtOpenAdd = function(dest){
    ['rt-ns-nm','rt-ns-cd','rt-ns-ab','rt-ns-ad','rt-ns-cp'].forEach(function(i){ document.getElementById(i).value=''; });
    document.getElementById('rt-ns-dt').value=dest;
    document.getElementById('rt-mm-add').classList.add('open');
    setTimeout(function(){ document.getElementById('rt-ns-nm').focus(); }, 50);
  };
  window.rtCloseAdd = function(){ document.getElementById('rt-mm-add').classList.remove('open'); };
  window.rtConfirmAdd = function(){
    var nm=document.getElementById('rt-ns-nm').value.trim().toUpperCase();
    var cd=document.getElementById('rt-ns-cd').value.trim().toUpperCase();
    var ab=document.getElementById('rt-ns-ab').value.trim().toUpperCase();
    var ad=document.getElementById('rt-ns-ad').value.trim().toUpperCase();
    var cp=document.getElementById('rt-ns-cp').value.trim().toUpperCase();
    var dt=document.getElementById('rt-ns-dt').value;
    if(!nm||!ab){ rtToast('preencha nome e abreviatura'); return; }
    var id=ab.toLowerCase()+'_'+Date.now();
    if(!D.stores[dt]) D.stores[dt]=[];
    D.stores[dt].push({id:id,name:nm,code:cd||ab,abr:ab,addr:ad,cp:cp,dest:dt});
    saveData(); rtCloseAdd(); rtRStores(); rtRAcc(); rtRSum();
    rtToast('loja "'+nm+'" adicionada','ok');
  };

  /* ── mkCode: accepts optional dateObj, defaults to ACTIVE_DATE ── */
  function mkCode(s, accBox, boxNum, total, extraN, dateObj){
    var d   = dateObj || ACTIVE_DATE;
    var dd  = String(d.getDate()).padStart(2,'0');
    var mm  = String(d.getMonth()+1).padStart(2,'0');
    var yy  = String(d.getFullYear()).slice(-2);
    var base = dd+mm+'LJ-'+s.code+'-'+s.abr+'-'+yy+'/'+String(accBox).padStart(4,'0')+'*** '+boxNum+'-'+total+' CX';
    if(extraN) base+=' (EXTRA '+extraN+')';
    return base;
  }

  function dateToStr(d){ return d.toLocaleDateString('pt-PT'); }

  function hasDateShipment(sid, dateStr){
    return D.shipments.some(function(sh){ return sh.date===dateStr && sh.boxes.some(function(b){ return b.storeId===sid && !b.isExtra; }); });
  }
  function extraCountForDate(sid, dateStr){
    var n=0;
    D.shipments.forEach(function(sh){ if(sh.date===dateStr) sh.boxes.forEach(function(b){ if(b.storeId===sid&&b.isExtra) n++; }); });
    return n;
  }

  window.rtGenerate = function(){
    var items = [];
    var ds = dateToStr(ACTIVE_DATE);
    allS().forEach(function(s){
      var el  = document.getElementById('rtq_'+s.id);
      var qty = parseInt(el && el.value) || 0;
      if(qty > 0){
        var acc  = D.acc[s.id] || 0;
        var isX  = hasDateShipment(s.id, ds);
        var xBase= extraCountForDate(s.id, ds);
        for(var i=1;i<=qty;i++) items.push({s:s, boxNum:i, total:qty, accBox:acc+i, isExtra:isX, extraN:isX?(xBase+i):0});
      }
    });
    if(!items.length){ rtToast('introduza quantidades para pelo menos uma loja'); return; }
    CL=items; rtRPreview(items);
  };

  function rtRPreview(items){
    document.getElementById('rt-prev-empty').style.display='none';
    document.getElementById('rt-prev-panel').style.display='block';
    document.getElementById('rt-prev-title').textContent=items.length+' rótulo'+(items.length>1?'s':'')+' gerado'+(items.length>1?'s':'');
    var g=document.getElementById('rt-lbl-grid'); g.innerHTML='';
    items.forEach(function(it){
      var code=mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0);
      var d=document.createElement('div'); d.className='rt-lp';
      d.innerHTML='<div class="rt-lp-send">WAKZOME</div><div class="rt-lp-st">'+it.s.name+'</div><div class="rt-lp-ad">'+(it.s.addr||'')+'</div><div class="rt-lp-cp">'+(it.s.cp||'')+'</div><div class="rt-lp-cd">'+code+'</div>';
      g.appendChild(d);
    });
  }

  window.rtSaveShipment = function(){
    if(!CL.length){ rtToast('gere rótulos primeiro'); return; }
    var ds  = dateToStr(ACTIVE_DATE);
    var iso = ACTIVE_DATE.toISOString();
    CL.forEach(function(it){ D.acc[it.s.id]=(D.acc[it.s.id]||0)+1; });
    D.shipments.push({
      id: Date.now(), date: ds, iso: iso,
      boxes: CL.map(function(it){
        return {
          code:      mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0),
          storeId:   it.s.id, storeName: it.s.name, dest: it.s.dest,
          delivered: false, isExtra: it.isExtra||false, extraN: it.extraN||0
        };
      })
    });
    saveData(); CL=[];
    allS().forEach(function(s){ var e=document.getElementById('rtq_'+s.id); if(e) e.value=''; });
    document.getElementById('rt-prev-empty').style.display='flex';
    document.getElementById('rt-prev-panel').style.display='none';
    rtRStores(); rtRAcc(); rtRSum();
    rtToast('envio guardado ✓','ok');
  };

  /* ══════════════════════════════════════════════════════
     HISTORICAL SHIPMENT MODAL
  ══════════════════════════════════════════════════════ */
  window.rtOpenHistModal = function(){
    /* Populate date = yesterday by default */
    var yest = new Date(); yest.setDate(yest.getDate()-1);
    var di = document.getElementById('rt-hist-date');
    if(di) di.value = yest.getFullYear()+'-'+String(yest.getMonth()+1).padStart(2,'0')+'-'+String(yest.getDate()).padStart(2,'0');

    /* Render store qty inputs */
    ['f','p'].forEach(function(dest){
      var el = document.getElementById('rt-hist-stores-'+dest); if(!el) return;
      el.innerHTML='';
      (D.stores[dest]||[]).forEach(function(s){
        var row=document.createElement('div'); row.className='rt-hist-row';
        row.innerHTML='<label>'+s.name+'</label>'+
          '<span class="rt-acc-n">'+String(D.acc[s.id]||0).padStart(4,'0')+'</span>'+
          '<input class="rt-qty-inp" type="number" min="0" id="rthq_'+s.id+'" />';
        el.appendChild(row);
      });
    });
    document.getElementById('rt-hist-modal').classList.add('open');
  };

  window.rtCloseHistModal = function(){
    document.getElementById('rt-hist-modal').classList.remove('open');
  };

  window.rtConfirmHist = function(){
    var di = document.getElementById('rt-hist-date');
    if(!di||!di.value){ rtToast('selecione uma data'); return; }

    var parts  = di.value.split('-');
    var histDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    var ds     = dateToStr(histDate);
    var iso    = histDate.toISOString();

    var items = [];
    allS().forEach(function(s){
      var el  = document.getElementById('rthq_'+s.id);
      var qty = parseInt(el && el.value) || 0;
      if(qty > 0){
        var acc = D.acc[s.id] || 0;
        for(var i=1;i<=qty;i++) items.push({s:s, boxNum:i, total:qty, accBox:acc+i, isExtra:false, extraN:0});
      }
    });

    if(!items.length){ rtToast('introduza pelo menos uma quantidade'); return; }

    /* Update acc and save shipment */
    items.forEach(function(it){ D.acc[it.s.id]=(D.acc[it.s.id]||0)+1; });
    D.shipments.push({
      id: Date.now(), date: ds, iso: iso, historical: true,
      boxes: items.map(function(it){
        return {
          code:      mkCode(it.s, it.accBox, it.boxNum, it.total, 0, histDate),
          storeId:   it.s.id, storeName: it.s.name, dest: it.s.dest,
          delivered: false, isExtra: false, extraN: 0
        };
      })
    });

    /* Sort shipments chronologically */
    D.shipments.sort(function(a,b){ return new Date(a.iso)-new Date(b.iso); });

    saveData();
    rtCloseHistModal();
    rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
    rtToast('envio de '+ds+' registado ✓','ok');
  };

  /* ══════════════════════════════════════════════════════
     SUMMARY TABLE
  ══════════════════════════════════════════════════════ */
  function rtRSum(){
    var body=document.getElementById('rt-sum-body'), foot=document.getElementById('rt-sum-foot');
    var stores=allS();
    var extras=stores.filter(function(s){ return BASE_IDS.indexOf(s.id)===-1; });
    var thead=document.querySelector('#rt-sum-table thead tr');
    while(thead.cells.length>8) thead.deleteCell(-1);
    extras.forEach(function(s){ var th=document.createElement('th'); th.textContent=s.abr.toLowerCase(); thead.appendChild(th); });
    if(!D.shipments.length){
      body.innerHTML='<tr><td colspan="'+(8+extras.length)+'" style="text-align:center;padding:16px;font-size:.82rem">sem envios registados este ano</td></tr>';
      foot.innerHTML=''; return;
    }
    var tot={f:0,p:0}; stores.forEach(function(s){ tot[s.id]=0; });
    body.innerHTML=D.shipments.map(function(sh){
      var fc=sh.boxes.filter(function(b){ return b.dest==='f'; }).length;
      var ps=sh.boxes.filter(function(b){ return b.dest==='p'; }).length;
      tot.f+=fc; tot.p+=ps;
      var cols=stores.map(function(s){ var c=sh.boxes.filter(function(b){ return b.storeId===s.id; }).length; tot[s.id]+=c; return c?'<td class="rt-num">'+c+'</td>':'<td>—</td>'; }).join('');
      var pastMark = sh.historical ? ' <span style="font-size:.64rem;color:#e65100;font-weight:bold">hist</span>' : '';
      return '<tr><td>'+sh.date+pastMark+'</td><td class="rt-num">'+(fc||'—')+'</td><td class="rt-num">'+(ps||'—')+'</td>'+cols+'</tr>';
    }).join('');
    var tc=stores.map(function(s){ var t=tot[s.id]||0; return t?'<td class="rt-num">'+t+'</td>':'<td>—</td>'; }).join('');
    foot.innerHTML='<tr><td style="font-weight:bold">total</td><td class="rt-num">'+tot.f+'</td><td class="rt-num">'+tot.p+'</td>'+tc+'</tr>';
  }

  /* ══════════════════════════════════════════════════════
     DELIVERY CONTROL
  ══════════════════════════════════════════════════════ */
  function rtRCtrl(){
    var el=document.getElementById('rt-sl');
    var list=D.shipments.slice().reverse();
    if(CF==='pending') list=list.filter(function(s){ return s.boxes.some(function(b){ return !b.delivered; }); });
    else if(CF==='done') list=list.filter(function(s){ return s.boxes.every(function(b){ return b.delivered; }); });
    else if(CF==='f') list=list.filter(function(s){ return s.boxes.some(function(b){ return b.dest==='f'; }); });
    else if(CF==='p') list=list.filter(function(s){ return s.boxes.some(function(b){ return b.dest==='p'; }); });
    if(!list.length){ el.innerHTML='<div class="rt-es"><p>nenhum envio encontrado.</p></div>'; return; }
    el.innerHTML='';
    list.forEach(function(sh){
      var del=sh.boxes.filter(function(b){ return b.delivered; }).length, tot=sh.boxes.length, allDone=del===tot;
      var div=document.createElement('div'); div.className='rt-sg'; div.id='rtsg_'+sh.id;
      var rows=sh.boxes.map(function(b,i){
        return '<div class="rt-bx'+(b.delivered?' done':'')+'" id="rtbr_'+sh.id+'_'+i+'">'+
          '<input type="checkbox" class="rt-bx-chk"'+(b.delivered?' checked':'')+' onchange="rtTogDel('+sh.id+','+i+',this)" />'+
          '<div class="rt-bx-dot"></div><div class="rt-bx-cd">'+b.code+'</div><div class="rt-bx-st">'+b.storeName+'</div></div>';
      }).join('');
      var histTag = sh.historical ? ' <span style="font-size:.64rem;color:#e65100;border:1px solid #ffcc80;border-radius:10px;padding:1px 6px;background:#fff3e0">hist</span>' : '';
      div.innerHTML=
        '<div class="rt-sg-hd">'+
          '<div class="rt-sg-t-wrap" onclick="rtTogGrp(\'rtsg_'+sh.id+'\')">'+
            '<div class="rt-sg-t">'+sh.date+histTag+'</div>'+
            '<div class="rt-sg-m">'+
              '<span class="rt-sg-pr" id="rtsp_'+sh.id+'">'+del+'/'+tot+' entregues</span>'+
              '<span class="rt-sg-b">'+tot+' cx</span>'+
              (allDone?'<span class="rt-sg-ok">✓ completo</span>':'')+
              '<span class="rt-sg-ch">▾</span>'+
            '</div>'+
          '</div>'+
          '<button class="rt-reprint-btn" onclick="rtReprintShipment('+sh.id+',event)">'+
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'+
            ' reimprimir</button>'+
        '</div>'+
        '<div class="rt-sg-bx">'+rows+'</div>';
      el.appendChild(div);
    });
  }

  window.rtTogGrp = function(id){ var el=document.getElementById(id); if(el) el.classList.toggle('col'); };
  window.rtTogDel = function(shId,idx,cb){
    var sh=D.shipments.find(function(s){ return s.id==shId; }); if(!sh) return;
    sh.boxes[idx].delivered=cb.checked; saveData();
    var row=document.getElementById('rtbr_'+shId+'_'+idx); if(row) row.classList.toggle('done',cb.checked);
    var del=sh.boxes.filter(function(b){ return b.delivered; }).length;
    var sp=document.getElementById('rtsp_'+shId); if(sp) sp.textContent=del+'/'+sh.boxes.length+' entregues';
    rtRSum(); rtToast(cb.checked?'caixa entregue ✓':'caixa desmarcada',cb.checked?'ok':'');
  };
  window.rtFCtrl = function(f,btn){
    CF=f; document.querySelectorAll('.rt-fb').forEach(function(b){ b.classList.remove('active'); }); btn.classList.add('active'); rtRCtrl();
  };
  window.rtReprintShipment = function(shId,evt){
    if(evt) evt.stopPropagation();
    var sh=D.shipments.find(function(s){ return s.id==shId; }); if(!sh){ rtToast('envio não encontrado'); return; }
    var items=sh.boxes.map(function(b){ var store=allS().find(function(s){ return s.id===b.storeId; })||{id:b.storeId,name:b.storeName,code:'',abr:'',addr:'',cp:'',dest:b.dest}; return{s:store,boxNum:0,total:0,accBox:0,isExtra:b.isExtra||false,extraN:b.extraN||0,_preCode:b.code}; });
    rtShowPrintModal(items,'reimprimir — '+sh.date);
  };
  window.rtOpenPrintModal = function(){ if(!CL.length){ rtToast('gere rótulos primeiro'); return; } rtShowPrintModal(CL,'prévia de impressão'); };

  function rtShowPrintModal(items,title){
    PITEMS=items.slice();
    document.getElementById('rt-mp-title').textContent=(title||'prévia')+' — '+items.length+' rótulo'+(items.length>1?'s':'');
    var body=document.getElementById('rt-mp-body'); body.innerHTML='';
    var cs=8;
    for(var i=0;i<items.length;i+=cs){
      var chunk=items.slice(i,i+cs);
      var pg=Math.floor(i/cs)+1, pages=Math.ceil(items.length/cs);
      var lbl=document.createElement('div'); lbl.className='rt-pg-lbl';
      lbl.textContent='folha '+pg+(pages>1?' / '+pages:'')+' — '+chunk.length+' rótulo'+(chunk.length>1?'s':'');
      body.appendChild(lbl);
      var sheet=document.createElement('div'); sheet.className='rt-psheet';
      chunk.forEach(function(it){
        var code=it._preCode||mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0);
        var d=document.createElement('div'); d.className='rt-rot';
        d.innerHTML='<div class="rs">WAKZOME</div><div class="rn">'+(it.s.name||'')+'</div><div class="ra">'+(it.s.addr||'')+'</div><div class="rc">'+(it.s.cp||'')+'</div><div class="rk">'+code+'</div>';
        sheet.appendChild(d);
      });
      while(sheet.children.length<8){ var e=document.createElement('div'); e.className='rt-rot empty'; sheet.appendChild(e); }
      body.appendChild(sheet);
    }
    document.getElementById('rt-modal-print').style.display='flex';
  }

  window.rtClosePrintModal = function(){ document.getElementById('rt-modal-print').style.display='none'; };
  window.rtDoPrint = function(){
    if(!PITEMS.length){ rtToast('sem rótulos'); return; }
    var pa=document.getElementById('rt-print-area'); pa.innerHTML='';
    var cs=8;
    for(var i=0;i<PITEMS.length;i+=cs){
      var chunk=PITEMS.slice(i,i+cs);
      var page=document.createElement('div'); page.className='rt-pp';
      chunk.forEach(function(it){
        var code=it._preCode||mkCode(it.s,it.accBox,it.boxNum,it.total,it.extraN||0);
        var d=document.createElement('div'); d.className='rt-pp-r';
        d.innerHTML='<div class="rt-pp-send">WAKZOME</div><div class="rt-pp-st">'+(it.s.name||'').toUpperCase()+'</div><div class="rt-pp-ad">'+(it.s.addr||'').toUpperCase()+'</div><div class="rt-pp-cp">'+(it.s.cp||'').toUpperCase()+'</div><div class="rt-pp-cd">'+code+'</div>';
        page.appendChild(d);
      });
      while(page.children.length<8){ var e=document.createElement('div'); e.className='rt-pp-r'; page.appendChild(e); }
      pa.appendChild(page);
    }
    pa.style.display='block'; window.print(); setTimeout(function(){ pa.style.display='none'; pa.innerHTML=''; },1500);
  };
  window.rtExportPDF = function(){ rtToast('selecione "guardar como pdf" no diálogo de impressão','ok'); setTimeout(rtDoPrint,400); };
  window.rtSendEmail = function(){ rtToast('funcionalidade de email será configurada em breve'); };

  var _tt;
  function rtToast(msg,type){
    var t=document.getElementById('rt-toast');
    t.className='rt-toast'+(type?' '+type:'');
    t.textContent=msg; t.classList.add('show');
    clearTimeout(_tt); _tt=setTimeout(function(){ t.classList.remove('show'); },3000);
  }

  document.addEventListener('keydown',function(e){
    var ov=document.getElementById('rotulos-overlay'); if(!ov||!ov.classList.contains('open')) return;
    if(e.key==='Escape'){ rtClosePrintModal(); rtCloseAdd(); rtCloseHistModal(); }
  });
  document.getElementById('rt-modal-print').addEventListener('click',function(e){ if(e.target===this) rtClosePrintModal(); });
  document.getElementById('rt-mm-add').addEventListener('click',function(e){ if(e.target===this) rtCloseAdd(); });
  document.getElementById('rt-hist-modal').addEventListener('click',function(e){ if(e.target===this) rtCloseHistModal(); });

  rtRStores(); rtRAcc(); rtRSum(); rtRCtrl();
}

})();
