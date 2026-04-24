const ingestForm = document.getElementById('ingestForm');
const mediaFileInput = document.getElementById('mediaFileInput');
const mediaFileBtn = document.getElementById('mediaFileBtn');
const mediaFileName = document.getElementById('mediaFileName');
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const uploadProgressSpinner = document.getElementById('uploadProgressSpinner');
const searchForm = document.getElementById('searchForm');
const assetGrid = document.getElementById('assetGrid');
const assetDetail = document.getElementById('assetDetail');
const panelIngest = document.getElementById('panelIngest');
const panelAssets = document.getElementById('panelAssets');
const assetViewThumbBtn = document.getElementById('assetViewThumbBtn');
const assetViewListBtn = document.getElementById('assetViewListBtn');
const assetsTitleToggleBtn = panelAssets?.querySelector('.panel-head h2');
const assetTypeFilters = Array.from(document.querySelectorAll('.asset-type-filter'));
const panelDetail = document.getElementById('panelDetail');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const panelVideoToolsBtn = document.getElementById('panelVideoToolsBtn');
const statusSelect = searchForm.querySelector('[name="status"]');
const searchQueryInput = searchForm.querySelector('[name="q"]');
const searchSuggestList = document.getElementById('searchSuggestList');
const clearSearchBtn = document.getElementById('clearSearchBtn');
// OCR ve Altyazi aramalari 1. kolonda birbirinden bagimsiz iki ayri kutu olarak calisir.
const ocrQueryInput = searchForm.querySelector('[name="ocrQ"]');
const ocrSuggestList = document.getElementById('ocrSuggestList');
const subtitleQueryInput = searchForm.querySelector('[name="subtitleQ"]');
const subtitleSuggestList = document.getElementById('subtitleSuggestList');
const languageSelect = document.getElementById('languageSelect');
const currentUserBtn = document.getElementById('currentUserBtn');
const userMenu = document.getElementById('userMenu');
const adminMenuLink = document.getElementById('adminMenuLink');
const logoutBtn = document.getElementById('logoutBtn');
const layout = document.querySelector('.layout');
const splitters = Array.from(document.querySelectorAll('.panel-splitter'));
const splitterDots = Array.from(document.querySelectorAll('.splitter-dot'));
const splitterTabs = Array.from(document.querySelectorAll('.splitter-tab'));
const pageParams = new URLSearchParams(window.location.search);
const isVideoToolsPageMode = String(pageParams.get('view') || '').trim().toLowerCase() === 'video-tools';
const requestedVideoToolsAssetId = String(pageParams.get('assetId') || '').trim();
const requestedVideoToolsStartSec = Math.max(0, Number(pageParams.get('tc') || 0) || 0);
const requestedOpenAssetId = String(pageParams.get('openAsset') || '').trim();
const requestedOpenStartSec = Math.max(0, Number(pageParams.get('openTc') || 0) || 0);
const requestedRestorePanels = String(pageParams.get('restorePanels') || '').trim();

const LOCAL_PANEL_SIZE = 'mam.panel.sizes';
const LOCAL_PANEL_VIS = 'mam.panel.visibility';
const LOCAL_LANG = 'mam.lang';
const LOCAL_VIDEO_TOOLS_ORDER = 'mam.video.tools.order';
const LOCAL_ASSET_VIEW_MODE = 'mam.assets.view.mode';
const LOCAL_DETAIL_VIDEO_PIN = 'mam.detail.video.pin';
const I18N_PATH = '/i18n.json';
const DETAIL_PANEL_BASE_MIN_PX = 377;
const PANELS = [
  { id: 'panelIngest', defaultSize: 1 },
  { id: 'panelAssets', defaultSize: 1.2 },
  { id: 'panelDetail', defaultSize: 1 }
];

let currentAssets = [];
let activePlayerCleanup = null;
let activeDetailPinCleanup = null;
let playerUiMode = 'native';
let videoJsLoadPromise = null;
let dashJsLoadPromise = null;
let detailVideoPinned = localStorage.getItem(LOCAL_DETAIL_VIDEO_PIN) === '1';
let selectedAssetId = null;
let currentUserCanAccessAdmin = false;
let currentUserCanEditMetadata = false;
let currentUserCanEditOffice = false;
let currentUserCanDeleteAssets = false;
let currentUserCanUsePdfAdvancedTools = false;
let currentOfficeEditorProvider = 'none';
let currentUsername = '';
const selectedAssetIds = new Set();
let lastSelectedAssetId = null;
let currentSearchQuery = '';
let currentOcrQuery = '';
let currentSubtitleQuery = '';
let currentSearchHighlightQuery = '';
let currentSearchDidYouMean = '';
let currentSearchFuzzyUsed = false;
let currentOcrHighlightQuery = '';
let currentOcrDidYouMean = '';
let currentOcrFuzzyUsed = false;
const cutMarksByAsset = new Map();
const subtitleOverlayEnabledByAsset = new Map();
let panelSizes = Object.fromEntries(PANELS.map((p) => [p.id, p.defaultSize]));
let panelVisibility = { panelIngest: true, panelAssets: true, panelDetail: true };
let dynamicDetailMinPx = DETAIL_PANEL_BASE_MIN_PX;
let assetViewMode = localStorage.getItem(LOCAL_ASSET_VIEW_MODE) === 'list' ? 'list' : 'grid';

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
  panelVisibility.panelIngest = false;
  panelVisibility.panelAssets = false;
  panelVisibility.panelDetail = true;
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
    const subtitleLang = String(asset?.subtitleLang || currentLang || 'tr').slice(0, 12);
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

