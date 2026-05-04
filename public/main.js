const ingestForm = document.getElementById('ingestForm');
const mediaFileInput = document.getElementById('mediaFileInput');
const mediaFileBtn = document.getElementById('mediaFileBtn');
const mediaFileName = document.getElementById('mediaFileName');
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const uploadProgressSpinner = document.getElementById('uploadProgressSpinner');
const searchForm = document.getElementById('searchForm');
const assetGrid = document.getElementById('assetGrid');
const assetDetail = document.getElementById('assetDetail');
const panelIngest = document.getElementById('panelIngest');
const panelAssets = document.getElementById('panelAssets');
const assetViewThumbBtn = document.getElementById('assetViewThumbBtn');
const assetViewListBtn = document.getElementById('assetViewListBtn');
const assetsTitleToggleBtn = panelAssets?.querySelector('.panel-head h2');
const assetTypeFilters = Array.from(document.querySelectorAll('.asset-type-filter'));
const panelDetail = document.getElementById('panelDetail');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const panelVideoToolsBtn = document.getElementById('panelVideoToolsBtn');
const statusSelect = searchForm.querySelector('[name="status"]');
const searchQueryInput = searchForm.querySelector('[name="q"]');
const searchSuggestList = document.getElementById('searchSuggestList');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchResultCounter = document.getElementById('searchResultCounter');
// OCR ve Altyazi aramalari 1. kolonda birbirinden bagimsiz iki ayri kutu olarak calisir.
const ocrQueryInput = searchForm.querySelector('[name="ocrQ"]');
const ocrSuggestList = document.getElementById('ocrSuggestList');
const subtitleQueryInput = searchForm.querySelector('[name="subtitleQ"]');
const subtitleSuggestList = document.getElementById('subtitleSuggestList');
const languageSelect = document.getElementById('languageSelect');
const currentUserBtn = document.getElementById('currentUserBtn');
const userMenu = document.getElementById('userMenu');
const adminMenuLink = document.getElementById('adminMenuLink');
const logoutBtn = document.getElementById('logoutBtn');
const layout = document.querySelector('.layout');
const splitters = Array.from(document.querySelectorAll('.panel-splitter'));
const splitterDots = Array.from(document.querySelectorAll('.splitter-dot'));
const splitterTabs = Array.from(document.querySelectorAll('.splitter-tab'));
const pageParams = new URLSearchParams(window.location.search);
const isVideoToolsPageMode = String(pageParams.get('view') || '').trim().toLowerCase() === 'video-tools';
const requestedVideoToolsAssetId = String(pageParams.get('assetId') || '').trim();
const requestedVideoToolsStartSec = Math.max(0, Number(pageParams.get('tc') || 0) || 0);
const requestedOpenAssetId = String(pageParams.get('openAsset') || '').trim();
const requestedOpenStartSec = Math.max(0, Number(pageParams.get('openTc') || 0) || 0);
const requestedRestorePanels = String(pageParams.get('restorePanels') || '').trim();

const LOCAL_PANEL_SIZE = 'mam.panel.sizes';
const LOCAL_PANEL_VIS = 'mam.panel.visibility';
const LOCAL_LANG = 'mam.lang';
const LOCAL_VIDEO_TOOLS_ORDER = 'mam.video.tools.order';
const LOCAL_ASSET_VIEW_MODE = 'mam.assets.view.mode';
const LOCAL_DETAIL_VIDEO_PIN = 'mam.detail.video.pin';
const I18N_PATH = '/i18n.json';
const DETAIL_PANEL_BASE_MIN_PX = 377;
const PLAYER_FPS = 25;
const PANELS = [
  { id: 'panelIngest', defaultSize: 1 },
  { id: 'panelAssets', defaultSize: 1.2 },
  { id: 'panelDetail', defaultSize: 1 }
];

let currentAssets = [];
let activePlayerCleanup = null;
let activeDetailPinCleanup = null;
let playerUiMode = 'vidstack';
let subtitleStyleSettings = {
  customOverlayEnabled: true,
  bottomOffset: 56,
  fontSize: 24,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.72,
  horizontalPadding: 16,
  maxWidth: 82
};
let detailVideoPinned = localStorage.getItem(LOCAL_DETAIL_VIDEO_PIN) === '1';
let commonModule = null;
let detailModule = null;
let ingestModule = null;
let selectedAssetId = null;
let currentUserCanAccessAdmin = false;
let currentUserCanEditMetadata = false;
let currentUserCanEditOffice = false;
let currentUserCanDeleteAssets = false;
let currentUserCanUsePdfAdvancedTools = false;
let currentOfficeEditorProvider = 'none';
let currentUsername = '';
let searchSuggestModule = null;
const selectedAssetIds = new Set();
let lastSelectedAssetId = null;
let currentSearchQuery = '';
let currentOcrQuery = '';
let currentSubtitleQuery = '';
let currentSearchHighlightQuery = '';
let currentSearchDidYouMean = '';
let currentSearchFuzzyUsed = false;
let currentOcrHighlightQuery = '';
let currentOcrDidYouMean = '';
let currentOcrFuzzyUsed = false;
let searchResultCounterVisible = false;
const cutMarksByAsset = new Map();
const subtitleOverlayEnabledByAsset = new Map();
let panelSizes = Object.fromEntries(PANELS.map((p) => [p.id, p.defaultSize]));
let panelVisibility = { panelIngest: true, panelAssets: true, panelDetail: true };
let dynamicDetailMinPx = DETAIL_PANEL_BASE_MIN_PX;
let assetViewMode = localStorage.getItem(LOCAL_ASSET_VIEW_MODE) === 'list' ? 'list' : 'grid';

function hideSearchSuggestions() {
  return searchSuggestModule?.hideSearchSuggestions?.();
}

function hideOcrSuggestions() {
  return searchSuggestModule?.hideOcrSuggestions?.();
}

function hideSubtitleSuggestions() {
  return searchSuggestModule?.hideSubtitleSuggestions?.();
}

function queueSearchSuggestions() {
  return searchSuggestModule?.queueSearchSuggestions?.();
}

function queueOcrSuggestions() {
  return searchSuggestModule?.queueOcrSuggestions?.();
}

function queueSubtitleSuggestions() {
  return searchSuggestModule?.queueSubtitleSuggestions?.();
}

function setSearchResultCounterVisible(visible) {
  searchResultCounterVisible = Boolean(visible);
  if (!searchResultCounter) return;
  searchResultCounter.classList.toggle('hidden', !searchResultCounterVisible);
}

function updateSearchResultCounter() {
  if (!searchResultCounter) return;
  if (!searchResultCounterVisible) {
    searchResultCounter.textContent = '';
    searchResultCounter.classList.add('hidden');
    return;
  }
  const count = Array.isArray(currentAssets) ? currentAssets.length : 0;
  searchResultCounter.textContent = String(count);
  searchResultCounter.classList.remove('hidden');
}

const shellModule = window.createMainShellModule({
  searchForm,
  statusSelect,
  assetTypeFilters,
  clearSearchBtn,
  ocrQueryInput,
  panelVideoToolsBtn,
  pageParams,
  isVideoToolsPageMode,
  panelVisibilityRef: {
    get: () => panelVisibility,
    set: (next) => { panelVisibility = next; }
  },
  subtitleOverlayEnabledByAsset,
  hideSearchSuggestions,
  hideOcrSuggestions,
  hideSubtitleSuggestions,
  loadAssets: (...args) => loadAssets(...args),
  isPanelVisible,
  escapeHtml,
  t,
  currentLangRef: {
    get: () => currentLang
  },
  scheduleNativeSubtitleCuePosition,
  secondsToTimecode,
  PLAYER_FPS,
  parseTimecodeInput
});

function openVideoToolsPage(assetId, startAtSeconds = 0) {
  return shellModule.openVideoToolsPage(assetId, startAtSeconds);
}

function leaveVideoToolsPage(returnAssetId = '', returnStartAtSeconds = 0) {
  return shellModule.leaveVideoToolsPage(returnAssetId, returnStartAtSeconds);
}

function applyVideoToolsPageLayoutMode() {
  return shellModule.applyVideoToolsPageLayoutMode();
}

function hasActiveSearchFields() {
  return shellModule.hasActiveSearchFields();
}

function updateClearSearchButtonState() {
  return shellModule.updateClearSearchButtonState();
}

async function clearSearchFields() {
  return shellModule.clearSearchFields();
}

function getActiveOcrQueryInput() {
  return shellModule.getActiveOcrQueryInput();
}

async function toggleFullscreenForElement(targetEl) {
  return shellModule.toggleFullscreenForElement(targetEl);
}

function initFullscreenOverlay(mediaEl, fullscreenTarget, asset = null) {
  return shellModule.initFullscreenOverlay(mediaEl, fullscreenTarget, asset);
}

function setPanelVideoToolsButtonState(visible, onClick = null) {
  return shellModule.setPanelVideoToolsButtonState(visible, onClick);
}

function syncOcrQueryInputs(source) {
  return shellModule.syncOcrQueryInputs(source);
}

function setSubtitleOverlayEnabled(assetId, enabled) {
  return shellModule.setSubtitleOverlayEnabled(assetId, enabled);
}

function showShortcutToast(message) {
  return shellModule.showShortcutToast(message);
}

