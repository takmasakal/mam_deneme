(function attachMainPlayerRuntimeModule(global) {
  function createMainPlayerRuntimeModule(deps) {
    const {
      t,
      escapeHtml,
      PLAYER_FPS,
      useMpegDashPlayerUI,
      isVideo,
      cutMarksByAsset,
      currentUserCanDeleteAssetsRef,
      searchStateRef,
      highlightMatch,
      effectiveSearchHighlightClass,
      secondsToTimecode,
      parseTimecodeInput,
      api,
      deleteApi,
      openClipEditorDialog,
      openTimecodeJumpDialog,
      ensureDetailPanelMinWidth,
      measureClipsPanelRequiredWidth,
      initFullscreenOverlay,
      toggleFullscreenForElement,
      getSubtitleOverlayEnabled,
      setSubtitleOverlayEnabled,
      syncSubtitleOverlayInOpenPlayers,
      showShortcutToast
    } = deps || {};

    let dashJsLoadPromise = null;

    function loadDashJs() {
      if (global.dashjs) return Promise.resolve(true);
      if (dashJsLoadPromise) return dashJsLoadPromise;
      dashJsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
        script.async = true;
        script.onload = () => resolve(Boolean(global.dashjs?.MediaPlayer));
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
      if (!manifestUrl) return () => {};

      let disposed = false;
      let player = null;

      (async () => {
        const ready = await loadDashJs();
        if (!ready || disposed || !global.dashjs?.MediaPlayer) return;
        try {
          player = global.dashjs.MediaPlayer().create();
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

    function initPlaybackRateLongPress(mediaEl, triggerBtn, backwardBtn, forwardBtn) {
      if (!(mediaEl instanceof HTMLMediaElement) || !(triggerBtn instanceof HTMLElement) || !(backwardBtn instanceof HTMLElement) || !(forwardBtn instanceof HTMLElement)) return () => {};

      const rates = [0.25, 0.5, 1, 2, 4, 8];
      let menuOpen = false;
      let menuEl = null;
      let preferredRate = Number(mediaEl.dataset.preferredPlaybackRate || mediaEl.playbackRate) || 1;
      let preferredDirection = String(mediaEl.dataset.preferredPlaybackDirection || 'forward') === 'reverse' ? 'reverse' : 'forward';
      let reverseTimer = null;
      let suppressPauseHandling = false;

      try { mediaEl.preservesPitch = false; } catch (_error) {}
      try { mediaEl.mozPreservesPitch = false; } catch (_error) {}
      try { mediaEl.webkitPreservesPitch = false; } catch (_error) {}

      const closeMenu = () => {
        if (menuEl?.parentNode) menuEl.parentNode.removeChild(menuEl);
        menuEl = null;
        menuOpen = false;
      };

      const isPlaying = () => Boolean(reverseTimer) || (!mediaEl.paused && !mediaEl.ended);

      const stopReversePlayback = () => {
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
        const viewportWidth = global.innerWidth || document.documentElement.clientWidth || 1280;
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
        stopReversePlayback();
        try {
          suppressPauseHandling = true;
          mediaEl.pause();
        } catch (_error) {
        } finally {
          suppressPauseHandling = false;
        }
        const fps = Math.max(1, PLAYER_FPS || 25);
        const stepSeconds = Math.max(0.001, preferredRate / fps);
        reverseTimer = global.setInterval(() => {
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
      global.addEventListener('resize', onWindowResize);
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
        global.removeEventListener('resize', onWindowResize);
        mediaEl.removeEventListener('ratechange', updateButtonHint);
        mediaEl.removeEventListener('play', applyDirectionState);
        mediaEl.removeEventListener('pause', onPause);
        mediaEl.removeEventListener('ended', updateButtonHint);
        delete mediaEl.__mamPreferredPlaybackDirection;
        delete mediaEl.__mamStartReversePlayback;
        delete mediaEl.__mamStopReversePlayback;
      };
    }

    function initFrameControls(mediaEl, asset, root = document, options = {}) {
      const byId = (id) => root.querySelector(`#${id}`);
      const byIdGlobal = (id) => byId(id) || document.getElementById(id);
      const playbackRateBackBtn = byIdGlobal('playbackRateBackBtn');
      const playbackRateBtn = byIdGlobal('playbackRateBtn');
      const playbackRateForwardBtn = byIdGlobal('playbackRateForwardBtn');
      const playBtn = byId('playBtn');
      const stopBtn = byId('stopBtn');
      const reverseFrameBtn = byId('reverseFrameBtn');
      const forwardFrameBtn = byId('forwardFrameBtn');
      const currentTimecodeEl = byIdGlobal('currentTimecode');
      const markSummary = byId('markSummary');
      const markInTick = byId('markInTick');
      const markOutTick = byId('markOutTick');
      const customMarkInTick = byId('customMarkInTick');
      const customMarkOutTick = byId('customMarkOutTick');
      const customSeekRange = byId('customSeekRange');
      const markInBtn = byId('markInBtn');
      const markOutBtn = byId('markOutBtn');
      const goInBtn = byId('goInBtn');
      const goOutBtn = byId('goOutBtn');
      const clearMarksBtn = byId('clearMarksBtn');
      const saveCutBtn = byId('saveCutBtn');
      const cutLabelInput = byId('cutLabelInput');
      const cutsList = byId('cutsList');
      const clipsSection = root.querySelector('.collapsible-section[data-section="clips"]');
      const allowSurfaceToggle = isVideo(asset);
      const resolveFullscreenTarget = () =>
        mediaEl.closest('.viewer-core')
        || mediaEl.closest('.viewer-shell')
        || mediaEl.closest('.viewer-resizable')
        || mediaEl;
      let fullscreenTarget = resolveFullscreenTarget();
      let fullscreenOverlayCleanup = initFullscreenOverlay(mediaEl, fullscreenTarget, asset);
      const ensureFullscreenOverlayTarget = () => {
        const nextTarget = resolveFullscreenTarget();
        if (nextTarget !== fullscreenTarget) {
          fullscreenOverlayCleanup?.();
          fullscreenTarget = nextTarget;
          fullscreenOverlayCleanup = initFullscreenOverlay(mediaEl, fullscreenTarget, asset);
        }
        return fullscreenTarget;
      };

      if (!playBtn || !reverseFrameBtn || !forwardFrameBtn || !currentTimecodeEl || !markSummary) {
        return () => {};
      }

      const playbackRateCleanup = initPlaybackRateLongPress(mediaEl, playbackRateBtn, playbackRateBackBtn, playbackRateForwardBtn);
      const marks = cutMarksByAsset.get(asset.id) || { in: null, out: null };
      cutMarksByAsset.set(asset.id, marks);
      const cuts = Array.isArray(asset.cuts) ? [...asset.cuts] : [];
      let activeCutId = String(options.focusCutId || '').trim() || null;
      let showActiveCutTicks = Boolean(activeCutId);
      let activeCutPlayOutSec = null;
      const subtitleOverlayCheck = root.querySelector('#subtitleOverlayCheck');

      const getFps = () => PLAYER_FPS;
      const snapToFrame = (seconds) => {
        const fps = getFps();
        const raw = Number(seconds);
        if (!Number.isFinite(raw) || fps <= 0) return 0;
        return Math.max(0, Math.round(raw * fps) / fps);
      };

      const updateTimecode = () => {
        if (activeCutPlayOutSec != null && Number.isFinite(activeCutPlayOutSec)) {
          const stopAt = snapToFrame(activeCutPlayOutSec);
          const eps = 1 / Math.max(1, getFps() * 2);
          if (Number(mediaEl.currentTime) >= (stopAt - eps)) {
            mediaEl.pause();
            mediaEl.currentTime = stopAt;
            activeCutPlayOutSec = null;
          }
        }
        const currentTc = secondsToTimecode(mediaEl.currentTime, getFps());
        currentTimecodeEl.textContent = currentTc;
        const currentTcHost = currentTimecodeEl.closest('.viewer-tc') || currentTimecodeEl;
        currentTcHost.dataset.tcEditable = '1';
        currentTcHost.dataset.tcValue = currentTc;
        currentTcHost.classList.add('editable-tc-chip');
        syncMarkTicks();
      };

      const updateMarks = () => {
        const inTc = marks.in == null ? '--:--:--:--' : secondsToTimecode(marks.in, getFps());
        const outTc = marks.out == null ? '--:--:--:--' : secondsToTimecode(marks.out, getFps());
        const segment = marks.in != null && marks.out != null && marks.out >= marks.in
          ? secondsToTimecode(marks.out - marks.in, getFps())
          : '--:--:--:--';
        markSummary.innerHTML = `
          <button type="button" class="inline-tc-btn tc-in-label" data-tc-editable="1" data-tc-value="${escapeHtml(inTc)}">${escapeHtml(t('in_label'))}: ${escapeHtml(inTc)}</button>
          <span>|</span>
          <button type="button" class="inline-tc-btn tc-out-label" data-tc-editable="1" data-tc-value="${escapeHtml(outTc)}">${escapeHtml(t('out_label'))}: ${escapeHtml(outTc)}</button>
          <span>|</span>
          <span>${escapeHtml(t('segment'))}: ${escapeHtml(segment)}</span>
        `;
        syncMarkTicks();
      };

      const syncMarkTicks = () => {
        const duration = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : 0;
        const activeCut = cuts.find((c) => c.cutId === activeCutId) || null;
        const fallbackIn = marks.in;
        const fallbackOut = marks.out;
        const tickIn = activeCut ? activeCut.inPointSeconds : fallbackIn;
        const tickOut = activeCut ? activeCut.outPointSeconds : fallbackOut;
        const updateTick = (el, value, label) => {
          if (!el) return;
          if (value == null || duration <= 0 || !showActiveCutTicks) {
            el.classList.add('hidden');
            el.dataset.tickPx = '';
            el.dataset.timecode = '';
            return;
          }
          const timecode = secondsToTimecode(value, getFps());
          const fps = getFps();
          const totalFrames = Math.max(1, Math.floor(duration * fps));
          const maxFrame = Math.max(0, totalFrames - 1);
          const frame = Math.max(0, Math.min(maxFrame, Math.round(Number(value) * fps)));
          const ratio = maxFrame > 0 ? (frame / maxFrame) : 0;
          if (el.classList.contains('custom-seek-tick')) {
            const width = customSeekRange?.getBoundingClientRect().width || 0;
            const wrap = el.parentElement;
            const rawThumb = wrap ? getComputedStyle(wrap).getPropertyValue('--seek-thumb-size') : '';
            const thumbPx = Math.max(0, parseFloat(rawThumb) || 14);
            const leftPx = width > 0 ? (thumbPx / 2) + ((width - thumbPx) * ratio) : 0;
            el.style.left = width > 0 ? `${leftPx}px` : `${ratio * 100}%`;
            el.dataset.tickPx = String(leftPx);
          } else {
            el.style.left = `${ratio * 100}%`;
            el.dataset.tickPx = '';
          }
          el.dataset.timecode = timecode;
          el.title = `${label}: ${timecode}`;
          el.classList.remove('hidden');
        };
        updateTick(markInTick, tickIn, t('in_label'));
        updateTick(markOutTick, tickOut, t('out_label'));
        updateTick(customMarkInTick, tickIn, t('in_label'));
        updateTick(customMarkOutTick, tickOut, t('out_label'));
      };

      const renderCuts = () => {
        if (!cutsList) return;
        if (!cuts.length) {
          cutsList.innerHTML = '';
          return;
        }
        const currentSearchHighlightQuery = String(searchStateRef?.currentSearchHighlightQuery || '').trim();
        const currentSearchQuery = String(searchStateRef?.currentSearchQuery || '').trim();
        const currentSearchFuzzyUsed = Boolean(searchStateRef?.currentSearchFuzzyUsed);
        const currentUserCanDeleteAssets = Boolean(currentUserCanDeleteAssetsRef?.get?.());
        cutsList.innerHTML = cuts
          .map((cut) => {
            const seg = Math.max(0, Number(cut.outPointSeconds) - Number(cut.inPointSeconds));
            return `
              <div class="cut-item ${activeCutId === cut.cutId ? 'active' : ''}" data-cut-id="${cut.cutId}">
                <div class="cut-item-meta">
                  <strong>${highlightMatch(cut.label || 'Cut', currentSearchHighlightQuery, effectiveSearchHighlightClass(currentSearchQuery, currentSearchHighlightQuery, currentSearchFuzzyUsed))}</strong>
                  <div class="cut-item-tc-row">
                    <button type="button" class="inline-tc-btn tc-in-label" data-tc-editable="1" data-tc-value="${secondsToTimecode(cut.inPointSeconds, getFps())}">${t('in_label')}: ${secondsToTimecode(cut.inPointSeconds, getFps())}</button>
                    <button type="button" class="inline-tc-btn tc-out-label" data-tc-editable="1" data-tc-value="${secondsToTimecode(cut.outPointSeconds, getFps())}">${t('out_label')}: ${secondsToTimecode(cut.outPointSeconds, getFps())}</button>
                    <span>${t('segment')}: ${secondsToTimecode(seg, getFps())}</span>
                  </div>
                </div>
                <div class="cut-item-actions">
                  <button type="button" data-cut-action="edit" data-cut-id="${cut.cutId}">${t('edit_clip')}</button>
                  <button type="button" data-cut-action="jump" data-cut-id="${cut.cutId}">${t('jump_to_cut')}</button>
                  <button type="button" data-cut-action="play-cut" data-cut-id="${cut.cutId}">${t('play_cut')}</button>
                  ${currentUserCanDeleteAssets ? `<button type="button" data-cut-action="delete" data-cut-id="${cut.cutId}">${t('delete_cut')}</button>` : ''}
                </div>
              </div>
            `;
          })
          .join('');
        if (activeCutId) {
          const activeRow = cutsList.querySelector(`.cut-item[data-cut-id="${CSS.escape(activeCutId)}"]`);
          activeRow?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        if (clipsSection && !clipsSection.classList.contains('collapsed')) {
          requestAnimationFrame(() => ensureDetailPanelMinWidth(measureClipsPanelRequiredWidth(root)));
        }
      };

      const step = (direction) => {
        const delta = direction / getFps();
        const nextTime = Math.max(0, mediaEl.currentTime + delta);
        mediaEl.pause();
        mediaEl.currentTime = nextTime;
        mediaEl.dispatchEvent(new CustomEvent('mam:frame-step', { detail: { time: nextTime } }));
      };

      const syncPlayButton = () => {
        const isPaused = mediaEl.paused || mediaEl.ended;
        playBtn.textContent = isPaused ? '▶' : '⏸';
        playBtn.title = isPaused ? t('play') : t('pause');
        playBtn.setAttribute('aria-label', isPaused ? t('play') : t('pause'));
      };

      const onClipsSectionPointerDown = () => {
        if (!clipsSection || clipsSection.classList.contains('collapsed')) return;
        ensureDetailPanelMinWidth(measureClipsPanelRequiredWidth(root));
      };
      clipsSection?.addEventListener('pointerdown', onClipsSectionPointerDown);

      const clearActiveCutOverlay = () => {
        activeCutId = null;
        activeCutPlayOutSec = null;
        showActiveCutTicks = false;
        renderCuts();
        syncMarkTicks();
      };

      const onPlay = async () => {
        const preferredDirection = typeof mediaEl.__mamPreferredPlaybackDirection === 'function'
          ? mediaEl.__mamPreferredPlaybackDirection()
          : 'forward';
        if (preferredDirection === 'reverse') {
          if (typeof mediaEl.__mamStartReversePlayback === 'function') mediaEl.__mamStartReversePlayback();
          return;
        }
        if (mediaEl.paused || mediaEl.ended) {
          await mediaEl.play();
        } else {
          if (typeof mediaEl.__mamStopReversePlayback === 'function') mediaEl.__mamStopReversePlayback();
          mediaEl.pause();
        }
      };

      const onStop = () => {
        activeCutPlayOutSec = null;
        mediaEl.pause();
        mediaEl.currentTime = 0;
        updateTimecode();
        syncPlayButton();
      };

      const onMarkIn = () => {
        activeCutId = null;
        marks.in = snapToFrame(mediaEl.currentTime);
        marks.out = null;
        activeCutPlayOutSec = null;
        showActiveCutTicks = true;
        renderCuts();
        updateMarks();
      };

      const onMarkOut = () => {
        marks.out = snapToFrame(mediaEl.currentTime);
        activeCutPlayOutSec = null;
        showActiveCutTicks = true;
        updateMarks();
      };

      const onGoIn = () => {
        const activeCut = cuts.find((c) => c.cutId === activeCutId) || null;
        const target = activeCut ? Number(activeCut.inPointSeconds) : marks.in;
        if (target != null && Number.isFinite(Number(target))) {
          showActiveCutTicks = true;
          activeCutPlayOutSec = null;
          mediaEl.currentTime = snapToFrame(Number(target));
          syncMarkTicks();
        }
      };

      const onGoOut = () => {
        const activeCut = cuts.find((c) => c.cutId === activeCutId) || null;
        const target = activeCut ? Number(activeCut.outPointSeconds) : marks.out;
        if (target != null && Number.isFinite(Number(target))) {
          showActiveCutTicks = true;
          activeCutPlayOutSec = null;
          mediaEl.currentTime = snapToFrame(Number(target));
          syncMarkTicks();
        }
      };

      const onClear = () => {
        marks.in = null;
        marks.out = null;
        activeCutPlayOutSec = null;
        showActiveCutTicks = false;
        updateMarks();
      };

      const onSaveCut = async () => {
        if (marks.in == null || marks.out == null || marks.out < marks.in) return;
        const clipLabel = String(cutLabelInput?.value || '').trim();
        const created = await api(`/api/assets/${asset.id}/cuts`, {
          method: 'POST',
          body: JSON.stringify({ inPointSeconds: marks.in, outPointSeconds: marks.out, label: clipLabel })
        });
        cuts.unshift(created);
        activeCutId = created?.cutId || activeCutId;
        showActiveCutTicks = false;
        renderCuts();
        syncMarkTicks();
        if (cutLabelInput) cutLabelInput.value = '';
      };

      const onCutsAction = async (event) => {
        const tcButton = event.target.closest('[data-tc-editable="1"]');
        if (tcButton) return;
        const button = event.target.closest('button[data-cut-action]');
        if (!button) return;
        const cutId = button.dataset.cutId;
        const action = button.dataset.cutAction;
        const cut = cuts.find((c) => c.cutId === cutId);
        if (!cut) return;

        if (action === 'jump') {
          activeCutId = cut.cutId;
          showActiveCutTicks = true;
          activeCutPlayOutSec = null;
          renderCuts();
          mediaEl.currentTime = Number(cut.inPointSeconds) || 0;
          syncMarkTicks();
          return;
        }
        if (action === 'play-cut') {
          const inPoint = snapToFrame(Number(cut.inPointSeconds) || 0);
          const outPoint = snapToFrame(Number(cut.outPointSeconds) || 0);
          activeCutId = cut.cutId;
          showActiveCutTicks = true;
          activeCutPlayOutSec = outPoint >= inPoint ? outPoint : null;
          renderCuts();
          mediaEl.currentTime = inPoint;
          syncMarkTicks();
          mediaEl.play().catch(() => {});
          return;
        }
        if (action === 'edit') {
          const next = await openClipEditorDialog({
            label: String(cut.label || ''),
            inTc: secondsToTimecode(cut.inPointSeconds, getFps()),
            outTc: secondsToTimecode(cut.outPointSeconds, getFps())
          });
          if (!next || !next.label) return;

          const nextInPoint = parseTimecodeInput(next.inTc, getFps());
          const nextOutPoint = parseTimecodeInput(next.outTc, getFps());
          if (!Number.isFinite(nextInPoint) || !Number.isFinite(nextOutPoint)) {
            alert(t('invalid_timecode'));
            return;
          }
          if (nextOutPoint < nextInPoint) {
            alert(t('invalid_in_out'));
            return;
          }
          const updated = await api(`/api/assets/${asset.id}/cuts/${cutId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              label: next.label,
              inPointSeconds: nextInPoint,
              outPointSeconds: nextOutPoint
            })
          });
          const idx = cuts.findIndex((c) => c.cutId === cutId);
          if (idx >= 0) cuts[idx] = { ...cuts[idx], ...updated };
          showActiveCutTicks = false;
          renderCuts();
          syncMarkTicks();
          return;
        }
        if (action === 'delete') {
          if (!currentUserCanDeleteAssetsRef?.get?.()) return;
          await deleteApi(`/api/assets/${asset.id}/cuts/${cutId}`);
          const idx = cuts.findIndex((c) => c.cutId === cutId);
          if (idx >= 0) cuts.splice(idx, 1);
          if (activeCutId === cutId) activeCutId = null;
          showActiveCutTicks = false;
          renderCuts();
          syncMarkTicks();
        }
      };

      const onEscapeClearCutOverlay = (event) => {
        if (event.key !== 'Escape') return;
        if (!showActiveCutTicks && !activeCutId && activeCutPlayOutSec == null) return;
        clearActiveCutOverlay();
      };

      const onSubtitleOverlayShortcut = (event) => {
        if (event.key !== 'A' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof Element && target.closest('input, textarea, select, [contenteditable=\"true\"]')) return;
        const nextEnabled = !getSubtitleOverlayEnabled(asset.id, false);
        setSubtitleOverlayEnabled(asset.id, nextEnabled);
        if (subtitleOverlayCheck) subtitleOverlayCheck.checked = nextEnabled;
        syncSubtitleOverlayInOpenPlayers(asset);
        showShortcutToast(nextEnabled ? t('subtitle_shortcut_on') : t('subtitle_shortcut_off'));
        event.preventDefault();
        event.stopPropagation();
      };

      const onTimecodeJump = async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tcNode = target.closest('[data-tc-editable="1"]');
        if (!tcNode) return;
        event.preventDefault();
        event.stopPropagation();
        const initialTc = String(tcNode.dataset.tcValue || '').trim();
        if (!initialTc || initialTc.includes('--')) return;
        const nextTc = await openTimecodeJumpDialog?.(initialTc);
        if (!nextTc) return;
        const nextSeconds = parseTimecodeInput(nextTc, getFps());
        if (!Number.isFinite(nextSeconds)) {
          alert(t('invalid_timecode'));
          return;
        }
        mediaEl.currentTime = snapToFrame(nextSeconds);
        mediaEl.pause();
        updateTimecode();
      };

      playBtn.addEventListener('click', onPlay);
      markSummary.addEventListener('click', onTimecodeJump);
      root.addEventListener('click', onTimecodeJump);
      const headerTcSlot = document.getElementById('panelDetailTcSlot');
      headerTcSlot?.addEventListener('click', onTimecodeJump);
      const onDoubleClickFullscreen = async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('button, input, select, textarea, a, .custom-player-bar, .player-controls-box')) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        const fsTarget = ensureFullscreenOverlayTarget();
        await toggleFullscreenForElement(fsTarget);
      };
      mediaEl.addEventListener('dblclick', onDoubleClickFullscreen, true);
      const onDocumentDblClickCapture = async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target !== mediaEl && !mediaEl.contains(target)) return;
        if (target.closest('button, input, select, textarea, a, .custom-player-bar, .player-controls-box')) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        const fsTarget = ensureFullscreenOverlayTarget();
        await toggleFullscreenForElement(fsTarget);
      };
      document.addEventListener('dblclick', onDocumentDblClickCapture, true);
      const onSurfaceToggle = async (event) => {
        if (!allowSurfaceToggle) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('button, input, select, textarea, a, .custom-player-bar, .player-controls-box')) return;
        if (mediaEl.paused || mediaEl.ended) {
          await mediaEl.play().catch(() => {});
        } else {
          mediaEl.pause();
        }
      };
      mediaEl.addEventListener('click', onSurfaceToggle);
      const onMediaContextMenu = (event) => {
        event.preventDefault();
      };
      mediaEl.addEventListener('contextmenu', onMediaContextMenu);
      document.addEventListener('keydown', onEscapeClearCutOverlay);
      document.addEventListener('keydown', onSubtitleOverlayShortcut);
      stopBtn?.addEventListener('click', onStop);
      reverseFrameBtn.addEventListener('click', () => step(-1));
      forwardFrameBtn.addEventListener('click', () => step(1));
      markInBtn?.addEventListener('click', onMarkIn);
      markOutBtn?.addEventListener('click', onMarkOut);
      goInBtn?.addEventListener('click', onGoIn);
      goOutBtn?.addEventListener('click', onGoOut);
      clearMarksBtn?.addEventListener('click', onClear);
      saveCutBtn?.addEventListener('click', onSaveCut);
      cutsList?.addEventListener('click', onCutsAction);
      cutsList?.addEventListener('click', onTimecodeJump);

      mediaEl.addEventListener('timeupdate', updateTimecode);
      mediaEl.addEventListener('seeked', updateTimecode);
      mediaEl.addEventListener('loadedmetadata', syncMarkTicks);
      mediaEl.addEventListener('durationchange', syncMarkTicks);
      global.addEventListener('resize', syncMarkTicks);
      mediaEl.addEventListener('play', syncPlayButton);
      mediaEl.addEventListener('pause', syncPlayButton);
      mediaEl.addEventListener('ended', syncPlayButton);
      updateTimecode();
      updateMarks();
      renderCuts();
      syncPlayButton();

      return () => {
        playbackRateCleanup?.();
        fullscreenOverlayCleanup?.();
        clipsSection?.removeEventListener('pointerdown', onClipsSectionPointerDown);
        playBtn.removeEventListener('click', onPlay);
        markSummary.removeEventListener('click', onTimecodeJump);
        root.removeEventListener('click', onTimecodeJump);
        headerTcSlot?.removeEventListener('click', onTimecodeJump);
        mediaEl.removeEventListener('dblclick', onDoubleClickFullscreen, true);
        document.removeEventListener('dblclick', onDocumentDblClickCapture, true);
        mediaEl.removeEventListener('click', onSurfaceToggle);
        mediaEl.removeEventListener('contextmenu', onMediaContextMenu);
        document.removeEventListener('keydown', onEscapeClearCutOverlay);
        document.removeEventListener('keydown', onSubtitleOverlayShortcut);
        stopBtn?.removeEventListener('click', onStop);
        markInBtn?.removeEventListener('click', onMarkIn);
        markOutBtn?.removeEventListener('click', onMarkOut);
        goInBtn?.removeEventListener('click', onGoIn);
        goOutBtn?.removeEventListener('click', onGoOut);
        clearMarksBtn?.removeEventListener('click', onClear);
        saveCutBtn?.removeEventListener('click', onSaveCut);
        cutsList?.removeEventListener('click', onCutsAction);
        cutsList?.removeEventListener('click', onTimecodeJump);
        mediaEl.removeEventListener('timeupdate', updateTimecode);
        mediaEl.removeEventListener('seeked', updateTimecode);
        mediaEl.removeEventListener('loadedmetadata', syncMarkTicks);
        mediaEl.removeEventListener('durationchange', syncMarkTicks);
        global.removeEventListener('resize', syncMarkTicks);
        mediaEl.removeEventListener('play', syncPlayButton);
        mediaEl.removeEventListener('pause', syncPlayButton);
        mediaEl.removeEventListener('ended', syncPlayButton);
      };
    }

    return {
      loadDashJs,
      initMpegDashPlayer,
      initPlaybackRateLongPress,
      initFrameControls
    };
  }

  global.createMainPlayerRuntimeModule = createMainPlayerRuntimeModule;
})(window);
