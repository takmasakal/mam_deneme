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
const assetTrashOnly = document.getElementById('assetTrashOnly');
const typesSelectAllBtn = document.getElementById('typesSelectAllBtn');
const assetTypeFilters = Array.from(document.querySelectorAll('.asset-type-filter'));
const panelDetail = document.getElementById('panelDetail');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const statusSelect = searchForm.querySelector('[name="status"]');
const languageSelect = document.getElementById('languageSelect');
const currentUserBtn = document.getElementById('currentUserBtn');
const userMenu = document.getElementById('userMenu');
const adminMenuLink = document.getElementById('adminMenuLink');
const logoutBtn = document.getElementById('logoutBtn');
const layout = document.querySelector('.layout');
const splitters = Array.from(document.querySelectorAll('.panel-splitter'));
const splitterDots = Array.from(document.querySelectorAll('.splitter-dot'));
const splitterTabs = Array.from(document.querySelectorAll('.splitter-tab'));

const LOCAL_PANEL_SIZE = 'mam.panel.sizes';
const LOCAL_PANEL_VIS = 'mam.panel.visibility';
const LOCAL_LANG = 'mam.lang';
const I18N_PATH = '/i18n.json';
const PANELS = [
  { id: 'panelIngest', defaultSize: 1 },
  { id: 'panelAssets', defaultSize: 1.2 },
  { id: 'panelDetail', defaultSize: 1 }
];

let currentAssets = [];
let activePlayerCleanup = null;
let selectedAssetId = null;
const selectedAssetIds = new Set();
let lastSelectedAssetId = null;
let currentSearchQuery = '';
const cutMarksByAsset = new Map();
const subtitleOverlayEnabledByAsset = new Map();
let panelSizes = Object.fromEntries(PANELS.map((p) => [p.id, p.defaultSize]));
let panelVisibility = { panelIngest: true, panelAssets: true, panelDetail: true };
let i18n = {
  en: {
    app_title: 'Broadcast MAM Console',
    app_subtitle: 'Dalet-style MVP: ingest, metadata, workflow, versions',
    current_user: 'Current User',
    unknown_user: 'Unknown user',
    logout: 'Logout',
    language_label: 'Language',
    admin_page: 'Admin',
    ingest_title: 'Ingest Asset',
    search_title: 'Search',
    search_upload_tag: 'SEARCH / UPLOAD',
    assets_title: 'Assets',
    asset_detail_title: 'Asset Detail',
    select_asset: 'Select an asset.',
    ph_title: 'Title',
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
    ph_query: 'Query',
    ph_tag: 'Tag',
    ph_type_simple: 'Type',
    filter_types: 'Types',
    trash_scope: 'Trash',
    any_status: 'Any status',
    trash_active: 'Active assets',
    trash_only: 'Trash only',
    trash_all: 'All (active + trash)',
    btn_upload_create: 'Upload & Create Asset',
    uploading: 'Uploading',
    processing: 'Processing',
    btn_apply_filters: 'Apply Filters',
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
    status: 'Status',
    trash: 'Trash',
    in_trash: 'In Trash',
    active: 'Active',
    restore: 'Restore',
    delete_permanent: 'Delete Permanently',
    move_to_trash: 'Move To Trash',
    asset_viewer: 'Asset Viewer',
    edit_metadata: 'Edit Metadata',
    save_metadata: 'Save Metadata',
    metadata_save_failed: 'Metadata save failed.',
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
    video_native_audio: 'Native video audio mode is active.',
    subtitles: 'Subtitles',
    subtitle_lang: 'Lang',
    subtitle_none: 'No subtitle loaded',
    subtitle_loaded: 'Subtitle loaded',
    subtitle_upload: 'Upload Subtitle',
    subtitle_generate: 'Generate Subtitle',
    subtitle_upload_success: 'Subtitle uploaded.',
    subtitle_generate_success: 'Subtitle generated.',
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
    subtitle_rename_success: 'Subtitle name saved.',
    subtitle_job_started: 'Subtitle generation started. Please wait...',
    subtitle_job_failed: 'Subtitle generation failed.',
    video_tools: 'Video Tools',
    video_tools_title: 'Video Tools',
    close: 'Close',
    subtitle_current: 'Current subtitle',
    subtitle_overlay_enabled: 'Show subtitle overlay in preview'
  },
  tr: {
    app_title: 'Yayın MAM Konsolu',
    app_subtitle: 'Dalet benzeri MVP: ingest, metadata, iş akışı, versiyonlar',
    current_user: 'Giriş yapan',
    unknown_user: 'Bilinmeyen kullanıcı',
    logout: 'Çıkış Yap',
    language_label: 'Dil',
    admin_page: 'Yönetim',
    ingest_title: 'Varlık Yükle',
    search_title: 'Ara',
    search_upload_tag: 'ARA / YUKLE',
    assets_title: 'Varlıklar',
    asset_detail_title: 'Varlık Detayı',
    select_asset: 'Bir varlık seçin.',
    ph_title: 'Başlık',
    ph_type: 'Tür',
    type_video: 'Video',
    type_audio: 'Ses',
    type_document: 'Doküman',
    type_photo: 'Fotoğraf',
    type_other: 'Diğer',
    ph_owner: 'Sahip',
    choose_file: 'Dosya Sec',
    ph_tags: 'Etiketler (virgülle)',
    ph_duration_auto: 'Süre otomatik algılanır',
    ph_source: 'Kaynak yolu',
    ph_description: 'Açıklama',
    ph_query: 'Sorgu',
    ph_tag: 'Etiket',
    ph_type_simple: 'Tür',
    filter_types: 'Türler',
    trash_scope: 'Çöp',
    any_status: 'Tüm durumlar',
    trash_active: 'Aktif varlıklar',
    trash_only: 'Çöp kutusu',
    trash_all: 'Hepsi (aktif + çöp)',
    btn_upload_create: 'Yükle ve Oluştur',
    uploading: 'Yükleniyor',
    processing: 'İşleniyor',
    btn_apply_filters: 'Filtreleri Uygula',
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
    status: 'Durum',
    trash: 'Çöp',
    in_trash: 'Çöpte',
    active: 'Aktif',
    restore: 'Geri Yükle',
    delete_permanent: 'Kalıcı Sil',
    move_to_trash: 'Çöpe Taşı',
    asset_viewer: 'Varlık Görüntüleyici',
    edit_metadata: 'Metadata Düzenle',
    save_metadata: 'Metadata Kaydet',
    metadata_save_failed: 'Metadata kaydetme basarisiz.',
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
    video_native_audio: 'Yerel video ses modu aktif.',
    subtitles: 'Altyazı',
    subtitle_lang: 'Dil',
    subtitle_none: 'Yüklü altyazı yok',
    subtitle_loaded: 'Altyazı yüklendi',
    subtitle_upload: 'Altyazı Yükle',
    subtitle_generate: 'Altyazı Oluştur',
    subtitle_upload_success: 'Altyazı yüklendi.',
    subtitle_generate_success: 'Altyazı oluşturuldu.',
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
    subtitle_rename_success: 'Altyazı adı kaydedildi.',
    subtitle_job_started: 'Altyazı üretimi başladı. Lütfen bekleyin...',
    subtitle_job_failed: 'Altyazı üretimi başarısız.',
    video_tools: 'Video Araçları',
    video_tools_title: 'Video Araçları',
    close: 'Kapat',
    subtitle_current: 'Mevcut altyazı',
    subtitle_overlay_enabled: 'Önizlemede altyazı katmanını göster'
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

function tf(key, vars = {}) {
  let text = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return text;
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
  if (currentUserBtn && !currentUserBtn.dataset.value) {
    currentUserBtn.textContent = t('unknown_user');
  }
}

async function loadCurrentUser() {
  if (!currentUserBtn) return;
  try {
    const me = await api('/api/me');
    const username = String(me.username || '').trim();
    const displayName = String(me.displayName || '').trim();
    const email = String(me.email || '').trim();
    const isAdmin = Boolean(me.isAdmin);
    const value = displayName || username || (email.includes('@') ? email.split('@')[0] : '') || t('unknown_user');
    currentUserBtn.dataset.value = value;
    currentUserBtn.textContent = value;
    currentUserBtn.title = value;
    if (adminMenuLink) {
      adminMenuLink.classList.toggle('hidden', !isAdmin);
    }
  } catch (_error) {
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
  savePanelVisibilityPrefs();
}

function applyPanelLayout() {
  const ingest = Math.max(0.34, Number(panelSizes.panelIngest) || 1);
  const assets = Math.max(0.45, Number(panelSizes.panelAssets) || 1);
  const detail = Math.max(0.22, Number(panelSizes.panelDetail) || 1);
  const ingestVisible = isPanelVisible('panelIngest');
  const assetsVisible = isPanelVisible('panelAssets');
  const detailVisible = isPanelVisible('panelDetail');

  layout.style.gridTemplateColumns = `${ingestVisible ? `${ingest}fr` : '0px'} 10px ${assetsVisible ? `${assets}fr` : '0px'} 10px ${detailVisible ? `${detail}fr` : '0px'}`;
  panelIngest.style.display = ingestVisible ? '' : 'none';
  panelAssets.style.display = assetsVisible ? '' : 'none';
  panelDetail.style.display = detailVisible ? '' : 'none';

  splitterTabs.forEach((tab) => {
    const panelId = tab.dataset.showPanel;
    if (!panelId) return;
    tab.style.display = isPanelVisible(panelId) ? 'none' : 'inline-flex';
  });
}

function initPanelSplitters() {
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const minSize = 0.45;
  const minDetail = 0.22;
  const minIngestAnyMode = Number((minSize * 0.76).toFixed(2));

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

      if (kind === 'left' && !(ingestVisible && assetsVisible)) return;
      if (kind === 'right' && !(assetsVisible && detailVisible)) return;

      const startX = event.clientX;
      const ingestStart = Number(panelSizes.panelIngest) || 1;
      const assetsStart = Number(panelSizes.panelAssets) || 1;
      const detailStart = Number(panelSizes.panelDetail) || 1;
      const pairWidth = kind === 'left'
        ? (panelIngest.clientWidth + panelAssets.clientWidth)
        : (panelAssets.clientWidth + panelDetail.clientWidth);
      const pairFr = kind === 'left'
        ? (ingestStart + assetsStart)
        : (assetsStart + detailStart);
      const unitPx = pairWidth / pairFr;
      if (!unitPx || unitPx <= 0) return;

      const onMove = (moveEvent) => {
        const deltaPx = moveEvent.clientX - startX;
        const deltaFr = deltaPx / unitPx;

        if (kind === 'left') {
          let nextIngest = ingestStart + deltaFr;
          let nextAssets = assetsStart - deltaFr;
          const minIngest = detailVisible ? minSize : minIngestAnyMode;
          [nextIngest, nextAssets] = clampPair(nextIngest, nextAssets, minIngest, minSize);
          panelSizes.panelIngest = nextIngest;
          panelSizes.panelAssets = nextAssets;
        } else {
          let nextAssets = assetsStart + deltaFr;
          let nextDetail = detailStart - deltaFr;
          [nextAssets, nextDetail] = clampPair(nextAssets, nextDetail, minSize, minDetail);
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
  let jsonBody = {};
  if (textBody) {
    try {
      jsonBody = JSON.parse(textBody);
    } catch (_error) {
      jsonBody = {};
    }
  }

  if (!response.ok) {
    const fallback = textBody
      ? textBody.replace(/\s+/g, ' ').trim().slice(0, 220)
      : '';
    throw new Error(jsonBody.error || fallback || 'Request failed');
  }

  return textBody ? (Object.keys(jsonBody).length ? jsonBody : {}) : {};
}

async function deleteApi(path) {
  const response = await fetch(path, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
}

function setUploadProgress(percent, label = '') {
  if (!uploadProgressWrap || !uploadProgressText) return;
  uploadProgressWrap.classList.remove('hidden');
  if (uploadProgressSpinner) uploadProgressSpinner.classList.remove('hidden');
  uploadProgressText.textContent = label || t('uploading');
}

function hideUploadProgress() {
  if (!uploadProgressWrap || !uploadProgressText) return;
  uploadProgressWrap.classList.add('hidden');
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
  if (uploadProgressSpinner) uploadProgressSpinner.classList.add('hidden');
  uploadProgressText.textContent = '';
}

function uploadAssetWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/assets/upload');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = (event.loaded / event.total) * 100;
      onProgress?.(pct);
    };

    xhr.onerror = () => reject(new Error('Upload request failed'));
    xhr.onload = () => {
      const raw = String(xhr.responseText || '');
      let parsed = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch (_e) { parsed = {}; }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed);
      } else {
        reject(new Error(parsed.error || 'Upload failed'));
      }
    };

    xhr.send(JSON.stringify(payload));
  });
}

