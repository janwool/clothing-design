const express = require('express');
const router = express.Router();
const db = require('../lib/db');

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

function isAllowedTextureUrl(rawUrl) {
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

router.get('/api/texture-svg', async (req, res) => {
  const textureUrl = req.query.url;
  if (!textureUrl || !isAllowedTextureUrl(textureUrl)) {
    return res.status(400).json({ error: 'Invalid texture URL' });
  }

  try {
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
    const models = await db.all(`
      SELECT m.*, c.slug as category_slug 
      FROM models_3d m 
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.status = ? 
      ORDER BY m.created_at DESC
    `, ['active']);
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order', ['3d-models', 'active']);
    
    res.render('design-3d', { 
      title: req.t('design3d.title'),
      page: 'design-3d',
      models: models || [],
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

// Design 2D
router.get('/design-2d', (req, res) => {
  res.render('design-2d', { 
    title: req.t('design2d.title'),
    page: 'design-2d'
  });
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

    res.render('pattern-detail', {
      title: pattern.name,
      page: 'patterns',
      pattern,
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
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, '3d-models', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all(`
      SELECT m.*, c.slug as category_slug 
      FROM models_3d m 
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.category = ? AND m.status = ? 
      ORDER BY m.created_at DESC
    `, [category.name, 'active']);

    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order', 
      ['3d-models', 'active']
    );
    const allModels = await db.all(`
      SELECT m.*, c.slug as category_slug
      FROM models_3d m
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.status = ?
      ORDER BY m.created_at DESC
    `, ['active']);
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      page: 'design-3d',
      category: category,
      items: items || [],
      categories: categories || [],
      models: allModels || [],
      landingContent: getLandingContent(category),
      resourceType: '3d-models',
      resourceTypeLabel: '3D Models'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// 2D Templates Category Route
router.get('/2d-templates/:slug', async (req, res) => {
  try {
    const category = await db.get('SELECT * FROM categories WHERE slug = ? AND resource_type = ? AND status = ?', 
      [req.params.slug, '2d-templates', 'active']
    );
    
    if (!category) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    const items = await db.all('SELECT * FROM models_2d WHERE category = ? AND status = ? ORDER BY created_at DESC',
      [category.name, 'active']
    );
    
    res.render('category-landing', {
      title: category.meta_title || category.name,
      page: 'design-2d',
      category: category,
      items: items || [],
      resourceType: '2d-templates',
      resourceTypeLabel: '2D Templates'
    });
  } catch (err) {
    res.status(500).render('404', { title: 'Error', page: '' });
  }
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
    const model = await db.get(`
      SELECT m.*, c.slug as category_slug 
      FROM models_3d m 
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.slug = ? AND m.status = ?
    `, [req.params.slug, 'active']);
    
    if (!model) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    res.render('designer-3d', {
      title: `Design - ${model.name}`,
      page: 'designer',
      model: model
    });
  } catch (err) {
    console.error('Error loading designer:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

// 3D Model Detail Page
router.get('/3d-models/:category/:slug', async (req, res) => {
  try {
    const model = await db.get(`
      SELECT m.*, c.slug as category_slug 
      FROM models_3d m 
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.slug = ? AND m.status = ?
    `, [req.params.slug, 'active']);
    
    if (!model) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    
    // Get related models with category slugs
    const related = await db.all(`
      SELECT m.*, c.slug as category_slug 
      FROM models_3d m 
      LEFT JOIN categories c ON m.category = c.name AND c.resource_type = '3d-models'
      WHERE m.category = ? AND m.id != ? AND m.status = ? 
      ORDER BY m.created_at DESC 
      LIMIT 4
    `, [model.category, model.id, 'active']);
    
    res.render('model-detail', {
      title: model.name,
      page: 'design-3d',
      model: model,
      related: related || []
    });
  } catch (err) {
    console.error('Error loading model detail:', err);
    res.status(500).render('404', { title: 'Error', page: '' });
  }
});

module.exports = router;
