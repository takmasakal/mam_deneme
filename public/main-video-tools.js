(function attachMainPlayerVideoToolsModule(global) {
  function createMainPlayerVideoToolsModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      highlightMatch,
      highlightSuggestText,
      readFileAsBase64,
      currentUserCanDeleteAssetsRef,
      subtitleOverlayEnabledByAsset,
      getSubtitleOverlayEnabled,
      syncSubtitleOverlayInOpenPlayers,
      ensureDetailPanelMinWidth,
      resetDetailPanelDynamicMinWidth,
      measureClipsPanelRequiredWidth,
      LOCAL_VIDEO_TOOLS_ORDER
    } = deps || {};

function initAudioTools(mediaEl, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const controlsWrap = byId('channelControls');
  const graphCanvas = byId('audioGraph');
  const groupChannelsInput = byId('groupChannels');

  if (!controlsWrap || !graphCanvas || !groupChannelsInput) {
    return () => {};
  }

  const ua = String(navigator.userAgent || '');
  const isSafari = /Safari/i.test(ua) && !/(Chrome|Chromium|Edg|OPR|CriOS|FxiOS)/i.test(ua);
  if (isSafari) {
    const toolsRoot = controlsWrap.closest('.audio-tools');
    toolsRoot?.classList.add('hidden');
    return () => {
      toolsRoot?.classList.remove('hidden');
    };
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    controlsWrap.innerHTML = `<div class="empty">${escapeHtml(t('webaudio_unavailable'))}</div>`;
    return () => {};
  }

  const ctx = new AudioContextCtor();
  const source = ctx.createMediaElementSource(mediaEl);
  const hintedChannels = Number(mediaEl.dataset.audioChannels || 0);
  const channelCount = Math.max(1, Math.min(64, hintedChannels || source.channelCount || 2));
  graphCanvas.classList.remove('audio-graph-low-ch', 'audio-graph-mono-ch');
  if (channelCount <= 2 && graphCanvas.closest('#assetDetail')) {
    graphCanvas.classList.add('audio-graph-low-ch');
    if (channelCount === 1) graphCanvas.classList.add('audio-graph-mono-ch');
  }
  // For 8ch merged proxies, channel order differs by browser decoder behavior.
  const isChromeLike = /(Chrome|Chromium|CriOS)/i.test(ua) && !/(Edg|OPR)/i.test(ua);
  const displayToDecoded = channelCount === 8
    ? (isSafari
      ? [1, 2, 0, 7, 5, 6, 3, 4]
      : (isChromeLike
        ? [0, 1, 2, 3, 4, 5, 6, 7]
        : [1, 2, 0, 7, 5, 6, 3, 4]))
    : Array.from({ length: channelCount }, (_v, i) => i);
  const decodedToDisplay = Array.from({ length: channelCount }, () => 0);
  displayToDecoded.forEach((decodedIndex, displayIndex) => {
    if (decodedIndex >= 0 && decodedIndex < channelCount) {
      decodedToDisplay[decodedIndex] = displayIndex;
    }
  });
  const splitter = ctx.createChannelSplitter(channelCount);
  const leftBus = ctx.createGain();
  const rightBus = ctx.createGain();
  const stereoOut = ctx.createChannelMerger(2);
  const masterGain = ctx.createGain();
  const gains = [];
  const analysers = [];
  const selected = Array.from({ length: channelCount }, () => true);
  let rafId = null;

  source.connect(splitter);

  for (let i = 0; i < channelCount; i += 1) {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    splitter.connect(gain, i, 0);
    // Always mix to stereo output for browser compatibility.
    if (i % 2 === 0) gain.connect(leftBus);
    else gain.connect(rightBus);
    splitter.connect(analyser, i, 0);

    gains.push(gain);
    analysers.push(analyser);
  }

  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
  const applyMasterVolume = () => {
    const base = clamp01(Number.isFinite(mediaEl.volume) ? mediaEl.volume : 1);
    masterGain.gain.value = mediaEl.muted ? 0 : base;
  };
  leftBus.connect(stereoOut, 0, 0);
  rightBus.connect(stereoOut, 0, 1);
  stereoOut.connect(masterGain);
  masterGain.connect(ctx.destination);
  applyMasterVolume();

  controlsWrap.innerHTML = selected
    .map(
      (_enabled, displayIndex) => `
        <label class="channel-toggle-cell" title="CH ${displayIndex + 1}">
          <input type="checkbox" data-channel-index="${displayIndex}" checked aria-label="CH ${displayIndex + 1}" />
        </label>
      `
    )
    .join('');
  controlsWrap.style.setProperty('--channel-count', String(channelCount));

  const applyGains = () => {
    gains.forEach((gain, decodedIndex) => {
      const displayIndex = decodedToDisplay[decodedIndex] ?? decodedIndex;
      gain.gain.value = selected[displayIndex] ? 1 : 0;
    });
    // Avoid clipping when many channels are active on same side.
    const activeLeft = gains.reduce((acc, _gain, decodedIndex) => {
      const displayIndex = decodedToDisplay[decodedIndex] ?? decodedIndex;
      return acc + ((decodedIndex % 2 === 0 && selected[displayIndex]) ? 1 : 0);
    }, 0);
    const activeRight = gains.reduce((acc, _gain, decodedIndex) => {
      const displayIndex = decodedToDisplay[decodedIndex] ?? decodedIndex;
      return acc + ((decodedIndex % 2 === 1 && selected[displayIndex]) ? 1 : 0);
    }, 0);
    leftBus.gain.value = 1 / Math.max(1, activeLeft);
    rightBus.gain.value = 1 / Math.max(1, activeRight);
  };

  const onChannelChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const index = Number(target.dataset.channelIndex);
    if (Number.isNaN(index)) return;

    if (groupChannelsInput.checked) {
      const nextValue = target.checked;
      selected.fill(nextValue);
      controlsWrap.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = nextValue;
      });
    } else {
      selected[index] = target.checked;
    }

    applyGains();
  };
  applyGains();

  const g = graphCanvas.getContext('2d');
  if (!g) {
    controlsWrap.innerHTML = `<div class="empty">${escapeHtml(t('audiograph_unsupported'))}</div>`;
    source.disconnect();
    splitter.disconnect();
    leftBus.disconnect();
    rightBus.disconnect();
    stereoOut.disconnect();
    gains.forEach((node) => node.disconnect());
    analysers.forEach((node) => node.disconnect());
    ctx.close().catch(() => {});
    return () => {};
  }

  const onMediaPlay = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const ensureAudioContext = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const onVolumeChange = () => {
    applyMasterVolume();
  };

  controlsWrap.addEventListener('change', onChannelChange);
  mediaEl.addEventListener('play', onMediaPlay);
  mediaEl.addEventListener('playing', ensureAudioContext);
  mediaEl.addEventListener('volumechange', ensureAudioContext);
  mediaEl.addEventListener('volumechange', onVolumeChange);
  window.addEventListener('pointerdown', ensureAudioContext, { passive: true });

  const peakHold = Array.from({ length: channelCount }, () => 0);
  // Meter calibration:
  // -18 dB RMS sine should look close to upper range (for easier visual matching),
  // while preserving a fixed headroom for unusually hot material.
  const METER_HEADROOM = 0.12;
  const METER_REF_RMS = 0.17783; // approx RMS for alignment tone in this project
  const METER_REF_VISUAL = 0.78; // where alignment tone should sit in meter
  const METER_SCALE = METER_REF_VISUAL / METER_REF_RMS;
  let oneShotRafId = null;
  let framePreviewBusy = false;
  let suppressSeekedPreview = false;
  let lastLevelsEmitTs = 0;
  const resizeCanvasToDisplay = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const displayW = Math.max(180, Math.round(graphCanvas.clientWidth || 320));
    const displayH = Math.max(180, Math.round(graphCanvas.clientHeight || 320));
    const pixelW = Math.round(displayW * dpr);
    const pixelH = Math.round(displayH * dpr);
    if (graphCanvas.width !== pixelW || graphCanvas.height !== pixelH) {
      graphCanvas.width = pixelW;
      graphCanvas.height = pixelH;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.scale(dpr, dpr);
    return { width: displayW, height: displayH };
  };

  const renderAudioGraph = () => {
    const { width, height } = resizeCanvasToDisplay();
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#121212';
    g.fillRect(0, 0, width, height);

    const cols = channelCount;
    const gap = 10;
    const isDetailGraph = Boolean(graphCanvas.closest('#assetDetail'));
    const baselineCols = 8;
    const baselineMeterW = Math.max(18, Math.floor((width - ((baselineCols + 1) * gap)) / baselineCols));
    const computedMeterW = Math.max(18, Math.floor((width - ((cols + 1) * gap)) / cols));
    const meterW = isDetailGraph ? Math.min(computedMeterW, baselineMeterW) : computedMeterW;
    const meterH = Math.max(80, height - 44);
    const totalMetersW = (cols * meterW) + ((cols - 1) * gap);
    const startX = Math.max(gap, Math.round((width - totalMetersW) / 2));
    controlsWrap.style.gridTemplateColumns = `repeat(${cols}, ${meterW}px)`;
    controlsWrap.style.columnGap = `${gap}px`;
    controlsWrap.style.rowGap = '2px';
    controlsWrap.style.width = `${totalMetersW}px`;
    controlsWrap.style.marginLeft = `${startX}px`;
    controlsWrap.style.marginRight = '0';
    const frameLevels = Array.from({ length: channelCount }, () => 0);
    analysers.forEach((analyser, decodedIndex) => {
      const channelIndex = decodedToDisplay[decodedIndex] ?? decodedIndex;
      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);

      let sumSq = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const n = (timeData[i] - 128) / 128;
        sumSq += n * n;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const level = Math.max(0, Math.min(1 - METER_HEADROOM, rms * METER_SCALE));
      frameLevels[channelIndex] = level;
      peakHold[channelIndex] = Math.max(level, peakHold[channelIndex] * 0.96);

      const x = startX + (channelIndex * (meterW + gap));
      const y = 10;
      g.fillStyle = '#1f2430';
      g.fillRect(x, y, meterW, meterH);

      // Slight top band to visualize reserved headroom.
      const headroomH = Math.max(2, Math.round(meterH * METER_HEADROOM));
      g.fillStyle = 'rgba(125, 142, 173, 0.16)';
      g.fillRect(x, y, meterW, headroomH);

      const activeH = Math.max(2, Math.round(meterH * level));
      const py = y + meterH - activeH;
      const grad = g.createLinearGradient(0, y, 0, y + meterH);
      if (selected[channelIndex]) {
        grad.addColorStop(0, '#e74c3c');
        grad.addColorStop(0.35, '#f1c40f');
        grad.addColorStop(1, '#2ecc71');
      } else {
        grad.addColorStop(0, '#6b7280');
        grad.addColorStop(1, '#4b5563');
      }
      g.fillStyle = grad;
      g.fillRect(x, py, meterW, activeH);

      const peakY = y + meterH - Math.round(meterH * peakHold[channelIndex]);
      g.fillStyle = '#ecf0f1';
      g.fillRect(x, peakY, meterW, 2);

      g.fillStyle = '#dce3f3';
      g.font = '11px IBM Plex Sans';
      g.textAlign = 'center';
      g.fillText(`CH ${channelIndex + 1}`, x + (meterW / 2), y + meterH + 16);
    });
    g.textAlign = 'left';
    const now = Date.now();
    if (now - lastLevelsEmitTs > 48) {
      lastLevelsEmitTs = now;
      mediaEl.dispatchEvent(new CustomEvent('mam:audio-levels', { detail: { levels: frameLevels } }));
    }
  };

  const draw = () => {
    renderAudioGraph();
    rafId = requestAnimationFrame(draw);
  };

  const renderOneShot = () => {
    if (oneShotRafId != null) cancelAnimationFrame(oneShotRafId);
    oneShotRafId = requestAnimationFrame(() => {
      oneShotRafId = null;
      renderAudioGraph();
    });
  };

  const onSeekedPreview = () => {
    if (suppressSeekedPreview) return;
    renderOneShot();
  };

  const onFrameStepPreview = async () => {
    if (!mediaEl.paused) return;
    ensureAudioContext();
    renderOneShot();
    if (framePreviewBusy) return;
    framePreviewBusy = true;
    const snapTime = Number(mediaEl.currentTime || 0);
    const prevMuted = mediaEl.muted;
    const prevVolume = Number.isFinite(mediaEl.volume) ? mediaEl.volume : 1;
    const previewVolume = prevVolume > 0 ? prevVolume : 0.65;
    try {
      // Play a tiny audible slice around stepped frame for manual frame-by-frame audio cue.
      mediaEl.muted = false;
      mediaEl.volume = previewVolume;
      await mediaEl.play();
      await new Promise((resolve) => setTimeout(resolve, 34));
    } catch (_error) {
      // User gesture/autoplay rules may prevent preview play.
    } finally {
      try { mediaEl.pause(); } catch (_error) {}
      suppressSeekedPreview = true;
      try { mediaEl.currentTime = snapTime; } catch (_error) {}
      setTimeout(() => { suppressSeekedPreview = false; }, 0);
      mediaEl.muted = prevMuted;
      mediaEl.volume = prevVolume;
      framePreviewBusy = false;
      renderOneShot();
    }
  };

  mediaEl.addEventListener('seeked', onSeekedPreview);
  mediaEl.addEventListener('mam:frame-step', onFrameStepPreview);

  draw();

  return () => {
    controlsWrap.removeEventListener('change', onChannelChange);
    mediaEl.removeEventListener('play', onMediaPlay);
    mediaEl.removeEventListener('playing', ensureAudioContext);
    mediaEl.removeEventListener('volumechange', ensureAudioContext);
    mediaEl.removeEventListener('volumechange', onVolumeChange);
    mediaEl.removeEventListener('seeked', onSeekedPreview);
    mediaEl.removeEventListener('mam:frame-step', onFrameStepPreview);
    window.removeEventListener('pointerdown', ensureAudioContext);
    if (rafId) cancelAnimationFrame(rafId);
    if (oneShotRafId) cancelAnimationFrame(oneShotRafId);
    source.disconnect();
    splitter.disconnect();
    leftBus.disconnect();
    rightBus.disconnect();
    stereoOut.disconnect();
    masterGain.disconnect();
    gains.forEach((node) => node.disconnect());
    analysers.forEach((node) => node.disconnect());
    ctx.close().catch(() => {});
  };
}

