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
  // Cached .md source + this iframe's file path — used to gate the inline
  // "Edit" affordance (only offered when a selection maps to a single exact
  // run in the source) and to compute the edit index sent to the server.
  let mdSource = null;
  let artifactFile = null;

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
      m.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:rgba(39,65,241,.11);border-bottom:1.5px solid rgba(39,65,241,.45);border-radius:2px;pointer-events:none;`;
      overlay.appendChild(m);
    }
  }

  function highlightElement(el) {
    const overlay = ensureOverlay();
    clearHighlights();
    const r = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #2741F1;outline-offset:2px;border-radius:3px;pointer-events:none;`;
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

  // Open the inline "New comment" composer anchored right under the selection.
  // On submit it hands the note to the chrome, which stores the annotation.
  function openTextCommentCard(selected) {
    if (!selected) return;
    clearTextContextMenu();
    clearQuickCommentButton();
    showCard({
      quote: selected.text,
      placeholder: 'Add your comment…',
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
        try { const s = window.getSelection(); s && s.removeAllRanges(); } catch {}
      },
    });
  }

  // One pill button (Comment / Edit) inside the floating selection toolbar.
  function makeQuickPill(label, svg, title, onActivate) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-annotron-ui', 'quick-comment-button');
    btn.title = title;
    btn.innerHTML = svg + `<span>${label}</span>`;
    btn.style.cssText = [
      'height:34px', 'padding:0 13px', 'border:none', 'border-radius:9px',
      'background:#1B1A3D', 'color:#fff',
      "font:600 12.5px 'Inter',system-ui,-apple-system,sans-serif",
      'display:inline-flex', 'align-items:center', 'gap:6px', 'cursor:pointer',
      'box-shadow:0 8px 22px rgba(27,26,61,.34)', 'pointer-events:auto',
    ].join(';');
    const activate = e => { e.preventDefault(); e.stopPropagation(); ignoreNextClick = true; onActivate(); };
    // pointerdown so selectionchange doesn't drop the button before click fires.
    btn.addEventListener('pointerdown', activate);
    btn.addEventListener('click', activate);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(e); });
    return btn;
  }

  // Fetch + cache the .md source so the client can decide whether a selection
  // is safely editable. Called at load; the iframe fully reloads (and re-runs
  // this SDK) whenever the file changes, so the cache stays fresh.
  async function initMdSource() {
    try {
      artifactFile = new URLSearchParams(location.search).get('file');
      if (!artifactFile || !/\.md$/i.test(artifactFile)) return; // markdown only
      const res = await fetch('/source?file=' + encodeURIComponent(artifactFile));
      if (!res.ok) return;
      const d = await res.json();
      mdSource = typeof d.markdown === 'string' ? d.markdown : null;
    } catch { mdSource = null; }
  }

  // Locate the selected text in the .md source. Returns a single index when the
  // selection maps to exactly one run (unique, or disambiguated by the
  // surrounding rendered context) — otherwise -1, which hides the Edit button.
  function findEditIndex(selected) {
    if (!mdSource || !selected || !selected.text) return -1;
    const t = selected.text;
    const idxs = [];
    for (let i = mdSource.indexOf(t); i !== -1 && idxs.length <= 50; i = mdSource.indexOf(t, i + 1)) idxs.push(i);
    if (idxs.length === 0) return -1;
    if (idxs.length === 1) return idxs[0];
    // Multiple matches: disambiguate with the rendered prefix/suffix context.
    const pre = (selected.textPrefix || '').trim().slice(-12);
    const suf = (selected.textSuffix || '').trim().slice(0, 12);
    if (!pre && !suf) return -1;
    const hits = idxs.filter(idx => {
      const before = mdSource.slice(Math.max(0, idx - 80), idx);
      const after = mdSource.slice(idx + t.length, idx + t.length + 80);
      return (!pre || before.includes(pre)) && (!suf || after.includes(suf));
    });
    return hits.length === 1 ? hits[0] : -1;
  }

  // Inline edit card: an input pre-filled with the selected text, anchored at
  // the selection. Save writes the new text (or Delete = empty) straight to the
  // .md via the chrome → /edit-text. No agent.
  function openTextEditCard(selected, index) {
    clearCard();
    cardEl = document.createElement('div');
    cardEl.setAttribute('data-annotron-ui', 'card');
    cardEl.style.cssText = CARD_STYLE;

    const hdg = document.createElement('div');
    hdg.style.cssText = `display:flex;align-items:center;gap:6px;font:600 11px ${FONT};letter-spacing:.09em;text-transform:uppercase;color:#2741F1;margin-bottom:9px;`;
    hdg.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Edit text</span>';

    const ta = document.createElement('textarea');
    ta.value = selected.text;
    ta.style.cssText = `width:100%;min-height:66px;resize:vertical;border-radius:10px;border:1px solid rgba(27,26,61,.14);background:#fff;color:#1B1A3D;padding:10px 11px;font:400 13.5px/1.5 ${FONT};box-sizing:border-box;outline:none;`;
    ta.addEventListener('focus', () => { ta.style.borderColor = '#2741F1'; ta.style.boxShadow = '0 0 0 3px rgba(39,65,241,.12)'; });
    ta.addEventListener('blur', () => { ta.style.borderColor = 'rgba(27,26,61,.14)'; ta.style.boxShadow = 'none'; });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:10px;';
    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.style.cssText = `height:32px;padding:0 13px;border-radius:8px;border:1px solid rgba(216,134,137,.5);background:#fff;color:#b4484c;font:600 12.5px ${FONT};cursor:pointer;margin-right:auto;`;
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = `height:32px;padding:0 13px;border-radius:8px;border:1px solid rgba(27,26,61,.14);background:#fff;color:rgba(27,26,61,.7);font:600 12.5px ${FONT};cursor:pointer;`;
    const btnSave = document.createElement('button');
    btnSave.textContent = 'Save';
    btnSave.style.cssText = `height:32px;padding:0 15px;border-radius:8px;border:none;background:#2741F1;color:#fff;font:600 12.5px ${FONT};cursor:pointer;`;
    row.append(btnDelete, btnCancel, btnSave);

    cardEl.append(hdg, ta, row);
    document.documentElement.appendChild(cardEl);
    positionCard(selected.anchorRect);

    const apply = (newText) => {
      window.parent.postMessage({
        [TAG]: true, type: 'text-edit',
        file: artifactFile, oldText: selected.text, newText, index,
      }, '*');
      // Optimistically patch the local cache so a follow-up edit stays aligned
      // (the iframe also reloads once the .md write lands, re-seeding it).
      if (mdSource != null && index >= 0) {
        mdSource = mdSource.slice(0, index) + newText + mdSource.slice(index + selected.text.length);
      }
      try { const s = window.getSelection(); s && s.removeAllRanges(); } catch {}
      dismissCard();
    };

    btnCancel.addEventListener('click', e => { e.stopPropagation(); dismissCard(); });
    btnSave.addEventListener('click', e => { e.stopPropagation(); apply(ta.value); });
    btnDelete.addEventListener('click', e => { e.stopPropagation(); apply(''); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); dismissCard(); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); apply(ta.value); }
    });
    setTimeout(() => { ta.focus(); ta.select(); }, 0);
  }

  function showQuickCommentButton(selected) {
    clearQuickCommentButton();
    const COMMENT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    const EDIT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

    const wrap = document.createElement('div');
    wrap.setAttribute('data-annotron-ui', 'quick-comment-button');
    wrap.style.cssText = 'position:fixed;z-index:2147483647;display:inline-flex;gap:6px;pointer-events:auto;';

    wrap.appendChild(makeQuickPill('Comment', COMMENT_SVG, 'Comment on selected text', () => {
      clearTextContextMenu(); clearQuickCommentButton(); openTextCommentCard(selected);
    }));

    // "Edit" — direct .md edit. Shown ONLY when the selection maps to a single
    // exact run in the Markdown source, so we never offer an edit we can't
    // safely apply (no error message — the button just isn't there).
    const editIndex = findEditIndex(selected);
    if (editIndex >= 0) {
      wrap.appendChild(makeQuickPill('Edit', EDIT_SVG, 'Edit selected text directly', () => {
        clearTextContextMenu(); clearQuickCommentButton(); openTextEditCard(selected, editIndex);
      }));
    }

    const rect = selected.anchorRect;
    const width = editIndex >= 0 ? 168 : 96;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    const top = Math.max(8, Math.min(window.innerHeight - 42, rect.top - 42));
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;

    document.documentElement.appendChild(wrap);
    quickCommentBtnEl = wrap;
  }

  function showTextContextMenu(x, y, onComment) {
    clearTextContextMenu();
    const menu = document.createElement('div');
    menu.setAttribute('data-annotron-ui', 'text-context-menu');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'min-width:168px',
      'background:#fff',
      'color:#1B1A3D',
      'border:1px solid rgba(27,26,61,.1)',
      'border-radius:12px',
      'padding:5px',
      'box-shadow:0 12px 34px rgba(27,26,61,.2)',
      'pointer-events:auto',
    ].join(';');

    const item = document.createElement('button');
    item.type = 'button';
    item.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2741F1" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Comment</span>';
    item.setAttribute('role', 'menuitem');
    item.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:9px',
      'width:100%',
      'text-align:left',
      'border:0',
      'border-radius:8px',
      'padding:8px 12px',
      'background:#fff',
      'color:#1B1A3D',
      'cursor:pointer',
      "font:500 13px 'Inter',system-ui,-apple-system,sans-serif",
    ].join(';');
    item.addEventListener('mouseenter', () => { item.style.background = '#F3F3F8'; });
    item.addEventListener('mouseleave', () => { item.style.background = '#fff'; });
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

  // ── Hover preview popup (shows a comment's content on highlight hover) ──────
  let hoverPopupEl = null;
  let hoverHideTimer = null;
  const HOVER_FONT = "'Inter',system-ui,-apple-system,sans-serif";

  function clearHoverPopup() {
    clearTimeout(hoverHideTimer);
    if (hoverPopupEl) { hoverPopupEl.remove(); hoverPopupEl = null; }
  }

  function showHoverPopup(annotation, rect) {
    clearTimeout(hoverHideTimer);
    clearHoverPopup();
    const msg = latestMessage(annotation);
    if (!msg) return;
    const resolved = annotation.status === 'resolved';
    const accent = resolved ? '#1c8a4e' : '#2741F1';
    const pop = document.createElement('div');
    pop.setAttribute('data-annotron-ui', 'hover-popup');
    pop.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'pointer-events:none',
      'width:max-content', 'max-width:300px',
      'background:#fff', 'color:#1B1A3D',
      'border:1px solid rgba(27,26,61,.1)', 'border-radius:12px',
      'padding:10px 12px', 'box-shadow:0 10px 30px rgba(27,26,61,.18)',
      `font:12px/1.5 ${HOVER_FONT}`, 'animation:none',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = `display:flex;align-items:center;gap:5px;font:600 10px ${HOVER_FONT};letter-spacing:.09em;text-transform:uppercase;color:${accent};margin-bottom:5px;`;
    title.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${resolved ? 'Resolved' : (annotation.kind === 'text' ? 'Text comment' : 'Element comment')}</span>`;

    const body = document.createElement('div');
    body.style.cssText = 'color:rgba(27,26,61,.82);white-space:pre-wrap;word-break:break-word;';
    body.textContent = makeSnippet(msg, 240);

    const foot = document.createElement('div');
    const replies = annotation.thread?.length || 0;
    foot.style.cssText = `margin-top:6px;font:500 11px ${HOVER_FONT};color:rgba(27,26,61,.45);`;
    foot.textContent = replies > 1 ? `${replies} messages · click to open` : 'Click to open';

    pop.append(title, body, foot);
    document.documentElement.appendChild(pop);

    const vw = window.innerWidth, vh = window.innerHeight;
    const b = pop.getBoundingClientRect();
    let left = Math.min(vw - b.width - 10, Math.max(10, rect.left));
    let top = rect.bottom + 8;
    if (top + b.height > vh - 10) top = Math.max(10, rect.top - b.height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    hoverPopupEl = pop;
  }

  function showCommentPopup(annotation, anchorRect) {
    clearCommentPopup();
    const popup = document.createElement('div');
    popup.setAttribute('data-annotron-ui', 'comment-popup');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Annotation comment');
    const resolved = annotation.status === 'resolved';
    popup.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'width:min(320px,calc(100vw - 24px))',
      'background:#fff',
      'color:#1B1A3D',
      'border:1px solid rgba(27,26,61,.1)',
      'border-radius:14px',
      'padding:13px',
      'box-shadow:0 12px 34px rgba(27,26,61,.2)',
      "font:12px/1.45 'Inter',system-ui,-apple-system,sans-serif",
      'display:flex',
      'flex-direction:column',
      'gap:9px',
      'pointer-events:auto',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = `font-size:11px;font-weight:600;color:${resolved ? '#1c8a4e' : '#2741F1'};text-transform:uppercase;letter-spacing:.09em;`;
    title.textContent = resolved ? 'Resolved' : (annotation.kind === 'text' ? 'Text comment' : 'Element comment');

    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;font-weight:600;color:#1B1A3D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = annotation.label || '(annotation)';

    const body = document.createElement('div');
    body.style.cssText = 'font-size:13px;color:rgba(27,26,61,.82);white-space:pre-wrap;word-break:break-word;';
    body.textContent = makeSnippet(latestMessage(annotation));

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = "border:1px solid rgba(27,26,61,.14);border-radius:8px;padding:6px 12px;background:#fff;color:rgba(27,26,61,.7);cursor:pointer;font:600 11.5px 'Inter',system-ui,sans-serif;";

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open thread';
    open.style.cssText = "border:0;border-radius:8px;padding:6px 13px;background:#2741F1;color:#fff;cursor:pointer;font:600 11.5px 'Inter',system-ui,sans-serif;";

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
    const resolved = annotation.status === 'resolved';
    const bg = resolved ? '#2fbf71' : (selected ? '#1B1A3D' : '#2741F1');
    button.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    button.style.cssText = [
      'position:absolute',
      `left:${Math.max(2, Math.min(window.innerWidth - 24, rect.right - 10))}px`,
      `top:${Math.max(2, rect.top - 10)}px`,
      'width:22px', 'height:22px', 'padding:0',
      'display:grid', 'place-items:center',
      'border-radius:8px 8px 8px 2px',
      'border:none',
      `background:${bg}`,
      'color:#fff',
      'box-shadow:0 3px 10px rgba(27,26,61,.32)',
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
    clearHoverPopup();
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
      const selected = annotation.id === selectedAnnotationId;
      const resolved = annotation.status === 'resolved';
      // Subtle, design-matched palette: faint tint + a thin underline for text,
      // a soft outline for elements. Selected only deepens slightly.
      const tint = resolved ? '.13' : (selected ? '.18' : '.11');
      const line = resolved ? '.4' : (selected ? '.7' : '.45');
      const rgb = resolved ? '47,191,113' : '39,65,241';
      const fill = `rgba(${rgb},${tint})`;
      const underline = `rgba(${rgb},${line})`;
      rects.forEach((rect, i) => {
        const mark = document.createElement('div');
        mark.setAttribute('data-annotron-ui', 'annotation-mark');
        mark.style.cssText = annotation.kind === 'text'
          ? `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:${fill};border-bottom:1.5px solid ${underline};border-radius:2px;cursor:pointer;pointer-events:auto;transition:background .12s;`
          : `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;outline:1.5px solid ${underline};outline-offset:2px;border-radius:3px;background:${fill};cursor:pointer;pointer-events:auto;transition:background .12s;`;
        mark.addEventListener('mouseenter', () => {
          mark.style.background = `rgba(${rgb},.2)`;
          showHoverPopup(annotation, mark.getBoundingClientRect());
        });
        mark.addEventListener('mouseleave', () => {
          mark.style.background = fill;
          hoverHideTimer = setTimeout(clearHoverPopup, 120);
        });
        mark.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          clearHoverPopup();
          selectedAnnotationId = annotation.id;
          renderAnnotationsOverlay();
          window.parent.postMessage({ [TAG]: true, type: 'annotation-selected', id: annotation.id }, '*');
        });
        overlay.appendChild(mark);
      });
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

  // ── Inline composer card ────────────────────────────────────────────────
  const FONT = "'Inter',system-ui,-apple-system,sans-serif";
  const CARD_STYLE = [
    'position:fixed',
    'z-index:2147483646',
    'width:min(340px,calc(100vw - 24px))',
    'padding:13px',
    'border-radius:14px',
    'background:#fff',
    'color:#1B1A3D',
    'border:1px solid rgba(39,65,241,.3)',
    'box-shadow:0 6px 20px rgba(27,26,61,.16)',
    `font:13px/1.45 ${FONT}`,
    'display:flex',
    'flex-direction:column',
    'gap:0',
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
    const cw = cardEl.offsetWidth || 340, ch = cardEl.offsetHeight || 200;
    let left = Math.max(12, Math.min(anchorRect.left, vw - cw - 12));
    let top = anchorRect.bottom + 10;
    if (top + ch > vh - 12) top = Math.max(12, anchorRect.top - ch - 10);
    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
  }

  function el(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) e.style.cssText = styles;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showCard({ quote, placeholder, anchorRect, onAdd }) {
    clearCard();

    cardEl = document.createElement('div');
    cardEl.setAttribute('data-annotron-ui', 'card');
    cardEl.style.cssText = CARD_STYLE;

    const hdg = document.createElement('div');
    hdg.style.cssText = `display:flex;align-items:center;gap:6px;font:600 11px ${FONT};letter-spacing:.09em;text-transform:uppercase;color:#2741F1;margin-bottom:9px;`;
    hdg.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>New comment</span>';

    let quoteEl = null;
    if (quote) {
      quoteEl = document.createElement('div');
      quoteEl.style.cssText = `border-left:3px solid #D88689;padding:2px 0 2px 10px;font:italic 400 12.5px/1.5 ${FONT};color:rgba(27,26,61,.6);margin-bottom:11px;max-height:66px;overflow:hidden;`;
      quoteEl.textContent = '"' + quote + '"';
    }

    const ta = document.createElement('textarea');
    ta.placeholder = placeholder || 'Add your comment…';
    ta.style.cssText = `width:100%;min-height:66px;resize:vertical;border-radius:10px;border:1px solid rgba(27,26,61,.14);background:#fff;color:#1B1A3D;padding:10px 11px;font:400 13.5px/1.5 ${FONT};box-sizing:border-box;outline:none;`;
    ta.addEventListener('focus', () => { ta.style.borderColor = '#2741F1'; ta.style.boxShadow = '0 0 0 3px rgba(39,65,241,.12)'; });
    ta.addEventListener('blur', () => { ta.style.borderColor = 'rgba(27,26,61,.14)'; ta.style.boxShadow = 'none'; });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = `height:32px;padding:0 13px;border-radius:8px;border:1px solid rgba(27,26,61,.14);background:#fff;color:rgba(27,26,61,.7);font:600 12.5px ${FONT};cursor:pointer;`;
    const btnAdd = document.createElement('button');
    btnAdd.textContent = 'Comment';
    btnAdd.style.cssText = `height:32px;padding:0 15px;border-radius:8px;border:none;background:#2741F1;color:#fff;font:600 12.5px ${FONT};cursor:pointer;`;

    row.append(btnCancel, btnAdd);
    cardEl.append(hdg);
    if (quoteEl) cardEl.append(quoteEl);
    cardEl.append(ta, row);
    document.documentElement.appendChild(cardEl);
    positionCard(anchorRect);

    const submit = () => { const v = ta.value.trim(); if (!v) { ta.focus(); return; } onAdd(v); dismissCard(); };

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
    hovered.style.outline = '2px solid #2741F1';
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
    // Show the Comment + (conditional) Edit toolbar instead of jumping straight
    // into the comment composer, so a plain-text selection can be edited in
    // place. Keep the native selection alive (don't removeAllRanges) so the
    // pill survives the trailing click handler — matching the non-annotate path.
    showQuickCommentButton({ selector, text, label, anchorRect, textStart, textEnd, textPrefix, textSuffix });
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
    const quote = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);

    dismissCard();
    highlightElement(el);
    showCard({
      quote,
      placeholder: 'What should change about this element?',
      anchorRect,
      onAdd: note => {
        window.parent.postMessage({ [TAG]: true, type: 'element-selected', selector, label, note }, '*');
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

  // Extract headings for outline
  function extractHeadings() {
    const headingsData = document.querySelector('meta[name="headings-data"]');
    if (headingsData && headingsData.content) {
      try {
        return JSON.parse(headingsData.content);
      } catch (e) {
        console.error('[annotron-sdk] failed to parse headings:', e);
      }
    }
    return [];
  }

  const headings = extractHeadings();
  window.parent.postMessage({ [TAG]: true, type: 'sdk-ready', headings }, '*');
  // Load the .md source so the inline "Edit" affordance can gate itself.
  initMdSource();
})();
