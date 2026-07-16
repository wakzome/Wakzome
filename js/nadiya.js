// ══════════════════════════════════════════════════════════════
//  NADIYA — REGISTO DE HORAS (persistência em Supabase)
//  Qualquer alteração futura deve ser feita exclusivamente neste
//  ficheiro. Não requer alterações em index.html.
// ══════════════════════════════════════════════════════════════
(function () {

  var DEFAULT_RATE  = 10; // fallback se ainda não houver nenhuma tarifa gravada
  var MAX_SHIFT_HOURS = 7; // tolerância: se esquecer de marcar saída, fecha-se sozinho a esta duração
  var TABLE          = 'nadiya_horas';
  var TABLE_COMPRAS  = 'nadiya_compras';
  var TABLE_TARIFAS  = 'nadiya_tarifas';
  var LANG_KEY        = 'nadiya_lang';

  var CASA_DISPLAY = { manuel: 'Manuel', duarte: 'Duarte' };
  var LOCALE_MAP   = { pt: 'pt-PT', uk: 'uk-UA' };

  var I18N = {
    pt: {
      eyebrow: 'Registo de horas',
      monthPrevAria: 'Mês anterior',
      monthNextAria: 'Mês seguinte',
      monthNames: ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'],
      dayNames: ['dom','seg','ter','qua','qui','sex','sáb'],
      houseLabel: 'CASA',
      punchLabelIn: 'ENTRADA',
      punchSubIn: 'tocar ao chegar',
      punchLabelOut: 'SAÍDA',
      punchSubOut: 'tocar ao terminar',
      statusReady: 'Pronta para marcar entrada.',
      statusOpen: 'Entrada marcada às <b>{time}</b> em casa de {casa}. Em curso…',
      statusSaving: 'a guardar…',
      statusLoadingRecords: 'a carregar registos…',
      visitaBtnLabel: 'Visita aos gatos',
      visitaCancel: 'Cancelar',
      visitaConfirmed: 'Visita registada em casa de {casa} às {time}.',
      statHorasLabel: 'Horas este mês',
      statEurosLabel: 'Total este mês',
      perHouseLabel: 'Horas por casa',
      horasWord: 'horas',
      ledgerHead: 'Dias do mês',
      emptyMonth: 'Ainda não há dias registados este mês.',
      badgeOpen: 'em curso',
      tipoTrabalho: 'Trabalho',
      tipoVisita: 'Visita',
      footnote1: 'Tarifa atual: {rate}/hora.',
      ipLabel: 'IP',
      ipUnavailable: '—',
      invalidTimeOrder: 'A entrada não pode ser depois da saída.',
      editModeOn: 'Modo de edição ativo — toca na bolha para sair.',
      loadError: '⚠ Erro ao carregar registos: {msg}',
      saveError: '⚠ Erro ao guardar: {msg}',
      exitLabel: 'sair',
      comprasBtnLabel: 'Compras',
      comprasSectionLabel: 'Compras deste mês',
      comprasModalTitle: 'Nova compra',
      comprasItemLabel: 'O que comprou',
      comprasValorLabel: 'Valor',
      comprasSave: 'Guardar',
      comprasCancel: 'Cancelar',
      comprasEmpty: 'Sem compras este mês.',
      comprasDeleteConfirm: 'Eliminar esta compra?',
      comprasItemRequired: '⚠ Indica o que comprou.',
      comprasValorRequired: '⚠ Indica um valor válido.',
      comprasSaveError: '⚠ Erro ao guardar compra: {msg}',
      comprasDeleteError: '⚠ Erro ao eliminar: {msg}',
      tarifaModalTitle: 'Alterar tarifa',
      tarifaValorLabel: 'Novo valor por hora',
      tarifaHint: 'Aplica-se só a partir de agora — os registos anteriores mantêm a tarifa antiga.',
      tarifaSave: 'Guardar',
      tarifaCancel: 'Cancelar',
      tarifaValorRequired: '⚠ Indica um valor válido.',
      tarifaSaveError: '⚠ Erro ao guardar: {msg}',
      autoClosedNotice: 'Um turno anterior foi fechado automaticamente por exceder 7h sem saída marcada.',
      autoClosedTooltip: 'Fechado automaticamente (máx. 7h sem marcar saída)',
      saldoLabel: 'saldo'
    },
    uk: {
      eyebrow: 'Облік годин',
      monthPrevAria: 'Попередній місяць',
      monthNextAria: 'Наступний місяць',
      monthNames: ['СІЧЕНЬ','ЛЮТИЙ','БЕРЕЗЕНЬ','КВІТЕНЬ','ТРАВЕНЬ','ЧЕРВЕНЬ','ЛИПЕНЬ','СЕРПЕНЬ','ВЕРЕСЕНЬ','ЖОВТЕНЬ','ЛИСТОПАД','ГРУДЕНЬ'],
      dayNames: ['нд','пн','вт','ср','чт','пт','сб'],
      houseLabel: 'ДІМ',
      punchLabelIn: 'ПОЧАТОК',
      punchSubIn: 'натисни при прибутті',
      punchLabelOut: 'КІНЕЦЬ',
      punchSubOut: 'натисни при завершенні',
      statusReady: 'Готово до відмітки початку.',
      statusOpen: 'Початок відмічено о <b>{time}</b> у домі {casa}. Триває…',
      statusSaving: 'збереження…',
      statusLoadingRecords: 'завантаження записів…',
      visitaBtnLabel: 'Відвідування котів',
      visitaCancel: 'Скасувати',
      visitaConfirmed: 'Відвідування зареєстровано у домі {casa} о {time}.',
      statHorasLabel: 'Години цього місяця',
      statEurosLabel: 'Сума цього місяця',
      perHouseLabel: 'Години за домом',
      horasWord: 'годин',
      ledgerHead: 'Дні місяця',
      emptyMonth: 'Цього місяця ще немає відмічених днів.',
      badgeOpen: 'триває',
      tipoTrabalho: 'Робота',
      tipoVisita: 'Візит',
      footnote1: 'Поточний тариф: {rate}/годину.',
      ipLabel: 'IP',
      ipUnavailable: '—',
      invalidTimeOrder: 'Початок не може бути пізніше за кінець.',
      editModeOn: 'Режим редагування активний — натисни на бульбашку, щоб вийти.',
      loadError: '⚠ Помилка завантаження: {msg}',
      saveError: '⚠ Помилка збереження: {msg}',
      exitLabel: 'вийти',
      comprasBtnLabel: 'Покупки',
      comprasSectionLabel: 'Покупки цього місяця',
      comprasModalTitle: 'Нова покупка',
      comprasItemLabel: 'Що купили',
      comprasValorLabel: 'Сума',
      comprasSave: 'Зберегти',
      comprasCancel: 'Скасувати',
      comprasEmpty: 'Цього місяця немає покупок.',
      comprasDeleteConfirm: 'Видалити цю покупку?',
      comprasItemRequired: '⚠ Вкажіть, що ви купили.',
      comprasValorRequired: '⚠ Вкажіть коректну суму.',
      comprasSaveError: '⚠ Помилка збереження покупки: {msg}',
      comprasDeleteError: '⚠ Помилка видалення: {msg}',
      tarifaModalTitle: 'Змінити тариф',
      tarifaValorLabel: 'Нова сума за годину',
      tarifaHint: 'Діє лише з цього моменту — попередні записи зберігають старий тариф.',
      tarifaSave: 'Зберегти',
      tarifaCancel: 'Скасувати',
      tarifaValorRequired: '⚠ Вкажіть коректну суму.',
      tarifaSaveError: '⚠ Помилка збереження: {msg}',
      autoClosedNotice: 'Попередню зміну було закрито автоматично через перевищення 7 год без відмітки завершення.',
      autoClosedTooltip: 'Закрито автоматично (макс. 7 год без відмітки завершення)',
      saldoLabel: 'баланс'
    }
  };

  // ── Estado ──
  var _nRecords        = [];
  var _nCompras        = [];
  var _nTarifas        = [];
  var _nLang           = _loadLang();
  var _nSelectedCasa   = null;
  var _nVisitaChoosing = false;
  var _nTransientStatus = null;
  var _nEditMode       = false;
  var _nMonths         = [];
  var _nMonthIndex     = 0;
  var _nBusy           = false; // bloqueia ações durante chamadas à BD
  var _nComprasBusy    = false; // bloqueia o modal de compras durante chamadas à BD
  var _nTarifaBusy     = false; // bloqueia o modal de tarifa durante chamadas à BD
  var _nBuilt          = false; // DOM do overlay já construído
  var _nLoadError      = null;
  var _nRecibo         = {}; // cache por 'MM-YYYY': {loading, encontrado, credito, error}

  function _loadLang() {
    try {
      var raw = localStorage.getItem(LANG_KEY);
      if (raw === 'pt' || raw === 'uk') return raw;
    } catch (e) {}
    return 'pt';
  }
  function _saveLang(l) {
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  }

  function t(key, vars) {
    var str = I18N[_nLang][key] || '';
    if (vars) {
      Object.keys(vars).forEach(function (k) { str = str.split('{' + k + '}').join(vars[k]); });
    }
    return str;
  }

  // ── Helpers de data/hora ──
  function _toLocalIso(date) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }
  function _monthKeyOf(iso) { return iso.slice(0, 7); }
  function _todayStr() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function _allMonthKeys() {
    var set = {};
    _nRecords.forEach(function (r) { set[_monthKeyOf(r.entrada)] = true; });
    _nCompras.forEach(function (c) { set[_monthKeyOf(c.fecha)] = true; });
    var now = new Date();
    set[now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')] = true;
    return Object.keys(set).sort();
  }
  function _fmtHours(hoursDecimal) {
    var totalMin = Math.round(hoursDecimal * 60);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return h + ':' + String(m).padStart(2, '0');
  }
  function _fmtEuros(v) {
    return v.toLocaleString(LOCALE_MAP[_nLang], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function _mesFromMonthKey(monthKey) {
    var parts = monthKey.split('-'); // ['YYYY','MM']
    return parts[1] + '-' + parts[0];
  }
  function _loadRecibo(mes) {
    if (_nRecibo[mes]) return;
    _nRecibo[mes] = { loading: true };
    fetch('/api/nadiya-saldo?mes=' + encodeURIComponent(mes), { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok) { _nRecibo[mes] = { loading: false, error: (r.data && r.data.error) || 'erro' }; render(); return; }
        _nRecibo[mes] = {
          loading: false,
          encontrado: !!r.data.encontrado,
          credito: parseFloat(r.data.credito) || 0
        };
        render();
      })
      .catch(function (err) {
        _nRecibo[mes] = { loading: false, error: err && err.message ? err.message : String(err) };
        render();
      });
  }
  function _fmtTime(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function _fmtDate(iso) {
    var d = new Date(iso);
    return d.getDate() + ' ' + I18N[_nLang].dayNames[d.getDay()];
  }
  function _fmtDateShort(fechaStr) {
    var parts = fechaStr.split('-');
    if (parts.length !== 3) return fechaStr;
    return parts[2] + '/' + parts[1];
  }
  function _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _catIconsFor(casa) {
    return casa === 'manuel' ? '\u{1F408}‍⬛\u{1F408}‍⬛' : '\u{1F408}\u{1F406}';
  }
  function _hoursBetween(entradaIso, salidaIso) {
    return (new Date(salidaIso) - new Date(entradaIso)) / 3600000;
  }
  function _openRecord() {
    return _nRecords.find(function (r) { return r.tipo === 'trabalho' && !r.salida; });
  }
  function _lastUsedCasa() {
    if (_nRecords.length === 0) return 'manuel';
    var sorted = _nRecords.slice().sort(function (a, b) { return b.entrada.localeCompare(a.entrada); });
    return sorted[0].casa;
  }
  function _ensureSelectedCasa() {
    var open = _openRecord();
    if (open) { _nSelectedCasa = open.casa; return; }
    if (!_nSelectedCasa) _nSelectedCasa = _lastUsedCasa() || 'manuel';
  }
  function _fetchPublicIp() {
    return fetch('https://api.ipify.org?format=json')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return data && data.ip ? data.ip : null; })
      .catch(function () { return null; });
  }

  // ── Tarifa vigente em cada momento (histórico, nunca retroativo) ──
  // _nTarifas está ordenado ascendentemente por vigente_desde.
  function _rateFor(iso, tarifasList) {
    var list = tarifasList || _nTarifas;
    var applicable = DEFAULT_RATE;
    for (var i = 0; i < list.length; i++) {
      if (list[i].vigente_desde <= iso) applicable = parseFloat(list[i].valor);
      else break;
    }
    return applicable;
  }
  function _currentRate() {
    return _rateFor(_toLocalIso(new Date()));
  }

  // ══════════════════════════════════════════════════════════════
  //  ESTILOS (injetados uma única vez — nunca em index.html)
  // ══════════════════════════════════════════════════════════════
  function _injectStyles() {
    if (document.getElementById('nadiya-styles')) return;
    var s = document.createElement('style');
    s.id = 'nadiya-styles';
    s.textContent =
      '#nadiya-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:220;flex-direction:column;opacity:0;transition:opacity 0.5s cubic-bezier(0.22,1,0.36,1);font-family:"MontserratLight",sans-serif;color:#000;}' +
      '#nadiya-overlay.open{display:flex;}' +
      '#nadiya-overlay.visible{opacity:1;}' +
      '#nadiya-overlay *{box-sizing:border-box;}' +
      '#nadiya-overlay-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid #e6e6e6;background:#fff;flex-shrink:0;}' +
      '#nadiya-overlay-title{font-size:.82rem;font-weight:bold;text-transform:lowercase;letter-spacing:.06em;color:#000;cursor:pointer;}' +
      '#nadiya-overlay-back{font-size:.78rem;font-weight:bold;font-family:"MontserratLight",sans-serif;cursor:pointer;color:#fff !important;background:#000 !important;border:1.5px solid #000;padding:7px 16px;border-radius:10px;transition:background .2s,transform .15s;text-transform:lowercase;letter-spacing:.03em;}' +
      '#nadiya-overlay-back,#nadiya-overlay-back *{color:#fff !important;}' +
      '#nadiya-overlay-back:hover{background:#333;transform:translateY(-1px);}' +
      '#nadiya-overlay-content{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;padding:24px 16px 60px;-webkit-overflow-scrolling:touch;}' +
      '.nad-wrap{width:100%;max-width:460px;}' +
      '.nad-lang-switch{display:flex;gap:6px;justify-content:center;margin-bottom:22px;}' +
      '.nad-lang-btn{font-family:"MontserratLight",sans-serif;font-size:.72rem;font-weight:600;letter-spacing:.06em;border:1px solid #ccc;background:#fff;border-radius:20px;padding:6px 16px;cursor:pointer;color:#666;text-transform:uppercase;transition:background .2s,color .2s,border-color .2s;}' +
      '.nad-lang-btn.selected{background:#000 !important;color:#fff !important;border-color:#000 !important;}' +
      '.nad-month-nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:24px;}' +
      '.nad-month-nav button{background:none;border:1px solid #ccc;border-radius:10px;width:38px;height:38px;flex-shrink:0;font-size:16px;color:#000;cursor:pointer;transition:border-color .2s,background .2s;}' +
      '.nad-month-nav button:hover:not(:disabled){border-color:#555;background:#f5f5f5;}' +
      '.nad-month-nav button:disabled{opacity:.3;cursor:default;}' +
      '.nad-month-label{font-size:.82rem;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;min-width:0;text-align:center;white-space:nowrap;}' +
      '.nad-section-label{font-size:.72rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#888;text-align:center;margin:0 0 8px;}' +
      '.nad-house-select{display:flex;gap:10px;margin-bottom:20px;}' +
      '.nad-house-btn{flex:1;min-height:44px;padding:10px;border-radius:12px;border:1.5px solid #ddd;background:#fff;font-family:"MontserratLight",sans-serif;font-weight:600;font-size:.88rem;cursor:pointer;color:#000;transition:border-color .2s,background .2s,color .2s;}' +
      '.nad-house-btn.selected{border-color:#000 !important;background:#000 !important;color:#fff !important;}' +
      '.nad-house-btn:disabled{opacity:.5;cursor:default;}' +
      '.nad-punch-card{background:#fff;border:1.5px solid #e6e6e6;border-radius:18px;padding:26px 18px 22px;display:flex;flex-direction:column;align-items:center;margin-bottom:22px;}' +
      '.nad-live-clock{font-size:.92rem;font-weight:600;color:#888;margin-bottom:16px;letter-spacing:.05em;}' +
      '.nad-punch-btn{width:clamp(140px,42vw,180px);height:clamp(140px,42vw,180px);border-radius:50%;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff !important;background:#000 !important;transition:transform .08s ease,background .2s ease;font-family:"MontserratLight",sans-serif;}' +
      '.nad-punch-btn,.nad-punch-btn *{color:#fff !important;}' +
      '.nad-punch-btn.active{background:#2a8a2a !important;}' +
      '.nad-punch-btn.active,.nad-punch-btn.active *{color:#fff !important;}' +
      '.nad-punch-btn:active{transform:scale(0.97);}' +
      '.nad-punch-btn:disabled{opacity:.55;cursor:default;}' +
      '.nad-punch-icon{font-size:clamp(22px,6vw,28px);line-height:1;}' +
      '.nad-punch-label{font-size:clamp(14px,3.8vw,16px);font-weight:700;letter-spacing:.04em;}' +
      '.nad-punch-sub{font-size:9.5px;opacity:.85;text-align:center;padding:0 8px;letter-spacing:.03em;text-transform:uppercase;}' +
      '.nad-status-line{margin-top:16px;font-size:.82rem;color:#666;text-align:center;min-height:20px;line-height:1.4;word-break:break-word;}' +
      '.nad-status-line b{color:#000;}' +
      '.nad-visita-section{margin-top:14px;width:100%;text-align:center;}' +
      '.nad-visita-btn{width:100%;min-height:42px;border:1px solid #ddd;background:#fff;border-radius:12px;padding:10px 16px;font-family:"MontserratLight",sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;color:#000;transition:border-color .2s,background .2s;}' +
      '.nad-visita-btn:hover{border-color:#555;background:#f5f5f5;}' +
      '.nad-visita-choice{display:flex;align-items:stretch;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap;}' +
      '.nad-visita-choice .nad-house-btn{flex:1 1 45%;min-width:100px;}' +
      '.nad-visita-cancel{flex:1 1 100%;background:none;border:none;color:#888;text-decoration:underline;cursor:pointer;padding:8px;font-family:"MontserratLight",sans-serif;font-size:.78rem;}' +
      '.nad-compras-btn{width:100%;min-height:42px;border:1px solid #ddd;background:#fff;border-radius:12px;padding:10px 16px;margin-top:8px;font-family:"MontserratLight",sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;color:#000;transition:border-color .2s,background .2s;}' +
      '.nad-compras-btn:hover{border-color:#555;background:#f5f5f5;}' +
      '.nad-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 20px;}' +
      '.nad-stat{background:#fff;border:1.5px solid #e6e6e6;border-radius:14px;padding:16px 18px;}' +
      '.nad-stat-label{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#888;font-weight:bold;margin:0 0 6px;}' +
      '.nad-stat-value{font-size:clamp(20px,5.5vw,26px);font-weight:700;white-space:nowrap;}' +
      '.nad-house-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 20px;}' +
      '.nad-house-stat{background:#fafafa;border:1px solid #ececec;border-radius:12px;padding:12px 14px;}' +
      '.nad-house-stat-label{font-weight:600;font-size:.8rem;margin:0 0 6px;color:#000;}' +
      '.nad-house-stat-row{display:flex;flex-direction:column;gap:2px;font-weight:600;color:#2a8a2a;}' +
      '.nad-house-stat-row span:first-child{font-size:.82rem;}' +
      '.nad-house-stat-row span:last-child{font-size:.72rem;opacity:.85;}' +
      '.nad-edit-mode-banner{font-size:.72rem;color:#a5691f;background:#fbeee0;border-radius:10px;padding:9px 14px;text-align:center;margin:0 0 14px;font-weight:600;}' +
      '.nad-saldo-line{display:none;font-size:.68rem;color:#aaa;text-align:right;margin:-10px 2px 16px;letter-spacing:.02em;}' +
      '.nad-compras{background:#fff;border:1.5px solid #e6e6e6;border-radius:16px;overflow:hidden;margin:0 0 20px;}' +
      '.nad-compras-head{padding:14px 18px 10px;border-bottom:1px solid #e6e6e6;font-weight:700;font-size:.9rem;}' +
      '.nad-compras-list{display:flex;flex-direction:column;}' +
      '.nad-compra-row{padding:11px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '.nad-compras-list .nad-compra-row:last-child{border-bottom:none;}' +
      '.nad-compra-item{font-size:.82rem;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.nad-compra-date{font-size:.68rem;color:#999;display:block;font-weight:500;margin-top:2px;}' +
      '.nad-compra-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}' +
      '.nad-compra-valor{font-size:.82rem;font-weight:700;white-space:nowrap;}' +
      '.nad-compra-del{width:26px;height:26px;border-radius:50%;border:1px solid #ddd;background:#fff;color:#999;font-size:.78rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s,border-color .2s;}' +
      '.nad-compra-del:hover{background:#c03000 !important;color:#fff !important;border-color:#c03000 !important;}' +
      '#nadiya-compras-modal,#nadiya-tarifa-modal{display:none;position:fixed;inset:0;z-index:2147483000;align-items:center;justify-content:center;padding:20px;}' +
      '#nadiya-compras-modal.open,#nadiya-tarifa-modal.open{display:flex;}' +
      '.nad-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);}' +
      '.nad-modal-box{position:relative;background:#fff;border-radius:18px;padding:22px 20px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.25);}' +
      '.nad-modal-title{font-size:.92rem;font-weight:700;margin:0 0 16px;text-align:center;}' +
      '.nad-modal-field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px;}' +
      '.nad-modal-field label{font-size:.68rem;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;}' +
      '.nad-modal-input{padding:10px 12px;font-size:.9rem;font-weight:600;font-family:"MontserratLight",sans-serif;border:1.5px solid #ddd;border-radius:10px;outline:none;background:#fff;color:#000;width:100%;box-sizing:border-box;transition:border-color .2s;}' +
      '.nad-modal-input:focus{border-color:#555;}' +
      '.nad-modal-hint{font-size:.7rem;color:#888;text-align:center;line-height:1.4;margin:-4px 0 14px;}' +
      '.nad-modal-error{font-size:.76rem;color:#c03000;text-align:center;min-height:16px;margin-bottom:8px;}' +
      '.nad-modal-actions{display:flex;gap:10px;margin-top:6px;}' +
      '.nad-modal-btn{flex:1;padding:10px 14px;font-size:.82rem;font-weight:700;font-family:"MontserratLight",sans-serif;border-radius:10px;cursor:pointer;transition:background .2s,opacity .2s;}' +
      '.nad-modal-btn-cancel{background:#fff;border:1.5px solid #ddd;color:#000;}' +
      '.nad-modal-btn-cancel:hover{background:#f5f5f5;}' +
      '.nad-modal-btn-save{background:#000 !important;color:#fff !important;border:1.5px solid #000;}' +
      '.nad-modal-btn-save,.nad-modal-btn-save *{color:#fff !important;}' +
      '.nad-modal-btn-save:hover{background:#333 !important;}' +
      '.nad-modal-btn:disabled{opacity:.5;cursor:default;}' +
      '.nad-ledger{background:#fff;border:1.5px solid #e6e6e6;border-radius:16px;overflow:hidden;}' +
      '.nad-ledger-head{padding:14px 18px 10px;border-bottom:1px solid #e6e6e6;font-weight:700;font-size:.9rem;}' +
      '.nad-day-list{display:flex;flex-direction:column;}' +
      '.nad-day-card{padding:12px 16px;border-bottom:1px solid #eee;display:flex;flex-direction:column;gap:5px;}' +
      '.nad-day-list .nad-day-card:last-child{border-bottom:none;}' +
      '.nad-day-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.nad-day-card-date{font-weight:600;font-size:.82rem;flex-shrink:0;}' +
      '.nad-day-card-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;min-width:0;}' +
      '.nad-tag{display:inline-block;font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;}' +
      '.nad-tag-tipo{background:#f0f0f0;color:#888;}' +
      '.nad-tag-casa{cursor:pointer;border-bottom:1px dashed currentColor;-webkit-tap-highlight-color:transparent;user-select:none;}' +
      '.nad-tag-casa-manuel{background:#000 !important;color:#fff !important;}' +
      '.nad-tag-casa-duarte{background:#ddd;color:#333;}' +
      '.nad-day-card-bottom{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:.78rem;}' +
      '.nad-day-card-times{color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.nad-day-card-money{display:flex;align-items:baseline;gap:10px;flex-shrink:0;}' +
      '.nad-day-card-hours{color:#000;}' +
      '.nad-day-card-euros{font-weight:700;}' +
      '.nad-badge{display:inline-block;font-size:.68rem;font-weight:600;padding:2px 8px;border-radius:20px;background:#fbeee0;color:#a5691f;}' +
      '.nad-empty-state{text-align:center;color:#888;font-size:.8rem;padding:24px 16px;line-height:1.5;}' +
      '.nad-footnote{margin-top:16px;font-size:.7rem;color:#999;text-align:center;line-height:1.5;-webkit-tap-highlight-color:transparent;user-select:none;}' +
      '.nad-cat-icons{font-size:12px;line-height:1;}' +
      '.nad-day-card-ip{font-size:.65rem;color:#aaa;letter-spacing:.02em;}' +
      '.nad-edit-check{color:#2a8a2a;font-weight:700;font-size:11px;margin:0 2px;}' +
      '.nad-auto-mark{color:#999;font-size:11px;margin:0 2px;cursor:default;}' +
      '.nad-time-edit{font-size:.76rem;border:1px solid #ccc;border-radius:6px;padding:2px 4px;background:#fff;color:#000;width:76px;font-family:"MontserratLight",sans-serif;}' +
      '#nadiya-edit-bubble{position:fixed !important;left:16px;bottom:16px;width:44px;height:44px;border-radius:50%;border:none;background:#000 !important;color:#fff !important;font-size:18px;line-height:44px;text-align:center;padding:0;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:2147483000;pointer-events:auto;}' +
      '#nadiya-edit-bubble.active{background:#a5691f !important;color:#fff !important;}' +
      '@media(max-width:340px){.nad-stats{grid-template-columns:1fr;}}';
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════════════
  //  DOM DO OVERLAY
  // ══════════════════════════════════════════════════════════════
  function _buildOverlay() {
    if (_nBuilt) return;
    _nBuilt = true;
    _injectStyles();

    var overlay = document.createElement('div');
    overlay.id = 'nadiya-overlay';
    overlay.innerHTML =
      '<div id="nadiya-overlay-bar">' +
        '<span id="nadiya-overlay-title">nadiya</span>' +
        '<span id="nadiya-overlay-back"></span>' +
      '</div>' +
      '<div id="nadiya-overlay-content">' +
        '<div class="nad-wrap">' +
          '<div class="nad-lang-switch">' +
            '<button class="nad-lang-btn" id="nadiya-lang-pt" data-lang="pt">PT</button>' +
            '<button class="nad-lang-btn" id="nadiya-lang-uk" data-lang="uk">UA</button>' +
          '</div>' +
          '<div class="nad-month-nav">' +
            '<button id="nadiya-prev-month">‹</button>' +
            '<div class="nad-month-label" id="nadiya-month-label">—</div>' +
            '<button id="nadiya-next-month">›</button>' +
          '</div>' +
          '<p class="nad-section-label" id="nadiya-house-label">CASA</p>' +
          '<div class="nad-house-select">' +
            '<button class="nad-house-btn" id="nadiya-house-manuel">Manuel</button>' +
            '<button class="nad-house-btn" id="nadiya-house-duarte">Duarte</button>' +
          '</div>' +
          '<div class="nad-punch-card">' +
            '<div class="nad-live-clock" id="nadiya-live-clock">--:--:--</div>' +
            '<button class="nad-punch-btn" id="nadiya-punch-btn">' +
              '<span class="nad-punch-icon" id="nadiya-punch-icon">▶</span>' +
              '<span class="nad-punch-label" id="nadiya-punch-label">ENTRADA</span>' +
              '<span class="nad-punch-sub" id="nadiya-punch-sub">tocar ao chegar</span>' +
            '</button>' +
            '<div class="nad-status-line" id="nadiya-status-line"></div>' +
            '<div class="nad-visita-section">' +
              '<button class="nad-visita-btn" id="nadiya-visita-btn">🐈 <span id="nadiya-visita-btn-label">Visita aos gatos</span></button>' +
              '<div class="nad-visita-choice" id="nadiya-visita-choice" style="display:none;">' +
                '<button class="nad-house-btn" id="nadiya-visita-manuel">Manuel</button>' +
                '<button class="nad-house-btn" id="nadiya-visita-duarte">Duarte</button>' +
                '<button class="nad-visita-cancel" id="nadiya-visita-cancel">Cancelar</button>' +
              '</div>' +
            '</div>' +
            '<button class="nad-compras-btn" id="nadiya-compras-btn">🛒 <span id="nadiya-compras-btn-label">Compras</span></button>' +
          '</div>' +
          '<div class="nad-stats">' +
            '<div class="nad-stat">' +
              '<p class="nad-stat-label" id="nadiya-stat-horas-label">Horas este mês</p>' +
              '<div class="nad-stat-value" id="nadiya-stat-horas">0:00</div>' +
            '</div>' +
            '<div class="nad-stat">' +
              '<p class="nad-stat-label" id="nadiya-stat-euros-label">Total este mês</p>' +
              '<div class="nad-stat-value" id="nadiya-stat-euros">0,00 €</div>' +
            '</div>' +
          '</div>' +
          '<p class="nad-section-label" id="nadiya-per-house-label">Horas por casa</p>' +
          '<div class="nad-house-stats">' +
            '<div class="nad-house-stat">' +
              '<p class="nad-house-stat-label">Manuel</p>' +
              '<div class="nad-house-stat-row"><span id="nadiya-house-manuel-horas">0:00</span><span id="nadiya-house-manuel-euros">0,00 €</span></div>' +
            '</div>' +
            '<div class="nad-house-stat">' +
              '<p class="nad-house-stat-label">Duarte</p>' +
              '<div class="nad-house-stat-row"><span id="nadiya-house-duarte-horas">0:00</span><span id="nadiya-house-duarte-euros">0,00 €</span></div>' +
            '</div>' +
          '</div>' +
          '<p class="nad-saldo-line" id="nadiya-saldo-line"></p>' +
          '<div class="nad-compras">' +
            '<div class="nad-compras-head" id="nadiya-compras-head">Compras deste mês</div>' +
            '<div class="nad-compras-list" id="nadiya-compras-body"></div>' +
          '</div>' +
          '<p class="nad-edit-mode-banner" id="nadiya-edit-banner" style="display:none;"></p>' +
          '<div class="nad-ledger">' +
            '<div class="nad-ledger-head" id="nadiya-ledger-head">Dias do mês</div>' +
            '<div class="nad-day-list" id="nadiya-ledger-body"><div class="nad-empty-state">a carregar…</div></div>' +
          '</div>' +
          '<p class="nad-footnote" id="nadiya-footnote"></p>' +
        '</div>' +
      '</div>' +
      '<button id="nadiya-edit-bubble" aria-label="edit"></button>' +
      '<div id="nadiya-compras-modal">' +
        '<div class="nad-modal-backdrop" id="nadiya-compras-backdrop"></div>' +
        '<div class="nad-modal-box">' +
          '<p class="nad-modal-title" id="nadiya-compras-modal-title">Nova compra</p>' +
          '<div class="nad-modal-field">' +
            '<label for="nadiya-compras-item" id="nadiya-compras-item-label">O que comprou</label>' +
            '<input type="text" id="nadiya-compras-item" class="nad-modal-input" autocomplete="off">' +
          '</div>' +
          '<div class="nad-modal-field">' +
            '<label for="nadiya-compras-valor" id="nadiya-compras-valor-label">Valor</label>' +
            '<input type="number" id="nadiya-compras-valor" class="nad-modal-input" min="0" step="0.01" placeholder="0,00">' +
          '</div>' +
          '<div class="nad-modal-error" id="nadiya-compras-modal-error"></div>' +
          '<div class="nad-modal-actions">' +
            '<button class="nad-modal-btn nad-modal-btn-cancel" id="nadiya-compras-cancel"></button>' +
            '<button class="nad-modal-btn nad-modal-btn-save" id="nadiya-compras-save"></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="nadiya-tarifa-modal">' +
        '<div class="nad-modal-backdrop" id="nadiya-tarifa-backdrop"></div>' +
        '<div class="nad-modal-box">' +
          '<p class="nad-modal-title" id="nadiya-tarifa-modal-title">Alterar tarifa</p>' +
          '<div class="nad-modal-field">' +
            '<label for="nadiya-tarifa-valor" id="nadiya-tarifa-valor-label">Novo valor por hora</label>' +
            '<input type="number" id="nadiya-tarifa-valor" class="nad-modal-input" min="0.01" step="0.01" placeholder="0,00">' +
          '</div>' +
          '<p class="nad-modal-hint" id="nadiya-tarifa-hint"></p>' +
          '<div class="nad-modal-error" id="nadiya-tarifa-modal-error"></div>' +
          '<div class="nad-modal-actions">' +
            '<button class="nad-modal-btn nad-modal-btn-cancel" id="nadiya-tarifa-cancel"></button>' +
            '<button class="nad-modal-btn nad-modal-btn-save" id="nadiya-tarifa-save"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    _wireEvents();
  }

  // ══════════════════════════════════════════════════════════════
  //  ABRIR / FECHAR
  // ══════════════════════════════════════════════════════════════
  window.openNadiyaOverlay = function () {
    _buildOverlay();
    var overlay = document.getElementById('nadiya-overlay');
    overlay.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('visible'); });
    });
    document.documentElement.lang = _nLang;
    _tickClock();
    _loadRecords();
  };

  window.closeNadiyaOverlay = function () {
    var overlay = document.getElementById('nadiya-overlay');
    overlay.classList.remove('visible');
    setTimeout(function () { overlay.classList.remove('open'); }, 520);
  };

  function _exitApp() {
    document.body.style.transition = 'opacity 0.5s ease';
    document.body.style.opacity = '0';
    setTimeout(function () { location.reload(); }, 520);
  }

  // ══════════════════════════════════════════════════════════════
  //  CARGA DE DADOS (Supabase)
  // ══════════════════════════════════════════════════════════════
  function _loadRecords() {
    _nLoadError = null;
    var body = document.getElementById('nadiya-ledger-body');
    if (body) body.innerHTML = '<div class="nad-empty-state">' + t('statusLoadingRecords') + '</div>';

    if (typeof sbAdmin === 'undefined' || !sbAdmin) {
      _nLoadError = 'Ligação à base de dados não disponível.';
      render();
      return;
    }

    Promise.all([
      sbAdmin.from(TABLE).select('*').order('entrada', { ascending: true }),
      sbAdmin.from(TABLE_COMPRAS).select('*').order('fecha', { ascending: true }),
      sbAdmin.from(TABLE_TARIFAS).select('*').order('vigente_desde', { ascending: true })
    ])
      .then(function (results) {
        var resRecords = results[0], resCompras = results[1], resTarifas = results[2];
        if (resRecords.error) { _nLoadError = resRecords.error.message; render(); return null; }
        if (resCompras.error) { _nLoadError = resCompras.error.message; render(); return null; }
        if (resTarifas.error) { _nLoadError = resTarifas.error.message; render(); return null; }
        _nRecords = resRecords.data || [];
        _nCompras = resCompras.data || [];
        _nTarifas = resTarifas.data || [];
        return _autoCloseStaleShifts();
      })
      .then(function (skip) {
        if (skip === null) return; // erro já tratado e renderizado acima
        _nMonths = _allMonthKeys();
        _nMonthIndex = _nMonths.length - 1;
        render();
      })
      .catch(function (err) {
        _nLoadError = err && err.message ? err.message : String(err);
        render();
      });
  }

  // ── Fecha sozinho um turno aberto há mais de MAX_SHIFT_HOURS (esqueceu de marcar saída) ──
  function _autoCloseStaleShifts() {
    var nowIso = _toLocalIso(new Date());
    var stale = _nRecords.filter(function (r) {
      return r.tipo === 'trabalho' && !r.salida && _hoursBetween(r.entrada, nowIso) > MAX_SHIFT_HOURS;
    });
    if (stale.length === 0) return Promise.resolve();
    if (typeof sbAdmin === 'undefined' || !sbAdmin) return Promise.resolve();

    var closes = stale.map(function (r) {
      var cappedIso = _toLocalIso(new Date(new Date(r.entrada).getTime() + MAX_SHIFT_HOURS * 3600000));
      return sbAdmin.from(TABLE).update({ salida: cappedIso, auto_cerrado: true, updated_at: new Date().toISOString() }).eq('id', r.id).select().single()
        .then(function (res) {
          if (!res.error && res.data) Object.assign(r, res.data);
        })
        .catch(function () {});
    });
    return Promise.all(closes).then(function () {
      _nTransientStatus = t('autoClosedNotice');
    });
  }

  function _attachIp(rec, field) {
    _fetchPublicIp().then(function (ip) {
      if (!ip || typeof sbAdmin === 'undefined' || !sbAdmin) return;
      var patch = {};
      patch[field === 'entrada' ? 'ip_entrada' : 'ip_salida'] = ip;
      sbAdmin.from(TABLE).update(patch).eq('id', rec.id).select().single()
        .then(function (res) {
          if (res.error || !res.data) return;
          Object.assign(rec, res.data);
          render();
        })
        .catch(function () {});
    });
  }

  function _setBusyUI(busy) {
    _nBusy = busy;
    var btn = document.getElementById('nadiya-punch-btn');
    if (btn) btn.disabled = busy;
  }

  function _flashError(msg) {
    _nTransientStatus = t('saveError', { msg: msg });
    render();
  }

  // ══════════════════════════════════════════════════════════════
  //  AÇÕES
  // ══════════════════════════════════════════════════════════════
  function _onPunch() {
    if (_nBusy) return;
    if (typeof sbAdmin === 'undefined' || !sbAdmin) { _flashError('sem ligação à base de dados'); return; }
    _nTransientStatus = null;
    var open = _openRecord();
    var nowIso = _toLocalIso(new Date());

    if (open) {
      _setBusyUI(true);
      sbAdmin.from(TABLE).update({ salida: nowIso, updated_at: new Date().toISOString() }).eq('id', open.id).select().single()
        .then(function (res) {
          _setBusyUI(false);
          if (res.error) { _flashError(res.error.message); return; }
          Object.assign(open, res.data);
          render();
          _attachIp(open, 'salida');
        })
        .catch(function (err) { _setBusyUI(false); _flashError(err.message || String(err)); });
    } else {
      _ensureSelectedCasa();
      var rec = {
        tipo: 'trabalho', casa: _nSelectedCasa, entrada: nowIso, salida: null,
        ip_entrada: null, ip_salida: null,
        edited_casa: false, edited_entrada: false, edited_salida: false
      };
      _setBusyUI(true);
      sbAdmin.from(TABLE).insert(rec).select().single()
        .then(function (res) {
          _setBusyUI(false);
          if (res.error) { _flashError(res.error.message); return; }
          _nRecords.push(res.data);
          _nMonths = _allMonthKeys();
          var mk = _monthKeyOf(nowIso), idx = _nMonths.indexOf(mk);
          if (idx !== -1) _nMonthIndex = idx;
          render();
          _attachIp(res.data, 'entrada');
        })
        .catch(function (err) { _setBusyUI(false); _flashError(err.message || String(err)); });
    }
  }

  function _registerVisita(casa) {
    if (_nBusy) return;
    if (typeof sbAdmin === 'undefined' || !sbAdmin) { _flashError('sem ligação à base de dados'); return; }
    var nowIso = _toLocalIso(new Date());
    var rec = {
      tipo: 'visita', casa: casa, entrada: nowIso, salida: null,
      ip_entrada: null, ip_salida: null,
      edited_casa: false, edited_entrada: false, edited_salida: false
    };
    _setBusyUI(true);
    sbAdmin.from(TABLE).insert(rec).select().single()
      .then(function (res) {
        _setBusyUI(false);
        if (res.error) { _flashError(res.error.message); return; }
        _nRecords.push(res.data);
        _nVisitaChoosing = false;
        _nTransientStatus = t('visitaConfirmed', { casa: CASA_DISPLAY[casa], time: _fmtTime(nowIso) });
        _nMonths = _allMonthKeys();
        var mk = _monthKeyOf(nowIso), idx = _nMonths.indexOf(mk);
        if (idx !== -1) _nMonthIndex = idx;
        render();
        _attachIp(res.data, 'entrada');
      })
      .catch(function (err) { _setBusyUI(false); _flashError(err.message || String(err)); });
  }

  var CASA_EDIT_WINDOW_MS = 600;
  var _casaClickState = { id: null, count: 0, timer: null };

  function _toggleCasa(recordId) {
    var rec = _nRecords.find(function (r) { return r.id === recordId; });
    if (!rec) return;
    var newCasa = rec.casa === 'manuel' ? 'duarte' : 'manuel';
    sbAdmin.from(TABLE).update({ casa: newCasa, edited_casa: true, updated_at: new Date().toISOString() }).eq('id', recordId).select().single()
      .then(function (res) {
        if (res.error) { _flashError(res.error.message); return; }
        Object.assign(rec, res.data);
        if (rec.tipo === 'trabalho' && !rec.salida) _nSelectedCasa = rec.casa;
        _nTransientStatus = null;
        render();
      })
      .catch(function (err) { _flashError(err.message || String(err)); });
  }

  function _editTime(recordId, field, hhmm) {
    var rec = _nRecords.find(function (r) { return r.id === recordId; });
    if (!rec) return;
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { render(); return; }
    var baseIso = field === 'entrada' ? rec.entrada : rec.salida;
    if (!baseIso) { render(); return; }

    var d = new Date(baseIso);
    var parts = hhmm.split(':');
    d.setHours(+parts[0], +parts[1], 0, 0);
    var newIso = _toLocalIso(d);

    if (rec.tipo === 'trabalho') {
      var entradaIso = field === 'entrada' ? newIso : rec.entrada;
      var salidaIso = field === 'salida' ? newIso : rec.salida;
      if (salidaIso && new Date(entradaIso) >= new Date(salidaIso)) {
        alert(t('invalidTimeOrder'));
        render();
        return;
      }
    }

    var patch = {};
    patch[field] = newIso;
    patch['edited_' + field] = true;
    patch.updated_at = new Date().toISOString();

    sbAdmin.from(TABLE).update(patch).eq('id', recordId).select().single()
      .then(function (res) {
        if (res.error) { _flashError(res.error.message); render(); return; }
        Object.assign(rec, res.data);
        render();
      })
      .catch(function (err) { _flashError(err.message || String(err)); render(); });
  }

  // ══════════════════════════════════════════════════════════════
  //  COMPRAS
  // ══════════════════════════════════════════════════════════════
  function _openComprasModal() {
    var modal = document.getElementById('nadiya-compras-modal');
    document.getElementById('nadiya-compras-item').value = '';
    document.getElementById('nadiya-compras-valor').value = '';
    document.getElementById('nadiya-compras-modal-error').textContent = '';
    modal.classList.add('open');
    setTimeout(function () { document.getElementById('nadiya-compras-item').focus(); }, 50);
  }

  function _closeComprasModal() {
    if (_nComprasBusy) return;
    document.getElementById('nadiya-compras-modal').classList.remove('open');
  }

  function _saveCompra() {
    if (_nComprasBusy) return;
    if (typeof sbAdmin === 'undefined' || !sbAdmin) {
      document.getElementById('nadiya-compras-modal-error').textContent = 'sem ligação à base de dados';
      return;
    }
    var itemInput = document.getElementById('nadiya-compras-item');
    var valorInput = document.getElementById('nadiya-compras-valor');
    var errEl = document.getElementById('nadiya-compras-modal-error');
    var item = itemInput.value.trim();
    var valor = parseFloat(valorInput.value);

    if (!item) { errEl.textContent = t('comprasItemRequired'); itemInput.focus(); return; }
    if (!(valor >= 0) || isNaN(valor)) { errEl.textContent = t('comprasValorRequired'); valorInput.focus(); return; }

    errEl.textContent = '';
    _nComprasBusy = true;
    document.getElementById('nadiya-compras-save').disabled = true;
    document.getElementById('nadiya-compras-cancel').disabled = true;

    var rec = { fecha: _todayStr(), item: item, valor: valor };
    sbAdmin.from(TABLE_COMPRAS).insert(rec).select().single()
      .then(function (res) {
        _nComprasBusy = false;
        document.getElementById('nadiya-compras-save').disabled = false;
        document.getElementById('nadiya-compras-cancel').disabled = false;
        if (res.error) { errEl.textContent = t('comprasSaveError', { msg: res.error.message }); return; }
        _nCompras.push(res.data);
        _nMonths = _allMonthKeys();
        var mk = _monthKeyOf(res.data.fecha), idx = _nMonths.indexOf(mk);
        if (idx !== -1) _nMonthIndex = idx;
        document.getElementById('nadiya-compras-modal').classList.remove('open');
        render();
      })
      .catch(function (err) {
        _nComprasBusy = false;
        document.getElementById('nadiya-compras-save').disabled = false;
        document.getElementById('nadiya-compras-cancel').disabled = false;
        errEl.textContent = t('comprasSaveError', { msg: err.message || String(err) });
      });
  }

  function _deleteCompra(id) {
    if (!confirm(t('comprasDeleteConfirm'))) return;
    if (typeof sbAdmin === 'undefined' || !sbAdmin) { _flashError('sem ligação à base de dados'); return; }
    sbAdmin.from(TABLE_COMPRAS).delete().eq('id', id)
      .then(function (res) {
        if (res.error) { _flashError(t('comprasDeleteError', { msg: res.error.message })); return; }
        _nCompras = _nCompras.filter(function (c) { return c.id !== id; });
        render();
      })
      .catch(function (err) { _flashError(t('comprasDeleteError', { msg: err.message || String(err) })); });
  }

  // ══════════════════════════════════════════════════════════════
  //  TARIFA (histórico — só se aplica a partir de agora)
  // ══════════════════════════════════════════════════════════════
  function _openTarifaModal() {
    var modal = document.getElementById('nadiya-tarifa-modal');
    document.getElementById('nadiya-tarifa-valor').value = '';
    document.getElementById('nadiya-tarifa-modal-error').textContent = '';
    modal.classList.add('open');
    setTimeout(function () { document.getElementById('nadiya-tarifa-valor').focus(); }, 50);
  }

  function _closeTarifaModal() {
    if (_nTarifaBusy) return;
    document.getElementById('nadiya-tarifa-modal').classList.remove('open');
  }

  function _saveTarifa() {
    if (_nTarifaBusy) return;
    if (typeof sbAdmin === 'undefined' || !sbAdmin) {
      document.getElementById('nadiya-tarifa-modal-error').textContent = 'sem ligação à base de dados';
      return;
    }
    var valorInput = document.getElementById('nadiya-tarifa-valor');
    var errEl = document.getElementById('nadiya-tarifa-modal-error');
    var valor = parseFloat(valorInput.value);

    if (!(valor > 0) || isNaN(valor)) { errEl.textContent = t('tarifaValorRequired'); valorInput.focus(); return; }

    errEl.textContent = '';
    _nTarifaBusy = true;
    document.getElementById('nadiya-tarifa-save').disabled = true;
    document.getElementById('nadiya-tarifa-cancel').disabled = true;

    var rec = { valor: valor, vigente_desde: _toLocalIso(new Date()) };
    sbAdmin.from(TABLE_TARIFAS).insert(rec).select().single()
      .then(function (res) {
        _nTarifaBusy = false;
        document.getElementById('nadiya-tarifa-save').disabled = false;
        document.getElementById('nadiya-tarifa-cancel').disabled = false;
        if (res.error) { errEl.textContent = t('tarifaSaveError', { msg: res.error.message }); return; }
        _nTarifas.push(res.data);
        _nTarifas.sort(function (a, b) { return a.vigente_desde < b.vigente_desde ? -1 : 1; });
        document.getElementById('nadiya-tarifa-modal').classList.remove('open');
        render();
      })
      .catch(function (err) {
        _nTarifaBusy = false;
        document.getElementById('nadiya-tarifa-save').disabled = false;
        document.getElementById('nadiya-tarifa-cancel').disabled = false;
        errEl.textContent = t('tarifaSaveError', { msg: err.message || String(err) });
      });
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  function render() {
    if (!_nBuilt) return;

    document.getElementById('nadiya-house-label').textContent = t('houseLabel');
    document.getElementById('nadiya-visita-btn-label').textContent = t('visitaBtnLabel');
    document.getElementById('nadiya-visita-cancel').textContent = t('visitaCancel');
    document.getElementById('nadiya-stat-horas-label').textContent = t('statHorasLabel');
    document.getElementById('nadiya-stat-euros-label').textContent = t('statEurosLabel');
    document.getElementById('nadiya-per-house-label').textContent = t('perHouseLabel');
    document.getElementById('nadiya-ledger-head').textContent = t('ledgerHead');
    document.getElementById('nadiya-footnote').textContent = t('footnote1', { rate: _fmtEuros(_currentRate()) });
    document.getElementById('nadiya-overlay-back').textContent = t('exitLabel');
    document.getElementById('nadiya-compras-btn-label').textContent = t('comprasBtnLabel');
    document.getElementById('nadiya-compras-head').textContent = t('comprasSectionLabel');
    document.getElementById('nadiya-compras-modal-title').textContent = t('comprasModalTitle');
    document.getElementById('nadiya-compras-item-label').textContent = t('comprasItemLabel');
    document.getElementById('nadiya-compras-valor-label').textContent = t('comprasValorLabel');
    document.getElementById('nadiya-compras-save').textContent = t('comprasSave');
    document.getElementById('nadiya-compras-cancel').textContent = t('comprasCancel');
    document.getElementById('nadiya-tarifa-modal-title').textContent = t('tarifaModalTitle');
    document.getElementById('nadiya-tarifa-valor-label').textContent = t('tarifaValorLabel');
    document.getElementById('nadiya-tarifa-hint').textContent = t('tarifaHint');
    document.getElementById('nadiya-tarifa-save').textContent = t('tarifaSave');
    document.getElementById('nadiya-tarifa-cancel').textContent = t('tarifaCancel');
    document.getElementById('nadiya-prev-month').setAttribute('aria-label', t('monthPrevAria'));
    document.getElementById('nadiya-next-month').setAttribute('aria-label', t('monthNextAria'));
    document.getElementById('nadiya-lang-pt').classList.toggle('selected', _nLang === 'pt');
    document.getElementById('nadiya-lang-uk').classList.toggle('selected', _nLang === 'uk');

    if (_nLoadError) {
      document.getElementById('nadiya-ledger-body').innerHTML =
        '<div class="nad-empty-state">' + t('loadError', { msg: _nLoadError }) + '</div>';
      document.getElementById('nadiya-status-line').textContent = '';
      return;
    }

    // Mês
    _nMonths = _allMonthKeys();
    if (_nMonthIndex >= _nMonths.length) _nMonthIndex = _nMonths.length - 1;
    if (_nMonthIndex < 0) _nMonthIndex = 0;
    var monthKey = _nMonths[_nMonthIndex];
    var ym = monthKey.split('-');
    document.getElementById('nadiya-month-label').textContent = I18N[_nLang].monthNames[parseInt(ym[1], 10) - 1] + ' ' + ym[0];
    document.getElementById('nadiya-prev-month').disabled = _nMonthIndex === 0;
    document.getElementById('nadiya-next-month').disabled = _nMonthIndex === _nMonths.length - 1;

    var monthRecords = _nRecords
      .filter(function (r) { return _monthKeyOf(r.entrada) === monthKey; })
      .sort(function (a, b) { return a.entrada.localeCompare(b.entrada); });

    var monthCompras = _nCompras
      .filter(function (c) { return _monthKeyOf(c.fecha) === monthKey; })
      .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });

    // Ledger
    var body = document.getElementById('nadiya-ledger-body');
    body.innerHTML = '';
    if (monthRecords.length === 0) {
      body.innerHTML = '<div class="nad-empty-state">' + t('emptyMonth') + '</div>';
    } else {
      monthRecords.forEach(function (r) {
        var card = document.createElement('div');
        card.className = 'nad-day-card';
        var casaLabel = CASA_DISPLAY[r.casa] || r.casa;
        var check = function (field) { return r['edited_' + field] ? '<span class="nad-edit-check">✓</span>' : ''; };
        var timeInput = function (field, value) {
          return '<input type="time" class="nad-time-edit" data-id="' + r.id + '" data-field="' + field + '" value="' + value + '">';
        };
        var rate = _rateFor(r.entrada);

        var timesHtml, moneyHtml;
        if (r.tipo === 'visita') {
          timesHtml = _nEditMode
            ? timeInput('entrada', _fmtTime(r.entrada)) + check('entrada')
            : _fmtTime(r.entrada) + check('entrada');
          moneyHtml = '<span class="nad-day-card-euros">' + _fmtEuros(rate) + '</span>';
        } else if (r.salida) {
          var h = _hoursBetween(r.entrada, r.salida);
          var autoMark = r.auto_cerrado ? '<span class="nad-auto-mark" title="' + t('autoClosedTooltip') + '">⏱</span>' : '';
          timesHtml = _nEditMode
            ? timeInput('entrada', _fmtTime(r.entrada)) + check('entrada') + ' → ' + timeInput('salida', _fmtTime(r.salida)) + check('salida') + autoMark
            : _fmtTime(r.entrada) + check('entrada') + ' → ' + _fmtTime(r.salida) + check('salida') + autoMark;
          moneyHtml =
            '<span class="nad-day-card-hours">' + _fmtHours(h) + '</span>' +
            '<span class="nad-day-card-euros">' + _fmtEuros(h * rate) + '</span>';
        } else {
          timesHtml = _nEditMode
            ? timeInput('entrada', _fmtTime(r.entrada)) + check('entrada') + ' → <span class="nad-badge">' + t('badgeOpen') + '</span>'
            : _fmtTime(r.entrada) + check('entrada') + ' → <span class="nad-badge">' + t('badgeOpen') + '</span>';
          moneyHtml = '<span class="nad-day-card-hours">—</span>';
        }

        var ipEntrada = r.ip_entrada || t('ipUnavailable');
        var ipHtml = (r.tipo === 'trabalho' && r.salida)
          ? t('ipLabel') + ': ' + ipEntrada + ' → ' + (r.ip_salida || t('ipUnavailable'))
          : t('ipLabel') + ': ' + ipEntrada;

        card.innerHTML =
          '<div class="nad-day-card-top">' +
            '<span class="nad-day-card-date">' + _fmtDate(r.entrada) + '</span>' +
            '<span class="nad-day-card-tags">' +
              '<span class="nad-tag nad-tag-casa nad-tag-casa-' + r.casa + '" data-id="' + r.id + '">' + casaLabel + '</span>' +
              check('casa') +
              '<span class="nad-tag nad-tag-tipo">' + (r.tipo === 'visita' ? t('tipoVisita') : t('tipoTrabalho')) + '</span>' +
              (r.tipo === 'visita' ? '<span class="nad-cat-icons" aria-hidden="true">' + _catIconsFor(r.casa) + '</span>' : '') +
            '</span>' +
          '</div>' +
          '<div class="nad-day-card-bottom">' +
            '<span class="nad-day-card-times">' + timesHtml + '</span>' +
            '<span class="nad-day-card-money">' + moneyHtml + '</span>' +
          '</div>' +
          '<div class="nad-day-card-ip">' + ipHtml + '</div>';
        body.appendChild(card);
      });
    }

    // Compras
    var comprasBody = document.getElementById('nadiya-compras-body');
    comprasBody.innerHTML = '';
    if (monthCompras.length === 0) {
      comprasBody.innerHTML = '<div class="nad-empty-state">' + t('comprasEmpty') + '</div>';
    } else {
      monthCompras.forEach(function (c) {
        var row = document.createElement('div');
        row.className = 'nad-compra-row';
        row.innerHTML =
          '<span class="nad-compra-item">' + _escapeHtml(c.item) +
            '<span class="nad-compra-date">' + _fmtDateShort(c.fecha) + '</span>' +
          '</span>' +
          '<span class="nad-compra-right">' +
            '<span class="nad-compra-valor">' + _fmtEuros(parseFloat(c.valor) || 0) + '</span>' +
            '<button class="nad-compra-del" data-id="' + c.id + '" title="eliminar">×</button>' +
          '</span>';
        comprasBody.appendChild(row);
      });
    }
    var totalCompras = monthCompras.reduce(function (sum, c) { return sum + (parseFloat(c.valor) || 0); }, 0);

    // Totais — cada registo usa a tarifa vigente no momento da SUA entrada
    var closedWork = monthRecords.filter(function (r) { return r.tipo === 'trabalho' && r.salida; });
    var visitas = monthRecords.filter(function (r) { return r.tipo === 'visita'; });
    var totalHours = closedWork.reduce(function (sum, r) { return sum + _hoursBetween(r.entrada, r.salida); }, 0);
    var workEuros = closedWork.reduce(function (sum, r) { return sum + _hoursBetween(r.entrada, r.salida) * _rateFor(r.entrada); }, 0);
    var visitEuros = visitas.reduce(function (sum, r) { return sum + _rateFor(r.entrada); }, 0);
    var totalEuros = workEuros + visitEuros + totalCompras;
    document.getElementById('nadiya-stat-horas').textContent = _fmtHours(totalHours);
    document.getElementById('nadiya-stat-euros').textContent = _fmtEuros(totalEuros);

    var perHouse = { manuel: { hours: 0, euros: 0 }, duarte: { hours: 0, euros: 0 } };
    closedWork.forEach(function (r) {
      var h = _hoursBetween(r.entrada, r.salida);
      if (perHouse[r.casa]) { perHouse[r.casa].hours += h; perHouse[r.casa].euros += h * _rateFor(r.entrada); }
    });
    visitas.forEach(function (r) {
      if (perHouse[r.casa]) perHouse[r.casa].euros += _rateFor(r.entrada);
    });
    document.getElementById('nadiya-house-manuel-horas').textContent = _fmtHours(perHouse.manuel.hours) + ' ' + t('horasWord');
    document.getElementById('nadiya-house-manuel-euros').textContent = _fmtEuros(perHouse.manuel.euros);
    document.getElementById('nadiya-house-duarte-horas').textContent = _fmtHours(perHouse.duarte.hours) + ' ' + t('horasWord');
    document.getElementById('nadiya-house-duarte-euros').textContent = _fmtEuros(perHouse.duarte.euros);

    // Saldo (horas + visitas vs. crédito do recibo formal do mês — compras ficam fora, são reembolso à parte)
    var saldoEl = document.getElementById('nadiya-saldo-line');
    if (saldoEl) {
      var mesRecibo = _mesFromMonthKey(monthKey);
      var reciboState = _nRecibo[mesRecibo];
      if (!reciboState) _loadRecibo(mesRecibo);
      if (reciboState && !reciboState.loading && !reciboState.error && reciboState.encontrado) {
        var horasEuros = workEuros + visitEuros;
        var saldo = horasEuros - reciboState.credito;
        saldoEl.textContent = t('saldoLabel') + ': ' + _fmtEuros(saldo);
        saldoEl.style.display = 'block';
      } else {
        saldoEl.textContent = '';
        saldoEl.style.display = 'none';
      }
    }

    // Estado do seletor / botão de ponto
    _ensureSelectedCasa();
    var open = _openRecord();

    var houseManuelBtn = document.getElementById('nadiya-house-manuel');
    var houseDuarteBtn = document.getElementById('nadiya-house-duarte');
    houseManuelBtn.classList.toggle('selected', _nSelectedCasa === 'manuel');
    houseDuarteBtn.classList.toggle('selected', _nSelectedCasa === 'duarte');
    houseManuelBtn.disabled = !!open;
    houseDuarteBtn.disabled = !!open;

    var btn = document.getElementById('nadiya-punch-btn');
    var icon = document.getElementById('nadiya-punch-icon');
    var label = document.getElementById('nadiya-punch-label');
    var sub = document.getElementById('nadiya-punch-sub');
    var status = document.getElementById('nadiya-status-line');

    if (_nBusy) {
      status.textContent = t('statusSaving');
    } else if (open) {
      btn.classList.add('active');
      icon.textContent = '■';
      label.textContent = t('punchLabelOut');
      sub.textContent = t('punchSubOut');
      status.innerHTML = t('statusOpen', { time: _fmtTime(open.entrada), casa: CASA_DISPLAY[open.casa] });
    } else {
      btn.classList.remove('active');
      icon.textContent = '▶';
      label.textContent = t('punchLabelIn');
      sub.textContent = t('punchSubIn');
      status.textContent = _nTransientStatus || t('statusReady');
    }

    document.getElementById('nadiya-visita-choice').style.display = _nVisitaChoosing ? 'flex' : 'none';
    document.getElementById('nadiya-visita-btn').style.display = _nVisitaChoosing ? 'none' : 'inline-block';

    document.getElementById('nadiya-edit-banner').textContent = t('editModeOn');
    document.getElementById('nadiya-edit-banner').style.display = _nEditMode ? 'block' : 'none';
    document.getElementById('nadiya-edit-bubble').classList.toggle('active', _nEditMode);
  }

  // ══════════════════════════════════════════════════════════════
  //  EVENTOS (associados uma única vez, na construção do DOM)
  // ══════════════════════════════════════════════════════════════
  function _wireEvents() {
    document.getElementById('nadiya-overlay-back').addEventListener('click', _exitApp);
    document.getElementById('nadiya-overlay-title').addEventListener('click', _exitApp);

    document.getElementById('nadiya-punch-btn').addEventListener('click', _onPunch);

    document.getElementById('nadiya-house-manuel').addEventListener('click', function () {
      if (_openRecord()) return;
      _nSelectedCasa = 'manuel'; _nTransientStatus = null; render();
    });
    document.getElementById('nadiya-house-duarte').addEventListener('click', function () {
      if (_openRecord()) return;
      _nSelectedCasa = 'duarte'; _nTransientStatus = null; render();
    });

    document.getElementById('nadiya-visita-btn').addEventListener('click', function () {
      _nVisitaChoosing = true; render();
    });
    document.getElementById('nadiya-visita-cancel').addEventListener('click', function () {
      _nVisitaChoosing = false; render();
    });
    document.getElementById('nadiya-visita-manuel').addEventListener('click', function () { _registerVisita('manuel'); });
    document.getElementById('nadiya-visita-duarte').addEventListener('click', function () { _registerVisita('duarte'); });

    document.getElementById('nadiya-compras-btn').addEventListener('click', _openComprasModal);
    document.getElementById('nadiya-compras-cancel').addEventListener('click', _closeComprasModal);
    document.getElementById('nadiya-compras-backdrop').addEventListener('click', _closeComprasModal);
    document.getElementById('nadiya-compras-save').addEventListener('click', _saveCompra);
    document.getElementById('nadiya-compras-valor').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _saveCompra();
    });
    document.getElementById('nadiya-compras-item').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('nadiya-compras-valor').focus(); }
    });
    document.getElementById('nadiya-compras-body').addEventListener('click', function (e) {
      var delBtn = e.target.closest('.nad-compra-del');
      if (!delBtn) return;
      _deleteCompra(delBtn.dataset.id);
    });

    document.getElementById('nadiya-tarifa-cancel').addEventListener('click', _closeTarifaModal);
    document.getElementById('nadiya-tarifa-backdrop').addEventListener('click', _closeTarifaModal);
    document.getElementById('nadiya-tarifa-save').addEventListener('click', _saveTarifa);
    document.getElementById('nadiya-tarifa-valor').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _saveTarifa();
    });

    // Gesto oculto: 7 toques na nota do rodapé para alterar a tarifa
    var TARIFA_TAPS = 7;
    var TARIFA_WINDOW_MS = 1400;
    var _tarifaClickState = { count: 0, timer: null };
    document.getElementById('nadiya-footnote').addEventListener('click', function () {
      clearTimeout(_tarifaClickState.timer);
      _tarifaClickState.count++;
      if (_tarifaClickState.count >= TARIFA_TAPS) {
        _tarifaClickState = { count: 0, timer: null };
        _openTarifaModal();
        return;
      }
      _tarifaClickState.timer = setTimeout(function () {
        _tarifaClickState = { count: 0, timer: null };
      }, TARIFA_WINDOW_MS);
    });

    document.getElementById('nadiya-ledger-body').addEventListener('click', function (e) {
      var tagEl = e.target.closest('.nad-tag-casa');
      if (!tagEl) return;
      var recordId = tagEl.dataset.id;

      if (_nEditMode) {
        _casaClickState = { id: null, count: 0, timer: null };
        _toggleCasa(recordId);
        return;
      }
      if (_casaClickState.id === recordId) _casaClickState.count++;
      else { _casaClickState.id = recordId; _casaClickState.count = 1; }
      clearTimeout(_casaClickState.timer);

      if (_casaClickState.count >= 3) {
        _casaClickState = { id: null, count: 0, timer: null };
        _toggleCasa(recordId);
        return;
      }
      _casaClickState.timer = setTimeout(function () {
        _casaClickState = { id: null, count: 0, timer: null };
      }, CASA_EDIT_WINDOW_MS);
    });

    document.getElementById('nadiya-ledger-body').addEventListener('change', function (e) {
      var input = e.target.closest('.nad-time-edit');
      if (!input) return;
      _editTime(input.dataset.id, input.dataset.field, input.value);
    });

    document.getElementById('nadiya-prev-month').addEventListener('click', function () {
      if (_nMonthIndex > 0) { _nMonthIndex--; render(); }
    });
    document.getElementById('nadiya-next-month').addEventListener('click', function () {
      if (_nMonthIndex < _nMonths.length - 1) { _nMonthIndex++; render(); }
    });

    document.getElementById('nadiya-lang-pt').addEventListener('click', function () {
      _nLang = 'pt'; _saveLang(_nLang); document.documentElement.lang = 'pt'; render();
    });
    document.getElementById('nadiya-lang-uk').addEventListener('click', function () {
      _nLang = 'uk'; _saveLang(_nLang); document.documentElement.lang = 'uk'; render();
    });

    var EDIT_BUBBLE_TAPS = 7;
    var EDIT_BUBBLE_WINDOW_MS = 1400;
    var _bubbleClickState = { count: 0, timer: null };

    document.getElementById('nadiya-edit-bubble').addEventListener('click', function () {
      if (_nEditMode) {
        _nEditMode = false;
        _bubbleClickState = { count: 0, timer: null };
        render();
        return;
      }
      clearTimeout(_bubbleClickState.timer);
      _bubbleClickState.count++;
      if (_bubbleClickState.count >= EDIT_BUBBLE_TAPS) {
        _nEditMode = true;
        _bubbleClickState = { count: 0, timer: null };
        render();
        return;
      }
      _bubbleClickState.timer = setTimeout(function () {
        _bubbleClickState = { count: 0, timer: null };
      }, EDIT_BUBBLE_WINDOW_MS);
    });
  }

  function _tickClock() {
    var el = document.getElementById('nadiya-live-clock');
    if (!el) return;
    var d = new Date();
    el.textContent =
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');
  }
  setInterval(_tickClock, 1000);

  // ══════════════════════════════════════════════════════════════
  //  SALDO NO DASHBOARD (index.html → #saft-reminder)
  //  Mostra, no painel esquerdo do dashboard "wakzome", o saldo do
  //  mês mais recente que já tenha um recibo formal carregado
  //  (positivo ou negativo). Independente do overlay estar aberto —
  //  corre sozinho assim que este ficheiro é incluído na página.
  // ══════════════════════════════════════════════════════════════
  var DASH_SALDO_CONTAINER_ID = 'saft-reminder';
  var DASH_SALDO_WIDGET_ID    = 'nadiya-dash-saldo';
  var DASH_SALDO_MAX_MONTHS   = 12; // tope de meses para trás — evita chamadas infinitas à API
  var _dashSaldoInited        = false;

  function _dashGetSb() {
    if (typeof sbAdmin !== 'undefined' && sbAdmin) return Promise.resolve(sbAdmin);
    return new Promise(function (resolve) {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof sbAdmin !== 'undefined' && sbAdmin) { clearInterval(iv); resolve(sbAdmin); return; }
        if (++tries > 50) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  function _dashFetchRecibo(mes) {
    return fetch('/api/nadiya-saldo?mes=' + encodeURIComponent(mes), { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok) return { encontrado: false };
        return { encontrado: !!r.data.encontrado, credito: parseFloat(r.data.credito) || 0 };
      })
      .catch(function () { return { encontrado: false }; });
  }

  function _dashHorasEurosDoMes(records, tarifas, monthKey) {
    var workEuros = 0, visitEuros = 0;
    records.forEach(function (r) {
      if (_monthKeyOf(r.entrada) !== monthKey) return;
      if (r.tipo === 'trabalho' && r.salida) {
        workEuros += _hoursBetween(r.entrada, r.salida) * _rateFor(r.entrada, tarifas);
      } else if (r.tipo === 'visita') {
        visitEuros += _rateFor(r.entrada, tarifas);
      }
    });
    return workEuros + visitEuros;
  }

  // Percorre meses (do mais recente para trás) até encontrar um com recibo "encontrado".
  function _dashFindSaldoRecente(records, tarifas, monthsBack) {
    var cursor = new Date();
    cursor.setDate(1); // evita saltos incorretos ao recuar meses em dias 29-31

    function attempt(i) {
      if (i >= monthsBack) return Promise.resolve(null);
      var monthKey = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
      var mes = _mesFromMonthKey(monthKey);
      return _dashFetchRecibo(mes).then(function (recibo) {
        if (recibo.encontrado) {
          return {
            monthKey: monthKey,
            saldo: _dashHorasEurosDoMes(records, tarifas, monthKey) - recibo.credito
          };
        }
        cursor.setMonth(cursor.getMonth() - 1);
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  function _dashMonthLabel(monthKey) {
    var parts = monthKey.split('-');
    var idx = parseInt(parts[1], 10) - 1;
    var names = I18N[_nLang].monthNames;
    return (names[idx] || parts[1]) + ' ' + parts[0];
  }

  function _dashRenderSaldo(container, result) {
    var existing = document.getElementById(DASH_SALDO_WIDGET_ID);
    if (existing) existing.remove();
    if (!result) return;

    var wrap = document.createElement('div');
    wrap.id = DASH_SALDO_WIDGET_ID;
    wrap.style.cssText = 'width:100%;';

    var divider = document.createElement('div');
    divider.style.cssText = 'width:100%;height:1px;background:#e8e8e8;margin:12px 0 8px;';

    var label = document.createElement('div');
    label.style.cssText = 'font-size:.6rem;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#000;margin-bottom:4px;';
    label.textContent = t('saldoLabel') + ' \u00b7 ' + _dashMonthLabel(result.monthKey);

    var value = document.createElement('div');
    var positivo = result.saldo >= 0;
    value.style.cssText = 'font-size:1.3rem;font-weight:600;line-height:1;letter-spacing:-.01em;color:' + (positivo ? '#2a8a2a' : '#c05000') + ';';
    value.textContent = (positivo ? '+' : '') + _fmtEuros(result.saldo);

    wrap.appendChild(divider);
    wrap.appendChild(label);
    wrap.appendChild(value);
    container.appendChild(wrap);
  }

  function _initDashSaldo() {
    if (_dashSaldoInited) return;
    _dashSaldoInited = true;

    var container = document.getElementById(DASH_SALDO_CONTAINER_ID);
    if (!container) return;

    _dashGetSb().then(function (sb) {
      if (!sb) return;
      return Promise.all([
        sb.from(TABLE).select('*'),
        sb.from(TABLE_TARIFAS).select('*').order('vigente_desde', { ascending: true })
      ]).then(function (results) {
        var resRecords = results[0], resTarifas = results[1];
        if (resRecords.error || resTarifas.error) return;
        var records = resRecords.data || [];
        var tarifas = resTarifas.data || [];
        return _dashFindSaldoRecente(records, tarifas, DASH_SALDO_MAX_MONTHS)
          .then(function (result) { _dashRenderSaldo(container, result); });
      });
    }).catch(function () { /* falha silenciosa — o painel simplesmente não mostra o saldo */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDashSaldo);
  } else {
    _initDashSaldo();
  }

})();
