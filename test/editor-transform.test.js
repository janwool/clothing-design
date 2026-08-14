const test = require('node:test');
const assert = require('node:assert/strict');

const {
  anchorRatios,
  clampRectToBounds,
  elementPointToSvg,
  resizeCursor,
  resizeFromPointer
} = require('../public/js/editor-transform');

function assertPointClose(actual, expected, message) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `${message}: x moved`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `${message}: y moved`);
}

function fixedPoint(data, handle) {
  const anchor = anchorRatios(handle);
  return elementPointToSvg(data, data.width * anchor.x, data.height * anchor.y);
}

test('keeps the opposite edge fixed while resizing a rotated shape', () => {
  const original = { x: 452, y: 452, width: 286.166, height: 120, rotate: 90 };
  const resized = resizeFromPointer(original, 'e', 0, 60, { minSize: 12 });

  assert.ok(resized.width > original.width);
  assert.equal(resized.height, original.height);
  assertPointClose(fixedPoint(resized, 'e'), fixedPoint(original, 'e'), 'west anchor');
});

test('preserves image aspect ratio and its opposite corner at an angle', () => {
  const original = { x: 417, y: 441, width: 190, height: 142, rotate: 45 };
  const resized = resizeFromPointer(original, 'se', 42, 42, {
    minSize: 12,
    lockAspect: true
  });

  assert.ok(resized.width > original.width);
  assert.ok(Math.abs(resized.width / resized.height - original.width / original.height) < 1e-10);
  assertPointClose(fixedPoint(resized, 'se'), fixedPoint(original, 'se'), 'image north-west anchor');
});

test('keeps the opposite corner fixed during proportional text scaling', () => {
  const original = { x: 417, y: 485, width: 190, height: 36, rotate: 32 };
  const resized = resizeFromPointer(original, 'se', 50, 40, {
    minSize: 12,
    lockAspect: true
  });

  assertPointClose(fixedPoint(resized, 'se'), fixedPoint(original, 'se'), 'text north-west anchor');
  assert.ok(Math.abs(resized.width / resized.height - original.width / original.height) < 1e-10);
});

test('rotates resize cursors with the selected object', () => {
  assert.equal(resizeCursor('e', 0), 'ew-resize');
  assert.equal(resizeCursor('e', 90), 'ns-resize');
  assert.equal(resizeCursor('nw', 90), 'nesw-resize');
  assert.equal(resizeCursor('n', 45), 'nesw-resize');
});

test('keeps a rotated element inside the canvas while moving it', () => {
  const moved = clampRectToBounds(
    { x: -90, y: -70, width: 120, height: 80, rotate: 45 },
    { x: 0, y: 0, width: 800, height: 600 }
  );
  const rotatedWidth = Math.abs(120 * Math.cos(Math.PI / 4)) + Math.abs(80 * Math.sin(Math.PI / 4));
  const rotatedHeight = Math.abs(120 * Math.sin(Math.PI / 4)) + Math.abs(80 * Math.cos(Math.PI / 4));

  assert.ok(Math.abs(moved.x + 60 - rotatedWidth / 2) < 1e-8);
  assert.ok(Math.abs(moved.y + 40 - rotatedHeight / 2) < 1e-8);
});

test('centers an element whose rotated bounds are larger than the canvas', () => {
  const moved = clampRectToBounds(
    { x: 200, y: 100, width: 900, height: 700, rotate: 20 },
    { x: 0, y: 0, width: 800, height: 600 }
  );

  assert.equal(moved.x, -50);
  assert.equal(moved.y, -50);
});
