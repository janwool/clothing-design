const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { getModelSlug, normalize3dModel, normalize3dModels } = require('../lib/slug');
const { shouldIndexModel, shouldIndexPattern } = require('../lib/seo-priority');
const {
  DEFAULT_SITE_IMAGE_PATH,
  toAbsoluteUrl,
  firstImage,
  imageObject,
  itemList,
  pageStructuredData
} = require('../lib/seo');

function getDefaultLandingContent(name = '3D clothing models', resourceType = '3d-models') {
  if (resourceType === 'patterns') {
    return {
      workflow: {
        eyebrow: 'Pattern workflow',
        title: `From ${name} pattern to simulated garment`,
        description: 'Use each ZPRJ sewing pattern as a starting point for digital sample review, fit checks, and 3D apparel handoff.',
        steps: [
          { title: 'Choose a pattern', body: 'Start from a category that matches the garment type, silhouette, and production question you need to answer.' },
          { title: 'Open the ZPRJ file', body: 'Load the project in CLO 3D or Marvelous Designer and confirm the 2D pattern pieces, sewing lines, avatar scale, and fabrics.' },
          { title: 'Simulate and adjust', body: 'Review drape, tension, fit balance, and construction details before making colorway or material changes.' },
          { title: 'Prepare handoff visuals', body: 'Export review images, technical references, or a revised project file for design, merchandising, or sample development.' }
        ]
      },
      categories: {
        eyebrow: 'Pattern categories',
        title: 'Browse ZPRJ pattern categories',
        description: 'Move between garment categories when comparing construction types, silhouettes, and simulation-ready apparel files.',
        buttonLabel: 'Browse patterns',
        buttonHref: '/patterns',
        cards: [
          { title: 'T-Shirts', meta: 'ZPRJ patterns', href: '/patterns/patterns-t-shirts' },
          { title: 'Hoodies', meta: 'ZPRJ patterns', href: '/patterns/patterns-hoodies' },
          { title: 'Outerwear', meta: 'ZPRJ patterns', href: '/patterns/patterns-outerwear' },
          { title: 'Women Shirts', meta: 'ZPRJ patterns', href: '/patterns/patterns-women-shirts' }
        ]
      },
      output: {
        eyebrow: 'Built for simulation',
        title: `${name} patterns for practical apparel development`,
        cards: [
          { title: 'CLO 3D and Marvelous Designer review', body: 'Open the project file to inspect pattern pieces, garment arrangement, fabric behavior, and simulation quality.' },
          { title: 'Digital sample iteration', body: 'Test construction, proportions, and styling changes before committing to physical sampling.' },
          { title: 'Mockup and production handoff', body: 'Create clearer references for designers, pattern makers, factories, buyers, and ecommerce teams.' }
        ]
      },
      library: {
        eyebrow: 'Pattern library',
        title: 'Start from preview-guided ZPRJ sewing patterns instead of rebuilding a garment from zero.',
        buttonLabel: 'Browse Sew Patterns',
        buttonHref: '/patterns'
      },
      faq: {
        eyebrow: 'FAQ',
        title: `${name} pattern questions`,
        items: [
          { question: 'Can I use these patterns in CLO 3D?', answer: 'Yes. The pattern pages focus on ZPRJ project files that can be opened in CLO 3D for simulation, fit review, and digital sample work.' },
          { question: 'Can Marvelous Designer open the files?', answer: 'Yes. Marvelous Designer supports ZPRJ project files, so you can inspect 2D pattern pieces, sewing relationships, fabric settings, and the simulated garment.' },
          { question: 'Are the previews useful before downloading?', answer: 'Yes. Preview images help you choose a garment type and avoid opening project files that do not match your intended silhouette or workflow.' },
          { question: 'How do I turn a pattern into a mockup?', answer: 'Open the ZPRJ file in your 3D apparel software, simulate the garment, apply materials or graphics, and export review renders or technical references.' }
        ]
      },
      cta: {
        eyebrow: 'Start reviewing',
        title: `Choose a ${name} pattern and open it in your 3D apparel workflow.`,
        description: 'Use the pattern grid above to select a simulation-ready project file with a visual preview.',
        primaryLabel: 'Browse Sew Patterns',
        primaryHref: '/patterns'
      }
    };
  }

  return {
    workflow: {
      eyebrow: 'Workflow',
      title: `From blank model to finished ${name} mockup`,
      description: 'Use the same browser-based flow to select a garment, place your artwork, preview the result, and prepare visuals for review.',
      steps: [
        { title: 'Select a garment', body: 'Choose the 3D clothing model that matches the silhouette you want to present.' },
        { title: 'Add your design', body: 'Apply colors, artwork, logos, and surface directions to the selected model.' },
        { title: 'Preview the mockup', body: 'Rotate the model and check artwork scale, placement, and color balance.' },
        { title: 'Export visuals', body: 'Save presentation-ready mockups for stores, launch decks, and approvals.' }
      ]
    },
    categories: {
      eyebrow: 'Popular categories',
      title: 'Find the right model category',
      description: 'Browse model categories and choose the closest garment base before opening the 3D designer.',
      buttonLabel: 'Browse categories',
      buttonHref: '/design-3d',
      cards: [
        { title: 'Hoodies', meta: '3D models', href: '/design-3d' },
        { title: 'T-Shirts', meta: '3D models', href: '/design-3d' },
        { title: 'Dresses', meta: '3D models', href: '/design-3d' },
        { title: 'Outerwear', meta: '3D models', href: '/design-3d' }
      ]
    },
    output: {
      eyebrow: 'Built for apparel output',
      title: 'Use 3D clothing models across every apparel workflow',
      cards: [
        { title: 'Online product pages', body: 'Create consistent visuals for ecommerce listings and product detail pages.' },
        { title: 'Campaign and launch decks', body: 'Show garment concepts in context before samples or photoshoots are ready.' },
        { title: 'Client and team approvals', body: 'Review color, placement, and scale with a more realistic apparel preview.' }
      ]
    },
    library: {
      eyebrow: 'Library',
      title: 'Start from editable 3D garment models instead of flat artwork previews.',
      buttonLabel: 'Browse 3D Models',
      buttonHref: '/design-3d'
    },
    faq: {
      eyebrow: 'FAQ',
      title: '3D clothing model questions',
      items: [
        { question: 'Can I use these 3D models for apparel mockups?', answer: 'Yes. Choose a model, open the designer, and use it to preview graphics, colorways, and garment presentation angles.' },
        { question: 'Do I need 3D software to customize a model?', answer: 'No. The workflow runs in the browser, so you can preview and adjust designs without opening a desktop 3D application.' },
        { question: 'Which garment categories are available?', answer: 'The library can include tops, hoodies, dresses, outerwear, bottoms, and other apparel categories depending on the active model set.' },
        { question: 'Can I use the renders for product pages?', answer: 'Yes. The mockup workflow is intended for ecommerce previews, presentations, portfolio visuals, and design review materials.' }
      ]
    },
    cta: {
      eyebrow: 'Start creating',
      title: 'Open a model and create your next apparel mockup.',
      description: 'Choose a garment above and move straight into the 3D designer.',
      primaryLabel: 'Browse 3D Models',
      primaryHref: '/design-3d'
    }
  };
}

function mergeLandingContent(defaults, overrides) {
  const merged = { ...defaults };
  Object.keys(overrides || {}).forEach(key => {
    if (Array.isArray(overrides[key])) {
      merged[key] = overrides[key];
    } else if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
      merged[key] = { ...(defaults[key] || {}), ...overrides[key] };
    } else if (overrides[key] !== undefined) {
      merged[key] = overrides[key];
    }
  });
  return merged;
}

function shouldUseLocalModelAssets(req) {
  const host = (req.get('host') || '').toLowerCase();
  return (host.startsWith('localhost') || host.startsWith('127.0.0.1')) && process.env.USE_REMOTE_MODEL_ASSETS !== 'true';
}

function getLandingContent(category, resourceType = '3d-models') {
  const fallbackName = resourceType === 'patterns' ? 'ZPRJ sewing patterns' : '3D clothing models';
  const defaults = getDefaultLandingContent(category ? category.name : fallbackName, resourceType);
  if (!category || !category.landing_content) return defaults;
  try {
    return mergeLandingContent(defaults, JSON.parse(category.landing_content));
  } catch (err) {
    console.warn('Invalid landing_content JSON for category:', category.slug || category.name);
    return defaults;
  }
}

