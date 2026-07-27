const CATEGORY_TARGETS = [
  { pattern: /\b(t[\s-]?shirts?|tees?)\b/i, target: '/mockups/t-shirt-mockup' },
  { pattern: /\b(hoodies?|sweatshirts?)\b/i, target: '/mockups/hoodie-mockup' },
  { pattern: /\b(blazers?)\b/i, target: '/mockups/blazer' },
  { pattern: /\b(jackets?|outerwear)\b/i, target: '/mockups/jacket' },
  { pattern: /\b(coats?|trench)\b/i, target: '/mockups/coat' },
  { pattern: /\b(dresses?)\b/i, target: '/mockups/dress' },
  { pattern: /\b(pants?|trousers?|bottoms?)\b/i, target: '/mockups/pants' },
  { pattern: /\b(skirts?)\b/i, target: '/mockups/skirt' },
  { pattern: /\b(underwear|intimates?)\b/i, target: '/mockups/underwear' },
  { pattern: /\b(hats?|caps?|headwear)\b/i, target: '/mockups/hat' },
  { pattern: /\b(bags?|backpacks?)\b/i, target: '/mockups/bag' },
  { pattern: /\b(shirts?|blouses?|women shirts?)\b/i, target: '/mockups/shirt' },
  { pattern: /\b(tops?|tank tops?)\b/i, target: '/mockups/top' }
];

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

module.exports = {
  CATEGORY_TARGETS,
  normalizeLegacyPatternLabel,
  targetForLegacyPattern
};
