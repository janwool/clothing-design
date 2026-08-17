const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(root, 'routes', 'auth.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'views', 'partials', 'footer.ejs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');
const pricing = fs.readFileSync(path.join(root, 'views', 'pricing.ejs'), 'utf8');
const modelDetail = fs.readFileSync(path.join(root, 'views', 'model-detail.ejs'), 'utf8');
const designer = fs.readFileSync(path.join(root, 'public', 'js', 'model-designer.js'), 'utf8');

test('routes public calls to action into a working mockup path', () => {
  assert.match(header, /href="\/tools\/t-shirt-mockup-generator" class="btn btn-primary">Start designing/);
  assert.match(home, /basic-short-sleeve-tshirt-3d-model#design/);
  assert.doesNotMatch(header, /\/dashboard\/(?:designs|assets|settings)/);
  assert.match(authRoute, /res\.redirect\('\/tools\/t-shirt-mockup-generator'\)/);
});

test('only promises the currently available free public beta', () => {
  assert.match(pricing, /free while the browser mockup workflow is in public beta/i);
  assert.match(pricing, /No payment details are requested/);
  assert.doesNotMatch(pricing, /\$29|\$99|API access|Team collaboration/);
  assert.match(route, /name: 'Free public beta', price: '0'/);
});

test('provides live trust routes linked from the footer', () => {
  assert.match(route, /router\.get\('\/contact'/);
  assert.match(route, /router\.get\('\/privacy'/);
  assert.match(route, /router\.get\('\/terms'/);
  assert.match(footer, /href="\/contact"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
});

test('uses accurate non-persistent editor language and a clear primary action', () => {
  assert.match(modelDetail, /Customize this model/);
  assert.match(modelDetail, /Export transparent PNG/);
  assert.match(modelDetail, /designSaveStatusText">Ready/);
  assert.doesNotMatch(designer, /Unsaved changes/);
  assert.match(designer, /setDesignSaveStatus\('Applied'\)/);
  assert.match(route, /replace\(\/transparent WebP image\/gi, 'transparent PNG image'\)/);
});
