const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';

const ffmpegHealthEl = document.getElementById('ffmpegHealth');
const systemHealthRows = document.getElementById('systemHealthRows');
const systemJobStatusEl = document.getElementById('systemJobStatus');
const settingsForm = document.getElementById('settingsForm');
const settingsMsg = document.getElementById('settingsMsg');
const ocrSettingsForm = document.getElementById('ocrSettingsForm');
const ocrSettingsMsg = document.getElementById('ocrSettingsMsg');
const subtitleSettingsForm = document.getElementById('subtitleSettingsForm');
const subtitleSettingsMsg = document.getElementById('subtitleSettingsMsg');
const backupSettingsForm = document.getElementById('backupSettingsForm');
const backupSettingsMsg = document.getElementById('backupSettingsMsg');
const backupFilesRows = document.getElementById('backupFilesRows');
const runBackupNowBtn = document.getElementById('runBackupNowBtn');
const permissionBackupGroup = document.getElementById('permissionBackupGroup');
const permissionBackupMsg = document.getElementById('permissionBackupMsg');
const assetRightsExportName = document.getElementById('assetRightsExportName');
const exportAssetRightsBtn = document.getElementById('exportAssetRightsBtn');
const assetRightsImportFile = document.getElementById('assetRightsImportFile');
const importAssetRightsBtn = document.getElementById('importAssetRightsBtn');
const principalRightsExportName = document.getElementById('principalRightsExportName');
const exportPrincipalRightsBtn = document.getElementById('exportPrincipalRightsBtn');
const principalRightsImportFile = document.getElementById('principalRightsImportFile');
const importPrincipalRightsBtn = document.getElementById('importPrincipalRightsBtn');
const authSessionSettingsForm = document.getElementById('authSessionSettingsForm');
const authSessionSettingsMsg = document.getElementById('authSessionSettingsMsg');
const apiTokenInput = document.getElementById('apiTokenInput');
const oidcIssuerUrlInput = document.getElementById('oidcIssuerUrlInput');
const oidcJwksUrlInput = document.getElementById('oidcJwksUrlInput');
const oidcAudienceInput = document.getElementById('oidcAudienceInput');
const rotateApiTokenBtn = document.getElementById('rotateApiTokenBtn');
const copyApiTokenBtn = document.getElementById('copyApiTokenBtn');
const apiHelpBox = document.getElementById('apiHelpBox');
const apiGuideDoc = document.getElementById('apiGuideDoc');
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
const overviewCards = Array.from(document.querySelectorAll('[data-overview-target]'));
const settingsSubTabs = Array.from(document.querySelectorAll('.settings-subtab'));
const settingsSubPanels = Array.from(document.querySelectorAll('.settings-subpanel'));
const userPermissionsSearchInput = document.getElementById('userPermissionsSearchInput');
const userPermissionsPrincipalType = document.getElementById('userPermissionsPrincipalType');
const userPermissionsRows = document.getElementById('userPermissionsRows');
const userPermissionsMsg = document.getElementById('userPermissionsMsg');
const groupAdminGroupInput = document.getElementById('groupAdminGroupInput');
const groupAdminUserInput = document.getElementById('groupAdminUserInput');
const groupAdminScopeInput = document.getElementById('groupAdminScopeInput');
const groupAdminAssetTypeInput = document.getElementById('groupAdminAssetTypeInput');
const addGroupAdminBtn = document.getElementById('addGroupAdminBtn');
const groupAdminsRows = document.getElementById('groupAdminsRows');
const groupAdminsMsg = document.getElementById('groupAdminsMsg');
const refreshIdentityOverviewBtn = document.getElementById('refreshIdentityOverviewBtn');
const identityOverviewSummary = document.getElementById('identityOverviewSummary');
const identityGroupsRows = document.getElementById('identityGroupsRows');
const identityUsersRows = document.getElementById('identityUsersRows');
const identityUserSearchInput = document.getElementById('identityUserSearchInput');
const identityUserSearchButton = document.getElementById('identityUserSearchButton');
const identityMamGroupsRows = document.getElementById('identityMamGroupsRows');
const identityGroupOptions = document.getElementById('identityGroupOptions');
const identityUserOptions = document.getElementById('identityUserOptions');
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
const auditActorInput = document.getElementById('auditActorInput');
const auditActionSelect = document.getElementById('auditActionSelect');
const auditTargetInput = document.getElementById('auditTargetInput');
const auditTargetSuggestList = document.getElementById('auditTargetSuggestList');
const auditFromInput = document.getElementById('auditFromInput');
const auditToInput = document.getElementById('auditToInput');
const runAuditSearchBtn = document.getElementById('runAuditSearchBtn');
const exportAuditEventsBtn = document.getElementById('exportAuditEventsBtn');
const auditEventsRows = document.getElementById('auditEventsRows');
const auditEventsMsg = document.getElementById('auditEventsMsg');
const assetRightsSearchInput = document.getElementById('assetRightsSearchInput');
const assetRightsSuggestList = document.getElementById('assetRightsSuggestList');
const assetRightsTypeFilters = Array.from(document.querySelectorAll('input[name="assetRightsType"]'));
const assetRightsVisibilityFilter = document.getElementById('assetRightsVisibilityFilter');
const assetRightsSearchBtn = document.getElementById('assetRightsSearchBtn');
const assetRightsRows = document.getElementById('assetRightsRows');
const assetRightsMsg = document.getElementById('assetRightsMsg');
const assetRightsPageSize = document.getElementById('assetRightsPageSize');
const assetRightsPrevPage = document.getElementById('assetRightsPrevPage');
const assetRightsNextPage = document.getElementById('assetRightsNextPage');
const assetRightsPageInfo = document.getElementById('assetRightsPageInfo');
const documentRightsSearchInput = document.getElementById('documentRightsSearchInput');
const documentRightsSearchBtn = document.getElementById('documentRightsSearchBtn');
const documentRightsLockedOnlyCheck = document.getElementById('documentRightsLockedOnlyCheck');
const documentRightsRows = document.getElementById('documentRightsRows');
const documentRightsMsg = document.getElementById('documentRightsMsg');
const documentRightsPageSize = document.getElementById('documentRightsPageSize');
const documentRightsPrevPage = document.getElementById('documentRightsPrevPage');
const documentRightsNextPage = document.getElementById('documentRightsNextPage');
const documentRightsPageInfo = document.getElementById('documentRightsPageInfo');
const refreshRuntimeDiagnosticsBtn = document.getElementById('refreshRuntimeDiagnosticsBtn');
const activeUsersSectionTitle = document.getElementById('activeUsersSectionTitle');
const runtimeErrorsSectionTitle = document.getElementById('runtimeErrorsSectionTitle');
const activeUsersRows = document.getElementById('activeUsersRows');
const runtimeErrorRows = document.getElementById('runtimeErrorRows');
const runtimeDiagnosticsMsg = document.getElementById('runtimeDiagnosticsMsg');
const overviewActiveAssets = document.getElementById('overviewActiveAssets');
const overviewTotalAssets = document.getElementById('overviewTotalAssets');
const overviewSystemHealth = document.getElementById('overviewSystemHealth');
const overviewSystemHealthSub = document.getElementById('overviewSystemHealthSub');
const overviewOpenErrors = document.getElementById('overviewOpenErrors');
const overviewOpenErrorsSub = document.getElementById('overviewOpenErrorsSub');
const overviewActiveUsers = document.getElementById('overviewActiveUsers');
const accessScopeModule = window.createMainAccessScopeModule();

let currentLang = localStorage.getItem(LOCAL_LANG) || 'en';
let pollTimer = null;
let activeJobId = null;
let proxySuggestTimer = null;
let proxySuggestReqSeq = 0;
let proxySuggestItems = [];
let proxySuggestActiveIndex = -1;
let proxySuggestHideTimer = null;
let auditSuggestTimer = null;
let auditSuggestReqSeq = 0;
let auditSuggestItems = [];
let auditSuggestActiveIndex = -1;
let auditSuggestHideTimer = null;
let assetRightsSuggestTimer = null;
let assetRightsSuggestReqSeq = 0;
let assetRightsSuggestItems = [];
let assetRightsSuggestActiveIndex = -1;
let assetRightsSuggestHideTimer = null;
let assetRightsGroupSuggestEl = null;
let assetRightsGroupSuggestInput = null;
let assetRightsGroupSuggestItems = [];
let assetRightsGroupSuggestActiveIndex = -1;
let assetRightsGroupSuggestHideTimer = null;
let assetRightsGroupNamesCache = null;
let lastAssetRightsAssets = [];
let lastAssetRightsTypes = [];
let assetRightsMode = 'asset';
let assetRightsLockedOnly = false;
let assetRightsOwnerGroupFilter = '';
let assetRightsPage = 1;
let assetRightsPagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
let lastDocumentRightsAssets = [];
let documentRightsPage = 1;
let documentRightsLockedOnly = false;
let documentRightsPagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
let editingGroupAdminId = '';
let currentAdminProfile = null;

