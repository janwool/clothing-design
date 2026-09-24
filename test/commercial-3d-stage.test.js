const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('uses one commercial studio treatment across public interactive garment stages', () => {
  const views = [
    'views/index.ejs',
    'views/tshirt-generator-landing.ejs',
    'views/hoodie-generator-landing.ejs',
    'views/tool-detail.ejs',
    'views/ai-try-on.ejs',
    'views/designer-3d.ejs'
  ];

  views.forEach((viewPath) => {
    const view = read(viewPath);
    assert.match(view, /environment-image="\/environments\/commercial-apparel-studio-v5-front-white-20260917\.hdr"/, viewPath);
    assert.match(view, /data-camera-relative-studio-light="\/environments\/commercial-apparel-studio-v5-front-white-20260917\.hdr"/, viewPath);
    assert.match(view, /data-studio-light-azimuth-offset="45"/, viewPath);
    assert.match(view, /shadow-intensity="0\.32"/, viewPath);
    assert.match(view, /shadow-softness="0\.9"/, viewPath);
    assert.match(view, /exposure="0\.82"/, viewPath);
    assert.match(view, /tone-mapping="commerce"/, viewPath);
  });
});

test('keeps the default commercial stages still and close to front-facing', () => {
  const home = read('views/index.ejs');
  const designer = read('views/designer-3d.ejs');
  const tool = read('views/tool-detail.ejs');

  assert.doesNotMatch(home, /\sauto-rotate(?:\s|=)/);
  assert.doesNotMatch(tool, /\sauto-rotate(?:\s|=)/);
  assert.match(home, /camera-orbit="0deg 76deg 108%"/);
  assert.match(designer, /camera-orbit="0deg 72deg 142%"/);
  assert.match(designer, /<input type="checkbox" id="autoRotateCheck">/);
});

test('preserves native garment base colors in the commercial render standard', () => {
  const standard = JSON.parse(read('public/config/design3d-render-standard.json'));
  assert.equal(standard.material.neutralizeBaseColor, false);
  assert.equal(standard.web.material.neutralizeBaseColor, false);
  assert.equal(standard.web.shadowIntensity, 0.32);
  assert.equal(standard.web.shadowSoftness, 0.9);
  assert.equal(standard.web.lightingMode, 'camera-relative-45deg-white-softbox');
  assert.equal(standard.web.balanceMethod, 'camera-relative-azimuth');
  assert.equal(standard.web.cameraRelativeLighting, true);
  assert.equal(standard.web.lightReferenceAzimuthDeg, -16);
  assert.equal(standard.web.lightAzimuthOffsetDeg, 45);
  assert.equal(standard.web.lightColor, '#ffffff');
  assert.equal(standard.web.environmentNeutralization, 'luminance-preserving-monochrome');
});
