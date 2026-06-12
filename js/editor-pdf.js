// ══════════════════════════════════════════════════════════════
//  ADMIN: EDITOR PDF — v2.0
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── 1. STATE ────────────────────────────────────────────────
  let edPdfDoc      = null;
  let edPdfBytes    = null;
  let edPageCount   = 0;
  let edPageSizes   = [];  // [{width,height}] em PDF pts por página
  let edElements    = [];  // { pageIndex, el, type, ... }
  let edSelectedEl  = null;
  let edEditingEl   = null;
  let edScale       = 1.5;

  // Formatação de texto
  let edBold        = false;
  let edItalic      = false;
  let edUnderlineOn = false;
  let edFontFamily  = 'Helvetica';

  // Ferramenta ativa: 'select' | 'draw' | 'highlight' | 'strikethrough' | 'underline-annot' | 'sticky'
  let edActiveTool  = 'select';
  let edShapeMode   = 'rect'; // rect | ellipse | line | arrow

  // Desenho livre
  let edDrawColor   = '#000000';
  let edDrawSize    = 2;
  let edDrawPaths   = {};   // { pageIndex: [{color,size,points:[{x,y}]}] } — coords normalizadas 0-1
  let edIsDrawing   = false;
  let edCurrentPath = null;
  let edDrawCtxMap  = {};   // { pageIndex: {canvas, ctx} }

  // Modo nativo
  let edNativeEditMode = false;

  // Histórico
  let edHistory    = [];
  let edHistoryIdx = -1;

  // ── 2. DOM REFS ─────────────────────────────────────────────
  const edFileInput      = document.getElementById('ed-file-input');
  const edImgInput       = document.getElementById('ed-img-input');
  const edPagesContainer = document.getElementById('ed-pages-container');
  const edDropHint       = document.getElementById('ed-drop-hint');
  const edPageSelect     = document.getElementById('ed-page-select');
  const edFontSize       = document.getElementById('ed-font-size');
  const edFontColor      = document.getElementById('ed-font-color');
  const edExportBtn      = document.getElementById('ed-export-btn');
  const edAddTextBtn     = document.getElementById('ed-add-text-btn');
  const edUndoBtn        = document.getElementById('ed-undo-btn');
  const edRedoBtn        = document.getElementById('ed-redo-btn');
  const edEditNativeBtn  = document.getElementById('ed-edit-native-btn');
  // Novos
  const edBoldBtn        = document.getElementById('ed-bold-btn');
  const edItalicBtn      = document.getElementById('ed-italic-btn');
  const edUnderlineBtn   = document.getElementById('ed-underline-btn');
  const edFontFamilyEl   = document.getElementById('ed-font-family');
  const edDrawBtn        = document.getElementById('ed-draw-btn');
  const edDrawColorEl    = document.getElementById('ed-draw-color');
  const edDrawSizeEl     = document.getElementById('ed-draw-size');
  const edShapeBtn       = document.getElementById('ed-shape-btn');
  const edHighlightBtn   = document.getElementById('ed-highlight-btn');
  const edStickyBtn      = document.getElementById('ed-sticky-btn');
  const edStampBtn       = document.getElementById('ed-stamp-btn');
  const edPagesBtn       = document.getElementById('ed-pages-btn');
  const edConcatInput    = document.getElementById('ed-concat-input');
  const edZoomOutBtn     = document.getElementById('ed-zoom-out-btn');
  const edZoomInBtn      = document.getElementById('ed-zoom-in-btn');
  const edZoomDisplay    = document.getElementById('ed-zoom-display');
  const edShapePicker    = document.getElementById('ed-shape-picker');
  const edStampPicker    = document.getElementById('ed-stamp-picker');
  const edPagesModal     = document.getElementById('ed-pages-modal');
  const edPagesModalList = document.getElementById('ed-pages-modal-list');
  // Export modal
  const edExportModal    = document.getElementById('ed-export-modal');
  const edExportFilename = document.getElementById('ed-export-filename');
  const edExportCancel   = document.getElementById('ed-export-cancel');
  const edExportConfirm  = document.getElementById('ed-export-confirm');
  const edFolderPickBtn  = document.getElementById('ed-folder-pick-btn');
  const edFolderDisplay  = document.getElementById('ed-folder-display');
  const edExportHint     = document.getElementById('ed-export-hint');

  edFontColor.value = '#000000';
  let edChosenDirHandle = null;

  // ── 3. HISTÓRICO ────────────────────────────────────────────
  function edPushHistory(entry) {
    edHistory = edHistory.slice(0, edHistoryIdx + 1);
    edHistory.push(entry);
    edHistoryIdx = edHistory.length - 1;
    edUpdateUndoRedo();
  }
  function edUpdateUndoRedo() {
    edUndoBtn.disabled = edHistoryIdx < 0;
    edRedoBtn.disabled = edHistoryIdx >= edHistory.length - 1;
  }
  function edUndo() {
    if (edHistoryIdx < 0) return;
    const entry = edHistory[edHistoryIdx--];
    edApplyInverse(entry);
    edUpdateUndoRedo();
  }
  function edRedo() {
    if (edHistoryIdx >= edHistory.length - 1) return;
    const entry = edHistory[++edHistoryIdx];
    edApplyForward(entry);
    edUpdateUndoRedo();
  }
  function edApplyInverse(entry) {
    if (entry.type === 'add') {
      entry.el.remove();
      edElements = edElements.filter(r => r.el !== entry.el);
      if (edSelectedEl === entry.el) edSelectedEl = null;
    } else if (entry.type === 'delete') {
      const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (entry.record.pageIndex + 1) + '"]');
      if (wrap) wrap.appendChild(entry.record.el);
      edElements.push(entry.record);
    } else if (entry.type === 'move') {
      entry.el.style.left = entry.prevLeft;
      entry.el.style.top  = entry.prevTop;
    } else if (entry.type === 'resize') {
      entry.el.style.left   = entry.prevLeft;
      entry.el.style.top    = entry.prevTop;
      entry.el.style.width  = entry.prevW;
      entry.el.style.height = entry.prevH;
    } else if (entry.type === 'text') {
      const ta = entry.ta || entry.el.querySelector('textarea');
      if (ta) ta.value = entry.prevText;
    } else if (entry.type === 'draw') {
      const paths = edDrawPaths[entry.pageIndex];
      if (paths && paths.length) paths.pop();
      edRedrawCanvas(entry.pageIndex);
    }
  }
  function edApplyForward(entry) {
    if (entry.type === 'add') {
      const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (entry.record.pageIndex + 1) + '"]');
      if (wrap) wrap.appendChild(entry.record.el);
      edElements.push(entry.record);
    } else if (entry.type === 'delete') {
      entry.record.el.remove();
      edElements = edElements.filter(r => r.el !== entry.record.el);
    } else if (entry.type === 'move') {
      entry.el.style.left = entry.nextLeft;
      entry.el.style.top  = entry.nextTop;
    } else if (entry.type === 'resize') {
      entry.el.style.left   = entry.nextLeft;
      entry.el.style.top    = entry.nextTop;
      entry.el.style.width  = entry.nextW;
      entry.el.style.height = entry.nextH;
    } else if (entry.type === 'text') {
      const ta = entry.ta || entry.el.querySelector('textarea');
      if (ta) ta.value = entry.nextText;
    } else if (entry.type === 'draw') {
      if (!edDrawPaths[entry.pageIndex]) edDrawPaths[entry.pageIndex] = [];
      edDrawPaths[entry.pageIndex].push(entry.path);
      edRedrawCanvas(entry.pageIndex);
    }
  }
  edUndoBtn.addEventListener('click', edUndo);
  edRedoBtn.addEventListener('click', edRedo);
  edUpdateUndoRedo();

  // ── 4. CARREGAR PDF ─────────────────────────────────────────
  edFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) edLoadFile(file);
    e.target.value = '';
  });

  async function edLoadFile(file) {
    edDropHint.style.display = 'none';
    edPagesContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#aaa;font-weight:bold;font-size:.85rem;">a carregar…</div>';
    try {
      edPdfBytes      = await file.arrayBuffer();
      edElements      = [];
      edSelectedEl    = null;
      edEditingEl     = null;
      edHistory       = [];
      edHistoryIdx    = -1;
      edDrawPaths     = {};
      edDrawCtxMap    = {};
      edPageSizes     = [];
      edNativeEditMode = false;
      edEditNativeBtn.classList.remove('active');
      edEditNativeBtn.textContent = '🔤 editar texto original';
      edSetTool('select');
      edUpdateUndoRedo();

      edPdfDoc    = await pdfjsLib.getDocument({ data: edPdfBytes.slice(0) }).promise;
      edPageCount = edPdfDoc.numPages;

      edPageSelect.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i + ' / ' + edPageCount;
        edPageSelect.appendChild(opt);
      }
      edPagesContainer.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);

      edExportBtn.disabled = false;
      if (edPagesBtn) edPagesBtn.disabled = false;
      edUpdateZoomDisplay();
    } catch (err) {
      edPagesContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#c03000;font-weight:bold;font-size:.85rem;">erro ao carregar PDF</div>';
      console.error(err);
    }
  }

  // ── 5. RENDERIZAR PÁGINA ────────────────────────────────────
  async function edRenderPage(pageNum) {
    const page     = await edPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: edScale });

    // Guardar tamanho PDF desta página
    const pdfVP = page.getViewport({ scale: 1 });
    edPageSizes[pageNum - 1] = { width: pdfVP.width, height: pdfVP.height };

    const wrap = document.createElement('div');
    wrap.className    = 'ed-page';
    wrap.dataset.page = pageNum;
    wrap.style.width  = viewport.width  + 'px';
    wrap.style.height = viewport.height + 'px';

    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    wrap.appendChild(canvas);

    // Canvas de desenho livre (overlay)
    const drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'ed-draw-canvas';
    drawCanvas.width     = viewport.width;
    drawCanvas.height    = viewport.height;
    wrap.appendChild(drawCanvas);
    edDrawCtxMap[pageNum - 1] = { canvas: drawCanvas, ctx: drawCanvas.getContext('2d') };
    edRedrawCanvas(pageNum - 1);
    edBindDrawEvents(drawCanvas, wrap, pageNum - 1);

    edPagesContainer.appendChild(wrap);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Texto original do PDF
    await edExtractNativeText(page, wrap, pageNum - 1, viewport);

    // Recolocar elementos existentes desta página
    edElements.filter(r => r.pageIndex === pageNum - 1 && r.type !== 'native-text').forEach(r => {
      wrap.appendChild(r.el);
    });

    // Clicar em área vazia → deselecionar
    wrap.addEventListener('mousedown', function (e) {
      if (edActiveTool === 'sticky' && (e.target === wrap || e.target === canvas)) {
        edCreateStickyEl(wrap, pageNum - 1, e.offsetX - 10, e.offsetY - 10);
        return;
      }
      if (e.target === wrap || e.target === canvas) {
        edStopEditing(); edDeselect();
      }
    });
  }

  edPageSelect.addEventListener('change', function () {
    const pages  = edPagesContainer.querySelectorAll('.ed-page');
    const target = pages[parseInt(this.value) - 1];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ── 6. CANVAS DE DESENHO ────────────────────────────────────
  function edRedrawCanvas(pageIndex) {
    const entry = edDrawCtxMap[pageIndex];
    if (!entry) return;
    const { canvas, ctx } = entry;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const paths = edDrawPaths[pageIndex] || [];
    paths.forEach(path => {
      if (!path.points || path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth   = path.size;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      const p0 = path.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
      path.points.slice(1).forEach(pt => ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height));
      ctx.stroke();
    });
  }

  function edBindDrawEvents(drawCanvas, wrap, pageIndex) {
    drawCanvas.addEventListener('mousedown', function (e) {
      if (edActiveTool !== 'draw') return;
      e.stopPropagation();
      edIsDrawing   = true;
      const rect    = drawCanvas.getBoundingClientRect();
      const normX   = (e.clientX - rect.left)  / drawCanvas.width;
      const normY   = (e.clientY - rect.top)    / drawCanvas.height;
      edCurrentPath = { pageIndex, color: edDrawColor, size: edDrawSize, points: [{ x: normX, y: normY }] };
    });
    document.addEventListener('mousemove', function (e) {
      if (!edIsDrawing || !edCurrentPath || edCurrentPath.pageIndex !== pageIndex) return;
      const rect  = drawCanvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left)  / drawCanvas.width;
      const normY = (e.clientY - rect.top)    / drawCanvas.height;
      edCurrentPath.points.push({ x: normX, y: normY });
      // Desenho em tempo real
      const entry = edDrawCtxMap[pageIndex];
      if (entry) {
        edRedrawCanvas(pageIndex);
        const { canvas, ctx } = entry;
        ctx.beginPath();
        ctx.strokeStyle = edCurrentPath.color;
        ctx.lineWidth   = edCurrentPath.size;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        const p0 = edCurrentPath.points[0];
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
        edCurrentPath.points.slice(1).forEach(pt => ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height));
        ctx.stroke();
      }
    });
    document.addEventListener('mouseup', function () {
      if (!edIsDrawing || !edCurrentPath || edCurrentPath.pageIndex !== pageIndex) return;
      edIsDrawing = false;
      if (edCurrentPath.points.length > 1) {
        if (!edDrawPaths[pageIndex]) edDrawPaths[pageIndex] = [];
        const path = Object.assign({}, edCurrentPath);
        edDrawPaths[pageIndex].push(path);
        edPushHistory({ type: 'draw', pageIndex, path });
        edRedrawCanvas(pageIndex);
      }
      edCurrentPath = null;
    });
  }

  // ── 7. CONTROLO DE FERRAMENTA ───────────────────────────────
  function edSetTool(tool) {
    edActiveTool = tool;
    // Atualizar botões
    [edDrawBtn, edHighlightBtn, edStickyBtn].forEach(btn => btn && btn.classList.remove('active'));
    // Canvas de desenho: pointer-events
    document.querySelectorAll('.ed-draw-canvas').forEach(c => {
      c.classList.toggle('ed-draw-active', tool === 'draw');
    });
    // Overlay de anotação
    document.querySelectorAll('.ed-annot-overlay').forEach(o => o.remove());
    if (tool === 'highlight' || tool === 'strikethrough' || tool === 'underline-annot') {
      edHighlightBtn && edHighlightBtn.classList.add('active');
      edPagesContainer.querySelectorAll('.ed-page').forEach((wrap, idx) => {
        edAddAnnotOverlay(wrap, idx);
      });
    } else if (tool === 'draw') {
      edDrawBtn && edDrawBtn.classList.add('active');
      edDeselect(); edStopEditing();
    } else if (tool === 'sticky') {
      edStickyBtn && edStickyBtn.classList.add('active');
    }
  }

  // ── 8. TEXTO NATIVO ─────────────────────────────────────────
  edEditNativeBtn.addEventListener('click', function () {
    edNativeEditMode = !edNativeEditMode;
    edEditNativeBtn.classList.toggle('active', edNativeEditMode);
    edEditNativeBtn.textContent = edNativeEditMode ? '🔤 sair de edição' : '🔤 editar texto original';
    edElements.forEach(r => {
      if (r.type !== 'native-text') return;
      r.el.classList.toggle('editable-mode', edNativeEditMode);
      if (!edNativeEditMode) {
        if (edEditingEl === r.el) edStopEditing();
        if (edSelectedEl === r.el) edDeselect();
      }
    });
  });

  async function edExtractNativeText(page, wrap, pageIndex, viewport) {
    let textContent;
    try { textContent = await page.getTextContent(); } catch (e) { return; }
    const items = (textContent.items || []).filter(it => it.str && it.str.trim());
    if (!items.length) return;

    const groups = [];
    items.forEach(function (item) {
      var pt;
      try { pt = viewport.convertToViewportPoint(item.transform[4], item.transform[5]); } catch (e) { return; }
      var vx = pt[0], vy = pt[1];
      var fontPx = Math.abs(item.transform[0]) * edScale;
      if (fontPx < 1) fontPx = 12 * edScale / 72;
      var group = null;
      for (var g = 0; g < groups.length; g++) {
        if (Math.abs(groups[g].baseVY - vy) < fontPx * 0.7) { group = groups[g]; break; }
      }
      if (!group) { group = { baseVY: vy, fontPx: fontPx, items: [] }; groups.push(group); }
      group.items.push({ item: item, vx: vx, vy: vy, fontPx: fontPx });
    });
    groups.sort((a, b) => a.baseVY - b.baseVY);
    groups.forEach(g => g.items.sort((a, b) => a.vx - b.vx));

    groups.forEach(function (group) {
      var text = group.items.map(i => i.item.str).join('');
      if (!text.trim()) return;
      var first   = group.items[0];
      var fontPx  = first.fontPx;
      var vx      = first.vx;
      var elTop   = group.baseVY - fontPx * 1.15;
      var totalW  = group.items.reduce((s, i) => s + (i.item.width || 0) * edScale, 0);
      if (totalW < fontPx * 0.8) totalW = fontPx * text.length * 0.6;
      totalW = Math.max(totalW, fontPx * 2);
      var pdfX        = first.item.transform[4];
      var pdfY        = first.item.transform[5];
      var pdfFontSize = Math.abs(first.item.transform[0]);
      var pdfTotalW   = group.items.reduce((s, i) => s + (i.item.width || 0), 0);

      var el = document.createElement('div');
      el.className = 'ed-element ed-text-el ed-native-text';
      el.style.left  = vx + 'px';
      el.style.top   = elTop + 'px';
      el.style.width = (totalW + 6) + 'px';

      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = [
        'display:block', 'width:100%',
        'min-height:' + Math.ceil(fontPx * 1.3) + 'px',
        'padding:0 2px', 'box-sizing:border-box',
        'border:none', 'outline:none',
        'background:transparent', 'resize:none', 'overflow:hidden',
        'font-family:Arial,Helvetica,sans-serif',
        'font-size:' + Math.round(fontPx) + 'px',
        'color:transparent',
        'line-height:1.3',
        'writing-mode:horizontal-tb', 'direction:ltr',
        'pointer-events:none', 'cursor:text'
      ].join(';');
      ta.rows = 1; ta.spellcheck = false;
      el.appendChild(ta);

      function autoResize() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(Math.ceil(fontPx * 1.3), ta.scrollHeight) + 'px';
        el.style.height = ta.offsetHeight + 'px';
      }
      autoResize();
      ta.addEventListener('input', autoResize);

      // Clique simples = selecionar (activa edição nativa automaticamente)
      el.addEventListener('mousedown', function (e) {
        if (edActiveTool !== 'select') return;
        if (e.target.classList.contains('ed-del-btn')) return;
        if (el.classList.contains('editing')) return;
        e.stopPropagation();
        // Auto-ativar modo nativo ao clicar diretamente
        if (!edNativeEditMode) {
          edNativeEditMode = true;
          edEditNativeBtn.classList.add('active');
          edEditNativeBtn.textContent = '🔤 sair de edição';
          edElements.forEach(r => { if (r.type === 'native-text') r.el.classList.add('editable-mode'); });
        }
        edStopEditing(); edSelect(el);
      });
      el.addEventListener('dblclick', function (e) {
        if (edActiveTool !== 'select') return;
        e.stopPropagation();
        if (!edNativeEditMode) {
          edNativeEditMode = true;
          edEditNativeBtn.classList.add('active');
          edEditNativeBtn.textContent = '🔤 sair de edição';
          edElements.forEach(r => { if (r.type === 'native-text') r.el.classList.add('editable-mode'); });
        }
        edEnterEditing(el);
      });

      if (edNativeEditMode) el.classList.add('editable-mode');
      wrap.appendChild(el);

      var record = {
        pageIndex: pageIndex, el: el, ta: ta, type: 'native-text',
        originalText: text, pdfX: pdfX, pdfY: pdfY,
        pdfFontSize: pdfFontSize, pdfTotalW: pdfTotalW,
        viewX: vx, viewY: elTop
      };
      edElements.push(record);
    });
  }

  // ── 9. ADICIONAR TEXTO ──────────────────────────────────────
  edAddTextBtn.addEventListener('click', function () {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    edStopEditing();
    const record = edCreateTextEl(wrap, pageNum - 1, 40, 40, '');
    edPushHistory({ type: 'add', el: record.el, record });
  });

  function edCreateTextEl(wrap, pageIndex, x, y, text, opts) {
    opts = opts || {};
    const fontSize   = opts.fontSize   || parseInt(edFontSize.value) || 14;
    const color      = opts.color      || edFontColor.value          || '#000000';
    const bold       = opts.bold       !== undefined ? opts.bold       : edBold;
    const italic     = opts.italic     !== undefined ? opts.italic     : edItalic;
    const underline  = opts.underline  !== undefined ? opts.underline  : edUnderlineOn;
    const fontFamily = opts.fontFamily || edFontFamily                 || 'Helvetica';

    const el = document.createElement('div');
    el.className   = 'ed-element ed-text-el';
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = '160px';

    const ta = document.createElement('textarea');
    ta.value = text !== undefined ? text : '';
    ta.style.cssText = [
      'display:block', 'width:100%', 'min-height:28px',
      'padding:4px 6px', 'box-sizing:border-box',
      'border:none', 'outline:none',
      'background:transparent', 'resize:none', 'overflow:hidden',
      'font-family:' + edPdfFontToCSS(fontFamily),
      'font-size:' + fontSize + 'px',
      'font-weight:' + (bold ? 'bold' : 'normal'),
      'font-style:' + (italic ? 'italic' : 'normal'),
      'text-decoration:' + (underline ? 'underline' : 'none'),
      'line-height:1.5',
      'writing-mode:horizontal-tb', 'direction:ltr',
      'pointer-events:none', 'cursor:move'
    ].join(';');
    // Usar CSS custom property para cor (bypassa !important global)
    ta.style.setProperty('--ed-txt-color', color);
    ta.rows = 1; ta.spellcheck = false;
    el.appendChild(ta);

    function autoResize() {
      ta.style.height = 'auto';
      ta.style.height = Math.max(28, ta.scrollHeight) + 'px';
      el.style.height = ta.offsetHeight + 'px';
    }
    ta.addEventListener('input', autoResize);
    setTimeout(autoResize, 0);

    edAddHandles(el);
    edMakeDraggable(el, wrap);

    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (el.classList.contains('editing')) return;
      e.stopPropagation();
      edStopEditing(); edSelect(el);
    });
    el.addEventListener('dblclick', function (e) {
      e.stopPropagation(); edEnterEditing(el);
    });

    wrap.appendChild(el);
    const record = { pageIndex, el, ta, type: 'text', bold, italic, underline, fontFamily, textColor: color };
    edElements.push(record);
    edSelect(el);
    setTimeout(() => { edEnterEditing(el); autoResize(); }, 40);
    return record;
  }

  // ── 10. EDIÇÃO DE TEXTO ─────────────────────────────────────
  function edEnterEditing(el) {
    if (el.classList.contains('editing')) return;
    edStopEditing(); edSelect(el);
    el.classList.add('editing');
    edEditingEl = el;
    const ta = el.querySelector('textarea');
    if (!ta) return;
    ta.dataset.textBefore  = ta.value;
    ta.style.pointerEvents = 'auto';
    ta.style.cursor        = 'text';
    ta.style.background    = el.classList.contains('ed-native-text')
      ? 'rgba(255,255,248,0.97)'
      : 'rgba(255,255,255,0.92)';
    if (el.classList.contains('ed-native-text')) ta.style.color = '#000';
    if (el.classList.contains('ed-sticky-el'))   ta.style.setProperty('--ed-txt-color', '#333');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function edStopEditing() {
    if (!edEditingEl) return;
    const el = edEditingEl;
    edEditingEl = null;
    el.classList.remove('editing');
    const ta = el.querySelector('textarea');
    if (ta) {
      ta.style.pointerEvents = 'none';
      ta.style.cursor        = 'move';
      ta.style.background    = 'transparent';
      const before = ta.dataset.textBefore || '';
      const after  = ta.value;
      if (before !== after) edPushHistory({ type: 'text', el, ta, prevText: before, nextText: after });
      if (el.classList.contains('ed-native-text')) {
        const record = edElements.find(r => r.el === el);
        el.classList.toggle('modified', !!(record && after !== record.originalText));
        if (!el.classList.contains('modified')) ta.style.color = 'transparent';
      }
      delete ta.dataset.textBefore;
    }
  }

  // ── 11. FORMATAÇÃO DE TEXTO ─────────────────────────────────
  if (edBoldBtn) edBoldBtn.addEventListener('click', function () {
    edBold = !edBold;
    edBoldBtn.classList.toggle('ed-fmt-active', edBold);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontWeight = edBold ? 'bold' : 'normal';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.bold = edBold;
    }
  });
  if (edItalicBtn) edItalicBtn.addEventListener('click', function () {
    edItalic = !edItalic;
    edItalicBtn.classList.toggle('ed-fmt-active', edItalic);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontStyle = edItalic ? 'italic' : 'normal';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.italic = edItalic;
    }
  });
  if (edUnderlineBtn) edUnderlineBtn.addEventListener('click', function () {
    edUnderlineOn = !edUnderlineOn;
    edUnderlineBtn.classList.toggle('ed-fmt-active', edUnderlineOn);
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.textDecoration = edUnderlineOn ? 'underline' : 'none';
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.underline = edUnderlineOn;
    }
  });
  if (edFontFamilyEl) edFontFamilyEl.addEventListener('change', function () {
    edFontFamily = this.value;
    if (edSelectedEl && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontFamily = edPdfFontToCSS(this.value);
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.fontFamily = this.value;
    }
  });

  // ── 12. CONTROLOS FONTE ─────────────────────────────────────
  edFontSize.addEventListener('input', function () {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.setProperty('--ed-font-sz', this.value + 'px');
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.fontSize = parseInt(this.value);
    }
  });
  edFontColor.addEventListener('input', function () {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el') && !edSelectedEl.classList.contains('ed-native-text')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.setProperty('--ed-txt-color', this.value);
      const r = edElements.find(r => r.el === edSelectedEl);
      if (r) r.textColor = this.value;
    }
  });

  // ── 13. ADICIONAR IMAGEM ────────────────────────────────────
  edImgInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const pageNum = parseInt(edPageSelect.value) || 1;
      const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
      if (!wrap) return;
      edStopEditing();
      const record = edCreateImageEl(wrap, pageNum - 1, 60, 60, ev.target.result);
      edPushHistory({ type: 'add', el: record.el, record });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  function edCreateImageEl(wrap, pageIndex, x, y, src, w, h) {
    const el = document.createElement('div');
    el.className    = 'ed-element ed-img-el';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = (w || 160) + 'px';
    el.style.height = (h || 120) + 'px';
    const img = document.createElement('img');
    img.src = src;
    el.appendChild(img);
    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    wrap.appendChild(el);
    const record = { pageIndex, el, type: 'image', src };
    edElements.push(record);
    edSelect(el);
    return record;
  }

  // ── 14. FORMAS ──────────────────────────────────────────────
  const SHAPE_DEFS = [
    { type: 'rect',    label: '⬜ retângulo' },
    { type: 'ellipse', label: '⭕ elipse' },
    { type: 'line',    label: '╱ linha' },
    { type: 'arrow',   label: '→ seta' },
  ];
  if (edShapePicker) {
    SHAPE_DEFS.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent  = s.label;
      btn.dataset.type = s.type;
      btn.addEventListener('click', function () {
        edShapeMode = s.type;
        edCloseAllPickers();
        edInsertShape(s.type);
      });
      edShapePicker.appendChild(btn);
    });
  }
  if (edShapeBtn) edShapeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    const show = !edShapePicker.classList.contains('show');
    edCloseAllPickers();
    if (show) {
      const rect = edShapeBtn.getBoundingClientRect();
      edShapePicker.style.top  = (rect.bottom + 4) + 'px';
      edShapePicker.style.left = rect.left + 'px';
      edShapePicker.classList.add('show');
    }
  });

  function edInsertShape(shapeType) {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    const record = edCreateShapeEl(wrap, pageNum - 1, 60, 80, 160, 90, shapeType);
    edPushHistory({ type: 'add', el: record.el, record });
  }

  function edCreateShapeEl(wrap, pageIndex, x, y, w, h, shapeType, opts) {
    opts = opts || {};
    const strokeColor = opts.strokeColor || edFontColor.value || '#000000';
    const fillColor   = opts.fillColor   || 'none';
    const strokeWidth = opts.strokeWidth || 2;

    const el = document.createElement('div');
    el.className    = 'ed-element ed-shape-el';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText    = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    el.appendChild(svg);

    function refreshSVG() {
      const ew = el.offsetWidth  || w;
      const eh = el.offsetHeight || h;
      edBuildShapeSVG(svg, shapeType, ew, eh, strokeColor, fillColor, strokeWidth);
    }
    setTimeout(refreshSVG, 0);
    new ResizeObserver(refreshSVG).observe(el);

    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    wrap.appendChild(el);
    const record = { pageIndex, el, svg, type: 'shape', shapeType, strokeColor, fillColor, strokeWidth };
    edElements.push(record);
    edSelect(el);
    return record;
  }

  function edBuildShapeSVG(svg, shapeType, w, h, strokeColor, fillColor, sw) {
    svg.innerHTML = '';
    const ns  = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    let shape;
    if (shapeType === 'rect') {
      shape = document.createElementNS(ns, 'rect');
      shape.setAttribute('x', sw / 2); shape.setAttribute('y', sw / 2);
      shape.setAttribute('width', Math.max(1, w - sw)); shape.setAttribute('height', Math.max(1, h - sw));
    } else if (shapeType === 'ellipse') {
      shape = document.createElementNS(ns, 'ellipse');
      shape.setAttribute('cx', w / 2); shape.setAttribute('cy', h / 2);
      shape.setAttribute('rx', Math.max(1, w / 2 - sw / 2)); shape.setAttribute('ry', Math.max(1, h / 2 - sw / 2));
    } else if (shapeType === 'line') {
      shape = document.createElementNS(ns, 'line');
      shape.setAttribute('x1', 0); shape.setAttribute('y1', h);
      shape.setAttribute('x2', w); shape.setAttribute('y2', 0);
    } else if (shapeType === 'arrow') {
      const mid = 'arr' + Date.now();
      const defs = document.createElementNS(ns, 'defs');
      const mk   = document.createElementNS(ns, 'marker');
      mk.setAttribute('id', mid); mk.setAttribute('markerWidth', '10'); mk.setAttribute('markerHeight', '7');
      mk.setAttribute('refX', '9'); mk.setAttribute('refY', '3.5'); mk.setAttribute('orient', 'auto');
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', '0 0, 10 3.5, 0 7'); poly.setAttribute('fill', strokeColor);
      mk.appendChild(poly); defs.appendChild(mk); svg.appendChild(defs);
      shape = document.createElementNS(ns, 'line');
      shape.setAttribute('x1', 0); shape.setAttribute('y1', h);
      shape.setAttribute('x2', w); shape.setAttribute('y2', 0);
      shape.setAttribute('marker-end', 'url(#' + mid + ')');
    }
    if (shape) {
      shape.setAttribute('stroke', strokeColor);
      shape.setAttribute('stroke-width', sw);
      shape.setAttribute('fill', (shapeType === 'rect' || shapeType === 'ellipse') ? fillColor : 'none');
      svg.appendChild(shape);
    }
  }

  // ── 15. FERRAMENTA DESENHO ──────────────────────────────────
  if (edDrawBtn) edDrawBtn.addEventListener('click', function () {
    edSetTool(edActiveTool === 'draw' ? 'select' : 'draw');
  });
  if (edDrawColorEl) edDrawColorEl.addEventListener('input', function () { edDrawColor = this.value; });
  if (edDrawSizeEl)  edDrawSizeEl.addEventListener('input',  function () { edDrawSize  = Math.max(1, parseInt(this.value) || 2); });

  // ── 16. ANOTAÇÕES (HIGHLIGHT / RISCAR / SUBLINHAR) ──────────
  if (edHighlightBtn) edHighlightBtn.addEventListener('click', function () {
    const isActive = edActiveTool === 'highlight';
    edSetTool(isActive ? 'select' : 'highlight');
  });

  function edAddAnnotOverlay(wrap, pageIndex) {
    const ov = document.createElement('div');
    ov.className = 'ed-annot-overlay';
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:20;';
    let startX, startY, annotEl;
    ov.addEventListener('mousedown', function (e) {
      if (edActiveTool !== 'highlight' && edActiveTool !== 'strikethrough' && edActiveTool !== 'underline-annot') return;
      e.stopPropagation();
      const rect = ov.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      annotEl = document.createElement('div');
      annotEl.className = 'ed-element ed-annot-el annot-' + edActiveTool;
      annotEl.style.left   = startX + 'px';
      annotEl.style.top    = startY + 'px';
      annotEl.style.width  = '1px';
      annotEl.style.height = '20px';
      wrap.appendChild(annotEl);

      function onMove(ev) {
        const cx  = ev.clientX - rect.left;
        const cy  = ev.clientY - rect.top;
        const x   = Math.min(startX, cx);
        const wid = Math.abs(cx - startX);
        const hei = edActiveTool === 'highlight' ? Math.max(16, Math.abs(cy - startY)) : 18;
        annotEl.style.left   = x + 'px';
        annotEl.style.width  = wid + 'px';
        annotEl.style.height = hei + 'px';
        if (edActiveTool === 'strikethrough' || edActiveTool === 'underline-annot') {
          annotEl.style.top = startY + 'px';
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (parseFloat(annotEl.style.width) < 10) { annotEl.remove(); return; }
        edMakeDraggable(annotEl, wrap);
        edAddHandles(annotEl);
        annotEl.addEventListener('mousedown', function (ev) {
          ev.stopPropagation(); edStopEditing(); edSelect(annotEl);
        });
        const record = { pageIndex, el: annotEl, type: 'annotation', annotType: edActiveTool };
        edElements.push(record);
        edPushHistory({ type: 'add', el: annotEl, record });
        edSelect(annotEl);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
    wrap.appendChild(ov);
  }

  // ── 17. NOTAS ADESIVAS ──────────────────────────────────────
  if (edStickyBtn) edStickyBtn.addEventListener('click', function () {
    edSetTool(edActiveTool === 'sticky' ? 'select' : 'sticky');
  });

  function edCreateStickyEl(wrap, pageIndex, x, y) {
    const el = document.createElement('div');
    el.className  = 'ed-element ed-sticky-el';
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = '160px';

    const header = document.createElement('div');
    header.className   = 'ed-sticky-header';
    header.textContent = '📌 nota';
    el.appendChild(header);

    const ta = document.createElement('textarea');
    ta.placeholder     = 'Escreva aqui…';
    ta.style.cssText   = 'display:block;width:100%;min-height:60px;padding:5px 7px;box-sizing:border-box;border:none;outline:none;background:transparent;resize:none;overflow:hidden;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;writing-mode:horizontal-tb;direction:ltr;pointer-events:none;cursor:move;';
    ta.style.setProperty('--ed-txt-color', '#333');
    ta.rows = 4; ta.spellcheck = false;
    el.appendChild(ta);

    function autoResize() {
      ta.style.height = 'auto';
      ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
    }
    ta.addEventListener('input', autoResize);

    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (el.classList.contains('editing')) return;
      e.stopPropagation(); edStopEditing(); edSelect(el);
    });
    el.addEventListener('dblclick', function (e) { e.stopPropagation(); edEnterEditing(el); });

    wrap.appendChild(el);
    const record = { pageIndex, el, ta, type: 'sticky' };
    edElements.push(record);
    edSetTool('select');
    edSelect(el);
    setTimeout(() => edEnterEditing(el), 40);
    edPushHistory({ type: 'add', el, record });
    return record;
  }

  // ── 18. CARIMBOS ────────────────────────────────────────────
  const STAMPS = [
    { text: 'APROVADO',     color: '#2a8a2a' },
    { text: 'REVISTO',      color: '#0055cc' },
    { text: 'RASCUNHO',     color: '#888888' },
    { text: 'CONFIDENCIAL', color: '#c03000' },
    { text: 'ARQUIVADO',    color: '#663399' },
  ];
  if (edStampPicker) {
    STAMPS.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent       = s.text;
      btn.style.color       = s.color;
      btn.style.borderColor = s.color;
      btn.addEventListener('click', function () {
        edCloseAllPickers(); edInsertStamp(s.text, s.color);
      });
      edStampPicker.appendChild(btn);
    });
  }
  if (edStampBtn) edStampBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    const show = !edStampPicker.classList.contains('show');
    edCloseAllPickers();
    if (show) {
      const rect = edStampBtn.getBoundingClientRect();
      edStampPicker.style.top  = (rect.bottom + 4) + 'px';
      edStampPicker.style.left = rect.left + 'px';
      edStampPicker.classList.add('show');
    }
  });

  function edInsertStamp(stampText, color) {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'ed-element ed-stamp-el';
    el.style.cssText = 'position:absolute;left:60px;top:60px;width:auto;height:auto;padding:4px 12px;border:3px solid ' + color + ';border-radius:4px;color:' + color + ';font-family:Arial,sans-serif;font-size:22px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;opacity:.75;transform:rotate(-12deg);cursor:move;';
    el.textContent = stampText;
    edAddHandles(el);
    edMakeDraggable(el, wrap);
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); edStopEditing(); edSelect(el); });
    wrap.appendChild(el);
    const record = { pageIndex: pageNum - 1, el, type: 'stamp', stampText, color };
    edElements.push(record);
    edSelect(el);
    edPushHistory({ type: 'add', el, record });
    return record;
  }

  function edCloseAllPickers() {
    edShapePicker && edShapePicker.classList.remove('show');
    edStampPicker && edStampPicker.classList.remove('show');
  }
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('#ed-shape-picker') && !e.target.closest('#ed-shape-btn')) {
      edShapePicker && edShapePicker.classList.remove('show');
    }
    if (!e.target.closest('#ed-stamp-picker') && !e.target.closest('#ed-stamp-btn')) {
      edStampPicker && edStampPicker.classList.remove('show');
    }
  });

  // ── 19. GESTÃO DE PÁGINAS ───────────────────────────────────
  if (edPagesBtn) edPagesBtn.addEventListener('click', function () {
    if (!edPdfDoc) return;
    edOpenPagesModal();
  });

  async function edOpenPagesModal() {
    if (!edPagesModal || !edPagesModalList) return;
    edPagesModalList.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;font-size:.82rem;">a carregar…</div>';
    edPagesModal.classList.add('show');
    await new Promise(r => setTimeout(r, 30));
    edPagesModalList.innerHTML = '';

    for (let i = 0; i < edPageCount; i++) {
      const page     = await edPdfDoc.getPage(i + 1);
      const vp       = page.getViewport({ scale: 0.18 });
      const tc       = document.createElement('canvas');
      tc.width = vp.width; tc.height = vp.height;
      await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;

      const item = document.createElement('div');
      item.className = 'ed-pm-thumb';

      const lbl = document.createElement('div');
      lbl.className = 'ed-pm-label'; lbl.textContent = 'Página ' + (i + 1);

      const acts = document.createElement('div');
      acts.className = 'ed-pm-actions';

      const rotL = document.createElement('button');
      rotL.textContent = '↺'; rotL.title = 'Rodar -90°';
      rotL.addEventListener('click', async function (e) {
        e.stopPropagation();
        edPagesModal.classList.remove('show');
        await edRotatePage(i, -90);
        edOpenPagesModal();
      });
      const rotR = document.createElement('button');
      rotR.textContent = '↻'; rotR.title = 'Rodar +90°';
      rotR.addEventListener('click', async function (e) {
        e.stopPropagation();
        edPagesModal.classList.remove('show');
        await edRotatePage(i, 90);
        edOpenPagesModal();
      });
      const delB = document.createElement('button');
      delB.textContent = '✕'; delB.title = 'Eliminar página'; delB.className = 'ed-pm-del';
      delB.addEventListener('click', async function (e) {
        e.stopPropagation();
        if (edPageCount <= 1) { alert('Não é possível eliminar a única página.'); return; }
        if (!confirm('Eliminar página ' + (i + 1) + '?')) return;
        edPagesModal.classList.remove('show');
        await edDeletePage(i);
      });
      acts.appendChild(rotL); acts.appendChild(rotR); acts.appendChild(delB);
      item.appendChild(tc); item.appendChild(lbl); item.appendChild(acts);
      edPagesModalList.appendChild(item);
    }
  }

  async function edRotatePage(pageIndex, degrees) {
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(edPdfBytes);
      const pg     = pdfDoc.getPages()[pageIndex];
      const cur    = pg.getRotation().angle;
      pg.setRotation(PDFLib.degrees((cur + degrees + 360) % 360));
      edPdfBytes = (await pdfDoc.save()).buffer;
      await edReloadPages();
    } catch (err) { console.error('Rotate error:', err); }
  }

  async function edDeletePage(pageIndex) {
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(edPdfBytes);
      pdfDoc.removePage(pageIndex);
      edPdfBytes = (await pdfDoc.save()).buffer;
      // Remover elementos da página eliminada e reindexar
      edElements = edElements.filter(r => r.pageIndex !== pageIndex);
      edElements.forEach(r => { if (r.pageIndex > pageIndex) r.pageIndex--; });
      const newPaths = {};
      Object.entries(edDrawPaths).forEach(([idx, paths]) => {
        const i = parseInt(idx);
        if (i !== pageIndex) newPaths[i > pageIndex ? i - 1 : i] = paths;
      });
      edDrawPaths = newPaths;
      await edReloadPages();
    } catch (err) { console.error('Delete page error:', err); }
  }

  async function edReloadPages() {
    edPdfDoc    = await pdfjsLib.getDocument({ data: edPdfBytes.slice(0) }).promise;
    edPageCount = edPdfDoc.numPages;
    edPageSizes = [];
    edDrawCtxMap = {};
    edPageSelect.innerHTML = '';
    for (let i = 1; i <= edPageCount; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i + ' / ' + edPageCount;
      edPageSelect.appendChild(opt);
    }
    edPagesContainer.innerHTML = '';
    for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);
  }

  if (edPagesModal) {
    edPagesModal.addEventListener('mousedown', function (e) {
      if (e.target === edPagesModal) edPagesModal.classList.remove('show');
    });
    const closeBtn = document.getElementById('ed-pages-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => edPagesModal.classList.remove('show'));
  }

  // ── 20. CONCATENAR PDFs ─────────────────────────────────────
  if (edConcatInput) edConcatInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file || !edPdfBytes) return;
    e.target.value = '';
    try {
      const newBytes = await file.arrayBuffer();
      const basePdf  = await PDFLib.PDFDocument.load(edPdfBytes);
      const addPdf   = await PDFLib.PDFDocument.load(newBytes);
      const copied   = await basePdf.copyPages(addPdf, addPdf.getPageIndices());
      copied.forEach(p => basePdf.addPage(p));
      edPdfBytes = (await basePdf.save()).buffer;

      // Guardar elementos/desenhos atuais antes de reload
      const savedEls    = edElements.filter(r => r.type !== 'native-text');
      const savedPaths  = Object.assign({}, edDrawPaths);
      await edReloadPages();
      // Restaurar
      savedEls.forEach(r => {
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (r.pageIndex + 1) + '"]');
        if (wrap) { wrap.appendChild(r.el); edElements.push(r); }
      });
      Object.entries(savedPaths).forEach(([idx, paths]) => {
        const i = parseInt(idx);
        edDrawPaths[i] = paths;
        edRedrawCanvas(i);
      });
    } catch (err) { console.error('Concat error:', err); alert('Erro ao juntar PDF: ' + err.message); }
  });

  // ── 21. ZOOM ────────────────────────────────────────────────
  const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

  function edUpdateZoomDisplay() {
    if (edZoomDisplay) edZoomDisplay.textContent = Math.round(edScale / 1.5 * 100) + '%';
  }
  edUpdateZoomDisplay();

  if (edZoomInBtn) edZoomInBtn.addEventListener('click', async function () {
    const next = ZOOM_STEPS.find(z => z > edScale + 0.01);
    if (next !== undefined) await edSetZoom(next);
  });
  if (edZoomOutBtn) edZoomOutBtn.addEventListener('click', async function () {
    const prev = [...ZOOM_STEPS].reverse().find(z => z < edScale - 0.01);
    if (prev !== undefined) await edSetZoom(prev);
  });

  async function edSetZoom(newScale) {
    if (!edPdfDoc) return;
    const ratio = newScale / edScale;
    edScale = newScale;
    // Escalar posições de todos os elementos
    edElements.forEach(r => {
      const el   = r.el;
      const left = parseFloat(el.style.left)  || 0;
      const top  = parseFloat(el.style.top)   || 0;
      const w    = parseFloat(el.style.width)  || 0;
      const h    = parseFloat(el.style.height) || 0;
      el.style.left  = (left * ratio) + 'px';
      el.style.top   = (top  * ratio) + 'px';
      if (w) el.style.width  = (w * ratio) + 'px';
      if (h && r.type !== 'text' && r.type !== 'sticky' && r.type !== 'native-text') {
        el.style.height = (h * ratio) + 'px';
      }
      if (r.ta && r.type !== 'native-text') {
        const fs = parseFloat(r.ta.style.fontSize) || (r.fontSize || 14);
        r.ta.style.setProperty('--ed-font-sz', Math.round(fs * ratio) + 'px');
      }
      if (r.type === 'native-text') {
        r.viewX = parseFloat(el.style.left)  || 0;
        r.viewY = parseFloat(el.style.top)   || 0;
      }
      if (r.type === 'stamp') {
        const sf = parseFloat(el.style.fontSize) || 22;
        el.style.fontSize = Math.round(sf * ratio) + 'px';
      }
    });
    edDrawCtxMap = {};
    edPagesContainer.innerHTML = '';
    edPageSizes = [];
    for (let i = 1; i <= edPageCount; i++) await edRenderPage(i);
    edUpdateZoomDisplay();
  }

  // ── 22. HANDLES E DELETE ────────────────────────────────────
  function edAddHandles(el) {
    ['nw', 'ne', 'sw', 'se'].forEach(function (pos) {
      const h = document.createElement('div');
      h.className = 'ed-handle ' + pos;
      h.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault();
        edResizeStart(e, el, pos);
      });
      el.appendChild(h);
    });
    const del = document.createElement('button');
    del.className   = 'ed-del-btn';
    del.textContent = '✕';
    del.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
    del.addEventListener('click', function (e) { e.stopPropagation(); edStopEditing(); edDeleteEl(el); });
    el.appendChild(del);
  }

  function edDeleteEl(el) {
    const idx = edElements.findIndex(r => r.el === el);
    if (idx === -1) return;
    const record = edElements[idx];
    edPushHistory({ type: 'delete', el, record });
    edElements.splice(idx, 1);
    el.remove();
    if (edSelectedEl === el) edSelectedEl = null;
    if (edEditingEl  === el) edEditingEl  = null;
  }

  // ── 23. SELEÇÃO ─────────────────────────────────────────────
  function edSelect(el) {
    if (edSelectedEl === el) return;
    edDeselect();
    el.classList.add('selected');
    edSelectedEl = el;
    if (el.classList.contains('ed-text-el') && !el.classList.contains('ed-native-text')) {
      const ta = el.querySelector('textarea');
      if (ta) {
        edFontSize.value  = parseInt(ta.style.fontSize) || 14;
        edFontColor.value = ta.getAttribute('data-color') || '#000000';
        if (edBoldBtn)      edBoldBtn.classList.toggle('ed-fmt-active',      ta.style.fontWeight  === 'bold');
        if (edItalicBtn)    edItalicBtn.classList.toggle('ed-fmt-active',    ta.style.fontStyle   === 'italic');
        if (edUnderlineBtn) edUnderlineBtn.classList.toggle('ed-fmt-active', ta.style.textDecoration.includes('underline'));
        if (edFontFamilyEl) {
          const r = edElements.find(r => r.el === el);
          if (r && r.fontFamily) edFontFamilyEl.value = r.fontFamily;
        }
      }
    }
  }
  function edDeselect() {
    edPagesContainer.querySelectorAll('.ed-element.selected').forEach(e => e.classList.remove('selected'));
    edSelectedEl = null;
  }

  // Global: clicar fora → deselecionar
  document.addEventListener('mousedown', function (e) {
    const inEl      = e.target.closest('.ed-element');
    const inToolbar = e.target.closest('#ed-toolbar');
    const inModal   = e.target.closest('#ed-export-modal, #ed-pages-modal');
    const inPicker  = e.target.closest('#ed-shape-picker, #ed-stamp-picker');
    if (!inEl && !inToolbar && !inModal && !inPicker) {
      edStopEditing(); edDeselect();
    }
  });

  // ── 24. TECLADO ─────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (!document.getElementById('tab-editor').classList.contains('active')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); edUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); edRedo(); return; }
    if (e.key === 'Escape') { edSetTool('select'); edCloseAllPickers(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && edSelectedEl && !edEditingEl) {
      e.preventDefault(); edDeleteEl(edSelectedEl);
    }
  });

  // ── 25. ARRASTAR ────────────────────────────────────────────
  function edMakeDraggable(el, wrap) {
    let dragMoved = false;
    let prevLeft, prevTop;

    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (edEditingEl === el) return;
      if (edActiveTool !== 'select') return;
      dragMoved = false;
      prevLeft  = el.style.left;
      prevTop   = el.style.top;
      const startX = e.clientX - el.offsetLeft;
      const startY = e.clientY - el.offsetTop;

      function onMove(e) {
        dragMoved = true;
        let nx = e.clientX - startX;
        let ny = e.clientY - startY;
        nx = Math.max(0, Math.min(nx, wrap.offsetWidth  - el.offsetWidth));
        ny = Math.max(0, Math.min(ny, wrap.offsetHeight - el.offsetHeight));
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (dragMoved) {
          edPushHistory({ type: 'move', el, prevLeft, prevTop,
            nextLeft: el.style.left, nextTop: el.style.top });
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── 26. REDIMENSIONAR ───────────────────────────────────────
  function edResizeStart(e, el, corner) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = el.offsetWidth,  startH = el.offsetHeight;
    const startL = el.offsetLeft,   startT = el.offsetTop;

    function onMove(e) {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let nW = startW, nH = startH, nL = startL, nT = startT;
      if (corner === 'se') { nW = Math.max(40, startW + dx); nH = Math.max(24, startH + dy); }
      if (corner === 'sw') { nW = Math.max(40, startW - dx); nH = Math.max(24, startH + dy); nL = startL + startW - nW; }
      if (corner === 'ne') { nW = Math.max(40, startW + dx); nH = Math.max(24, startH - dy); nT = startT + startH - nH; }
      if (corner === 'nw') { nW = Math.max(40, startW - dx); nH = Math.max(24, startH - dy); nL = startL + startW - nW; nT = startT + startH - nH; }
      el.style.width = nW + 'px'; el.style.height = nH + 'px';
      el.style.left  = nL + 'px'; el.style.top    = nT + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      edPushHistory({ type: 'resize', el,
        prevLeft: startL + 'px', prevTop: startT + 'px',
        prevW: startW + 'px',    prevH: startH + 'px',
        nextLeft: el.style.left, nextTop: el.style.top,
        nextW: el.style.width,   nextH: el.style.height });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── 27. EXPORTAR PDF ────────────────────────────────────────
  edExportBtn.addEventListener('click', function () {
    if (!edPdfBytes) return;
    edStopEditing();
    edExportFilename.value = 'editado';
    edExportModal.classList.add('show');
    setTimeout(() => edExportFilename.select(), 80);
  });
  edExportCancel.addEventListener('click', () => edExportModal.classList.remove('show'));
  edExportModal.addEventListener('mousedown', function (e) {
    if (e.target === edExportModal) edExportModal.classList.remove('show');
  });

  edFolderPickBtn.addEventListener('click', async function () {
    if (!window.showDirectoryPicker) {
      edExportHint.innerHTML = 'O seu browser não suporta escolha de pasta.<br>O ficheiro será guardado nas <span>transferências</span>.';
      return;
    }
    try {
      edChosenDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      edFolderDisplay.textContent = '📁 ' + edChosenDirHandle.name;
      edFolderDisplay.classList.add('chosen');
      edExportHint.innerHTML = 'Guardado em <span>' + edChosenDirHandle.name + '</span>.';
      edExportHint.classList.add('has-folder');
    } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
  });

  edExportConfirm.addEventListener('click', async function () {
    const filename = (edExportFilename.value.trim() || 'editado').replace(/\.pdf$/i, '') + '.pdf';
    edExportModal.classList.remove('show');
    edExportBtn.disabled    = true;
    edExportBtn.textContent = 'a exportar…';

    try {
      const pdfDoc  = await PDFLib.PDFDocument.load(edPdfBytes);
      const pages   = pdfDoc.getPages();
      const fCache  = {};

      async function getFont(family, bold, italic) {
        const key = family + (bold ? 'b' : '') + (italic ? 'i' : '');
        if (fCache[key]) return fCache[key];
        let sfn;
        if (family === 'Times-Roman') {
          sfn = bold && italic ? PDFLib.StandardFonts.TimesRomanBoldItalic
              : bold           ? PDFLib.StandardFonts.TimesRomanBold
              : italic         ? PDFLib.StandardFonts.TimesRomanItalic
              :                  PDFLib.StandardFonts.TimesRoman;
        } else if (family === 'Courier') {
          sfn = bold && italic ? PDFLib.StandardFonts.CourierBoldOblique
              : bold           ? PDFLib.StandardFonts.CourierBold
              : italic         ? PDFLib.StandardFonts.CourierOblique
              :                  PDFLib.StandardFonts.Courier;
        } else {
          sfn = bold && italic ? PDFLib.StandardFonts.HelveticaBoldOblique
              : bold           ? PDFLib.StandardFonts.HelveticaBold
              : italic         ? PDFLib.StandardFonts.HelveticaOblique
              :                  PDFLib.StandardFonts.Helvetica;
        }
        const f = await pdfDoc.embedFont(sfn);
        fCache[key] = f; return f;
      }

      for (const record of edElements) {
        const pdfPage = pages[record.pageIndex];
        if (!pdfPage) continue;
        const { width: pW, height: pH } = pdfPage.getSize();
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (record.pageIndex + 1) + '"]');
        if (!wrap) continue;
        const scaleX = pW / wrap.offsetWidth;
        const scaleY = pH / wrap.offsetHeight;
        const el   = record.el;
        const elX  = parseFloat(el.style.left) || 0;
        const elY  = parseFloat(el.style.top)  || 0;
        const elW  = el.offsetWidth;
        const elH  = el.offsetHeight;
        const pdfX = elX * scaleX;
        const pdfY = pH - (elY + elH) * scaleY;

        // ── Texto novo ──
        if (record.type === 'text') {
          const ta      = record.ta || el.querySelector('textarea');
          const rawText = ta ? ta.value.trim() : '';
          if (!rawText) continue;
          const fsPx    = record.fontSize  || parseInt(ta && ta.style.fontSize) || 14;
          const clrHex  = record.textColor || '#000000';
          const bold    = !!record.bold;
          const italic  = !!record.italic;
          const fam     = record.fontFamily || 'Helvetica';
          const font    = await getFont(fam, bold, italic);
          const pdfFS   = fsPx * Math.min(scaleX, scaleY);
          const lineH   = pdfFS * 1.4;
          const clr     = edParseCssColor(clrHex);
          const lines   = ta.value.split('\n');
          lines.forEach((line, i) => {
            if (!line) return;
            try {
              pdfPage.drawText(line, {
                x: pdfX, y: pdfY + (lines.length - 1 - i) * lineH,
                size: pdfFS, font,
                color: PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255)
              });
            } catch (te) {}
            // Sublinhado
            if (record.underline) {
              const tw = font.widthOfTextAtSize(line, pdfFS);
              pdfPage.drawLine({
                start: { x: pdfX, y: pdfY + (lines.length - 1 - i) * lineH - 1 },
                end:   { x: pdfX + tw, y: pdfY + (lines.length - 1 - i) * lineH - 1 },
                thickness: 0.8,
                color: PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255)
              });
            }
          });
        }

        // ── Texto nativo ──
        else if (record.type === 'native-text') {
          const ta      = record.ta || el.querySelector('textarea');
          const newText = ta ? ta.value : '';
          const wasModified = newText !== record.originalText;
          const wasMoved    = Math.abs(parseFloat(el.style.left) - record.viewX) > 2 ||
                              Math.abs(parseFloat(el.style.top)  - record.viewY) > 2;
          if (!wasModified && !wasMoved) continue;
          const coverW = Math.max(record.pdfTotalW * 1.05, record.pdfFontSize * 2);
          const coverH = record.pdfFontSize * 1.5;
          pdfPage.drawRectangle({
            x: record.pdfX - 1, y: record.pdfY - coverH * 0.35,
            width: coverW + 2, height: coverH,
            color: PDFLib.rgb(1, 1, 1), borderWidth: 0
          });
          if (newText.trim()) {
            const font  = await getFont('Helvetica', false, false);
            const lines = newText.split('\n');
            const lineH = record.pdfFontSize * 1.35;
            lines.forEach((line, i) => {
              if (!line) return;
              try {
                pdfPage.drawText(line, {
                  x: pdfX, y: record.pdfY - i * lineH,
                  size: Math.max(record.pdfFontSize, 4), font,
                  color: PDFLib.rgb(0, 0, 0)
                });
              } catch (te) {}
            });
          }
        }

        // ── Imagem ──
        else if (record.type === 'image') {
          try {
            const src      = record.src;
            const imgBytes = await fetch(src).then(r => r.arrayBuffer());
            const isPng    = src.startsWith('data:image/png') || src.includes('.png');
            const imgEmbed = isPng
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
            pdfPage.drawImage(imgEmbed, { x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY });
          } catch (ie) { console.warn('imagem não exportada:', ie); }
        }

        // ── Forma ──
        else if (record.type === 'shape') {
          const sc   = edParseCssColor(record.strokeColor || '#000000');
          const sRgb = PDFLib.rgb(sc.r / 255, sc.g / 255, sc.b / 255);
          const sw   = (record.strokeWidth || 2) * Math.min(scaleX, scaleY);
          const rx = pdfX, ry = pdfY, rw = elW * scaleX, rh = elH * scaleY;
          const transparent = PDFLib.rgb(0, 0, 0);
          if (record.shapeType === 'rect') {
            pdfPage.drawRectangle({ x: rx, y: ry, width: rw, height: rh,
              borderColor: sRgb, borderWidth: sw, color: PDFLib.rgb(1, 1, 1), opacity: 0 });
          } else if (record.shapeType === 'ellipse') {
            pdfPage.drawEllipse({ x: rx + rw / 2, y: ry + rh / 2,
              xScale: rw / 2, yScale: rh / 2,
              borderColor: sRgb, borderWidth: sw, color: PDFLib.rgb(1, 1, 1), opacity: 0 });
          } else if (record.shapeType === 'line' || record.shapeType === 'arrow') {
            pdfPage.drawLine({ start: { x: rx, y: ry }, end: { x: rx + rw, y: ry + rh }, thickness: sw, color: sRgb });
            if (record.shapeType === 'arrow') {
              const ang  = Math.atan2(rh, rw);
              const aLen = sw * 6;
              const ax   = rx + rw, ay = ry + rh;
              pdfPage.drawLine({ start: { x: ax, y: ay }, end: { x: ax - aLen * Math.cos(ang - 0.45), y: ay - aLen * Math.sin(ang - 0.45) }, thickness: sw, color: sRgb });
              pdfPage.drawLine({ start: { x: ax, y: ay }, end: { x: ax - aLen * Math.cos(ang + 0.45), y: ay - aLen * Math.sin(ang + 0.45) }, thickness: sw, color: sRgb });
            }
          }
        }

        // ── Anotação ──
        else if (record.type === 'annotation') {
          if (record.annotType === 'highlight') {
            pdfPage.drawRectangle({
              x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY,
              color: PDFLib.rgb(1, 0.92, 0), opacity: 0.4, borderWidth: 0
            });
          } else if (record.annotType === 'strikethrough') {
            const midY = pdfY + (elH * scaleY) / 2;
            pdfPage.drawLine({ start: { x: pdfX, y: midY }, end: { x: pdfX + elW * scaleX, y: midY },
              thickness: 1.5 * Math.min(scaleX, scaleY), color: PDFLib.rgb(0.8, 0, 0) });
          } else if (record.annotType === 'underline-annot') {
            pdfPage.drawLine({ start: { x: pdfX, y: pdfY }, end: { x: pdfX + elW * scaleX, y: pdfY },
              thickness: 1.5 * Math.min(scaleX, scaleY), color: PDFLib.rgb(0, 0, 0.8) });
          }
        }

        // ── Nota adesiva ──
        else if (record.type === 'sticky') {
          const ta   = record.ta || el.querySelector('textarea');
          const text = ta ? ta.value : '';
          pdfPage.drawRectangle({
            x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY,
            color: PDFLib.rgb(1, 0.99, 0.6),
            borderColor: PDFLib.rgb(0.98, 0.79, 0.15),
            borderWidth: 1 * Math.min(scaleX, scaleY)
          });
          pdfPage.drawRectangle({
            x: pdfX, y: pdfY + elH * scaleY - 16 * scaleY,
            width: elW * scaleX, height: 16 * scaleY,
            color: PDFLib.rgb(0.98, 0.79, 0.15), borderWidth: 0
          });
          if (text.trim()) {
            const font  = await getFont('Helvetica', false, false);
            const pdfFS = 9 * Math.min(scaleX, scaleY);
            const lineH = pdfFS * 1.4;
            text.split('\n').forEach((line, i) => {
              if (!line || i > 12) return;
              try {
                pdfPage.drawText(line, {
                  x: pdfX + 4 * scaleX,
                  y: pdfY + elH * scaleY - (22 + i * (lineH / Math.min(scaleX, scaleY))) * scaleY,
                  size: pdfFS, font,
                  color: PDFLib.rgb(0.2, 0.2, 0.2),
                  maxWidth: (elW - 8) * scaleX
                });
              } catch (te) {}
            });
          }
        }

        // ── Carimbo ──
        else if (record.type === 'stamp') {
          const font    = await getFont('Helvetica', true, false);
          const sc      = edParseCssColor(record.color || '#000000');
          const sRgb    = PDFLib.rgb(sc.r / 255, sc.g / 255, sc.b / 255);
          const pdfFS   = 18 * Math.min(scaleX, scaleY);
          const textW   = font.widthOfTextAtSize(record.stampText, pdfFS);
          const pad     = 5 * Math.min(scaleX, scaleY);
          const cx      = pdfX + elW * scaleX / 2;
          const cy      = pdfY + elH * scaleY / 2;
          pdfPage.drawRectangle({
            x: cx - textW / 2 - pad, y: cy - pdfFS * 0.3 - pad,
            width: textW + pad * 2,  height: pdfFS * 1.3 + pad * 2,
            borderColor: sRgb, borderWidth: 2.5 * Math.min(scaleX, scaleY),
            borderOpacity: 0.75, color: PDFLib.rgb(1, 1, 1), opacity: 0
          });
          try {
            pdfPage.drawText(record.stampText, {
              x: cx - textW / 2, y: cy - pdfFS * 0.3,
              size: pdfFS, font, color: sRgb, opacity: 0.75
            });
          } catch (te) {}
        }
      }

      // ── Exportar caminhos de desenho ──
      for (const [pageIdxStr, paths] of Object.entries(edDrawPaths)) {
        const pageIndex = parseInt(pageIdxStr);
        const pdfPage   = pages[pageIndex];
        if (!pdfPage || !paths.length) continue;
        const { width: pW, height: pH } = pdfPage.getSize();
        const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (pageIndex + 1) + '"]');
        if (!wrap) continue;
        const scaleX = pW / wrap.offsetWidth;
        const scaleY = pH / wrap.offsetHeight;
        paths.forEach(path => {
          if (!path.points || path.points.length < 2) return;
          const clr  = edParseCssColor(path.color || '#000000');
          const cRgb = PDFLib.rgb(clr.r / 255, clr.g / 255, clr.b / 255);
          const sw   = (path.size || 2) * Math.min(scaleX, scaleY);
          for (let i = 1; i < path.points.length; i++) {
            const prev = path.points[i - 1];
            const curr = path.points[i];
            pdfPage.drawLine({
              start: { x: prev.x * pW, y: pH - prev.y * pH },
              end:   { x: curr.x * pW, y: pH - curr.y * pH },
              thickness: sw, color: cRgb
            });
          }
        });
      }

      const outBytes = await pdfDoc.save();

      // Guardar em pasta escolhida
      if (edChosenDirHandle) {
        try {
          const fh = await edChosenDirHandle.getFileHandle(filename, { create: true });
          const wr = await fh.createWritable();
          await wr.write(new Blob([outBytes], { type: 'application/pdf' }));
          await wr.close();
          edExportBtn.innerHTML = '✓ guardado';
          setTimeout(() => { edExportBtn.innerHTML = '⬇️ exportar pdf'; edExportBtn.disabled = false; }, 2500);
          return;
        } catch (fsErr) { console.warn('Fallback para download:', fsErr); }
      }
      // Download padrão
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (err) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar o PDF.');
    }
    edExportBtn.disabled  = false;
    edExportBtn.innerHTML = '⬇️ exportar pdf';
  });

  // ── 28. HELPERS ─────────────────────────────────────────────
  function edRgbToHex(rgb) {
    if (rgb && rgb[0] === '#') return rgb;
    const m = (rgb || '').match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
  }
  function edParseCssColor(css) {
    if (!css) return { r: 0, g: 0, b: 0 };
    const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const hex = css.replace('#', '');
    if (hex.length === 6) return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
    return { r: 0, g: 0, b: 0 };
  }
  function edPdfFontToCSS(pdfFont) {
    if (!pdfFont) return 'Arial,Helvetica,sans-serif';
    if (pdfFont.includes('Times'))   return "'Times New Roman',Times,serif";
    if (pdfFont.includes('Courier')) return "'Courier New',Courier,monospace";
    return 'Arial,Helvetica,sans-serif';
  }

})();
