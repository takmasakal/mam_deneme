(function attachMainPlayerUiModule(global) {
  function createMainPlayerUiModule(deps) {
    const {
      t,
      useCustomLikeTimelineUI,
      detailVideoPinnedRef,
      PLAYER_FPS
    } = deps || {};

    function buildSeekPreviewController({
      mediaEl,
      seekEl,
      hostEl,
      toClock,
      frameToSeconds,
      getDuration,
      ratioFromValue
    }) {
      if (!(mediaEl instanceof HTMLMediaElement) || !(seekEl instanceof HTMLElement) || !(hostEl instanceof HTMLElement)) {
        return { destroy: () => {} };
      }

      const bubble = document.createElement('div');
      bubble.className = 'seek-preview-bubble hidden';
      bubble.innerHTML = `
        <div class="seek-preview-frame-wrap">
          <img class="seek-preview-poster hidden" alt="" />
          <canvas class="seek-preview-canvas hidden" width="160" height="90"></canvas>
        </div>
        <div class="seek-preview-time">00:00:00</div>
      `;
      hostEl.appendChild(bubble);

      const posterEl = bubble.querySelector('.seek-preview-poster');
      const canvasEl = bubble.querySelector('.seek-preview-canvas');
      const timeEl = bubble.querySelector('.seek-preview-time');
      const canvasCtx = canvasEl instanceof HTMLCanvasElement ? canvasEl.getContext('2d') : null;
      const posterUrl = String(mediaEl.getAttribute('poster') || '').trim();
      if (posterEl instanceof HTMLImageElement && posterUrl) {
        posterEl.src = posterUrl;
        posterEl.classList.remove('hidden');
      }

      const sourceUrl = String(mediaEl.currentSrc || mediaEl.getAttribute('src') || '').trim();
      const canFramePreview = Boolean(sourceUrl && !/\.mpd(?:[?#].*)?$/i.test(sourceUrl));
      const previewVideo = canFramePreview ? document.createElement('video') : null;
      let previewReady = false;
      let previewBusy = false;
      let pendingTime = null;
      let seekTimer = null;
      let rafId = 0;

      const drawFrame = () => {
        if (!(canvasEl instanceof HTMLCanvasElement) || !canvasCtx || !previewVideo || !previewReady) return false;
        const vw = Number(previewVideo.videoWidth) || 0;
        const vh = Number(previewVideo.videoHeight) || 0;
        if (!vw || !vh) return false;
        const width = canvasEl.width;
        const height = canvasEl.height;
        canvasCtx.clearRect(0, 0, width, height);
        canvasCtx.drawImage(previewVideo, 0, 0, width, height);
        canvasEl.classList.remove('hidden');
        posterEl?.classList.add('hidden');
        return true;
      };

      const queuePreviewTime = (seconds) => {
        if (!previewVideo || !previewReady) return;
        pendingTime = Math.max(0, Math.min(getDuration(), Number(seconds) || 0));
        if (seekTimer) clearTimeout(seekTimer);
        seekTimer = setTimeout(() => {
          if (!previewVideo || previewBusy || pendingTime == null) return;
          const next = pendingTime;
          pendingTime = null;
          previewBusy = true;
          try {
            previewVideo.currentTime = next;
          } catch (_error) {
            previewBusy = false;
          }
        }, 55);
      };

      if (previewVideo) {
        previewVideo.preload = 'auto';
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.src = sourceUrl;
        previewVideo.addEventListener('loadedmetadata', () => {
          previewReady = true;
        });
        previewVideo.addEventListener('seeked', () => {
          previewBusy = false;
          drawFrame();
          if (pendingTime != null) queuePreviewTime(pendingTime);
        });
        previewVideo.addEventListener('error', () => {
          previewBusy = false;
        });
      }

      const updateBubble = (ratio, seconds) => {
        const rect = seekEl.getBoundingClientRect();
        const clampedRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
        const x = rect.width * clampedRatio;
        bubble.style.left = `${x}px`;
        bubble.style.top = '';
        bubble.style.bottom = 'calc(100% + 12px)';
        if (timeEl) timeEl.textContent = toClock(seconds);
        bubble.classList.remove('hidden');
        hostEl.classList.add('seek-preview-active');
        queuePreviewTime(seconds);
      };

      const hideBubble = () => {
        bubble.classList.add('hidden');
        hostEl.classList.remove('seek-preview-active');
      };

      const ratioFromPointer = (event) => {
        const rect = seekEl.getBoundingClientRect();
        if (!rect.width) return 0;
        return (event.clientX - rect.left) / rect.width;
      };

      const onPointerMove = (event) => {
        const ratio = ratioFromPointer(event);
        const duration = getDuration();
        const seconds = duration > 0 ? Math.max(0, Math.min(duration, ratio * duration)) : 0;
        updateBubble(ratio, seconds);
      };

      const onPointerLeave = () => hideBubble();
      const onFocus = () => {
        const duration = getDuration();
        const ratio = ratioFromValue();
        const seconds = duration > 0 ? Math.max(0, Math.min(duration, ratio * duration)) : 0;
        updateBubble(ratio, seconds);
      };
      const onBlur = () => hideBubble();
      const onInput = () => {
        const duration = getDuration();
        const ratio = ratioFromValue();
        const seconds = duration > 0 ? frameToSeconds(Number(seekEl.value || 0)) : 0;
        updateBubble(ratio, seconds);
      };

      seekEl.addEventListener('pointermove', onPointerMove);
      seekEl.addEventListener('pointerleave', onPointerLeave);
      seekEl.addEventListener('focus', onFocus);
      seekEl.addEventListener('blur', onBlur);
      seekEl.addEventListener('input', onInput);

      return {
        destroy() {
          if (rafId) cancelAnimationFrame(rafId);
          if (seekTimer) clearTimeout(seekTimer);
          seekEl.removeEventListener('pointermove', onPointerMove);
          seekEl.removeEventListener('pointerleave', onPointerLeave);
          seekEl.removeEventListener('focus', onFocus);
          seekEl.removeEventListener('blur', onBlur);
          seekEl.removeEventListener('input', onInput);
          if (previewVideo) {
            previewVideo.removeAttribute('src');
            try { previewVideo.load(); } catch (_error) {}
          }
          bubble.remove();
        }
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
        root.classList.toggle('detail-video-show-overlay-controls', Boolean(show && detailVideoPinnedRef.get()));
      };

      const applyPinUi = () => {
        const pinned = detailVideoPinnedRef.get();
        root.classList.toggle('detail-video-pinned', pinned);
        if (!pinned) showPinnedOverlayControls(false);
        pinBtn.classList.toggle('active', pinned);
        const label = pinned ? t('unpin_video') : t('pin_video');
        pinBtn.title = label;
        pinBtn.setAttribute('aria-label', label);
        pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        if (mediaEl && customLikeMode) {
          mediaEl.removeAttribute('controls');
        }
      };

      const onPinToggle = () => {
        const next = !detailVideoPinnedRef.get();
        detailVideoPinnedRef.set(next);
        localStorage.setItem('mam.detailVideoPinned', next ? '1' : '0');
        applyPinUi();
      };

      const onPinnedMouseMove = (event) => {
        if (!detailVideoPinnedRef.get() || !videoMainCol) return;
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
        if (detailVideoPinnedRef.get()) showPinnedOverlayControls(true);
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
      const ratioFromValue = () => {
        if (maxFrame <= 0) return 0;
        return Math.max(0, Math.min(1, Number(seek.value || 0) / maxFrame));
      };

      const seekPreview = buildSeekPreviewController({
        mediaEl,
        seekEl: seek,
        hostEl: seek.parentElement || bar,
        toClock,
        frameToSeconds,
        getDuration,
        ratioFromValue
      });

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
        seekPreview.destroy();
      };
    }

    return {
      initDetailVideoPin,
      initCustomVideoControls
    };
  }

  global.createMainPlayerUiModule = createMainPlayerUiModule;
})(window);
