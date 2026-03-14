const state = {
  assets: [],
  filteredAssets: [],
  selectedAsset: null,
  subtitleJobTimer: null,
  ocrJobTimer: null,
  activeToolTab: 'subtitle',
  sessionUploadedIds: [],
  activeOcrText: '',
  activeOcrSegments: []
};

const els = {
  assetSearchInput: document.getElementById('assetSearchInput'),
  refreshAssetsBtn: document.getElementById('refreshAssetsBtn'),
  ingestFileInput: document.getElementById('ingestFileInput'),
  ingestTitleInput: document.getElementById('ingestTitleInput'),
  ingestDescInput: document.getElementById('ingestDescInput'),
  ingestTagsInput: document.getElementById('ingestTagsInput'),
  ingestUploadBtn: document.getElementById('ingestUploadBtn'),
  ingestStatus: document.getElementById('ingestStatus'),
  assetList: document.getElementById('assetList'),
  assetTitle: document.getElementById('assetTitle'),
  assetMeta: document.getElementById('assetMeta'),
  appStatus: document.getElementById('appStatus'),
  toolTabSubtitle: document.getElementById('toolTabSubtitle'),
  toolTabOcr: document.getElementById('toolTabOcr'),
  toolPanelSubtitle: document.getElementById('toolPanelSubtitle'),
  toolPanelOcr: document.getElementById('toolPanelOcr'),
  videoPlayer: document.getElementById('videoPlayer'),
  currentTc: document.getElementById('currentTc'),
  playerSourceHint: document.getElementById('playerSourceHint'),
  subtitleSelect: document.getElementById('subtitleSelect'),
  applySubtitleBtn: document.getElementById('applySubtitleBtn'),
  subtitleUploadInput: document.getElementById('subtitleUploadInput'),
  subtitleLangInput: document.getElementById('subtitleLangInput'),
  subtitleUploadBtn: document.getElementById('subtitleUploadBtn'),
  subtitleModelInput: document.getElementById('subtitleModelInput'),
  subtitleGenLangInput: document.getElementById('subtitleGenLangInput'),
  subtitleGenerateLabelInput: document.getElementById('subtitleGenerateLabelInput'),
  subtitleTurkishFixCheck: document.getElementById('subtitleTurkishFixCheck'),
  subtitleWhisperxCheck: document.getElementById('subtitleWhisperxCheck'),
  subtitleGenerateBtn: document.getElementById('subtitleGenerateBtn'),
  subtitleSearchInput: document.getElementById('subtitleSearchInput'),
  subtitleSearchBtn: document.getElementById('subtitleSearchBtn'),
  subtitleEditContentBtn: document.getElementById('subtitleEditContentBtn'),
  subtitleSearchResults: document.getElementById('subtitleSearchResults'),
  ocrIntervalInput: document.getElementById('ocrIntervalInput'),
  ocrLangInput: document.getElementById('ocrLangInput'),
  ocrEngineSelect: document.getElementById('ocrEngineSelect'),
  ocrPreprocessSelect: document.getElementById('ocrPreprocessSelect'),
  ocrAdvancedCheck: document.getElementById('ocrAdvancedCheck'),
  ocrTurkishFixCheck: document.getElementById('ocrTurkishFixCheck'),
  ocrBlurCheck: document.getElementById('ocrBlurCheck'),
  ocrStaticOverlayCheck: document.getElementById('ocrStaticOverlayCheck'),
  ocrExtractBtn: document.getElementById('ocrExtractBtn'),
  ocrSaveBtn: document.getElementById('ocrSaveBtn'),
  ocrDownloadLink: document.getElementById('ocrDownloadLink'),
  ocrJobInfo: document.getElementById('ocrJobInfo'),
  ocrSearchInput: document.getElementById('ocrSearchInput'),
  ocrSearchBtn: document.getElementById('ocrSearchBtn'),
  ocrEditContentBtn: document.getElementById('ocrEditContentBtn'),
  ocrSearchResults: document.getElementById('ocrSearchResults')
};

function setStatus(text) {
  els.appStatus.textContent = String(text || 'Hazır');
}

function clearTimer(key) {
  if (state[key]) {
    clearInterval(state[key]);
    state[key] = null;
  }
}

function setIngestStatus(text) {
  if (!els.ingestStatus) return;
  els.ingestStatus.textContent = String(text || '');
}

function parseDateMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function humanDate(value) {
  const ms = parseDateMs(value);
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_error) {
    return String(value || '-');
  }
}

