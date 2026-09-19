const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FASHION_MOCKUP_CATEGORIES,
  classifyFashionMockupAsset,
  getFashionMockupCategory
} = require('../lib/fashion-mockup-categories');
const manifest = require('../public/config/on-model-mockup-assets.json');

test('provides a detailed, non-overlapping fashion mockup taxonomy', () => {
  assert.equal(FASHION_MOCKUP_CATEGORIES.length, 10);
  assert.equal(new Set(FASHION_MOCKUP_CATEGORIES.map(category => category.slug)).size, 10);
  assert.deepEqual(
    FASHION_MOCKUP_CATEGORIES.map(category => category.label),
    [
      'T-Shirts & Tops',
      'Shirts & Blouses',
      'Hoodies & Sweatshirts',
      'Jackets & Blazers',
      'Coats & Outerwear',
      'Dresses & Gowns',
      'Jumpsuits & Sets',
      'Pants',
      'Skirts & Shorts',
      'Headwear & Accessories'
    ]
  );
});

test('classifies representative mockup assets by shopper-facing garment type', () => {
  const examples = [
    ['upper', 'crewneck-tee-male-front', 'Crewneck Tee Male Front', 't-shirts-tops'],
    ['upper', 'model-019-tie-neck-blouse-from3d-v1', 'Tie Neck Blouse', 'shirts-blouses'],
    ['upper', 'young-western-female-hoodie-v5', 'Female Hoodie', 'hoodies-sweatshirts'],
    ['upper', 'open-front-blazer-female-front', 'Open Front Blazer', 'jackets-blazers'],
    ['full', 'trench-coat-female-front', 'Trench Coat', 'coats-outerwear'],
    ['full', 'one-piece-dress-female-front', 'One Piece Dress', 'dresses-gowns'],
    ['full', 'model-085-balloon-leg-jumpsuit-from3d-v1', 'Balloon Leg Jumpsuit', 'jumpsuits-sets'],
    ['lower', 'tailored-pants-male-front', 'Tailored Pants', 'pants'],
    ['lower', 'classic-skirt-female-front', 'Classic Skirt', 'skirts-shorts'],
    ['head', 'model-110-floppy-bucket-hat-from3d-v1', 'Bucket Hat', 'headwear-accessories']
  ];

  examples.forEach(([garment_type, asset_name, title, expected]) => {
    assert.equal(classifyFashionMockupAsset({ garment_type, asset_name, title }), expected);
  });
  assert.equal(getFashionMockupCategory({ garment_type: 'upper', title: 'Basic Tee' }).label, 'T-Shirts & Tops');
});

test('assigns every published fashion mockup to a populated category', () => {
  const validSlugs = new Set(FASHION_MOCKUP_CATEGORIES.map(category => category.slug));
  const counts = new Map(FASHION_MOCKUP_CATEGORIES.map(category => [category.slug, 0]));

  manifest.assets.forEach(asset => {
    const slug = classifyFashionMockupAsset(asset);
    assert.ok(validSlugs.has(slug), `${asset.assetName} has an unknown category`);
    counts.set(slug, counts.get(slug) + 1);
  });

  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 238);
  counts.forEach((count, slug) => assert.ok(count >= 10, `${slug} is too sparse (${count})`));
});
