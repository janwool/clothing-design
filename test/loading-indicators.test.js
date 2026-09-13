const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const styles = read('public', 'css', 'style.css');
const growthStyles = read('public', 'css', 'growth.css');
const landingStyles = read('public', 'css', 'tshirt-generator-landing.css');
const detail = read('views', 'model-detail.ejs');
const designer = read('views', 'designer-3d.ejs');
const tool = read('views', 'tool-detail.ejs');

test('replaces model-viewer progress bars with circular loading indicators', () => {
  assert.match(styles, /\.model-viewer-natural \{[^}]*--progress-bar-height: 0px;[^}]*--progress-bar-color: transparent;/s);
  assert.match(landingStyles, /\.tmg-model-viewer \{[^}]*--progress-bar-height: 0px;[^}]*--progress-bar-color: transparent;/s);
  assert.match(styles, /\.model-viewer-spinner i \{[^}]*border-radius: 50%;[^}]*animation: spin 720ms linear infinite;/s);
  assert.match(growthStyles, /\.tool-model-spinner \{[^}]*border-radius: 50%;[^}]*animation: tool-model-spin 720ms linear infinite;/s);
});

test('shows the shared spinner in every 3D loading surface', () => {
  assert.equal((detail.match(/class="model-viewer-spinner"/g) || []).length, 2);
  assert.match(designer, /id="designerViewerLoading"[\s\S]*?<i aria-hidden="true"><\/i>/);
  assert.match(tool, /class="tool-model-spinner" aria-hidden="true"/);
  assert.match(designer, /viewer\.addEventListener\('load', finishViewerLoading/);
});
