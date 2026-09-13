const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const geometry = require('../public/js/svg-mask-geometry');
const { validateSvgMaskData } = require('../lib/svg-mask-data');

const root = path.join(__dirname, '..');

function sampleSvg() {
  return geometry.buildSvgDocument({
    width: 1024,
    height: 1536,
    title: 'Database SVG mask',
    regions: [{
      id: 'region-1',
      kind: 'add',
      smoothing: 0,
      visible: true,
      points: [
        { x: 100, y: 200 },
        { x: 900, y: 200 },
        { x: 850, y: 1100 },
        { x: 150, y: 1100 }
      ]
    }]
  });
}

test('validates editable SVG path data before database storage', () => {
  const value = validateSvgMaskData(sampleSvg());
  assert.equal(value.width, 1024);
  assert.equal(value.height, 1536);
  assert.equal(value.regionCount, 1);
  assert.equal(value.nodeCount, 4);
});

test('rejects active SVG content and points outside the mask canvas', () => {
  assert.throws(
    () => validateSvgMaskData(sampleSvg().replace('</svg>', '<script>alert(1)</script></svg>')),
    /unsupported active content/
  );
  assert.throws(
    () => validateSvgMaskData(sampleSvg().replace('100,200', '1400,200')),
    /inside the document bounds/
  );
});

test('connects Save & Apply storage to the production mask URL', () => {
  const appCore = fs.readFileSync(path.join(root, 'app-core.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'routes', 'on-model-svg-masks.js'), 'utf8');
  const dataLayer = fs.readFileSync(path.join(root, 'lib', 'on-model-mockups.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'migrations', '0004_on_model_mockup_svg_masks.sql'), 'utf8');
  assert.match(appCore, /app\.use\('\/api\/on-model-svg-masks'/);
  assert.match(route, /router\.put\('\/:assetName'/);
  assert.match(route, /router\.get\('\/:assetName\.svg'/);
  assert.match(dataLayer, /result\.svg_mask_url = `\/api\/on-model-svg-masks\//);
  assert.doesNotMatch(dataLayer, /result\.mask_image_url = `\/api\/on-model-svg-masks\//);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS on_model_mockup_svg_masks/);
});