let i18n = {
  en: {
    admin_title: 'Admin Settings',
    admin_subtitle: 'Proxy generation and system health.',
    system_overview: 'System Overview',
    overview_active_assets: 'Active Assets',
    overview_system_health: 'System Health',
    overview_open_errors: 'Open Errors',
    overview_active_users: 'Active Users',
    overview_recent_window: 'Recent window',
    overview_total_assets: 'Total',
    overview_uptime: 'Services online',
    overview_failed_jobs: 'Failed jobs',
    back_to_mam: 'Back to MAM',
    system_health: 'System Health',
    runtime_diagnostics: 'Diagnostics',
    active_users: 'Active Users',
    error_logs: 'Error Logs',
    refresh: 'Refresh',
    diagnostics_none: 'No data.',
    diagnostics_load_failed: 'Failed to load diagnostics.',
    diag_last_seen: 'Last seen',
    diag_last_request: 'Last request',
    diag_ip: 'IP',
    diag_user_agent: 'User agent',
    diag_error_source: 'Source',
    diag_error_status: 'Status',
    audit_events: 'Audit Log',
    asset_rights: 'Asset Rights',
    document_rights: 'Document Rights',
    document_rights_saved: 'Document rights saved.',
    document_rights_load_failed: 'Failed to load document rights.',
    document_rights_save_failed: 'Failed to save document rights.',
    asset_rights_search: 'Asset Search',
    asset_rights_load: 'Load',
    asset_rights_none: 'No asset found.',
    asset_rights_saved: 'Asset rights saved.',
    asset_rights_load_failed: 'Failed to load asset rights.',
    asset_rights_save_failed: 'Failed to save asset rights.',
    asset_rights_locked_items: 'Locked',
    asset_lock_locked_by: 'Locked by',
    asset_lock_unlock: 'Unlock',
    asset_lock_unlock_confirm: 'Release this asset edit lock?',
    asset_lock_unlock_done: 'Asset edit lock released.',
    asset_lock_unlock_failed: 'Failed to release asset edit lock.',
    asset_lock_editing_by: '{name} is editing this asset.',
    asset_lock_editing_other: 'This asset is being edited by another user.',
    asset_rights_asset_col: 'Asset',
    asset_rights_mode_asset: 'Asset',
    asset_rights_mode_type: 'Type',
    asset_rights_type_filter: 'Type',
    asset_type_video: 'Video',
    asset_type_audio: 'Audio',
    asset_type_photo: 'Photo',
    asset_type_document: 'Doc',
    asset_type_other: 'Other',
    asset_rights_visibility_filter: 'Visibility',
    asset_rights_visibility_all: 'All',
    asset_visibility: 'Visibility',
    visibility_private: 'Hide',
    visibility_group: 'Owner groups',
    visibility_groups: 'Selected groups/users',
    visibility_public: 'Public',
    owner_groups: 'Owner groups',
    allowed_groups: 'Viewer groups',
    allowed_users: 'Viewer users',
    denied_groups: 'Denied groups',
    denied_users: 'Denied users',
    edit_allowed_groups: 'Editable groups',
    edit_allowed_users: 'Editable users',
    edit_denied_groups: 'Edit denied groups',
    edit_denied_users: 'Edit denied users',
    save_visibility: 'Save',
    identity_overview: 'Identity Overview',
    identity_keycloak_groups: 'Keycloak Groups',
    identity_keycloak_users: 'Keycloak Users',
    identity_mam_only_groups: 'MAM-only Groups',
    identity_source: 'Source',
    identity_no_groups: 'No groups found.',
    identity_no_users: 'No users found.',
    identity_no_mam_groups: 'No MAM-only groups.',
    identity_load_failed: 'Failed to load identity overview.',
    identity_user_count: 'Users',
    identity_group_count: 'Groups',
    identity_mam_group_count: 'MAM groups',
    settings: 'Settings',
    loading: 'Loading...',
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
    api_test_note: 'Header: X-API-Token or X-MAM-API-Token',
    api_help_doc_title: 'API Help Document',
    api_help_intro: 'Use this page to test MAM APIs quickly from Postman or cURL.',
    api_help_auth_title: 'Authentication Rules',
    api_help_auth_note: 'Use the same web address for API calls. Browser users authenticate with SSO; API clients use a token header.',
    api_help_bearer_on: 'OIDC Bearer JWT validation is ON.',
    api_help_bearer_off: 'OIDC Bearer JWT validation is OFF.',
    api_help_token_on: 'API token protection is currently ON.',
    api_help_token_off: 'API token protection is currently OFF.',
    api_help_token_hint: 'Use current token from Settings for direct API tests.',
    api_help_quick_title: 'Quick Commands',
    api_help_cmd_assets: 'List active assets',
    api_help_cmd_asset_by_id: 'Get one asset by ID',
    api_help_cmd_create_collection: 'Create a collection',
    api_help_postman_title: 'Postman Setup',
    api_help_postman_step1: 'Method: GET',
    api_help_postman_step2: 'URL: {{baseUrl}}/api/assets?q=istanbul',
    api_help_postman_step3: 'Headers: X-API-Token: <token> or X-MAM-API-Token: <token>.',
    api_help_postman_step4: 'A valid token returns JSON; missing or invalid tokens return 401 JSON.',
    api_help_endpoints_title: 'Main Endpoints',
    api_help_group_core: 'Core / Session',
    api_help_group_assets: 'Assets / Search / Versions',
    api_help_group_text: 'Subtitles / OCR',
    api_help_group_pdf: 'PDF Tools',
    api_help_group_office: 'Office Tools',
    api_help_group_admin: 'Admin / Diagnostics',
    api_help_group_records: 'Admin Records / Audit',
    settings_group_player: 'Player',
    settings_group_security: 'Security',
    settings_group_identity: 'Token & OIDC',
    settings_group_audit: 'Audit Log',
    audit_retention_days: 'Log retention (days)',
    media_job_retention_days: 'Recent media jobs retention (days)',
    settings_group_docs: 'Documentation',
    audit_filter_actor: 'User',
    audit_filter_action: 'Action',
    audit_filter_action_all: 'All',
    audit_filter_target: 'Asset',
    audit_filter_from: 'From',
    audit_filter_to: 'To',
    audit_filter_run: 'Filter',
    audit_export_excel: 'Export to Excel',
    audit_export_failed: 'Failed to export audit events.',
    audit_none: 'No audit event found.',
    audit_load_failed: 'Failed to load audit events.',
    audit_action_asset_uploaded: 'Asset uploaded',
    audit_action_asset_created: 'Asset created',
    audit_action_asset_updated: 'Asset updated',
    audit_action_asset_trashed: 'Moved to trash',
    audit_action_asset_restored: 'Restored',
    audit_action_asset_deleted: 'Permanently deleted',
    audit_action_asset_downloaded: 'Asset downloaded',
    audit_detail_client: 'Client',
    audit_detail_source: 'Source',
    audit_detail_transport: 'Transport',
    audit_detail_url: 'URL',
    audit_detail_range: 'Range',
    audit_detail_userAgent: 'User agent',
    audit_client_mobile: 'Mobile app',
    audit_client_web: 'Web',
    audit_client_api: 'API/direct',
    ocr_defaults: 'OCR Defaults',
    ocr_filters: 'OCR Filters',
    ocr_default_advanced_mode: 'Advanced OCR mode default',
    ocr_default_turkish_ai_correct: 'Turkish offline correction default',
    ocr_default_blur_filter: 'Blur filter default',
    ocr_default_region_mode: 'Ticker region mode default',
    ocr_default_static_overlay_filter: 'Static overlay filter default',
    new_asset_default_visibility: 'New asset default visibility',
    new_asset_visibility_owner_groups: 'Owner groups',
    settings_sub_general: 'General',
    settings_sub_proxy: 'Proxy',
    settings_sub_ocr: 'OCR',
    settings_sub_subtitle: 'Subtitle',
    settings_sub_backup: 'Backup',
    settings_sub_users: 'Users',
    auth_session_settings: 'Login Session Settings',
    auth_remember_me: 'Allow remember me',
    auth_sso_idle_minutes: 'Idle timeout (minutes)',
    auth_sso_max_hours: 'Maximum session (hours)',
    auth_client_idle_minutes: 'Client idle timeout (minutes)',
    auth_client_max_hours: 'Client maximum session (hours)',
    save_auth_session: 'Save Login Settings',
    auth_session_saved: 'Login session settings saved.',
    auth_session_save_failed: 'Failed to save login session settings.',
    backup_settings: 'Backup Settings',
    backup_schedule: 'Schedule',
    backup_enabled: 'Enable daily backup',
    backup_directory: 'Backup directory',
    backup_directory_ph: '/home/belge/depo/netapp/belgelik-restic/db-backups',
    backup_daily_hour: 'Daily hour',
    backup_retention_days: 'Retention (days)',
    backup_contents: 'Contents',
    backup_include_mam_db: 'MAM PostgreSQL dump',
    backup_include_keycloak_db: 'Keycloak PostgreSQL dump',
    backup_include_uploads: 'Uploads archive (.tar.gz)',
    backup_include_uploads_restic: 'Uploads incremental backup (restic)',
    backup_restic_repository: 'Restic repository',
    backup_restic_keep_daily: 'Restic daily snapshots',
    backup_restic_keep_weekly: 'Restic weekly snapshots',
    backup_restic_keep_monthly: 'Restic monthly snapshots',
    backup_run_now: 'Run Backup Now',
    backup_saved: 'Backup settings saved.',
    backup_started: 'Backup completed.',
    backup_load_failed: 'Failed to load backups.',
    backup_run_failed: 'Failed to run backup.',
    backup_delete: 'Delete',
    backup_delete_confirm: 'Delete this backup file?',
    backup_deleted: 'Backup file deleted.',
    backup_delete_failed: 'Failed to delete backup.',
    backup_no_files: 'No backup file found.',
    backup_file_name: 'File',
    backup_file_size: 'Size',
    backup_file_date: 'Date',
    permission_backup_title: 'Permission Export / Import',
    permission_backup_asset_rights: 'Asset rights',
    permission_backup_principal_rights: 'User and group rights',
    permission_backup_export_file_name_ph: 'Optional file name',
    permission_backup_export: 'Export',
    permission_backup_import: 'Import',
    permission_backup_select_file: 'Select a JSON file first.',
    permission_backup_import_confirm: 'Importing this file will overwrite the selected permission settings. Continue?',
    permission_backup_exported: 'Permission export downloaded.',
    permission_backup_imported: 'Permission import completed.',
    permission_backup_export_failed: 'Failed to export permissions.',
    permission_backup_import_failed: 'Failed to import permissions.',
    save_settings: 'Save Settings',
    set_as_default: 'Set as Default',
    settings_saved: 'Settings saved.',
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
    proxy_tool_action_image_thumbnail: 'Generate Image Thumbnail',
    proxy_tool_action_image_preview: 'Generate Image Preview',
    proxy_tool_action_document_thumbnail: 'Generate Document Thumbnail',
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
    health_recent_jobs_window: 'Last {days} days',
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
    principal_settings: 'User / Group Settings',
    principal_type_user: 'User',
    principal_type_group: 'Group',
    principal_search: 'Search',
    user_search: 'User Search',
    user_search_ph: 'Search user...',
    user_or_group_search_ph: 'Search user or group...',
    user_search_required: 'Type a user or group name and click User Search.',
    user_search_no_match: 'No matching user or group found.',
    user_permissions_empty: 'No user found.',
    perm_admin_access: 'Admin page access',
    perm_metadata_edit: 'Metadata edit',
    perm_office_edit: 'Office edit',
    perm_asset_delete: 'Asset delete',
    perm_pdf_advanced: 'PDF advanced tools',
    perm_text_admin: 'OCR / subtitle admin',
    perm_document_rights_admin: 'Document rights admin',
    user_permissions_saved: 'User permissions saved.',
    page_size: 'Page size',
    prev_page: 'Prev',
    next_page: 'Next',
    page_info: 'Page {page} / {pages} ({total})',
    group_admins: 'Group Admins',
    group_name: 'Group',
    managed_group: 'Managed group',
    username: 'User',
    manager_principal: 'Manager user/group',
    actions: 'Actions',
    admin_scope: 'Scope',
    admin_scope_asset_rights: 'Asset rights',
    admin_scope_document_rights: 'Document rights',
    admin_scope_text_admin: 'OCR / subtitle',
    asset_type_scope: 'Asset type',
    asset_type_scope_all: 'All',
    add_group_admin: 'Add',
    group_admin_none: 'No group admin defined.',
    group_admin_saved: 'Group admin saved.',
    group_admin_load_failed: 'Failed to load group admins.',
    group_admin_save_failed: 'Failed to save group admin.',
    group_admin_delete_failed: 'Failed to delete group admin.',
    group_admin_edit: 'Edit',
    group_admin_delete: 'Delete',
    group_admin_update: 'Update',
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
    subtitle_records_none: 'No subtitle records found.',
    subtitle_custom_overlay: 'Use custom overlay',
    subtitle_bottom_offset: 'Bottom offset (px)',
    subtitle_display_settings: 'Subtitle Display Settings',
    subtitle_display_style: 'Subtitle Style',
    subtitle_font_size: 'Font size (px)',
    subtitle_text_color: 'Text color',
    subtitle_background_color: 'Background color',
    subtitle_background_opacity: 'Background opacity',
    subtitle_horizontal_padding: 'Left/right padding (px)',
    subtitle_max_width: 'Max width (%)',
    subtitle_display_native_note: 'Custom overlay applies all style settings and enables match highlighting. Native browser subtitles only support limited font/color/background styling.',
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
    admin_subtitle: 'Proxy üretimi ve sistem sağlığı.',
    system_overview: 'Sistem Özeti',
    overview_active_assets: 'Aktif Varlıklar',
    overview_system_health: 'Sistem Sağlığı',
    overview_open_errors: 'Açık Hatalar',
    overview_active_users: 'Anlık Kullanıcılar',
    overview_recent_window: 'Son pencere',
    overview_total_assets: 'Toplam',
    overview_uptime: 'Servis ayakta',
    overview_failed_jobs: 'Başarısız iş',
    back_to_mam: "MAM'e Dön",
    system_health: 'Sistem Sağlığı',
    runtime_diagnostics: 'Tanı',
    active_users: 'Anlık Kullanıcılar',
    error_logs: 'Hata Logları',
    refresh: 'Yenile',
    diagnostics_none: 'Kayıt yok.',
    diagnostics_load_failed: 'Tanı bilgileri yüklenemedi.',
    diag_last_seen: 'Son görülme',
    diag_last_request: 'Son istek',
    diag_ip: 'IP',
    diag_user_agent: 'User agent',
    diag_error_source: 'Kaynak',
    diag_error_status: 'Durum',
    audit_events: 'İşlem Geçmişi',
    asset_rights: 'Varlık Yetkileri',
    document_rights: 'Doküman Yetkileri',
    document_rights_saved: 'Doküman yetkileri kaydedildi.',
    document_rights_load_failed: 'Doküman yetkileri yüklenemedi.',
    document_rights_save_failed: 'Doküman yetkileri kaydedilemedi.',
    asset_rights_search: 'Varlık Ara',
    asset_rights_load: 'Yükle',
    asset_rights_none: 'Varlık bulunamadı.',
    asset_rights_saved: 'Varlık yetkileri kaydedildi.',
    asset_rights_load_failed: 'Varlık yetkileri yüklenemedi.',
    asset_rights_save_failed: 'Varlık yetkileri kaydedilemedi.',
    asset_rights_locked_items: 'Kilitliler',
    asset_lock_locked_by: 'Kilitleyen',
    asset_lock_unlock: 'Kilidi Aç',
    asset_lock_unlock_confirm: 'Bu varlık düzenleme kilidi kaldırılsın mı?',
    asset_lock_unlock_done: 'Varlık düzenleme kilidi kaldırıldı.',
    asset_lock_unlock_failed: 'Varlık düzenleme kilidi kaldırılamadı.',
    asset_lock_editing_by: '{name} bu varlığı düzenliyor.',
    asset_lock_editing_other: 'Bu varlık başka bir kullanıcı tarafından düzenleniyor.',
    asset_rights_asset_col: 'Varlık',
    asset_rights_mode_asset: 'Varlık',
    asset_rights_mode_type: 'Tür',
    asset_rights_type_filter: 'Tür',
    asset_type_video: 'Video',
    asset_type_audio: 'Ses',
    asset_type_photo: 'Görsel',
    asset_type_document: 'Doc',
    asset_type_other: 'Diğer',
    asset_rights_visibility_filter: 'Görünürlük',
    asset_rights_visibility_all: 'Tümü',
    asset_visibility: 'Görünürlük',
    visibility_private: 'Gizle',
    visibility_group: 'Sahip gruplar',
    visibility_groups: 'Seçili grup/kullanıcı',
    visibility_public: 'Herkese açık',
    owner_groups: 'Sahip gruplar',
    allowed_groups: 'Görebilen gruplar',
    allowed_users: 'Görebilen kullanıcılar',
    denied_groups: 'Göremeyen gruplar',
    denied_users: 'Göremeyen kullanıcılar',
    edit_allowed_groups: 'Değiştirebilen gruplar',
    edit_allowed_users: 'Değiştirebilen kullanıcılar',
    edit_denied_groups: 'Değiştiremeyen gruplar',
    edit_denied_users: 'Değiştiremeyen kullanıcılar',
    save_visibility: 'Kaydet',
    identity_overview: 'Kimlik Özeti',
    identity_keycloak_groups: 'Keycloak Grupları',
    identity_keycloak_users: 'Keycloak Kullanıcıları',
    identity_mam_only_groups: 'Sadece MAM Grupları',
    identity_source: 'Kaynak',
    identity_no_groups: 'Grup bulunamadı.',
    identity_no_users: 'Kullanıcı bulunamadı.',
    identity_no_mam_groups: 'Sadece MAM tarafında grup yok.',
    identity_load_failed: 'Kimlik özeti yüklenemedi.',
    identity_user_count: 'Kullanıcı',
    identity_group_count: 'Grup',
    identity_mam_group_count: 'MAM grubu',
    settings: 'Ayarlar',
    loading: 'Yükleniyor...',
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
    api_test_note: 'Header: X-API-Token veya X-MAM-API-Token',
    api_help_doc_title: 'API Yardım Dokümanı',
    api_help_intro: 'MAM APIlerini Postman veya cURL ile hızlı test etmek için bu bölümü kullanın.',
    api_help_auth_title: 'Kimlik Doğrulama Kuralları',
    api_help_auth_note: 'API çağrıları için aynı web adresini kullanın. Tarayıcı kullanıcıları SSO ile, API istemcileri token header ile doğrulanır.',
    api_help_bearer_on: 'OIDC Bearer JWT doğrulaması AÇIK.',
    api_help_bearer_off: 'OIDC Bearer JWT doğrulaması KAPALI.',
    api_help_token_on: 'API token koruması şu anda AÇIK.',
    api_help_token_off: 'API token koruması şu anda KAPALI.',
    api_help_token_hint: 'Direkt API testlerinde Settings altındaki güncel tokeni kullanın.',
    api_help_quick_title: 'Hızlı Komutlar',
    api_help_cmd_assets: 'Aktif varlıkları listele',
    api_help_cmd_asset_by_id: 'ID ile tek varlık getir',
    api_help_cmd_create_collection: 'Koleksiyon oluştur',
    api_help_postman_title: 'Postman Kurulumu',
    api_help_postman_step1: 'Method: GET',
    api_help_postman_step2: 'URL: {{baseUrl}}/api/assets?q=istanbul',
    api_help_postman_step3: 'Headers: X-API-Token: <token> veya X-MAM-API-Token: <token>.',
    api_help_postman_step4: 'Geçerli token JSON döndürür; eksik veya hatalı token 401 JSON döndürür.',
    api_help_endpoints_title: 'Temel Endpointler',
    api_help_group_core: 'Temel / Oturum',
    api_help_group_assets: 'Varlıklar / Arama / Versiyonlar',
    api_help_group_text: 'Altyazı / OCR',
    api_help_group_pdf: 'PDF Araçları',
    api_help_group_office: 'Office Araçları',
    api_help_group_admin: 'Yönetim / Tanı',
    api_help_group_records: 'Yönetim Kayıtları / Audit',
    settings_group_player: 'Oynatıcı',
    settings_group_security: 'Güvenlik',
    settings_group_identity: 'Token ve OIDC',
    settings_group_audit: 'Audit Log',
    audit_retention_days: 'Log saklama süresi (gün)',
    media_job_retention_days: 'Son medya işleri saklama süresi (gün)',
    settings_group_docs: 'Dokümantasyon',
    audit_filter_actor: 'Kullanıcı',
    audit_filter_action: 'İşlem',
    audit_filter_action_all: 'Tümü',
    audit_filter_target: 'Varlık',
    audit_filter_from: 'Başlangıç',
    audit_filter_to: 'Bitiş',
    audit_filter_run: 'Filtrele',
    audit_export_excel: "Excel'e aktar",
    audit_export_failed: 'İşlem geçmişi dışa aktarılamadı.',
    audit_none: 'İşlem kaydı bulunamadı.',
    audit_load_failed: 'İşlem geçmişi yüklenemedi.',
    audit_action_asset_uploaded: 'Varlık yüklendi',
    audit_action_asset_created: 'Varlık oluşturuldu',
    audit_action_asset_updated: 'Varlık güncellendi',
    audit_action_asset_trashed: 'Çöpe taşındı',
    audit_action_asset_restored: 'Geri yüklendi',
    audit_action_asset_deleted: 'Kalıcı silindi',
    audit_action_asset_downloaded: 'Varlık indirildi',
    audit_detail_client: 'Kaynak',
    audit_detail_source: 'Kanal',
    audit_detail_transport: 'Aktarım',
    audit_detail_url: 'URL',
    audit_detail_range: 'Aralık',
    audit_detail_userAgent: 'User-Agent',
    audit_client_mobile: 'Cep uygulaması',
    audit_client_web: 'Web',
    audit_client_api: 'API/doğrudan',
    ocr_defaults: 'OCR Varsayılanları',
    ocr_filters: 'OCR Filtreleri',
    ocr_default_advanced_mode: 'Gelişmiş OCR varsayılan açık',
    ocr_default_turkish_ai_correct: 'Türkçe çevrimdışı düzeltme varsayılan açık',
    ocr_default_blur_filter: 'Bulanıklık filtresi varsayılan açık',
    ocr_default_region_mode: 'Ticker bölge modu varsayılan açık',
    ocr_default_static_overlay_filter: 'Sabit yazı filtresi varsayılan açık',
    new_asset_default_visibility: 'Yeni yüklenen varlık varsayılan görünürlüğü',
    new_asset_visibility_owner_groups: 'Sahip gruplar',
    settings_sub_general: 'Genel',
    settings_sub_proxy: 'Proxy',
    settings_sub_ocr: 'OCR',
    settings_sub_subtitle: 'Altyazı',
    settings_sub_backup: 'Yedekleme',
    settings_sub_users: 'Kullanıcılar',
    auth_session_settings: 'Giriş Oturumu Ayarları',
    auth_remember_me: 'Beni hatırla seçeneğine izin ver',
    auth_sso_idle_minutes: 'Keycloak boşta kalma süresi (dakika)',
    auth_sso_max_hours: 'Keycloak maksimum oturum süresi (saat)',
    auth_client_idle_minutes: 'Uygulama boşta kalma süresi (dakika)',
    auth_client_max_hours: 'Uygulama oturumu maksimum süresi (saat)',
    save_auth_session: 'Giriş Ayarlarını Kaydet',
    auth_session_saved: 'Giriş oturumu ayarları kaydedildi.',
    auth_session_save_failed: 'Giriş oturumu ayarları kaydedilemedi.',
    backup_settings: 'Yedekleme Ayarları',
    backup_schedule: 'Zamanlama',
    backup_enabled: 'Günlük yedeklemeyi aç',
    backup_directory: 'Yedekleme dizini',
    backup_directory_ph: '/home/belge/depo/netapp/belgelik-restic/db-backups',
    backup_daily_hour: 'Günlük saat',
    backup_retention_days: 'Saklama süresi (gün)',
    backup_contents: 'İçerik',
    backup_include_mam_db: 'MAM PostgreSQL dump',
    backup_include_keycloak_db: 'Keycloak PostgreSQL dump',
    backup_include_uploads: 'Uploads arşivi (.tar.gz)',
    backup_include_uploads_restic: 'Uploads artımlı yedek (restic)',
    backup_restic_repository: 'Restic deposu',
    backup_restic_keep_daily: 'Restic günlük snapshot',
    backup_restic_keep_weekly: 'Restic haftalık snapshot',
    backup_restic_keep_monthly: 'Restic aylık snapshot',
    backup_run_now: 'Şimdi Yedekle',
    backup_saved: 'Yedekleme ayarları kaydedildi.',
    backup_started: 'Yedekleme tamamlandı.',
    backup_load_failed: 'Yedekler yüklenemedi.',
    backup_run_failed: 'Yedekleme çalıştırılamadı.',
    backup_delete: 'Sil',
    backup_delete_confirm: 'Bu yedek dosyası silinsin mi?',
    backup_deleted: 'Yedek dosyası silindi.',
    backup_delete_failed: 'Yedek silinemedi.',
    backup_no_files: 'Yedek dosyası bulunamadı.',
    backup_file_name: 'Dosya',
    backup_file_size: 'Boyut',
    backup_file_date: 'Tarih',
    permission_backup_title: 'Yetki Dışa / İçe Aktarma',
    permission_backup_asset_rights: 'Varlık yetkileri',
    permission_backup_principal_rights: 'Kullanıcı ve grup yetkileri',
    permission_backup_export_file_name_ph: 'Opsiyonel dosya adı',
    permission_backup_export: 'Dışa Aktar',
    permission_backup_import: 'İçe Aktar',
    permission_backup_select_file: 'Önce bir JSON dosyası seçin.',
    permission_backup_import_confirm: 'Bu dosyayı içe aktarmak seçili yetki ayarlarının üzerine yazacak. Devam edilsin mi?',
    permission_backup_exported: 'Yetki yedeği indirildi.',
    permission_backup_imported: 'Yetki içe aktarma tamamlandı.',
    permission_backup_export_failed: 'Yetkiler dışa aktarılamadı.',
    permission_backup_import_failed: 'Yetkiler içe aktarılamadı.',
    save_settings: 'Ayarları Kaydet',
    set_as_default: 'Varsayılan Yap',
    settings_saved: 'Ayarlar kaydedildi.',
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
    proxy_tool_action_image_thumbnail: 'Görsel Thumbnail Üret',
    proxy_tool_action_image_preview: 'Görsel Önizleme Üret',
    proxy_tool_action_document_thumbnail: 'Doküman Thumbnail Üret',
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
    health_recent_jobs_window: 'Son {days} gün',
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
    principal_settings: 'Kullanıcı / Grup Ayarları',
    principal_type_user: 'Kullanıcı',
    principal_type_group: 'Grup',
    principal_search: 'Ara',
    user_search: 'Kullanıcı Ara',
    user_search_ph: 'Kullanıcı ara...',
    user_or_group_search_ph: 'Kullanıcı veya grup ara...',
    user_search_required: 'Kullanıcı veya grup adı yazıp Kullanıcı Ara düğmesine basın.',
    user_search_no_match: 'Eşleşen kullanıcı veya grup bulunamadı.',
    user_permissions_empty: 'Kullanıcı bulunamadı.',
    perm_admin_access: 'Yönetim sayfasına erişim',
    perm_metadata_edit: 'Metadata düzenleme',
    perm_office_edit: 'Office düzenleme',
    perm_asset_delete: 'Varlık silme',
    perm_pdf_advanced: 'PDF gelişmiş araçlar',
    perm_text_admin: 'OCR / altyazı yöneticisi',
    perm_document_rights_admin: 'Doküman yetkileri yöneticisi',
    user_permissions_saved: 'Kullanıcı yetkileri kaydedildi.',
    page_size: 'Sayfa boyutu',
    prev_page: 'Önceki',
    next_page: 'Sonraki',
    page_info: 'Sayfa {page} / {pages} ({total})',
    group_admins: 'Grup Yöneticileri',
    group_name: 'Grup',
    managed_group: 'Yönetilen grup',
    username: 'Kullanıcı',
    manager_principal: 'Yönetici kullanıcı/grup',
    actions: 'İşlemler',
    admin_scope: 'Kapsam',
    admin_scope_asset_rights: 'Varlık yetkileri',
    admin_scope_document_rights: 'Doküman yetkileri',
    admin_scope_text_admin: 'OCR / altyazı',
    asset_type_scope: 'Varlık türü',
    asset_type_scope_all: 'Tümü',
    add_group_admin: 'Ekle',
    group_admin_none: 'Grup yöneticisi tanımlı değil.',
    group_admin_saved: 'Grup yöneticisi kaydedildi.',
    group_admin_load_failed: 'Grup yöneticileri yüklenemedi.',
    group_admin_save_failed: 'Grup yöneticisi kaydedilemedi.',
    group_admin_delete_failed: 'Grup yöneticisi silinemedi.',
    group_admin_edit: 'Düzenle',
    group_admin_delete: 'Sil',
    group_admin_update: 'Güncelle',
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
    subtitle_records_none: 'Altyazı kaydı bulunamadı.',
    subtitle_custom_overlay: 'Custom overlay kullan',
    subtitle_bottom_offset: 'Alttan mesafe (px)',
    subtitle_display_settings: 'Altyazı Görünüm Ayarları',
    subtitle_display_style: 'Altyazı Stili',
    subtitle_font_size: 'Font boyutu (px)',
    subtitle_text_color: 'Yazı rengi',
    subtitle_background_color: 'Arka plan rengi',
    subtitle_background_opacity: 'Arka plan opaklığı',
    subtitle_horizontal_padding: 'Sağ/sol padding (px)',
    subtitle_max_width: 'Maksimum genişlik (%)',
    subtitle_display_native_note: 'Custom overlay tüm stil ayarlarını uygular ve eşleşme vurgusunu açar. Native tarayıcı altyazıları sadece sınırlı font/renk/arka plan stilini destekler.',
    subtitle_confirm_delete: 'Bu altyazı kaydı veritabanından silinsin mi?',
    combined_search: 'Birleşik Altyazı + OCR Arama',
    combined_search_query: 'Arama Metni',
    combined_search_query_ph: 'Arama metni girin...',
    combined_search_limit: 'Limit',
    combined_search_run: 'Aramayı Çalıştır',
    combined_search_none: 'Eşleşme bulunamadı.'
  }
};