function setToolTab(nextTab) {
  const tab = nextTab === 'ocr' ? 'ocr' : 'subtitle';
  state.activeToolTab = tab;
  localStorage.setItem('ocrtest.activeToolTab', tab);

  const isSubtitle = tab === 'subtitle';
  els.toolTabSubtitle?.classList.toggle('active', isSubtitle);
  els.toolTabOcr?.classList.toggle('active', !isSubtitle);
  els.toolTabSubtitle?.setAttribute('aria-selected', isSubtitle ? 'true' : 'false');
  els.toolTabOcr?.setAttribute('aria-selected', isSubtitle ? 'false' : 'true');
  els.toolPanelSubtitle?.classList.toggle('active', isSubtitle);
  els.toolPanelOcr?.classList.toggle('active', !isSubtitle);
  els.toolPanelSubtitle?.setAttribute('aria-hidden', isSubtitle ? 'false' : 'true');
  els.toolPanelOcr?.setAttribute('aria-hidden', isSubtitle ? 'true' : 'false');
}

function rememberUploadedAsset(assetId) {
  const id = String(assetId || '').trim();
  if (!id) return;
  const merged = [id, ...state.sessionUploadedIds.filter((x) => x !== id)];
  state.sessionUploadedIds = merged.slice(0, 80);
  localStorage.setItem('ocrtest.sessionUploadedIds', JSON.stringify(state.sessionUploadedIds));
}

function formatTc(sec = 0) {
  const s = Math.max(0, Number(sec) || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const ff = String(Math.floor((s % 1) * 25)).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
}

function formatDuration(sec = 0) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeAssetArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.assets)) return payload.assets;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
  }
  return [];
}

function hasVideoExt(value) {
  const text = String(value || '').toLowerCase();
  return /\.(mp4|mov|mxf|mkv|avi|webm|m4v|ts|mpeg|mpg)(?:$|\?)/i.test(text);
}

function isLikelyVideoAsset(item) {
  const type = String(item?.type || '').toLowerCase();
  const mime = String(item?.mimeType || item?.mime_type || '').toLowerCase();
  const fileName = String(item?.fileName || item?.file_name || '').toLowerCase();
  const mediaUrl = String(item?.mediaUrl || item?.media_url || '').toLowerCase();
  const proxyUrl = String(item?.proxyUrl || item?.proxy_url || '').toLowerCase();
  if (type === 'video' || type.includes('video')) return true;
  if (mime.startsWith('video/')) return true;
  if (hasVideoExt(fileName) || hasVideoExt(mediaUrl) || hasVideoExt(proxyUrl)) return true;
  return false;
}

function highlight(text, query) {
  const source = String(text || '');
  const q = String(query || '').trim();
  if (!q) return escapeHtml(source);
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'giu');
  return escapeHtml(source).replace(regex, (m) => `<mark>${m}</mark>`);
}

