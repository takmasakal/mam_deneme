const crypto = require('crypto');
const fs = require('fs');

function readEncryptionKey() {
  const fromFile = String(process.env.S3_SHARE_CREDENTIALS_KEY_FILE || '').trim();
  let raw = String(process.env.S3_SHARE_CREDENTIALS_KEY || '').trim();
  if (!raw && fromFile) {
    try { raw = fs.readFileSync(fromFile, 'utf8').trim(); } catch { raw = ''; }
  }
  if (!raw) throw new Error('S3_SHARE_CREDENTIALS_KEY or S3_SHARE_CREDENTIALS_KEY_FILE is required');
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) throw new Error('S3 credentials encryption key must be 32 bytes (base64 or 64-character hex)');
  return decoded;
}

function encryptCredentials(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptCredentials(value, key) {
  const [version, ivText, tagText, ciphertextText] = String(value || '').split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) throw new Error('Unsupported encrypted S3 credentials');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

function normalizeTtl(value, fallback, max = 7) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.round(number)));
}

function createS3ShareSettingsService({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('A PostgreSQL pool is required');

  async function getSettings() {
    const result = await pool.query(`
      SELECT s.default_ttl_days, s.max_ttl_days, s.active_provider_id,
             p.provider_type, p.endpoint, p.region, p.bucket, p.force_path_style,
      p.encrypted_credentials, s.updated_at
      FROM s3_share_settings s
      LEFT JOIN s3_share_provider_profiles p ON p.provider_id = s.active_provider_id
      WHERE s.settings_id = 'default'
      LIMIT 1
    `);
    const row = result.rows?.[0] || {};
    let accessKeyHint = '';
    if (row.encrypted_credentials) {
      try {
        const credentials = decryptCredentials(row.encrypted_credentials, readEncryptionKey());
        const key = String(credentials.accessKeyId || '');
        accessKeyHint = key ? `••••${key.slice(-4)}` : 'configured';
      } catch {
        accessKeyHint = 'unavailable';
      }
    }
    return {
      enabled: Boolean(row.active_provider_id && row.encrypted_credentials),
      providerId: String(row.active_provider_id || ''),
      providerType: String(row.provider_type || 's3-compatible'),
      endpoint: String(row.endpoint || ''),
      region: String(row.region || 'auto'),
      bucket: String(row.bucket || ''),
      forcePathStyle: Boolean(row.force_path_style),
      credentialsConfigured: Boolean(row.encrypted_credentials),
      accessKeyHint,
      defaultTtlDays: normalizeTtl(row.default_ttl_days, 7),
      maxTtlDays: normalizeTtl(row.max_ttl_days, 7),
      updatedAt: row.updated_at || null
    };
  }

  async function getProviderConfig(providerId) {
    const result = await pool.query(
      `SELECT provider_id, provider_type, endpoint, region, bucket, force_path_style, encrypted_credentials
       FROM s3_share_provider_profiles WHERE provider_id = $1`,
      [String(providerId || '')]
    );
    const row = result.rows?.[0];
    if (!row) throw new Error('S3 provider profile not found');
    const credentials = decryptCredentials(row.encrypted_credentials, readEncryptionKey());
    return {
      providerId: row.provider_id,
      providerType: row.provider_type,
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      forcePathStyle: Boolean(row.force_path_style),
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
  }

  async function saveSettings(input = {}, actor = '') {
    const endpoint = String(input.endpoint || '').trim().replace(/\/$/, '');
    const bucket = String(input.bucket || '').trim();
    const region = String(input.region || 'auto').trim() || 'auto';
    const accessKeyId = String(input.accessKeyId || '').trim();
    const secretAccessKey = String(input.secretAccessKey || '').trim();
    // Presigned S3 URLs are limited to seven days by AWS and most compatible services.
    const defaultTtlDays = normalizeTtl(input.defaultTtlDays, 7, 7);
    const maxTtlDays = normalizeTtl(input.maxTtlDays, 7, 7);
    if (!endpoint || !bucket) throw new Error('S3 endpoint and bucket are required');
    let parsedEndpoint;
    try { parsedEndpoint = new URL(endpoint); } catch { throw new Error('S3 endpoint must be a valid URL'); }
    if (!['https:', 'http:'].includes(parsedEndpoint.protocol)) throw new Error('S3 endpoint must use HTTP or HTTPS');

    const current = await pool.query(`
      SELECT p.* FROM s3_share_settings s
      LEFT JOIN s3_share_provider_profiles p ON p.provider_id = s.active_provider_id
      WHERE s.settings_id = 'default' LIMIT 1
    `);
    const previous = current.rows?.[0] || null;
    let credentials;
    if (accessKeyId || secretAccessKey) {
      if (!accessKeyId || !secretAccessKey) throw new Error('Both S3 access key and secret key are required');
      credentials = { accessKeyId, secretAccessKey };
    } else if (previous?.encrypted_credentials) {
      credentials = decryptCredentials(previous.encrypted_credentials, readEncryptionKey());
    } else {
      throw new Error('S3 credentials are required');
    }

    const encryptedCredentials = encryptCredentials(credentials, readEncryptionKey());
    const providerId = crypto.randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO s3_share_provider_profiles
         (provider_id, provider_type, endpoint, region, bucket, force_path_style, encrypted_credentials, created_by)
         VALUES ($1, 's3-compatible', $2, $3, $4, $5, $6, $7)`,
        [providerId, endpoint, region, bucket, Boolean(input.forcePathStyle), encryptedCredentials, String(actor || '')]
      );
      await client.query(
        `UPDATE s3_share_settings
         SET active_provider_id = $1, default_ttl_days = $2, max_ttl_days = $3,
             updated_at = NOW(), updated_by = $4
         WHERE settings_id = 'default'`,
        [providerId, defaultTtlDays, Math.max(defaultTtlDays, maxTtlDays), String(actor || '')]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return getSettings();
  }

  return Object.freeze({ getSettings, getProviderConfig, saveSettings });
}

module.exports = { createS3ShareSettingsService, encryptCredentials, decryptCredentials, readEncryptionKey };