function formatApiError(body = {}) {
  if (body?.code === 'asset_locked') {
    const lock = body.lock && typeof body.lock === 'object' ? body.lock : {};
    const name = String(lock.lockedByName || lock.lockedBy || '').trim();
    if (name) return t('asset_lock_editing_by').replace('{name}', name);
    return t('asset_lock_editing_other');
  }
  return String(body?.error || 'Request failed');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(formatApiError(body));
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

function tForLang(key, lang) {
  const normalized = lang === 'tr' ? 'tr' : 'en';
  return i18n[normalized]?.[key] || i18n.en[key] || key;
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
  syncAssetRightsTableLanguage();
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
    const hasImage = Boolean((mode === 'image' || mode === 'photo') && safeMediaUrl);
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
        ${hasImage ? `
        <div class="content-modal-video" role="group" aria-label="${escapeHtml(t('type_photo'))}">
          <img class="content-modal-video-el" alt="${escapeHtml(t('type_photo'))}" src="${escapeHtml(safeMediaUrl)}" />
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

function renderAssetTracking(data) {
  const totals = data.totals || {};
  if (overviewActiveAssets) overviewActiveAssets.textContent = String(totals.total_active || 0);
  if (overviewTotalAssets) overviewTotalAssets.textContent = `${t('overview_total_assets')}: ${totals.total_all || 0}`;
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
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = String(dt.getFullYear());
  const hour = String(dt.getHours()).padStart(2, '0');
  const minute = String(dt.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hour}:${minute}`;
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
  const mediaJobRetentionDays = Math.max(1, Number(data?.mediaJobRetentionDays) || 30);
  const serviceEntries = [
    ['health_service_app', services.app],
    ['health_service_postgres', services.postgres],
    ['health_service_elastic', services.elasticsearch],
    ['health_service_keycloak', services.keycloak],
    ['health_service_oauth2_proxy', services.oauth2Proxy]
  ];
  const serviceList = serviceEntries.map(([, entry]) => entry);
  const upServices = serviceList.filter((entry) => Boolean(entry?.ok)).length;
  const failedJobs = Number(jobs.proxyFailed || 0) + Number(jobs.subtitleFailed || 0) + Number(jobs.ocrFailed || 0);
  if (overviewSystemHealth) overviewSystemHealth.textContent = upServices === serviceList.length ? 'OK' : `${upServices}/${serviceList.length}`;
  if (overviewSystemHealthSub) overviewSystemHealthSub.textContent = `${upServices}/${serviceList.length} ${t('overview_uptime')}`;
  if (overviewOpenErrors) overviewOpenErrors.textContent = String(failedJobs);
  if (overviewOpenErrorsSub) overviewOpenErrorsSub.textContent = `${t('overview_failed_jobs')}: ${failedJobs}`;
  const serviceBadge = (entry) => {
    const ok = Boolean(entry?.ok);
    const status = Number(entry?.status || 0);
    const cls = ok ? 'health-ok' : 'health-bad';
    const label = ok ? t('health_up') : t('health_down');
    const suffix = status > 0 ? ` (${status})` : '';
    return `<span class="${cls}">${escapeHtml(label)}${escapeHtml(suffix)}</span>`;
  };
  const serviceCards = serviceEntries.map(([labelKey, entry]) => `
    <div class="health-service-card ${entry?.ok ? 'is-up' : 'is-down'}">
      <strong>${escapeHtml(t(labelKey))}</strong>
      ${serviceBadge(entry)}
    </div>
  `).join('');
  systemHealthRows.innerHTML = [
    `<div class="row"><strong>${escapeHtml(t('health_disk'))}</strong><span>${escapeHtml(t('health_uploads_size'))}: ${escapeHtml(humanBytes(disk.uploadsBytes))} | ${escapeHtml(t('health_uploads_files'))}: ${escapeHtml(String(disk.uploadsFiles || 0))} | ${escapeHtml(t('health_fs_free'))}: ${escapeHtml(humanBytes(disk.fsFreeBytes))} / ${escapeHtml(t('health_fs_total'))}: ${escapeHtml(humanBytes(disk.fsTotalBytes))}</span></div>`,
    `<div class="row health-services-row" data-health-section="services"><strong>${escapeHtml(t('health_services'))}</strong><div class="health-service-list">${serviceCards}</div></div>`,
    `<div class="row"><strong>${escapeHtml(t('health_jobs'))}</strong><span>${escapeHtml(t('health_proxy_running'))}: ${escapeHtml(String(jobs.proxyRunning || 0))} | ${escapeHtml(t('health_subtitle_running'))}: ${escapeHtml(String(jobs.subtitleRunning || 0))} | ${escapeHtml(t('health_ocr_running'))}: ${escapeHtml(String(jobs.ocrRunning || 0))} | ${escapeHtml(t('health_proxy_failed'))}: ${escapeHtml(String(jobs.proxyFailed || 0))} | ${escapeHtml(t('health_subtitle_failed'))}: ${escapeHtml(String(jobs.subtitleFailed || 0))} | ${escapeHtml(t('health_ocr_failed'))}: ${escapeHtml(String(jobs.ocrFailed || 0))}</span></div>`,
    `<div class="row"><strong>${escapeHtml(t('health_integrity'))}</strong><span>${escapeHtml(t('health_missing_proxy'))}: ${escapeHtml(String(integrity.missingProxy || 0))} | ${escapeHtml(t('health_missing_thumbnail'))}: ${escapeHtml(String(integrity.missingThumbnail || 0))} | ${escapeHtml(t('health_missing_subtitle'))}: ${escapeHtml(String(integrity.missingSubtitle || 0))} | ${escapeHtml(t('health_missing_ocr'))}: ${escapeHtml(String(integrity.missingOcr || 0))}</span></div>`
  ].join('');
  if (systemJobStatusEl) {
    const windowLabel = t('health_recent_jobs_window').replace('{days}', String(mediaJobRetentionDays));
    systemJobStatusEl.innerHTML = `
      <div class="system-job-status-head">
        <h3>${escapeHtml(t('health_recent_jobs'))}</h3>
        <span>${escapeHtml(windowLabel)}</span>
      </div>
      <div class="system-job-grid">
        ${renderSystemJobGroup('health_subtitle_jobs', recent.subtitle || {}, 'subtitle')}
        ${renderSystemJobGroup('health_ocr_jobs', recent.ocr || {}, 'ocr')}
      </div>
    `;
  }
}

function renderRuntimeDiagnostics(data = {}) {
  const users = Array.isArray(data.activeUsers) ? data.activeUsers : [];
  const errors = Array.isArray(data.errors) ? data.errors : [];
  if (overviewActiveUsers) overviewActiveUsers.textContent = String(users.length);
  if (overviewOpenErrors) overviewOpenErrors.textContent = String(errors.length);
  if (overviewOpenErrorsSub) overviewOpenErrorsSub.textContent = `${t('error_logs')}: ${errors.length}`;
  if (activeUsersRows) {
    activeUsersRows.innerHTML = users.length ? users.map((user) => {
      const actor = user.displayName || user.username || user.email || user.actor || 'unknown';
      const request = `${user.lastMethod || ''} ${user.lastPath || ''}`.trim() || '-';
      return `
        <div class="row runtime-row">
          <strong>${escapeHtml(actor)}</strong>
          <span>
            ${escapeHtml(t('diag_last_seen'))}: ${escapeHtml(formatAdminDateTime(user.lastSeenAt))}
            | ${escapeHtml(t('diag_last_request'))}: ${escapeHtml(request)}
            | ${escapeHtml(t('diag_ip'))}: ${escapeHtml(user.ip || '-')}
          </span>
          ${user.userAgent ? `<small>${escapeHtml(t('diag_user_agent'))}: ${escapeHtml(user.userAgent)}</small>` : ''}
        </div>
      `;
    }).join('') : `<div class="empty">${escapeHtml(t('diagnostics_none'))}</div>`;
  }
  if (runtimeErrorRows) {
    runtimeErrorRows.innerHTML = errors.length ? errors.map((item) => {
      const pathText = `${item.method || ''} ${item.path || ''}`.trim();
      return `
        <div class="row runtime-row runtime-error-row">
          <strong>${escapeHtml(formatAdminDateTime(item.createdAt))} · ${escapeHtml(item.actor || 'system')}</strong>
          <span>
            ${escapeHtml(t('diag_error_source'))}: ${escapeHtml(item.source || '-')}
            ${item.status ? ` | ${escapeHtml(t('diag_error_status'))}: ${escapeHtml(String(item.status))}` : ''}
            ${pathText ? ` | ${escapeHtml(pathText)}` : ''}
          </span>
          <small>${escapeHtml(item.message || '-')}</small>
          ${item.stack ? `<pre>${escapeHtml(item.stack)}</pre>` : ''}
        </div>
      `;
    }).join('') : `<div class="empty">${escapeHtml(t('diagnostics_none'))}</div>`;
  }
}

async function loadRuntimeDiagnostics() {
  if (runtimeDiagnosticsMsg) runtimeDiagnosticsMsg.textContent = '';
  try {
    const data = await api('/api/admin/runtime-diagnostics?limit=100');
    renderRuntimeDiagnostics(data);
  } catch (error) {
    if (runtimeDiagnosticsMsg) runtimeDiagnosticsMsg.textContent = error.message || t('diagnostics_load_failed');
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

async function openRuntimeDiagnosticsFocus(target) {
  hideProxySuggestions();
  hideAuditSuggestions();
  switchTab('runtimeDiagnostics');
  await loadRuntimeDiagnostics();
  const focusEl = target === 'active-users' ? activeUsersSectionTitle : runtimeErrorsSectionTitle;
  if (focusEl) {
    focusEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusEl.classList.add('admin-section-flash');
    setTimeout(() => focusEl.classList.remove('admin-section-flash'), 900);
  }
}

async function openSystemHealthFocus() {
  hideProxySuggestions();
  hideAuditSuggestions();
  switchTab('systemHealth');
  await refreshTrackingAndHealth();
  const focusEl = systemHealthRows?.querySelector('[data-health-section="services"]') || systemHealthRows;
  if (focusEl) {
    focusEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusEl.classList.add('admin-section-flash');
    setTimeout(() => focusEl.classList.remove('admin-section-flash'), 900);
  }
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
  if (tab === 'backup') {
    if (!currentAdminProfile?.canAccessAdmin && !currentAdminProfile?.isAdmin) {
      if (settingsMsg) settingsMsg.textContent = 'Admin permission is required';
      switchSettingsSubtab('ocr');
      return;
    }
    await loadBackups();
    return;
  }
  if (tab === 'users') {
    if (!currentAdminProfile?.isSuperAdmin) {
      if (settingsMsg) settingsMsg.textContent = 'Super admin permission is required';
      switchSettingsSubtab('general');
      return;
    }
    await loadUserPermissions();
    await loadIdentityOverview();
    await loadGroupAdmins();
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
  if (query.length < 3) {
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

function hideAuditSuggestions() {
  if (!auditTargetSuggestList) return;
  auditTargetSuggestList.classList.add('hidden');
  auditTargetSuggestList.innerHTML = '';
  auditSuggestItems = [];
  auditSuggestActiveIndex = -1;
}

function setAuditSuggestActive(index) {
  if (!auditTargetSuggestList) return;
  const buttons = Array.from(auditTargetSuggestList.querySelectorAll('.proxy-suggest-item'));
  if (!buttons.length) {
    auditSuggestActiveIndex = -1;
    return;
  }
  const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
  auditSuggestActiveIndex = safeIndex;
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === safeIndex);
  });
}

function applyAuditSuggestion(item) {
  if (!item || !auditTargetInput) return;
  const title = String(item.title || '').trim();
  const fileName = String(item.fileName || '').trim();
  auditTargetInput.value = title || fileName;
  hideAuditSuggestions();
  loadAuditEvents().catch((error) => {
    if (auditEventsMsg) auditEventsMsg.textContent = String(error.message || 'Request failed');
  });
}

function renderAuditSuggestions(items, query) {
  if (!auditTargetSuggestList) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    hideAuditSuggestions();
    return;
  }
  auditSuggestItems = list;
  auditSuggestActiveIndex = -1;
  auditTargetSuggestList.innerHTML = list.map((item, index) => {
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
  auditTargetSuggestList.classList.remove('hidden');
}

async function requestAuditSuggestions() {
  const query = String(auditTargetInput?.value || '').trim();
  if (query.length < 3) {
    hideAuditSuggestions();
    return;
  }
  const reqId = ++auditSuggestReqSeq;
  const params = new URLSearchParams({ q: query, limit: '8', includeTrash: '1' });
  try {
    const result = await api(`/api/admin/assets/suggest?${params.toString()}`);
    if (reqId !== auditSuggestReqSeq) return;
    renderAuditSuggestions(result, query);
  } catch (_error) {
    if (reqId !== auditSuggestReqSeq) return;
    hideAuditSuggestions();
  }
}

function queueAuditSuggestionRequest() {
  if (auditSuggestTimer) clearTimeout(auditSuggestTimer);
  auditSuggestTimer = setTimeout(() => {
    requestAuditSuggestions().catch(() => {});
  }, 180);
}

function hideAssetRightsSuggestions() {
  if (!assetRightsSuggestList) return;
  assetRightsSuggestList.classList.add('hidden');
  assetRightsSuggestList.innerHTML = '';
  assetRightsSuggestItems = [];
  assetRightsSuggestActiveIndex = -1;
}

function setAssetRightsSuggestActive(index) {
  if (!assetRightsSuggestList) return;
  const buttons = Array.from(assetRightsSuggestList.querySelectorAll('.proxy-suggest-item'));
  if (!buttons.length) {
    assetRightsSuggestActiveIndex = -1;
    return;
  }
  const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
  assetRightsSuggestActiveIndex = safeIndex;
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === safeIndex);
  });
}

function applyAssetRightsSuggestion(item) {
  if (!item || !assetRightsSearchInput) return;
  const title = String(item.title || '').trim();
  const fileName = String(item.fileName || '').trim();
  assetRightsSearchInput.value = title || fileName;
  hideAssetRightsSuggestions();
  assetRightsPage = 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
}

function renderAssetRightsSuggestions(items, query) {
  if (!assetRightsSuggestList) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    hideAssetRightsSuggestions();
    return;
  }
  assetRightsSuggestItems = list;
  assetRightsSuggestActiveIndex = -1;
  assetRightsSuggestList.innerHTML = list.map((item, index) => {
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
  assetRightsSuggestList.classList.remove('hidden');
}

async function requestAssetRightsSuggestions() {
  const query = String(assetRightsSearchInput?.value || '').trim();
  if (query.length < 3) {
    hideAssetRightsSuggestions();
    return;
  }
  const reqId = ++assetRightsSuggestReqSeq;
  const params = new URLSearchParams({ q: query, limit: '8' });
  try {
    const result = await api(`/api/admin/assets/suggest?${params.toString()}`);
    if (reqId !== assetRightsSuggestReqSeq) return;
    renderAssetRightsSuggestions(result, query);
  } catch (_error) {
    if (reqId !== assetRightsSuggestReqSeq) return;
    hideAssetRightsSuggestions();
  }
}

function queueAssetRightsSuggestionRequest() {
  if (assetRightsSuggestTimer) clearTimeout(assetRightsSuggestTimer);
  assetRightsSuggestTimer = setTimeout(() => {
    requestAssetRightsSuggestions().catch(() => {});
  }, 180);
}

function normalizeGroupSuggestionName(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

function addGroupSuggestionName(names, value) {
  const name = normalizeGroupSuggestionName(value);
  if (name) names.add(name);
}

function collectIdentityGroupNames(result = {}) {
  const names = new Set();
  (Array.isArray(result.groups) ? result.groups : []).forEach((group) => {
    addGroupSuggestionName(names, group.path || group.name);
  });
  (Array.isArray(result.mamGroups) ? result.mamGroups : []).forEach((group) => {
    addGroupSuggestionName(names, group);
  });
  (Array.isArray(result.mamOnlyGroups) ? result.mamOnlyGroups : []).forEach((group) => {
    addGroupSuggestionName(names, group);
  });
  (Array.isArray(result.groupAdmins) ? result.groupAdmins : []).forEach((item) => {
    addGroupSuggestionName(names, item.groupName || item.group);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function loadAssetRightsGroupNames() {
  if (Array.isArray(assetRightsGroupNamesCache)) return assetRightsGroupNamesCache;
  const result = await api('/api/admin/assets/access-groups');
  assetRightsGroupNamesCache = collectIdentityGroupNames(result);
  return assetRightsGroupNamesCache;
}

function ensureAssetRightsGroupSuggestEl() {
  if (assetRightsGroupSuggestEl) return assetRightsGroupSuggestEl;
  assetRightsGroupSuggestEl = document.createElement('div');
  assetRightsGroupSuggestEl.id = 'assetRightsGroupSuggestList';
  assetRightsGroupSuggestEl.className = 'proxy-suggest asset-rights-group-suggest hidden';
  document.body.appendChild(assetRightsGroupSuggestEl);
  assetRightsGroupSuggestEl.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  assetRightsGroupSuggestEl.addEventListener('click', (event) => {
    const button = event.target.closest('.proxy-suggest-item');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isFinite(index) || index < 0 || index >= assetRightsGroupSuggestItems.length) return;
    applyAssetRightsGroupSuggestion(assetRightsGroupSuggestItems[index]);
  });
  return assetRightsGroupSuggestEl;
}

function getAssetRightsGroupToken(input) {
  const value = String(input?.value || '');
  const cursor = typeof input?.selectionStart === 'number' ? input.selectionStart : value.length;
  const beforeCursor = value.slice(0, cursor);
  const tokenStart = beforeCursor.lastIndexOf(',') + 1;
  const raw = beforeCursor.slice(tokenStart);
  const leadingSpaces = raw.match(/^\s*/)?.[0]?.length || 0;
  return {
    value,
    cursor,
    tokenStart: tokenStart + leadingSpaces,
    tokenEnd: cursor,
    query: raw.trim()
  };
}

function positionAssetRightsGroupSuggestions(input) {
  const el = ensureAssetRightsGroupSuggestEl();
  const rect = input.getBoundingClientRect();
  const width = Math.max(220, Math.min(340, rect.width));
  const maxTop = Math.max(8, window.innerHeight - 260);
  el.style.width = `${width}px`;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
  el.style.top = `${Math.max(8, Math.min(maxTop, rect.bottom + 4))}px`;
}

function hideAssetRightsGroupSuggestions() {
  if (!assetRightsGroupSuggestEl) return;
  assetRightsGroupSuggestEl.classList.add('hidden');
  assetRightsGroupSuggestEl.innerHTML = '';
  assetRightsGroupSuggestInput = null;
  assetRightsGroupSuggestItems = [];
  assetRightsGroupSuggestActiveIndex = -1;
}

function setAssetRightsGroupSuggestActive(index) {
  const el = ensureAssetRightsGroupSuggestEl();
  const buttons = Array.from(el.querySelectorAll('.proxy-suggest-item'));
  if (!buttons.length) {
    assetRightsGroupSuggestActiveIndex = -1;
    return;
  }
  const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
  assetRightsGroupSuggestActiveIndex = safeIndex;
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === safeIndex);
  });
}

function renderAssetRightsGroupSuggestions(input, groups, query) {
  const el = ensureAssetRightsGroupSuggestEl();
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) {
    hideAssetRightsGroupSuggestions();
    return;
  }
  assetRightsGroupSuggestInput = input;
  assetRightsGroupSuggestItems = list;
  assetRightsGroupSuggestActiveIndex = -1;
  el.innerHTML = list.map((name, index) => `
    <button type="button" class="proxy-suggest-item" data-index="${index}">
      <strong>${highlightSuggestion(name, query)}</strong>
    </button>
  `).join('');
  positionAssetRightsGroupSuggestions(input);
  el.classList.remove('hidden');
}

async function requestAssetRightsGroupSuggestions(input) {
  if (!input || input.disabled || input.readOnly) {
    hideAssetRightsGroupSuggestions();
    return;
  }
  const token = getAssetRightsGroupToken(input);
  if (token.query.length < 3) {
    hideAssetRightsGroupSuggestions();
    return;
  }
  try {
    const groups = await loadAssetRightsGroupNames();
    const needle = token.query.toLocaleLowerCase('tr');
    const selected = new Set(String(input.value || '')
      .split(',')
      .map((item) => normalizeGroupSuggestionName(item).toLocaleLowerCase('tr'))
      .filter(Boolean));
    selected.delete(needle);
    const matches = groups
      .filter((name) => name.toLocaleLowerCase('tr').includes(needle))
      .filter((name) => !selected.has(name.toLocaleLowerCase('tr')))
      .slice(0, 8);
    renderAssetRightsGroupSuggestions(input, matches, token.query);
  } catch (_error) {
    hideAssetRightsGroupSuggestions();
  }
}

function applyAssetRightsGroupSuggestion(name) {
  const input = assetRightsGroupSuggestInput;
  if (!input) return;
  const value = String(input.value || '');
  const cursor = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
  const parts = value.split(',');
  let tokenIndex = value.slice(0, cursor).split(',').length - 1;
  tokenIndex = Math.max(0, Math.min(parts.length - 1, tokenIndex));
  parts[tokenIndex] = ` ${normalizeGroupSuggestionName(name)}`;
  input.value = parts.map((part, index) => index === 0 ? part.trim() : part.trim()).filter(Boolean).join(', ');
  const nextCursor = input.value.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  hideAssetRightsGroupSuggestions();
}

const adminRecordsModule = window.createAdminRecordsModule({
  api,
  t,
  escapeHtml,
  highlightSuggestion,
  openTextEditorModal,
  userPermissionsSearchInput,
  userPermissionsPrincipalType,
  userPermissionsSearchButton: document.getElementById('userPermissionsSearchButton'),
  userPermissionsRows,
  userPermissionsMsg,
  userPermissionsPageSize: document.getElementById('userPermissionsPageSize'),
  userPermissionsPrevPage: document.getElementById('userPermissionsPrevPage'),
  userPermissionsNextPage: document.getElementById('userPermissionsNextPage'),
  userPermissionsPageInfo: document.getElementById('userPermissionsPageInfo'),
  ocrAdminSearchInput,
  ocrDeleteFileCheck,
  ocrRecordsRows,
  ocrRecordsMsg,
  runOcrAdminSearchBtn,
  ocrRecordsPrevPage: document.getElementById('ocrRecordsPrevPage'),
  ocrRecordsNextPage: document.getElementById('ocrRecordsNextPage'),
  ocrRecordsPageInfo: document.getElementById('ocrRecordsPageInfo'),
  subtitleAdminSearchInput,
  subtitleDeleteFileCheck,
  subtitleRecordsRows,
  subtitleRecordsMsg,
  subtitleRecordsPrevPage: document.getElementById('subtitleRecordsPrevPage'),
  subtitleRecordsNextPage: document.getElementById('subtitleRecordsNextPage'),
  subtitleRecordsPageInfo: document.getElementById('subtitleRecordsPageInfo'),
  combinedSearchInput,
  combinedSearchLimit,
  runCombinedSearchBtn,
  combinedSearchRows,
  combinedSearchMsg
});

async function loadUserPermissions() {
  return adminRecordsModule.loadUserPermissions();
}

function renderGroupAdmins(rows = []) {
  if (!groupAdminsRows) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    groupAdminsRows.innerHTML = `<div class="empty">${escapeHtml(t('group_admin_none'))}</div>`;
    return;
  }
  const scopeLabels = {
    'asset-rights': t('admin_scope_asset_rights'),
    'document-rights': t('admin_scope_document_rights'),
    'text-admin': t('admin_scope_text_admin')
  };
  const typeLabels = {
    video: t('asset_type_video'),
    audio: t('asset_type_audio'),
    photo: t('asset_type_photo'),
    document: t('asset_type_document'),
    other: t('asset_type_other')
  };
  const header = `
    <div class="group-admins-table-head" aria-hidden="true">
      <strong>${escapeHtml(t('managed_group'))}</strong>
      <strong>${escapeHtml(t('manager_principal'))}</strong>
      <strong>${escapeHtml(t('admin_scope'))}</strong>
      <strong>${escapeHtml(t('asset_type_scope'))}</strong>
      <strong>${escapeHtml(t('health_job_updated'))}</strong>
      <strong>${escapeHtml(t('actions'))}</strong>
    </div>
  `;
  const rowsHtml = list.map((row) => `
    <div class="group-admins-row" data-group-admin-id="${escapeHtml(row.id || '')}">
      <strong>${escapeHtml(row.groupName || '')}</strong>
      <span>${escapeHtml(row.username || '')}</span>
      <span>${escapeHtml((Array.isArray(row.adminScopes) && row.adminScopes.length ? row.adminScopes : ['asset-rights']).map((scope) => scopeLabels[scope] || scope).join(', '))}</span>
      <span>${escapeHtml((Array.isArray(row.assetTypeGroups) && row.assetTypeGroups.length ? row.assetTypeGroups.map((type) => typeLabels[type] || type).join(', ') : t('asset_type_scope_all')))}</span>
      <span>${escapeHtml(formatAdminDateTime(row.createdAt))}</span>
      <span class="group-admins-actions">
        <button type="button" class="editGroupAdminBtn" data-id="${escapeHtml(row.id || '')}" data-group-name="${escapeHtml(row.groupName || '')}" data-username="${escapeHtml(row.username || '')}" data-scopes="${escapeHtml(JSON.stringify(Array.isArray(row.adminScopes) && row.adminScopes.length ? row.adminScopes : ['asset-rights']))}" data-types="${escapeHtml(JSON.stringify(Array.isArray(row.assetTypeGroups) ? row.assetTypeGroups : []))}">${escapeHtml(t('group_admin_edit'))}</button>
        <button type="button" class="danger deleteGroupAdminBtn" data-id="${escapeHtml(row.id || '')}">${escapeHtml(t('group_admin_delete'))}</button>
      </span>
    </div>
  `).join('');
  groupAdminsRows.innerHTML = `<div class="group-admins-table">${header}${rowsHtml}</div>`;
}

async function loadGroupAdmins() {
  if (!groupAdminsRows) return;
  try {
    const result = await api('/api/admin/group-admins');
    renderGroupAdmins(result.groupAdmins || []);
    if (groupAdminsMsg) groupAdminsMsg.textContent = '';
  } catch (error) {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('group_admin_load_failed'));
  }
}