let i18n = {
  en: {
    app_title: 'MAM Console',
    app_subtitle: 'Dalet-style MVP: ingest, metadata, workflow, versions',
    current_user: 'Current User',
    unknown_user: 'Unknown user',
    logout: 'Logout',
    language_label: 'Language',
    admin_page: 'Admin',
    ingest_title: 'Ingest Asset',
    search_title: 'Search',
    clear_search_fields: 'Clear all search fields',
    search_upload_tag: 'SEARCH / UPLOAD',
    assets_title: 'Assets',
    asset_detail_title: 'Detail',
    select_asset: 'Select an asset.',
    ph_title: 'Title',
    title: 'Title',
    ph_type: 'Type',
    type_video: 'Video',
    type_audio: 'Audio',
    type_document: 'Document',
    type_photo: 'Photo',
    type_other: 'Other',
    ph_owner: 'Owner',
    choose_file: 'Choose File',
    ph_tags: 'Tags (comma separated)',
    ph_duration_auto: 'Duration auto-detected',
    ph_source: 'Source path',
    ph_description: 'Description',
    description: 'Description',
    tags: 'Tags',
    ph_query: 'Query',
    ph_ocr_query: 'OCR Search',
    ph_subtitle_query: 'Subtitle Search',
    ph_tag: 'Tag',
    ph_type_simple: 'Type',
    filter_types: 'Types',
    list_view: 'List View',
    thumbnail_view: 'Thumbnail View',
    trash_scope: 'Trash',
    any_status: 'Any status',
    trash_active: 'Active assets',
    trash_only: 'Trash only',
    trash_all: 'All (active + trash)',
    btn_upload_create: 'Upload & Create Asset',
    uploading: 'Uploading',
    processing: 'Processing',
    btn_apply_filters: 'Apply Filters',
    no_assets: 'No assets found.',
    playback_source: 'Playback source',
    low_res_proxy: 'Low-res proxy',
    original_file: 'Original file',
    proxy_status: 'Proxy status',
    proxy_required: 'Proxy not ready. Video playback is available after proxy generation.',
    play: 'Play',
    stop: 'Stop',
    pause: 'Pause',
    prev_frame: 'Prev Frame',
    next_frame: 'Next Frame',
    reverse_frame: 'Reverse Frame',
    forward_frame: 'Forward Frame',
    timecode: 'Timecode',
    tc: 'TC',
    set_in: 'Set IN',
    set_out: 'Set OUT',
    go_in: 'Go IN',
    go_out: 'Go OUT',
    clear: 'Clear',
    save_cut: 'Save Cut',
    clip_name: 'Clip Name',
    ph_clip_name: 'Enter clip name',
    delete_marks: 'Delete Marks',
    delete_cut: 'Delete Cut',
    edit_clip: 'Edit Clip',
    rename_clip_prompt: 'Enter new clip name',
    edit_in_prompt: 'Enter IN timecode (HH:MM:SS:FF)',
    edit_out_prompt: 'Enter OUT timecode (HH:MM:SS:FF)',
    invalid_timecode: 'Invalid timecode format.',
    invalid_in_out: 'OUT must be greater than or equal to IN.',
    clip_editor_title: 'Edit Clip',
    clip_editor_name: 'Clip Name',
    clip_editor_in: 'IN Timecode',
    clip_editor_out: 'OUT Timecode',
    clip_editor_cancel: 'Cancel',
    clip_editor_save: 'Save',
    jump_to_cut: 'Jump',
    play_cut: 'Play Clip',
    original_master: 'Original master',
    open_file: 'Open file',
    audio_channels: 'Audio Channels',
    group_channel_selection: 'Group channel selection',
    hide_audio_graph: 'Hide Audio Graph',
    show_audio_graph: 'Show Audio Graph',
    open_pdf: 'Open PDF',
    open_document: 'Open document file',
    open_attached: 'Open attached file',
    no_media: 'No media file attached.',
    no_description: 'No description',
    owner: 'Owner',
    type: 'Type',
    duration: 'Duration',
    technical_info: 'Technical Info',
    tech_loading: 'Loading technical info...',
    tech_unavailable: 'Technical info unavailable.',
    tech_container: 'Container',
    tech_resolution: 'Resolution',
    tech_video_codec: 'Video codec',
    tech_frame_rate: 'Frame rate',
    tech_pixel_format: 'Pixel format',
    tech_audio_codec: 'Audio codec',
    tech_audio_channels: 'Audio channels',
    tech_sample_rate: 'Sample rate',
    tech_duration: 'Duration',
    tech_bitrate: 'Bitrate',
    tech_file_size: 'File size',
    status: 'Status',
    trash: 'Trash',
    in_trash: 'In Trash',
    active: 'Active',
    restore: 'Restore',
    delete_asset: 'Delete',
    delete_permanent: 'Delete Permanently',
    move_to_trash_confirm: 'Move this asset to trash?',
    move_to_trash: 'Move To Trash',
    asset_viewer: 'Asset Viewer',
    edit_metadata: 'Edit Metadata',
    save_metadata: 'Save Metadata',
    metadata_save_failed: 'Metadata save failed.',
    metadata_edit_locked: 'You do not have permission to edit metadata.',
    dublin_core: 'Dublin Core Metadata',
    dc_title: 'DC Title',
    dc_creator: 'DC Creator',
    dc_subject: 'DC Subject',
    dc_description: 'DC Description',
    dc_publisher: 'DC Publisher',
    dc_contributor: 'DC Contributor',
    dc_date: 'DC Date',
    dc_type: 'DC Type',
    dc_format: 'DC Format',
    dc_identifier: 'DC Identifier',
    dc_source: 'DC Source',
    dc_language: 'DC Language',
    dc_relation: 'DC Relation',
    dc_coverage: 'DC Coverage',
    dc_rights: 'DC Rights',
    workflow_transition: 'Workflow Transition',
    move_status: 'Move Status',
    add_version: 'Add Version',
    what_changed: 'What changed',
    create_version: 'Create Version',
    ph_inline_tags: 'tag1, tag2',
    ph_version_label: 'v2',
    versions: 'Versions',
    restore_pdf_version: 'Restore PDF',
    restore_office_version: 'Restore Office',
    restore_pdf_original: 'Restore Original PDF',
    restore_office_original: 'Restore Original Office',
    download_pdf_original: 'Download Original PDF',
    download_office_original: 'Download Original Office',
    restore_pdf_confirm: 'Restore this PDF version? Current PDF state will be saved as a new restore version.',
    restore_pdf_original_confirm: 'Restore the original PDF snapshot?',
    restore_office_original_confirm: 'Restore the original Office snapshot?',
    restore_pdf_unavailable: 'No snapshot',
    delete_pdf_version: 'Delete PDF Edit',
    delete_pdf_version_confirm: 'Delete this PDF edit version entry?',
    delete_version: 'Delete Version',
    delete_version_confirm: 'Delete this version entry?',
    edit_version_name: 'Rename Version',
    edit_version_name_prompt: 'New version name',
    edit_version_note_prompt: 'Version note (optional)',
    version_actor: 'By',
    version_action: 'Action',
    version_change_type: 'Change Type',
    action_ingest: 'Ingest',
    action_manual: 'Manual',
    action_office_save: 'Office Save',
    action_pdf_save: 'PDF Save',
    action_pdf_restore: 'PDF Restore',
    action_pdf_restore_original: 'PDF Original Restore',
    action_office_restore: 'Office Restore',
    action_office_restore_original: 'Office Original Restore',
    restore_office_confirm: 'Restore this Office version?',
    action_file_replace: 'File Replace',
    pdf_change_redaction: 'Redaction',
    pdf_change_text_insert: 'Text Insert',
    pdf_change_annotation: 'Annotation',
    pdf_change_mixed: 'Mixed',
    pdf_change_unknown: 'Unknown',
    multi_selected: 'Multiple assets selected',
    selected_count: 'Selected count',
    bulk_delete_selected: 'Delete Selected Permanently',
    bulk_clear_selection: 'Clear Selection',
    bulk_delete_confirm: 'Permanently delete {count} selected assets? This cannot be undone.',
    segment: 'DUR',
    in_label: 'IN',
    out_label: 'OUT',
    trash_confirm: 'Permanently delete this asset? This cannot be undone.',
    select_media_first: 'Select a media file to upload.',
    proxy_failed: 'Proxy failed. Switched to original media.',
    proxy_fallback_status: 'fallback',
    webaudio_unavailable: 'Web Audio API is not available in this browser.',
    audiograph_unsupported: 'Audio graph is not supported in this browser.',
    channel_on: 'ON',
    channel_off: 'OFF',
    preview_loading: 'Loading preview...',
    preview_not_available: 'Preview not available.',
    preview_not_supported: 'Preview not supported for this file type.',
    preview_search_placeholder: 'Search in preview',
    preview_search_empty: 'No matches',
    preview_next: 'Next',
    preview_find: 'Find',
    preview_search_error: 'Search failed',
    preview_reset: 'Reset',
    pdf_preview_unavailable: 'PDF preview engine is unavailable.',
    generate_proxy: 'Generate Proxy',
    download_asset: 'Download',
    download_proxy: 'Download Proxy',
    video_native_audio: 'Native video audio mode is active.',
    subtitles: 'Subtitles',
    subtitle_lang: 'Lang',
    subtitle_none: 'No subtitle loaded',
    subtitle_loaded: 'Subtitle loaded',
    subtitle_upload: 'Upload Subtitle',
    subtitle_generate: 'Generate Subtitle',
    subtitle_use_whisperx: 'Use WhisperX align',
    subtitle_model: 'Model',
    subtitle_model_tiny: 'Tiny',
    subtitle_model_base: 'Base',
    subtitle_model_small: 'Small',
    subtitle_use_zemberek: 'Use Zemberek correction',
    subtitle_audio_stream: 'Audio stream',
    subtitle_audio_stream_default: 'Default stream',
    subtitle_audio_channel: 'Channel',
    subtitle_audio_channel_mix: 'Mix all channels',
    subtitle_upload_success: 'Subtitle uploaded.',
    subtitle_generate_success: 'Subtitle generated.',
    tool_options: 'Options',
    subtitle_file_required: 'Please choose a .srt or .vtt subtitle file first.',
    subtitle_name: 'Subtitle name',
    subtitle_save_name: 'Save name',
    subtitle_list: 'Subtitle list',
    subtitle_use: 'Use',
    subtitle_active: 'Active',
    subtitle_download: 'Download',
    subtitle_remove: 'Remove',
    subtitle_remove_confirm: 'Remove this subtitle from the list?',
    subtitle_no_items: 'No subtitle items',
    subtitle_search_ph: 'Search in subtitle text',
    subtitle_search_btn: 'Search Subtitle',
    subtitle_search_empty: 'No subtitle match.',
    subtitle_did_you_mean: 'Did you mean',
    subtitle_search_results: 'Subtitle Matches',
    subtitle_jump: 'Jump',
    ocr_hit: 'OCR',
    video_ocr: 'Video OCR',
    video_ocr_interval: 'Interval (sec)',
    video_ocr_lang: 'OCR lang',
    video_ocr_preset: 'Preset',
    video_ocr_preset_general: 'General',
    video_ocr_preset_ticker: 'Ticker (right to left)',
    video_ocr_preset_credits: 'Credits (bottom to top)',
    video_ocr_preset_static: 'Static text',
    ocr_stage_preprocess: 'Pre-process',
    ocr_stage_process: 'Process',
    ocr_stage_postprocess: 'Post-process',
    video_ocr_engine: 'Engine',
    video_ocr_preprocess: 'Preprocess',
    video_ocr_preprocess_off: 'Off',
    video_ocr_preprocess_light: 'Light',
    video_ocr_preprocess_strong: 'Strong',
    video_ocr_blur_filter: 'Blur filter',
    video_ocr_blur_threshold: 'Blur threshold',
    video_ocr_region_mode: 'Ticker mode',
    video_ocr_ticker_height: 'Ticker height (%)',
    video_ocr_engine_paddle: 'PaddleOCR',
    video_ocr_name: 'OCR name',
    video_ocr_name_ph: 'Optional OCR file name',
    video_ocr_advanced: 'Scene-based OCR',
    video_ocr_advanced_help: 'Samples extra frames on scene changes and merges repeated text into longer time ranges.',
    video_ocr_ai_correct: 'Turkish offline correction',
    video_ocr_static_filter: 'Filter static overlays',
    video_ocr_ignore_phrases: 'Ignore phrases',
    video_ocr_ignore_phrases_ph: 'NotebookLM, watermark',
    video_ocr_min_display: 'Min visible (sec)',
    video_ocr_merge_gap: 'Merge gap (sec)',
    video_ocr_extract: 'Extract Text',
    video_ocr_running: 'OCR extraction running...',
    video_ocr_done: 'OCR extraction completed.',
    video_ocr_failed: 'OCR extraction failed.',
    video_ocr_download: 'Download OCR file',
    video_ocr_save_db: 'Save to database',
    video_ocr_saved: 'OCR result saved to database.',
    hide_section: 'Hide',
    video_clips: 'Video Clips',
    move_up: 'Up',
    move_down: 'Down',
    subtitle_rename_success: 'Subtitle name saved.',
    subtitle_job_started: 'Subtitle generation started. Please wait...',
    subtitle_job_failed: 'Subtitle generation failed.',
    subtitle_shortcut_on: 'Subtitles on',
    subtitle_shortcut_off: 'Subtitles off',
    video_tools: 'Video Tools',
    video_tools_title: 'Video Tools',
    video_tools_page_back: 'Back to Main View',
    video_tools_page_subtitle: 'Focused workspace for subtitle, OCR, audio channels and clip tools.',
    pin_video: 'Pin video',
    unpin_video: 'Unpin video',
    close: 'Close',
    fullscreen_overlay_settings: 'Overlay Settings',
    fullscreen_overlay_show_controls: 'Show controls',
    fullscreen_overlay_show_timecode: 'Show timecode',
    fullscreen_overlay_show_subtitles: 'Show subtitles',
    fullscreen_overlay_show_audio_graph: 'Show audio graph',
    subtitle_current: 'Current subtitle',
    subtitle_overlay_enabled: 'Show subtitles'
  },
  tr: {
    app_title: 'MAM Konsolu',
    app_subtitle: 'Dalet benzeri MVP: ingest, metadata, iş akışı, versiyonlar',
    current_user: 'Giriş yapan',
    unknown_user: 'Bilinmeyen kullanıcı',
    logout: 'Çıkış Yap',
    language_label: 'Dil',
    admin_page: 'Yönetim',
    ingest_title: 'Varlık Yükle',
    search_title: 'Ara',
    clear_search_fields: 'Tüm arama alanlarını temizle',
    search_upload_tag: 'ARA / YUKLE',
    assets_title: 'Varlıklar',
    asset_detail_title: 'Detay',
    select_asset: 'Bir varlık seçin.',
    ph_title: 'Başlık',
    title: 'Başlık',
    ph_type: 'Tür',
    type_video: 'Video',
    type_audio: 'Ses',
    type_document: 'Doküman',
    type_photo: 'Fotoğraf',
    type_other: 'Diğer',
    ph_owner: 'Sahip',
    choose_file: 'Dosya Sec',
    ph_tags: 'Etiketler (virgülle)',
    ph_duration_auto: 'Süre otomatik algılanır',
    ph_source: 'Kaynak yolu',
    ph_description: 'Açıklama',
    description: 'Açıklama',
    tags: 'Etiketler',
    ph_query: 'Sorgu',
    ph_ocr_query: 'OCR Arama',
    ph_subtitle_query: 'Altyazı Arama',
    ph_tag: 'Etiket',
    ph_type_simple: 'Tür',
    filter_types: 'Türler',
    list_view: 'Liste Görünümü',
    thumbnail_view: 'Küçük Görsel Görünümü',
    trash_scope: 'Çöp',
    any_status: 'Tüm durumlar',
    trash_active: 'Aktif varlıklar',
    trash_only: 'Çöp kutusu',
    trash_all: 'Hepsi (aktif + çöp)',
    btn_upload_create: 'Yükle ve Oluştur',
    uploading: 'Yükleniyor',
    processing: 'İşleniyor',
    btn_apply_filters: 'Filtreleri Uygula',
    no_assets: 'Varlık bulunamadı.',
    playback_source: 'Oynatma kaynağı',
    low_res_proxy: 'Düşük çözünürlük proxy',
    original_file: 'Orijinal dosya',
    proxy_status: 'Proxy durumu',
    proxy_required: 'Proxy hazır değil. Video oynatma, proxy üretimi tamamlanınca kullanılabilir.',
    play: 'Oynat',
    stop: 'Durdur',
    pause: 'Duraklat',
    prev_frame: 'Önceki Kare',
    next_frame: 'Sonraki Kare',
    reverse_frame: 'Geri Kare',
    forward_frame: 'Ileri Kare',
    timecode: 'Zaman Kodu',
    tc: 'TC',
    set_in: 'IN İşaretle',
    set_out: 'OUT İşaretle',
    go_in: 'IN Git',
    go_out: 'OUT Git',
    clear: 'Temizle',
    save_cut: 'Kesimi Kaydet',
    clip_name: 'Klip Adi',
    ph_clip_name: 'Klip adi girin',
    delete_marks: 'İşaretleri Sil',
    delete_cut: 'Kesimi Sil',
    edit_clip: 'Klip Duzenle',
    rename_clip_prompt: 'Yeni klip adini girin',
    edit_in_prompt: 'IN zaman kodunu girin (SS:DD:SS:KK)',
    edit_out_prompt: 'OUT zaman kodunu girin (SS:DD:SS:KK)',
    invalid_timecode: 'Gecersiz zaman kodu formati.',
    invalid_in_out: 'OUT, IN degerinden kucuk olamaz.',
    clip_editor_title: 'Klip Duzenle',
    clip_editor_name: 'Klip Adi',
    clip_editor_in: 'IN Zaman Kodu',
    clip_editor_out: 'OUT Zaman Kodu',
    clip_editor_cancel: 'Iptal',
    clip_editor_save: 'Kaydet',
    jump_to_cut: 'Git',
    play_cut: 'Klip Oynat',
    original_master: 'Orijinal master',
    open_file: 'Dosyayı Aç',
    audio_channels: 'Ses Kanalları',
    group_channel_selection: 'Grup kanal seçimi',
    hide_audio_graph: 'Ses Grafiğini Gizle',
    show_audio_graph: 'Ses Grafiğini Göster',
    open_pdf: 'PDF Aç',
    open_document: 'Dokümanı Aç',
    open_attached: 'Ekli dosyayı aç',
    no_media: 'Eklenmiş medya dosyası yok.',
    no_description: 'Açıklama yok',
    owner: 'Sahip',
    type: 'Tür',
    duration: 'Süre',
    technical_info: 'Teknik Bilgiler',
    tech_loading: 'Teknik bilgiler yükleniyor...',
    tech_unavailable: 'Teknik bilgiler alınamadı.',
    tech_container: 'Kapsayıcı',
    tech_resolution: 'Çözünürlük',
    tech_video_codec: 'Video codec',
    tech_frame_rate: 'Kare hızı',
    tech_pixel_format: 'Piksel formatı',
    tech_audio_codec: 'Ses codec',
    tech_audio_channels: 'Ses kanalı',
    tech_sample_rate: 'Örnekleme hızı',
    tech_duration: 'Süre',
    tech_bitrate: 'Bitrate',
    tech_file_size: 'Dosya boyutu',
    status: 'Durum',
    trash: 'Çöp',
    in_trash: 'Çöpte',
    active: 'Aktif',
    restore: 'Geri Yükle',
    delete_asset: 'Sil',
    delete_permanent: 'Kalıcı Sil',
    move_to_trash_confirm: 'Bu varlık çöpe taşınsın mı?',
    move_to_trash: 'Çöpe Taşı',
    asset_viewer: 'Varlık Görüntüleyici',
    edit_metadata: 'Metadata Düzenle',
    save_metadata: 'Metadata Kaydet',
    metadata_save_failed: 'Metadata kaydetme basarisiz.',
    metadata_edit_locked: 'Metadata düzenleme yetkiniz yok.',
    dublin_core: 'Dublin Core Metadata',
    dc_title: 'DC Baslik',
    dc_creator: 'DC Olusturan',
    dc_subject: 'DC Konu',
    dc_description: 'DC Aciklama',
    dc_publisher: 'DC Yayinci',
    dc_contributor: 'DC Katkida Bulunan',
    dc_date: 'DC Tarih',
    dc_type: 'DC Tur',
    dc_format: 'DC Bicim',
    dc_identifier: 'DC Tanimlayici',
    dc_source: 'DC Kaynak',
    dc_language: 'DC Dil',
    dc_relation: 'DC Iliski',
    dc_coverage: 'DC Kapsam',
    dc_rights: 'DC Haklar',
    workflow_transition: 'İş Akışı Geçişi',
    move_status: 'Durumu Taşıt',
    add_version: 'Versiyon Ekle',
    what_changed: 'Ne değişti',
    create_version: 'Versiyon Oluştur',
    ph_inline_tags: 'etiket1, etiket2',
    ph_version_label: 'v2',
    versions: 'Versiyonlar',
    restore_pdf_version: 'PDF Geri Yükle',
    restore_office_version: 'Office Geri Yükle',
    restore_pdf_original: "Orijinal PDF'ye Dön",
    restore_office_original: "Orijinal Office'e Dön",
    download_pdf_original: "Orijinal PDF'yi İndir",
    download_office_original: "Orijinal Office'i İndir",
    restore_pdf_confirm: 'Bu PDF sürümüne geri dönülsün mü? Mevcut PDF durumu yeni bir restore sürümü olarak kaydedilir.',
    restore_pdf_original_confirm: 'Orijinal PDF snapshotına geri dönülsün mü?',
    restore_office_original_confirm: 'Orijinal Office snapshotına geri dönülsün mü?',
    restore_pdf_unavailable: 'Snapshot yok',
    delete_pdf_version: 'PDF Edit Sürümünü Sil',
    delete_pdf_version_confirm: 'Bu PDF edit sürüm kaydı silinsin mi?',
    delete_version: 'Versiyonu Sil',
    delete_version_confirm: 'Bu versiyon kaydı silinsin mi?',
    edit_version_name: 'Versiyon Adını Düzenle',
    edit_version_name_prompt: 'Yeni versiyon adı',
    edit_version_note_prompt: 'Versiyon notu (opsiyonel)',
    version_actor: 'Yapan',
    version_action: 'İşlem',
    version_change_type: 'Değişiklik Türü',
    action_ingest: 'Yükleme',
    action_manual: 'Manuel',
    action_office_save: 'Office Kaydetme',
    action_pdf_save: 'PDF Kaydetme',
    action_pdf_restore: 'PDF Geri Yükleme',
    action_pdf_restore_original: 'PDF Orijinaline Dönüş',
    action_office_restore: 'Office Geri Yükleme',
    action_office_restore_original: 'Office Orijinaline Dönüş',
    restore_office_confirm: 'Bu Office sürümüne geri dönülsün mü?',
    action_file_replace: 'Dosya Değiştirme',
    pdf_change_redaction: 'Karartma',
    pdf_change_text_insert: 'Yazı Ekleme',
    pdf_change_annotation: 'Not/Şekil',
    pdf_change_mixed: 'Karma',
    pdf_change_unknown: 'Bilinmiyor',
    multi_selected: 'Birden fazla varlık seçildi',
    selected_count: 'Seçili adet',
    bulk_delete_selected: 'Seçilileri Kalıcı Sil',
    bulk_clear_selection: 'Seçimi Temizle',
    bulk_delete_confirm: '{count} seçili varlık kalıcı silinsin mi? Bu işlem geri alınamaz.',
    segment: 'DUR',
    in_label: 'IN',
    out_label: 'OUT',
    trash_confirm: 'Bu varlık kalıcı olarak silinecek. Geri alınamaz.',
    select_media_first: 'Yüklemek için medya dosyası seçin.',
    proxy_failed: 'Proxy açılamadı. Orijinal medyaya geçildi.',
    proxy_fallback_status: 'yedek',
    webaudio_unavailable: 'Bu tarayıcıda Web Audio API desteklenmiyor.',
    audiograph_unsupported: 'Bu tarayıcıda ses grafiği desteklenmiyor.',
    channel_on: 'AÇIK',
    channel_off: 'KAPALI',
    preview_loading: 'Önizleme yükleniyor...',
    preview_not_available: 'Önizleme mevcut değil.',
    preview_not_supported: 'Bu dosya türü için önizleme desteklenmiyor.',
    preview_search_placeholder: 'Önizlemede ara',
    preview_search_empty: 'Eşleşme yok',
    preview_next: 'Sonraki',
    preview_find: 'Bul',
    preview_search_error: 'Arama basarisiz',
    preview_reset: 'Sifirla',
    pdf_preview_unavailable: 'PDF onizleme motoru kullanilamiyor.',
    generate_proxy: 'Proxy Oluştur',
    download_asset: 'İndir',
    download_proxy: "Proxy'yi İndir",
    video_native_audio: 'Yerel video ses modu aktif.',
    subtitles: 'Altyazı',
    subtitle_lang: 'Dil',
    subtitle_none: 'Yüklü altyazı yok',
    subtitle_loaded: 'Altyazı yüklendi',
    subtitle_upload: 'Altyazı Yükle',
    subtitle_generate: 'Altyazı Oluştur',
    subtitle_use_whisperx: 'WhisperX hizalama kullan',
    subtitle_model: 'Model',
    subtitle_model_tiny: 'Tiny',
    subtitle_model_base: 'Base',
    subtitle_model_small: 'Small',
    subtitle_use_zemberek: 'Zemberek düzeltmesi kullan',
    subtitle_audio_stream: 'Ses akışı',
    subtitle_audio_stream_default: 'Varsayılan akış',
    subtitle_audio_channel: 'Kanal',
    subtitle_audio_channel_mix: 'Tüm kanalları karıştır',
    subtitle_upload_success: 'Altyazı yüklendi.',
    subtitle_generate_success: 'Altyazı oluşturuldu.',
    tool_options: 'Opsiyonlar',
    subtitle_file_required: 'Önce bir .srt veya .vtt altyazı dosyası seçin.',
    subtitle_name: 'Altyazı adı',
    subtitle_save_name: 'Adı kaydet',
    subtitle_list: 'Altyazı listesi',
    subtitle_use: 'Kullan',
    subtitle_active: 'Aktif',
    subtitle_download: 'Indir',
    subtitle_remove: 'Sil',
    subtitle_remove_confirm: 'Bu altyazi listeden silinsin mi?',
    subtitle_no_items: 'Altyazı yok',
    subtitle_search_ph: 'Altyazıda ara',
    subtitle_search_btn: 'Altyazıda Ara',
    subtitle_search_empty: 'Altyazıda eşleşme yok.',
    subtitle_did_you_mean: 'Bunu mu demek istediniz',
    subtitle_search_results: 'Altyazı Eşleşmeleri',
    subtitle_jump: 'Git',
    ocr_hit: 'OCR',
    video_ocr: 'Video OCR',
    video_ocr_interval: 'Aralık (sn)',
    video_ocr_lang: 'OCR dil',
    video_ocr_preset: 'Preset',
    video_ocr_preset_general: 'Genel',
    video_ocr_preset_ticker: 'Ticker (sağdan sola)',
    video_ocr_preset_credits: 'Credits (aşağıdan yukarı)',
    video_ocr_preset_static: 'Sabit yazı',
    ocr_stage_preprocess: 'Ön İşlem',
    ocr_stage_process: 'Karakter Algılama',
    ocr_stage_postprocess: 'Son İşlem',
    video_ocr_engine: 'Motor',
    video_ocr_preprocess: 'Ön işlem',
    video_ocr_preprocess_off: 'Kapalı',
    video_ocr_preprocess_light: 'Hafif',
    video_ocr_preprocess_strong: 'Güçlü',
    video_ocr_blur_filter: 'Bulanıklık filtresi',
    video_ocr_blur_threshold: 'Bulanıklık eşiği',
    video_ocr_region_mode: 'Ticker modu',
    video_ocr_ticker_height: 'Ticker yüksekliği (%)',
    video_ocr_engine_paddle: 'PaddleOCR',
    video_ocr_name: 'OCR adı',
    video_ocr_name_ph: 'Opsiyonel OCR dosya adı',
    video_ocr_advanced: 'Sahne tabanlı OCR',
    video_ocr_advanced_help: 'Sahne değişimlerinde ek kare örnekler ve tekrar eden metni daha uzun süre aralıklarında birleştirir.',
    video_ocr_ai_correct: 'Türkçe çevrimdışı düzeltme',
    video_ocr_static_filter: 'Sabit yazıları filtrele',
    video_ocr_ignore_phrases: 'Hariç kelimeler',
    video_ocr_ignore_phrases_ph: 'NotebookLM, filigran',
    video_ocr_min_display: 'Min görünme (sn)',
    video_ocr_merge_gap: 'Birleşme aralığı (sn)',
    video_ocr_extract: 'Metni Çıkar',
    video_ocr_running: 'OCR çıkarımı çalışıyor...',
    video_ocr_done: 'OCR çıkarımı tamamlandı.',
    video_ocr_failed: 'OCR çıkarımı başarısız.',
    video_ocr_download: 'OCR dosyasını indir',
    video_ocr_save_db: 'Veritabanına kaydet',
    video_ocr_saved: 'OCR sonucu veritabanına kaydedildi.',
    hide_section: 'Gizle',
    video_clips: 'Video Klipler',
    move_up: 'Yukari',
    move_down: 'Asagi',
    subtitle_rename_success: 'Altyazı adı kaydedildi.',
    subtitle_job_started: 'Altyazı üretimi başladı. Lütfen bekleyin...',
    subtitle_job_failed: 'Altyazı üretimi başarısız.',
    subtitle_shortcut_on: 'Altyazı açık',
    subtitle_shortcut_off: 'Altyazı kapalı',
    video_tools: 'Video Araçları',
    video_tools_title: 'Video Araçları',
    video_tools_page_back: 'Ana Görünüme Dön',
    video_tools_page_subtitle: 'Altyazı, OCR, ses kanalları ve klip araçları için odaklı çalışma alanı.',
    pin_video: 'Videoyu sabitle',
    unpin_video: 'Video sabitlemeyi kaldır',
    close: 'Kapat',
    fullscreen_overlay_settings: 'Overlay Ayarları',
    fullscreen_overlay_show_controls: 'Kontrolleri göster',
    fullscreen_overlay_show_timecode: 'Timecode göster',
    fullscreen_overlay_show_subtitles: 'Altyazı göster',
    fullscreen_overlay_show_audio_graph: 'Ses grafiği göster',
    subtitle_current: 'Mevcut altyazı',
    subtitle_overlay_enabled: 'Altyazı göster'
  }
};
let currentLang = localStorage.getItem(LOCAL_LANG) || 'en';

