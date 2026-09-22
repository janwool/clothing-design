const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeModelResult, TRY_ON_MODEL } = require('../lib/cloudflare-try-on');
const { isAiTryOnEnabled } = require('../lib/feature-flags');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('enables AI try-on by default and respects an explicit kill switch', () => {
  const previousValue = process.env.AI_TRY_ON_ENABLED;
  delete process.env.AI_TRY_ON_ENABLED;
  assert.equal(isAiTryOnEnabled(), true);
  process.env.AI_TRY_ON_ENABLED = 'false';
  assert.equal(isAiTryOnEnabled(), false);
  process.env.AI_TRY_ON_ENABLED = 'true';
  assert.equal(isAiTryOnEnabled(), true);
  if (previousValue === undefined) delete process.env.AI_TRY_ON_ENABLED;
  else process.env.AI_TRY_ON_ENABLED = previousValue;

  const route = read('routes/ai-try-on.js');
  const pageRoute = read('routes/index.js');
  assert.match(route, /router\.use\(\(req, res, next\) => \{\s+if \(isAiTryOnEnabled\(\)\) return next\(\);/);
  assert.match(route, /status\(503\).*AI try-on is temporarily unavailable/s);
  assert.match(pageRoute, /router\.get\('\/3d-models\/:category\/:slug\/try-on'[\s\S]*?if \(!isAiTryOnEnabled\(\)\)[\s\S]*?status\(404\)/);
});

test('uses Cloudflare dedicated virtual try-on without exposing credentials to the browser', () => {
  assert.equal(TRY_ON_MODEL, 'pruna/p-image-try-on');

  const appCore = read('app-core.js');
  const route = read('routes/ai-try-on.js');
  const browser = read('public/js/ai-try-on.js');
  const integration = read('lib/cloudflare-try-on.js');
  const wrangler = read('wrangler.toml');

  assert.match(appCore, /app\.use\('\/api\/ai-try-on'/);
  assert.match(route, /runCloudflareTryOn/);
  assert.match(route, /data:image\\\/\(\?:png\|jpeg\|webp\)/);
  assert.match(route, /saveTryOnResult\(req\.session\.user\.id, result\.image/);
  assert.match(route, /try-on-result/);
  assert.match(route, /INSERT INTO user_images/);
  assert.match(route, /INSERT INTO ai_try_on_results/);
  assert.match(route, /router\.get\('\/results'/);
  assert.match(route, /source_project_id/);
  assert.match(route, /image: savedResult\?\.url \|\| result\.image/);
  assert.match(route, /if \(!generationCompleted && creditReservation\?\.reservation\)/);
  assert.match(browser, /fetch\('\/api\/ai-try-on'/);
  assert.match(browser, /captureGarmentImage/);
  assert.match(browser, /modelName: root\.dataset\.modelName/);
  assert.match(browser, /projectId: new URLSearchParams\(window\.location\.search\)\.get\('project'\)/);
  assert.match(browser, /personModelId: selectedModel\.dataset\.modelId/);
  assert.match(browser, /personModelName: selectedModel\.dataset\.modelName/);
  assert.match(integration, /output_quality: 92/);
  assert.doesNotMatch(integration, /\n\s+quality:/);
  assert.match(integration, /uploadImageDataUrl\(personImage/);
  assert.match(integration, /uploadImageDataUrl\(garmentImage/);
  assert.match(integration, /person_image: storedPerson\.url/);
  assert.match(integration, /garment_images: \[storedGarment\.url\]/);
  assert.match(integration, /Promise\.all\(uploadedInputs\.map\(key => deleteObject\(key\)\.catch/);
  assert.match(integration, /body: JSON\.stringify\(\{ model: TRY_ON_MODEL, input \}\)/);
  assert.match(integration, /ai\.run\(TRY_ON_MODEL, input\)/);
  assert.doesNotMatch(browser, /CF_(?:AI_)?API_TOKEN|Authorization:\s*`Bearer/);
  assert.match(wrangler, /\[ai\]\s+binding = "AI"/);
});

test('normalizes Cloudflare binding and REST response envelopes', () => {
  assert.equal(
    normalizeModelResult({ state: 'Completed', result: { image: 'https://example.com/result.webp' } }),
    'https://example.com/result.webp'
  );
  assert.equal(
    normalizeModelResult({ success: true, result: { state: 'Completed', result: { image: 'data:image/webp;base64,AAAA' } } }),
    'data:image/webp;base64,AAAA'
  );
  assert.throws(
    () => normalizeModelResult({ success: false, errors: [{ message: 'Insufficient balance' }] }),
    /Insufficient balance/
  );
});

test('keeps the try-on page focused on 3D design and full-body model selection', () => {
  const view = read('views/ai-try-on.ejs');
  const designerView = read('views/designer-3d.ejs');
  const styles = read('public/css/ai-try-on.css');
  assert.match(view, /<model-viewer/);
  assert.doesNotMatch(view, /\sauto-rotate(?:\s|=)/);
  assert.doesNotMatch(view, /rotation-per-second/);
  assert.match(view, /Your design/);
  assert.match(view, /Choose a model/);
  assert.doesNotMatch(view, /Back to 3D|const editHref/);
  assert.match(view, /full-body model/);
  assert.match(view, /data-garment-fallback/);
  assert.match(view, /data-model-id/);
  assert.match(view, /data-model-slug/);
  assert.match(view, /data-texture-template-url/);
  assert.match(view, /data-fit="contain"/);
  assert.match(view, /class="is-active" data-preview-state="before"/);
  assert.doesNotMatch(view, /tryon-result__wash/);
  assert.match(view, /data-preview-state="after" data-after-result hidden/);
  assert.match(view, /class="tryon-result__ai-label" data-after-result hidden/);
  assert.match(view, /alt="<%= tryOnModels\[0\]\.name %>, selected model for AI try-on"/);
  assert.doesNotMatch(view, /tryOnModels\[0\]\.name %> wearing/);
  assert.match(view, /id="downloadTryOn" disabled aria-disabled="true"/);
  assert.match(read('public/js/ai-try-on.js'), /if \(state === 'after' && !generatedImageUrl\) state = 'before'/);
  assert.match(read('public/js/ai-try-on.js'), /setResultAvailability\(true\);\s*setPreviewState\('after'\)/);
  assert.match(read('public/js/ai-try-on.js'), /loadProjectFromUrl\('3d'\)/);
  assert.match(read('public/js/ai-try-on.js'), /clozdesign_tryon_design_v1/);
  assert.match(designerView, /id="designerAiTryOn"/);
  assert.match(designerView, /<% if \(aiTryOnAvailable\) \{ %><a class="btn btn-secondary btn-small" id="designerAiTryOn"/);
  assert.match(designerView, /persistDesignerTryOnDesign/);
  assert.match(designerView, /appearance: getDesignerProjectData\(\)/);
  assert.match(designerView, /applyDesignerAppearance/);
  const designerDecoder = designerView.indexOf("window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0'");
  const designerViewerModule = designerView.indexOf('<script type="module" src="/vendor/model-viewer/model-viewer.min.js?v=4.3.1"></script>');
  assert.ok(designerDecoder >= 0);
  assert.ok(designerViewerModule > designerDecoder);
  assert.doesNotMatch(designerView, /unpkg\.com\/@google\/model-viewer/);
  assert.match(read('public/js/ai-try-on.js'), /\/api\/project-texture\?url=/);
  assert.match(read('public/js/ai-try-on.js'), /setBaseColorFactor\?\.\(\[1, 1, 1, 1\]\)/);
  assert.match(read('public/js/ai-try-on.js'), /designLoadPromise = loadCurrentDesign\(\)/);
  assert.match(read('public/js/ai-try-on.js'), /await designLoadPromise;[\s\S]*captureGarmentImage/);
  assert.match(read('public/js/ai-try-on.js'), /viewer\.autoRotate = false/);
  assert.doesNotMatch(read('public/js/ai-try-on.js'), /viewer\.autoRotate = true/);
  assert.match(styles, /\.ai-tryon \{[\s\S]*?width: 100vw;[\s\S]*?height: 100dvh;[\s\S]*?margin: 0;/);
  assert.match(styles, /\.tryon-result__image \{[\s\S]*?object-fit: contain;/);
  assert.doesNotMatch(styles, /\.tryon-result__image\.is-before|filter:\s*saturate/);
  assert.doesNotMatch(view, /Try-on settings|Styling notes/);
});

test('enables the Meshopt decoder before loading the Try-on model viewer', () => {
  const view = read('views/ai-try-on.ejs');
  const decoderAssignment = view.indexOf("window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0'");
  const viewerModule = view.indexOf('<script type="module" src="/vendor/model-viewer/model-viewer.min.js?v=4.3.1"></script>');

  assert.ok(decoderAssignment >= 0);
  assert.ok(viewerModule > decoderAssignment);
  assert.match(view, /poster="<%= model\.image_url \|\| '' %>"/);
});
