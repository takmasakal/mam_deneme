const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';

const ffmpegHealthEl = document.getElementById('ffmpegHealth');
const systemHealthRows = document.getElementById('systemHealthRows');
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
let ocrRecordsTimer = null;
let subtitleRecordsTimer = null;
let availableUserPermissions = [];

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
    player_mode_native: 'Native player',
    player_mode_custom: 'Custom player',
    player_mode_vidstack: 'Vidstack',
    player_mode_videojs: 'Open-source (Video.js)',
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
    proxy_tool_action_thumbnail: 'Generate Thumbnail',
    proxy_tool_action_preview: 'Generate Preview',
    proxy_tool_action_proxy: 'Generate Proxy',
    proxy_tool_action_replace_asset: 'Replace Asset',
    proxy_tool_timecode: 'Thumbnail Timecode',
    proxy_tool_timecode_ph: '00:00:12:10 or 12.4',
    proxy_tool_replace_file: 'New Asset File',
    proxy_tool_replace_file_required: 'Please select a file.',
    proxy_tool_replace_options_title: 'After replace',
    proxy_tool_replace_gen_thumbnail: 'Generate thumbnail',
    proxy_tool_replace_gen_preview: 'Generate preview',
    proxy_tool_replace_type_mismatch: 'New file type must match existing asset type.',
    proxy_tool_replace_options_prompt: 'Select what to generate after replacing the main file.',
    proxy_tool_run: 'Run Action',
    proxy_tool_name_required: 'Asset name is required.',
    proxy_tool_done: 'Action completed',
    proxy_tool_multi_match: 'Multiple assets matched, latest one used',
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
    user_settings: 'User Settings',
    perm_admin_access: 'Admin page access',
    perm_asset_delete: 'Asset delete',
    perm_pdf_advanced: 'PDF advanced tools',
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
    player_mode_native: 'Varsayılan oynatıcı',
    player_mode_custom: 'Özel oynatıcı',
    player_mode_vidstack: 'Vidstack',
    player_mode_videojs: 'Açık kaynak (Video.js)',
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
    proxy_tool_action_thumbnail: 'Thumbnail Üret',
    proxy_tool_action_preview: 'Önizleme Üret',
    proxy_tool_action_proxy: 'Proxy Uret',
    proxy_tool_action_replace_asset: 'Varlık Değiştir',
    proxy_tool_timecode: 'Thumbnail Timecode',
    proxy_tool_timecode_ph: '00:00:12:10 veya 12.4',
    proxy_tool_replace_file: 'Yeni Varlık Dosyası',
    proxy_tool_replace_file_required: 'Lütfen bir dosya seçin.',
    proxy_tool_replace_options_title: 'Değişim sonrası',
    proxy_tool_replace_gen_thumbnail: 'Thumbnail üret',
    proxy_tool_replace_gen_preview: 'Önizleme üret',
    proxy_tool_replace_type_mismatch: 'Yeni dosya türü mevcut varlık türü ile aynı olmalı.',
    proxy_tool_replace_options_prompt: 'Ana dosya değiştikten sonra üretilecekleri seçin.',
    proxy_tool_run: 'İşlemi Çalıştır',
    proxy_tool_name_required: 'Varlık adı gerekli.',
    proxy_tool_done: 'İşlem tamamlandı',
    proxy_tool_multi_match: 'Birden fazla varlık bulundu, en güncel olan kullanıldı',
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
    user_settings: 'Kullanıcı Ayarları',
    perm_admin_access: 'Yönetim sayfasına erişim',
    perm_asset_delete: 'Varlık silme',
    perm_pdf_advanced: 'PDF gelişmiş araçlar',
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

