const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';

const ffmpegHealthEl = document.getElementById('ffmpegHealth');
const systemHealthRows = document.getElementById('systemHealthRows');
const systemJobStatusEl = document.getElementById('systemJobStatus');
const settingsForm = document.getElementById('settingsForm');
const settingsMsg = document.getElementById('settingsMsg');
const ocrSettingsForm = document.getElementById('ocrSettingsForm');
const ocrSettingsMsg = document.getElementById('ocrSettingsMsg');
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
const proxyToolAssetName = document.getElementById('proxyToolAssetName');
const proxyToolSuggestList = document.getElementById('proxyToolSuggestList');
const proxyToolAction = document.getElementById('proxyToolAction');
const proxyToolTimecodeWrap = document.getElementById('proxyToolTimecodeWrap');
const proxyToolTimecode = document.getElementById('proxyToolTimecode');
const proxyToolReplaceFileWrap = document.getElementById('proxyToolReplaceFileWrap');
const proxyToolReplaceFile = document.getElementById('proxyToolReplaceFile');
const runProxyToolBtn = document.getElementById('runProxyToolBtn');
const proxyToolMsg = document.getElementById('proxyToolMsg');
const languageSelect = document.getElementById('languageSelectAdmin');
const adminTabs = Array.from(document.querySelectorAll('.admin-tab'));
const adminPanels = Array.from(document.querySelectorAll('.admin-panel'));
const settingsSubTabs = Array.from(document.querySelectorAll('.settings-subtab'));
const settingsSubPanels = Array.from(document.querySelectorAll('.settings-subpanel'));
const userPermissionsRows = document.getElementById('userPermissionsRows');
const userPermissionsMsg = document.getElementById('userPermissionsMsg');
const ocrAdminSearchInput = document.getElementById('ocrAdminSearchInput');
const ocrDeleteFileCheck = document.getElementById('ocrDeleteFileCheck');
const ocrRecordsRows = document.getElementById('ocrRecordsRows');
const ocrRecordsMsg = document.getElementById('ocrRecordsMsg');
const runOcrAdminSearchBtn = document.getElementById('runOcrAdminSearchBtn');
const subtitleAdminSearchInput = document.getElementById('subtitleAdminSearchInput');
const subtitleDeleteFileCheck = document.getElementById('subtitleDeleteFileCheck');
const subtitleRecordsRows = document.getElementById('subtitleRecordsRows');
const subtitleRecordsMsg = document.getElementById('subtitleRecordsMsg');
const combinedSearchInput = document.getElementById('combinedSearchInput');
const combinedSearchLimit = document.getElementById('combinedSearchLimit');
const runCombinedSearchBtn = document.getElementById('runCombinedSearchBtn');
const combinedSearchRows = document.getElementById('combinedSearchRows');
const combinedSearchMsg = document.getElementById('combinedSearchMsg');