function formatEditorTc(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  const ff = String(Math.floor((safe % 1) * 25)).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
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
      <div class="content-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'İçerik Düzenle')}">
        <h4>${escapeHtml(title || 'İçerik Düzenle')}</h4>
        ${hasMedia ? `
        <div class="content-modal-audio" role="group" aria-label="Ses Önizleme">
          <div class="content-modal-audio-head">
            <span>Ses Önizleme</span>
            <span class="content-modal-audio-tc">TC: <strong id="contentEditorAudioTc">00:00:00.000</strong></span>
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
            <span>Ara</span>
            <input id="contentEditorFindInput" type="text" />
          </label>
          <label>
            <span>Değiştir</span>
            <input id="contentEditorReplaceInput" type="text" />
          </label>
          <button type="button" id="contentEditorFindNextBtn">Sonrakini Bul</button>
          <button type="button" id="contentEditorReplaceAllBtn">Tümünü Değiştir</button>
        </div>
        <div class="content-modal-layout">
          <textarea id="contentEditorArea"></textarea>
          <aside class="content-modal-side">
            <h5>Öğrenilmiş Düzeltmeler</h5>
            <div class="content-modal-side-grid">
              <input id="contentEditorLcWrong" type="text" placeholder="yanlış ifade..." />
              <input id="contentEditorLcCorrect" type="text" placeholder="doğru ifade..." />
            </div>
            <div class="content-modal-side-actions">
              <button type="button" id="contentEditorLcUseSelection">Seçili metni al</button>
              <button type="button" id="contentEditorLcAdd">Ekle</button>
            </div>
            <div id="contentEditorLcMsg" class="content-modal-side-msg"></div>
            <div id="contentEditorLcRows" class="content-modal-side-rows"></div>
          </aside>
        </div>
        <div class="content-modal-actions">
          <button type="button" id="contentEditorCancelBtn">Vazgeç</button>
          <button type="button" id="contentEditorSaveBtn">Kaydet</button>
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
    let lcEntries = [];
    let lastFindPos = 0;
    let lastFindQuery = '';

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
      if (!area) return;
      const query = String(findInput?.value || '').trim();
      if (!query) return;
      const text = String(area.value || '');
      const foldedText = foldForFind(text);
      const foldedQuery = foldForFind(query);
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
      const query = String(findInput?.value || '').trim();
      if (!query) return;
      const replacement = String(replaceInput?.value || '');
      const source = String(area.value || '');
      const foldedSource = foldForFind(source);
      const foldedQuery = foldForFind(query);
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
        out += replacement;
        cursor = idx + foldedQuery.length;
      }
      area.value = out;
    };

    const applyReplacementToArea = (wrong, correct) => {
      if (!area) return;
      const w = String(wrong || '').trim();
      if (!w) return;
      const c = String(correct || '');
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      area.value = String(area.value || '').replace(new RegExp(escaped, 'giu'), c);
    };

    const renderLcRows = () => {
      if (!lcRows) return;
      if (!lcEntries.length) {
        lcRows.innerHTML = '<div class="muted">Henüz öğrenilmiş düzeltme yok.</div>';
        return;
      }
      lcRows.innerHTML = lcEntries.map((item, index) => `
        <div class="content-lc-row">
          <div class="content-lc-text">
            <strong>${escapeHtml(item.wrong || '')}</strong>
            <span>${escapeHtml(item.correct || '')}</span>
          </div>
          <div class="content-lc-actions">
            <button type="button" class="content-lc-apply" data-index="${index}">Uygula</button>
            <button type="button" class="content-lc-delete" data-index="${index}">Sil</button>
          </div>
        </div>
      `).join('');
    };

    const loadLc = async () => {
      try {
        const result = await api('/api/admin/turkish-corrections');
        lcEntries = Array.isArray(result?.entries) ? result.entries : [];
        renderLcRows();
      } catch (error) {
        if (lcMsg) lcMsg.textContent = String(error.message || 'İstek başarısız');
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
        if (lcMsg) lcMsg.textContent = 'Yanlış ve doğru alanları zorunludur.';
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
        if (lcMsg) lcMsg.textContent = 'Öğrenilmiş düzeltme kaydedildi.';
        await loadLc();
      } catch (error) {
        if (lcMsg) lcMsg.textContent = String(error.message || 'İstek başarısız');
      }
    });

    lcRows?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-index]');
      if (!button) return;
      const idx = Number(button.dataset.index);
      if (!Number.isFinite(idx) || idx < 0 || idx >= lcEntries.length) return;
      const item = lcEntries[idx];
      if (button.classList.contains('content-lc-apply')) {
        applyReplacementToArea(item.wrong, item.correct);
        return;
      }
      if (button.classList.contains('content-lc-delete')) {
        try {
          await api(`/api/admin/turkish-corrections?wrong=${encodeURIComponent(String(item.wrong || ''))}`, { method: 'DELETE' });
          if (lcMsg) lcMsg.textContent = 'Öğrenilmiş düzeltme silindi.';
          await loadLc();
        } catch (error) {
          if (lcMsg) lcMsg.textContent = String(error.message || 'İstek başarısız');
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
    backdrop.querySelector('#contentEditorSaveBtn')?.addEventListener('click', () => close(String(area?.value || '')));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });
    loadLc().catch(() => {});
  });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const isApiCall = String(path || '').startsWith('/api/');
  if (!response.ok) {
    let detail = '';
    try {
      if (contentType.includes('application/json')) {
        const errJson = await response.json();
        detail = String(errJson.error || JSON.stringify(errJson));
      } else {
        detail = await response.text();
      }
    } catch (_error) {
      detail = '';
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  // DELETE gibi uçlar 204/205 ve boş body döndürebilir; bunu hata sayma.
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  if (isApiCall && !isJson) {
    const raw = await response.text();
    if (!String(raw || '').trim()) return null;
    throw new Error('API beklenmeyen yanıt döndü (JSON değil). OCRtest backend durumunu kontrol edin.');
  }

  if (isJson) {
    return response.json();
  }
  return response.text();
}

function toVideoAssets(items) {
  return normalizeAssetArray(items).filter(isLikelyVideoAsset);
}

function renderAssetList() {
  const query = String(els.assetSearchInput.value || '').trim().toLocaleLowerCase('tr');
  const uploadedSet = new Set(state.sessionUploadedIds.map((id) => String(id)));
  const filtered = state.assets.filter((asset) => {
    if (!query) return true;
    const hay = `${asset.title || ''} ${asset.fileName || ''}`.toLocaleLowerCase('tr');
    return hay.includes(query);
  });
  state.filteredAssets = filtered.sort((a, b) => {
    const aUploaded = uploadedSet.has(String(a.id)) ? 1 : 0;
    const bUploaded = uploadedSet.has(String(b.id)) ? 1 : 0;
    if (aUploaded !== bUploaded) return bUploaded - aUploaded;
    return parseDateMs(b.createdAt || b.updatedAt) - parseDateMs(a.createdAt || a.updatedAt);
  });

  if (!state.filteredAssets.length) {
    els.assetList.innerHTML = '<div class="muted">Video asset bulunamadı.</div>';
    return;
  }

  els.assetList.innerHTML = state.filteredAssets.map((asset) => {
    const active = state.selectedAsset && state.selectedAsset.id === asset.id ? 'active' : '';
    const uploadedBadge = uploadedSet.has(String(asset.id))
      ? '<span class="asset-badge">Yüklendi</span>'
      : '';
    return `
      <div class="asset-item ${active}" data-id="${asset.id}">
        <div class="asset-row-head">
          <div class="name">${escapeHtml(asset.title || asset.fileName || asset.id)}</div>
          <div class="asset-row-actions">
            ${uploadedBadge}
            <button type="button" class="asset-delete-btn" data-id="${asset.id}">Sil</button>
          </div>
        </div>
        <div class="meta">${escapeHtml(asset.fileName || '-')} · ${escapeHtml(asset.owner || '-')} · ${escapeHtml(humanDate(asset.createdAt || asset.updatedAt))}</div>
      </div>
    `;
  }).join('');

  els.assetList.querySelectorAll('.asset-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      if (id) selectAsset(id);
    });
  });

  els.assetList.querySelectorAll('.asset-delete-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(button.dataset.id || '').trim();
      if (!id) return;
      await deleteAsset(id);
    });
  });
}

async function loadAssets() {
  setStatus('Asset listesi yükleniyor...');
  try {
    const rows = await api('/api/assets?limit=500');
    state.assets = toVideoAssets(rows);
    renderAssetList();
    setStatus(`Hazır (${state.assets.length} video)`);
  } catch (error) {
    setStatus('Asset yükleme hatası');
    alert(`Asset listesi alınamadı: ${error.message}`);
  }
}

async function deleteAsset(assetId) {
  const id = String(assetId || '').trim();
  if (!id) return;
  const row = state.assets.find((item) => String(item.id) === id);
  const label = row?.title || row?.fileName || id;
  const confirmed = window.confirm(`Asset silinsin mi?\n${label}`);
  if (!confirmed) return;
  setStatus('Asset siliniyor...');
  try {
    await api(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.sessionUploadedIds = state.sessionUploadedIds.filter((x) => String(x) !== id);
    localStorage.setItem('ocrtest.sessionUploadedIds', JSON.stringify(state.sessionUploadedIds));
    const wasSelected = String(state.selectedAsset?.id || '') === id;
    await loadAssets();
    if (wasSelected) {
      if (state.assets.length) {
        await selectAsset(state.assets[0].id);
      } else {
        state.selectedAsset = null;
        localStorage.removeItem('ocrtest.selectedAssetId');
        els.assetTitle.textContent = 'Video seçin';
        els.assetMeta.textContent = '-';
        els.playerSourceHint.textContent = 'Kaynak: -';
        els.videoPlayer.removeAttribute('src');
        els.videoPlayer.load();
        renderEmptyResults(els.subtitleSearchResults, 'Arama sonucu burada görünecek.');
        renderEmptyResults(els.ocrSearchResults, 'Arama sonucu burada görünecek.');
      }
    }
    setStatus('Asset silindi');
  } catch (error) {
    setStatus('Asset silme hatası');
    alert(error.message || 'Asset silinemedi');
  }
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

function applyVideoSource(asset) {
  const source = String(asset.proxyUrl || asset.mediaUrl || '').trim();
  els.videoPlayer.src = source;
  els.videoPlayer.load();
  els.playerSourceHint.textContent = `Kaynak: ${source || '-'}`;
}

function resetTracks() {
  Array.from(els.videoPlayer.querySelectorAll('track')).forEach((track) => track.remove());
}

function applySubtitleTrack(url, lang = 'tr', label = 'subtitle') {
  resetTracks();
  if (!url) return;
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.src = url;
  track.srclang = lang || 'tr';
  track.label = label || 'subtitle';
  track.default = true;
  els.videoPlayer.appendChild(track);
}

function renderSubtitleOptions() {
  const asset = state.selectedAsset;
  const items = Array.isArray(asset?.subtitleItems) ? asset.subtitleItems : [];
  els.subtitleSelect.innerHTML = '';

  if (!items.length) {
    els.subtitleSelect.innerHTML = '<option value="">Altyazı yok</option>';
    applySubtitleTrack('');
    return;
  }

  const activeUrl = String(asset.subtitleUrl || '').trim();
  items.forEach((item, idx) => {
    const option = document.createElement('option');
    option.value = String(item.subtitleUrl || '');
    const lang = String(item.subtitleLang || '').trim();
    option.textContent = `${item.subtitleLabel || `subtitle-${idx + 1}`}${lang ? ` (${lang})` : ''}`;
    if (activeUrl && option.value === activeUrl) option.selected = true;
    els.subtitleSelect.appendChild(option);
  });

  const current = items.find((item) => String(item.subtitleUrl || '') === els.subtitleSelect.value) || items[0];
  applySubtitleTrack(current.subtitleUrl, current.subtitleLang, current.subtitleLabel);
}

function renderEmptyResults(el, message) {
  el.innerHTML = `<div class="muted">${escapeHtml(message)}</div>`;
}

function seekTo(sec) {
  const value = Math.max(0, Number(sec) || 0);
  els.videoPlayer.currentTime = value;
  els.videoPlayer.play().catch(() => {});
}

function renderSubtitleSearchResults(query, matches) {
  if (!Array.isArray(matches) || !matches.length) {
    renderEmptyResults(els.subtitleSearchResults, 'Eşleşme yok.');
    return;
  }
  els.subtitleSearchResults.innerHTML = matches.map((m) => `
    <div class="result-item" data-sec="${Number(m.startSec || 0)}">
      <div class="tc">${escapeHtml(m.startTc || formatTc(m.startSec || 0))}</div>
      <div class="text">${highlight(String(m.text || ''), query)}</div>
    </div>
  `).join('');

  els.subtitleSearchResults.querySelectorAll('.result-item').forEach((row) => {
    row.addEventListener('click', () => seekTo(Number(row.dataset.sec || 0)));
  });
}

function parseOcrSegments(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    const clean = String(line || '').trim();
    if (!clean) continue;
    const ranged = clean.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)$/);
    if (ranged) {
      out.push({
        startTc: ranged[1],
        endTc: ranged[2],
        startSec: tcToSec(ranged[1]),
        endSec: tcToSec(ranged[2]),
        text: ranged[3]
      });
      continue;
    }
    const single = clean.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)$/);
    if (single) {
      const sec = tcToSec(single[1]);
      out.push({
        startTc: single[1],
        endTc: single[1],
        startSec: sec,
        endSec: sec,
        text: single[2]
      });
    }
  }
  return out;
}

function tcToSec(tc) {
  const match = String(tc || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return 0;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + (Number(match[4]) / 1000);
}

function renderOcrSearchResults(query, list) {
  if (!Array.isArray(list) || !list.length) {
    renderEmptyResults(els.ocrSearchResults, 'Eşleşme yok.');
    return;
  }
  els.ocrSearchResults.innerHTML = list.map((m) => {
    const label = m.startTc ? `${m.startTc}${m.endTc && m.endTc !== m.startTc ? ` --> ${m.endTc}` : ''}` : formatTc(m.startSec || 0);
    return `
      <div class="result-item" data-sec="${Number(m.startSec || 0)}">
        <div class="tc">${escapeHtml(label)}</div>
        <div class="text">${highlight(String(m.text || ''), query)}</div>
      </div>
    `;
  }).join('');

  els.ocrSearchResults.querySelectorAll('.result-item').forEach((row) => {
    row.addEventListener('click', () => seekTo(Number(row.dataset.sec || 0)));
  });
}

async function loadLatestOcr(assetId) {
  try {
    const latest = await api(`/api/assets/${assetId}/video-ocr/latest`);
    showOcrJob(latest);
    const url = String(latest.resultUrl || '').trim();
    if (url) await loadOcrText(url);
  } catch (_error) {
    els.ocrJobInfo.textContent = 'Henüz OCR çıktısı yok.';
    state.activeOcrText = '';
    state.activeOcrSegments = [];
    renderEmptyResults(els.ocrSearchResults, 'OCR sonucu yok.');
  }
}

async function loadOcrText(url) {
  const text = await api(url, { method: 'GET', headers: {} });
  state.activeOcrText = String(text || '');
  state.activeOcrSegments = parseOcrSegments(state.activeOcrText);
}

function showOcrJob(job) {
  const lines = [
    `Status: ${job.status || '-'}`,
    `Engine: ${job.ocrEngine || '-'}`,
    `Mode: ${job.mode || '-'}`,
    `Lines: ${Number(job.lineCount || 0)} / Segments: ${Number(job.segmentCount || 0)}`,
    `Scene Frames: ${Number(job.sceneFrameCount || 0)} / Patched: ${Number(job.patchedPeriodicFrames || 0)}`,
    `Warning: ${job.warning || '-'}`,
    `Error: ${job.error || '-'}`
  ];
  els.ocrJobInfo.textContent = lines.join('\n');

  const url = String(job.downloadUrl || job.resultUrl || '').trim();
  if (url) {
    els.ocrDownloadLink.classList.remove('hidden');
    els.ocrDownloadLink.href = url;
  } else {
    els.ocrDownloadLink.classList.add('hidden');
    els.ocrDownloadLink.href = '#';
  }

  const canSave = String(job.status || '') === 'completed' && !job.saved && String(job.jobId || '').trim();
  els.ocrSaveBtn.classList.toggle('hidden', !canSave);
  els.ocrSaveBtn.dataset.jobId = canSave ? String(job.jobId) : '';
}

async function selectAsset(assetId) {
  clearTimer('subtitleJobTimer');
  clearTimer('ocrJobTimer');
  setStatus('Asset açılıyor...');
  try {
    const asset = await api(`/api/assets/${assetId}`);
    state.selectedAsset = asset;
    localStorage.setItem('ocrtest.selectedAssetId', String(asset.id || ''));
    renderAssetList();

    els.assetTitle.textContent = asset.title || asset.fileName || asset.id;
    els.assetMeta.textContent = `${asset.fileName || '-'} · ${asset.owner || '-'} · ${formatDuration(asset.durationSeconds || 0)}`;

    applyVideoSource(asset);
    renderSubtitleOptions();
    renderEmptyResults(els.subtitleSearchResults, 'Arama sonucu burada görünecek.');
    renderEmptyResults(els.ocrSearchResults, 'Arama sonucu burada görünecek.');

    await loadLatestOcr(asset.id);
    setStatus('Hazır');
  } catch (error) {
    setStatus('Asset açılamadı');
    alert(`Asset açılamadı: ${error.message}`);
  }
}

async function pollSubtitleJob(jobId) {
  clearTimer('subtitleJobTimer');
  setStatus('Altyazı işi çalışıyor...');
  state.subtitleJobTimer = setInterval(async () => {
    try {
      const job = await api(`/api/subtitle-jobs/${jobId}`);
      if (job.status === 'completed') {
        clearTimer('subtitleJobTimer');
        setStatus('Altyazı tamamlandı ve assete kaydedildi');
        const activeAssetId = String(state.selectedAsset?.id || '').trim();
        if (activeAssetId) {
          await selectAsset(activeAssetId);
        }
        if (String(job.subtitleUrl || '').trim()) {
          applySubtitleTrack(job.subtitleUrl, job.subtitleLang || 'tr', job.subtitleLabel || 'auto-whisper');
        }
        return;
      }
      if (job.status === 'failed') {
        clearTimer('subtitleJobTimer');
        setStatus('Altyazı işi hatalı');
        alert(job.error || 'Subtitle generation failed');
      }
    } catch (error) {
      clearTimer('subtitleJobTimer');
      setStatus('Altyazı izleme hatası');
      alert(error.message);
    }
  }, 2000);
}

async function pollOcrJob(jobId) {
  clearTimer('ocrJobTimer');
  setStatus('OCR işi çalışıyor...');
  state.ocrJobTimer = setInterval(async () => {
    try {
      const job = await api(`/api/video-ocr-jobs/${jobId}`);
      showOcrJob(job);
      if (job.status === 'completed') {
        clearTimer('ocrJobTimer');
        setStatus('OCR tamamlandı');
        const url = String(job.resultUrl || '').trim();
        if (url) await loadOcrText(url);
        return;
      }
      if (job.status === 'failed') {
        clearTimer('ocrJobTimer');
        setStatus('OCR işi hatalı');
        alert(job.error || 'Video OCR failed');
      }
    } catch (error) {
      clearTimer('ocrJobTimer');
      setStatus('OCR izleme hatası');
      alert(error.message);
    }
  }, 2500);
}

async function uploadSubtitle() {
  if (!state.selectedAsset) return;
  const file = els.subtitleUploadInput.files?.[0];
  if (!file) {
    alert('Önce .vtt/.srt dosyası seçin.');
    return;
  }
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });

  setStatus('Altyazı yükleniyor...');
  try {
    await api(`/api/assets/${state.selectedAsset.id}/subtitles`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        fileData: base64,
        lang: String(els.subtitleLangInput.value || 'tr').trim()
      })
    });
    await selectAsset(state.selectedAsset.id);
    setStatus('Altyazı yüklendi');
  } catch (error) {
    setStatus('Altyazı yükleme hatası');
    alert(error.message);
  }
}

async function uploadVideoIngest() {
  const file = els.ingestFileInput?.files?.[0];
  if (!file) {
    alert('Önce bir video dosyası seçin.');
    return;
  }
  const titleInput = String(els.ingestTitleInput?.value || '').trim();
  const title = titleInput || file.name.replace(/\.[^.]+$/, '');
  const description = String(els.ingestDescInput?.value || '').trim();
  const tags = String(els.ingestTagsInput?.value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  els.ingestUploadBtn.disabled = true;
  setStatus('Video yükleniyor...');
  setIngestStatus('Dosya okunuyor...');
  try {
    const fileData = await fileToBase64(file);
    setIngestStatus('Sunucuya gönderiliyor...');
    const created = await api('/api/assets/upload', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        fileData,
        title,
        description,
        tags,
        type: 'video'
      })
    });
    if (created?.id) rememberUploadedAsset(created.id);
    setIngestStatus('Yükleme tamamlandı.');
    setStatus('Video yüklendi');
    await loadAssets();
    if (created?.id) {
      await selectAsset(created.id);
    }
  } catch (error) {
    setIngestStatus(`Hata: ${error.message}`);
    setStatus('Video yükleme hatası');
    alert(error.message);
  } finally {
    els.ingestUploadBtn.disabled = false;
  }
}

async function generateSubtitle() {
  if (!state.selectedAsset) return;
  setStatus('Altyazı işi kuyruğa alınıyor...');
  try {
    const queued = await api(`/api/assets/${state.selectedAsset.id}/subtitles/generate`, {
      method: 'POST',
      body: JSON.stringify({
        lang: String(els.subtitleGenLangInput.value || 'tr').trim(),
        model: String(els.subtitleModelInput.value || 'small').trim(),
        label: String(els.subtitleGenerateLabelInput?.value || '').trim() || 'auto-whisper',
        useWhisperX: Boolean(els.subtitleWhisperxCheck?.checked),
        turkishAiCorrect: Boolean(els.subtitleTurkishFixCheck.checked),
        useZemberekLexicon: Boolean(els.subtitleTurkishFixCheck.checked)
      })
    });
    await pollSubtitleJob(queued.jobId);
  } catch (error) {
    setStatus('Altyazı işi başlatılamadı');
    alert(error.message);
  }
}

async function runSubtitleSearch() {
  if (!state.selectedAsset) return;
  const q = String(els.subtitleSearchInput.value || '').trim();
  if (!q) {
    renderEmptyResults(els.subtitleSearchResults, 'Arama metni girin.');
    return;
  }
  try {
    const result = await api(`/api/assets/${state.selectedAsset.id}/subtitles/search?q=${encodeURIComponent(q)}&limit=50`);
    renderSubtitleSearchResults(q, result.matches || []);
  } catch (error) {
    renderEmptyResults(els.subtitleSearchResults, `Hata: ${error.message}`);
  }
}

async function extractOcr() {
  if (!state.selectedAsset) return;
  setStatus('OCR işi kuyruğa alınıyor...');
  els.ocrSaveBtn.classList.add('hidden');

  try {
    const queued = await api(`/api/assets/${state.selectedAsset.id}/video-ocr/extract`, {
      method: 'POST',
      body: JSON.stringify({
        intervalSec: Number(els.ocrIntervalInput.value || 4),
        ocrLang: String(els.ocrLangInput.value || 'eng+tur').trim(),
        ocrEngine: String(els.ocrEngineSelect.value || 'paddle').trim(),
        preprocessProfile: String(els.ocrPreprocessSelect.value || 'light').trim(),
        advancedMode: Boolean(els.ocrAdvancedCheck.checked),
        turkishAiCorrect: Boolean(els.ocrTurkishFixCheck.checked),
        useZemberekLexicon: Boolean(els.ocrTurkishFixCheck.checked),
        enableBlurFilter: Boolean(els.ocrBlurCheck.checked),
        ignoreStaticOverlays: Boolean(els.ocrStaticOverlayCheck.checked)
      })
    });
    showOcrJob(queued);
    await pollOcrJob(queued.jobId);
  } catch (error) {
    setStatus('OCR işi başlatılamadı');
    alert(error.message);
  }
}

async function saveOcrToDb() {
  if (!state.selectedAsset) return;
  const jobId = String(els.ocrSaveBtn.dataset.jobId || '').trim();
  if (!jobId) return;

  try {
    await api(`/api/assets/${state.selectedAsset.id}/video-ocr/save`, {
      method: 'POST',
      body: JSON.stringify({ jobId })
    });
    els.ocrSaveBtn.classList.add('hidden');
    setStatus('OCR DB\'ye kaydedildi');
  } catch (error) {
    alert(error.message);
  }
}

function runOcrSearch() {
  const q = String(els.ocrSearchInput.value || '').trim();
  if (!q) {
    renderEmptyResults(els.ocrSearchResults, 'Arama metni girin.');
    return;
  }

  const queryNorm = q.toLocaleLowerCase('tr');
  const source = state.activeOcrSegments.length
    ? state.activeOcrSegments
    : [{ startSec: 0, startTc: '00:00:00.000', endTc: '00:00:00.000', text: state.activeOcrText }];

  const matches = source.filter((item) => {
    const text = String(item.text || '').toLocaleLowerCase('tr');
    return text.includes(queryNorm);
  }).slice(0, 150);

  renderOcrSearchResults(q, matches);
}

function getActiveSubtitleItem(asset) {
  const items = Array.isArray(asset?.subtitleItems) ? asset.subtitleItems : [];
  if (!items.length) return null;
  const selectedUrl = String(els.subtitleSelect.value || asset?.subtitleUrl || '').trim();
  if (selectedUrl) {
    const match = items.find((item) => String(item.subtitleUrl || '').trim() === selectedUrl);
    if (match) return match;
  }
  return items[0];
}

function getLatestOcrItem(asset) {
  const items = Array.isArray(asset?.videoOcrItems) ? asset.videoOcrItems : [];
  if (!items.length) return null;
  return items[items.length - 1];
}

async function editActiveSubtitleContent() {
  if (!state.selectedAsset) return;
  const assetId = String(state.selectedAsset.id || '').trim();
  const item = getActiveSubtitleItem(state.selectedAsset);
  const itemId = String(item?.id || '').trim();
  if (!assetId || !itemId) {
    alert('Düzenlenecek aktif altyazı kaydı bulunamadı.');
    return;
  }
  try {
    setStatus('Altyazı içeriği yükleniyor...');
    const readResult = await api(`/api/admin/subtitle-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
    const mediaUrl = String(state.selectedAsset?.proxyUrl || state.selectedAsset?.mediaUrl || '').trim();
    const nextContent = await openTextEditorModal({
      title: `Altyazı İçeriği - ${state.selectedAsset.title || state.selectedAsset.fileName || assetId}`,
      content: String(readResult?.content || ''),
      mediaUrl
    });
    if (nextContent == null) {
      setStatus('Hazır');
      return;
    }
    await api('/api/admin/subtitle-records/content', {
      method: 'PATCH',
      body: JSON.stringify({ assetId, itemId, content: nextContent })
    });
    await selectAsset(assetId);
    setStatus('Altyazı içeriği güncellendi');
  } catch (error) {
    setStatus('Altyazı içerik düzenleme hatası');
    alert(error.message || 'Altyazı içeriği güncellenemedi');
  }
}