function openTextEditorModal({ title, content, mediaUrl = '', mediaStartSec = 0 }) {
  return new Promise((resolve) => {
    const safeMediaUrl = String(mediaUrl || '').trim();
    const hasMedia = Boolean(safeMediaUrl);
    const backdrop = document.createElement('div');
    backdrop.className = 'content-modal-backdrop';
    backdrop.innerHTML = `
      <div class="content-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Editor')}">
        <h4>${escapeHtml(title || 'Editor')}</h4>
        ${hasMedia ? `
        <div class="content-modal-audio" role="group" aria-label="${escapeHtml(t('content_audio_player'))}">
          <div class="content-modal-audio-head">
            <span>${escapeHtml(t('content_audio_player'))}</span>
            <span class="content-modal-audio-tc">${escapeHtml(t('content_audio_tc'))}: <strong id="contentEditorAudioTc">00:00:00.000</strong></span>
          </div>
          <audio id="contentEditorAudio" preload="metadata" src="${escapeHtml(safeMediaUrl)}"></audio>
          <div class="content-modal-audio-controls">
            <button type="button" id="contentEditorAudioToggle">Play</button>
            <input id="contentEditorAudioTimeline" type="range" min="0" max="0" step="0.01" value="0" />
            <span class="content-modal-audio-duration" id="contentEditorAudioDuration">00:00:00.000</span>
          </div>
        </div>
        ` : ''}
        <div class="content-modal-toolbar">
          <label>
            <span>${escapeHtml(t('find_label'))}</span>
            <input id="contentEditorFindInput" type="text" />
          </label>
          <label>
            <span>${escapeHtml(t('replace_label'))}</span>
            <input id="contentEditorReplaceInput" type="text" />
          </label>
          <button type="button" id="contentEditorFindNextBtn">${escapeHtml(t('find_next'))}</button>
          <button type="button" id="contentEditorReplaceAllBtn">${escapeHtml(t('replace_all'))}</button>
        </div>
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
    const audioEl = backdrop.querySelector('#contentEditorAudio');
    const audioToggleBtn = backdrop.querySelector('#contentEditorAudioToggle');
    const audioTimeline = backdrop.querySelector('#contentEditorAudioTimeline');
    const audioTc = backdrop.querySelector('#contentEditorAudioTc');
    const audioDuration = backdrop.querySelector('#contentEditorAudioDuration');
    if (area) area.value = String(content || '');
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
          const bounded = Number.isFinite(audioEl.duration) && audioEl.duration > 0
            ? Math.max(0, Math.min(audioEl.duration, sec))
            : Math.max(0, sec);
          audioEl.currentTime = bounded;
          updateAudioUi();
          return;
        }
      });
    }

    const close = (result) => {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
      }
      backdrop.remove();
      resolve(result);
    };
    backdrop.querySelector('#contentEditorCancelBtn')?.addEventListener('click', () => close(null));
    backdrop.querySelector('#contentEditorSaveBtn')?.addEventListener('click', () => {
      close(String(area?.value || ''));
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

function renderSystemHealth(data) {
  if (!systemHealthRows) return;
  const disk = data?.disk || {};
  const jobs = data?.jobs || {};
  const services = data?.services || {};
  const integrity = data?.integrity || {};
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
  const showReplaceFile = mode === 'replace_asset' || mode === 'replace_pdf';
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

function formatPermissionLabel(definition) {
  const labelKey = String(definition?.labelKey || '').trim();
  if (labelKey && labelKey !== 'undefined') {
    const translated = t(labelKey);
    if (translated && translated !== labelKey) return translated;
  }
  const key = String(definition?.key || '').trim();
  if (!key) return '';
  return key
    .split(/[._-]+/)
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
    .join(' ');
}

function renderUserPermissions(users, definitions = []) {
  if (!userPermissionsRows) return;
  const list = Array.isArray(users) ? users : [];
  const defs = Array.isArray(definitions) && definitions.length
    ? definitions
    : [
        { key: 'admin.access', legacyField: 'adminPageAccess', labelKey: 'perm_admin_access' },
        { key: 'asset.delete', legacyField: 'assetDelete', labelKey: 'perm_asset_delete' },
        { key: 'pdf.advanced', legacyField: 'pdfAdvancedTools', labelKey: 'perm_pdf_advanced' }
      ];
  userPermissionsRows.innerHTML = list.map((user) => {
    const uname = escapeHtml(user.username || '');
    const activeKeys = new Set(Array.isArray(user.permissionKeys) ? user.permissionKeys : []);
    const checkboxes = defs.map((definition) => {
      const checked = activeKeys.has(definition.key)
        || Boolean(user?.[definition.legacyField]);
      return `
        <label>
          <input
            type="checkbox"
            class="perm-checkbox"
            data-permission-key="${escapeHtml(definition.key)}"
            ${checked ? 'checked' : ''}
          />
          ${escapeHtml(formatPermissionLabel(definition))}
        </label>
      `;
    }).join('');
    return `
      <div class="row user-perm-row" data-username="${uname}">
        <strong>${uname}</strong>
        ${checkboxes}
        <button type="button" class="perm-save-btn">${escapeHtml(t('save_settings'))}</button>
      </div>
    `;
  }).join('');

  userPermissionsRows.querySelectorAll('.perm-save-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const rowEl = event.currentTarget.closest('.user-perm-row');
      const username = rowEl?.dataset?.username || '';
      if (!username) return;
      const permissionKeys = Array.from(rowEl.querySelectorAll('.perm-checkbox:checked'))
        .map((input) => String(input?.dataset?.permissionKey || '').trim())
        .filter(Boolean);
      const legacyFlags = Object.fromEntries(
        (availableUserPermissions || []).map((definition) => [
          definition.legacyField,
          permissionKeys.includes(definition.key)
        ])
      );
      await api(`/api/admin/user-permissions/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionKeys, ...legacyFlags })
      });
      if (userPermissionsMsg) userPermissionsMsg.textContent = t('user_permissions_saved');
    });
  });
}