function renderIdentityOverview(payload = {}) {
  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  const users = Array.isArray(payload.users) ? payload.users : [];
  const mamOnlyGroups = Array.isArray(payload.mamOnlyGroups) ? payload.mamOnlyGroups : [];
  const mamGroups = Array.isArray(payload.mamGroups) ? payload.mamGroups : [];
  assetRightsGroupNamesCache = collectIdentityGroupNames(payload);

  if (identityOverviewSummary) {
    identityOverviewSummary.innerHTML = [
      `<div class="metric"><strong>${escapeHtml(String(users.length))}</strong><span>${escapeHtml(t('identity_user_count'))}</span></div>`,
      `<div class="metric"><strong>${escapeHtml(String(groups.length))}</strong><span>${escapeHtml(t('identity_group_count'))}</span></div>`,
      `<div class="metric"><strong>${escapeHtml(String(mamGroups.length))}</strong><span>${escapeHtml(t('identity_mam_group_count'))}</span></div>`,
      `<div class="metric"><strong>${escapeHtml(String(payload.source || '-'))}</strong><span>${escapeHtml(t('identity_source'))}</span></div>`
    ].join('');
  }

  if (identityGroupsRows) {
    identityGroupsRows.innerHTML = groups.length
      ? groups.map((group) => `
        <div class="row compact-row">
          <strong>${escapeHtml(group.path || group.name || '-')}</strong>
          <span>${escapeHtml(group.realm || '-')}</span>
        </div>
      `).join('')
      : `<div class="empty">${escapeHtml(t('identity_no_groups'))}</div>`;
  }

  if (identityUsersRows) {
    identityUsersRows.innerHTML = users.length
      ? users.map((user) => {
        const label = [user.displayName, user.email].map((item) => String(item || '').trim()).filter(Boolean).join(' · ');
        const perms = Array.isArray(user.permissionKeys) && user.permissionKeys.length ? user.permissionKeys.join(', ') : '-';
        return `
          <div class="row compact-row">
            <strong>${escapeHtml(user.username || '-')}</strong>
            <span>${escapeHtml(label || user.realm || '-')}</span>
            <small>${escapeHtml(perms)}</small>
          </div>
        `;
      }).join('')
      : `<div class="empty">${escapeHtml(t(String(payload.userQuery || '').trim() ? 'identity_no_users' : 'user_search_required'))}</div>`;
  }

  if (identityMamGroupsRows) {
    identityMamGroupsRows.innerHTML = mamOnlyGroups.length
      ? mamOnlyGroups.map((group) => `<div class="row compact-row"><strong>${escapeHtml(group)}</strong><span>MAM DB</span></div>`).join('')
      : `<div class="empty">${escapeHtml(t('identity_no_mam_groups'))}</div>`;
  }

  if (identityGroupOptions) {
    identityGroupOptions.innerHTML = assetRightsGroupNamesCache
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join('');
  }

  if (identityUserOptions) {
    identityUserOptions.innerHTML = users
      .map((user) => String(user.username || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((username) => `<option value="${escapeHtml(username)}"></option>`)
      .join('');
  }
}

async function loadIdentityOverview() {
  if (!identityOverviewSummary && !identityGroupsRows && !identityUsersRows) return;
  try {
    const params = new URLSearchParams();
    const userQ = String(identityUserSearchInput?.value || '').trim();
    if (userQ.length >= 2) params.set('userQ', userQ);
    const query = params.toString();
    const result = await api(`/api/admin/identity/overview${query ? `?${query}` : ''}`);
    renderIdentityOverview(result);
    if (groupAdminsMsg) groupAdminsMsg.textContent = '';
  } catch (error) {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('identity_load_failed'));
  }
}

function searchIdentityUsers() {
  loadIdentityOverview().catch((error) => {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('identity_load_failed'));
  });
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

function applyAdminAccessMode(me = {}) {
  currentAdminProfile = me && typeof me === 'object' ? me : {};
  if (permissionBackupGroup) permissionBackupGroup.hidden = !currentAdminProfile?.isSuperAdmin;
  return accessScopeModule.applyAdminAccessMode({
    profile: currentAdminProfile,
    adminTabs,
    adminPanels,
    settingsSubTabs,
    settingsSubPanels,
    elements: {
      settingsForm,
      settingsMsg,
      ocrSettingsForm,
      ocrSettingsMsg,
      subtitleSettingsForm,
      subtitleSettingsMsg,
      authSessionSettingsForm,
      authSessionSettingsMsg
    },
    switchTab,
    switchSettingsSubtab
  });
}

function renderApiHelp() {
  if (!apiHelpBox) return;
  const token = String(apiTokenInput?.value || '').trim();
  const masked = token ? `${token.slice(0, 4)}...${token.slice(-4)}` : '-';
  apiHelpBox.textContent = [
    `${t('api_test_title')}:`,
    `GET http://localhost:3000/api/assets`,
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
  const apiBase = browserBase;
  const sampleAssetId = '<asset-id>';
  const tokenHeader = token || '<api-token>';
  const postmanUrlStep = t('api_help_postman_step2').replace('{{baseUrl}}', apiBase);

  const assetsCmd = `curl -s "${apiBase}/api/assets?q=istanbul" \\\n  -H "X-API-Token: ${tokenHeader}"`;
  const oneAssetCmd = `curl -s ${apiBase}/api/assets/${sampleAssetId} \\\n  -H "X-API-Token: ${tokenHeader}"`;
  const collectionCmd = `curl -s -X POST ${apiBase}/api/collections \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Token: ${tokenHeader}" \\\n  -d '{"name":"News Rundown","assetIds":["${sampleAssetId}"]}'`;
  const endpointGroups = [
    {
      title: t('api_help_group_core'),
      endpoints: [
        'GET    /api/me',
        'GET    /api/logout-url',
        'GET    /api/ui-settings',
        'GET    /api/collections',
        'POST   /api/collections'
      ]
    },
    {
      title: t('api_help_group_assets'),
      endpoints: [
        'GET    /api/assets',
        'GET    /api/assets/suggest',
        'GET    /api/assets/ocr-suggest',
        'GET    /api/assets/subtitle-suggest',
        'POST   /api/assets',
        'POST   /api/assets/upload',
        'GET    /api/assets/:id',
        'PATCH  /api/assets/:id',
        'GET    /api/assets/:id/technical',
        'GET    /api/assets/:id/preview-text',
        'POST   /api/assets/:id/trash',
        'POST   /api/assets/:id/restore',
        'DELETE /api/assets/:id',
        'POST   /api/assets/:id/cuts',
        'PATCH  /api/assets/:id/cuts/:cutId',
        'DELETE /api/assets/:id/cuts/:cutId',
        'POST   /api/assets/:id/versions',
        'PATCH  /api/assets/:id/versions/:versionId',
        'DELETE /api/assets/:id/versions/:versionId',
        'POST   /api/assets/:id/ensure-proxy',
        'POST   /api/assets/backfill-proxies'
      ]
    },
    {
      title: t('api_help_group_text'),
      endpoints: [
        'POST   /api/assets/:id/subtitles',
        'PATCH  /api/assets/:id/subtitles',
        'DELETE /api/assets/:id/subtitles',
        'POST   /api/assets/:id/subtitles/generate',
        'GET    /api/assets/:id/subtitles/search',
        'GET    /api/assets/:id/subtitles/suggest',
        'GET    /api/subtitle-jobs/:jobId',
        'POST   /api/assets/:id/video-ocr/extract',
        'GET    /api/assets/:id/video-ocr/latest',
        'GET    /api/assets/:id/video-ocr/search',
        'POST   /api/assets/:id/video-ocr/save',
        'GET    /api/video-ocr-jobs/:jobId',
        'GET    /api/video-ocr-jobs/:jobId/download'
      ]
    },
    {
      title: t('api_help_group_pdf'),
      endpoints: [
        'GET    /api/assets/:id/pdf-search',
        'GET    /api/assets/:id/pdf-search-ocr',
        'GET    /api/assets/:id/pdf-page-text',
        'GET    /api/assets/:id/pdf-meta',
        'GET    /api/assets/:id/pdf-page-image',
        'POST   /api/assets/:id/pdf/save',
        'POST   /api/assets/:id/pdf-restore',
        'POST   /api/assets/:id/pdf-restore-original',
        'GET    /api/assets/:id/pdf-original/download'
      ]
    },
    {
      title: t('api_help_group_office'),
      endpoints: [
        'GET    /api/assets/:id/office-config',
        'POST   /api/assets/:id/office-callback',
        'GET    /api/assets/:id/libreoffice-preview.pdf',
        'POST   /api/assets/:id/office-restore',
        'POST   /api/assets/:id/office-restore-original',
        'GET    /api/assets/:id/office-original/download'
      ]
    },
    {
      title: t('api_help_group_admin'),
      endpoints: [
        'GET    /api/admin/settings',
        'PATCH  /api/admin/settings',
        'POST   /api/admin/api-token/rotate',
        'GET    /api/admin/system-health',
        'GET    /api/admin/runtime-diagnostics',
        'GET    /api/admin/ffmpeg-health',
        'GET    /api/admin/backups',
        'POST   /api/admin/backups/run',
        'DELETE /api/admin/backups/:fileName',
        'POST   /api/admin/search/reindex',
        'POST   /api/admin/proxy-jobs',
        'GET    /api/admin/proxy-jobs',
        'GET    /api/admin/proxy-jobs/:id',
        'GET    /api/admin/assets/suggest',
        'POST   /api/admin/proxy-tools/run',
        'GET    /api/admin/user-permissions',
        'PATCH  /api/admin/user-permissions/:username'
      ]
    },
    {
      title: t('api_help_group_records'),
      endpoints: [
        'GET    /api/admin/audit-events',
        'GET    /api/admin/ocr-records',
        'PATCH  /api/admin/ocr-records',
        'DELETE /api/admin/ocr-records',
        'GET    /api/admin/ocr-records/content',
        'PATCH  /api/admin/ocr-records/content',
        'GET    /api/admin/subtitle-records',
        'PATCH  /api/admin/subtitle-records',
        'DELETE /api/admin/subtitle-records',
        'GET    /api/admin/subtitle-records/content',
        'PATCH  /api/admin/subtitle-records/content',
        'GET    /api/admin/text-search',
        'GET    /api/admin/turkish-corrections',
        'POST   /api/admin/turkish-corrections',
        'PUT    /api/admin/turkish-corrections',
        'DELETE /api/admin/turkish-corrections'
      ]
    }
  ];
  const endpointSections = endpointGroups.map((group) => (
    `<h4>${escapeHtml(group.title)}</h4><pre>${escapeHtml(group.endpoints.join('\n'))}</pre>`
  )).join('');

  apiGuideDoc.innerHTML = [
    `<p>${escapeHtml(t('api_help_intro'))}</p>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_auth_title'))}</h3><p>${escapeHtml(t('api_help_auth_note'))}</p><p>${escapeHtml(bearerEnabled ? t('api_help_bearer_on') : t('api_help_bearer_off'))}</p><p>${escapeHtml(tokenEnabled ? t('api_help_token_on') : t('api_help_token_off'))}</p><p>${escapeHtml(t('api_help_token_hint'))} (${escapeHtml(masked)})</p></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_quick_title'))}</h3><p><strong>${escapeHtml(t('api_help_cmd_assets'))}</strong></p><pre>${escapeHtml(assetsCmd)}</pre><p><strong>${escapeHtml(t('api_help_cmd_asset_by_id'))}</strong></p><pre>${escapeHtml(oneAssetCmd)}</pre><p><strong>${escapeHtml(t('api_help_cmd_create_collection'))}</strong></p><pre>${escapeHtml(collectionCmd)}</pre></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_postman_title'))}</h3><ul><li>${escapeHtml(t('api_help_postman_step1'))}</li><li>${escapeHtml(postmanUrlStep)}</li><li>${escapeHtml(t('api_help_postman_step3'))}</li><li>${escapeHtml(t('api_help_postman_step4'))}</li></ul></div>`,
    `<div class="api-guide-section"><h3>${escapeHtml(t('api_help_endpoints_title'))}</h3>${endpointSections}</div>`
  ].join('');
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function readSubtitleStyleForm() {
  return {
    customOverlayEnabled: Boolean(document.getElementById('subtitleCustomOverlayCheck')?.checked),
    bottomOffset: clampNumber(document.getElementById('subtitleBottomOffsetInput')?.value, 0, 240, 56),
    fontSize: clampNumber(document.getElementById('subtitleFontSizeInput')?.value, 12, 64, 24),
    textColor: String(document.getElementById('subtitleTextColorInput')?.value || '#ffffff'),
    backgroundColor: String(document.getElementById('subtitleBackgroundColorInput')?.value || '#000000'),
    backgroundOpacity: clampNumber(document.getElementById('subtitleBackgroundOpacityInput')?.value, 0, 1, 0.72),
    horizontalPadding: clampNumber(document.getElementById('subtitleHorizontalPaddingInput')?.value, 0, 80, 16),
    maxWidth: clampNumber(document.getElementById('subtitleMaxWidthInput')?.value, 35, 100, 82)
  };
}

function writeSubtitleStyleForm(style = {}) {
  const normalized = {
    customOverlayEnabled: Object.prototype.hasOwnProperty.call(style, 'customOverlayEnabled') ? Boolean(style.customOverlayEnabled) : true,
    bottomOffset: clampNumber(style.bottomOffset, 0, 240, 56),
    fontSize: clampNumber(style.fontSize, 12, 64, 24),
    textColor: /^#[0-9a-fA-F]{6}$/.test(String(style.textColor || '')) ? String(style.textColor) : '#ffffff',
    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(String(style.backgroundColor || '')) ? String(style.backgroundColor) : '#000000',
    backgroundOpacity: clampNumber(style.backgroundOpacity, 0, 1, 0.72),
    horizontalPadding: clampNumber(style.horizontalPadding, 0, 80, 16),
    maxWidth: clampNumber(style.maxWidth, 35, 100, 82)
  };
  const customOverlayEl = document.getElementById('subtitleCustomOverlayCheck');
  const bottomOffsetEl = document.getElementById('subtitleBottomOffsetInput');
  const fontSizeEl = document.getElementById('subtitleFontSizeInput');
  const textColorEl = document.getElementById('subtitleTextColorInput');
  const bgColorEl = document.getElementById('subtitleBackgroundColorInput');
  const bgOpacityEl = document.getElementById('subtitleBackgroundOpacityInput');
  const horizontalPaddingEl = document.getElementById('subtitleHorizontalPaddingInput');
  const maxWidthEl = document.getElementById('subtitleMaxWidthInput');
  if (customOverlayEl) customOverlayEl.checked = normalized.customOverlayEnabled;
  if (bottomOffsetEl) bottomOffsetEl.value = String(normalized.bottomOffset);
  if (fontSizeEl) fontSizeEl.value = String(normalized.fontSize);
  if (textColorEl) textColorEl.value = normalized.textColor;
  if (bgColorEl) bgColorEl.value = normalized.backgroundColor;
  if (bgOpacityEl) bgOpacityEl.value = String(normalized.backgroundOpacity);
  if (horizontalPaddingEl) horizontalPaddingEl.value = String(normalized.horizontalPadding);
  if (maxWidthEl) maxWidthEl.value = String(normalized.maxWidth);
  syncSubtitleColorLabels();
}

function syncSubtitleColorLabels() {
  const textColor = String(document.getElementById('subtitleTextColorInput')?.value || '#ffffff');
  const bgColor = String(document.getElementById('subtitleBackgroundColorInput')?.value || '#000000');
  const textValue = document.getElementById('subtitleTextColorValue');
  const bgValue = document.getElementById('subtitleBackgroundColorValue');
  if (textValue) textValue.textContent = textColor;
  if (bgValue) bgValue.textContent = bgColor;
}

function auditActionLabel(action) {
  const key = `audit_action_${String(action || '').replace(/\./g, '_')}`;
  return t(key) === key ? String(action || '') : t(key);
}

function auditDetailLabel(key) {
  const normalized = String(key || '');
  const labelKey = `audit_detail_${normalized}`;
  const label = t(labelKey);
  return label === labelKey ? normalized : label;
}

function auditDetailValue(key, value) {
  if (value == null || value === '') return '';
  if (String(key || '') === 'client') {
    const clientKey = `audit_client_${String(value || '').trim()}`;
    const clientLabel = t(clientKey);
    return clientLabel === clientKey ? String(value) : clientLabel;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseAccessList(value) {
  return String(value || '')
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const ASSET_RIGHTS_TABLE_LABELS = {
  en: {
    asset: 'Asset',
    type: 'Type',
    modeAsset: 'Asset',
    modeType: 'Type / upload',
    visibility: 'Visibility',
    ownerGroups: 'Owner groups',
    allowedGroups: 'Viewer groups',
    allowedUsers: 'Viewer users',
    deniedGroups: 'Denied groups',
    deniedUsers: 'Denied users',
    editAllowedGroups: 'Editable groups',
    editAllowedUsers: 'Editable users',
    editDeniedGroups: 'Edit denied groups',
    editDeniedUsers: 'Edit denied users',
    downloadAllowedGroups: 'Download groups',
    downloadAllowedUsers: 'Download users',
    downloadDeniedGroups: 'Download denied groups',
    downloadDeniedUsers: 'Download denied users',
    uploadAllowedGroups: 'Upload groups',
    uploadAllowedUsers: 'Upload users',
    uploadDeniedGroups: 'Upload denied groups',
    uploadDeniedUsers: 'Upload denied users',
    lockedItems: 'Locked',
    empty: 'No asset found.',
    save: 'Save',
    visibilityPrivate: 'Hide',
    visibilityGroup: 'Owner groups',
    visibilityGroups: 'Selected groups/users',
    visibilityPublic: 'Public'
  },
  tr: {
    asset: 'Varlık',
    type: 'Tür',
    modeAsset: 'Varlık',
    modeType: 'Tür / yükleme',
    visibility: 'Görünürlük',
    ownerGroups: 'Sahip gruplar',
    allowedGroups: 'Görebilen gruplar',
    allowedUsers: 'Görebilen kullanıcılar',
    deniedGroups: 'Göremeyen gruplar',
    deniedUsers: 'Göremeyen kullanıcılar',
    editAllowedGroups: 'Değiştirebilen gruplar',
    editAllowedUsers: 'Değiştirebilen kullanıcılar',
    editDeniedGroups: 'Değiştiremeyen gruplar',
    editDeniedUsers: 'Değiştiremeyen kullanıcılar',
    downloadAllowedGroups: 'İndirebilen gruplar',
    downloadAllowedUsers: 'İndirebilen kullanıcılar',
    downloadDeniedGroups: 'İndiremeyen gruplar',
    downloadDeniedUsers: 'İndiremeyen kullanıcılar',
    uploadAllowedGroups: 'Yükleyebilen gruplar',
    uploadAllowedUsers: 'Yükleyebilen kullanıcılar',
    uploadDeniedGroups: 'Yükleyemeyen gruplar',
    uploadDeniedUsers: 'Yükleyemeyen kullanıcılar',
    lockedItems: 'Kilitliler',
    empty: 'Varlık bulunamadı.',
    save: 'Kaydet',
    visibilityPrivate: 'Gizle',
    visibilityGroup: 'Sahip gruplar',
    visibilityGroups: 'Seçili grup/kullanıcı',
    visibilityPublic: 'Herkese açık'
  }
};

function getActiveAdminLanguage() {
  if (languageSelect?.value === 'tr') return 'tr';
  if (languageSelect?.value === 'en') return 'en';
  return currentLang === 'tr' ? 'tr' : 'en';
}

function getAssetRightsTableLabels() {
  return ASSET_RIGHTS_TABLE_LABELS[getActiveAdminLanguage()];
}

function getAssetRightsLabel(key) {
  return getAssetRightsTableLabels()[key] || key;
}

function getAssetTypeGroupLabel(typeGroup) {
  const key = String(typeGroup || '').trim().toLowerCase();
  const map = {
    video: t('asset_type_video'),
    audio: t('asset_type_audio'),
    photo: t('asset_type_photo'),
    document: t('asset_type_document'),
    other: t('asset_type_other')
  };
  return map[key] || key || '-';
}

function renderAssetRightsModeSelect(labels) {
  const mode = assetRightsMode === 'type' ? 'type' : 'asset';
  return `
    <label class="asset-rights-mode-switch">
      <span data-asset-rights-label="${mode === 'type' ? 'type' : 'asset'}">${escapeHtml(mode === 'type' ? labels.type : labels.asset)}</span>
      <select id="assetRightsModeSelect">
        <option value="asset" ${mode === 'asset' ? 'selected' : ''}>${escapeHtml(labels.modeAsset)}</option>
        <option value="type" ${mode === 'type' ? 'selected' : ''}>${escapeHtml(labels.modeType)}</option>
      </select>
    </label>
  `;
}

function updateAssetRightsTableLanguage() {
  if (!assetRightsRows) return;
  const labels = getAssetRightsTableLabels();
  assetRightsRows.querySelectorAll('[data-asset-rights-label]').forEach((el) => {
    const key = el.getAttribute('data-asset-rights-label') || '';
    const value = labels[key];
    if (value) el.textContent = value;
  });
  assetRightsRows.querySelectorAll('[data-asset-rights-cell-label]').forEach((el) => {
    const key = el.getAttribute('data-asset-rights-cell-label') || '';
    const value = labels[key];
    if (value) el.setAttribute('data-label', value);
  });
  assetRightsRows.querySelectorAll('select[name="visibility"] option').forEach((option) => {
    const map = {
      private: 'visibilityPrivate',
      group: 'visibilityGroup',
      groups: 'visibilityGroups',
      public: 'visibilityPublic'
    };
    const key = map[String(option.value || '')];
    if (key && labels[key]) option.textContent = labels[key];
  });
  assetRightsRows.querySelectorAll('#assetRightsModeSelect option').forEach((option) => {
    if (option.value === 'asset') option.textContent = labels.modeAsset;
    if (option.value === 'type') option.textContent = labels.modeType;
  });
  assetRightsRows.querySelectorAll('[data-asset-rights-type-label]').forEach((el) => {
    el.textContent = getAssetTypeGroupLabel(el.getAttribute('data-asset-rights-type-label'));
  });
  assetRightsRows.querySelectorAll('[data-asset-rights-locked-label]').forEach((el) => {
    el.textContent = labels.lockedItems;
  });
  const ownerGroupFilterInput = assetRightsRows.querySelector('#assetRightsOwnerGroupFilter');
  if (ownerGroupFilterInput) ownerGroupFilterInput.setAttribute('placeholder', labels.ownerGroups);
  const empty = assetRightsRows.querySelector('[data-asset-rights-empty="true"]');
  if (empty) empty.textContent = labels.empty;
}

function syncAssetRightsTableLanguage() {
  updateAssetRightsTableLanguage();
  requestAnimationFrame(() => updateAssetRightsTableLanguage());
  setTimeout(() => updateAssetRightsTableLanguage(), 0);
}

function syncAssetRightsHiddenRowState(row) {
  if (!row || row.dataset.accessMode !== 'asset') return;
  const isHidden = row.querySelector('select[name="visibility"]')?.value === 'private';
  row.classList.toggle('asset-rights-row--hidden', Boolean(isHidden));
  row.querySelectorAll('input[name]').forEach((input) => {
    input.readOnly = Boolean(isHidden);
    input.setAttribute('aria-readonly', isHidden ? 'true' : 'false');
  });
}

function syncAssetRightsHiddenRows() {
  if (!assetRightsRows) return;
  assetRightsRows.querySelectorAll('.asset-rights-row[data-access-mode="asset"]').forEach(syncAssetRightsHiddenRowState);
}

function renderAssetRightsHeader(labels) {
  const assetOnlyHeaders = assetRightsMode === 'asset'
    ? `
      <span data-asset-rights-label="visibility">${escapeHtml(labels.visibility)}</span>
      <label class="asset-rights-column-filter">
        <span data-asset-rights-label="ownerGroups">${escapeHtml(labels.ownerGroups)}</span>
        <input id="assetRightsOwnerGroupFilter" type="search" value="${escapeHtml(assetRightsOwnerGroupFilter)}" placeholder="${escapeHtml(labels.ownerGroups)}" autocomplete="off" />
      </label>
    `
    : '';
  return `
    <div class="asset-rights-table-head" aria-hidden="true">
      ${renderAssetRightsModeSelect(labels)}
      ${assetOnlyHeaders}
      <span data-asset-rights-label="allowedGroups">${escapeHtml(labels.allowedGroups)}</span>
      <span data-asset-rights-label="allowedUsers">${escapeHtml(labels.allowedUsers)}</span>
      <span data-asset-rights-label="deniedGroups">${escapeHtml(labels.deniedGroups)}</span>
      <span data-asset-rights-label="deniedUsers">${escapeHtml(labels.deniedUsers)}</span>
      <span data-asset-rights-label="editAllowedGroups">${escapeHtml(labels.editAllowedGroups)}</span>
      <span data-asset-rights-label="editAllowedUsers">${escapeHtml(labels.editAllowedUsers)}</span>
      <span data-asset-rights-label="editDeniedGroups">${escapeHtml(labels.editDeniedGroups)}</span>
      <span data-asset-rights-label="editDeniedUsers">${escapeHtml(labels.editDeniedUsers)}</span>
      <span data-asset-rights-label="downloadAllowedGroups">${escapeHtml(labels.downloadAllowedGroups)}</span>
      <span data-asset-rights-label="downloadAllowedUsers">${escapeHtml(labels.downloadAllowedUsers)}</span>
      <span data-asset-rights-label="downloadDeniedGroups">${escapeHtml(labels.downloadDeniedGroups)}</span>
      <span data-asset-rights-label="downloadDeniedUsers">${escapeHtml(labels.downloadDeniedUsers)}</span>
      ${assetRightsMode === 'type' ? `
        <span data-asset-rights-label="uploadAllowedGroups">${escapeHtml(labels.uploadAllowedGroups)}</span>
        <span data-asset-rights-label="uploadAllowedUsers">${escapeHtml(labels.uploadAllowedUsers)}</span>
        <span data-asset-rights-label="uploadDeniedGroups">${escapeHtml(labels.uploadDeniedGroups)}</span>
        <span data-asset-rights-label="uploadDeniedUsers">${escapeHtml(labels.uploadDeniedUsers)}</span>
      ` : ''}
      <label class="asset-rights-locked-filter">
        <input id="assetRightsLockedOnlyCheck" type="checkbox" ${assetRightsLockedOnly ? 'checked' : ''} ${assetRightsMode === 'type' ? 'disabled' : ''} />
        <span data-asset-rights-locked-label>${escapeHtml(labels.lockedItems)}</span>
      </label>
    </div>
  `;
}

function renderAssetRightsRows(assets = []) {
  if (!assetRightsRows) return;
  const labels = getAssetRightsTableLabels();
  const list = Array.isArray(assets) ? assets : [];

  const visibilityOptions = ['private', 'group', 'groups', 'public'];
  const visibilityLabels = {
    private: labels.visibilityPrivate,
    group: labels.visibilityGroup,
    groups: labels.visibilityGroups,
    public: labels.visibilityPublic
  };
  const header = renderAssetRightsHeader(labels);
  if (!list.length) {
    assetRightsRows.innerHTML = `<div class="asset-rights-table asset-rights-table--${escapeHtml(assetRightsMode === 'type' ? 'type' : 'asset')}">${header}<div class="empty asset-rights-empty-row" data-asset-rights-empty="true">${escapeHtml(labels.empty)}</div></div>`;
    syncAssetRightsTableLanguage();
    return;
  }

  const rows = list.map((asset) => {
    const isTypeMode = assetRightsMode === 'type';
    const selected = String(asset.visibility || 'public');
    const options = visibilityOptions
      .map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(visibilityLabels[item] || item)}</option>`)
      .join('');
    const ownerGroups = Array.isArray(asset.ownerGroups) ? asset.ownerGroups.join(', ') : '';
    const allowedGroups = Array.isArray(asset.allowedGroups) ? asset.allowedGroups.join(', ') : '';
    const allowedUsers = Array.isArray(asset.allowedUsers) ? asset.allowedUsers.join(', ') : '';
    const deniedGroups = Array.isArray(asset.deniedGroups) ? asset.deniedGroups.join(', ') : '';
    const deniedUsers = Array.isArray(asset.deniedUsers) ? asset.deniedUsers.join(', ') : '';
    const editAllowedGroups = Array.isArray(asset.editAllowedGroups) ? asset.editAllowedGroups.join(', ') : '';
    const editAllowedUsers = Array.isArray(asset.editAllowedUsers) ? asset.editAllowedUsers.join(', ') : '';
    const editDeniedGroups = Array.isArray(asset.editDeniedGroups) ? asset.editDeniedGroups.join(', ') : '';
    const editDeniedUsers = Array.isArray(asset.editDeniedUsers) ? asset.editDeniedUsers.join(', ') : '';
    const downloadAllowedGroups = Array.isArray(asset.downloadAllowedGroups) ? asset.downloadAllowedGroups.join(', ') : '';
    const downloadAllowedUsers = Array.isArray(asset.downloadAllowedUsers) ? asset.downloadAllowedUsers.join(', ') : '';
    const downloadDeniedGroups = Array.isArray(asset.downloadDeniedGroups) ? asset.downloadDeniedGroups.join(', ') : '';
    const downloadDeniedUsers = Array.isArray(asset.downloadDeniedUsers) ? asset.downloadDeniedUsers.join(', ') : '';
    const uploadAllowedGroups = Array.isArray(asset.uploadAllowedGroups) ? asset.uploadAllowedGroups.join(', ') : '';
    const uploadAllowedUsers = Array.isArray(asset.uploadAllowedUsers) ? asset.uploadAllowedUsers.join(', ') : '';
    const uploadDeniedGroups = Array.isArray(asset.uploadDeniedGroups) ? asset.uploadDeniedGroups.join(', ') : '';
    const uploadDeniedUsers = Array.isArray(asset.uploadDeniedUsers) ? asset.uploadDeniedUsers.join(', ') : '';
    const title = isTypeMode ? getAssetTypeGroupLabel(asset.typeGroup) : (asset.title || asset.id || '');
    const meta = isTypeMode ? labels.type : [asset.type || '-', asset.owner || '-'].filter(Boolean).join(' · ');
    const lock = !isTypeMode && asset.editLock && typeof asset.editLock === 'object' ? asset.editLock : null;
    const lockName = String(lock?.lockedByName || lock?.lockedBy || '').trim();
    const lockInfo = lock ? `
          <span class="asset-rights-lock">${escapeHtml(t('asset_lock_locked_by'))}: ${escapeHtml(lockName || '-')}</span>
        ` : '';
    const ownerGroupInput = `<input name="ownerGroups" value="${escapeHtml(ownerGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />`;

    return `
      <form class="asset-rights-row" data-access-mode="${escapeHtml(assetRightsMode)}" data-asset-id="${escapeHtml(asset.id || '')}" data-type-group="${escapeHtml(asset.typeGroup || '')}">
        <div class="asset-rights-asset" data-asset-rights-cell-label="${isTypeMode ? 'type' : 'asset'}" data-label="${escapeHtml(isTypeMode ? labels.type : labels.asset)}">
          <strong ${isTypeMode ? `data-asset-rights-type-label="${escapeHtml(asset.typeGroup || '')}"` : ''}>${escapeHtml(title)}</strong>
          <span>${escapeHtml(meta)}</span>
          ${lockInfo}
        </div>
        ${!isTypeMode ? `
          <label class="asset-rights-cell" data-asset-rights-cell-label="visibility" data-label="${escapeHtml(labels.visibility)}">
            <span data-asset-rights-label="visibility">${escapeHtml(labels.visibility)}</span>
            <select name="visibility">${options}</select>
          </label>
          <label class="asset-rights-cell" data-asset-rights-cell-label="ownerGroups" data-label="${escapeHtml(labels.ownerGroups)}">
            <span data-asset-rights-label="ownerGroups">${escapeHtml(labels.ownerGroups)}</span>
            ${ownerGroupInput}
          </label>
        ` : ''}
        <label class="asset-rights-cell" data-asset-rights-cell-label="allowedGroups" data-label="${escapeHtml(labels.allowedGroups)}">
          <span data-asset-rights-label="allowedGroups">${escapeHtml(labels.allowedGroups)}</span>
          <input name="allowedGroups" value="${escapeHtml(allowedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="allowedUsers" data-label="${escapeHtml(labels.allowedUsers)}">
          <span data-asset-rights-label="allowedUsers">${escapeHtml(labels.allowedUsers)}</span>
          <input name="allowedUsers" value="${escapeHtml(allowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="deniedGroups" data-label="${escapeHtml(labels.deniedGroups)}">
          <span data-asset-rights-label="deniedGroups">${escapeHtml(labels.deniedGroups)}</span>
          <input name="deniedGroups" value="${escapeHtml(deniedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="deniedUsers" data-label="${escapeHtml(labels.deniedUsers)}">
          <span data-asset-rights-label="deniedUsers">${escapeHtml(labels.deniedUsers)}</span>
          <input name="deniedUsers" value="${escapeHtml(deniedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="editAllowedGroups" data-label="${escapeHtml(labels.editAllowedGroups)}">
          <span data-asset-rights-label="editAllowedGroups">${escapeHtml(labels.editAllowedGroups)}</span>
          <input name="editAllowedGroups" value="${escapeHtml(editAllowedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="editAllowedUsers" data-label="${escapeHtml(labels.editAllowedUsers)}">
          <span data-asset-rights-label="editAllowedUsers">${escapeHtml(labels.editAllowedUsers)}</span>
          <input name="editAllowedUsers" value="${escapeHtml(editAllowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="editDeniedGroups" data-label="${escapeHtml(labels.editDeniedGroups)}">
          <span data-asset-rights-label="editDeniedGroups">${escapeHtml(labels.editDeniedGroups)}</span>
          <input name="editDeniedGroups" value="${escapeHtml(editDeniedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="editDeniedUsers" data-label="${escapeHtml(labels.editDeniedUsers)}">
          <span data-asset-rights-label="editDeniedUsers">${escapeHtml(labels.editDeniedUsers)}</span>
          <input name="editDeniedUsers" value="${escapeHtml(editDeniedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="downloadAllowedGroups" data-label="${escapeHtml(labels.downloadAllowedGroups)}">
          <span data-asset-rights-label="downloadAllowedGroups">${escapeHtml(labels.downloadAllowedGroups)}</span>
          <input name="downloadAllowedGroups" value="${escapeHtml(downloadAllowedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="downloadAllowedUsers" data-label="${escapeHtml(labels.downloadAllowedUsers)}">
          <span data-asset-rights-label="downloadAllowedUsers">${escapeHtml(labels.downloadAllowedUsers)}</span>
          <input name="downloadAllowedUsers" value="${escapeHtml(downloadAllowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="downloadDeniedGroups" data-label="${escapeHtml(labels.downloadDeniedGroups)}">
          <span data-asset-rights-label="downloadDeniedGroups">${escapeHtml(labels.downloadDeniedGroups)}</span>
          <input name="downloadDeniedGroups" value="${escapeHtml(downloadDeniedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
        </label>
        <label class="asset-rights-cell" data-asset-rights-cell-label="downloadDeniedUsers" data-label="${escapeHtml(labels.downloadDeniedUsers)}">
          <span data-asset-rights-label="downloadDeniedUsers">${escapeHtml(labels.downloadDeniedUsers)}</span>
          <input name="downloadDeniedUsers" value="${escapeHtml(downloadDeniedUsers)}" placeholder="user@example.com" />
        </label>
        ${isTypeMode ? `
          <label class="asset-rights-cell" data-asset-rights-cell-label="uploadAllowedGroups" data-label="${escapeHtml(labels.uploadAllowedGroups)}">
            <span data-asset-rights-label="uploadAllowedGroups">${escapeHtml(labels.uploadAllowedGroups)}</span>
            <input name="uploadAllowedGroups" value="${escapeHtml(uploadAllowedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
          </label>
          <label class="asset-rights-cell" data-asset-rights-cell-label="uploadAllowedUsers" data-label="${escapeHtml(labels.uploadAllowedUsers)}">
            <span data-asset-rights-label="uploadAllowedUsers">${escapeHtml(labels.uploadAllowedUsers)}</span>
            <input name="uploadAllowedUsers" value="${escapeHtml(uploadAllowedUsers)}" placeholder="user@example.com" />
          </label>
          <label class="asset-rights-cell" data-asset-rights-cell-label="uploadDeniedGroups" data-label="${escapeHtml(labels.uploadDeniedGroups)}">
            <span data-asset-rights-label="uploadDeniedGroups">${escapeHtml(labels.uploadDeniedGroups)}</span>
            <input name="uploadDeniedGroups" value="${escapeHtml(uploadDeniedGroups)}" placeholder="group-a, group-b" autocomplete="off" data-group-suggest="1" />
          </label>
          <label class="asset-rights-cell" data-asset-rights-cell-label="uploadDeniedUsers" data-label="${escapeHtml(labels.uploadDeniedUsers)}">
            <span data-asset-rights-label="uploadDeniedUsers">${escapeHtml(labels.uploadDeniedUsers)}</span>
            <input name="uploadDeniedUsers" value="${escapeHtml(uploadDeniedUsers)}" placeholder="user@example.com" />
          </label>
        ` : ''}
        <div class="asset-rights-actions">
          ${lock ? `<button type="button" class="asset-lock-unlock-btn" data-unlock-asset-id="${escapeHtml(asset.id || '')}">${escapeHtml(t('asset_lock_unlock'))}</button>` : ''}
          <button type="submit" data-asset-rights-label="save">${escapeHtml(labels.save)}</button>
        </div>
      </form>
    `;
  }).join('');

  assetRightsRows.innerHTML = `<div class="asset-rights-table asset-rights-table--${escapeHtml(assetRightsMode === 'type' ? 'type' : 'asset')}">${header}${rows}</div>`;
  syncAssetRightsHiddenRows();
  syncAssetRightsTableLanguage();
}

function renderAssetRightsPager() {
  const total = Number(assetRightsPagination.total || 0);
  const page = Math.max(1, Number(assetRightsPagination.page || 1));
  const totalPages = Math.max(1, Number(assetRightsPagination.totalPages || 1));
  if (assetRightsPageInfo) {
    assetRightsPageInfo.textContent = t('page_info')
      .replace('{page}', String(page))
      .replace('{pages}', String(totalPages))
      .replace('{total}', String(total));
  }
  if (assetRightsPrevPage) assetRightsPrevPage.disabled = page <= 1;
  if (assetRightsNextPage) assetRightsNextPage.disabled = page >= totalPages;
}

async function loadAssetRightsRows() {
  if (!assetRightsRows) return;
  if (assetRightsMode === 'type') {
    try {
      const result = await api('/api/admin/asset-types/access');
      lastAssetRightsTypes = Array.isArray(result.types) ? result.types : [];
      assetRightsPagination = result.pagination || { page: 1, limit: 5, total: lastAssetRightsTypes.length, totalPages: 1 };
      assetRightsPage = 1;
      renderAssetRightsRows(lastAssetRightsTypes);
      renderAssetRightsPager();
      if (assetRightsMsg) assetRightsMsg.textContent = '';
    } catch (error) {
      if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || t('asset_rights_load_failed'));
    }
    return;
  }
  const params = new URLSearchParams();
  const q = String(assetRightsSearchInput?.value || '').trim();
  if (q) params.set('q', q);
  assetRightsTypeFilters
    .filter((item) => item.checked)
    .forEach((item) => params.append('typeGroup', String(item.value || '').trim()));
  const visibility = String(assetRightsVisibilityFilter?.value || '').trim();
  if (visibility) params.set('visibility', visibility);
  if (assetRightsOwnerGroupFilter) params.set('ownerGroup', assetRightsOwnerGroupFilter);
  if (assetRightsLockedOnly) params.set('lockedOnly', '1');
  const limit = Number(assetRightsPageSize?.value || 20) === 50 ? 50 : 20;
  params.set('limit', String(limit));
  params.set('page', String(Math.max(1, assetRightsPage)));
  try {
    const result = await api(`/api/admin/assets/access?${params.toString()}`);
    lastAssetRightsAssets = Array.isArray(result.assets) ? result.assets : [];
    assetRightsPagination = result.pagination || { page: assetRightsPage, limit, total: lastAssetRightsAssets.length, totalPages: 1 };
    assetRightsPage = Number(assetRightsPagination.page || assetRightsPage);
    renderAssetRightsRows(lastAssetRightsAssets);
    renderAssetRightsPager();
    if (assetRightsMsg) assetRightsMsg.textContent = '';
  } catch (error) {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || t('asset_rights_load_failed'));
  }
}

function renderDocumentRightsRows(assets = []) {
  if (!documentRightsRows) return;
  const labels = getAssetRightsTableLabels();
  const list = Array.isArray(assets) ? assets : [];
  const header = `
    <div class="asset-rights-table-head" aria-hidden="true">
      <span>${escapeHtml(labels.asset)}</span>
      <span>${escapeHtml(labels.allowedUsers)}</span>
      <span>${escapeHtml(labels.deniedUsers)}</span>
      <span>${escapeHtml(labels.editAllowedUsers)}</span>
      <span>${escapeHtml(labels.editDeniedUsers)}</span>
      <span>${escapeHtml(labels.downloadAllowedUsers)}</span>
      <span>${escapeHtml(labels.downloadDeniedUsers)}</span>
      <span>${escapeHtml(labels.save)}</span>
    </div>
  `;
  if (!list.length) {
    documentRightsRows.innerHTML = `<div class="asset-rights-table document-rights-table">${header}<div class="empty asset-rights-empty-row">${escapeHtml(labels.empty)}</div></div>`;
    return;
  }
  const rows = list.map((asset) => {
    const lock = asset.editLock && typeof asset.editLock === 'object' ? asset.editLock : null;
    const lockName = String(lock?.lockedByName || lock?.lockedBy || '').trim();
    const lockInfo = lock ? `<span class="asset-rights-lock">${escapeHtml(t('asset_lock_locked_by'))}: ${escapeHtml(lockName || '-')}</span>` : '';
    const fields = {
      allowedUsers: Array.isArray(asset.allowedUsers) ? asset.allowedUsers.join(', ') : '',
      deniedUsers: Array.isArray(asset.deniedUsers) ? asset.deniedUsers.join(', ') : '',
      editAllowedUsers: Array.isArray(asset.editAllowedUsers) ? asset.editAllowedUsers.join(', ') : '',
      editDeniedUsers: Array.isArray(asset.editDeniedUsers) ? asset.editDeniedUsers.join(', ') : '',
      downloadAllowedUsers: Array.isArray(asset.downloadAllowedUsers) ? asset.downloadAllowedUsers.join(', ') : '',
      downloadDeniedUsers: Array.isArray(asset.downloadDeniedUsers) ? asset.downloadDeniedUsers.join(', ') : ''
    };
    return `
      <form class="asset-rights-row document-rights-row" data-asset-id="${escapeHtml(asset.id || '')}">
        <div class="asset-rights-asset" data-label="${escapeHtml(labels.asset)}">
          <strong>${escapeHtml(asset.title || asset.id || '')}</strong>
          <span>${escapeHtml(asset.fileName || asset.owner || '')}</span>
          ${lockInfo}
        </div>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.allowedUsers)}">
          <span>${escapeHtml(labels.allowedUsers)}</span>
          <input name="allowedUsers" value="${escapeHtml(fields.allowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.deniedUsers)}">
          <span>${escapeHtml(labels.deniedUsers)}</span>
          <input name="deniedUsers" value="${escapeHtml(fields.deniedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.editAllowedUsers)}">
          <span>${escapeHtml(labels.editAllowedUsers)}</span>
          <input name="editAllowedUsers" value="${escapeHtml(fields.editAllowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.editDeniedUsers)}">
          <span>${escapeHtml(labels.editDeniedUsers)}</span>
          <input name="editDeniedUsers" value="${escapeHtml(fields.editDeniedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.downloadAllowedUsers)}">
          <span>${escapeHtml(labels.downloadAllowedUsers)}</span>
          <input name="downloadAllowedUsers" value="${escapeHtml(fields.downloadAllowedUsers)}" placeholder="user@example.com" />
        </label>
        <label class="asset-rights-cell" data-label="${escapeHtml(labels.downloadDeniedUsers)}">
          <span>${escapeHtml(labels.downloadDeniedUsers)}</span>
          <input name="downloadDeniedUsers" value="${escapeHtml(fields.downloadDeniedUsers)}" placeholder="user@example.com" />
        </label>
        <div class="asset-rights-actions">
          ${lock ? `<button type="button" class="asset-lock-unlock-btn" data-document-unlock-asset-id="${escapeHtml(asset.id || '')}">${escapeHtml(t('asset_lock_unlock'))}</button>` : ''}
          <button type="submit">${escapeHtml(labels.save)}</button>
        </div>
      </form>
    `;
  }).join('');
  documentRightsRows.innerHTML = `<div class="asset-rights-table document-rights-table">${header}${rows}</div>`;
}

function renderDocumentRightsPager() {
  const total = Number(documentRightsPagination.total || 0);
  const page = Math.max(1, Number(documentRightsPagination.page || 1));
  const totalPages = Math.max(1, Number(documentRightsPagination.totalPages || 1));
  if (documentRightsPageInfo) {
    documentRightsPageInfo.textContent = t('page_info')
      .replace('{page}', String(page))
      .replace('{pages}', String(totalPages))
      .replace('{total}', String(total));
  }
  if (documentRightsPrevPage) documentRightsPrevPage.disabled = page <= 1;
  if (documentRightsNextPage) documentRightsNextPage.disabled = page >= totalPages;
}

async function loadDocumentRightsRows() {
  if (!documentRightsRows) return;
  const params = new URLSearchParams();
  const q = String(documentRightsSearchInput?.value || '').trim();
  if (q) params.set('q', q);
  if (documentRightsLockedOnly) params.set('lockedOnly', '1');
  const limitValue = Number(documentRightsPageSize?.value || 20);
  const limit = [20, 50, 100].includes(limitValue) ? limitValue : 20;
  params.set('limit', String(limit));
  params.set('page', String(Math.max(1, documentRightsPage)));
  try {
    const result = await api(`/api/admin/document-rights/assets?${params.toString()}`);
    lastDocumentRightsAssets = Array.isArray(result.assets) ? result.assets : [];
    documentRightsPagination = result.pagination || { page: documentRightsPage, limit, total: lastDocumentRightsAssets.length, totalPages: 1 };
    documentRightsPage = Number(documentRightsPagination.page || documentRightsPage);
    renderDocumentRightsRows(lastDocumentRightsAssets);
    renderDocumentRightsPager();
    if (documentRightsMsg) documentRightsMsg.textContent = '';
  } catch (error) {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || t('document_rights_load_failed'));
  }
}

function renderAuditEvents(events = []) {
  if (!auditEventsRows) return;
  if (!events.length) {
    auditEventsRows.innerHTML = `<div class="empty">${escapeHtml(t('audit_none'))}</div>`;
    return;
  }
  auditEventsRows.innerHTML = events.map((event) => {
    const created = formatAdminDateTime(event.createdAt);
    const title = event.targetTitle || event.targetId || event.targetType || '-';
    const detailEntries = event.details && typeof event.details === 'object'
      ? Object.entries(event.details)
      : [];
    const clientMedium = String(event.clientMedium || event.details?.client || '').trim();
    const details = [
      ...(clientMedium ? [['client', clientMedium]] : []),
      ...detailEntries.filter(([key]) => key !== 'client')
    ]
      .slice(0, 4)
      .map(([key, value]) => `${auditDetailLabel(key)}: ${auditDetailValue(key, value)}`)
      .filter(Boolean)
      .join(' · ');
    return `
      <div class="row audit-event-row">
        <strong>${escapeHtml(created)} · ${escapeHtml(event.actor || 'unknown')}</strong>
        <span>${escapeHtml(auditActionLabel(event.action))} · ${escapeHtml(title)}</span>
        ${details ? `<small>${escapeHtml(details)}</small>` : ''}
      </div>
    `;
  }).join('');
}

function buildAuditEventParams(limit = '100') {
  const params = new URLSearchParams({ limit: String(limit) });
  const actor = String(auditActorInput?.value || '').trim();
  const action = String(auditActionSelect?.value || '').trim();
  const target = String(auditTargetInput?.value || '').trim();
  const from = String(auditFromInput?.value || '').trim();
  const to = String(auditToInput?.value || '').trim();
  if (actor) params.set('actor', actor);
  if (action) params.set('action', action);
  if (target) params.set('target', target);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params;
}

async function loadAuditEvents() {
  if (!auditEventsRows) return;
  if (auditEventsMsg) auditEventsMsg.textContent = '';
  const params = buildAuditEventParams('100');
  try {
    const data = await api(`/api/admin/audit-events?${params.toString()}`);
    renderAuditEvents(Array.isArray(data.events) ? data.events : []);
  } catch (error) {
    if (auditEventsMsg) auditEventsMsg.textContent = error.message || t('audit_load_failed');
  }
}

async function exportAuditEvents() {
  if (auditEventsMsg) auditEventsMsg.textContent = '';
  if (exportAuditEventsBtn) exportAuditEventsBtn.disabled = true;
  const params = buildAuditEventParams('5000');
  try {
    const response = await fetch(`/api/admin/audit-events/export?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || t('audit_export_failed'));
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `audit-events-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (auditEventsMsg) auditEventsMsg.textContent = error.message || t('audit_export_failed');
  } finally {
    if (exportAuditEventsBtn) exportAuditEventsBtn.disabled = false;
  }
}

async function loadSettings() {
  const settings = await api('/api/admin/settings');
  settingsForm.elements.autoProxyBackfillOnUpload.checked = Boolean(settings.autoProxyBackfillOnUpload);
  if (settingsForm.elements.newAssetDefaultVisibility) {
    const defaultVisibility = String(settings.newAssetDefaultVisibility || 'owner_groups').toLowerCase();
    settingsForm.elements.newAssetDefaultVisibility.value = ['owner_groups', 'public', 'private'].includes(defaultVisibility)
      ? defaultVisibility
      : 'owner_groups';
  }
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
  if (settingsForm.elements.auditRetentionDays) {
    settingsForm.elements.auditRetentionDays.value = String(settings.auditRetentionDays || 180);
  }
  if (settingsForm.elements.mediaJobRetentionDays) {
    settingsForm.elements.mediaJobRetentionDays.value = String(settings.mediaJobRetentionDays || 30);
  }
  writeAuthSessionSettingsForm(settings.authSession || {});
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
  writeSubtitleStyleForm(settings.subtitleStyle || {});
  writeBackupSettingsForm(settings.backup || {});
  renderApiHelp();
  renderApiGuide();
}

function readAuthSessionSettingsForm() {
  const elements = authSessionSettingsForm?.elements;
  return {
    rememberMe: Boolean(elements?.rememberMe?.checked),
    ssoIdleMinutes: Number(elements?.ssoIdleMinutes?.value) || 30,
    ssoMaxHours: Number(elements?.ssoMaxHours?.value) || 8,
    clientIdleMinutes: Number(elements?.clientIdleMinutes?.value) || 30,
    clientMaxHours: Number(elements?.clientMaxHours?.value) || 8
  };
}

function writeAuthSessionSettingsForm(authSession = {}) {
  const elements = authSessionSettingsForm?.elements;
  if (!elements) return;
  elements.rememberMe.checked = Boolean(authSession.rememberMe);
  elements.ssoIdleMinutes.value = String(Number(authSession.ssoIdleMinutes) || 30);
  elements.ssoMaxHours.value = String(Number(authSession.ssoMaxHours) || 8);
  elements.clientIdleMinutes.value = String(Number(authSession.clientIdleMinutes) || 30);
  elements.clientMaxHours.value = String(Number(authSession.clientMaxHours) || 8);
}

function formatAdminFileSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function getAttachmentFileName(response, fallback) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const raw = utfMatch?.[1] || plainMatch?.[1] || fallback;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportPermissionBackup(kind, nameInput, fallbackName) {
  const params = new URLSearchParams();
  const requestedName = String(nameInput?.value || '').trim();
  if (requestedName) params.set('fileName', requestedName);
  const query = params.toString();
  const response = await fetch(`/api/admin/permission-exports/${encodeURIComponent(kind)}${query ? `?${query}` : ''}`, {
    cache: 'no-store'
  });
  if (!response.ok) {
    let message = t('permission_backup_export_failed');
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  triggerDownload(blob, getAttachmentFileName(response, fallbackName));
}

async function readPermissionImportFile(fileInput) {
  const file = fileInput?.files?.[0];
  if (!file) throw new Error(t('permission_backup_select_file'));
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(t('permission_backup_import_failed'));
  }
}

async function importPermissionBackup(kind, fileInput) {
  const payload = await readPermissionImportFile(fileInput);
  return api(`/api/admin/permission-imports/${encodeURIComponent(kind)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

function readBackupSettingsForm() {
  const elements = backupSettingsForm?.elements;
  return {
    enabled: Boolean(elements?.backupEnabled?.checked),
    directory: String(elements?.backupDirectory?.value || '').trim(),
    dailyHour: Number(elements?.backupDailyHour?.value) || 0,
    includeMamDb: Boolean(elements?.backupIncludeMamDb?.checked),
    includeKeycloakDb: Boolean(elements?.backupIncludeKeycloakDb?.checked),
    includeUploadsArchive: Boolean(elements?.backupIncludeUploadsArchive?.checked),
    includeUploadsRestic: Boolean(elements?.backupIncludeUploadsRestic?.checked),
    resticRepository: String(elements?.backupResticRepository?.value || '').trim(),
    resticKeepDaily: Number(elements?.backupResticKeepDaily?.value) || 14,
    resticKeepWeekly: Number(elements?.backupResticKeepWeekly?.value) || 8,
    resticKeepMonthly: Number(elements?.backupResticKeepMonthly?.value) || 12,
    retentionDays: Number(elements?.backupRetentionDays?.value) || 14
  };
}

function writeBackupSettingsForm(backup = {}) {
  const elements = backupSettingsForm?.elements;
  if (!elements) return;
  elements.backupEnabled.checked = Boolean(backup.enabled);
  elements.backupDirectory.value = String(backup.directory || '/home/belge/depo/netapp/belgelik-restic/db-backups');
  elements.backupDailyHour.value = String(Number.isFinite(Number(backup.dailyHour)) ? Number(backup.dailyHour) : 2);
  elements.backupIncludeMamDb.checked = backup.includeMamDb !== false;
  elements.backupIncludeKeycloakDb.checked = Boolean(backup.includeKeycloakDb);
  elements.backupIncludeUploadsArchive.checked = Boolean(backup.includeUploadsArchive);
  elements.backupIncludeUploadsRestic.checked = Boolean(backup.includeUploadsRestic);
  elements.backupResticRepository.value = String(backup.resticRepository || '/home/belge/depo/netapp/belgelik-restic/restic-repo');
  elements.backupResticKeepDaily.value = String(Number(backup.resticKeepDaily) || 14);
  elements.backupResticKeepWeekly.value = String(Number(backup.resticKeepWeekly) || 8);
  elements.backupResticKeepMonthly.value = String(Number(backup.resticKeepMonthly) || 12);
  elements.backupRetentionDays.value = String(Number(backup.retentionDays) || 14);
}

function renderBackupFiles(files = []) {
  if (!backupFilesRows) return;
  if (!files.length) {
    backupFilesRows.innerHTML = `<div class="empty">${escapeHtml(t('backup_no_files'))}</div>`;
    return;
  }
  backupFilesRows.innerHTML = files.map((file) => `
    <div class="row backup-file-row">
      <strong>${escapeHtml(file.fileName || '')}</strong>
      <span>${escapeHtml(formatAdminFileSize(file.size))}</span>
      <span>${escapeHtml(formatAdminDateTime(file.updatedAt))}</span>
      <button type="button" class="danger ghost backup-delete-btn" data-backup-file="${escapeHtml(file.fileName || '')}">${escapeHtml(t('backup_delete'))}</button>
    </div>
  `).join('');
}

async function loadBackups() {
  if (!backupSettingsForm) return;
  try {
    const result = await api('/api/admin/backups');
    writeBackupSettingsForm(result.settings || {});
    renderBackupFiles(result.files || []);
    if (backupSettingsMsg) backupSettingsMsg.textContent = result.directory ? `${t('backup_directory')}: ${result.directory}` : '';
  } catch (error) {
    if (backupSettingsMsg) backupSettingsMsg.textContent = error.message || t('backup_load_failed');
  }
}

async function refreshTrackingAndHealth() {
  const [tracking, health, systemHealth, diagnostics] = await Promise.all([
    api('/api/admin/workflow-tracking'),
    api('/api/admin/ffmpeg-health'),
    api('/api/admin/system-health'),
    api('/api/admin/runtime-diagnostics?limit=100').catch(() => null)
  ]);
  renderAssetTracking(tracking);
  renderHealth(health);
  renderSystemHealth(systemHealth);
  if (diagnostics) renderRuntimeDiagnostics(diagnostics);
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
    autoProxyBackfillOnUpload: settingsForm.elements.autoProxyBackfillOnUpload.checked,
    newAssetDefaultVisibility: String(settingsForm.elements.newAssetDefaultVisibility?.value || 'owner_groups'),
    playerUiMode: String(settingsForm.elements.playerUiMode.value || 'vidstack'),
    apiTokenEnabled: settingsForm.elements.apiTokenEnabled.checked,
    apiToken: String(settingsForm.elements.apiToken.value || '').trim(),
    oidcBearerEnabled: settingsForm.elements.oidcBearerEnabled.checked,
    oidcIssuerUrl: String(settingsForm.elements.oidcIssuerUrl.value || '').trim(),
    oidcJwksUrl: String(settingsForm.elements.oidcJwksUrl.value || '').trim(),
    oidcAudience: String(settingsForm.elements.oidcAudience.value || '').trim(),
    auditRetentionDays: Number(settingsForm.elements.auditRetentionDays?.value) || 180,
    mediaJobRetentionDays: Number(settingsForm.elements.mediaJobRetentionDays?.value) || 30
  };
  await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
  settingsMsg.textContent = t('settings_saved');
  renderApiHelp();
  renderApiGuide();
});

backupSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const current = await api('/api/admin/settings');
  await api('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      ...current,
      backup: readBackupSettingsForm()
    })
  });
  if (backupSettingsMsg) backupSettingsMsg.textContent = t('backup_saved');
  await loadBackups();
});

runBackupNowBtn?.addEventListener('click', async () => {
  runBackupNowBtn.disabled = true;
  if (backupSettingsMsg) backupSettingsMsg.textContent = '';
  try {
    const result = await api('/api/admin/backups/run', {
      method: 'POST',
      body: JSON.stringify(readBackupSettingsForm())
    });
    const files = Array.isArray(result.files) ? result.files.length : 0;
    if (backupSettingsMsg) backupSettingsMsg.textContent = `${t('backup_started')} (${files})`;
    await loadBackups();
  } catch (error) {
    if (backupSettingsMsg) backupSettingsMsg.textContent = error.message || t('backup_run_failed');
  } finally {
    runBackupNowBtn.disabled = false;
  }
});

backupFilesRows?.addEventListener('click', async (event) => {
  const button = event.target.closest('.backup-delete-btn');
  if (!button) return;
  const fileName = String(button.dataset.backupFile || '').trim();
  if (!fileName) return;
  if (!window.confirm(t('backup_delete_confirm'))) return;
  button.disabled = true;
  try {
    await api(`/api/admin/backups/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    if (backupSettingsMsg) backupSettingsMsg.textContent = t('backup_deleted');
    await loadBackups();
  } catch (error) {
    if (backupSettingsMsg) backupSettingsMsg.textContent = error.message || t('backup_delete_failed');
    button.disabled = false;
  }
});

exportAssetRightsBtn?.addEventListener('click', async () => {
  exportAssetRightsBtn.disabled = true;
  if (permissionBackupMsg) permissionBackupMsg.textContent = '';
  try {
    await exportPermissionBackup('asset-rights', assetRightsExportName, 'varlık_yetkileri.json');
    if (permissionBackupMsg) permissionBackupMsg.textContent = t('permission_backup_exported');
  } catch (error) {
    if (permissionBackupMsg) permissionBackupMsg.textContent = error.message || t('permission_backup_export_failed');
  } finally {
    exportAssetRightsBtn.disabled = false;
  }
});

exportPrincipalRightsBtn?.addEventListener('click', async () => {
  exportPrincipalRightsBtn.disabled = true;
  if (permissionBackupMsg) permissionBackupMsg.textContent = '';
  try {
    await exportPermissionBackup('principal-rights', principalRightsExportName, 'kullanıcı_grup_yetkileri.json');
    if (permissionBackupMsg) permissionBackupMsg.textContent = t('permission_backup_exported');
  } catch (error) {
    if (permissionBackupMsg) permissionBackupMsg.textContent = error.message || t('permission_backup_export_failed');
  } finally {
    exportPrincipalRightsBtn.disabled = false;
  }
});

importAssetRightsBtn?.addEventListener('click', async () => {
  if (!window.confirm(t('permission_backup_import_confirm'))) return;
  importAssetRightsBtn.disabled = true;
  if (permissionBackupMsg) permissionBackupMsg.textContent = '';
  try {
    const result = await importPermissionBackup('asset-rights', assetRightsImportFile);
    if (assetRightsImportFile) assetRightsImportFile.value = '';
    const skipped = Number(result?.missingAssetIds?.length || 0);
    if (permissionBackupMsg) {
      permissionBackupMsg.textContent = skipped
        ? `${t('permission_backup_imported')} (${skipped} skipped)`
        : t('permission_backup_imported');
    }
  } catch (error) {
    if (permissionBackupMsg) permissionBackupMsg.textContent = error.message || t('permission_backup_import_failed');
  } finally {
    importAssetRightsBtn.disabled = false;
  }
});

importPrincipalRightsBtn?.addEventListener('click', async () => {
  if (!window.confirm(t('permission_backup_import_confirm'))) return;
  importPrincipalRightsBtn.disabled = true;
  if (permissionBackupMsg) permissionBackupMsg.textContent = '';
  try {
    await importPermissionBackup('principal-rights', principalRightsImportFile);
    if (principalRightsImportFile) principalRightsImportFile.value = '';
    if (permissionBackupMsg) permissionBackupMsg.textContent = t('permission_backup_imported');
  } catch (error) {
    if (permissionBackupMsg) permissionBackupMsg.textContent = error.message || t('permission_backup_import_failed');
  } finally {
    importPrincipalRightsBtn.disabled = false;
  }
});

authSessionSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authSessionSettingsMsg) authSessionSettingsMsg.textContent = '';
  const submitButton = authSessionSettingsForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const result = await api('/api/admin/identity/session-settings', {
      method: 'PATCH',
      body: JSON.stringify({ authSession: readAuthSessionSettingsForm() })
    });
    writeAuthSessionSettingsForm(result.authSession || {});
    if (authSessionSettingsMsg) authSessionSettingsMsg.textContent = t('auth_session_saved');
  } catch (error) {
    if (authSessionSettingsMsg) authSessionSettingsMsg.textContent = error.message || t('auth_session_save_failed');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
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

subtitleSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ subtitleStyle: readSubtitleStyleForm() })
  });
  if (subtitleSettingsMsg) subtitleSettingsMsg.textContent = t('settings_saved');
});

