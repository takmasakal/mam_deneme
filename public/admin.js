const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';

const ffmpegHealthEl = document.getElementById('ffmpegHealth');
const settingsForm = document.getElementById('settingsForm');
const settingsMsg = document.getElementById('settingsMsg');
const apiTokenInput = document.getElementById('apiTokenInput');
const oidcIssuerUrlInput = document.getElementById('oidcIssuerUrlInput');
const oidcJwksUrlInput = document.getElementById('oidcJwksUrlInput');
const oidcAudienceInput = document.getElementById('oidcAudienceInput');
const rotateApiTokenBtn = document.getElementById('rotateApiTokenBtn');
const copyApiTokenBtn = document.getElementById('copyApiTokenBtn');
const apiHelpBox = document.getElementById('apiHelpBox');
const apiGuideDoc = document.getElementById('apiGuideDoc');
const workflowSummary = document.getElementById('workflowSummary');
const workflowRows = document.getElementById('workflowRows');
const startProxyJobBtn = document.getElementById('startProxyJobBtn');
const includeTrash = document.getElementById('includeTrash');
const proxyJobState = document.getElementById('proxyJobState');
const proxyProgress = document.getElementById('proxyProgress');
const proxyJobErrors = document.getElementById('proxyJobErrors');
const languageSelect = document.getElementById('languageSelectAdmin');
const adminTabs = Array.from(document.querySelectorAll('.admin-tab'));
const adminPanels = Array.from(document.querySelectorAll('.admin-panel'));
const userPermissionsRows = document.getElementById('userPermissionsRows');
const userPermissionsMsg = document.getElementById('userPermissionsMsg');

let currentLang = localStorage.getItem(LOCAL_LANG) || 'en';
let pollTimer = null;
let activeJobId = null;