async function loadUserPermissions() {
  const result = await api('/api/admin/user-permissions');
  availableUserPermissions = Array.isArray(result.availablePermissions) ? result.availablePermissions : [];
  renderUserPermissions(result.users || [], availableUserPermissions);
}

function renderOcrRecords(records) {
  if (!ocrRecordsRows) return;
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    ocrRecordsRows.innerHTML = `<div class="row"><span>${escapeHtml(t('ocr_none'))}</span></div>`;
    return;
  }
  ocrRecordsRows.innerHTML = list.map((item) => `
    <div class="row ocr-row" data-asset-id="${escapeHtml(item.assetId)}" data-item-id="${escapeHtml(item.itemId)}">
      <div class="ocr-row-main">
        <strong>${escapeHtml(item.assetTitle || item.fileName || item.assetId)}</strong>
        <span>${escapeHtml(t('ocr_engine'))}: ${escapeHtml(item.ocrEngine || '-')} | ${escapeHtml(t('ocr_lines'))}: ${escapeHtml(String(item.lineCount || 0))} | ${escapeHtml(t('ocr_segments'))}: ${escapeHtml(String(item.segmentCount || 0))}</span>
      </div>
      <input type="text" class="ocr-label-input" value="${escapeHtml(item.ocrLabel || '')}" />
      <button type="button" class="ocr-content-btn">${escapeHtml(t('content_edit'))}</button>
      <button type="button" class="ocr-save-btn">${escapeHtml(t('ocr_edit'))}</button>
      <button type="button" class="ocr-delete-btn">${escapeHtml(t('ocr_delete_db'))}</button>
    </div>
  `).join('');
}

async function loadOcrRecords() {
  if (!ocrRecordsRows) return;
  const q = String(ocrAdminSearchInput?.value || '').trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('limit', '800');
  const result = await api(`/api/admin/ocr-records?${params.toString()}`);
  renderOcrRecords(result.records || []);
}

function queueLoadOcrRecords() {
  if (ocrRecordsTimer) clearTimeout(ocrRecordsTimer);
  ocrRecordsTimer = setTimeout(() => {
    loadOcrRecords().catch((error) => {
      if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
    });
  }, 180);
}

function renderSubtitleRecords(records) {
  if (!subtitleRecordsRows) return;
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    subtitleRecordsRows.innerHTML = `<div class="row"><span>${escapeHtml(t('subtitle_none'))}</span></div>`;
    return;
  }
  subtitleRecordsRows.innerHTML = list.map((item) => `
    <div class="row subtitle-row" data-asset-id="${escapeHtml(item.assetId)}" data-item-id="${escapeHtml(item.itemId)}">
      <div class="subtitle-row-main">
        <strong>${escapeHtml(item.assetTitle || item.fileName || item.assetId)}</strong>
        <span>${escapeHtml(item.subtitleLabel || 'subtitle')} | ${escapeHtml(t('subtitle_lang'))}: ${escapeHtml(item.subtitleLang || 'tr')} ${item.active ? '| ACTIVE' : ''}</span>
      </div>
      <input type="text" class="subtitle-label-input" value="${escapeHtml(item.subtitleLabel || '')}" />
      <input type="text" class="subtitle-lang-input" value="${escapeHtml(item.subtitleLang || '')}" />
      <button type="button" class="subtitle-content-btn">${escapeHtml(t('content_edit'))}</button>
      <button type="button" class="subtitle-set-active-btn">${escapeHtml(t('subtitle_set_active'))}</button>
      <button type="button" class="subtitle-save-btn">${escapeHtml(t('subtitle_save'))}</button>
      <button type="button" class="subtitle-delete-btn">${escapeHtml(t('subtitle_delete_db'))}</button>
    </div>
  `).join('');
}