document.getElementById('subtitleTextColorInput')?.addEventListener('input', syncSubtitleColorLabels);
document.getElementById('subtitleBackgroundColorInput')?.addEventListener('input', syncSubtitleColorLabels);

document.getElementById('subtitleSetDefaultBtn')?.addEventListener('click', async () => {
  const current = readSubtitleStyleForm();
  await api('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ subtitleStyle: current })
  });
  if (subtitleSettingsMsg) subtitleSettingsMsg.textContent = t('settings_saved');
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

auditTargetInput?.addEventListener('input', () => {
  queueAuditSuggestionRequest();
});

auditTargetInput?.addEventListener('focus', () => {
  queueAuditSuggestionRequest();
});

auditTargetInput?.addEventListener('blur', () => {
  if (auditSuggestHideTimer) clearTimeout(auditSuggestHideTimer);
  auditSuggestHideTimer = setTimeout(() => {
    hideAuditSuggestions();
    auditSuggestHideTimer = null;
  }, 120);
});

auditTargetInput?.addEventListener('keydown', (event) => {
  const isOpen = Boolean(auditTargetSuggestList && !auditTargetSuggestList.classList.contains('hidden'));
  if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    queueAuditSuggestionRequest();
    return;
  }
  if (!isOpen) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setAuditSuggestActive((auditSuggestActiveIndex < 0 ? -1 : auditSuggestActiveIndex) + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setAuditSuggestActive((auditSuggestActiveIndex < 0 ? auditSuggestItems.length : auditSuggestActiveIndex) - 1);
  } else if (event.key === 'Enter') {
    if (auditSuggestActiveIndex >= 0 && auditSuggestItems[auditSuggestActiveIndex]) {
      event.preventDefault();
      applyAuditSuggestion(auditSuggestItems[auditSuggestActiveIndex]);
    }
  } else if (event.key === 'Escape') {
    hideAuditSuggestions();
  }
});

