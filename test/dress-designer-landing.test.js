const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const template = read('views', 'dress-designer-landing.ejs');
const stylesheet = read('public', 'css', 'dress-designer-landing.css');
const runtime = read('public', 'js', 'dress-designer-landing.js');
const routes = read('routes', 'index.js');

test('uses a dedicated SEO landing page for the dress designer', () => {
  assert.match(routes, /req\.params\.slug === 'dress-designer'/);
  assert.match(routes, /\? 'dress-designer-landing'/);
  assert.match(routes, /dress-designer-landing\.css/);
  assert.match(routes, /Free Online Dress Designer – Create 3D Dress Mockups/);
  assert.match(template, /Design a Dress[\s\S]*Online in 3D/);
  assert.match(template, /How to Design a Dress Online/);
  assert.match(template, /Online Dress Designer FAQ/);
  assert.doesNotMatch(template, /tool-detail-hero|tool-quick-editor/);
});

test('uses live database dress models instead of generated campaign imagery', () => {
  assert.match(routes, /getActiveDressModelStarters/);
  assert.match(routes, /classic-one-piece-dress-3d-model/);
  assert.match(routes, /tailored-one-piece-dress-3d-model/);
  assert.match(routes, /layered-one-piece-dress-3d-model/);
  assert.match(routes, /minimal-one-piece-dress-3d-model/);
  assert.match(template, /toolPage\.modelStarters/);
  assert.match(template, /model\.image/);
  assert.doesNotMatch(template, /\/images\/dress-designer\/(?:atelier-hero|collection-board)/);
});

test('keeps the 3D preview lazy and supports core studio controls', () => {
  assert.match(template, /<model-viewer[\s\S]*?data-model-src=[\s\S]*?hidden/);
  assert.match(template, /id="dressLoadModel"/);
  assert.match(template, /data-color=/);
  assert.match(template, /data-material=/);
  assert.match(template, /data-orbit=/);
  assert.match(template, /data-exposure=/);
  assert.match(template, /id="dressExportPreview"/);
  assert.match(runtime, /model-viewer\.min\.js/);
  assert.match(runtime, /setBaseColorFactor/);
  assert.match(runtime, /setRoughnessFactor/);
  assert.match(runtime, /viewer\.cameraOrbit = orbit/);
  assert.match(runtime, /viewer\.toDataURL\('image\/png'\)/);
});

test('adds model ItemList structured data for search engines', () => {
  assert.match(routes, /'@type': 'ItemList'/);
  assert.match(routes, /itemListElement/);
  assert.match(routes, /toolPage\.modelStarters/);
});

test('covers the complete conversion journey and responsive behavior', () => {
  const sections = [
    'dress-hero',
    'dress-studio-section',
    'dress-models-section',
    'dress-capabilities-section',
    'dress-workflow-section',
    'dress-audience-faq-section',
    'dress-final-cta'
  ];
  sections.reduce((lastIndex, section) => {
    const nextIndex = template.indexOf(section);
    assert.ok(nextIndex > lastIndex, `${section} should appear in order`);
    return nextIndex;
  }, -1);
  assert.match(stylesheet, /@media \(max-width: 820px\)/);
  assert.match(stylesheet, /@media \(max-width: 560px\)/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});