let i18n = {
  en: {
    admin_title: 'Admin Settings',
    admin_subtitle: 'Workflow tracking, proxy generation, and system health.',
    back_to_mam: 'Back to MAM',
    system_health: 'System Health',
    settings: 'Settings',
    loading: 'Loading...',
    workflow_tracking_enabled: 'Workflow tracking enabled',
    auto_proxy_backfill: 'Auto backfill proxies on upload',
    api_token_enabled: 'Require API token (non-SSO API access)',
    oidc_bearer_enabled: 'Accept Keycloak Bearer JWT (preferred for mobile)',
    api_token: 'API Token',
    api_token_placeholder: 'Generate token first',
    oidc_issuer_url: 'OIDC Issuer URL',
    oidc_issuer_url_ph: 'http://keycloak:8080/realms/mam',
    oidc_jwks_url: 'OIDC JWKS URL',
    oidc_jwks_url_ph: 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
    oidc_audience: 'OIDC Audience (optional, comma separated)',
    oidc_audience_ph: 'mam-web,account',
    rotate_token: 'Rotate Token',
    copy_token: 'Copy Token',
    token_rotated: 'API token rotated.',
    token_copied: 'API token copied.',
    api_test_title: 'Postman Test',
    api_test_note: 'Headers: X-API-Token or Authorization: Bearer <token>',
    api_help_doc_title: 'API Help Document',
    api_help_intro: 'Use this page to test MAM APIs quickly from Postman or cURL.',
    api_help_auth_title: 'Authentication Rules',
    api_help_auth_note: 'UI traffic on port 3000 is handled by SSO proxy. Token tests should use port 3001 direct API.',
    api_help_bearer_on: 'OIDC Bearer JWT validation is ON.',
    api_help_bearer_off: 'OIDC Bearer JWT validation is OFF.',
    api_help_token_on: 'API token protection is currently ON.',
    api_help_token_off: 'API token protection is currently OFF.',
    api_help_token_hint: 'Use current token from Settings for direct API tests.',
    api_help_quick_title: 'Quick Commands',
    api_help_cmd_workflow: 'List workflow steps',
    api_help_cmd_assets: 'List active assets',
    api_help_cmd_asset_by_id: 'Get one asset by ID',
    api_help_cmd_create_collection: 'Create a collection',
    api_help_postman_title: 'Postman Setup',
    api_help_postman_step1: 'Method: GET',
    api_help_postman_step2: 'URL: {{baseUrl}}/api/workflow (recommended baseUrl: http://localhost:3001)',
    api_help_postman_step3: 'When token protection is ON, send either X-API-Token or Authorization: Bearer <token>.',
    api_help_postman_step4: 'Disable auto-follow redirects when testing through port 3000.',
    api_help_endpoints_title: 'Main Endpoints',
    save_settings: 'Save Settings',
    settings_saved: 'Settings saved.',
    workflow_tracking: 'Workflow Tracking',
    proxy_jobs: 'Proxy Jobs',
    include_trash: 'Include trash',
    start_proxy_job: 'Start Proxy Job',
    proxy_job_started: 'Proxy job started.',
    proxy_job_done: 'Proxy job completed.',
    proxy_job_running: 'Proxy job running',
    proxy_job_failed: 'Proxy job failed.',
    processed: 'Processed',
    generated: 'Generated',
    skipped: 'Skipped',
    failed: 'Failed',
    assets_total: 'Total assets',
    assets_active: 'Active assets',
    assets_trash: 'Trash assets',
    proxies_ready: 'Proxies ready',
    proxies_missing: 'Proxies missing',
    ffmpeg_ok: 'ffmpeg: available',
    ffmpeg_fail: 'ffmpeg: unavailable',
    ffprobe_ok: 'ffprobe: available',
    ffprobe_fail: 'ffprobe: unavailable',
    user_settings: 'User Settings',
    perm_admin_access: 'Admin page access',
    perm_asset_delete: 'Asset delete',
    user_permissions_saved: 'User permissions saved.',
    access_denied: 'Access denied.'
  },
  tr: {
    admin_title: 'Yonetici Ayarlari',
    admin_subtitle: 'Is akisi izleme, proxy uretimi ve sistem sagligi.',
    back_to_mam: "MAM'e Don",
    system_health: 'Sistem Sagligi',
    settings: 'Ayarlar',
    loading: 'Yukleniyor...',
    workflow_tracking_enabled: 'Is akisi izleme etkin',
    auto_proxy_backfill: 'Yuklemede proxy backfill otomatik',
    api_token_enabled: 'API token zorunlu olsun (SSO olmayan API erişimi)',
    oidc_bearer_enabled: 'Keycloak Bearer JWT kabul et (mobil icin onerilen)',
    api_token: 'API Token',
    api_token_placeholder: 'Önce token üretin',
    oidc_issuer_url: 'OIDC Issuer URL',
    oidc_issuer_url_ph: 'http://keycloak:8080/realms/mam',
    oidc_jwks_url: 'OIDC JWKS URL',
    oidc_jwks_url_ph: 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
    oidc_audience: 'OIDC Audience (opsiyonel, virgul ile)',
    oidc_audience_ph: 'mam-web,account',
    rotate_token: 'Token Yenile',
    copy_token: 'Token Kopyala',
    token_rotated: 'API token yenilendi.',
    token_copied: 'API token kopyalandı.',
    api_test_title: 'Postman Testi',
    api_test_note: 'Header: X-API-Token veya Authorization: Bearer <token>',
    api_help_doc_title: 'API Yardim Dokumani',
    api_help_intro: 'MAM APIlerini Postman veya cURL ile hizli test etmek icin bu bolumu kullanin.',
    api_help_auth_title: 'Kimlik Dogrulama Kurallari',
    api_help_auth_note: '3000 portundaki UI trafigi SSO proxy uzerinden calisir. Token testleri icin 3001 direkt API kullanin.',
    api_help_bearer_on: 'OIDC Bearer JWT dogrulamasi ACIK.',
    api_help_bearer_off: 'OIDC Bearer JWT dogrulamasi KAPALI.',
    api_help_token_on: 'API token korumasi su anda ACIK.',
    api_help_token_off: 'API token korumasi su anda KAPALI.',
    api_help_token_hint: 'Direkt API testlerinde Settings altindaki guncel tokeni kullanin.',
    api_help_quick_title: 'Hizli Komutlar',
    api_help_cmd_workflow: 'Workflow adimlarini listele',
    api_help_cmd_assets: 'Aktif varliklari listele',
    api_help_cmd_asset_by_id: 'ID ile tek varlik getir',
    api_help_cmd_create_collection: 'Koleksiyon olustur',
    api_help_postman_title: 'Postman Kurulumu',
    api_help_postman_step1: 'Method: GET',
    api_help_postman_step2: 'URL: {{baseUrl}}/api/workflow (onerilen baseUrl: http://localhost:3001)',
    api_help_postman_step3: 'Token korumasi ACIK ise X-API-Token veya Authorization: Bearer <token> gonderin.',
    api_help_postman_step4: '3000 portunu test ederken otomatik redirect takibini kapatin.',
    api_help_endpoints_title: 'Temel Endpointler',
    save_settings: 'Ayarlari Kaydet',
    settings_saved: 'Ayarlar kaydedildi.',
    workflow_tracking: 'Is Akisi Izleme',
    proxy_jobs: 'Proxy Gorevleri',
    include_trash: 'Copu dahil et',
    start_proxy_job: 'Proxy Gorevi Baslat',
    proxy_job_started: 'Proxy gorevi baslatildi.',
    proxy_job_done: 'Proxy gorevi tamamlandi.',
    proxy_job_running: 'Proxy gorevi calisiyor',
    proxy_job_failed: 'Proxy gorevi basarisiz.',
    processed: 'Islenen',
    generated: 'Uretilen',
    skipped: 'Atlanan',
    failed: 'Hatali',
    assets_total: 'Toplam varlik',
    assets_active: 'Aktif varlik',
    assets_trash: 'Copteki varlik',
    proxies_ready: 'Hazir proxy',
    proxies_missing: 'Eksik proxy',
    ffmpeg_ok: 'ffmpeg: hazir',
    ffmpeg_fail: 'ffmpeg: yok',
    ffprobe_ok: 'ffprobe: hazir',
    ffprobe_fail: 'ffprobe: yok',
    user_settings: 'Kullanici Ayarlari',
    perm_admin_access: 'Yonetim sayfasina erisim',
    perm_asset_delete: 'Varlik silme',
    user_permissions_saved: 'Kullanici yetkileri kaydedildi.',
    access_denied: 'Erisim engellendi.'
  }
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return response.json();
}

