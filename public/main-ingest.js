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
      getDefaultIngestType,
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

    function getFileExt(fileName = '') {
      const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
      return match ? match[1] : '';
    }

    const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso'];
    const ARCHIVE_ACCEPT = '.zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz,.zst,.iso,.tar.gz,.tar.bz2,.tar.xz,.tar.zst';

    function getUploadFileCategory(file) {
      const mime = String(file?.type || '').toLowerCase();
      const ext = getFileExt(file?.name || '');
      if (mime.startsWith('video/') || ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpg', 'mpeg'].includes(ext)) return 'video';
      if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga'].includes(ext)) return 'audio';
      if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif'].includes(ext)) return 'photo';
      if (ARCHIVE_EXTENSIONS.includes(ext)) return 'other';
      if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'csv', 'sql', 'py', 'js', 'ts', 'tsx', 'jsx', 'json', 'md', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'swift', 'kt'].includes(ext)) return 'document';
      return 'other';
    }

    function normalizeAssetType(type) {
      const value = String(type || '').trim().toLowerCase();
      if (value === 'image') return 'photo';
      return value;
    }

    function typeLabel(type) {
      const value = normalizeAssetType(type);
      if (value === 'video') return t('type_video');
      if (value === 'audio') return t('type_audio');
      if (value === 'document') return t('type_document');
      if (value === 'photo') return t('type_photo');
      return t('type_other');
    }

    function validateSelectedFileForType(file, declaredType) {
      const expected = normalizeAssetType(declaredType);
      if (!expected || expected === 'other') return { ok: true };
      const actual = getUploadFileCategory(file);
      if (actual === expected) return { ok: true };
      return { ok: false, expected, actual };
    }

    function formatTypeMismatchMessage(expected, actual) {
      return String(t('upload_type_mismatch') || 'Selected asset type is {expected}, but the selected file looks like {actual}.')
        .replace('{expected}', typeLabel(expected))
        .replace('{actual}', typeLabel(actual));
    }

    function updateFileAcceptForType() {
      if (!mediaFileInput || !ingestForm) return;
      const typeSelect = ingestForm.querySelector('[name="type"]');
      const selected = normalizeAssetType(typeSelect?.value || '');
      const acceptByType = {
        video: 'video/*,.mp4,.mov,.m4v,.mkv,.avi,.webm,.mpg,.mpeg',
        audio: 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga',
        photo: 'image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif',
        document: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv,.sql,.py,.js,.ts,.tsx,.jsx,.json,.md,.xml,.yaml,.yml,.log,.ini,.cfg,.conf,.sh,.bash,.zsh,.java,.c,.cpp,.h,.hpp,.go,.rs,.rb,.php,.swift,.kt',
        other: `video/*,audio/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv,.sql,.py,.js,.ts,.tsx,.jsx,.json,.md,.xml,.yaml,.yml,.log,.ini,.cfg,.conf,.sh,.bash,.zsh,.java,.c,.cpp,.h,.hpp,.go,.rs,.rb,.php,.swift,.kt,${ARCHIVE_ACCEPT}`
      };
      mediaFileInput.setAttribute('accept', acceptByType[selected] || acceptByType.other);
    }

    function initIngestHandlers() {
      if (mediaFileBtn && String(mediaFileBtn.tagName || '').toLowerCase() !== 'label') {
        mediaFileBtn.addEventListener('click', () => {
          mediaFileInput?.click();
        });
      }

      updateFileAcceptForType();
      ingestForm?.querySelector('[name="type"]')?.addEventListener('change', () => {
        updateFileAcceptForType();
        const file = mediaFileInput?.files?.[0];
        const validation = validateSelectedFileForType(file, ingestForm.querySelector('[name="type"]')?.value);
        if (file && !validation.ok) {
          alert(formatTypeMismatchMessage(validation.expected, validation.actual));
          if (mediaFileInput) mediaFileInput.value = '';
          if (mediaFileName) mediaFileName.textContent = '';
        }
      });

      mediaFileInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        const validation = validateSelectedFileForType(file, ingestForm?.querySelector('[name="type"]')?.value);
        if (file && !validation.ok) {
          alert(formatTypeMismatchMessage(validation.expected, validation.actual));
          event.target.value = '';
          if (mediaFileName) mediaFileName.textContent = '';
          return;
        }
        if (mediaFileName) mediaFileName.textContent = file?.name || '';
      });

      ingestForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(ingestForm);
        const inputFile = mediaFileInput?.files?.[0];
        const formFile = formData.get('mediaFile');
        const mediaFile = inputFile || formFile;
        const submitBtn = ingestForm.querySelector('button[type="submit"]');

        if (!(mediaFile instanceof File)) {
          alert(t('select_media_first'));
          return;
        }
        if (!mediaFile.size) {
          alert(t('upload_empty_file'));
          return;
        }
        const typeValidation = validateSelectedFileForType(mediaFile, formData.get('type'));
        if (!typeValidation.ok) {
          alert(formatTypeMismatchMessage(typeValidation.expected, typeValidation.actual));
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
          ingestForm.querySelector('[name="type"]').value = typeof getDefaultIngestType === 'function'
            ? getDefaultIngestType()
            : 'Video';
          updateFileAcceptForType();
          if (mediaFileName) mediaFileName.textContent = '';
          await waitUntilAssetVisible(created?.id || null);
          setUploadProgress(100, t('processing'));
          const warningMessage = formatIngestWarningMessage(created);
          if (warningMessage) alert(warningMessage);
        } catch (error) {
          alert(localizeUploadError(error));
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
