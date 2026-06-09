const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { getModelSlug, normalize3dModel, normalize3dModels } = require('../lib/slug');

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
      primaryHref: '/design-3d',
      secondaryLabel: 'See Plans',
      secondaryHref: '/pricing'
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

function getRequestOrigin(req) {
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get('host');
  return host ? `${protocol}://${host}` : '';
}

function toAbsoluteUrl(req, value) {
  if (!value) return undefined;
  try {
    return new URL(value).href;
  } catch (err) {
    const origin = getRequestOrigin(req);
    return origin ? new URL(value, origin).href : value;
  }
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
  const imageUrl = toAbsoluteUrl(req, pattern.image_url);
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
      {
        '@context': 'https://schema.org',
        '@type': 'DigitalDocument',
        name: pattern.name,
        description,
        fileFormat: fileExt,
        encodingFormat: format,
        url: pageUrl,
        image: imageUrl,
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
  const imageUrl = toAbsoluteUrl(req, model.image_url);
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
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: model.name,
        description,
        url: modelUrl,
        image: imageUrl,
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
router.get('/', (req, res) => {
  res.render('index', { 
    title: req.t('home.title'),
    page: 'home'
  });
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
    
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      page: 'design-3d',
      models: normalize3dModels(models),
      categories: categories || [],
      landingContent: getLandingContent()
    });
  } catch (err) {
    console.error('Error loading 3D models:', err);
    res.render('design-3d', { 
      title: req.t('design3d.title'),
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

    res.render('patterns', {
      title: req.t('patterns.title'),
      page: 'patterns',
      patterns: patterns || [],
      categories: categories || []
    });
  } catch (err) {
    console.error('Error loading patterns:', err);
    res.render('patterns', {
      title: req.t('patterns.title'),
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
  res.render('gallery', { 
    title: req.t('gallery.title'),
    page: 'gallery'
  });
});

// Tools
router.get('/tools', (req, res) => {
  res.render('tools', { 
    title: req.t('tools.title'),
    page: 'tools'
  });
});

// Pricing
router.get('/pricing', (req, res) => {
  res.render('pricing', { 
    title: req.t('pricing.title'),
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      page: 'design-3d',
      category: category,
      items: normalize3dModels(items, category.slug),
      categories: categories || [],
      models: normalize3dModels(allModels),
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
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
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
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
    
    res.render('designer-3d', {
      title: `Design - ${model.name}`,
      page: 'designer',
      model: normalize3dModel(model)
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