async function waitUntilAssetVisible(assetId, maxAttempts = 8) {
  if (!assetId) {
    await loadAssets();
    return true;
  }
  for (let i = 0; i < maxAttempts; i += 1) {
    await loadAssets();
    if (currentAssets.some((asset) => asset.id === assetId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr');
}

function findMatchRanges(text, query) {
  const raw = String(text || '').normalize('NFC');
  const q = String(query || '').trim().normalize('NFC');
  if (!raw || !q) return [];
  const rawLower = raw.toLocaleLowerCase('tr');
  const qLower = q.toLocaleLowerCase('tr');
  const ranges = [];
  let from = 0;
  while (true) {
    const idx = rawLower.indexOf(qLower, from);
    if (idx < 0) break;
    ranges.push([idx, idx + q.length]);
    from = idx + q.length;
  }
  return ranges;
}

function highlightTextByRanges(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  let out = '';
  let last = 0;
  ranges.forEach(([start, end]) => {
    if (start > last) out += escapeHtml(String(text).slice(last, start));
    out += `<mark class="search-hit">${escapeHtml(String(text).slice(start, end))}</mark>`;
    last = end;
  });
  if (last < String(text).length) out += escapeHtml(String(text).slice(last));
  return out;
}

function serializeForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function subtitleTrackMarkup(asset) {
  if (!asset?.subtitleUrl) return '';
  const src = `${asset.subtitleUrl}${asset.subtitleUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
  const lang = String(asset.subtitleLang || currentLang || 'tr').slice(0, 12);
  const label = String(asset.subtitleLabel || t('subtitles'));
  return `<track id="assetSubtitleTrack" kind="subtitles" label="${escapeHtml(label)}" srclang="${escapeHtml(lang)}" src="${escapeHtml(src)}" default />`;
}

function isVideo(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const type = String(asset.type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  if (type === 'video') return true;
  const ext = getFileExtension(asset);
  return ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpeg', 'mpg'].includes(ext);
}

function isAudio(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const type = String(asset.type || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  if (type === 'audio') return true;
  const ext = getFileExtension(asset);
  return ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'].includes(ext);
}

function isImage(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const type = String(asset.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (type === 'photo' || type === 'image') return true;
  const ext = getFileExtension(asset);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif'].includes(ext);
}

function isPdf(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return true;
  return getFileExtension(asset) === 'pdf';
}

function isDocument(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const type = String(asset.type || '').toLowerCase();
  if (type === 'document') return true;
  return (
    mime.startsWith('application/') ||
    mime.startsWith('text/') ||
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation')
  );
}

function getFileExtension(asset) {
  const name = String(asset.fileName || '');
  const idx = name.lastIndexOf('.');
  if (idx < 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

function isTextPreviewable(asset) {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime.startsWith('text/')) return true;

  const ext = getFileExtension(asset);
  return [
    'sql',
    'py',
    'js',
    'ts',
    'tsx',
    'jsx',
    'json',
    'md',
    'xml',
    'yaml',
    'yml',
    'log',
    'ini',
    'cfg',
    'conf',
    'sh',
    'bash',
    'zsh',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'go',
    'rs',
    'rb',
    'php',
    'swift',
    'kt',
    'txt',
    'csv'
  ].includes(ext);
}

function docThumbDataUrl(asset) {
  const ext = (getFileExtension(asset) || 'DOC').toUpperCase().slice(0, 5);
  const name = String(asset.fileName || asset.title || `FILE.${ext.toLowerCase()}`);
  const title = name.length > 30 ? `${name.slice(0, 27)}...` : name;
  const headerFill = ext === 'PDF' ? '#b63a34' : '#3f69b7';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#1f222b"/><rect x="10" y="10" width="460" height="250" rx="12" fill="#2a2f3b" stroke="#42485a"/><text x="240" y="36" font-family="IBM Plex Sans, Arial, sans-serif" text-anchor="middle" font-size="26" font-weight="600" fill="#f3f6fb">${escapeHtml(title)}</text><g transform="translate(137,56)"><rect x="0" y="0" width="206" height="178" rx="6" fill="#eef1f6"/><rect x="0" y="0" width="206" height="24" rx="6" fill="${headerFill}"/><text x="14" y="17" font-family="IBM Plex Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${ext}</text><rect x="18" y="38" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="52" width="158" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="66" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="80" width="144" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="94" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="108" width="130" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="122" width="166" height="6" rx="3" fill="#c2c9d6"/></g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function thumbFallbackForAsset(asset) {
  if (isPdf(asset)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#f6f3ee"/><rect x="24" y="20" width="180" height="36" rx="8" fill="#c53a2f"/><text x="36" y="45" font-family="Arial, sans-serif" font-size="22" fill="#ffffff">PDF</text><rect x="24" y="72" width="432" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="98" width="390" height="14" rx="7" fill="#e1ddd2"/><rect x="24" y="124" width="430" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="150" width="350" height="14" rx="7" fill="#e1ddd2"/><rect x="24" y="176" width="410" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="202" width="300" height="14" rx="7" fill="#e1ddd2"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return docThumbDataUrl(asset);
}

function documentSearchControls() {
  return `
    <div class="doc-search-row">
      <input id="docSearchInput" type="text" placeholder="${escapeHtml(t('preview_search_placeholder'))}" />
      <button type="button" id="docSearchRunBtn" class="doc-search-nav">${escapeHtml(t('preview_find'))}</button>
      <button type="button" id="docSearchPrevBtn" class="doc-search-nav" aria-label="Previous match">&lt;</button>
      <button type="button" id="docSearchNextBtn" class="doc-search-nav" aria-label="Next match">&gt;</button>
      <span id="docSearchMeta" class="viewer-meta"></span>
    </div>
  `;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function extractDcMetadataFromPayload(payload) {
  const keyMap = {
    dcTitle: 'title',
    dcCreator: 'creator',
    dcSubject: 'subject',
    dcDescription: 'description',
    dcPublisher: 'publisher',
    dcContributor: 'contributor',
    dcDate: 'date',
    dcType: 'type',
    dcFormat: 'format',
    dcIdentifier: 'identifier',
    dcSource: 'source',
    dcLanguage: 'language',
    dcRelation: 'relation',
    dcCoverage: 'coverage',
    dcRights: 'rights'
  };

  const dcMetadata = {};
  Object.entries(keyMap).forEach(([formKey, dcKey]) => {
    if (!Object.prototype.hasOwnProperty.call(payload, formKey)) return;
    const value = String(payload[formKey] || '').trim();
    if (value) dcMetadata[dcKey] = value;
    delete payload[formKey];
  });
  return dcMetadata;
}

function highlightMatch(value, query) {
  const raw = String(value ?? '');
  const terms = extractHighlightTerms(query);
  if (!terms.length) return escapeHtml(raw);

  const lowered = raw.toLowerCase();
  let idx = 0;
  let out = '';

  while (idx < raw.length) {
    let nextHit = -1;
    let nextTerm = '';
    for (let i = 0; i < terms.length; i += 1) {
      const term = terms[i];
      const hit = lowered.indexOf(term, idx);
      if (hit < 0) continue;
      if (
        nextHit < 0
        || hit < nextHit
        || (hit === nextHit && term.length > nextTerm.length)
      ) {
        nextHit = hit;
        nextTerm = term;
      }
    }

    if (nextHit < 0) {
      out += escapeHtml(raw.slice(idx));
      break;
    }
    if (nextHit > idx) {
      out += escapeHtml(raw.slice(idx, nextHit));
    }
    out += `<mark class="search-hit">${escapeHtml(raw.slice(nextHit, nextHit + nextTerm.length))}</mark>`;
    idx = nextHit + nextTerm.length;
  }

  return out;
}

function dcHighlightSnippet(asset, query) {
  const terms = extractHighlightTerms(query);
  if (!terms.length || !asset || !asset.dcMetadata || typeof asset.dcMetadata !== 'object') return '';
  const entries = Object.entries(asset.dcMetadata)
    .filter(([, value]) => {
      const text = String(value || '').toLowerCase();
      return terms.some((term) => text.includes(term));
    })
    .slice(0, 2);
  if (!entries.length) return '';
  return entries
    .map(([key, value]) => `<span class="dc-hit"><strong>${escapeHtml(key)}:</strong> ${highlightMatch(value, query)}</span>`)
    .join(' ');
}

function extractHighlightTerms(query) {
  const text = String(query || '').trim();
  if (!text) return [];

  const terms = [];
  const tokenRegex = /"([^"]+)"|(\S+)/g;
  let match = tokenRegex.exec(text);

  while (match) {
    const quoted = match[1];
    let token = String(quoted || match[2] || '').trim();
    if (token) {
      let isExcluded = false;
      while (token.startsWith('+') || token.startsWith('-')) {
        if (token.startsWith('-')) isExcluded = true;
        token = token.slice(1).trim();
      }

      if (!isExcluded && token) {
        token = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        token = token.replace(/^[^:\s]+:/, '');
        token = token.replace(/[*?]/g, '').trim();
        const upper = token.toUpperCase();
        if (token && upper !== 'AND' && upper !== 'OR' && upper !== 'NOT') {
          terms.push(token.toLowerCase());
        }
      }
    }
    match = tokenRegex.exec(text);
  }

  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
}

function hashString(input) {
  const str = String(input || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function tagColorStyle(tag) {
  const h = hashString(tag);
  const hue = h % 360;
  const sat = 55 + (h % 20);
  const light = 84 + (h % 8);
  const border = 42 + (h % 16);
  return `background:hsl(${hue} ${sat}% ${light}%);border-color:hsl(${hue} ${sat}% ${border}%);`;
}

function assetTagChipStyle(asset) {
  const firstTag = Array.isArray(asset?.tags) ? String(asset.tags[0] || '').trim() : '';
  if (firstTag) {
    return `${tagColorStyle(firstTag)}color:#141922;`;
  }
  return 'background:#3a3f4e;border-color:#5a6277;color:#e8eefc;';
}

function secondsToTimecode(timeSeconds, fps) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 25));
  const totalFrames = Math.max(0, Math.round((Number(timeSeconds) || 0) * safeFps));

  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const ff = String(frames).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
}

const PLAYER_FPS = 25;

function parseTimecodeInput(value, fps) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const parts = raw.split(':').map((p) => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return NaN;
  if (!parts.every((p) => /^\d+$/.test(p))) return NaN;

  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  const ss = Number(parts[2]);
  const ff = parts.length === 4 ? Number(parts[3]) : 0;
  if ([hh, mm, ss, ff].some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  if (mm > 59 || ss > 59 || ff >= fps) return NaN;

  return (hh * 3600) + (mm * 60) + ss + (ff / fps);
}

function openClipEditorDialog(initial) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'clip-modal-backdrop';
    overlay.innerHTML = `
      <div class="clip-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('clip_editor_title'))}">
        <h4>${escapeHtml(t('clip_editor_title'))}</h4>
        <label>${escapeHtml(t('clip_editor_name'))}
          <input id="clipEditorName" type="text" value="${escapeHtml(initial.label || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_in'))}
          <input id="clipEditorIn" type="text" value="${escapeHtml(initial.inTc || '')}" />
        </label>
        <label>${escapeHtml(t('clip_editor_out'))}
          <input id="clipEditorOut" type="text" value="${escapeHtml(initial.outTc || '')}" />
        </label>
        <div class="clip-modal-actions">
          <button type="button" id="clipEditorCancel">${escapeHtml(t('clip_editor_cancel'))}</button>
          <button type="button" id="clipEditorSave">${escapeHtml(t('clip_editor_save'))}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    const nameInput = overlay.querySelector('#clipEditorName');
    const inInput = overlay.querySelector('#clipEditorIn');
    const outInput = overlay.querySelector('#clipEditorOut');
    overlay.querySelector('#clipEditorCancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#clipEditorSave')?.addEventListener('click', () => {
      close({
        label: String(nameInput?.value || '').trim(),
        inTc: String(inInput?.value || '').trim(),
        outTc: String(outInput?.value || '').trim()
      });
    });
    nameInput?.focus();
  });
}

function thumbnailMarkup(asset) {
  const thumbSrc = escapeHtml(asset.thumbnailUrl || '');
  if (isImage(asset)) {
    return `<img class="asset-thumb" src="${escapeHtml(asset.thumbnailUrl || asset.mediaUrl || '')}" alt="${escapeHtml(asset.title)}" />`;
  }
  if (isVideo(asset)) {
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" />`;
    }
    return '<div class="asset-thumb asset-thumb-file">VIDEO</div>';
  }
  if (isAudio(asset)) {
    return '<div class="asset-thumb asset-thumb-audio">AUDIO</div>';
  }
  if (isDocument(asset)) {
    const fallbackSrc = thumbFallbackForAsset(asset);
    const fallbackEsc = escapeHtml(fallbackSrc);
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" onerror="this.onerror=null;this.src='${fallbackEsc}'" />`;
    }
    return `<img class="asset-thumb" src="${fallbackEsc}" alt="${escapeHtml(asset.title)}" />`;
  }
  return '<div class="asset-thumb asset-thumb-file">FILE</div>';
}

