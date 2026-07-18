require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../lib/db');
const { modelCover, siteImage } = require('../lib/site-assets');
const {
  CORE_STATIC_PATHS,
  isPriority3dCategory,
  modelSitemapLimit,
  patternSitemapLimit,
  shouldIndexModel,
  shouldIndexPattern
} = require('../lib/seo-priority');

const baseUrl = (process.env.SITEMAP_BASE_URL || 'https://www.cloz-design.com').replace(/\/+$/, '');
const outputPath = path.resolve(__dirname, '..', 'public', 'sitemap.xml');
const robotsPath = path.resolve(__dirname, '..', 'public', 'robots.txt');
const staticToolPaths = [
  '/tools/t-shirt-mockup-generator',
  '/tools/hoodie-mockup-generator',
  '/tools/3d-clothing-mockup-generator',
  '/tools/bulk-t-shirt-mockup-generator',
  '/tools/print-on-demand-mockup-generator',
  '/tools/oversized-t-shirt-mockup-generator',
  '/tools/front-and-back-t-shirt-mockup',
  '/tools/polo-shirt-mockup-generator',
  '/tools/long-sleeve-shirt-mockup-generator',
  '/tools/streetwear-hoodie-mockup-generator',
  '/tools/transparent-apparel-mockup-generator'
];

