const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const template = read('views', '3d-clothing-mockup-landing.ejs');
const stylesheet = read('public', 'css', '3d-clothing-mockup-landing.css');
const routes = read('routes', 'index.js');

test('uses a dedicated commercial landing page for the 3D clothing generator', () => {
  assert.match(routes, /req\.params\.slug === '3d-clothing-mockup-generator'[\s\S]*?'3d-clothing-mockup-landing'/);
  assert.match(template, /Design clothing in 3D\.[\s\S]*?Launch with confidence\./);
  assert.match(template, /One studio\. Every garment\./);
  assert.match(template, /From blank garment to campaign-ready\./);
  assert.match(template, /Made for the way fashion teams work\./);
});

test('keeps the hero interactive and connected to the full editor', () => {
  assert.match(template, /id="toolHeroModelViewer"/);
  assert.match(template, /environment-image="\/environments\/commercial-apparel-studio-v5-front-white-20260917\.hdr"/);
  assert.match(template, /data-camera-relative-studio-light="\/environments\/commercial-apparel-studio-v5-front-white-20260917\.hdr"/);
  assert.match(template, /data-color=/);
  assert.match(template, /data-orbit=/);
  assert.match(template, /id="toolArtworkUpload"/);
  assert.match(template, /id="toolDownloadPreview"/);
  assert.match(template, /sessionStorage\.setItem\('clothingdesign_pending_artwork'/);
});

test('uses commercial garment and fashion-team imagery instead of text-only cards', () => {
  [
    '/images/categories/t-shirt-mockup.webp',
    '/images/categories/hoodie-mockup.webp',
    '/images/categories/jacket.webp',
    '/images/categories/dress.webp',
    '/images/editorial/apparel-designer-studio.webp',
    '/images/editorial/garment-team-review.webp',
    '/images/hero/apparel-design-hero-v3.webp'
  ].forEach((asset) => assert.match(template, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(stylesheet, /\.cmg-category-grid/);
  assert.match(stylesheet, /\.cmg-team-gallery/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
});
