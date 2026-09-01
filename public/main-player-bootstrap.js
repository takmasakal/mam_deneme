(function attachMainPlayerBootstrapModule(global) {
  function createMainPlayerBootstrapModule(deps) {
    const {
      api,
      t,
      escapeHtml,
      mediaViewer,
      isVideo,
      isAudio,
      useMpegDashPlayerUI,
      useCustomLikeTimelineUI,
      initMpegDashPlayer,
      initFrameControls,
      initCustomVideoControls,
      initVideoSubtitleTools,
      initVideoOcrTools,
      initCollapsibleSections,
      initVideoToolsSorting,
      initAudioTools,
      initCustomSubtitleOverlay,
      getSubtitleOverlayEnabled,
      setSubtitleOverlayEnabled,
      syncSubtitleOverlayInOpenPlayers,
      showShortcutToast,
      adjustSubtitleFontSize,
      getSubtitleFontSize
    } = deps || {};

    function initAssetPlayer(asset, root = document, options = {}) {
      const mediaEl = root.querySelector('#assetMediaEl');
      const cleanups = [];
      if (mediaEl) {
        mediaEl.muted = false;
        if (!Number.isFinite(mediaEl.volume) || mediaEl.volume <= 0) mediaEl.volume = 1;
        if (isVideo(asset)) {
          let recoveringProxy = false;
          const onVideoError = async () => {
            if (recoveringProxy) return;
            recoveringProxy = true;
            try {
              const refreshed = await api(`/api/assets/${asset.id}/ensure-proxy`, { method: 'POST', body: JSON.stringify({ force: true }) });
              if (refreshed.proxyUrl) {
                mediaEl.src = `${refreshed.proxyUrl}${refreshed.proxyUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
                mediaEl.load();
                mediaEl.play().catch(() => {});
              }
            } catch (_error) {
            } finally {
              recoveringProxy = false;
            }
          };
          mediaEl.addEventListener('error', onVideoError);
          cleanups.push(() => mediaEl.removeEventListener('error', onVideoError));
        }
        if (isVideo(asset)) {
          if (useMpegDashPlayerUI()) cleanups.push(initMpegDashPlayer(mediaEl, asset, root));
          cleanups.push(initFrameControls(mediaEl, asset, root, options));
          if (useCustomLikeTimelineUI()) cleanups.push(initCustomVideoControls(mediaEl, root));
          cleanups.push(initVideoSubtitleTools(mediaEl, asset, root));
          if (typeof initCustomSubtitleOverlay === 'function') {
            cleanups.push(initCustomSubtitleOverlay(mediaEl, asset, root));
          }
          cleanups.push(initVideoOcrTools(asset, root));
          cleanups.push(initCollapsibleSections(root));
          cleanups.push(initVideoToolsSorting(root));
        }
        if (isVideo(asset) || isAudio(asset)) {
          cleanups.push(initAudioTools(mediaEl, root));
        }
        if (isAudio(asset)) {
          cleanups.push(initFrameControls(mediaEl, asset, root, options));
          cleanups.push(initCustomVideoControls(mediaEl, root));
          cleanups.push(initVideoSubtitleTools(mediaEl, asset, root));
          cleanups.push(initCollapsibleSections(root));
          cleanups.push(initVideoToolsSorting(root));
          if (typeof initCustomSubtitleOverlay === 'function') {
            cleanups.push(initCustomSubtitleOverlay(mediaEl, asset, root));
          }
          const overlayCheck = root.querySelector('#subtitleOverlayCheck');
          const applySubtitleOverlay = (enabled) => {
            setSubtitleOverlayEnabled?.(asset.id, Boolean(enabled));
            syncSubtitleOverlayInOpenPlayers?.(asset);
          };
          const onOverlayChange = () => applySubtitleOverlay(overlayCheck?.checked);
          const hasFrameControls = Boolean(root.querySelector('#playBtn'));
          const onSubtitleShortcut = (event) => {
            if (event.key !== 'A' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
            if (document.querySelector('.video-tools-backdrop') && !root.closest?.('.video-tools-backdrop')) return;
            const target = event.target;
            if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
            const next = !getSubtitleOverlayEnabled?.(asset.id, false);
            if (overlayCheck) overlayCheck.checked = next;
            applySubtitleOverlay(next);
            showShortcutToast?.(next ? t('subtitle_shortcut_on') : t('subtitle_shortcut_off'), {
              type: next ? 'success' : 'error'
            });
            event.preventDefault();
          };
          overlayCheck?.addEventListener('change', onOverlayChange);
          if (!hasFrameControls) document.addEventListener('keydown', onSubtitleShortcut);
          cleanups.push(() => {
            overlayCheck?.removeEventListener('change', onOverlayChange);
            if (!hasFrameControls) document.removeEventListener('keydown', onSubtitleShortcut);
          });
          const audioToolsBtn = root.querySelector('#audioToolsBtn');
          const onAudioTools = () => openVideoToolsDialog(asset, { startAtSeconds: Number(mediaEl.currentTime) || 0 });
          audioToolsBtn?.addEventListener('click', onAudioTools);
          cleanups.push(() => audioToolsBtn?.removeEventListener('click', onAudioTools));
          const sizeDownBtn = root.querySelector('#audioSubtitleSizeDownBtn');
          const sizeUpBtn = root.querySelector('#audioSubtitleSizeUpBtn');
          const sizeValue = root.querySelector('#audioSubtitleSizeValue');
          const syncSizeValue = () => {
            if (sizeValue) sizeValue.textContent = `${Number(getSubtitleFontSize?.() || 24)}px`;
          };
          const onSizeDown = () => { adjustSubtitleFontSize?.(-2, asset); syncSizeValue(); };
          const onSizeUp = () => { adjustSubtitleFontSize?.(2, asset); syncSizeValue(); };
          sizeDownBtn?.addEventListener('click', onSizeDown);
          sizeUpBtn?.addEventListener('click', onSizeUp);
          syncSizeValue();
          cleanups.push(() => {
            sizeDownBtn?.removeEventListener('click', onSizeDown);
            sizeUpBtn?.removeEventListener('click', onSizeUp);
          });
        }
        const startAt = Math.max(0, Number(options.startAtSeconds) || 0);
        if (startAt > 0) {
          const seekToStart = () => {
            try {
              mediaEl.currentTime = Math.min(startAt, Number.isFinite(mediaEl.duration) ? mediaEl.duration : startAt);
            } catch (_error) {
            }
          };
          if (mediaEl.readyState >= 1) {
            seekToStart();
          } else {
            mediaEl.addEventListener('loadedmetadata', seekToStart, { once: true });
            cleanups.push(() => mediaEl.removeEventListener('loadedmetadata', seekToStart));
          }
        }
      }

      return () => {
        cleanups.forEach((cleanup) => cleanup());
      };
    }

    function openVideoToolsDialog(asset, options = {}) {
      if (asset?.id && asset?.subtitleUrl && typeof getSubtitleOverlayEnabled === 'function' && typeof setSubtitleOverlayEnabled === 'function') {
        setSubtitleOverlayEnabled(asset.id, getSubtitleOverlayEnabled(asset.id, false));
      }
      const overlay = document.createElement('div');
      const toolsTitle = isAudio(asset) ? t('audio_tools_title') : t('video_tools_title');
      overlay.className = 'clip-modal-backdrop video-tools-backdrop';
      overlay.innerHTML = `
        <div class="clip-modal video-tools-modal video-tools-modal-large" role="dialog" aria-modal="true" aria-label="${escapeHtml(toolsTitle)}">
          <div class="video-tools-modal-head">
            <h4>${escapeHtml(toolsTitle)}</h4>
            <button type="button" id="videoToolsCloseBtn">${t('close')}</button>
          </div>
          <div class="video-tools-modal-body">
            ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: true, includeSectionHide: true, audioSideLayout: true, tcInControlBar: true, audioToolsMode: isAudio(asset) })}
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      const cleanup = initAssetPlayer(asset, overlay, {
        startAtSeconds: Number(options.startAtSeconds) || 0
      });
      const overlayCheck = overlay.querySelector('#subtitleOverlayCheck');
      if (overlayCheck && asset?.id) overlayCheck.checked = Boolean(getSubtitleOverlayEnabled?.(asset.id, false));
      syncSubtitleOverlayInOpenPlayers?.(asset);
      const close = () => {
        cleanup?.();
        overlay.remove();
      };
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      overlay.querySelector('#videoToolsCloseBtn')?.addEventListener('click', close);
    }

    return {
      initAssetPlayer,
      openVideoToolsDialog
    };
  }

  global.createMainPlayerBootstrapModule = createMainPlayerBootstrapModule;
})(window);
