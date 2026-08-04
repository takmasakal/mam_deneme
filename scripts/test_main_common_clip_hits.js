const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = {
  window: {},
  console,
  FormData: class FormData {},
  URL,
  Blob,
  WeakMap,
  WeakSet,
  Map,
  Set
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'public', 'main-common.js'), 'utf8'),
  context,
  { filename: 'public/main-common.js' }
);

const common = context.window.createMainCommonModule({
  t: (key) => key,
  PLAYER_FPS: 25,
  currentLangRef: { get: () => 'tr' },
  subtitleOverlayEnabledByAsset: new Map(),
  selectedAssetIdRef: { get: () => '' },
  subtitleStyleRef: { get: () => ({}) },
  currentSubtitleQueryRef: { get: () => '' }
});

const html = common.clipHighlightSnippet({
  id: 'asset-1',
  cuts: [
    { cutId: 'cut-1', label: 'chapter 1', inPointSeconds: 24.12 },
    { cutId: 'cut-2', label: 'chapter 2', inPointSeconds: 94.68 },
    { cutId: 'cut-3', label: 'chapter 3', inPointSeconds: 229.92 }
  ]
}, 'chapter');

assert.strictEqual((html.match(/data-clip-jump="1"/g) || []).length, 3);
assert.match(html, /data-cut-id="cut-1"/);
assert.match(html, /data-cut-id="cut-2"/);
assert.match(html, /data-cut-id="cut-3"/);

console.log('mainCommon clip hit tests passed');
