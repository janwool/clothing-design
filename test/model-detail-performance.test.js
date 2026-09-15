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
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'css', 'style.css'),
  'utf8'
);
const modelDetailStyles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'css', 'model-detail-v2.css'),
  'utf8'
);
const userProjectsRuntime = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'user-projects.js'),
  'utf8'
);
const userContentRoute = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'user-content.js'),
  'utf8'
);

test('automatically loads the primary interactive 3D viewer on model-detail pages', () => {
  assert.match(template, /<model-viewer[^>]*\ssrc="<%= previewModelFileUrl %>"/s);
  assert.doesNotMatch(template, /class="model-detail-poster"/);
  assert.doesNotMatch(template, />Load interactive 3D</);
  assert.doesNotMatch(template, /Retry interactive 3D/);
  assert.doesNotMatch(template, /id="modelViewerLoad"/);
  assert.doesNotMatch(template, /modelViewerLoadStatus/);
  assert.doesNotMatch(template, /Interactive 3D ready\./);
  assert.doesNotMatch(template, /modelViewerLoad\?\.addEventListener\('click'/);
  assert.match(template, /ensureDetailViewer\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(template, /loadModelViewerElement\(viewer\)/);
  assert.match(template, /script\.src = '\/vendor\/model-viewer\/model-viewer\.min\.js\?v=4\.3\.1'/);
  assert.doesNotMatch(template, /unpkg\.com\/@google\/model-viewer/);
  assert.doesNotMatch(template, /element\.loaded \|\| element\.model/);
  assert.match(template, /element\.loaded && element\.model/);
  assert.match(template, /const modelSource = element\.getAttribute\('src'\) \|\| element\.dataset\.modelSrc/);
  assert.match(template, /element\.setAttribute\('src', modelSource\)/);
  assert.doesNotMatch(template, /element\.hidden = true/);
  assert.doesNotMatch(template, /element\.removeAttribute\('src'\)/);
  assert.match(template, /readyViewer\.removeAttribute\('poster'\)/);
  assert.doesNotMatch(template, /\sauto-rotate(?:\s|>)/);
  assert.match(template, /id="rotateBtn" type="button" aria-pressed="false"/);
});

test('enables the Meshopt decoder before loading compressed GLB models', () => {
  const decoderAssignment = template.indexOf("window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0'");
  const viewerModuleAssignment = template.indexOf("script.src = '/vendor/model-viewer/model-viewer.min.js?v=4.3.1'");

  assert.ok(decoderAssignment >= 0);
  assert.ok(viewerModuleAssignment > decoderAssignment);
});

test('applies the saved commercial cover scene to detail and editor viewers', () => {
  assert.match(template, /data-catalog-render-standard="main"/);
  assert.doesNotMatch(template, /data-catalog-render-standard="side"/);
  assert.match(template, /fetch\('\/config\/design3d-render-standard\.json\?v=20260907-balanced-exposure-v6'\)/);
  assert.match(template, /camera-orbit="-48deg 72deg 142%"/);
  assert.match(template, /camera-orbit="-48deg 72deg 158%"/);
  assert.match(template, /camera-target="auto auto auto"/);
  assert.match(template, /field-of-view="28deg"/);
  assert.match(template, /function applyCatalogRenderAttributes\(element, standard/);
  assert.match(template, /function applyCatalogMaterialResponse\(element, standard/);
  assert.match(template, /try \{\s+material\.setSheenColorFactor\?\./);
  assert.match(template, /try \{\s+material\.setSpecularFactor\?\./);
  assert.match(template, /element\.removeAttribute\('auto-rotate'\)/);
  assert.doesNotMatch(template, /90000, '3D model timed out'/);
  assert.match(template, /readyViewer\.cameraOrbit = catalogOrbitForAzimuth\(detailSceneStandard, button\.dataset\.orbit\)/);
});

test('removes the redundant three-column model showcase module', () => {
  assert.doesNotMatch(template, /model-showcase-section|showcase-side-viewer|Garment preview|UV artwork layout|Side silhouette/);
  assert.doesNotMatch(modelDetailStyles, /model-showcase-section|\.showcase-grid|\.showcase-label/);
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
  assert.match(template, /script\.src = '\/js\/design3d-materials\.js\?v=20260819-fabric-softness-v2'/);
  assert.match(template, /src: '\/js\/editor-transform\.js\?v=20260815-text-selection-v4'/);
  assert.match(template, /src: '\/js\/model-designer\.js\?v=20260915-quick-style-v49'/);
  assert.match(template, /button\.addEventListener\('click', handleDesignerEntry\)/);
  assert.match(designerRuntime, /window\.initializeModelDesigner = \(\) =>/);
  assert.doesNotMatch(designerRuntime, /<%/);
});

test('keeps the live editor model contained after replacing its poster', () => {
  assert.match(styles, /\.design-modal \.preview-model-stage \{[\s\S]*?overflow: hidden;[\s\S]*?contain: layout paint;/);
  assert.match(styles, /\.design-modal \.preview-3d-panel model-viewer,[\s\S]*?max-height: 100%;/);
});

test('seeds and fits the SVG canvas before revealing the editor', () => {
  const openModalStart = designerRuntime.indexOf('async function openModal()');
  const openModalEnd = designerRuntime.indexOf('\n  function hexToRgbUnit', openModalStart);
  const openModal = designerRuntime.slice(openModalStart, openModalEnd);
  assert.ok(openModalStart >= 0 && openModalEnd > openModalStart);
  assert.ok(openModal.indexOf('await Promise.all([loadTextureDimensions(), cloudProjectLoadPromise]);') < openModal.indexOf('fitCanvasZoom()'));
  assert.ok(openModal.indexOf('fitCanvasZoom()') < openModal.indexOf("designModal.classList.add('active')"));
  assert.match(designerRuntime, /svgWidth: 1024,[\s\S]*svgHeight: 1024,/);
  assert.match(template, /<svg id="textureSvg"[^>]*width="1024"[^>]*height="1024"[^>]*viewBox="0 0 1024 1024"/);
});

test('normalizes dimensionless SVG viewBoxes to a usable 1024px editor canvas', () => {
  const helperStart = designerRuntime.indexOf('  function parseSvgLength');
  const helperEnd = designerRuntime.indexOf('\n  // Load SVG texture dimensions dynamically', helperStart);
  const helperSource = designerRuntime.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const resolveDimensions = Function(`${helperSource}; return resolveTextureCanvasDimensions;`)();

  assert.deepEqual(
    resolveDimensions('<svg viewBox="0 -1 1 1"></svg>'),
    { width: 1024, height: 1024 }
  );
  assert.deepEqual(
    resolveDimensions('<svg viewBox="0 0 2 1"></svg>'),
    { width: 1024, height: 512 }
  );
  assert.deepEqual(
    resolveDimensions('<svg width="800" height="600" viewBox="0 0 1 1"></svg>'),
    { width: 800, height: 600 }
  );
});

test('keeps ordinary detail-page navigation out of the editor', () => {
  assert.doesNotMatch(designerRuntime, /window\.location\.hash !== '#design'/);
  assert.doesNotMatch(template, /window\.location\.hash === '#design'/);
  assert.doesNotMatch(designerRuntime, /shouldOpenSavedProject/);
  assert.match(designerRuntime, /if \(!pendingArtworkIsFresh\) return;/);
  assert.match(template, /hasPendingArtwork \|\| hasSavedProject/);
});

test('applies a saved project to the detail viewer without opening the editor', () => {
  const loadProjectStart = designerRuntime.indexOf('async function loadCloudProject()');
  const navigationStart = designerRuntime.indexOf('let pendingArtwork = null;', loadProjectStart);
  const loadProjectBlock = designerRuntime.slice(loadProjectStart, navigationStart);

  assert.match(loadProjectBlock, /await window\.loadClothingModelViewer\?\.\(detailViewer\)\.catch\(\(\) => null\);/);
  assert.match(loadProjectBlock, /applyMaterialPreset\(material\)/);
  assert.match(loadProjectBlock, /applyTextureToViewer\(viewerElement, state\.finalTextureUrl\)/);
  assert.match(loadProjectBlock, /parseSavedProjectElements\(saved\.elements\)/);
  assert.match(loadProjectBlock, /replaceTextureElements\(wrapper\)/);
  assert.match(loadProjectBlock, /if \(saved\.appearance\) restoreAppearanceState\(saved\.appearance\)/);
  assert.match(loadProjectBlock, /else await restoreLegacyAppearanceFromTexture\(state\.finalTextureUrl\)/);
  assert.match(loadProjectBlock, /window\.Design3DMaterials\.materials\.find\(item => item\.id === saved\.materialId\)/);
  assert.doesNotMatch(loadProjectBlock, /document\.createElement\('div'\)/);
  assert.doesNotMatch(loadProjectBlock, /openModal\(/);
  assert.match(designerRuntime, /parseFromString\([\s\S]*?'image\/svg\+xml'/);
  assert.match(designerRuntime, /textureElements\.replaceChildren\(\.\.\.imported\)/);
  assert.match(designerRuntime, /cloudProjectLoadPromise = loadCloudProject\(\)/);
  assert.match(template, /document\.addEventListener\('DOMContentLoaded', loadSavedDesign, \{ once: true \}\)/);
});

test('loads saved project textures through the authenticated same-origin proxy', () => {
  assert.match(designerRuntime, /function getViewerTextureUrl\(textureUrl\)/);
  assert.match(designerRuntime, /`\/api\/project-texture\?url=\$\{encodeURIComponent\(textureUrl\)\}`/);
  assert.match(designerRuntime, /const originalSourceUrl = getViewerTextureUrl\(textureUrl\);/);
  assert.match(designerRuntime, /ExportEntitlements\.prepareTexture\(originalSourceUrl\)/);
  assert.match(designerRuntime, /return await viewerElement\.createTexture\(sourceUrl\);/);
  assert.match(designerRuntime, /async function resolveArtworkDataUrl\(source\) \{[\s\S]*?`\/api\/project-texture\?url=\$\{encodeURIComponent\(source\)\}`/);
  assert.match(designerRuntime, /fetch\(sourceUrl, \{ credentials: 'same-origin' \}\)/);
  assert.match(designerRuntime, /if \(!applied\.some\(Boolean\)\) throw new Error\('Saved project texture could not be applied\.'\)/);
});

test('waits for the detail viewer to receive an applied design before closing the editor', () => {
  const applyHelperStart = designerRuntime.indexOf('async function applyFinalTextureToViewers(textureUrl)');
  const applyHelperEnd = designerRuntime.indexOf('\n  function copySamplerVector', applyHelperStart);
  const applyHelper = designerRuntime.slice(applyHelperStart, applyHelperEnd);
  const saveStart = designerRuntime.indexOf('async function saveCloudProject(options = {})');
  const saveEnd = designerRuntime.indexOf('\n  function setRenderStatus', saveStart);
  const saveBlock = designerRuntime.slice(saveStart, saveEnd);

  assert.match(applyHelper, /window\.loadClothingModelViewer\?\.\(viewerElement\)/);
  assert.match(applyHelper, /if \(!viewerElement\.model\) await waitForModelViewerReady\(viewerElement\);/);
  assert.match(applyHelper, /const materials = await waitForViewerMaterials\(viewerElement\);/);
  assert.match(applyHelper, /let didApply = false;/);
  assert.match(applyHelper, /didApply = await applyTextureToViewer\(viewerElement, textureUrl, \{/);
  assert.match(applyHelper, /viewerElement\.requestUpdate\?\.\(\);/);
  assert.match(applyHelper, /applied\[detailViewerIndex\] !== true/);
  assert.match(designerRuntime, /async function waitForViewerMaterials\(viewerElement, timeoutMs = 12000\)/);
  assert.match(designerRuntime, /async function loadDesignedSceneIntoDetailViewer\(\)/);
  assert.match(designerRuntime, /const sceneBlob = await designerViewer\.exportScene\(\);/);
  assert.match(designerRuntime, /detailViewer\.src = sceneUrl;/);
  assert.match(applyHelper, /didApply = await loadDesignedSceneIntoDetailViewer\(\);/);
  assert.match(applyHelper, /sharedTexture = await createViewerTexture\(viewerElement, textureUrl\);/);
  assert.match(applyHelper, /texture: sharedTexture/);
  assert.match(designerRuntime, /const texture = options\.texture \|\| await createViewerTexture\(viewerElement, textureUrl\);/);
  assert.match(designerRuntime, /Skipped an incompatible 3D material while applying the design:/);
  assert.match(designerRuntime, /viewerElement\.createCanvasTexture\(\)/);
  assert.match(designerRuntime, /context\.translate\(0, canvas\.height\);/);
  assert.match(designerRuntime, /context\.scale\(1, -1\);/);
  assert.match(designerRuntime, /context\.drawImage\(image, 0, 0, canvas\.width, canvas\.height\);/);
  assert.match(designerRuntime, /texture\.source\.update\?\.\(\);/);
  assert.ok(saveBlock.indexOf('clearHoveredTemplatePreview();') < saveBlock.indexOf('rasterizeModelTexture'));
  assert.ok(saveBlock.indexOf('await applyFinalTextureToViewers(textureDataUrl);') < saveBlock.indexOf('closeModal();'));
  assert.match(saveBlock, /if \(!modelDesignerConfig\.userAuthenticated \|\| !window\.UserProjects\)/);
  assert.match(saveBlock, /materialId: state\.selectedMaterial\?\.id \|\| null/);
  assert.match(saveBlock, /appearance: serializeAppearanceState\(\)/);
  assert.match(designerRuntime, /panelFills: \[\.\.\.textureSvg\.querySelectorAll\('\.texture-template-path\[data-color\]'\)\]/);
  assert.match(designerRuntime, /setElementColor\(path, normalizeSavedPaint\(savedFill\.paint\)\)/);
  assert.match(designerRuntime, /async function restoreLegacyAppearanceFromTexture\(textureUrl\)/);
  assert.match(designerRuntime, /const borderBins = new Map\(\)/);
  assert.match(designerRuntime, /const dominant = \(bins\) => \[\.\.\.bins\.values\(\)\]\.sort/);
  assert.match(designerRuntime, /appearanceColorStart\.value = color/);
  assert.match(designerRuntime, /querySelectorAll\('\.texture-template-path'\)\]\.forEach\(\(path\) => setElementColor\(path, color\)\)/);
  assert.match(template, /model-designer\.js\?v=20260915-quick-style-v49/);
});

test('replays only the latest live color or gradient after 3D materials are ready', () => {
  assert.match(designerRuntime, /pendingTextureUrl: null/);
  assert.match(designerRuntime, /const updateId = \+\+state\.textureUpdateId;[\s\S]*await applyTextureToModel\(textureUrl, updateId\)/);
  assert.match(designerRuntime, /const materials = await waitForViewerMaterials\(designerViewer\)/);
  assert.match(designerRuntime, /isCurrent: \(\) => updateId === state\.textureUpdateId && state\.pendingTextureUrl === textureUrl/);
  assert.match(designerRuntime, /if \(typeof options\.isCurrent === 'function' && !options\.isCurrent\(\)\) return false/);
  assert.match(designerRuntime, /viewerElement\.requestUpdate\?\.\(\);\s+await viewerElement\.updateComplete/);
  assert.match(designerRuntime, /if \(state\.pendingTextureUrl\) \{\s+applyTextureToModel\(state\.pendingTextureUrl, state\.textureUpdateId\)/);
});

test('keeps the hero contact shadow behind and below the garment', () => {
  assert.match(modelDetailStyles, /\.model-product-page \.model-contact-shadow \{[^}]*bottom: 5%;[^}]*z-index: 0;/);
  assert.match(modelDetailStyles, /\.model-product-page \.model-viewer-natural \{[^}]*z-index: 1;/);
});

test('keeps the editorial quick-style controls inside the first viewport', () => {
  assert.match(modelDetailStyles, /\.model-product-page \.model-detail-hero \{[^}]*min-height: 100svh;/);
  assert.match(modelDetailStyles, /\.model-product-page \.model-detail-hero > \.container \{[^}]*min-height: calc\(100svh - var\(--navbar-height\) - 40px\);/);
  assert.match(template, /class="model-quick-style"/);
  assert.match(template, /\['cotton-jersey', 'Cotton'/);
  assert.match(template, /\['rib-knit', 'Jersey', '\/images\/material-previews\/jersey\.webp'/);
  assert.match(template, /\['satin-silk', 'Satin', '\/images\/material-previews\/satin\.webp'/);
  assert.match(template, /\['#d8c5b1', 'Warm beige'/);
  assert.match(template, /class="quick-style-upgrade"/);
  assert.match(modelDetailStyles, /\.model-product-page \.model-quick-style \{[^}]*grid-template-columns: minmax\(0, 1fr\) 220px;/s);
  assert.match(modelDetailStyles, /\.model-product-page \.quick-fabric-menu \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s);
});

test('applies hero material and color choices to the live 3D model', () => {
  assert.match(template, /window\.applyModelQuickMaterial/);
  assert.match(template, /window\.applyModelQuickColor/);
  assert.match(designerRuntime, /window\.applyModelQuickMaterial = applyQuickMaterial/);
  assert.match(designerRuntime, /window\.applyModelQuickColor = applyQuickColor/);
  assert.match(designerRuntime, /await Promise\.all\(getLoadedDesignViewers\(\)\.map\(\(viewerElement\) => applyTextureToViewer\(viewerElement, textureUrl\)\)\)/);
});

test('uses the selected hero background without decorative vertical grid lines', () => {
  const heroStart = modelDetailStyles.indexOf('.model-product-page .model-detail-hero {');
  const heroEnd = modelDetailStyles.indexOf('\n}', heroStart);
  const heroStyles = modelDetailStyles.slice(heroStart, heroEnd);

  assert.match(heroStyles, /background: var\(--hero-background\);/);
  assert.doesNotMatch(heroStyles, /linear-gradient\(90deg/);
});

test('maps normalized packed SVG coordinates back onto the GLB UV coordinate system', () => {
  assert.match(designerRuntime, /function resolveArtworkTextureTransform\(sourceSvg, sourceViewBox\)/);
  assert.match(designerRuntime, /sourceSvg\.getAttribute\('data-layout'\) === 'packed'/);
  assert.match(designerRuntime, /scale: \{ u: 1 \/ width, v: -1 \/ height \}/);
  assert.match(designerRuntime, /offset: \{ u: -x \/ width, v: -y \/ height \}/);
  assert.match(designerRuntime, /state\.artworkTextureTransform = resolveArtworkTextureTransform\(sourceSvg, sourceViewBox\)/);
  assert.match(designerRuntime, /function applyArtworkTextureTransform\(textureInfo\)/);
  assert.match(designerRuntime, /const sampler = textureInfo\?\.texture\?\.sampler/);
  assert.match(designerRuntime, /sampler\.setRotation\?\.\(null\)/);
  assert.match(designerRuntime, /sampler\.setScale\?\.\(state\.artworkTextureTransform\?\.scale \|\| null\)/);
  assert.match(designerRuntime, /sampler\.setOffset\?\.\(state\.artworkTextureTransform\?\.offset \|\| null\)/);
  assert.match(designerRuntime, /baseColorTexture\.setTexture\(texture\)[\s\S]*applyArtworkTextureTransform\(baseColorTexture\)/);
  assert.match(designerRuntime, /if \(!usesRawPackedUvCoordinates\) return null;/);
  assert.match(designerRuntime, /if \(options\.requireArtwork && !hasEditableArtwork\(\)\) return;/);
  assert.match(designerRuntime, /scheduleTexturePreviewUpdate\(\{ requireArtwork: true \}\)/);
});

test('uses the inverse packed-SVG viewBox transform for real model UV samples', () => {
  const helperStart = designerRuntime.indexOf('  function resolveArtworkTextureTransform');
  const helperEnd = designerRuntime.indexOf('\n  function applyTemplateLayerTransform', helperStart);
  const helperSource = designerRuntime.slice(helperStart, helperEnd);
  const resolveTransform = Function(`${helperSource}; return resolveArtworkTextureTransform;`)();
  const packedSvg = {
    getAttribute: (name) => name === 'data-layout' ? 'packed' : '14.glb',
    hasAttribute: (name) => name === 'data-source'
  };
  const viewBox = {
    x: -0.3920993158,
    y: -1.139273511,
    width: 1.161612207,
    height: 1.161612207
  };
  const transform = resolveTransform(packedSvg, viewBox);
  const uv = { u: 0.3124200124, v: 0.4940444014 };

  assert.ok(Math.abs((uv.u * transform.scale.u + transform.offset.u) - ((uv.u - viewBox.x) / viewBox.width)) < 1e-12);
  assert.ok(Math.abs((uv.v * transform.scale.v + transform.offset.v) - ((-uv.v - viewBox.y) / viewBox.height)) < 1e-12);
  assert.equal(resolveTransform({
    getAttribute: () => null,
    hasAttribute: () => false
  }, { x: 0, y: 0, width: 1024, height: 1024 }), null);
});

test('keeps appearance colors visible after selecting a material preset', () => {
  assert.match(designerRuntime, /function getDesignedTextureFactor\(\) \{[\s\S]*return \[1, 1, 1, 1\];/);
  assert.match(designerRuntime, /pbr\.setBaseColorFactor\(getDesignedTextureFactor\(\)\)/);
  assert.match(designerRuntime, /baseColorTexture\.setTexture\(texture\)[\s\S]*applyFabricSurfaceResponse\(material, state\.selectedMaterial\)/);
  assert.match(designerRuntime, /try \{\s+modelMaterial\.setSheenColorFactor\?\./);
  assert.match(designerRuntime, /try \{\s+modelMaterial\.setSpecularFactor\?\./);
  assert.doesNotMatch(designerRuntime, /setBaseColorFactor\(getSelectedMaterialFactor\(\)\)/);
});

test('backs opaque GLB textures with the whole garment color without spilling partial panel edits', () => {
  assert.match(template, /id="textureWhiteBase" fill="transparent"/);
  assert.match(designerRuntime, /ctx\.clearRect\(0, 0, canvas\.width, canvas\.height\)/);
  assert.match(designerRuntime, /if \(options\.backgroundColor\)/);
  assert.match(designerRuntime, /function getModelTextureBackingPaint\(\)/);
  assert.match(designerRuntime, /paths\.some\(\(path\) => !path\.dataset\.color\)\) return '#ffffff'/);
  assert.match(designerRuntime, /bounds\.width \* bounds\.height/);
  assert.match(designerRuntime, /return dominantPaint \? parseColorState\(dominantPaint\)\.start : '#ffffff'/);
  assert.match(designerRuntime, /function rasterizeModelTexture\(options = \{\}\)/);
  assert.match(designerRuntime, /backgroundColor: options\.backgroundColor \|\| getModelTextureBackingPaint\(\)/);
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
  assert.match(styles, /\.texture-template-path\.hover-template-path \{[\s\S]*?vector-effect: non-scaling-stroke;/);
  assert.match(styles, /\.texture-template-path\.selected-template-path \{[\s\S]*?vector-effect: non-scaling-stroke;/);
  assert.match(styles, /\.texture-template-path \{[\s\S]*?transition: none;/);
  assert.match(styles, /\.texture-template-fill \{[\s\S]*?transition: none;/);
});

test('opens a surface color toolbar when a UV path is selected', () => {
  assert.match(designerRuntime, /title\.innerHTML = '<span class="surface-toolbar-icon" aria-hidden="true"><\/span> Surface color'/);
  assert.match(designerRuntime, /elementToolbar\.classList\.toggle\('is-surface-toolbar'/);
  assert.match(designerRuntime, /requestAnimationFrame\(\(\) => \{/);
  assert.match(designerRuntime, /openColorPopover\(surfaceColorButton\)/);
  assert.match(designerRuntime, /setElementColor\(group, color\)/);
  assert.match(designerRuntime, /fillPath\.style\.setProperty\('fill', paint, 'important'\)/);
  assert.match(designerRuntime, /setTemplateFillPaint\(fillPath, getSvgPaint\(group, color, 'fill'\)\)/);
  assert.match(designerRuntime, /scheduleTexturePreviewUpdate\(\)/);
});

test('keeps UV guide outlines out of garment fills and makes the 3D stage full height', () => {
  assert.match(designerRuntime, /fillPath\.setAttribute\('class', 'texture-template-fill'\)/);
  assert.match(designerRuntime, /fillPath\.style\.setProperty\('stroke', 'transparent', 'important'\)/);
  assert.match(designerRuntime, /fillPath\.style\.setProperty\('stroke-width', '0', 'important'\)/);
  assert.match(designerRuntime, /if \(fillPath\.dataset\.persistent === 'true'\)/);
  assert.match(designerRuntime, /fillPath\.setAttribute\('stroke', paint\)/);
  assert.match(designerRuntime, /fillPath\.setAttribute\('stroke-width', '8'\)/);
  assert.match(designerRuntime, /fillPath\.setAttribute\('vector-effect', 'non-scaling-stroke'\)/);
  assert.match(styles, /@media \(min-width: 901px\) \{[\s\S]*?\.design-modal \.preview-3d-panel \{[\s\S]*?height: 100%;[\s\S]*?margin-block: 0;[\s\S]*?padding-block: 0;/);
});

test('provides a compact horizontal artwork library with working import controls', () => {
  assert.match(template, /id="imageAssetTray"/);
  assert.match(template, /id="imageAssetViewport"/);
  assert.match(template, /id="imageAssetUploadInput"[^>]*multiple/);
  assert.match(template, /data-asset-url="\/editor-assets\/botanical-line\.svg"/);
  assert.match(userProjectsRuntime, /async function listImages\(purpose\)/);
  assert.match(userProjectsRuntime, /\/api\/user-images\$\{query\}/);
  assert.match(userContentRoute, /purpose \? ' AND purpose = \?' : ''/);
  assert.match(designerRuntime, /window\.UserProjects\.listImages\('artwork'\)/);
  assert.match(designerRuntime, /createUploadedAssetCard\(dataUrl, file\.name\)[\s\S]*addArtworkFromSource\(dataUrl, button\)[\s\S]*UserProjects\.uploadImage/);
  assert.match(designerRuntime, /is not supported\. Use PNG, JPG, or WebP/);
  assert.match(designerRuntime, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(designerRuntime, /setUploadedAssetState\(button, 'uploading'/);
  assert.match(designerRuntime, /pendingArtworkUploads: new Set\(\)/);
  assert.match(designerRuntime, /await waitForPendingArtworkUploads\(\);[\s\S]*const elements = serializeProjectElements\(\)/);
  assert.match(designerRuntime, /function serializeProjectElements\(\) \{[\s\S]*const wrapper = getCleanElementsClone\(\);[\s\S]*wrapper\.querySelectorAll\('image'\)/);
  assert.doesNotMatch(designerRuntime, /wrapper\.innerHTML = getCleanElementsHtml\(\)/);
  assert.match(template, /id="imageUploadToast"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(designerRuntime, /showImageUploadToast\(`Uploading \$\{file\.name\}…`, 'loading'\)/);
  assert.match(template, /accept="\.png,\.jpg,\.jpeg,\.webp,image\/png,image\/jpeg,image\/webp"/);
  assert.match(designerRuntime, /createUploadedAssetCard\(image\.url, image\.name \|\| 'Uploaded image', image\.url, image\.id\)/);
  assert.match(designerRuntime, /renderedUploadedAssetKeys\.has\(assetKey\)/);
  assert.doesNotMatch(template, /<h3[^>]*>My images<\/h3>/);
  assert.match(designerRuntime, /function setAssetTrayOpen\(open\)/);
  assert.match(designerRuntime, /imageAssetViewport\?\.scrollBy/);
  assert.match(designerRuntime, /function handleArtworkFiles\(files\)/);
  assert.match(designerRuntime, /addArtworkFromSource\(source\)/);
});

test('matches the approved studio composition for tools, preview, and appearance', () => {
  assert.match(template, /class="design-header-history"/);
  assert.doesNotMatch(template, /class="toolbar-group toolbar-history"/);
  assert.match(styles, /\.design-modal \.preview-model-stage \{[\s\S]*?background: transparent;/);
  assert.match(styles, /\.design-modal \.preview-model-stage::before,[\s\S]*?display: none;/);
  assert.match(styles, /\.design-appearance-panel,[\s\S]*?border-radius: 14px;[\s\S]*?background: rgba\(255, 255, 255, 0\.98\)/);
});

test('keeps on-model mockup code, styles, and image maps behind its launch action', () => {
  assert.match(template, /id="modelMockupModal"\s+hidden/s);
  assert.match(template, /data-base-image="<%= modelMockupProfile\.base_image_url %>"/);
  assert.match(template, /data-artwork-center-x="<%= modelMockupProfile\.artwork_center_x %>"/);
  assert.match(template, /link\.href = '\/css\/on-model-mockup\.css\?v=20260821'/);
  assert.match(template, /data-mask-image="<%= modelMockupProfile\.live_mask_url %>"/);
  assert.match(template, /data-mask-fallback="<%= modelMockupProfile\.mask_image_url %>/);
  assert.match(template, /script\.src = '\/js\/on-model-mockup\.js\?v=20260915-direct-events-v3'/);
  assert.match(template, /button\.addEventListener\('click', openStudio\)/);
});

test('keeps AI try-on entry points behind the disabled-by-default feature flag', () => {
  assert.match(template, /const aiTryOnAvailable = typeof aiTryOnEnabled !== 'undefined' && Boolean\(aiTryOnEnabled\)/);
  assert.match(template, /const aiTryOnPath = `\$\{modelDetailPath\}\/try-on`/);
  assert.match(template, /<% if \(aiTryOnAvailable && supportsOnModelMockup && tryOnModels\.length\) \{ %>/);
  assert.match(template, /<h3>Render<\/h3><p>Create a studio-quality product image/);
  assert.match(template, /syncModelTryOnLinks/);
  assert.match(designerRuntime, /persistTryOnDesign/);
  assert.match(designerRuntime, /clozdesign_tryon_design_v1/);
  assert.doesNotMatch(template, /data-ai-tryon-open|id="aiTryOnChooser"|\/js\/model-detail-v2\.js/);
  assert.doesNotMatch(modelDetailStyles, /\.ai-coming-soon-control|\.ai-coming-soon-tooltip/);
});