auditTargetSuggestList?.addEventListener('mousedown', (event) => {
  event.preventDefault();
});

auditTargetSuggestList?.addEventListener('click', (event) => {
  const button = event.target.closest('.proxy-suggest-item');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isFinite(index) || index < 0 || index >= auditSuggestItems.length) return;
  applyAuditSuggestion(auditSuggestItems[index]);
});

includeTrash?.addEventListener('change', () => {
  if (document.activeElement === proxyToolAssetName) {
    queueProxySuggestionRequest();
  }
});

adminTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    hideProxySuggestions();
    hideAuditSuggestions();
    hideAssetRightsSuggestions();
    const target = btn.dataset.tab || 'apiHelp';
    switchTab(target);
    if (target === 'settings') {
      const activeSub = settingsSubTabs.find((item) => item.classList.contains('active'))?.dataset?.settingsTab || 'general';
      loadSettingsSubtabData(activeSub).catch((error) => {
        if (settingsMsg) settingsMsg.textContent = String(error.message || 'Request failed');
      });
    } else if (target === 'auditEvents') {
      loadAuditEvents().catch((error) => {
        if (auditEventsMsg) auditEventsMsg.textContent = String(error.message || 'Request failed');
      });
    } else if (target === 'runtimeDiagnostics') {
      loadRuntimeDiagnostics().catch((error) => {
        if (runtimeDiagnosticsMsg) runtimeDiagnosticsMsg.textContent = String(error.message || 'Request failed');
      });
    } else if (target === 'assetRights') {
      loadAssetRightsRows().catch((error) => {
        if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
      });
    } else if (target === 'documentRights') {
      loadDocumentRightsRows().catch((error) => {
        if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
      });
    }
  });
});