function initVideoSubtitleTools(mediaEl, asset, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const statusEl = byId('subtitleStatus');
  const busyEl = byId('subtitleBusy');
  const currentEl = byId('videoSubtitleCurrent');
  const itemsEl = byId('subtitleItems');
  const overlayCheck = byId('subtitleOverlayCheck');
  const langInput = byId('subtitleLangInput');
  const labelInput = byId('subtitleLabelInput');
  const modelSelect = byId('subtitleModelSelect');
  const audioStreamSelect = byId('subtitleAudioStreamSelect');
  const audioChannelSelect = byId('subtitleAudioChannelSelect');
  const zemberekCheck = byId('subtitleZemberekCheck');
  const renameBtn = byId('subtitleRenameBtn');
  const fileInput = byId('subtitleFileInput');
  const uploadBtn = byId('subtitleUploadBtn');
  const generateBtn = byId('subtitleGenerateBtn');
  const searchInput = byId('subtitleSearchInput');
  const searchBtn = byId('subtitleSearchBtn');
  const searchSuggestEl = byId('subtitleSearchSuggest');
  const searchResultsEl = byId('subtitleSearchResults');
  if (!statusEl || !itemsEl || !langInput || !labelInput || !modelSelect || !audioStreamSelect || !audioChannelSelect || !zemberekCheck || !renameBtn || !fileInput || !uploadBtn || !generateBtn || !searchInput || !searchBtn || !searchResultsEl || !searchSuggestEl) return () => {};
  let subtitleSuggestItems = [];
  let subtitleSuggestActive = -1;
  let subtitleSuggestTimer = null;

  const getLang = () => String(langInput.value || '').trim().toLowerCase().slice(0, 12) || 'tr';
  const getModel = () => 'small';
  const getAudioStreamOptions = () => Array.isArray(asset.audioStreamOptions) ? asset.audioStreamOptions : [];
  const getSelectedAudioStream = () => {
    const value = String(audioStreamSelect.value || '').trim();
    return value ? Number(value) : null;
  };
  const getSelectedAudioChannel = () => {
    const value = String(audioChannelSelect.value || '').trim();
    return value ? Number(value) : null;
  };
  const getOverlayEnabled = () => getSubtitleOverlayEnabled(asset.id, false);

  const setStatus = (text) => {
    statusEl.textContent = text;
    if (currentEl) currentEl.textContent = asset.subtitleLabel || asset.subtitleLang || '-';
  };
  const setBusy = (busy) => {
    if (busyEl) busyEl.classList.toggle('hidden', !busy);
    renameBtn.disabled = busy;
    uploadBtn.disabled = busy;
    generateBtn.disabled = busy;
    modelSelect.disabled = busy;
    audioStreamSelect.disabled = busy || getAudioStreamOptions().length <= 1;
    audioChannelSelect.disabled = busy || audioChannelSelect.options.length <= 1;
    zemberekCheck.disabled = busy;
    searchBtn.disabled = busy;
  };

  const renderAudioChannelOptions = () => {
    const selectedStreamIndex = getSelectedAudioStream();
    const selectedStream = getAudioStreamOptions().find((item) => Number(item.index) === selectedStreamIndex) || null;
    const channelCount = Math.max(0, Number(selectedStream?.channels) || 0);
    const rows = [`<option value="">${escapeHtml(t('subtitle_audio_channel_mix'))}</option>`];
    for (let i = 1; i <= channelCount; i += 1) {
      rows.push(`<option value="${i}">CH ${i}</option>`);
    }
    audioChannelSelect.innerHTML = rows.join('');
    audioChannelSelect.disabled = channelCount <= 1;
  };

  const renderAudioStreamOptions = () => {
    const streamOptions = getAudioStreamOptions();
    const rows = [`<option value="">${escapeHtml(t('subtitle_audio_stream_default'))}</option>`];
    streamOptions.forEach((item) => {
      rows.push(`<option value="${escapeHtml(String(item.index))}">${escapeHtml(item.label || `A${Number(item.order || 0) + 1}`)}</option>`);
    });
    audioStreamSelect.innerHTML = rows.join('');
    if (streamOptions.length === 1) {
      audioStreamSelect.value = String(streamOptions[0].index);
    }
    audioStreamSelect.disabled = streamOptions.length <= 1;
    renderAudioChannelOptions();
  };

  const applyTrackMode = () => {
    syncSubtitleOverlayInOpenPlayers(asset);
  };

  const applyTrack = (subtitleUrl, subtitleLang, subtitleLabel) => {
    asset.subtitleUrl = String(subtitleUrl || '').trim();
    asset.subtitleLang = String(subtitleLang || getLang()).trim();
    asset.subtitleLabel = String(subtitleLabel || '').trim();
    if (!asset.subtitleUrl) {
      setStatus(t('subtitle_none'));
      applyTrackMode();
      return;
    }
    if (labelInput && asset.subtitleLabel) labelInput.value = asset.subtitleLabel;
    setStatus(`${t('subtitle_loaded')}: ${asset.subtitleLabel || asset.subtitleLang || ''}`);
    applyTrackMode();
  };
  const subtitleItems = () => Array.isArray(asset.subtitleItems) ? asset.subtitleItems : [];
  const applyAssetFromApi = (mappedAsset) => {
    if (!mappedAsset || typeof mappedAsset !== 'object') return;
    asset.subtitleUrl = mappedAsset.subtitleUrl || asset.subtitleUrl || '';
    asset.subtitleLang = mappedAsset.subtitleLang || asset.subtitleLang || getLang();
    asset.subtitleLabel = mappedAsset.subtitleLabel || asset.subtitleLabel || '';
    asset.subtitleItems = Array.isArray(mappedAsset.subtitleItems) ? mappedAsset.subtitleItems : (asset.subtitleItems || []);
    asset.audioStreamOptions = Array.isArray(mappedAsset.audioStreamOptions) ? mappedAsset.audioStreamOptions : (asset.audioStreamOptions || []);
  };
  const renderSearchResults = (matches = [], didYouMean = '', query = '', fuzzyUsed = false) => {
    const suggestion = String(didYouMean || '').trim();
    const normalizedSuggestion = suggestion.toLocaleLowerCase('tr-TR');
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase('tr-TR');
    const showSuggestion = Boolean(suggestion) && normalizedSuggestion !== normalizedQuery;
    const highlightQuery = showSuggestion ? suggestion : query;
    const highlightClass = (showSuggestion || fuzzyUsed) ? 'search-hit-fuzzy' : 'search-hit';
    const suggestionHtml = showSuggestion
      ? `
        <div class="subtitle-item-empty">
          ${escapeHtml(t('subtitle_did_you_mean'))}:
          <button type="button" class="subtitle-item-use-btn" data-subtitle-did-you-mean="1">${escapeHtml(suggestion)}</button>
        </div>
      `
      : '';

    if (!Array.isArray(matches) || !matches.length) {
      searchResultsEl.innerHTML = `${suggestionHtml}<div class="subtitle-item-empty">${escapeHtml(t('subtitle_search_empty'))}</div>`;
      const didYouMeanBtn = searchResultsEl.querySelector('[data-subtitle-did-you-mean="1"]');
      didYouMeanBtn?.addEventListener('click', () => {
        searchInput.value = suggestion;
        onSubtitleSearch();
      });
      return;
    }
    searchResultsEl.innerHTML = `${suggestionHtml}${matches.map((item) => `
      <div class="subtitle-item-row">
        <span class="subtitle-item-label">[${escapeHtml(String(item.startTc || '').slice(0, 12))}] ${highlightMatch(item.text || '', highlightQuery, highlightClass)}</span>
        <button type="button" class="subtitle-item-use-btn" data-jump-sec="${escapeHtml(String(item.startSec || 0))}">${t('subtitle_jump')}</button>
      </div>
    `).join('')}`;
    const didYouMeanBtn = searchResultsEl.querySelector('[data-subtitle-did-you-mean="1"]');
    didYouMeanBtn?.addEventListener('click', () => {
      searchInput.value = suggestion;
      onSubtitleSearch();
    });
    searchResultsEl.querySelectorAll('.subtitle-item-use-btn').forEach((btn) => {
      if (btn.hasAttribute('data-subtitle-did-you-mean')) return;
      btn.addEventListener('click', (event) => {
        const sec = Number(event.currentTarget?.dataset?.jumpSec || 0);
        const video = mediaEl || root.querySelector('#assetVideo') || document.querySelector('#assetVideo');
        if (!video || !Number.isFinite(sec)) return;
        video.currentTime = Math.max(0, sec);
        video.play().catch(() => {});
      });
    });
  };
  const hideSubtitleSuggest = () => {
    searchSuggestEl.classList.add('hidden');
    searchSuggestEl.innerHTML = '';
    subtitleSuggestItems = [];
    subtitleSuggestActive = -1;
  };
  const setSubtitleSuggestActive = (index) => {
    const buttons = Array.from(searchSuggestEl.querySelectorAll('.search-suggest-item'));
    if (!buttons.length) {
      subtitleSuggestActive = -1;
      return;
    }
    subtitleSuggestActive = Math.max(0, Math.min(buttons.length - 1, index));
    buttons.forEach((btn, idx) => btn.classList.toggle('active', idx === subtitleSuggestActive));
  };
  const renderSubtitleSuggest = (items, query) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      hideSubtitleSuggest();
      return;
    }
    subtitleSuggestItems = list;
    subtitleSuggestActive = -1;
    searchSuggestEl.innerHTML = list.map((item, index) => `
      <button type="button" class="search-suggest-item" data-index="${index}">
        <strong>[${escapeHtml(String(item.startTc || '').slice(0, 12))}]</strong>
        <span>${highlightSuggestText(String(item.text || ''), query)}</span>
      </button>
    `).join('');
    searchSuggestEl.classList.remove('hidden');
  };
  const requestSubtitleSuggest = async () => {
    const q = String(searchInput.value || '').trim();
    if (q.length < 2) {
      hideSubtitleSuggest();
      return;
    }
    try {
      const result = await api(`/api/assets/${asset.id}/subtitles/suggest?q=${encodeURIComponent(q)}&limit=8`);
      renderSubtitleSuggest(result, q);
    } catch (_error) {
      hideSubtitleSuggest();
    }
  };
  const queueSubtitleSuggest = () => {
    if (subtitleSuggestTimer) clearTimeout(subtitleSuggestTimer);
    subtitleSuggestTimer = setTimeout(() => {
      requestSubtitleSuggest().catch(() => {});
    }, 170);
  };
  const renderSubtitleItems = () => {
    const items = subtitleItems();
    if (!items.length) {
      itemsEl.innerHTML = `<div class="subtitle-item-empty">${escapeHtml(t('subtitle_no_items'))}</div>`;
      return;
    }
    itemsEl.innerHTML = items.map((item) => {
      const active = item.subtitleUrl === asset.subtitleUrl;
      return `
        <div class="subtitle-item-row ${active ? 'active' : ''}" data-subtitle-url="${escapeHtml(item.subtitleUrl)}">
          <span class="subtitle-item-label">${escapeHtml(item.subtitleLabel || item.subtitleLang || 'subtitle')}</span>
          <span class="subtitle-item-lang">${escapeHtml(item.subtitleLang || '')}</span>
          <a class="subtitle-item-download-btn" href="${escapeHtml(item.subtitleUrl)}" download target="_blank" rel="noreferrer">${t('subtitle_download')}</a>
          ${currentUserCanDeleteAssetsRef.get() ? `<button type="button" class="subtitle-item-remove-btn">${t('subtitle_remove')}</button>` : ''}
          <button type="button" class="subtitle-item-use-btn">${active ? t('subtitle_active') : t('subtitle_use')}</button>
        </div>
      `;
    }).join('');
    itemsEl.querySelectorAll('.subtitle-item-use-btn').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const rowEl = event.currentTarget.closest('.subtitle-item-row');
        const subtitleUrl = rowEl?.dataset?.subtitleUrl || '';
        if (!subtitleUrl) return;
        const selected = subtitleItems().find((it) => it.subtitleUrl === subtitleUrl);
        if (!selected) return;
        setBusy(true);
        try {
          const result = await api(`/api/assets/${asset.id}/subtitles`, {
            method: 'PATCH',
            body: JSON.stringify({
              subtitleUrl,
              label: selected.subtitleLabel,
              lang: selected.subtitleLang
            })
          });
          applyAssetFromApi(result.asset);
          applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
          renderSubtitleItems();
        } catch (error) {
          alert(String(error?.message || 'Subtitle selection failed'));
        } finally {
          setBusy(false);
        }
      });
    });
    itemsEl.querySelectorAll('.subtitle-item-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const rowEl = event.currentTarget.closest('.subtitle-item-row');
        const subtitleUrl = rowEl?.dataset?.subtitleUrl || '';
        if (!subtitleUrl) return;
        if (!confirm(t('subtitle_remove_confirm'))) return;
        setBusy(true);
        try {
          const result = await api(`/api/assets/${asset.id}/subtitles`, {
            method: 'DELETE',
            body: JSON.stringify({ subtitleUrl })
          });
          applyAssetFromApi(result.asset);
          applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
          renderSubtitleItems();
        } catch (error) {
          alert(String(error?.message || 'Subtitle remove failed'));
        } finally {
          setBusy(false);
        }
      });
    });
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pollSubtitleJob = async (jobId, maxMs = 3 * 60 * 60 * 1000, intervalMs = 2000) => {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      const job = await api(`/api/subtitle-jobs/${encodeURIComponent(jobId)}`);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') {
        throw new Error(job.error || t('subtitle_job_failed'));
      }
      setStatus(`${t('subtitle_job_started')} (${job.status})`);
      await wait(intervalMs);
    }
    throw new Error('Subtitle generation is still running. Please check again in a moment.');
  };

  const onUpload = async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      alert(t('subtitle_file_required'));
      return;
    }
    const lowerName = String(file.name || '').toLowerCase();
    if (!lowerName.endsWith('.vtt') && !lowerName.endsWith('.srt')) {
      alert(t('subtitle_file_required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        fileName: file.name,
        fileData: await readFileAsBase64(file),
        lang: getLang()
      };
      const result = await api(`/api/assets/${asset.id}/subtitles`, { method: 'POST', body: JSON.stringify(payload) });
      applyAssetFromApi(result.asset);
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || file.name;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_upload_success')} ${asset.subtitleLabel || file.name}`);
    } catch (error) {
      alert(String(error?.message || 'Subtitle upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const requestedLabel = String(labelInput.value || '').trim() || 'auto-whisper';
      const queued = await api(`/api/assets/${asset.id}/subtitles/generate`, {
        method: 'POST',
        body: JSON.stringify({
          lang: getLang(),
          label: requestedLabel,
          model: getModel(),
          useWhisperX: false,
          turkishAiCorrect: String(getLang() || '').toLowerCase().startsWith('tr'),
          useZemberekLexicon: String(getLang() || '').toLowerCase().startsWith('tr') && Boolean(zemberekCheck.checked),
          audioStreamIndex: getSelectedAudioStream(),
          audioChannelIndex: getSelectedAudioChannel()
        })
      });
      setStatus(t('subtitle_job_started'));
      const result = await pollSubtitleJob(queued.jobId);
      if (String(result.warning || '').trim()) {
        alert(String(result.warning));
      }
      applyAssetFromApi(result.asset);
      if (!asset.subtitleUrl) asset.subtitleUrl = result.subtitleUrl || '';
      if (!asset.subtitleLang) asset.subtitleLang = result.subtitleLang || getLang();
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || requestedLabel;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_generate_success')} ${asset.subtitleLabel}`.trim());
    } catch (error) {
      alert(String(error?.message || 'Subtitle generation failed'));
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    if (!asset.subtitleUrl) {
      setStatus(t('subtitle_none'));
      return;
    }
    const nextLabel = String(labelInput.value || '').trim();
    if (!nextLabel) {
      alert(t('subtitle_name'));
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/api/assets/${asset.id}/subtitles`, {
        method: 'PATCH',
        body: JSON.stringify({ subtitleUrl: asset.subtitleUrl, label: nextLabel, lang: getLang() })
      });
      applyAssetFromApi(result.asset);
      if (!asset.subtitleUrl) asset.subtitleUrl = result.subtitleUrl;
      if (!asset.subtitleLang) asset.subtitleLang = result.subtitleLang || getLang();
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || nextLabel;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_rename_success')} ${asset.subtitleLabel}`.trim());
    } catch (error) {
      alert(String(error?.message || 'Subtitle rename failed'));
    } finally {
      setBusy(false);
    }
  };

  const onOverlayChange = () => {
    subtitleOverlayEnabledByAsset.set(asset.id, Boolean(overlayCheck?.checked));
    applyTrackMode();
  };
  const onSubtitleSearch = async () => {
    const q = String(searchInput.value || '').trim();
    if (q.length < 1) {
      renderSearchResults([]);
      return;
    }
    searchBtn.disabled = true;
    hideSubtitleSuggest();
    try {
      const result = await api(`/api/assets/${asset.id}/subtitles/search?q=${encodeURIComponent(q)}&limit=30`);
      renderSearchResults(
        Array.isArray(result.matches) ? result.matches : [],
        String(result.didYouMean || '').trim(),
        q,
        Boolean(result.fuzzyUsed)
      );
    } catch (error) {
      alert(String(error?.message || 'Subtitle search failed'));
    } finally {
      searchBtn.disabled = false;
    }
  };
  const onSubtitleSearchEnter = (event) => {
    const isOpen = !searchSuggestEl.classList.contains('hidden');
    if (isOpen && event.key === 'ArrowDown') {
      event.preventDefault();
      setSubtitleSuggestActive((subtitleSuggestActive < 0 ? -1 : subtitleSuggestActive) + 1);
      return;
    }
    if (isOpen && event.key === 'ArrowUp') {
      event.preventDefault();
      setSubtitleSuggestActive((subtitleSuggestActive < 0 ? subtitleSuggestItems.length : subtitleSuggestActive) - 1);
      return;
    }
    if (isOpen && event.key === 'Escape') {
      hideSubtitleSuggest();
      return;
    }
    if (isOpen && event.key === 'Enter' && subtitleSuggestActive >= 0 && subtitleSuggestItems[subtitleSuggestActive]) {
      event.preventDefault();
      const selected = subtitleSuggestItems[subtitleSuggestActive];
      searchInput.value = String(selected.text || searchInput.value || '').trim();
      hideSubtitleSuggest();
      onSubtitleSearch();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubtitleSearch();
    }
  };

  renameBtn.addEventListener('click', onRename);
  uploadBtn.addEventListener('click', onUpload);
  generateBtn.addEventListener('click', onGenerate);
  searchBtn.addEventListener('click', onSubtitleSearch);
  searchInput.addEventListener('keydown', onSubtitleSearchEnter);
  searchInput.addEventListener('input', queueSubtitleSuggest);
  searchInput.addEventListener('focus', queueSubtitleSuggest);
  searchInput.addEventListener('blur', () => {
    setTimeout(() => hideSubtitleSuggest(), 120);
  });
  searchSuggestEl.addEventListener('mousedown', (event) => event.preventDefault());
  searchSuggestEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.search-suggest-item');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= subtitleSuggestItems.length) return;
    const selected = subtitleSuggestItems[idx];
    searchInput.value = String(selected.text || searchInput.value || '').trim();
    hideSubtitleSuggest();
    onSubtitleSearch();
  });
  overlayCheck?.addEventListener('change', onOverlayChange);
  audioStreamSelect.addEventListener('change', renderAudioChannelOptions);

  renderAudioStreamOptions();

  if (asset.subtitleUrl) {
    applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
  } else {
    setStatus(t('subtitle_none'));
  }
  renderSubtitleItems();
  renderSearchResults([]);
  hideSubtitleSuggest();
  if (overlayCheck) overlayCheck.checked = getOverlayEnabled();
  applyTrackMode();

  return () => {
    renameBtn.removeEventListener('click', onRename);
    uploadBtn.removeEventListener('click', onUpload);
    generateBtn.removeEventListener('click', onGenerate);
    searchBtn.removeEventListener('click', onSubtitleSearch);
    searchInput.removeEventListener('keydown', onSubtitleSearchEnter);
    searchInput.removeEventListener('input', queueSubtitleSuggest);
    searchInput.removeEventListener('focus', queueSubtitleSuggest);
    overlayCheck?.removeEventListener('change', onOverlayChange);
    audioStreamSelect.removeEventListener('change', renderAudioChannelOptions);
  };
}

