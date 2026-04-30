(function attachMainCommonModule(global) {
  function createMainCommonModule(deps) {
    const {
      t,
      api,
      currentLangRef,
      subtitleOverlayEnabledByAsset,
      PLAYER_FPS,
      selectedAssetIdRef,
      subtitleStyleRef,
      currentSubtitleQueryRef
    } = deps || {};
    const nativeCuePositionBoundTracks = new WeakSet();
    const nativeSubtitleObjectUrls = new WeakMap();

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeRegExp(value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractPdfChangeKindFromNote(note) {
      const m = String(note || '').match(/\[change:([a-z_]+)\]/i);
      return m ? String(m[1] || '').trim().toLowerCase() : '';
    }

    function renderPdfChangeKindLabel(version) {
      const kind = extractPdfChangeKindFromNote(version?.note);
      if (!kind) return '';
      return t(`pdf_change_${kind}`) || kind;
    }

    function cleanVersionNoteText(note) {
      return String(note || '').replace(/\s*\[change:[a-z_]+\]\s*/ig, ' ').replace(/\s{2,}/g, ' ').trim();
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

    function highlightSuggestText(text, query) {
      return highlightMatch(text, query);
    }

    function getSubtitleOverlayEnabled(assetId, fallback = false) {
      const key = String(assetId || '').trim();
      if (!key) return false;
      if (!subtitleOverlayEnabledByAsset.has(key)) {
        const stored = (() => {
          try {
            return window.localStorage.getItem(`mam:subtitle-overlay:${key}`);
          } catch (_error) {
            return null;
          }
        })();
        if (stored === '1' || stored === '0') {
          subtitleOverlayEnabledByAsset.set(key, stored === '1');
        } else {
          subtitleOverlayEnabledByAsset.set(key, Boolean(fallback));
        }
      }
      return subtitleOverlayEnabledByAsset.get(key) === true;
    }

    function getSubtitleStyleSettings() {
      const style = subtitleStyleRef?.get?.() || {};
      return {
        customOverlayEnabled: Object.prototype.hasOwnProperty.call(style, 'customOverlayEnabled') ? Boolean(style.customOverlayEnabled) : true,
        bottomOffset: Math.max(0, Math.min(240, Number(style.bottomOffset) || 56)),
        fontSize: Math.max(12, Math.min(64, Number(style.fontSize) || 24)),
        textColor: /^#[0-9a-fA-F]{6}$/.test(String(style.textColor || '')) ? String(style.textColor).toLowerCase() : '#ffffff',
        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(String(style.backgroundColor || '')) ? String(style.backgroundColor).toLowerCase() : '#000000',
        backgroundOpacity: Math.max(0, Math.min(1, Number(style.backgroundOpacity) || 0.72)),
        horizontalPadding: Math.max(0, Math.min(80, Number(style.horizontalPadding) || 16)),
        maxWidth: Math.max(35, Math.min(100, Number(style.maxWidth) || 82))
      };
    }

    function customSubtitleOverlayEnabled() {
      return getSubtitleStyleSettings().customOverlayEnabled;
    }

    function syncSubtitleOverlayInOpenPlayers(asset) {
      const assetId = String(asset?.id || '').trim();
      const subtitleUrl = String(asset?.subtitleUrl || '').trim();
      if (!assetId) return;
      const enabled = getSubtitleOverlayEnabled(assetId, false) && Boolean(subtitleUrl);
      const useCustomOverlay = customSubtitleOverlayEnabled();
      const currentLang = currentLangRef?.get?.() || 'tr';
      const subtitleLang = String(asset?.subtitleLang || currentLang || 'tr').slice(0, 12);
      const subtitleLabel = String(asset?.subtitleLabel || t('subtitles'));
      const players = Array.from(document.querySelectorAll('video[data-asset-id]'))
        .filter((el) => String(el.dataset.assetId || '').trim() === assetId);

      players.forEach((mediaEl) => {
        const existing = mediaEl.querySelector('#assetSubtitleTrack');
        const hideAll = () => {
          Array.from(mediaEl.textTracks || []).forEach((tt) => {
            tt.mode = 'hidden';
          });
        };

        if (!enabled || useCustomOverlay) {
          if (existing) existing.remove();
          hideAll();
          mediaEl.dispatchEvent(new CustomEvent('mam:subtitle-overlay-sync', { detail: { enabled, asset } }));
          return;
        }

        if (existing) existing.remove();
        const track = document.createElement('track');
        track.id = 'assetSubtitleTrack';
        track.kind = 'subtitles';
        track.default = true;
        track.label = subtitleLabel;
        track.srclang = subtitleLang;
        mediaEl.appendChild(track);
        setNativeSubtitleTrackSource(track, mediaEl, subtitleUrl);

        const showLastTrack = () => {
          hideAll();
          const tracks = Array.from(mediaEl.textTracks || []);
          const active = tracks[tracks.length - 1];
          if (active) active.mode = 'showing';
          scheduleNativeSubtitleCuePosition(mediaEl);
        };
        track.addEventListener('load', showLastTrack, { once: true });
        setTimeout(showLastTrack, 60);
        setTimeout(() => scheduleNativeSubtitleCuePosition(mediaEl), 180);
        mediaEl.dispatchEvent(new CustomEvent('mam:subtitle-overlay-sync', { detail: { enabled, asset } }));
      });
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

    function getFileExtension(asset) {
      const name = String(asset?.fileName || '');
      const idx = name.lastIndexOf('.');
      if (idx < 0 || idx === name.length - 1) return '';
      return name.slice(idx + 1).toLowerCase();
    }

    function isVideo(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      const type = String(asset?.type || '').toLowerCase();
      if (mime.startsWith('video/')) return true;
      if (type === 'video') return true;
      const ext = getFileExtension(asset);
      return ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpeg', 'mpg'].includes(ext);
    }

    function isAudio(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      const type = String(asset?.type || '').toLowerCase();
      if (mime.startsWith('audio/')) return true;
      if (type === 'audio') return true;
      const ext = getFileExtension(asset);
      return ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'].includes(ext);
    }

    function isImage(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      const type = String(asset?.type || '').toLowerCase();
      if (mime.startsWith('image/')) return true;
      if (type === 'photo' || type === 'image') return true;
      const ext = getFileExtension(asset);
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif'].includes(ext);
    }

    function isPdf(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      if (mime.includes('pdf')) return true;
      return getFileExtension(asset) === 'pdf';
    }

    function isDocument(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      const type = String(asset?.type || '').toLowerCase();
      if (type === 'document') return true;
      return mime.startsWith('application/') || mime.startsWith('text/') || mime.includes('pdf') || mime.includes('document') || mime.includes('sheet') || mime.includes('presentation');
    }

    function isOfficeDocument(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      const ext = getFileExtension(asset);
      if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return true;
      return mime.includes('msword')
        || mime.includes('officedocument')
        || mime.includes('ms-excel')
        || mime.includes('ms-powerpoint')
        || mime.includes('opendocument')
        || mime.includes('sheet')
        || mime.includes('presentation')
        || mime.includes('wordprocessingml');
    }

    function isTextPreviewable(asset) {
      const mime = String(asset?.mimeType || '').toLowerCase();
      if (mime.startsWith('text/')) return true;
      const ext = getFileExtension(asset);
      return ['sql', 'py', 'js', 'ts', 'tsx', 'jsx', 'json', 'md', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'txt', 'csv'].includes(ext);
    }

    function docThumbDataUrl(asset) {
      const ext = (getFileExtension(asset) || 'DOC').toUpperCase().slice(0, 5);
      const name = String(asset?.fileName || asset?.title || `FILE.${ext.toLowerCase()}`);
      const title = name.length > 30 ? `${name.slice(0, 27)}...` : name;
      const headerFill = ext === 'PDF' ? '#b63a34' : '#3f69b7';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#1f222b"/><rect x="10" y="10" width="460" height="250" rx="12" fill="#2a2f3b" stroke="#42485a"/><text x="240" y="36" font-family="IBM Plex Sans, Arial, sans-serif" text-anchor="middle" font-size="26" font-weight="600" fill="#f3f6fb">${escapeHtml(title)}</text><g transform="translate(137,56)"><rect x="0" y="0" width="206" height="178" rx="6" fill="#eef1f6"/><rect x="0" y="0" width="206" height="24" rx="6" fill="${headerFill}"/><text x="14" y="17" font-family="IBM Plex Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${ext}</text><rect x="18" y="38" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="52" width="158" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="66" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="80" width="144" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="94" width="170" height="6" rx="3" fill="#c2c9d6"/><rect x="18" y="108" width="130" height="6" rx="3" fill="#d1d7e2"/><rect x="18" y="122" width="166" height="6" rx="3" fill="#c2c9d6"/></g></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    function thumbFallbackForAsset(asset) {
      if (isPdf(asset)) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#f6f3ee"/><rect x="24" y="20" width="180" height="36" rx="8" fill="#c53a2f"/><text x="36" y="45" font-family="Arial, sans-serif" font-size="22" fill="#ffffff">PDF</text><rect x="24" y="72" width="432" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="98" width="390" height="14" rx="7" fill="#e1ddd2"/><rect x="24" y="124" width="430" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="150" width="350" height="14" rx="7" fill="#e1ddd2"/><rect x="24" y="176" width="410" height="14" rx="7" fill="#d9d4c8"/><rect x="24" y="202" width="300" height="14" rx="7" fill="#e1ddd2"/></svg>';
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
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear());
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hour}:${minute}`;
    }

    function formatDuration(seconds) {
      const s = Math.max(0, Number(seconds) || 0);
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(Math.floor(s % 60)).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    function formatBitrate(bitsPerSec) {
      const v = Math.max(0, Number(bitsPerSec) || 0);
      if (!v) return '-';
      const kbps = v / 1000;
      if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
      return `${Math.round(kbps)} kbps`;
    }

    function formatFileSize(bytes) {
      const v = Math.max(0, Number(bytes) || 0);
      if (!v) return '-';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = v;
      let idx = 0;
      while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
      }
      return `${size.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
    }

    function formatFrameRate(fps) {
      const v = Math.max(0, Number(fps) || 0);
      if (!v) return '-';
      return `${v.toFixed(3).replace(/\.?0+$/, '')} fps`;
    }

    function techValue(value) {
      const raw = String(value || '').trim();
      return raw || '-';
    }

    function renderTechnicalCard(title, info) {
      const unavailable = !info || !info.available;
      if (unavailable) {
        return `
          <div class="tech-card">
            <h5>${escapeHtml(title)}</h5>
            <div class="asset-meta">${escapeHtml(t('tech_unavailable'))}</div>
          </div>
        `;
      }
      const container = Array.isArray(info.container) ? info.container.join(', ') : String(info.container || '');
      const resolution = info.video && Number(info.video.width) > 0 && Number(info.video.height) > 0 ? `${Number(info.video.width)}x${Number(info.video.height)}` : '-';
      const audioCodecs = Array.isArray(info.audio?.codecs) ? info.audio.codecs.join(', ') : '';
      const sampleRate = Number(info.audio?.sampleRate) > 0 ? `${Number(info.audio.sampleRate)} Hz` : '-';
      const channels = Number(info.audio?.channels) > 0 ? String(Number(info.audio.channels)) : '-';
      const videoCodec = [String(info.video?.codec || '').trim(), String(info.video?.profile || '').trim()].filter(Boolean).join(' / ');
      return `
        <div class="tech-card">
          <h5>${escapeHtml(title)}</h5>
          <div class="tech-row"><span>${escapeHtml(t('tech_container'))}</span><strong>${escapeHtml(techValue(container))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_duration'))}</span><strong>${escapeHtml(formatDuration(info.durationSeconds))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_resolution'))}</span><strong>${escapeHtml(resolution)}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_video_codec'))}</span><strong>${escapeHtml(techValue(videoCodec))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_frame_rate'))}</span><strong>${escapeHtml(formatFrameRate(info.video?.frameRate))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_pixel_format'))}</span><strong>${escapeHtml(techValue(info.video?.pixelFormat))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_audio_codec'))}</span><strong>${escapeHtml(techValue(audioCodecs))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_audio_channels'))}</span><strong>${escapeHtml(channels)}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_sample_rate'))}</span><strong>${escapeHtml(sampleRate)}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_bitrate'))}</span><strong>${escapeHtml(formatBitrate(info.bitRate))}</strong></div>
          <div class="tech-row"><span>${escapeHtml(t('tech_file_size'))}</span><strong>${escapeHtml(formatFileSize(info.fileSize))}</strong></div>
        </div>
      `;
    }

    function renderTechnicalInfoSection(payload) {
      const originalLabel = t('original_file');
      const proxyLabel = t('low_res_proxy');
      const originalHtml = renderTechnicalCard(originalLabel, payload?.original);
      const proxyHtml = renderTechnicalCard(proxyLabel, payload?.proxy);
      return `
        <div class="tech-tabs">
          <div class="tech-tab-head" role="tablist" aria-label="${escapeHtml(t('technical_info'))}">
            <button type="button" class="tech-tab-btn active" data-tech-tab="original" role="tab" aria-selected="true">${escapeHtml(originalLabel)}</button>
            <button type="button" class="tech-tab-btn" data-tech-tab="proxy" role="tab" aria-selected="false">${escapeHtml(proxyLabel)}</button>
          </div>
          <div class="tech-tab-panels">
            <div class="tech-tab-panel active" data-tech-panel="original" role="tabpanel">${originalHtml}</div>
            <div class="tech-tab-panel" data-tech-panel="proxy" role="tabpanel">${proxyHtml}</div>
          </div>
        </div>
      `;
    }

    function initTechnicalTabs(container) {
      const host = container || document;
      const tabButtons = Array.from(host.querySelectorAll('.tech-tab-btn'));
      const panels = Array.from(host.querySelectorAll('.tech-tab-panel'));
      if (!tabButtons.length || !panels.length) return;
      const activate = (key) => {
        const target = String(key || '').trim();
        tabButtons.forEach((btn) => {
          const active = btn.dataset.techTab === target;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          const active = panel.dataset.techPanel === target;
          panel.classList.toggle('active', active);
        });
      };
      tabButtons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.techTab)));
    }

    async function loadAssetTechnicalInfo(asset) {
      if (!asset || !isVideo(asset)) return;
      const bodyEl = document.getElementById('assetTechnicalInfoBody');
      if (!bodyEl) return;
      bodyEl.textContent = t('tech_loading');
      try {
        const payload = await api(`/api/assets/${asset.id}/technical`);
        if (selectedAssetIdRef?.get?.() !== asset.id) return;
        bodyEl.innerHTML = renderTechnicalInfoSection(payload);
        initTechnicalTabs(bodyEl);
      } catch (_error) {
        if (selectedAssetIdRef?.get?.() !== asset.id) return;
        bodyEl.textContent = t('tech_unavailable');
      }
    }

    function extractDcMetadataFromPayload(payload) {
      const keyMap = {
        dcTitle: 'title', dcCreator: 'creator', dcSubject: 'subject', dcDescription: 'description', dcPublisher: 'publisher', dcContributor: 'contributor', dcDate: 'date', dcType: 'type', dcFormat: 'format', dcIdentifier: 'identifier', dcSource: 'source', dcLanguage: 'language', dcRelation: 'relation', dcCoverage: 'coverage', dcRights: 'rights'
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

    function foldSearchText(value) {
      return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}+/gu, '');
    }

    function textIncludesSearchTerm(text, term) {
      const haystack = foldSearchText(text);
      const needle = foldSearchText(term);
      if (!haystack || !needle) return false;
      return haystack.includes(needle);
    }

    function effectiveSearchHighlightClass(query, highlightQuery, fuzzyUsed = false) {
      return foldSearchText(highlightQuery || '') !== foldSearchText(query || '') || fuzzyUsed
        ? 'search-hit-fuzzy'
        : 'search-hit';
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
            if (token && upper !== 'AND' && upper !== 'OR' && upper !== 'NOT') terms.push(token.toLowerCase());
          }
        }
        match = tokenRegex.exec(text);
      }
      return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
    }

    function highlightMatch(value, query, markClass = 'search-hit') {
      const raw = String(value ?? '');
      const terms = extractHighlightTerms(query);
      if (!terms.length) return escapeHtml(raw);
      const foldChar = (ch) => String(ch || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}+/gu, '');
      const originalChars = Array.from(raw);
      let folded = '';
      const foldedToOriginal = [];
      for (let i = 0; i < originalChars.length; i += 1) {
        const piece = foldChar(originalChars[i]);
        if (!piece) continue;
        folded += piece;
        for (let j = 0; j < piece.length; j += 1) foldedToOriginal.push(i);
      }
      if (!folded || !foldedToOriginal.length) return escapeHtml(raw);
      const foldedTerms = terms.map((term) => foldSearchText(term)).filter(Boolean).sort((a, b) => b.length - a.length);
      if (!foldedTerms.length) return escapeHtml(raw);
      const ranges = [];
      const occupied = new Set();
      for (const term of foldedTerms) {
        let from = 0;
        while (from < folded.length) {
          const idx = folded.indexOf(term, from);
          if (idx < 0) break;
          const end = idx + term.length;
          let overlaps = false;
          for (let p = idx; p < end; p += 1) {
            if (occupied.has(p)) { overlaps = true; break; }
          }
          if (!overlaps) {
            const startOrig = foldedToOriginal[idx];
            const endOrig = foldedToOriginal[end - 1] + 1;
            ranges.push([startOrig, endOrig]);
            for (let p = idx; p < end; p += 1) occupied.add(p);
          }
          from = idx + 1;
        }
      }
      if (!ranges.length) return escapeHtml(raw);
      ranges.sort((a, b) => a[0] - b[0]);
      let out = '';
      let cursor = 0;
      for (const [start, end] of ranges) {
        if (start > cursor) out += escapeHtml(raw.slice(cursor, start));
        out += `<mark class="${escapeHtml(markClass)}">${escapeHtml(raw.slice(start, end))}</mark>`;
        cursor = Math.max(cursor, end);
      }
      if (cursor < raw.length) out += escapeHtml(raw.slice(cursor));
      return out;
    }

    function metadataHighlightSnippet(asset, query) {
      const terms = extractHighlightTerms(query);
      if (!terms.length || !asset) return '';
      const hits = [];
      const description = String(asset.description || '').trim();
      if (description && terms.some((term) => textIncludesSearchTerm(description, term))) {
        hits.push(`<button type="button" class="dc-hit field-hit-jump" data-field-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-field-name="description"><strong>${escapeHtml(t('description'))}:</strong> ${highlightMatch(description, query)}</button>`);
      }
      return hits.slice(0, 2).join(' ');
    }

    function dcHighlightSnippet(asset, query) {
      const terms = extractHighlightTerms(query);
      if (!terms.length || !asset || !asset.dcMetadata || typeof asset.dcMetadata !== 'object') return '';
      const ignoredKeys = new Set(['subtitleurl', 'subtitlelang', 'subtitlelabel', 'subtitleitems', 'videoocrurl', 'videoocrlabel', 'videoocrengine', 'videoocrlinecount', 'videoocrsegmentcount', 'videoocritems']);
      const entries = Object.entries(asset.dcMetadata).filter(([key, value]) => {
        const foldedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (ignoredKeys.has(foldedKey)) return false;
        if (value === null || value === undefined) return false;
        if (typeof value === 'object') return false;
        return terms.some((term) => textIncludesSearchTerm(value, term));
      }).slice(0, 2);
      if (!entries.length) return '';
      return entries.map(([key, value]) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        const inputName = ({ title: 'dcTitle', creator: 'dcCreator', subject: 'dcSubject', description: 'dcDescription', publisher: 'dcPublisher', contributor: 'dcContributor', date: 'dcDate', type: 'dcType', format: 'dcFormat', identifier: 'dcIdentifier', source: 'dcSource', language: 'dcLanguage', relation: 'dcRelation', coverage: 'dcCoverage', rights: 'dcRights' })[normalizedKey] || '';
        const labelKey = ({ title: 'dc_title', creator: 'dc_creator', subject: 'dc_subject', description: 'dc_description', publisher: 'dc_publisher', contributor: 'dc_contributor', date: 'dc_date', type: 'dc_type', format: 'dc_format', identifier: 'dc_identifier', source: 'dc_source', language: 'dc_language', relation: 'dc_relation', coverage: 'dc_coverage', rights: 'dc_rights' })[normalizedKey] || normalizedKey;
        return `<button type="button" class="dc-hit field-hit-jump" data-field-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-field-name="${escapeHtml(inputName)}"><strong>${escapeHtml(t(labelKey))}:</strong> ${highlightMatch(value, query)}</button>`;
      }).join(' ');
    }

    function tagHighlightSnippet(asset, query) {
      const terms = extractHighlightTerms(query);
      const tags = Array.isArray(asset?.tags) ? asset.tags : [];
      if (!terms.length || !tags.length) return '';
      const hits = tags.map((tag) => String(tag || '').trim()).filter(Boolean).filter((tag) => terms.some((term) => textIncludesSearchTerm(tag, term))).slice(0, 3);
      if (!hits.length) return '';
      return hits.map((tag) => `<button type="button" class="dc-hit field-hit-jump" data-field-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-field-name="tags" data-focus-tag="${escapeHtml(tag)}"><strong>${escapeHtml(t('tags'))}:</strong> ${highlightMatch(tag, query)}</button>`).join(' ');
    }

    function clipHighlightSnippet(asset, query) {
      const terms = extractHighlightTerms(query);
      if (!terms.length || !asset || !Array.isArray(asset.cuts)) return '';
      const clips = asset.cuts.map((cut) => ({ cutId: String(cut?.cutId || '').trim(), label: String(cut?.label || '').trim(), inPointSeconds: Math.max(0, Number(cut?.inPointSeconds || 0)) })).filter((cut) => cut.cutId && cut.label && terms.some((term) => textIncludesSearchTerm(cut.label, term))).slice(0, 2);
      if (!clips.length) return '';
      return clips.map((cut) => {
        const startTc = secondsToTimecode(cut.inPointSeconds, PLAYER_FPS);
        return `<button type="button" class="dc-hit clip-hit-jump" data-clip-jump="1" data-id="${escapeHtml(String(asset.id || ''))}" data-cut-id="${escapeHtml(String(cut.cutId || ''))}" data-start-sec="${escapeHtml(String(cut.inPointSeconds))}"><strong>${escapeHtml(t('clip_name'))}:</strong> ${highlightMatch(cut.label, query)} <span class="dc-hit-tc">TC ${escapeHtml(startTc)}</span></button>`;
      }).join(' ');
    }

    function buildInlineFieldMatch(value, query) {
      const text = String(value || '').trim();
      if (!text || !query) return '';
      const highlighted = highlightMatch(text, query);
      if (highlighted === escapeHtml(text)) return '';
      return `<span class="field-inline-match">${highlighted}</span>`;
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
      if (firstTag) return `${tagColorStyle(firstTag)}color:#141922;`;
      return 'background:#3a3f4e;border-color:#5a6277;color:#e8eefc;';
    }

    function secondsToTimecode(timeSeconds, fps) {
      const safeFps = Math.max(1, Math.round(Number(fps) || 25));
      const totalFrames = Math.max(0, Math.round((Number(timeSeconds) || 0) * safeFps));
      const frames = totalFrames % safeFps;
      const totalSeconds = Math.floor(totalFrames / safeFps);
      const secs = totalSeconds % 60;
      const mins = Math.floor(totalSeconds / 60) % 60;
      const hours = Math.floor(totalSeconds / 3600);
      return [hours, mins, secs, frames].map((n) => String(n).padStart(2, '0')).join(':');
    }

    function parseTimecodeInput(value, fps) {
      const safeFps = Math.max(1, Math.round(Number(fps) || 25));
      const raw = String(value || '').trim();
      if (!raw) return NaN;
      if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));
      const parts = raw.split(':').map((part) => part.trim());
      if (parts.length !== 4) return NaN;
      const [hh, mm, ss, ff] = parts.map((part) => Number(part));
      if ([hh, mm, ss, ff].some((n) => !Number.isFinite(n) || n < 0)) return NaN;
      return (hh * 3600) + (mm * 60) + ss + (ff / safeFps);
    }

    function parseVttTime(value) {
      const raw = String(value || '').trim().replace(',', '.');
      const parts = raw.split(':').map((part) => part.trim());
      if (parts.length < 2 || parts.length > 3) return NaN;
      const sec = Number(parts.pop());
      const min = Number(parts.pop());
      const hour = parts.length ? Number(parts.pop()) : 0;
      if (![hour, min, sec].every(Number.isFinite)) return NaN;
      return Math.max(0, (hour * 3600) + (min * 60) + sec);
    }

    function parseVttCues(rawText) {
      const blocks = String(rawText || '')
        .replace(/\r/g, '')
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
      const cues = [];
      blocks.forEach((block) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const timeIndex = lines.findIndex((line) => line.includes('-->'));
        if (timeIndex < 0) return;
        const [startRaw, endRaw] = lines[timeIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
        const start = parseVttTime(startRaw);
        const end = parseVttTime(endRaw);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        const text = lines.slice(timeIndex + 1)
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) cues.push({ start, end, text });
      });
      return cues;
    }

    function getSubtitleRenderScale(mediaEl, hostEl) {
      const mediaRect = mediaEl?.getBoundingClientRect?.();
      const hostRect = hostEl?.getBoundingClientRect?.();
      const width = Number(mediaRect?.width) || Number(hostRect?.width) || 900;
      const height = Number(mediaRect?.height) || Number(hostRect?.height) || 506;
      const widthScale = width / 900;
      const heightScale = height / 506;
      return Math.max(0.46, Math.min(1.55, Math.min(widthScale, heightScale)));
    }

    function applyCustomSubtitleOverlayStyle(overlayEl, mediaEl) {
      const style = getSubtitleStyleSettings();
      const scale = getSubtitleRenderScale(mediaEl, overlayEl.parentElement);
      const fontSize = Math.max(10, Math.round(style.fontSize * scale));
      const bottomOffset = Math.max(0, Math.round(style.bottomOffset * scale));
      const horizontalPadding = Math.max(0, Math.round(style.horizontalPadding * scale));
      const verticalPadding = Math.max(5, Math.round(10 * scale));
      const radius = Math.max(4, Math.round(8 * scale));
      const hitRadius = Math.max(3, Math.round(5 * scale));
      const hitPadding = Math.max(1, Math.round(3 * scale));
      overlayEl.style.bottom = `${bottomOffset}px`;
      overlayEl.style.fontSize = `${fontSize}px`;
      overlayEl.style.color = style.textColor;
      overlayEl.style.maxWidth = `${style.maxWidth}%`;
      overlayEl.style.setProperty('--mam-subtitle-overlay-bg', `rgba(${parseInt(style.backgroundColor.slice(1, 3), 16)}, ${parseInt(style.backgroundColor.slice(3, 5), 16)}, ${parseInt(style.backgroundColor.slice(5, 7), 16)}, ${style.backgroundOpacity})`);
      overlayEl.style.setProperty('--mam-subtitle-overlay-pad-x', `${horizontalPadding}px`);
      overlayEl.style.setProperty('--mam-subtitle-overlay-pad-y', `${verticalPadding}px`);
      overlayEl.style.setProperty('--mam-subtitle-overlay-radius', `${radius}px`);
      overlayEl.style.setProperty('--mam-subtitle-overlay-hit-radius', `${hitRadius}px`);
      overlayEl.style.setProperty('--mam-subtitle-overlay-hit-pad-x', `${hitPadding}px`);
    }

    function applyNativeSubtitleCuePosition(mediaEl) {
      if (!(mediaEl instanceof HTMLMediaElement)) return;
      const style = getSubtitleStyleSettings();
      const rect = mediaEl.getBoundingClientRect?.();
      const height = Math.max(1, Number(rect?.height) || 506);
      const scale = getSubtitleRenderScale(mediaEl, mediaEl.parentElement);
      const bottomPx = Math.max(0, Number(style.bottomOffset) || 0) * scale;
      const linePercent = Math.max(5, Math.min(90, 95 - ((bottomPx / height) * 100)));
      const fontSize = Math.max(10, Math.round((Number(style.fontSize) || 24) * scale));
      Array.from(mediaEl.textTracks || []).forEach((track) => {
        if (track.kind !== 'subtitles' && track.kind !== 'captions') return;
        bindNativeCuePositionRefresh(track, mediaEl);
        const cues = Array.from(new Set([
          ...Array.from(track.cues || []),
          ...Array.from(track.activeCues || [])
        ]));
        cues.forEach((cue) => {
          try { cue.snapToLines = false; } catch (_error) {}
          try { cue.line = linePercent; } catch (_error) {}
          try { cue.position = 50; } catch (_error) {}
          try { cue.positionAlign = 'center'; } catch (_error) {}
          try { cue.lineAlign = 'center'; } catch (_error) {}
          try { cue.align = 'center'; } catch (_error) {}
          try { cue.size = 100; } catch (_error) {}
          try { cue.region = null; } catch (_error) {}
        });
      });
      mediaEl.style.setProperty('--mam-native-subtitle-font-size', `${fontSize}px`);
    }

    function nativeSubtitleWrapSettings(mediaEl) {
      const style = getSubtitleStyleSettings();
      const rect = mediaEl?.getBoundingClientRect?.();
      const scale = getSubtitleRenderScale(mediaEl, mediaEl?.parentElement);
      const width = Math.max(1, Number(rect?.width) || 900);
      const fontSize = Math.max(10, Math.round((Number(style.fontSize) || 24) * scale));
      const maxWidthPercent = Math.max(35, Math.min(100, Number(style.maxWidth) || 85));
      const padding = Math.max(0, Number(style.horizontalPadding) || 0) * scale;
      const usableWidth = Math.max(160, (width * (maxWidthPercent / 100)) - (padding * 2));
      const avgCharWidth = Math.max(6, fontSize * 0.52);
      return {
        maxChars: Math.max(16, Math.min(96, Math.floor(usableWidth / avgCharWidth))),
        fontSize,
        width: Math.round(width),
        maxWidthPercent: Math.round(maxWidthPercent)
      };
    }

    function wrapNativeSubtitleText(text, maxChars) {
      const raw = String(text || '').replace(/[ \t]+/g, ' ').trim();
      const limit = Math.max(16, Number(maxChars) || 42);
      if (!raw || raw.length <= limit) return raw;
      const words = raw.split(' ');
      const lines = [];
      let line = '';
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (next.length > limit && line) {
          lines.push(line);
          line = word;
          return;
        }
        line = next;
      });
      if (line) lines.push(line);
      return lines.join('\n');
    }

    function rewriteNativeSubtitleTextWrap(rawText, settings) {
      const lines = String(rawText || '').replace(/\r/g, '').split('\n');
      const output = [];
      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        output.push(line);
        if (!line.includes('-->')) {
          index += 1;
          continue;
        }
        index += 1;
        const cueText = [];
        while (index < lines.length && String(lines[index]).trim() !== '') {
          cueText.push(lines[index]);
          index += 1;
        }
        const normalizedText = cueText.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (normalizedText) output.push(wrapNativeSubtitleText(normalizedText, settings.maxChars));
      }
      return output.join('\n');
    }

    async function setNativeSubtitleTrackSource(trackEl, mediaEl, subtitleUrl) {
      if (!(trackEl instanceof HTMLTrackElement)) return;
      const rawUrl = String(subtitleUrl || '').trim();
      if (!rawUrl) return;
      const settings = nativeSubtitleWrapSettings(mediaEl);
      const signature = `${rawUrl}|${settings.width}|${settings.fontSize}|${settings.maxWidthPercent}|${settings.maxChars}`;
      if (trackEl.dataset.mamNativeSubtitleSignature === signature) return;
      trackEl.dataset.mamNativeSubtitleOriginalSrc = rawUrl;
      trackEl.dataset.mamNativeSubtitleSignature = signature;
      try {
        const response = await fetch(`${rawUrl}${rawUrl.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Subtitle fetch failed: ${response.status}`);
        const text = await response.text();
        const rewritten = rewriteNativeSubtitleTextWrap(text, settings);
        const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/vtt;charset=utf-8' }));
        const previousUrl = nativeSubtitleObjectUrls.get(trackEl);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        nativeSubtitleObjectUrls.set(trackEl, blobUrl);
        trackEl.src = blobUrl;
      } catch (_error) {
        const previousUrl = nativeSubtitleObjectUrls.get(trackEl);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        nativeSubtitleObjectUrls.delete(trackEl);
        trackEl.src = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
      }
    }

    function refreshNativeSubtitleTrackSources(mediaEl) {
      if (!(mediaEl instanceof HTMLMediaElement)) return;
      Array.from(mediaEl.querySelectorAll('track[kind="subtitles"], track[kind="captions"]')).forEach((trackEl) => {
        const originalSrc = String(trackEl.dataset.mamNativeSubtitleOriginalSrc || trackEl.getAttribute('src') || '').trim();
        if (!originalSrc || originalSrc.startsWith('blob:')) return;
        setNativeSubtitleTrackSource(trackEl, mediaEl, originalSrc);
      });
    }

    function bindNativeCuePositionRefresh(track, mediaEl) {
      if (!track || nativeCuePositionBoundTracks.has(track)) return;
      nativeCuePositionBoundTracks.add(track);
      if (typeof track.addEventListener === 'function') {
        track.addEventListener('cuechange', () => applyNativeSubtitleCuePosition(mediaEl));
      }
    }

    function scheduleNativeSubtitleCuePosition(mediaEl) {
      if (!(mediaEl instanceof HTMLMediaElement)) return;
      refreshNativeSubtitleTrackSources(mediaEl);
      applyNativeSubtitleCuePosition(mediaEl);
      const trackEls = Array.from(mediaEl.querySelectorAll('track[kind="subtitles"], track[kind="captions"]'));
      trackEls.forEach((trackEl) => {
        trackEl.addEventListener('load', () => applyNativeSubtitleCuePosition(mediaEl), { once: true });
      });
      setTimeout(() => applyNativeSubtitleCuePosition(mediaEl), 80);
      setTimeout(() => applyNativeSubtitleCuePosition(mediaEl), 240);
    }

    function initCustomSubtitleOverlay(mediaEl, asset, root = document) {
      if (!(mediaEl instanceof HTMLMediaElement) || !asset?.id) return () => {};
      const host = mediaEl.closest('.viewer-resizable') || mediaEl.parentElement || mediaEl.closest('.viewer-core') || root;
      if (!(host instanceof HTMLElement)) return () => {};
      let disposed = false;
      let cues = [];
      let loadedUrl = '';
      let loading = null;
      const overlay = document.createElement('div');
      overlay.className = 'mam-subtitle-overlay hidden';
      overlay.setAttribute('aria-live', 'polite');
      host.appendChild(overlay);

      const clearNativeTracks = () => {
        const existing = mediaEl.querySelector('#assetSubtitleTrack');
        if (existing) existing.remove();
        Array.from(mediaEl.textTracks || []).forEach((track) => {
          track.mode = 'hidden';
        });
      };

      const ensureCues = async () => {
        const url = String(asset.subtitleUrl || '').trim();
        if (!url) {
          cues = [];
          loadedUrl = '';
          return;
        }
        if (loadedUrl === url && cues.length) return;
        if (loading) return loading;
        loading = fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' })
          .then((response) => response.ok ? response.text() : '')
          .then((text) => {
            if (disposed) return;
            cues = parseVttCues(text);
            loadedUrl = url;
          })
          .catch(() => {
            cues = [];
            loadedUrl = '';
          })
          .finally(() => {
            loading = null;
          });
        return loading;
      };

      const render = () => {
        if (disposed) return;
        const enabled = getSubtitleOverlayEnabled(asset.id, false) && Boolean(asset.subtitleUrl) && customSubtitleOverlayEnabled();
        if (!enabled) {
          overlay.classList.add('hidden');
          overlay.innerHTML = '';
          return;
        }
        clearNativeTracks();
        applyCustomSubtitleOverlayStyle(overlay, mediaEl);
        const now = Number(mediaEl.currentTime) || 0;
        const cue = cues.find((item) => now >= item.start && now <= item.end);
        if (!cue) {
          overlay.classList.add('hidden');
          overlay.innerHTML = '';
          return;
        }
        const query = String(currentSubtitleQueryRef?.get?.() || '').trim();
        overlay.innerHTML = `<span>${highlightMatch(cue.text, query, 'mam-subtitle-overlay-hit')}</span>`;
        overlay.classList.remove('hidden');
      };

      const refresh = async () => {
        if (disposed) return;
        if (!customSubtitleOverlayEnabled()) {
          overlay.classList.add('hidden');
          scheduleNativeSubtitleCuePosition(mediaEl);
          return;
        }
        clearNativeTracks();
        await ensureCues();
        render();
      };

      const onTimeUpdate = () => render();
      const onSync = () => {
        refresh();
      };
      const onLoadedMetadata = () => refresh();
      const onResize = () => {
        if (customSubtitleOverlayEnabled()) render();
        else scheduleNativeSubtitleCuePosition(mediaEl);
      };
      let resizeObserver = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(host);
        resizeObserver.observe(mediaEl);
      }
      mediaEl.addEventListener('timeupdate', onTimeUpdate);
      mediaEl.addEventListener('seeked', onTimeUpdate);
      mediaEl.addEventListener('loadedmetadata', onLoadedMetadata);
      mediaEl.addEventListener('mam:subtitle-overlay-sync', onSync);
      window.addEventListener('resize', onResize);
      document.addEventListener('fullscreenchange', onResize);
      document.addEventListener('webkitfullscreenchange', onResize);
      refresh();

      return () => {
        disposed = true;
        mediaEl.removeEventListener('timeupdate', onTimeUpdate);
        mediaEl.removeEventListener('seeked', onTimeUpdate);
        mediaEl.removeEventListener('loadedmetadata', onLoadedMetadata);
        mediaEl.removeEventListener('mam:subtitle-overlay-sync', onSync);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('fullscreenchange', onResize);
        document.removeEventListener('webkitfullscreenchange', onResize);
        resizeObserver?.disconnect?.();
        overlay.remove();
      };
    }

    function subtitleTrackMarkup(asset) {
      if (!asset?.subtitleUrl) return '';
      if (!getSubtitleOverlayEnabled(asset.id, false)) return '';
      if (customSubtitleOverlayEnabled()) return '';
      const currentLang = currentLangRef?.get?.() || 'tr';
      const src = `${asset.subtitleUrl}${asset.subtitleUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
      const lang = String(asset.subtitleLang || currentLang || 'tr').slice(0, 12);
      const label = String(asset.subtitleLabel || t('subtitles'));
      return `<track id="assetSubtitleTrack" kind="subtitles" label="${escapeHtml(label)}" srclang="${escapeHtml(lang)}" src="${escapeHtml(src)}" default />`;
    }

    return {
      escapeHtml,
      escapeRegExp,
      extractPdfChangeKindFromNote,
      renderPdfChangeKindLabel,
      cleanVersionNoteText,
      normalizeForSearch,
      findMatchRanges,
      highlightTextByRanges,
      serializeForm,
      highlightSuggestText,
      getSubtitleOverlayEnabled,
      syncSubtitleOverlayInOpenPlayers,
      readFileAsBase64,
      getFileExtension,
      isVideo,
      isAudio,
      isImage,
      isPdf,
      isDocument,
      isOfficeDocument,
      isTextPreviewable,
      docThumbDataUrl,
      thumbFallbackForAsset,
      documentSearchControls,
      formatDate,
      formatDuration,
      formatBitrate,
      formatFileSize,
      formatFrameRate,
      techValue,
      renderTechnicalCard,
      renderTechnicalInfoSection,
      initTechnicalTabs,
      loadAssetTechnicalInfo,
      extractDcMetadataFromPayload,
      foldSearchText,
      textIncludesSearchTerm,
      effectiveSearchHighlightClass,
      highlightMatch,
      metadataHighlightSnippet,
      dcHighlightSnippet,
      tagHighlightSnippet,
      clipHighlightSnippet,
      buildInlineFieldMatch,
      extractHighlightTerms,
      hashString,
      tagColorStyle,
      assetTagChipStyle,
      secondsToTimecode,
      parseTimecodeInput,
      initCustomSubtitleOverlay,
      applyNativeSubtitleCuePosition,
      scheduleNativeSubtitleCuePosition,
      subtitleTrackMarkup
    };
  }

  global.createMainCommonModule = createMainCommonModule;
})(window);