function assetTypeIcon(asset) {
  if (isVideo(asset)) return '🎬';
  if (isAudio(asset)) return '🎵';
  if (isImage(asset)) return '🖼️';
  if (isDocument(asset)) return '📄';
  return '📦';
}

function renderAssets(assets) {
  if (!assets.length) {
    assetGrid.innerHTML = `<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
    return;
  }

  assetGrid.innerHTML = assets
    .map((asset) => {
      const selected = selectedAssetIds.has(asset.id) ? 'selected' : '';
      const trashClass = asset.inTrash ? 'in-trash' : '';
      return `
        <article class="asset-card ${selected} ${trashClass}" data-id="${asset.id}">
          ${thumbnailMarkup(asset)}
          <div class="asset-card-body">
            <h3><span class="type-icon" aria-hidden="true">${assetTypeIcon(asset)}</span> ${highlightMatch(asset.title, currentSearchQuery)}</h3>
            <div class="asset-meta">${highlightMatch(asset.type, currentSearchQuery)} | ${highlightMatch(asset.owner, currentSearchQuery)}</div>
            <div class="asset-meta">${escapeHtml(workflowLabel(asset.status))}${(isVideo(asset) || isAudio(asset)) ? ` | ${escapeHtml(formatDuration(asset.durationSeconds))}` : ''}</div>
            ${dcHighlightSnippet(asset, currentSearchQuery) ? `<div class="asset-meta dc-hit-row">${dcHighlightSnippet(asset, currentSearchQuery)}</div>` : ''}
            <div class="asset-meta">${escapeHtml(formatDate(asset.updatedAt))}</div>
            <div class="chips">
              ${(asset.tags || []).slice(0, 4).map((tag) => `<button type="button" class="chip chip-tag-filter" data-chip-tag="${escapeHtml(tag)}" style="${tagColorStyle(tag)}">${highlightMatch(tag, currentSearchQuery)}</button>`).join('')}
            </div>
            ${asset.inTrash ? `
              <div class="card-actions">
                <button type="button" data-card-action="restore" data-id="${asset.id}">${t('restore')}</button>
                <button type="button" class="danger" data-card-action="delete" data-id="${asset.id}">${t('delete_permanent')}</button>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

function setSingleSelection(assetId) {
  selectedAssetIds.clear();
  if (assetId) {
    selectedAssetIds.add(assetId);
    selectedAssetId = assetId;
    lastSelectedAssetId = assetId;
  } else {
    selectedAssetId = null;
    lastSelectedAssetId = null;
  }
}

function addShiftRangeSelection(assetId) {
  const ids = currentAssets.map((asset) => asset.id);
  const end = ids.indexOf(assetId);
  if (end < 0) return;

  const start = ids.indexOf(lastSelectedAssetId || '');
  if (start < 0) {
    selectedAssetIds.add(assetId);
    selectedAssetId = assetId;
    lastSelectedAssetId = assetId;
    return;
  }

  const from = Math.min(start, end);
  const to = Math.max(start, end);
  for (let i = from; i <= to; i += 1) {
    selectedAssetIds.add(ids[i]);
  }
  selectedAssetId = assetId;
  lastSelectedAssetId = assetId;
}

function mediaViewer(asset, options = {}) {
  const showVideoToolsButton = options.showVideoToolsButton !== false;
  const includeSubtitleTools = options.includeSubtitleTools !== false;
  if (!asset.mediaUrl) return `<div class="empty">${escapeHtml(t('no_media'))}</div>`;

  const playbackUrl = escapeHtml(isVideo(asset) ? (asset.proxyUrl || '') : asset.mediaUrl);
  const proxyStatus = escapeHtml(asset.proxyStatus || 'not_applicable');

  if (isVideo(asset)) {
    if (!asset.proxyUrl) {
      return `
        <div class="empty">${escapeHtml(t('proxy_required'))}</div>
        <button type="button" id="ensureProxyBtn">${t('generate_proxy')}</button>
      `;
    }
    return `
      <div class="viewer-shell">
      <div class="viewer-core">
        <div class="viewer-head">
          <h4 class="viewer-asset-name">${escapeHtml(asset.title)}</h4>
          <div class="viewer-tc">${t('tc')}: <strong id="currentTimecode">00:00:00:00</strong></div>
        </div>
        <div class="viewer-resizable video-resizable">
          <video id="assetMediaEl" class="asset-viewer" controls preload="metadata" src="${playbackUrl}" poster="${escapeHtml(asset.thumbnailUrl || '')}">
            ${subtitleTrackMarkup(asset)}
          </video>
        </div>
        <div class="player-controls-box control-stickbar">
          <div class="player-toolbar-row">
            <div class="player-tools pro-tools">
              <button type="button" id="playBtn" title="${t('play')}" aria-label="${t('play')}">▶</button>
              <button type="button" id="stopBtn" title="${t('stop')}" aria-label="${t('stop')}">■</button>
              <button type="button" id="reverseFrameBtn" title="${t('reverse_frame')}" aria-label="${t('reverse_frame')}">◀◀</button>
              <button type="button" id="forwardFrameBtn" title="${t('forward_frame')}" aria-label="${t('forward_frame')}">▶▶</button>
            </div>
            <div class="timecode-bar compact-timecode control-tools">
              <button type="button" id="markInBtn">${t('set_in')}</button>
              <button type="button" id="markOutBtn">${t('set_out')}</button>
              <button type="button" id="goInBtn">${t('go_in')}</button>
              <button type="button" id="goOutBtn">${t('go_out')}</button>
              ${showVideoToolsButton ? `<button type="button" id="videoToolsBtn">${t('video_tools')}</button>` : ''}
            </div>
          </div>
        </div>
        ${includeSubtitleTools ? `
        <div class="subtitle-tools">
          <div class="subtitle-tools-header">
            <strong>${t('subtitles')}</strong>
            <span id="subtitleStatus" class="subtitle-status">${asset.subtitleUrl ? `${t('subtitle_loaded')}: ${escapeHtml(asset.subtitleLabel || asset.subtitleLang || '')}` : t('subtitle_none')}</span>
            <span id="subtitleBusy" class="subtitle-busy hidden"><span class="spinner"></span>${t('processing')}</span>
          </div>
          <div class="viewer-meta"><strong>${t('subtitle_current')}:</strong> <span id="videoSubtitleCurrent">${escapeHtml(asset.subtitleLabel || asset.subtitleLang || '-')}</span></div>
          <div class="subtitle-list-wrap">
            <div class="viewer-meta"><strong>${t('subtitle_list')}:</strong></div>
            <div id="subtitleItems" class="subtitle-items"></div>
          </div>
          <label class="video-tools-check">
            <input id="subtitleOverlayCheck" type="checkbox" ${subtitleOverlayEnabledByAsset.get(asset.id) !== false ? 'checked' : ''} />
            ${t('subtitle_overlay_enabled')}
          </label>
          <div class="subtitle-tools-row">
            <label for="subtitleLangInput">${t('subtitle_lang')}</label>
            <input id="subtitleLangInput" class="subtitle-lang-input" type="text" maxlength="12" value="${escapeHtml(asset.subtitleLang || currentLang || 'tr')}" />
            <label for="subtitleLabelInput">${t('subtitle_name')}</label>
            <input id="subtitleLabelInput" class="subtitle-name-input" type="text" maxlength="120" value="${escapeHtml(asset.subtitleLabel || '')}" />
            <button type="button" id="subtitleRenameBtn">${t('subtitle_save_name')}</button>
            <input id="subtitleFileInput" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" />
            <button type="button" id="subtitleUploadBtn">${t('subtitle_upload')}</button>
            <button type="button" id="subtitleGenerateBtn">${t('subtitle_generate')}</button>
          </div>
        </div>
        ` : ''}
      </div>
      <div class="viewer-extra">
        <div class="audio-tools">
          <div class="audio-tools-header">
            <strong>${t('audio_channels')}</strong>
            <label><input type="checkbox" id="groupChannels" checked /> ${t('group_channel_selection')}</label>
            <label class="compact-toggle"><input type="checkbox" id="toggleGraphInput" checked /> ${t('show_audio_graph')}</label>
          </div>
          <div id="channelControls" class="channel-controls"></div>
          <canvas id="audioGraph" class="audio-graph" width="900" height="240"></canvas>
        </div>
        <div class="cut-box">
        <div class="viewer-meta" id="markSummary">${t('in_label')}: --:--:--:-- | ${t('out_label')}: --:--:--:-- | ${t('segment')}: --:--:--:--</div>
        <div class="cut-label-row">
          <label>${t('clip_name')}</label>
          <input id="cutLabelInput" type="text" placeholder="${escapeHtml(t('ph_clip_name'))}" />
        </div>
        <div class="cut-actions">
          <button type="button" id="saveCutBtn">${t('save_cut')}</button>
          <button type="button" id="clearMarksBtn">${t('delete_marks')}</button>
          </div>
          <div id="cutsList" class="cuts-list"></div>
        </div>
      </div>
      </div>
    `;
  }

  if (isAudio(asset)) {
    return `
      <div class="viewer-resizable">
        <audio id="assetMediaEl" class="asset-viewer" controls src="${playbackUrl}"></audio>
      </div>
      <div class="audio-tools">
        <div class="audio-tools-header">
          <strong>${t('audio_channels')}</strong>
          <label><input type="checkbox" id="groupChannels" checked /> ${t('group_channel_selection')}</label>
          <label class="compact-toggle"><input type="checkbox" id="toggleGraphInput" checked /> ${t('show_audio_graph')}</label>
        </div>
        <div id="channelControls" class="channel-controls"></div>
        <canvas id="audioGraph" class="audio-graph" width="900" height="240"></canvas>
      </div>
    `;
  }

  if (isImage(asset)) {
    return `<div class="viewer-resizable"><img class="asset-viewer" src="${playbackUrl}" alt="${escapeHtml(asset.title)}" /></div>`;
  }

  if (isPdf(asset)) {
    return `
      <div class="viewer-resizable">
        <div id="pdfRenderViewport" class="pdf-render-viewport asset-viewer">
          <canvas id="pdfCanvas" class="pdf-canvas"></canvas>
          <div id="pdfTextLayer" class="pdf-text-layer"></div>
          <div id="pdfOcrLayer" class="pdf-ocr-layer"></div>
        </div>
      </div>
      <div class="doc-preview-shell">
        <div class="viewer-meta">${t('open_pdf')}: <a id="pdfOpenFileLink" href="${playbackUrl}" target="_blank" rel="noreferrer">${t('open_file')}</a></div>
        <div class="pdf-toolbar-row">
          <button type="button" id="pdfPagePrevBtn" class="doc-search-nav">&lt;</button>
          <span id="pdfPageInfo" class="viewer-meta"></span>
          <button type="button" id="pdfPageNextBtn" class="doc-search-nav">&gt;</button>
          <button type="button" id="pdfOpenPageBtn" class="doc-search-nav">${t('open_file')}</button>
        </div>
        ${documentSearchControls()}
        <div id="pdfSearchResults" class="pdf-search-results"></div>
      </div>
    `;
  }

  if (isDocument(asset)) {
    if (isTextPreviewable(asset)) {
      return `
        <div class="doc-preview-shell">
          <div class="viewer-meta">${t('open_document')}: <a href="${playbackUrl}" target="_blank" rel="noreferrer">${t('open_file')}</a></div>
          ${documentSearchControls()}
          <pre id="docPreviewBox" class="doc-preview">${escapeHtml(t('preview_loading'))}</pre>
        </div>
      `;
    }
    return `
      <div class="doc-preview-shell">
        <div class="viewer-meta">${t('open_document')}: <a href="${playbackUrl}" target="_blank" rel="noreferrer">${t('open_file')}</a></div>
        ${documentSearchControls()}
        <pre id="docPreviewBox" class="doc-preview">${escapeHtml(t('preview_loading'))}</pre>
      </div>
    `;
  }

  return `<a href="${playbackUrl}" target="_blank" rel="noreferrer">${t('open_attached')}</a>`;
}

function detailMarkup(asset, workflow) {
  const dc = asset.dcMetadata || {};
  const trashStatus = asset.inTrash ? `<strong>${t('in_trash')}</strong>` : t('active');
  const trashActions = asset.inTrash
    ? `
      <button type="button" id="restoreAssetBtn">${t('restore')}</button>
      <button type="button" id="deleteAssetBtn">${t('delete_permanent')}</button>
    `
    : `
      <button type="button" id="trashAssetBtn">${t('move_to_trash')}</button>
    `;

  const viewerSection = isVideo(asset)
    ? `
      <h4>${t('asset_viewer')}</h4>
      <button type="button" id="openVideoToolsModalBtn">${t('video_tools')}</button>
      ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: false })}
    `
    : `
      <h4>${t('asset_viewer')}</h4>
      ${mediaViewer(asset)}
    `;

  const metadataSection = `
    <h3>${highlightMatch(asset.title, currentSearchQuery)}</h3>
    <p>${highlightMatch(asset.description || t('no_description'), currentSearchQuery)}</p>
    <div class="asset-meta">${t('owner')}: ${highlightMatch(asset.owner, currentSearchQuery)} | ${t('type')}: ${highlightMatch(asset.type, currentSearchQuery)} | ${t('duration')}: ${escapeHtml(asset.durationSeconds)}s</div>
    <div class="asset-meta">${t('status')}: <strong>${escapeHtml(workflowLabel(asset.status))}</strong></div>
    <div class="asset-meta">${t('trash')}: ${trashStatus}</div>
    ${dcHighlightSnippet(asset, currentSearchQuery) ? `<div class="asset-meta dc-hit-row">${dcHighlightSnippet(asset, currentSearchQuery)}</div>` : ''}
    <div class="timecode-bar">
      ${asset.mediaUrl ? `<button type="button" id="downloadAssetBtn">${t('download_asset')}</button>` : ''}
      ${trashActions}
    </div>
    <div class="chips">${asset.tags.map((tag) => `<span class="chip" style="${tagColorStyle(tag)}color:#141922;">${highlightMatch(tag, currentSearchQuery)}</span>`).join('')}</div>

    <form id="editForm" class="inline-grid">
      <h4>${t('edit_metadata')}</h4>
      <input name="title" value="${escapeHtml(asset.title)}" required />
      <input name="owner" value="${escapeHtml(asset.owner)}" required />
      <input name="tags" value="${escapeHtml(asset.tags.join(', '))}" placeholder="${escapeHtml(t('ph_inline_tags'))}" />
      <textarea name="description">${escapeHtml(asset.description || '')}</textarea>
      <input name="durationSeconds" type="number" min="0" value="${escapeHtml(asset.durationSeconds)}" />
      <h4>${t('dublin_core')}</h4>
      <div class="dc-grid">
        <label>${t('dc_title')}<input name="dcTitle" value="${escapeHtml(dc.title || '')}" /></label>
        <label>${t('dc_creator')}<input name="dcCreator" value="${escapeHtml(dc.creator || '')}" /></label>
        <label>${t('dc_subject')}<input name="dcSubject" value="${escapeHtml(dc.subject || '')}" /></label>
        <label>${t('dc_description')}<textarea name="dcDescription">${escapeHtml(dc.description || '')}</textarea></label>
        <label>${t('dc_publisher')}<input name="dcPublisher" value="${escapeHtml(dc.publisher || '')}" /></label>
        <label>${t('dc_contributor')}<input name="dcContributor" value="${escapeHtml(dc.contributor || '')}" /></label>
        <label>${t('dc_date')}<input name="dcDate" value="${escapeHtml(dc.date || '')}" /></label>
        <label>${t('dc_type')}<input name="dcType" value="${escapeHtml(dc.type || '')}" /></label>
        <label>${t('dc_format')}<input name="dcFormat" value="${escapeHtml(dc.format || '')}" /></label>
        <label>${t('dc_identifier')}<input name="dcIdentifier" value="${escapeHtml(dc.identifier || '')}" /></label>
        <label>${t('dc_source')}<input name="dcSource" value="${escapeHtml(dc.source || '')}" /></label>
        <label>${t('dc_language')}<input name="dcLanguage" value="${escapeHtml(dc.language || '')}" /></label>
        <label>${t('dc_relation')}<input name="dcRelation" value="${escapeHtml(dc.relation || '')}" /></label>
        <label>${t('dc_coverage')}<input name="dcCoverage" value="${escapeHtml(dc.coverage || '')}" /></label>
        <label>${t('dc_rights')}<input name="dcRights" value="${escapeHtml(dc.rights || '')}" /></label>
      </div>
      <button type="submit">${t('save_metadata')}</button>
    </form>

    <form id="transitionForm" class="inline-grid">
      <h4>${t('workflow_transition')}</h4>
      <select name="status">
        ${workflow
          .map(
            (status) =>
              `<option value="${escapeHtml(status)}" ${status === asset.status ? 'selected' : ''}>${escapeHtml(workflowLabel(status))}</option>`
          )
          .join('')}
      </select>
      <button type="submit">${t('move_status')}</button>
    </form>

    <form id="versionForm" class="inline-grid">
      <h4>${t('add_version')}</h4>
      <input name="label" placeholder="${escapeHtml(t('ph_version_label'))}" />
      <input name="note" placeholder="${t('what_changed')}" />
      <button type="submit">${t('create_version')}</button>
    </form>

    <h4>${t('versions')}</h4>
    ${asset.versions
      .map(
        (v) => `
          <div class="version">
            <strong>${escapeHtml(v.label)}</strong> - ${escapeHtml(v.note)}<br />
            <span class="asset-meta">${new Date(v.createdAt).toLocaleString()}</span>
          </div>
        `
      )
      .join('')}
  `;

  if (isVideo(asset)) {
    return `
      <div class="detail-video-layout">
        <div class="detail-video-fixed">${viewerSection}</div>
        <div class="detail-video-meta">${metadataSection}</div>
      </div>
    `;
  }

  return `
    ${metadataSection}
    ${viewerSection}
  `;
}

function multiSelectionDetailMarkup(selectedAssets) {
  return `
    <h3>${escapeHtml(t('multi_selected'))}</h3>
    <div class="asset-meta">${escapeHtml(t('selected_count'))}: <strong>${selectedAssets.length}</strong></div>
    <div class="bulk-box">
      <div class="chips">
        ${selectedAssets.slice(0, 40).map((asset) => `<span class="chip multi-chip" style="${assetTagChipStyle(asset)}">${escapeHtml(asset.title)}</span>`).join('')}
      </div>
      <div class="timecode-bar">
        <button type="button" id="bulkDeleteBtn">${escapeHtml(t('bulk_delete_selected'))}</button>
        <button type="button" id="bulkClearBtn">${escapeHtml(t('bulk_clear_selection'))}</button>
      </div>
    </div>
  `;
}

async function openMultiSelectionDetail() {
  const selectedAssets = currentAssets.filter((asset) => selectedAssetIds.has(asset.id));
  if (selectedAssets.length <= 1) return false;

  setPanelVisible('panelDetail', true);
  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanup = null;
  }

  assetDetail.innerHTML = multiSelectionDetailMarkup(selectedAssets);
  assetDetail.classList.remove('video-detail-mode');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const bulkClearBtn = document.getElementById('bulkClearBtn');

  bulkDeleteBtn?.addEventListener('click', async () => {
    const ids = [...selectedAssetIds];
    if (!ids.length) return;
    const ok = confirm(tf('bulk_delete_confirm', { count: ids.length }));
    if (!ok) return;

    for (const id of ids) {
      try {
        await deleteApi(`/api/assets/${id}`);
      } catch (_error) {
        // Continue to delete others.
      }
    }
    setSingleSelection(null);
    assetDetail.textContent = t('select_asset');
    assetDetail.classList.remove('video-detail-mode');
    await loadAssets();
  });

  bulkClearBtn?.addEventListener('click', () => {
    setSingleSelection(null);
    renderAssets(currentAssets);
    assetDetail.textContent = t('select_asset');
    assetDetail.classList.remove('video-detail-mode');
  });

  return true;
}

function initFrameControls(mediaEl, asset, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const playBtn = byId('playBtn');
  const stopBtn = byId('stopBtn');
  const reverseFrameBtn = byId('reverseFrameBtn');
  const forwardFrameBtn = byId('forwardFrameBtn');
  const currentTimecodeEl = byId('currentTimecode');
  const markSummary = byId('markSummary');
  const markInBtn = byId('markInBtn');
  const markOutBtn = byId('markOutBtn');
  const goInBtn = byId('goInBtn');
  const goOutBtn = byId('goOutBtn');
  const clearMarksBtn = byId('clearMarksBtn');
  const saveCutBtn = byId('saveCutBtn');
  const cutLabelInput = byId('cutLabelInput');
  const cutsList = byId('cutsList');

  if (!playBtn || !stopBtn || !reverseFrameBtn || !forwardFrameBtn || !currentTimecodeEl || !markSummary) {
    return () => {};
  }

  const marks = cutMarksByAsset.get(asset.id) || { in: null, out: null };
  cutMarksByAsset.set(asset.id, marks);
  const cuts = Array.isArray(asset.cuts) ? [...asset.cuts] : [];

  const getFps = () => PLAYER_FPS;

  const updateTimecode = () => {
    currentTimecodeEl.textContent = secondsToTimecode(mediaEl.currentTime, getFps());
  };

  const updateMarks = () => {
    const inTc = marks.in == null ? '--:--:--:--' : secondsToTimecode(marks.in, getFps());
    const outTc = marks.out == null ? '--:--:--:--' : secondsToTimecode(marks.out, getFps());
    const segment = marks.in != null && marks.out != null && marks.out >= marks.in
      ? secondsToTimecode(marks.out - marks.in, getFps())
      : '--:--:--:--';
    markSummary.textContent = `${t('in_label')}: ${inTc} | ${t('out_label')}: ${outTc} | ${t('segment')}: ${segment}`;
  };

  const renderCuts = () => {
    if (!cutsList) return;
    if (!cuts.length) {
      cutsList.innerHTML = '';
      return;
    }
    cutsList.innerHTML = cuts
      .map((cut) => {
        const seg = Math.max(0, Number(cut.outPointSeconds) - Number(cut.inPointSeconds));
        return `
          <div class="cut-item" data-cut-id="${cut.cutId}">
            <div class="cut-item-meta">
              <strong>${highlightMatch(cut.label || 'Cut', currentSearchQuery)}</strong>
              <span>${t('in_label')}: ${secondsToTimecode(cut.inPointSeconds, getFps())}</span>
              <span>${t('out_label')}: ${secondsToTimecode(cut.outPointSeconds, getFps())}</span>
              <span>${t('segment')}: ${secondsToTimecode(seg, getFps())}</span>
            </div>
            <div class="cut-item-actions">
              <button type="button" data-cut-action="edit" data-cut-id="${cut.cutId}">${t('edit_clip')}</button>
              <button type="button" data-cut-action="jump" data-cut-id="${cut.cutId}">${t('jump_to_cut')}</button>
              <button type="button" data-cut-action="delete" data-cut-id="${cut.cutId}">${t('delete_cut')}</button>
            </div>
          </div>
        `;
      })
      .join('');
  };

  const step = (direction) => {
    const delta = direction / getFps();
    const nextTime = Math.max(0, mediaEl.currentTime + delta);
    mediaEl.pause();
    mediaEl.currentTime = nextTime;
  };

  const syncPlayButton = () => {
    const isPaused = mediaEl.paused || mediaEl.ended;
    playBtn.textContent = isPaused ? '▶' : '⏸';
    playBtn.title = isPaused ? t('play') : t('pause');
    playBtn.setAttribute('aria-label', isPaused ? t('play') : t('pause'));
  };

  const onPlay = async () => {
    if (mediaEl.paused || mediaEl.ended) {
      await mediaEl.play();
    } else {
      mediaEl.pause();
    }
  };

  const onStop = () => {
    mediaEl.pause();
    mediaEl.currentTime = 0;
    updateTimecode();
    syncPlayButton();
  };

  const onMarkIn = () => {
    marks.in = mediaEl.currentTime;
    updateMarks();
  };

  const onMarkOut = () => {
    marks.out = mediaEl.currentTime;
    updateMarks();
  };

  const onGoIn = () => {
    if (marks.in != null) mediaEl.currentTime = marks.in;
  };

  const onGoOut = () => {
    if (marks.out != null) mediaEl.currentTime = marks.out;
  };

  const onClear = () => {
    marks.in = null;
    marks.out = null;
    updateMarks();
  };

  const onSaveCut = async () => {
    if (marks.in == null || marks.out == null || marks.out < marks.in) return;
    const clipLabel = String(cutLabelInput?.value || '').trim();
    const created = await api(`/api/assets/${asset.id}/cuts`, {
      method: 'POST',
      body: JSON.stringify({ inPointSeconds: marks.in, outPointSeconds: marks.out, label: clipLabel })
    });
    cuts.unshift(created);
    renderCuts();
    if (cutLabelInput) cutLabelInput.value = '';
  };

  const onCutsAction = async (event) => {
    const button = event.target.closest('button[data-cut-action]');
    if (!button) return;
    const cutId = button.dataset.cutId;
    const action = button.dataset.cutAction;
    const cut = cuts.find((c) => c.cutId === cutId);
    if (!cut) return;

    if (action === 'jump') {
      mediaEl.currentTime = Number(cut.inPointSeconds) || 0;
      return;
    }
    if (action === 'edit') {
      const next = await openClipEditorDialog({
        label: String(cut.label || ''),
        inTc: secondsToTimecode(cut.inPointSeconds, getFps()),
        outTc: secondsToTimecode(cut.outPointSeconds, getFps())
      });
      if (!next) return;
      if (!next.label) return;

      const nextInPoint = parseTimecodeInput(next.inTc, getFps());
      const nextOutPoint = parseTimecodeInput(next.outTc, getFps());
      if (!Number.isFinite(nextInPoint) || !Number.isFinite(nextOutPoint)) {
        alert(t('invalid_timecode'));
        return;
      }
      if (nextOutPoint < nextInPoint) {
        alert(t('invalid_in_out'));
        return;
      }
      const updated = await api(`/api/assets/${asset.id}/cuts/${cutId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: next.label,
          inPointSeconds: nextInPoint,
          outPointSeconds: nextOutPoint
        })
      });
      const idx = cuts.findIndex((c) => c.cutId === cutId);
      if (idx >= 0) cuts[idx] = { ...cuts[idx], ...updated };
      renderCuts();
      return;
    }
    if (action === 'delete') {
      await deleteApi(`/api/assets/${asset.id}/cuts/${cutId}`);
      const idx = cuts.findIndex((c) => c.cutId === cutId);
      if (idx >= 0) cuts.splice(idx, 1);
      renderCuts();
    }
  };

  playBtn.addEventListener('click', onPlay);
  stopBtn.addEventListener('click', onStop);
  reverseFrameBtn.addEventListener('click', () => step(-1));
  forwardFrameBtn.addEventListener('click', () => step(1));
  markInBtn?.addEventListener('click', onMarkIn);
  markOutBtn?.addEventListener('click', onMarkOut);
  goInBtn?.addEventListener('click', onGoIn);
  goOutBtn?.addEventListener('click', onGoOut);
  clearMarksBtn?.addEventListener('click', onClear);
  saveCutBtn?.addEventListener('click', onSaveCut);
  cutsList?.addEventListener('click', onCutsAction);

  mediaEl.addEventListener('timeupdate', updateTimecode);
  mediaEl.addEventListener('seeked', updateTimecode);
  mediaEl.addEventListener('play', syncPlayButton);
  mediaEl.addEventListener('pause', syncPlayButton);
  mediaEl.addEventListener('ended', syncPlayButton);
  updateTimecode();
  updateMarks();
  renderCuts();
  syncPlayButton();

  return () => {
    playBtn.removeEventListener('click', onPlay);
    stopBtn.removeEventListener('click', onStop);
    markInBtn?.removeEventListener('click', onMarkIn);
    markOutBtn?.removeEventListener('click', onMarkOut);
    goInBtn?.removeEventListener('click', onGoIn);
    goOutBtn?.removeEventListener('click', onGoOut);
    clearMarksBtn?.removeEventListener('click', onClear);
    saveCutBtn?.removeEventListener('click', onSaveCut);
    cutsList?.removeEventListener('click', onCutsAction);
    mediaEl.removeEventListener('timeupdate', updateTimecode);
    mediaEl.removeEventListener('seeked', updateTimecode);
    mediaEl.removeEventListener('play', syncPlayButton);
    mediaEl.removeEventListener('pause', syncPlayButton);
    mediaEl.removeEventListener('ended', syncPlayButton);
  };
}

