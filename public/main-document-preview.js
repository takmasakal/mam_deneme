(function attachMainDocumentPreviewModule(global) {
  function createMainDocumentPreviewModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      isTextPreviewable,
      findMatchRanges,
      highlightTextByRanges
    } = deps || {};

function initDocumentPreview(asset) {
  const box = document.getElementById('docPreviewBox');
  const searchInput = document.getElementById('docSearchInput');
  const runBtn = document.getElementById('docSearchRunBtn');
  const prevBtn = document.getElementById('docSearchPrevBtn');
  const nextBtn = document.getElementById('docSearchNextBtn');
  const searchMeta = document.getElementById('docSearchMeta');
  if (!box) return () => {};

  let activeMatchIndex = -1;
  const updateSearchMeta = (count) => {
    if (!searchMeta) return;
    if (!count) {
      searchMeta.textContent = t('preview_search_empty');
      return;
    }
    const current = activeMatchIndex >= 0 ? (activeMatchIndex + 1) : 1;
    searchMeta.textContent = `${current}/${count}`;
  };

  const focusMatchAt = (index) => {
    const marks = Array.from(box.querySelectorAll('mark.search-hit'));
    if (!marks.length) {
      activeMatchIndex = -1;
      updateSearchMeta(0);
      return;
    }
    const safeIndex = ((index % marks.length) + marks.length) % marks.length;
    activeMatchIndex = safeIndex;
    marks.forEach((el, i) => {
      el.classList.toggle('search-hit-active', i === safeIndex);
    });
    marks[safeIndex].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    updateSearchMeta(marks.length);
  };

  const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const renderPreviewText = (fullText, query) => {
    const source = String(fullText || '');
    const q = String(query || '').trim();
    if (!q) {
      if (preferRich && richPreviewHtml) {
        box.classList.add('doc-preview-rich');
        box.innerHTML = richPreviewHtml;
      } else {
        box.classList.remove('doc-preview-rich');
        box.textContent = source;
      }
      if (searchMeta) searchMeta.textContent = '';
      activeMatchIndex = -1;
      return;
    }

    const pattern = new RegExp(escapeRegExp(q), 'gi');
    let match;
    let last = 0;
    let count = 0;
    let out = '';
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      out += `${escapeHtml(source.slice(last, start))}<mark class="search-hit">${escapeHtml(source.slice(start, end))}</mark>`;
      last = end;
      count += 1;
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
    out += escapeHtml(source.slice(last));
    box.classList.remove('doc-preview-rich');
    box.innerHTML = out;
    if (count) {
      focusMatchAt(0);
    } else {
      activeMatchIndex = -1;
      if (searchMeta) searchMeta.textContent = t('preview_search_empty');
    }
  };

  let cancelled = false;
  let previewText = '';
  let richPreviewHtml = '';
  let preferRich = false;
  (async () => {
    try {
      let text = '';
      try {
        const extracted = await api(`/api/assets/${asset.id}/preview-text`);
        text = String(extracted.text || '');
        richPreviewHtml = String(extracted.html || '');
        preferRich = String(extracted.mode || '').toLowerCase() === 'html' && Boolean(richPreviewHtml.trim());
      } catch (_error) {
        text = '';
        richPreviewHtml = '';
        preferRich = false;
      }
      if (!text && isTextPreviewable(asset)) {
        const res = await fetch(asset.mediaUrl);
        if (res.ok) text = await res.text();
      }
      if (cancelled) return;
      if (text.length > 12000) {
        text = `${text.slice(0, 12000)}\n...\n`;
      }
      previewText = text;
      renderPreviewText(previewText, searchInput?.value || '');
      if (!previewText && !richPreviewHtml) {
        box.textContent = t('preview_not_available');
      }
    } catch (_error) {
      if (!cancelled) box.textContent = t('preview_not_available');
    }
  })();

  const onSearch = () => {
    if (cancelled) return;
    renderPreviewText(previewText, searchInput?.value || '');
  };
  const onNext = () => {
    if (cancelled) return;
    const q = String(searchInput?.value || '').trim();
    if (!q) {
      searchInput?.focus();
      return;
    }
    const marks = box.querySelectorAll('mark.search-hit');
    if (!marks.length) return;
    focusMatchAt(activeMatchIndex + 1);
  };
  const onPrev = () => {
    if (cancelled) return;
    const q = String(searchInput?.value || '').trim();
    if (!q) {
      searchInput?.focus();
      return;
    }
    const marks = box.querySelectorAll('mark.search-hit');
    if (!marks.length) return;
    focusMatchAt(activeMatchIndex - 1);
  };
  searchInput?.addEventListener('input', onSearch);
  runBtn?.addEventListener('click', onSearch);
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);

  return () => {
    cancelled = true;
    searchInput?.removeEventListener('input', onSearch);
    runBtn?.removeEventListener('click', onSearch);
    prevBtn?.removeEventListener('click', onPrev);
    nextBtn?.removeEventListener('click', onNext);
  };
}

