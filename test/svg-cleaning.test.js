const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { cleanSvg } = require('../scripts/clean-catalog-svg-assets');

test('removes collapsed and open UV fragments while retaining garment panels', () => {
  const source = [
    '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">',
    '<path d="M 10,10 L 210,10 L 210,210 L 10,210 Z"/>',
    '<path d="M 300,10 L 300.2,10 L 300.2,210 L 300,210 Z"/>',
    '<path d="M 400,10 L 500,10 L 500,11"/>',
    '</svg>',
  ].join('');
  const result = cleanSvg(source);
  assert.equal(result.inputPaths, 3);
  assert.equal(result.outputPaths, 1);
  assert.equal(result.removedThin, 2);
  assert.equal(result.removedOpen, 1);
  assert.match(result.output, /210,210/);
  assert.doesNotMatch(result.output, /300\.2/);
});

test('the Blender exporter compares minimum area in rendered SVG pixels', () => {
  const exporter = fs.readFileSync(path.join(root, 'scripts', 'repack-glb-uv-and-export-svg.py'), 'utf8');
  assert.match(exporter, /def polygon_area_svg_pixels/);
  assert.match(exporter, /polygon_area_svg_pixels\(path, size\) >= min_area/);
  assert.match(exporter, /path_span_svg_pixels\(path, size\) >= min_span/);
  assert.match(exporter, /--min-svg-area", type=float, default=50\.0/);
});