function initAudioTools(mediaEl, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const controlsWrap = byId('channelControls');
  const graphCanvas = byId('audioGraph');
  const toggleGraphInput = byId('toggleGraphInput');
  const groupChannelsInput = byId('groupChannels');

  if (!controlsWrap || !graphCanvas || !toggleGraphInput || !groupChannelsInput) {
    return () => {};
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    controlsWrap.innerHTML = `<div class="empty">${escapeHtml(t('webaudio_unavailable'))}</div>`;
    return () => {};
  }

  const ctx = new AudioContextCtor();
  const source = ctx.createMediaElementSource(mediaEl);
  const channelCount = Math.max(1, Math.min(8, source.channelCount || 2));
  const splitter = ctx.createChannelSplitter(channelCount);
  const merger = ctx.createChannelMerger(channelCount);
  const masterGain = ctx.createGain();
  const gains = [];
  const analysers = [];
  const selected = Array.from({ length: channelCount }, () => true);
  let rafId = null;

  source.connect(splitter);

  for (let i = 0; i < channelCount; i += 1) {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    splitter.connect(gain, i, 0);
    gain.connect(merger, 0, i);
    splitter.connect(analyser, i, 0);

    gains.push(gain);
    analysers.push(analyser);
  }

  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
  const applyMasterVolume = () => {
    const base = clamp01(Number.isFinite(mediaEl.volume) ? mediaEl.volume : 1);
    masterGain.gain.value = mediaEl.muted ? 0 : base;
  };
  merger.connect(masterGain);
  masterGain.connect(ctx.destination);
  applyMasterVolume();

  controlsWrap.innerHTML = selected
    .map(
      (_enabled, index) => `
        <label class="channel-pill">
          <input type="checkbox" data-channel-index="${index}" checked />
          CH ${index + 1}
        </label>
      `
    )
    .join('');

  const applyGains = () => {
    gains.forEach((gain, index) => {
      gain.gain.value = selected[index] ? 1 : 0;
    });
  };

  const onChannelChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const index = Number(target.dataset.channelIndex);
    if (Number.isNaN(index)) return;

    if (groupChannelsInput.checked) {
      const nextValue = target.checked;
      selected.fill(nextValue);
      controlsWrap.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = nextValue;
      });
    } else {
      selected[index] = target.checked;
    }

    applyGains();
  };

  const g = graphCanvas.getContext('2d');
  if (!g) {
    controlsWrap.innerHTML = `<div class="empty">${escapeHtml(t('audiograph_unsupported'))}</div>`;
    source.disconnect();
    splitter.disconnect();
    merger.disconnect();
    gains.forEach((node) => node.disconnect());
    analysers.forEach((node) => node.disconnect());
    ctx.close().catch(() => {});
    return () => {};
  }

  const onMediaPlay = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const ensureAudioContext = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const onVolumeChange = () => {
    applyMasterVolume();
  };

  controlsWrap.addEventListener('change', onChannelChange);
  mediaEl.addEventListener('play', onMediaPlay);
  mediaEl.addEventListener('playing', ensureAudioContext);
  mediaEl.addEventListener('volumechange', ensureAudioContext);
  mediaEl.addEventListener('volumechange', onVolumeChange);
  window.addEventListener('pointerdown', ensureAudioContext, { passive: true });

  const draw = () => {
    const width = graphCanvas.width;
    const height = graphCanvas.height;
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#121212';
    g.fillRect(0, 0, width, height);

    const rowHeight = height / channelCount;
    analysers.forEach((analyser, channelIndex) => {
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      const yOffset = rowHeight * channelIndex;
      const bins = 48;
      const barW = width / bins;
      g.fillStyle = selected[channelIndex] ? '#58d68d' : '#7f8c8d';
      for (let i = 0; i < bins; i += 1) {
        const idx = Math.min(freqData.length - 1, Math.floor((i / bins) * freqData.length));
        const magnitude = freqData[idx] / 255;
        const barH = Math.max(1, magnitude * (rowHeight - 20));
        const x = i * barW;
        const y = yOffset + rowHeight - barH - 4;
        g.fillRect(x + 1, y, Math.max(1, barW - 2), barH);
      }

      g.fillStyle = '#f8f9f9';
      g.font = '12px IBM Plex Sans';
      g.fillText(`CH ${channelIndex + 1} ${selected[channelIndex] ? t('channel_on') : t('channel_off')}`, 8, yOffset + 14);
    });

    rafId = requestAnimationFrame(draw);
  };

  draw();

  const onToggleGraph = () => {
    graphCanvas.classList.toggle('hidden', !toggleGraphInput.checked);
  };

  toggleGraphInput.addEventListener('change', onToggleGraph);
  onToggleGraph();

  return () => {
    toggleGraphInput.removeEventListener('change', onToggleGraph);
    controlsWrap.removeEventListener('change', onChannelChange);
    mediaEl.removeEventListener('play', onMediaPlay);
    mediaEl.removeEventListener('playing', ensureAudioContext);
    mediaEl.removeEventListener('volumechange', ensureAudioContext);
    mediaEl.removeEventListener('volumechange', onVolumeChange);
    window.removeEventListener('pointerdown', ensureAudioContext);
    if (rafId) cancelAnimationFrame(rafId);
    source.disconnect();
    splitter.disconnect();
    merger.disconnect();
    masterGain.disconnect();
    gains.forEach((node) => node.disconnect());
    analysers.forEach((node) => node.disconnect());
    ctx.close().catch(() => {});
  };
}

