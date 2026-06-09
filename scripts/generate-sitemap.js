require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../lib/db');

const baseUrl = (process.env.SITEMAP_BASE_URL || 'https://www.cloz-design.com').replace(/\/+$/, '');
const outputPath = path.resolve(__dirname, '..', 'public', 'sitemap.xml');
const robotsPath = path.resolve(__dirname, '..', 'public', 'robots.txt');

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

function addUrl(urls, seen, pathname, lastmod) {
  const loc = absoluteUrl(pathname);
  if (seen.has(loc)) return;
  seen.add(loc);
  urls.push({
    loc,
    lastmod: toIsoDate(lastmod)
  });
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
  return db.all(`
    SELECT slug, resource_type, updated_at, created_at
    FROM categories
    WHERE status = ? AND slug IS NOT NULL AND slug != ''
    ORDER BY resource_type ASC, sort_order ASC, name ASC
  `, ['active']);
}

async function getPatterns() {
  return db.all(`
    SELECT id, updated_at, created_at
    FROM patterns
    WHERE status = ?
    ORDER BY updated_at DESC, id DESC
  `, ['active']);
}

function categoryPath(category) {
  const prefixes = {
    '3d-models': '/3d-models',
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
      '  </url>'
    ].join('\n'))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    ''
  ].join('\n');
}

async function main() {
  const urls = [];
  const seen = new Set();
  const now = new Date().toISOString();

  [
    '/',
    '/design-3d',
    '/patterns',
    '/gallery',
    '/tools',
    '/pricing'
  ].forEach(pathname => addUrl(urls, seen, pathname, now));

  const categories = await getCategories();
  categories.forEach(category => {
    const pathname = categoryPath(category);
    if (pathname) addUrl(urls, seen, pathname, category.updated_at || category.created_at);
  });

  const models = await get3dModelUrls();
  models.forEach(model => {
    const categorySlug = model.category_slug || '3d-models';
    addUrl(
      urls,
      seen,
      `/3d-models/${categorySlug}/${model.slug}`,
      model.updated_at || model.created_at
    );
  });

  const patterns = await getPatterns();
  patterns.forEach(pattern => {
    addUrl(urls, seen, `/patterns/item/${pattern.id}`, pattern.updated_at || pattern.created_at);
  });

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
