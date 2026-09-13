const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const geometry = require('../public/js/svg-mask-geometry');

test('builds closed polygon and smoothed SVG paths in source-image coordinates', () => {
  const points = [
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 210, y: 320 },
    { x: 10, y: 320 }
  ];
  assert.equal(geometry.pathFromPoints(points, 0, true), 'M 10 20 L 210 20 L 210 320 L 10 320 Z');
  const smooth = geometry.pathFromPoints(points, 40, true);
  assert.match(smooth, /^M 10 20 C /);
  assert.match(smooth, / Z$/);
});

test('simplifies a freehand trace without collapsing the closed mask region', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 0.1 },
    { x: 4, y: -0.1 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ];
  const simplified = geometry.simplifyPoints(points, 0.5);
  assert.ok(simplified.length >= 3);
  assert.ok(simplified.length < points.length);
});

test('projects an inserted node onto the nearest closed contour segment', () => {
  const nearest = geometry.nearestPointOnPath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ], { x: 48, y: 7 });
  assert.equal(nearest.index, 0);
  assert.deepEqual(nearest.point, { x: 48, y: 0 });
  assert.equal(nearest.distance, 7);
});

test('exports additive and subtractive regions as a pixel-aligned black and white SVG', () => {
  const source = geometry.buildSvgDocument({
    width: 1024,
    height: 1536,
    title: 'Model 004 garment mask',
    regions: [
      {
        id: 'region-1',
        kind: 'add',
        smoothing: 20,
        visible: true,
        points: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }]
      },
      {
        id: 'region-2',
        kind: 'subtract',
        smoothing: 0,
        visible: true,
        points: [{ x: 300, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 500 }, { x: 300, y: 500 }]
      }
    ]
  });
  assert.match(source, /width="1024" height="1536" viewBox="0 0 1024 1536"/);
  assert.match(source, /<rect width="1024" height="1536" fill="#000000"/);
  assert.match(source, /<g id="mask-add" fill="#ffffff"/);
  assert.match(source, /<g id="mask-subtract" fill="#000000"/);
  assert.match(source, /data-mask-kind="subtract"/);

  const roundTrip = geometry.parseSvgDocument(source);
  assert.equal(roundTrip.width, 1024);
  assert.equal(roundTrip.height, 1536);
  assert.equal(roundTrip.regions.length, 2);
  assert.equal(roundTrip.regions[1].kind, 'subtract');
  assert.deepEqual(roundTrip.regions[0].points[0], { x: 100, y: 100 });
});

test('registers the manual mask editor before the generic tool slug route', () => {
  const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
  const customRoute = route.indexOf("router.get('/tools/svg-mask-editor'");
  const genericRoute = route.indexOf("router.get('/tools/:slug'");
  assert.ok(customRoute >= 0);
  assert.ok(genericRoute > customRoute);
  assert.match(route, /metaRobots: 'noindex,nofollow'/);
  assert.match(route, /svg-mask-editor\.css\?v=20260901-overlay-opacity-v14/);
  const style = fs.readFileSync(path.join(root, 'public', 'css', 'svg-mask-editor.css'), 'utf8');
  assert.match(style, /--mask-outline: #ff3b30/);
  assert.match(route, /defaultMaskSvg/);
});

test('ships a local-only drawing workflow with edit, history, import and export controls', () => {
  const view = fs.readFileSync(path.join(root, 'views', 'svg-mask-editor.ejs'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'public', 'js', 'svg-mask-editor.js'), 'utf8');
  assert.match(view, /data-tool="pen"/);
  assert.match(view, /data-tool="freehand"/);
  assert.match(view, /data-kind="subtract"/);
  assert.match(view, /id="maskExportSvg"/);
  assert.match(view, /id="maskExportPng"/);
  assert.match(view, /id="maskSaveApply"/);
  assert.match(view, /id="maskColorPreview"/);
  assert.match(view, /id="maskPreviewColor"/);
  assert.match(view, /id="maskModelSelect"/);
  assert.match(view, /id="maskQuickSwitchTrigger"/);
  assert.match(view, /id="maskQuickSwitchSearch"/);
  assert.match(view, /id="maskQuickSwitchList"/);
  assert.match(view, /id="maskDeleteNode"/);
  assert.match(view, /id="maskMarkReviewed"/);
  assert.match(editor, /function insertNode\(/);
  assert.match(editor, /function removeSelectedNode\(/);
  assert.match(editor, /mask-region-hit/);
  assert.doesNotMatch(editor, /type: ['"]region['"]|function nudgeSelected\(|Region moved/);
  assert.match(editor, /overlayOpacity: 10/);
  assert.match(editor, /function renderColorPreview\(/);
  assert.match(view, /id="maskOverlayOpacityValue">10%/);
  assert.match(editor, /function undo\(/);
  assert.match(editor, /geometry\.parseSvgDocument/);
  assert.match(editor, /geometry\.buildSvgDocument/);
  assert.match(editor, /maskInitialSvg/);
  assert.match(view, /data-mask-revision=/);
  assert.match(editor, /baseRevision: root\.dataset\.maskRevision/);
  assert.match(editor, /draftRevision !== databaseRevision/);
  assert.match(editor, /function toggleReviewed\(/);
  assert.match(editor, /function openQuickSwitcher\(/);
  assert.match(editor, /canvas\.toBlob/);
  assert.match(editor, /fetch\(`\/api\/on-model-svg-masks\//);
  assert.doesNotMatch(editor, /fetch\(['"`]https?:|XMLHttpRequest|WebSocket/);
});

test('generates a complete editable SVG queue for every paired on-model raster mask', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'config', 'on-model-svg-mask-queue.json'), 'utf8'));
  const rasterMasks = fs.readdirSync(path.join(root, 'public', 'images', 'mockups', 'on-model', 'generated'))
    .filter(name => name.endsWith('-mask.png'));
  assert.equal(manifest.items.length, rasterMasks.length);
  assert.ok(manifest.items.length > 200);
  for (const item of manifest.items) {
    const svgPath = path.join(root, 'public', item.svgMask.replace(/^\//, ''));
    const basePath = path.join(root, 'public', item.baseImage.replace(/^\//, ''));
    assert.ok(fs.existsSync(svgPath), `missing ${item.svgMask}`);
    assert.ok(fs.existsSync(basePath), `missing ${item.baseImage}`);
    const parsed = geometry.parseSvgDocument(fs.readFileSync(svgPath, 'utf8'));
    assert.ok(parsed.regions.some(region => region.kind === 'add'), `no add region in ${item.svgMask}`);
  }
});
