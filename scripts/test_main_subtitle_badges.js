const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
class Element {}
function button(dataset = {}) {
  return {
    dataset, attributes: {}, active: false,
    classList: { toggle(_name, active) { this.owner.active = active; } },
    hasAttribute(name) { return name === 'data-subtitle-language-choice' && Boolean(dataset.subtitleUrl); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(_type, callback) { this.click = callback; }
  };
}
const toggle = button();
const tur = button({ subtitleUrl: '/tr.vtt', subtitleLang: 'tr', subtitleLabel: 'Turkish' });
const eng = button({ subtitleUrl: '/en.vtt', subtitleLang: 'en', subtitleLabel: 'English' });
const buttons = [toggle, tur, eng];
buttons.forEach((item) => { item.classList.owner = item; });
const picker = {
  dataset: { subtitleAssetId: 'asset-1' },
  querySelector: () => toggle,
  querySelectorAll: (selector) => selector.includes(',') ? buttons : [tur, eng]
};
const root = new Element();
root.querySelector = (selector) => selector === '.detail-subtitle-language-picker' ? picker : null;
const players = ['VIDEO', 'AUDIO'].map((tagName) => ({
  tagName, dataset: { assetId: 'asset-1' }, textTracks: [{ mode: 'showing' }], events: [],
  querySelector: () => null,
  dispatchEvent(event) { this.events.push(event); }
}));
const states = new Map();
let customOverlayEnabled = true;
const context = vm.createContext({
  window: {}, Element, console,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  document: { querySelectorAll: (selector) => selector === '[data-subtitle-asset-id]' ? [picker] : players.filter((p) => p.tagName === 'VIDEO' || selector.includes('audio')) },
  t: (key) => key,
  setSubtitleOverlayEnabled: (id, enabled) => states.set(id, enabled)
});
vm.runInContext(read('main-common.js'), context);
const common = context.window.createMainCommonModule({
  t: (key) => key, subtitleOverlayEnabledByAsset: states,
  currentLangRef: { get: () => 'tr' },
  subtitleStyleRef: { get: () => ({ customOverlayEnabled }) }
});
context.getSubtitleOverlayEnabled = common.getSubtitleOverlayEnabled;
context.syncSubtitleOverlayInOpenPlayers = common.syncSubtitleOverlayInOpenPlayers;
const main = read('main.js');
vm.runInContext(main.slice(main.indexOf('function initDetailSubtitleLanguagePicker('), main.indexOf('async function openMultiSelectionDetail(')), context);
const asset = { id: 'asset-1', subtitleUrl: '/tr.vtt' };
context.initDetailSubtitleLanguagePicker(asset, root);
assert.strictEqual(toggle.attributes['aria-pressed'], 'false');
toggle.click();
assert.strictEqual(states.get(asset.id), true, 'ALT/SUB turns subtitles on');
assert.strictEqual(tur.active, true);
players.forEach((player) => assert.strictEqual(player.events.at(-1).detail.enabled, true, `${player.tagName} receives visibility`));
toggle.click();
assert.strictEqual(states.get(asset.id), false, 'ALT/SUB turns subtitles off');
tur.click();
assert.strictEqual(states.get(asset.id), true, 'selected language opens when hidden');
eng.click();
assert.strictEqual(asset.subtitleUrl, '/en.vtt');
assert.strictEqual(states.get(asset.id), true, 'switching languages keeps subtitles visible');
assert.strictEqual(tur.active, false);
assert.strictEqual(eng.attributes['aria-pressed'], 'true');
eng.click();
assert.strictEqual(states.get(asset.id), false, 'same language toggles off');
eng.click();
assert.strictEqual(states.get(asset.id), true, 'same language toggles back on');
states.set(asset.id, false);
common.syncSubtitleOverlayInOpenPlayers(asset);
assert.strictEqual(toggle.active, false, 'external shortcut/tools change updates badges');
assert.strictEqual(eng.active, false);
asset.subtitleUrl = '';
asset.subtitleItems = [{ subtitleUrl: '/tr.vtt', subtitleLang: 'tr' }];
toggle.click();
assert.strictEqual(asset.subtitleUrl, '/tr.vtt', 'item-only assets select a fallback');
assert.strictEqual(states.get(asset.id), true);
customOverlayEnabled = false;
players.splice(0, 1);
common.syncSubtitleOverlayInOpenPlayers(asset);
assert.strictEqual(players[0].events.at(-1).detail.enabled, true, 'audio continues using its custom overlay with native video subtitles');
picker.dataset.subtitleAssetId = 'other-asset';
states.set(asset.id, false);
common.syncSubtitleOverlayInOpenPlayers(asset);
assert.strictEqual(toggle.active, true, 'unrelated asset controls are untouched');

const detail = read('main-detail.js');
vm.runInContext(detail.slice(detail.indexOf('    function detailArtifactBadges('), detail.indexOf('\n    function ', detail.indexOf('    function detailArtifactBadges(') + 1)), context);
Object.assign(context, { isVideo: () => true, isAudio: () => false, isImage: () => false, escapeHtml: common.escapeHtml, currentLang: () => 'tr' });
assert.strictEqual(context.detailArtifactBadges({ id: 'empty' }), '');
const single = context.detailArtifactBadges({ id: 'single', subtitleUrl: '/tr.vtt' });
assert.match(single, /<button[^>]+data-subtitle-toggle/);
assert.doesNotMatch(single, /data-subtitle-language-choice/);
const multi = context.detailArtifactBadges({ ...asset, subtitleItems: [tur.dataset, eng.dataset] });
assert.strictEqual((multi.match(/data-subtitle-language-choice/g) || []).length, 2);
assert.doesNotMatch(multi, /<details|<summary/, 'language buttons stay available for repeated clicks');
console.log('Subtitle badge tests passed (toggle, languages, video/audio, external sync, markup).');
