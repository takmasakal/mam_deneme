const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';

const ffmpegHealthEl = document.getElementById('ffmpegHealth');
const settingsForm = document.getElementById('settingsForm');
const settingsMsg = document.getElementById('settingsMsg');
const workflowSummary = document.getElementById('workflowSummary');
const workflowRows = document.getElementById('workflowRows');
const startProxyJobBtn = document.getElementById('startProxyJobBtn');
const includeTrash = document.getElementById('includeTrash');
const proxyJobState = document.getElementById('proxyJobState');
const proxyProgress = document.getElementById('proxyProgress');
const proxyJobErrors = document.getElementById('proxyJobErrors');
const languageSelect = document.getElementById('languageSelectAdmin');

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
    ffprobe_fail: 'ffprobe: unavailable'
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
    ffprobe_fail: 'ffprobe: yok'
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
}

function row(label, value) {
  return `<div class="row"><strong>${label}</strong><span>${value}</span></div>`;
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

async function loadSettings() {
  const settings = await api('/api/admin/settings');
  settingsForm.elements.workflowTrackingEnabled.checked = Boolean(settings.workflowTrackingEnabled);
  settingsForm.elements.autoProxyBackfillOnUpload.checked = Boolean(settings.autoProxyBackfillOnUpload);
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
    autoProxyBackfillOnUpload: settingsForm.elements.autoProxyBackfillOnUpload.checked
  };
  await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
  settingsMsg.textContent = t('settings_saved');
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

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
  applyI18n();
  await refreshTrackingAndHealth();
  if (activeJobId) {
    const job = await api(`/api/admin/proxy-jobs/${activeJobId}`);
    renderProxyJob(job);
  }
});

(async () => {
  try {
    await loadI18nFile();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyI18n();
    await loadSettings();
    await refreshTrackingAndHealth();
  } catch (error) {
    ffmpegHealthEl.textContent = error.message;
  }
})();
