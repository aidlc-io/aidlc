/**
 * annotron SDK — injected into the artifact iframe at serve time only.
 * Never written to disk. Communicates with the chrome via postMessage.
 */
(function () {
  const TAG = 'annotron-sdk';
  let annotating = false;
  console.log('[annotron-sdk] loaded');
  let hovered = null;
  let cardEl = null;
  let overlayEl = null;
  let annotationsOverlayEl = null;
  let annotations = [];
  let selectedAnnotationId = null;
  let annotationRenderFrame = null;
  let ignoreNextClick = false;
  let commentPopupEl = null;
  let textContextMenuEl = null;
  let quickCommentBtnEl = null;

  // ── CSS path ───────────────────────────────────────────────────────────────
  function cssPath(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      const siblings = Array.from(node.parentElement?.children || []).filter(c => c.tagName === node.tagName);
      if (siblings.length > 1) {
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
      } else {
        parts.unshift(tag);
      }
      node = node.parentElement;
    }
    parts.unshift('body');
    return parts.join(' > ');
  }

  function labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return `<${tag}${id}${cls}>${text ? ' "' + text + '"' : ''}`;
  }

  function isInteractive(el) {
    return !!(el && el.closest && el.closest(
      'button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"])'
    ));
  }

  function isAnnotronEl(el) {
    return !!(el && el.closest && el.closest('[data-annotron-ui]'));
  }

  // ── Overlay root (highlight layer) ────────────────────────────────────────
  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('data-annotron-ui', 'overlay');
    overlayEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
    document.documentElement.appendChild(overlayEl);
    return overlayEl;
  }

  function ensureAnnotationsOverlay() {
    if (annotationsOverlayEl) return annotationsOverlayEl;
    annotationsOverlayEl = document.createElement('div');
    annotationsOverlayEl.setAttribute('data-annotron-ui', 'annotations-overlay');
    annotationsOverlayEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483644;';
    document.documentElement.appendChild(annotationsOverlayEl);
    return annotationsOverlayEl;
  }

  function clearHighlights() {
    if (overlayEl) overlayEl.innerHTML = '';
  }

  function clearCommentPopup() {
    if (commentPopupEl) {
      commentPopupEl.remove();
      commentPopupEl = null;
    }
  }

  function clearTextContextMenu(clearHighlight = false) {
    if (textContextMenuEl) {
      textContextMenuEl.remove();
      textContextMenuEl = null;
    }
    if (clearHighlight) {
      clearHighlights();
    }
  }

  function clearQuickCommentButton(clearHighlight = false) {
    if (quickCommentBtnEl) {
      quickCommentBtnEl.remove();
      quickCommentBtnEl = null;
    }
    if (clearHighlight) {
      clearHighlights();
    }
  }

  function highlightTextRange(range) {
    const overlay = ensureOverlay();
    clearHighlights();
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const m = document.createElement('div');
      m.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:rgba(44,214,199,.28);border-radius:2px;box-shadow:0 0 0 1.5px rgba(26,176,162,.65);pointer-events:none;`;
      overlay.appendChild(m);
    }
  }

  function highlightElement(el) {
    const overlay = ensureOverlay();
    clearHighlights();
    const r = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #4f8ef7;outline-offset:2px;pointer-events:none;`;
    overlay.appendChild(m);
  }

  function textOffsetWithin(root, container, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    try {
      range.setEnd(container, offset);
      return range.toString().length;
    } catch {
      return null;
    }
  }

  function textPositionAt(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let node;
    let last = null;
    while ((node = walker.nextNode())) {
      last = node;
      if (remaining <= node.data.length) return { node, offset: remaining };
      remaining -= node.data.length;
    }
    return last ? { node: last, offset: last.data.length } : null;
  }

  function rangeForAnnotation(annotation, root) {
    const fullText = root.textContent || '';
    let start = Number.isInteger(annotation.textStart) ? annotation.textStart : -1;
    let end = Number.isInteger(annotation.textEnd) ? annotation.textEnd : -1;
    const quote = annotation.text || '';
    if (start < 0 || end < start || fullText.slice(start, end) !== quote) {
      const expected = start >= 0 ? start : 0;
      const matches = [];
      let index = fullText.indexOf(quote);
      while (quote && index !== -1) {
        matches.push(index);
        index = fullText.indexOf(quote, index + 1);
      }
      if (!matches.length) return null;
      const prefix = annotation.textPrefix || '';
      const suffix = annotation.textSuffix || '';
      const contextual = matches.filter(i =>
        (!prefix || fullText.slice(Math.max(0, i - prefix.length), i) === prefix) &&
        (!suffix || fullText.slice(i + quote.length, i + quote.length + suffix.length) === suffix)
      );
      const candidates = contextual.length ? contextual : matches;
      start = candidates.reduce((best, value) =>
        Math.abs(value - expected) < Math.abs(best - expected) ? value : best
      );
      end = start + quote.length;
    }
    const from = textPositionAt(root, start);
    const to = textPositionAt(root, end);
    if (!from || !to) return null;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  }

  function extractSelectedTextData() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const rawText = sel.toString();
    const text = rawText.trim();
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const anchorEl = range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    if (!anchorEl || isAnnotronEl(anchorEl)) return null;
    const anchorRect = range.getBoundingClientRect();
    const clonedRange = range.cloneRange();
    const selector = cssPath(anchorEl);
    const rawStart = textOffsetWithin(anchorEl, range.startContainer, range.startOffset);
    const textStart = rawStart === null ? null : rawStart + rawText.indexOf(text);
    const textEnd = textStart === null ? null : textStart + text.length;
    const anchorText = anchorEl.textContent || '';
    const textPrefix = textStart === null ? '' : anchorText.slice(Math.max(0, textStart - 24), textStart);
    const textSuffix = textEnd === null ? '' : anchorText.slice(textEnd, textEnd + 24);
    const label = `"${text.slice(0, 60)}"`;
    return {
      selector,
      text,
      label,
      textStart,
      textEnd,
      textPrefix,
      textSuffix,
      range: clonedRange,
      anchorRect,
    };
  }

  function openTextCommentCard(selected) {
    if (!selected) return;
    showCard({
      heading: 'Text: ' + selected.text.slice(0, 50) + (selected.text.length > 50 ? '…' : ''),
      placeholder: 'What should change about this text?',
      anchorRect: selected.anchorRect,
      onAdd: note => {
        window.parent.postMessage({
          [TAG]: true,
          type: 'text-selected',
          selector: selected.selector,
          text: selected.text,
          label: selected.label,
          note,
          textStart: selected.textStart,
          textEnd: selected.textEnd,
          textPrefix: selected.textPrefix,
          textSuffix: selected.textSuffix,
        }, '*');
      },
    });
  }

  function showQuickCommentButton(selected) {
    clearQuickCommentButton();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-annotron-ui', 'quick-comment-button');
    btn.setAttribute('aria-label', 'Add comment to selected text');
    btn.title = 'Comment on selected text';
    btn.textContent = '💬';
    btn.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'width:26px',
      'height:26px',
      'border:1px solid #2f6fd5',
      'border-radius:7px 7px 7px 0',
      'background:#4f8ef7',
      'color:#fff',
      'padding:0',
      'font:14px/1 system-ui,-apple-system,sans-serif',
      'display:grid',
      'place-items:center',
      'cursor:pointer',
      'box-shadow:0 3px 10px rgba(0,0,0,.35)',
      'pointer-events:auto',
    ].join(';');

    const rect = selected.anchorRect;
    const left = Math.max(8, Math.min(window.innerWidth - 34, rect.right + 6));
    const top = Math.max(8, Math.min(window.innerHeight - 34, rect.top - 8));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;

    const activate = e => {
      e.preventDefault();
      e.stopPropagation();
      ignoreNextClick = true;
      clearTextContextMenu();
      clearQuickCommentButton();
      openTextCommentCard(selected);
    };

    // Use pointerdown so selectionchange doesn't remove the button before click fires.
    btn.addEventListener('pointerdown', activate);
    btn.addEventListener('click', activate);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        activate(e);
      }
    });

    document.documentElement.appendChild(btn);
    quickCommentBtnEl = btn;
  }

  function showTextContextMenu(x, y, onComment) {
    clearTextContextMenu();
    const menu = document.createElement('div');
    menu.setAttribute('data-annotron-ui', 'text-context-menu');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'min-width:140px',
      'background:#25262b',
      'color:#c9cdd4',
      'border:1px solid #4f8ef7',
      'border-radius:8px',
      'padding:6px',
      'box-shadow:0 12px 36px rgba(0,0,0,.45)',
      'pointer-events:auto',
    ].join(';');

    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = 'Comment';
    item.setAttribute('role', 'menuitem');
    item.style.cssText = [
      'width:100%',
      'text-align:left',
      'border:0',
      'border-radius:6px',
      'padding:6px 10px',
      'background:#25262b',
      'color:#c9cdd4',
      'cursor:pointer',
      'font:600 12px system-ui,-apple-system,sans-serif',
    ].join(';');
    item.addEventListener('mouseenter', () => { item.style.background = '#373a40'; });
    item.addEventListener('mouseleave', () => { item.style.background = '#25262b'; });
    item.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      clearTextContextMenu();
      onComment();
    });

    menu.appendChild(item);
    document.documentElement.appendChild(menu);
    textContextMenuEl = menu;

    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - bounds.width - 8, x));
    const top = Math.max(8, Math.min(window.innerHeight - bounds.height - 8, y));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    setTimeout(() => item.focus(), 0);
  }

  function makeSnippet(text, max = 140) {
    if (!text) return '';
    const t = String(text).trim().replace(/\s+/g, ' ');
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  function latestMessage(annotation) {
    const lastThread = annotation.thread?.length
      ? annotation.thread[annotation.thread.length - 1].message
      : '';
    return lastThread || annotation.note || annotation.text || '';
  }

  function showCommentPopup(annotation, anchorRect) {
    clearCommentPopup();
    const popup = document.createElement('div');
    popup.setAttribute('data-annotron-ui', 'comment-popup');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Annotation comment');
    popup.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'width:min(320px,calc(100vw - 24px))',
      'background:#25262b',
      'color:#c9cdd4',
      'border:1px solid #4f8ef7',
      'border-radius:8px',
      'padding:10px 12px',
      'box-shadow:0 12px 36px rgba(0,0,0,.45)',
      'font:12px/1.4 system-ui,-apple-system,sans-serif',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'pointer-events:auto',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:11px;font-weight:700;color:#8f97a6;text-transform:uppercase;letter-spacing:.45px;';
    title.textContent = annotation.kind === 'text' ? 'Text Comment' : 'Element Comment';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = annotation.label || '(annotation)';

    const body = document.createElement('div');
    body.style.cssText = 'font-size:12px;color:#d7dbe2;white-space:pre-wrap;word-break:break-word;';
    body.textContent = makeSnippet(latestMessage(annotation));

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'border:0;border-radius:6px;padding:5px 10px;background:#373a40;color:#c9cdd4;cursor:pointer;font:600 11px system-ui,-apple-system,sans-serif;';

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open thread';
    open.style.cssText = 'border:0;border-radius:6px;padding:5px 10px;background:#4f8ef7;color:#fff;cursor:pointer;font:600 11px system-ui,-apple-system,sans-serif;';

    close.addEventListener('click', () => clearCommentPopup());
    open.addEventListener('click', () => {
      window.parent.postMessage({ [TAG]: true, type: 'annotation-selected', id: annotation.id }, '*');
      clearCommentPopup();
    });
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        clearCommentPopup();
      }
    });

    row.append(close, open);
    popup.append(title, label, body, row);
    document.documentElement.appendChild(popup);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bounds = popup.getBoundingClientRect();
    let left = Math.min(vw - bounds.width - 10, anchorRect.left);
    left = Math.max(10, left);
    let top = anchorRect.bottom + 10;
    if (top + bounds.height > vh - 10) top = Math.max(10, anchorRect.top - bounds.height - 10);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    commentPopupEl = popup;
    setTimeout(() => open.focus(), 0);
  }

  function addAnnotationButton(overlay, annotation, rect) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-annotron-ui', 'annotation-button');
    button.setAttribute('aria-label', `Open comment for ${annotation.label || annotation.text || annotation.kind}`);
    button.title = annotation.thread?.at(-1)?.message || annotation.note || 'Open comment';
    const selected = annotation.id === selectedAnnotationId;
    button.textContent = '◆';
    button.style.cssText = [
      'position:absolute',
      `left:${Math.max(2, Math.min(window.innerWidth - 24, rect.right - 9))}px`,
      `top:${Math.max(2, rect.top - 9)}px`,
      'width:22px', 'height:22px', 'padding:0',
      'display:grid', 'place-items:center',
      'border-radius:6px 6px 6px 0',
      `border:1px solid ${selected ? '#fff' : '#2f6fd5'}`,
      `background:${selected ? '#245ec1' : '#4f8ef7'}`,
      'color:#fff', 'font:9px/1 system-ui,sans-serif',
      'box-shadow:0 2px 6px rgba(0,0,0,.3)',
      'cursor:pointer', 'pointer-events:auto',
    ].join(';');
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      selectedAnnotationId = annotation.id;
      renderAnnotationsOverlay();
      showCommentPopup(annotation, rect);
    });
    overlay.appendChild(button);
  }

  function renderAnnotationsOverlay() {
    annotationRenderFrame = null;
    const overlay = ensureAnnotationsOverlay();
    overlay.innerHTML = '';
    clearCommentPopup();
    for (const annotation of annotations) {
      if (!annotation.selector) continue;
      let target;
      try { target = document.querySelector(annotation.selector); } catch { continue; }
      if (!target) continue;
      let rects = [];
      if (annotation.kind === 'text' && annotation.text) {
        const range = rangeForAnnotation(annotation, target);
        if (range) rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      }
      if (!rects.length) {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects = [rect];
      }
      if (!rects.length) continue;
      for (const rect of rects) {
        const mark = document.createElement('div');
        const selected = annotation.id === selectedAnnotationId;
        mark.style.cssText = annotation.kind === 'text'
          ? `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:${selected ? 'rgba(77,143,255,.35)' : 'rgba(255,202,40,.34)'};border-bottom:2px solid ${selected ? 'rgba(43,106,214,.92)' : 'rgba(224,151,0,.85)'};border-radius:2px;`
          : `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;outline:${selected ? 3 : 2}px solid rgba(79,142,247,${selected ? '.95' : '.6'});outline-offset:2px;border-radius:2px;`;
        overlay.appendChild(mark);
      }
      addAnnotationButton(overlay, annotation, rects.at(-1));
    }
  }

  function scheduleAnnotationsRender() {
    if (annotationRenderFrame !== null) return;
    annotationRenderFrame = requestAnimationFrame(renderAnnotationsOverlay);
  }

  window.addEventListener('resize', scheduleAnnotationsRender);
  window.addEventListener('load', scheduleAnnotationsRender);
  document.addEventListener('scroll', scheduleAnnotationsRender, true);
  document.addEventListener('load', scheduleAnnotationsRender, true);

  // ── Card ──────────────────────────────────────────────────────────────────
  const CARD_STYLE = [
    'position:fixed',
    'z-index:2147483646',
    'width:min(300px,calc(100vw - 24px))',
    'padding:14px',
    'border-radius:10px',
    'background:#25262b',
    'color:#c9cdd4',
    'border:1px solid #4f8ef7',
    'box-shadow:0 16px 56px rgba(0,0,0,.5)',
    'font:13px/1.4 system-ui,-apple-system,sans-serif',
    'display:flex',
    'flex-direction:column',
    'gap:8px',
  ].join(';');

  function clearCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }

  function dismissCard() {
    clearCard();
    clearHighlights();
    clearTextContextMenu();
    clearQuickCommentButton();
    clearCommentPopup();
    if (hovered) {
      hovered.style.outline = '';
      hovered.style.outlineOffset = '';
      hovered.style.cursor = '';
      hovered = null;
    }
  }

  function positionCard(anchorRect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.max(12, Math.min(anchorRect.left, vw - 316));
    let top = anchorRect.bottom + 10;
    if (top + 200 > vh) top = Math.max(12, anchorRect.top - 210);
    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
  }

  function el(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) e.style.cssText = styles;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showCard({ heading, placeholder, anchorRect, onAdd }) {
    clearCard();

    cardEl = document.createElement('div');
    cardEl.setAttribute('data-annotron-ui', 'card');
    cardEl.style.cssText = CARD_STYLE;

    const hdg = el('div',
      'font-size:11px;font-weight:700;color:#6c7280;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      heading);

    const ta = document.createElement('textarea');
    ta.placeholder = placeholder;
    ta.style.cssText = 'width:100%;min-height:68px;resize:vertical;border-radius:6px;border:1px solid #373a40;background:#1e1f23;color:#c9cdd4;padding:7px 8px;font:13px/1.4 system-ui,-apple-system,sans-serif;box-sizing:border-box;outline:none;';
    ta.addEventListener('focus', () => { ta.style.borderColor = '#4f8ef7'; });
    ta.addEventListener('blur', () => { ta.style.borderColor = '#373a40'; });

    const hint = el('div', 'font-size:11px;color:#4a4e5a;', 'Enter — add · Esc — cancel');

    const row = el('div', 'display:flex;gap:6px;justify-content:flex-end;');

    const btnCancel = el('button', 'border:0;border-radius:6px;padding:6px 12px;font:600 12px system-ui;cursor:pointer;background:#373a40;color:#c9cdd4;', 'Cancel');
    const btnAdd = el('button', 'border:0;border-radius:6px;padding:6px 12px;font:600 12px system-ui;cursor:pointer;background:#4f8ef7;color:#fff;', 'Add annotation');

    row.append(btnCancel, btnAdd);
    cardEl.append(hdg, ta, hint, row);
    document.documentElement.appendChild(cardEl);
    positionCard(anchorRect);

    const submit = () => { onAdd(ta.value.trim()); dismissCard(); };

    btnCancel.addEventListener('click', e => { e.stopPropagation(); dismissCard(); });
    btnAdd.addEventListener('click', e => { e.stopPropagation(); submit(); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); dismissCard(); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    setTimeout(() => ta.focus(), 0);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  document.addEventListener('mouseover', e => {
    if (!annotating || isInteractive(e.target) || isAnnotronEl(e.target)) return;
    if (hovered) { hovered.style.outline = ''; hovered.style.outlineOffset = ''; hovered.style.cursor = ''; }
    hovered = e.target;
    hovered.style.outline = '2px solid #4f8ef7';
    hovered.style.outlineOffset = '2px';
    hovered.style.cursor = 'crosshair';
  }, true);

  document.addEventListener('mouseout', e => {
    if (!annotating || !hovered || e.target !== hovered) return;
    hovered.style.outline = '';
    hovered.style.outlineOffset = '';
    hovered.style.cursor = '';
    hovered = null;
  }, true);

  document.addEventListener('contextmenu', e => {
    if (isAnnotronEl(e.target) || isInteractive(e.target)) return;
    const selected = extractSelectedTextData();
    if (!selected) {
      clearTextContextMenu(true);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    highlightTextRange(selected.range);
    clearQuickCommentButton();
    ignoreNextClick = true;

    showTextContextMenu(e.clientX, e.clientY, () => {
      openTextCommentCard(selected);
    });
  }, true);

  function maybeShowQuickComment() {
    if (annotating) return;
    if (textContextMenuEl || cardEl || commentPopupEl) return;
    const selected = extractSelectedTextData();
    if (!selected) {
      clearQuickCommentButton(true);
      return;
    }
    highlightTextRange(selected.range);
    showQuickCommentButton(selected);
  }

  document.addEventListener('mouseup', () => {
    maybeShowQuickComment();
  }, true);

  document.addEventListener('selectionchange', () => {
    maybeShowQuickComment();
  }, true);

  document.addEventListener('keyup', e => {
    if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
      maybeShowQuickComment();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      maybeShowQuickComment();
    }
  }, true);

  document.addEventListener('click', e => {
    if (textContextMenuEl && !isAnnotronEl(e.target)) {
      clearTextContextMenu(true);
    }
    if (quickCommentBtnEl && !isAnnotronEl(e.target)) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        clearQuickCommentButton(true);
      }
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      clearTextContextMenu(true);
      clearQuickCommentButton(true);
    }
  }, true);

  // ── Text selection ─────────────────────────────────────────────────────────
  document.addEventListener('mouseup', e => {
    console.log('[annotron-sdk] mouseup', 'annotating:', annotating, 'target:', e.target?.tagName);
    if (!annotating || isAnnotronEl(e.target)) return;

    const sel = window.getSelection();
    console.log('[annotron-sdk] selection:', sel?.toString()?.slice(0, 30));
    if (!sel || sel.isCollapsed) return;
    const rawText = sel.toString();
    const text = rawText.trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const anchorEl = range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    const anchorRect = range.getBoundingClientRect();
    const clonedRange = range.cloneRange();
    const selector = cssPath(anchorEl);
    const rawStart = textOffsetWithin(anchorEl, range.startContainer, range.startOffset);
    const textStart = rawStart === null ? null : rawStart + rawText.indexOf(text);
    const textEnd = textStart === null ? null : textStart + text.length;
    const anchorText = anchorEl.textContent || '';
    const textPrefix = textStart === null ? '' : anchorText.slice(Math.max(0, textStart - 24), textStart);
    const textSuffix = textEnd === null ? '' : anchorText.slice(textEnd, textEnd + 24);
    const label = `"${text.slice(0, 60)}"`;

    ignoreNextClick = true;
    dismissCard();
    clearQuickCommentButton();
    highlightTextRange(clonedRange);
    sel.removeAllRanges();

    openTextCommentCard({ selector, text, label, anchorRect, textStart, textEnd, textPrefix, textSuffix });
  }, true);

  // ── Element click ──────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    console.log('[annotron-sdk] click', 'annotating:', annotating, 'target:', e.target?.tagName);
    if (!annotating || isAnnotronEl(e.target)) return;
    if (isInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    if (ignoreNextClick) { ignoreNextClick = false; return; }

    const el = e.target;
    const selector = cssPath(el);
    const label = labelFor(el);
    const anchorRect = el.getBoundingClientRect();

    console.log('[annotron-sdk] showing card at', anchorRect.left, anchorRect.bottom);
    dismissCard();
    highlightElement(el);
    showCard({
      heading: 'Element: ' + label,
      placeholder: 'What should change about this element?',
      anchorRect,
      onAdd: note => {
        window.parent.postMessage({ [TAG]: true, type: 'element-selected', selector, label, note }, '*');
        dismissCard();
      },
    });
  }, true);

  // ── Serialize ──────────────────────────────────────────────────────────────
  function serialize() {
    dismissCard();
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script[data-annotron]').forEach(s => s.remove());
    clone.querySelectorAll('[data-annotron-ui]').forEach(s => s.remove());
    clone.querySelectorAll('[style]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.cursor = '';
    });
    const dt = document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : '';
    return dt + clone.outerHTML;
  }

  // ── Message bus ────────────────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || !d[TAG]) return;
    if (d.type === 'set-annotate') {
      annotating = d.value;
      console.log('[annotron-sdk] set-annotate', annotating);
      if (!annotating) dismissCard();
    }
    if (d.type === 'set-annotations') {
      annotations = Array.isArray(d.annotations) ? d.annotations : [];
      selectedAnnotationId = d.selectedId || null;
      scheduleAnnotationsRender();
    }
    if (d.type === 'serialize') {
      e.source.postMessage({ [TAG]: true, type: 'serialized', html: serialize(), reqId: d.reqId }, '*');
    }
    if (d.type === 'jump-to-element') {
      const target = d.selector ? document.querySelector(d.selector) : null;
      if (target) {
        dismissCard();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElement(target);
      }
    }
    if (d.type === 'clear-highlight') {
      clearHighlights();
      if (hovered) {
        hovered.style.outline = '';
        hovered.style.outlineOffset = '';
        hovered.style.cursor = '';
        hovered = null;
      }
    }
    if (d.type === 'focus-annotation') {
      selectedAnnotationId = d.annotation?.id || null;
      const annotation = d.annotation;
      let target = null;
      try { target = annotation?.selector ? document.querySelector(annotation.selector) : null; } catch {}
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scheduleAnnotationsRender();
    }
  });

  window.parent.postMessage({ [TAG]: true, type: 'sdk-ready' }, '*');
})();
