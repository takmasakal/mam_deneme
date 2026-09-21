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
      workflowLabel,
      effectiveSearchHighlightClass,
      renderPdfChangeKindLabel,
      cleanVersionNoteText,
      formatDate,
      formatDuration,
      currentUserCanUsePdfAdvancedTools,
      currentUserCanEditOffice,
      currentUserCanAccessAdmin,
      currentUserCanDeleteAssets,
      currentUserCanDeleteAssetInUi,
      currentUserCanEditMetadata,
      currentLang,
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
      const canChangeThisAsset = !asset?.inTrash;
      return {
        assetIsImage: Boolean(isImage(asset)),
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
        canManageVersions: Boolean(canChangeThisAsset && (
          assetIsPdf
            ? (currentUserCanUsePdfAdvancedTools() || canEditPdfAsset)
            : assetIsOffice
              ? (currentUserCanEditOffice() || canEditOfficeAsset)
              : (currentUserCanAccessAdmin() || canEditThisAsset)
        ))
      };
    }

    function canDeleteAssetInUi(asset) {
      if (typeof currentUserCanDeleteAssetInUi === 'function') {
        return currentUserCanDeleteAssetInUi(asset);
      }
      if (asset?.canDeleteAsset === true) return true;
      if (asset?.canDeleteAsset === false) return false;
      return Boolean(currentUserCanDeleteAssets());
    }

    function detailArtifactBadges(asset) {
      const eligible = Boolean(isVideo?.(asset) || isImage?.(asset) || isAudio?.(asset));
      if (!eligible) return '';
      const dc = asset?.dcMetadata && typeof asset.dcMetadata === 'object' ? asset.dcMetadata : {};
      const hasOcr = Boolean(
        String(asset?.videoOcrUrl || asset?.photoOcrUrl || dc.videoOcrUrl || dc.photoOcrUrl || '').trim()
        || (Array.isArray(asset?.videoOcrItems) && asset.videoOcrItems.length)
        || (Array.isArray(asset?.photoOcrItems) && asset.photoOcrItems.length)
      );
      const hasSubtitle = Boolean(
        String(asset?.subtitleUrl || dc.subtitleUrl || '').trim()
        || (Array.isArray(asset?.subtitleItems) && asset.subtitleItems.length)
      );
      if (!hasOcr && !hasSubtitle) return '';
      const subtitleItems = Array.isArray(asset?.subtitleItems) ? asset.subtitleItems : [];
      const languageKey = (value) => {
        const primary = String(value || '').trim().toLowerCase().replaceAll('_', '-').split('-')[0];
        if (primary === 'tr' || primary === 'tur') return 'tr';
        if (primary === 'en' || primary === 'eng') return 'en';
        return primary.replace(/[^a-z0-9]/g, '').slice(0, 12);
      };
      const grouped = new Map();
      subtitleItems.forEach((item) => {
        const lang = languageKey(item?.subtitleLang);
        const url = String(item?.subtitleUrl || '').trim();
        if (!lang || !url) return;
        if (!grouped.has(lang)) grouped.set(lang, []);
        grouped.get(lang).push(item);
      });
      const activeByLang = asset?.subtitleActiveByLang && typeof asset.subtitleActiveByLang === 'object'
        ? asset.subtitleActiveByLang
        : {};
      const languageChoices = Array.from(grouped.entries())
        .map(([lang, items]) => {
          const activeUrl = String(activeByLang[lang] || '').trim();
          const selected = items.find((item) => String(item.subtitleUrl || '').trim() === activeUrl)
            || items.find((item) => String(item.subtitleUrl || '').trim() === String(asset.subtitleUrl || '').trim())
            || items[items.length - 1];
          return { lang, item: selected };
        })
        .sort((a, b) => {
          const order = { tr: 0, en: 1 };
          return (order[a.lang] ?? 10) - (order[b.lang] ?? 10) || a.lang.localeCompare(b.lang);
        });
      const languageLabel = (lang) => {
        const uiLang = String(currentLang?.() || 'tr').toLowerCase();
        if (lang === 'tr') return uiLang === 'tr' ? t('subtitle_lang_turkish_short') : 'tur';
        if (lang === 'en') return uiLang === 'tr' ? t('subtitle_lang_english_short') : 'eng';
        return lang.slice(0, 3);
      };
      const subtitleBadge = languageChoices.length > 1
        ? `<details class="detail-subtitle-language-picker" data-subtitle-asset-id="${escapeHtml(asset.id)}">
            <summary data-subtitle-toggle="1" aria-pressed="false" class="detail-artifact-badge detail-artifact-badge-button" title="${escapeHtml(t('subtitle_choose_language'))}">${escapeHtml(t('subtitle_badge'))}</summary>
            <div class="detail-subtitle-language-menu" role="menu" aria-label="${escapeHtml(t('subtitle_choose_language'))}">
              ${languageChoices.map(({ lang, item }) => `<button type="button" role="menuitem" aria-pressed="false" class="detail-subtitle-language-choice detail-subtitle-language-${escapeHtml(lang)} ${String(item.subtitleUrl || '').trim() === String(asset.subtitleUrl || '').trim() ? 'active' : ''}" data-subtitle-language-choice="1" data-subtitle-language-key="${escapeHtml(lang)}" data-subtitle-url="${escapeHtml(item.subtitleUrl || '')}" data-subtitle-lang="${escapeHtml(item.subtitleLang || lang)}" data-subtitle-label="${escapeHtml(item.subtitleLabel || lang)}">${escapeHtml(languageLabel(lang))}</button>`).join('')}
            </div>
          </details>`
        : `<div class="detail-subtitle-language-picker" data-subtitle-asset-id="${escapeHtml(asset.id)}"><button type="button" class="detail-artifact-badge detail-artifact-badge-button" data-subtitle-toggle="1" aria-pressed="false" aria-label="${escapeHtml(t('subtitle_overlay_enabled'))}">${escapeHtml(t('subtitle_badge'))}</button></div>`;
      return `<div class="detail-artifact-badges" aria-label="${escapeHtml(t('asset_artifacts'))}">
        ${hasOcr ? `<span class="detail-artifact-badge">${escapeHtml(t('ocr_badge'))}</span>` : ''}
        ${hasSubtitle ? subtitleBadge : ''}
      </div>`;
    }

    function getVersionRowState(version, access) {
      const actionType = String(version?.actionType || 'manual').toLowerCase();
      const hasSnapshot = String(version?.snapshotMediaUrl || '').startsWith('/uploads/');
      const snapshotMime = String(version?.snapshotMimeType || '').toLowerCase();
      const snapshotFileName = String(version?.snapshotFileName || '').toLowerCase();
      const textPreviewable = snapshotMime.startsWith('text/')
        || snapshotMime === 'application/json'
        || /\.json(?:$|[?#])/.test(snapshotFileName);
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
        canPreviewVersion: Boolean(hasSnapshot && (/^(image|audio|video)\//.test(snapshotMime) || textPreviewable || snapshotMime === 'application/pdf' || snapshotMime.includes('word') || snapshotMime.includes('officedocument') || snapshotMime.includes('ms-excel') || snapshotMime.includes('ms-powerpoint'))),
        canDownloadVersion: Boolean(hasSnapshot && access.canDownloadAsset),
        canEditVersion: canEditOrDelete,
        canDeleteVersion: canEditOrDelete
      };
    }

    function renderVersionRow(asset, version, access, interactive) {
      const attachment = version.fileRole === 'attachment' || version.actionType === 'attachment';
      const renderFileText = (value) => attachment
        ? highlightMatch(String(value || ''), currentSearchHighlightQuery(), effectiveSearchHighlightClass(currentSearchQuery(), currentSearchHighlightQuery(), currentSearchFuzzyUsed()))
        : escapeHtml(value || '');
      const rowState = getVersionRowState(version, access);
      const changeKindLabel = rowState.actionType === 'pdf_save' ? renderPdfChangeKindLabel(version) : '';
      const cleanNote = cleanVersionNoteText(version.note);
      const rowClass = 'version';
      const restoreAttr = '';
      const downloadButton = rowState.canDownloadVersion
        ? `<button type="button" class="downloadVersionBtn" data-version-id="${escapeHtml(version.versionId)}">${attachment ? 'İndir' : escapeHtml(t('download_version'))}</button>`
        : '';
      const previewButton = rowState.canPreviewVersion
        ? `<button type="button" class="previewVersionBtn" data-version-id="${escapeHtml(version.versionId)}">${escapeHtml(t('preview_version'))}</button>`
        : '';
      const actionBar = (interactive || downloadButton || previewButton) ? `
        <div class="timecode-bar" style="margin-top:8px;">
          ${interactive && !attachment ? `<button type="button" class="defaultVersionBtn" data-version-id="${escapeHtml(version.versionId)}" ${asset.defaultVersionId === version.versionId ? 'disabled' : ''}>${asset.defaultVersionId === version.versionId ? 'Varsayılan' : 'Varsayılan yap'}</button>` : ''}
          ${previewButton}
          ${downloadButton}
          ${interactive ? `<button type="button" class="editVersionBtn" data-version-id="${escapeHtml(version.versionId)}" ${rowState.canEditVersion ? '' : 'disabled'}>${attachment ? 'Adını düzenle' : escapeHtml(t('edit_version_name'))}</button>` : ''}
          ${interactive && rowState.canDeleteVersion ? `<button type="button" class="deleteVersionBtn danger" data-version-id="${escapeHtml(version.versionId)}">${attachment ? 'Sil' : escapeHtml(t('delete_version'))}</button>` : ''}
        </div>
      ` : '';
      return `
        <div class="${rowClass}" draggable="true" data-version-id="${escapeHtml(version.versionId)}"${restoreAttr}>
          <strong>${renderFileText(version.label)}</strong> <span class="asset-meta">${attachment ? 'Ek dosya' : 'Versiyon'}</span> - ${renderFileText(cleanNote)}<br />
          ${attachment && version.snapshotFileName ? `<span class="asset-meta">Dosya adı: ${renderFileText(version.snapshotFileName)}</span><br />` : ''}
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

    function detailMarkup(asset, workflow, options = {}) {
      const dc = asset.dcMetadata || {};
      const isImageAsset = Boolean(isImage?.(asset));
      const hasPlayableVideoProxy = isVideo(asset) && Boolean(String(asset.proxyUrl || '').trim());
      const trashStatus = asset.inTrash ? `<strong>${t('in_trash')}</strong>` : t('active');
      const searchHighlightClass = effectiveSearchHighlightClass(currentSearchQuery(), currentSearchHighlightQuery(), currentSearchFuzzyUsed());

      const viewerContent = isVideo(asset)
        ? `
          ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: false, includeSectionHide: true, includeClipSectionHide: false, includeAudioSectionHide: false, audioSideLayout: false, includeDetailPin: true })}
        `
        : `
          ${mediaViewer(asset, { imagePreviewUrl: options.imagePreviewUrl })}
        `;

      const viewerSection = `<div data-detail-file-preview>${viewerContent}</div>`;
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
      const workflowDisabled = asset.inTrash ? ' disabled' : '';
      const durationSeconds = Number(asset.durationSeconds) || 0;
      const hasDuration = (isVideo(asset) || (typeof isAudio === 'function' && isAudio(asset))) && durationSeconds > 0;
      const durationMeta = hasDuration ? ` | ${t('duration')}: ${escapeHtml(formatDuration(durationSeconds))}` : '';
      const fileSizeBytes = Number(asset.fileSizeBytes);
      const hasFileSize = Number.isFinite(fileSizeBytes) && fileSizeBytes > 0;
      const fileSizeMeta = hasFileSize
        ? ` | ${t('tech_file_size')}: ${escapeHtml(`${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`)}`
        : '';
      const durationField = hasDuration
        ? `<label>${t('duration')}<input name="durationSeconds" type="number" min="0" value="${escapeHtml(durationSeconds)}" />${buildInlineFieldMatch(`${durationSeconds}s`, currentSearchHighlightQuery(), searchHighlightClass)}</label>`
        : '';

      const metadataTopSection = `
        <h3>${highlightMatch(asset.title, currentSearchHighlightQuery(), searchHighlightClass)}</h3>
        ${detailArtifactBadges(asset)}
        <p>${highlightMatch(asset.description || t('no_description'), currentSearchHighlightQuery(), searchHighlightClass)}</p>
        <div class="asset-meta">${t('owner')}: ${highlightMatch(asset.owner, currentSearchHighlightQuery(), searchHighlightClass)} | ${t('type')}: ${highlightMatch(asset.type, currentSearchHighlightQuery(), searchHighlightClass)}${durationMeta}${fileSizeMeta}</div>
        <div class="asset-meta">${t('status')}: <strong>${escapeHtml(workflowLabel(asset.status))}</strong></div>
        <div class="asset-meta">${t('trash')}: ${trashStatus}</div>
        ${dcHighlightSnippet(asset, currentSearchHighlightQuery(), searchHighlightClass) ? `<div class="asset-meta dc-hit-row">${dcHighlightSnippet(asset, currentSearchHighlightQuery(), searchHighlightClass)}</div>` : ''}
        ${tagsMarkup}
        <div class="timecode-bar">
          ${asset.mediaUrl && asset.canDownloadAsset !== false ? `<button type="button" id="downloadAssetBtn">${t('download_asset')}</button>` : ''}
          ${currentUserCanAccessAdmin() && asset.canDownloadAsset !== false && isVideo(asset) && asset.proxyUrl ? `<button type="button" id="downloadProxyBtn">${t('download_proxy')}</button>` : ''}
          ${canDeleteAssetInUi(asset) && !asset.inTrash ? `<button type="button" id="moveToTrashBtn" class="danger">${t('delete_asset')}</button>` : ''}
          ${canDeleteAssetInUi(asset) && asset.inTrash ? `<button type="button" id="restoreAssetBtn">${t('restore')}</button><button type="button" id="deleteAssetBtn" class="danger">${t('delete_permanent')}</button>` : ''}
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
            <label>${t('owner')}<input name="owner" value="${escapeHtml(asset.owner)}" required ${currentUserCanAccessAdmin() ? '' : 'readonly'} />${buildInlineFieldMatch(asset.owner, currentSearchHighlightQuery(), searchHighlightClass)}</label>
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
            <button type="submit" class="mam-action-btn mam-action-btn-save"><span class="mam-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4"/><path d="M8 16h8"/></svg></span><span class="mam-action-label">${t('save_metadata')}</span></button>
          </fieldset>
        </form>

        <form id="transitionForm" class="inline-grid">
          <h4>${t('workflow_transition')}</h4>
          <select name="status"${workflowDisabled}>
            ${workflow
              .map((status) => `<option value="${escapeHtml(status)}" ${status === asset.status ? 'selected' : ''}>${escapeHtml(workflowLabel(status))}</option>`)
              .join('')}
          </select>
          <button type="submit"${workflowDisabled}>${t('move_status')}</button>
        </form>
      `;

      const versionAccess = getVersionSectionAccess(asset);
      const { assetIsPdf, assetIsOffice, canViewVersions, canManageVersions } = versionAccess;
      const fileGroups = () => [
        { attachment: false, title: 'Versiyonlar', empty: 'Henüz versiyon yok.' },
        { attachment: true, title: 'Ek dosyalar', empty: 'Henüz ek dosya yok.' }
      ].map((group) => {
        const files = (asset.versions || []).filter((file) => (file.fileRole === 'attachment' || file.actionType === 'attachment') === group.attachment);
        return `<section class="asset-file-group" style="border:1px solid ${group.attachment ? 'rgba(106, 160, 190, 0.35)' : 'var(--border, #414141)'};${group.attachment ? 'background:rgba(80, 135, 165, 0.10);' : ''}border-radius:8px;padding:12px;margin-top:12px;">
          <h4>${group.title}</h4>
          <div data-file-group="${group.attachment ? 'attachment' : 'version'}">${files.length ? files.map((file) => renderVersionRow(asset, file, versionAccess, canManageVersions)).join('') : `<p class="asset-meta">${group.empty}</p>`}</div>
        </section>`;
      }).join('');
      const versionSection = canManageVersions ? `
        <form id="versionForm" class="inline-grid">
          <h4>Dosya ekle</h4>
          <select name="fileRole" aria-label="Dosya rolü"><option value="version">Yeni versiyon (${escapeHtml(asset.versionMimeType || asset.mimeType || '')})</option><option value="attachment">Ek dosya</option></select>
          <input name="label" placeholder="${escapeHtml(t('ph_version_label'))}" />
          <input name="note" placeholder="${t('what_changed')}" />
          <input name="versionFile" type="file" required />
          <button type="submit" class="mam-action-btn mam-action-btn-file"><span class="mam-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M12 12v6m-3-3h6"/></svg></span><span class="mam-action-label">Dosya ekle</span></button>
        </form>

        <h4>Dosyalar</h4>
        ${(
          (currentUserCanUsePdfAdvancedTools() || (asset.canEditAssetPdf ?? asset.canEditAsset))
          && asset.canDownloadAsset !== false
          && assetIsPdf
        ) ? `
          <div class="timecode-bar" style="margin: 0 0 8px 0;">
            <button type="button" id="downloadPdfOriginalBtn">${escapeHtml(t('download_pdf_original'))}</button>
          </div>
        ` : ''}
        ${(
          (currentUserCanEditOffice() || (asset.canEditAssetOffice ?? asset.canEditAsset))
          && asset.canDownloadAsset !== false
          && assetIsOffice
        ) ? `
          <div class="timecode-bar" style="margin: 0 0 8px 0;">
            <button type="button" id="downloadOfficeOriginalBtn">${escapeHtml(t('download_office_original'))}</button>
          </div>
        ` : ''}
        <div id="assetVersionsList">
        ${fileGroups()}
        </div>
      ` : (canViewVersions ? `
        <h4>Dosyalar</h4>
        <div id="assetVersionsList">
        ${fileGroups()}
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
      const allInTrash = selectedAssets.length > 0 && selectedAssets.every((asset) => Boolean(asset.inTrash));
      const allActive = selectedAssets.length > 0 && selectedAssets.every((asset) => !asset.inTrash);
      const canDeleteSelected = selectedAssets.some(canDeleteAssetInUi);
      return `
        <h3>${escapeHtml(t('multi_selected'))}</h3>
        <div class="asset-meta">${escapeHtml(t('selected_count'))}: <strong>${selectedAssets.length}</strong></div>
        <div class="bulk-box">
          <div class="chips">
            ${selectedAssets.slice(0, 40).map((asset) => `<span class="chip multi-chip" style="${assetTagChipStyle(asset)}">${escapeHtml(asset.title)}</span>`).join('')}
          </div>
          <div class="timecode-bar">
            ${canDeleteSelected && (allInTrash || allActive) ? `<button type="button" id="bulkDeleteBtn">${escapeHtml(t(allInTrash ? 'bulk_delete_selected' : 'bulk_move_to_trash'))}</button>` : ''}
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
        if (!currentUserCanDeleteAssets()) return;
        const ids = currentAssets()
          .filter((asset) => selectedAssetIds().has(asset.id) && canDeleteAssetInUi(asset))
          .map((asset) => asset.id);
        if (!ids.length) return;
        const allInTrash = ids.every((id) => currentAssets().some((asset) => asset.id === id && asset.inTrash));
        const ok = confirm(tf(allInTrash ? 'bulk_delete_confirm' : 'bulk_move_to_trash_confirm', { count: ids.length }));
        if (!ok) return;

        for (const id of ids) {
          try {
            if (allInTrash) await deleteApi(`/api/assets/${id}`);
            else await api(`/api/assets/${id}/trash`, { method: 'POST', body: '{}' });
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
      const target = root.querySelector('.detail-video-fixed')
        || root.querySelector('.viewer-shell')
        || root.querySelector('.audio-viewer-resizable')
        || root.querySelector('#assetMediaEl');
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
        if (String(mediaEl.tagName || '').toUpperCase() !== 'AUDIO') scrollDetailPanelToVideoTop(assetDetail());
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
          localStorage.setItem('mam.detailVideoPinned', '0');
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
