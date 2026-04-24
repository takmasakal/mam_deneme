(function attachMainMediaViewerModule(global) {
  function createMainMediaViewerModule(deps) {
    const {
      t,
      escapeHtml,
      currentLangRef,
      currentUserCanUsePdfAdvancedToolsRef,
      currentOfficeEditorProviderRef,
      detailVideoPinnedRef,
      isVideo,
      isAudio,
      isImage,
      isDocument,
      isPdf,
      isOfficeDocument,
      thumbFallbackForAsset,
      subtitleTrackMarkup,
      getSubtitleOverlayEnabled,
      useCustomLikeTimelineUI,
      useVideoJsPlayerUI,
      useMpegDashPlayerUI
    } = deps || {};

function mediaViewer(asset, options = {}) {
  const showVideoToolsButton = options.showVideoToolsButton !== false;
  const includeSubtitleTools = options.includeSubtitleTools !== false;
  const includeSectionHide = options.includeSectionHide === true;
  const includeClipSectionHide = options.includeClipSectionHide == null ? includeSectionHide : options.includeClipSectionHide === true;
  const includeAudioSectionHide = options.includeAudioSectionHide == null ? includeSectionHide : options.includeAudioSectionHide === true;
  const audioSideLayout = options.audioSideLayout === true;
  const audioOverlayInViewer = options.audioOverlayInViewer === true;
  const includeDetailPin = options.includeDetailPin === true;
  const tcInControlBar = options.tcInControlBar === true;
  if (!asset.mediaUrl) return `<div class="empty">${escapeHtml(t('no_media'))}</div>`;

  const playbackUrl = escapeHtml(isVideo(asset) ? (asset.proxyUrl || '') : asset.mediaUrl);
  const proxyStatus = escapeHtml(asset.proxyStatus || 'not_applicable');
  const audioChannelsAttr = Number(asset.audioChannels) > 0 ? ` data-audio-channels="${Number(asset.audioChannels)}"` : '';

  if (isVideo(asset)) {
    const customMode = useCustomLikeTimelineUI();
    const videoJsMode = useVideoJsPlayerUI();
    const rawProxyUrl = String(asset.proxyUrl || '').trim();
    const rawDashManifestUrl = String(asset?.dcMetadata?.dashProxyUrl || '').trim();
    const dashManifestUrl = useMpegDashPlayerUI()
      ? (rawDashManifestUrl || (/\.(mpd)(?:[?#].*)?$/i.test(rawProxyUrl) ? rawProxyUrl : ''))
      : '';
    const playbackSrc = escapeHtml(dashManifestUrl || rawProxyUrl);
    const dashManifestAttr = dashManifestUrl ? ` data-dash-manifest="${escapeHtml(dashManifestUrl)}"` : '';
    const srcAttr = dashManifestUrl ? '' : ` src="${playbackSrc}"`;
    const nativeControlsAttr = customMode ? '' : ' controls';
    if (!asset.proxyUrl) {
      return `
        <div class="empty">${escapeHtml(t('proxy_required'))}</div>
      `;
    }
    const audioToolsMarkup = `
          <div class="audio-tools collapsible-section" data-section="audio">
            <div class="audio-tools-header collapsible-head">
              <strong>${t('audio_channels')}</strong>
            </div>
            <div class="collapsible-body">
              <div class="audio-graph-frame">
                <canvas id="audioGraph" class="audio-graph audio-graph-vertical" width="${audioOverlayInViewer ? '180' : '320'}" height="${audioOverlayInViewer ? '220' : '320'}"></canvas>
                <div class="audio-graph-controls-box">
                  <div id="channelControls" class="channel-controls"></div>
                  <div class="audio-graph-options">
                  <label><input type="checkbox" id="groupChannels" checked /> ${t('group_channel_selection')}</label>
                  ${includeSectionHide ? `<label class="section-hide-toggle"><input type="checkbox" class="section-hide-check" /> ${t('hide_section')}</label>` : ''}
                </div>
              </div>
              </div>
            </div>
          </div>
    `;
    return `
      <div class="viewer-shell">
      <div class="viewer-core">
        <div class="viewer-head">
          <h4 class="viewer-asset-name">${escapeHtml(asset.title)}</h4>
          ${tcInControlBar ? '' : `<div class="viewer-tc">${t('tc')}: <strong id="currentTimecode">00:00:00:00</strong> <span class="viewer-rate-group"><button type="button" id="playbackRateBackBtn" class="viewer-rate-arrow" aria-label="Reverse playback rates">◀</button><button type="button" id="playbackRateBtn" class="viewer-rate-btn" aria-label="Playback rate">1x</button><button type="button" id="playbackRateForwardBtn" class="viewer-rate-arrow" aria-label="Forward playback rates">▶</button></span></div>`}
          ${includeDetailPin ? `<button type="button" id="detailVideoPinBtn" class="viewer-pin-btn" title="${escapeHtml(detailVideoPinned ? t('unpin_video') : t('pin_video'))}" aria-label="${escapeHtml(detailVideoPinned ? t('unpin_video') : t('pin_video'))}" aria-pressed="${detailVideoPinned ? 'true' : 'false'}">📌</button>` : ''}
        </div>
        <div class="video-top-layout${audioSideLayout ? '' : ' no-audio-side'}">
          <div class="video-main-col">
            <div class="viewer-resizable video-resizable${audioOverlayInViewer ? ' video-resizable-audio-overlay' : ''}">
              <video id="assetMediaEl" data-asset-id="${escapeHtml(asset.id)}" class="asset-viewer${videoJsMode ? ' video-js vjs-default-skin' : ''}"${nativeControlsAttr} preload="metadata"${srcAttr}${dashManifestAttr} poster="${escapeHtml(asset.thumbnailUrl || '')}"${audioChannelsAttr}>
                ${subtitleTrackMarkup(asset)}
              </video>
              ${audioOverlayInViewer ? `<div class="video-audio-overlay-panel">${audioToolsMarkup}</div>` : ''}
            </div>
            ${customMode ? `
            <div class="custom-player-bar" id="customPlayerBar">
              <button type="button" id="customPlayPauseBtn" title="${t('play')}">▶</button>
              <span id="customCurrentTime" class="custom-time">00:00:00</span>
              <div class="custom-seek-wrap">
                <input type="range" id="customSeekRange" class="custom-seek" min="0" max="1000" step="1" value="0" />
                <span id="customMarkInTick" class="custom-seek-tick custom-seek-tick-in hidden" data-label="IN" title="IN"></span>
                <span id="customMarkOutTick" class="custom-seek-tick custom-seek-tick-out hidden" data-label="OUT" title="OUT"></span>
              </div>
              <span id="customDurationTime" class="custom-time">00:00:00</span>
              <div class="custom-volume-wrap" id="customVolumeWrap">
                <button type="button" id="customMuteBtn" title="Volume" aria-label="Volume">🔊</button>
                <div class="custom-volume-popover" id="customVolumePopover">
                  <input type="range" id="customVolumeRange" class="custom-volume custom-volume-vertical" min="0" max="1" step="0.01" value="1" />
                </div>
              </div>
            </div>
            ` : ''}
            <div class="player-controls-box control-stickbar">
              ${customMode ? '' : `
              <div class="mark-rail-wrap">
                <div class="mark-rail" id="markRail">
                  <span id="markInTick" class="mark-tick mark-tick-in hidden" data-label="IN" title="IN"></span>
                  <span id="markOutTick" class="mark-tick mark-tick-out hidden" data-label="OUT" title="OUT"></span>
                </div>
              </div>
              `}
              <div class="player-toolbar-row">
                <div class="player-tools pro-tools">
                  <button type="button" id="playBtn" title="${t('play')}" aria-label="${t('play')}">▶</button>
                  <button type="button" id="reverseFrameBtn" title="${t('reverse_frame')}" aria-label="${t('reverse_frame')}">◀◀</button>
                  <button type="button" id="forwardFrameBtn" title="${t('forward_frame')}" aria-label="${t('forward_frame')}">▶▶</button>
                </div>
                <div class="timecode-bar compact-timecode control-tools">
                  <button type="button" id="markInBtn">${t('set_in')}</button>
                  <button type="button" id="markOutBtn">${t('set_out')}</button>
                  <button type="button" id="goInBtn">${t('go_in')}</button>
                  <button type="button" id="goOutBtn">${t('go_out')}</button>
                  ${tcInControlBar ? `<div class="viewer-tc viewer-tc-inline">${t('tc')}: <strong id="currentTimecode">00:00:00:00</strong> <span class="viewer-rate-group"><button type="button" id="playbackRateBackBtn" class="viewer-rate-arrow" aria-label="Reverse playback rates">◀</button><button type="button" id="playbackRateBtn" class="viewer-rate-btn" aria-label="Playback rate">1x</button><button type="button" id="playbackRateForwardBtn" class="viewer-rate-arrow" aria-label="Forward playback rates">▶</button></span></div>` : ''}
                  ${showVideoToolsButton ? `<button type="button" id="videoToolsBtn">${t('video_tools')}</button>` : ''}
                </div>
              </div>
            </div>
          </div>
          ${audioSideLayout ? `
          <div class="audio-side-col">
          ${audioOverlayInViewer ? '' : audioToolsMarkup}
          </div>
          ` : ''}
        </div>
      </div>
      <div class="viewer-extra">
        ${includeSubtitleTools ? `
        <div class="subtitle-tools collapsible-section" data-section="subtitles">
          <div class="collapsible-head">
            <strong>${t('subtitles')}</strong>
            <div class="subtitle-head-toggles">
              <label class="video-tools-check subtitle-overlay-head-check">
                <input id="subtitleOverlayCheck" type="checkbox" ${getSubtitleOverlayEnabled(asset.id, false) ? 'checked' : ''} />
                ${t('subtitle_overlay_enabled')}
              </label>
              ${includeSectionHide ? `<label class="section-hide-toggle"><input type="checkbox" class="section-hide-check" /> ${t('hide_section')}</label>` : ''}
            </div>
          </div>
          <div class="collapsible-body">
            <div class="subtitle-tools-header">
              <span id="subtitleStatus" class="subtitle-status">${asset.subtitleUrl ? `${t('subtitle_loaded')}: ${escapeHtml(asset.subtitleLabel || asset.subtitleLang || '')}` : t('subtitle_none')}</span>
              <span class="subtitle-current-inline"><strong>${t('subtitle_current')}:</strong> <span id="videoSubtitleCurrent">${escapeHtml(asset.subtitleLabel || asset.subtitleLang || '-')}</span></span>
              <span id="subtitleBusy" class="subtitle-busy hidden"><span class="spinner"></span>${t('processing')}</span>
            </div>
            <div class="subtitle-list-wrap">
              <div class="viewer-meta"><strong>${t('subtitle_list')}:</strong></div>
              <div id="subtitleItems" class="subtitle-items"></div>
            </div>
            <div class="subtitle-list-wrap">
              <div class="viewer-meta"><strong>${t('subtitle_search_results')}:</strong></div>
              <div class="subtitle-tools-row">
                <div class="search-query-wrap">
                  <input id="subtitleSearchInput" class="subtitle-name-input" type="text" placeholder="${escapeHtml(t('subtitle_search_ph'))}" />
                  <div id="subtitleSearchSuggest" class="search-suggest hidden"></div>
                </div>
                <button type="button" id="subtitleSearchBtn">${t('subtitle_search_btn')}</button>
              </div>
              <div id="subtitleSearchResults" class="subtitle-items"></div>
            </div>
            <div class="subtitle-tools-layout">
              <div class="tool-grid tool-grid-subtitle">
                <label class="tool-field" for="subtitleLangInput"><span>${t('subtitle_lang')}</span><input id="subtitleLangInput" class="subtitle-lang-input" type="text" maxlength="12" value="${escapeHtml(asset.subtitleLang || currentLang || 'tr')}" /></label>
                <label class="tool-field" for="subtitleLabelInput"><span>${t('subtitle_name')}</span><input id="subtitleLabelInput" class="subtitle-name-input" type="text" maxlength="120" value="${escapeHtml(asset.subtitleLabel || '')}" /></label>
                <label class="tool-field" for="subtitleModelSelect"><span>${t('subtitle_model')}</span><select id="subtitleModelSelect" class="subtitle-lang-input"><option value="small" selected>${t('subtitle_model_small')}</option></select></label>
                <label class="tool-field" for="subtitleAudioStreamSelect"><span>${t('subtitle_audio_stream')}</span><select id="subtitleAudioStreamSelect" class="subtitle-lang-input"></select></label>
                <label class="tool-field" for="subtitleAudioChannelSelect"><span>${t('subtitle_audio_channel')}</span><select id="subtitleAudioChannelSelect" class="subtitle-lang-input"></select></label>
              </div>
              <div class="tool-actions">
                <label class="video-tools-check subtitle-backend-check tool-toggle-pill"><input id="subtitleZemberekCheck" type="checkbox" checked /> ${t('subtitle_use_zemberek')}</label>
                <button type="button" id="subtitleGenerateBtn">${t('subtitle_generate')}</button>
                <button type="button" id="subtitleRenameBtn">${t('subtitle_save_name')}</button>
                <div class="tool-file-wrap">
                  <input id="subtitleFileInput" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" />
                  <button type="button" id="subtitleUploadBtn">${t('subtitle_upload')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="video-ocr-tools collapsible-section" data-section="ocr">
          <div class="collapsible-head">
            <strong>${t('video_ocr')}</strong>
            ${includeSectionHide ? `<label class="section-hide-toggle"><input type="checkbox" class="section-hide-check" /> ${t('hide_section')}</label>` : ''}
          </div>
          <div class="collapsible-body">
            <div class="subtitle-tools-header">
              <span id="videoOcrStatus" class="subtitle-status"></span>
              <span id="videoOcrBusy" class="subtitle-busy hidden"><span class="spinner"></span>${t('processing')}</span>
            </div>
            <div class="subtitle-tools-layout">
              <details class="tool-options-menu tool-options-menu-ocr">
                <summary>${t('tool_options')}</summary>
                <div class="ocr-flow-diagram">
                  <section class="ocr-flow-stage ocr-flow-stage-pre">
                    <h5>${t('ocr_stage_preprocess')}</h5>
                    <div class="ocr-flow-stage-body">
                      <label class="tool-field" for="videoOcrPresetSelect"><span>${t('video_ocr_preset')}</span><select id="videoOcrPresetSelect" class="subtitle-lang-input"><option value="general">${t('video_ocr_preset_general')}</option><option value="ticker">${t('video_ocr_preset_ticker')}</option><option value="credits">${t('video_ocr_preset_credits')}</option><option value="static">${t('video_ocr_preset_static')}</option></select></label>
                      <label class="tool-field" for="videoOcrPreprocessSelect"><span>${t('video_ocr_preprocess')}</span><select id="videoOcrPreprocessSelect" class="subtitle-lang-input"><option value="off">${t('video_ocr_preprocess_off')}</option><option value="light" selected>${t('video_ocr_preprocess_light')}</option><option value="strong">${t('video_ocr_preprocess_strong')}</option></select></label>
                      <div class="tool-option-group">
                        <label class="video-tools-check tool-toggle-pill"><input id="videoOcrBlurFilterCheck" type="checkbox" checked /> ${t('video_ocr_blur_filter')}</label>
                        <label class="tool-field tool-field-compact" for="videoOcrBlurThresholdInput"><span>${t('video_ocr_blur_threshold')}</span><input id="videoOcrBlurThresholdInput" class="subtitle-lang-input" type="number" min="0" max="300" step="1" value="80" /></label>
                      </div>
                      <div class="tool-option-group">
                        <label class="video-tools-check tool-toggle-pill"><input id="videoOcrRegionModeCheck" type="checkbox" /> ${t('video_ocr_region_mode')}</label>
                        <label class="tool-field tool-field-compact" for="videoOcrTickerHeightInput"><span>${t('video_ocr_ticker_height')}</span><input id="videoOcrTickerHeightInput" class="subtitle-lang-input" type="number" min="10" max="40" step="1" value="20" /></label>
                      </div>
                    </div>
                  </section>
                  <section class="ocr-flow-stage ocr-flow-stage-core">
                    <h5>${t('ocr_stage_process')}</h5>
                    <div class="ocr-flow-stage-body">
                      <label class="tool-field" for="videoOcrIntervalInput"><span>${t('video_ocr_interval')}</span><input id="videoOcrIntervalInput" class="subtitle-lang-input" type="number" min="1" max="30" step="1" value="4" /></label>
                      <label class="tool-field" for="videoOcrLangInput"><span>${t('video_ocr_lang')}</span><input id="videoOcrLangInput" class="subtitle-name-input" type="text" maxlength="32" value="eng+tur" /></label>
                      <label class="tool-field" for="videoOcrEngineSelect"><span>${t('video_ocr_engine')}</span><select id="videoOcrEngineSelect" class="subtitle-lang-input"><option value="paddle">${t('video_ocr_engine_paddle')}</option></select></label>
                      <div class="tool-option-group">
                        <label class="video-tools-check tool-toggle-pill"><input id="videoOcrAdvancedCheck" type="checkbox" checked /> ${t('video_ocr_advanced')} <span class="tool-inline-help" data-tooltip="${escapeHtml(t('video_ocr_advanced_help'))}">i</span></label>
                        <label class="tool-field tool-field-compact" for="videoOcrMinDisplayInput"><span>${t('video_ocr_min_display')}</span><input id="videoOcrMinDisplayInput" class="subtitle-lang-input" type="number" min="1" max="60" step="1" value="8" /></label>
                        <label class="tool-field tool-field-compact" for="videoOcrMergeGapInput"><span>${t('video_ocr_merge_gap')}</span><input id="videoOcrMergeGapInput" class="subtitle-lang-input" type="number" min="0" max="30" step="1" value="4" /></label>
                      </div>
                    </div>
                  </section>
                  <section class="ocr-flow-stage ocr-flow-stage-post">
                    <h5>${t('ocr_stage_postprocess')}</h5>
                    <div class="ocr-flow-stage-body">
                      <label class="video-tools-check tool-toggle-pill"><input id="videoOcrAiCorrectCheck" type="checkbox" checked /> ${t('video_ocr_ai_correct')}</label>
                      <label class="video-tools-check tool-toggle-pill"><input id="videoOcrStaticFilterCheck" type="checkbox" checked /> ${t('video_ocr_static_filter')}</label>
                      <label class="tool-field tool-field-wide" for="videoOcrIgnorePhrasesInput"><span>${t('video_ocr_ignore_phrases')}</span><input id="videoOcrIgnorePhrasesInput" class="subtitle-name-input" type="text" maxlength="220" placeholder="${escapeHtml(t('video_ocr_ignore_phrases_ph'))}" /></label>
                      <label class="tool-field" for="videoOcrLabelInput"><span>${t('video_ocr_name')}</span><input id="videoOcrLabelInput" class="subtitle-name-input" type="text" maxlength="120" placeholder="${escapeHtml(t('video_ocr_name_ph'))}" value="${escapeHtml(asset.videoOcrLabel || '')}" /></label>
                    </div>
                  </section>
                </div>
              </details>
              <div class="tool-actions">
                <button type="button" id="videoOcrExtractBtn">${t('video_ocr_extract')}</button>
                <a id="videoOcrDownloadLink" class="subtitle-item-download-btn hidden" href="#" download target="_blank" rel="noreferrer">${t('video_ocr_download')}</a>
                <button type="button" id="videoOcrSaveBtn" class="hidden">${t('video_ocr_save_db')}</button>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        ${audioSideLayout ? '' : `
        <div class="audio-tools collapsible-section" data-section="audio">
          <div class="audio-tools-header collapsible-head">
            <strong>${t('audio_channels')}</strong>
          </div>
          <div class="collapsible-body">
            <div class="audio-graph-frame">
              <canvas id="audioGraph" class="audio-graph audio-graph-vertical" width="900" height="260"></canvas>
              <div class="audio-graph-controls-box">
                <div id="channelControls" class="channel-controls"></div>
                <div class="audio-graph-options">
                  <label><input type="checkbox" id="groupChannels" checked /> ${t('group_channel_selection')}</label>
                  ${includeAudioSectionHide ? `<label class="section-hide-toggle"><input type="checkbox" class="section-hide-check" /> ${t('hide_section')}</label>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
        `}
        <div class="cut-box collapsible-section" data-section="clips">
          <div class="collapsible-head">
            <strong>${t('video_clips')}</strong>
            ${includeClipSectionHide ? `<label class="section-hide-toggle"><input type="checkbox" class="section-hide-check" /> ${t('hide_section')}</label>` : ''}
          </div>
          <div class="collapsible-body">
            <div class="viewer-meta" id="markSummary"><span class="tc-in-label">${t('in_label')}</span>: --:--:--:-- | <span class="tc-out-label">${t('out_label')}</span>: --:--:--:-- | ${t('segment')}: --:--:--:--</div>
            <div class="cut-label-row">
              <label>${t('clip_name')}</label>
              <input id="cutLabelInput" type="text" placeholder="${escapeHtml(t('ph_clip_name'))}" />
            </div>
            <div class="cut-actions">
              <button type="button" id="saveCutBtn">${t('save_cut')}</button>
              <button type="button" id="clearMarksBtn">${t('delete_marks')}</button>
            </div>
            <div id="cutsList" class="cuts-list"></div>
          </div>
        </div>
      </div>
      </div>
    `;
  }

  if (isAudio(asset)) {
    return `
      <div class="viewer-resizable">
        <audio id="assetMediaEl" class="asset-viewer" controls src="${playbackUrl}"${audioChannelsAttr}></audio>
      </div>
      <div class="audio-tools">
        <div class="audio-tools-header">
          <strong>${t('audio_channels')}</strong>
        </div>
        <div class="audio-graph-frame">
          <canvas id="audioGraph" class="audio-graph" width="900" height="240"></canvas>
          <div class="audio-graph-controls-box">
            <div id="channelControls" class="channel-controls"></div>
            <div class="audio-graph-options">
              <label><input type="checkbox" id="groupChannels" checked /> ${t('group_channel_selection')}</label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (isImage(asset)) {
    return `<div class="viewer-resizable"><img class="asset-viewer" src="${playbackUrl}" alt="${escapeHtml(asset.title)}" /></div>`;
  }

  if (isPdf(asset)) {
    const viewerSrc = `/pdf-viewer.html?file=${encodeURIComponent(String(asset.mediaUrl || '').split('#')[0])}&assetId=${encodeURIComponent(asset.id)}&lang=${encodeURIComponent(currentLang)}&pdfAdvanced=${currentUserCanUsePdfAdvancedTools ? '1' : '0'}`;
    return `
      <div class="viewer-resizable pdf-viewer-resizable">
        <iframe id="pdfViewerFrame" class="asset-viewer pdf-viewer-frame" src="${escapeHtml(viewerSrc)}" title="PDF Viewer" loading="lazy"></iframe>
      </div>
    `;
  }

  if (isDocument(asset)) {
    if (isOfficeDocument(asset) && currentOfficeEditorProvider === 'none') {
      return `
        <div class="doc-native-shell">
          <strong>${escapeHtml(asset.fileName || asset.title || 'Office document')}</strong>
          <p>${escapeHtml(currentLang === 'tr'
            ? 'Office web editörü kapalı. Dosya native formatta tutuluyor; indirme ve versiyon işlemleri detay aksiyonlarından yapılır.'
            : 'Office web editor is disabled. The file is kept in its native format; use detail actions for download and versioning.')}</p>
        </div>
      `;
    }
    const viewerSrc = isOfficeDocument(asset)
      ? (currentOfficeEditorProvider === 'libreoffice'
        ? `/pdf-viewer.html?file=${encodeURIComponent(`/api/assets/${encodeURIComponent(asset.id)}/libreoffice-preview.pdf`)}&assetId=${encodeURIComponent(asset.id)}&lang=${encodeURIComponent(currentLang)}&pdfAdvanced=0&provider=libreoffice`
        : `/office-viewer.html?assetId=${encodeURIComponent(asset.id)}&lang=${encodeURIComponent(currentLang)}&v=oo-save-v9`)
      : `/pdf-viewer.html?file=${encodeURIComponent(String(asset.mediaUrl || '').split('#')[0])}&assetId=${encodeURIComponent(asset.id)}&lang=${encodeURIComponent(currentLang)}&pdfAdvanced=${currentUserCanUsePdfAdvancedTools ? '1' : '0'}`;
    return `
      <div class="viewer-resizable">
        <iframe id="docViewerFrame" class="asset-viewer pdf-viewer-frame" src="${escapeHtml(viewerSrc)}" title="Document Viewer" loading="lazy"></iframe>
      </div>
    `;
  }

  return `<a href="${playbackUrl}" target="_blank" rel="noreferrer">${t('open_attached')}</a>`;
}

function videoToolsPageMarkup(asset) {
  return `
    <div class="video-tools-page-body">
      <button type="button" id="leaveVideoToolsPageBtn" class="video-tools-page-close-btn" aria-label="${escapeHtml(t('close'))}" title="${escapeHtml(t('close'))}">×</button>
      <div class="video-tools-modal video-tools-modal-large video-tools-page-shell" role="region" aria-label="${escapeHtml(t('video_tools_title'))}">
        <div class="video-tools-modal-body">
          ${mediaViewer(asset, {
            showVideoToolsButton: false,
            includeSubtitleTools: true,
            includeSectionHide: false,
            audioSideLayout: true,
            audioOverlayInViewer: false,
            tcInControlBar: true
          })}
        </div>
      </div>
    </div>
  `;
}


    return {
      mediaViewer,
      videoToolsPageMarkup
    };
  }

  global.createMainMediaViewerModule = createMainMediaViewerModule;
})(window);
