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

  function repairMojibake(input) {
    let current = String(input || '');
    for (let i = 0; i < 2 && /[\u00c3\u00c2\u00e2\u00c5\u00c4]/.test(current); i += 1) {
      const repaired = Buffer.from(current, 'latin1').toString('utf8');
      if (!repaired || repaired.includes('\uFFFD') || repaired === current) break;
      current = repaired;
    }
    return current;
  }

  function normalizeDisplayValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return repairMojibake(raw).normalize('NFC').trim();
  }

  function getHeader(req, name) {
    try {
      const raw = String(req?.get?.(name) || '').trim();
      if (!raw) return '';
      try {
        return normalizeDisplayValue(decodeURIComponent(raw));
      } catch (_decodeError) {
        return normalizeDisplayValue(raw);
      }
    } catch (_error) {
      return '';
    }
  }

  function normalizeIdentity(value) {
    return normalizeDisplayValue(value).toLowerCase();
  }

  function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  }

  function emailLocalPart(value) {
    const email = String(value || '').trim();
    return email.includes('@') ? email.split('@')[0] : '';
  }

  function getActor(req = {}) {
    const permissions = req.userPermissions || {};
    const rawUser = getHeader(req, 'X-Auth-Request-User') || getHeader(req, 'X-Forwarded-User');
    const preferred = getHeader(req, 'X-Auth-Request-Preferred-Username') || getHeader(req, 'X-Forwarded-Preferred-Username');
    const email = normalizeDisplayValue(permissions.email || getHeader(req, 'X-Auth-Request-Email') || getHeader(req, 'X-Forwarded-Email') || '');
    const localEmail = emailLocalPart(email);
    const permissionUsername = normalizeDisplayValue(permissions.username || '');
    const username = normalizeDisplayValue(
      permissionUsername
      || preferred
      || (!isUuidLike(rawUser) ? rawUser : '')
      || localEmail
      || rawUser
      || ''
    );
    const displayName = normalizeDisplayValue(
      permissions.displayName
      || permissions.name
      || preferred
      || (!isUuidLike(rawUser) ? rawUser : '')
      || username
      || localEmail
      || 'user'
    );
    const aliases = [
      permissionUsername,
      permissions.displayName,
      permissions.name,
      permissions.email,
      preferred,
      rawUser,
      email,
      localEmail,
      username,
      displayName
    ]
      .map(normalizeIdentity)
      .filter(Boolean);
    return {
      username: username || displayName || 'user',
      displayName: displayName || username || 'user',
      aliases: Array.from(new Set(aliases))
    };
  }

  function isOwnLock(lock, actor) {
    const lockedBy = normalizeIdentity(lock?.locked_by);
    const lockedByName = normalizeIdentity(lock?.locked_by_name);
    const aliases = Array.isArray(actor?.aliases) ? actor.aliases : [actor?.username, actor?.displayName].map(normalizeIdentity);
    return Boolean(
      (lockedBy && aliases.includes(lockedBy))
      || (lockedByName && aliases.includes(lockedByName))
    );
  }

  function toPayload(lock) {
    if (!lock) return null;
    return {
      assetId: String(lock.asset_id || ''),
      lockId: String(lock.lock_id || ''),
      lockedBy: normalizeDisplayValue(lock.locked_by || ''),
      lockedByName: normalizeDisplayValue(lock.locked_by_name || lock.locked_by || ''),
      purpose: String(lock.purpose || ''),
      lockedAt: lock.created_at,
      updatedAt: lock.updated_at,
      expiresAt: lock.expires_at
    };
  }

  function lockedErrorMessage(lock) {
    const lockedBy = normalizeDisplayValue(lock?.locked_by_name || lock?.locked_by || 'Another user') || 'Another user';
    return `${lockedBy} is editing this asset.`;
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
        error: lockedErrorMessage(existing),
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
        error: lockedErrorMessage(existing),
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
        error: lockedErrorMessage(existing),
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