overviewCards.forEach((card) => {
  const open = () => {
    const target = String(card.dataset.overviewTarget || '').trim();
    if (target === 'system-health') {
      openSystemHealthFocus().catch((error) => {
        if (systemHealthRows) systemHealthRows.innerHTML = `<div class="empty">${escapeHtml(String(error.message || 'Request failed'))}</div>`;
      });
      return;
    }
    if (!['active-users', 'errors'].includes(target)) return;
    openRuntimeDiagnosticsFocus(target).catch((error) => {
      if (runtimeDiagnosticsMsg) runtimeDiagnosticsMsg.textContent = String(error.message || 'Request failed');
    });
  };
  card.addEventListener('click', open);
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
});

refreshRuntimeDiagnosticsBtn?.addEventListener('click', () => {
  loadRuntimeDiagnostics().catch((error) => {
    if (runtimeDiagnosticsMsg) runtimeDiagnosticsMsg.textContent = String(error.message || 'Request failed');
  });
});

runAuditSearchBtn?.addEventListener('click', () => {
  loadAuditEvents().catch((error) => {
    if (auditEventsMsg) auditEventsMsg.textContent = String(error.message || 'Request failed');
  });
});

exportAuditEventsBtn?.addEventListener('click', () => {
  exportAuditEvents().catch((error) => {
    if (auditEventsMsg) auditEventsMsg.textContent = String(error.message || t('audit_export_failed'));
  });
});

