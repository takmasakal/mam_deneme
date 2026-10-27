const fs = require('fs');
const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function encodeDispositionFileName(value = '') {
  const fileName = String(value || 'download').replace(/[\r\n"\\]/g, '_').trim() || 'download';
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function createS3CompatibleObjectStorage(config = {}) {
  const endpoint = String(config.endpoint || '').trim();
  const bucket = String(config.bucket || '').trim();
  const accessKeyId = String(config.accessKeyId || '').trim();
  const secretAccessKey = String(config.secretAccessKey || '').trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 endpoint, bucket, and credentials are required');
  }
  const client = new S3Client({
    endpoint,
    region: String(config.region || 'auto').trim() || 'auto',
    forcePathStyle: Boolean(config.forcePathStyle),
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 3
  });

  return Object.freeze({
    bucket,
    async checkConnection() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    },
    async putFile({ key, filePath, contentType, contentLength }) {
      const stream = fs.createReadStream(filePath);
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: String(key),
          Body: stream,
          ContentLength: Number(contentLength),
          ContentType: String(contentType || 'application/octet-stream'),
          Metadata: { purpose: 'temporary-asset-share' }
        }));
      } catch (error) {
        stream.destroy();
        throw error;
      }
    },
    async createReadUrl({ key, expiresInSeconds, fileName = '', download = true }) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: String(key),
        ResponseContentDisposition: `${download ? 'attachment' : 'inline'}; ${encodeDispositionFileName(fileName)}`
      });
      return getSignedUrl(client, command, { expiresIn: Math.max(1, Math.min(604800, Number(expiresInSeconds) || 1)) });
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(key) }));
    },
    close() {
      client.destroy();
    }
  });
}

module.exports = { createS3CompatibleObjectStorage, encodeDispositionFileName };
