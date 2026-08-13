const assert = require('assert');

const { createAssetMapperService } = require('../src/services/assetMapperService');

let nextId = 0;
const service = createAssetMapperService({
  resolveStoredUrl: (url, folder) => url ? `/resolved/${folder}${url}` : '',
  sanitizeSubtitleItems: (items) => Array.isArray(items) ? items : [],
  sanitizeVideoOcrItems: (items) => Array.isArray(items) ? items : [],
  sanitizePhotoOcrItems: (items) => Array.isArray(items) ? items : [],
  normalizeSubtitleLang: (value) => String(value || 'tr').toLowerCase(),
  normalizeOcrEngine: () => 'paddle',
  resolveSubtitleActiveByLang: (_dc, items) => Object.fromEntries(items.map((item) => [item.subtitleLang, item.id])),
  nanoid: () => `id-${nextId += 1}`
});

const mapped = service.mapAssetRow({
  id: 'asset-1',
  title: 'Asset',
  description: 'Desc',
  type: 'Video',
  tags: ['tag'],
  owner: 'owner',
  duration_seconds: 12,
  source_path: '/source.mp4',
  media_url: '/uploads/video.mp4',
  proxy_url: '/proxy.mp4',
  proxy_status: 'ready',
  thumbnail_url: '/thumb.jpg',
  file_name: 'video.mp4',
  mime_type: 'video/mp4',
  visibility: '',
  owner_user: 'owner',
  owner_groups: ['group'],
  allowed_users: ['u'],
  allowed_groups: ['g'],
  denied_users: ['du'],
  denied_groups: ['dg'],
  edit_allowed_users: ['eu'],
  edit_allowed_groups: ['eg'],
  edit_denied_users: ['edu'],
  edit_denied_groups: ['edg'],
  download_allowed_users: ['dau'],
  download_allowed_groups: ['dag'],
  download_denied_users: ['ddu'],
  download_denied_groups: ['ddg'],
  dc_metadata: {
    audioChannels: 2,
    subtitleUrl: '/sub.vtt',
    subtitleLang: 'EN',
    subtitleLabel: 'English',
    videoOcrUrl: '/ocr.txt',
    videoOcrLabel: '',
    videoOcrLineCount: 5,
    videoOcrSegmentCount: 3,
    photoOcrUrl: '/photo-ocr.txt',
    photoOcrLineCount: 2,
    audioStreamOptions: [{ index: 0 }]
  },
  cuts: [
    { cutId: 'cut-1', label: ' Chapter ', inPointSeconds: 1, outPointSeconds: 2 },
    { cutId: 'bad', label: '' }
  ],
  _ocr_search_hits: [{ text: 'ocr' }],
  _subtitle_search_hits: [{ text: 'sub' }],
  status: 'Ingested',
  deleted_at: null,
  created_at: 'created',
  updated_at: 'updated'
});

assert.strictEqual(mapped.proxyUrl, '/resolved/proxies/proxy.mp4');
assert.strictEqual(mapped.thumbnailUrl, '/resolved/thumbnails/thumb.jpg');
assert.strictEqual(mapped.visibility, 'public');
assert.strictEqual(mapped.audioChannels, 2);
assert.strictEqual(mapped.subtitleItems.length, 1);
assert.strictEqual(mapped.subtitleItems[0].subtitleLang, 'en');
assert.strictEqual(mapped.subtitleActiveByLang.en, mapped.subtitleItems[0].id);
assert.strictEqual(mapped.videoOcrItems.length, 1);
assert.strictEqual(mapped.videoOcrItems[0].ocrLabel, 'video-ocr.txt');
assert.strictEqual(mapped.photoOcrItems.length, 1);
assert.strictEqual(mapped.cuts.length, 1);
assert.strictEqual(mapped.cuts[0].label, 'Chapter');
assert.deepStrictEqual(mapped.ocrSearchHits, [{ text: 'ocr' }]);
assert.deepStrictEqual(mapped.subtitleSearchHits, [{ text: 'sub' }]);
assert.strictEqual(mapped.inTrash, false);

assert.deepStrictEqual(service.mapCutRow({
  cut_id: 'cut-2',
  label: 'Clip',
  in_point_seconds: 4,
  out_point_seconds: 8,
  created_at: 'now'
}), {
  cutId: 'cut-2',
  label: 'Clip',
  inPointSeconds: 4,
  outPointSeconds: 8,
  createdAt: 'now'
});

console.log('assetMapperService OK');