let i18n = {
  en: {
    app_title: 'MAM Console',
    app_subtitle: 'Dalet-style MVP: ingest, metadata, workflow, versions',
    current_user: 'Current User',
    unknown_user: 'Unknown user',
    logout: 'Logout',
    language_label: 'Language',
    admin_page: 'Admin',
    ingest_title: 'Ingest Asset',
    search_title: 'Search',
    clear_search_fields: 'Clear all search fields',
    search_upload_tag: 'SEARCH / UPLOAD',
    assets_title: 'Assets',
    asset_detail_title: 'Detail',
    select_asset: 'Select an asset.',
    ph_title: 'Title',
    title: 'Title',
    ph_type: 'Type',
    type_video: 'Video',
    type_audio: 'Audio',
    type_document: 'Document',
    type_photo: 'Photo',
    type_other: 'Other',
    ph_owner: 'Owner',
    choose_file: 'Choose File',
    ph_tags: 'Tags (comma separated)',
    ph_duration_auto: 'Duration auto-detected',
    ph_source: 'Source path',
    ph_description: 'Description',
    description: 'Description',
    tags: 'Tags',
    ph_query: 'Query',
    ph_ocr_query: 'OCR Search',
    ph_subtitle_query: 'Subtitle Search',
    ph_tag: 'Tag',
    ph_type_simple: 'Type',
    filter_types: 'Types',
    list_view: 'List View',
    thumbnail_view: 'Thumbnail View',
    trash_scope: 'Trash',
    any_status: 'Any status',
    trash_active: 'Active assets',
    trash_only: 'Trash only',
    trash_all: 'All (active + trash)',
    btn_upload_create: 'Upload & Create Asset',
    uploading: 'Uploading',
    processing: 'Processing',
    btn_apply_filters: 'Apply Filters',
    search_result_count: '{count} matches',
    no_assets: 'No assets found.',
    playback_source: 'Playback source',
    low_res_proxy: 'Low-res proxy',
    original_file: 'Original file',
    proxy_status: 'Proxy status',
    proxy_required: 'Proxy not ready. Video playback is available after proxy generation.',
    play: 'Play',
    stop: 'Stop',
    pause: 'Pause',
    prev_frame: 'Prev Frame',
    next_frame: 'Next Frame',
    reverse_frame: 'Reverse Frame',
    forward_frame: 'Forward Frame',
    timecode: 'Timecode',
    tc: 'TC',
    set_in: 'Set IN',
    set_out: 'Set OUT',
    go_in: 'Go IN',
    go_out: 'Go OUT',
    clear: 'Clear',
    save_cut: 'Save Cut',
    clip_name: 'Clip Name',
    ph_clip_name: 'Enter clip name',
    delete_marks: 'Delete Marks',
    delete_cut: 'Delete Cut',
    edit_clip: 'Edit Clip',
    rename_clip_prompt: 'Enter new clip name',
    edit_in_prompt: 'Enter IN timecode (HH:MM:SS:FF)',
    edit_out_prompt: 'Enter OUT timecode (HH:MM:SS:FF)',
    invalid_timecode: 'Invalid timecode format.',
    invalid_in_out: 'OUT must be greater than or equal to IN.',
    clip_editor_title: 'Edit Clip',
    clip_editor_name: 'Clip Name',
    clip_editor_in: 'IN Timecode',
    clip_editor_out: 'OUT Timecode',
    clip_editor_cancel: 'Cancel',
    clip_editor_save: 'Save',
    jump_to_cut: 'Jump',
    play_cut: 'Play Clip',
    original_master: 'Original master',
    open_file: 'Open file',
    audio_channels: 'Audio Channels',
    group_channel_selection: 'Group channel selection',
    hide_audio_graph: 'Hide Audio Graph',
    show_audio_graph: 'Show Audio Graph',
    open_pdf: 'Open PDF',
    open_document: 'Open document file',
    open_attached: 'Open attached file',
    no_media: 'No media file attached.',
    no_description: 'No description',
    owner: 'Owner',
    type: 'Type',
    duration: 'Duration',
    technical_info: 'Technical Info',
    tech_loading: 'Loading technical info...',
    tech_unavailable: 'Technical info unavailable.',
    tech_container: 'Container',
    tech_resolution: 'Resolution',
    tech_video_codec: 'Video codec',
    tech_frame_rate: 'Frame rate',
    tech_pixel_format: 'Pixel format',
    tech_audio_codec: 'Audio codec',
    tech_audio_channels: 'Audio channels',
    tech_sample_rate: 'Sample rate',
    tech_duration: 'Duration',
    tech_bitrate: 'Bitrate',
    tech_file_size: 'File size',
    status: 'Status',
    trash: 'Trash',
    in_trash: 'In Trash',
    active: 'Active',
    restore: 'Restore',
    delete_asset: 'Delete',
    delete_permanent: 'Delete Permanently',
    move_to_trash_confirm: 'Move this asset to trash?',
    move_to_trash: 'Move To Trash',
    asset_viewer: 'Asset Viewer',
    edit_metadata: 'Edit Metadata',
    save_metadata: 'Save Metadata',
    metadata_save_failed: 'Metadata save failed.',
    metadata_edit_locked: 'You do not have permission to edit metadata.',
    dublin_core: 'Dublin Core Metadata',
    dc_title: 'DC Title',
    dc_creator: 'DC Creator',
    dc_subject: 'DC Subject',
    dc_description: 'DC Description',
    dc_publisher: 'DC Publisher',
    dc_contributor: 'DC Contributor',
    dc_date: 'DC Date',
    dc_type: 'DC Type',
    dc_format: 'DC Format',
    dc_identifier: 'DC Identifier',
    dc_source: 'DC Source',
    dc_language: 'DC Language',
    dc_relation: 'DC Relation',
    dc_coverage: 'DC Coverage',
    dc_rights: 'DC Rights',
    workflow_transition: 'Workflow Transition',
    move_status: 'Move Status',
    add_version: 'Add Version',
    what_changed: 'What changed',
    create_version: 'Create Version',
    ph_inline_tags: 'tag1, tag2',
    ph_version_label: 'v2',
    versions: 'Versions',
    restore_pdf_version: 'Restore PDF',
    restore_office_version: 'Restore Office',
    restore_pdf_original: 'Restore Original PDF',
    restore_office_original: 'Restore Original Office',
    download_pdf_original: 'Download Original PDF',
    download_office_original: 'Download Original Office',
    restore_pdf_confirm: 'Restore this PDF version? Current PDF state will be saved as a new restore version.',
    restore_pdf_original_confirm: 'Restore the original PDF snapshot?',
    restore_office_original_confirm: 'Restore the original Office snapshot?',
    restore_pdf_unavailable: 'No snapshot',
    delete_pdf_version: 'Delete PDF Edit',
    delete_pdf_version_confirm: 'Delete this PDF edit version entry?',
    delete_version: 'Delete Version',
    delete_version_confirm: 'Delete this version entry?',
    edit_version_name: 'Rename Version',
    edit_version_name_prompt: 'New version name',
    edit_version_note_prompt: 'Version note (optional)',
    version_actor: 'By',
    version_action: 'Action',
    version_change_type: 'Change Type',
    action_ingest: 'Ingest',
    action_manual: 'Manual',
    action_office_save: 'Office Save',
    action_pdf_save: 'PDF Save',
    action_pdf_restore: 'PDF Restore',
    action_pdf_restore_original: 'PDF Original Restore',
    action_office_restore: 'Office Restore',
    action_office_restore_original: 'Office Original Restore',
    restore_office_confirm: 'Restore this Office version?',
    action_file_replace: 'File Replace',
    pdf_change_redaction: 'Redaction',
    pdf_change_text_insert: 'Text Insert',
    pdf_change_annotation: 'Annotation',
    pdf_change_mixed: 'Mixed',
    pdf_change_unknown: 'Unknown',
    multi_selected: 'Multiple assets selected',
    selected_count: 'Selected count',
    bulk_delete_selected: 'Delete Selected Permanently',
    bulk_clear_selection: 'Clear Selection',
    bulk_delete_confirm: 'Permanently delete {count} selected assets? This cannot be undone.',
    segment: 'DUR',
    in_label: 'IN',
    out_label: 'OUT',
    trash_confirm: 'Permanently delete this asset? This cannot be undone.',
    select_media_first: 'Select a media file to upload.',
    upload_empty_file: 'The selected file is empty (0 KB). Please choose a complete file.',
    proxy_failed: 'Proxy failed. Switched to original media.',
    proxy_fallback_status: 'fallback',
    webaudio_unavailable: 'Web Audio API is not available in this browser.',
    audiograph_unsupported: 'Audio graph is not supported in this browser.',
    channel_on: 'ON',
    channel_off: 'OFF',
    preview_loading: 'Loading preview...',
    preview_not_available: 'Preview not available.',
    preview_not_supported: 'Preview not supported for this file type.',
    preview_search_placeholder: 'Search in preview',
    preview_search_empty: 'No matches',
    preview_next: 'Next',
    preview_find: 'Find',
    preview_search_error: 'Search failed',
    preview_reset: 'Reset',
    pdf_preview_unavailable: 'PDF preview engine is unavailable.',
    generate_proxy: 'Generate Proxy',
    download_asset: 'Download',
    download_proxy: 'Download Proxy',
    video_native_audio: 'Native video audio mode is active.',
    subtitles: 'Subtitles',
    subtitle_lang: 'Lang',
    subtitle_none: 'No subtitle loaded',
    subtitle_loaded: 'Subtitle loaded',
    subtitle_upload: 'Upload Subtitle',
    subtitle_generate: 'Generate Subtitle',
    subtitle_use_whisperx: 'Use WhisperX align',
    subtitle_model: 'Model',
    subtitle_model_tiny: 'Tiny',
    subtitle_model_base: 'Base',
    subtitle_model_small: 'Small',
    subtitle_use_zemberek: 'Use Zemberek correction',
    subtitle_audio_stream: 'Audio stream',
    subtitle_audio_stream_default: 'Default stream',
    subtitle_audio_channel: 'Channel',
    subtitle_audio_channel_mix: 'Mix all channels',
    subtitle_upload_success: 'Subtitle uploaded.',
    subtitle_generate_success: 'Subtitle generated.',
    tool_options: 'Options',
    subtitle_file_required: 'Please choose a .srt or .vtt subtitle file first.',
    subtitle_name: 'Subtitle name',
    subtitle_save_name: 'Save name',
    subtitle_list: 'Subtitle list',
    subtitle_use: 'Use',
    subtitle_active: 'Active',
    subtitle_download: 'Download',
    subtitle_remove: 'Remove',
    subtitle_remove_confirm: 'Remove this subtitle from the list?',
    subtitle_no_items: 'No subtitle items',
    subtitle_search_ph: 'Search in subtitle text',
    subtitle_search_btn: 'Search Subtitle',
    subtitle_search_empty: 'No subtitle match.',
    subtitle_did_you_mean: 'Did you mean',
    subtitle_search_results: 'Subtitle Matches',
    subtitle_jump: 'Jump',
    ocr_hit: 'OCR',
    video_ocr: 'Video OCR',
    video_ocr_interval: 'Interval (sec)',
    video_ocr_lang: 'OCR lang',
    video_ocr_preset: 'Preset',
    video_ocr_preset_general: 'General',
    video_ocr_preset_ticker: 'Ticker (right to left)',
    video_ocr_preset_credits: 'Credits (bottom to top)',
    video_ocr_preset_static: 'Static text',
    ocr_stage_preprocess: 'Pre-process',
    ocr_stage_process: 'Process',
    ocr_stage_postprocess: 'Post-process',
    video_ocr_engine: 'Engine',
    video_ocr_preprocess: 'Preprocess',
    video_ocr_preprocess_off: 'Off',
    video_ocr_preprocess_light: 'Light',
    video_ocr_preprocess_strong: 'Strong',
    video_ocr_blur_filter: 'Blur filter',
    video_ocr_blur_threshold: 'Blur threshold',
    video_ocr_region_mode: 'Ticker mode',
    video_ocr_ticker_height: 'Ticker height (%)',
    video_ocr_engine_paddle: 'PaddleOCR',
    video_ocr_name: 'OCR name',
    video_ocr_name_ph: 'Optional OCR file name',
    video_ocr_advanced: 'Scene-based OCR',
    video_ocr_advanced_help: 'Samples extra frames on scene changes and merges repeated text into longer time ranges.',
    video_ocr_ai_correct: 'Turkish offline correction',
    video_ocr_static_filter: 'Filter static overlays',
    video_ocr_ignore_phrases: 'Ignore phrases',
    video_ocr_ignore_phrases_ph: 'NotebookLM, watermark',
    video_ocr_min_display: 'Min visible (sec)',
    video_ocr_merge_gap: 'Merge gap (sec)',
    video_ocr_extract: 'Extract Text',
    video_ocr_running: 'OCR extraction running...',
    video_ocr_done: 'OCR extraction completed.',
    video_ocr_failed: 'OCR extraction failed.',
    video_ocr_download: 'Download OCR file',
    video_ocr_save_db: 'Save to database',
    video_ocr_saved: 'OCR result saved to database.',
    hide_section: 'Hide',
    video_clips: 'Video Clips',
    move_up: 'Up',
    move_down: 'Down',
    subtitle_rename_success: 'Subtitle name saved.',
    subtitle_job_started: 'Subtitle generation started. Please wait...',
    subtitle_job_failed: 'Subtitle generation failed.',
    subtitle_shortcut_on: 'Subtitles on',
    subtitle_shortcut_off: 'Subtitles off',
    video_tools: 'Video Tools',
    video_tools_title: 'Video Tools',
    video_tools_page_back: 'Back to Main View',
    video_tools_page_subtitle: 'Focused workspace for subtitle, OCR, audio channels and clip tools.',
    pin_video: 'Pin video',
    unpin_video: 'Unpin video',
    close: 'Close',
    fullscreen_overlay_settings: 'Overlay Settings',
    fullscreen_overlay_show_controls: 'Show controls',
    fullscreen_overlay_show_timecode: 'Show timecode',
    fullscreen_overlay_show_subtitles: 'Show subtitles',
    fullscreen_overlay_show_audio_graph: 'Show audio graph',
    subtitle_current: 'Current subtitle',
    subtitle_overlay_enabled: 'Show subtitles'
  },
  tr: {
    app_title: 'MAM Konsolu',
    app_subtitle: 'Dalet benzeri MVP: ingest, metadata, iş akışı, versiyonlar',
    current_user: 'Giriş yapan',
    unknown_user: 'Bilinmeyen kullanıcı',
    logout: 'Çıkış Yap',
    language_label: 'Dil',
    admin_page: 'Yönetim',
    ingest_title: 'Varlık Yükle',
    search_title: 'Ara',
    clear_search_fields: 'Tüm arama alanlarını temizle',
    search_upload_tag: 'ARA / YUKLE',
    assets_title: 'Varlıklar',
    asset_detail_title: 'Detay',
    select_asset: 'Bir varlık seçin.',
    ph_title: 'Başlık',
    title: 'Başlık',
    ph_type: 'Tür',
    type_video: 'Video',
    type_audio: 'Ses',
    type_document: 'Doküman',
    type_photo: 'Fotoğraf',
    type_other: 'Diğer',
    ph_owner: 'Sahip',
    choose_file: 'Dosya Seç',
    ph_tags: 'Etiketler (virgülle)',
    ph_duration_auto: 'Süre otomatik algılanır',
    ph_source: 'Kaynak yolu',
    ph_description: 'Açıklama',
    description: 'Açıklama',
    tags: 'Etiketler',
    ph_query: 'Sorgu',
    ph_ocr_query: 'OCR Arama',
    ph_subtitle_query: 'Altyazı Arama',
    ph_tag: 'Etiket',
    ph_type_simple: 'Tür',
    filter_types: 'Türler',
    list_view: 'Liste Görünümü',
    thumbnail_view: 'Küçük Görsel Görünümü',
    trash_scope: 'Çöp',
    any_status: 'Tüm durumlar',
    trash_active: 'Aktif varlıklar',
    trash_only: 'Çöp kutusu',
    trash_all: 'Hepsi (aktif + çöp)',
    btn_upload_create: 'Yükle ve Oluştur',
    uploading: 'Yükleniyor',
    processing: 'İşleniyor',
    btn_apply_filters: 'Filtreleri Uygula',
    search_result_count: '{count} eslesme',
    no_assets: 'Varlık bulunamadı.',
    playback_source: 'Oynatma kaynağı',
    low_res_proxy: 'Düşük çözünürlük proxy',
    original_file: 'Orijinal dosya',
    proxy_status: 'Proxy durumu',
    proxy_required: 'Proxy hazır değil. Video oynatma, proxy üretimi tamamlanınca kullanılabilir.',
    play: 'Oynat',
    stop: 'Durdur',
    pause: 'Duraklat',
    prev_frame: 'Önceki Kare',
    next_frame: 'Sonraki Kare',
    reverse_frame: 'Geri Kare',
    forward_frame: 'Ileri Kare',
    timecode: 'Zaman Kodu',
    tc: 'TC',
    set_in: 'IN İşaretle',
    set_out: 'OUT İşaretle',
    go_in: 'IN Git',
    go_out: 'OUT Git',
    clear: 'Temizle',
    save_cut: 'Kesimi Kaydet',
    clip_name: 'Klip Adi',
    ph_clip_name: 'Klip adi girin',
    delete_marks: 'İşaretleri Sil',
    delete_cut: 'Kesimi Sil',
    edit_clip: 'Klip Duzenle',
    rename_clip_prompt: 'Yeni klip adini girin',
    edit_in_prompt: 'IN zaman kodunu girin (SS:DD:SS:KK)',
    edit_out_prompt: 'OUT zaman kodunu girin (SS:DD:SS:KK)',
    invalid_timecode: 'Gecersiz zaman kodu formati.',
    invalid_in_out: 'OUT, IN degerinden kucuk olamaz.',
    clip_editor_title: 'Klip Duzenle',
    clip_editor_name: 'Klip Adi',
    clip_editor_in: 'IN Zaman Kodu',
    clip_editor_out: 'OUT Zaman Kodu',
    clip_editor_cancel: 'Iptal',
    clip_editor_save: 'Kaydet',
    jump_to_cut: 'Git',
    play_cut: 'Klip Oynat',
    original_master: 'Orijinal master',
    open_file: 'Dosyayı Aç',
    audio_channels: 'Ses Kanalları',
    group_channel_selection: 'Grup kanal seçimi',
    hide_audio_graph: 'Ses Grafiğini Gizle',
    show_audio_graph: 'Ses Grafiğini Göster',
    open_pdf: 'PDF Aç',
    open_document: 'Dokümanı Aç',
    open_attached: 'Ekli dosyayı aç',
    no_media: 'Eklenmiş medya dosyası yok.',
    no_description: 'Açıklama yok',
    owner: 'Sahip',
    type: 'Tür',
    duration: 'Süre',
    technical_info: 'Teknik Bilgiler',
    tech_loading: 'Teknik bilgiler yükleniyor...',
    tech_unavailable: 'Teknik bilgiler alınamadı.',
    tech_container: 'Kapsayıcı',
    tech_resolution: 'Çözünürlük',
    tech_video_codec: 'Video codec',
    tech_frame_rate: 'Kare hızı',
    tech_pixel_format: 'Piksel formatı',
    tech_audio_codec: 'Ses codec',
    tech_audio_channels: 'Ses kanalı',
    tech_sample_rate: 'Örnekleme hızı',
    tech_duration: 'Süre',
    tech_bitrate: 'Bitrate',
    tech_file_size: 'Dosya boyutu',
    status: 'Durum',
    trash: 'Çöp',
    in_trash: 'Çöpte',
    active: 'Aktif',
    restore: 'Geri Yükle',
    delete_asset: 'Sil',
    delete_permanent: 'Kalıcı Sil',
    move_to_trash_confirm: 'Bu varlık çöpe taşınsın mı?',
    move_to_trash: 'Çöpe Taşı',
    asset_viewer: 'Varlık Görüntüleyici',
    edit_metadata: 'Metadata Düzenle',
    save_metadata: 'Metadata Kaydet',
    metadata_save_failed: 'Metadata kaydetme basarisiz.',
    metadata_edit_locked: 'Metadata düzenleme yetkiniz yok.',
    dublin_core: 'Dublin Core Metadata',
    dc_title: 'DC Baslik',
    dc_creator: 'DC Olusturan',
    dc_subject: 'DC Konu',
    dc_description: 'DC Aciklama',
    dc_publisher: 'DC Yayinci',
    dc_contributor: 'DC Katkida Bulunan',
    dc_date: 'DC Tarih',
    dc_type: 'DC Tur',
    dc_format: 'DC Bicim',
    dc_identifier: 'DC Tanimlayici',
    dc_source: 'DC Kaynak',
    dc_language: 'DC Dil',
    dc_relation: 'DC Iliski',
    dc_coverage: 'DC Kapsam',
    dc_rights: 'DC Haklar',
    workflow_transition: 'İş Akışı Geçişi',
    move_status: 'Durumu Taşıt',
    add_version: 'Versiyon Ekle',
    what_changed: 'Ne değişti',
    create_version: 'Versiyon Oluştur',
    ph_inline_tags: 'etiket1, etiket2',
    ph_version_label: 'v2',
    versions: 'Versiyonlar',
    restore_pdf_version: 'PDF Geri Yükle',
    restore_office_version: 'Office Geri Yükle',
    restore_pdf_original: "Orijinal PDF'ye Dön",
    restore_office_original: "Orijinal Office'e Dön",
    download_pdf_original: "Orijinal PDF'yi İndir",
    download_office_original: "Orijinal Office'i İndir",
    restore_pdf_confirm: 'Bu PDF sürümüne geri dönülsün mü? Mevcut PDF durumu yeni bir restore sürümü olarak kaydedilir.',
    restore_pdf_original_confirm: 'Orijinal PDF snapshotına geri dönülsün mü?',
    restore_office_original_confirm: 'Orijinal Office snapshotına geri dönülsün mü?',
    restore_pdf_unavailable: 'Snapshot yok',
    delete_pdf_version: 'PDF Edit Sürümünü Sil',
    delete_pdf_version_confirm: 'Bu PDF edit sürüm kaydı silinsin mi?',
    delete_version: 'Versiyonu Sil',
    delete_version_confirm: 'Bu versiyon kaydı silinsin mi?',
    edit_version_name: 'Versiyon Adını Düzenle',
    edit_version_name_prompt: 'Yeni versiyon adı',
    edit_version_note_prompt: 'Versiyon notu (opsiyonel)',
    version_actor: 'Yapan',
    version_action: 'İşlem',
    version_change_type: 'Değişiklik Türü',
    action_ingest: 'Yükleme',
    action_manual: 'Manuel',
    action_office_save: 'Office Kaydetme',
    action_pdf_save: 'PDF Kaydetme',
    action_pdf_restore: 'PDF Geri Yükleme',
    action_pdf_restore_original: 'PDF Orijinaline Dönüş',
    action_office_restore: 'Office Geri Yükleme',
    action_office_restore_original: 'Office Orijinaline Dönüş',
    restore_office_confirm: 'Bu Office sürümüne geri dönülsün mü?',
    action_file_replace: 'Dosya Değiştirme',
    pdf_change_redaction: 'Karartma',
    pdf_change_text_insert: 'Yazı Ekleme',
    pdf_change_annotation: 'Not/Şekil',
    pdf_change_mixed: 'Karma',
    pdf_change_unknown: 'Bilinmiyor',
    multi_selected: 'Birden fazla varlık seçildi',
    selected_count: 'Seçili adet',
    bulk_delete_selected: 'Seçilileri Kalıcı Sil',
    bulk_clear_selection: 'Seçimi Temizle',
    bulk_delete_confirm: '{count} seçili varlık kalıcı silinsin mi? Bu işlem geri alınamaz.',
    segment: 'DUR',
    in_label: 'IN',
    out_label: 'OUT',
    trash_confirm: 'Bu varlık kalıcı olarak silinecek. Geri alınamaz.',
    select_media_first: 'Yüklemek için medya dosyası seçin.',
    upload_empty_file: 'Seçilen dosya boş (0 KB). Lütfen tam inmiş/geçerli bir dosya seçin.',
    proxy_failed: 'Proxy açılamadı. Orijinal medyaya geçildi.',
    proxy_fallback_status: 'yedek',
    webaudio_unavailable: 'Bu tarayıcıda Web Audio API desteklenmiyor.',
    audiograph_unsupported: 'Bu tarayıcıda ses grafiği desteklenmiyor.',
    channel_on: 'AÇIK',
    channel_off: 'KAPALI',
    preview_loading: 'Önizleme yükleniyor...',
    preview_not_available: 'Önizleme mevcut değil.',
    preview_not_supported: 'Bu dosya türü için önizleme desteklenmiyor.',
    preview_search_placeholder: 'Önizlemede ara',
    preview_search_empty: 'Eşleşme yok',
    preview_next: 'Sonraki',
    preview_find: 'Bul',
    preview_search_error: 'Arama basarisiz',
    preview_reset: 'Sifirla',
    pdf_preview_unavailable: 'PDF onizleme motoru kullanilamiyor.',
    generate_proxy: 'Proxy Oluştur',
    download_asset: 'İndir',
    download_proxy: "Proxy'yi İndir",
    video_native_audio: 'Yerel video ses modu aktif.',
    subtitles: 'Altyazı',
    subtitle_lang: 'Dil',
    subtitle_none: 'Yüklü altyazı yok',
    subtitle_loaded: 'Altyazı yüklendi',
    subtitle_upload: 'Altyazı Yükle',
    subtitle_generate: 'Altyazı Oluştur',
    subtitle_use_whisperx: 'WhisperX hizalama kullan',
    subtitle_model: 'Model',
    subtitle_model_tiny: 'Tiny',
    subtitle_model_base: 'Base',
    subtitle_model_small: 'Small',
    subtitle_use_zemberek: 'Zemberek düzeltmesi kullan',
    subtitle_audio_stream: 'Ses akışı',
    subtitle_audio_stream_default: 'Varsayılan akış',
    subtitle_audio_channel: 'Kanal',
    subtitle_audio_channel_mix: 'Tüm kanalları karıştır',
    subtitle_upload_success: 'Altyazı yüklendi.',
    subtitle_generate_success: 'Altyazı oluşturuldu.',
    tool_options: 'Opsiyonlar',
    subtitle_file_required: 'Önce bir .srt veya .vtt altyazı dosyası seçin.',
    subtitle_name: 'Altyazı adı',
    subtitle_save_name: 'Adı kaydet',
    subtitle_list: 'Altyazı listesi',
    subtitle_use: 'Kullan',
    subtitle_active: 'Aktif',
    subtitle_download: 'Indir',
    subtitle_remove: 'Sil',
    subtitle_remove_confirm: 'Bu altyazi listeden silinsin mi?',
    subtitle_no_items: 'Altyazı yok',
    subtitle_search_ph: 'Altyazıda ara',
    subtitle_search_btn: 'Altyazıda Ara',
    subtitle_search_empty: 'Altyazıda eşleşme yok.',
    subtitle_did_you_mean: 'Bunu mu demek istediniz',
    subtitle_search_results: 'Altyazı Eşleşmeleri',
    subtitle_jump: 'Git',
    ocr_hit: 'OCR',
    video_ocr: 'Video OCR',
    video_ocr_interval: 'Aralık (sn)',
    video_ocr_lang: 'OCR dil',
    video_ocr_preset: 'Preset',
    video_ocr_preset_general: 'Genel',
    video_ocr_preset_ticker: 'Ticker (sağdan sola)',
    video_ocr_preset_credits: 'Credits (aşağıdan yukarı)',
    video_ocr_preset_static: 'Sabit yazı',
    ocr_stage_preprocess: 'Ön İşlem',
    ocr_stage_process: 'Karakter Algılama',
    ocr_stage_postprocess: 'Son İşlem',
    video_ocr_engine: 'Motor',
    video_ocr_preprocess: 'Ön işlem',
    video_ocr_preprocess_off: 'Kapalı',
    video_ocr_preprocess_light: 'Hafif',
    video_ocr_preprocess_strong: 'Güçlü',
    video_ocr_blur_filter: 'Bulanıklık filtresi',
    video_ocr_blur_threshold: 'Bulanıklık eşiği',
    video_ocr_region_mode: 'Ticker modu',
    video_ocr_ticker_height: 'Ticker yüksekliği (%)',
    video_ocr_engine_paddle: 'PaddleOCR',
    video_ocr_name: 'OCR adı',
    video_ocr_name_ph: 'Opsiyonel OCR dosya adı',
    video_ocr_advanced: 'Sahne tabanlı OCR',
    video_ocr_advanced_help: 'Sahne değişimlerinde ek kare örnekler ve tekrar eden metni daha uzun süre aralıklarında birleştirir.',
    video_ocr_ai_correct: 'Türkçe çevrimdışı düzeltme',
    video_ocr_static_filter: 'Sabit yazıları filtrele',
    video_ocr_ignore_phrases: 'Hariç kelimeler',
    video_ocr_ignore_phrases_ph: 'NotebookLM, filigran',
    video_ocr_min_display: 'Min görünme (sn)',
    video_ocr_merge_gap: 'Birleşme aralığı (sn)',
    video_ocr_extract: 'Metni Çıkar',
    video_ocr_running: 'OCR çıkarımı çalışıyor...',
    video_ocr_done: 'OCR çıkarımı tamamlandı.',
    video_ocr_failed: 'OCR çıkarımı başarısız.',
    video_ocr_download: 'OCR dosyasını indir',
    video_ocr_save_db: 'Veritabanına kaydet',
    video_ocr_saved: 'OCR sonucu veritabanına kaydedildi.',
    hide_section: 'Gizle',
    video_clips: 'Video Klipler',
    move_up: 'Yukari',
    move_down: 'Asagi',
    subtitle_rename_success: 'Altyazı adı kaydedildi.',
    subtitle_job_started: 'Altyazı üretimi başladı. Lütfen bekleyin...',
    subtitle_job_failed: 'Altyazı üretimi başarısız.',
    subtitle_shortcut_on: 'Altyazı açık',
    subtitle_shortcut_off: 'Altyazı kapalı',
    video_tools: 'Video Araçları',
    video_tools_title: 'Video Araçları',
    video_tools_page_back: 'Ana Görünüme Dön',
    video_tools_page_subtitle: 'Altyazı, OCR, ses kanalları ve klip araçları için odaklı çalışma alanı.',
    pin_video: 'Videoyu sabitle',
    unpin_video: 'Video sabitlemeyi kaldır',
    close: 'Kapat',
    fullscreen_overlay_settings: 'Overlay Ayarları',
    fullscreen_overlay_show_controls: 'Kontrolleri göster',
    fullscreen_overlay_show_timecode: 'Timecode göster',
    fullscreen_overlay_show_subtitles: 'Altyazı göster',
    fullscreen_overlay_show_audio_graph: 'Ses grafiği göster',
    subtitle_current: 'Mevcut altyazı',
    subtitle_overlay_enabled: 'Altyazı göster'
  }
};
let currentLang = localStorage.getItem(LOCAL_LANG) || 'en';

