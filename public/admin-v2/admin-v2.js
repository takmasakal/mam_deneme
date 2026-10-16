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
  const v2Translations = {
    en: {
      overview: 'Overview', system_health: 'System Health', runtime_diagnostics: 'Diagnostics', audit_history: 'Audit History',
      asset_rights: 'Asset Rights', document_rights: 'Document Rights', metadata_generation: 'Metadata Generation', settings: 'Settings',
      classic_fallback_note: 'Other sections currently open in Classic Admin while V2 is migrated page by page.',
      back_to_classic: 'Back to Classic Admin', back_to_mam: 'Back to MAM', active_assets: 'Active Assets', open_errors: 'Open Errors',
      active_users: 'Active Users', recent_window: 'Recent window', loading: 'Loading', refresh: 'Refresh', service_health: 'Service Health',
      service_health_subtitle: 'Core services and infrastructure status', recent_processing_jobs: 'Recent Processing Jobs',
      recent_processing_jobs_subtitle: 'Latest asset processing jobs across the system', health_page_subtitle: 'Infrastructure, processing services, and recent jobs',
      diagnostics_page_subtitle: 'Active sessions and recent server-side failures', captured_errors: 'Captured Errors',
      active_users_subtitle: 'Recently active authenticated sessions', runtime_errors: 'Runtime Errors',
      runtime_errors_subtitle: 'Recent server-side failures captured by MetMAM', diagnostics_empty: 'No records found.',
      last_seen: 'Last seen', last_request: 'Last request', ip_address: 'IP address', user_agent: 'User agent',
      error_source: 'Source', error_status: 'Status', diagnostics_load_failed: 'Diagnostics could not be loaded.'
    },
    tr: {
      overview: 'Genel Bakış', system_health: 'Sistem Sağlığı', runtime_diagnostics: 'Tanılama', audit_history: 'İşlem Geçmişi',
      asset_rights: 'Varlık Yetkileri', document_rights: 'Belge Yetkileri', metadata_generation: 'Metadata Üretimi', settings: 'Ayarlar',
      classic_fallback_note: 'Diğer bölümler V2 geçişi tamamlanana kadar Klasik Yönetim ekranında açılır.',
      back_to_classic: 'Klasik Yönetime Dön', back_to_mam: "MAM'e Dön", active_assets: 'Aktif Varlıklar', open_errors: 'Açık Hatalar',
      active_users: 'Aktif Kullanıcılar', recent_window: 'Yakın zaman aralığı', loading: 'Yükleniyor', refresh: 'Yenile', service_health: 'Servis Sağlığı',
      service_health_subtitle: 'Temel servisler ve altyapı durumu', recent_processing_jobs: 'Son İşleme Görevleri',
      recent_processing_jobs_subtitle: 'Sistemdeki son varlık işleme görevleri', health_page_subtitle: 'Altyapı, işleme servisleri ve son görevler',
      diagnostics_page_subtitle: 'Aktif oturumlar ve son sunucu hataları', captured_errors: 'Yakalanan Hatalar',
      active_users_subtitle: 'Yakın zamanda etkin olan kimliği doğrulanmış oturumlar', runtime_errors: 'Çalışma Zamanı Hataları',
      runtime_errors_subtitle: 'MetMAM tarafından yakalanan son sunucu hataları', diagnostics_empty: 'Kayıt bulunamadı.',
      last_seen: 'Son görülme', last_request: 'Son istek', ip_address: 'IP adresi', user_agent: 'Kullanıcı aracısı',
      error_source: 'Kaynak', error_status: 'Durum', diagnostics_load_failed: 'Tanılama bilgileri yüklenemedi.',
      overview_total_assets: 'Toplam varlık', overview_uptime: 'servis kullanılabilir', overview_failed_jobs: 'Başarısız görev',
      ffmpeg_ok: 'FFmpeg hazır', ffmpeg_fail: 'FFmpeg kullanılamıyor', ffprobe_ok: 'FFprobe hazır', ffprobe_fail: 'FFprobe kullanılamıyor',
      health_up: 'Hazır', health_down: 'Kullanılamıyor', health_service_app: 'Uygulama', health_service_postgres: 'PostgreSQL',
      health_service_elastic: 'Elasticsearch', health_service_keycloak: 'Keycloak', health_service_oauth2_proxy: 'OAuth proxy',
      health_disk: 'Depolama', health_uploads_size: 'Yükleme boyutu', health_uploads_files: 'Dosyalar', health_fs_free: 'Boş', health_fs_total: 'Toplam',
      health_services: 'Servisler', health_jobs: 'Görev özeti', health_integrity: 'Varlık bütünlüğü', health_missing_proxy: 'Eksik proxy',
      health_missing_thumbnail: 'Eksik küçük resim', health_missing_subtitle: 'Eksik altyazı', health_missing_ocr: 'Eksik OCR',
      health_proxy_running: 'Çalışan proxy', health_subtitle_running: 'Çalışan altyazı', health_ocr_running: 'Çalışan OCR',
      health_metadata_running: 'Çalışan metadata', health_proxy_failed: 'Başarısız proxy', health_subtitle_failed: 'Başarısız altyazı',
      health_ocr_failed: 'Başarısız OCR', health_metadata_failed: 'Başarısız metadata', health_recent_jobs: 'Son işleme görevleri',
      health_job_refresh: 'Görevleri yenile', health_job_refresh_failed: 'Yenileme başarısız', health_job_type: 'Görev türü', health_job_type_short: 'Görev Türü',
      health_job_status: 'Durum', health_job_asset: 'Varlık', health_job_phase: 'Aşama', health_job_progress: 'İlerleme',
      health_job_started: 'Başlangıç', health_job_finished: 'Bitiş', health_job_updated: 'Güncelleme', actions: 'İşlemler',
      health_job_filter_period: 'Zaman aralığı', health_job_filter_all_types: 'Tüm görev türleri', health_job_filter_all_statuses: 'Tüm durumlar',
      health_job_filter_empty: 'Bu filtrelere uyan işleme görevi yok.', health_recent_jobs_window: 'Son {days} gün',
      health_subtitle_jobs: 'Altyazı', health_ocr_jobs: 'Video OCR', health_metadata_jobs: 'Metadata', health_proxy_jobs: 'Proxy',
      health_job_status_running: 'Çalışıyor', health_job_status_queued: 'Kuyrukta', health_job_status_completed: 'Tamamlandı',
      health_job_status_failed: 'Başarısız', health_job_status_cancelled: 'İptal edildi', health_job_cancel: 'İptal',
      health_job_cancel_confirm: 'Bu işleme görevi iptal edilsin mi?', health_job_cancel_failed: 'Görev iptal edilemedi',
      health_job_phase_queued: 'Kuyrukta', health_job_phase_preparing: 'Hazırlanıyor', health_job_phase_preparing_audio: 'Ses hazırlanıyor',
      health_job_phase_model_loading: 'Model yükleniyor', health_job_phase_transcribing: 'Metne çevriliyor', health_job_phase_aligning: 'Hizalanıyor',
      health_job_phase_writing_subtitles: 'Altyazı yazılıyor', health_job_phase_sampling_frames: 'Kareler örnekleniyor',
      health_job_phase_model_ready: 'Model hazır', health_job_phase_recognizing_frames: 'Kareler tanınıyor', health_job_phase_saving: 'Kaydediliyor',
      health_job_phase_loading_asset: 'Varlık yükleniyor', health_job_phase_summarizing_document: 'Belge özetleniyor',
      health_job_phase_generating_metadata: 'Metadata üretiliyor', health_job_phase_saving_metadata: 'Metadata kaydediliyor',
      health_job_phase_completed: 'Tamamlandı', health_job_phase_failed: 'Başarısız', health_job_phase_cancelled: 'İptal edildi',
      health_job_phase_interrupted: 'Kesintiye uğradı'
    }
  };
  let translations = {};
  let language = localStorage.getItem('mamLanguage') || 'en';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const t = (key) => v2Translations?.[language]?.[key] || translations?.[language]?.[key] || fallbackTranslations[key] || key;
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
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    byId('overviewActiveUsers').textContent = String(activeUsers.length);
    byId('diagnosticsActiveUserCount').textContent = String(activeUsers.length);
    byId('diagnosticsErrorCount').textContent = String(errors.length);
    byId('activeUsersRows').innerHTML = activeUsers.length ? activeUsers.map((user) => {
      const actor = user.displayName || user.username || user.email || user.actor || 'unknown';
      const request = `${user.lastMethod || ''} ${user.lastPath || ''}`.trim() || '—';
      return `<article class="diagnostic-row"><div class="diagnostic-row-head"><strong>${escapeHtml(actor)}</strong><time>${escapeHtml(formatDateTime(user.lastSeenAt))}</time></div><dl><div><dt>${escapeHtml(t('last_request'))}</dt><dd>${escapeHtml(request)}</dd></div><div><dt>${escapeHtml(t('ip_address'))}</dt><dd>${escapeHtml(user.ip || '—')}</dd></div>${user.userAgent ? `<div><dt>${escapeHtml(t('user_agent'))}</dt><dd>${escapeHtml(user.userAgent)}</dd></div>` : ''}</dl></article>`;
    }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
    byId('runtimeErrorRows').innerHTML = errors.length ? errors.map((item) => {
      const path = `${item.method || ''} ${item.path || ''}`.trim();
      return `<article class="diagnostic-row is-error"><div class="diagnostic-row-head"><strong>${escapeHtml(item.actor || 'system')}</strong><time>${escapeHtml(formatDateTime(item.createdAt))}</time></div><p>${escapeHtml(item.message || '—')}</p><dl><div><dt>${escapeHtml(t('error_source'))}</dt><dd>${escapeHtml(item.source || '—')}</dd></div>${item.status ? `<div><dt>${escapeHtml(t('error_status'))}</dt><dd>${escapeHtml(String(item.status))}</dd></div>` : ''}${path ? `<div><dt>HTTP</dt><dd>${escapeHtml(path)}</dd></div>` : ''}</dl>${item.stack ? `<details><summary>Stack</summary><pre>${escapeHtml(item.stack)}</pre></details>` : ''}</article>`;
    }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
  }

  function applyLocalization() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-v2-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.v2I18n);
    });
    const view = getActiveView();
    byId('v2PageTitle').textContent = t(view === 'diagnostics' ? 'runtime_diagnostics' : 'system_health');
    byId('v2PageSubtitle').textContent = t(view === 'diagnostics' ? 'diagnostics_page_subtitle' : 'health_page_subtitle');
    document.title = `MetMAM Admin V2 — ${byId('v2PageTitle').textContent}`;
  }

  function getActiveView() {
    return new URLSearchParams(global.location.search).get('view') === 'diagnostics' ? 'diagnostics' : 'health';
  }

  function applyView() {
    const view = getActiveView();
    document.querySelectorAll('[data-v2-view]').forEach((element) => { element.hidden = element.dataset.v2View !== view; });
    document.querySelectorAll('[data-v2-view-link]').forEach((link) => {
      const active = link.dataset.v2ViewLink === view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    applyLocalization();
  }

  async function refreshDiagnostics() {
    hideError();
    byId('refreshDiagnosticsBtn').disabled = true;
    try {
      renderRuntimeDiagnostics(await api('/api/admin/runtime-diagnostics?limit=100'));
    } catch (error) {
      showError(new Error(`${t('diagnostics_load_failed')} ${String(error?.message || '')}`.trim()));
    } finally {
      byId('refreshDiagnosticsBtn').disabled = false;
    }
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
  byId('refreshDiagnosticsBtn').addEventListener('click', refreshDiagnostics);

  byId('languageSelectAdmin').value = language;
  byId('languageSelectAdmin').addEventListener('change', async (event) => {
    language = event.target.value === 'tr' ? 'tr' : 'en';
    localStorage.setItem('mamLanguage', language);
    applyLocalization();
    healthModule.rerender();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
  });

  applyView();
  loadTranslations().finally(() => {
    applyLocalization();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
    else refresh({ force: true });
  });
})(window);