async function ensureModelCategoryTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_slug_redirects (
    old_slug TEXT PRIMARY KEY,
    model_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function getModelCategorySelect() {
  return `
    SELECT
      m.*,
      COALESCE(primary_category.slug, legacy_category.slug) as category_slug,
      GROUP_CONCAT(DISTINCT linked_category.slug) as category_slugs,
      GROUP_CONCAT(DISTINCT linked_category.name) as category_names
    FROM models_3d m
    LEFT JOIN categories legacy_category
      ON m.category = legacy_category.name AND legacy_category.resource_type = '3d-models'
    LEFT JOIN model_3d_categories mc
      ON mc.model_id = m.id
    LEFT JOIN categories linked_category
      ON linked_category.id = mc.category_id AND linked_category.resource_type = '3d-models'
    LEFT JOIN categories primary_category
      ON primary_category.id = (
        SELECT mc_primary.category_id
        FROM model_3d_categories mc_primary
        WHERE mc_primary.model_id = m.id
        ORDER BY mc_primary.is_primary DESC, mc_primary.category_id ASC
        LIMIT 1
      )
  `;
}

function getModelCategoryGroupBy() {
  return 'GROUP BY m.id';
}

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function compactText(value, maxLength = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 80 ? lastSpace : maxLength - 1).trim()}.`;
}

function buildSeoTitle(base, suffix, maxLength = 68) {
  const cleanBase = String(base || '').replace(/\s+/g, ' ').trim();
  const cleanSuffix = String(suffix || '').replace(/\s+/g, ' ').trim();
  const full = cleanSuffix ? `${cleanBase} | ${cleanSuffix}` : cleanBase;
  if (full.length <= maxLength) return full;
  const room = maxLength - cleanSuffix.length - 3;
  if (room > 24) {
    const clipped = cleanBase.slice(0, room);
    const lastSpace = clipped.lastIndexOf(' ');
    return `${clipped.slice(0, lastSpace > 18 ? lastSpace : room).trim()} | ${cleanSuffix}`;
  }
  const clipped = full.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  return clipped.slice(0, lastSpace > 24 ? lastSpace : maxLength).trim();
}

function splitKeywordList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function modelDescriptor(model, categoryName) {
  const text = `${model.name || ''} ${model.description || ''} ${model.tags || ''}`.toLowerCase();
  const descriptors = [];
  if (/hood|hoodie|sweatshirt/.test(text)) descriptors.push('hood shape and upper-body print zones');
  if (/trench|coat|jacket|outerwear|blazer/.test(text)) descriptors.push('outerwear proportions and sleeve panels');
  if (/shirt|t-shirt|tee|top|tank/.test(text)) descriptors.push('front, back, and shoulder artwork areas');
  if (/dress|skirt/.test(text)) descriptors.push('longer fabric surfaces for color and textile studies');
  if (/pants|trouser|jumpsuit/.test(text)) descriptors.push('leg panels and lower-body garment proportions');
  if (/bag|backpack|hat|cap|glove|tie/.test(text)) descriptors.push('accessory surfaces for logo and material previews');
  if (!descriptors.length) descriptors.push(`${String(categoryName || 'apparel').toLowerCase()} silhouette and editable garment surfaces`);
  return descriptors.slice(0, 3);
}

function buildModelSearchIntent(model, categoryName) {
  const category = String(categoryName || 'apparel').toLowerCase();
  const tags = splitKeywordList(model.tags);
  const descriptor = modelDescriptor(model, categoryName).join(', ');
  return compactText([
    `${model.name} is a free ${category} 3D model for online apparel mockups.`,
    `Use the GLB preview and UV texture layout to test ${descriptor}, then export transparent product renders for ecommerce, print-on-demand, client review, or digital fashion planning.`,
    tags.length ? `Related search terms include ${tags.slice(0, 4).join(', ')}.` : ''
  ].filter(Boolean).join(' '), 260);
}

function buildHomeContent(req, models = [], categories = [], patternCount = 0, modelTotal = models.length) {
  const modelCount = Number(modelTotal) || models.length;
  const categoryCount = categories.length;
  const pageUrl = toAbsoluteUrl(req, '/');
  const featuredModels = normalize3dModels(models.slice(0, 6));
  const featuredCategories = categories.slice(0, 8);
  const heroImages = featuredModels
    .filter(model => model.image_url)
    .slice(0, 4)
    .map(model => ({
      src: model.image_url,
      alt: model.name
    }));
  const stats = [
    { value: `${modelCount}+`, label: '3D garment models' },
    { value: `${categoryCount}`, label: 'apparel categories' },
    { value: `${patternCount}+`, label: 'sewing patterns' }
  ];
  const workflow = [
    {
      title: 'Choose a garment model',
      text: 'Start from shirts, hoodies, dresses, coats, pants, bags, hats, and other Design3D-ready apparel models.'
    },
    {
      title: 'Customize color and artwork',
      text: 'Use the browser designer to place logos, prints, graphics, and surface directions on the garment preview.'
    },
    {
      title: 'Review the 3D mockup',
      text: 'Rotate the model, check scale and placement, and compare the design against the garment shape before production.'
    },
    {
      title: 'Export a clean render',
      text: 'Download a high-resolution transparent WebP render for ecommerce pages, launch decks, portfolios, and approvals.'
    }
  ];
  const useCases = [
    {
      title: 'Free 3D model downloads',
      text: 'Find browser-ready clothing models for shirts, hoodies, dresses, coats, pants, accessories, and digital apparel presentations.'
    },
    {
      title: 'CLO 3D and Marvelous Designer workflows',
      text: 'Use model pages alongside downloadable sewing patterns when you need references for CLO 3D, Marvelous Designer, Blender, or apparel review.'
    },
    {
      title: 'Transparent ecommerce renders',
      text: 'Customize the garment online and export a transparent WebP render for product pages, print-on-demand previews, launch decks, and approvals.'
    }
  ];
  const faq = [
    {
      question: 'Can I download free 3D clothing models?',
      answer: 'Yes. ClothingDesign focuses on free Design3D garment resources that can be opened online for mockups, reviewed on detail pages, and used as starting points for apparel presentations.'
    },
    {
      question: 'Do I need CLO 3D or Marvelous Designer to use the 3D models?',
      answer: 'No. The Design3D workflow runs in the browser. CLO 3D and Marvelous Designer patterns are available as supporting resources for teams that also work in desktop garment software.'
    },
    {
      question: 'Which garment models are available?',
      answer: 'The library includes apparel and accessory categories such as T-shirts, shirts, pants, jackets, hoodies, dresses, coats, hats, bags, skirts, and more.'
    },
    {
      question: 'Can I use the exported render on product pages?',
      answer: 'Yes. The render workflow is built for ecommerce previews, product detail pages, portfolio images, client approvals, and campaign planning.'
    }
  ];
  const metaDescription = 'Download free 3D clothing models and create apparel mockups online. Browse shirts, hoodies, dresses and coats, then export transparent WebP renders.';
  const primaryImage = firstImage(req, heroImages.map(image => image.src));
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'ClothingDesign',
      url: pageUrl,
      logo: firstImage(req)
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'ClothingDesign',
      url: pageUrl,
      image: primaryImage,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${toAbsoluteUrl(req, '/design-3d')}?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Free 3D Clothing Models and Apparel Mockup Generator',
      description: metaDescription,
      url: pageUrl,
      image: primaryImage,
      primaryImageOfPage: imageObject(req, primaryImage),
      mainEntity: {
        '@type': 'SoftwareApplication',
        name: 'ClothingDesign Design3D',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web browser',
        description: 'Free browser-based 3D clothing model library and apparel mockup generator for customizing garment models and exporting transparent product renders.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Featured 3D clothing models',
      itemListElement: featuredModels.map((model, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: model.name,
        url: toAbsoluteUrl(req, `/3d-models/${model.category_slug || model.category}/${model.slug}`),
        image: model.image_url ? toAbsoluteUrl(req, model.image_url) : undefined
      }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer
        }
      }))
    }
  ];

  return {
    metaDescription,
    structuredData,
    primaryImage,
    heroImages,
    stats,
    workflow,
    useCases,
    faq,
    featuredModels,
    featuredCategories
  };
}

function buildCollectionStructuredData(req, options = {}) {
  const items = options.items || [];
  const image = firstImage(req, items.map(item => item.image_url));
  return [
    ...pageStructuredData(req, {
      type: 'CollectionPage',
      name: options.name,
      description: options.description,
      path: options.path,
      image,
      breadcrumbs: options.breadcrumbs,
      mainEntity: {
        '@type': 'ItemList',
        name: options.itemListName || options.name,
        numberOfItems: items.length
      }
    }),
    itemList(req, options.itemListName || options.name, items, options.getUrl, item => item.image_url)
  ];
}

function buildSimplePageStructuredData(req, options = {}) {
  return pageStructuredData(req, {
    type: options.type || 'WebPage',
    name: options.name,
    description: options.description,
    path: options.path,
    image: options.image || DEFAULT_SITE_IMAGE_PATH,
    breadcrumbs: options.breadcrumbs,
    mainEntity: options.mainEntity,
    extra: options.extra
  });
}

function buildCategoryStructuredData(req, category, items = [], resourceType, resourceTypeLabel) {
  const basePath = `/${resourceType}/${category.slug}`;
  const collectionPath = resourceType === '3d-models' ? '/design-3d' : `/${resourceType}`;
  const description = category.meta_description || category.description || `Browse ${category.name} ${resourceTypeLabel} on ClothingDesign.`;
  const normalizedItems = resourceType === '3d-models' ? normalize3dModels(items, category.slug) : items;
  const image = firstImage(req, normalizedItems.map(item => item.image_url));

  return [
    ...pageStructuredData(req, {
      type: 'CollectionPage',
      name: category.meta_title || `${category.name} ${resourceTypeLabel}`,
      description,
      path: basePath,
      image,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: resourceTypeLabel, url: collectionPath },
        { name: category.name, url: basePath }
      ],
      mainEntity: {
        '@type': 'ItemList',
        name: `${category.name} ${resourceTypeLabel}`,
        numberOfItems: normalizedItems.length
      }
    }),
    itemList(req, `${category.name} ${resourceTypeLabel}`, normalizedItems, item => {
      if (resourceType === '3d-models') {
        return `/3d-models/${category.slug}/${item.slug}`;
      }
      if (resourceType === 'patterns') {
        return `/patterns/item/${item.id}`;
      }
      return item.url || basePath;
    }, item => item.image_url)
  ];
}

const TOOL_PAGE_CONTENT = {
  't-shirt-designer': {
    title: 'Free T-Shirt Designer Online',
    eyebrow: 'Free custom shirt mockup tool',
    subtitle: 'Design custom T-shirt concepts in your browser, preview artwork on a realistic garment, and export clean visuals for product pages, print-on-demand listings, and brand approvals.',
    intent: 'Build a polished T-shirt mockup before you order samples or open heavy design software. Start from a garment model, test logo scale and color direction, then save a product-ready preview.',
    primaryKeyword: 'free t-shirt designer online',
    keywords: ['custom t-shirt design tool', 't-shirt mockup generator', 'design your own t-shirt free', 'online shirt designer'],
    competitorInsights: [
      'Create front-facing shirt visuals for product validation, launch pages, and quick customer feedback.',
      'Preview print placement and color contrast on a garment shape instead of judging artwork on a blank canvas.',
      'Use free mockup exports when you need clean apparel images before photography or production.'
    ],
    freePositioning: 'ClothingDesign keeps the T-shirt mockup step free, so you can test designs, compare colorways, and prepare review images without paying for a mockup subscription.',
    steps: [
      'Choose a T-shirt model that matches your fit and product direction.',
      'Add your logo, print idea, text layout, or color direction.',
      'Check placement, scale, and contrast on the garment preview.',
      'Download the mockup render for store drafts, client review, or campaign planning.'
    ],
    useCases: ['Print-on-demand previews', 'Brand drop planning', 'Team merch concepts'],
    useCaseDetails: [
      'Prepare a product image before creating a print-on-demand listing.',
      'Compare graphic directions for a capsule collection or merch drop.',
      'Share a clean T-shirt concept with a team, client, club, or event organizer.'
    ],
    faq: [
      { question: 'Can I design a T-shirt online for free?', answer: 'Yes. You can start from a T-shirt model, preview artwork placement, and export a mockup image without buying a paid design tool.' },
      { question: 'Can I use the mockup for a product listing?', answer: 'Yes. The exported visual is useful for draft ecommerce pages, print-on-demand planning, campaign previews, and internal approvals.' },
      { question: 'Do I need Photoshop or 3D software?', answer: 'No. The workflow is browser-based, so you can create a visual preview without editing a PSD file or setting up a desktop 3D scene.' }
    ],
    cta: { label: 'Start with T-Shirt Models', href: '/3d-models/t-shirt-mockup' }
  },
  'hoodie-designer': {
    title: 'Free Hoodie Designer Online',
    eyebrow: 'Free hoodie mockup maker',
    subtitle: 'Create custom hoodie mockups online, test artwork placement on a structured garment, and download presentation-ready visuals for streetwear drops, team apparel, and ecommerce.',
    intent: 'Turn a hoodie idea into a realistic preview without waiting for a sample. Use the model to judge front graphics, sleeve details, colorways, and brand presentation before production.',
    primaryKeyword: 'free hoodie designer online',
    keywords: ['custom hoodie maker', 'hoodie mockup generator', 'design your own hoodie', 'online hoodie design tool'],
    competitorInsights: [
      'Build realistic hoodie previews for oversized fits, streetwear concepts, team merch, and product launches.',
      'Review artwork scale across a bulkier garment where print size and placement are harder to judge.',
      'Export visuals for early sales pages, social posts, buyer decks, or internal line reviews.'
    ],
    freePositioning: 'Use ClothingDesign as a free hoodie mockup step before you commit to print files, product photography, or a paid mockup library.',
    steps: [
      'Open a hoodie or outerwear model from the Design3D library.',
      'Choose the base color and plan front, back, chest, or sleeve artwork.',
      'Review fit, print scale, and overall balance on the garment preview.',
      'Export a clean mockup render for product tests, approvals, or launch content.'
    ],
    useCases: ['Streetwear drops', 'School and team apparel', 'Client approval mockups'],
    useCaseDetails: [
      'Mock up hoodie graphics before producing a streetwear sample.',
      'Create fast visuals for school, club, company, or event merch.',
      'Send a realistic preview to clients before final artwork lockup.'
    ],
    faq: [
      { question: 'Is this hoodie designer free?', answer: 'Yes. You can use the hoodie mockup workflow to preview concepts and create review visuals for free.' },
      { question: 'Can I preview sleeve or back artwork?', answer: 'Use the 3D garment view to plan artwork zones and check how placement works across the hoodie shape.' },
      { question: 'Who is this best for?', answer: 'It is useful for streetwear brands, print-on-demand sellers, schools, teams, agencies, and anyone validating hoodie designs before production.' }
    ],
    cta: { label: 'Browse Hoodie Models', href: '/3d-models/hoodie-mockup' }
  },
  'dress-designer': {
    title: 'Free Dress Design Tool Online',
    eyebrow: 'Free fashion concept preview',
    subtitle: 'Plan dress concepts online with silhouette-focused references, garment mockups, and free resources for fashion presentations, boutique planning, and digital sample review.',
    intent: 'Move a dress idea from sketch-level planning into a visual preview. Use models and pattern resources to explore silhouette, length, fabric direction, and presentation before sample making.',
    primaryKeyword: 'free dress design tool online',
    keywords: ['dress mockup maker', 'design your own dress online', 'fashion dress design tool', 'dress template creator'],
    competitorInsights: [
      'Explore dress silhouettes and presentation angles before investing in sampling.',
      'Use visual mockups to communicate color, proportion, length, and surface detail.',
      'Connect early concept work with sewing patterns and 3D garment previews when the design needs more structure.'
    ],
    freePositioning: 'ClothingDesign gives dress designers a free starting point for visual planning, especially when a flat sketch is not enough and a full CAD workflow is too much.',
    steps: [
      'Start from a dress model, template, or sewing pattern reference.',
      'Define silhouette, length, color, fabric direction, and key details.',
      'Use the preview to check proportion and presentation quality.',
      'Export a visual reference for a moodboard, line review, or sample brief.'
    ],
    useCases: ['Fashion concept boards', 'Boutique product planning', 'Pattern review'],
    useCaseDetails: [
      'Create visuals for a fashion concept board or early collection review.',
      'Plan boutique product ideas before commissioning samples.',
      'Pair dress patterns with mockup visuals to explain fit and construction direction.'
    ],
    faq: [
      { question: 'Can I design a dress online without CAD?', answer: 'Yes. This page gives you a free visual planning workflow that can support dress concepts before you move into CAD, sampling, or pattern work.' },
      { question: 'Is this for fashion designers or shoppers?', answer: 'It is built for apparel creators, boutique teams, students, and designers who need mockups and planning references.' },
      { question: 'Can I use sewing patterns with this workflow?', answer: 'Yes. Pattern resources can help you connect a dress concept with construction references and digital garment review.' }
    ],
    cta: { label: 'Browse Dress Models', href: '/3d-models/dress' }
  },
  '3d-mockup': {
    title: 'Free 3D Clothing Mockup Generator',
    eyebrow: 'Free 3D apparel mockups',
    subtitle: 'Generate 3D clothing mockups from browser-ready garment models and export high-resolution transparent renders for ecommerce, launch decks, and design approvals.',
    intent: 'Create apparel visuals that feel more realistic than flat templates and faster than building a scene from scratch. Choose a model, preview the garment, and export a clean render.',
    primaryKeyword: 'free 3D clothing mockup generator',
    keywords: ['3D apparel mockup generator', 'clothing mockup generator free', 'online 3D product mockup', 'transparent apparel render'],
    competitorInsights: [
      'Create apparel-first mockups instead of searching through generic product mockup libraries.',
      'Use transparent renders for product pages, landing pages, ads, pitch decks, and collection boards.',
      'Preview garment shape and artwork placement in 3D before ordering samples or scheduling photography.'
    ],
    freePositioning: 'ClothingDesign focuses on free apparel-first 3D mockups, giving product teams and creators a practical way to create garment visuals without paid mockup packs.',
    steps: [
      'Pick a 3D clothing model from the library.',
      'Customize color, artwork direction, and viewing angle.',
      'Check garment shape, print scale, and visual balance.',
      'Export a transparent render for ecommerce, presentations, or approvals.'
    ],
    useCases: ['Ecommerce images', 'Product launch decks', 'Portfolio mockups'],
    useCaseDetails: [
      'Prepare clean product images before a photoshoot is ready.',
      'Show a new apparel concept in a buyer deck or launch presentation.',
      'Build a portfolio mockup that makes the garment shape easy to understand.'
    ],
    faq: [
      { question: 'Can I make 3D clothing mockups for free?', answer: 'Yes. You can use Design3D garment models to create and export mockup visuals without buying a PSD mockup pack.' },
      { question: 'What makes a 3D mockup better than a flat template?', answer: 'A 3D mockup helps you judge garment shape, artwork scale, folds, angle, and presentation more clearly than a flat front-view template.' },
      { question: 'Can I export transparent renders?', answer: 'Yes. The workflow is designed for clean render output that can be placed on ecommerce pages, decks, and marketing layouts.' }
    ],
    cta: { label: 'Open 3D Model Library', href: '/design-3d' }
  },
  '2d-mockup': {
    title: 'Free 2D Clothing Mockup Generator',
    eyebrow: 'Free flat apparel mockups',
    subtitle: 'Create quick 2D clothing mockup plans with apparel templates, pattern references, and free visual resources before moving into 3D review.',
    intent: 'Use a flat mockup workflow when you need to communicate artwork placement, garment notes, and early layout ideas quickly.',
    primaryKeyword: 'free 2D clothing mockup generator',
    keywords: ['2D apparel mockup', 'free clothing mockup template', 'flat garment mockup', 'shirt template mockup'],
    competitorInsights: [
      'Plan front, back, sleeve, and label placement before creating a more realistic render.',
      'Use flat views for production notes, line sheets, vendor communication, and simple approvals.',
      'Move from 2D planning to 3D mockups when shape, drape, or product photography matters.'
    ],
    freePositioning: 'ClothingDesign keeps the early flat mockup stage free and connects it to patterns and 3D models when your design needs more realism.',
    steps: [
      'Choose a garment type and collect a flat reference or pattern.',
      'Plan text, artwork, seams, and placement notes.',
      'Use the mockup as a quick communication draft.',
      'Move into 3D preview when you need realistic shape and angles.'
    ],
    useCases: ['Early artwork placement', 'Factory communication', 'Line sheet drafts'],
    useCaseDetails: [
      'Lay out artwork zones before preparing print files.',
      'Share clear garment notes with factories, suppliers, or production partners.',
      'Organize collection ideas in a simple line sheet format.'
    ],
    faq: [
      { question: 'When should I use a 2D clothing mockup?', answer: 'Use 2D mockups for fast planning, artwork placement, vendor notes, and early approvals before you need a realistic product render.' },
      { question: 'Can I move from 2D to 3D later?', answer: 'Yes. Start with flat planning, then open a Design3D model when you need garment shape, angle, and presentation quality.' },
      { question: 'Is this useful for production communication?', answer: 'Yes. Flat mockups are often helpful for showing placement notes, basic construction ideas, and collection organization.' }
    ],
    cta: { label: 'Browse Free Patterns', href: '/patterns' }
  },
  'free-patterns': {
    title: 'Free Sewing Patterns for CLO 3D and Marvelous Designer',
    eyebrow: 'Free digital garment patterns',
    subtitle: 'Browse free sewing pattern resources for CLO 3D, Marvelous Designer, digital garment practice, and apparel mockup planning.',
    intent: 'Find usable pattern resources with clear next steps. Download a garment file, open it in your 3D fashion workflow, and use it for practice, fit review, or mockup creation.',
    primaryKeyword: 'free sewing patterns CLO3D Marvelous Designer',
    keywords: ['free ZPRJ pattern download', 'CLO 3D sewing patterns free', 'Marvelous Designer patterns free', 'digital garment patterns'],
    competitorInsights: [
      'Download patterns for garment simulation, practice projects, portfolio building, and digital sample review.',
      'Use pattern previews and categories to choose the right garment before opening your 3D software.',
      'Pair patterns with Design3D mockups when you need a clearer visual presentation.'
    ],
    freePositioning: 'ClothingDesign makes free pattern discovery practical by connecting downloads with CLO 3D, Marvelous Designer, and apparel mockup workflows.',
    steps: [
      'Browse active sewing pattern previews.',
      'Open a pattern detail page to confirm category and file format.',
      'Download the source file and open it in CLO 3D or Marvelous Designer.',
      'Pair it with related Design3D models for apparel mockup visuals.'
    ],
    useCases: ['Digital garment practice', 'Pattern review', '3D apparel mockup planning'],
    useCaseDetails: [
      'Practice garment simulation with files you can inspect and modify.',
      'Review pattern construction before creating a digital sample.',
      'Use a pattern as the foundation for a more complete apparel mockup workflow.'
    ],
    faq: [
      { question: 'Are these sewing patterns free?', answer: 'Yes. The pattern library is designed around free resources for digital garment practice and apparel design workflows.' },
      { question: 'Can I use the files in CLO 3D or Marvelous Designer?', answer: 'The pattern pages clarify file format and intended workflow so you can choose resources that fit CLO 3D, Marvelous Designer, or related garment software.' },
      { question: 'What should I do after downloading a pattern?', answer: 'Open the file in your 3D garment tool, check the 2D pattern and sewing relationships, then simulate or pair it with a Design3D model for presentation.' }
    ],
    cta: { label: 'Browse Free Sewing Patterns', href: '/patterns' }
  },
  'free-templates': {
    title: 'Free Clothing Templates for Apparel Mockups',
    eyebrow: 'Free apparel template resources',
    subtitle: 'Find free clothing template ideas for shirts, hoodies, dresses, and apparel mockups, then move into 3D previews when you need realistic product presentation.',
    intent: 'Use templates to organize garment ideas quickly, then upgrade the strongest concepts into 3D mockups, pattern references, or product-ready visuals.',
    primaryKeyword: 'free clothing templates',
    keywords: ['free apparel templates', 'free t-shirt template', 'clothing mockup template free', 'fashion design templates'],
    competitorInsights: [
      'Plan apparel artwork, colorways, and collection structure before committing to production assets.',
      'Use flat templates for fast briefs, then switch to 3D models when realistic presentation matters.',
      'Keep templates, sewing patterns, and mockups connected in one free apparel workflow.'
    ],
    freePositioning: 'ClothingDesign treats templates as the start of a real apparel workflow, not a dead-end download page.',
    steps: [
      'Pick the apparel category you want to mock up.',
      'Use a flat template or sewing pattern for early planning.',
      'Translate placement notes into a 3D clothing model when needed.',
      'Export a final render or keep the template as a production reference.'
    ],
    useCases: ['Design briefs', 'Artwork planning', 'Merch line organization'],
    useCaseDetails: [
      'Create a simple visual brief for a new apparel idea.',
      'Plan print areas, trims, colorways, and garment notes before production.',
      'Organize multiple merch or collection concepts in a consistent format.'
    ],
    faq: [
      { question: 'What are clothing templates used for?', answer: 'They help you plan garment layouts, artwork placement, colorways, construction notes, and early collection ideas before creating final product visuals.' },
      { question: 'Are these templates free to start with?', answer: 'Yes. ClothingDesign focuses on free entry points for apparel planning, patterns, and mockups.' },
      { question: 'Should I use a template or a 3D model?', answer: 'Use templates for quick flat planning. Use a 3D model when you need shape, drape, angle, and presentation-ready renders.' }
    ],
    cta: { label: 'Explore Pattern Resources', href: '/patterns' }
  },
  'clo3d-guide': {
    title: 'Free CLO 3D Guide for Beginners',
    eyebrow: 'Free digital fashion guide',
    subtitle: 'Learn the beginner CLO 3D workflow: open garment files, review 2D patterns, simulate fabric, and create apparel visuals for design review.',
    intent: 'Get a practical starting path for CLO 3D. Learn what to open first, what to inspect in the 2D and 3D windows, and how to turn a garment file into a usable preview.',
    primaryKeyword: 'CLO 3D guide for beginners',
    keywords: ['CLO3D tutorial', 'how to use CLO 3D', 'CLO 3D sewing pattern guide', 'digital fashion design guide'],
    competitorInsights: [
      'Understand the practical sequence: open a file, inspect patterns, check sewing, simulate, and export.',
      'Use free practice resources instead of starting from a blank garment file.',
      'Connect CLO 3D learning with real apparel mockup and digital sample workflows.'
    ],
    freePositioning: 'ClothingDesign keeps the CLO 3D learning path resource-led, so beginners can practice with free patterns and connect the result to apparel mockups.',
    steps: [
      'Download a compatible sewing pattern file.',
      'Open the file in CLO 3D and inspect the 2D pattern window.',
      'Check sewing relationships, arrangement, avatar scale, and fabric settings.',
      'Simulate, refine, and export preview images for review.'
    ],
    useCases: ['Beginner garment simulation', 'Pattern learning', 'Digital sample review'],
    useCaseDetails: [
      'Practice the core CLO 3D interface with a real garment file.',
      'Learn how 2D pattern pieces relate to the simulated garment.',
      'Create visual references for fit review, sample discussion, or portfolio work.'
    ],
    faq: [
      { question: 'Is CLO 3D beginner friendly?', answer: 'It is learnable, but beginners do best with a focused workflow: open an existing garment, inspect patterns, check sewing, simulate, and export views.' },
      { question: 'Do I need pattern-making experience?', answer: 'Pattern knowledge helps, but you can start by studying existing pattern files and learning how sewing relationships affect the 3D garment.' },
      { question: 'Where should I practice?', answer: 'Start with free pattern resources, then use Design3D models and mockups to understand how digital garments become presentation visuals.' }
    ],
    cta: { label: 'Practice with Free Patterns', href: '/patterns' }
  },
  'md-guide': {
    title: 'Free Marvelous Designer Guide for Beginners',
    eyebrow: 'Free garment simulation guide',
    subtitle: 'Learn the Marvelous Designer basics for opening garment projects, checking 2D patterns, simulating fit, and preparing apparel visuals.',
    intent: 'Start Marvelous Designer with a practical garment workflow instead of a blank scene. Open a project, understand the 2D/3D relationship, simulate the garment, and prepare useful preview images.',
    primaryKeyword: 'Marvelous Designer guide for beginners',
    keywords: ['Marvelous Designer tutorial', 'how to use Marvelous Designer', 'Marvelous Designer sewing pattern', '3D clothing simulation guide'],
    competitorInsights: [
      'Learn the core loop: pattern pieces, sewing lines, arrangement, simulation, fit review, and export.',
      'Use downloadable garment resources so the first session produces something visible.',
      'Turn simulation practice into mockups, portfolio visuals, and design review images.'
    ],
    freePositioning: 'ClothingDesign keeps Marvelous Designer practice practical and free by pointing beginners toward patterns, garment projects, and mockup next steps.',
    steps: [
      'Download a garment project or sewing pattern file.',
      'Open it in Marvelous Designer and review the 2D/3D workspace.',
      'Inspect sewing lines, fabric assignments, and avatar placement.',
      'Run simulation, adjust fit, and save a clean project version.'
    ],
    useCases: ['Beginner MD practice', 'Fit and fabric simulation', 'Garment presentation prep'],
    useCaseDetails: [
      'Learn Marvelous Designer with an existing file instead of starting from scratch.',
      'Practice fit and fabric simulation for digital garment review.',
      'Prepare apparel visuals for portfolios, presentations, or production conversations.'
    ],
    faq: [
      { question: 'Can beginners learn Marvelous Designer with free resources?', answer: 'Yes. Existing garment files and sewing patterns make it easier to learn the interface, simulation, and export workflow.' },
      { question: 'What should I learn first?', answer: 'Start with the relationship between 2D pattern pieces and the 3D garment, then practice sewing, arrangement, fabric settings, simulation, and fit review.' },
      { question: 'Can I use the results as mockups?', answer: 'Yes. Once the garment is simulated cleanly, export preview images or connect the workflow with Design3D mockups for presentation.' }
    ],
    cta: { label: 'Download Practice Patterns', href: '/patterns' }
  }
};

function getToolPage(slug) {
  const page = TOOL_PAGE_CONTENT[slug];
  if (!page) return null;
  const image = `/images/tools/${slug}.webp`;
  const related = Object.entries(TOOL_PAGE_CONTENT)
    .filter(([key]) => key !== slug)
    .slice(0, 3)
    .map(([key, value]) => ({ slug: key, title: value.title, primaryKeyword: value.primaryKeyword }));
  return { slug, image, ...page, related };
}

function buildToolStructuredData(req, toolPage) {
  const path = `/tools/${toolPage.slug}`;
  return [
    ...buildSimplePageStructuredData(req, {
      type: 'WebPage',
      name: toolPage.title,
      description: toolPage.subtitle,
      path,
      image: toolPage.image,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Tools', url: '/tools' },
        { name: toolPage.title, url: path }
      ],
      mainEntity: {
        '@type': 'SoftwareApplication',
        name: toolPage.title,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web browser',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        },
        image: firstImage(req, [toolPage.image])
      }
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: `How to use ${toolPage.title}`,
      description: toolPage.intent,
      step: toolPage.steps.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        text: step
      }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (toolPage.faq || []).map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer
        }
      }))
    }
  ];
}

async function findDesign3dCategoryForPattern(pattern) {
  const categoryName = pattern?.category || '';
  const categorySlug = pattern?.category_slug || '';
  const generatedSlug = toSlug(categoryName);
  if (!categoryName && !categorySlug) return null;

  return db.get(`
    SELECT *
    FROM categories
    WHERE resource_type = ? AND status = ?
      AND (LOWER(name) = LOWER(?) OR slug = ? OR slug = ?)
    ORDER BY
      CASE
        WHEN LOWER(name) = LOWER(?) THEN 0
        WHEN slug = ? THEN 1
        ELSE 2
      END,
      sort_order ASC,
      name ASC
    LIMIT 1
  `, ['3d-models', 'active', categoryName, categorySlug, generatedSlug, categoryName, categorySlug]);
}

function getPatternSeriesInfo(pattern) {
  const name = String(pattern?.name || '');
  const slug = String(pattern?.slug || '');
  const source = `${name} ${slug}`;
  const collectionNumberMatch = source.match(/\b0?(\d{1,3})\s+Collection\s+([12])\b/i);
  const pMatch = source.match(/\bP0?(\d{1,3})\b/i);
  const namedSampleMatch = source.match(/\b(?:Pattern|Look|Sample)\s+0?(\d{1,3})\b/i);
  const number = collectionNumberMatch
    ? collectionNumberMatch[1].padStart(2, '0')
    : (pMatch ? pMatch[1].padStart(2, '0') : (namedSampleMatch ? namedSampleMatch[1].padStart(2, '0') : ''));
  let collection = '';

  if (collectionNumberMatch) {
    collection = `Collection ${collectionNumberMatch[2]}`;
  } else if (/vol(?:ume)?\s*2|collection\s*2/i.test(source)) {
    collection = 'Vol 2';
  } else if (/collection\s*1/i.test(source)) {
    collection = 'Collection 1';
  } else if (/6588|t-shirt zprj sewing pattern/i.test(source)) {
    collection = 'T-shirt sample series';
  }

  return {
    number,
    collection,
    label: [collection, number ? `sample ${number}` : ''].filter(Boolean).join(' ')
  };
}

function getPatternCategoryGuide(categoryName) {
  const normalized = String(categoryName || '').toLowerCase();
  const guides = [
    {
      test: /t-?shirts?/,
      garment: 'T-shirt',
      intent: 'fast jersey top mockups, print placement tests, and everyday apparel fit checks',
      construction: 'neckline shape, sleeve balance, hem level, side seam position, and graphic scale',
      useCase: 'merch concepts, ecommerce previews, and fit comparison across T-shirt silhouettes'
    },
    {
      test: /hood/,
      garment: 'hoodie',
      intent: 'casualwear mockups, hood construction checks, and sweatshirt colorway development',
      construction: 'hood volume, cuff tension, pocket placement, rib trim, and shoulder drape',
      useCase: 'streetwear sampling, brand merch decks, and warm-up garment reviews'
    },
    {
      test: /outerwear|coat|jacket|blazer/,
      garment: 'outerwear',
      intent: 'structured layer simulation, seasonal line review, and jacket or coat presentation',
      construction: 'collar roll, sleeve pitch, closure placement, layer clearance, and fabric weight',
      useCase: 'outerwear sampling, buyer previews, and technical construction discussions'
    },
    {
      test: /women shirts?|shirts?/,
      garment: normalized.includes('women') ? 'women shirt' : 'shirt',
      intent: 'shirt and blouse development, collar review, sleeve fit, and woven top simulation',
      construction: 'collar stand, button placket, cuff shape, yoke position, and sleeve cap balance',
      useCase: 'woven apparel prototyping, fit review, and design handoff'
    },
    {
      test: /dress/,
      garment: 'dress',
      intent: 'one-piece silhouette review, drape testing, and digital dress sample development',
      construction: 'bodice balance, waist placement, skirt volume, hem sweep, and fabric fall',
      useCase: 'fashion line planning, ecommerce mockups, and fit presentation'
    },
    {
      test: /skirt/,
      garment: 'skirt',
      intent: 'skirt silhouette exploration, hem shape review, and bottom-weight fabric simulation',
      construction: 'waistband fit, side seam balance, flare, pleat behavior, and hem level',
      useCase: 'range planning, drape studies, and digital sample comparison'
    },
    {
      test: /pants|trouser/,
      garment: 'pants',
      intent: 'trouser fit checks, leg shape review, and bottom garment mockup preparation',
      construction: 'rise, waistband, crotch curve, leg opening, pocket placement, and fabric tension',
      useCase: 'fit sessions, technical review, and product page draft visuals'
    },
    {
      test: /bags?|accessor/,
      garment: normalized.includes('bag') ? 'bag accessory' : 'fashion accessory',
      intent: 'accessory visualization, proportion checks, and 3D product sample presentation',
      construction: 'strap length, body volume, seam placement, handle position, and hardware scale',
      useCase: 'accessory mockups, product concept review, and styling presentation'
    },
    {
      test: /underwear/,
      garment: 'underwear',
      intent: 'close-fit garment simulation, stretch material review, and intimate apparel sampling',
      construction: 'elastic placement, seam tension, leg opening, waistband behavior, and fit pressure',
      useCase: 'close-fit sample review, material testing, and private label development'
    },
    {
      test: /sportswear/,
      garment: 'sportswear',
      intent: 'teamwear visualization, active apparel simulation, and movement-ready sample review',
      construction: 'panel placement, sleeve mobility, neckline comfort, graphic zones, and fabric stretch',
      useCase: 'team kit mockups, activewear line review, and sponsor artwork testing'
    }
  ];
  const guide = guides.find(item => item.test.test(normalized));
  return guide || {
    garment: categoryName || 'apparel garment',
    intent: 'digital apparel prototyping, garment simulation, fit review, and 3D sample handoff',
    construction: 'pattern piece balance, sewing relationships, avatar scale, fabric settings, and garment drape',
    useCase: 'CLO 3D review, Marvelous Designer simulation, and apparel production planning'
  };
}

function buildPatternDetailContent(pattern, design3dCategory, req) {
  const format = String(pattern.format || 'zprj').replace(/^\./, '').toLowerCase();
  const fileExt = `.${format}`;
  const categoryName = pattern.category || 'apparel';
  const design3dCategoryName = design3dCategory?.name || categoryName;
  const design3dHref = design3dCategory?.slug ? `/3d-models/${design3dCategory.slug}` : '/design-3d';
  const series = getPatternSeriesInfo(pattern);
  const guide = getPatternCategoryGuide(categoryName);
  const pageTitle = buildSeoTitle(pattern.name, `Free ${format.toUpperCase()} Pattern #${pattern.id}`);
  const description = compactText(`${pattern.name} is a free ${fileExt.toUpperCase()} ${guide.garment} pattern for ${guide.intent}. Open it in CLO 3D or Marvelous Designer and pair it with ${design3dCategoryName} 3D apparel models.`, 158);
  const seriesContext = series.label ? ` This page belongs to the ${series.label} group, so compare it with nearby files when reviewing silhouette options.` : '';
  const patternHighlights = [
    { label: 'Best for', value: guide.intent },
    { label: 'Review focus', value: guide.construction },
    { label: 'Workflow use', value: guide.useCase }
  ];
  const faqItems = [
    {
      question: `Can I use ${pattern.name} in CLO 3D?`,
      answer: `Yes. Download the ${fileExt} file, open CLO 3D, and use File > Open Project to load the sewing pattern with its garment data.`
    },
    {
      question: `Can I use ${pattern.name} in Marvelous Designer?`,
      answer: `Yes. Marvelous Designer can open ${fileExt.toUpperCase()} project files, so you can import the file, inspect the 2D pattern window, and simulate the garment.`
    },
    {
      question: 'Does this pattern include a preview image?',
      answer: pattern.image_url
        ? 'Yes. The preview image on this page helps you check the pattern before downloading the source file.'
        : 'The source file is available from the download action. A preview image may be added by the admin team when available.'
    },
    {
      question: 'How do I create a 3D mockup with this file category?',
      answer: `Use the CTA on this page to open the ${design3dCategoryName} Design 3D category, choose a matching model, and apply artwork or colorways in the browser.`
    }
  ];
  const pageUrl = toAbsoluteUrl(req, req.originalUrl);
  const imageUrl = firstImage(req, [pattern.image_url]);
  const fileUrl = toAbsoluteUrl(req, pattern.file_url);

  return {
    fileExt,
    categoryName,
    design3dCategoryName,
    design3dHref,
    pageTitle,
    metaDescription: description,
    primaryImage: imageUrl,
    searchIntentSummary: `${pattern.name} is useful for ${guide.intent}.${seriesContext}`,
    patternHighlights,
    faqItems,
    cloIntro: `Use ${pattern.name} as a CLO 3D project file for ${guide.garment} development. Open the project, inspect ${guide.construction}, then simulate and refine the garment before creating review visuals.${seriesContext}`,
    marvelousIntro: `Use ${pattern.name} in Marvelous Designer when you need to review ${guide.construction}. It is especially useful for ${guide.useCase}.`,
    cloSteps: [
      `Download the ${fileExt} file from this page and keep the project file in an easy-to-find folder.`,
      'Open CLO 3D, then choose File > Open Project and select the downloaded file.',
      'Check the 2D pattern window, arrangement points, sewing lines, fabric settings, and avatar scale before simulation.',
      'Simulate the garment, adjust fabric or fit details, and export screenshots or turntable previews for review.'
    ],
    cloStepCards: [
      {
        icon: 'download',
        title: 'Download the project file',
        body: `Save the ${fileExt} source file locally so CLO 3D can open the complete garment project.`
      },
      {
        icon: 'open',
        title: 'Open it in CLO 3D',
        body: 'Use File > Open Project, select the downloaded file, and let CLO 3D load the garment setup.'
      },
      {
        icon: 'inspect',
        title: 'Check construction details',
        body: `Review ${guide.construction} before simulation.`
      },
      {
        icon: 'simulate',
        title: 'Simulate and export previews',
        body: 'Run simulation, tune fit or fabric behavior, then export screenshots or turntable views for review.'
      }
    ],
    marvelousSteps: [
      `Download the ${fileExt} pattern file and open Marvelous Designer on your desktop.`,
      'Use File > Open Project to load the file, or drag the project file into the application window.',
      'Review the 2D pattern pieces, sewing relationship, fabric assignment, and garment placement around the avatar.',
      'Run simulation, refine fit or material settings, and save a new project version before production handoff.'
    ],
    marvelousStepCards: [
      {
        icon: 'download',
        title: 'Prepare the pattern project',
        body: `Download the ${fileExt} file and keep it with any related production notes or references.`
      },
      {
        icon: 'open',
        title: 'Open in Marvelous Designer',
        body: 'Choose File > Open Project or drag the project file into Marvelous Designer to load the garment.'
      },
      {
        icon: 'inspect',
        title: 'Review 2D and 3D setup',
        body: `Check ${guide.construction}, plus fabric assignment and avatar placement.`
      },
      {
        icon: 'simulate',
        title: 'Refine and save the result',
        body: 'Run simulation, adjust fit or material settings, then save a clean project version for handoff.'
      }
    ],
    structuredData: [
      ...pageStructuredData(req, {
        type: 'WebPage',
        name: pattern.name,
        description,
        path: req.originalUrl,
        image: imageUrl,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Sewing Patterns', url: '/patterns' },
          { name: categoryName, url: pattern.category_slug ? `/patterns/${pattern.category_slug}` : '/patterns' },
          { name: pattern.name, url: req.originalUrl }
        ]
      }),
      {
        '@context': 'https://schema.org',
        '@type': 'DigitalDocument',
        name: pattern.name,
        description,
        fileFormat: fileExt,
        encodingFormat: format,
        url: pageUrl,
        image: imageUrl,
        primaryImageOfPage: imageObject(req, imageUrl),
        associatedMedia: fileUrl,
        keywords: pattern.tags || undefined,
        isPartOf: {
          '@type': 'CollectionPage',
          name: `${categoryName} sewing patterns`
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer
          }
        }))
      }
    ]
  };
}

