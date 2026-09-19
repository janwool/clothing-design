const FASHION_MOCKUP_CATEGORIES = Object.freeze([
  { slug: 't-shirts-tops', label: 'T-Shirts & Tops', singular: 'top', description: 'T-shirts, tanks, polos, knits and everyday tops' },
  { slug: 'shirts-blouses', label: 'Shirts & Blouses', singular: 'shirt or blouse', description: 'Button shirts, blouses and tailored shirting' },
  { slug: 'hoodies-sweatshirts', label: 'Hoodies & Sweatshirts', singular: 'hoodie or sweatshirt', description: 'Pullover, zip and relaxed fleece silhouettes' },
  { slug: 'jackets-blazers', label: 'Jackets & Blazers', singular: 'jacket or blazer', description: 'Blazers, cropped jackets and structured layers' },
  { slug: 'coats-outerwear', label: 'Coats & Outerwear', singular: 'outerwear style', description: 'Coats, trench styles, puffers, capes and ponchos' },
  { slug: 'dresses-gowns', label: 'Dresses & Gowns', singular: 'dress', description: 'Mini, midi, maxi and occasion dresses' },
  { slug: 'jumpsuits-sets', label: 'Jumpsuits & Sets', singular: 'one-piece or set', description: 'Jumpsuits, rompers and coordinated looks' },
  { slug: 'pants', label: 'Pants', singular: 'pair of pants', description: 'Trousers, joggers, leggings and cargo pants' },
  { slug: 'skirts-shorts', label: 'Skirts & Shorts', singular: 'skirt or pair of shorts', description: 'Mini, midi and maxi skirts plus shorts' },
  { slug: 'headwear-accessories', label: 'Headwear & Accessories', singular: 'accessory', description: 'Caps, hats, scarves, bags and styling accessories' }
]);

const CATEGORY_BY_SLUG = new Map(FASHION_MOCKUP_CATEGORIES.map(category => [category.slug, category]));

function classifyFashionMockupAsset(asset = {}) {
  const garmentType = String(asset.garment_type || asset.garmentType || '').toLowerCase();
  const searchable = `${asset.asset_name || asset.assetName || ''} ${asset.title || ''}`.toLowerCase();

  if (garmentType === 'accessory' || garmentType === 'head') return 'headwear-accessories';
  if (/\b(coat|trench|cape|poncho|robe|tabard|puffer)\b/.test(searchable)) return 'coats-outerwear';
  if (/\b(jumpsuit|romper|set)\b/.test(searchable)) return 'jumpsuits-sets';
  if (/\b(dress|gown)\b/.test(searchable)) return 'dresses-gowns';
  if (/\b(skirt|shorts|bermuda)\b/.test(searchable)) return 'skirts-shorts';
  if (garmentType === 'lower' || /\b(pants|trousers|joggers|leggings)\b/.test(searchable)) return 'pants';
  if (/\b(hoodie|hooded|sweatshirt)\b/.test(searchable)) return 'hoodies-sweatshirts';
  if (/\b(jacket|blazer|bomber|cardigan|bolero|shrug)\b/.test(searchable)) return 'jackets-blazers';
  if (/\b(shirt|blouse)\b/.test(searchable)) return 'shirts-blouses';
  if (garmentType === 'upper') return 't-shirts-tops';
  if (garmentType === 'full') return 'jumpsuits-sets';
  return 'headwear-accessories';
}

function getFashionMockupCategory(asset) {
  return CATEGORY_BY_SLUG.get(classifyFashionMockupAsset(asset)) || CATEGORY_BY_SLUG.get('headwear-accessories');
}

module.exports = {
  FASHION_MOCKUP_CATEGORIES,
  classifyFashionMockupAsset,
  getFashionMockupCategory
};