function initVideoOcrTools(asset, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const statusEl = byId('videoOcrStatus');
  const busyEl = byId('videoOcrBusy');
  const intervalInput = byId('videoOcrIntervalInput');
  const langInput = byId('videoOcrLangInput');
  const presetSelect = byId('videoOcrPresetSelect');
  const labelInput = byId('videoOcrLabelInput');
  const engineSelect = byId('videoOcrEngineSelect');
  const preprocessSelect = byId('videoOcrPreprocessSelect');
  const advancedCheck = byId('videoOcrAdvancedCheck');
  const aiCorrectCheck = byId('videoOcrAiCorrectCheck');
  const blurFilterCheck = byId('videoOcrBlurFilterCheck');
  const blurThresholdInput = byId('videoOcrBlurThresholdInput');
  const regionModeCheck = byId('videoOcrRegionModeCheck');
  const tickerHeightInput = byId('videoOcrTickerHeightInput');
  const staticFilterCheck = byId('videoOcrStaticFilterCheck');
  const ignorePhrasesInput = byId('videoOcrIgnorePhrasesInput');
  const minDisplayInput = byId('videoOcrMinDisplayInput');
  const mergeGapInput = byId('videoOcrMergeGapInput');
  const extractBtn = byId('videoOcrExtractBtn');
  const downloadLink = byId('videoOcrDownloadLink');
  const saveBtn = byId('videoOcrSaveBtn');
  if (!statusEl
    || !busyEl
    || !intervalInput
    || !langInput
    || !presetSelect
    || !labelInput
    || !engineSelect
    || !preprocessSelect
    || !advancedCheck
    || !aiCorrectCheck
    || !blurFilterCheck
    || !blurThresholdInput
    || !regionModeCheck
    || !tickerHeightInput
    || !staticFilterCheck
    || !ignorePhrasesInput
    || !minDisplayInput
    || !mergeGapInput
    || !extractBtn
    || !downloadLink
    || !saveBtn) return () => {};

  let disposed = false;
  let saveTargetJobId = '';

  const setBusy = (busy) => {
    busyEl.classList.toggle('hidden', !busy);
    extractBtn.disabled = busy;
    intervalInput.disabled = busy;
    langInput.disabled = busy;
    presetSelect.disabled = busy;
    labelInput.disabled = busy;
    engineSelect.disabled = busy;
    preprocessSelect.disabled = busy;
    advancedCheck.disabled = busy;
    aiCorrectCheck.disabled = busy;
    blurFilterCheck.disabled = busy;
    blurThresholdInput.disabled = busy;
    regionModeCheck.disabled = busy;
    tickerHeightInput.disabled = busy;
    staticFilterCheck.disabled = busy;
    ignorePhrasesInput.disabled = busy;
    minDisplayInput.disabled = busy;
    mergeGapInput.disabled = busy;
    saveBtn.disabled = busy;
  };
  const setStatus = (text) => {
    statusEl.textContent = text;
  };
  const setDownload = (url = '') => {
    if (!url) {
      downloadLink.classList.add('hidden');
      downloadLink.href = '#';
      return;
    }
    downloadLink.classList.remove('hidden');
    downloadLink.href = String(url);
  };
  const setSaveVisible = (visible, jobId = '') => {
    saveTargetJobId = visible ? String(jobId || '') : '';
    saveBtn.classList.toggle('hidden', !visible);
  };
  const applyPresetDefaults = () => {
    const preset = String(presetSelect.value || 'general').trim();
    if (preset === 'ticker') {
      intervalInput.value = '2';
      preprocessSelect.value = 'strong';
      advancedCheck.checked = true;
      blurFilterCheck.checked = true;
      blurThresholdInput.value = '80';
      regionModeCheck.checked = true;
      tickerHeightInput.value = '20';
      staticFilterCheck.checked = false;
      minDisplayInput.value = '6';
      mergeGapInput.value = '2';
      return;
    }
    if (preset === 'credits') {
      intervalInput.value = '2';
      preprocessSelect.value = 'strong';
      advancedCheck.checked = true;
      blurFilterCheck.checked = true;
      blurThresholdInput.value = '80';
      regionModeCheck.checked = false;
      staticFilterCheck.checked = false;
      minDisplayInput.value = '10';
      mergeGapInput.value = '6';
      return;
    }
    if (preset === 'static') {
      intervalInput.value = '4';
      preprocessSelect.value = 'light';
      advancedCheck.checked = true;
      blurFilterCheck.checked = true;
      blurThresholdInput.value = '80';
      regionModeCheck.checked = false;
      staticFilterCheck.checked = true;
      minDisplayInput.value = '12';
      mergeGapInput.value = '8';
      return;
    }
    intervalInput.value = '4';
    preprocessSelect.value = 'light';
    advancedCheck.checked = true;
    blurFilterCheck.checked = true;
    blurThresholdInput.value = '80';
    regionModeCheck.checked = false;
    staticFilterCheck.checked = true;
    minDisplayInput.value = '8';
    mergeGapInput.value = '4';
  };
  const applyJobStatus = (job, options = {}) => {
    const status = String(job?.status || '').trim();
    if (status === 'failed') {
      setStatus(`${t('video_ocr_failed')} ${String(job?.error || '').trim()}`.trim());
      setDownload('');
      setSaveVisible(false, '');
      return;
    }
    const isDone = status === 'completed';
    const engineTag = String(job?.ocrEngine || engineSelect.value || '').trim();
    const lineTag = job?.lineCount ? `(${job.lineCount})` : '';
    const segmentTag = job?.segmentCount ? `segments:${job.segmentCount}` : '';
    const modeTag = String(job?.mode || '').trim();
    const url = String(job?.downloadUrl || '').trim() || String(job?.resultUrl || '').trim();
    setDownload(isDone ? url : '');
    const isDbSaved = Boolean(job?.saved) || String(job?.source || '') === 'db';
    setSaveVisible(isDone && !isDbSaved && String(job?.jobId || '').trim(), String(job?.jobId || '').trim());
    if (isDone) {
      setStatus(`${t('video_ocr_done')} ${engineTag ? `[${engineTag}]` : ''} ${modeTag ? `[${modeTag}]` : ''} ${lineTag} ${segmentTag}`.trim());
      if (options.showSavedToast) setStatus(t('video_ocr_saved'));
      return;
    }
    setStatus(`${t('video_ocr_running')} (${status || 'running'})`);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const poll = async (jobId, maxMs = 3 * 60 * 60 * 1000, intervalMs = 2000) => {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      if (disposed) return null;
      const job = await api(`/api/video-ocr-jobs/${encodeURIComponent(jobId)}`);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error || t('video_ocr_failed'));
      applyJobStatus(job);
      await wait(intervalMs);
    }
    throw new Error('OCR job is still running. Please check again in a moment.');
  };
  const watchJob = async (jobId) => {
    if (!jobId || disposed) return;
    setBusy(true);
    try {
      const done = await poll(jobId);
      if (!done || disposed) return;
      applyJobStatus(done);
      const warnTag = String(done.warning || '').trim();
      if (warnTag) alert(warnTag);
    } catch (error) {
      if (disposed) return;
      setStatus(t('video_ocr_failed'));
      alert(String(error?.message || 'Video OCR failed'));
    } finally {
      if (!disposed) setBusy(false);
    }
  };
  const restoreLatest = async () => {
    try {
      const latest = await api(`/api/assets/${asset.id}/video-ocr/latest`);
      if (disposed || !latest) return;
      applyJobStatus(latest);
      if (latest.status === 'queued' || latest.status === 'running') {
        watchJob(latest.jobId);
      }
    } catch (_error) {
      // no job yet
    }
  };

  const onExtract = async () => {
    setBusy(true);
    setSaveVisible(false, '');
    setStatus(t('video_ocr_running'));
    try {
      const queued = await api(`/api/assets/${asset.id}/video-ocr/extract`, {
        method: 'POST',
        body: JSON.stringify({
          intervalSec: Number(intervalInput.value || 4),
          ocrLang: String(langInput.value || '').trim() || 'eng+tur',
          ocrPreset: String(presetSelect.value || 'general').trim() || 'general',
          ocrLabel: String(labelInput.value || '').trim(),
          ocrEngine: String(engineSelect.value || 'paddle'),
          preprocessProfile: String(preprocessSelect.value || 'light'),
          advancedMode: Boolean(advancedCheck.checked),
          turkishAiCorrect: Boolean(aiCorrectCheck.checked),
          enableBlurFilter: Boolean(blurFilterCheck.checked),
          blurThreshold: Number(blurThresholdInput.value || 80),
          enableRegionMode: Boolean(regionModeCheck.checked),
          tickerHeightPct: Number(tickerHeightInput.value || 20),
          ignoreStaticOverlays: Boolean(staticFilterCheck.checked),
          ignorePhrases: String(ignorePhrasesInput.value || '').trim(),
          minDisplaySec: Number(minDisplayInput.value || 8),
          mergeGapSec: Number(mergeGapInput.value || 4)
        })
      });
      watchJob(queued.jobId);
    } catch (error) {
      setStatus(t('video_ocr_failed'));
      alert(String(error?.message || 'Video OCR failed'));
      setBusy(false);
    }
  };
  const onSave = async () => {
    if (!saveTargetJobId) return;
    saveBtn.disabled = true;
    try {
      await api(`/api/assets/${asset.id}/video-ocr/save`, {
        method: 'POST',
        body: JSON.stringify({ jobId: saveTargetJobId })
      });
      setSaveVisible(false, '');
      setStatus(t('video_ocr_saved'));
    } catch (error) {
      alert(String(error?.message || 'Failed to save OCR result'));
    } finally {
      saveBtn.disabled = false;
    }
  };

  extractBtn.addEventListener('click', onExtract);
  saveBtn.addEventListener('click', onSave);
  presetSelect.addEventListener('change', applyPresetDefaults);
  setStatus('');
  setDownload('');
  setSaveVisible(false, '');
  applyPresetDefaults();
  restoreLatest();

  return () => {
    disposed = true;
    extractBtn.removeEventListener('click', onExtract);
    saveBtn.removeEventListener('click', onSave);
    presetSelect.removeEventListener('change', applyPresetDefaults);
  };
}

