const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adminSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

assert.match(
  adminSource,
  /const readRichEditorText = \(\) => String\(richArea\?\.innerText \?\? richArea\?\.textContent \?\? ''\)\s*\.replace\(\/\\r\\n\?\/g, '\\n'\);/,
  'rich subtitle editor must preserve visual line breaks and normalize CRLF'
);
assert.match(
  adminSource,
  /richArea\?\.addEventListener\('input', \(\) => \{\s*if \(area\) area\.value = readRichEditorText\(\);\s*\}\);/,
  'rich subtitle editor input must serialize through readRichEditorText'
);

const readRichEditorText = (richArea) => String(richArea?.innerText ?? richArea?.textContent ?? '')
  .replace(/\r\n?/g, '\n');
const editedSubtitle = '00:00:07:14 --> 00:00:11:00\r\nPsikolojik eğitim ve reform...';
assert.strictEqual(
  readRichEditorText({ innerText: editedSubtitle, textContent: '00:00:07:14 --> 00:00:11:00Psikolojik eğitim ve reform...' }),
  '00:00:07:14 --> 00:00:11:00\nPsikolojik eğitim ve reform...'
);
assert.match(adminHtml, /\/admin\.js\?v=20260901-subtitle-linebreaks-1/);

console.log('admin subtitle editor line breaks OK');