async function loadI18nFile() {
  try {
    const response = await fetch(I18N_PATH, { cache: 'no-cache' });
    if (!response.ok) return;
    const external = await response.json();
    if (!external || typeof external !== 'object') return;
    if (external.en && typeof external.en === 'object') {
      i18n.en = { ...i18n.en, ...external.en };
    }
    if (external.tr && typeof external.tr === 'object') {
      i18n.tr = { ...i18n.tr, ...external.tr };
    }
  } catch (_error) {
    // Keep bundled translations if file is missing or invalid.
  }
}

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function toStrictBool(value, fallback = false) {
  if (value == null) return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return Boolean(fallback);
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off', 'null', 'undefined'].includes(raw)) return false;
  return Boolean(fallback);
}

function tf(key, vars = {}) {
  let text = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return text;
}

commonModule = window.createMainCommonModule({
  t,
  api: (...args) => api(...args),
  currentLangRef: {
    get: () => currentLang
  },
  subtitleOverlayEnabledByAsset,
  PLAYER_FPS,
  selectedAssetIdRef: {
    get: () => selectedAssetId
  },
  subtitleStyleRef: {
    get: () => subtitleStyleSettings
  },
  currentSubtitleQueryRef: {
    get: () => currentSubtitleQuery
  }
});

function escapeHtml(value) { return commonModule.escapeHtml(value); }
function escapeRegExp(value) { return commonModule.escapeRegExp(value); }
function renderPdfChangeKindLabel(version) { return commonModule.renderPdfChangeKindLabel(version); }
function cleanVersionNoteText(note) { return commonModule.cleanVersionNoteText(note); }
function findMatchRanges(text, query) { return commonModule.findMatchRanges(text, query); }
function highlightTextByRanges(text, ranges) { return commonModule.highlightTextByRanges(text, ranges); }
function serializeForm(form) { return commonModule.serializeForm(form); }
function highlightSuggestText(text, query) { return commonModule.highlightSuggestText(text, query); }
function getSubtitleOverlayEnabled(assetId, fallback = false) { return commonModule.getSubtitleOverlayEnabled(assetId, fallback); }
function syncSubtitleOverlayInOpenPlayers(asset) { return commonModule.syncSubtitleOverlayInOpenPlayers(asset); }
function initCustomSubtitleOverlay(mediaEl, asset, root = document) { return commonModule.initCustomSubtitleOverlay(mediaEl, asset, root); }
function scheduleNativeSubtitleCuePosition(mediaEl) { return commonModule.scheduleNativeSubtitleCuePosition(mediaEl); }
async function readFileAsBase64(file) { return commonModule.readFileAsBase64(file); }
function getFileExtension(asset) { return commonModule.getFileExtension(asset); }
function isVideo(asset) { return commonModule.isVideo(asset); }
function isAudio(asset) { return commonModule.isAudio(asset); }
function isImage(asset) { return commonModule.isImage(asset); }
function isPdf(asset) { return commonModule.isPdf(asset); }
function isDocument(asset) { return commonModule.isDocument(asset); }
function isOfficeDocument(asset) { return commonModule.isOfficeDocument(asset); }
function isTextPreviewable(asset) { return commonModule.isTextPreviewable(asset); }
function thumbFallbackForAsset(asset) { return commonModule.thumbFallbackForAsset(asset); }
function documentSearchControls() { return commonModule.documentSearchControls(); }
function formatDate(value) { return commonModule.formatDate(value); }
function formatDuration(seconds) { return commonModule.formatDuration(seconds); }
async function loadAssetTechnicalInfo(asset) { return commonModule.loadAssetTechnicalInfo(asset); }
function extractDcMetadataFromPayload(payload) { return commonModule.extractDcMetadataFromPayload(payload); }
function foldSearchText(value) { return commonModule.foldSearchText(value); }
function effectiveSearchHighlightClass(query, highlightQuery, fuzzyUsed = false) { return commonModule.effectiveSearchHighlightClass(query, highlightQuery, fuzzyUsed); }
function highlightMatch(value, query, markClass) { return commonModule.highlightMatch(value, query, markClass); }
function dcHighlightSnippet(asset, query) { return commonModule.dcHighlightSnippet(asset, query); }
function metadataHighlightSnippet(asset, query) { return commonModule.metadataHighlightSnippet(asset, query); }
function tagHighlightSnippet(asset, query) { return commonModule.tagHighlightSnippet(asset, query); }
function clipHighlightSnippet(asset, query) { return commonModule.clipHighlightSnippet(asset, query); }
function buildInlineFieldMatch(value, query) { return commonModule.buildInlineFieldMatch(value, query); }
function tagColorStyle(tag) { return commonModule.tagColorStyle(tag); }
function assetTagChipStyle(asset) { return commonModule.assetTagChipStyle(asset); }
function secondsToTimecode(timeSeconds, fps) { return commonModule.secondsToTimecode(timeSeconds, fps); }
function parseTimecodeInput(value, fps) { return commonModule.parseTimecodeInput(value, fps); }
function subtitleTrackMarkup(asset) { return commonModule.subtitleTrackMarkup(asset); }