async function loadI18nFile() {
  try {
    const response = await fetch(I18N_PATH, { cache: 'no-cache' });
    if (!response.ok) return;
    const external = await response.json();
    if (!external || typeof external !== 'object') return;
    if (external.en && typeof external.en === 'object') i18n.en = { ...i18n.en, ...external.en };
    if (external.tr && typeof external.tr === 'object') i18n.tr = { ...i18n.tr, ...external.tr };
  } catch (_error) {
    // Keep bundled dictionary.
  }
}

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
  renderApiHelp();
  renderApiGuide();
}

function row(label, value) {
  return `<div class="row"><strong>${label}</strong><span>${value}</span></div>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderWorkflowTracking(data) {
  const totals = data.totals || {};
  const proxies = data.proxies || {};

  workflowSummary.innerHTML = [
    `<div class="metric"><strong>${totals.total_all || 0}</strong><span>${t('assets_total')}</span></div>`,
    `<div class="metric"><strong>${totals.total_active || 0}</strong><span>${t('assets_active')}</span></div>`,
    `<div class="metric"><strong>${totals.total_trash || 0}</strong><span>${t('assets_trash')}</span></div>`,
    `<div class="metric"><strong>${proxies.ready || 0}</strong><span>${t('proxies_ready')}</span></div>`
  ].join('');

  const wfRows = Object.entries(data.workflow || {}).map(([status, count]) => row(status, count));
  const typeRows = Object.entries(data.types || {}).map(([type, count]) => row(type, count));
  wfRows.push(row(t('proxies_missing'), proxies.missing || 0));
  workflowRows.innerHTML = [...wfRows, ...typeRows].join('');
}

function renderHealth(health) {
  const ffmpegLine = `<div class="${health.ffmpegOk ? 'health-ok' : 'health-bad'}">${health.ffmpegOk ? t('ffmpeg_ok') : t('ffmpeg_fail')} ${health.ffmpegInfo ? `| ${health.ffmpegInfo}` : ''}</div>`;
  const ffprobeLine = `<div class="${health.ffprobeOk ? 'health-ok' : 'health-bad'}">${health.ffprobeOk ? t('ffprobe_ok') : t('ffprobe_fail')} ${health.ffprobeInfo ? `| ${health.ffprobeInfo}` : ''}</div>`;
  ffmpegHealthEl.innerHTML = `${ffmpegLine}${ffprobeLine}`;
}

function renderProxyJob(job) {
  if (!job) {
    proxyJobState.textContent = '';
    proxyProgress.style.width = '0%';
    proxyJobErrors.innerHTML = '';
    return;
  }

  const total = Math.max(0, Number(job.total) || 0);
  const processed = Math.max(0, Number(job.processed) || 0);
  const percentage = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  proxyProgress.style.width = `${percentage}%`;
  proxyJobState.textContent = `${t('proxy_job_running')}: ${t('processed')} ${processed}/${total} | ${t('generated')} ${job.generated || 0} | ${t('skipped')} ${job.skipped || 0} | ${t('failed')} ${job.failed || 0}`;

  const errs = (job.errors || []).slice(-8);
  proxyJobErrors.innerHTML = errs.map((item) => row(item.assetId || '-', item.error)).join('');

  if (job.status === 'completed') {
    proxyJobState.textContent = `${t('proxy_job_done')} ${t('processed')} ${processed}/${total}`;
  } else if (job.status === 'failed') {
    proxyJobState.textContent = t('proxy_job_failed');
  }
}

function switchTab(tabName) {
  adminTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  adminPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
}

function renderUserPermissions(users) {
  if (!userPermissionsRows) return;
  const list = Array.isArray(users) ? users : [];
  userPermissionsRows.innerHTML = list.map((user) => {
    const uname = escapeHtml(user.username || '');
    return `
      <div class="row user-perm-row" data-username="${uname}">
        <strong>${uname}</strong>
        <label><input type="checkbox" class="perm-admin-access" ${user.adminPageAccess ? 'checked' : ''} /> ${escapeHtml(t('perm_admin_access'))}</label>
        <label><input type="checkbox" class="perm-asset-delete" ${user.assetDelete ? 'checked' : ''} /> ${escapeHtml(t('perm_asset_delete'))}</label>
        <button type="button" class="perm-save-btn">${escapeHtml(t('save_settings'))}</button>
      </div>
    `;
  }).join('');

  userPermissionsRows.querySelectorAll('.perm-save-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const rowEl = event.currentTarget.closest('.user-perm-row');
      const username = rowEl?.dataset?.username || '';
      if (!username) return;
      const adminPageAccess = Boolean(rowEl.querySelector('.perm-admin-access')?.checked);
      const assetDelete = Boolean(rowEl.querySelector('.perm-asset-delete')?.checked);
      await api(`/api/admin/user-permissions/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: JSON.stringify({ adminPageAccess, assetDelete })
      });
      if (userPermissionsMsg) userPermissionsMsg.textContent = t('user_permissions_saved');
    });
  });
}

