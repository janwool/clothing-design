const crypto = require('crypto');

const design3dCategories = [
  { name: 'T-shirt', slug: 't-shirt-mockup', sort_order: 10 },
  { name: 'Shirt', slug: 'shirt', sort_order: 20 },
  { name: 'Pants', slug: 'pants', sort_order: 30 },
  { name: 'Jacket', slug: 'jacket', sort_order: 40 },
  { name: 'Hoodie', slug: 'hoodie-mockup', sort_order: 50 },
  { name: 'Dress', slug: 'dress', sort_order: 60 },
  { name: 'Cloak', slug: 'cloak', sort_order: 70 },
  { name: 'Underwear', slug: 'underwear', sort_order: 80 },
  { name: 'Jumpsuit', slug: 'jumpsuit', sort_order: 90 },
  { name: 'Skirt', slug: 'skirt', sort_order: 100 },
  { name: 'Blazer', slug: 'blazer', sort_order: 110 },
  { name: 'Coat', slug: 'coat', sort_order: 120 },
  { name: 'Hat', slug: 'hat', sort_order: 130 },
  { name: 'Top', slug: 'top', sort_order: 140 },
  { name: 'Bag', slug: 'bag', sort_order: 150 },
  { name: 'Backpack', slug: 'backpack', sort_order: 160 },
  { name: 'Waist Bag', slug: 'waist-bag', sort_order: 170 },
  { name: 'Swimwear', slug: 'swimwear', sort_order: 180 },
  { name: 'Tie', slug: 'tie', sort_order: 190 },
  { name: 'Gloves', slug: 'gloves', sort_order: 200 }
];

const variants = [
  'Classic',
  'Relaxed',
  'Tailored',
  'Longline',
  'Structured',
  'Lightweight',
  'Utility',
  'Minimal',
  'Layered',
  'Modern',
  'Casual',
  'Clean'
];

