const fs = require('fs');
const path = require('path');

function registerTextProcessingRoutes(app, deps) {
  const {
    pool,
    requireAssetDelete,
    isVideoCandidate,
    sanitizeFileName,
    convertSrtToVtt,
    normalizeVttContent,
    buildArtifactPath,
    saveAssetSubtitleMetadata,
    normalizeSubtitleLang,
    mapAssetRow,
    WHISPER_MODEL,
    normalizeSubtitleBackend,
    queueSubtitleGenerationJob,
    subtitleJobs,
    getMediaProcessingJobById,
    mapSubtitleJobFromDbRow,
    queueVideoOcrJob,
    videoOcrJobs,
    getLatestVideoOcrJobForAsset,
    getLatestMediaProcessingJobForAsset,
    sanitizeVideoOcrItems,
    saveAssetVideoOcrMetadata,
    publicUploadUrlToAbsolutePath,
    safeRmDir,
    SUBTITLES_DIR,
    syncSubtitleCueIndexForAssetRow,
    searchSubtitleMatchesForAssetRow,
    searchOcrMatchesForAssetRow,
    ensureSubtitleCueIndexForAssetRow,
    parseSubtitleTextSearchQuery,
    buildSubtitleCueSearchWhereSql,
    formatTimecode,
    normalizeOcrPreset,
    normalizeOcrEngine,
    nanoid
  } = deps;

  function paginateMatches(matches, offset, limit) {
    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 30));
    const list = Array.isArray(matches) ? matches : [];
    const visible = list.slice(safeOffset, safeOffset + safeLimit);
    return {
      visible,
      page: {
        offset: safeOffset,
        limit: safeLimit,
        count: visible.length,
        hasPrev: safeOffset > 0,
        hasNext: list.length > safeOffset + safeLimit,
        prevOffset: Math.max(0, safeOffset - safeLimit),
        nextOffset: safeOffset + safeLimit
      }
    };
  }

  app.post('/api/assets/:id/subtitles', async (req, res) => {
    try {
      const { fileName, fileData, lang } = req.body || {};
      if (!fileName || !fileData) {
        return res.status(400).json({ error: 'fileName and fileData are required' });
      }
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
  
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
      }
  
      const safeName = sanitizeFileName(fileName);
      const ext = path.extname(safeName).toLowerCase();
      if (ext !== '.vtt' && ext !== '.srt') {
        return res.status(400).json({ error: 'Only .vtt or .srt subtitle files are supported' });
      }
  
      let rawText = '';
      try {
        rawText = Buffer.from(String(fileData), 'base64').toString('utf8');
      } catch (_error) {
        return res.status(400).json({ error: 'Could not decode subtitle file' });
      }
  
      const subtitleVtt = ext === '.srt' ? convertSrtToVtt(rawText) : normalizeVttContent(rawText);
      const base = path.basename(safeName, ext) || 'subtitle';
      const storedName = `${Date.now()}-${nanoid()}-${sanitizeFileName(base)}.vtt`;
      const subtitleOut = buildArtifactPath('subtitles', storedName, row.created_at);
      fs.writeFileSync(subtitleOut.absolutePath, subtitleVtt, 'utf8');
  
      const subtitleUrl = subtitleOut.publicUrl;
      const updatedRow = await saveAssetSubtitleMetadata(
        req.params.id,
        row,
        subtitleUrl,
        normalizeSubtitleLang(lang),
        safeName
      );
      return res.json({
        subtitleUrl,
        subtitleLang: normalizeSubtitleLang(lang),
        subtitleLabel: safeName,
        asset: mapAssetRow(updatedRow)
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to upload subtitle' });
    }
  });
  
  app.post('/api/assets/:id/subtitles/generate', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
  
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
      }
  
      const subtitleLang = normalizeSubtitleLang(req.body?.lang);
      const subtitleLabel = String(req.body?.label || 'auto-whisper').trim() || 'auto-whisper';
      const model = String(req.body?.model || WHISPER_MODEL || 'small').trim() || 'small';
      const audioStreamIndex = Number.isFinite(Number(req.body?.audioStreamIndex)) ? Number(req.body.audioStreamIndex) : null;
      const audioChannelIndex = Number.isFinite(Number(req.body?.audioChannelIndex)) ? Number(req.body.audioChannelIndex) : null;
      const turkishAiCorrect = req.body?.turkishAiCorrect;
      const useZemberekLexicon = req.body?.useZemberekLexicon;
      const subtitleBackend = normalizeSubtitleBackend(
        req.body?.subtitleBackend || (req.body?.useWhisperX ? 'whisperx' : 'whisper')
      );
      const job = queueSubtitleGenerationJob(row, {
        lang: subtitleLang,
        label: subtitleLabel,
        model,
        audioStreamIndex,
        audioChannelIndex,
        turkishAiCorrect,
        useZemberekLexicon,
        subtitleBackend
      });
      return res.status(202).json({
        jobId: job.jobId,
        status: job.status,
        subtitleLang,
        subtitleLabel,
        model,
        audioStreamIndex,
        audioChannelIndex,
        turkishAiCorrect: job.turkishAiCorrect,
        useZemberekLexicon: Boolean(job.useZemberekLexicon),
        subtitleBackend: normalizeSubtitleBackend(job.subtitleBackend || job.subtitleBackendRequested),
        warning: String(job.warning || '')
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to generate subtitle' });
    }
  });
  
  app.get('/api/subtitle-jobs/:jobId', async (req, res) => {
    const job = subtitleJobs.get(String(req.params.jobId || '').trim());
    if (job) {
      return res.json({
        jobId: job.jobId,
        assetId: job.assetId,
        status: job.status,
        subtitleUrl: job.subtitleUrl || '',
        subtitleLang: job.subtitleLang || '',
        subtitleLabel: job.subtitleLabel || '',
        model: job.model || '',
        turkishAiCorrect: Boolean(job.turkishAiCorrect),
        useZemberekLexicon: Boolean(job.useZemberekLexicon),
        subtitleBackend: normalizeSubtitleBackend(job.subtitleBackend || job.subtitleBackendRequested),
        warning: String(job.warning || ''),
        asset: job.asset || null,
        error: job.error || '',
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt || ''
      });
    }
    try {
      const persisted = await getMediaProcessingJobById(req.params.jobId, 'subtitle');
      if (!persisted) return res.status(404).json({ error: 'Subtitle job not found' });
      return res.json(mapSubtitleJobFromDbRow(persisted));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load subtitle job' });
    }
  });
  
  app.post('/api/assets/:id/video-ocr/extract', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'OCR extraction is supported only for video assets' });
      }
  
      const job = queueVideoOcrJob(row, {
        intervalSec: req.body?.intervalSec,
        ocrLang: req.body?.ocrLang,
        ocrPreset: req.body?.ocrPreset,
        ocrLabel: req.body?.ocrLabel,
        ocrEngine: req.body?.ocrEngine,
        advancedMode: req.body?.advancedMode,
        turkishAiCorrect: req.body?.turkishAiCorrect,
        useZemberekLexicon: req.body?.useZemberekLexicon,
        preprocessProfile: req.body?.preprocessProfile,
        enableBlurFilter: req.body?.enableBlurFilter,
        blurThreshold: req.body?.blurThreshold,
        enableRegionMode: req.body?.enableRegionMode,
        tickerHeightPct: req.body?.tickerHeightPct,
        ignoreStaticOverlays: req.body?.ignoreStaticOverlays,
        ignorePhrases: req.body?.ignorePhrases,
        minDisplaySec: req.body?.minDisplaySec,
        mergeGapSec: req.body?.mergeGapSec,
        enableSceneSampling: req.body?.enableSceneSampling,
        sceneThreshold: req.body?.sceneThreshold,
        maxSceneFrames: req.body?.maxSceneFrames,
        sceneMinGapSec: req.body?.sceneMinGapSec
      });
      return res.status(202).json({
        jobId: job.jobId,
        status: job.status,
        intervalSec: job.intervalSec,
        ocrLang: job.ocrLang,
        ocrPreset: job.ocrPreset,
        ocrLabel: job.ocrLabel,
        ocrEngine: job.ocrEngine,
        mode: job.mode,
        advancedMode: job.advancedMode,
        turkishAiCorrect: job.turkishAiCorrect,
        useZemberekLexicon: Boolean(job.useZemberekLexicon),
        preprocessProfile: job.preprocessProfile,
        enableBlurFilter: job.enableBlurFilter,
        blurThreshold: job.blurThreshold,
        enableRegionMode: job.enableRegionMode,
        tickerHeightPct: job.tickerHeightPct,
        ignoreStaticOverlays: job.ignoreStaticOverlays,
        ignorePhrases: job.ignorePhrases,
        minDisplaySec: job.minDisplaySec,
        mergeGapSec: job.mergeGapSec,
        enableSceneSampling: job.enableSceneSampling,
        sceneThreshold: job.sceneThreshold,
        maxSceneFrames: job.maxSceneFrames,
        sceneMinGapSec: job.sceneMinGapSec
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to queue video OCR extraction' });
    }
  });
  
  app.get('/api/video-ocr-jobs/:jobId', async (req, res) => {
    const job = videoOcrJobs.get(String(req.params.jobId || '').trim());
    if (job) {
      return res.json({
        jobId: job.jobId,
        assetId: job.assetId,
        status: job.status,
        intervalSec: job.intervalSec,
        ocrLang: job.ocrLang,
        ocrPreset: job.ocrPreset,
        ocrEngine: job.ocrEngine,
        requestedEngine: job.requestedEngine,
        resultUrl: job.resultUrl || '',
        downloadUrl: job.resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(job.jobId)}/download` : '',
        resultLabel: job.resultLabel || '',
        lineCount: Number(job.lineCount || 0),
        segmentCount: Number(job.segmentCount || 0),
        mode: String(job.mode || 'basic'),
        advancedMode: Boolean(job.advancedMode),
        turkishAiCorrect: Boolean(job.turkishAiCorrect),
        useZemberekLexicon: Boolean(job.useZemberekLexicon),
        preprocessProfile: String(job.preprocessProfile || 'light'),
        enableBlurFilter: Boolean(job.enableBlurFilter),
        blurThreshold: Number(job.blurThreshold || 0),
        enableRegionMode: Boolean(job.enableRegionMode),
        tickerHeightPct: Number(job.tickerHeightPct || 0),
        ignoreStaticOverlays: Boolean(job.ignoreStaticOverlays),
        ignorePhrases: String(job.ignorePhrases || ''),
        detectedStaticPhrases: Array.isArray(job.detectedStaticPhrases) ? job.detectedStaticPhrases : [],
        skippedBlur: Number(job.skippedBlur || 0),
        sceneFrameCount: Number(job.sceneFrameCount || 0),
        droppedSceneFrames: Number(job.droppedSceneFrames || 0),
        patchedPeriodicFrames: Number(job.patchedPeriodicFrames || 0),
        keptSceneFrames: Number(job.keptSceneFrames || 0),
        minDisplaySec: Number(job.minDisplaySec || 0),
        mergeGapSec: Number(job.mergeGapSec || 0),
        enableSceneSampling: Boolean(job.enableSceneSampling),
        sceneThreshold: Number(job.sceneThreshold || 0),
        maxSceneFrames: Number(job.maxSceneFrames || 0),
        sceneMinGapSec: Number(job.sceneMinGapSec || 0),
        warning: job.warning || '',
        error: job.error || '',
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt || ''
      });
    }
    try {
      const persisted = await getMediaProcessingJobById(req.params.jobId, 'video_ocr');
      if (!persisted) return res.status(404).json({ error: 'Video OCR job not found' });
      return res.json(mapVideoOcrJobFromDbRow(persisted));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load video OCR job' });
    }
  });
  
  app.get('/api/assets/:id/video-ocr/latest', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
      const latest = getLatestVideoOcrJobForAsset(assetId);
      if (latest) {
        return res.json({
          source: 'memory',
          jobId: latest.jobId,
          assetId: latest.assetId,
          status: latest.status,
          intervalSec: latest.intervalSec,
          ocrLang: latest.ocrLang,
          ocrPreset: latest.ocrPreset,
          ocrEngine: latest.ocrEngine,
          requestedEngine: latest.requestedEngine,
          resultUrl: latest.resultUrl || '',
          downloadUrl: latest.resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(latest.jobId)}/download` : '',
          resultLabel: latest.resultLabel || '',
          lineCount: Number(latest.lineCount || 0),
          segmentCount: Number(latest.segmentCount || 0),
          mode: String(latest.mode || 'basic'),
          advancedMode: Boolean(latest.advancedMode),
          turkishAiCorrect: Boolean(latest.turkishAiCorrect),
          useZemberekLexicon: Boolean(latest.useZemberekLexicon),
          preprocessProfile: String(latest.preprocessProfile || 'light'),
          enableBlurFilter: Boolean(latest.enableBlurFilter),
          blurThreshold: Number(latest.blurThreshold || 0),
          enableRegionMode: Boolean(latest.enableRegionMode),
          tickerHeightPct: Number(latest.tickerHeightPct || 0),
          ignoreStaticOverlays: Boolean(latest.ignoreStaticOverlays),
          ignorePhrases: String(latest.ignorePhrases || ''),
          skippedBlur: Number(latest.skippedBlur || 0),
          sceneFrameCount: Number(latest.sceneFrameCount || 0),
          droppedSceneFrames: Number(latest.droppedSceneFrames || 0),
          patchedPeriodicFrames: Number(latest.patchedPeriodicFrames || 0),
          keptSceneFrames: Number(latest.keptSceneFrames || 0),
          minDisplaySec: Number(latest.minDisplaySec || 0),
          mergeGapSec: Number(latest.mergeGapSec || 0),
          enableSceneSampling: Boolean(latest.enableSceneSampling),
          sceneThreshold: Number(latest.sceneThreshold || 0),
          maxSceneFrames: Number(latest.maxSceneFrames || 0),
          sceneMinGapSec: Number(latest.sceneMinGapSec || 0),
          warning: latest.warning || '',
          error: latest.error || '',
          startedAt: latest.startedAt,
          updatedAt: latest.updatedAt,
          finishedAt: latest.finishedAt || ''
        });
      }
  
      const persistedLatest = await getLatestMediaProcessingJobForAsset(assetId, 'video_ocr');
      if (persistedLatest) {
        const mapped = mapVideoOcrJobFromDbRow(persistedLatest);
        return res.json({
          source: 'db_job',
          ...mapped
        });
      }
  
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
      const row = assetResult.rows[0];
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const items = sanitizeVideoOcrItems(dc.videoOcrItems);
      if (!items.length) return res.status(404).json({ error: 'Video OCR job not found' });
      const last = items[items.length - 1];
      return res.json({
        source: 'db',
        jobId: '',
        assetId,
        status: 'completed',
        ocrEngine: last.ocrEngine,
        resultUrl: last.ocrUrl,
        downloadUrl: '',
        resultLabel: last.ocrLabel,
        lineCount: Number(last.lineCount || 0),
        segmentCount: Number(last.segmentCount || 0),
        mode: '',
        warning: '',
        error: '',
        startedAt: '',
        updatedAt: String(last.createdAt || ''),
        finishedAt: String(last.createdAt || ''),
        saved: true
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load latest OCR job' });
    }
  });

  app.get('/api/assets/:id/video-ocr/search', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const query = String(req.query.q || '').trim();
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 30));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
      if (!query) return res.status(400).json({ error: 'q is required' });

      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'OCR search is supported only for video assets' });
      }

      const search = await searchOcrMatchesForAssetRow(row, query, offset + limit + 1);
      const allMatches = Array.isArray(search.matches) ? search.matches : [];
      const { visible, page } = paginateMatches(allMatches, offset, limit);
      return res.json({
        query,
        ocrUrl: search.ocrUrl || '',
        matches: visible,
        page: { ...page, query: String(search.highlightQuery || query).trim() || query },
        didYouMean: String(search.didYouMean || '').trim(),
        fuzzyUsed: Boolean(search.fuzzyUsed),
        highlightQuery: String(search.highlightQuery || query).trim() || query
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to search OCR matches' });
    }
  });
  
  app.post('/api/assets/:id/video-ocr/save', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'OCR save is supported only for video assets' });
      }
      const requestedJobId = String(req.body?.jobId || '').trim();
      let job = requestedJobId ? videoOcrJobs.get(requestedJobId) : getLatestVideoOcrJobForAsset(assetId);
      if (!job) {
        const persisted = requestedJobId
          ? await getMediaProcessingJobById(requestedJobId, 'video_ocr')
          : await getLatestMediaProcessingJobForAsset(assetId, 'video_ocr');
        if (persisted && String(persisted.asset_id || '') === assetId) {
          const mapped = mapVideoOcrJobFromDbRow(persisted);
          job = {
            jobId: mapped.jobId,
            assetId: mapped.assetId,
            status: mapped.status,
            resultUrl: mapped.resultUrl,
            resultLabel: mapped.resultLabel,
            lineCount: mapped.lineCount,
            segmentCount: mapped.segmentCount,
            ocrEngine: mapped.ocrEngine,
            requestedEngine: mapped.requestedEngine,
            ocrLang: mapped.ocrLang
          };
        }
      }
      if (!job || String(job.assetId || '') !== assetId) {
        return res.status(404).json({ error: 'Video OCR job not found for this asset' });
      }
      if (String(job.status || '') !== 'completed') {
        return res.status(409).json({ error: 'OCR job is not completed yet' });
      }
      if (!String(job.resultUrl || '').trim()) {
        return res.status(409).json({ error: 'OCR output file is not ready yet' });
      }
  
      const saved = await saveAssetVideoOcrMetadata(assetId, row, job);
      return res.json({
        ok: true,
        savedItem: saved.item,
        asset: mapAssetRow(saved.row)
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to save OCR result to database' });
    }
  });
  
  app.get('/api/video-ocr-jobs/:jobId/download', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim();
    const inMemory = videoOcrJobs.get(jobId);
    const serve = (jobLike) => {
      if (String(jobLike.status || '') !== 'completed') {
        return res.status(409).json({ error: 'OCR file is not ready yet' });
      }
      const filePath = String(jobLike.resultPath || '').trim() || publicUploadUrlToAbsolutePath(jobLike.resultUrl);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'OCR file not found' });
      }
      const fileName = String(jobLike.resultLabel || path.basename(filePath) || 'video-ocr.txt').trim() || 'video-ocr.txt';
      return res.download(filePath, fileName, (error) => {
        if (error) return;
        if (inMemory) {
          safeRmDir(inMemory.frameDir);
          inMemory.frameDir = '';
          inMemory.updatedAt = new Date().toISOString();
        }
      });
    };
    if (inMemory) return serve(inMemory);
    try {
      const row = await getMediaProcessingJobById(jobId, 'video_ocr');
      if (!row) return res.status(404).json({ error: 'Video OCR job not found' });
      const mapped = mapVideoOcrJobFromDbRow(row);
      return serve({
        status: mapped.status,
        resultUrl: mapped.resultUrl,
        resultPath: '',
        resultLabel: mapped.resultLabel
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load OCR job download info' });
    }
  });
  
  app.patch('/api/assets/:id/subtitles', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
      }
  
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const items = sanitizeSubtitleItems(dc.subtitleItems);
      const requestedUrl = String(req.body?.subtitleUrl || '').trim();
      const subtitleUrl = requestedUrl || String(dc.subtitleUrl || '').trim();
      if (!subtitleUrl) return res.status(400).json({ error: 'No subtitle found for this asset' });
      const exists = items.some((item) => item.subtitleUrl === subtitleUrl);
      if (!exists) return res.status(400).json({ error: 'Subtitle item not found' });
  
      const subtitleLang = normalizeSubtitleLang(req.body?.lang || dc.subtitleLang || 'tr');
      const subtitleLabel = String(req.body?.label || dc.subtitleLabel || '').trim() || 'subtitle';
      const updatedItems = items.map((item) => {
        if (item.subtitleUrl !== subtitleUrl) return item;
        return {
          ...item,
          subtitleLang,
          subtitleLabel
        };
      });
      const updatedDc = {
        ...dc,
        subtitleUrl,
        subtitleLang,
        subtitleLabel,
        subtitleItems: updatedItems
      };
      const updatedResult = await pool.query(
        `
          UPDATE assets
          SET dc_metadata = $2::jsonb,
              updated_at = $3
          WHERE id = $1
          RETURNING *
        `,
        [req.params.id, JSON.stringify(updatedDc), new Date().toISOString()]
      );
      const updatedRow = updatedResult.rows[0];
      try {
        await syncSubtitleCueIndexForAssetRow(updatedRow);
      } catch (_error) {}
      return res.json({
        subtitleUrl,
        subtitleLang,
        subtitleLabel,
        asset: mapAssetRow(updatedRow)
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to update subtitle metadata' });
    }
  });
  
  app.delete('/api/assets/:id/subtitles', requireAssetDelete, async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
      }
  
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subtitleUrl = String(req.body?.subtitleUrl || '').trim();
      if (!subtitleUrl) return res.status(400).json({ error: 'subtitleUrl is required' });
  
      const items = sanitizeSubtitleItems(dc.subtitleItems);
      const exists = items.some((item) => item.subtitleUrl === subtitleUrl);
      if (!exists) return res.status(404).json({ error: 'Subtitle item not found' });
  
      const nextItems = items.filter((item) => item.subtitleUrl !== subtitleUrl);
      let nextActive = String(dc.subtitleUrl || '').trim();
      if (nextActive === subtitleUrl) {
        nextActive = nextItems.length ? nextItems[nextItems.length - 1].subtitleUrl : '';
      }
      const activeItem = nextItems.find((item) => item.subtitleUrl === nextActive);
      const nextLang = activeItem ? normalizeSubtitleLang(activeItem.subtitleLang) : '';
      const nextLabel = activeItem ? String(activeItem.subtitleLabel || '').trim() : '';
  
      const updatedDc = {
        ...dc,
        subtitleUrl: nextActive,
        subtitleLang: nextLang,
        subtitleLabel: nextLabel,
        subtitleItems: nextItems
      };
      const updatedResult = await pool.query(
        `
          UPDATE assets
          SET dc_metadata = $2::jsonb,
              updated_at = $3
          WHERE id = $1
          RETURNING *
        `,
        [req.params.id, JSON.stringify(updatedDc), new Date().toISOString()]
      );
      try {
        await syncSubtitleCueIndexForAssetRow(updatedResult.rows[0]);
      } catch (_error) {}
  
      const filePath = publicUploadUrlToAbsolutePath(subtitleUrl);
      if (filePath && filePath.startsWith(SUBTITLES_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_error) {}
      }
  
      return res.json({
        removed: subtitleUrl,
        subtitleCuesCleared: !nextActive,
        asset: mapAssetRow(updatedResult.rows[0])
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to remove subtitle' });
    }
  });
  
  app.get('/api/assets/:id/subtitles/search', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const query = String(req.query.q || '').trim();
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 30));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
      if (!query) return res.status(400).json({ error: 'q is required' });
      if (query.length < 1) return res.json({ query, total: 0, matches: [], didYouMean: '', fuzzyUsed: false });
  
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
      const row = assetResult.rows[0];
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Subtitle search is supported only for video assets' });
      }
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subtitleUrl = String(dc.subtitleUrl || '').trim();
      if (!subtitleUrl) return res.status(400).json({ error: 'No active subtitle for this asset' });
  
      const subtitleSearch = await searchSubtitleMatchesForAssetRow(row, query, offset + limit + 1);
      const matches = Array.isArray(subtitleSearch.matches) ? subtitleSearch.matches : [];
      const paged = paginateMatches(matches, offset, limit);
      return res.json({
        query,
        total: matches.length,
        subtitleUrl: subtitleSearch.subtitleUrl || subtitleUrl,
        matches: paged.visible,
        page: {
          ...paged.page,
          query: String(subtitleSearch.highlightQuery || query).trim() || query
        },
        didYouMean: String(subtitleSearch.didYouMean || '').trim(),
        fuzzyUsed: Boolean(subtitleSearch.fuzzyUsed),
        highlightQuery: String(subtitleSearch.highlightQuery || query).trim() || query
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to search subtitles' });
    }
  });
  
  app.get('/api/assets/:id/subtitles/suggest', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const query = String(req.query.q || '').trim();
      const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));
      if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
      if (query.length < 2) return res.json([]);
  
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
      const row = assetResult.rows[0];
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subtitleUrl = String(dc.subtitleUrl || '').trim();
      if (!subtitleUrl) return res.json([]);
  
      await ensureSubtitleCueIndexForAssetRow(row);
      const parsedQuery = parseSubtitleTextSearchQuery(query);
      if (!parsedQuery.raw) return res.json([]);
      const subtitleWhere = buildSubtitleCueSearchWhereSql({
        normColumn: 'norm_text',
        startIndex: 3,
        parsedQuery
      });
      const result = await pool.query(
        `
          SELECT seq, start_sec, end_sec, cue_text
          FROM asset_subtitle_cues
          WHERE asset_id = $1
            AND subtitle_url = $2
            ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
          ORDER BY start_sec ASC
          LIMIT $${subtitleWhere.nextIndex}
        `,
        [assetId, subtitleUrl, ...subtitleWhere.params, limit]
      );
      return res.json(result.rows.map((item) => ({
        seq: Number(item.seq || 0),
        startSec: Number(item.start_sec || 0),
        endSec: Number(item.end_sec || 0),
        startTc: formatTimecode(Number(item.start_sec || 0)),
        text: String(item.cue_text || '')
      })));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to suggest subtitle matches' });
    }
  });
}

module.exports = {
  registerTextProcessingRoutes
};
