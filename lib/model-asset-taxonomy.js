const TAXONOMY_RULES = [
  { pattern: /^t-shirt-mockup-3d-model-(\d+)/i, name: 'T-shirt', slug: 't-shirt-mockup', title: 'T-Shirt' },
  { pattern: /^shirt-3d-model-(\d+)/i, name: 'Shirt', slug: 'shirt', title: 'Shirt' },
  { pattern: /^pants-3d-model-(\d+)/i, name: 'Pants', slug: 'pants', title: 'Pants' },
  { pattern: /^jacket-3d-model-(\d+)/i, name: 'Jacket', slug: 'jacket', title: 'Jacket' },
  { pattern: /^hoodie-mockup-3d-model-(\d+)/i, name: 'Hoodie', slug: 'hoodie-mockup', title: 'Hoodie' },
  { pattern: /^dress-3d-model-(\d+)/i, name: 'Dress', slug: 'dress', title: 'Dress' },
  { pattern: /^cloak-3d-model-(\d+)/i, name: 'Cloak', slug: 'cloak', title: 'Cloak' },
  { pattern: /^underwear-3d-model-(\d+)/i, name: 'Underwear', slug: 'underwear', title: 'Underwear' },
  { pattern: /^jumpsuit-3d-model-(\d+)/i, name: 'Jumpsuit', slug: 'jumpsuit', title: 'Jumpsuit' },
  { pattern: /^skirt-3d-model-(\d+)/i, name: 'Skirt', slug: 'skirt', title: 'Skirt' },
  { pattern: /^blazer-3d-model-(\d+)/i, name: 'Blazer', slug: 'blazer', title: 'Blazer' },
  { pattern: /^coat-3d-model-(\d+)/i, name: 'Coat', slug: 'coat', title: 'Coat' },
  { pattern: /^hat-3d-model-(\d+)/i, name: 'Hat', slug: 'hat', title: 'Hat' },
  { pattern: /^top-3d-model-(\d+)/i, name: 'Top', slug: 'top', title: 'Fashion Top' }
];

const CATEGORY_COPY = {
  't-shirt-mockup': {
    focus: 'print placement, colorway testing, and ecommerce T-shirt mockups',
    tags: ['T-shirt mockup', '3D T-shirt model', 'print-on-demand apparel']
  },
  shirt: {
    focus: 'woven shirt previews, fabric testing, and ecommerce apparel renders',
    tags: ['shirt 3D model', 'shirt mockup', 'woven apparel']
  },
  pants: {
    focus: 'trouser previews, colorway testing, and bottoms product renders',
    tags: ['pants 3D model', 'trouser mockup', 'bottoms design']
  },
  jacket: {
    focus: 'outerwear previews, material testing, and jacket product renders',
    tags: ['jacket 3D model', 'outerwear mockup', 'jacket design']
  },
  'hoodie-mockup': {
    focus: 'hoodie artwork placement, streetwear colorways, and product mockups',
    tags: ['hoodie mockup', '3D hoodie model', 'streetwear design']
  },
  dress: {
    focus: 'dress silhouette review, textile testing, and boutique product images',
    tags: ['dress 3D model', 'dress mockup', 'fashion design']
  },
  cloak: {
    focus: 'cloak silhouette review, material testing, and outerwear visualization',
    tags: ['cloak 3D model', 'outerwear mockup', 'cloak design']
  },
  underwear: {
    focus: 'base-layer review, material testing, and intimates visualization',
    tags: ['underwear 3D model', 'base garment', 'intimates mockup']
  },
  jumpsuit: {
    focus: 'one-piece garment review, material testing, and jumpsuit visualization',
    tags: ['jumpsuit 3D model', 'one-piece garment', 'jumpsuit mockup']
  },
  skirt: {
    focus: 'skirt silhouette review, textile testing, and womenswear product images',
    tags: ['skirt 3D model', 'skirt mockup', 'womenswear design']
  },
  blazer: {
    focus: 'tailored structure review, suiting materials, and blazer product renders',
    tags: ['blazer 3D model', 'blazer mockup', 'tailored apparel']
  },
  coat: {
    focus: 'long outerwear review, material testing, and coat product renders',
    tags: ['coat 3D model', 'coat mockup', 'outerwear design']
  },
  hat: {
    focus: 'headwear shape review, logo placement, and hat product mockups',
    tags: ['hat 3D model', 'hat mockup', 'headwear design']
  },
  top: {
    focus: 'upper-body silhouette review, textile testing, and fashion product renders',
    tags: ['fashion top 3D model', 'top mockup', 'apparel design']
  }
};

function assetBasename(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://assets.invalid/');
    return decodeURIComponent(url.pathname.split('/').pop() || '').replace(/\.[^.]+$/, '');
  } catch (err) {
    return raw.split('?')[0].split('/').pop().replace(/\.[^.]+$/, '');
  }
}

function inferAssetTaxonomy(model = {}) {
  const basename = assetBasename(model.image_url || model.file_url);
  for (const rule of TAXONOMY_RULES) {
    const match = basename.match(rule.pattern);
    if (!match) continue;
    return {
      basename,
      index: Number(match[1]),
      name: rule.name,
      slug: rule.slug,
      title: rule.title
    };
  }
  return null;
}

function currentCategorySlug(model = {}) {
  return String(model.category_slug || model.category || '')
    .trim()
    .toLowerCase()
    .replace(/^t-?shirts?$/, 't-shirt-mockup')
    .replace(/^hoodies?$/, 'hoodie-mockup')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasAssetTaxonomyMismatch(model = {}) {
  const inferred = inferAssetTaxonomy(model);
  return Boolean(inferred && currentCategorySlug(model) !== inferred.slug);
}

function repairedModelFields(model = {}) {
  const taxonomy = inferAssetTaxonomy(model);
  if (!taxonomy) return null;
  const copy = CATEGORY_COPY[taxonomy.slug];
  const ordinal = String(taxonomy.index).padStart(2, '0');
  const name = `${taxonomy.title} 3D Model ${ordinal}`;
  return {
    category: taxonomy.name,
    categorySlug: taxonomy.slug,
    description: `${name} is an editable browser-ready garment asset for ${copy.focus}. Apply colors and artwork, inspect the model from multiple angles, and export a transparent product render for design review or ecommerce planning.`,
    name,
    slug: taxonomy.basename,
    tags: [...copy.tags, 'editable GLB garment', 'transparent product render'].join(', ')
  };
}

module.exports = {
  CATEGORY_COPY,
  TAXONOMY_RULES,
  assetBasename,
  currentCategorySlug,
  hasAssetTaxonomyMismatch,
  inferAssetTaxonomy,
  repairedModelFields
};
