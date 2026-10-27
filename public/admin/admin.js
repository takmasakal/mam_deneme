(function bootstrapAdminV2(global) {
  'use strict';

  const fallbackTranslations = {
    overview_total_assets: 'Total assets', overview_uptime: 'services available', overview_failed_jobs: 'Failed jobs',
    ffmpeg_ok: 'FFmpeg ready', ffmpeg_fail: 'FFmpeg unavailable', ffprobe_ok: 'FFprobe ready', ffprobe_fail: 'FFprobe unavailable',
    health_up: 'Ready', health_down: 'Unavailable', health_service_app: 'Application', health_service_postgres: 'PostgreSQL',
    health_service_elastic: 'Elasticsearch', health_service_keycloak: 'Keycloak', health_service_oauth2_proxy: 'OAuth proxy',
    health_disk: 'Storage', health_uploads_size: 'Uploads size', health_uploads_files: 'Files', health_fs_free: 'Free', health_fs_total: 'Total',
    health_resources: 'Server Resources', health_cpu: 'CPU', health_memory: 'Memory', health_gpu: 'GPU', health_gpu_unavailable: 'Not detected', health_load_average: 'Load average', health_process_memory: 'Belgelik process', health_cores: 'cores',
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
    health_subtitle_jobs: 'Subtitle', health_ocr_jobs: 'Video OCR', health_photo_ocr_jobs: 'Photo OCR', health_asset_upload_jobs: 'Asset upload', health_asset_download_jobs: 'Asset download', health_metadata_jobs: 'Metadata', health_proxy_jobs: 'Proxy',
      health_job_status_running: 'Running', health_job_status_queued: 'Queued', health_job_status_completed: 'Completed', health_job_proxy_generated: 'Proxy generated',
    health_job_status_failed: 'Failed', health_job_status_cancelled: 'Cancelled', health_job_cancel: 'Cancel',
    health_job_cancel_confirm: 'Cancel this processing job?', health_job_cancel_failed: 'Job cancellation failed',
    health_job_phase_queued: 'Queued', health_job_phase_preparing: 'Preparing', health_job_phase_cancelling: 'Cancelling', health_job_phase_file_received: 'File received', health_job_phase_generating_proxy: 'Generating proxy', health_job_phase_generating_thumbnail: 'Generating thumbnail', health_job_phase_generating_preview: 'Generating preview', health_job_phase_reading_technical_info: 'Reading technical information', health_job_phase_saving_asset: 'Saving asset', health_job_phase_processing: 'Processing', health_job_phase_preparing_image: 'Preparing image', health_job_phase_recognizing_image: 'Recognizing image', health_job_phase_preparing_audio: 'Preparing audio',
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
      system_health: 'System Health', runtime_diagnostics: 'Diagnostics', audit_history: 'Audit History', s3_sharing: 'S3 Sharing',
      s3_sharing_subtitle: 'Temporary share links for assets you can view.', s3_provider_settings: 'Provider settings', s3_provider_description: 'Configure the object storage used for temporary share links.', active_shares: 'Active and recent shares',
      s3_endpoint: 'Endpoint', s3_region: 'Region', s3_bucket: 'Bucket', s3_access_key: 'Access key ID', s3_secret_key: 'Secret access key',
      s3_default_expiry: 'Default expiry (days)', s3_max_expiry: 'Maximum expiry (days)', s3_path_style: 'Path-style requests (MinIO)',
      s3_save_provider: 'Save provider', test_connection: 'Test connection', s3_credentials_saved: 'Credentials are configured. Leave both key fields blank to keep them.',
      s3_settings_saved: 'S3 provider settings saved.', s3_connection_ok: 'Connection successful.', s3_share_none: 'No shares found.',
      s3_share_status: 'Status', s3_share_created: 'Created by', s3_share_expires: 'Expires', s3_share_delete: 'Revoke and delete', s3_share_revoked: 'Share revoked; cloud object deletion queued.',
      system_health: 'System Health', runtime_diagnostics: 'Diagnostics', audit_history: 'Audit History',
      asset_rights: 'Asset Rights', document_rights: 'Document Rights', metadata_generation: 'Metadata Generation', settings: 'Settings',
      back_to_mam: 'Back to Belgelik', active_assets: 'Active Assets', open_errors: 'Open Errors',
      active_users: 'Active Users', recent_window: 'Recent window', loading: 'Loading', refresh: 'Refresh', service_health: 'Service Health',
      service_health_subtitle: 'Core services and infrastructure status', recent_processing_jobs: 'Recent Processing Jobs',
      recent_processing_jobs_subtitle: 'Latest asset processing jobs across the system', health_page_subtitle: 'Infrastructure, processing services, and recent jobs',
      diagnostics_page_subtitle: 'Active sessions and recent server-side failures', captured_errors: 'Captured Errors',
      active_users_subtitle: 'Recently active authenticated sessions', runtime_errors: 'Runtime Errors',
      runtime_errors_subtitle: 'Recent server-side failures captured by Belgelik', diagnostics_empty: 'No records found.',
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
      locked_only: 'Locked', load: 'Load', asset_rights_subtitle: 'Visibility and read, edit, download, and upload policies',
      page_size: 'Page size', edit_policy: 'Edit policy', save_policy: 'Save policy', unlock: 'Unlock', locked_by: 'Locked by', in_bin: 'In bin',
      allowed_groups: 'View groups', allowed_users: 'View users', denied_groups: 'Denied view groups', denied_users: 'Denied view users',
      edit_allowed_groups: 'Edit groups', edit_allowed_users: 'Edit users', edit_denied_groups: 'Edit denied groups',
      edit_denied_users: 'Edit denied users', download_allowed_groups: 'Download allowed groups', download_allowed_users: 'Download allowed users',
      download_denied_groups: 'Download denied groups', download_denied_users: 'Download denied users', upload_allowed_groups: 'Upload groups',
      upload_allowed_users: 'Upload users', upload_denied_groups: 'Upload denied groups', upload_denied_users: 'Upload denied users',
      policy_saved: 'Access policy saved.', lock_released: 'Edit lock released.', unlock_confirm: 'Release this asset edit lock?', rights_empty: 'No matching rights records.',
      type_video: 'Video', type_audio: 'Audio', type_photo: 'Photo', type_document: 'Document', type_other: 'Other', rights_page_subtitle: 'Manage visibility and granular media access policies', rights_page_of: 'Page {page} of {pages} · {total} records',
      read_access: 'Read', edit_access: 'Edit', download_access: 'Download', upload_access: 'Upload', lock_status: 'Lock', policy_accessible: '{allowed} allowed · {denied} denied', unlocked: 'Available',
      settings_page_subtitle: 'Application, processing, security, backup, and session configuration', settings_sub_general: 'General', settings_sub_proxy: 'Proxy', settings_sub_ocr: 'OCR', settings_sub_subtitle: 'Subtitle', settings_sub_backup: 'Backup', settings_sub_users: 'Users', principal_settings: 'User / Group Settings', principal_type_user: 'User', principal_type_group: 'Group', principal_search: 'Search', page_size: 'Page size', previous: 'Previous', next: 'Next',
      ocr_records: 'OCR Records', ocr_search: 'Search OCR', ocr_search_run: 'Run Search', ocr_search_ph: 'asset name...',
      ocr_engine: 'Engine', ocr_lines: 'Lines', ocr_segments: 'Segments', ocr_attachment_source: 'Attachment OCR', ocr_edit: 'Save', ocr_delete: 'Delete',
      content_edit: 'Edit Content', ocr_saved: 'OCR record saved.', ocr_deleted: 'OCR record deleted.',
      ocr_none: 'No OCR records found.', ocr_confirm_delete: 'Delete this OCR record from the database and disk?', metadata_page_subtitle: 'Configure AI models and generate descriptive metadata for assets',
      metadata_model_settings: 'Metadata model', metadata_model_enabled: 'Enable metadata generation', metadata_model_provider: 'Provider', metadata_model_name: 'Model', metadata_model_base_url: 'Base URL', metadata_model_dir: 'Model directory', metadata_model_keep_alive: 'Keep alive', metadata_model_timeout: 'Timeout (ms)', subtitle_translation_model_settings: 'Subtitle translation model', subtitle_translation_model_enabled: 'Enable subtitle translation model', metadata_generate_later: 'Generate metadata later', metadata_generate_now: 'Generate Metadata', proxy_tool_asset_name: 'Asset Name', proxy_tool_asset_name_ph: 'Type asset name', save_settings: 'Save Settings', settings_saved: 'Settings saved.', metadata_asset_required: 'Choose an asset first.', metadata_generation_queued: 'Metadata generation queued.', metadata_generation_failed: 'Failed to queue metadata generation.',
      learned_corrections_title: 'Learned Corrections', learned_wrong_ph: 'wrong phrase...', learned_correct_ph: 'correct phrase...',
      learned_use_selection: 'Use selected text', learned_add: 'Add', learned_apply: 'Apply', learned_delete: 'Delete',
      learned_none: 'No learned correction yet.', page_info: 'Page {page} / {pages} ({total})'
    },
    tr: {
      system_health: 'Sistem Sağlığı', runtime_diagnostics: 'Tanılama', audit_history: 'İşlem Geçmişi', s3_sharing: 'S3 Paylaşımı',
      s3_sharing_subtitle: 'Görüntüleyebildiğiniz varlıklar için geçici paylaşım bağlantıları.', s3_provider_settings: 'Sağlayıcı ayarları', s3_provider_description: 'Geçici paylaşım bağlantıları için kullanılacak nesne depolamasını yapılandırın.', active_shares: 'Etkin ve son paylaşımlar',
      s3_endpoint: 'Uç nokta', s3_region: 'Bölge', s3_bucket: 'Bucket', s3_access_key: 'Access key ID', s3_secret_key: 'Secret access key',
      s3_default_expiry: 'Varsayılan süre (gün)', s3_max_expiry: 'En uzun süre (gün)', s3_path_style: 'Path-style istekler (MinIO)',
      s3_save_provider: 'Sağlayıcıyı kaydet', test_connection: 'Bağlantıyı test et', s3_credentials_saved: 'Kimlik bilgileri kayıtlı. Mevcut anahtarları korumak için iki anahtar alanını da boş bırakın.',
      s3_settings_saved: 'S3 sağlayıcı ayarları kaydedildi.', s3_connection_ok: 'Bağlantı başarılı.', s3_share_none: 'Paylaşım bulunamadı.',
      s3_share_status: 'Durum', s3_share_created: 'Oluşturan', s3_share_expires: 'Bitiş', s3_share_delete: 'İptal et ve sil', s3_share_revoked: 'Paylaşım iptal edildi; bulut nesnesi silinmek üzere kuyruğa alındı.',
      system_health: 'Sistem Sağlığı', runtime_diagnostics: 'Tanılama', audit_history: 'İşlem Geçmişi',
      asset_rights: 'Varlık Yetkileri', document_rights: 'Belge Yetkileri', metadata_generation: 'Metadata Üretimi', settings: 'Ayarlar',
      back_to_mam: "Belgelik'e Dön", active_assets: 'Aktif Varlıklar', open_errors: 'Açık Hatalar',
      active_users: 'Aktif Kullanıcılar', recent_window: 'Yakın zaman aralığı', loading: 'Yükleniyor', refresh: 'Yenile', service_health: 'Servis Sağlığı',
      service_health_subtitle: 'Temel servisler ve altyapı durumu', recent_processing_jobs: 'Son İşleme Görevleri',
      recent_processing_jobs_subtitle: 'Sistemdeki son varlık işleme görevleri', health_page_subtitle: 'Altyapı, işleme servisleri ve son görevler',
      diagnostics_page_subtitle: 'Aktif oturumlar ve son sunucu hataları', captured_errors: 'Yakalanan Hatalar',
      active_users_subtitle: 'Yakın zamanda etkin olan kimliği doğrulanmış oturumlar', runtime_errors: 'Çalışma Zamanı Hataları',
      runtime_errors_subtitle: 'Belgelik tarafından yakalanan son sunucu hataları', diagnostics_empty: 'Kayıt bulunamadı.',
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
      locked_only: 'Kilitli', load: 'Yükle', asset_rights_subtitle: 'Görünürlük ile okuma, düzenleme, indirme ve yükleme politikaları',
      page_size: 'Sayfa boyutu', edit_policy: 'Politikayı düzenle', save_policy: 'Politikayı kaydet', unlock: 'Kilidi Aç', locked_by: 'Kilitleyen', in_bin: 'Çöpte',
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
      health_resources: 'Sunucu Kaynakları', health_cpu: 'CPU', health_memory: 'Bellek', health_gpu: 'GPU', health_gpu_unavailable: 'Algılanmadı', health_load_average: 'Yük ortalaması', health_process_memory: 'Belgelik işlemi', health_cores: 'çekirdek',
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
      health_subtitle_jobs: 'Altyazı', health_ocr_jobs: 'Video OCR', health_photo_ocr_jobs: 'Fotoğraf OCR', health_asset_upload_jobs: 'Varlık yükleme', health_asset_download_jobs: 'Varlık indirme', health_metadata_jobs: 'Metadata', health_proxy_jobs: 'Proxy',
      health_job_status_running: 'Çalışıyor', health_job_status_queued: 'Kuyrukta', health_job_status_completed: 'Tamamlandı', health_job_proxy_generated: 'Proxy üretildi',
      health_job_status_failed: 'Başarısız', health_job_status_cancelled: 'İptal edildi', health_job_cancel: 'İptal',
      health_job_cancel_confirm: 'Bu işleme görevi iptal edilsin mi?', health_job_cancel_failed: 'Görev iptal edilemedi',
      health_job_phase_queued: 'Kuyrukta', health_job_phase_preparing: 'Hazırlanıyor', health_job_phase_cancelling: 'İptal ediliyor', health_job_phase_file_received: 'Dosya alındı', health_job_phase_generating_proxy: 'Proxy üretiliyor', health_job_phase_generating_thumbnail: 'Küçük resim üretiliyor', health_job_phase_generating_preview: 'Önizleme üretiliyor', health_job_phase_reading_technical_info: 'Teknik bilgiler okunuyor', health_job_phase_saving_asset: 'Varlık kaydediliyor', health_job_phase_processing: 'İşleniyor', health_job_phase_preparing_image: 'Görsel hazırlanıyor', health_job_phase_recognizing_image: 'Görsel tanınıyor', health_job_phase_preparing_audio: 'Ses hazırlanıyor',
      health_job_phase_model_loading: 'Model yükleniyor', health_job_phase_transcribing: 'Metne çevriliyor', health_job_phase_aligning: 'Hizalanıyor',
      health_job_phase_writing_subtitles: 'Altyazı yazılıyor', health_job_phase_sampling_frames: 'Kareler örnekleniyor',
      health_job_phase_model_ready: 'Model hazır', health_job_phase_recognizing_frames: 'Kareler tanınıyor', health_job_phase_saving: 'Kaydediliyor',
      health_job_phase_loading_asset: 'Varlık yükleniyor', health_job_phase_summarizing_document: 'Belge özetleniyor',
      health_job_phase_generating_metadata: 'Metadata üretiliyor', health_job_phase_saving_metadata: 'Metadata kaydediliyor',
      health_job_phase_completed: 'Tamamlandı', health_job_phase_failed: 'Başarısız', health_job_phase_cancelled: 'İptal edildi',
      health_job_phase_interrupted: 'Kesintiye uğradı', settings_page_subtitle: 'Uygulama, işleme, güvenlik, yedekleme ve oturum yapılandırması', settings_sub_general: 'Genel', settings_sub_proxy: 'Proxy', settings_sub_ocr: 'OCR', settings_sub_subtitle: 'Altyazı', settings_sub_backup: 'Yedekleme', settings_sub_users: 'Kullanıcılar', principal_settings: 'Kullanıcı / Grup Ayarları', principal_type_user: 'Kullanıcı', principal_type_group: 'Grup', principal_search: 'Ara', page_size: 'Sayfa boyutu', previous: 'Önceki', next: 'Sonraki',
      ocr_records: 'OCR Kayıtları', ocr_search: 'OCR Ara', ocr_search_run: 'Ara', ocr_search_ph: 'varlık adı...',
      ocr_engine: 'Motor', ocr_lines: 'Satır', ocr_segments: 'Segment', ocr_attachment_source: 'Ek dosya OCR', ocr_edit: 'Kaydet', ocr_delete: 'Sil',
      content_edit: 'İçeriği Düzenle', ocr_saved: 'OCR kaydı kaydedildi.', ocr_deleted: 'OCR kaydı silindi.',
      ocr_none: 'OCR kaydı bulunamadı.', ocr_confirm_delete: 'Bu OCR kaydı veritabanından ve diskten silinsin mi?', metadata_page_subtitle: 'Yapay zekâ modellerini yapılandırın ve varlıklar için açıklayıcı metadata üretin',
      metadata_model_settings: 'Metadata modeli', metadata_model_enabled: 'Metadata üretimini etkinleştir', metadata_model_provider: 'Sağlayıcı', metadata_model_name: 'Model', metadata_model_base_url: 'Temel URL', metadata_model_dir: 'Model dizini', metadata_model_keep_alive: 'Canlı tutma', metadata_model_timeout: 'Zaman aşımı (ms)', subtitle_translation_model_settings: 'Altyazı çeviri modeli', subtitle_translation_model_enabled: 'Altyazı çeviri modelini etkinleştir', metadata_generate_later: 'Metadata’yı daha sonra üret', metadata_generate_now: 'Metadata Üret', proxy_tool_asset_name: 'Varlık Adı', proxy_tool_asset_name_ph: 'Varlık adı yazın', save_settings: 'Ayarları Kaydet', settings_saved: 'Ayarlar kaydedildi.', metadata_asset_required: 'Önce bir varlık seçin.', metadata_generation_queued: 'Metadata üretimi kuyruğa alındı.', metadata_generation_failed: 'Metadata üretimi kuyruğa alınamadı.',
      learned_corrections_title: 'Öğrenilmiş Düzeltmeler', learned_wrong_ph: 'yanlış ifade...', learned_correct_ph: 'doğru ifade...',
      learned_use_selection: 'Seçili metni al', learned_add: 'Ekle', learned_apply: 'Uygula', learned_delete: 'Sil',
      learned_none: 'Henüz öğrenilmiş düzeltme yok.', page_info: 'Sayfa {page} / {pages} ({total})'
    }
  };
  const MAIN_LANGUAGE_KEY = 'mam.lang';
  const LEGACY_ADMIN_LANGUAGE_KEY = 'mamLanguage';
  const LOGIN_LANGUAGE_COOKIE = 'mam.login.lang';
  function readSharedLanguageCookie() {
    const entry = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${LOGIN_LANGUAGE_COOKIE}=`));
    const value = entry ? decodeURIComponent(entry.slice(LOGIN_LANGUAGE_COOKIE.length + 1)).toLowerCase().split('-')[0] : '';
    return value === 'tr' || value === 'en' ? value : '';
  }
  function persistSharedLanguage(value) {
    const normalized = value === 'tr' ? 'tr' : 'en';
    localStorage.setItem(MAIN_LANGUAGE_KEY, normalized);
    localStorage.removeItem(LEGACY_ADMIN_LANGUAGE_KEY);
    const host = String(global.location.hostname || '').toLowerCase();
    const domain = host.endsWith('.trt.net.tr') ? '; Domain=.trt.net.tr' : '';
    document.cookie = `${LOGIN_LANGUAGE_COOKIE}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax${global.location.protocol === 'https:' ? '; Secure' : ''}${domain}`;
  }
  let translations = {};
  const savedLanguage = readSharedLanguageCookie() || localStorage.getItem(MAIN_LANGUAGE_KEY) || localStorage.getItem(LEGACY_ADMIN_LANGUAGE_KEY);
  let language = savedLanguage === 'tr' ? 'tr' : 'en';
  let adminPermissions = null;
  persistSharedLanguage(language);
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
  let metadataSuggestionTimer = 0;

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const t = (key) => v2Translations?.[language]?.[key] || translations?.[language]?.[key] || fallbackTranslations[key] || key;
  const settingsTurkishText = {
    'Player':'Oynatıcı','Player Mode':'Oynatıcı Modu','Asset ingest':'Varlık ekleme','New asset default visibility':'Yeni varlık varsayılan görünürlüğü','Owner groups':'Sahip gruplar','Public':'Herkese açık','Hide':'Gizle','Allow creating assets without a file':'Dosyasız varlık oluşturmaya izin ver','Job concurrency':'Eşzamanlı görevler','Subtitle':'Altyazı','Video OCR':'Video OCR','Metadata':'Metadata','Thumbnail':'Küçük resim','Upload':'Yükleme','Download':'İndirme','Backup':'Yedekleme','Security':'Güvenlik','Require API token (non-SSO API access)':'API belirteci iste (SSO dışı API erişimi)','Accept Keycloak Bearer JWT (preferred for mobile)':'Keycloak Bearer JWT kabul et (mobil için önerilen)','API Token':'API Belirteci','OIDC Issuer URL':'OIDC Sağlayıcı URL’si','OIDC JWKS URL':'OIDC JWKS URL’si','OIDC Audience':'OIDC Hedef Kitlesi','Rotate Token':'Belirteci Yenile','Copy Token':'Belirteci Kopyala','Save Settings':'Ayarları Kaydet',
    'Proxy Jobs':'Proxy Görevleri','Include trash':'Çöp kutusunu dahil et','Missing Proxy/Thumbnail Generation':'Eksik Proxy/Küçük Resim Üretimi','Scan assets for missing derivatives and generate only the missing component.':'Varlıklarda eksik türevleri tara ve yalnızca eksik bileşeni üret.','Scan Missing':'Eksikleri Tara','Generate All Proxies':'Tüm Proxyleri Üret','Asset Generation Tool':'Varlık Üretim Aracı','Asset Name':'Varlık Adı','Action':'İşlem','Generate Thumbnail':'Küçük Resim Üret','Generate Image Thumbnail':'Görsel Küçük Resmi Üret','Generate Image Preview':'Görsel Önizleme Üret','Generate Document Thumbnail':'Belge Küçük Resmi Üret','Generate Preview':'Önizleme Üret','Generate Proxy':'Proxy Üret','Thumbnail Timecode':'Küçük Resim Zaman Kodu','Run Action':'İşlemi Çalıştır','Recent Proxy Jobs':'Son Proxy Görevleri','Generate':'Üret',
    'OCR Defaults':'OCR Varsayılanları','OCR Filters':'OCR Filtreleri','Advanced OCR mode default':'Gelişmiş OCR modu varsayılanı','Turkish offline correction default':'Türkçe çevrimdışı düzeltme varsayılanı','Blur filter default':'Bulanıklık filtresi varsayılanı','Ticker region mode default':'Kayan yazı bölge modu varsayılanı','Static overlay filter default':'Sabit kaplama filtresi varsayılanı','OCR Records':'OCR Kayıtları','Search OCR':'OCR Ara','Run Search':'Ara','Search':'Ara','Prev':'Önceki','Previous':'Önceki','Next':'Sonraki',
    'Subtitle Display Settings':'Altyazı Görüntüleme Ayarları','Subtitle Style':'Altyazı Stili','Use custom overlay':'Özel kaplama kullan','Bottom offset (px)':'Alt boşluk (px)','Font size (px)':'Yazı boyutu (px)','Text color':'Metin rengi','Background color':'Arka plan rengi','Background opacity':'Arka plan saydamlığı','Left/right padding (px)':'Sol/sağ iç boşluk (px)','Max width (%)':'En fazla genişlik (%)','Custom overlay applies the complete style and match-highlighting configuration.':'Özel kaplama, tüm stil ve eşleşme vurgulama ayarlarını uygular.','Subtitle Records':'Altyazı Kayıtları','Search Subtitle':'Altyazı Ara','Delete file too':'Dosyayı da sil','Combined Subtitle + OCR Search':'Birleşik Altyazı + OCR Araması','Search Query':'Arama Sorgusu','Limit':'Sınır',
    'Backup Settings':'Yedekleme Ayarları','Schedule':'Zamanlama','Enable daily backup':'Günlük yedeklemeyi etkinleştir','Backup directory':'Yedekleme dizini','Daily hour':'Günlük saat','Retention (days)':'Saklama süresi (gün)','Contents':'İçerik','MAM PostgreSQL dump':'MAM PostgreSQL dökümü','Keycloak PostgreSQL dump':'Keycloak PostgreSQL dökümü','Uploads archive (.tar.gz)':'Yüklemeler arşivi (.tar.gz)','Uploads incremental backup (restic)':'Yüklemelerin artımlı yedeği (restic)','Restic repository':'Restic deposu','Daily snapshots':'Günlük anlık görüntüler','Weekly snapshots':'Haftalık anlık görüntüler','Monthly snapshots':'Aylık anlık görüntüler','Run Backup Now':'Şimdi Yedekle','Permission Export / Import':'Yetki Dışa / İçe Aktarma','Asset rights':'Varlık yetkileri','User and group rights':'Kullanıcı ve grup yetkileri','Export':'Dışa Aktar','Import':'İçe Aktar','Delete':'Sil',
    'Login Session Settings':'Oturum Açma Ayarları','Allow remember me':'Beni hatırla seçeneğine izin ver','Idle timeout (minutes)':'Boşta kalma süresi (dakika)','Maximum session (hours)':'En uzun oturum (saat)','Client idle timeout (minutes)':'İstemci boşta kalma süresi (dakika)','Client maximum session (hours)':'İstemci en uzun oturumu (saat)','Save Login Settings':'Oturum Ayarlarını Kaydet','Identity Overview':'Kimlik Genel Bakışı','Refresh':'Yenile','Search users':'Kullanıcı ara','Groups':'Gruplar','Users':'Kullanıcılar','Source':'Kaynak','MAM-only groups':'Yalnızca MAM grupları','Group Administrators':'Grup Yöneticileri','Managed group':'Yönetilen grup','Manager username':'Yönetici kullanıcı adı','Scope':'Kapsam','Text administration':'Metin yönetimi','Add':'Ekle','User / Group Settings':'Kullanıcı / Grup Ayarları','User':'Kullanıcı','Group':'Grup','Page size':'Sayfa boyutu'
  };
  const settingsTurkishPlaceholders = {'Type asset name':'Varlık adı yazın','asset name...':'varlık adı...','asset, label, file...':'varlık, etiket, dosya...','asset, label, language...':'varlık, etiket, dil...','Type query...':'Sorgu yazın...','username, name, email...':'kullanıcı adı, ad, e-posta...','Search user or group...':'Kullanıcı veya grup ara...'};
  settingsTurkishText['Token & OIDC'] = 'Belirteç ve OIDC';
  Object.assign(settingsTurkishText, {'Manager user/group':'Yönetici kullanıcı/grup','Asset type':'Varlık türü','Scopes':'Kapsamlar','Asset rights':'Varlık yetkileri','Document rights':'Belge yetkileri','OCR / subtitle':'OCR / altyazı','S3 sharing':'S3 Paylaşımı','Document':'Belge','Video':'Video','Audio':'Ses','Photo':'Fotoğraf','Other':'Diğer','All asset types':'Tüm varlık türleri','Edit':'Düzenle','Update':'Güncelle','Actions':'İşlemler','Created':'Oluşturulma'});
  Object.assign(settingsTurkishText, {'Scan Missing Manually':'Eksikleri Elle Tara','Scan Missing Automatically':'Eksikleri Otomatik Tara','Stop scan':'Taramayı Durdur'});
  Object.assign(settingsTurkishText, {'Video OCR parameters':'Video OCR parametreleri','Interval (sec)':'Aralık (sn)','Min visible (sec)':'En az görünme (sn)','Merge gap (sec)':'Birleşme aralığı (sn)','OCR engine':'OCR motoru'});
  const localizedSettingsNotice = (en, tr) => language === 'tr' ? tr : en;
  const localizedSettingsLabel = (value) => language === 'tr' ? (settingsTurkishText[value] || value) : value;
  function localizeSettingsText() {
    document.querySelectorAll('.settings-view h2:not([data-v2-i18n]), .settings-view h3:not([data-v2-i18n]), .settings-view h4:not([data-v2-i18n]), .settings-view legend:not([data-v2-i18n]), .settings-view label > span:not([data-v2-i18n]), .settings-view button:not([data-v2-i18n]), .settings-view option:not([data-v2-i18n]), .settings-view strong:not([data-v2-i18n]), .settings-view p:not([data-v2-i18n])').forEach((element) => {
      if (!element.dataset.v2SettingsEn) element.dataset.v2SettingsEn = String(element.textContent || '').trim();
      const original = element.dataset.v2SettingsEn;
      if (language === 'tr' && settingsTurkishText[original]) element.textContent = settingsTurkishText[original];
      else if (language === 'en' && original) element.textContent = original;
    });
    document.querySelectorAll('.settings-view input[placeholder]').forEach((element) => {
      if (!element.dataset.v2SettingsPlaceholderEn) element.dataset.v2SettingsPlaceholderEn = element.placeholder;
      const original = element.dataset.v2SettingsPlaceholderEn;
      element.placeholder = language === 'tr' ? (settingsTurkishPlaceholders[original] || original) : original;
    });
  }
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
    byId('activeUsersRows').innerHTML = activeUsers.length ? activeUsers.map((user) => {
      const actor = user.displayName || user.username || user.email || user.actor || 'unknown';
      const request = `${user.lastMethod || ''} ${user.lastPath || ''}`.trim() || '—';
      return `<article class="diagnostic-row"><strong>${escapeHtml(actor)}</strong><span>${escapeHtml(t('last_seen'))}: ${escapeHtml(formatDateTime(user.lastSeenAt))} | ${escapeHtml(t('last_request'))}: ${escapeHtml(request)} | ${escapeHtml(t('ip_address'))}: ${escapeHtml(user.ip || '—')}</span>${user.userAgent ? `<small>${escapeHtml(t('user_agent'))}: ${escapeHtml(user.userAgent)}</small>` : ''}</article>`;
    }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
    byId('runtimeErrorRows').innerHTML = errors.length ? errors.map((item) => {
      const path = `${item.method || ''} ${item.path || ''}`.trim();
      return `<article class="diagnostic-row is-error"><strong>${escapeHtml(formatDateTime(item.createdAt))} · ${escapeHtml(item.actor || 'system')}</strong><span>${escapeHtml(t('error_source'))}: ${escapeHtml(item.source || '—')}${item.status ? ` | ${escapeHtml(t('error_status'))}: ${escapeHtml(String(item.status))}` : ''}${path ? ` | ${escapeHtml(path)}` : ''}</span><small>${escapeHtml(item.message || '—')}</small>${item.stack ? `<pre>${escapeHtml(item.stack)}</pre>` : ''}</article>`;
    }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
  }

  function applyLocalization() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-v2-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.v2I18n);
    });
    document.querySelectorAll('[data-v2-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.v2Placeholder); });
    const view = getActiveView();
    const titleKey = view === 'diagnostics' ? 'runtime_diagnostics' : view === 'audit' ? 'audit_history' : view === 'asset-rights' ? 'asset_rights' : view === 'metadata' ? 'metadata_generation' : view === 'settings' ? 'settings' : view === 's3-sharing' ? 's3_sharing' : 'system_health';
    const subtitleKey = view === 'diagnostics' ? 'diagnostics_page_subtitle' : view === 'audit' ? 'audit_page_subtitle' : view === 'asset-rights' ? 'rights_page_subtitle' : view === 'metadata' ? 'metadata_page_subtitle' : view === 'settings' ? 'settings_page_subtitle' : view === 's3-sharing' ? 's3_sharing_subtitle' : 'health_page_subtitle';
    byId('v2PageTitle').textContent = t(titleKey);
    byId('v2PageSubtitle').textContent = t(subtitleKey);
    document.title = `Belgelik Admin — ${byId('v2PageTitle').textContent}`;
    localizeSettingsText();
  }

  function canUseFullAdmin() {
    return Boolean(adminPermissions?.isSuperAdmin || adminPermissions?.canAccessAdmin || adminPermissions?.isAdmin);
  }

  function allowedAdminViews() {
    if (!adminPermissions) return [];
    const allowed = [];
    if (canUseFullAdmin()) allowed.push('health', 'diagnostics', 'audit');
    if (adminPermissions.canAccessAssetRightsAdmin || canUseFullAdmin()) allowed.push('asset-rights');
    if (adminPermissions.canAccessMetadataAdmin || canUseFullAdmin()) allowed.push('metadata');
    if (adminPermissions.canAccessTextAdmin || canUseFullAdmin()) allowed.push('settings');
    if (adminPermissions.canAccessS3Sharing || canUseFullAdmin()) allowed.push('s3-sharing');
    return allowed;
  }

  function getActiveView() {
    const requested = new URLSearchParams(global.location.search).get('view') || 'health';
    const allowed = allowedAdminViews();
    return allowed.includes(requested) ? requested : (allowed[0] || '');
  }

  function applyAdminAccess() {
    const allowed = allowedAdminViews();
    const view = getActiveView();
    byId('v2MetadataSettingsForm').hidden = Boolean(adminPermissions?.canAccessMetadataAdmin && !canUseFullAdmin());
    document.querySelectorAll('[data-v2-view-link]').forEach((link) => {
      const permitted = allowed.includes(link.dataset.v2ViewLink);
      link.hidden = !permitted;
      link.setAttribute('aria-hidden', String(!permitted));
      if (!permitted) link.setAttribute('tabindex', '-1'); else link.removeAttribute('tabindex');
    });
    const requested = new URLSearchParams(global.location.search).get('view') || 'health';
    if (view && view !== requested) {
      const url = new URL(global.location.href);
      if (view === 'health') url.searchParams.delete('view'); else url.searchParams.set('view', view);
      global.history.replaceState({}, '', url);
    }

    const scopedTextOnly = Boolean(adminPermissions?.canAccessTextAdmin && !canUseFullAdmin());
    document.querySelectorAll('[data-settings-tab]').forEach((button) => {
      const permitted = !scopedTextOnly || ['proxy', 'ocr', 'subtitle'].includes(button.dataset.settingsTab);
      button.hidden = !permitted;
      button.setAttribute('aria-hidden', String(!permitted));
      if (!permitted) button.setAttribute('tabindex', '-1'); else button.removeAttribute('tabindex');
    });
    if (scopedTextOnly) {
      ['ocr', 'subtitle'].forEach((tab) => {
        const form = byId(tab === 'ocr' ? 'v2OcrSettingsForm' : 'v2SubtitleSettingsForm');
        form?.querySelectorAll(':scope > h3, :scope > fieldset, :scope > .settings-actions').forEach((element) => { element.hidden = true; });
      });
      const activeTab = byId('settingsTabs').querySelector('[data-settings-tab].is-active');
      if (!activeTab || activeTab.hidden) {
        byId('settingsTabs').querySelector('[data-settings-tab]:not([hidden])')?.click();
      }
    }
    if (!allowed.length) {
      byId('pageError').textContent = localizedSettingsNotice('No admin sections are assigned to your account.', 'Hesabınıza yönetim bölümü atanmamış.');
      byId('pageError').hidden = false;
    } else {
      byId('pageError').hidden = true;
    }
    document.body.classList.remove('admin-access-pending');
  }

  function applyView() {
    const view = getActiveView();
    document.querySelectorAll('[data-v2-view]').forEach((element) => { element.hidden = !view || element.dataset.v2View !== view; });
    document.querySelectorAll('[data-v2-view-link]').forEach((link) => {
      const active = link.dataset.v2ViewLink === view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    applyAdminAccess();
    applyLocalization();
  }

  async function refreshDiagnostics() {
    hideError();
    byId('diagnosticsMessage').textContent = '';
    byId('refreshDiagnosticsBtn').disabled = true;
    try {
      renderRuntimeDiagnostics(await api('/api/admin/runtime-diagnostics?limit=100'));
    } catch (error) {
      byId('diagnosticsMessage').textContent = `${t('diagnostics_load_failed')} ${String(error?.message || '')}`.trim();
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
      return `<article class="audit-row"><time datetime="${escapeHtml(event.createdAt || '')}">${escapeHtml(formatDateTime(event.createdAt))}</time><strong>${escapeHtml(event.actor || 'unknown')}</strong><span>${escapeHtml(auditActionLabel(event.action))}<b>${escapeHtml(title)}</b></span><small>${escapeHtml(details || '—')}</small></article>`;
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
      return `<tr class="rights-data-row${isPrivate ? ' is-private' : ''}${item.inTrash ? ' is-trash' : ''}" data-rights-row><td class="rights-name"><span class="rights-name-line"><strong>${escapeHtml(title)}</strong>${item.inTrash ? `<b class="rights-bin-state">${escapeHtml(t('in_bin'))}</b>` : ''}</span><small>${escapeHtml(mode === 'type' ? t('asset_types') : `${item.type || rightsTypeLabel(typeGroup)} · ${item.owner || item.fileName || id}`)}</small>${lockOwner ? `<span class="rights-lock">${escapeHtml(t('locked_by'))}: ${escapeHtml(lockOwner)}</span>` : ''}</td>${assetCells}${fields.map((name) => inputCell(name, item[name])).join('')}<td class="rights-table-actions"><button class="primary-link button-reset" type="submit" form="${formId}">${escapeHtml(t('save'))}</button>${mode === 'asset' && lockOwner ? `<button class="danger" type="button" data-unlock-id="${escapeHtml(id)}">${escapeHtml(t('unlock'))}</button>` : ''}</td></tr>`;
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

  const setFormValue = (form, name, value) => {
    const field = form?.elements?.[name];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = String(value ?? '');
  };
  const numberValue = (form, name, fallback) => Number(form?.elements?.[name]?.value) || fallback;
  const settingsMessage = (value) => { byId('v2SettingsMessage').textContent = String(value || ''); };

  function writeSettingsForms(settings = {}) {
    const general = byId('v2SettingsForm');
    ['playerUiMode','newAssetDefaultVisibility','allowFilelessAssetCreation','apiTokenEnabled','oidcBearerEnabled','apiToken','oidcIssuerUrl','oidcJwksUrl','oidcAudience'].forEach((name) => setFormValue(general, name, settings[name]));
    const concurrency = settings.mediaJobConcurrency || {};
    [['Subtitle','subtitle',1],['VideoOcr','videoOcr',1],['Proxy','proxy',1],['Metadata','metadata',1],['Thumbnail','thumbnail',2],['Upload','upload',3],['Download','download',6],['Backup','backup',1]].forEach(([suffix,key,fallback]) => setFormValue(general, `mediaJobConcurrency${suffix}`, Number(concurrency[key]) || fallback));
    const ocr = byId('v2OcrSettingsForm');
    ['ocrDefaultIntervalSec','ocrDefaultMinDisplaySec','ocrDefaultMergeGapSec','ocrDefaultEngine','ocrDefaultAdvancedMode','ocrDefaultTurkishAiCorrect','ocrDefaultEnableBlurFilter','ocrDefaultEnableRegionMode','ocrDefaultIgnoreStaticOverlays'].forEach((name) => setFormValue(ocr, name, settings[name]));
    const subtitle = byId('v2SubtitleSettingsForm');
    const style = settings.subtitleStyle || {};
    setFormValue(subtitle, 'customOverlay', style.customOverlayEnabled !== false); setFormValue(subtitle, 'bottomOffsetPx', style.bottomOffset ?? 56); setFormValue(subtitle, 'fontSizePx', style.fontSize ?? 24); setFormValue(subtitle, 'textColor', style.textColor || '#ffffff'); setFormValue(subtitle, 'backgroundColor', style.backgroundColor || '#000000'); setFormValue(subtitle, 'backgroundOpacity', style.backgroundOpacity ?? .72); setFormValue(subtitle, 'horizontalPaddingPx', style.horizontalPadding ?? 16); setFormValue(subtitle, 'maxWidthPercent', style.maxWidth ?? 82);
    const backup = byId('v2BackupSettingsForm');
    const backupData = settings.backup || {};
    ['enabled','directory','dailyHour','retentionDays','includeMamDb','includeKeycloakDb','includeUploadsArchive','includeUploadsRestic','resticRepository','resticKeepDaily','resticKeepWeekly','resticKeepMonthly'].forEach((name) => setFormValue(backup, name, backupData[name]));
    const session = byId('v2SessionSettingsForm');
    const auth = settings.authSession || {};
    ['rememberMe','ssoIdleMinutes','ssoMaxHours','clientIdleMinutes','clientMaxHours'].forEach((name) => setFormValue(session, name, auth[name]));
    const metadataForm = byId('v2MetadataSettingsForm');
    const aiModels = settings.aiModels || {};
    const metadataModel = aiModels.metadata || {};
    const translationModel = aiModels.subtitleTranslation || {};
    setFormValue(metadataForm, 'metadataModelEnabled', metadataModel.enabled !== false);
    setFormValue(metadataForm, 'metadataModelProvider', metadataModel.provider || 'ollama');
    setFormValue(metadataForm, 'metadataModelName', metadataModel.model || 'gemma3:4b');
    setFormValue(metadataForm, 'metadataModelBaseUrl', metadataModel.baseUrl || 'http://host.docker.internal:11434');
    setFormValue(metadataForm, 'metadataModelDir', metadataModel.modelDir || '');
    setFormValue(metadataForm, 'metadataModelKeepAlive', metadataModel.keepAlive || '10m');
    setFormValue(metadataForm, 'metadataModelTimeoutMs', Number(metadataModel.timeoutMs) || 600000);
    setFormValue(metadataForm, 'subtitleTranslationModelEnabled', Boolean(translationModel.enabled));
    setFormValue(metadataForm, 'subtitleTranslationModelProvider', translationModel.provider || 'local-transformers');
    setFormValue(metadataForm, 'subtitleTranslationModelName', translationModel.model || 'Helsinki-NLP/opus-mt-tc-big-en-tr');
    setFormValue(metadataForm, 'subtitleTranslationModelDir', translationModel.modelDir || '/opt/mam-models/marian/opus-mt-tc-big-en-tr');
  }

  async function loadV2Settings() {
    settingsMessage('');
    try { writeSettingsForms(await api('/api/admin/settings')); } catch (error) { settingsMessage(error.message); }
  }

  async function loadMetadataSuggestions() {
    const input = byId('v2MetadataAssetName');
    const box = byId('v2MetadataSuggestions');
    const query = input.value.trim();
    input.dataset.assetId = '';
    if (query.length < 3) { box.hidden = true; box.innerHTML = ''; return; }
    try {
      const rows = await api(`/api/admin/metadata/assets/suggest?q=${encodeURIComponent(query)}&limit=8&includeTrash=0`);
      box.innerHTML = (rows || []).map((item) => `<button type="button" data-metadata-id="${escapeHtml(item.id)}" data-metadata-name="${escapeHtml(item.title || item.fileName || item.id)}"><strong>${highlightSuggestion(item.title || item.fileName || item.id, query)}</strong><small>${escapeHtml(item.type || '—')} · ${escapeHtml(item.fileName || '—')}</small></button>`).join('');
      box.hidden = !box.innerHTML;
    } catch (_error) { box.hidden = true; }
  }

  function readBackupForm() {
    const form = byId('v2BackupSettingsForm');
    return { enabled: form.elements.enabled.checked, directory: form.elements.directory.value.trim(), dailyHour: numberValue(form,'dailyHour',0), retentionDays: numberValue(form,'retentionDays',14), includeMamDb: form.elements.includeMamDb.checked, includeKeycloakDb: form.elements.includeKeycloakDb.checked, includeUploadsArchive: form.elements.includeUploadsArchive.checked, includeUploadsRestic: form.elements.includeUploadsRestic.checked, resticRepository: form.elements.resticRepository.value.trim(), resticKeepDaily: numberValue(form,'resticKeepDaily',14), resticKeepWeekly: numberValue(form,'resticKeepWeekly',8), resticKeepMonthly: numberValue(form,'resticKeepMonthly',12) };
  }

  async function loadV2Backups() {
    const target = byId('v2BackupFiles');
    try {
      const result = await api('/api/admin/backups');
      target.innerHTML = (result.files || []).map((file) => `<div class="settings-record"><strong>${escapeHtml(file.fileName || '')}</strong><span>${escapeHtml(`${Math.max(0, Number(file.size) || 0)} B`)} · ${escapeHtml(formatDateTime(file.updatedAt))}</span><button class="danger-button" type="button" data-backup-delete="${escapeHtml(file.fileName || '')}">Delete</button></div>`).join('');
      localizeSettingsText();
    } catch (error) { target.innerHTML = `<div class="diagnostic-empty">${escapeHtml(error.message)}</div>`; }
  }

  const highlightSuggestion = (value, query) => {
    const text = String(value || '');
    const needle = String(query || '').trim();
    if (!needle) return escapeHtml(text);
    const index = text.toLocaleLowerCase(language === 'tr' ? 'tr' : 'en').indexOf(needle.toLocaleLowerCase(language === 'tr' ? 'tr' : 'en'));
    if (index < 0) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + needle.length))}</mark>${escapeHtml(text.slice(index + needle.length))}`;
  };

  function formatEditorTimecode(seconds = 0) {
    const totalFrames = Math.max(0, Math.round((Number(seconds) || 0) * 25));
    const frames = totalFrames % 25; const totalSeconds = Math.floor(totalFrames / 25);
    const sec = totalSeconds % 60; const min = Math.floor(totalSeconds / 60) % 60; const hour = Math.floor(totalSeconds / 3600);
    return [hour, min, sec, frames].map((value) => String(value).padStart(2, '0')).join(':');
  }

  function parseEditorTimecode(value = '') {
    const match = String(value).trim().match(/^(\d{2}):(\d{2}):(\d{2})(?:([.,:])(\d{2,3}))?$/);
    if (!match) return null;
    const separator = match[4] || '';
    const fraction = match[5] || '';
    const fractionSeconds = fraction
      ? separator === ':' && fraction.length <= 2
        ? Number(fraction) / 25
        : Number(fraction.padEnd(3, '0').slice(0, 3)) / 1000
      : 0;
    return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + fractionSeconds;
  }

  function openTextEditorModal({ title, content, mediaUrl = '', previewMode = 'audio', onSave }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      const mode = String(previewMode || 'audio').toLowerCase();
      const safeUrl = String(mediaUrl || '').trim();
      const media = safeUrl && mode === 'video' ? `<video class="v2-content-editor-media" controls preload="metadata" src="${escapeHtml(safeUrl)}"></video>`
        : safeUrl && ['image','photo'].includes(mode) ? `<img class="v2-content-editor-media" src="${escapeHtml(safeUrl)}" alt="" />`
        : safeUrl ? `<audio class="v2-content-editor-audio" controls preload="metadata" src="${escapeHtml(safeUrl)}"></audio>` : '';
      backdrop.className = 'v2-content-editor-backdrop';
      backdrop.innerHTML = `<section class="v2-content-editor" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Editor')}"><header><h3>${escapeHtml(title || 'Editor')}</h3><button class="v2-editor-close" type="button" aria-label="Close">×</button></header><div class="v2-content-editor-body"><div class="v2-content-editor-main">${media ? `<div class="v2-content-editor-preview">${media}<span class="v2-editor-timecode">00:00:00:00</span></div>` : ''}<div class="v2-content-editor-toolbar"><input class="v2-editor-find" placeholder="${escapeHtml(t('find_label'))}" /><input class="v2-editor-replace" placeholder="${escapeHtml(t('replace_label'))}" /><button class="secondary-button v2-editor-find-next" type="button">${escapeHtml(t('find_next'))}</button><button class="secondary-button v2-editor-replace-all" type="button">${escapeHtml(t('replace_all'))}</button></div><div class="v2-content-editor-layout"><div class="v2-editor-text"><textarea class="v2-editor-area" aria-hidden="true" tabindex="-1"></textarea><div class="v2-editor-rich" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false"></div></div></div><div class="v2-content-editor-status"></div></div><aside class="v2-editor-corrections"><h4>${escapeHtml(t('learned_corrections_title'))}</h4><input class="v2-editor-wrong" placeholder="${escapeHtml(t('learned_wrong_ph'))}" /><input class="v2-editor-correct" placeholder="${escapeHtml(t('learned_correct_ph'))}" /><div class="v2-editor-correction-actions"><button class="secondary-button v2-editor-use-selection" type="button">${escapeHtml(t('learned_use_selection'))}</button><button class="secondary-button v2-editor-add-correction" type="button">${escapeHtml(t('learned_add'))}</button></div><div class="v2-editor-correction-message"></div><div class="v2-editor-correction-rows"></div></aside></div><footer><button class="secondary-button v2-editor-cancel" type="button">${escapeHtml(t('content_cancel'))}</button><button class="primary-link button-reset v2-editor-save" type="button">${escapeHtml(t('content_save'))}</button></footer></section>`;
      document.body.append(backdrop);
      const area = backdrop.querySelector('.v2-editor-area');
      const richArea = backdrop.querySelector('.v2-editor-rich');
      const status = backdrop.querySelector('.v2-content-editor-status');
      const correctionMessage = backdrop.querySelector('.v2-editor-correction-message');
      const correctionRows = backdrop.querySelector('.v2-editor-correction-rows');
      const mediaElement = backdrop.querySelector('audio,video');
      const timecode = backdrop.querySelector('.v2-editor-timecode');
      area.value = String(content || '');
      let findPosition = 0;
      let findQuery = '';
      const decorateText = (value) => escapeHtml(String(value || '')).replace(/\b\d{2}:\d{2}:\d{2}(?:[.,:]\d{2,3})?\b/g, (token) => `<span class="v2-editor-inline-tc" data-editor-timecode="${escapeHtml(token)}">${escapeHtml(token)}</span>`);
      const renderEditor = (activeRange = null) => {
        const source = String(area.value || '');
        const start = Number(activeRange?.start);
        const end = Number(activeRange?.end);
        richArea.innerHTML = Number.isFinite(start) && Number.isFinite(end) && end > start
          ? `${decorateText(source.slice(0, start))}<span class="v2-editor-find-hit">${decorateText(source.slice(start, end))}</span>${decorateText(source.slice(end))}`
          : decorateText(source);
      };
      const syncSource = () => {
        area.value = String(richArea.textContent || '').replace(/\r\n?/g, '\n');
        findPosition = 0;
        findQuery = '';
      };
      const insertText = (value) => {
        const selection = window.getSelection?.();
        if (!selection || !document.createRange) return;
        let range = selection.rangeCount ? selection.getRangeAt(0) : null;
        if (!range || !richArea.contains(range.commonAncestorContainer)) {
          range = document.createRange(); range.selectNodeContents(richArea); range.collapse(false);
        }
        range.deleteContents();
        const node = document.createTextNode(String(value || ''));
        range.insertNode(node); range.setStartAfter(node); range.collapse(true);
        selection.removeAllRanges(); selection.addRange(range); syncSource();
      };
      const selectEditorRange = (start, end) => {
        const selection = window.getSelection?.();
        if (!selection || !document.createTreeWalker || !document.createRange) return;
        const walker = document.createTreeWalker(richArea, window.NodeFilter?.SHOW_TEXT || 4);
        let offset = 0, startNode, endNode, startOffset = 0, endOffset = 0, node;
        while ((node = walker.nextNode())) {
          const next = offset + String(node.nodeValue || '').length;
          if (!startNode && start <= next) { startNode = node; startOffset = Math.max(0, start - offset); }
          if (end <= next) { endNode = node; endOffset = Math.max(0, end - offset); break; }
          offset = next;
        }
        if (!startNode || !endNode) return;
        const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset);
        richArea.focus({ preventScroll:true }); selection.removeAllRanges(); selection.addRange(range);
      };
      renderEditor();
      const close = (value = null) => { mediaElement?.pause?.(); backdrop.remove(); resolve(value); };
      const findNext = () => {
        const query = backdrop.querySelector('.v2-editor-find').value.trim();
        if (!query) return;
        const source = area.value.toLocaleLowerCase(language === 'tr' ? 'tr' : 'en');
        const needle = query.toLocaleLowerCase(language === 'tr' ? 'tr' : 'en');
        if (needle !== findQuery) { findPosition = 0; findQuery = needle; }
        let index = source.indexOf(needle, findPosition); if (index < 0) index = source.indexOf(needle);
        if (index < 0) return;
        renderEditor({start:index, end:index + query.length});
        richArea.querySelector('.v2-editor-find-hit')?.scrollIntoView({block:'center', inline:'nearest'});
        selectEditorRange(index, index + query.length); findPosition = index + query.length;
      };
      const replaceAll = () => {
        const query = backdrop.querySelector('.v2-editor-find').value; if (!query) return;
        const replacement = backdrop.querySelector('.v2-editor-replace').value;
        area.value = area.value.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), replacement); renderEditor();
      };
      const applyCorrection = (wrong, correct) => { if (wrong) { area.value = area.value.replace(new RegExp(String(wrong).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), String(correct || '')); renderEditor(); } };
      const renderCorrections = (entries = []) => { correctionRows.innerHTML = entries.map((item) => `<div class="v2-editor-correction-row" data-wrong="${escapeHtml(item.wrong || '')}" data-correct="${escapeHtml(item.correct || '')}"><span><strong>${escapeHtml(item.wrong || '')}</strong><small>${escapeHtml(item.correct || '')}</small></span><span><button class="secondary-button" data-correction-apply type="button">${escapeHtml(t('learned_apply'))}</button><button class="danger-button" data-correction-delete type="button">${escapeHtml(t('learned_delete'))}</button></span></div>`).join('') || `<div class="diagnostic-empty">${escapeHtml(t('learned_none'))}</div>`; };
      const loadCorrections = async () => { try { const result = await api('/api/admin/turkish-corrections'); renderCorrections(result.entries || []); } catch (error) { correctionMessage.textContent = error.message; } };
      backdrop.querySelector('.v2-editor-find-next').addEventListener('click', findNext);
      backdrop.querySelector('.v2-editor-find').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); findNext(); } });
      backdrop.querySelector('.v2-editor-replace-all').addEventListener('click', replaceAll);
      richArea.addEventListener('beforeinput', (event) => { if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') { event.preventDefault(); insertText('\n'); } });
      richArea.addEventListener('paste', (event) => { const text = event.clipboardData?.getData('text/plain'); if (typeof text === 'string') { event.preventDefault(); insertText(text); } });
      richArea.addEventListener('input', syncSource);
      richArea.addEventListener('click', (event) => { const target = event.target.closest('[data-editor-timecode]'); if (!target) return; const seconds = parseEditorTimecode(target.dataset.editorTimecode); if (!Number.isFinite(seconds)) return; richArea.querySelectorAll('.v2-editor-inline-tc').forEach((item) => item.classList.toggle('active', item === target)); if (mediaElement) mediaElement.currentTime = Math.max(0, seconds); if (timecode) timecode.textContent = formatEditorTimecode(seconds); });
      backdrop.querySelector('.v2-editor-use-selection').addEventListener('click', () => { const selection = window.getSelection?.(); const selected = selection && richArea.contains(selection.anchorNode) ? selection.toString().trim() : ''; if (selected) backdrop.querySelector('.v2-editor-wrong').value = selected; });
      backdrop.querySelector('.v2-editor-add-correction').addEventListener('click', async () => { const wrong = backdrop.querySelector('.v2-editor-wrong').value.trim(), correct = backdrop.querySelector('.v2-editor-correct').value.trim(); if (!wrong || !correct) return; try { await api('/api/admin/turkish-corrections', { method:'POST', body:JSON.stringify({wrong, correct}) }); applyCorrection(wrong, correct); await loadCorrections(); } catch (error) { correctionMessage.textContent = error.message; } });
      correctionRows.addEventListener('click', async (event) => { const row = event.target.closest('.v2-editor-correction-row'); if (!row) return; if (event.target.closest('[data-correction-apply]')) applyCorrection(row.dataset.wrong, row.dataset.correct); if (event.target.closest('[data-correction-delete]')) { await api(`/api/admin/turkish-corrections?wrong=${encodeURIComponent(row.dataset.wrong)}`, {method:'DELETE'}); await loadCorrections(); } });
      mediaElement?.addEventListener('timeupdate', () => { if (timecode) timecode.textContent = formatEditorTimecode(mediaElement.currentTime); });
      backdrop.querySelector('.v2-editor-close').addEventListener('click', () => close(null));
      backdrop.querySelector('.v2-editor-cancel').addEventListener('click', () => close(null));
      backdrop.querySelector('.v2-editor-save').addEventListener('click', async (event) => { event.currentTarget.disabled = true; try { syncSource(); status.textContent = `${t('loading')}...`; await onSave(String(area.value || '')); status.textContent = t('content_saved'); } catch (error) { status.textContent = error.message; } finally { event.currentTarget.disabled = false; } });
      backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(null); });
      loadCorrections(); richArea.focus();
    });
  }

  function mountUserPermissionSettings() {
    const identitySection = byId('v2IdentitySummary')?.closest('.settings-record-section');
    if (!identitySection || byId('userPermissionsRows')) return;
    const section = document.createElement('section');
    section.className = 'settings-record-section';
    section.innerHTML = `<h3 data-v2-i18n="principal_settings">User / Group Settings</h3><div class="settings-principal-toolbar"><select id="userPermissionsPrincipalType" aria-label="Principal type"><option value="user" data-v2-i18n="principal_type_user">User</option><option value="group" data-v2-i18n="principal_type_group">Group</option></select><input id="userPermissionsSearchInput" placeholder="Search user or group..." autocomplete="off" /><button id="userPermissionsSearchButton" class="secondary-button" type="button" data-v2-i18n="principal_search">Search</button></div><div id="userPermissionsRows" class="settings-admin-rows user-permissions-rows"></div><div id="userPermissionsMsg" class="inline-message"></div>`;
    identitySection.before(section);
  }
  mountUserPermissionSettings();
  function placeSessionSaveInsideBox() {
    const form = byId('v2SessionSettingsForm');
    const parameters = form?.querySelector('fieldset .settings-number-grid');
    const actions = form?.querySelector(':scope > .settings-actions');
    if (!parameters || !actions) return;
    actions.classList.add('settings-session-save');
    parameters.append(actions);
  }
  placeSessionSaveInsideBox();
  let editingGroupAdminId = '';
  function mountGroupAdministratorSettings() {
    const rows = byId('v2GroupAdmins');
    const section = rows?.closest('.settings-record-section');
    if (!section) return;
    section.innerHTML = `<h3>Group Administrators</h3><div class="settings-group-admin-form"><label><span>Managed group</span><input id="v2GroupAdminGroup" placeholder="archive-team" list="v2IdentityGroupOptions" /></label><label><span>Manager user/group</span><input id="v2GroupAdminUser" placeholder="username" list="v2IdentityUserOptions" /></label><fieldset class="settings-group-admin-scopes"><legend>Scopes</legend><span id="v2GroupAdminScopes" class="settings-type-checks" role="group"><label><input type="checkbox" value="asset-rights" /><span>Asset rights</span></label><label><input type="checkbox" value="document-rights" /><span>Document rights</span></label><label><input type="checkbox" value="text-admin" /><span>OCR / subtitle</span></label><label><input type="checkbox" value="s3-share" /><span>S3 sharing</span></label></span></fieldset><fieldset class="settings-group-admin-scopes settings-group-admin-types"><legend>Asset type</legend><span id="v2GroupAdminTypes" class="settings-type-checks" role="group"><label><input type="checkbox" value="document" /><span>Document</span></label><label><input type="checkbox" value="video" /><span>Video</span></label><label><input type="checkbox" value="audio" /><span>Audio</span></label><label><input type="checkbox" value="photo" /><span>Photo</span></label><label><input type="checkbox" value="other" /><span>Other</span></label></span></fieldset><button id="v2AddGroupAdmin" class="primary-link button-reset" type="button">Add</button></div><datalist id="v2IdentityGroupOptions"></datalist><datalist id="v2IdentityUserOptions"></datalist><div id="v2GroupAdmins" class="settings-group-admin-table"></div><div id="v2GroupAdminsMessage" class="inline-message"></div>`;
  }
  mountGroupAdministratorSettings();

  const recordsModule = global.createAdminRecordsModule({
    api, t, escapeHtml, highlightSuggestion, openTextEditorModal,
    onPermissionsSaved: loadV2GroupAdmins,
    userPermissionsSearchInput: byId('userPermissionsSearchInput'), userPermissionsPrincipalType: byId('userPermissionsPrincipalType'), userPermissionsSearchButton: byId('userPermissionsSearchButton'),
    userPermissionsRows: byId('userPermissionsRows'), userPermissionsMsg: byId('userPermissionsMsg'), userPermissionsPageSize: byId('userPermissionsPageSize'),
    userPermissionsPrevPage: byId('userPermissionsPrevPage'), userPermissionsNextPage: byId('userPermissionsNextPage'), userPermissionsPageInfo: byId('userPermissionsPageInfo'),
    ocrAdminSearchInput: byId('ocrAdminSearchInput'), ocrRecordsRows: byId('ocrRecordsRows'), ocrRecordsMsg: byId('ocrRecordsMsg'),
    runOcrAdminSearchBtn: byId('runOcrAdminSearchBtn'), ocrRecordsPrevPage: byId('ocrRecordsPrevPage'), ocrRecordsNextPage: byId('ocrRecordsNextPage'), ocrRecordsPageInfo: byId('ocrRecordsPageInfo'),
    subtitleAdminSearchInput: byId('subtitleAdminSearchInput'), subtitleDeleteFileCheck: byId('subtitleDeleteFileCheck'), subtitleRecordsRows: byId('subtitleRecordsRows'), subtitleRecordsMsg: byId('subtitleRecordsMsg'),
    subtitleRecordsPrevPage: byId('subtitleRecordsPrevPage'), subtitleRecordsNextPage: byId('subtitleRecordsNextPage'), subtitleRecordsPageInfo: byId('subtitleRecordsPageInfo'),
    combinedSearchInput: byId('combinedSearchInput'), combinedSearchLimit: byId('combinedSearchLimit'), runCombinedSearchBtn: byId('runCombinedSearchBtn'), combinedSearchRows: byId('combinedSearchRows'), combinedSearchMsg: byId('combinedSearchMsg')
  });
  recordsModule.init();

  async function loadV2ProxyJobs() {
    const target = byId('v2ProxyJobs');
    try {
      const jobs = await api('/api/admin/proxy-jobs');
      target.innerHTML = (jobs || []).map((job) => {
        const status = String(job.status || 'queued').toLowerCase();
        const label = status === 'completed' ? localizedSettingsNotice('Proxy generated', 'Proxy üretildi') : status === 'running' ? localizedSettingsNotice('Proxy is being generated', 'Proxy üretiliyor') : status === 'queued' ? localizedSettingsNotice('Proxy generation queued', 'Proxy üretimi sıraya alındı') : status;
        const statusClass = status === 'completed' ? ' is-success' : status === 'failed' ? ' is-error' : '';
        return `<div class="settings-record"><strong class="proxy-job-status${statusClass}">${escapeHtml(label)}</strong><span>${escapeHtml(`${Number(job.processed || 0)} / ${Number(job.total || 0)}`)}</span><span>${escapeHtml(formatDateTime(job.updatedAt || job.createdAt))}</span></div>`;
      }).join('') || `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
      localizeSettingsText();
    } catch (error) { target.innerHTML = `<div class="diagnostic-empty">${escapeHtml(error.message)}</div>`; }
  }

  async function scanV2MissingProxy({ autoGenerate = false } = {}) {
    const rows = byId('v2MissingProxyRows');
    v2MissingProxyScanController?.abort();
    v2MissingProxyScanController = new AbortController();
    const signal = v2MissingProxyScanController.signal;
    byId('v2ScanMissingProxy').disabled = true;
    byId('v2GenerateAllProxy').disabled = true;
    byId('v2StopMissingProxy').disabled = false;
    rows.innerHTML = `<div class="diagnostic-empty">${escapeHtml(t('loading'))}...</div>`;
    const query = byId('v2ProxyIncludeTrash').checked ? '?includeTrash=1' : '';
    try {
      const result = await api(`/api/admin/proxy-missing-scan${query}`, { signal });
      const items = result.items || [];
      rows.innerHTML = items.map((item) => `<div class="settings-record"><strong>${escapeHtml(item.title || item.fileName || item.id)}</strong><span>${escapeHtml((item.missingComponents || []).join(' / '))}</span><button class="secondary-button" type="button" data-proxy-repair="${escapeHtml(item.id)}" data-proxy-mode="${escapeHtml(v2MissingProxyMode(item))}">Generate</button></div>`).join('') || `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
      localizeSettingsText();
      if (autoGenerate && items.length) {
        byId('v2ProxyStatus').textContent = localizedSettingsNotice(`Generating ${items.length} missing item(s)...`, `${items.length} eksik öğe üretiliyor...`);
        const proxyItems = items.filter((item) => v2MissingProxyMode(item) === 'proxy');
        const directItems = items.filter((item) => v2MissingProxyMode(item) !== 'proxy');
        for (const item of directItems) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          await repairV2MissingProxy(item, signal);
        }
        let proxyJob = null;
        if (proxyItems.length && !signal.aborted) {
          proxyJob = await api('/api/admin/proxy-jobs', { method:'POST', body:JSON.stringify({ assetIds:proxyItems.map((item) => item.id), includeTrash:byId('v2ProxyIncludeTrash').checked }), signal });
        }
        const status = byId('v2ProxyStatus');
        status.classList.remove('is-success', 'is-error');
        if (proxyJob) {
          status.textContent = localizedSettingsNotice(`Proxy generation queued for ${proxyItems.length} item(s).`, `${proxyItems.length} öğe için proxy üretimi sıraya alındı; tamamlanınca görev listesinde “Proxy üretildi” olarak görünecek.`);
        } else {
          status.textContent = localizedSettingsNotice(`Generation completed for ${directItems.length} item(s).`, `${directItems.length} öğenin üretimi tamamlandı.`);
          status.classList.add('is-success');
        }
        await loadV2ProxyJobs();
      }
    } catch (error) {
      if (error?.name === 'AbortError') byId('v2ProxyStatus').textContent = localizedSettingsNotice('Scan stopped.', 'Tarama durduruldu.');
      else throw error;
    } finally {
      byId('v2ScanMissingProxy').disabled = false;
      byId('v2GenerateAllProxy').disabled = false;
      byId('v2StopMissingProxy').disabled = true;
      v2MissingProxyScanController = null;
    }
  }

  async function loadV2Identity() {
    const q = byId('v2IdentityUserSearch').value.trim();
    const result = await api(`/api/admin/identity/overview${q.length >= 2 ? `?userQ=${encodeURIComponent(q)}` : ''}`);
    const users = result.users || [], groups = result.groups || [], mamOnly = result.mamOnlyGroups || [];
    byId('v2IdentitySummary').innerHTML = `<div><strong>${users.length}</strong><p>Users</p></div><div><strong>${groups.length}</strong><p>Groups</p></div><div><strong>${escapeHtml(result.source || '-')}</strong><p>Source</p></div>`;
    byId('v2IdentityGroups').innerHTML = groups.map((item) => `<div class="settings-record"><strong>${escapeHtml(item.path || item.name || '-')}</strong><span>${escapeHtml(item.realm || '-')}</span></div>`).join('');
    byId('v2IdentityUsers').innerHTML = users.map((item) => `<div class="settings-record"><strong>${escapeHtml(item.username || '-')}</strong><span>${escapeHtml(item.displayName || item.email || item.realm || '-')}</span></div>`).join('');
    byId('v2MamGroups').innerHTML = mamOnly.map((name) => `<div class="settings-record"><strong>${escapeHtml(name)}</strong><span>MAM DB</span></div>`).join('');
    const groupNames = Array.from(new Set(groups.map((item) => String(item.path || item.name || '').trim()).concat(mamOnly).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    byId('v2IdentityGroupOptions').innerHTML = groupNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
    byId('v2IdentityUserOptions').innerHTML = users.map((item) => String(item.username || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
    localizeSettingsText();
  }

  async function loadV2GroupAdmins() {
    const result = await api('/api/admin/group-admins');
    const scopeLabels = {'asset-rights':'Asset rights','document-rights':'Document rights','text-admin':'OCR / subtitle','s3-share':'S3 sharing'};
    const typeLabels = {document:'Document',video:'Video',audio:'Audio',photo:'Photo',other:'Other'};
    const list = result.groupAdmins || [];
    const header = `<div class="settings-group-admin-row is-header"><strong>Managed group</strong><strong>Manager user/group</strong><strong>Scope</strong><strong>Asset type</strong><strong>Created</strong><strong>Actions</strong></div>`;
    const body = list.map((item) => {
      const scopes = Array.isArray(item.adminScopes) && item.adminScopes.length ? item.adminScopes : ['asset-rights'];
      const types = Array.isArray(item.assetTypeGroups) ? item.assetTypeGroups : [];
      return `<div class="settings-group-admin-row"><strong>${escapeHtml(item.groupName || '-')}</strong><span>${escapeHtml(item.username || '-')}</span><span>${escapeHtml(scopes.map((value) => localizedSettingsLabel(scopeLabels[value] || value)).join(', '))}</span><span>${escapeHtml(types.length ? types.map((value) => localizedSettingsLabel(typeLabels[value] || value)).join(', ') : localizedSettingsLabel('All asset types'))}</span><span>${escapeHtml(formatDateTime(item.createdAt))}</span><span class="settings-group-admin-actions"><button class="secondary-button" type="button" data-group-admin-edit="${escapeHtml(item.id || '')}" data-group-name="${escapeHtml(item.groupName || '')}" data-username="${escapeHtml(item.username || '')}" data-scopes="${escapeHtml(JSON.stringify(scopes))}" data-types="${escapeHtml(JSON.stringify(types))}">Edit</button><button class="danger-button" type="button" data-group-admin-delete="${escapeHtml(item.id || '')}">Delete</button></span></div>`;
    }).join('');
    byId('v2GroupAdmins').innerHTML = list.length ? header + body : `<div class="diagnostic-empty">${escapeHtml(t('diagnostics_empty'))}</div>`;
    localizeSettingsText();
  }

  async function loadS3ShareSettings() {
    const section = byId('s3ShareSettingsSection');
    if (!section || !canUseFullAdmin()) return;
    section.hidden = false;
    const settings = await api('/api/admin/s3-sharing/settings');
    const form = byId('s3ShareSettingsForm');
    ['endpoint', 'region', 'bucket', 'defaultTtlDays', 'maxTtlDays'].forEach((name) => {
      if (form.elements[name]) form.elements[name].value = settings[name] ?? '';
    });
    form.elements.forcePathStyle.checked = Boolean(settings.forcePathStyle);
    form.elements.accessKeyId.value = '';
    form.elements.secretAccessKey.value = '';
    byId('s3ShareCredentialHint').textContent = settings.credentialsConfigured
      ? `${t('s3_credentials_saved')} ${settings.accessKeyHint || ''}`
      : '';
  }

  async function loadS3Shares() {
    const box = byId('s3ShareRows');
    try {
      const result = await api('/api/admin/s3-sharing/shares');
      const shares = Array.isArray(result.shares) ? result.shares : [];
      box.innerHTML = shares.length ? shares.map((item) => {
        const status = String(item.status || '').replaceAll('_', ' ');
        const canRevoke = ['queued', 'active', 'failed'].includes(String(item.status || '').toLowerCase());
        return `<article class="s3-share-row"><div class="s3-share-asset"><strong>${escapeHtml(item.asset_title || item.file_name || item.asset_id)}</strong><small>${escapeHtml(item.file_name || '')}</small></div><div class="s3-share-detail"><small>${escapeHtml(t('s3_share_status'))}</small><span class="s3-share-status">${escapeHtml(status)}</span></div><div class="s3-share-detail"><small>${escapeHtml(t('s3_share_created'))}</small><span>${escapeHtml(item.created_by || '—')}</span></div><div class="s3-share-detail"><small>${escapeHtml(t('s3_share_expires'))}</small><span>${escapeHtml(formatDateTime(item.expires_at))}</span></div>${canRevoke ? `<button class="danger-button" type="button" data-s3-share-revoke="${escapeHtml(item.share_id)}" data-s3-asset-id="${escapeHtml(item.asset_id)}">${escapeHtml(t('s3_share_delete'))}</button>` : '<span class="s3-share-no-action">—</span>'}</article>`;
      }).join('') : `<div class="diagnostic-empty">${escapeHtml(t('s3_share_none'))}</div>`;
    } catch (error) {
      box.innerHTML = `<div class="diagnostic-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadS3SharingView() {
    const isFullAdmin = canUseFullAdmin();
    byId('s3ShareSettingsSection').hidden = !isFullAdmin;
    if (isFullAdmin) {
      try { await loadS3ShareSettings(); } catch (error) { byId('s3ShareMessage').textContent = error.message; }
    }
    await loadS3Shares();
  }

  function triggerJsonDownload(blob, fallback) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fallback; link.click(); URL.revokeObjectURL(url);
  }

  let v2MissingProxyScanController = null;
  function mountMissingProxyActions() {
    const scan = byId('v2ScanMissingProxy');
    const auto = byId('v2GenerateAllProxy');
    const actions = scan?.parentElement;
    if (!scan || !auto || !actions || byId('v2StopMissingProxy')) return;
    actions.classList.add('settings-proxy-scan-actions');
    scan.textContent = 'Scan Missing Manually';
    scan.className = 'settings-scan-button settings-scan-manual';
    auto.textContent = 'Scan Missing Automatically';
    auto.className = 'settings-scan-button settings-scan-auto';
    const stop = document.createElement('button');
    stop.id = 'v2StopMissingProxy';
    stop.type = 'button';
    stop.className = 'settings-scan-button settings-scan-stop';
    stop.textContent = 'Stop scan';
    stop.disabled = true;
    actions.append(stop);
    localizeSettingsText();
  }
  mountMissingProxyActions();
  function compactAssetGenerationTool() {
    const input = byId('v2ProxyAssetName');
    const card = input?.closest('.settings-tool-card');
    const actions = byId('v2RunProxyTool')?.closest('.settings-actions');
    if (!card || !actions) return;
    card.classList.add('settings-asset-tool');
    actions.classList.add('settings-asset-tool-action');
  }
  compactAssetGenerationTool();

  function v2MissingProxyMode(item = {}) {
    if (item.missingProxy || item.badStatus || (item.missingComponents || []).includes('proxy')) return 'proxy';
    if (item.assetFamily === 'document') return 'document_thumbnail';
    if (item.assetFamily === 'image') return 'image_thumbnail';
    return 'thumbnail';
  }

  async function repairV2MissingProxy(item, signal) {
    const mode = v2MissingProxyMode(item);
    if (mode === 'proxy') return api('/api/admin/proxy-jobs', { method:'POST', body:JSON.stringify({assetIds:[item.id]}), signal });
    return api('/api/admin/proxy-tools/run', { method:'POST', body:JSON.stringify({assetId:item.id, mode}), signal });
  }

  function showError(error) {
    const element = byId('pageError');
    element.textContent = `System health could not be loaded: ${String(error?.message || error || 'Unknown error')}`;
    element.hidden = false;
  }

  function hideError() {
    byId('pageError').hidden = true;
  }

  function continuePageScrollAtContainerEdge(container, event) {
    if (!container || !event || event.defaultPrevented) return;
    if (Math.abs(Number(event.deltaY || 0)) <= Math.abs(Number(event.deltaX || 0))) return;
    const page = document.scrollingElement || document.documentElement;
    if (!page || page.scrollHeight <= page.clientHeight) return;
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    if (maxScrollTop <= 0) return;
    const deltaY = Number(event.deltaY || 0);
    const atTop = container.scrollTop <= 0;
    const atBottom = container.scrollTop >= maxScrollTop - 1;
    if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
      event.preventDefault();
      page.scrollTop += deltaY;
    }
  }

  function flashSection(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add('admin-section-flash');
    global.setTimeout(() => element.classList.remove('admin-section-flash'), 900);
  }

  async function openOverviewTarget(target) {
    if (target === 'system-health') {
      await refresh({ force: true });
      flashSection(byId('systemHealthRows').querySelector('[data-health-section="services"]') || byId('systemHealthRows'));
      return;
    }
    if (!['active-users', 'errors'].includes(target)) return;
    const url = new URL(global.location.href);
    url.searchParams.set('view', 'diagnostics');
    global.history.pushState({}, '', url);
    applyView();
    await refreshDiagnostics();
    flashSection(byId(target === 'active-users' ? 'activeUsersTitle' : 'runtimeErrorsTitle'));
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

  byId('refreshHealthBtn').addEventListener('click', () => {
    healthModule.clear();
    refresh({ force: true, forceServer: true });
  });
  byId('systemHealthRows').addEventListener('wheel', (event) => continuePageScrollAtContainerEdge(byId('systemHealthRows'), event), { passive: false });
  byId('systemJobStatus').addEventListener('wheel', (event) => {
    const tableWrap = event.target.closest('.media-jobs-table-wrap');
    if (tableWrap) continuePageScrollAtContainerEdge(tableWrap, event);
  }, { passive: false });
  document.querySelectorAll('[data-overview-target]').forEach((card) => {
    const open = () => openOverviewTarget(card.dataset.overviewTarget).catch(showError);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      open();
    });
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

  byId('settingsTabs').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-settings-tab]');
    if (!button) return;
    const tab = button.dataset.settingsTab;
    byId('settingsTabs').querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelectorAll('[data-settings-pane]').forEach((pane) => pane.classList.toggle('is-active', pane.dataset.settingsPane === tab));
    settingsMessage('');
    if (tab === 'proxy') await loadV2ProxyJobs();
    if (tab === 'ocr') await recordsModule.loadOcrRecords();
    if (tab === 'subtitle') await recordsModule.loadSubtitleRecords();
    if (tab === 'backup') await loadV2Backups();
    if (tab === 'users') await Promise.all([recordsModule.loadUserPermissions(), loadV2Identity(), loadV2GroupAdmins()]);
  });
  byId('s3ShareSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      endpoint: form.elements.endpoint.value.trim(), region: form.elements.region.value.trim(), bucket: form.elements.bucket.value.trim(),
      accessKeyId: form.elements.accessKeyId.value, secretAccessKey: form.elements.secretAccessKey.value,
      defaultTtlDays: Number(form.elements.defaultTtlDays.value), maxTtlDays: Number(form.elements.maxTtlDays.value),
      forcePathStyle: form.elements.forcePathStyle.checked
    };
    try {
      await api('/api/admin/s3-sharing/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      byId('s3ShareMessage').textContent = t('s3_settings_saved');
      await loadS3ShareSettings();
    } catch (error) { byId('s3ShareMessage').textContent = error.message; }
  });
  byId('s3ShareTestConnection').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api('/api/admin/s3-sharing/settings/test', { method: 'POST', body: '{}' });
      byId('s3ShareMessage').textContent = t('s3_connection_ok');
    } catch (error) { byId('s3ShareMessage').textContent = error.message; }
    finally { event.currentTarget.disabled = false; }
  });
  byId('s3ShareRefresh').addEventListener('click', () => loadS3Shares());
  byId('s3ShareRows').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-s3-share-revoke]');
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/api/assets/${encodeURIComponent(button.dataset.s3AssetId)}/s3-shares/${encodeURIComponent(button.dataset.s3ShareRevoke)}`, { method: 'DELETE' });
      byId('s3ShareMessage').textContent = t('s3_share_revoked');
      await loadS3Shares();
    } catch (error) { byId('s3ShareMessage').textContent = error.message; button.disabled = false; }
  });
  byId('v2MetadataSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const aiModels = {
      metadata: { enabled:form.elements.metadataModelEnabled.checked, provider:form.elements.metadataModelProvider.value, model:form.elements.metadataModelName.value.trim(), baseUrl:form.elements.metadataModelBaseUrl.value.trim(), modelDir:form.elements.metadataModelDir.value.trim(), keepAlive:form.elements.metadataModelKeepAlive.value.trim(), timeoutMs:numberValue(form,'metadataModelTimeoutMs',600000) },
      subtitleTranslation: { enabled:form.elements.subtitleTranslationModelEnabled.checked, provider:form.elements.subtitleTranslationModelProvider.value, model:form.elements.subtitleTranslationModelName.value.trim(), modelDir:form.elements.subtitleTranslationModelDir.value.trim() }
    };
    const message = byId('v2MetadataMessage');
    try { const current = await api('/api/admin/settings'); await api('/api/admin/settings', {method:'PATCH', body:JSON.stringify({...current, aiModels})}); message.textContent = t('settings_saved'); } catch (error) { message.textContent = error.message; }
  });
  byId('v2MetadataAssetName').addEventListener('input', () => { clearTimeout(metadataSuggestionTimer); metadataSuggestionTimer = setTimeout(loadMetadataSuggestions, 180); });
  byId('v2MetadataAssetName').addEventListener('focus', loadMetadataSuggestions);
  byId('v2MetadataSuggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-metadata-id]'); if (!button) return; const input = byId('v2MetadataAssetName'); input.value = button.dataset.metadataName || ''; input.dataset.assetId = button.dataset.metadataId || ''; event.currentTarget.hidden = true; });
  byId('v2GenerateMetadata').addEventListener('click', async (event) => {
    const input = byId('v2MetadataAssetName');
    const assetName = input.value.trim();
    const assetId = input.dataset.assetId || '';
    const message = byId('v2MetadataMessage');
    if (!assetName && !assetId) { message.textContent = t('metadata_asset_required'); return; }
    event.currentTarget.disabled = true;
    message.textContent = `${t('loading')}...`;
    try { const result = await api('/api/admin/metadata/generate', {method:'POST', body:JSON.stringify({assetId, assetName})}); message.textContent = `${t('metadata_generation_queued')} ${result.assetTitle || result.assetId || ''}`.trim(); } catch (error) { message.textContent = error.message || t('metadata_generation_failed'); } finally { event.currentTarget.disabled = false; }
  });
  byId('v2SettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    const payload = { playerUiMode: form.elements.playerUiMode.value, newAssetDefaultVisibility: form.elements.newAssetDefaultVisibility.value, allowFilelessAssetCreation: form.elements.allowFilelessAssetCreation.checked, apiTokenEnabled: form.elements.apiTokenEnabled.checked, oidcBearerEnabled: form.elements.oidcBearerEnabled.checked, apiToken: form.elements.apiToken.value.trim(), oidcIssuerUrl: form.elements.oidcIssuerUrl.value.trim(), oidcJwksUrl: form.elements.oidcJwksUrl.value.trim(), oidcAudience: form.elements.oidcAudience.value.trim(), mediaJobConcurrency: { subtitle:numberValue(form,'mediaJobConcurrencySubtitle',1), videoOcr:numberValue(form,'mediaJobConcurrencyVideoOcr',1), proxy:numberValue(form,'mediaJobConcurrencyProxy',1), metadata:numberValue(form,'mediaJobConcurrencyMetadata',1), thumbnail:numberValue(form,'mediaJobConcurrencyThumbnail',2), upload:numberValue(form,'mediaJobConcurrencyUpload',3), download:numberValue(form,'mediaJobConcurrencyDownload',6), backup:numberValue(form,'mediaJobConcurrencyBackup',1) } };
    try { await api('/api/admin/settings', { method:'PATCH', body:JSON.stringify(payload) }); settingsMessage(localizedSettingsNotice('Settings saved.', 'Ayarlar kaydedildi.')); } catch (error) { settingsMessage(error.message); }
  });
  byId('v2OcrSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const payload = {};
    const saveStatus = byId('v2OcrSettingsMessage');
    const showSaveStatus = (message, state) => {
      saveStatus.textContent = message;
      saveStatus.classList.toggle('is-success', state === 'success');
      saveStatus.classList.toggle('is-error', state === 'error');
    };
    showSaveStatus('', '');
    ['ocrDefaultAdvancedMode','ocrDefaultTurkishAiCorrect','ocrDefaultEnableBlurFilter','ocrDefaultEnableRegionMode','ocrDefaultIgnoreStaticOverlays'].forEach((name) => { payload[name] = form.elements[name].checked; });
    const readNumber = (name, fallback) => { const value = Number(form.elements[name].value); return Number.isFinite(value) ? value : fallback; };
    payload.ocrDefaultIntervalSec = readNumber('ocrDefaultIntervalSec', 4);
    payload.ocrDefaultMinDisplaySec = readNumber('ocrDefaultMinDisplaySec', 8);
    payload.ocrDefaultMergeGapSec = readNumber('ocrDefaultMergeGapSec', 4);
    payload.ocrDefaultEngine = form.elements.ocrDefaultEngine.value || 'paddle';
    try {
      await api('/api/admin/settings', { method:'PATCH', body:JSON.stringify(payload) });
      const videoOcrDefaults = {
        intervalSec: payload.ocrDefaultIntervalSec,
        minDisplaySec: payload.ocrDefaultMinDisplaySec,
        mergeGapSec: payload.ocrDefaultMergeGapSec,
        engine: payload.ocrDefaultEngine
      };
      try { global.localStorage.setItem('mam_video_ocr_defaults_updated', JSON.stringify(videoOcrDefaults)); } catch (_error) {}
      showSaveStatus(localizedSettingsNotice('Settings saved.', 'Ayarlar kaydedildi.'), 'success');
    } catch (error) {
      showSaveStatus(error.message || localizedSettingsNotice('Failed to save settings.', 'Ayarlar kaydedilemedi.'), 'error');
    }
  });
  byId('v2SubtitleSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const subtitleStyle = { customOverlayEnabled:form.elements.customOverlay.checked, bottomOffset:numberValue(form,'bottomOffsetPx',56), fontSize:numberValue(form,'fontSizePx',24), textColor:form.elements.textColor.value, backgroundColor:form.elements.backgroundColor.value, backgroundOpacity:Number(form.elements.backgroundOpacity.value), horizontalPadding:numberValue(form,'horizontalPaddingPx',16), maxWidth:numberValue(form,'maxWidthPercent',82) };
    try { await api('/api/admin/settings', { method:'PATCH', body:JSON.stringify({subtitleStyle}) }); settingsMessage(localizedSettingsNotice('Settings saved.', 'Ayarlar kaydedildi.')); } catch (error) { settingsMessage(error.message); }
  });
  byId('v2BackupSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); try { const current = await api('/api/admin/settings'); await api('/api/admin/settings', { method:'PATCH', body:JSON.stringify({...current, backup:readBackupForm()}) }); settingsMessage(localizedSettingsNotice('Backup settings saved.', 'Yedekleme ayarları kaydedildi.')); await loadV2Backups(); } catch (error) { settingsMessage(error.message); }
  });
  byId('v2RunBackup').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true; try { await api('/api/admin/backups/run', { method:'POST', body:JSON.stringify(readBackupForm()) }); settingsMessage(localizedSettingsNotice('Backup completed.', 'Yedekleme tamamlandı.')); await loadV2Backups(); } catch (error) { settingsMessage(error.message); } finally { event.currentTarget.disabled = false; }
  });
  byId('v2BackupFiles').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-backup-delete]'); if (!button || !global.confirm('Delete this backup file?')) return;
    button.disabled = true; try { await api(`/api/admin/backups/${encodeURIComponent(button.dataset.backupDelete)}`, { method:'DELETE' }); await loadV2Backups(); settingsMessage(localizedSettingsNotice('Backup deleted.', 'Yedek silindi.')); } catch (error) { settingsMessage(error.message); button.disabled = false; }
  });
  document.querySelectorAll('[data-permission-export]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true; try { const kind = button.dataset.permissionExport === 'user-rights' ? 'principal-rights' : button.dataset.permissionExport; const response = await fetch(`/api/admin/permission-exports/${encodeURIComponent(kind)}`, { credentials:'same-origin' }); if (!response.ok) throw new Error(localizedSettingsNotice('Export failed', 'Dışa aktarma başarısız')); triggerJsonDownload(await response.blob(), `${kind}.json`); settingsMessage(localizedSettingsNotice('Permission export downloaded.', 'Yetki dışa aktarımı indirildi.')); } catch (error) { settingsMessage(error.message); } finally { button.disabled = false; }
  }));
  document.querySelectorAll('[data-permission-import]').forEach((button) => button.addEventListener('click', async () => {
    const kind = button.dataset.permissionImport === 'user-rights' ? 'principal-rights' : button.dataset.permissionImport; const input = byId(kind === 'asset-rights' ? 'v2AssetRightsImport' : 'v2UserRightsImport'); const file = input.files?.[0]; if (!file) { settingsMessage(localizedSettingsNotice('Choose a JSON file first.', 'Önce bir JSON dosyası seçin.')); return; }
    button.disabled = true; try { const payload = JSON.parse(await file.text()); await api(`/api/admin/permission-imports/${encodeURIComponent(kind)}`, { method:'POST', body:JSON.stringify(payload) }); settingsMessage(localizedSettingsNotice('Permissions imported.', 'Yetkiler içe aktarıldı.')); } catch (error) { settingsMessage(error.message); } finally { button.disabled = false; }
  }));
  byId('v2ScanMissingProxy').addEventListener('click', async () => { try { await scanV2MissingProxy({ autoGenerate:false }); } catch (error) { byId('v2ProxyStatus').textContent = error.message; } });
  byId('v2GenerateAllProxy').addEventListener('click', async () => { try { await scanV2MissingProxy({ autoGenerate:true }); } catch (error) { byId('v2ProxyStatus').textContent = error.message; } });
  byId('v2StopMissingProxy').addEventListener('click', () => { v2MissingProxyScanController?.abort(); });
  byId('v2MissingProxyRows').addEventListener('click', async (event) => { const button = event.target.closest('[data-proxy-repair]'); if (!button) return; button.disabled = true; const status = byId('v2ProxyStatus'); status.classList.remove('is-success', 'is-error'); status.textContent = localizedSettingsNotice('Processing selected item...', 'Seçilen öğe işleniyor...'); try { if (button.dataset.proxyMode === 'proxy') { await api('/api/admin/proxy-jobs', { method:'POST', body:JSON.stringify({assetIds:[button.dataset.proxyRepair]}) }); status.textContent = localizedSettingsNotice('Proxy generation queued. Completion will appear in the job list.', 'Proxy üretimi sıraya alındı. Tamamlandığında görev listesinde “Proxy üretildi” olarak görünecek.'); await loadV2ProxyJobs(); } else { await api('/api/admin/proxy-tools/run', { method:'POST', body:JSON.stringify({assetId:button.dataset.proxyRepair, mode:button.dataset.proxyMode}) }); status.textContent = localizedSettingsNotice('Generation completed.', 'Üretim tamamlandı.'); status.classList.add('is-success'); await scanV2MissingProxy(); } } catch (error) { status.textContent = error.message; status.classList.add('is-error'); button.disabled = false; } });
  byId('v2ProxyAssetName').addEventListener('input', async (event) => { const q = event.target.value.trim(); const box = byId('v2ProxySuggestions'); event.target.dataset.assetId = ''; if (q.length < 3) { box.hidden = true; return; } try { const rows = await api(`/api/admin/assets/suggest?q=${encodeURIComponent(q)}&limit=8&includeTrash=${byId('v2ProxyIncludeTrash').checked ? '1' : '0'}`); box.innerHTML = rows.map((item) => `<button type="button" data-proxy-suggestion-id="${escapeHtml(item.id)}" data-proxy-suggestion-name="${escapeHtml(item.title || item.fileName || item.id)}">${escapeHtml(item.title || item.fileName || item.id)}</button>`).join(''); box.hidden = !rows.length; } catch { box.hidden = true; } });
  byId('v2ProxySuggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-proxy-suggestion-id]'); if (!button) return; byId('v2ProxyAssetName').value = button.dataset.proxySuggestionName; byId('v2ProxyAssetName').dataset.assetId = button.dataset.proxySuggestionId; event.currentTarget.hidden = true; });
  byId('v2RunProxyTool').addEventListener('click', async (event) => { const name = byId('v2ProxyAssetName').value.trim(); if (!name) return; event.currentTarget.disabled = true; const status = byId('v2ProxyStatus'); status.classList.remove('is-success', 'is-error'); status.textContent = localizedSettingsNotice('Generating...', 'Proxy üretiliyor...'); const payload = { assetName:name, assetId:byId('v2ProxyAssetName').dataset.assetId || undefined, mode:byId('v2ProxyAction').value, timecode:byId('v2ProxyTimecode').value.trim() }; try { const result = await api('/api/admin/proxy-tools/run', { method:'POST', body:JSON.stringify(payload) }); status.textContent = `${localizedSettingsNotice('Proxy generated', 'Proxy üretildi')}: ${result.assetTitle || result.assetId}`; status.classList.add('is-success'); } catch (error) { status.textContent = error.message; status.classList.add('is-error'); } finally { event.currentTarget.disabled = false; } });
  byId('v2RefreshIdentity').addEventListener('click', () => Promise.all([loadV2Identity(), loadV2GroupAdmins()]).catch((error) => settingsMessage(error.message)));
  byId('v2IdentityUserSearchBtn').addEventListener('click', () => loadV2Identity().catch((error) => settingsMessage(error.message)));
  byId('v2IdentityUserSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadV2Identity().catch((error) => settingsMessage(error.message)); } });
  const selectedGroupAdminScopes = () => Array.from(byId('v2GroupAdminScopes').querySelectorAll('input:checked')).map((input) => input.value);
  const setGroupAdminScopes = (values = []) => { const selected = new Set(values); byId('v2GroupAdminScopes').querySelectorAll('input').forEach((input) => { input.checked = selected.has(input.value); }); };
  const selectedGroupAdminTypes = () => Array.from(byId('v2GroupAdminTypes').querySelectorAll('input:checked')).map((input) => input.value);
  const setGroupAdminTypes = (values = []) => { const selected = new Set(values); byId('v2GroupAdminTypes').querySelectorAll('input').forEach((input) => { input.checked = selected.has(input.value); }); };
  byId('v2AddGroupAdmin').addEventListener('click', async (event) => { const groupName = byId('v2GroupAdminGroup').value.trim(), username = byId('v2GroupAdminUser').value.trim(); if (!groupName || !username) { byId('v2GroupAdminsMessage').textContent = localizedSettingsNotice('Managed group and manager are required.', 'Yönetilen grup ve yönetici zorunludur.'); return; } event.currentTarget.disabled = true; try { const endpoint = editingGroupAdminId ? `/api/admin/group-admins/${encodeURIComponent(editingGroupAdminId)}` : '/api/admin/group-admins'; await api(endpoint, { method:editingGroupAdminId ? 'PATCH' : 'POST', body:JSON.stringify({groupName, username, adminScopes:selectedGroupAdminScopes(), assetTypeGroups:selectedGroupAdminTypes()}) }); editingGroupAdminId = ''; byId('v2GroupAdminUser').value = ''; byId('v2GroupAdminGroup').value = ''; setGroupAdminScopes(['asset-rights']); setGroupAdminTypes([]); event.currentTarget.textContent = localizedSettingsNotice('Add', 'Ekle'); byId('v2GroupAdminsMessage').textContent = localizedSettingsNotice('Group administrator saved.', 'Grup yöneticisi kaydedildi.'); await Promise.all([loadV2GroupAdmins(), recordsModule.loadUserPermissions()]); } catch (error) { byId('v2GroupAdminsMessage').textContent = error.message; } finally { event.currentTarget.disabled = false; } });
  byId('v2GroupAdmins').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-group-admin-edit]');
    if (edit) { editingGroupAdminId = edit.dataset.groupAdminEdit; byId('v2GroupAdminGroup').value = edit.dataset.groupName || ''; byId('v2GroupAdminUser').value = edit.dataset.username || ''; let scopes = [], types = []; try { scopes = JSON.parse(edit.dataset.scopes || '[]'); types = JSON.parse(edit.dataset.types || '[]'); } catch {} setGroupAdminScopes(scopes.length ? scopes : ['asset-rights']); setGroupAdminTypes(types); byId('v2AddGroupAdmin').textContent = localizedSettingsNotice('Update', 'Güncelle'); byId('v2GroupAdminGroup').focus(); return; }
    const button = event.target.closest('[data-group-admin-delete]'); if (!button || !global.confirm(localizedSettingsNotice('Delete this group administrator?', 'Bu grup yöneticisi silinsin mi?'))) return; button.disabled = true; try { await api(`/api/admin/group-admins/${encodeURIComponent(button.dataset.groupAdminDelete)}`, {method:'DELETE'}); if (editingGroupAdminId === button.dataset.groupAdminDelete) editingGroupAdminId = ''; await Promise.all([loadV2GroupAdmins(), recordsModule.loadUserPermissions()]); } catch (error) { byId('v2GroupAdminsMessage').textContent = error.message; button.disabled = false; }
  });
  byId('v2SessionSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const authSession = { rememberMe:form.elements.rememberMe.checked, ssoIdleMinutes:numberValue(form,'ssoIdleMinutes',30), ssoMaxHours:numberValue(form,'ssoMaxHours',8), clientIdleMinutes:numberValue(form,'clientIdleMinutes',30), clientMaxHours:numberValue(form,'clientMaxHours',8) };
    try { const result = await api('/api/admin/identity/session-settings', { method:'PATCH', body:JSON.stringify({authSession}) }); const saved = result.authSession || authSession; Object.entries(saved).forEach(([name,value]) => setFormValue(form,name,value)); settingsMessage(localizedSettingsNotice('Login settings saved.', 'Oturum ayarları kaydedildi.')); } catch (error) { settingsMessage(error.message); }
  });
  byId('v2RotateToken').addEventListener('click', async () => { try { const result = await api('/api/admin/api-token/rotate', { method:'POST', body:'{}' }); setFormValue(byId('v2SettingsForm'),'apiToken',result.apiToken || ''); settingsMessage(localizedSettingsNotice('Token rotated.', 'Belirteç yenilendi.')); } catch (error) { settingsMessage(error.message); } });
  byId('v2CopyToken').addEventListener('click', async () => { const token = byId('v2SettingsForm').elements.apiToken.value.trim(); if (!token) return; await navigator.clipboard.writeText(token); settingsMessage(localizedSettingsNotice('Token copied.', 'Belirteç kopyalandı.')); });

  byId('languageSelectAdmin').value = language;
  byId('languageSelectAdmin').addEventListener('change', async (event) => {
    language = event.target.value === 'tr' ? 'tr' : 'en';
    persistSharedLanguage(language);
    applyLocalization();
    healthModule.rerender();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
    if (getActiveView() === 'audit') loadAuditEvents();
    if (getActiveView() === 'asset-rights') loadAssetRights();
    if (getActiveView() === 'metadata' && canUseFullAdmin()) await loadV2Settings();
    if (getActiveView() === 's3-sharing') await loadS3SharingView();
    if (getActiveView() === 'settings') {
      if (canUseFullAdmin()) await loadV2Settings();
      const activeSettingsTab = byId('settingsTabs')?.querySelector('[data-settings-tab].is-active')?.dataset.settingsTab;
      if (activeSettingsTab === 'ocr') await recordsModule.loadOcrRecords();
      if (activeSettingsTab === 'subtitle') await recordsModule.loadSubtitleRecords();
      if (activeSettingsTab === 'users') {
        await Promise.all([recordsModule.loadUserPermissions(), loadV2Identity(), loadV2GroupAdmins()]);
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'L' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    byId('languageSelectAdmin').value = language === 'tr' ? 'en' : 'tr';
    byId('languageSelectAdmin').dispatchEvent(new Event('change', { bubbles: true }));
    event.preventDefault();
    event.stopPropagation();
  }, true);

  (async () => {
    try { adminPermissions = await api('/api/me'); } catch (_error) { adminPermissions = {}; }
    applyView();
    await loadTranslations();
    applyLocalization();
    if (getActiveView() === 'diagnostics') refreshDiagnostics();
    else if (getActiveView() === 'audit') loadAuditView();
    else if (getActiveView() === 'asset-rights') { syncRightsModeControls(); prepareAssetRights(); }
    else if (getActiveView() === 'metadata' && canUseFullAdmin()) loadV2Settings();
    else if (getActiveView() === 'settings') {
      if (canUseFullAdmin()) loadV2Settings();
      const tab = byId('settingsTabs').querySelector('[data-settings-tab].is-active:not([hidden])')?.dataset.settingsTab;
      if (tab === 'proxy') loadV2ProxyJobs();
      if (tab === 'ocr') recordsModule.loadOcrRecords();
      if (tab === 'subtitle') recordsModule.loadSubtitleRecords();
    }
    else if (getActiveView() === 's3-sharing') loadS3SharingView();
    else if (getActiveView() === 'health') refresh({ force: true });
  })();
})(window);
