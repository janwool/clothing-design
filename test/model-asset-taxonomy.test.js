const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasAssetTaxonomyMismatch,
  inferAssetTaxonomy,
  repairedModelFields
} = require('../lib/model-asset-taxonomy');

test('infers the actual model family from versioned asset URLs', () => {
  const taxonomy = inferAssetTaxonomy({
    image_url: '/uploads/preview/hat-3d-model-05-d658345c.webp?v=cover-20260621'
  });
  assert.deepEqual(taxonomy, {
    basename: 'hat-3d-model-05-d658345c',
    index: 5,
    name: 'Hat',
    slug: 'hat',
    title: 'Hat'
  });
});

test('flags a bag page backed by a hat asset', () => {
  assert.equal(hasAssetTaxonomyMismatch({
    category_slug: 'bag',
    image_url: '/uploads/preview/hat-3d-model-05-d658345c.webp'
  }), true);
});

test('does not flag a matching category or an unrecognized descriptive asset', () => {
  assert.equal(hasAssetTaxonomyMismatch({
    category_slug: 'pants',
    image_url: '/uploads/preview/pants-3d-model-01-2fc05c1e.webp'
  }), false);
  assert.equal(hasAssetTaxonomyMismatch({
    category_slug: 't-shirt-mockup',
    image_url: '/uploads/preview/basic-short-sleeve-tshirt-3d-model.webp'
  }), false);
});

test('builds accurate replacement fields without inventing another garment type', () => {
  const fields = repairedModelFields({
    image_url: '/uploads/preview/pants-3d-model-01-2fc05c1e.webp'
  });
  assert.equal(fields.category, 'Pants');
  assert.equal(fields.categorySlug, 'pants');
  assert.equal(fields.name, 'Pants 3D Model 01');
  assert.equal(fields.slug, 'pants-3d-model-01-2fc05c1e');
});
