const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LEGACY_PATTERN_IDS_BY_TARGET,
  targetForLegacyPattern,
  targetForLegacyPatternId
} = require('../lib/legacy-patterns');

test('maps retired pattern categories to the closest active mockup category', () => {
  assert.equal(targetForLegacyPattern('patterns-t-shirts'), '/mockups/t-shirt-mockup');
  assert.equal(targetForLegacyPattern('Women Shirts'), '/mockups/shirt');
  assert.equal(targetForLegacyPattern('Outerwear'), '/mockups/jacket');
  assert.equal(targetForLegacyPattern('Skirts'), '/mockups/skirt');
  assert.equal(targetForLegacyPattern('Sportswear'), '/mockups');
  assert.equal(targetForLegacyPattern('Digital Costumes'), '/mockups/dress');
  assert.equal(targetForLegacyPattern('Protective Clothing'), '/mockups/jumpsuit');
  assert.equal(targetForLegacyPattern('Vests'), '/mockups/top');
  assert.equal(targetForLegacyPattern('Accessories'), '/mockups');
});

test('uses an item name to choose a more specific destination than its legacy category', () => {
  assert.equal(targetForLegacyPattern('Soccer Outfit ZPRJ Sewing Pattern Sportswear'), '/mockups/t-shirt-mockup');
  assert.equal(targetForLegacyPattern('Hat 01 Collection 2 ZPRJ Sewing Pattern Accessories'), '/mockups/hat');
  assert.equal(targetForLegacyPattern('Protective Coverall ZPRJ Sewing Pattern Protective Clothing'), '/mockups/jumpsuit');
});

test('preserves destinations for every retired pattern item without a database lookup', () => {
  const mappedCount = Object.values(LEGACY_PATTERN_IDS_BY_TARGET)
    .reduce((count, ids) => count + ids.length, 0);

  assert.equal(mappedCount, 219);
  assert.equal(targetForLegacyPatternId(29), '/mockups/t-shirt-mockup');
  assert.equal(targetForLegacyPatternId('169'), '/mockups/hat');
  assert.equal(targetForLegacyPatternId(3), '/mockups/jumpsuit');
  assert.equal(targetForLegacyPatternId(9999), null);
});

test('returns no redirect for categories without a close replacement', () => {
  assert.equal(targetForLegacyPattern('Furniture'), null);
  assert.equal(targetForLegacyPattern('Footwear'), null);
});
