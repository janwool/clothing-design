const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views', 'white-mockups.ejs'), 'utf8');
const detailView = fs.readFileSync(path.join(root, 'views', 'white-mockup-detail.ejs'), 'utf8');
const detailEditor = fs.readFileSync(path.join(root, 'public', 'js', 'white-mockup-editor.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'lib', 'on-model-mockups.js'), 'utf8');

test('places the white mockup library beside 3D Models in desktop and mobile navigation', () => {
  assert.match(header, /href="\/mockups"[\s\S]*?3D Models[\s\S]*?href="\/white-mockups"[\s\S]*?White Mockups/);
  assert.equal((header.match(/href="\/white-mockups"/g) || []).length, 2);
});

test('renders the white mockup category page from database asset records', () => {
  assert.match(route, /router\.get\('\/white-mockups'/);
  assert.match(route, /WHITE_MOCKUP_CATEGORIES/);
  assert.match(data, /FROM on_model_mockup_assets a/);
  assert.match(data, /a\.garment_type = \?/);
  assert.match(view, /asset\.base_image_url/);
  assert.match(view, /Upload · place · export/);
  assert.match(view, /href="\/white-mockups\/<%= asset\.asset_name %>"/);
});

test('provides an indexable commercial detail page for every white mockup asset', () => {
  assert.match(route, /router\.get\('\/white-mockups\/:assetName'/);
  assert.match(route, /FAQPage/);
  assert.match(route, /res\.locals\.canonicalUrl = toAbsoluteUrl\(req, path\)/);
  assert.match(data, /findOnModelMockupAsset/);
  assert.match(data, /findRelatedOnModelMockupAssets/);
  assert.match(detailView, /About this mockup/);
  assert.match(detailView, /Related <%= typeLabel\.toLowerCase\(\) %> white mockups/);
});

test('keeps technical maps internal and uses direct canvas transforms', () => {
  assert.doesNotMatch(detailView, /type="range"/);
  assert.doesNotMatch(detailView, /data-map-view|>Mask<|>Depth</);
  assert.match(detailEditor, /canvas\.addEventListener\('pointerdown', beginInteraction\)/);
  assert.match(detailEditor, /mode === 'scale'/);
  assert.match(detailEditor, /mode === 'rotate'/);
  assert.match(detailEditor, /data-background/);
  assert.match(detailEditor, /canvas\.toBlob/);
});

test('offers garment colorways without flattening the mockup shading', () => {
  assert.match(detailView, /Garment color/);
  assert.match(detailView, /data-garment-color="#a8493f"/);
  assert.match(detailView, /id="whiteMockupGarmentColor"/);
  assert.match(detailEditor, /function buildGarmentMask\(\)/);
  assert.match(detailEditor, /function drawGarmentColor\(\)/);
  assert.match(detailEditor, /globalCompositeOperation = 'multiply'/);
  assert.match(detailEditor, /setGarmentColor\(value\)/);
});

test('cache-busts commercial white mockup assets consistently', () => {
  const libraryVersions = [...route.matchAll(/\/css\/white-mockups\.css\?v=([^'"\]]+)/g)]
    .map(match => match[1]);
  assert.ok(libraryVersions.length >= 3);
  assert.equal(new Set(libraryVersions).size, 1);
  assert.match(libraryVersions[0], /^20260825-commercial-v6$/);
  assert.match(route, /\/css\/white-mockup-detail\.css\?v=20260826-commercial-v7/);
  assert.match(detailView, /commercial-refine-v8/);
  assert.match(detailView, /\/js\/white-mockup-editor\.js\?v=20260826-commercial-v8/);
  assert.match(detailView, /class="white-detail-stage-poster"/);
  assert.match(detailView, /fetchpriority="high"/);
  assert.match(detailView, /crossorigin="anonymous"/);
  assert.match(detailView, /data-base-image="<%= editorBaseImageUrl %>"/);
  assert.match(detailView, /src="<%= editorBaseImageUrl %>"/);
  assert.match(detailEditor, /stage\.classList\.add\('is-ready'\)/);
});