function initCollapsibleSections(root = document) {
  const rows = Array.from(root.querySelectorAll('.collapsible-section'));
  if (!rows.length) return () => {};
  const cleanups = [];
  const isVideoToolsModal = Boolean(root.querySelector('.video-tools-modal-body'));
  const defaultCollapsedInVideoTools = new Set(['subtitles', 'ocr', 'clips']);
  rows.forEach((section) => {
    const check = section.querySelector('.section-hide-check');
    const head = section.querySelector('.collapsible-head');
    const sectionKey = String(section.dataset.section || '').trim().toLowerCase();
    const setCollapsed = (nextCollapsed) => {
      const collapsed = Boolean(nextCollapsed);
      section.classList.toggle('collapsed', collapsed);
      if (check) check.checked = collapsed;
      if (sectionKey === 'clips') {
        if (collapsed) {
          resetDetailPanelDynamicMinWidth();
        } else {
          requestAnimationFrame(() => ensureDetailPanelMinWidth(measureClipsPanelRequiredWidth(root)));
        }
      }
    };
    if (isVideoToolsModal && defaultCollapsedInVideoTools.has(sectionKey)) {
      setCollapsed(true);
    } else if (check) {
      setCollapsed(Boolean(check.checked));
    } else {
      setCollapsed(section.classList.contains('collapsed'));
    }
    if (check) {
      const apply = () => setCollapsed(Boolean(check.checked));
      check.addEventListener('change', apply);
      cleanups.push(() => check.removeEventListener('change', apply));
    }

    // Toggle from the section header bar click.
    if (head) {
      const onHeadClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        // Do not collapse when user interacts with controls inside the head.
        if (target.closest('input, button, a, select, textarea, label, .channel-controls, .channel-pill')) return;
        setCollapsed(!section.classList.contains('collapsed'));
      };
      head.addEventListener('click', onHeadClick);
      cleanups.push(() => head.removeEventListener('click', onHeadClick));
    }
  });
  return () => {
    cleanups.forEach((fn) => fn());
  };
}

