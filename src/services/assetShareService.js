const crypto = require('crypto');
const fs = require('fs');
const { createS3CompatibleObjectStorage } = require('./s3CompatibleObjectStorage');

function createAssetShareService({ pool, settingsService, processingStorage } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('A PostgreSQL pool is required');
  if (!settingsService) throw new Error('S3 share settings service is required');
  if (!processingStorage || typeof processingStorage.toReference !== 'function') throw new Error('Processing storage service is required');

  async function createShare(input = {}) {
    const settings = await settingsService.getSettings();
    if (!settings.enabled) throw new Error('S3 sharing is not configured');
    const days = Math.max(1, Math.min(settings.maxTtlDays, Math.round(Number(input.expiresInDays) || settings.defaultTtlDays)));
    const providerId = settings.providerId;
    const shareId = crypto.randomUUID();
    const objectKey = `temporary-shares/${crypto.randomUUID()}`;
    const sourceRef = processingStorage.toReference(String(input.sourcePath || ''), 'primary');
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO asset_shares
         (share_id, asset_id, version_id, source_ref, provider_id, object_key, file_name, mime_type, file_size, status, created_by, expires_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,'queued',$10,$11)`,
        [shareId, input.assetId, String(input.versionId || ''), JSON.stringify(sourceRef), providerId,
          objectKey, String(input.fileName || ''), String(input.mimeType || 'application/octet-stream'),
          Math.max(0, Number(input.fileSize) || 0), String(input.createdBy || ''), expiresAt]
      );
      await client.query(
        `INSERT INTO asset_share_jobs (job_id, share_id, action) VALUES ($1,$2,'upload')`,
        [crypto.randomUUID(), shareId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return { shareId, status: 'queued', expiresAt, expiresInDays: days };
  }

  async function createReadUrl(shareId, { download = true } = {}) {
    const result = await pool.query(
      `SELECT share_id, provider_id, object_key, file_name, status, expires_at, revoked_at
       FROM asset_shares WHERE share_id = $1`,
      [String(shareId || '')]
    );
    const share = result.rows?.[0];
    if (!share) throw new Error('Share not found');
    const expiresAt = new Date(share.expires_at).getTime();
    const secondsLeft = Math.floor((expiresAt - Date.now()) / 1000);
    if (share.status !== 'active' || share.revoked_at || secondsLeft < 1) throw new Error('Share is not active');
    const config = await settingsService.getProviderConfig(share.provider_id);
    const storage = createS3CompatibleObjectStorage(config);
    try {
      const url = await storage.createReadUrl({
        key: share.object_key,
        expiresInSeconds: secondsLeft,
        fileName: share.file_name,
        download
      });
      return { url, expiresAt: share.expires_at, fileName: share.file_name };
    } finally {
      storage.close();
    }
  }

  async function enqueueDelete(client, shareId) {
    await client.query(
      `INSERT INTO asset_share_jobs (job_id, share_id, action)
       VALUES ($1,$2,'delete') ON CONFLICT (share_id, action) DO NOTHING`,
      [crypto.randomUUID(), shareId]
    );
  }

  async function revokeShare(shareId, actor = '') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE asset_shares SET revoked_at = COALESCE(revoked_at, NOW()), status = 'deleting'
         WHERE share_id = $1 AND status NOT IN ('deleted','expired') RETURNING share_id`,
        [String(shareId || '')]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      await enqueueDelete(client, shareId);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function revokeSharesForAsset(assetId, actor = '') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE asset_shares
         SET revoked_at = COALESCE(revoked_at, NOW()), status = 'deleting'
         WHERE asset_id = $1 AND status NOT IN ('deleted','expired')
         RETURNING share_id`,
        [String(assetId || '')]
      );
      for (const row of result.rows) await enqueueDelete(client, row.share_id);
      await client.query('COMMIT');
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function listShares({ assetId = '', createdBy = '', limit = 100 } = {}) {
    const values = [];
    const where = [];
    if (assetId) { values.push(assetId); where.push(`s.asset_id = $${values.length}`); }
    if (createdBy) { values.push(createdBy); where.push(`LOWER(s.created_by) = LOWER($${values.length})`); }
    values.push(Math.max(1, Math.min(500, Number(limit) || 100)));
    const result = await pool.query(
      `SELECT s.share_id, s.asset_id, s.version_id, s.file_name, s.mime_type, s.file_size,
              s.status, s.created_by, s.created_at, s.expires_at, s.revoked_at, s.last_error,
              a.title AS asset_title
       FROM asset_shares s JOIN assets a ON a.id = s.asset_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.created_at DESC LIMIT $${values.length}`,
      values
    );
    return result.rows;
  }

  async function claimNextJob(leaseSeconds = 120) {
    const result = await pool.query(
      `WITH candidate AS (
         SELECT job_id FROM asset_share_jobs
         WHERE (status = 'queued' AND run_after <= NOW())
            OR (status = 'running' AND lease_until < NOW())
         ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE asset_share_jobs j SET status = 'running', attempts = attempts + 1,
         lease_until = NOW() + ($1::int * INTERVAL '1 second'), updated_at = NOW()
       FROM candidate c WHERE j.job_id = c.job_id RETURNING j.*`,
      [Math.max(30, Number(leaseSeconds) || 120)]
    );
    return result.rows?.[0] || null;
  }

  async function enqueueExpiredShares() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE asset_shares SET status = 'deleting'
         WHERE status IN ('queued','active','failed') AND revoked_at IS NULL AND expires_at <= NOW()
         RETURNING share_id`
      );
      for (const row of result.rows) await enqueueDelete(client, row.share_id);
      await client.query('COMMIT');
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function markJobComplete(jobId) {
    await pool.query(`UPDATE asset_share_jobs SET status = 'completed', lease_until = NULL, last_error = '', updated_at = NOW() WHERE job_id = $1`, [jobId]);
  }

  async function markJobFailed(job, error) {
    const attempts = Number(job.attempts) || 1;
    const terminal = attempts >= 8;
    const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(attempts - 1, 8)));
    const message = String(error?.message || error || 'S3 share worker error').slice(0, 1000);
    await pool.query(
      `UPDATE asset_share_jobs SET status = $2, run_after = NOW() + ($3::int * INTERVAL '1 second'),
        lease_until = NULL, last_error = $4, updated_at = NOW() WHERE job_id = $1`,
      [job.job_id, terminal ? 'failed' : 'queued', delaySeconds, message]
    );
    if (terminal && job.action === 'upload') {
      await pool.query(`UPDATE asset_shares SET status = 'failed', last_error = $2 WHERE share_id = $1`, [job.share_id, message]);
    }
  }

  async function processJob(job) {
    const result = await pool.query('SELECT * FROM asset_shares WHERE share_id = $1', [job.share_id]);
    const share = result.rows?.[0];
    if (!share) return markJobComplete(job.job_id);
    const config = await settingsService.getProviderConfig(share.provider_id);
    const storage = createS3CompatibleObjectStorage(config);
    try {
      if (job.action === 'upload') {
        if (share.status !== 'queued' || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) {
          await markJobComplete(job.job_id);
          return;
        }
        const filePath = processingStorage.resolve(share.source_ref);
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) throw new Error('Share source is not a file');
        await storage.putFile({ key: share.object_key, filePath, contentType: share.mime_type, contentLength: stat.size });
        const updated = await pool.query(
          `UPDATE asset_shares SET status = CASE
             WHEN revoked_at IS NOT NULL OR expires_at <= NOW() THEN 'deleting' ELSE 'active' END,
             file_size = $2, last_error = '' WHERE share_id = $1 RETURNING status`,
          [share.share_id, stat.size]
        );
        if (updated.rows?.[0]?.status === 'deleting') await enqueueDelete(pool, share.share_id);
      } else if (job.action === 'delete') {
        await storage.deleteObject(share.object_key);
        const status = share.revoked_at ? 'deleted' : 'expired';
        await pool.query(`UPDATE asset_shares SET status = $2, last_error = '' WHERE share_id = $1`, [share.share_id, status]);
      }
      await markJobComplete(job.job_id);
    } finally {
      storage.close();
    }
  }

  return Object.freeze({ createShare, createReadUrl, revokeShare, revokeSharesForAsset, listShares, claimNextJob, enqueueExpiredShares, processJob, markJobComplete, markJobFailed });
}

module.exports = { createAssetShareService };
