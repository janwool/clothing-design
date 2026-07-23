const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { getModelSlug, normalize3dModel, normalize3dModels } = require('../lib/slug');
const { shouldIndexModel } = require('../lib/seo-priority');
const {
  buildModelCategoryLandingContent,
  categoryDescription,
  categoryMetaTitle,
  categoryMetaDescription
} = require('../lib/design3d-seo');
const {
  DEFAULT_SITE_IMAGE_PATH,
  toAbsoluteUrl,
  firstImage,
  imageObject,
  itemList,
  pageStructuredData
} = require('../lib/seo');
const { modelCover, siteImage } = require('../lib/site-assets');
const { articles: blogArticles, articleResourceLinks, findArticle, relatedArticles } = require('../lib/blog-content');

const MOCKUP_WORKFLOW_IMAGES = [
  siteImage('workflow/choose-garment-model.webp'),
  siteImage('workflow/place-artwork-prints.webp'),
  siteImage('workflow/preview-apparel-mockup.webp'),
  siteImage('workflow/export-product-visuals.webp')
];

const MOCKUP_USE_CASE_IMAGES = [
  siteImage('use-cases/print-placement-previews.webp'),
  siteImage('use-cases/product-page-mockups.webp'),
  siteImage('use-cases/pod-merch-listing-images.webp')
];

