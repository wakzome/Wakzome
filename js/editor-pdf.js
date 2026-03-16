// ══════════════════════════════════════════════════════════════
//  ADMIN: EDITOR PDF
// ══════════════════════════════════════════════════════════════
(function() {

  let edPdfDoc      = null;
  let edPdfBytes    = null;
  let edPageCount   = 0;
  let edElements    = [];   // { pageIndex, el, type, ... }
  let edSelectedEl  = null;
  let edEditingEl   = null; // element currently in text-edit mode
  let edScale       = 1.5;

  // ── Undo / Redo history ──
  // Each entry: { type: 'add'|'delete'|'move'|'resize'|'text', ... }
  let edHistory     = [];
  let edHistoryIdx  = -1;

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

  // Default color always black
  edFontColor.value = '#000000';

  // ── History helpers ──
  function edPushHistory(entry) {
    // Discard any redo branch
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
    const entry = edHistory[edHistoryIdx];
    edHistoryIdx--;
    edApplyInverse(entry);
    edUpdateUndoRedo();
  }
  function edRedo() {
    if (edHistoryIdx >= edHistory.length - 1) return;
    edHistoryIdx++;
    const entry = edHistory[edHistoryIdx];
    edApplyForward(entry);
    edUpdateUndoRedo();
  }
  function edApplyInverse(entry) {
    if (entry.type === 'add') {
      entry.el.remove();
      edElements = edElements.filter(function(r) { return r.el !== entry.el; });
      if (edSelectedEl === entry.el) { edSelectedEl = null; }
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
    }
  }
  function edApplyForward(entry) {
    if (entry.type === 'add') {
      const wrap = edPagesContainer.querySelector('.ed-page[data-page="' + (entry.record.pageIndex + 1) + '"]');
      if (wrap) wrap.appendChild(entry.record.el);
      edElements.push(entry.record);
    } else if (entry.type === 'delete') {
      entry.record.el.remove();
      edElements = edElements.filter(function(r) { return r.el !== entry.record.el; });
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
    }
  }

  edUndoBtn.addEventListener('click', edUndo);
  edRedoBtn.addEventListener('click', edRedo);
  edUpdateUndoRedo();

  // ── Load PDF ──
  edFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) edLoadFile(file);
    e.target.value = '';
  });

  async function edLoadFile(file) {
    edDropHint.style.display = 'none';
    edPagesContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#aaa;font-weight:bold;font-size:.85rem;">a carregar…</div>';
    try {
      edPdfBytes   = await file.arrayBuffer();
      edElements   = [];
      edSelectedEl = null;
      edEditingEl  = null;
      edHistory    = [];
      edHistoryIdx = -1;
      edUpdateUndoRedo();
      // Reset native edit mode
      edNativeEditMode = false;
      edEditNativeBtn.classList.remove('active');
      edEditNativeBtn.textContent = '🔤 editar texto original';

      edPdfDoc    = await pdfjsLib.getDocument({ data: edPdfBytes.slice(0) }).promise;
      edPageCount = edPdfDoc.numPages;

      edPageSelect.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i + ' / ' + edPageCount;
        edPageSelect.appendChild(opt);
      }

      edPagesContainer.innerHTML = '';
      for (let i = 1; i <= edPageCount; i++) {
        await edRenderPage(i);
      }
      edExportBtn.disabled = false;
    } catch(err) {
      edPagesContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#c03000;font-weight:bold;font-size:.85rem;">erro ao carregar PDF</div>';
      console.error(err);
    }
  }

  async function edRenderPage(pageNum) {
    const page     = await edPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: edScale });

    const wrap = document.createElement('div');
    wrap.className   = 'ed-page';
    wrap.dataset.page = pageNum;
    wrap.style.width  = viewport.width  + 'px';
    wrap.style.height = viewport.height + 'px';

    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    wrap.appendChild(canvas);
    edPagesContainer.appendChild(wrap);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Extract and overlay original PDF text (native text editing)
    await edExtractNativeText(page, wrap, pageNum - 1, viewport);

    // Re-attach existing elements for this page
    edElements.filter(function(r) { return r.pageIndex === pageNum - 1 && r.type !== 'native-text'; }).forEach(function(r) {
      wrap.appendChild(r.el);
    });

    // Click on blank page area → deselect / stop editing
    wrap.addEventListener('mousedown', function(e) {
      if (e.target === wrap || e.target === canvas) {
        edStopEditing();
        edDeselect();
      }
    });
  }

  edPageSelect.addEventListener('change', function() {
    const pages  = edPagesContainer.querySelectorAll('.ed-page');
    const target = pages[parseInt(this.value) - 1];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ── Native text editing mode toggle ──
  let edNativeEditMode = false;
  const edEditNativeBtn = document.getElementById('ed-edit-native-btn');

  edEditNativeBtn.addEventListener('click', function() {
    edNativeEditMode = !edNativeEditMode;
    edEditNativeBtn.classList.toggle('active', edNativeEditMode);
    edEditNativeBtn.textContent = edNativeEditMode ? '🔤 sair de edição' : '🔤 editar texto original';
    // Update all native text elements
    edElements.forEach(function(r) {
      if (r.type !== 'native-text') return;
      if (edNativeEditMode) {
        r.el.classList.add('editable-mode');
      } else {
        r.el.classList.remove('editable-mode');
        if (edEditingEl === r.el) edStopEditing();
        if (edSelectedEl === r.el) edDeselect();
      }
    });
  });

  // ── Extract and overlay original PDF text ──
  async function edExtractNativeText(page, wrap, pageIndex, viewport) {
    let textContent;
    try { textContent = await page.getTextContent(); } catch(e) { return; }
    const items = (textContent.items || []).filter(function(it) { return it.str && it.str.trim(); });
    if (!items.length) return;

    // Group items into visual lines by Y coordinate proximity
    const groups = [];
    items.forEach(function(item) {
      // Convert PDF coords to viewport (canvas) coords
      var pt;
      try { pt = viewport.convertToViewportPoint(item.transform[4], item.transform[5]); }
      catch(e) { return; }
      var vx = pt[0], vy = pt[1];
      // Font size in viewport pixels
      var fontPx = Math.abs(item.transform[0]) * edScale;
      if (fontPx < 1) fontPx = 12 * edScale / 72;

      // Find existing group with matching Y (within half a font-line)
      var group = null;
      for (var g = 0; g < groups.length; g++) {
        if (Math.abs(groups[g].baseVY - vy) < fontPx * 0.7) { group = groups[g]; break; }
      }
      if (!group) {
        group = { baseVY: vy, fontPx: fontPx, items: [] };
        groups.push(group);
      }
      group.items.push({ item: item, vx: vx, vy: vy, fontPx: fontPx });
    });

    // Sort groups top→bottom, items within group left→right
    groups.sort(function(a, b) { return a.baseVY - b.baseVY; });
    groups.forEach(function(g) { g.items.sort(function(a, b) { return a.vx - b.vx; }); });

    groups.forEach(function(group) {
      var text = group.items.map(function(i) { return i.item.str; }).join('');
      if (!text.trim()) return;

      var first = group.items[0];
      var fontPx = first.fontPx;
      var vx = first.vx;
      var vy = group.baseVY; // baseline in canvas coords
      var elTop = vy - fontPx * 1.15; // top of the bounding box

      // Width: sum of item widths scaled to viewport
      var totalW = 0;
      group.items.forEach(function(i) {
        totalW += (i.item.width || 0) * edScale;
      });
      if (totalW < fontPx * 0.8) totalW = fontPx * text.length * 0.6;
      totalW = Math.max(totalW, fontPx * 2);

      // PDF coords for the first item (for export white-cover)
      var pdfX = first.item.transform[4];
      var pdfY = first.item.transform[5];
      var pdfFontSize = Math.abs(first.item.transform[0]);
      var pdfItemWidths = group.items.map(function(i) { return i.item.width || 0; });
      var pdfTotalW = pdfItemWidths.reduce(function(a, b) { return a + b; }, 0);

      // Create the overlay element
      var el = document.createElement('div');
      el.className = 'ed-element ed-text-el ed-native-text';
      el.style.left = vx + 'px';
      el.style.top  = elTop + 'px';
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
      ta.rows = 1;
      ta.spellcheck = false;
      el.appendChild(ta);

      (function autoResize() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(Math.ceil(fontPx * 1.3), ta.scrollHeight) + 'px';
        el.style.height = ta.offsetHeight + 'px';
      })();
      ta.addEventListener('input', function() {
        ta.style.height = 'auto';
        ta.style.height = Math.max(Math.ceil(fontPx * 1.3), ta.scrollHeight) + 'px';
        el.style.height = ta.offsetHeight + 'px';
      });

      // Click = select; dblclick = enter edit
      el.addEventListener('mousedown', function(e) {
        if (!edNativeEditMode) return;
        if (e.target.classList.contains('ed-del-btn')) return;
        if (el.classList.contains('editing')) return;
        e.stopPropagation();
        edStopEditing();
        edSelect(el);
      });
      el.addEventListener('dblclick', function(e) {
        if (!edNativeEditMode) return;
        e.stopPropagation();
        edEnterEditing(el);
      });

      wrap.appendChild(el);

      var record = {
        pageIndex: pageIndex,
        el: el, ta: ta,
        type: 'native-text',
        originalText: text,
        pdfX: pdfX, pdfY: pdfY,
        pdfFontSize: pdfFontSize,
        pdfTotalW: pdfTotalW,
        viewX: vx, viewY: elTop
      };
      edElements.push(record);
    });
  }

  // ── Add text ──
  edAddTextBtn.addEventListener('click', function() {
    const pageNum = parseInt(edPageSelect.value) || 1;
    const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + pageNum + '"]');
    if (!wrap) return;
    edStopEditing();
    const record = edCreateTextEl(wrap, pageNum - 1, 40, 40, '');
    edPushHistory({ type: 'add', el: record.el, record });
  });

  function edCreateTextEl(wrap, pageIndex, x, y, text) {
    const el = document.createElement('div');
    el.className   = 'ed-element ed-text-el';
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = '160px';

    const ta = document.createElement('textarea');
    ta.value        = text !== undefined ? text : '';
    ta.style.cssText = [
      'display:block', 'width:100%', 'min-height:28px',
      'padding:4px 6px', 'box-sizing:border-box',
      'border:none', 'outline:none',
      'background:transparent', 'resize:none', 'overflow:hidden',
      'font-family:Arial,sans-serif',
      'font-size:' + (edFontSize.value || 14) + 'px',
      'color:#000000',
      'line-height:1.5',
      'writing-mode:horizontal-tb',
      'direction:ltr',
      'pointer-events:none',
      'cursor:move'
    ].join(';');
    ta.rows = 1;
    ta.spellcheck = false;
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

    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (el.classList.contains('editing')) return;
      e.stopPropagation();
      edStopEditing();
      edSelect(el);
    });

    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      edEnterEditing(el);
    });

    wrap.appendChild(el);
    const record = { pageIndex, el, ta, type: 'text' };
    edElements.push(record);
    edSelect(el);
    setTimeout(function() { edEnterEditing(el); autoResize(); }, 40);
    return record;
  }

  function edEnterEditing(el) {
    if (el.classList.contains('editing')) return;
    edStopEditing();
    edSelect(el);
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
    // For native text, make text visible while editing
    if (el.classList.contains('ed-native-text')) {
      ta.style.color = '#000';
    }
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
      if (before !== after) {
        edPushHistory({ type: 'text', el, ta, prevText: before, nextText: after });
        // Mark native text elements as modified for visual feedback + export
        if (el.classList.contains('ed-native-text')) {
          const record = edElements.find(function(r) { return r.el === el; });
          if (record && after !== record.originalText) {
            el.classList.add('modified');
          } else if (record && after === record.originalText) {
            el.classList.remove('modified');
          }
        }
      }
      // For unmodified native text, reset to transparent
      if (el.classList.contains('ed-native-text') && !el.classList.contains('modified')) {
        ta.style.color = 'transparent';
      }
      delete ta.dataset.textBefore;
    }
  }

  // ── Font controls ──
  edFontSize.addEventListener('input', function() {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.fontSize = this.value + 'px';
    }
  });
  edFontColor.addEventListener('input', function() {
    if (edSelectedEl && edSelectedEl.classList.contains('ed-text-el')) {
      const ta = edSelectedEl.querySelector('textarea');
      if (ta) ta.style.color = this.value;
    }
  });

  // ── Add image ──
  edImgInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
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
    el.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      edStopEditing();
      edSelect(el);
    });
    wrap.appendChild(el);
    const record = { pageIndex, el, type: 'image', src };
    edElements.push(record);
    edSelect(el);
    return record;
  }

  // ── Handles & delete button ──
  function edAddHandles(el) {
    ['nw','ne','sw','se'].forEach(function(pos) {
      const h = document.createElement('div');
      h.className = 'ed-handle ' + pos;
      h.addEventListener('mousedown', function(e) {
        e.stopPropagation(); e.preventDefault();
        edResizeStart(e, el, pos);
      });
      el.appendChild(h);
    });
    const del = document.createElement('button');
    del.className = 'ed-del-btn';
    del.textContent = '✕';
    del.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
    });
    del.addEventListener('click', function(e) {
      e.stopPropagation();
      edStopEditing();
      edDeleteEl(el);
    });
    el.appendChild(del);
  }

  function edDeleteEl(el) {
    const idx = edElements.findIndex(function(r) { return r.el === el; });
    if (idx === -1) return;
    const record = edElements[idx];
    edPushHistory({ type: 'delete', el, record });
    edElements.splice(idx, 1);
    el.remove();
    if (edSelectedEl === el) edSelectedEl = null;
    if (edEditingEl  === el) edEditingEl  = null;
  }

  // ── Selection ──
  function edSelect(el) {
    if (edSelectedEl === el) return;
    edDeselect();
    el.classList.add('selected');
    edSelectedEl = el;
    // Sync toolbar controls
    if (el.classList.contains('ed-text-el')) {
      const ta = el.querySelector('textarea');
      edFontSize.value  = parseInt(ta ? ta.style.fontSize : 14) || 14;
      edFontColor.value = ta && ta.style.color ? edRgbToHex(ta.style.color) : '#000000';
    }
  }
  function edDeselect() {
    // Clear ALL selected states (safety net for stale states)
    edPagesContainer.querySelectorAll('.ed-element.selected').forEach(function(e) {
      e.classList.remove('selected');
    });
    edSelectedEl = null;
  }

  // Global mousedown: stop editing / deselect when clicking outside
  document.addEventListener('mousedown', function(e) {
    const inEl      = e.target.closest('.ed-element');
    const inToolbar = e.target.closest('#ed-toolbar');
    if (!inEl && !inToolbar) {
      edStopEditing();
      edDeselect();
    }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Only act when editor tab is active
    if (!document.getElementById('tab-editor').classList.contains('active')) return;

    // Ctrl+Z → undo, Ctrl+Y / Ctrl+Shift+Z → redo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); edUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); edRedo(); return; }

    // Delete selected element with Delete/Backspace (only when NOT editing text)
    if ((e.key === 'Delete' || e.key === 'Backspace') && edSelectedEl && !edEditingEl) {
      e.preventDefault();
      edDeleteEl(edSelectedEl);
    }
  });

  // ── Drag ──
  function edMakeDraggable(el, wrap) {
    let dragMoved = false;
    let prevLeft, prevTop;

    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('ed-handle')) return;
      if (e.target.classList.contains('ed-del-btn')) return;
      if (edEditingEl === el) return; // inside text edit — don't drag

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
        el.style.left = nx + 'px';
        el.style.top  = ny + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (dragMoved) {
          edPushHistory({ type: 'move', el,
            prevLeft, prevTop,
            nextLeft: el.style.left, nextTop: el.style.top });
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Resize ──
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
      el.style.width  = nW + 'px'; el.style.height = nH + 'px';
      el.style.left   = nL + 'px'; el.style.top    = nT + 'px';
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

  // ── Export PDF ──
  const edExportModal    = document.getElementById('ed-export-modal');
  const edExportFilename = document.getElementById('ed-export-filename');
  const edExportCancel   = document.getElementById('ed-export-cancel');
  const edExportConfirm  = document.getElementById('ed-export-confirm');
  const edFolderPickBtn  = document.getElementById('ed-folder-pick-btn');
  const edFolderDisplay  = document.getElementById('ed-folder-display');
  const edExportHint     = document.getElementById('ed-export-hint');

  let edChosenDirHandle = null; // FileSystemDirectoryHandle if user picked a folder

  edExportBtn.addEventListener('click', function() {
    if (!edPdfBytes) return;
    edStopEditing();
    edExportFilename.value = 'editado';
    edExportModal.classList.add('show');
    setTimeout(function() { edExportFilename.select(); }, 80);
  });

  edExportCancel.addEventListener('click', function() {
    edExportModal.classList.remove('show');
  });
  edExportModal.addEventListener('mousedown', function(e) {
    if (e.target === edExportModal) edExportModal.classList.remove('show');
  });

  // Folder picker — File System Access API (Chrome/Edge)
  edFolderPickBtn.addEventListener('click', async function() {
    if (!window.showDirectoryPicker) {
      edExportHint.innerHTML = 'O seu browser não suporta escolha de pasta.<br>O ficheiro será guardado na pasta de <span>transferências</span> padrão.';
      return;
    }
    try {
      edChosenDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      edFolderDisplay.textContent = '📁 ' + edChosenDirHandle.name;
      edFolderDisplay.classList.add('chosen');
      edExportHint.innerHTML = 'O ficheiro será guardado em <span>' + edChosenDirHandle.name + '</span>.';
      edExportHint.classList.add('has-folder');
    } catch(e) {
      if (e.name !== 'AbortError') console.warn(e);
    }
  });

  edExportConfirm.addEventListener('click', async function() {
    const filename = (edExportFilename.value.trim() || 'editado').replace(/\.pdf$/i, '') + '.pdf';
    edExportModal.classList.remove('show');
    edExportBtn.disabled    = true;
    edExportBtn.textContent = 'a exportar…';

    try {
      // Build PDF bytes
      const pdfDoc    = await PDFLib.PDFDocument.load(edPdfBytes);
      const pages     = pdfDoc.getPages();
      const fontEmbed = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

      for (const record of edElements) {
        const pdfPage = pages[record.pageIndex];
        const { width: pW, height: pH } = pdfPage.getSize();
        const wrap    = edPagesContainer.querySelector('.ed-page[data-page="' + (record.pageIndex + 1) + '"]');
        if (!wrap) continue;
        const scaleX = pW / wrap.offsetWidth;
        const scaleY = pH / wrap.offsetHeight;
        const el     = record.el;
        const elX    = parseFloat(el.style.left) || 0;
        const elY    = parseFloat(el.style.top)  || 0;
        const elW    = el.offsetWidth;
        const elH    = el.offsetHeight;
        const pdfX   = elX * scaleX;
        const pdfY   = pH - (elY + elH) * scaleY;

        if (record.type === 'text') {
          const ta       = record.ta || record.el.querySelector('textarea');
          const rawText  = ta ? ta.value : '';
          const taStyle  = ta ? ta.style : {};
          const fontSize = parseFloat(taStyle.fontSize) || 14;
          const color    = edParseCssColor(taStyle.color || '#000000');
          const lines    = rawText.split('\n');
          const lineH    = fontSize * Math.min(scaleX, scaleY) * 1.4;
          lines.forEach(function(line, i) {
            if (!line) return;
            pdfPage.drawText(line, {
              x: pdfX, y: pdfY + (lines.length - 1 - i) * lineH,
              size: fontSize * Math.min(scaleX, scaleY), font: fontEmbed,
              color: PDFLib.rgb(color.r / 255, color.g / 255, color.b / 255)
            });
          });
        } else if (record.type === 'native-text') {
          // Only process if text was modified or element was moved
          const ta = record.ta || record.el.querySelector('textarea');
          const newText = ta ? ta.value : '';
          const wasModified = newText !== record.originalText;
          const wasMoved = Math.abs(parseFloat(el.style.left) - record.viewX) > 2 ||
                           Math.abs(parseFloat(el.style.top)  - record.viewY) > 2;
          if (!wasModified && !wasMoved) continue;

          // Cover original text with a white rectangle at original PDF coords
          const coverW = Math.max(record.pdfTotalW * 1.05, record.pdfFontSize * 2);
          const coverH = record.pdfFontSize * 1.5;
          pdfPage.drawRectangle({
            x: record.pdfX - 1,
            y: record.pdfY - coverH * 0.35,
            width: coverW + 2,
            height: coverH,
            color: PDFLib.rgb(1, 1, 1),
            borderWidth: 0
          });

          if (newText.trim()) {
            // Draw new text at current (possibly moved) position
            const lines = newText.split('\n');
            const pdfFontPx = record.pdfFontSize;
            const lineH = pdfFontPx * 1.35;
            lines.forEach(function(line, i) {
              if (!line) return;
              try {
                pdfPage.drawText(line, {
                  x: pdfX,
                  y: record.pdfY - i * lineH,
                  size: Math.max(pdfFontPx, 4),
                  font: fontEmbed,
                  color: PDFLib.rgb(0, 0, 0)
                });
              } catch(te) { console.warn('native text draw error:', te); }
            });
          }
        } else if (record.type === 'image') {
          try {
            const src      = record.src;
            const imgBytes = await fetch(src).then(function(r) { return r.arrayBuffer(); });
            const imgEmbed = src.startsWith('data:image/png') || src.endsWith('.png')
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
            pdfPage.drawImage(imgEmbed, { x: pdfX, y: pdfY, width: elW * scaleX, height: elH * scaleY });
          } catch(imgErr) { console.warn('imagem não exportada:', imgErr); }
        }
      }

      const outBytes = await pdfDoc.save();

      // Try File System Access API (save to chosen folder)
      if (edChosenDirHandle) {
        try {
          const fileHandle = await edChosenDirHandle.getFileHandle(filename, { create: true });
          const writable   = await fileHandle.createWritable();
          await writable.write(new Blob([outBytes], { type: 'application/pdf' }));
          await writable.close();
          edExportBtn.innerHTML = '✓ guardado';
          setTimeout(function() { edExportBtn.innerHTML = '⬇️ exportar pdf'; }, 2500);
          edExportBtn.disabled = false;
          return;
        } catch(fsErr) {
          console.warn('Erro ao guardar na pasta, a usar download:', fsErr);
          // Fall through to normal download
        }
      }

      // Fallback: normal browser download
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    } catch(err) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao exportar o PDF.');
    }
    edExportBtn.disabled  = false;
    edExportBtn.innerHTML = '⬇️ exportar pdf';
  });

  // ── Helpers ──
  function edRgbToHex(rgb) {
    if (rgb && rgb[0] === '#') return rgb;
    const m = (rgb || '').match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function(n) { return (+n).toString(16).padStart(2,'0'); }).join('');
  }
  function edParseCssColor(css) {
    if (!css) return { r:0, g:0, b:0 };
    const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const hex = css.replace('#','');
    if (hex.length === 6) return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
    return { r:0, g:0, b:0 };
  }

})();
