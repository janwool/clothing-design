const CATEGORY_TARGETS = [
  { pattern: /\b(t[\s-]?shirts?|tees?)\b/i, target: '/mockups/t-shirt-mockup' },
  { pattern: /\b(hoodies?|sweatshirts?)\b/i, target: '/mockups/hoodie-mockup' },
  { pattern: /\b(soccer|football kits?|teamwear)\b/i, target: '/mockups/t-shirt-mockup' },
  { pattern: /\b(blazers?)\b/i, target: '/mockups/blazer' },
  { pattern: /\b(jackets?|outerwear)\b/i, target: '/mockups/jacket' },
  { pattern: /\b(coats?|trench)\b/i, target: '/mockups/coat' },
  { pattern: /\b(dresses?)\b/i, target: '/mockups/dress' },
  { pattern: /\b(digital costumes?|costumes?|cosplay)\b/i, target: '/mockups/dress' },
  { pattern: /\b(pants?|trousers?|bottoms?)\b/i, target: '/mockups/pants' },
  { pattern: /\b(skirts?)\b/i, target: '/mockups/skirt' },
  { pattern: /\b(underwear|intimates?)\b/i, target: '/mockups/underwear' },
  { pattern: /\b(hats?|caps?|headwear)\b/i, target: '/mockups/hat' },
  { pattern: /\b(gloves?)\b/i, target: '/mockups/gloves' },
  { pattern: /\b(ties?|neckties?)\b/i, target: '/mockups/tie' },
  { pattern: /\b(bags?|backpacks?)\b/i, target: '/mockups/bag' },
  { pattern: /\b(shirts?|blouses?|women shirts?)\b/i, target: '/mockups/shirt' },
  { pattern: /\b(tops?|tank tops?|vests?)\b/i, target: '/mockups/top' },
  { pattern: /\b(jumpsuits?|coveralls?|protective clothing)\b/i, target: '/mockups/jumpsuit' },
  { pattern: /\b(sportswear|activewear|women sets?|outfit sets?|avatar fit samples?|accessories)\b/i, target: '/mockups' }
];

// Production no longer keeps the retired pattern catalog in D1. Preserve the
// destinations for its previously public item URLs so existing search results
// and backlinks can still reach the closest active mockup collection.
const LEGACY_PATTERN_IDS_BY_TARGET = {
  '/mockups': [1, 6, 7, 8, 20, 21, 22, 23, 24, 63],
  '/mockups/jacket': [2, 62, 72, 75, 76, 77, 78, 79, 80, 81, 87, 88, 106, 107, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 175, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219],
  '/mockups/jumpsuit': [3],
  '/mockups/shirt': [4, 5, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 82, 83, 84, 85, 86, 94, 95, 96, 105, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167],
  '/mockups/dress': [9, 10, 11, 12, 13, 15, 16, 104, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208],
  '/mockups/skirt': [14, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196],
  '/mockups/t-shirt-mockup': [17, 18, 19, 25, 26, 27, 28, 29, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 64, 73, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127],
  '/mockups/blazer': [65, 66],
  '/mockups/hoodie-mockup': [67, 68, 69, 70, 71, 168],
  '/mockups/bag': [74, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185],
  '/mockups/top': [89, 90, 91, 92, 93],
  '/mockups/pants': [97, 98, 99, 100, 101, 102, 103, 197, 198],
  '/mockups/underwear': [128, 129, 130, 131, 132, 133, 134, 135, 136, 137],
  '/mockups/hat': [169, 170, 171, 172, 173],
  '/mockups/gloves': [174],
  '/mockups/tie': [209]
};

const LEGACY_PATTERN_TARGET_BY_ID = new Map(
  Object.entries(LEGACY_PATTERN_IDS_BY_TARGET)
    .flatMap(([target, ids]) => ids.map(id => [String(id), target]))
);

function normalizeLegacyPatternLabel(value) {
  return String(value || '')
    .replace(/^patterns?-?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function targetForLegacyPattern(value) {
  const label = normalizeLegacyPatternLabel(value);
  if (!label) return null;
  const match = CATEGORY_TARGETS.find(item => item.pattern.test(label));
  return match ? match.target : null;
}

function targetForLegacyPatternId(value) {
  return LEGACY_PATTERN_TARGET_BY_ID.get(String(value || '').trim()) || null;
}

module.exports = {
  CATEGORY_TARGETS,
  LEGACY_PATTERN_IDS_BY_TARGET,
  normalizeLegacyPatternLabel,
  targetForLegacyPattern,
  targetForLegacyPatternId
};
