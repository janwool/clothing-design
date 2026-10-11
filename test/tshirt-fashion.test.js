const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTshirtFashion } = require('../lib/tshirt-fashion');
const assets = ['young-western-female-tee-v4', 'crewneck-tee-male-front', 'tank-top-female-front'].map(asset_name => ({ asset_name, base_image_url: '/photo.png', mask_image_url: '/mask.png' }));
test('Fashion T-shirts use curated live styles and explicit audience metadata', () => {
  assert.equal(selectTshirtFashion(assets).length, 2);
  assert.deepEqual(selectTshirtFashion(assets, { audience: 'women' }).map(card => card.title), ['Crewneck T-shirt']);
  assert.deepEqual(selectTshirtFashion(assets, { audience: 'men' }).map(card => card.title), ['Classic crewneck T-shirt']);
  assert.equal(selectTshirtFashion([]).length, 0);
});
test('black Fashion covers use generated photos and preserve black editor entry', () => {
  const cards = selectTshirtFashion(assets, { black: true });
  assert.ok(cards.every(card => card.color === '#171717' && card.href.endsWith('?color=171717')));
  assert.ok(cards.every(card => card.image.startsWith('/images/tshirt-studio/fashion-black-v1/')));
  assert.equal(selectTshirtFashion(assets)[0].image, assets[0].base_image_url);
});

test('Fashion editor accepts catalog colors but preserves saved projects and rejects invalid colors', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/white-mockup-editor.js'), 'utf8');
  const block = source.slice(source.indexOf('  // Catalog color choices'), source.indexOf("  const baseCanvas = document.createElement('canvas');"));
  for (const [search, expected] of [['?color=171717', '#171717'], ['?color=%23ABCDEF', '#abcdef'], ['?color=bad', '#ffffff'], ['?color=171717&project=saved', '#ffffff'], ['?color=171717&adminProject=saved', '#ffffff']]) {
    const noop = () => {};
    const state = { garmentColor: '#ffffff' };
    vm.runInNewContext(block, { URLSearchParams, window: { location: { search } }, state,
      garmentColorLabel: {}, garmentColorButtons: [], customGarmentColor: {},
      customGarmentColorSwatch: { classList: { add: noop }, setAttribute: noop, querySelector: () => ({ style: {} }) }
    });
    assert.equal(state.garmentColor, expected);
  }
});