let currentLang = localStorage.getItem(LOCAL_LANG) || 'en';
let pollTimer = null;
let activeJobId = null;
let proxySuggestTimer = null;
let proxySuggestReqSeq = 0;
let proxySuggestItems = [];
let proxySuggestActiveIndex = -1;
let proxySuggestHideTimer = null;
let currentAdminProfile = null;

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
    player_mode: 'Player Mode',
    player_mode_vidstack: 'Vidstack',
    player_mode_mpegdash: 'MPEG-DASH (dash.js)',
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
    settings_group_workflow: 'Workflow & Player',
    settings_group_security: 'Security',
    settings_group_identity: 'Token & OIDC',
    settings_group_docs: 'Documentation',
    ocr_defaults: 'OCR Defaults',
    ocr_filters: 'OCR Filters',
    ocr_default_advanced_mode: 'Advanced OCR mode default',
    ocr_default_turkish_ai_correct: 'Turkish offline correction default',
    ocr_default_blur_filter: 'Blur filter default',
    ocr_default_region_mode: 'Ticker region mode default',
    ocr_default_static_overlay_filter: 'Static overlay filter default',
    settings_sub_general: 'General',
    settings_sub_workflow: 'Workflow',
    settings_sub_proxy: 'Proxy',
    settings_sub_ocr: 'OCR',
    settings_sub_subtitle: 'Subtitle',
    settings_sub_users: 'Users',
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
    proxy_tool_title: 'Asset Generation Tool',
    proxy_tool_asset_name: 'Asset Name',
    proxy_tool_asset_name_ph: 'Type asset name',
    proxy_tool_action: 'Action',
    proxy_tool_action_thumbnail: 'Generate Video Thumbnail',
    proxy_tool_action_preview: 'Generate Document Preview',
    proxy_tool_action_proxy: 'Generate Video Proxy',
    proxy_tool_action_replace_asset: 'Replace Asset File (Keep Metadata)',
    proxy_tool_action_delete_asset: 'Delete Asset',
    proxy_tool_timecode: 'Thumbnail Timecode',
    proxy_tool_timecode_ph: '00:00:12:10 or 12.4',
    proxy_tool_replace_file: 'New Asset File',
    proxy_tool_replace_file_required: 'Please select a file.',
    proxy_tool_replace_options_title: 'After file replace',
    proxy_tool_replace_gen_thumbnail: 'Generate thumbnail',
    proxy_tool_replace_gen_preview: 'Generate document preview',
    proxy_tool_replace_type_mismatch: 'New file type must match existing asset type.',
    proxy_tool_replace_options_prompt: 'Only the main file will change. Asset metadata stays as-is. Select what to generate after replacing the file.',
    proxy_tool_run: 'Run Action',
    proxy_tool_name_required: 'Asset name is required.',
    proxy_tool_done: 'Action completed',
    proxy_tool_multi_match: 'Multiple assets matched, latest one used',
    proxy_tool_delete_confirm: 'Permanently delete this asset and its related versions/indices?',
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
    health_disk: 'Disk',
    health_jobs: 'Jobs',
    health_services: 'Services',
    health_integrity: 'Integrity',
    health_uploads_size: 'Uploads size',
    health_uploads_files: 'Uploads files',
    health_fs_free: 'Filesystem free',
    health_fs_total: 'Filesystem total',
    health_proxy_running: 'Proxy running/queued',
    health_subtitle_running: 'Subtitle running/queued',
    health_ocr_running: 'OCR running/queued',
    health_proxy_failed: 'Proxy failed',
    health_subtitle_failed: 'Subtitle failed',
    health_ocr_failed: 'OCR failed',
    health_missing_proxy: 'Missing proxy files',
    health_missing_thumbnail: 'Missing thumbnail files',
    health_missing_subtitle: 'Missing subtitle files',
    health_missing_ocr: 'Missing OCR files',
    health_service_app: 'App',
    health_service_postgres: 'Postgres',
    health_service_elastic: 'Elasticsearch',
    health_service_keycloak: 'Keycloak',
    health_service_oauth2_proxy: 'OAuth2 Proxy',
    health_up: 'UP',
    health_down: 'DOWN',
    health_recent_jobs: 'Recent Media Jobs',
    health_subtitle_jobs: 'Subtitle Jobs',
    health_ocr_jobs: 'OCR Jobs',
    health_job_running_now: 'Running now',
    health_job_latest_done: 'Latest completed',
    health_job_latest_failed: 'Latest failed',
    health_job_idle: 'No recent job',
    health_job_asset: 'Asset',
    health_job_label: 'Label',
    health_job_engine: 'Engine',
    health_job_model: 'Model',
    health_job_updated: 'Updated',
    health_job_finished: 'Finished',
    health_job_progress: 'Progress',
    health_job_lines: 'Lines',
    health_job_segments: 'Segments',
    health_job_warning: 'Warning',
    health_job_error: 'Error',
    health_job_status_running: 'Running',
    health_job_status_queued: 'Queued',
    health_job_status_completed: 'Completed',
    health_job_status_failed: 'Failed',
    user_settings: 'User Settings',
    perm_admin_access: 'Admin page access',
    perm_metadata_edit: 'Metadata edit',
    perm_office_edit: 'Office edit',
    perm_asset_delete: 'Asset delete',
    perm_pdf_advanced: 'PDF advanced tools',
    perm_text_admin: 'OCR / subtitle admin',
    user_permissions_saved: 'User permissions saved.',
    access_denied: 'Access denied.',
    ocr_records: 'OCR Records',
    ocr_search: 'Search OCR',
    ocr_search_ph: 'asset name...',
    ocr_search_run: 'Run Search',
    ocr_delete_file: 'Delete OCR file from disk too',
    ocr_asset: 'Asset',
    ocr_label: 'Label',
    ocr_engine: 'Engine',
    ocr_lines: 'Lines',
    ocr_segments: 'Segments',
    ocr_edit: 'Save',
    ocr_delete_db: 'Delete from DB',
    content_edit: 'Edit Content',
    content_save: 'Save Content',
    content_cancel: 'Cancel',
    content_loading: 'Loading content...',
    content_saved: 'Content saved.',
    find_label: 'Find',
    replace_label: 'Replace',
    find_next: 'Find Next',
    replace_all: 'Replace All',
    ocr_saved: 'OCR record saved.',
    ocr_deleted: 'OCR record deleted.',
    ocr_none: 'No OCR records found.',
    ocr_confirm_delete: 'Delete this OCR record from database?',
    learned_corrections_title: 'Learned Corrections',
    learned_wrong: 'Wrong',
    learned_correct: 'Correct',
    learned_wrong_ph: 'wrong phrase...',
    learned_correct_ph: 'correct phrase...',
    learned_add: 'Add',
    learned_apply: 'Apply',
    learned_use_selection: 'Use selected text',
    learned_delete: 'Delete',
    learned_none: 'No learned correction yet.',
    learned_saved: 'Learned correction saved.',
    learned_deleted: 'Learned correction deleted.',
    learned_invalid: 'Both wrong and correct fields are required.',
    content_audio_player: 'Audio Preview',
    content_audio_tc: 'TC',
    subtitle_records: 'Subtitle Records',
    subtitle_search_admin: 'Search Subtitle',
    subtitle_search_admin_ph: 'asset, label, language...',
    subtitle_delete_file: 'Delete subtitle file from disk too',
    subtitle_lang: 'Language',
    subtitle_set_active: 'Set Active',
    subtitle_save: 'Save',
    subtitle_delete_db: 'Delete from DB',
    subtitle_saved: 'Subtitle record saved.',
    subtitle_deleted: 'Subtitle record deleted.',
    subtitle_none: 'No subtitle records found.',
    subtitle_confirm_delete: 'Delete this subtitle record from database?',
    combined_search: 'Combined Subtitle + OCR Search',
    combined_search_query: 'Search Query',
    combined_search_query_ph: 'Type query...',
    combined_search_limit: 'Limit',
    combined_search_run: 'Run Search',
    combined_search_none: 'No match found.'
  },
  tr: {
    admin_title: 'Yönetici Ayarları',
    admin_subtitle: 'İş akışı izleme, proxy üretimi ve sistem sağlığı.',
    back_to_mam: "MAM'e Dön",
    system_health: 'Sistem Sağlığı',
    settings: 'Ayarlar',
    loading: 'Yükleniyor...',
    workflow_tracking_enabled: 'İş akışı izleme etkin',
    auto_proxy_backfill: 'Yüklemede proxy backfill otomatik',
    player_mode: 'Oynatıcı Modu',
    player_mode_vidstack: 'Vidstack',
    player_mode_mpegdash: 'MPEG-DASH (dash.js)',
    api_token_enabled: 'API token zorunlu olsun (SSO olmayan API erişimi)',
    oidc_bearer_enabled: 'Keycloak Bearer JWT kabul et (mobil için önerilen)',
    api_token: 'API Token',
    api_token_placeholder: 'Önce token üret',
    oidc_issuer_url: 'OIDC Issuer URL',
    oidc_issuer_url_ph: 'http://keycloak:8080/realms/mam',
    oidc_jwks_url: 'OIDC JWKS URL',
    oidc_jwks_url_ph: 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
    oidc_audience: 'OIDC Audience (opsiyonel, virgül ile)',
    oidc_audience_ph: 'mam-web,account',
    rotate_token: 'Token Yenile',
    copy_token: 'Token Kopyala',
    token_rotated: 'API token yenilendi.',
    token_copied: 'API token kopyalandı.',
    api_test_title: 'Postman Testi',
    api_test_note: 'Header: X-API-Token veya Authorization: Bearer <token>',
    api_help_doc_title: 'API Yardım Dokümanı',
    api_help_intro: 'MAM APIlerini Postman veya cURL ile hızlı test etmek için bu bölümü kullanın.',
    api_help_auth_title: 'Kimlik Doğrulama Kuralları',
    api_help_auth_note: '3000 portundaki UI trafiği SSO proxy üzerinden çalışır. Token testleri için 3001 direkt API kullanın.',
    api_help_bearer_on: 'OIDC Bearer JWT doğrulaması AÇIK.',
    api_help_bearer_off: 'OIDC Bearer JWT doğrulaması KAPALI.',
    api_help_token_on: 'API token koruması şu anda AÇIK.',
    api_help_token_off: 'API token koruması şu anda KAPALI.',
    api_help_token_hint: 'Direkt API testlerinde Settings altındaki güncel tokeni kullanın.',
    api_help_quick_title: 'Hızlı Komutlar',
    api_help_cmd_workflow: 'Workflow adımlarını listele',
    api_help_cmd_assets: 'Aktif varlıkları listele',
    api_help_cmd_asset_by_id: 'ID ile tek varlık getir',
    api_help_cmd_create_collection: 'Koleksiyon oluştur',
    api_help_postman_title: 'Postman Kurulumu',
    api_help_postman_step1: 'Method: GET',
    api_help_postman_step2: 'URL: {{baseUrl}}/api/workflow (önerilen baseUrl: http://localhost:3001)',
    api_help_postman_step3: 'Token koruması AÇIK ise X-API-Token veya Authorization: Bearer <token> gönderin.',
    api_help_postman_step4: '3000 portunu test ederken otomatik redirect takibini kapatın.',
    api_help_endpoints_title: 'Temel Endpointler',
    settings_group_workflow: 'İş Akışı ve Oynatıcı',
    settings_group_security: 'Güvenlik',
    settings_group_identity: 'Token ve OIDC',
    settings_group_docs: 'Dokümantasyon',
    ocr_defaults: 'OCR Varsayılanları',
    ocr_filters: 'OCR Filtreleri',
    ocr_default_advanced_mode: 'Gelişmiş OCR varsayılan açık',
    ocr_default_turkish_ai_correct: 'Türkçe çevrimdışı düzeltme varsayılan açık',
    ocr_default_blur_filter: 'Bulanıklık filtresi varsayılan açık',
    ocr_default_region_mode: 'Ticker bölge modu varsayılan açık',
    ocr_default_static_overlay_filter: 'Sabit yazı filtresi varsayılan açık',
    settings_sub_general: 'Genel',
    settings_sub_workflow: 'İş Akışı',
    settings_sub_proxy: 'Proxy',
    settings_sub_ocr: 'OCR',
    settings_sub_subtitle: 'Altyazı',
    settings_sub_users: 'Kullanıcılar',
    save_settings: 'Ayarları Kaydet',
    settings_saved: 'Ayarlar kaydedildi.',
    workflow_tracking: 'İş Akışı İzleme',
    proxy_jobs: 'Proxy Görevleri',
    include_trash: 'Çöpü dahil et',
    start_proxy_job: 'Proxy Görevi Başlat',
    proxy_job_started: 'Proxy görevi başlatıldı.',
    proxy_job_done: 'Proxy görevi tamamlandı.',
    proxy_job_running: 'Proxy görevi çalışıyor',
    proxy_job_failed: 'Proxy görevi başarısız.',
    proxy_tool_title: 'Varlık Üretim Aracı',
    proxy_tool_asset_name: 'Varlık Adı',
    proxy_tool_asset_name_ph: 'Varlık adını yazın',
    proxy_tool_action: 'İşlem',
    proxy_tool_action_thumbnail: 'Video Thumbnail Üret',
    proxy_tool_action_preview: 'Doküman Önizlemesi Üret',
    proxy_tool_action_proxy: 'Video Proxy Üret',
    proxy_tool_action_replace_asset: 'Yalnız Dosyayı Değiştir (Metadata Kalsın)',
    proxy_tool_action_delete_asset: 'Asset Sil',
    proxy_tool_timecode: 'Thumbnail Timecode',
    proxy_tool_timecode_ph: '00:00:12:10 veya 12.4',
    proxy_tool_replace_file: 'Yeni Varlık Dosyası',
    proxy_tool_replace_file_required: 'Lütfen bir dosya seçin.',
    proxy_tool_replace_options_title: 'Dosya değişimi sonrası',
    proxy_tool_replace_gen_thumbnail: 'Thumbnail üret',
    proxy_tool_replace_gen_preview: 'Doküman önizlemesi üret',
    proxy_tool_replace_type_mismatch: 'Yeni dosya türü mevcut varlık türü ile aynı olmalı.',
    proxy_tool_replace_options_prompt: 'Yalnızca ana dosya değişir. Varlık metadata bilgileri korunur. Dosya değiştikten sonra üretilecekleri seçin.',
    proxy_tool_run: 'İşlemi Çalıştır',
    proxy_tool_name_required: 'Varlık adı gerekli.',
    proxy_tool_done: 'İşlem tamamlandı',
    proxy_tool_multi_match: 'Birden fazla varlık bulundu, en güncel olan kullanıldı',
    proxy_tool_delete_confirm: 'Bu asset ve ilişkili versiyon/index kayıtları kalıcı olarak silinsin mi?',
    processed: 'İşlenen',
    generated: 'Üretilen',
    skipped: 'Atlanan',
    failed: 'Hatalı',
    assets_total: 'Toplam varlık',
    assets_active: 'Aktif varlık',
    assets_trash: 'Çöpteki varlık',
    proxies_ready: 'Hazır proxy',
    proxies_missing: 'Eksik proxy',
    ffmpeg_ok: 'ffmpeg: hazır',
    ffmpeg_fail: 'ffmpeg: yok',
    ffprobe_ok: 'ffprobe: hazır',
    ffprobe_fail: 'ffprobe: yok',
    health_disk: 'Disk',
    health_jobs: 'İşler',
    health_services: 'Servisler',
    health_integrity: 'Bütünlük',
    health_uploads_size: 'Uploads boyutu',
    health_uploads_files: 'Uploads dosya sayısı',
    health_fs_free: 'Disk boş alan',
    health_fs_total: 'Disk toplam alan',
    health_proxy_running: 'Proxy çalışan/kuyruk',
    health_subtitle_running: 'Altyazı çalışan/kuyruk',
    health_ocr_running: 'OCR çalışan/kuyruk',
    health_proxy_failed: 'Proxy hatalı',
    health_subtitle_failed: 'Altyazı hatalı',
    health_ocr_failed: 'OCR hatalı',
    health_missing_proxy: 'Eksik proxy dosyası',
    health_missing_thumbnail: 'Eksik thumbnail dosyası',
    health_missing_subtitle: 'Eksik altyazı dosyası',
    health_missing_ocr: 'Eksik OCR dosyası',
    health_service_app: 'Uygulama',
    health_service_postgres: 'Postgres',
    health_service_elastic: 'Elasticsearch',
    health_service_keycloak: 'Keycloak',
    health_service_oauth2_proxy: 'OAuth2 Proxy',
    health_up: 'AYAKTA',
    health_down: 'KAPALI',
    health_recent_jobs: 'Son Medya İşleri',
    health_subtitle_jobs: 'Altyazı İşleri',
    health_ocr_jobs: 'OCR İşleri',
    health_job_running_now: 'Şu an çalışan',
    health_job_latest_done: 'Son tamamlanan',
    health_job_latest_failed: 'Son hatalı',
    health_job_idle: 'Yakın zamanda iş yok',
    health_job_asset: 'Varlık',
    health_job_label: 'Etiket',
    health_job_engine: 'Motor',
    health_job_model: 'Model',
    health_job_updated: 'Güncellendi',
    health_job_finished: 'Bitti',
    health_job_progress: 'İlerleme',
    health_job_lines: 'Satır',
    health_job_segments: 'Segment',
    health_job_warning: 'Uyarı',
    health_job_error: 'Hata',
    health_job_status_running: 'Çalışıyor',
    health_job_status_queued: 'Kuyrukta',
    health_job_status_completed: 'Tamamlandı',
    health_job_status_failed: 'Hatalı',
    user_settings: 'Kullanıcı Ayarları',
    perm_admin_access: 'Yönetim sayfasına erişim',
    perm_metadata_edit: 'Metadata düzenleme',
    perm_office_edit: 'Office düzenleme',
    perm_asset_delete: 'Varlık silme',
    perm_pdf_advanced: 'PDF gelişmiş araçlar',
    perm_text_admin: 'OCR / altyazı yöneticisi',
    user_permissions_saved: 'Kullanıcı yetkileri kaydedildi.',
    access_denied: 'Erişim engellendi.',
    ocr_records: 'OCR Kayıtları',
    ocr_search: 'OCR Ara',
    ocr_search_ph: 'varlık adı...',
    ocr_search_run: 'Ara',
    ocr_delete_file: 'OCR dosyasını diskten de sil',
    ocr_asset: 'Varlık',
    ocr_label: 'Etiket',
    ocr_engine: 'Motor',
    ocr_lines: 'Satır',
    ocr_segments: 'Segment',
    ocr_edit: 'Kaydet',
    ocr_delete_db: 'DBden Sil',
    content_edit: 'İçeriği Düzenle',
    content_save: 'İçeriği Kaydet',
    content_cancel: 'İptal',
    content_loading: 'İçerik yükleniyor...',
    content_saved: 'İçerik kaydedildi.',
    find_label: 'Bul',
    replace_label: 'Değiştir',
    find_next: 'Sonrakini Bul',
    replace_all: 'Tümünü Değiştir',
    ocr_saved: 'OCR kaydı kaydedildi.',
    ocr_deleted: 'OCR kaydı silindi.',
    ocr_none: 'OCR kaydı bulunamadı.',
    ocr_confirm_delete: 'Bu OCR kaydı veritabanından silinsin mi?',
    learned_corrections_title: 'Öğrenilmiş Düzeltmeler',
    learned_wrong: 'Yanlış',
    learned_correct: 'Doğru',
    learned_wrong_ph: 'yanlış ifade...',
    learned_correct_ph: 'doğru ifade...',
    learned_add: 'Ekle',
    learned_apply: 'Uygula',
    learned_use_selection: 'Seçili metni al',
    learned_delete: 'Sil',
    learned_none: 'Henüz öğrenilmiş düzeltme yok.',
    learned_saved: 'Öğrenilmiş düzeltme kaydedildi.',
    learned_deleted: 'Öğrenilmiş düzeltme silindi.',
    learned_invalid: 'Yanlış ve doğru alanları zorunludur.',
    content_audio_player: 'Ses Önizleme',
    content_audio_tc: 'TC',
    subtitle_records: 'Altyazı Kayıtları',
    subtitle_search_admin: 'Altyazı Ara',
    subtitle_search_admin_ph: 'varlık, etiket, dil...',
    subtitle_delete_file: 'Altyazı dosyasını diskten de sil',
    subtitle_lang: 'Dil',
    subtitle_set_active: 'Aktif Yap',
    subtitle_save: 'Kaydet',
    subtitle_delete_db: 'DBden Sil',
    subtitle_saved: 'Altyazı kaydı kaydedildi.',
    subtitle_deleted: 'Altyazı kaydı silindi.',
    subtitle_none: 'Altyazı kaydı bulunamadı.',
    subtitle_confirm_delete: 'Bu altyazı kaydı veritabanından silinsin mi?',
    combined_search: 'Birleşik Altyazı + OCR Arama',
    combined_search_query: 'Arama Metni',
    combined_search_query_ph: 'Arama metni girin...',
    combined_search_limit: 'Limit',
    combined_search_run: 'Aramayı Çalıştır',
    combined_search_none: 'Eşleşme bulunamadı.'
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
  document.title = t('admin_title');
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

function formatEditorTc(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  const ff = String(Math.floor((safe % 1) * 25)).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
}

function formatEditorMsTc(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  const ms = String(Math.floor((safe % 1) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function parseEditorTcToSec(rawTc) {
  const text = String(rawTc || '').trim();
  const match = text.match(/^(\d{2}):(\d{2}):(\d{2})(?:([.,:])(\d{2,3}))?$/);
  if (!match) return null;
  const hh = Number(match[1] || 0);
  const mm = Number(match[2] || 0);
  const ss = Number(match[3] || 0);
  const sep = String(match[4] || '');
  const fracRaw = String(match[5] || '');
  let fracSec = 0;
  if (fracRaw) {
    if (sep === ':' && fracRaw.length <= 2) {
      const frame = Number(fracRaw);
      fracSec = Math.max(0, frame) / 25;
    } else {
      const ms = Number(fracRaw.padEnd(3, '0').slice(0, 3));
      fracSec = Math.max(0, ms) / 1000;
    }
  }
  return (hh * 3600) + (mm * 60) + ss + fracSec;
}

function remapTimecodesInText(content, formatter) {
  const mapFn = typeof formatter === 'function' ? formatter : formatEditorTc;
  return String(content || '').replace(/\b\d{2}:\d{2}:\d{2}(?:[.,:]\d{2,3})?\b/g, (token) => {
    const sec = parseEditorTcToSec(token);
    if (!Number.isFinite(sec)) return token;
    return mapFn(sec);
  });
}

function convertContentTimecodesToFrames(content) {
  return remapTimecodesInText(content, formatEditorTc);
}

function convertContentTimecodesToMilliseconds(content) {
  return remapTimecodesInText(content, formatEditorMsTc);
}

function openTextEditorModal({
  title,
  content,
  mediaUrl = '',
  mediaStartSec = 0,
  previewMode = 'audio',
  contentTimecodeMode = 'frames',
  onSave = null
}) {
  return new Promise((resolve) => {
    const safeMediaUrl = String(mediaUrl || '').trim();
    const mode = String(previewMode || 'audio').trim().toLowerCase();
    const hasAudio = Boolean(mode === 'audio' && safeMediaUrl);
    const hasVideo = Boolean(mode === 'video' && safeMediaUrl);
    const backdrop = document.createElement('div');
    backdrop.className = 'content-modal-backdrop';
    backdrop.innerHTML = `
      <div class="content-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Editor')}">
        <div class="content-modal-head">
          <h4>${escapeHtml(title || 'Editor')}</h4>
          <button type="button" id="contentEditorCloseBtn" class="content-modal-close" aria-label="${escapeHtml(t('content_cancel'))}">×</button>
        </div>
        ${hasAudio ? `
        <div class="content-modal-audio" role="group" aria-label="${escapeHtml(t('content_audio_player'))}">
          <div class="content-modal-audio-head">
            <span>${escapeHtml(t('content_audio_player'))}</span>
            <span class="content-modal-audio-tc">${escapeHtml(t('content_audio_tc'))}: <strong id="contentEditorAudioTc">00:00:00:00</strong></span>
          </div>
          <audio id="contentEditorAudio" preload="metadata" src="${escapeHtml(safeMediaUrl)}"></audio>
          <div class="content-modal-audio-controls">
            <button type="button" id="contentEditorAudioToggle">Play</button>
            <input id="contentEditorAudioTimeline" type="range" min="0" max="0" step="0.01" value="0" />
            <span class="content-modal-audio-duration" id="contentEditorAudioDuration">00:00:00:00</span>
          </div>
        </div>
        ` : ''}
        ${hasVideo ? `
        <div class="content-modal-video" role="group" aria-label="${escapeHtml(t('type_video'))}">
          <div class="content-modal-video-overlay">
            <span class="content-modal-audio-tc">${escapeHtml(t('content_audio_tc'))}: <strong id="contentEditorVideoTc">00:00:00:00</strong></span>
          </div>
          <video id="contentEditorVideo" class="content-modal-video-el" controls preload="metadata" src="${escapeHtml(safeMediaUrl)}"></video>
        </div>
        ` : ''}
        <div class="content-modal-toolbar">
          <input id="contentEditorFindInput" type="text" placeholder="${escapeHtml(t('find_label'))}" />
          <input id="contentEditorReplaceInput" type="text" placeholder="${escapeHtml(t('replace_label'))}" />
          <button type="button" id="contentEditorFindNextBtn">${escapeHtml(t('find_next'))}</button>
          <button type="button" id="contentEditorReplaceAllBtn">${escapeHtml(t('replace_all'))}</button>
        </div>
        <div id="contentEditorSaveMsg" class="content-modal-save-msg"></div>
        <div class="content-modal-layout">
          <textarea id="contentEditorArea"></textarea>
          <aside class="content-modal-side">
            <h5>${escapeHtml(t('learned_corrections_title'))}</h5>
            <div class="content-modal-side-grid">
              <input id="contentEditorLcWrong" type="text" placeholder="${escapeHtml(t('learned_wrong_ph'))}" />
              <input id="contentEditorLcCorrect" type="text" placeholder="${escapeHtml(t('learned_correct_ph'))}" />
            </div>
            <div class="content-modal-side-actions">
              <button type="button" id="contentEditorLcUseSelection">${escapeHtml(t('learned_use_selection'))}</button>
              <button type="button" id="contentEditorLcAdd">${escapeHtml(t('learned_add'))}</button>
            </div>
            <div id="contentEditorLcMsg" class="content-modal-side-msg"></div>
            <div id="contentEditorLcRows" class="content-modal-side-rows"></div>
          </aside>
        </div>
        <div class="content-modal-actions">
          <button type="button" id="contentEditorCancelBtn">${escapeHtml(t('content_cancel'))}</button>
          <button type="button" id="contentEditorSaveBtn">${escapeHtml(t('content_save'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const area = backdrop.querySelector('#contentEditorArea');
    const findInput = backdrop.querySelector('#contentEditorFindInput');
    const replaceInput = backdrop.querySelector('#contentEditorReplaceInput');
    const lcWrongInput = backdrop.querySelector('#contentEditorLcWrong');
    const lcCorrectInput = backdrop.querySelector('#contentEditorLcCorrect');
    const lcMsg = backdrop.querySelector('#contentEditorLcMsg');
    const lcRows = backdrop.querySelector('#contentEditorLcRows');
    const saveMsg = backdrop.querySelector('#contentEditorSaveMsg');
    const audioEl = backdrop.querySelector('#contentEditorAudio');
    const audioToggleBtn = backdrop.querySelector('#contentEditorAudioToggle');
    const audioTimeline = backdrop.querySelector('#contentEditorAudioTimeline');
    const audioTc = backdrop.querySelector('#contentEditorAudioTc');
    const audioDuration = backdrop.querySelector('#contentEditorAudioDuration');
    const videoEl = backdrop.querySelector('#contentEditorVideo');
    const videoTc = backdrop.querySelector('#contentEditorVideoTc');
    if (area) {
      area.value = contentTimecodeMode === 'frames'
        ? convertContentTimecodesToFrames(content)
        : String(content || '');
    }
    let lastFindPos = 0;
    let lastFindQuery = '';
    // Keep folded text length stable so match indexes map to original text positions.
    const foldForFind = (value) => String(value || '')
      .normalize('NFC')
      .replace(/İ/g, 'I')
      .replace(/ı/g, 'i')
      .toLowerCase();
    const scrollSelectionIntoView = (startIndex) => {
      if (!area) return;
      const before = String(area.value || '').slice(0, Math.max(0, Number(startIndex) || 0));
      const line = before.split('\n').length - 1;
      const lineHeight = parseFloat(window.getComputedStyle(area).lineHeight) || 20;
      area.scrollTop = Math.max(0, (line - 2) * lineHeight);
    };

    const findNext = () => {
      const q = String(findInput?.value || '').trim();
      if (!q || !area) return;
      const text = String(area.value || '');
      const foldedText = foldForFind(text);
      const foldedQuery = foldForFind(q);
      if (!foldedQuery) return;
      if (foldedQuery !== lastFindQuery) {
        lastFindPos = 0;
        lastFindQuery = foldedQuery;
      }
      const from = Math.max(0, Number(lastFindPos) || 0);
      let idx = foldedText.indexOf(foldedQuery, from);
      if (idx < 0) idx = foldedText.indexOf(foldedQuery, 0);
      if (idx < 0) return;
      area.focus();
      area.setSelectionRange(idx, idx + foldedQuery.length);
      scrollSelectionIntoView(idx);
      lastFindPos = idx + foldedQuery.length;
    };

    const replaceAll = () => {
      if (!area) return;
      const q = String(findInput?.value || '').trim();
      if (!q) return;
      const next = String(replaceInput?.value || '');
      const source = String(area.value || '');
      const foldedSource = foldForFind(source);
      const foldedQuery = foldForFind(q);
      if (!foldedQuery) return;
      let cursor = 0;
      let out = '';
      while (cursor < source.length) {
        const idx = foldedSource.indexOf(foldedQuery, cursor);
        if (idx < 0) {
          out += source.slice(cursor);
          break;
        }
        out += source.slice(cursor, idx);
        out += next;
        cursor = idx + foldedQuery.length;
      }
      area.value = out;
    };

    const applyReplacementToArea = (wrong, correct) => {
      if (!area) return;
      const w = String(wrong || '').trim();
      const c = String(correct || '');
      if (!w) return;
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'giu');
      area.value = String(area.value || '').replace(rx, c);
    };

    const renderLcRows = (entries) => {
      if (!lcRows) return;
      const list = Array.isArray(entries) ? entries : [];
      if (!list.length) {
        lcRows.innerHTML = `<div class="muted">${escapeHtml(t('learned_none'))}</div>`;
        return;
      }
      lcRows.innerHTML = list.map((item) => `
        <div class="content-lc-row" data-wrong="${escapeHtml(item.wrong || '')}" data-correct="${escapeHtml(item.correct || '')}">
          <div class="content-lc-text">
            <strong>${escapeHtml(item.wrong || '')}</strong>
            <span>${escapeHtml(item.correct || '')}</span>
          </div>
          <div class="content-lc-actions">
            <button type="button" class="content-lc-apply">${escapeHtml(t('learned_apply'))}</button>
            <button type="button" class="content-lc-delete">${escapeHtml(t('learned_delete'))}</button>
          </div>
        </div>
      `).join('');
    };

    const loadLc = async () => {
      try {
        const result = await api('/api/admin/turkish-corrections');
        renderLcRows(result.entries || []);
      } catch (error) {
        if (lcMsg) lcMsg.textContent = String(error.message || 'Request failed');
      }
    };

    backdrop.querySelector('#contentEditorLcUseSelection')?.addEventListener('click', () => {
      if (!area || !lcWrongInput) return;
      const start = Number(area.selectionStart || 0);
      const end = Number(area.selectionEnd || 0);
      if (end <= start) return;
      const selected = String(area.value || '').slice(start, end).trim();
      if (selected) lcWrongInput.value = selected;
    });

    backdrop.querySelector('#contentEditorLcAdd')?.addEventListener('click', async () => {
      const wrong = String(lcWrongInput?.value || '').trim();
      const correct = String(lcCorrectInput?.value || '').trim();
      if (!wrong || !correct) {
        if (lcMsg) lcMsg.textContent = t('learned_invalid');
        return;
      }
      try {
        await api('/api/admin/turkish-corrections', {
          method: 'POST',
          body: JSON.stringify({ wrong, correct })
        });
        applyReplacementToArea(wrong, correct);
        if (lcWrongInput) lcWrongInput.value = '';
        if (lcCorrectInput) lcCorrectInput.value = '';
        if (lcMsg) lcMsg.textContent = t('learned_saved');
        await loadLc();
      } catch (error) {
        if (lcMsg) lcMsg.textContent = String(error.message || 'Request failed');
      }
    });

    lcRows?.addEventListener('click', async (event) => {
      const rowEl = event.target.closest('.content-lc-row');
      if (!rowEl) return;
      const wrong = String(rowEl.dataset.wrong || '');
      const correct = String(rowEl.dataset.correct || '');
      if (event.target.closest('.content-lc-apply')) {
        applyReplacementToArea(wrong, correct);
        return;
      }
      if (event.target.closest('.content-lc-delete')) {
        try {
          await api(`/api/admin/turkish-corrections?wrong=${encodeURIComponent(wrong)}`, { method: 'DELETE' });
          if (lcMsg) lcMsg.textContent = t('learned_deleted');
          await loadLc();
        } catch (error) {
          if (lcMsg) lcMsg.textContent = String(error.message || 'Request failed');
        }
      }
    });

    backdrop.querySelector('#contentEditorFindNextBtn')?.addEventListener('click', findNext);
    backdrop.querySelector('#contentEditorReplaceAllBtn')?.addEventListener('click', replaceAll);
    findInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      findNext();
    });

    const wireTimecodeSeek = (mediaEl, updateUi) => {
      area?.addEventListener('click', () => {
        const text = String(area.value || '');
        const caret = Number(area.selectionStart || 0);
        if (!text || caret < 0 || caret > text.length) return;
        const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
        const lineEndRaw = text.indexOf('\n', caret);
        const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
        const line = text.slice(lineStart, lineEnd);
        const rel = caret - lineStart;
        const tcRegex = /\b\d{2}:\d{2}:\d{2}(?:[.,:]\d{2,3})?\b/g;
        for (const match of line.matchAll(tcRegex)) {
          const token = String(match[0] || '');
          const start = Number(match.index || 0);
          const end = start + token.length;
          if (rel < start || rel > end) continue;
          const sec = parseEditorTcToSec(token);
          if (!Number.isFinite(sec)) return;
          const bounded = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
            ? Math.max(0, Math.min(mediaEl.duration, sec))
            : Math.max(0, sec);
          mediaEl.currentTime = bounded;
          updateUi();
          return;
        }
      });
    };

    if (audioEl && audioTimeline && audioTc && audioDuration) {
      const updateAudioUi = () => {
        if (!Number.isFinite(audioEl.duration) || audioEl.duration <= 0) return;
        audioTimeline.max = String(audioEl.duration);
        audioTimeline.value = String(Math.min(audioEl.duration, Math.max(0, audioEl.currentTime || 0)));
        audioTc.textContent = formatEditorTc(audioEl.currentTime || 0);
        audioDuration.textContent = formatEditorTc(audioEl.duration || 0);
      };

      audioEl.addEventListener('loadedmetadata', () => {
        const start = Math.max(0, Number(mediaStartSec) || 0);
        if (start > 0 && Number.isFinite(audioEl.duration) && start < audioEl.duration) {
          audioEl.currentTime = start;
        }
        updateAudioUi();
      });
      audioEl.addEventListener('timeupdate', updateAudioUi);
      audioEl.addEventListener('play', () => {
        if (audioToggleBtn) audioToggleBtn.textContent = 'Pause';
      });
      audioEl.addEventListener('pause', () => {
        if (audioToggleBtn) audioToggleBtn.textContent = 'Play';
      });
      audioToggleBtn?.addEventListener('click', async () => {
        try {
          if (audioEl.paused) await audioEl.play();
          else audioEl.pause();
        } catch (_error) {
          // ignore blocked autoplay/permissions
        }
      });
      audioTimeline.addEventListener('input', () => {
        const target = Math.max(0, Number(audioTimeline.value) || 0);
        audioTc.textContent = formatEditorTc(target);
      });
      audioTimeline.addEventListener('change', () => {
        const target = Math.max(0, Number(audioTimeline.value) || 0);
        audioEl.currentTime = target;
      });
      updateAudioUi();
      wireTimecodeSeek(audioEl, updateAudioUi);
    }

    if (videoEl && videoTc) {
      const updateVideoUi = () => {
        videoTc.textContent = formatEditorTc(videoEl.currentTime || 0);
      };
      videoEl.addEventListener('loadedmetadata', () => {
        const start = Math.max(0, Number(mediaStartSec) || 0);
        if (start > 0 && Number.isFinite(videoEl.duration) && start < videoEl.duration) {
          videoEl.currentTime = start;
        }
        updateVideoUi();
      });
      videoEl.addEventListener('timeupdate', updateVideoUi);
      videoEl.addEventListener('seeked', updateVideoUi);
      updateVideoUi();
      wireTimecodeSeek(videoEl, updateVideoUi);
    }

    const close = (result) => {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
      }
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
      }
      backdrop.remove();
      resolve(result);
    };
    backdrop.querySelector('#contentEditorCloseBtn')?.addEventListener('click', () => close(String(area?.value || '')));
    backdrop.querySelector('#contentEditorCancelBtn')?.addEventListener('click', () => close(null));
    backdrop.querySelector('#contentEditorSaveBtn')?.addEventListener('click', async () => {
      if (typeof onSave !== 'function') {
        if (saveMsg) saveMsg.textContent = '';
        return;
      }
      try {
        if (saveMsg) saveMsg.textContent = `${t('loading')}...`;
        const nextContent = String(area?.value || '');
        await onSave(
          contentTimecodeMode === 'frames'
            ? convertContentTimecodesToMilliseconds(nextContent)
            : nextContent
        );
        if (saveMsg) saveMsg.textContent = t('content_saved');
      } catch (error) {
        if (saveMsg) saveMsg.textContent = String(error.message || 'Request failed');
      }
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });
    loadLc().catch(() => {});
  });
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

function humanBytes(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = n / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function formatAdminDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString(currentLang === 'tr' ? 'tr-TR' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function jobStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'running') return t('health_job_status_running');
  if (normalized === 'queued') return t('health_job_status_queued');
  if (normalized === 'completed') return t('health_job_status_completed');
  if (normalized === 'failed') return t('health_job_status_failed');
  return normalized || '-';
}

function renderSystemJobSlot(titleKey, job, type) {
  if (!job) {
    return `
      <div class="system-job-slot is-empty">
        <div class="system-job-slot-title">${escapeHtml(t(titleKey))}</div>
        <div class="system-job-empty">${escapeHtml(t('health_job_idle'))}</div>
      </div>
    `;
  }
  const status = String(job.status || '').trim().toLowerCase();
  const badgeClass = status === 'completed' ? 'health-ok' : status === 'failed' ? 'health-bad' : 'health-warn';
  const typeIsSubtitle = type === 'subtitle';
  const details = [
    [t('health_job_asset'), job.assetTitle || '-'],
    [typeIsSubtitle ? t('health_job_label') : t('health_job_engine'), typeIsSubtitle ? (job.label || '-') : (job.engine || '-')],
    [typeIsSubtitle ? t('health_job_model') : t('health_job_segments'), typeIsSubtitle ? (job.model || '-') : String(job.segmentCount || 0)],
    [t('health_job_updated'), formatAdminDateTime(job.updatedAt)],
    [t('health_job_finished'), formatAdminDateTime(job.finishedAt)],
    [t('health_job_progress'), `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%`]
  ];
  if (!typeIsSubtitle) {
    details.splice(3, 0, [t('health_job_lines'), String(job.lineCount || 0)]);
  }
  const warningText = String(job.warning || '').trim();
  const errorText = String(job.error || '').trim();
  return `
    <div class="system-job-slot">
      <div class="system-job-slot-head">
        <div class="system-job-slot-title">${escapeHtml(t(titleKey))}</div>
        <span class="${badgeClass}">${escapeHtml(jobStatusLabel(status))}</span>
      </div>
      <div class="system-job-name">${escapeHtml(job.assetTitle || '-')}</div>
      <div class="system-job-details">
        ${details.map(([label, value]) => `<div class="system-job-detail"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || '-')}</span></div>`).join('')}
        ${warningText ? `<div class="system-job-detail"><strong>${escapeHtml(t('health_job_warning'))}</strong><span>${escapeHtml(warningText)}</span></div>` : ''}
        ${errorText ? `<div class="system-job-detail"><strong>${escapeHtml(t('health_job_error'))}</strong><span>${escapeHtml(errorText)}</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderSystemJobGroup(titleKey, group, type) {
  return `
    <section class="system-job-card">
      <h3>${escapeHtml(t(titleKey))}</h3>
      <div class="system-job-card-body">
        ${renderSystemJobSlot('health_job_running_now', group?.active || null, type)}
        ${renderSystemJobSlot('health_job_latest_done', group?.latestCompleted || null, type)}
        ${renderSystemJobSlot('health_job_latest_failed', group?.latestFailed || null, type)}
      </div>
    </section>
  `;
}

function renderSystemHealth(data) {
  if (!systemHealthRows) return;
  const disk = data?.disk || {};
  const jobs = data?.jobs || {};
  const services = data?.services || {};
  const integrity = data?.integrity || {};
  const recent = data?.recentJobs || {};
  const serviceBadge = (entry) => {
    const ok = Boolean(entry?.ok);
    const status = Number(entry?.status || 0);
    const cls = ok ? 'health-ok' : 'health-bad';
    const label = ok ? t('health_up') : t('health_down');
    const suffix = status > 0 ? ` (${status})` : '';
    return `<span class="${cls}">${escapeHtml(label)}${escapeHtml(suffix)}</span>`;
  };
  systemHealthRows.innerHTML = [
    `<div class="row"><strong>${escapeHtml(t('health_disk'))}</strong><span>${escapeHtml(t('health_uploads_size'))}: ${escapeHtml(humanBytes(disk.uploadsBytes))} | ${escapeHtml(t('health_uploads_files'))}: ${escapeHtml(String(disk.uploadsFiles || 0))} | ${escapeHtml(t('health_fs_free'))}: ${escapeHtml(humanBytes(disk.fsFreeBytes))} / ${escapeHtml(t('health_fs_total'))}: ${escapeHtml(humanBytes(disk.fsTotalBytes))}</span></div>`,
    `<div class="row"><strong>${escapeHtml(t('health_services'))}</strong><span>${escapeHtml(t('health_service_app'))}: ${serviceBadge(services.app)} | ${escapeHtml(t('health_service_postgres'))}: ${serviceBadge(services.postgres)} | ${escapeHtml(t('health_service_elastic'))}: ${serviceBadge(services.elasticsearch)} | ${escapeHtml(t('health_service_keycloak'))}: ${serviceBadge(services.keycloak)} | ${escapeHtml(t('health_service_oauth2_proxy'))}: ${serviceBadge(services.oauth2Proxy)}</span></div>`,
    `<div class="row"><strong>${escapeHtml(t('health_jobs'))}</strong><span>${escapeHtml(t('health_proxy_running'))}: ${escapeHtml(String(jobs.proxyRunning || 0))} | ${escapeHtml(t('health_subtitle_running'))}: ${escapeHtml(String(jobs.subtitleRunning || 0))} | ${escapeHtml(t('health_ocr_running'))}: ${escapeHtml(String(jobs.ocrRunning || 0))} | ${escapeHtml(t('health_proxy_failed'))}: ${escapeHtml(String(jobs.proxyFailed || 0))} | ${escapeHtml(t('health_subtitle_failed'))}: ${escapeHtml(String(jobs.subtitleFailed || 0))} | ${escapeHtml(t('health_ocr_failed'))}: ${escapeHtml(String(jobs.ocrFailed || 0))}</span></div>`,
    `<div class="row"><strong>${escapeHtml(t('health_integrity'))}</strong><span>${escapeHtml(t('health_missing_proxy'))}: ${escapeHtml(String(integrity.missingProxy || 0))} | ${escapeHtml(t('health_missing_thumbnail'))}: ${escapeHtml(String(integrity.missingThumbnail || 0))} | ${escapeHtml(t('health_missing_subtitle'))}: ${escapeHtml(String(integrity.missingSubtitle || 0))} | ${escapeHtml(t('health_missing_ocr'))}: ${escapeHtml(String(integrity.missingOcr || 0))}</span></div>`
  ].join('');
  if (systemJobStatusEl) {
    systemJobStatusEl.innerHTML = `
      <h3>${escapeHtml(t('health_recent_jobs'))}</h3>
      <div class="system-job-grid">
        ${renderSystemJobGroup('health_subtitle_jobs', recent.subtitle || {}, 'subtitle')}
        ${renderSystemJobGroup('health_ocr_jobs', recent.ocr || {}, 'ocr')}
      </div>
    `;
  }
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

function switchSettingsSubtab(tabName) {
  const target = String(tabName || 'general');
  settingsSubTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsTab === target);
  });
  settingsSubPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.settingsPanel === target);
  });
}

async function loadSettingsSubtabData(tabName) {
  const tab = String(tabName || '').trim().toLowerCase();
  if (tab === 'workflow') {
    await refreshTrackingAndHealth();
    return;
  }
  if (tab === 'proxy') {
    await refreshTrackingAndHealth();
    return;
  }
  if (tab === 'ocr') {
    await loadOcrRecords();
    return;
  }
  if (tab === 'subtitle') {
    await loadSubtitleRecords();
    return;
  }
  if (tab === 'users') {
    await loadUserPermissions();
  }
}

function updateProxyToolUi() {
  const mode = String(proxyToolAction?.value || 'thumbnail').trim().toLowerCase();
  const showTimecode = mode === 'thumbnail';
  // Proxy üretiminde de yeni kaynak video seçilebilsin diye dosya alanını açık tutuyoruz.
  const showReplaceFile = mode === 'replace_asset' || mode === 'replace_pdf' || mode === 'proxy';
  if (proxyToolTimecodeWrap) proxyToolTimecodeWrap.classList.toggle('hidden', !showTimecode);
  if (proxyToolReplaceFileWrap) proxyToolReplaceFileWrap.classList.toggle('hidden', !showReplaceFile);
}

function askReplaceGenerationOptions() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'content-modal-backdrop';
    backdrop.innerHTML = `
      <div class="content-modal proxy-replace-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('proxy_tool_action_replace_asset'))}">
        <h4>${escapeHtml(t('proxy_tool_action_replace_asset'))}</h4>
        <p class="proxy-replace-modal-note">${escapeHtml(t('proxy_tool_replace_options_prompt'))}</p>
        <label class="toggle-row"><input id="proxyReplaceAskThumb" type="checkbox" /> <span>${escapeHtml(t('proxy_tool_replace_gen_thumbnail'))}</span></label>
        <label class="toggle-row"><input id="proxyReplaceAskPreview" type="checkbox" /> <span>${escapeHtml(t('proxy_tool_replace_gen_preview'))}</span></label>
        <div class="content-modal-actions">
          <button type="button" id="proxyReplaceAskCancel">${escapeHtml(t('content_cancel'))}</button>
          <button type="button" id="proxyReplaceAskOk">${escapeHtml(t('proxy_tool_run'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector('#proxyReplaceAskCancel')?.addEventListener('click', () => close(null));
    backdrop.querySelector('#proxyReplaceAskOk')?.addEventListener('click', () => {
      const generateThumbnail = Boolean(backdrop.querySelector('#proxyReplaceAskThumb')?.checked);
      const generatePreview = Boolean(backdrop.querySelector('#proxyReplaceAskPreview')?.checked);
      close({ generateThumbnail, generatePreview });
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Missing file'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() : result;
      resolve(String(base64 || '').trim());
    };
    reader.readAsDataURL(file);
  });
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSuggestion(text, query) {
  const raw = String(text || '');
  const q = String(query || '').trim();
  if (!raw) return '';
  if (!q) return escapeHtml(raw);
  const matcher = new RegExp(`(${escapeRegExp(q)})`, 'ig');
  return escapeHtml(raw).replace(matcher, '<mark>$1</mark>');
}

function hideProxySuggestions() {
  if (!proxyToolSuggestList) return;
  proxyToolSuggestList.classList.add('hidden');
  proxyToolSuggestList.innerHTML = '';
  proxySuggestItems = [];
  proxySuggestActiveIndex = -1;
}

function setProxySuggestActive(index) {
  if (!proxyToolSuggestList) return;
  const buttons = Array.from(proxyToolSuggestList.querySelectorAll('.proxy-suggest-item'));
  if (!buttons.length) {
    proxySuggestActiveIndex = -1;
    return;
  }
  const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
  proxySuggestActiveIndex = safeIndex;
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === safeIndex);
  });
}

function applyProxySuggestion(item) {
  if (!item || !proxyToolAssetName) return;
  const title = String(item.title || '').trim();
  const fileName = String(item.fileName || '').trim();
  proxyToolAssetName.value = title || fileName;
  hideProxySuggestions();
}

function renderProxySuggestions(items, query) {
  if (!proxyToolSuggestList) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    hideProxySuggestions();
    return;
  }
  proxySuggestItems = list;
  proxySuggestActiveIndex = -1;
  proxyToolSuggestList.innerHTML = list.map((item, index) => {
    const title = String(item.title || item.fileName || item.id || '');
    const fileName = String(item.fileName || '');
    const type = String(item.type || '-');
    const trashState = item.inTrash ? 'trash' : 'active';
    return `
      <button type="button" class="proxy-suggest-item" data-index="${index}">
        <strong>${highlightSuggestion(title, query)}</strong>
        <span>${escapeHtml(type)} | ${escapeHtml(fileName || '-')} | ${escapeHtml(trashState)}</span>
      </button>
    `;
  }).join('');
  proxyToolSuggestList.classList.remove('hidden');
}

async function requestProxySuggestions() {
  const query = String(proxyToolAssetName?.value || '').trim();
  if (query.length < 2) {
    hideProxySuggestions();
    return;
  }
  const reqId = ++proxySuggestReqSeq;
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', '8');
  if (includeTrash) params.set('includeTrash', includeTrash.checked ? '1' : '0');
  try {
    const result = await api(`/api/admin/assets/suggest?${params.toString()}`);
    if (reqId !== proxySuggestReqSeq) return;
    renderProxySuggestions(result, query);
  } catch (_error) {
    if (reqId !== proxySuggestReqSeq) return;
    hideProxySuggestions();
  }
}

function queueProxySuggestionRequest() {
  if (proxySuggestTimer) clearTimeout(proxySuggestTimer);
  proxySuggestTimer = setTimeout(() => {
    requestProxySuggestions().catch(() => {});
  }, 180);
}

const adminRecordsModule = window.createAdminRecordsModule({
  api,
  t,
  escapeHtml,
  highlightSuggestion,
  openTextEditorModal,
  userPermissionsRows,
  userPermissionsMsg,
  ocrAdminSearchInput,
  ocrDeleteFileCheck,
  ocrRecordsRows,
  ocrRecordsMsg,
  runOcrAdminSearchBtn,
  subtitleAdminSearchInput,
  subtitleDeleteFileCheck,
  subtitleRecordsRows,
  subtitleRecordsMsg,
  combinedSearchInput,
  combinedSearchLimit,
  runCombinedSearchBtn,
  combinedSearchRows,
  combinedSearchMsg
});

async function loadUserPermissions() {
  return adminRecordsModule.loadUserPermissions();
}

async function loadOcrRecords() {
  return adminRecordsModule.loadOcrRecords();
}

async function loadSubtitleRecords() {
  return adminRecordsModule.loadSubtitleRecords();
}

async function runCombinedSearch() {
  return adminRecordsModule.runCombinedSearch();
}

adminRecordsModule.init();

function setAdminTabVisibility(tabName, visible) {
  const tab = adminTabs.find((item) => item.dataset.tab === tabName);
  const panel = adminPanels.find((item) => item.dataset.panel === tabName);
  if (tab) tab.classList.toggle('hidden', !visible);
  if (panel) panel.classList.toggle('hidden', !visible);
}

function setSettingsSubtabVisibility(tabName, visible) {
  const tab = settingsSubTabs.find((item) => item.dataset.settingsTab === tabName);
  const panel = settingsSubPanels.find((item) => item.dataset.settingsPanel === tabName);
  if (tab) tab.classList.toggle('hidden', !visible);
  if (panel) panel.classList.toggle('hidden', !visible);
}

function applyAdminAccessMode(me = {}) {
  currentAdminProfile = me && typeof me === 'object' ? me : {};
  const canAccessAdmin = Boolean(currentAdminProfile.canAccessAdmin || currentAdminProfile.isAdmin);
  const canAccessTextAdmin = Boolean(currentAdminProfile.canAccessTextAdmin || canAccessAdmin);
  const isTextOnly = canAccessTextAdmin && !canAccessAdmin;

  setAdminTabVisibility('apiHelp', !isTextOnly);
  setAdminTabVisibility('systemHealth', !isTextOnly);
  setAdminTabVisibility('settings', true);

  setSettingsSubtabVisibility('general', !isTextOnly);
  setSettingsSubtabVisibility('workflow', !isTextOnly);
  setSettingsSubtabVisibility('proxy', !isTextOnly);
  setSettingsSubtabVisibility('ocr', true);
  setSettingsSubtabVisibility('subtitle', true);
  setSettingsSubtabVisibility('users', !isTextOnly);

  if (settingsForm) settingsForm.classList.toggle('hidden', isTextOnly);
  if (settingsMsg) settingsMsg.classList.toggle('hidden', isTextOnly);
  if (ocrSettingsForm) ocrSettingsForm.classList.toggle('hidden', isTextOnly);
  if (ocrSettingsMsg) ocrSettingsMsg.classList.toggle('hidden', isTextOnly);

  if (isTextOnly) {
    switchTab('settings');
    switchSettingsSubtab('ocr');
  }

  return { canAccessAdmin, canAccessTextAdmin, isTextOnly };
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
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_endpoints_title'))}</h3><pre>${escapeHtml(`GET    /api/workflow\nGET    /api/me\nGET    /api/assets\nPOST   /api/assets\nPOST   /api/assets/upload\nGET    /api/assets/:id\nPATCH  /api/assets/:id\nPOST   /api/assets/:id/transition\nPOST   /api/assets/:id/versions\nPOST   /api/assets/:id/cuts\nPATCH  /api/assets/:id/cuts/:cutId\nDELETE /api/assets/:id/cuts/:cutId\nPOST   /api/assets/:id/trash\nPOST   /api/assets/:id/restore\nDELETE /api/assets/:id\nGET    /api/collections\nPOST   /api/collections\n\nGET    /api/admin/system-health\nGET    /api/admin/ocr-records\nPATCH  /api/admin/ocr-records\nDELETE /api/admin/ocr-records\nGET    /api/admin/ocr-records/content\nPATCH  /api/admin/ocr-records/content\nGET    /api/admin/subtitle-records\nPATCH  /api/admin/subtitle-records\nDELETE /api/admin/subtitle-records\nGET    /api/admin/subtitle-records/content\nPATCH  /api/admin/subtitle-records/content\nGET    /api/admin/text-search`)}</pre></div>`
  ].join('');
}

async function loadSettings() {
  const settings = await api('/api/admin/settings');
  settingsForm.elements.workflowTrackingEnabled.checked = Boolean(settings.workflowTrackingEnabled);
  settingsForm.elements.autoProxyBackfillOnUpload.checked = Boolean(settings.autoProxyBackfillOnUpload);
  {
    const mode = String(settings.playerUiMode || 'vidstack').toLowerCase();
    settingsForm.elements.playerUiMode.value = (mode === 'vidstack' || mode === 'mpegdash') ? mode : 'vidstack';
  }
  settingsForm.elements.apiTokenEnabled.checked = Boolean(settings.apiTokenEnabled);
  settingsForm.elements.oidcBearerEnabled.checked = Boolean(settings.oidcBearerEnabled);
  if (apiTokenInput) apiTokenInput.value = String(settings.apiToken || '');
  if (oidcIssuerUrlInput) oidcIssuerUrlInput.value = String(settings.oidcIssuerUrl || '');
  if (oidcJwksUrlInput) oidcJwksUrlInput.value = String(settings.oidcJwksUrl || '');
  if (oidcAudienceInput) oidcAudienceInput.value = String(settings.oidcAudience || '');
  {
    const advancedModeInput = document.getElementById('ocrDefaultAdvancedMode');
    const turkishFixInput = document.getElementById('ocrDefaultTurkishAiCorrect');
    const blurFilterInput = document.getElementById('ocrDefaultEnableBlurFilter');
    const regionModeInput = document.getElementById('ocrDefaultEnableRegionMode');
    const staticOverlayInput = document.getElementById('ocrDefaultIgnoreStaticOverlays');
    if (advancedModeInput) advancedModeInput.checked = Boolean(settings.ocrDefaultAdvancedMode);
    if (turkishFixInput) turkishFixInput.checked = Boolean(settings.ocrDefaultTurkishAiCorrect);
    if (blurFilterInput) blurFilterInput.checked = Boolean(settings.ocrDefaultEnableBlurFilter);
    if (regionModeInput) regionModeInput.checked = Boolean(settings.ocrDefaultEnableRegionMode);
    if (staticOverlayInput) staticOverlayInput.checked = Boolean(settings.ocrDefaultIgnoreStaticOverlays);
  }
  renderApiHelp();
  renderApiGuide();
}

async function refreshTrackingAndHealth() {
  const [tracking, health, systemHealth] = await Promise.all([
    api('/api/admin/workflow-tracking'),
    api('/api/admin/ffmpeg-health'),
    api('/api/admin/system-health')
  ]);
  renderWorkflowTracking(tracking);
  renderHealth(health);
  renderSystemHealth(systemHealth);
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
    playerUiMode: String(settingsForm.elements.playerUiMode.value || 'vidstack'),
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

ocrSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    ocrDefaultAdvancedMode: Boolean(document.getElementById('ocrDefaultAdvancedMode')?.checked),
    ocrDefaultTurkishAiCorrect: Boolean(document.getElementById('ocrDefaultTurkishAiCorrect')?.checked),
    ocrDefaultEnableBlurFilter: Boolean(document.getElementById('ocrDefaultEnableBlurFilter')?.checked),
    ocrDefaultEnableRegionMode: Boolean(document.getElementById('ocrDefaultEnableRegionMode')?.checked),
    ocrDefaultIgnoreStaticOverlays: Boolean(document.getElementById('ocrDefaultIgnoreStaticOverlays')?.checked)
  };
  await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
  if (ocrSettingsMsg) ocrSettingsMsg.textContent = t('settings_saved');
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

proxyToolAction?.addEventListener('change', () => {
  updateProxyToolUi();
});

runProxyToolBtn?.addEventListener('click', async () => {
  hideProxySuggestions();
  const assetName = String(proxyToolAssetName?.value || '').trim();
  if (!assetName) {
    if (proxyToolMsg) proxyToolMsg.textContent = t('proxy_tool_name_required');
    return;
  }

  const mode = String(proxyToolAction?.value || 'thumbnail').trim().toLowerCase();
  const payload = { assetName, mode };
  if (mode === 'thumbnail') payload.timecode = String(proxyToolTimecode?.value || '').trim();
  if (mode === 'delete_asset') {
    const ok = confirm(t('proxy_tool_delete_confirm'));
    if (!ok) {
      if (proxyToolMsg) proxyToolMsg.textContent = '';
      return;
    }
  }
  if (mode === 'replace_asset' || mode === 'replace_pdf') {
    const file = proxyToolReplaceFile?.files?.[0] || null;
    if (!file) {
      if (proxyToolMsg) proxyToolMsg.textContent = t('proxy_tool_replace_file_required');
      return;
    }
    const options = await askReplaceGenerationOptions();
    if (!options) {
      if (proxyToolMsg) proxyToolMsg.textContent = '';
      return;
    }
    payload.fileName = String(file.name || '').trim() || 'replacement.bin';
    payload.mimeType = String(file.type || '').trim();
    payload.fileBase64 = await fileToBase64(file);
    payload.generateThumbnail = Boolean(options.generateThumbnail);
    payload.generatePreview = Boolean(options.generatePreview);
  }
  if (mode === 'proxy') {
    const file = proxyToolReplaceFile?.files?.[0] || null;
    if (file) {
      // Dosya seçilmişse backend bunu aynı istek içinde ana kaynak olarak bağlayacak.
      payload.fileName = String(file.name || '').trim() || 'source.bin';
      payload.mimeType = String(file.type || '').trim();
      payload.fileBase64 = await fileToBase64(file);
    }
  }

  if (proxyToolMsg) proxyToolMsg.textContent = `${t('loading')}...`;
  try {
    const result = await api('/api/admin/proxy-tools/run', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const extra = [];
    if (result.timecode) extra.push(`TC ${result.timecode}`);
    if (Number(result.previewChars) > 0) extra.push(`${result.previewChars} chars`);
    if (Number(result.matchedCount) > 1) extra.push(t('proxy_tool_multi_match'));
    const suffix = extra.length ? ` | ${extra.join(' | ')}` : '';
    if (proxyToolMsg) {
      proxyToolMsg.textContent = `${t('proxy_tool_done')}: ${result.assetTitle || result.assetId} (${result.mode})${suffix}`;
    }
    if ((mode === 'replace_asset' || mode === 'replace_pdf') && proxyToolReplaceFile) {
      proxyToolReplaceFile.value = '';
    }
    await refreshTrackingAndHealth();
  } catch (error) {
    if (proxyToolMsg) proxyToolMsg.textContent = String(error.message || 'Request failed');
  }
});

proxyToolAssetName?.addEventListener('focus', () => {
  if (proxySuggestHideTimer) {
    clearTimeout(proxySuggestHideTimer);
    proxySuggestHideTimer = null;
  }
  queueProxySuggestionRequest();
});

proxyToolAssetName?.addEventListener('input', () => {
  queueProxySuggestionRequest();
});

proxyToolAssetName?.addEventListener('blur', () => {
  if (proxySuggestHideTimer) clearTimeout(proxySuggestHideTimer);
  proxySuggestHideTimer = setTimeout(() => {
    hideProxySuggestions();
    proxySuggestHideTimer = null;
  }, 120);
});

proxyToolAssetName?.addEventListener('keydown', (event) => {
  const isOpen = Boolean(proxyToolSuggestList && !proxyToolSuggestList.classList.contains('hidden'));
  if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    queueProxySuggestionRequest();
    return;
  }
  if (!isOpen) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setProxySuggestActive((proxySuggestActiveIndex < 0 ? -1 : proxySuggestActiveIndex) + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setProxySuggestActive((proxySuggestActiveIndex < 0 ? proxySuggestItems.length : proxySuggestActiveIndex) - 1);
  } else if (event.key === 'Enter') {
    if (proxySuggestActiveIndex >= 0 && proxySuggestItems[proxySuggestActiveIndex]) {
      event.preventDefault();
      applyProxySuggestion(proxySuggestItems[proxySuggestActiveIndex]);
    }
  } else if (event.key === 'Escape') {
    hideProxySuggestions();
  }
});

proxyToolSuggestList?.addEventListener('mousedown', (event) => {
  event.preventDefault();
});

proxyToolSuggestList?.addEventListener('click', (event) => {
  const button = event.target.closest('.proxy-suggest-item');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isFinite(index) || index < 0 || index >= proxySuggestItems.length) return;
  applyProxySuggestion(proxySuggestItems[index]);
});

includeTrash?.addEventListener('change', () => {
  if (document.activeElement === proxyToolAssetName) {
    queueProxySuggestionRequest();
  }
});

adminTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    hideProxySuggestions();
    const target = btn.dataset.tab || 'apiHelp';
    switchTab(target);
    if (target === 'settings') {
      const activeSub = settingsSubTabs.find((item) => item.classList.contains('active'))?.dataset?.settingsTab || 'general';
      loadSettingsSubtabData(activeSub).catch((error) => {
        if (settingsMsg) settingsMsg.textContent = String(error.message || 'Request failed');
      });
    }
  });
});

settingsSubTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.settingsTab || 'general';
    switchSettingsSubtab(target);
    loadSettingsSubtabData(target).catch((error) => {
      if (settingsMsg) settingsMsg.textContent = String(error.message || 'Request failed');
    });
  });
});

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
  applyI18n();
  if (!currentAdminProfile?.canAccessTextAdmin || currentAdminProfile?.canAccessAdmin || currentAdminProfile?.isAdmin) {
    await refreshTrackingAndHealth();
    await loadUserPermissions();
  }
  await loadOcrRecords();
  await loadSubtitleRecords();
  if (activeJobId) {
    const job = await api(`/api/admin/proxy-jobs/${activeJobId}`);
    renderProxyJob(job);
  }
});

const onLanguageShortcut = (event) => {
  if (event.key !== 'L' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (!languageSelect) return;
  const nextLang = languageSelect.value === 'tr' ? 'en' : 'tr';
  languageSelect.value = nextLang;
  languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  event.preventDefault();
  event.stopPropagation();
};

document.addEventListener('keydown', onLanguageShortcut);

(async () => {
  try {
    const me = await api('/api/me');
    const access = applyAdminAccessMode(me);
    if (!access.canAccessAdmin && !access.canAccessTextAdmin) {
      window.location.href = '/';
      return;
    }
    await loadI18nFile();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyI18n();
    updateProxyToolUi();
    if (!access.isTextOnly) {
      await loadSettings();
      await refreshTrackingAndHealth();
      await loadUserPermissions();
    }
    await loadOcrRecords();
    await loadSubtitleRecords();
    switchSettingsSubtab(access.isTextOnly ? 'ocr' : 'general');
  } catch (error) {
    ffmpegHealthEl.textContent = error.message;
  }
})();
