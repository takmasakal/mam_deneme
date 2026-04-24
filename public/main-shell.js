(function attachMainShellModule(global) {
  function createMainShellModule(deps) {
    const {
      searchForm,
      statusSelect,
      assetTypeFilters,
      clearSearchBtn,
      ocrQueryInput,
      panelVideoToolsBtn,
      pageParams,
      isVideoToolsPageMode,
      panelVisibilityRef,
      subtitleOverlayEnabledByAsset,
      hideSearchSuggestions,
      hideOcrSuggestions,
      hideSubtitleSuggestions,
      loadAssets,
      isPanelVisible,
      escapeHtml,
      t,
      currentLangRef,
      secondsToTimecode,
      PLAYER_FPS,
      parseTimecodeInput
    } = deps || {};

function openVideoToolsPage(assetId, startAtSeconds = 0) {
  const id = String(assetId || '').trim();
  if (!id) return;
  const next = new URL(window.location.href);
  const backPanels = `${isPanelVisible('panelIngest') ? '1' : '0'}${isPanelVisible('panelAssets') ? '1' : '0'}${isPanelVisible('panelDetail') ? '1' : '0'}`;
  next.searchParams.set('view', 'video-tools');
  next.searchParams.set('assetId', id);
  next.searchParams.set('backPanels', backPanels);
  if (startAtSeconds > 0) next.searchParams.set('tc', String(startAtSeconds.toFixed(3)));
  else next.searchParams.delete('tc');
  window.location.assign(next.toString());
}

function leaveVideoToolsPage(returnAssetId = '', returnStartAtSeconds = 0) {
  const next = new URL(window.location.href);
  const backPanels = String(pageParams.get('backPanels') || '').trim();
  next.searchParams.delete('view');
  next.searchParams.delete('assetId');
  next.searchParams.delete('tc');
  next.searchParams.delete('backPanels');
  const backId = String(returnAssetId || '').trim();
  if (backId) next.searchParams.set('openAsset', backId);
  else next.searchParams.delete('openAsset');
  if (returnStartAtSeconds > 0) next.searchParams.set('openTc', String(Number(returnStartAtSeconds).toFixed(3)));
  else next.searchParams.delete('openTc');
  if (/^[01]{3}$/.test(backPanels)) next.searchParams.set('restorePanels', backPanels);
  else next.searchParams.delete('restorePanels');
  window.location.assign(next.toString());
}

function applyVideoToolsPageLayoutMode() {
  if (!isVideoToolsPageMode) return;
  document.body.classList.add('video-tools-page-mode');
  const nextVisibility = { ...(panelVisibilityRef?.get?.() || {}), panelIngest: false, panelAssets: false, panelDetail: true };
  panelVisibilityRef?.set?.(nextVisibility);
}

function hasActiveSearchFields() {
  const textNames = ['q', 'ocrQ', 'subtitleQ', 'tag', 'type'];
  const hasText = textNames.some((name) => {
    const field = searchForm?.querySelector(`[name="${name}"]`);
    return Boolean(String(field?.value || '').trim());
  });
  if (hasText) return true;
  if (String(statusSelect?.value || '').trim()) return true;
  const trashSelect = searchForm?.querySelector('[name="trash"]');
  if (String(trashSelect?.value || 'active').trim().toLowerCase() !== 'active') return true;
  return assetTypeFilters.some((input) => !input.checked);
}

function updateClearSearchButtonState() {
  if (!clearSearchBtn) return;
  clearSearchBtn.disabled = !hasActiveSearchFields();
}

async function clearSearchFields() {
  ['q', 'ocrQ', 'subtitleQ', 'tag', 'type'].forEach((name) => {
    const field = searchForm?.querySelector(`[name="${name}"]`);
    if (field) field.value = '';
  });
  if (statusSelect) statusSelect.value = '';
  const trashSelect = searchForm?.querySelector('[name="trash"]');
  if (trashSelect) trashSelect.value = 'active';
  assetTypeFilters.forEach((input) => {
    input.checked = true;
  });
  hideSearchSuggestions();
  hideOcrSuggestions();
  hideSubtitleSuggestions();
  await loadAssets();
  updateClearSearchButtonState();
}

function getActiveOcrQueryInput() {
  return ocrQueryInput;
}

async function toggleFullscreenForElement(targetEl) {
  const doc = document;
  const fsElement = doc.fullscreenElement || doc.webkitFullscreenElement || null;
  if (fsElement) {
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } catch (_error) {
      // ignore fullscreen exit errors
    }
    return;
  }
  if (!targetEl) return;
  try {
    if (targetEl.requestFullscreen) await targetEl.requestFullscreen();
    else if (targetEl.webkitRequestFullscreen) targetEl.webkitRequestFullscreen();
  } catch (_error) {
    // ignore fullscreen request errors
  }
}

function initFullscreenOverlay(mediaEl, fullscreenTarget, asset = null) {
  if (!mediaEl || !fullscreenTarget) return () => {};
  const prevNativeControls = Boolean(mediaEl.controls);
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-overlay hidden';
  overlay.innerHTML = `
    <div class="fullscreen-overlay-top">
      <div class="fs-settings-wrap">
        <button type="button" class="fs-settings-btn" aria-label="${escapeHtml(t('fullscreen_overlay_settings'))}" title="${escapeHtml(t('fullscreen_overlay_settings'))}">⚙</button>
        <div class="fs-settings-panel">
          <label><input type="checkbox" data-fs-setting="controls" checked /> ${escapeHtml(t('fullscreen_overlay_show_controls'))}</label>
          <label><input type="checkbox" data-fs-setting="timecode" checked /> ${escapeHtml(t('fullscreen_overlay_show_timecode'))}</label>
          <label><input type="checkbox" data-fs-setting="subtitles" checked /> ${escapeHtml(t('fullscreen_overlay_show_subtitles'))}</label>
          <label><input type="checkbox" data-fs-setting="audio" checked /> ${escapeHtml(t('fullscreen_overlay_show_audio_graph'))}</label>
        </div>
      </div>
    </div>
    <div class="fullscreen-overlay-mid">
      <div class="fs-timecode">TC: <strong class="fs-timecode-value">00:00:00:00</strong></div>
      <canvas class="fs-audio-graph" width="43" height="67"></canvas>
    </div>
    <div class="fullscreen-overlay-bottom">
      <button type="button" class="fs-play-btn">▶</button>
      <input type="range" class="fs-seek" min="0" max="1000" step="1" value="0" />
      <span class="fs-time">00:00:00 / 00:00:00</span>
    </div>
    <div class="fs-tc-jump hidden">
      <div class="fs-tc-jump-card">
        <label class="fs-tc-jump-label">
          <span>${escapeHtml(t('tc'))}</span>
          <input type="text" class="fs-tc-jump-input" value="00:00:00:00" />
        </label>
        <div class="fs-tc-jump-actions">
          <button type="button" class="fs-tc-jump-cancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" class="fs-tc-jump-go">${escapeHtml(t('jump_to_cut'))}</button>
        </div>
      </div>
    </div>
  `;
  fullscreenTarget.appendChild(overlay);

  const settingsBtn = overlay.querySelector('.fs-settings-btn');
  const settingsWrap = overlay.querySelector('.fs-settings-wrap');
  const fsPanel = overlay.querySelector('.fs-settings-panel');
  const fsTimecode = overlay.querySelector('.fs-timecode');
  const fsTimecodeValue = overlay.querySelector('.fs-timecode-value');
  const fsAudioCanvas = overlay.querySelector('.fs-audio-graph');
  const fsBottom = overlay.querySelector('.fullscreen-overlay-bottom');
  const fsPlayBtn = overlay.querySelector('.fs-play-btn');
  const fsSeek = overlay.querySelector('.fs-seek');
  const fsTime = overlay.querySelector('.fs-time');
  const fsTcJump = overlay.querySelector('.fs-tc-jump');
  const fsTcJumpInput = overlay.querySelector('.fs-tc-jump-input');
  const fsTcJumpGo = overlay.querySelector('.fs-tc-jump-go');
  const fsTcJumpCancel = overlay.querySelector('.fs-tc-jump-cancel');
  const fsCtx = fsAudioCanvas instanceof HTMLCanvasElement ? fsAudioCanvas.getContext('2d') : null;
  if (fsBottom && fsTimecode) {
    fsBottom.appendChild(fsTimecode);
    fsTimecode.classList.add('fs-timecode-bottom');
  }

  const settingsKey = 'mam.fullscreen.overlay.settings';
  const settings = { controls: true, timecode: true, subtitles: true, audio: true };
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    if (typeof raw === 'object' && raw) {
      settings.controls = raw.controls !== false;
      settings.timecode = raw.timecode !== false;
      settings.subtitles = raw.subtitles !== false;
      settings.audio = raw.audio !== false;
    }
  } catch (_error) {}

  const settingInputs = Array.from(overlay.querySelectorAll('input[data-fs-setting]'));
  settingInputs.forEach((input) => {
    const key = String(input.dataset.fsSetting || '').trim();
    if (key in settings) input.checked = Boolean(settings[key]);
  });

  let audioLevels = [];
  const prevTrackModes = [];
  const ensureSubtitleTrack = () => {
    const subtitleUrl = String(asset?.subtitleUrl || '').trim();
    if (!subtitleUrl) return;
    const existing = mediaEl.querySelector('#assetSubtitleTrack');
    if (existing) return;
    const subtitleLang = String(asset?.subtitleLang || currentLangRef?.get?.() || 'tr').slice(0, 12);
    const subtitleLabel = String(asset?.subtitleLabel || t('subtitles'));
    const track = document.createElement('track');
    track.id = 'assetSubtitleTrack';
    track.kind = 'subtitles';
    track.default = true;
    track.label = subtitleLabel;
    track.srclang = subtitleLang;
    track.src = `${subtitleUrl}${subtitleUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    mediaEl.appendChild(track);
  };

  const formatClock = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const applySubtitleSetting = () => {
    if (settings.subtitles) ensureSubtitleTrack();
    const tracks = Array.from(mediaEl.textTracks || []);
    tracks.forEach((track, index) => {
      if (track.kind !== 'subtitles' && track.kind !== 'captions') return;
      if (!prevTrackModes[index]) prevTrackModes[index] = track.mode;
      track.mode = settings.subtitles ? 'showing' : 'hidden';
    });
  };

  const drawThinAudio = () => {
    if (!fsCtx || !fsAudioCanvas) return;
    const levels = Array.isArray(audioLevels) && audioLevels.length ? audioLevels : [0];
    const levelsCount = Math.max(1, levels.length);
    const isManyChannels = levelsCount >= 7;
    const gap = 2;
    const sidePad = 4;
    // Global fullscreen channel width standard:
    // 8ch baseline was ~20px; target is +10% => 22px for all assets.
    const targetBarW = 22;
    const desiredW = Math.round((levelsCount * targetBarW) + ((levelsCount - 1) * gap) + (sidePad * 2));
    const minW = 96;
    const maxW = Math.max(minW, Math.round(window.innerWidth * 0.3));
    const nextCssW = Math.max(minW, Math.min(maxW, desiredW));
    if (fsAudioCanvas.style.width !== `${nextCssW}px`) {
      fsAudioCanvas.style.width = `${nextCssW}px`;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const displayW = Math.max(60, Math.round(fsAudioCanvas.clientWidth || 78));
    const displayH = Math.max(84, Math.round(fsAudioCanvas.clientHeight || 112));
    const pixelW = Math.round(displayW * dpr);
    const pixelH = Math.round(displayH * dpr);
    if (fsAudioCanvas.width !== pixelW || fsAudioCanvas.height !== pixelH) {
      fsAudioCanvas.width = pixelW;
      fsAudioCanvas.height = pixelH;
    }
    fsCtx.setTransform(1, 0, 0, 1, 0, 0);
    fsCtx.scale(dpr, dpr);
    const w = displayW;
    const h = displayH;
    fsCtx.clearRect(0, 0, w, h);
    if (!settings.audio) return;
    fsCtx.fillStyle = 'rgba(10,14,22,0.36)';
    fsCtx.fillRect(0, 0, w, h);
    const labelBand = isManyChannels ? 16 : 14;
    const barW = targetBarW;
    const barsTotalW = (levelsCount * barW) + ((levelsCount - 1) * gap);
    const startX = Math.max(sidePad, Math.round((w - barsTotalW) / 2));
    levels.forEach((lv, i) => {
      const v = Math.max(0, Math.min(1, Number(lv) || 0));
      const meterH = Math.max(8, h - labelBand - 6);
      const bh = Math.max(2, Math.round(v * meterH));
      const x = startX + (i * (barW + gap));
      const y = h - labelBand - bh - 3;
      const grad = fsCtx.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, '#c7eeff');
      grad.addColorStop(1, '#59bfff');
      fsCtx.fillStyle = grad;
      fsCtx.fillRect(x, y, barW, bh);
      fsCtx.fillStyle = '#e9fbff';
      fsCtx.fillRect(x, Math.max(1, y - 1), barW, 1);
      fsCtx.fillStyle = 'rgba(228, 240, 255, 0.92)';
      fsCtx.font = `${isManyChannels ? 9 : 9}px "IBM Plex Sans", sans-serif`;
      fsCtx.textAlign = 'center';
      fsCtx.fillText(`CH${i + 1}`, x + (barW / 2), h - 2);
    });
    fsCtx.textAlign = 'left';
  };

  const syncOverlay = () => {
    const duration = Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0;
    const current = Number(mediaEl.currentTime) || 0;
    if (fsTimecodeValue) fsTimecodeValue.textContent = secondsToTimecode(current, PLAYER_FPS);
    if (fsTime) fsTime.textContent = `${formatClock(current)} / ${formatClock(duration)}`;
    if (fsSeek && duration > 0) {
      const ratio = Math.max(0, Math.min(1, current / duration));
      fsSeek.value = String(Math.round(ratio * 1000));
    } else if (fsSeek) {
      fsSeek.value = '0';
    }
    if (fsPlayBtn) fsPlayBtn.textContent = (mediaEl.paused || mediaEl.ended) ? '▶' : '⏸';
  };

  const applyOverlayVisibility = () => {
    fsBottom?.classList.toggle('hidden', !settings.controls);
    fsTimecode?.classList.toggle('hidden', !settings.timecode);
    fsAudioCanvas?.classList.toggle('hidden', !settings.audio);
    drawThinAudio();
    applySubtitleSetting();
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch (_error) {}
  };

  const onAudioLevels = (event) => {
    audioLevels = Array.isArray(event?.detail?.levels) ? event.detail.levels : [];
    if (settings.audio) drawThinAudio();
  };

  const onSettingsToggle = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const key = String(target.dataset.fsSetting || '').trim();
    if (!(key in settings)) return;
    settings[key] = Boolean(target.checked);
    applyOverlayVisibility();
  };

  const onPlayToggle = async () => {
    if (mediaEl.paused || mediaEl.ended) await mediaEl.play().catch(() => {});
    else mediaEl.pause();
    syncOverlay();
  };

  const setTcJumpOpen = (open, initialTc = '') => {
    if (!fsTcJump) return;
    fsTcJump.classList.toggle('hidden', !open);
    if (open && fsTcJumpInput) {
      fsTcJumpInput.value = initialTc || String(fsTimecodeValue?.textContent || '').trim() || '00:00:00:00';
      fsTcJumpInput.focus();
      fsTcJumpInput.select?.();
    }
  };

  const onTimecodeJump = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const initialTc = String(fsTimecodeValue?.textContent || '').trim();
    if (!initialTc || initialTc.includes('--')) return;
    setTcJumpOpen(true, initialTc);
  };

  const onTimecodeJumpApply = async () => {
    const nextTc = String(fsTcJumpInput?.value || '').trim();
    if (!nextTc) return;
    const nextSeconds = parseTimecodeInput(nextTc, PLAYER_FPS);
    if (!Number.isFinite(nextSeconds)) {
      alert(t('invalid_timecode'));
      return;
    }
    mediaEl.currentTime = Math.max(0, nextSeconds);
    mediaEl.pause();
    syncOverlay();
    setTcJumpOpen(false);
  };

  const onSeekInput = () => {
    const duration = Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0;
    if (!duration || !fsSeek) return;
    mediaEl.currentTime = Math.max(0, Math.min(duration, (Number(fsSeek.value || 0) / 1000) * duration));
  };

  const onSettingsButton = (event) => {
    event.preventDefault();
    event.stopPropagation();
    settingsWrap?.classList.toggle('open');
  };

  const onTcJumpCancel = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setTcJumpOpen(false);
  };

  const onTcJumpKeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onTimecodeJumpApply();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onTcJumpCancel(event);
    }
  };

  const onFullscreenChange = () => {
    const doc = document;
    const fsElement = doc.fullscreenElement || doc.webkitFullscreenElement || null;
    const active = Boolean(fsElement && (fsElement === fullscreenTarget || fullscreenTarget.contains(fsElement)));
    overlay.classList.toggle('hidden', !active);
    fullscreenTarget.classList.toggle('mam-fs-root', active);
    if (active) {
      mediaEl.controls = false;
      syncOverlay();
      drawThinAudio();
      applyOverlayVisibility();
    } else {
      mediaEl.controls = prevNativeControls;
      settingsWrap?.classList.remove('open');
      setTcJumpOpen(false);
    }
  };

  settingInputs.forEach((input) => input.addEventListener('change', onSettingsToggle));
  settingsBtn?.addEventListener('click', onSettingsButton);
  fsPlayBtn?.addEventListener('click', onPlayToggle);
  fsSeek?.addEventListener('input', onSeekInput);
  fsTimecode?.addEventListener('click', onTimecodeJump);
  fsTcJumpGo?.addEventListener('click', onTimecodeJumpApply);
  fsTcJumpCancel?.addEventListener('click', onTcJumpCancel);
  fsTcJumpInput?.addEventListener('keydown', onTcJumpKeydown);
  fsTcJump?.addEventListener('click', (event) => {
    if (event.target === fsTcJump) onTcJumpCancel(event);
  });
  mediaEl.addEventListener('timeupdate', syncOverlay);
  mediaEl.addEventListener('play', syncOverlay);
  mediaEl.addEventListener('pause', syncOverlay);
  mediaEl.addEventListener('loadedmetadata', syncOverlay);
  mediaEl.addEventListener('mam:audio-levels', onAudioLevels);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  applyOverlayVisibility();
  syncOverlay();

  return () => {
    settingInputs.forEach((input) => input.removeEventListener('change', onSettingsToggle));
    settingsBtn?.removeEventListener('click', onSettingsButton);
    fsPlayBtn?.removeEventListener('click', onPlayToggle);
    fsSeek?.removeEventListener('input', onSeekInput);
    fsTimecode?.removeEventListener('click', onTimecodeJump);
    fsTcJumpGo?.removeEventListener('click', onTimecodeJumpApply);
    fsTcJumpCancel?.removeEventListener('click', onTcJumpCancel);
    fsTcJumpInput?.removeEventListener('keydown', onTcJumpKeydown);
    mediaEl.removeEventListener('timeupdate', syncOverlay);
    mediaEl.removeEventListener('play', syncOverlay);
    mediaEl.removeEventListener('pause', syncOverlay);
    mediaEl.removeEventListener('loadedmetadata', syncOverlay);
    mediaEl.removeEventListener('mam:audio-levels', onAudioLevels);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    mediaEl.controls = prevNativeControls;
    const tracks = Array.from(mediaEl.textTracks || []);
    tracks.forEach((track, index) => {
      if (track.kind !== 'subtitles' && track.kind !== 'captions') return;
      if (prevTrackModes[index]) track.mode = prevTrackModes[index];
    });
    overlay.remove();
  };
}

function setPanelVideoToolsButtonState(visible, onClick = null) {
  if (!panelVideoToolsBtn) return;
  const show = Boolean(visible);
  panelVideoToolsBtn.classList.toggle('hidden', !show);
  panelVideoToolsBtn.removeAttribute('title');
  panelVideoToolsBtn.setAttribute('aria-label', t('video_tools'));
  panelVideoToolsBtn.dataset.tooltip = t('video_tools');
  panelVideoToolsBtn.onclick = show && typeof onClick === 'function' ? onClick : null;
}

function syncOcrQueryInputs(source) {
  if (!source || source === ocrQueryInput) return;
  if (ocrQueryInput) ocrQueryInput.value = String(source.value || '');
}

function setSubtitleOverlayEnabled(assetId, enabled) {
  const key = String(assetId || '').trim();
  if (!key) return false;
  subtitleOverlayEnabledByAsset.set(key, Boolean(enabled));
  return subtitleOverlayEnabledByAsset.get(key) === true;
}

let shortcutToastTimer = null;
function showShortcutToast(message) {
  const text = String(message || '').trim();
  if (!text) return;
  let toast = document.getElementById('shortcutToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'shortcutToast';
    toast.className = 'shortcut-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('visible');
  if (shortcutToastTimer) clearTimeout(shortcutToastTimer);
  shortcutToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 1000);
}


    return {
      openVideoToolsPage,
      leaveVideoToolsPage,
      applyVideoToolsPageLayoutMode,
      hasActiveSearchFields,
      updateClearSearchButtonState,
      clearSearchFields,
      getActiveOcrQueryInput,
      toggleFullscreenForElement,
      initFullscreenOverlay,
      setPanelVideoToolsButtonState,
      syncOcrQueryInputs,
      setSubtitleOverlayEnabled,
      showShortcutToast
    };
  }

  global.createMainShellModule = createMainShellModule;
})(window);
