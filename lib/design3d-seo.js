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
    categories: ['Hoodie'],
    features: ['soft hoodie shape', 'fleece-lined styling cues', 'large front and sleeve print zones'],
    useCases: ['winter hoodie mockups', 'sweatshirt colorways', 'streetwear product previews'],
    tags: ['fleece hoodie', 'hoodie 3D model', 'sweatshirt mockup', 'custom hoodie']
  },
  {
    tokens: ['卫衣'],
    title: 'Pullover Hoodie',
    categories: ['Hoodie'],
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
    categories: ['T-shirt'],
    features: ['short sleeve tee silhouette', 'crew neckline', 'simple front and back panels for print placement'],
    useCases: ['T-shirt mockups', 'print-on-demand previews', 'brand merchandise renders'],
    tags: ['t-shirt mockup', 'crew neck t-shirt', '3D t-shirt model', 'POD apparel']
  },
  {
    tokens: ['背心'],
    title: 'Sleeveless Tank Top',
    categories: ['Top'],
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
    categories: ['Top', 'Shirt'],
    features: ['loose woven-garment silhouette', 'relaxed drape', 'broad UV-mapped fabric areas'],
    useCases: ['casualwear previews', 'fabric print testing', 'digital garment collection planning'],
    tags: ['woven top', 'loose top', 'casual garment', '3D clothing model']
  },
  {
    tokens: ['大衣'],
    title: 'Long Coat',
    categories: ['Coat', 'Cloak'],
    features: ['long outerwear silhouette', 'extended body length', 'large fabric panels for prints and materials'],
    useCases: ['coat mockups', 'outerwear line planning', 'fashion ecommerce imagery'],
    tags: ['long coat', 'coat 3D model', 'outerwear mockup', 'fashion GLB']
  },
  {
    tokens: ['连衣裙'],
    title: 'One-Piece Dress',
    categories: ['Dress'],
    features: ['one-piece dress silhouette', 'continuous upper and lower garment shape', 'UV layout for all-over prints'],
    useCases: ['dress collection previews', 'boutique ecommerce renders', 'textile pattern visualization'],
    tags: ['dress 3D model', 'one-piece dress', 'women dress mockup', 'fashion design']
  },
  {
    tokens: ['裙子'],
    title: 'Skirt',
    categories: ['Skirt'],
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
    categories: ['Underwear'],
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

function seoSlug(value, fallback = '3d-model') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

const categoryCopy = {
  '3D clothing models': {
    title: 'Free 3D Clothing Models for Apparel Mockups',
    description: 'Browse editable 3D clothing models for online apparel mockups, product render planning, ecommerce visuals, and browser-based fashion design.',
    meta: 'Use free 3D clothing models to create apparel mockups, product renders, transparent ecommerce visuals, and browser-based clothing previews.',
    focus: 'apparel mockups, product render planning, ecommerce visuals, and browser-based clothing previews',
    workflowTitle: 'Create apparel mockups from editable 3D clothing models',
    outputs: [
      { title: 'Product-page mockups', body: 'Create consistent garment previews for ecommerce listings, product detail pages, and catalog drafts.' },
      { title: 'Launch and approval visuals', body: 'Show apparel concepts before samples, photography, or final production assets are ready.' },
      { title: 'Category-based model selection', body: 'Start from T-shirts, hoodies, dresses, jackets, pants, tops, bags, and accessories.' }
    ]
  },
  'T-shirt': {
    title: 'T-Shirt 3D Models for Mockups and Print Placement',
    description: 'Browse T-shirt 3D models for apparel mockups, print placement tests, product-page previews, and print-on-demand colorway planning.',
    meta: 'Use editable T-shirt 3D models for online apparel mockups, chest print previews, POD product images, and transparent ecommerce renders.',
    focus: 'T-shirt mockups, chest graphics, back prints, oversized tee previews, and POD product images',
    workflowTitle: 'Create T-shirt mockups from editable 3D tee models',
    outputs: [
      { title: 'Print placement previews', body: 'Check chest logos, back graphics, oversized artwork, and color contrast on a T-shirt model before printing.' },
      { title: 'POD listing visuals', body: 'Prepare consistent product images for Shopify, Etsy, Amazon Merch, and creator merch catalogs.' },
      { title: 'Brand drop mockups', body: 'Compare black tee, white tee, oversized fit, and graphic tee directions before sampling.' }
    ]
  },
  Hoodie: {
    title: 'Hoodie 3D Models for Streetwear Mockups',
    description: 'Browse hoodie 3D models for streetwear mockups, sweatshirt product previews, sleeve graphics, chest artwork, and ecommerce listing visuals.',
    meta: 'Use editable hoodie 3D models to preview chest prints, sleeve graphics, oversized streetwear fits, and product-page mockup renders.',
    focus: 'hoodie mockups, sweatshirt previews, sleeve graphics, chest prints, and streetwear product presentation',
    workflowTitle: 'Create hoodie mockups with chest, sleeve, and back artwork zones',
    outputs: [
      { title: 'Streetwear artwork review', body: 'Preview chest graphics, sleeve details, back prints, and trim color on a structured hoodie model.' },
      { title: 'Sweatshirt product listings', body: 'Plan hoodie and sweatshirt visuals for ecommerce pages before samples or photography are ready.' },
      { title: 'Fit-aware previews', body: 'Use 3D angles to judge hood volume, pocket placement, cuff balance, and oversized proportions.' }
    ]
  },
  Shirt: {
    title: 'Shirt 3D Models for Apparel Product Mockups',
    description: 'Browse shirt 3D models for button shirt mockups, blouse previews, woven top product images, uniform concepts, and fabric pattern testing.',
    meta: 'Use editable shirt 3D models for button shirt mockups, blouse previews, woven fabric tests, and ecommerce apparel renders.',
    focus: 'button shirt mockups, blouse previews, woven fabric tests, and uniform product visuals',
    workflowTitle: 'Create shirt mockups for collars, cuffs, plackets, and fabric direction',
    outputs: [
      { title: 'Woven shirt previews', body: 'Review collars, cuffs, plackets, sleeve proportion, and print direction on a 3D shirt model.' },
      { title: 'Uniform and brand concepts', body: 'Plan workwear, team apparel, staff shirts, and branded woven tops before production.' },
      { title: 'Fabric pattern testing', body: 'Use UV-mapped shirt surfaces to test stripes, checks, repeats, colorways, and material direction.' }
    ]
  },
  Top: {
    title: 'Top 3D Models for Fashion Mockups',
    description: 'Browse fashion top 3D models for blouse, tank, woven top, sleeveless top, and casual upper-body apparel mockups.',
    meta: 'Use editable top 3D models for fashion mockups, blouse previews, tank top product images, and apparel design presentation.',
    focus: 'fashion top mockups, blouse previews, tank top renders, and casual upper-body apparel concepts',
    workflowTitle: 'Create fashion top mockups from editable upper-body garment models',
    outputs: [
      { title: 'Top silhouette previews', body: 'Compare sleeveless, woven, relaxed, tailored, and casual top shapes before building product visuals.' },
      { title: 'Material direction tests', body: 'Review color, fabric print, logo scale, and surface placement on upper-body garment models.' },
      { title: 'Collection presentation', body: 'Use top mockups for line sheets, launch decks, ecommerce drafts, and design approvals.' }
    ]
  },
  Dress: {
    title: 'Dress 3D Models for Fashion Product Mockups',
    description: 'Browse dress 3D models for one-piece dress mockups, boutique product images, textile print previews, and fashion collection planning.',
    meta: 'Use editable dress 3D models for one-piece dress mockups, textile print previews, boutique ecommerce images, and fashion renders.',
    focus: 'dress mockups, textile print previews, boutique product images, and collection planning',
    workflowTitle: 'Create dress mockups for silhouette, textile, and ecommerce review',
    outputs: [
      { title: 'Dress product previews', body: 'Check one-piece dress shape, length, surface print, and color direction before a shoot or sample.' },
      { title: 'Textile visualization', body: 'Use broad dress surfaces to test all-over prints, repeats, placement graphics, and fabric colorways.' },
      { title: 'Boutique ecommerce renders', body: 'Prepare visual references for product pages, lookbooks, buyer review, and fashion presentations.' }
    ]
  },
  Jacket: {
    title: 'Jacket 3D Models for Outerwear Mockups',
    description: 'Browse jacket 3D models for puffer, leather, casual, and structured outerwear mockups with editable colors and product render previews.',
    meta: 'Use editable jacket 3D models for outerwear mockups, streetwear previews, material tests, and ecommerce product renders.',
    focus: 'jacket mockups, puffer previews, leather jacket materials, and streetwear outerwear renders',
    workflowTitle: 'Create jacket mockups for structure, materials, and product angles',
    outputs: [
      { title: 'Outerwear product previews', body: 'Review jacket shape, sleeve balance, body panels, closures, and product angles in 3D.' },
      { title: 'Material studies', body: 'Test puffer, leather, technical, and casualwear material directions before production.' },
      { title: 'Streetwear presentation', body: 'Prepare jacket visuals for launch decks, ecommerce drafts, and buyer approvals.' }
    ]
  },
  Coat: {
    title: 'Coat 3D Models for Long Outerwear Mockups',
    description: 'Browse coat 3D models for long coat, trench, seasonal outerwear, and fashion product previews with editable model surfaces.',
    meta: 'Use editable coat 3D models for trench coat mockups, long outerwear previews, seasonal product renders, and fashion presentations.',
    focus: 'coat mockups, trench coat previews, long outerwear renders, and seasonal fashion presentation',
    workflowTitle: 'Create coat mockups for long outerwear shape and fabric direction',
    outputs: [
      { title: 'Long outerwear previews', body: 'Review coat length, sleeve proportion, closure placement, and fabric panels before sampling.' },
      { title: 'Trench and seasonal concepts', body: 'Plan trench coats, long coats, and seasonal layers with consistent 3D presentation angles.' },
      { title: 'Fashion ecommerce visuals', body: 'Create cleaner coat references for product pages, line sheets, and collection decks.' }
    ]
  },
  Pants: {
    title: 'Pants 3D Models for Bottoms Mockups',
    description: 'Browse pants 3D models for trouser mockups, casual bottoms previews, fabric direction tests, and ecommerce product renders.',
    meta: 'Use editable pants 3D models for trouser mockups, bottoms product images, fabric tests, and apparel design previews.',
    focus: 'pants mockups, trouser previews, bottoms product renders, and fabric direction tests',
    workflowTitle: 'Create pants mockups for fit, leg shape, and product presentation',
    outputs: [
      { title: 'Bottoms product previews', body: 'Review leg shape, rise proportion, front and back views, and fabric color before production.' },
      { title: 'Casualwear colorways', body: 'Compare neutral, seasonal, technical, and casual bottoms color directions.' },
      { title: 'Ecommerce planning', body: 'Prepare consistent pants visuals for catalog drafts, line sheets, and product pages.' }
    ]
  },
  Skirt: {
    title: 'Skirt 3D Models for Fashion Mockups',
    description: 'Browse skirt 3D models for fashion mockups, textile print previews, product-page images, and womenswear collection planning.',
    meta: 'Use editable skirt 3D models for skirt mockups, fabric pattern previews, womenswear renders, and ecommerce product visuals.',
    focus: 'skirt mockups, womenswear previews, textile patterns, and fashion product images',
    workflowTitle: 'Create skirt mockups for shape, textile, and product-page review',
    outputs: [
      { title: 'Skirt silhouette previews', body: 'Compare mini, relaxed, layered, and longline skirt shapes in a 3D product context.' },
      { title: 'Fabric pattern review', body: 'Test repeats, colorways, and textile scale on lower-body garment surfaces.' },
      { title: 'Collection planning', body: 'Use skirt mockups for womenswear line sheets, ecommerce drafts, and approval decks.' }
    ]
  },
  Blazer: {
    title: 'Blazer 3D Models for Tailored Apparel Mockups',
    description: 'Browse blazer 3D models for tailored jacket mockups, suiting previews, structured apparel presentation, and ecommerce renders.',
    meta: 'Use editable blazer 3D models for tailored mockups, suiting previews, structured fashion renders, and product-page visuals.',
    focus: 'blazer mockups, tailored jacket previews, suiting presentation, and structured fashion renders',
    workflowTitle: 'Create blazer mockups for tailored structure and product review',
    outputs: [
      { title: 'Tailored silhouette review', body: 'Check blazer shape, sleeve pitch, lapel balance, and structured garment proportions.' },
      { title: 'Suiting material tests', body: 'Preview colors, fabric direction, subtle texture, and formalwear product styling.' },
      { title: 'Professional product visuals', body: 'Prepare blazer references for ecommerce, buyer review, and collection presentation.' }
    ]
  },
  Bag: {
    title: 'Bag 3D Models for Accessory Mockups',
    description: 'Browse bag 3D models for fashion accessory mockups, logo placement, product renders, material previews, and ecommerce images.',
    meta: 'Use editable bag 3D models for accessory mockups, logo placement previews, product renders, and ecommerce visuals.',
    focus: 'bag mockups, accessory product renders, logo placement, and material preview workflows',
    workflowTitle: 'Create bag mockups for accessory product presentation',
    outputs: [
      { title: 'Accessory product renders', body: 'Review bag shape, handle placement, body panels, and product angles before photography.' },
      { title: 'Logo and material previews', body: 'Test logo scale, textile direction, leather colors, and hardware contrast.' },
      { title: 'Ecommerce accessory visuals', body: 'Prepare consistent bag mockups for product pages, catalogs, and launch decks.' }
    ]
  },
  Hat: {
    title: 'Hat 3D Models for Headwear Mockups',
    description: 'Browse hat and cap 3D models for headwear mockups, logo placement, merchandise previews, and ecommerce product renders.',
    meta: 'Use editable hat 3D models for cap mockups, headwear logo placement, merch previews, and accessory product renders.',
    focus: 'cap mockups, headwear logo placement, merch previews, and accessory product renders',
    workflowTitle: 'Create cap and hat mockups for logos, colorways, and merch',
    outputs: [
      { title: 'Headwear logo previews', body: 'Check logo placement, crown panels, brim direction, and scale on cap and hat models.' },
      { title: 'Merchandise planning', body: 'Create headwear concepts for teams, creators, streetwear brands, and campaign drops.' },
      { title: 'Accessory product images', body: 'Prepare consistent cap renders for ecommerce pages and product catalogs.' }
    ]
  }
};

function getCategoryCopy(categoryName) {
  return categoryCopy[categoryName] || {
    title: `${categoryName} 3D Models for Apparel Mockups`,
    description: `Browse ${categoryName.toLowerCase()} 3D models for apparel mockups, online clothing design, product preview renders, and editable UV-based surface design.`,
    meta: `Use editable ${categoryName.toLowerCase()} 3D models for online apparel mockups, product visuals, transparent renders, and browser-based clothing design.`,
    focus: `${categoryName.toLowerCase()} mockups, apparel product visuals, and browser-based 3D clothing design`,
    workflowTitle: `Create ${categoryName.toLowerCase()} mockups from editable 3D garment models`,
    outputs: [
      { title: 'Model-based apparel previews', body: 'Start from a 3D garment model instead of a flat template when planning product visuals.' },
      { title: 'Editable surface direction', body: 'Use UV-mapped model surfaces to test color, logo scale, artwork placement, and fabric direction.' },
      { title: 'Product render planning', body: 'Prepare transparent apparel renders for ecommerce, presentations, and approval workflows.' }
    ]
  };
}

function categoryDescription(categoryName) {
  return getCategoryCopy(categoryName).description;
}

function categoryMetaTitle(categoryName) {
  return getCategoryCopy(categoryName).title;
}

function categoryMetaDescription(categoryName) {
  return getCategoryCopy(categoryName).meta;
}

function buildModelCategoryLandingContent(categoryName = '3D clothing models') {
  const copy = getCategoryCopy(categoryName);
  const displayName = categoryName === '3D clothing models' ? '3D clothing' : categoryName;
  const lowerName = displayName.toLowerCase();
  return {
    workflow: {
      eyebrow: `${displayName} workflow`,
      title: copy.workflowTitle,
      description: `Use this category when you need ${copy.focus} without rebuilding a garment scene from scratch.`,
      steps: [
        { title: 'Choose the closest model', body: `Select a ${lowerName} model that matches the silhouette, product angle, and artwork placement you need.` },
        { title: 'Open the browser editor', body: 'Apply colors, artwork, logos, material direction, or texture references directly in the online workflow.' },
        { title: 'Review product angles', body: 'Rotate the garment, compare front and side views, and check how the design reads on the model surface.' },
        { title: 'Export review visuals', body: 'Use the mockup direction for ecommerce drafts, launch decks, internal review, or production planning.' }
      ]
    },
    categories: {
      eyebrow: 'Related categories',
      title: `Related 3D model categories for ${lowerName} mockups`,
      description: 'Switch categories when you need adjacent garment types, a fuller outfit direction, or a broader apparel mockup set.',
      buttonLabel: 'Browse all 3D models',
      buttonHref: '/design-3d',
      cards: [
        { title: 'T-Shirt', meta: 'Mockup models', href: '/3d-models/t-shirt-mockup' },
        { title: 'Hoodie', meta: 'Streetwear models', href: '/3d-models/hoodie-mockup' },
        { title: 'Dress', meta: 'Fashion models', href: '/3d-models/dress' },
        { title: 'Jacket', meta: 'Outerwear models', href: '/3d-models/jacket' }
      ]
    },
    output: {
      eyebrow: 'Use cases',
      title: `${displayName} 3D models for commercial apparel mockups`,
      cards: copy.outputs
    },
    library: {
      eyebrow: 'Model library',
      title: `Start from editable ${lowerName} models instead of flat mockup templates.`,
      buttonLabel: `Browse ${displayName} Models`,
      buttonHref: '/design-3d'
    },
    faq: {
      eyebrow: 'FAQ',
      title: `${displayName} 3D model questions`,
      items: [
        { question: `What are ${lowerName} 3D models best used for?`, answer: `They are best used for ${copy.focus}, ecommerce drafts, design approvals, and apparel presentation visuals.` },
        { question: 'Can I customize the model online?', answer: 'Yes. Open a model in the browser editor to preview color, artwork scale, surface placement, and product angles.' },
        { question: 'Do I need desktop 3D software?', answer: 'No. The mockup workflow runs in the browser. CLO 3D or Marvelous Designer are optional for deeper garment simulation.' },
        { question: 'Can I use the result for product pages?', answer: 'Yes. The workflow is designed for transparent apparel renders that support ecommerce, portfolio, launch deck, and review workflows.' }
      ]
    },
    cta: {
      eyebrow: 'Start designing',
      title: `Choose a ${lowerName} model and create the next apparel mockup.`,
      description: 'Open a model, test the design direction, and use the preview as a clearer product reference.',
      primaryLabel: `Browse ${displayName} Models`,
      primaryHref: '/design-3d'
    }
  };
}

const modelNameCategoryRules = [
  { pattern: /\b(hoodie|sweatshirt|fleece)\b/i, categories: ['Hoodie'] },
  { pattern: /\b(t-?shirt|tee|polo|henley|crewneck|turtleneck|base layer|pullover)\b/i, categories: ['T-shirt'] },
  { pattern: /\b(blouse|button shirt|button front|woven top|shirt)\b/i, categories: ['Shirt', 'Top'] },
  { pattern: /\b(tank|sleeveless|fashion top|top)\b/i, categories: ['Top'] },
  { pattern: /\b(dress|one-piece)\b/i, categories: ['Dress'] },
  { pattern: /\b(skirt)\b/i, categories: ['Skirt'] },
  { pattern: /\b(pants|trouser|bottoms)\b/i, categories: ['Pants'] },
  { pattern: /\b(underwear|intimates)\b/i, categories: ['Underwear'] },
  { pattern: /\b(blazer)\b/i, categories: ['Blazer', 'Jacket'] },
  { pattern: /\b(puffer|leather jacket|jacket)\b/i, categories: ['Jacket'] },
  { pattern: /\b(coat|trench|outerwear)\b/i, categories: ['Coat'] },
  { pattern: /\b(cap|hat|headwear)\b/i, categories: ['Hat'] },
  { pattern: /\b(backpack|waist bag|bag)\b/i, categories: ['Bag'] }
];

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
  const name = `${variant} ${profile.title} 3D Model`;
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

function inferCategoryNamesFromModelName(modelName, fallbackCategoryName) {
  const text = String(modelName || '');
  const matchedRule = modelNameCategoryRules.find(rule => rule.pattern.test(text));
  const inferred = matchedRule ? matchedRule.categories : [fallbackCategoryName].filter(Boolean);
  return uniqueList(inferred.length ? inferred : ['Top']);
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

function makeUniqueSlug(name, usedSlugs) {
  const baseSlug = seoSlug(name, 'design3d-model');
  let slug = baseSlug;
  let index = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }
  usedSlugs.add(slug);
  return slug;
}

function applyUniqueSeoNames(models) {
  const usedNames = new Map();
  const usedSlugs = new Set();
  return models.map(model => {
    const count = usedNames.get(model.seo.name) || 0;
    const baseName = model.seo.name;
    const name = makeUniqueName(model.seo.name, model.folderName, count);
    usedNames.set(baseName, count + 1);
    const seoFriendlySlug = makeUniqueSlug(name, usedSlugs);
    return {
      ...model,
      legacySlug: model.slug,
      slug: seoFriendlySlug,
      seo: {
        ...model.seo,
        name,
        slug: seoFriendlySlug,
        description: model.seo.description.replaceAll(baseName, name)
      }
    };
  });
}

module.exports = {
  applyUniqueSeoNames,
  buildModelCategoryLandingContent,
  buildSeoContent,
  categoryDescription,
  categoryMetaDescription,
  categoryMetaTitle,
  design3dCategories,
  inferCategoryNamesFromModelName,
  seoSlug,
  stableSlug,
  titleCase
};