function initDocumentPreview(asset) {
  const box = document.getElementById('docPreviewBox');
  const searchInput = document.getElementById('docSearchInput');
  const runBtn = document.getElementById('docSearchRunBtn');
  const prevBtn = document.getElementById('docSearchPrevBtn');
  const nextBtn = document.getElementById('docSearchNextBtn');
  const searchMeta = document.getElementById('docSearchMeta');
  if (!box) return () => {};

  let activeMatchIndex = -1;
  const updateSearchMeta = (count) => {
    if (!searchMeta) return;
    if (!count) {
      searchMeta.textContent = t('preview_search_empty');
      return;
    }
    const current = activeMatchIndex >= 0 ? (activeMatchIndex + 1) : 1;
    searchMeta.textContent = `${current}/${count}`;
  };

  const focusMatchAt = (index) => {
    const marks = Array.from(box.querySelectorAll('mark.search-hit'));
    if (!marks.length) {
      activeMatchIndex = -1;
      updateSearchMeta(0);
      return;
    }
    const safeIndex = ((index % marks.length) + marks.length) % marks.length;
    activeMatchIndex = safeIndex;
    marks.forEach((el, i) => {
      el.classList.toggle('search-hit-active', i === safeIndex);
    });
    marks[safeIndex].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    updateSearchMeta(marks.length);
  };

  const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const renderPreviewText = (fullText, query) => {
    const source = String(fullText || '');
    const q = String(query || '').trim();
    if (!q) {
      if (preferRich && richPreviewHtml) {
        box.classList.add('doc-preview-rich');
        box.innerHTML = richPreviewHtml;
      } else {
        box.classList.remove('doc-preview-rich');
        box.textContent = source;
      }
      if (searchMeta) searchMeta.textContent = '';
      activeMatchIndex = -1;
      return;
    }

    const pattern = new RegExp(escapeRegExp(q), 'gi');
    let match;
    let last = 0;
    let count = 0;
    let out = '';
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      out += `${escapeHtml(source.slice(last, start))}<mark class="search-hit">${escapeHtml(source.slice(start, end))}</mark>`;
      last = end;
      count += 1;
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
    out += escapeHtml(source.slice(last));
    box.classList.remove('doc-preview-rich');
    box.innerHTML = out;
    if (count) {
      focusMatchAt(0);
    } else {
      activeMatchIndex = -1;
      if (searchMeta) searchMeta.textContent = t('preview_search_empty');
    }
  };

  let cancelled = false;
  let previewText = '';
  let richPreviewHtml = '';
  let preferRich = false;
  (async () => {
    try {
      let text = '';
      try {
        const extracted = await api(`/api/assets/${asset.id}/preview-text`);
        text = String(extracted.text || '');
        richPreviewHtml = String(extracted.html || '');
        preferRich = String(extracted.mode || '').toLowerCase() === 'html' && Boolean(richPreviewHtml.trim());
      } catch (_error) {
        text = '';
        richPreviewHtml = '';
        preferRich = false;
      }
      if (!text && isTextPreviewable(asset)) {
        const res = await fetch(asset.mediaUrl);
        if (res.ok) text = await res.text();
      }
      if (cancelled) return;
      if (text.length > 12000) {
        text = `${text.slice(0, 12000)}\n...\n`;
      }
      previewText = text;
      renderPreviewText(previewText, searchInput?.value || '');
      if (!previewText && !richPreviewHtml) {
        box.textContent = t('preview_not_available');
      }
    } catch (_error) {
      if (!cancelled) box.textContent = t('preview_not_available');
    }
  })();

  const onSearch = () => {
    if (cancelled) return;
    renderPreviewText(previewText, searchInput?.value || '');
  };
  const onNext = () => {
    if (cancelled) return;
    const q = String(searchInput?.value || '').trim();
    if (!q) {
      searchInput?.focus();
      return;
    }
    const marks = box.querySelectorAll('mark.search-hit');
    if (!marks.length) return;
    focusMatchAt(activeMatchIndex + 1);
  };
  const onPrev = () => {
    if (cancelled) return;
    const q = String(searchInput?.value || '').trim();
    if (!q) {
      searchInput?.focus();
      return;
    }
    const marks = box.querySelectorAll('mark.search-hit');
    if (!marks.length) return;
    focusMatchAt(activeMatchIndex - 1);
  };
  searchInput?.addEventListener('input', onSearch);
  runBtn?.addEventListener('click', onSearch);
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);

  return () => {
    cancelled = true;
    searchInput?.removeEventListener('input', onSearch);
    runBtn?.removeEventListener('click', onSearch);
    prevBtn?.removeEventListener('click', onPrev);
    nextBtn?.removeEventListener('click', onNext);
  };
}

