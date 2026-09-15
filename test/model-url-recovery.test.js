const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'index.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');

test('recovers old one-segment model URLs before treating them as categories', () => {
  assert.match(
    indexSource,
    /router\.get\('\/3d-models\/:slug',[\s\S]*?findHistorical3dModelBySlug\(req\.params\.slug\)[\s\S]*?redirectHistorical3dModel/
  );
});

test('recovers model slugs that were previously redirected into mockups URLs', () => {
  assert.match(
    indexSource,
    /router\.get\('\/mockups\/:slug',[\s\S]*?if \(!category\)[\s\S]*?findHistorical3dModelBySlug\(req\.params\.slug\)[\s\S]*?redirectHistorical3dModel/
  );
});

test('retired model URLs fall back to an active category instead of a 404', () => {
  assert.match(
    indexSource,
    /async function redirectHistorical3dModel[\s\S]*?model\.status === 'active'[\s\S]*?activeCategory \? `\/mockups\/\$\{activeCategory\.slug\}` : '\/mockups'/
  );
});

test('retired three-segment model detail URLs use the historical fallback', () => {
  assert.match(
    indexSource,
    /router\.get\('\/3d-models\/:category\/:slug',[\s\S]*?if \(!model\)[\s\S]*?findHistorical3dModelBySlug\(req\.params\.slug\)[\s\S]*?redirectHistorical3dModel/
  );
});

test('admin slug changes preserve the old model URL', () => {
  assert.match(
    adminSource,
    /existingModel\.slug !== nextSlug[\s\S]*?INSERT INTO model_3d_slug_redirects \(old_slug, model_id\)[\s\S]*?ON CONFLICT\(old_slug\) DO UPDATE/
  );
});
