const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'views', 'tshirt-generator-landing.ejs'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'public', 'css', 'tshirt-generator-landing.css'), 'utf8');
const carousel = fs.readFileSync(path.join(root, 'public', 'js', 'tshirt-generator-landing.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');

test('uses a dedicated landing page for the T-shirt generator only', () => {
  assert.match(routes, /req\.params\.slug === 't-shirt-mockup-generator'[\s\S]*?'tshirt-generator-landing'[\s\S]*?: 'tool-detail'/);
  assert.match(template, /Design your next<br>T-shirt in 3D\./);
  assert.doesNotMatch(template, /tool-detail-hero|tool-quick-editor|keywordClusters/);
});

test('keeps one aligned page shell and the approved concise section order', () => {
  assert.match(stylesheet, /\.tmg-shell\s*\{[\s\S]*?1200px/);
  const sections = [
    'tmg-hero',
    'tmg-fit-section',
    'tmg-workflow',
    'tmg-use-cases',
    'tmg-faq',
    'tmg-final-wrap'
  ];
  sections.reduce((previousIndex, section) => {
    const index = template.indexOf(section);
    assert.ok(index > previousIndex, `${section} should appear in the approved order`);
    return index;
  }, -1);
});

test('preloads every real 3D model in one transparent animated carousel', () => {
  assert.match(template, /<model-viewer[\s\S]*?camera-controls[\s\S]*?<\/model-viewer>/);
  assert.match(template, /tshirtModels\.forEach[\s\S]*?class="tmg-model-viewer"[\s\S]*?src="<%= model\.modelSrc %>"/);
  assert.match(template, /loading="eager"/);
  assert.match(template, /\/vendor\/model-viewer\/model-viewer\.min\.js/);
  assert.match(template, /data-tmg-prev/);
  assert.match(template, /data-tmg-next/);
  assert.match(carousel, /slides\.forEach/);
  assert.match(carousel, /slide\.dataset\.position = slidePosition/);
  assert.doesNotMatch(carousel, /setAttribute\('src'/);
  assert.match(stylesheet, /\.tmg-model-panel\s*\{[\s\S]*?background: transparent/);
  assert.match(stylesheet, /\.tmg-model-stage\s*\{[\s\S]*?background: transparent !important/);
  assert.match(stylesheet, /\.tmg-model-viewer\s*\{[\s\S]*?background: transparent !important/);
  assert.match(stylesheet, /transform 620ms cubic-bezier/);
  assert.doesNotMatch(template, /slot="poster"|tmg-model-peek/);
  assert.doesNotMatch(template, /Retry interactive 3D|Load interactive 3D/);
});

test('keeps the named basic-tee CTA fixed while generic editor CTAs follow the carousel', () => {
  assert.match(template, /class="tmg-button tmg-button-dark" href="<%= firstModel\.href %>#design">[\s\S]*?Start with the basic tee/);
  assert.match(template, /class="tmg-button tmg-button-light" href="\/mockups\/t-shirt-mockup">Explore all fits<\/a>/);
  assert.equal((template.match(/tmg-editor-link/g) || []).length, 2);
  assert.match(carousel, /editorLinks\.forEach/);
});

test('uses the four real T-shirt model routes and matching previews', () => {
  [
    'basic-short-sleeve-tshirt-3d-model',
    'oversized-crew-neck-t-shirt-mockup-with-drop-shoulder-fit',
    'short-sleeve-polo-shirt-3d-model',
    'long-sleeve-crewneck-shirt-3d-model'
  ].forEach(slug => {
    assert.match(routes, new RegExp(slug));
  });
  assert.match(routes, /20260828-commercial-covers-v1/);
  assert.match(routes, /shouldUseLocalModelAssets\(req\)[\s\S]*?public', 'uploads', 'glb'/);
});

test('uses generated garment photography instead of programmatic workflow artwork', () => {
  [
    'tshirt-workflow-studio.webp',
    'tshirt-pod-listing.webp',
    'tshirt-streetwear-review.webp',
    'tshirt-front-back-approval.webp'
  ].forEach(file => {
    assert.match(template, new RegExp(`/images/mockups/generated/${file.replace('.', '\\.')}`));
    assert.ok(fs.existsSync(path.join(root, 'public', 'images', 'mockups', 'generated', file)));
  });
  assert.doesNotMatch(template, /tmg-artwork-sample|tmg-workflow-arrow|toolPage\.visualGallery/);
  assert.doesNotMatch(stylesheet, /tmg-artwork-sample|tmg-workflow-image-export/);
});
