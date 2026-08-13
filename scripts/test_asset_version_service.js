const assert = require('assert');

const { createAssetVersionService } = require('../src/services/assetVersionService');

const service = createAssetVersionService({
  isPdfCandidate: ({ fileName, mimeType }) => String(fileName || '').endsWith('.pdf') || String(mimeType || '').includes('pdf'),
  isOfficeDocumentCandidate: ({ fileName }) => /\.(docx|xlsx|pptx)$/i.test(String(fileName || '')),
  fs: {
    existsSync: () => false
  },
  path: require('path'),
  sanitizeFileName: (value) => String(value || '').replace(/[^\w.-]+/g, '_'),
  publicUploadUrlToAbsolutePath: () => ''
});

const admin = { username: 'admin', canAccessAdmin: true };
const pdfAdmin = { username: 'admin', canAccessAdmin: true, canUsePdfAdvancedTools: true };
const pdfUser = { username: 'alice', canUsePdfAdvancedTools: true };
const officeUser = { username: 'bob', canEditOffice: true };
const ordinaryUser = { username: 'carol' };

const pdfAsset = { mime_type: 'application/pdf', file_name: 'report.pdf' };
const officeAsset = { mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_name: 'report.docx' };
const videoAsset = { mime_type: 'video/mp4', file_name: 'clip.mp4' };
const aliceVersion = { actor_username: 'Alice', action_type: 'manual' };
const bobVersion = { actor_username: 'bob', action_type: 'manual' };

assert.deepStrictEqual(service.mapVersionRow({
  version_id: 'v2',
  label: 'Draft',
  note: 'note',
  snapshot_media_url: '/uploads/a.pdf',
  snapshot_source_path: '/app/uploads/a.pdf',
  snapshot_file_name: 'a.pdf',
  snapshot_mime_type: 'application/pdf',
  snapshot_thumbnail_url: '/uploads/thumb.jpg',
  actor_username: 'alice',
  action_type: 'manual',
  restored_from_version_id: 'v1',
  created_at: 'now'
}), {
  versionId: 'v2',
  label: 'Draft',
  note: 'note',
  snapshotMediaUrl: '/uploads/a.pdf',
  snapshotSourcePath: '/app/uploads/a.pdf',
  snapshotFileName: 'a.pdf',
  snapshotMimeType: 'application/pdf',
  snapshotThumbnailUrl: '/uploads/thumb.jpg',
  actorUsername: 'alice',
  actionType: 'manual',
  restoredFromVersionId: 'v1',
  createdAt: 'now'
});

assert.deepStrictEqual(service.buildVersionSnapshotFromRow({
  media_url: ' /uploads/a.pdf ',
  source_path: ' /app/uploads/a.pdf ',
  file_name: ' a.pdf ',
  mime_type: ' application/pdf ',
  thumbnail_url: ' /uploads/thumb.jpg '
}), {
  snapshotMediaUrl: '/uploads/a.pdf',
  snapshotSourcePath: '/app/uploads/a.pdf',
  snapshotFileName: 'a.pdf',
  snapshotMimeType: 'application/pdf',
  snapshotThumbnailUrl: '/uploads/thumb.jpg'
});

assert.strictEqual(service.canManagePdfVersionRow(admin, aliceVersion), false);
assert.strictEqual(service.canManagePdfVersionRow(pdfAdmin, aliceVersion), true);
assert.strictEqual(service.canManagePdfVersionRow(pdfUser, aliceVersion), true);
assert.strictEqual(service.canManagePdfVersionRow({ ...pdfUser, username: 'mallory' }, aliceVersion), false);
assert.strictEqual(service.canManagePdfVersionRow(ordinaryUser, aliceVersion), false);

assert.strictEqual(service.canCreateVersionForAsset(admin, videoAsset), true);
assert.strictEqual(service.canCreateVersionForAsset(pdfUser, pdfAsset), true);
assert.strictEqual(service.canCreateVersionForAsset(pdfUser, officeAsset), false);
assert.strictEqual(service.canCreateVersionForAsset(officeUser, officeAsset), true);
assert.strictEqual(service.canCreateVersionForAsset(ordinaryUser, videoAsset), false);

assert.strictEqual(service.canManageVersionRow(admin, videoAsset, aliceVersion), true);
assert.strictEqual(service.canManageVersionRow(pdfUser, pdfAsset, aliceVersion), true);
assert.strictEqual(service.canManageVersionRow({ ...pdfUser, username: 'mallory' }, pdfAsset, aliceVersion), false);
assert.strictEqual(service.canManageVersionRow(officeUser, officeAsset, bobVersion), true);
assert.strictEqual(service.canManageVersionRow(ordinaryUser, officeAsset, bobVersion), false);
assert.strictEqual(service.canManageVersionRow(officeUser, videoAsset, bobVersion), false);

console.log('assetVersionService OK');
