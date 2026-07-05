(function attachMainAccessScopeModule(global) {
  function isDocumentScopedPrincipalList() {
    return false;
  }

  const INGEST_TYPE_VALUE_BY_GROUP = {
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    photo: 'Photo',
    other: 'Other'
  };

  function normalizeAssetTypeGroup(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'image') return 'photo';
    if (['video', 'audio', 'document', 'photo', 'other'].includes(normalized)) return normalized;
    return '';
  }

  function normalizeAllowedAssetTypes(values = []) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeAssetTypeGroup)
        .filter(Boolean)
    ));
  }

  function getDefaultIngestType({ allowedAssetTypes = null } = {}) {
    const hasExplicitAllowedTypes = Array.isArray(allowedAssetTypes);
    const normalizedAllowed = normalizeAllowedAssetTypes(allowedAssetTypes);
    const allowedTypes = hasExplicitAllowedTypes
      ? normalizedAllowed
      : ['video', 'audio', 'document', 'photo', 'other'];
    return INGEST_TYPE_VALUE_BY_GROUP[allowedTypes[0]] || '';
  }

  function applyAssetTypeScope({ allowedAssetTypes = null, uploadAllowedAssetTypes = null, ingestForm = null, assetTypeFilters = [] } = {}) {
    const hasExplicitAllowedTypes = Array.isArray(allowedAssetTypes);
    const normalizedAllowed = normalizeAllowedAssetTypes(allowedAssetTypes);
    const allowedTypes = hasExplicitAllowedTypes
      ? new Set(normalizedAllowed)
      : null;
    const hasExplicitUploadAllowedTypes = Array.isArray(uploadAllowedAssetTypes);
    const normalizedUploadAllowed = normalizeAllowedAssetTypes(uploadAllowedAssetTypes);
    const uploadAllowedTypes = hasExplicitUploadAllowedTypes
      ? new Set(normalizedUploadAllowed)
      : allowedTypes;
    const typeSelect = ingestForm?.querySelector?.('[name="type"]');
    if (typeSelect) {
      if (!typeSelect.__mamOriginalTypeOptions) {
        typeSelect.__mamOriginalTypeOptions = Array.from(typeSelect.options || []).map((option) => ({
          value: String(option.value || ''),
          text: String(option.textContent || option.value || ''),
          i18n: String(option.getAttribute('data-i18n') || '')
        }));
      }
      const selected = String(typeSelect.value || '').trim().toLowerCase();
      const originalOptions = Array.isArray(typeSelect.__mamOriginalTypeOptions)
        ? typeSelect.__mamOriginalTypeOptions
        : [];
      typeSelect.innerHTML = '';
      originalOptions.forEach((item) => {
        const normalized = normalizeAssetTypeGroup(item.value);
        const allowed = !uploadAllowedTypes || uploadAllowedTypes.has(normalized);
        if (!allowed) return;
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.text;
        if (item.i18n) option.setAttribute('data-i18n', item.i18n);
        typeSelect.appendChild(option);
      });
      if (typeSelect.options.length && (!uploadAllowedTypes || uploadAllowedTypes.has(selected))) {
        const existing = Array.from(typeSelect.options).find((option) => String(option.value || '').trim().toLowerCase() === selected);
        if (existing) typeSelect.value = existing.value;
      } else if (typeSelect.options.length) {
        typeSelect.value = typeSelect.options[0].value;
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        typeSelect.value = '';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    (Array.isArray(assetTypeFilters) ? assetTypeFilters : []).forEach((input) => {
      const normalized = String(input.value || '').trim().toLowerCase();
      const allowed = !allowedTypes || allowedTypes.has(normalized);
      input.checked = allowed ? input.checked : false;
      input.disabled = !allowed;
      const label = input.closest('label');
      if (label) label.classList.toggle('hidden', !allowed);
    });
  }

  function getAdminAccessMode(profile = {}) {
    const current = profile && typeof profile === 'object' ? profile : {};
    const canAccessAdmin = Boolean(current.canAccessAdmin || current.isAdmin);
    const canAccessTextAdmin = Boolean(current.canAccessTextAdmin || canAccessAdmin);
    const canAccessAssetRightsAdmin = Boolean(current.canAccessAssetRightsAdmin || canAccessAdmin);
    const canAccessDocumentRightsAdmin = Boolean(current.canAccessDocumentRightsAdmin || canAccessAdmin);
    const isSuperAdmin = Boolean(current.isSuperAdmin || current.baseIsSuperAdmin);
    const isTextOnly = canAccessTextAdmin && !canAccessAdmin && !canAccessAssetRightsAdmin && !canAccessDocumentRightsAdmin;
    const isDocumentRightsOnly = canAccessDocumentRightsAdmin && !canAccessAdmin && !canAccessTextAdmin;
    const isAssetRightsOnly = canAccessAssetRightsAdmin && !canAccessAdmin && !canAccessTextAdmin && !isDocumentRightsOnly;
    return {
      canAccessAdmin,
      canAccessTextAdmin,
      canAccessAssetRightsAdmin,
      canAccessDocumentRightsAdmin,
      isSuperAdmin,
      isTextOnly,
      isAssetRightsOnly,
      isDocumentRightsOnly
    };
  }

  function setTabVisibility(items = [], tabKey, dataAttr, visible) {
    const item = (Array.isArray(items) ? items : []).find((entry) => entry?.dataset?.[dataAttr] === tabKey);
    if (item) item.classList.toggle('hidden', !visible);
  }

  function setPanelVisibility(items = [], panelKey, dataAttr, visible) {
    const item = (Array.isArray(items) ? items : []).find((entry) => entry?.dataset?.[dataAttr] === panelKey);
    if (item) item.classList.toggle('hidden', !visible);
  }

  function setElementHidden(element, hidden) {
    if (element) element.classList.toggle('hidden', Boolean(hidden));
  }

  function canShowAdminMenu(profile = {}) {
    const access = getAdminAccessMode(profile);
    return access.canAccessAdmin || access.canAccessTextAdmin || access.canAccessAssetRightsAdmin || access.canAccessDocumentRightsAdmin;
  }

  function applyAdminAccessMode({
    profile = {},
    adminTabs = [],
    adminPanels = [],
    settingsSubTabs = [],
    settingsSubPanels = [],
    elements = {},
    switchTab = null,
    switchSettingsSubtab = null
  } = {}) {
    const access = getAdminAccessMode(profile);
    const canShowFullAdminPanels = access.canAccessAdmin;
    const visibleMainTabs = {
      apiHelp: canShowFullAdminPanels,
      systemHealth: canShowFullAdminPanels,
      runtimeDiagnostics: canShowFullAdminPanels,
      auditEvents: canShowFullAdminPanels,
      assetRights: canShowFullAdminPanels || access.canAccessAssetRightsAdmin,
      documentRights: !access.canAccessAdmin && access.canAccessDocumentRightsAdmin,
      settings: canShowFullAdminPanels || access.canAccessTextAdmin
    };
    Object.entries(visibleMainTabs).forEach(([tabName, visible]) => {
      setTabVisibility(adminTabs, tabName, 'tab', visible);
      setPanelVisibility(adminPanels, tabName, 'panel', visible);
    });

    const visibleSettingsTabs = {
      general: canShowFullAdminPanels,
      workflow: canShowFullAdminPanels,
      proxy: canShowFullAdminPanels,
      backup: canShowFullAdminPanels,
      ocr: access.canAccessTextAdmin,
      subtitle: access.canAccessTextAdmin,
      users: canShowFullAdminPanels && access.isSuperAdmin
    };
    Object.entries(visibleSettingsTabs).forEach(([tabName, visible]) => {
      setTabVisibility(settingsSubTabs, tabName, 'settingsTab', visible);
      setPanelVisibility(settingsSubPanels, tabName, 'settingsPanel', visible);
    });

    setElementHidden(elements.settingsForm, !canShowFullAdminPanels);
    setElementHidden(elements.settingsMsg, !canShowFullAdminPanels);
    setElementHidden(elements.ocrSettingsForm, !canShowFullAdminPanels);
    setElementHidden(elements.ocrSettingsMsg, !canShowFullAdminPanels);
    setElementHidden(elements.subtitleSettingsForm, !access.canAccessTextAdmin);
    setElementHidden(elements.subtitleSettingsMsg, !access.canAccessTextAdmin);
    setElementHidden(elements.authSessionSettingsForm, !canShowFullAdminPanels || !access.isSuperAdmin);
    setElementHidden(elements.authSessionSettingsMsg, !canShowFullAdminPanels || !access.isSuperAdmin);

    if (!access.canAccessAdmin && access.canAccessTextAdmin) {
      if (typeof switchTab === 'function') switchTab('settings');
      if (typeof switchSettingsSubtab === 'function') switchSettingsSubtab('ocr');
    } else if (!access.canAccessAdmin && access.canAccessAssetRightsAdmin) {
      if (typeof switchTab === 'function') switchTab('assetRights');
    } else if (!access.canAccessAdmin && access.canAccessDocumentRightsAdmin) {
      if (typeof switchTab === 'function') switchTab('documentRights');
    }

    return access;
  }

  global.createMainAccessScopeModule = function createMainAccessScopeModule() {
    return {
      applyAdminAccessMode,
      applyAssetTypeScope,
      canShowAdminMenu,
      getAdminAccessMode,
      getDefaultIngestType,
      normalizeAllowedAssetTypes,
      isDocumentScopedPrincipalList
    };
  };
})(window);
