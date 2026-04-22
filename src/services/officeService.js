const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createOfficeService(deps) {
  const {
    pool,
    onlyofficePublicUrl,
    onlyofficeInternalUrl,
    appInternalUrl,
    configVersion,
    getFileExtension,
    inferMimeTypeFromFileName,
    isOfficeDocumentCandidate,
    publicUploadUrlToAbsolutePath,
    getIngestStoragePath,
    sanitizeFileName,
    runCommandCapture,
    computeBufferSha256,
    getAssetStoredFileHash,
    indexAssetToElastic,
    sanitizeOnlyOfficeUserId
  } = deps;

  function getOnlyOfficeDocumentType({ mimeType, fileName }) {
    const ext = getFileExtension(fileName);
    if (['xls', 'xlsx', 'ods'].includes(ext)) return 'cell';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slide';
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('sheet') || mime.includes('excel')) return 'cell';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slide';
    return 'word';
  }

  async function normalizeDocxForOnlyOfficeEdit(filePath) {
    if (!filePath || getFileExtension(filePath) !== 'docx' || !fs.existsSync(filePath)) {
      return { changed: false, reason: 'not-docx' };
    }

    const settings = await runCommandCapture('unzip', ['-p', filePath, 'word/settings.xml']);
    const settingsXml = String(settings.stdout || '');
    if (!settings.ok || !settingsXml.includes('documentProtection')) {
      return { changed: false, reason: 'no-protection' };
    }

    const protectionTags = settingsXml.match(/<w:documentProtection\b[^>]*(?:\/>|>[\s\S]*?<\/w:documentProtection>)/g) || [];
    if (!protectionTags.length) return { changed: false, reason: 'no-protection-tag' };

    const hasEnforcedProtection = protectionTags.some((tag) => /\bw:enforcement\s*=\s*["'](?:1|true)["']/i.test(tag));
    if (hasEnforcedProtection) {
      return { changed: false, reason: 'enforced-protection' };
    }

    const script = [
      'import os, re, shutil, sys, tempfile, zipfile',
      'path = sys.argv[1]',
      'original_stat = os.stat(path)',
      'with zipfile.ZipFile(path, "r") as zin:',
      '    xml = zin.read("word/settings.xml").decode("utf-8")',
      '    new_xml = re.sub(r"<w:documentProtection\\b[^>]*(?:/>|>[\\s\\S]*?</w:documentProtection>)", "", xml)',
      '    if new_xml == xml:',
      '        sys.exit(2)',
      '    fd, tmp = tempfile.mkstemp(prefix=".office-unlocked-", suffix=".docx", dir=os.path.dirname(path) or ".")',
      '    os.close(fd)',
      '    try:',
      '        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:',
      '            for info in zin.infolist():',
      '                data = zin.read(info.filename)',
      '                if info.filename == "word/settings.xml":',
      '                    data = new_xml.encode("utf-8")',
      '                zout.writestr(info, data)',
      '        backup = path + ".office-protection.bak"',
      '        if not os.path.exists(backup):',
      '            shutil.copy2(path, backup)',
      '        os.chmod(tmp, original_stat.st_mode)',
      '        os.replace(tmp, path)',
      '    finally:',
      '        if os.path.exists(tmp):',
      '            os.unlink(tmp)'
    ].join('\n');

    const result = await runCommandCapture('python3', ['-c', script, filePath]);
    if (!result.ok) {
      return { changed: false, reason: 'normalize-failed', error: String(result.stderr || result.stdout || '').slice(0, 500) };
    }
    return { changed: true, reason: 'removed-unenforced-document-protection' };
  }

  function resolveOnlyofficeDownloadUrl(rawUrl) {
    const input = String(rawUrl || '').trim();
    if (!input) return '';
    try {
      const parsed = new URL(input);
      const publicBase = new URL(onlyofficePublicUrl);
      const internalBase = new URL(onlyofficeInternalUrl);
      if (parsed.host === publicBase.host) {
        parsed.protocol = internalBase.protocol;
        parsed.hostname = internalBase.hostname;
        parsed.port = internalBase.port;
        return parsed.toString();
      }
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.protocol = internalBase.protocol;
        parsed.hostname = internalBase.hostname;
        parsed.port = internalBase.port;
        return parsed.toString();
      }
      return parsed.toString();
    } catch (_error) {
      return input;
    }
  }

  async function downloadOnlyofficeEditedBuffer(rawUrl) {
    const candidates = Array.from(new Set([
      resolveOnlyofficeDownloadUrl(rawUrl),
      String(rawUrl || '').trim()
    ].filter(Boolean)));
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate);
          if (!response.ok) {
            lastError = new Error(`ONLYOFFICE download failed with ${response.status} for ${candidate}`);
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          if (!buffer.length) {
            lastError = new Error(`ONLYOFFICE download returned an empty file for ${candidate}`);
            continue;
          }
          return buffer;
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw lastError || new Error('Failed to download edited Office document');
  }

  function getOnlyofficeCallbackActor(body, fallback = 'onlyoffice') {
    const actionUser = Array.isArray(body?.actions)
      ? String(body.actions.find((item) => item && item.userid)?.userid || '').trim()
      : '';
    const user = Array.isArray(body?.users) ? String(body.users[0] || '').trim() : '';
    return actionUser || user || String(fallback || 'onlyoffice').trim() || 'onlyoffice';
  }

  async function buildOnlyOfficeConfig({ row, effective, lang }) {
    if (!row) throw createHttpError(404, 'Asset not found');
    if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      throw createHttpError(400, 'Asset is not an Office document');
    }

    const fileType = getFileExtension(row.file_name) || 'docx';
    const documentType = getOnlyOfficeDocumentType({ mimeType: row.mime_type, fileName: row.file_name });
    const publicTitle = String(row.title || row.file_name || row.id || 'Document').trim() || 'Document';
    const mediaUrl = String(row.media_url || '').trim();
    if (!mediaUrl.startsWith('/uploads/')) {
      throw createHttpError(400, 'Document URL is invalid');
    }

    const canEditOffice = Boolean(effective?.canEditOffice);
    let officeFileRevision = '';
    if (canEditOffice && fileType === 'docx') {
      const mediaPath = publicUploadUrlToAbsolutePath(mediaUrl);
      const normalized = await normalizeDocxForOnlyOfficeEdit(mediaPath);
      if (normalized.changed || normalized.reason === 'enforced-protection') {
        console.log(JSON.stringify({
          event: 'onlyoffice-docx-normalize',
          assetId: String(row.id || '').trim(),
          changed: Boolean(normalized.changed),
          reason: normalized.reason
        }));
      }
      try {
        const stat = fs.statSync(mediaPath);
        officeFileRevision = String(Math.round(stat.mtimeMs || 0));
      } catch (_error) {
        officeFileRevision = '';
      }
    }

    const documentUrl = `${appInternalUrl}${mediaUrl}`;
    const callbackUrl = `${appInternalUrl}/api/assets/${encodeURIComponent(String(row.id || '').trim())}/office-callback`;
    const officeKeySeed = [
      String(row.id || '').trim(),
      String(row.updated_at || row.created_at || '').trim(),
      String(row.media_url || '').trim(),
      officeFileRevision,
      canEditOffice ? 'edit' : 'view',
      configVersion
    ].join('|');
    const officeDocumentKey = crypto.createHash('sha1').update(officeKeySeed).digest('hex');
    const editorUserId = sanitizeOnlyOfficeUserId(effective?.username || effective?.email || row.owner || 'mam-user');
    const editorUserName = String(effective?.displayName || effective?.username || row.owner || 'MAM User').trim() || 'MAM User';
    console.log(JSON.stringify({
      event: 'onlyoffice-config',
      assetId: String(row.id || '').trim(),
      username: String(effective?.username || '').trim(),
      email: String(effective?.email || '').trim(),
      canEditOffice,
      mode: canEditOffice ? 'edit' : 'view',
      userId: editorUserId
    }));

    const documentPermissions = {
      copy: true,
      download: true,
      edit: canEditOffice,
      print: true
    };
    const config = {
      document: {
        fileType,
        key: officeDocumentKey,
        title: publicTitle,
        url: documentUrl,
        permissions: documentPermissions
      },
      documentType,
      editorConfig: {
        mode: canEditOffice ? 'edit' : 'view',
        lang: String(lang || 'tr').trim().toLowerCase().startsWith('tr') ? 'tr' : 'en',
        callbackUrl,
        customization: {
          forcesave: canEditOffice
        },
        user: {
          id: editorUserId,
          name: editorUserName
        }
      }
    };
    if (!canEditOffice) {
      config.editorConfig.customization = {
        ...config.editorConfig.customization,
        compactHeader: true,
        compactToolbar: true,
        help: false,
        hideRightMenu: true,
        hideRulers: true
      };
    }
    return {
      onlyofficeUrl: onlyofficePublicUrl,
      config
    };
  }

  async function saveOnlyofficeCallbackVersion(assetId, body) {
    const callbackStatus = Number(body?.status || 0);
    if (![2, 6].includes(callbackStatus)) {
      return { saved: false, ignored: true, status: callbackStatus };
    }
    const downloadUrl = String(body?.url || '').trim();
    if (!downloadUrl) {
      return { saved: false, error: 'missing-url', status: callbackStatus };
    }

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = assetResult.rows[0];
    if (!row) return { saved: false, error: 'asset-not-found', status: callbackStatus };
    if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return { saved: false, error: 'not-office', status: callbackStatus };
    }

    const editedBuffer = await downloadOnlyofficeEditedBuffer(downloadUrl);
    const editedHash = computeBufferSha256(editedBuffer);
    const currentHash = await getAssetStoredFileHash(row, { persist: true });
    if (editedHash && currentHash && editedHash === currentHash) {
      return { saved: false, unchanged: true, status: callbackStatus };
    }

    const ext = getFileExtension(row.file_name) || 'docx';
    const safeBase = sanitizeFileName(
      path.basename(String(row.file_name || row.id || 'office-document'), path.extname(String(row.file_name || '')))
    ).slice(0, 80) || `asset-${assetId}`;
    const nextFileName = `${safeBase}-edited.${ext}`;
    const nextMimeType = String(row.mime_type || '').trim() || inferMimeTypeFromFileName(nextFileName);
    const storage = getIngestStoragePath({ type: 'document', mimeType: nextMimeType, fileName: nextFileName });
    const storedName = `${Date.now()}-${nanoid()}-${nextFileName}`;
    const absPath = path.join(storage.absoluteDir, storedName);
    const relativePath = path.join(storage.relativeDir, storedName);
    const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
    fs.writeFileSync(absPath, editedBuffer);

    const nowIso = new Date().toISOString();
    const actor = getOnlyofficeCallbackActor(body, row.owner || 'onlyoffice');
    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const version = {
      versionId: nanoid(),
      label: `Office Edit ${nextVersion}`,
      note: `Saved from ONLYOFFICE by ${actor}`,
      snapshot: {
        snapshotMediaUrl: mediaUrl,
        snapshotSourcePath: absPath,
        snapshotFileName: nextFileName,
        snapshotMimeType: nextMimeType,
        snapshotThumbnailUrl: ''
      },
      actorUsername: actor,
      actionType: 'office_save',
      createdAt: nowIso
    };

    await pool.query('BEGIN');
    try {
      const originalExists = await pool.query(
        `SELECT 1 FROM asset_versions WHERE asset_id = $1 AND action_type = 'office_original' LIMIT 1`,
        [assetId]
      );
      if (!originalExists.rowCount) {
        await pool.query(
          `
            INSERT INTO asset_versions (
              version_id, asset_id, label, note,
              snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
              actor_username, action_type, restored_from_version_id,
              created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `,
          [
            nanoid(),
            assetId,
            'Office Original',
            'Hidden original snapshot before first Office edit',
            String(row.media_url || '').trim(),
            String(row.source_path || '').trim() || publicUploadUrlToAbsolutePath(row.media_url),
            String(row.file_name || '').trim(),
            String(row.mime_type || '').trim() || inferMimeTypeFromFileName(row.file_name),
            String(row.thumbnail_url || '').trim(),
            actor,
            'office_original',
            null,
            nowIso
          ]
        );
      }

      await pool.query(
        `
          INSERT INTO asset_versions (
            version_id, asset_id, label, note,
            snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
            actor_username, action_type, restored_from_version_id,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          version.versionId, assetId, version.label, version.note,
          version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
          version.actorUsername, version.actionType, null,
          version.createdAt
        ]
      );
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = '',
              file_hash = $6,
              updated_at = $7
          WHERE id = $1
        `,
        [assetId, mediaUrl, absPath, nextFileName, nextMimeType, editedHash, nowIso]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch (_cleanupError) {}
      throw error;
    }

    await indexAssetToElastic(assetId).catch(() => {});
    return { saved: true, status: callbackStatus, versionId: version.versionId, mediaUrl };
  }

  return {
    buildOnlyOfficeConfig,
    saveOnlyofficeCallbackVersion,
    getOnlyOfficeDocumentType,
    normalizeDocxForOnlyOfficeEdit
  };
}

module.exports = { createOfficeService };