async function loadUserPermissions() {
  const result = await api('/api/admin/user-permissions');
  renderUserPermissions(result.users || []);
}

function renderApiHelp() {
  if (!apiHelpBox) return;
  const token = String(apiTokenInput?.value || '').trim();
  const masked = token ? `${token.slice(0, 4)}...${token.slice(-4)}` : '-';
  apiHelpBox.textContent = [
    `${t('api_test_title')}:`,
    `GET http://localhost:3000/api/workflow`,
    t('api_test_note'),
    `Current token: ${masked}`
  ].join('\n');
}

function renderApiGuide() {
  if (!apiGuideDoc) return;
  const token = String(apiTokenInput?.value || '').trim();
  const masked = token ? `${token.slice(0, 4)}...${token.slice(-4)}` : '-';
  const tokenEnabled = Boolean(settingsForm?.elements?.apiTokenEnabled?.checked);
  const bearerEnabled = Boolean(settingsForm?.elements?.oidcBearerEnabled?.checked);
  const browserBase = window.location.origin;
  const directBase = browserBase.includes(':3000') ? browserBase.replace(':3000', ':3001') : browserBase;
  const sampleAssetId = '<asset-id>';
  const tokenHeader = token || '<api-token>';
  const postmanUrlStep = t('api_help_postman_step2').replace('{{baseUrl}}', directBase);

  const workflowCmd = `curl -s ${directBase}/api/workflow \\\n  -H "X-API-Token: ${tokenHeader}"`;
  const assetsCmd = `curl -s "${directBase}/api/assets?trash=active" \\\n  -H "X-API-Token: ${tokenHeader}"`;
  const oneAssetCmd = `curl -s ${directBase}/api/assets/${sampleAssetId} \\\n  -H "X-API-Token: ${tokenHeader}"`;
  const collectionCmd = `curl -s -X POST ${directBase}/api/collections \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Token: ${tokenHeader}" \\\n  -d '{"name":"News Rundown","assetIds":["${sampleAssetId}"]}'`;

  apiGuideDoc.innerHTML = [
    `<p>${escapeHtml(t('api_help_intro'))}</p>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_auth_title'))}</h3><p>${escapeHtml(t('api_help_auth_note'))}</p><p>${escapeHtml(bearerEnabled ? t('api_help_bearer_on') : t('api_help_bearer_off'))}</p><p>${escapeHtml(tokenEnabled ? t('api_help_token_on') : t('api_help_token_off'))}</p><p>${escapeHtml(t('api_help_token_hint'))} (${escapeHtml(masked)})</p></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_quick_title'))}</h3><p><strong>${escapeHtml(t('api_help_cmd_workflow'))}</strong></p><pre>${escapeHtml(workflowCmd)}</pre><p><strong>${escapeHtml(t('api_help_cmd_assets'))}</strong></p><pre>${escapeHtml(assetsCmd)}</pre><p><strong>${escapeHtml(t('api_help_cmd_asset_by_id'))}</strong></p><pre>${escapeHtml(oneAssetCmd)}</pre><p><strong>${escapeHtml(t('api_help_cmd_create_collection'))}</strong></p><pre>${escapeHtml(collectionCmd)}</pre></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_postman_title'))}</h3><ul><li>${escapeHtml(t('api_help_postman_step1'))}</li><li>${escapeHtml(postmanUrlStep)}</li><li>${escapeHtml(t('api_help_postman_step3'))}</li><li>${escapeHtml(t('api_help_postman_step4'))}</li></ul></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_endpoints_title'))}</h3><pre>${escapeHtml(`GET    /api/workflow\nGET    /api/me\nGET    /api/assets\nPOST   /api/assets\nPOST   /api/assets/upload\nGET    /api/assets/:id\nPATCH  /api/assets/:id\nPOST   /api/assets/:id/transition\nPOST   /api/assets/:id/versions\nPOST   /api/assets/:id/cuts\nPATCH  /api/assets/:id/cuts/:cutId\nDELETE /api/assets/:id/cuts/:cutId\nPOST   /api/assets/:id/trash\nPOST   /api/assets/:id/restore\nDELETE /api/assets/:id\nGET    /api/collections\nPOST   /api/collections`)}</pre></div>`
  ].join('');
}

