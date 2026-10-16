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
      error_source: 'Source', error_status: 'Status', diagnostics_load_failed: 'Diagnostics could not be loaded.',
      actor: 'Actor', action: 'Action', all_actions: 'All actions', asset: 'Asset', from_date: 'From', to_date: 'To', filter: 'Filter',
      export_csv: 'Export CSV', delete_range: 'Delete Range', audit_history_subtitle: 'Recorded administrative and asset activity',
      previous: 'Previous', next: 'Next', retention: 'Retention', retention_subtitle: 'Control how long operational records are kept',
      audit_retention_days: 'Audit retention (days)', job_retention_days: 'Media-job retention (days)', save: 'Save',
      asset_uploaded: 'Asset uploaded', asset_created: 'Asset created', asset_updated: 'Asset updated', asset_trashed: 'Moved to trash',
      asset_restored: 'Asset restored', asset_deleted: 'Permanently deleted', asset_downloaded: 'Asset downloaded',
      audit_page_subtitle: 'Search, export, and retain administrative activity', audit_empty: 'No audit events match these filters.',
      page_of: 'Page {page} of {pages} · {total} events', retention_saved: 'Retention settings saved.',
      audit_cleanup_dates: 'Choose a valid start and end date before deleting.', audit_cleanup_confirm: 'Permanently delete audit events in this date range?',
      audit_cleanup_done: '{count} audit events deleted.', request_failed: 'Request failed'
      ,rights_mode: 'Rights mode', individual_assets: 'Individual assets', asset_types: 'Asset types', search_assets: 'Search assets',
      asset_type: 'Asset type', photo: 'Photo', document: 'Document', other: 'Other', visibility: 'Visibility', all: 'All',
      private: 'Private', owner_groups: 'Owner groups', selected_principals: 'Selected groups/users', public: 'Public',
      locked_only: 'Locked only', load: 'Load', asset_rights_subtitle: 'Visibility and read, edit, download, and upload policies',
      page_size: 'Page size', edit_policy: 'Edit policy', save_policy: 'Save policy', unlock: 'Release lock', locked_by: 'Locked by',
      allowed_groups: 'View groups', allowed_users: 'View users', denied_groups: 'Denied view groups', denied_users: 'Denied view users',
      edit_allowed_groups: 'Edit groups', edit_allowed_users: 'Edit users', edit_denied_groups: 'Edit denied groups',
      edit_denied_users: 'Edit denied users', download_allowed_groups: 'Download allowed groups', download_allowed_users: 'Download allowed users',
      download_denied_groups: 'Download denied groups', download_denied_users: 'Download denied users', upload_allowed_groups: 'Upload groups',
      upload_allowed_users: 'Upload users', upload_denied_groups: 'Upload denied groups', upload_denied_users: 'Upload denied users',
      policy_saved: 'Access policy saved.', lock_released: 'Edit lock released.', unlock_confirm: 'Release this asset edit lock?', rights_empty: 'No matching rights records.',
      type_video: 'Video', type_audio: 'Audio', type_photo: 'Photo', type_document: 'Document', type_other: 'Other', rights_page_subtitle: 'Manage visibility and granular media access policies', rights_page_of: 'Page {page} of {pages} · {total} records',
      read_access: 'Read', edit_access: 'Edit', download_access: 'Download', upload_access: 'Upload', lock_status: 'Lock', policy_accessible: '{allowed} allowed · {denied} denied', unlocked: 'Available'
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
      actor: 'Kullanıcı', action: 'İşlem', all_actions: 'Tüm işlemler', asset: 'Varlık', from_date: 'Başlangıç', to_date: 'Bitiş', filter: 'Filtrele',
      export_csv: 'CSV Aktar', delete_range: 'Aralığı Sil', audit_history_subtitle: 'Kaydedilmiş yönetim ve varlık hareketleri',
      previous: 'Önceki', next: 'Sonraki', retention: 'Saklama Süresi', retention_subtitle: 'Operasyon kayıtlarının ne kadar tutulacağını yönetin',
      audit_retention_days: 'Audit saklama süresi (gün)', job_retention_days: 'Medya görevi saklama süresi (gün)', save: 'Kaydet',
      asset_uploaded: 'Varlık yüklendi', asset_created: 'Varlık oluşturuldu', asset_updated: 'Varlık güncellendi', asset_trashed: 'Çöpe taşındı',
      asset_restored: 'Varlık geri yüklendi', asset_deleted: 'Kalıcı silindi', asset_downloaded: 'Varlık indirildi',
      audit_page_subtitle: 'Yönetim hareketlerini arayın, dışa aktarın ve saklama süresini yönetin', audit_empty: 'Bu filtrelere uyan işlem kaydı yok.',
      page_of: 'Sayfa {page} / {pages} · {total} kayıt', retention_saved: 'Saklama ayarları kaydedildi.',
      audit_cleanup_dates: 'Silmeden önce geçerli bir başlangıç ve bitiş tarihi seçin.', audit_cleanup_confirm: 'Bu tarih aralığındaki işlem kayıtları kalıcı olarak silinsin mi?',
      audit_cleanup_done: '{count} işlem kaydı silindi.', request_failed: 'İstek başarısız',
      rights_mode: 'Yetki modu', individual_assets: 'Tekil varlıklar', asset_types: 'Varlık türleri', search_assets: 'Varlık ara',
      asset_type: 'Varlık türü', photo: 'Fotoğraf', document: 'Belge', other: 'Diğer', visibility: 'Görünürlük', all: 'Tümü',
      private: 'Gizli', owner_groups: 'Sahip gruplar', selected_principals: 'Seçili grup/kullanıcılar', public: 'Herkese açık',
      locked_only: 'Yalnız kilitliler', load: 'Yükle', asset_rights_subtitle: 'Görünürlük ile okuma, düzenleme, indirme ve yükleme politikaları',
      page_size: 'Sayfa boyutu', edit_policy: 'Politikayı düzenle', save_policy: 'Politikayı kaydet', unlock: 'Kilidi kaldır', locked_by: 'Kilitleyen',
      allowed_groups: 'Görebilen gruplar', allowed_users: 'Görebilen kullanıcılar', denied_groups: 'Göremeyen gruplar', denied_users: 'Göremeyen kullanıcılar',
      edit_allowed_groups: 'Değiştirebilen gruplar', edit_allowed_users: 'Değiştirebilen kullanıcılar', edit_denied_groups: 'Değiştiremeyen gruplar',
      edit_denied_users: 'Değiştiremeyen kullanıcılar', download_allowed_groups: 'İndirebilen gruplar', download_allowed_users: 'İndirebilen kullanıcılar',
      download_denied_groups: 'İndiremeyen gruplar', download_denied_users: 'İndiremeyen kullanıcılar', upload_allowed_groups: 'Yükleyebilen gruplar',
      upload_allowed_users: 'Yükleyebilen kullanıcılar', upload_denied_groups: 'Yükleyemeyen gruplar', upload_denied_users: 'Yükleyemeyen kullanıcılar',
      policy_saved: 'Erişim politikası kaydedildi.', lock_released: 'Düzenleme kilidi kaldırıldı.', unlock_confirm: 'Bu varlığın düzenleme kilidi kaldırılsın mı?', rights_empty: 'Eşleşen yetki kaydı yok.',
      type_video: 'Video', type_audio: 'Ses', type_photo: 'Fotoğraf', type_document: 'Belge', type_other: 'Diğer', rights_page_subtitle: 'Görünürlük ve ayrıntılı medya erişim politikalarını yönetin', rights_page_of: 'Sayfa {page} / {pages} · {total} kayıt',
      read_access: 'Okuma', edit_access: 'Düzenleme', download_access: 'İndirme', upload_access: 'Yükleme', lock_status: 'Kilit', policy_accessible: '{allowed} izinli · {denied} engelli', unlocked: 'Kullanılabilir',
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
  let auditPage = 1;
  let auditPagination = { page: 1, totalPages: 1, total: 0, limit: 50 };
  let auditSuggestionTimer = 0;
  let rightsPage = 1;
  let rightsPagination = { page: 1, totalPages: 1, total: 0 };
  let rightsOwnerGroupFilter = '';
  let rightsSuggestionTimer = 0;
  let rightsCanUseTypeMode = false;
  let rightsGroupNames = null;
  let rightsModeValue = 'asset';
  let rightsLockedOnly = false;
  let rightsGroupInput = null;

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
    const titleKey = view === 'diagnostics' ? 'runtime_diagnostics' : view === 'audit' ? 'audit_history' : view === 'asset-rights' ? 'asset_rights' : 'system_health';
    const subtitleKey = view === 'diagnostics' ? 'diagnostics_page_subtitle' : view === 'audit' ? 'audit_page_subtitle' : view === 'asset-rights' ? 'rights_page_subtitle' : 'health_page_subtitle';
    byId('v2PageTitle').textContent = t(titleKey);
    byId('v2PageSubtitle').textContent = t(subtitleKey);
    document.title = `MetMAM Admin V2 — ${byId('v2PageTitle').textContent}`;
  }

  function getActiveView() {
    const requested = new URLSearchParams(global.location.search).get('view');
    return ['diagnostics', 'audit', 'asset-rights'].includes(requested) ? requested : 'health';
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

  function auditParams(includeOffset = true, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (includeOffset) params.set('offset', String((auditPage - 1) * limit));
    [['actor','auditActorInput'],['action','auditActionSelect'],['target','auditTargetInput'],['from','auditFromInput'],['to','auditToInput']].forEach(([key,id]) => {
      const value = String(byId(id).value || '').trim();
      if (value) params.set(key, value);
    });
    return params;
  }

  function auditActionLabel(action) {
    const map = {'asset.uploaded':'asset_uploaded','asset.created':'asset_created','asset.updated':'asset_updated','asset.trashed':'asset_trashed','asset.restored':'asset_restored','asset.deleted':'asset_deleted','asset.downloaded':'asset_downloaded'};
    return t(map[action] || action);
  }

  function renderAuditEvents(events = []) {
    byId('auditEventsRows').innerHTML = events.length ? events.map((event) => {
      const title = event.targetTitle || event.targetId || event.targetType || '—';
      const details = event.details && typeof event.details === 'object'
        ? Object.entries(event.details).slice(0, 4).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')
        : '';
      return `<article class="audit-row"><time>${escapeHtml(formatDateTime(event.createdAt))}</time><strong>${escapeHtml(event.actor || 'unknown')}</strong><span>${escapeHtml(auditActionLabel(event.action))}</span><b>${escapeHtml(title)}</b>${details ? `<small>${escapeHtml(details)}</small>` : ''}</article>`;
    }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('audit_empty'))}</div>`;
  }

  function updateAuditPager() {
    const page = Number(auditPagination.page || auditPage || 1);
    const pages = Math.max(1, Number(auditPagination.totalPages || 1));
    const total = Number(auditPagination.total || 0);
    byId('auditPageInfo').textContent = t('page_of').replace('{page}', page).replace('{pages}', pages).replace('{total}', total);
    byId('auditPrevBtn').disabled = page <= 1;
    byId('auditNextBtn').disabled = page >= pages;
  }

  async function loadAuditEvents() {
    byId('auditMessage').textContent = '';
    try {
      const data = await api(`/api/admin/audit-events?${auditParams().toString()}`);
      auditPagination = data.pagination || auditPagination;
      auditPage = Number(auditPagination.page || auditPage);
      renderAuditEvents(data.events || []);
      updateAuditPager();
    } catch (error) {
      byId('auditMessage').textContent = String(error?.message || t('request_failed'));
    }
  }

  async function loadRetention() {
    try {
      const settings = await api('/api/admin/settings');
      byId('auditRetentionDays').value = Number(settings.auditRetentionDays || 90);
      byId('mediaJobRetentionDays').value = Number(settings.mediaJobRetentionDays || 30);
    } catch (_error) {}
  }

  async function loadAuditView() {
    await Promise.all([loadAuditEvents(), loadRetention()]);
  }

  async function requestAuditSuggestions() {
    const query = byId('auditTargetInput').value.trim();
    const box = byId('auditTargetSuggestions');
    if (query.length < 3) { box.hidden = true; box.innerHTML = ''; return; }
    try {
      const items = await api(`/api/admin/assets/suggest?q=${encodeURIComponent(query)}&limit=8&includeTrash=1`);
      box.innerHTML = (items || []).map((item) => `<button type="button" data-value="${escapeHtml(item.title || item.fileName || '')}"><strong>${escapeHtml(item.title || item.fileName || item.id)}</strong><small>${escapeHtml(item.type || '—')} · ${escapeHtml(item.fileName || '—')}</small></button>`).join('');
      box.hidden = !box.innerHTML;
    } catch (_error) { box.hidden = true; }
  }

  const commonRightsFields = [
    'allowedGroups', 'allowedUsers', 'deniedGroups', 'deniedUsers',
    'editAllowedGroups', 'editAllowedUsers', 'editDeniedGroups', 'editDeniedUsers',
    'downloadAllowedGroups', 'downloadAllowedUsers', 'downloadDeniedGroups', 'downloadDeniedUsers'
  ];
  const uploadRightsFields = ['uploadAllowedGroups', 'uploadAllowedUsers', 'uploadDeniedGroups', 'uploadDeniedUsers'];
  const rightsFieldLabels = {
    ownerGroups: 'owner_groups',
    allowedGroups: 'allowed_groups', allowedUsers: 'allowed_users', deniedGroups: 'denied_groups', deniedUsers: 'denied_users',
    editAllowedGroups: 'edit_allowed_groups', editAllowedUsers: 'edit_allowed_users', editDeniedGroups: 'edit_denied_groups', editDeniedUsers: 'edit_denied_users',
    downloadAllowedGroups: 'download_allowed_groups', downloadAllowedUsers: 'download_allowed_users', downloadDeniedGroups: 'download_denied_groups', downloadDeniedUsers: 'download_denied_users',
    uploadAllowedGroups: 'upload_allowed_groups', uploadAllowedUsers: 'upload_allowed_users', uploadDeniedGroups: 'upload_denied_groups', uploadDeniedUsers: 'upload_denied_users'
  };

  const parseRightsList = (value) => [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
  const rightsMode = () => rightsModeValue;
  const rightsTypeLabel = (value) => t(`type_${String(value || 'other').toLowerCase()}`);

  function rightsParams() {
    const params = new URLSearchParams({ page: String(rightsPage), limit: byId('assetRightsPageSize').value || '20' });
    const query = byId('assetRightsSearch').value.trim();
    if (query) params.set('q', query);
    document.querySelectorAll('input[name="rightsType"]:checked').forEach((input) => params.append('typeGroup', input.value));
    if (byId('assetRightsVisibility').value) params.set('visibility', byId('assetRightsVisibility').value);
    if (rightsOwnerGroupFilter) params.set('ownerGroup', rightsOwnerGroupFilter);
    if (rightsLockedOnly) params.set('lockedOnly', '1');
    return params;
  }

  function renderRightsField(name, value) {
    return `<label><span>${escapeHtml(t(rightsFieldLabels[name]))}</span><input name="${name}" value="${escapeHtml((Array.isArray(value) ? value : []).join(', '))}" placeholder="group-a, user-b" /></label>`;
  }

  function renderRightsRows(items = [], mode = rightsMode()) {
    const fields = commonRightsFields.concat(mode === 'type' ? uploadRightsFields : []);
    const columns = 1 + (mode === 'asset' ? 2 : 0) + fields.length + 1;
    const forms = [];
    const rows = items.length ? items.map((item, index) => {
      const id = item.id || item.typeGroup || item.type || '';
      const typeGroup = item.typeGroup || item.type || 'other';
      const title = mode === 'type' ? rightsTypeLabel(typeGroup) : (item.title || item.fileName || id);
      const lockOwner = item.editLock?.lockedByName || item.editLock?.lockedBy || item.lockedBy || item.editLockedBy || item.lock?.actor || '';
      const formId = `rights-form-${index}`;
      forms.push(`<form id="${formId}" class="rights-policy-form" data-id="${escapeHtml(id)}" data-type-group="${escapeHtml(typeGroup)}" data-mode="${mode}"></form>`);
      const isPrivate = mode === 'asset' && (item.visibility || 'private') === 'private';
      const inputCell = (name, value) => `<td><label class="sr-only" for="${formId}-${name}">${escapeHtml(t(rightsFieldLabels[name]))}</label><input id="${formId}-${name}" form="${formId}" name="${name}" value="${escapeHtml((Array.isArray(value) ? value : []).join(', '))}" placeholder="${name.endsWith('Users') ? 'user@example.com' : 'group-a, group-b'}"${name.endsWith('Groups') ? ' list="assetRightsGroupOptions"' : ''}${isPrivate ? ' readonly aria-readonly="true"' : ''} /></td>`;
      const assetCells = mode === 'asset' ? `<td><select form="${formId}" name="visibility" data-rights-visibility>${['private','group','groups','public'].map((value) => `<option value="${value}"${item.visibility === value ? ' selected' : ''}>${escapeHtml(t(value === 'group' ? 'owner_groups' : value === 'groups' ? 'selected_principals' : value))}</option>`).join('')}</select></td>${inputCell('ownerGroups', item.ownerGroups)}` : '';
      return `<tr class="rights-data-row${isPrivate ? ' is-private' : ''}${item.inTrash ? ' is-trash' : ''}" data-rights-row><td class="rights-name"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(mode === 'type' ? t('asset_types') : `${item.type || rightsTypeLabel(typeGroup)} · ${item.owner || item.fileName || id}`)}</small>${lockOwner ? `<span class="rights-lock">${escapeHtml(t('locked_by'))}: ${escapeHtml(lockOwner)}</span>` : ''}</td>${assetCells}${fields.map((name) => inputCell(name, item[name])).join('')}<td class="rights-table-actions">${mode === 'asset' && lockOwner ? `<button class="danger" type="button" data-unlock-id="${escapeHtml(id)}">${escapeHtml(t('unlock'))}</button>` : ''}<button class="primary-link button-reset" type="submit" form="${formId}">${escapeHtml(t('save'))}</button></td></tr>`;
    }).join('') : `<tr><td colspan="${columns}" class="diagnostic-empty">${escapeHtml(t('rights_empty'))}</td></tr>`;
    const modeSelect = `<select id="assetRightsMode" aria-label="${escapeHtml(t('rights_mode'))}"><option value="asset"${mode === 'asset' ? ' selected' : ''}>${escapeHtml(t('asset'))}</option>${rightsCanUseTypeMode ? `<option value="type"${mode === 'type' ? ' selected' : ''}>${escapeHtml(language === 'tr' ? 'Tür / yükleme' : 'Type / upload')}</option>` : ''}</select>`;
    const assetHeaders = mode === 'asset' ? `<th>${escapeHtml(t('visibility'))}</th><th><span>${escapeHtml(t('owner_groups'))}</span><input id="assetRightsOwnerGroupFilter" type="search" value="${escapeHtml(rightsOwnerGroupFilter)}" placeholder="${escapeHtml(t('owner_groups'))}" /></th>` : '';
    const lockFilter = `<label class="rights-locked-filter"><input id="assetRightsLocked" type="checkbox"${rightsLockedOnly ? ' checked' : ''}${mode === 'type' ? ' disabled' : ''} /> ${escapeHtml(t('locked_only'))}</label>`;
    byId('assetRightsRows').innerHTML = `${forms.join('')}<div class="rights-table-wrap"><table class="rights-table rights-matrix"><thead><tr><th><span>${escapeHtml(mode === 'type' ? t('asset_type') : t('asset'))}</span>${modeSelect}</th>${assetHeaders}${fields.map((name) => `<th>${escapeHtml(t(rightsFieldLabels[name]))}</th>`).join('')}<th>${lockFilter}</th></tr></thead><tbody>${rows}</tbody></table></div><datalist id="assetRightsGroupOptions">${(rightsGroupNames || []).map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>`;
  }

  function updateRightsPager() {
    const page = Number(rightsPagination.page || rightsPage || 1);
    const pages = Math.max(1, Number(rightsPagination.totalPages || 1));
    const total = Number(rightsPagination.total || 0);
    byId('assetRightsPageInfo').textContent = t('rights_page_of').replace('{page}', page).replace('{pages}', pages).replace('{total}', total);
    byId('assetRightsPrev').disabled = page <= 1;
    byId('assetRightsNext').disabled = page >= pages;
  }

  function syncRightsModeControls() {
    const typeMode = rightsMode() === 'type';
    document.querySelectorAll('.rights-search, #assetRightsFilters fieldset, #assetRightsFilters > label').forEach((element) => {
      element.classList.toggle('is-disabled', typeMode);
      element.querySelectorAll('input, select').forEach((control) => { control.disabled = typeMode; });
    });
    byId('assetRightsPageSize').disabled = typeMode;
  }

  async function loadAssetRights() {
    byId('assetRightsMessage').textContent = '';
    const mode = rightsMode();
    try {
      const data = mode === 'type'
        ? await api('/api/admin/asset-types/access')
        : await api(`/api/admin/assets/access?${rightsParams().toString()}`);
      const items = mode === 'type' ? (data.types || data.assetTypes || data || []) : (data.assets || []);
      rightsPagination = mode === 'type' ? { page: 1, totalPages: 1, total: items.length } : (data.pagination || rightsPagination);
      rightsPage = Number(rightsPagination.page || rightsPage);
      renderRightsRows(Array.isArray(items) ? items : [], mode);
      updateRightsPager();
    } catch (error) {
      byId('assetRightsRows').innerHTML = '';
      byId('assetRightsMessage').textContent = String(error?.message || t('request_failed'));
    }
  }

  async function prepareAssetRights() {
    const [profile, groups] = await Promise.all([
      api('/api/me').catch(() => ({})),
      api('/api/admin/assets/access-groups').catch(() => ({}))
    ]);
    rightsCanUseTypeMode = Boolean(profile.isSuperAdmin || profile.canAccessAdmin || profile.isAdmin);
    const names = new Set();
    (groups.groups || []).forEach((group) => names.add(String(group.path || group.name || '').replace(/^\/+/, '')));
    ['mamGroups', 'mamOnlyGroups'].forEach((key) => (groups[key] || []).forEach((name) => names.add(String(name || '').replace(/^\/+/, ''))));
    (groups.groupAdmins || []).forEach((item) => names.add(String(item.groupName || item.group || '').replace(/^\/+/, '')));
    rightsGroupNames = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
    await loadAssetRights();
  }

  async function requestRightsSuggestions() {
    const query = byId('assetRightsSearch').value.trim();
    const box = byId('assetRightsSuggestions');
    if (query.length < 3 || rightsMode() === 'type') { box.hidden = true; return; }
    try {
      const items = await api(`/api/admin/assets/suggest?q=${encodeURIComponent(query)}&limit=8`);
      box.innerHTML = (items || []).map((item) => `<button type="button" data-rights-suggestion="${escapeHtml(item.title || item.fileName || '')}"><strong>${escapeHtml(item.title || item.fileName || item.id)}</strong><small>${escapeHtml(item.type || '—')} · ${escapeHtml(item.fileName || '—')} · ${escapeHtml(item.inTrash ? 'trash' : 'active')}</small></button>`).join('');
      box.hidden = !box.innerHTML;
    } catch (_error) { box.hidden = true; }
  }

  function showRightsGroupSuggestions(input) {
    if (!input || input.readOnly || !rightsGroupNames?.length) return;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;
    const token = value.slice(0, cursor).split(',').pop().trim();
    let box = byId('assetRightsGroupSuggestions');
    if (!box) { box = document.createElement('div'); box.id = 'assetRightsGroupSuggestions'; box.className = 'v2-suggestions rights-group-suggestions'; document.body.appendChild(box); }
    if (token.length < 3) { box.hidden = true; return; }
    const selected = new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
    const matches = rightsGroupNames.filter((name) => name.toLowerCase().includes(token.toLowerCase()) && !selected.has(name.toLowerCase())).slice(0, 8);
    if (!matches.length) { box.hidden = true; return; }
    rightsGroupInput = input;
    box.innerHTML = matches.map((name) => `<button type="button" data-group-name="${escapeHtml(name)}"><strong>${escapeHtml(name)}</strong></button>`).join('');
    const rect = input.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(global.innerWidth - 260, rect.left))}px`;
    box.style.top = `${Math.min(global.innerHeight - 220, rect.bottom + 4)}px`;
    box.style.width = `${Math.max(220, rect.width)}px`;
    box.hidden = false;
  }

  document.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-group-name]');
    if (!choice || !rightsGroupInput) return;
    const parts = rightsGroupInput.value.split(',');
    parts[parts.length - 1] = choice.dataset.groupName;
    rightsGroupInput.value = parts.map((item) => item.trim()).filter(Boolean).join(', ');
    byId('assetRightsGroupSuggestions').hidden = true;
    rightsGroupInput.focus();
  });

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
  byId('auditFiltersForm').addEventListener('submit', (event) => { event.preventDefault(); auditPage = 1; loadAuditEvents(); });
  byId('auditPrevBtn').addEventListener('click', () => { if (auditPage > 1) { auditPage -= 1; loadAuditEvents(); } });
  byId('auditNextBtn').addEventListener('click', () => { if (auditPage < Number(auditPagination.totalPages || 1)) { auditPage += 1; loadAuditEvents(); } });
  byId('auditTargetInput').addEventListener('input', () => { clearTimeout(auditSuggestionTimer); auditSuggestionTimer = setTimeout(requestAuditSuggestions, 180); });
  byId('auditTargetSuggestions').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    byId('auditTargetInput').value = button.dataset.value;
    byId('auditTargetSuggestions').hidden = true;
    auditPage = 1;
    loadAuditEvents();
  });
  byId('exportAuditBtn').addEventListener('click', async () => {
    const button = byId('exportAuditBtn');
    button.disabled = true;
    try {
      const response = await fetch(`/api/admin/audit-events/export?${auditParams(false, 5000)}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(t('request_failed'));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-events-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { byId('auditMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  byId('cleanupAuditBtn').addEventListener('click', async () => {
    const from = byId('auditFromInput').value;
    const to = byId('auditToInput').value;
    if (!from || !to || from > to) { byId('auditMessage').textContent = t('audit_cleanup_dates'); return; }
    if (!global.confirm(t('audit_cleanup_confirm'))) return;
    try {
      const result = await api('/api/admin/audit-events/cleanup', { method: 'POST', body: JSON.stringify({ from, to }) });
      byId('auditMessage').textContent = t('audit_cleanup_done').replace('{count}', Number(result.deletedEvents || 0));
      auditPage = 1;
      await loadAuditEvents();
    } catch (error) { byId('auditMessage').textContent = error.message; }
  });
  byId('retentionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ auditRetentionDays: Number(byId('auditRetentionDays').value), mediaJobRetentionDays: Number(byId('mediaJobRetentionDays').value) }) });
      byId('auditMessage').textContent = t('retention_saved');
    } catch (error) { byId('auditMessage').textContent = error.message; }
  });
  byId('assetRightsFilters').addEventListener('submit', (event) => { event.preventDefault(); rightsPage = 1; loadAssetRights(); });
  byId('assetRightsSearch').addEventListener('input', () => { clearTimeout(rightsSuggestionTimer); rightsSuggestionTimer = setTimeout(requestRightsSuggestions, 180); });
  byId('assetRightsSearch').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    const first = byId('assetRightsSuggestions').querySelector('button');
    if (first && !byId('assetRightsSuggestions').hidden) { event.preventDefault(); first.focus(); }
  });
  byId('assetRightsSuggestions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-rights-suggestion]');
    if (!button) return;
    byId('assetRightsSearch').value = button.dataset.rightsSuggestion;
    byId('assetRightsSuggestions').hidden = true;
    rightsPage = 1;
    loadAssetRights();
  });
  byId('assetRightsPageSize').addEventListener('change', () => { rightsPage = 1; loadAssetRights(); });
  document.querySelectorAll('input[name="rightsType"]').forEach((input) => input.addEventListener('change', () => { rightsPage = 1; loadAssetRights(); }));
  byId('assetRightsVisibility').addEventListener('change', () => { rightsPage = 1; loadAssetRights(); });
  byId('assetRightsPrev').addEventListener('click', () => { if (rightsPage > 1) { rightsPage -= 1; loadAssetRights(); } });
  byId('assetRightsNext').addEventListener('click', () => { if (rightsPage < Number(rightsPagination.totalPages || 1)) { rightsPage += 1; loadAssetRights(); } });
  byId('assetRightsRows').addEventListener('submit', async (event) => {
    const form = event.target.closest('.rights-policy-form');
    if (!form) return;
    event.preventDefault();
    const mode = form.dataset.mode;
    const data = new FormData(form);
    const fields = commonRightsFields.concat(mode === 'type' ? uploadRightsFields : ['ownerGroups']);
    const payload = Object.fromEntries(fields.map((name) => [name, parseRightsList(data.get(name))]));
    if (mode === 'asset') payload.visibility = String(data.get('visibility') || 'private');
    const endpoint = mode === 'type'
      ? `/api/admin/asset-types/${encodeURIComponent(form.dataset.typeGroup)}/access`
      : `/api/admin/assets/${encodeURIComponent(form.dataset.id)}/access`;
    const button = byId('assetRightsRows').querySelector(`button[type="submit"][form="${form.id}"]`);
    button.disabled = true;
    try {
      await api(endpoint, { method: 'PATCH', body: JSON.stringify(payload) });
      await loadAssetRights();
      byId('assetRightsMessage').textContent = t('policy_saved');
    } catch (error) { byId('assetRightsMessage').textContent = String(error?.message || t('request_failed')); }
    finally { button.disabled = false; }
  });
  byId('assetRightsRows').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-unlock-id]');
    if (!button || !global.confirm(t('unlock_confirm'))) return;
    button.disabled = true;
    try {
      await api(`/api/admin/assets/${encodeURIComponent(button.dataset.unlockId)}/edit-lock`, { method: 'DELETE' });
      await loadAssetRights();
      byId('assetRightsMessage').textContent = t('lock_released');
    } catch (error) { byId('assetRightsMessage').textContent = String(error?.message || t('request_failed')); }
    finally { button.disabled = false; }
  });
  byId('assetRightsRows').addEventListener('change', (event) => {
    if (event.target.id === 'assetRightsMode') {
      rightsModeValue = event.target.value === 'type' && rightsCanUseTypeMode ? 'type' : 'asset';
      rightsPage = 1;
      syncRightsModeControls();
      loadAssetRights();
      return;
    }
    if (event.target.id === 'assetRightsLocked') { rightsLockedOnly = event.target.checked; rightsPage = 1; loadAssetRights(); return; }
    if (event.target.id === 'assetRightsOwnerGroupFilter') {
      rightsOwnerGroupFilter = event.target.value.trim();
      rightsPage = 1;
      loadAssetRights();
      return;
    }
    const select = event.target.closest('[data-rights-visibility]');
    if (!select) return;
    const row = select.closest('[data-rights-row]');
    const isPrivate = select.value === 'private';
    row.classList.toggle('is-private', isPrivate);
    row.querySelectorAll('input[name]').forEach((input) => { input.readOnly = isPrivate; input.setAttribute('aria-readonly', String(isPrivate)); });
  });
  byId('assetRightsRows').addEventListener('input', (event) => {
    if (event.target.matches('input[name$="Groups"]')) showRightsGroupSuggestions(event.target);
  });
  byId('assetRightsRows').addEventListener('focusin', (event) => {
    if (event.target.matches('input[name$="Groups"]')) showRightsGroupSuggestions(event.target);
  });
  byId('assetRightsRows').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && byId('assetRightsGroupSuggestions')) byId('assetRightsGroupSuggestions').hidden = true;
    if (event.key !== 'Enter' || event.target.id !== 'assetRightsOwnerGroupFilter') return;
    event.preventDefault();
    rightsOwnerGroupFilter = event.target.value.trim();
    rightsPage = 1;
    loadAssetRights();
  });

  byId('languageSelectAdmin').value = language;
  byId('languageSelectAdmin').addEventListener('change', async (event) => {
    language = event.target.value === 'tr' ? 'tr' : 'en';
    localStorage.setItem('mamLanguage', language);
    applyLocalization();
    healthModule.rerender();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
    if (getActiveView() === 'audit') loadAuditEvents();
    if (getActiveView() === 'asset-rights') loadAssetRights();
  });

  applyView();
  loadTranslations().finally(() => {
    applyLocalization();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
    else if (getActiveView() === 'audit') loadAuditView();
    else if (getActiveView() === 'asset-rights') { syncRightsModeControls(); prepareAssetRights(); }
    else refresh({ force: true });
  });
})(window);