async function loadI18nFile() {
  try {
    const response = await fetch(I18N_PATH, { cache: 'no-cache' });
    if (!response.ok) return;
    const external = await response.json();
    if (!external || typeof external !== 'object') return;
    if (external.en && typeof external.en === 'object') {
      i18n.en = { ...i18n.en, ...external.en };
    }
    if (external.tr && typeof external.tr === 'object') {
      i18n.tr = { ...i18n.tr, ...external.tr };
    }
  } catch (_error) {
    // Keep bundled translations if file is missing or invalid.
  }
}

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function toStrictBool(value, fallback = false) {
  if (value == null) return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return Boolean(fallback);
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off', 'null', 'undefined'].includes(raw)) return false;
  return Boolean(fallback);
}

function tf(key, vars = {}) {
  let text = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return text;
}

function useCustomPlayerUI() {
  return String(playerUiMode || 'native') === 'custom';
}

function useVidstackPlayerUI() {
  return String(playerUiMode || 'native') === 'vidstack';
}

function useVideoJsPlayerUI() {
  return String(playerUiMode || 'native') === 'videojs';
}

function useMpegDashPlayerUI() {
  return String(playerUiMode || 'native') === 'mpegdash';
}

function useCustomLikeTimelineUI() {
  return useCustomPlayerUI() || useVidstackPlayerUI() || useMpegDashPlayerUI();
}

async function loadUiSettings() {
  try {
    const settings = await api('/api/ui-settings');
    const mode = String(settings?.playerUiMode || 'native').trim().toLowerCase();
    playerUiMode = (mode === 'custom' || mode === 'videojs' || mode === 'vidstack' || mode === 'mpegdash') ? mode : 'native';
  } catch (_error) {
    playerUiMode = 'native';
  }
}

function applyStaticI18n() {
  document.title = t('app_title');
  document.documentElement.lang = currentLang === 'tr' ? 'tr' : 'en';
  document.body.classList.toggle('lang-tr', currentLang === 'tr');
  document.body.classList.toggle('lang-en', currentLang !== 'tr');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });
  if (currentUserBtn && !currentUserBtn.dataset.value) {
    currentUserBtn.textContent = t('unknown_user');
  }
  if (assetViewThumbBtn) {
    assetViewThumbBtn.removeAttribute('title');
    assetViewThumbBtn.setAttribute('aria-label', t('thumbnail_view'));
    assetViewThumbBtn.dataset.tooltip = t('thumbnail_view');
  }
  if (assetViewListBtn) {
    assetViewListBtn.removeAttribute('title');
    assetViewListBtn.setAttribute('aria-label', t('list_view'));
    assetViewListBtn.dataset.tooltip = t('list_view');
  }
}

function applyAssetViewModeUI() {
  const isList = assetViewMode === 'list';
  assetGrid.classList.toggle('list-view', isList);
  assetViewListBtn?.classList.toggle('active', isList);
  assetViewThumbBtn?.classList.toggle('active', !isList);
}

async function loadCurrentUser() {
  if (!currentUserBtn) return;
  try {
    const me = await api('/api/me');
    const username = String(me.username || '').trim();
    const displayName = String(me.displayName || '').trim();
    const email = String(me.email || '').trim();
    const canAccessAdmin = toStrictBool(me.canAccessAdmin, toStrictBool(me.isAdmin, false));
    const canAccessTextAdmin = toStrictBool(me.canAccessTextAdmin, canAccessAdmin);
    const canEditMetadata = toStrictBool(me.canEditMetadata, false);
    const canEditOffice = toStrictBool(me.canEditOffice, false);
    const canDeleteAssets = toStrictBool(me.canDeleteAssets, toStrictBool(me.isAdmin, false));
    const canUsePdfAdvancedTools = toStrictBool(me.canUsePdfAdvancedTools, toStrictBool(me.isAdmin, false));
    currentUserCanAccessAdmin = canAccessAdmin;
    currentUserCanEditMetadata = canEditMetadata;
    currentUserCanEditOffice = canEditOffice;
    currentUserCanDeleteAssets = canDeleteAssets;
    currentUserCanUsePdfAdvancedTools = canUsePdfAdvancedTools;
    currentOfficeEditorProvider = ['onlyoffice', 'libreoffice'].includes(String(me.officeEditorProvider || '').trim().toLowerCase())
      ? String(me.officeEditorProvider || '').trim().toLowerCase()
      : 'none';
    currentUsername = username.toLowerCase();
    const value = displayName || username || (email.includes('@') ? email.split('@')[0] : '') || t('unknown_user');
    currentUserBtn.dataset.value = value;
    currentUserBtn.textContent = value;
    currentUserBtn.title = value;
    if (adminMenuLink) {
      adminMenuLink.classList.toggle('hidden', !(canAccessAdmin || canAccessTextAdmin));
    }
  } catch (_error) {
    currentUserCanAccessAdmin = false;
    currentUserCanEditMetadata = false;
    currentUserCanEditOffice = false;
    currentUserCanDeleteAssets = false;
    currentUserCanUsePdfAdvancedTools = false;
    currentOfficeEditorProvider = 'none';
    currentUserBtn.dataset.value = '';
    currentUserBtn.textContent = t('unknown_user');
    currentUserBtn.title = t('unknown_user');
    if (adminMenuLink) adminMenuLink.classList.add('hidden');
  }
}

function workflowLabel(status) {
  const map = {
    Ingested: currentLang === 'tr' ? 'Yüklendi' : 'Ingested',
    QC: 'QC',
    Approved: currentLang === 'tr' ? 'Onaylandı' : 'Approved',
    Published: currentLang === 'tr' ? 'Yayında' : 'Published',
    Archived: currentLang === 'tr' ? 'Arşivlendi' : 'Archived'
  };
  return map[status] || status;
}

function loadPanelPrefs() {
  try {
    const sizes = JSON.parse(localStorage.getItem(LOCAL_PANEL_SIZE) || '{}');
    panelSizes = { ...panelSizes, ...sizes };
  } catch (_e) {
    // Keep defaults if local storage has invalid JSON.
  }
}

function loadPanelVisibilityPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_PANEL_VIS) || '{}');
    panelVisibility = {
      panelIngest: stored.panelIngest !== false,
      panelAssets: stored.panelAssets !== false,
      panelDetail: stored.panelDetail !== false
    };
  } catch (_e) {
    panelVisibility = { panelIngest: true, panelAssets: true, panelDetail: true };
  }
}

function savePanelPrefs() {
  localStorage.setItem(LOCAL_PANEL_SIZE, JSON.stringify(panelSizes));
}

function savePanelVisibilityPrefs() {
  localStorage.setItem(LOCAL_PANEL_VIS, JSON.stringify(panelVisibility));
}

function isPanelVisible(panelId) {
  return panelVisibility[panelId] !== false;
}

function setPanelVisible(panelId, nextVisible) {
  panelVisibility[panelId] = Boolean(nextVisible);

  if (!isPanelVisible('panelIngest') && !isPanelVisible('panelAssets') && !isPanelVisible('panelDetail')) {
    panelVisibility.panelAssets = true;
  }

  applyPanelLayout();
  if (!isVideoToolsPageMode) savePanelVisibilityPrefs();
}

function getEffectiveDetailMinPx() {
  return Math.max(DETAIL_PANEL_BASE_MIN_PX, Math.round(Number(dynamicDetailMinPx) || 0));
}

function ensureDetailPanelMinWidth(requiredPx) {
  const targetPx = Math.max(getEffectiveDetailMinPx(), Math.round(Number(requiredPx) || 0));
  dynamicDetailMinPx = targetPx;
  if (panelDetail) panelDetail.style.minWidth = `${targetPx}px`;
  if (!isPanelVisible('panelDetail')) return;
  const currentPx = Math.round(panelDetail.getBoundingClientRect().width || 0);
  if (currentPx >= targetPx - 1) {
    applyPanelLayout();
    return;
  }

  const assetsVisible = isPanelVisible('panelAssets');
  const ingestVisible = isPanelVisible('panelIngest');
  const donorId = assetsVisible ? 'panelAssets' : (ingestVisible ? 'panelIngest' : '');
  if (!donorId) {
    applyPanelLayout();
    return;
  }

  const donorEl = donorId === 'panelAssets' ? panelAssets : panelIngest;
  const donorStartPx = Math.round(donorEl?.getBoundingClientRect().width || 0);
  const detailStartPx = currentPx;
  const donorStartFr = Number(panelSizes[donorId]) || 1;
  const detailStartFr = Number(panelSizes.panelDetail) || 1;
  const pairWidth = donorStartPx + detailStartPx;
  const pairFr = donorStartFr + detailStartFr;
  const unitPx = pairWidth > 0 && pairFr > 0 ? (pairWidth / pairFr) : 0;
  if (!unitPx) {
    applyPanelLayout();
    return;
  }

  const needPx = Math.max(0, targetPx - detailStartPx);
  if (needPx <= 0) {
    applyPanelLayout();
    return;
  }

  const donorMinFr = donorId === 'panelIngest'
    ? Math.max(0.45, 235 / unitPx)
    : 0.45;
  const targetMinFr = Math.max(0.22, targetPx / unitPx);
  let nextDonorFr = donorStartFr - (needPx / unitPx);
  let nextDetailFr = detailStartFr + (needPx / unitPx);
  if (nextDonorFr < donorMinFr) {
    const shortage = donorMinFr - nextDonorFr;
    nextDonorFr = donorMinFr;
    nextDetailFr = Math.max(targetMinFr, nextDetailFr - shortage);
  }
  panelSizes[donorId] = nextDonorFr;
  panelSizes.panelDetail = Math.max(targetMinFr, nextDetailFr);
  applyPanelLayout();
}

function resetDetailPanelDynamicMinWidth() {
  dynamicDetailMinPx = DETAIL_PANEL_BASE_MIN_PX;
  if (panelDetail) panelDetail.style.minWidth = `${DETAIL_PANEL_BASE_MIN_PX}px`;
  applyPanelLayout();
}

function measureClipsPanelRequiredWidth(root = document) {
  const clipsSection = root.querySelector('.collapsible-section[data-section="clips"]');
  if (!clipsSection || clipsSection.classList.contains('collapsed')) return DETAIL_PANEL_BASE_MIN_PX;
  const head = clipsSection.querySelector('.collapsible-head');
  const body = clipsSection.querySelector('.collapsible-body');
  const markSummary = clipsSection.querySelector('#markSummary');
  const cutsList = clipsSection.querySelector('#cutsList');
  const labelRow = clipsSection.querySelector('.cut-label-row');
  const actionsRow = clipsSection.querySelector('.cut-actions');
  const widths = [
    clipsSection.scrollWidth,
    head?.scrollWidth || 0,
    body?.scrollWidth || 0,
    markSummary?.scrollWidth || 0,
    cutsList?.scrollWidth || 0,
    labelRow?.scrollWidth || 0,
    actionsRow?.scrollWidth || 0
  ];
  return Math.max(DETAIL_PANEL_BASE_MIN_PX, Math.ceil(Math.max(...widths) + 28));
}

function applyPanelLayout() {
  const ingest = Math.max(0.34, Number(panelSizes.panelIngest) || 1);
  const assets = Math.max(0.45, Number(panelSizes.panelAssets) || 1);
  const detail = Math.max(0.22, Number(panelSizes.panelDetail) || 1);
  const ingestVisible = isPanelVisible('panelIngest');
  const assetsVisible = isPanelVisible('panelAssets');
  const detailVisible = isPanelVisible('panelDetail');
  const detailOnlyMode = detailVisible && !ingestVisible && !assetsVisible;
  const assetsOnlyMode = assetsVisible && !ingestVisible && !detailVisible;

  if (detailOnlyMode) {
    layout.style.gridTemplateColumns = '0px 0px 0px 0px 1fr';
  } else if (assetsOnlyMode) {
    layout.style.gridTemplateColumns = '0px 0px 1fr 0px 0px';
  } else {
    layout.style.gridTemplateColumns = `${ingestVisible ? `${ingest}fr` : '0px'} ${ingestVisible && assetsVisible ? '5px' : '0px'} ${assetsVisible ? `${assets}fr` : '0px'} ${assetsVisible && detailVisible ? '5px' : '0px'} ${detailVisible ? `${detail}fr` : '0px'}`;
  }
  panelIngest.style.display = ingestVisible ? '' : 'none';
  panelAssets.style.display = assetsVisible ? '' : 'none';
  panelDetail.style.display = detailVisible ? '' : 'none';
  panelDetail.style.minWidth = detailVisible ? `${getEffectiveDetailMinPx()}px` : '0px';
  layout.classList.toggle('detail-only-mode', detailOnlyMode);

  splitterTabs.forEach((tab) => {
    const panelId = tab.dataset.showPanel;
    if (!panelId) return;
    tab.style.display = isPanelVisible(panelId) ? 'none' : 'inline-flex';
  });
}