searchSuggestModule = window.createMainSearchSuggestModule({
  api,
  t,
  escapeHtml,
  highlightMatch,
  serializeForm,
  assetTypeFilters,
  searchForm,
  searchQueryInput,
  searchSuggestList,
  ocrQueryInput,
  ocrSuggestList,
  subtitleQueryInput,
  subtitleSuggestList,
  getActiveOcrQueryInput,
  setSingleSelection,
  openAsset,
  loadAssets,
  updateClearSearchButtonState
});

function useVidstackPlayerUI() {
  return String(playerUiMode || 'vidstack') === 'vidstack';
}

function useMpegDashPlayerUI() {
  return String(playerUiMode || 'vidstack') === 'mpegdash';
}

function useCustomLikeTimelineUI() {
  return useVidstackPlayerUI() || useMpegDashPlayerUI();
}

function normalizeClientSubtitleStyle(style = {}) {
  const input = style && typeof style === 'object' ? style : {};
  const hex = (value, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : fallback);
  const clamp = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };
  return {
    customOverlayEnabled: Object.prototype.hasOwnProperty.call(input, 'customOverlayEnabled') ? Boolean(input.customOverlayEnabled) : true,
    bottomOffset: clamp(input.bottomOffset, 0, 240, 56),
    fontSize: clamp(input.fontSize, 12, 64, 24),
    textColor: hex(input.textColor, '#ffffff'),
    backgroundColor: hex(input.backgroundColor, '#000000'),
    backgroundOpacity: clamp(input.backgroundOpacity, 0, 1, 0.72),
    horizontalPadding: clamp(input.horizontalPadding, 0, 80, 16),
    maxWidth: clamp(input.maxWidth, 35, 100, 82)
  };
}

function hexToRgb(value) {
  const raw = String(value || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '0, 0, 0';
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16)
  ].join(', ');
}

function applySubtitleStyleSettings() {
  const style = normalizeClientSubtitleStyle(subtitleStyleSettings);
  subtitleStyleSettings = style;
  const root = document.documentElement;
  root.style.setProperty('--mam-subtitle-font-size', `${style.fontSize}px`);
  root.style.setProperty('--mam-subtitle-text-color', style.textColor);
  root.style.setProperty('--mam-subtitle-background', `rgba(${hexToRgb(style.backgroundColor)}, ${style.backgroundOpacity})`);
  root.style.setProperty('--mam-subtitle-horizontal-padding', `${style.horizontalPadding}px`);
  root.style.setProperty('--mam-subtitle-max-width', `${style.maxWidth}%`);
  root.style.setProperty('--mam-subtitle-bottom-offset', `${style.bottomOffset}px`);
  document.body.classList.toggle('subtitle-custom-overlay-enabled', style.customOverlayEnabled);
}

async function loadUiSettings() {
  try {
    const settings = await api('/api/ui-settings');
    const mode = String(settings?.playerUiMode || 'vidstack').trim().toLowerCase();
    playerUiMode = (mode === 'vidstack' || mode === 'mpegdash') ? mode : 'vidstack';
    subtitleStyleSettings = normalizeClientSubtitleStyle(settings?.subtitleStyle || {});
  } catch (_error) {
    playerUiMode = 'vidstack';
    subtitleStyleSettings = normalizeClientSubtitleStyle({});
  }
  applySubtitleStyleSettings();
}

function applyStaticI18n() {
  document.title = t('app_title');
  document.documentElement.lang = currentLang === 'tr' ? 'tr' : 'en';
  document.body.classList.toggle('lang-tr', currentLang === 'tr');
  document.body.classList.toggle('lang-en', currentLang !== 'tr');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });
  if (currentUserBtn && !currentUserBtn.dataset.value) {
    currentUserBtn.textContent = t('unknown_user');
  }
  if (assetViewThumbBtn) {
    assetViewThumbBtn.removeAttribute('title');
    assetViewThumbBtn.setAttribute('aria-label', t('thumbnail_view'));
    assetViewThumbBtn.dataset.tooltip = t('thumbnail_view');
  }
  if (assetViewListBtn) {
    assetViewListBtn.removeAttribute('title');
    assetViewListBtn.setAttribute('aria-label', t('list_view'));
    assetViewListBtn.dataset.tooltip = t('list_view');
  }
}

function applyAssetViewModeUI() {
  const isList = assetViewMode === 'list';
  assetGrid.classList.toggle('list-view', isList);
  assetViewListBtn?.classList.toggle('active', isList);
  assetViewThumbBtn?.classList.toggle('active', !isList);
}

async function loadCurrentUser() {
  if (!currentUserBtn) return;
  try {
    const me = await api('/api/me');
    const username = String(me.username || '').trim();
    const displayName = String(me.displayName || '').trim();
    const email = String(me.email || '').trim();
    const canAccessAdmin = toStrictBool(me.canAccessAdmin, toStrictBool(me.isAdmin, false));
    const canAccessTextAdmin = toStrictBool(me.canAccessTextAdmin, canAccessAdmin);
    const canEditMetadata = toStrictBool(me.canEditMetadata, false);
    const canEditOffice = toStrictBool(me.canEditOffice, false);
    const canDeleteAssets = toStrictBool(me.canDeleteAssets, toStrictBool(me.isAdmin, false));
    const canUsePdfAdvancedTools = toStrictBool(me.canUsePdfAdvancedTools, toStrictBool(me.isAdmin, false));
    currentUserCanAccessAdmin = canAccessAdmin;
    currentUserCanEditMetadata = canEditMetadata;
    currentUserCanEditOffice = canEditOffice;
    currentUserCanDeleteAssets = canDeleteAssets;
    currentUserCanUsePdfAdvancedTools = canUsePdfAdvancedTools;
    currentOfficeEditorProvider = ['onlyoffice', 'libreoffice'].includes(String(me.officeEditorProvider || '').trim().toLowerCase())
      ? String(me.officeEditorProvider || '').trim().toLowerCase()
      : 'none';
    currentUsername = username.toLowerCase();
    const value = displayName || username || (email.includes('@') ? email.split('@')[0] : '') || t('unknown_user');
    currentUserBtn.dataset.value = value;
    currentUserBtn.textContent = value;
    currentUserBtn.title = value;
    if (adminMenuLink) {
      adminMenuLink.classList.toggle('hidden', !(canAccessAdmin || canAccessTextAdmin));
    }
  } catch (_error) {
    currentUserCanAccessAdmin = false;
    currentUserCanEditMetadata = false;
    currentUserCanEditOffice = false;
    currentUserCanDeleteAssets = false;
    currentUserCanUsePdfAdvancedTools = false;
    currentOfficeEditorProvider = 'none';
    currentUserBtn.dataset.value = '';
    currentUserBtn.textContent = t('unknown_user');
    currentUserBtn.title = t('unknown_user');
    if (adminMenuLink) adminMenuLink.classList.add('hidden');
  }
}

function workflowLabel(status) {
  const map = {
    Ingested: currentLang === 'tr' ? 'Yüklendi' : 'Ingested',
    QC: 'QC',
    Approved: currentLang === 'tr' ? 'Onaylandı' : 'Approved',
    Published: currentLang === 'tr' ? 'Yayında' : 'Published',
    Archived: currentLang === 'tr' ? 'Arşivlendi' : 'Archived'
  };
  return map[status] || status;
}

function loadPanelPrefs() {
  try {
    const sizes = JSON.parse(localStorage.getItem(LOCAL_PANEL_SIZE) || '{}');
    panelSizes = { ...panelSizes, ...sizes };
  } catch (_e) {
    // Keep defaults if local storage has invalid JSON.
  }
}

function loadPanelVisibilityPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_PANEL_VIS) || '{}');
    panelVisibility = {
      panelIngest: stored.panelIngest !== false,
      panelAssets: stored.panelAssets !== false,
      panelDetail: stored.panelDetail !== false
    };
  } catch (_e) {
    panelVisibility = { panelIngest: true, panelAssets: true, panelDetail: true };
  }
}

