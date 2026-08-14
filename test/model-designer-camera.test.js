const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'model-designer.js'),
  'utf8'
);

test('captures the live model-viewer camera instead of exporting a fixed cover angle', () => {
  assert.match(runtime, /getCameraOrbit\?\.\(\)/);
  assert.match(runtime, /getCameraTarget\?\.\(\)/);
  assert.match(runtime, /getFieldOfView\?\.\(\)/);
  assert.match(runtime, /applyViewerCamera\(exportViewer, options\.cameraSnapshot\)/);
});

test('passes the current camera snapshot through download and multi-format exports', () => {
  assert.match(runtime, /const cameraSnapshot = captureViewerCamera\(\);/);
  assert.match(runtime, /cameraSnapshot\n\s*}\);/);
  assert.match(runtime, /renderDesignedModelImages\(textureUrl, formatOptions, \{ cameraSnapshot \}\)/);
});

test('keeps in-page render exports invisible while preserving visible cover capture', () => {
  assert.match(runtime, /const isVisibleCapture = options\.visibleCapture === true;/);
  assert.match(runtime, /exportViewer\.style\.opacity = isVisibleCapture \? '1' : '0';/);
  assert.match(runtime, /function renderDesignedModelImages[\s\S]*?createCoverExportViewer\(\{\}, renderStandard\);/);
  assert.match(runtime, /function prepareDesignedModelCoverCapture[\s\S]*?createCoverExportViewer\(\{ visibleCapture: true \}, renderStandard\);/);
});

test('uses the saved reference lighting standard for user render exports', () => {
  assert.match(runtime, /fetch\('\/config\/design3d-render-standard\.json'\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('environment-image', webStandard\.environmentImage\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('shadow-intensity', String\(webStandard\.shadowIntensity\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('shadow-softness', String\(webStandard\.shadowSoftness\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('exposure', String\(webStandard\.exposure\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('tone-mapping', webStandard\.toneMapping\)/);
});

test('does not replace native model materials until the user selects a preset', () => {
  const renderMaterialsStart = runtime.indexOf('function renderMaterialSwatches()');
  const renderMaterialsEnd = runtime.indexOf('\n  function parseSvgLength', renderMaterialsStart);
  const renderMaterials = runtime.slice(renderMaterialsStart, renderMaterialsEnd);
  assert.ok(renderMaterialsStart >= 0 && renderMaterialsEnd > renderMaterialsStart);
  assert.match(renderMaterials, /button\.addEventListener\('click', \(\) => applyMaterialPreset\(material\)\)/);
  assert.doesNotMatch(renderMaterials, /state\.selectedMaterial\s*=/);
});
