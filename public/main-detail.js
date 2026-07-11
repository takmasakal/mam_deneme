(function attachMainDetailModule(global) {
  function createMainDetailModule(deps) {
    const {
      t,
      tf,
      api,
      deleteApi,
      escapeHtml,
      isImage,
      isVideo,
      isAudio,
      isOfficeDocument,
      mediaViewer,
      tagColorStyle,
      assetTagChipStyle,
      highlightMatch,
      dcHighlightSnippet,
      buildInlineFieldMatch,
      effectiveSearchHighlightClass,
      renderPdfChangeKindLabel,
      cleanVersionNoteText,
      formatDate,
      currentUserCanUsePdfAdvancedTools,
      currentUserCanEditOffice,
      currentUserIsSuperAdmin,
      currentUserCanAccessAdmin,
      currentUserCanDeleteAssets,
      currentUserCanDeleteAssetInUi,
      currentUserCanEditMetadata,
      currentUsername,
      currentSearchQuery,
      currentSearchHighlightQuery,
      currentSearchFuzzyUsed,
      currentAssets,
      selectedAssetIds,
      selectedAssetId,
      assetDetail,
      panelDetail,
      detailVideoPinned,
      setDetailVideoPinned,
      setPanelVisible,
      resetDetailPanelDynamicMinWidth,
      setSingleSelection,
      renderAssets,
      setPanelVideoToolsButtonState,
      loadAssets,
      openAsset,
      activePlayerCleanupRef,
      activeDetailPinCleanupRef
    } = deps || {};

    function getVersionSectionAccess(asset) {
      const assetIsPdf = String(asset?.mimeType || '').toLowerCase().includes('pdf');
      const assetIsOffice = isOfficeDocument(asset);
      const canEditMetadataAsset = Boolean(asset?.canEditAssetMetadata ?? asset?.canEditAsset);
      const canEditOfficeAsset = Boolean(asset?.canEditAssetOffice ?? asset?.canEditAsset);
      const canEditPdfAsset = Boolean(asset?.canEditAssetPdf ?? asset?.canEditAsset);
      const canEditThisAsset = Boolean(canEditMetadataAsset || canEditOfficeAsset || canEditPdfAsset);
      const canDownloadThisAsset = asset?.canDownloadAsset !== false;
      return {
        assetIsPdf,
        assetIsOffice,
        canDownloadAsset: canDownloadThisAsset,
        canViewVersions: Boolean(
          assetIsPdf
            ? (currentUserCanUsePdfAdvancedTools() || canEditPdfAsset)
            : assetIsOffice
              ? (currentUserCanEditOffice() || canEditOfficeAsset)
              : (currentUserCanAccessAdmin() || canEditThisAsset)
        ),
        canManageVersions: Boolean(
          assetIsPdf
            ? (currentUserCanUsePdfAdvancedTools() || canEditPdfAsset)
            : assetIsOffice
              ? (currentUserCanEditOffice() || canEditOfficeAsset)
              : (currentUserCanAccessAdmin() || canEditThisAsset)
        )
      };
    }

    function getVersionRowState(version, access) {
      const actionType = String(version?.actionType || 'manual').toLowerCase();
      const hasSnapshot = String(version?.snapshotMediaUrl || '').startsWith('/uploads/');
      const actorUsername = String(version?.actorUsername || '').trim().toLowerCase();
      const username = String(currentUsername() || '').trim().toLowerCase();
      const isOwnVersion = Boolean(username && actorUsername && username === actorUsername);
      const canEditOrDelete = Boolean(
        access.assetIsPdf
          ? ((currentUserCanUsePdfAdvancedTools() || access.canManageVersions) && (currentUserCanAccessAdmin() || isOwnVersion || access.canManageVersions))
          : access.assetIsOffice
            ? (currentUserCanEditOffice() || access.canManageVersions)
            : (currentUserCanAccessAdmin() || access.canManageVersions)
      );
      return {
        actionType,
        canRestorePdf: Boolean(access.canManageVersions && access.assetIsPdf && hasSnapshot),
        canRestoreOffice: Boolean(access.canManageVersions && access.assetIsOffice && hasSnapshot),
        canDownloadVersion: Boolean(hasSnapshot && access.canDownloadAsset),
        canEditVersion: canEditOrDelete,
        canDeleteVersion: canEditOrDelete
      };
    }

    function canDeleteAsset(asset) {
      if (typeof currentUserCanDeleteAssetInUi === 'function') {
        return currentUserCanDeleteAssetInUi(asset);
      }
      if (asset?.canDeleteAsset === true) return true;
      if (asset?.canDeleteAsset === false) return false;
      return Boolean(currentUserCanDeleteAssets());
    }

    function renderVersionRow(asset, version, access, interactive) {
      const rowState = getVersionRowState(version, access);
      if (rowState.actionType === 'pdf_original') return '';
      const changeKindLabel = rowState.actionType === 'pdf_save' ? renderPdfChangeKindLabel(version) : '';
      const cleanNote = cleanVersionNoteText(version.note);
      const rowClass = rowState.canRestorePdf ? 'version version-restorable' : 'version';
      const restoreAttr = rowState.canRestorePdf ? ` data-restore-version-id="${escapeHtml(version.versionId)}"` : '';
      const downloadButton = rowState.canDownloadVersion
        ? `<button type="button" class="downloadVersionBtn" data-version-id="${escapeHtml(version.versionId)}">${escapeHtml(t('download_version'))}</button>`
        : '';
      const actionBar = (interactive || downloadButton) ? `
        <div class="timecode-bar" style="margin-top:8px;">
          ${access.assetIsPdf ? `<button type="button" class="restorePdfVersionBtn" data-version-id="${escapeHtml(version.versionId)}" ${rowState.canRestorePdf ? '' : 'disabled'}>${escapeHtml(rowState.canRestorePdf ? t('restore_pdf_version') : t('restore_pdf_unavailable'))}</button>` : ''}
          ${access.assetIsOffice ? `<button type="button" class="restoreOfficeVersionBtn" data-version-id="${escapeHtml(version.versionId)}" ${rowState.canRestoreOffice ? '' : 'disabled'}>${escapeHtml(rowState.canRestoreOffice ? t('restore_office_version') : t('restore_pdf_unavailable'))}</button>` : ''}
          ${downloadButton}
          ${interactive ? `<button type="button" class="editVersionBtn" data-version-id="${escapeHtml(version.versionId)}" ${rowState.canEditVersion ? '' : 'disabled'}>${escapeHtml(t('edit_version_name'))}</button>` : ''}
          ${interactive && rowState.canDeleteVersion ? `<button type="button" class="deleteVersionBtn danger" data-version-id="${escapeHtml(version.versionId)}">${escapeHtml(t('delete_version'))}</button>` : ''}
        </div>
      ` : '';
      return `
        <div class="${rowClass}" data-version-id="${escapeHtml(version.versionId)}"${restoreAttr}>
          <strong>${escapeHtml(version.label)}</strong> - ${escapeHtml(cleanNote)}<br />
          <span class="asset-meta">${escapeHtml(formatDate(version.createdAt))}</span><br />
          <span class="asset-meta">${escapeHtml(t('version_action'))}: ${escapeHtml(t(`action_${rowState.actionType}`) || String(version.actionType || 'manual'))} | ${escapeHtml(t('version_actor'))}: ${escapeHtml(version.actorUsername || '-')}</span>
          ${changeKindLabel ? `<br /><span class="asset-meta">${escapeHtml(t('version_change_type'))}: ${escapeHtml(changeKindLabel)}</span>` : ''}
          ${actionBar}
        </div>
      `;
    }

    async function refreshAssetDetail(assetId, workflow) {
      await loadAssets();
      await openAsset(assetId, workflow);
    }

    function detailMarkup(asset, workflow) {
      const dc = asset.dcMetadata || {};
      const isImageAsset = Boolean(isImage?.(asset));
      const hasPlayableVideoProxy = isVideo(asset) && Boolean(String(asset.proxyUrl || '').trim());
      const trashStatus = asset.inTrash ? `<strong>${t('in_trash')}</strong>` : t('active');
      const searchHighlightClass = effectiveSearchHighlightClass(currentSearchQuery(), currentSearchHighlightQuery(), currentSearchFuzzyUsed());

      const viewerSection = isVideo(asset)
        ? `
          ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: false, includeSectionHide: true, includeClipSectionHide: false, includeAudioSectionHide: false, audioSideLayout: false, includeDetailPin: true })}
        `
        : `
          ${mediaViewer(asset)}
        `;

      const tagsMarkup = asset.tags.length
        ? `
          <div class="meta-label-row">
            <span class="meta-label-title">${escapeHtml(t('tags'))}</span>
            <div class="chips">
              ${asset.tags.map((tag) => `<button type="button" class="chip chip-tag-filter" data-chip-tag="${escapeHtml(tag)}" style="${tagColorStyle(tag)}">${highlightMatch(tag, currentSearchHighlightQuery(), searchHighlightClass)}</button>`).join('')}
            </div>
          </div>
        `
        : '';
      const canEditMetadata = Boolean(currentUserCanEditMetadata() || (asset.canEditAssetMetadata ?? asset.canEditAsset));
      const metadataLockNotice = canEditMetadata
        ? ''
        : `<div class="asset-meta metadata-lock-note">${escapeHtml(t('metadata_edit_locked'))}</div>`;
      const metadataFieldsetOpen = canEditMetadata ? '<fieldset class="metadata-fieldset">' : '<fieldset class="metadata-fieldset" disabled>';
      const durationSeconds = Number(asset.durationSeconds) || 0;
      const hasDuration = (isVideo(asset) || (typeof isAudio === 'function' && isAudio(asset))) && durationSeconds > 0;
      const durationMeta = hasDuration ? ` | ${t('duration')}: ${escapeHtml(durationSeconds)}s` : '';
      const durationField = hasDuration
        ? `<label>${t('duration')}<input name="durationSeconds" type="number" min="0" value="${escapeHtml(durationSeconds)}" />${buildInlineFieldMatch(`${durationSeconds}s`, currentSearchHighlightQuery(), searchHighlightClass)}</label>`
        : '';
      const accessListText = (values) => (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');
      const visibilityOptions = ['private', 'group', 'groups', 'public']
        .map((visibility) => `<option value="${escapeHtml(visibility)}" ${visibility === String(asset.visibility || 'public') ? 'selected' : ''}>${escapeHtml(t(`visibility_${visibility}`))}</option>`)
        .join('');
      const visibilitySection = Boolean(currentUserIsSuperAdmin?.() && asset.canManageVisibility) ? `
        <form id="assetVisibilityForm" class="inline-grid">
          <h4>${escapeHtml(t('asset_visibility'))}</h4>
          <div class="dc-grid">
            <label>${escapeHtml(t('asset_visibility'))}<select name="visibility">${visibilityOptions}</select></label>
            <label>${escapeHtml(t('owner_groups'))}<input value="${escapeHtml(accessListText(asset.ownerGroups))}" disabled /></label>
            <label>${escapeHtml(t('allowed_groups'))}<input name="allowedGroups" value="${escapeHtml(accessListText(asset.allowedGroups))}" placeholder="group-a, group-b" /></label>
            <label>${escapeHtml(t('allowed_users'))}<input name="allowedUsers" value="${escapeHtml(accessListText(asset.allowedUsers))}" placeholder="user-a, user-b" /></label>
            <label>${escapeHtml(t('denied_groups'))}<input name="deniedGroups" value="${escapeHtml(accessListText(asset.deniedGroups))}" placeholder="group-a, group-b" /></label>
            <label>${escapeHtml(t('denied_users'))}<input name="deniedUsers" value="${escapeHtml(accessListText(asset.deniedUsers))}" placeholder="user-a, user-b" /></label>
            <label>${escapeHtml(t('edit_allowed_groups'))}<input name="editAllowedGroups" value="${escapeHtml(accessListText(asset.editAllowedGroups))}" placeholder="group-a, group-b" /></label>
            <label>${escapeHtml(t('edit_allowed_users'))}<input name="editAllowedUsers" value="${escapeHtml(accessListText(asset.editAllowedUsers))}" placeholder="user-a, user-b" /></label>
            <label>${escapeHtml(t('edit_denied_groups'))}<input name="editDeniedGroups" value="${escapeHtml(accessListText(asset.editDeniedGroups))}" placeholder="group-a, group-b" /></label>
            <label>${escapeHtml(t('edit_denied_users'))}<input name="editDeniedUsers" value="${escapeHtml(accessListText(asset.editDeniedUsers))}" placeholder="user-a, user-b" /></label>
          </div>
          <button type="submit">${escapeHtml(t('save_visibility'))}</button>
        </form>
      ` : '';

      const metadataTopSection = `
        <h3>${highlightMatch(asset.title, currentSearchHighlightQuery(), searchHighlightClass)}</h3>
        <p>${highlightMatch(asset.description || t('no_description'), currentSearchHighlightQuery(), searchHighlightClass)}</p>
        <div class="asset-meta">${t('owner')}: ${highlightMatch(asset.owner, currentSearchHighlightQuery(), searchHighlightClass)} | ${t('type')}: ${highlightMatch(asset.type, currentSearchHighlightQuery(), searchHighlightClass)}${durationMeta}</div>
        <div class="asset-meta">${t('trash')}: ${trashStatus}</div>
        ${dcHighlightSnippet(asset, currentSearchHighlightQuery(), searchHighlightClass) ? `<div class="asset-meta dc-hit-row">${dcHighlightSnippet(asset, currentSearchHighlightQuery(), searchHighlightClass)}</div>` : ''}
        ${tagsMarkup}
        <div class="timecode-bar">
          ${asset.mediaUrl && asset.canDownloadAsset !== false ? `<button type="button" id="downloadAssetBtn">${t('download_asset')}</button>` : ''}
          ${currentUserCanAccessAdmin() && asset.canDownloadAsset !== false && isVideo(asset) && asset.proxyUrl ? `<button type="button" id="downloadProxyBtn">${t('download_proxy')}</button>` : ''}
          ${canDeleteAsset(asset) && !asset.inTrash ? `<button type="button" id="moveToTrashBtn" class="danger">${t('delete_asset')}</button>` : ''}
          ${canDeleteAsset(asset) && asset.inTrash ? `<button type="button" id="restoreAssetBtn">${t('restore')}</button><button type="button" id="deleteAssetBtn" class="danger">${t('delete_permanent')}</button>` : ''}
        </div>
        ${isVideo(asset) ? `
          <div class="tech-info-box">
            <h4>${t('technical_info')}</h4>
            <div id="assetTechnicalInfoBody" class="asset-meta">${t('tech_loading')}</div>
          </div>
        ` : ''}

        <form id="editForm" class="inline-grid">
          <h4>${t('edit_metadata')}</h4>
          ${metadataLockNotice}
          ${metadataFieldsetOpen}
            <label>${t('title')}<input name="title" value="${escapeHtml(asset.title)}" required />${buildInlineFieldMatch(asset.title, currentSearchHighlightQuery(), searchHighlightClass)}</label>
            <label>${t('owner')}<input name="owner" value="${escapeHtml(asset.owner)}" required />${buildInlineFieldMatch(asset.owner, currentSearchHighlightQuery(), searchHighlightClass)}</label>
            <label>${t('tags')}<input name="tags" value="${escapeHtml(asset.tags.join(', '))}" placeholder="${escapeHtml(t('ph_inline_tags'))}" />${buildInlineFieldMatch(asset.tags.join(', '), currentSearchHighlightQuery(), searchHighlightClass)}</label>
            <label>${t('description')}<textarea name="description">${escapeHtml(asset.description || '')}</textarea>${buildInlineFieldMatch(asset.description || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
            ${durationField}
            <h4>${t('dublin_core')}</h4>
            <div class="dc-grid">
              <label>${t('dc_title')}<input name="dcTitle" value="${escapeHtml(dc.title || '')}" />${buildInlineFieldMatch(dc.title || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_creator')}<input name="dcCreator" value="${escapeHtml(dc.creator || '')}" />${buildInlineFieldMatch(dc.creator || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_subject')}<input name="dcSubject" value="${escapeHtml(dc.subject || '')}" />${buildInlineFieldMatch(dc.subject || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_description')}<textarea name="dcDescription">${escapeHtml(dc.description || '')}</textarea>${buildInlineFieldMatch(dc.description || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_publisher')}<input name="dcPublisher" value="${escapeHtml(dc.publisher || '')}" />${buildInlineFieldMatch(dc.publisher || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_contributor')}<input name="dcContributor" value="${escapeHtml(dc.contributor || '')}" />${buildInlineFieldMatch(dc.contributor || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_date')}<input name="dcDate" value="${escapeHtml(dc.date || '')}" />${buildInlineFieldMatch(dc.date || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_type')}<input name="dcType" value="${escapeHtml(dc.type || '')}" />${buildInlineFieldMatch(dc.type || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_format')}<input name="dcFormat" value="${escapeHtml(dc.format || '')}" />${buildInlineFieldMatch(dc.format || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_identifier')}<input name="dcIdentifier" value="${escapeHtml(dc.identifier || '')}" />${buildInlineFieldMatch(dc.identifier || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_source')}<input name="dcSource" value="${escapeHtml(dc.source || '')}" />${buildInlineFieldMatch(dc.source || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_language')}<input name="dcLanguage" value="${escapeHtml(dc.language || '')}" />${buildInlineFieldMatch(dc.language || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_relation')}<input name="dcRelation" value="${escapeHtml(dc.relation || '')}" />${buildInlineFieldMatch(dc.relation || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_coverage')}<input name="dcCoverage" value="${escapeHtml(dc.coverage || '')}" />${buildInlineFieldMatch(dc.coverage || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
              <label>${t('dc_rights')}<input name="dcRights" value="${escapeHtml(dc.rights || '')}" />${buildInlineFieldMatch(dc.rights || '', currentSearchHighlightQuery(), searchHighlightClass)}</label>
            </div>
            <button type="submit">${t('save_metadata')}</button>
          </fieldset>
        </form>

        ${visibilitySection}
      `;

      const versionAccess = getVersionSectionAccess(asset);
      const { assetIsPdf, assetIsOffice, canViewVersions, canManageVersions } = versionAccess;
      const versionSection = canManageVersions ? `
        <form id="versionForm" class="inline-grid">
          <h4>${t('add_version')}</h4>
          <input name="label" placeholder="${escapeHtml(t('ph_version_label'))}" />
          <input name="note" placeholder="${t('what_changed')}" />
          <button type="submit">${t('create_version')}</button>
        </form>

        <h4>${t('versions')}</h4>
        ${(
          (currentUserCanUsePdfAdvancedTools() || (asset.canEditAssetPdf ?? asset.canEditAsset))
          && asset.canDownloadAsset !== false
          && assetIsPdf
        ) ? `
          <div class="timecode-bar" style="margin: 0 0 8px 0;">
            <button type="button" id="restorePdfOriginalBtn">${escapeHtml(t('restore_pdf_original'))}</button>
            <button type="button" id="downloadPdfOriginalBtn">${escapeHtml(t('download_pdf_original'))}</button>
          </div>
        ` : ''}
        ${(
          (currentUserCanEditOffice() || (asset.canEditAssetOffice ?? asset.canEditAsset))
	          && asset.canDownloadAsset !== false
	          && assetIsOffice
        ) ? `
          <div class="timecode-bar" style="margin: 0 0 8px 0;">
            <button type="button" id="restoreOfficeOriginalBtn">${escapeHtml(t('restore_office_original'))}</button>
            <button type="button" id="downloadOfficeOriginalBtn">${escapeHtml(t('download_office_original'))}</button>
          </div>
        ` : ''}
        <div id="assetVersionsList">
        ${asset.versions.map((v) => renderVersionRow(asset, v, versionAccess, true)).join('')}
        </div>
      ` : (canViewVersions ? `
        <h4>${t('versions')}</h4>
        <div id="assetVersionsList">
        ${asset.versions.map((v) => renderVersionRow(asset, v, versionAccess, false)).join('')}
        </div>
      ` : '');

      const metadataSection = `
        ${isVideo(asset) ? metadataTopSection : viewerSection}
        ${isVideo(asset) ? (!hasPlayableVideoProxy ? `<div class="asset-meta proxy-warning-box">${viewerSection}</div>` : '') : metadataTopSection}
        ${versionSection}
      `;

      if (hasPlayableVideoProxy) {
        return `
          <div class="detail-video-layout">
            <div class="detail-video-fixed">${viewerSection}</div>
            <div class="detail-video-meta">${metadataSection}</div>
          </div>
        `;
      }

      return `${metadataSection}`;
    }

    function multiSelectionDetailMarkup(selectedAssets) {
      return `
        <h3>${escapeHtml(t('multi_selected'))}</h3>
        <div class="asset-meta">${escapeHtml(t('selected_count'))}: <strong>${selectedAssets.length}</strong></div>
        <div class="bulk-box">
          <div class="chips">
            ${selectedAssets.slice(0, 40).map((asset) => `<span class="chip multi-chip" style="${assetTagChipStyle(asset)}">${escapeHtml(asset.title)}</span>`).join('')}
          </div>
          <div class="timecode-bar">
            ${selectedAssets.some((asset) => canDeleteAsset(asset)) ? `<button type="button" id="bulkDeleteBtn">${escapeHtml(t('bulk_delete_selected'))}</button>` : ''}
            <button type="button" id="bulkClearBtn">${escapeHtml(t('bulk_clear_selection'))}</button>
          </div>
        </div>
      `;
    }

    async function openMultiSelectionDetail() {
      const selectedAssets = currentAssets().filter((asset) => selectedAssetIds().has(asset.id));
      if (selectedAssets.length <= 1) return false;

      setPanelVisible('panelDetail', true);
      if (activePlayerCleanupRef.get()) {
        activePlayerCleanupRef.get()();
        activePlayerCleanupRef.set(null);
      }
      if (activeDetailPinCleanupRef.get()) {
        activeDetailPinCleanupRef.get()();
        activeDetailPinCleanupRef.set(null);
      }
      clearDetailHeaderTimecode();
      resetDetailPanelDynamicMinWidth();
      assetDetail().classList.remove('detail-video-pinned');
      panelDetail()?.classList.remove('panel-video-detail');

      assetDetail().innerHTML = multiSelectionDetailMarkup(selectedAssets);
      assetDetail().classList.remove('video-detail-mode');
      const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
      const bulkClearBtn = document.getElementById('bulkClearBtn');

      bulkDeleteBtn?.addEventListener('click', async () => {
        const ids = currentAssets()
          .filter((asset) => selectedAssetIds().has(asset.id) && canDeleteAsset(asset))
          .map((asset) => asset.id);
        if (!ids.length) return;
        const ok = confirm(tf('bulk_delete_confirm', { count: ids.length }));
        if (!ok) return;

        for (const id of ids) {
          try {
            await deleteApi(`/api/assets/${id}`);
          } catch (_error) {
          }
        }
        setSingleSelection(null);
        assetDetail().textContent = t('select_asset');
        assetDetail().classList.remove('video-detail-mode');
        panelDetail()?.classList.remove('panel-video-detail');
        setPanelVideoToolsButtonState(false);
        await loadAssets();
      });

      bulkClearBtn?.addEventListener('click', () => {
        setSingleSelection(null);
        renderAssets(currentAssets());
        assetDetail().textContent = t('select_asset');
        assetDetail().classList.remove('video-detail-mode');
        panelDetail()?.classList.remove('panel-video-detail');
        setPanelVideoToolsButtonState(false);
      });

      return true;
    }

    function clearDetailHeaderTimecode() {
      const slot = document.getElementById('panelDetailTcSlot');
      if (!slot) return;
      slot.innerHTML = '';
      slot.classList.add('hidden');
    }

    function syncDetailHeaderTimecode(root = document) {
      const slot = document.getElementById('panelDetailTcSlot');
      if (!slot) return;
      slot.innerHTML = '';
      const tcEl = root.querySelector('.viewer-head .viewer-tc');
      if (!tcEl) {
        slot.classList.add('hidden');
        return;
      }
      slot.appendChild(tcEl);
      slot.classList.remove('hidden');
    }

    function scrollElementIntoContainerView(container, element, align = 0.38, offsetTop = 0) {
      if (!(container instanceof Element) || !(element instanceof Element)) return;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const targetTop = container.scrollTop + (elementRect.top - containerRect.top) - (container.clientHeight * align) - Math.max(0, Number(offsetTop) || 0);
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }

    function scrollDetailPanelToVideoTop(root = assetDetail()) {
      if (!(root instanceof Element)) return;
      const target = root.querySelector('.detail-video-fixed') || root.querySelector('.viewer-shell') || root.querySelector('#assetMediaEl');
      if (!(target instanceof Element)) return;
      requestAnimationFrame(() => {
        const rootRect = root.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetTop = root.scrollTop + (targetRect.top - rootRect.top) - 4;
        if (Math.abs(root.scrollTop - targetTop) < 12) return;
        root.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      });
    }

    function seekOpenDetailMedia(assetId, startAtSeconds) {
      const targetAssetId = String(assetId || '').trim();
      const mediaEl = assetDetail()?.querySelector('#assetMediaEl');
      if (!targetAssetId || !(mediaEl instanceof HTMLMediaElement)) return false;
      const currentAssetId = String(mediaEl.dataset?.assetId || selectedAssetId() || '').trim();
      if (currentAssetId !== targetAssetId) return false;
      const targetSec = Math.max(0, Number(startAtSeconds) || 0);
      try {
        const maxSec = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 ? Math.min(targetSec, mediaEl.duration) : targetSec;
        mediaEl.currentTime = maxSec;
        scrollDetailPanelToVideoTop(assetDetail());
        return true;
      } catch (_error) {
        return false;
      }
    }

    function focusCutRowInDetail(root = document, cutId = '') {
      const targetCutId = String(cutId || '').trim();
      if (!targetCutId || !(root instanceof Element)) return;
      let wasPinned = detailVideoPinned() || root.classList.contains('detail-video-pinned');
      if (wasPinned) {
        const pinBtn = root.querySelector('#detailVideoPinBtn');
        if (pinBtn instanceof HTMLButtonElement) {
          pinBtn.click();
        } else {
          setDetailVideoPinned(false);
          localStorage.setItem('mam.detail.video.pin', '0');
          root.classList.remove('detail-video-pinned', 'detail-video-show-overlay-controls');
        }
        wasPinned = false;
      }
      const stickyVideo = root.querySelector('.detail-video-fixed');
      const stickyOffset = wasPinned && stickyVideo instanceof HTMLElement ? Math.max(0, stickyVideo.getBoundingClientRect().height - 24) : 0;
      const clipsSection = root.querySelector('.collapsible-section[data-section="clips"]');
      if (clipsSection) {
        clipsSection.classList.remove('collapsed');
        const hideCheck = clipsSection.querySelector('.section-hide-check');
        if (hideCheck) hideCheck.checked = false;
      }
      const tryFocus = (attemptsLeft = 10) => {
        const row = root.querySelector(`.cut-item[data-cut-id="${CSS.escape(targetCutId)}"]`);
        if (row) {
          const clipsBody = clipsSection?.querySelector('.collapsible-body');
          if (clipsSection) scrollElementIntoContainerView(root, clipsSection, 0.18, stickyOffset);
          if (clipsBody instanceof Element) {
            requestAnimationFrame(() => {
              scrollElementIntoContainerView(root, row, 0.24, stickyOffset);
            });
          } else {
            scrollElementIntoContainerView(root, row, 0.24, stickyOffset);
          }
          row.classList.add('search-hit-active');
          setTimeout(() => row.classList.remove('search-hit-active'), 1800);
          return;
        }
        if (attemptsLeft <= 0) return;
        requestAnimationFrame(() => {
          setTimeout(() => tryFocus(attemptsLeft - 1), 24);
        });
      };
      requestAnimationFrame(() => tryFocus());
    }

    return {
      getVersionSectionAccess,
      renderVersionRow,
      refreshAssetDetail,
      detailMarkup,
      openMultiSelectionDetail,
      clearDetailHeaderTimecode,
      syncDetailHeaderTimecode,
      scrollElementIntoContainerView,
      scrollDetailPanelToVideoTop,
      seekOpenDetailMedia,
      focusCutRowInDetail
    };
  }

  global.createMainDetailModule = createMainDetailModule;
})(window);