const profiles = [
  {
    tokens: ['女士长风衣'],
    title: "Women's Long Trench Coat",
    categories: ['Coat', 'Jacket', 'Cloak'],
    features: ['long trench silhouette', 'open-front outerwear structure', 'large surface areas for textile graphics'],
    useCases: ['outerwear collection previews', 'coat fabric studies', 'fashion ecommerce renders'],
    tags: ['women trench coat', 'long coat', 'outerwear 3D model', 'coat mockup']
  },
  {
    tokens: ['风衣'],
    title: 'Trench Coat',
    categories: ['Coat', 'Jacket', 'Cloak'],
    features: ['trench-inspired outerwear silhouette', 'long sleeve body', 'generous front and sleeve UV areas'],
    useCases: ['outerwear mockups', 'technical fashion previews', 'custom coat design'],
    tags: ['trench coat', 'outerwear', 'coat 3D model', 'fashion mockup']
  },
  {
    tokens: ['羽绒服'],
    title: 'Puffer Jacket',
    categories: ['Jacket', 'Coat'],
    features: ['insulated jacket volume', 'puffer-style body panels', 'broad printable garment surfaces'],
    useCases: ['winterwear previews', 'jacket colorway testing', 'outdoor apparel mockups'],
    tags: ['puffer jacket', 'winter jacket', 'down jacket', 'outerwear mockup']
  },
  {
    tokens: ['皮衣'],
    title: 'Leather Jacket',
    categories: ['Jacket', 'Coat'],
    features: ['structured leather-jacket silhouette', 'short outerwear proportions', 'clean panel layout for material studies'],
    useCases: ['streetwear previews', 'leather texture testing', 'fashion jacket mockups'],
    tags: ['leather jacket', 'biker jacket', 'streetwear jacket', '3D jacket']
  },
  {
    tokens: ['夹克'],
    title: 'Casual Jacket',
    categories: ['Jacket', 'Coat'],
    features: ['short jacket silhouette', 'long sleeves', 'front body and sleeve areas ready for artwork placement'],
    useCases: ['casual outerwear mockups', 'team jacket previews', 'streetwear product renders'],
    tags: ['casual jacket', '3D jacket model', 'outerwear GLB', 'jacket mockup']
  },
  {
    tokens: ['卫衣风衣'],
    title: 'Hooded Trench Jacket',
    categories: ['Hoodie', 'Jacket', 'Coat'],
    features: ['hybrid hoodie and trench-coat silhouette', 'hooded neckline', 'layered outerwear proportions'],
    useCases: ['hybrid outerwear concepts', 'streetwear previews', 'custom hoodie jacket mockups'],
    tags: ['hooded trench', 'hoodie jacket', 'streetwear outerwear', '3D hoodie model']
  },
  {
    tokens: ['带毛卫衣'],
    title: 'Fleece Lined Hoodie',
    categories: ['Hoodie', 'Top'],
    features: ['soft hoodie shape', 'fleece-lined styling cues', 'large front and sleeve print zones'],
    useCases: ['winter hoodie mockups', 'sweatshirt colorways', 'streetwear product previews'],
    tags: ['fleece hoodie', 'hoodie 3D model', 'sweatshirt mockup', 'custom hoodie']
  },
  {
    tokens: ['卫衣'],
    title: 'Pullover Hoodie',
    categories: ['Hoodie', 'Top'],
    features: ['hooded sweatshirt silhouette', 'long sleeves', 'front body surface for logos and textile graphics'],
    useCases: ['custom hoodie design', 'streetwear previews', 'print-on-demand apparel mockups'],
    tags: ['pullover hoodie', 'hoodie mockup', '3D sweatshirt', 'custom apparel']
  },
  {
    tokens: ['收口袖'],
    title: 'Cuffed Sleeve Button Shirt',
    categories: ['Shirt', 'Top'],
    features: ['collared shirt structure', 'cuffed long sleeves', 'button-front styling with UV-mapped shirt panels'],
    useCases: ['shirt product previews', 'uniform design mockups', 'fabric and cuff detail visualization'],
    tags: ['cuffed shirt', 'button shirt', 'long sleeve shirt', 'shirt 3D model']
  },
  {
    tokens: ['长袖称衣', '长袖衬衣'],
    title: 'Long Sleeve Shirt',
    categories: ['Shirt', 'Top'],
    features: ['long sleeve shirt silhouette', 'collared upper-body shape', 'editable front, back, and sleeve surfaces'],
    useCases: ['shirt ecommerce renders', 'custom fabric previews', 'formalwear and casualwear mockups'],
    tags: ['long sleeve shirt', 'shirt 3D model', 'collared shirt mockup', 'apparel GLB']
  },
  {
    tokens: ['衬衣'],
    title: 'Button Shirt',
    categories: ['Shirt', 'Top'],
    features: ['collared shirt structure', 'button-front styling', 'shirt body panels mapped to a packed UV pattern'],
    useCases: ['shirt product pages', 'uniform design previews', 'fabric pattern testing'],
    tags: ['button shirt', 'collared shirt', 'shirt 3D model', 'apparel mockup']
  },
  {
    tokens: ['Tshirt', 'tshirt', 'T-shirt'],
    title: 'Crew Neck T-Shirt',
    categories: ['T-shirt', 'Top'],
    features: ['short sleeve tee silhouette', 'crew neckline', 'simple front and back panels for print placement'],
    useCases: ['T-shirt mockups', 'print-on-demand previews', 'brand merchandise renders'],
    tags: ['t-shirt mockup', 'crew neck t-shirt', '3D t-shirt model', 'POD apparel']
  },
  {
    tokens: ['背心'],
    title: 'Sleeveless Tank Top',
    categories: ['Top', 'T-shirt'],
    features: ['sleeveless top silhouette', 'open armholes', 'clean front and back areas for graphics'],
    useCases: ['summer apparel mockups', 'sportswear previews', 'tank top product renders'],
    tags: ['tank top', 'sleeveless top', 'vest 3D model', 'summer apparel']
  },
  {
    tokens: ['上衣'],
    title: 'Fashion Top',
    categories: ['Top', 'Shirt'],
    features: ['upper-body garment silhouette', 'editable surface panels', 'web-ready GLB geometry'],
    useCases: ['womenswear top previews', 'custom apparel mockups', 'fabric and colorway testing'],
    tags: ['fashion top', 'women top', '3D top model', 'apparel design']
  },
  {
    tokens: ['布衣'],
    title: 'Loose Woven Top',
    categories: ['Top', 'Shirt', 'Cloak'],
    features: ['loose woven-garment silhouette', 'relaxed drape', 'broad UV-mapped fabric areas'],
    useCases: ['casualwear previews', 'fabric print testing', 'digital garment collection planning'],
    tags: ['woven top', 'loose top', 'casual garment', '3D clothing model']
  },
  {
    tokens: ['大衣'],
    title: 'Long Coat',
    categories: ['Coat', 'Cloak', 'Dress'],
    features: ['long outerwear silhouette', 'extended body length', 'large fabric panels for prints and materials'],
    useCases: ['coat mockups', 'outerwear line planning', 'fashion ecommerce imagery'],
    tags: ['long coat', 'coat 3D model', 'outerwear mockup', 'fashion GLB']
  },
  {
    tokens: ['连衣裙'],
    title: 'One-Piece Dress',
    categories: ['Dress', 'Skirt', 'Top'],
    features: ['one-piece dress silhouette', 'continuous upper and lower garment shape', 'UV layout for all-over prints'],
    useCases: ['dress collection previews', 'boutique ecommerce renders', 'textile pattern visualization'],
    tags: ['dress 3D model', 'one-piece dress', 'women dress mockup', 'fashion design']
  },
  {
    tokens: ['裙子'],
    title: 'Skirt',
    categories: ['Skirt', 'Dress'],
    features: ['skirt-focused garment shape', 'lower-body fabric panels', 'editable UV pattern for color and print studies'],
    useCases: ['skirt product previews', 'fashion collection planning', 'fabric pattern mockups'],
    tags: ['skirt 3D model', 'women skirt', 'fashion skirt mockup', 'UV pattern']
  },
  {
    tokens: ['裤子'],
    title: 'Pants',
    categories: ['Pants'],
    features: ['two-leg trouser silhouette', 'front and back leg panels', 'packed UV layout for textile placement'],
    useCases: ['pants mockups', 'sportswear or casualwear previews', 'bottoms colorway exploration'],
    tags: ['pants 3D model', 'trousers mockup', 'bottoms GLB', 'apparel design']
  },
  {
    tokens: ['内衣'],
    title: 'Underwear Base Garment',
    categories: ['Underwear', 'Top', 'Pants'],
    features: ['close-to-body underwear silhouette', 'compact garment panels', 'UV-mapped surfaces for material studies'],
    useCases: ['intimates previews', 'base-layer design', 'technical apparel visualization'],
    tags: ['underwear 3D model', 'intimates mockup', 'base layer', 'apparel GLB']
  },
  {
    tokens: ['帽子'],
    title: 'Cap and Hat',
    categories: ['Hat'],
    features: ['headwear silhouette', 'curved crown or brim surfaces', 'UV-mapped panels for logos and fabric graphics'],
    useCases: ['custom hat mockups', 'brand merchandise previews', 'accessory product renders'],
    tags: ['hat 3D model', 'cap mockup', 'headwear', 'custom hat']
  },
  {
    tokens: ['背包'],
    title: 'Backpack',
    categories: ['Backpack', 'Bag'],
    features: ['backpack accessory shape', 'front bag panels', 'UV surfaces for material and logo placement'],
    useCases: ['bag product renders', 'accessory mockups', 'outdoor gear previews'],
    tags: ['backpack 3D model', 'bag mockup', 'accessory GLB', 'custom backpack']
  },
  {
    tokens: ['腰包'],
    title: 'Waist Bag',
    categories: ['Waist Bag', 'Bag'],
    features: ['waist bag accessory silhouette', 'compact pouch body', 'UV-mapped surfaces for logos and materials'],
    useCases: ['waist bag mockups', 'streetwear accessory previews', 'custom bag design'],
    tags: ['waist bag', 'fanny pack', 'bag 3D model', 'accessory mockup']
  },
  {
    tokens: ['bao', '包'],
    title: 'Fashion Bag',
    categories: ['Bag'],
    features: ['bag accessory silhouette', 'structured body panels', 'UV-mapped surfaces for material and logo previews'],
    useCases: ['bag mockups', 'fashion accessory renders', 'custom merchandise previews'],
    tags: ['bag 3D model', 'fashion bag mockup', 'accessory GLB', 'custom bag']
  },
  {
    tokens: ['领带'],
    title: 'Necktie',
    categories: ['Tie'],
    features: ['necktie accessory shape', 'long narrow fabric surface', 'UV layout suited for repeats and stripe graphics'],
    useCases: ['tie pattern previews', 'formalwear accessory mockups', 'textile repeat visualization'],
    tags: ['tie 3D model', 'necktie mockup', 'formalwear accessory', 'textile pattern']
  },
  {
    tokens: ['手套'],
    title: 'Gloves',
    categories: ['Gloves'],
    features: ['handwear accessory shape', 'paired glove surfaces', 'UV layout for material and color studies'],
    useCases: ['glove product renders', 'accessory mockups', 'sportswear or winterwear previews'],
    tags: ['gloves 3D model', 'handwear mockup', 'accessory GLB', 'custom gloves']
  }
];

