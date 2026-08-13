function createAssetMapperService(deps = {}) {
  const {
    resolveStoredUrl,
    sanitizeSubtitleItems,
    sanitizeVideoOcrItems,
    sanitizePhotoOcrItems,
    normalizeSubtitleLang,
    normalizeOcrEngine,
    resolveSubtitleActiveByLang,
    nanoid
  } = deps;

  function mapAssetRow(row) {
    const proxyUrl = resolveStoredUrl(row.proxy_url, 'proxies');
    const thumbnailUrl = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
    const dcMetadata = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    let subtitleItems = sanitizeSubtitleItems(dcMetadata.subtitleItems);
    let videoOcrItems = sanitizeVideoOcrItems(dcMetadata.videoOcrItems);
    let photoOcrItems = sanitizePhotoOcrItems(dcMetadata.photoOcrItems);
    if (!subtitleItems.length && String(dcMetadata.subtitleUrl || '').trim()) {
      subtitleItems = [{
        id: nanoid(),
        subtitleUrl: String(dcMetadata.subtitleUrl || '').trim(),
        subtitleLang: normalizeSubtitleLang(dcMetadata.subtitleLang),
        subtitleLabel: String(dcMetadata.subtitleLabel || '').trim() || 'subtitle',
        createdAt: row.updated_at || row.created_at || new Date().toISOString()
      }];
    }
    const subtitleActiveByLang = resolveSubtitleActiveByLang(dcMetadata, subtitleItems);
    if (!videoOcrItems.length && String(dcMetadata.videoOcrUrl || '').trim()) {
      videoOcrItems = [{
        id: nanoid(),
        ocrUrl: String(dcMetadata.videoOcrUrl || '').trim(),
        ocrLabel: String(dcMetadata.videoOcrLabel || '').trim() || 'video-ocr.txt',
        ocrEngine: normalizeOcrEngine(dcMetadata.videoOcrEngine || 'paddle'),
        lineCount: Math.max(0, Number(dcMetadata.videoOcrLineCount) || 0),
        segmentCount: Math.max(0, Number(dcMetadata.videoOcrSegmentCount) || 0),
        createdAt: row.updated_at || row.created_at || new Date().toISOString()
      }];
    }
    if (!photoOcrItems.length && String(dcMetadata.photoOcrUrl || '').trim()) {
      photoOcrItems = [{
        id: nanoid(),
        ocrUrl: String(dcMetadata.photoOcrUrl || '').trim(),
        ocrLabel: String(dcMetadata.photoOcrLabel || '').trim() || 'photo-ocr.txt',
        ocrEngine: normalizeOcrEngine(dcMetadata.photoOcrEngine || 'paddle'),
        lineCount: Math.max(0, Number(dcMetadata.photoOcrLineCount) || 0),
        segmentCount: Math.max(0, Number(dcMetadata.photoOcrSegmentCount) || 0),
        createdAt: row.updated_at || row.created_at || new Date().toISOString()
      }];
    }
    const listCuts = Array.isArray(row.cuts)
      ? row.cuts
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const label = String(item.label || '').trim();
          if (!label) return null;
          return {
            cutId: String(item.cutId || '').trim(),
            label,
            inPointSeconds: Math.max(0, Number(item.inPointSeconds || 0)),
            outPointSeconds: Math.max(0, Number(item.outPointSeconds || 0))
          };
        })
        .filter(Boolean)
      : [];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      tags: row.tags || [],
      owner: row.owner,
      durationSeconds: row.duration_seconds,
      sourcePath: row.source_path,
      mediaUrl: row.media_url,
      proxyUrl,
      proxyStatus: row.proxy_status,
      thumbnailUrl,
      fileName: row.file_name,
      mimeType: row.mime_type,
      visibility: row.visibility || 'public',
      ownerUser: row.owner_user || '',
      ownerGroups: row.owner_groups || [],
      allowedUsers: row.allowed_users || [],
      allowedGroups: row.allowed_groups || [],
      deniedUsers: row.denied_users || [],
      deniedGroups: row.denied_groups || [],
      editAllowedUsers: row.edit_allowed_users || [],
      editAllowedGroups: row.edit_allowed_groups || [],
      editDeniedUsers: row.edit_denied_users || [],
      editDeniedGroups: row.edit_denied_groups || [],
      downloadAllowedUsers: row.download_allowed_users || [],
      downloadAllowedGroups: row.download_allowed_groups || [],
      downloadDeniedUsers: row.download_denied_users || [],
      downloadDeniedGroups: row.download_denied_groups || [],
      dcMetadata,
      audioChannels: Number(dcMetadata.audioChannels) || 0,
      subtitleUrl: String(dcMetadata.subtitleUrl || '').trim(),
      subtitleLang: dcMetadata.subtitleUrl ? normalizeSubtitleLang(dcMetadata.subtitleLang) : '',
      subtitleLabel: String(dcMetadata.subtitleLabel || '').trim(),
      subtitleItems,
      subtitleActiveByLang,
      audioStreamOptions: Array.isArray(dcMetadata.audioStreamOptions) ? dcMetadata.audioStreamOptions : [],
      videoOcrUrl: String(dcMetadata.videoOcrUrl || '').trim(),
      videoOcrLabel: String(dcMetadata.videoOcrLabel || '').trim(),
      videoOcrEngine: normalizeOcrEngine(dcMetadata.videoOcrEngine || 'paddle'),
      videoOcrLineCount: Math.max(0, Number(dcMetadata.videoOcrLineCount) || 0),
      videoOcrSegmentCount: Math.max(0, Number(dcMetadata.videoOcrSegmentCount) || 0),
      videoOcrItems,
      photoOcrUrl: String(dcMetadata.photoOcrUrl || '').trim(),
      photoOcrLabel: String(dcMetadata.photoOcrLabel || '').trim(),
      photoOcrEngine: normalizeOcrEngine(dcMetadata.photoOcrEngine || 'paddle'),
      photoOcrLineCount: Math.max(0, Number(dcMetadata.photoOcrLineCount) || 0),
      photoOcrSegmentCount: Math.max(0, Number(dcMetadata.photoOcrSegmentCount) || 0),
      photoOcrItems,
      ocrSearchHit: row._ocr_search_hit || null,
      ocrSearchHits: Array.isArray(row._ocr_search_hits) ? row._ocr_search_hits : [],
      ocrSearchPage: row._ocr_search_page || null,
      subtitleSearchHit: row._subtitle_search_hit || null,
      subtitleSearchHits: Array.isArray(row._subtitle_search_hits) ? row._subtitle_search_hits : [],
      subtitleSearchPage: row._subtitle_search_page || null,
      cuts: listCuts,
      status: row.status,
      deletedAt: row.deleted_at,
      inTrash: Boolean(row.deleted_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapCutRow(row) {
    return {
      cutId: row.cut_id,
      label: row.label,
      inPointSeconds: row.in_point_seconds,
      outPointSeconds: row.out_point_seconds,
      createdAt: row.created_at
    };
  }

  return {
    mapAssetRow,
    mapCutRow
  };
}

module.exports = {
  createAssetMapperService
};