async function loadSubtitleRecords() {
  if (!subtitleRecordsRows) return;
  const q = String(subtitleAdminSearchInput?.value || '').trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('limit', '1200');
  const result = await api(`/api/admin/subtitle-records?${params.toString()}`);
  renderSubtitleRecords(result.records || []);
}

function queueLoadSubtitleRecords() {
  if (subtitleRecordsTimer) clearTimeout(subtitleRecordsTimer);
  subtitleRecordsTimer = setTimeout(() => {
    loadSubtitleRecords().catch((error) => {
      if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
    });
  }, 180);
}

function renderCombinedSearch(results, query) {
  if (!combinedSearchRows) return;
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    combinedSearchRows.innerHTML = `<div class="row"><span>${escapeHtml(t('combined_search_none'))}</span></div>`;
    return;
  }
  const q = String(query || '').trim();
  combinedSearchRows.innerHTML = list.map((item) => `
    <div class="row combined-row">
      <div class="combined-row-main">
        <strong>${escapeHtml(item.assetTitle || item.assetId || '')}</strong>
        <span>${escapeHtml(String(item.source || '').toUpperCase())} | TC ${escapeHtml(item.timecode || '00:00:00:00')} | ${escapeHtml(item.label || '-')}</span>
        <span>${highlightSuggestion(String(item.text || ''), q)}</span>
      </div>
    </div>
  `).join('');
}

async function runCombinedSearch() {
  if (!combinedSearchRows) return;
  const q = String(combinedSearchInput?.value || '').trim();
  if (!q) {
    renderCombinedSearch([], '');
    if (combinedSearchMsg) combinedSearchMsg.textContent = '';
    return;
  }
  const limit = Math.max(10, Math.min(500, Number(combinedSearchLimit?.value) || 120));
  if (combinedSearchMsg) combinedSearchMsg.textContent = `${t('loading')}...`;
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('limit', String(limit));
  const result = await api(`/api/admin/text-search?${params.toString()}`);
  renderCombinedSearch(result.results || [], q);
  if (combinedSearchMsg) combinedSearchMsg.textContent = `${(result.results || []).length} result(s)`;
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
    const mode = String(settings.playerUiMode || 'native').toLowerCase();
    settingsForm.elements.playerUiMode.value = (mode === 'custom' || mode === 'videojs' || mode === 'vidstack' || mode === 'mpegdash') ? mode : 'native';
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
    playerUiMode: String(settingsForm.elements.playerUiMode.value || 'native'),
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

ocrAdminSearchInput?.addEventListener('input', () => {
  queueLoadOcrRecords();
});

ocrAdminSearchInput?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  try {
    await loadOcrRecords();
  } catch (error) {
    if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
  }
});

runOcrAdminSearchBtn?.addEventListener('click', async () => {
  try {
    await loadOcrRecords();
  } catch (error) {
    if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
  }
});

subtitleAdminSearchInput?.addEventListener('input', () => {
  queueLoadSubtitleRecords();
});

