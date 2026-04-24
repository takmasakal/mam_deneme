(function attachMainPlayerUiModule(global) {
  function createMainPlayerUiModule(deps) {
    const {
      t,
      useCustomLikeTimelineUI,
      detailVideoPinnedRef,
      PLAYER_FPS
    } = deps || {};

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

    return {
      initDetailVideoPin,
      initCustomVideoControls
    };
  }

  global.createMainPlayerUiModule = createMainPlayerUiModule;
})(window);
