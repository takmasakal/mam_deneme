const fs = require('fs');
const { createS3CompatibleObjectStorage } = require('../services/s3CompatibleObjectStorage');

function createShareAccessHelpers({ assetAccessService, resolveEffectivePermissions }) {
  async function getGate(req, res) {
    const effective = await resolveEffectivePermissions(req);
    const context = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
    const allowed = Boolean(
      effective?.isSuperAdmin
      || effective?.canAccessAdmin
      || effective?.canAccessS3Sharing
      || assetAccessService.hasScopedAdminScopeAccess(context, 's3-share')
    );
    if (!allowed) {
      res.status(403).json({ error: 'S3 sharing permission is required' });
      return null;
    }
    return { effective, context };
  }
  return { getGate };
}

function registerS3ShareRoutes(app, deps = {}) {
  const {
    pool,
    assetAccessService,
    resolveEffectivePermissions,
    settingsService,
    shareService,
    publicUploadUrlToAbsolutePath,
    recordAuditEvent
  } = deps;
  const { getGate } = createShareAccessHelpers({ assetAccessService, resolveEffectivePermissions });

  async function loadShareVisibleAsset(assetId, context) {
    const result = await pool.query('SELECT * FROM assets WHERE id = $1 AND deleted_at IS NULL', [assetId]);
    const row = result.rows?.[0] || null;
    if (!row || !assetAccessService.canViewAsset(row, context)) return null;
    return row;
  }

  app.get('/api/admin/s3-sharing/settings', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      if (!effective?.isSuperAdmin && !effective?.canAccessAdmin) return res.status(403).json({ error: 'Admin permission is required' });
      return res.json(await settingsService.getSettings());
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load S3 sharing settings' });
    }
  });

  app.patch('/api/admin/s3-sharing/settings', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      if (!effective?.isSuperAdmin && !effective?.canAccessAdmin) return res.status(403).json({ error: 'Admin permission is required' });
      const settings = await settingsService.saveSettings(req.body || {}, effective.username || effective.displayName || '');
      await recordAuditEvent?.(req, {
        action: 's3_sharing.settings_updated', targetType: 'settings', targetId: 's3-sharing',
        targetTitle: 'S3 sharing settings', details: { endpoint: settings.endpoint, bucket: settings.bucket, providerType: settings.providerType }
      });
      return res.json(settings);
    } catch (error) {
      return res.status(400).json({ error: String(error?.message || 'Failed to save S3 sharing settings').slice(0, 240) });
    }
  });

  app.post('/api/admin/s3-sharing/settings/test', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      if (!effective?.isSuperAdmin && !effective?.canAccessAdmin) return res.status(403).json({ error: 'Admin permission is required' });
      const settings = await settingsService.getSettings();
      if (!settings.providerId) return res.status(409).json({ error: 'Save S3 settings before testing the connection' });
      const config = await settingsService.getProviderConfig(settings.providerId);
      const storage = createS3CompatibleObjectStorage(config);
      try { await storage.checkConnection(); } finally { storage.close(); }
      return res.json({ connected: true, endpoint: settings.endpoint, bucket: settings.bucket });
    } catch (error) {
      return res.status(502).json({ connected: false, error: String(error?.message || 'S3 connection test failed').slice(0, 240) });
    }
  });

  app.get('/api/admin/s3-sharing/shares', async (req, res) => {
    try {
      const gate = await getGate(req, res);
      if (!gate) return null;
      const values = [];
      const where = ['assets.deleted_at IS NULL'];
      assetAccessService.appendAssetAccessWhere(where, values, gate.context, 'assets');
      const result = await pool.query(
        `SELECT s.share_id, s.asset_id, s.version_id, s.file_name, s.mime_type, s.file_size,
                s.status, s.created_by, s.created_at, s.expires_at, s.revoked_at, s.last_error,
                a.title AS asset_title
         FROM asset_shares s JOIN assets a ON a.id = s.asset_id
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at DESC LIMIT 300`,
        values
      );
      return res.json({ shares: result.rows });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load S3 shares' });
    }
  });

  app.post('/api/assets/:id/s3-shares', async (req, res) => {
    try {
      const gate = await getGate(req, res);
      if (!gate) return null;
      const asset = await loadShareVisibleAsset(String(req.params.id || ''), gate.context);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      if (!assetAccessService.canDownloadAsset(asset, gate.context)) {
        return res.status(403).json({ error: 'Download permission is required to create a share link' });
      }
      let sourceRow = asset;
      let versionId = String(asset.default_version_id || '');
      if (versionId) {
        const versionResult = await pool.query(
          `SELECT version_id, snapshot_source_path, snapshot_media_url, snapshot_file_name, snapshot_mime_type
           FROM asset_versions WHERE asset_id = $1 AND version_id = $2`,
          [asset.id, versionId]
        );
        const version = versionResult.rows?.[0];
        if (version) sourceRow = {
          ...asset,
          source_path: version.snapshot_source_path || '',
          media_url: version.snapshot_media_url || '',
          file_name: version.snapshot_file_name || asset.file_name,
          mime_type: version.snapshot_mime_type || asset.mime_type
        };
        else versionId = '';
      }
      const directPath = String(sourceRow.source_path || '').trim();
      const sourcePath = directPath && fs.existsSync(directPath)
        ? directPath
        : publicUploadUrlToAbsolutePath(sourceRow.media_url);
      if (!sourcePath) return res.status(404).json({ error: 'The selected asset file is unavailable' });
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) return res.status(422).json({ error: 'The selected version is not a file' });
      const result = await shareService.createShare({
        assetId: asset.id,
        versionId,
        sourcePath,
        fileName: sourceRow.file_name || asset.file_name,
        mimeType: sourceRow.mime_type || asset.mime_type,
        fileSize: stat.size,
        expiresInDays: req.body?.expiresInDays,
        createdBy: gate.effective.username || gate.effective.displayName || ''
      });
      await recordAuditEvent?.(req, {
        action: 'asset.s3_share_created', targetType: 'asset', targetId: asset.id,
        targetTitle: String(asset.title || asset.file_name || asset.id),
        details: { shareId: result.shareId, versionId, expiresAt: result.expiresAt, status: result.status }
      });
      return res.status(202).json(result);
    } catch (error) {
      return res.status(400).json({ error: String(error?.message || 'Failed to create S3 share').slice(0, 240) });
    }
  });

  app.get('/api/assets/:id/s3-shares/:shareId/url', async (req, res) => {
    try {
      const gate = await getGate(req, res);
      if (!gate) return null;
      const asset = await loadShareVisibleAsset(String(req.params.id || ''), gate.context);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      const rows = await shareService.listShares({ assetId: asset.id, limit: 500 });
      const share = rows.find((item) => String(item.share_id) === String(req.params.shareId));
      if (!share) return res.status(404).json({ error: 'Share not found' });
      const url = await shareService.createReadUrl(share.share_id);
      return res.json(url);
    } catch (error) {
      return res.status(409).json({ error: String(error?.message || 'Share link is not ready').slice(0, 240) });
    }
  });

  app.get('/api/assets/:id/s3-shares/:shareId', async (req, res) => {
    try {
      const gate = await getGate(req, res);
      if (!gate) return null;
      const asset = await loadShareVisibleAsset(String(req.params.id || ''), gate.context);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      const rows = await shareService.listShares({ assetId: asset.id, limit: 500 });
      const share = rows.find((item) => String(item.share_id) === String(req.params.shareId));
      if (!share) return res.status(404).json({ error: 'Share not found' });
      return res.json(share);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load S3 share status' });
    }
  });

  app.delete('/api/assets/:id/s3-shares/:shareId', async (req, res) => {
    try {
      const gate = await getGate(req, res);
      if (!gate) return null;
      const asset = await loadShareVisibleAsset(String(req.params.id || ''), gate.context);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      const rows = await shareService.listShares({ assetId: asset.id, limit: 500 });
      const share = rows.find((item) => String(item.share_id) === String(req.params.shareId));
      if (!share) return res.status(404).json({ error: 'Share not found' });
      const revoked = await shareService.revokeShare(share.share_id, gate.effective.username || '');
      await recordAuditEvent?.(req, {
        action: 'asset.s3_share_revoked', targetType: 'asset', targetId: asset.id,
        targetTitle: String(asset.title || asset.file_name || asset.id), details: { shareId: share.share_id }
      });
      return res.json({ revoked });
    } catch (error) {
      return res.status(500).json({ error: String(error?.message || 'Failed to revoke S3 share').slice(0, 240) });
    }
  });
}

module.exports = { registerS3ShareRoutes, createShareAccessHelpers };
