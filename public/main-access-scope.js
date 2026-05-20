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

  function applyAssetTypeScope({ allowedAssetTypes = null, ingestForm = null, assetTypeFilters = [] } = {}) {
    const hasExplicitAllowedTypes = Array.isArray(allowedAssetTypes);
    const normalizedAllowed = normalizeAllowedAssetTypes(allowedAssetTypes);
    const allowedTypes = hasExplicitAllowedTypes
      ? new Set(normalizedAllowed)
      : null;
    const typeSelect = ingestForm?.querySelector?.('[name="type"]');
    if (typeSelect) {
      Array.from(typeSelect.options || []).forEach((option) => {
        const normalized = String(option.value || '').trim().toLowerCase();
        const allowed = !allowedTypes || allowedTypes.has(normalized);
        option.hidden = !allowed;
        option.disabled = !allowed;
      });
      const selected = String(typeSelect.value || '').trim().toLowerCase();
      if (allowedTypes && !allowedTypes.has(selected)) {
        typeSelect.value = getDefaultIngestType({ allowedAssetTypes: hasExplicitAllowedTypes ? normalizedAllowed : null });
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
    const isTextOnly = canAccessTextAdmin && !canAccessAdmin;
    return { canAccessAdmin, canAccessTextAdmin, isTextOnly };
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
    return access.canAccessAdmin || access.canAccessTextAdmin;
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
    const visibleMainTabs = {
      apiHelp: !access.isTextOnly,
      systemHealth: !access.isTextOnly,
      runtimeDiagnostics: !access.isTextOnly,
      auditEvents: !access.isTextOnly,
      assetRights: !access.isTextOnly,
      settings: true
    };
    Object.entries(visibleMainTabs).forEach(([tabName, visible]) => {
      setTabVisibility(adminTabs, tabName, 'tab', visible);
      setPanelVisibility(adminPanels, tabName, 'panel', visible);
    });

    const visibleSettingsTabs = {
      general: !access.isTextOnly,
      workflow: !access.isTextOnly,
      proxy: !access.isTextOnly,
      ocr: true,
      subtitle: true,
      users: !access.isTextOnly
    };
    Object.entries(visibleSettingsTabs).forEach(([tabName, visible]) => {
      setTabVisibility(settingsSubTabs, tabName, 'settingsTab', visible);
      setPanelVisibility(settingsSubPanels, tabName, 'settingsPanel', visible);
    });

    setElementHidden(elements.settingsForm, access.isTextOnly);
    setElementHidden(elements.settingsMsg, access.isTextOnly);
    setElementHidden(elements.ocrSettingsForm, access.isTextOnly);
    setElementHidden(elements.ocrSettingsMsg, access.isTextOnly);
    setElementHidden(elements.subtitleSettingsForm, false);
    setElementHidden(elements.subtitleSettingsMsg, false);

    if (access.isTextOnly) {
      if (typeof switchTab === 'function') switchTab('settings');
      if (typeof switchSettingsSubtab === 'function') switchSettingsSubtab('ocr');
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