function initPdfSearch(asset) {
  const pdfViewport = document.getElementById('pdfRenderViewport');
  const pdfCanvas = document.getElementById('pdfCanvas');
  const pdfTextLayer = document.getElementById('pdfTextLayer');
  const pdfOcrLayer = document.getElementById('pdfOcrLayer');
  const openFileLink = document.getElementById('pdfOpenFileLink');
  const openPageBtn = document.getElementById('pdfOpenPageBtn');
  const pagePrevBtn = document.getElementById('pdfPagePrevBtn');
  const pageNextBtn = document.getElementById('pdfPageNextBtn');
  const pageInfo = document.getElementById('pdfPageInfo');
  const searchInput = document.getElementById('docSearchInput');
  const runBtn = document.getElementById('docSearchRunBtn');
  const prevBtn = document.getElementById('docSearchPrevBtn');
  const nextBtn = document.getElementById('docSearchNextBtn');
  const searchMeta = document.getElementById('docSearchMeta');
  const resultsBox = document.getElementById('pdfSearchResults');
  if (!pdfViewport || !pdfCanvas || !pdfTextLayer || !pdfOcrLayer || !searchInput || !runBtn || !nextBtn || !resultsBox) return () => {};
  if (!window.pdfjsLib) {
    if (searchMeta) searchMeta.textContent = t('pdf_preview_unavailable');
    return () => {};
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const baseUrl = String(asset.mediaUrl || '').split('#')[0];
  const canvasCtx = pdfCanvas.getContext('2d');
  if (!canvasCtx) return () => {};

  let destroyed = false;
  let renderToken = 0;
  let pdfDoc = null;
  let pageTextCache = new Map();
  let currentOcrWidth = 0;
  let ocrBoxesByPage = new Map();
  let totalPages = 1;
  let currentPage = 1;
  let matches = [];
  let activeIndex = -1;

  const renderPageInfo = () => {
    if (!pageInfo) return;
    pageInfo.textContent = `${currentPage}/${totalPages}`;
  };

  const clearOcrBoxes = () => {
    pdfOcrLayer.innerHTML = '';
  };

  const renderOcrBoxesForPage = (pageNum) => {
    clearOcrBoxes();
    const boxes = ocrBoxesByPage.get(pageNum) || [];
    if (!boxes.length) return;
    const pageWidth = pdfCanvas.width || 1;
    const pageHeight = pdfCanvas.height || 1;
    const srcWidth = Math.max(1, Number(currentOcrWidth) || pageWidth);
    const scale = pageWidth / srcWidth;
    boxes.forEach((b, idx) => {
      const el = document.createElement('div');
      el.className = `pdf-ocr-box${idx === 0 ? ' active' : ''}`;
      el.style.left = `${Math.max(0, Math.round((Number(b.left) || 0) * scale))}px`;
      el.style.top = `${Math.max(0, Math.round((Number(b.top) || 0) * scale))}px`;
      el.style.width = `${Math.max(1, Math.round((Number(b.width) || 0) * scale))}px`;
      el.style.height = `${Math.max(1, Math.round((Number(b.height) || 0) * scale))}px`;
      pdfOcrLayer.appendChild(el);
    });
  };

  const refreshOpenLink = () => {
    if (!openFileLink) return;
    const q = String(searchInput.value || '').trim();
    const hash = q ? `#page=${currentPage}&search=${encodeURIComponent(q)}` : `#page=${currentPage}`;
    openFileLink.href = `${baseUrl}${hash}`;
  };

  const setPage = (page) => {
    currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
    renderPage(currentPage).catch(() => {});
    refreshOpenLink();
    renderPageInfo();
  };

  const renderActiveMatch = () => {
    if (!searchMeta) return;
    if (!matches.length || activeIndex < 0) {
      searchMeta.textContent = t('preview_search_empty');
      return;
    }
    const current = matches[activeIndex];
    const pos = `${activeIndex + 1}/${matches.length}`;
    const pageText = `p.${current.page}`;
    const snippet = String(current.snippet || '').trim();
    searchMeta.textContent = snippet ? `${pos} | ${pageText} | ${snippet}` : `${pos} | ${pageText}`;
  };

  const highlightSnippet = (text, query) => {
    const source = String(text || '');
    const ranges = findMatchRanges(source, query);
    if (!ranges.length) return escapeHtml(source);
    const [hitStart, hitEnd] = ranges[0];
    const start = Math.max(0, hitStart - 48);
    const end = Math.min(source.length, hitEnd + 72);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < source.length ? '...' : '';
    const clipped = source.slice(start, end);
    const clippedRanges = ranges
      .map(([a, b]) => [a - start, b - start])
      .filter(([a, b]) => a >= 0 && b <= clipped.length);
    return `${prefix}${highlightTextByRanges(clipped, clippedRanges)}${suffix}`;
  };

  const renderResultsList = () => {
    resultsBox.innerHTML = '';
  };

  const countOccurrences = (source, needle) => {
    return findMatchRanges(source, needle).length;
  };

  const pageText = async (pageNum) => {
    if (pageTextCache.has(pageNum)) return pageTextCache.get(pageNum);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it) => String(it.str || '')).join('');
    pageTextCache.set(pageNum, text);
    return text;
  };

  const clearTextHighlights = () => {
    pdfTextLayer.querySelectorAll('span[data-pdf-original-text]').forEach((span) => {
      const original = span.getAttribute('data-pdf-original-text') || '';
      span.textContent = original;
      span.removeAttribute('data-pdf-original-text');
      span.classList.remove('search-hit-active');
    });
  };

  const applyTextHighlights = () => {
    clearTextHighlights();
    const query = String(searchInput.value || '').trim();
    if (!query) return;
    const spans = Array.from(pdfTextLayer.querySelectorAll('span'));
    if (!spans.length) return;

    let full = '';
    const segments = spans.map((span) => {
      const text = String(span.textContent || '');
      const start = full.length;
      full += text;
      return { span, text, start, end: start + text.length };
    });
    const ranges = findMatchRanges(full, query);
    if (!ranges.length) return;

    const activeSpanSet = new Set();
    segments.forEach((seg) => {
      const localRanges = [];
      ranges.forEach(([a, b]) => {
        const s = Math.max(a, seg.start);
        const e = Math.min(b, seg.end);
        if (s < e) localRanges.push([s - seg.start, e - seg.start]);
      });
      if (!localRanges.length) return;
      seg.span.setAttribute('data-pdf-original-text', seg.text);
      seg.span.innerHTML = highlightTextByRanges(seg.text, localRanges);
      activeSpanSet.add(seg.span);
    });

    const firstActive = Array.from(activeSpanSet)[0];
    if (firstActive) firstActive.classList.add('search-hit-active');
  };

  const renderPage = async (pageNum) => {
    if (!pdfDoc || destroyed) return;
    const token = ++renderToken;
    const page = await pdfDoc.getPage(pageNum);
    const width = Math.max(420, pdfViewport.clientWidth || 900);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = width / unscaled.width;
    const viewport = page.getViewport({ scale });

    pdfCanvas.width = Math.ceil(viewport.width);
    pdfCanvas.height = Math.ceil(viewport.height);
    pdfCanvas.style.width = `${Math.ceil(viewport.width)}px`;
    pdfCanvas.style.height = `${Math.ceil(viewport.height)}px`;
    pdfTextLayer.style.width = `${Math.ceil(viewport.width)}px`;
    pdfTextLayer.style.height = `${Math.ceil(viewport.height)}px`;
    pdfOcrLayer.style.width = `${Math.ceil(viewport.width)}px`;
    pdfOcrLayer.style.height = `${Math.ceil(viewport.height)}px`;
    pdfTextLayer.innerHTML = '';
    clearOcrBoxes();

    await page.render({ canvasContext: canvasCtx, viewport }).promise;
    if (destroyed || token !== renderToken) return;

    const textContent = await page.getTextContent();
    await window.pdfjsLib.renderTextLayer({
      textContent,
      container: pdfTextLayer,
      viewport,
      textDivs: []
    }).promise;
    if (destroyed || token !== renderToken) return;

    applyTextHighlights();
    renderOcrBoxesForPage(pageNum);
  };

  const moveMatch = (delta) => {
    if (!matches.length) return;
    activeIndex = (activeIndex + delta + matches.length) % matches.length;
    setPage(matches[activeIndex].page);
    renderActiveMatch();
    renderResultsList();
  };

  const runSearch = async () => {
    const query = String(searchInput.value || '').trim();
    if (!query) {
      matches = [];
      activeIndex = -1;
      if (searchMeta) searchMeta.textContent = '';
      resultsBox.innerHTML = '';
      return;
    }
    try {
      const searchWidth = Math.max(900, Math.round(pdfViewport.clientWidth || 1200));
      const result = await api(`/api/assets/${asset.id}/pdf-search-ocr?q=${encodeURIComponent(query)}&lang=tur+eng&width=${searchWidth}`);
      currentOcrWidth = Number(result.ocrWidth) || searchWidth;
      const rawMatches = Array.isArray(result.matches) ? result.matches : [];
      ocrBoxesByPage = new Map();
      rawMatches.forEach((m) => {
        const p = Number(m.page) || 1;
        if (!ocrBoxesByPage.has(p)) ocrBoxesByPage.set(p, []);
        if (m.box) ocrBoxesByPage.get(p).push(m.box);
      });
      matches = rawMatches.map((m) => ({
        page: Number(m.page) || 1,
        count: Number(m.count) || 1,
        snippet: String(m.snippet || ''),
        box: m.box || null
      }));
      if (!matches.length) {
        activeIndex = -1;
        renderActiveMatch();
        renderResultsList();
        clearOcrBoxes();
        return;
      }
      activeIndex = 0;
      setPage(matches[0].page);
      renderActiveMatch();
      renderResultsList();
    } catch (_error) {
      matches = [];
      activeIndex = -1;
      if (searchMeta) searchMeta.textContent = t('preview_search_error');
      resultsBox.innerHTML = '';
      clearOcrBoxes();
    }
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runSearch();
  };
  const onRunClick = () => {
    runSearch();
  };
  const onNextClick = () => {
    if (!matches.length) {
      runSearch();
      return;
    }
    moveMatch(1);
  };
  const onPrevClick = () => {
    if (!matches.length) return;
    moveMatch(-1);
  };
  const onPagePrev = () => setPage(currentPage - 1);
  const onPageNext = () => setPage(currentPage + 1);
  const onOpenPage = () => {
    const q = String(searchInput.value || '').trim();
    const hash = q ? `#page=${currentPage}&search=${encodeURIComponent(q)}` : `#page=${currentPage}`;
    window.open(`${baseUrl}${hash}`, '_blank', 'noopener,noreferrer');
  };

  searchInput.addEventListener('keydown', onKeyDown);
  runBtn.textContent = t('preview_find');
  prevBtn.textContent = '<';
  nextBtn.textContent = '>';
  runBtn.addEventListener('click', onRunClick);
  nextBtn.addEventListener('click', onNextClick);
  prevBtn?.addEventListener('click', onPrevClick);
  pagePrevBtn?.addEventListener('click', onPagePrev);
  pageNextBtn?.addEventListener('click', onPageNext);
  openPageBtn?.addEventListener('click', onOpenPage);

  const loadingTask = window.pdfjsLib.getDocument({ url: baseUrl });
  loadingTask.promise.then((doc) => {
    if (destroyed) return;
    pdfDoc = doc;
    totalPages = Math.max(1, Number(doc.numPages) || 1);
    setPage(1);
  }).catch(() => {
    if (searchMeta) searchMeta.textContent = t('preview_search_error');
  });

  (async () => {
    try {
      await api(`/api/assets/${asset.id}/pdf-meta`);
    } catch (_error) {
      // metadata call kept for backwards compatibility; viewer uses pdf.js page count.
    }
  })();

  return () => {
    destroyed = true;
    searchInput.removeEventListener('keydown', onKeyDown);
    runBtn.removeEventListener('click', onRunClick);
    nextBtn.removeEventListener('click', onNextClick);
    prevBtn?.removeEventListener('click', onPrevClick);
    pagePrevBtn?.removeEventListener('click', onPagePrev);
    pageNextBtn?.removeEventListener('click', onPageNext);
    openPageBtn?.removeEventListener('click', onOpenPage);
    try {
      loadingTask.destroy();
    } catch (_error) {
      // ignore
    }
  };
}

