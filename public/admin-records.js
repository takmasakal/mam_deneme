(function attachAdminRecordsModule(global) {
  function createAdminRecordsModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      highlightSuggestion,
      openTextEditorModal,
      userPermissionsSearchInput,
      userPermissionsPrincipalType,
      userPermissionsSearchButton,
      userPermissionsRows,
      userPermissionsMsg,
      userPermissionsPageSize,
      userPermissionsPrevPage,
      userPermissionsNextPage,
      userPermissionsPageInfo,
      ocrAdminSearchInput,
      ocrDeleteFileCheck,
      ocrRecordsRows,
      ocrRecordsMsg,
      runOcrAdminSearchBtn,
      ocrRecordsPrevPage,
      ocrRecordsNextPage,
      ocrRecordsPageInfo,
      subtitleAdminSearchInput,
      subtitleDeleteFileCheck,
      subtitleRecordsRows,
      subtitleRecordsMsg,
      subtitleRecordsPrevPage,
      subtitleRecordsNextPage,
      subtitleRecordsPageInfo,
      combinedSearchInput,
      combinedSearchLimit,
      runCombinedSearchBtn,
      combinedSearchRows,
      combinedSearchMsg
    } = deps || {};

    let ocrRecordsTimer = null;
    let subtitleRecordsTimer = null;
    let ocrRecordsPage = 1;
    let subtitleRecordsPage = 1;
    let ocrRecordsPagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
    let subtitleRecordsPagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
    let availableUserPermissions = [];
    let allUserPermissionUsers = [];
    let userPermissionsPage = 1;
    let userPermissionsPagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
    let userPermissionsMsgTimer = null;
    const RECORD_SEARCH_MIN_CHARS = 3;

    function setUserPermissionsMessage(message, options = {}) {
      if (!userPermissionsMsg) return;
      const text = String(message || '');
      userPermissionsMsg.textContent = text;
      if (userPermissionsMsgTimer) {
        clearTimeout(userPermissionsMsgTimer);
        userPermissionsMsgTimer = null;
      }
      if (!text || !options.autoClear) return;
      const timeoutMs = Math.max(800, Number(options.timeoutMs || 3200));
      userPermissionsMsgTimer = setTimeout(() => {
        if (userPermissionsMsg && userPermissionsMsg.textContent === text) {
          userPermissionsMsg.textContent = '';
        }
        userPermissionsMsgTimer = null;
      }, timeoutMs);
    }

    function notifyUserPermissionChange(username) {
      try {
        localStorage.setItem('mam.permissions.updated', JSON.stringify({
          username: String(username || '').trim().toLowerCase(),
          at: Date.now()
        }));
      } catch (_error) {
        // Best effort cross-tab permission refresh signal.
      }
    }

    function getUserPermissionSearchQuery() {
      return String(userPermissionsSearchInput?.value || '').trim().toLowerCase();
    }

    function getUserPermissionPrincipalType() {
      return String(userPermissionsPrincipalType?.value || 'user').trim() === 'group' ? 'group' : 'user';
    }

    function renderUserPermissionsPager() {
      const total = Number(userPermissionsPagination.total || 0);
      const page = Math.max(1, Number(userPermissionsPagination.page || 1));
      const totalPages = Math.max(1, Number(userPermissionsPagination.totalPages || 1));
      if (userPermissionsPageInfo) {
        userPermissionsPageInfo.textContent = t('page_info')
          .replace('{page}', String(page))
          .replace('{pages}', String(totalPages))
          .replace('{total}', String(total));
      }
      if (userPermissionsPrevPage) userPermissionsPrevPage.disabled = page <= 1;
      if (userPermissionsNextPage) userPermissionsNextPage.disabled = page >= totalPages;
    }

    function renderSimplePager(pagination, prevButton, nextButton, infoEl) {
      const total = Number(pagination?.total || 0);
      const page = Math.max(1, Number(pagination?.page || 1));
      const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
      if (infoEl) {
        infoEl.textContent = t('page_info')
          .replace('{page}', String(page))
          .replace('{pages}', String(totalPages))
          .replace('{total}', String(total));
      }
      if (prevButton) prevButton.disabled = page <= 1;
      if (nextButton) nextButton.disabled = page >= totalPages;
    }

    function renderOcrRecordsPager() {
      renderSimplePager(ocrRecordsPagination, ocrRecordsPrevPage, ocrRecordsNextPage, ocrRecordsPageInfo);
    }

    function renderSubtitleRecordsPager() {
      renderSimplePager(subtitleRecordsPagination, subtitleRecordsPrevPage, subtitleRecordsNextPage, subtitleRecordsPageInfo);
    }

    function getRecordSearchQuery(input) {
      const q = String(input?.value || '').trim();
      return q.length >= RECORD_SEARCH_MIN_CHARS ? q : '';
    }

    function hasPendingRecordSearchQuery(input) {
      const q = String(input?.value || '').trim();
      return q.length > 0 && q.length < RECORD_SEARCH_MIN_CHARS;
    }

    function formatPermissionLabel(definition) {
      const labelKey = String(definition?.labelKey || '').trim();
      if (labelKey && labelKey !== 'undefined') {
        const translated = t(labelKey);
        if (translated && translated !== labelKey) return translated;
      }
      const key = String(definition?.key || '').trim();
      if (!key) return '';
      return key
        .split(/[._-]+/)
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
        .join(' ');
    }

    function renderUserPermissions(users, definitions = []) {
      if (!userPermissionsRows) return;
      const list = Array.isArray(users) ? users : [];
      const defs = Array.isArray(definitions) && definitions.length
        ? definitions
        : [
          { key: 'admin.access', legacyField: 'adminPageAccess', labelKey: 'perm_admin_access' },
          { key: 'metadata.edit', legacyField: 'metadataEdit', labelKey: 'perm_metadata_edit' },
          { key: 'office.edit', legacyField: 'officeEdit', labelKey: 'perm_office_edit' },
          { key: 'asset.delete', legacyField: 'assetDelete', labelKey: 'perm_asset_delete' },
          { key: 'pdf.advanced', legacyField: 'pdfAdvancedTools', labelKey: 'perm_pdf_advanced' },
          { key: 'text.admin', legacyField: 'textAdminAccess', labelKey: 'perm_text_admin' },
          { key: 'document.rights.admin', legacyField: 'documentRightsAdminAccess', labelKey: 'perm_document_rights_admin' }
        ];
      if (!list.length) {
        userPermissionsRows.innerHTML = `<div class="empty">${escapeHtml(t(getUserPermissionSearchQuery().length >= 2 ? 'user_search_no_match' : 'user_search_required'))}</div>`;
        return;
      }
      const principalType = getUserPermissionPrincipalType();
      userPermissionsRows.innerHTML = list.map((user) => {
        const uname = escapeHtml(user.username || '');
        const displayName = String(user.displayName || '').trim();
        const email = String(user.email || '').trim();
        const meta = principalType === 'group'
          ? [user.path || displayName || t('principal_type_group')].filter(Boolean).join(' · ')
          : [displayName, email].filter(Boolean).join(' · ');
        const activeKeys = new Set(Array.isArray(user.permissionKeys) ? user.permissionKeys : []);
        const inheritedKeys = new Set(Array.isArray(user.inheritedPermissionKeys) ? user.inheritedPermissionKeys : []);
        const explicitKeys = new Set(Array.isArray(user.explicitPermissionKeys) ? user.explicitPermissionKeys : []);
        const assetDerivedKeys = new Set(Array.isArray(user.assetDerivedPermissionKeys) ? user.assetDerivedPermissionKeys : []);
        const deniedKeys = new Set(Array.isArray(user.deniedPermissionKeys) ? user.deniedPermissionKeys : []);
        const inheritedPayload = escapeHtml(encodeURIComponent(JSON.stringify(Array.from(inheritedKeys))));
        const explicitPayload = escapeHtml(encodeURIComponent(JSON.stringify(Array.from(explicitKeys))));
        const checkboxes = defs.map((definition) => {
          const checked = activeKeys.has(definition.key) || Boolean(user?.[definition.legacyField]);
          const sourceLabel = principalType === 'user' && assetDerivedKeys.has(definition.key)
            ? `<small class="perm-source">${escapeHtml(t('perm_source_asset'))}</small>`
            : principalType === 'user' && inheritedKeys.has(definition.key)
            ? `<small class="perm-source">${escapeHtml(t('perm_source_inherited'))}</small>`
            : '';
          const deniedLabel = principalType === 'user' && deniedKeys.has(definition.key)
            ? `<small class="perm-denied">${escapeHtml(t('perm_source_denied'))}</small>`
            : '';
          return `
            <label class="perm-option">
              <input
                type="checkbox"
                class="perm-checkbox"
                data-permission-key="${escapeHtml(definition.key)}"
                ${checked ? 'checked' : ''}
              />
              <span>${escapeHtml(formatPermissionLabel(definition))}${sourceLabel}${deniedLabel}</span>
            </label>
          `;
        }).join('');
        return `
          <div
            class="row user-perm-row"
            data-username="${uname}"
            data-inherited-permission-keys="${inheritedPayload}"
            data-explicit-permission-keys="${explicitPayload}"
          >
            <div class="user-perm-identity">
              <strong>${uname}</strong>
              ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
            </div>
            <div class="user-perm-options">
              ${checkboxes}
            </div>
            <button type="button" class="perm-save-btn">${escapeHtml(t('save_settings'))}</button>
          </div>
        `;
      }).join('');

      userPermissionsRows.querySelectorAll('.perm-save-btn').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
          const rowEl = event.currentTarget.closest('.user-perm-row');
          const username = rowEl?.dataset?.username || '';
          if (!username) return;
          const permissionKeys = Array.from(rowEl.querySelectorAll('.perm-checkbox:checked'))
            .map((input) => String(input?.dataset?.permissionKey || '').trim())
            .filter(Boolean);
          let deniedPermissionKeys = [];
          let savedPermissionKeys = permissionKeys;
          if (getUserPermissionPrincipalType() !== 'group') {
            let inheritedKeys = [];
            let explicitKeys = [];
            try {
              inheritedKeys = JSON.parse(decodeURIComponent(rowEl?.dataset?.inheritedPermissionKeys || '%5B%5D'));
            } catch (_error) {
              inheritedKeys = [];
            }
            try {
              explicitKeys = JSON.parse(decodeURIComponent(rowEl?.dataset?.explicitPermissionKeys || '%5B%5D'));
            } catch (_error) {
              explicitKeys = [];
            }
            const selected = new Set(permissionKeys);
            const inherited = new Set(Array.isArray(inheritedKeys) ? inheritedKeys : []);
            const explicit = new Set(Array.isArray(explicitKeys) ? explicitKeys : []);
            deniedPermissionKeys = Array.from(inherited).filter((key) => !selected.has(key));
            savedPermissionKeys = permissionKeys.filter((key) => !inherited.has(key) || explicit.has(key));
          }
          btn.disabled = true;
          try {
            const endpoint = getUserPermissionPrincipalType() === 'group'
              ? `/api/admin/group-permissions/${encodeURIComponent(username)}`
              : `/api/admin/user-permissions/${encodeURIComponent(username)}`;
            const legacySourceKeys = getUserPermissionPrincipalType() === 'group' ? permissionKeys : savedPermissionKeys;
            const legacyFlags = Object.fromEntries(
              (availableUserPermissions || []).map((definition) => [
                definition.legacyField,
                legacySourceKeys.includes(definition.key)
              ])
            );
            await api(endpoint, {
              method: 'PATCH',
              body: JSON.stringify({ permissionKeys: savedPermissionKeys, deniedPermissionKeys, ...legacyFlags })
            });
            notifyUserPermissionChange(username);
            await loadUserPermissions();
            setUserPermissionsMessage(t('user_permissions_saved'), { autoClear: true });
          } catch (error) {
            setUserPermissionsMessage(String(error.message || 'Request failed'));
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    async function loadUserPermissions() {
      const params = new URLSearchParams();
      const q = getUserPermissionSearchQuery();
      const limit = Number(userPermissionsPageSize?.value || 20) === 50 ? 50 : 20;
      if (q.length < 2) {
        userPermissionsPagination = { page: 1, limit, total: 0, totalPages: 1 };
        renderUserPermissions([], availableUserPermissions);
        renderUserPermissionsPager();
        return;
      }
      params.set('q', q);
      params.set('principalType', getUserPermissionPrincipalType());
      params.set('limit', String(limit));
      params.set('page', String(Math.max(1, userPermissionsPage)));
      const result = await api(`/api/admin/user-permissions?${params.toString()}`);
      availableUserPermissions = Array.isArray(result.availablePermissions) ? result.availablePermissions : [];
      allUserPermissionUsers = Array.isArray(result.users) ? result.users : [];
      userPermissionsPagination = result.pagination || { page: userPermissionsPage, limit, total: allUserPermissionUsers.length, totalPages: 1 };
      userPermissionsPage = Number(userPermissionsPagination.page || userPermissionsPage);
      renderUserPermissions(allUserPermissionUsers, availableUserPermissions);
      renderUserPermissionsPager();
    }

    function refreshUserPermissionSearch() {
      userPermissionsPage = 1;
      loadUserPermissions().catch((error) => {
        setUserPermissionsMessage(String(error.message || 'Request failed'));
      });
    }

    userPermissionsSearchInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      refreshUserPermissionSearch();
    });

    userPermissionsSearchButton?.addEventListener('click', () => {
      refreshUserPermissionSearch();
    });

    userPermissionsPrincipalType?.addEventListener('change', () => {
      refreshUserPermissionSearch();
    });

    userPermissionsPageSize?.addEventListener('change', () => {
      userPermissionsPage = 1;
      loadUserPermissions().catch((error) => {
        setUserPermissionsMessage(String(error.message || 'Request failed'));
      });
    });

    userPermissionsPrevPage?.addEventListener('click', () => {
      userPermissionsPage = Math.max(1, userPermissionsPage - 1);
      loadUserPermissions().catch((error) => {
        setUserPermissionsMessage(String(error.message || 'Request failed'));
      });
    });

    userPermissionsNextPage?.addEventListener('click', () => {
      userPermissionsPage += 1;
      loadUserPermissions().catch((error) => {
        setUserPermissionsMessage(String(error.message || 'Request failed'));
      });
    });

    function renderOcrRecords(records) {
      if (!ocrRecordsRows) return;
      const list = Array.isArray(records) ? records : [];
      if (!list.length) {
        ocrRecordsRows.innerHTML = `<div class="row"><span>${escapeHtml(t('ocr_none'))}</span></div>`;
        return;
      }
      const groups = new Map();
      list.forEach((item) => {
        const assetId = String(item.assetId || '').trim();
        if (!assetId) return;
        if (!groups.has(assetId)) {
          groups.set(assetId, {
            assetId,
            assetTitle: String(item.assetTitle || item.fileName || item.assetId || '').trim(),
            assetType: String(item.type || '').trim().toLowerCase(),
            items: []
          });
        }
        groups.get(assetId).items.push(item);
      });
      ocrRecordsRows.innerHTML = Array.from(groups.values()).map((group) => {
        const options = group.items.map((item, index) => `
          <option
            value="${escapeHtml(item.itemId || '')}"
            data-label="${escapeHtml(item.ocrLabel || '')}"
            data-engine="${escapeHtml(item.ocrEngine || '-')}"
            data-lines="${escapeHtml(String(item.lineCount || 0))}"
            data-segments="${escapeHtml(String(item.segmentCount || 0))}"
            data-kind="${escapeHtml(item.ocrKind || '')}"
            ${index === 0 ? 'selected' : ''}
          >${escapeHtml(item.ocrLabel || item.itemId || 'ocr')}</option>
        `).join('');
        const first = group.items[0] || {};
        return `
          <div class="row ocr-row" data-asset-id="${escapeHtml(group.assetId)}">
            <div class="ocr-row-main">
              <strong>${escapeHtml(group.assetTitle || group.assetId)}</strong>
              <span class="ocr-selected-meta">${escapeHtml(t('ocr_engine'))}: ${escapeHtml(first.ocrEngine || '-')} | ${escapeHtml(t('ocr_lines'))}: ${escapeHtml(String(first.lineCount || 0))} | ${escapeHtml(t('ocr_segments'))}: ${escapeHtml(String(first.segmentCount || 0))}</span>
            </div>
            <select class="ocr-item-select">${options}</select>
            <input type="text" class="ocr-label-input" value="${escapeHtml(first.ocrLabel || '')}" />
            <button type="button" class="ocr-content-btn">${escapeHtml(t('content_edit'))}</button>
            <button type="button" class="ocr-save-btn">${escapeHtml(t('ocr_edit'))}</button>
            <button type="button" class="ocr-delete-btn">${escapeHtml(t('ocr_delete_db'))}</button>
          </div>
        `;
      }).join('');
    }

    function syncOcrRowSelection(rowEl) {
      if (!(rowEl instanceof Element)) return null;
      const selectEl = rowEl.querySelector('.ocr-item-select');
      if (!(selectEl instanceof HTMLSelectElement)) return null;
      const option = selectEl.selectedOptions?.[0];
      if (!option) return null;
      const itemId = String(option.value || '').trim();
      const label = String(option.dataset.label || '').trim();
      const engine = String(option.dataset.engine || '-').trim();
      const lines = String(option.dataset.lines || '0').trim();
      const segments = String(option.dataset.segments || '0').trim();
      const kind = String(option.dataset.kind || '').trim().toLowerCase();
      const labelInput = rowEl.querySelector('.ocr-label-input');
      const meta = rowEl.querySelector('.ocr-selected-meta');
      if (labelInput instanceof HTMLInputElement) labelInput.value = label;
      if (meta) meta.textContent = `${t('ocr_engine')}: ${engine} | ${t('ocr_lines')}: ${lines} | ${t('ocr_segments')}: ${segments}`;
      return { itemId, label, engine, lines, segments, kind };
    }

    async function loadOcrRecords() {
      if (!ocrRecordsRows) return;
      const q = getRecordSearchQuery(ocrAdminSearchInput);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('limit', '20');
      params.set('page', String(Math.max(1, ocrRecordsPage)));
      const result = await api(`/api/admin/ocr-records?${params.toString()}`);
      ocrRecordsPagination = result.pagination || { page: ocrRecordsPage, limit: 20, total: (result.records || []).length, totalPages: 1 };
      ocrRecordsPage = Math.max(1, Number(ocrRecordsPagination.page || ocrRecordsPage));
      renderOcrRecords(result.records || []);
      renderOcrRecordsPager();
    }

    function queueLoadOcrRecords() {
      if (ocrRecordsTimer) clearTimeout(ocrRecordsTimer);
      ocrRecordsTimer = setTimeout(() => {
        loadOcrRecords().catch((error) => {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      }, 180);
    }

    function renderSubtitleRecords(records) {
      if (!subtitleRecordsRows) return;
      const list = Array.isArray(records) ? records : [];
      if (!list.length) {
        subtitleRecordsRows.innerHTML = `<div class="row"><span>${escapeHtml(t('subtitle_records_none'))}</span></div>`;
        return;
      }
      const groups = new Map();
      list.forEach((item) => {
        const assetId = String(item.assetId || '').trim();
        if (!assetId) return;
        if (!groups.has(assetId)) {
          groups.set(assetId, {
            assetId,
            assetTitle: String(item.assetTitle || item.fileName || item.assetId || '').trim(),
            items: []
          });
        }
        groups.get(assetId).items.push(item);
      });
      subtitleRecordsRows.innerHTML = Array.from(groups.values()).map((group) => {
        const options = group.items.map((item, index) => `
          <option
            value="${escapeHtml(item.itemId || '')}"
            data-label="${escapeHtml(item.subtitleLabel || '')}"
            data-lang="${escapeHtml(item.subtitleLang || 'tr')}"
            data-active="${item.active ? '1' : '0'}"
            ${index === 0 ? 'selected' : ''}
          >${escapeHtml(item.subtitleLabel || 'subtitle')}${item.active ? ' (ACTIVE)' : ''}</option>
        `).join('');
        const first = group.items[0] || {};
        const firstLabel = String(first.subtitleLabel || '').trim();
        const firstLang = String(first.subtitleLang || 'tr').trim() || 'tr';
        const assetType = String(group.assetType || first.type || '').trim().toLowerCase();
        const audioRow = assetType === 'audio' || assetType === 'sound';
        return `
          <div class="row subtitle-row ${audioRow ? 'subtitle-row-audio' : 'subtitle-row-video'}" data-asset-id="${escapeHtml(group.assetId)}" data-asset-type="${escapeHtml(assetType)}">
            <div class="subtitle-row-main">
              <strong>${escapeHtml(group.assetTitle || group.assetId)}</strong>
              <span class="subtitle-selected-meta">${escapeHtml(firstLabel || 'subtitle')} | ${escapeHtml(t('subtitle_lang'))}: ${escapeHtml(firstLang)}${first.active ? ' | ACTIVE' : ''}</span>
            </div>
            <select class="subtitle-item-select">${options}</select>
            <input type="text" class="subtitle-label-input" value="${escapeHtml(firstLabel)}" />
            <input type="text" class="subtitle-lang-input" value="${escapeHtml(firstLang)}" />
            <button type="button" class="subtitle-content-btn">${escapeHtml(t('content_edit'))}</button>
            <button type="button" class="subtitle-set-active-btn">${escapeHtml(t('subtitle_set_active'))}</button>
            <button type="button" class="subtitle-save-btn">${escapeHtml(t('subtitle_save'))}</button>
            <button type="button" class="subtitle-delete-btn">${escapeHtml(t('subtitle_delete_db'))}</button>
          </div>
        `;
      }).join('');
    }

    function syncSubtitleRowSelection(rowEl) {
      if (!(rowEl instanceof Element)) return null;
      const selectEl = rowEl.querySelector('.subtitle-item-select');
      if (!(selectEl instanceof HTMLSelectElement)) return null;
      const option = selectEl.selectedOptions?.[0];
      if (!option) return null;
      const itemId = String(option.value || '').trim();
      const label = String(option.dataset.label || '').trim();
      const lang = String(option.dataset.lang || 'tr').trim() || 'tr';
      const active = String(option.dataset.active || '') === '1';
      const labelInput = rowEl.querySelector('.subtitle-label-input');
      const langInput = rowEl.querySelector('.subtitle-lang-input');
      const meta = rowEl.querySelector('.subtitle-selected-meta');
      if (labelInput instanceof HTMLInputElement) labelInput.value = label;
      if (langInput instanceof HTMLInputElement) langInput.value = lang;
      if (meta) meta.textContent = `${label || 'subtitle'} | ${t('subtitle_lang')}: ${lang}${active ? ' | ACTIVE' : ''}`;
      return { itemId, label, lang, active };
    }

    async function loadSubtitleRecords() {
      if (!subtitleRecordsRows) return;
      const q = getRecordSearchQuery(subtitleAdminSearchInput);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('limit', '20');
      params.set('page', String(Math.max(1, subtitleRecordsPage)));
      const result = await api(`/api/admin/subtitle-records?${params.toString()}`);
      subtitleRecordsPagination = result.pagination || { page: subtitleRecordsPage, limit: 20, total: (result.records || []).length, totalPages: 1 };
      subtitleRecordsPage = Math.max(1, Number(subtitleRecordsPagination.page || subtitleRecordsPage));
      renderSubtitleRecords(result.records || []);
      renderSubtitleRecordsPager();
    }

    function queueLoadSubtitleRecords() {
      if (subtitleRecordsTimer) clearTimeout(subtitleRecordsTimer);
      subtitleRecordsTimer = setTimeout(() => {
        loadSubtitleRecords().catch((error) => {
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      }, 180);
    }

    function renderCombinedSearch(results, query) {
      if (!combinedSearchRows) return;
      const list = Array.isArray(results) ? results : [];
      if (!list.length) {
        combinedSearchRows.innerHTML = `<div class="row"><span>${escapeHtml(t('combined_search_none'))}</span></div>`;
        return;
      }
      const q = String(query || '').trim();
      combinedSearchRows.innerHTML = list.map((item) => `
        <div class="row combined-row">
          <div class="combined-row-main">
            <strong>${escapeHtml(item.assetTitle || item.assetId || '')}</strong>
            <span>${escapeHtml(String(item.source || '').toUpperCase())} | TC ${escapeHtml(item.timecode || '00:00:00:00')} | ${escapeHtml(item.label || '-')}</span>
            <span>${highlightSuggestion(String(item.text || ''), q)}</span>
          </div>
        </div>
      `).join('');
    }

    async function runCombinedSearch() {
      if (!combinedSearchRows) return;
      const q = String(combinedSearchInput?.value || '').trim();
      if (!q) {
        renderCombinedSearch([], '');
        if (combinedSearchMsg) combinedSearchMsg.textContent = '';
        return;
      }
      const limit = Math.max(10, Math.min(500, Number(combinedSearchLimit?.value) || 120));
      if (combinedSearchMsg) combinedSearchMsg.textContent = `${t('loading')}...`;
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('limit', String(limit));
      const result = await api(`/api/admin/text-search?${params.toString()}`);
      renderCombinedSearch(result.results || [], q);
      if (combinedSearchMsg) combinedSearchMsg.textContent = `${(result.results || []).length} result(s)`;
    }

    function init() {
      ocrAdminSearchInput?.addEventListener('input', () => {
        ocrRecordsPage = 1;
        if (hasPendingRecordSearchQuery(ocrAdminSearchInput)) {
          if (ocrRecordsTimer) clearTimeout(ocrRecordsTimer);
          return;
        }
        queueLoadOcrRecords();
      });

      ocrAdminSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        try {
          if (hasPendingRecordSearchQuery(ocrAdminSearchInput)) return;
          ocrRecordsPage = 1;
          await loadOcrRecords();
        } catch (error) {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        }
      });

      runOcrAdminSearchBtn?.addEventListener('click', async () => {
        try {
          if (hasPendingRecordSearchQuery(ocrAdminSearchInput)) return;
          ocrRecordsPage = 1;
          await loadOcrRecords();
        } catch (error) {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        }
      });

      subtitleAdminSearchInput?.addEventListener('input', () => {
        subtitleRecordsPage = 1;
        if (hasPendingRecordSearchQuery(subtitleAdminSearchInput)) {
          if (subtitleRecordsTimer) clearTimeout(subtitleRecordsTimer);
          return;
        }
        queueLoadSubtitleRecords();
      });

      subtitleAdminSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        try {
          if (hasPendingRecordSearchQuery(subtitleAdminSearchInput)) return;
          subtitleRecordsPage = 1;
          await loadSubtitleRecords();
        } catch (error) {
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
        }
      });

      ocrRecordsPrevPage?.addEventListener('click', () => {
        ocrRecordsPage = Math.max(1, ocrRecordsPage - 1);
        loadOcrRecords().catch((error) => {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      });

      ocrRecordsNextPage?.addEventListener('click', () => {
        ocrRecordsPage += 1;
        loadOcrRecords().catch((error) => {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      });

      subtitleRecordsPrevPage?.addEventListener('click', () => {
        subtitleRecordsPage = Math.max(1, subtitleRecordsPage - 1);
        loadSubtitleRecords().catch((error) => {
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      });

      subtitleRecordsNextPage?.addEventListener('click', () => {
        subtitleRecordsPage += 1;
        loadSubtitleRecords().catch((error) => {
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
        });
      });

      ocrRecordsRows?.addEventListener('click', async (event) => {
        const rowEl = event.target.closest('.ocr-row');
        if (!rowEl) return;
        const assetId = String(rowEl.dataset.assetId || '').trim();
        const selected = syncOcrRowSelection(rowEl);
        const itemId = String(selected?.itemId || '').trim();
        if (!assetId || !itemId) return;

        if (event.target.closest('.ocr-content-btn')) {
          try {
            if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('content_loading');
            const readResult = await api(`/api/admin/ocr-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
            let mediaUrl = '';
            try {
              const assetDetail = await api(`/api/assets/${encodeURIComponent(assetId)}`);
              mediaUrl = String(assetDetail?.proxyUrl || assetDetail?.mediaUrl || '').trim();
            } catch (_error) {
              mediaUrl = '';
            }
            await openTextEditorModal({
              title: `${t('ocr_records')} - ${rowEl.querySelector('.ocr-row-main strong')?.textContent || assetId}`,
              content: String(readResult.content || ''),
              mediaUrl,
              previewMode: selected?.kind === 'photo' ? 'image' : 'video',
              onSave: async (nextContent) => {
                await api('/api/admin/ocr-records/content', {
                  method: 'PATCH',
                  body: JSON.stringify({ assetId, itemId, content: nextContent })
                });
                if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('content_saved');
                await loadOcrRecords();
              }
            });
          } catch (error) {
            if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
          }
          return;
        }

        if (event.target.closest('.ocr-save-btn')) {
          const nextLabel = String(rowEl.querySelector('.ocr-label-input')?.value || '').trim();
          if (!nextLabel) return;
          await api('/api/admin/ocr-records', {
            method: 'PATCH',
            body: JSON.stringify({ assetId, itemId, ocrLabel: nextLabel })
          });
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('ocr_saved');
          await loadOcrRecords();
          return;
        }

        if (event.target.closest('.ocr-delete-btn')) {
          if (!confirm(t('ocr_confirm_delete'))) return;
          await api('/api/admin/ocr-records', {
            method: 'DELETE',
            body: JSON.stringify({
              assetId,
              itemId,
              deleteFile: Boolean(ocrDeleteFileCheck?.checked)
            })
          });
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('ocr_deleted');
          await loadOcrRecords();
        }
      });

      ocrRecordsRows?.addEventListener('change', (event) => {
        const rowEl = event.target.closest('.ocr-row');
        if (!rowEl) return;
        if (event.target.closest('.ocr-item-select')) {
          syncOcrRowSelection(rowEl);
        }
      });

      subtitleRecordsRows?.addEventListener('click', async (event) => {
        const rowEl = event.target.closest('.subtitle-row');
        if (!rowEl) return;
        const assetId = String(rowEl.dataset.assetId || '').trim();
        const selected = syncSubtitleRowSelection(rowEl);
        const itemId = String(selected?.itemId || '').trim();
        if (!assetId || !itemId) return;

        const nextLabel = String(rowEl.querySelector('.subtitle-label-input')?.value || '').trim();
        const nextLang = String(rowEl.querySelector('.subtitle-lang-input')?.value || '').trim() || 'tr';

        if (event.target.closest('.subtitle-content-btn')) {
          try {
            if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('content_loading');
            const readResult = await api(`/api/admin/subtitle-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
            let mediaUrl = '';
            try {
              const assetDetail = await api(`/api/assets/${encodeURIComponent(assetId)}`);
              mediaUrl = String(assetDetail?.proxyUrl || assetDetail?.mediaUrl || '').trim();
            } catch (_error) {
              mediaUrl = '';
            }
            await openTextEditorModal({
              title: `${t('subtitle_records')} - ${rowEl.querySelector('.subtitle-row-main strong')?.textContent || assetId}`,
              content: String(readResult.content || ''),
              mediaUrl,
              previewMode: String(rowEl.dataset.assetType || '').toLowerCase() === 'audio' ? 'audio' : 'video',
              onSave: async (nextContent) => {
                await api('/api/admin/subtitle-records/content', {
                  method: 'PATCH',
                  body: JSON.stringify({ assetId, itemId, content: nextContent })
                });
                if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('content_saved');
                await loadSubtitleRecords();
              }
            });
          } catch (error) {
            if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
          }
          return;
        }

        if (event.target.closest('.subtitle-set-active-btn')) {
          if (!nextLabel) return;
          await api('/api/admin/subtitle-records', {
            method: 'PATCH',
            body: JSON.stringify({ assetId, itemId, subtitleLabel: nextLabel, subtitleLang: nextLang, setActive: true })
          });
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_saved');
          await loadSubtitleRecords();
          return;
        }

        if (event.target.closest('.subtitle-save-btn')) {
          if (!nextLabel) return;
          await api('/api/admin/subtitle-records', {
            method: 'PATCH',
            body: JSON.stringify({ assetId, itemId, subtitleLabel: nextLabel, subtitleLang: nextLang })
          });
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_saved');
          await loadSubtitleRecords();
          return;
        }

        if (event.target.closest('.subtitle-delete-btn')) {
          if (!confirm(t('subtitle_confirm_delete'))) return;
          await api('/api/admin/subtitle-records', {
            method: 'DELETE',
            body: JSON.stringify({
              assetId,
              itemId,
              deleteFile: Boolean(subtitleDeleteFileCheck?.checked)
            })
          });
          if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_deleted');
          await loadSubtitleRecords();
        }
      });

      subtitleRecordsRows?.addEventListener('change', (event) => {
        const rowEl = event.target.closest('.subtitle-row');
        if (!rowEl) return;
        if (event.target.closest('.subtitle-item-select')) {
          syncSubtitleRowSelection(rowEl);
        }
      });

      runCombinedSearchBtn?.addEventListener('click', async () => {
        try {
          await runCombinedSearch();
        } catch (error) {
          if (combinedSearchMsg) combinedSearchMsg.textContent = String(error.message || 'Request failed');
        }
      });

      combinedSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        try {
          await runCombinedSearch();
        } catch (error) {
          if (combinedSearchMsg) combinedSearchMsg.textContent = String(error.message || 'Request failed');
        }
      });
    }

    return {
      init,
      loadUserPermissions,
      loadOcrRecords,
      loadSubtitleRecords,
      runCombinedSearch
    };
  }

  global.createAdminRecordsModule = createAdminRecordsModule;
})(window);
