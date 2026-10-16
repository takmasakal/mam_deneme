(function bootstrapAdminV2(global) {
  'use strict';

  const fallbackTranslations = {
    overview_total_assets: 'Total assets', overview_uptime: 'services available', overview_failed_jobs: 'Failed jobs',
    ffmpeg_ok: 'FFmpeg ready', ffmpeg_fail: 'FFmpeg unavailable', ffprobe_ok: 'FFprobe ready', ffprobe_fail: 'FFprobe unavailable',
    health_up: 'Ready', health_down: 'Unavailable', health_service_app: 'Application', health_service_postgres: 'PostgreSQL',
    health_service_elastic: 'Elasticsearch', health_service_keycloak: 'Keycloak', health_service_oauth2_proxy: 'OAuth proxy',
    health_disk: 'Storage', health_uploads_size: 'Uploads size', health_uploads_files: 'Files', health_fs_free: 'Free', health_fs_total: 'Total',
    health_services: 'Services', health_jobs: 'Job summary', health_integrity: 'Asset integrity', health_missing_proxy: 'Missing proxies',
    health_missing_thumbnail: 'Missing thumbnails', health_missing_subtitle: 'Missing subtitles', health_missing_ocr: 'Missing OCR',
    health_proxy_running: 'Proxy running', health_subtitle_running: 'Subtitle running', health_ocr_running: 'OCR running',
    health_metadata_running: 'Metadata running', health_proxy_failed: 'Proxy failed', health_subtitle_failed: 'Subtitle failed',
    health_ocr_failed: 'OCR failed', health_metadata_failed: 'Metadata failed', health_recent_jobs: 'Recent processing jobs',
    health_job_refresh: 'Refresh jobs', health_job_refresh_failed: 'Refresh failed', health_job_type: 'Job type', health_job_type_short: 'Job Type',
    health_job_status: 'Status', health_job_asset: 'Asset', health_job_phase: 'Phase', health_job_progress: 'Progress',
    health_job_started: 'Started', health_job_finished: 'Finished', health_job_updated: 'Updated', actions: 'Actions',
    health_job_filter_period: 'Time period', health_job_filter_all_types: 'All job types', health_job_filter_all_statuses: 'All statuses',
    health_job_filter_empty: 'No processing jobs match these filters.', health_recent_jobs_window: 'Last {days} days',
    health_subtitle_jobs: 'Subtitle', health_ocr_jobs: 'Video OCR', health_metadata_jobs: 'Metadata', health_proxy_jobs: 'Proxy',
    health_job_status_running: 'Running', health_job_status_queued: 'Queued', health_job_status_completed: 'Completed',
    health_job_status_failed: 'Failed', health_job_status_cancelled: 'Cancelled', health_job_cancel: 'Cancel',
    health_job_cancel_confirm: 'Cancel this processing job?', health_job_cancel_failed: 'Job cancellation failed',
    health_job_phase_queued: 'Queued', health_job_phase_preparing: 'Preparing', health_job_phase_preparing_audio: 'Preparing audio',
    health_job_phase_model_loading: 'Loading model', health_job_phase_transcribing: 'Transcribing', health_job_phase_aligning: 'Aligning',
    health_job_phase_writing_subtitles: 'Writing subtitles', health_job_phase_sampling_frames: 'Sampling frames',
    health_job_phase_model_ready: 'Model ready', health_job_phase_recognizing_frames: 'Recognizing frames', health_job_phase_saving: 'Saving',
    health_job_phase_loading_asset: 'Loading asset', health_job_phase_summarizing_document: 'Summarizing document',
    health_job_phase_generating_metadata: 'Generating metadata', health_job_phase_saving_metadata: 'Saving metadata',
    health_job_phase_completed: 'Completed', health_job_phase_failed: 'Failed', health_job_phase_cancelled: 'Cancelled',
    health_job_phase_interrupted: 'Interrupted'
  };
  let translations = {};
  let language = localStorage.getItem('mamLanguage') || 'en';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const t = (key) => translations?.[language]?.[key] || fallbackTranslations[key] || key;
  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
      dateStyle: 'short', timeStyle: 'medium'
    }).format(date);
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(body?.error || body?.message || `Request failed (${response.status})`);
    return body;
  }

  function renderRuntimeDiagnostics(payload = {}) {
    const activeUsers = Array.isArray(payload.activeUsers) ? payload.activeUsers : [];
    byId('overviewActiveUsers').textContent = String(activeUsers.length);
  }

  function showError(error) {
    const element = byId('pageError');
    element.textContent = `System health could not be loaded: ${String(error?.message || error || 'Unknown error')}`;
    element.hidden = false;
  }

  function hideError() {
    byId('pageError').hidden = true;
  }

  const healthModule = global.createAdminSystemHealthModule({
    api, t, escapeHtml, formatDateTime, renderRuntimeDiagnostics,
    elements: {
      ffmpegHealth: byId('ffmpegHealth'), systemHealthRows: byId('systemHealthRows'), systemJobStatus: byId('systemJobStatus'),
      overviewActiveAssets: byId('overviewActiveAssets'), overviewTotalAssets: byId('overviewTotalAssets'),
      overviewSystemHealth: byId('overviewSystemHealth'), overviewSystemHealthSub: byId('overviewSystemHealthSub'),
      overviewOpenErrors: byId('overviewOpenErrors'), overviewOpenErrorsSub: byId('overviewOpenErrorsSub')
    }
  });

  async function refresh(options = {}) {
    hideError();
    byId('healthLoading').hidden = false;
    byId('refreshHealthBtn').disabled = true;
    try {
      await healthModule.refresh(options);
      byId('ffmpegHealth').hidden = false;
    } catch (error) {
      showError(error);
    } finally {
      byId('healthLoading').hidden = true;
      byId('refreshHealthBtn').disabled = false;
    }
  }

  async function loadTranslations() {
    try {
      const response = await fetch('/i18n.json', { credentials: 'same-origin' });
      if (response.ok) translations = await response.json();
    } catch (_error) {
      translations = {};
    }
  }

  document.querySelectorAll('[data-classic-destination]').forEach((link) => {
    link.addEventListener('click', () => {
      sessionStorage.setItem('mamClassicAdminDestination', link.dataset.classicDestination || '');
    });
  });

  byId('refreshHealthBtn').addEventListener('click', () => {
    healthModule.clear();
    refresh({ force: true, forceServer: true });
  });

  byId('languageSelectAdmin').value = language;
  byId('languageSelectAdmin').addEventListener('change', async (event) => {
    language = event.target.value === 'tr' ? 'tr' : 'en';
    localStorage.setItem('mamLanguage', language);
    document.documentElement.lang = language;
    healthModule.rerender();
  });

  loadTranslations().finally(() => refresh({ force: true }));
})(window);
