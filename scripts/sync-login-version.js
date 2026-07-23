const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
if (!version) throw new Error('package.json version is required');

const outputPath = path.join(
  rootDir,
  'keycloak-theme/mam/login/resources/js/mam-login-version.js'
);
const content = `window.MAM_LOGIN_VERSION = 'v${version}';\n`;
fs.writeFileSync(outputPath, content, 'utf8');
console.log(`Wrote ${path.relative(rootDir, outputPath)}: v${version}`);
