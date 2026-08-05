const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getModelSeoScore,
  hasIndexableModelIdentity,
  shouldIndexModel
} = require('../lib/seo-priority');

function completeModel(overrides = {}) {
  return {
    name: 'Classic Crew Neck T-Shirt 3D Model',
    slug: 'classic-crew-neck-t-shirt-3d-model',
    description: Array.from({ length: 50 }, (_, index) => `garment${index}`).join(' '),
    tags: 'T-shirt mockup garment design editable model',
    image_url: '/images/models/classic-cover.webp',
    file_url: '/models/classic-shirt.glb',
    texture_url: '/images/models/classic-texture.webp',
    category_slug: 't-shirt-mockup',
    ...overrides
  };
}

test('indexes a complete model with a descriptive public identity', () => {
  const model = completeModel();
  assert.ok(getModelSeoScore(model) >= 5);
  assert.equal(hasIndexableModelIdentity(model), true);
  assert.equal(shouldIndexModel(model), true);
});

test('keeps test and placeholder models out of search even when assets are complete', () => {
  assert.equal(shouldIndexModel(completeModel({
    name: 'Test T-Shirt Model',
    slug: 'test-t-shirt-model'
  })), false);
  assert.equal(shouldIndexModel(completeModel({
    name: 'Placeholder Hoodie 3D Model',
    slug: 'placeholder-hoodie-3d-model'
  })), false);
});

test('requires a meaningful name and normalized multi-part slug', () => {
  assert.equal(hasIndexableModelIdentity(completeModel({ name: 'T-Shirt', slug: 'shirt' })), false);
  assert.equal(hasIndexableModelIdentity(completeModel({ slug: 'Classic Shirt' })), false);
});

test('keeps asset taxonomy mismatches out of search', () => {
  assert.equal(shouldIndexModel(completeModel({
    image_url: '/images/models/pants-3d-model-01.webp',
    category_slug: 't-shirt-mockup'
  })), false);
});
