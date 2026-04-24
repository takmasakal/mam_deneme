(function attachMainSearchSuggestModule(global) {
  function createMainSearchSuggestModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      highlightMatch,
      serializeForm,
      assetTypeFilters,
      searchForm,
      searchQueryInput,
      searchSuggestList,
      ocrQueryInput,
      ocrSuggestList,
      subtitleQueryInput,
      subtitleSuggestList,
      getActiveOcrQueryInput,
      setSingleSelection,
      openAsset,
      loadAssets,
      updateClearSearchButtonState
    } = deps || {};

    let searchSuggestTimer = null;
    let searchSuggestReqSeq = 0;
    let searchSuggestItems = [];
    let searchSuggestActiveIndex = -1;
    let searchSuggestHideTimer = null;
    let ocrSuggestTimer = null;
    let ocrSuggestReqSeq = 0;
    let ocrSuggestItems = [];
    let ocrSuggestActiveIndex = -1;
    let ocrSuggestHideTimer = null;
    let subtitleSuggestTimer = null;
    let subtitleSuggestReqSeq = 0;
    let subtitleSuggestItems = [];
    let subtitleSuggestActiveIndex = -1;
    let subtitleSuggestHideTimer = null;

    function highlightSuggestText(text, query) {
      return highlightMatch(text, query);
    }

    function normalizeTrashScopeForSuggest(value) {
      const raw = String(value || 'active').trim().toLowerCase();
      return ['active', 'trash', 'all'].includes(raw) ? raw : 'active';
    }

    function hideSearchSuggestions() {
      if (!searchSuggestList) return;
      searchSuggestList.classList.add('hidden');
      searchSuggestList.innerHTML = '';
      searchSuggestItems = [];
      searchSuggestActiveIndex = -1;
    }

    function setSearchSuggestionActive(index) {
      if (!searchSuggestList) return;
      const buttons = Array.from(searchSuggestList.querySelectorAll('.search-suggest-item'));
      if (!buttons.length) {
        searchSuggestActiveIndex = -1;
        return;
      }
      const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
      searchSuggestActiveIndex = safeIndex;
      buttons.forEach((btn, idx) => {
        btn.classList.toggle('active', idx === safeIndex);
      });
    }

    async function applySearchSuggestion(item, runSearch = true) {
      if (!item || !searchQueryInput) return;
      const title = String(item.title || '').trim();
      const fileName = String(item.fileName || '').trim();
      searchQueryInput.value = title || fileName;
      hideSearchSuggestions();
      if (runSearch) {
        await loadAssets();
      }
    }

    function renderSearchSuggestions(items, query) {
      if (!searchSuggestList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        hideSearchSuggestions();
        return;
      }
      searchSuggestItems = list;
      searchSuggestActiveIndex = -1;
      searchSuggestList.innerHTML = list.map((item, index) => {
        const title = String(item.title || item.fileName || item.id || '');
        const fileName = String(item.fileName || '');
        const type = String(item.type || '').trim();
        const state = item.inTrash ? t('in_trash') : t('active');
        const meta = [type, fileName, state].filter(Boolean).join(' | ');
        return `
          <button type="button" class="search-suggest-item" data-index="${index}">
            <strong>${highlightSuggestText(title, query)}</strong>
            <span>${escapeHtml(meta)}</span>
          </button>
        `;
      }).join('');
      searchSuggestList.classList.remove('hidden');
    }

    async function requestSearchSuggestions() {
      const query = String(searchQueryInput?.value || '').trim();
      if (query.length < 2) {
        hideSearchSuggestions();
        return;
      }

      const selectedTypes = assetTypeFilters
        .filter((el) => el.checked)
        .map((el) => String(el.value || '').toLowerCase())
        .filter(Boolean);
      if (!selectedTypes.length) {
        hideSearchSuggestions();
        return;
      }

      const filters = serializeForm(searchForm);
      const reqId = ++searchSuggestReqSeq;
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', '8');
      params.set('trash', normalizeTrashScopeForSuggest(filters.trash));
      if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      if (String(filters.type || '').trim()) params.set('type', String(filters.type).trim());
      if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
      if (selectedTypes.length < assetTypeFilters.length) params.set('types', selectedTypes.join(','));

      try {
        const result = await api(`/api/assets/suggest?${params.toString()}`);
        if (reqId !== searchSuggestReqSeq) return;
        renderSearchSuggestions(result, query);
      } catch (_error) {
        if (reqId !== searchSuggestReqSeq) return;
        hideSearchSuggestions();
      }
    }

    function queueSearchSuggestions() {
      if (searchSuggestTimer) clearTimeout(searchSuggestTimer);
      searchSuggestTimer = setTimeout(() => {
        requestSearchSuggestions().catch(() => {});
      }, 170);
    }

    function hideOcrSuggestions() {
      if (!ocrSuggestList) return;
      ocrSuggestList.classList.add('hidden');
      ocrSuggestList.innerHTML = '';
      ocrSuggestItems = [];
      ocrSuggestActiveIndex = -1;
    }

    function setOcrSuggestionActive(index) {
      if (!ocrSuggestList) return;
      const buttons = Array.from(ocrSuggestList.querySelectorAll('.search-suggest-item'));
      if (!buttons.length) {
        ocrSuggestActiveIndex = -1;
        return;
      }
      const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
      ocrSuggestActiveIndex = safeIndex;
      buttons.forEach((btn, idx) => btn.classList.toggle('active', idx === safeIndex));
    }

    async function applyOcrSuggestion(item, runSearch = true) {
      if (!item || !ocrQueryInput) return;
      hideOcrSuggestions();
      const id = String(item.id || '').trim();
      const startAtSeconds = Math.max(0, Number(item.startSec || 0));
      if (id) {
        setSingleSelection(id);
        const workflow = await api('/api/workflow');
        await openAsset(id, workflow, { startAtSeconds });
        return;
      }
      if (runSearch) await loadAssets();
    }

    function renderOcrSuggestions(items, query) {
      if (!ocrSuggestList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        hideOcrSuggestions();
        return;
      }
      ocrSuggestItems = list;
      ocrSuggestActiveIndex = -1;
      ocrSuggestList.innerHTML = list.map((item, index) => {
        const title = String(item.title || item.fileName || item.id || '');
        const hit = String(item.ocrHitText || '').trim();
        return `
          <button type="button" class="search-suggest-item" data-index="${index}">
            <strong>${highlightSuggestText(title, query)}</strong>
            <span>${highlightSuggestText(hit || title, query)}</span>
          </button>
        `;
      }).join('');
      ocrSuggestList.classList.remove('hidden');
    }

    async function requestOcrSuggestions() {
      const query = String(getActiveOcrQueryInput?.()?.value || '').trim();
      if (query.length < 2) {
        hideOcrSuggestions();
        return;
      }
      const selectedTypes = assetTypeFilters
        .filter((el) => el.checked)
        .map((el) => String(el.value || '').toLowerCase())
        .filter(Boolean);
      if (!selectedTypes.length) {
        hideOcrSuggestions();
        return;
      }
      const filters = serializeForm(searchForm);
      const reqId = ++ocrSuggestReqSeq;
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', '8');
      params.set('trash', normalizeTrashScopeForSuggest(filters.trash));
      if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      if (String(filters.type || '').trim()) params.set('type', String(filters.type).trim());
      if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
      if (selectedTypes.length < assetTypeFilters.length) params.set('types', selectedTypes.join(','));
      try {
        const result = await api(`/api/assets/ocr-suggest?${params.toString()}`);
        if (reqId !== ocrSuggestReqSeq) return;
        renderOcrSuggestions(result, query);
      } catch (_error) {
        if (reqId !== ocrSuggestReqSeq) return;
        hideOcrSuggestions();
      }
    }

    function queueOcrSuggestions() {
      if (ocrSuggestTimer) clearTimeout(ocrSuggestTimer);
      ocrSuggestTimer = setTimeout(() => {
        requestOcrSuggestions().catch(() => {});
      }, 170);
    }

    function hideSubtitleSuggestions() {
      if (!subtitleSuggestList) return;
      subtitleSuggestList.classList.add('hidden');
      subtitleSuggestList.innerHTML = '';
      subtitleSuggestItems = [];
      subtitleSuggestActiveIndex = -1;
    }

    function setSubtitleSuggestionActive(index) {
      if (!subtitleSuggestList) return;
      const buttons = Array.from(subtitleSuggestList.querySelectorAll('.search-suggest-item'));
      if (!buttons.length) {
        subtitleSuggestActiveIndex = -1;
        return;
      }
      const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
      subtitleSuggestActiveIndex = safeIndex;
      buttons.forEach((btn, idx) => btn.classList.toggle('active', idx === safeIndex));
    }

    async function applySubtitleSuggestion(item, runSearch = true) {
      if (!item || !subtitleQueryInput) return;
      hideSubtitleSuggestions();
      const id = String(item.id || '').trim();
      const startAtSeconds = Math.max(0, Number(item.startSec || 0));
      if (id) {
        setSingleSelection(id);
        const workflow = await api('/api/workflow');
        await openAsset(id, workflow, { startAtSeconds });
        return;
      }
      if (runSearch) await loadAssets();
    }

    function renderSubtitleSuggestions(items, query) {
      if (!subtitleSuggestList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        hideSubtitleSuggestions();
        return;
      }
      subtitleSuggestItems = list;
      subtitleSuggestActiveIndex = -1;
      subtitleSuggestList.innerHTML = list.map((item, index) => {
        const title = String(item.title || item.fileName || item.id || '');
        const hit = String(item.subtitleHitText || '').trim();
        return `
          <button type="button" class="search-suggest-item" data-index="${index}">
            <strong>${highlightSuggestText(title, query)}</strong>
            <span>${highlightSuggestText(hit || title, query)}</span>
          </button>
        `;
      }).join('');
      subtitleSuggestList.classList.remove('hidden');
    }

    async function requestSubtitleSuggestions() {
      const query = String(subtitleQueryInput?.value || '').trim();
      if (query.length < 2) {
        hideSubtitleSuggestions();
        return;
      }
      const selectedTypes = assetTypeFilters
        .filter((el) => el.checked)
        .map((el) => String(el.value || '').toLowerCase())
        .filter(Boolean);
      if (!selectedTypes.length) {
        hideSubtitleSuggestions();
        return;
      }
      const filters = serializeForm(searchForm);
      const reqId = ++subtitleSuggestReqSeq;
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', '8');
      params.set('trash', normalizeTrashScopeForSuggest(filters.trash));
      if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      if (String(filters.type || '').trim()) params.set('type', String(filters.type).trim());
      if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
      if (selectedTypes.length < assetTypeFilters.length) params.set('types', selectedTypes.join(','));
      try {
        const result = await api(`/api/assets/subtitle-suggest?${params.toString()}`);
        if (reqId !== subtitleSuggestReqSeq) return;
        renderSubtitleSuggestions(result, query);
      } catch (_error) {
        if (reqId !== subtitleSuggestReqSeq) return;
        hideSubtitleSuggestions();
      }
    }

    function queueSubtitleSuggestions() {
      if (subtitleSuggestTimer) clearTimeout(subtitleSuggestTimer);
      subtitleSuggestTimer = setTimeout(() => {
        requestSubtitleSuggestions().catch(() => {});
      }, 170);
    }

    function init() {
      searchQueryInput?.addEventListener('focus', () => {
        if (searchSuggestHideTimer) {
          clearTimeout(searchSuggestHideTimer);
          searchSuggestHideTimer = null;
        }
        queueSearchSuggestions();
      });

      ocrQueryInput?.addEventListener('focus', () => {
        if (ocrSuggestHideTimer) {
          clearTimeout(ocrSuggestHideTimer);
          ocrSuggestHideTimer = null;
        }
        queueOcrSuggestions();
      });

      subtitleQueryInput?.addEventListener('focus', () => {
        if (subtitleSuggestHideTimer) {
          clearTimeout(subtitleSuggestHideTimer);
          subtitleSuggestHideTimer = null;
        }
        queueSubtitleSuggestions();
      });

      searchQueryInput?.addEventListener('input', () => {
        updateClearSearchButtonState();
        queueSearchSuggestions();
      });

      ocrQueryInput?.addEventListener('input', () => {
        updateClearSearchButtonState();
        queueOcrSuggestions();
      });

      subtitleQueryInput?.addEventListener('input', () => {
        updateClearSearchButtonState();
        queueSubtitleSuggestions();
      });

      searchQueryInput?.addEventListener('blur', () => {
        if (searchSuggestHideTimer) clearTimeout(searchSuggestHideTimer);
        searchSuggestHideTimer = setTimeout(() => {
          hideSearchSuggestions();
          searchSuggestHideTimer = null;
        }, 120);
      });

      ocrQueryInput?.addEventListener('blur', () => {
        if (ocrSuggestHideTimer) clearTimeout(ocrSuggestHideTimer);
        ocrSuggestHideTimer = setTimeout(() => {
          hideOcrSuggestions();
          ocrSuggestHideTimer = null;
        }, 120);
      });

      subtitleQueryInput?.addEventListener('blur', () => {
        if (subtitleSuggestHideTimer) clearTimeout(subtitleSuggestHideTimer);
        subtitleSuggestHideTimer = setTimeout(() => {
          hideSubtitleSuggestions();
          subtitleSuggestHideTimer = null;
        }, 120);
      });

      searchQueryInput?.addEventListener('keydown', async (event) => {
        const isOpen = Boolean(searchSuggestList && !searchSuggestList.classList.contains('hidden'));
        if (event.key === 'Enter') {
          event.preventDefault();
          if (isOpen && searchSuggestActiveIndex >= 0 && searchSuggestItems[searchSuggestActiveIndex]) {
            await applySearchSuggestion(searchSuggestItems[searchSuggestActiveIndex], true);
          } else {
            await loadAssets();
          }
          return;
        }
        if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          queueSearchSuggestions();
          return;
        }
        if (!isOpen) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSearchSuggestionActive((searchSuggestActiveIndex < 0 ? -1 : searchSuggestActiveIndex) + 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSearchSuggestionActive((searchSuggestActiveIndex < 0 ? searchSuggestItems.length : searchSuggestActiveIndex) - 1);
          return;
        }
        if (event.key === 'Escape') {
          hideSearchSuggestions();
        }
      });

      ocrQueryInput?.addEventListener('keydown', async (event) => {
        const isOpen = Boolean(ocrSuggestList && !ocrSuggestList.classList.contains('hidden'));
        if (event.key === 'Enter') {
          event.preventDefault();
          if (isOpen && ocrSuggestActiveIndex >= 0 && ocrSuggestItems[ocrSuggestActiveIndex]) {
            await applyOcrSuggestion(ocrSuggestItems[ocrSuggestActiveIndex], true);
          } else {
            await loadAssets();
          }
          return;
        }
        if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          queueOcrSuggestions();
          return;
        }
        if (!isOpen) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOcrSuggestionActive((ocrSuggestActiveIndex < 0 ? -1 : ocrSuggestActiveIndex) + 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setOcrSuggestionActive((ocrSuggestActiveIndex < 0 ? ocrSuggestItems.length : ocrSuggestActiveIndex) - 1);
          return;
        }
        if (event.key === 'Escape') {
          hideOcrSuggestions();
        }
      });

      subtitleQueryInput?.addEventListener('keydown', async (event) => {
        const isOpen = Boolean(subtitleSuggestList && !subtitleSuggestList.classList.contains('hidden'));
        if (event.key === 'Enter') {
          event.preventDefault();
          if (isOpen && subtitleSuggestActiveIndex >= 0 && subtitleSuggestItems[subtitleSuggestActiveIndex]) {
            await applySubtitleSuggestion(subtitleSuggestItems[subtitleSuggestActiveIndex], true);
          } else {
            await loadAssets();
          }
          return;
        }
        if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          queueSubtitleSuggestions();
          return;
        }
        if (!isOpen) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSubtitleSuggestionActive((subtitleSuggestActiveIndex < 0 ? -1 : subtitleSuggestActiveIndex) + 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSubtitleSuggestionActive((subtitleSuggestActiveIndex < 0 ? subtitleSuggestItems.length : subtitleSuggestActiveIndex) - 1);
          return;
        }
        if (event.key === 'Escape') {
          hideSubtitleSuggestions();
        }
      });

      searchSuggestList?.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      ocrSuggestList?.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      subtitleSuggestList?.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });

      searchSuggestList?.addEventListener('click', async (event) => {
        const button = event.target.closest('.search-suggest-item');
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index >= searchSuggestItems.length) return;
        await applySearchSuggestion(searchSuggestItems[index], true);
      });

      ocrSuggestList?.addEventListener('click', async (event) => {
        const button = event.target.closest('.search-suggest-item');
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index >= ocrSuggestItems.length) return;
        await applyOcrSuggestion(ocrSuggestItems[index], true);
      });

      subtitleSuggestList?.addEventListener('click', async (event) => {
        const button = event.target.closest('.search-suggest-item');
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index >= subtitleSuggestItems.length) return;
        await applySubtitleSuggestion(subtitleSuggestItems[index], true);
      });
    }

    return {
      init,
      hideSearchSuggestions,
      hideOcrSuggestions,
      hideSubtitleSuggestions,
      queueSearchSuggestions,
      queueOcrSuggestions,
      queueSubtitleSuggestions,
      applySearchSuggestion,
      applyOcrSuggestion,
      applySubtitleSuggestion
    };
  }

  global.createMainSearchSuggestModule = createMainSearchSuggestModule;
})(window);