function getDefaultLandingContent(name = '3D clothing models', resourceType = '3d-models') {
  return buildModelCategoryLandingContent(name);
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

function addIndexedImages(items = [], images = []) {
  return (items || []).map((item, index) => ({
    ...item,
    image_url: item.image_url || images[index % images.length]
  }));
}

function enrichMockupLandingImages(content = {}) {
  return {
    ...content,
    workflow: {
      ...(content.workflow || {}),
      steps: addIndexedImages(content.workflow?.steps, MOCKUP_WORKFLOW_IMAGES)
    },
    output: {
      ...(content.output || {}),
      cards: addIndexedImages(content.output?.cards, MOCKUP_USE_CASE_IMAGES)
    }
  };
}

function shouldUseLocalModelAssets(req) {
  const host = (req.get('host') || '').toLowerCase();
  return (host.startsWith('localhost') || host.startsWith('127.0.0.1')) && process.env.USE_REMOTE_MODEL_ASSETS !== 'true';
}

function getLandingContent(category, resourceType = '3d-models') {
  const defaults = getDefaultLandingContent(category ? category.name : '3D clothing models', resourceType);
  if (!category || !category.landing_content) {
    return resourceType === '3d-models' ? enrichMockupLandingImages(defaults) : defaults;
  }
  try {
    const merged = mergeLandingContent(defaults, JSON.parse(category.landing_content));
    if (resourceType === '3d-models') {
      return enrichMockupLandingImages({
        ...merged,
        workflow: { ...(merged.workflow || {}), eyebrow: defaults.workflow.eyebrow, title: defaults.workflow.title, description: defaults.workflow.description },
        output: { ...(merged.output || {}), eyebrow: defaults.output.eyebrow, title: defaults.output.title },
        categories: { ...(merged.categories || {}), buttonLabel: defaults.categories.buttonLabel, buttonHref: defaults.categories.buttonHref },
        library: { ...(merged.library || {}), title: defaults.library.title, buttonLabel: defaults.library.buttonLabel, buttonHref: defaults.library.buttonHref },
        faq: { ...(merged.faq || {}), title: defaults.faq.title, items: defaults.faq.items },
        cta: { ...(merged.cta || {}), title: defaults.cta.title, description: defaults.cta.description, primaryLabel: defaults.cta.primaryLabel, primaryHref: defaults.cta.primaryHref }
      });
    }
    return merged;
  } catch (err) {
    console.warn('Invalid landing_content JSON for category:', category.slug || category.name);
    return resourceType === '3d-models' ? enrichMockupLandingImages(defaults) : defaults;
  }
}

let modelCategoryTablesReady;

async function ensureModelCategoryTable() {
  if (!modelCategoryTablesReady) {
    modelCategoryTablesReady = (async () => {
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
    })().catch(error => {
      modelCategoryTablesReady = null;
      throw error;
    });
  }
  return modelCategoryTablesReady;
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

async function getActive3dCategories() {
  await ensureModelCategoryTable();
  return db.all(`
    SELECT
      c.*,
      COALESCE(
        (
          SELECT m.image_url
          FROM model_3d_categories mc
          JOIN models_3d m ON m.id = mc.model_id
          WHERE mc.category_id = c.id
            AND m.status = 'active'
            AND m.image_url IS NOT NULL
            AND m.image_url != ''
          ORDER BY mc.is_primary DESC, m.updated_at DESC, m.created_at DESC
          LIMIT 1
        ),
        (
          SELECT m.image_url
          FROM models_3d m
          WHERE m.category = c.name
            AND m.status = 'active'
            AND m.image_url IS NOT NULL
            AND m.image_url != ''
          ORDER BY m.updated_at DESC, m.created_at DESC
          LIMIT 1
        )
      ) AS category_image_url
    FROM categories c
    WHERE c.resource_type = ?
      AND c.status = ?
      AND (
        EXISTS (
          SELECT 1
          FROM model_3d_categories mc_exists
          JOIN models_3d m_exists ON m_exists.id = mc_exists.model_id
          WHERE mc_exists.category_id = c.id
            AND m_exists.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM models_3d m_legacy
          WHERE m_legacy.category = c.name
            AND m_legacy.status = 'active'
        )
      )
    ORDER BY c.sort_order ASC, c.name ASC
  `, ['3d-models', 'active']);
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

function buildSeoTitle(base, suffix, maxLength = 58) {
  const cleanBase = String(base || '').replace(/\s+/g, ' ').trim();
  const cleanSuffix = String(suffix || '').replace(/\s+/g, ' ').trim();
  const full = cleanSuffix ? `${cleanBase} | ${cleanSuffix}` : cleanBase;
  if (full.length <= maxLength) return full;
  const room = maxLength - cleanSuffix.length - 3;
  if (room > 24) {
    const clipped = cleanBase.slice(0, room);
    const lastSpace = clipped.lastIndexOf(' ');
    const shortenedBase = clipped
      .slice(0, lastSpace > 18 ? lastSpace : room)
      .trim()
      .replace(/\s+(?:a|an|and|for|in|of|on|the|with)$/i, '');
    return `${shortenedBase} | ${cleanSuffix}`;
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

function modelSearchPhrases(categoryName, categorySlug) {
  const key = `${categoryName || ''} ${categorySlug || ''}`.toLowerCase();
  if (/dress|skirt/.test(key)) return ['dress mockup', '3D dress model', 'online dress design'];
  if (/jacket|blazer/.test(key)) return ['jacket 3D model', 'jacket mockup', '3D outerwear design'];
  if (/pants|trouser/.test(key)) return ['3D pants design', 'pants 3D model', 'trousers mockup'];
  if (/hoodie/.test(key)) return ['3D hoodie model', 'hoodie mockup', 'online hoodie design'];
  if (/t-shirt|tee/.test(key)) return ['3D T-shirt model', 'T-shirt mockup', 'online T-shirt design'];
  if (/shirt|top/.test(key)) return ['shirt 3D model', 'shirt mockup', '3D apparel design'];
  if (/coat|cloak/.test(key)) return ['coat 3D model', 'coat mockup', '3D outerwear design'];
  if (/underwear/.test(key)) return ['underwear 3D model', 'underwear mockup', '3D apparel design'];
  return ['3D clothing model', '3D apparel mockup', 'online clothing design'];
}

function buildModelSearchIntent(model, categoryName, categorySlug) {
  const category = String(categoryName || 'apparel').toLowerCase();
  const tags = splitKeywordList(model.tags);
  const descriptor = modelDescriptor(model, categoryName).join(', ');
  const searchPhrases = modelSearchPhrases(categoryName, categorySlug);
  return compactText([
    `${model.name} is a free ${category} 3D model for online apparel mockups.`,
    `Use it for ${searchPhrases.join(', ')} workflows.`,
    `Preview ${descriptor}, then export transparent product renders for ecommerce, print-on-demand, or design review.`,
    tags.length ? `Related topics include ${tags.slice(0, 2).join(', ')}.` : ''
  ].filter(Boolean).join(' '), 285);
}

const CATEGORY_IMAGE_ASSETS = {
  't-shirt-mockup': siteImage('categories/t-shirt-mockup.webp'),
  shirt: siteImage('categories/shirt.webp'),
  pants: siteImage('categories/pants.webp'),
  jacket: siteImage('categories/jacket.webp'),
  'hoodie-mockup': siteImage('categories/hoodie-mockup.webp'),
  dress: siteImage('categories/dress.webp'),
  cloak: siteImage('categories/cloak.webp'),
  underwear: siteImage('categories/underwear.webp')
};

function withCategoryImages(categories = []) {
  return (categories || []).map(category => ({
    ...category,
    image_url: CATEGORY_IMAGE_ASSETS[category.slug] || category.category_image_url || category.image_url || ''
  }));
}

const HOME_FEATURED_CATEGORY_SLUGS = ['t-shirt-mockup', 'shirt', 'hoodie-mockup', 'dress'];
const HOME_FEATURED_MODEL_SLUGS_BY_CATEGORY = {
  't-shirt-mockup': 'classic-crew-neck-t-shirt-3d-model',
  shirt: 'tailored-long-sleeve-shirt-3d-model',
  'hoodie-mockup': 'tailored-pullover-hoodie-3d-model',
  dress: 'classic-one-piece-dress-3d-model'
};

function selectHomeFeaturedModels(models = []) {
  const normalizedModels = normalize3dModels(models);
  const selected = [];
  const selectedIds = new Set();

  HOME_FEATURED_CATEGORY_SLUGS.forEach(categorySlug => {
    const matchesCategory = item => {
      const slugs = item.category_slugs && item.category_slugs.length
        ? item.category_slugs
        : [item.category_slug || item.category];
      return !selectedIds.has(item.id) && slugs.includes(categorySlug) && item.image_url;
    };
    const preferredSlug = HOME_FEATURED_MODEL_SLUGS_BY_CATEGORY[categorySlug];
    const model = normalizedModels.find(item => matchesCategory(item) && item.slug === preferredSlug)
      || normalizedModels.find(matchesCategory);

    if (model) {
      selected.push({
        ...model,
        category_slug: categorySlug
      });
      selectedIds.add(model.id);
    }
  });

  return selected;
}

function buildHomeContent(req, models = [], categories = [], modelTotal = models.length) {
  const modelCount = Number(modelTotal) || models.length;
  const categoryCount = categories.length;
  const pageUrl = toAbsoluteUrl(req, '/');
  const featuredModels = selectHomeFeaturedModels(models);
  const featuredCategories = withCategoryImages(categories).slice(0, 8);
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
    { value: 'Free', label: 'browser mockup workflow' }
  ];
  const workflow = [
    {
      title: 'Choose a garment model',
      text: 'Start from shirts, hoodies, dresses, coats, pants, bags, hats, and other free 3D apparel models.',
      image_url: MOCKUP_WORKFLOW_IMAGES[0]
    },
    {
      title: 'Place artwork and prints',
      text: 'Use the browser mockup workflow to position logos, graphics, textile ideas, and print placement directions on the garment.',
      image_url: MOCKUP_WORKFLOW_IMAGES[1]
    },
    {
      title: 'Preview the apparel mockup',
      text: 'Rotate the garment, check artwork scale, compare colorways, and review how the design sits on the clothing shape.',
      image_url: MOCKUP_WORKFLOW_IMAGES[2]
    },
    {
      title: 'Export product visuals',
      text: 'Download a clean transparent product image for ecommerce pages, POD listings, launch decks, portfolios, and approvals.',
      image_url: MOCKUP_WORKFLOW_IMAGES[3]
    }
  ];
  const useCases = [
    {
      title: 'Print placement previews',
      text: 'Preview chest graphics, back prints, sleeve artwork, logo scale, and garment color direction before sampling or photoshoots.',
      image_url: MOCKUP_USE_CASE_IMAGES[0]
    },
    {
      title: 'Product page mockups',
      text: 'Create consistent transparent apparel images for ecommerce product pages, launch pages, line sheets, and client presentations.',
      image_url: MOCKUP_USE_CASE_IMAGES[1]
    },
    {
      title: 'POD and merch listing images',
      text: 'Build mockup visuals for print-on-demand products, merch drops, brand colorways, and store listing drafts.',
      image_url: MOCKUP_USE_CASE_IMAGES[2]
    }
  ];
  const faq = [
    {
      question: 'Can I download free 3D clothing models?',
      answer: 'Yes. ClothingDesign focuses on free 3D garment models that can be opened online, reviewed on detail pages, and used as starting points for apparel mockups.'
    },
    {
      question: 'Can I create apparel mockups in the browser?',
      answer: 'Yes. Choose a garment model, preview artwork placement, test colors, and export a transparent product image without starting in desktop 3D software.'
    },
    {
      question: 'Which garment models are available?',
      answer: 'The library includes apparel and accessory categories such as T-shirts, shirts, pants, jackets, hoodies, dresses, coats, hats, bags, skirts, and more.'
    },
    {
      question: 'Can I use the exported render on product pages?',
      answer: 'Yes. The mockup workflow is built for ecommerce previews, product detail pages, POD listings, portfolio images, client approvals, and campaign planning.'
    }
  ];
  const metaDescription = 'Browse free 3D clothing models, create apparel mockups online, preview print placement, and export transparent product images for ecommerce and POD listings.';
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
        target: `${toAbsoluteUrl(req, '/mockups')}?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Free 3D Clothing Models for Apparel Mockups',
      description: metaDescription,
      url: pageUrl,
      image: primaryImage,
      primaryImageOfPage: imageObject(req, primaryImage),
      mainEntity: {
        '@type': 'SoftwareApplication',
        name: 'ClothingDesign Design3D',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web browser',
        description: 'Free browser-based 3D clothing model library and apparel mockup generator for print placement previews, garment colorways, and transparent product images.',
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
      '@type': 'ItemList',
      name: 'T-shirt mockup starting points',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Free T-Shirt Mockup Generator',
          url: toAbsoluteUrl(req, '/tools/t-shirt-mockup-generator')
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Free T-Shirt 3D Models',
          url: toAbsoluteUrl(req, '/mockups/t-shirt-mockup')
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Classic Crew Neck T-Shirt 3D Model',
          url: toAbsoluteUrl(req, '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model')
        }
      ]
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
  const basePath = resourceType === '3d-models' ? `/mockups/${category.slug}` : `/${resourceType}/${category.slug}`;
  const collectionPath = resourceType === '3d-models' ? '/mockups' : `/${resourceType}`;
  const description = category.meta_description || category.description || `Browse ${category.name} ${resourceTypeLabel} on ClothingDesign.`;
  const normalizedItems = resourceType === '3d-models' ? normalize3dModels(items, category.slug) : items;
  const image = firstImage(req, [category.image_url, ...normalizedItems.map(item => item.image_url)]);

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
      return item.url || basePath;
    }, item => item.image_url)
  ];
}

const MOCKUP_GLB_BASE_URL = 'https://cdn.cloz-design.com/uploads/glb';

const TOOL_PAGE_CONTENT = {
  't-shirt-mockup-generator': {
    title: 'Free T-Shirt Mockup Generator',
    eyebrow: 'Free online T-shirt mockups',
    image: modelCover('t-shirt-mockup-3d-model-01-aa09ae0d.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/t-shirt-mockup-3d-model-01-aa09ae0d.glb`,
      alt: 'Classic Crew Neck T-Shirt 3D Model'
    },
    subtitle: 'Customize a free 3D T-shirt in your browser, test garment colors and viewing angles, upload artwork, and export a transparent product mockup.',
    intent: 'Use this page when you need a fast T-shirt product visual direction before photography or sampling. Start from an apparel-first model page, plan a logo or graphic direction, compare product angles, and prepare a cleaner mockup reference for ecommerce, print-on-demand, or brand review.',
    primaryKeyword: 'free t-shirt mockup generator',
    keywords: ['3D t-shirt mockup', 'online t-shirt mockup generator', 'front and back t-shirt mockup', 'oversized t-shirt mockup', 't-shirt mockup no Photoshop'],
    competitorInsights: [
      { title: 'Preview before samples', body: 'Use a garment-based model preview to judge artwork scale and shirt proportions before ordering samples.' },
      { title: 'Plan product-page imagery', body: 'Build a clearer direction for white tees, black tees, oversized fits, logo tees, and graphic tee listings.' },
      { title: 'Reduce PSD dependency', body: 'Use browser-based apparel previews when you need a quick mockup reference without opening a Photoshop template.' }
    ],
    freePositioning: 'ClothingDesign keeps the T-shirt mockup workflow focused on free browser-based apparel visuals, so creators can test product ideas before buying PSD packs, booking photography, or ordering samples.',
    steps: [
      { title: 'Choose a T-shirt model', body: 'Start from a T-shirt or top model in the ClothingDesign 3D model library.' },
      { title: 'Place the artwork direction', body: 'Apply a logo, chest print, back graphic, color direction, or streetwear artwork concept.' },
      { title: 'Review scale and contrast', body: 'Check artwork scale, fabric color, front-view balance, and product angle before committing.' },
      { title: 'Prepare the product preview', body: 'Use the finished preview as a product-page, print-on-demand, or internal review reference.' }
    ],
    useCases: ['Print-on-demand listings', 'Streetwear drop previews', 'Front and back product mockups'],
    useCaseDetails: [
      'Prepare a T-shirt mockup for Shopify, Etsy, Amazon Merch, or POD catalog drafts before printing.',
      'Compare oversized, black tee, white tee, logo tee, and graphic tee directions for a clothing brand launch.',
      'Plan front placement, back print scale, chest logo sizing, and sleeve detail before final artwork lockup.'
    ],
    modelStarters: [
      {
        title: 'Classic crew-neck T-shirt',
        body: 'Start with the highest-interest short-sleeve blank for chest logos, front graphics, back prints, and everyday product listings.',
        href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model'
      },
      {
        title: 'Oversized drop-shoulder T-shirt',
        body: 'Use a relaxed streetwear silhouette when artwork scale, shoulder position, and garment volume matter.',
        href: '/3d-models/t-shirt-mockup/oversized-crew-neck-t-shirt-mockup-with-drop-shoulder-fit'
      },
      {
        title: 'Short-sleeve polo shirt',
        body: 'Choose a collared model for teamwear, uniforms, embroidered logos, and smart-casual product previews.',
        href: '/3d-models/t-shirt-mockup/short-sleeve-polo-shirt-3d-model'
      },
      {
        title: 'Long-sleeve crewneck shirt',
        body: 'Plan front, back, and sleeve artwork on a long-sleeve model before creating the final product set.',
        href: '/3d-models/t-shirt-mockup/long-sleeve-crewneck-shirt-3d-model'
      }
    ],
    visualGallery: [
      { title: 'Graphic tee preview', image: 'https://cdn.cloz-design.com/image/mockups/t-shirt-mockup-generator.png', caption: 'Realistic T-shirt mockup with a small chest artwork placement and ecommerce-ready lighting.' },
      { title: 'Bulk colorway direction', image: 'https://cdn.cloz-design.com/image/mockups/bulk-t-shirt-mockup-generator.png', caption: 'Use one artwork idea across multiple shirt colors for POD planning.' },
      { title: 'POD listing set', image: 'https://cdn.cloz-design.com/image/mockups/print-on-demand-mockup-generator.png', caption: 'Prepare clean product listing visuals for Shopify, Etsy, and merch catalogs.' }
    ],
    examplesEyebrow: 'T-shirt examples',
    examplesTitle: 'T-shirt mockup examples for product pages',
    examplesSubtitle: 'Use T-shirt previews to plan artwork scale, color direction, and listing imagery before printing or sampling.',
    planningEyebrow: 'Plan the tee',
    planningTitle: 'Plan a T-shirt mockup from artwork to product preview',
    benefitsEyebrow: 'Why use it',
    benefitsTitle: 'Preview T-shirt artwork before printing samples',
    benefitsSubtitle: 'Use a model-based T-shirt preview to check chest graphics, back prints, color contrast, and product-page framing before you order blanks or book photography.',
    pickerEyebrow: 'Choose another mockup type',
    pickerTitle: 'Move from T-shirt mockups into the next apparel workflow',
    workflowEyebrow: 'T-shirt workflow',
    workflowTitle: 'From blank tee to product-page mockup direction',
    useCasesEyebrow: 'Best for',
    useCasesTitle: 'T-shirt mockups for POD, streetwear, and product pages',
    relatedEyebrow: 'Related mockup tools',
    relatedTitle: 'Build the rest of your apparel mockup set',
    relatedCardLabel: 'Mockup workflow',
    finalCtaEyebrow: 'Start with a tee',
    finalCtaTitle: 'Open a T-shirt model and plan the first product mockup.',
    finalCtaSubtitle: 'Use the 3D T-shirt model to test artwork placement, garment color, and ecommerce visual direction before production.',
    secondaryCtaLabel: 'Browse Apparel Models',
    faqEyebrow: 'T-shirt FAQ',
    faqTitle: 'T-shirt mockup generator questions',
    outputHighlights: ['Product-page mockup direction', 'Artwork placement planning', 'Fast browser-based preview'],
    keywordClusters: [
      { title: 'Core terms', terms: ['free t-shirt mockup generator', 'tshirt mockup generator', 'online t-shirt mockup', '3D t-shirt mockup'] },
      { title: 'Product angles', terms: ['front t-shirt mockup', 'back print mockup', 'front and back t-shirt mockup', 'oversized t-shirt mockup'] },
      { title: 'Commerce use', terms: ['POD t-shirt mockup', 'Shopify product image', 'Etsy t-shirt mockup', 'product mockup preview'] }
    ],
    faq: [
      { question: 'Can I preview a T-shirt mockup online for free?', answer: 'Yes. Use the T-shirt model library to preview artwork direction, colors, and product angles before paying for photography or mockup packs.' },
      { question: 'Does this work for print-on-demand sellers?', answer: 'Yes. The workflow is designed for POD planning, Shopify drafts, Etsy listings, merch catalogs, and clothing brand product previews.' },
      { question: 'Do I need Photoshop?', answer: 'No. The goal is to create browser-based T-shirt mockups from 3D model previews instead of editing a PSD template.' },
      { question: 'Can I make oversized or streetwear mockups?', answer: 'Yes. Use oversized and relaxed T-shirt model previews, then test front graphics, back prints, chest logos, and colorways.' }
    ],
    relatedSlugs: ['hoodie-mockup-generator', 'bulk-t-shirt-mockup-generator', 'print-on-demand-mockup-generator'],
    cta: { label: 'Open T-Shirt Editor', href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model/edit' }
  },
  'hoodie-mockup-generator': {
    title: 'Free Hoodie Mockup Generator',
    eyebrow: 'Free online hoodie mockups',
    image: modelCover('hoodie-mockup-3d-model-03-dca998b8.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/hoodie-mockup-3d-model-03-dca998b8.glb`,
      alt: 'Tailored Fleece Lined Hoodie 3D Model'
    },
    subtitle: 'Customize a free 3D hoodie in your browser, review chest, back, and sleeve artwork zones, test colors, and export a transparent product mockup.',
    intent: 'Use this page when a flat hoodie outline is not enough. Preview graphics on a structured garment model, compare pullover and oversized hoodie directions, and plan visuals for product listings, launch decks, and client approvals.',
    primaryKeyword: 'hoodie mockup generator',
    keywords: ['free hoodie mockup generator', '3D hoodie mockup', 'oversized hoodie mockup', 'front and back hoodie mockup', 'sweatshirt mockup generator'],
    competitorInsights: [
      { title: 'Check hoodie volume', body: 'Judge how artwork reads on a bulkier garment shape, including hood, pocket, cuff, and chest areas.' },
      { title: 'Support streetwear planning', body: 'Compare oversized pullover directions before moving into samples, photoshoots, or final listing assets.' },
      { title: 'Prepare approval visuals', body: 'Give teams, clubs, schools, and buyers a clearer hoodie preview before production decisions.' }
    ],
    freePositioning: 'ClothingDesign gives hoodie creators a free apparel-first mockup path: start from real hoodie model previews, test artwork scale, then move into product presentation.',
    steps: [
      { title: 'Open a hoodie model', body: 'Start from a structured hoodie model in the ClothingDesign 3D library.' },
      { title: 'Plan the graphic zones', body: 'Choose a base color and map front print, back artwork, chest logo, or sleeve placement.' },
      { title: 'Check hoodie proportions', body: 'Review hood volume, pocket position, cuff balance, artwork scale, and product angle.' },
      { title: 'Use it for approval', body: 'Turn the hoodie preview into a streetwear planning, POD draft, ecommerce, or team approval visual.' }
    ],
    useCases: ['Streetwear hoodie drops', 'Team and school merch', 'Sweatshirt product listings'],
    useCaseDetails: [
      'Preview oversized pullover hoodie graphics before producing samples.',
      'Create mockups for schools, clubs, events, creators, and company apparel.',
      'Prepare product visuals for sweatshirts, fleece hoodies, and casualwear listings.'
    ],
    visualGallery: [
      { title: 'Pullover hoodie mockup', image: 'https://cdn.cloz-design.com/image/mockups/hoodie-mockup-generator.png', caption: 'Realistic hoodie product mockup with chest and sleeve artwork placement.' },
      { title: 'POD listing workflow', image: 'https://cdn.cloz-design.com/image/mockups/print-on-demand-mockup-generator.png', caption: 'Turn hoodie previews into product images for online store drafts.' },
      { title: 'Multi-product direction', image: 'https://cdn.cloz-design.com/image/mockups/clothing-mockup-generator.png', caption: 'Keep T-shirt, hoodie, jacket, and dress mockups visually consistent.' }
    ],
    examplesEyebrow: 'Hoodie examples',
    examplesTitle: 'Hoodie mockup examples for streetwear planning',
    examplesSubtitle: 'Compare hoodie volume, chest artwork, sleeve-zone ideas, and listing direction before production.',
    planningEyebrow: 'Plan the hoodie',
    planningTitle: 'Turn a hoodie concept into a clearer streetwear preview',
    benefitsEyebrow: 'Why use it',
    benefitsTitle: 'Preview hoodie graphics on a bulkier garment shape',
    benefitsSubtitle: 'Use a hoodie model preview to judge artwork scale across the chest, sleeves, pocket area, hood volume, and oversized product silhouettes.',
    pickerEyebrow: 'Choose another mockup type',
    pickerTitle: 'Compare hoodie mockups with tees, POD listings, and full apparel sets',
    workflowEyebrow: 'Hoodie workflow',
    workflowTitle: 'From hoodie artwork idea to streetwear product preview',
    useCasesEyebrow: 'Best for',
    useCasesTitle: 'Hoodie mockups for drops, merch, and sweatshirt listings',
    relatedEyebrow: 'Related mockup tools',
    relatedTitle: 'Extend the hoodie concept into other product visuals',
    relatedCardLabel: 'Mockup workflow',
    finalCtaEyebrow: 'Start with a hoodie',
    finalCtaTitle: 'Open a hoodie model and check the graphic placement in 3D.',
    finalCtaSubtitle: 'Use the hoodie model to preview chest artwork, sleeve ideas, color direction, and listing-ready product framing.',
    secondaryCtaLabel: 'Browse Apparel Models',
    faqEyebrow: 'Hoodie FAQ',
    faqTitle: 'Hoodie mockup generator questions',
    outputHighlights: ['Chest and sleeve-zone planning', 'Streetwear product previews', 'Listing image direction'],
    keywordClusters: [
      { title: 'Core terms', terms: ['hoodie mockup generator', 'free hoodie mockup', '3D hoodie mockup', 'sweatshirt mockup generator'] },
      { title: 'Style terms', terms: ['oversized hoodie mockup', 'pullover hoodie mockup', 'streetwear hoodie mockup', 'front and back hoodie mockup'] },
      { title: 'Artwork terms', terms: ['sleeve graphic mockup', 'back print hoodie', 'chest logo hoodie', 'hoodie product preview'] }
    ],
    faq: [
      { question: 'Can I make hoodie mockups for free?', answer: 'Yes. Start from hoodie model previews and create product visuals for artwork review, ecommerce drafts, or launch planning.' },
      { question: 'Can I preview sleeve and back artwork?', answer: 'The 3D mockup workflow helps you plan chest, sleeve, back, and pocket-zone artwork before producing a sample.' },
      { question: 'Is this useful for streetwear brands?', answer: 'Yes. Hoodie mockups are especially useful for oversized fits, graphic drops, capsule launches, and buyer or client approvals.' },
      { question: 'Do I need a PSD hoodie template?', answer: 'No. This workflow is designed around browser-based apparel mockups and 3D hoodie model previews.' }
    ],
    relatedSlugs: ['t-shirt-mockup-generator', 'print-on-demand-mockup-generator', '3d-clothing-mockup-generator'],
    cta: { label: 'Open Hoodie Editor', href: '/3d-models/hoodie-mockup/tailored-fleece-lined-hoodie-3d-model/edit' }
  },
  '3d-clothing-mockup-generator': {
    title: 'Free 3D Clothing Design & Mockup Generator',
    eyebrow: 'Free online 3D clothing design',
    image: modelCover('dress-3d-model-06-29e39d9a.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/dress-3d-model-06-29e39d9a.glb`,
      alt: 'Classic One-Piece Dress 3D Model'
    },
    subtitle: 'Design clothing online with free 3D garment models for T-shirts, hoodies, dresses, and other apparel, then export transparent mockups for product pages and design review.',
    intent: 'Use the free online 3D clothing design workflow when you need garment shape, product angle, artwork placement, and apparel category variety. Build richer visuals than flat templates while keeping the process browser-based and fast.',
    primaryKeyword: '3D clothing mockup generator',
    keywords: ['free 3D clothing design online', 'free online clothing designer', 'clothing mockup generator', 'apparel mockup generator', '3D apparel mockup', 'online clothing mockup', 'realistic clothing mockup'],
    competitorInsights: [
      { title: 'Cover more garment types', body: 'Move from T-shirts and hoodies into jackets, dresses, bottoms, and accessories without changing content strategy.' },
      { title: 'Show shape, not just art', body: 'Use 3D model previews to communicate garment form, product angle, and category fit better than flat templates.' },
      { title: 'Build collection context', body: 'Prepare product-page, launch-deck, portfolio, and approval references across a full apparel range.' }
    ],
    freePositioning: 'ClothingDesign positions mockups around apparel categories first, so designers can choose the right model family before testing graphics, colorways, and product renders.',
    steps: [
      { title: 'Pick the garment category', body: 'Choose the clothing category that matches your product idea and visual planning need.' },
      { title: 'Select a 3D model preview', body: 'Start from a T-shirt, hoodie, jacket, dress, accessory, or another apparel model.' },
      { title: 'Apply product direction', body: 'Add design direction, artwork, colorways, materials, or product styling notes.' },
      { title: 'Create the review reference', body: 'Use the preview for ecommerce drafts, presentations, portfolio work, or approvals.' }
    ],
    useCases: ['Ecommerce product visuals', 'Apparel collection boards', 'Design approval mockups'],
    useCaseDetails: [
      'Prepare product images for apparel pages before photoshoots are ready.',
      'Show multiple garment categories in one launch or seasonal planning deck.',
      'Help clients, buyers, and internal teams understand shape, color, and artwork direction.'
    ],
    visualGallery: [
      { title: 'Multi-category mockup set', image: 'https://cdn.cloz-design.com/image/mockups/clothing-mockup-generator.png', caption: 'T-shirt, hoodie, jacket, and dress mockups in one visual system.' },
      { title: 'T-shirt product mockup', image: 'https://cdn.cloz-design.com/image/mockups/t-shirt-mockup-generator.png', caption: 'Single-garment product mockup with clear artwork placement.' },
      { title: 'Hoodie product mockup', image: 'https://cdn.cloz-design.com/image/mockups/hoodie-mockup-generator.png', caption: 'Structured hoodie mockup for streetwear, merch, and ecommerce visuals.' }
    ],
    examplesEyebrow: '3D apparel examples',
    examplesTitle: '3D clothing mockup examples across categories',
    examplesSubtitle: 'Plan apparel visuals across shirts, hoodies, dresses, jackets, and product presentation workflows.',
    planningEyebrow: 'Plan the collection',
    planningTitle: 'Explore apparel mockups across garment categories',
    benefitsEyebrow: 'Why use it',
    benefitsTitle: 'Plan apparel mockups across more than one garment type',
    benefitsSubtitle: 'Use ClothingDesign when a flat template is not enough and you need T-shirts, hoodies, dresses, jackets, and accessories to feel part of one product system.',
    pickerEyebrow: 'Choose a focused workflow',
    pickerTitle: 'Start broad, then move into the garment mockup you need',
    workflowEyebrow: '3D apparel workflow',
    workflowTitle: 'From garment category to collection-ready mockup direction',
    useCasesEyebrow: 'Best for',
    useCasesTitle: '3D clothing mockups for collections, approvals, and ecommerce',
    relatedEyebrow: 'Related mockup tools',
    relatedTitle: 'Narrow the 3D apparel workflow by product type',
    relatedCardLabel: 'Mockup workflow',
    finalCtaEyebrow: 'Start with a model',
    finalCtaTitle: 'Choose a 3D garment model and build the mockup direction around it.',
    finalCtaSubtitle: 'Use model previews to plan product visuals across apparel categories before samples, shoots, or launch decks.',
    secondaryCtaLabel: 'Browse All 3D Models',
    faqEyebrow: '3D clothing FAQ',
    faqTitle: '3D clothing mockup generator questions',
    outputHighlights: ['Multiple garment categories', 'Model-based presentation angles', 'Ecommerce visual direction'],
    keywordClusters: [
      { title: 'Core terms', terms: ['3D clothing mockup generator', 'free 3D clothing design online', 'free online clothing designer', 'apparel mockup generator'] },
      { title: 'Category terms', terms: ['T-shirt mockup', 'hoodie mockup', 'jacket mockup', 'dress mockup'] },
      { title: 'Output terms', terms: ['product mockup preview', 'ecommerce mockup', 'launch deck visual', 'brand approval mockup'] }
    ],
    faq: [
      { question: 'What is a 3D clothing mockup generator?', answer: 'It is a browser-based workflow for creating apparel visuals from 3D garment model previews instead of editing flat PSD templates.' },
      { question: 'Can I design clothing online for free?', answer: 'Yes. Choose a free 3D garment model, test colors and viewing angles, upload artwork, and export a transparent apparel preview in the browser.' },
      { question: 'Which clothing categories can I mock up?', answer: 'Use ClothingDesign for T-shirts, hoodies, shirts, jackets, dresses, bottoms, bags, hats, and other apparel or accessory categories.' },
      { question: 'Is this only for fashion designers?', answer: 'No. It is useful for POD sellers, ecommerce teams, agencies, merch creators, streetwear brands, students, and product teams.' },
      { question: 'Can I use mockups on product pages?', answer: 'Yes. The visual workflow is built for product page drafts, launch decks, portfolios, and internal approvals.' }
    ],
    relatedSlugs: ['t-shirt-mockup-generator', 'hoodie-mockup-generator', 'print-on-demand-mockup-generator'],
    cta: { label: 'Open 3D Clothing Editor', href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model/edit' }
  },
  'bulk-t-shirt-mockup-generator': {
    title: 'Free Bulk T-Shirt Mockup Generator',
    eyebrow: 'Batch T-shirt product visuals',
    image: modelCover('t-shirt-mockup-3d-model-01-aa09ae0d.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/t-shirt-mockup-3d-model-01-aa09ae0d.glb`,
      alt: 'Classic Crew Neck T-Shirt 3D Model'
    },
    subtitle: 'Apply one design direction across four T-shirt colors and download a free colorway sheet for POD catalogs, Shopify drafts, and apparel review.',
    intent: 'Use this page when one design needs to be shown across many shirt colors or listing layouts. Build a consistent mockup direction for product catalogs without manually rebuilding every colorway.',
    primaryKeyword: 'bulk t-shirt mockup generator',
    keywords: ['bulk mockup generator', 'batch t-shirt mockup', 'POD mockup generator', 'multiple t-shirt mockups', 'colorway mockup generator'],
    competitorInsights: [
      { title: 'Compare colorways faster', body: 'Show one artwork direction across multiple shirt colors before committing to a product variant set.' },
      { title: 'Keep catalog framing consistent', body: 'Use the same visual direction across Shopify, Etsy, Amazon Merch, and internal ecommerce drafts.' },
      { title: 'Reduce repetitive planning', body: 'Review contrast, readability, and variant logic before rebuilding each listing image by hand.' }
    ],
    freePositioning: 'ClothingDesign does not treat bulk mockups as a spreadsheet-only task. The goal is to create a visual colorway matrix that still feels apparel-specific and brand-ready.',
    steps: [
      { title: 'Start with one T-shirt design', body: 'Use a T-shirt model and one artwork direction as the source for the batch.' },
      { title: 'Choose colorway groups', body: 'Select multiple product colors, neutral bases, seasonal shades, or variant groups.' },
      { title: 'Compare artwork readability', body: 'Review how the same graphic reads across light, dark, neutral, and seasonal bases.' },
      { title: 'Build the catalog reference', body: 'Use the colorway set as a reference for POD listings, ecommerce drafts, or brand planning.' }
    ],
    useCases: ['POD colorway matrices', 'Shopify catalog drafts', 'Brand variant planning'],
    useCaseDetails: [
      'Preview how one graphic performs across many blank T-shirt colors.',
      'Build consistent product imagery before uploading variations to an online store.',
      'Compare color contrast and artwork readability before committing to print files.'
    ],
    visualGallery: [
      { title: 'Bulk colorway matrix', image: 'https://cdn.cloz-design.com/image/mockups/bulk-t-shirt-mockup-generator.png', caption: 'One logo direction shown across multiple T-shirt colorways.' },
      { title: 'Main T-shirt mockup', image: 'https://cdn.cloz-design.com/image/mockups/t-shirt-mockup-generator.png', caption: 'Start from a polished model-based T-shirt mockup before multiplying variants.' },
      { title: 'POD listing set', image: 'https://cdn.cloz-design.com/image/mockups/print-on-demand-mockup-generator.png', caption: 'Use bulk mockups as the source for listing-ready product images.' }
    ],
    examplesEyebrow: 'Bulk examples',
    examplesTitle: 'Bulk T-shirt mockup examples for colorway planning',
    examplesSubtitle: 'Compare one graphic across multiple shirt colors and keep catalog imagery visually consistent.',
    planningEyebrow: 'Plan the batch',
    planningTitle: 'Plan one T-shirt design across multiple colorways',
    benefitsEyebrow: 'Why use it',
    benefitsTitle: 'Compare T-shirt colorways before building every listing image',
    benefitsSubtitle: 'Use bulk mockup planning to test one graphic across light, dark, neutral, and seasonal shirt colors while keeping catalog framing consistent.',
    pickerEyebrow: 'Choose another mockup type',
    pickerTitle: 'Move from bulk colorways into focused product mockups',
    workflowEyebrow: 'Bulk workflow',
    workflowTitle: 'From one T-shirt design to a consistent colorway set',
    useCasesEyebrow: 'Best for',
    useCasesTitle: 'Bulk T-shirt mockups for variants, catalogs, and POD stores',
    relatedEyebrow: 'Related mockup tools',
    relatedTitle: 'Turn a batch colorway plan into stronger product visuals',
    relatedCardLabel: 'Mockup workflow',
    finalCtaEyebrow: 'Start a colorway set',
    finalCtaTitle: 'Open a T-shirt model and plan your first batch of colorways.',
    finalCtaSubtitle: 'Use one garment model to check artwork readability, variant logic, and store-ready visual consistency.',
    secondaryCtaLabel: 'Browse Apparel Models',
    faqEyebrow: 'Bulk mockup FAQ',
    faqTitle: 'Bulk T-shirt mockup generator questions',
    outputHighlights: ['Batch product variants', 'Colorway comparison', 'Consistent catalog framing'],
    keywordClusters: [
      { title: 'Core terms', terms: ['bulk t-shirt mockup generator', 'bulk mockup generator', 'batch mockup generator', 'multiple t-shirt mockups'] },
      { title: 'POD terms', terms: ['POD mockup generator', 'print on demand mockup', 'Shopify T-shirt mockup', 'Etsy T-shirt mockup'] },
      { title: 'Variant terms', terms: ['colorway mockup', 'black and white T-shirt mockup', 'product variant image', 'catalog mockup set'] }
    ],
    faq: [
      { question: 'What is a bulk T-shirt mockup generator?', answer: 'It is a workflow for showing one T-shirt design across multiple shirt colors, product angles, or ecommerce listing variants.' },
      { question: 'Is this useful for print-on-demand?', answer: 'Yes. POD sellers often need the same artwork shown across many colors and listing images before publishing products.' },
      { question: 'Can I compare dark and light shirts?', answer: 'Yes. A bulk colorway matrix helps you compare artwork contrast on black, white, neutral, and seasonal base colors.' },
      { question: 'Should I use this before production?', answer: 'Yes. Bulk mockups help validate colorways and reduce visual inconsistencies before print files or listings go live.' }
    ],
    relatedSlugs: ['t-shirt-mockup-generator', 'print-on-demand-mockup-generator', '3d-clothing-mockup-generator'],
    cta: { label: 'Open T-Shirt Editor', href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model/edit' }
  },
  'print-on-demand-mockup-generator': {
    title: 'Free Print-on-Demand Mockup Generator',
    eyebrow: 'POD apparel listing visuals',
    image: modelCover('t-shirt-mockup-3d-model-01-aa09ae0d.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/t-shirt-mockup-3d-model-01-aa09ae0d.glb`,
      alt: 'Classic Crew Neck T-Shirt 3D Model'
    },
    subtitle: 'Customize free 3D apparel, upload print artwork, test product colors and angles, and export transparent mockups for Shopify, Etsy, and merch listings.',
    intent: 'Use this page when a design needs to become a product listing. Build a clean apparel mockup direction, compare colorways, and prepare visuals that communicate product value before printing or publishing.',
    primaryKeyword: 'print on demand mockup generator',
    keywords: ['POD mockup generator', 'Shopify product mockup generator', 'Etsy t-shirt mockup', 'merch mockup generator', 'ecommerce apparel mockup'],
    competitorInsights: [
      { title: 'Shape the listing before publishing', body: 'Turn apparel artwork into a product-image direction before samples, photography, or marketplace upload.' },
      { title: 'Keep POD products consistent', body: 'Plan T-shirt and hoodie mockups with repeatable framing for catalogs, launch pages, and marketplace drafts.' },
      { title: 'Review before the store goes live', body: 'Preview colorways and product composition before publishing to Shopify, Etsy, Amazon Merch, or campaign pages.' }
    ],
    freePositioning: 'ClothingDesign supports the product-image step in a POD workflow: choose a garment, test artwork, generate visual direction, and move toward store-ready listings.',
    steps: [
      { title: 'Choose the POD product', body: 'Start with a T-shirt, hoodie, sweatshirt, jacket, or another apparel model.' },
      { title: 'Set artwork and colorways', body: 'Apply the artwork direction and decide the first product colors for the listing.' },
      { title: 'Keep catalog framing consistent', body: 'Prepare mockup visuals that feel repeatable across the product catalog.' },
      { title: 'Prepare the listing direction', body: 'Use the preview direction in store drafts, launch decks, ads, or POD listing preparation.' }
    ],
    useCases: ['Shopify product pages', 'Etsy apparel listings', 'Merch catalog planning'],
    useCaseDetails: [
      'Create product visuals for a Shopify collection before samples are photographed.',
      'Prepare Etsy-style mockups that make artwork and product color clear.',
      'Plan merch catalogs for creators, teams, events, and streetwear capsules.'
    ],
    visualGallery: [
      { title: 'POD product listing visual', image: 'https://cdn.cloz-design.com/image/mockups/print-on-demand-mockup-generator.png', caption: 'Listing-ready mockup framing for online store product images.' },
      { title: 'Bulk colorway source', image: 'https://cdn.cloz-design.com/image/mockups/bulk-t-shirt-mockup-generator.png', caption: 'Create product variants from one artwork direction.' },
      { title: 'Hoodie product example', image: 'https://cdn.cloz-design.com/image/mockups/hoodie-mockup-generator.png', caption: 'Use hoodie mockups for streetwear and sweatshirt POD listings.' }
    ],
    examplesEyebrow: 'POD examples',
    examplesTitle: 'Print-on-demand mockup examples for listings',
    examplesSubtitle: 'Plan Shopify, Etsy, merch, and POD listing visuals before publishing products or ordering samples.',
    planningEyebrow: 'Plan the listing',
    planningTitle: 'Shape a print-on-demand listing before publishing',
    benefitsEyebrow: 'Why use it',
    benefitsTitle: 'Turn POD artwork into clearer product listing visuals',
    benefitsSubtitle: 'Use model-based mockups to plan Shopify, Etsy, Amazon Merch, and creator-store product images before publishing or ordering samples.',
    pickerEyebrow: 'Choose another mockup type',
    pickerTitle: 'Build POD listings from focused garment mockup workflows',
    workflowEyebrow: 'POD workflow',
    workflowTitle: 'From artwork upload idea to store-ready mockup direction',
    useCasesEyebrow: 'Best for',
    useCasesTitle: 'POD mockups for Shopify, Etsy, merch, and catalog launches',
    relatedEyebrow: 'Related mockup tools',
    relatedTitle: 'Create the product mockups behind a stronger POD catalog',
    relatedCardLabel: 'Mockup workflow',
    finalCtaEyebrow: 'Start a POD preview',
    finalCtaTitle: 'Open a garment model and shape the listing visual before publishing.',
    finalCtaSubtitle: 'Use apparel mockups to test product colors, artwork scale, and consistent ecommerce framing for print-on-demand stores.',
    secondaryCtaLabel: 'Browse Apparel Models',
    faqEyebrow: 'POD FAQ',
    faqTitle: 'Print-on-demand mockup generator questions',
    outputHighlights: ['Shopify and Etsy listing visuals', 'POD color variants', 'Catalog-ready apparel mockups'],
    keywordClusters: [
      { title: 'Core terms', terms: ['print on demand mockup generator', 'POD mockup generator', 'merch mockup generator', 'ecommerce apparel mockup'] },
      { title: 'Store terms', terms: ['Shopify product mockup', 'Etsy T-shirt mockup', 'Amazon Merch mockup', 'online store product image'] },
      { title: 'Product terms', terms: ['T-shirt POD mockup', 'hoodie POD mockup', 'product listing preview', 'catalog mockup set'] }
    ],
    faq: [
      { question: 'Can I use these mockups for print-on-demand listings?', answer: 'Yes. The pages are planned around POD use cases such as T-shirt listings, hoodie previews, colorway sets, and ecommerce drafts.' },
      { question: 'Which products should I mock up first?', answer: 'Start with high-demand apparel such as T-shirts and hoodies, then expand into sweatshirts, jackets, dresses, and accessories.' },
      { question: 'Can I use mockups for Shopify or Etsy?', answer: 'Yes. The visual workflow supports product page drafts, Etsy-style listing images, Shopify catalog planning, and launch deck visuals.' },
      { question: 'Do I need product photography first?', answer: 'No. Use mockups before photography to test artwork, product colors, listing structure, and sales-page presentation.' }
    ],
    relatedSlugs: ['bulk-t-shirt-mockup-generator', 't-shirt-mockup-generator', 'hoodie-mockup-generator'],
    cta: { label: 'Open T-Shirt Editor', href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model/edit' }
  },
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
    cta: { label: 'Start with T-Shirt Models', href: '/mockups/t-shirt-mockup' }
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
    cta: { label: 'Browse Hoodie Models', href: '/mockups/hoodie-mockup' }
  },
  'dress-designer': {
    title: 'Free Online Dress Designer & 3D Mockup Tool',
    eyebrow: 'Design a dress online for free',
    image: modelCover('dress-3d-model-06-29e39d9a.webp'),
    heroModel: {
      src: `${MOCKUP_GLB_BASE_URL}/dress-3d-model-06-29e39d9a.glb`,
      alt: 'Free online one-piece dress designer 3D model'
    },
    editorHref: '/3d-models/dress/classic-one-piece-dress-3d-model#design',
    subtitle: 'Design a dress online for free with an editable 3D garment model, color controls, artwork upload, multiple viewing angles, and transparent mockup export.',
    intent: 'Move a dress idea from early planning into a usable 3D visual preview. Choose a dress model, compare silhouette and color direction, upload artwork, review multiple angles, and export a mockup before sampling or photography.',
    primaryKeyword: 'online dress designer tool free',
    keywords: ['design a dress online free', 'free dress design tool online', 'dress mockup maker', 'design your own dress online', '3D dress designer', 'fashion dress design tool'],
    competitorInsights: [
      { title: 'Design on a real dress shape', body: 'Explore dress silhouettes, length, proportion, and presentation angles before investing in sampling.' },
      { title: 'Preview color and artwork', body: 'Use the live 3D model to communicate color, artwork scale, surface direction, and product presentation.' },
      { title: 'Export a reusable mockup', body: 'Create a transparent dress image for boutique planning, collection reviews, product drafts, or client presentations.' }
    ],
    freePositioning: 'ClothingDesign gives dress designers a free starting point for visual planning, especially when a flat sketch is not enough and a full CAD workflow is too much.',
    steps: [
      { title: 'Open the 3D dress model', body: 'Rotate the garment and review the one-piece silhouette from front, side, and back views.' },
      { title: 'Choose a dress color', body: 'Compare neutral, dark, seasonal, and accent colors directly on the garment.' },
      { title: 'Upload artwork', body: 'Add a PNG, JPG, WebP, or SVG graphic and continue in the full browser editor.' },
      { title: 'Export the dress mockup', body: 'Download a transparent product preview for a moodboard, boutique draft, line review, or design approval.' }
    ],
    useCases: ['Fashion concept boards', 'Boutique product planning', '3D design review'],
    useCaseDetails: [
      'Create visuals for a fashion concept board or early collection review.',
      'Plan boutique product ideas before commissioning samples.',
      'Use dress models and mockup visuals to explain silhouette, proportion, and surface direction.'
    ],
    faq: [
      { question: 'Can I design a dress online for free?', answer: 'Yes. Choose the 3D dress model, test colors and viewing angles, upload artwork, and export a transparent dress mockup in the browser.' },
      { question: 'Can I design a dress online without CAD?', answer: 'Yes. The page provides a browser-based visual workflow for dress concepts without requiring desktop CAD or image-editing software.' },
      { question: 'Is this for fashion designers or shoppers?', answer: 'It is built for apparel creators, boutique teams, students, and designers who need mockups and planning references.' },
      { question: 'Can I compare different dress categories?', answer: 'Yes. Use category-specific dress models to compare silhouette, length, proportion, color, and surface design direction.' }
    ],
    outputHighlights: ['Free browser editor', 'Live 3D dress preview', 'Transparent PNG export'],
    planningEyebrow: 'Online dress workflow',
    planningTitle: 'Design a dress online before sampling or photography',
    benefitsTitle: 'Preview the dress on a real 3D garment shape',
    workflowTitle: 'From dress idea to transparent 3D mockup',
    useCasesTitle: 'Online dress design for boutiques, collections, and review',
    faqTitle: 'Free online dress designer questions',
    relatedSlugs: ['3d-clothing-mockup-generator', 'transparent-apparel-mockup-generator', 't-shirt-mockup-generator'],
    secondaryCtaLabel: 'Browse All Dress Models',
    secondaryCtaHref: '/mockups/dress',
    cta: { label: 'Design a Dress Online', href: '/3d-models/dress/classic-one-piece-dress-3d-model#design' }
  },
  '2d-mockup': {
    title: 'Free 2D Clothing Mockup Generator',
    eyebrow: 'Free flat apparel mockups',
    subtitle: 'Create quick 2D clothing mockup plans with apparel templates and visual references before moving into category-specific 3D review.',
    intent: 'Use a flat mockup workflow when you need to communicate artwork placement, garment notes, and early layout ideas quickly.',
    primaryKeyword: 'free 2D clothing mockup generator',
    keywords: ['2D apparel mockup', 'free clothing mockup template', 'flat garment mockup', 'shirt template mockup'],
    competitorInsights: [
      'Plan front, back, sleeve, and label placement before creating a more realistic render.',
      'Use flat views for production notes, line sheets, vendor communication, and simple approvals.',
      'Move from 2D planning to 3D mockups when shape, drape, or product photography matters.'
    ],
    freePositioning: 'ClothingDesign keeps the early flat mockup stage free and connects it to category-specific 3D models when your design needs more realism.',
    steps: [
      'Choose a garment category and collect a clear flat reference.',
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
    cta: { label: 'Browse Free 3D Models', href: '/mockups' }
  },
  'free-templates': {
    title: 'Free Clothing Templates for Apparel Mockups',
    eyebrow: 'Free apparel template resources',
    subtitle: 'Find free clothing template ideas for shirts, hoodies, dresses, and apparel mockups, then move into 3D previews when you need realistic product presentation.',
    intent: 'Use templates to organize garment ideas quickly, then upgrade the strongest concepts into 3D mockups or product-ready visuals.',
    primaryKeyword: 'free clothing templates',
    keywords: ['free apparel templates', 'free t-shirt template', 'clothing mockup template free', 'fashion design templates'],
    competitorInsights: [
      'Plan apparel artwork, colorways, and collection structure before committing to production assets.',
      'Use flat templates for fast briefs, then switch to 3D models when realistic presentation matters.',
      'Keep flat templates and category-specific 3D mockups connected in one free apparel workflow.'
    ],
    freePositioning: 'ClothingDesign treats templates as the start of a real apparel workflow, not a dead-end download page.',
    steps: [
      'Pick the apparel category you want to mock up.',
      'Use a flat apparel template for early planning.',
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
      { question: 'Are these templates free to start with?', answer: 'Yes. ClothingDesign focuses on free entry points for apparel design planning and 3D mockups.' },
      { question: 'Should I use a template or a 3D model?', answer: 'Use templates for quick flat planning. Use a 3D model when you need shape, drape, angle, and presentation-ready renders.' }
    ],
    cta: { label: 'Browse Free 3D Models', href: '/mockups' }
  }
};

const TOOL_VARIANT_CONTENT = {
  'oversized-t-shirt-mockup-generator': {
    base: 't-shirt-mockup-generator',
    title: 'Free Oversized T-Shirt Mockup Generator',
    eyebrow: 'Drop-shoulder streetwear mockups',
    subtitle: 'Customize an oversized crew-neck T-shirt in 3D, test front and back artwork, compare garment colors, and export a transparent streetwear product preview.',
    intent: 'Use the oversized T-shirt model to judge how artwork sits across a wider chest, dropped shoulder, relaxed sleeve, and longer streetwear silhouette before printing or sampling.',
    primaryKeyword: 'free oversized t-shirt mockup generator',
    keywords: ['oversized t-shirt mockup', 'streetwear t-shirt mockup', 'drop shoulder tee mockup', 'baggy t-shirt mockup'],
    image: 'https://cdn.cloz-design.com/image/1780135799225-218296703.webp',
    heroModel: { src: 'https://cdn.cloz-design.com/d3/1780135797659-346004243.glb', alt: 'Oversized drop shoulder T-shirt 3D mockup' },
    editorHref: '/3d-models/t-shirt-mockup/oversized-crew-neck-t-shirt-mockup-with-drop-shoulder-fit#design',
    cta: { label: 'Customize Oversized Tee', href: '/3d-models/t-shirt-mockup/oversized-crew-neck-t-shirt-mockup-with-drop-shoulder-fit#design' },
    outputHighlights: ['Free browser editor', 'Oversized drop-shoulder fit', 'Transparent PNG export'],
    examplesTitle: 'Oversized T-shirt mockups for streetwear drops',
    planningTitle: 'Check graphic scale on a relaxed streetwear fit',
    benefitsTitle: 'Design for the oversized silhouette, not a standard blank',
    workflowTitle: 'From oversized blank to streetwear product mockup',
    useCases: ['Streetwear collection previews', 'Large back-print checks', 'Oversized POD listings'],
    useCaseDetails: ['Build launch visuals around a wider, relaxed T-shirt silhouette.', 'Compare artwork size against dropped shoulders and a longer body.', 'Prepare oversized tee product images before ordering blanks or samples.']
  },
  'front-and-back-t-shirt-mockup': {
    base: 't-shirt-mockup-generator',
    title: 'Free Front and Back T-Shirt Mockup',
    eyebrow: 'Two-sided T-shirt artwork preview',
    subtitle: 'Rotate a free 3D T-shirt between front, back, and side views to review chest graphics, large back prints, sleeve details, and product-page angles.',
    intent: 'Use one consistent T-shirt model to compare front and back artwork scale instead of combining unrelated PSD views or guessing placement from a flat template.',
    primaryKeyword: 'front and back t-shirt mockup',
    keywords: ['front t-shirt mockup', 'back print t-shirt mockup', 'two sided shirt mockup', '3D shirt angles'],
    editorHref: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model#design',
    cta: { label: 'Create Front and Back Mockup', href: '/3d-models/t-shirt-mockup/classic-crew-neck-t-shirt-3d-model#design' },
    outputHighlights: ['Front, back and side views', 'Artwork placement editor', 'Transparent PNG export'],
    examplesTitle: 'Front and back T-shirt views from one 3D model',
    planningTitle: 'Keep two-sided artwork consistent across every angle',
    benefitsTitle: 'Compare chest and back-print scale on the same garment',
    workflowTitle: 'From two artwork files to a consistent product view set',
    useCases: ['Front logo and back graphic sets', 'Band and event merchandise', 'Two-sided ecommerce listings'],
    useCaseDetails: ['Check a small chest mark against a larger back composition.', 'Present tour, event, school, and team shirts from both sides.', 'Export consistent angles for a product gallery or approval deck.']
  },
  'polo-shirt-mockup-generator': {
    base: 't-shirt-mockup-generator',
    title: 'Free Polo Shirt Mockup Generator',
    eyebrow: 'Collared shirt product mockups',
    subtitle: 'Customize a short-sleeve polo shirt in 3D, test chest logos and garment colors, rotate the collared silhouette, and export a clean product render.',
    intent: 'Use the polo model when collar, placket, sleeve, and left-chest logo proportions matter for uniforms, clubs, hospitality, golf apparel, or branded workwear.',
    primaryKeyword: 'free polo shirt mockup generator',
    keywords: ['polo mockup', 'collared shirt mockup', 'uniform polo mockup', 'polo logo preview'],
    image: modelCover('short-sleeve-polo-shirt-3d-model.webp'),
    heroModel: { src: 'https://cdn.cloz-design.com/d3/6588/short-sleeve-polo-shirt-3d-model.glb?v=uv-original-20260606', alt: 'Short sleeve polo shirt 3D mockup' },
    editorHref: '/3d-models/t-shirt-mockup/short-sleeve-polo-shirt-3d-model#design',
    cta: { label: 'Customize Polo Shirt', href: '/3d-models/t-shirt-mockup/short-sleeve-polo-shirt-3d-model#design' },
    outputHighlights: ['Collar and placket detail', 'Left-chest logo preview', 'Free transparent export'],
    examplesTitle: 'Polo shirt mockups for uniforms and branded apparel',
    planningTitle: 'Preview logos around the collar and placket structure',
    benefitsTitle: 'Use a true polo silhouette for branded shirt decisions',
    workflowTitle: 'From chest logo to polished polo mockup',
    useCases: ['Team and staff uniforms', 'Golf and club apparel', 'Hospitality workwear'],
    useCaseDetails: ['Preview embroidered-style chest marks on a collared shirt.', 'Prepare branded polos for teams, clubs, schools, and events.', 'Review color and logo contrast before uniform production.']
  },
  'long-sleeve-shirt-mockup-generator': {
    base: 't-shirt-mockup-generator',
    title: 'Free Long Sleeve Shirt Mockup Generator',
    eyebrow: 'Long-sleeve apparel mockups',
    subtitle: 'Customize a long-sleeve crewneck shirt in 3D, preview chest and sleeve artwork, test garment colors, and export a transparent apparel render.',
    intent: 'Use the long-sleeve model to review extended sleeve graphics, cuff-area details, chest placement, and seasonal colorways that a short-sleeve mockup cannot show.',
    primaryKeyword: 'free long sleeve shirt mockup generator',
    keywords: ['long sleeve t-shirt mockup', 'sleeve print mockup', 'crewneck shirt mockup', 'long sleeve merch mockup'],
    image: modelCover('long-sleeve-crewneck-shirt-3d-model.webp'),
    heroModel: { src: 'https://cdn.cloz-design.com/d3/6588/long-sleeve-crewneck-shirt-3d-model.glb?v=uv-original-20260606', alt: 'Long sleeve crewneck shirt 3D mockup' },
    editorHref: '/3d-models/t-shirt-mockup/long-sleeve-crewneck-shirt-3d-model#design',
    cta: { label: 'Customize Long Sleeve Shirt', href: '/3d-models/t-shirt-mockup/long-sleeve-crewneck-shirt-3d-model#design' },
    outputHighlights: ['Chest and sleeve artwork', 'Seasonal colorways', 'Transparent PNG export'],
    examplesTitle: 'Long-sleeve shirt mockups with usable sleeve views',
    planningTitle: 'Review artwork across the body and sleeve panels',
    benefitsTitle: 'See sleeve graphics on the garment they were designed for',
    workflowTitle: 'From long-sleeve artwork to product mockup',
    useCases: ['Sleeve-print streetwear', 'Seasonal merch releases', 'Long-sleeve POD listings'],
    useCaseDetails: ['Check vertical sleeve graphics and cuff-area details.', 'Build fall and winter apparel launch previews.', 'Prepare long-sleeve listing images without a photoshoot.']
  },
  'streetwear-hoodie-mockup-generator': {
    base: 'hoodie-mockup-generator',
    title: 'Free Streetwear Hoodie Mockup Generator',
    eyebrow: 'Pullover hoodie streetwear previews',
    subtitle: 'Customize a pullover hoodie in 3D, test chest, back, and sleeve graphics, compare streetwear colorways, and export a transparent product render.',
    intent: 'Use a real pullover hoodie shape to review graphic scale against the hood, kangaroo pocket, cuffs, and heavier upper-body volume before planning a streetwear drop.',
    primaryKeyword: 'free streetwear hoodie mockup generator',
    keywords: ['streetwear hoodie mockup', 'pullover hoodie mockup', 'hoodie back print mockup', 'oversized hoodie preview'],
    image: modelCover('hoodie-mockup-3d-model-04-e77e8039.webp'),
    heroModel: { src: 'https://cdn.cloz-design.com/d3/3d-models/hoodie-mockup/hoodie-mockup-3d-model-04-e77e8039.glb', alt: 'Pullover streetwear hoodie 3D mockup' },
    editorHref: '/3d-models/hoodie-mockup/classic-pullover-hoodie-3d-model#design',
    cta: { label: 'Customize Streetwear Hoodie', href: '/3d-models/hoodie-mockup/classic-pullover-hoodie-3d-model#design' },
    outputHighlights: ['Pullover hoodie model', 'Chest, back and sleeve planning', 'Free PNG export'],
    examplesTitle: 'Streetwear hoodie mockups for graphic drops',
    planningTitle: 'Balance artwork against hood and pocket volume',
    benefitsTitle: 'Preview the complete pullover silhouette before sampling',
    workflowTitle: 'From streetwear artwork to hoodie launch mockup',
    useCases: ['Graphic hoodie drops', 'Creator and team merchandise', 'Streetwear approval decks'],
    useCaseDetails: ['Review large graphics on a substantial pullover shape.', 'Build hoodie concepts for creators, teams, events, and brands.', 'Share consistent product views before sampling or photography.']
  },
  'transparent-apparel-mockup-generator': {
    base: '3d-clothing-mockup-generator',
    title: 'Free Transparent Apparel Mockup Generator',
    eyebrow: 'Background-free product renders',
    subtitle: 'Customize free 3D clothing models and export clean transparent PNG mockups for ecommerce product pages, catalogs, presentations, and POD listings.',
    intent: 'Use transparent apparel renders when the garment must drop cleanly into a product page, marketplace gallery, line sheet, launch deck, or reusable design system.',
    primaryKeyword: 'transparent apparel mockup generator',
    keywords: ['transparent clothing mockup PNG', 'background free apparel render', 'transparent t-shirt mockup', 'ecommerce clothing PNG'],
    editorHref: '/3d-models/dress/classic-one-piece-dress-3d-model#design',
    cta: { label: 'Create Transparent Mockup', href: '/3d-models/dress/classic-one-piece-dress-3d-model#design' },
    outputHighlights: ['Transparent background', 'High-resolution PNG', 'Multiple apparel categories'],
    examplesTitle: 'Transparent apparel renders for product layouts',
    planningTitle: 'Create reusable garment visuals without a fixed scene',
    benefitsTitle: 'Export product images that fit any storefront layout',
    workflowTitle: 'From 3D garment to transparent product PNG',
    useCases: ['Ecommerce product galleries', 'POD and marketplace listings', 'Line sheets and launch decks'],
    useCaseDetails: ['Place clean garment renders on any product-page background.', 'Reuse transparent apparel images across listing formats.', 'Build consistent collection boards without cutting out photos.']
  }
};

function getToolPage(slug) {
  const variant = TOOL_VARIANT_CONTENT[slug];
  const basePage = variant ? TOOL_PAGE_CONTENT[variant.base] : null;
  const page = variant ? {
    ...basePage,
    ...variant,
    visualGallery: [{
      title: `${variant.title.replace(/^Free\s+/i, '')} model preview`,
      image: variant.image || basePage.image,
      caption: variant.subtitle
    }],
    competitorInsights: [
      { title: 'Work on the correct garment shape', body: variant.intent },
      { title: 'Make changes in the browser', body: 'Rotate the live 3D model, compare garment colors, and upload artwork without opening a PSD mockup.' },
      { title: 'Export a reusable product image', body: 'Download a transparent PNG for product pages, listing drafts, presentations, and design approval.' }
    ],
    steps: [
      { title: 'Inspect the live 3D garment', body: 'Rotate the model and choose front, side, or back view before adding artwork.' },
      { title: 'Choose a garment color', body: 'Compare light, dark, neutral, and accent colors directly on the model.' },
      { title: 'Upload your artwork', body: 'Choose a PNG, JPG, WebP, or SVG and continue in the full UV artwork editor.' },
      { title: 'Export the product render', body: 'Download a transparent PNG for ecommerce, POD, client review, or launch planning.' }
    ],
    faqTitle: `${variant.title.replace(/^Free\s+/i, '')} questions`,
    faq: [
      { question: `Is this ${variant.primaryKeyword.replace(/^free\s+/i, '')} free?`, answer: 'Yes. You can inspect the model, compare colors, upload artwork, use the browser editor, and export a transparent product preview for free.' },
      { question: 'Can I upload my own logo or graphic?', answer: 'Yes. Upload PNG, JPG, WebP, or SVG artwork from the quick editor and it will open on the matching garment in the full UV editor.' },
      { question: 'Can I view the front, back, and side?', answer: 'Yes. Use the angle controls or drag the live 3D model to review artwork and garment proportions from any direction.' },
      { question: 'Do I need Photoshop?', answer: 'No. The model viewer, artwork placement workflow, color controls, and transparent PNG export run in the browser.' }
    ]
  } : TOOL_PAGE_CONTENT[slug];
  if (!page) return null;
  const image = siteImage(`tools/${slug}.webp`);
  const related = (page.relatedSlugs || Object.keys(TOOL_PAGE_CONTENT).filter(key => key !== slug).slice(0, 3))
    .map(key => {
      const value = TOOL_PAGE_CONTENT[key];
      return value ? { slug: key, title: value.title, primaryKeyword: value.primaryKeyword } : null;
    })
    .filter(Boolean);
  const editorHref = page.editorHref || String(page.cta?.href || '').replace(/\/edit(?:#.*)?$/, '') + '#design';
  return { slug, image, ...page, editorHref, related };
}

function buildToolStructuredData(req, toolPage) {
  const path = `/tools/${toolPage.slug}`;
  const structuredData = [
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
        isAccessibleForFree: true,
        featureList: [
          'Interactive 3D garment preview',
          'Garment color controls',
          'Front, side, and back camera views',
          'Artwork upload and UV placement',
          'Transparent PNG export'
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        },
        image: firstImage(req, [toolPage.image]),
        screenshot: firstImage(req, [toolPage.image])
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
        name: step.title || undefined,
        text: step.body || step
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

  if (toolPage.slug === 't-shirt-mockup-generator' && toolPage.modelStarters?.length) {
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'T-shirt mockup model starting points',
      itemListElement: toolPage.modelStarters.map((model, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: model.title,
        description: model.body,
        url: toAbsoluteUrl(req, model.href)
      }))
    });
  }

  return structuredData;
}

function buildModelDetailContent(model, related, req) {
  const categoryName = model.category_label || model.category || 'apparel';
  const categorySlug = model.category_slug || toSlug(categoryName);
  const modelUrl = toAbsoluteUrl(req, req.originalUrl);
  const imageUrl = firstImage(req, [model.image_url]);
  const fileUrl = toAbsoluteUrl(req, model.file_url);
  const designHref = `/3d-models/${categorySlug}/${model.slug}#design`;
  const searchPhrases = modelSearchPhrases(categoryName, categorySlug);
  const pageTitle = categorySlug === 't-shirt-mockup'
    ? buildSeoTitle(model.name, 'Free T-Shirt Mockup', 62)
    : /3d model/i.test(model.name)
      ? buildSeoTitle(model.name, `Free Editable ${categoryName} Mockup`, 62)
      : buildSeoTitle(model.name, `Free ${categoryName} 3D Model & Mockup`, 62);
  const searchIntentSummary = buildModelSearchIntent(model, categoryName, categorySlug);
  const descriptorList = modelDescriptor(model, categoryName);
  const description = compactText(`${model.name} is a free editable ${searchPhrases[0]} for online clothing design. Customize colors and artwork, then export a transparent PNG render.`, 158);
  const tagList = [...new Set([...searchPhrases, ...splitKeywordList(model.tags)])].slice(0, 8);
  const modelText = `${model.name} ${model.description || ''}`.toLowerCase();
  const fit = /oversized|drop shoulder/.test(modelText) ? 'Oversized / relaxed'
    : /relaxed|loose/.test(modelText) ? 'Relaxed'
      : /tailored|fitted|slim/.test(modelText) ? 'Tailored / fitted'
        : /longline/.test(modelText) ? 'Longline'
          : /structured/.test(modelText) ? 'Structured' : 'Standard model fit';
  const sleeve = /sleeveless|tank/.test(modelText) ? 'Sleeveless'
    : /long sleeve|long-sleeve/.test(modelText) ? 'Long sleeve'
      : /short sleeve|short-sleeve|t-shirt|tee/.test(modelText) ? 'Short sleeve' : 'Garment-specific';
  const neckline = /crew.?neck/.test(modelText) ? 'Crew neck'
    : /v.?neck/.test(modelText) ? 'V-neck'
      : /turtleneck|high neck/.test(modelText) ? 'High neck'
        : /polo|collar|button shirt|button-front/.test(modelText) ? 'Collared / placket' : 'Model-specific';
  const formatNotes = [
    { label: 'Format', value: 'GLB / GLTF preview model' },
    { label: 'Fit', value: fit },
    { label: 'Sleeve', value: sleeve },
    { label: 'Neckline', value: neckline },
    { label: 'Texture Layout', value: model.texture_url ? 'Packed UV SVG available' : 'Browser preview asset' },
    { label: 'Artwork Areas', value: descriptorList.join('; ') },
    { label: 'Output', value: 'Transparent PNG render export' }
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
      question: 'Do I need desktop 3D software to use this model?',
      answer: 'No. The page is designed for browser-based clothing design and mockup work, including color, artwork placement, camera views, and product-image exports.'
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
    relatedLinks: [
      {
        label: `Browse all free ${String(categoryName).toLowerCase()} 3D models`,
        href: `/mockups/${categorySlug}`
      },
      ...(categorySlug === 't-shirt-mockup' ? [{
        label: 'Open the free T-shirt mockup generator',
        href: '/tools/t-shirt-mockup-generator'
      }] : []),
      {
        label: 'Open the free 3D clothing mockup generator',
        href: '/tools/3d-clothing-mockup-generator'
      },
      ...(categorySlug === 'dress' ? [{
        label: 'Use the free online dress designer',
        href: '/tools/dress-designer'
      }] : [])
    ],
    cta: {
      eyebrow: 'Design 3D',
      title: `Customize ${model.name} in the 3D designer.`,
      description: 'Open the editor, apply your artwork direction, and create a polished apparel mockup from this model.',
      primaryLabel: 'Design This Model',
      primaryHref: designHref,
      secondaryLabel: `Browse ${categoryName} Models`,
      secondaryHref: `/mockups/${categorySlug}`
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
          { name: '3D Clothing Models', url: '/mockups' },
          { name: categoryName, url: `/mockups/${categorySlug}` },
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
        contentUrl: fileUrl,
        isAccessibleForFree: true,
        genre: '3D clothing model',
        keywords: [...new Set([model.name, categoryName, ...tagList, 'Design 3D', '3D apparel mockup', '3D clothing model', 'GLB clothing model'].filter(Boolean))],
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

router.get('/uploads/glb/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-z0-9][a-z0-9-]*\.glb$/i.test(filename)) {
    return res.status(404).render('404', { title: 'Not Found', page: '' });
  }

  return res.redirect(301, `${MOCKUP_GLB_BASE_URL}/${filename}`);
});

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
      LIMIT 120
    `, ['active']);
    const categories = await getActive3dCategories();
    const modelSummary = await db.get('SELECT COUNT(*) as count FROM models_3d WHERE status = ?', ['active']);
    const homeContent = buildHomeContent(req, models || [], categories || [], modelSummary?.count || 0);

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

router.get('/design-3d', (req, res) => {
  res.redirect(301, '/mockups');
});

// Mockups
router.get('/mockups', async (req, res) => {
  try {
    await ensureModelCategoryTable();
    const models = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ? 
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC
    `, ['active']);
    const categories = await getActive3dCategories();
    const normalizedModels = normalize3dModels(models);
    const categoryCounts = normalizedModels.reduce((counts, model) => {
      (model.category_slugs || [model.category_slug || model.category]).forEach(slug => {
        counts[slug] = (counts[slug] || 0) + 1;
      });
      return counts;
    }, {});
    const featuredCategorySlugs = ['t-shirt-mockup', 'hoodie-mockup', 'dress', 'jacket', 'coat', 'top'];
    const featuredModels = featuredCategorySlugs.flatMap(slug => (
      normalizedModels
        .filter(model => (model.category_slugs || [model.category_slug]).includes(slug))
        .slice(0, 2)
    )).slice(0, 12);
    const recentModels = normalizedModels.slice(0, 24);
    const description = 'Browse free 3D clothing models and apparel mockups for shirts, jackets, pants, dresses and hoodies. Customize online and export transparent PNG renders.';
    const collectionImage = firstImage(req, normalizedModels.map(model => model.image_url));
    
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      metaDescription: description,
      metaImage: collectionImage,
      structuredData: buildCollectionStructuredData(req, {
        name: 'Free 3D Clothing Models and Apparel Mockups',
        description,
        path: '/mockups',
        items: normalizedModels,
        itemListName: 'Free 3D clothing model and apparel mockup library',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Mockups', url: '/mockups' }
        ],
        getUrl: model => `/3d-models/${model.category_slug || model.category}/${model.slug}`
      }),
      page: 'design-3d',
      models: normalizedModels,
      featuredModels,
      recentModels,
      categoryCounts,
      categories: withCategoryImages(categories),
      landingContent: getLandingContent()
    });
  } catch (err) {
    console.error('Error loading 3D models:', err);
    const description = 'Browse free 3D clothing models and apparel mockups for shirts, jackets, pants, dresses and hoodies. Customize online and export transparent PNG renders.';
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      metaDescription: description,
      structuredData: buildCollectionStructuredData(req, {
        name: 'Free 3D Clothing Models and Apparel Mockups',
        description,
        path: '/mockups',
        items: [],
        itemListName: 'Apparel mockup model library',
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Mockups', url: '/mockups' }
        ]
      }),
      page: 'design-3d',
      models: [],
      featuredModels: [],
      recentModels: [],
      categoryCounts: {},
      categories: [],
      landingContent: getLandingContent()
    });
  }
});