function initPanelSplitters() {
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const MIN_INGEST_PX = 235;
  const MIN_ASSETS_PX = 290;
  const minSize = 0.45;
  const minDetail = 0.22;

  const clampPair = (a, b, minA = minSize, minB = minSize) => {
    if (a < minA) {
      b -= minA - a;
      a = minA;
    }
    if (b < minB) {
      a -= minB - b;
      b = minB;
    }
    return [Math.max(minA, a), Math.max(minB, b)];
  };

  splitters.forEach((splitter) => {
    splitter.addEventListener('pointerdown', (event) => {
      if (isMobile()) return;
      if (event.target.closest('.splitter-tab')) return;
      event.preventDefault();

      const kind = splitter.dataset.splitter;
      const ingestVisible = isPanelVisible('panelIngest');
      const assetsVisible = isPanelVisible('panelAssets');
      const detailVisible = isPanelVisible('panelDetail');
      const directMode = !assetsVisible && ingestVisible && detailVisible;

      if (!directMode) {
        if (kind === 'left' && !(ingestVisible && assetsVisible)) return;
        if (kind === 'right' && !(assetsVisible && detailVisible)) return;
      }

      const startX = event.clientX;
      const ingestStart = Number(panelSizes.panelIngest) || 1;
      const assetsStart = Number(panelSizes.panelAssets) || 1;
      const detailStart = Number(panelSizes.panelDetail) || 1;
      const pairWidth = directMode
        ? (panelIngest.clientWidth + panelDetail.clientWidth)
        : (kind === 'left'
          ? (panelIngest.clientWidth + panelAssets.clientWidth)
          : (panelAssets.clientWidth + panelDetail.clientWidth));
      const pairFr = directMode
        ? (ingestStart + detailStart)
        : (kind === 'left'
          ? (ingestStart + assetsStart)
          : (assetsStart + detailStart));
      const unitPx = pairWidth / pairFr;
      if (!unitPx || unitPx <= 0) return;

      const onMove = (moveEvent) => {
        const deltaPx = moveEvent.clientX - startX;
        const deltaFr = deltaPx / unitPx;

        if (directMode) {
          let nextIngest = ingestStart + deltaFr;
          let nextDetail = detailStart - deltaFr;
          const minIngest = Math.max(minSize, MIN_INGEST_PX / unitPx);
          const minDetailFr = Math.max(minDetail, getEffectiveDetailMinPx() / unitPx);
          [nextIngest, nextDetail] = clampPair(nextIngest, nextDetail, minIngest, minDetailFr);
          panelSizes.panelIngest = nextIngest;
          panelSizes.panelDetail = nextDetail;
        } else if (kind === 'left') {
          let nextIngest = ingestStart + deltaFr;
          let nextAssets = assetsStart - deltaFr;
          const minIngest = Math.max(minSize, MIN_INGEST_PX / unitPx);
          const minAssets = Math.max(minSize, MIN_ASSETS_PX / unitPx);
          [nextIngest, nextAssets] = clampPair(nextIngest, nextAssets, minIngest, minAssets);
          panelSizes.panelIngest = nextIngest;
          panelSizes.panelAssets = nextAssets;
        } else {
          let nextAssets = assetsStart + deltaFr;
          let nextDetail = detailStart - deltaFr;
          const minAssets = Math.max(minSize, MIN_ASSETS_PX / unitPx);
          const minDetailFr = Math.max(minDetail, getEffectiveDetailMinPx() / unitPx);
          [nextAssets, nextDetail] = clampPair(nextAssets, nextDetail, minAssets, minDetailFr);
          panelSizes.panelAssets = nextAssets;
          panelSizes.panelDetail = nextDetail;
        }

        applyPanelLayout();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        savePanelPrefs();
      };

      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const textBody = await response.text();
  let parsedBody = null;
  if (textBody) {
    try {
      parsedBody = JSON.parse(textBody);
    } catch (_error) {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const fallback = textBody
      ? textBody.replace(/\s+/g, ' ').trim().slice(0, 220)
      : '';
    const errMsg = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody.error
      : '';
    throw new Error(errMsg || fallback || 'Request failed');
  }

  if (!textBody) return {};
  if (parsedBody !== null) return parsedBody;
  return {};
}

function explainApiError(error) {
  const message = String(error?.message || 'Request failed');
  if (/missing api token/i.test(message)) {
    return `${message}. OAuth aktifken arayuzu dogrudan app portundan acmayin; http://localhost:3000/ uzerinden girin.`;
  }
  return message;
}

function showAssetLoadError(error) {
  const message = explainApiError(error);
  assetGrid.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

async function deleteApi(path) {
  const response = await fetch(path, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
}

function setUploadProgress(percent, label = '') {
  if (!uploadProgressWrap || !uploadProgressText) return;
  uploadProgressWrap.classList.remove('hidden');
  if (uploadProgressSpinner) uploadProgressSpinner.classList.remove('hidden');
  uploadProgressText.textContent = label || t('uploading');
}

function hideUploadProgress() {
  if (!uploadProgressWrap || !uploadProgressText) return;
  uploadProgressWrap.classList.add('hidden');
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
  if (uploadProgressSpinner) uploadProgressSpinner.classList.add('hidden');
  uploadProgressText.textContent = '';
}

function uploadAssetWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/assets/upload');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = (event.loaded / event.total) * 100;
      onProgress?.(pct);
    };

    xhr.onerror = () => reject(new Error('Upload request failed'));
    xhr.onload = () => {
      const raw = String(xhr.responseText || '');
      let parsed = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch (_e) { parsed = {}; }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed);
      } else {
        const error = new Error(parsed.error || 'Upload failed');
        if (parsed && typeof parsed === 'object') {
          Object.assign(error, parsed);
        }
        reject(error);
      }
    };

    xhr.send(JSON.stringify(payload));
  });
}

function formatIngestWarningMessage(created) {
  const warnings = Array.isArray(created?.ingestWarnings) ? created.ingestWarnings : [];
  if (!warnings.length) return '';
  const lines = [t('upload_saved_with_warnings')];
  const hintSet = new Set();
  warnings.forEach((warning) => {
    const message = localizeUploadWarning(warning);
    if (message) lines.push(`- ${message}`);
    const hint = localizeUploadRetryHint(String(warning?.code || '').trim(), warning?.retryHint);
    if (hint) hintSet.add(hint);
  });
  if (hintSet.size) {
    lines.push('');
    hintSet.forEach((hint) => lines.push(hint));
  } else {
    lines.push(t('upload_warning_retry_hint'));
  }
  return lines.join('\n');
}

function localizeUploadWarning(warning) {
  const code = String(warning?.code || '').trim();
  if (code === 'proxy_generation_failed') return t('upload_warning_proxy_generation_failed');
  if (code === 'proxy_generation_skipped') return t('upload_warning_proxy_generation_skipped');
  if (code === 'proxy_audio_fallback') return t('upload_warning_proxy_audio_fallback');
  if (code === 'thumbnail_generation_failed') return t('upload_warning_thumbnail_generation_failed');
  const message = String(warning?.message || '').trim();
  return message;
}

function localizeUploadRetryHint(code, fallback = '') {
  if (code === 'proxy_generation_failed' || code === 'proxy_generation_skipped' || code === 'proxy_audio_fallback') {
    return t('upload_warning_proxy_retry_hint');
  }
  if (code === 'thumbnail_generation_failed') {
    return t('upload_warning_thumbnail_retry_hint');
  }
  return String(fallback || '').trim();
}

function showUploadProxyDecisionModal(error) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    const detail = t('upload_proxy_confirm_detail');
    // Basit confirm yerine üç farklı sonucu net ayıran özel modal kullanıyoruz.
    backdrop.className = 'clip-modal-backdrop';
    backdrop.innerHTML = `
      <div class="clip-modal upload-decision-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('upload_proxy_confirm_title'))}">
        <h4>${escapeHtml(t('upload_proxy_confirm_title'))}</h4>
        <div class="upload-decision-copy">
          <p>${escapeHtml(detail)}</p>
          <p>${escapeHtml(t('upload_proxy_confirm_message'))}</p>
        </div>
        <div class="clip-modal-actions upload-decision-actions">
          <button type="button" class="upload-decision-primary" data-choice="silent">${escapeHtml(t('upload_proxy_confirm_silent'))}</button>
          <button type="button" class="upload-decision-secondary" data-choice="metadata">${escapeHtml(t('upload_proxy_confirm_metadata_only'))}</button>
          <button type="button" class="upload-decision-cancel" data-choice="cancel">${escapeHtml(t('upload_proxy_confirm_cancel'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = (choice) => {
      backdrop.remove();
      resolve(choice);
    };

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close('cancel');
    });
    backdrop.querySelectorAll('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => close(String(button.dataset.choice || 'cancel')));
    });
  });
}

async function waitUntilAssetVisible(assetId, maxAttempts = 8) {
  if (!assetId) {
    await loadAssets();
    return true;
  }
  for (let i = 0; i < maxAttempts; i += 1) {
    await loadAssets();
    if (currentAssets.some((asset) => asset.id === assetId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractPdfChangeKindFromNote(note) {
  const m = String(note || '').match(/\[change:([a-z_]+)\]/i);
  return m ? String(m[1] || '').trim().toLowerCase() : '';
}

function renderPdfChangeKindLabel(version) {
  const kind = extractPdfChangeKindFromNote(version?.note);
  if (!kind) return '';
  return t(`pdf_change_${kind}`) || kind;
}

function cleanVersionNoteText(note) {
  return String(note || '').replace(/\s*\[change:[a-z_]+\]\s*/ig, ' ').replace(/\s{2,}/g, ' ').trim();
}

function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr');
}

function findMatchRanges(text, query) {
  const raw = String(text || '').normalize('NFC');
  const q = String(query || '').trim().normalize('NFC');
  if (!raw || !q) return [];
  const rawLower = raw.toLocaleLowerCase('tr');
  const qLower = q.toLocaleLowerCase('tr');
  const ranges = [];
  let from = 0;
  while (true) {
    const idx = rawLower.indexOf(qLower, from);
    if (idx < 0) break;
    ranges.push([idx, idx + q.length]);
    from = idx + q.length;
  }
  return ranges;
}

function highlightTextByRanges(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  let out = '';
  let last = 0;
  ranges.forEach(([start, end]) => {
    if (start > last) out += escapeHtml(String(text).slice(last, start));
    out += `<mark class="search-hit">${escapeHtml(String(text).slice(start, end))}</mark>`;
    last = end;
  });
  if (last < String(text).length) out += escapeHtml(String(text).slice(last));
  return out;
}

function serializeForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function escapeRegexForSuggest(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeRegExp(value) {
  return escapeRegexForSuggest(value);
}

const searchSuggestModule = window.createMainSearchSuggestModule({
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
});

function hideSearchSuggestions() {
  return searchSuggestModule.hideSearchSuggestions();
}

function hideOcrSuggestions() {
  return searchSuggestModule.hideOcrSuggestions();
}

function hideSubtitleSuggestions() {
  return searchSuggestModule.hideSubtitleSuggestions();
}

function queueSearchSuggestions() {
  return searchSuggestModule.queueSearchSuggestions();
}

function queueOcrSuggestions() {
  return searchSuggestModule.queueOcrSuggestions();
}

function queueSubtitleSuggestions() {
  return searchSuggestModule.queueSubtitleSuggestions();
}

async function applySearchSuggestion(item, runSearch = true) {
  return searchSuggestModule.applySearchSuggestion(item, runSearch);
}

async function applyOcrSuggestion(item, runSearch = true) {
  return searchSuggestModule.applyOcrSuggestion(item, runSearch);
}

async function applySubtitleSuggestion(item, runSearch = true) {
  return searchSuggestModule.applySubtitleSuggestion(item, runSearch);
}

searchSuggestModule.init();

function highlightMatch(value, query, markClass = 'search-hit') {
  const raw = String(value ?? '');
  const specs = extractHighlightSpecs(query);
  if (!specs.length) return escapeHtml(raw);

  const foldChar = (ch) => String(ch || '')
    .replace(/[İIı]/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

  const originalChars = Array.from(raw);
  let folded = '';
  const foldedToOriginal = [];
  for (let i = 0; i < originalChars.length; i += 1) {
    const piece = foldChar(originalChars[i]);
    if (!piece) continue;
    folded += piece;
    for (let j = 0; j < piece.length; j += 1) {
      foldedToOriginal.push(i);
    }
  }
  if (!folded || !foldedToOriginal.length) return escapeHtml(raw);

  const foldedTerms = specs
    .map((spec) => ({
      term: foldSearchText(spec.term),
      exactPhrase: Boolean(spec.exactPhrase)
    }))
    .filter((spec) => spec.term)
    .sort((a, b) => b.term.length - a.term.length);
  if (!foldedTerms.length) return escapeHtml(raw);

  const ranges = [];
  const occupied = new Set();
  const pushRange = (idx, end, spec) => {
    if (idx < 0 || end <= idx) return false;
    let overlaps = false;
    for (let p = idx; p < end; p += 1) {
      if (occupied.has(p)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) return false;
    const startOrig = foldedToOriginal[idx];
    const endOrig = foldedToOriginal[end - 1] + 1;
    ranges.push([startOrig, endOrig, spec.exactPhrase ? 'search-hit-exact' : markClass]);
    for (let p = idx; p < end; p += 1) occupied.add(p);
    return true;
  };

  for (const spec of foldedTerms) {
    let from = 0;
    while (from < folded.length) {
      const idx = folded.indexOf(spec.term, from);
      if (idx < 0) break;
      const end = idx + spec.term.length;
      pushRange(idx, end, spec);
      from = idx + 1;
    }
  }

  // Quoted phrases should still highlight when OCR/subtitle inserted variable whitespace.
  foldedTerms
    .filter((spec) => spec.exactPhrase && /\s/.test(spec.term))
    .forEach((spec) => {
      const parts = spec.term.split(/\s+/).filter(Boolean).map(escapeRegExp);
      if (parts.length < 2) return;
      const regex = new RegExp(parts.join('\\s+'), 'g');
      let match = regex.exec(folded);
      while (match) {
        pushRange(match.index, match.index + match[0].length, spec);
        regex.lastIndex = match.index + 1;
        match = regex.exec(folded);
      }
    });

  if (!ranges.length) return escapeHtml(raw);
  ranges.sort((a, b) => a[0] - b[0]);

  let out = '';
  let cursor = 0;
  const inlineStyles = {
    'search-hit-fuzzy': 'background:#ff1f1f;color:#fff;border:1px solid #b30000;border-radius:3px;padding:0 2px;',
    'search-hit-exact': 'background:#28a745;color:#fff;border:1px solid #146c2e;border-radius:3px;padding:0 2px;'
  };
  for (const [start, end, rangeClass] of ranges) {
    if (start > cursor) out += escapeHtml(raw.slice(cursor, start));
    const safeClass = rangeClass || markClass || 'search-hit';
    const style = inlineStyles[safeClass] ? ` style="${inlineStyles[safeClass]}"` : '';
    out += `<mark class="${escapeHtml(safeClass)}"${style}>${escapeHtml(raw.slice(start, end))}</mark>`;
    cursor = Math.max(cursor, end);
  }
  if (cursor < raw.length) out += escapeHtml(raw.slice(cursor));
  return out;
}

function extractHighlightTerms(query) {
  return extractHighlightSpecs(query)
    .map((spec) => spec.term)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function dcHighlightSnippet(asset, query, markClass = 'search-hit') {
  const terms = extractHighlightTerms(query);
  if (!terms.length || !asset || !asset.dcMetadata || typeof asset.dcMetadata !== 'object') return '';
  const ignoredKeys = new Set([
    'subtitleurl', 'subtitleitems',
    'videoocrurl', 'videoocrlinecount', 'videoocrsegmentcount', 'videoocritems'
  ]);
  const entries = Object.entries(asset.dcMetadata)
    .filter(([key, value]) => {
      const foldedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ignoredKeys.has(foldedKey)) return false;
      if (value === null || value === undefined) return false;
      if (typeof value === 'object') return false;
      return terms.some((term) => textIncludesSearchTerm(value, term));
    })
    .slice(0, 2);
  if (!entries.length) return '';
  return entries
    .map(([key, value]) => {
      const normalizedKey = String(key || '').trim().toLowerCase();
      const inputName = ({
        title: 'dcTitle',
        creator: 'dcCreator',
        subject: 'dcSubject',
        description: 'dcDescription',
        publisher: 'dcPublisher',
        contributor: 'dcContributor',
        date: 'dcDate',
        type: 'dcType',
        format: 'dcFormat',
        identifier: 'dcIdentifier',
        source: 'dcSource',
        language: 'dcLanguage',
        relation: 'dcRelation',
        coverage: 'dcCoverage',
        rights: 'dcRights'
      })[normalizedKey] || '';
      const labelKey = ({
        title: 'dc_title',
        creator: 'dc_creator',
        subject: 'dc_subject',
        description: 'dc_description',
        publisher: 'dc_publisher',
        contributor: 'dc_contributor',
        date: 'dc_date',
        type: 'dc_type',
        format: 'dc_format',
        identifier: 'dc_identifier',
        source: 'dc_source',
        language: 'dc_language',
        relation: 'dc_relation',
        coverage: 'dc_coverage',
        rights: 'dc_rights'
      })[normalizedKey] || normalizedKey;
      return `<button type="button" class="dc-hit field-hit-jump" data-field-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-field-name="${escapeHtml(inputName)}"><strong>${escapeHtml(t(labelKey))}:</strong> ${highlightMatch(value, query, markClass)}</button>`;
    })
    .join(' ');
}

function metadataHighlightSnippet(asset, query, markClass = 'search-hit') {
  const terms = extractHighlightTerms(query);
  if (!terms.length || !asset) return '';
  const hits = [];
  const description = String(asset.description || '').trim();
  if (description) {
    if (terms.some((term) => textIncludesSearchTerm(description, term))) {
      hits.push(`
        <button
          type="button"
          class="dc-hit field-hit-jump"
          data-field-jump="1"
          data-id="${escapeHtml(String(asset.id || ''))}"
          data-field-name="description"
        ><strong>${escapeHtml(t('description'))}:</strong> ${highlightMatch(description, query, markClass)}</button>
      `.trim());
    }
  }
  return hits.slice(0, 2).join(' ');
}

function tagHighlightSnippet(asset, query, markClass = 'search-hit') {
  const terms = extractHighlightTerms(query);
  const tags = Array.isArray(asset?.tags) ? asset.tags : [];
  if (!terms.length || !tags.length) return '';
  const hits = tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .filter((tag) => {
      return terms.some((term) => textIncludesSearchTerm(tag, term));
    })
    .slice(0, 3);
  if (!hits.length) return '';
  return hits
    .map((tag) => `<button type="button" class="dc-hit field-hit-jump" data-field-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-field-name="tags" data-focus-tag="${escapeHtml(tag)}"><strong>${escapeHtml(t('tags'))}:</strong> ${highlightMatch(tag, query, markClass)}</button>`)
    .join(' ');
}

function clipHighlightSnippet(asset, query, markClass = 'search-hit') {
  const terms = extractHighlightTerms(query);
  if (!terms.length || !asset || !Array.isArray(asset.cuts)) return '';
  const clips = asset.cuts
    .map((cut) => ({
      cutId: String(cut?.cutId || '').trim(),
      label: String(cut?.label || '').trim(),
      inPointSeconds: Math.max(0, Number(cut?.inPointSeconds || 0))
    }))
    .filter((cut) => {
      return cut.cutId && cut.label && terms.some((term) => textIncludesSearchTerm(cut.label, term));
    })
    .slice(0, 2);
  if (!clips.length) return '';
  return clips
    .map((cut) => {
      const startTc = secondsToTimecode(cut.inPointSeconds, PLAYER_FPS);
      return `<button type="button" class="dc-hit clip-hit-jump" data-clip-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-cut-id="${escapeHtml(String(cut.cutId || ''))}" data-start-sec="${escapeHtml(String(cut.inPointSeconds))}"><strong>${escapeHtml(t('clip_name'))}:</strong> ${highlightMatch(cut.label, query, markClass)} <span class="dc-hit-tc">TC ${escapeHtml(startTc)}</span></button>`;
    })
    .join(' ');
}

function buildInlineFieldMatch(value, query, markClass = 'search-hit') {
  const text = String(value || '').trim();
  if (!text || !query) return '';
  const highlighted = highlightMatch(text, query, markClass);
  if (highlighted === escapeHtml(text)) return '';
  return `<span class="field-inline-match">${highlighted}</span>`;
}

function extractHighlightSpecs(query) {
  const text = String(query || '').trim();
  if (!text) return [];

  const specs = [];
  const tokenRegex = /([+-]?)"([^"]+)"|(\S+)/g;
  let match = tokenRegex.exec(text);

  while (match) {
    const quotedPrefix = String(match[1] || '');
    const quoted = match[2];
    const exactPhrase = quoted !== undefined;
    let token = String(quoted || match[3] || '').trim();
    if (token) {
      let isExcluded = quotedPrefix === '-';
      while (token.startsWith('+') || token.startsWith('-')) {
        if (token.startsWith('-')) isExcluded = true;
        token = token.slice(1).trim();
      }

      if (!isExcluded && token) {
        token = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        token = token.replace(/^[^:\s]+:/, '');
        token = token.replace(/[*?]/g, '').trim();
        const upper = token.toUpperCase();
        if (token && upper !== 'AND' && upper !== 'OR' && upper !== 'NOT') {
          specs.push({ term: token.toLowerCase(), exactPhrase });
        }
      }
    }
    match = tokenRegex.exec(text);
  }

  const seen = new Set();
  return specs
    .filter((spec) => {
      const key = `${spec.exactPhrase ? '1' : '0'}:${spec.term}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.term.length - a.term.length);
}

