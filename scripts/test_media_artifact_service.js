const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMediaArtifactService } = require('../src/services/mediaArtifactService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-artifacts-'));

try {
  const uploadsDir = path.join(root, 'uploads');
  const service = createMediaArtifactService({
    uploadsDir,
    proxiesDir: path.join(uploadsDir, 'proxies'),
    thumbnailsDir: path.join(uploadsDir, 'thumbnails'),
    subtitlesDir: path.join(uploadsDir, 'subtitles'),
    ocrDir: path.join(uploadsDir, 'ocr'),
    ocrFramesDir: path.join(uploadsDir, 'ocr', '_frames'),
    sanitizeFileName: (value) => String(value || '').replace(/[\\/]+/g, '-').trim(),
    nanoid: () => 'frame-id',
    now: () => 1785000000000
  });

  assert.strictEqual(
    service.getUploadDateDir(new Date(Date.UTC(2026, 6, 22))),
    path.join('2026', '7', '22')
  );
  assert.strictEqual(service.artifactRoot('ocr'), path.join(uploadsDir, 'ocr'));
  assert.strictEqual(service.artifactFolder('proxies'), 'previews');
  assert.strictEqual(service.artifactFolder('attachments'), 'attachments');

  const built = service.buildArtifactPath(
    'subtitles',
    'folder/video.vtt',
    '2026-07-22T10:20:30Z'
  );
  assert.strictEqual(built.datePart, path.join('2026', '7', '22'));
  assert.strictEqual(
    built.absolutePath,
    path.join(uploadsDir, '2026', '7', '22', 'subtitles', 'folder-video.vtt')
  );
  assert.strictEqual(built.publicUrl, '/uploads/2026/7/22/subtitles/folder-video.vtt');
  assert.strictEqual(fs.existsSync(path.dirname(built.absolutePath)), true);

  fs.writeFileSync(path.join(uploadsDir, '2026', '7', '22', 'subtitles', 'folder-video.vtt'), 'WEBVTT\n');
  assert.strictEqual(
    service.resolveStoredUrl('/uploads/2026/7/22/subtitles/folder-video.vtt', 'subtitles'),
    '/uploads/2026/7/22/subtitles/folder-video.vtt'
  );

  const legacyProxyDir = path.join(uploadsDir, 'proxies');
  fs.mkdirSync(legacyProxyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyProxyDir, 'legacy.mp4'), 'x');
  assert.strictEqual(service.resolveStoredUrl('legacy.mp4', 'proxies'), '/uploads/proxies/legacy.mp4');

  const absoluteThumb = path.join(uploadsDir, '2026', '7', '22', 'thumbnails', 'thumb.jpg');
  fs.mkdirSync(path.dirname(absoluteThumb), { recursive: true });
  fs.writeFileSync(absoluteThumb, 'x');
  assert.strictEqual(
    service.resolveStoredUrl(absoluteThumb, 'thumbnails'),
    '/uploads/2026/7/22/thumbnails/thumb.jpg'
  );
  assert.strictEqual(
    service.publicUploadUrlToAbsolutePath('/uploads/2026/7/22/thumbnails/thumb.jpg'),
    absoluteThumb
  );
  assert.strictEqual(service.publicUploadUrlToAbsolutePath('/not-uploads/file.txt'), '');
  assert.strictEqual(service.isUploadArtifactPath(absoluteThumb, 'thumbnails'), true);
  assert.strictEqual(service.isUploadArtifactPath(path.join(root, 'other.jpg'), 'thumbnails'), false);

  const frameDir = service.createOcrFrameWorkDir('2026-07-22T10:20:30Z');
  assert.strictEqual(
    frameDir,
    path.join(uploadsDir, 'ocr', '_frames', '2026', '7', '22', '1785000000000-frame-id-frames')
  );
  assert.strictEqual(fs.existsSync(frameDir), true);

  process.stdout.write('mediaArtifactService tests passed\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
