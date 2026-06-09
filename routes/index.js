const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { getModelSlug, normalize3dModel, normalize3dModels } = require('../lib/slug');
const {
  DEFAULT_SITE_IMAGE_PATH,
  toAbsoluteUrl,
  firstImage,
  imageObject,
  itemList,
  pageStructuredData
} = require('../lib/seo');

function getDefaultLandingContent(name = '3D clothing models') {
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

function getLandingContent(category) {
  const defaults = getDefaultLandingContent(category ? category.name : '3D clothing models');
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
      title: 'Ecommerce product pages',
      text: 'Create consistent apparel mockup images before a photoshoot or physical sample is ready.'
    },
    {
      title: 'Print-on-demand previews',
      text: 'Preview artwork placement on realistic 3D clothing models for shirts, hoodies, tops, and accessories.'
    },
    {
      title: 'Fashion design review',
      text: 'Share clear 3D garment visuals with clients, merch teams, pattern makers, and internal stakeholders.'
    }
  ];
  const faq = [
    {
      question: 'What is ClothingDesign?',
      answer: 'ClothingDesign is a browser-based Design3D workspace for customizing 3D clothing models, previewing apparel artwork, and exporting high-resolution mockup renders.'
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
  const metaDescription = 'Create apparel mockups online with Design3D clothing models. Customize garments, preview artwork in 3D, browse sewing patterns, and export high-resolution transparent renders.';
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
      name: '3D Clothing Design and Apparel Mockup Generator',
      description: metaDescription,
      url: pageUrl,
      image: primaryImage,
      primaryImageOfPage: imageObject(req, primaryImage),
      mainEntity: {
        '@type': 'SoftwareApplication',
        name: 'ClothingDesign Design3D',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web browser',
        description: 'Browser-based 3D apparel mockup generator for customizing clothing models and exporting transparent product renders.'
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
    eyebrow: 'Free apparel design tool',
    subtitle: 'Create a T-shirt concept online, choose a 3D shirt model, preview artwork placement, and export a clean apparel mockup without paying for design software.',
    intent: 'People searching this page usually want a fast custom T-shirt maker with text, graphics, preview images, and a simple download path.',
    primaryKeyword: 'free t-shirt designer online',
    keywords: ['custom t-shirt design tool', 't-shirt mockup generator', 'design your own t-shirt free', 'online shirt designer'],
    competitorInsights: [
      'Top pages lead with a free editor, upload artwork, add text, and preview the shirt quickly.',
      'Most competitors push print ordering or paid mockup downloads after the design step.',
      'Search results reward pages that show examples, supported workflows, and clear export expectations.'
    ],
    freePositioning: 'Our angle is a free T-shirt design workflow focused on mockup creation first: open a 3D T-shirt model, test artwork placement, and export review-ready visuals.',
    steps: [
      'Choose a T-shirt or shirt model from the Design3D library.',
      'Add your graphic direction, text idea, colorway, or logo placement.',
      'Preview the design on a realistic garment shape instead of a flat blank canvas.',
      'Download the render for product planning, store drafts, or client approval.'
    ],
    useCases: ['Print-on-demand previews', 'Brand drop planning', 'Team merch concepts'],
    cta: { label: 'Start with T-Shirt Models', href: '/3d-models/t-shirt-mockup' }
  },
  'hoodie-designer': {
    title: 'Free Hoodie Designer Online',
    eyebrow: 'Free hoodie mockup workflow',
    subtitle: 'Design hoodie concepts online with 3D garment previews, artwork placement ideas, and export-ready mockup images for ecommerce or team review.',
    intent: 'Searchers want a hoodie maker that can preview front graphics, colorways, and brand concepts before printing.',
    primaryKeyword: 'free hoodie designer online',
    keywords: ['custom hoodie maker', 'hoodie mockup generator', 'design your own hoodie', 'online hoodie design tool'],
    competitorInsights: [
      'Leading hoodie pages emphasize upload, text, product colors, and print ordering.',
      'Many tools show flat product mockups, while 3D garment context is less common.',
      'Pages that explain print placement and product preview use cases answer the search intent better.'
    ],
    freePositioning: 'Our page positions hoodie design as a free 3D mockup step before production, useful even if the user is not ready to order prints.',
    steps: [
      'Open a hoodie model or a related outerwear category.',
      'Choose base color and decide front, back, or sleeve artwork placement.',
      'Review proportions on a 3D garment preview.',
      'Export a transparent mockup render for launch decks or product tests.'
    ],
    useCases: ['Streetwear drops', 'School and team apparel', 'Client approval mockups'],
    cta: { label: 'Browse Hoodie Models', href: '/3d-models/hoodie-mockup' }
  },
  'dress-designer': {
    title: 'Free Dress Design Tool Online',
    eyebrow: 'Free fashion preview tool',
    subtitle: 'Plan dress concepts online with garment model references, silhouette-focused mockups, and free apparel design resources for fashion presentations.',
    intent: 'Users are looking for a simple dress design maker, dress sketch alternative, or fashion preview workflow that does not require CAD experience.',
    primaryKeyword: 'free dress design tool online',
    keywords: ['dress mockup maker', 'design your own dress online', 'fashion dress design tool', 'dress template creator'],
    competitorInsights: [
      'Search results often mix consumer dress customizers with fashion sketch tools.',
      'Competitors highlight templates, color changes, and easy beginner workflows.',
      'There is room for a page that connects dress design ideas to 3D apparel mockups and sewing pattern resources.'
    ],
    freePositioning: 'Our free approach helps users move from silhouette idea to 3D/apparel preview resources without forcing a paid fashion CAD workflow.',
    steps: [
      'Start from dress models or dress sewing pattern resources.',
      'Define the silhouette, length, color direction, and surface detail.',
      'Use related 3D models or pattern downloads for visual review.',
      'Prepare a mockup image or production reference for the next design step.'
    ],
    useCases: ['Fashion concept boards', 'Boutique product planning', 'Pattern review'],
    cta: { label: 'Browse Dress Models', href: '/3d-models/dress' }
  },
  '3d-mockup': {
    title: 'Free 3D Clothing Mockup Generator',
    eyebrow: 'Free 3D apparel preview',
    subtitle: 'Generate 3D clothing mockup previews from browser-ready garment models and export high-resolution transparent renders for apparel content.',
    intent: 'Searchers want a free 3D mockup generator for clothing that feels faster than Photoshop and more realistic than flat PSD templates.',
    primaryKeyword: 'free 3D clothing mockup generator',
    keywords: ['3D apparel mockup generator', 'clothing mockup generator free', 'online 3D product mockup', 'transparent apparel render'],
    competitorInsights: [
      'Competitors often lead with device/product mockups and include apparel as one category.',
      'Many mockup generators hide premium exports behind accounts or subscriptions.',
      'The strongest pages show output examples, file/export expectations, and a short workflow.'
    ],
    freePositioning: 'Our focus is free apparel-first 3D mockups: garment models, realistic preview angles, and clean render exports for product teams.',
    steps: [
      'Pick a 3D clothing model from the library.',
      'Customize color, artwork direction, and viewing angle.',
      'Use the model preview to check shape and placement.',
      'Export a transparent render for ecommerce, presentations, or approvals.'
    ],
    useCases: ['Ecommerce images', 'Product launch decks', 'Portfolio mockups'],
    cta: { label: 'Open 3D Model Library', href: '/design-3d' }
  },
  '2d-mockup': {
    title: 'Free 2D Clothing Mockup Generator',
    eyebrow: 'Free flat apparel preview',
    subtitle: 'Create quick 2D clothing mockup plans using apparel templates, pattern references, and free visual resources before moving into 3D review.',
    intent: 'Users want a fast flat clothing mockup or apparel template workflow for early design communication.',
    primaryKeyword: 'free 2D clothing mockup generator',
    keywords: ['2D apparel mockup', 'free clothing mockup template', 'flat garment mockup', 'shirt template mockup'],
    competitorInsights: [
      'Search results commonly feature PSD, vector, and flat-lay template downloads.',
      'Users expect fast visual output and clear download terms.',
      'A useful page should connect flat mockups to patterns and 3D previews when the design needs more realism.'
    ],
    freePositioning: 'Our page uses free resources as the starting point and points users toward patterns or Design3D when a flat mockup is not enough.',
    steps: [
      'Choose a garment type and collect a flat reference or pattern.',
      'Plan text, artwork, seams, and placement notes.',
      'Use the mockup as a quick communication draft.',
      'Move into 3D preview when you need realistic shape and angles.'
    ],
    useCases: ['Early artwork placement', 'Factory communication', 'Line sheet drafts'],
    cta: { label: 'Browse Free Patterns', href: '/patterns' }
  },
  'free-patterns': {
    title: 'Free Sewing Patterns for CLO 3D and Marvelous Designer',
    eyebrow: 'Free apparel pattern downloads',
    subtitle: 'Browse free sewing pattern resources for digital garment development, CLO 3D review, Marvelous Designer workflows, and apparel mockup planning.',
    intent: 'Searchers want downloadable sewing patterns, file format clarity, preview images, and confidence that the resources are usable.',
    primaryKeyword: 'free sewing patterns CLO3D Marvelous Designer',
    keywords: ['free ZPRJ pattern download', 'CLO 3D sewing patterns free', 'Marvelous Designer patterns free', 'digital garment patterns'],
    competitorInsights: [
      'Competitor pages win when they show previews, file formats, and direct download actions.',
      'Users care about compatibility with CLO 3D and Marvelous Designer.',
      'Helpful pages explain how to open the file after download, not just list files.'
    ],
    freePositioning: 'Our page leads with free pattern discovery and connects each download to clear CLO 3D, Marvelous Designer, and Design3D next steps.',
    steps: [
      'Browse active sewing pattern previews.',
      'Open a pattern detail page to confirm category and file format.',
      'Download the source file and open it in CLO 3D or Marvelous Designer.',
      'Pair it with related Design3D models for apparel mockup visuals.'
    ],
    useCases: ['Digital garment practice', 'Pattern review', '3D apparel mockup planning'],
    cta: { label: 'Browse Free Sewing Patterns', href: '/patterns' }
  },
  'free-templates': {
    title: 'Free Clothing Templates for Apparel Mockups',
    eyebrow: 'Free template resources',
    subtitle: 'Find free clothing template ideas for shirts, hoodies, dresses, and apparel mockups, then move into 3D previews when you need realistic presentation.',
    intent: 'Users want free apparel templates, preferably with clear garment categories and download or mockup next steps.',
    primaryKeyword: 'free clothing templates',
    keywords: ['free apparel templates', 'free t-shirt template', 'clothing mockup template free', 'fashion design templates'],
    competitorInsights: [
      'Template competitors emphasize PSD/vector file types, categories, and free download terms.',
      'Many pages are asset libraries rather than guided workflows.',
      'A stronger page can help users choose when to use a flat template, pattern, or 3D model.'
    ],
    freePositioning: 'Our free template page is a decision hub: start with templates and patterns, then continue into 3D model previews for presentation-ready output.',
    steps: [
      'Pick the apparel category you want to mock up.',
      'Use a flat template or sewing pattern for early planning.',
      'Translate placement notes into a 3D clothing model when needed.',
      'Export a final render or keep the template as a production reference.'
    ],
    useCases: ['Design briefs', 'Artwork planning', 'Merch line organization'],
    cta: { label: 'Explore Pattern Resources', href: '/patterns' }
  },
  'clo3d-guide': {
    title: 'Free CLO 3D Guide for Beginners',
    eyebrow: 'Free learning guide',
    subtitle: 'Learn the basic CLO 3D workflow: open garment files, review 2D patterns, simulate fabric, and create apparel visuals for design review.',
    intent: 'Searchers want a beginner CLO 3D tutorial with practical steps, not a broad fashion theory article.',
    primaryKeyword: 'CLO 3D guide for beginners',
    keywords: ['CLO3D tutorial', 'how to use CLO 3D', 'CLO 3D sewing pattern guide', 'digital fashion design guide'],
    competitorInsights: [
      'Tutorial pages rank when they break the workflow into small beginner steps.',
      'Users need help with opening files, pattern windows, simulation, and exporting views.',
      'Useful guides link to downloadable practice files or garment resources.'
    ],
    freePositioning: 'Our guide is free and resource-led: learn CLO 3D basics, then use free patterns and 3D model pages to practice.',
    steps: [
      'Download a compatible sewing pattern file.',
      'Open the file in CLO 3D and inspect the 2D pattern window.',
      'Check sewing relationships, arrangement, avatar scale, and fabric settings.',
      'Simulate, refine, and export preview images for review.'
    ],
    useCases: ['Beginner garment simulation', 'Pattern learning', 'Digital sample review'],
    cta: { label: 'Practice with Free Patterns', href: '/patterns' }
  },
  'md-guide': {
    title: 'Free Marvelous Designer Guide for Beginners',
    eyebrow: 'Free learning guide',
    subtitle: 'Learn the Marvelous Designer basics for opening garment projects, checking 2D patterns, simulating fit, and preparing apparel visuals.',
    intent: 'Searchers want a practical Marvelous Designer tutorial that explains what to do first and how to use garment project files.',
    primaryKeyword: 'Marvelous Designer guide for beginners',
    keywords: ['Marvelous Designer tutorial', 'how to use Marvelous Designer', 'Marvelous Designer sewing pattern', '3D clothing simulation guide'],
    competitorInsights: [
      'Ranking tutorials focus on beginner workflows and common interface tasks.',
      'Users want direct advice on opening project files, sewing, simulation, and fit review.',
      'A good guide should include downloadable resources or next steps for practice.'
    ],
    freePositioning: 'Our page keeps the learning path free: use downloadable pattern resources, practice basic simulation, and connect outputs to apparel mockups.',
    steps: [
      'Download a garment project or sewing pattern file.',
      'Open it in Marvelous Designer and review the 2D/3D workspace.',
      'Inspect sewing lines, fabric assignments, and avatar placement.',
      'Run simulation, adjust fit, and save a clean project version.'
    ],
    useCases: ['Beginner MD practice', 'Fit and fabric simulation', 'Garment presentation prep'],
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
      mainEntity: [
        {
          '@type': 'Question',
          name: `Is ${toolPage.title} free?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: toolPage.freePositioning
          }
        },
        {
          '@type': 'Question',
          name: `What keywords does this ${toolPage.eyebrow.toLowerCase()} target?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: [toolPage.primaryKeyword, ...toolPage.keywords].join(', ')
          }
        }
      ]
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

function buildPatternDetailContent(pattern, design3dCategory, req) {
  const format = String(pattern.format || 'zprj').replace(/^\./, '').toLowerCase();
  const fileExt = `.${format}`;
  const categoryName = pattern.category || 'apparel';
  const design3dCategoryName = design3dCategory?.name || categoryName;
  const design3dHref = design3dCategory?.slug ? `/3d-models/${design3dCategory.slug}` : '/design-3d';
  const description = `${pattern.name} is a ${fileExt.toUpperCase()} sewing pattern for ${categoryName}. Learn how to open it in CLO 3D and Marvelous Designer, then pair it with ${design3dCategoryName} Design 3D models for apparel mockups.`;
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
    metaDescription: description,
    faqItems,
    cloIntro: `Use ${pattern.name} as a CLO 3D project file for ${categoryName} development. Open the project, inspect the pattern layout, then simulate and refine the garment before creating review visuals.`,
    marvelousIntro: `Use ${pattern.name} as a Marvelous Designer project file when you need to review pattern pieces, sewing relationships, fabric behavior, and fit before exporting a production-ready iteration.`,
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
        title: 'Check pattern and garment settings',
        body: 'Review the 2D pattern pieces, sewing lines, arrangement, fabrics, and avatar scale before simulation.'
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
        title: 'Review 2D and 3D garment setup',
        body: 'Check the 2D pattern pieces, sewing relationship, fabric assignment, and avatar placement.'
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
  const description = `${model.name} is a browser-ready Design 3D clothing model for ${categoryName} mockups. Learn how to customize it, where to use it, view FAQs, and compare related 3D apparel models.`;
  const howToSteps = [
    {
      title: 'Open the 3D model',
      body: `Start with ${model.name} and inspect the garment shape, seams, proportions, and viewing angles before applying artwork.`
    },
    {
      title: 'Set the base color and material direction',
      body: 'Choose a colorway that matches the design brief, then use the 3D preview to check how the garment reads under studio lighting.'
    },
    {
      title: 'Place graphics and surface details',
      body: 'Add logos, prints, panels, or placement notes while checking scale across front, side, and angled views.'
    },
    {
      title: 'Export review-ready visuals',
      body: 'Use the finished preview for ecommerce tests, client approvals, internal line reviews, or campaign planning.'
    }
  ];
  const applications = [
    {
      title: 'Ecommerce product previews',
      body: `Use ${model.name} to create consistent product visuals before photography or sample production.`
    },
    {
      title: 'Apparel concept validation',
      body: 'Compare colorways, print placement, and garment proportions while the design is still easy to change.'
    },
    {
      title: 'Client and team approvals',
      body: 'Share a clearer 3D clothing mockup for merch teams, factories, buyers, and creative stakeholders.'
    }
  ];
  const faqItems = [
    {
      question: `What is ${model.name} best used for?`,
      answer: `${model.name} is best used for ${categoryName} apparel mockups, design reviews, ecommerce previews, and early product presentation visuals.`
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
    designHref,
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
        keywords: [model.name, categoryName, 'Design 3D', '3D apparel mockup', '3D clothing model'].filter(Boolean),
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
    const description = 'Browse Design3D clothing models for online apparel mockups, customize garment artwork, and export high-resolution transparent renders.';
    
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      metaDescription: description,
      structuredData: buildCollectionStructuredData(req, {
        name: '3D Clothing Models',
        description,
        path: '/design-3d',
        items: normalizedModels,
        itemListName: 'Design3D clothing model library',
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
    const description = 'Browse Design3D clothing models for online apparel mockups, customize garment artwork, and export high-resolution transparent renders.';
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

    res.render('patterns', {
      title: req.t('patterns.title'),
      metaDescription: description,
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
      title: pattern.name,
      metaDescription: patternDetailContent.metaDescription,
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      metaDescription: description,
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
    const description = category.meta_description || category.description || `Browse ${category.name} sewing patterns for CLO 3D, Marvelous Designer, and apparel development workflows.`;
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      metaDescription: description,
      structuredData: buildCategoryStructuredData(req, category, items || [], 'patterns', 'Sew Patterns'),
      page: 'patterns',
      category: category,
      items: items || [],
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      metaDescription: description,
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
      title: `${toolPage.title} - ClothingDesign`,
      metaDescription: toolPage.subtitle,
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      metaDescription: description,
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
      model: normalizedModel
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
      title: model.name,
      metaDescription: modelDetailContent.metaDescription,
      structuredData: modelDetailContent.structuredData,
      page: 'design-3d',
      model: normalizedModel,
      modelDetailContent,
      related: normalizedRelated
    });
  } catch (err) {
    console.error('Error loading model detail:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

module.exports = router;