function hasQuotedHighlightTerm(query) {
  return extractHighlightSpecs(query).some((spec) => spec.exactPhrase);
}

function hashString(input) {
  const str = String(input || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function tagColorStyle(tag) {
  const h = hashString(tag);
  const hue = h % 360;
  const sat = 55 + (h % 20);
  const light = 84 + (h % 8);
  const border = 42 + (h % 16);
  return `background:hsl(${hue} ${sat}% ${light}%);border-color:hsl(${hue} ${sat}% ${border}%);`;
}

function assetTagChipStyle(asset) {
  const firstTag = Array.isArray(asset?.tags) ? String(asset.tags[0] || '').trim() : '';
  if (firstTag) {
    return `${tagColorStyle(firstTag)}color:#141922;`;
  }
  return 'background:#3a3f4e;border-color:#5a6277;color:#e8eefc;';
}

function secondsToTimecode(timeSeconds, fps) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 25));
  const totalFrames = Math.max(0, Math.round((Number(timeSeconds) || 0) * safeFps));

  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const ff = String(frames).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
}

const PLAYER_FPS = 25;

function parseTimecodeInput(value, fps) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const parts = raw.split(':').map((p) => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return NaN;
  if (!parts.every((p) => /^\d+$/.test(p))) return NaN;

  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  const ss = Number(parts[2]);
  const ff = parts.length === 4 ? Number(parts[3]) : 0;
  if ([hh, mm, ss, ff].some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  if (mm > 59 || ss > 59 || ff >= fps) return NaN;

  return (hh * 3600) + (mm * 60) + ss + (ff / fps);
}

function openClipEditorDialog(initial) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('clip_editor_title'))}">
        <h4>${escapeHtml(t('clip_editor_title'))}</h4>
        <label>${escapeHtml(t('clip_editor_name'))}
          <input id="clipEditorName" type="text" value="${escapeHtml(initial.label || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_in'))}
          <input id="clipEditorIn" type="text" value="${escapeHtml(initial.inTc || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_out'))}
          <input id="clipEditorOut" type="text" value="${escapeHtml(initial.outTc || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="clipEditorCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="clipEditorSave">${escapeHtml(t('clip_editor_save'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector('#clipEditorName');
    const inInput = overlay.querySelector('#clipEditorIn');
    const outInput = overlay.querySelector('#clipEditorOut');
    overlay.querySelector('#clipEditorCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#clipEditorSave')?.addEventListener('click', () => {
      close({
        label: String(nameInput?.value || '').trim(),
        inTc: String(inInput?.value || '').trim(),
        outTc: String(outInput?.value || '').trim()
      });
    });
    nameInput?.focus();
  });
}

function openVersionEditDialog(initial) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('edit_version_name'))}">
        <h4>${escapeHtml(t('edit_version_name'))}</h4>
        <label>${escapeHtml(t('edit_version_name_prompt'))}
          <input id="versionEditorName" type="text" value="${escapeHtml(initial.label || '')}" />
        </label>
        <label>${escapeHtml(t('edit_version_note_prompt'))}
          <input id="versionEditorNote" type="text" value="${escapeHtml(initial.note || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="versionEditorCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="versionEditorSave">${escapeHtml(t('clip_editor_save'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector('#versionEditorName');
    const noteInput = overlay.querySelector('#versionEditorNote');
    overlay.querySelector('#versionEditorCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#versionEditorSave')?.addEventListener('click', () => {
      close({
        label: String(nameInput?.value || '').trim(),
        note: String(noteInput?.value || '').trim()
      });
    });
    nameInput?.focus();
    nameInput?.select?.();
  });
}

function openVersionDeleteDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('delete_version'))}">
        <h4>${escapeHtml(t('delete_version'))}</h4>
        <p>${escapeHtml(t('delete_version_confirm'))}</p>
        <div class="clip-modal-actions">
          <button type="button" id="versionDeleteCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="versionDeleteConfirm" class="danger">${escapeHtml(t('delete_version'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
    overlay.querySelector('#versionDeleteCancel')?.addEventListener('click', () => close(false));
    overlay.querySelector('#versionDeleteConfirm')?.addEventListener('click', () => close(true));
  });
}

function openTimecodeJumpDialog(initialTc = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('tc'))}">
        <h4>${escapeHtml(t('tc'))}</h4>
        <label>${escapeHtml(t('tc'))}
          <input id="timecodeJumpInput" type="text" value="${escapeHtml(initialTc || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="timecodeJumpCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="timecodeJumpGo">${escapeHtml(t('jump_to_cut'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#timecodeJumpInput');
    overlay.querySelector('#timecodeJumpCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#timecodeJumpGo')?.addEventListener('click', () => close(String(input?.value || '').trim()));
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        close(String(input?.value || '').trim());
      }
    });
    input?.focus();
    input?.select?.();
  });
}

function thumbnailMarkup(asset) {
  const thumbSrc = escapeHtml(asset.thumbnailUrl || '');
  if (isImage(asset)) {
    return `<img class="asset-thumb" src="${escapeHtml(asset.thumbnailUrl || asset.mediaUrl || '')}" alt="${escapeHtml(asset.title)}" />`;
  }
  if (isVideo(asset)) {
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" />`;
    }
    return '<div class="asset-thumb asset-thumb-file">VIDEO</div>';
  }
  if (isAudio(asset)) {
    return '<div class="asset-thumb asset-thumb-audio">AUDIO</div>';
  }
  if (isDocument(asset)) {
    const fallbackSrc = thumbFallbackForAsset(asset);
    const fallbackEsc = escapeHtml(fallbackSrc);
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" onerror="this.onerror=null;this.src='${fallbackEsc}'" />`;
    }
    return `<img class="asset-thumb" src="${fallbackEsc}" alt="${escapeHtml(asset.title)}" />`;
  }
  return '<div class="asset-thumb asset-thumb-file">FILE</div>';
}

function assetTypeIcon(asset) {
  if (isVideo(asset)) return '🎬';
  if (isAudio(asset)) return '🎵';
  if (isImage(asset)) return '🖼️';
  if (isDocument(asset)) return '📄';
  return '📦';
}

function buildAssetSearchNoticeHtml() {
  const notices = [];
  const pushNotice = (type, suggestion, query, fuzzyUsed = false) => {
    const safeSuggestion = String(suggestion || '').trim();
    const safeQuery = String(query || '').trim();
    const showSuggestion = safeSuggestion && foldSearchText(safeSuggestion) !== foldSearchText(safeQuery);
    if (!showSuggestion && !fuzzyUsed) return;
    if (showSuggestion) {
      notices.push(`
        <div class="subtitle-item-empty">
          ${escapeHtml(t('subtitle_did_you_mean'))}:
          <button type="button" class="subtitle-item-use-btn" data-search-did-you-mean="${escapeHtml(type)}">${escapeHtml(safeSuggestion)}</button>
        </div>
      `);
      return;
    }
    notices.push(`<div class="subtitle-item-empty"><span class="search-hit-fuzzy">${escapeHtml(safeQuery)}</span></div>`);
  };

  pushNotice('q', currentSearchDidYouMean, currentSearchQuery, currentSearchFuzzyUsed);
  pushNotice('ocr', currentOcrDidYouMean, currentOcrQuery, currentOcrFuzzyUsed);
  return notices.join('');
}