async function editLatestOcrContent() {
  if (!state.selectedAsset) return;
  const assetId = String(state.selectedAsset.id || '').trim();
  const item = getLatestOcrItem(state.selectedAsset);
  const itemId = String(item?.id || '').trim();
  if (!assetId || !itemId) {
    alert('Düzenlenecek OCR kaydı bulunamadı. Önce OCR sonucu DB\'ye kaydedin.');
    return;
  }
  try {
    setStatus('OCR içeriği yükleniyor...');
    const readResult = await api(`/api/admin/ocr-records/content?assetId=${encodeURIComponent(assetId)}&itemId=${encodeURIComponent(itemId)}`);
    const mediaUrl = String(state.selectedAsset?.proxyUrl || state.selectedAsset?.mediaUrl || '').trim();
    const nextContent = await openTextEditorModal({
      title: `OCR İçeriği - ${state.selectedAsset.title || state.selectedAsset.fileName || assetId}`,
      content: String(readResult?.content || ''),
      mediaUrl
    });
    if (nextContent == null) {
      setStatus('Hazır');
      return;
    }
    await api('/api/admin/ocr-records/content', {
      method: 'PATCH',
      body: JSON.stringify({ assetId, itemId, content: nextContent })
    });
    await selectAsset(assetId);
    setStatus('OCR içeriği güncellendi');
  } catch (error) {
    setStatus('OCR içerik düzenleme hatası');
    alert(error.message || 'OCR içeriği güncellenemedi');
  }
}