function savePanelPrefs() {
  localStorage.setItem(LOCAL_PANEL_SIZE, JSON.stringify(panelSizes));
}

function savePanelVisibilityPrefs() {
  localStorage.setItem(LOCAL_PANEL_VIS, JSON.stringify(panelVisibility));
}

function isPanelVisible(panelId) {
  return panelVisibility[panelId] !== false;
}

function setPanelVisible(panelId, nextVisible) {
  panelVisibility[panelId] = Boolean(nextVisible);

  if (!isPanelVisible('panelIngest') && !isPanelVisible('panelAssets') && !isPanelVisible('panelDetail')) {
    panelVisibility.panelAssets = true;
  }

  applyPanelLayout();
  if (!isVideoToolsPageMode) savePanelVisibilityPrefs();
}

function getEffectiveDetailMinPx() {
  return Math.max(DETAIL_PANEL_BASE_MIN_PX, Math.round(Number(dynamicDetailMinPx) || 0));
}

function ensureDetailPanelMinWidth(requiredPx) {
  const targetPx = Math.max(getEffectiveDetailMinPx(), Math.round(Number(requiredPx) || 0));
  dynamicDetailMinPx = targetPx;
  if (panelDetail) panelDetail.style.minWidth = `${targetPx}px`;
  if (!isPanelVisible('panelDetail')) return;
  const currentPx = Math.round(panelDetail.getBoundingClientRect().width || 0);
  if (currentPx >= targetPx - 1) {
    applyPanelLayout();
    return;
  }

  const assetsVisible = isPanelVisible('panelAssets');
  const ingestVisible = isPanelVisible('panelIngest');
  const donorId = assetsVisible ? 'panelAssets' : (ingestVisible ? 'panelIngest' : '');
  if (!donorId) {
    applyPanelLayout();
    return;
  }

  const donorEl = donorId === 'panelAssets' ? panelAssets : panelIngest;
  const donorStartPx = Math.round(donorEl?.getBoundingClientRect().width || 0);
  const detailStartPx = currentPx;
  const donorStartFr = Number(panelSizes[donorId]) || 1;
  const detailStartFr = Number(panelSizes.panelDetail) || 1;
  const pairWidth = donorStartPx + detailStartPx;
  const pairFr = donorStartFr + detailStartFr;
  const unitPx = pairWidth > 0 && pairFr > 0 ? (pairWidth / pairFr) : 0;
  if (!unitPx) {
    applyPanelLayout();
    return;
  }

  const needPx = Math.max(0, targetPx - detailStartPx);
  if (needPx <= 0) {
    applyPanelLayout();
    return;
  }

  const donorMinFr = donorId === 'panelIngest'
    ? Math.max(0.45, 235 / unitPx)
    : 0.45;
  const targetMinFr = Math.max(0.22, targetPx / unitPx);
  let nextDonorFr = donorStartFr - (needPx / unitPx);
  let nextDetailFr = detailStartFr + (needPx / unitPx);
  if (nextDonorFr < donorMinFr) {
    const shortage = donorMinFr - nextDonorFr;
    nextDonorFr = donorMinFr;
    nextDetailFr = Math.max(targetMinFr, nextDetailFr - shortage);
  }
  panelSizes[donorId] = nextDonorFr;
  panelSizes.panelDetail = Math.max(targetMinFr, nextDetailFr);
  applyPanelLayout();
}

function resetDetailPanelDynamicMinWidth() {
  dynamicDetailMinPx = DETAIL_PANEL_BASE_MIN_PX;
  if (panelDetail) panelDetail.style.minWidth = `${DETAIL_PANEL_BASE_MIN_PX}px`;
  applyPanelLayout();
}

function measureClipsPanelRequiredWidth(root = document) {
  const clipsSection = root.querySelector('.collapsible-section[data-section="clips"]');
  if (!clipsSection || clipsSection.classList.contains('collapsed')) return DETAIL_PANEL_BASE_MIN_PX;
  const head = clipsSection.querySelector('.collapsible-head');
  const body = clipsSection.querySelector('.collapsible-body');
  const markSummary = clipsSection.querySelector('#markSummary');
  const cutsList = clipsSection.querySelector('#cutsList');
  const labelRow = clipsSection.querySelector('.cut-label-row');
  const actionsRow = clipsSection.querySelector('.cut-actions');
  const widths = [
    clipsSection.scrollWidth,
    head?.scrollWidth || 0,
    body?.scrollWidth || 0,
    markSummary?.scrollWidth || 0,
    cutsList?.scrollWidth || 0,
    labelRow?.scrollWidth || 0,
    actionsRow?.scrollWidth || 0
  ];
  return Math.max(DETAIL_PANEL_BASE_MIN_PX, Math.ceil(Math.max(...widths) + 28));
}

function applyPanelLayout() {
  const ingest = Math.max(0.34, Number(panelSizes.panelIngest) || 1);
  const assets = Math.max(0.45, Number(panelSizes.panelAssets) || 1);
  const detail = Math.max(0.22, Number(panelSizes.panelDetail) || 1);
  const ingestVisible = isPanelVisible('panelIngest');
  const assetsVisible = isPanelVisible('panelAssets');
  const detailVisible = isPanelVisible('panelDetail');
  const detailOnlyMode = detailVisible && !ingestVisible && !assetsVisible;
  const assetsOnlyMode = assetsVisible && !ingestVisible && !detailVisible;

  if (detailOnlyMode) {
    layout.style.gridTemplateColumns = '0px 0px 0px 0px 1fr';
  } else if (assetsOnlyMode) {
    layout.style.gridTemplateColumns = '0px 0px 1fr 0px 0px';
  } else {
    layout.style.gridTemplateColumns = `${ingestVisible ? `${ingest}fr` : '0px'} ${ingestVisible && assetsVisible ? '5px' : '0px'} ${assetsVisible ? `${assets}fr` : '0px'} ${assetsVisible && detailVisible ? '5px' : '0px'} ${detailVisible ? `${detail}fr` : '0px'}`;
  }
  panelIngest.style.display = ingestVisible ? '' : 'none';
  panelAssets.style.display = assetsVisible ? '' : 'none';
  panelDetail.style.display = detailVisible ? '' : 'none';
  panelDetail.style.minWidth = detailVisible ? `${getEffectiveDetailMinPx()}px` : '0px';
  layout.classList.toggle('detail-only-mode', detailOnlyMode);

  splitterTabs.forEach((tab) => {
    const panelId = tab.dataset.showPanel;
    if (!panelId) return;
    tab.style.display = isPanelVisible(panelId) ? 'none' : 'inline-flex';
  });
}

