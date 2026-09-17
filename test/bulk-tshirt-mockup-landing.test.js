const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const template = read('views', 'bulk-tshirt-mockup-landing.ejs');
const stylesheet = read('public', 'css', 'bulk-tshirt-mockup-landing.css');
const routes = read('routes', 'index.js');

test('uses the dedicated commercial landing page for the bulk T-shirt generator', () => {
  assert.match(routes, /req\.params\.slug === 'bulk-t-shirt-mockup-generator'[\s\S]*?'bulk-tshirt-mockup-landing'/);
  assert.match(template, /One design\.[\s\S]*?Every colorway\./);
  assert.match(template, /Build the set once\./);
  assert.match(template, /One catalog\.[\s\S]*?Zero visual drift\./);
  assert.match(template, /Made for the places you sell\./);
});

test('uses generated commercial photography as the primary product storytelling', () => {
  [
    'colorway-hero.webp',
    'catalog-lineup.webp',
    'folded-colorways.webp'
  ].forEach((file) => {
    assert.match(template, new RegExp(`/images/bulk-tshirt/${file.replace('.', '\\.')}`));
    assert.ok(fs.existsSync(path.join(root, 'public', 'images', 'bulk-tshirt', file)));
  });
  assert.match(stylesheet, /\.btg-channel-grid/);
  assert.match(stylesheet, /\.btg-review-photo/);
});

test('keeps upload, color focus, and PNG export controls functional', () => {
  assert.match(template, /id="btgHeroUpload"/);
  assert.match(template, /data-btg-color=/);
  assert.match(template, /id="btgExportSheet"/);
  assert.match(template, /sessionStorage\.setItem\('clothingdesign_pending_artwork'/);
  assert.match(template, /canvas\.toBlob/);
  assert.match(template, /clozdesign-tshirt-colorway-sheet\.png/);
});

test('includes responsive layouts for the commercial batch UI', () => {
  assert.match(stylesheet, /@media \(max-width: 980px\)/);
  assert.match(stylesheet, /@media \(max-width: 700px\)/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});