function initVideoSubtitleTools(mediaEl, asset, root = document) {
  const byId = (id) => root.querySelector(`#${id}`);
  const statusEl = byId('subtitleStatus');
  const busyEl = byId('subtitleBusy');
  const currentEl = byId('videoSubtitleCurrent');
  const itemsEl = byId('subtitleItems');
  const overlayCheck = byId('subtitleOverlayCheck');
  const langInput = byId('subtitleLangInput');
  const labelInput = byId('subtitleLabelInput');
  const renameBtn = byId('subtitleRenameBtn');
  const fileInput = byId('subtitleFileInput');
  const uploadBtn = byId('subtitleUploadBtn');
  const generateBtn = byId('subtitleGenerateBtn');
  if (!statusEl || !itemsEl || !langInput || !labelInput || !renameBtn || !fileInput || !uploadBtn || !generateBtn) return () => {};

  const getLang = () => String(langInput.value || '').trim().toLowerCase().slice(0, 12) || 'tr';
  const getOverlayEnabled = () => subtitleOverlayEnabledByAsset.get(asset.id) !== false;
  if (!subtitleOverlayEnabledByAsset.has(asset.id)) subtitleOverlayEnabledByAsset.set(asset.id, Boolean(asset.subtitleUrl));

  const setStatus = (text) => {
    statusEl.textContent = text;
    if (currentEl) currentEl.textContent = asset.subtitleLabel || asset.subtitleLang || '-';
  };
  const setBusy = (busy) => {
    if (busyEl) busyEl.classList.toggle('hidden', !busy);
    renameBtn.disabled = busy;
    uploadBtn.disabled = busy;
    generateBtn.disabled = busy;
  };

  const applyTrackMode = () => {
    const enabled = getOverlayEnabled();
    const tracks = Array.from(mediaEl.textTracks || []);
    tracks.forEach((tt) => {
      tt.mode = 'hidden';
    });
    if (!enabled) return;
    const active = tracks[tracks.length - 1];
    if (active) active.mode = 'showing';
  };

  const applyTrack = (subtitleUrl, subtitleLang, subtitleLabel) => {
    const previous = mediaEl.querySelector('#assetSubtitleTrack');
    if (previous) previous.remove();
    if (!subtitleUrl) {
      setStatus(t('subtitle_none'));
      applyTrackMode();
      return;
    }
    const track = document.createElement('track');
    track.id = 'assetSubtitleTrack';
    track.kind = 'subtitles';
    track.default = true;
    track.label = subtitleLabel || t('subtitles');
    track.srclang = subtitleLang || getLang();
    track.src = `${subtitleUrl}${subtitleUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    mediaEl.appendChild(track);
    track.addEventListener('load', applyTrackMode, { once: true });
    setTimeout(applyTrackMode, 60);
    if (labelInput && subtitleLabel) labelInput.value = subtitleLabel;
    setStatus(`${t('subtitle_loaded')}: ${subtitleLabel || subtitleLang || ''}`);
  };
  const subtitleItems = () => Array.isArray(asset.subtitleItems) ? asset.subtitleItems : [];
  const applyAssetFromApi = (mappedAsset) => {
    if (!mappedAsset || typeof mappedAsset !== 'object') return;
    asset.subtitleUrl = mappedAsset.subtitleUrl || asset.subtitleUrl || '';
    asset.subtitleLang = mappedAsset.subtitleLang || asset.subtitleLang || getLang();
    asset.subtitleLabel = mappedAsset.subtitleLabel || asset.subtitleLabel || '';
    asset.subtitleItems = Array.isArray(mappedAsset.subtitleItems) ? mappedAsset.subtitleItems : (asset.subtitleItems || []);
  };
  const renderSubtitleItems = () => {
    const items = subtitleItems();
    if (!items.length) {
      itemsEl.innerHTML = `<div class="subtitle-item-empty">${escapeHtml(t('subtitle_no_items'))}</div>`;
      return;
    }
    itemsEl.innerHTML = items.map((item) => {
      const active = item.subtitleUrl === asset.subtitleUrl;
      return `
        <div class="subtitle-item-row ${active ? 'active' : ''}" data-subtitle-url="${escapeHtml(item.subtitleUrl)}">
          <span class="subtitle-item-label">${escapeHtml(item.subtitleLabel || item.subtitleLang || 'subtitle')}</span>
          <span class="subtitle-item-lang">${escapeHtml(item.subtitleLang || '')}</span>
          <a class="subtitle-item-download-btn" href="${escapeHtml(item.subtitleUrl)}" download target="_blank" rel="noreferrer">${t('subtitle_download')}</a>
          <button type="button" class="subtitle-item-remove-btn">${t('subtitle_remove')}</button>
          <button type="button" class="subtitle-item-use-btn">${active ? t('subtitle_active') : t('subtitle_use')}</button>
        </div>
      `;
    }).join('');
    itemsEl.querySelectorAll('.subtitle-item-use-btn').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const rowEl = event.currentTarget.closest('.subtitle-item-row');
        const subtitleUrl = rowEl?.dataset?.subtitleUrl || '';
        if (!subtitleUrl) return;
        const selected = subtitleItems().find((it) => it.subtitleUrl === subtitleUrl);
        if (!selected) return;
        setBusy(true);
        try {
          const result = await api(`/api/assets/${asset.id}/subtitles`, {
            method: 'PATCH',
            body: JSON.stringify({
              subtitleUrl,
              label: selected.subtitleLabel,
              lang: selected.subtitleLang
            })
          });
          applyAssetFromApi(result.asset);
          applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
          renderSubtitleItems();
        } catch (error) {
          alert(String(error?.message || 'Subtitle selection failed'));
        } finally {
          setBusy(false);
        }
      });
    });
    itemsEl.querySelectorAll('.subtitle-item-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const rowEl = event.currentTarget.closest('.subtitle-item-row');
        const subtitleUrl = rowEl?.dataset?.subtitleUrl || '';
        if (!subtitleUrl) return;
        if (!confirm(t('subtitle_remove_confirm'))) return;
        setBusy(true);
        try {
          const result = await api(`/api/assets/${asset.id}/subtitles`, {
            method: 'DELETE',
            body: JSON.stringify({ subtitleUrl })
          });
          applyAssetFromApi(result.asset);
          applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
          renderSubtitleItems();
        } catch (error) {
          alert(String(error?.message || 'Subtitle remove failed'));
        } finally {
          setBusy(false);
        }
      });
    });
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pollSubtitleJob = async (jobId, maxMs = 3 * 60 * 60 * 1000, intervalMs = 2000) => {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      const job = await api(`/api/subtitle-jobs/${encodeURIComponent(jobId)}`);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') {
        throw new Error(job.error || t('subtitle_job_failed'));
      }
      setStatus(`${t('subtitle_job_started')} (${job.status})`);
      await wait(intervalMs);
    }
    throw new Error('Subtitle generation is still running. Please check again in a moment.');
  };

  const onUpload = async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      alert(t('subtitle_file_required'));
      return;
    }
    const lowerName = String(file.name || '').toLowerCase();
    if (!lowerName.endsWith('.vtt') && !lowerName.endsWith('.srt')) {
      alert(t('subtitle_file_required'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        fileName: file.name,
        fileData: await readFileAsBase64(file),
        lang: getLang()
      };
      const result = await api(`/api/assets/${asset.id}/subtitles`, { method: 'POST', body: JSON.stringify(payload) });
      applyAssetFromApi(result.asset);
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || file.name;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_upload_success')} ${asset.subtitleLabel || file.name}`);
    } catch (error) {
      alert(String(error?.message || 'Subtitle upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const requestedLabel = String(labelInput.value || '').trim() || 'auto-whisper';
      const queued = await api(`/api/assets/${asset.id}/subtitles/generate`, {
        method: 'POST',
        body: JSON.stringify({ lang: getLang(), label: requestedLabel, model: 'tiny' })
      });
      setStatus(t('subtitle_job_started'));
      const result = await pollSubtitleJob(queued.jobId);
      applyAssetFromApi(result.asset);
      if (!asset.subtitleUrl) asset.subtitleUrl = result.subtitleUrl || '';
      if (!asset.subtitleLang) asset.subtitleLang = result.subtitleLang || getLang();
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || requestedLabel;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_generate_success')} ${asset.subtitleLabel}`.trim());
    } catch (error) {
      alert(String(error?.message || 'Subtitle generation failed'));
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    if (!asset.subtitleUrl) {
      setStatus(t('subtitle_none'));
      return;
    }
    const nextLabel = String(labelInput.value || '').trim();
    if (!nextLabel) {
      alert(t('subtitle_name'));
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/api/assets/${asset.id}/subtitles`, {
        method: 'PATCH',
        body: JSON.stringify({ subtitleUrl: asset.subtitleUrl, label: nextLabel, lang: getLang() })
      });
      applyAssetFromApi(result.asset);
      if (!asset.subtitleUrl) asset.subtitleUrl = result.subtitleUrl;
      if (!asset.subtitleLang) asset.subtitleLang = result.subtitleLang || getLang();
      if (!asset.subtitleLabel) asset.subtitleLabel = result.subtitleLabel || nextLabel;
      applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
      renderSubtitleItems();
      setStatus(`${t('subtitle_rename_success')} ${asset.subtitleLabel}`.trim());
    } catch (error) {
      alert(String(error?.message || 'Subtitle rename failed'));
    } finally {
      setBusy(false);
    }
  };

  const onOverlayChange = () => {
    subtitleOverlayEnabledByAsset.set(asset.id, Boolean(overlayCheck?.checked));
    applyTrackMode();
  };

  renameBtn.addEventListener('click', onRename);
  uploadBtn.addEventListener('click', onUpload);
  generateBtn.addEventListener('click', onGenerate);
  overlayCheck?.addEventListener('change', onOverlayChange);

  if (asset.subtitleUrl) {
    applyTrack(asset.subtitleUrl, asset.subtitleLang, asset.subtitleLabel);
  } else {
    setStatus(t('subtitle_none'));
  }
  renderSubtitleItems();
  if (overlayCheck) overlayCheck.checked = getOverlayEnabled();
  applyTrackMode();

  return () => {
    renameBtn.removeEventListener('click', onRename);
    uploadBtn.removeEventListener('click', onUpload);
    generateBtn.removeEventListener('click', onGenerate);
    overlayCheck?.removeEventListener('change', onOverlayChange);
  };
}

function openVideoToolsDialog(asset) {
  const overlay = document.createElement('div');
  overlay.className = 'clip-modal-backdrop video-tools-backdrop';
  overlay.innerHTML = `
    <div class="clip-modal video-tools-modal video-tools-modal-large" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('video_tools_title'))}">
      <div class="video-tools-modal-head">
        <h4>${t('video_tools_title')}</h4>
        <button type="button" id="videoToolsCloseBtn">${t('close')}</button>
      </div>
      <div class="video-tools-modal-body">
        ${mediaViewer(asset, { showVideoToolsButton: false, includeSubtitleTools: true })}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const cleanup = initAssetPlayer(asset, overlay);
  const close = () => {
    cleanup?.();
    overlay.remove();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('#videoToolsCloseBtn')?.addEventListener('click', close);
}

function initAssetPlayer(asset, root = document) {
  const mediaEl = root.querySelector('#assetMediaEl');
  const cleanups = [];
  if (mediaEl) {
    // Keep media audible even if previous browser state muted it.
    mediaEl.muted = false;
    if (!Number.isFinite(mediaEl.volume) || mediaEl.volume <= 0) mediaEl.volume = 1;
    if (isVideo(asset)) {
      let recoveringProxy = false;
      const onVideoError = async () => {
        if (recoveringProxy) return;
        recoveringProxy = true;
        try {
          const refreshed = await api(`/api/assets/${asset.id}/ensure-proxy`, { method: 'POST', body: JSON.stringify({ force: true }) });
          if (refreshed.proxyUrl) {
            mediaEl.src = `${refreshed.proxyUrl}${refreshed.proxyUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
            mediaEl.load();
            mediaEl.play().catch(() => {});
          }
        } catch (_error) {
          // Keep current failed state; user can retry manually.
        } finally {
          recoveringProxy = false;
        }
      };
      mediaEl.addEventListener('error', onVideoError);
      cleanups.push(() => mediaEl.removeEventListener('error', onVideoError));
    }
    if (isVideo(asset)) {
      cleanups.push(initFrameControls(mediaEl, asset, root));
      cleanups.push(initVideoSubtitleTools(mediaEl, asset, root));
    }
    if (isVideo(asset) || isAudio(asset)) {
      cleanups.push(initAudioTools(mediaEl, root));
    }
  }

  if (isPdf(asset)) {
    cleanups.push(initPdfSearch(asset));
  } else if (isDocument(asset)) {
    cleanups.push(initDocumentPreview(asset));
  }

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

async function loadWorkflow() {
  const workflow = await api('/api/workflow');
  statusSelect.innerHTML = `<option value="">${escapeHtml(t('any_status'))}</option>`;
  workflow.forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = workflowLabel(status);
    statusSelect.appendChild(option);
  });
  return workflow;
}

async function loadAssets() {
  const filters = serializeForm(searchForm);
  const params = new URLSearchParams();
  const selectedTypes = assetTypeFilters.filter((el) => el.checked).map((el) => String(el.value || '').toLowerCase());
  const trashScope = assetTrashOnly?.checked ? 'all' : 'active';

  if (selectedTypes.length === 0) {
    currentAssets = [];
    renderAssets(currentAssets);
    return;
  }

  currentSearchQuery = String(filters.q || '').trim();
  if (currentSearchQuery) params.set('q', currentSearchQuery);
  if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
  if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
  params.set('trash', trashScope);
  if (selectedTypes.length > 0 && selectedTypes.length < assetTypeFilters.length) {
    params.set('types', selectedTypes.join(','));
  }

  currentAssets = await api(`/api/assets?${params.toString()}`);
  const visibleIds = new Set(currentAssets.map((asset) => asset.id));
  [...selectedAssetIds].forEach((id) => {
    if (!visibleIds.has(id)) selectedAssetIds.delete(id);
  });
  if (selectedAssetId && !selectedAssetIds.has(selectedAssetId)) {
    selectedAssetId = null;
  }
  if (!selectedAssetIds.size) {
    lastSelectedAssetId = null;
  }
  renderAssets(currentAssets);
}

async function openAsset(id, workflow) {
  setPanelVisible('panelDetail', true);

  let asset = await api(`/api/assets/${id}`);
  if (isVideo(asset) && !asset.proxyUrl) {
    try {
      await api(`/api/assets/${id}/ensure-proxy`, { method: 'POST', body: '{}' });
      asset = await api(`/api/assets/${id}`);
      await loadAssets();
    } catch (error) {
      asset.proxyStatus = String(error.message || 'error');
    }
  }

  selectedAssetId = id;
  selectedAssetIds.add(id);
  lastSelectedAssetId = id;
  renderAssets(currentAssets);

  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanup = null;
  }

  assetDetail.innerHTML = detailMarkup(asset, workflow);
  assetDetail.classList.toggle('video-detail-mode', isVideo(asset));
  activePlayerCleanup = initAssetPlayer(asset, assetDetail);
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
  const openVideoToolsModalBtn = document.getElementById('openVideoToolsModalBtn');
  openVideoToolsModalBtn?.addEventListener('click', () => {
    openVideoToolsDialog(asset);
  });

  document.getElementById('editForm').addEventListener('submit', async (event) => {
    event.preventDefault();
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

  document.getElementById('versionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = serializeForm(event.target);
    await api(`/api/assets/${id}/versions`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAssets();
    await openAsset(id, workflow);
  });

  const trashBtn = document.getElementById('trashAssetBtn');
  const restoreBtn = document.getElementById('restoreAssetBtn');
  const deleteBtn = document.getElementById('deleteAssetBtn');
  const downloadBtn = document.getElementById('downloadAssetBtn');

  downloadBtn?.addEventListener('click', () => {
    if (!asset.mediaUrl) return;
    const link = document.createElement('a');
    link.href = asset.mediaUrl;
    // Empty download attribute lets browser suggest a filename.
    link.setAttribute('download', '');
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  trashBtn?.addEventListener('click', async () => {
    await api(`/api/assets/${id}/trash`, { method: 'POST', body: '{}' });
    await loadAssets();
    await openAsset(id, workflow);
  });

  restoreBtn?.addEventListener('click', async () => {
    await api(`/api/assets/${id}/restore`, { method: 'POST', body: '{}' });
    await loadAssets();
    await openAsset(id, workflow);
  });

  deleteBtn?.addEventListener('click', async () => {
    const ok = confirm(t('trash_confirm'));
    if (!ok) return;
    await deleteApi(`/api/assets/${id}`);
    selectedAssetIds.delete(id);
    selectedAssetId = null;
    assetDetail.innerHTML = escapeHtml(t('select_asset'));
    assetDetail.classList.remove('video-detail-mode');
    await loadAssets();
  });
}

assetGrid.addEventListener('click', async (event) => {
  const tagChip = event.target.closest('[data-chip-tag]');
  if (tagChip) {
    event.preventDefault();
    event.stopPropagation();
    const clickedTag = String(tagChip.dataset.chipTag || '').trim();
    if (!clickedTag) return;
    const tagInput = searchForm.querySelector('[name="tag"]');
    const queryInput = searchForm.querySelector('[name="q"]');
    const currentTag = String(tagInput?.value || '').trim();
    const isSameTag = currentTag.localeCompare(clickedTag, undefined, { sensitivity: 'base' }) === 0;
    if (tagInput) tagInput.value = isSameTag ? '' : clickedTag;
    if (queryInput) queryInput.value = '';
    await loadAssets();
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
      const ok = confirm(t('trash_confirm'));
      if (!ok) return;
      await deleteApi(`/api/assets/${id}`);
      selectedAssetIds.delete(id);
      if (selectedAssetId === id) {
        selectedAssetId = null;
        assetDetail.textContent = t('select_asset');
        assetDetail.classList.remove('video-detail-mode');
      }
      await loadAssets();
      return;
    }
  }

  const card = event.target.closest('.asset-card');
  if (!card) return;
  if (event.shiftKey) {
    addShiftRangeSelection(card.dataset.id);
    renderAssets(currentAssets);
    await openMultiSelectionDetail();
    return;
  }

  setSingleSelection(card.dataset.id);

  const workflow = await api('/api/workflow');
  openAsset(card.dataset.id, workflow).catch((err) => alert(err.message));
});

assetTypeFilters.forEach((input) => {
  input.addEventListener('change', () => {
    loadAssets().catch((error) => alert(error.message));
  });
});

typesSelectAllBtn?.addEventListener('click', () => {
  const allSelected = assetTypeFilters.every((input) => input.checked);
  const nextChecked = !allSelected;
  assetTypeFilters.forEach((input) => {
    input.checked = nextChecked;
  });
  loadAssets().catch((error) => alert(error.message));
});

assetTrashOnly?.addEventListener('change', async () => {
  searchForm.querySelector('[name="trash"]').value = assetTrashOnly.checked ? 'all' : 'active';
  await loadAssets();
});

async function detectDurationSeconds(file) {
  const type = String(file.type || '').toLowerCase();
  if (!(type.startsWith('video/') || type.startsWith('audio/'))) {
    return 0;
  }

  const url = URL.createObjectURL(file);
  try {
    const el = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
    el.preload = 'metadata';
    el.src = url;

    const duration = await new Promise((resolve) => {
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
      el.onerror = () => resolve(0);
    });

    return Math.max(0, Math.round(duration));
  } finally {
    URL.revokeObjectURL(url);
  }
}

mediaFileBtn?.addEventListener('click', () => {
  mediaFileInput?.click();
});

mediaFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (mediaFileName) mediaFileName.textContent = file?.name || '';
  if (!file) return;
  const duration = await detectDurationSeconds(file);
  ingestForm.querySelector('[name="durationSeconds"]').value = String(duration);
});

ingestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(ingestForm);
  const mediaFile = formData.get('mediaFile');
  const submitBtn = ingestForm.querySelector('button[type="submit"]');

  if (!(mediaFile instanceof File) || !mediaFile.size) {
    alert(t('select_media_first'));
    return;
  }

  let durationSeconds = Number(formData.get('durationSeconds')) || 0;
  if (!durationSeconds) {
    durationSeconds = await detectDurationSeconds(mediaFile);
  }

  const base64 = await readFileAsBase64(mediaFile);

  const payload = {
    title: formData.get('title'),
    type: formData.get('type'),
    owner: formData.get('owner'),
    tags: formData.get('tags'),
    durationSeconds,
    sourcePath: formData.get('sourcePath'),
    description: formData.get('description'),
    fileName: mediaFile.name,
    mimeType: mediaFile.type || 'application/octet-stream',
    fileData: base64
  };
  payload.dcMetadata = {
    title: String(payload.title || ''),
    creator: String(payload.owner || ''),
    subject: String(payload.tags || ''),
    description: String(payload.description || ''),
    type: String(payload.type || ''),
    source: String(payload.sourcePath || ''),
    format: String(payload.mimeType || ''),
    identifier: String(payload.fileName || '')
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    setUploadProgress(1, t('uploading'));
    const created = await uploadAssetWithProgress(payload, (pct) => {
      const mapped = Math.min(95, Math.round((Number(pct) || 0) * 0.95));
      setUploadProgress(mapped, t('uploading'));
    });
    setUploadProgress(96, t('processing'));
    ingestForm.reset();
    ingestForm.querySelector('[name="type"]').value = 'Video';
    ingestForm.querySelector('[name="durationSeconds"]').value = '';
    if (mediaFileName) mediaFileName.textContent = '';
    await waitUntilAssetVisible(created?.id || null);
    setUploadProgress(100, t('processing'));
  } catch (error) {
    alert(String(error?.message || 'Upload failed'));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    setTimeout(() => hideUploadProgress(), 450);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (assetTrashOnly) {
    const trashValue = searchForm.querySelector('[name="trash"]').value || 'active';
    assetTrashOnly.checked = trashValue === 'all';
  }
  await loadAssets();
});

languageSelect?.addEventListener('change', async (event) => {
  currentLang = event.target.value === 'tr' ? 'tr' : 'en';
  localStorage.setItem(LOCAL_LANG, currentLang);
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
    assetDetail.textContent = t('select_asset');
    assetDetail.classList.remove('video-detail-mode');
  }
});

closeDetailBtn?.addEventListener('click', () => {
  setPanelVisible('panelDetail', false);
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

logoutBtn?.addEventListener('click', () => {
  userMenu?.classList.add('hidden');
  const postLogout = encodeURIComponent(`${window.location.origin}/oauth2/sign_out`);
  const keycloakLogout =
    `http://localhost:8081/realms/mam/protocol/openid-connect/logout?client_id=mam-web&post_logout_redirect_uri=${postLogout}`;
  window.location.assign(keycloakLogout);
});

(async () => {
  try {
    await loadI18nFile();
    currentLang = currentLang === 'tr' ? 'tr' : 'en';
    if (languageSelect) languageSelect.value = currentLang;
    applyStaticI18n();
    loadPanelPrefs();
    loadPanelVisibilityPrefs();
    applyPanelLayout();
    initPanelSplitters();
    await loadCurrentUser();
    await loadWorkflow();
    await loadAssets();
  } catch (error) {
    alert(error.message);
  }
})();