function initPanelSplitters() {
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const MIN_INGEST_PX = 235;
  const MIN_ASSETS_PX = 290;
  const minSize = 0.45;
  const minDetail = 0.22;

  const clampPair = (a, b, minA = minSize, minB = minSize) => {
    if (a < minA) {
      b -= minA - a;
      a = minA;
    }
    if (b < minB) {
      a -= minB - b;
      b = minB;
    }
    return [Math.max(minA, a), Math.max(minB, b)];
  };

  splitters.forEach((splitter) => {
    splitter.addEventListener('pointerdown', (event) => {
      if (isMobile()) return;
      if (event.target.closest('.splitter-tab')) return;
      event.preventDefault();

      const kind = splitter.dataset.splitter;
      const ingestVisible = isPanelVisible('panelIngest');
      const assetsVisible = isPanelVisible('panelAssets');
      const detailVisible = isPanelVisible('panelDetail');
      const directMode = !assetsVisible && ingestVisible && detailVisible;

      if (!directMode) {
        if (kind === 'left' && !(ingestVisible && assetsVisible)) return;
        if (kind === 'right' && !(assetsVisible && detailVisible)) return;
      }

      const startX = event.clientX;
      const ingestStart = Number(panelSizes.panelIngest) || 1;
      const assetsStart = Number(panelSizes.panelAssets) || 1;
      const detailStart = Number(panelSizes.panelDetail) || 1;
      const pairWidth = directMode
        ? (panelIngest.clientWidth + panelDetail.clientWidth)
        : (kind === 'left'
          ? (panelIngest.clientWidth + panelAssets.clientWidth)
          : (panelAssets.clientWidth + panelDetail.clientWidth));
      const pairFr = directMode
        ? (ingestStart + detailStart)
        : (kind === 'left'
          ? (ingestStart + assetsStart)
          : (assetsStart + detailStart));
      const unitPx = pairWidth / pairFr;
      if (!unitPx || unitPx <= 0) return;

      const onMove = (moveEvent) => {
        const deltaPx = moveEvent.clientX - startX;
        const deltaFr = deltaPx / unitPx;

        if (directMode) {
          let nextIngest = ingestStart + deltaFr;
          let nextDetail = detailStart - deltaFr;
          const minIngest = Math.max(minSize, MIN_INGEST_PX / unitPx);
          const minDetailFr = Math.max(minDetail, getEffectiveDetailMinPx() / unitPx);
          [nextIngest, nextDetail] = clampPair(nextIngest, nextDetail, minIngest, minDetailFr);
          panelSizes.panelIngest = nextIngest;
          panelSizes.panelDetail = nextDetail;
        } else if (kind === 'left') {
          let nextIngest = ingestStart + deltaFr;
          let nextAssets = assetsStart - deltaFr;
          const minIngest = Math.max(minSize, MIN_INGEST_PX / unitPx);
          const minAssets = Math.max(minSize, MIN_ASSETS_PX / unitPx);
          [nextIngest, nextAssets] = clampPair(nextIngest, nextAssets, minIngest, minAssets);
          panelSizes.panelIngest = nextIngest;
          panelSizes.panelAssets = nextAssets;
        } else {
          let nextAssets = assetsStart + deltaFr;
          let nextDetail = detailStart - deltaFr;
          const minAssets = Math.max(minSize, MIN_ASSETS_PX / unitPx);
          const minDetailFr = Math.max(minDetail, getEffectiveDetailMinPx() / unitPx);
          [nextAssets, nextDetail] = clampPair(nextAssets, nextDetail, minAssets, minDetailFr);
          panelSizes.panelAssets = nextAssets;
          panelSizes.panelDetail = nextDetail;
        }

        applyPanelLayout();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        savePanelPrefs();
      };

      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const textBody = await response.text();
  let parsedBody = null;
  if (textBody) {
    try {
      parsedBody = JSON.parse(textBody);
    } catch (_error) {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const fallback = textBody
      ? textBody.replace(/\s+/g, ' ').trim().slice(0, 220)
      : '';
    const errMsg = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody.error
      : '';
    throw new Error(errMsg || fallback || 'Request failed');
  }

  if (!textBody) return {};
  if (parsedBody !== null) return parsedBody;
  return {};
}

function explainApiError(error) {
  const message = String(error?.message || 'Request failed');
  if (/missing api token/i.test(message)) {
    return `${message}. OAuth aktifken arayuzu dogrudan app portundan acmayin; http://localhost:3000/ uzerinden girin.`;
  }
  return message;
}

function showAssetLoadError(error) {
  const message = explainApiError(error);
  assetGrid.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

async function deleteApi(path) {
  const response = await fetch(path, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
}

const dialogsModule = window.createMainDialogsModule({
  t,
  escapeHtml
});

function showUploadProxyDecisionModal(error) {
  return dialogsModule.showUploadProxyDecisionModal(error);
}

function openClipEditorDialog(initial) {
  return dialogsModule.openClipEditorDialog(initial);
}

function openVersionEditDialog(initial) {
  return dialogsModule.openVersionEditDialog(initial);
}

function openVersionDeleteDialog() {
  return dialogsModule.openVersionDeleteDialog();
}

function openTimecodeJumpDialog(initialTc = '') {
  return dialogsModule.openTimecodeJumpDialog(initialTc);
}

ingestModule = window.createMainIngestModule({
  ingestForm,
  mediaFileInput,
  mediaFileBtn,
  mediaFileName,
  uploadProgressWrap,
  uploadProgressBar,
  uploadProgressText,
  uploadProgressSpinner,
  t,
  readFileAsBase64,
  showUploadProxyDecisionModal,
  currentAssetsRef: {
    get: () => currentAssets
  },
  loadAssets: (...args) => loadAssets(...args)
});

function setUploadProgress(percent, label = '') { return ingestModule.setUploadProgress(percent, label); }
function hideUploadProgress() { return ingestModule.hideUploadProgress(); }
function uploadAssetWithProgress(payload, onProgress) { return ingestModule.uploadAssetWithProgress(payload, onProgress); }
function formatIngestWarningMessage(created) { return ingestModule.formatIngestWarningMessage(created); }
function localizeUploadWarning(warning) { return ingestModule.localizeUploadWarning(warning); }
function localizeUploadRetryHint(code, fallback = '') { return ingestModule.localizeUploadRetryHint(code, fallback); }
async function waitUntilAssetVisible(assetId, maxAttempts = 8) { return ingestModule.waitUntilAssetVisible(assetId, maxAttempts); }
async function detectDurationSeconds(file) { return ingestModule.detectDurationSeconds(file); }
function initIngestHandlers() { return ingestModule.initIngestHandlers(); }

const assetBrowserModule = window.createMainAssetBrowserModule({
  api,
  assetGrid,
  assetDetail,
  panelDetail,
  searchQueryInput,
  ocrQueryInput,
  currentUserCanDeleteAssetsRef: {
    get: () => currentUserCanDeleteAssets
  },
  currentAssetsRef: {
    get: () => currentAssets
  },
  selectedAssetIdsRef: {
    get: () => selectedAssetIds
  },
  selectedAssetIdRef: {
    get: () => selectedAssetId,
    set: (next) => { selectedAssetId = next; }
  },
  lastSelectedAssetIdRef: {
    get: () => lastSelectedAssetId,
    set: (next) => { lastSelectedAssetId = next; }
  },
  activePlayerCleanupRef: {
    get: () => activePlayerCleanup,
    set: (next) => { activePlayerCleanup = next; }
  },
  activeDetailPinCleanupRef: {
    get: () => activeDetailPinCleanup,
    set: (next) => { activeDetailPinCleanup = next; }
  },
  searchStateRef: {
    get currentSearchDidYouMean() { return currentSearchDidYouMean; },
    get currentSearchQuery() { return currentSearchQuery; },
    get currentSearchFuzzyUsed() { return currentSearchFuzzyUsed; },
    get currentOcrDidYouMean() { return currentOcrDidYouMean; },
    get currentOcrQuery() { return currentOcrQuery; },
    get currentOcrFuzzyUsed() { return currentOcrFuzzyUsed; },
    get currentSearchHighlightQuery() { return currentSearchHighlightQuery; },
    get currentOcrHighlightQuery() { return currentOcrHighlightQuery; },
    get currentSubtitleQuery() { return currentSubtitleQuery; }
  },
  t,
  escapeHtml,
  applyAssetViewModeUI,
  highlightMatch,
  metadataHighlightSnippet,
  dcHighlightSnippet,
  tagHighlightSnippet,
  clipHighlightSnippet,
  effectiveSearchHighlightClass,
  foldSearchText,
  workflowLabel,
  formatDuration,
  formatDate,
  secondsToTimecode,
  tagColorStyle,
  thumbFallbackForAsset,
  isImage,
  isVideo,
  isAudio,
  isDocument,
  PLAYER_FPS,
  loadAssets: (...args) => loadAssets(...args),
  setPanelVideoToolsButtonState
});

function thumbnailMarkup(asset) {
  return assetBrowserModule.thumbnailMarkup(asset);
}

function assetTypeIcon(asset) {
  return assetBrowserModule.assetTypeIcon(asset);
}

function buildAssetSearchNoticeHtml() {
  return assetBrowserModule.buildAssetSearchNoticeHtml();
}

function renderAssets(assets) {
  return assetBrowserModule.renderAssets(assets);
}

function setSingleSelection(assetId) {
  return assetBrowserModule.setSingleSelection(assetId);
}

function addShiftRangeSelection(assetId) {
  return assetBrowserModule.addShiftRangeSelection(assetId);
}

function toggleMultiSelection(assetId) {
  return assetBrowserModule.toggleMultiSelection(assetId);
}

function resetSelectedAssetDetailPanel() {
  return assetBrowserModule.resetSelectedAssetDetailPanel();
}

const mediaViewerModule = window.createMainMediaViewerModule({
  t,
  escapeHtml,
  currentLangRef: {
    get: () => currentLang
  },
  currentUserCanUsePdfAdvancedToolsRef: {
    get: () => currentUserCanUsePdfAdvancedTools
  },
  currentOfficeEditorProviderRef: {
    get: () => currentOfficeEditorProvider
  },
  detailVideoPinnedRef: {
    get: () => detailVideoPinned
  },
  isVideo: (asset) => isVideo(asset),
  isAudio: (asset) => isAudio(asset),
  isImage: (asset) => isImage(asset),
  isDocument: (asset) => isDocument(asset),
  isPdf: (asset) => isPdf(asset),
  isOfficeDocument: (asset) => isOfficeDocument(asset),
  thumbFallbackForAsset: (asset) => thumbFallbackForAsset(asset),
  subtitleTrackMarkup: (asset) => subtitleTrackMarkup(asset),
  getSubtitleOverlayEnabled,
  useCustomLikeTimelineUI,
  useMpegDashPlayerUI
});

function mediaViewer(asset, options = {}) {
  return mediaViewerModule.mediaViewer(asset, options);
}

function videoToolsPageMarkup(asset) {
  return mediaViewerModule.videoToolsPageMarkup(asset);
}

detailModule = window.createMainDetailModule({
  t,
  tf,
  api,
  deleteApi,
  escapeHtml,
  isVideo,
  isOfficeDocument,
  mediaViewer,
  tagColorStyle,
  assetTagChipStyle,
  highlightMatch,
  dcHighlightSnippet,
  buildInlineFieldMatch,
  workflowLabel,
  effectiveSearchHighlightClass,
  renderPdfChangeKindLabel,
  cleanVersionNoteText,
  formatDate,
  currentUserCanUsePdfAdvancedTools: () => currentUserCanUsePdfAdvancedTools,
  currentUserCanEditOffice: () => currentUserCanEditOffice,
  currentUserCanAccessAdmin: () => currentUserCanAccessAdmin,
  currentUserCanDeleteAssets: () => currentUserCanDeleteAssets,
  currentUserCanEditMetadata: () => currentUserCanEditMetadata,
  currentUsername: () => currentUsername,
  currentSearchQuery: () => currentSearchQuery,
  currentSearchHighlightQuery: () => currentSearchHighlightQuery,
  currentSearchFuzzyUsed: () => currentSearchFuzzyUsed,
  currentAssets: () => currentAssets,
  selectedAssetIds: () => selectedAssetIds,
  selectedAssetId: () => selectedAssetId,
  assetDetail: () => assetDetail,
  panelDetail: () => panelDetail,
  detailVideoPinned: () => detailVideoPinned,
  setDetailVideoPinned: (value) => { detailVideoPinned = Boolean(value); },
  setPanelVisible,
  resetDetailPanelDynamicMinWidth,
  setSingleSelection,
  renderAssets,
  setPanelVideoToolsButtonState,
  loadAssets,
  openAsset,
  activePlayerCleanupRef: {
    get: () => activePlayerCleanup,
    set: (value) => { activePlayerCleanup = value; }
  },
  activeDetailPinCleanupRef: {
    get: () => activeDetailPinCleanup,
    set: (value) => { activeDetailPinCleanup = value; }
  }
});

function getVersionSectionAccess(asset) { return detailModule.getVersionSectionAccess(asset); }
function renderVersionRow(asset, version, access, interactive) { return detailModule.renderVersionRow(asset, version, access, interactive); }
async function refreshAssetDetail(assetId, workflow) { return detailModule.refreshAssetDetail(assetId, workflow); }
function detailMarkup(asset, workflow) { return detailModule.detailMarkup(asset, workflow); }
async function openMultiSelectionDetail() { return detailModule.openMultiSelectionDetail(); }

const playerRuntimeModule = window.createMainPlayerRuntimeModule({
  t,
  escapeHtml,
  PLAYER_FPS,
  useMpegDashPlayerUI,
  isVideo,
  cutMarksByAsset,
  currentUserCanDeleteAssetsRef: {
    get: () => currentUserCanDeleteAssets
  },
  searchStateRef: {
    get currentSearchQuery() { return currentSearchQuery; },
    get currentSearchHighlightQuery() { return currentSearchHighlightQuery; },
    get currentSearchFuzzyUsed() { return currentSearchFuzzyUsed; }
  },
  highlightMatch,
  effectiveSearchHighlightClass,
  secondsToTimecode,
  parseTimecodeInput,
  api,
  deleteApi,
  openClipEditorDialog,
  openTimecodeJumpDialog,
  ensureDetailPanelMinWidth,
  measureClipsPanelRequiredWidth,
  initFullscreenOverlay,
  toggleFullscreenForElement,
  getSubtitleOverlayEnabled,
  setSubtitleOverlayEnabled,
  syncSubtitleOverlayInOpenPlayers,
  showShortcutToast
});

function loadDashJs() {
  return playerRuntimeModule.loadDashJs();
}

function initMpegDashPlayer(mediaEl, asset, root = document) {
  return playerRuntimeModule.initMpegDashPlayer(mediaEl, asset, root);
}

function initPlaybackRateLongPress(mediaEl, triggerBtn, backwardBtn, forwardBtn) {
  return playerRuntimeModule.initPlaybackRateLongPress(mediaEl, triggerBtn, backwardBtn, forwardBtn);
}

function initFrameControls(mediaEl, asset, root = document, options = {}) {
  return playerRuntimeModule.initFrameControls(mediaEl, asset, root, options);
}

const playerUiModule = window.createMainPlayerUiModule({
  t,
  useCustomLikeTimelineUI,
  detailVideoPinnedRef: {
    get: () => detailVideoPinned,
    set: (value) => { detailVideoPinned = Boolean(value); }
  },
  PLAYER_FPS
});

function initDetailVideoPin(root = document) {
  return playerUiModule.initDetailVideoPin(root);
}

function initCustomVideoControls(mediaEl, root = document) {
  return playerUiModule.initCustomVideoControls(mediaEl, root);
}

const documentPreviewModule = window.createMainDocumentPreviewModule({
  api,
  t,
  escapeHtml,
  isTextPreviewable,
  findMatchRanges,
  highlightTextByRanges
});

function initDocumentPreview(asset) {
  return documentPreviewModule.initDocumentPreview(asset);
}

function initPdfSearch(asset) {
  return documentPreviewModule.initPdfSearch(asset);
}

const playerVideoToolsModule = window.createMainPlayerVideoToolsModule({
  api,
  t,
  escapeHtml,
  highlightMatch,
  highlightSuggestText,
  readFileAsBase64,
  currentUserCanDeleteAssetsRef: {
    get: () => currentUserCanDeleteAssets
  },
  subtitleOverlayEnabledByAsset,
  getSubtitleOverlayEnabled,
  syncSubtitleOverlayInOpenPlayers,
  ensureDetailPanelMinWidth,
  resetDetailPanelDynamicMinWidth,
  measureClipsPanelRequiredWidth,
  LOCAL_VIDEO_TOOLS_ORDER
});

function initAudioTools(mediaEl, root = document) {
  return playerVideoToolsModule.initAudioTools(mediaEl, root);
}

function initVideoSubtitleTools(mediaEl, asset, root = document) {
  return playerVideoToolsModule.initVideoSubtitleTools(mediaEl, asset, root);
}

function initVideoOcrTools(asset, root = document) {
  return playerVideoToolsModule.initVideoOcrTools(asset, root);
}

function initCollapsibleSections(root = document) {
  return playerVideoToolsModule.initCollapsibleSections(root);
}

function initVideoToolsSorting(root = document) {
  return playerVideoToolsModule.initVideoToolsSorting(root);
}

const playerBootstrapModule = window.createMainPlayerBootstrapModule({
  api,
  t,
  escapeHtml,
  mediaViewer,
  isVideo,
  isAudio,
  useMpegDashPlayerUI,
  useCustomLikeTimelineUI,
  initMpegDashPlayer,
  initFrameControls,
  initCustomVideoControls,
  initVideoSubtitleTools,
  initVideoOcrTools,
  initCollapsibleSections,
  initVideoToolsSorting,
  initAudioTools,
  initCustomSubtitleOverlay,
  getSubtitleOverlayEnabled,
  setSubtitleOverlayEnabled,
  syncSubtitleOverlayInOpenPlayers
});

function openVideoToolsDialog(asset, options = {}) {
  return playerBootstrapModule.openVideoToolsDialog(asset, options);
}

function initAssetPlayer(asset, root = document, options = {}) {
  return playerBootstrapModule.initAssetPlayer(asset, root, options);
}

const assetsModule = window.createMainAssetsModule({
  api,
  escapeHtml,
  t,
  statusSelect,
  workflowLabel,
  serializeForm,
  searchForm,
  assetTypeFilters,
  syncOcrQueryInputs,
  ocrQueryInput,
  renderAssets,
  currentAssetsRef: {
    get value() { return currentAssets; },
    set value(next) { currentAssets = next; }
  },
  selectedAssetIdsRef: {
    get value() { return selectedAssetIds; }
  },
  selectedAssetIdRef: {
    get value() { return selectedAssetId; },
    set value(next) { selectedAssetId = next; }
  },
  lastSelectedAssetIdRef: {
    get value() { return lastSelectedAssetId; },
    set value(next) { lastSelectedAssetId = next; }
  },
  searchStateRef: {
    get currentSearchQuery() { return currentSearchQuery; },
    set currentSearchQuery(next) { currentSearchQuery = next; },
    get currentOcrQuery() { return currentOcrQuery; },
    set currentOcrQuery(next) { currentOcrQuery = next; },
    get currentSubtitleQuery() { return currentSubtitleQuery; },
    set currentSubtitleQuery(next) { currentSubtitleQuery = next; },
    get currentSearchHighlightQuery() { return currentSearchHighlightQuery; },
    set currentSearchHighlightQuery(next) { currentSearchHighlightQuery = next; },
    get currentSearchDidYouMean() { return currentSearchDidYouMean; },
    set currentSearchDidYouMean(next) { currentSearchDidYouMean = next; },
    get currentSearchFuzzyUsed() { return currentSearchFuzzyUsed; },
    set currentSearchFuzzyUsed(next) { currentSearchFuzzyUsed = next; },
    get currentOcrHighlightQuery() { return currentOcrHighlightQuery; },
    set currentOcrHighlightQuery(next) { currentOcrHighlightQuery = next; },
    get currentOcrDidYouMean() { return currentOcrDidYouMean; },
    set currentOcrDidYouMean(next) { currentOcrDidYouMean = next; },
    get currentOcrFuzzyUsed() { return currentOcrFuzzyUsed; },
    set currentOcrFuzzyUsed(next) { currentOcrFuzzyUsed = next; }
  }
});

async function loadWorkflow() {
  return assetsModule.loadWorkflow();
}

async function loadAssets() {
  const result = await assetsModule.loadAssets();
  updateSearchResultCounter();
  return result;
}

function clearDetailHeaderTimecode() {
  return detailModule.clearDetailHeaderTimecode();
}

function syncDetailHeaderTimecode(root = document) {
  return detailModule.syncDetailHeaderTimecode(root);
}

function scrollElementIntoContainerView(container, element, align = 0.38, offsetTop = 0) {
  return detailModule.scrollElementIntoContainerView(container, element, align, offsetTop);
}

function scrollDetailPanelToVideoTop(root = assetDetail) {
  return detailModule.scrollDetailPanelToVideoTop(root);
}

function seekOpenDetailMedia(assetId, startAtSeconds) {
  return detailModule.seekOpenDetailMedia(assetId, startAtSeconds);
}

function focusCutRowInDetail(root = document, cutId = '') {
  return detailModule.focusCutRowInDetail(root, cutId);
}

async function openAsset(id, workflow, options = {}) {
  if (isVideoToolsPageMode) {
    panelVisibility.panelIngest = false;
    panelVisibility.panelAssets = false;
    panelVisibility.panelDetail = true;
  }
  setPanelVisible('panelDetail', true);

  const asset = await api(`/api/assets/${id}`);

  selectedAssetId = id;
  selectedAssetIds.add(id);
  lastSelectedAssetId = id;
  renderAssets(currentAssets);

  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanup = null;
  }
  if (activeDetailPinCleanup) {
    activeDetailPinCleanup();
    activeDetailPinCleanup = null;
  }
  clearDetailHeaderTimecode();
  resetDetailPanelDynamicMinWidth();

  if (isVideoToolsPageMode && isVideo(asset)) {
    panelDetail?.classList.add('panel-video-detail');
    assetDetail.innerHTML = videoToolsPageMarkup(asset);
    assetDetail.classList.remove('empty');
    assetDetail.classList.add('video-tools-page-detail');
    activePlayerCleanup = initAssetPlayer(asset, assetDetail, {
      startAtSeconds: Number(options.startAtSeconds) || 0,
      focusCutId: String(options.focusCutId || '').trim()
    });
    const overlayCheck = assetDetail.querySelector('#subtitleOverlayCheck');
    if (overlayCheck) overlayCheck.checked = getSubtitleOverlayEnabled(asset.id, false);
    syncSubtitleOverlayInOpenPlayers(asset);
    if (options.scrollToVideoTop) scrollDetailPanelToVideoTop(assetDetail);
    const leaveBtn = document.getElementById('leaveVideoToolsPageBtn');
    leaveBtn?.addEventListener('click', () => {
      const mediaEl = assetDetail.querySelector('#assetMediaEl');
      const current = mediaEl ? Number(mediaEl.currentTime || 0) : 0;
      leaveVideoToolsPage(asset.id, current);
    });
    loadAssetTechnicalInfo(asset).catch(() => {});
    return;
  }

  assetDetail.innerHTML = detailMarkup(asset, workflow);
  const hasPlayableVideoProxy = isVideo(asset) && Boolean(String(asset.proxyUrl || '').trim());
  assetDetail.classList.toggle('video-detail-mode', hasPlayableVideoProxy);
  panelDetail?.classList.toggle('panel-video-detail', hasPlayableVideoProxy);
  assetDetail.classList.remove('video-tools-page-detail');
  if (hasPlayableVideoProxy) syncDetailHeaderTimecode(assetDetail);
  if (hasPlayableVideoProxy) {
    activeDetailPinCleanup = initDetailVideoPin(assetDetail);
  } else {
    assetDetail.classList.remove('detail-video-pinned');
    resetDetailPanelDynamicMinWidth();
  }
  setPanelVideoToolsButtonState(hasPlayableVideoProxy && !isVideoToolsPageMode, () => {
    const panelMedia = assetDetail.querySelector('#assetMediaEl');
    const panelSubtitleCheck = assetDetail.querySelector('#subtitleOverlayCheck');
    const panelTrackEnabled = panelMedia
      ? Array.from(panelMedia.textTracks || []).some((track) => (track.kind === 'subtitles' || track.kind === 'captions') && track.mode === 'showing')
        || Boolean(panelMedia.querySelector('#assetSubtitleTrack'))
      : false;
    const nextSubtitleEnabled = panelSubtitleCheck
      ? Boolean(panelSubtitleCheck.checked)
      : (panelTrackEnabled || getSubtitleOverlayEnabled(asset.id, false));
    setSubtitleOverlayEnabled(asset.id, nextSubtitleEnabled);
    if (panelMedia && typeof panelMedia.pause === 'function') {
      try { panelMedia.pause(); } catch (_error) {}
    }
    const startAtSeconds = panelMedia ? Number(panelMedia.currentTime || 0) : 0;
    openVideoToolsPage(asset.id, startAtSeconds);
  });
  activePlayerCleanup = initAssetPlayer(asset, assetDetail, {
    startAtSeconds: Number(options.startAtSeconds) || 0,
    focusCutId: String(options.focusCutId || '').trim()
  });
  if (options.scrollToVideoTop) scrollDetailPanelToVideoTop(assetDetail);
  const focusFieldName = String(options.focusFieldName || '').trim();
  const focusTag = String(options.focusTag || '').trim();
  const focusCutId = String(options.focusCutId || '').trim();
  if (focusFieldName) {
    requestAnimationFrame(() => {
      const fieldEl = assetDetail.querySelector(`[name="${CSS.escape(focusFieldName)}"]`);
      if (!fieldEl) return;
      fieldEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      try { fieldEl.focus({ preventScroll: true }); } catch (_error) {}
    });
  }
  if (focusTag) {
    requestAnimationFrame(() => {
      const tagButton = Array.from(assetDetail.querySelectorAll('.chip-tag-filter'))
        .find((el) => String(el.textContent || '').trim().toLowerCase() === focusTag.toLowerCase());
      if (!tagButton) return;
      tagButton.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      tagButton.classList.add('search-hit-active');
      setTimeout(() => tagButton.classList.remove('search-hit-active'), 1800);
    });
  }
  if (focusCutId) {
    focusCutRowInDetail(assetDetail, focusCutId);
  }
  loadAssetTechnicalInfo(asset).catch(() => {});
  const ensureProxyBtn = document.getElementById('ensureProxyBtn');
  ensureProxyBtn?.addEventListener('click', async () => {
    try {
      await api(`/api/assets/${id}/ensure-proxy`, { method: 'POST', body: '{}' });
      await loadAssets();
      await openAsset(id, workflow);
    } catch (error) {
      alert(String(error.message || t('proxy_failed')));
    }
  });
  document.getElementById('editForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUserCanEditMetadata) {
      alert(t('metadata_edit_locked'));
      return;
    }
    const formEl = event.target;
    const saveBtn = formEl.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const payload = serializeForm(formEl);
      payload.dcMetadata = extractDcMetadataFromPayload(payload);
      await api(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await loadAssets();
      await openAsset(id, workflow);
    } catch (error) {
      alert(String(error?.message || t('metadata_save_failed')));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  document.getElementById('transitionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = serializeForm(event.target);
    await api(`/api/assets/${id}/transition`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAssets();
    await openAsset(id, workflow);
  });

  const versionFormEl = document.getElementById('versionForm');
  versionFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = serializeForm(event.target);
    await api(`/api/assets/${id}/versions`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAssets();
    await openAsset(id, workflow);
  });

  const restorePdfOriginalBtn = document.getElementById('restorePdfOriginalBtn');
  restorePdfOriginalBtn?.addEventListener('click', async () => {
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const ok = confirm(t('restore_pdf_original_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/pdf-restore-original`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(id, workflow);
  });

  const downloadPdfOriginalBtn = document.getElementById('downloadPdfOriginalBtn');
  downloadPdfOriginalBtn?.addEventListener('click', () => {
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const link = document.createElement('a');
    link.href = `/api/assets/${encodeURIComponent(id)}/pdf-original/download`;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  const restoreOfficeOriginalBtn = document.getElementById('restoreOfficeOriginalBtn');
  restoreOfficeOriginalBtn?.addEventListener('click', async () => {
    if (!currentUserCanEditOffice) return;
    const ok = confirm(t('restore_office_original_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/office-restore-original`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(id, workflow);
  });

  const downloadOfficeOriginalBtn = document.getElementById('downloadOfficeOriginalBtn');
  downloadOfficeOriginalBtn?.addEventListener('click', () => {
    if (!currentUserCanEditOffice) return;
    const link = document.createElement('a');
    link.href = `/api/assets/${encodeURIComponent(id)}/office-original/download`;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  const assetVersionsListEl = document.getElementById('assetVersionsList');
  const handleRestoreVersion = async (restoreBtn) => {
      if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
      const versionId = String(restoreBtn.dataset.versionId || '').trim();
      if (!versionId) return;
      const ok = confirm(t('restore_pdf_confirm'));
      if (!ok) return;
      await api(`/api/assets/${id}/pdf-restore`, {
        method: 'POST',
        body: JSON.stringify({ versionId })
      });
      await refreshAssetDetail(id, workflow);
  };

  const handleDeleteVersion = async (deleteBtnEl) => {
      if (deleteBtnEl.disabled) return;
      const versionId = String(deleteBtnEl.dataset.versionId || '').trim();
      if (!versionId) return;
      const ok = await openVersionDeleteDialog();
      if (!ok) return;
      const rowEl = deleteBtnEl.closest('.version');
      const prevLabel = String(deleteBtnEl.textContent || '').trim() || t('delete_version');
      deleteBtnEl.disabled = true;
      deleteBtnEl.textContent = currentLang === 'tr' ? 'Siliniyor...' : 'Deleting...';
      rowEl?.classList.add('is-busy');
      try {
        await api(`/api/assets/${id}/versions/${encodeURIComponent(versionId)}`, { method: 'DELETE' });
        rowEl?.remove();
        if (Array.isArray(asset.versions)) {
          asset.versions = asset.versions.filter((v) => String(v.versionId || '') !== versionId);
        }
        loadAssets().catch(() => {});
      } catch (error) {
        deleteBtnEl.disabled = false;
        deleteBtnEl.textContent = prevLabel;
        rowEl?.classList.remove('is-busy');
        alert(String(error?.message || 'Failed to delete version'));
      }
  };

  const handleEditVersion = async (editBtnEl) => {
      if (editBtnEl.disabled) return;
      const versionId = String(editBtnEl.dataset.versionId || '').trim();
      if (!versionId) return;
      const current = (asset.versions || []).find((v) => String(v.versionId || '') === versionId);
      const currentLabel = String(current?.label || '').trim();
      const currentNote = cleanVersionNoteText(String(current?.note || ''));
      const next = await openVersionEditDialog({ label: currentLabel, note: currentNote });
      if (!next?.label) return;
      editBtnEl.disabled = true;
      try {
        const updated = await api(`/api/assets/${id}/versions/${encodeURIComponent(versionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: next.label, note: next.note || '' })
        });
        const updatedVersion = updated?.version || null;
        const rowEl = editBtnEl.closest('.version');
        if (updatedVersion && rowEl) {
          const titleEl = rowEl.querySelector('strong');
          if (titleEl) titleEl.textContent = String(updatedVersion.label || '');
          const noteText = cleanVersionNoteText(String(updatedVersion.note || ''));
          if (titleEl && titleEl.nextSibling) {
            titleEl.nextSibling.nodeValue = ` - ${noteText}`;
          }
          if (Array.isArray(asset.versions)) {
            const idx = asset.versions.findIndex((v) => String(v.versionId || '') === versionId);
            if (idx >= 0) asset.versions[idx] = { ...asset.versions[idx], ...updatedVersion };
          }
        }
        editBtnEl.disabled = false;
        loadAssets().catch(() => {});
      } catch (error) {
        editBtnEl.disabled = false;
        alert(String(error?.message || 'Failed to update version'));
      }
  };

  assetVersionsListEl?.querySelectorAll('.restorePdfVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleRestoreVersion(event.currentTarget);
    });
  });
  assetVersionsListEl?.querySelectorAll('.restoreOfficeVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const versionId = String(btn.getAttribute('data-version-id') || '').trim();
      if (!versionId || !confirm(t('restore_office_confirm'))) return;
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/office-restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ versionId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(payload.error || 'Failed to restore Office version');
        return;
      }
      await refreshAssetDetail(asset.id, workflow);
    });
  });

  assetVersionsListEl?.querySelectorAll('.deleteVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleDeleteVersion(event.currentTarget);
    });
  });

  assetVersionsListEl?.querySelectorAll('.editVersionBtn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleEditVersion(event.currentTarget);
    });
  });

  assetVersionsListEl?.addEventListener('click', async (event) => {
    const targetNode = event.target;
    const target = targetNode instanceof Element ? targetNode : targetNode?.parentElement;
    if (!(target instanceof Element)) return;

    const row = target.closest('.version-restorable[data-restore-version-id]');
    if (!row) return;
    const ignore = target.closest('button, a, input, textarea, select, label');
    if (ignore) return;
    if (!currentUserCanAccessAdmin || !currentUserCanUsePdfAdvancedTools) return;
    const versionId = String(row.dataset.restoreVersionId || '').trim();
    if (!versionId) return;
    const ok = confirm(t('restore_pdf_confirm'));
    if (!ok) return;
    await api(`/api/assets/${id}/pdf-restore`, {
      method: 'POST',
      body: JSON.stringify({ versionId })
    });
    await refreshAssetDetail(id, workflow);
  }, true);

  const downloadBtn = document.getElementById('downloadAssetBtn');
  const downloadProxyBtn = document.getElementById('downloadProxyBtn');
  const moveToTrashBtn = document.getElementById('moveToTrashBtn');
  const restoreAssetBtn = document.getElementById('restoreAssetBtn');
  const deleteAssetBtn = document.getElementById('deleteAssetBtn');

  downloadBtn?.addEventListener('click', () => {
    // Varlık indir her zaman asıl kaynağı indirir; proxy bunun yerine geçmez.
    const downloadUrl = String(asset.mediaUrl || '').trim();
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    // Empty download attribute lets browser suggest a filename.
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  downloadProxyBtn?.addEventListener('click', () => {
    // Proxy indirme yalnızca admin için ek bir kolaylık olarak sunuluyor.
    const downloadUrl = String(asset.proxyUrl || '').trim();
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  moveToTrashBtn?.addEventListener('click', async () => {
    const ok = confirm(t('move_to_trash_confirm'));
    if (!ok) return;
    await api(`/api/assets/${encodeURIComponent(asset.id)}/trash`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(asset.id, workflow);
  });

  restoreAssetBtn?.addEventListener('click', async () => {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/restore`, { method: 'POST', body: '{}' });
    await refreshAssetDetail(asset.id, workflow);
  });

  deleteAssetBtn?.addEventListener('click', async () => {
    const ok = confirm(t('trash_confirm'));
    if (!ok) return;
    const wasSelected = selectedAssetId === asset.id;
    await api(`/api/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
    selectedAssetIds.delete(asset.id);
    await loadAssets();
    if (wasSelected) {
      selectedAssetId = null;
      resetSelectedAssetDetailPanel();
    }
  });

}

async function applyTagChipFilterToggle(clickedTag) {
  const nextTag = String(clickedTag || '').trim();
  if (!nextTag) return;
  const tagInput = searchForm.querySelector('[name="tag"]');
  const queryInput = searchForm.querySelector('[name="q"]');
  const currentTag = String(tagInput?.value || '').trim();
  const isSameTag = currentTag.localeCompare(nextTag, undefined, { sensitivity: 'base' }) === 0;
  if (tagInput) tagInput.value = isSameTag ? '' : nextTag;
  if (queryInput) queryInput.value = '';
  await loadAssets();
}

assetGrid.addEventListener('click', async (event) => {
  const tagChip = event.target.closest('[data-chip-tag]');
  if (tagChip) {
    event.preventDefault();
    event.stopPropagation();
    await applyTagChipFilterToggle(tagChip.dataset.chipTag);
    return;
  }

  const ocrJumpBtn = event.target.closest('[data-ocr-jump]');
  if (ocrJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(ocrJumpBtn.dataset.id || '').trim();
    const startAtSeconds = Math.max(0, Number(ocrJumpBtn.dataset.startSec || 0));
    if (!id) return;
    if (seekOpenDetailMedia(id, startAtSeconds)) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { startAtSeconds, scrollToVideoTop: true });
    return;
  }

  const clipJumpBtn = event.target.closest('[data-clip-jump]');
  if (clipJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(clipJumpBtn.dataset.id || '').trim();
    const focusCutId = String(clipJumpBtn.dataset.cutId || '').trim();
    const startAtSeconds = Math.max(0, Number(clipJumpBtn.dataset.startSec || 0));
    if (!id) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { startAtSeconds, focusCutId });
    return;
  }

  const fieldJumpBtn = event.target.closest('[data-field-jump]');
  if (fieldJumpBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(fieldJumpBtn.dataset.id || '').trim();
    const focusFieldName = String(fieldJumpBtn.dataset.fieldName || '').trim();
    const focusTag = String(fieldJumpBtn.dataset.focusTag || '').trim();
    if (!id || (!focusFieldName && !focusTag)) return;
    setSingleSelection(id);
    const workflow = await api('/api/workflow');
    await openAsset(id, workflow, { focusFieldName, focusTag });
    return;
  }

  const actionBtn = event.target.closest('button[data-card-action]');
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.cardAction;
    if (!id || !action) return;
    if (action === 'restore') {
      await api(`/api/assets/${id}/restore`, { method: 'POST', body: '{}' });
      await loadAssets();
      return;
    }
    if (action === 'delete') {
      if (!currentUserCanDeleteAssets) return;
      const ok = confirm(t('trash_confirm'));
      if (!ok) return;
      await deleteApi(`/api/assets/${id}`);
      selectedAssetIds.delete(id);
      if (selectedAssetId === id) {
        selectedAssetId = null;
        resetSelectedAssetDetailPanel();
      }
      await loadAssets();
      return;
    }
  }

  const card = event.target.closest('.asset-card');
  if (!card) return;
  const cardId = String(card.dataset.id || '').trim();
  if (!cardId) return;

  if (event.metaKey || event.ctrlKey) {
    toggleMultiSelection(cardId);
    renderAssets(currentAssets);
    if (selectedAssetIds.size > 1) {
      await openMultiSelectionDetail();
      return;
    }
    if (selectedAssetIds.size === 1) {
      const onlySelectedId = selectedAssetId || [...selectedAssetIds][0];
      if (!onlySelectedId) return;
      const workflow = await api('/api/workflow');
      openAsset(onlySelectedId, workflow).catch((err) => alert(err.message));
      return;
    }
    if (activeDetailPinCleanup) {
      activeDetailPinCleanup();
      activeDetailPinCleanup = null;
    }
    if (activePlayerCleanup) {
      activePlayerCleanup();
      activePlayerCleanup = null;
    }
    assetDetail.classList.remove('detail-video-pinned');
    assetDetail.classList.remove('video-detail-mode');
    assetDetail.textContent = t('select_asset');
    setPanelVideoToolsButtonState(false);
    return;
  }

  if (event.shiftKey) {
    addShiftRangeSelection(cardId);
    renderAssets(currentAssets);
    await openMultiSelectionDetail();
    return;
  }

  setSingleSelection(cardId);

  const workflow = await api('/api/workflow');
  openAsset(cardId, workflow).catch((err) => alert(err.message));
});

assetDetail.addEventListener('click', async (event) => {
  const tagChip = event.target.closest('[data-chip-tag]');
  if (!tagChip) return;
  event.preventDefault();
  event.stopPropagation();
  await applyTagChipFilterToggle(tagChip.dataset.chipTag);
});

assetTypeFilters.forEach((input) => {
  input.addEventListener('change', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (document.activeElement === ocrQueryInput) queueOcrSuggestions();
    loadAssets().catch((error) => alert(error.message));
  });
});

assetsTitleToggleBtn?.addEventListener('click', () => {
  const allSelected = assetTypeFilters.every((input) => input.checked);
  const nextChecked = !allSelected;
  assetTypeFilters.forEach((input) => {
    input.checked = nextChecked;
  });
  updateClearSearchButtonState();
  if (document.activeElement === searchQueryInput) queueSearchSuggestions();
  if (document.activeElement === ocrQueryInput) queueOcrSuggestions();
  loadAssets().catch((error) => alert(error.message));
});

assetViewListBtn?.addEventListener('click', () => {
  assetViewMode = 'list';
  localStorage.setItem(LOCAL_ASSET_VIEW_MODE, assetViewMode);
  renderAssets(currentAssets);
});

assetViewThumbBtn?.addEventListener('click', () => {
  assetViewMode = 'grid';
  localStorage.setItem(LOCAL_ASSET_VIEW_MODE, assetViewMode);
  renderAssets(currentAssets);
});

initIngestHandlers();
searchSuggestModule?.init?.();

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideSearchSuggestions();
  hideOcrSuggestions();
  hideSubtitleSuggestions();
  setSearchResultCounterVisible(hasActiveSearchFields());
  try {
    await loadAssets();
  } catch (error) {
    showAssetLoadError(error);
  }
});

clearSearchBtn?.addEventListener('click', async () => {
  setSearchResultCounterVisible(false);
  try {
    await clearSearchFields();
  } catch (error) {
    showAssetLoadError(error);
  }
});

['tag', 'type'].forEach((name) => {
  const el = searchForm.querySelector(`[name="${name}"]`);
  el?.addEventListener('input', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (getActiveOcrQueryInput() === ocrQueryInput) queueOcrSuggestions();
    if (document.activeElement === subtitleQueryInput) queueSubtitleSuggestions();
  });
});

['status', 'trash'].forEach((name) => {
  const el = searchForm.querySelector(`[name="${name}"]`);
  el?.addEventListener('change', () => {
    updateClearSearchButtonState();
    if (document.activeElement === searchQueryInput) queueSearchSuggestions();
    if (getActiveOcrQueryInput() === ocrQueryInput) queueOcrSuggestions();
    if (document.activeElement === subtitleQueryInput) queueSubtitleSuggestions();
  });
});

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
  hideSearchSuggestions();
  hideOcrSuggestions();
  hideSubtitleSuggestions();
  applyStaticI18n();
  await loadWorkflow();
  await loadAssets();
  if (selectedAssetIds.size > 1) {
    await openMultiSelectionDetail();
    return;
  }
  if (selectedAssetId) {
    const workflow = await api('/api/workflow');
    await openAsset(selectedAssetId, workflow);
  } else {
    if (activeDetailPinCleanup) {
      activeDetailPinCleanup();
      activeDetailPinCleanup = null;
    }
    assetDetail.textContent = t('select_asset');
    assetDetail.classList.remove('video-detail-mode');
    assetDetail.classList.remove('detail-video-pinned');
    setPanelVideoToolsButtonState(false);
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

closeDetailBtn?.addEventListener('click', () => {
  setPanelVisible('panelDetail', false);
  setPanelVideoToolsButtonState(false);
});

splitterDots.forEach((dot) => {
  dot.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const panelId = dot.dataset.hidePanel;
    if (!panelId) return;
    setPanelVisible(panelId, false);
  });
});

splitterTabs.forEach((tab) => {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const panelId = tab.dataset.showPanel;
    if (!panelId) return;
    setPanelVisible(panelId, true);
  });
});

currentUserBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  userMenu?.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
  if (!userMenu || !currentUserBtn) return;
  if (currentUserBtn.contains(event.target)) return;
  if (userMenu.contains(event.target)) return;
  userMenu.classList.add('hidden');
});

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;
  const type = String(event.data?.type || '').trim();
  if (type !== 'mam-pdf-saved') return;
  const assetId = String(event.data?.assetId || '').trim();
  if (!assetId || assetId !== selectedAssetId) return;
  try {
    const workflow = await api('/api/workflow');
    await loadAssets();
    await openAsset(assetId, workflow);
  } catch (_error) {
    // Best effort refresh only.
  }
});

logoutBtn?.addEventListener('click', async () => {
  userMenu?.classList.add('hidden');
  try {
    const logoutEndpoint = `/api/logout-url?ts=${Date.now()}`;
    const response = await fetch(logoutEndpoint, {
      credentials: 'include',
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    const url = String(payload?.url || '').trim();
    window.location.assign(url || '/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F');
  } catch (_error) {
    window.location.assign('/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F');
  }
});

(async () => {
  try {
    await loadI18nFile();
    await loadUiSettings();
    applyVideoToolsPageLayoutMode();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyStaticI18n();
    loadPanelPrefs();
    loadPanelVisibilityPrefs();
    if (!isVideoToolsPageMode && /^[01]{3}$/.test(requestedRestorePanels)) {
      panelVisibility.panelIngest = requestedRestorePanels[0] === '1';
      panelVisibility.panelAssets = requestedRestorePanels[1] === '1';
      panelVisibility.panelDetail = requestedRestorePanels[2] === '1';
      if (!panelVisibility.panelIngest && !panelVisibility.panelAssets && !panelVisibility.panelDetail) {
        panelVisibility.panelAssets = true;
      }
      savePanelVisibilityPrefs();
    }
    if (isVideoToolsPageMode) {
      panelVisibility.panelIngest = false;
      panelVisibility.panelAssets = false;
      panelVisibility.panelDetail = true;
    }
    applyPanelLayout();
    initPanelSplitters();
    updateClearSearchButtonState();
    await loadCurrentUser();
    const workflow = await loadWorkflow();
    applyAssetViewModeUI();
    await loadAssets();
    if (isVideoToolsPageMode) {
      const targetId = requestedVideoToolsAssetId
        || String(currentAssets.find((item) => isVideo(item))?.id || '').trim();
      if (targetId) {
        await openAsset(targetId, workflow, { startAtSeconds: requestedVideoToolsStartSec });
      } else {
        assetDetail.innerHTML = `<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
      }
    } else if (requestedOpenAssetId) {
      await openAsset(requestedOpenAssetId, workflow, { startAtSeconds: requestedOpenStartSec });
      const clean = new URL(window.location.href);
      clean.searchParams.delete('openAsset');
      clean.searchParams.delete('openTc');
      clean.searchParams.delete('restorePanels');
      window.history.replaceState({}, '', clean.toString());
    } else if (requestedRestorePanels) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('restorePanels');
      window.history.replaceState({}, '', clean.toString());
    }
  } catch (error) {
    alert(error.message);
  }
})();