// Hidden legacy Design 2D page
router.get('/design-2d', (req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

// Retire legacy Sew Patterns URLs in favor of the active 3D model library.
router.get(['/patterns', '/patterns/item/:id', '/patterns/:slug'], (req, res) => {
  res.redirect(301, '/mockups');
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
  const description = 'Design clothing online with free 3D garment models, apparel mockup generators, artwork previews, and transparent exports for ecommerce and POD.';
  res.render('tools', { 
    title: req.t('tools.title'),
    metaDescription: description,
    metaImage: firstImage(req, [siteImage('tools/3d-mockup.webp')]),
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
          { '@type': 'ListItem', position: 1, name: 'T-Shirt Mockup Generator', url: toAbsoluteUrl(req, '/tools/t-shirt-mockup-generator') },
          { '@type': 'ListItem', position: 2, name: 'Hoodie Mockup Generator', url: toAbsoluteUrl(req, '/tools/hoodie-mockup-generator') },
          { '@type': 'ListItem', position: 3, name: 'Online Dress Designer', url: toAbsoluteUrl(req, '/tools/dress-designer') },
          { '@type': 'ListItem', position: 4, name: '3D Clothing Design & Mockup Generator', url: toAbsoluteUrl(req, '/tools/3d-clothing-mockup-generator') },
          { '@type': 'ListItem', position: 5, name: 'Bulk T-Shirt Mockup Generator', url: toAbsoluteUrl(req, '/tools/bulk-t-shirt-mockup-generator') },
          { '@type': 'ListItem', position: 6, name: 'Print-on-Demand Mockup Generator', url: toAbsoluteUrl(req, '/tools/print-on-demand-mockup-generator') },
          { '@type': 'ListItem', position: 7, name: 'Oversized T-Shirt Mockup Generator', url: toAbsoluteUrl(req, '/tools/oversized-t-shirt-mockup-generator') },
          { '@type': 'ListItem', position: 8, name: 'Front and Back T-Shirt Mockup', url: toAbsoluteUrl(req, '/tools/front-and-back-t-shirt-mockup') },
          { '@type': 'ListItem', position: 9, name: 'Polo Shirt Mockup Generator', url: toAbsoluteUrl(req, '/tools/polo-shirt-mockup-generator') },
          { '@type': 'ListItem', position: 10, name: 'Long Sleeve Shirt Mockup Generator', url: toAbsoluteUrl(req, '/tools/long-sleeve-shirt-mockup-generator') },
          { '@type': 'ListItem', position: 11, name: 'Streetwear Hoodie Mockup Generator', url: toAbsoluteUrl(req, '/tools/streetwear-hoodie-mockup-generator') },
          { '@type': 'ListItem', position: 12, name: 'Transparent Apparel Mockup Generator', url: toAbsoluteUrl(req, '/tools/transparent-apparel-mockup-generator') }
        ]
      }
    }),
    page: 'tools'
  });
});

