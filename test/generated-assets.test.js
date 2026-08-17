const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const materialRoot = path.join(projectRoot, 'public', 'materials-v2');
const generatedMaterials = [
  'cotton-jersey',
  'rib-knit',
  'french-terry',
  'fleece',
  'poplin',
  'linen',
  'denim',
  'twill',
  'wool-blend',
  'nylon-ripstop',
  'satin-silk',
  'velvet'
];

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function webpDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    const payload = 20;
    assert.equal(buffer.toString('hex', payload + 3, payload + 6), '9d012a');
    return {
      width: buffer.readUInt16LE(payload + 6) & 0x3fff,
      height: buffer.readUInt16LE(payload + 8) & 0x3fff
    };
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  throw new Error(`Unsupported WebP chunk ${chunk} in ${filePath}`);
}

test('ships complete 512px PBR map sets for the generated material library', () => {
  generatedMaterials.forEach(material => {
    ['basecolor.webp', 'normal.webp', 'roughness.png', 'height.png'].forEach(mapName => {
      const mapPath = path.join(materialRoot, material, mapName);
      assert.equal(fs.existsSync(mapPath), true, `${material}/${mapName} should exist`);
      const dimensions = mapName.endsWith('.webp') ? webpDimensions(mapPath) : pngDimensions(mapPath);
      assert.deepEqual(dimensions, { width: 512, height: 512 });
    });
  });
});

test('records zero opposite-edge color discontinuity for generated tiles', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(materialRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.length, generatedMaterials.length);
  manifest.forEach(material => {
    assert.ok(material.basecolor_seam_error <= 0.00001, material.material);
    assert.ok(material.height_seam_error <= 0.00001, material.material);
  });
});

test('routes generated materials to the R2 v2 library and preserves legacy fallbacks', () => {
  const materialScript = fs.readFileSync(path.join(projectRoot, 'public/js/design3d-materials.js'), 'utf8');
  assert.match(materialScript, /const generatedMaterialV2 = new Set/);
  assert.match(materialScript, /const generatedMaterialRoot = 'https:\/\/cdn\.cloz-design\.com\/materials-v2'/);
  assert.match(materialScript, /generatedMaterialV2\.has\(material\.id\) \? generatedMaterialRoot : '\/materials'/);
});

test('ships web-ready editorial images and uses them for homepage use cases', () => {
  const routes = fs.readFileSync(path.join(projectRoot, 'routes/index.js'), 'utf8');
  const editorialImages = [
    'garment-team-review.webp',
    'apparel-designer-studio.webp',
    'pod-studio-review.webp'
  ];

  editorialImages.forEach(filename => {
    const imagePath = path.join(projectRoot, 'public/images/editorial', filename);
    assert.ok(fs.statSync(imagePath).size > 40_000, `${filename} should be a real editorial asset`);
    assert.match(routes, new RegExp(`/images/editorial/${filename.replace('.', '\\.')}`));
  });
});

test('uses a generated commercial hero photograph instead of a simulated product UI', () => {
  const homeView = fs.readFileSync(path.join(projectRoot, 'views/index.ejs'), 'utf8');
  const heroPath = path.join(projectRoot, 'public/images/hero/apparel-design-hero-v3.webp');

  assert.deepEqual(webpDimensions(heroPath), { width: 1120, height: 1400 });
  assert.ok(fs.statSync(heroPath).size > 80_000, 'hero should be a real photographic asset');
  assert.match(homeView, /\/images\/hero\/apparel-design-hero-v3\.webp/);
  assert.doesNotMatch(homeView, /home-studio-preview|home-artwork-zone|home-view-switcher/);
});
