(function attachMainDialogsModule(global) {
  function createMainDialogsModule(deps) {
    const {
      t,
      escapeHtml
    } = deps || {};

function showUploadProxyDecisionModal(error) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    const detail = t('upload_proxy_confirm_detail');
    // Basit confirm yerine üç farklı sonucu net ayıran özel modal kullanıyoruz.
    backdrop.className = 'clip-modal-backdrop';
    backdrop.innerHTML = `
      <div class="clip-modal upload-decision-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('upload_proxy_confirm_title'))}">
        <h4>${escapeHtml(t('upload_proxy_confirm_title'))}</h4>
        <div class="upload-decision-copy">
          <p>${escapeHtml(detail)}</p>
          <p>${escapeHtml(t('upload_proxy_confirm_message'))}</p>
        </div>
        <div class="clip-modal-actions upload-decision-actions">
          <button type="button" class="upload-decision-primary" data-choice="silent">${escapeHtml(t('upload_proxy_confirm_silent'))}</button>
          <button type="button" class="upload-decision-secondary" data-choice="metadata">${escapeHtml(t('upload_proxy_confirm_metadata_only'))}</button>
          <button type="button" class="upload-decision-cancel" data-choice="cancel">${escapeHtml(t('upload_proxy_confirm_cancel'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = (choice) => {
      backdrop.remove();
      resolve(choice);
    };

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close('cancel');
    });
    backdrop.querySelectorAll('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => close(String(button.dataset.choice || 'cancel')));
    });
  });
}

function openClipEditorDialog(initial) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('clip_editor_title'))}">
        <h4>${escapeHtml(t('clip_editor_title'))}</h4>
        <label>${escapeHtml(t('clip_editor_name'))}
          <input id="clipEditorName" type="text" value="${escapeHtml(initial.label || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_in'))}
          <input id="clipEditorIn" type="text" value="${escapeHtml(initial.inTc || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_out'))}
          <input id="clipEditorOut" type="text" value="${escapeHtml(initial.outTc || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="clipEditorCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="clipEditorSave">${escapeHtml(t('clip_editor_save'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector('#clipEditorName');
    const inInput = overlay.querySelector('#clipEditorIn');
    const outInput = overlay.querySelector('#clipEditorOut');
    overlay.querySelector('#clipEditorCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#clipEditorSave')?.addEventListener('click', () => {
      close({
        label: String(nameInput?.value || '').trim(),
        inTc: String(inInput?.value || '').trim(),
        outTc: String(outInput?.value || '').trim()
      });
    });
    nameInput?.focus();
  });
}

function openVersionEditDialog(initial) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('edit_version_name'))}">
        <h4>${escapeHtml(t('edit_version_name'))}</h4>
        <label>${escapeHtml(t('edit_version_name_prompt'))}
          <input id="versionEditorName" type="text" value="${escapeHtml(initial.label || '')}" />
        </label>
        <label>${escapeHtml(t('edit_version_note_prompt'))}
          <input id="versionEditorNote" type="text" value="${escapeHtml(initial.note || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="versionEditorCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="versionEditorSave">${escapeHtml(t('clip_editor_save'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector('#versionEditorName');
    const noteInput = overlay.querySelector('#versionEditorNote');
    overlay.querySelector('#versionEditorCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#versionEditorSave')?.addEventListener('click', () => {
      close({
        label: String(nameInput?.value || '').trim(),
        note: String(noteInput?.value || '').trim()
      });
    });
    nameInput?.focus();
    nameInput?.select?.();
  });
}

function openVersionDeleteDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('delete_version'))}">
        <h4>${escapeHtml(t('delete_version'))}</h4>
        <p>${escapeHtml(t('delete_version_confirm'))}</p>
        <div class="clip-modal-actions">
          <button type="button" id="versionDeleteCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="versionDeleteConfirm" class="danger">${escapeHtml(t('delete_version'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
    overlay.querySelector('#versionDeleteCancel')?.addEventListener('click', () => close(false));
    overlay.querySelector('#versionDeleteConfirm')?.addEventListener('click', () => close(true));
  });
}

function openTimecodeJumpDialog(initialTc = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('tc'))}">
        <h4>${escapeHtml(t('tc'))}</h4>
        <label>${escapeHtml(t('tc'))}
          <input id="timecodeJumpInput" type="text" value="${escapeHtml(initialTc || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="timecodeJumpCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="timecodeJumpGo">${escapeHtml(t('jump_to_cut'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#timecodeJumpInput');
    overlay.querySelector('#timecodeJumpCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#timecodeJumpGo')?.addEventListener('click', () => close(String(input?.value || '').trim()));
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        close(String(input?.value || '').trim());
      }
    });
    input?.focus();
    input?.select?.();
  });
}

    return {
      showUploadProxyDecisionModal,
      openClipEditorDialog,
      openVersionEditDialog,
      openVersionDeleteDialog,
      openTimecodeJumpDialog
    };
  }

  global.createMainDialogsModule = createMainDialogsModule;
})(window);