function buildBlogIndexStructuredData(req) {
  const description = 'Practical clothing design, 3D garment model, apparel mockup, print-on-demand, and streetwear guides informed by recurring designer questions.';
  return [
    ...buildSimplePageStructuredData(req, {
      type: 'CollectionPage',
      name: 'ClothingDesign Blog',
      description,
      path: '/blog',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Blog', url: '/blog' }
      ]
    }),
    itemList(
      req,
      'Clothing design and apparel mockup guides',
      blogArticles.map(article => ({
        ...article,
        name: article.title,
        url: `/blog/${article.slug}`,
        image_url: article.image
      }))
    )
  ];
}

function buildBlogArticleStructuredData(req, article) {
  const articleUrl = toAbsoluteUrl(req, `/blog/${article.slug}`);
  const articleImage = firstImage(req, [article.image]);
  const citations = article.redditSources.map(source => source.url);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      image: [articleImage],
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      mainEntityOfPage: articleUrl,
      url: articleUrl,
      author: {
        '@type': 'Organization',
        name: 'ClothingDesign Editorial',
        url: toAbsoluteUrl(req, '/blog')
      },
      publisher: {
        '@type': 'Organization',
        name: 'ClothingDesign',
        url: toAbsoluteUrl(req, '/'),
        logo: {
          '@type': 'ImageObject',
          url: firstImage(req)
        }
      },
      keywords: [article.targetKeyword, ...article.keywords].join(', '),
      citation: citations,
      about: article.keywords.map(name => ({ '@type': 'Thing', name }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: article.faq.map(item => ({
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
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: toAbsoluteUrl(req, '/') },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: toAbsoluteUrl(req, '/blog') },
        { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl }
      ]
    }
  ];
}

