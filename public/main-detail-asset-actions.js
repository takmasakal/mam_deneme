(function attachMainDetailAssetActions(global) {
  function createMainDetailAssetActions(deps = {}) {
    const {
      api,
      t,
      serializeForm,
      extractDcMetadataFromPayload,
      readFileAsBase64,
      refreshAssetDetail,
      onPermanentDeleteSuccess,
      canEditMetadata,
      canEditOffice,
      canUsePdfAdvancedTools,
      canDeleteAsset,
      documentRef = global.document,
      confirmAction = global.confirm?.bind(global),
      alertError = global.alert?.bind(global)
    } = deps;
    const activeBindings = new WeakMap();

    function triggerDownload(url) {
      const sourceUrl = String(url || '').trim();
      if (!sourceUrl) return;
      const link = documentRef.createElement('a');
      link.href = sourceUrl;
      link.setAttribute('download', '');
      link.rel = 'noreferrer';
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
    }

    function canEditAssetMetadata(asset) {
      return Boolean(canEditMetadata() || (asset?.canEditAssetMetadata ?? asset?.canEditAsset));
    }

    function canEditAssetOffice(asset) {
      return Boolean(canEditOffice() || (asset?.canEditAssetOffice ?? asset?.canEditAsset));
    }

    function canEditAssetPdf(asset) {
      return Boolean(canUsePdfAdvancedTools() || (asset?.canEditAssetPdf ?? asset?.canEditAsset));
    }

    async function refresh(asset, workflow) {
      await refreshAssetDetail(asset.id, workflow);
    }

    async function handleSubmit(event, asset, workflow) {
      const form = event.target;
      const formId = String(form?.id || '');
      if (!['editForm', 'assetVisibilityForm', 'transitionForm', 'versionForm'].includes(formId)) return;
      event.preventDefault();

      if (formId === 'editForm') {
        if (!canEditAssetMetadata(asset)) {
          alertError(t('metadata_edit_locked'));
          return;
        }
        const saveButton = form.querySelector('button[type="submit"]');
        if (saveButton) saveButton.disabled = true;
        try {
          const payload = serializeForm(form);
          payload.dcMetadata = extractDcMetadataFromPayload(payload);
          await api(`/api/assets/${asset.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
          await refresh(asset, workflow);
        } catch (error) {
          alertError(String(error?.message || t('metadata_save_failed')));
        } finally {
          if (saveButton) saveButton.disabled = false;
        }
        return;
      }

      if (formId === 'assetVisibilityForm') {
        const saveButton = form.querySelector('button[type="submit"]');
        const parseList = (value) => String(value || '')
          .split(/[,\n]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (saveButton) saveButton.disabled = true;
        try {
          const payload = serializeForm(form);
          [
            'allowedGroups',
            'allowedUsers',
            'deniedGroups',
            'deniedUsers',
            'editAllowedGroups',
            'editAllowedUsers',
            'editDeniedGroups',
            'editDeniedUsers'
          ].forEach((key) => {
            payload[key] = parseList(payload[key]);
          });
          await api(`/api/assets/${asset.id}/visibility`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
          await refresh(asset, workflow);
        } catch (error) {
          alertError(String(error?.message || t('visibility_save_failed')));
        } finally {
          if (saveButton) saveButton.disabled = false;
        }
        return;
      }

      if (formId === 'transitionForm') {
        await api(`/api/assets/${asset.id}/transition`, {
          method: 'POST',
          body: JSON.stringify(serializeForm(form))
        });
        await refresh(asset, workflow);
        return;
      }

      const payload = serializeForm(form);
      const versionFile = form.elements?.versionFile?.files?.[0];
      if (versionFile) {
        payload.fileName = versionFile.name;
        payload.mimeType = versionFile.type || 'application/octet-stream';
        payload.fileData = await readFileAsBase64(versionFile);
      }
      await api(`/api/assets/${asset.id}/versions`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await refresh(asset, workflow);
    }

    async function handleClick(event, asset, workflow) {
      const target = event.target?.closest ? event.target : event.target?.parentElement;
      const button = target?.closest?.(
        '#ensureProxyBtn, #restorePdfOriginalBtn, #downloadPdfOriginalBtn, '
        + '#restoreOfficeOriginalBtn, #downloadOfficeOriginalBtn, #downloadAssetBtn, '
        + '#downloadProxyBtn, #moveToTrashBtn, #restoreAssetBtn, #deleteAssetBtn'
      );
      if (!button) return;
      event.preventDefault();

      if (button.id === 'ensureProxyBtn') {
        try {
          await api(`/api/assets/${asset.id}/ensure-proxy`, { method: 'POST', body: '{}' });
          await refresh(asset, workflow);
        } catch (error) {
          alertError(String(error?.message || t('proxy_failed')));
        }
        return;
      }

      if (button.id === 'restorePdfOriginalBtn') {
        if (!canEditAssetPdf(asset) || !confirmAction(t('restore_pdf_original_confirm'))) return;
        await api(`/api/assets/${asset.id}/pdf-restore-original`, { method: 'POST', body: '{}' });
        await refresh(asset, workflow);
        return;
      }

      if (button.id === 'downloadPdfOriginalBtn') {
        if (asset.canDownloadAsset === false || !canEditAssetPdf(asset)) return;
        triggerDownload(`/api/assets/${encodeURIComponent(asset.id)}/pdf-original/download`);
        return;
      }

      if (button.id === 'restoreOfficeOriginalBtn') {
        if (!canEditAssetOffice(asset) || !confirmAction(t('restore_office_original_confirm'))) return;
        await api(`/api/assets/${asset.id}/office-restore-original`, { method: 'POST', body: '{}' });
        await refresh(asset, workflow);
        return;
      }

      if (button.id === 'downloadOfficeOriginalBtn') {
        if (asset.canDownloadAsset === false || !canEditAssetOffice(asset)) return;
        triggerDownload(`/api/assets/${encodeURIComponent(asset.id)}/office-original/download`);
        return;
      }

      if (button.id === 'downloadAssetBtn') {
        if (asset.canDownloadAsset === false) return;
        const sourceUrl = String(asset.mediaUrl || '').trim();
        if (sourceUrl) triggerDownload(`${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}download=1`);
        return;
      }

      if (button.id === 'downloadProxyBtn') {
        if (asset.canDownloadAsset === false) return;
        const sourceUrl = String(asset.proxyUrl || '').trim();
        if (sourceUrl) triggerDownload(`${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}download=1`);
        return;
      }

      if (!canDeleteAsset(asset)) return;

      if (button.id === 'moveToTrashBtn') {
        if (!confirmAction(t('move_to_trash_confirm'))) return;
        await api(`/api/assets/${encodeURIComponent(asset.id)}/trash`, { method: 'POST', body: '{}' });
        await refresh(asset, workflow);
        return;
      }

      if (button.id === 'restoreAssetBtn') {
        await api(`/api/assets/${encodeURIComponent(asset.id)}/restore`, { method: 'POST', body: '{}' });
        await refresh(asset, workflow);
        return;
      }

      if (!confirmAction(t('trash_confirm'))) return;
      await api(`/api/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
      await onPermanentDeleteSuccess(asset.id);
    }

    function bind(root, context = {}) {
      if (!root) return () => {};
      activeBindings.get(root)?.();
      const { asset, workflow } = context;
      const onSubmit = (event) => handleSubmit(event, asset, workflow);
      const onClick = (event) => handleClick(event, asset, workflow);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('click', onClick);
      const cleanup = () => {
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('click', onClick);
        if (activeBindings.get(root) === cleanup) activeBindings.delete(root);
      };
      activeBindings.set(root, cleanup);
      return cleanup;
    }

    return { bind };
  }

  global.createMainDetailAssetActions = createMainDetailAssetActions;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainDetailAssetActions };
  }
})(typeof window !== 'undefined' ? window : globalThis);