assetRightsSearchBtn?.addEventListener('click', () => {
  hideAssetRightsSuggestions();
  assetRightsPage = 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsSearchBtn?.addEventListener('click', () => {
  documentRightsPage = 1;
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsSearchInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  documentRightsPage = 1;
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsLockedOnlyCheck?.addEventListener('change', () => {
  documentRightsLockedOnly = Boolean(documentRightsLockedOnlyCheck.checked);
  documentRightsPage = 1;
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsPageSize?.addEventListener('change', () => {
  documentRightsPage = 1;
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsPrevPage?.addEventListener('click', () => {
  documentRightsPage = Math.max(1, documentRightsPage - 1);
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

documentRightsNextPage?.addEventListener('click', () => {
  documentRightsPage += 1;
  loadDocumentRightsRows().catch((error) => {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsSearchInput?.addEventListener('input', () => {
  queueAssetRightsSuggestionRequest();
});

assetRightsSearchInput?.addEventListener('focus', () => {
  queueAssetRightsSuggestionRequest();
});

assetRightsSearchInput?.addEventListener('blur', () => {
  if (assetRightsSuggestHideTimer) clearTimeout(assetRightsSuggestHideTimer);
  assetRightsSuggestHideTimer = setTimeout(() => {
    hideAssetRightsSuggestions();
    assetRightsSuggestHideTimer = null;
  }, 120);
});

assetRightsSearchInput?.addEventListener('keydown', (event) => {
  const isOpen = Boolean(assetRightsSuggestList && !assetRightsSuggestList.classList.contains('hidden'));
  if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    queueAssetRightsSuggestionRequest();
    return;
  }
  if (isOpen && event.key === 'ArrowDown') {
    event.preventDefault();
    setAssetRightsSuggestActive((assetRightsSuggestActiveIndex < 0 ? -1 : assetRightsSuggestActiveIndex) + 1);
    return;
  }
  if (isOpen && event.key === 'ArrowUp') {
    event.preventDefault();
    setAssetRightsSuggestActive((assetRightsSuggestActiveIndex < 0 ? assetRightsSuggestItems.length : assetRightsSuggestActiveIndex) - 1);
    return;
  }
  if (isOpen && event.key === 'Enter' && assetRightsSuggestActiveIndex >= 0 && assetRightsSuggestItems[assetRightsSuggestActiveIndex]) {
    event.preventDefault();
    applyAssetRightsSuggestion(assetRightsSuggestItems[assetRightsSuggestActiveIndex]);
    return;
  }
  if (isOpen && event.key === 'Escape') {
    hideAssetRightsSuggestions();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    hideAssetRightsSuggestions();
    assetRightsPage = 1;
    loadAssetRightsRows().catch((error) => {
      if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
    });
  }
});

assetRightsSuggestList?.addEventListener('mousedown', (event) => {
  event.preventDefault();
});

assetRightsSuggestList?.addEventListener('click', (event) => {
  const button = event.target.closest('.proxy-suggest-item');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isFinite(index) || index < 0 || index >= assetRightsSuggestItems.length) return;
  applyAssetRightsSuggestion(assetRightsSuggestItems[index]);
});

assetRightsTypeFilters.forEach((filter) => {
  filter.addEventListener('change', () => {
    assetRightsPage = 1;
    loadAssetRightsRows().catch((error) => {
      if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
    });
  });
});

assetRightsVisibilityFilter?.addEventListener('change', () => {
  assetRightsPage = 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsPageSize?.addEventListener('change', () => {
  assetRightsPage = 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsPrevPage?.addEventListener('click', () => {
  assetRightsPage = Math.max(1, assetRightsPage - 1);
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsNextPage?.addEventListener('click', () => {
  assetRightsPage += 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsRows?.addEventListener('change', (event) => {
  const select = event.target.closest('#assetRightsModeSelect');
  const visibilitySelect = event.target.closest('select[name="visibility"]');
  const lockedOnlyCheck = event.target.closest('#assetRightsLockedOnlyCheck');
  const ownerGroupFilterInput = event.target.closest('#assetRightsOwnerGroupFilter');
  if (visibilitySelect) {
    syncAssetRightsHiddenRowState(visibilitySelect.closest('.asset-rights-row'));
    return;
  }
  if (!select && !lockedOnlyCheck && !ownerGroupFilterInput) return;
  if (select) assetRightsMode = select.value === 'type' ? 'type' : 'asset';
  if (lockedOnlyCheck) assetRightsLockedOnly = Boolean(lockedOnlyCheck.checked);
  if (ownerGroupFilterInput) assetRightsOwnerGroupFilter = String(ownerGroupFilterInput.value || '').trim();
  assetRightsPage = 1;
  loadAssetRightsRows().catch((error) => {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
  });
});

assetRightsRows?.addEventListener('input', (event) => {
  const ownerGroupFilterInput = event.target.closest('#assetRightsOwnerGroupFilter');
  if (ownerGroupFilterInput) {
    assetRightsOwnerGroupFilter = String(ownerGroupFilterInput.value || '').trim();
    return;
  }
  const input = event.target.closest('input[data-group-suggest="1"]');
  if (!input) return;
  requestAssetRightsGroupSuggestions(input).catch(() => {});
});

assetRightsRows?.addEventListener('focusin', (event) => {
  const input = event.target.closest('input[data-group-suggest="1"]');
  if (!input) return;
  if (assetRightsGroupSuggestHideTimer) {
    clearTimeout(assetRightsGroupSuggestHideTimer);
    assetRightsGroupSuggestHideTimer = null;
  }
  requestAssetRightsGroupSuggestions(input).catch(() => {});
});

assetRightsRows?.addEventListener('focusout', (event) => {
  const input = event.target.closest('input[data-group-suggest="1"]');
  if (!input) return;
  if (assetRightsGroupSuggestHideTimer) clearTimeout(assetRightsGroupSuggestHideTimer);
  assetRightsGroupSuggestHideTimer = setTimeout(() => {
    hideAssetRightsGroupSuggestions();
    assetRightsGroupSuggestHideTimer = null;
  }, 120);
});

assetRightsRows?.addEventListener('keydown', (event) => {
  const ownerGroupFilterInput = event.target.closest('#assetRightsOwnerGroupFilter');
  if (ownerGroupFilterInput) {
    if (event.key === 'Enter') {
      event.preventDefault();
      assetRightsOwnerGroupFilter = String(ownerGroupFilterInput.value || '').trim();
      assetRightsPage = 1;
      loadAssetRightsRows().catch((error) => {
        if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || 'Request failed');
      });
    }
    return;
  }
  const input = event.target.closest('input[data-group-suggest="1"]');
  if (!input) return;
  const isOpen = Boolean(assetRightsGroupSuggestEl && !assetRightsGroupSuggestEl.classList.contains('hidden'));
  if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    requestAssetRightsGroupSuggestions(input).catch(() => {});
    return;
  }
  if (isOpen && event.key === 'ArrowDown') {
    event.preventDefault();
    setAssetRightsGroupSuggestActive((assetRightsGroupSuggestActiveIndex < 0 ? -1 : assetRightsGroupSuggestActiveIndex) + 1);
    return;
  }
  if (isOpen && event.key === 'ArrowUp') {
    event.preventDefault();
    setAssetRightsGroupSuggestActive((assetRightsGroupSuggestActiveIndex < 0 ? assetRightsGroupSuggestItems.length : assetRightsGroupSuggestActiveIndex) - 1);
    return;
  }
  if (isOpen && event.key === 'Enter' && assetRightsGroupSuggestActiveIndex >= 0 && assetRightsGroupSuggestItems[assetRightsGroupSuggestActiveIndex]) {
    event.preventDefault();
    applyAssetRightsGroupSuggestion(assetRightsGroupSuggestItems[assetRightsGroupSuggestActiveIndex]);
    return;
  }
  if (isOpen && event.key === 'Escape') {
    event.preventDefault();
    hideAssetRightsGroupSuggestions();
  }
});

assetRightsRows?.addEventListener('scroll', () => {
  if (assetRightsGroupSuggestInput && assetRightsGroupSuggestEl && !assetRightsGroupSuggestEl.classList.contains('hidden')) {
    positionAssetRightsGroupSuggestions(assetRightsGroupSuggestInput);
  }
});

assetRightsRows?.addEventListener('submit', async (event) => {
  const form = event.target.closest('.asset-rights-row');
  if (!form) return;
  event.preventDefault();
  const assetId = String(form.dataset.assetId || '').trim();
  const typeGroup = String(form.dataset.typeGroup || '').trim();
  const accessMode = String(form.dataset.accessMode || 'asset').trim();
  if (accessMode === 'asset' && !assetId) return;
  if (accessMode === 'type' && !typeGroup) return;
  const saveBtn = form.querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const data = new FormData(form);
    const payload = {
      allowedGroups: parseAccessList(data.get('allowedGroups')),
      allowedUsers: parseAccessList(data.get('allowedUsers')),
      deniedGroups: parseAccessList(data.get('deniedGroups')),
      deniedUsers: parseAccessList(data.get('deniedUsers')),
      editAllowedGroups: parseAccessList(data.get('editAllowedGroups')),
      editAllowedUsers: parseAccessList(data.get('editAllowedUsers')),
      editDeniedGroups: parseAccessList(data.get('editDeniedGroups')),
      editDeniedUsers: parseAccessList(data.get('editDeniedUsers')),
      downloadAllowedGroups: parseAccessList(data.get('downloadAllowedGroups')),
      downloadAllowedUsers: parseAccessList(data.get('downloadAllowedUsers')),
      downloadDeniedGroups: parseAccessList(data.get('downloadDeniedGroups')),
      downloadDeniedUsers: parseAccessList(data.get('downloadDeniedUsers'))
    };
    if (accessMode === 'type') {
      payload.uploadAllowedGroups = parseAccessList(data.get('uploadAllowedGroups'));
      payload.uploadAllowedUsers = parseAccessList(data.get('uploadAllowedUsers'));
      payload.uploadDeniedGroups = parseAccessList(data.get('uploadDeniedGroups'));
      payload.uploadDeniedUsers = parseAccessList(data.get('uploadDeniedUsers'));
    } else {
      payload.visibility = String(data.get('visibility') || 'public');
      payload.ownerGroups = parseAccessList(data.get('ownerGroups'));
    }
    const endpoint = accessMode === 'type'
      ? `/api/admin/asset-types/${encodeURIComponent(typeGroup)}/access`
      : `/api/admin/assets/${encodeURIComponent(assetId)}/access`;
    await api(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (assetRightsMsg) assetRightsMsg.textContent = t('asset_rights_saved');
    await loadAssetRightsRows();
  } catch (error) {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || t('asset_rights_save_failed'));
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
});

assetRightsRows?.addEventListener('click', async (event) => {
  const unlockBtn = event.target.closest('[data-unlock-asset-id]');
  if (!unlockBtn) return;
  event.preventDefault();
  const assetId = String(unlockBtn.getAttribute('data-unlock-asset-id') || '').trim();
  if (!assetId) return;
  if (!window.confirm(t('asset_lock_unlock_confirm'))) return;
  unlockBtn.disabled = true;
  try {
    await api(`/api/admin/assets/${encodeURIComponent(assetId)}/edit-lock`, { method: 'DELETE' });
    if (assetRightsMsg) assetRightsMsg.textContent = t('asset_lock_unlock_done');
    await loadAssetRightsRows();
  } catch (error) {
    if (assetRightsMsg) assetRightsMsg.textContent = String(error.message || t('asset_lock_unlock_failed'));
  } finally {
    unlockBtn.disabled = false;
  }
});

documentRightsRows?.addEventListener('submit', async (event) => {
  const form = event.target.closest('.document-rights-row');
  if (!form) return;
  event.preventDefault();
  const assetId = String(form.dataset.assetId || '').trim();
  if (!assetId) return;
  const saveBtn = form.querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const data = new FormData(form);
    const payload = {
      allowedUsers: parseAccessList(data.get('allowedUsers')),
      deniedUsers: parseAccessList(data.get('deniedUsers')),
      editAllowedUsers: parseAccessList(data.get('editAllowedUsers')),
      editDeniedUsers: parseAccessList(data.get('editDeniedUsers')),
      downloadAllowedUsers: parseAccessList(data.get('downloadAllowedUsers')),
      downloadDeniedUsers: parseAccessList(data.get('downloadDeniedUsers'))
    };
    await api(`/api/admin/document-rights/assets/${encodeURIComponent(assetId)}/access`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (documentRightsMsg) documentRightsMsg.textContent = t('document_rights_saved');
    await loadDocumentRightsRows();
  } catch (error) {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || t('document_rights_save_failed'));
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
});

documentRightsRows?.addEventListener('click', async (event) => {
  const unlockBtn = event.target.closest('[data-document-unlock-asset-id]');
  if (!unlockBtn) return;
  event.preventDefault();
  const assetId = String(unlockBtn.getAttribute('data-document-unlock-asset-id') || '').trim();
  if (!assetId) return;
  if (!window.confirm(t('asset_lock_unlock_confirm'))) return;
  unlockBtn.disabled = true;
  try {
    await api(`/api/admin/document-rights/assets/${encodeURIComponent(assetId)}/edit-lock`, { method: 'DELETE' });
    if (documentRightsMsg) documentRightsMsg.textContent = t('asset_lock_unlock_done');
    await loadDocumentRightsRows();
  } catch (error) {
    if (documentRightsMsg) documentRightsMsg.textContent = String(error.message || t('asset_lock_unlock_failed'));
  } finally {
    unlockBtn.disabled = false;
  }
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

function applyAdminLanguage(nextLang) {
  currentLang = nextLang === 'tr' ? 'tr' : 'en';
  if (languageSelect && languageSelect.value !== currentLang) {
    languageSelect.value = currentLang;
  }
  localStorage.setItem(LOCAL_LANG, currentLang);
  applyI18n();
  if (assetRightsRows?.querySelector('.asset-rights-table') || lastAssetRightsAssets.length || lastAssetRightsTypes.length) {
    renderAssetRightsRows(assetRightsMode === 'type' ? lastAssetRightsTypes : lastAssetRightsAssets);
  }
  if (documentRightsRows?.querySelector('.document-rights-table') || lastDocumentRightsAssets.length) {
    renderDocumentRightsRows(lastDocumentRightsAssets);
  }
  renderAssetRightsPager();
  renderDocumentRightsPager();
  syncAssetRightsTableLanguage();
}

languageSelect?.addEventListener('change', async (event) => {
  applyAdminLanguage(event.target.value);
  const access = accessScopeModule.getAdminAccessMode(currentAdminProfile || {});
  if (!access.isAssetRightsOnly && !access.isDocumentRightsOnly && (!currentAdminProfile?.canAccessTextAdmin || currentAdminProfile?.canAccessAdmin || currentAdminProfile?.isAdmin)) {
    await refreshTrackingAndHealth();
    if (currentAdminProfile?.isSuperAdmin) {
      await loadUserPermissions();
      await loadIdentityOverview();
      await loadGroupAdmins();
    }
  }
  if (!access.isAssetRightsOnly && !access.isDocumentRightsOnly) {
    const activeSub = settingsSubTabs.find((item) => item.classList.contains('active'))?.dataset?.settingsTab || 'general';
    if (activeSub === 'ocr') {
      await loadOcrRecords();
    } else if (activeSub === 'subtitle') {
      await loadSubtitleRecords();
    }
  }
  if (activeJobId) {
    const job = await api(`/api/admin/proxy-jobs/${activeJobId}`);
    renderProxyJob(job);
  }
});

addGroupAdminBtn?.addEventListener('click', async () => {
  const groupName = String(groupAdminGroupInput?.value || '').trim();
  const username = String(groupAdminUserInput?.value || '').trim();
  const scope = String(groupAdminScopeInput?.value || 'asset-rights').trim();
  const assetTypes = getSelectedGroupAdminAssetTypes();
  if (!groupName || !username) {
    if (groupAdminsMsg) groupAdminsMsg.textContent = `${t('group_name')} / ${t('username')}`;
    return;
  }
  try {
    const endpoint = editingGroupAdminId
      ? `/api/admin/group-admins/${encodeURIComponent(editingGroupAdminId)}`
      : '/api/admin/group-admins';
    await api(endpoint, {
      method: editingGroupAdminId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        groupName,
        username,
        adminScopes: scope ? [scope] : ['asset-rights'],
        assetTypeGroups: assetTypes
      })
    });
    if (groupAdminUserInput) groupAdminUserInput.value = '';
    editingGroupAdminId = '';
    if (groupAdminScopeInput) groupAdminScopeInput.value = 'asset-rights';
    setGroupAdminAssetTypes([]);
    if (addGroupAdminBtn) addGroupAdminBtn.textContent = t('add_group_admin');
    if (groupAdminsMsg) groupAdminsMsg.textContent = t('group_admin_saved');
    await loadIdentityOverview();
    await loadGroupAdmins();
  } catch (error) {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('group_admin_save_failed'));
  }
});

refreshIdentityOverviewBtn?.addEventListener('click', () => {
  loadIdentityOverview().catch((error) => {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('identity_load_failed'));
  });
});

identityUserSearchInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  searchIdentityUsers();
});

identityUserSearchButton?.addEventListener('click', () => {
  searchIdentityUsers();
});

function getSelectedGroupAdminAssetTypes() {
  const checks = Array.from(groupAdminAssetTypeInput?.querySelectorAll?.('input[type="checkbox"]:checked') || []);
  const values = checks.map((input) => String(input.value || '').trim()).filter(Boolean);
  if (!values.length) return [];
  return Array.from(new Set(values));
}

function setGroupAdminAssetTypes(values = []) {
  const selected = new Set(Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : []);
  Array.from(groupAdminAssetTypeInput?.querySelectorAll?.('input[type="checkbox"]') || []).forEach((input) => {
    const value = String(input.value || '').trim();
    input.checked = selected.has(value);
  });
}

function parseGroupAdminDatasetJson(value, fallback = []) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

groupAdminsRows?.addEventListener('click', async (event) => {
  const editBtn = event.target.closest('.editGroupAdminBtn');
  if (editBtn) {
    const id = String(editBtn.dataset.id || '').trim();
    if (!id) return;
    editingGroupAdminId = id;
    if (groupAdminGroupInput) groupAdminGroupInput.value = String(editBtn.dataset.groupName || '');
    if (groupAdminUserInput) groupAdminUserInput.value = String(editBtn.dataset.username || '');
    const scopes = parseGroupAdminDatasetJson(editBtn.dataset.scopes, []);
    const types = parseGroupAdminDatasetJson(editBtn.dataset.types, []);
    if (groupAdminScopeInput) groupAdminScopeInput.value = String(scopes?.[0] || 'asset-rights');
    setGroupAdminAssetTypes(types);
    if (addGroupAdminBtn) addGroupAdminBtn.textContent = t('group_admin_update');
    if (groupAdminsMsg) groupAdminsMsg.textContent = '';
    groupAdminGroupInput?.focus();
    return;
  }
  const deleteBtn = event.target.closest('.deleteGroupAdminBtn');
  if (!deleteBtn) return;
  const id = String(deleteBtn.dataset.id || '').trim();
  if (!id) return;
  try {
    await api(`/api/admin/group-admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (editingGroupAdminId === id) editingGroupAdminId = '';
    await loadIdentityOverview();
    await loadGroupAdmins();
  } catch (error) {
    if (groupAdminsMsg) groupAdminsMsg.textContent = String(error.message || t('group_admin_delete_failed'));
  }
});

const onLanguageShortcut = (event) => {
  if (event.key !== 'L' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!languageSelect) return;
  const nextLang = languageSelect.value === 'tr' ? 'en' : 'tr';
  applyAdminLanguage(nextLang);
  event.preventDefault();
  event.stopPropagation();
};

document.addEventListener('keydown', onLanguageShortcut, true);

(async () => {
  try {
    const me = await api('/api/me');
    const access = applyAdminAccessMode(me);
    if (!access.canAccessAdmin && !access.canAccessTextAdmin && !access.canAccessAssetRightsAdmin && !access.canAccessDocumentRightsAdmin) {
      window.location.href = '/';
      return;
    }
    await loadI18nFile();
    applyAdminLanguage(currentLang);
    updateProxyToolUi();
    if (!access.isTextOnly && !access.isAssetRightsOnly && !access.isDocumentRightsOnly) {
      await loadSettings();
      await refreshTrackingAndHealth();
      if (access.isSuperAdmin) {
        await loadUserPermissions();
        await loadIdentityOverview();
        await loadGroupAdmins();
      }
    } else if (access.isAssetRightsOnly) {
      await loadAssetRightsRows();
    } else if (access.isDocumentRightsOnly) {
      await loadDocumentRightsRows();
    }
    if (!access.isAssetRightsOnly && !access.isDocumentRightsOnly) {
      const initialSubtab = access.isTextOnly ? 'ocr' : 'general';
      switchSettingsSubtab(initialSubtab);
      if (initialSubtab === 'ocr') {
        await loadOcrRecords();
      }
    }
  } catch (error) {
    ffmpegHealthEl.textContent = error.message;
  }
})();