function renderAssets(assets) {
  applyAssetViewModeUI();
  const searchNoticeHtml = buildAssetSearchNoticeHtml();
  if (!assets.length) {
    assetGrid.innerHTML = `${searchNoticeHtml}<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
    assetGrid.querySelectorAll('[data-search-did-you-mean]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const type = String(event.currentTarget?.dataset?.searchDidYouMean || '').trim();
        const suggestion = String(event.currentTarget?.textContent || '').trim();
        if (!suggestion) return;
        if (type === 'ocr' && ocrQueryInput) ocrQueryInput.value = suggestion;
        else if (type === 'q' && searchQueryInput) searchQueryInput.value = suggestion;
        await loadAssets();
      });
    });
    return;
  }

  const searchHighlightClass = effectiveSearchHighlightClass(currentSearchQuery, currentSearchHighlightQuery, currentSearchFuzzyUsed);
  assetGrid.innerHTML = `${searchNoticeHtml}${assets
    .map((asset) => {
      const selected = selectedAssetIds.has(asset.id) ? 'selected' : '';
      const trashClass = asset.inTrash ? 'in-trash' : '';
      const styleClass = 'card-art-glass';
      const metadataHits = metadataHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const dcHits = dcHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const tagHits = tagHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const clipHits = clipHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const ocrHitQuery = String(asset?.ocrSearchHit?.query || currentOcrHighlightQuery || currentOcrQuery || '').trim();
      const ocrHitsRaw = Array.isArray(asset?.ocrSearchHits) && asset.ocrSearchHits.length
        ? asset.ocrSearchHits
        : (asset?.ocrSearchHit ? [asset.ocrSearchHit] : []);
      const ocrHitClass = effectiveSearchHighlightClass(currentOcrQuery, ocrHitQuery, currentOcrFuzzyUsed);
      const ocrHit = ocrHitsRaw.length
        ? `<div class="asset-hit-list asset-hit-list-ocr">${ocrHitsRaw
          .map((hit) => {
            const hitText = String(hit?.text || '').trim();
            if (!hitText) return '';
            const hitSec = Number(hit?.startSec || 0);
            const hitTc = secondsToTimecode(hitSec, PLAYER_FPS);
            return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${asset.id}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(t('ocr_hit'))} TC ${escapeHtml(hitTc)}:</strong> ${highlightMatch(hitText, ocrHitQuery, ocrHitClass)}</button>`;
          })
          .filter(Boolean)
          .join('')}</div>`
        : '';
      const subtitleHitQuery = String(asset?.subtitleSearchHit?.query || currentSubtitleQuery || '').trim();
      const subtitleHitClass = foldSearchText(subtitleHitQuery) !== foldSearchText(currentSubtitleQuery || '')
        ? 'search-hit-fuzzy'
        : 'search-hit';
      const subtitleHitsRaw = Array.isArray(asset?.subtitleSearchHits) && asset.subtitleSearchHits.length
        ? asset.subtitleSearchHits
        : (asset?.subtitleSearchHit ? [asset.subtitleSearchHit] : []);
      const subtitleHit = subtitleHitsRaw.length
        ? `<div class="asset-hit-list asset-hit-list-subtitle">${subtitleHitsRaw
          .map((hit) => {
            const hitText = String(hit?.text || '').trim();
            if (!hitText) return '';
            const hitSec = Number(hit?.startSec || 0);
            const hitTc = secondsToTimecode(hitSec, PLAYER_FPS);
            return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${asset.id}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(t('subtitles'))} TC ${escapeHtml(hitTc)}:</strong> ${highlightMatch(hitText, subtitleHitQuery, subtitleHitClass)}</button>`;
          })
          .filter(Boolean)
          .join('')}</div>`
        : '';
      return `
        <article class="asset-card ${selected} ${trashClass} ${styleClass}" data-id="${asset.id}">
          ${thumbnailMarkup(asset)}
          <div class="asset-card-body">
            <h3><span class="type-icon" aria-hidden="true">${assetTypeIcon(asset)}</span> ${highlightMatch(asset.title, currentSearchHighlightQuery, searchHighlightClass)}</h3>
            <div class="asset-meta">${highlightMatch(asset.type, currentSearchHighlightQuery, searchHighlightClass)} | ${highlightMatch(asset.owner, currentSearchHighlightQuery, searchHighlightClass)}</div>
            <div class="asset-meta">${escapeHtml(workflowLabel(asset.status))}${(isVideo(asset) || isAudio(asset)) ? ` | ${escapeHtml(formatDuration(asset.durationSeconds))}` : ''}</div>
            ${metadataHits ? `<div class="asset-meta dc-hit-row">${metadataHits}</div>` : ''}
            ${tagHits ? `<div class="asset-meta dc-hit-row">${tagHits}</div>` : ''}
            ${dcHits ? `<div class="asset-meta dc-hit-row">${dcHits}</div>` : ''}
            ${clipHits ? `<div class="asset-meta dc-hit-row">${clipHits}</div>` : ''}
            ${subtitleHit}
            ${ocrHit}
            <div class="asset-meta">${escapeHtml(formatDate(asset.updatedAt))}</div>
            <div class="chips">
              ${(asset.tags || []).slice(0, 4).map((tag) => `<button type="button" class="chip chip-tag-filter" data-chip-tag="${escapeHtml(tag)}" style="${tagColorStyle(tag)}">${highlightMatch(tag, currentSearchHighlightQuery, searchHighlightClass)}</button>`).join('')}
            </div>
            ${asset.inTrash ? `
              <div class="card-actions">
                <button type="button" data-card-action="restore" data-id="${asset.id}">${t('restore')}</button>
                ${currentUserCanDeleteAssets ? `<button type="button" class="danger" data-card-action="delete" data-id="${asset.id}">${t('delete_permanent')}</button>` : ''}
              </div>
            ` : ''}
          </div>
        </article>
      `;
    })
    .join('')}`;
  assetGrid.querySelectorAll('[data-search-did-you-mean]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const type = String(event.currentTarget?.dataset?.searchDidYouMean || '').trim();
      const suggestion = String(event.currentTarget?.textContent || '').trim();
      if (!suggestion) return;
      if (type === 'ocr' && ocrQueryInput) ocrQueryInput.value = suggestion;
      else if (type === 'q' && searchQueryInput) searchQueryInput.value = suggestion;
      await loadAssets();
    });
  });
}

function setSingleSelection(assetId) {
  selectedAssetIds.clear();
  if (assetId) {
    selectedAssetIds.add(assetId);
    selectedAssetId = assetId;
    lastSelectedAssetId = assetId;
  } else {
    selectedAssetId = null;
    lastSelectedAssetId = null;
  }
}

function addShiftRangeSelection(assetId) {
  const ids = currentAssets.map((asset) => asset.id);
  const end = ids.indexOf(assetId);
  if (end < 0) return;

  const start = ids.indexOf(lastSelectedAssetId || '');
  if (start < 0) {
    selectedAssetIds.add(assetId);
    selectedAssetId = assetId;
    lastSelectedAssetId = assetId;
    return;
  }

  const from = Math.min(start, end);
  const to = Math.max(start, end);
  for (let i = from; i <= to; i += 1) {
    selectedAssetIds.add(ids[i]);
  }
  selectedAssetId = assetId;
  lastSelectedAssetId = assetId;
}

function toggleMultiSelection(assetId) {
  const id = String(assetId || '').trim();
  if (!id) return;
  if (selectedAssetIds.has(id)) {
    selectedAssetIds.delete(id);
  } else {
    selectedAssetIds.add(id);
  }

  if (selectedAssetIds.size === 0) {
    selectedAssetId = null;
    lastSelectedAssetId = null;
    return;
  }

  if (selectedAssetIds.has(id)) {
    selectedAssetId = id;
    lastSelectedAssetId = id;
    return;
  }

  const fallbackId = [...selectedAssetIds][selectedAssetIds.size - 1] || null;
  selectedAssetId = fallbackId;
  lastSelectedAssetId = fallbackId;
}

function resetSelectedAssetDetailPanel() {
  if (activeDetailPinCleanup) {
    activeDetailPinCleanup();
    activeDetailPinCleanup = null;
  }
  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanup = null;
  }
  assetDetail.innerHTML = `<div class="empty">${escapeHtml(t('select_asset'))}</div>`;
  assetDetail.classList.remove('video-detail-mode');
  assetDetail.classList.remove('detail-video-pinned');
  panelDetail?.classList.remove('panel-video-detail');
  setPanelVideoToolsButtonState(false);
}

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

function loadVideoJs() {
  if (window.videojs) return Promise.resolve(true);
  if (videoJsLoadPromise) return videoJsLoadPromise;
  videoJsLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://vjs.zencdn.net/8.20.0/video.min.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.videojs));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return videoJsLoadPromise;
}

function loadDashJs() {
  if (window.dashjs) return Promise.resolve(true);
  if (dashJsLoadPromise) return dashJsLoadPromise;
  dashJsLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.dashjs?.MediaPlayer));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return dashJsLoadPromise;
}

function initMpegDashPlayer(mediaEl, _asset, _root = document) {
  if (!mediaEl || !useMpegDashPlayerUI()) return () => {};
  const manifestFromData = String(mediaEl.dataset?.dashManifest || '').trim();
  const srcAttr = String(mediaEl.getAttribute('src') || '').trim();
  const manifestUrl = manifestFromData || (/\.(mpd)(?:[?#].*)?$/i.test(srcAttr) ? srcAttr : '');
  // Keep native playback for non-MPD proxies.
  if (!manifestUrl) return () => {};

  let disposed = false;
  let player = null;

  (async () => {
    const ready = await loadDashJs();
    if (!ready || disposed || !window.dashjs?.MediaPlayer) return;
    try {
      player = window.dashjs.MediaPlayer().create();
      player.initialize(mediaEl, manifestUrl, false);
    } catch (_error) {
      player = null;
    }
  })();

  return () => {
    disposed = true;
    if (player && typeof player.reset === 'function') {
      try {
        player.reset();
      } catch (_error) {
        // ignore reset failures
      }
    }
  };
}

function initVideoJsPlayer(mediaEl, _root = document) {
  if (!mediaEl || !useVideoJsPlayerUI()) return () => {};
  let disposed = false;
  let player = null;

  (async () => {
    const ready = await loadVideoJs();
    if (!ready || disposed || !window.videojs) return;
    try {
      player = window.videojs(mediaEl, {
        controls: true,
        preload: 'metadata',
        fluid: true,
        controlBar: {
          pictureInPictureToggle: true
        }
      });
    } catch (_error) {
      player = null;
    }
  })();

  return () => {
    disposed = true;
    if (player && typeof player.dispose === 'function') {
      try {
        if (typeof player.isDisposed !== 'function' || !player.isDisposed()) player.dispose();
      } catch (_error) {
        // ignore dispose failures
      }
    }
  };
}

function initPlaybackRateLongPress(mediaEl, triggerBtn, backwardBtn, forwardBtn) {
  if (!(mediaEl instanceof HTMLMediaElement) || !(triggerBtn instanceof HTMLElement) || !(backwardBtn instanceof HTMLElement) || !(forwardBtn instanceof HTMLElement)) return () => {};

  const rates = [0.25, 0.5, 1, 2, 4, 8];
  let menuOpen = false;
  let menuEl = null;
  let preferredRate = Number(mediaEl.dataset.preferredPlaybackRate || mediaEl.playbackRate) || 1;
  let preferredDirection = String(mediaEl.dataset.preferredPlaybackDirection || 'forward') === 'reverse' ? 'reverse' : 'forward';
  let reverseTimer = null;
  let suppressPauseHandling = false;

  // More natural speech at non-1x and fewer browser artifacts around pause/resume.
  try { mediaEl.preservesPitch = false; } catch (_error) {}
  try { mediaEl.mozPreservesPitch = false; } catch (_error) {}
  try { mediaEl.webkitPreservesPitch = false; } catch (_error) {}

  const closeMenu = () => {
    if (menuEl?.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    menuOpen = false;
  };

  const isPlaying = () => Boolean(reverseTimer) || (!mediaEl.paused && !mediaEl.ended);

  const stopReversePlayback = ({ restoreAudio = true } = {}) => {
    if (reverseTimer) {
      clearInterval(reverseTimer);
      reverseTimer = null;
    }
  };

  const updateButtonHint = () => {
    const displayRate = Number(preferredRate) || 1;
    triggerBtn.textContent = `${displayRate}x`;
    triggerBtn.title = `Playback rate ${displayRate}x`;
    triggerBtn.setAttribute('aria-label', `Playback rate ${displayRate}x`);
    triggerBtn.dataset.playbackRate = String(displayRate);
    const showForwardActive = Math.abs(displayRate - 1) < 0.001 || preferredDirection === 'forward';
    backwardBtn.classList.toggle('is-active', !showForwardActive && preferredDirection === 'reverse');
    forwardBtn.classList.toggle('is-active', showForwardActive);
  };

  const positionMenu = (anchorBtn) => {
    if (!menuEl) return;
    const rect = anchorBtn.getBoundingClientRect();
    const estimatedHeight = 52;
    const openBelow = rect.top < (estimatedHeight + 24);
    const menuWidth = menuEl.offsetWidth || 340;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
    const preferredCenter = rect.left + (rect.width / 2);
    const halfWidth = menuWidth / 2;
    const clampedCenter = Math.min(
      viewportWidth - halfWidth - 8,
      Math.max(halfWidth + 8, preferredCenter)
    );
    menuEl.style.left = `${clampedCenter}px`;
    menuEl.style.top = openBelow
      ? `${Math.max(8, rect.bottom + 10)}px`
      : `${Math.max(8, rect.top - 10)}px`;
    menuEl.style.transform = openBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
  };

  const openMenu = (direction, anchorBtn) => {
    closeMenu();
    menuOpen = true;
    menuEl = document.createElement('div');
    menuEl.className = 'playback-rate-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.dataset.direction = direction;
    menuEl.innerHTML = rates
      .map((rate) => {
        const isActive = preferredDirection === direction && Math.abs((preferredRate || 1) - rate) < 0.001;
        return `<button type="button" class="playback-rate-option${isActive ? ' active' : ''}" data-rate="${rate}" role="menuitemradio" aria-checked="${isActive ? 'true' : 'false'}">${rate}x</button>`;
      })
      .join('');
    document.body.appendChild(menuEl);
    positionMenu(anchorBtn);
  };

  const onLabelClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const applyPreferredRate = () => {
    const nextRate = Number(preferredRate) || 1;
    mediaEl.defaultPlaybackRate = nextRate;
    mediaEl.playbackRate = nextRate;
    updateButtonHint();
  };

  const startReversePlayback = () => {
    stopReversePlayback({ restoreAudio: false });
    try {
      suppressPauseHandling = true;
      mediaEl.pause();
    } catch (_error) {
      // ignore pause failures
    } finally {
      suppressPauseHandling = false;
    }
    const fps = Math.max(1, PLAYER_FPS || 25);
    const stepSeconds = Math.max(0.001, preferredRate / fps);
    reverseTimer = window.setInterval(() => {
      const current = Number(mediaEl.currentTime) || 0;
      const next = Math.max(0, current - stepSeconds);
      mediaEl.currentTime = next;
      if (next <= 0) {
        stopReversePlayback();
        updateButtonHint();
      }
    }, Math.max(16, Math.round(1000 / fps)));
    updateButtonHint();
  };

  const applyDirectionState = () => {
    if (preferredDirection === 'reverse') {
      if (isPlaying()) startReversePlayback();
      else updateButtonHint();
      return;
    }
    stopReversePlayback();
    applyPreferredRate();
  };

  const onPause = () => {
    if (suppressPauseHandling) return;
    updateButtonHint();
    if (preferredDirection === 'reverse') {
      stopReversePlayback();
      return;
    }
    if (Math.abs(preferredRate - 1) > 0.001) {
      try {
        mediaEl.defaultPlaybackRate = 1;
        mediaEl.playbackRate = 1;
      } catch (_error) {
        // ignore browser-specific setter failures
      }
    }
  };

  const onMenuClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const option = target.closest('.playback-rate-option');
    if (!(option instanceof HTMLElement)) return;
    const selectedRate = Number(option.dataset.rate || 1);
    const direction = String(menuEl?.dataset.direction || 'forward') === 'reverse' ? 'reverse' : 'forward';
    const nextRate = Number(selectedRate) || 1;
    if (!Number.isFinite(nextRate) || nextRate <= 0) return;
    preferredRate = nextRate;
    preferredDirection = Math.abs(nextRate - 1) < 0.001 ? 'forward' : direction;
    mediaEl.dataset.preferredPlaybackRate = String(nextRate);
    mediaEl.dataset.preferredPlaybackDirection = preferredDirection;
    if (isPlaying()) applyDirectionState();
    else updateButtonHint();
    closeMenu();
  };

  const onDocumentPointerDown = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (menuEl && menuEl.contains(target)) return;
    if (triggerBtn.contains(target)) return;
    closeMenu();
  };

  const onEscape = (event) => {
    if (event.key === 'Escape') closeMenu();
  };

  const onWindowResize = () => {
    if (menuOpen) {
      const anchor = menuEl?.dataset.direction === 'reverse' ? backwardBtn : forwardBtn;
      positionMenu(anchor);
    }
  };

  const onBackwardClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menuOpen && menuEl?.dataset.direction === 'reverse') {
      closeMenu();
      return;
    }
    openMenu('reverse', backwardBtn);
  };

  const onForwardClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menuOpen && menuEl?.dataset.direction === 'forward') {
      closeMenu();
      return;
    }
    openMenu('forward', forwardBtn);
  };

  triggerBtn.addEventListener('click', onLabelClick);
  backwardBtn.addEventListener('click', onBackwardClick);
  forwardBtn.addEventListener('click', onForwardClick);
  document.addEventListener('click', onMenuClick);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onEscape);
  window.addEventListener('resize', onWindowResize);
  mediaEl.addEventListener('ratechange', updateButtonHint);
  mediaEl.addEventListener('play', applyDirectionState);
  mediaEl.addEventListener('pause', onPause);
  mediaEl.addEventListener('ended', updateButtonHint);
  updateButtonHint();

  mediaEl.__mamPreferredPlaybackDirection = () => preferredDirection;
  mediaEl.__mamStartReversePlayback = () => startReversePlayback();
  mediaEl.__mamStopReversePlayback = () => stopReversePlayback();

  return () => {
    stopReversePlayback();
    closeMenu();
    triggerBtn.removeEventListener('click', onLabelClick);
    backwardBtn.removeEventListener('click', onBackwardClick);
    forwardBtn.removeEventListener('click', onForwardClick);
    document.removeEventListener('click', onMenuClick);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onEscape);
    window.removeEventListener('resize', onWindowResize);
    mediaEl.removeEventListener('ratechange', updateButtonHint);
    mediaEl.removeEventListener('play', applyDirectionState);
    mediaEl.removeEventListener('pause', onPause);
    mediaEl.removeEventListener('ended', updateButtonHint);
    delete mediaEl.__mamPreferredPlaybackDirection;
    delete mediaEl.__mamStartReversePlayback;
    delete mediaEl.__mamStopReversePlayback;
  };
}

function initDetailVideoPin(root = document) {
  const pinBtn = root.querySelector('#detailVideoPinBtn');
  if (!pinBtn) return () => {};
  const mediaEl = root.querySelector('#assetMediaEl');
  const customLikeMode = useCustomLikeTimelineUI();
  const videoMainCol = root.querySelector('.detail-video-fixed .video-main-col');
  const overlayControls = Array.from(root.querySelectorAll('.detail-video-fixed .custom-player-bar, .detail-video-fixed .player-controls-box'));

  const showPinnedOverlayControls = (show) => {
    root.classList.toggle('detail-video-show-overlay-controls', Boolean(show && detailVideoPinned));
  };

  const applyPinUi = () => {
    root.classList.toggle('detail-video-pinned', detailVideoPinned);
    if (!detailVideoPinned) showPinnedOverlayControls(false);
    pinBtn.classList.toggle('active', detailVideoPinned);
    const label = detailVideoPinned ? t('unpin_video') : t('pin_video');
    pinBtn.title = label;
    pinBtn.setAttribute('aria-label', label);
    pinBtn.setAttribute('aria-pressed', detailVideoPinned ? 'true' : 'false');
    if (mediaEl && customLikeMode) {
      // Prevent native control layer from hijacking double-click fullscreen.
      mediaEl.removeAttribute('controls');
    }
  };

  const onPinToggle = () => {
    detailVideoPinned = !detailVideoPinned;
    localStorage.setItem(LOCAL_DETAIL_VIDEO_PIN, detailVideoPinned ? '1' : '0');
    applyPinUi();
  };

  const onPinnedMouseMove = (event) => {
    if (!detailVideoPinned || !videoMainCol) return;
    const rect = videoMainCol.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      showPinnedOverlayControls(false);
      return;
    }
    const relativeY = event.clientY - rect.top;
    showPinnedOverlayControls(relativeY >= (rect.height / 2));
  };

  const onPinnedMouseLeave = () => {
    showPinnedOverlayControls(false);
  };

  const onOverlayControlsEnter = () => {
    if (detailVideoPinned) showPinnedOverlayControls(true);
  };

  const onOverlayControlsLeave = () => {
    showPinnedOverlayControls(false);
  };

  pinBtn.addEventListener('click', onPinToggle);
  videoMainCol?.addEventListener('mousemove', onPinnedMouseMove);
  videoMainCol?.addEventListener('mouseleave', onPinnedMouseLeave);
  overlayControls.forEach((node) => {
    node.addEventListener('mouseenter', onOverlayControlsEnter);
    node.addEventListener('mouseleave', onOverlayControlsLeave);
  });
  applyPinUi();
  return () => {
    pinBtn.removeEventListener('click', onPinToggle);
    videoMainCol?.removeEventListener('mousemove', onPinnedMouseMove);
    videoMainCol?.removeEventListener('mouseleave', onPinnedMouseLeave);
    overlayControls.forEach((node) => {
      node.removeEventListener('mouseenter', onOverlayControlsEnter);
      node.removeEventListener('mouseleave', onOverlayControlsLeave);
    });
  };
}

function initCustomVideoControls(mediaEl, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const bar = byId('customPlayerBar');
  const playBtn = byId('customPlayPauseBtn');
  const currentEl = byId('customCurrentTime');
  const durationEl = byId('customDurationTime');
  const seek = byId('customSeekRange');
  const muteBtn = byId('customMuteBtn');
  const volumeWrap = byId('customVolumeWrap');
  const vol = byId('customVolumeRange');
  if (!bar || !playBtn || !currentEl || !durationEl || !seek || !muteBtn || !vol) return () => {};
  let isSeeking = false;
  const fps = PLAYER_FPS;
  let totalFrames = 1;
  let maxFrame = 0;
  const getDuration = () => (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : 0);
  const rebuildSeekScale = () => {
    const duration = getDuration();
    totalFrames = Math.max(1, Math.floor(duration * fps));
    maxFrame = Math.max(0, totalFrames - 1);
    seek.min = '0';
    seek.step = '1';
    seek.max = String(maxFrame);
  };
  const secondsToFrame = (sec) => {
    const duration = getDuration();
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(maxFrame, Math.round(Number(sec || 0) * fps)));
  };
  const frameToSeconds = (frame) => {
    const duration = getDuration();
    if (duration <= 0) return 0;
    const safe = Math.max(0, Math.min(maxFrame, Number(frame || 0)));
    return Math.max(0, Math.min(duration, safe / fps));
  };
  const toClock = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const syncButtons = () => {
    const paused = mediaEl.paused || mediaEl.ended;
    playBtn.textContent = paused ? '▶' : '⏸';
    muteBtn.textContent = mediaEl.muted || mediaEl.volume <= 0 ? '🔇' : '🔊';
  };

  const syncTimeline = () => {
    const duration = getDuration();
    currentEl.textContent = toClock(mediaEl.currentTime);
    durationEl.textContent = toClock(duration);
    if (!isSeeking && duration > 0) {
      seek.value = String(secondsToFrame(mediaEl.currentTime));
    }
    if (!isSeeking && duration <= 0) {
      seek.value = '0';
    }
  };

  const onPlayPause = async () => {
    const preferredDirection = typeof mediaEl.__mamPreferredPlaybackDirection === 'function'
      ? mediaEl.__mamPreferredPlaybackDirection()
      : 'forward';
    if (preferredDirection === 'reverse') {
      if (typeof mediaEl.__mamStartReversePlayback === 'function') mediaEl.__mamStartReversePlayback();
      syncButtons();
      return;
    }
    if (mediaEl.paused || mediaEl.ended) {
      await mediaEl.play().catch(() => {});
    } else {
      if (typeof mediaEl.__mamStopReversePlayback === 'function') mediaEl.__mamStopReversePlayback();
      mediaEl.pause();
    }
    syncButtons();
  };
  const onSeekStart = () => { isSeeking = true; };
  const onSeekEnd = () => {
    isSeeking = false;
    const duration = getDuration();
    if (duration <= 0) return;
    mediaEl.currentTime = frameToSeconds(Number(seek.value || 0));
    syncTimeline();
  };
  const onSeekInput = () => {
    if (!isSeeking) return;
    const duration = getDuration();
    const preview = duration > 0 ? frameToSeconds(Number(seek.value || 0)) : 0;
    currentEl.textContent = toClock(preview);
  };
  const onMute = (event) => {
    if (event) event.preventDefault();
    if (!volumeWrap) return;
    volumeWrap.classList.toggle('open');
  };
  const onVolume = () => {
    mediaEl.volume = Math.max(0, Math.min(1, Number(vol.value || 1)));
    if (mediaEl.volume > 0 && mediaEl.muted) mediaEl.muted = false;
    syncButtons();
  };
  const onVolumeSync = () => {
    vol.value = String(Number.isFinite(mediaEl.volume) ? mediaEl.volume : 1);
    syncButtons();
  };

  const onDocumentPointer = (event) => {
    if (!volumeWrap || !volumeWrap.classList.contains('open')) return;
    const target = event.target;
    if (target instanceof Node && volumeWrap.contains(target)) return;
    volumeWrap.classList.remove('open');
  };

  playBtn.addEventListener('click', onPlayPause);
  seek.addEventListener('mousedown', onSeekStart);
  seek.addEventListener('touchstart', onSeekStart, { passive: true });
  seek.addEventListener('input', onSeekInput);
  seek.addEventListener('change', onSeekEnd);
  muteBtn.addEventListener('click', onMute);
  vol.addEventListener('input', onVolume);
  document.addEventListener('pointerdown', onDocumentPointer);

  mediaEl.addEventListener('timeupdate', syncTimeline);
  mediaEl.addEventListener('loadedmetadata', rebuildSeekScale);
  mediaEl.addEventListener('loadedmetadata', syncTimeline);
  mediaEl.addEventListener('durationchange', rebuildSeekScale);
  mediaEl.addEventListener('durationchange', syncTimeline);
  mediaEl.addEventListener('play', syncButtons);
  mediaEl.addEventListener('pause', syncButtons);
  mediaEl.addEventListener('ended', syncButtons);
  mediaEl.addEventListener('volumechange', onVolumeSync);

  rebuildSeekScale();
  onVolumeSync();
  syncTimeline();
  syncButtons();

  return () => {
    playBtn.removeEventListener('click', onPlayPause);
    seek.removeEventListener('mousedown', onSeekStart);
    seek.removeEventListener('touchstart', onSeekStart);
    seek.removeEventListener('input', onSeekInput);
    seek.removeEventListener('change', onSeekEnd);
    muteBtn.removeEventListener('click', onMute);
    vol.removeEventListener('input', onVolume);
    document.removeEventListener('pointerdown', onDocumentPointer);
    mediaEl.removeEventListener('timeupdate', syncTimeline);
    mediaEl.removeEventListener('loadedmetadata', rebuildSeekScale);
    mediaEl.removeEventListener('loadedmetadata', syncTimeline);
    mediaEl.removeEventListener('durationchange', rebuildSeekScale);
    mediaEl.removeEventListener('durationchange', syncTimeline);
    mediaEl.removeEventListener('play', syncButtons);
    mediaEl.removeEventListener('pause', syncButtons);
    mediaEl.removeEventListener('ended', syncButtons);
    mediaEl.removeEventListener('volumechange', onVolumeSync);
  };
}

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
          ${currentUserCanDeleteAssets ? `<button type="button" class="subtitle-item-remove-btn">${t('subtitle_remove')}</button>` : ''}
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

const playerBootstrapModule = window.createMainPlayerBootstrapModule({
  api,
  t,
  escapeHtml,
  mediaViewer,
  isVideo,
  isAudio,
  useMpegDashPlayerUI,
  useVideoJsPlayerUI,
  useCustomLikeTimelineUI,
  initMpegDashPlayer,
  initVideoJsPlayer,
  initFrameControls,
  initCustomVideoControls,
  initVideoSubtitleTools,
  initVideoOcrTools,
  initCollapsibleSections,
  initVideoToolsSorting,
  initAudioTools
});

function openVideoToolsDialog(asset, options = {}) {
  return playerBootstrapModule.openVideoToolsDialog(asset, options);
}

function initAssetPlayer(asset, root = document, options = {}) {
  return playerBootstrapModule.initAssetPlayer(asset, root, options);
}

const assetsModule = window.createMainAssetsModule({
  api,
  escapeHtml,
  t,
  statusSelect,
  workflowLabel,
  serializeForm,
  searchForm,
  assetTypeFilters,
  syncOcrQueryInputs,
  ocrQueryInput,
  renderAssets,
  currentAssetsRef: {
    get value() { return currentAssets; },
    set value(next) { currentAssets = next; }
  },
  selectedAssetIdsRef: {
    get value() { return selectedAssetIds; }
  },
  selectedAssetIdRef: {
    get value() { return selectedAssetId; },
    set value(next) { selectedAssetId = next; }
  },
  lastSelectedAssetIdRef: {
    get value() { return lastSelectedAssetId; },
    set value(next) { lastSelectedAssetId = next; }
  },
  searchStateRef: {
    get currentSearchQuery() { return currentSearchQuery; },
    set currentSearchQuery(next) { currentSearchQuery = next; },
    get currentOcrQuery() { return currentOcrQuery; },
    set currentOcrQuery(next) { currentOcrQuery = next; },
    get currentSubtitleQuery() { return currentSubtitleQuery; },
    set currentSubtitleQuery(next) { currentSubtitleQuery = next; },
    get currentSearchHighlightQuery() { return currentSearchHighlightQuery; },
    set currentSearchHighlightQuery(next) { currentSearchHighlightQuery = next; },
    get currentSearchDidYouMean() { return currentSearchDidYouMean; },
    set currentSearchDidYouMean(next) { currentSearchDidYouMean = next; },
    get currentSearchFuzzyUsed() { return currentSearchFuzzyUsed; },
    set currentSearchFuzzyUsed(next) { currentSearchFuzzyUsed = next; },
    get currentOcrHighlightQuery() { return currentOcrHighlightQuery; },
    set currentOcrHighlightQuery(next) { currentOcrHighlightQuery = next; },
    get currentOcrDidYouMean() { return currentOcrDidYouMean; },
    set currentOcrDidYouMean(next) { currentOcrDidYouMean = next; },
    get currentOcrFuzzyUsed() { return currentOcrFuzzyUsed; },
    set currentOcrFuzzyUsed(next) { currentOcrFuzzyUsed = next; }
  }
});

async function loadWorkflow() {
  return assetsModule.loadWorkflow();
}

async function loadAssets() {
  return assetsModule.loadAssets();
}

function clearDetailHeaderTimecode() {
  return detailModule.clearDetailHeaderTimecode();
}

function syncDetailHeaderTimecode(root = document) {
  return detailModule.syncDetailHeaderTimecode(root);
}

function scrollElementIntoContainerView(container, element, align = 0.38, offsetTop = 0) {
  return detailModule.scrollElementIntoContainerView(container, element, align, offsetTop);
}

function scrollDetailPanelToVideoTop(root = assetDetail) {
  return detailModule.scrollDetailPanelToVideoTop(root);
}

function seekOpenDetailMedia(assetId, startAtSeconds) {
  return detailModule.seekOpenDetailMedia(assetId, startAtSeconds);
}

function focusCutRowInDetail(root = document, cutId = '') {
  return detailModule.focusCutRowInDetail(root, cutId);
}

async function openAsset(id, workflow, options = {}) {
  if (isVideoToolsPageMode) {
    panelVisibility.panelIngest = false;
    panelVisibility.panelAssets = false;
    panelVisibility.panelDetail = true;
  }
  setPanelVisible('panelDetail', true);

  const asset = await api(`/api/assets/${id}`);

  selectedAssetId = id;
  selectedAssetIds.add(id);
  lastSelectedAssetId = id;
  renderAssets(currentAssets);

  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanup = null;
  }
  if (activeDetailPinCleanup) {
    activeDetailPinCleanup();
    activeDetailPinCleanup = null;
  }
  clearDetailHeaderTimecode();
  resetDetailPanelDynamicMinWidth();

  if (isVideoToolsPageMode && isVideo(asset)) {
    panelDetail?.classList.add('panel-video-detail');
    assetDetail.innerHTML = videoToolsPageMarkup(asset);
    assetDetail.classList.remove('empty');
    assetDetail.classList.add('video-tools-page-detail');
    activePlayerCleanup = initAssetPlayer(asset, assetDetail, {
      startAtSeconds: Number(options.startAtSeconds) || 0,
      focusCutId: String(options.focusCutId || '').trim()
    });
    if (options.scrollToVideoTop) scrollDetailPanelToVideoTop(assetDetail);
    const leaveBtn = document.getElementById('leaveVideoToolsPageBtn');
    leaveBtn?.addEventListener('click', () => {
      const mediaEl = assetDetail.querySelector('#assetMediaEl');
      const current = mediaEl ? Number(mediaEl.currentTime || 0) : 0;
      leaveVideoToolsPage(asset.id, current);
    });
    loadAssetTechnicalInfo(asset).catch(() => {});
    return;
  }

  assetDetail.innerHTML = detailMarkup(asset, workflow);
  const hasPlayableVideoProxy = isVideo(asset) && Boolean(String(asset.proxyUrl || '').trim());
  assetDetail.classList.toggle('video-detail-mode', hasPlayableVideoProxy);
  panelDetail?.classList.toggle('panel-video-detail', hasPlayableVideoProxy);
  assetDetail.classList.remove('video-tools-page-detail');
  if (hasPlayableVideoProxy) syncDetailHeaderTimecode(assetDetail);
  if (hasPlayableVideoProxy) {
    activeDetailPinCleanup = initDetailVideoPin(assetDetail);
  } else {
    assetDetail.classList.remove('detail-video-pinned');
    resetDetailPanelDynamicMinWidth();
  }
  setPanelVideoToolsButtonState(hasPlayableVideoProxy && !isVideoToolsPageMode, () => {
    const panelMedia = assetDetail.querySelector('#assetMediaEl');
    if (panelMedia && typeof panelMedia.pause === 'function') {
      try { panelMedia.pause(); } catch (_error) {}
    }
    const startAtSeconds = panelMedia ? Number(panelMedia.currentTime || 0) : 0;
    openVideoToolsPage(asset.id, startAtSeconds);
  });
  activePlayerCleanup = initAssetPlayer(asset, assetDetail, {
    startAtSeconds: Number(options.startAtSeconds) || 0,
    focusCutId: String(options.focusCutId || '').trim()
  });
  if (options.scrollToVideoTop) scrollDetailPanelToVideoTop(assetDetail);
  const focusFieldName = String(options.focusFieldName || '').trim();
  const focusTag = String(options.focusTag || '').trim();
  const focusCutId = String(options.focusCutId || '').trim();
  if (focusFieldName) {
    requestAnimationFrame(() => {
      const fieldEl = assetDetail.querySelector(`[name="${CSS.escape(focusFieldName)}"]`);
      if (!fieldEl) return;
      fieldEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      try { fieldEl.focus({ preventScroll: true }); } catch (_error) {}
    });
  }
  if (focusTag) {
    requestAnimationFrame(() => {
      const tagButton = Array.from(assetDetail.querySelectorAll('.chip-tag-filter'))
        .find((el) => String(el.textContent || '').trim().toLowerCase() === focusTag.toLowerCase());
      if (!tagButton) return;
      tagButton.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      tagButton.classList.add('search-hit-active');
      setTimeout(() => tagButton.classList.remove('search-hit-active'), 1800);
    });
  }
  if (focusCutId) {
    focusCutRowInDetail(assetDetail, focusCutId);
  }
  loadAssetTechnicalInfo(asset).catch(() => {});
  const ensureProxyBtn = document.getElementById('ensureProxyBtn');
  ensureProxyBtn?.addEventListener('click', async () => {
    try {
      await api(`/api/assets/${id}/ensure-proxy`, { method: 'POST', body: '{}' });
      await loadAssets();
      await openAsset(id, workflow);
    } catch (error) {
      alert(String(error.message || t('proxy_failed')));
    }
  });
  document.getElementById('editForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUserCanEditMetadata) {
      alert(t('metadata_edit_locked'));
      return;
    }
    const formEl = event.target;
    const saveBtn = formEl.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const payload = serializeForm(formEl);
      payload.dcMetadata = extractDcMetadataFromPayload(payload);
      await api(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await loadAssets();
      await openAsset(id, workflow);
    } catch (error) {
      alert(String(error?.message || t('metadata_save_failed')));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  document.getElementById('transitionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = serializeForm(event.target);
    await api(`/api/assets/${id}/transition`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAssets();
    await openAsset(id, workflow);
  });

  const versionFormEl = document.getElementById('versionForm');
  versionFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = serializeForm(event.target);
    await api(`/api/assets/${id}/versions`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAssets();
    await openAsset(id, workflow);
  });

  const restorePdfOriginalBtn = document.getElementById('restorePdfOriginalBtn');
  restorePdfOriginalBtn?.addEventListener('click', async () => {
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const ok = confirm(t('restore_pdf_original_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/pdf-restore-original`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(id, workflow);
  });

  const downloadPdfOriginalBtn = document.getElementById('downloadPdfOriginalBtn');
  downloadPdfOriginalBtn?.addEventListener('click', () => {
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const link = document.createElement('a');
    link.href = `/api/assets/${encodeURIComponent(id)}/pdf-original/download`;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  const restoreOfficeOriginalBtn = document.getElementById('restoreOfficeOriginalBtn');
  restoreOfficeOriginalBtn?.addEventListener('click', async () => {
    if (!currentUserCanEditOffice) return;
    const ok = confirm(t('restore_office_original_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/office-restore-original`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(id, workflow);
  });

  const downloadOfficeOriginalBtn = document.getElementById('downloadOfficeOriginalBtn');
  downloadOfficeOriginalBtn?.addEventListener('click', () => {
    if (!currentUserCanEditOffice) return;
    const link = document.createElement('a');
    link.href = `/api/assets/${encodeURIComponent(id)}/office-original/download`;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  const assetVersionsListEl = document.getElementById('assetVersionsList');
  const handleRestoreVersion = async (restoreBtn) => {
      if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
      const versionId = String(restoreBtn.dataset.versionId || '').trim();
      if (!versionId) return;
      const ok = confirm(t('restore_pdf_confirm'));
      if (!ok) return;
      await api(`/api/assets/${id}/pdf-restore`, {
        method: 'POST',
        body: JSON.stringify({ versionId })
      });
      await refreshAssetDetail(id, workflow);
  };

  const handleDeleteVersion = async (deleteBtnEl) => {
      if (deleteBtnEl.disabled) return;
      const versionId = String(deleteBtnEl.dataset.versionId || '').trim();
      if (!versionId) return;
      const ok = await openVersionDeleteDialog();
      if (!ok) return;
      const rowEl = deleteBtnEl.closest('.version');
      const prevLabel = String(deleteBtnEl.textContent || '').trim() || t('delete_version');
      deleteBtnEl.disabled = true;
      deleteBtnEl.textContent = currentLang === 'tr' ? 'Siliniyor...' : 'Deleting...';
      rowEl?.classList.add('is-busy');
      try {
        await api(`/api/assets/${id}/versions/${encodeURIComponent(versionId)}`, { method: 'DELETE' });
        rowEl?.remove();
        if (Array.isArray(asset.versions)) {
          asset.versions = asset.versions.filter((v) => String(v.versionId || '') !== versionId);
        }
        loadAssets().catch(() => {});
      } catch (error) {
        deleteBtnEl.disabled = false;
        deleteBtnEl.textContent = prevLabel;
        rowEl?.classList.remove('is-busy');
        alert(String(error?.message || 'Failed to delete version'));
      }
  };

  const handleEditVersion = async (editBtnEl) => {
      if (editBtnEl.disabled) return;
      const versionId = String(editBtnEl.dataset.versionId || '').trim();
      if (!versionId) return;
      const current = (asset.versions || []).find((v) => String(v.versionId || '') === versionId);
      const currentLabel = String(current?.label || '').trim();
      const currentNote = cleanVersionNoteText(String(current?.note || ''));
      const next = await openVersionEditDialog({ label: currentLabel, note: currentNote });
      if (!next?.label) return;
      editBtnEl.disabled = true;
      try {
        const updated = await api(`/api/assets/${id}/versions/${encodeURIComponent(versionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: next.label, note: next.note || '' })
        });
        const updatedVersion = updated?.version || null;
        const rowEl = editBtnEl.closest('.version');
        if (updatedVersion && rowEl) {
          const titleEl = rowEl.querySelector('strong');
          if (titleEl) titleEl.textContent = String(updatedVersion.label || '');
          const noteText = cleanVersionNoteText(String(updatedVersion.note || ''));
          if (titleEl && titleEl.nextSibling) {
            titleEl.nextSibling.nodeValue = ` - ${noteText}`;
          }
          if (Array.isArray(asset.versions)) {
            const idx = asset.versions.findIndex((v) => String(v.versionId || '') === versionId);
            if (idx >= 0) asset.versions[idx] = { ...asset.versions[idx], ...updatedVersion };
          }
        }
        editBtnEl.disabled = false;
        loadAssets().catch(() => {});
      } catch (error) {
        editBtnEl.disabled = false;
        alert(String(error?.message || 'Failed to update version'));
      }
  };

  assetVersionsListEl?.querySelectorAll('.restorePdfVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleRestoreVersion(event.currentTarget);
    });
  });
  assetVersionsListEl?.querySelectorAll('.restoreOfficeVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const versionId = String(btn.getAttribute('data-version-id') || '').trim();
      if (!versionId || !confirm(t('restore_office_confirm'))) return;
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/office-restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ versionId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(payload.error || 'Failed to restore Office version');
        return;
      }
      await refreshAssetDetail(asset.id, workflow);
    });
  });

  assetVersionsListEl?.querySelectorAll('.deleteVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleDeleteVersion(event.currentTarget);
    });
  });

  assetVersionsListEl?.querySelectorAll('.editVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleEditVersion(event.currentTarget);
    });
  });

  assetVersionsListEl?.addEventListener('click', async (event) => {
    const targetNode = event.target;
    const target = targetNode instanceof Element ? targetNode : targetNode?.parentElement;
    if (!(target instanceof Element)) return;

    const row = target.closest('.version-restorable[data-restore-version-id]');
    if (!row) return;
    const ignore = target.closest('button, a, input, textarea, select, label');
    if (ignore) return;
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const versionId = String(row.dataset.restoreVersionId || '').trim();
    if (!versionId) return;
    const ok = confirm(t('restore_pdf_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/pdf-restore`, {
      method: 'POST',
      body: JSON.stringify({ versionId })
    });
    await refreshAssetDetail(id, workflow);
  }, true);

  const downloadBtn = document.getElementById('downloadAssetBtn');
  const downloadProxyBtn = document.getElementById('downloadProxyBtn');
  const moveToTrashBtn = document.getElementById('moveToTrashBtn');
  const restoreAssetBtn = document.getElementById('restoreAssetBtn');
  const deleteAssetBtn = document.getElementById('deleteAssetBtn');

  downloadBtn?.addEventListener('click', () => {
    // Varlık indir her zaman asıl kaynağı indirir; proxy bunun yerine geçmez.
    const downloadUrl = String(asset.mediaUrl || '').trim();
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    // Empty download attribute lets browser suggest a filename.
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  downloadProxyBtn?.addEventListener('click', () => {
    // Proxy indirme yalnızca admin için ek bir kolaylık olarak sunuluyor.
    const downloadUrl = String(asset.proxyUrl || '').trim();
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  moveToTrashBtn?.addEventListener('click', async () => {
    const ok = confirm(t('move_to_trash_confirm'));
    if (!ok) return;
    await api(`/api/assets/${encodeURIComponent(asset.id)}/trash`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(asset.id, workflow);
  });

  restoreAssetBtn?.addEventListener('click', async () => {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/restore`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(asset.id, workflow);
  });

  deleteAssetBtn?.addEventListener('click', async () => {
    const ok = confirm(t('trash_confirm'));
    if (!ok) return;
    const wasSelected = selectedAssetId === asset.id;
    await api(`/api/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
    selectedAssetIds.delete(asset.id);
    await loadAssets();
    if (wasSelected) {
      selectedAssetId = null;
      resetSelectedAssetDetailPanel();
    }
  });

}

async function applyTagChipFilterToggle(clickedTag) {
  const nextTag = String(clickedTag || '').trim();
  if (!nextTag) return;
  const tagInput = searchForm.querySelector('[name="tag"]');
  const queryInput = searchForm.querySelector('[name="q"]');
  const currentTag = String(tagInput?.value || '').trim();
  const isSameTag = currentTag.localeCompare(nextTag, undefined, { sensitivity: 'base' }) === 0;
  if (tagInput) tagInput.value = isSameTag ? '' : nextTag;
  if (queryInput) queryInput.value = '';
  await loadAssets();
}

assetGrid.addEventListener('click', async (event) => {
  const tagChip = event.target.closest('[data-chip-tag]');
  if (tagChip) {
    event.preventDefault();
    event.stopPropagation();
    await applyTagChipFilterToggle(tagChip.dataset.chipTag);
    return;
  }

  const ocrJumpBtn = event.target.closest('[data-ocr-jump]');
  if (ocrJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(ocrJumpBtn.dataset.id || '').trim();
    const startAtSeconds = Math.max(0, Number(ocrJumpBtn.dataset.startSec || 0));
    if (!id) return;
    if (seekOpenDetailMedia(id, startAtSeconds)) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { startAtSeconds, scrollToVideoTop: true });
    return;
  }

  const clipJumpBtn = event.target.closest('[data-clip-jump]');
  if (clipJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(clipJumpBtn.dataset.id || '').trim();
    const focusCutId = String(clipJumpBtn.dataset.cutId || '').trim();
    const startAtSeconds = Math.max(0, Number(clipJumpBtn.dataset.startSec || 0));
    if (!id) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { startAtSeconds, focusCutId });
    return;
  }

  const fieldJumpBtn = event.target.closest('[data-field-jump]');
  if (fieldJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(fieldJumpBtn.dataset.id || '').trim();
    const focusFieldName = String(fieldJumpBtn.dataset.fieldName || '').trim();
    const focusTag = String(fieldJumpBtn.dataset.focusTag || '').trim();
    if (!id || (!focusFieldName && !focusTag)) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { focusFieldName, focusTag });
    return;
  }

  const actionBtn = event.target.closest('button[data-card-action]');
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.cardAction;
    if (!id || !action) return;
    if (action === 'restore') {
      await api(`/api/assets/${id}/restore`, { method: 'POST', body: '{}' });
      await loadAssets();
      return;
    }
    if (action === 'delete') {
      if (!currentUserCanDeleteAssets) return;
      const ok = confirm(t('trash_confirm'));
      if (!ok) return;
      await deleteApi(`/api/assets/${id}`);
      selectedAssetIds.delete(id);
      if (selectedAssetId === id) {
        selectedAssetId = null;
        resetSelectedAssetDetailPanel();
      }
      await loadAssets();
      return;
    }
  }

  const card = event.target.closest('.asset-card');
  if (!card) return;
  const cardId = String(card.dataset.id || '').trim();
  if (!cardId) return;

  if (event.metaKey || event.ctrlKey) {
    toggleMultiSelection(cardId);
    renderAssets(currentAssets);
    if (selectedAssetIds.size > 1) {
      await openMultiSelectionDetail();
      return;
    }
    if (selectedAssetIds.size === 1) {
      const onlySelectedId = selectedAssetId || [...selectedAssetIds][0];
      if (!onlySelectedId) return;
      const workflow = await api('/api/workflow');
      openAsset(onlySelectedId, workflow).catch((err) => alert(err.message));
      return;
    }
    if (activeDetailPinCleanup) {
      activeDetailPinCleanup();
      activeDetailPinCleanup = null;
    }
    if (activePlayerCleanup) {
      activePlayerCleanup();
      activePlayerCleanup = null;
    }
    assetDetail.classList.remove('detail-video-pinned');
    assetDetail.classList.remove('video-detail-mode');
    assetDetail.textContent = t('select_asset');
    setPanelVideoToolsButtonState(false);
    return;
  }

  if (event.shiftKey) {
    addShiftRangeSelection(cardId);
    renderAssets(currentAssets);
    await openMultiSelectionDetail();
    return;
  }

  setSingleSelection(cardId);

  const workflow = await api('/api/workflow');
  openAsset(cardId, workflow).catch((err) => alert(err.message));
});

assetDetail.addEventListener('click', async (event) => {
  const tagChip = event.target.closest('[data-chip-tag]');
  if (!tagChip) return;
  event.preventDefault();
  event.stopPropagation();
  await applyTagChipFilterToggle(tagChip.dataset.chipTag);
});

assetTypeFilters.forEach((input) => {
  input.addEventListener('change', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (document.activeElement === ocrQueryInput) queueOcrSuggestions();
    loadAssets().catch((error) => alert(error.message));
  });
});

assetsTitleToggleBtn?.addEventListener('click', () => {
  const allSelected = assetTypeFilters.every((input) => input.checked);
  const nextChecked = !allSelected;
  assetTypeFilters.forEach((input) => {
    input.checked = nextChecked;
  });
  updateClearSearchButtonState();
  if (document.activeElement === searchQueryInput) queueSearchSuggestions();
  if (document.activeElement === ocrQueryInput) queueOcrSuggestions();
  loadAssets().catch((error) => alert(error.message));
});

assetViewListBtn?.addEventListener('click', () => {
  assetViewMode = 'list';
  localStorage.setItem(LOCAL_ASSET_VIEW_MODE, assetViewMode);
  renderAssets(currentAssets);
});

assetViewThumbBtn?.addEventListener('click', () => {
  assetViewMode = 'grid';
  localStorage.setItem(LOCAL_ASSET_VIEW_MODE, assetViewMode);
  renderAssets(currentAssets);
});

async function detectDurationSeconds(file) {
  const type = String(file.type || '').toLowerCase();
  if (!(type.startsWith('video/') || type.startsWith('audio/'))) {
    return 0;
  }

  const url = URL.createObjectURL(file);
  try {
    const el = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
    el.preload = 'metadata';
    el.src = url;

    const duration = await new Promise((resolve) => {
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
      el.onerror = () => resolve(0);
    });

    return Math.max(0, Math.round(duration));
  } finally {
    URL.revokeObjectURL(url);
  }
}

mediaFileBtn?.addEventListener('click', () => {
  mediaFileInput?.click();
});

mediaFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (mediaFileName) mediaFileName.textContent = file?.name || '';
});

ingestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(ingestForm);
  const mediaFile = formData.get('mediaFile');
  const submitBtn = ingestForm.querySelector('button[type="submit"]');

  if (!(mediaFile instanceof File) || !mediaFile.size) {
    alert(t('select_media_first'));
    return;
  }

  const base64 = await readFileAsBase64(mediaFile);

  const payload = {
    title: formData.get('title'),
    type: formData.get('type'),
    tags: formData.get('tags'),
    description: formData.get('description'),
    fileName: mediaFile.name,
    mimeType: mediaFile.type || 'application/octet-stream',
    fileData: base64
  };
  payload.dcMetadata = {
    title: String(payload.title || ''),
    subject: String(payload.tags || ''),
    description: String(payload.description || ''),
    type: String(payload.type || ''),
    format: String(payload.mimeType || ''),
    identifier: String(payload.fileName || '')
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    setUploadProgress(1, t('uploading'));
    let created = null;
    const sendUpload = async (extraPayload = {}) => uploadAssetWithProgress({ ...payload, ...extraPayload }, (pct) => {
      const mapped = Math.min(95, Math.round((Number(pct) || 0) * 0.95));
      setUploadProgress(mapped, t('uploading'));
    });
    try {
      created = await sendUpload();
    } catch (error) {
      if (String(error?.code || '') !== 'proxy_audio_confirmation_required') throw error;
      const decision = await showUploadProxyDecisionModal(error);
      if (decision === 'cancel') {
        hideUploadProgress();
        return;
      }
      setUploadProgress(30, t('processing'));
      created = await sendUpload(decision === 'silent'
        ? { allowSilentProxyFallback: true }
        : { skipProxyGeneration: true });
    }
    setUploadProgress(96, t('processing'));
    ingestForm.reset();
    ingestForm.querySelector('[name="type"]').value = 'Video';
    if (mediaFileName) mediaFileName.textContent = '';
    await waitUntilAssetVisible(created?.id || null);
    setUploadProgress(100, t('processing'));
    const warningMessage = formatIngestWarningMessage(created);
    if (warningMessage) {
      alert(warningMessage);
    }
  } catch (error) {
    alert(String(error?.message || 'Upload failed'));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    setTimeout(() => hideUploadProgress(), 450);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideSearchSuggestions();
  hideOcrSuggestions();
  hideSubtitleSuggestions();
  try {
    await loadAssets();
  } catch (error) {
    showAssetLoadError(error);
  }
});

clearSearchBtn?.addEventListener('click', async () => {
  try {
    await clearSearchFields();
  } catch (error) {
    showAssetLoadError(error);
  }
});

['tag', 'type'].forEach((name) => {
  const el = searchForm.querySelector(`[name="${name}"]`);
  el?.addEventListener('input', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (getActiveOcrQueryInput() === ocrQueryInput) queueOcrSuggestions();
    if (document.activeElement === subtitleQueryInput) queueSubtitleSuggestions();
  });
});

['status', 'trash'].forEach((name) => {
  const el = searchForm.querySelector(`[name="${name}"]`);
  el?.addEventListener('change', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (getActiveOcrQueryInput() === ocrQueryInput) queueOcrSuggestions();
    if (document.activeElement === subtitleQueryInput) queueSubtitleSuggestions();
  });
});

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
  hideSearchSuggestions();
  hideOcrSuggestions();
  hideSubtitleSuggestions();
  applyStaticI18n();
  await loadWorkflow();
  await loadAssets();
  if (selectedAssetIds.size > 1) {
    await openMultiSelectionDetail();
    return;
  }
  if (selectedAssetId) {
    const workflow = await api('/api/workflow');
    await openAsset(selectedAssetId, workflow);
  } else {
    if (activeDetailPinCleanup) {
      activeDetailPinCleanup();
      activeDetailPinCleanup = null;
    }
    assetDetail.textContent = t('select_asset');
    assetDetail.classList.remove('video-detail-mode');
    assetDetail.classList.remove('detail-video-pinned');
    setPanelVideoToolsButtonState(false);
  }
});