function applySelectedSubtitle() {
  const url = String(els.subtitleSelect.value || '').trim();
  const asset = state.selectedAsset;
  if (!asset || !url) {
    applySubtitleTrack('');
    return;
  }
  const current = (asset.subtitleItems || []).find((item) => String(item.subtitleUrl || '') === url);
  applySubtitleTrack(url, current?.subtitleLang || 'tr', current?.subtitleLabel || 'subtitle');
}

function onVideoTimeUpdate() {
  els.currentTc.textContent = formatTc(els.videoPlayer.currentTime || 0);
}

function bindEvents() {
  els.assetSearchInput.addEventListener('input', renderAssetList);
  els.refreshAssetsBtn.addEventListener('click', loadAssets);
  els.ingestUploadBtn.addEventListener('click', uploadVideoIngest);
  els.subtitleUploadBtn.addEventListener('click', uploadSubtitle);
  els.subtitleGenerateBtn.addEventListener('click', generateSubtitle);
  els.subtitleSearchBtn.addEventListener('click', runSubtitleSearch);
  els.subtitleEditContentBtn?.addEventListener('click', editActiveSubtitleContent);
  els.subtitleSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSubtitleSearch();
  });
  els.applySubtitleBtn.addEventListener('click', applySelectedSubtitle);
  els.ocrExtractBtn.addEventListener('click', extractOcr);
  els.ocrSaveBtn.addEventListener('click', saveOcrToDb);
  els.ocrSearchBtn.addEventListener('click', runOcrSearch);
  els.ocrEditContentBtn?.addEventListener('click', editLatestOcrContent);
  els.ocrSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runOcrSearch();
  });
  els.videoPlayer.addEventListener('timeupdate', onVideoTimeUpdate);
  els.toolTabSubtitle?.addEventListener('click', () => setToolTab('subtitle'));
  els.toolTabOcr?.addEventListener('click', () => setToolTab('ocr'));
}

async function bootstrap() {
  try {
    const rawIds = JSON.parse(localStorage.getItem('ocrtest.sessionUploadedIds') || '[]');
    state.sessionUploadedIds = Array.isArray(rawIds) ? rawIds.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 80) : [];
  } catch (_error) {
    state.sessionUploadedIds = [];
  }
  bindEvents();
  setToolTab(localStorage.getItem('ocrtest.activeToolTab') || 'subtitle');
  renderEmptyResults(els.subtitleSearchResults, 'Arama sonucu burada görünecek.');
  renderEmptyResults(els.ocrSearchResults, 'Arama sonucu burada görünecek.');
  await loadAssets();
  if (state.assets.length) {
    const preferredId = String(localStorage.getItem('ocrtest.selectedAssetId') || '').trim();
    const exists = preferredId && state.assets.some((item) => String(item.id) === preferredId);
    await selectAsset(exists ? preferredId : state.assets[0].id);
  }
}

bootstrap();