function initVideoToolsSorting(root = document) {
  const viewerExtra = root.querySelector('.viewer-extra');
  if (!viewerExtra) return () => {};

  const sectionMap = new Map();
  viewerExtra.querySelectorAll('.collapsible-section[data-section]').forEach((section) => {
    const key = String(section.dataset.section || '').trim();
    if (key) sectionMap.set(key, section);
  });
  if (sectionMap.size < 2) return () => {};

  let host = root.querySelector('#videoToolsSortableHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'videoToolsSortableHost';
    host.className = 'video-tools-sortable-host';
    viewerExtra.prepend(host);
  }

  const defaultOrder = ['subtitles', 'ocr', 'audio', 'clips'];
  let savedOrder = [];
  try {
    const raw = localStorage.getItem(LOCAL_VIDEO_TOOLS_ORDER);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) savedOrder = parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch (_error) {
    savedOrder = [];
  }
  const mergedOrder = Array.from(new Set([...savedOrder, ...defaultOrder, ...Array.from(sectionMap.keys())]));
  mergedOrder.forEach((key) => {
    const section = sectionMap.get(key);
    if (!section) return;
    host.appendChild(section);
  });

  const saveOrder = () => {
    const order = Array.from(host.querySelectorAll('.collapsible-section[data-section]'))
      .map((el) => String(el.dataset.section || '').trim())
      .filter(Boolean);
    localStorage.setItem(LOCAL_VIDEO_TOOLS_ORDER, JSON.stringify(order));
  };

  const isInteractiveTarget = (target) => Boolean(target?.closest('input, button, a, select, textarea, label'));
  const sectionElements = Array.from(host.querySelectorAll('.collapsible-section[data-section]'));
  let dragging = null;

  sectionElements.forEach((section) => {
    const head = section.querySelector('.collapsible-head');
    if (!head) return;
    head.classList.add('section-drag-handle');
    section.draggable = true;

    const onDragStart = (event) => {
      if (isInteractiveTarget(event.target)) {
        event.preventDefault();
        return;
      }
      dragging = section;
      section.classList.add('dragging');
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(section.dataset.section || ''));
      } catch (_error) {}
    };
    const onDragEnd = () => {
      section.classList.remove('dragging');
      dragging = null;
      saveOrder();
    };

    section.addEventListener('dragstart', onDragStart);
    section.addEventListener('dragend', onDragEnd);
  });

  const onDragOver = (event) => {
    event.preventDefault();
    if (!dragging) return;
    const siblings = Array.from(host.querySelectorAll('.collapsible-section[data-section]:not(.dragging)'));
    let next = null;
    for (const item of siblings) {
      const box = item.getBoundingClientRect();
      if (event.clientY < box.top + (box.height / 2)) {
        next = item;
        break;
      }
    }
    if (next) host.insertBefore(dragging, next);
    else host.appendChild(dragging);
  };
  const onDrop = (event) => {
    event.preventDefault();
    saveOrder();
  };

  host.addEventListener('dragover', onDragOver);
  host.addEventListener('drop', onDrop);

  return () => {
    host.removeEventListener('dragover', onDragOver);
    host.removeEventListener('drop', onDrop);
    sectionElements.forEach((section) => {
      section.draggable = false;
      section.classList.remove('dragging');
    });
  };
}


    return {
      initAudioTools,
      initVideoSubtitleTools,
      initVideoOcrTools,
      initCollapsibleSections,
      initVideoToolsSorting
    };
  }

  global.createMainPlayerVideoToolsModule = createMainPlayerVideoToolsModule;
})(window);
