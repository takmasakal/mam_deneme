(function attachMainIngestModule(global) {
  function createMainIngestModule(deps) {
    const {
      ingestForm,
      mediaFileInput,
      mediaFileBtn,
      mediaFileName,
      uploadProgressWrap,
      uploadProgressBar,
      uploadProgressText,
      uploadProgressSpinner,
      t,
      readFileAsBase64,
      showUploadProxyDecisionModal,
      currentAssetsRef,
      loadAssets
    } = deps || {};

    function setUploadProgress(percent, label = '') {
      if (!uploadProgressWrap || !uploadProgressText) return;
      uploadProgressWrap.classList.remove('hidden');
      if (uploadProgressBar) uploadProgressBar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
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
            if (parsed && typeof parsed === 'object') Object.assign(error, parsed);
            reject(error);
          }
        };

        xhr.send(JSON.stringify(payload));
      });
    }

    function localizeUploadWarning(warning) {
      const code = String(warning?.code || '').trim();
      if (code === 'proxy_generation_failed') return t('upload_warning_proxy_generation_failed');
      if (code === 'proxy_generation_skipped') return t('upload_warning_proxy_generation_skipped');
      if (code === 'proxy_audio_fallback') return t('upload_warning_proxy_audio_fallback');
      if (code === 'thumbnail_generation_failed') return t('upload_warning_thumbnail_generation_failed');
      return String(warning?.message || '').trim();
    }

    function localizeUploadRetryHint(code, fallback = '') {
      if (code === 'proxy_generation_failed' || code === 'proxy_generation_skipped' || code === 'proxy_audio_fallback') {
        return t('upload_warning_proxy_retry_hint');
      }
      if (code === 'thumbnail_generation_failed') return t('upload_warning_thumbnail_retry_hint');
      return String(fallback || '').trim();
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

    async function waitUntilAssetVisible(assetId, maxAttempts = 8) {
      if (!assetId) {
        await loadAssets();
        return true;
      }
      for (let i = 0; i < maxAttempts; i += 1) {
        await loadAssets();
        if ((currentAssetsRef?.get?.() || []).some((asset) => asset.id === assetId)) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    }

    async function detectDurationSeconds(file) {
      const type = String(file?.type || '').toLowerCase();
      if (!(type.startsWith('video/') || type.startsWith('audio/'))) return 0;
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

    function initIngestHandlers() {
      if (mediaFileBtn && String(mediaFileBtn.tagName || '').toLowerCase() !== 'label') {
        mediaFileBtn.addEventListener('click', () => {
          mediaFileInput?.click();
        });
      }

      mediaFileInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (mediaFileName) mediaFileName.textContent = file?.name || '';
      });

      ingestForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(ingestForm);
        const inputFile = mediaFileInput?.files?.[0];
        const formFile = formData.get('mediaFile');
        const mediaFile = inputFile || formFile;
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
          if (warningMessage) alert(warningMessage);
        } catch (error) {
          alert(String(error?.message || 'Upload failed'));
        } finally {
          if (submitBtn) submitBtn.disabled = false;
          setTimeout(() => hideUploadProgress(), 450);
        }
      });
    }

    return {
      setUploadProgress,
      hideUploadProgress,
      uploadAssetWithProgress,
      localizeUploadWarning,
      localizeUploadRetryHint,
      formatIngestWarningMessage,
      waitUntilAssetVisible,
      detectDurationSeconds,
      initIngestHandlers
    };
  }

  global.createMainIngestModule = createMainIngestModule;
})(window);
