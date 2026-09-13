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

test('passes the current camera snapshot through the preview render and multi-format exports', () => {
  assert.match(runtime, /async function renderCurrentModelImage\(\)/);
  assert.match(runtime, /await waitForModelViewerReady\(activeViewer\)/);
  assert.match(runtime, /captureViewerCamera\(activeViewer\)/);
  assert.match(runtime, /const cameraSnapshot = captureViewerCamera\(\);/);
  assert.match(runtime, /cameraSnapshot\n\s*}\);/);
  assert.match(runtime, /renderDesignedModelImages\(textureUrl, formatOptions, \{ cameraSnapshot \}\)/);
});

test('saves a rendered 3D garment image as the Workbench project cover', () => {
  const saveStart = runtime.indexOf('async function saveCloudProject(options = {})');
  const saveEnd = runtime.indexOf('\n  function setRenderStatus', saveStart);
  const saveBlock = runtime.slice(saveStart, saveEnd);
  assert.match(saveBlock, /captureViewerCamera\(designerViewer\)/);
  assert.match(saveBlock, /renderDesignedModelImageWithFallback\(textureDataUrl, \{[\s\S]*mimeType: 'image\/webp'[\s\S]*cameraSnapshot/);
  assert.match(saveBlock, /'project-preview'/);
  assert.match(saveBlock, /previewImageUrl: preview\.url/);
  assert.doesNotMatch(saveBlock, /previewImageUrl: texture\.url/);
  assert.match(saveBlock, /textureUrl: texture\.url/);
});

test('downloads the current-view render directly without opening a preview dialog', () => {
  assert.match(runtime, /function downloadRenderedImage\(renderUrl, filename\)/);
  assert.match(runtime, /link\.download = filename/);
  assert.match(runtime, /link\.click\(\)/);
  assert.match(runtime, /downloadRenderedImage\(renderUrl, filename\)/);
  assert.doesNotMatch(runtime, /modelRenderDialog|modelRenderImage|modelRenderDownload|window\.open\(renderUrl/);
});

test('keeps in-page render exports invisible while preserving visible cover capture', () => {
  assert.match(runtime, /const isVisibleCapture = options\.visibleCapture === true;/);
  assert.match(runtime, /exportViewer\.style\.opacity = isVisibleCapture \? '1' : '0';/);
  assert.match(runtime, /function renderDesignedModelImages[\s\S]*?createCoverExportViewer\(\{\}, renderStandard\);/);
  assert.match(runtime, /function prepareDesignedModelCoverCapture[\s\S]*?createCoverExportViewer\(\{ visibleCapture: true \}, renderStandard\);/);
});

test('uses the saved reference lighting standard for user render exports', () => {
  assert.match(runtime, /fetch\('\/config\/design3d-render-standard\.json\?v=20260907-balanced-exposure-v6'\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('environment-image', webStandard\.environmentImage\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('shadow-intensity', String\(webStandard\.exportShadowIntensity \?\? 0\.32\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('shadow-softness', String\(webStandard\.exportShadowSoftness \?\? 0\.96\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('exposure', String\(webStandard\.exposure\)\)/);
  assert.match(runtime, /exportViewer\.setAttribute\('tone-mapping', webStandard\.toneMapping\)/);
});

test('uses the saved commercial camera and lighting in the live design preview', () => {
  assert.match(runtime, /viewerElement\.setAttribute\('camera-target', cameraStandard\.webTarget/);
  assert.match(runtime, /viewerElement\.setAttribute\('field-of-view', cameraStandard\.webFieldOfView/);
  assert.match(runtime, /viewerElement\.id === 'designerViewer'/);
  assert.match(runtime, /cameraStandard\.webEditorOrbit \|\| '-48deg 72deg 158%'/);
  assert.match(runtime, /viewerElement\.setAttribute\('camera-orbit', cameraOrbit\)/);
  assert.match(runtime, /viewerElement\.removeAttribute\('auto-rotate'\)/);
  assert.match(runtime, /viewerElement\.jumpCameraToGoal\?\.\(\)/);
});

test('does not replace native model materials until the user selects a preset', () => {
  const renderMaterialsStart = runtime.indexOf('function renderMaterialSwatches()');
  const renderMaterialsEnd = runtime.indexOf('\n  function parseSvgLength', renderMaterialsStart);
  const renderMaterials = runtime.slice(renderMaterialsStart, renderMaterialsEnd);
  assert.ok(renderMaterialsStart >= 0 && renderMaterialsEnd > renderMaterialsStart);
  assert.match(renderMaterials, /button\.addEventListener\('click', \(\) => applyMaterialPreset\(material\)\)/);
  assert.doesNotMatch(renderMaterials, /state\.selectedMaterial\s*=/);
});