async function loadSettings() {
  const settings = await api('/api/admin/settings');
  settingsForm.elements.workflowTrackingEnabled.checked = Boolean(settings.workflowTrackingEnabled);
  settingsForm.elements.autoProxyBackfillOnUpload.checked = Boolean(settings.autoProxyBackfillOnUpload);
  settingsForm.elements.apiTokenEnabled.checked = Boolean(settings.apiTokenEnabled);
  settingsForm.elements.oidcBearerEnabled.checked = Boolean(settings.oidcBearerEnabled);
  if (apiTokenInput) apiTokenInput.value = String(settings.apiToken || '');
  if (oidcIssuerUrlInput) oidcIssuerUrlInput.value = String(settings.oidcIssuerUrl || '');
  if (oidcJwksUrlInput) oidcJwksUrlInput.value = String(settings.oidcJwksUrl || '');
  if (oidcAudienceInput) oidcAudienceInput.value = String(settings.oidcAudience || '');
  renderApiHelp();
  renderApiGuide();
}

async function refreshTrackingAndHealth() {
  const [tracking, health] = await Promise.all([
    api('/api/admin/workflow-tracking'),
    api('/api/admin/ffmpeg-health')
  ]);
  renderWorkflowTracking(tracking);
  renderHealth(health);
}

