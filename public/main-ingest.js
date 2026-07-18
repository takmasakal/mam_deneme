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
      showShortcutToast,
      currentAssetsRef,
      loadAssets
    } = deps || {};
    let uploadInProgress = false;

    function setUploadInProgress(value) {
      uploadInProgress = Boolean(value);
      global.mamUploadInProgress = uploadInProgress;
    }

    function protectUploadNavigation() {
      document.addEventListener('click', (event) => {
        if (!uploadInProgress) return;
        const target = event.target;
        const link = target && typeof target.closest === 'function'
          ? target.closest('#adminMenuLink')
          : null;
        if (!link) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        notifyUpload(t('upload_navigation_warning'), 'info');
      }, true);
      window.addEventListener('beforeunload', (event) => {
        if (!uploadInProgress) return;
        event.preventDefault();
        event.returnValue = '';
      });
    }

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
        const file = payload?.file instanceof File ? payload.file : null;
        let requestBody = payload;
        if (file) {
          const formData = new FormData();
          Object.entries(payload || {}).forEach(([key, value]) => {
            if (key === 'file') return;
            if (value == null) return;
            formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
          });
          formData.append('mediaFile', file, file.name);
          requestBody = formData;
        } else {
          xhr.setRequestHeader('Content-Type', 'application/json');
          requestBody = JSON.stringify(payload);
        }

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

        xhr.send(requestBody);
      });
    }

    function notifyUpload(message, type = 'info') {
      const text = String(message || '').trim();
      if (!text) return;
      if (typeof showShortcutToast === 'function') {
        showShortcutToast(text, { type, durationMs: 4000 });
      } else {
        alert(text);
      }
    }

    function localizeUploadError(error) {
      const code = String(error?.code || '').trim();
      if (code === 'asset_type_upload_forbidden') return t('asset_type_upload_forbidden');
      return String(error?.message || 'Upload failed');
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

    function resetIngestFormType() {
      const typeSelect = ingestForm?.querySelector?.('[name="type"]');
      const firstEnabledType = Array.from(typeSelect?.options || []).find((option) => !option.disabled && !option.hidden);
      if (typeSelect && firstEnabledType) typeSelect.value = firstEnabledType.value;
    }

    function resetIngestFormAfterBackgroundStart() {
      ingestForm?.reset();
      resetIngestFormType();
      if (mediaFileName) mediaFileName.textContent = '';
    }

    function initIngestHandlers() {
      protectUploadNavigation();
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

        if (!(mediaFile instanceof File)) {
          alert(t('select_media_first'));
          return;
        }
        if (!mediaFile.size) {
          alert(t('upload_empty_file'));
          return;
        }

        const payloadBase = {
          title: formData.get('title'),
          type: formData.get('type'),
          tags: formData.get('tags'),
          description: formData.get('description'),
          fileName: mediaFile.name,
          mimeType: mediaFile.type || 'application/octet-stream',
          generateMetadata: formData.get('generateMetadata') === 'on'
        };
        payloadBase.dcMetadata = {
          title: String(payloadBase.title || ''),
          subject: String(payloadBase.tags || ''),
          description: String(payloadBase.description || ''),
          type: String(payloadBase.type || ''),
          format: String(payloadBase.mimeType || ''),
          identifier: String(payloadBase.fileName || '')
        };

        resetIngestFormAfterBackgroundStart();
        notifyUpload(t('upload_background_started'));
        setUploadInProgress(true);

        void (async () => {
          setUploadProgress(1, t('uploading'));
          const payload = { ...payloadBase, file: mediaFile };
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
          const uploadedTitle = String(created?.title || payloadBase.title || mediaFile.name || '').trim();
          notifyUpload(uploadedTitle ? `${t('asset_uploaded')}: ${uploadedTitle}` : t('asset_uploaded'), 'success');
          await waitUntilAssetVisible(created?.id || null);
          setUploadProgress(100, t('processing'));
          const warningMessage = formatIngestWarningMessage(created);
          if (warningMessage) alert(warningMessage);
        })().catch((error) => {
          console.error('Background asset upload failed', error);
          notifyUpload(`${t('upload_failed')}: ${localizeUploadError(error)}`, 'error');
        }).finally(() => {
          setUploadInProgress(false);
          setTimeout(() => hideUploadProgress(), 450);
        });
      });
    }

    return {
      setUploadProgress,
      hideUploadProgress,
      uploadAssetWithProgress,
      notifyUpload,
      localizeUploadError,
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
