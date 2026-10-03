const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/cloz-color-picker.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });

test('parses saved solid and multi-stop gradient colors', () => {
  assert.equal(window.ClozColorPicker.parsePaint('#9DB3C4').color, '#9db3c4');
  const paint = window.ClozColorPicker.parsePaint('linear-gradient(180deg, #9db3c4 0%, #758a9d 42%, #243653 100%)');
  assert.equal(paint.mode, 'gradient');
  assert.equal(paint.angle, 180);
  assert.deepEqual(Array.from(paint.stops, stop => [stop.color, stop.position]), [
    ['#9db3c4', 0], ['#758a9d', 42], ['#243653', 100]
  ]);
});

test('creates a canvas gradient with the saved angle and stops', () => {
  const calls = [];
  const context = {
    createLinearGradient(...coordinates) {
      calls.push(coordinates);
      return { addColorStop(position, color) { calls.push([position, color]); } };
    }
  };
  window.ClozColorPicker.canvasFillStyle(
    context,
    'linear-gradient(90deg, #111111 0%, #eeeeee 100%)',
    { x: 20, y: 30, width: 100, height: 200 }
  );
  assert.equal(Math.round(calls[0][0]), 20);
  assert.equal(Math.round(calls[0][2]), 120);
  assert.deepEqual(calls.slice(1), [[0, '#111111'], [1, '#eeeeee']]);
});
