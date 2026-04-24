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
          if (useVideoJsPlayerUI()) cleanups.push(initVideoJsPlayer(mediaEl, root));
          cleanups.push(initFrameControls(mediaEl, asset, root, options));
          if (useCustomLikeTimelineUI()) cleanups.push(initCustomVideoControls(mediaEl, root));
          cleanups.push(initVideoSubtitleTools(mediaEl, asset, root));
          cleanups.push(initVideoOcrTools(asset, root));
          cleanups.push(initCollapsibleSections(root));
          cleanups.push(initVideoToolsSorting(root));
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
