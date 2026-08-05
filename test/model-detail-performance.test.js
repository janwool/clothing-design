const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const template = fs.readFileSync(
  path.join(__dirname, '..', 'views', 'model-detail.ejs'),
  'utf8'
);
const designerRuntime = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'model-designer.js'),
  'utf8'
);

test('keeps the interactive 3D model out of the initial model-detail request', () => {
  assert.match(template, /data-model-src="<%= previewModelFileUrl %>"/);
  assert.doesNotMatch(template, /<model-viewer[^>]*\ssrc="<%= previewModelFileUrl %>"/s);
  assert.match(template, /Load interactive 3D/);
  assert.match(template, /loadModelViewerElement\(viewer\)/);
});

test('loads the Design Studio runtime and material library only after intent', () => {
  assert.doesNotMatch(template, /id="modelDesignerRuntimeSource"/);
  assert.doesNotMatch(template, /<script\s+src="\/js\/design3d-materials\.js/);
  assert.doesNotMatch(template, /<script\s+src="\/js\/model-designer\.js/);
  assert.match(template, /script\.src = '\/js\/design3d-materials\.js\?v=20260805-lazy'/);
  assert.match(template, /script\.src = '\/js\/model-designer\.js\?v=20260805-runtime-lazy'/);
  assert.match(template, /button\.addEventListener\('click', handleDesignerEntry\)/);
  assert.match(designerRuntime, /window\.initializeModelDesigner = \(\) =>/);
  assert.doesNotMatch(designerRuntime, /<%/);
});

test('keeps on-model mockup code, styles, and image maps behind its launch action', () => {
  assert.match(template, /id="modelMockupModal"\s+hidden/s);
  assert.match(template, /link\.href = '\/css\/on-model-mockup\.css\?v=20260805'/);
  assert.match(template, /script\.src = '\/js\/on-model-mockup\.js\?v=20260805-on-model-studio-lazy'/);
  assert.match(template, /button\.addEventListener\('click', openStudio\)/);
});
