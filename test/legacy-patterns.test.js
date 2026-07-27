const test = require('node:test');
const assert = require('node:assert/strict');

const { targetForLegacyPattern } = require('../lib/legacy-patterns');

test('maps retired pattern categories to the closest active mockup category', () => {
  assert.equal(targetForLegacyPattern('patterns-t-shirts'), '/mockups/t-shirt-mockup');
  assert.equal(targetForLegacyPattern('Women Shirts'), '/mockups/shirt');
  assert.equal(targetForLegacyPattern('Outerwear'), '/mockups/jacket');
  assert.equal(targetForLegacyPattern('Skirts'), '/mockups/skirt');
});

test('returns no redirect for categories without a close replacement', () => {
  assert.equal(targetForLegacyPattern('Digital Costumes'), null);
  assert.equal(targetForLegacyPattern('Sportswear'), null);
});
