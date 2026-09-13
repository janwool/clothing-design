const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeSvgCanvas } = require('../scripts/deploy-approved-model-library');

test('publishes editable UV faces without losing their transparent default', () => {
  const source = '<svg viewBox="0 0 2 1"><style>.uv-boundary{fill:none;stroke:#000}</style>' +
    '<path class="uv-boundary" d="M0 0H2V1Z" /></svg>';
  const published = normalizeSvgCanvas(source);

  assert.match(published, /<svg width="1024" height="512"/);
  assert.match(published, /<path fill="none" class="uv-boundary"/);
  assert.doesNotMatch(published, /\.uv-boundary\s*\{[^}]*fill\s*:\s*none/i);
  assert.match(published, /data-editor-canvas-compat="true"/);
  assert.match(published, /vector-effect:non-scaling-stroke/);
  assert.match(published, /animation:none!important;transition:none!important/);
});