function buildModelDetailContent(model, related, req) {
  const categoryName = model.category_label || model.category || 'apparel';
  const categorySlug = model.category_slug || toSlug(categoryName);
  const modelUrl = toAbsoluteUrl(req, req.originalUrl);
  const imageUrl = firstImage(req, [model.image_url]);
  const fileUrl = toAbsoluteUrl(req, model.file_url);
  const designHref = `/3d-models/${categorySlug}/${model.slug}/edit`;
  const pageTitle = buildSeoTitle(model.name, `Free ${categoryName} 3D Model`);
  const searchIntentSummary = buildModelSearchIntent(model, categoryName);
  const descriptorList = modelDescriptor(model, categoryName);
  const description = compactText(`Free ${categoryName} 3D model for apparel mockups. Customize artwork with GLB and UV assets, then export transparent WebP product renders.`, 158);
  const tagList = splitKeywordList(model.tags);
  const formatNotes = [
    { label: 'Format', value: 'GLB / GLTF preview model' },
    { label: 'Texture Layout', value: model.texture_url ? 'Packed UV SVG available' : 'Browser preview asset' },
    { label: 'Best For', value: `${categoryName} mockups and product renders` },
    { label: 'Output', value: 'Transparent WebP render export' }
  ];
  const howToSteps = [
    {
      title: 'Open the 3D model',
      body: `Start with ${model.name} and inspect ${descriptorList[0]} before applying artwork.`
    },
    {
      title: 'Check the UV artwork zones',
      body: model.texture_url
        ? 'Use the packed UV template to place logos, repeats, panel colors, or graphic notes on the mapped garment surfaces.'
        : 'Use the garment preview to plan logo scale, color direction, and surface placement before export.'
    },
    {
      title: 'Review fit and presentation angles',
      body: `Rotate the model to judge ${descriptorList.slice(1).join(', ') || 'silhouette balance, scale, and presentation quality'} across product views.`
    },
    {
      title: 'Export review-ready visuals',
      body: 'Download a transparent render for ecommerce drafts, launch decks, client approvals, internal line reviews, or campaign planning.'
    }
  ];
  const applications = [
    {
      title: 'Ecommerce product previews',
      body: `Use ${model.name} to create consistent ${String(categoryName).toLowerCase()} product visuals before photography or sample production.`
    },
    {
      title: 'Artwork and material testing',
      body: `Compare colorways, surface graphics, material direction, and ${descriptorList[0]} while the design is still easy to change.`
    },
    {
      title: 'Buyer and team approvals',
      body: 'Share a clearer 3D clothing mockup with merch teams, factories, buyers, agencies, and creative stakeholders.'
    }
  ];
  const faqItems = [
    {
      question: `What is ${model.name} best used for?`,
      answer: `${model.name} is best used for ${categoryName} apparel mockups, design reviews, ecommerce previews, and early product presentation visuals.`
    },
    {
      question: `Does ${model.name} include a GLB model and UV template?`,
      answer: model.texture_url
        ? `Yes. This page includes a browser-ready GLB preview and a packed UV texture layout for placing artwork on the ${String(categoryName).toLowerCase()} surfaces.`
        : 'The page includes a browser-ready GLB preview for online mockup work. UV template availability depends on the model asset.'
    },
    {
      question: 'Can I customize the 3D clothing model online?',
      answer: 'Yes. Open the Design 3D editor from this page to preview the model and test colors, graphics, and placement ideas in the browser.'
    },
    {
      question: 'Do I need CLO 3D or Marvelous Designer to use this model?',
      answer: 'No. The page is designed for browser-based mockup work. Desktop 3D software can still be useful for advanced garment simulation or pattern work.'
    },
    {
      question: 'Can I use this model for product page mockups?',
      answer: 'Yes. The model is intended for product page previews, launch decks, portfolio presentation, and internal apparel review workflows.'
    }
  ];

  return {
    metaDescription: description,
    primaryImage: imageUrl,
    pageTitle,
    designHref,
    searchIntentSummary,
    formatNotes,
    tagList,
    howToSteps,
    applications,
    faqItems,
    cta: {
      eyebrow: 'Design 3D',
      title: `Customize ${model.name} in the 3D designer.`,
      description: 'Open the editor, apply your artwork direction, and create a polished apparel mockup from this model.',
      primaryLabel: 'Design This Model',
      primaryHref: designHref,
      secondaryLabel: 'Browse 3D Models',
      secondaryHref: '/design-3d'
    },
    structuredData: [
      ...pageStructuredData(req, {
        type: 'WebPage',
        name: model.name,
        description,
        path: req.originalUrl,
        image: imageUrl,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: '3D Clothing Models', url: '/design-3d' },
          { name: categoryName, url: `/3d-models/${categorySlug}` },
          { name: model.name, url: req.originalUrl }
        ]
      }),
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: model.name,
        description,
        url: modelUrl,
        image: imageUrl,
        primaryImageOfPage: imageObject(req, imageUrl),
        associatedMedia: fileUrl,
        genre: '3D clothing model',
        keywords: [model.name, categoryName, ...tagList, 'Design 3D', '3D apparel mockup', '3D clothing model', 'GLB clothing model'].filter(Boolean),
        encodingFormat: 'model/gltf-binary',
        isPartOf: {
          '@type': 'CollectionPage',
          name: `${categoryName} 3D clothing models`
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: `How to design with ${model.name}`,
        description: `A practical workflow for creating a 3D apparel mockup with ${model.name}.`,
        step: howToSteps.map((step, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          name: step.title,
          text: step.body
        }))
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer
          }
        }))
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Related ${categoryName} 3D models`,
        itemListElement: (related || []).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: toAbsoluteUrl(req, `/3d-models/${item.category_slug || item.category}/${item.slug}`)
        }))
      }
    ]
  };
}

function isAllowedTextureUrl(rawUrl) {
  if (typeof rawUrl === 'string' && rawUrl.startsWith('/uploads/texture/') && rawUrl.toLowerCase().endsWith('.svg')) {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    const allowedHosts = new Set([
      'cdn.cloz-design.com',
      'e489597fdfb0f919ee36dcdfcda08328.r2.cloudflarestorage.com'
    ]);
    if (process.env.R2_PUBLIC_URL) {
      allowedHosts.add(new URL(process.env.R2_PUBLIC_URL).hostname);
    }
    return url.protocol === 'https:' && allowedHosts.has(url.hostname) && url.pathname.toLowerCase().endsWith('.svg');
  } catch (err) {
    return false;
  }
}

async function findActive3dModelBySlug(slug) {
  await ensureModelCategoryTable();
  const model = await db.get(`
    ${getModelCategorySelect()}
    WHERE m.slug = ? AND m.status = ?
    ${getModelCategoryGroupBy()}
  `, [slug, 'active']);

  if (model) {
    return normalize3dModel(model);
  }

  const redirectedModel = await db.get(`
    ${getModelCategorySelect()}
    INNER JOIN model_3d_slug_redirects sr
      ON sr.model_id = m.id
    WHERE sr.old_slug = ? AND m.status = ?
    ${getModelCategoryGroupBy()}
  `, [slug, 'active']);

  if (redirectedModel) {
    return normalize3dModel(redirectedModel);
  }

  const legacyModels = await db.all(`
    ${getModelCategorySelect()}
    WHERE (m.slug IS NULL OR m.slug = '') AND m.status = ?
    ${getModelCategoryGroupBy()}
  `, ['active']);

  const legacyModel = (legacyModels || []).find(item => getModelSlug(item) === slug);
  return legacyModel ? normalize3dModel(legacyModel) : null;
}

function redirectToCanonical3dModel(req, res, model, editPath = false) {
  const canonicalPath = `/3d-models/${model.category_slug || model.category}/${model.slug}${editPath ? '/edit' : ''}`;
  if (req.path !== canonicalPath) {
    res.redirect(301, canonicalPath);
    return true;
  }
  return false;
}

router.get('/api/texture-svg', async (req, res) => {
  const textureUrl = req.query.url;
  if (!textureUrl || !isAllowedTextureUrl(textureUrl)) {
    return res.status(400).json({ error: 'Invalid texture URL' });
  }

  try {
    if (textureUrl.startsWith('/uploads/texture/')) {
      const textureRoot = path.resolve(__dirname, '..', 'public', 'uploads', 'texture');
      const texturePath = path.resolve(__dirname, '..', 'public', textureUrl.replace(/^\/+/, ''));
      if (!texturePath.startsWith(textureRoot + path.sep)) {
        return res.status(400).json({ error: 'Invalid texture URL' });
      }
      const svgText = await fs.promises.readFile(texturePath, 'utf8');
      if (!svgText.trim().startsWith('<svg')) {
        return res.status(415).json({ error: 'Texture is not SVG' });
      }
      return res.type('image/svg+xml').send(svgText);
    }

    const response = await fetch(textureUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to load texture' });
    }
    const contentType = response.headers.get('content-type') || '';
    const svgText = await response.text();
    if (!contentType.includes('svg') && !svgText.trim().startsWith('<svg')) {
      return res.status(415).json({ error: 'Texture is not SVG' });
    }
    res.type('image/svg+xml').send(svgText);
  } catch (err) {
    console.error('Error proxying texture SVG:', err);
    res.status(502).json({ error: 'Failed to proxy texture' });
  }
});

// Home page
router.get('/', async (req, res) => {
  try {
    await ensureModelCategoryTable();
    const models = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ?
      ${getModelCategoryGroupBy()}
      ORDER BY m.updated_at DESC, m.created_at DESC
      LIMIT 6
    `, ['active']);
    const categories = await db.all(
      'SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC',
      ['3d-models', 'active']
    );
    const modelSummary = await db.get('SELECT COUNT(*) as count FROM models_3d WHERE status = ?', ['active']);
    const patternSummary = await db.get('SELECT COUNT(*) as count FROM patterns WHERE status = ?', ['active']);
    const homeContent = buildHomeContent(req, models || [], categories || [], patternSummary?.count || 0, modelSummary?.count || 0);

    res.render('index', {
      title: req.t('home.title'),
      metaDescription: homeContent.metaDescription,
      metaImage: homeContent.primaryImage,
      structuredData: homeContent.structuredData,
      page: 'home',
      homeContent
    });
  } catch (err) {
    console.error('Error loading home page content:', err);
    const homeContent = buildHomeContent(req);
    res.render('index', {
      title: req.t('home.title'),
      metaDescription: homeContent.metaDescription,
      metaImage: homeContent.primaryImage,
      structuredData: homeContent.structuredData,
      page: 'home',
      homeContent
    });
  }
});

