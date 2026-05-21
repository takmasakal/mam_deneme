const crypto = require('crypto');

function createAssetEditLockService({ pool, ttlSeconds = 900 } = {}) {
  if (!pool) throw new Error('pool is required');
  const ttlMs = Math.max(60, Number(ttlSeconds) || 900) * 1000;

  function nowIso() {
    return new Date().toISOString();
  }

  function expiryIso() {
    return new Date(Date.now() + ttlMs).toISOString();
  }

  function getActor(req = {}) {
    const permissions = req.userPermissions || {};
    const username = String(
      permissions.username
      || req.get?.('X-Auth-Request-User')
      || req.get?.('X-Forwarded-User')
      || ''
    ).trim();
    const displayName = String(
      permissions.displayName
      || permissions.name
      || req.get?.('X-Auth-Request-Preferred-Username')
      || username
      || 'user'
    ).trim();
    return {
      username: username || displayName || 'user',
      displayName: displayName || username || 'user'
    };
  }

  function isOwnLock(lock, actor) {
    const lockedBy = String(lock?.locked_by || '').trim().toLowerCase();
    const username = String(actor?.username || '').trim().toLowerCase();
    return Boolean(lockedBy && username && lockedBy === username);
  }

  function toPayload(lock) {
    if (!lock) return null;
    return {
      assetId: String(lock.asset_id || ''),
      lockId: String(lock.lock_id || ''),
      lockedBy: String(lock.locked_by || ''),
      lockedByName: String(lock.locked_by_name || lock.locked_by || ''),
      purpose: String(lock.purpose || ''),
      lockedAt: lock.created_at,
      updatedAt: lock.updated_at,
      expiresAt: lock.expires_at
    };
  }

  async function cleanupExpired() {
    await pool.query('DELETE FROM asset_edit_locks WHERE expires_at <= NOW()');
  }

  async function getActiveLock(assetId) {
    const safeAssetId = String(assetId || '').trim();
    if (!safeAssetId) return null;
    await cleanupExpired();
    const result = await pool.query('SELECT * FROM asset_edit_locks WHERE asset_id = $1', [safeAssetId]);
    return result.rows[0] || null;
  }

  async function acquire(req, assetId, purpose = 'edit') {
    const safeAssetId = String(assetId || '').trim();
    if (!safeAssetId) return { ok: false, status: 400, error: 'assetId is required' };
    const actor = getActor(req);
    const existing = await getActiveLock(safeAssetId);
    if (existing && !isOwnLock(existing, actor)) {
      return {
        ok: false,
        status: 423,
        error: `${String(existing.locked_by_name || existing.locked_by || 'Another user')} is editing this asset.`,
        code: 'asset_locked',
        lock: toPayload(existing)
      };
    }
    const now = nowIso();
    const expiresAt = expiryIso();
    const lockId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    const result = await pool.query(
      `
        INSERT INTO asset_edit_locks (
          asset_id, lock_id, locked_by, locked_by_name, purpose, created_at, updated_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
        ON CONFLICT (asset_id)
        DO UPDATE SET
          locked_by = EXCLUDED.locked_by,
          locked_by_name = EXCLUDED.locked_by_name,
          purpose = EXCLUDED.purpose,
          updated_at = EXCLUDED.updated_at,
          expires_at = EXCLUDED.expires_at
        RETURNING *
      `,
      [safeAssetId, lockId, actor.username, actor.displayName, String(purpose || 'edit'), now, expiresAt]
    );
    return { ok: true, status: 200, lock: toPayload(result.rows[0]) };
  }

  async function refresh(req, assetId) {
    const safeAssetId = String(assetId || '').trim();
    const actor = getActor(req);
    const existing = await getActiveLock(safeAssetId);
    if (!existing) return acquire(req, safeAssetId, 'edit');
    if (!isOwnLock(existing, actor)) {
      return {
        ok: false,
        status: 423,
        error: `${String(existing.locked_by_name || existing.locked_by || 'Another user')} is editing this asset.`,
        code: 'asset_locked',
        lock: toPayload(existing)
      };
    }
    const result = await pool.query(
      `
        UPDATE asset_edit_locks
        SET updated_at = $2, expires_at = $3
        WHERE asset_id = $1
        RETURNING *
      `,
      [safeAssetId, nowIso(), expiryIso()]
    );
    return { ok: true, status: 200, lock: toPayload(result.rows[0]) };
  }

  async function release(req, assetId) {
    const safeAssetId = String(assetId || '').trim();
    const actor = getActor(req);
    const existing = await getActiveLock(safeAssetId);
    if (!existing) return { ok: true, released: false };
    if (!isOwnLock(existing, actor)) {
      return { ok: false, status: 403, error: 'Cannot release another user edit lock', lock: toPayload(existing) };
    }
    await pool.query('DELETE FROM asset_edit_locks WHERE asset_id = $1', [safeAssetId]);
    return { ok: true, released: true };
  }

  async function releaseAsset(assetId) {
    const safeAssetId = String(assetId || '').trim();
    if (!safeAssetId) return { ok: true, released: false };
    const result = await pool.query('DELETE FROM asset_edit_locks WHERE asset_id = $1 RETURNING *', [safeAssetId]);
    return { ok: true, released: Number(result.rowCount || 0) > 0, lock: toPayload(result.rows?.[0]) };
  }

  async function assertWritable(req, assetId) {
    const actor = getActor(req);
    const existing = await getActiveLock(assetId);
    if (existing && !isOwnLock(existing, actor)) {
      return {
        ok: false,
        status: 423,
        error: `${String(existing.locked_by_name || existing.locked_by || 'Another user')} is editing this asset.`,
        code: 'asset_locked',
        lock: toPayload(existing)
      };
    }
    return { ok: true };
  }

  function sendLocked(res, result) {
    return res.status(Number(result?.status || 423)).json({
      error: String(result?.error || 'Asset is locked for editing'),
      code: String(result?.code || 'asset_locked'),
      lock: result?.lock || null
    });
  }

  return {
    getActor,
    getActiveLock,
    acquire,
    refresh,
    release,
    releaseAsset,
    assertWritable,
    sendLocked
  };
}

module.exports = { createAssetEditLockService };
