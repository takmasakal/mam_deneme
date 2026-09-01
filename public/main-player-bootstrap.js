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
      showShortcutToast
    } = deps || {};

    function initAssetPlayer(asset, root = document, options = {}) {
      const mediaEl = root.querySelector('#assetMediaEl');
      const cleanups = [];
      if (mediaEl) {
        mediaEl.muted = false;
        if (!Number.isFinite(mediaEl.volume) || mediaEl.volume <= 0) mediaEl.volume = 1;
        if (isVideo(asset)) {
          let refreshingAsset = false;
          const onVideoError = async () => {
            if (refreshingAsset) return;
            refreshingAsset = true;
            try {
              const refreshed = await api(`/api/assets/${asset.id}`);
              const nextProxyUrl = String(refreshed?.proxyUrl || '').trim();
              const currentUrl = String(mediaEl.currentSrc || mediaEl.src || '').split('?')[0];
              if (nextProxyUrl && nextProxyUrl !== currentUrl) {
                mediaEl.src = `${nextProxyUrl}${nextProxyUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
                mediaEl.load();
              }
            } catch (_error) {
            } finally {
              refreshingAsset = false;
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
        if (isAudio(asset)) {
          cleanups.push(initFrameControls(mediaEl, asset, root, options));
          cleanups.push(initCustomVideoControls(mediaEl, root));
          cleanups.push(initVideoSubtitleTools(mediaEl, asset, root));
          if (typeof initCustomSubtitleOverlay === 'function') {
            cleanups.push(initCustomSubtitleOverlay(mediaEl, asset, root));
          }
          cleanups.push(initCollapsibleSections(root));
          cleanups.push(initVideoToolsSorting(root));
          if (!root.querySelector('#markSummary')) {
            const onAudioSubtitleShortcut = (event) => {
              if (event.key !== 'A' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
              const target = event.target;
              if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
              const nextEnabled = !getSubtitleOverlayEnabled(asset.id, false);
              setSubtitleOverlayEnabled(asset.id, nextEnabled);
              syncSubtitleOverlayInOpenPlayers(asset);
              showShortcutToast?.(nextEnabled ? t('subtitle_shortcut_on') : t('subtitle_shortcut_off'), {
                type: nextEnabled ? 'success' : 'error'
              });
              event.preventDefault();
              event.stopPropagation();
            };
            document.addEventListener('keydown', onAudioSubtitleShortcut);
            cleanups.push(() => document.removeEventListener('keydown', onAudioSubtitleShortcut));
          }
        }
        if (isVideo(asset) || isAudio(asset)) {
          cleanups.push(initAudioTools(mediaEl, root));
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
      overlay.className = 'clip-modal-backdrop video-tools-backdrop';
      overlay.innerHTML = `
        <div class="clip-modal video-tools-modal video-tools-modal-large" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('video_tools_title'))}">
          <div class="video-tools-modal-head">
            <h4>${t('video_tools_title')}</h4>
            <button type="button" id="videoToolsCloseBtn">${t('close')}</button>
          </div>
          <div class="video-tools-modal-body">
            ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: true, includeSectionHide: true, audioSideLayout: true, tcInControlBar: true })}
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
