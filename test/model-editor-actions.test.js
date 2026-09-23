const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/model-designer.js'), 'utf8');
function functions(names, globals) {
  const context = vm.createContext(globals);
  for (const name of names) {
    const start = source.indexOf(`  function ${name}(`);
    assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf('\n  }', start) + 4), context);
  }
  return context;
}
test('zero opacity is accepted and values are bounded', () => {
  let opacity;
  const group = { setAttribute: (_, value) => { opacity = value; } };
  const api = functions(['setElementOpacity'], {});
  for (const [input, expected] of [[0, '0'], [50, '0.5'], [-10, '0'], [200, '1'], ['invalid', '1']]) {
    api.setElementOpacity(group, input);
    assert.equal(opacity, expected);
  }
});
test('keyboard nudges follow screen directions on rotated canvases and record history', () => {
  const state = { canvasRotation: 90 };
  let data = { x: 100, y: 100 };
  let saves = 0;
  const api = functions(['nudgeSelected'], {
    state, editableSelection: () => ({}), getData: () => data,
    constrainToCanvas: value => value, setData: (_, value) => { data = value; },
    renderSelection: () => {}, saveHistory: () => { saves++; }
  });
  api.nudgeSelected('ArrowRight', 10);
  assert.equal(data.x, 100);
  assert.equal(data.y, 90);
  state.canvasRotation = 0;
  api.nudgeSelected('ArrowRight', 1);
  assert.equal(data.x, 101);
  assert.equal(saves, 2);
});
test('garment panels are not deletable or editable as artwork', () => {
  const textureElements = {};
  const state = { selected: { classList: { contains: () => false }, remove: () => { throw Error('panel removed'); } } };
  const api = functions(['editableSelection', 'deleteSelected'], { state, textureElements });
  assert.equal(api.editableSelection(), null);
  api.deleteSelected();
});
test('moving an element through the layer stack preserves identity and records only actual changes', () => {
  const stack = [];
  const textureElements = { insertBefore: (node, target) => {
    stack.splice(stack.indexOf(node), 1);
    stack.splice(stack.indexOf(target), 0, node);
  } };
  for (let i = 0; i < 3; i++) {
    const node = { id: i, parentNode: textureElements, classList: { contains: () => true } };
    Object.defineProperties(node, {
      nextElementSibling: { get: () => stack[stack.indexOf(node) + 1] },
      previousElementSibling: { get: () => stack[stack.indexOf(node) - 1] }
    });
    stack.push(node);
  }
  const selected = stack[1];
  let saves = 0;
  const api = functions(['editableSelection', 'reorderSelected'], {
    state: { selected }, textureElements, renderSelection: () => {}, saveHistory: () => { saves++; }
  });
  api.reorderSelected('forward');
  assert.deepEqual(stack.map(n => n.id), [0, 2, 1]);
  api.reorderSelected('forward');
  assert.equal(saves, 1);
  api.reorderSelected('backward');
  assert.deepEqual(stack.map(n => n.id), [0, 1, 2]);
  assert.equal(stack[1], selected);
  assert.equal(saves, 2);
});
