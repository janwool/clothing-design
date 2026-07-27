const CORE_STATIC_PATHS = [
  '/',
  '/mockups',
  '/tools',
  '/blog',
  '/tools/t-shirt-mockup-generator',
  '/tools/hoodie-mockup-generator',
  '/tools/3d-clothing-mockup-generator',
  '/tools/bulk-t-shirt-mockup-generator',
  '/tools/print-on-demand-mockup-generator'
];

const PRIORITY_3D_CATEGORY_SLUGS = new Set([
  't-shirt-mockup',
  'hoodie-mockup',
  'shirt',
  'jacket',
  'dress',
  'coat',
  'pants',
  'top',
  'skirt',
  'blazer',
  'hat',
  'underwear',
  'jumpsuit',
  'cloak',
  'bag'
]);
const { hasAssetTaxonomyMismatch } = require('./model-asset-taxonomy');

function compactPlainText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
  const text = compactPlainText(value);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function hasAssetUrl(value) {
  return /^https?:\/\//i.test(String(value || '')) || String(value || '').startsWith('/');
}

function isPriority3dCategory(category) {
  return PRIORITY_3D_CATEGORY_SLUGS.has(String(category?.slug || '').trim());
}

function getModelSeoScore(model = {}) {
  let score = 0;
  if (hasAssetUrl(model.image_url)) score += 2;
  if (hasAssetUrl(model.file_url)) score += 2;
  if (hasAssetUrl(model.texture_url)) score += 1;
  if (wordCount(model.description) >= 45) score += 2;
  if (wordCount(model.tags) >= 4) score += 1;
  if (PRIORITY_3D_CATEGORY_SLUGS.has(String(model.category_slug || '').trim())) score += 1;
  return score;
}

function shouldIndexModel(model = {}) {
  return !hasAssetTaxonomyMismatch(model) && getModelSeoScore(model) >= 5;
}

function modelSitemapLimit() {
  const value = Number(process.env.SITEMAP_MODEL_LIMIT || 180);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 180;
}

module.exports = {
  CORE_STATIC_PATHS,
  PRIORITY_3D_CATEGORY_SLUGS,
  compactPlainText,
  getModelSeoScore,
  isPriority3dCategory,
  modelSitemapLimit,
  shouldIndexModel,
  wordCount
};