const staticToolImages = {
  '/tools/t-shirt-mockup-generator': siteImage('mockups/t-shirt-mockup-generator.webp'),
  '/tools/hoodie-mockup-generator': siteImage('mockups/hoodie-mockup-generator.webp'),
  '/tools/3d-clothing-mockup-generator': siteImage('mockups/clothing-mockup-generator.webp'),
  '/tools/bulk-t-shirt-mockup-generator': siteImage('mockups/bulk-t-shirt-mockup-generator.webp'),
  '/tools/print-on-demand-mockup-generator': siteImage('mockups/print-on-demand-mockup-generator.webp'),
  '/tools/oversized-t-shirt-mockup-generator': 'https://cdn.cloz-design.com/image/1780135799225-218296703.webp',
  '/tools/front-and-back-t-shirt-mockup': modelCover('t-shirt-mockup-3d-model-01-aa09ae0d.webp'),
  '/tools/polo-shirt-mockup-generator': modelCover('short-sleeve-polo-shirt-3d-model.webp'),
  '/tools/long-sleeve-shirt-mockup-generator': modelCover('long-sleeve-crewneck-shirt-3d-model.webp'),
  '/tools/streetwear-hoodie-mockup-generator': modelCover('hoodie-mockup-3d-model-04-e77e8039.webp'),
  '/tools/transparent-apparel-mockup-generator': siteImage('mockups/clothing-mockup-generator.webp')
};

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function absoluteUrl(pathname) {
  const normalized = String(pathname || '/').startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${normalized}`;
}

function absoluteAssetUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(String(value))) return String(value);
  return absoluteUrl(value);
}

function addUrl(urls, seen, pathname, lastmod, image) {
  const loc = absoluteUrl(pathname);
  if (seen.has(loc)) return;
  seen.add(loc);
  urls.push({
    loc,
    lastmod: toIsoDate(lastmod),
    changefreq: getChangefreq(pathname),
    priority: getPriority(pathname),
    image: absoluteAssetUrl(image)
  });
}

function getPriority(pathname) {
  if (pathname === '/') return '1.0';
  if (['/mockups', '/tools', '/patterns'].includes(pathname)) return '0.9';
  if (pathname.startsWith('/tools/')) return '0.8';
  if (pathname.startsWith('/mockups/') && pathname.split('/').length === 3) return '0.8';
  if (pathname.startsWith('/3d-models/')) return '0.7';
  if (pathname.startsWith('/patterns/item/')) return '0.5';
  return '0.6';
}

function getChangefreq(pathname) {
  if (pathname === '/' || pathname === '/mockups') return 'weekly';
  if (pathname.startsWith('/mockups/') || pathname.startsWith('/3d-models/') || pathname.startsWith('/patterns/')) return 'monthly';
  return 'weekly';
}

async function get3dModelUrls() {
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);

  return db.all(`
    SELECT
      m.id,
      m.slug,
      m.name,
      m.description,
      m.tags,
      m.image_url,
      m.file_url,
      m.texture_url,
      COALESCE(primary_category.slug, legacy_category.slug) as category_slug,
      m.updated_at,
      m.created_at
    FROM models_3d m
    LEFT JOIN categories legacy_category
      ON m.category = legacy_category.name AND legacy_category.resource_type = '3d-models'
    LEFT JOIN categories primary_category
      ON primary_category.id = (
        SELECT mc_primary.category_id
        FROM model_3d_categories mc_primary
        WHERE mc_primary.model_id = m.id
        ORDER BY mc_primary.is_primary DESC, mc_primary.category_id ASC
        LIMIT 1
      )
    WHERE m.status = ? AND m.slug IS NOT NULL AND m.slug != ''
    ORDER BY m.updated_at DESC, m.id DESC
  `, ['active']);
}

async function getCategories() {
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);

  return db.all(`
    SELECT slug, resource_type, updated_at, created_at
    FROM categories
    WHERE status = ?
      AND slug IS NOT NULL
      AND slug != ''
      AND (
        resource_type != '3d-models'
        OR EXISTS (
          SELECT 1
          FROM model_3d_categories mc_exists
          JOIN models_3d m_exists ON m_exists.id = mc_exists.model_id
          WHERE mc_exists.category_id = categories.id
            AND m_exists.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM models_3d m_legacy
          WHERE m_legacy.category = categories.name
            AND m_legacy.status = 'active'
        )
      )
    ORDER BY resource_type ASC, sort_order ASC, name ASC
  `, ['active']);
}

async function getPatterns() {
  return db.all(`
    SELECT id, description, tags, image_url, file_url, format, updated_at, created_at
    FROM patterns
    WHERE status = ?
    ORDER BY updated_at DESC, id DESC
  `, ['active']);
}

function categoryPath(category) {
  const prefixes = {
    '3d-models': '/mockups',
    patterns: '/patterns',
    gallery: '/gallery',
    tools: '/tools'
  };
  const prefix = prefixes[category.resource_type];
  return prefix ? `${prefix}/${category.slug}` : null;
}

function renderSitemap(urls) {
  const body = urls
    .map(item => [
      '  <url>',
      `    <loc>${escapeXml(item.loc)}</loc>`,
      `    <lastmod>${escapeXml(item.lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(item.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(item.priority)}</priority>`,
      item.image ? '    <image:image>' : null,
      item.image ? `      <image:loc>${escapeXml(item.image)}</image:loc>` : null,
      item.image ? '    </image:image>' : null,
      '  </url>'
    ].filter(Boolean).join('\n'))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    body,
    '</urlset>',
    ''
  ].join('\n');
}

async function main() {
  const urls = [];
  const seen = new Set();
  const now = new Date().toISOString();

  CORE_STATIC_PATHS.forEach(pathname => addUrl(urls, seen, pathname, now));
  staticToolPaths.forEach(pathname => addUrl(urls, seen, pathname, now, staticToolImages[pathname]));

  const categories = await getCategories();
  categories.forEach(category => {
    const pathname = categoryPath(category);
    if (!pathname) return;
    if (category.resource_type === '3d-models' && !isPriority3dCategory(category)) return;
    addUrl(urls, seen, pathname, category.updated_at || category.created_at);
  });

  const models = await get3dModelUrls();
  models
    .filter(shouldIndexModel)
    .slice(0, modelSitemapLimit())
    .forEach(model => {
      const categorySlug = model.category_slug || '3d-models';
      addUrl(
        urls,
        seen,
        `/3d-models/${categorySlug}/${model.slug}`,
        model.updated_at || model.created_at,
        model.image_url
      );
    });

  const patternLimit = patternSitemapLimit();
  if (patternLimit > 0) {
    const patterns = await getPatterns();
    patterns
      .filter(shouldIndexPattern)
      .slice(0, patternLimit)
      .forEach(pattern => {
        addUrl(urls, seen, `/patterns/item/${pattern.id}`, pattern.updated_at || pattern.created_at);
      });
  }

  urls.sort((a, b) => a.loc.localeCompare(b.loc));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderSitemap(urls), 'utf8');
  await fs.writeFile(robotsPath, [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n'), 'utf8');

  console.log(JSON.stringify({
    baseUrl,
    outputPath,
    robotsPath,
    urlCount: urls.length
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