const onLanguageShortcut = (event) => {
  if (event.key !== 'L' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (!languageSelect) return;
  const nextLang = languageSelect.value === 'tr' ? 'en' : 'tr';
  languageSelect.value = nextLang;
  languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  event.preventDefault();
  event.stopPropagation();
};

document.addEventListener('keydown', onLanguageShortcut);

closeDetailBtn?.addEventListener('click', () => {
  setPanelVisible('panelDetail', false);
  setPanelVideoToolsButtonState(false);
});

splitterDots.forEach((dot) => {
  dot.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const panelId = dot.dataset.hidePanel;
    if (!panelId) return;
    setPanelVisible(panelId, false);
  });
});

splitterTabs.forEach((tab) => {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const panelId = tab.dataset.showPanel;
    if (!panelId) return;
    setPanelVisible(panelId, true);
  });
});

currentUserBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  userMenu?.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
  if (!userMenu || !currentUserBtn) return;
  if (currentUserBtn.contains(event.target)) return;
  if (userMenu.contains(event.target)) return;
  userMenu.classList.add('hidden');
});

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;
  const type = String(event.data?.type || '').trim();
  if (type !== 'mam-pdf-saved') return;
  const assetId = String(event.data?.assetId || '').trim();
  if (!assetId || assetId !== selectedAssetId) return;
  try {
    const workflow = await api('/api/workflow');
    await loadAssets();
    await openAsset(assetId, workflow);
  } catch (_error) {
    // Best effort refresh only.
  }
});

