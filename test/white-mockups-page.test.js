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

test('places the fashion mockup library beside 3D Models in desktop and mobile navigation', () => {
  assert.match(header, /href="\/mockups"[\s\S]*?3D Models[\s\S]*?href="\/white-mockups"[\s\S]*?Fashion Mockups/);
  assert.equal((header.match(/href="\/white-mockups"/g) || []).length, 2);
});

test('renders the white mockup category page from database asset records', () => {
  assert.match(route, /router\.get\('\/white-mockups'/);
  assert.match(route, /WHITE_MOCKUP_CATEGORIES/);
  assert.match(data, /FROM on_model_mockup_assets a/);
  assert.match(data, /a\.garment_type = \?/);
  assert.match(view, /asset\.base_image_url/);
  assert.match(view, /Fashion mockups\. Add your design\./);
  assert.match(view, /Fashion mockup categories/);
  assert.match(view, /white-catalog-grid/);
  assert.match(view, /href="\/white-mockups\/<%= asset\.asset_name %>"/);
});

test('provides an indexable commercial detail page for every white mockup asset', () => {
  assert.match(route, /router\.get\('\/white-mockups\/:assetName'/);
  assert.match(route, /FAQPage/);
  assert.match(route, /res\.locals\.canonicalUrl = toAbsoluteUrl\(req, path\)/);
  assert.match(data, /findOnModelMockupAsset/);
  assert.match(data, /findRelatedOnModelMockupAssets/);
  assert.match(detailView, /About this mockup/);
  assert.match(detailView, /Related <%= typeLabel\.toLowerCase\(\) %> fashion mockups/);
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

test('tracks the white mockup detail funnel with dedicated event names', () => {
  assert.match(detailEditor, /white_mockup_editor_ready/);
  assert.match(detailEditor, /white_mockup_artwork_\$\{source\}_select/);
  assert.match(detailEditor, /white_mockup_artwork_\$\{completedInteraction\.mode\}_complete/);
  assert.match(detailEditor, /white_mockup_bg_\$\{button\.dataset\.label\}_select/);
  assert.match(detailEditor, /white_mockup_color_\$\{button\.dataset\.label\}_select/);
  assert.match(detailEditor, /white_mockup_project_\$\{saveMode\}_success/);
  assert.match(detailEditor, /white_mockup_png_download_success/);
  assert.match(detailView, /id="whiteMockupToolbarUpload"[^>]+data-analytics-managed="true"/);
  assert.doesNotMatch(detailView, /whiteMockupUploadZone|whiteMockupAddImages/);
  assert.doesNotMatch(detailView, /whiteMockupSave|Save project/);
  assert.match(detailView, /id="whiteMockupDownload" data-analytics-managed="true"/);
  assert.match(detailView, /data-analytics-event="white_mockup_detail_breadcrumb_home_click"/);
  assert.match(detailView, /data-analytics-event="white_mockup_detail_breadcrumb_library_click"/);
  assert.match(detailView, /data-analytics-event="white_mockup_detail_faq_toggle"/);
  assert.match(detailView, /data-analytics-name="<%= item\.question %>"/);
  assert.match(detailView, /data-analytics-event="white_mockup_detail_related_view_all_click"/);
  assert.match(detailView, /data-analytics-event="white_mockup_detail_related_select"/);
  assert.match(detailView, /data-id="<%= item\.asset_name %>"/);
});

test('requires a paid subscription before either Fashion Mockups download control exports', () => {
  assert.match(detailView, /id="whiteMockupToolbarDownload"[^>]+aria-describedby="whiteMockupDownloadRequirement"/);
  assert.match(detailView, /id="whiteMockupDownload"[^>]+aria-describedby="whiteMockupDownloadRequirement"/);
  assert.match(detailView, /id="whiteMockupDownloadRequirement">Pro required to download/);
  assert.match(detailEditor, /downloadButton\.addEventListener\('click', downloadMockup\)/);
  assert.match(detailEditor, /toolbarDownload\.addEventListener\('click', downloadMockup\)/);
  assert.match(detailEditor, /async function downloadMockup\(\) \{\s*if \(!await window\.ExportEntitlements\?\.requireExportAccess\(\)\) return;/);
});

test('offers garment colorways without flattening the mockup shading', () => {
  assert.match(detailView, /Garment color/);
  assert.match(detailView, /data-garment-color="#a8493f"/);
  assert.match(detailView, /id="whiteMockupGarmentColor"/);
  assert.match(detailEditor, /function buildGarmentMask\(\)/);
  assert.match(detailEditor, /function drawGarmentColor\(\)/);
  assert.match(detailEditor, /globalCompositeOperation = 'multiply'/);
  assert.match(detailEditor, /setGarmentColor\(value\)/);
  assert.match(data, /result\.svg_mask_url = `\/api\/on-model-svg-masks\//);
  assert.match(data, /result\.live_mask_url = result\.svg_mask_url \|\| result\.mask_image_url/);
  assert.match(detailView, /data-mask-image="<%= asset\.live_mask_url %>"/);
  assert.match(detailView, /data-mask-fallback="<%= rasterMaskFallbackUrl %>"/);
  assert.match(detailEditor, /function loadRealtimeMask\(\)/);
  assert.match(detailEditor, /loadRealtimeMask\(\)/);
});

test('cache-busts commercial white mockup assets consistently', () => {
  const libraryVersions = [...route.matchAll(/\/css\/white-mockups\.css\?v=([^'"\]]+)/g)]
    .map(match => match[1]);
  assert.ok(libraryVersions.length >= 3);
  assert.equal(new Set(libraryVersions).size, 1);
  assert.match(libraryVersions[0], /^20260926-hero-gif-v5$/);
  assert.match(route, /\/css\/white-mockup-detail\.css\?v=20261004-artworks-left-v3/);
  assert.match(detailView, /commercial-refine-v10/);
  assert.match(detailView, /\/js\/white-mockup-editor\.js\?v=20261004-gradient-v2/);
  assert.match(detailView, /class="white-detail-stage-poster"/);
  assert.match(detailView, /fetchpriority="high"/);
  assert.match(detailView, /crossorigin="anonymous"/);
  assert.match(detailView, /data-base-image="<%= editorBaseImageUrl %>"/);
  assert.match(detailView, /src="<%= editorBaseImageUrl %>"/);
  assert.match(detailEditor, /stage\.classList\.add\('is-ready'\)/);
});

test('saves multiple uploaded images and their independent transforms', () => {
  assert.doesNotMatch(detailEditor, /getElementById\('whiteMockupSave'\)/);
  assert.match(detailView, /id="whiteMockupArtworkInput"[^>]+multiple/);
  assert.match(detailView, /id="whiteMockupArtworkList"/);
  assert.match(detailEditor, /state\.layers\.forEach\(layer =>/);
  assert.match(detailEditor, /artworks: state\.layers\.map\(layer =>/);
  assert.match(detailEditor, /Array\.isArray\(saved\.artworks\)/);
  assert.match(detailEditor, /removeArtworkLayer\(layer\.id\)/);
  assert.match(detailEditor, /queueProjectSave\(\{ immediate: true \}\)/);
  assert.match(detailEditor, /Added automatically to your projects\./);
});

test('places the artwork list beside the preview instead of in the settings panel', () => {
  const preview = detailView.match(/<div class="white-detail-preview-layout">([\s\S]*?)<\/div>\s*<\/div>\s*<aside class="white-detail-purchase"/);
  assert.ok(preview);
  assert.match(preview[1], /id="whiteMockupArtworks"[\s\S]*id="whiteMockupStage"/);
  assert.doesNotMatch(detailView.split('<aside class="white-detail-purchase"')[1], /id="whiteMockupArtworks"/);
});