async function pollJob() {
  if (!activeJobId) return;
  const job = await api(`/api/admin/proxy-jobs/${activeJobId}`);
  renderProxyJob(job);
  if (job.status === 'running' || job.status === 'queued') {
    pollTimer = setTimeout(() => {
      pollJob().catch((error) => {
        proxyJobState.textContent = error.message;
      });
    }, 1200);
  } else {
    activeJobId = null;
    await refreshTrackingAndHealth();
  }
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    workflowTrackingEnabled: settingsForm.elements.workflowTrackingEnabled.checked,
    autoProxyBackfillOnUpload: settingsForm.elements.autoProxyBackfillOnUpload.checked,
    apiTokenEnabled: settingsForm.elements.apiTokenEnabled.checked,
    apiToken: String(settingsForm.elements.apiToken.value || '').trim(),
    oidcBearerEnabled: settingsForm.elements.oidcBearerEnabled.checked,
    oidcIssuerUrl: String(settingsForm.elements.oidcIssuerUrl.value || '').trim(),
    oidcJwksUrl: String(settingsForm.elements.oidcJwksUrl.value || '').trim(),
    oidcAudience: String(settingsForm.elements.oidcAudience.value || '').trim()
  };
  await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
  settingsMsg.textContent = t('settings_saved');
  renderApiHelp();
  renderApiGuide();
});

rotateApiTokenBtn?.addEventListener('click', async () => {
  const result = await api('/api/admin/api-token/rotate', { method: 'POST', body: '{}' });
  if (apiTokenInput) apiTokenInput.value = String(result.apiToken || '');
  settingsMsg.textContent = t('token_rotated');
  renderApiHelp();
  renderApiGuide();
});

copyApiTokenBtn?.addEventListener('click', async () => {
  const token = String(apiTokenInput?.value || '').trim();
  if (!token) return;
  await navigator.clipboard.writeText(token);
  settingsMsg.textContent = t('token_copied');
});

apiTokenInput?.addEventListener('input', () => {
  renderApiHelp();
  renderApiGuide();
});

settingsForm?.elements?.apiTokenEnabled?.addEventListener('change', () => {
  renderApiGuide();
});

settingsForm?.elements?.oidcBearerEnabled?.addEventListener('change', () => {
  renderApiGuide();
});

startProxyJobBtn.addEventListener('click', async () => {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  try {
    const job = await api('/api/admin/proxy-jobs', {
      method: 'POST',
      body: JSON.stringify({ includeTrash: includeTrash.checked })
    });
    activeJobId = job.id;
    proxyJobState.textContent = t('proxy_job_started');
    await pollJob();
  } catch (error) {
    proxyJobState.textContent = error.message;
    if (error.message.includes('already running')) {
      const list = await api('/api/admin/proxy-jobs');
      const running = list.find((item) => item.status === 'running' || item.status === 'queued');
      if (running) {
        activeJobId = running.id;
        await pollJob();
      }
    }
  }
});

adminTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab || 'apiHelp');
  });
});

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
  applyI18n();
  await refreshTrackingAndHealth();
  await loadUserPermissions();
  if (activeJobId) {
    const job = await api(`/api/admin/proxy-jobs/${activeJobId}`);
    renderProxyJob(job);
  }
});

(async () => {
  try {
    const me = await api('/api/me');
    if (!me.canAccessAdmin && !me.isAdmin) {
      window.location.href = '/';
      return;
    }
    await loadI18nFile();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyI18n();
    await loadSettings();
    await refreshTrackingAndHealth();
    await loadUserPermissions();
  } catch (error) {
    ffmpegHealthEl.textContent = error.message;
  }
})();