function initPdfSearch(asset) {
  const pdfViewport = document.getElementById('pdfRenderViewport');
  const pdfCanvas = document.getElementById('pdfCanvas');
  const pdfTextLayer = document.getElementById('pdfTextLayer');
  const openFileLink = document.getElementById('pdfOpenFileLink');
  const openPageBtn = document.getElementById('pdfOpenPageBtn');
  const pagePrevBtn = document.getElementById('pdfPagePrevBtn');
  const pageNextBtn = document.getElementById('pdfPageNextBtn');
  const pageInfo = document.getElementById('pdfPageInfo');
  const searchInput = document.getElementById('docSearchInput');
  const runBtn = document.getElementById('docSearchRunBtn');
  const prevBtn = document.getElementById('docSearchPrevBtn');
  const nextBtn = document.getElementById('docSearchNextBtn');
  const searchMeta = document.getElementById('docSearchMeta');
  if (!pdfViewport || !pdfCanvas || !pdfTextLayer || !searchInput || !runBtn || !nextBtn) return () => {};
  if (!window.pdfjsLib) {
    if (searchMeta) searchMeta.textContent = t('pdf_preview_unavailable');
    return () => {};
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const baseUrl = String(asset.mediaUrl || '').split('#')[0];
  const canvasCtx = pdfCanvas.getContext('2d');
  if (!canvasCtx) return () => {};

  let destroyed = false;
  let renderToken = 0;
  let pdfDoc = null;
  let pageTextCache = new Map();
  let totalPages = 1;
  let currentPage = 1;
  let matches = [];
  let activeIndex = -1;

  const renderPageInfo = () => {
    if (!pageInfo) return;
    pageInfo.textContent = `${currentPage}/${totalPages}`;
  };

  const refreshOpenLink = () => {
    if (!openFileLink) return;
    const q = String(searchInput.value || '').trim();
    const hash = q ? `#page=${currentPage}&search=${encodeURIComponent(q)}` : `#page=${currentPage}`;
    openFileLink.href = `${baseUrl}${hash}`;
  };

  const setPage = (page) => {
    currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
    renderPage(currentPage).catch(() => {});
    refreshOpenLink();
    renderPageInfo();
  };

  const renderActiveMatch = () => {
    if (!searchMeta) return;
    if (!matches.length || activeIndex < 0) {
      searchMeta.textContent = t('preview_search_empty');
      return;
    }
    const current = matches[activeIndex];
    const pos = `${activeIndex + 1}/${matches.length}`;
    const pageText = `p.${current.page}`;
    const snippet = String(current.snippet || '').trim();
    searchMeta.textContent = snippet ? `${pos} | ${pageText} | ${snippet}` : `${pos} | ${pageText}`;
  };

  const pageText = async (pageNum) => {
    if (pageTextCache.has(pageNum)) return pageTextCache.get(pageNum);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it) => String(it.str || '')).join('');
    pageTextCache.set(pageNum, text);
    return text;
  };

  const clearTextHighlights = () => {
    pdfTextLayer.querySelectorAll('span[data-pdf-original-text]').forEach((span) => {
      const original = span.getAttribute('data-pdf-original-text') || '';
      span.textContent = original;
      span.removeAttribute('data-pdf-original-text');
      span.classList.remove('search-hit-active');
    });
  };

  const applyTextHighlights = () => {
    clearTextHighlights();
    const query = String(searchInput.value || '').trim();
    if (!query) return;
    const spans = Array.from(pdfTextLayer.querySelectorAll('span'));
    if (!spans.length) return;

    let full = '';
    const segments = spans.map((span) => {
      const text = String(span.textContent || '');
      const start = full.length;
      full += text;
      return { span, text, start, end: start + text.length };
    });
    const ranges = findMatchRanges(full, query);
    if (!ranges.length) return;
    const activeSpanSet = new Set();
    segments.forEach((seg) => {
      const localRanges = [];
      ranges.forEach(([a, b]) => {
        const s = Math.max(a, seg.start);
        const e = Math.min(b, seg.end);
        if (s < e) localRanges.push([s - seg.start, e - seg.start]);
      });
      if (!localRanges.length) return;
      seg.span.setAttribute('data-pdf-original-text', seg.text);
      seg.span.innerHTML = highlightTextByRanges(seg.text, localRanges);
      activeSpanSet.add(seg.span);
    });

    const currentMatch = matches[activeIndex];
    const activeOccurrence = currentMatch && Number(currentMatch.page) === currentPage
      ? Math.max(0, Number(currentMatch.occurrence) || 0)
      : 0;
    const marks = Array.from(pdfTextLayer.querySelectorAll('mark.search-hit'));
    const activeMark = marks[Math.min(activeOccurrence, Math.max(0, marks.length - 1))];
    const activeSpan = activeMark?.closest('span');
    if (activeSpan) {
      activeSpan.classList.add('search-hit-active');
      activeSpan.scrollIntoView({ block: 'center', inline: 'nearest' });
    } else {
      const firstActive = Array.from(activeSpanSet)[0];
      if (firstActive) firstActive.classList.add('search-hit-active');
    }
  };

  const renderPage = async (pageNum) => {
    if (!pdfDoc || destroyed) return;
    const token = ++renderToken;
    const page = await pdfDoc.getPage(pageNum);
    const width = Math.max(420, pdfViewport.clientWidth || 900);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = width / unscaled.width;
    const viewport = page.getViewport({ scale });

    pdfCanvas.width = Math.ceil(viewport.width);
    pdfCanvas.height = Math.ceil(viewport.height);
    pdfCanvas.style.width = `${Math.ceil(viewport.width)}px`;
    pdfCanvas.style.height = `${Math.ceil(viewport.height)}px`;
    pdfTextLayer.style.width = `${Math.ceil(viewport.width)}px`;
    pdfTextLayer.style.height = `${Math.ceil(viewport.height)}px`;
    pdfTextLayer.innerHTML = '';

    await page.render({ canvasContext: canvasCtx, viewport }).promise;
    if (destroyed || token !== renderToken) return;

    const textContent = await page.getTextContent();
    await window.pdfjsLib.renderTextLayer({
      textContent,
      container: pdfTextLayer,
      viewport,
      textDivs: []
    }).promise;
    if (destroyed || token !== renderToken) return;

    applyTextHighlights();
  };

  const moveMatch = (delta) => {
    if (!matches.length) return;
    activeIndex = (activeIndex + delta + matches.length) % matches.length;
    const targetPage = Number(matches[activeIndex].page) || 1;
    if (targetPage !== currentPage) setPage(targetPage);
    else applyTextHighlights();
    renderActiveMatch();
  };

  const buildSnippet = (text, start, end) => {
    const source = String(text || '');
    const a = Math.max(0, Number(start) || 0);
    const b = Math.max(a, Number(end) || a);
    const left = Math.max(0, a - 48);
    const right = Math.min(source.length, b + 72);
    const prefix = left > 0 ? '...' : '';
    const suffix = right < source.length ? '...' : '';
    return `${prefix}${source.slice(left, right).replace(/\s+/g, ' ').trim()}${suffix}`;
  };

  const runSearch = async () => {
    const query = String(searchInput.value || '').trim();
    if (!query) {
      matches = [];
      activeIndex = -1;
      if (searchMeta) searchMeta.textContent = '';
      applyTextHighlights();
      return;
    }
    try {
      const nextMatches = [];
      for (let p = 1; p <= totalPages; p += 1) {
        const text = await pageText(p);
        const ranges = findMatchRanges(text, query);
        ranges.forEach(([start, end], idx) => {
          nextMatches.push({
            page: p,
            occurrence: idx,
            snippet: buildSnippet(text, start, end)
          });
        });
      }
      matches = nextMatches;
      if (!matches.length) {
        activeIndex = -1;
        renderActiveMatch();
        applyTextHighlights();
        return;
      }
      activeIndex = 0;
      setPage(matches[0].page);
      renderActiveMatch();
    } catch (_error) {
      matches = [];
      activeIndex = -1;
      if (searchMeta) searchMeta.textContent = t('preview_search_error');
      applyTextHighlights();
    }
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runSearch();
  };
  const onRunClick = () => {
    runSearch();
  };
  const onNextClick = () => {
    if (!matches.length) {
      runSearch();
      return;
    }
    moveMatch(1);
  };
  const onPrevClick = () => {
    if (!matches.length) return;
    moveMatch(-1);
  };
  const onPagePrev = () => setPage(currentPage - 1);
  const onPageNext = () => setPage(currentPage + 1);
  const onOpenPage = () => {
    const q = String(searchInput.value || '').trim();
    const hash = q ? `#page=${currentPage}&search=${encodeURIComponent(q)}` : `#page=${currentPage}`;
    window.open(`${baseUrl}${hash}`, '_blank', 'noopener,noreferrer');
  };

  searchInput.addEventListener('keydown', onKeyDown);
  runBtn.textContent = t('preview_find');
  prevBtn.textContent = '<';
  nextBtn.textContent = '>';
  runBtn.addEventListener('click', onRunClick);
  nextBtn.addEventListener('click', onNextClick);
  prevBtn?.addEventListener('click', onPrevClick);
  pagePrevBtn?.addEventListener('click', onPagePrev);
  pageNextBtn?.addEventListener('click', onPageNext);
  openPageBtn?.addEventListener('click', onOpenPage);

  const loadingTask = window.pdfjsLib.getDocument({ url: baseUrl });
  loadingTask.promise.then((doc) => {
    if (destroyed) return;
    pdfDoc = doc;
    totalPages = Math.max(1, Number(doc.numPages) || 1);
    setPage(1);
  }).catch(() => {
    if (searchMeta) searchMeta.textContent = t('preview_search_error');
  });

  return () => {
    destroyed = true;
    searchInput.removeEventListener('keydown', onKeyDown);
    runBtn.removeEventListener('click', onRunClick);
    nextBtn.removeEventListener('click', onNextClick);
    prevBtn?.removeEventListener('click', onPrevClick);
    pagePrevBtn?.removeEventListener('click', onPagePrev);
    pageNextBtn?.removeEventListener('click', onPageNext);
    openPageBtn?.removeEventListener('click', onOpenPage);
    try {
      loadingTask.destroy();
    } catch (_error) {
      // ignore
    }
  };
}



    return {
      initDocumentPreview,
      initPdfSearch
    };
  }

  global.createMainDocumentPreviewModule = createMainDocumentPreviewModule;
})(window);
