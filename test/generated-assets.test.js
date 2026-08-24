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

test('routes generated materials through the same-origin v2 library and preserves legacy fallbacks', () => {
  const materialScript = fs.readFileSync(path.join(projectRoot, 'public/js/design3d-materials.js'), 'utf8');
  assert.match(materialScript, /const generatedMaterialV2 = new Set/);
  assert.match(materialScript, /const generatedMaterialRoot = '\/materials-v2'/);
  assert.match(materialScript, /generatedMaterialV2\.has\(material\.id\) \? generatedMaterialRoot : '\/materials'/);
  assert.match(materialScript, /getGeneratedMaterials: \(\) => \[\.\.\.generatedMaterials\]/);
});

test('presents the complete generated material library as real fabric samples', () => {
  const designerScript = fs.readFileSync(path.join(projectRoot, 'public/js/model-designer.js'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(projectRoot, 'public/css/style.css'), 'utf8');

  assert.match(designerScript, /getGeneratedMaterials\?\.\(\)/);
  assert.match(designerScript, /material-swatch-preview/);
  assert.match(designerScript, /preview\.style\.backgroundImage = `url/);
  assert.match(designerScript, /includeBaseColorMap: options\.includeBaseColorMap !== false/);
  assert.doesNotMatch(designerScript, /querySelector\('\.material-ball'\)\.style\.background = material\.sphere/);
  assert.match(stylesheet, /grid-auto-columns: 82px/);
  assert.match(stylesheet, /scroll-snap-type: inline proximity/);
});

test('renders generated materials with textile-scale detail and soft studio lighting', () => {
  const materialScript = fs.readFileSync(path.join(projectRoot, 'public/js/design3d-materials.js'), 'utf8');
  const designerScript = fs.readFileSync(path.join(projectRoot, 'public/js/model-designer.js'), 'utf8');
  const renderStandard = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/config/design3d-render-standard.json'), 'utf8'));
  const template = fs.readFileSync(path.join(projectRoot, 'views/model-detail.ejs'), 'utf8');

  assert.match(materialScript, /'cotton-jersey': \{ normalScale: 0\.32, textureRepeat: 7/);
  assert.match(materialScript, /'satin-silk': \{ normalScale: 0\.16, textureRepeat: 5, sheenRoughness: 0\.22/);
  assert.match(designerScript, /sampler\.setScale\?\.\(\{ u: repeat, v: repeat \}\)/);
  assert.match(designerScript, /setSheenColorFactor\?\.\(sheenColor\)/);
  assert.match(designerScript, /setSheenRoughnessFactor\?\.\(material\.sheenRoughness/);
  assert.match(designerScript, /setSpecularFactor\?\.\(material\.specular/);
  assert.equal(renderStandard.web.shadowIntensity, 0.58);
  assert.equal(renderStandard.web.shadowSoftness, 0.94);
  assert.equal(renderStandard.web.exposure, 0.96);
  assert.equal(renderStandard.web.toneMapping, 'neutral');
  assert.match(template, /shadow-intensity="0\.58"/);
  assert.match(template, /shadow-softness="0\.94"/);
  assert.match(template, /tone-mapping="neutral"/);
});

test('ships a UV-safe GLB drape remesher that preserves morph animation', () => {
  const remesher = fs.readFileSync(path.join(projectRoot, 'scripts/remesh-tshirt-soft-drape.py'), 'utf8');
  const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');

  assert.match(remesher, /Only POSITION, NORMAL, and corresponding morph-target accessors are rewritten/);
  assert.match(remesher, /KHR_draco_mesh_compression/);
  assert.match(remesher, /calculate_normals\(deformed_positions, indices\)/);
  assert.match(remesher, /original_morph_normal_deltas/);
  assert.match(remesher, /"uv_unchanged": uv_hash_before == uv_hash_after/);
  assert.match(remesher, /"indices_unchanged": index_hash_before == index_hash_after/);
  assert.match(remesher, /minimum Z is the neckline, maximum Z is the hem/);
  assert.match(gitignore, /^public\/generated-glb\/$/m);
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
