(function attachAdminRecordsModule(global) {
  function createAdminRecordsModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      highlightSuggestion,
      openTextEditorModal,
      userPermissionsRows,
      userPermissionsMsg,
      ocrAdminSearchInput,
      ocrDeleteFileCheck,
      ocrRecordsRows,
      ocrRecordsMsg,
      runOcrAdminSearchBtn,
      subtitleAdminSearchInput,
      subtitleDeleteFileCheck,
      subtitleRecordsRows,
      subtitleRecordsMsg,
      combinedSearchInput,
      combinedSearchLimit,
      runCombinedSearchBtn,
      combinedSearchRows,
      combinedSearchMsg
    } = deps || {};

    let ocrRecordsTimer = null;
    let subtitleRecordsTimer = null;
    let availableUserPermissions = [];

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
          { key: 'text.admin', legacyField: 'textAdminAccess', labelKey: 'perm_text_admin' }
        ];
      userPermissionsRows.innerHTML = list.map((user) => {
        const uname = escapeHtml(user.username || '');
        const activeKeys = new Set(Array.isArray(user.permissionKeys) ? user.permissionKeys : []);
        const checkboxes = defs.map((definition) => {
          const checked = activeKeys.has(definition.key) || Boolean(user?.[definition.legacyField]);
          return `
            <label class="perm-option">
              <input
                type="checkbox"
                class="perm-checkbox"
                data-permission-key="${escapeHtml(definition.key)}"
                ${checked ? 'checked' : ''}
              />
              <span>${escapeHtml(formatPermissionLabel(definition))}</span>
            </label>
          `;
        }).join('');
        return `
          <div class="row user-perm-row" data-username="${uname}">
            <div class="user-perm-identity">
              <strong>${uname}</strong>
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
          const legacyFlags = Object.fromEntries(
            (availableUserPermissions || []).map((definition) => [
              definition.legacyField,
              permissionKeys.includes(definition.key)
            ])
          );
          await api(`/api/admin/user-permissions/${encodeURIComponent(username)}`, {
            method: 'PATCH',
            body: JSON.stringify({ permissionKeys, ...legacyFlags })
          });
          if (userPermissionsMsg) userPermissionsMsg.textContent = t('user_permissions_saved');
        });
      });
    }

    async function loadUserPermissions() {
      const result = await api('/api/admin/user-permissions');
      availableUserPermissions = Array.isArray(result.availablePermissions) ? result.availablePermissions : [];
      renderUserPermissions(result.users || [], availableUserPermissions);
    }

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
      const labelInput = rowEl.querySelector('.ocr-label-input');
      const meta = rowEl.querySelector('.ocr-selected-meta');
      if (labelInput instanceof HTMLInputElement) labelInput.value = label;
      if (meta) meta.textContent = `${t('ocr_engine')}: ${engine} | ${t('ocr_lines')}: ${lines} | ${t('ocr_segments')}: ${segments}`;
      return { itemId, label, engine, lines, segments };
    }

    async function loadOcrRecords() {
      if (!ocrRecordsRows) return;
      const q = String(ocrAdminSearchInput?.value || '').trim();
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('limit', '800');
      const result = await api(`/api/admin/ocr-records?${params.toString()}`);
      renderOcrRecords(result.records || []);
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
        subtitleRecordsRows.innerHTML = `<div class="row"><span>${escapeHtml(t('subtitle_none'))}</span></div>`;
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
        return `
          <div class="row subtitle-row" data-asset-id="${escapeHtml(group.assetId)}">
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
      const q = String(subtitleAdminSearchInput?.value || '').trim();
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('limit', '1200');
      const result = await api(`/api/admin/subtitle-records?${params.toString()}`);
      renderSubtitleRecords(result.records || []);
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
        queueLoadOcrRecords();
      });

      ocrAdminSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        try {
          await loadOcrRecords();
        } catch (error) {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        }
      });

      runOcrAdminSearchBtn?.addEventListener('click', async () => {
        try {
          await loadOcrRecords();
        } catch (error) {
          if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
        }
      });

      subtitleAdminSearchInput?.addEventListener('input', () => {
        queueLoadSubtitleRecords();
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
              previewMode: 'video',
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
              previewMode: 'audio',
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
