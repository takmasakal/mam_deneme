(function attachMainDetailVersionActions(global) {
  function createMainDetailVersionActions(deps = {}) {
    const {
      api,
      fetchImpl = global.fetch?.bind(global),
      t,
      cleanVersionNoteText,
      openVersionDeleteDialog,
      openVersionEditDialog,
      loadAssets,
      refreshAssetDetail,
      currentLang,
      canUsePdfAdvancedTools,
      selectedImageVersionIds,
      assetDetail,
      documentRef = global.document,
      confirmAction = global.confirm?.bind(global),
      alertError = global.alert?.bind(global),
      handleSessionResponse = (status, text, payload) => global.mamSessionExpiry?.handle(status, text, payload)
    } = deps;

    function getVersionId(element) {
      return String(element?.dataset?.versionId || element?.getAttribute?.('data-version-id') || '').trim();
    }

    function canEditPdf(asset) {
      return Boolean(canUsePdfAdvancedTools() || (asset?.canEditAssetPdf ?? asset?.canEditAsset));
    }

    function downloadVersion(asset, versionId) {
      if (!versionId || asset?.canDownloadAsset === false) return;
      const link = documentRef.createElement('a');
      link.href = `/api/assets/${encodeURIComponent(asset.id)}/versions/${encodeURIComponent(versionId)}/download`;
      link.setAttribute('download', '');
      link.rel = 'noreferrer';
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
    }

    function previewVersion(asset, versionId) {
      if (!versionId) return;
      const previewUrl = `/api/assets/${encodeURIComponent(asset.id)}/versions/${encodeURIComponent(versionId)}/preview`;
      selectedImageVersionIds.set(String(asset.id), versionId);
      const image = assetDetail.querySelector('.image-asset-viewer');
      if (!image) return;
      image.src = previewUrl;
      image.dataset.versionId = versionId;
    }

    async function restorePdfVersion(asset, workflow, versionId) {
      if (!versionId || !canEditPdf(asset)) return;
      if (!confirmAction(t('restore_pdf_confirm'))) return;
      await api(`/api/assets/${asset.id}/pdf-restore`, {
        method: 'POST',
        body: JSON.stringify({ versionId })
      });
      await refreshAssetDetail(asset.id, workflow);
    }

    async function restoreOfficeVersion(asset, workflow, versionId) {
      if (!versionId || !confirmAction(t('restore_office_confirm'))) return;
      const response = await fetchImpl(`/api/assets/${encodeURIComponent(asset.id)}/office-restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ versionId })
      });
      if (!response.ok) {
        const textBody = await response.text();
        let payload = {};
        try {
          payload = textBody ? JSON.parse(textBody) : {};
        } catch (_error) {}
        handleSessionResponse(response.status, textBody, payload);
        alertError(payload.error || 'Failed to restore Office version');
        return;
      }
      await refreshAssetDetail(asset.id, workflow);
    }

    async function deleteVersion(asset, button, versionId) {
      if (!versionId || button.disabled) return;
      if (!await openVersionDeleteDialog()) return;
      const row = button.closest('.version');
      const previousLabel = String(button.textContent || '').trim() || t('delete_version');
      button.disabled = true;
      button.textContent = currentLang() === 'tr' ? 'Siliniyor...' : 'Deleting...';
      row?.classList.add('is-busy');
      try {
        await api(`/api/assets/${asset.id}/versions/${encodeURIComponent(versionId)}`, { method: 'DELETE' });
        row?.remove();
        if (Array.isArray(asset.versions)) {
          asset.versions = asset.versions.filter((version) => String(version.versionId || '') !== versionId);
        }
        loadAssets().catch(() => {});
      } catch (error) {
        button.disabled = false;
        button.textContent = previousLabel;
        row?.classList.remove('is-busy');
        alertError(String(error?.message || 'Failed to delete version'));
      }
    }

    async function editVersion(asset, button, versionId) {
      if (!versionId || button.disabled) return;
      const current = (asset.versions || []).find((version) => String(version.versionId || '') === versionId);
      const next = await openVersionEditDialog({
        label: String(current?.label || '').trim(),
        note: cleanVersionNoteText(String(current?.note || ''))
      });
      if (!next?.label) return;
      button.disabled = true;
      try {
        const updated = await api(`/api/assets/${asset.id}/versions/${encodeURIComponent(versionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: next.label, note: next.note || '' })
        });
        const updatedVersion = updated?.version || null;
        const row = button.closest('.version');
        if (updatedVersion && row) {
          const title = row.querySelector('strong');
          if (title) title.textContent = String(updatedVersion.label || '');
          const note = cleanVersionNoteText(String(updatedVersion.note || ''));
          if (title?.nextSibling) title.nextSibling.nodeValue = ` - ${note}`;
          if (Array.isArray(asset.versions)) {
            const index = asset.versions.findIndex((version) => String(version.versionId || '') === versionId);
            if (index >= 0) asset.versions[index] = { ...asset.versions[index], ...updatedVersion };
          }
        }
        button.disabled = false;
        loadAssets().catch(() => {});
      } catch (error) {
        button.disabled = false;
        alertError(String(error?.message || 'Failed to update version'));
      }
    }

    function bind(root, context = {}) {
      if (!root) return () => {};
      const { asset, workflow } = context;

      const onClick = async (event) => {
        const target = event.target?.closest ? event.target : event.target?.parentElement;
        if (!target?.closest) return;

        const actionButton = target.closest(
          '.restorePdfVersionBtn, .restoreOfficeVersionBtn, .deleteVersionBtn, '
          + '.downloadVersionBtn, .previewVersionBtn, .editVersionBtn'
        );
        if (actionButton) {
          event.preventDefault();
          event.stopPropagation();
          const versionId = getVersionId(actionButton);
          if (actionButton.matches('.restorePdfVersionBtn')) {
            await restorePdfVersion(asset, workflow, versionId);
          } else if (actionButton.matches('.restoreOfficeVersionBtn')) {
            await restoreOfficeVersion(asset, workflow, versionId);
          } else if (actionButton.matches('.deleteVersionBtn')) {
            await deleteVersion(asset, actionButton, versionId);
          } else if (actionButton.matches('.downloadVersionBtn')) {
            downloadVersion(asset, versionId);
          } else if (actionButton.matches('.previewVersionBtn')) {
            previewVersion(asset, versionId);
          } else if (actionButton.matches('.editVersionBtn')) {
            await editVersion(asset, actionButton, versionId);
          }
          return;
        }

        const row = target.closest('.version-restorable[data-restore-version-id]');
        if (!row || target.closest('button, a, input, textarea, select, label')) return;
        await restorePdfVersion(asset, workflow, String(row.dataset.restoreVersionId || '').trim());
      };

      root.addEventListener('click', onClick, true);
      return () => root.removeEventListener('click', onClick, true);
    }

    return { bind };
  }

  global.createMainDetailVersionActions = createMainDetailVersionActions;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainDetailVersionActions };
  }
})(typeof window !== 'undefined' ? window : globalThis);