ocrRecordsRows?.addEventListener('click', async (event) => {
  const rowEl = event.target.closest('.ocr-row');
  if (!rowEl) return;
  const assetId = String(rowEl.dataset.assetId || '').trim();
  const itemId = String(rowEl.dataset.itemId || '').trim();
  if (!assetId || !itemId) return;

  if (event.target.closest('.ocr-content-btn')) {
    try {
      if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('content_loading');
      const readResult = await api(`/api/admin/ocr-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
      let mediaUrl = '';
      try {
        const assetDetail = await api(`/api/assets/${encodeURIComponent(assetId)}`);
        mediaUrl = String(assetDetail?.proxyUrl || assetDetail?.mediaUrl || '').trim();
      } catch (_error) {
        mediaUrl = '';
      }
      const nextContent = await openTextEditorModal({
        title: `${t('ocr_records')} - ${rowEl.querySelector('.ocr-row-main strong')?.textContent || assetId}`,
        content: String(readResult.content || ''),
        mediaUrl
      });
      if (nextContent == null) return;
      await api('/api/admin/ocr-records/content', {
        method: 'PATCH',
        body: JSON.stringify({ assetId, itemId, content: nextContent })
      });
      if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('content_saved');
      await loadOcrRecords();
    } catch (error) {
      if (ocrRecordsMsg) ocrRecordsMsg.textContent = String(error.message || 'Request failed');
    }
    return;
  }

  if (event.target.closest('.ocr-save-btn')) {
    const nextLabel = String(rowEl.querySelector('.ocr-label-input')?.value || '').trim();
    if (!nextLabel) return;
    await api('/api/admin/ocr-records', {
      method: 'PATCH',
      body: JSON.stringify({ assetId, itemId, ocrLabel: nextLabel })
    });
    if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('ocr_saved');
    await loadOcrRecords();
    return;
  }

  if (event.target.closest('.ocr-delete-btn')) {
    if (!confirm(t('ocr_confirm_delete'))) return;
    await api('/api/admin/ocr-records', {
      method: 'DELETE',
      body: JSON.stringify({
        assetId,
        itemId,
        deleteFile: Boolean(ocrDeleteFileCheck?.checked)
      })
    });
    if (ocrRecordsMsg) ocrRecordsMsg.textContent = t('ocr_deleted');
    await loadOcrRecords();
  }
});

subtitleRecordsRows?.addEventListener('click', async (event) => {
  const rowEl = event.target.closest('.subtitle-row');
  if (!rowEl) return;
  const assetId = String(rowEl.dataset.assetId || '').trim();
  const itemId = String(rowEl.dataset.itemId || '').trim();
  if (!assetId || !itemId) return;

  const nextLabel = String(rowEl.querySelector('.subtitle-label-input')?.value || '').trim();
  const nextLang = String(rowEl.querySelector('.subtitle-lang-input')?.value || '').trim() || 'tr';

  if (event.target.closest('.subtitle-content-btn')) {
    try {
      if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('content_loading');
      const readResult = await api(`/api/admin/subtitle-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
      let mediaUrl = '';
      try {
        const assetDetail = await api(`/api/assets/${encodeURIComponent(assetId)}`);
        mediaUrl = String(assetDetail?.proxyUrl || assetDetail?.mediaUrl || '').trim();
      } catch (_error) {
        mediaUrl = '';
      }
      const nextContent = await openTextEditorModal({
        title: `${t('subtitle_records')} - ${rowEl.querySelector('.subtitle-row-main strong')?.textContent || assetId}`,
        content: String(readResult.content || ''),
        mediaUrl
      });
      if (nextContent == null) return;
      await api('/api/admin/subtitle-records/content', {
        method: 'PATCH',
        body: JSON.stringify({ assetId, itemId, content: nextContent })
      });
      if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('content_saved');
      await loadSubtitleRecords();
    } catch (error) {
      if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = String(error.message || 'Request failed');
    }
    return;
  }

  if (event.target.closest('.subtitle-set-active-btn')) {
    if (!nextLabel) return;
    await api('/api/admin/subtitle-records', {
      method: 'PATCH',
      body: JSON.stringify({ assetId, itemId, subtitleLabel: nextLabel, subtitleLang: nextLang, setActive: true })
    });
    if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_saved');
    await loadSubtitleRecords();
    return;
  }

  if (event.target.closest('.subtitle-save-btn')) {
    if (!nextLabel) return;
    await api('/api/admin/subtitle-records', {
      method: 'PATCH',
      body: JSON.stringify({ assetId, itemId, subtitleLabel: nextLabel, subtitleLang: nextLang })
    });
    if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_saved');
    await loadSubtitleRecords();
    return;
  }

  if (event.target.closest('.subtitle-delete-btn')) {
    if (!confirm(t('subtitle_confirm_delete'))) return;
    await api('/api/admin/subtitle-records', {
      method: 'DELETE',
      body: JSON.stringify({
        assetId,
        itemId,
        deleteFile: Boolean(subtitleDeleteFileCheck?.checked)
      })
    });
    if (subtitleRecordsMsg) subtitleRecordsMsg.textContent = t('subtitle_deleted');
    await loadSubtitleRecords();
  }
});

runCombinedSearchBtn?.addEventListener('click', async () => {
  try {
    await runCombinedSearch();
  } catch (error) {
    if (combinedSearchMsg) combinedSearchMsg.textContent = String(error.message || 'Request failed');
  }
});

combinedSearchInput?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  try {
    await runCombinedSearch();
  } catch (error) {
    if (combinedSearchMsg) combinedSearchMsg.textContent = String(error.message || 'Request failed');
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
  await refreshTrackingAndHealth();
  await loadUserPermissions();
  await loadOcrRecords();
  await loadSubtitleRecords();
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
    updateProxyToolUi();
    await loadSettings();
    await refreshTrackingAndHealth();
    await loadUserPermissions();
    await loadOcrRecords();
    await loadSubtitleRecords();
    switchSettingsSubtab('general');
  } catch (error) {
    ffmpegHealthEl.textContent = error.message;
  }
})();