router.get('/blog', (req, res) => {
  const description = 'Apparel mockup and 3D clothing design guides for T-shirts, hoodies, jackets, pants, dresses, vests, leggings, knitwear, and streetwear production.';
  res.render('blog-index', {
    title: 'Apparel Mockup & 3D Clothing Design Guides | ClothingDesign',
    metaDescription: description,
    metaImage: firstImage(req, [blogArticles[0]?.image]),
    structuredData: buildBlogIndexStructuredData(req),
    page: 'blog',
    articles: blogArticles
  });
});

router.get('/blog/:slug', (req, res) => {
  const retiredBlogSlugs = {
    'clo3d-beginner-workflow': 'how-to-choose-a-3d-clothing-model',
    'fix-clo3d-folds-pattern-or-fabric': '3d-apparel-mockup-workflow'
  };
  if (retiredBlogSlugs[req.params.slug]) {
    return res.redirect(301, `/blog/${retiredBlogSlugs[req.params.slug]}`);
  }

  const article = findArticle(req.params.slug);
  if (!article) {
    return res.status(404).render('404', { title: 'Not Found', page: '' });
  }

  res.render('blog-article', {
    title: buildSeoTitle(article.seoTitle || article.title, 'ClothingDesign'),
    metaDescription: article.description,
    metaImage: firstImage(req, [article.image]),
    structuredData: buildBlogArticleStructuredData(req, article),
    page: 'blog',
    article,
    resources: articleResourceLinks(article),
    related: relatedArticles(article)
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
router.get('/3d-models/:slug', (req, res) => {
  res.redirect(301, `/mockups/${req.params.slug}`);
});

router.get('/mockups/t-shirt-mockup-generator', (req, res) => {
  res.redirect(301, '/tools/t-shirt-mockup-generator');
});

router.get('/mockups/t-shirts', (req, res) => {
  res.redirect(301, '/mockups/t-shirt-mockup');
});

router.get('/resources/glb', (req, res) => {
  res.redirect(301, '/mockups');
});

router.get('/resources/zprj-files', (req, res) => {
  res.redirect(301, '/mockups');
});

router.get('/mockups/:slug', async (req, res) => {
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

    const categories = await getActive3dCategories();
    const allModels = await db.all(`
      ${getModelCategorySelect()}
      WHERE m.status = ?
      ${getModelCategoryGroupBy()}
      ORDER BY m.created_at DESC
    `, ['active']);
    const normalizedItems = normalize3dModels(items, category.slug);
    if (normalizedItems.length === 0) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    const normalizedAllModels = normalize3dModels(allModels);
    const seoTitle = categoryMetaTitle(category.name);
    const description = categoryMetaDescription(category.name) || categoryDescription(category.name);
    const categoryImage = firstImage(req, [CATEGORY_IMAGE_ASSETS[category.slug], ...normalizedItems.map(item => item.image_url)]);
    const landingContent = getLandingContent(category);
    const categoryFaqItems = landingContent.faq?.items || [];
    
    res.render('category-landing', {
      title: buildSeoTitle(seoTitle, 'ClothingDesign', 65),
      metaDescription: description,
      metaImage: categoryImage,
      structuredData: [
        ...buildCategoryStructuredData(req, {
          ...category,
          image_url: CATEGORY_IMAGE_ASSETS[category.slug],
          meta_title: seoTitle,
          meta_description: description
        }, normalizedItems, '3d-models', '3D Models'),
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: categoryFaqItems.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer
            }
          }))
        }
      ],
      page: 'design-3d',
      category: { ...category, meta_title: seoTitle, description },
      items: normalizedItems,
      categories: withCategoryImages(categories),
      models: normalizedAllModels,
      landingContent,
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

router.get('/tools/3d-mockup', (req, res) => {
  res.redirect(301, '/tools/3d-clothing-mockup-generator');
});

router.get('/free-3d-clothing-models', (req, res) => {
  res.redirect(301, '/mockups');
});

router.get([
  '/3d-clothing-mockups-free',
  '/free-3d-clothing-design-online',
  '/free-online-clothing-designer',
  '/apparel-mockup-generator'
], (req, res) => {
  res.redirect(301, '/tools/3d-clothing-mockup-generator');
});

router.get([
  '/online-dress-designer-free',
  '/design-a-dress-online-free',
  '/online-dress-designer-tool-free'
], (req, res) => {
  res.redirect(301, '/tools/dress-designer');
});

router.get('/3d-garment-design-resources', (req, res) => {
  res.redirect(301, '/blog');
});

router.get('/clothing-models-for-ecommerce', (req, res) => {
  res.redirect(301, '/tools/transparent-apparel-mockup-generator');
});

router.get('/tools/t-shirt-designer', (req, res) => {
  res.redirect(301, '/tools/t-shirt-mockup-generator');
});

router.get('/tools/hoodie-designer', (req, res) => {
  res.redirect(301, '/tools/hoodie-mockup-generator');
});

router.get('/tools/free-patterns', (req, res) => {
  res.redirect(301, '/mockups');
});

router.get(['/tools/clo3d-guide', '/tools/md-guide'], (req, res) => {
  res.redirect(301, '/tools/3d-clothing-mockup-generator');
});

router.get('/tools/2d-mockup', (req, res) => {
  res.redirect(301, '/mockups');
});

// Tools Category Route
router.get('/tools/:slug', async (req, res) => {
  const toolPage = getToolPage(req.params.slug);
  if (toolPage) {
    const isIndexableTool = Boolean(
      TOOL_VARIANT_CONTENT[req.params.slug]
      || ['t-shirt-mockup-generator', 'hoodie-mockup-generator', 'dress-designer', '3d-clothing-mockup-generator', 'bulk-t-shirt-mockup-generator', 'print-on-demand-mockup-generator'].includes(req.params.slug)
    );
    return res.render('tool-detail', {
      title: buildSeoTitle(toolPage.title, 'ClothingDesign'),
      metaDescription: compactText(toolPage.subtitle, 160),
      metaImage: firstImage(req, [toolPage.image]),
      structuredData: buildToolStructuredData(req, toolPage),
      metaRobots: isIndexableTool ? undefined : 'noindex,follow',
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
          { name: '3D Clothing Models', url: '/mockups' },
          { name: normalizedModel.category_label || normalizedModel.category || categorySlug, url: `/mockups/${categorySlug}` },
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
