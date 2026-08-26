const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations', '0002_on_model_mockup_profiles.sql'), 'utf8');
const assetMigration = fs.readFileSync(path.join(root, 'migrations', '0003_on_model_mockup_assets.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'scripts', 'seed-on-model-mockups.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'public', 'js', 'on-model-mockup.js'), 'utf8');
const whiteMockupRuntime = fs.readFileSync(path.join(root, 'public', 'js', 'white-mockup-editor.js'), 'utf8');
const assetData = fs.readFileSync(path.join(root, 'lib', 'on-model-mockups.js'), 'utf8');
const assetUploader = fs.readFileSync(path.join(root, 'scripts', 'upload-on-model-mockups-r2.js'), 'utf8');
const d1SeedGenerator = fs.readFileSync(path.join(root, 'scripts', 'generate-on-model-mockup-d1-seed.js'), 'utf8');
const maskRefinement = fs.readFileSync(path.join(root, 'scripts', 'refine-on-model-mockup-masks.py'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'config', 'on-model-mockup-assets.json'), 'utf8')
);

test('stores on-model mockup asset URLs and placement settings in a dedicated table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS on_model_mockup_profiles/);
  assert.match(migration, /base_image_url TEXT NOT NULL/);
  assert.match(migration, /artwork_center_x INTEGER NOT NULL/);
  assert.match(migration, /render_bottom INTEGER NOT NULL/);
  assert.match(migration, /model_id INTEGER NOT NULL UNIQUE/);
});

test('seeds thirty representative garment mockup types', () => {
  const slugs = [
    'classic-crew-neck-t-shirt-3d-model',
    'short-sleeve-polo-shirt-3d-model',
    'long-sleeve-crewneck-shirt-3d-model',
    'classic-pullover-hoodie-3d-model',
    'relaxed-button-shirt-3d-model',
    'classic-one-piece-dress-3d-model',
    'tailored-sleeveless-tank-top-3d-model',
    'fitted-button-front-womens-blouse-3d-model',
    'classic-trench-coat-3d-model',
    'clean-puffer-jacket-3d-model',
    'tailored-pants-3d-model',
    'classic-skirt-3d-model',
    'tailored-open-front-blazer-3d-model',
    'classic-leather-jacket-3d-model',
    'long-sleeve-turtleneck-top-3d-model',
    'puff-sleeve-button-blouse-3d-model',
    'oversized-utility-shirt-dress-3d-model',
    'relaxed-pants-3d-model',
    'quarter-zip-long-sleeve-top-3d-model',
    'henley-roll-sleeve-shirt-3d-garment-model',
    'belted-womens-shirt-jacket-3d-model',
    'layered-skirt-3d-model',
    'classic-long-coat-3d-model',
    'structured-blazer-garment-3d-model',
    'short-sleeve-panel-tee-3d-garment-model',
    'tie-neck-womens-blouse-3d-model',
    'lightweight-trench-coat-3d-model',
    'structured-pants-3d-model',
    'modern-one-piece-dress-3d-model',
    'longline-blazer-garment-3d-model'
  ];
  slugs.forEach(slug => assert.match(seed, new RegExp(slug)));
  assert.match(seed, /ON CONFLICT\(model_id\) DO UPDATE SET/);
});

test('uses database-provided placement and export settings at render time', () => {
  assert.match(runtime, /modal\.dataset\.artworkCenterX/);
  assert.match(runtime, /modal\.dataset\.renderBottom/);
  assert.match(runtime, /template\.exportSlug/);
  assert.doesNotMatch(runtime, /on-model-tshirt-mockup\.png/);
});

test('keeps soft mask edges inside the garment to prevent color spill', () => {
  assert.match(whiteMockupRuntime, /function maskOpacityAt\(index\)/);
  assert.match(whiteMockupRuntime, /alpha <= 0\.14/);
  assert.match(whiteMockupRuntime, /\(alpha - 0\.14\) \/ 0\.70/);
  assert.match(whiteMockupRuntime, /normalized \* normalized \* \(3 - 2 \* normalized\)/);
  assert.match(whiteMockupRuntime, /maskOpacityAt\(index\)/);
});

test('feathers refined mask contours enough to remove raster stair steps', () => {
  assert.match(maskRefinement, /sigmaX=1\.5/);
  assert.match(maskRefinement, /commercial-refine-v9/);
  assert.doesNotMatch(maskRefinement, /GUIDED_CUTOUTS|apply_reviewed_cutouts/);
});

test('indexes every generated image set while keeping one preferred profile per 3D model', () => {
  assert.match(assetMigration, /CREATE TABLE IF NOT EXISTS on_model_mockup_assets/);
  assert.match(assetMigration, /asset_name TEXT NOT NULL UNIQUE/);
  assert.match(assetMigration, /generation_method TEXT NOT NULL/);
  assert.equal(manifest.assets.length, 238);
  assert.equal(new Set(manifest.assets.map(asset => asset.assetName)).size, 238);
  const preferred = manifest.assets.filter(asset => asset.preferredForModel);
  assert.equal(preferred.length, 116);
  assert.equal(new Set(preferred.map(asset => asset.modelId)).size, 116);
  manifest.assets.forEach(asset => {
    assert.ok(asset.canvasWidth > 0 && asset.canvasHeight > 0);
    assert.equal(asset.artwork.length, 4);
    assert.equal(asset.render.length, 4);
    assert.match(asset.maskImageUrl, /-mask\.png$/);
    assert.match(asset.depthImageUrl, /-depth\.png$/);
    assert.match(asset.method, /commercial-refine-v3/);
    assert.ok(asset.coverage > 0 && asset.coverage < 0.85);
  });
  assert.match(seed, /on_model_mockup_assets/);
  assert.match(seed, /preferredForModel/);
});

test('serves generated mockup maps from their verified R2 asset path', () => {
  assert.match(assetData, /https:\/\/cdn\.cloz-design\.com/);
  assert.match(assetData, /\/image\/mockups\/on-model\/generated\//);
  assert.match(runtime, /image\.crossOrigin = 'anonymous'/);
  assert.match(whiteMockupRuntime, /image\.crossOrigin = 'anonymous'/);
  assert.match(assetUploader, /HeadObjectCommand/);
  assert.match(assetUploader, /Remote verification failed/);
  assert.match(assetUploader, /socketTimeout: 60_000/);
  assert.match(assetUploader, /mapsOnly/);
});

test('builds an idempotent production D1 seed using model slugs instead of local ids', () => {
  assert.match(d1SeedGenerator, /SELECT id FROM models_3d WHERE slug=/);
  assert.match(d1SeedGenerator, /ON CONFLICT\(asset_name\) DO UPDATE SET/);
  assert.match(d1SeedGenerator, /ON CONFLICT\(model_id\) DO UPDATE SET/);
  assert.match(d1SeedGenerator, /migrations.*0002_on_model_mockup_profiles\.sql/);
  assert.match(d1SeedGenerator, /migrations.*0003_on_model_mockup_assets\.sql/);
});