// Design 3D
router.get('/design-3d', async (req, res) => {
  try {
    await ensureModelCategoryTable();
    const models = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ? 
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC
    `, ['active']);
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order', ['3d-models', 'active']);
    const normalizedModels = normalize3dModels(models);
    const description = 'Browse free 3D clothing models for apparel mockups. Customize shirts, hoodies, dresses and coats online, then export high-resolution transparent renders.';
    const collectionImage = firstImage(req, normalizedModels.map(model => model.image_url));
    
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      metaDescription: description,
      metaImage: collectionImage,
      structuredData: buildCollectionStructuredData(req, {
        name: 'Free 3D Clothing Models',
        description,
        path: '/design-3d',
        items: normalizedModels,
        itemListName: 'Free Design3D clothing model library',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: '3D Clothing Models', url: '/design-3d' }
        ],
        getUrl: model => `/3d-models/${model.category_slug || model.category}/${model.slug}`
      }),
      page: 'design-3d',
      models: normalizedModels,
      categories: categories || [],
      landingContent: getLandingContent()
    });
  } catch (err) {
    console.error('Error loading 3D models:', err);
    const description = 'Browse free 3D clothing models for apparel mockups. Customize shirts, hoodies, dresses and coats online, then export high-resolution transparent renders.';
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      metaDescription: description,
      structuredData: buildCollectionStructuredData(req, {
        name: '3D Clothing Models',
        description,
        path: '/design-3d',
        items: [],
        itemListName: 'Design3D clothing model library',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: '3D Clothing Models', url: '/design-3d' }
        ]
      }),
      page: 'design-3d',
      models: [],
      categories: [],
      landingContent: getLandingContent()
    });
  }
});

// Hidden legacy Design 2D page
router.get('/design-2d', (req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

// Sew Patterns
router.get('/patterns', async (req, res) => {
  try {
    const patterns = await db.all('SELECT * FROM patterns WHERE status = ? ORDER BY created_at DESC', ['active']);
    const categories = await db.all(
      'SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC',
      ['patterns', 'active']
    );
    const description = 'Browse downloadable CLO 3D and Marvelous Designer sewing patterns for apparel development, garment review, and 3D mockup workflows.';
    const patternImage = firstImage(req, (patterns || []).map(pattern => pattern.image_url));

    res.render('patterns', {
      title: req.t('patterns.title'),
      metaDescription: description,
      metaImage: patternImage,
      structuredData: buildCollectionStructuredData(req, {
        name: 'Sewing Patterns',
        description,
        path: '/patterns',
        items: patterns || [],
        itemListName: 'CLO 3D and Marvelous Designer sewing patterns',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Sewing Patterns', url: '/patterns' }
        ],
        getUrl: pattern => `/patterns/item/${pattern.id}`
      }),
      page: 'patterns',
      patterns: patterns || [],
      categories: categories || []
    });
  } catch (err) {
    console.error('Error loading patterns:', err);
    const description = 'Browse downloadable CLO 3D and Marvelous Designer sewing patterns for apparel development, garment review, and 3D mockup workflows.';
    res.render('patterns', {
      title: req.t('patterns.title'),
      metaDescription: description,
      metaImage: firstImage(req),
      structuredData: buildCollectionStructuredData(req, {
        name: 'Sewing Patterns',
        description,
        path: '/patterns',
        items: [],
        itemListName: 'CLO 3D and Marvelous Designer sewing patterns',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Sewing Patterns', url: '/patterns' }
        ]
      }),
      page: 'patterns',
      patterns: [],
      categories: []
    });
  }
});

// Sew Pattern Detail Page
router.get('/patterns/item/:id', async (req, res) => {
  try {
    const pattern = await db.get(`
      SELECT p.*, c.slug as category_slug
      FROM patterns p
      LEFT JOIN categories c ON p.category = c.name AND c.resource_type = 'patterns'
      WHERE p.id = ? AND p.status = ?
    `, [req.params.id, 'active']);

    if (!pattern) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }

    const related = await db.all(`
      SELECT p.*, c.slug as category_slug
      FROM patterns p
      LEFT JOIN categories c ON p.category = c.name AND c.resource_type = 'patterns'
      WHERE p.category = ? AND p.id != ? AND p.status = ?
      ORDER BY p.created_at DESC
      LIMIT 4
    `, [pattern.category, pattern.id, 'active']);

    const design3dCategory = await findDesign3dCategoryForPattern(pattern);
    const patternDetailContent = buildPatternDetailContent(pattern, design3dCategory, req);

    res.render('pattern-detail', {
      title: patternDetailContent.pageTitle,
      metaDescription: patternDetailContent.metaDescription,
      metaRobots: shouldIndexPattern(pattern) ? undefined : 'noindex,follow',
      metaImage: patternDetailContent.primaryImage,
      structuredData: patternDetailContent.structuredData,
      page: 'patterns',
      pattern,
      patternDetailContent,
      design3dCategory,
      related: related || []
    });
  } catch (err) {
    console.error('Error loading pattern detail:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// Get Inspired (Gallery)
router.get('/gallery', (req, res) => {
  const description = 'Explore apparel design inspiration, clothing mockup ideas, and garment presentation examples from ClothingDesign.';
  res.render('gallery', { 
    title: req.t('gallery.title'),
    metaDescription: description,
    metaImage: firstImage(req),
    structuredData: buildSimplePageStructuredData(req, {
      type: 'CollectionPage',
      name: 'Design Gallery',
      description,
      path: '/gallery',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Design Gallery', url: '/gallery' }
      ]
    }),
    page: 'gallery'
  });
});

// Tools
router.get('/tools', (req, res) => {
  const description = 'Use clothing design tools, apparel mockup generators, free downloads, and learning resources for 3D fashion workflows.';
  res.render('tools', { 
    title: req.t('tools.title'),
    metaDescription: description,
    metaImage: firstImage(req, ['/images/tools/3d-mockup.webp']),
    structuredData: buildSimplePageStructuredData(req, {
      type: 'CollectionPage',
      name: 'Design Tools',
      description,
      path: '/tools',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Design Tools', url: '/tools' }
      ],
      mainEntity: {
        '@type': 'ItemList',
        name: 'ClothingDesign tools',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'T-Shirt Designer', url: toAbsoluteUrl(req, '/tools/t-shirt-designer') },
          { '@type': 'ListItem', position: 2, name: '3D Mockup Generator', url: toAbsoluteUrl(req, '/tools/3d-mockup') },
          { '@type': 'ListItem', position: 3, name: 'Free Sewing Patterns', url: toAbsoluteUrl(req, '/tools/free-patterns') }
        ]
      }
    }),
    page: 'tools'
  });
});

// Pricing
router.get('/pricing', (req, res) => {
  const description = 'Compare ClothingDesign plans for 3D clothing models, apparel mockups, high-resolution exports, and team workflows.';
  res.render('pricing', { 
    title: req.t('pricing.title'),
    metaDescription: description,
    metaImage: firstImage(req),
    structuredData: buildSimplePageStructuredData(req, {
      type: 'WebPage',
      name: 'ClothingDesign Plans',
      description,
      path: '/pricing',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Plans', url: '/pricing' }
      ],
      mainEntity: {
        '@type': 'OfferCatalog',
        name: 'ClothingDesign plans',
        itemListElement: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Enterprise', price: '99', priceCurrency: 'USD' }
        ]
      }
    }),
    page: 'pricing'
  });
});

// ==================== SEO Category Routes ====================

// 3D Models Category Route
router.get('/3d-models/:slug', async (req, res) => {
  try {
    await ensureModelCategoryTable();
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, '3d-models', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ?
        AND (
          m.category = ?
          OR EXISTS (
            SELECT 1
            FROM model_3d_categories mc_filter
            WHERE mc_filter.model_id = m.id
              AND mc_filter.category_id = ?
          )
        )
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC
    `, ['active', category.name, category.id]);

    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order', 
      ['3d-models', 'active']
    );
    const allModels = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ?
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC
    `, ['active']);
    const normalizedItems = normalize3dModels(items, category.slug);
    const normalizedAllModels = normalize3dModels(allModels);
    const description = category.meta_description || category.description || `Browse ${category.name} 3D clothing models for apparel mockups and browser-based Design3D workflows.`;
    const categoryImage = firstImage(req, normalizedItems.map(item => item.image_url));
    
    res.render('category-landing', {
      title: buildSeoTitle(category.meta_title || `${category.name} 3D Models`, 'ClothingDesign'),
      metaDescription: description,
      metaImage: categoryImage,
      structuredData: buildCategoryStructuredData(req, category, normalizedItems, '3d-models', '3D Models'),
      page: 'design-3d',
      category: category,
      items: normalizedItems,
      categories: categories || [],
      models: normalizedAllModels,
      landingContent: getLandingContent(category),
      resourceType: '3d-models',
      resourceTypeLabel: '3D Models'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// Hidden legacy 2D templates category route
router.get('/2d-templates/:slug', async (req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

// Patterns Category Route
router.get('/patterns/:slug', async (req, res) => {
  try {
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, 'patterns', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all('SELECT * FROM patterns WHERE category = ? AND status = ? ORDER BY created_at DESC',
      [category.name, 'active']
    );
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order',
      ['patterns', 'active']
    );
    const description = category.meta_description || category.description || `Browse ${category.name} sewing patterns for CLO 3D, Marvelous Designer, and apparel development workflows.`;
    const categoryImage = firstImage(req, (items || []).map(item => item.image_url));
    
    res.render('category-landing', {
      title: buildSeoTitle(category.meta_title || `${category.name} Sew Patterns`, 'ClothingDesign'),
      metaDescription: description,
      metaImage: categoryImage,
      structuredData: buildCategoryStructuredData(req, category, items || [], 'patterns', 'Sew Patterns'),
      page: 'patterns',
      category: category,
      items: items || [],
      categories: categories || [],
      landingContent: getLandingContent(category, 'patterns'),
      resourceType: 'patterns',
      resourceTypeLabel: 'Sew Patterns'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// Gallery Category Route
router.get('/gallery/:slug', async (req, res) => {
  try {
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, 'gallery', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all('SELECT * FROM gallery_items WHERE category = ? AND status = ? ORDER BY created_at DESC',
      [category.name, 'active']
    );
    const description = category.meta_description || category.description || `Browse ${category.name} apparel design inspiration and clothing mockup examples.`;
    const categoryImage = firstImage(req, (items || []).map(item => item.image_url));
    
    res.render('category-landing', {
      title: buildSeoTitle(category.meta_title || `${category.name} Gallery`, 'ClothingDesign'),
      metaDescription: description,
      metaImage: categoryImage,
      structuredData: buildCategoryStructuredData(req, category, items || [], 'gallery', 'Gallery'),
      page: 'gallery',
      category: category,
      items: items || [],
      resourceType: 'gallery',
      resourceTypeLabel: 'Gallery'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// Tools Category Route
router.get('/tools/:slug', async (req, res) => {
  const toolPage = getToolPage(req.params.slug);
  if (toolPage) {
    return res.render('tool-detail', {
      title: buildSeoTitle(toolPage.title, 'ClothingDesign'),
      metaDescription: compactText(toolPage.subtitle, 160),
      metaImage: firstImage(req, [toolPage.image]),
      structuredData: buildToolStructuredData(req, toolPage),
      page: 'tools',
      toolPage
    });
  }

  try {
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, 'tools', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all('SELECT * FROM tools WHERE category = ? AND status = ? ORDER BY sort_order ASC, created_at DESC',
      [category.name, 'active']
    );
    const description = category.meta_description || category.description || `Browse ${category.name} clothing design tools and apparel workflow resources.`;
    const categoryImage = firstImage(req, (items || []).map(item => item.image_url));
    
    res.render('category-landing', {
      title: buildSeoTitle(category.meta_title || `${category.name} Tools`, 'ClothingDesign'),
      metaDescription: description,
      metaImage: categoryImage,
      structuredData: buildCategoryStructuredData(req, category, items || [], 'tools', 'Tools'),
      page: 'tools',
      category: category,
      items: items || [],
      resourceType: 'tools',
      resourceTypeLabel: 'Tools'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// 3D Designer Page - MUST be before /3d-models/:category/:slug
router.get('/3d-models/:category/:slug/edit', async (req, res) => {
  try {
    const model = await findActive3dModelBySlug(req.params.slug);
    
    if (!model) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }

    if (redirectToCanonical3dModel(req, res, model, true)) return;
    const normalizedModel = normalize3dModel(model);
    const categorySlug = normalizedModel.category_slug || normalizedModel.category || req.params.category;
    const description = `Customize ${normalizedModel.name} in the ClothingDesign browser-based 3D apparel designer and export a high-resolution clothing mockup render.`;
    
    res.render('designer-3d', {
      title: `Design - ${model.name}`,
      metaDescription: description,
      metaRobots: 'noindex,follow',
      metaImage: firstImage(req, [normalizedModel.image_url]),
      structuredData: buildSimplePageStructuredData(req, {
        type: 'WebPage',
        name: `Design ${normalizedModel.name}`,
        description,
        path: `/3d-models/${categorySlug}/${normalizedModel.slug}/edit`,
        image: normalizedModel.image_url,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: '3D Clothing Models', url: '/design-3d' },
          { name: normalizedModel.name, url: `/3d-models/${categorySlug}/${normalizedModel.slug}` },
          { name: 'Designer', url: `/3d-models/${categorySlug}/${normalizedModel.slug}/edit` }
        ],
        mainEntity: {
          '@type': 'SoftwareApplication',
          name: 'ClothingDesign 3D Designer',
          applicationCategory: 'DesignApplication',
          operatingSystem: 'Web browser',
          image: firstImage(req, [normalizedModel.image_url])
        }
      }),
      page: 'designer',
      model: normalizedModel,
      useLocalModelAssets: shouldUseLocalModelAssets(req)
    });
  } catch (err) {
    console.error('Error loading designer:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// 3D Model Detail Page
router.get('/3d-models/:category/:slug', async (req, res) => {
  try {
    const model = await findActive3dModelBySlug(req.params.slug);
    
    if (!model) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }

    if (redirectToCanonical3dModel(req, res, model)) return;
    
    // Get related models with category slugs
    const related = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.id != ? AND m.status = ?
        AND (
          m.category = ?
          OR EXISTS (
            SELECT 1
            FROM model_3d_categories mc_related
            WHERE mc_related.model_id = m.id
              AND mc_related.category_id IN (
                SELECT mc_current.category_id
                FROM model_3d_categories mc_current
                WHERE mc_current.model_id = ?
              )
          )
        )
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC 
      LIMIT 4
    `, [model.id, 'active', model.category, model.id]);
    
    const normalizedModel = normalize3dModel(model);
    const normalizedRelated = normalize3dModels(related);
    const modelDetailContent = buildModelDetailContent(normalizedModel, normalizedRelated, req);

    res.render('model-detail', {
      title: modelDetailContent.pageTitle,
      metaDescription: modelDetailContent.metaDescription,
      metaRobots: shouldIndexModel(normalizedModel) ? undefined : 'noindex,follow',
      metaImage: modelDetailContent.primaryImage,
      structuredData: modelDetailContent.structuredData,
      page: 'design-3d',
      model: normalizedModel,
      modelDetailContent,
      related: normalizedRelated,
      useLocalModelAssets: shouldUseLocalModelAssets(req)
    });
  } catch (err) {
    console.error('Error loading model detail:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

module.exports = router;
