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

test('automatically loads the primary interactive 3D viewer on model-detail pages', () => {
  assert.match(template, /data-model-src="<%= previewModelFileUrl %>"/);
  assert.doesNotMatch(template, /<model-viewer[^>]*\ssrc="<%= previewModelFileUrl %>"/s);
  assert.doesNotMatch(template, />Load interactive 3D</);
  assert.match(template, /Loading interactive 3D…/);
  assert.match(template, /modelViewerLoad\?\.addEventListener\('click'/);
  assert.match(template, /ensureDetailViewer\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(template, /loadModelViewerElement\(viewer\)/);
  assert.doesNotMatch(template, /element\.loaded \|\| element\.model/);
  assert.match(template, /element\.loaded && element\.model/);
  assert.doesNotMatch(template, /\sauto-rotate(?:\s|>)/);
  assert.match(template, /id="rotateBtn" type="button" aria-pressed="false"/);
});

test('plays subtle baked garment motion and pauses it during direct manipulation', () => {
  assert.match(template, /id="fabricMotionBtn"/);
  assert.match(template, /availableAnimations\.find\(\(name\) => \/fabric\|breeze\|soft\/i\.test\(name\)\)/);
  assert.match(template, /element\.play\?\.\(\{ repetitions: Infinity \}\)/);
  assert.match(template, /element\.addEventListener\('pointerdown', pauseDuringInteraction\)/);
  assert.match(template, /window\.addEventListener\('pointerup', resumeAfterInteraction\)/);
  assert.match(template, /prefers-reduced-motion: reduce/);
  assert.match(template, /rotateBtn\.classList\.toggle\('active', readyViewer\.autoRotate\)/);
});

test('loads the Design Studio runtime and material library only after intent', () => {
  assert.doesNotMatch(template, /id="modelDesignerRuntimeSource"/);
  assert.doesNotMatch(template, /<script\s+src="\/js\/design3d-materials\.js/);
  assert.doesNotMatch(template, /<script\s+src="\/js\/model-designer\.js/);
  assert.match(template, /script\.src = '\/js\/design3d-materials\.js\?v=20260817-r2-materials'/);
  assert.match(template, /src: '\/js\/editor-transform\.js\?v=20260815-text-selection-v4'/);
  assert.match(template, /src: '\/js\/model-designer\.js\?v=20260815-text-selection-v4'/);
  assert.match(template, /button\.addEventListener\('click', handleDesignerEntry\)/);
  assert.match(designerRuntime, /window\.initializeModelDesigner = \(\) =>/);
  assert.doesNotMatch(designerRuntime, /<%/);
});

test('maps designed UV artwork one-to-one without inheriting GLB fabric tiling', () => {
  assert.match(designerRuntime, /function resetArtworkTextureTransform\(textureInfo\)/);
  assert.match(designerRuntime, /const sampler = textureInfo\?\.texture\?\.sampler/);
  assert.match(designerRuntime, /sampler\.setRotation\?\.\(null\)/);
  assert.match(designerRuntime, /sampler\.setScale\?\.\(null\)/);
  assert.match(designerRuntime, /sampler\.setOffset\?\.\(null\)/);
  assert.match(designerRuntime, /baseColorTexture\.setTexture\(texture\)[\s\S]*resetArtworkTextureTransform\(baseColorTexture\)/);
  assert.match(designerRuntime, /if \(options\.requireArtwork && !hasEditableArtwork\(\)\) return;/);
  assert.match(designerRuntime, /scheduleTexturePreviewUpdate\(\{ requireArtwork: true \}\)/);
});

test('keeps the UV artwork transparent without blackening opaque GLB materials', () => {
  assert.match(template, /id="textureWhiteBase" fill="transparent"/);
  assert.match(designerRuntime, /ctx\.clearRect\(0, 0, canvas\.width, canvas\.height\)/);
  assert.match(designerRuntime, /if \(options\.backgroundColor\)/);
  assert.match(designerRuntime, /function rasterizeModelTexture\(options = \{\}\)/);
  assert.match(designerRuntime, /rasterizeTexture\(\{ \.\.\.options, backgroundColor: '#ffffff' \}\)/);
  assert.match(designerRuntime, /const textureUrl = await rasterizeModelTexture\(\)/);
  assert.match(designerRuntime, /const textureForModel = await rasterizeModelTexture/);
});

test('temporarily highlights the corresponding 3D surface while hovering a UV path', () => {
  assert.match(designerRuntime, /textureUrl\.split\(\/\[\?#\]\/, 1\)\[0\]/);
  assert.match(designerRuntime, /function previewHoveredTemplatePath\(path\)/);
  assert.match(designerRuntime, /rasterizeModelTexture\(\{ includeTemplateHighlight: true \}\)/);
  assert.match(designerRuntime, /preserveMaterial: true/);
  assert.match(designerRuntime, /trackApplied: false/);
  assert.match(designerRuntime, /restoreViewerBaseColorTextures\(state\.hoverMaterialSnapshot\)/);
  assert.match(designerRuntime, /setTemplatePathPreview\(templatePath, 'hover'\)/);
  assert.match(designerRuntime, /previewHoveredTemplatePath\(templatePath\)/);
  assert.match(designerRuntime, /restoreTemplatePathPreview\(templatePath\)/);
  assert.match(designerRuntime, /clearHoveredTemplatePreview\(templatePath\)/);
});

test('opens a surface color toolbar when a UV path is selected', () => {
  assert.match(designerRuntime, /title\.innerHTML = '<span class="surface-toolbar-icon" aria-hidden="true"><\/span> Surface color'/);
  assert.match(designerRuntime, /elementToolbar\.classList\.toggle\('is-surface-toolbar'/);
  assert.match(designerRuntime, /requestAnimationFrame\(\(\) => \{/);
  assert.match(designerRuntime, /openColorPopover\(surfaceColorButton\)/);
  assert.match(designerRuntime, /setElementColor\(group, color\)/);
  assert.match(designerRuntime, /scheduleTexturePreviewUpdate\(\)/);
});

test('keeps on-model mockup code, styles, and image maps behind its launch action', () => {
  assert.match(template, /id="modelMockupModal"\s+hidden/s);
  assert.match(template, /link\.href = '\/css\/on-model-mockup\.css\?v=20260805'/);
  assert.match(template, /script\.src = '\/js\/on-model-mockup\.js\?v=20260805-on-model-studio-lazy'/);
  assert.match(template, /button\.addEventListener\('click', openStudio\)/);
});
