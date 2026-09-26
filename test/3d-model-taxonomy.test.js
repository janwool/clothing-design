const test = require('node:test');
const assert = require('node:assert/strict');
const { inferCategoryNamesFromModelName } = require('../lib/design3d-seo');
const approvedModels = require('../scripts/model-cover-source-manifest.json');

test('complete outfits and one-piece garments do not fall into single-garment categories', () => {
  assert.deepEqual(
    inferCategoryNamesFromModelName('Roll-Sleeve Shirt and Slim Trousers Set', 'Shirt'),
    ['Sets']
  );
  assert.deepEqual(
    inferCategoryNamesFromModelName('Chest-Pocket Paneled Jogger Overalls', 'Pants'),
    ['Jumpsuit']
  );
  assert.deepEqual(
    inferCategoryNamesFromModelName('Stand-Collar Open-Front Sleeveless Romper', 'Pants'),
    ['Jumpsuit']
  );
});

test('specialized garments retain their category when catalog categories are refreshed', () => {
  assert.deepEqual(inferCategoryNamesFromModelName('Ankle Socks', 'Underwear'), ['Socks']);
  assert.deepEqual(
    inferCategoryNamesFromModelName('Asymmetric Double-Strap Two-Piece Swimsuit', 'Underwear'),
    ['Swimwear']
  );
  assert.deepEqual(inferCategoryNamesFromModelName('Collared Long-Sleeve Pullover', 'Hoodie'), ['Hoodie']);
  assert.deepEqual(inferCategoryNamesFromModelName('Crewneck Bell-Sleeve Crop Top', 'Top'), ['Top']);
  assert.deepEqual(inferCategoryNamesFromModelName('Crewneck Straight-Cut T-Shirt', 'T-shirt'), ['T-shirt']);
});

test('catalog refresh preserves every approved model primary category', () => {
  for (const model of approvedModels) {
    assert.deepEqual(
      inferCategoryNamesFromModelName(model.name, model.category),
      [model.category],
      model.slug
    );
  }
});