function stableSlug(category, index, relativeId) {
  const hash = crypto.createHash('sha1').update(relativeId).digest('hex').slice(0, 8);
  return `${category.slug}-3d-model-${String(index).padStart(2, '0')}-${hash}`;
}

function categoryDescription(categoryName) {
  return `${categoryName} Design 3D models with web-ready GLB files and matching packed UV SVG patterns for apparel mockups, custom surface design, and ecommerce product visualization.`;
}

function categoryMetaTitle(categoryName) {
  return `${categoryName} 3D Models with Editable UV Patterns`;
}

function categoryMetaDescription(categoryName) {
  return `Browse ${categoryName} 3D apparel models with GLB files, aligned packed UV SVG templates, and realistic render-ready previews for online clothing design.`;
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferProfile(folderName, fallbackCategoryName) {
  const raw = String(folderName || '');
  const match = profiles.find(profile => profile.tokens.some(token => raw.includes(token)));
  if (match) return match;
  const fallbackTitle = fallbackCategoryName === 'T-shirt' ? 'T-Shirt' : fallbackCategoryName;
  return {
    title: `${fallbackTitle} Garment`,
    categories: [fallbackCategoryName],
    features: [`${fallbackTitle.toLowerCase()} apparel silhouette`, 'editable garment surfaces', 'packed UV layout for artwork placement'],
    useCases: ['3D apparel mockups', 'custom clothing previews', 'digital fashion product pages'],
    tags: [fallbackTitle, `${fallbackTitle} 3D model`, 'apparel mockup', 'custom clothing design']
  };
}

function getVariantLabel(folderName, variantIndex = 0) {
  const numberMatch = String(folderName || '').match(/(\d+)/);
  const index = numberMatch ? Number(numberMatch[1]) - 1 : variantIndex;
  return variants[((index % variants.length) + variants.length) % variants.length];
}

function buildSeoContent({ category, folderName, variantIndex = 0 }) {
  const profile = inferProfile(folderName, category.name);
  const variant = getVariantLabel(folderName, variantIndex);
  const name = `${variant} ${profile.title} 3D Model with UV Pattern`;
  const categoryNames = uniqueList([...profile.categories, category.name]);
  const featureText = profile.features.join(', ');
  const useCaseText = profile.useCases.join(', ');
  const garmentName = profile.title.toLowerCase();
  const description = [
    `${name} is a Design3D-ready GLB clothing asset for browser-based apparel visualization. The model focuses on ${featureText}, with a matching packed UV SVG pattern for accurate artwork, color, fabric, and logo placement.`,
    `Use this ${garmentName} model for ${useCaseText}. It is built for designers, ecommerce teams, print-on-demand sellers, and fashion brands that need a clear 3D garment preview before production.`,
    `The downloadable designed render can be exported as a high-resolution transparent WebP image, while the underlying GLB and UV pattern support repeatable design workflows across product pages, campaign visuals, and GEO-friendly model descriptions.`
  ].join('\n\n');
  const tags = uniqueList([
    ...profile.tags,
    ...categoryNames,
    'Design3D',
    '3D clothing model',
    'GLB garment model',
    'UV pattern SVG',
    'packed UV',
    'transparent WebP render',
    'apparel design template',
    'SEO friendly 3D model'
  ]).join(', ');

  return {
    name,
    category: categoryNames[0],
    categoryNames,
    description,
    tags
  };
}

function getUniqueQualifier(folderName, usedCount) {
  const raw = String(folderName || '');
  if (raw.includes('收口袖')) return 'Cuffed Sleeve';
  if (raw.includes('长袖')) return 'Long Sleeve';
  if (raw.includes('女士')) return "Women's";
  if (raw.includes('Jeff Men')) return "Men's";
  if (raw.includes('from_')) return 'Alternate Fit';
  const qualifiers = [
    'Panel Layout',
    'Collection Fit',
    'Studio Fit',
    'Extended Surface',
    'Material Study',
    'Product View'
  ];
  return qualifiers[(usedCount - 1) % qualifiers.length];
}

function makeUniqueName(baseName, folderName, usedCount) {
  if (usedCount <= 0) return baseName;
  const qualifier = getUniqueQualifier(folderName, usedCount);
  return baseName.replace(/ 3D Model/, ` ${qualifier} 3D Model`);
}

function applyUniqueSeoNames(models) {
  const usedNames = new Map();
  return models.map(model => {
    const count = usedNames.get(model.seo.name) || 0;
    const baseName = model.seo.name;
    const name = makeUniqueName(model.seo.name, model.folderName, count);
    usedNames.set(baseName, count + 1);
    return {
      ...model,
      seo: {
        ...model.seo,
        name,
        description: model.seo.description.replaceAll(baseName, name)
      }
    };
  });
}

module.exports = {
  applyUniqueSeoNames,
  buildSeoContent,
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle,
  design3dCategories,
  stableSlug,
  titleCase
};