logoutBtn?.addEventListener('click', async () => {
  userMenu?.classList.add('hidden');
  try {
    const logoutEndpoint = `/api/logout-url?ts=${Date.now()}`;
    const response = await fetch(logoutEndpoint, {
      credentials: 'include',
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    const url = String(payload?.url || '').trim();
    window.location.assign(url || '/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F');
  } catch (_error) {
    window.location.assign('/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F');
  }
});

(async () => {
  try {
    await loadI18nFile();
    await loadUiSettings();
    applyVideoToolsPageLayoutMode();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyStaticI18n();
    loadPanelPrefs();
    loadPanelVisibilityPrefs();
    if (!isVideoToolsPageMode && /^[01]{3}$/.test(requestedRestorePanels)) {
      panelVisibility.panelIngest = requestedRestorePanels[0] === '1';
      panelVisibility.panelAssets = requestedRestorePanels[1] === '1';
      panelVisibility.panelDetail = requestedRestorePanels[2] === '1';
      if (!panelVisibility.panelIngest && !panelVisibility.panelAssets && !panelVisibility.panelDetail) {
        panelVisibility.panelAssets = true;
      }
      savePanelVisibilityPrefs();
    }
    if (isVideoToolsPageMode) {
      panelVisibility.panelIngest = false;
      panelVisibility.panelAssets = false;
      panelVisibility.panelDetail = true;
    }
    applyPanelLayout();
    initPanelSplitters();
    updateClearSearchButtonState();
    await loadCurrentUser();
    const workflow = await loadWorkflow();
    applyAssetViewModeUI();
    await loadAssets();
    if (isVideoToolsPageMode) {
      const targetId = requestedVideoToolsAssetId
        || String(currentAssets.find((item) => isVideo(item))?.id || '').trim();
      if (targetId) {
        await openAsset(targetId, workflow, { startAtSeconds: requestedVideoToolsStartSec });
      } else {
        assetDetail.innerHTML = `<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
      }
    } else if (requestedOpenAssetId) {
      await openAsset(requestedOpenAssetId, workflow, { startAtSeconds: requestedOpenStartSec });
      const clean = new URL(window.location.href);
      clean.searchParams.delete('openAsset');
      clean.searchParams.delete('openTc');
      clean.searchParams.delete('restorePanels');
      window.history.replaceState({}, '', clean.toString());
    } else if (requestedRestorePanels) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('restorePanels');
      window.history.replaceState({}, '', clean.toString());
    }
  } catch (error) {
    alert(error.message);
  }
})();
